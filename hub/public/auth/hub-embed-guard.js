// hub-embed-guard.js: the value, destination and secret checks every embedded program URL and
// stored option passes. Pure functions: every caller
// uses these, so no two callers can disagree.
//
//   checkValue(def, value)
//       null when the SDK builder (lib/embeds/runtime.ts checkScalar / queryValues /
//       encodePathValue) would accept `value` for catalogue definition `def`, else its error code
//       (VALUE_INVALID, PATH_INVALID, PARAM_UNKNOWN). Hand types add bounds; never fewer checks.
//   expectedHost(cat, kit, computer, index, domain)
//       The one host the selected program may live on, from the catalogue host template
//       (`{projectId}-{computerId}-{segment}.{serverName}.{computersDomain}`; the older `{containerId}` and
//       `{containersDomain}` tokens are filled too) and the kit's service
//       segment (`terminal-{index}`). A terminal segment that would pass 63
//       characters is the short alias `t-{index}`. Every input is checked label by label first (lowercase
//       letters, digits and inner hyphens; at most 63 characters; the index within the service's
//       bounds), so nothing can smuggle a dot or another label in. '' when any input fails.
//   boundUrl(url, host)
//       true only for `https://<host>/…` exactly: parsed with URL, no user info, no port (the parsed
//       port is '' and host === hostname, whatever spelling URL normalized: spaces, tabs, missing or
//       backslash slashes, case), no default port written out either (':443', ':0443' or a bare ':'
//       after the host, which URL hides; checked on the input as URL sees it), the
//       hostname equal to `host` (so `<host>.evil.test`, `evil.test/?x=.<host>.`, a trailing dot and
//       an IDN lookalike, which URL turns into `xn--…`, all fail).
//   httpsUrl(url)
//       an https URL with no user info: the rule for "A link…" and stored panel URLs.
//   secretIn(value)
//       true when a value, at any depth, holds a boot token (`hdy_` + 8 or more token characters)
//       or names a handshake param (hdy_token, parent_keys, parent_origin), case-insensitively, in
//       a string as written or after percent-decoding (repeatedly; a string still decoding after
//       DECODE_ROUNDS rounds counts as secret), in an object key or value, or in an array member.
//       Undecidable input (deeper than MAX_DEPTH) counts as secret: the callers refuse rather than
//       store, copy or mount it. The match is deliberately broad (a title that merely says
//       "parent_keys" is refused too).
(function () {
  'use strict';

  var SECRET_NAMES = ['hdy_token', 'parent_keys', 'parent_origin'];
  var TOKEN_RE = /hdy_[a-z0-9_-]{8,}/i;
  var LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  var MAX_LABEL = 63;
  var DECODE_ROUNDS = 4;
  var MAX_DEPTH = 8;

  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function labelsOk(s) {
    if (typeof s !== 'string' || !s || s.length > 253) return false;
    var parts = s.split('.');
    for (var i = 0; i < parts.length; i++) if (!LABEL_RE.test(parts[i])) return false;
    return true;
  }

  function expectedHost(cat, kit, computer, index, domain) {
    var svc = cat && cat.services && own(cat.services, kit) ? cat.services[kit] : null;
    var tpl = cat && cat.host && cat.host.template;
    if (!svc || typeof svc.segment !== 'string' || typeof tpl !== 'string' || !computer) return '';
    var b = svc.index || {};
    if (typeof index !== 'number' || Math.floor(index) !== index || index < (b.min || 1) || (typeof b.max === 'number' && index > b.max)) return '';
    // Host names are case-insensitive and URL lowercases them; the inputs are compared lowercased.
    var pid = String(computer.project_id || '').toLowerCase(), cid = String(computer.id || '').toLowerCase();
    var srv = String(computer.server_name || '').toLowerCase(), dom = String(domain || '').toLowerCase();
    if (!labelsOk(pid) || pid.indexOf('.') !== -1 || !labelsOk(cid) || cid.indexOf('.') !== -1) return '';
    if (!labelsOk(srv) || srv.indexOf('.') !== -1 || !labelsOk(dom) || dom.indexOf('.') === -1) return '';
    var segment = svc.segment.replace('{index}', String(index));
    // A host label holds 63 characters: a terminal whose `terminal-<n>` label would not fit lives on the proxy's short
    // alias `t-<n>` (same kit, same index), as Hub.buildPortUrl and the SDK's terminalHostLabel name it.
    if (/^terminal-/.test(segment) && (pid + '-' + cid + '-' + segment).length > MAX_LABEL) segment = 't' + segment.slice('terminal'.length);
    // The template may name the id and the domain by the new tokens ({computerId}, {computersDomain}) or the
    // old ones ({containerId}, {containersDomain}); both fill the same value. Either way the result must still be
    // exactly one https host (checked below), so a mixed or unknown token leaves a `{` and fails.
    var url = tpl.replace('{projectId}', pid).replace('{computerId}', cid).replace('{containerId}', cid).replace('{segment}', segment)
      .replace('{serverName}', srv).replace('{computersDomain}', dom).replace('{containersDomain}', dom);
    var m = /^https:\/\/([^/?#:@]+)$/.exec(url);
    if (!m || !labelsOk(m[1])) return ''; // also refuses a first label over 63 characters
    return m[1];
  }

  function parse(url) {
    if (typeof url !== 'string') return null;
    try { return new URL(url); } catch (e) { return null; }
  }

  // The input as URL reads it: tab/newline removed anywhere, C0 controls and spaces trimmed.
  function asParsed(s) {
    return s.replace(/[\t\n\r]/g, '').replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '');
  }
  var DEFAULT_PORT_RE = /^https:[\/\\]*[^\/\\?#]*:(?:0*443)?(?:[\/\\?#]|$)/i;

  function boundUrl(url, host) {
    var u = parse(url);
    if (!u || !host) return false;
    if (u.protocol !== 'https:' || u.username || u.password) return false;
    if (u.port !== '' || u.host !== u.hostname) return false;
    if (DEFAULT_PORT_RE.test(asParsed(url))) return false; // a written default port (URL hides it)
    return u.hostname === host;
  }

  function httpsUrl(url) {
    var u = parse(url);
    return !!u && u.protocol === 'https:' && !u.username && !u.password && !!u.hostname;
  }

  function hit(s) {
    var low = s.toLowerCase();
    if (TOKEN_RE.test(low)) return true;
    for (var i = 0; i < SECRET_NAMES.length; i++) if (low.indexOf(SECRET_NAMES[i]) !== -1) return true;
    return false;
  }

  // One round of percent-decoding, ASCII escapes only (every secret name and the token shape are
  // ASCII, and this never throws on a malformed or non-UTF-8 escape).
  function decodeAscii(s) {
    return s.replace(/%([0-7][0-9a-f])/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
  }

  function textSecret(s) {
    var cur = s;
    for (var round = 0; round <= DECODE_ROUNDS; round++) {
      if (hit(cur)) return true;
      var next = decodeAscii(cur);
      if (next === cur) return false;
      cur = next;
    }
    return true; // still decoding after DECODE_ROUNDS rounds: undecidable, so refused
  }

  function secretIn(v, depth) {
    depth = depth || 0;
    if (depth > MAX_DEPTH) return true;
    if (typeof v === 'string') return textSecret(v);
    if (v === null || typeof v !== 'object') return false;
    if (Array.isArray(v)) {
      for (var i = 0; i < v.length; i++) if (secretIn(v[i], depth + 1)) return true;
      return false;
    }
    for (var k in v) {
      if (!own(v, k)) continue;
      if (textSecret(k) || secretIn(v[k], depth + 1)) return true;
    }
    return false;
  }

  // ── Values: the SDK's own checks (lib/embeds/runtime.ts checkScalar / queryValues /
  // encodePathValue), plus the hand types' bounds. A value passes here only if the SDK builder
  // would accept it; the Hub may refuse more, never less.
  function plainObject(v) {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
    if (Object.prototype.toString.call(v) !== '[object Object]') return false;
    var proto = Object.getPrototypeOf(v);
    // A plain object of any realm: its prototype is that realm's Object.prototype.
    return proto !== null && Object.getPrototypeOf(proto) === null;
  }

  function loneSurrogate(s) {
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0xd800 || c > 0xdfff) continue;
      if (c > 0xdbff) return true;
      var n = s.charCodeAt(i + 1);
      if (!(n >= 0xdc00 && n <= 0xdfff)) return true;
      i++;
    }
    return false;
  }

  function matches(re, s) {
    try { return new RegExp(re).test(s); } catch (e) { return false; }
  }

  function checkScalar(def, v) {
    if (def.serialize === 'json') return plainObject(v) ? null : 'VALUE_INVALID';
    var s;
    if (def.type === 'integer') { if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v) return 'VALUE_INVALID'; s = String(v); }
    else if (def.type === 'number') { if (typeof v !== 'number' || !isFinite(v)) return 'VALUE_INVALID'; s = String(v); }
    else if (def.type === 'boolean') { if (typeof v !== 'boolean') return 'VALUE_INVALID'; s = v ? 'true' : 'false'; }
    else { if (typeof v !== 'string') return 'VALUE_INVALID'; s = v; }
    if (typeof v === 'number') {
      if (typeof def.min === 'number' && v < def.min) return 'VALUE_INVALID';
      if (typeof def.max === 'number' && v > def.max) return 'VALUE_INVALID';
    }
    if (s.indexOf('\u0000') !== -1 || loneSurrogate(s)) return 'VALUE_INVALID';
    if (Array.isArray(def['enum']) && def['enum'].indexOf(v) === -1) return 'VALUE_INVALID';
    if (typeof def.maxLength === 'number' && s.length > def.maxLength) return 'VALUE_INVALID';
    if (typeof def.pattern === 'string' && !matches(def.pattern, s)) return 'VALUE_INVALID';
    if (typeof def.wirePattern === 'string' && !matches(def.wirePattern, s)) return 'VALUE_INVALID';
    if (def.format === 'uri') { try { new URL(s); } catch (e) { return 'VALUE_INVALID'; } }
    return null;
  }

  function checkPath(def, v) {
    if (typeof v !== 'string' || v === '') return 'PATH_INVALID';
    if (v.indexOf('\u0000') !== -1 || loneSurrogate(v)) return 'PATH_INVALID';
    if (typeof def.maxLength === 'number' && v.length > def.maxLength) return 'PATH_INVALID';
    var res = [def.pattern, def.wirePattern], i;
    if (def.encoder === 'path-segments') {
      if (v.charAt(0) !== '/') return 'PATH_INVALID';
      var segs = v.slice(1).split('/');
      for (i = 0; i < segs.length; i++) if (segs[i] === '.' || segs[i] === '..') return 'PATH_INVALID';
      return null;
    }
    if (def.encoder === 'pipe-path') {
      for (i = 0; i < res.length; i++) if (typeof res[i] === 'string' && !matches(res[i], v)) return 'PATH_INVALID';
      var text = v.split('/').map(function (x) { return encodeURIComponent(x); }).join('/');
      return text.length > 1023 ? 'PATH_INVALID' : null;
    }
    for (i = 0; i < res.length; i++) if (typeof res[i] === 'string' && !matches(res[i], v)) return 'VALUE_INVALID';
    if (Array.isArray(def['enum']) && def['enum'].indexOf(v) === -1) return 'VALUE_INVALID';
    return null;
  }

  // null when `value` is acceptable for `def`, else the SDK's error code.
  function checkValue(def, value) {
    if (!def) return 'PARAM_UNKNOWN';
    if (value === undefined || value === null) return 'VALUE_INVALID';
    if (def['in'] === 'path') return checkPath(def, value);
    if (def.repeat === 'ordered') {
      if (!Array.isArray(value)) return 'VALUE_INVALID';
      for (var i = 0; i < value.length; i++) {
        var item = value[i], d = {}, k;
        for (k in def) if (own(def, k)) d[k] = def[k];
        d.type = typeof item === 'number' ? 'number' : 'string';
        var e = checkScalar(d, item);
        if (e) return e;
      }
      return null;
    }
    return checkScalar(def, value);
  }

  window.HubEmbedGuard = {
    SECRET_NAMES: SECRET_NAMES.slice(),
    expectedHost: expectedHost,
    boundUrl: boundUrl,
    httpsUrl: httpsUrl,
    secretIn: function (v) { return secretIn(v, 0); },
    checkValue: checkValue,
  };
})();
