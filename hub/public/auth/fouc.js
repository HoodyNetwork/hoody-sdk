// FOUC prevention — runs synchronously before CSS to set data attributes
// Parses GET params: ?theme=, ?colorScheme=, ?font=, ?lang=
(function(){
  var p = new URLSearchParams(location.search);
  var d = document.documentElement;

  // Theme (lowercase, fallback to oc-1)
  var th = (p.get('theme') || 'oc-1').toLowerCase();
  if (/^[a-zA-Z0-9_-]+$/.test(th)) {
    d.dataset.theme = th;
  } else {
    d.dataset.theme = 'oc-1';
  }

  // Color scheme
  var cs = p.get('colorScheme') || 'dark';
  if (/^(light|dark|system)$/.test(cs)) {
    if (cs === 'system') {
      cs = (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme:dark)').matches) ? 'dark' : 'light';
    }
    d.dataset.colorScheme = cs;
  } else {
    d.dataset.colorScheme = 'dark';
  }

  // The new Hub's Look (device preferences, localStorage only, never a cookie): data-hx-theme light|dark
  // (hub_theme_v1 light|dark|system; missing or anything else is system, the default: the device's
  // prefers-color-scheme) and data-hx-hl, the accent set (hub_hl_v1; yellow, the
  // default, sets no attribute). Set here so the first paint already has them; the Hub then follows
  // a change of the device's scheme while the choice is system (hub/src/shell/prefs.ts).
  var ht = null, hl = null;
  try { ht = localStorage.getItem('hub_theme_v1'); hl = localStorage.getItem('hub_hl_v1'); } catch (e) {}
  if (ht !== 'light' && ht !== 'dark') ht = (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  d.setAttribute('data-hx-theme', ht);
  if (/^(mint|sky|coral|lilac|chalk)$/.test(hl || '')) d.setAttribute('data-hx-hl', hl);

  // Performance mode (hub/src/kit/perf.ts): hub_perf_v1 "1" sets data-hx-perf="on" before the first paint.
  // ?perf=1 / ?perf=0 (exactly) on any address stores or clears it first, then leaves the address (only that param;
  // the path, the other params and the hash stay). Any other value is ignored and left as it is.
  var pf = p.get('perf'), po = null;
  if (pf === '1' || pf === '0') {
    try { if (pf === '1') localStorage.setItem('hub_perf_v1', '1'); else localStorage.removeItem('hub_perf_v1'); } catch (e) {}
    po = pf === '1';
    try {
      // Only the perf pairs leave; every other pair keeps its text exactly as typed (shared.js reads the raw query,
      // e.g. ?hoody=localhost:<port>, with no decoding), so the query is cut as text, never re-encoded.
      var qs = location.search.replace(/^\?/, '').split('&').filter(function (x) { return x.split('=')[0] !== 'perf'; }).join('&');
      history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    } catch (e) {}
  }
  if (po === null) { try { po = localStorage.getItem('hub_perf_v1') === '1'; } catch (e) { po = false; } }
  if (po) d.setAttribute('data-hx-perf', 'on');

  // Font
  var fn = p.get('font');
  if (fn && fn.length <= 64 && /^[a-zA-Z0-9 _-]+$/.test(fn)) {
    d.dataset.font = fn;
    d.style.setProperty('--font-family-sans', '"' + fn + '", "Inter", "Inter Fallback"');
  }

  // Language — must match the 16 locales shipped in i18n.js.
  var validLangs = ['en','ar','br','bs','da','de','es','fr','ja','ko','no','pl','ru','th','zh','zht'];
  var lang = p.get('lang') || 'en';
  if (validLangs.indexOf(lang) !== -1) {
    // BCP-47 mapping for html lang attribute
    var bcp47 = { zht: 'zh-TW', br: 'pt-BR' };
    d.lang = bcp47[lang] || lang;
    if (lang === 'ar') d.dir = 'rtl';
    // Store internal lang code for i18n dict lookup
    window._hoodyInitialLang = lang;
  } else {
    window._hoodyInitialLang = 'en';
  }
})();
