/* ============================================================
   Katai Daily Customer Entry — UI layer.
   Uses only window.KataiCalc (../../engines/katai/calc.js).
   No Zinda / Chicken Calculator logic is used here.
   ============================================================ */
(function () {
  'use strict';
  var K = window.KataiCalc;
  if (!K) { document.body.insertAdjacentHTML('afterbegin', '<p style="padding:16px;color:#B91C1C">Calculation engine failed to load. Please refresh.</p>'); return; }

  var KEY = 'mmh.kataiDaily.v1', PREV_KEY = 'mmh.kataiDaily.previous', FIRM_KEY = 'mmh.kataiDaily.firm';
  var MAX_CUSTOMERS = 300;
  var $ = function (id) { return document.getElementById(id); };
  var uid = function () { return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var state = { date: '', sheetNo: 1, rates: {}, customers: [] };
  var selectedId = null;
  var D = window.MMHData || null, U = D && D.util;   // shared records (Statements & Reports read these)
  var SRC = 'katai-daily', recIndex = {};

  // ---------- Storage ----------
  var storage = (function () {
    try { var k = '__mmh_t'; window.localStorage.setItem(k, '1'); window.localStorage.removeItem(k); return window.localStorage; }
    catch (e) { return null; }
  })();
  var saveTimer = null;
  function save() { if (!storage) return; clearTimeout(saveTimer); $('saveText').textContent = 'Saving…'; saveTimer = setTimeout(flush, 250); }
  function flush() {
    saveTimer = null; if (!storage) return;
    try { storage.setItem(KEY, JSON.stringify(state)); $('saveText').textContent = 'Saved on this device'; $('saveState').classList.remove('off'); }
    catch (e) { $('saveText').textContent = 'Not saved (storage full)'; $('saveState').classList.add('off'); }
  }
  function str(v, max) { return typeof v === 'string' ? v.slice(0, max || 40) : ''; }
  function cleanLines(src) {
    var out = {};
    K.PRODUCTS.forEach(function (p) { var l = src && src[p.id]; if (l && typeof l === 'object') out[p.id] = { unit: K.UNITS[l.unit] ? l.unit : 'kg', qty: str(l.qty), rate: str(l.rate) }; });
    return out;
  }
  function sanitize(d) {
    var s = { date: /^\d{4}-\d{2}-\d{2}$/.test(d && d.date) ? d.date : todayISO(), sheetNo: +(d && d.sheetNo) > 0 ? Math.floor(+d.sheetNo) : 1, rates: {}, customers: [] };
    K.PRODUCTS.forEach(function (p) { var r = d && d.rates && d.rates[p.id]; if (r && typeof r === 'object') s.rates[p.id] = { unit: K.UNITS[r.unit] ? r.unit : 'kg', rate: str(r.rate) }; });
    ((d && Array.isArray(d.customers)) ? d.customers : []).slice(0, MAX_CUSTOMERS).forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      s.customers.push({ id: typeof c.id === 'string' && /^[\w-]{1,40}$/.test(c.id) ? c.id : uid(), name: str(c.name, 80), lines: cleanLines(c.lines), oldBal: str(c.oldBal), cash: str(c.cash), online: str(c.online) });
    });
    return s;
  }
  function load() {
    if (!storage) return false;
    var d = null; try { d = JSON.parse(storage.getItem(KEY) || 'null'); } catch (e) { d = null; }
    if (!d || typeof d !== 'object') return false;
    state = sanitize(d); return true;
  }

  // ---------- Helpers ----------
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }
  function todayISO() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function dateText() { var p = (state.date || todayISO()).split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function heading() { return $('dFirm').value.trim() || 'MurgaMandi Hisab'; }
  function cust(id) { for (var i = 0; i < state.customers.length; i++) if (state.customers[i].id === id) return state.customers[i]; return null; }
  function calc(c) { var bill = K.computeBill(c.lines); return { bill: bill, L: LG(c, bill.total) }; }
  var toastT;
  var autoMap = {}, prevNames = {};
  function balT(p) { var a = Math.abs(p); return p > 0 ? K.money(a) + ' Debit (lena hai)' : p < 0 ? K.money(a) + ' Credit (dena hai)' : K.money(0); }
  function LG(r, f) { return window.MMHBal ? window.MMHBal.ledger(K.ledger, r, f) : K.ledger(r, f); }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2600); }
  function confirmDlg(title, text, yes, onYes) {
    $('dlgT').textContent = title; $('dlgP').textContent = text; $('dlgYes').textContent = yes;
    var d = $('dlg'); d.classList.add('show'); $('dlgNo').focus();
    var close = function () { d.classList.remove('show'); $('dlgYes').onclick = $('dlgNo').onclick = null; };
    $('dlgNo').onclick = close;
    $('dlgYes').onclick = function () { close(); onYes(); };
  }

  // ---------- Day rates ----------
  function buildRates() {
    var g = $('rateGrid'); g.textContent = '';
    K.PRODUCTS.forEach(function (p) {
      var r = state.rates[p.id] || { unit: 'kg', rate: '' };
      var box = el('div', 'rate-box'); box.dataset.id = p.id;
      box.appendChild(el('span', 'rb-name', p.name));
      var sel = el('select'); sel.dataset.f = 'unit'; sel.setAttribute('aria-label', p.name + ' unit');
      Object.keys(K.UNITS).forEach(function (u) { var o = el('option', null, K.UNITS[u].label); o.value = u; if (u === r.unit) o.selected = true; sel.appendChild(o); });
      var inp = el('input', 'n'); inp.dataset.f = 'rate'; inp.inputMode = 'decimal'; inp.autocomplete = 'off'; inp.placeholder = 'Rate ₹'; inp.value = r.rate; inp.setAttribute('aria-label', p.name + ' rate');
      box.appendChild(sel); box.appendChild(inp); g.appendChild(box);
    });
  }
  function onRateEdit(e) {
    var box = e.target.closest('.rate-box'), f = e.target.dataset.f; if (!box || !f) return;
    var r = state.rates[box.dataset.id] || (state.rates[box.dataset.id] = { unit: 'kg', rate: '' });
    r[f] = String(e.target.value).slice(0, 40);
    if (f === 'rate') { var v = K.parseScaled(r.rate, 2); e.target.classList.toggle('err', r.rate.trim() !== '' && !(v > 0)); }
    save();
  }
  function fillEmptyRates() {
    var n = 0;
    state.customers.forEach(function (c) {
      K.PRODUCTS.forEach(function (p) {
        var r = state.rates[p.id]; if (!r || !(K.parseScaled(r.rate, 2) > 0)) return;
        var l = c.lines[p.id] || (c.lines[p.id] = { unit: r.unit, qty: '', rate: '' });
        if (String(l.rate).trim() === '') { l.rate = r.rate; if (String(l.qty).trim() === '') l.unit = r.unit; n++; }
      });
    });
    renderAll(); save(); toast(n ? n + ' empty rate(s) filled' : 'No empty rates to fill');
  }

  // ---------- Customers ----------
  function newCustomer() {
    var lines = {};
    K.PRODUCTS.forEach(function (p) { var r = state.rates[p.id]; lines[p.id] = { unit: r ? r.unit : 'kg', qty: '', rate: r && K.parseScaled(r.rate, 2) > 0 ? r.rate : '' }; });
    return { id: uid(), name: '', lines: lines, oldBal: '', cash: '', online: '' };
  }
  function addCustomer() {
    if (state.customers.length >= MAX_CUSTOMERS) { toast('Maximum of ' + MAX_CUSTOMERS + ' customers per sheet'); return; }
    var c = newCustomer(); state.customers.push(c); selectedId = c.id;
    $('search').value = '';
    renderAll(); save(); $('eName').focus();
  }
  function deleteCustomer(id) {
    var c = cust(id); if (!c) return;
    var hasRec = !!recIndex[srcKey(id)];
    confirmDlg('Delete this customer?', (c.name.trim() || 'This customer') + ' and all their products will be removed.' + (hasRec ? ' The saved record of this customer is also removed from Statements & Reports.' : ''), 'Delete', function () {
      if (hasRec && D) { D.deleteBySourceKey(srcKey(id)); refreshIndex(); }
      state.customers = state.customers.filter(function (x) { return x.id !== id; });
      if (selectedId === id) selectedId = null;
      renderAll(); save(); toast('Customer deleted');
    });
  }
  function clearAll() {
    var st = recordStats(), warn = st.unsaved + st.changed;
    confirmDlg('Start a new day?', 'All customers on this sheet will be removed. Records already saved stay in Statements & Reports. The current sheet is kept as a backup you can restore once.' + (warn ? ' ' + warn + ' customer(s) are not saved to records yet.' : ''), 'Clear All', function () {
      if (storage) try { storage.setItem(PREV_KEY, JSON.stringify(state)); } catch (e) {}
      state = { date: todayISO(), sheetNo: state.sheetNo + 1, rates: state.rates, customers: [] };
      selectedId = null; $('search').value = ''; $('dDate').value = state.date;
      renderAll(); save(); showUndo();
    });
  }
  function showUndo() {
    var t = $('toast'); t.textContent = 'Sheet cleared. ';
    var b = el('button', 'toast-btn', 'Undo'); b.type = 'button';
    b.onclick = function () {
      var d = null; try { d = JSON.parse(storage.getItem(PREV_KEY) || 'null'); } catch (e) {}
      if (!d) return; state = sanitize(d); try { storage.removeItem(PREV_KEY); } catch (e) {}
      $('dDate').value = state.date; renderAll(); flush(); t.classList.remove('show'); toast('Previous sheet restored');
    };
    t.appendChild(b); t.classList.add('show', 'act'); clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('show', 'act'); }, 8000);
  }

  // ---------- Render: customer list ----------
  function renderList() {
    var body = $('cBody'); body.textContent = '';
    var q = $('search').value.trim().toLowerCase();
    var tot = { items: 0, bill: 0, old: 0, rec: 0, cash: 0, online: 0, bal: 0, n: 0 };
    state.customers.forEach(function (c, i) {
      var r = calc(c);
      tot.items += r.bill.items; tot.bill += r.bill.total; tot.n += (r.bill.items || r.L.any) ? 1 : 0;
      if (r.L.ok) { tot.old += r.L.oldBal; tot.rec += r.L.received; tot.cash += r.L.cash; tot.online += r.L.online; tot.bal += r.L.balance; }
      var tr = el('tr'); tr.dataset.id = c.id;
      if (c.id === selectedId) tr.className = 'sel';
      if (q && c.name.toLowerCase().indexOf(q) < 0) tr.hidden = true;
      tr.appendChild(el('td', 'c-idx', String(i + 1)));
      var nm = el('td', 'c-name'); var nb = el('button', 'link', c.name.trim() || 'Unnamed customer'); nb.type = 'button'; nb.dataset.act = 'edit'; nm.appendChild(nb);
      if (r.bill.invalid || r.bill.incomplete || !r.L.ok) nm.appendChild(el('span', 'status', 'Check'));
      var rs = rowRecState(c);
      if (rs === 'saved') nm.appendChild(el('span', 'rec-chip ok', 'Saved'));
      else if (rs === 'changed') nm.appendChild(el('span', 'rec-chip chg', 'Changed'));
      else if (rs === 'unsaved') nm.appendChild(el('span', 'rec-chip', 'Not saved'));
      tr.appendChild(nm);
      tr.appendChild(el('td', 'ra', String(r.bill.items)));
      tr.appendChild(el('td', 'ra fin', K.money(r.bill.total)));
      tr.appendChild(el('td', 'ra', r.L.ok ? K.money(r.L.oldBal) : '—'));
      tr.appendChild(el('td', 'ra', r.L.ok ? K.money(r.L.received) : '—'));
      tr.appendChild(el('td', 'ra due' + (r.L.ok && r.L.balance < 0 ? ' adv' : ''), r.L.ok ? balT(r.L.balance) : '—'));
      var act = el('td', 'c-act');
      var wa = el('button', 'ic wa1', '⇪'); wa.type = 'button'; wa.dataset.act = 'wa'; wa.title = 'WhatsApp bill'; wa.setAttribute('aria-label', 'WhatsApp bill');
      var img = el('img'); img.src = '../../assets/icons/whatsapp-green.svg'; img.alt = ''; img.width = 16; img.height = 16; wa.textContent = ''; wa.appendChild(img);
      var del = el('button', 'ic del', '✕'); del.type = 'button'; del.dataset.act = 'del'; del.title = 'Delete'; del.setAttribute('aria-label', 'Delete customer');
      act.appendChild(wa); act.appendChild(del); tr.appendChild(act);
      body.appendChild(tr);
    });
    $('cEmpty').hidden = state.customers.length > 0;
    $('fItems').textContent = String(tot.items); $('fBill').textContent = K.money(tot.bill); $('fOld').textContent = K.money(tot.old);
    $('fRec').textContent = K.money(tot.rec); $('fBal').textContent = balT(tot.bal);
    $('tCust').textContent = String(tot.n); $('tRec').textContent = K.money(tot.rec); $('tRecSplit').textContent = 'Cash ' + K.money(tot.cash) + ' · Online ' + K.money(tot.online);
    $('tBal').textContent = balT(tot.bal); $('tBill').textContent = K.money(tot.bill); $('tWords').textContent = K.amountInWords(tot.bill);
    $('sheetNo').textContent = '#' + state.sheetNo;
    updateRecMeta();
    return tot;
  }

  // ---------- Saved records (one record per customer row, keyed by the row id) ----------
  function srcKey(id) { return SRC + ':' + id; }
  function refreshIndex() { recIndex = {}; if (!D) return; D.transactions({ source: SRC }).forEach(function (r) { if (r.sourceKey) recIndex[r.sourceKey] = r; }); }
  /** What this customer row would save, using only the Katai engine. null = nothing to record. */
  function rowRecord(c) {
    var name = String(c.name || '').trim(), r = calc(c);
    var anyLine = K.PRODUCTS.some(function (p) { var l = r.bill.lines[p.id]; return l.status !== 'empty'; });
    if (!name) return (r.bill.items || r.L.any) ? { bad: true, why: 'name' } : null;
    if (r.bill.invalid || r.bill.incomplete || !r.L.ok) return { bad: true };
    var base = { section: 'katai', source: SRC, sourceKey: srcKey(c.id), date: state.date || todayISO(), customerName: name, firm: $('dFirm').value.trim() };
    if (r.bill.items) {
      var lines = [];
      K.PRODUCTS.forEach(function (p) { var l = r.bill.lines[p.id]; if (l.status === 'valid') lines.push({ product: p.id, name: p.name, unit: l.unit, qty: K.plainQty(l.qty), ratePaise: l.ratePaise, amount: l.amount }); });
      base.amount = r.bill.total; base.cash = r.L.cash; base.online = r.L.online; base.prevBalance = r.L.oldBal; base.balance = r.L.balance; base.lines = lines; base.details = { items: r.bill.items };
      return { kind: 'bill', input: base };
    }
    if (anyLine) return { bad: true };
    if (r.L.cash + r.L.online <= 0) return null;
    base.cash = r.L.cash; base.online = r.L.online; base.prevBalance = r.L.oldBal; base.balance = r.L.balance;
    return { kind: 'payment', input: base };
  }
  function rowRecState(c) {
    var rr = rowRecord(c), rec = recIndex[srcKey(c.id)];
    if (!rr) return rec ? 'changed' : 'none';
    if (rr.bad) return rec ? 'changed' : 'bad';
    if (!rec) return 'unsaved';
    var i = rr.input;
    var same = rec.kind === rr.kind && rec.date === i.date && rec.customerName === i.customerName && (rec.firm || '') === i.firm && rec.cash === i.cash && rec.online === i.online && rec.prevBalance === i.prevBalance && (rr.kind === 'payment' || (rec.amount === i.amount && JSON.stringify(rec.lines) === JSON.stringify(i.lines)));
    return same ? 'saved' : 'changed';
  }
  function recordStats() { var st = { saved: 0, changed: 0, unsaved: 0, bad: 0, none: 0 }; state.customers.forEach(function (c) { st[rowRecState(c)]++; }); return st; }
  function updateRecMeta() {
    var m = $('recMeta'); if (!m) return;
    if (!D) { m.textContent = 'Records not available in this window'; return; }
    var st = recordStats(), parts = [st.saved + ' saved to records'];
    if (st.changed) parts.push(st.changed + ' changed since saving');
    if (st.unsaved) parts.push(st.unsaved + ' not saved');
    m.textContent = 'Records for ' + U.dateText(state.date) + ': ' + parts.join(' · ');
    m.classList.toggle('warn-t', !!(st.changed || st.unsaved));
  }
  function saveToRecords(allowDuplicate) {
    if (!D) { toast('Records are not available in this window'); return; }
    refreshIndex();
    var items = [], bad = 0, dupNames = [];
    state.customers.forEach(function (c) {
      var rr = rowRecord(c); if (!rr) return; if (rr.bad) { bad++; return; }
      items.push(rr);
      if (!allowDuplicate && !recIndex[rr.input.sourceKey] && D.findDuplicates(rr.kind, rr.input).length) dupNames.push(rr.input.customerName);
    });
    if (!items.length) { toast(bad ? 'Customers have errors (name, quantity or rate). Fix them first.' : 'Nothing to save yet. Add customers with products first.'); return; }
    if (dupNames.length) {
      confirmDlg('Possible duplicate entries', 'Already saved for ' + U.dateText(state.date) + ' with the same amount: ' + dupNames.slice(0, 6).join(', ') + (dupNames.length > 6 ? ' and ' + (dupNames.length - 6) + ' more' : '') + '. Save them again?', 'Save anyway', function () { saveToRecords(true); });
      return;
    }
    var res = D.saveBatch(items, { allowDuplicate: true });
    refreshIndex(); renderList();
    if (!res.ok) { toast(res.error || 'Could not save records'); return; }
    var msg = (res.created ? res.created + ' new' : '') + (res.created && res.updated ? ', ' : '') + (res.updated ? res.updated + ' updated' : '');
    toast('Saved to records: ' + (msg || 'no changes') + (bad ? ' · ' + bad + ' customer(s) with errors skipped' : '') + (res.errors.length ? ' · ' + res.errors.length + ' not saved' : ''));
  }

  // ---------- Render: product-wise totals ----------
  function productTotals() {
    var t = {}; K.PRODUCTS.forEach(function (p) { t[p.id] = { kg: 0, pcs: 0, amt: 0 }; });
    state.customers.forEach(function (c) {
      var b = K.computeBill(c.lines);
      K.PRODUCTS.forEach(function (p) { var l = b.lines[p.id]; if (l.status !== 'valid') return; if (l.unit === 'pcs') t[p.id].pcs += l.qty / 1000; else t[p.id].kg += l.qty; t[p.id].amt += l.amount; });
    });
    return t;
  }
  function renderProductTotals() {
    var t = productTotals(), body = $('ptBody'); body.textContent = '';
    var sum = { kg: 0, pcs: 0, amt: 0 };
    K.PRODUCTS.forEach(function (p) {
      var x = t[p.id]; sum.kg += x.kg; sum.pcs += x.pcs; sum.amt += x.amt;
      var tr = el('tr'); if (!x.amt) tr.className = 'zero';
      tr.appendChild(el('td', null, p.name)); tr.appendChild(el('td', 'ra', x.kg ? K.qtyText(x.kg, 'kg') : '—'));
      tr.appendChild(el('td', 'ra', x.pcs ? K.qtyText(x.pcs * 1000, 'pcs') : '—')); tr.appendChild(el('td', 'ra', K.money(x.amt)));
      body.appendChild(tr);
    });
    var tr = el('tr', 'tot'); tr.appendChild(el('td', null, 'TOTAL')); tr.appendChild(el('td', 'ra', K.qtyText(sum.kg, 'kg')));
    tr.appendChild(el('td', 'ra', K.qtyText(sum.pcs * 1000, 'pcs'))); tr.appendChild(el('td', 'ra', K.money(sum.amt))); body.appendChild(tr);
  }

  // ---------- Render: editor ----------
  function buildEditor() {
    var c = cust(selectedId);
    $('edBody').hidden = !c; $('edEmpty').hidden = !!c; $('editor').classList.toggle('open', !!c);
    if (!c) return;
    var idx = state.customers.indexOf(c) + 1;
    $('edTitle').textContent = 'Customer ' + idx;
    $('eName').value = c.name; $('eOld').value = c.oldBal; $('eCash').value = c.cash; $('eOnline').value = c.online;
    var body = $('pBody'); body.textContent = '';
    K.PRODUCTS.forEach(function (p) {
      var l = c.lines[p.id] || (c.lines[p.id] = { unit: 'kg', qty: '', rate: '' });
      var row = el('div', 'p-row'); row.setAttribute('role', 'row'); row.dataset.id = p.id;
      row.appendChild(el('div', 'p-name', p.name));
      var uc = el('div', 'p-unit'), sel = el('select'); sel.dataset.f = 'unit'; sel.setAttribute('aria-label', p.name + ' unit');
      Object.keys(K.UNITS).forEach(function (u) { var o = el('option', null, K.UNITS[u].label); o.value = u; if (u === l.unit) o.selected = true; sel.appendChild(o); });
      uc.appendChild(sel); row.appendChild(uc);
      ['qty', 'rate'].forEach(function (f) {
        var cc = el('div', 'p-' + f), inp = el('input', 'n'); inp.dataset.f = f; inp.inputMode = 'decimal'; inp.autocomplete = 'off'; inp.value = l[f]; inp.setAttribute('aria-label', p.name + ' ' + (f === 'qty' ? 'quantity' : 'rate'));
        cc.appendChild(inp); row.appendChild(cc);
      });
      var a = el('div', 'p-amt', '—'); a.dataset.o = 'amt'; row.appendChild(a);
      body.appendChild(row);
    });
    renderEditor();
  }
  function renderEditor() {
    var c = cust(selectedId); if (!c) return;
    var r = calc(c), errs = [];
    K.PRODUCTS.forEach(function (p) {
      var row = $('pBody').querySelector('[data-id="' + p.id + '"]'); if (!row) return;
      var l = r.bill.lines[p.id];
      row.querySelector('[data-f="qty"]').classList.toggle('err', !!l.errors.qty);
      row.querySelector('[data-f="rate"]').classList.toggle('err', !!l.errors.rate);
      row.querySelector('[data-f="qty"]').inputMode = l.unit === 'pcs' ? 'numeric' : 'decimal';
      row.classList.toggle('on', l.status === 'valid');
      row.querySelector('[data-o="amt"]').textContent = l.status === 'valid' ? K.money(l.amount) : l.status === 'incomplete' ? 'Fill both' : l.status === 'invalid' ? 'Check' : '—';
      Object.keys(l.errors).forEach(function (k) { errs.push(p.name + ': ' + l.errors[k]); });
    });
    var map = { oldBal: 'eOld', cash: 'eCash', online: 'eOnline' };
    Object.keys(map).forEach(function (f) { $(map[f]).classList.toggle('err', !!r.L.errors[f]); if (r.L.errors[f]) errs.push(r.L.errors[f]); });
    var s = $('edSum'); s.textContent = '';
    var add = function (k, v, cls) { var d = el('div', 'rc' + (cls ? ' ' + cls : '')); d.appendChild(el('span', 'k', k)); d.appendChild(el('span', 'val', v)); s.appendChild(d); };
    add('Aaj ka Bill (' + r.bill.items + ' item' + (r.bill.items === 1 ? '' : 's') + ')', K.money(r.bill.total), 'big');
    if (r.L.any && r.L.ok) { add('Total Due (bill + pichla)', K.money(r.L.totalDue)); add('Received (cash + online)', '− ' + K.money(r.L.received)); add('Remaining Balance', balT(r.L.balance), 'big due-r'); }
    $('eErr').textContent = errs.length ? errs.join(' · ') : (r.bill.incomplete ? r.bill.incomplete + ' product(s) need both quantity and rate.' : '');
  }
  function renderAll() { renderList(); renderProductTotals(); buildEditor(); }

  // ---------- Export ----------
  function exportData() {
    var head = ['S.No', 'Customer', 'Product', 'Unit', 'Quantity', 'Rate', 'Amount'];
    var rows = [], ledgerRows = [], n = 0, grand = 0, gOld = 0, gCash = 0, gOnline = 0, gBal = 0;
    state.customers.forEach(function (c) {
      var r = calc(c); if (!r.bill.items && !r.L.any) return;
      n++;
      K.PRODUCTS.forEach(function (p) { var l = r.bill.lines[p.id]; if (l.status === 'valid') rows.push([n, c.name.trim() || 'Customer', p.name, K.UNITS[l.unit].label, K.plainQty(l.qty), K.plain(l.ratePaise), K.plain(l.amount)]); });
      if (r.L.ok) { gOld += r.L.oldBal; gCash += r.L.cash; gOnline += r.L.online; gBal += r.L.balance; }
      grand += r.bill.total;
      ledgerRows.push([n, c.name.trim() || 'Customer', r.bill.items, K.plain(r.bill.total), r.L.ok ? K.plain(r.L.oldBal) : '', r.L.ok ? K.plain(r.L.cash) : '', r.L.ok ? K.plain(r.L.online) : '', r.L.ok ? K.plain(r.L.balance) : '']);
    });
    return { head: head, rows: rows, ledHead: ['S.No', 'Customer', 'Items', 'Aaj ka Bill', 'Pichla Balance', 'Rec Cash', 'Rec Online', 'Balance'], ledRows: ledgerRows,
      ledTotal: ['', 'TOTAL', '', K.plain(grand), K.plain(gOld), K.plain(gCash), K.plain(gOnline), K.plain(gBal)], count: n, grand: grand };
  }
  function stamp() { return state.date || todayISO(); }
  function download(name, mime, content) {
    try {
      var url = URL.createObjectURL(new Blob([content], { type: mime }));
      var a = el('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500); toast('Downloaded ' + name);
    } catch (e) { toast('Download blocked in this window.'); }
  }
  function csvCell(v) { v = String(v); if (/^[=+\-@]/.test(v) && isNaN(+v)) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function exportCSV() {
    var d = exportData(); if (!d.count) { toast('No customer entries to export'); return; }
    var lines = [d.ledHead].concat(d.ledRows, [d.ledTotal], [[]], [d.head], d.rows).map(function (r) { return r.map(csvCell).join(','); });
    download('katai-daily-' + stamp() + '.csv', 'text/csv;charset=utf-8', '\uFEFF' + lines.join('\r\n'));
  }
  function exportExcel() {
    var d = exportData(); if (!d.count) { toast('No customer entries to export'); return; }
    var x = function (v) { return String(v).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); };
    var cell = function (v, style, num) { if (v === '' || v == null) return '<Cell' + (style ? ' ss:StyleID="' + style + '"' : '') + '/>'; return '<Cell' + (style ? ' ss:StyleID="' + style + '"' : '') + '><Data ss:Type="' + (num ? 'Number' : 'String') + '">' + x(v) + '</Data></Cell>'; };
    var sheet = function (name, head, rows, total, moneyCols, textCols) {
      var r = '<Row>' + head.map(function (h) { return cell(h, 'h'); }).join('') + '</Row>';
      rows.forEach(function (row) { r += '<Row>' + row.map(function (v, i) { return cell(v, moneyCols.indexOf(i) >= 0 ? 'money' : null, textCols.indexOf(i) < 0); }).join('') + '</Row>'; });
      if (total) r += '<Row>' + total.map(function (v, i) { return cell(v, moneyCols.indexOf(i) >= 0 ? 'totm' : 'tot', i > 1 && v !== ''); }).join('') + '</Row>';
      return '<Worksheet ss:Name="' + x(name) + '"><Table><Column ss:Width="40"/><Column ss:Width="180"/>' + '<Column ss:Width="90"/>'.repeat(6) + r + '</Table></Worksheet>';
    };
    var xml = '<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
      '<Styles><Style ss:ID="h"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0B4F8A" ss:Pattern="Solid"/></Style>' +
      '<Style ss:ID="money"><NumberFormat ss:Format="&quot;₹&quot;#,##,##0.00"/></Style>' +
      '<Style ss:ID="tot"><Font ss:Bold="1"/><Interior ss:Color="#EEF4FB" ss:Pattern="Solid"/></Style>' +
      '<Style ss:ID="totm"><Font ss:Bold="1"/><Interior ss:Color="#EEF4FB" ss:Pattern="Solid"/><NumberFormat ss:Format="&quot;₹&quot;#,##,##0.00"/></Style></Styles>' +
      sheet('Customers ' + stamp(), d.ledHead, d.ledRows, d.ledTotal, [3, 4, 5, 6, 7], [1]) +
      sheet('Products ' + stamp(), d.head, d.rows, null, [5, 6], [1, 2, 3]) + '</Workbook>';
    download('katai-daily-' + stamp() + '.xls', 'application/vnd.ms-excel', xml);
  }

  // ---------- Print ----------
  function doPrint() {
    if (!state.customers.length) { toast('Pehle koi customer add kijiye'); return; }
    $('printFirm').textContent = heading(); $('printDate').textContent = 'Sheet #' + state.sheetNo + ' · ' + dateText();
    $('search').value = ''; renderList();
    try { window.print(); } catch (e) { toast('Printing is blocked in this window.'); }
  }

  // ---------- WhatsApp PDF ----------
  function shareCustomer(id) {
    var c = cust(id); if (!c) return;
    var r = calc(c); if (!r.bill.items) { toast('Is customer ka koi product complete nahi hai'); return; }
    var rows = [], n = 0;
    K.PRODUCTS.forEach(function (p) { var l = r.bill.lines[p.id]; if (l.status === 'valid') rows.push([++n, p.name, K.qtyText(l.qty, l.unit), K.money(l.ratePaise), K.money(l.amount)]); });
    var sum = [['Total Bill', K.money(r.bill.total), '#0B4F8A', 1]];
    if (r.L.any && r.L.ok) sum.push(['Pichla Balance', balT(r.L.oldBal)], ['Received (Cash + Online)', K.money(r.L.received)], ['Remaining Balance', balT(r.L.balance), '#B45309', 1]);
    var name = c.name.trim() || 'Customer';
    var cv = window.KataiShare.billCanvas({ heading: heading(), title: 'Katai Bill', customer: name, date: dateText(),
      cols: [{ h: '#', w: 50 }, { h: 'Product', w: 260, b: 1 }, { h: 'Qty', w: 170, r: 1 }, { h: 'Rate', w: 150, r: 1 }, { h: 'Amount', w: 190, r: 1, b: 1 }], rows: rows, sum: sum });
    window.KataiShare.share(cv, 'Katai Bill ' + name + ' ' + dateText(), 'Katai Bill · ' + name + ' · ' + dateText());
  }
  function shareSheet() {
    var d = exportData(); if (!d.count) { toast('Pehle kam se kam ek customer ka bill bhariye'); return; }
    var M = function (v) { return v === '' ? '—' : K.money(Math.round(parseFloat(v) * 100)); };
    var B = function (v) { return v === '' ? '—' : balT(Math.round(parseFloat(v) * 100)); };
    var rows = d.ledRows.map(function (r) { return [r[0], r[1], r[2], M(r[3]), M(r[4]), M(r[5]), M(r[6]), B(r[7])]; });
    var T = d.ledTotal; rows.push(['', 'TOTAL', '', M(T[3]), M(T[4]), M(T[5]), M(T[6]), B(T[7])]);
    var rec = Math.round(parseFloat(T[5]) * 100) + Math.round(parseFloat(T[6]) * 100);
    var cv = window.KataiShare.billCanvas({ heading: heading(), title: 'Katai Daily Entry · ' + d.count + ' customers', date: dateText(),
      cols: [{ h: '#', w: 44 }, { h: 'Customer', w: 240, b: 1 }, { h: 'Items', w: 70, r: 1 }, { h: 'Aaj ka Bill', w: 140, r: 1, b: 1 }, { h: 'Pichla', w: 130, r: 1 }, { h: 'Cash', w: 120, r: 1 }, { h: 'Online', w: 120, r: 1 }, { h: 'Balance', w: 150, r: 1, b: 1 }],
      rows: rows, bold: [rows.length - 1],
      sum: [['Aaj ka Total Bill', M(T[3]), '#0B4F8A', 1], ['Pichla Balance', M(T[4])], ['Received', K.money(rec)], ['Total Balance', B(T[7]), '#B45309', 1]] });
    window.KataiShare.share(cv, 'Katai-Daily-' + stamp(), 'Katai Daily · ' + dateText());
  }

  // ---------- Events ----------
  function bind() {
    $('btnAdd').onclick = addCustomer;
    $('btnSaveRec').onclick = function () { saveToRecords(false); };
    $('btnClear').onclick = clearAll;
    $('btnExcel').onclick = exportExcel; $('btnCsv').onclick = exportCSV; $('btnPrint').onclick = doPrint; $('btnWa').onclick = shareSheet;
    $('btnRates').onclick = function () { var c = $('ratesCard'); c.hidden = !c.hidden; $('btnRates').setAttribute('aria-expanded', String(!c.hidden)); };
    $('btnFillRates').onclick = fillEmptyRates;
    $('rateGrid').addEventListener('input', onRateEdit);
    $('rateGrid').addEventListener('change', function (e) { if (e.target.tagName === 'SELECT') onRateEdit(e); });
    $('search').addEventListener('input', renderList);
    $('dDate').addEventListener('change', function () { state.date = /^\d{4}-\d{2}-\d{2}$/.test($('dDate').value) ? $('dDate').value : todayISO(); $('dDate').value = state.date; save(); renderList(); });
    $('dFirm').addEventListener('input', function () { if (storage) try { storage.setItem(FIRM_KEY, $('dFirm').value.slice(0, 80)); } catch (e) {} renderList(); });
    $('cBody').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'), tr = e.target.closest('tr'); if (!tr) return;
      var id = tr.dataset.id, act = b ? b.dataset.act : 'edit';
      if (act === 'del') deleteCustomer(id);
      else if (act === 'wa') shareCustomer(id);
      else { selectedId = id; renderList(); buildEditor(); if (window.matchMedia('(max-width:900px)').matches) $('editor').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
    var onLine = function (e) {
      var c = cust(selectedId), f = e.target.dataset.f, row = e.target.closest('.p-row'); if (!c || !f || !row) return;
      var l = c.lines[row.dataset.id] || (c.lines[row.dataset.id] = { unit: 'kg', qty: '', rate: '' });
      l[f] = String(e.target.value).slice(0, 40);
      renderEditor(); renderList(); renderProductTotals(); save();
    };
    $('pBody').addEventListener('input', onLine);
    $('pBody').addEventListener('change', function (e) { if (e.target.tagName === 'SELECT') onLine(e); });
    $('pBody').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return; e.preventDefault();
      var nx = e.target.closest('.p-row').nextElementSibling, i = nx && nx.querySelector('[data-f="' + e.target.dataset.f + '"]'); if (i) { i.focus(); i.select(); }
    });
    var fmap = { eName: 'name', eOld: 'oldBal', eCash: 'cash', eOnline: 'online' };
    Object.keys(fmap).forEach(function (id) {
      $(id).addEventListener('input', function () { var c = cust(selectedId); if (!c) return; c[fmap[id]] = $(id).value.slice(0, fmap[id] === 'name' ? 80 : 40); renderEditor(); renderList(); save(); });
    });
    $('eName').addEventListener('focus', function () { if (selectedId) prevNames[selectedId] = $('eName').value.trim(); });
    $('eName').addEventListener('change', function () {
      var BB = window.MMHBal, c = cust(selectedId); if (!BB || !c) return;
      var cur = String(c.oldBal).trim(), pn = prevNames[c.id] || '', o0 = { onOrBefore: state.date || todayISO(), excludeSourceKey: srcKey(c.id) };
      var mine = cur === '' || autoMap[c.id] === cur || (!!pn && pn !== c.name.trim() && BB.isBalanceOf('katai', pn, cur, o0)); prevNames[c.id] = c.name.trim(); if (!mine) return;
      var lb = c.name.trim() ? BB.current('katai', c.name, { onOrBefore: state.date || todayISO(), excludeSourceKey: srcKey(c.id) }) : null;
      if (!lb) { if (cur === '') return; c.oldBal = ''; delete autoMap[c.id]; $('eOld').value = ''; renderEditor(); renderList(); save(); return; }
      if (cur === BB.fieldText(lb.balance)) return;
      c.oldBal = autoMap[c.id] = BB.fieldText(lb.balance); $('eOld').value = c.oldBal; renderEditor(); renderList(); save();
      toast(c.name.trim() + ': pichla balance ' + (U ? U.balanceText(lb.balance) : c.oldBal) + ' bhar diya');
    });
    $('edClose').onclick = function () { selectedId = null; renderList(); buildEditor(); };
    $('edDel').onclick = function () { if (selectedId) deleteCustomer(selectedId); };
    $('edWa').onclick = function () { if (selectedId) shareCustomer(selectedId); };
    $('edNext').onclick = function () {
      var i = state.customers.indexOf(cust(selectedId));
      if (i >= 0 && i < state.customers.length - 1) { selectedId = state.customers[i + 1].id; renderList(); buildEditor(); $('eName').focus(); }
      else addCustomer();
    };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { $('dlg').classList.remove('show'); $('shareDlg').classList.remove('show'); } });
    window.addEventListener('beforeprint', function () { $('printFirm').textContent = heading(); $('printDate').textContent = 'Sheet #' + state.sheetNo + ' · ' + dateText(); });
    window.addEventListener('beforeunload', function () { if (saveTimer) { clearTimeout(saveTimer); flush(); } });
  }

  // ---------- Bills sent from Katai Single Customer Bill ----------
  var HANDOFF_KEY = 'mmh.kataiDaily.inbox';
  function takeInbox() {
    if (!storage) return 0;
    var inbox = [];
    try { inbox = JSON.parse(storage.getItem(HANDOFF_KEY) || '[]'); } catch (e) { inbox = []; }
    if (!Array.isArray(inbox) || !inbox.length) return 0;
    var n = 0;
    inbox.forEach(function (d) {
      if (!d || typeof d !== 'object' || state.customers.length >= MAX_CUSTOMERS) return;
      var c = { id: uid(), name: str(d.name, 80), lines: cleanLines(d.lines), oldBal: str(d.oldBal), cash: str(d.cash), online: str(d.online) };
      K.PRODUCTS.forEach(function (p) { if (!c.lines[p.id]) { var r = state.rates[p.id]; c.lines[p.id] = { unit: r ? r.unit : 'kg', qty: '', rate: '' }; } });
      var blank = state.customers.filter(function (x) { return !x.name.trim() && !K.PRODUCTS.some(function (p) { var l = x.lines[p.id]; return l && String(l.qty).trim(); }); })[0];
      if (blank) { blank.name = c.name; blank.lines = c.lines; blank.oldBal = c.oldBal; blank.cash = c.cash; blank.online = c.online; }
      else state.customers.push(c);
      n++;
    });
    try { storage.removeItem(HANDOFF_KEY); } catch (e) {}
    return n;
  }

  function init() {
    if (!storage) { $('storageNotice').hidden = false; $('saveState').classList.add('off'); $('saveText').textContent = 'Not saved'; }
    if (!load()) state.date = todayISO();
    try { $('dFirm').value = (storage && storage.getItem(FIRM_KEY)) || ''; } catch (e) {}
    $('dDate').value = state.date;
    buildRates(); bind();
    window.KataiShare.init(toast);
    if (window.MMHBal) { window.MMHBal.picker('katai', document, '#eName'); window.MMHBal.mount({ section: 'katai', raise: true, toast: toast, confirm: confirmDlg }); }
    var got = takeInbox();
    selectedId = state.customers[0] ? state.customers[0].id : null;
    refreshIndex();
    renderAll();
    if (D && D.status().corrupt) { $('storageNotice').hidden = false; $('storageNotice').textContent = D.status().message; }
    window.addEventListener('storage', function (e) { if (e.key === 'mmh.db.v2') { refreshIndex(); renderList(); } });
    if (got) { $('inbox').textContent = got + ' bill' + (got === 1 ? '' : 's') + ' added from Katai Single Customer Bill.'; $('inbox').classList.add('show'); save(); }
  }
  try { init(); } catch (e) { toast('Something went wrong: ' + e.message); if (window.console) console.error(e); }

  window.__kataiDaily = { state: function () { return state; }, addCustomer: addCustomer, exportData: exportData, productTotals: productTotals, esc: esc, saveToRecords: saveToRecords, recordStats: recordStats };
})();
