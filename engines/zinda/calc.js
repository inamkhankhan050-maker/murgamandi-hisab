/* ============================================================
   Billing calculation engine — pure functions, no DOM.
   All money is handled in INTEGER PAISE to avoid float errors.
   Weight is handled in integer GRAMS (up to 3 decimals of kg).
   ============================================================ */
(function (root) {
  'use strict';

  var LABOUR_PAISE_X10_PER_PIECE = 625; // ₹0.625 = 62.5 paise  -> stored x10
  var SAMITI_PERCENT = 1;                // 1%, floored to whole rupee
  var ROUND_TO_PAISE = 1000;             // final must be a multiple of ₹10
  var MAX_ADJUSTMENT_PAISE = 999;        // ₹9.99

  var OPS = /[+\-*\/x×÷−]/i;
  /** Evaluate a simple sum like "50+60.5+94" or "20×4.5" exactly. Returns {n,d} (fraction) or null. */
  function evalFrac(str) {
    var s = String(str).replace(/[\s,]/g, '').replace(/−/g, '-').replace(/[x×]/gi, '*').replace(/÷/g, '/');
    if (!s || !/^[\d.+\-*\/]+$/.test(s)) return null;
    var i = 0;
    function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a || 1; }
    function mk(n, d) { if (d < 0) { n = -n; d = -d; } var g = gcd(n, d); return { n: n / g, d: d / g }; }
    function num() {
      var m = /^\d*\.?\d+|^\d+\.?/.exec(s.slice(i)); if (!m) return null;
      i += m[0].length; var t = m[0].split('.'), f = t[1] || '';
      return mk(parseInt((t[0] || '0') + f, 10), Math.pow(10, f.length));
    }
    function factor() { if (s[i] === '-') { i++; var f = factor(); return f && mk(-f.n, f.d); } return num(); }
    function term() {
      var a = factor(); if (!a) return null;
      while (s[i] === '*' || s[i] === '/') {
        var op = s[i++], b = factor(); if (!b) return null;
        if (op === '*') a = mk(a.n * b.n, a.d * b.d); else { if (b.n === 0) return null; a = mk(a.n * b.d, a.d * b.n); }
      }
      return a;
    }
    var a = term(); if (!a) return null;
    while (s[i] === '+' || s[i] === '-') {
      var op = s[i++], b = term(); if (!b) return null;
      a = mk(op === '+' ? a.n * b.d + b.n * a.d : a.n * b.d - b.n * a.d, a.d * b.d);
    }
    if (i !== s.length || !Number.isSafeInteger(a.n) || !Number.isSafeInteger(a.d)) return null;
    return a;
  }
  /** Expression -> plain decimal string rounded half-up to `places` (trailing zeros trimmed), or null. */
  function evalExpr(str, places) {
    var f = evalFrac(str); if (!f) return null;
    var sc = Math.pow(10, places == null ? 3 : places), neg = f.n < 0, n = Math.abs(f.n);
    var v = Math.floor((n * sc * 2 + f.d) / (2 * f.d));
    var w = Math.floor(v / sc), fr = String(v % sc); while (fr.length < String(sc).length - 1) fr = '0' + fr;
    fr = fr.replace(/0+$/, '');
    return (neg ? '-' : '') + w + (fr ? '.' + fr : '');
  }
  function hasExpr(s) { s = String(s == null ? '' : s).trim(); return OPS.test(s.replace(/^[-−]/, '')) ; }

  /** Parse a decimal string into an integer scaled by 10^places. Returns null if invalid. */
  function parseScaled(input, places) {
    if (input === null || input === undefined) return null;
    var s = String(input).trim().replace(/,/g, '');
    if (s === '') return null;
    if (hasExpr(s)) { var e = evalExpr(s, places); if (e === null || e[0] === '-') return NaN; s = e; }
    if (!/^\d*\.?\d*$/.test(s) || s === '.') return NaN; // rejects negatives, letters
    var parts = s.split('.');
    var whole = parts[0] || '0';
    var frac = parts[1] || '';
    if (frac.length > places) return NaN; // too many decimals
    while (frac.length < places) frac += '0';
    var n = parseInt(whole, 10) * Math.pow(10, places) + (frac ? parseInt(frac, 10) : 0);
    return Number.isSafeInteger(n) ? n : NaN;
  }

  /** Validate raw row inputs. Returns {ok, status, errors, pieces, grams, ratePaise}. */
  function validateRow(row) {
    var errors = {};
    var name = (row.name || '').trim();
    var piecesRaw = String(row.pieces == null ? '' : row.pieces).trim();
    if (hasExpr(piecesRaw)) { var pe = evalExpr(piecesRaw, 3); piecesRaw = pe === null ? 'x' : pe; }
    var pieces = piecesRaw === '' ? null : (/^\d+$/.test(piecesRaw) ? parseInt(piecesRaw, 10) : NaN);
    var grams = parseScaled(row.kg, 3);
    var ratePaise = parseScaled(row.rate, 2);
    var jaalRaw = parseScaled(row.jaal, 3);
    var jaalGrams = jaalRaw === null ? 0 : jaalRaw;

    if (pieces !== null && (isNaN(pieces) || pieces < 0 || pieces > 1000000)) errors.pieces = 'Whole number of pieces, 0 or more';
    if (grams !== null && (isNaN(grams) || grams <= 0)) errors.kg = 'Weight must be more than 0 (max 3 decimals)';
    if (ratePaise !== null && (isNaN(ratePaise) || ratePaise <= 0)) errors.rate = 'Rate must be more than 0 (max 2 decimals)';
    if (isNaN(jaalGrams) || jaalGrams < 0) errors.jaal = 'Jaal weight must be 0 or more (max 3 decimals)';
    else if (grams > 0 && jaalGrams >= grams) errors.jaal = 'Jaal weight must be less than Total KG';

    var isEmpty = !name && pieces === null && grams === null && ratePaise === null;
    var hasErrors = Object.keys(errors).length > 0;
    var complete = !!name && pieces !== null && grams !== null && ratePaise !== null;

    var status = isEmpty ? 'empty' : hasErrors ? 'invalid' : complete ? 'valid' : 'incomplete';
    var netGrams = (grams > 0 && !errors.jaal) ? grams - jaalGrams : null;
    return { ok: status === 'valid', status: status, errors: errors, pieces: pieces, grams: grams, jaalGrams: isNaN(jaalGrams) ? 0 : jaalGrams, netGrams: netGrams, ratePaise: ratePaise };
  }

  /** Core formula. Inputs are already-validated integers. Returns all figures in paise. */
  function calculate(pieces, grams, ratePaise) {
    // Basic = kg × rate. grams*ratePaise/1000, rounded half-up to the paisa.
    var basicNum = grams * ratePaise;
    var basic = Math.floor((basicNum + 500) / 1000);

    // Samiti = FLOOR(basic × 1%) to the whole rupee.
    var samiti = Math.floor(basic * SAMITI_PERCENT / 100 / 100) * 100;

    // Labour slab by average bird size (net kg ÷ pieces, 2 decimals half-up), user rule Oct 31 2026:
    //   avg < 2.50 kg -> pieces ÷ 9 × ₹5;  2.50–2.99 -> ÷ 8 × ₹5;  3.00 and above -> ÷ 7 × ₹5.  Kept to paise (half-up).
    var divisor = labourDivisor(grams, pieces);
    var labourOriginal = Math.floor((pieces * 500 * 2 + divisor) / (2 * divisor));

    var beforeAdj = basic + samiti + labourOriginal;
    var adjustment = (ROUND_TO_PAISE - (beforeAdj % ROUND_TO_PAISE)) % ROUND_TO_PAISE;

    var warning = null;
    if (adjustment < 0 || adjustment > MAX_ADJUSTMENT_PAISE) {
      warning = 'Labour adjustment out of range (₹0.00–₹9.99). Final amount not calculated.';
    }
    var labourAdjusted = labourOriginal + adjustment;
    var final = basic + samiti + labourAdjusted;
    if (!warning && final % ROUND_TO_PAISE !== 0) warning = 'Final amount is not a multiple of ₹10.';

    return {
      basic: basic,
      samiti: samiti,
      labourOriginal: labourOriginal,
      labourDivisor: divisor,
      beforeAdjustment: beforeAdj,
      adjustment: adjustment,
      labourAdjusted: labourAdjusted,
      final: warning ? null : final,
      warning: warning
    };
  }

  /** Validate + calculate one row. */
  function computeRow(row) {
    var v = validateRow(row);
    if (!v.ok) return { status: v.status, errors: v.errors, result: null };
    var r = calculate(v.pieces, v.netGrams, v.ratePaise);
    return { status: r.warning ? 'warning' : 'valid', errors: v.errors, result: r, pieces: v.pieces, grams: v.grams, jaalGrams: v.jaalGrams, netGrams: v.netGrams, ratePaise: v.ratePaise };
  }

  /** Grand totals from all valid rows. Grand total = sum of row finals, always. */
  function computeTotals(rows) {
    var t = { customers: 0, pieces: 0, grams: 0, jaal: 0, net: 0, basic: 0, samiti: 0, labour: 0, grand: 0, incomplete: 0, invalid: 0 };
    rows.forEach(function (row) {
      var c = computeRow(row);
      if (c.status === 'valid') {
        t.customers += 1;
        t.pieces += c.pieces;
        t.grams += c.grams;
        t.jaal += c.jaalGrams;
        t.net += c.netGrams;
        t.basic += c.result.basic;
        t.samiti += c.result.samiti;
        t.labour += c.result.labourAdjusted;
        t.grand += c.result.final;
      } else if (c.status === 'incomplete') t.incomplete += 1;
      else if (c.status === 'invalid' || c.status === 'warning') t.invalid += 1;
    });
    return t;
  }

  function labourDivisor(grams, pieces) {
    var hund = pieces > 0 ? Math.floor((grams * 100 + pieces * 500) / (pieces * 1000)) : 0;
    return hund < 250 ? 9 : hund < 300 ? 8 : 7;
  }
  function labourRuleText(pieces, divisor) { return groupIndian(String(pieces)) + ' ÷ ' + divisor + ' × ₹5'; }
  /** Average bird size: kg per piece, 2 decimals (half-up). null when not computable. */
  function averageKg(grams, pieces) {
    if (!(pieces > 0) || !(grams > 0)) return null;
    var hund = Math.floor((grams * 100 + pieces * 500) / (pieces * 1000));
    return (Math.floor(hund / 100)) + '.' + ('0' + (hund % 100)).slice(-2);
  }

  /** Customer ledger: previous balance + today's bill − cash − online. All paise. */
  function ledger(row, finalPaise) {
    var errors = {}, out = {};
    ['oldBal', 'cash', 'online'].forEach(function (f) {
      var v = parseScaled(row[f], 2);
      if (v === null) v = 0;
      if (isNaN(v) || v < 0) { errors[f] = 'Amount must be 0 or more (max 2 decimals)'; v = 0; }
      out[f] = v;
    });
    var received = out.cash + out.online;
    var due = out.oldBal + (finalPaise || 0) - received;
    var any = ['oldBal', 'cash', 'online'].some(function (f) { return String(row[f] == null ? '' : row[f]).trim() !== ''; });
    return { oldBal: out.oldBal, cash: out.cash, online: out.online, received: received, due: due, any: any, errors: errors, ok: Object.keys(errors).length === 0 };
  }

  // ---------- Formatting (Indian system) ----------
  function groupIndian(intStr) {
    if (intStr.length <= 3) return intStr;
    var last3 = intStr.slice(-3);
    var rest = intStr.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return rest + ',' + last3;
  }
  /** ₹ format from paise. opts.decimals: 'auto' (show paise only if non-zero) | 2 */
  function formatINR(paise, opts) {
    if (paise === null || paise === undefined) return '—';
    opts = opts || {};
    var neg = paise < 0; var p = Math.abs(paise);
    var rupees = Math.floor(p / 100); var ps = p % 100;
    var showDec = opts.decimals === 2 || (opts.decimals !== 0 && ps !== 0);
    var s = '₹' + groupIndian(String(rupees)) + (showDec ? '.' + (ps < 10 ? '0' : '') + ps : '');
    return (neg ? '−' : '') + s;
  }
  function formatKg(grams) {
    if (grams === null || grams === undefined) return '—';
    var whole = Math.floor(grams / 1000); var g = grams % 1000;
    var dec = g ? ('.' + String(g + 1000).slice(1)).replace(/0+$/, '') : '';
    return groupIndian(String(whole)) + dec;
  }
  function formatInt(n) { return groupIndian(String(n)); }
  function paiseToPlain(paise) { // for CSV/Excel: 17580.00
    var neg = paise < 0; var p = Math.abs(paise);
    return (neg ? '-' : '') + Math.floor(p / 100) + '.' + String(p % 100 + 100).slice(1);
  }

  // ---------- Amount in words (Indian) ----------
  var ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  var TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function two(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''); }
  function three(n) { var h = Math.floor(n / 100), r = n % 100; return (h ? ONES[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? two(r) : ''); }
  function numberToWordsIndian(n) {
    if (n === 0) return 'Zero';
    var parts = [];
    var crore = Math.floor(n / 10000000); n %= 10000000;
    var lakh = Math.floor(n / 100000); n %= 100000;
    var thousand = Math.floor(n / 1000); n %= 1000;
    if (crore) parts.push((crore > 999 ? numberToWordsIndian(crore) : three(crore)) + ' Crore');
    if (lakh) parts.push(two(lakh) + ' Lakh');
    if (thousand) parts.push(two(thousand) + ' Thousand');
    if (n) parts.push(three(n));
    return parts.join(' ');
  }
  function amountInWords(paise) {
    var r = Math.floor(paise / 100), p = paise % 100;
    return numberToWordsIndian(r) + ' Rupees' + (p ? ' and ' + two(p) + ' Paise' : '') + ' Only';
  }

  var api = {
    parseScaled: parseScaled, evalExpr: evalExpr, hasExpr: hasExpr, validateRow: validateRow, calculate: calculate,
    computeRow: computeRow, computeTotals: computeTotals, averageKg: averageKg, ledger: ledger, labourDivisor: labourDivisor, labourRuleText: labourRuleText,
    formatINR: formatINR, formatKg: formatKg, formatInt: formatInt, paiseToPlain: paiseToPlain,
    amountInWords: amountInWords, groupIndian: groupIndian
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BillingCalc = api;
})(typeof window !== 'undefined' ? window : this);
