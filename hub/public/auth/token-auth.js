'use strict';

// token-auth.js — the token-session helpers only a shared-access (token) path needs.
// They live outside shared.js so an account page never loads them.
// Loaded after shared.js, whose record reader, revision and
// storage helpers they use, by: the login page's token form (login.js loads it before
// token-login.js), the Hub's `session` module (hub-load.js deps) and the logout page (logout.html).
//
// Globals: installTokenSession(rec, rev0), outgoingTokenSession(), parseTokenIntrospection(body).

// The login page's Open: one synchronous block that installs `rec` ({token, realm, owner, sid?})
// only if nothing changed since Continue read `rev0`. It never removes anything but its own record,
// by its own sid, so an account session written meanwhile always survives ("the account wins"):
//   1. refuse ('stale') unless the revision is still rev0, no account credential or record exists and, on a
//      standalone page, storage still names this page's Hoody;
//   2. bump the revision, write the record;
//   3. read back: our sid, our revision, still no account credential; otherwise remove ours, 'stale'.
//      On success the stored referral ends with the sign-in (clearStoredReferral, shared.js).
// A storage throw anywhere is 'storage' (our record removed by sid); a bad record is 'invalid'.
function installTokenSession(rec, rev0) {
  if (rev0 !== null && typeof rev0 !== 'string') return { ok: false, why: 'storage' };
  var src = plainObject(rec) ? rec : {};
  var sid = typeof src.sid === 'string' && AUTH_SID_RE.test(src.sid) ? src.sid : randomLowerId(16);
  var owner = plainObject(src.owner) ? { id: src.owner.id, username: src.owner.username } : null;
  var raw = JSON.stringify({ v: 1, token: src.token, realm: src.realm, sid: sid, owner: owner, at: Date.now() });
  if (!parseTokenRecord(raw)) return { ok: false, why: 'invalid' };
  function dropOurs() {
    try { var cur = readTokenSession(); if (cur && cur.sid === sid) localStorage.removeItem(TOKEN_SESSION_KEY); } catch (e) {}
  }
  try {
    if (readAuthRev() !== rev0 || anyAccountCredential() || localStorage.getItem(TOKEN_SESSION_KEY) !== null) return { ok: false, why: 'stale' };
    // A standalone page installs only while storage still names its own Hoody: the key was checked there.
    if (STANDALONE_PAGE && !standaloneApiHeld()) return { ok: false, why: 'stale' };
    var rev1 = bumpAuthRev();
    localStorage.setItem(TOKEN_SESSION_KEY, raw);
    var back = readTokenSession();
    if (!back || back.sid !== sid || readAuthRev() !== rev1 || anyAccountCredential()) { dropOurs(); return { ok: false, why: 'stale' }; }
    // Another tab named another Hoody between the check and the write: the key was checked on this page's.
    if (STANDALONE_PAGE && !standaloneApiHeld()) { dropOurs(); return { ok: false, why: 'stale' }; }
    // A session now exists in this browser: the referral intent ends with it (also fencing a signup
    // answer still in flight in another tab), as for every other sign-in.
    try { clearStoredReferral(); } catch (er) {}
    return { ok: true, sid: sid };
  } catch (e) {
    dropOurs();
    return { ok: false, why: 'storage' };
  }
}
// The stored token session as an outgoing identity ({kind:'token', uid, sid}, frozen) for the logout
// page, whose identity is by definition the session held when it loads; null otherwise.
function outgoingTokenSession() {
  var s = storedSession();
  return s && s.kind === 'token' ? Object.freeze({ kind: 'token', uid: s.uid, sid: s.sid }) : null;
}

// Only exact-true leaves survive; other values, prototype keys and trees deeper than 6 are dropped.
function trueLeaves(o, depth) {
  var out = {};
  if (!plainObject(o) || depth > 6) return out;
  Object.keys(o).forEach(function (k) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') return;
    var v = o[k];
    if (v === true) out[k] = true;
    else if (plainObject(v)) { var sub = trueLeaves(v, depth + 1); if (Object.keys(sub).length) out[k] = sub; }
  });
  return out;
}
// GET /auth/tokens/me, for the login page and the Hub:
// {id, alias, perms (exact-true leaves only), expiresAt (ms or null), realmIds (lowercase, unique),
// allowNoRealm, vaultAccess, eventAccess (true only on exact true), isEnabled (false only on
// is_enabled:false)}, frozen; null for a malformed body.
function parseTokenIntrospection(body) {
  var d = plainObject(body) && plainObject(body.data) ? body.data : body;
  var tk = plainObject(d) ? d.token : null;
  if (!plainObject(tk) || typeof tk.id !== 'string' || !tk.id || typeof tk.alias !== 'string') return null;
  if (!Array.isArray(tk.realm_ids) || tk.realm_ids.length > 1000 || typeof tk.allow_no_realm !== 'boolean' || !plainObject(tk.permissions)) return null;
  var realms = [];
  for (var i = 0; i < tk.realm_ids.length; i++) {
    var r = tk.realm_ids[i];
    if (typeof r !== 'string' || !/^[0-9a-fA-F]{24}$/.test(r)) return null;
    r = r.toLowerCase();
    if (realms.indexOf(r) === -1) realms.push(r);
  }
  var exp = null;
  if (tk.expires_at !== null && tk.expires_at !== undefined) {
    exp = typeof tk.expires_at === 'string' ? Date.parse(tk.expires_at) : NaN;
    if (!isFinite(exp)) return null;
  }
  return Object.freeze({
    id: tk.id, alias: tk.alias, perms: trueLeaves(tk.permissions, 0), expiresAt: exp, realmIds: Object.freeze(realms),
    allowNoRealm: tk.allow_no_realm, vaultAccess: tk.vault_access === true, eventAccess: tk.event_access === true,
    isEnabled: tk.is_enabled !== false,
  });
}
