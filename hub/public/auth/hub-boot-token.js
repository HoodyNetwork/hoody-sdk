// public/auth/hub-boot-token.js — the /auth/home BOOT TOKEN producer.
//
// Mints (and reuses) a per-account DELEGATING auth token — full permissions +
// resources.create_tokens + resources.vault + vault_access:true, all realms — and
// hands it to the embedded agent STAGE as `?hdy_token=` (when the Hub shell mounts it).
// The launched hoody-agent adopts it as its control-plane credential AND uses it
// to mint the per-realm SUPERVISOR tokens that give API-level realm isolation.
//
// Invariants:
//   - REUSE, not re-mint: one boot token per account per browser, cached in
//     localStorage. Re-mint only within REMINT_SKEW of expiry. A rotation does NOT
//     delete the old token (avoids the "delete-before-the-agent-adopts"
//     wedge) — the old one expires on its own TTL; only an explicit
//     logout deletes.
//   - UNIQUE ALIAS PER MINT: the alias carries a random per-mint suffix, so a
//     re-mint NEVER collides with a server row this browser can't use (expired
//     rows are never purged and rotation keeps the old token — a deterministic
//     alias therefore eventually 400s FOREVER). The
//     'hoody-agent auto' prefix stays in lockstep with the Tokens drawer
//     classifier.
//   - RESULT OBJECT: ensure() resolves {token, state:'ok'|'degraded', message} and
//     rejects {token:'', state:'failed', message}. 'degraded' = a cached token is
//     being used but the server could not confirm it (the hub shows a notice over
//     the tokenized mount); 'failed' = no usable token (bare mount + notice).
//   - FENCES: all module state is keyed by userId. A per-tab generation counter
//     (bumped synchronously by revoke()/clear()) fences same-tab logout; a
//     localStorage EPOCH nonce (always WRITTEN, never removed, by revoke() and by
//     the sign-out purge in shared.js, which every sign-out path runs) fences other tabs — the mint publish step re-reads it synchronously, and
//     cached recs embed it so a rec written just before an invalidation is dead on
//     next read. No storage-event listeners (removal of an absent key fires no
//     event; delivery timing is unbounded — epoch reads are synchronous truth).
//   - The in-memory rec exists ONLY for broken-storage browsers (Safari private
//     mode, quota): it is written when the post-write read-back fails. A working
//     localStorage read returning "missing" is authoritative — memory never
//     resurrects a logged-out token.
//   - SHARED ACCESS: a token session never gets a boot token. ensure()
//     resolves {token:'', state:'skipped'} and revoke() resolves at once, both BEFORE any cache read or
//     request, so an owner's leftover cached rec is never served and never deleted from a shared page.
//     The page identity (Hub.session.page) decides; the stored session (storedSession) is consulted too,
//     and a check that throws counts as token.
//   - STAGE ONLY: the token is appended by the Hub shell at iframe.src, never inside
//     buildKitUrl (deep links / HubCache stay bare). It is NEVER written to
//     localStorage as part of a URL, only as the {token} field here.
//   - The token is a durable credential in a GET URL; exposure is bounded by the
//     iframe strict-origin referrer policy (no cross-origin Referer, not in
//     top-level history), the finite TTL, and server-side redaction.
window.HubBootToken = (function () {
  'use strict';

  var DEFAULT_TTL_DAYS = 90;                       // Settings-adjustable; the server re-clamps to its cap
  var REMINT_SKEW_MS = 14 * 24 * 60 * 60 * 1000;   // re-mint when < 14d of life remains (reuse on visit)
  // BOOT_PERMS_REV versions the permission tree bootPermsTree() mints. A cached rec
  // whose permsRev !== this is NOT reused (it was minted under an older policy —
  // auth_tokens.permissions is frozen server-side at mint, so editing
  // bootPermsTree() alone re-permissions NOBODY). Without this a policy change
  // reaches a browser only at logout or inside REMINT_SKEW of a 90d TTL: up to ~76
  // days. There is no server-side lever either — revoking the rows does NOT force a
  // re-mint, it silently breaks autologin (the stage mounts with a dead
  // ?hdy_token= while ensure() still reports state:'ok'). Mirrors the agent's
  // own supervisor-permissions revision counter.
  //
  // STRICT equality, deliberately NOT >=: on a rollback, >= would make older code
  // ACCEPT a newer rec — and a rollback usually means the newer rev OVER-granted,
  // which >= would then keep alive for ~76d. === re-mints once and fails closed.
  // The cost is bounded mixed-fleet churn during a deploy window; keep it short.
  //
  // rev 1 = the implicit unrevisioned tree (financial deleted entirely).
  // rev 2 = + financial.server_rental.view_marketplace.
  // rev 3 = + financial.wallet.read, financial.billing.read — the
  //         remaining READ-ONLY leaves the Console reads (Wallet panel, rental
  //         amounts). Every rev so far is purely ADDITIVE; see the B-fallback
  //         note in validateCached's caller before shipping a SUBTRACTIVE rev.
  //         rev 3 also gained containers.features.env_values through
  //         the full_access template, NOT by a bump: the migration backfilled the
  //         leaf into every existing boot token, so the rev-3 tree they hold already
  //         is the tree a fresh mint gets. A bump would re-mint every browser's boot
  //         token and its supervisor children for nothing.
  // rev 4 = the permission tree key `containers` became `computers`.
  //         SUBTRACTIVE for any reader of the old name: a token whose
  //         server-side tree was NOT rewritten has no `computers.*` leaf at all, and
  //         a missing leaf is a denial. The server migration rewrites every stored
  //         token in the same release, so a rev-3 record's bearer normally stays
  //         valid, but the browser cache revision and the bearer's server-side tree
  //         are separate facts: a record of any older rev is NEVER reused as-is.
  //         See vouchStale() / validateCached() and NEEDED_LEAVES.
  // BUMP ON EVERY CHANGE TO bootPermsTree().
  var BOOT_PERMS_REV = 4;
  // The computers.* leaves a stale-rev record's bearer must hold before the Hub reuses
  // it without a re-mint: the CRUD leaves and the lifecycle,
  // exec and logs actions every boot token has carried since the full_access template.
  // The feature leaves are left out on purpose: tokens predate some of them (kvm) and a
  // missing feature leaf disables one feature, not the Hub.
  var NEEDED_LEAVES = [
    'computers.read', 'computers.create', 'computers.update', 'computers.delete',
    'computers.actions.start', 'computers.actions.stop', 'computers.actions.restart',
    'computers.actions.exec', 'computers.actions.logs'
  ];
  var SIGN_IN_AGAIN = 'Sign in again.';
  // Alias MUST match the server's token-alias charset /^[a-zA-Z0-9 _-]*$/
  // (the server's alias rule) — parens/·/dots are REJECTED 400,
  // which would silently kill every boot-token mint. Keep it in
  // the charset AND keep the 'hoody-agent auto' prefix in lockstep with the Tokens
  // drawer matcher.
  var ALIAS_PREFIX = 'hoody-agent auto';
  var ALIAS_MAX = 254;                             // server cap
  var SUFFIX_LEN = 5;                              // per-mint random suffix

  // Per-user module state: a user-switch must never join another account's mint
  // or read its status.
  var inFlight = {};   // userId -> in-flight ensure() promise
  var gen = {};        // userId -> same-tab logical generation (logout fence)
  var memRec = {};     // userId -> rec, ONLY when localStorage write-verify failed
  // Rev-upgrade backpressure. ensure() runs per STAGE MOUNT (the Hub shell
  // mountStage — container switch, restart), NOT per page load, so an upgrade that
  // keeps failing must not be retried on every mount. Two distinct classes, because
  // they have opposite right answers:
  //
  //   revMintCancelled — the user CANCELLED the OTP modal (the Tokens drawer throws
  //     {cancelled:true} when promptOtp resolves empty). That is a decision, not an
  //     outage: re-prompting on every container switch is harassment. Latch it for
  //     the page and retry on the next load.
  //
  //   revMintBackoffUntil — anything else (500/503, network, template fetch). A
  //     blip must NOT strand the tab: /auth/home is an embedded TUI users leave
  //     open for days, so a page-permanent latch here would keep Console → Servers
  //     403ing — the failure this guards against — for the whole session. Bounded
  //     retry instead.
  //
  // Both are cleared by revoke()/clear(). Expiry-driven re-mints are unaffected —
  // the gate still requires liveEnough first.
  var revMintCancelled = {};    // userId -> true (page-scoped, OTP cancel only)
  var revMintBackoffUntil = {}; // userId -> epoch ms until which we won't re-attempt
  var REV_RETRY_MS = 10 * 60 * 1000;
  var PRIOR_ID_CAP = 8;   // superseded token ids carried for logout reaping

  // revLatched: should ensure() stop re-attempting the rev upgrade for now?
  function revLatched(userId) {
    if (revMintCancelled[userId]) return true;
    var until = revMintBackoffUntil[userId] || 0;
    return until > Date.now();
  }
  function clearRevLatch(userId) {
    delete revMintCancelled[userId];
    delete revMintBackoffUntil[userId];
  }
  // isOtpCancel: the Tokens drawer's OTP call rejects with a bare {cancelled:true}
  // when the user dismisses the modal. Everything else is an outage class.
  function isOtpCancel(err) {
    return !!(err && err.cancelled === true);
  }
  var templates = null;  // cached /auth/tokens/templates result

  // tokenApi is an OTP-aware apiCall for the token MINT: it prefers
  // window.Hub.tokenApiCall (the Tokens drawer's OTP call — prompts + retries on a
  // 2FA-gated account's OTP_REQUIRED) and falls back to a plain apiCall when
  // the Tokens drawer has not loaded. Housekeeping DELETEs use plain apiCall on purpose
  // (they run during logout and must never pop an OTP modal; DELETE carries no OTP
  // gate today).
  //
  // Where the page provides HubLoad, the mint waits for HubLoad.need('otp') instead, so a page
  // where hub-otp.js failed to load fetches it again or refuses rather than minting without
  // a 2FA prompt. A page without HubLoad keeps the path below unchanged.
  //
  // `owner` is the user the token is minted for (ensure's userId). It rides apiCall's opts.owner
  // on every attempt, the OTP retry included: a request is only sent with that user's session
  // bearer, so a token minted here belongs to that user by construction (the create response
  // names no user to check afterwards).
  //
  // mintFn (ensure's opts.mint, the new Hub's core): the caller's own OTP-aware mint, bound to the press that asked
  // for this ensure. It is used for this ensure's mint only and is never published; it wins over both paths below.
  function tokenApi(method, path, body, owner, mintFn) {
    var opts = { owner: owner === undefined || owner === null ? '' : String(owner) };
    if (typeof mintFn === 'function') return mintFn(method, path, body, opts);
    if (window.HubLoad && typeof window.HubLoad.need === 'function') {
      return window.HubLoad.need('otp').then(function (otp) { return otp.tokenApiCall(method, path, body, opts); });
    }
    var otpAware = window.Hub && window.Hub.tokenApiCall;
    return otpAware ? window.Hub.tokenApiCall(method, path, body, opts) : apiCall(method, path, body, undefined, undefined, opts);
  }

  // sessionIs: the stored session (access token's `id` claim) is userId's right now.
  function sessionIs(userId) {
    try { return sessionTokenUid(localStorage.getItem('access_token')) === String(userId); } catch (e) { return false; }
  }

  // tokenPage: this page, or the session storage now holds, is a shared-access (token) session.
  function tokenPage() {
    try {
      var S = window.Hub && window.Hub.session, page = S && S.page;
      if (page && page.kind === 'token') return true;
      if (typeof storedSession === 'function') { var st = storedSession(); if (st && st.kind === 'token') return true; }
      return false;
    } catch (e) { return true; }
  }

  function key(userId) { return 'hub_boot_token:' + userId; }
  function epochKey(userId) { return 'hub_boot_token_epoch:' + userId; }

  // readEpoch: current invalidation epoch for userId. '' = never invalidated
  // (absent key). null = storage unreadable (broken-storage browser) — callers
  // must then rely on the same-tab gen fence only.
  function readEpoch(userId) {
    try { return localStorage.getItem(epochKey(userId)) || ''; } catch (e) { return null; }
  }
  // bumpEpoch ALWAYS writes a fresh nonce (a WRITE, not a removal — a removal of
  // an already-absent key would be invisible to siblings, and this design never
  // waits on event delivery anyway: publish/read re-check synchronously).
  function bumpEpoch(userId) {
    try { localStorage.setItem(epochKey(userId), randSuffix(12)); } catch (e) {}
  }

  // randSuffix: n chars of [a-z0-9] (inside the server alias charset), via
  // crypto.getRandomValues with a Math.random fallback (also charset-safe).
  function randSuffix(n) {
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var out = '';
    var i;
    var c = (typeof crypto !== 'undefined') && crypto && crypto.getRandomValues;
    if (c) {
      var buf = new Uint8Array(n);
      crypto.getRandomValues(buf);
      for (i = 0; i < n; i++) out += chars.charAt(buf[i] % chars.length);
    } else {
      for (i = 0; i < n; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
  }

  // buildAlias: 'hoody-agent auto <host> <suffix>' with the HOST segment truncated
  // so the whole alias always fits the 254-char server cap (prefix + 2 joining
  // spaces + suffix are budgeted first).
  function buildAlias() {
    var host = String(location.hostname || 'hub').replace(/[^a-zA-Z0-9 _-]+/g, '-');
    var suffix = randSuffix(SUFFIX_LEN);
    var budget = ALIAS_MAX - (ALIAS_PREFIX.length + 2 + suffix.length);
    if (host.length > budget) host = host.slice(0, budget);
    return ALIAS_PREFIX + ' ' + host + ' ' + suffix;
  }

  // isAliasConflict: machine code first (server emits DUPLICATE_ALIAS in the
  // envelope `error` field → apiCall's err.code), human-message regex as a
  // fallback belt only.
  function isAliasConflict(err) {
    if (!err) return false;
    if (err.code === 'DUPLICATE_ALIAS') return true;
    return /already exists/i.test(String(err.message || ''));
  }

  // failure(): the normalized ensure() rejection shape.
  function failure(message) {
    return { token: '', state: 'failed', message: String(message || '') };
  }
  function failMessage(err) {
    return String((err && err.message) || '');
  }

  // rawRead: parse the localStorage rec WITHOUT epoch/liveness checks.
  // Returns {rec} on success (rec may be null), or {broken:true} when storage
  // itself is unreadable.
  function rawRead(userId) {
    var raw;
    try { raw = localStorage.getItem(key(userId)); } catch (e) { return { broken: true, rec: null }; }
    if (!raw) return { broken: false, rec: null };
    try {
      var v = JSON.parse(raw);
      if (!v || typeof v.token !== 'string' || !v.token) return { broken: false, rec: null };
      return { broken: false, rec: v };
    } catch (e) { return { broken: false, rec: null }; }
  }

  // readCache: the fence-aware read. A working storage miss is authoritative —
  // UNLESS memRec[userId] exists, which is itself the verified-write-failure
  // marker (Safari private mode: reads work, writes throw — the rec could never
  // land in storage, so a miss there is evidence of broken WRITES, not of
  // logout). Memory never resurrects a logged-out token: same-tab logout deletes
  // memRec, and cross-tab logout invalidates it through the epoch check below.
  // A rec whose embedded epoch differs from the current epoch was published
  // before an invalidation (logout) landed — treat as absent and best-effort
  // DELETE its token (the publish-before-invalidation orphan).
  function readCache(userId) {
    var r = rawRead(userId);
    var rec = r.broken ? (memRec[userId] || null) : (r.rec || memRec[userId] || null);
    // A USABLE in-memory rec OUTRANKS an unusable disk rec. On a broken-WRITE
    // browser (reads fine, setItem throws or silently drops — Safari private mode,
    // quota) the disk rec can NEVER be replaced, so preferring it when it is not
    // usable means ensure() re-mints on EVERY stage mount: an unbounded stream of
    // live 90d delegating tokens, none discarded — exactly the "unbounded
    // high-privilege token generator" the memRec confinement above exists to
    // prevent. The test is `usable` (liveEnough AND currentPerms), not currentPerms
    // alone: a disk rec that is current-rev but INSIDE the re-mint skew is equally
    // un-reusable and would loop the same way. memRec is populated ONLY on the
    // publish-failure path (it is deleted on a successful publish), so this can
    // only ever promote a rec THIS tab just minted.
    //
    // FENCING CAVEAT — do not read more into this than is true. The epoch check
    // below runs on whichever rec wins, so a cross-tab logout fences the promoted
    // rec ONLY IF the other tab's bumpEpoch actually landed. On this very browser
    // class it cannot: bumpEpoch writes through the same broken setItem, so the
    // epoch never changes and the check cannot fire. Same-tab logout is still
    // fenced (gen bump + `delete memRec`). The residual exposure is bounded by the
    // page lifetime and by the short TTL bootTtlDays() requests when storage is
    // unwritable. This hole is pre-existing (`r.rec || memRec` already served
    // memRec on a disk miss); what changed is how many browsers reach it.
    if (rec && !usable(rec) && usable(memRec[userId])) {
      rec = memRec[userId];
    }
    if (!rec) return null;
    var cur = readEpoch(userId);
    if (cur !== null && String(rec.epoch || '') !== cur) {
      // Discard BOTH candidates, not just the one that won the ranking above.
      // clearCacheKey + `delete memRec` erase the only local record of the loser,
      // so discarding only the winner strands the other as a live 90d delegating
      // token that no future revoke() can ever reach. Same class as the
      // multi-id delete in revoke().
      var loser = (rec === memRec[userId]) ? r.rec : memRec[userId];
      var ids = [];
      if (rec.tokenId) ids.push(rec.tokenId);
      if (loser && loser.tokenId && ids.indexOf(loser.tokenId) < 0) ids.push(loser.tokenId);
      clearCacheKey(userId);
      delete memRec[userId];
      ids.forEach(function (id) { discardToken(id, userId); });
      return null;
    }
    return rec;
  }

  function writeCacheVerified(userId, rec) {
    var ok = false;
    try {
      localStorage.setItem(key(userId), JSON.stringify(rec));
      var back = rawRead(userId);
      ok = !!(back.rec && back.rec.tokenId === rec.tokenId);
    } catch (e) { ok = false; }
    return ok;
  }
  function clearCacheKey(userId) {
    try { localStorage.removeItem(key(userId)); } catch (e) {}
  }

  // discardToken: best-effort server DELETE of a token this module owns but must
  // not keep (fence-superseded mint, stale-epoch rec). Plain apiCall — never an
  // OTP prompt; a 404 from a double-DELETE (revoke got there first) is swallowed
  // like every other failure (the row then dies on its TTL). Owner-bound like the mint: the
  // DELETE only goes out on userId's session bearer. When the session already belongs to someone
  // else nothing is sent and the token is left to its TTL (no bearer that could delete it remains:
  // a token cannot delete itself, and another user's session cannot either).
  function discardToken(tokenId, userId) {
    if (!tokenId) return Promise.resolve();
    return apiCall('DELETE', '/auth/tokens/' + encodeURIComponent(tokenId), undefined, undefined, undefined,
      { owner: userId === undefined || userId === null ? '' : String(userId) }).catch(function () {});
  }

  // liveEnough: a cached token with comfortably more than the re-mint skew left.
  function liveEnough(v) {
    if (!v || !v.expiresAt) return false;
    var exp = Date.parse(v.expiresAt);
    if (isNaN(exp)) return false;
    return (exp - Date.now()) > REMINT_SKEW_MS;
  }

  // currentPerms: the rec was minted by the CURRENT bootPermsTree(). A rec from an
  // older rev carries an older permission tree in server-side row state and must be
  // re-minted, not reused. An absent field = rev 1 (pre-fence) and is never current.
  function currentPerms(v) {
    return !!v && v.permsRev === BOOT_PERMS_REV;
  }

  // usable: this rec can be handed to the agent AS-IS — it is both alive enough to
  // reuse and minted under the current permission tree. Anything short of that
  // means ensure() would re-mint, which is what makes a shadowed candidate a LOOP
  // rather than a preference.
  function usable(v) {
    return liveEnough(v) && currentPerms(v);
  }
  // bootPermsTree returns the boot token's permission tree: the full_access
  // template (from the server — a template NAME alone forces create_tokens back to
  // false, so the boot token must carry an explicit `permissions` tree, mirroring
  // the Tokens drawer) with create_tokens + vault forced ON and the FINANCIAL category
  // reduced to a single READ-ONLY leaf.
  //
  // LEAST-PRIVILEGE: the boot token is
  // the ONE credential the threat model admits stays exposed (iframe src DOM attr,
  // container/proxy access logs). full_access carries financial.wallet.withdraw/
  // transfer, billing.manage_payment_methods, server_rental.rent/terminate — so an
  // exposed full_access boot token could DRAIN THE WALLET or TERMINATE SERVERS. The
  // agent's mission (containers/realms/tokens/vault) needs no account financial
  // power. All of that stays stripped.
  //
  // READ-ONLY leaves are not money power and stay granted: without
  // financial.server_rental.view_marketplace (READ-ONLY catalogue data) the agent's
  // Console → Servers panel fails with "hoody.servers_browse: This token does not
  // have permission to view the server rental marketplace" (GET
  // /api/v1/servers/available), and without the wallet read
  // the Console → Wallet panel fails with "hoody.wallet_balances: This token does
  // not have permission to view wallet balances". The rule, stated once: the boot token
  // carries EVERY READ-ONLY financial leaf the agent's Console reads, and NO
  // leaf that moves money or provisions. Derived from the agent's own Console
  // dispatch table, where its read handlers and its mutating handlers draw
  // exactly that line:
  //
  //   consoleRead  wallet_balances      -> financial.wallet.read        GRANTED
  //   consoleRead  wallet_transactions  -> financial.billing.read       GRANTED
  //   consoleRead  servers_browse       -> ...server_rental.view_marketplace GRANTED
  //   consoleRead  rentals_list/get     -> (ungated; amounts redacted unless
  //                                        financial.billing.read — the API's
  //                                        rental-amounts rule)         GRANTED via billing.read
  //   consoleMutate wallet_transfer_to_ai -> financial.wallet.transfer   DENIED
  //   consoleMutate wallet_create_checkout                               DENIED
  //   consoleMutate server_rent          -> ...server_rental.rent_servers DENIED
  //   consoleMutate rental_extend        -> ...server_rental.extend_rentals DENIED
  //
  // Known widening: financial.billing.read is a SHARED leaf — besides wallet
  // transactions and rental amounts it also unlocks GET invoices (list + detail,
  // two routes), which the Console has no panel for. The API
  // offers no narrower leaf (it deliberately reuses billing.read for "the same
  // class of financial data"), so the choice is
  // read-only invoice exposure or a permanently broken Wallet panel. Exposure is
  // read-only and account-scoped; withdraw/transfer/manage_payment_methods/
  // download_invoices all remain denied, so an exposed boot token can still READ
  // financial history but can NEVER move money, add a payment method, rent, or
  // terminate. (admin.* is already all-false in full_access.)
  //
  // Delegated children are clamped ⊆ this tree, so the general bound is: any child
  // of the boot token gains AT MOST view_marketplace beyond the old behaviour, and
  // no money leaf is reachable through any path because this tree contains none.
  function bootPermsTree() {
    return loadTemplates().then(function (map) {
      var base = map && map.full_access;
      if (!base) throw new Error('boot token: full_access template unavailable');
      var perms = JSON.parse(JSON.stringify(base));
      // ALLOWLIST, not a denylist (was: `delete perms.financial`). Read-only
      // leaves the Console's consoleRead verbs need — see the table above.
      // Everything else financial stays OUT: wallet.transfer, wallet.withdraw,
      // billing.manage_payment_methods, billing.download_invoices, rent_servers,
      // extend_rentals, terminate_rentals — the money power this token must
      // never carry.
      //
      // Built LITERALLY rather than by deleting known-bad leaves off the
      // template: `base` is fetched at RUNTIME from GET /auth/tokens/templates,
      // so a future financial.* leaf added to full_access server-side would
      // otherwise reach this URL-borne token with no client change. NOTE this
      // fails closed for financial.* ONLY — a future NON-financial leaf added to
      // full_access still flows through the clone above.
      //
      // BUMP BOOT_PERMS_REV on ANY change to this tree.
      perms.financial = {
        wallet: { read: true },
        billing: { read: true },
        server_rental: { view_marketplace: true }
      };
      perms.resources = perms.resources || {};
      perms.resources.create_tokens = true; // delegation — mint per-realm children
      perms.resources.vault = true;         // vault dual-gate (with vault_access below)
      return perms;
    });
  }

  function loadTemplates() {
    if (templates) return Promise.resolve(templates);
    return apiCall('GET', '/auth/tokens/templates').then(function (resp) {
      var arr = (resp && resp.data) || resp || [];
      var map = {};
      for (var i = 0; i < arr.length; i++) { if (arr[i] && arr[i].name) map[arr[i].name] = arr[i].permissions; }
      templates = map;
      return map;
    });
  }

  // storageWritable: can we actually persist a rec right now? A canary write +
  // read-back, because the two broken-write classes differ (Safari private mode
  // THROWS; quota can silently DROP) and only a read-back catches the second.
  function storageWritable() {
    var k = 'hub_boot_token_probe';
    try {
      localStorage.setItem(k, '1');
      var ok = localStorage.getItem(k) === '1';
      localStorage.removeItem(k);
      return ok;
    } catch (e) { return false; }
  }

  function bootTtlDays() {
    // BOUND THE UNFENCEABLE CASE. When writes fail we cannot persist the rec, so
    // the token lives only in memRec — and on that same browser bumpEpoch cannot
    // land either, which means a CROSS-TAB logout cannot fence it (see readCache).
    // Minting a 90-day delegating credential we know we cannot revoke through the
    // normal path is the wrong trade; ask for one day instead. Refusing to serve
    // memRec at all is NOT the alternative — that reinstates the mint-per-mount
    // storm memRec exists to prevent.
    if (!storageWritable()) return 1;
    var d = DEFAULT_TTL_DAYS;
    try {
      var raw = localStorage.getItem('hub_boot_token_ttl_days');
      if (raw) { var n = parseInt(raw, 10); if (!isNaN(n) && n >= 1) d = n; }
    } catch (e) {}
    return d;
  }

  function mintOnce(expiresAt, userId, mintFn) {
    return bootPermsTree().then(function (perms) {
      var body = {
        alias: buildAlias(),
        permissions: perms,
        vault_access: true,
        event_access: true,
        allow_no_realm: true,   // all-realms boot token (realm_ids omitted / empty)
        expires_at: expiresAt
      };
      // tokenApi mints on the session bearer, prompting + retrying for OTP on a
      // 2FA-gated account (via the Tokens drawer's OTP call). If the user cancels
      // the OTP prompt (or the Tokens drawer isn't loaded), the mint rejects and the
      // stage mounts bare with the notice — the agent then uses its
      // previously-adopted login.
      return tokenApi('POST', '/auth/tokens', body, userId, mintFn);
    });
  }

  // mint: one logical mint attempt with the fences below.
  //   - On an alias conflict: FIRST re-read the cache (the dominant real conflict
  //     is another tab winning the race — adopt its rec instead of minting a
  //     second orphan), then retry ONCE with a fresh suffix. A second conflict is
  //     a hard failure. (With random suffixes a genuine conflict is ~never; the
  //     retry re-prompts OTP on 2FA accounts, which is accepted.)
  //   - The publish step is ONE synchronous block: same-tab gen + cross-tab epoch
  //     re-checked; a superseded mint DELETEs its fresh token and rejects instead
  //     of publishing (the mint protocol).
  function mint(userId, mintFn) {
    var g0 = gen[userId] || 0;
    var e0 = readEpoch(userId);
    var expiresAt = new Date(Date.now() + bootTtlDays() * 24 * 60 * 60 * 1000).toISOString();
    return mintOnce(expiresAt, userId, mintFn).catch(function (err) {
      if (!isAliasConflict(err)) throw err;
      // Same-tab logout fence applies to the ADOPT path too:
      // readCache epoch-fences other tabs, but a same-tab revoke() bumps only gen.
      if ((gen[userId] || 0) !== g0) throw new Error('boot token: superseded by logout');
      var winner = readCache(userId);
      // currentPerms too: adopting another tab's STALE-REV rec would silently
      // re-institute the old permission tree and defeat the whole fence.
      if (liveEnough(winner) && currentPerms(winner)) return { adopt: winner };
      return mintOnce(expiresAt, userId, mintFn);
    }).then(function (resp) {
      if (resp && resp.adopt) return resp.adopt;
      var d = (resp && resp.data) || resp || {};
      if (!d.token || !d.id) throw new Error('boot token: mint returned no token');
      // Trust the SERVER's expiry, never the client-computed one: the server
      // clamps the token to its own cap, so a client-optimistic 90d could exceed
      // the token's real death and make liveEnough reuse a token the agent then
      // finds dead (→ bare mount). If the server omits expires_at (it shouldn't),
      // cache a CONSERVATIVE value that is still comfortably ABOVE REMINT_SKEW
      // (14d) — else liveEnough is never satisfied and EVERY genuine remount
      // re-mints + orphans the prior token. 21d re-syncs within a
      // week of the real (unknown) expiry without churning.
      var conservative = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();
      // PRIOR IDS. A rotation deliberately does NOT delete the token
      // it supersedes — the agent may still be running on it, and deleting it here
      // is the "delete-before-the-agent-adopts" wedge this module was built to
      // avoid. But publishing the new rec OVERWRITES the only local record of the
      // old id, so the header's promise that "only an explicit logout deletes" was
      // false: logout could only ever reach the NEWEST token and the displaced one
      // stayed live to its ≤90d TTL. Harmless when rotation was rare (near expiry);
      // the perms-rev upgrade makes it happen to EVERY user at once, so carry the
      // displaced ids forward and let revoke() reap them all at logout.
      // Capped: this list only has to survive until the next logout, and an
      // unbounded array in localStorage is its own quota hazard.
      var priorRead = rawRead(userId);
      var prevRec = priorRead.rec || memRec[userId] || null;
      var priorIds = [];
      if (prevRec) {
        if (prevRec.tokenId && prevRec.tokenId !== d.id) priorIds.push(prevRec.tokenId);
        if (Object.prototype.toString.call(prevRec.priorIds) === '[object Array]') {
          for (var pi = 0; pi < prevRec.priorIds.length; pi++) {
            var oldId = prevRec.priorIds[pi];
            if (typeof oldId === 'string' && oldId && oldId !== d.id && priorIds.indexOf(oldId) < 0) priorIds.push(oldId);
          }
        }
      }
      if (priorIds.length > PRIOR_ID_CAP) priorIds = priorIds.slice(0, PRIOR_ID_CAP);
      var rec = { token: d.token, tokenId: d.id, permsRev: BOOT_PERMS_REV, priorIds: priorIds, expiresAt: (typeof d.expires_at === 'string' && d.expires_at) || conservative };
      // ── synchronous publish block (do not insert awaits here) ──
      // Owner check before caching under hub_boot_token:<userId>: the mint was sent on userId's
      // bearer (tokenApi's owner), and the stored session must still be userId's now. Another
      // tab may have signed in as someone else while the mint (or its 2FA prompt) was out; the
      // token is then not cached or returned (superseded).
      if (!sessionIs(userId)) {
        discardToken(rec.tokenId, userId);
        throw supersededAuthError();
      }
      var gNow = gen[userId] || 0;
      var eNow = readEpoch(userId);
      if (gNow !== g0 || (e0 !== null && eNow !== null && eNow !== e0)) {
        discardToken(rec.tokenId, userId);
        throw new Error('boot token: superseded by logout');
      }
      rec.epoch = (eNow !== null ? eNow : (e0 !== null ? e0 : ''));
      var published = writeCacheVerified(userId, rec);
      if (published) {
        delete memRec[userId];
      } else {
        // Broken storage: hold the rec for this page's lifetime so a
        // storage-broken browser mints AT MOST ONCE per page load instead of
        // becoming an unbounded high-privilege token generator.
        memRec[userId] = rec;
      }
      // POST-publish re-verification: localStorage is shared
      // across PROCESSES, so another tab's logout epoch-write can land between
      // the pre-check above and the setItem — the rec would sit dead-on-read
      // (embedded stale epoch) but THIS tab would still hand the live token to
      // its iframe. Re-read the fences after publishing and undo if superseded.
      var gAfter = gen[userId] || 0;
      var eAfter = readEpoch(userId);
      if (gAfter !== gNow || (eAfter !== null && eNow !== null && eAfter !== eNow)) {
        if (published) clearCacheKey(userId);
        delete memRec[userId];
        discardToken(rec.tokenId, userId);
        throw new Error('boot token: superseded by logout');
      }
      // ── end synchronous publish block ──
      return rec;
    });
  }

  // leafOn: path ('computers.read') is exactly `true` in a permission tree (a missing branch is a denial).
  function leafOn(perms, path) {
    var node = perms, parts = path.split('.');
    for (var i = 0; i < parts.length; i++) {
      if (!node || typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, parts[i])) return false;
      node = node[parts[i]];
    }
    return node === true;
  }
  function hasNeededLeaves(perms) {
    for (var i = 0; i < NEEDED_LEAVES.length; i++) if (!leafOn(perms, NEEDED_LEAVES[i])) return false;
    return true;
  }

  // signOutStale: a record of an older rev whose bearer's CURRENT tree lacks the computers.* leaves the Hub
  // needs. Nothing it holds can be reused and a re-mint is not available, so the Hub signs the user out
  // with the plain "sign in again" message instead of mounting a token that would answer 403 on every call:
  // the boot token is revoked with the session (endOutgoingSession), the local purge follows, and the
  // rejection says why. `signedOut: true` lets a caller tell this from an outage. Never throws.
  function signOutStale(userId) {
    var done = Promise.resolve();
    try {
      var out = (typeof outgoingSession === 'function') ? outgoingSession(String(userId)) : null;
      if (out) {
        done = Promise.resolve(endOutgoingSession(out, 2000)).then(function () {
          return purgeOutgoingSession(out, { reason: 'signout' });
        }).then(null, function () {});
      }
    } catch (e) {}
    clearUserState(userId);
    return done.then(function () {
      var f = failure(SIGN_IN_AGAIN);
      f.signedOut = true;
      throw f;
    });
  }

  // validateCached — plan B: the mint failed (or, for a stale rev, was never attempted again) but a cached rec
  // is still inside its lifetime. Prove the ACTUAL secret against the server by introspecting with
  // the cached token itself as the bearer: GET /auth/tokens/me enforces hash
  // match, is_enabled, server-clock expiry, IP allowlist and lineage, so a 401/403
  // means the credential is dead (clear it); the id lives at data.token.id — NOT
  // data.id as on mint. 429/5xx/network prove nothing → use the
  // token best-effort and let the hub show the 'degraded' notice.
  //
  // A rec of an OLDER rev is never reused as-is, on this path or on the
  // latch path of ensure(): the same response carries the token's CURRENT permission tree
  // (data.token.permissions) and the rec is reused only when that tree holds NEEDED_LEAVES; a tree without
  // them signs the user out (signOutStale); a check that proves nothing (429/5xx/network) reuses nothing,
  // not even as 'degraded' (the rec stays for the next attempt). A bearer whose permissions the server
  // migration rewrote passes: nothing about the cache revision invalidates it.
  function validateCached(userId, rec, mintErr) {
    var stale = !currentPerms(rec);
    var g0 = gen[userId] || 0;
    return apiCall('GET', '/auth/tokens/me', null, rec.token).then(function (resp) {
      if ((gen[userId] || 0) !== g0) throw failure('boot token: superseded by logout');
      var tok = resp && resp.data && resp.data.token;
      var id = tok && tok.id;
      if (id && rec.tokenId && id === rec.tokenId) {
        if (stale && !hasNeededLeaves(tok.permissions)) return signOutStale(userId);
        // NOTE (perms-rev): a stale-rev rec that the server VOUCHES for (id match AND the needed leaves)
        // still reports 'ok', deliberately. 'degraded' is defined by this module as "a cached token is
        // being used but the server could not confirm it" (see the header) — and here the server just did
        // confirm it. Overloading the state would fire a user-facing notice about a transient,
        // self-healing, un-actionable condition.
        return { token: rec.token, state: 'ok', message: '' };
      }
      clearUserState(userId);
      throw failure(failMessage(mintErr) || 'boot token: cached token mismatch');
    }, function (err) {
      var s = err && err.status;
      if (s === 401 || s === 403) {
        clearUserState(userId);
        throw failure(failMessage(mintErr) || 'boot token: cached token rejected');
      }
      if (stale) throw failure(failMessage(mintErr) || failMessage(err) || 'boot token: could not check the cached token');
      return { token: rec.token, state: 'degraded', message: failMessage(mintErr) };
    });
  }

  // clearUserState: local-only cleanup (no server DELETE, no epoch bump — this is
  // "the cached rec is dead", not "invalidate other tabs").
  function clearUserState(userId) {
    delete memRec[userId];
    clearCacheKey(userId);
  }

  // ensure returns a promise for the RESULT OBJECT {token, state, message}:
  //   resolves {token, state:'ok'|'degraded', message} — 'ok' also covers a
  //     validated cached fallback; 'degraded' = cached token used unverified;
  //   rejects  {token:'', state:'failed', message} — no usable token; the caller
  //     mounts bare and shows the notice;
  //   resolves {token:'', state:'skipped', message:''} first for a token session (bare mount).
  // Concurrency-safe per user via inFlight[userId]. ensureOpts.mint (optional): see tokenApi; a call that rides a mint
  // already in flight does not bring its own.
  function ensure(userId, ensureOpts) {
    var mintFn = ensureOpts && typeof ensureOpts.mint === 'function' ? ensureOpts.mint : null;
    if (tokenPage()) return Promise.resolve({ token: '', state: 'skipped', message: '' });
    if (!userId) return Promise.reject(failure('boot token: no user id'));
    var cached = readCache(userId);
    // A fully usable rec short-circuits unconditionally.
    if (usable(cached)) {
      return Promise.resolve({ token: cached.token, state: 'ok', message: '' });
    }
    // ORDER IS LOAD-BEARING: ride any in-flight work BEFORE consulting the latch.
    // The latch is armed at mint-rejection time, but the B-fallback's
    // /auth/tokens/me validation is still outstanding at that moment — and it may
    // yet prove the cached token DEAD (401 → clearUserState). A latch short-circuit
    // placed above this line would hand that same token to a second stage mount as
    // state:'ok' while the first call was in the act of disproving it.
    if (inFlight[userId]) return inFlight[userId];
    // Latched: a live-but-stale-rev token is served rather than re-attempting an
    // upgrade we already know is failing (OTP cancelled, or inside the backoff).
    // The latched rec is of an older rev (a current one returned above), so it is NOT served as-is:
    // validateCached reads the bearer's current tree first and reuses the rec only with the needed computers.*
    // leaves, else the Hub signs out. The check rides inFlight like a mint, so a second mount joins it.
    if (liveEnough(cached) && revLatched(userId)) {
      var v = validateCached(userId, cached, null).then(function (res) {
        delete inFlight[userId];
        return res;
      }, function (err) {
        delete inFlight[userId];
        throw (err && err.state === 'failed') ? err : failure(failMessage(err));
      });
      inFlight[userId] = v;
      return v;
    }
    // Was this mint triggered ONLY by a stale rev (the token itself is still live)?
    // If so a failure is recoverable by reusing it — apply backpressure, don't loop.
    var revUpgradeOnly = liveEnough(cached) && !currentPerms(cached);
    // Same-tab logout fence, captured with revUpgradeOnly: revoke() clears the
    // latch synchronously, and without this the mint IT superseded would re-arm the
    // latch afterwards from its rejection handler — outliving the logout.
    var g0 = gen[userId] || 0;
    var p = mint(userId, mintFn).then(function (rec) {
      clearRevLatch(userId);
      return { token: rec.token, state: 'ok', message: '' };
    }, function (err) {
      if (revUpgradeOnly && (gen[userId] || 0) === g0) {
        if (isOtpCancel(err)) revMintCancelled[userId] = true;
        else revMintBackoffUntil[userId] = Date.now() + REV_RETRY_MS;
      }
      try { console.warn('[hub] boot token mint failed:', err); } catch (e2) {}
      // B-fallback: ANY cached rec beats a bare mount if the SERVER vouches for
      // it — /auth/tokens/me with the cached bearer is the liveness authority
      // (hash/enabled/server-clock expiry/IP/lineage). No client-clock pre-gate:
      // a skewed-clock "expired" or missing-expiry rec can still be server-valid,
      // and a truly dead one costs a single 401 that clears the cache.
      // NOTE (perms-rev): revs 1-3 were purely ADDITIVE, so this fallback served any stale rec the
      // server vouched for. Rev 4 is SUBTRACTIVE (the `containers` key became `computers`), so
      // validateCached now gates this site: a stale-rev rec is reused only when the bearer's current
      // permission tree holds NEEDED_LEAVES, a tree without them signs the user out, and an unprovable
      // check reuses nothing.
      // A superseded mint (the session is no longer userId's) gets no fallback: the cached token
      // is userId's, and the page now belongs to someone else.
      if (err && err.superseded) throw failure(failMessage(err));
      var rec = readCache(userId);
      if (rec && rec.token) return validateCached(userId, rec, err);
      throw (err && err.state === 'failed') ? err : failure(failMessage(err));
    }).then(function (res) {
      delete inFlight[userId];
      return res;
    }, function (err) {
      delete inFlight[userId];
      throw (err && err.state === 'failed') ? err : failure(failMessage(err));
    });
    inFlight[userId] = p;
    return p;
  }

  // revoke server-side DELETEs the cached boot token then clears the cache. Called
  // on logout (this-device AND sign-out-everywhere) BEFORE the session bearer is
  // dropped — a token DELETE needs the bearer. Best-effort: a failed revoke still
  // clears the local cache (the token expires on its TTL). Returns a promise.
  // Fencing: the gen bump is SYNCHRONOUS at entry (same-tab in-flight
  // mints), and the epoch bump is an unconditional WRITE (other tabs' in-flight
  // mints see it at their publish step; recs already written embed the old epoch
  // and die on next read). On broken-storage browsers the in-mem rec supplies the
  // tokenId for the server DELETE — else logout would orphan it to TTL.
  function revoke(userId) {
    if (tokenPage()) return Promise.resolve();
    gen[userId] = (gen[userId] || 0) + 1;
    var r = rawRead(userId);
    var diskRec = r.rec || null;
    var mem = memRec[userId] || null;
    delete memRec[userId];
    clearRevLatch(userId);
    // Free the rec key BEFORE writing the epoch nonce: on a quota-full browser the
    // epoch write is the one most likely to fail, and it is the cross-tab logout
    // fence. Removing the (larger) rec first gives it room to land. The gen bump
    // above already fenced this tab synchronously, so the reordering cannot open a
    // same-tab window.
    clearCacheKey(userId);
    bumpEpoch(userId);
    // DELETE EVERY id we own, not just the preferred one. On a broken-WRITE browser
    // the disk rec and the in-memory rec can hold DIFFERENT live tokens (the disk
    // one un-replaceable, the memory one freshly minted — see readCache). Revoking
    // only the preferred rec would leave the other a LIVE 90d delegating credential
    // surviving logout. Order is irrelevant; both are best-effort.
    var ids = [];
    function addId(v) { if (typeof v === 'string' && v && ids.indexOf(v) < 0) ids.push(v); }
    function addRec(v) {
      if (!v) return;
      addId(v.tokenId);
      // priorIds: tokens this browser superseded by rotation. Rotation must not
      // delete them (the agent may still hold one), but logout must — otherwise a
      // perms-rev upgrade leaves every user a live 90d delegating credential that
      // outlives their sign-out.
      if (Object.prototype.toString.call(v.priorIds) === '[object Array]') {
        for (var i = 0; i < v.priorIds.length; i++) addId(v.priorIds[i]);
      }
    }
    addRec(diskRec);
    addRec(mem);
    if (!ids.length) return Promise.resolve();
    return Promise.all(ids.map(function (id) { return discardToken(id, userId); })).then(function () {});
  }

  // clear drops this page's state WITHOUT a server revoke (used inside the broad
  // clearHubLocalState sweep, which runs after revoke() already ran): the same-tab
  // gen fence, the in-memory rec, the rev latch and the rec key. It does NOT write
  // the epoch: the cross-tab fence belongs to the sign-out purge in shared.js
  // (purgeAuthStorage), which every sign-out path runs and which advances
  // hub_boot_token_epoch:<uid> whether or not this module is loaded or a rec exists.
  function clear(userId) {
    gen[userId] = (gen[userId] || 0) + 1;
    delete memRec[userId];
    clearRevLatch(userId);
    clearCacheKey(userId);
  }

  return { ensure: ensure, revoke: revoke, clear: clear };
})();
