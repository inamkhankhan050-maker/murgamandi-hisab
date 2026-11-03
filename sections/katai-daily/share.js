/* ============================================================
   Katai share / PDF helper (this section only).
   Draws a bill on a canvas, wraps it into a one-page PDF with no
   libraries, then opens the phone's share sheet (WhatsApp) or
   downloads the file and opens WhatsApp as a fallback.
   ============================================================ */
(function (root, NS) {
  'use strict';
  var F = '"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif';
  var BRAND = '#7C2D12';
  var toast = function () {};
  var pending = null;
  function $(id) { return document.getElementById(id); }

  /* spec: {heading, sub, title, date, cols:[{h,w,r,b}], rows:[[...]], bold:[i], sum:[[label, value, color, big]]} */
  function billCanvas(spec) {
    var W = 0; spec.cols.forEach(function (c) { W += c.w; }); var P = 40; W += 2 * P;
    var S = 2, RH = 44;
    var H = 200 + (spec.sub ? 36 : 0) + (spec.customer ? 44 : 0) + 56 + spec.rows.length * RH + (spec.sum ? spec.sum.length * 46 + 40 : 0) + 90;
    var cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S;
    var g = cv.getContext('2d'); g.scale(S, S); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    var txt = function (t, x, y, size, color, weight, align, maxW) {
      g.font = (weight || 400) + ' ' + size + 'px ' + F; g.fillStyle = color || '#111'; g.textAlign = align || 'left';
      t = String(t); if (maxW) { while (t.length > 1 && g.measureText(t).width > maxW) t = t.slice(0, -2) + '…'; }
      g.fillText(t, x, y);
    };
    var y = 70;
    txt(spec.heading, P, y, 36, BRAND, 700, 'left', W - 2 * P - 220); txt(spec.date, W - P, y, 22, '#444', 400, 'right');
    if (spec.sub) { y += 36; txt(spec.sub, P, y, 22, '#444', 600); }
    y += 30; txt(spec.title.toUpperCase(), P, y, 17, '#666', 600);
    y += 16; g.fillStyle = BRAND; g.fillRect(P, y, W - 2 * P, 4);
    if (spec.customer) { y += 44; txt(spec.customer, P, y, 28, '#111', 700, 'left', W - 2 * P); }
    y += 20; g.fillStyle = '#F6F1EE'; g.fillRect(P, y, W - 2 * P, 44);
    var x = P; spec.cols.forEach(function (c) { txt(c.h, c.r ? x + c.w - 10 : x + 10, y + 29, 16, '#334', 700, c.r ? 'right' : 'left'); x += c.w; });
    y += 44;
    spec.rows.forEach(function (row, i) {
      var b = spec.bold && spec.bold.indexOf(i) >= 0;
      if (b) { g.fillStyle = '#FBEDE6'; g.fillRect(P, y, W - 2 * P, RH); }
      x = P; spec.cols.forEach(function (c, j) { var v = row[j] == null ? '' : row[j]; txt(v, c.r ? x + c.w - 10 : x + 10, y + 29, 20, '#111', b || c.b ? 700 : 400, c.r ? 'right' : 'left', c.w - 16); x += c.w; });
      y += RH; g.fillStyle = '#E3E3E3'; g.fillRect(P, y - 1, W - 2 * P, 1);
    });
    if (spec.sum) {
      y += 24;
      spec.sum.forEach(function (sm) { y += 40; var big = sm[3]; txt(sm[0], W - P - 240, y, big ? 26 : 21, sm[2] || '#222', big ? 700 : 500, 'right'); txt(sm[1], W - P, y, big ? 28 : 21, sm[2] || '#111', 700, 'right'); y += 6; });
    }
    y += 50; txt('Dhanyavaad · ' + spec.heading, W / 2, y, 17, '#777', 400, 'center');
    return cv;
  }

  function jpegPdf(dataUrl, pw, ph) {
    var bin = atob(dataUrl.split(',')[1]), img = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) img[i] = bin.charCodeAt(i);
    var PW = Math.max(595.28, Math.round(pw / 2 * 0.46)), PH = Math.round(PW * ph / pw * 100) / 100;
    var content = 'q ' + PW + ' 0 0 ' + PH + ' 0 0 cm /Im0 Do Q';
    var parts = [], off = [], len = 0;
    var add = function (x) { if (typeof x === 'string') { var b = new Uint8Array(x.length); for (var j = 0; j < x.length; j++) b[j] = x.charCodeAt(j) & 255; x = b; } parts.push(x); len += x.length; };
    add('%PDF-1.4\n');
    var obj = function (n, body) { off[n] = len; add(n + ' 0 obj\n'); body(); add('\nendobj\n'); };
    obj(1, function () { add('<< /Type /Catalog /Pages 2 0 R >>'); });
    obj(2, function () { add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'); });
    obj(3, function () { add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'); });
    obj(4, function () { add('<< /Type /XObject /Subtype /Image /Width ' + pw + ' /Height ' + ph + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + img.length + ' >>\nstream\n'); add(img); add('\nendstream'); });
    obj(5, function () { add('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream'); });
    var xref = len, x = 'xref\n0 6\n0000000000 65535 f \n';
    for (var k = 1; k <= 5; k++) x += ('0000000000' + off[k]).slice(-10) + ' 00000 n \n';
    add(x + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF');
    return new Blob(parts, { type: 'application/pdf' });
  }

  function sendFile(blob, fname, msg, mime) {
    var file = null; try { file = new File([blob], fname, { type: mime }); } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], text: msg }).catch(function (e) { if (e && e.name !== 'AbortError') fallback(); });
      return;
    }
    fallback();
    function fallback() {
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
      try { window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank', 'noopener'); } catch (e) {}
      toast((mime === 'application/pdf' ? 'PDF' : 'Photo') + ' download ho gayi. WhatsApp mein 📎 se attach karke bhejiye');
    }
  }
  function share(cv, base, msg) {
    pending = { cv: cv, base: String(base).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'Katai-Bill', msg: msg };
    $('shareDlg').classList.add('show');
  }
  function close() { $('shareDlg').classList.remove('show'); }
  function doShare(kind) {
    var p = pending; close(); if (!p) return; pending = null;
    try {
      var url = p.cv.toDataURL('image/jpeg', 0.92);
      if (kind === 'pdf') sendFile(jpegPdf(url, p.cv.width, p.cv.height), p.base + '.pdf', p.msg, 'application/pdf');
      else {
        var bin = atob(url.split(',')[1]), u = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        sendFile(new Blob([u], { type: 'image/jpeg' }), p.base + '.jpg', p.msg, 'image/jpeg');
      }
    } catch (e) { toast('PDF nahi ban paya. Print / Save PDF use kijiye.'); }
  }
  function init(toastFn) {
    toast = toastFn || toast;
    $('shPdf').onclick = function () { doShare('pdf'); };
    $('shImg').onclick = function () { doShare('img'); };
    $('shNo').onclick = function () { pending = null; close(); };
    $('shareDlg').addEventListener('click', function (e) { if (e.target === $('shareDlg')) { pending = null; close(); } });
  }
  root[NS] = { init: init, share: share, billCanvas: billCanvas };
})(window, 'KataiDailyShare');
