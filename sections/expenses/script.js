/* ============================================================
   Expense Management · UI layer.
   Saves expenses through the shared data service (so Statements &
   Reports can read them); totals come from expense-calc.js;
   downloads go through the shared export service.
   ============================================================ */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var D = window.MMHData, U = D && D.util, X = window.MMHExport, EC = window.ExpenseCalc;
  if (!D || !EC) { document.body.insertAdjacentHTML('afterbegin', '<p style="padding:16px;color:#B91C1C">Expense records could not be loaded. Please refresh.</p>'); return; }

  var VIEW_KEY = 'mmh.expenses.view';
  var view = { kind: 'month', day: '', month: '', year: '', from: '', to: '', cat: 'all', mode: 'all', q: '' };
  var editId = null;

  // ---------- helpers ----------
  var toastT;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2800); }
  function confirmDlg(title, text, yes, onYes) {
    $('dlgT').textContent = title; $('dlgP').textContent = text; $('dlgYes').textContent = yes;
    var d = $('dlg'); d.classList.add('show'); $('dlgNo').focus();
    var close = function () { d.classList.remove('show'); $('dlgYes').onclick = $('dlgNo').onclick = null; };
    $('dlgNo').onclick = close; $('dlgYes').onclick = function () { close(); onYes(); };
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function td(tr, text, cls, label) { var c = el('td', cls, text); if (label) c.setAttribute('data-label', label); tr.appendChild(c); return c; }
  function opt(sel, value, text) { var o = el('option', null, text); o.value = value; sel.appendChild(o); return o; }
  function today() { return U.todayISO(); }

  // ---------- categories ----------
  function fillCategories() {
    var cats = D.categories(), f = $('fCat'), v = $('vCat'), fv = f.value, vv = v.value || view.cat;
    f.textContent = ''; v.textContent = '';
    opt(f, '', 'Choose category…');
    opt(v, 'all', 'All categories');
    cats.forEach(function (c) { opt(f, c.id, c.name); opt(v, c.id, c.name); });
    f.value = cats.some(function (c) { return c.id === fv; }) ? fv : '';
    v.value = vv === 'all' || cats.some(function (c) { return c.id === vv; }) ? vv : 'all';
    view.cat = v.value;
    var ul = $('catList'); ul.textContent = '';
    cats.filter(function (c) { return c.custom; }).forEach(function (c) {
      var li = el('li'); li.appendChild(el('span', null, c.name));
      var b = el('button', 'mini danger', 'Remove'); b.type = 'button'; b.dataset.id = c.id; li.appendChild(b); ul.appendChild(li);
    });
    if (!ul.children.length) ul.appendChild(el('li', 'muted', 'No custom categories yet.'));
  }
  function addCategory() {
    var r = D.addCategory($('catName').value);
    if (!r.ok) { toast(r.error); return; }
    $('catName').value = ''; fillCategories(); $('fCat').value = r.category.id; toast('Category added: ' + r.category.name);
  }
  function removeCategory(id) {
    var name = D.categoryName(id);
    confirmDlg('Remove category?', '"' + name + '" will be removed from the list. Expenses are never deleted by this.', 'Remove', function () {
      var r = D.deleteCategory(id); if (!r.ok) { toast(r.error); return; } fillCategories(); toast('Category removed');
    });
  }

  // ---------- form ----------
  function mode() { var m = document.querySelector('input[name="fMode"]:checked'); return m ? m.value : 'cash'; }
  function setMode(v) { document.querySelectorAll('input[name="fMode"]').forEach(function (r) { r.checked = r.value === v; }); }
  function readForm() {
    var errs = [], amt = U.parseMoney($('fAmount').value), date = $('fDate').value;
    ['fDate', 'fAmount', 'fCat', 'fDesc'].forEach(function (id) { $(id).classList.remove('err'); });
    if (!U.isISODate(date)) { errs.push('Choose the expense date'); $('fDate').classList.add('err'); }
    if (amt === null || isNaN(amt) || amt <= 0) { errs.push('Amount must be more than 0 (numbers only, max 2 decimals)'); $('fAmount').classList.add('err'); }
    if (!$('fCat').value) { errs.push('Choose a category'); $('fCat').classList.add('err'); }
    if (!$('fDesc').value.trim()) { errs.push('Write a short description'); $('fDesc').classList.add('err'); }
    return { errs: errs, input: { id: editId || undefined, date: date, amount: amt, categoryId: $('fCat').value, description: $('fDesc').value, mode: mode(), paidTo: $('fPaidTo').value, notes: $('fNotes').value } };
  }
  function submit(allowDuplicate) {
    var f = readForm();
    $('fErr').textContent = f.errs.join(' · ');
    if (f.errs.length) return;
    var r = D.saveExpense(f.input, { allowDuplicate: !!allowDuplicate });
    if (r.duplicates) {
      var d = r.duplicates[0];
      confirmDlg('Possible duplicate expense', 'An expense "' + d.description + '" of ' + U.money(d.amount) + ' in this category on ' + U.dateText(d.date) + ' is already saved. Save this one as well?', 'Save anyway', function () { submit(true); });
      return;
    }
    if (!r.ok) { $('fErr').textContent = r.error; return; }
    toast(r.created ? 'Expense saved: ' + U.money(r.record.amount) : 'Expense updated');
    var keepDate = $('fDate').value;
    resetForm(); $('fDate').value = keepDate;
    render();
  }
  function resetForm() {
    editId = null; $('exForm').reset(); $('fDate').value = today(); setMode('cash'); $('fErr').textContent = '';
    ['fDate', 'fAmount', 'fCat', 'fDesc'].forEach(function (id) { $(id).classList.remove('err'); });
    $('formH').textContent = 'Add Expense'; $('fSave').textContent = 'Save Expense'; $('fCancel').hidden = true;
    document.querySelector('.form-card').classList.remove('editing');
    var cur = $('xBody').querySelector('tr.cur'); if (cur) cur.classList.remove('cur');
  }
  function startEdit(id) {
    var e = D.getExpense(id); if (!e) { toast('This expense no longer exists'); render(); return; }
    editId = id;
    $('fDate').value = e.date; $('fAmount').value = U.plain(e.amount).replace(/\.00$/, ''); $('fCat').value = e.categoryId; $('fDesc').value = e.description;
    setMode(e.mode); $('fPaidTo').value = e.paidTo || ''; $('fNotes').value = e.notes || ''; $('fErr').textContent = '';
    $('formH').textContent = 'Edit Expense'; $('fSave').textContent = 'Update Expense'; $('fCancel').hidden = false;
    document.querySelector('.form-card').classList.add('editing');
    render();
    var card = document.querySelector('.form-card'); if (card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('fAmount').focus();
  }
  function remove(id) {
    var e = D.getExpense(id); if (!e) { render(); return; }
    confirmDlg('Delete this expense?', U.dateText(e.date) + ' · ' + D.categoryName(e.categoryId) + ' · ' + e.description + ' · ' + U.money(e.amount) + '. This cannot be undone.', 'Delete', function () {
      D.deleteExpense(id); if (editId === id) resetForm(); render(); toast('Expense deleted');
    });
  }

  // ---------- view / filters ----------
  function currentPeriod() {
    if (view.kind === 'day') return U.period('day', { date: view.day });
    if (view.kind === 'month') return U.period('month', { month: view.month });
    if (view.kind === 'year') return U.period('year', { year: view.year });
    if (view.kind === 'range') return U.period('range', { from: view.from, to: view.to });
    return U.period('all');
  }
  function currentList() {
    var p = currentPeriod();
    return D.listExpenses({ from: p.from, to: p.to, categoryId: view.cat, mode: view.mode, q: view.q });
  }
  function saveView() { try { window.MMHStorage.setJSON(VIEW_KEY, view); } catch (e) {} }
  function applyViewUI() {
    document.querySelectorAll('.tab').forEach(function (t) { var on = t.dataset.view === view.kind; t.classList.toggle('on', on); t.setAttribute('aria-selected', String(on)); });
    document.querySelectorAll('.fl[data-for]').forEach(function (l) { l.hidden = l.dataset.for !== view.kind; });
    $('vDay').value = view.day; $('vMonth').value = view.month; $('vYear').value = view.year; $('vFrom').value = view.from; $('vTo').value = view.to;
    $('vCat').value = view.cat; $('vMode').value = view.mode; $('vSearch').value = view.q;
  }
  function fillYears() {
    var y = +today().slice(0, 4), years = {}, sel = $('vYear'); years[y] = 1;
    D.listExpenses({}).forEach(function (e) { years[+e.date.slice(0, 4)] = 1; });
    sel.textContent = '';
    Object.keys(years).map(Number).sort(function (a, b) { return b - a; }).forEach(function (yr) { opt(sel, String(yr), String(yr)); });
    if (!years[+view.year]) view.year = String(y);
    sel.value = view.year;
  }

  // ---------- render ----------
  function dashboard() {
    var t = today(), all = D.listExpenses({});
    var s = function (f) { return EC.summarize(all.filter(f)); };
    var d = s(function (e) { return e.date === t; }), m = s(function (e) { return e.date.slice(0, 7) === t.slice(0, 7); }), y = s(function (e) { return e.date.slice(0, 4) === t.slice(0, 4); }), a = EC.summarize(all);
    $('kToday').textContent = U.money(d.total); $('kTodayN').textContent = d.count + ' entr' + (d.count === 1 ? 'y' : 'ies');
    $('kMonth').textContent = U.money(m.total); $('kMonthN').textContent = U.monthText(t.slice(0, 7));
    $('kYear').textContent = U.money(y.total); $('kYearN').textContent = 'Year ' + t.slice(0, 4);
    $('kCash').textContent = U.money(a.cash); $('kOnline').textContent = U.money(a.online);
  }
  function render() {
    dashboard();
    var cats = D.categories(), list = currentList(), s = EC.summarize(list), p = currentPeriod();
    $('sPeriod').textContent = p.label; $('sTotal').textContent = U.money(s.total); $('sCash').textContent = U.money(s.cash); $('sOnline').textContent = U.money(s.online); $('sCount').textContent = String(s.count);
    var body = $('xBody'); body.textContent = '';
    list.slice().reverse().forEach(function (e) {
      var tr = el('tr'); tr.dataset.id = e.id; if (e.id === editId) tr.className = 'cur';
      td(tr, U.dateText(e.date), 'nw', 'Date');
      td(tr, D.categoryName(e.categoryId, cats), null, 'Category');
      var dc = td(tr, e.description, 'desc', 'Description'); if (e.notes) { dc.appendChild(el('small', null, e.notes)); }
      td(tr, e.paidTo || '—', null, 'Paid To');
      var mc = td(tr, '', null, 'Mode'); mc.appendChild(el('span', 'mode-chip ' + e.mode, e.mode === 'cash' ? 'Cash' : 'Online'));
      td(tr, U.money(e.amount), 'ra amt', 'Amount');
      var ac = td(tr, '', 'ra acts-c');
      var b1 = el('button', 'mini', 'Edit'); b1.type = 'button'; b1.dataset.act = 'edit'; ac.appendChild(b1);
      var b2 = el('button', 'mini danger', 'Delete'); b2.type = 'button'; b2.dataset.act = 'del'; ac.appendChild(b2);
      body.appendChild(tr);
    });
    $('xEmpty').hidden = list.length > 0;
    $('xTotal').textContent = U.money(s.total);
    var cb = $('cBody'); cb.textContent = '';
    EC.byCategory(list, cats).forEach(function (g) {
      var tr = el('tr'); td(tr, g.name, null, 'Category'); td(tr, String(g.count), 'ra', 'Entries'); td(tr, U.money(g.cash), 'ra', 'Cash'); td(tr, U.money(g.online), 'ra', 'Online'); td(tr, U.money(g.total), 'ra amt', 'Total'); cb.appendChild(tr);
    });
    if (!cb.children.length) { var tr = el('tr'), c = td(tr, 'No expenses for this selection.', 'muted'); c.colSpan = 5; cb.appendChild(tr); }
    else { var tt = el('tr', 'tot'); td(tt, 'TOTAL', null, ''); td(tt, String(s.count), 'ra', 'Entries'); td(tt, U.money(s.cash), 'ra', 'Cash'); td(tt, U.money(s.online), 'ra', 'Online'); td(tt, U.money(s.total), 'ra amt', 'Total'); cb.appendChild(tt); }
    return { list: list, summary: s };
  }

  // ---------- downloads ----------
  function reportOpts() {
    var p = currentPeriod(), cats = D.categories();
    var tag = view.kind === 'day' ? p.from : view.kind === 'month' ? p.from.slice(0, 7) : view.kind === 'year' ? p.from.slice(0, 4) : view.kind === 'range' ? (p.from || 'start') + '-to-' + (p.to || 'today') : 'all';
    return { list: currentList(), cats: cats, kind: view.kind, periodLabel: p.label, fileTag: tag,
      categoryLabel: view.cat === 'all' ? 'All categories' : D.categoryName(view.cat, cats), modeLabel: view.mode === 'all' ? 'Cash and Online' : view.mode === 'cash' ? 'Cash only' : 'Online only', search: view.q };
  }
  function download(which, fmt) {
    if (!X) { toast('Downloads are not available in this window'); return; }
    var o = reportOpts();
    var rep = which === 'cat' ? EC.categoryReport(o) : EC.viewReport(o);
    try {
      if (fmt === 'print') { X.print(rep); return; }
      var name = X.exportReport(fmt, rep); toast('Downloaded ' + name);
    } catch (e) { toast('Download failed: ' + e.message); if (window.console) console.error(e); }
  }

  // ---------- events ----------
  function bind() {
    $('exForm').addEventListener('submit', function (e) { e.preventDefault(); submit(false); });
    $('fReset').onclick = resetForm;
    $('fCancel').onclick = resetForm;
    $('catAdd').onclick = addCategory;
    $('catName').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } });
    $('catList').addEventListener('click', function (e) { var b = e.target.closest('button[data-id]'); if (b) removeCategory(b.dataset.id); });
    $('xBody').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return; var id = b.closest('tr').dataset.id;
      if (b.dataset.act === 'edit') startEdit(id); else remove(id);
    });
    document.querySelectorAll('.tab').forEach(function (t) { t.onclick = function () { view.kind = t.dataset.view; applyViewUI(); saveView(); render(); }; });
    var map = { vDay: 'day', vMonth: 'month', vYear: 'year', vFrom: 'from', vTo: 'to', vCat: 'cat', vMode: 'mode' };
    Object.keys(map).forEach(function (id) { $(id).addEventListener('change', function () { view[map[id]] = $(id).value; saveView(); render(); }); });
    $('vSearch').addEventListener('input', function () { view.q = $('vSearch').value.slice(0, 60); saveView(); render(); });
    document.querySelectorAll('[data-dl]').forEach(function (b) { b.onclick = function () { download(b.dataset.dl, b.dataset.fmt); }; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('dlg').classList.remove('show'); });
    window.addEventListener('storage', function (e) { if (e.key === 'mmh.db.v2') { fillCategories(); render(); } });
  }

  function init() {
    $('todayChip').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    var st = D.status();
    if (!D.available()) { $('notice').hidden = false; $('notice').textContent = 'Browser storage is not available here (private window?). Expenses will not be saved.'; }
    else if (st.corrupt) { $('notice').hidden = false; $('notice').textContent = st.message; }
    var saved = window.MMHStorage ? window.MMHStorage.getJSON(VIEW_KEY, null) : null, t = today();
    if (saved && typeof saved === 'object') ['kind', 'day', 'month', 'year', 'from', 'to', 'cat', 'mode', 'q'].forEach(function (k) { if (typeof saved[k] === 'string') view[k] = saved[k].slice(0, 60); });
    if (['day', 'month', 'year', 'range', 'all'].indexOf(view.kind) < 0) view.kind = 'month';
    if (!U.isISODate(view.day)) view.day = t;
    if (!/^\d{4}-\d{2}$/.test(view.month)) view.month = t.slice(0, 7);
    if (!/^\d{4}$/.test(view.year)) view.year = t.slice(0, 4);
    if (['all', 'cash', 'online'].indexOf(view.mode) < 0) view.mode = 'all';
    fillCategories(); fillYears(); applyViewUI();
    $('fDate').value = t;
    bind(); render();
  }
  try { init(); } catch (e) { toast('Something went wrong: ' + e.message); if (window.console) console.error(e); }

  window.__expenses = { render: render, submit: submit, startEdit: startEdit, remove: remove, view: view, reportOpts: reportOpts, download: download };
})();
