/* ============================================================
   Katai Single Customer Bill — UI layer.
   Uses only window.KataiSingleCalc (calc.js in this folder).
   No Zinda / Chicken Calculator logic is used here.
   ============================================================ */
(function () {
  'use strict';
  var K = window.KataiSingleCalc;
  if (!K) { document.body.insertAdjacentHTML('afterbegin', '<p style="padding:16px;color:#B91C1C">Calculation engine failed to load. Please refresh.</p>'); return; }

  var KEY = 'mmh.kataiSingle.v1';
  var FIRM_KEY = 'mmh.kataiSingle.firm';
  var $ = function (id) { return document.getElementById(id); };
  var state = { name: '', date: '', lines: {}, oldBal: '', cash: '', online: '' };

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
    state.name = str(d.name, 80); state.date = str(d.date, 10); state.oldBal = str(d.oldBal); state.cash = str(d.cash); state.online = str(d.online);
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
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2600); }
  function confirmDlg(onYes) {
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
    var L = K.ledger(state, bill.total);
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
      lg.appendChild(add('Remaining Balance', K.balanceText(L.balance), 'big due-r'));
    }
    $('kErr').textContent = errs.join(' · ');
    if (bill.incomplete && !errs.length) $('kErr').textContent = bill.incomplete + ' product(s) need both quantity and rate.';
    return { bill: bill, L: L };
  }

  // ---------- Print ----------
  function buildReceipt() {
    var res = render(), bill = res.bill, L = res.L;
    if (!bill.items) return false;
    var t = function (k, v, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + k + '</td><td>' + v + '</td></tr>'; };
    var h = '<div class="rh"><div><b>' + esc(heading()) + '</b><span>Katai Bill</span></div><div class="rd">' + esc(dateText()) + '</div></div>' +
      '<div class="rn">' + esc(state.name.trim() || 'Customer') + '</div>' +
      '<table class="rt"><tr class="th"><td>Product</td><td>Qty</td><td>Rate</td><td>Amount</td></tr>';
    K.PRODUCTS.forEach(function (p) { var c = bill.lines[p.id]; if (c.status === 'valid') h += '<tr><td>' + esc(p.name) + '</td><td>' + K.qtyText(c.qty, c.unit) + '</td><td>' + K.money(c.ratePaise) + '</td><td>' + K.money(c.amount) + '</td></tr>'; });
    h += '</table><table class="rt sm">' + t('Total Bill', K.money(bill.total), 'tot');
    if (L.any && L.ok) h += t('Pichla Balance', '+ ' + K.money(L.oldBal)) + t('Total Due', K.money(L.totalDue), 'sub') + t('Rec Cash', '− ' + K.money(L.cash)) + t('Rec Online', '− ' + K.money(L.online)) + t('Remaining Balance', K.balanceText(L.balance), 'tot due');
    h += '</table><div class="rw">' + esc(K.amountInWords(L.any && L.ok ? Math.max(L.balance, 0) : bill.total)) + '</div><div class="rf">Dhanyavaad · ' + esc(heading()) + '</div>';
    $('kReceipt').innerHTML = h;
    return true;
  }
  function doPrint() {
    if (!buildReceipt()) { toast('Pehle kam se kam ek product ki quantity aur rate bhariye'); return; }
    document.body.classList.add('print-rcpt');
    var done = function () { document.body.classList.remove('print-rcpt'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    try { window.print(); } catch (e) { toast('Printing is blocked in this window.'); }
    setTimeout(function () { if (!window.matchMedia || !window.matchMedia('print').matches) done(); }, 1500);
  }

  // ---------- WhatsApp PDF ----------
  function shareBill() {
    var res = render(), bill = res.bill, L = res.L;
    if (!bill.items) { toast('Pehle kam se kam ek product ki quantity aur rate bhariye'); return; }
    var rows = [], n = 0;
    K.PRODUCTS.forEach(function (p) { var c = bill.lines[p.id]; if (c.status === 'valid') rows.push([++n, p.name, K.qtyText(c.qty, c.unit), K.money(c.ratePaise), K.money(c.amount)]); });
    var sum = [['Total Bill', K.money(bill.total), '#7C2D12', 1]];
    if (L.any && L.ok) sum.push(['Pichla Balance', K.money(L.oldBal)], ['Received (Cash + Online)', K.money(L.received)], ['Remaining Balance', K.balanceText(L.balance), '#9A3412', 1]);
    var name = state.name.trim() || 'Customer';
    var cv = window.KataiSingleShare.billCanvas({ heading: heading(), title: 'Katai Bill', customer: name, date: dateText(),
      cols: [{ h: '#', w: 50 }, { h: 'Product', w: 260, b: 1 }, { h: 'Qty', w: 170, r: 1 }, { h: 'Rate', w: 150, r: 1 }, { h: 'Amount', w: 190, r: 1, b: 1 }], rows: rows, sum: sum });
    window.KataiSingleShare.share(cv, 'Katai Bill ' + name + ' ' + dateText(), 'Katai Bill · ' + name + ' · ' + dateText());
  }

  // ---------- Events ----------
  function bind() {
    var body = $('pBody');
    var onEdit = function (e) {
      var f = e.target.dataset.f, row = e.target.closest('.p-row'); if (!f || !row) return;
      line(row.dataset.id)[f] = String(e.target.value).slice(0, 40);
      render(); save();
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
    Object.keys(map).forEach(function (id) { $(id).addEventListener('input', function () { state[map[id]] = $(id).value.slice(0, 80); render(); save(); }); });
    $('kDate').addEventListener('change', function () { state.date = /^\d{4}-\d{2}-\d{2}$/.test($('kDate').value) ? $('kDate').value : todayISO(); save(); });
    $('kFirm').addEventListener('input', function () { if (storage) try { storage.setItem(FIRM_KEY, $('kFirm').value.slice(0, 80)); } catch (e) {} });
    $('kClear').onclick = function () {
      confirmDlg(function () {
        state = { name: '', date: todayISO(), lines: {}, oldBal: '', cash: '', online: '' };
        fill(); buildRows(); render(); save(); $('kName').focus();
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

  function init() {
    if (!storage) { $('storageNotice').hidden = false; $('saveState').classList.add('off'); $('saveText').textContent = 'Not saved'; }
    load();
    if (!state.date) state.date = todayISO();
    try { $('kFirm').value = (storage && storage.getItem(FIRM_KEY)) || ''; } catch (e) {}
    fill(); buildRows(); bind();
    window.KataiSingleShare.init(toast);
    render();
  }
  try { init(); } catch (e) { toast('Something went wrong: ' + e.message); if (window.console) console.error(e); }

  window.__kataiSingle = { state: function () { return state; }, render: render };
})();
