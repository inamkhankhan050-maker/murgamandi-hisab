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
  var D = window.MMHData || null, U = D && D.util;   // shared records (Statements & Reports read these)
  var savedId = null, billDate = '';

  // ---------- Storage (this device only) ----------
  var storage = (function () {
    try { var k = '__mmh_t'; window.localStorage.setItem(k, '1'); window.localStorage.removeItem(k); return window.localStorage; }
    catch (e) { return null; }
  })();
  function save() {
    if (!storage) return;
    try {
      storage.setItem(KEY, JSON.stringify({ date: billDate, savedId: savedId, name: $('sName').value, pieces: $('sPieces').value, kg: $('sKgIn').value, jaal: $('sJaal').value, rate: $('sRate').value, oldBal: $('sOld').value, cash: $('sCash').value, online: $('sOnline').value, labour: labourManual ? $('sLabour').value : '', savedAt: new Date().toISOString() }));
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
  function dueText(p) { var a = Math.abs(p), t = C.formatINR(a, { decimals: a % 100 ? 2 : 0 }); return p > 0 ? t + ' Debit (lena hai)' : p < 0 ? t + ' Credit (dena hai)' : t; }
  function drcr(p, n) { return n(Math.abs(p)); }
  function todayText() { var p = String(billDate || '').split('-'), d = p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : new Date(); if (isNaN(d.getTime())) d = new Date(); return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  var toastT;
  function LG(r, f) { return window.MMHBal ? window.MMHBal.ledger(C.ledger, r, f) : C.ledger(r, f); }
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
  // Labour is locked to the automatic engine value (user, Nov 5 2026: "labour charge uneditable rakho").
  function manualLabour() { return null; }
  function manualLabourOld() { if (!labourManual) return null; var s = ($('sLabour').value || '').trim(); if (s === '') return null; var v = C.parseScaled(s, 2); return v === null || isNaN(v) ? NaN : v; }
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
      '<div class="rc big due-r"><span class="k">Balance</span><span class="val">' + dueText(L.due) + '</span></div>';
  }

  // ---------- Render ----------
  function render() {
    schedulePreview();
    var row = singleRow(), v = C.validateRow(row), out = $('sOut');
    ['pieces', 'kg', 'jaal', 'rate'].forEach(function (f) { $(sF[f]).classList.toggle('err', !!v.errors[f]); });
    var sl = LG(row, 0);
    ['oldBal', 'cash', 'online'].forEach(function (f) { $(sF[f]).classList.toggle('err', !!sl.errors[f]); });
    var errs = Object.values(v.errors).concat(Object.values(sl.errors));
    var nm = $('sName').value.trim();
    var h = '<h3>Bill' + (nm ? ' · ' + esc(nm) : '') + '</h3>';
    if (!v.ok) {
      $('sErr').textContent = errs.join(' · ');
      if (!labourManual && document.activeElement !== $('sLabour')) $('sLabour').value = '';
      out.innerHTML = h + '<p class="empty">Chicken Qty, total KG and rate bharte hi bill yahan dikhega.</p>'; return;
    }
    var lm = manualLabour(); $('sLabour').classList.toggle('err', isNaN(lm));
    if (isNaN(lm)) errs.push('Labour sahi bhariye (0 or more, max 2 decimals)');
    $('sErr').textContent = errs.join(' · ');
    var r = calcSingle(v);
    if (!labourManual && document.activeElement !== $('sLabour')) $('sLabour').value = (r.labourAdjusted / 100).toFixed(2);
    var gkg = C.formatKg(v.grams), kg = C.formatKg(v.netGrams), rate = C.formatINR(v.ratePaise);
    var q = function (k, val) { return '<div><span>' + k + '</span><b>' + val + '</b></div>'; };
    h += '<div class="sq">' + q('Chicken Qty', C.formatInt(v.pieces)) + q('Total KG', gkg) + (v.jaalGrams ? q('Jaal', '− ' + C.formatKg(v.jaalGrams)) + q('Net KG', kg) : '') +
      q('Average', (C.averageKg(v.netGrams, v.pieces) || '—') + ' kg') + q('Rate', rate) + '</div>';
    var L = LG(row, r.final), led = ledgerHTML(L);
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

  // ---------- Shop-style bill (shared/bill-print.js draws it; figures come from the Zinda engine above) ----------
  var B = window.MMHBill || null, prevT = null;
  function firmNow() { var f = B && B.getFirm(FIRM_KEY); if (f) return f; var n = $('sFirm').value.trim(); return n ? { name: n } : null; }
  function billModel() {
    var row = singleRow(), v = C.validateRow(row), n = B.num;
    var m = { firm: firmNow(), date: billDate || todayISO(), name: $('sName').value.trim() || 'Customer', rows: [], minRows: 6, total: {}, extras: [], grand: { label: 'G. TOTAL', value: '' }, words: '', fallbackTitle: 'MurgaMandi Hisab' };
    if (!v.ok) { m.name = $('sName').value.trim(); m.extras = [{ label: 'Average' }, { label: 'Samiti' }, { label: 'Labour' }, { label: 'Total Bill', hl: 1 }, { label: 'Last Balance' }, { label: 'Received' }]; return { model: m, ok: false }; }
    var r = calcSingle(v), L = LG(row, r.final), avg = C.averageKg(v.netGrams, v.pieces);
    m.rows.push({ qty: C.formatInt(v.pieces), weight: C.formatKg(v.netGrams), part: 'Chicken', rate: n(v.ratePaise), amount: n(r.basic) });
    m.total = { qty: C.formatInt(v.pieces), weight: C.formatKg(v.netGrams), amount: n(r.basic) };
    m.extras.push({ label: 'Average', left: avg + ' kg', value: '' });
    m.extras.push({ label: 'Samiti', value: n(r.samiti) });
    m.extras.push({ label: 'Labour', value: n(r.labourAdjusted) });
    m.extras.push({ label: 'Total Bill', value: r.final == null ? '' : n(r.final), hl: 1 });
    var led = L.any && L.ok, rec = led ? L.received : 0;
    m.extras.push({ label: led && L.oldBal < 0 ? 'Pichla Credit (Advance)' : 'Pichla Debit (Baaki)', value: led && L.oldBal ? drcr(L.oldBal, n) : '—' });
    m.extras.push({ label: 'Received', value: rec ? n(rec) : '—' });
    var g = led ? L.due : r.final;
    if (g != null) {
      if (led) { m.grand.label = g < 0 ? 'CREDIT (Aapka advance)' : 'DEBIT (Aapko dena hai)'; m.grand.value = drcr(g, n); m.words = C.amountInWords(Math.abs(g)) + (g < 0 ? ' (Credit - aapka advance jama hai)' : ' (Debit - aapko dena hai)'); }
      else { m.grand.value = n(g); m.words = C.amountInWords(Math.max(g, 0)); }
    }
    return { model: m, ok: true };
  }
  function schedulePreview() {
    if (!B || !$('billPrev')) return;
    clearTimeout(prevT);
    prevT = setTimeout(function () {
      B.render(billModel().model, function (cv) { var box = $('billPrev'); if (!cv) { box.textContent = ''; return; } box.textContent = ''; box.appendChild(cv); });
    }, 180);
  }

  // ---------- Print receipt (plain fallback when canvas is not available) ----------
  function buildReceipt() {
    var row = singleRow(), v = C.validateRow(row);
    if (!v.ok) return false;
    var r = calcSingle(v), L = LG(row, r.final);
    var nm = $('sName').value.trim(), firm = $('sFirm').value.trim();
    var t = function (k, val, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + k + '</td><td>' + val + '</td></tr>'; };
    var h = '<div class="rh"><div><b>Ghazipur Murga Mandi</b>' + (firm ? '<i>' + esc(firm) + '</i>' : '') + '<span>Wholesale Bill</span></div><div class="rd">' + esc(todayText()) + '</div></div>' +
      '<div class="rn">' + (nm ? esc(nm) : 'Customer') + '</div>' +
      '<div class="rq">' +
        '<div><span>Chicken Qty</span><b>' + C.formatInt(v.pieces) + '</b></div>' +
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
  function plainPrint() {
    if (!buildReceipt()) { toast('Pehle pieces, KG aur rate sahi bhariye'); return; }
    $('sReceipt').classList.remove('bill-mode');
    document.body.classList.add('print-rcpt');
    var done = function () { document.body.classList.remove('print-rcpt'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    try { window.print(); } catch (e) { toast('Printing is blocked in this window.'); }
    setTimeout(function () { if (!window.matchMedia || !window.matchMedia('print').matches) done(); }, 1500);
  }
  function doPrint() {
    if (!B) return plainPrint();
    var bm = billModel(); if (!bm.ok) { toast('Pehle pieces, KG aur rate sahi bhariye'); return; }
    B.render(bm.model, function (cv) { if (!cv) return plainPrint(); B.printCanvas(cv, $('sReceipt'), function () { toast('Printing is blocked in this window.'); }); });
  }

  // ---------- WhatsApp PDF ----------
  function receiptModel() {
    var row = singleRow(), v = C.validateRow(row);
    if (!v.ok) return null;
    var r = calcSingle(v), L = LG(row, r.final);
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
    var send = function (cv) { window.ZindaShare.share(cv || window.ZindaShare.receiptCanvas(m), 'Bill ' + m.name + ' ' + m.date, 'Bill · ' + m.date); };
    if (!B) return send(null);
    B.render(billModel().model, send);
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
    var ff = firmNow(); if (B && B.getFirm(FIRM_KEY)) $('sFirm').value = ff.name;
    labourManual = false; savedId = null; render(); save(); renderSaved(); balanceHint(); $('sPieces').focus();
  }

  // ---------- Saved records (shared data service) ----------
  function todayISO() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  /** The record for the bill on screen, built only from the original engine's figures. {input} or {error}. */
  function recordInput() {
    var name = $('sName').value.trim();
    var row = singleRow(), v = C.validateRow(row);
    if (!v.ok) return { error: 'Pehle pieces, KG aur rate sahi bhariye' };
    if (!name) return { error: 'Bill save karne ke liye customer name bhariye' };
    var m = manualLabour(); if (isNaN(m)) return { error: 'Labour sahi bhariye (0 or more, max 2 decimals)' };
    var r = calcSingle(v); if (r.final == null) return { error: r.warning || 'Final amount not calculated' };
    var L = LG(row, r.final); if (!L.ok) return { error: 'Pichla balance, cash aur online sahi bhariye' };
    return { input: { id: savedId || undefined, section: 'zinda', source: 'zinda-single', date: billDate || todayISO(), customerName: name, firm: $('sFirm').value.trim(),
      amount: r.final, cash: L.cash, online: L.online, prevBalance: L.oldBal, balance: L.due,
      details: { pieces: v.pieces, grams: v.grams, jaalGrams: v.jaalGrams, netGrams: v.netGrams, ratePaise: v.ratePaise, basic: r.basic, samiti: r.samiti, labour: r.labourAdjusted, labourOriginal: r.labourOriginal, adjustment: r.adjustment, labourManual: !!r.manual },
      inputs: { name: name, pieces: $('sPieces').value.trim(), kg: $('sKgIn').value.trim(), jaal: $('sJaal').value.trim(), rate: $('sRate').value.trim(), oldBal: $('sOld').value.trim(), cash: $('sCash').value.trim(), online: $('sOnline').value.trim(), labour: labourManual ? $('sLabour').value.trim() : '' } } };
  }
  function saveRecord(allowDuplicate) {
    if (!D) { toast('Records are not available in this window'); return; }
    var b = recordInput(); if (b.error) { toast(b.error); return; }
    var res = D.saveBill(b.input, { allowDuplicate: !!allowDuplicate });
    if (res.duplicates) {
      var d = res.duplicates[0];
      confirmDlg('Possible duplicate bill', 'A Zinda bill for ' + d.customerName + ' on ' + U.dateText(d.date) + ' for ' + U.money(d.amount) + ' is already saved. Save this one as well?', 'Save anyway', function () { saveRecord(true); });
      return;
    }
    if (!res.ok) { if (savedId && /no longer exists/.test(res.error || '')) savedId = null; toast(res.error || 'Could not save'); renderSaved(); save(); return; }
    savedId = res.record.id; save(); renderSaved(); renderRecent(); customerList();
    toast(res.created ? 'Bill saved for ' + res.record.customerName : 'Saved bill updated');
  }
  function sameAsSaved(rec) {
    var b = recordInput(); if (b.error || !rec) return false;
    var i = b.input; return rec.date === i.date && rec.customerName === i.customerName && rec.firm === i.firm && rec.amount === i.amount && rec.cash === i.cash && rec.online === i.online && rec.prevBalance === i.prevBalance;
  }
  function renderSaved() {
    var el = $('sSaved'); if (!el) return;
    if (!D) { el.textContent = 'Records not available in this window.'; $('sSave').disabled = true; return; }
    var rec = savedId ? D.getBill(savedId) : null;
    if (savedId && !rec) savedId = null;
    $('sSave').textContent = rec ? 'Update Saved Bill' : 'Save Bill';
    el.className = 'rec-state' + (rec ? (sameAsSaved(rec) ? ' ok' : ' changed') : '');
    el.textContent = rec ? (sameAsSaved(rec) ? 'Saved to records · ' + rec.customerName + ' · ' + U.dateText(rec.date) : 'Changed since saving — press "Update Saved Bill"') : 'Not saved to records yet';
  }
  function cellT(tr, text, cls) { var td = document.createElement('td'); if (cls) td.className = cls; td.textContent = text; tr.appendChild(td); return td; }
  function renderRecent() {
    var body = $('sRecent'); if (!body) return; body.textContent = '';
    var list = D ? D.listBills({ source: 'zinda-single' }).reverse().slice(0, 25) : [];
    $('sRecentEmpty').hidden = list.length > 0;
    list.forEach(function (r) {
      var tr = document.createElement('tr'); tr.dataset.id = r.id; if (r.id === savedId) tr.className = 'cur';
      cellT(tr, U.dateText(r.date)); cellT(tr, r.customerName, 'b'); cellT(tr, r.firm || '—');
      cellT(tr, U.money(r.amount), 'ra'); cellT(tr, U.money(r.cash), 'ra'); cellT(tr, U.money(r.online), 'ra'); cellT(tr, U.balanceText(r.balance), 'ra');
      var td = cellT(tr, '', 'ra acts-c');
      var e = document.createElement('button'); e.type = 'button'; e.className = 'mini'; e.dataset.act = 'edit'; e.textContent = 'Edit'; td.appendChild(e);
      var x = document.createElement('button'); x.type = 'button'; x.className = 'mini danger'; x.dataset.act = 'del'; x.textContent = 'Delete'; td.appendChild(x);
      body.appendChild(tr);
    });
  }
  function loadRecord(id) {
    var r = D.getBill(id); if (!r) { toast('This bill no longer exists'); renderRecent(); return; }
    var i = r.inputs || {};
    $('sName').value = i.name || r.customerName; $('sPieces').value = i.pieces || ''; $('sKgIn').value = i.kg || ''; $('sJaal').value = i.jaal || ''; $('sRate').value = i.rate || '';
    $('sOld').value = i.oldBal || ''; $('sCash').value = i.cash || ''; $('sOnline').value = i.online || ''; $('sLabour').value = i.labour || ''; labourManual = false;
    $('sFirm').value = r.firm || ''; billDate = r.date; $('sDate').value = r.date; savedId = r.id;
    render(); save(); renderSaved(); renderRecent(); balanceHint(); toast('Bill loaded. Change it and press "Update Saved Bill".');
  }
  function onRecentClick(e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var id = b.closest('tr').dataset.id, r = D.getBill(id); if (!r) { renderRecent(); return; }
    if (b.dataset.act === 'edit') confirmDlg('Load this saved bill?', r.customerName + ' · ' + U.dateText(r.date) + ' · ' + U.money(r.amount) + '. The entries now in the form will be replaced.', 'Load bill', function () { loadRecord(id); });
    else confirmDlg('Delete this saved bill?', r.customerName + ' · ' + U.dateText(r.date) + ' · ' + U.money(r.amount) + ' will be removed from records and statements.', 'Delete', function () {
      D.deleteBill(id); if (savedId === id) { savedId = null; save(); } renderSaved(); renderRecent(); toast('Saved bill deleted');
    });
  }
  var autoOld = null, prevName = ''; // pichla balance jo app ne khud bhara (user ne nahi likha); naam badalne se pehle wala customer
  function balanceHint(auto) {
    var h = $('sHint'); if (!h || !D) return;
    var BB = window.MMHBal, name = $('sName').value.trim(), lb = name ? (BB ? BB.current('zinda', name, { onOrBefore: billDate || todayISO(), excludeId: savedId }) : D.lastBalance(name, 'zinda', { onOrBefore: billDate || todayISO(), excludeId: savedId })) : null;
    var cur = $('sOld').value.trim(), mine = cur === '' || (autoOld !== null && cur === autoOld) || (!!BB && !!prevName && prevName !== name && BB.isBalanceOf('zinda', prevName, cur, { onOrBefore: billDate || todayISO(), excludeId: savedId }));
    if (auto) prevName = name;
    if (!lb) { h.hidden = true; if (BB && auto && !savedId && cur !== '' && mine) { $('sOld').value = ''; autoOld = null; render(); save(); renderSaved(); } return; }
    h.hidden = false; h.dataset.paise = String(lb.balance);
    $('sHintT').textContent = 'Zinda balance: ' + U.balanceText(lb.balance) + ' (' + U.dateText(lb.date) + ')';
    $('sHintUse').hidden = false;
    if (BB && auto && !savedId && mine && cur !== BB.fieldText(lb.balance)) { $('sOld').value = autoOld = BB.fieldText(lb.balance); render(); save(); renderSaved(); toast('Pichla balance ' + U.balanceText(lb.balance) + ' khud bhar diya'); }
  }
  function customerList() {
    var dl = $('custList'); if (!dl || !D) return; dl.textContent = '';
    D.listCustomers().slice(0, 500).forEach(function (c) { var o = document.createElement('option'); o.value = c.name; dl.appendChild(o); });
  }

  // ---------- Init ----------
  function init() {
    $('todayChip').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    if (!storage) { $('storageNotice').hidden = false; $('saveState').classList.add('off'); $('saveText').textContent = 'Not saved'; }
    var s = load();
    if (s) { Object.keys(sF).forEach(function (f) { $(sF[f]).value = str(s[f]); }); $('sLabour').value = str(s.labour); labourManual = false; savedId = typeof s.savedId === 'string' ? s.savedId : null; billDate = /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : ''; }
    if (!billDate) billDate = todayISO();
    $('sDate').value = billDate;
    $('sDate').addEventListener('change', function () { billDate = /^\d{4}-\d{2}-\d{2}$/.test($('sDate').value) ? $('sDate').value : todayISO(); $('sDate').value = billDate; save(); renderSaved(); balanceHint(); schedulePreview(); });
    var syncFirm = function () { var f = B && B.getFirm(FIRM_KEY); if (f) $('sFirm').value = f.name; else if (B && !f) $('sFirm').value = ''; };
    if (B) { syncFirm(); B.mountPanel($('firmPanel'), { legacyKey: FIRM_KEY, confirm: confirmDlg, toast: toast, onChange: function () { syncFirm(); renderSaved(); schedulePreview(); } }); }
    else { try { $('sFirm').value = (storage && storage.getItem(FIRM_KEY)) || ''; } catch (e) {} }
    $('sFirm').addEventListener('input', renderSaved);
    $('sLabour').addEventListener('blur', function () { if (!labourManual) render(); });
    Object.keys(sF).forEach(function (f) { $(sF[f]).addEventListener('input', function () { render(); save(); renderSaved(); }); });
    $('sName').addEventListener('focus', function () { prevName = $('sName').value.trim(); }); $('sName').addEventListener('change', function () { balanceHint(true); }); $('sName').addEventListener('blur', function () { balanceHint(true); });
    $('sHintUse').onclick = function () { var p = +$('sHint').dataset.paise; if (isNaN(p)) return; $('sOld').value = autoOld = window.MMHBal ? window.MMHBal.fieldText(p) : String(p / 100); render(); save(); renderSaved(); };
    $('sSave').onclick = function () { saveRecord(false); };
    $('sRecent').addEventListener('click', onRecentClick);
    $('sLabour').addEventListener('input', renderSaved);
    if (window.MMHBal) { window.MMHBal.picker('zinda', document, '#sName'); window.MMHBal.mount({ section: 'zinda', toast: toast, confirm: confirmDlg, onChange: function () { balanceHint(false); } }); }
    $('sClear').onclick = function () { confirmDlg('Clear this bill?', 'All fields of this bill will be emptied.', 'Clear', clearBill); };
    $('sPrint').onclick = doPrint;
    $('sShare').onclick = shareReceipt;
    $('sToDaily').onclick = toDaily;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { $('dlg').classList.remove('show'); $('shareDlg').classList.remove('show'); } });
    window.ZindaShare.init(toast);
    window.ZindaKeypad.init();
    render(); renderSaved(); renderRecent(); customerList(); balanceHint();
    if (D && D.status().corrupt) { $('storageNotice').hidden = false; $('storageNotice').textContent = D.status().message; }
    window.addEventListener('storage', function (e) { if (D && e.key === 'mmh.db.v2') { renderSaved(); renderRecent(); customerList(); } });
  }
  try { init(); } catch (e) { toast('Something went wrong: ' + e.message); if (window.console) console.error(e); }

  // Exposed for automated tests only
  window.__zindaSingle = { render: render, calcSingle: calcSingle, receiptModel: receiptModel, recordInput: recordInput, saveRecord: saveRecord, savedId: function () { return savedId; } };
})();
