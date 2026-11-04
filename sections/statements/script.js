/* ============================================================
   Statements & Reports · UI layer.
   Reads saved records through the shared data service, works out
   statements with reports.js (pure) and downloads through the
   shared export service. It never recalculates a bill.
   ============================================================ */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var D = window.MMHData, U = D && D.util, X = window.MMHExport, R = window.MMHReports;
  if (!D || !R) { document.body.insertAdjacentHTML('afterbegin', '<p style="padding:16px;color:#B91C1C">Saved records could not be loaded. Please refresh.</p>'); return; }

  var UI_KEY = 'mmh.statements.view';
  var st = {
    tab: 'customers', kind: 'month', day: '', month: '', year: '', from: '', to: '', section: 'all', customerId: '', firm: '',
    single: { q: '', customerId: '', from: '', to: '', section: 'all' }, dc: { day: '', month: '', year: '', customerId: '', firm: '' }, cFirm: ''
  };
  var data = null, rLimit = 30;

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
  function td(tr, text, cls) { var c = el('td', cls, text); tr.appendChild(c); return c; }
  function opt(sel, v, t) { var o = el('option', null, t); o.value = v; sel.appendChild(o); }
  var M = function (p) { return p === null || p === undefined ? '—' : U.money(p); };
  var B = function (p) { return p === null || p === undefined ? 'Not recorded' : U.balanceText(p); };
  function kpis(box, items) {
    box.textContent = '';
    items.forEach(function (k) { var d = el('div', 'kpi' + (k[2] ? ' ' + k[2] : '')); d.appendChild(el('span', 'l', k[0])); d.appendChild(el('b', 'n', k[1])); if (k[3]) d.appendChild(el('span', 's', k[3])); box.appendChild(d); });
  }
  function saveUI() { try { window.MMHStorage.setJSON(UI_KEY, st); } catch (e) {} }

  // ---------- data & filters ----------
  function refresh() {
    var db = D.load();
    data = { db: db, tx: D.transactions({}, db), exps: D.listExpenses({}, db), cats: D.categories(db), opening: db.settings.openingCash || null };
    $('countChip').textContent = db.bills.length + ' bills · ' + db.payments.length + ' payments · ' + db.expenses.length + ' expenses';
  }
  function period() {
    if (st.kind === 'day') return U.period('day', { date: st.day });
    if (st.kind === 'month') return U.period('month', { month: st.month });
    if (st.kind === 'year') return U.period('year', { year: st.year });
    if (st.kind === 'range') return U.period('range', { from: st.from, to: st.to });
    return U.period('all');
  }
  function custName(id) { for (var i = 0; i < data.db.customers.length; i++) if (data.db.customers[i].id === id) return data.db.customers[i].name; return ''; }
  function F() { var p = period(); return { from: p.from, to: p.to, section: st.section, customerId: st.customerId || null, firm: st.firm || null, ctx: { customerName: st.customerId ? custName(st.customerId) : '' } }; }
  function filterLabel() {
    var p = period(), bits = [p.label];
    bits.push(st.section === 'all' ? 'Zinda + Katai' : st.section === 'zinda' ? 'Zinda' : 'Katai');
    if (st.customerId) bits.push(custName(st.customerId));
    if (st.firm) bits.push(st.firm);
    return bits.join(' · ');
  }
  function years() {
    var y = {}; y[U.todayISO().slice(0, 4)] = 1;
    data.tx.forEach(function (r) { y[r.date.slice(0, 4)] = 1; }); data.exps.forEach(function (e) { y[e.date.slice(0, 4)] = 1; });
    return Object.keys(y).sort().reverse();
  }
  function fillSelects() {
    var ys = years();
    [['fYear', st, 'year'], ['dYear', st.dc, 'year']].forEach(function (a) { var s = $(a[0]); s.textContent = ''; ys.forEach(function (y) { opt(s, y, y); }); if (ys.indexOf(a[1][a[2]]) < 0) a[1][a[2]] = ys[0]; s.value = a[1][a[2]]; });
    var custs = D.listCustomers().filter(function (c) { return data.tx.some(function (r) { return r.customerId === c.id; }); });
    var fc = $('fCustomer'); fc.textContent = ''; opt(fc, '', 'All customers'); custs.forEach(function (c) { opt(fc, c.id, c.name); });
    if (!custs.some(function (c) { return c.id === st.customerId; })) st.customerId = ''; fc.value = st.customerId;
    var dcc = $('dCustomer'); dcc.textContent = ''; opt(dcc, '', custs.length ? 'Choose customer…' : 'No customers yet'); custs.forEach(function (c) { opt(dcc, c.id, c.name); });
    if (!custs.some(function (c) { return c.id === st.dc.customerId; })) st.dc.customerId = custs[0] ? custs[0].id : ''; dcc.value = st.dc.customerId;
    var firms = D.firms();
    var ff = $('fFirm'); ff.textContent = ''; opt(ff, '', 'All firms'); firms.forEach(function (n) { opt(ff, n, n); });
    if (firms.indexOf(st.firm) < 0) st.firm = ''; ff.value = st.firm;
    var df = $('dFirm'); df.textContent = ''; opt(df, '', firms.length ? 'Choose company…' : 'No firm names recorded'); firms.forEach(function (n) { opt(df, n, n); });
    if (firms.indexOf(st.dc.firm) < 0) st.dc.firm = firms[0] || ''; df.value = st.dc.firm;
    fillSingleList(custs);
  }
  function fillSingleList(custs) {
    custs = custs || D.listCustomers().filter(function (c) { return data.tx.some(function (r) { return r.customerId === c.id; }); });
    var q = U.normName(st.single.q), s = $('bCustomer'); s.textContent = '';
    var list = custs.filter(function (c) { return !q || U.normName(c.name).indexOf(q) >= 0; });
    opt(s, '', list.length ? 'Choose customer… (' + list.length + ')' : (custs.length ? 'No match' : 'No customers yet'));
    list.forEach(function (c) { opt(s, c.id, c.name); });
    if (q && list.length === 1 && !list.some(function (c) { return c.id === st.single.customerId; })) st.single.customerId = list[0].id;
    if (!custs.some(function (c) { return c.id === st.single.customerId; })) st.single.customerId = '';
    s.value = list.some(function (c) { return c.id === st.single.customerId; }) ? st.single.customerId : '';
  }
  function applyFilterUI() {
    $('fKind').value = st.kind; $('fDay').value = st.day; $('fMonth').value = st.month; $('fFrom').value = st.from; $('fTo').value = st.to; $('fSection').value = st.section;
    document.querySelectorAll('.filters-card .fl[data-for]').forEach(function (l) { l.hidden = l.dataset.for !== st.kind; });
    $('bSearch').value = st.single.q; $('bFrom').value = st.single.from; $('bTo').value = st.single.to; $('bSection').value = st.single.section;
    $('dDay').value = st.dc.day; $('dMonth').value = st.dc.month;
    document.querySelectorAll('.tab').forEach(function (t) { var on = t.dataset.tab === st.tab; t.classList.toggle('on', on); t.setAttribute('aria-selected', String(on)); });
    document.querySelectorAll('.panel').forEach(function (p) { p.hidden = p.id !== 'p-' + st.tab; });
  }

  // ---------- A. customers ----------
  function txRowTr(r, withActions) {
    var tr = el('tr'); tr.dataset.id = r.id; tr.dataset.kind = r.kind;
    td(tr, U.dateText(r.date), 'nw'); var k = td(tr, ''); k.appendChild(el('span', 'kind ' + r.kind, r.kind === 'payment' ? 'Payment' : 'Bill'));
    td(tr, R.labels.section(r.section)); td(tr, r.customerName, 'b'); td(tr, r.firm || '—');
    td(tr, r.kind === 'payment' ? '—' : U.money(r.amount), 'ra'); td(tr, U.money(r.cash), 'ra'); td(tr, U.money(r.online), 'ra');
    td(tr, U.balanceText(r.prevBalance), 'ra'); td(tr, U.balanceText(r.balance), 'ra b');
    if (withActions) {
      var a = td(tr, '', 'ra acts-c');
      var e = el('button', 'mini', 'Edit'); e.type = 'button'; e.dataset.act = 'edit'; a.appendChild(e);
      var x = el('button', 'mini danger', 'Delete'); x.type = 'button'; x.dataset.act = 'del'; a.appendChild(x);
    }
    return tr;
  }
  function renderCustomers() {
    var f = F(), a = R.allCustomers(data.tx, f);
    kpis($('aKpis'), [['Customers', String(a.totals.customers)], ['Total Bills', M(a.totals.bills), '', a.totals.billCount + ' bills'], ['Cash Received', M(a.totals.cash), 'cash'], ['Online Received', M(a.totals.online), 'onl'], ['Remaining Balance', B(a.totals.remaining), 'due', 'sum of customers']]);
    var body = $('aBody'); body.textContent = '';
    a.list.forEach(function (c) {
      var tr = el('tr'); var n = td(tr, ''); var b = el('button', 'link', c.name); b.type = 'button'; b.dataset.cust = c.customerId; b.title = 'Open single customer statement'; n.appendChild(b);
      td(tr, c.firms.join(', ') || '—'); td(tr, c.sections.join(' + ')); td(tr, String(c.billCount), 'ra'); td(tr, M(c.bills), 'ra'); td(tr, M(c.cash), 'ra'); td(tr, M(c.online), 'ra');
      td(tr, B(c.opening), 'ra'); td(tr, B(c.remaining), 'ra b'); td(tr, U.dateText(c.lastDate), 'nw');
      body.appendChild(tr);
    });
    var foot = $('aFoot'); foot.textContent = '';
    if (a.list.length) { var tr = el('tr'); td(tr, 'TOTAL'); td(tr, ''); td(tr, ''); td(tr, String(a.totals.billCount), 'ra'); td(tr, M(a.totals.bills), 'ra'); td(tr, M(a.totals.cash), 'ra'); td(tr, M(a.totals.online), 'ra'); td(tr, B(a.totals.opening), 'ra'); td(tr, B(a.totals.remaining), 'ra'); td(tr, ''); foot.appendChild(tr); }
    $('aEmpty').hidden = a.list.length > 0;
    $('aMethod').textContent = R.METHOD;
    var rb = $('rBody'); rb.textContent = '';
    var recs = a.records.slice().reverse();
    recs.slice(0, rLimit).forEach(function (r) { rb.appendChild(txRowTr(r, true)); });
    $('rEmpty').hidden = recs.length > 0; $('rMore').hidden = recs.length <= rLimit;
    $('rCount').textContent = recs.length ? '(' + recs.length + (recs.length > rLimit ? ', newest ' + rLimit + ' shown' : '') + ')' : '';
  }

  // ---------- B. single customer ----------
  function singleF() { var p = U.period('range', { from: st.single.from, to: st.single.to }); return { p: p, f: { from: p.from, to: p.to, section: st.single.section } }; }
  function renderSingle() {
    var out = $('bOut'); out.textContent = '';
    if (!st.single.customerId) { out.appendChild(el('p', 'empty', data.tx.length ? 'Search and choose a customer to see the complete statement.' : 'No saved bills yet. Save bills from the billing sections first.')); return; }
    var s = singleF(), stt = R.customerStatement(data.tx, st.single.customerId, s.f);
    var head = el('div', 'st-head');
    var l = el('div'); l.appendChild(el('div', 'st-brand', 'MurgaMandi Hisab')); l.appendChild(el('h3', null, stt.name || custName(st.single.customerId)));
    l.appendChild(el('p', 'muted', 'Firm / Company: ' + (stt.firms.length ? stt.firms.join(', ') : 'not recorded')));
    l.appendChild(el('p', 'muted', 'Statement period: ' + s.p.label + ' · ' + (s.f.section === 'all' ? 'Zinda + Katai' : R.labels.section(s.f.section))));
    head.appendChild(l);
    var dl = el('div', 'dl-row'); dl.dataset.report = 'customer'; dl.appendChild(el('span', null, 'Download'));
    [['pdf', 'PDF'], ['xlsx', 'Excel'], ['csv', 'CSV'], ['print', 'Print']].forEach(function (f) { var b = el('button', 'btn sm', f[1]); b.type = 'button'; b.dataset.fmt = f[0]; dl.appendChild(b); });
    head.appendChild(dl); out.appendChild(head);
    var k = el('div', 'kpis'); out.appendChild(k);
    kpis(k, [['Opening Balance', B(stt.opening)], ['Total Bills', M(stt.totals.bills), '', stt.totals.billCount + ' bills'], ['Cash Received', M(stt.totals.cash), 'cash'], ['Online Received', M(stt.totals.online), 'onl', stt.totals.paymentCount + ' separate payment' + (stt.totals.paymentCount === 1 ? '' : 's')], ['Remaining Balance', B(stt.remaining), 'due']]);
    var wrap = el('div', 't-wrap'), t = el('table', 'xtable'), th = el('thead'), hr = el('tr');
    ['Date', 'Type', 'Section', 'Firm / Company', 'Prev. Balance', 'Bill Amount', 'Cash', 'Online', 'Balance'].forEach(function (h, i) { hr.appendChild(el('th', i >= 4 ? 'ra' : null, h)); });
    th.appendChild(hr); t.appendChild(th);
    var tb = el('tbody');
    stt.rows.forEach(function (r) {
      var tr = el('tr'); td(tr, U.dateText(r.date), 'nw'); var kk = td(tr, ''); kk.appendChild(el('span', 'kind ' + r.kind, r.kind === 'payment' ? 'Payment' : 'Bill'));
      td(tr, R.labels.section(r.section)); td(tr, r.firm || '—'); td(tr, U.balanceText(r.prevBalance), 'ra'); td(tr, r.kind === 'payment' ? '—' : U.money(r.amount), 'ra'); td(tr, U.money(r.cash), 'ra'); td(tr, U.money(r.online), 'ra'); td(tr, U.balanceText(r.balance), 'ra b');
      tb.appendChild(tr);
    });
    if (!stt.rows.length) { var er = el('tr'), c = td(er, 'No bills or payments in this period.', 'muted'); c.colSpan = 9; tb.appendChild(er); }
    t.appendChild(tb);
    var tf = el('tfoot'), fr = el('tr'); td(fr, 'TOTAL'); td(fr, ''); td(fr, ''); td(fr, ''); td(fr, B(stt.opening), 'ra'); td(fr, M(stt.totals.bills), 'ra'); td(fr, M(stt.totals.cash), 'ra'); td(fr, M(stt.totals.online), 'ra'); td(fr, B(stt.remaining), 'ra'); tf.appendChild(fr); t.appendChild(tf);
    wrap.appendChild(t); out.appendChild(wrap);
    out.appendChild(el('p', 'method', R.METHOD));
    if (stt.check) out.appendChild(el('p', 'method warn-t', 'Opening + bills − received differs from the recorded remaining balance by ' + U.money(stt.check) + '. A previous balance typed on one of the bills did not match the balance before it.'));
  }

  // ---------- C. companies ----------
  function renderCompanies() {
    var f = F(), c = R.companies(data.tx, f), body = $('cBody'); body.textContent = '';
    c.list.forEach(function (x) {
      var tr = el('tr'); if (x.firm === st.cFirm) tr.className = 'cur';
      var n = td(tr, ''); var b = el('button', 'link', x.firm); b.type = 'button'; b.dataset.firm = x.firm; n.appendChild(b);
      td(tr, String(x.customers), 'ra'); td(tr, String(x.billCount), 'ra'); td(tr, M(x.bills), 'ra'); td(tr, M(x.cash), 'ra'); td(tr, M(x.online), 'ra'); td(tr, B(x.outstanding), 'ra b');
      var o = td(tr, '', 'ra'); var ob = el('button', 'mini', 'Open'); ob.type = 'button'; ob.dataset.firm = x.firm; o.appendChild(ob);
      body.appendChild(tr);
    });
    var foot = $('cFoot'); foot.textContent = '';
    if (c.list.length) { var tr = el('tr'); td(tr, 'TOTAL'); td(tr, ''); td(tr, String(c.totals.billCount), 'ra'); td(tr, M(c.totals.bills), 'ra'); td(tr, M(c.totals.cash), 'ra'); td(tr, M(c.totals.online), 'ra'); td(tr, B(c.totals.outstanding), 'ra'); td(tr, ''); foot.appendChild(tr); }
    $('cEmpty').hidden = c.list.length > 0;
    $('cNote').textContent = 'Only firm / company names typed on the bills are used — nothing is guessed. ' + c.noFirm + ' record(s) in this selection have no firm name.';
    if (st.cFirm && !c.list.some(function (x) { return x.firm === st.cFirm; })) st.cFirm = '';
    $('cDetail').hidden = !st.cFirm;
    if (!st.cFirm) return;
    var d = R.company(data.tx, st.cFirm, f);
    $('cdTitle').textContent = st.cFirm;
    kpis($('cdKpis'), [['Customers', String(d.customers.length)], ['Total Bills', M(d.totals.bills), '', d.totals.billCount + ' bills'], ['Cash', M(d.totals.cash), 'cash'], ['Online', M(d.totals.online), 'onl'], ['Outstanding', B(d.totals.outstanding), 'due']]);
    var cb = $('cdBody'); cb.textContent = '';
    d.customers.forEach(function (x) { var tr = el('tr'); td(tr, x.name, 'b'); td(tr, x.sections.join(' + ')); td(tr, String(x.billCount), 'ra'); td(tr, M(x.bills), 'ra'); td(tr, M(x.cash), 'ra'); td(tr, M(x.online), 'ra'); td(tr, B(x.remaining), 'ra b'); cb.appendChild(tr); });
    var rb = $('cdRec'); rb.textContent = '';
    d.records.slice().reverse().forEach(function (r) { var tr = el('tr'); td(tr, U.dateText(r.date), 'nw'); var k = td(tr, ''); k.appendChild(el('span', 'kind ' + r.kind, r.kind === 'payment' ? 'Payment' : 'Bill')); td(tr, R.labels.section(r.section)); td(tr, r.customerName, 'b'); td(tr, r.kind === 'payment' ? '—' : U.money(r.amount), 'ra'); td(tr, U.money(r.cash), 'ra'); td(tr, U.money(r.online), 'ra'); td(tr, U.balanceText(r.balance), 'ra'); rb.appendChild(tr); });
  }

  // ---------- D. P&L ----------
  function renderPnl() {
    var p = period(), r = R.pnl(data.tx, data.exps, p, data.cats);
    kpis($('pKpis'), [['Total Zinda Billing', M(r.zinda)], ['Total Katai Billing', M(r.katai)], ['Total Income', M(r.income), '', r.billCount + ' saved bills'], ['Total Expenses', M(r.expenses), 'due', r.expenseCount + ' entries'], [r.net < 0 ? 'Net Loss' : 'Net Profit', M(r.net), r.net < 0 ? 'loss' : 'profit']]);
    var s = $('pStmt'); s.textContent = '';
    [['Zinda billing (saved Zinda bills)', r.zinda], ['Katai billing (saved Katai bills)', r.katai], ['Total income from saved bills', r.income, 'sub'], ['Less: total recorded expenses', r.expenses], [r.net < 0 ? 'Net Loss' : 'Net Profit', r.net, 'tot']].forEach(function (x) { var tr = el('tr', x[2] || null); td(tr, x[0]); td(tr, M(x[1]), 'ra b'); s.appendChild(tr); });
    var c = $('pCats'); c.textContent = '';
    r.categories.forEach(function (x) { var tr = el('tr'); td(tr, x.name); td(tr, String(x.count), 'ra'); td(tr, M(x.total), 'ra'); c.appendChild(tr); });
    if (!r.categories.length) { var tr = el('tr'), cc = td(tr, 'No expenses recorded in this period.', 'muted'); cc.colSpan = 3; c.appendChild(tr); }
    $('pBreakH').textContent = r.byMonth ? 'Month-wise breakdown' : 'Day-wise breakdown'; $('pBreakK').textContent = r.byMonth ? 'Month' : 'Date';
    var rows = $('pRows'); rows.textContent = '';
    r.rows.forEach(function (x) { var tr = el('tr'); td(tr, x.label, 'nw'); td(tr, M(x.zinda), 'ra'); td(tr, M(x.katai), 'ra'); td(tr, M(x.income), 'ra'); td(tr, M(x.expenses), 'ra'); td(tr, M(x.net), 'ra b' + (x.net < 0 ? ' neg' : '')); rows.appendChild(tr); });
    if (!r.rows.length) { var e = el('tr'), ec = td(e, 'No saved bills or expenses in this period.', 'muted'); ec.colSpan = 6; rows.appendChild(e); }
  }

  // ---------- E. cash & online ----------
  function renderCash() {
    var p = period(), c = R.cashFlow(data.tx, data.exps, p, data.opening);
    var o = data.opening;
    $('oState').textContent = o ? 'Saved: ' + U.money(o.amount) + ' as of ' + U.dateText(o.date) : 'Not recorded. Without it, the closing cash position cannot be worked out.';
    if (document.activeElement !== $('oAmount') && document.activeElement !== $('oDate')) { $('oAmount').value = o ? String(o.amount / 100) : ''; $('oDate').value = o ? o.date : (p.from || U.todayISO()); }
    $('oClear').disabled = !o;
    var s = $('eStmt'); s.textContent = '';
    [['Opening balance', c.openingCash === null ? 'Not recorded' : U.balanceText(c.openingCash), 'Not recorded'],
     ['Received from customers', M(c.cashIn), M(c.onlineIn)], ['Expenses paid', M(c.cashOut), M(c.onlineOut)],
     ['Total inflow', M(c.cashIn), M(c.onlineIn), 'sub'], ['Total outflow', M(c.cashOut), M(c.onlineOut), 'sub'], ['Net movement', U.balanceText(c.netCash), U.balanceText(c.netOnline)],
     ['Closing position', c.closingCash === null ? 'Not available' : U.balanceText(c.closingCash), 'Not recorded', 'tot']].forEach(function (x) { var tr = el('tr', x[3] || null); td(tr, x[0]); td(tr, x[1], 'ra b'); td(tr, x[2], 'ra'); s.appendChild(tr); });
    kpis($('eKpis'), [['Cash In', M(c.cashIn), 'cash'], ['Cash Out', M(c.cashOut), 'due'], ['Online In', M(c.onlineIn), 'onl'], ['Online Out', M(c.onlineOut), 'due'], ['Closing Cash', c.closingCash === null ? 'Not available' : U.balanceText(c.closingCash), 'wide']]);
    $('eNote').textContent = c.openingNote;
    var rows = $('eRows'); rows.textContent = '';
    c.rows.forEach(function (x) { var tr = el('tr'); td(tr, U.dateText(x.date), 'nw'); td(tr, M(x.cashIn), 'ra'); td(tr, M(x.cashOut), 'ra'); td(tr, U.balanceText(x.netCash), 'ra'); td(tr, x.cashBalance === null ? '—' : U.balanceText(x.cashBalance), 'ra b'); td(tr, M(x.onlineIn), 'ra'); td(tr, M(x.onlineOut), 'ra'); td(tr, U.balanceText(x.netOnline), 'ra'); rows.appendChild(tr); });
    if (!c.rows.length) { var e = el('tr'), ec = td(e, 'No cash or online movement recorded in this period.', 'muted'); ec.colSpan = 8; rows.appendChild(e); }
  }
  function saveOpening() {
    var amt = U.parseMoney($('oAmount').value), d = $('oDate').value;
    if (amt === null || isNaN(amt)) { toast('Enter the cash in hand (0 or more, max 2 decimals)'); $('oAmount').classList.add('err'); return; }
    if (!U.isISODate(d)) { toast('Choose the date of the cash count'); return; }
    $('oAmount').classList.remove('err');
    if (!D.setSetting('openingCash', { amount: amt, date: d, savedAt: new Date().toISOString() })) { toast(D.lastError() || 'Could not save'); return; }
    toast('Opening cash saved'); renderAllTabs();
  }

  // ---------- F. download center ----------
  var DC = [
    { n: 1, key: 'allRecords', t: 'Download All Customer Records', d: 'Every saved bill and payment, date-wise.', uses: true },
    { n: 2, key: 'allStatements', t: 'Download All Customer Statements', d: 'Customer-wise totals, opening and remaining balances, plus every transaction.', uses: true },
    { n: 3, key: 'dcCustomer', t: 'Download Single Customer Statement', d: 'The customer chosen above, complete statement for the chosen period.', uses: true },
    { n: 4, key: 'dcDay', t: 'Download Daily Statement', d: 'Bills, payments and expenses of the chosen day.' },
    { n: 5, key: 'dcMonth', t: 'Download Monthly Statement', d: 'Day-wise billing, receipts and expenses of the chosen month.' },
    { n: 6, key: 'dcYear', t: 'Download Yearly Statement', d: 'Month-wise billing, receipts and expenses of the chosen year.' },
    { n: 7, key: 'companies', t: 'Download All Company Records', d: 'Every firm / company found on saved bills with its records.', uses: true },
    { n: 8, key: 'dcCompany', t: 'Download Company-wise Statement', d: 'The company chosen above: its customers, bills, payments and outstanding.', uses: true },
    { n: 9, key: 'pnl', t: 'Download Profit & Loss Statement', d: 'Recorded income − recorded expenses for the period at the top.', uses: true },
    { n: 10, key: 'cash', t: 'Download Cash Statement', d: 'Cash and online in / out kept separate, with opening cash if recorded.', uses: true },
    { n: 11, key: 'expense', t: 'Download Expense Statement', d: 'All expenses of the period at the top with category totals.', uses: true }
  ];
  function renderDownloads() {
    var ys = years(); if (ys.indexOf(st.dc.year) < 0) st.dc.year = ys[0];
    var list = $('dcList'); if (list.children.length) return;
    DC.forEach(function (it) {
      var li = el('li', 'dc-item'); li.dataset.report = it.key;
      var tx = el('div', 'dc-t'); tx.appendChild(el('b', null, it.n + '. ' + it.t)); tx.appendChild(el('span', null, it.d + (it.uses ? ' (uses filters)' : '')));
      li.appendChild(tx);
      var b = el('div', 'dc-b');
      [['pdf', 'PDF'], ['xlsx', 'Excel'], ['csv', 'CSV'], ['print', 'Print']].forEach(function (f) { var bt = el('button', 'btn sm' + (f[0] === 'pdf' ? ' primary' : ''), f[1]); bt.type = 'button'; bt.dataset.fmt = f[0]; b.appendChild(bt); });
      li.appendChild(b); list.appendChild(li);
    });
  }

  function periodTag(p) {
    if (p.kind === 'day') return p.from; if (p.kind === 'month') return p.from.slice(0, 7); if (p.kind === 'year') return p.from.slice(0, 4);
    if (p.kind === 'range') return (p.from || 'start') + '-to-' + (p.to || 'end'); return 'all-dates';
  }
  /** Report model for a key (file name gets the period), or a string explaining why it cannot be made. */
  function buildReport(key) {
    var rep = makeReport(key);
    if (typeof rep !== 'string') {
      var p = key === 'customer' ? singleF().p : key === 'dcDay' ? U.period('day', { date: st.dc.day }) : key === 'dcMonth' ? U.period('month', { month: st.dc.month }) : key === 'dcYear' ? U.period('year', { year: st.dc.year }) : period();
      rep.filename = (rep.filename || rep.title) + '-' + periodTag(p);
    }
    return rep;
  }
  function makeReport(key) {
    var f = F(), p = period(), RR = R.reports, lbl = p.label;
    switch (key) {
      case 'allRecords': return RR.allRecords(data.tx, f, lbl);
      case 'allStatements': return RR.allStatements(data.tx, f, lbl);
      case 'customer': {
        if (!st.single.customerId) return 'Choose a customer first.';
        var s = singleF(); return RR.customer(data.tx, st.single.customerId, s.f, s.p.label);
      }
      case 'dcCustomer': {
        if (!st.dc.customerId) return 'Choose a customer in the Download Center first.';
        return RR.customer(data.tx, st.dc.customerId, { from: f.from, to: f.to, section: f.section, firm: f.firm }, lbl);
      }
      case 'companies': return RR.companies(data.tx, f, lbl);
      case 'company': if (!st.cFirm) return 'Open a company first.'; return RR.company(data.tx, st.cFirm, f, lbl);
      case 'dcCompany': if (!st.dc.firm) return 'No firm / company names are recorded on saved bills yet.'; return RR.company(data.tx, st.dc.firm, { from: f.from, to: f.to, section: f.section }, lbl);
      case 'pnl': return RR.pnl(data.tx, data.exps, p, data.cats);
      case 'cash': return RR.cash(data.tx, data.exps, p, data.opening);
      case 'expense': return RR.expense(data.exps, p, data.cats);
      case 'dcDay': return RR.period(data.tx, data.exps, U.period('day', { date: st.dc.day }), data.cats, 'day');
      case 'dcMonth': return RR.period(data.tx, data.exps, U.period('month', { month: st.dc.month }), data.cats, 'month');
      case 'dcYear': return RR.period(data.tx, data.exps, U.period('year', { year: st.dc.year }), data.cats, 'year');
    }
    return 'Unknown report';
  }
  function doDownload(key, fmt) {
    refresh();
    var rep = buildReport(key);
    if (typeof rep === 'string') { toast(rep); return null; }
    if (!X) { toast('Downloads are not available in this window'); return null; }
    try {
      if (fmt === 'print') { X.print(rep); return rep; }
      var name = X.exportReport(fmt, rep); toast('Downloaded ' + name); return name;
    } catch (e) { toast('Download failed: ' + e.message); if (window.console) console.error(e); return null; }
  }

  // ---------- edit / delete records ----------
  var editing = null;
  function openEdit(kind, id) {
    var r = kind === 'payment' ? D.getPayment(id) : D.getBill(id); if (!r) { toast('This record no longer exists'); renderAllTabs(); return; }
    editing = { kind: kind, id: id, amount: kind === 'payment' ? 0 : r.amount };
    $('edT').textContent = 'Edit ' + (kind === 'payment' ? 'payment' : 'bill');
    var src = R.labels.source(r.source);
    $('edInfo').textContent = (kind === 'payment' ? 'Payment' : 'Bill amount ' + U.money(r.amount) + ' (calculated by ' + (src || R.labels.section(r.section)) + '; it cannot be changed here)') + '.' +
      (r.source === 'zinda-daily' || r.source === 'katai-daily' ? ' This record came from a daily sheet: saving that sheet to records again will replace these changes.' : '');
    $('edDate').value = r.date; $('edName').value = r.customerName; $('edFirm').value = r.firm || '';
    $('edPrev').value = r.prevBalance >= 0 ? String(r.prevBalance / 100) : ''; $('edCash').value = String(r.cash / 100); $('edOnline').value = String(r.online / 100); $('edNote').value = r.note || '';
    $('edPrev').disabled = r.prevBalance < 0; $('edPrev').title = r.prevBalance < 0 ? 'Advance balance cannot be edited here' : '';
    editing.prevNeg = r.prevBalance < 0 ? r.prevBalance : null;
    $('edErr').textContent = ''; edCalc();
    $('edDlg').classList.add('show'); $('edDate').focus();
  }
  function edValues() {
    var prev = editing.prevNeg !== null ? editing.prevNeg : U.parseMoney($('edPrev').value), cash = U.parseMoney($('edCash').value), onl = U.parseMoney($('edOnline').value);
    if (prev === null) prev = 0; if (cash === null) cash = 0; if (onl === null) onl = 0;
    return { prev: prev, cash: cash, online: onl };
  }
  function edCalc() {
    var v = edValues();
    $('edCalc').textContent = [v.prev, v.cash, v.online].some(isNaN) ? 'Amounts must be numbers (0 or more, max 2 decimals).' :
      'Remaining balance = ' + U.balanceText(v.prev) + ' + ' + U.money(editing.amount) + ' − ' + U.money(v.cash) + ' − ' + U.money(v.online) + ' = ' + U.balanceText(v.prev + editing.amount - v.cash - v.online);
  }
  function saveEdit() {
    var v = edValues();
    if ([v.prev, v.cash, v.online].some(isNaN)) { $('edErr').textContent = 'Amounts must be numbers (0 or more, max 2 decimals).'; return; }
    if (!U.isISODate($('edDate').value)) { $('edErr').textContent = 'Choose a valid date.'; return; }
    var patch = { date: $('edDate').value, customerName: $('edName').value, firm: $('edFirm').value, prevBalance: v.prev, cash: v.cash, online: v.online, note: $('edNote').value };
    var res = editing.kind === 'payment' ? D.updatePayment(editing.id, patch) : D.updateBill(editing.id, patch);
    if (!res.ok) { $('edErr').textContent = res.error; return; }
    $('edDlg').classList.remove('show'); editing = null; toast('Record updated'); refresh(); fillSelects(); renderAllTabs();
  }
  function deleteRec(kind, id) {
    var r = kind === 'payment' ? D.getPayment(id) : D.getBill(id); if (!r) { renderAllTabs(); return; }
    confirmDlg('Delete this ' + (kind === 'payment' ? 'payment' : 'bill') + '?', r.customerName + ' · ' + U.dateText(r.date) + (kind === 'payment' ? ' · received ' + U.money(r.cash + r.online) : ' · ' + U.money(r.amount)) + '. It will be removed from all statements. This cannot be undone.', 'Delete', function () {
      if (kind === 'payment') D.deletePayment(id); else D.deleteBill(id);
      toast('Record deleted'); refresh(); fillSelects(); renderAllTabs();
    });
  }

  // ---------- render all ----------
  function renderAllTabs() {
    refresh();
    $('fLabel').textContent = filterLabel();
    var fns = { customers: renderCustomers, single: renderSingle, companies: renderCompanies, pnl: renderPnl, cash: renderCash, downloads: renderDownloads };
    Object.keys(fns).forEach(function (k) {   // each panel is isolated: one failing panel does not stop the others
      try { fns[k](); } catch (e) { var p = $('p-' + k); if (p) { p.insertBefore(el('p', 'notice', 'This panel could not be shown: ' + e.message), p.firstChild); } if (window.console) console.error(e); }
    });
  }

  function bind() {
    document.querySelectorAll('.tab').forEach(function (t) { t.onclick = function () { st.tab = t.dataset.tab; applyFilterUI(); saveUI(); }; });
    var fmap = { fKind: 'kind', fDay: 'day', fMonth: 'month', fYear: 'year', fFrom: 'from', fTo: 'to', fSection: 'section', fCustomer: 'customerId', fFirm: 'firm' };
    Object.keys(fmap).forEach(function (id) { $(id).addEventListener('change', function () { st[fmap[id]] = $(id).value; rLimit = 30; applyFilterUI(); saveUI(); renderAllTabs(); }); });
    $('bSearch').addEventListener('input', function () { st.single.q = $('bSearch').value.slice(0, 60); fillSingleList(); saveUI(); renderSingle(); });
    $('bCustomer').addEventListener('change', function () { st.single.customerId = $('bCustomer').value; saveUI(); renderSingle(); });
    var bmap = { bFrom: 'from', bTo: 'to', bSection: 'section' };
    Object.keys(bmap).forEach(function (id) { $(id).addEventListener('change', function () { st.single[bmap[id]] = $(id).value; saveUI(); renderSingle(); }); });
    var dmap = { dDay: 'day', dMonth: 'month', dYear: 'year', dCustomer: 'customerId', dFirm: 'firm' };
    Object.keys(dmap).forEach(function (id) { $(id).addEventListener('change', function () { st.dc[dmap[id]] = $(id).value; saveUI(); }); });
    document.addEventListener('click', function (e) {
      var fb = e.target.closest('[data-fmt]'), row = fb && fb.closest('[data-report]');
      if (fb && row) { doDownload(row.dataset.report, fb.dataset.fmt); return; }
      var cb = e.target.closest('[data-cust]');
      if (cb) { st.single.customerId = cb.dataset.cust; st.single.q = ''; st.tab = 'single'; fillSingleList(); applyFilterUI(); saveUI(); renderSingle(); window.scrollTo && window.scrollTo(0, 0); return; }
      var fm = e.target.closest('[data-firm]');
      if (fm) { st.cFirm = fm.dataset.firm; saveUI(); renderCompanies(); var d = $('cDetail'); if (d.scrollIntoView) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      var act = e.target.closest('#rBody [data-act]');
      if (act) { var tr = act.closest('tr'); if (act.dataset.act === 'edit') openEdit(tr.dataset.kind, tr.dataset.id); else deleteRec(tr.dataset.kind, tr.dataset.id); }
    });
    $('rMore').onclick = function () { rLimit += 100; renderCustomers(); };
    $('oSave').onclick = saveOpening;
    $('oClear').onclick = function () { confirmDlg('Remove opening cash?', 'The closing cash position will show as not available until you enter it again.', 'Remove', function () { D.setSetting('openingCash', null); toast('Opening cash removed'); renderAllTabs(); }); };
    $('edForm').addEventListener('submit', function (e) { e.preventDefault(); saveEdit(); });
    $('edNo').onclick = function () { $('edDlg').classList.remove('show'); editing = null; };
    ['edPrev', 'edCash', 'edOnline'].forEach(function (id) { $(id).addEventListener('input', function () { if (editing) edCalc(); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { $('dlg').classList.remove('show'); $('edDlg').classList.remove('show'); editing = null; } });
    window.addEventListener('storage', function (e) { if (e.key === 'mmh.db.v2') { refresh(); fillSelects(); renderAllTabs(); } });
  }

  function init() {
    var s = D.status();
    if (!D.available()) { $('notice').hidden = false; $('notice').textContent = 'Browser storage is not available here (private window?). No saved records can be read.'; }
    else if (s.corrupt) { $('notice').hidden = false; $('notice').textContent = s.message; }
    var saved = window.MMHStorage ? window.MMHStorage.getJSON(UI_KEY, null) : null, t = U.todayISO();
    if (saved && typeof saved === 'object') {
      ['tab', 'kind', 'day', 'month', 'year', 'from', 'to', 'section', 'customerId', 'firm', 'cFirm'].forEach(function (k) { if (typeof saved[k] === 'string') st[k] = saved[k].slice(0, 80); });
      ['single', 'dc'].forEach(function (g) { if (saved[g] && typeof saved[g] === 'object') Object.keys(st[g]).forEach(function (k) { if (typeof saved[g][k] === 'string') st[g][k] = saved[g][k].slice(0, 80); }); });
    }
    if (['customers', 'single', 'companies', 'pnl', 'cash', 'downloads'].indexOf(st.tab) < 0) st.tab = 'customers';
    if (['day', 'month', 'year', 'range', 'all'].indexOf(st.kind) < 0) st.kind = 'month';
    if (['all', 'zinda', 'katai'].indexOf(st.section) < 0) st.section = 'all';
    if (['all', 'zinda', 'katai'].indexOf(st.single.section) < 0) st.single.section = 'all';
    if (!U.isISODate(st.day)) st.day = t; if (!/^\d{4}-\d{2}$/.test(st.month)) st.month = t.slice(0, 7); if (!/^\d{4}$/.test(st.year)) st.year = t.slice(0, 4);
    if (!U.isISODate(st.dc.day)) st.dc.day = t; if (!/^\d{4}-\d{2}$/.test(st.dc.month)) st.dc.month = t.slice(0, 7); if (!/^\d{4}$/.test(st.dc.year)) st.dc.year = t.slice(0, 4);
    if (st.from && !U.isISODate(st.from)) st.from = ''; if (st.to && !U.isISODate(st.to)) st.to = '';
    refresh(); fillSelects(); applyFilterUI(); bind(); renderAllTabs();
  }
  try { init(); } catch (e) { toast('Something went wrong: ' + e.message); if (window.console) console.error(e); }

  window.__statements = { state: st, buildReport: buildReport, doDownload: doDownload, renderAllTabs: renderAllTabs, openEdit: openEdit, saveEdit: saveEdit, deleteRec: deleteRec, DC: DC };
})();
