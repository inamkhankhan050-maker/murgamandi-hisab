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
  var state = { date: '', sheetNo: 1, rates: {}, customers: [], liveKg: '' };
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
    var s = { date: /^\d{4}-\d{2}-\d{2}$/.test(d && d.date) ? d.date : todayISO(), sheetNo: +(d && d.sheetNo) > 0 ? Math.floor(+d.sheetNo) : 1, rates: {}, customers: [], liveKg: str(d && d.liveKg) };
    K.PRODUCTS.forEach(function (p) { var r = d && d.rates && d.rates[p.id]; if (r && typeof r === 'object') s.rates[p.id] = { unit: K.UNITS[r.unit] ? r.unit : 'kg', rate: str(r.rate) }; });
    ((d && Array.isArray(d.customers)) ? d.customers : []).slice(0, MAX_CUSTOMERS).forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      s.customers.push({ id: typeof c.id === 'string' && /^[\w-]{1,40}$/.test(c.id) ? c.id : uid(), name: str(c.name, 80), lines: cleanLines(c.lines), oldBal: str(c.oldBal), cash: str(c.cash), online: str(c.online), payMode: c.payMode === 'online' ? 'online' : 'cash' });
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
    var oldRate = r.rate;
    r[f] = String(e.target.value).slice(0, 40);
    if (f === 'rate') syncDayRate(box.dataset.id, oldRate, r.rate);
    if (f === 'unit') { state.customers.forEach(function (c) { var l = c.lines[box.dataset.id]; if (l && String(l.qty).trim() === '') l.unit = r.unit; }); buildGrid(); renderProductTotals(); }
    if (f === 'rate') { var v = K.parseScaled(r.rate, 2); e.target.classList.toggle('err', r.rate.trim() !== '' && !(v > 0)); }
    save();
  }
  function syncDayRate(pid, oldRate, newRate) {
    state.customers.forEach(function (c) {
      var l = c.lines[pid] || (c.lines[pid] = { unit: unitOf(pid), qty: '', rate: '' });
      var cur = String(l.rate).trim();
      if (cur === '' || cur === String(oldRate).trim()) l.rate = newRate;
    });
    state.customers.forEach(function (c) { var tr = rowEl(c.id); if (!tr) return; var i = tr.querySelector('[data-p="' + pid + '"][data-f="rate"]'); if (i && document.activeElement !== i) i.value = c.lines[pid].rate; updateRow(c); });
    var hi = $('gHead').querySelector('[data-dr="' + pid + '"]'); if (hi && document.activeElement !== hi) hi.value = newRate;
    var rb = $('rateGrid').querySelector('.rate-box[data-id="' + pid + '"] [data-f="rate"]'); if (rb && document.activeElement !== rb) rb.value = newRate;
    updateFoot(); renderProductTotals();
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
    return { id: uid(), name: '', lines: lines, oldBal: '', cash: '', online: '', payMode: 'cash' };
  }
  function addCustomer() {
    if (state.customers.length >= MAX_CUSTOMERS) { toast('Maximum of ' + MAX_CUSTOMERS + ' customers per sheet'); return; }
    var c = newCustomer(); state.customers.push(c);
    $('search').value = '';
    renderAll(); save(); var ni = $('cBody').querySelector('tr[data-id="' + c.id + '"] .g-name'); if (ni) { ni.focus(); ni.scrollIntoView({ block: 'nearest' }); }
  }
  function deleteCustomer(id) {
    var c = cust(id); if (!c) return;
    var hasRec = !!recIndex[srcKey(id)];
    confirmDlg('Delete this customer?', (c.name.trim() || 'This customer') + ' and all their products will be removed.' + (hasRec ? ' The saved record of this customer is also removed from Statements & Reports.' : ''), 'Delete', function () {
      if (hasRec && D) { D.deleteBySourceKey(srcKey(id)); refreshIndex(); }
      state.customers = state.customers.filter(function (x) { return x.id !== id; });
      renderAll(); save(); toast('Customer deleted');
    });
  }
  function clearAll() {
    var st = recordStats(), warn = st.unsaved + st.changed;
    confirmDlg('Start a new day?', 'All customers on this sheet will be removed. Records already saved stay in Statements & Reports. The current sheet is kept as a backup you can restore once.' + (warn ? ' ' + warn + ' customer(s) are not saved to records yet.' : ''), 'Clear All', function () {
      if (storage) try { storage.setItem(PREV_KEY, JSON.stringify(state)); } catch (e) {}
      state = { date: todayISO(), sheetNo: state.sheetNo + 1, rates: state.rates, customers: [], liveKg: '' }; $('liveKg').value = '';
      $('search').value = ''; $('dDate').value = state.date;
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

  // ---------- Render: customer grid ----------
  function rowEl(id) { return $('cBody').querySelector('tr[data-id="' + id + '"]'); }
  function unitOf(pid) { var r = state.rates[pid]; return r && r.unit === 'pcs' ? 'pcs' : 'kg'; }
  function inp(cls, f, val, label, pid) {
    var i = el('input', cls); i.dataset.f = f; if (pid) i.dataset.p = pid; i.value = val == null ? '' : val; i.autocomplete = 'off'; i.setAttribute('aria-label', label);
    if (/(^| )n( |$)/.test(cls)) i.inputMode = 'decimal'; return i;
  }
  function buildHead() {
    var h = $('gHead'); h.textContent = '';
    var r1 = el('tr'), r2 = el('tr', 'g-rate');
    r1.appendChild(el('th', 'g-nm', '# Customer')); r2.appendChild(el('th', 'g-nm g-rl', 'Aaj ka Rate →'));
    K.PRODUCTS.forEach(function (p) {
      var th = el('th', 'g-it'); th.appendChild(el('span', null, p.name)); r1.appendChild(th);
      var t2 = el('th', 'g-it'), ri = inp('n g-dr', 'dayRate', (state.rates[p.id] || {}).rate || '', p.name + ' aaj ka rate'); ri.dataset.dr = p.id; ri.placeholder = 'rate'; t2.appendChild(ri); r2.appendChild(t2);
    });
    ['Pichla Balance', 'Aaj ka Payment', 'Final Debit / Credit', ''].forEach(function (t, i) { r1.appendChild(el('th', i === 3 ? 'g-act' : 'g-x', t)); r2.appendChild(el('th', i === 3 ? 'g-act' : 'g-x', '')); });
    h.appendChild(r1); h.appendChild(r2);
  }
  function buildRow(c, i) {
    var tr = el('tr'); tr.dataset.id = c.id;
    var nm = el('td', 'g-nm'), ni = inp('g-name', 'name', c.name, 'Customer ' + (i + 1) + ' name'); ni.placeholder = 'Customer naam'; ni.maxLength = 80; var sn = el('span', 'g-sn', String(i + 1)); var nw = el('div', 'g-nmw'); nw.appendChild(sn); nw.appendChild(ni); nm.appendChild(nw);
    nm.appendChild(el('span', 'rec-chip')); tr.appendChild(nm);
    K.PRODUCTS.forEach(function (p) {
      var l = c.lines[p.id] || (c.lines[p.id] = { unit: unitOf(p.id), qty: '', rate: '' });
      var td = el('td', 'g-it'); td.dataset.l = p.name; var q = inp('n g-q', 'qty', l.qty, p.name + ' ' + (l.unit === 'pcs' ? 'pcs' : 'kg'), p.id), r = inp('n g-r', 'rate', l.rate, p.name + ' rate', p.id);
      q.placeholder = l.unit === 'pcs' ? 'pcs' : 'kg'; r.placeholder = 'rate';
      td.appendChild(q); td.appendChild(r); var a = el('span', 'g-amt'); a.dataset.o = p.id; td.appendChild(a); tr.appendChild(td);
    });
    var ob = el('td', 'g-x'); ob.dataset.l = 'Pichla Balance'; var oi = inp('n g-old', 'oldBal', c.oldBal, 'Pichla balance'); oi.placeholder = '0'; ob.appendChild(oi); ob.appendChild(el('span', 'g-sub g-oldt')); tr.appendChild(ob);
    var pt = el('td', 'g-x g-pay'); pt.dataset.l = 'Aaj ka Payment'; var sel = el('select'); sel.dataset.f = 'payMode'; sel.setAttribute('aria-label', 'Cash ya Online');
    [['cash', 'Cash'], ['online', 'Online']].forEach(function (o) { var op = el('option', null, o[1]); op.value = o[0]; sel.appendChild(op); });
    sel.value = c.payMode === 'online' ? 'online' : 'cash';
    var pa = inp('n g-pa', 'payAmt', sel.value === 'online' ? c.online : c.cash, 'Payment amount'); pa.placeholder = '₹ 0';
    pt.appendChild(sel); pt.appendChild(pa); pt.appendChild(el('span', 'g-sub g-other')); tr.appendChild(pt);
    var fin = el('td', 'g-x g-fin'); fin.dataset.o = 'fin'; fin.dataset.l = 'Final Debit / Credit'; tr.appendChild(fin);
    var act = el('td', 'g-act');
    var wa = el('button', 'btn wa g-wa'); wa.type = 'button'; wa.dataset.act = 'wa'; wa.title = 'WhatsApp bill';
    var img = el('img'); img.src = '../../assets/icons/whatsapp.svg'; img.alt = ''; img.width = 16; img.height = 16; wa.appendChild(img); wa.setAttribute('aria-label', 'WhatsApp bill');
    var del = el('button', 'ic del'); del.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>'; del.type = 'button'; del.dataset.act = 'del'; del.title = 'Delete'; del.setAttribute('aria-label', 'Delete customer');
    act.appendChild(wa); act.appendChild(del); tr.appendChild(act);
    return tr;
  }
  function updateRow(c) {
    var tr = rowEl(c.id); if (!tr) return;
    var r = calc(c), q = $('search').value.trim().toLowerCase();
    tr.hidden = !!q && c.name.toLowerCase().indexOf(q) < 0;
    K.PRODUCTS.forEach(function (p) {
      var l = r.bill.lines[p.id], a = tr.querySelector('[data-o="' + p.id + '"]');
      a.textContent = l.status === 'valid' ? K.money(l.amount) : l.status === 'incomplete' ? 'kg + rate' : l.status === 'invalid' ? 'Check' : '';
      a.className = 'g-amt' + (l.status === 'invalid' || l.status === 'incomplete' ? ' bad' : '');
      tr.querySelector('[data-p="' + p.id + '"][data-f="qty"]').classList.toggle('err', !!l.errors.qty);
      tr.querySelector('[data-p="' + p.id + '"][data-f="rate"]').classList.toggle('err', !!l.errors.rate);
      a.parentNode.classList.toggle('on', l.status === 'valid');
    });
    tr.querySelector('.g-old').classList.toggle('err', !!r.L.errors.oldBal);
    tr.querySelector('.g-pa').classList.toggle('err', !!(r.L.errors.cash || r.L.errors.online));
    tr.querySelector('.g-oldt').textContent = r.L.ok && r.L.oldBal ? (r.L.oldBal < 0 ? 'Credit (advance)' : 'Debit (baaki)') : '';
    var other = c.payMode === 'online' ? r.L.cash : r.L.online;
    tr.querySelector('.g-other').textContent = r.L.ok && other ? '+ ' + (c.payMode === 'online' ? 'Cash ' : 'Online ') + K.money(other) : '';
    var fin = tr.querySelector('[data-o="fin"]'); fin.textContent = '';
    if (r.L.ok) {
      var b = r.L.balance; fin.appendChild(el('b', b < 0 ? 'cr' : b > 0 ? 'dr' : '', K.money(Math.abs(b))));
      fin.appendChild(el('span', 'g-tag ' + (b > 0 ? 'dr' : b < 0 ? 'cr' : ''), b > 0 ? 'DEBIT · lena' : b < 0 ? 'CREDIT · dena' : 'Barabar'));
      fin.appendChild(el('span', 'g-sub', 'Bill ' + K.money(r.bill.total)));
    } else fin.appendChild(el('span', 'g-sub bad', 'Check'));
    var chip = tr.querySelector('.rec-chip'), rs = rowRecState(c);
    chip.className = 'rec-chip' + (rs === 'saved' ? ' ok' : rs === 'changed' ? ' chg' : '');
    chip.textContent = rs === 'saved' ? 'Saved' : rs === 'changed' ? 'Changed' : rs === 'unsaved' ? 'Not saved' : '';
    chip.hidden = !chip.textContent;
  }
  function buildGrid() {
    buildHead();
    var body = $('cBody'); body.textContent = '';
    state.customers.forEach(function (c, i) { body.appendChild(buildRow(c, i)); });
    state.customers.forEach(updateRow);
    $('cEmpty').hidden = state.customers.length > 0;
    updateFoot();
  }
  function totals() {
    var tot = { items: 0, bill: 0, old: 0, rec: 0, cash: 0, online: 0, bal: 0, n: 0 };
    state.customers.forEach(function (c) {
      var r = calc(c);
      tot.items += r.bill.items; tot.bill += r.bill.total; tot.n += (r.bill.items || r.L.any) ? 1 : 0;
      if (r.L.ok) { tot.old += r.L.oldBal; tot.rec += r.L.received; tot.cash += r.L.cash; tot.online += r.L.online; tot.bal += r.L.balance; }
    });
    return tot;
  }
  function shortBal(v) { return K.money(Math.abs(v)) + (v > 0 ? ' Debit' : v < 0 ? ' Credit' : ''); }
  function avgRate(x) { return x.qty ? Math.round(x.amt * 1000 / x.qty) : null; }
  function updateFoot() {
    var tot = totals(), pt = productTotals(), f = $('gFoot'); f.textContent = '';
    var dc = { oDr: 0, oCr: 0, bDr: 0, bCr: 0 };
    state.customers.forEach(function (c) { var r = calc(c); if (!r.L.ok) return; if (r.L.oldBal > 0) dc.oDr += r.L.oldBal; else dc.oCr -= r.L.oldBal; if (r.L.balance > 0) dc.bDr += r.L.balance; else dc.bCr -= r.L.balance; });
    var rows = [['Total KG', function (x) { return x.qty ? K.qtyText(x.qty, x.unit) : '—'; }], ['Total ₹', function (x) { return x.amt ? K.money(x.amt) : '—'; }], ['Avg Rate', function (x) { var a = avgRate(x); return a ? K.money(a) : '—'; }]];
    rows.forEach(function (rw, ri) {
      var tr = el('tr', 'g-ft g-ft' + ri); tr.appendChild(el('td', 'g-nm', rw[0]));
      K.PRODUCTS.forEach(function (p) { var fc = el('td', 'g-it ra', rw[1](pt[p.id])); fc.dataset.l = p.name; tr.appendChild(fc); });
      var cellL = function (lab, val, cls) { var td = el('td', 'g-x ra g-fx ' + (cls || '')); td.appendChild(el('small', null, lab)); td.appendChild(el('b', null, val)); tr.appendChild(td); };
      if (ri === 0) { cellL('Debit', K.money(dc.oDr), 'dr'); cellL('Cash', K.money(tot.cash)); cellL('Debit (lena)', K.money(dc.bDr), 'dr'); }
      else if (ri === 1) { cellL('Credit', K.money(dc.oCr), 'cr'); cellL('Online', K.money(tot.online)); cellL('Credit (dena)', K.money(dc.bCr), 'cr'); }
      else { cellL('Net', shortBal(tot.old)); cellL('Total Jama', K.money(tot.rec)); cellL('Net · Bill ' + K.money(tot.bill), shortBal(tot.bal)); }
      tr.appendChild(el('td', 'g-act')); f.appendChild(tr);
    });
    var live = liveKg(), kgSum = 0, pr = el('tr', 'g-ft g-ft3');
    pr.appendChild(el('td', 'g-nm', 'Percentage'));
    K.PRODUCTS.forEach(function (p) { var x = pt[p.id]; kgSum += x.kg; var pc = el('td', 'g-it ra g-pc', x.kg && live ? pct(x.kg, live) : '—'); pc.dataset.l = p.name; pr.appendChild(pc); });
    var cellP = function (lab, val) { var td = el('td', 'g-x ra g-fx'); td.appendChild(el('small', null, lab)); td.appendChild(el('b', null, val)); pr.appendChild(td); };
    cellP('Zinda murga', live ? K.qtyText(live, 'kg') : 'kg likhiye ↑'); cellP('Total katai', K.qtyText(kgSum, 'kg')); cellP('Total percentage', kgSum && live ? pct(kgSum, live) : '—');
    pr.appendChild(el('td', 'g-act')); f.appendChild(pr);
    $('tCust').textContent = String(tot.n); $('tRec').textContent = K.money(tot.rec); $('tRecSplit').textContent = 'Cash ' + K.money(tot.cash) + ' · Online ' + K.money(tot.online);
    $('tBal').textContent = balT(tot.bal); $('tBill').textContent = K.money(tot.bill); $('tWords').textContent = K.amountInWords(tot.bill);
    $('sheetNo').textContent = '#' + state.sheetNo;
    updateRecMeta();
    return tot;
  }
  function renderList() { state.customers.forEach(updateRow); return updateFoot(); }
  function renderAll() { buildGrid(); renderProductTotals(); }

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

  // ---------- Render: product-wise totals + yield ----------
  function productTotals() {
    var t = {}; K.PRODUCTS.forEach(function (p) { t[p.id] = { qty: 0, kg: 0, pcs: 0, amt: 0, unit: unitOf(p.id) }; });
    state.customers.forEach(function (c) {
      var b = K.computeBill(c.lines);
      K.PRODUCTS.forEach(function (p) {
        var l = b.lines[p.id], x = t[p.id]; if (l.status !== 'valid') return;
        if (l.unit === 'pcs') x.pcs += l.qty; else x.kg += l.qty; x.amt += l.amount;
      });
    });
    K.PRODUCTS.forEach(function (p) { var x = t[p.id]; if (x.kg && !x.pcs) x.unit = 'kg'; else if (x.pcs && !x.kg) x.unit = 'pcs'; x.qty = x.unit === 'pcs' ? x.pcs : x.kg; });
    return t;
  }
  function liveKg() { var v = K.parseScaled(state.liveKg, 3); return v > 0 ? v : null; }
  function pct(part, whole) { if (!whole) return '—'; return (Math.round(part * 10000 / whole) / 100).toFixed(2) + '%'; }
  function ratio(part, whole) { if (!whole) return '—'; return (part / whole).toFixed(3); }
  function renderProductTotals() {
    $('liveKg').classList.toggle('err', String(state.liveKg).trim() !== '' && !liveKg());
    updateFoot();
  }


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
  function custModel(c) {
    var B = window.MMHBill, n = B.num, r = calc(c), bill = r.bill, L = r.L, led = L.any && L.ok;
    var firm = B.getFirm ? B.getFirm() : null;
    var m = { firm: firm, date: state.date || todayISO(), name: c.name.trim() || 'Customer', rows: [], minRows: 6, total: {}, extras: [], grand: { label: 'G. TOTAL', value: '' }, words: '', fallbackTitle: heading() };
    var pcs = 0, kg = 0, anyPcs = false, anyKg = false;
    K.PRODUCTS.forEach(function (p) {
      var l = bill.lines[p.id]; if (!l || l.status !== 'valid') return;
      var q = K.plainQty(l.qty);
      if (l.unit === 'pcs') { pcs += l.qty; anyPcs = true; } else { kg += l.qty; anyKg = true; }
      m.rows.push({ qty: l.unit === 'pcs' ? q : '', weight: l.unit === 'pcs' ? '' : q, part: p.name, rate: n(l.ratePaise), amount: n(l.amount) });
    });
    m.total = { qty: anyPcs ? K.plainQty(pcs) : '', weight: anyKg ? K.plainQty(kg) : '', amount: n(bill.total) };
    m.extras.push({ label: led && L.oldBal < 0 ? 'Pichla Credit (Advance)' : 'Pichla Debit (Baaki)', value: led && L.oldBal ? n(Math.abs(L.oldBal)) : '—' });
    m.extras.push({ label: 'Received' + (L.cash && L.online ? ' (Cash + Online)' : L.online ? ' (Online)' : L.cash ? ' (Cash)' : ''), value: led && L.received ? n(L.received) : '—' });
    var g = led ? L.balance : bill.total;
    if (led) { m.grand.label = g < 0 ? 'CREDIT (Aapka advance)' : 'DEBIT (Aapko dena hai)'; m.grand.value = n(Math.abs(g)); m.words = K.amountInWords(Math.abs(g)) + (g < 0 ? ' (Credit - aapka advance jama hai)' : ' (Debit - aapko dena hai)'); }
    else { m.grand.value = n(g); m.words = K.amountInWords(Math.max(g, 0)); }
    return m;
  }
  function shareCustomer(id) {
    var c = cust(id); if (!c) return;
    var r = calc(c); if (!r.bill.items && !r.L.any) { toast('Is customer ka koi item nahi bhara'); return; }
    if (r.bill.invalid || r.bill.incomplete || !r.L.ok) { toast('Is customer mein galti hai (kg ya rate). Pehle theek kijiye.'); return; }
    if (!c.name.trim()) { toast('Pehle customer ka naam likhiye'); return; }
    var name = c.name.trim();
    if (window.MMHBill) {
      window.MMHBill.render(custModel(c), function (cv) { if (!cv) { toast('Bill photo nahi ban payi'); return; } window.KataiShare.share(cv, name + ' ' + dateText(), name + ' · ' + dateText()); });
      return;
    }
    var rows = [], n = 0;
    K.PRODUCTS.forEach(function (p) { var l = r.bill.lines[p.id]; if (l.status === 'valid') rows.push([++n, p.name, K.qtyText(l.qty, l.unit), K.money(l.ratePaise), K.money(l.amount)]); });
    var cv = window.KataiShare.billCanvas({ heading: heading(), title: 'Katai Bill', customer: name, date: dateText(),
      cols: [{ h: '#', w: 50 }, { h: 'Product', w: 260, b: 1 }, { h: 'Qty', w: 170, r: 1 }, { h: 'Rate', w: 150, r: 1 }, { h: 'Amount', w: 190, r: 1, b: 1 }], rows: rows, sum: [['Remaining Balance', balT(r.L.balance), '#B45309', 1]] });
    window.KataiShare.share(cv, name + ' ' + dateText(), name + ' · ' + dateText());
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
    $('btnAdd').onclick = addCustomer; $('btnAdd2').onclick = addCustomer;
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
    function rowCust(t) { var tr = t.closest && t.closest('#cBody tr[data-id]'); return tr ? cust(tr.dataset.id) : null; }
    function after(c) { updateRow(c); updateFoot(); renderProductTotals(); save(); }
    $('cBody').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return; var c = rowCust(b); if (!c) return;
      if (b.dataset.act === 'del') deleteCustomer(c.id); else if (b.dataset.act === 'wa') shareCustomer(c.id);
    });
    $('cBody').addEventListener('input', function (e) {
      var t = e.target, f = t.dataset.f, c = rowCust(t); if (!c || !f) return;
      var v = String(t.value).slice(0, f === 'name' ? 80 : 40);
      if (t.dataset.p) { var l = c.lines[t.dataset.p] || (c.lines[t.dataset.p] = { unit: unitOf(t.dataset.p), qty: '', rate: '' }); l[f] = v; }
      else if (f === 'payAmt') { if (c.payMode === 'online') c.online = v; else c.cash = v; }
      else if (f === 'name' || f === 'oldBal') c[f] = v;
      else return;
      after(c);
    });
    $('cBody').addEventListener('change', function (e) {
      var t = e.target, c = rowCust(t); if (!c) return;
      if (t.dataset.f === 'payMode') {
        var amt = c.payMode === 'online' ? c.online : c.cash;
        if (c.payMode === 'online') c.online = ''; else c.cash = '';
        c.payMode = t.value === 'online' ? 'online' : 'cash';
        if (c.payMode === 'online') c.online = amt; else c.cash = amt;
        after(c); return;
      }
      if (t.dataset.f === 'name') autoPichla(c, t);
    });
    $('cBody').addEventListener('focusin', function (e) { var c = rowCust(e.target); if (c && e.target.dataset.f === 'name') prevNames[c.id] = e.target.value.trim(); });
    $('cBody').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return; e.preventDefault();
      var tr = e.target.closest('tr'), nx = tr && tr.nextElementSibling, f = e.target.dataset.f, p = e.target.dataset.p;
      var sel = p ? '[data-p="' + p + '"][data-f="' + f + '"]' : '[data-f="' + f + '"]';
      var i = nx && nx.querySelector(sel);
      if (i) { i.focus(); i.select(); } else if (f === 'name' || !nx) { var n2 = e.target.closest('td').nextElementSibling, j = n2 && n2.querySelector('input'); if (j) { j.focus(); j.select(); } }
    });
    function autoPichla(c, inpEl) {
      var BB = window.MMHBal; if (!BB) return;
      var tr = rowEl(c.id), oi = tr && tr.querySelector('.g-old');
      var cur = String(c.oldBal).trim(), pn = prevNames[c.id] || '', o0 = { onOrBefore: state.date || todayISO(), excludeSourceKey: srcKey(c.id) };
      var mine = cur === '' || autoMap[c.id] === cur || (!!pn && pn !== c.name.trim() && BB.isBalanceOf('katai', pn, cur, o0)); prevNames[c.id] = c.name.trim(); if (!mine) return;
      var lb = c.name.trim() ? BB.current('katai', c.name, o0) : null;
      if (!lb) { if (cur === '') return; c.oldBal = ''; delete autoMap[c.id]; if (oi) oi.value = ''; after(c); return; }
      if (cur === BB.fieldText(lb.balance)) return;
      c.oldBal = autoMap[c.id] = BB.fieldText(lb.balance); if (oi) oi.value = c.oldBal; after(c);
      toast(c.name.trim() + ': pichla balance ' + (U ? U.balanceText(lb.balance) : c.oldBal) + ' bhar diya');
    }
    $('gHead').addEventListener('input', function (e) {
      var t = e.target, pid = t.dataset.dr; if (!pid) return;
      var r = state.rates[pid] || (state.rates[pid] = { unit: unitOf(pid), rate: '' }), old = r.rate;
      r.rate = String(t.value).slice(0, 40); var v = K.parseScaled(r.rate, 2); t.classList.toggle('err', r.rate.trim() !== '' && !(v > 0));
      syncDayRate(pid, old, r.rate); save();
    });
    $('liveKg').addEventListener('input', function () { state.liveKg = String($('liveKg').value).slice(0, 40); renderProductTotals(); save(); });
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
    if (state.date < todayISO() && !state.customers.some(function (c) { return String(c.name || '').trim(); })) state.date = todayISO(); // auto date on empty sheet
    try { $('dFirm').value = (storage && storage.getItem(FIRM_KEY)) || ''; } catch (e) {}
    $('dDate').value = state.date; $('liveKg').value = state.liveKg;
    buildRates(); bind();
    window.KataiShare.init(toast);
    if (window.MMHBal) { window.MMHBal.picker('katai', document, '.g-name'); window.MMHBal.mount({ section: 'katai', raise: true, toast: toast, confirm: confirmDlg }); }
    var got = takeInbox();
    refreshIndex();
    renderAll();
    if (D && D.status().corrupt) { $('storageNotice').hidden = false; $('storageNotice').textContent = D.status().message; }
    window.addEventListener('storage', function (e) { if (e.key === 'mmh.db.v2') { refreshIndex(); renderList(); } });
    if (got) { $('inbox').textContent = got + ' bill' + (got === 1 ? '' : 's') + ' added from Katai Single Customer Bill.'; $('inbox').classList.add('show'); save(); }
  }
  try { init(); } catch (e) { toast('Something went wrong: ' + e.message); if (window.console) console.error(e); }

  window.__kataiDaily = { state: function () { return state; }, addCustomer: addCustomer, exportData: exportData, productTotals: productTotals, esc: esc, saveToRecords: saveToRecords, recordStats: recordStats };
})();
