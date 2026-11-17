'use strict';

// Hub v3 BOOT RESCUE: a deploy that lands between this page's index and its first chunk.
//
// The index (dist/hub/index.html, served no-store) names hashed chunks under /auth/hub/assets/. If a deploy removes
// them before the browser fetches the entry or one of its static imports, the module graph never runs: the app's own
// handling (hub/src/shell/staleChunk.ts) is never installed and the page stays empty. This classic script, loaded
// before the entry and outside the hashed graph, covers that window with the same rules:
//   - a failed /auth/hub/assets/ script or stylesheet is a deploy only when the server answers 404 for it (one HEAD
//     check); unreachable or still there → a neutral "couldn't load" message;
//   - a deploy → the "Hub was updated. Reload to continue." message.
//   Both carry a Reload button; nothing here reloads the page by itself, the person decides.
// Once the app runs (installStaleChunk sets data-hub-chunks on <html>) it decides nothing itself: a check it started
// before then, or a Hub asset failing later (the initial stylesheet), is handed to the app as a `hub:chunk-rescue`
// event on the document ({status, boot}), and the app shows its own notice.
// A check that takes longer than 8 s counts as unreachable.
//
// EXTERNAL, not inline: /auth/* serves `script-src 'self'` (the page's CSP). It sets no globals;
// styles go through the CSSOM (element.style), which the CSP's style-src does not block.

(function () {
  var d = document.documentElement;

  function assetUrl(el) {
    var tag = el && el.tagName;
    var raw = tag === 'SCRIPT' ? el.src : tag === 'LINK' ? el.href : '';
    if (!raw) return '';
    try {
      var u = new URL(raw, location.href);
      return u.origin === location.origin && u.pathname.indexOf('/auth/hub/assets/') === 0 ? u.href : '';
    } catch (e) { return ''; }
  }

  function show(updated) {
    if (document.getElementById('hub-chunk-rescue')) return;
    try { if (window.HubBootGate) window.HubBootGate.reveal(); } catch (e) {}
    var box = document.createElement('div');
    box.id = 'hub-chunk-rescue';
    box.setAttribute('role', 'status');
    box.style.display = 'flex';
    box.style.gap = '12px';
    box.style.alignItems = 'center';
    box.style.justifyContent = 'center';
    box.style.padding = '24px 16px';
    box.style.fontFamily = 'system-ui, sans-serif';
    var text = document.createElement('span');
    text.textContent = updated ? 'Hub was updated. Reload to continue.' : "Part of the Hub couldn't load. Check your connection, then reload.";
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Reload';
    btn.addEventListener('click', function () { window.location.reload(); });
    box.appendChild(text);
    box.appendChild(btn);
    (document.body || d).appendChild(box);
  }

  function appRuns() { return d.hasAttribute('data-hub-chunks'); }

  function handOver(status, boot) {
    try {
      document.dispatchEvent(new CustomEvent('hub:chunk-rescue', { detail: { status: status, boot: boot } }));
    } catch (e) {}
  }

  // The HTTP status of a HEAD of the file, or null when offline, unreachable or slower than 8 s.
  function check(url) {
    if (navigator.onLine === false || typeof window.fetch !== 'function') return Promise.resolve(null);
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = null;
    var head = window.fetch(url, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.status; }, function () { return null; });
    var late = new Promise(function (resolve) {
      timer = setTimeout(function () { if (ctl) ctl.abort(); resolve(null); }, 8000);
    });
    return Promise.race([head, late]).then(function (status) { clearTimeout(timer); return status; });
  }

  var handled = false;
  var later = {};
  function onError(ev) {
    var url = assetUrl(ev.target);
    if (!url) return;
    if (appRuns()) {
      // After the hand-off: only a deploy is worth telling the app (one check per file).
      if (later[url]) return;
      later[url] = true;
      check(url).then(function (status) { if (status === 404) handOver(404, false); });
      return;
    }
    if (handled) return;
    handled = true;
    check(url).then(function (status) {
      if (appRuns()) { handOver(status, true); return; }
      show(status === 404);
    });
  }
  // Resource errors do not bubble: listen in the capture phase.
  window.addEventListener('error', onError, true);
})();
