/* ============================================================
   Zinda number keypad with + − × ÷ (from the original Chicken
   Calculator). Lets a box take "50+60.5+94" and settles it to the
   exact result using the section's own calc engine (BillingCalc).
   ============================================================ */
(function () {
  'use strict';
  var C = window.BillingCalc;
  var $ = function (id) { return document.getElementById(id); };
  /* ---- Number keypad with + − × ÷ (replaces phone keyboard on touch screens) ---- */
  function imOf(el) { return el.getAttribute('data-im') || el.getAttribute('inputmode') || ''; }
  function isNumIn(el) { return el && el.tagName === 'INPUT' && /^(decimal|numeric)$/.test(imOf(el)); }
  var touchPad = false;
  function initCalcBar() {
    try { touchPad = window.matchMedia && window.matchMedia('(pointer: coarse)').matches; } catch (e) {}
    var bar = document.createElement('div'); bar.id = 'calcBar'; bar.className = 'calc-bar' + (touchPad ? ' pad' : '');
    var K = function (k, cls, lbl) { return '<button type="button" data-op="' + k + '"' + (cls ? ' class="' + cls + '"' : '') + '>' + (lbl || k) + '</button>'; };
    bar.innerHTML = '<div class="cb-top"><span class="cb-lbl" id="cbLbl"></span><span class="cb-res" id="cbRes"></span></div>' +
      (touchPad
        ? '<div class="cb-keys pad">' +
          K('7') + K('8') + K('9') + K('÷', 'op') + K('⌫', 'cb-del') +
          K('4') + K('5') + K('6') + K('×', 'op') + K('C', 'cb-clr') +
          K('1') + K('2') + K('3') + K('−', 'op') + K('next', 'cb-next', 'Next ›') +
          K('.') + K('0') + K('=', 'cb-eq') + K('+', 'op') + K('done', 'cb-done', 'Done') + '</div>'
        : '<div class="cb-keys">' + K('+', 'op') + K('−', 'op') + K('×', 'op') + K('÷', 'op') + K('⌫', 'cb-del') + K('=', 'cb-eq') + '</div>');
    document.body.appendChild(bar);
    var cur = null;
    function places(el) { return imOf(el) === 'numeric' ? 0 : (/rate|cash|online|old|amt/i.test((el.id || '') + (el.dataset.f || '')) ? 2 : 3); }
    function fire(el) { el.dispatchEvent(new Event('input', { bubbles: true })); }
    function label(el) {
      var l = el.closest('label'); if (l && l.querySelector('span')) return l.querySelector('span').textContent;
      return el.getAttribute('aria-label') || el.placeholder || '';
    }
    function show() {
      if (!cur) return;
      var v = cur.value, e = C.hasExpr(v), r = e ? C.evalExpr(v, places(cur)) : null;
      $('cbLbl').textContent = label(cur);
      $('cbRes').textContent = r !== null ? v + ' = ' + r : (e ? v + ' = ?' : (v || '+ − × ÷ se jodo, ghatao'));
      bar.classList.toggle('has', r !== null);
    }
    function settle(el) {
      if (!el || !C.hasExpr(el.value)) return;
      var r = C.evalExpr(el.value, places(el));
      if (r !== null) { el.title = el.value + ' = ' + r; el.value = r; fire(el); }
    }
    function open(el) {
      cur = el; bar.classList.add('show'); document.body.classList.add('calc-on'); show();
      if (touchPad) setTimeout(function () {
        var rb = el.getBoundingClientRect(), top = window.innerHeight - bar.offsetHeight - 12;
        if (rb.bottom > top) window.scrollBy({ top: rb.bottom - top, behavior: 'smooth' });
      }, 30);
    }
    function close() { bar.classList.remove('show'); document.body.classList.remove('calc-on'); cur = null; }
    function numInputs() { return Array.prototype.filter.call(document.querySelectorAll('input'), function (i) { return isNumIn(i) && i.offsetParent !== null && !i.disabled; }); }
    function prep(el) { if (touchPad && isNumIn(el) && el.getAttribute('inputmode') !== 'none') { el.setAttribute('data-im', el.getAttribute('inputmode')); el.setAttribute('inputmode', 'none'); } }
    if (touchPad) {
      document.addEventListener('pointerdown', function (e) { if (e.target.tagName === 'INPUT') prep(e.target); }, true);
      document.addEventListener('touchstart', function (e) { if (e.target.tagName === 'INPUT') prep(e.target); }, { capture: true, passive: true });
    }
    document.addEventListener('focusin', function (e) { if (isNumIn(e.target)) { prep(e.target); open(e.target); } });
    document.addEventListener('focusout', function (e) {
      if (e.target !== cur) return; var el = cur;
      setTimeout(function () { if (document.activeElement !== el) { settle(el); if (!isNumIn(document.activeElement)) close(); } }, 0);
    });
    document.addEventListener('input', function (e) { if (e.target === cur) show(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && cur && e.target === cur && C.hasExpr(cur.value)) { e.preventDefault(); settle(cur); show(); } });
    bar.addEventListener('pointerdown', function (e) { e.preventDefault(); });
    bar.addEventListener('mousedown', function (e) { e.preventDefault(); });
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || !cur) return;
      var op = b.dataset.op, v = cur.value, len = v.length,
        st = cur.selectionStart == null ? len : cur.selectionStart, en = cur.selectionEnd == null ? len : cur.selectionEnd;
      if (touchPad && document.activeElement !== cur) { st = en = len; }
      if (op === '=') { settle(cur); show(); cur.focus(); return; }
      if (op === 'done') { settle(cur); cur.blur(); close(); return; }
      if (op === 'next') {
        settle(cur); var list = numInputs(), i = list.indexOf(cur), nx = list[i + 1];
        if (nx) { prep(nx); nx.focus(); try { nx.setSelectionRange(nx.value.length, nx.value.length); } catch (x) {} } else { cur.blur(); close(); }
        return;
      }
      if (op === 'C') { cur.value = ''; st = 0; }
      else if (op === '⌫') { if (st === en && st > 0) st--; cur.value = v.slice(0, st) + v.slice(en); }
      else { cur.value = v.slice(0, st) + op + v.slice(en); st += op.length; }
      try { cur.setSelectionRange(st, st); } catch (x) {}
      fire(cur); cur.focus();
    });
  }
  window.ZindaKeypad = { init: initCalcBar };
})();
