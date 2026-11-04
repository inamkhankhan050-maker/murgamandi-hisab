/* ============================================================
   MurgaMandi Hisab · shared storage service
   The only file that touches window.localStorage.
   - One versioned business database under DB_KEY (records used by
     Statements & Reports): customers, bills, payments, expenses,
     custom expense categories and settings.
   - Safe get/set helpers for each section's own working sheet keys
     (mmh.zindaDaily.v1, mmh.kataiSingle.v1 ... kept from v1).
   Nothing here throws: unavailable or corrupt storage is reported
   through status() and the caller keeps working.
   ============================================================ */
(function (root) {
  'use strict';

  var DB_KEY = 'mmh.db.v2';
  var CORRUPT_KEY = 'mmh.db.v2.corrupt';
  var VERSION = 2;
  var PREFIX = 'mmh.';

  function create(store) {
    var ls = store === undefined ? probe() : store;
    var lastStatus = { ok: !!ls, corrupt: false, message: ls ? '' : 'Browser storage is not available in this window.' };

    function probe() {
      try {
        var w = typeof window !== 'undefined' ? window : null;
        if (!w || !w.localStorage) return null;
        var k = '__mmh_probe'; w.localStorage.setItem(k, '1'); w.localStorage.removeItem(k);
        return w.localStorage;
      } catch (e) { return null; }
    }
    function getRaw(key) { if (!ls) return null; try { return ls.getItem(key); } catch (e) { return null; } }
    function setRaw(key, value) { if (!ls) return false; try { ls.setItem(key, String(value)); return true; } catch (e) { return false; } }
    function remove(key) { if (!ls) return false; try { ls.removeItem(key); return true; } catch (e) { return false; } }
    function getJSON(key, fallback) {
      var raw = getRaw(key); if (raw == null) return fallback;
      try { var v = JSON.parse(raw); return v == null ? fallback : v; } catch (e) { return fallback; }
    }
    function setJSON(key, value) { try { return setRaw(key, JSON.stringify(value)); } catch (e) { return false; } }
    /** Every mmh.* key except the database itself (the sections' working sheets). */
    function sheetKeys() {
      var out = []; if (!ls) return out;
      try {
        for (var i = 0; i < ls.length; i++) {
          var k = ls.key(i);
          if (k && k.indexOf(PREFIX) === 0 && k !== DB_KEY && k !== CORRUPT_KEY && k.indexOf('mmh.db.') !== 0) out.push(k);
        }
      } catch (e) {}
      return out.sort();
    }

    function emptyDb() {
      return { version: VERSION, createdAt: new Date().toISOString(), customers: [], bills: [], payments: [], expenses: [], categories: [], settings: {} };
    }

    /** Read the database. Missing -> empty. Corrupt -> empty + raw copy kept under CORRUPT_KEY. */
    function loadDb() {
      var raw = getRaw(DB_KEY);
      if (raw == null || raw === '') { lastStatus = { ok: !!ls, corrupt: false, message: lastStatus.message }; return emptyDb(); }
      var d = null;
      try { d = JSON.parse(raw); } catch (e) { d = null; }
      if (!d || typeof d !== 'object' || Array.isArray(d)) {
        if (getRaw(CORRUPT_KEY) == null) setRaw(CORRUPT_KEY, raw);
        lastStatus = { ok: true, corrupt: true, message: 'Saved records could not be read (damaged data). A copy was kept; you can restore a backup from the home page.' };
        return emptyDb();
      }
      lastStatus = { ok: true, corrupt: false, message: '' };
      var db = emptyDb();
      db.createdAt = typeof d.createdAt === 'string' ? d.createdAt : db.createdAt;
      ['customers', 'bills', 'payments', 'expenses', 'categories'].forEach(function (k) {
        db[k] = Array.isArray(d[k]) ? d[k].filter(function (x) { return x && typeof x === 'object' && typeof x.id === 'string'; }) : [];
      });
      db.settings = d.settings && typeof d.settings === 'object' && !Array.isArray(d.settings) ? d.settings : {};
      return db;
    }
    function saveDb(db) {
      if (!ls) return false;
      db.version = VERSION; db.savedAt = new Date().toISOString();
      if (lastStatus.corrupt && getRaw(CORRUPT_KEY) == null) return false;
      var ok = setJSON(DB_KEY, db);
      if (ok) lastStatus = { ok: true, corrupt: false, message: '' };
      return ok;
    }

    return {
      DB_KEY: DB_KEY, CORRUPT_KEY: CORRUPT_KEY, VERSION: VERSION,
      available: function () { return !!ls; },
      status: function () { return lastStatus; },
      getRaw: getRaw, setRaw: setRaw, remove: remove, getJSON: getJSON, setJSON: setJSON,
      sheetKeys: sheetKeys, emptyDb: emptyDb, loadDb: loadDb, saveDb: saveDb
    };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { var inst = create(); inst.create = create; root.MMHStorage = inst; }
})(typeof window !== 'undefined' ? window : this);
