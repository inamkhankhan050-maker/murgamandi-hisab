/* ============================================================
   Katai calculation engine — independent of the Zinda engine.
   Pure functions, no DOM. Money in integer PAISE, quantity in
   integer thousandths (grams for KG, 1/1000 piece never used:
   pieces are whole numbers). No labour, samiti, jaal or
   round-off: only what the business rules define today.

   Line amount  = Quantity × Rate   (rounded half-up to the paisa)
   Bill total   = sum of line amounts
   Balance      = Previous Balance + Bill total − Cash − Online
   ============================================================ */
(function (root, NS) {
  'use strict';

  var PRODUCTS = [
    { id: 'thigh', name: 'Thigh' }, { id: 'breast', name: 'Breast' }, { id: 'tangri', name: 'Tangri' },
    { id: 'wings', name: 'Wings' }, { id: 'fullleg', name: 'Full Leg' }, { id: 'haddi', name: 'Haddi' },
    { id: 'pota', name: 'Pota' }, { id: 'panja', name: 'Panja' }, { id: 'tandoori', name: 'Tandoori' },
    { id: 'dress', name: 'Dress Tandoori' }
  ];
  var UNITS = { kg: { label: 'KG', places: 3 }, pcs: { label: 'Pcs', places: 0 } };
  var MAX_QTY = 1e9, MAX_MONEY = 1e13; // keeps every product inside safe integers

  /** "12.5" -> 12500 (places=3). '' -> null. Bad/negative/too many decimals -> NaN. */
  function parseScaled(input, places) {
    if (input === null || input === undefined) return null;
    var s = String(input).trim().replace(/,/g, '');
    if (s === '') return null;
    if (!/^\d*\.?\d*$/.test(s) || s === '.') return NaN;
    var parts = s.split('.'), whole = parts[0] || '0', frac = parts[1] || '';
    if (frac.length > places) return NaN;
    while (frac.length < places) frac += '0';
    var n = parseInt(whole, 10) * Math.pow(10, places) + (frac ? parseInt(frac, 10) : 0);
    return Number.isSafeInteger(n) ? n : NaN;
  }

  /** One product line. line = {unit, qty, rate}. Returns {status, errors, qty, ratePaise, amount}. */
  function computeLine(line) {
    line = line || {};
    var unit = UNITS[line.unit] ? line.unit : 'kg';
    var errors = {};
    var qty = parseScaled(line.qty, 3);           // always thousandths internally
    var rate = parseScaled(line.rate, 2);
    if (qty !== null) {
      if (isNaN(qty) || qty <= 0 || qty > MAX_QTY * 1000) errors.qty = unit === 'pcs' ? 'Pieces must be a whole number above 0' : 'Quantity must be more than 0 (max 3 decimals)';
      else if (unit === 'pcs' && qty % 1000 !== 0) errors.qty = 'Pieces must be a whole number above 0';
    }
    if (rate !== null && (isNaN(rate) || rate <= 0 || rate > MAX_MONEY)) errors.rate = 'Rate must be more than 0 (max 2 decimals)';
    // A rate with no quantity means the product was not taken (rates may be pre-filled from the day's rate list).
    var empty = qty === null && !errors.rate;
    var bad = Object.keys(errors).length > 0;
    var complete = qty !== null && rate !== null;
    var status = empty ? 'empty' : bad ? 'invalid' : complete ? 'valid' : 'incomplete';
    var amount = null;
    if (status === 'valid') amount = Math.floor((qty * rate + 500) / 1000); // half-up to the paisa
    if (amount !== null && !Number.isSafeInteger(amount)) { status = 'invalid'; errors.qty = 'Amount too large'; amount = null; }
    return { status: status, unit: unit, errors: errors, qty: isNaN(qty) ? null : qty, ratePaise: isNaN(rate) ? null : rate, amount: amount };
  }

  /** Whole bill. lines = {productId: line}. */
  function computeBill(lines) {
    var out = { lines: {}, total: 0, items: 0, incomplete: 0, invalid: 0, kg: 0, pcs: 0 };
    PRODUCTS.forEach(function (p) {
      var c = computeLine(lines && lines[p.id]);
      out.lines[p.id] = c;
      if (c.status === 'valid') { out.total += c.amount; out.items++; if (c.unit === 'pcs') out.pcs += c.qty / 1000; else out.kg += c.qty; }
      else if (c.status === 'incomplete') out.incomplete++;
      else if (c.status === 'invalid') out.invalid++;
    });
    return out;
  }

  /** Previous balance + bill − cash − online. */
  function ledger(led, billPaise) {
    led = led || {};
    var errors = {}, v = {};
    ['oldBal', 'cash', 'online'].forEach(function (f) {
      var x = parseScaled(led[f], 2);
      if (x === null) x = 0;
      if (isNaN(x) || x < 0 || x > MAX_MONEY) { errors[f] = 'Amount must be 0 or more (max 2 decimals)'; x = 0; }
      v[f] = x;
    });
    var any = ['oldBal', 'cash', 'online'].some(function (f) { return String(led[f] == null ? '' : led[f]).trim() !== ''; });
    var received = v.cash + v.online;
    return { oldBal: v.oldBal, cash: v.cash, online: v.online, received: received, totalDue: v.oldBal + (billPaise || 0), balance: v.oldBal + (billPaise || 0) - received, any: any, errors: errors, ok: Object.keys(errors).length === 0 };
  }

  // ---------- Formatting (Indian grouping) ----------
  function group(intStr) {
    if (intStr.length <= 3) return intStr;
    return intStr.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + intStr.slice(-3);
  }
  function money(paise) {
    if (paise === null || paise === undefined) return '—';
    var neg = paise < 0, p = Math.abs(paise), r = Math.floor(p / 100), ps = p % 100;
    return (neg ? '−' : '') + '₹' + group(String(r)) + (ps ? '.' + (ps < 10 ? '0' : '') + ps : '');
  }
  function balanceText(paise) { return paise < 0 ? 'Adv ' + money(-paise) : money(paise); }
  function qtyText(thousandths, unit) {
    if (thousandths === null || thousandths === undefined) return '—';
    if (unit === 'pcs') return group(String(Math.round(thousandths / 1000))) + ' pcs';
    var w = Math.floor(thousandths / 1000), g = thousandths % 1000;
    return group(String(w)) + (g ? ('.' + String(g + 1000).slice(1)).replace(/0+$/, '') : '') + ' kg';
  }
  function plain(paise) { var neg = paise < 0, p = Math.abs(paise); return (neg ? '-' : '') + Math.floor(p / 100) + '.' + String(p % 100 + 100).slice(1); }
  function plainQty(thousandths) { var w = Math.floor(thousandths / 1000), g = thousandths % 1000; return w + (g ? ('.' + String(g + 1000).slice(1)).replace(/0+$/, '') : ''); }

  var ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  var TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function two(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''); }
  function three(n) { var h = Math.floor(n / 100), r = n % 100; return (h ? ONES[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? two(r) : ''); }
  function words(n) {
    if (n === 0) return 'Zero';
    var parts = [], cr = Math.floor(n / 10000000); n %= 10000000;
    var lk = Math.floor(n / 100000); n %= 100000; var th = Math.floor(n / 1000); n %= 1000;
    if (cr) parts.push((cr > 999 ? words(cr) : three(cr)) + ' Crore');
    if (lk) parts.push(two(lk) + ' Lakh'); if (th) parts.push(two(th) + ' Thousand'); if (n) parts.push(three(n));
    return parts.join(' ');
  }
  function amountInWords(paise) { paise = Math.max(0, paise); var r = Math.floor(paise / 100), p = paise % 100; return words(r) + ' Rupees' + (p ? ' and ' + two(p) + ' Paise' : '') + ' Only'; }

  var api = { PRODUCTS: PRODUCTS, UNITS: UNITS, parseScaled: parseScaled, computeLine: computeLine, computeBill: computeBill, ledger: ledger,
    money: money, balanceText: balanceText, qtyText: qtyText, plain: plain, plainQty: plainQty, amountInWords: amountInWords };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root[NS] = api;
})(typeof window !== 'undefined' ? window : this, 'KataiCalc');
