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
    var im = new root.Image(); im.onload = function () { imgCache[src] = im; cb(im); }; im.onerror = function () { cb(null); }; im.src = src;
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
   *          total:{qty,weight,amount}, extras:[{label,mid,value,hl}], grand:{label,value}, words, fallbackTitle }
   * Returns a canvas, or null where canvas is not available.
   */
  function draw(model, imgs) {
    var doc = root.document, cv = doc.createElement('canvas'), g = cv.getContext && cv.getContext('2d');
    if (!g) return null;
    var T = model.theme || getTheme(), firm = model.firm || {}, W = 1000, SC = 2, RH = 54;
    var rows = model.rows || [], minRows = model.minRows || 4, extras = model.extras || [];
    var nRows = Math.max(rows.length, minRows);
    var headH = 272, nameY = headH + 2, thY = nameY + 56, bodyY = thY + RH;
    var totY = bodyY + nRows * RH, exY = totY + RH, grandY = exY + extras.length * RH, footY = grandY + RH, H = footY + 120;
    cv.width = W * SC; cv.height = H * SC; g.scale(SC, SC);
    var COL = [0, 115, 250, 560, 735, 1000];
    var rect = function (x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); };
    var font = function (size, weight, italic) { g.font = (italic ? 'italic ' : '') + (weight || 400) + ' ' + size + 'px ' + F; };
    var text = function (t, x, y, size, color, weight, align, maxW, italic) {
      t = String(t == null ? '' : t); if (!t) return;
      var s = size; font(s, weight, italic);
      if (maxW) { while (s > 11 && g.measureText(t).width > maxW) { s -= 1; font(s, weight, italic); } if (g.measureText(t).width > maxW) { while (t.length > 1 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1); t += '…'; } }
      g.fillStyle = color; g.textAlign = align || 'left'; g.textBaseline = 'middle'; g.fillText(t, x, y);
    };
    var hline = function (y, x0, x1) { rect(x0 == null ? 0 : x0, y, (x1 == null ? W : x1) - (x0 == null ? 0 : x0), 1.5, T.grid); };
    var vline = function (x, y0, y1) { rect(x, y0, 1.5, y1 - y0, T.grid); };

    // paper
    rect(0, 0, W, H, T.paper);
    // header
    rect(0, 0, W, headH, T.main);
    var name = firm.name || model.fallbackTitle || 'MurgaMandi Hisab';
    var hasLogo = imgs && imgs.logo;
    if (firm.phone) text(firm.phone, W / 2, 34, 26, T.hi, 700, 'center', 900);
    var nx = hasLogo ? 580 : W / 2, nw = hasLogo ? 760 : 940;
    text(name, nx, 108, 84, '#FFFFFF', 800, 'center', nw);
    if (hasLogo) {
      var L = imgs.logo, cx = 92, cy = 112, r = 62;
      g.save(); g.beginPath(); g.arc(cx, cy, r + 4, 0, Math.PI * 2); g.fillStyle = '#FFFFFF'; g.fill();
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
      var sc = Math.max((2 * r) / L.width, (2 * r) / L.height) , dw = L.width * sc, dh = L.height * sc;
      if (L.width / L.height > 1.6 || L.height / L.width > 1.6) { sc = Math.min((2 * r) / L.width, (2 * r) / L.height); dw = L.width * sc; dh = L.height * sc; }
      g.drawImage(L, cx - dw / 2, cy - dh / 2, dw, dh); g.restore();
    }
    // shop line + date
    var dy = 168, dh2 = 52;
    text(firm.shop || '', 290, dy + dh2 / 2, 26, T.hi, 700, 'center', 540);
    rect(COL[3] + 20, dy, 180, dh2, T.light); text('Date', COL[3] + 110, dy + dh2 / 2, 28, '#3B1F0E', 700, 'center');
    rect(COL[4] + 22, dy, W - COL[4] - 22, dh2, T.paper); text(shortDate(model.date), (COL[4] + 22 + W) / 2, dy + dh2 / 2, 28, '#2B1B0E', 700, 'center', 240);
    // address band
    rect(0, dy + dh2 + 2, W, headH - dy - dh2 - 2, T.main); hline(dy + dh2 + 1);
    text(firm.address || '', W / 2, (dy + dh2 + headH) / 2 + 1, 27, T.hi, 700, 'center', 940);
    // name row
    rect(0, nameY, COL[1], 54, T.light); text('Name', COL[1] / 2, nameY + 27, 26, '#3B1F0E', 700, 'center');
    rect(COL[1] + 2, nameY, W - COL[1] - 2, 54, '#E5E7EB'); text(model.name || 'Customer', (COL[1] + W) / 2, nameY + 27, 32, '#2B1B0E', 700, 'center', 820);
    // table head
    rect(0, thY, W, RH, T.head);
    ['Qty', 'Weight', 'Particulars', 'Rate', 'Amount'].forEach(function (h, i) { text(h, (COL[i] + COL[i + 1]) / 2, thY + RH / 2, 26, '#FFFFFF', 700, 'center'); });
    // body rows
    for (var i = 0; i < nRows; i++) {
      var y = bodyY + i * RH, r0 = rows[i];
      if (r0) {
        text(r0.qty, COL[1] / 2, y + RH / 2, 25, '#2B1B0E', 700, 'center', 105);
        text(r0.weight, (COL[1] + COL[2]) / 2, y + RH / 2, 25, '#2B1B0E', 700, 'center', 125);
        text(r0.part, COL[2] + 12, y + (r0.partNote ? RH / 2 - 7 : RH / 2), 25, '#2B1B0E', 600, 'left', 296);
        if (r0.partNote) text(r0.partNote, COL[2] + 12, y + RH - 11, 13, '#6B4F3A', 400, 'left', 296);
        text(r0.rate, (COL[3] + COL[4]) / 2, y + RH / 2, 25, '#2B1B0E', 700, 'center', 165);
        text(r0.amount, W - 12, y + (r0.note ? RH / 2 - 6 : RH / 2), 25, '#2B1B0E', 700, 'right', 250);
        if (r0.note) text(r0.note, W - 12, y + RH - 10, 12, '#6B4F3A', 400, 'right', 250);
      }
      hline(y + RH);
    }
    // total row
    var t0 = model.total || {};
    rect(0, totY, W, RH, T.light);
    rect(COL[3], totY, COL[4] - COL[3], RH, T.paper);
    text(t0.qty, 10, totY + RH / 2, 25, '#2B1B0E', 700, 'left', 100);
    text(t0.weight, COL[1] + 10, totY + RH / 2, 25, '#2B1B0E', 700, 'left', 125);
    text('Total', COL[2] + 12, totY + RH / 2, 26, '#2B1B0E', 700, 'left');
    text(t0.amount, W - 12, totY + RH / 2, 26, '#2B1B0E', 700, 'right', 250);
    hline(totY + RH);
    // extras
    extras.forEach(function (e, k) {
      var y = exY + k * RH;
      if (e.hl) { rect(COL[2], y, COL[3] - COL[2], RH, T.light); rect(COL[4], y, W - COL[4], RH, T.light); }
      text(e.label, COL[2] + 12, y + RH / 2, 25, '#2B1B0E', 700, 'left', 296);
      if (e.mid) text(e.mid, (COL[3] + COL[4]) / 2, y + RH / 2, 13, '#4B3A2E', 400, 'center', 165);
      text(e.value, W - 12, y + RH / 2, 25, '#2B1B0E', 700, 'right', 250);
      hline(y + RH, COL[2]);
    });
    // grand total
    var gr = model.grand || { label: 'G. TOTAL', value: '' };
    rect(COL[2], grandY, COL[3] - COL[2], RH, T.main); rect(COL[4], grandY, W - COL[4], RH, T.main);
    text(gr.label, COL[2] + 12, grandY + RH / 2, 26, '#FFFFFF', 800, 'left', 296);
    text(gr.value, W - 12, grandY + RH / 2, 27, T.hi, 800, 'right', 250);
    // grid verticals
    vline(COL[1], nameY, totY + RH); vline(COL[2], thY, footY); vline(COL[3], thY, footY); vline(COL[4], thY, footY);
    hline(footY);
    // footer: words + stamp
    rect(0, footY + 1.5, W, H - footY - 1.5, mix(T.paper, '#FFFFFF', 0.4));
    text(model.words || '', 14, footY + 26, 17, '#3B2A1E', 400, 'left', 700, true);
    if (imgs && imgs.stamp) { var st = imgs.stamp, sh = 104, sw = st.width * sh / st.height; if (sw > 200) { sw = 200; sh = st.height * sw / st.width; } g.globalAlpha = 0.92; g.drawImage(st, W - sw - 30, footY + 8, sw, sh); g.globalAlpha = 1; }
    // outer border
    g.strokeStyle = T.main; g.lineWidth = 4; g.strokeRect(2, 2, W - 4, H - 4);
    return cv;
  }
  /** draw after the firm's logo and stamp pictures have loaded. cb(canvas|null) */
  function render(model, cb) {
    var f = model.firm || {};
    loadImg(f.logo, function (logo) { loadImg(f.stamp, function (stamp) { var cv = null; try { cv = draw(model, { logo: logo, stamp: stamp }); } catch (e) { if (root.console) root.console.error(e); } cb(cv); }); });
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
        var acts = el('div', 'bp-acts'), ed = el('button', 'btn', 'Edit'), rm = el('button', 'btn danger', 'Remove firm');
        ed.type = rm.type = 'button'; ed.onclick = function () { showForm(f); };
        rm.onclick = function () { o.confirm('Firm details hatayein?', f.name + ' ki details (naam, phone, address, logo) is phone se hat jayengi. Saved bills nahi hatenge.', 'Remove', function () { removeFirm(); showView(); o.onChange && o.onChange(); o.toast && o.toast('Firm details hata di'); }); };
        acts.appendChild(ed); acts.appendChild(rm); view.appendChild(acts);
        view.appendChild(el('p', 'bp-note', 'Ye details save hain. Har bill par apne aap aayengi jab tak aap Remove na karein.'));
      } else {
        view.appendChild(el('p', 'bp-note', 'Firm ka naam, phone aur address ek baar save karein. Har bill par apne aap aayega.'));
        var add = el('button', 'btn primary', '+ Firm details add karein'); add.type = 'button'; add.onclick = function () { showForm(null); };
        view.appendChild(add);
      }
    }
    function showForm(f) {
      draft = f ? JSON.parse(JSON.stringify(f)) : { name: '', phone: '', shop: '', address: '', logo: '', stamp: '' };
      view.hidden = true; form.hidden = false; form.textContent = '';
      form.appendChild(el('h3', null, f ? 'Firm details badlein' : 'Firm details add karein'));
      var grid = el('div', 'bp-grid');
      grid.appendChild(field('Firm / Dukaan ka naam *', 'name', 80, 'jaise SB FOOD'));
      grid.appendChild(field('Upar wali line (phone)', 'phone', 90, 'jaise NUNTUN: 8178357317'));
      grid.appendChild(field('Shop line', 'shop', 90, 'jaise Shop No. 48'));
      grid.appendChild(field('Address', 'address', 120, 'jaise Poultry Market Ghazipur Delhi 110096'));
      form.appendChild(grid);
      var pics = el('div', 'bp-pics'); pics.appendChild(picField('Logo (optional)', 'logo')); pics.appendChild(picField('Stamp / Mohar (optional)', 'stamp')); form.appendChild(pics);
      var err = el('p', 's-err bp-err'); form.appendChild(err);
      var acts = el('div', 'bp-acts'), cancel = el('button', 'btn', 'Cancel'), save = el('button', 'btn primary', 'Save firm');
      cancel.type = save.type = 'button';
      cancel.onclick = showView;
      save.onclick = function () {
        if (!clean(draft.name)) { err.textContent = 'Firm ka naam bhariye'; return; }
        if (!saveFirm(draft)) { err.textContent = 'Save nahi ho paya (storage full ya band). Logo/stamp hata kar dobara try karein.'; return; }
        showView(); o.onChange && o.onChange(); o.toast && o.toast('Firm details save ho gayi');
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
