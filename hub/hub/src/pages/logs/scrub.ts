// HubLogsScrub: the browser port of the agent's own scrub
// (the agent's memory scrubber). Everything the Logs
// section shows, copies, sends to Explain or exports from a non-agent source passes through it.
// scrub.test.ts holds it byte-equal to the agent's Go-generated golden when the agent's source tree is
// present: a change to the agent's rules is a change here, in the same order.
//
// The patterns below are the agent's RE2 sources; `re2` compiles each one to a JavaScript RegExp
// with RE2's meaning, which differs from a plain JS RegExp:
//   - (?i) folds ſ (U+017F) with s and K (U+212A) with k, in literals and classes;
//   - \s is [\t\n\f\r ] and \w, \b are ASCII only (NBSP and \v are not spaces); a JS RegExp
//     without the u flag already keeps \b ASCII, (?i)\w gains ſ and K; inside a class, \S adds
//     back the characters JS counts as spaces and RE2 does not;
//   - (?m) ^ and $ see only \n; `.` excludes only \n; \z is the end of the text;
//   - the entropy fallback measures its 40-byte proximity in UTF-8 bytes.
// RE2 runs in linear time; a JS RegExp backtracks. The agent keeps every rule but one linear as a
// plain RegExp too (goldens v2: a bounded URL scheme, a bounded .env name, [\t\f\r ]* at line
// starts), so those sources are the agent's, unchanged; the golden's hostile section pins the time.
// The JWT rule is not: here it runs as a scanner with RE2's matches (jwtSpans), never as a RegExp.
// Every value is scrubbed whole first; cut() comes after. Lone surrogates (no Go equivalent)
// become U+FFFD first, as Go's JSON decoding does; a snapshot (stripSnapshot) drops them instead,
// in both of its views (U+FFFD would join nothing an escape split).

type Span = [number, number];
type Scanner = (s: string) => Span[];
/** One strip rule: a RegExp with its replacement, or a scanner that finds the spans to redact whole. */
type Rule = [RegExp | Scanner, string];
/** A text with, for each UTF-16 unit, the raw interval [lo, hi) it came from, and the intervals redacted so far. */
interface View { t: string; lo: Int32Array; hi: Int32Array; red: Span[] }
interface Edit { a: number; b: number; head: string; tail: string }

const R = '[REDACTED]';
const TRUNC = '[truncated]';
const MAX_DEPTH = 16;
const W = 'A-Za-z0-9_';

function foldChar(c: string): string {
  const l = c.toLowerCase(), u = c.toUpperCase(), s = l === u ? c : l + u;
  return s + (l === 's' ? 'ſ' : l === 'k' ? 'K' : '');
}
function letter(c: string | undefined): boolean { return /^[A-Za-z]$/.test(c || ''); }
// RE2 source → RegExp (global and Unicode by default; RE2's own flags are spelled out instead, see the header). The u flag
// makes a bounded repeat count code points, as RE2 counts runes: without it `[^"\\]{0,128}` stops after 64 emoji, so a
// credential name or value past that bound escaped the rule. \b, \w and \d stay ASCII
// under u without the i flag, which re2 never sets.
function re2(src: string, flags?: string): RegExp {
  const m = /^\(\?([ims]+)\)/.exec(src), f = m ? (m[1] as string) : '';
  if (m) src = src.slice(m[0].length);
  const I = f.indexOf('i') !== -1, M = f.indexOf('m') !== -1, S = f.indexOf('s') !== -1;
  let out = '', cls = false, i = 0;
  while (i < src.length) {
    const c = src.charAt(i++);
    if (c === '\\') {
      const d = src.charAt(i++);
      if (d === 'z') out += '(?![\\s\\S])';
      else if (d === 's') out += cls ? '\\t\\n\\f\\r ' : '[\\t\\n\\f\\r ]';
      else if (d === 'S') out += cls ? '\\S\\v\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff' : '[^\\t\\n\\f\\r ]';
      else if (d === 'w') out += (cls ? '' : '[') + W + (I ? 'ſK' : '') + (cls ? '' : ']');
      else out += '\\' + d;
    } else if (cls) {
      if (c === ']') { cls = false; out += c; }
      else if (I && letter(c) && src.charAt(i) === '-' && letter(src.charAt(i + 1))) {
        const e = src.charAt(i + 1), lo = c.toLowerCase(), hi = e.toLowerCase();
        i += 2;
        out += c + '-' + e + (c === lo ? c.toUpperCase() + '-' + e.toUpperCase() : lo + '-' + hi);
        if (lo <= 's' && hi >= 's') out += 'ſ';
        if (lo <= 'k' && hi >= 'k') out += 'K';
      } else out += I && letter(c) ? foldChar(c) : c;
    } else if (c === '[') {
      cls = true;
      out += c;
      if (src.charAt(i) === '^') { out += '^'; i++; }
    } else if (c === '^') out += M ? '(?<![^\\n])' : '(?<![\\s\\S])';
    else if (c === '$') out += M ? '(?![^\\n])' : '(?![\\s\\S])';
    else if (c === '.') out += S ? '[\\s\\S]' : '[^\\n]';
    else if (c === '(' && src.charAt(i) === '?') { out += '(?' + src.charAt(i + 1); i += 2; }
    else if (I && letter(c)) out += '[' + foldChar(c) + ']';
    else out += c;
  }
  return new RegExp(out, flags == null ? 'gu' : flags);
}
// Go's $1 / ${3} expansions in JS replacement syntax.
// SRC keeps each pattern's RE2 source, in order. WHOLE keeps the sources of the rules that redact their whole
// match (the credential formats): embedded() below finds those anywhere.
const SRC: string[] = [];
const WHOLE: string[] = [];
function P(src: string, repl: string): Rule {
  SRC.push(src);
  if (repl.indexOf(R) === 0) WHOLE.push(src);
  return [re2(src), repl.replace(/\$\{(\d+)\}/g, '$$$1')];
}
// A rule run by a scanner (spans(s): its matches, ascending and disjoint) instead of its RegExp; it redacts whole.
function L(src: string, spans: (s: string) => Span[]): Rule {
  SRC.push(src);
  WHOLE.push(src);
  return [spans, R];
}
const JWT = 'eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}';
// The agent's JWT rule is linear in RE2 but not as a RegExp: tried from every eyJ, a backtracking engine reads the
// rest of the run each time ('eyJ_' repeated took seconds at 64 KiB). jwtSpans finds RE2's matches in one walk over
// the runs of [A-Za-z0-9_-]. No segment holds a '.', so each one is a whole run: a match starts in a run that a '.'
// follows, at its leftmost eyJ with 10 or more characters after it in that run, and takes the next two runs whole,
// each right after its '.', 10 or more long, the first followed by '.'. A failed run leaves the next run to start
// one; a match resumes after its third run (leftmost, greedy, no overlap: RE2's ReplaceAll). Every character is
// read a fixed number of times, whatever the text. embed (the display pass): eyJ in any case, only at the start of
// a run or after a character that is not a letter or digit; its runs count ſ and K, as (?i) RE2
// classes do.
const RUN = /[A-Za-z0-9_-]+/g, RUN_I = /[A-Za-z0-9_\-\u017f\u212a]+/g, HEAD = /eyJ/g, HEAD_I = /eyj/gi, ALNUM = /[A-Za-z0-9]/;
function jwtSpans(s: string, embed: boolean): Span[] {
  const run = embed ? RUN_I : RUN, head = embed ? HEAD_I : HEAD, runs: number[] = [], spans: Span[] = [];
  let at = -1, m: RegExpExecArray | null;
  const r = (i: number): number => runs[i] as number;
  run.lastIndex = 0;
  while ((m = run.exec(s))) runs.push(m.index, m.index + m[0].length);
  // The first eyJ at or after i. `at` is kept until i passes it, so each part of s is searched once.
  function next(i: number): number {
    if (at >= i) return at;
    head.lastIndex = i;
    m = head.exec(s);
    return at = m ? m.index : Infinity;
  }
  for (let k = 0; k + 5 < runs.length; k += 2) {
    const e = r(k + 1);
    if (s.charCodeAt(e) !== 46 || r(k + 2) !== e + 1) continue;
    let p = next(r(k));
    while (embed && p < e && p > r(k) && ALNUM.test(s.charAt(p - 1))) p = next(p + 1);
    const b = r(k + 3);
    if (p > e - 13 || b - r(k + 2) < 10 || s.charCodeAt(b) !== 46 || r(k + 4) !== b + 1 || r(k + 5) - r(k + 4) < 10) continue;
    spans.push([p, r(k + 5)]);
    k += 4;
  }
  return spans;
}

// The agent's secret patterns, in order.
const KEYS = 'api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|private[_-]?key|secret|token|password|passwd|pass[_-]?phrase|credential';
const PATTERNS: Rule[] = [
  // A credential assignment whose quoted value spans lines: the whole value, through its closing
  // quote or the end of the text. An escaped quote does not close it, and a backslash-newline
  // continuation counts as the line break; an unclosed value takes a final lone backslash too
  // (the agent's rule, matched by the shared vectors).
  P('(?i)((?:' + KEYS + '|_(?:pass|pwd|pat|auth))[\\w.-]{0,40}\\s*[:=]\\s*)(?:"(?:[^"\\\\\\n]|\\\\[^\\n])*\\\\?\\n(?:[^"\\\\]|\\\\[\\s\\S])*(?:"|\\\\?\\z)|' +
    '\'(?:[^\'\\\\\\n]|\\\\[^\\n])*\\\\?\\n(?:[^\'\\\\]|\\\\[\\s\\S])*(?:\'|\\\\?\\z))', '$1"' + R + '"'),
  P('(?i)(api[_-]?key|secret|token|password|credential|auth)\\s*[=:]\\s*["\']?[A-Za-z0-9_\\-/.+]{20,}["\']?', '$1=' + R),
  P('(?i)\\bBearer\\s+[A-Za-z0-9._\\-+/=]{20,}', 'Bearer ' + R),
  P('sk-proj-[A-Za-z0-9\\-_]{20,}', R),
  P('\\b(?:sk|pk|rk|ak)-[A-Za-z0-9][A-Za-z0-9\\-_]{19,}', R),
  P('sk-ant-[A-Za-z0-9\\-_]{20,}', R),
  P('hdy_[A-Za-z0-9]{20,32}_[A-Za-z0-9]{16,48}', R),
  P('hbk_[A-Za-z0-9]{20,43}', R),
  P('gh[opusr]_[A-Za-z0-9]{36,}', R),
  P('github_pat_[A-Za-z0-9_]{22,}', R),
  P('xox[baprse]-[A-Za-z0-9\\-]{10,}', R),
  P('\\b((?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16})([^0-9A-Z]|$)', R + '$2'),
  P('AIza[A-Za-z0-9\\-_]{35}', R),
  L(JWT, function (s) { return jwtSpans(s, false); }),
  P('npm_[A-Za-z0-9]{36}', R),
  P('glpat-[A-Za-z0-9\\-_]{20,}', R),
  P('dop_v1_[A-Za-z0-9]{64}', R),
  // A .env name whose stem starts in its first 64 characters, or any name of 65+ (fail closed).
  // A cookie name is matched whole here and in the key rules below (cookie, cookies, and those after set, http, session
  // or auth), never as a stem after a free prefix: fortune_cookie and cookie_consent keep their values.
  P('(?m)^([\\t\\f\\r ]*(?:export\\s+)?(?:[A-Z](?:[A-Z0-9_]{0,63}(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PASSPHRASE|CREDENTIAL)[A-Z0-9_]*|[A-Z0-9_]{0,63}_(?:PASS|PWD|PAT|AUTH)|[A-Z0-9_]{64,})|(?:(?:SET|HTTP|SESSION|AUTH)_?)?COOKIES?)\\s*=\\s*)(?:"(?:[^"\\\\\\r\\n]|\\\\.)*"?\\S*|\'[^\'\\r\\n]*\'?\\S*|\\S+)', '$1' + R),
  // URL credentials; the scheme is the last 1–32 scheme characters before "://".
  P('(?i)([a-z0-9+.-]{1,32}://[^/\\s:@]*):([^\\s/?#]+)@([^@\\s/?#,;]+)', '$1:' + R + '@${3}'),
  // Folded continuation lines (a line that starts with a space or a tab) belong to the header.
  P('(?i)\\b((?:proxy-)?authorization)\\s*:\\s*[^\\r\\n]+(?:\\r?\\n[\\t ][^\\r\\n]*)*', '$1: ' + R),
  P('(?i)\\b(set-cookie|cookie)\\s*:\\s*[^\\r\\n]+(?:\\r?\\n[\\t ][^\\r\\n]*)*', '$1: ' + R),
  P('(?i)\\b((?:session|sess|sid|csrf|xsrf)[_-]?(?:id|token)?=)[^;&\\s"\']+', '$1' + R),
  P('(?i)\\b((?:access|refresh)[_-]token=)[^;&\\s"\']+', '$1' + R),
  // A percent-encoded assignment (key%3Dvalue), through an encoded & (%26).
  P('(?i)((?:' + KEYS + ')%3D)(?:[^%&\\s"\';,]|%(?:[013-9A-F][0-9A-F]|2[0-57-9A-F]))+', '$1' + R),
  P('\\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}', R),
  P('\\bSG\\.[A-Za-z0-9_.\\-]{32,}', R),
  P('\\bSK[0-9a-fA-F]{32}\\b', R),
  P('sk-or-[A-Za-z0-9\\-_]{20,}', R),
  P('\\bhf_[A-Za-z0-9]{20,}', R),
  // HashiCorp Vault service, batch and recovery tokens.
  P('\\bhv[sbr]\\.[A-Za-z0-9_-]{24,}', R),
  P('(?i)\\b(AccountKey=)[A-Za-z0-9+/=]{40,}', '$1' + R),
  P('(?i)("(?:[\\w.-]*(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|(?:aws[_-]?)?secret[_-]?access[_-]?key|secret[_-]?key|private[_-]?key|secret|token|password|passwd|credential|authorization|pass[_-]?phrase)|(?:[\\w.-]*[._-])?(?:pass|pwd|pat)|(?:(?:set|http|session|auth)[_-]?)?cookies?)"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*(?:"|\\\\?\\z)', '$1"' + R + '"'),
  P('(?im)^([\\t\\f\\r ]*(?:[\\w.-]*(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|(?:aws[_-]?)?secret[_-]?access[_-]?key|secret[_-]?key|private[_-]?key|secret|token|password|passwd|credential|authorization|pass[_-]?phrase)|[\\w.-]*[._-](?:pass|pwd|pat)|(?:(?:set|http|session|auth)[_-]?)?cookies?)\\s*[:=]\\s*)\\S[^\\r\\n]*', '$1' + R),
  P('(?i)((?:password|passwd|client[_-]?secret|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|secret[_-]?access[_-]?key|secret[_-]?key|(?:^|[^A-Za-z0-9])pass[_-]?phrase)\\s*[:=]\\s*)("(?:[^"\\\\\\r\\n]|\\\\.)*"?|\'(?:[^\'\\\\\\r\\n]|\\\\.)*\'?|[^\\s"\',;]+)', '$1' + R),
  // --- escaped backslash runs ---
  // A JSON document inside a JSON string (`\"password\":\"…\"`): the quoted-key rule with `\"` for each quote; runs of
  // backslashes are read in groups of four, so each run parses one way.
  P('(?i)(\\\\"(?:[\\w.-]*(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|(?:aws[_-]?)?secret[_-]?access[_-]?key|secret[_-]?key|private[_-]?key|secret|token|password|passwd|credential|authorization|pass[_-]?phrase)|(?:[\\w.-]*[._-])?(?:pass|pwd|pat)|(?:(?:set|http|session|auth)[_-]?)?cookies?)\\\\"\\s*:\\s*)\\\\"(?:[^"\\\\]|(?:\\\\{4})+[^"\\\\]|(?:\\\\{4})*(?:\\\\[^"\\\\]|\\\\{2}[^"\\\\]|\\\\{3}[^\\\\]))*(?:(?:\\\\{4})*\\\\"|\\\\*\\z)', '$1\\"' + R + '\\"'),
  // Vendor tokens with no credential word near them: Slack app-level, whsec_ webhook signing secrets, Telegram bot
  // (bare or in a Bot API path, `bot` prefix included), Discord bot; incoming-webhook URL secrets (ids kept).
  P('xapp-\\d-[A-Za-z0-9]{1,15}-\\d{6,}-[A-Za-z0-9]{20,}', R),
  P('\\bwhsec_[A-Za-z0-9+/=]{24,}', R),
  P('\\b(?:bot)?\\d{8,10}:[A-Za-z0-9_-]{35}([^A-Za-z0-9_-]|$)', R + '$1'),
  P('\\b[MNO][A-Za-z\\d]{23,27}\\.[\\w-]{6}\\.[\\w-]{27,40}', R),
  P('(hooks\\.slack\\.com/services/T[A-Z0-9]{6,}/B[A-Z0-9]{6,}/)[A-Za-z0-9]{20,}', '$1' + R),
  P('(discord(?:app)?\\.com/api/webhooks/\\d{15,25}/)[A-Za-z0-9_-]{50,}', '$1' + R),
  // A name/value pair whose sibling name field ends in a credential stem (k8s env, SSM): value after or before
  // the name, then the YAML forms (a `|`/`>` block first, then the inline value). Every run is bounded.
  P('(?i)("(?:name|key)"\\s*:\\s*"(?:[^"\\\\\\r\\n]{0,128}?(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|secret[_-]?key|private[_-]?key|secret|token|password|passwd|credential|pass[_-]?phrase)|(?:[^"\\\\\\r\\n]{0,128}?[._/:-])?(?:pass|pwd|pat|auth)|(?:(?:set|http|session|auth)[_-]?)?cookies?)"(?:\\s*,\\s*"\\w{1,32}"\\s*:\\s*(?:"[^"\\\\\\r\\n]{0,128}"|[\\w.+-]{1,32})){0,4}\\s*,\\s*"value"\\s*:\\s*)(?:"(?:[^"\\\\]|\\\\.)*(?:"|\\\\?\\z)|-?\\d[\\w.+-]{0,63})', '$1"' + R + '"'),
  P('(?i)("value"\\s*:\\s*)(?:"(?:[^"\\\\\\r\\n]|\\\\.){0,1000}"|-?\\d[\\w.+-]{0,63})((?:\\s*,\\s*"\\w{1,32}"\\s*:\\s*(?:"[^"\\\\\\r\\n]{0,128}"|[\\w.+-]{1,32})){0,4}\\s*,\\s*"(?:name|key)"\\s*:\\s*"(?:[^"\\\\\\r\\n]{0,128}?(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|secret[_-]?key|private[_-]?key|secret|token|password|passwd|credential|pass[_-]?phrase)|(?:[^"\\\\\\r\\n]{0,128}?[._/:-])?(?:pass|pwd|pat|auth)|(?:(?:set|http|session|auth)[_-]?)?cookies?)")', '$1"' + R + '"$2'),
  P('(?im)^([\\t ]*(?:-[\\t ]+)?name:[\\t ]*["\']?(?:[^\\s"\']{0,128}?(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|secret[_-]?key|private[_-]?key|secret|token|password|passwd|credential|pass[_-]?phrase)|(?:[^\\s"\']{0,128}?[._/:-])?(?:pass|pwd|pat|auth)|(?:(?:set|http|session|auth)[_-]?)?cookies?)["\']?[\\t ]*\\r?\\n[\\t ]*value:[\\t ]*)[|>][-+0-9]{0,2}[\\t ]*(?:\\r?\\n[\\t ]+(?:[^\\s\\w-][^\\r\\n]*|-[^\\s][^\\r\\n]*|[\\w.-]+(?:[^\\w.:\\r\\n-][^\\r\\n]*|:[^\\s][^\\r\\n]*)?)\\r?$){1,64}', '$1' + R),
  P('(?im)^([\\t ]*(?:-[\\t ]+)?name:[\\t ]*["\']?(?:[^\\s"\']{0,128}?(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|secret[_-]?key|private[_-]?key|secret|token|password|passwd|credential|pass[_-]?phrase)|(?:[^\\s"\']{0,128}?[._/:-])?(?:pass|pwd|pat|auth)|(?:(?:set|http|session|auth)[_-]?)?cookies?)["\']?[\\t ]*\\r?\\n[\\t ]*value:[\\t ]*)\\S[^\\r\\n]*', '$1' + R),
  // Credential flags with a space-separated value; curl basic credentials after a `curl` head (the user is kept),
  // one rule per quoting.
  P('(?i)((?:^|[\\s"\'])--?(?:password|passwd|pass[_-]?phrase|pwd|pass|token|secret|api[_-]?key|mount-encryption-key|access[_-]?token|auth[_-]?token|client[_-]?secret|cookie)(?:=|[\\t ]+))(?:"(?:[^"\\\\\\r\\n]|\\\\.)*"?|\'[^\'\\r\\n]*\'?|(?:[^\\s"\'\\\\-]|\\\\.)(?:[^\\s"\'\\\\]|\\\\.)*)', '$1' + R),
  P('(?i)(\\bcurl\\b[^\\r\\n;&|]{0,256}?[\\t ](?:-u[\\t ]*|--user(?:=|[\\t ]+))"[^"\\s:]{1,64}:)(?:[^"\\\\\\r\\n]|\\\\.)*"?', '$1' + R + '"'),
  P('(?i)(\\bcurl\\b[^\\r\\n;&|]{0,256}?[\\t ](?:-u[\\t ]*|--user(?:=|[\\t ]+))\'[^\'\\s:]{1,64}:)[^\'\\r\\n]*\'?', '$1' + R + '\''),
  P('(?i)(\\bcurl\\b[^\\r\\n;&|]{0,256}?[\\t ](?:-u[\\t ]*|--user(?:=|[\\t ]+))[^\\s:"\']{1,64}:)[^\\s"\']+', '$1' + R),
];
const PEM = re2('(?s)-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----.*?(?:-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----|\\z)');
const SENSITIVE_KEY = re2('(?i)(?:(?:^|[._-])(?:api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|(?:aws[_-]?)?secret[_-]?access[_-]?key|secret[_-]?key|secret|token|password|passwd|pass[_-]?phrase|credential|authorization|auth|pass|pwd|pat)|^(?:(?:set|http|session|auth)[_-]?)?cookies?)$');
// SENSITIVE_KEY without the short stems pass, pwd and pat (the agent's long-key rule).
const SENSITIVE_LONG_KEY = re2('(?i)(?:(?:^|[._-])(?:api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|(?:aws[_-]?)?secret[_-]?access[_-]?key|secret[_-]?key|secret|token|password|passwd|pass[_-]?phrase|credential|authorization|auth)|^(?:(?:set|http|session|auth)[_-]?)?cookies?)$');
const CRED_KEYWORD = re2('(?i)(api[_-]?key|secret|token|password|passwd|pass[_-]?phrase|credential|auth|\\bkey\\b|(?:\\b|_)(?:pass|pwd|pat)(?:\\b|_))');
const ENTROPY_BITS = 4.5, ENTROPY_NEAR = 40;

const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
function wellFormed(s: unknown): string { return String(s).replace(LONE, '�'); }

// Each span [a, b) of s (ascending, disjoint) becomes [REDACTED].
function replaceSpans(s: string, spans: Span[]): string {
  if (!spans.length) return s;
  let out = '', last = 0;
  for (let i = 0; i < spans.length; i++) {
    const [a, b] = spans[i] as Span;
    out += s.slice(last, a) + R;
    last = b;
  }
  return out + s.slice(last);
}

// <private>…</private>, case-insensitive (ASCII only, so offsets stay put), nested blocks
// redacted at the outermost open tag, an unclosed one through the end of the text. One pass over
// the tags in order: a close tag outside a block is text.
function privateSpans(s: string): Span[] {
  const low = s.replace(/[A-Z]/g, function (c) { return c.toLowerCase(); }), spans: Span[] = [];
  if (low.indexOf('<private>') === -1) return spans;
  const TAG = /<(\/?)private>/g;
  let from = 0, depth = 0, m: RegExpExecArray | null;
  while ((m = TAG.exec(low))) {
    if (!m[1]) {
      if (depth++ === 0) from = m.index;
    } else if (depth > 0 && --depth === 0) spans.push([from, m.index + m[0].length]);
  }
  if (depth > 0) spans.push([from, s.length]);
  return spans;
}
function stripPrivateTags(s: string): string { return replaceSpans(s, privateSpans(s)); }

// UTF-8 byte offset of every UTF-16 index of s.
function byteOffsets(s: string): number[] {
  const off = [0];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    off.push((off[i] as number) + (c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c <= 0xdfff ? 2 : 3));
  }
  return off;
}
// Summed in byte order, as shannonBitsPerChar does.
function bitsPerChar(t: string): number {
  const freq: number[] = [], n = t.length;
  let bits = 0;
  for (let i = 0; i < n; i++) freq[t.charCodeAt(i)] = (freq[t.charCodeAt(i)] || 0) + 1;
  for (let c = 0; c < freq.length; c++) {
    const f = freq[c];
    if (f) bits -= (f / n) * Math.log2(f / n);
  }
  return bits;
}
// Runs of [A-Za-z0-9+/=_-] of 32+ above 4.5 bits/char, within 40 bytes of a credential
// keyword (or with one inside the run), become [REDACTED].
function entropySpans(s: string): Span[] {
  const toks: Span[] = [], spans: Span[] = [], re = /[A-Za-z0-9+/=_-]{32,}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) toks.push([m.index, m.index + m[0].length]);
  if (!toks.length) return spans;
  const kws: Span[] = [];
  CRED_KEYWORD.lastIndex = 0;
  while ((m = CRED_KEYWORD.exec(s))) { kws.push([m.index, m.index + m[0].length]); if (!m[0].length) CRED_KEYWORD.lastIndex++; }
  if (!kws.length) return spans;
  // Tokens and keywords both ascend. Keywords are spelled in token characters and tokens are
  // whole runs of them, so a keyword lies wholly inside a token or wholly outside it. One cursor
  // q, the first keyword starting at or after the token, is then the nearest keyword inside or
  // after it (the distance is negative inside), and q-1 the nearest one before it.
  const off = byteOffsets(s), at = (i: number): number => off[i] as number, kw = (i: number): Span => kws[i] as Span;
  let q = 0;
  toks.forEach(function (t) {
    while (q < kws.length && kw(q)[0] < t[0]) q++;
    const near = (q > 0 && at(t[0]) - at(kw(q - 1)[1]) <= ENTROPY_NEAR) ||
      (q < kws.length && at(kw(q)[0]) - at(t[1]) <= ENTROPY_NEAR);
    if (near && bitsPerChar(s.slice(t[0], t[1])) > ENTROPY_BITS) spans.push(t);
  });
  return spans;
}
function stripHighEntropy(s: string): string { return replaceSpans(s, entropySpans(s)); }

// The agent's own scrub: private tags, PEM private keys, the pattern list in order, the entropy fallback.
function goStrip(input: unknown): string {
  if (input === '' || input == null) return '';
  let s = stripPrivateTags(wellFormed(input));
  s = s.replace(PEM, R);
  for (const [rule, repl] of PATTERNS) {
    s = typeof rule === 'function' ? replaceSpans(s, rule(s)) : s.replace(rule, repl);
  }
  return stripHighEntropy(s);
}

// The credential formats (WHOLE) found inside a word: after any character but a letter or digit (after '_', '-',
// '.', where the agent's scrub's \b fails: copy_AKIA…), case ignored, and no guard after the match (AWS wants no
// [0-9A-Z] after its key). TAIL is such a guard: a final group that may end the text ('…|$)'), a lookahead, or
// a final '$' or '\z'. A key glued to a letter or digit (xAKIA…) is not looked for, so kebab-case names such as
// desk-booking-service-production stay as they are. The JWT format is found by
// jwtSpans(s, true), never by a RegExp (see jwtSpans).
const TAIL = /(?:\((?:\?:)?(?:[^()\\]|\\.)*\|\$\)|\(\?[=!](?:[^()\\]|\\.)*\)|\$|\\z)$/;
let EMBED: RegExp | undefined;
function embedSource(src: string): string {
  const f: string[] = /^\(\?([a-z]+)\)/.exec(src) || ['', ''];
  return '(?' + (f[1] as string).replace('i', '') + 'i)' + src.slice((f[0] as string).length).replace(/((?:^|[^\\])(?:\\\\)*)\\b/g, '$1').replace(TAIL, '');
}
function embedRe(): RegExp {
  return EMBED = EMBED || new RegExp(WHOLE.filter(function (src) { return src !== JWT; })
    .map(function (src) { return '(?<![A-Za-z0-9])(?:' + re2(embedSource(src), 'u').source + ')'; }).join('|'), 'gu');
}
function embedded(v: unknown): boolean {
  const re = embedRe(), text = String(v);
  re.lastIndex = 0;
  return re.test(text) || jwtSpans(text, true).length > 0;
}
// A token: a run between spaces, quotes, brackets and the separators of paths, pairs and lists.
const TOKEN = /[^\s"'`<>()[\]{},;\/\\|=:]+/g;
// What the agent's scrub left, with each token that holds an embedded credential replaced whole; a match across
// separators (no format has one today) is replaced as matched.
function redactEmbedded(input: unknown): string {
  if (typeof input !== 'string' || !embedded(input)) return input as string;
  let s: string = input;
  s = s.replace(TOKEN, function (t) { return embedded(t) ? R : t; });
  if (!embedded(s)) return s;
  s = s.replace(embedRe(), R);
  return replaceSpans(s, jwtSpans(s, true));
}
// Every Logs output of log text (rows, program output, Explain, export, copy) is scrubbed by strip, stripDeep
// or stripSnapshot: each is the agent's scrub's port (goStrip, byte-equal with Go) plus redactEmbedded.
function strip(s: unknown): string { return redactEmbedded(goStrip(s)); }

// Inserts '_' at each ASCII lower/digit → upper hump, so camelCase keys meet the key rule.
function splitCamel(k: string): string { return k.replace(/([a-z0-9])(?=[A-Z])/g, '$1_'); }
function keyIsSensitive(k: string): boolean {
  SENSITIVE_KEY.lastIndex = 0;
  if (SENSITIVE_KEY.test(k)) return true;
  const s = splitCamel(k);
  SENSITIVE_KEY.lastIndex = 0;
  return s !== k && SENSITIVE_KEY.test(s);
}
// keyIsSensitive without the short stems: the key names a credential through a longer stem, raw or camel-split.
function longKeyIsSensitive(k: string): boolean {
  SENSITIVE_LONG_KEY.lastIndex = 0;
  if (SENSITIVE_LONG_KEY.test(k)) return true;
  const s = splitCamel(k);
  SENSITIVE_LONG_KEY.lastIndex = 0;
  return s !== k && SENSITIVE_LONG_KEY.test(s);
}
// strings.EqualFold with an ASCII word: ASCII case, and K (U+212A) folds with k, ſ (U+017F) with s.
function foldEq(k: string, word: string): boolean {
  if (k.length !== word.length) return false;
  for (let i = 0; i < k.length; i++) {
    const c = k.charAt(i), f = c === '\u212a' ? 'k' : c === '\u017f' ? 's' : /[A-Z]/.test(c) ? c.toLowerCase() : c;
    if (f !== word.charAt(i)) return false;
  }
  return true;
}
// Short stems, as the agent keeps them: pass, pwd and pat are ordinary words too (a test summary's "pass": 12, an environment's
// "PWD": "/work"), so under a key sensitive ONLY through one of them a number is kept, and so is an absolute or home
// path under a bare pwd key. A long stem (db_password) still redacts every value but a boolean.
function shortStemKeeps(k: string, v: unknown): boolean {
  if (longKeyIsSensitive(k)) return false;
  if (typeof v === 'number') return true;
  return typeof v === 'string' && foldEq(k, 'pwd') && (v.charAt(0) === '/' || v.charAt(0) === '~');
}
// The agent's pair-name rule: the NAME of a name/value pair names a credential when the same word as a key would, or the
// last segment of an SSM path or ARN does. A name over 256 UTF-8 bytes is not scanned and counts as one (fail closed).
const PAIR_NAME_MAX = 256;
function pairNameIsSecret(name: string): boolean {
  if (new TextEncoder().encode(name).length > PAIR_NAME_MAX) return true;
  if (keyIsSensitive(name)) return true;
  const i = Math.max(name.lastIndexOf('/'), name.lastIndexOf(':'));
  return i >= 0 && i + 1 < name.length && keyIsSensitive(name.slice(i + 1));
}
// The agent's name/value pair rule: an object whose name field (`name` or `key`, any case) is a string naming a
// credential (k8s env lists, SSM parameters, {"key":…,"value":…} settings); its `value` fields are redacted.
function pairSecret(rec: Record<string, unknown>): boolean {
  return Object.keys(rec).some(function (k) {
    const n = rec[k];
    return (foldEq(k, 'name') || foldEq(k, 'key')) && typeof n === 'string' && pairNameIsSecret(n);
  });
}
// Order of Go's sort.Strings: UTF-8 bytes, which is code point order.
function byteCompare(a: string, b: string): number {
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const x = a.codePointAt(i) as number, y = b.codePointAt(j) as number;
    if (x !== y) return x < y ? -1 : 1;
    i += x > 0xffff ? 2 : 1;
    j += y > 0xffff ? 2 : 1;
  }
  return i < a.length ? 1 : j < b.length ? -1 : 0;
}
function own(o: object, k: string): boolean { return Object.prototype.hasOwnProperty.call(o, k); }
// An own, enumerable key even for "__proto__", which plain assignment turns into a prototype.
function put(o: object, k: string, v: unknown): void { Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true }); }

// The agent's deep scrub over a JSON value: strings stripped, a credential key
// redacts its whole value unless it is a boolean (or shortStemKeeps keeps it), the value of a name/value pair whose
// name is a credential is redacted (pairSecret), a key that holds a secret is stripped too
// (collisions get #2, #3… in byte order of the original keys), containers past depth 16 become
// "[truncated]". Returns a new value; the input is not changed.
function deepWith(strip: (s: unknown) => string): (v: unknown, depth?: number) => unknown {
  return function stripDeep(v: unknown, depth = 0): unknown {
    const obj = v !== null && typeof v === 'object';
    if (depth > MAX_DEPTH && obj) return TRUNC;
    if (typeof v === 'string') return strip(v);
    if (!obj) return v;
    if (Array.isArray(v)) return v.map(function (e) { return stripDeep(e, depth + 1); });
    const rec = v as Record<string, unknown>, out = {}, secret: string[] = [], pair = pairSecret(rec);
    const value = (k: string): unknown => (keyIsSensitive(k) && typeof rec[k] !== 'boolean' && !shortStemKeeps(k, rec[k]) ? R : stripDeep(rec[k], depth + 1));
    Object.keys(rec).forEach(function (k) {
      if (strip(k) !== k) secret.push(k);
      else put(out, k, pair && foldEq(k, 'value') && typeof rec[k] !== 'boolean' ? R : value(k));
    });
    secret.sort(byteCompare).forEach(function (k) {
      const sk = wellFormed(strip(k));
      let name = sk, n = 2;
      while (own(out, name)) name = sk + '#' + n++;
      put(out, name, value(k));
    });
    return out;
  };
}
const stripDeep = deepWith(strip), goStripDeep = deepWith(goStrip);

// A snapshot as plain text, before any rule sees it: sanitize.Label's pass with the lines kept.
// Escape sequences are dropped as sanitize.skipEscape scans them (CSI to a final 0x40-0x7e,
// OSC/DCS/SOS/PM/APC to BEL or ESC \, otherwise ESC plus one; an unterminated run goes to the
// end), \t becomes a space, other C0, DEL, C1, bidi controls and lone surrogates are dropped;
// \n stays. A secret an escape split in two, even over a line break, is whole again before
// strip, and the window-edge rules see the text as it shows.
const BIDI = /^[\u202a-\u202e\u2066-\u2069\u200e\u200f\u061c]$/;
// In a snapshot's atom view (plainView with marks) each "[REDACTED]" is one atom: an ESC before it drops only the ESC,
// and an escape body (CSI parameters, OSC text) swallows it whole like any other character, so a marker
// inside an escape never splits the text around it. plain() itself, and plainView without marks, never has one.
function cp(a: string[], i: number): number { return a[i] === R ? 0x110000 : (a[i] as string).codePointAt(0) as number; }
function skipEsc(a: string[], i: number): number {
  const n = a.length;
  let j = i + 2;
  if (i + 1 >= n) return n;
  if (a[i + 1] === R) return i + 1;
  if (a[i + 1] === '[') {
    while (j < n && (cp(a, j) < 0x40 || cp(a, j) > 0x7e)) j++;
    return j < n ? j + 1 : j;
  }
  if (']PX^_'.indexOf(a[i + 1] as string) === -1) return i + 2;
  for (; j < n; j++) {
    if (a[j] === '\u0007') return j + 1;
    if (a[j] === '\u001b' && a[j + 1] === '\\') return j + 2;
  }
  return n;
}
// What plain keeps of atom a[i] (not an ESC): \n, a space for \t, nothing for a control, else the atom.
function kept(a: string[], i: number): string {
  const c = cp(a, i);
  if (c === 10) return '\n';
  if (c === 9) return ' ';
  return c >= 0x20 && c !== 0x7f && !(c >= 0x80 && c <= 0x9f) && !(c >= 0xd800 && c <= 0xdfff) && !BIDI.test(a[i] as string) ? (a[i] as string) : '';
}
function plain(s: unknown): string {
  const a = Array.from(String(s == null ? '' : s));
  let out = '', i = 0;
  while (i < a.length) {
    if (cp(a, i) === 0x1b) i = skipEsc(a, i);
    else out += kept(a, i++);
  }
  return out;
}

// pre-pass for a program-output snapshot, which may start inside a key block. Both
// rules only add redaction:
//   R-END: an `-----END … KEY-----` marker with no BEGIN of the same label before it: the text
//   from the start through that marker's line becomes [REDACTED].
//   R-B64RUN: 3 or more consecutive lines that are each 40+ base64 characters become one
//   [REDACTED] line.
const MARK = /-----(BEGIN|END) ([A-Z0-9 ]*KEY(?: BLOCK)?)-----/g;
// R-END: where the redaction ends (before the line break after the last orphan END), or -1.
function orphanEnd(s: string): number {
  const open: Record<string, number> = {};
  let end = -1, m: RegExpExecArray | null;
  MARK.lastIndex = 0;
  while ((m = MARK.exec(s))) {
    const label = m[2] as string;
    if (m[1] === 'BEGIN') open[label] = (open[label] || 0) + 1;
    else if (open[label]) open[label]--;
    else end = m.index + m[0].length;
  }
  if (end === -1) return -1;
  const eol = s.slice(end).search(/[\r\n]/);
  return eol === -1 ? s.length : end + eol;
}
// R-B64RUN: each run as a span, without the last line's \r.
function base64Runs(s: string): Span[] {
  const lines = s.split('\n'), spans: Span[] = [];
  let from = 0, end = 0, count = 0, pos = 0;
  for (let i = 0; i <= lines.length; i++) {
    const line = lines[i] as string;
    if (i < lines.length && /^[A-Za-z0-9+/=]{40,}\r?$/.test(line)) {
      if (count++ === 0) from = pos;
      end = pos + line.length;
    } else {
      if (count >= 3) spans.push([from, s.charCodeAt(end - 1) === 13 ? end - 1 : end]);
      count = 0;
    }
    if (i < lines.length) pos += line.length + 1;
  }
  return spans;
}
function windowEdges(input: string): string {
  const o = orphanEnd(input);
  const s = o !== -1 ? R + input.slice(o) : input;
  return replaceSpans(s, base64Runs(s));
}
// A snapshot (program output, exec output) is read three ways, and each way alone misses something:
//   - as it came: a secret an escape split in two is not whole here;
//   - made plain, each "[REDACTED]" one atom: an ESC eats the next character, so `ESC-----BEGIN` is no marker
//     and `ESC<private>` no tag;
//   - made plain as plain() makes it: the `[` of a "[REDACTED]" ends a CSI before it, so a marker inside CSI
//     parameters, which the atom view lets the CSI run past, cannot carry the CSI over a line break or a name.
// Each view runs the window-edge rules and the port, and each text a rule removes is recorded as an interval
// of the raw snapshot. The output is the atom view with each merged interval shown as one [REDACTED], so
// nothing any view removed survives. The escapes are parsed once, on the raw text, so a redaction never
// moves where an escape ends; a "[REDACTED]" already in the text is never a boundary of the output (see cp).
//
// A view is its text plus, for each UTF-16 unit, the raw interval [lo, hi) it came from. The intervals
// ascend, so a view range [a, b) came from [lo[a], hi[b - 1]).
// The text as it came, its lone surrogates dropped (U+FFFD, as strip would make them, would join nothing an
// escape split).
function rawView(raw: string): View {
  const t = raw.replace(LONE, ''), lo = new Int32Array(t.length), hi = new Int32Array(t.length);
  let k = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && (raw.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      lo[k] = i; hi[k] = i + 1; lo[k + 1] = i + 1; hi[k + 1] = i + 2; k += 2; i++;
    } else if (c < 0xd800 || c > 0xdfff) { lo[k] = i; hi[k] = i + 1; k++; }
  }
  return { t, lo, hi, red: [] };
}
// plain()'s pass over the raw text; with marks, each "[REDACTED]" is one atom. A lone surrogate is an atom too
// (an ESC may eat it, as in plain), then dropped. plain never lengthens an atom, so raw.length bounds the view.
function plainView(raw: string, marks: boolean): View {
  const a: string[] = [], at: number[] = [];
  let i = 0, next = marks ? raw.indexOf(R) : -1;
  while (i < raw.length) {
    let w: number;
    if (i === next) {
      w = R.length;
      next = raw.indexOf(R, i + w);
    } else {
      const c = raw.charCodeAt(i);
      w = c >= 0xd800 && c <= 0xdbff && (raw.charCodeAt(i + 1) & 0xfc00) === 0xdc00 ? 2 : 1;
    }
    a.push(raw.substr(i, w));
    at.push(i);
    i += w;
  }
  at.push(raw.length);
  const lo = new Int32Array(raw.length), hi = new Int32Array(raw.length);
  let t = '', k = 0;
  i = 0;
  while (i < a.length) {
    if (cp(a, i) === 0x1b) { i = skipEsc(a, i); continue; }
    const keep = kept(a, i);
    for (let j = 0; j < keep.length; j++) { lo[k] = at[i] as number; hi[k] = at[i + 1] as number; k++; }
    t += keep;
    i++;
  }
  return { t, lo: lo.subarray(0, k), hi: hi.subarray(0, k), red: [] };
}
// Writes each edit {a, b, head, tail} of v (ascending, disjoint) as head + [REDACTED] + tail, as strip
// writes it. What of [a, b) already reads as head at its start, or as tail at its end, stays (a `"`, a
// `Bearer `); the rest is recorded in v.red. The written text maps to the raw interval of what it replaced.
function edit(v: View, edits: Edit[]): View {
  if (!edits.length) return v;
  const t = v.t, n = t.length, cuts: [number, number, string][] = [];
  const lo0 = (i: number): number => v.lo[i] as number, hi0 = (i: number): number => v.hi[i] as number;
  let size = n;
  for (const e of edits) {
    let s0 = e.a, s1 = e.b;
    while (s0 < s1 && s0 - e.a < e.head.length && t.charCodeAt(s0) === e.head.charCodeAt(s0 - e.a)) s0++;
    while (s1 > s0 && e.b - s1 < e.tail.length && t.charCodeAt(s1 - 1) === e.tail.charCodeAt(e.tail.length - 1 - (e.b - s1))) s1--;
    const mid = e.head.slice(s0 - e.a) + R + e.tail.slice(0, e.tail.length - (e.b - s1));
    if (s0 < s1) v.red.push([lo0(s0), hi0(s1 - 1)]);
    cuts.push([s0, s1, mid]);
    size += mid.length - (s1 - s0);
  }
  let out = '', k = 0, last = 0;
  const lo = new Int32Array(size), hi = new Int32Array(size);
  for (const [s0, s1, mid] of cuts) {
    out += t.slice(last, s0) + mid;
    for (let j = last; j < s0; j++) { lo[k] = lo0(j); hi[k] = hi0(j); k++; }
    // an empty cut (nothing removed) maps its text to the point where it stands
    const l = s0 < s1 || s0 < n ? lo0(s0) : n ? hi0(n - 1) : 0;
    const h = s0 < s1 ? hi0(s1 - 1) : l;
    for (let j = 0; j < mid.length; j++) { lo[k] = l; hi[k] = h; k++; }
    last = s1;
  }
  out += t.slice(last);
  for (let j = last; j < n; j++) { lo[k] = lo0(j); hi[k] = hi0(j); k++; }
  return { t: out, lo, hi, red: v.red };
}
function spanEdits(spans: Span[]): Edit[] { return spans.map(function (sp) { return { a: sp[0], b: sp[1], head: '', tail: '' }; }); }
// The matches of a strip rule as edits; the replacement's text before and after [REDACTED], groups filled in.
function ruleEdits(s: string, re: RegExp | Scanner, repl: string): Edit[] {
  if (typeof re === 'function') return spanEdits(re(s));
  const k = repl.indexOf(R), edits: Edit[] = [];
  let m: RegExpExecArray | null = null;
  const fill = (tpl: string): string => tpl.replace(/\$(\d)/g, function (_x, g: string) { const v = (m as RegExpExecArray)[Number(g)]; return v === undefined ? '' : v; });
  re.lastIndex = 0;
  while ((m = re.exec(s))) {
    edits.push({ a: m.index, b: m.index + m[0].length, head: fill(repl.slice(0, k)), tail: fill(repl.slice(k + R.length)) });
    if (!m[0].length) re.lastIndex++; // as String.replace steps past an empty match
  }
  return edits;
}
// strip's steps on a view, in strip's order (a view has no lone surrogates, so wellFormed has nothing to do).
function stripView(v: View): View {
  v = edit(v, spanEdits(privateSpans(v.t)));
  v = edit(v, ruleEdits(v.t, PEM, R));
  for (const [rule, repl] of PATTERNS) v = edit(v, ruleEdits(v.t, rule, repl));
  return edit(v, spanEdits(entropySpans(v.t)));
}
// windowEdges' steps on a view.
function windowView(v: View): View {
  const o = orphanEnd(v.t);
  const w = o !== -1 ? edit(v, [{ a: 0, b: o, head: '', tail: '' }]) : v;
  return edit(w, spanEdits(base64Runs(w.t)));
}
function stripSnapshot(s: unknown): string { return redactEmbedded(goStripSnapshot(s)); }
function goStripSnapshot(input: unknown): string {
  const raw = String(input == null ? '' : input), shown = plainView(raw, true), merged: Span[] = [];
  const iv = stripView(windowView(rawView(raw))).red.concat(stripView(windowView(shown)).red, stripView(windowView(plainView(raw, false))).red);
  iv.sort(function (p, q) { return p[0] - q[0]; });
  for (const [a, b] of iv) {
    const top = merged[merged.length - 1];
    if (b <= a) continue; // written text only: nothing of the raw snapshot
    if (top && a <= top[1]) top[1] = Math.max(top[1], b);
    else merged.push([a, b]);
  }
  // the atom view, each run of units inside one merged interval written as one [REDACTED]
  const t = shown.t, lo = (i: number): number => shown.lo[i] as number, mg = (i: number): Span => merged[i] as Span;
  let out = '', from = 0, j = 0, k = 0;
  while (j < t.length) {
    while (k < merged.length && mg(k)[1] <= lo(j)) k++;
    if (k === merged.length || mg(k)[0] >= (shown.hi[j] as number)) { j++; continue; }
    out += t.slice(from, j) + R;
    while (j < t.length && lo(j) < mg(k)[1]) j++;
    from = j;
    k++;
  }
  return out + t.slice(from);
}

// Cut an already-scrubbed string to max UTF-16 units without splitting a surrogate pair; a cut
// string ends with '…'. Returns {text, cut}.
function cut(input: unknown, max: number): { text: string; cut: boolean } {
  const s = String(input == null ? '' : input);
  if (s.length <= max) return { text: s, cut: false };
  let n = Math.max(0, max - 1);
  const c = s.charCodeAt(n - 1);
  if (n > 0 && c >= 0xd800 && c <= 0xdbff) n--;
  return { text: s.slice(0, n) + '…', cut: true };
}

/** The scrubber Logs shows, copies, exports and sends to Explain through (its `go` ports are byte-equal with the agent's own scrub; the display pass adds redactEmbedded). */
export const HubLogsScrub = {
  REDACTED: R,
  strip,
  stripDeep: stripDeep as <T>(v: T) => T,
  stripSnapshot,
  windowEdges,
  plain,
  sources: SRC,
  embedded,
  /** The Go-equal ports alone, without the display pass (what the golden compares). */
  go: { strip: goStrip, stripDeep: goStripDeep, stripSnapshot: goStripSnapshot },
  embedSource,
  whole: WHOLE,
  jwtSpans,
  keyIsSensitive,
  byteCompare,
  put,
  privateTags: stripPrivateTags,
  entropy: stripHighEntropy,
  wellFormed,
  cut,
  re2,
};
