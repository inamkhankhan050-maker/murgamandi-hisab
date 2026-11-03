/* Home page: shows today's date only. Sections run on their own pages. */
(function () {
  'use strict';
  var el = document.getElementById('today');
  if (el) el.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
})();
