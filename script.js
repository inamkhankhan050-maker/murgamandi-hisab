/* ============================================================
   MurgaMandi Hisab · home page
   Today's date, today-at-a-glance figures (read only) and the
   backup download / restore. Each section runs on its own page.
   ============================================================ */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var D = window.MMHData, U = D && D.util;
  var toastT;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 3000); }
  function confirmDlg(title, text, yes, onYes) {
    $('dlgT').textContent = title; $('dlgP').textContent = text; $('dlgYes').textContent = yes;
    var d = $('dlg'); d.classList.add('show'); $('dlgNo').focus();
    var close = function () { d.classList.remove('show'); $('dlgYes').onclick = $('dlgNo').onclick = null; };
    $('dlgNo').onclick = close; $('dlgYes').onclick = function () { close(); onYes(); };
  }

  function glance() {
    if (!D) return;
    var today = U.todayISO(), f = { from: today, to: today };
    var bills = D.listBills(f), pays = D.listPayments(f), exps = D.listExpenses(f);
    var amt = 0, cash = 0, onl = 0, ex = 0;
    bills.forEach(function (b) { amt += b.amount; cash += b.cash; onl += b.online; });
    pays.forEach(function (p) { cash += p.cash; onl += p.online; });
    exps.forEach(function (e) { ex += e.amount; });
    var c = D.counts();
    $('gBills').textContent = U.money(amt); $('gBillsN').textContent = bills.length + ' bill' + (bills.length === 1 ? '' : 's') + ' saved today';
    $('gRec').textContent = U.money(cash + onl); $('gRecSplit').textContent = 'Cash ' + U.money(cash) + ' · Online ' + U.money(onl);
    $('gExp').textContent = U.money(ex); $('gExpN').textContent = exps.length + ' expense' + (exps.length === 1 ? '' : 's');
    $('gRecords').textContent = String(c.bills + c.payments + c.expenses); $('gCust').textContent = c.customers + ' customer' + (c.customers === 1 ? '' : 's');
    var last = D.getSetting('lastBackupAt');
    $('bkLast').textContent = last ? 'Last backup downloaded: ' + new Date(last).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No backup downloaded yet from this device.';
  }
  function showStatus() {
    var n = $('dbNotice');
    if (!D) { n.hidden = false; n.textContent = 'Records could not be loaded in this window. Billing pages still work.'; return; }
    var s = D.status();
    if (!D.available()) { n.hidden = false; n.textContent = 'Browser storage is not available here (private window?). Records will not be saved.'; }
    else if (s.corrupt) { n.hidden = false; n.textContent = s.message; }
    else n.hidden = true;
  }

  function backup() {
    if (!D) return;
    try {
      var data = D.exportBackup();
      var name = 'murgamandi-hisab-backup-' + U.todayISO() + '.json';
      var blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
      D.setSetting('lastBackupAt', new Date().toISOString());
      glance(); toast('Backup downloaded: ' + name);
    } catch (e) { toast('Backup could not be created: ' + e.message); }
  }
  function restore(file) {
    if (!D || !file) return;
    if (file.size > 25 * 1024 * 1024) { toast('This file is too large to be a backup.'); return; }
    var rd = new FileReader();
    rd.onerror = function () { toast('Could not read the file.'); };
    rd.onload = function () {
      var obj = null;
      try { obj = JSON.parse(String(rd.result)); } catch (e) { obj = null; }
      var v = D.validateBackup(obj);
      if (!v.ok) { toast('Not restored: ' + v.errors[0]); return; }
      var c = v.counts, cur = D.counts();
      var msg = 'Backup' + (v.exportedAt ? ' from ' + new Date(v.exportedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '') + ' contains:\n' +
        c.bills + ' bills, ' + c.payments + ' payments, ' + c.expenses + ' expenses, ' + c.customers + ' customers' + (c.sheets ? ', ' + c.sheets + ' working sheets' : '') + '.' +
        (v.dropped ? '\n' + v.dropped + ' damaged entr' + (v.dropped === 1 ? 'y' : 'ies') + ' will be skipped.' : '') +
        '\n\nThis REPLACES everything now on this device (' + cur.bills + ' bills, ' + cur.payments + ' payments, ' + cur.expenses + ' expenses). Download a backup of the current data first if you may need it.';
      confirmDlg('Restore this backup?', msg, 'Replace my data', function () {
        var r = D.restoreBackup(obj);
        if (r.ok) { showStatus(); glance(); toast('Backup restored: ' + r.counts.bills + ' bills, ' + r.counts.expenses + ' expenses'); }
        else toast('Not restored: ' + r.errors[0]);
      });
    };
    rd.readAsText(file);
  }

  function init() {
    $('today').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    showStatus();
    if (!D) { $('glance').hidden = true; $('btnBackup').disabled = true; return; }
    glance();
    $('btnBackup').onclick = backup;
    $('restoreFile').addEventListener('change', function (e) { var f = e.target.files && e.target.files[0]; restore(f); e.target.value = ''; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('dlg').classList.remove('show'); });
    window.addEventListener('storage', function () { showStatus(); glance(); });
    window.addEventListener('pageshow', function (e) { if (e.persisted) glance(); });
  }
  try { init(); } catch (e) { toast('Something went wrong: ' + e.message); if (window.console) console.error(e); }
  window.__home = { glance: glance, restore: restore };
})();
