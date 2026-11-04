/* ============================================================
   MurgaMandi Hisab · shared data service
   Structured records on top of storage-service.js. Used by every
   section that saves or reads business records. It holds NO billing
   formulas: bill amounts arrive already calculated by the Zinda or
   Katai engine of the section that saved them.

   Record shapes (all money is integer paise, dates YYYY-MM-DD):
     customer { id, name, key, createdAt }
     bill     { id, seq, section:'zinda'|'katai', source, sourceKey,
                date, customerId, customerName, firm, amount, cash,
                online, prevBalance, balance, lines[], details{},
                inputs{}, note, createdAt, updatedAt }
     payment  { id, seq, section, source, sourceKey, date, customerId,
                customerName, firm, cash, online, prevBalance,
                balance, note, createdAt, updatedAt }
     expense  { id, seq, date, categoryId, description, amount, mode:
                'cash'|'online', paidTo, notes, createdAt, updatedAt }
     category { id, name, custom:true, createdAt }   (custom only)
   ============================================================ */
(function (root) {
  'use strict';

  var DEFAULT_CATEGORIES = [
    { id: 'truck', name: 'Truck Charges' }, { id: 'labour', name: 'Labour Charges' },
    { id: 'food', name: 'Food / Nashta / Khana' }, { id: 'loading', name: 'Loading Charges' },
    { id: 'unloading', name: 'Unloading Charges' }, { id: 'transport', name: 'Transportation' },
    { id: 'fuel', name: 'Fuel / Diesel' }, { id: 'shop', name: 'Shop Expenses' }, { id: 'other', name: 'Other Expenses' }
  ];
  var SECTIONS = { zinda: 'Zinda', katai: 'Katai' };
  var SOURCES = { 'zinda-single': 'Zinda Single Bill', 'zinda-daily': 'Zinda Daily Entry', 'katai-single': 'Katai Single Bill', 'katai-daily': 'Katai Daily Entry' };
  var MODES = { cash: 'Cash', online: 'Online' };
  var MAX_MONEY = 1e13;
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // ---------- small helpers (pure) ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayISO(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function isISODate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var p = s.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.getFullYear() === +p[0] && d.getMonth() === +p[1] - 1 && d.getDate() === +p[2];
  }
  function isInt(n) { return typeof n === 'number' && Number.isSafeInteger(n); }
  function isMoney(n) { return isInt(n) && n >= 0 && n <= MAX_MONEY; }
  function clean(s, max) { return typeof s === 'string' ? s.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 80) : ''; }
  function normName(s) { return clean(s, 80).toLowerCase(); }
  function uid(p) { return (p || 'x') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  /** "1,234.5" -> 123450 paise. '' -> null. negative / letters / >2 decimals -> NaN. */
  function parseMoney(input) {
    if (input === null || input === undefined) return null;
    var s = String(input).trim().replace(/,/g, '');
    if (s === '') return null;
    if (!/^\d*\.?\d*$/.test(s) || s === '.') return NaN;
    var parts = s.split('.'), frac = parts[1] || '';
    if (frac.length > 2) return NaN;
    while (frac.length < 2) frac += '0';
    var n = parseInt(parts[0] || '0', 10) * 100 + parseInt(frac, 10);
    return isInt(n) && n <= MAX_MONEY ? n : NaN;
  }
  function group(intStr) { return intStr.length <= 3 ? intStr : intStr.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + intStr.slice(-3); }
  /** ₹ text in Indian grouping; paise shown only when non-zero (or always with opts.dec). */
  function money(paise, dec) {
    if (paise === null || paise === undefined || isNaN(paise)) return '—';
    var neg = paise < 0, p = Math.abs(paise), r = Math.floor(p / 100), ps = p % 100;
    return (neg ? '−' : '') + '₹' + group(String(r)) + (ps || dec ? '.' + pad(ps) : '');
  }
  function balanceText(paise) { return paise == null ? '—' : paise < 0 ? 'Adv ' + money(-paise) : money(paise); }
  function plain(paise) { var neg = paise < 0, p = Math.abs(paise); return (neg ? '-' : '') + Math.floor(p / 100) + '.' + pad(p % 100); }
  function dateText(iso) {
    if (!isISODate(iso)) return '';
    var p = iso.split('-'); return +p[2] + ' ' + MONTHS[+p[1] - 1].slice(0, 3) + ' ' + p[0];
  }
  function monthText(ym) { var p = String(ym).split('-'); return MONTHS[+p[1] - 1] ? MONTHS[+p[1] - 1] + ' ' + p[0] : String(ym); }
  function lastDay(y, m) { return new Date(y, m, 0).getDate(); }
  /** kind: day | month | year | range | all.  Returns {kind, from, to, label}. */
  function period(kind, v) {
    v = v || {};
    if (kind === 'day') { var d = isISODate(v.date) ? v.date : todayISO(); return { kind: kind, from: d, to: d, label: dateText(d) }; }
    if (kind === 'month') {
      var m = /^\d{4}-\d{2}$/.test(v.month) ? v.month : todayISO().slice(0, 7), y = +m.slice(0, 4), mo = +m.slice(5, 7);
      return { kind: kind, from: m + '-01', to: m + '-' + pad(lastDay(y, mo)), label: monthText(m) };
    }
    if (kind === 'year') { var yr = /^\d{4}$/.test(String(v.year)) ? String(v.year) : todayISO().slice(0, 4); return { kind: kind, from: yr + '-01-01', to: yr + '-12-31', label: 'Year ' + yr }; }
    if (kind === 'range') {
      var f = isISODate(v.from) ? v.from : null, t = isISODate(v.to) ? v.to : null;
      if (f && t && f > t) { var x = f; f = t; t = x; }
      return { kind: kind, from: f, to: t, label: f && t ? dateText(f) + ' – ' + dateText(t) : f ? 'From ' + dateText(f) : t ? 'Up to ' + dateText(t) : 'All dates' };
    }
    return { kind: 'all', from: null, to: null, label: 'All dates' };
  }
  function inPeriod(date, p) { return !!p && (!p.from || date >= p.from) && (!p.to || date <= p.to); }
  function byDateSeq(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.seq || 0) - (b.seq || 0); }

  // ---------- record validation (used on save, load and restore) ----------
  function validBill(r) {
    return r && typeof r.id === 'string' && SECTIONS[r.section] && isISODate(r.date) && typeof r.customerId === 'string' && clean(r.customerName) !== '' &&
      isMoney(r.amount) && isMoney(r.cash) && isMoney(r.online) && isInt(r.prevBalance) && isInt(r.balance);
  }
  function validPayment(r) {
    return r && typeof r.id === 'string' && SECTIONS[r.section] && isISODate(r.date) && typeof r.customerId === 'string' && clean(r.customerName) !== '' &&
      isMoney(r.cash) && isMoney(r.online) && (r.cash + r.online) > 0 && isInt(r.prevBalance) && isInt(r.balance);
  }
  function validExpense(r) {
    return r && typeof r.id === 'string' && isISODate(r.date) && typeof r.categoryId === 'string' && clean(r.description, 200) !== '' && isMoney(r.amount) && r.amount > 0 && MODES[r.mode];
  }
  function validCustomer(r) { return r && typeof r.id === 'string' && clean(r.name) !== ''; }
  function validCategory(r) { return r && typeof r.id === 'string' && clean(r.name, 60) !== ''; }
  function sanitizeDb(db) {
    var dropped = 0;
    var keep = function (arr, fn) { var out = []; (Array.isArray(arr) ? arr : []).forEach(function (r) { if (fn(r)) out.push(r); else dropped++; }); return out; };
    db.customers = keep(db.customers, validCustomer);
    db.bills = keep(db.bills, validBill);
    db.payments = keep(db.payments, validPayment);
    db.expenses = keep(db.expenses, validExpense);
    db.categories = keep(db.categories, validCategory);
    var ids = {}; db.customers.forEach(function (c) { ids[c.id] = 1; });
    db.bills.concat(db.payments).forEach(function (r) { if (!ids[r.customerId]) { db.customers.push({ id: r.customerId, name: clean(r.customerName), key: normName(r.customerName), createdAt: r.createdAt || new Date().toISOString() }); ids[r.customerId] = 1; } });
    var mx = 0; db.bills.concat(db.payments, db.expenses).forEach(function (r) { if (isInt(r.seq) && r.seq > mx) mx = r.seq; });
    db.settings = db.settings && typeof db.settings === 'object' ? db.settings : {};
    if (!isInt(db.settings.seq) || db.settings.seq < mx) db.settings.seq = mx;
    return dropped;
  }

  function create(S) {
    var lastError = '';
    function load() { var db = S.loadDb(); sanitizeDb(db); return db; }
    function commit(db) { var ok = S.saveDb(db); lastError = ok ? '' : (S.available() ? 'Could not save (storage full or damaged data).' : 'Browser storage is not available.'); return ok; }
    function nextSeq(db) { db.settings.seq = (db.settings.seq || 0) + 1; return db.settings.seq; }
    var now = function () { return new Date().toISOString(); };

    // ---------- customers ----------
    function ensureCustomer(db, name) {
      var key = normName(name); if (!key) return null;
      for (var i = 0; i < db.customers.length; i++) if ((db.customers[i].key || normName(db.customers[i].name)) === key) return db.customers[i];
      var c = { id: uid('c'), name: clean(name), key: key, createdAt: now() }; db.customers.push(c); return c;
    }
    function listCustomers() { return load().customers.slice().sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; }); }
    function findCustomerByName(name) { var key = normName(name), cs = load().customers; for (var i = 0; i < cs.length; i++) if ((cs[i].key || normName(cs[i].name)) === key) return cs[i]; return null; }

    // ---------- bills & payments ----------
    function buildBill(input, existing, db) {
      var name = clean(input.customerName);
      if (!name) return { error: 'Customer name is required to save a bill.' };
      if (!SECTIONS[input.section]) return { error: 'Unknown section.' };
      if (!isISODate(input.date)) return { error: 'Bill date is not valid.' };
      var nums = ['amount', 'cash', 'online'];
      for (var i = 0; i < nums.length; i++) if (!isMoney(input[nums[i]])) return { error: 'Amounts must be 0 or more.' };
      if (!isInt(input.prevBalance) || !isInt(input.balance)) return { error: 'Balance is not valid.' };
      var c = ensureCustomer(db, name);
      var r = existing || { id: uid('b'), seq: nextSeq(db), createdAt: now() };
      r.section = input.section; r.source = SOURCES[input.source] ? input.source : (existing && existing.source) || input.section + '-single';
      r.sourceKey = typeof input.sourceKey === 'string' ? input.sourceKey : (existing ? existing.sourceKey || null : null);
      r.date = input.date; r.customerId = c.id; r.customerName = name; r.firm = clean(input.firm);
      r.amount = input.amount; r.cash = input.cash; r.online = input.online; r.prevBalance = input.prevBalance; r.balance = input.balance;
      r.lines = Array.isArray(input.lines) ? input.lines : []; r.details = input.details && typeof input.details === 'object' ? input.details : {};
      r.inputs = input.inputs && typeof input.inputs === 'object' ? input.inputs : {}; r.note = clean(input.note, 200);
      r.updatedAt = now();
      return { record: r };
    }
    function buildPayment(input, existing, db) {
      var name = clean(input.customerName);
      if (!name) return { error: 'Customer name is required.' };
      if (!SECTIONS[input.section]) return { error: 'Unknown section.' };
      if (!isISODate(input.date)) return { error: 'Date is not valid.' };
      if (!isMoney(input.cash) || !isMoney(input.online) || input.cash + input.online <= 0) return { error: 'Enter a cash or online amount above 0.' };
      if (!isInt(input.prevBalance) || !isInt(input.balance)) return { error: 'Balance is not valid.' };
      var c = ensureCustomer(db, name);
      var r = existing || { id: uid('p'), seq: nextSeq(db), createdAt: now() };
      r.section = input.section; r.source = SOURCES[input.source] ? input.source : (existing && existing.source) || '';
      r.sourceKey = typeof input.sourceKey === 'string' ? input.sourceKey : (existing ? existing.sourceKey || null : null);
      r.date = input.date; r.customerId = c.id; r.customerName = name; r.firm = clean(input.firm);
      r.cash = input.cash; r.online = input.online; r.prevBalance = input.prevBalance; r.balance = input.balance; r.note = clean(input.note, 200);
      r.updatedAt = now();
      return { record: r };
    }
    function findIn(arr, fn) { for (var i = 0; i < arr.length; i++) if (fn(arr[i])) return arr[i]; return null; }
    function duplicatesOf(db, kind, rec, ignoreId) {
      var key = normName(rec.customerName);
      if (kind === 'bill') return db.bills.filter(function (b) { return b.id !== ignoreId && b.section === rec.section && b.date === rec.date && b.amount === rec.amount && normName(b.customerName) === key; });
      return db.payments.filter(function (p) { return p.id !== ignoreId && p.section === rec.section && p.date === rec.date && p.cash === rec.cash && p.online === rec.online && normName(p.customerName) === key; });
    }
    /** Create or update inside an open db (no commit). Updates when input.id or input.sourceKey matches an existing record (idempotent).
        A NEW record that matches customer+date+amount+section of another returns {ok:false, duplicates} unless opts.allowDuplicate. */
    function applyRecord(db, kind, input, opts) {
      opts = opts || {};
      var arr = kind === 'bill' ? db.bills : db.payments, other = kind === 'bill' ? db.payments : db.bills;
      var existing = input.id ? findIn(arr, function (r) { return r.id === input.id; }) : null;
      if (!existing && input.sourceKey) existing = findIn(arr, function (r) { return r.sourceKey === input.sourceKey; });
      if (input.id && !existing) return { ok: false, error: 'This saved record no longer exists (it may have been deleted).' };
      if (!existing && !opts.allowDuplicate) {
        var d = duplicatesOf(db, kind, input, null);
        if (d.length) return { ok: false, duplicates: d };
      }
      var built = (kind === 'bill' ? buildBill : buildPayment)(input, existing, db);
      if (built.error) return { ok: false, error: built.error };
      if (!existing) arr.push(built.record);
      // a daily row that changed from payment-only to bill (or back) must not leave its old twin behind
      if (input.sourceKey) for (var i = other.length - 1; i >= 0; i--) if (other[i].sourceKey === input.sourceKey) other.splice(i, 1);
      return { ok: true, record: built.record, created: !existing };
    }
    function saveRecord(kind, input, opts) {
      var db = load(), res = applyRecord(db, kind, input, opts);
      if (!res.ok) return res;
      if (!commit(db)) return { ok: false, error: lastError };
      return res;
    }
    /** Possible duplicates of a record that is not saved yet (same customer, date, amount/payment, section). */
    function findDuplicates(kind, input) {
      var db = load(), arr = kind === 'bill' ? db.bills : db.payments;
      if (input.id && findIn(arr, function (r) { return r.id === input.id; })) return [];
      if (input.sourceKey && findIn(arr, function (r) { return r.sourceKey === input.sourceKey; })) return [];
      return duplicatesOf(db, kind, input, null);
    }
    /** Many records in one write (daily sheets). items: [{kind:'bill'|'payment', input}]. */
    function saveBatch(items, opts) {
      var db = load(), out = { ok: true, created: 0, updated: 0, errors: [], duplicates: [], records: [] };
      items.forEach(function (it, i) {
        var r = applyRecord(db, it.kind, it.input, opts);
        if (r.ok) { out.records.push(r.record); if (r.created) out.created++; else out.updated++; }
        else if (r.duplicates) out.duplicates.push({ index: i, duplicates: r.duplicates });
        else out.errors.push({ index: i, error: r.error });
      });
      if (out.created + out.updated > 0 && !commit(db)) return { ok: false, error: lastError, created: 0, updated: 0, errors: [], duplicates: [], records: [] };
      return out;
    }
    function saveBill(input, opts) { return saveRecord('bill', input, opts); }
    function savePayment(input, opts) { return saveRecord('payment', input, opts); }
    /** Statements edit: date, customer, firm, cash, online, previous balance, note. Bill amount is never edited here.
        Remaining balance is re-worked with the same ledger rule both billing engines use: previous + bill − cash − online. */
    function updateRecord(kind, id, patch) {
      var db = load(), arr = kind === 'bill' ? db.bills : db.payments, r = findIn(arr, function (x) { return x.id === id; });
      if (!r) return { ok: false, error: 'Record not found.' };
      var input = {}; Object.keys(r).forEach(function (k) { input[k] = r[k]; });
      if (patch.date !== undefined) input.date = patch.date;
      if (patch.customerName !== undefined) input.customerName = patch.customerName;
      if (patch.firm !== undefined) input.firm = patch.firm;
      if (patch.note !== undefined) input.note = patch.note;
      ['cash', 'online', 'prevBalance'].forEach(function (k) { if (patch[k] !== undefined) input[k] = patch[k]; });
      input.balance = input.prevBalance + (kind === 'bill' ? input.amount : 0) - input.cash - input.online;
      var built = (kind === 'bill' ? buildBill : buildPayment)(input, r, db);
      if (built.error) return { ok: false, error: built.error };
      built.record.editedAt = now();
      if (!commit(db)) return { ok: false, error: lastError };
      return { ok: true, record: built.record };
    }
    function deleteRecord(kind, id) {
      var db = load(), arr = kind === 'bill' ? db.bills : db.payments, n = arr.length;
      for (var i = arr.length - 1; i >= 0; i--) if (arr[i].id === id) arr.splice(i, 1);
      if (arr.length === n) return false;
      return commit(db);
    }
    function deleteBySourceKey(key) {
      if (!key) return 0; var db = load(), n = 0;
      [db.bills, db.payments].forEach(function (arr) { for (var i = arr.length - 1; i >= 0; i--) if (arr[i].sourceKey === key) { arr.splice(i, 1); n++; } });
      if (n) commit(db); return n;
    }
    function recordBySourceKey(key) {
      var db = load(); return findIn(db.bills, function (r) { return r.sourceKey === key; }) || findIn(db.payments, function (r) { return r.sourceKey === key; });
    }
    function matchFilter(r, f) {
      f = f || {};
      if (f.from && r.date < f.from) return false;
      if (f.to && r.date > f.to) return false;
      if (f.section && f.section !== 'all' && r.section !== f.section) return false;
      if (f.source && r.source !== f.source) return false;
      if (f.customerId && r.customerId !== f.customerId) return false;
      if (f.firm !== undefined && f.firm !== null && f.firm !== '' && normName(r.firm) !== normName(f.firm)) return false;
      if (f.q) { var q = normName(f.q); if ((normName(r.customerName) + ' ' + normName(r.firm)).indexOf(q) < 0) return false; }
      return true;
    }
    function listBills(f) { return load().bills.filter(function (r) { return matchFilter(r, f); }).sort(byDateSeq); }
    function listPayments(f) { return load().payments.filter(function (r) { return matchFilter(r, f); }).sort(byDateSeq); }
    /** Bills and payments in one date-ordered list, each tagged kind:'bill'|'payment' (payments have amount 0). */
    function transactions(f, db) {
      db = db || load();
      var out = [];
      db.bills.forEach(function (r) { if (matchFilter(r, f)) out.push(tag(r, 'bill')); });
      db.payments.forEach(function (r) { if (matchFilter(r, f)) out.push(tag(r, 'payment')); });
      return out.sort(byDateSeq);
    }
    function tag(r, kind) { var o = {}; Object.keys(r).forEach(function (k) { o[k] = r[k]; }); o.kind = kind; if (kind === 'payment') o.amount = 0; return o; }
    /** Latest recorded remaining balance of a customer in one section, on or before a date (Pichla hint). */
    function lastBalance(customerName, section, opts) {
      opts = opts || {}; var key = normName(customerName); if (!key) return null;
      var list = transactions({ section: section }).filter(function (r) {
        return normName(r.customerName) === key && (!opts.onOrBefore || r.date <= opts.onOrBefore) && r.id !== opts.excludeId && (!opts.excludeSourceKey || r.sourceKey !== opts.excludeSourceKey);
      });
      var last = list[list.length - 1]; return last ? { balance: last.balance, date: last.date, id: last.id } : null;
    }
    function firms() {
      var seen = {}, out = [];
      transactions({}).forEach(function (r) { var k = normName(r.firm); if (k && !seen[k]) { seen[k] = 1; out.push(clean(r.firm)); } });
      return out.sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; });
    }

    // ---------- expenses ----------
    function categories(db) {
      db = db || load();
      return DEFAULT_CATEGORIES.map(function (c) { return { id: c.id, name: c.name, custom: false }; })
        .concat(db.categories.map(function (c) { return { id: c.id, name: clean(c.name, 60), custom: true }; }));
    }
    function categoryName(id, cats) { cats = cats || categories(); for (var i = 0; i < cats.length; i++) if (cats[i].id === id) return cats[i].name; return 'Unknown category'; }
    function addCategory(name) {
      var n = clean(name, 60); if (!n) return { ok: false, error: 'Category name is required.' };
      var db = load();
      if (categories(db).some(function (c) { return normName(c.name) === normName(n); })) return { ok: false, error: 'This category already exists.' };
      var c = { id: uid('cat'), name: n, custom: true, createdAt: now() }; db.categories.push(c);
      if (!commit(db)) return { ok: false, error: lastError };
      return { ok: true, category: c };
    }
    function deleteCategory(id) {
      var db = load();
      if (!db.categories.some(function (c) { return c.id === id; })) return { ok: false, error: 'Only custom categories can be removed.' };
      var used = db.expenses.filter(function (e) { return e.categoryId === id; }).length;
      if (used) return { ok: false, error: 'This category is used by ' + used + ' expense(s). Move or delete them first.' };
      db.categories = db.categories.filter(function (c) { return c.id !== id; });
      return commit(db) ? { ok: true } : { ok: false, error: lastError };
    }
    function saveExpense(input, opts) {
      opts = opts || {};
      var db = load();
      if (!isISODate(input.date)) return { ok: false, error: 'Expense date is not valid.' };
      if (!categories(db).some(function (c) { return c.id === input.categoryId; })) return { ok: false, error: 'Choose an expense category.' };
      var desc = clean(input.description, 200); if (!desc) return { ok: false, error: 'Description is required.' };
      if (!isMoney(input.amount) || input.amount <= 0) return { ok: false, error: 'Amount must be more than 0 (max 2 decimals).' };
      if (!MODES[input.mode]) return { ok: false, error: 'Choose Cash or Online.' };
      var existing = input.id ? findIn(db.expenses, function (e) { return e.id === input.id; }) : null;
      if (input.id && !existing) return { ok: false, error: 'This expense no longer exists.' };
      if (!existing && !opts.allowDuplicate) {
        var d = db.expenses.filter(function (e) { return e.date === input.date && e.categoryId === input.categoryId && e.amount === input.amount && normName(e.description) === normName(desc); });
        if (d.length) return { ok: false, duplicates: d };
      }
      var r = existing || { id: uid('e'), seq: nextSeq(db), createdAt: now() };
      r.date = input.date; r.categoryId = input.categoryId; r.description = desc; r.amount = input.amount; r.mode = input.mode;
      r.paidTo = clean(input.paidTo, 80); r.notes = clean(input.notes, 300); r.updatedAt = now();
      if (!existing) db.expenses.push(r);
      if (!commit(db)) return { ok: false, error: lastError };
      return { ok: true, record: r, created: !existing };
    }
    function deleteExpense(id) {
      var db = load(), n = db.expenses.length; db.expenses = db.expenses.filter(function (e) { return e.id !== id; });
      return n !== db.expenses.length && commit(db);
    }
    function listExpenses(f, db) {
      f = f || {}; db = db || load();
      var cats = categories(db), q = f.q ? normName(f.q) : '';
      return db.expenses.filter(function (e) {
        if (f.from && e.date < f.from) return false;
        if (f.to && e.date > f.to) return false;
        if (f.categoryId && f.categoryId !== 'all' && e.categoryId !== f.categoryId) return false;
        if (f.mode && f.mode !== 'all' && e.mode !== f.mode) return false;
        if (q && [e.description, e.paidTo, e.notes, categoryName(e.categoryId, cats)].map(normName).join(' ').indexOf(q) < 0) return false;
        return true;
      }).sort(byDateSeq);
    }
    function getExpense(id) { return findIn(load().expenses, function (e) { return e.id === id; }); }

    // ---------- settings ----------
    function getSetting(k) { var s = load().settings; return Object.prototype.hasOwnProperty.call(s, k) ? s[k] : null; }
    function setSetting(k, v) { var db = load(); if (v === null || v === undefined) delete db.settings[k]; else db.settings[k] = v; return commit(db); }

    // ---------- backup / restore ----------
    function exportBackup() {
      var sheets = {}; S.sheetKeys().forEach(function (k) { var v = S.getRaw(k); if (v != null) sheets[k] = v; });
      return { app: 'MurgaMandi Hisab', format: 'mmh-backup', version: 2, exportedAt: now(), db: load(), sheets: sheets };
    }
    function validateBackup(obj) {
      var errors = [];
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['File is not a MurgaMandi Hisab backup.'] };
      if (obj.format !== 'mmh-backup') errors.push('File is not a MurgaMandi Hisab backup.');
      if (!(obj.version >= 1 && obj.version <= 2)) errors.push('Unsupported backup version.');
      var d = obj.db;
      if (!d || typeof d !== 'object' || Array.isArray(d)) errors.push('Backup has no records section.');
      else ['customers', 'bills', 'payments', 'expenses', 'categories'].forEach(function (k) { if (d[k] !== undefined && !Array.isArray(d[k])) errors.push('Backup field "' + k + '" is damaged.'); });
      if (obj.sheets !== undefined && (typeof obj.sheets !== 'object' || Array.isArray(obj.sheets))) errors.push('Backup sheets are damaged.');
      if (errors.length) return { ok: false, errors: errors };
      var copy = JSON.parse(JSON.stringify(d)), db = S.emptyDb();
      ['customers', 'bills', 'payments', 'expenses', 'categories'].forEach(function (k) { db[k] = Array.isArray(copy[k]) ? copy[k] : []; });
      db.settings = copy.settings && typeof copy.settings === 'object' && !Array.isArray(copy.settings) ? copy.settings : {};
      db.createdAt = typeof copy.createdAt === 'string' ? copy.createdAt : db.createdAt;
      var dropped = sanitizeDb(db);
      var sheets = {};
      Object.keys(obj.sheets || {}).forEach(function (k) { if (/^mmh\.[\w.-]{1,60}$/.test(k) && k.indexOf('mmh.db.') !== 0 && typeof obj.sheets[k] === 'string') sheets[k] = obj.sheets[k]; });
      return { ok: true, errors: [], db: db, sheets: sheets, dropped: dropped, exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '',
        counts: { customers: db.customers.length, bills: db.bills.length, payments: db.payments.length, expenses: db.expenses.length, categories: db.categories.length, sheets: Object.keys(sheets).length } };
    }
    /** Replaces everything on this device with the backup. Call only after the user confirmed. */
    function restoreBackup(obj) {
      var v = validateBackup(obj); if (!v.ok) return v;
      if (!S.available()) return { ok: false, errors: ['Browser storage is not available.'] };
      S.sheetKeys().forEach(function (k) { S.remove(k); });
      Object.keys(v.sheets).forEach(function (k) { S.setRaw(k, v.sheets[k]); });
      S.remove(S.CORRUPT_KEY);
      var ok = S.setRaw(S.DB_KEY, JSON.stringify(v.db));
      if (!ok) return { ok: false, errors: ['Could not write to browser storage (it may be full).'] };
      S.loadDb();
      return { ok: true, errors: [], counts: v.counts, dropped: v.dropped };
    }
    function counts() { var db = load(); return { customers: db.customers.length, bills: db.bills.length, payments: db.payments.length, expenses: db.expenses.length }; }

    return {
      SECTIONS: SECTIONS, SOURCES: SOURCES, MODES: MODES, DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
      status: function () { S.loadDb(); return S.status(); }, available: function () { return S.available(); }, lastError: function () { return lastError; },
      load: load, counts: counts,
      listCustomers: listCustomers, findCustomerByName: findCustomerByName,
      saveBill: saveBill, savePayment: savePayment, saveBatch: saveBatch, findDuplicates: findDuplicates,
      updateBill: function (id, p) { return updateRecord('bill', id, p); }, updatePayment: function (id, p) { return updateRecord('payment', id, p); },
      deleteBill: function (id) { return deleteRecord('bill', id); }, deletePayment: function (id) { return deleteRecord('payment', id); },
      deleteBySourceKey: deleteBySourceKey, recordBySourceKey: recordBySourceKey,
      getBill: function (id) { return findIn(load().bills, function (r) { return r.id === id; }); },
      getPayment: function (id) { return findIn(load().payments, function (r) { return r.id === id; }); },
      listBills: listBills, listPayments: listPayments, transactions: transactions, lastBalance: lastBalance, firms: firms,
      categories: categories, categoryName: categoryName, addCategory: addCategory, deleteCategory: deleteCategory,
      saveExpense: saveExpense, deleteExpense: deleteExpense, listExpenses: listExpenses, getExpense: getExpense,
      getSetting: getSetting, setSetting: setSetting,
      exportBackup: exportBackup, validateBackup: validateBackup, restoreBackup: restoreBackup
    };
  }

  var util = { todayISO: todayISO, isISODate: isISODate, parseMoney: parseMoney, money: money, balanceText: balanceText, plain: plain,
    dateText: dateText, monthText: monthText, period: period, inPeriod: inPeriod, normName: normName, clean: clean, byDateSeq: byDateSeq, MONTHS: MONTHS };
  var api = { create: create, util: util };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    try {
      var inst = root.MMHStorage ? create(root.MMHStorage) : null;
      if (inst) { inst.util = util; inst.create = create; root.MMHData = inst; }
    } catch (e) { if (root.console) root.console.error('MMHData failed to start', e); }
  }
})(typeof window !== 'undefined' ? window : this);
