/* ============================================================
   Zinda Daily Entry — multiple-customer sheet (UI layer).
   Ported from the original Chicken Calculator. All maths goes
   through window.BillingCalc (calc.js, the original engine).
   ============================================================ */
(function () {
  'use strict';
  var C = window.BillingCalc;
  if (!C) { document.body.insertAdjacentHTML('afterbegin', '<p style="padding:16px;color:#B91C1C">Calculation engine failed to load. Please refresh.</p>'); return; }
  var STORE_KEY = 'mmh.zindaDaily.v1';
  var MAX_ROWS = 500;
  var FIELDS = ['name', 'pieces', 'kg', 'jaal', 'rate', 'oldBal', 'cash', 'online'];

  var $ = function (id) { return document.getElementById(id); };
  var uid = function () { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var newRow = function (o) { o = o || {}; return { id: uid(), name: o.name || '', pieces: o.pieces != null ? String(o.pieces) : '', kg: o.kg != null ? String(o.kg) : '', rate: o.rate != null ? String(o.rate) : '', customRate: !!o.customRate, jaal: o.jaal != null ? String(o.jaal) : '', customJaal: !!o.customJaal, oldBal: o.oldBal != null ? String(o.oldBal) : '', cash: o.cash != null ? String(o.cash) : '', online: o.online != null ? String(o.online) : '' }; };

  var state = { rows: [], defaultRate: '', defaultJaal: '', sheetNo: 1, selectedId: null };

  // ---------- Persistence (local only, never sent anywhere) ----------
  var storage = (function () {
    try { var k = '__t'; window.localStorage.setItem(k, '1'); window.localStorage.removeItem(k); return window.localStorage; }
    catch (e) { return null; }
  })();
  function load() {
    if (!storage) return null;
    try { var d = JSON.parse(storage.getItem(STORE_KEY) || 'null'); return d && Array.isArray(d.rows) ? d : null; } catch (e) { return null; }
  }
  var saveTimer = null;
  function save() {
    if (!storage) return;
    clearTimeout(saveTimer);
    $('saveText').textContent = 'Saving…';
    saveTimer = setTimeout(function () {
      try {
        storage.setItem(STORE_KEY, JSON.stringify({ rows: state.rows, defaultRate: state.defaultRate, defaultJaal: state.defaultJaal, sheetNo: state.sheetNo, savedAt: new Date().toISOString() }));
        $('saveText').textContent = 'Saved on this device';
      } catch (e) { $('saveText').textContent = 'Not saved (storage full)'; $('saveState').classList.add('off'); }
    }, 250);
  }

  // ---------- Row DOM ----------
  var ICON_DEL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
  var ICON_WA = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>';
  function rowHTML(row) {
    function inp(f, cls, ph, mode) {
      return '<input class="cell-in ' + cls + '" data-f="' + f + '" inputmode="' + mode + '" autocomplete="off" aria-label="' + ph + '">';
    }
    return '' +
      '<div class="c idx"></div>' +
      '<div class="c name">' + inp('name', 'name-in', 'Enter customer name', 'text') + '<span class="status" hidden></span></div>' +
      '<div class="c inp pcs"><span class="m-lbl">Pieces</span>' + inp('pieces', 'n', 'Pieces', 'numeric') + '</div>' +
      '<div class="c inp kg"><span class="m-lbl">Total KG</span>' + inp('kg', 'n', 'KG', 'decimal') + '</div>' +
      '<div class="c inp jaal"><span class="m-lbl">Jaal KG</span>' + inp('jaal', 'n', 'Jaal', 'decimal') + '</div>' +
      '<div class="c auto avg"><span class="m-lbl">Average</span><span class="v" data-o="avg"></span></div>' +
      '<div class="c inp rate"><span class="m-lbl">Rate / KG</span>' + inp('rate', 'n', 'Rate', 'decimal') + '</div>' +
      '<div class="c auto basic"><span class="m-lbl">Basic</span><span class="v" data-o="basic"></span></div>' +
      '<div class="c auto samiti"><span class="m-lbl">Samiti</span><span class="v" data-o="samiti"></span></div>' +
      '<div class="c auto labour"><span class="m-lbl">Labour</span><span class="lab-wrap"><span class="adj" data-o="adj" hidden></span><span class="v" data-o="labour"></span></span></div>' +
      '<div class="c fin"><span class="v" data-o="final"></span></div>' +
      '<div class="c inp old"><span class="m-lbl">Pichla Bal (B)</span>' + inp('oldBal', 'n', 'Bal', 'decimal') + '</div>' +
      '<div class="c inp cash"><span class="m-lbl">Rec Cash</span>' + inp('cash', 'n', 'Cash', 'decimal') + '</div>' +
      '<div class="c inp onl"><span class="m-lbl">Rec Online</span>' + inp('online', 'n', 'Online', 'decimal') + '</div>' +
      '<div class="c due"><span class="m-lbl">Balance Baaki</span><span class="v" data-o="due"></span></div>' +
      '<div class="c act"><button class="wa1" data-wa title="Is customer ka bill WhatsApp par bhejo" aria-label="WhatsApp PDF">' + ICON_WA + '</button><button class="del" data-del title="Delete row" aria-label="Delete row">' + ICON_DEL + '</button></div>' +
      '<div class="m-meta" data-o="meta"></div>';
  }
  function buildRow(row) {
    var el = document.createElement('div');
    el.className = 'r';
    el.setAttribute('role', 'row');
    el.dataset.id = row.id;
    el.innerHTML = rowHTML(row);
    FIELDS.forEach(function (f) { el.querySelector('[data-f="' + f + '"]').value = row[f]; });
    return el;
  }
  function renderAll() {
    var body = $('body');
    body.innerHTML = '';
    var frag = document.createDocumentFragment();
    state.rows.forEach(function (r) { frag.appendChild(buildRow(r)); });
    body.appendChild(frag);
    state.rows.forEach(function (r) { updateRow(r); });
    renumber(); applySearch(); updateTotals(); renderPreview();
  }
  function rowEl(id) { return $('body').querySelector('.r[data-id="' + id + '"]'); }
  function renumber() {
    var n = 0;
    $('body').querySelectorAll('.r').forEach(function (el) { el.querySelector('.idx').textContent = ++n; });
  }

  function updateRow(row) {
    var el = rowEl(row.id); if (!el) return;
    var c = C.computeRow(row);
    var out = function (k) { return el.querySelector('[data-o="' + k + '"]'); };
    ['pieces', 'kg', 'jaal', 'rate'].forEach(function (f) {
      var i = el.querySelector('[data-f="' + f + '"]');
      i.classList.toggle('err', !!c.errors[f]);
      i.title = c.errors[f] || '';
    });
    var st = el.querySelector('.status');
    updateLedgerCell(row, el, c);
    el.classList.toggle('blank', c.status === 'empty' && !rowLedger(row, c));
    var vv = C.validateRow(row), av = C.averageKg(vv.netGrams, vv.pieces);
    setV(out('avg'), av ? av + ' kg' : '—', !av);
    if (c.result && c.status === 'valid') {
      var r = c.result;
      setV(out('basic'), C.formatINR(r.basic));
      setV(out('samiti'), C.formatINR(r.samiti));
      setV(out('labour'), C.formatINR(r.labourAdjusted, { decimals: 2 }));
      setV(out('final'), C.formatINR(r.final));
      var a = out('adj');
      if (r.adjustment > 0) { a.hidden = false; a.textContent = '+' + C.formatINR(r.adjustment, { decimals: 2 }).replace('₹', '₹'); a.title = 'Original ' + C.formatINR(r.labourOriginal, { decimals: 2 }) + ' + round-off ' + C.formatINR(r.adjustment, { decimals: 2 }); }
      else a.hidden = true;
      out('meta').textContent = '';
      st.hidden = true;
    } else {
      ['basic', 'samiti', 'labour', 'final'].forEach(function (k) { setV(out(k), '—', true); });
      out('adj').hidden = true;
      out('meta').textContent = c.status === 'incomplete' ? 'Fill name, pieces, KG and rate to calculate' : c.status === 'empty' ? '' : (c.result && c.result.warning) || 'Check the highlighted values';
      if (c.status === 'incomplete' || c.status === 'invalid' || c.status === 'warning') {
        st.hidden = false; st.className = 'status ' + c.status;
        st.textContent = c.status === 'incomplete' ? 'Incomplete' : c.status === 'warning' ? 'Warning' : 'Invalid';
        st.title = c.status === 'warning' ? c.result.warning : Object.values(c.errors).join('; ');
      } else st.hidden = true;
    }
  }
  function rowLedger(row, c) {
    c = c || C.computeRow(row);
    var billBlank = !String(row.pieces).trim() && !String(row.kg).trim();
    if (c.status === 'valid') return C.ledger(row, c.result.final);
    if (billBlank && row.name.trim()) { var l = C.ledger(row, 0); return l.any ? l : null; }
    return null;
  }
  function dueText(p) { return p < 0 ? 'Adv ' + C.formatINR(-p, { decimals: p % 100 ? 2 : 0 }) : C.formatINR(p, { decimals: p % 100 ? 2 : 0 }); }
  function updateLedgerCell(row, el, c) {
    var l = C.ledger(row, 0);
    ['oldBal', 'cash', 'online'].forEach(function (f) { var i = el.querySelector('[data-f="' + f + '"]'); i.classList.toggle('err', !!l.errors[f]); i.title = l.errors[f] || ''; });
    var L = rowLedger(row, c), o = el.querySelector('[data-o="due"]');
    if (L && L.ok) { setV(o, dueText(L.due)); o.classList.toggle('adv', L.due < 0); }
    else { setV(o, '—', true); o.classList.remove('adv'); }
  }
  function setV(el, text, dash) { el.textContent = text; el.classList.toggle('dash', !!dash); }

  // ---------- Totals ----------
  function updateTotals() {
    var t = C.computeTotals(state.rows);
    var map = {
      tCust: C.formatInt(t.customers), sCust: C.formatInt(t.customers),
      tPcs: C.formatInt(t.pieces), sPcs: C.formatInt(t.pieces), fPcs: C.formatInt(t.pieces),
      tKg: C.formatKg(t.grams), sKg: C.formatKg(t.grams), fKg: C.formatKg(t.grams),
      tBasic: C.formatINR(t.basic), sBasic: C.formatINR(t.basic), fBasic: C.formatINR(t.basic),
      tSamiti: C.formatINR(t.samiti), sSamiti: C.formatINR(t.samiti), fSamiti: C.formatINR(t.samiti),
      tLabour: C.formatINR(t.labour), sLabour: C.formatINR(t.labour), fLabour: C.formatINR(t.labour),
      tGrand: C.formatINR(t.grand), sGrand: C.formatINR(t.grand), mGrand: C.formatINR(t.grand), fFinal: C.formatINR(t.grand)
    };
    var lo = 0, lc = 0, ln = 0, ld = 0;
    state.rows.forEach(function (r) { var L = rowLedger(r); if (L && L.ok) { lo += L.oldBal; lc += L.cash; ln += L.online; ld += L.due; } });
    var m2 = function (p) { return C.formatINR(p, { decimals: p % 100 ? 2 : 0 }); };
    map.fOld = m2(lo); map.fCash = m2(lc); map.fOnline = m2(ln); map.fDue = dueText(ld);
    map.tRec = m2(lc + ln); map.sRec = m2(lc + ln); map.tRecSplit = 'Cash ' + m2(lc) + ' · Online ' + m2(ln);
    map.tDue = dueText(ld); map.sDue = dueText(ld);
    var tav = C.averageKg(t.net, t.pieces) || '—';
    map.fJaal = C.formatKg(t.jaal);
    map.tAvg = tav; map.sAvg = tav; map.fAvg = tav === '—' ? '—' : tav + ' kg';
    Object.keys(map).forEach(function (k) { $(k).textContent = map[k]; });
    $('tWords').textContent = $('sWords').textContent = C.amountInWords(t.grand);
    var extra = [];
    if (t.incomplete) extra.push(t.incomplete + ' incomplete');
    if (t.invalid) extra.push(t.invalid + ' need checking');
    $('metaCount').textContent = t.customers + ' customer' + (t.customers === 1 ? '' : 's') + ' calculated · ' + state.rows.length + ' rows' + (extra.length ? ' · ' + extra.join(', ') + ' (not included in totals)' : '');
    return t;
  }

  // ---------- Calculation preview ----------
  function renderPreview() {
    var p = $('preview');
    var row = state.rows.filter(function (r) { return r.id === state.selectedId; })[0] ||
              state.rows.filter(function (r) { return C.computeRow(r).status === 'valid'; })[0];
    $('body').querySelectorAll('.r.sel').forEach(function (e) { e.classList.remove('sel'); });
    if (!row) { p.innerHTML = '<h3>Calculation Preview</h3><p class="sub">Select a row to see its breakdown</p><p class="footnote">Enter a customer\'s pieces, weight and rate. The breakdown appears here.</p>'; return; }
    var el = rowEl(row.id); if (el) el.classList.add('sel');
    var c = C.computeRow(row);
    var name = row.name.trim() || 'Unnamed customer';
    var idx = state.rows.indexOf(row) + 1;
    var h = '<h3>Calculation Preview</h3><p class="sub">' + esc(name) + ' · row ' + idx + '</p>';
    if (!c.result) {
      h += '<p class="footnote">' + (c.status === 'invalid' ? 'Some values are invalid: ' + esc(Object.values(c.errors).join('; ')) + '.' : 'This row is incomplete. Fill customer name, pieces, total KG and rate.') + '</p>';
      p.innerHTML = h; return;
    }
    var r = c.result;
    var gkg = C.formatKg(c.grams), kg = C.formatKg(c.netGrams), rate = C.formatINR(c.ratePaise);
    h += rc('Pieces', C.formatInt(c.pieces)) + rc('Total Weight', gkg + ' kg') + (c.jaalGrams ? rc('Jaal Weight', '− ' + C.formatKg(c.jaalGrams) + ' kg') + rc('Net Weight<small>' + gkg + ' − ' + C.formatKg(c.jaalGrams) + '</small>', kg + ' kg') : '') + rc('Average Size<small>' + kg + ' kg ÷ ' + C.formatInt(c.pieces) + ' pcs</small>', C.averageKg(c.netGrams, c.pieces) + ' kg / pc') + rc('Rate', rate + ' / kg') +
      rc('Basic Amount<small>' + kg + ' × ' + rate + '</small>', C.formatINR(r.basic)) +
      rc('Samiti Charge<small>1% of basic, rounded down</small>', C.formatINR(r.samiti)) +
      rc('Original Labour<small>' + C.labourRuleText(c.pieces, r.labourDivisor) + '</small>', C.formatINR(r.labourOriginal, { decimals: 2 })) +
      rc('Labour Adjustment<span class="badge">Round to ₹10</span>', '+ ' + C.formatINR(r.adjustment, { decimals: 2 })) +
      rc('Adjusted Labour', C.formatINR(r.labourAdjusted, { decimals: 2 })) +
      '<div class="rc big"><span class="k">Final Amount</span><span class="val">' + (r.final == null ? '—' : C.formatINR(r.final)) + '</span></div>' +
      (r.warning ? '<div class="warn">' + esc(r.warning) + '</div>' : '') +
      ledgerHTML(C.ledger(row, r.final)) +
      '<p class="footnote">Labour is adjusted upward only, so the final bill lands on a multiple of ₹10. Basic and Samiti never change.</p>';
    p.innerHTML = h;
  }
  function ledgerHTML(L) {
    if (!L || !L.any || !L.ok) return '';
    var m2 = function (p) { return C.formatINR(p, { decimals: p % 100 ? 2 : 0 }); };
    return rc('Pichla Balance (B)', '+ ' + m2(L.oldBal)) + rc('Total Due<small>aaj ka bill + pichla</small>', m2(L.due + L.received)) +
      rc('Rec Cash', '− ' + m2(L.cash)) + rc('Rec Online', '− ' + m2(L.online)) +
      '<div class="rc big due-r"><span class="k">Balance Baaki</span><span class="val">' + dueText(L.due) + '</span></div>';
  }
  function rc(k, v) { return '<div class="rc"><span class="k">' + k + '</span><span class="val">' + v + '</span></div>'; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }

  // ---------- Actions ----------
  function addRows(n, focus) {
    var room = MAX_ROWS - state.rows.length;
    if (room <= 0) { toast('Maximum of ' + MAX_ROWS + ' rows per bill reached'); return; }
    n = Math.min(n, room);
    var body = $('body'), first = null;
    for (var i = 0; i < n; i++) {
      var r = newRow({ rate: state.defaultRate, jaal: state.defaultJaal });
      state.rows.push(r);
      var el = buildRow(r); body.appendChild(el); updateRow(r);
      if (!first) first = el;
    }
    renumber(); updateTotals(); save();
    if (focus && first) { first.querySelector('[data-f="name"]').focus(); if (first.scrollIntoView) first.scrollIntoView({ block: 'nearest' }); }
    if (n > 1) toast(n + ' rows added');
  }
  function deleteRow(id) {
    var i = state.rows.findIndex(function (r) { return r.id === id; });
    if (i < 0) return;
    var removed = state.rows.splice(i, 1)[0];
    var el = rowEl(id); if (el) el.remove();
    if (state.selectedId === id) state.selectedId = null;
    renumber(); updateTotals(); renderPreview(); save();
    toast('Deleted ' + (removed.name.trim() || 'row ' + (i + 1)));
  }
  function clearAll() {
    state.rows = []; state.selectedId = null; state.sheetNo += 1;
    $('sheetNo').textContent = '#' + state.sheetNo;
    $('search').value = '';
    renderAll(); addRows(10, false); save();
    toast('Bill cleared. New sheet started.');
  }

  // ---------- Export ----------
  function exportRows() {
    var head = ['S.No', 'Customer Name', 'Pieces', 'Total KG', 'Jaal KG', 'Net KG', 'Average KG / Piece', 'Rate / KG', 'Basic Amount', 'Samiti Charge', 'Original Labour', 'Labour Adjustment', 'Labour Charge', 'Final Amount', 'Pichla Balance', 'Rec Cash', 'Rec Online', 'Balance Baaki'];
    var rows = [], n = 0, P = C.paiseToPlain, lo = 0, lc = 0, ln = 0, ld = 0;
    state.rows.forEach(function (row) {
      var c = C.computeRow(row), L = rowLedger(row, c);
      if (L && !L.ok) L = null;
      var led = L ? [P(L.oldBal), P(L.cash), P(L.online), P(L.due)] : ['', '', '', ''];
      if (L) { lo += L.oldBal; lc += L.cash; ln += L.online; ld += L.due; }
      if (c.status === 'valid') {
        var r = c.result;
        rows.push([++n, row.name.trim(), c.pieces, C.formatKg(c.grams).replace(/,/g, ''), C.formatKg(c.jaalGrams).replace(/,/g, ''), C.formatKg(c.netGrams).replace(/,/g, ''), C.averageKg(c.netGrams, c.pieces) || '', P(c.ratePaise), P(r.basic), P(r.samiti), P(r.labourOriginal), P(r.adjustment), P(r.labourAdjusted), P(r.final)].concat(led));
      } else if (L) {
        rows.push([++n, row.name.trim(), '', '', '', '', '', '', '', '', '', '', '', ''].concat(led));
      }
    });
    var t = C.computeTotals(state.rows);
    var total = ['', 'TOTAL', t.pieces, C.formatKg(t.grams).replace(/,/g, ''), C.formatKg(t.jaal).replace(/,/g, ''), C.formatKg(t.net).replace(/,/g, ''), C.averageKg(t.net, t.pieces) || '', '', P(t.basic), P(t.samiti), '', '', P(t.labour), P(t.grand), P(lo), P(lc), P(ln), P(ld)];
    return { head: head, rows: rows, total: total, count: n };
  }
  function fileStamp() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function download(name, mime, content) {
    try {
      var blob = new Blob([content], { type: mime });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
      toast('Downloaded ' + name);
    } catch (e) { toast('Download blocked in this window.'); }
  }
  function exportCSV() {
    var d = exportRows(); if (!d.count) { toast('No complete customer rows to export'); return; }
    var q = function (v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [d.head].concat(d.rows, [d.total]).map(function (r) { return r.map(q).join(','); });
    download('chicken-bill-' + fileStamp() + '.csv', 'text/csv;charset=utf-8', '\uFEFF' + lines.join('\r\n'));
  }
  function exportExcel() {
    var d = exportRows(); if (!d.count) { toast('No complete customer rows to export'); return; }
    var x = function (v) { return String(v).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); };
    var cell = function (v, style, num) {
      if (v === '' || v == null) return '<Cell' + (style ? ' ss:StyleID="' + style + '"' : '') + '/>';
      return '<Cell' + (style ? ' ss:StyleID="' + style + '"' : '') + '><Data ss:Type="' + (num ? 'Number' : 'String') + '">' + x(v) + '</Data></Cell>';
    };
    var money = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
    var body = d.rows.map(function (r) {
      return '<Row>' + r.map(function (v, i) { return cell(v, money.indexOf(i) >= 0 ? (i === 13 || i === 17 ? 'fin' : 'money') : (i >= 3 && i <= 6 ? 'kg' : null), i !== 1); }).join('') + '</Row>';
    }).join('');
    var tot = '<Row>' + d.total.map(function (v, i) { return cell(v, money.indexOf(i) >= 0 ? 'totm' : 'tot', i > 1 && v !== ''); }).join('') + '</Row>';
    var xml = '<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
      '<Styles><Style ss:ID="h"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#166534" ss:Pattern="Solid"/></Style>' +
      '<Style ss:ID="money"><NumberFormat ss:Format="&quot;₹&quot;#,##,##0.00"/></Style>' +
      '<Style ss:ID="kg"><NumberFormat ss:Format="0.###"/></Style>' +
      '<Style ss:ID="fin"><Font ss:Bold="1" ss:Color="#166534"/><Interior ss:Color="#F0FDF4" ss:Pattern="Solid"/><NumberFormat ss:Format="&quot;₹&quot;#,##,##0.00"/></Style>' +
      '<Style ss:ID="tot"><Font ss:Bold="1"/><Interior ss:Color="#F1F4F7" ss:Pattern="Solid"/></Style>' +
      '<Style ss:ID="totm"><Font ss:Bold="1"/><Interior ss:Color="#F1F4F7" ss:Pattern="Solid"/><NumberFormat ss:Format="&quot;₹&quot;#,##,##0.00"/></Style></Styles>' +
      '<Worksheet ss:Name="Bill ' + fileStamp() + '"><Table>' +
      '<Column ss:Width="40"/><Column ss:Width="190"/>' + '<Column ss:Width="80"/>'.repeat(9) +
      '<Row>' + d.head.map(function (h) { return cell(h, 'h'); }).join('') + '</Row>' + body + tot +
      '</Table></Worksheet></Workbook>';
    download('chicken-bill-' + fileStamp() + '.xls', 'application/vnd.ms-excel', xml);
  }
  function doPrint() {
    $('printDate').textContent = 'Bill Sheet #' + state.sheetNo + ' · ' + new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    $('printFirm').textContent = firmName();
    closeSummary();
    try { window.print(); } catch (e) { toast('Printing is blocked in this window.'); }
  }

  // ---------- UI helpers ----------
  var toastT;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2600); }
  function confirmDlg(onYes) {
    var d = $('dlg'); d.classList.add('show'); $('dlgNo').focus();
    var close = function () { d.classList.remove('show'); $('dlgYes').onclick = $('dlgNo').onclick = null; };
    $('dlgNo').onclick = close;
    $('dlgYes').onclick = function () { close(); onYes(); };
  }
  function applySearch() {
    var q = $('search').value.trim().toLowerCase();
    state.rows.forEach(function (r) { var el = rowEl(r.id); if (el) el.classList.toggle('hidden', !!q && r.name.toLowerCase().indexOf(q) < 0); });
  }
  function openSummary() { $('mSheet').classList.add('show'); }
  function closeSummary() { $('mSheet').classList.remove('show'); }

  // ---------- Events ----------
  function bind() {
    var body = $('body');
    body.addEventListener('input', function (e) {
      var f = e.target.dataset.f; if (!f) return;
      var id = e.target.closest('.r').dataset.id;
      var row = state.rows.filter(function (r) { return r.id === id; })[0]; if (!row) return;
      row[f] = e.target.value;
      if (f === 'rate') row.customRate = row.rate.trim() !== '' && row.rate.trim() !== state.defaultRate;
      if (f === 'jaal') row.customJaal = row.jaal.trim() !== state.defaultJaal;
      updateRow(row); updateTotals();
      if (state.selectedId === id || !state.selectedId) { state.selectedId = id; renderPreview(); }
      if (f === 'name') applySearch();
      save();
    });
    body.addEventListener('focusin', function (e) {
      var r = e.target.closest('.r'); if (!r || state.selectedId === r.dataset.id) return;
      state.selectedId = r.dataset.id; renderPreview();
    });
    body.addEventListener('click', function (e) {
      var w = e.target.closest('[data-wa]'); if (w) { shareRow(w.closest('.r').dataset.id); return; }
      var b = e.target.closest('[data-del]'); if (b) deleteRow(b.closest('.r').dataset.id);
    });
    body.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || !e.target.dataset.f) return;
      e.preventDefault();
      var f = e.target.dataset.f, rowE = e.target.closest('.r');
      var next = rowE.nextElementSibling;
      while (next && next.classList.contains('hidden')) next = next.nextElementSibling;
      if (!next) { addRows(1, false); next = body.lastElementChild; }
      var i = next.querySelector('[data-f="' + f + '"]'); i.focus(); i.select && i.select();
    });
    $('btnAdd').onclick = function () { addRows(1, true); };
    $('btnAdd10').onclick = function () { addRows(10, false); };
    $('btnClear').onclick = function () { $('dlgT').textContent = 'Clear all customers?'; $('dlgP').textContent = "This removes every entry from this bill. It can't be undone."; confirmDlg(clearAll); };
    $('btnCsv').onclick = exportCSV;
    $('btnExcel').onclick = $('mExcel').onclick = exportExcel;
    $('btnPrint').onclick = $('mPrint').onclick = doPrint;
    $('btnWa').onclick = $('mWa').onclick = shareMulti;
    $('btnSummary').onclick = openSummary; $('btnBack').onclick = closeSummary;
    $('search').addEventListener('input', applySearch);
    var dr = $('defaultRate');
    dr.addEventListener('input', function () {
      var v = C.parseScaled(dr.value, 2);
      dr.classList.toggle('err', !(v > 0));
      if (v > 0) {
        state.defaultRate = dr.value.trim();
        state.rows.forEach(function (r) {
          if (r.customRate) return;
          r.rate = state.defaultRate;
          var el = rowEl(r.id), inp = el && el.querySelector('[data-f="rate"]');
          if (inp && inp !== document.activeElement) inp.value = r.rate;
          updateRow(r);
        });
        updateTotals(); renderPreview();
        save();
      }
    });
    var dj = $('defaultJaal');
    dj.addEventListener('input', function () {
      var raw = dj.value.trim(), v = raw === '' ? 0 : C.parseScaled(raw, 3);
      dj.classList.toggle('err', !(v >= 0));
      if (!(v >= 0)) return;
      state.defaultJaal = raw;
      state.rows.forEach(function (r) {
        if (r.customJaal) return;
        r.jaal = state.defaultJaal;
        var el = rowEl(r.id), inp = el && el.querySelector('[data-f="jaal"]');
        if (inp && inp !== document.activeElement) inp.value = r.jaal;
        updateRow(r);
      });
      updateTotals(); renderPreview();
      save();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { $('dlg').classList.remove('show'); closeSummary(); } });
    window.addEventListener('beforeprint', function () { $('printFirm').textContent = firmName(); $('printDate').textContent = 'Bill Sheet #' + state.sheetNo + ' · ' + new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); });
  }

  // ---------- Firm name (this section only) ----------
  var FIRM_KEY = 'mmh.zindaDaily.firm';
  function firmName() { return ($('dFirm') && $('dFirm').value.trim()) || ''; }
  function todayText() { return new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }

  // ---------- WhatsApp PDF: one customer's bill ----------
  function receiptModel(row) {
    var v = C.validateRow(row);
    if (!v.ok) return null;
    var r = C.calculate(v.pieces, v.netGrams, v.ratePaise), L = C.ledger(row, r.final);
    var m2 = function (p) { return C.formatINR(p, { decimals: p % 100 ? 2 : 0 }); };
    var m = { firm: firmName(), name: String(row.name || '').trim() || 'Customer', date: todayText(), boxes: [], rows: [], led: [] };
    m.boxes.push(['PIECES', C.formatInt(v.pieces)], ['TOTAL KG', C.formatKg(v.grams)]);
    if (v.jaalGrams) m.boxes.push(['JAAL KG', '− ' + C.formatKg(v.jaalGrams)], ['NET KG', C.formatKg(v.netGrams)]);
    m.boxes.push(['AVERAGE', C.averageKg(v.netGrams, v.pieces) + ' kg'], ['RATE / KG', C.formatINR(v.ratePaise)]);
    m.rows.push(['Basic Amount', C.formatKg(v.netGrams) + ' kg × ' + C.formatINR(v.ratePaise), C.formatINR(r.basic)]);
    m.rows.push(['Samiti', '1%', C.formatINR(r.samiti)]);
    m.rows.push(['Labour', C.labourRuleText(v.pieces, r.labourDivisor) + ' + round-off ' + C.formatINR(r.adjustment, { decimals: 2 }), C.formatINR(r.labourAdjusted, { decimals: 2 })]);
    m.billText = r.final == null ? '—' : C.formatINR(r.final, { decimals: r.final % 100 ? 2 : 0 });
    if (L.any && L.ok) {
      m.led = [['Pichla Balance (B)', '+ ' + m2(L.oldBal)], ['Total Due', m2(L.due + L.received), 1], ['Rec Cash', '− ' + m2(L.cash)], ['Rec Online', '− ' + m2(L.online)]];
      m.balText = dueText(L.due); m.balPaise = L.due;
    }
    m.words = r.final == null ? '' : C.amountInWords(L.any && L.ok ? Math.max(L.due, 0) : r.final);
    return m;
  }
  function shareRow(id) {
    var row = null; state.rows.forEach(function (r) { if (r.id === id) row = r; });
    var m = row && receiptModel(row);
    if (!m) { toast('Is row mein pieces, KG aur rate sahi bhariye'); return; }
    window.ZindaShare.share(window.ZindaShare.receiptCanvas(m), 'Bill ' + m.name + ' ' + m.date, 'Bill · ' + m.name + ' · ' + m.date);
  }

  // ---------- WhatsApp PDF: the whole sheet ----------
  function multiSpec() {
    var d = exportRows(); if (!d.count) return null;
    var M = function (v) { return v === '' ? '' : C.formatINR(Math.round(parseFloat(v) * 100), { decimals: Math.round(parseFloat(v) * 100) % 100 ? 2 : 0 }); };
    var B = function (v) { return v === '' ? '' : dueText(Math.round(parseFloat(v) * 100)); };
    var K = function (v) { return v === '' ? '' : v; };
    var map = function (r, tot) {
      return [tot ? '' : r[0], tot ? 'TOTAL' : r[1], r[2] === '' ? '' : C.formatInt(+r[2]), K(r[3]), r[4] === '' || +r[4] === 0 ? (tot ? '0' : '—') : r[4], K(r[5]),
        tot ? '' : (r[7] === '' ? '' : M(r[7])), M(r[8]), M(r[9]), M(r[12]), M(r[13]), M(r[14]), M(r[15]), M(r[16]), B(r[17])];
    };
    var rows = d.rows.map(function (r) { return map(r); }); rows.push(map(d.total, true));
    var T = d.total, rec = String((parseFloat(T[15] || 0) + parseFloat(T[16] || 0)).toFixed(2));
    return { title: 'Wholesale Bill · ' + d.count + ' customers', sub: firmName(), date: todayText(),
      cols: [{ h: '#', w: 44 }, { h: 'Customer', w: 230, b: 1 }, { h: 'Pcs', w: 70, r: 1 }, { h: 'Total KG', w: 105, r: 1 }, { h: 'Jaal', w: 75, r: 1 }, { h: 'Net KG', w: 105, r: 1 }, { h: 'Rate', w: 70, r: 1 },
        { h: 'Basic', w: 125, r: 1 }, { h: 'Samiti', w: 95, r: 1 }, { h: 'Labour', w: 100, r: 1 }, { h: 'Aaj ka Bill', w: 135, r: 1, b: 1, color: '#166534' },
        { h: 'Pichla Bal', w: 125, r: 1 }, { h: 'Rec Cash', w: 115, r: 1 }, { h: 'Rec Online', w: 115, r: 1 }, { h: 'Balance', w: 140, r: 1, b: 1, color: '#9A3412' }],
      rows: rows, bold: [rows.length - 1],
      sum: [['Basic Amount', M(T[8])], ['Samiti Charge (1%)', M(T[9])], ['Labour Charge', M(T[12])], ['Grand Total (Aaj ka Bill)', M(T[13]), '#166534', 1],
        ['Pichla Balance', M(T[14])], ['Received (Cash ' + M(T[15]) + ' + Online ' + M(T[16]) + ')', M(rec)], ['Balance Baaki', B(T[17]), '#9A3412', 1]] };
  }
  function shareMulti() {
    var sp = multiSpec(); if (!sp) { toast('Pehle kam se kam ek customer ka bill bhariye'); return; }
    window.ZindaShare.share(window.ZindaShare.tableCanvas(sp), 'Bill-Sheet-' + fileStamp(), 'Bill · ' + sp.date);
  }

  // ---------- Bills sent from Zinda Single Customer Bill ----------
  var HANDOFF_KEY = 'mmh.zindaDaily.inbox';
  function takeInbox() {
    if (!storage) return 0;
    var inbox = [];
    try { inbox = JSON.parse(storage.getItem(HANDOFF_KEY) || '[]'); } catch (e) { inbox = []; }
    if (!Array.isArray(inbox) || !inbox.length) return 0;
    var n = 0;
    inbox.forEach(function (d) {
      if (!d || typeof d !== 'object' || state.rows.length >= MAX_ROWS) return;
      var data = {}; FIELDS.forEach(function (f) { data[f] = typeof d[f] === 'string' ? d[f].slice(0, 80) : ''; });
      data.customRate = data.rate.trim() !== state.defaultRate;
      data.customJaal = data.jaal.trim() !== state.defaultJaal;
      var blank = state.rows.filter(function (r) { return !r.name.trim() && !r.pieces && !r.kg; })[0];
      if (blank) { FIELDS.forEach(function (f) { blank[f] = data[f]; }); blank.customRate = data.customRate; blank.customJaal = data.customJaal; }
      else state.rows.push(newRow(data));
      n++;
    });
    try { storage.removeItem(HANDOFF_KEY); } catch (e) {}
    return n;
  }

  // ---------- Init ----------
  function init() {
    $('todayChip').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    var saved = load();
    if (saved) {
      state.rows = saved.rows.slice(0, MAX_ROWS).map(function (r) { return newRow(r && typeof r === 'object' ? r : {}); });
      state.defaultRate = typeof saved.defaultRate === 'string' ? saved.defaultRate : '';
      state.defaultJaal = typeof saved.defaultJaal === 'string' ? saved.defaultJaal : '';
      state.sheetNo = +saved.sheetNo > 0 ? Math.floor(+saved.sheetNo) : 1;
    } else for (var bi = 0; bi < 5; bi++) state.rows.push(newRow({ rate: '' }));
    var got = takeInbox();
    if (!storage) { $('storageNotice').classList.add('show'); $('saveState').classList.add('off'); $('saveText').textContent = 'Not saved'; }
    $('defaultRate').value = state.defaultRate;
    $('defaultJaal').value = state.defaultJaal;
    $('sheetNo').textContent = '#' + state.sheetNo;
    try { $('dFirm').value = (storage && storage.getItem(FIRM_KEY)) || ''; } catch (e) {}
    $('dFirm').addEventListener('input', function () { if (storage) try { storage.setItem(FIRM_KEY, $('dFirm').value); } catch (e) {} });
    state.selectedId = state.rows[0] && state.rows[0].id;
    window.ZindaShare.init(toast);
    $('shareDlg').addEventListener('keydown', function (e) { if (e.key === 'Escape') $('shareDlg').classList.remove('show'); });
    bind(); renderAll(); window.ZindaKeypad.init();
    if (got) { $('inbox').textContent = got + ' bill' + (got === 1 ? '' : 's') + ' added from Zinda Single Customer Bill.'; $('inbox').classList.add('show'); save(); }
    else if (!saved && storage) save();
    window.addEventListener('beforeunload', function () { if (saveTimer && storage) { clearTimeout(saveTimer); try { storage.setItem(STORE_KEY, JSON.stringify({ rows: state.rows, defaultRate: state.defaultRate, defaultJaal: state.defaultJaal, sheetNo: state.sheetNo, savedAt: new Date().toISOString() })); } catch (e) {} } });
  }
  try { init(); } catch (e) { toast('Something went wrong: ' + e.message); if (window.console) console.error(e); }

  // Exposed for automated tests only
  window.__zindaDaily = { state: state, addRows: addRows, deleteRow: deleteRow, clearAll: clearAll, exportRows: exportRows, multiSpec: multiSpec };
})();
