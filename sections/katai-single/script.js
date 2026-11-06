/* ============================================================
   Katai Single Customer Bill — UI layer.
   Uses only window.KataiCalc (../../engines/katai/calc.js).
   No Zinda / Chicken Calculator logic is used here.
   ============================================================ */
(function () {
  'use strict';
  var K = window.KataiCalc;
  if (!K) { document.body.insertAdjacentHTML('afterbegin', '<p style="padding:16px;color:#B91C1C">Calculation engine failed to load. Please refresh.</p>'); return; }

  var KEY = 'mmh.kataiSingle.v1';
  var FIRM_KEY = 'mmh.kataiSingle.firm';
  var $ = function (id) { return document.getElementById(id); };
  var state = { name: '', date: '', lines: {}, oldBal: '', cash: '', online: '', savedId: null };
  var D = window.MMHData || null, U = D && D.util;   // shared records (Statements & Reports read these)

  // ---------- Storage ----------
  var storage = (function () {
    try { var k = '__mmh_t'; window.localStorage.setItem(k, '1'); window.localStorage.removeItem(k); return window.localStorage; }
    catch (e) { return null; }
  })();
  var saveTimer = null;
  function save() {
    if (!storage) return;
    clearTimeout(saveTimer);
    $('saveText').textContent = 'Saving…';
    saveTimer = setTimeout(flush, 200);
  }
  function flush() {
    saveTimer = null;
    if (!storage) return;
    try { storage.setItem(KEY, JSON.stringify(state)); $('saveText').textContent = 'Saved on this device'; $('saveState').classList.remove('off'); }
    catch (e) { $('saveText').textContent = 'Not saved (storage full)'; $('saveState').classList.add('off'); }
  }
  function str(v, max) { return typeof v === 'string' ? v.slice(0, max || 40) : ''; }
  function load() {
    if (!storage) return;
    var d = null; try { d = JSON.parse(storage.getItem(KEY) || 'null'); } catch (e) { d = null; }
    if (!d || typeof d !== 'object') return;
    state.name = str(d.name, 80); state.date = str(d.date, 10); state.savedId = typeof d.savedId === 'string' ? d.savedId : null; state.oldBal = str(d.oldBal); state.cash = str(d.cash); state.online = str(d.online);
    K.PRODUCTS.forEach(function (p) {
      var l = d.lines && d.lines[p.id];
      if (l && typeof l === 'object') state.lines[p.id] = { unit: K.UNITS[l.unit] ? l.unit : 'kg', qty: str(l.qty), rate: str(l.rate) };
    });
  }

  // ---------- Helpers ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }
  function line(id) { if (!state.lines[id]) state.lines[id] = { unit: 'kg', qty: '', rate: '' }; return state.lines[id]; }
  function todayISO() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function dateText() {
    var p = (state.date || todayISO()).split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function heading() { return $('kFirm').value.trim() || 'MurgaMandi Hisab'; }
  var toastT;
  function balT(p) { var a = Math.abs(p); return p > 0 ? K.money(a) + ' Debit (lena hai)' : p < 0 ? K.money(a) + ' Credit (dena hai)' : K.money(0); }
  function LG(r, f) { return window.MMHBal ? window.MMHBal.ledger(K.ledger, r, f) : K.ledger(r, f); }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2600); }
  function confirmDlg(title, text, yes, onYes) {
    if (typeof title === 'function') { onYes = title; title = 'Clear this bill?'; text = 'All products and amounts of this bill will be emptied.'; yes = 'Clear'; }
    $('dlgT').textContent = title; $('dlgP').textContent = text; $('dlgYes').textContent = yes;
    var d = $('dlg'); d.classList.add('show'); $('dlgNo').focus();
    var close = function () { d.classList.remove('show'); $('dlgYes').onclick = $('dlgNo').onclick = null; };
    $('dlgNo').onclick = close;
    $('dlgYes').onclick = function () { close(); onYes(); };
  }

  // ---------- Product rows (built with DOM APIs, no user text in innerHTML) ----------
  function buildRows() {
    var body = $('pBody'); body.textContent = '';
    K.PRODUCTS.forEach(function (p) {
      var l = line(p.id);
      var row = document.createElement('div'); row.className = 'p-row'; row.setAttribute('role', 'row'); row.dataset.id = p.id;
      var name = document.createElement('div'); name.className = 'p-name'; name.textContent = p.name;
      var unitC = document.createElement('div'); unitC.className = 'p-unit';
      var sel = document.createElement('select'); sel.dataset.f = 'unit'; sel.setAttribute('aria-label', p.name + ' unit');
      Object.keys(K.UNITS).forEach(function (u) { var o = document.createElement('option'); o.value = u; o.textContent = K.UNITS[u].label; if (u === l.unit) o.selected = true; sel.appendChild(o); });
      unitC.appendChild(sel);
      var qC = document.createElement('div'); qC.className = 'p-qty';
      var q = document.createElement('input'); q.className = 'n'; q.dataset.f = 'qty'; q.inputMode = 'decimal'; q.autocomplete = 'off'; q.value = l.qty; q.setAttribute('aria-label', p.name + ' quantity'); 
      qC.appendChild(q);
      var rC = document.createElement('div'); rC.className = 'p-rate';
      var r = document.createElement('input'); r.className = 'n'; r.dataset.f = 'rate'; r.inputMode = 'decimal'; r.autocomplete = 'off'; r.value = l.rate; r.setAttribute('aria-label', p.name + ' rate'); 
      rC.appendChild(r);
      var aC = document.createElement('div'); aC.className = 'p-amt'; aC.dataset.o = 'amt'; aC.textContent = '—';
      [name, unitC, qC, rC, aC].forEach(function (c) { row.appendChild(c); });
      body.appendChild(row);
    });
  }

  // ---------- Render ----------
  function render() {
    schedulePreview();
    var bill = K.computeBill(state.lines);
    var errs = [];
    K.PRODUCTS.forEach(function (p) {
      var row = $('pBody').querySelector('[data-id="' + p.id + '"]'); if (!row) return;
      var c = bill.lines[p.id];
      row.querySelector('[data-f="qty"]').classList.toggle('err', !!c.errors.qty);
      row.querySelector('[data-f="rate"]').classList.toggle('err', !!c.errors.rate);
      row.querySelector('[data-f="qty"]').inputMode = c.unit === 'pcs' ? 'numeric' : 'decimal';
      row.classList.toggle('on', c.status === 'valid');
      row.querySelector('[data-o="amt"]').textContent = c.status === 'valid' ? K.money(c.amount) : (c.status === 'incomplete' ? 'Fill qty & rate' : c.status === 'invalid' ? 'Check' : '—');
      Object.keys(c.errors).forEach(function (k) { errs.push(p.name + ': ' + c.errors[k]); });
    });
    var L = LG(state, bill.total);
    ['oldBal', 'cash', 'online'].forEach(function (f) { $({ oldBal: 'kOld', cash: 'kCash', online: 'kOnline' }[f]).classList.toggle('err', !!L.errors[f]); if (L.errors[f]) errs.push(L.errors[f]); });

    var s = $('kSummary'); s.textContent = '';
    var add = function (k, v, cls) { var d = document.createElement('div'); d.className = 'rc' + (cls ? ' ' + cls : ''); var a = document.createElement('span'); a.className = 'k'; a.textContent = k; var b = document.createElement('span'); b.className = 'val'; b.textContent = v; d.appendChild(a); d.appendChild(b); return d; };
    var any = false;
    K.PRODUCTS.forEach(function (p) { var c = bill.lines[p.id]; if (c.status === 'valid') { any = true; s.appendChild(add(p.name + ' · ' + K.qtyText(c.qty, c.unit) + ' × ' + K.money(c.ratePaise), K.money(c.amount))); } });
    if (!any) { var e = document.createElement('p'); e.className = 'empty'; e.textContent = 'Product ki quantity aur rate bharte hi bill yahan dikhega.'; s.appendChild(e); }
    s.appendChild(add('Total Bill', K.money(bill.total), 'big'));
    var w = document.createElement('div'); w.className = 'words'; w.textContent = K.amountInWords(bill.total); s.appendChild(w);

    var lg = $('kLedger'); lg.textContent = '';
    if (L.any && L.ok) {
      lg.appendChild(add('Total Due (bill + pichla)', K.money(L.totalDue)));
      lg.appendChild(add('Received (cash + online)', '− ' + K.money(L.received)));
      lg.appendChild(add('Remaining Balance', balT(L.balance), 'big due-r'));
    }
    $('kErr').textContent = errs.join(' · ');
    if (bill.incomplete && !errs.length) $('kErr').textContent = bill.incomplete + ' product(s) need both quantity and rate.';
    return { bill: bill, L: L };
  }

  // ---------- Shop-style bill (shared/bill-print.js draws it; figures come from the Katai engine only: Qty × Rate, no labour, no samiti) ----------
  var B = window.MMHBill || null, prevT = null;
  function firmNow() { var f = B && B.getFirm(FIRM_KEY); if (f) return f; var n = $('kFirm').value.trim(); return n ? { name: n } : null; }
  function billModel() {
    var bill = K.computeBill(state.lines), n = B.num;
    var m = { firm: firmNow(), date: state.date || todayISO(), name: state.name.trim() || 'Customer', rows: [], minRows: 6, total: {}, extras: [], grand: { label: 'G. TOTAL', value: '' }, words: '', fallbackTitle: 'MurgaMandi Hisab' };
    var pcs = 0, kg = 0, anyPcs = false, anyKg = false;
    K.PRODUCTS.forEach(function (p) {
      var c = bill.lines[p.id]; if (!c || c.status !== 'valid') return;
      var q = K.plainQty(c.qty);
      if (c.unit === 'pcs') { pcs += c.qty; anyPcs = true; } else { kg += c.qty; anyKg = true; }
      m.rows.push({ qty: c.unit === 'pcs' ? q : '', weight: c.unit === 'pcs' ? '' : q, part: p.name, rate: n(c.ratePaise), amount: n(c.amount) });
    });
    var ok = !!bill.items && !bill.invalid && !bill.incomplete;
    if (!ok) { m.name = state.name.trim(); m.rows = []; m.extras = [{ label: 'Last Balance' }, { label: 'Received' }]; return { model: m, ok: false }; }
    var L = LG({ oldBal: state.oldBal, cash: state.cash, online: state.online }, bill.total), led = L.any && L.ok;
    m.total = { qty: anyPcs ? K.plainQty(pcs) : '', weight: anyKg ? K.plainQty(kg) : '', amount: n(bill.total) };
    var drcr = function (p) { return n(Math.abs(p)); };
    m.extras.push({ label: led && L.oldBal < 0 ? 'Pichla Credit (Advance)' : 'Pichla Debit (Baaki)', value: led && L.oldBal ? drcr(L.oldBal) : '—' });
    m.extras.push({ label: 'Received', value: led && L.received ? n(L.received) : '—' });
    var g = led ? L.balance : bill.total;
    if (led) { m.grand.label = g < 0 ? 'CREDIT (Aapka advance)' : 'DEBIT (Aapko dena hai)'; m.grand.value = drcr(g); m.words = K.amountInWords(Math.abs(g)) + (g < 0 ? ' (Credit - aapka advance jama hai)' : ' (Debit - aapko dena hai)'); }
    else { m.grand.value = n(g); m.words = K.amountInWords(Math.max(g, 0)); }
    return { model: m, ok: true };
  }
  function schedulePreview() {
    if (!B || !$('billPrev')) return;
    clearTimeout(prevT);
    prevT = setTimeout(function () {
      B.render(billModel().model, function (cv) { var box = $('billPrev'); box.textContent = ''; if (cv) box.appendChild(cv); });
    }, 180);
  }

  // ---------- Print (plain fallback when canvas is not available) ----------
  function buildReceipt() {
    var res = render(), bill = res.bill, L = res.L;
    if (!bill.items) return false;
    var t = function (k, v, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + k + '</td><td>' + v + '</td></tr>'; };
    var h = '<div class="rh"><div><b>' + esc(heading()) + '</b><span>Katai Bill</span></div><div class="rd">' + esc(dateText()) + '</div></div>' +
      '<div class="rn">' + esc(state.name.trim() || 'Customer') + '</div>' +
      '<table class="rt"><tr class="th"><td>Product</td><td>Qty</td><td>Rate</td><td>Amount</td></tr>';
    K.PRODUCTS.forEach(function (p) { var c = bill.lines[p.id]; if (c.status === 'valid') h += '<tr><td>' + esc(p.name) + '</td><td>' + K.qtyText(c.qty, c.unit) + '</td><td>' + K.money(c.ratePaise) + '</td><td>' + K.money(c.amount) + '</td></tr>'; });
    h += '</table><table class="rt sm">' + t('Total Bill', K.money(bill.total), 'tot');
    if (L.any && L.ok) h += t('Pichla Balance', '+ ' + K.money(L.oldBal)) + t('Total Due', K.money(L.totalDue), 'sub') + t('Rec Cash', '− ' + K.money(L.cash)) + t('Rec Online', '− ' + K.money(L.online)) + t('Remaining Balance', balT(L.balance), 'tot due');
    h += '</table><div class="rw">' + esc(K.amountInWords(L.any && L.ok ? Math.max(L.balance, 0) : bill.total)) + '</div><div class="rf">Dhanyavaad · ' + esc(heading()) + '</div>';
    $('kReceipt').innerHTML = h;
    return true;
  }
  function plainPrint() {
    if (!buildReceipt()) { toast('Pehle kam se kam ek product ki quantity aur rate bhariye'); return; }
    $('kReceipt').classList.remove('bill-mode');
    document.body.classList.add('print-rcpt');
    var done = function () { document.body.classList.remove('print-rcpt'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    try { window.print(); } catch (e) { toast('Printing is blocked in this window.'); }
    setTimeout(function () { if (!window.matchMedia || !window.matchMedia('print').matches) done(); }, 1500);
  }
  function doPrint() {
    if (!B) return plainPrint();
    var bm = billModel(); if (!bm.ok) { toast('Pehle kam se kam ek product ki quantity aur rate bhariye'); return; }
    B.render(bm.model, function (cv) { if (!cv) return plainPrint(); B.printCanvas(cv, $('kReceipt'), function () { toast('Printing is blocked in this window.'); }); });
  }

  // ---------- WhatsApp PDF ----------
  function shareBill() {
    var res = render(), bill = res.bill, L = res.L;
    if (!bill.items) { toast('Pehle kam se kam ek product ki quantity aur rate bhariye'); return; }
    var rows = [], n = 0;
    K.PRODUCTS.forEach(function (p) { var c = bill.lines[p.id]; if (c.status === 'valid') rows.push([++n, p.name, K.qtyText(c.qty, c.unit), K.money(c.ratePaise), K.money(c.amount)]); });
    var sum = [['Total Bill', K.money(bill.total), '#0B4F8A', 1]];
    if (L.any && L.ok) sum.push(['Pichla Balance', balT(L.oldBal)], ['Received (Cash + Online)', K.money(L.received)], ['Remaining Balance', balT(L.balance), '#B45309', 1]);
    var name = state.name.trim() || 'Customer';
    var cv = window.KataiShare.billCanvas({ heading: heading(), title: 'Katai Bill', customer: name, date: dateText(),
      cols: [{ h: '#', w: 50 }, { h: 'Product', w: 260, b: 1 }, { h: 'Qty', w: 170, r: 1 }, { h: 'Rate', w: 150, r: 1 }, { h: 'Amount', w: 190, r: 1, b: 1 }], rows: rows, sum: sum });
    var send = function (c2) { window.KataiShare.share(c2 || cv, name + ' ' + dateText(), name + ' · ' + dateText()); };
    if (!B) return send(null);
    B.render(billModel().model, send);
  }

  // ---------- Saved records (shared data service) ----------
  /** The record for the bill on screen, from the Katai engine only. {input} or {error}. */
  function recordInput() {
    var bill = K.computeBill(state.lines), name = state.name.trim();
    if (bill.invalid || bill.incomplete) return { error: 'Products mein galti hai: quantity aur rate dono sahi bhariye' };
    if (!bill.items) return { error: 'Pehle kam se kam ek product ki quantity aur rate bhariye' };
    if (!name) return { error: 'Bill save karne ke liye customer name bhariye' };
    var L = LG(state, bill.total); if (!L.ok) return { error: 'Pichla balance, cash aur online sahi bhariye' };
    var lines = [];
    K.PRODUCTS.forEach(function (p) { var c = bill.lines[p.id]; if (c.status === 'valid') lines.push({ product: p.id, name: p.name, unit: c.unit, qty: K.plainQty(c.qty), ratePaise: c.ratePaise, amount: c.amount }); });
    var inputs = { name: name, oldBal: state.oldBal, cash: state.cash, online: state.online, lines: JSON.parse(JSON.stringify(state.lines)) };
    return { input: { id: state.savedId || undefined, section: 'katai', source: 'katai-single', date: /^\d{4}-\d{2}-\d{2}$/.test(state.date) ? state.date : todayISO(), customerName: name, firm: $('kFirm').value.trim(),
      amount: bill.total, cash: L.cash, online: L.online, prevBalance: L.oldBal, balance: L.balance, lines: lines, details: { items: bill.items }, inputs: inputs } };
  }
  function saveRecord(allowDuplicate) {
    if (!D) { toast('Records are not available in this window'); return; }
    var b = recordInput(); if (b.error) { toast(b.error); return; }
    var res = D.saveBill(b.input, { allowDuplicate: !!allowDuplicate });
    if (res.duplicates) {
      var d = res.duplicates[0];
      confirmDlg('Possible duplicate bill', 'A Katai bill for ' + d.customerName + ' on ' + U.dateText(d.date) + ' for ' + U.money(d.amount) + ' is already saved. Save this one as well?', 'Save anyway', function () { saveRecord(true); });
      return;
    }
    if (!res.ok) { if (state.savedId && /no longer exists/.test(res.error || '')) state.savedId = null; toast(res.error || 'Could not save'); renderSaved(); save(); return; }
    state.savedId = res.record.id; save(); renderSaved(); renderRecent(); customerList();
    toast(res.created ? 'Bill saved for ' + res.record.customerName : 'Saved bill updated');
  }
  function sameAsSaved(rec) {
    var b = recordInput(); if (b.error || !rec) return false;
    var i = b.input; return rec.date === i.date && rec.customerName === i.customerName && rec.firm === i.firm && rec.amount === i.amount && rec.cash === i.cash && rec.online === i.online && rec.prevBalance === i.prevBalance && JSON.stringify(rec.lines) === JSON.stringify(i.lines);
  }
  function renderSaved() {
    var el = $('kSaved'); if (!el) return;
    if (!D) { el.textContent = 'Records not available in this window.'; $('kSave').disabled = true; return; }
    var rec = state.savedId ? D.getBill(state.savedId) : null;
    if (state.savedId && !rec) state.savedId = null;
    var same = rec && sameAsSaved(rec);
    $('kSave').textContent = rec ? 'Update Saved Bill' : 'Save Bill';
    el.className = 'rec-state' + (rec ? (same ? ' ok' : ' changed') : '');
    el.textContent = rec ? (same ? 'Saved to records · ' + rec.customerName + ' · ' + U.dateText(rec.date) : 'Changed since saving — press "Update Saved Bill"') : 'Not saved to records yet';
  }
  function cellT(tr, text, cls) { var td = document.createElement('td'); if (cls) td.className = cls; td.textContent = text; tr.appendChild(td); return td; }
  function renderRecent() {
    var body = $('kRecent'); if (!body) return; body.textContent = '';
    var list = D ? D.listBills({ source: 'katai-single' }).reverse().slice(0, 25) : [];
    $('kRecentEmpty').hidden = list.length > 0;
    list.forEach(function (r) {
      var tr = document.createElement('tr'); tr.dataset.id = r.id; if (r.id === state.savedId) tr.className = 'cur';
      cellT(tr, U.dateText(r.date)); cellT(tr, r.customerName, 'b'); cellT(tr, r.firm || '—'); cellT(tr, String((r.lines || []).length), 'ra');
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
    state = { name: str(i.name || r.customerName, 80), date: r.date, lines: {}, oldBal: str(i.oldBal), cash: str(i.cash), online: str(i.online), savedId: r.id };
    K.PRODUCTS.forEach(function (p) { var l = i.lines && i.lines[p.id]; if (l && typeof l === 'object') state.lines[p.id] = { unit: K.UNITS[l.unit] ? l.unit : 'kg', qty: str(l.qty), rate: str(l.rate) }; });
    $('kFirm').value = r.firm || '';
    fill(); buildRows(); render(); save(); renderSaved(); renderRecent(); balanceHint(); toast('Bill loaded. Change it and press "Update Saved Bill".');
  }
  function onRecentClick(e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var id = b.closest('tr').dataset.id, r = D.getBill(id); if (!r) { renderRecent(); return; }
    if (b.dataset.act === 'edit') confirmDlg('Load this saved bill?', r.customerName + ' · ' + U.dateText(r.date) + ' · ' + U.money(r.amount) + '. The entries now in the form will be replaced.', 'Load bill', function () { loadRecord(id); });
    else confirmDlg('Delete this saved bill?', r.customerName + ' · ' + U.dateText(r.date) + ' · ' + U.money(r.amount) + ' will be removed from records and statements.', 'Delete', function () {
      D.deleteBill(id); if (state.savedId === id) { state.savedId = null; save(); } renderSaved(); renderRecent(); toast('Saved bill deleted');
    });
  }
  var autoOld = null, prevName = '';
  function balanceHint(auto) {
    var h = $('kHint'); if (!h || !D) return;
    var BB = window.MMHBal, name = state.name.trim(), o = { onOrBefore: state.date || todayISO(), excludeId: state.savedId }, lb = name ? (BB ? BB.current('katai', name, o) : D.lastBalance(name, 'katai', o)) : null;
    var cur = String(state.oldBal).trim(), mine = cur === '' || (autoOld !== null && cur === autoOld) || (!!BB && !!prevName && prevName !== name && BB.isBalanceOf('katai', prevName, cur, o));
    if (auto) prevName = name;
    if (!lb) { h.hidden = true; if (BB && auto && !state.savedId && cur !== '' && mine) { state.oldBal = ''; $('kOld').value = ''; autoOld = null; render(); save(); renderSaved(); } return; }
    h.hidden = false; h.dataset.paise = String(lb.balance);
    $('kHintT').textContent = 'Katai balance: ' + U.balanceText(lb.balance) + ' (' + U.dateText(lb.date) + ')';
    $('kHintUse').hidden = false;
    if (BB && auto && !state.savedId && mine && cur !== BB.fieldText(lb.balance)) { state.oldBal = autoOld = BB.fieldText(lb.balance); $('kOld').value = state.oldBal; render(); save(); renderSaved(); toast('Pichla balance ' + U.balanceText(lb.balance) + ' khud bhar diya'); }
  }
  function customerList() {
    var dl = $('custList'); if (!dl || !D) return; dl.textContent = '';
    D.listCustomers().slice(0, 500).forEach(function (c) { var o = document.createElement('option'); o.value = c.name; dl.appendChild(o); });
  }

  // ---------- Events ----------
  function bind() {
    var body = $('pBody');
    var onEdit = function (e) {
      var f = e.target.dataset.f, row = e.target.closest('.p-row'); if (!f || !row) return;
      line(row.dataset.id)[f] = String(e.target.value).slice(0, 40);
      render(); save(); renderSaved();
    };
    body.addEventListener('input', onEdit);
    body.addEventListener('change', function (e) { if (e.target.tagName === 'SELECT') onEdit(e); });
    body.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
      e.preventDefault();
      var next = e.target.closest('.p-row').nextElementSibling;
      var i = next && next.querySelector('[data-f="' + e.target.dataset.f + '"]'); if (i) { i.focus(); i.select(); }
    });
    var map = { kName: 'name', kOld: 'oldBal', kCash: 'cash', kOnline: 'online' };
    Object.keys(map).forEach(function (id) { $(id).addEventListener('input', function () { state[map[id]] = $(id).value.slice(0, 80); render(); save(); renderSaved(); }); });
    $('kDate').addEventListener('change', function () { state.date = /^\d{4}-\d{2}-\d{2}$/.test($('kDate').value) ? $('kDate').value : todayISO(); $('kDate').value = state.date; save(); renderSaved(); balanceHint(); schedulePreview(); });
    $('kFirm').addEventListener('input', renderSaved);
    $('kName').addEventListener('focus', function () { prevName = $('kName').value.trim(); }); $('kName').addEventListener('change', function () { balanceHint(true); }); $('kName').addEventListener('blur', function () { balanceHint(true); });
    $('kHintUse').onclick = function () { var p = +$('kHint').dataset.paise; if (isNaN(p)) return; state.oldBal = autoOld = window.MMHBal ? window.MMHBal.fieldText(p) : String(p / 100); $('kOld').value = state.oldBal; render(); save(); renderSaved(); };
    $('kSave').onclick = function () { saveRecord(false); };
    $('kToDaily').onclick = toDaily;
    $('kRecent').addEventListener('click', onRecentClick);
    if (window.MMHBal) { window.MMHBal.picker('katai', document, '#kName'); window.MMHBal.mount({ section: 'katai', toast: toast, confirm: confirmDlg, onChange: function () { balanceHint(false); } }); }
    $('kClear').onclick = function () {
      confirmDlg(function () {
        state = { name: '', date: todayISO(), lines: {}, oldBal: '', cash: '', online: '', savedId: null };
        var ff = B && B.getFirm(FIRM_KEY); if (ff) $('kFirm').value = ff.name;
        fill(); buildRows(); render(); save(); renderSaved(); balanceHint(); $('kName').focus();
      });
    };
    $('kPrint').onclick = doPrint;
    $('kShare').onclick = shareBill;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { $('dlg').classList.remove('show'); $('shareDlg').classList.remove('show'); } });
    window.addEventListener('beforeunload', function () { if (saveTimer) { clearTimeout(saveTimer); flush(); } });
  }
  function fill() {
    $('kName').value = state.name; $('kDate').value = state.date || todayISO();
    $('kOld').value = state.oldBal; $('kCash').value = state.cash; $('kOnline').value = state.online;
  }


  // ---------- Send to Katai Daily Entry (queued, picked up when that page opens) ----------
  var HANDOFF_KEY = 'mmh.kataiDaily.inbox';
  function toDaily() {
    var bill = K.computeBill(state.lines);
    var any = K.PRODUCTS.some(function (p) { var l = bill.lines[p.id]; return l && l.status === 'valid'; });
    var bad = K.PRODUCTS.some(function (p) { var l = bill.lines[p.id]; return l && (l.status === 'invalid' || l.status === 'incomplete'); });
    if (!any || bad) { toast('Pehle product ki quantity aur rate sahi bhariye'); return; }
    if (!storage) { toast('Storage not available in this window'); return; }
    var data = { name: state.name.trim() || 'Customer', lines: JSON.parse(JSON.stringify(state.lines)), oldBal: state.oldBal, cash: state.cash, online: state.online };
    var inbox = [];
    try { inbox = JSON.parse(storage.getItem(HANDOFF_KEY) || '[]'); if (!Array.isArray(inbox)) inbox = []; } catch (e) { inbox = []; }
    if (inbox.length >= 100) { toast('Daily inbox is full. Open Katai Daily Entry first.'); return; }
    inbox.push(data);
    try { storage.setItem(HANDOFF_KEY, JSON.stringify(inbox)); toast(data.name + ' will be added to Katai Daily Entry'); } catch (e) { toast('Could not save. Storage full.'); }
  }
  function init() {
    if (!storage) { $('storageNotice').hidden = false; $('saveState').classList.add('off'); $('saveText').textContent = 'Not saved'; }
    load();
    if (!state.date) state.date = todayISO();
    if (state.date < todayISO()) { if (state.savedId) state = { name: '', date: todayISO(), lines: {}, oldBal: '', cash: '', online: '', savedId: null }; state.date = todayISO(); }
    var syncFirm = function () { var f = B && B.getFirm(FIRM_KEY); $('kFirm').value = f ? f.name : ''; };
    if (B) { syncFirm(); B.mountPanel($('firmPanel'), { legacyKey: FIRM_KEY, confirm: confirmDlg, toast: toast, onChange: function () { syncFirm(); renderSaved(); schedulePreview(); } }); }
    else { try { $('kFirm').value = (storage && storage.getItem(FIRM_KEY)) || ''; } catch (e) {} }
    fill(); buildRows(); bind();
    window.KataiShare.init(toast);
    render(); renderSaved(); renderRecent(); customerList(); balanceHint();
    if (D && D.status().corrupt) { $('storageNotice').hidden = false; $('storageNotice').textContent = D.status().message; }
    window.addEventListener('storage', function (e) { if (D && e.key === 'mmh.db.v2') { renderSaved(); renderRecent(); customerList(); } });
  }
  try { init(); } catch (e) { toast('Something went wrong: ' + e.message); if (window.console) console.error(e); }

  window.__kataiSingle = { state: function () { return state; }, render: render, recordInput: recordInput, saveRecord: saveRecord };
})();
