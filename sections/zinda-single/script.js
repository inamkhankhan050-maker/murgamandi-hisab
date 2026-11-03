/* ============================================================
   Zinda Single Customer Bill — UI layer.
   All maths goes through window.BillingCalc (calc.js, the exact
   engine from the original Chicken Calculator). This file only
   reads inputs, renders, saves and prints.
   ============================================================ */
(function () {
  'use strict';
  var C = window.BillingCalc;
  if (!C) { document.body.insertAdjacentHTML('afterbegin', '<p style="padding:16px;color:#B91C1C">Calculation engine failed to load. Please refresh.</p>'); return; }

  var KEY = 'mmh.zindaSingle.v1';
  var FIRM_KEY = 'mmh.zindaSingle.firm';
  var HANDOFF_KEY = 'mmh.zindaDaily.inbox';   // read by Zinda Daily Entry on open
  var $ = function (id) { return document.getElementById(id); };
  var sF = { name: 'sName', pieces: 'sPieces', kg: 'sKgIn', jaal: 'sJaal', rate: 'sRate', oldBal: 'sOld', cash: 'sCash', online: 'sOnline' };
  var labourManual = false;

  // ---------- Storage (this device only) ----------
  var storage = (function () {
    try { var k = '__mmh_t'; window.localStorage.setItem(k, '1'); window.localStorage.removeItem(k); return window.localStorage; }
    catch (e) { return null; }
  })();
  function save() {
    if (!storage) return;
    try {
      storage.setItem(KEY, JSON.stringify({ name: $('sName').value, pieces: $('sPieces').value, kg: $('sKgIn').value, jaal: $('sJaal').value, rate: $('sRate').value, oldBal: $('sOld').value, cash: $('sCash').value, online: $('sOnline').value, labour: labourManual ? $('sLabour').value : '', savedAt: new Date().toISOString() }));
      $('saveText').textContent = 'Saved on this device'; $('saveState').classList.remove('off');
    } catch (e) { $('saveText').textContent = 'Not saved (storage full)'; $('saveState').classList.add('off'); }
  }
  function load() {
    if (!storage) return null;
    try { var d = JSON.parse(storage.getItem(KEY) || 'null'); return d && typeof d === 'object' ? d : null; } catch (e) { return null; }
  }
  function str(v) { return typeof v === 'string' ? v.slice(0, 80) : ''; }

  // ---------- Helpers ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }
  function rc(k, v) { return '<div class="rc"><span class="k">' + k + '</span><span class="val">' + v + '</span></div>'; }
  function m2(p) { return C.formatINR(p, { decimals: p % 100 ? 2 : 0 }); }
  function dueText(p) { return p < 0 ? 'Adv ' + C.formatINR(-p, { decimals: p % 100 ? 2 : 0 }) : C.formatINR(p, { decimals: p % 100 ? 2 : 0 }); }
  function todayText() { return new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  var toastT;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2600); }
  function confirmDlg(title, text, yesLabel, onYes) {
    $('dlgT').textContent = title; $('dlgP').textContent = text; $('dlgYes').textContent = yesLabel;
    var d = $('dlg'); d.classList.add('show'); $('dlgNo').focus();
    var close = function () { d.classList.remove('show'); $('dlgYes').onclick = $('dlgNo').onclick = null; };
    $('dlgNo').onclick = close;
    $('dlgYes').onclick = function () { close(); onYes(); };
  }

  // ---------- Calculation (engine from the original repo) ----------
  function singleRow() { return { name: $('sName').value || 'x', pieces: $('sPieces').value, kg: $('sKgIn').value, jaal: $('sJaal').value, rate: $('sRate').value, oldBal: $('sOld').value, cash: $('sCash').value, online: $('sOnline').value }; }
  // Manual labour (original rule, Nov 2 2026): a typed value replaces auto labour as the final labour charge, no round-off.
  function manualLabour() { if (!labourManual) return null; var s = ($('sLabour').value || '').trim(); if (s === '') return null; var v = C.parseScaled(s, 2); return v === null || isNaN(v) ? NaN : v; }
  function calcSingle(v) {
    var r = C.calculate(v.pieces, v.netGrams, v.ratePaise), m = manualLabour();
    if (m === null || isNaN(m)) return r;
    var o = {}; Object.keys(r).forEach(function (k) { o[k] = r[k]; });
    o.manual = true; o.labourAdjusted = m; o.adjustment = 0; o.warning = null; o.final = o.basic + o.samiti + m;
    return o;
  }
  function labNote(v, r) { return r.manual ? 'manual (auto ' + C.formatINR(r.labourOriginal, { decimals: 2 }) + ')' : C.labourRuleText(v.pieces, r.labourDivisor) + ' + round-off ' + C.formatINR(r.adjustment, { decimals: 2 }); }
  function ledgerHTML(L) {
    if (!L || !L.any || !L.ok) return '';
    return rc('Pichla Balance (B)', '+ ' + m2(L.oldBal)) + rc('Total Due<small>aaj ka bill + pichla</small>', m2(L.due + L.received)) +
      rc('Rec Cash', '− ' + m2(L.cash)) + rc('Rec Online', '− ' + m2(L.online)) +
      '<div class="rc big due-r"><span class="k">Balance Baaki</span><span class="val">' + dueText(L.due) + '</span></div>';
  }

  // ---------- Render ----------
  function render() {
    var row = singleRow(), v = C.validateRow(row), out = $('sOut');
    ['pieces', 'kg', 'jaal', 'rate'].forEach(function (f) { $(sF[f]).classList.toggle('err', !!v.errors[f]); });
    var sl = C.ledger(row, 0);
    ['oldBal', 'cash', 'online'].forEach(function (f) { $(sF[f]).classList.toggle('err', !!sl.errors[f]); });
    var errs = Object.values(v.errors).concat(Object.values(sl.errors));
    var nm = $('sName').value.trim();
    var h = '<h3>Bill' + (nm ? ' · ' + esc(nm) : '') + '</h3>';
    if (!v.ok) {
      $('sErr').textContent = errs.join(' · ');
      if (!labourManual && document.activeElement !== $('sLabour')) $('sLabour').value = '';
      out.innerHTML = h + '<p class="empty">Pieces, total KG and rate bharte hi bill yahan dikhega.</p>'; return;
    }
    var lm = manualLabour(); $('sLabour').classList.toggle('err', isNaN(lm));
    if (isNaN(lm)) errs.push('Labour sahi bhariye (0 or more, max 2 decimals)');
    $('sErr').textContent = errs.join(' · ');
    var r = calcSingle(v);
    if (!labourManual && document.activeElement !== $('sLabour')) $('sLabour').value = (r.labourAdjusted / 100).toFixed(2);
    var gkg = C.formatKg(v.grams), kg = C.formatKg(v.netGrams), rate = C.formatINR(v.ratePaise);
    var q = function (k, val) { return '<div><span>' + k + '</span><b>' + val + '</b></div>'; };
    h += '<div class="sq">' + q('Pieces', C.formatInt(v.pieces)) + q('Total KG', gkg) + (v.jaalGrams ? q('Jaal', '− ' + C.formatKg(v.jaalGrams)) + q('Net KG', kg) : '') +
      q('Average', (C.averageKg(v.netGrams, v.pieces) || '—') + ' kg') + q('Rate', rate) + '</div>';
    var L = C.ledger(row, r.final), led = ledgerHTML(L);
    h += '<div class="s2' + (led ? '' : ' one') + '"><div class="s2a">' +
      rc('Basic Amount<small>' + kg + ' kg × ' + rate + '</small>', C.formatINR(r.basic)) +
      rc('Samiti Charge<small>1%, rounded down</small>', C.formatINR(r.samiti)) +
      rc('Labour Charge<small>' + (r.manual ? labNote(v, r) : C.labourRuleText(v.pieces, r.labourDivisor) + ' = ' + C.formatINR(r.labourOriginal, { decimals: 2 }) + ' + ' + C.formatINR(r.adjustment, { decimals: 2 }) + ' round-off') + '</small>', C.formatINR(r.labourAdjusted, { decimals: 2 })) +
      '<div class="rc big"><span class="k">Aaj ka Bill</span><span class="val" id="sFinal">' + (r.final == null ? '—' : C.formatINR(r.final, { decimals: r.final % 100 ? 2 : 0 })) + '</span></div>' +
      (r.final != null ? '<div class="words">' + esc(C.amountInWords(r.final)) + '</div>' : '') +
      (r.warning ? '<div class="warn">' + esc(r.warning) + '</div>' : '') +
      '</div>' + (led ? '<div class="s2b">' + led + '</div>' : '') + '</div>';
    out.innerHTML = h;
  }

  // ---------- Print receipt ----------
  function buildReceipt() {
    var row = singleRow(), v = C.validateRow(row);
    if (!v.ok) return false;
    var r = calcSingle(v), L = C.ledger(row, r.final);
    var nm = $('sName').value.trim(), firm = $('sFirm').value.trim();
    var t = function (k, val, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + k + '</td><td>' + val + '</td></tr>'; };
    var h = '<div class="rh"><div><b>Ghazipur Murga Mandi</b>' + (firm ? '<i>' + esc(firm) + '</i>' : '') + '<span>Wholesale Bill</span></div><div class="rd">' + esc(todayText()) + '</div></div>' +
      '<div class="rn">' + (nm ? esc(nm) : 'Customer') + '</div>' +
      '<div class="rq">' +
        '<div><span>Pieces</span><b>' + C.formatInt(v.pieces) + '</b></div>' +
        '<div><span>Total KG</span><b>' + C.formatKg(v.grams) + '</b></div>' +
        (v.jaalGrams ? '<div><span>Jaal KG</span><b>− ' + C.formatKg(v.jaalGrams) + '</b></div><div><span>Net KG</span><b>' + C.formatKg(v.netGrams) + '</b></div>' : '') +
        '<div><span>Average</span><b>' + C.averageKg(v.netGrams, v.pieces) + ' kg</b></div>' +
        '<div><span>Rate / KG</span><b>' + C.formatINR(v.ratePaise) + '</b></div>' +
      '</div>' +
      '<table class="rt">' +
        t('Basic Amount <small>' + C.formatKg(v.netGrams) + ' kg × ' + C.formatINR(v.ratePaise) + '</small>', C.formatINR(r.basic)) +
        t('Samiti <small>1%</small>', C.formatINR(r.samiti)) +
        t('Labour <small>' + labNote(v, r) + '</small>', C.formatINR(r.labourAdjusted, { decimals: 2 })) +
        t('Aaj ka Bill', r.final == null ? '—' : C.formatINR(r.final, { decimals: r.final % 100 ? 2 : 0 }), 'tot') +
      '</table>';
    if (L.any && L.ok) {
      h += '<table class="rt led">' + t('Pichla Balance (B)', '+ ' + m2(L.oldBal)) + t('Total Due', m2(L.due + L.received), 'sub') +
        t('Rec Cash', '− ' + m2(L.cash)) + t('Rec Online', '− ' + m2(L.online)) + t('Balance Baaki', dueText(L.due), 'tot due') + '</table>';
    }
    if (r.final != null) h += '<div class="rw">' + esc(C.amountInWords(L.any && L.ok ? Math.max(L.due, 0) : r.final)) + '</div>';
    h += '<div class="rf">Dhanyavaad · ' + (firm ? esc(firm) + ', ' : '') + 'Ghazipur Murga Mandi</div>';
    $('sReceipt').innerHTML = h;
    return true;
  }
  function doPrint() {
    if (!buildReceipt()) { toast('Pehle pieces, KG aur rate sahi bhariye'); return; }
    document.body.classList.add('print-rcpt');
    var done = function () { document.body.classList.remove('print-rcpt'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    try { window.print(); } catch (e) { toast('Printing is blocked in this window.'); }
    setTimeout(function () { if (!window.matchMedia || !window.matchMedia('print').matches) done(); }, 1500);
  }

  // ---------- WhatsApp PDF ----------
  function receiptModel() {
    var row = singleRow(), v = C.validateRow(row);
    if (!v.ok) return null;
    var r = calcSingle(v), L = C.ledger(row, r.final);
    var m = { firm: $('sFirm').value.trim(), name: $('sName').value.trim() || 'Customer', date: todayText(), boxes: [], rows: [], led: [] };
    m.boxes.push(['PIECES', C.formatInt(v.pieces)], ['TOTAL KG', C.formatKg(v.grams)]);
    if (v.jaalGrams) m.boxes.push(['JAAL KG', '− ' + C.formatKg(v.jaalGrams)], ['NET KG', C.formatKg(v.netGrams)]);
    m.boxes.push(['AVERAGE', C.averageKg(v.netGrams, v.pieces) + ' kg'], ['RATE / KG', C.formatINR(v.ratePaise)]);
    m.rows.push(['Basic Amount', C.formatKg(v.netGrams) + ' kg × ' + C.formatINR(v.ratePaise), C.formatINR(r.basic)]);
    m.rows.push(['Samiti', '1%', C.formatINR(r.samiti)]);
    m.rows.push(['Labour', labNote(v, r), C.formatINR(r.labourAdjusted, { decimals: 2 })]);
    m.billText = r.final == null ? '—' : C.formatINR(r.final, { decimals: r.final % 100 ? 2 : 0 });
    if (L.any && L.ok) {
      m.led = [['Pichla Balance (B)', '+ ' + m2(L.oldBal)], ['Total Due', m2(L.due + L.received), 1], ['Rec Cash', '− ' + m2(L.cash)], ['Rec Online', '− ' + m2(L.online)]];
      m.balText = dueText(L.due); m.balPaise = L.due;
    }
    m.words = r.final == null ? '' : C.amountInWords(L.any && L.ok ? Math.max(L.due, 0) : r.final);
    return m;
  }
  function shareReceipt() {
    var m = receiptModel();
    if (!m) { toast('Pehle pieces, KG aur rate sahi bhariye'); return; }
    window.ZindaShare.share(window.ZindaShare.receiptCanvas(m), 'Bill ' + m.name + ' ' + m.date, 'Bill · ' + m.date);
  }

  // ---------- Send to Zinda Daily Entry (queued, picked up when that page opens) ----------
  function toDaily() {
    var v = C.validateRow(singleRow());
    if (!v.ok) { toast('Pehle pieces, KG aur rate sahi bhariye'); return; }
    if (!storage) { toast('Storage not available in this window'); return; }
    var data = { name: $('sName').value.trim() || 'Customer', pieces: $('sPieces').value.trim(), kg: $('sKgIn').value.trim(), jaal: $('sJaal').value.trim(), rate: $('sRate').value.trim(), oldBal: $('sOld').value.trim(), cash: $('sCash').value.trim(), online: $('sOnline').value.trim() };
    var inbox = [];
    try { inbox = JSON.parse(storage.getItem(HANDOFF_KEY) || '[]'); if (!Array.isArray(inbox)) inbox = []; } catch (e) { inbox = []; }
    if (inbox.length >= 100) { toast('Daily inbox is full. Open Zinda Daily Entry first.'); return; }
    inbox.push(data);
    try { storage.setItem(HANDOFF_KEY, JSON.stringify(inbox)); toast(data.name + ' will be added to Zinda Daily Entry'); } catch (e) { toast('Could not save. Storage full.'); }
  }

  function clearBill() {
    ['sName', 'sPieces', 'sKgIn', 'sJaal', 'sRate', 'sOld', 'sCash', 'sOnline', 'sLabour'].forEach(function (id) { $(id).value = ''; });
    labourManual = false; render(); save(); $('sPieces').focus();
  }

  // ---------- Init ----------
  function init() {
    $('todayChip').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    if (!storage) { $('storageNotice').hidden = false; $('saveState').classList.add('off'); $('saveText').textContent = 'Not saved'; }
    var s = load();
    if (s) { Object.keys(sF).forEach(function (f) { $(sF[f]).value = str(s[f]); }); $('sLabour').value = str(s.labour); labourManual = !!str(s.labour); }
    try { $('sFirm').value = (storage && storage.getItem(FIRM_KEY)) || ''; } catch (e) {}
    $('sFirm').addEventListener('input', function () { if (storage) try { storage.setItem(FIRM_KEY, $('sFirm').value); } catch (e) {} });
    $('sLabour').addEventListener('input', function () { labourManual = $('sLabour').value.trim() !== ''; render(); save(); });
    $('sLabour').addEventListener('blur', function () { if (!labourManual) render(); });
    Object.keys(sF).forEach(function (f) { $(sF[f]).addEventListener('input', function () { render(); save(); }); });
    $('sClear').onclick = function () { confirmDlg('Clear this bill?', 'All fields of this bill will be emptied.', 'Clear', clearBill); };
    $('sPrint').onclick = doPrint;
    $('sShare').onclick = shareReceipt;
    $('sToDaily').onclick = toDaily;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { $('dlg').classList.remove('show'); $('shareDlg').classList.remove('show'); } });
    window.ZindaShare.init(toast);
    window.ZindaKeypad.init();
    render();
  }
  try { init(); } catch (e) { toast('Something went wrong: ' + e.message); if (window.console) console.error(e); }

  // Exposed for automated tests only
  window.__zindaSingle = { render: render, calcSingle: calcSingle, receiptModel: receiptModel };
})();
