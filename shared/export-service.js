/* ============================================================
   MurgaMandi Hisab · shared export service
   Turns one report model into PDF, Excel (.xlsx), CSV or a print.
   No libraries: the .xlsx is a hand-written zip (stored, CRC-32)
   of SpreadsheetML parts; the PDF is hand-written (text with the
   standard Helvetica fonts, or page images when names use a script
   Helvetica cannot show, such as Hindi).

   Report model:
   { title, subtitle?, period?, meta?: [[label, text]],
     summary?: [[label, value, type?]]          type: text|money|balance|int
     tables: [{ name, heading?, columns: [{h, type?, w?}], rows: [[...]], total?: [...] }],
     notes?: [text], filename }
   Column / value types: text | money (integer paise) | balance (paise,
   negative = advance) | int | qty (plain decimal text) | date (YYYY-MM-DD)
   ============================================================ */
(function (root) {
  'use strict';

  var BRAND = 'MurgaMandi Hisab';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ---------- value formatting ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function group(s) { return s.length <= 3 ? s : s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + s.slice(-3); }
  function money(p) { if (p === null || p === undefined || p === '' || isNaN(p)) return ''; var neg = p < 0; p = Math.abs(p); return (neg ? '−' : '') + '₹' + group(String(Math.floor(p / 100))) + '.' + pad(p % 100); }
  function balance(p) { if (p === null || p === undefined || p === '' || isNaN(p)) return ''; return p < 0 ? 'Adv ' + money(-p) : money(p); }
  function plain(p) { var neg = p < 0; p = Math.abs(p); return (neg ? '-' : '') + Math.floor(p / 100) + '.' + pad(p % 100); }
  function dateText(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? +m[3] + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1] : String(iso || ''); }
  function display(v, type) {
    if (v === null || v === undefined || v === '') return '';
    if (type === 'money') return money(v);
    if (type === 'balance') return balance(v);
    if (type === 'int') return group(String(v));
    if (type === 'date') return dateText(v);
    return String(v);
  }
  function isNum(type) { return type === 'money' || type === 'balance' || type === 'int' || type === 'qty'; }
  function stamp() { var d = new Date(); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function safeName(s) { return String(s || 'report').toLowerCase().replace(/[^a-z0-9\u0900-\u097F]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'report'; }

  // ---------- bytes ----------
  function utf8(str) {
    var out = [], i, c;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) { var d = str.charCodeAt(i + 1); if (d >= 0xDC00 && d <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++; } }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }
  function latin(str) { var b = new Uint8Array(str.length); for (var i = 0; i < str.length; i++) b[i] = str.charCodeAt(i) & 255; return b; }
  function concat(parts) {
    var len = 0; parts.forEach(function (p) { len += p.length; });
    var out = new Uint8Array(len), o = 0; parts.forEach(function (p) { out.set(p, o); o += p.length; }); return out;
  }
  var CRC_T = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  /** Minimal zip writer, stored entries (no compression). files: [{name, data:Uint8Array}] */
  function zip(files) {
    var local = [], central = [], offset = 0, d = new Date();
    var dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2));
    var dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    function u16(v) { return [v & 255, (v >>> 8) & 255]; }
    function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    files.forEach(function (f) {
      var name = utf8(f.name), crc = crc32(f.data), size = f.data.length;
      var head = new Uint8Array([].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate), u32(crc), u32(size), u32(size), u16(name.length), u16(0)));
      local.push(head, name, f.data);
      central.push(new Uint8Array([].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate), u32(crc), u32(size), u32(size), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset))), name);
      offset += head.length + name.length + size;
    });
    var cd = concat(central);
    var end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(offset), u16(0)));
    return concat(local.concat([cd, end]));
  }

  // ---------- XLSX ----------
  function xmlEsc(s) { return String(s).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
  function colName(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function excelDate(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); if (!m) return null; return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000); }
  // style ids (cellXfs order below)
  var X = { def: 0, head: 1, money: 2, date: 3, title: 4, bold: 5, boldMoney: 6, int: 7, qty: 8, note: 9, label: 10, sub: 11, boldInt: 12 };
  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="dd\\-mmm\\-yyyy"/><numFmt numFmtId="166" formatCode="0.###"/></numFmts>' +
    '<fonts count="6"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="15"/><color rgb="FF1D4ED8"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '<font><i/><sz val="10"/><color rgb="FF475569"/><name val="Calibri"/></font><font><sz val="11"/><color rgb="FF475569"/><name val="Calibri"/></font></fonts>' +
    '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF1D4ED8"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFEAF2FF"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF1D4ED8"/></top><bottom style="thin"><color rgb="FF1D4ED8"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="13">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="1" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function xlsx(report) {
    var strings = [], sIndex = {};
    function si(s) { s = String(s); if (!(s in sIndex)) { sIndex[s] = strings.length; strings.push(s); } return sIndex[s]; }
    function cell(ref, v, type, style) {
      if (v === null || v === undefined || v === '') return style ? '<c r="' + ref + '" s="' + style + '"/>' : '';
      if (type === 'money' || type === 'balance') return '<c r="' + ref + '" s="' + (style || X.money) + '"><v>' + plain(v) + '</v></c>';
      if (type === 'int') return '<c r="' + ref + '" s="' + (style || X.int) + '"><v>' + (+v) + '</v></c>';
      if (type === 'qty' && /^-?\d+(\.\d+)?$/.test(String(v))) return '<c r="' + ref + '" s="' + (style || X.qty) + '"><v>' + String(v) + '</v></c>';
      if (type === 'date' && excelDate(v) !== null) return '<c r="' + ref + '" s="' + (style || X.date) + '"><v>' + excelDate(v) + '</v></c>';
      return '<c r="' + ref + '" t="s" s="' + (style || X.def) + '"><v>' + si(v) + '</v></c>';
    }
    var sheets = [], used = {}, tabs = report.tables && report.tables.length ? report.tables : [{ name: 'Report', columns: [{ h: '' }], rows: [] }];
    tabs.forEach(function (t, ti) {
      var rows = [], r = 0, ncol = Math.max(2, t.columns.length);
      var push = function (cells) { r++; rows.push('<row r="' + r + '">' + cells.map(function (c, i) { return c ? cell(colName(i) + r, c[0], c[1], c[2]) : ''; }).join('') + '</row>'); };
      var blank = function () { r++; };
      push([[BRAND + ' · ' + report.title, 'text', X.title]]);
      if (report.subtitle) push([[report.subtitle, 'text', X.sub]]);
      if (report.period) push([['Period', 'text', X.label], [report.period, 'text']]);
      push([['Generated', 'text', X.label], [stamp(), 'text']]);
      if (ti === 0) {
        (report.meta || []).forEach(function (m) { push([[m[0], 'text', X.label], [m[1], 'text']]); });
        if (report.summary && report.summary.length) { blank(); push([['Summary', 'text', X.label]]); report.summary.forEach(function (s) { push([[s[0], 'text'], [s[1], s[2] || 'text', s[2] === 'money' || s[2] === 'balance' ? X.boldMoney : X.bold]]); }); }
      }
      blank();
      if (t.heading) push([[t.heading, 'text', X.label]]);
      push(t.columns.map(function (c) { return [c.h, 'text', X.head]; }));
      t.rows.forEach(function (row) { push(t.columns.map(function (c, i) { return [row[i], c.type || 'text']; })); });
      if (t.total) push(t.columns.map(function (c, i) { var v = t.total[i]; var ty = c.type || 'text'; return [v === undefined ? '' : v, ty, (ty === 'money' || ty === 'balance') ? X.boldMoney : ty === 'int' ? X.boldInt : X.bold]; }));
      if (!t.rows.length) push([['No records for this selection.', 'text', X.note]]);
      if (ti === tabs.length - 1 && report.notes) { blank(); report.notes.forEach(function (n) { push([[n, 'text', X.note]]); }); }
      var cols = '<cols>' + t.columns.map(function (c, i) {
        var w = c.type === 'date' ? 13 : isNum(c.type) ? 15 : Math.min(40, Math.max(12, String(c.h).length + 4, (c.w || 1) * 12));
        if (i === 0) w = Math.max(w, 14);
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
      }).join('') + (ncol > t.columns.length ? '<col min="2" max="2" width="20" customWidth="1"/>' : '') + '</cols>';
      var name = String(t.name || ('Sheet' + (ti + 1))).replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 28) || 'Sheet';
      var base = name, k = 2; while (used[name.toLowerCase()]) name = base.slice(0, 25) + ' ' + (k++); used[name.toLowerCase()] = 1;
      sheets.push({ name: name, xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' + cols + '<sheetData>' + rows.join('') + '</sheetData></worksheet>' });
    });
    var ss = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + strings.length + '" uniqueCount="' + strings.length + '">' +
      strings.map(function (s) { return '<si><t xml:space="preserve">' + xmlEsc(s) + '</t></si>'; }).join('') + '</sst>';
    var files = [
      { name: '[Content_Types].xml', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>') },
      { name: '_rels/.rels', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>') },
      { name: 'docProps/core.xml', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + xmlEsc(BRAND + ' · ' + report.title) + '</dc:title><dc:creator>' + BRAND + '</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</dcterms:created></cp:coreProperties>') },
      { name: 'xl/workbook.xml', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        sheets.map(function (s, i) { return '<sheet name="' + xmlEsc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>') },
      { name: 'xl/_rels/workbook.xml.rels', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
        '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId' + (sheets.length + 2) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>') },
      { name: 'xl/styles.xml', data: utf8(STYLES) },
      { name: 'xl/sharedStrings.xml', data: utf8(ss) }
    ];
    sheets.forEach(function (s, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: utf8(s.xml) }); });
    return zip(files);
  }

  // ---------- CSV ----------
  function csvCell(v, type) {
    if (v === null || v === undefined) v = '';
    if (type === 'money' || type === 'balance') v = v === '' ? '' : plain(v);
    v = String(v);
    if (!isNum(type) && type !== 'date' && /^[=+\-@\t\r]/.test(v)) v = "'" + v;  // spreadsheet formula-injection guard
    return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function csv(report) {
    var L = [], line = function (cells) { L.push(cells.map(function (c) { return csvCell(c[0], c[1]); }).join(',')); };
    line([[BRAND + ' - ' + report.title]]);
    if (report.subtitle) line([[report.subtitle]]);
    if (report.period) line([['Period'], [report.period]]);
    line([['Generated'], [stamp()]]);
    (report.meta || []).forEach(function (m) { line([[m[0]], [m[1]]]); });
    if (report.summary && report.summary.length) { L.push(''); line([['Summary']]); report.summary.forEach(function (s) { line([[s[0]], [s[1], s[2] || 'text']]); }); }
    (report.tables || []).forEach(function (t) {
      L.push(''); if (t.heading || t.name) line([[t.heading || t.name]]);
      line(t.columns.map(function (c) { return [c.h]; }));
      t.rows.forEach(function (r) { line(t.columns.map(function (c, i) { return [r[i], c.type || 'text']; })); });
      if (t.total) line(t.columns.map(function (c, i) { return [t.total[i] === undefined ? '' : t.total[i], c.type || 'text']; }));
      if (!t.rows.length) line([['No records for this selection.']]);
    });
    if (report.notes && report.notes.length) { L.push(''); report.notes.forEach(function (n) { line([[n]]); }); }
    return '\uFEFF' + L.join('\r\n') + '\r\n';
  }

  // ---------- PDF ----------
  // Helvetica / Helvetica-Bold advance widths (1/1000 em) for ASCII 32..126 (standard AFM metrics).
  var HW = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  var HB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
  var WIN = { '\u20AC': 0x80, '\u2026': 0x85, '\u2018': 0x91, '\u2019': 0x92, '\u201C': 0x93, '\u201D': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97 };
  var SUBST = { '₹': 'Rs. ', '−': '-', '\u00A0': ' ', '\u2009': ' ', '\u202F': ' ' };
  function pdfText(s) { // -> WinAnsi string or null if a character cannot be shown with the standard fonts
    s = String(s).replace(/[₹−\u00A0\u2009\u202F]/g, function (m) { return SUBST[m]; });
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], c = s.charCodeAt(i);
      if (c >= 32 && c < 127) out += ch;
      else if (WIN[ch]) out += String.fromCharCode(WIN[ch]);
      else if (c >= 0xA0 && c <= 0xFF) out += ch;
      else if (c === 9 || c === 10 || c === 13) out += ' ';
      else return null;
    }
    return out;
  }
  var measureFn = null;   // set while laying out page-image PDFs, so widths match the canvas font
  function textWidth(s, size, bold) {
    if (measureFn) return measureFn(String(s), size, bold);
    var t = pdfText(s); if (t === null) t = String(s);
    var W = bold ? HB : HW, w = 0;
    for (var i = 0; i < t.length; i++) { var c = t.charCodeAt(i); w += (c >= 32 && c <= 126) ? W[c - 32] : 556; }
    return w * size / 1000;
  }
  function fit(s, size, bold, maxW) {
    s = String(s); if (textWidth(s, size, bold) <= maxW) return s;
    while (s.length > 1 && textWidth(s + '…', size, bold) > maxW) s = s.slice(0, -1);
    return s + '…';
  }
  var C = { brand: '#1D4ED8', navy: '#0B2A5B', ink: '#0F172A', muted: '#475569', faint: '#94A3B8', line: '#DCE3EE', zebra: '#F5F8FC', soft: '#EAF2FF', white: '#FFFFFF', neg: '#B45309' };

  /** Lays the report out on A4 pages. Returns {pages:[[op]], W, H}. Ops use top-left coordinates in points. */
  function layout(report) {
    var tables = report.tables || [];
    var maxCols = 0; tables.forEach(function (t) { maxCols = Math.max(maxCols, t.columns.length); });
    var land = maxCols > 7;
    var W = land ? 841.89 : 595.28, H = land ? 595.28 : 841.89, M = 36, IW = W - 2 * M, BOTTOM = H - 40;
    var pages = [], ops, y;
    function newPage(first) {
      ops = []; pages.push(ops);
      if (first) {
        ops.push({ t: 'rect', x: 0, y: 0, w: W, h: 58, c: C.brand });
        ops.push({ t: 'rect', x: 0, y: 58, w: W, h: 3, c: C.navy });
        ops.push({ t: 'text', x: M, y: 34, s: 19, b: 1, c: C.white, str: BRAND });
        ops.push({ t: 'text', x: M, y: 49, s: 8.5, c: '#DBEAFE', str: 'Business records · billing, expenses and statements' });
        ops.push({ t: 'text', x: W - M, y: 34, s: 8.5, c: C.white, str: 'Generated ' + stamp(), a: 'r' });
        y = 88;
        ops.push({ t: 'text', x: M, y: y, s: 16, b: 1, c: C.ink, str: fit(report.title, 16, 1, IW) }); y += 16;
        if (report.subtitle) { ops.push({ t: 'text', x: M, y: y, s: 10, c: C.muted, str: fit(report.subtitle, 10, 0, IW) }); y += 14; }
        if (report.period) { ops.push({ t: 'text', x: M, y: y, s: 10, b: 1, c: C.brand, str: fit('Period: ' + report.period, 10, 1, IW) }); y += 14; }
        if (report.meta && report.meta.length) {
          y += 4; var colW = IW / 2;
          report.meta.forEach(function (m, i) {
            var x = M + (i % 2) * colW;
            ops.push({ t: 'text', x: x, y: y, s: 8.5, b: 1, c: C.muted, str: fit(m[0] + ':', 8.5, 1, 90) });
            ops.push({ t: 'text', x: x + 92, y: y, s: 9, c: C.ink, str: fit(m[1], 9, 0, colW - 100) });
            if (i % 2 === 1 || i === report.meta.length - 1) y += 13;
          });
        }
        y += 6;
      } else {
        ops.push({ t: 'rect', x: 0, y: 0, w: W, h: 26, c: C.brand });
        ops.push({ t: 'text', x: M, y: 17, s: 10, b: 1, c: C.white, str: BRAND });
        ops.push({ t: 'text', x: W - M, y: 17, s: 8.5, c: C.white, a: 'r', str: fit(report.title + (report.period ? ' · ' + report.period : ''), 8.5, 0, IW - 120) });
        y = 46;
      }
    }
    function need(h) { if (y + h > BOTTOM) { newPage(false); return true; } return false; }
    newPage(true);

    // summary boxes
    if (report.summary && report.summary.length) {
      var per = land ? 5 : 4, gap = 8, bw = (IW - gap * (per - 1)) / per, bh = 40;
      report.summary.forEach(function (s, i) {
        if (i % per === 0) { if (i) y += bh + gap; need(bh + 4); }
        var x = M + (i % per) * (bw + gap), val = display(s[1], s[2]);
        ops.push({ t: 'rect', x: x, y: y, w: bw, h: bh, c: C.soft });
        ops.push({ t: 'rect', x: x, y: y, w: 3, h: bh, c: C.brand });
        ops.push({ t: 'text', x: x + 9, y: y + 14, s: 7.5, b: 1, c: C.muted, str: fit(String(s[0]).toUpperCase(), 7.5, 1, bw - 14) });
        ops.push({ t: 'text', x: x + 9, y: y + 31, s: 11.5, b: 1, c: (s[2] === 'balance' && s[1] < 0) ? C.neg : C.ink, str: fit(val, 11.5, 1, bw - 14) });
      });
      y += bh + 16;
    }

    // tables
    var RH = 15, HH = 18, FS = 8;
    tables.forEach(function (t) {
      var tw = 0; t.columns.forEach(function (c) { tw += c.w || (isNum(c.type) ? 1 : c.type === 'date' ? 0.9 : 1.4); });
      var xs = [], x = M; t.columns.forEach(function (c) { var w = IW * (c.w || (isNum(c.type) ? 1 : c.type === 'date' ? 0.9 : 1.4)) / tw; xs.push({ x: x, w: w }); x += w; });
      function header(cont) {
        if (t.heading) { ops.push({ t: 'text', x: M, y: y + 10, s: 10.5, b: 1, c: C.navy, str: fit(t.heading + (cont ? ' (continued)' : ''), 10.5, 1, IW) }); y += 16; }
        ops.push({ t: 'rect', x: M, y: y, w: IW, h: HH, c: C.brand });
        t.columns.forEach(function (c, i) {
          var cx = xs[i], num = isNum(c.type);
          ops.push({ t: 'text', x: num ? cx.x + cx.w - 4 : cx.x + 4, y: y + 12, s: FS, b: 1, c: C.white, a: num ? 'r' : 'l', str: fit(c.h, FS, 1, cx.w - 8) });
        });
        y += HH;
      }
      need((t.heading ? 16 : 0) + HH + RH * 2);
      header(false);
      function row(vals, bold, fill) {
        if (need(RH)) header(true);
        if (fill) ops.push({ t: 'rect', x: M, y: y, w: IW, h: RH, c: fill });
        t.columns.forEach(function (c, i) {
          var cx = xs[i], num = isNum(c.type), v = vals[i], txt = display(v, c.type);
          if (txt === '') return;
          ops.push({ t: 'text', x: num ? cx.x + cx.w - 4 : cx.x + 4, y: y + 10.5, s: FS, b: bold ? 1 : 0, c: (c.type === 'balance' && v < 0) ? C.neg : C.ink, a: num ? 'r' : 'l', str: fit(txt, FS, bold, cx.w - 8) });
        });
        ops.push({ t: 'rect', x: M, y: y + RH - 0.5, w: IW, h: 0.5, c: C.line });
        y += RH;
      }
      t.rows.forEach(function (r, i) { row(r, false, i % 2 ? C.zebra : null); });
      if (!t.rows.length) { if (need(RH)) header(true); ops.push({ t: 'text', x: M + 4, y: y + 11, s: FS, c: C.muted, str: 'No records for this selection.' }); y += RH; }
      if (t.total) { if (need(RH + 2)) header(true); ops.push({ t: 'rect', x: M, y: y, w: IW, h: 1.2, c: C.brand }); y += 1.2; row(t.total, true, C.soft); }
      y += 14;
    });

    if (report.notes && report.notes.length) {
      report.notes.forEach(function (n) {
        // simple word wrap
        var words = String(n).split(' '), lineStr = '';
        var flush = function () { if (!lineStr) return; need(12); ops.push({ t: 'text', x: M, y: y + 9, s: 8, i: 1, c: C.muted, str: lineStr }); y += 12; lineStr = ''; };
        words.forEach(function (w) { var tryS = lineStr ? lineStr + ' ' + w : w; if (textWidth(tryS, 8, 0) > IW) { flush(); lineStr = w; } else lineStr = tryS; });
        flush();
      });
    }
    var N = pages.length;
    pages.forEach(function (p, i) {
      p.push({ t: 'rect', x: M, y: H - 30, w: IW, h: 0.6, c: C.line });
      p.push({ t: 'text', x: M, y: H - 18, s: 7.5, c: C.faint, str: fit(BRAND + ' · ' + report.title + (report.period ? ' · ' + report.period : ''), 7.5, 0, IW - 90) });
      p.push({ t: 'text', x: W - M, y: H - 18, s: 7.5, c: C.faint, a: 'r', str: 'Page ' + (i + 1) + ' of ' + N });
    });
    return { pages: pages, W: W, H: H };
  }
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(function (v) { return Math.round(v * 1000) / 1000; }).join(' '); }
  function needsImages(L) {
    for (var i = 0; i < L.pages.length; i++) for (var j = 0; j < L.pages[i].length; j++) { var o = L.pages[i][j]; if (o.t === 'text' && pdfText(o.str) === null) return true; }
    return false;
  }
  function pdfAssemble(objs) { // objs: array of Uint8Array|string bodies; object n = index+1
    var parts = [latin('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')], off = [], len = parts[0].length;
    objs.forEach(function (body, i) {
      off.push(len);
      var head = latin((i + 1) + ' 0 obj\n'), b = typeof body === 'string' ? latin(body) : body, tail = latin('\nendobj\n');
      parts.push(head, b, tail); len += head.length + b.length + tail.length;
    });
    var x = 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    off.forEach(function (o) { x += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
    x += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info 2 0 R >>\nstartxref\n' + len + '\n%%EOF\n';
    parts.push(latin(x));
    return concat(parts);
  }
  function pdfInfo(report) { var t = pdfText(BRAND + ' - ' + report.title) || BRAND; return '<< /Title (' + t.replace(/([\\()])/g, '\\$1') + ') /Producer (' + BRAND + ') /Creator (' + BRAND + ') >>'; }
  function pdfFromText(L, report) {
    var n = L.pages.length, objs = [];
    // 1 catalog, 2 info, 3 pages, 4-6 fonts, then per page: page obj, content obj
    var kids = []; for (var i = 0; i < n; i++) kids.push((7 + i * 2) + ' 0 R');
    objs.push('<< /Type /Catalog /Pages 3 0 R >>', pdfInfo(report), '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');
    L.pages.forEach(function (ops, pi) {
      var s = [];
      ops.forEach(function (o) {
        if (o.t === 'rect') s.push(rgb(o.c) + ' rg ' + o.x.toFixed(2) + ' ' + (L.H - o.y - o.h).toFixed(2) + ' ' + o.w.toFixed(2) + ' ' + o.h.toFixed(2) + ' re f');
        else if (o.t === 'text') {
          var t = pdfText(o.str); if (t === null) t = String(o.str).replace(/[^\x20-\x7E]/g, '?');
          var w = textWidth(o.str, o.s, o.b), x = o.a === 'r' ? o.x - w : o.a === 'c' ? o.x - w / 2 : o.x;
          s.push('BT /' + (o.b ? 'F2' : o.i ? 'F3' : 'F1') + ' ' + o.s + ' Tf ' + rgb(o.c) + ' rg ' + x.toFixed(2) + ' ' + (L.H - o.y).toFixed(2) + ' Td (' + t.replace(/([\\()])/g, '\\$1') + ') Tj ET');
        }
      });
      var content = s.join('\n');
      objs.push('<< /Type /Page /Parent 3 0 R /MediaBox [0 0 ' + L.W.toFixed(2) + ' ' + L.H.toFixed(2) + '] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents ' + (8 + pi * 2) + ' 0 R >>',
        '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
    });
    return pdfAssemble(objs);
  }
  var CANVAS_FONT = '"Segoe UI",Roboto,"Noto Sans","Noto Sans Devanagari","Helvetica Neue",Arial,sans-serif';
  function pdfFromImages(L, report) {
    var SC = 2, objs = [], n = L.pages.length, kids = [];
    for (var i = 0; i < n; i++) kids.push((3 + i * 3 + 1) + ' 0 R');
    objs.push('<< /Type /Catalog /Pages 3 0 R >>', pdfInfo(report), '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>');
    L.pages.forEach(function (ops, pi) {
      var cv = document.createElement('canvas'); cv.width = Math.round(L.W * SC); cv.height = Math.round(L.H * SC);
      var g = cv.getContext('2d'); g.scale(SC, SC); g.fillStyle = '#fff'; g.fillRect(0, 0, L.W, L.H); g.textBaseline = 'alphabetic';
      ops.forEach(function (o) {
        if (o.t === 'rect') { g.fillStyle = o.c; g.fillRect(o.x, o.y, o.w, o.h); }
        else if (o.t === 'text') { g.font = (o.i ? 'italic ' : '') + (o.b ? '700 ' : '400 ') + o.s + 'px ' + CANVAS_FONT; g.fillStyle = o.c; g.textAlign = o.a === 'r' ? 'right' : o.a === 'c' ? 'center' : 'left'; g.fillText(String(o.str), o.x, o.y); }
      });
      var bin = atob(cv.toDataURL('image/jpeg', 0.9).split(',')[1]), img = new Uint8Array(bin.length);
      for (var k = 0; k < bin.length; k++) img[k] = bin.charCodeAt(k);
      var imgObj = 3 + pi * 3 + 3, content = 'q ' + L.W.toFixed(2) + ' 0 0 ' + L.H.toFixed(2) + ' 0 0 cm /Im0 Do Q';
      objs.push('<< /Type /Page /Parent 3 0 R /MediaBox [0 0 ' + L.W.toFixed(2) + ' ' + L.H.toFixed(2) + '] /Resources << /XObject << /Im0 ' + imgObj + ' 0 R >> >> /Contents ' + (imgObj - 1) + ' 0 R >>',
        '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream',
        concat([latin('<< /Type /XObject /Subtype /Image /Width ' + cv.width + ' /Height ' + cv.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + img.length + ' >>\nstream\n'), img, latin('\nendstream')]));
    });
    return pdfAssemble(objs);
  }
  function canDrawCanvas() {
    try { if (typeof document === 'undefined') return false; var c = document.createElement('canvas'); return !!(c.getContext && c.getContext('2d')); } catch (e) { return false; }
  }
  function pdf(report) {
    var L = layout(report);
    if (needsImages(L) && canDrawCanvas()) {
      var g = document.createElement('canvas').getContext('2d');
      measureFn = function (str, size, bold) { g.font = (bold ? '700 ' : '400 ') + size + 'px ' + CANVAS_FONT; return g.measureText(str).width; };
      try { L = layout(report); } finally { measureFn = null; }
      return pdfFromImages(L, report);
    }
    return pdfFromText(L, report);
  }

  // ---------- print (HTML built with DOM APIs; styles in shared/print.css) ----------
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; }
  function printReport(report) {
    var box = document.getElementById('mmhPrint');
    if (!box) { box = el('div'); box.id = 'mmhPrint'; box.setAttribute('aria-hidden', 'true'); document.body.appendChild(box); }
    box.textContent = '';
    var hd = el('div', 'mp-head'); hd.appendChild(el('div', 'mp-brand', BRAND)); hd.appendChild(el('div', 'mp-gen', 'Generated ' + stamp())); box.appendChild(hd);
    box.appendChild(el('h1', 'mp-title', report.title));
    if (report.subtitle) box.appendChild(el('p', 'mp-sub', report.subtitle));
    if (report.period) box.appendChild(el('p', 'mp-period', 'Period: ' + report.period));
    if (report.meta && report.meta.length) { var mt = el('div', 'mp-meta'); report.meta.forEach(function (m) { var d = el('div'); d.appendChild(el('b', null, m[0] + ': ')); d.appendChild(document.createTextNode(m[1])); mt.appendChild(d); }); box.appendChild(mt); }
    if (report.summary && report.summary.length) {
      var sm = el('div', 'mp-sum');
      report.summary.forEach(function (s) { var d = el('div', 'mp-box'); d.appendChild(el('span', null, s[0])); d.appendChild(el('b', null, display(s[1], s[2]))); sm.appendChild(d); });
      box.appendChild(sm);
    }
    (report.tables || []).forEach(function (t) {
      if (t.heading) box.appendChild(el('h2', 'mp-h2', t.heading));
      var tb = el('table', 'mp-table'), th = el('thead'), tr = el('tr');
      t.columns.forEach(function (c) { tr.appendChild(el('th', isNum(c.type) ? 'r' : null, c.h)); }); th.appendChild(tr); tb.appendChild(th);
      var body = el('tbody');
      t.rows.forEach(function (r) { var row = el('tr'); t.columns.forEach(function (c, i) { row.appendChild(el('td', isNum(c.type) ? 'r' : null, display(r[i], c.type))); }); body.appendChild(row); });
      if (!t.rows.length) { var er = el('tr'), td = el('td', 'mp-empty', 'No records for this selection.'); td.colSpan = t.columns.length; er.appendChild(td); body.appendChild(er); }
      tb.appendChild(body);
      if (t.total) { var tf = el('tfoot'), fr = el('tr'); t.columns.forEach(function (c, i) { fr.appendChild(el('td', isNum(c.type) ? 'r' : null, display(t.total[i], c.type))); }); tf.appendChild(fr); tb.appendChild(tf); }
      box.appendChild(tb);
    });
    (report.notes || []).forEach(function (n) { box.appendChild(el('p', 'mp-note', n)); });
    document.body.classList.add('mmh-printing');
    var done = function () { document.body.classList.remove('mmh-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    try { window.print(); } catch (e) { done(); return false; }
    setTimeout(function () { if (!window.matchMedia || !window.matchMedia('print').matches) done(); }, 1500);
    return true;
  }

  // ---------- download ----------
  var MIME = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv;charset=utf-8', json: 'application/json' };
  function build(format, report) {
    if (format === 'pdf') return pdf(report);
    if (format === 'xlsx') return xlsx(report);
    if (format === 'csv') return csv(report);
    throw new Error('Unknown format ' + format);
  }
  function download(filename, mime, data) {
    var blob = new Blob([data], { type: mime });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener'; document.body.appendChild(a); a.click();
    setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} a.remove(); }, 2000);
    return blob;
  }
  /** Build and download. Returns the file name. */
  function exportReport(format, report) {
    var name = safeName(report.filename || report.title) + '.' + format;
    download(name, MIME[format], build(format, report));
    return name;
  }

  var api = { exportReport: exportReport, build: build, pdf: pdf, xlsx: xlsx, csv: csv, zip: zip, crc32: crc32, layout: layout, print: printReport,
    download: download, display: display, safeName: safeName, MIME: MIME, pdfText: pdfText, textWidth: textWidth };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MMHExport = api;
})(typeof window !== 'undefined' ? window : this);
