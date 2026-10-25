/* Saves demo state in this browser so a refresh keeps your progress. Reset restores the seed. */
(function (root) {
  'use strict';
  var KEY = 'sayso-demo-v1';
  function load() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      return data && data.st && data.st.version === 1 ? data : null;
    } catch (e) { return null; }
  }
  function save(data) {
    try { root.localStorage && root.localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable: demo still works in memory */ }
  }
  function clear() {
    try { root.localStorage && root.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }
  root.SaySo = root.SaySo || {};
  root.SaySo.store = { load: load, save: save, clear: clear };
})(typeof window !== 'undefined' ? window : globalThis);
