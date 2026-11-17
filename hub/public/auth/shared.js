'use strict';
const API_BASE = '/api/v1';

// ── The API origin ─────────────────────────────────────────
// One function decides which Hoody API this page talks to: hubApiRoot().
//   A served page (every /auth/* page): API_BASE, relative to the origin that served the page.
//   The standalone Hub (one HTML file opened from any place; its <html> carries
//   data-hub-standalone, which no served template has): the origin named with setStandaloneApi(),
//   which only its sign-in screen calls, with the Hoody this file is built for or the one its link
//   chose (standaloneChoice).
// Rules of the standalone origin:
//   - The file knows its Hoody API: STANDALONE_ORIGIN. Nobody types an address.
//   - Only listed origins are ever accepted (checkApiOrigin, standaloneOriginListed): STANDALONE_ORIGIN;
//     and, only while STANDALONE_ALT_ORIGIN differs from it, that origin too and this machine over
//     http (localhost or 127.0.0.1). The alternative exists only when it differs.
//   - The link may choose among them with one query parameter, read once when this file loads, from
//     the raw query (nothing is decoded): hoody=dev (STANDALONE_ALT_ORIGIN), hoody=localhost:<port> or
//     hoody=127.0.0.1:<port>. Any other value, the key twice, or any value while no alternative exists
//     is refused and STANDALONE_ORIGIN used; the screen says so and never shows the value. Never a
//     fragment, a message event or a cookie.
//   - One origin per page load: another one is refused ('locked'); the page reloads to change it.
//   - The stored record (STANDALONE_API_KEY) names the Hoody the stored credentials belong to. It is
//     written only while no credential is stored, or for the same origin again. Every send and every
//     refresh compares it with this page's origin (standaloneApiHeld), so a bearer stored for one
//     Hoody is never sent to another, also when another tab chose again meanwhile. While credentials
//     are stored, their Hoody is used whatever the link asks; a record naming an origin this file
//     does not list is no record (the page asks to sign out first).
//   - Until an origin is set a standalone page sends nothing (BAD_API_BASE, notSent).
//   - Payments are handed to the served Hub (standaloneHandoffRoute): a payment provider returns to
//     a page on Hoody's own origin, which a file cannot be.
var STANDALONE_API_KEY = 'hub.v3.standalone_api';
var STANDALONE_ATTR = (function () {
  try {
    var el = document.documentElement;
    return el && el.hasAttribute('data-hub-standalone') ? String(el.getAttribute('data-hub-standalone') || '') : null;
  } catch (e) { return null; }
})();
// Read once, when this file loads: a later attribute change turns nothing on or off.
var STANDALONE_PAGE = STANDALONE_ATTR !== null;
// Which requests a standalone page hands to the served Hub: 'payments' (default), 'sensitive' (every
// FRAMED_SENSITIVE_ROUTES entry) or 'none'. A build-time choice, written into the attribute.
var STANDALONE_HANDOFF = STANDALONE_ATTR === 'none' || STANDALONE_ATTR === 'sensitive' ? STANDALONE_ATTR : 'payments';
var standaloneApi = null;
// The Hoody API this file signs in to, and the alternative its link may choose (see the rules above).
var STANDALONE_ORIGIN = 'https://api.hoody.com';
var STANDALONE_ALT_ORIGIN = 'https://api.hoody.com';
var STANDALONE_ALT = STANDALONE_ALT_ORIGIN !== STANDALONE_ORIGIN;
var STANDALONE_PARAM = 'hoody';
// This page's raw query, read once when this file loads (null when it cannot be read: refused).
var STANDALONE_SEARCH = (function () {
  if (!STANDALONE_PAGE) return '';
  try { return String(location.search || ''); } catch (e) { return null; }
})();
var standaloneChoiceMemo = null;

function hubStandalonePage() { return STANDALONE_PAGE; }

// An origin this file may talk to: STANDALONE_ORIGIN; while an alternative exists, also
// STANDALONE_ALT_ORIGIN and this machine over http (localhost or 127.0.0.1, any port).
function standaloneOriginListed(origin) {
  if (origin === STANDALONE_ORIGIN) return true;
  if (!STANDALONE_ALT) return false;
  return origin === STANDALONE_ALT_ORIGIN || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::[1-9][0-9]{0,4})?$/.test(origin);
}

// The canonical origin of a Hoody API address, or '' when refused: not an origin, or not listed.
function checkApiOrigin(raw) {
  if (typeof raw !== 'string' || raw.length > 300) return '';
  var s = raw.trim();
  // scheme://host[:port] and at most one trailing slash. Anything a URL parser would repair or read
  // differently (user@, a backslash, white space, a path) is refused before it is parsed.
  if (!/^https?:\/\/[^\/?#@\\\s]+\/?$/i.test(s)) return '';
  var u;
  try { u = new URL(s); } catch (e) { return ''; }
  if (u.username || u.password || u.pathname !== '/' || u.search || u.hash) return '';
  return standaloneOriginListed(u.origin) ? u.origin : '';
}

// What a raw query (location.search, with or without its '?') asks for: {origin, asked}, asked
// 'default' (no `hoody` key, or one with an empty value), 'alt', 'local' or 'refused' (the key twice,
// any other value, or any value while no alternative exists; STANDALONE_ORIGIN is used). Keys and
// values are compared as written: nothing is decoded, so an encoded spelling is another value.
function standaloneChoiceOf(search) {
  var refused = { origin: STANDALONE_ORIGIN, asked: 'refused' };
  if (typeof search !== 'string') return refused;
  var q = search.charAt(0) === '?' ? search.slice(1) : search;
  var parts = q === '' ? [] : q.split('&');
  var values = [];
  for (var i = 0; i < parts.length; i++) {
    var eq = parts[i].indexOf('=');
    if ((eq < 0 ? parts[i] : parts[i].slice(0, eq)) === STANDALONE_PARAM) values.push(eq < 0 ? '' : parts[i].slice(eq + 1));
  }
  if (values.length > 1) return refused;
  if (values.length === 0 || values[0] === '') return { origin: STANDALONE_ORIGIN, asked: 'default' };
  if (!STANDALONE_ALT) return refused;
  var v = values[0];
  if (v === 'dev') return { origin: STANDALONE_ALT_ORIGIN, asked: 'alt' };
  var m = /^(localhost|127\.0\.0\.1):([1-9][0-9]{0,4})$/.exec(v);
  var local = m && Number(m[2]) <= 65535 ? checkApiOrigin('http://' + m[1] + ':' + m[2]) : '';
  return local ? { origin: local, asked: 'local' } : refused;
}
// This page's choice, decided once (null on a served page).
function standaloneChoice() {
  if (!STANDALONE_PAGE) return null;
  if (!standaloneChoiceMemo) standaloneChoiceMemo = Object.freeze(standaloneChoiceOf(STANDALONE_SEARCH));
  return standaloneChoiceMemo;
}

// A stored or offered record → frozen {origin, realmApiDomain, proxyDomain}, or null. A malformed
// domain reads as none (that feature is off), a malformed origin refuses the record.
function parseStandaloneApi(raw) {
  var r;
  try { r = JSON.parse(raw); } catch (e) { return null; }
  if (!plainObject(r) || r.v !== 1 || typeof r.origin !== 'string' || checkApiOrigin(r.origin) !== r.origin) return null;
  var host = function (v) { return typeof v === 'string' && v.length <= 253 && REALM_API_HOST_RE.test(v) ? v : ''; };
  return Object.freeze({ origin: r.origin, realmApiDomain: host(r.realm), proxyDomain: host(r.proxy) });
}
// The stored record, or null (none, malformed, unreadable storage, or not a standalone page).
function readStandaloneApi() {
  if (!STANDALONE_PAGE) return null;
  try {
    var raw = localStorage.getItem(STANDALONE_API_KEY);
    return raw === null ? null : parseStandaloneApi(raw);
  } catch (e) { return null; }
}
// This page's standalone API ({origin, realmApiDomain, proxyDomain}, frozen), or null.
function getStandaloneApi() { return standaloneApi; }
// Storage still names this page's origin as the one its credentials belong to.
function standaloneApiHeld() {
  var rec = readStandaloneApi();
  return !!(standaloneApi && rec && rec.origin === standaloneApi.origin);
}
function standaloneCredentialStored() {
  return classifyStoredAuth() !== 'none' || anyAccountCredential();
}
// Names this page's Hoody API: cfg = {origin, realmApiDomain?, proxyDomain?}. Answers 'set', or why
// not: 'not_standalone', 'invalid', 'locked' (this page already talks to another origin),
// 'signed_in' (credentials are stored that belong to another origin, or to none on record) or
// 'storage'. Naming the same origin again only refreshes its two domains.
function setStandaloneApi(cfg) {
  if (!STANDALONE_PAGE) return 'not_standalone';
  if (!plainObject(cfg) || typeof cfg.origin !== 'string') return 'invalid';
  var origin = checkApiOrigin(cfg.origin);
  if (!origin) return 'invalid';
  if (standaloneApi && standaloneApi.origin !== origin) return 'locked';
  var raw = JSON.stringify({ v: 1, origin: origin, realm: cfg.realmApiDomain, proxy: cfg.proxyDomain });
  var next = parseStandaloneApi(raw);
  if (!next) return 'invalid';
  try {
    var cur = readStandaloneApi();
    if (classifyStoredAuth() === 'unreadable') return 'storage';
    if (standaloneCredentialStored() && !(cur && cur.origin === origin)) return 'signed_in';
    // A new auth revision first: a token check another tab started against the old record refuses its install.
    // Naming the origin the record already names moves no credential's place: the revision stays, so a sign-in
    // another tab of the same file started is not refused over it.
    if (!(cur && cur.origin === origin)) bumpAuthRev();
    localStorage.setItem(STANDALONE_API_KEY, JSON.stringify({ v: 1, origin: next.origin, realm: next.realmApiDomain, proxy: next.proxyDomain }));
    var back = readStandaloneApi();
    if (!back || back.origin !== origin) return 'storage';
  } catch (e) { return 'storage'; }
  standaloneApi = next;
  return 'set';
}
// Removes the stored choice so the next load asks again: 'cleared', or 'signed_in' while a credential
// is stored (sign out first), 'storage', 'not_standalone'. This page keeps sending nothing until it
// reloads: its origin is no longer the stored one.
function clearStandaloneApi() {
  if (!STANDALONE_PAGE) return 'not_standalone';
  try {
    if (classifyStoredAuth() === 'unreadable') return 'storage';
    if (standaloneCredentialStored()) return 'signed_in';
    bumpAuthRev();
    localStorage.removeItem(STANDALONE_API_KEY);
    return 'cleared';
  } catch (e) { return 'storage'; }
}
// '' on a served page (the page's own origin); the standalone origin, or null while none is usable.
function hubApiOrigin() {
  if (!STANDALONE_PAGE) return '';
  return standaloneApi && standaloneApiHeld() ? standaloneApi.origin : null;
}
// The root every Hoody API URL of the base host starts with, or null on a standalone page that may
// not send (no origin named yet, or storage names another).
function hubApiRoot() {
  var o = hubApiOrigin();
  return o === null ? null : o + API_BASE;
}

// ── Signup-coupon storage keys (tab-scoped) ───────────────
// COUPON_SS_KEY holds the raw invite code while the visitor is still ON /auth/signup.
// COUPON_PREFILL_SS_KEY is its single-use successor: /auth/callback retires the signup key into
// this one, and the hub's invite card consumes-and-deletes it to pre-fill its input.
//
// The handoff is what keeps two properties true at once: a consumed code can never attach itself
// to a LATER signup in the same tab (the signup key is gone), and a user who deliberately clicked
// an invite link but landed gated anyway — e.g. a returning account, which we deliberately do NOT
// auto-memorize — is never silently stripped of the only copy they had.
const COUPON_SS_KEY = 'hoody_signup_invite';
const COUPON_PREFILL_SS_KEY = 'hoody_hub_invite_prefill';

/**
 * Retire the signup coupon into the single-use hub-prefill slot.
 *
 * Called at /auth/callback ENTRY — not at "successful finalization", which does not exist for
 * every flow: the external-embedder leg redirects to the host app and never learns the outcome,
 * and the 2FA detour returns before either finalizer runs. A provider cancel/deny DOES reach this
 * page — the API callback authenticates the state, then redirects here with
 * `?error=access_denied` / `provider_error` rather than stranding the browser on JSON — alongside
 * `signup_disabled`, `email_not_accepted`, `provider_unavailable` and `invalid_request`. Every one
 * of them is terminal at the top of callback.js and returns before this function is ever called,
 * so an errored attempt leaves the coupon in the signup slot for the retry.
 *
 * Why RETIRE rather than delete: for a NEW or claimed account the hash is already committed
 * server-side inside findOrLinkOAuthUser's transaction, so the browser copy is spent. But a
 * RETURNING account (branches 1/2) is deliberately never auto-memorized, so for those users this
 * copy is the only one that exists — deleting it here would silently strip a code they had just
 * deliberately supplied. The prefill slot keeps it available to the hub's invite card, and
 * signup.js also falls back to it, so the code survives an external-embedder redirect or a thrown
 * exchange that never reaches the hub.
 */
function retireSignupCoupon() {
  try {
    var code = sessionStorage.getItem(COUPON_SS_KEY);
    if (code) sessionStorage.setItem(COUPON_PREFILL_SS_KEY, code);
    sessionStorage.removeItem(COUPON_SS_KEY);
  } catch (e) {}
}

// ── Referral code (affiliate program) ─────────────────────
// `?ref=<code>` on any auth page, with nobody signed in, is kept for 7 days in localStorage as
// {code, at, source: 'link'}. The first click wins: an unexpired entry is never replaced by a link.
// signup.js sends it (or the code the person typed, which overrides it) with the signup. After a
// signup answers 200 the entry holds what that signup SENT (keepSubmittedReferral: a typed code with
// source 'typed', nothing when the field was emptied), so a later OAuth start or retry here carries
// the same choice. It is removed when a session exists (a session stored here, by sign-in, 2FA,
// OAuth or email verification, or an external hand-off whose authorization code was issued) or it
// expires; a signup answer arriving after that never brings it back (referralSubmitTicket). The expiry is checked again right
// before a signup is sent, and the OAuth start links are kept current (keepOAuthReferralFresh):
// a page can stay open past it.
// Separate from the invite coupon above (other key, other field, other table).
var REF_LS_KEY = 'hoody_ref_v1';
var REF_REV_KEY = 'hoody_ref_rev_v1';
var REF_TTL_MS = 7 * 24 * 60 * 60 * 1000;
var REF_CODE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// The browser twin of the server's referral-code normalizer: trim, lowercase, shape.
function normalizeReferralCode(raw) {
  if (typeof raw !== 'string') return null;
  var code = raw.trim().toLowerCase();
  if (code.length < 4 || code.length > 20 || !REF_CODE_RE.test(code)) return null;
  return code;
}

// The stored entry, or null. An expired or malformed entry is deleted on read.
function readStoredReferral() {
  try {
    var raw = localStorage.getItem(REF_LS_KEY);
    if (raw === null) return null;
    var e = null;
    try { e = JSON.parse(raw); } catch (pe) { e = null; }
    var code = e && typeof e === 'object' ? normalizeReferralCode(e.code) : null;
    var at = e && typeof e.at === 'number' ? e.at : NaN;
    var age = Date.now() - at;
    if (!code || !(age >= 0 && age < REF_TTL_MS)) {
      localStorage.removeItem(REF_LS_KEY);
      return null;
    }
    return { code: code, at: at, source: e.source === 'typed' ? 'typed' : 'link' };
  } catch (err) { return null; }
}

// Bumped by every clear and every session stored on this page: a signup answer that arrives after
// one of them keeps nothing (keepSubmittedReferral).
var refGen = 0;

// The referral revision (`hoody_ref_rev_v1`, 16 [a-z0-9]) is the same fence across tabs. Only events that
// end the referral's lifetime advance it: a completed session install (any tab), a sign-out that ended a
// session, a token-session install and an explicit referral clear (also a hand-off with nothing stored).
// An anonymous auth cleanup (login page entry with nobody signed in) does NOT, so it cannot drop a
// pending typed referral; hub_auth_rev keeps the token-install protections and is not used here.
function readRefRev() {
  return localStorage.getItem(REF_REV_KEY);
}
function bumpRefRev() {
  try { localStorage.setItem(REF_REV_KEY, randomLowerId(16)); } catch (e) { /* the fence stays as it was */ }
}

function clearStoredReferral() {
  refGen++;
  bumpRefRev();
  try { localStorage.removeItem(REF_LS_KEY); } catch (e) {}
}

// Taken right before a signup is sent with `ref` (or null): the generation, the entry as stored,
// the shared referral revision, and the start of `ref`'s lifetime (the stored entry's own when `ref` is it,
// else now: a typed code gets its own 7 days from the submit). A revision that cannot be read makes
// the ticket unusable: nothing is kept afterwards.
function referralSubmitTicket(ref) {
  var e = readStoredReferral();
  var raw = null;
  try { raw = localStorage.getItem(REF_LS_KEY); } catch (err) {}
  var rev = null;
  var revOk = true;
  try { rev = readRefRev(); } catch (err2) { revOk = false; }
  var at = e && ref && e.code === ref.code && e.source === ref.source ? e.at : Date.now();
  return { gen: refGen, raw: raw, at: at, rev: rev, revOk: revOk };
}

// After a signup answered 200: the entry becomes the referral that signup sent (`ref`, or null),
// with the lifetime its ticket recorded; none sent removes it only when the person emptied the field. Nothing is written when, since the
// ticket was taken, the entry was cleared or changed, a session was stored (also in another tab: the
// referral revision moved), a session exists now, or `ref`'s lifetime ended. Only a session (or the expiry) ends it from then on.
function keepSubmittedReferral(ref, ticket, optedOut) {
  try {
    if (!ticket || ticket.gen !== refGen || !ticket.revOk) return;
    if (readRefRev() !== ticket.rev) return; // a session, sign-out or referral clear in any tab since the ticket
    if (classifyStoredAuth() !== 'none') return;
    if (localStorage.getItem(REF_LS_KEY) !== ticket.raw) return;
    // Nothing sent: the entry goes only when the person emptied the field themselves (`optedOut`). A
    // suppressed expired prefill, or an entry another tab stored, is not theirs to delete.
    if (!ref) { if (optedOut) localStorage.removeItem(REF_LS_KEY); return; }
    var age = Date.now() - ticket.at;
    if (!(age >= 0 && age < REF_TTL_MS)) { readStoredReferral(); return; } // expired: drop, never renew
    var e = readStoredReferral();
    if (e && e.code === ref.code && e.source === ref.source) return;
    localStorage.setItem(REF_LS_KEY, JSON.stringify({ code: ref.code, at: ticket.at, source: ref.source === 'link' ? 'link' : 'typed' }));
  } catch (err) {}
}

// Right before an OAuth start is followed: its ref/ref_source follow `ref` (the referral as it
// is NOW; null drops them), so a link built before the entry expired does not carry it.
function refreshOAuthReferral(a, ref) {
  try {
    var href = a.getAttribute('href') || String(a.href || '');
    if (href.indexOf('?') < 0) return;
    var url = new URL(href, window.location.origin);
    if (!url.searchParams.has('code_challenge')) return; // not a built OAuth start
    if (ref) { url.searchParams.set('ref', ref.code); url.searchParams.set('ref_source', ref.source); }
    else { url.searchParams.delete('ref'); url.searchParams.delete('ref_source'); }
    a.setAttribute('href', url.origin === window.location.origin ? url.pathname + url.search : url.toString());
  } catch (e) {}
}

// Keeps the OAuth start anchors' ref/ref_source current, so no way of following one (a click,
// middle-click, "open in new tab", keyboard, a page restored from the back/forward cache) uses a
// referral that expired while the page was open: re-synced when the stored entry expires (a
// timer), when the page is shown again (visibilitychange, pageshow, focus) and right before an
// anchor is used (pointerdown, mousedown, contextmenu, keydown, focus, click). `anchors()` and
// `currentRef()` are read at each sync; a later call replaces them (one set of page listeners).
var oauthRefSync = null;
function keepOAuthReferralFresh(anchors, currentRef) {
  var first = oauthRefSync === null;
  if (!first) clearTimeout(oauthRefSync.timer);
  oauthRefSync = { anchors: anchors, currentRef: currentRef, timer: null };
  function resync() {
    var s = oauthRefSync;
    try {
      var ref = s.currentRef();
      (s.anchors() || []).forEach(function (a) { if (a) refreshOAuthReferral(a, ref); });
    } catch (e) {}
    arm();
  }
  function arm() {
    var s = oauthRefSync;
    clearTimeout(s.timer);
    s.timer = null;
    var e = readStoredReferral();
    if (!e) return;
    var ms = e.at + REF_TTL_MS - Date.now() + 50;
    s.timer = setTimeout(resync, Math.max(0, Math.min(ms, 2147483647)));
  }
  try {
    (anchors() || []).forEach(function (a) {
      if (!a || a._hoodyRefSync) return;
      a._hoodyRefSync = true;
      ['pointerdown', 'mousedown', 'contextmenu', 'keydown', 'focus', 'click'].forEach(function (ev) { a.addEventListener(ev, resync); });
    });
    if (first) {
      document.addEventListener('visibilitychange', function () { if (document.visibilityState !== 'hidden') resync(); });
      window.addEventListener('pageshow', resync);
      window.addEventListener('focus', resync);
    }
  } catch (e) {}
  resync();
}

// Runs on every auth page load (bottom of this file).
function captureReferralFromUrl() {
  try {
    var params = new URLSearchParams(window.location.search || '');
    if (!params.has('ref')) return;
    var code = normalizeReferralCode(params.get('ref') || '');
    if (!code) return;
    if (classifyStoredAuth() !== 'none') return;
    if (readStoredReferral()) return;
    localStorage.setItem(REF_LS_KEY, JSON.stringify({ code: code, at: Date.now(), source: 'link' }));
  } catch (e) {}
}

// ── i18n translation resolver ─────────────────────────────
function t(key) {
  var lang = window._hoodyInitialLang || 'en';
  var dict = window.AuthI18n && window.AuthI18n[lang] || {};
  var en = window.AuthI18n && window.AuthI18n.en || {};
  return dict[key] || en[key] || key;
}

// Substitute `{{name}}` placeholders in a translated string with values from
// the element's own `data-i18n-<name>` attributes. Returns the original
// string if no placeholders are present. Unknown placeholder names resolve
// to empty string so they never leak into the UI.
function interpolateI18n(el, translated) {
  if (translated.indexOf('{{') === -1) return translated;
  return translated.replace(/\{\{\s*(\w+)\s*\}\}/g, function(_m, name) {
    var v = el.getAttribute('data-i18n-' + name);
    return v !== null ? v : '';
  });
}

function hydrateI18n() {
  // textContent
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    var translated = t(key);
    if (translated !== key) el.textContent = interpolateI18n(el, translated);
  });
  // aria-label
  document.querySelectorAll('[data-i18n-aria]').forEach(function(el) {
    var key = el.getAttribute('data-i18n-aria');
    var translated = t(key);
    if (translated !== key) el.setAttribute('aria-label', interpolateI18n(el, translated));
  });
  // placeholder
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
    var key = el.getAttribute('data-i18n-placeholder');
    var translated = t(key);
    if (translated !== key) el.setAttribute('placeholder', interpolateI18n(el, translated));
  });
  // page title
  var pageKey = document.querySelector('meta[name="i18n-title-key"]');
  if (pageKey) {
    var titleTranslated = t(pageKey.getAttribute('content'));
    if (titleTranslated !== pageKey.getAttribute('content')) document.title = titleTranslated;
  }
}

// ── API calls ──────────────────────────────────────────────
// apiCall sends an authenticated request. If an explicit bearerToken arg is
// passed, that wins (PKCE intent-token flow). Otherwise, if localStorage has
// an `access_token`, we attach it and run proactive refresh before the call.
//
// Proactive refresh is SINGLE-FLIGHT: a module-level `refreshInFlight` promise
// coalesces concurrent refreshes so a bootstrap Promise.all([/me, /projects,
// /containers]) fires at most one refresh even if all three think they need it.
var refreshInFlight = null;
var refreshInFlightOwner = null;

// A refresh acts on whatever session storage holds, and storage is shared by every tab: after a
// sign-in as someone else elsewhere, an unbound refresh sends THEIR refresh token, and rotates or
// (on failure) clears their session. So every refresh names the user it is for. `expectedUid` is
// required: the `id` claim of the session the caller works for (apiCall's operation user, the
// Hub identity for hub-buy, the user a poller was started for). REFRESH_OWNER_ADOPT is the one
// exception, for apiCall's operation that started with no stored token: it takes the user of the
// stored refresh token. Every call site is listed in the API server's auth-refresh-owner test.
var REFRESH_OWNER_ADOPT = Object.freeze({ adopt: true });

// A refresh called without an owner: a programming error, refused before anything is read or sent.
function refreshOwnerRequiredError() {
  return { status: 401, superseded: true, code: 'REFRESH_OWNER_REQUIRED', message: t('auth.error.sessionExpired') || 'Session expired' };
}

// Throws the superseded error unless the stored session belongs to `owner`: the refresh token's
// user must be readable and equal, and so must the access token's when one is stored. Reads only.
function storedSessionOwnedBy(owner) {
  var rtUid = sessionTokenUid(localStorage.getItem('refresh_token'));
  var access = localStorage.getItem('access_token');
  if (!owner || rtUid !== owner || (access && sessionTokenUid(access) !== owner)) {
    authSuperseded = true;
    throw supersededAuthError();
  }
}

// Refresh tokens are single-use: the server spends the one we send and refuses it after that. So
// every refresh in this tab (apiCall, hub-buy, hub-presence, hub-notifications) shares one in-flight
// call, joined only by callers for the same user. The owner is checked against storage before a
// refresh is started or joined, and again under the cross-tab lock right before the request.
function refreshAccessToken(expectedUid) {
  var owner;
  try {
    if (expectedUid === undefined) throw refreshOwnerRequiredError();
    owner = expectedUid === REFRESH_OWNER_ADOPT
      ? sessionTokenUid(localStorage.getItem('refresh_token'))
      : (expectedUid ? String(expectedUid) : null);
    storedSessionOwnedBy(owner);
    if (refreshInFlight && refreshInFlightOwner !== owner) {
      authSuperseded = true;
      throw supersededAuthError();
    }
  } catch (e) {
    return Promise.reject(e);
  }
  if (!refreshInFlight) {
    refreshInFlightOwner = owner;
    refreshInFlight = refreshAccessTokenOnce(owner).finally(function() { refreshInFlight = null; refreshInFlightOwner = null; });
  }
  return refreshInFlight;
}

// Tokens another tab stored after we read `spentRt` (its rotation of the same session), or null
// when storage still holds `spentRt` or no complete session. Only the same session's tokens are
// adopted (same user AND same login session id: a rotation keeps the sid, a new sign-in of the
// same user gets a new one): when the stored session is someone else's, a newer sign-in, or
// cannot be read (an opaque or malformed token on either side), storage changed hands, and this
// throws the superseded error: no adoption, no retry, nothing cleared.
function rotatedTokens(spentRt) {
  var current = localStorage.getItem('refresh_token');
  var access = localStorage.getItem('access_token');
  if (current && current !== spentRt && access) {
    var uid = sessionTokenUid(spentRt);
    var sid = sessionTokenSid(spentRt);
    if (!uid || sessionTokenUid(current) !== uid || sessionTokenUid(access) !== uid ||
        sessionTokenSid(current) !== sid || sessionTokenSid(access) !== sid) {
      authSuperseded = true;
      throw supersededAuthError();
    }
    return { token: access, refreshToken: current };
  }
  return null;
}

// Across tabs, refreshes take turns under a Web Lock: the winner holds it until its successor is
// stored, so the next tab finds that successor and does not spend the old token again.
// A refresh that FAILS (any status, a network error, a body that is not JSON) is checked the same
// way as one that succeeds: when storage no longer holds the refresh token this refresh started
// with, a logout or a sign-in happened meanwhile, and the failure is superseded. Both callers
// (ensureFreshAccessToken and apiCall's 401 branch) then leave storage alone instead of wiping
// the newer session.
// `owner` was checked against storage by refreshAccessToken in this same turn. The lock can be
// held by another tab for a while, so the check runs once more inside it, before the request.
function refreshAccessTokenOnce(owner) {
  var rt = localStorage.getItem('refresh_token');
  var run;
  if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
    // The wait for the lock is bounded too: past REFRESH_LOCK_WAIT_MS this refresh gives up with an
    // unknown outcome (the session stays) instead of queueing behind a holder for ever.
    var waitCtl = typeof AbortController === 'function' ? new AbortController() : null;
    var waitTimer = waitCtl ? setTimeout(function() { waitCtl.abort(); }, REFRESH_LOCK_WAIT_MS) : null;
    var granted = false;
    run = navigator.locks.request('hoody-auth-refresh', waitCtl ? { signal: waitCtl.signal } : {}, function() {
      granted = true;
      if (waitTimer) clearTimeout(waitTimer);
      storedSessionOwnedBy(owner);
      return rotatedTokens(rt) || sendRefresh();
    }).catch(function(e) {
      if (waitTimer) clearTimeout(waitTimer);
      if (!granted) throw refreshUnavailableError(0);
      throw e;
    });
  } else {
    run = sendRefresh();
  }
  return Promise.resolve(run).catch(function(e) { throw refreshFailure(e, rt); });
}

// The error a failed refresh that started with `startRt` should surface.
// Storage that cannot be read proves nothing either way: the outcome is unknown (never terminal, so
// nothing is cleared on it), whatever the refresh itself answered.
function refreshFailure(e, startRt) {
  if (isSupersededAuthError(e)) return e;
  var now;
  try { now = localStorage.getItem('refresh_token'); } catch (e2) { return refreshUnavailableError(e && e.status); }
  if (now !== startRt) {
    authSuperseded = true;
    return supersededAuthError();
  }
  return e;
}

// Without Web Locks another tab may still spend the stored refresh token first. Our 401 is then a
// lost race, not a sign-out: wait briefly for the winner's write, and adopt it.
async function adoptRotatedTokens(spentRt) {
  for (var i = 0; i < 2; i++) {
    var adopted = rotatedTokens(spentRt);
    if (adopted) return adopted;
    if (i === 0) await new Promise(function(r) { setTimeout(r, 1000); });
  }
  return null;
}

// The server spends a refresh token on receipt and refuses it ever after. Inside its reuse grace
// (30 s from that spend) a second send is answered "already used"; after the grace it also ends the
// session as a copied sign-in. So a send whose outcome is unknown (no response, a 5xx or a proxy's
// page, a 2xx that cannot be read or does not carry a full pair) is sent again with the same token
// only while its first send is less than REFRESH_RETRY_WINDOW_MS old: either the first send never
// arrived and the retry rotates, or it did and the retry gets the API's verdict. Past the window the
// tokens stay and the caller gets refreshUnavailableError; a later refresh sends the same token
// again, which ends the session after the grace only when the server did spend it (and the
// successor was lost), and keeps it when the first send never arrived.
var REFRESH_RETRY_WINDOW_MS = 20000;
var REFRESH_RETRY_DELAYS_MS = [1000, 3000, 7000];
// Each send has a deadline (the request and its body): when it fires the send is aborted and its
// outcome is unknown, like a lost answer (retried inside the window, the session kept). So a refresh,
// the single-flight and the Web Lock it holds always end: the last send starts inside the window and
// ends within REFRESH_ATTEMPT_TIMEOUT_MS (plus the short wait for another tab's rotation after a 401).
// The deadlines are timers, so a suspended or busy tab may fire them late; that only lengthens the
// wait. Whether to send again is judged by msSince, never by when a timer ran.
var REFRESH_ATTEMPT_TIMEOUT_MS = 10000;
// Another tab's refresh holds the lock at most that long; waiting longer than this gives up.
var REFRESH_LOCK_WAIT_MS = 45000;

// Time since `wall`/`mono` were read: the larger of the wall clock and the page's monotonic clock,
// so neither a clock step back nor a paused monotonic clock (a suspended tab) makes it look shorter.
function msSince(wall, mono) {
  return Math.max(Date.now() - wall, monoNow() - mono);
}
function monoNow() {
  return typeof performance !== 'undefined' && performance && typeof performance.now === 'function' ? performance.now() : Date.now();
}

async function sendRefresh() {
  // Special-case path: uses the REFRESH token as the Authorization header
  // (NOT the access token) and includes the same token in the body. The
  // backend asserts that both match.
  var rt = localStorage.getItem('refresh_token');
  if (!rt) throw { status: 401, terminal: true, message: t('auth.error.sessionExpired') || 'Session expired' };
  var firstSentAt = Date.now();
  var firstSentMono = monoNow();
  for (var attempt = 0; ; attempt++) {
    // A retry is armed for `rt` and for the auth revision stored when this send went out (its
    // generation: every credential write and purge moves it), so a write during the send or during
    // the wait cancels it.
    var armedRev = authRevOrNull();
    var out = await sendRefreshOnce(rt);
    if (out.pair) return publishRefreshedPair(rt, out.pair);
    if (out.adopted) return out.adopted;
    if (out.refused) throw out.refused;
    var delay = REFRESH_RETRY_DELAYS_MS[attempt];
    if (!out.retry || delay === undefined || msSince(firstSentAt, firstSentMono) + delay >= REFRESH_RETRY_WINDOW_MS) {
      throw refreshUnavailableError(out.status);
    }
    // When the timer fires nothing is sent unless `rt` and the armed revision still match and the
    // window has not passed.
    await new Promise(function(r) { setTimeout(r, delay); });
    // Storage moved while we waited: another tab's rotation of this session is adopted; a logout
    // or a sign-in means our token is no longer the one to send. Storage that cannot be read sends
    // nothing more and keeps the outcome unknown.
    var storedRt;
    try { storedRt = localStorage.getItem('refresh_token'); } catch (e) { throw refreshUnavailableError(out.status); }
    if (storedRt !== rt) {
      var rotated = rotatedTokens(rt);
      if (rotated) return rotated;
      authSuperseded = true;
      throw supersededAuthError();
    }
    // A timer can fire late (a suspended or throttled tab): the window is judged again before the
    // next send, never only when the wait was scheduled. Another write meanwhile (the revision
    // moved) also ends the retries; the session stays and the outcome stays unknown.
    if (armedRev === null || authRevOrNull() !== armedRev || msSince(firstSentAt, firstSentMono) >= REFRESH_RETRY_WINDOW_MS) {
      throw refreshUnavailableError(out.status);
    }
  }
}

// The stored auth revision, or null when storage cannot be read (never equal to an armed one).
function authRevOrNull() {
  try { var v = readAuthRev(); return v === null ? '' : v; } catch (e) { return null; }
}

// One send of `rt`. Returns { pair } (a full successor pair), { adopted } (another tab's rotation,
// after our 401), { refused } (the API's verdict that the token is finished), or { status, retry }
// for an unknown outcome. A 429 is the limiter's answer before the handler runs: the token was not
// spent, and sending again at once would only be refused again, so it is not retried.
async function sendRefreshOnce(rt) {
  var ctl = typeof AbortController === 'function' ? new AbortController() : null;
  var timer = null;
  var expired = new Promise(function(resolve) {
    timer = setTimeout(function() { if (ctl) ctl.abort(); resolve(null); }, REFRESH_ATTEMPT_TIMEOUT_MS);
  });
  var answer;
  // A standalone page that may not send (hubApiRoot): the refresh token stays unspent and the outcome
  // unknown; nothing is retried against an origin storage no longer names.
  var root = hubApiRoot();
  if (root === null) { clearTimeout(timer); return { status: 0, retry: false }; }
  try {
    // The deadline covers the request and its body; a late answer after it is ignored (aborted).
    answer = await Promise.race([expired, (async function() {
      var r = await fetch(`${root}/users/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + rt,
        },
        body: JSON.stringify({ refreshToken: rt }),
        // The refresh token is in the body and the header: a redirect never carries it on to wherever it points (a
        // 307/308 would resend both). A redirect answer rejects here and reads as no answer (retry, token unspent).
        redirect: 'error',
        signal: ctl ? ctl.signal : undefined,
      });
      var d = null;
      try { d = await r.json(); } catch (e) { d = null; }
      return { res: r, data: d };
    })().catch(function() { return null; })]);
  } catch (e) {
    answer = null;
  } finally {
    clearTimeout(timer);
  }
  if (!answer) return { status: 0, retry: true };
  var res = answer.res, data = answer.data;
  if (!res.ok) {
    var adopted = res.status === 401 ? await adoptRotatedTokens(rt) : null;
    if (adopted) return { adopted: adopted };
    if (refreshRefusedSession(res.status, data)) {
      return { refused: { status: res.status, terminal: true, message: (data && data.message) || 'Refresh failed' } };
    }
    return { status: res.status, retry: res.status !== 429 };
  }
  var pair = refreshedPair(rt, data);
  return pair ? { pair: pair } : { status: res.status, retry: true };
}

// The successor pair of a 2xx refresh answer ({ data: { token, refreshToken, expires_at, ... } },
// the login shape), or null when it does not hold two tokens of the same user as `rt`. Nothing is
// stored from a partial answer: an access token without its refresh successor would keep a refresh
// token the server may already have spent.
function refreshedPair(rt, data) {
  var p = data && typeof data === 'object' && !Array.isArray(data) ? (data.data || data) : null;
  return sessionPair(p, sessionTokenUid(rt));
}
// `p` when it holds an access token and a refresh token that both name one readable user (`uid`
// when given), else null: a pair whose user cannot be read is never stored.
function sessionPair(p, uid) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  if (typeof p.token !== 'string' || !p.token || typeof p.refreshToken !== 'string' || !p.refreshToken) return null;
  var u = uid || sessionTokenUid(p.refreshToken);
  if (!u || sessionTokenUid(p.token) !== u || sessionTokenUid(p.refreshToken) !== u) return null;
  return p;
}

function publishRefreshedPair(rt, payload) {
  // Publish fence. The refresh token we spent was read before the network wait; if storage no
  // longer holds it, a logout or a sign-in (possibly as another user) happened meanwhile, and
  // writing now would restore a signed-out session or overwrite the newer one. Publish nothing,
  // remove nothing, and tell the caller its session is gone (superseded, not expired: the
  // refresh-failure paths must not clear storage for it). A rotation by another tab never gets
  // here: under the Web Lock it is adopted before sending, and without one our request loses
  // the single-use race and adoptRotatedTokens takes the 401 path above.
  if (localStorage.getItem('refresh_token') !== rt) {
    authSuperseded = true;
    throw supersededAuthError();
  }
  bumpAuthRevQuiet();
  localStorage.setItem('access_token', payload.token);
  localStorage.setItem('access_token_expires_at', payload.expires_at || '');
  localStorage.setItem('refresh_token', payload.refreshToken);
  localStorage.setItem('refresh_token_expires_at', payload.refresh_expires_at || '');
  return payload;
}

// Only the API's own answer that this refresh token is finished signs the user out: its 401 error
// envelope (the session was ended, the token expired, was already spent or is not ours) or a ban.
// A 429 from the refresh limiter, a 5xx, a proxy's page or a lost connection says nothing about
// the session, so the tokens stay and the caller gets refreshUnavailableError.
function refreshRefusedSession(status, data) {
  var ours = !!data && typeof data === 'object' && typeof data.error === 'string';
  if (status === 401) return ours && data.statusCode === 401;
  return status === 403 && ours && data.error === 'ACCOUNT_BANNED';
}
// The error a refresh that did not reach a verdict surfaces: never status 401 (every page reads a
// 401 as signed out), nothing cleared. See REFRESH_RETRY_WINDOW_MS for what a later refresh risks.
function refreshUnavailableError(status) {
  return { status: status && status !== 401 ? status : 0, code: 'REFRESH_UNAVAILABLE', transient: true, message: t('auth.error.generic') };
}
function isTerminalRefreshFailure(e) {
  return !!(e && e.terminal === true);
}

// The error a refresh throws when storage changed hands while it was in flight. status 401 keeps
// every "signed out" branch working; `superseded` tells the refresh-failure paths below (and
// any page's own 401 handler) that the session in storage now belongs to someone else, or to
// nobody, and must not be cleared on this page's behalf.
// Latched for the life of the page once a refresh found storage changed hands: from then on
// this page's session is gone, and its 401 handlers must leave storage alone.
var authSuperseded = false;
function authSessionSuperseded() {
  return authSuperseded;
}
function supersededAuthError() {
  return { status: 401, superseded: true, message: t('auth.error.sessionExpired') || 'Session expired' };
}
function isSupersededAuthError(e) {
  return !!(e && e.superseded === true);
}

// After an awaited refresh failure `e`, the caller acts only while storage still holds the refresh
// token that failed. refreshFailure checks this when the refresh settles, but a continuation of the
// shared refresh promise that ran before the caller's may have installed another session since (any
// user's, or a rotation by another tab): then the failure is superseded and nothing is touched.
// Otherwise a refresh that got no verdict throws refreshUnavailableError with storage untouched, and
// only the API's refusal clears it (the caller then throws its 401).
function clearAfterFailedRefresh(spentRt, e) {
  var now;
  // Unreadable storage: nothing is known about the session, so nothing is cleared or called signed out.
  try { now = localStorage.getItem('refresh_token'); } catch (e2) { throw refreshUnavailableError(e && e.status); }
  if (now !== spentRt) {
    authSuperseded = true;
    throw supersededAuthError();
  }
  if (!isTerminalRefreshFailure(e)) throw refreshUnavailableError(e && e.status);
  clearAuthTokens({ reason: 'refresh' });
}

// `expectedUid` is required, as for refreshAccessToken: the user the caller works for (apiCall's
// operation user, hub-buy's Hub identity). The stored token is checked against it before anything
// can refresh it, so a caller never sends another user's refresh token, and never rotates or
// clears their session. It may instead be a page identity ({kind, uid, sid}): its bearer, only
// while storage holds exactly that identity; a token session's bearer never refreshes.
async function ensureFreshAccessToken(expectedUid) {
  if (expectedUid === undefined) throw refreshOwnerRequiredError();
  if (isSessionIdentity(expectedUid)) {
    var id = expectedUid;
    if (!holdsIdentity(id)) { authSuperseded = true; throw supersededAuthError(); }
    if (id.kind === 'token') return storedSession().bearer;
    var held = await ensureFreshAccessToken(id.uid);
    if (held && !holdsIdentity(id)) { authSuperseded = true; throw supersededAuthError(); }
    return held;
  }
  var token = localStorage.getItem('access_token');
  if (!token) return null;
  operationToken(token, expectedUid);
  var expiresAtIso = localStorage.getItem('access_token_expires_at');
  if (!expiresAtIso) return token; // Unknown expiry; attach and let the server decide.
  var expiresMs = Date.parse(expiresAtIso);
  if (isNaN(expiresMs)) return token;
  // Refresh if expiry is less than 60 s away.
  if (expiresMs - Date.now() > 60 * 1000) return token;
  // Single-flight: refreshAccessToken reuses any in-flight refresh for the same user.
  var spentRt = localStorage.getItem('refresh_token');
  try {
    await refreshAccessToken(expectedUid);
  } catch (e) {
    // A refresh the server refused clears tokens and bubbles 401. A superseded refresh clears
    // nothing (storage already holds the newer state), nor does one that never got a verdict.
    if (isSupersededAuthError(e)) throw e;
    clearAfterFailedRefresh(spentRt, e);
    throw { status: 401, message: (e && e.message) || 'Session expired' };
  }
  // Storage is read again after the wait, and another tab may have installed another session
  // meanwhile (in a continuation of the shared refresh that ran before this one). The caller may
  // send what this returns as an explicit bearer (hub-buy's preflight), past apiCall's own checks,
  // so it is held to the owner here too: another user's or an unreadable token is superseded.
  var fresh = localStorage.getItem('access_token');
  if (!fresh) return null;
  return operationToken(fresh, expectedUid);
}

// The changes whose body carries the account password typed again, and whose wrong password the API answers
// with 401 INVALID_TOKEN (the 2FA setup, turning 2FA off, new backup codes, and the key gate switched off).
// apiCall never sends one of these a second time over that answer (see its 401 branch).
var REAUTH_PASSWORD_ROUTES = [
  'POST /users/auth/2fa/setup',
  'DELETE /users/auth/2fa',
  'POST /users/auth/2fa/backup-codes/regenerate',
  'PUT /users/auth/2fa/token-gate',
  // The API serves PATCH wherever it serves PUT.
  'PATCH /users/auth/2fa/token-gate',
];
// The 401 codes only the sign-in check answers: never a refusal of something typed.
var SESSION_ONLY_CODES = ['TOKEN_EXPIRED', 'MISSING_TOKEN', 'SESSION_REVOKED'];
function carriesTypedPassword(method, path, body) {
  if (!body || typeof body !== 'object' || typeof body.password !== 'string') return false;
  var bare = String(path).split('?')[0].replace(/\/+$/, '');
  return REAUTH_PASSWORD_ROUTES.indexOf(String(method).toUpperCase() + ' ' + bare) !== -1;
}

// The fifth parameter `_retried` is internal: set to `true` by the reactive
// 401 branch below when retrying a request after a successful refresh, so a
// second 401 can't re-enter the refresh loop. Never pass it from callers.
// The source channel this UI reports to the API for signup/login analytics.
//
// A literal, deliberately: public/auth/*.js is served VERBATIM by fastifyStatic with no bundler,
// no build step, and no process.env / import.meta.env — there is nothing here to inject through.
// (serveAuthPage's templating is HTML-only and fixed-key.)
//
// The browser terminal on ssh.<domain> is NOT this UI: it runs the `hoody` CLI inside the SSH
// gateway sandbox and reports `webssh` from there.
const CLIENT_CHANNEL = 'web';

/**
 * Attach the source channel to an outgoing auth body.
 *
 * Only the auth routes declare `client`; adding it everywhere would be harmless (no route sets
 * additionalProperties:false) but noisy, so it is applied at the auth call sites only.
 */
function withClientChannel(body) {
  return Object.assign({}, body || {}, { client: CLIENT_CHANNEL });
}

// The sixth parameter `opts` is additive (existing ≤5-arg callers unaffected):
//   { timeoutMs } — an AbortController bound to THIS fetch. Abort throws the
//   {status:0, code:'TIMEOUT'} sentinel; status 0 keeps the market's transport-
//   ambiguity predicate honest (no numeric server verdict arrived). The budget
//   covers the HEADERS *and* the BODY (see the read below) — a response whose
//   headers arrive and whose body then stalls is the ordinary shape of a wedged
//   proxy, and without it the request would stay alive forever. This still bounds only
//   the network leg — the token-refresh waits above carry no signal, which is
//   exactly why purchase flows ALSO race the whole operation in withDeadline
//   (hub-market.js); the signal here is best-effort hygiene, not the guarantee.
//   { alive } — optional () => boolean from the caller's view (dialog still open,
//   page not left). Checked right before EVERY fetch, so after each token wait
//   and on each retry; false rejects with the local {status:0, code:'CANCELLED',
//   cancelled:true} and sends nothing. Callers without it are unaffected.
//   { owner } — the user id this request is for, when the caller knows it (the Hub identity a
//   dialog opened for, a boot token's user, the user an OTP retry started under). Every bearer
//   attached from storage, on the first send and on every retry, must belong to it; otherwise the
//   call ends superseded without sending. Without it the owner is the stored session's user at
//   the call's start (fine for a single-shot request). An empty owner refuses the call.
//   { session } — a page identity {kind, uid, sid} (the new Hub's Hub.session.page); it wins over
//   owner. Every bearer is attached only while storage holds exactly that identity (all three
//   fields; a newer sign-in of the same user is not it), otherwise superseded and unsent. A token
//   session's bearer is its record's token: never refreshed, and a 401 is answered as it came.
//   { base } — the Hub's realm API host (Hub.realm.hubApiBase): exactly `https://<24-hex>.<D>/api/v1`
//   where D is this page's realm API domain (realmApiDomain(), the meta the server renders from the
//   same value as the CSP). Anything else, and any base on a page without that meta, refuses the
//   call (notSent), so the bearer only ever goes to this page's API or a realm host of it. The refresh always uses this page's API. Kept on every retry, so a 2FA retry
//   reuses the host its operation started on.
//   { onSend } — optional () => void, called right before EVERY fetch of the request itself (never
//   for a refresh), after the last cancel check. A caller learns from it that the request really
//   went out: work refused before it (a failed refresh, a cancel, a bad base) never calls it.
function apiCallCancelled(opts) {
  return !!(opts && typeof opts.alive === 'function' && !opts.alive());
}
function apiCallCancelledError() {
  return { status: 0, code: 'CANCELLED', cancelled: true, message: t('auth.error.generic') };
}
var REALM_API_HOST_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
// This page's realm API domain (meta hx-api-realm-domain, rendered by serveAuthPage from the value
// the CSP's realm connect source uses), or '' when the page names none or the value is malformed.
function realmApiDomain() {
  // The standalone Hub has no server-rendered meta: its realm API domain came with its API origin.
  if (STANDALONE_PAGE) return standaloneApi ? standaloneApi.realmApiDomain : '';
  try {
    var m = document.querySelector('meta[name="hx-api-realm-domain"]'), v = m ? m.getAttribute('content') : '';
    return v && REALM_API_HOST_RE.test(v) ? v : '';
  } catch (e) { return ''; }
}
function apiCallBase(opts) {
  var b = opts && opts.base;
  // API_BASE names the base host on every page; hubApiRoot() says where that is (API_BASE itself on a
  // served page). A standalone page that may not send refuses every base, a realm host included.
  var root = hubApiRoot();
  if (root !== null) {
    if (b === undefined || b === API_BASE) return root;
    var d = realmApiDomain(), m = typeof b === 'string' ? /^https:\/\/([0-9a-f]{24})\.(.+)\/api\/v1$/.exec(b) : null;
    if (d && m && m[2] === d) return b;
  }
  throw { status: 0, code: 'BAD_API_BASE', notSent: true, message: t('auth.error.generic') };
}
// ── Framed sensitive-action lock ──────────────────────────
// A page shown inside a frame (any frame: the Board embed, a same-origin wrapper, or a framing
// that slipped past frame-ancestors) never sends a request that mints or reveals a credential,
// moves money or changes account security. A frame can be overlaid (clickjacking), so these
// requests need a top-level page the user can see. The check runs before the token refresh and
// the fetch, so a refused request sends nothing. This list is the one source: the Hub's own
// request helpers reuse framedSensitiveRoute() rather than keeping a copy.
// Entries: path (relative to API_BASE, query ignored) and the methods it covers ('*' = all).
var FRAMED_SENSITIVE_ROUTES = [
  // Token mint, list, introspection, realm edits and revoke (the boot token included).
  { methods: '*', path: /^\/auth\/tokens(?:\/|$)/ },
  // 2FA setup, codes, the token gate and disabling 2FA. The sign-in step (/2fa/verify, sent with
  // the two-factor bearer from the embeddable 2FA page) and the status read stay allowed.
  { methods: '*', path: /^\/users\/auth\/2fa(?:\/(?:setup|verify-setup|backup-codes\/regenerate|token-gate))?$/ },
  // Account security: sessions, the global sign-out (POST /users/auth/logout revokes every
  // device's tokens), security history, identity claims.
  { methods: '*', path: /^\/users\/auth\/(?:sessions|identity-claim)(?:\/|$)/ },
  { methods: ['POST'], path: /^\/users\/auth\/logout$/ },
  { methods: '*', path: /^\/users\/me\/security-history$/ },
  // Self-service email change: request and cancel, and the confirm / undo links.
  { methods: '*', path: /^\/users\/me\/email-change$/ },
  { methods: ['POST'], path: /^\/auth\/email-change\/(?:confirm|revert)$/ },
  { methods: ['POST'], path: /^\/auth\/two-factor\/undo$/ },
  // Account changes: password, email, delete (PUT/PATCH/DELETE /users/:id).
  { methods: ['PUT', 'PATCH', 'DELETE'], path: /^\/users\/[^/]+$/ },
  // Secrets vault.
  { methods: '*', path: /^\/vault(?:\/|$)/ },
  // A project's access rules: the read returns the passwords and keys that open every computer in it.
  { methods: '*', path: /^\/projects\/[0-9a-f]{24}\/proxy\/permissions(?:\/|$)/ },
  // A computer's access rules: the same secrets for one computer.
  { methods: '*', path: /^\/computers\/[0-9a-f]{24}\/proxy\/permissions(?:\/|$)/ },
  // A computer's environment variables: the read answers their values, the writes carry them.
  { methods: '*', path: /^\/computers\/[0-9a-f]{24}\/env(?:\/|$)/ },
  // Payments, payment methods and transfers. `pay: true` marks the entries that move money: the
  // standalone Hub hands those to the served Hub (standaloneHandoffRoute).
  { methods: '*', path: /^\/wallet\/(?:payments|payment-methods)(?:\/|$)/, pay: true },
  { methods: ['POST', 'PUT', 'PATCH', 'DELETE'], path: /^\/wallet\/transfers(?:\/|$)/, pay: true },
  // Buying: rent, reserve, extend, subscribe, pay, upgrade, cancel, auto-renew. Auto-renew on/off
  // and cancel charge nothing: `setting: true` gives them the settings words on the standalone Hub
  // (standaloneHandoffError); they stay `pay` entries, so exactly the same routes are handed off.
  // They come before the subscription row because the first matching entry decides.
  { methods: ['POST'], path: /^\/servers\/[^/]+\/rent$/, pay: true },
  { methods: ['POST'], path: /^\/offers\/[^/]+\/reserve$/, pay: true },
  { methods: ['POST'], path: /^\/rentals\/[^/]+\/extend$/, pay: true },
  { methods: ['PUT', 'PATCH'], path: /^\/subserver-subscriptions\/[^/]+\/auto-renew$/, pay: true, setting: true },
  { methods: ['POST'], path: /^\/subserver-subscriptions\/[^/]+\/cancel$/, pay: true, setting: true },
  { methods: ['POST', 'PUT', 'PATCH', 'DELETE'], path: /^\/subserver-subscriptions(?:\/|$)/, pay: true },
  // Bot URL keys (create, list, edit, rotate, revoke, revoke all) and panic.
  { methods: '*', path: /^\/bot-urls\/[^/]+\/keys(?:\/|$)/ },
  { methods: '*', path: /^\/bot-urls\/[^/]+\/panic$/ },
  // A computer agent's sign-in with the boot token (Hub.api scope 'agent', a path under the
  // agent's /api/v1/agent; the transport refuses every framed agent change as well).
  { methods: ['POST'], path: /^\/hoody\/auth\/bootstrap$/ },
];

// True when this document is not the top-level page. A cross-origin parent still compares by
// reference; reading `top` itself can only throw in exotic embeddings, which count as framed.
function isFramedPage() {
  try { return window.self !== window.top; } catch (e) { return true; }
}

// The FRAMED_SENSITIVE_ROUTES entry for (method, path), or null.
function framedSensitiveRoute(method, path) {
  var m = String(method || 'GET').toUpperCase();
  var p = String(path || '').split('?')[0].split('#')[0];
  for (var i = 0; i < FRAMED_SENSITIVE_ROUTES.length; i++) {
    var r = FRAMED_SENSITIVE_ROUTES[i];
    if ((r.methods === '*' || r.methods.indexOf(m) !== -1) && r.path.test(p)) return r;
  }
  return null;
}

// The typed refusal. Not status 0: that means "the verdict never arrived" to the purchase flows,
// and this request was never sent, so the outcome is known.
function framedRefusedError() {
  return { status: 403, code: 'FRAMED_ACTION_REFUSED', framed: true, notSent: true, message: t('auth.hub.framedRefused') };
}

// The standalone Hub's hand-off: the FRAMED_SENSITIVE_ROUTES entry a standalone page does not send
// itself, or null. By default the money entries (`pay`); 'sensitive' hands off the whole list,
// 'none' nothing (STANDALONE_HANDOFF). A served page hands off nothing.
function standaloneHandoffRoute(method, path) {
  if (!STANDALONE_PAGE || STANDALONE_HANDOFF === 'none') return null;
  var r = framedSensitiveRoute(method, path);
  return r && (STANDALONE_HANDOFF === 'sensitive' || r.pay === true) ? r : null;
}
// Refused unsent, like a framed refusal: the request is one to finish in the served Hub. Only a
// money entry (`pay` without `setting`) gets the payment code; a settings switch (`setting: true`)
// and, in the 'sensitive' build, every other entry (vault, keys, 2FA, account) get the settings code,
// so the Hub says "change this" rather than "payments".
function standaloneHandoffError(r) {
  var code = r && r.pay === true && r.setting !== true ? 'STANDALONE_HANDOFF' : 'STANDALONE_SETTINGS_HANDOFF';
  return { status: 403, code: code, handoff: true, notSent: true, message: t('auth.error.generic') };
}

// An operation or dialog bound to the user it opened for (a purchase and its recovery, a form and
// its 2FA resubmit, a dialog's confirm). Call it when the operation opens: it reads the stored
// session's user once and returns own(opts) → apiCall opts carrying { owner } for every later call
// of that operation. With no readable user the owner is null, which apiCall refuses; once another
// user is stored, apiCall refuses too (superseded, nothing sent). own.owner is the user;
// own.live() says whether the stored session still is that user's. `shown`, when given, is the
// user the page displays (a Hub identity): the operation is bound to it instead of to storage, so
// one opened after another tab signed in as someone else refuses rather than adopting them.
// `shown` may instead be a page identity ({kind, uid, sid}, the new Hub's Hub.session.page): the
// operation is bound to exactly that session (apiCall opts.session), and own.live() is true only
// while storage holds it. With a string or no argument a token session is never anyone's:
// own.live() is false whenever no account session is stored, so that form refuses under it.
function bindOperationOwner(shown) {
  if (isSessionIdentity(shown)) {
    var id = shown;
    var bound = function (opts) { return Object.assign({}, opts || {}, { owner: id.uid, session: id }); };
    bound.owner = id.uid;
    bound.session = id;
    bound.live = function () { return holdsIdentity(id); };
    return bound;
  }
  var owner = null;
  if (shown !== undefined && shown !== null && shown !== '') owner = String(shown);
  else { try { owner = sessionTokenUid(localStorage.getItem('access_token')); } catch (e) { owner = null; } }
  function own(opts) { return Object.assign({}, opts || {}, { owner: owner }); }
  own.owner = owner;
  own.live = function () {
    try { return !!owner && sessionTokenUid(localStorage.getItem('access_token')) === owner; } catch (e) { return false; }
  };
  return own;
}
// bindOperationOwner for one action of a Hub page, read when the action starts: bound to the user
// the Hub displays (window.Hub.state's identity; `state` is a value or a function
// returning it), else to the stored session's user (no Hub on the page, or no identity shown yet). A token
// session's page binds to its frozen identity (Hub.session.page) instead.
function bindShownOwner() {
  var id = null;
  try {
    var pg = window.Hub && window.Hub.session && window.Hub.session.page;
    if (isSessionIdentity(pg) && pg.kind === 'token') return bindOperationOwner(pg);
  } catch (e) {}
  try {
    var st = window.Hub && window.Hub.state;
    if (typeof st === 'function') st = st();
    id = st && st.identity && st.identity.id;
  } catch (e) { id = null; }
  return bindOperationOwner(id !== undefined && id !== null && id !== '' ? String(id) : undefined);
}

// The bearer an apiCall operation sends must belong to the user it started under (`opUid`, the
// `id` claim of the stored access token, read before the call's first await). A refresh the call
// waits on, and its retry, read storage again later; if another tab signed in as someone else in
// between, that read returns the other user's token. Checked on every token actually attached,
// right before the send: another user's, or an unreadable one, is the superseded 401 (nothing
// sent with it, storage untouched). An operation that started with no stored token sends no
// bearer first; if the reactive refresh below gives it one, that first bearer names its user.
function operationToken(token, opUid) {
  if (!opUid || sessionTokenUid(token) !== opUid) {
    authSuperseded = true;
    throw supersededAuthError();
  }
  return token;
}

// The Hub page (/auth/home, both Hubs) in a frame refuses every change, not only the sensitive
// routes: a change needs a page the user can see. The other auth
// pages keep the sensitive list only: login, sign-up and 2FA are embeddable by allowlisted sites
// and must still post there.
function framedHubPage() {
  if (!isFramedPage()) return false;
  // The standalone Hub is the Hub page whatever its address.
  if (STANDALONE_PAGE) return true;
  try { return /^\/auth\/home(?:[/.-]|$)/.test(window.location.pathname); } catch (e) { return true; }
}
function framedHubChange(method) {
  var m = String(method || 'GET').toUpperCase();
  return m !== 'GET' && m !== 'HEAD' && framedHubPage();
}

var TRACE_ID_SHAPE = /^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-fA-F]{16,64})$/;
// The rejection with its trace id, only when the answer carried one: without one its fields are unchanged.
function withTraceId(e, traceId) { if (traceId) e.traceId = traceId; return e; }
async function apiCall(method, path, body, bearerToken, _retried, opts, _opUid) {
  if (isFramedPage() && (framedSensitiveRoute(method, path) || framedHubChange(method))) throw framedRefusedError();
  var handedOff = STANDALONE_PAGE ? standaloneHandoffRoute(method, path) : null;
  if (handedOff) throw standaloneHandoffError(handedOff);
  const base = apiCallBase(opts);
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  // { ifMatch } — the If-Match header (a document version the server compares, e.g. file:v3). Every retry
  // below re-enters with the same opts, so a refreshed or 2FA retry sends the same precondition.
  if (opts && typeof opts.ifMatch === 'string') headers['If-Match'] = opts.ifMatch;
  // { ifNoneMatch: '*' } — If-None-Match: * (create only: the server refuses with 412 when the document exists), sent
  // on every retry the same way.
  if (opts && opts.ifNoneMatch === '*') headers['If-None-Match'] = '*';
  // { onEtag } — called with a success answer's ETag header (null when it has none) right before it is returned,
  // so a page can send it back as If-Match on its next change of the same document. The caller's note only.

  // Explicit bearerToken arg wins (PKCE intent-token flow in completeAuth()).
  // Otherwise, attach the localStorage access_token with proactive refresh.
  // `sentToken` records what we actually put on the wire so a 401 response
  // can check whether another tab has since rotated the token in storage.
  let sentToken = null;
  // `_opUid` is internal, like `_retried`: the retries below carry the operation's user. A caller
  // that knows its user passes it as opts.owner (see above).
  // { anonymous: true } — a call made as nobody (the sign-in form, the code exchange): stored
  // the stored session is not read, attached, refreshed or cleared for it, so a wrong password's 401 is
  // that password's answer, never a reason to refresh and send the password a second time.
  var anonymous = !!(opts && opts.anonymous === true) && !bearerToken;
  var opUid, sess = opts && isSessionIdentity(opts.session) ? opts.session : null, tokenBearer = false;
  if (_opUid !== undefined) opUid = _opUid;
  else if (anonymous) opUid = null;
  else if (sess) opUid = sess.uid;
  else if (opts && opts.owner !== undefined) {
    if (!opts.owner) throw supersededAuthError();
    opUid = String(opts.owner);
  }
  // A flow's own bearer (a 2FA or intent token) is that flow's credential: the stored session is not read for it.
  else if (bearerToken) opUid = null;
  else opUid = sessionTokenUid(localStorage.getItem('access_token'));
  if (bearerToken) {
    headers['Authorization'] = 'Bearer ' + bearerToken;
  } else if (anonymous) {
    // nothing attached
  } else if (sess && sess.kind === 'token') {
    // Nothing awaits between this read and fetch().
    if (!holdsIdentity(sess)) { authSuperseded = true; throw Object.assign(supersededAuthError(), { notSent: true }); }
    sentToken = storedSession().bearer;
    headers['Authorization'] = 'Bearer ' + sentToken;
    tokenBearer = true;
  } else if (sess && !holdsIdentity(sess)) {
    // An account page whose session is no longer stored (signed out, or replaced, even by a token
    // of the same owner): nothing is sent for it, not even without a bearer.
    authSuperseded = true;
    throw Object.assign(supersededAuthError(), { notSent: true });
  } else {
    // A refresh that fails before this call's first send leaves THIS call unsent (notSent). The
    // rejection can be shared (one refresh serves every caller), so it is copied, never marked in
    // place. It says nothing about earlier calls of the same operation (an OTP resubmit is a new
    // call): the operation's caller keeps that history itself (opts.onSend).
    try { var token = await ensureFreshAccessToken(opUid); } catch (e) {
      if (!_retried && e && typeof e === 'object') throw Object.assign({}, e, { message: e.message, notSent: true });
      throw e;
    }
    if (token) {
      // The last storage read this request uses: nothing awaits between here and fetch().
      headers['Authorization'] = 'Bearer ' + operationToken(token, opUid);
      if (sess && !holdsIdentity(sess)) { authSuperseded = true; throw supersededAuthError(); }
      sentToken = token;
    }
  }

  // Timeout wiring (opts.timeoutMs): abort maps to the TIMEOUT sentinel; every
  // OTHER fetch rejection (DNS failure, connection reset — a raw TypeError)
  // propagates UNWRAPPED, deliberately: "no numeric status" is how callers
  // recognize that the server's verdict never arrived.
  var timeoutCtl = null, timeoutTimer = null;
  if (opts && typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0 && typeof AbortController === 'function') {
    timeoutCtl = new AbortController();
    timeoutTimer = setTimeout(function () { timeoutCtl.abort(); }, opts.timeoutMs);
  }
  // Last check before the wire: every await above (token refresh) and every retry below
  // (each re-enters here) passes through this line.
  if (apiCallCancelled(opts)) {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    throw apiCallCancelledError();
  }
  if (opts && typeof opts.onSend === 'function') { try { opts.onSend(); } catch (e) { /* the caller's note only */ } }
  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: timeoutCtl ? timeoutCtl.signal : undefined,
      // { noRedirect: true } — a password, 2FA step token or check secret sent to a Hoody the page names (the
      // one-file Hub's sign-in calls): a redirect is refused, so its body never reaches another host. The refusal
      // rejects like no answer (no status). Every other call keeps fetch's default.
      redirect: opts && opts.noRedirect === true ? 'error' : undefined,
    });
  } catch (e) {
    if (timeoutCtl && timeoutCtl.signal.aborted) {
      throw { status: 0, code: 'TIMEOUT', message: t('auth.error.generic') };
    }
    throw e;
  }
  // The abort budget stays ARMED across body consumption and is cleared only once
  // the body has been read. Clearing it at header time let a server or proxy that
  // sent headers and then stalled the stream hold the request — socket, promise
  // and response buffer — for the life of the tab; the market's withDeadline
  // wrappers race the CALLER's promise but cannot abort the underlying read, so
  // repeated stalls accumulated indefinitely.
  let data;
  try {
    // An abort that killed the BODY is a TIMEOUT, not an empty object: "couldn't read it" must never become "the server
    // said nothing", which every caller reads as success.
    var isRead = /^(GET|HEAD)$/i.test(String(method));
    let text = null;
    let parsed;
    try {
      if (typeof res.text === 'function') text = await res.text();
      else { parsed = await res.json(); text = parsed === undefined ? null : JSON.stringify(parsed); } // a response object with json() only
    } catch (e) {
      if (timeoutCtl && timeoutCtl.signal.aborted) {
        throw { status: 0, code: 'TIMEOUT', message: t('auth.error.generic') };
      }
    }
    if (text !== null && text.trim() === '' && (res.ok || isRead)) {
      data = {}; // a body sent empty on purpose (204, an empty 2xx): the pre-existing contract
    } else {
      try { data = text === null ? undefined : JSON.parse(text); } catch (e) { data = undefined; }
      if (data === undefined) {
        // The status line came but what the server said did not (the body lost on the way, cut off, or not the API's
        // JSON). A read answers {} as before. A change cannot be judged from the status alone (a 409's code may be a
        // still-running one; a 2xx's body may be what tells what happened): it is an answer that never arrived, so
        // status 0 (no verdict), and the caller treats it as possibly applied.
        if (isRead) {
          data = {};
        } else {
          throw { status: 0, code: 'BODY_UNREADABLE', httpStatus: res.status, message: t('auth.error.generic') };
        }
      }
    }
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
  }
  if (!res.ok) {
    // Reactive refresh: one retry after refreshing. Only on the localStorage
    // auth path, never on the refresh endpoint, never more than once.
    // Only a 401 about the token itself renews the session and is sent again: the codes the API's sign-in
    // check answers (TOKEN_EXPIRED, MISSING_TOKEN, SESSION_REVOKED, and INVALID_TOKEN, which a 401 that
    // names no code of its own also carries), the bare UNAUTHORIZED of an answer that is not the API's own,
    // or an answer with no readable code. Compared in upper case, so a framework's or a proxy's
    // `Unauthorized` never reads as a route's refusal.
    // A 401 naming any other code (a wrong current password, a wrong or used 2FA code, a code required)
    // is the route refusing what was asked, not the session: refreshing and resending would spend a second
    // attempt with the same input against the route's budget, and a failed refresh would sign the user out
    // over a typo. It is thrown below as it came: sent once, no refresh, storage untouched.
    var tokenCodes = ['INVALID_TOKEN', 'TOKEN_EXPIRED', 'MISSING_TOKEN', 'SESSION_REVOKED', 'UNAUTHORIZED'];
    var answerCodes = [data && data.error, data && data.code].filter(function (c) { return typeof c === 'string' && c !== ''; });
    var routeRefusal = answerCodes.some(function (c) { return tokenCodes.indexOf(c.toUpperCase()) === -1; });
    // A request that carries the account password typed again (REAUTH_PASSWORD_ROUTES): a wrong password is
    // answered there with 401 INVALID_TOKEN, the code a bad token gets, so that code cannot tell the two apart.
    // Only a code that can only be about the session (SESSION_ONLY_CODES) renews it and sends again; every other
    // 401 is thrown below as it came, so the typed password goes out once. A token at its expiry was already
    // renewed before the send (ensureFreshAccessToken above).
    if (!routeRefusal && carriesTypedPassword(method, path, body)) {
      routeRefusal = !answerCodes.some(function (c) { return SESSION_ONLY_CODES.indexOf(c.toUpperCase()) !== -1; });
    }
    if (
      res.status === 401 &&
      !routeRefusal &&
      !bearerToken &&
      !anonymous &&
      !tokenBearer &&
      !_retried &&
      path !== '/users/auth/refresh' &&
      localStorage.getItem('refresh_token')
    ) {
      // Cross-tab race: another tab may have already rotated the access token
      // before our request reached the server. Retry once with the current
      // storage value BEFORE triggering a new refresh.
      var currentToken = localStorage.getItem('access_token');
      if (currentToken && currentToken !== sentToken) {
        // Only a rotation of the same session (same user and same session id) is retried; another
        // user's token, a newer sign-in of the same user, or an unreadable token means storage changed
        // hands: superseded, nothing sent or cleared.
        var sentUid = sessionTokenUid(sentToken);
        if (!sentUid || sessionTokenUid(currentToken) !== sentUid ||
            sessionTokenSid(currentToken) !== sessionTokenSid(sentToken)) {
          authSuperseded = true;
          throw supersededAuthError();
        }
        return apiCall(method, path, body, bearerToken, true, opts, opUid);
      }
      // Otherwise start (or coalesce into) a refresh, then retry once. It is for the operation's
      // user; an operation that started with no stored token (nothing sent as anyone yet) adopts
      // the stored session's user, which the token check below then holds it to.
      var spentRt = localStorage.getItem('refresh_token');
      try {
        await refreshAccessToken(opUid ? opUid : (sentToken === null ? REFRESH_OWNER_ADOPT : null));
      } catch (e) {
        if (isSupersededAuthError(e)) throw e;
        clearAfterFailedRefresh(spentRt, e);
        throw { status: 401, message: (e && e.message) || 'Session expired' };
      }
      // Nothing sent yet as anyone (no stored token at the start): the token the refresh left names
      // the user, read in the same turn as ensureFreshAccessToken's own read below.
      if (!opUid && sentToken === null) opUid = sessionTokenUid(localStorage.getItem('access_token'));
      // Checked against opUid before it can refresh again (another user's near-expiry session is
      // never refreshed or cleared for this operation), and once more below on what it returns.
      // Fail-fast: if the refresh succeeded but another tab has since cleared
      // storage, there's no token to retry with. Surface 401 immediately
      // rather than sending an unauthenticated retry.
      var freshToken = await ensureFreshAccessToken(opUid);
      if (!freshToken) {
        clearAuthTokens({ reason: 'refresh' });
        throw { status: 401, message: 'Session expired' };
      }
      operationToken(freshToken, opUid);
      // The retry reads storage once more and checks that token too, against the same opUid.
      return apiCall(method, path, body, bearerToken, true, opts, opUid);
    }
    // Retry-After surfacing (every non-OK response): the write limiter really
    // sends the header (request-rate-limit.ts sets ceil(window/1000), and CORS
    // exposes it), and apiCall keeps the headers — a client that drops them could
    // never render an honest "try again in Ns". Integer form only; the HTTP-date
    // form is not parsed (nothing in this API emits it, and a mis-parsed date
    // would fabricate a countdown).
    var retryAfterHeader = res.headers && res.headers.get ? res.headers.get('retry-after') : null;
    var retryAfter = (typeof retryAfterHeader === 'string' && /^\d+$/.test(retryAfterHeader))
      ? parseInt(retryAfterHeader, 10) : null;
    // The API's trace id (X-Trace-Id, exposed by CORS) is what support looks a failed call up by. Kept only in
    // the API's own accepted shape (a UUID or 16-64 hex), so it can never carry anything
    // else; any other value, or none, leaves the field off. Additive: existing callers never read it.
    var traceIdHeader = res.headers && res.headers.get ? res.headers.get('x-trace-id') : null;
    var traceId = (typeof traceIdHeader === 'string' && TRACE_ID_SHAPE.test(traceIdHeader)) ? traceIdHeader : null;
    if (res.status === 429) {
      // Keep the localized generic message (callers like login.js render
      // err.message, so replacing it with raw server English would regress i18n)
      // but ALSO surface the server code + body, so a caller can distinguish a
      // payment velocity cap (PAYMENT_VELOCITY_LIMIT_EXCEEDED) from a plain
      // request rate-limiter. Additive: existing callers read only .status/.message.
      throw withTraceId({ status: 429, message: t('auth.error.tooManyAttempts'), code: (data && data.error) || null, data: data, retryAfter: retryAfter }, traceId);
    }
    // Preserve the server's error CODE (standardized envelope `error` field, e.g.
    // 'OTP_REQUIRED') and the raw body so callers can branch on the failure type —
    // not just status/message. Additive: existing callers reading .status/.message
    // are unaffected.
    throw withTraceId({ status: res.status, message: data.message || t('auth.error.generic'), code: (data && data.error) || null, data: data, retryAfter: retryAfter }, traceId);
  }
  if (opts && typeof opts.onEtag === 'function') {
    try { opts.onEtag(res.headers && res.headers.get ? res.headers.get('etag') : null); } catch (e) { /* the caller's note only */ }
  }
  return data;
}

// ── safeFinalPath ─────────────────────────────────────────────
// Allowlist regex enforces which paths can be `final_path` targets in a
// self-PKCE auth_return_to ctx. Adding any new terminal page (e.g.
// /auth/welcome) requires extending the regex AND adding accept rows to
// the unit test. Do NOT replace this with URL parsing — the literal regex
// is the only safe form (it gates the post-auth `final_path` allowlist).
//
// `/auth/home` may carry the Hub's own state (`hub`, v3's `preview=1`, and `view`, see HUB_VIEWS) in this exact
// order and spelling, so a preview link or a deep link survives an OAuth sign-in. The view list
// in this regex is kept equal to HUB_VIEWS by a unit test.
function safeFinalPath(p) {
  if (typeof p !== 'string') return null;
  if (p.length > 200) return null;
  if (!/^\/auth\/(home|2fa)$/.test(p)
    && !/^\/auth\/home\?(?:hub=(?:v3(?:&preview=1)?)(?:&view=(?:home|bots|board|guide|computers|keys|market|account|wallet|notify|scripts|logs|ai|apps|notes|schedules|programs))?|view=(?:home|bots|board|guide|computers|keys|market|account|wallet|notify|scripts|logs|ai|apps|notes|schedules|programs))$/.test(p)) return null;
  return p;
}

// ── Hub state carried through sign-in ─────────────────────────
// The Hub's query state that survives login, 2FA and OAuth: `hub` (only `v3`, the default when absent;
// the classic Hub's next/legacy values are retired and travel as no value) and
// `view` (which section). Only known values travel; anything else is dropped, including the
// `view=hub` marker the os.hoody.com and hub.hoody.com shortcuts send. hub-boot-gate.js keeps its own copy of these
// lists (it runs before this file); a unit test keeps the copies equal.
var HUB_TEMPLATES = ['v3'];
var HUB_VIEWS = ['home', 'bots', 'board', 'guide', 'computers', 'keys', 'market', 'account', 'wallet', 'notify',
  'scripts', 'logs', 'ai', 'apps', 'notes', 'schedules', 'programs'];

// `?hub=…&view=…` (validated, fixed order) from a query string, or ''.
function hubStateQuery(search) {
  try {
    var q = new URLSearchParams(search === undefined ? window.location.search : search);
    var parts = [];
    var hubs = q.getAll('hub'), view = q.get('view');
    // Only one known value selects a Hub, as on the server (hubTemplateFor) and in hub-boot-gate.js:
    // none, an unknown or a repeated value gets the default, Hub v3, and travels as no value at all.
    var hub = hubs.length === 1 && HUB_TEMPLATES.indexOf(hubs[0]) !== -1 ? hubs[0] : '';
    // The v3 preview flag rides along (same order as hub-boot-gate.js), so a preview page survives sign-in;
    // it travels only as `hub=v3&preview=1` (the one form safeFinalPath accepts), so the default Hub's names v3.
    var preview = (hub === 'v3' || hub === '') && q.get('preview') === '1';
    if (hub || preview) parts.push('hub=' + (hub || 'v3'));
    if (preview) parts.push('preview=1');
    if (view && HUB_VIEWS.indexOf(view) !== -1) parts.push('view=' + view);
    return parts.length ? '?' + parts.join('&') : '';
  } catch (e) { return ''; }
}

// `hub` rides auth-page links and redirects only as one known value (`hub=v3`); a retired (next,
// legacy), unknown or repeated value is dropped, as hubStateQuery does.
function dropUnknownHub(params) {
  var hubs = params.getAll('hub');
  if (!(hubs.length === 1 && HUB_TEMPLATES.indexOf(hubs[0]) !== -1)) params.delete('hub');
}

// The post-sign-in landing path with the Hub state of the current URL; always passes safeFinalPath.
function hubReturnPath() {
  return '/auth/home' + hubStateQuery();
}

// ── Already-signed-in short-circuit (entry pages) ─────────────
// Returns the hub path to send an already-signed-in visitor of an ENTRY page
// (/auth/login, /auth/signup) to, or null if the page should render its form.
//
// A visit belongs on the hub when a session is stored — class 'account' or 'token' of
// classifyStoredAuth, the SAME table /auth/home's boot gate uses — UNLESS the
// CURRENT URL is an external host-app PKCE entry (carries BOTH redirect_uri and
// code_challenge). In that flow the bearer session is the wrong credential: the
// host app needs the user to sign in so /authorize can mint an intent token, so
// we render the form. We read the LIVE URL (not the persisted auth_return_to)
// so a stale prior-visit context can't suppress a legitimate redirect. A stored
// session may coexist with an external flow (login.js keeps it on a host-app
// entry); the flow's own calls never use it: the password call goes out as
// nobody, and /authorize carries the flow's intent token.
// Self-PKCE never puts these params in the URL, so it is treated as "not
// external" and correctly redirects to the hub.
//
// A token session lands on the Hub state of the URL like an account session.
//
// Loop-freedom: this is the complement of /auth/home's boot gate, which
// redirects to /auth/login iff the class is 'none' and whose handle401()
// CLEARS tokens before bouncing. The two gates can never both fire for one
// storage state, so a dead session costs at most one extra hop, never a loop.
// That coupling is load-bearing: if /auth/home ever moves to an expiry-based
// gate, revisit this (a unit test pins the coupling).
function authedHubRedirect() {
  var cls = classifyStoredAuth();
  if (cls !== 'account' && cls !== 'token') return null;
  if (getUrlParam('redirect_uri') && getUrlParam('code_challenge')) return null;
  return hubReturnPath();
}

// ── Return state persistence (localStorage with TTL) ──────────
function storeReturnContext(redirectUri, codeChallenge, state) {
  var ctx = JSON.stringify({
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    state: state,
    expires_at: Date.now() + 30 * 60 * 1000
  });
  try { localStorage.setItem('auth_return_to', ctx); } catch(e) {}
}

function getReturnContext() {
  try {
    var raw = localStorage.getItem('auth_return_to');
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (!parsed || !parsed.expires_at || parsed.expires_at < Date.now()) {
      localStorage.removeItem('auth_return_to');
      return null;
    }
    return parsed;
  } catch(e) {
    localStorage.removeItem('auth_return_to');
    return null;
  }
}

// Drops the return context and the self-PKCE verifier. With `own` (returnContextOwn(), read when a
// flow started) a record goes only while it is still this flow's (ownsFlowRecord), and nothing goes
// while another flow's intent token is stored. A newer flow that minted or reused the pair stamped both
// records with its tab's flow id (stampSelfPkceFlow), so it keeps them whether this flow read the
// records before or after that, as long as this flow's tab has a flow id of its own.
// Not protected, where the cleanup falls back to the bytes alone and can still remove a newer tab's
// pair: a callback whose tab has no flow id (sessionStorage blocked, a callback opened in a tab that did
// not inherit the key, or a sign-in started before flow ids existed); two tabs sharing one id (a
// duplicated tab copies its sessionStorage); and a stamp that only partly reached storage. The newer
// flow then fails closed at its finalize (nothing sent), and its sign-in has to be retried.
// Without `own` (entry-time cleanup, sign-out) both go. The tab's flow id stays: it names only this tab.
function clearReturnContext(own) {
  try {
    if (own) {
      var storedIntent = localStorage.getItem('auth_intent_token');
      if (storedIntent !== null && storedIntent !== own.intent) return;
      if (ownsFlowRecord(localStorage.getItem('auth_return_to'), own.ctx, own.flow)) localStorage.removeItem('auth_return_to');
      if (ownsFlowRecord(localStorage.getItem('auth_self_pkce_verifier'), own.verifier, own.flow)) localStorage.removeItem('auth_self_pkce_verifier');
      return;
    }
    localStorage.removeItem('auth_return_to');
    localStorage.removeItem('auth_self_pkce_verifier');
  } catch(e) {}
}
// A stored record is this flow's while it holds the bytes the flow read and, when the tab knows its
// flow id and the record carries one, that same id. A record that carries no id (a host-app context,
// or one written before flow ids) is judged by its bytes alone.
function ownsFlowRecord(stored, read, flow) {
  if (read === null || stored !== read) return false;
  if (flow === null) return true;
  var rec = null;
  try { rec = JSON.parse(stored); } catch (e) { rec = null; }
  return !rec || typeof rec.flow !== 'string' || rec.flow === flow;
}
// The stored return context and verifier, as stored, the tab's flow id, and the intent token of the
// flow (null when it has none), for a later clearReturnContext(own).
function returnContextOwn(intent) {
  var mine = intent === undefined ? null : intent;
  var flow = tabFlowId();
  try {
    return { ctx: localStorage.getItem('auth_return_to'), verifier: localStorage.getItem('auth_self_pkce_verifier'), flow: flow, intent: mine };
  } catch (e) { return { ctx: null, verifier: null, flow: flow, intent: mine }; }
}
// The self-PKCE flow id of this tab, in its sessionStorage, which survives the provider redirect back
// to /auth/callback (stampSelfPkceFlow sets it). null when the tab has none or cannot read it.
var AUTH_FLOW_KEY = 'auth_flow_nonce';
var SELF_PKCE_KEYS = ['auth_self_pkce_verifier', 'auth_return_to'];
function tabFlowId() {
  try { return sessionStorage.getItem(AUTH_FLOW_KEY); } catch (e) { return null; }
}
// Writes a new flow id into both self-PKCE records (nothing else in them changes) and makes it this
// tab's id. The tab keeps the id only when both records and its sessionStorage read that same id back;
// otherwise it keeps none, so its own cleanup judges by the bytes alone and can still remove what it
// wrote. Called when mintSelfPkce writes a pair and when ensurePkceContext reuses one.
function stampSelfPkceFlow() {
  var id = _b64url(_randBytes(16));
  var stamped = true;
  for (var i = 0; i < SELF_PKCE_KEYS.length; i++) {
    try {
      var rec = JSON.parse(localStorage.getItem(SELF_PKCE_KEYS[i]));
      rec.flow = id;
      localStorage.setItem(SELF_PKCE_KEYS[i], JSON.stringify(rec));
      if (JSON.parse(localStorage.getItem(SELF_PKCE_KEYS[i])).flow !== id) stamped = false;
    } catch (e) { stamped = false; }
  }
  setTabFlowId(stamped ? id : null);
}
// Makes `id` this tab's flow id (null: none, removed without reading first, since a read that fails also
// answers null). When the tab does not then read back exactly `id`, the key is dropped too, so the tab
// never keeps an id its records do not carry.
function setTabFlowId(id) {
  try { if (id === null) sessionStorage.removeItem(AUTH_FLOW_KEY); else sessionStorage.setItem(AUTH_FLOW_KEY, id); } catch (e) {}
  if (id !== null && tabFlowId() !== id) { try { sessionStorage.removeItem(AUTH_FLOW_KEY); } catch (e) {} }
}
// A credential a flow may send: a non-empty string that is not a stringified missing value.
function usableCredential(v) {
  return typeof v === 'string' && v.trim() !== '' && v !== 'undefined' && v !== 'null';
}
// RFC 7636 §4.1: 43-128 characters of A-Z a-z 0-9 - . _ ~ (mintSelfPkce makes 43).
var PKCE_VERIFIER_SHAPE = /^[A-Za-z0-9\-._~]{43,128}$/;

// ── Self-PKCE (direct-visit OAuth) ────────────────────────────
// When a user lands on /auth/{login,signup} without an external `redirect_uri`
// + `code_challenge` from a host app, we mint a PKCE pair locally so the OAuth
// round-trip can still complete. The verifier stays on this origin in a
// separate slot, never leaves the browser until /exchange. The `redirect_uri`
// is our own /auth/callback — the same landing the OAuth backend already uses.
function _b64url(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function _randBytes(n) {
  var a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

async function mintSelfPkce(finalPath) {
  // 32 bytes → 43-char base64url verifier (RFC 7636 §4.1: 43–128 chars, A–Z a–z 0–9 - . _ ~)
  var verifier = _b64url(_randBytes(32));
  var enc = new TextEncoder().encode(verifier);
  var digest = await crypto.subtle.digest('SHA-256', enc);
  var challenge = _b64url(new Uint8Array(digest));
  var redirectUri = window.location.origin + '/auth/callback';

  // Persist the verifier in a SEPARATE slot — auth_return_to is observable to
  // any auth-UI script and we want to keep the verifier in its own bucket so
  // it is only consumed by the /exchange step.
  var verifierCtx = JSON.stringify({
    verifier: verifier,
    expires_at: Date.now() + 30 * 60 * 1000
  });
  try { localStorage.setItem('auth_self_pkce_verifier', verifierCtx); } catch(e) {}

  // Store in the standard return-context slot, marked self_finalize so
  // callback.js takes the in-place /authorize+/exchange path instead of
  // redirecting back to the (self) redirect_uri (which would loop). No `state`
  // field — self-PKCE never redirects back to a host app, so the CSRF token
  // round-trip would be dead weight.
  // `final_path`: optional terminal-redirect for completeSelfPkce.
  // Validated via safeFinalPath.
  var validated = safeFinalPath(finalPath);
  var ctx = JSON.stringify({
    redirect_uri: redirectUri,
    code_challenge: challenge,
    self_finalize: true,
    final_path: validated || null,
    expires_at: Date.now() + 30 * 60 * 1000
  });
  try { localStorage.setItem('auth_return_to', ctx); } catch(e) {}
  // The new pair is this tab's flow.
  stampSelfPkceFlow();

  return { redirect_uri: redirectUri, code_challenge: challenge, self_finalize: true };
}

function getSelfPkceVerifier() {
  try {
    var raw = localStorage.getItem('auth_self_pkce_verifier');
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (!parsed || !parsed.expires_at || parsed.expires_at < Date.now() || !parsed.verifier) {
      localStorage.removeItem('auth_self_pkce_verifier');
      return null;
    }
    return parsed.verifier;
  } catch(e) {
    localStorage.removeItem('auth_self_pkce_verifier');
    return null;
  }
}

// Ensure a usable PKCE context is present. If a fresh external one is in
// localStorage (from `?redirect_uri=&code_challenge=` URL params), keep it
// unconditionally — external embedder ctxs have no `final_path` and must
// not be wiped just because the caller passed a different one.
//
// For self-PKCE ctxs, compare `final_path` against the new arg: a mismatch
// (or a missing verifier) means stale ctx — drop and re-mint so the new
// target lands in storage.
async function ensurePkceContext(finalPath) {
  var ctx = getReturnContext();
  if (ctx && ctx.code_challenge && ctx.redirect_uri) {
    // External embedder ctx — preserve unconditionally. Do NOT compare final_path.
    if (!ctx.self_finalize) return ctx;
    // Self-finalize ctx — compare final_path; mismatch means stale.
    var newFP = safeFinalPath(finalPath);
    if ((ctx.final_path || null) === (newFP || null) && getSelfPkceVerifier()) {
      // A reused pair becomes this tab's flow (same challenge, same verifier).
      stampSelfPkceFlow();
      return ctx;
    }
    clearReturnContext();
  }
  return await mintSelfPkce(finalPath);
}

// ── Storage registry and the sign-out purge ─────────────────
// Every browser-storage key the auth pages and the Hub write, as an exact `key` or a `prefix`
// family, per area. `purge: true` entries are removed by every sign-out (clearAuthTokens, so
// logout.html, login and signup entry, a failed refresh and the Hub's
// menu all purge the same set). `purge: false` entries are device preferences, per-user records
// filtered on read, or state a sign-in flow itself needs (the PKCE return context). A new key
// must be added here: an e2e test fails on any write that matches no entry.
// `forget: true` marks a `purge: false` entry that only "Forget this browser" (forgetBrowserStorage) removes:
// state that every account of this browser shares one key for, such as held changes.
//
// `hub_boot_token_epoch:` is never removed but advanced (see purgeAuthStorage).
var TOKEN_SESSION_KEY = 'hub_token_session_v1';
var AUTH_REV_KEY = 'hub_auth_rev';
var AUTH_STORAGE_REGISTRY = [
  // Session credentials and their metadata.
  { area: 'local', key: 'access_token', purge: true },
  { area: 'local', key: 'access_token_expires_at', purge: true },
  { area: 'local', key: 'refresh_token', purge: true },
  { area: 'local', key: 'refresh_token_expires_at', purge: true },
  { area: 'local', key: 'auth_intent_token', purge: true },
  { area: 'local', key: 'two_factor_token', purge: true },
  // A token session (sign-in with a shared API token): the second documented credential-store
  // exception, next to the boot token. The auth revision survives sign-out: every credential write
  // and purge changes it, so a token install that started before one refuses (installTokenSession).
  { area: 'local', key: TOKEN_SESSION_KEY, purge: true },
  { area: 'local', key: AUTH_REV_KEY, purge: false },
  // Sign-in flow state: purged by clearReturnContext when a flow ends, never by a sign-out
  // (login entry calls clearAuthTokens while an external PKCE flow is in progress).
  { area: 'local', key: 'auth_return_to', purge: false },
  { area: 'local', key: 'auth_self_pkce_verifier', purge: false },
  // This tab's self-PKCE flow id (stampSelfPkceFlow): kept; it only names the records this tab's flow wrote.
  { area: 'session', key: AUTH_FLOW_KEY, purge: false },
  // The Hub boot token: an explicit credential-store exception (hub-boot-token.js), purged on
  // sign-out; its epoch family is advanced instead, to fence mints still in flight elsewhere.
  { area: 'local', prefix: 'hub_boot_token:', purge: true },
  { area: 'local', prefix: 'hub_boot_token_epoch:', purge: false, advance: true },
  { area: 'local', key: 'hub_boot_token_probe', purge: false },
  { area: 'local', key: 'hub_boot_token_ttl_days', purge: false },
  // Access-address caches: the Agent URL cache and the retired `-workspaces-` keys.
  { area: 'local', prefix: 'hub_agent_url:', purge: true },
  { area: 'local', key: 'hub_workspaces_url', purge: true },
  { area: 'local', prefix: 'hub_workspaces_url:', purge: true },
  // The notification poller's cached summary and shared poll clock (`hub_notif:*`): a shared
  // browser must not keep the previous account's unread count or latest notification id.
  { area: 'local', prefix: 'hub_notif:', purge: true },
  // Get notified (hub-notify-core.js): the notices the alert engine has handled name the account's notices, so sign-out removes
  // them; this browser's alert and hint choices (and the browser-wide 'cannot build an alert' flag) are device preferences, kept
  // like the tour state. All are per account.
  { area: 'local', prefix: 'hub_notify_seen:', purge: true },
  { area: 'local', prefix: 'hub_notify_shown:', purge: true },
  { area: 'local', prefix: 'hub_notify:', purge: false },
  // Per-account Hub selections and counters.
  { area: 'local', key: 'hub_first_run_seen', purge: true },
  { area: 'local', prefix: 'hub_next_idx_', purge: true },
  { area: 'local', prefix: 'hub_active_container:', purge: true },
  { area: 'local', prefix: 'hub_agent_index:', purge: true },
  // The new Hub: the realm selection and the selected computer leave with the
  // account; theme, accent and realm colours are device preferences.
  { area: 'local', key: 'hub_realm_v1', purge: true },
  { area: 'local', prefix: 'hub_active_computer:', purge: true },
  // Held changes that survive a reload (core/change-store.ts): per-account digests, keys and
  // sending stamps, never variables or secrets. One key holds every account's records, so no purge
  // removes it (that would drop other accounts' holds, and an expired session's own). A purge
  // for 'signout', 'expiry', 'refresh' or 'cleanup' removes no hold: the Hub's pre-purge hook clears
  // only that tab's memory. The Hub's warned sign-out removes the holds it showed (core
  // signOutForgetting, before it signs out); only 'forget' (Forget this browser) removes the whole key.
  { area: 'local', key: 'hub.v3.changes', purge: false, forget: true },
  // Scripts' unsettled asks (the Hub's scripts writer): per-account ask ids, idempotency keys and phases, never
  // prompt, reply or script text. Kept like hub.v3.changes: no purge removes it (an ask whose outcome is unknown
  // must not be sent twice), and core's warned sign-out does not touch it: the scripts writer drops its own asks
  // (only those its warning showed); only 'forget' removes the key.
  { area: 'local', key: 'hub.v3.script-asks', purge: false, forget: true },
  // The Hub passcode (core/applock.ts): `hub_lock:<uid>` holds one account's verifier and wrong-try count (never the
  // passcode). No purge removes it: a sign-out keeps the passcode, so the next sign-in asks for it. Only Remove
  // (settings, after the passcode) and forgetBrowser() delete it, the latter only after its purge succeeded.
  { area: 'local', prefix: 'hub_lock:', purge: false },
  // Lock now's fallback when BroadcastChannel is missing (postHubLock): a stamp whose storage event locks other tabs.
  { area: 'local', prefix: 'hub_lock_now:', purge: false, forget: true },
  { area: 'local', key: 'hub_theme_v1', purge: false },
  { area: 'local', key: 'hub_hl_v1', purge: false },
  { area: 'local', key: 'hub_perf_v1', purge: false },
  { area: 'local', key: 'hub_realm_colors', purge: false },
  // Program options per computer (hub-prog-opts.js): per-account choices, purged.
  { area: 'local', key: 'hub_prog_opts_v1', purge: true },
  // Section records written through Hub.store (hub-kit.js), partitioned by account (and realm or
  // computer); no secrets. Bots: the open row and the hide-tasks choice; Scripts: the first-publish
  // hint; Logs: saved filters, also per tab; Apps: recent apps (v1 is only removed); Notes: the scope.
  { area: 'local', key: 'hub_bots_open_row', purge: true },
  { area: 'local', key: 'hub_bots_hide_tasks', purge: true },
  // Bots voice (pages/bots/voice/pending.ts): spoken messages whose fate is not known, per account and computer, identities
  // only ({realm, bot, conn, utt, at}, no audio or text), at most 32 and 24 h; gone at sign-out.
  { area: 'local', key: 'hub_voice_pending_v1', purge: true },
  { area: 'local', key: 'hub_scripts_v1', purge: true },
  { area: 'local', key: 'hub_logs_v1', purge: true },
  { area: 'session', key: 'hub_logs_v1', purge: true },
  // Logs' visitor countries (core/ipgeo.ts): looked-up public addresses and their country, per account, at most 256 entries; gone at sign-out.
  { area: 'session', key: 'hub_ip_geo_v1', purge: true },
  // AI chats let go while their turn ran (core/chat-attention.ts): {computer, realm, sid, at, last} identities only, per
  // account, at most 20 and 24 h; this tab only, gone at sign-out.
  { area: 'session', key: 'hub_ai_attn_v1', purge: true },
  { area: 'local', key: 'hub_apps_recent_v2', purge: true },
  { area: 'local', key: 'hub_apps_recent_v1', purge: true },
  { area: 'local', key: 'hub_notes_v1', purge: true },
  // Hub v3 AI page: UI state and the endpoint plan hold, per account; purged at sign-out.
  { area: 'local', key: 'hub_ai_v1', purge: true },
  // New chat's remembered choice (agent, approvals, runs with), per account; purged at sign-out.
  { area: 'local', key: 'hub_ai_new_v1', purge: true },
  // The model picker's favourites, recent picks and remembered filters (kit/pickers/useModelPrefs), per account; purged at sign-out.
  { area: 'local', key: 'hub_models_v1', purge: true },
  // The AI tab's journal of requests (ask/journal): evidence that a send may have left, the migrated evidence of the old Ask
  // records, the session lease ids and the chat records. Kept across sign-out (a request may be in flight at the agent) and
  // removed only by Forget this browser, each whole; per account inside, only the shown account's own part is read.
  { area: 'local', key: 'hub_ai_req_v1', purge: false, forget: true },
  { area: 'local', key: 'hub_ai_mig_v1', purge: false, forget: true },
  { area: 'local', key: 'hub_ai_lease_v1', purge: false, forget: true },
  { area: 'local', key: 'hub_ai_journal_v1', purge: false, forget: true },
  // Quick command box (QCMD): the last ten commands per account and computer, never a secret-looking one; purged at sign-out.
  { area: 'local', key: 'hub_qcmd_v1', purge: true },
  // Hub v3 Home's per-account widget order (useAccountPref): purged at sign-out.
  { area: 'local', key: 'hub_home_v1', purge: true },
  // Hub v3 Home's web widgets per account and realm (addresses may carry ids that grant access): purged at sign-out.
  { area: 'local', key: 'hub_homew_v1', purge: true },
  // Hub v3 Board: Boards per account id and realm id (layout, tiles as container/program/session
  // refs, never a secret). Kept across sign-out on purpose, so people find their Boards
  // again; a per-user record filtered on read: only the signed-in account's own entries are read.
  { area: 'local', key: 'hub_boards_v1', purge: false },
  // Hub v3 Board: Closed Boards (closed Boards kept to restore), per account id and realm id like hub_boards_v1, holding
  // the same tiles it does (sealed per account); kept across sign-out with it.
  { area: 'local', key: 'hub_boards_closed_v1', purge: false },
  // Open with: the remembered program per file type, per account and computer (never a file name); purged at sign-out.
  { area: 'local', key: 'hub_openwith_v1', purge: true },
  // Files Transfers: the routes (project, server) of the computers something moves on, per account, newest 50.
  { area: 'local', key: 'hub_files_routes_v1', purge: true },
  // Schedules' tab and filter only (never a command, a prompt or a computer).
  { area: 'local', key: 'hub_sched_ui_v1', purge: true },
  // Ask's per-account task records (session ids, phases, the page language): purged at sign-out.
  { area: 'local', key: 'hub_ask_v1', purge: true },
  // Hub v3 table and pane state (columns, sort, filters, chosen pane per page): per account, purged at sign-out.
  { area: 'local', prefix: 'hub.v3.table.', purge: true },
  { area: 'local', prefix: 'hub.v3.pane.', purge: true },
  // Hub v3 device preferences: sidebar rail/expanded and the Ask dock's open state and width.
  { area: 'local', key: 'hub.v3.shell', purge: false },
  { area: 'local', key: 'hub.v3.ask', purge: false },
  // The open chat's Details panel: which tab was last shown (a tab name only, never chat content).
  { area: 'local', key: 'hub.v3.ai.details.tab', purge: false },
  // "Use with your agent": the pages its control is hidden on and the kind of agent last picked (page and kind names
  // only, never a prompt, id or key).
  { area: 'local', prefix: 'hub.v3.agentHint.', purge: false },
  { area: 'session', prefix: 'hub_agent_index:', purge: true },
  // The paid-subserver top-up continuation names a plan of the account that is leaving.
  { area: 'session', key: 'hub_buy_resume', purge: true },
  // The browser-settings band was hidden for this tab session by the account that is leaving.
  { area: 'session', key: 'hub_prefs_band_hidden', purge: true },
  // Hub v3 model chooser's trip to the AI page and back (core/handoff.ts): a non-secret record per account and
  // computer (the form's own text, never a key or code), 30 minutes; it names the account that is leaving.
  { area: 'session', key: 'hub_model_handoff_v1', purge: true },
  // Kept on purpose: device preferences, per-user records filtered by user id on read, and
  // pre-sign-in intents (a buy link or an invite code must survive the sign-in it starts).
  { area: 'local', key: 'hub_boot_mode', purge: false },
  { area: 'local', prefix: 'hub_tour_v1:', purge: false },
  // The Guide's per-account landing and start-card state: local only, kept at sign-out.
  { area: 'local', key: 'hub_guide_v1', purge: false },
  // The realm agent dock: open or hidden, its width and the dismissed tip. A device preference like the
  // theme, kept at sign-out; no account data.
  { area: 'local', key: 'hub_dock_v1', purge: false },
  // Billing's unresolved upgrades (P3BILL): each entry names its user and is read only for that user; a sign-out
  // must not lose the key of an upgrade whose charge is unknown (as hub_money_pending).
  { area: 'local', key: 'hub_money_upgrade', purge: false },
  { area: 'local', key: 'hub_money_pending', purge: false },
  // The Market's unresolved reservations (P3MKT): each entry names its user and is read only for that user; a
  // sign-out must not lose the key of a reservation whose charge is unknown.
  { area: 'local', key: 'hub_market_pending', purge: false },
  // Hub v3 unresolved wallet top-ups (core commerce): each entry names its user and is read only for that user; a
  // sign-out must not lose the key of a top-up whose charge is unknown (as hub_money_pending).
  { area: 'local', key: 'hub.v3.topup_pending', purge: false },
  // Hub v3 unresolved server rents (core commerce): keyed by attempt, each entry names its user and is read only for
  // that user; a sign-out must not lose the key of a rent whose charge is unknown (as hub.v3.topup_pending).
  { area: 'local', key: 'hub.v3.rent_pending', purge: false },
  { area: 'local', key: 'hub_buy_intent', purge: false },
  { area: 'session', key: 'hub_buy_intent', purge: false },
  { area: 'session', key: 'hub_topup_return', purge: false },
  { area: 'session', key: 'hub_market_resume', purge: false },
  { area: 'session', key: COUPON_SS_KEY, purge: false },
  { area: 'session', key: COUPON_PREFILL_SS_KEY, purge: false },
  // The referral code from a `?ref=` link (7 days): a pre-sign-up intent, kept like the coupon.
  // Forget this browser also removes it (the person asked this browser to forget): purge stays false.
  { area: 'local', key: REF_LS_KEY, purge: false, forget: true },
  // The referral revision (REF_REV_KEY): a fence for a signup answer in flight, never a credential or a
  // user value. It survives every purge (a purge that removed it would unfence a pending answer).
  { area: 'local', key: REF_REV_KEY, purge: false },
  // The standalone Hub's chosen Hoody API (origin and its two domains, no credential): it names the
  // Hoody the stored credentials belong to, so no sign-out removes it; Forget this browser does.
  { area: 'local', key: STANDALONE_API_KEY, purge: false, forget: true },
];

// The registry entry for one key in one area, or null.
function authStorageEntry(area, k) {
  for (var i = 0; i < AUTH_STORAGE_REGISTRY.length; i++) {
    var e = AUTH_STORAGE_REGISTRY[i];
    if (e.area !== area) continue;
    if (e.key !== undefined ? k === e.key : (typeof k === 'string' && k.indexOf(e.prefix) === 0)) return e;
  }
  return null;
}

// The user id the stored session belongs to, or null. Session tokens are JWTs issued by
// the server's sign-in with `id` = the user id, the same id
// GET /users/auth/me returns and HubBootToken keys its records by. Only the payload is decoded;
// nothing here trusts it for authorization, it only names whose boot-token epoch to advance.
// With no account token, a token session names its owner (storedSession: the record's owner id).
function authUidFromStorage() {
  var names = ['access_token', 'refresh_token'];
  for (var i = 0; i < names.length; i++) {
    var id = null;
    try { id = sessionTokenUid(localStorage.getItem(names[i])); } catch (e) { id = null; }
    if (id) return id;
  }
  var s = storedSession();
  return s && s.kind === 'token' ? s.uid : null;
}

// The claims of a session token signed by signSessionPair, or null for an opaque or malformed token.
function sessionTokenClaims(tok) {
  try {
    var part = tok ? String(tok).split('.')[1] : '';
    if (!part) return null;
    var b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var claims = JSON.parse(atob(b64));
    return claims && typeof claims === 'object' ? claims : null;
  } catch (e) { return null; /* opaque or malformed */ }
}
// The user id (`id` claim) of a session token, or null for an opaque or malformed token. The one
// decoder for "whose session is this": the purge and the refresh's adoption of another tab's
// tokens both use it.
function sessionTokenUid(tok) {
  var claims = sessionTokenClaims(tok), id = claims && claims.id;
  if ((typeof id === 'string' && id) || (typeof id === 'number' && isFinite(id))) return String(id);
  return null;
}
// The login session id (`sid` claim) of a session token, or null. A refresh keeps it; a new
// sign-in, even by the same user, gets a new one. So the pair (uid, sid) names one session.
function sessionTokenSid(tok) {
  var claims = sessionTokenClaims(tok), sid = claims && claims.sid;
  return typeof sid === 'string' && sid ? sid : null;
}

// `n` random [a-z0-9] characters (crypto.getRandomValues; Math.random only where crypto is missing).
function randomLowerId(n) {
  var chars = 'abcdefghijklmnopqrstuvwxyz0123456789', out = '';
  var buf = null;
  try { buf = new Uint8Array(n); crypto.getRandomValues(buf); } catch (e) { buf = null; }
  for (var i = 0; i < n; i++) {
    var r = buf ? buf[i] : Math.floor(Math.random() * 256);
    out += chars.charAt(r % chars.length);
  }
  return out;
}
// A fresh random epoch nonce ([a-z0-9]), the same shape hub-boot-token.js writes.
function freshEpochNonce() {
  return randomLowerId(12);
}

// ── Token sessions (sign-in with a shared API token + realm) ─────────────────
// A token session is the second kind of stored session: the record `hub_token_session_v1`
// {v:1, token, realm:'all'|<24hex>, sid, owner:{id, username}, at}, installed only by the login
// page's confirm card. It has no refresh token and never refreshes. `access_token` always decides
// first: a record next to account keys is ignored and goes with the next purge.
var TOKEN_RE = /^hdy_[0-9a-f]{24}_[0-9a-f]{48}$/;
var HEX24_RE = /^[0-9a-f]{24}$/;
var AUTH_SID_RE = /^[a-z0-9]{16}$/;
var ACCOUNT_CREDENTIAL_KEYS = ['access_token', 'refresh_token', 'two_factor_token', 'auth_intent_token'];

function storageRead(k) { return localStorage.getItem(k); }
// A plain object from any realm (JSON.parse output, or a test host's object): its prototype is
// null or a root prototype. Arrays and class instances are not.
function plainObject(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  var p = Object.getPrototypeOf(o);
  return p === null || Object.getPrototypeOf(p) === null;
}
function exactKeys(o, want) {
  var k = Object.keys(o).sort();
  return k.length === want.length && k.every(function (x, i) { return x === want[i]; });
}
// The strict reader: anything that is not exactly the record's shape reads as none. Never writes.
function parseTokenRecord(raw) {
  if (typeof raw !== 'string' || raw.length > 4096) return null;
  var r;
  try { r = JSON.parse(raw); } catch (e) { return null; }
  if (!plainObject(r) || !exactKeys(r, ['at', 'owner', 'realm', 'sid', 'token', 'v'])) return null;
  if (r.v !== 1 || typeof r.token !== 'string' || !TOKEN_RE.test(r.token)) return null;
  if (r.realm !== 'all' && !(typeof r.realm === 'string' && HEX24_RE.test(r.realm))) return null;
  if (typeof r.sid !== 'string' || !AUTH_SID_RE.test(r.sid) || typeof r.at !== 'number' || !isFinite(r.at)) return null;
  var o = r.owner;
  if (!plainObject(o) || !exactKeys(o, ['id', 'username'])) return null;
  if (typeof o.id !== 'string' || !HEX24_RE.test(o.id)) return null;
  if (typeof o.username !== 'string' || o.username.length < 1 || o.username.length > 254) return null;
  return Object.freeze({ v: 1, token: r.token, realm: r.realm, sid: r.sid, at: r.at, owner: Object.freeze({ id: o.id, username: o.username }) });
}
// The stored token record, frozen, or null (absent, malformed, or storage unreadable).
function readTokenSession(read) {
  try { return parseTokenRecord((read || storageRead)(TOKEN_SESSION_KEY)); } catch (e) { return null; }
}
// One acceptance table for the Hub's boot gate (hub-boot-gate.js keeps a copy, tested equal) and the
// login page: 'account' | 'token' | 'none' | 'unreadable'. `access_token` decides first. A valid
// record next to a `two_factor_token` is 'none': the account's 2FA step wins. The gate leaves only
// on 'none' and the login page only on 'account' or 'token', so the two never both fire.
function classifyStoredAuth(read) {
  read = read || storageRead;
  try {
    if (read('access_token')) return 'account';
    if (read('two_factor_token')) return 'none';
    return parseTokenRecord(read(TOKEN_SESSION_KEY)) ? 'token' : 'none';
  } catch (e) { return 'unreadable'; }
}
// The stored session, by the same table: {kind:'account', uid, sid, bearer} or {kind:'token', uid
// (the owner's id), sid, bearer, realm, owner}, frozen; null for 'none', 'unreadable', or an
// account token whose user cannot be read.
function storedSession() {
  try {
    var cls = classifyStoredAuth();
    if (cls === 'account') {
      var access = localStorage.getItem('access_token'), uid = sessionTokenUid(access);
      return uid ? Object.freeze({ kind: 'account', uid: uid, sid: sessionTokenSid(access), bearer: access }) : null;
    }
    if (cls !== 'token') return null;
    var rec = readTokenSession();
    return rec ? Object.freeze({ kind: 'token', uid: rec.owner.id, sid: rec.sid, bearer: rec.token, realm: rec.realm, owner: rec.owner }) : null;
  } catch (e) { return null; }
}
// Storage holds exactly the page identity `id` ({kind, uid, sid}): all three equal. The current
// sid is never adopted, so a same-owner switch (account → token, a new token sign-in) is not held.
function holdsIdentity(id) {
  var s = id && storedSession();
  return !!s && s.kind === id.kind && s.uid === id.uid && s.sid === id.sid;
}
// An identity object ({kind, uid, sid}), as opposed to today's string uid or {uid, sid} pair.
function isSessionIdentity(x) {
  return !!x && typeof x === 'object' && (x.kind === 'account' || x.kind === 'token');
}

// The auth revision (`hub_auth_rev`, 16 [a-z0-9]). Every credential writer and every purge writes a
// fresh one BEFORE its first storage change; a token install compares it with the one it read at
// Continue, so any sign-in, sign-out, refresh or install in between makes it refuse. Both throw
// when storage does: the token flow treats that as "storage unavailable", account writers ignore it.
function readAuthRev() {
  return localStorage.getItem(AUTH_REV_KEY);
}
function bumpAuthRev() {
  var v = randomLowerId(16);
  localStorage.setItem(AUTH_REV_KEY, v);
  return v;
}
function bumpAuthRevQuiet() {
  try { bumpAuthRev(); } catch (e) { /* account writers proceed without coordination */ }
}
function anyAccountCredential() {
  for (var i = 0; i < ACCOUNT_CREDENTIAL_KEYS.length; i++) if (localStorage.getItem(ACCOUNT_CREDENTIAL_KEYS[i]) !== null) return true;
  return false;
}
// The login and signup pages' entry purge (a failed password or an expired 2FA step no longer purges
// anything; they drop only their own flow tokens): it reclassifies and
// purges only when nothing usable is stored, so a session that appeared after the page's redirect
// check is never removed. Abandoned 2FA and intent state goes either way (next to an account
// session it is removed alone, the session and its boot token untouched), and so does a malformed
// or unknown-version record (the purge removes the record key). Returns the class it saw.
function clearStaleAuth() {
  var cls = classifyStoredAuth();
  if (cls === 'none') clearAuthTokens();
  else if (cls === 'account' && (localStorage.getItem('two_factor_token') !== null || localStorage.getItem('auth_intent_token') !== null)) {
    bumpAuthRevQuiet();
    try { localStorage.removeItem('two_factor_token'); localStorage.removeItem('auth_intent_token'); } catch (e) {}
  }
  return cls;
}
// Drops sign-in flow state, never a stored session (account or token): that is not part of any flow.
// With `own` ({ intent, twoFactor }, the tokens a flow read or wrote when it started) only that
// flow's own tokens go, each only while storage still holds it: another tab may have started a
// newer flow meanwhile, and its intent and 2FA tokens stay. Without `own` (a host app starting a
// new sign-in, login.js and signup.js entry) every earlier flow's intent and 2FA token goes.
function clearFlowTokens(own) {
  try {
    if (own) {
      var intentOurs = !!own.intent && localStorage.getItem('auth_intent_token') === own.intent;
      var tfaOurs = !!own.twoFactor && localStorage.getItem('two_factor_token') === own.twoFactor;
      if (!intentOurs && !tfaOurs) return;
      bumpAuthRevQuiet();
      if (intentOurs) localStorage.removeItem('auth_intent_token');
      if (tfaOurs) localStorage.removeItem('two_factor_token');
      return;
    }
    if (localStorage.getItem('two_factor_token') === null && localStorage.getItem('auth_intent_token') === null) return;
    bumpAuthRevQuiet();
    localStorage.removeItem('two_factor_token');
    localStorage.removeItem('auth_intent_token');
  } catch (e) { /* storage unreadable: nothing of the flow can be used either */ }
}
// The install, the introspection parser and the logout page's token identity are token-only:
// token-auth.js (loaded only on token paths).

// Pre-purge hooks: every purgeAuthStorage() runs them first, whatever path called it (the Hub's
// sign-out, a failed refresh, a 401, an entry page). The new Hub registers one that bumps the
// realm generation and emits hub:teardown, so in-memory state of the leaving account is dropped
// before its storage is. A throwing hook never skips the purge.
// Each hook gets `{ reason, uid }`: why storage is purged ('signout' a deliberate sign-out, 'expiry' a
// session that ended on its own, 'refresh' a failed refresh, 'forget' Forget this browser, 'cleanup'
// any other purge) and the outgoing account id read before anything is removed (authUidFromStorage:
// a token session's owner; null when nothing is stored). 'signout', 'expiry', 'refresh' and 'cleanup'
// remove no forget:true key (held changes, scripts' asks): the warned sign-out's scoped forget removes the
// holds it showed before the purge. Only 'forget' also removes the forget:true keys, each whole.
var AUTH_PURGE_HOOKS = [];
function onBeforeAuthPurge(fn) {
  if (typeof fn === 'function') AUTH_PURGE_HOOKS.push(fn);
}

// The sign-out purge. Order is load-bearing:
//   0. Run the pre-purge hooks (onBeforeAuthPurge), then bump the auth revision (a token install
//      still waiting on the login page refuses; `hub_auth_rev` itself survives the purge).
//   1. Read the outgoing user id BEFORE any auth key is removed (it comes from the session token).
//   2. Advance `hub_boot_token_epoch:<uid>`: a fresh nonce, written whether or not a boot-token
//      record exists. A mint still in flight in any tab of this browser compares the epoch it
//      started with at its publish step and discards its token instead of storing it.
//   3. Remove every `purge: true` key and family, local and session.
//   4. If the epoch write in step 2 threw (a full quota), write it once more now that step 3 has
//      freed space.
// Each step is guarded separately: a storage throw in one must not skip the others.
// `opts.reason` is passed to the hooks (default 'cleanup'); 'forget' also removes the `forget: true` entries.
function purgeAuthStorage(opts) {
  var reason = (opts && opts.reason) || 'cleanup', forget = reason === 'forget';
  var info = { reason: reason, uid: null };
  try { info.uid = authUidFromStorage(); } catch (eu) { info.uid = null; }
  // Ending a session fences a pending signup answer in any tab, and so does "Forget this browser" (it removes
  // the referral entry, so a late 200 must not bring it back); any other purge with nobody signed in does not.
  try { if (forget || classifyStoredAuth() !== 'none') bumpRefRev(); } catch (ec) {}
  for (var h = 0; h < AUTH_PURGE_HOOKS.length; h++) {
    try { AUTH_PURGE_HOOKS[h](info); } catch (e0) {}
  }
  bumpAuthRevQuiet();
  var uid = null;
  try { uid = authUidFromStorage(); } catch (e) { uid = null; }
  var epochWritten = false;
  if (uid) {
    try { localStorage.setItem('hub_boot_token_epoch:' + uid, freshEpochNonce()); epochWritten = true; } catch (e) {}
  }
  var areas = ['local', 'session'];
  for (var a = 0; a < areas.length; a++) {
    try {
      var store = areas[a] === 'local' ? localStorage : sessionStorage;
      var doomed = [];
      for (var i = 0; i < store.length; i++) {
        var k = store.key(i);
        var e = k === null ? null : authStorageEntry(areas[a], k);
        if (e && (e.purge || (forget && e.forget))) doomed.push(k);
      }
      // Each removal alone: one refused key never skips the later ones (the caller's read-back judges what stayed).
      for (var j = 0; j < doomed.length; j++) { try { store.removeItem(doomed[j]); } catch (er) {} }
    } catch (e2) {}
  }
  // A full storage quota refuses the first epoch write; the removals above freed space, so try
  // once more. Without an advanced epoch a mint still in flight would store its token.
  if (uid && !epochWritten) {
    try { localStorage.setItem('hub_boot_token_epoch:' + uid, freshEpochNonce()); } catch (e3) {}
  }
}

// Clear all auth tokens and every other sign-out-purged key (AUTH_STORAGE_REGISTRY). Called on
// entry pages (login/signup) to flush stale state, on any error/fallback path to minimize the
// window a token could be replayed, and on logout. Covers both the PKCE intent flow
// (auth_intent_token / two_factor_token) AND the no-PKCE bearer-token flow used by /auth/home
// (access_token / refresh_token + their expiry metadata).
function clearAuthTokens(opts) {
  purgeAuthStorage(opts);
}

// Persist the tokens returned by a non-PKCE login / 2fa / refresh response.
// Called from login.js and 2fa.js after parsing the response JSON. A deliberate account sign-in
// supersedes a token session in every tab: the record is removed before the account keys are
// written and again after (a token install racing in another tab then sees account keys and rolls
// itself back). Token code never removes account keys, so the account always wins.
function storeAccessTokens(payload) {
  if (!payload) return;
  refGen++; // a session on this page: a pending signup answer keeps no referral
  bumpRefRev();
  bumpAuthRevQuiet();
  try { localStorage.removeItem(TOKEN_SESSION_KEY); } catch (e) {}
  try {
    if (payload.token) localStorage.setItem('access_token', payload.token);
    if (payload.expires_at) localStorage.setItem('access_token_expires_at', payload.expires_at);
    if (payload.refreshToken) localStorage.setItem('refresh_token', payload.refreshToken);
    if (payload.refresh_expires_at) localStorage.setItem('refresh_token_expires_at', payload.refresh_expires_at);
  } catch(e) {}
  try { localStorage.removeItem(TOKEN_SESSION_KEY); } catch (e) {}
}

// A sign-in answer that may have come back late: stored only while the auth revision still reads
// `rev`, the one its page read right before the send. Another tab's sign-in, sign-out or token
// install in between moved it, and that newer state stays. A revision that could not be read
// (null) proves nothing, so nothing is stored. Returns true when the tokens were written.
function storeAccessTokensIfCurrent(payload, rev) {
  if (rev === null || authRevOrNull() !== rev) return false;
  storeAccessTokens(payload);
  return true;
}

// Turning 2FA on or off (POST /users/auth/2fa/verify-setup, DELETE /users/auth/2fa) revokes every
// session of the account, the acting one included, and answers with a fresh pair for the acting
// session (same sid, new generation): {token, refreshToken, expires_at, refresh_expires_at,
// session_id}. Without it the page's next call fails as a revoked session. Adopted only for
// `owner` (the user the change was sent as), only when both tokens name that user and one sid, and
// only while every token storage holds is still that same session (uid AND sid): a sign-out
// (nothing stored), another account, or a newer sign-in of the same user (another sid) is never
// overwritten. Returns true when stored. Like sendRefresh's publish fence this compares and then
// writes: atomic within this tab, not across tabs.
function adoptReissuedSession(d, owner) {
  try {
    if (!d || typeof d !== 'object' || owner === undefined || owner === null || owner === '') return false;
    var tok = d.token, rt = d.refreshToken, uid = String(owner);
    if (typeof tok !== 'string' || !tok || typeof rt !== 'string' || !rt) return false;
    var sid = sessionTokenSid(tok);
    if (!sid || sessionTokenUid(tok) !== uid || sessionTokenUid(rt) !== uid || sessionTokenSid(rt) !== sid) return false;
    if (d.session_id !== undefined && d.session_id !== sid) return false;
    var held = [localStorage.getItem('access_token'), localStorage.getItem('refresh_token')], any = false;
    for (var i = 0; i < held.length; i++) {
      if (!held[i]) continue;
      if (sessionTokenUid(held[i]) !== uid || sessionTokenSid(held[i]) !== sid) return false;
      any = true;
    }
    if (!any) return false;
    storeAccessTokens(d);
    return localStorage.getItem('access_token') === tok && localStorage.getItem('refresh_token') === rt;
  } catch (e) { return false; }
}

// ── Sign-out of this browser (the logout page and both Hubs) ──────────────────
// The session a sign-out is leaving: (uid, sid) as storage holds it when the sign-out starts, or
// null. `shown`, the user a Hub displays: a stored session of anyone else (its storage event not
// yet delivered) is not this page's and is never taken as the outgoing one. A string or absent
// `shown` names account sessions only: a stored token record is never returned for it (the logout
// page asks outgoingTokenSession() for that). A page identity ({kind, uid, sid}) is returned as is
// while storage holds exactly it, else null: the current sid is never adopted.
function outgoingSession(shown) {
  if (isSessionIdentity(shown)) return holdsIdentity(shown) ? shown : null;
  try {
    var tok = localStorage.getItem('access_token') || localStorage.getItem('refresh_token');
    var uid = tok ? sessionTokenUid(tok) : null;
    if (!uid) return null;
    if (shown !== undefined && shown !== null && shown !== '' && String(shown) !== uid) return null;
    return { uid: uid, sid: sessionTokenSid(tok) };
  } catch (e) { return null; }
}
// Storage still holds exactly session `s`: a refresh keeps its sid, a new sign-in (even by the same
// user) does not. A page identity compares kind, uid and sid.
function holdsSession(s) {
  if (!s) return false;
  if (isSessionIdentity(s)) return holdsIdentity(s);
  var now = outgoingSession();
  return !!now && now.uid === s.uid && now.sid === s.sid;
}
// Ends the outgoing session server-side while its bearer still exists. Best-effort and bounded:
// always resolves, within `ms` (default 2000). First the boot token (HubBootToken.revoke, its own
// owner-bound DELETEs, when that module is on the page), then the login session itself
// (DELETE /users/auth/sessions/<sid>: ends this one session; never POST /users/auth/logout, which
// ends every device of the account). The session DELETE is sent only as that user and only while
// storage still holds that same session. A token session has neither: it resolves at once (leaving
// it never stops the shared access for others; that is the owner's own action).
function endOutgoingSession(s, ms) {
  if (!s || !s.uid || s.kind === 'token') return Promise.resolve();
  var bound = typeof ms === 'number' && ms > 0 ? ms : 2000;
  var limit = new Promise(function (r) { setTimeout(r, bound); });
  var work = Promise.resolve().then(function () {
    if (window.HubBootToken && typeof window.HubBootToken.revoke === 'function') return window.HubBootToken.revoke(s.uid);
  }).then(null, function () {}).then(function () {
    if (!s.sid || !holdsSession(s)) return;
    return apiCall('DELETE', '/users/auth/sessions/' + encodeURIComponent(s.sid), undefined, null, undefined,
      { owner: s.uid, alive: function () { return holdsSession(s); }, timeoutMs: bound });
  }).then(null, function () {});
  return Promise.race([work, limit]);
}
// What an earlier purge of account session `s` (a page identity) left behind: no access token, and the refresh
// token still of the same user and sid. It is still that session's, so a purge Try again removes it.
function holdsRemnantOf(s) {
  if (!isSessionIdentity(s) || s.kind !== 'account') return false;
  try {
    if (localStorage.getItem('access_token') !== null) return false;
    var rt = localStorage.getItem('refresh_token');
    if (rt) return sessionTokenUid(rt) === s.uid && sessionTokenSid(rt) === s.sid;
    // Neither token left, only `s`'s boot token (a purge whose boot-token removal was refused): still a leftover of
    // this sign-out. A sign-in in another tab, the same user's included, stores an access token, so it never matches.
    return localStorage.getItem('hub_boot_token:' + s.uid) !== null;
  } catch (e) { return false; }
}
// Removes only the leftovers of `s` (holdsRemnantOf): its refresh token, that token's expiry and `s`'s boot token,
// re-checked right before: anything else stored now (another tab's sign-in step or session) is not this page's and
// stays. The credential goes first and every removal is tried alone, so a refused expiry never keeps the token.
// Not atomic: another tab writing between the re-check and a removal is the general check-then-purge limit of Web
// Storage (no compare-and-delete). 'purged', or 'failed' while the refresh token or the boot token is still there.
function purgeRemnant(s) {
  bumpAuthRevQuiet();
  var mine = false;
  try { mine = holdsRemnantOf(s); } catch (e0) { mine = false; }
  if (mine) {
    try { localStorage.removeItem('refresh_token'); } catch (e1) {}
    try { localStorage.removeItem('refresh_token_expires_at'); } catch (e2) {}
    try { localStorage.removeItem('hub_boot_token:' + s.uid); } catch (e3) {}
  }
  try {
    var rt = localStorage.getItem('refresh_token');
    if (rt && sessionTokenUid(rt) === s.uid && sessionTokenSid(rt) === s.sid) return 'failed';
    if (mine && localStorage.getItem('hub_boot_token:' + s.uid) !== null) return 'failed';
    return 'purged';
  } catch (e) { return 'failed'; }
}
// The sign-out purge: only while storage still holds the outgoing session, so another tab's sign-in
// during the wait (even by the same user) is left alone. With no outgoing session (nothing of this
// page's was stored) it purges only while storage still holds no account session of anyone: a
// token record never counts as someone's session there, because "sign out" means everything local
// in this browser (another tab holding it reloads to sign-in; the shared token is not revoked).
// Returns 'purged', 'kept' (the session changed meanwhile; nothing removed) or 'failed' (a credential
// key or the record is still readable after the purge: the caller must not say "signed out").
// The purge reason is `opts.reason`, and 'expiry' when none is given (a caller
// that forgot). The 'signout', 'expiry', 'refresh' and 'cleanup' reasons remove no held change or scripts'
// ask; only 'forget' (Forget this browser) removes the forget:true keys whole. The Hub's warned sign-out removes
// the holds it showed (core signOutForgetting) before it calls this.
function purgeOutgoingSession(s, opts) {
  if (s && !holdsSession(s)) return holdsRemnantOf(s) ? purgeRemnant(s) : 'kept';
  if (!s && outgoingSession()) return 'kept';
  try { clearReturnContext(); } catch (e) {}
  clearAuthTokens({ reason: (opts && opts.reason) || 'expiry' });
  try {
    if (anyAccountCredential() || localStorage.getItem(TOKEN_SESSION_KEY) !== null) return 'failed';
    // The outgoing account's boot token is a credential too (purge: true): still stored = not signed out.
    if (s && s.kind === 'account' && localStorage.getItem('hub_boot_token:' + s.uid) !== null) return 'failed';
  } catch (e) { return 'failed'; }
  return 'purged';
}

// Forget this browser: the sign-out purge plus every `forget: true` entry, whoever's session is stored
// (it is the browser that is forgotten, not one account). Returns 'purged', or 'failed' when a credential,
// the token record or a forget entry is still readable afterwards (the caller must not say "forgotten").
function forgetBrowserStorage() {
  try { clearReturnContext(); } catch (e) {}
  clearAuthTokens({ reason: 'forget' });
  try {
    if (anyAccountCredential() || localStorage.getItem(TOKEN_SESSION_KEY) !== null) return 'failed';
    for (var i = 0; i < AUTH_STORAGE_REGISTRY.length; i++) {
      var e = AUTH_STORAGE_REGISTRY[i];
      if (!e.forget || e.key === undefined) continue;
      if ((e.area === 'local' ? localStorage : sessionStorage).getItem(e.key) !== null) return 'failed';
    }
  } catch (e2) { return 'failed'; }
  return 'purged';
}

// ── The Hub passcode's shared pieces (core/applock.ts) ──────
// postHubLock(uid): the lock-only broadcast. Every open Hub tab of `uid` locks on it; the message carries nothing
// else (a receiver reads only `t` and `uid`, and can only lock). BroadcastChannel `hub-lock`, or, where that is
// missing, a fresh `hub_lock_now:<uid>` stamp whose storage event the other tabs act on. Best effort, never throws.
var HUB_LOCK_PREFIX = 'hub_lock:';
var HUB_LOCK_NOW_PREFIX = 'hub_lock_now:';
function postHubLock(uid) {
  if (typeof uid !== 'string' || !uid) return;
  try {
    if (typeof BroadcastChannel === 'function') {
      var ch = new BroadcastChannel('hub-lock');
      ch.postMessage({ t: 'lock', uid: uid });
      ch.close();
      return;
    }
  } catch (e) { /* fall back to the storage stamp */ }
  try { localStorage.setItem(HUB_LOCK_NOW_PREFIX + uid, JSON.stringify({ at: Date.now(), n: randomLowerId(12) })); } catch (e2) {}
}
// The keys of one storage area that start with `prefix`; throws when the area cannot be read.
function storageKeysWithPrefix(store, prefix) {
  var out = [];
  for (var i = 0; i < store.length; i++) {
    var k = store.key(i);
    if (typeof k === 'string' && k.indexOf(prefix) === 0) out.push(k);
  }
  return out;
}
// Forget this browser, passcode included. It takes NO Web Lock (it never waits for one) and
// covers every account in storage when it runs:
//   1. the lock-only broadcast for every uid with a `hub_lock:` record or a stored credential;
//   2. forgetBrowserStorage(): the credential purge and the `forget: true` removals, then the read-back of step 4
//      without the records (forgetBrowserStorage reads back only exact keys; prefix entries are read back here);
//   3. only when step 2 answered 'purged' and its read-back found nothing: remove every `hub_lock:*` key, whatever uid
//      (a passcode outlives a failed purge, so every load of a still signed-in browser stays locked);
//   4. read back: no credential, no `forget: true` key (exact and prefix entries, both areas), no `hub_lock:` key.
// Answers 'purged' or 'failed' at once; retrying is safe. A caller navigates only after the answer.
function forgetBrowser() {
  var uids = [];
  try {
    var held = storageKeysWithPrefix(localStorage, HUB_LOCK_PREFIX);
    for (var i = 0; i < held.length; i++) uids.push(held[i].slice(HUB_LOCK_PREFIX.length));
  } catch (e) {}
  try { var cu = authUidFromStorage(); if (cu) uids.push(cu); } catch (e1) {}
  for (var u = 0; u < uids.length; u++) {
    if (uids.indexOf(uids[u]) === u) postHubLock(uids[u]);
  }
  if (forgetBrowserStorage() !== 'purged' || forgetLeftover()) return 'failed';
  try {
    var doomed = storageKeysWithPrefix(localStorage, HUB_LOCK_PREFIX);
    for (var j = 0; j < doomed.length; j++) localStorage.removeItem(doomed[j]);
  } catch (e2) { return 'failed'; }
  if (forgetLeftover()) return 'failed';
  try { if (storageKeysWithPrefix(localStorage, HUB_LOCK_PREFIX).length) return 'failed'; } catch (e3) { return 'failed'; }
  return 'purged';
}
// Forget's read-back: true when a credential or any `forget: true` key (exact and prefix entries, both areas) is
// still there, or storage cannot be read.
function forgetLeftover() {
  try {
    if (anyAccountCredential() || localStorage.getItem(TOKEN_SESSION_KEY) !== null) return true;
    for (var r = 0; r < AUTH_STORAGE_REGISTRY.length; r++) {
      var e = AUTH_STORAGE_REGISTRY[r];
      if (!e.forget) continue;
      var store = e.area === 'local' ? localStorage : sessionStorage;
      if (e.key !== undefined ? store.getItem(e.key) !== null : storageKeysWithPrefix(store, e.prefix).length) return true;
    }
  } catch (e) { return true; }
  return false;
}

// ── URL parameter helpers ────────────────────────────────────
function getUrlParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

// PRESENCE, not value. `?error=` and `?error` both read back as '' through getUrlParam, so a
// truthiness test on the value cannot tell "absent" from "present but empty" — and a branch that
// must be terminal has to fire on both.
function hasUrlParam(name) {
  return new URLSearchParams(window.location.search).has(name);
}

// Query suffix for auth-page → auth-page redirects (login success → /auth/home,
// 2FA hop, 2FA success → /auth/home). Forwards UI params (lang/theme/…), a
// known Hub `view` (HUB_VIEWS) and `hub=v3` (dropUnknownHub), but STRIPS any other `view` —
// the os./hub.hoody.com shortcuts 302 to /auth/home?view=hub and that marker must not keep riding the auth flows.
function preserveQuery() {
  try {
    var params = new URLSearchParams(window.location.search);
    if (HUB_VIEWS.indexOf(params.get('view')) === -1) params.delete('view');
    dropUnknownHub(params);
    // `error` describes the page the user is LEAVING (a failed OAuth initiation, a lost
    // session). Carrying it forward would print a stale failure on the next page.
    params.delete('error');
    // The referral code lives in its stored entry (captureReferralFromUrl), not in later URLs.
    params.delete('ref');
    var qs = params.toString();
    return qs ? '?' + qs : '';
  } catch (e) { return ''; }
}

function applyQueryToLinks() {
  var params = new URLSearchParams(window.location.search);
  params.delete('token');
  // `view` rides the links only when it names a Hub view (HUB_VIEWS), the same rule as
  // preserveQuery(), so login → signup → 2FA keeps the Hub's destination. Anything else
  // (the shortcuts' view=hub marker) is dropped.
  if (HUB_VIEWS.indexOf(params.get('view')) === -1) params.delete('view');
  dropUnknownHub(params);
  // Same reasoning as preserveQuery(): an error belongs to the page that rendered it.
  params.delete('error');
  // The stored entry carries the referral code (captureReferralFromUrl).
  params.delete('ref');
  var qs = params.toString();
  if (!qs) return;
  qs = '?' + qs;
  document.querySelectorAll('a[href^="/auth/"]').forEach(function(a) {
    // Opt-out hatch for explicit-escape links where any query propagation
    // is undesirable.
    if (a.hasAttribute('data-no-query-rewrite')) return;
    var href = a.getAttribute('href');
    if (href && href.indexOf('?') === -1) {
      a.setAttribute('href', href + qs);
    }
  });
}

// ── Auth completion (PKCE) ─────────────────────────────────
async function completeAuth() {
  const ctx = getReturnContext();
  // completeAuth() handles the EXTERNAL hosted-UI flow only — its job is to
  // redirect to ctx.redirect_uri with `?code=…`. Self-PKCE has its own
  // finalizer (completeSelfPkce, called from /auth/callback). Treat any
  // self_finalize ctx here as if no usable context were present so the
  // caller falls through to render the form. ensurePkceContext() will then
  // reuse or refresh the self-PKCE pair.
  if (!ctx || !ctx.redirect_uri || !ctx.code_challenge || ctx.self_finalize) {
    // No PKCE context — show authenticated state or let caller show the form
    var intentToken = localStorage.getItem('auth_intent_token');
    if (!intentToken) {
      throw { status: 401, message: 'Not authenticated' };
    }
    showAuthenticatedState();
    return;
  }

  // Read intent token from localStorage (set by login.js, signup.js, 2fa.js, or the callback page's inline scrub).
  // No intent token means: fresh entry from a host app (URL-only PKCE params, the user hasn't logged in
  // yet) OR a half-completed flow (lost the intent_token tab). Throwing lets the caller render the form
  // — login.js's catch hides the loading state and shows the inputs. Redirecting to /auth/login here
  // would loop forever since the same redirect_uri+code_challenge live in the URL on every reload.
  var intentToken = localStorage.getItem('auth_intent_token');
  if (!intentToken) {
    throw { status: 401, message: 'Not authenticated' };
  }
  var ownCtx = returnContextOwn(intentToken);

  try {
    const res = await apiCall('POST', '/auth/authorize', {
      code_challenge: ctx.code_challenge,
      redirect_uri: ctx.redirect_uri,
    }, intentToken);

    // Clear the consumed tokens, fenced as clearReturnContext and clearFlowTokens describe.
    clearReturnContext(ownCtx);
    clearFlowTokens({ intent: intentToken });

    // Defense-in-depth: re-validate redirect_uri client-side before navigating
    const url = new URL(ctx.redirect_uri);
    if (url.protocol !== 'https:') {
      throw { status: 400, message: t('auth.error.generic') };
    }
    url.searchParams.set('code', res.data.code);
    if (ctx.state) url.searchParams.set('state', ctx.state);
    window.location.href = url.toString();
    return true; // the hand-off: callers that track the stored referral clear it now
  } catch (e) {
    // 401 from /authorize means the intent token was invalid (replayed/expired/wrong-challenge). Clear
    // the bad token but keep ctx — a fresh login will re-issue an intent bound to the same ctx.code_challenge.
    // Throw rather than redirect so the caller's catch decides UX (login form / callback error card),
    // which avoids the redirect loop the old `/auth/login?error=session_lost` redirect produced when
    // the URL still carried the original redirect_uri+code_challenge.
    if (!isSupersededAuthError(e)) clearFlowTokens({ intent: intentToken });
    throw e;
  }
}

// ── Self-PKCE finalization (direct-visit OAuth) ────────────
// Runs on /auth/callback when the active context was self-minted. Calls
// /authorize → /exchange in-place (no second navigation through ctx.redirect_uri,
// which would loop back to /auth/callback). Persists the resulting tokens via
// storeAccessTokens() and lands the user on /auth/home. Resolves true only when this attempt
// stored its session; a handled failure (session_lost redirect) resolves undefined.
async function completeSelfPkce() {
  var ctx = getReturnContext();
  if (!ctx || !ctx.code_challenge || !ctx.redirect_uri || !ctx.self_finalize) {
    throw { status: 400, message: 'Missing self-PKCE context' };
  }
  // Nothing is sent with a missing, empty or non-string credential (a stored "undefined" included).
  var verifier = getSelfPkceVerifier();
  if (!usableCredential(verifier) || !PKCE_VERIFIER_SHAPE.test(verifier)) {
    throw { status: 400, message: 'Missing self-PKCE verifier' };
  }
  var intentToken = localStorage.getItem('auth_intent_token');
  if (!usableCredential(intentToken)) {
    window.location.href = '/auth/login?error=session_lost';
    return;
  }
  var ownCtx = returnContextOwn(intentToken);

  try {
    var authRes = await apiCall('POST', '/auth/authorize', {
      code_challenge: ctx.code_challenge,
      redirect_uri: ctx.redirect_uri,
    }, intentToken);
    var code = authRes && authRes.data && authRes.data.code;
    if (!usableCredential(code)) throw { status: 500, message: t('auth.error.generic') };

    // Drop the intent token — /authorize consumed it (only while it is still this flow's).
    clearFlowTokens({ intent: intentToken });

    // Sent as nobody: a session already stored (another account's, or this one's) is neither
    // attached nor refreshed for it, and a refused code is never followed by a refresh and a resend.
    // The revision is read after this flow's own token clear above, right before the send.
    var revAtSend = authRevOrNull();
    var exRes = await apiCall('POST', '/auth/exchange', {
      code: code,
      code_verifier: verifier,
      redirect_uri: ctx.redirect_uri,
    }, undefined, false, { anonymous: true });
    var pair = sessionPair(exRes && exRes.data, null);
    if (!pair) throw { status: 500, message: t('auth.error.generic') };

    // Read the final_path BEFORE clearReturnContext() wipes the slot.
    // Today ctx is a local var that survives the clear, but ordering it
    // explicitly prevents a future refactor that re-reads from storage
    // from silently dropping the path.
    var finalPath = safeFinalPath(ctx.final_path) || '/auth/home';
    // Tokens come from the same shape as login, stored only if no other tab signed in or out while
    // the exchange was out; otherwise that newer state stays and the Hub shows it.
    if (!storeAccessTokensIfCurrent(pair, revAtSend)) {
      clearReturnContext(ownCtx);
      window.location.href = finalPath;
      return;
    }
    clearReturnContext(ownCtx);
    window.location.href = finalPath;
    // The only success outcome: this attempt stored its own session.
    return true;
  } catch (e) {
    if (!isSupersededAuthError(e)) clearFlowTokens({ intent: intentToken });
    clearReturnContext(ownCtx);
    if (e && e.status === 401) {
      // Clean reset on session_lost.
      window.location.href = '/auth/login?error=session_lost';
      return;
    }
    throw e;
  }
}

// ── 2FA handling ───────────────────────────────────────────
// Forward the current query string (lang/theme UI params and the Hub's known
// `view`, see preserveQuery) to /auth/2fa.
function handle2fa() {
  window.location.href = '/auth/2fa' + preserveQuery();
}

// ── Error display ──────────────────────────────────────────
function showError(container, msg) {
  let el = container.querySelector('.auth-error');
  if (!el) {
    el = document.createElement('div');
    el.className = 'auth-error';
    el.setAttribute('role', 'alert');
    // Insert before the first button or at the end
    const btn = container.querySelector('.auth-btn');
    if (btn) btn.parentNode.insertBefore(el, btn);
    else container.appendChild(el);
  }
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError(container) {
  const el = container.querySelector('.auth-error');
  if (el) el.classList.add('hidden');
}

// ── Button loading state ──────────────────────────────────
// For the split-button (with .auth-btn__main) we only mutate the inner label
// so the yellow pixel accent structure is preserved. Otherwise falls back to
// whole-button text replacement.
function setLoading(btn, loading) {
  var main = btn.querySelector('.auth-btn__main > span') || btn.querySelector('.auth-btn__main') || btn;
  if (loading) {
    btn.dataset.originalText = main.textContent;
    btn.setAttribute('aria-busy', 'true');
    btn.setAttribute('aria-label', main.textContent);
    main.textContent = t('auth.loading') || '...';
    btn.classList.add('auth-btn--loading');
    btn.disabled = true;
  } else {
    main.textContent = btn.dataset.originalText || main.textContent;
    btn.removeAttribute('aria-busy');
    btn.removeAttribute('aria-label');
    btn.classList.remove('auth-btn--loading');
    btn.disabled = false;
  }
}

// ── Authenticated state (no redirect_uri) ──────────────────
function showAuthenticatedState() {
  const card = document.querySelector('.auth-card');
  if (!card) return;
  card.textContent = '';
  var wrapper = document.createElement('div');
  wrapper.className = 'auth-success-card';
  var icon = document.createElement('div');
  icon.className = 'auth-icon auth-icon--success';
  icon.textContent = '\u2713';
  var title = document.createElement('h2');
  title.className = 'auth-title';
  title.textContent = t('auth.signedIn');
  var subtitle = document.createElement('p');
  subtitle.className = 'auth-subtitle';
  subtitle.textContent = t('auth.alreadyAuthenticated');
  wrapper.appendChild(icon);
  wrapper.appendChild(title);
  wrapper.appendChild(subtitle);
  card.appendChild(wrapper);
}

function showLoginLink() {
  const card = document.querySelector('.auth-card');
  if (!card) return;
  const link = document.createElement('a');
  link.href = '/auth/login' + preserveQuery();
  link.className = 'auth-link';
  link.textContent = t('auth.backToLogin');
  card.appendChild(link);
}

// ── Init: Store return context from URL params ─────────────
function initReturnContext() {
  const redirectUri = getUrlParam('redirect_uri');
  const codeChallenge = getUrlParam('code_challenge');
  const state = getUrlParam('state');
  if (redirectUri && codeChallenge) {
    storeReturnContext(redirectUri, codeChallenge, state);
  }
}

// ── Show/hide elements ─────────────────────────────────────
function show(el) { if (el) el.classList.remove('hidden'); }
function hide(el) { if (el) el.classList.add('hidden'); }

// ── Iframe auto-resize for marketing-site embeds ──────────
// When the auth page is loaded inside a cross-origin iframe (the site, the
// docs, a platform subdomain), post the rendered document height to
// the parent so it can grow the iframe element to match — avoiding an
// inner scrollbar when content expands (validation errors, multi-step
// flows, etc.).
//
// Contract: postMessage({ type: 'hoody-auth-resize', height: <int> })
// Target origin is read from document.referrer and validated against an
// allowlist of the platform's own origins, a subset of what the server's
// frame-ancestors policy may allow. Never posts to '*'; if the referrer is
// missing or unlisted, the script is a silent no-op.
(function () {
  if (window.parent === window) return; // not embedded

  // The platform's own origins: a subset of what the server's frame-ancestors
  // policy (AUTH_FRAME_ANCESTORS) may allow. A parent the server allows but
  // this list lacks simply gets no resize message. postMessage targetOrigin
  // must be a specific origin, so we resolve the parent origin from
  // document.referrer and only post if it matches one of these.
  var ALLOW_EXACT = ['https://hoody.com', 'https://www.hoody.com', 'https://docs.hoody.com'];
  var ALLOW_SUFFIX = ['.hoody.com'];
  // A computer's own program hosts are never a parent to post to (the server refuses them as embedders too).
  var PROGRAM_FAMILIES = ['computers', 'containers'];
  function isProgramHost(host, suffix) {
    for (var j = 0; j < PROGRAM_FAMILIES.length; j++) {
      var fam = PROGRAM_FAMILIES[j] + suffix;
      if (host === fam || host.slice(-(fam.length + 1)) === '.' + fam) return true;
    }
    return false;
  }

  function resolveParentOrigin() {
    var ref = document.referrer;
    if (!ref) return null; // browsers may strip Referer cross-origin
    var u; try { u = new URL(ref); } catch (_) { return null; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (ALLOW_EXACT.indexOf(u.origin) !== -1) return u.origin;
    // A suffix match is https only.
    if (u.protocol !== 'https:') return null;
    var host = u.hostname.toLowerCase();
    for (var i = 0; i < ALLOW_SUFFIX.length; i++) {
      var s = ALLOW_SUFFIX[i];
      if (isProgramHost(host, s)) return null;
      if (host.length > s.length && host.slice(-s.length) === s) return u.origin;
    }
    return null;
  }

  var parentOrigin = resolveParentOrigin();
  if (!parentOrigin) return;

  // shared.css sets `body { min-height: 100vh }` so the standalone (non-
  // iframed) layout vertically centers. Inside an iframe that 100vh is the
  // iframe's own height, which makes body's height *sticky*: once the parent
  // grows the iframe to fit a tall form, content shrinking can't shrink it
  // back (body still measures 100vh = the larger iframe). Neutralize it when
  // embedded so document height tracks actual content.
  function disableStickyMinHeight() {
    if (document.body) {
      document.body.style.minHeight = '0';
      document.body.style.minBlockSize = '0';
    }
  }
  if (document.body) {
    disableStickyMinHeight();
  } else {
    document.addEventListener('DOMContentLoaded', disableStickyMinHeight, { once: true });
  }

  // Defensive bounds: parent will clamp on receipt, but we never emit
  // garbage (NaN/Infinity/negative/0/absurdly-large). Max is generous —
  // a 20k-pixel auth form would mean something is very wrong, but we
  // want to leave slack for tall translations + validation errors.
  var MIN_HEIGHT = 1;
  var MAX_HEIGHT = 20000;

  var lastHeight = -1;
  var rafPending = false;

  function send() {
    rafPending = false;
    var raw = document.documentElement && document.documentElement.scrollHeight;
    if (typeof raw !== 'number' || !isFinite(raw)) return; // NaN / Infinity / undefined
    var h = Math.ceil(raw);
    if (h < MIN_HEIGHT) return;             // 0 or negative — transient layout, skip
    if (h > MAX_HEIGHT) h = MAX_HEIGHT;     // clamp pathological values
    if (h === lastHeight) return;
    lastHeight = h;
    try {
      window.parent.postMessage({ type: 'hoody-auth-resize', height: h }, parentOrigin);
    } catch (_) { /* parent torn down or origin mismatch — give up silently */ }
  }

  function schedule() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(send);
  }

  // ResizeObserver catches every DOM/layout change (errors appearing,
  // multi-step transitions, OAuth-button collapse, font-driven reflow).
  // We observe `document.body` rather than `document.documentElement` —
  // body reflects content-driven size changes more reliably across
  // browsers (documentElement is often viewport-sized).
  function startObserver() {
    if (typeof ResizeObserver !== 'function' || !document.body) return;
    try { new ResizeObserver(schedule).observe(document.body); } catch (_) {}
  }
  if (document.body) {
    startObserver();
  } else {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  }

  // Fire on full load (DOMContentLoaded misses late web-font layout) and
  // once more on the next frame to catch any font-driven shift that
  // resolves after the load event.
  if (document.readyState === 'complete') {
    schedule();
    requestAnimationFrame(schedule);
  } else {
    window.addEventListener('load', function () {
      schedule();
      requestAnimationFrame(schedule);
    });
  }
})();

// ── Run on load ───────────────────────────────────────────
hydrateI18n();
captureReferralFromUrl();
applyQueryToLinks();
