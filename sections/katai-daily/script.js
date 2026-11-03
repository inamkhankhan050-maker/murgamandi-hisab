/* ============================================================
   Katai Daily Customer Entry — UI layer.
   Uses only window.KataiDailyCalc (calc.js in this folder).
   No Zinda / Chicken Calculator logic is used here.
   ============================================================ */
(function () {
  'use strict';
  var K = window.KataiDailyCalc;
  if (!K) { document.body.insertAdjacentHTML('afterbegin', '<p style="padding:16px;color:#B91C1C">Calculation engine failed to load. Please refresh.</p>'); return; }

  var KEY = 'mmh.kataiDaily.v1', PREV_KEY = 'mmh.kataiDaily.previous', FIRM_KEY = 'mmh.kataiDaily.firm';
  var MAX_CUSTOMERS = 300;
  var $ = function (id) { return document.getElementById(id); };
  var uid = function () { return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var state = { date: '', sheetNo: 1, rates: {}, customers: [] };
  var selectedId = null;

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
  function calc(c) { var bill = K.computeBill(c.lines); return { bill: bill, L: K.ledger(c, bill.total) }; }
  var toastT;
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
    confirmDlg('Delete this customer?', (c.name.trim() || 'This customer') + ' and all their products will be removed.', 'Delete', function () {
      state.customers = state.customers.filter(function (x) { return x.id !== id; });
      if (selectedId === id) selectedId = null;
      renderAll(); save(); toast('Customer deleted');
    });
  }
  function clearAll() {
    confirmDlg('Start a new day?', 'All customers on this sheet will be removed. The current sheet is kept as a backup you can restore once.', 'Clear All', function () {
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
      tr.appendChild(nm);
      tr.appendChild(el('td', 'ra', String(r.bill.items)));
      tr.appendChild(el('td', 'ra fin', K.money(r.bill.total)));
      tr.appendChild(el('td', 'ra', r.L.ok ? K.money(r.L.oldBal) : '—'));
      tr.appendChild(el('td', 'ra', r.L.ok ? K.money(r.L.received) : '—'));
      tr.appendChild(el('td', 'ra due' + (r.L.ok && r.L.balance < 0 ? ' adv' : ''), r.L.ok ? K.balanceText(r.L.balance) : '—'));
      var act = el('td', 'c-act');
      var wa = el('button', 'ic wa1', '⇪'); wa.type = 'button'; wa.dataset.act = 'wa'; wa.title = 'WhatsApp bill'; wa.setAttribute('aria-label', 'WhatsApp bill');
      var img = el('img'); img.src = '../../assets/icons/whatsapp-green.svg'; img.alt = ''; img.width = 16; img.height = 16; wa.textContent = ''; wa.appendChild(img);
      var del = el('button', 'ic del', '✕'); del.type = 'button'; del.dataset.act = 'del'; del.title = 'Delete'; del.setAttribute('aria-label', 'Delete customer');
      act.appendChild(wa); act.appendChild(del); tr.appendChild(act);
      body.appendChild(tr);
    });
    $('cEmpty').hidden = state.customers.length > 0;
    $('fItems').textContent = String(tot.items); $('fBill').textContent = K.money(tot.bill); $('fOld').textContent = K.money(tot.old);
    $('fRec').textContent = K.money(tot.rec); $('fBal').textContent = K.balanceText(tot.bal);
    $('tCust').textContent = String(tot.n); $('tRec').textContent = K.money(tot.rec); $('tRecSplit').textContent = 'Cash ' + K.money(tot.cash) + ' · Online ' + K.money(tot.online);
    $('tBal').textContent = K.balanceText(tot.bal); $('tBill').textContent = K.money(tot.bill); $('tWords').textContent = K.amountInWords(tot.bill);
    $('sheetNo').textContent = '#' + state.sheetNo;
    return tot;
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
    if (r.L.any && r.L.ok) { add('Total Due (bill + pichla)', K.money(r.L.totalDue)); add('Received (cash + online)', '− ' + K.money(r.L.received)); add('Remaining Balance', K.balanceText(r.L.balance), 'big due-r'); }
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
      '<Styles><Style ss:ID="h"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#7C2D12" ss:Pattern="Solid"/></Style>' +
      '<Style ss:ID="money"><NumberFormat ss:Format="&quot;₹&quot;#,##,##0.00"/></Style>' +
      '<Style ss:ID="tot"><Font ss:Bold="1"/><Interior ss:Color="#F6F1EE" ss:Pattern="Solid"/></Style>' +
      '<Style ss:ID="totm"><Font ss:Bold="1"/><Interior ss:Color="#F6F1EE" ss:Pattern="Solid"/><NumberFormat ss:Format="&quot;₹&quot;#,##,##0.00"/></Style></Styles>' +
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
    var sum = [['Total Bill', K.money(r.bill.total), '#7C2D12', 1]];
    if (r.L.any && r.L.ok) sum.push(['Pichla Balance', K.money(r.L.oldBal)], ['Received (Cash + Online)', K.money(r.L.received)], ['Remaining Balance', K.balanceText(r.L.balance), '#9A3412', 1]);
    var name = c.name.trim() || 'Customer';
    var cv = window.KataiDailyShare.billCanvas({ heading: heading(), title: 'Katai Bill', customer: name, date: dateText(),
      cols: [{ h: '#', w: 50 }, { h: 'Product', w: 260, b: 1 }, { h: 'Qty', w: 170, r: 1 }, { h: 'Rate', w: 150, r: 1 }, { h: 'Amount', w: 190, r: 1, b: 1 }], rows: rows, sum: sum });
    window.KataiDailyShare.share(cv, 'Katai Bill ' + name + ' ' + dateText(), 'Katai Bill · ' + name + ' · ' + dateText());
  }
  function shareSheet() {
    var d = exportData(); if (!d.count) { toast('Pehle kam se kam ek customer ka bill bhariye'); return; }
    var M = function (v) { return v === '' ? '—' : K.money(Math.round(parseFloat(v) * 100)); };
    var B = function (v) { return v === '' ? '—' : K.balanceText(Math.round(parseFloat(v) * 100)); };
    var rows = d.ledRows.map(function (r) { return [r[0], r[1], r[2], M(r[3]), M(r[4]), M(r[5]), M(r[6]), B(r[7])]; });
    var T = d.ledTotal; rows.push(['', 'TOTAL', '', M(T[3]), M(T[4]), M(T[5]), M(T[6]), B(T[7])]);
    var rec = Math.round(parseFloat(T[5]) * 100) + Math.round(parseFloat(T[6]) * 100);
    var cv = window.KataiDailyShare.billCanvas({ heading: heading(), title: 'Katai Daily Entry · ' + d.count + ' customers', date: dateText(),
      cols: [{ h: '#', w: 44 }, { h: 'Customer', w: 240, b: 1 }, { h: 'Items', w: 70, r: 1 }, { h: 'Aaj ka Bill', w: 140, r: 1, b: 1 }, { h: 'Pichla', w: 130, r: 1 }, { h: 'Cash', w: 120, r: 1 }, { h: 'Online', w: 120, r: 1 }, { h: 'Balance', w: 150, r: 1, b: 1 }],
      rows: rows, bold: [rows.length - 1],
      sum: [['Aaj ka Total Bill', M(T[3]), '#7C2D12', 1], ['Pichla Balance', M(T[4])], ['Received', K.money(rec)], ['Total Balance', B(T[7]), '#9A3412', 1]] });
    window.KataiDailyShare.share(cv, 'Katai-Daily-' + stamp(), 'Katai Daily · ' + dateText());
  }

  // ---------- Events ----------
  function bind() {
    $('btnAdd').onclick = addCustomer;
    $('btnClear').onclick = clearAll;
    $('btnExcel').onclick = exportExcel; $('btnCsv').onclick = exportCSV; $('btnPrint').onclick = doPrint; $('btnWa').onclick = shareSheet;
    $('btnRates').onclick = function () { var c = $('ratesCard'); c.hidden = !c.hidden; $('btnRates').setAttribute('aria-expanded', String(!c.hidden)); };
    $('btnFillRates').onclick = fillEmptyRates;
    $('rateGrid').addEventListener('input', onRateEdit);
    $('rateGrid').addEventListener('change', function (e) { if (e.target.tagName === 'SELECT') onRateEdit(e); });
    $('search').addEventListener('input', renderList);
    $('dDate').addEventListener('change', function () { state.date = /^\d{4}-\d{2}-\d{2}$/.test($('dDate').value) ? $('dDate').value : todayISO(); save(); });
    $('dFirm').addEventListener('input', function () { if (storage) try { storage.setItem(FIRM_KEY, $('dFirm').value.slice(0, 80)); } catch (e) {} });
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

  function init() {
    if (!storage) { $('storageNotice').hidden = false; $('saveState').classList.add('off'); $('saveText').textContent = 'Not saved'; }
    if (!load()) state.date = todayISO();
    try { $('dFirm').value = (storage && storage.getItem(FIRM_KEY)) || ''; } catch (e) {}
    $('dDate').value = state.date;
    buildRates(); bind();
    window.KataiDailyShare.init(toast);
    selectedId = state.customers[0] ? state.customers[0].id : null;
    renderAll();
  }
  try { init(); } catch (e) { toast('Something went wrong: ' + e.message); if (window.console) console.error(e); }

  window.__kataiDaily = { state: function () { return state; }, addCustomer: addCustomer, exportData: exportData, productTotals: productTotals, esc: esc };
})();
