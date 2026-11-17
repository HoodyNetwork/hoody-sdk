'use strict';

// /auth/home BOOT GATE — loaded from the <head> of the Hub page (the Hub's index.html), so it
// runs before any markup exists (and therefore before first paint).
//
// Two jobs, both of which MUST land before first paint:
//   1. No stored session (class 'none' below) → navigate away NOW, with the document held
//      invisible, so nothing hub-shaped is ever shown to someone who is on their way to /login.
//   2. Otherwise → mark the document `hub-booting` until the Hub has something to show. The
//      class is dropped by HubBootGate.reveal(): the app calls it once it has mounted
//      (hub/src/app/main.tsx), and the chunk rescue when a script failed to load
//      (hub-chunk-rescue.js).
//
// EXTERNAL, not inline: /auth/* serves a strict CSP — `script-src 'self'` plus one
// pinned sha256 for the callback page's fragment scrubber — so an inline <script> here
// would be blocked outright (the page's CSP). Its styling half
// lives in the page's stylesheet for the same reason (`style-src 'self'`, no inline <style>).

(function () {
  var d = document.documentElement;

  // Storage access throws in some privacy modes — every read is best-effort.
  function ls(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }

  var HUB_TEMPLATES = ['v3'];
  var HUB_VIEWS = ['home', 'bots', 'board', 'guide', 'computers', 'keys', 'market', 'account', 'wallet', 'notify', 'scripts', 'logs', 'ai', 'apps', 'notes', 'schedules', 'programs'];
  // `?hub=…&view=…` from the current URL, known values only, fixed order; '' when neither.
  function hubStateQuery() {
    try {
      var q = new URLSearchParams(location.search), parts = [];
      var hubs = q.getAll('hub'), view = q.get('view');
      // Only one known value selects a Hub, as on the server (hubTemplateFor): none, an unknown or a
      // repeated value gets the default, Hub v3, and travels as no value at all.
      var hub = hubs.length === 1 && HUB_TEMPLATES.indexOf(hubs[0]) !== -1 ? hubs[0] : '';
      var v3 = hub === 'v3' || hub === '';
      // Hub v3 routes live in the hash (#/programs/…), which sign-in cannot carry: its page rides
      // along as the view (the billing and notifications pages go as the wallet and notify views), unless the query
      // names a known view (an unknown one, such as the view=hub marker os.hoody.com and hub.hoody.com send, is dropped below anyway).
      if (v3 && !(view && HUB_VIEWS.indexOf(view) !== -1)) {
        var id = (location.hash.replace(/^#\/*/, '').split(/[\/?#]/)[0]) || '';
        view = id === 'billing' ? 'wallet' : id === 'notifications' ? 'notify' : id;
      }
      // The preview flag travels only as `hub=v3&preview=1` (the one form safeFinalPath accepts), so the
      // default Hub's preview names v3.
      var preview = v3 && q.get('preview') === '1';
      if (hub || preview) parts.push('hub=' + (hub || 'v3'));
      if (preview) parts.push('preview=1');
      if (view && HUB_VIEWS.indexOf(view) !== -1) parts.push('view=' + view);
      return parts.length ? '?' + parts.join('&') : '';
    } catch (e) { return ''; }
  }

  // ── 1. Payment-return capture ───────────────────────────────────────
  // MUST run before the auth gate below: a lapsed session returning from
  // the payment page is bounced to /auth/login, and these params would die with
  // that navigation. Validate strictly, stash into sessionStorage (survives the
  // login round-trip in-tab), and strip payment/status/provider (+ NP_id) from the
  // URL. The Hub consumes it after boot (hub/src/core/commerce.ts) and VERIFIES crediting through the
  // owner-scoped intent — status=success is a trigger to check, never proof.
  try {
    var q = new URLSearchParams(location.search);
    var payment = q.get('payment'), status = q.get('status'), provider = q.get('provider') === 'crypto' ? 'crypto' : 'card';
    if (payment && /^[0-9a-f]{24}$/i.test(payment)
      && (status === 'success' || status === 'cancelled')) {
      sessionStorage.setItem('hub_topup_return', JSON.stringify({ payment: payment, status: status, provider: provider, at: Date.now() }));
    }
    if (q.has('payment') || q.has('status') || q.has('provider') || q.has('NP_id')) {
      q.delete('payment'); q.delete('status'); q.delete('provider'); q.delete('NP_id');
      var qs = q.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    }
  } catch (e) {}

  // ── 1b. Buy-link capture ────────────────────────────────────────────
  // The website's Get button → /get/subserver/<family_id> → 302 here with
  // ?buy=subserver&plan=<family_id>. Same reason as above: a token-less visitor is bounced
  // to /auth/login below and the params would die with that navigation. Stash ONLY a
  // strictly validated id (sessionStorage: this tab, survives the login/OAuth round-trip)
  // and strip both params, so a reload can never re-open the panel. The Hub consumes
  // it after boot and only ever SHOWS the plan — buying always takes an explicit Confirm.
  // An invalid id is dropped silently.
  // A token-less visitor also gets a localStorage copy: email signup finishes in a NEW tab
  // (the verification link), where sessionStorage is empty. The Hub reads both copies under
  // one 60-minute TTL (hub/src/core/commerce-pure.ts).
  try {
    var bq = new URLSearchParams(location.search);
    if (bq.has('buy')) {
      var plan = String(bq.get('plan') || '').toLowerCase();
      if (bq.get('buy') === 'subserver' && /^[0-9a-f]{24}$/.test(plan)) {
        var bv = JSON.stringify({ kind: 'subserver', plan: plan, at: Date.now() });
        sessionStorage.setItem('hub_buy_intent', bv);
        if (!ls('access_token')) localStorage.setItem('hub_buy_intent', bv);
      }
      bq.delete('buy'); bq.delete('plan');
      var bqs = bq.toString();
      history.replaceState(null, '', location.pathname + (bqs ? '?' + bqs : '') + location.hash);
    }
  } catch (e) {}

  // The seam, published as soon as the capture above has run — BEFORE any early return,
  // so its presence means exactly "this gate executed", also when we bail out below.
  // reveal() is a no-op until (and unless) the veil is actually applied.
  var revealed = false;
  function reveal() {
    if (revealed) return;
    revealed = true;
    d.classList.remove('hub-booting');
  }
  window.HubBootGate = { reveal: reveal, isRevealed: function () { return revealed; } };

  // ── Stored-session class ──────────────
  // A COPY of shared.js classifyStoredAuth and its strict hub_token_session_v1 reader, because
  // this file runs before shared.js (like the HUB_VIEWS copy above); a unit test
  // runs one vector table against both. access_token decides first;
  // a pending 2FA step (two_factor_token) is next and makes the class none, so the account's 2FA
  // flow wins; a record decides only without both, and only when it is exactly the documented shape.
  // 'unreadable' = storage throws.
  var TOKEN_RE = /^hdy_[0-9a-f]{24}_[0-9a-f]{48}$/, HEX24 = /^[0-9a-f]{24}$/, SID = /^[a-z0-9]{16}$/;
  function plainObj(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    var p = Object.getPrototypeOf(o);
    return p === null || Object.getPrototypeOf(p) === null;
  }
  function keysAre(o, want) { return Object.keys(o).sort().join(',') === want; }
  function tokenRecordOk(raw) {
    if (typeof raw !== 'string' || raw.length > 4096) return false;
    var r;
    try { r = JSON.parse(raw); } catch (e) { return false; }
    if (!plainObj(r) || !keysAre(r, 'at,owner,realm,sid,token,v')) return false;
    var o = r.owner;
    return r.v === 1 && typeof r.token === 'string' && TOKEN_RE.test(r.token)
      && (r.realm === 'all' || (typeof r.realm === 'string' && HEX24.test(r.realm)))
      && typeof r.sid === 'string' && SID.test(r.sid) && typeof r.at === 'number' && isFinite(r.at)
      && plainObj(o) && keysAre(o, 'id,username') && typeof o.id === 'string' && HEX24.test(o.id)
      && typeof o.username === 'string' && o.username.length >= 1 && o.username.length <= 254;
  }
  function classifyStored() {
    try {
      if (localStorage.getItem('access_token')) return 'account';
      if (localStorage.getItem('two_factor_token')) return 'none';
      return tokenRecordOk(localStorage.getItem('hub_token_session_v1')) ? 'token' : 'none';
    } catch (e) { return 'unreadable'; }
  }

  // ── 2. Auth gate ────────────────────────────────────────────────────
  // Decided here because only here is early enough to matter. A dangling 2FA token means
  // the login round-trip is only half done → /auth/2fa.
  // The document is held invisible while the replacement navigation commits:
  // location.replace() does NOT stop the parser, so the page's markup could otherwise still
  // steal a frame. This has to be an INLINE style, not a stylesheet class — we bounce
  // from the first <script> in <head>, before the parser has even reached the
  // stylesheet <link>s, so no author CSS is guaranteed to exist here. `hub-boot-away`
  // rides along purely as a marker for tests/debugging.
  // Storage that THROWS (cookies/site-data blocked) also yields a null token, which
  // would bounce a signed-in user — so only an actually-readable, absent session
  // redirects.
  //
  // The Hub's own query state rides along: a validated `hub` (v3) and a known `view`,
  // so a preview or deep link lands where it pointed after sign-in (login/2FA forward them via
  // preserveQuery, OAuth via safeFinalPath). These lists are copies of HUB_TEMPLATES/HUB_VIEWS
  // in shared.js, which loads after this file; a unit test keeps them equal.
  var cls = classifyStored(), storageOk = cls !== 'unreadable';
  function away(url) {
    d.classList.add('hub-boot-away');
    d.style.visibility = 'hidden';
    location.replace(url);
  }
  if (cls === 'none') {
    away((ls('two_factor_token') ? '/auth/2fa' : '/auth/login') + hubStateQuery());
    return;
  }
  // Unreadable storage → this hub cannot boot at all: the bearer token lives there.
  // Don't veil that — a veil would only hide the (broken) page until the belt below gave
  // up. Bail out and let the page render unveiled.
  if (!storageOk) return;

  // ── 3. Boot veil ────────────────────────────────────────────────────
  // `data-hub-boot` replays the stored `hub_boot_mode` ('rest', else 'stage'), so a loader
  // can sit on the background the page is about to use. A wrong guess costs one
  // background change.
  d.setAttribute('data-hub-boot', ls('hub_boot_mode') === 'rest' ? 'rest' : 'stage');
  d.classList.add('hub-booting');

  // ── 4. Belt ─────────────────────────────────────────────────────────
  // The veil's normal end is the app's mount, which calls reveal(). This belt only exists
  // so a page whose JS died can't stay veiled — and it must never pre-empt a live app, or
  // it re-creates the very flash the veil prevents. (Measured: a naive `load`-triggered
  // watchdog did exactly that, because `load` can land before the first render.) Hence,
  // in order:
  //
  //   1. readyState 'loading' → the parser is still running, so NOTHING is final:
  //      the app may simply not be downloaded yet. Never reveal; re-check later.
  //   2. body.hubx → a shell that marks the body has committed and owns the page.
  //   3. a #hub-bootstrapping loader still on screen → the page is still making progress.
  //      apiCall() has no timeout (shared.js), so a genuinely slow read must NOT be
  //      "rescued": a spinner that is still spinning is honest.
  //   4. otherwise → parsing is done and no loader shows: what the page holds IS the UI.
  //      Reveal.
  //
  // Re-checks are capped so case 3 cannot hold the veil forever on a page that has
  // simply hung — after ~5 minutes of a spinner with nothing committed, showing the
  // (broken) page beats hiding it behind an animation for the rest of the session.
  var beltTicks = 0, beltTimer = null;
  function beltRetry() {
    if (beltTimer) return;                       // one chain only (load + timer both feed in)
    if (++beltTicks > 15) { reveal(); return; }  // ~5 min of no progress — stop hiding it
    beltTimer = setTimeout(function () { beltTimer = null; beltCheck(); }, 20000);
  }
  function beltCheck() {
    if (revealed) return;
    if (document.readyState !== 'loading') {
      if (document.body && document.body.classList.contains('hubx')) return; // shell owns it
      var boot = document.getElementById('hub-bootstrapping');
      if (!(boot && !boot.classList.contains('hidden'))) { reveal(); return; }
    }
    beltRetry();
  }
  window.addEventListener('load', beltCheck);
  beltRetry();
})();
