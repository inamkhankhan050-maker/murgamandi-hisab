/* ============================================================
   MurgaMandi Hisab · Customer Balance book (window.MMHBal)
   One book per section: Zinda pages use 'zinda', Katai pages 'katai'.
   - Opening balances the owner adds by hand or imports from
     Excel (.xlsx / .csv / sheet .xls) or a text PDF.
       positive = customer ko dena hai (baaki)
       negative = owner ke upar (advance)
   - current(): the customer's latest balance = the newer of the
     opening balance and the last SAVED bill/payment in that section.
     Bills fill "Pichla Balance" from this, and once a bill is saved
     its closing balance becomes the customer's balance in the list.
   Stored in localStorage key mmh.openBal.v1 (included in backups).
   ============================================================ */
(function (root) {
  'use strict';
  var KEY = 'mmh.openBal.v1', PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/';
  var NAMES = { zinda: 'Zinda', katai: 'Katai' };
  function D() { return root.MMHData || null; }
  function U() { return D() && D().util; }
  function norm(s) { return String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function key(s) { return norm(s).toLowerCase(); }
  function today() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function money(p) { var u = U(); return u ? u.balanceText(p) : (p < 0 ? 'Adv ' : '') + '₹' + Math.abs(p / 100); }
  function plain(p) { var a = Math.abs(p), s = String(Math.floor(a / 100)) + (a % 100 ? '.' + String(a % 100 + 100).slice(1) : ''); return (p < 0 ? '-' : '') + s; }

  // ---------- storage ----------
  function read() {
    var o = null; try { o = JSON.parse(root.localStorage.getItem(KEY) || 'null'); } catch (e) { o = null; }
    if (!o || typeof o !== 'object') o = {};
    ['zinda', 'katai'].forEach(function (s) { if (!o[s] || typeof o[s] !== 'object' || Array.isArray(o[s])) o[s] = {}; });
    return o;
  }
  function write(o) { try { root.localStorage.setItem(KEY, JSON.stringify(o)); return true; } catch (e) { return false; } }
  function openings(section) {
    var b = read()[section] || {}, out = [];
    Object.keys(b).forEach(function (k) { var e = b[k]; if (e && norm(e.name) && Number.isSafeInteger(e.paise)) out.push(e); });
    return out;
  }
  function setOpening(section, name, paise, date) {
    name = norm(name).slice(0, 80);
    if (!NAMES[section] || !name || !Number.isSafeInteger(paise) || Math.abs(paise) > 1e13) return false;
    var o = read(); o[section][key(name)] = { name: name, paise: paise, date: /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : today(), at: new Date().toISOString() };
    return write(o);
  }
  function removeOpening(section, name) { var o = read(); delete o[section][key(name)]; return write(o); }
  function getOpening(section, name) { return read()[section][key(name)] || null; }

  // ---------- balance ----------
  function lastTx(section, name, opts) {
    var d = D(); if (!d) return null; opts = opts || {}; var k = key(name);
    var list = d.transactions({ section: section }).filter(function (r) {
      return key(r.customerName) === k && (!opts.onOrBefore || r.date <= opts.onOrBefore) && r.id !== opts.excludeId && (!opts.excludeSourceKey || r.sourceKey !== opts.excludeSourceKey);
    });
    return list[list.length - 1] || null;
  }
  /** {balance, date, from:'record'|'opening', name} or null. */
  function current(section, name, opts) {
    opts = opts || {}; if (!key(name)) return null;
    var tx = lastTx(section, name, opts), op = getOpening(section, name);
    if (op && opts.onOrBefore && op.date > opts.onOrBefore) op = null;
    var useTx = tx && (!op || tx.date > op.date || (tx.date === op.date && String(tx.updatedAt || tx.createdAt || '') >= op.at));
    if (useTx) return { balance: tx.balance, date: tx.date, from: 'record', name: tx.customerName };
    return op ? { balance: op.paise, date: op.date, from: 'opening', name: op.name } : null;
  }
  /** Every customer of the section with their latest balance. */
  function list(section) {
    var names = {}, d = D();
    openings(section).forEach(function (e) { names[key(e.name)] = e.name; });
    if (d) d.transactions({ section: section }).forEach(function (r) { var k = key(r.customerName); if (k) names[k] = r.customerName; });
    return Object.keys(names).map(function (k) { var c = current(section, names[k]); return { name: c ? c.name : names[k], balance: c ? c.balance : 0, date: c ? c.date : '', from: c ? c.from : '', opening: getOpening(section, names[k]) }; })
      .sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
  }
  /** Field text for "Pichla Balance": advance is written with a minus. */
  function fieldText(paise) { return paise === 0 ? '0' : plain(paise); }
  /** Wraps an engine ledger so Pichla Balance may be negative (advance). Balance = Prev + Bill − Cash − Online. */
  function ledger(fn, row, bill) {
    var s = String(row && row.oldBal != null ? row.oldBal : '').trim(), m = /^[-−]\s*(.+)$/.exec(s);
    if (!m) return fn(row, bill);
    var copy = {}; Object.keys(row).forEach(function (k) { copy[k] = row[k]; }); copy.oldBal = m[1];
    var L = fn(copy, bill); if (L.errors && L.errors.oldBal) return L;
    var a = L.oldBal; L.oldBal = -a;
    ['due', 'balance', 'totalDue'].forEach(function (k) { if (typeof L[k] === 'number') L[k] -= 2 * a; });
    return L;
  }

  // ---------- import ----------
  /** "1,200" 1200 ; "-500" / "500 Adv" / "500 Cr" -> negative ; "500 Dr" positive. NaN if not a number. */
  function parseAmount(v, typeHint) {
    var s = String(v == null ? '' : v).replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '').replace(/−/g, '-');
    var neg = false, t = String(typeHint || '').toLowerCase();
    if (/^\((.*)\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    var m = /^(-?)(\d+(?:\.\d{1,2})?)(adv|advance|cr|dr|baaki|baki)?$/i.exec(s);
    if (!m) return NaN;
    if (m[1]) neg = true;
    var suf = (m[3] || '').toLowerCase();
    if (suf === 'adv' || suf === 'advance' || suf === 'cr' || /adv|cr|upar|owner/.test(t)) neg = true;
    var p = m[2].split('.'), n = parseInt(p[0], 10) * 100 + parseInt(((p[1] || '') + '00').slice(0, 2), 10);
    return neg ? -n : n;
  }
  function isNum(v) { return !isNaN(parseAmount(v)); }
  /** matrix (array of rows of cells) -> {rows:[{name,paise}], skipped} */
  function rowsFromMatrix(m) {
    m = (m || []).map(function (r) { return (r || []).map(function (c) { return norm(c); }); }).filter(function (r) { return r.some(function (c) { return c; }); });
    var nameCol = -1, balCol = -1, typeCol = -1, start = 0;
    for (var h = 0; h < Math.min(m.length, 8) && nameCol < 0; h++) {
      m[h].forEach(function (c, i) {
        var t = c.toLowerCase();
        if (nameCol < 0 && /(name|naam|customer|party|grahak)/.test(t)) nameCol = i;
        else if (/(closing|balance|baaki|baki|bal\b|due|amount|rakam)/.test(t)) balCol = i;
        else if (/(type|dr\/cr|cr\/dr|status)/.test(t)) typeCol = i;
      });
      if (nameCol >= 0) start = h + 1;
    }
    var out = [], skipped = 0;
    for (var i = start; i < m.length; i++) {
      var r = m[i], nm = '', amt = NaN, ni = nameCol, bi = balCol;
      if (ni < 0) { for (var j = 0; j < r.length; j++) if (r[j] && !isNum(r[j]) && !/^\d+[.)]?$/.test(r[j])) { ni = j; break; } }
      if (bi < 0) { for (var k = r.length - 1; k >= 0; k--) if (k !== ni && r[k] && isNum(r[k])) { bi = k; break; } }
      nm = ni >= 0 ? (r[ni] || '') : ''; amt = bi >= 0 ? parseAmount(r[bi], typeCol >= 0 ? r[typeCol] : '') : NaN;
      if (bi >= 0 && r[bi + 1] && /^(adv|advance|cr)$/i.test(r[bi + 1]) && amt > 0) amt = -amt;
      if (!nm || isNaN(amt) || /^(total|grand total|kul)\b/i.test(nm)) { skipped++; continue; }
      out.push({ name: nm.slice(0, 80), paise: amt });
    }
    return { rows: out, skipped: skipped };
  }
  function csvToMatrix(text) {
    var rows = [], row = [], cell = '', q = false, sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : text.indexOf('\t') >= 0 && text.split('\n')[0].indexOf(',') < 0 ? '\t' : ',';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true; else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function htmlToMatrix(text) {
    var doc = new root.DOMParser().parseFromString(text, 'text/html');
    return Array.prototype.map.call(doc.querySelectorAll('tr'), function (tr) { return Array.prototype.map.call(tr.querySelectorAll('td,th'), function (c) { return c.textContent; }); });
  }
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 16777216; }
  function unzip(buf) {
    var b = new Uint8Array(buf), e = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 5 && b[i + 3] === 6) { e = i; break; }
    if (e < 0) return Promise.reject(new Error('zip'));
    var n = u16(b, e + 10), p = u32(b, e + 16), files = {};
    for (var k = 0; k < n; k++) {
      var method = u16(b, p + 10), csize = u32(b, p + 20), nl = u16(b, p + 28), xl = u16(b, p + 30), cl = u16(b, p + 32), lo = u32(b, p + 42);
      var name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl));
      var ds = lo + 30 + u16(b, lo + 26) + u16(b, lo + 28);
      files[name] = { method: method, data: b.subarray(ds, ds + csize) };
      p += 46 + nl + xl + cl;
    }
    return Promise.resolve(files);
  }
  function inflate(f) {
    if (f.method === 0) return Promise.resolve(new TextDecoder().decode(f.data));
    if (typeof root.DecompressionStream !== 'function') return Promise.reject(new Error('Is browser mein Excel nahi khul sakta. CSV bhejiye.'));
    var s = new Blob([f.data]).stream().pipeThrough(new root.DecompressionStream('deflate-raw'));
    return new Response(s).text();
  }
  function xlsxToMatrix(buf) {
    return unzip(buf).then(function (files) {
      var sheetName = Object.keys(files).filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); }).sort()[0];
      if (!sheetName) throw new Error('Excel mein sheet nahi mili.');
      return Promise.all([files['xl/sharedStrings.xml'] ? inflate(files['xl/sharedStrings.xml']) : '', inflate(files[sheetName])]);
    }).then(function (x) {
      var P = new root.DOMParser(), ss = [];
      if (x[0]) Array.prototype.forEach.call(P.parseFromString(x[0], 'application/xml').getElementsByTagName('si'), function (si) {
        ss.push(Array.prototype.map.call(si.getElementsByTagName('t'), function (t) { return t.textContent; }).join(''));
      });
      var doc = P.parseFromString(x[1], 'application/xml'), out = [];
      Array.prototype.forEach.call(doc.getElementsByTagName('row'), function (r) {
        var row = [];
        Array.prototype.forEach.call(r.getElementsByTagName('c'), function (c) {
          var ref = c.getAttribute('r') || '', col = 0, L = /^[A-Z]+/.exec(ref);
          if (L) { for (var i = 0; i < L[0].length; i++) col = col * 26 + L[0].charCodeAt(i) - 64; col--; } else col = row.length;
          var t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0], val = '';
          if (t === 's' && v) val = ss[+v.textContent] || '';
          else if (t === 'inlineStr') val = Array.prototype.map.call(c.getElementsByTagName('t'), function (n) { return n.textContent; }).join('');
          else if (v) val = v.textContent;
          if (t !== 's' && t !== 'inlineStr' && t !== 'str' && /^-?\d+\.\d{3,}$/.test(val)) val = String(Math.round(parseFloat(val) * 100) / 100);
          row[col] = val;
        });
        for (var i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = '';
        out.push(row);
      });
      return out;
    });
  }
  function loadPdfJs() {
    if (root.pdfjsLib) return Promise.resolve(root.pdfjsLib);
    return new Promise(function (res, rej) {
      var s = root.document.createElement('script'); s.src = PDFJS + 'pdf.min.js';
      s.onload = function () { if (!root.pdfjsLib) return rej(new Error('PDF reader load nahi hua.')); root.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; res(root.pdfjsLib); };
      s.onerror = function () { rej(new Error('PDF padhne ke liye internet chahiye.')); };
      root.document.head.appendChild(s);
    });
  }
  function pdfToMatrix(buf) {
    return loadPdfJs().then(function (lib) { return lib.getDocument({ data: new Uint8Array(buf) }).promise; }).then(function (pdf) {
      var pages = []; for (var i = 1; i <= Math.min(pdf.numPages, 50); i++) pages.push(pdf.getPage(i).then(function (pg) { return pg.getTextContent(); }));
      return Promise.all(pages);
    }).then(function (contents) {
      var out = [];
      contents.forEach(function (tc) {
        var lines = {};
        tc.items.forEach(function (it) { var s = norm(it.str); if (!s) return; var y = Math.round(it.transform[5] / 3); (lines[y] = lines[y] || []).push({ x: it.transform[4], s: s }); });
        Object.keys(lines).sort(function (a, b) { return b - a; }).forEach(function (y) {
          var cells = lines[y].sort(function (a, b) { return a.x - b.x; }).map(function (c) { return c.s; });
          out.push(cells);
        });
      });
      if (!out.length) throw new Error('Is PDF mein text nahi hai (photo/scan). Excel ya CSV bhejiye.');
      return out;
    });
  }
  /** File -> Promise<{rows, skipped}> */
  function readFile(file) {
    var n = (file.name || '').toLowerCase();
    var asText = function () { return file.text ? file.text() : new Response(file).text(); };
    var asBuf = function () { return file.arrayBuffer ? file.arrayBuffer() : new Response(file).arrayBuffer(); };
    var p;
    if (/\.(csv|txt)$/.test(n)) p = asText().then(csvToMatrix);
    else if (/\.xlsx$/.test(n)) p = asBuf().then(xlsxToMatrix);
    else if (/\.pdf$/.test(n)) p = asBuf().then(pdfToMatrix);
    else if (/\.(xls|html?)$/.test(n)) p = asBuf().then(function (b) {
      var u = new Uint8Array(b);
      if (u[0] === 0x50 && u[1] === 0x4b) return xlsxToMatrix(b);
      var t = new TextDecoder().decode(u);
      if (/<table/i.test(t)) return htmlToMatrix(t);
      throw new Error('Purani .xls file nahi padh sakte. Excel mein "Save As .xlsx ya CSV" karke daaliye.');
    });
    else return Promise.reject(new Error('Sirf Excel (.xlsx/.xls), CSV ya PDF file chuniye.'));
    return p.then(rowsFromMatrix).then(function (r) { if (!r.rows.length) throw new Error('File mein naam aur balance wali koi line nahi mili.'); return r; });
  }

  // ---------- UI ----------
  function el(t, c, txt) { var e = root.document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; }
  /** opts: { section, toast(msg), confirm(title, body, okText, fn), onChange() } */
  function mount(opts) {
    var doc = root.document, sec = opts.section, title = NAMES[sec] + ' Customer Balance';
    var toast = opts.toast || function (m) { root.alert(m); };
    var ask = opts.confirm || function (t, b, ok, fn) { if (root.confirm(t + '\n' + b)) fn(); };
    var fab = el('button', 'bb-fab' + (opts.raise ? ' up' : '')); fab.type = 'button'; fab.setAttribute('aria-label', title);
    fab.innerHTML = '<span class="bb-r">₹</span><span>Balance</span>';
    var ov = el('div', 'bb-ov'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', title);
    var pn = el('div', 'bb-pn'); ov.appendChild(pn);
    var hd = el('div', 'bb-hd'); hd.appendChild(el('h2', null, title)); var x = el('button', 'bb-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); hd.appendChild(x); pn.appendChild(hd);
    pn.appendChild(el('p', 'bb-sub', 'Purana balance yahan daaliye. Naya bill banate hi Pichla Balance khud bhar jayega, aur bill save hone par yahan closing balance aa jayega.'));
    // add form
    var form = el('form', 'bb-form'); form.noValidate = true;
    var fName = el('input'); fName.placeholder = 'Customer ka naam'; fName.maxLength = 80; fName.autocomplete = 'off';
    var fAmt = el('input'); fAmt.placeholder = 'Rakam ₹'; fAmt.inputMode = 'decimal'; fAmt.autocomplete = 'off'; fAmt.maxLength = 15;
    var fType = el('select'); [['due', 'Customer pe baaki'], ['adv', 'Owner ke upar (Advance)']].forEach(function (o) { var op = el('option', null, o[1]); op.value = o[0]; fType.appendChild(op); });
    var fAdd = el('button', 'btn primary', 'Add'); fAdd.type = 'submit';
    [fName, fAmt, fType, fAdd].forEach(function (n) { form.appendChild(n); }); pn.appendChild(form);
    // import
    var imp = el('div', 'bb-imp'); var file = el('input'); file.type = 'file'; file.accept = '.xlsx,.xls,.csv,.pdf,.txt'; file.hidden = true;
    var bImp = el('button', 'btn', 'Excel / PDF se Import'); bImp.type = 'button';
    imp.appendChild(bImp); imp.appendChild(el('small', null, 'File mein customer ka naam aur balance column ho. Advance ko minus (−) ya "Adv"/"Cr" likhiye.')); imp.appendChild(file); pn.appendChild(imp);
    var prev = el('div', 'bb-prev'); prev.hidden = true; pn.appendChild(prev);
    // list
    var sr = el('input', 'bb-q'); sr.type = 'search'; sr.placeholder = 'Customer search…'; pn.appendChild(sr);
    var tot = el('div', 'bb-tot'); pn.appendChild(tot);
    var wrap = el('div', 'bb-list'); pn.appendChild(wrap);
    doc.body.appendChild(fab); doc.body.appendChild(ov);

    function render() {
      var q = key(sr.value), all = list(sec), due = 0, adv = 0;
      all.forEach(function (r) { if (r.balance > 0) due += r.balance; else adv -= r.balance; });
      tot.textContent = all.length + ' customer · Baaki ' + money(due) + ' · Advance ' + money(adv);
      wrap.textContent = '';
      var rows = all.filter(function (r) { return !q || key(r.name).indexOf(q) >= 0; });
      if (!rows.length) { wrap.appendChild(el('p', 'bb-empty', all.length ? 'Koi customer nahi mila.' : 'Abhi koi balance nahi. Upar se add ya import kariye.')); return; }
      var t = el('table'), th = el('tr'); ['Customer', 'Balance', ''].forEach(function (h) { th.appendChild(el('th', null, h)); }); t.appendChild(th);
      rows.forEach(function (r) {
        var tr = el('tr'), nt = el('td', 'bb-n', r.name); nt.appendChild(el('small', 'bb-d', (r.date && U() ? U().dateText(r.date) : r.date) + (r.from === 'opening' ? ' · opening' : ' · last bill')));
        tr.appendChild(nt); tr.appendChild(el('td', 'bb-a' + (r.balance < 0 ? ' adv' : ''), money(r.balance)));
        var td = el('td', 'bb-act'), e = el('button', 'btn bb-sm', 'Edit'); e.type = 'button';
        e.onclick = function () { fName.value = r.name; fAmt.value = plain(Math.abs(r.balance)); fType.value = r.balance < 0 ? 'adv' : 'due'; fAmt.focus(); fAmt.select(); };
        td.appendChild(e);
        if (r.opening) { var d = el('button', 'btn bb-sm danger', 'Hatao'); d.type = 'button'; d.onclick = function () { ask('Opening balance hatayein?', r.name + ' ka opening balance hat jayega. Saved bills nahi hatenge.', 'Hatao', function () { removeOpening(sec, r.name); render(); changed(); }); }; td.appendChild(d); }
        tr.appendChild(td); t.appendChild(tr);
      });
      wrap.appendChild(t);
    }
    function changed() { if (opts.onChange) opts.onChange(); }
    form.onsubmit = function (e) {
      e.preventDefault();
      var n = norm(fName.value), a = parseAmount(fAmt.value);
      if (!n) { toast('Customer ka naam likhiye'); fName.focus(); return; }
      if (isNaN(a) || a < 0) { toast('Rakam sahi likhiye (jaise 1500 ya 1500.50)'); fAmt.focus(); return; }
      var p = fType.value === 'adv' ? -a : a, c = current(sec, n);
      var go = function () { if (!setOpening(sec, n, p)) { toast('Save nahi hua (storage full?)'); return; } fName.value = ''; fAmt.value = ''; fType.value = 'due'; render(); changed(); toast(n + ': ' + money(p) + ' save ho gaya'); fName.focus(); };
      if (c) ask('Balance badlein?', n + ' ka abhi ' + money(c.balance) + ' hai. Naya balance ' + money(p) + ' hoga (aaj se).', 'Badlo', go); else go();
    };
    var pending = null;
    bImp.onclick = function () { file.value = ''; file.click(); };
    file.onchange = function () {
      var f = file.files && file.files[0]; if (!f) return;
      bImp.disabled = true; bImp.textContent = 'Padh raha hai…';
      readFile(f).then(showPreview, function (err) { toast(err && err.message && !/^zip$/.test(err.message) ? err.message : 'File nahi padh paye. Excel ya CSV try kariye.'); })
        .then(function () { bImp.disabled = false; bImp.textContent = 'Excel / PDF se Import'; });
    };
    function showPreview(r) {
      pending = r.rows; prev.hidden = false; prev.textContent = '';
      var seen = {}; pending.forEach(function (x) { seen[key(x.name)] = (seen[key(x.name)] || 0) + 1; });
      prev.appendChild(el('b', null, pending.length + ' customer mile' + (r.skipped ? ' · ' + r.skipped + ' line chhodi (naam/rakam nahi)' : '')));
      var t = el('table'), th = el('tr'); ['Customer', 'Balance', ''].forEach(function (h) { th.appendChild(el('th', null, h)); }); t.appendChild(th);
      pending.slice(0, 200).forEach(function (x) {
        var tr = el('tr'), c = current(sec, x.name);
        tr.appendChild(el('td', null, x.name)); tr.appendChild(el('td', 'bb-a' + (x.paise < 0 ? ' adv' : ''), money(x.paise)));
        tr.appendChild(el('td', 'bb-d', seen[key(x.name)] > 1 ? 'naam 2 baar · aakhri wala' : c ? 'abhi ' + money(c.balance) : 'naya')); t.appendChild(tr);
      });
      prev.appendChild(t);
      if (pending.length > 200) prev.appendChild(el('small', null, '…aur ' + (pending.length - 200)));
      var row = el('div', 'bb-row'), ok = el('button', 'btn primary', 'Import ' + pending.length), no = el('button', 'btn', 'Cancel'); ok.type = no.type = 'button';
      ok.onclick = function () {
        var n = 0; pending.forEach(function (x) { if (setOpening(sec, x.name, x.paise)) n++; });
        pending = null; prev.hidden = true; render(); changed(); toast(n + ' customer ka balance import ho gaya');
      };
      no.onclick = function () { pending = null; prev.hidden = true; };
      row.appendChild(ok); row.appendChild(no); prev.appendChild(row);
    }
    sr.oninput = render;
    function open() { render(); ov.classList.add('show'); doc.body.classList.add('bb-lock'); }
    function close() { ov.classList.remove('show'); doc.body.classList.remove('bb-lock'); }
    fab.onclick = open; x.onclick = close;
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ov.classList.contains('show')) close(); });
    root.addEventListener('storage', function (e) { if ((e.key === KEY || e.key === 'mmh.db.v2') && ov.classList.contains('show')) render(); });
    return { open: open, close: close, render: render };
  }

  root.MMHBal = { KEY: KEY, current: current, list: list, setOpening: setOpening, removeOpening: removeOpening, getOpening: getOpening,
    ledger: ledger, fieldText: fieldText, parseAmount: parseAmount, rowsFromMatrix: rowsFromMatrix, csvToMatrix: csvToMatrix, readFile: readFile, mount: mount };
})(typeof window !== 'undefined' ? window : this);
