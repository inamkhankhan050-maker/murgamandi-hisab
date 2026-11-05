/* ============================================================
   MurgaMandi Hisab · shared bill print service (MMHBill)
   Used by Zinda Single and Katai Single only for the LOOK of the
   printed / PDF / photo bill. It does no calculation: each section
   passes the figures its own engine already worked out.
   - Firm profile (name, top line, shop line, address, logo, stamp)
     saved under mmh.firm.v1 until the user removes it.
   - Bill colour saved automatically under mmh.billTheme.v1.
   - draw(model) -> canvas in the shop-bill layout.
   ============================================================ */
(function (root) {
  'use strict';

  var FIRM_KEY = 'mmh.firm.v1', THEME_KEY = 'mmh.billTheme.v1';
  var S = root.MMHStorage || null;
  function getJ(k) { if (S) return S.getJSON(k, null); try { return JSON.parse(root.localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function setJ(k, v) { if (S) return S.setJSON(k, v); try { root.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function del(k) { if (S) return S.remove(k); try { root.localStorage.removeItem(k); return true; } catch (e) { return false; } }

  // ---------- Colours ----------
  var THEMES = [
    { id: 'maroon', name: 'Maroon', main: '#7B2D12', head: '#9A3412', light: '#FDE68A', hi: '#FCD34D', paper: '#FFFBF2', grid: '#E9D5B5' },
    { id: 'blue', name: 'Blue', main: '#1E3A8A', head: '#1D4ED8', light: '#BFDBFE', hi: '#FDE68A', paper: '#F8FAFF', grid: '#C7D2FE' },
    { id: 'green', name: 'Green', main: '#14532D', head: '#15803D', light: '#BBF7D0', hi: '#FDE68A', paper: '#F7FDF9', grid: '#BBE5CB' },
    { id: 'purple', name: 'Purple', main: '#4C1D95', head: '#6D28D9', light: '#DDD6FE', hi: '#FDE68A', paper: '#FAF8FF', grid: '#D8CCF5' },
    { id: 'red', name: 'Red', main: '#881337', head: '#BE123C', light: '#FECDD3', hi: '#FDE68A', paper: '#FFF8F9', grid: '#F3C6CF' },
    { id: 'orange', name: 'Orange', main: '#9A3412', head: '#EA580C', light: '#FED7AA', hi: '#FEF3C7', paper: '#FFFAF5', grid: '#F5D3B5' },
    { id: 'teal', name: 'Teal', main: '#134E4A', head: '#0F766E', light: '#99F6E4', hi: '#FDE68A', paper: '#F5FDFB', grid: '#B5E6DD' },
    { id: 'black', name: 'Black', main: '#111827', head: '#374151', light: '#E5E7EB', hi: '#FCD34D', paper: '#FFFFFF', grid: '#D1D5DB' }
  ];
  function hexOk(h) { return typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h); }
  function mix(a, b, t) {
    var p = function (h, i) { return parseInt(h.substr(1 + i * 2, 2), 16); };
    var o = '#'; for (var i = 0; i < 3; i++) { var v = Math.round(p(a, i) * (1 - t) + p(b, i) * t); o += ('0' + v.toString(16)).slice(-2); }
    return o;
  }
  function customTheme(hex) {
    return { id: 'custom', name: 'Custom', main: mix(hex, '#000000', 0.25), head: hex, light: mix(hex, '#FFFFFF', 0.72), hi: '#FDE68A', paper: mix(hex, '#FFFFFF', 0.96), grid: mix(hex, '#FFFFFF', 0.7) };
  }
  function getTheme() {
    var t = getJ(THEME_KEY) || {};
    if (t.id === 'custom' && hexOk(t.custom)) return customTheme(t.custom);
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === t.id) return THEMES[i];
    return THEMES[0];
  }
  function setTheme(id, custom) { return setJ(THEME_KEY, id === 'custom' ? { id: 'custom', custom: hexOk(custom) ? custom : '#7B2D12' } : { id: id }); }
  function themeState() { var t = getJ(THEME_KEY) || {}; return { id: t.id || 'maroon', custom: hexOk(t.custom) ? t.custom : '#7B2D12' }; }

  // ---------- Firm profile ----------
  function clean(s, n) { return typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n || 80) : ''; }
  function imgOk(s) { return typeof s === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length < 400000 ? s : ''; }
  function getFirm(legacyKey) {
    var f = getJ(FIRM_KEY);
    if (!f || typeof f !== 'object') {
      var old = '';
      if (legacyKey) { try { old = S ? (S.getRaw(legacyKey) || '') : (root.localStorage.getItem(legacyKey) || ''); } catch (e) { old = ''; } }
      old = clean(old);
      if (!old) return null;
      f = { name: old }; setJ(FIRM_KEY, f);
    }
    var o = { name: clean(f.name), phone: clean(f.phone, 90), shop: clean(f.shop, 90), address: clean(f.address, 120), logo: imgOk(f.logo), stamp: imgOk(f.stamp) };
    return o.name ? o : null;
  }
  function saveFirm(f) { var o = { name: clean(f.name), phone: clean(f.phone, 90), shop: clean(f.shop, 90), address: clean(f.address, 120), logo: imgOk(f.logo), stamp: imgOk(f.stamp) }; if (!o.name) return false; return setJ(FIRM_KEY, o); }
  function removeFirm() { return del(FIRM_KEY); }

  // ---------- Images ----------
  var imgCache = {};
  function loadImg(src, cb) {
    if (!src) return cb(null);
    var c = imgCache[src]; if (c && c.complete && c.naturalWidth) return cb(c);
    var done = false, fin = function (v) { if (done) return; done = true; cb(v); };
    var im = new root.Image(); im.onload = function () { imgCache[src] = im; fin(im); }; im.onerror = function () { fin(null); };
    root.setTimeout(function () { fin(null); }, 2500); im.src = src;
  }
  /** Read a picked file, shrink it to max 320px, return a data URL (PNG keeps transparency). */
  function fileToData(file, cb) {
    if (!file || !/^image\//.test(file.type)) return cb(null, 'Sirf photo (PNG / JPG) chuniye');
    if (file.size > 8 * 1024 * 1024) return cb(null, 'Photo bahut badi hai (8 MB se kam)');
    var r = new root.FileReader();
    r.onload = function () {
      var im = new root.Image();
      im.onload = function () {
        var m = 320, s = Math.min(1, m / Math.max(im.width, im.height)), w = Math.max(1, Math.round(im.width * s)), h = Math.max(1, Math.round(im.height * s));
        var cv = root.document.createElement('canvas'); cv.width = w; cv.height = h; var g = cv.getContext && cv.getContext('2d');
        if (!g) return cb(null, 'Photo nahi padh paye');
        g.drawImage(im, 0, 0, w, h);
        var out = cv.toDataURL('image/png'); if (out.length > 380000) out = cv.toDataURL('image/jpeg', 0.85);
        cb(out, null);
      };
      im.onerror = function () { cb(null, 'Photo nahi padh paye'); };
      im.src = r.result;
    };
    r.onerror = function () { cb(null, 'Photo nahi padh paye'); };
    r.readAsDataURL(file);
  }

  // ---------- Formatting ----------
  function num(paise, dec) {
    if (paise == null || isNaN(paise)) return '';
    var neg = paise < 0, v = Math.abs(paise) / 100, d = dec == null ? (Math.abs(paise) % 100 ? 2 : 0) : dec;
    var s = v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
    return (neg ? '-' : '') + s;
  }
  function shortDate(iso) {
    var p = String(iso || '').split('-'), d = p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return ('0' + d.getDate()).slice(-2) + '-' + M[d.getMonth()] + '-' + String(d.getFullYear()).slice(-2);
  }

  // ---------- Drawing ----------
  var F = 'Roboto, "Noto Sans", "Segoe UI", Arial, sans-serif';
  /**
   * model: { firm, date (YYYY-MM-DD), name, rows:[{qty,weight,part,rate,amount,note}], minRows,
   *          total:{qty,weight,amount}, extras:[{label,mid,value,left,hl}] (left = value shown under Qty), grand:{label,value}, words, fallbackTitle }
   * Returns a canvas, or null where canvas is not available.
   */
  function draw(model, imgs) {
    var doc = root.document, cv = doc.createElement('canvas'), g = cv.getContext && cv.getContext('2d');
    if (!g) return null;
    // Page geometry copied from the reference bill (900 × 1462, 41px blank border, blank space under the table).
    var T = model.theme || getTheme(), firm = model.firm || {}, PW = 900, SC = 2, M = 41, RH = 56;
    var X0 = M, X1 = PW - M, CW = X1 - X0;
    var rows = model.rows || [], extras = model.extras || [];
    var nRows = Math.max(rows.length, (model.minRows || 6) + Math.max(0, 6 - extras.length));
    var headY = M, headH = 267, nameY = headY + headH + 3, nameH = 55, thY = nameY + nameH, bodyY = thY + 55;
    var totY = bodyY + nRows * RH, exY = totY + RH, grandY = exY + extras.length * RH, endY = grandY + RH;
    var PH = Math.max(1462, endY + 257);
    cv.width = PW * SC; cv.height = PH * SC; g.scale(SC, SC);
    var COL = [X0, 140, 259, 527, 683, X1];
    var rect = function (x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); };
    var font = function (size, weight, italic) { g.font = (italic ? 'italic ' : '') + (weight || 400) + ' ' + size + 'px ' + F; };
    var text = function (t, x, y, size, color, weight, align, maxW, italic) {
      t = String(t == null ? '' : t); if (!t) return;
      var s = size; font(s, weight, italic);
      if (maxW) { while (s > 10 && g.measureText(t).width > maxW) { s -= 1; font(s, weight, italic); } if (g.measureText(t).width > maxW) { while (t.length > 1 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1); t += '…'; } }
      g.fillStyle = color; g.textAlign = align || 'left'; g.textBaseline = 'middle'; g.fillText(t, x, y);
    };
    var hline = function (y, x0, x1) { rect(x0 == null ? X0 : x0, y - 0.6, (x1 == null ? X1 : x1) - (x0 == null ? X0 : x0), 1.2, T.grid); };
    var vline = function (x, y0, y1) { rect(x - 0.6, y0, 1.2, y1 - y0, T.grid); };
    var mid = function (i) { return (COL[i] + COL[i + 1]) / 2; };

    // page: plain paper all round (blank border and blank space below)
    rect(0, 0, PW, PH, mix(T.paper, '#FFF7D6', 0.35));
    rect(X0, headY, CW, endY - headY, T.paper);
    // header
    rect(X0, headY, CW, headH, T.main);
    var name = firm.name || model.fallbackTitle || 'MurgaMandi Hisab';
    var hasLogo = imgs && imgs.logo;
    if (firm.phone) text(firm.phone, PW / 2, headY + 28, 22, T.hi, 700, 'center', CW - 40);
    text(name, hasLogo ? 450 : PW / 2, headY + 95, 70, '#FFFFFF', 800, 'center', hasLogo ? 560 : CW - 40);
    if (hasLogo) {
      var brand = !!imgs.brand, L = imgs.logo, cx = 108, cy = headY + (brand ? 88 : 106), r = brand ? 40 : 48;
      g.save(); g.beginPath(); g.arc(cx, cy, r + 3, 0, Math.PI * 2); g.fillStyle = '#FFFFFF'; g.fill();
      g.lineWidth = 2.5; g.strokeStyle = T.head; g.stroke();
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
      var sc = Math.max((2 * r) / L.width, (2 * r) / L.height), dw = L.width * sc, dh = L.height * sc;
      if (L.width / L.height > 1.6 || L.height / L.width > 1.6) { sc = Math.min((2 * r) / L.width, (2 * r) / L.height); dw = L.width * sc; dh = L.height * sc; }
      g.drawImage(L, cx - dw / 2, cy - dh / 2, dw, dh); g.restore();
      if (brand) { g.globalAlpha = 0.85; text('MurgaMandi Hisab', cx, cy + r + 17, 14, T.hi, 700, 'center', 116); g.globalAlpha = 1; }
    }
    // shop line + date
    var dy = headY + 159, dh2 = 55;
    text(firm.shop || '', (X0 + COL[3]) / 2 + 10, dy + dh2 / 2, 24, T.hi, 700, 'center', COL[3] - X0 - 40);
    rect(COL[3], dy, COL[4] - COL[3], dh2, T.light); text('Date', mid(3), dy + dh2 / 2, 22, '#3B1F0E', 700, 'center');
    rect(COL[4], dy, X1 - COL[4], dh2, T.paper); text(shortDate(model.date), mid(4), dy + dh2 / 2, 21, '#2B1B0E', 600, 'center', X1 - COL[4] - 16);
    // address band
    text(firm.address || '', PW / 2, dy + dh2 + (headY + headH - dy - dh2) / 2, 26, T.hi, 700, 'center', CW - 40);
    // name row
    rect(X0, nameY, COL[1] - X0, nameH, T.light); text('Name', mid(0), nameY + nameH / 2, 22, '#3B1F0E', 700, 'center');
    rect(COL[1], nameY, X1 - COL[1], nameH, '#E8E8E8'); text(model.name || 'Customer', (COL[1] + X1) / 2, nameY + nameH / 2, 30, '#3B1F0E', 700, 'center', X1 - COL[1] - 30);
    // table head
    rect(X0, thY, CW, 55, T.head);
    ['Qty', 'Weight', 'Particulars', 'Rate', 'Amount'].forEach(function (h, i) { text(h, mid(i), thY + 27.5, 21, '#FFFFFF', 700, 'center'); });
    // body rows
    for (var i = 0; i < nRows; i++) {
      var y = bodyY + i * RH, r0 = rows[i];
      if (r0) {
        text(r0.qty, mid(0), y + RH / 2, 24, '#3B1F0E', 700, 'center', COL[1] - X0 - 12);
        text(r0.weight, mid(1), y + RH / 2, 24, '#3B1F0E', 700, 'center', COL[2] - COL[1] - 12);
        text(r0.part, COL[2] + 10, y + RH / 2, 22, '#3B1F0E', 600, 'left', COL[3] - COL[2] - 20);
        text(r0.rate, mid(3), y + RH / 2, 24, '#3B1F0E', 700, 'center', COL[4] - COL[3] - 12);
        text(r0.amount, X1 - 10, y + RH / 2, 24, '#3B1F0E', 700, 'right', X1 - COL[4] - 16);
      }
      hline(y + RH);
    }
    // total row
    var t0 = model.total || {};
    rect(X0, totY, COL[3] - X0, RH, T.light); rect(COL[4], totY, X1 - COL[4], RH, T.light);
    text(t0.qty, mid(0), totY + RH / 2, 24, '#3B1F0E', 700, 'center', COL[1] - X0 - 12);
    text(t0.weight, mid(1), totY + RH / 2, 24, '#3B1F0E', 700, 'center', COL[2] - COL[1] - 12);
    text('Total', COL[2] + 10, totY + RH / 2, 24, '#3B1F0E', 700, 'left');
    text(t0.amount, X1 - 10, totY + RH / 2, 24, '#3B1F0E', 700, 'right', X1 - COL[4] - 16);
    hline(totY + RH);
    // extras
    extras.forEach(function (e, k) {
      var y = exY + k * RH, hasLeft = e.left != null && e.left !== '';
      if (e.hl) { rect(COL[2], y, COL[3] - COL[2], RH, T.light); rect(COL[4], y, X1 - COL[4], RH, T.light); }
      text(e.label, COL[2] + 10, y + RH / 2, 24, '#3B1F0E', 700, 'left', COL[3] - COL[2] - 20);
      if (hasLeft) text(e.left, mid(0), y + RH / 2, 24, '#3B1F0E', 700, 'center', COL[1] - X0 - 8);
      text(e.value, X1 - 10, y + RH / 2, 24, '#3B1F0E', 700, 'right', X1 - COL[4] - 16);
      hline(y + RH, hasLeft ? X0 : COL[2]);
    });
    // grand total
    var gr = model.grand || { label: 'G. TOTAL', value: '' };
    rect(COL[2], grandY, COL[3] - COL[2], RH, T.main); rect(COL[4], grandY, X1 - COL[4], RH, T.main);
    text(gr.label, COL[2] + 10, grandY + RH / 2, 24, '#FFFFFF', 700, 'left', COL[3] - COL[2] - 20);
    text(gr.value, X1 - 10, grandY + RH / 2, 25, T.hi, 800, 'right', X1 - COL[4] - 16);
    // grid lines
    vline(COL[1], nameY, totY + RH); vline(COL[2], thY, endY); vline(COL[3], thY, endY); vline(COL[4], thY, endY);
    g.strokeStyle = T.grid; g.lineWidth = 1.2; g.strokeRect(X0, headY, CW, endY - headY);
    // amount in words under the table (right), stamp over it
    text(model.words || '', X1, endY + 30, 17, '#3B2A1E', 400, 'right', CW);
    if (imgs && imgs.stamp) { var st = imgs.stamp, sh = 165, sw = st.width * sh / st.height; if (sw > 220) { sw = 220; sh = st.height * sw / st.width; } g.globalAlpha = 0.9; g.drawImage(st, 755 - sw / 2, endY + 75 - sh / 2, sw, sh); g.globalAlpha = 1; }
    return cv;
  }
  /** draw after the firm's logo and stamp pictures have loaded. cb(canvas|null) */
  var DEFAULT_LOGO = (function () { try { var s = root.document && root.document.currentScript; if (s && s.src) return s.src.replace(/shared\/bill-print\.js.*$/, 'assets/icons/logo-192.png'); } catch (e) {} return '../../assets/icons/logo-192.png'; })();
  function render(model, cb) {
    var f = model.firm || {};
    var probe = root.document.createElement('canvas'); if (!(probe.getContext && probe.getContext('2d'))) return cb(null);
    loadImg(f.logo || DEFAULT_LOGO, function (logo) { loadImg(f.stamp, function (stamp) { var cv = null; try { cv = draw(model, { logo: logo, stamp: stamp, brand: !f.logo }); } catch (e) { if (root.console) root.console.error(e); } cb(cv); }); });
  }

  /** Print a canvas through the section's hidden receipt box. */
  function printCanvas(cv, box, onBlocked) {
    var doc = root.document, img = doc.createElement('img');
    img.className = 'bill-img'; img.alt = 'Bill';
    box.textContent = ''; box.classList.add('bill-mode'); box.appendChild(img);
    var go = function () {
      doc.body.classList.add('print-rcpt');
      var done = function () { doc.body.classList.remove('print-rcpt'); root.removeEventListener('afterprint', done); };
      root.addEventListener('afterprint', done);
      try { root.print(); } catch (e) { if (onBlocked) onBlocked(); }
      setTimeout(function () { if (!root.matchMedia || !root.matchMedia('print').matches) done(); }, 1500);
    };
    var fired = false; img.onload = function () { if (fired) return; fired = true; go(); }; img.src = cv.toDataURL('image/png');
  }

  // ---------- Firm + colour panel (UI) ----------
  /**
   * mountPanel(host, { legacyKey, confirm(title,text,yes,fn), toast(msg), onChange() })
   * Builds the firm-details and colour controls inside host. All user text goes in via textContent.
   */
  function mountPanel(host, o) {
    var doc = root.document, el = function (tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    var draft = null;
    host.textContent = ''; host.classList.add('bp-panel');
    var view = el('div', 'bp-view'), form = el('div', 'bp-form'), colors = el('div', 'bp-colors');
    host.appendChild(view); host.appendChild(form); host.appendChild(colors);

    function field(label, key, max, ph) {
      var lb = el('label', 'fld bp-f'), sp = el('span', null, label), inp = el('input'); inp.maxLength = max; inp.autocomplete = 'off'; if (ph) inp.placeholder = ph;
      inp.value = draft[key] || ''; inp.addEventListener('input', function () { draft[key] = inp.value; });
      lb.appendChild(sp); lb.appendChild(inp); return lb;
    }
    function picField(label, key) {
      var w = el('div', 'bp-pic'), sp = el('span', 'bp-pl', label), prev = el('div', 'bp-prev'), inp = el('input'), pick = el('button', 'btn bp-sm', draft[key] ? 'Badlo' : 'Photo chuno'), rm = el('button', 'btn bp-sm danger', 'Hatao');
      inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp'; inp.hidden = true; pick.type = rm.type = 'button';
      var show = function () { prev.textContent = ''; if (draft[key]) { var im = el('img'); im.src = draft[key]; im.alt = ''; prev.appendChild(im); } else prev.appendChild(el('em', null, 'Nahi')); rm.hidden = !draft[key]; pick.textContent = draft[key] ? 'Badlo' : 'Photo chuno'; };
      pick.onclick = function () { inp.click(); };
      rm.onclick = function () { draft[key] = ''; show(); };
      inp.onchange = function () { var f = inp.files && inp.files[0]; inp.value = ''; fileToData(f, function (d, err) { if (err) { o.toast && o.toast(err); return; } draft[key] = d; show(); }); };
      w.appendChild(sp); w.appendChild(prev); w.appendChild(pick); w.appendChild(rm); w.appendChild(inp); show(); return w;
    }
    function showView() {
      var f = getFirm(o.legacyKey);
      view.textContent = ''; form.textContent = ''; form.hidden = true; view.hidden = false;
      var hd = el('div', 'bp-hd'); hd.appendChild(el('h3', null, 'Firm details (bill ke upar)'));
      view.appendChild(hd);
      if (f) {
        var card = el('div', 'bp-card');
        if (f.logo) { var im = el('img', 'bp-logo'); im.src = f.logo; im.alt = ''; card.appendChild(im); }
        var tx = el('div', 'bp-tx'); tx.appendChild(el('b', null, f.name));
        [f.phone, f.shop, f.address].forEach(function (s) { if (s) tx.appendChild(el('span', null, s)); });
        card.appendChild(tx); view.appendChild(card);
        var acts = el('div', 'bp-acts'), rm = el('button', 'btn danger', 'Remove firm');
        rm.type = 'button';
        rm.onclick = function () { o.confirm('Firm details hatayein?', f.name + ' ki details (naam, phone, address, logo) is phone se hat jayengi. Saved bills nahi hatenge.', 'Remove', function () { removeFirm(); showView(); o.onChange && o.onChange(); o.toast && o.toast('Firm details hata di'); }); };
        acts.appendChild(rm); view.appendChild(acts);
        view.appendChild(el('p', 'bp-note', 'Ye details lock hain, edit nahi hongi. Har bill par apne aap aayengi.'));
      } else {
        view.appendChild(el('p', 'bp-note', 'Firm ka naam, phone aur address ek baar save karein. Har bill par apne aap aayega.'));
        var add = el('button', 'btn primary', '+ Firm details add karein'); add.type = 'button'; add.onclick = function () { showForm(null); };
        view.appendChild(add);
      }
    }
    function showForm(f) {
      draft = f ? JSON.parse(JSON.stringify(f)) : { name: '', phone: '', shop: '', address: '', logo: '', stamp: '' };
      view.hidden = true; form.hidden = false; form.textContent = '';
      form.appendChild(el('h3', null, 'Firm details add karein'));
      form.appendChild(el('p', 'bp-note', 'Dhyan se bhariye: save hone ke baad edit nahi hoga.'));
      var grid = el('div', 'bp-grid');
      grid.appendChild(field('Firm / Dukaan ka naam *', 'name', 80, 'jaise Indian Chicken Shop'));
      grid.appendChild(field('Upar wali line (phone)', 'phone', 90, 'jaise Shekh Elias: 7678365870'));
      grid.appendChild(field('Shop line', 'shop', 90, 'jaise Shop No. 25'));
      grid.appendChild(field('Address', 'address', 120, 'jaise Poultry Market Ghazipur Delhi 110096'));
      form.appendChild(grid);
      var pics = el('div', 'bp-pics'); pics.appendChild(picField('Logo (optional)', 'logo')); pics.appendChild(picField('Stamp / Mohar (optional)', 'stamp')); form.appendChild(pics);
      var err = el('p', 's-err bp-err'); form.appendChild(err);
      var acts = el('div', 'bp-acts'), cancel = el('button', 'btn', 'Cancel'), save = el('button', 'btn primary', 'Save firm');
      cancel.type = save.type = 'button';
      cancel.onclick = showView;
      save.onclick = function () {
        if (!clean(draft.name)) { err.textContent = 'Firm ka naam bhariye'; return; }
        var go = function () {
        if (!saveFirm(draft)) { err.textContent = 'Save nahi ho paya (storage full ya band). Logo/stamp hata kar dobara try karein.'; return; }
        showView(); o.onChange && o.onChange(); o.toast && o.toast('Firm details save ho gayi');
        };
        o.confirm('Firm details lock karein?', 'Save ke baad ye details edit nahi hongi. Naam, phone aur address ek baar check kar lijiye.', 'Save', go);
      };
      acts.appendChild(cancel); acts.appendChild(save); form.appendChild(acts);
      var first = form.querySelector('input'); if (first) first.focus();
    }
    function showColors() {
      colors.textContent = '';
      colors.appendChild(el('h3', null, 'Bill ka colour'));
      var st = themeState(), row = el('div', 'bp-sw');
      THEMES.forEach(function (t) {
        var b = el('button', 'bp-chip' + (st.id === t.id ? ' on' : '')); b.type = 'button'; b.title = t.name; b.setAttribute('aria-label', t.name + ' colour'); b.setAttribute('aria-pressed', st.id === t.id ? 'true' : 'false');
        b.style.background = 'linear-gradient(135deg,' + t.main + ' 0 55%,' + t.light + ' 55% 100%)';
        b.onclick = function () { setTheme(t.id); showColors(); o.onChange && o.onChange(); };
        row.appendChild(b);
      });
      var cw = el('label', 'bp-chip bp-custom' + (st.id === 'custom' ? ' on' : '')), ci = el('input'); ci.type = 'color'; ci.value = st.custom; cw.title = 'Apna colour'; ci.setAttribute('aria-label', 'Apna colour chuniye');
      cw.style.background = st.id === 'custom' ? st.custom : 'conic-gradient(#ef4444,#f59e0b,#22c55e,#06b6d4,#6366f1,#ec4899,#ef4444)';
      ci.addEventListener('input', function () { setTheme('custom', ci.value); cw.style.background = ci.value; o.onChange && o.onChange(); });
      ci.addEventListener('change', showColors);
      cw.appendChild(ci); row.appendChild(cw);
      colors.appendChild(row);
      colors.appendChild(el('p', 'bp-note', 'Jo colour chunoge wahi apne aap save rahega.'));
    }
    showView(); showColors();
    return { refresh: function () { showView(); showColors(); } };
  }

  root.MMHBill = { THEMES: THEMES, getTheme: getTheme, setTheme: setTheme, getFirm: getFirm, saveFirm: saveFirm, removeFirm: removeFirm,
    draw: draw, render: render, printCanvas: printCanvas, mountPanel: mountPanel, num: num, shortDate: shortDate, FIRM_KEY: FIRM_KEY, THEME_KEY: THEME_KEY };
})(typeof window !== 'undefined' ? window : this);
