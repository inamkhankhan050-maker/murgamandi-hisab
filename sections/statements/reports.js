/* ============================================================
   Statements & Reports · report calculations (pure, no DOM).
   Reads saved records only. Never recalculates a bill: every bill
   amount, cash, online, previous balance and remaining balance is
   used exactly as the billing section recorded it.

   Balance method (customer statements):
   - A customer's balance is kept per section (Zinda and Katai keep
     separate Pichla balances), in date + save order.
   - Opening balance = the "previous balance" recorded on the
     customer's first record inside the period. With no record in
     the period, the last remaining balance recorded before it.
   - Remaining balance = the remaining balance recorded on the last
     record inside the period (or before it, as above).
   - With both sections shown, the two section balances are added.
   - "Check" = opening + bills − cash − online − remaining. It is 0
     when every bill carried the previous balance forward; anything
     else is shown so the user can see a typed-in Pichla difference.
   ============================================================ */
(function (root) {
  'use strict';

  function create(U, opts) {
    opts = opts || {};
    var SEC = { zinda: 'Zinda', katai: 'Katai' };
    var SRC = { 'zinda-single': 'Zinda Single', 'zinda-daily': 'Zinda Daily', 'katai-single': 'Katai Single', 'katai-daily': 'Katai Daily' };
    var norm = U.normName;

    function match(r, f) {
      f = f || {};
      if (f.from && r.date < f.from) return false;
      if (f.to && r.date > f.to) return false;
      if (f.section && f.section !== 'all' && r.section !== f.section) return false;
      if (f.customerId && r.customerId !== f.customerId) return false;
      if (f.firm && norm(r.firm) !== norm(f.firm)) return false;
      return true;
    }
    function sum(list, k) { var s = 0; list.forEach(function (r) { s += r[k] || 0; }); return s; }
    function pick(list, f) { return list.filter(function (r) { return match(r, f); }); }
    function kindLabel(r) { return r.kind === 'payment' ? 'Payment' : 'Bill'; }
    function secLabel(s) { return SEC[s] || s; }
    function srcLabel(s) { return SRC[s] || ''; }
    function distinct(list, fn) { var seen = {}, out = []; list.forEach(function (r) { var v = fn(r); if (v && !seen[norm(v)]) { seen[norm(v)] = 1; out.push(v); } }); return out; }

    /** Opening / remaining for one customer from the records allowed by f (period ignored for "before"). */
    function balances(tx, customerId, f) {
      var base = { section: f.section, customerId: customerId, firm: f.firm };
      var mine = pick(tx, base), bySec = {};
      mine.forEach(function (r) { (bySec[r.section] = bySec[r.section] || []).push(r); });
      var opening = null, remaining = null;
      Object.keys(bySec).forEach(function (s) {
        var list = bySec[s].sort(U.byDateSeq), inP = list.filter(function (r) { return match(r, { from: f.from, to: f.to }); });
        var before = list.filter(function (r) { return f.from && r.date < f.from; });
        var o = inP.length ? inP[0].prevBalance : before.length ? before[before.length - 1].balance : null;
        var c = inP.length ? inP[inP.length - 1].balance : before.length ? before[before.length - 1].balance : null;
        if (o !== null) opening = (opening || 0) + o;
        if (c !== null) remaining = (remaining || 0) + c;
      });
      return { opening: opening, remaining: remaining };
    }

    // ---------- B. single customer ----------
    function customerStatement(tx, customerId, f) {
      f = f || {};
      var rows = pick(tx, { from: f.from, to: f.to, section: f.section, customerId: customerId, firm: f.firm }).sort(U.byDateSeq);
      var b = balances(tx, customerId, f);
      var bills = rows.filter(function (r) { return r.kind !== 'payment'; });
      var t = { bills: sum(bills, 'amount'), cash: sum(rows, 'cash'), online: sum(rows, 'online'), billCount: bills.length, paymentCount: rows.length - bills.length };
      var check = (b.opening !== null && b.remaining !== null) ? b.remaining - (b.opening + t.bills - t.cash - t.online) : null;
      var any = tx.filter(function (r) { return r.customerId === customerId; })[0];
      return { customerId: customerId, name: any ? any.customerName : '', firms: distinct(rows, function (r) { return r.firm; }), rows: rows, totals: t, opening: b.opening, remaining: b.remaining, check: check };
    }

    // ---------- A. all customers ----------
    function allCustomers(tx, f) {
      var rows = pick(tx, f), ids = [], seen = {};
      rows.forEach(function (r) { if (!seen[r.customerId]) { seen[r.customerId] = 1; ids.push(r.customerId); } });
      var list = ids.map(function (id) {
        var st = customerStatement(tx, id, f), mine = st.rows;
        return { customerId: id, name: st.name, firms: st.firms, sections: distinct(mine, function (r) { return secLabel(r.section); }), billCount: st.totals.billCount, paymentCount: st.totals.paymentCount,
          bills: st.totals.bills, cash: st.totals.cash, online: st.totals.online, opening: st.opening, remaining: st.remaining, lastDate: mine.length ? mine[mine.length - 1].date : '' };
      }).sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
      var tot = { customers: list.length, bills: sum(list, 'bills'), cash: sum(list, 'cash'), online: sum(list, 'online'), remaining: sum(list, 'remaining'), opening: sum(list, 'opening'), billCount: sum(list, 'billCount'), paymentCount: sum(list, 'paymentCount') };
      return { list: list, totals: tot, records: rows.sort(U.byDateSeq) };
    }

    // ---------- C. companies / firms ----------
    function companies(tx, f) {
      var base = { from: f.from, to: f.to, section: f.section, customerId: f.customerId };
      var rows = pick(tx, base), names = distinct(rows, function (r) { return U.clean(r.firm); }).sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; });
      var list = names.map(function (n) { var d = company(tx, n, f); return { firm: n, customers: d.customers.length, billCount: d.totals.billCount, paymentCount: d.totals.paymentCount, bills: d.totals.bills, cash: d.totals.cash, online: d.totals.online, outstanding: d.totals.outstanding }; });
      var noFirm = rows.filter(function (r) { return !U.clean(r.firm); }).length;
      return { list: list, noFirm: noFirm, totals: { firms: list.length, bills: sum(list, 'bills'), cash: sum(list, 'cash'), online: sum(list, 'online'), outstanding: sum(list, 'outstanding'), billCount: sum(list, 'billCount') } };
    }
    function company(tx, firm, f) {
      var ff = { from: f.from, to: f.to, section: f.section, customerId: f.customerId, firm: firm };
      var a = allCustomers(tx, ff);
      var bills = a.records.filter(function (r) { return r.kind !== 'payment'; });
      return { firm: firm, customers: a.list, records: a.records,
        totals: { bills: a.totals.bills, cash: a.totals.cash, online: a.totals.online, outstanding: a.totals.remaining, billCount: bills.length, paymentCount: a.records.length - bills.length } };
    }

    // ---------- D. profit & loss ----------
    function useMonths(p, tx, exps) {
      if (p.kind === 'year' || p.kind === 'all') return true;
      if (p.kind === 'range') {
        var from = p.from, to = p.to;
        if (!from || !to) { var ds = tx.map(function (r) { return r.date; }).concat(exps.map(function (e) { return e.date; })).sort(); from = from || ds[0]; to = to || ds[ds.length - 1]; }
        if (!from || !to) return false;
        var a = new Date(from), b = new Date(to); return (b - a) / 86400000 > 62;
      }
      return false;
    }
    function pnl(tx, exps, p, cats) {
      var f = { from: p.from, to: p.to };
      var bills = pick(tx, f).filter(function (r) { return r.kind !== 'payment'; }), ex = exps.filter(function (e) { return match(e, f); });
      var z = sum(bills.filter(function (r) { return r.section === 'zinda'; }), 'amount'), k = sum(bills.filter(function (r) { return r.section === 'katai'; }), 'amount'), e = sum(ex, 'amount');
      var months = useMonths(p, bills, ex), key = function (d) { return months ? d.slice(0, 7) : d; }, map = {}, keys = [];
      var slot = function (kk) { if (!map[kk]) { map[kk] = { key: kk, zinda: 0, katai: 0, expenses: 0 }; keys.push(kk); } return map[kk]; };
      bills.forEach(function (r) { slot(key(r.date))[r.section] += r.amount; });
      ex.forEach(function (x) { slot(key(x.date)).expenses += x.amount; });
      var rows = keys.sort().map(function (kk) { var s = map[kk]; return { key: kk, label: months ? U.monthText(kk) : U.dateText(kk), zinda: s.zinda, katai: s.katai, income: s.zinda + s.katai, expenses: s.expenses, net: s.zinda + s.katai - s.expenses }; });
      var byCat = {}, catRows = [];
      ex.forEach(function (x) { if (!byCat[x.categoryId]) { byCat[x.categoryId] = { name: catName(x.categoryId, cats), total: 0, count: 0 }; catRows.push(byCat[x.categoryId]); } byCat[x.categoryId].total += x.amount; byCat[x.categoryId].count++; });
      catRows.sort(function (a, b) { return b.total - a.total; });
      return { zinda: z, katai: k, income: z + k, expenses: e, net: z + k - e, billCount: bills.length, expenseCount: ex.length, rows: rows, byMonth: months, categories: catRows };
    }
    function catName(id, cats) { for (var i = 0; i < (cats || []).length; i++) if (cats[i].id === id) return cats[i].name; return 'Unknown category'; }

    // ---------- E. cash & online ----------
    /** opening: {amount (paise), date} entered by the user, or null. */
    function cashFlow(tx, exps, p, opening) {
      var from = p.from;
      if (!from) { var ds = tx.map(function (r) { return r.date; }).concat(exps.map(function (e) { return e.date; })).sort(); from = ds[0] || (opening && opening.date) || null; }
      var f = { from: from, to: p.to };
      var rec = pick(tx, f), ex = exps.filter(function (e) { return match(e, f); });
      var cashIn = sum(rec, 'cash'), onlineIn = sum(rec, 'online');
      var cashOut = sum(ex.filter(function (e) { return e.mode === 'cash'; }), 'amount'), onlineOut = sum(ex.filter(function (e) { return e.mode === 'online'; }), 'amount');
      var openCash = null, openNote = 'Opening cash balance not recorded. Enter it to see the closing cash position.';
      if (opening && U.isISODate(opening.date) && typeof opening.amount === 'number') {
        if (!from || opening.date <= from) {
          var gap = { from: opening.date, to: from ? prevDay(from) : null };
          var gIn = from && opening.date < from ? sum(pick(tx, gap), 'cash') : 0;
          var gOut = from && opening.date < from ? sum(exps.filter(function (e) { return e.mode === 'cash' && match(e, gap); }), 'amount') : 0;
          openCash = opening.amount + gIn - gOut;
          openNote = opening.date === from || !from ? 'Opening cash as entered (as of ' + U.dateText(opening.date) + ').' : 'Opening cash entered as of ' + U.dateText(opening.date) + ', plus recorded cash received and minus cash expenses up to ' + U.dateText(prevDay(from)) + '.';
        } else openNote = 'Opening cash is recorded as of ' + U.dateText(opening.date) + ', after this period starts. Choose a period starting on or after that date.';
      }
      var days = {}, keys = [];
      var slot = function (d) { if (!days[d]) { days[d] = { date: d, cashIn: 0, cashOut: 0, onlineIn: 0, onlineOut: 0 }; keys.push(d); } return days[d]; };
      rec.forEach(function (r) { if (r.cash) slot(r.date).cashIn += r.cash; if (r.online) slot(r.date).onlineIn += r.online; });
      ex.forEach(function (e) { if (e.mode === 'cash') slot(e.date).cashOut += e.amount; else slot(e.date).onlineOut += e.amount; });
      var run = openCash;
      var rows = keys.sort().map(function (d) { var s = days[d]; if (run !== null) run += s.cashIn - s.cashOut; return { date: d, cashIn: s.cashIn, cashOut: s.cashOut, netCash: s.cashIn - s.cashOut, onlineIn: s.onlineIn, onlineOut: s.onlineOut, netOnline: s.onlineIn - s.onlineOut, cashBalance: run }; });
      return { from: from, to: p.to, openingCash: openCash, openingNote: openNote, cashIn: cashIn, cashOut: cashOut, netCash: cashIn - cashOut, closingCash: openCash === null ? null : openCash + cashIn - cashOut,
        onlineIn: onlineIn, onlineOut: onlineOut, netOnline: onlineIn - onlineOut, rows: rows };
    }
    function prevDay(iso) { var p = iso.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2] - 1); return U.todayISO(d); }

    // ---------- day / month / year business statements ----------
    function periodSummary(tx, exps, p) {
      var f = { from: p.from, to: p.to }, rec = pick(tx, f), bills = rec.filter(function (r) { return r.kind !== 'payment'; }), ex = exps.filter(function (e) { return match(e, f); });
      var z = sum(bills.filter(function (r) { return r.section === 'zinda'; }), 'amount'), k = sum(bills.filter(function (r) { return r.section === 'katai'; }), 'amount');
      var eCash = sum(ex.filter(function (e) { return e.mode === 'cash'; }), 'amount'), eOnl = sum(ex.filter(function (e) { return e.mode === 'online'; }), 'amount');
      return { records: rec, bills: bills, expenses: ex, zinda: z, katai: k, income: z + k, cash: sum(rec, 'cash'), online: sum(rec, 'online'), expCash: eCash, expOnline: eOnl, expTotal: eCash + eOnl, net: z + k - eCash - eOnl };
    }
    function groupPeriod(tx, exps, p, monthly) {
      var s = periodSummary(tx, exps, p), map = {}, keys = [];
      var slot = function (k) { if (!map[k]) { map[k] = { key: k, zinda: 0, katai: 0, cash: 0, online: 0, expenses: 0, bills: 0 }; keys.push(k); } return map[k]; };
      var key = function (d) { return monthly ? d.slice(0, 7) : d; };
      s.records.forEach(function (r) { var o = slot(key(r.date)); if (r.kind !== 'payment') { o[r.section] += r.amount; o.bills++; } o.cash += r.cash; o.online += r.online; });
      s.expenses.forEach(function (e) { slot(key(e.date)).expenses += e.amount; });
      s.rows = keys.sort().map(function (k) { var o = map[k]; o.label = monthly ? U.monthText(k) : U.dateText(k); o.income = o.zinda + o.katai; o.net = o.income - o.expenses; return o; });
      return s;
    }

    // ================= report models for the export service =================
    var TX_COLS = [{ h: 'Date', type: 'date' }, { h: 'Type', w: 0.7 }, { h: 'Section', w: 0.7 }, { h: 'Source', w: 0.9 }, { h: 'Customer', w: 1.5 }, { h: 'Firm / Company', w: 1.3 },
      { h: 'Bill Amount', type: 'money' }, { h: 'Cash', type: 'money' }, { h: 'Online', type: 'money' }, { h: 'Prev. Balance', type: 'balance' }, { h: 'Balance', type: 'balance' }];
    function txRow(r) { return [r.date, kindLabel(r), secLabel(r.section), srcLabel(r.source), r.customerName, r.firm || '', r.kind === 'payment' ? null : r.amount, r.cash, r.online, r.prevBalance, r.balance]; }
    function txTotal(rows) { var b = rows.filter(function (r) { return r.kind !== 'payment'; }); return ['', rows.length + ' records', '', '', 'TOTAL', '', sum(b, 'amount'), sum(rows, 'cash'), sum(rows, 'online'), '', '']; }
    function filterMeta(f, ctx) {
      var m = [['Section', f.section && f.section !== 'all' ? secLabel(f.section) : 'Zinda and Katai']];
      if (ctx && ctx.customerName) m.push(['Customer', ctx.customerName]);
      if (f.firm) m.push(['Firm / Company', f.firm]);
      return m;
    }
    var METHOD = 'Balances are taken from the saved bills as recorded: opening = previous balance on the first record in the period (or the last balance before it); remaining = balance on the last record. Zinda and Katai balances are kept separately and added when both are shown.';

    function rAllRecords(tx, f, label) {
      var rows = pick(tx, f).sort(U.byDateSeq), bills = rows.filter(function (r) { return r.kind !== 'payment'; });
      return { title: 'All Customer Records', period: label, meta: filterMeta(f, f.ctx),
        summary: [['Bills', bills.length, 'int'], ['Total billed', sum(bills, 'amount'), 'money'], ['Cash received', sum(rows, 'cash'), 'money'], ['Online received', sum(rows, 'online'), 'money']],
        tables: [{ name: 'Records', heading: 'Bills and payments (date-wise)', columns: TX_COLS, rows: rows.map(txRow), total: txTotal(rows) }],
        notes: ['Every bill and payment saved from the four billing sections for this selection, in date order.'], filename: 'all-customer-records' };
    }
    function rAllStatements(tx, f, label) {
      var a = allCustomers(tx, f);
      var detail = [];
      a.list.forEach(function (c) { customerStatement(tx, c.customerId, f).rows.forEach(function (r) { detail.push(r); }); });
      return { title: 'All Customer Statements', period: label, meta: filterMeta(f, f.ctx),
        summary: [['Customers', a.totals.customers, 'int'], ['Total billed', a.totals.bills, 'money'], ['Cash received', a.totals.cash, 'money'], ['Online received', a.totals.online, 'money'], ['Opening balance (total)', a.totals.opening, 'balance'], ['Remaining balance (total)', a.totals.remaining, 'balance']],
        tables: [{ name: 'Customers', heading: 'Customer-wise summary', columns: [{ h: 'Customer', w: 1.6 }, { h: 'Firm / Company', w: 1.3 }, { h: 'Section', w: 0.8 }, { h: 'Bills', type: 'int' }, { h: 'Total Bills', type: 'money' }, { h: 'Cash', type: 'money' }, { h: 'Online', type: 'money' }, { h: 'Opening Bal.', type: 'balance' }, { h: 'Remaining Bal.', type: 'balance' }],
          rows: a.list.map(function (c) { return [c.name, c.firms.join(', '), c.sections.join(' + '), c.billCount, c.bills, c.cash, c.online, c.opening, c.remaining]; }),
          total: ['TOTAL', '', '', a.totals.billCount, a.totals.bills, a.totals.cash, a.totals.online, a.totals.opening, a.totals.remaining] },
        { name: 'Transactions', heading: 'Date-wise transactions by customer', columns: TX_COLS, rows: detail.map(txRow), total: txTotal(detail) }],
        notes: [METHOD], filename: 'all-customer-statements' };
    }
    function rCustomer(tx, customerId, f, label) {
      var st = customerStatement(tx, customerId, f);
      var meta = [['Customer', st.name], ['Firm / Company', st.firms.length ? st.firms.join(', ') : 'Not recorded'], ['Section', f.section && f.section !== 'all' ? secLabel(f.section) : 'Zinda and Katai']];
      return { title: 'Customer Statement', subtitle: st.name, period: label, meta: meta,
        summary: [['Opening balance', st.opening, 'balance'], ['Total bills', st.totals.bills, 'money'], ['Cash received', st.totals.cash, 'money'], ['Online received', st.totals.online, 'money'], ['Total received', st.totals.cash + st.totals.online, 'money'], ['Remaining balance', st.remaining, 'balance'], ['Bills', st.totals.billCount, 'int'], ['Payments', st.totals.paymentCount, 'int']],
        tables: [{ name: 'Statement', heading: 'Transactions', columns: [{ h: 'Date', type: 'date' }, { h: 'Type', w: 0.7 }, { h: 'Section', w: 0.7 }, { h: 'Firm / Company', w: 1.3 }, { h: 'Prev. Balance', type: 'balance' }, { h: 'Bill Amount', type: 'money' }, { h: 'Cash Received', type: 'money' }, { h: 'Online Received', type: 'money' }, { h: 'Balance', type: 'balance' }],
          rows: st.rows.map(function (r) { return [r.date, kindLabel(r), secLabel(r.section), r.firm || '', r.prevBalance, r.kind === 'payment' ? null : r.amount, r.cash, r.online, r.balance]; }),
          total: ['', 'TOTAL', '', '', st.opening, st.totals.bills, st.totals.cash, st.totals.online, st.remaining] }],
        notes: [METHOD].concat(st.check ? ['Note: opening + bills − received differs from the recorded remaining balance by ' + U.money(st.check) + ' because a previous balance typed on a bill did not match the balance before it.'] : []),
        filename: 'customer-statement-' + st.name };
    }
    function rCompanies(tx, f, label) {
      var c = companies(tx, f), recs = pick(tx, { from: f.from, to: f.to, section: f.section, customerId: f.customerId }).filter(function (r) { return U.clean(r.firm); }).sort(U.byDateSeq);
      return { title: 'All Company Records', period: label, meta: [['Section', f.section && f.section !== 'all' ? secLabel(f.section) : 'Zinda and Katai']],
        summary: [['Firms / companies', c.totals.firms, 'int'], ['Total billed', c.totals.bills, 'money'], ['Cash received', c.totals.cash, 'money'], ['Online received', c.totals.online, 'money'], ['Outstanding', c.totals.outstanding, 'balance']],
        tables: [{ name: 'Companies', heading: 'Company-wise summary', columns: [{ h: 'Firm / Company', w: 1.8 }, { h: 'Customers', type: 'int' }, { h: 'Bills', type: 'int' }, { h: 'Total Bills', type: 'money' }, { h: 'Cash', type: 'money' }, { h: 'Online', type: 'money' }, { h: 'Outstanding', type: 'balance' }],
          rows: c.list.map(function (x) { return [x.firm, x.customers, x.billCount, x.bills, x.cash, x.online, x.outstanding]; }), total: ['TOTAL', '', c.totals.billCount, c.totals.bills, c.totals.cash, c.totals.online, c.totals.outstanding] },
        { name: 'Company records', heading: 'Records with a firm / company name', columns: TX_COLS, rows: recs.map(txRow), total: txTotal(recs) }],
        notes: ['Only the firm / company names typed on the bills are used. ' + c.noFirm + ' record(s) in this selection have no firm name and are not included here.'], filename: 'all-company-records' };
    }
    function rCompany(tx, firm, f, label) {
      var d = company(tx, firm, f);
      return { title: 'Company-wise Statement', subtitle: firm, period: label, meta: [['Firm / Company', firm], ['Section', f.section && f.section !== 'all' ? secLabel(f.section) : 'Zinda and Katai']],
        summary: [['Customers', d.customers.length, 'int'], ['Bills', d.totals.billCount, 'int'], ['Total billed', d.totals.bills, 'money'], ['Cash received', d.totals.cash, 'money'], ['Online received', d.totals.online, 'money'], ['Outstanding', d.totals.outstanding, 'balance']],
        tables: [{ name: 'Customers', heading: 'Customer details', columns: [{ h: 'Customer', w: 1.8 }, { h: 'Section', w: 0.8 }, { h: 'Bills', type: 'int' }, { h: 'Total Bills', type: 'money' }, { h: 'Cash', type: 'money' }, { h: 'Online', type: 'money' }, { h: 'Opening Bal.', type: 'balance' }, { h: 'Outstanding', type: 'balance' }],
          rows: d.customers.map(function (c) { return [c.name, c.sections.join(' + '), c.billCount, c.bills, c.cash, c.online, c.opening, c.remaining]; }), total: ['TOTAL', '', d.totals.billCount, d.totals.bills, d.totals.cash, d.totals.online, '', d.totals.outstanding] },
        { name: 'Bills and payments', heading: 'Bills and payment records', columns: TX_COLS, rows: d.records.map(txRow), total: txTotal(d.records) }],
        notes: ['Outstanding = remaining balance recorded on each customer\'s last bill or payment for this firm in the period. ' + METHOD], filename: 'company-statement-' + firm };
    }
    var PNL_NOTE = 'Based on recorded income and recorded expenses only. Income = total of saved Zinda and Katai bills. Purchase cost, stock cost and other costs are not recorded in MurgaMandi Hisab and are not included.';
    function rPnl(tx, exps, p, cats) {
      var r = pnl(tx, exps, p, cats);
      return { title: 'Profit & Loss Statement', subtitle: 'Based on recorded income and recorded expenses only', period: p.label,
        summary: [['Total Zinda billing', r.zinda, 'money'], ['Total Katai billing', r.katai, 'money'], ['Total income (saved bills)', r.income, 'money'], ['Total recorded expenses', r.expenses, 'money'], [r.net < 0 ? 'Net loss' : 'Net profit', r.net, 'money']],
        tables: [{ name: 'Profit and Loss', heading: 'Statement', columns: [{ h: 'Particulars', w: 3 }, { h: 'Amount', type: 'money' }],
          rows: [['Zinda billing (saved Zinda bills)', r.zinda], ['Katai billing (saved Katai bills)', r.katai], ['Total income from ' + r.billCount + ' saved bills', r.income], ['Less: total recorded expenses (' + r.expenseCount + ' entries)', r.expenses]],
          total: [r.net < 0 ? 'NET LOSS (income − expenses)' : 'NET PROFIT (income − expenses)', r.net] },
        { name: r.byMonth ? 'Month-wise' : 'Day-wise', heading: r.byMonth ? 'Month-wise' : 'Day-wise', columns: [{ h: r.byMonth ? 'Month' : 'Date', w: 1.3 }, { h: 'Zinda', type: 'money' }, { h: 'Katai', type: 'money' }, { h: 'Income', type: 'money' }, { h: 'Expenses', type: 'money' }, { h: 'Net', type: 'money' }],
          rows: r.rows.map(function (x) { return [x.label, x.zinda, x.katai, x.income, x.expenses, x.net]; }), total: ['TOTAL', r.zinda, r.katai, r.income, r.expenses, r.net] },
        { name: 'Expenses by category', heading: 'Recorded expenses by category', columns: [{ h: 'Category', w: 2 }, { h: 'Entries', type: 'int' }, { h: 'Amount', type: 'money' }],
          rows: r.categories.map(function (c) { return [c.name, c.count, c.total]; }), total: ['TOTAL', r.expenseCount, r.expenses] }],
        notes: [PNL_NOTE], filename: 'profit-and-loss' };
    }
    function rCash(tx, exps, p, opening) {
      var c = cashFlow(tx, exps, p, opening);
      var na = 'Not recorded';
      return { title: 'Cash & Online Statement', period: p.label + (p.kind === 'all' && c.from ? ' (from ' + U.dateText(c.from) + ')' : ''),
        summary: [['Opening cash', c.openingCash === null ? na : c.openingCash, c.openingCash === null ? 'text' : 'balance'], ['Cash received', c.cashIn, 'money'], ['Cash expenses', c.cashOut, 'money'], ['Closing cash position', c.closingCash === null ? 'Not available' : c.closingCash, c.closingCash === null ? 'text' : 'balance'],
          ['Online received', c.onlineIn, 'money'], ['Online expenses', c.onlineOut, 'money'], ['Net online movement', c.netOnline, 'balance']],
        tables: [{ name: 'Statement', heading: 'Cash and online kept separate', columns: [{ h: 'Particulars', w: 2.4 }, { h: 'Cash', type: 'balance' }, { h: 'Online (bank / UPI)', type: 'balance' }],
          rows: [['Opening balance', c.openingCash, null], ['Received from customers (inflow)', c.cashIn, c.onlineIn], ['Expenses paid (outflow)', c.cashOut, c.onlineOut], ['Net movement in period', c.netCash, c.netOnline]],
          total: ['Closing cash position', c.closingCash, null] },
        { name: 'Day-wise', heading: 'Day-wise cash and online', columns: [{ h: 'Date', type: 'date' }, { h: 'Cash In', type: 'money' }, { h: 'Cash Out', type: 'money' }, { h: 'Net Cash', type: 'balance' }, { h: 'Cash Balance', type: 'balance' }, { h: 'Online In', type: 'money' }, { h: 'Online Out', type: 'money' }, { h: 'Net Online', type: 'balance' }],
          rows: c.rows.map(function (r) { return [r.date, r.cashIn, r.cashOut, r.netCash, r.cashBalance, r.onlineIn, r.onlineOut, r.netOnline]; }), total: ['TOTAL', c.cashIn, c.cashOut, c.netCash, c.closingCash, c.onlineIn, c.onlineOut, c.netOnline] }],
        notes: ['Online payments are bank / UPI money and are never counted as physical cash. ' + c.openingNote + ' Blank opening or online balance = not recorded.'], filename: 'cash-and-online-statement' };
    }
    function rExpense(exps, p, cats) {
      var ex = exps.filter(function (e) { return match(e, { from: p.from, to: p.to }); }), byCat = {}, catRows = [];
      ex.forEach(function (x) { if (!byCat[x.categoryId]) { byCat[x.categoryId] = { name: catName(x.categoryId, cats), cash: 0, online: 0, total: 0, count: 0 }; catRows.push(byCat[x.categoryId]); } var g = byCat[x.categoryId]; g.total += x.amount; g.count++; if (x.mode === 'cash') g.cash += x.amount; else g.online += x.amount; });
      catRows.sort(function (a, b) { return b.total - a.total; });
      var cash = sum(ex.filter(function (e) { return e.mode === 'cash'; }), 'amount'), onl = sum(ex.filter(function (e) { return e.mode === 'online'; }), 'amount');
      return { title: 'Expense Statement', period: p.label,
        summary: [['Total expenses', cash + onl, 'money'], ['Cash expenses', cash, 'money'], ['Online expenses', onl, 'money'], ['Entries', ex.length, 'int']],
        tables: [{ name: 'Expenses', heading: 'Expense entries', columns: [{ h: 'Date', type: 'date' }, { h: 'Category', w: 1.3 }, { h: 'Description', w: 2 }, { h: 'Paid To', w: 1.1 }, { h: 'Mode', w: 0.7 }, { h: 'Amount', type: 'money' }],
          rows: ex.map(function (e) { return [e.date, catName(e.categoryId, cats), e.description, e.paidTo || '', e.mode === 'cash' ? 'Cash' : 'Online', e.amount]; }), total: ['', 'TOTAL', ex.length + ' entries', '', '', cash + onl] },
        { name: 'Category-wise', heading: 'Category-wise totals', columns: [{ h: 'Category', w: 2 }, { h: 'Entries', type: 'int' }, { h: 'Cash', type: 'money' }, { h: 'Online', type: 'money' }, { h: 'Total', type: 'money' }],
          rows: catRows.map(function (g) { return [g.name, g.count, g.cash, g.online, g.total]; }), total: ['TOTAL', ex.length, cash, onl, cash + onl] }],
        filename: 'expense-statement' };
    }
    function rPeriod(tx, exps, p, cats, kind) {
      var monthly = kind === 'year', s = groupPeriod(tx, exps, p, monthly);
      var title = kind === 'day' ? 'Daily Statement' : kind === 'month' ? 'Monthly Statement' : 'Yearly Statement';
      var summary = [['Zinda billing', s.zinda, 'money'], ['Katai billing', s.katai, 'money'], ['Total billing', s.income, 'money'], ['Cash received', s.cash, 'money'], ['Online received', s.online, 'money'], ['Cash expenses', s.expCash, 'money'], ['Online expenses', s.expOnline, 'money'], ['Income − expenses', s.net, 'money']];
      var tables = [];
      if (kind === 'day') {
        tables.push({ name: 'Bills and payments', heading: 'Bills and payments', columns: TX_COLS, rows: s.records.map(txRow), total: txTotal(s.records) });
        tables.push({ name: 'Expenses', heading: 'Expenses', columns: [{ h: 'Category', w: 1.3 }, { h: 'Description', w: 2 }, { h: 'Paid To', w: 1.1 }, { h: 'Mode', w: 0.7 }, { h: 'Amount', type: 'money' }],
          rows: s.expenses.map(function (e) { return [catName(e.categoryId, cats), e.description, e.paidTo || '', e.mode === 'cash' ? 'Cash' : 'Online', e.amount]; }), total: ['TOTAL', s.expenses.length + ' entries', '', '', s.expTotal] });
      } else {
        tables.push({ name: monthly ? 'Month-wise' : 'Day-wise', heading: monthly ? 'Month-wise summary' : 'Day-wise summary', columns: [{ h: monthly ? 'Month' : 'Date', w: 1.2 }, { h: 'Bills', type: 'int' }, { h: 'Zinda', type: 'money' }, { h: 'Katai', type: 'money' }, { h: 'Cash Rec.', type: 'money' }, { h: 'Online Rec.', type: 'money' }, { h: 'Expenses', type: 'money' }, { h: 'Income − Exp.', type: 'money' }],
          rows: s.rows.map(function (r) { return [r.label, r.bills, r.zinda, r.katai, r.cash, r.online, r.expenses, r.net]; }), total: ['TOTAL', s.bills.length, s.zinda, s.katai, s.cash, s.online, s.expTotal, s.net] });
        tables.push(rExpense(exps, p, cats).tables[1]);
      }
      return { title: title, period: p.label, summary: summary, tables: tables, notes: ['Totals from saved bills, payments and expenses only. Income − expenses is based on recorded income and recorded expenses only; purchase and stock costs are not recorded.'], filename: title.toLowerCase().replace(/ /g, '-') };
    }

    return { match: match, balances: balances, customerStatement: customerStatement, allCustomers: allCustomers, companies: companies, company: company, pnl: pnl, cashFlow: cashFlow, periodSummary: periodSummary, groupPeriod: groupPeriod,
      reports: { allRecords: rAllRecords, allStatements: rAllStatements, customer: rCustomer, companies: rCompanies, company: rCompany, pnl: rPnl, cash: rCash, expense: rExpense, period: rPeriod },
      labels: { section: secLabel, source: srcLabel, kind: kindLabel }, METHOD: METHOD, PNL_NOTE: PNL_NOTE };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (root.MMHData) root.MMHReports = create(root.MMHData.util);
})(typeof window !== 'undefined' ? window : this);
