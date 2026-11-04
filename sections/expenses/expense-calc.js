/* ============================================================
   Expense Management · totals and report models (pure, no DOM).
   Every figure is a plain sum of saved expense amounts (integer
   paise). Cash and Online are always added up separately.
   ============================================================ */
(function (root) {
  'use strict';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function summarize(list) {
    var s = { total: 0, cash: 0, online: 0, count: 0 };
    list.forEach(function (e) { s.total += e.amount; s.count++; if (e.mode === 'cash') s.cash += e.amount; else s.online += e.amount; });
    return s;
  }
  /** [{id, name, count, cash, online, total}] for every category that has entries, biggest first. */
  function byCategory(list, cats) {
    var map = {}, order = [];
    list.forEach(function (e) {
      var g = map[e.categoryId];
      if (!g) { g = map[e.categoryId] = { id: e.categoryId, name: nameOf(e.categoryId, cats), count: 0, cash: 0, online: 0, total: 0 }; order.push(g); }
      g.count++; g.total += e.amount; if (e.mode === 'cash') g.cash += e.amount; else g.online += e.amount;
    });
    return order.sort(function (a, b) { return b.total - a.total || (a.name < b.name ? -1 : 1); });
  }
  function groupBy(list, keyFn) {
    var map = {}, keys = [];
    list.forEach(function (e) { var k = keyFn(e); var g = map[k]; if (!g) { g = map[k] = { key: k, count: 0, cash: 0, online: 0, total: 0 }; keys.push(k); } g.count++; g.total += e.amount; if (e.mode === 'cash') g.cash += e.amount; else g.online += e.amount; });
    return keys.sort().map(function (k) { return map[k]; });
  }
  function byDay(list) { return groupBy(list, function (e) { return e.date; }); }
  function byMonth(list) { return groupBy(list, function (e) { return e.date.slice(0, 7); }); }
  function nameOf(id, cats) { for (var i = 0; i < (cats || []).length; i++) if (cats[i].id === id) return cats[i].name; return 'Unknown category'; }
  function monthText(ym) { var p = ym.split('-'); return (MONTHS[+p[1] - 1] || '') + ' ' + p[0]; }
  function pct(part, whole) { return whole ? (Math.round(part * 1000 / whole) / 10).toFixed(1) + '%' : '0.0%'; }

  /** Report model for the list on screen (export-service format). */
  function viewReport(o) {
    var list = o.list, cats = o.cats, s = summarize(list), cg = byCategory(list, cats);
    var meta = [['Category', o.categoryLabel || 'All categories'], ['Payment mode', o.modeLabel || 'Cash and Online']];
    if (o.search) meta.push(['Search', o.search]);
    var tables = [{
      name: 'Expenses', heading: 'Expense entries',
      columns: [{ h: 'Date', type: 'date' }, { h: 'Category', w: 1.3 }, { h: 'Description', w: 2 }, { h: 'Paid To', w: 1.2 }, { h: 'Mode', w: 0.7 }, { h: 'Amount', type: 'money' }, { h: 'Notes', w: 1.4 }],
      rows: list.map(function (e) { return [e.date, nameOf(e.categoryId, cats), e.description, e.paidTo || '', e.mode === 'cash' ? 'Cash' : 'Online', e.amount, e.notes || '']; }),
      total: ['', 'TOTAL', s.count + ' entries', '', '', s.total, '']
    }, {
      name: 'Category-wise', heading: 'Category-wise totals',
      columns: [{ h: 'Category', w: 2 }, { h: 'Entries', type: 'int' }, { h: 'Cash', type: 'money' }, { h: 'Online', type: 'money' }, { h: 'Total', type: 'money' }],
      rows: cg.map(function (g) { return [g.name, g.count, g.cash, g.online, g.total]; }),
      total: ['TOTAL', s.count, s.cash, s.online, s.total]
    }];
    if (o.kind === 'month' || o.kind === 'range' || o.kind === 'all') {
      var days = byDay(list);
      if (o.kind === 'month' || days.length <= 62) tables.push({ name: 'Day-wise', heading: 'Day-wise totals', columns: [{ h: 'Date', type: 'date' }, { h: 'Entries', type: 'int' }, { h: 'Cash', type: 'money' }, { h: 'Online', type: 'money' }, { h: 'Total', type: 'money' }],
        rows: days.map(function (g) { return [g.key, g.count, g.cash, g.online, g.total]; }), total: ['TOTAL', s.count, s.cash, s.online, s.total] });
    }
    if (o.kind === 'year' || o.kind === 'all' || o.kind === 'range') {
      var months = byMonth(list);
      if (o.kind === 'year' || months.length > 1) tables.push({ name: 'Month-wise', heading: 'Month-wise totals', columns: [{ h: 'Month', w: 1.4 }, { h: 'Entries', type: 'int' }, { h: 'Cash', type: 'money' }, { h: 'Online', type: 'money' }, { h: 'Total', type: 'money' }],
        rows: months.map(function (g) { return [monthText(g.key), g.count, g.cash, g.online, g.total]; }), total: ['TOTAL', s.count, s.cash, s.online, s.total] });
    }
    var kindName = { day: 'Daily', month: 'Monthly', year: 'Yearly', range: 'Date range', all: 'All' }[o.kind] || '';
    return {
      title: kindName + ' Expense Statement', period: o.periodLabel, meta: meta,
      summary: [['Total expenses', s.total, 'money'], ['Cash expenses', s.cash, 'money'], ['Online expenses', s.online, 'money'], ['Entries', s.count, 'int']],
      tables: tables, notes: ['Totals are the sum of the expense entries saved in MurgaMandi Hisab for this selection. Cash and online are counted separately.'],
      filename: 'expense-statement-' + o.fileTag
    };
  }
  function categoryReport(o) {
    var list = o.list, s = summarize(list), cg = byCategory(list, o.cats);
    return {
      title: 'Category-wise Expense Report', period: o.periodLabel,
      meta: [['Payment mode', o.modeLabel || 'Cash and Online']].concat(o.search ? [['Search', o.search]] : []),
      summary: [['Total expenses', s.total, 'money'], ['Cash', s.cash, 'money'], ['Online', s.online, 'money'], ['Categories used', cg.length, 'int']],
      tables: [{ name: 'Category-wise', heading: 'Category-wise totals', columns: [{ h: 'Category', w: 2 }, { h: 'Entries', type: 'int' }, { h: 'Cash', type: 'money' }, { h: 'Online', type: 'money' }, { h: 'Total', type: 'money' }, { h: 'Share', w: 0.7 }],
        rows: cg.map(function (g) { return [g.name, g.count, g.cash, g.online, g.total, pct(g.total, s.total)]; }), total: ['TOTAL', s.count, s.cash, s.online, s.total, s.total ? '100.0%' : ''] }],
      notes: ['Share = category total ÷ total expenses for this selection.'],
      filename: 'expense-categories-' + o.fileTag
    };
  }

  var api = { summarize: summarize, byCategory: byCategory, byDay: byDay, byMonth: byMonth, viewReport: viewReport, categoryReport: categoryReport };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ExpenseCalc = api;
})(typeof window !== 'undefined' ? window : this);
