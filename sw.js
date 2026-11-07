/* MurgaMandi Hisab offline app. Network first, cache fallback. */
var CACHE = 'mmh-app-20261107k';
var FILES = ["./", "./assets/icons/backup.svg", "./assets/icons/expenses.svg", "./assets/icons/katai-bill-256.png", "./assets/icons/katai-daily.svg", "./assets/icons/katai-single.svg", "./assets/icons/logo-192.png", "./assets/icons/logo-32.png", "./assets/icons/logo-512.png", "./assets/icons/logo-64.png", "./assets/icons/logo.svg", "./assets/icons/statements.svg", "./assets/icons/whatsapp-green.svg", "./assets/icons/whatsapp.svg", "./assets/icons/zinda-bill-256.png", "./assets/icons/zinda-daily.svg", "./assets/icons/zinda-single.svg", "./assets/images/.gitkeep", "./assets/images/banner-1600.jpg", "./assets/images/banner-900.jpg", "./assets/images/banner-wide1-1200.jpg", "./assets/images/banner-wide1-2000.jpg", "./assets/images/banner-wide2-1200.jpg", "./assets/images/banner-wide2-2000.jpg", "./assets/images/banner2-1600.jpg", "./assets/images/banner2-900.jpg", "./assets/vendor/pdfjs/pdf.min.js", "./assets/vendor/pdfjs/pdf.worker.min.js", "./engines/katai/calc.js", "./engines/katai/share.js", "./engines/zinda/calc.js", "./engines/zinda/keypad.js", "./engines/zinda/share.js", "./index.html", "./script.js", "./sections/expenses/expense-calc.js", "./sections/expenses/index.html", "./sections/expenses/script.js", "./sections/expenses/style.css", "./sections/katai-daily/index.html", "./sections/katai-daily/script.js", "./sections/katai-daily/style.css", "./sections/katai-single/index.html", "./sections/katai-single/script.js", "./sections/katai-single/style.css", "./sections/statements/index.html", "./sections/statements/reports.js", "./sections/statements/script.js", "./sections/statements/style.css", "./sections/zinda-daily/index.html", "./sections/zinda-daily/script.js", "./sections/zinda-daily/style.css", "./sections/zinda-single/index.html", "./sections/zinda-single/script.js", "./sections/zinda-single/style.css", "./shared/balance-book.css", "./shared/balance-book.js", "./shared/bill-print.css", "./shared/bill-print.js", "./shared/data-service.js", "./shared/export-service.js", "./shared/print.css", "./shared/storage-service.js", "./style.css", "./manifest.webmanifest", "./sections/expenses/", "./sections/katai-daily/", "./sections/katai-single/", "./sections/statements/", "./sections/zinda-daily/", "./sections/zinda-single/"];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return Promise.all(FILES.map(function (u) { return c.add(u).catch(function () {}); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(function (res) {
    if (res && res.ok) { var cp = res.clone(); caches.open(CACHE).then(function (c) { c.put(r, cp); }); }
    return res;
  }).catch(function () {
    return caches.match(r, { ignoreSearch: true }).then(function (m) {
      return m || (r.mode === 'navigate' ? caches.match(new URL('index.html', r.url).href, { ignoreSearch: true }).then(function (x) { return x || caches.match('./index.html'); }) : Response.error());
    });
  }));
});
