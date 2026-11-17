/**
 * HubLogsScrub (scrub.ts): the browser port of the agent's own
 * scrub.
 *   - Byte equality with the Go-generated golden the agent tree carries
 *     (hub-strip-golden.json, REGEN_GOLDENS=1 in the agent tree).
 *     A missing golden FAILS, it never skips; HOODY_AGENT_TREE points at another agent tree.
 *     Goldens v2 adds a hostile section: inputs a backtracking engine could take seconds on, each
 *     with the sha256 of Go's output, and 16x the input must cost at most 40x the time here (linear growth, never a wall-time budget).
 *   - The window-edge pre-pass for program-output snapshots (R-END, R-B64RUN): its own
 *     vectors, and it only ever adds redaction.
 *   - Scrub whole, then cut.
 */
import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it as test } from 'vitest';
import { monorepoPath } from '@core/test/monorepo';
import { HubLogsScrub as S } from './scrub';
import { norm as dataNorm } from './rules';

// Outside the monorepo there is no golden to compare with: the tests that need it are skipped. Inside it a missing file fails.
const AGENT = monorepoPath(process.env.HOODY_AGENT_TREE, 'hoody-kit', 'hoody-agent');
const GOLDEN = AGENT === null ? '' : AGENT + '/internal/daemon/memory/testdata/hub-strip-golden.json';
async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const R = '[REDACTED]';
// A fake AWS-style key id with one extra character, built from parts so no source line holds the whole shape.
const AKIA_Z = 'AKIA' + 'ABCDEFGHIJKLMNOPZ';

/** Go's json.Marshal key order (UTF-8 bytes = code points), for comparing deep-scrub results. */
function canon(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + (v as unknown[]).map(canon).join(',') + ']';
  const keys = Object.keys(v).sort((a, b) => {
    const x = [...a].map((c) => c.codePointAt(0)!), y = [...b].map((c) => c.codePointAt(0)!);
    for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return (x[i] as number) - (y[i] as number);
    return x.length - y.length;
  });
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canon((v as Record<string, unknown>)[k])).join(',') + '}';
}
const count = (s: string, sub: string) => s.split(sub).length - 1;

// Linear growth, not a wall-time budget (a fixed "under 100 ms" flaked on a loaded host). The same call runs on n and on
// 16n units of one shape; 16 times the input may cost at most GROWTH times the time (a linear scan about 16, a
// quadratic one about 256). With L and Q the linear and the quadratic cost at the smaller size the ratio is
// (16L + 256Q) / (L + Q), above 40 only when Q is more than a ninth of L: a quadratic term below that, even one that is
// already most of the larger run, passes by design, as does a uniformly slow linear scan. The two sizes are timed in
// turns (small first), best of 5 each, so a slowdown that lasts through the whole measurement reaches both about alike;
// a bias that holds on one size only can still tip a round. A failing first round is measured twice more and the middle
// ratio counts: an isolated stall passes for growth only if it repeats. A read under 0.5 ms counts as 0.5 ms and a fast
// call is repeated inside the timed block (see growthRound); detection assumes reads that long, which the real ones are
// (1 ms or more at the smaller size).
const SIZE_STEP = 16;
const GROWTH = 40;
const growthRound = (small: string, big: string, run: (s: string) => unknown): number => {
  // A call under 2 ms is repeated inside the timed block (up to 64 times, the same count for both sizes), so the
  // smaller read is long enough to show a quadratic term.
  run(small); run(big);
  const t0 = performance.now(); run(small);
  const reps = Math.min(64, Math.max(1, Math.ceil(2 / Math.max(performance.now() - t0, 0.01))));
  const timed = (s: string) => { const t = performance.now(); for (let r = 0; r < reps; r++) run(s); return performance.now() - t; };
  let a = Infinity, b = Infinity;
  for (let k = 0; k < 5; k++) { a = Math.min(a, timed(small)); b = Math.min(b, timed(big)); }
  return b / Math.max(a, 0.5);
};
/** Growth from big/16 to `big` units of the shape `build` makes. */
function growth(build: (n: number) => string, run: (s: string) => unknown, big: number): number {
  const small = build(Math.max(1, Math.floor(big / SIZE_STEP))), large = build(big);
  const first = growthRound(small, large, run);
  if (first <= GROWTH) return first;
  return [first, growthRound(small, large, run), growthRound(small, large, run)].sort((x, y) => x - y)[1] as number;
}
const linear = (what: string, ratio: number) => ({ what, growth: ratio <= GROWTH ? 'linear' : ratio });

describe.skipIf(AGENT === null)('golden: byte-equal with the agent\'s own scrubber', () => {
  test('the golden is present (a missing file is a failure, not a skip)', () => {
    expect(existsSync(GOLDEN)).toBe(true);
  });
  const g = existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, 'utf8')) : { strip: [], strip_deep: [], hostile: [], redacted: '' };

  test('the golden carries the vector sets (goldens v6 or later) and the same marker', () => {
    expect(g.redacted).toBe(S.REDACTED);
    expect(g.strip.length).toBeGreaterThanOrEqual(116); // 94 base vectors + 14 escape-aware ones + 8 trailing-backslash ones
    expect(g.strip.filter((c: { name: string }) => /^n1 (escaped|backslash|escape|port vector|continuation|unclosed)/.test(c.name)).length).toBeGreaterThanOrEqual(22);
    expect(g.strip_deep.length).toBeGreaterThanOrEqual(11);
    expect((g.hostile || []).length).toBeGreaterThanOrEqual(19);
  });

  for (const c of g.strip) {
    test(`strip: ${c.name}`, () => {
      expect(S.go.strip(c.in)).toBe(c.out);
    });
  }
  for (const c of g.strip_deep) {
    test(`strip deep: ${c.name}`, () => {
      const before = canon(c.in);
      expect(canon(S.go.stripDeep(c.in))).toBe(canon(c.out));
      expect(canon(c.in)).toBe(before); // the input is not changed
    });
  }

  for (const h of g.hostile || []) {
    test(`hostile: ${h.name} equals Go's output, and grows linearly with its size`, async () => {
      const input = h.prefix + h.unit.repeat(h.repeat) + h.suffix;
      const out = S.go.strip(input);
      expect({ len: out.length, sha: await sha256hex(out) }).toEqual({ len: h.out_len, sha: h.out_sha256 });
      // From a sixteenth of the golden size to the golden size (a short input has nothing to measure).
      if (h.repeat >= 8000) expect(linear(h.name, growth((n) => h.prefix + h.unit.repeat(n) + h.suffix, (s) => S.go.strip(s), h.repeat))).toEqual(linear(h.name, 1));
    });
  }

  test('strip is idempotent on every golden output', () => {
    for (const c of g.strip) expect(S.go.strip(c.out)).toBe(c.out);
  });
});

describe('semantics the port reproduces', () => {
  test('(?i) folds ſ and the Kelvin sign; \\b and \\s stay ASCII', () => {
    expect(S.re2('(?i)secret').test('\u017fecret')).toBe(true);
    expect(S.re2('(?i)key').test('\u212aey')).toBe(true);
    expect(S.re2('(?i)[a-z]+').exec('\u212a')?.[0]).toBe('\u212a');
    expect(S.re2('\\bkey').test('\u212akey')).toBe(true); // the Kelvin sign is not an ASCII word char
    expect(S.re2('\\bkey').test('akey')).toBe(false);
    expect(S.re2('(?i)\\w').test('\u017f')).toBe(true);
    expect(S.re2('\\w').test('\u017f')).toBe(false);
    expect(S.re2('(?i)[\\w.-]').test('\u212a')).toBe(true);
    expect(S.re2('x\\s').test('x\u00a0')).toBe(false);
    expect(S.re2('x\\s').test('x\u000b')).toBe(false);
    expect(S.re2('(?m)^a').test('x\ra')).toBe(false);
    expect(S.re2('(?m)^a').test('x\na')).toBe(true);
    expect(S.re2('a.b').test('a\rb')).toBe(true);
    expect(S.re2('a.b').test('a\nb')).toBe(false);
  });

  test('lone surrogates become U+FFFD before scrubbing, as Go\'s JSON decoding does', () => {
    expect(S.strip('a\uD800b')).toBe('a\uFFFDb');
    expect(S.strip('\uDC00 x \uD83D\uDE00')).toBe('\uFFFD x \uD83D\uDE00');
  });

  test('the pinned secrets are redacted', () => {
    const hbk = 'hbk_' + 'Ab3dE6gH9k'.repeat(4) + 'LmN';
    expect(S.strip(`x-api-key: ${hbk}`)).not.toContain('Ab3dE6gH9k');
    expect(S.stripDeep({ data: { authorization: 'Bearer abcdefghijklmnopqrstuvwxyz', bot_caller: 'key:ops' } })).toEqual({ data: { authorization: R, bot_caller: 'key:ops' } });
  });
});

describe('rules the golden leaves shadowed by a later or earlier rule', () => {
  const t20 = 'A1b2C3d4E5f6G7h8I9j0';
  test('sk-proj-, sk-ant-, sk-or- match glued to a word, where the \\b sk- rule cannot', () => {
    expect(S.strip('xsk-proj-' + t20)).toBe('x' + R);
    expect(S.strip('xsk-ant-' + t20)).toBe('x' + R);
    expect(S.strip('xsk-or-' + t20)).toBe('x' + R);
  });
  test('an env line whose name only ends in KEY', () => {
    expect(S.strip('DEPLOY_KEY=hunter2')).toBe('DEPLOY_KEY=' + R);
    expect(S.strip('  export DEPLOY_KEY=hunter2')).toBe('  export DEPLOY_KEY=' + R);
  });
  test('an Authorization header in the middle of a line', () => {
    expect(S.strip("curl -H 'Authorization: Basic Zm9vOmJhcg=='")).toBe("curl -H 'Authorization: " + R);
  });
  test('(?i) class ranges fold case and take \u017f', () => {
    expect(S.strip('POSTGRES://admin:hunter22@db1')).toBe('POSTGRES://admin:' + R + '@db1');
    expect(S.strip('pg\u017f://admin:hunter22@db1')).toBe('pg\u017f://admin:' + R + '@db1');
    expect(S.re2('(?m)a$').test('a\rb')).toBe(false);
    expect(S.re2('(?m)a$').test('a\nb')).toBe(true);
  });
  test('the entropy fallback needs strictly more than 4.5 bits per char', () => {
    const edge = 'ABCDEFGHIJKLMNOP' + 'abcdefgh' + 'abcdefgh'; // exactly 4.5 bits, 32 chars
    expect(S.strip('the key is ' + edge)).toBe('the key is ' + edge);
    expect(S.strip('the key is ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef')).toBe('the key is ' + R);
  });
  test('colliding secret keys get #2 in byte order of the original keys; null and numbers redact', () => {
    const z = 'Bearer ' + 'z'.repeat(24), a = 'Bearer ' + 'a'.repeat(24);
    expect(S.stripDeep({ [z]: 1, [a]: 2 })).toEqual({ ['Bearer ' + R]: 2, ['Bearer ' + R + '#2']: 1 });
    expect(S.stripDeep({ password: null, token: 7, enabled_auth: true })).toEqual({ password: R, token: R, enabled_auth: true });
  });
});

describe('program-output snapshots: window-edge rules before the port', () => {
  const b64 = (n: number, ch = 'A') => (ch + 'b3dE6gH9k+/'.repeat(Math.ceil(n / 11) + 1)).slice(0, n);
  const hbk = 'hbk_' + 'Zx9Qw3Er7T'.repeat(4) + 'yU1';

  test('R-END: an END marker whose BEGIN is outside the window redacts from the start through its line', () => {
    const snap = 'MIIEowIBAAKCAQEAfake\nbody==\n-----END RSA PRIVATE KEY-----\nserver listening on :8080';
    expect(S.stripSnapshot(snap)).toBe(R + '\nserver listening on :8080');
    expect(S.strip(snap)).toContain('MIIEowIBAAKCAQEAfake'); // the port alone cannot see it
  });

  test('R-END: a block cut mid-line at the window start, CRLF lines, PGP BLOCK labels', () => {
    expect(S.stripSnapshot('cut-line-tail==\r\nmore\r\n-----END OPENSSH PRIVATE KEY-----\r\nok')).toBe(R + '\nok'); // \r is dropped first
    expect(S.windowEdges('cut-line-tail==\r\nmore\r\n-----END OPENSSH PRIVATE KEY-----\r\nok')).toBe(R + '\r\nok'); // the rule alone keeps CRLF
    expect(S.stripSnapshot('xx\n-----END PGP PRIVATE KEY BLOCK----- trailing\nok')).toBe(R + '\nok');
  });

  test('R-END: a complete block inside the window is the port\'s (PEM rule), not R-END', () => {
    const snap = 'start line\n-----BEGIN EC PRIVATE\x20KEY-----\nabc\n-----END EC PRIVATE KEY-----\nafter';
    expect(S.windowEdges(snap)).toBe(snap);
    expect(S.stripSnapshot(snap)).toBe('start line\n' + R + '\nafter');
  });

  test('R-END: only the last orphan END counts, and a matched block after it is kept for the port', () => {
    const snap = 'a\n-----END RSA PRIVATE KEY-----\nb\n-----END RSA PRIVATE KEY-----\nc';
    expect(S.windowEdges(snap)).toBe(R + '\nc');
    const kept = 'b\n-----BEGIN RSA PRIVATE\x20KEY-----\nc\n-----END RSA PRIVATE KEY-----\nd';
    expect(S.windowEdges('a\n-----END RSA PRIVATE KEY-----\n' + kept)).toBe(R + '\n' + kept);
    expect(S.stripSnapshot('a\n-----END RSA PRIVATE KEY-----\n' + kept)).toBe(R + '\nb\n' + R + '\nd');
  });

  test('R-B64RUN: 3+ consecutive base64 lines of 40+ become one [REDACTED]; 2 do not', () => {
    const three = ['before', b64(64), b64(64, 'B'), b64(41, 'C'), 'after'].join('\n');
    expect(S.windowEdges(three)).toBe('before\n' + R + '\nafter');
    const two = ['before', b64(64), b64(64, 'B'), 'after'].join('\n');
    expect(S.windowEdges(two)).toBe(two);
    const short = [b64(39), b64(39, 'B'), b64(39, 'C')].join('\n');
    expect(S.windowEdges(short)).toBe(short);
    const crlf = [b64(50), b64(50, 'B'), b64(50, 'C'), 'x'].join('\r\n');
    expect(S.windowEdges(crlf)).toBe(R + '\r\nx');
  });

  test('R-B64RUN: a 64 KiB-split long line inside the snapshot is caught as a run', () => {
    const long = b64(3 * 65536);
    const split = [long.slice(0, 65536), long.slice(65536, 131072), long.slice(131072)].join('\n');
    expect(S.stripSnapshot('log start\n' + split + '\nlog end')).toBe('log start\n' + R + '\nlog end');
  });

  test('R-B64RUN false positives: hashes in prose and short or spaced lines stay', () => {
    const prose = [
      'commit 3f786850e387550fdab836ed7e6dc881de23001b merged',
      'sha256 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08 ok',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  file.txt',
      'short==',
    ].join('\n');
    expect(S.stripSnapshot(prose)).toBe(prose);
  });

  test('a fake hbk_ key and a PEM block across the window edge never survive', () => {
    const snap = 'Zm9vYmFy\n-----END PRIVATE KEY-----\nGET /v1/models?key=' + hbk + ' 200\n-----BEGIN RSA PRIVATE\x20KEY-----\nMIIEow';
    const out = S.stripSnapshot(snap);
    expect(out).not.toContain('Zm9vYmFy');
    expect(out).not.toContain('Zx9Qw3Er7T');
    expect(out).not.toContain('MIIEow');
  });

  test('the pre-pass only adds redaction: never fewer markers than the port alone', () => {
    const g = existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, 'utf8')) : { strip: [] };
    for (const c of g.strip) {
      expect(count(S.stripSnapshot(c.in), R)).toBeGreaterThanOrEqual(count(S.strip(c.in), R) > 0 ? 1 : 0);
      if (S.strip(c.in) !== c.in) expect(S.stripSnapshot(c.in)).not.toBe(c.in);
    }
  });
});

// ── a snapshot is plain text before any rule ──
describe('a snapshot is plain text before any rule: escapes and controls go, lines stay', () => {
  const b64 = (n: number, ch = 'A') => (ch + 'b3dE6gH9k+/'.repeat(Math.ceil(n / 11) + 1)).slice(0, n);

  test('plain: escapes dropped as sanitize.skipEscape scans them, a tab is a space, \\n stays, other controls go', () => {
    expect(S.plain('a\u001b[31mb\u001b[0m\tc\nd')).toBe('ab c\nd');
    expect(S.plain('x\u001b]0;title\u0007y\u001b]8;;http://h\u001b\\z')).toBe('xyz');
    expect(S.plain('p\u001bPq\u001b\\r\u001bXs\u001b\\t')).toBe('prt');
    expect(S.plain('a\u001b7b\u001b(Bc')).toBe('abBc'); // ESC plus one; the B is text, as Go scans it
    expect(S.plain('a\u001b[1;3')).toBe('a'); // unterminated runs go to the end
    expect(S.plain('a\u001b')).toBe('a');
    expect(S.plain('1\r\n2\u0000\u0008\u000b\u000c\u001f\u007f3')).toBe('1\n23');
    expect(S.plain('c1\u0080\u0085\u009b\u009fend')).toBe('c1end');
    expect(S.plain('b‮i⁦d‎i؜z')).toBe('bidiz');
    expect(S.plain('s\ud800u\udc00r😀')).toBe('sur😀');
    expect(S.plain('ünï ☃ 日本')).toBe('ünï ☃ 日本');
    expect(S.plain(null)).toBe('');
    expect(S.plain(42)).toBe('42');
  });

  test('a key split over two lines by an escape is whole again before strip: neither half survives', () => {
    const out = S.stripSnapshot('API_\u001b[31mKEY="first\nsecond"');
    expect(out).not.toContain('first');
    expect(out).not.toContain('second');
    expect(out).toBe('API_KEY=' + R);
  });

  test('window-edge rules see through escapes: a coloured orphan END, a coloured base64 run', () => {
    expect(S.stripSnapshot('MIIEfake\n-----END RSA \u001b[1mPRIVATE KEY-----\u001b[0m\nok')).toBe(R + '\nok');
    const run = [b64(64), b64(64, 'B'), b64(64, 'C')].map((l) => '\u001b[32m' + l + '\u001b[0m').join('\n');
    expect(S.stripSnapshot('before\n' + run + '\nafter')).toBe('before\n' + R + '\nafter');
  });
});

// ── the snapshot is scrubbed as it came and again made plain; the redactions are the union ──
describe('a snapshot loses nothing the raw text would have redacted', () => {
  const LEAKS: Array<[string, string, string[]]> = [
    ['an ESC before a private tag', '\u001b<private>synthetic-hidden-value</private>', ['synthetic-hidden-value']],
    ['an ESC before each PEM marker', '\u001b-----BEGIN PRIVATE\x20KEY-----\nfakebodyAAAA\n\u001b-----END PRIVATE KEY-----', ['fakebodyAAAA']],
    ['a CR inside a quoted value', 'API_KEY="first\\\r\\"middle\nsecond"', ['first', 'middle', 'second']],
    ['a NUL inside a quoted value', 'API_KEY="first\\\u0000\\"middle\nsecond"', ['first', 'middle', 'second']],
    ['an ESC before an orphan END', 'MIIEfake\nbody==\n\u001b-----END RSA PRIVATE KEY-----\nok', ['MIIEfake', 'body==']],
  ];
  test('what plain() alone would expose stays redacted', () => {
    for (const [, snap, gone] of LEAKS) {
      const out = S.stripSnapshot(snap);
      for (const g of gone) expect(out).not.toContain(g);
      expect(out).toContain(R);
    }
  });
  test('the plain-text pass still joins what an escape split', () => {
    expect(S.stripSnapshot('API_\u001b[31mKEY="first\nsecond"')).toBe('API_KEY=' + R);
    expect(S.stripSnapshot('API_\u001b[31mKEY="fir\\"st\nsecond"')).toBe('API_KEY=' + R);
  });
  test('[REDACTED] in the text, or next to an escape, is kept whole: plain never eats into a token', () => {
    expect(S.stripSnapshot('\u001b<private>x</private>')).toBe(R);
    expect(S.stripSnapshot('\u001b[REDACTED]')).toBe(R);
    expect(S.stripSnapshot('x\u001b[REDACTED]y')).toBe('x' + R + 'y');
    expect(S.stripSnapshot('a [REDACTED] b\u001b[1mc')).toBe('a ' + R + ' bc');
    expect(S.stripSnapshot('API_KEY="a[REDACTED]\u001b[0mb"')).toBe('API_KEY=' + R);
  });
  test('the output is plain text: no escape or control survives either pass', () => {
    for (const [, snap] of LEAKS) expect(S.stripSnapshot(snap)).toBe(S.plain(S.stripSnapshot(snap)));
    expect(S.stripSnapshot('ok\u001b[1m\tdone\r\n\u0007')).toBe('ok done\n');
  });
});

// ── one union of both views by raw spans; a marker is never a boundary ──
describe('a snapshot: every value either view redacts is absent, by value, not by a marker present', () => {
  // Both views read the text with its lone surrogates dropped, as plain() drops them: kept, U+FFFD would join
  // nothing an escape split, and a surrogate inside `-----BEGIN` would only make a public key an orphan END.
  const noLone = (s: string) => s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
  const asCame = (s: string) => S.strip(S.windowEdges(noLone(s))); // the view of the text as it came
  const madePlain = (s: string) => S.strip(S.windowEdges(S.plain(s))); // the view of the text made plain first
  const runs = (s: string) => [...new Set(s.match(/[A-Za-z0-9+/=_-]{6,}/g) || [])].filter((t) => t !== 'REDACTED');
  // Every 6+ character run of v that either view's output lost, and that the snapshot still shows (the word of
  // a marker in v is no value: the output writes its own).
  const kept = (v: string) => {
    const a = asCame(v), b = madePlain(v), out = S.stripSnapshot(v);
    return runs(v).filter((t) => (!a.includes(t) || !b.includes(t)) && out.includes(t));
  };
  const SPLIT = 'KEY="first\nsecond"';
  const VEC: Array<[string, string]> = [
    ['an OSC (BEL) holding a marker', 'API_\u001b]0;[REDACTED]\u0007' + SPLIT],
    ['an OSC (ESC \\) holding a marker', 'API_\u001b]0;[REDACTED]\u001b\\' + SPLIT],
    ['an OSC (BEL) holding a private tag', 'API_\u001b]0;<private>synthetic</private>\u0007' + SPLIT],
    ['an OSC (ESC \\) holding a private tag', 'API_\u001b]0;<private>synthetic</private>\u001b\\' + SPLIT],
    ['a CSI holding a private tag', 'API_\u001b[1;<private>x</private>m' + SPLIT],
    ['a lone high surrogate in the name', 'API_\ud800' + SPLIT],
    ['a lone low surrogate in the name', 'API_\udc00' + SPLIT],
    ['an ESC that eats a lone surrogate (plain reads it before dropping it)', 'API_\u001b\udc00' + SPLIT],
    ['an ESC before a private tag', '\u001b<private>synthetic-hidden-value</private>'],
    ['an ESC before a private tag a lone surrogate splits (only the raw view, surrogate dropped, has the tag)', '\u001b<priv\ud800ate>synthetic-hidden-value</private>'],
    ['an ESC before both PEM markers', '\u001b-----BEGIN PRIVATE\x20KEY-----\nfakebodyAAAA\n\u001b-----END PRIVATE KEY-----'],
    ['a CR inside a quoted value', 'API_KEY="first\\\r\\"middle\nsecond"'],
    ['a NUL inside a quoted value', 'API_KEY="first\\\u0000\\"middle\nsecond"'],
    ['an ESC before an orphan END', 'MIIEfake\nbody==\n\u001b-----END RSA PRIVATE KEY-----\nok'],
    ['an escape-split key', 'API_\u001b[31m' + SPLIT],
    ['an OSC opener a line rule ate, its terminator left behind', 'password: =</private> \u001b]8;;u\n\u001b\\hunter2value'],
    // A marker inside CSI parameters is no CSI final in the plain view, so only plain() reads the text
    ['a marker ending a CSI before a line-split value', 'prefix to\u001b[31mken="CANARY123\u001b[1;[REDACTED]\nCANARY456"'],
    ['a marker ending a CSI before a name another escape splits', '\u001b[1;[REDACTED]pass\u001b[31mword="UNIQUECANARY123\nSECONDVALUE456"'],
  ];
  test('these shapes, as they come and made plain: nothing either view removed shows', () => {
    for (const [name, v] of VEC) expect([name, kept(v)]).toEqual([name, []]);
  });
  test('a marker or a tag inside an OSC, or a lone surrogate, never splits the name from its value', () => {
    // (the CSI one ends at the `p` of the tag, so neither view has a key there; the vector above still holds it)
    for (const [name, v] of VEC.slice(0, 7)) if (!name.startsWith('a CSI')) expect([name, S.stripSnapshot(v)]).toEqual([name, 'API_KEY=' + R]);
    expect(S.stripSnapshot(VEC[4]![1])).toBe('API_' + R + 'm' + SPLIT);
    expect(S.stripSnapshot(VEC[7]![1])).toBe('API_KEY=' + R);
    // a CSI body swallows a marker whole, as it does any other character: the marker splits nothing
    expect(S.stripSnapshot('API_\u001b[1;[REDACTED]m' + SPLIT)).toBe('API_KEY=' + R);
  });
  test.skipIf(AGENT === null)('golden: with an ESC in front, on every line, a CSI in front, an OSC holding a marker, or a lone surrogate', () => {
    const g = existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, 'utf8')) : { strip: [] };
    expect(g.strip.length).toBeGreaterThan(0);
    let checked = 0;
    for (const c of g.strip) {
      const forms = ['\u001b' + c.in, c.in.split('\n').map((l: string) => '\u001b' + l).join('\n'), '\u001b[1m' + c.in,
        c.in.replace(/(.)/, '$1\u001b]0;[REDACTED]\u0007'), c.in.replace(/(.)/, '$1\ud800')];
      for (const v of forms) {
        expect([c.name, v, kept(v)]).toEqual([c.name, v, []]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });
  test('the escapes are parsed once, on the raw text: a redaction never moves where an escape ends', () => {
    // The OSC ends at the BEL inside the tag, as the plain view reads it. Written back over a redacted raw text it
    // would run on to the second BEL and join API_ to KEY, a text neither view saw.
    expect(S.stripSnapshot('API_\u001b]0;<private>\u0007</private>stuff\u0007' + SPLIT)).toBe('API_' + R + 'stuff' + SPLIT);
    // An interval wholly inside an escape shows nothing: the plain view never had that text.
    expect(S.stripSnapshot('a\u001b]0;<private>title</private>\u0007b')).toBe('ab');
  });
  test('the two views\' intervals merge: overlapping or touching ones show as one [REDACTED], apart ones as two', () => {
    // raw view: the tag; plain view (the ESC eats `<`): the line rule from `password:` through the end of the line
    expect(S.stripSnapshot('password: \u001b<private>x</private> tail\nok')).toBe('password: ' + R + '\nok');
    // raw view: the tag; plain view: the escape-split key; far apart
    expect(S.stripSnapshot('<private>x</private> mid API_\u001b[31m' + SPLIT)).toBe(R + ' mid API_KEY=' + R);
    // touching: the key block ends where the tag starts (strip writes two markers there)
    expect(S.stripSnapshot('-----BEGIN PRIVATE\x20KEY-----\nAAAA\n-----END PRIVATE KEY-----<private>x</private> ok')).toBe(R + ' ok');
    // apart: a tag, then a base64 run on the lines after it
    const b = 'QUJD'.repeat(12);
    expect(S.stripSnapshot('<private>x</private>\n' + b + '\n' + b + '\n' + b + '\nok')).toBe(R + '\n' + R + '\nok');
  });
  test('a plain line reads as strip writes it: the text before and after [REDACTED] stays', () => {
    for (const v of ['API_KEY="first\nsecond"', 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123', 'Bearer abcdefghijklmnopqrstuvwxyz0123 ok',
      'postgres://user:' + 'hunter2pass@db.local/app', '{"api_key": "a"}', 'x <private>y</private> z', 'my_token = "x\ny"\nnext=1']) {
      expect(S.stripSnapshot(v)).toBe(asCame(v));
    }
  });
  test('linear: long hostile snapshots finish quickly', () => {
    const shapes = ['x[REDACTED]\u001b', '\u001b]0;[REDACTED]', 'password=abc\n', 'API_KEY="a\nb" ', '<private>x</private>\u001b[31m', 'QUJD'.repeat(12) + '\n', '\ud800a'];
    for (const sh of shapes) {
      const t0 = performance.now();
      const out = S.stripSnapshot(sh.repeat(Math.ceil(200000 / sh.length)));
      expect(typeof out).toBe('string');
      expect(performance.now() - t0).toBeLessThan(3000);
    }
  });
});

// ── a third view, plain() itself, so a marker never changes where an escape ends ──
describe('a snapshot: what plain() alone redacts is absent too, whatever a marker does to an escape', () => {
  const A = 'prefix to\u001b[31mken="CANARY123\u001b[1;[REDACTED]\nCANARY456"';
  const B = '\u001b[1;[REDACTED]pass\u001b[31mword="UNIQUECANARY123\nSECONDVALUE456"';
  const CANARY = /CANARY|ANARY\d|NIQUE|ECONDVALUE|SECRETPART|ARTONE|ARTTWO/;
  test('the two marker-in-CSI shapes: no canary shows', () => {
    expect(S.stripSnapshot(A)).toBe('prefix token="' + R + '"');
    expect(S.stripSnapshot(A)).not.toMatch(CANARY);
    expect(S.stripSnapshot(B)).not.toMatch(CANARY);
    expect(S.stripSnapshot(B)).toContain(R);
  });
  // A marker right after CSI parameters, then a credential whose name another escape splits; and a marker inside
  // CSI parameters before a value split over a line break.
  const PARAMS = ['', '1;', '0;1;', '38;5;'];
  const NAME_ESC = ['\u001b[31m', '\u001b[0m', '\u001b]0;t\u0007', '\u001b]0;t\u001b\\'];
  const NAMES = [['pass', 'word'], ['API_', 'KEY'], ['to', 'ken'], ['client_', 'secret'], ['Author', 'ization: Bearer ']];
  const grid: string[] = [];
  for (const p of PARAMS) for (const e of NAME_ESC) for (const [n1, n2] of NAMES) {
    const val = n2!.endsWith(' ') ? 'SECRETPARTONE1234567890abcd' : '"SECRETPARTONE\nSECRETPARTTWO"';
    grid.push('\u001b[' + p + '[REDACTED]' + n1 + e + n2 + (n2!.endsWith(' ') ? '' : '=') + val);
    if (!n2!.endsWith(' ')) grid.push('x ' + n1 + e + n2 + '="SECRETPARTONE\u001b[' + p + '[REDACTED]\nSECRETPARTTWO"');
  }
  test('the CSI grid: a marker before a split name, or inside parameters before a split value', () => {
    expect(grid.length).toBeGreaterThan(100);
    expect(grid.filter((v) => CANARY.test(S.stripSnapshot(v)))).toEqual([]);
  });
  test('the window-edge rules run on each plain view: an orphan END only one of them shows', () => {
    // atom view only: the CSI runs past the marker to the `P`, so `-----END RSA RIVATE KEY-----` shows there;
    // plain() ends the CSI at the marker's `[` (`]` is no label character) and the raw text has the escape
    expect(S.stripSnapshot('MIIEfakesecretone\nbody==\n-----END RSA \u001b[1;[REDACTED]PRIVATE KEY-----\nok')).toBe(R + '\nok');
    // plain() only: the atom view's CSI eats the line break and the dashes, and the raw text has an escape in the label
    expect(S.stripSnapshot('MIIEfakesecrettwo\u001b[1;[REDACTED]\n-----END RSA \u001b[0mPRIVATE KEY-----\nok')).toBe(R + '\nok');
  });
  test('the union only adds redaction: plain() alone redacts at least this much', () => {
    const madePlain = (s: string) => S.strip(S.windowEdges(S.plain(s)));
    for (const v of [A, B, ...grid]) {
      const lost = (v.match(/[A-Za-z0-9]{6,}/g) || []).filter((t) => t !== 'REDACTED' && !madePlain(v).includes(t));
      for (const t of lost) expect([v, t, S.stripSnapshot(v).includes(t)]).toEqual([v, t, false]);
    }
  });
});

describe('scrub whole, then cut', () => {
  test('a secret straddling the cut is redacted before the cut, so no fragment survives', () => {
    const s = 'x'.repeat(2040) + ' Bearer abcdefghijklmnopqrstuvwxyz0123 tail';
    const c = S.cut(S.strip(s), 2048);
    expect(c.cut).toBe(true);
    expect(c.text.length).toBe(2048);
    expect(c.text.endsWith('\u2026')).toBe(true);
    expect(c.text).not.toContain('abcdefgh');
  });

  test('cut never splits a surrogate pair and leaves short text alone', () => {
    expect(S.cut('ab\uD83D\uDE00cd', 4)).toEqual({ text: 'ab\u2026', cut: true });
    expect(S.cut('abc', 3)).toEqual({ text: 'abc', cut: false });
  });
});

// ── the rules the agent gains ─────────
describe('rules: multiline, folded, percent-encoded and Vault secrets', () => {
  test('a quoted credential value that spans lines is redacted whole, through its quote or the end', () => {
    expect(S.strip('API_KEY="first\nsecond"')).toBe('API_KEY=' + R);
    expect(S.strip('API_KEY="first\nsecond" tail')).toBe('API_KEY=' + R); // the line rule then takes the rest of the line
    expect(S.strip('x API_KEY="first\nsecond", y')).toBe('x API_KEY=' + R + ', y');
    expect(S.strip("password: 'a\nb' ok")).toBe('password: ' + R);
    expect(S.strip('my_token = "x\ny\nz"\nnext=1')).toBe('my_token = ' + R + '\nnext=1');
    expect(S.strip('token="unclosed\nrest of it')).toBe('token=' + R);
    // One line: N1 stays out; the older rules decide as before.
    expect(S.strip('note: say "token" in a\nquote')).toBe('note: say "token" in a\nquote');
    expect(S.strip('{"api_key": "a"}')).toBe('{"api_key": "' + R + '"}');
  });

  test('folded header continuation lines (space or tab) go with Authorization and Cookie', () => {
    expect(S.strip('Authorization: Basic Zm9v\n OmJhcg==')).toBe('Authorization: ' + R);
    expect(S.strip('Proxy-Authorization: Basic a\r\n\tb\nnext')).toBe('Proxy-Authorization: ' + R + '\nnext');
    expect(S.strip('Cookie: a=b\r\n\tc=d\nnext')).toBe('Cookie: ' + R + '\nnext');
    expect(S.strip('Authorization: x\nnext: 1')).toBe('Authorization: ' + R + '\nnext: 1');
  });

  test('percent-encoded credential assignments, up to an encoded &', () => {
    expect(S.strip('next=%2F%3Faccess_token%3Dabc123%26x%3D1')).toBe('next=%2F%3Faccess_token%3D' + R + '%26x%3D1');
    expect(S.strip('password%3dhunter2&x=1')).toBe('password%3d' + R + '&x=1');
    expect(S.strip('q=client_secret%3Da%2Bb%3D%3D')).toBe('q=client_secret%3D' + R);
    expect(S.strip('token%3D')).toBe('token%3D');
  });

  test('Vault hvs. / hvb. / hvr. tokens', () => {
    expect(S.strip('hvs.CAESIJlU9JMYEhOPYv4igdhm9PnZDrab tail')).toBe(R + ' tail');
    expect(S.strip('x hvb.' + 'A'.repeat(24))).toBe('x ' + R);
    expect(S.strip('hvr.' + 'a'.repeat(23))).toBe('hvr.' + 'a'.repeat(23));
    expect(S.strip('hvr.' + 'a'.repeat(24))).toBe(R);
    expect(S.go.strip('xhvs.' + 'A'.repeat(30))).toBe('xhvs.' + 'A'.repeat(30)); // the agent's scrub wants a word boundary
    expect(S.strip('xhvs.' + 'A'.repeat(30))).toBe('xhvs.' + 'A'.repeat(30)); // glued to a letter: the embedded pass leaves it too
    expect(S.strip('x_hvs.' + 'A'.repeat(30))).toBe(R); // after '_' what the Logs show finds it
  });

  test('is not equivalent: the access_token= rule stops at a comma the later rule would keep', () => {
    expect(S.strip('GET /?access_token=short,tail')).toBe('GET /?access_token=' + R);
  });
});

describe('the URL and .env rules of goldens v2, linear on hostile text', () => {
  test('URL credentials: the scheme is the last 1–32 scheme characters before ://, with no word boundary', () => {
    expect(S.strip('see https://user:pa@ss@host/x and _ftp://a:b@c, Kx://a:b@c')).toBe('see https://user:' + R + '@host/x and _ftp://a:' + R + '@c, Kx://a:' + R + '@c');
    expect(S.strip('1http://u:pw@host/x')).toBe('1http://u:' + R + '@host/x');
    expect(S.strip('s'.repeat(40) + '://u:pw@host')).toBe('s'.repeat(40) + '://u:' + R + '@host');
    expect(S.strip('mongodb://a:' + 'b@h1,c:d@h2')).toBe('mongodb://a:' + R + '@h2'); // the password runs to the last @
    expect(S.strip('://u:pw@host')).toBe('://u:pw@host'); // no scheme character before ://
  });

  test('.env names: a stem that starts in the first 64 characters, or any name of 65 or more', () => {
    expect(S.strip('A'.repeat(64) + '_TOKEN=x')).toBe('A'.repeat(64) + '_TOKEN=' + R); // stem at 65: the long-name branch
    expect(S.strip('B'.repeat(64) + '=v1')).toBe('B'.repeat(64) + '=v1');
    expect(S.strip('B'.repeat(65) + '=v1')).toBe('B'.repeat(65) + '=' + R);
    expect(S.strip('export MY_' + 'X'.repeat(54) + 'KEY=v')).toBe('export MY_' + 'X'.repeat(54) + 'KEY=' + R);
    expect(S.strip('my_key=v')).toBe('my_key=v'); // lower case is the YAML rule's, which needs a non-space value
  });

  test('the line rules still take tab-, CR- and FF-indented lines', () => {
    expect(S.strip('\tFOO_KEY=abc')).toBe('\tFOO_KEY=' + R);
    expect(S.strip('x\n \t export BAR_TOKEN=abc')).toBe('x\n \t export BAR_TOKEN=' + R);
    expect(S.strip('\rpassword: abc def')).toBe('\rpassword: ' + R);
    expect(S.strip('\f my.secret = x y')).toBe('\f my.secret = ' + R);
  });

  test('hostile shapes grow linearly with their size', () => {
    // Each shape: its unit and how often the old budget test repeated it; here a sixteenth of that, then that.
    const shapes: Array<[string, number]> = [['a.', 50000], ['\n ', 25000], ['\n', 100000], ['Ab1+', 25000], [' \t\n\r\f', 20000], ['a-', 50000],
      ['cookie:', 14000], ['token="', 14000], ['token%3D', 12000], ['a://', 25000], ['hvs.', 25000]];
    for (const [unit, n] of shapes) {
      expect(linear(unit.slice(0, 8), growth((k) => unit.repeat(k), (s) => S.strip(s), n))).toEqual(linear(unit.slice(0, 8), 1));
    }
  });
});

// ── quoted values and continuations ─────────────────────────────────
// The earlier algorithms, kept here only as references for the single-pass forms.
function refPrivateTags(s: string): string {
  const low = s.replace(/[A-Z]/g, (c) => c.toLowerCase()), OPEN = '<private>', CLOSE = '</private>';
  if (low.indexOf(OPEN) === -1) return s;
  let out = '', i = 0;
  for (;;) {
    const open = low.indexOf(OPEN, i);
    if (open === -1) { out += s.slice(i); break; }
    out += s.slice(i, open) + R;
    let depth = 1, j = open + OPEN.length;
    while (depth > 0) {
      const no = low.indexOf(OPEN, j), nc = low.indexOf(CLOSE, j);
      if (nc === -1) { j = s.length; break; }
      if (no !== -1 && no < nc) { depth++; j = no + OPEN.length; } else { depth--; j = nc + CLOSE.length; }
    }
    i = j;
    if (i >= s.length) break;
  }
  return out;
}
function refEntropy(s: string): string {
  const toks: [number, number][] = [], kws: [number, number][] = [], re = /[A-Za-z0-9+/=_-]{32,}/g, kw = S.re2('(?i)(api[_-]?key|secret|token|password|passwd|credential|auth|\\bkey\\b)');
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) toks.push([m.index, m.index + m[0].length]);
  while ((m = kw.exec(s))) kws.push([m.index, m.index + m[0].length]);
  if (!toks.length || !kws.length) return s;
  const off = [0];
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); off.push((off[i] as number) + (c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c <= 0xdfff ? 2 : 3)); }
  const bits = (t: string) => { const f: Record<number, number> = {}; for (let i = 0; i < t.length; i++) f[t.charCodeAt(i)] = (f[t.charCodeAt(i)] || 0) + 1; let b = 0; for (const c of Object.keys(f).map(Number).sort((x, y) => x - y)) b -= ((f[c] as number) / t.length) * Math.log2((f[c] as number) / t.length); return b; };
  let out = '', last = 0;
  for (const t of toks) {
    const at = (i: number): number => off[i] as number;
    const near = kws.some((k) => (k[1] <= t[0] && at(t[0]) - at(k[1]) <= 40) || (t[1] <= k[0] && at(k[0]) - at(t[1]) <= 40) || (k[0] >= t[0] && k[0] < t[1]));
    if (!near || bits(s.slice(t[0], t[1])) <= 4.5) continue;
    out += s.slice(last, t[0]) + R;
    last = t[1];
  }
  return last === 0 ? s : out + s.slice(last);
}
function seeded(seed: number) {
  return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
}

describe('escape-aware N1, single-pass scanners, JSON __proto__ as a key', () => {
  test('an escaped quote does not end the value; an escape may carry the value over a later line', () => {
    expect(S.strip('API_KEY="first\\"\nsecond"')).toBe('API_KEY=' + R);
    expect(S.strip("token = 'a\\'\nb' tail")).toBe('token = ' + R);
    expect(S.strip('password="x\ny\\"z" next')).toBe('password=' + R);
    // Shared vectors with the Go scrubber, including a backslash-newline continuation.
    expect(S.strip('export API_KEY="first\\"part\nsecond"')).toBe('export API_KEY=' + R);
    expect(S.strip("token='a\\'b\nc' tail")).toBe('token=' + R);
    expect(S.strip('API_KEY="first\\\nsecond" tail')).toBe('API_KEY=' + R);
    expect(S.strip('password: "a\\\\"\nnext=1')).toBe('password: ' + R + '\nnext=1');
    expect(S.strip('API_KEY="c\\\nd\ne"\nok')).toBe('API_KEY=' + R + '\nok');
    expect(S.strip('API_KEY="a\\\rb\nc" ok\nnext')).toBe('API_KEY=' + R + '\nnext'); // \<CR> is an escape pair
    expect(S.strip("token='a\\\nb' tail")).toBe('token=' + R); // a continuation inside single quotes
    // An unclosed value ending in 0–3 backslashes: a final lone backslash is taken too (goldens v6).
    for (const q of ['"', "'"]) for (let n = 0; n <= 3; n++) {
      expect([q, n, S.strip('API_KEY=' + q + 'first\nsecond' + '\\'.repeat(n))]).toEqual([q, n, 'API_KEY=' + R]);
    }
    // Escapes after the first line break, with the closing quote lines later.
    expect(S.strip('API_KEY="a\nb\\"\nc"\nok')).toBe('API_KEY=' + R + '\nok');
    expect(S.strip("API_KEY='a\nb\\'\nc'\nok")).toBe('API_KEY=' + R + '\nok');
    expect(S.strip('my_secret: "a\nb\\\nc" ok')).toBe('my_secret: ' + R);
    // `\\"` is an escaped backslash, then the closing quote: no newline inside, so N1 stays out.
    expect(S.strip('secret="a\\\\"\nb"')).toBe('secret=' + R + '\nb"');
    expect(S.strip('x token = "two words" y\nz')).toBe('x token = "two words" y\nz'); // goldens v3
    expect(S.strip("x token = 'two words' y\nz")).toBe("x token = 'two words' y\nz"); // the same for '
    // An escape before a character RE2 does not count as a space but JS does (\v, NBSP).
    expect(S.strip('API_KEY="a\nb\\\u000bc\\\u00a0d" ok')).toBe('API_KEY=' + R);
  });

  test('re2: \\S inside a class is every character RE2 does not count as a space', () => {
    const any = S.re2('^[\\s\\S]$'), not = S.re2('^[\\S]$'), neg = S.re2('^[^\\S]$');
    for (const c of ['a', '"', '\\', '\n', '\t', ' ', '\u000b', '\u00a0', '\u2028', '\ufeff', '\u3000']) {
      expect([c, any.test(c)]).toEqual([c, true]);
      any.lastIndex = 0;
    }
    const rows = ['a', ' ', '\t', '\u000b', '\u00a0', '\u2003', '\ufeff'].map((c) => {
      const r = [not.test(c), neg.test(c)]; not.lastIndex = 0; neg.lastIndex = 0; return r;
    });
    expect(rows).toEqual([[true, false], [false, true], [false, true], [true, false], [true, false], [true, false], [true, false]]);
  });

  test('stripPrivateTags in one pass: equal to the earlier scanner on generated text, linear on nested tags', () => {
    const r = seeded(5), parts = ['<private>', '</private>', '<PRIVATE>', '</Private>', 'a', ' ', '\n', '<priv', 'ate>', '</', 'x<private>y'];
    for (let i = 0; i < 4000; i++) {
      let s = ''; const n = Math.floor(r() * 12);
      for (let j = 0; j < n; j++) s += parts[Math.floor(r() * parts.length)];
      expect(S.privateTags(s)).toBe(refPrivateTags(s));
    }
    // 32,000 opening tags, then 32,000 closing tags (608,000 bytes); growth from a sixteenth of it, through
    // the scanner alone (nothing else to hide a quadratic term in) and through the whole strip.
    const nested = (k: number) => '<private>'.repeat(k) + '</private>'.repeat(k) + ' after';
    const opening = (k: number) => '<private>'.repeat(k);
    expect(S.privateTags(nested(32000))).toBe(R + ' after');
    for (const [what, build, n] of [['nested tags', nested, 32000], ['opening tags only', opening, 60000]] as const) {
      expect(linear(`${what}, scanner`, growth(build, (s) => S.privateTags(s), n))).toEqual(linear(`${what}, scanner`, 1));
      expect(linear(`${what}, strip`, growth(build, (s) => S.strip(s), n))).toEqual(linear(`${what}, strip`, 1));
    }
  });

  test('the entropy fallback with one cursor: equal to the earlier scan on generated text, linear on many keywords', () => {
    // Tokens: 32–40 distinct base64 characters (5+ bits/char), now and then one with a keyword
    // inside or a low-entropy run; the gaps between parts are 0–60 bytes, around the 40-byte bound.
    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const r = seeded(9), tok = () => {
      const at = Math.floor(r() * 64), len = 32 + Math.floor(r() * 9), x = r();
      const t = (B64 + B64).slice(at, at + len);
      return x < 0.1 ? t.slice(0, 16) + 'auth' + t.slice(16) : x < 0.2 ? 'Z'.repeat(len) : t;
    };
    const kw = ['auth', 'key', 'token', 'API_KEY', 'Secret', 'mykey', 'keyboard'], gap = ['', ' ', '=', 'é', '日本', '\n', ' x ', '----'];
    const pad = () => ' '.repeat(Math.floor(r() * 61));
    for (let i = 0; i < 3000; i++) {
      let s = ''; const n = 1 + Math.floor(r() * 8);
      for (let j = 0; j < n; j++) {
        const x = r();
        s += (x < 0.45 ? tok() : x < 0.85 ? kw[Math.floor(r() * kw.length)] : gap[Math.floor(r() * gap.length)]) + (r() < 0.5 ? pad() : ' ');
      }
      expect(S.entropy(s)).toBe(refEntropy(s));
    }
    // Each side alone, at and past the 40-byte bound.
    const T = B64.slice(0, 33);
    expect(S.entropy(T + ' '.repeat(40) + 'auth')).toBe(R + ' '.repeat(40) + 'auth');
    expect(S.entropy(T + ' '.repeat(41) + 'auth')).toBe(T + ' '.repeat(41) + 'auth');
    expect(S.entropy('auth' + ' '.repeat(40) + T)).toBe('auth' + ' '.repeat(40) + R);
    expect(S.entropy('auth' + ' '.repeat(41) + T)).toBe('auth' + ' '.repeat(41) + T);
    expect(S.entropy('auth ' + ' '.repeat(60) + T.slice(0, 16) + 'token' + T.slice(16))).toBe('auth ' + ' '.repeat(60) + R);
    // The same at half size: many `auth ` keywords, a separator, many 32-character tokens
    // (about 300 KB; the earlier scan took ~0.8 s here and 3.2 s at full size); growth from a sixteenth of
    // it (1,875 keywords, 281 tokens), through the scanner alone and through the whole strip.
    const shape = 'auth '.repeat(30000) + '|' + 'aB3dE5gH7jK9mN1pQ3sT5vX7zA9cE1gI '.repeat(4500);
    const shapeAt = (k: number) => 'auth '.repeat(1875 * k) + '|' + 'aB3dE5gH7jK9mN1pQ3sT5vX7zA9cE1gI '.repeat(281 * k);
    expect(linear('keywords then tokens, scanner', growth(shapeAt, (s) => S.entropy(s), 16))).toEqual(linear('keywords then tokens, scanner', 1));
    expect(linear('keywords then tokens, strip', growth(shapeAt, (s) => S.strip(s), 16))).toEqual(linear('keywords then tokens, strip', 1));
    expect(S.entropy(shape.slice(149000, 152000))).toBe(refEntropy(shape.slice(149000, 152000)));
  });

  test('strip deep keeps a JSON "__proto__" key as an own key, never as the prototype', () => {
    const d = S.stripDeep(JSON.parse('{"a":{"__proto__":{"big":"x"}},"__proto__":"y","b":{"__proto__":{"token":"t"}}}'));
    expect(Object.keys(d)).toEqual(['a', '__proto__', 'b']);
    // The prototype stays the sandbox's Object.prototype: nothing is inherited from the payload.
    expect(Object.getPrototypeOf(Object.getPrototypeOf(d))).toBe(null);
    expect(Object.getPrototypeOf(Object.getPrototypeOf(d.a))).toBe(null);
    expect(d.a.big).toBeUndefined();
    expect(Object.keys(d.a)).toEqual(['__proto__']);
    expect(JSON.stringify(d)).toBe('{"a":{"__proto__":{"big":"x"}},"__proto__":"y","b":{"__proto__":{"token":"' + R + '"}}}');
  });
});

// The agent's scrub wants a word boundary (and, for AWS, no [0-9A-Z] after
// the key), so copy_AKIA…Z passed it. strip, stripDeep and stripSnapshot (the only calls the Logs files make) add a
// pass that finds every credential format inside a word wherever no letter or digit is right before it (after '_', '-',
// '.'), in either case, and replaces the whole token.
const EMBEDDED_SAMPLES: Record<string, string> = {
  'sk-proj-': 'sk-proj-' + 'a1'.repeat(12),
  'sk-': 'sk-A' + 'b2'.repeat(10),
  'sk-ant-': 'sk-ant-' + 'x'.repeat(24),
  'hdy_': 'hdy_' + 'A'.repeat(24) + '_' + 'b'.repeat(20),
  'hbk_': 'hbk_' + 'c'.repeat(30),
  'ghp_': 'ghp_' + 'd'.repeat(36),
  'github_pat_': 'github_pat_' + 'e'.repeat(24),
  'xoxb-': 'xoxb-' + '1'.repeat(12),
  'AKIA': 'AKIA' + 'ABCDEFGHIJKLMNOP',
  'AIza': 'AIza' + 'f'.repeat(35),
  'eyJ': 'eyJ' + 'g'.repeat(12) + '.' + 'h'.repeat(12) + '.' + 'i'.repeat(12),
  'npm_': 'npm_' + 'j'.repeat(36),
  'glpat-': 'glpat-' + 'k'.repeat(20),
  'dop_v1_': 'dop_v1_' + 'l'.repeat(64),
  'sk_live_': 'sk_live_' + 'm'.repeat(12),
  'SG.': 'SG.' + 'n'.repeat(32),
  'SK': 'SK' + '0123456789abcdef'.repeat(2),
  'sk-or-': 'sk-or-' + 'o'.repeat(20),
  'hf_': 'hf_' + 'p'.repeat(20),
  'hvs.': 'hvs.' + 'q'.repeat(24),
  'xapp-': 'xapp-1-A0B1C2-123456-' + 'r'.repeat(20),
  'whsec_': 'whsec_' + 's'.repeat(24),
  'bot token': '123456789:' + 't'.repeat(35),
  'discord bot': 'M' + 'u'.repeat(23) + '.' + 'v'.repeat(6) + '.' + 'w'.repeat(27),
};

describe('a credential inside a word is redacted in everything the Logs show', () => {
  test('every credential-format rule has a sample here, and its embedded form matches it', () => {
    expect(S.whole.length).toBe(Object.keys(EMBEDDED_SAMPLES).length);
    for (const src of S.whole) {
      const re = S.re2(S.embedSource(src), '');
      expect([src, Object.values(EMBEDDED_SAMPLES).some((k) => re.test('copy_' + k + 'Z'))]).toEqual([src, true]);
    }
  });

  test('the embedded forms keep no guard: no \\b, no lookaround, no final $ or \\z, case ignored', () => {
    for (const src of S.whole) {
      const e = S.embedSource(src);
      expect([src, /(^|[^\\])(\\\\)*\\[bz]/.test(e), /\(\?[=!<]/.test(e), /\$\)?$/.test(e), e.startsWith('(?i)') || /^\(\?[a-z]*i[a-z]*\)/.test(e)])
        .toEqual([src, false, false, false, true]);
    }
  });

  // Gone = no embedded credential is left and the key's own tail is absent; the agent's scrub may already have taken the
  // part after a prefix (copy_[REDACTED]), which is fine, and the display pass takes a token whole.
  function gone(out: string, v: string) {
    return !S.embedded(out) && !out.toLowerCase().includes(v.slice(-10).toLowerCase());
  }
  for (const [name, k] of Object.entries(EMBEDDED_SAMPLES)) {
    test(`${name}: glued into a word, either case, no part of it is left (strip, stripDeep, stripSnapshot)`, () => {
      for (const v of [k, k.toUpperCase(), k.toLowerCase()]) {
        const a = S.strip('x copy_' + v + 'Z y');
        expect([v, gone(a, v), a.startsWith('x ') && a.endsWith(' y') && a.includes(R)]).toEqual([v, true, true]);
        const b = S.strip('deploy/copy_' + v + 'Z.js');
        expect([v, gone(b, v), b.startsWith('deploy/')]).toEqual([v, true, true]);
        const c = S.strip('"name":"svc_' + v + '_prod"');
        expect([v, gone(c, v), c.startsWith('"name":"')]).toEqual([v, true, true]);
        const d = S.stripSnapshot('one\nrun copy_' + v + 'Z ok\nthree');
        expect([v, gone(d, v), d.split('\n').length, d.startsWith('one\nrun ') && d.endsWith(' ok\nthree')]).toEqual([v, true, 3, true]);
        const e = S.stripDeep({ msg: 'a copy_' + v + 'Z b', n: 1, attrs: { list: ['x-' + v + 'z'] } });
        expect([v, gone(JSON.stringify(e), v), e.n]).toEqual([v, true, 1]);
        expect(S.embedded('copy_' + v + 'Z')).toBe(true);
      }
    });
  }
  test('a token the port did not touch is replaced whole', () => {
    expect(S.strip(`x copy_${AKIA_Z} y`)).toBe('x ' + R + ' y');
    expect(S.strip('x COPY_SK-PROJ-' + 'A1'.repeat(12) + ' y')).toBe('x ' + R + ' y');
    expect(S.strip('deploy/build_GHP_' + 'D'.repeat(36) + 'x.js')).toBe('deploy/' + R);
    expect(S.stripDeep({ m: `a x.${AKIA_Z} b`, l: ['copy_hvs.' + 'q'.repeat(24)] })).toEqual({ m: 'a ' + R + ' b', l: [R] });
  });

  test('the Go-parity port is unchanged: copy_AKIA…Z still passes it (that is why the pass exists)', () => {
    expect(S.go.strip(`x copy_${AKIA_Z} y`)).toBe(`x copy_${AKIA_Z} y`);
    expect(S.strip(`x copy_${AKIA_Z} y`)).toBe('x ' + R + ' y');
    expect(S.go.stripSnapshot(`x copy_${AKIA_Z} y`)).toBe(`x copy_${AKIA_Z} y`);
    expect(S.go.stripDeep({ m: `x copy_${AKIA_Z} y` })).toEqual({ m: `x copy_${AKIA_Z} y` });
  });

  test('a key holding a credential is redacted too', () => {
    const d = S.stripDeep({ ['copy_' + EMBEDDED_SAMPLES.AKIA + 'Z']: 'v' });
    expect(Object.keys(d)).toEqual([R]);
  });

  test('ordinary text is left alone, and the pass only ever adds redaction', () => {
    for (const s of ['hoody-agent started on port 8080', 'GET /api/v1/users/[id].js 200', 'password=hunter2', 'sk-short', 'AKIA1234', 'task-runner', 'skill loaded']) {
      expect(S.strip(s)).toBe(S.go.strip(s));
    }
    const golden = existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, 'utf8')).strip : [];
    for (const c of golden) {
      const go = S.go.strip(c.in), shown = S.strip(c.in);
      if (shown !== go) {
        expect([c.name, S.embedded(go)]).toEqual([c.name, true]);
        expect([c.name, S.embedded(shown)]).toEqual([c.name, false]);
      }
    }
  });

  test('strip is idempotent and leaves no embedded credential', () => {
    for (const k of Object.values(EMBEDDED_SAMPLES)) {
      const once = S.strip('a copy_' + k + 'Z b/' + k.toLowerCase() + '.txt');
      expect(S.strip(once)).toBe(once);
      expect(S.embedded(once)).toBe(false);
    }
  });

  test('kebab-case names stay as they are: a format counts only when no letter or digit is right before it', () => {
    for (const n of ['desk-booking-service-production', 'break-glass-procedure-started', 'backpack-image-resizer-worker', 'task-runner-nightly-cleanup-job']) {
      expect(S.embedded(n)).toBe(false);
      expect(S.strip('started ' + n + ' on 8080')).toBe('started ' + n + ' on 8080');
      expect(S.stripSnapshot(n + '\nok')).toBe(n + '\nok');
      expect(S.stripDeep({ [n]: n })).toEqual({ [n]: n });
    }
    // after a separator or at the start it is a key
    expect(S.strip('x-sk-' + 'a'.repeat(24))).toBe('x-' + R); // the agent's scrub's \b already holds after '-'
    expect(S.strip('x_ak-' + 'a'.repeat(24))).toBe(R);
    expect(S.strip('sk-' + 'a'.repeat(24))).toBe(R);
  });

  test('known limit: a key glued to a letter or digit (xAKIA…, 9AKIA…) is not found inside the word', () => {
    expect(S.embedded(`x${AKIA_Z}`)).toBe(false);
    expect(S.strip(`x${AKIA_Z}`)).toBe(`x${AKIA_Z}`);
    expect(S.strip('9akiaabcdefghijklmnopz')).toBe('9akiaabcdefghijklmnopz');
    expect(S.strip(`x_${AKIA_Z}`)).toBe(R);
  });

  test('the hostile golden inputs grow linearly through the display strip', () => {
    const g = existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, 'utf8')) : { hostile: [] };
    for (const h of g.hostile || []) {
      if (h.repeat < 8000) continue;
      expect(linear(h.name, growth((n) => h.prefix + h.unit.repeat(n) + h.suffix, (s) => S.strip(s), h.repeat))).toEqual(linear(h.name, 1));
    }
  });
});

// ── the JWT rule in linear time ────────────────────────────────────────────────
// The agent's JWT rule as a RegExp is quadratic in a backtracking engine (every eyJ rescans the rest of its run):
// the Go-parity port took 2.8 s on 64 KiB of 'eyJ_', its case-insensitive embedded copy as long on 'EYJ_'. Both run
// jwtSpans now, one walk over the runs. The rule's RegExp stays the reference: on short texts the scanner must find
// exactly its matches, in the port (RE2's meaning) and in the embedded form (any case).
describe('the JWT rule is one linear scanner with the RegExp\'s matches', () => {
  const JWT = S.sources.filter((src: string) => src.startsWith('eyJ'));
  const goRe = S.re2(JWT[0] as string), embedRe = new RegExp('(?<![A-Za-z0-9])(?:' + S.re2(S.embedSource(JWT[0] as string), '').source + ')', 'g');
  const spans = (re: RegExp, s: string) => [...s.matchAll(re)].map((m) => [m.index!, m.index! + m[0].length]);
  // A fixed-seed generator, so a failure names a text that fails again.
  function texts(n: number, seed: number) {
    const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % k; };
    const cls = 'Ab9_-xſKeyJ', heads = ['eyJ', 'EYJ', 'eyj', 'EyJ', 'eYj', 'ey', 'eJ', ''];
    const seps = ['.', '.', '.', '_', '-', ' ', '..', ''], pre = ['', '', 'x', '9', '_', '-', '.', ' ', 'ſ', 'K', 'eyJ'];
    const run = (k: number) => { let r = ''; for (let j = 0; j < k; j++) r += cls[rnd(cls.length)]!; return r; };
    const out: string[] = [];
    for (let t = 0; t < n; t++) {
      let s = '';
      for (let i = 1 + rnd(4); i > 0; i--) {
        s += pre[rnd(pre.length)]! + heads[rnd(heads.length)]! + run(7 + rnd(6)) + seps[rnd(seps.length)]! + run(8 + rnd(5)) +
          seps[rnd(seps.length)]! + run(8 + rnd(5)) + pre[rnd(pre.length)]!;
      }
      out.push(s);
    }
    return out;
  }

  test('one source in the port is the JWT rule, and it is a credential format (WHOLE)', () => {
    expect(JWT).toEqual(['eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}']);
    expect(S.whole).toContain(JWT[0]);
  });

  test('the scanner finds exactly the RegExp\'s matches: 60,000 generated texts, port and embedded form', () => {
    let matched = 0;
    for (const s of texts(60000, 7)) {
      const go = spans(goRe, s), em = spans(embedRe, s);
      if (go.length || em.length) matched++;
      expect([s, S.jwtSpans(s, false)]).toEqual([s, go]);
      expect([s, S.jwtSpans(s, true)]).toEqual([s, em]);
    }
    expect(matched).toBeGreaterThan(5000); // the generator does make tokens
  });

  test('the scanner on the cases that decide it', () => {
    const t = 'eyJ' + 'a'.repeat(10) + '.' + 'b'.repeat(10) + '.' + 'c'.repeat(10);
    const cases: [string, number[][], number[][]][] = [
      [t, [[0, 35]], [[0, 35]]],
      ['x' + t, [[1, 36]], []], // glued to a letter: the port's rule has no \b; the embedded pass skips it
      ['x_' + t.toUpperCase(), [], [[2, 37]]], // any case only in the embedded form
      ['eyJ' + 'a'.repeat(9) + '.' + 'b'.repeat(10) + '.' + 'c'.repeat(10), [], []], // 9 after eyJ
      [t.slice(0, 34), [], []], // a third run of 9
      ['eyJ' + 'a'.repeat(10) + '.' + 'b'.repeat(9) + '.' + 'c'.repeat(10), [], []],
      ['eyJ' + 'a'.repeat(10) + '..' + 'b'.repeat(10) + '.' + 'c'.repeat(10), [], []],
      ['eyJeyJ' + 'a'.repeat(10) + '.' + 'b'.repeat(10) + '.' + 'c'.repeat(10), [[0, 38]], [[0, 38]]], // the leftmost eyJ
      ['ab-eyJ' + 'a'.repeat(10) + '.' + 'b'.repeat(10) + '.' + 'c'.repeat(10), [[3, 38]], [[3, 38]]],
      ['abeyJ' + 'a'.repeat(10) + '.' + 'b'.repeat(10) + '.' + 'c'.repeat(10), [[2, 37]], []],
      [t + '.' + t.slice(3), [[0, 35]], [[0, 35]]], // no overlap: the match resumes after its third run
      ['eyJ' + 'a'.repeat(10) + '.eyJ' + 'b'.repeat(10) + '.' + 'c'.repeat(10) + '.' + 'd'.repeat(10), [[0, 38]], [[0, 38]]],
      ['eyJ' + 'a'.repeat(10) + '.x.' + t, [[16, 51]], [[16, 51]]], // a failed run leaves the next one to start
      ['ſ' + t.replace('a', 'K'), [], [[1, 36]]],
    ];
    for (const [s, go, em] of cases) {
      expect([s, S.jwtSpans(s, false), S.jwtSpans(s, true)]).toEqual([s, go, em]);
      expect([s, spans(goRe, s), spans(embedRe, s)]).toEqual([s, go, em]);
    }
    expect(S.go.strip('a ' + t + ' b')).toBe('a ' + R + ' b');
    expect(S.strip('a copy_' + t.toUpperCase() + 'Z b')).toBe('a ' + R + ' b');
  });

  // Each call, best of 3, against the same call on ordinary text of the same size: the JWT shapes may cost at most
  // 5× that plus 100 ms, slack for a loaded host (the old RegExp: seconds at 64 KiB, minutes at 512 KiB). An absolute 50 ms cannot hold at
  // 512 KiB: ordinary text alone takes the 34 rules longer than that on a loaded host. All 64 KiB shapes run before
  // any 512 KiB one, so a quadratic build fails in seconds instead of hanging.
  const KiB = 1024;
  const PATHS: Record<string, (s: string) => unknown> = {
    strip: (s) => S.strip(s),
    stripDeep: (s) => S.stripDeep({ msg: s, id: 1 }),
    stripSnapshot: (s) => S.stripSnapshot(s),
    norm: (s) => dataNorm({ id: 1, message: s }),
  };
  const best3 = (f: () => unknown) => { let b = Infinity; for (let k = 0; k < 3; k++) { const t0 = performance.now(); f(); b = Math.min(b, performance.now() - t0); } return b; };
  const fill = (unit: string, bytes: number) => unit.repeat(Math.ceil(bytes / unit.length)).slice(0, bytes);
  const SHAPES = ['EYJ_', 'eyJ_', 'eyJ-', 'EyJ_', 'eYj-', 'eyj_', 'EYJ-'];
  // Near misses: a run one short, a segment one short, a missing or doubled separator, glued heads, all repeated.
  const NEAR = ['eyJ' + 'A'.repeat(9) + '.', 'EYJ' + 'A'.repeat(10) + '.', 'eyJ' + 'A'.repeat(10) + '.' + 'b'.repeat(9) + '.',
    'eyJ' + 'A'.repeat(10) + '.' + 'b'.repeat(10) + '..', 'eyJ' + 'A'.repeat(12), 'xeyJ_', '_eYj-', 'eyJ.', 'eyJ_.', 'eyJ-eyJ.',
    'A.', 'Ab.', 'eyJ' + 'a'.repeat(10) + '.' + 'b'.repeat(10), 'EyJ' + 'a'.repeat(10) + '.' + 'b'.repeat(10) + '.'];
  for (const size of [64 * KiB, 512 * KiB]) {
    for (const [name, call] of Object.entries(PATHS)) {
      test(`${name}: ${size / KiB} KiB of each JWT shape and near miss costs no more than ordinary text (best of 3)`, () => {
        const base = best3(() => call(fill('abcd', size)));
        for (const u of [...SHAPES, ...NEAR]) {
          const ms = best3(() => call(fill(u, size)));
          expect([u, ms <= 5 * base + 100 ? 'linear' : ms]).toEqual([u, 'linear']);
        }
        // a lone head at the end of many runs that a '.' follows: one search for it, not one per run
        const ms = best3(() => call(fill('A.', size - 3) + 'eyJ'));
        expect(['A.…eyJ', ms <= 5 * base + 100 ? 'linear' : ms]).toEqual(['A.…eyJ', 'linear']);
      }, 300000);
    }
    test(`the Go-parity port: ${size / KiB} KiB of each JWT shape costs no more than ordinary text`, () => {
      const base = best3(() => S.go.strip(fill('abcd', size)));
      for (const u of [...SHAPES, ...NEAR]) {
        const ms = best3(() => S.go.strip(fill(u, size)));
        expect([u, ms <= 5 * base + 100 ? 'linear' : ms]).toEqual([u, 'linear']);
      }
    }, 300000);
  }

  test('a 300 KB base64url JSON array (many eyJ, no dot) stays linear through strip and the port', () => {
    const b = btoa(JSON.stringify(Array.from({ length: 20000 }, (_, i) => ({ a: i })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(b.length).toBeGreaterThan(300000);
    const base = best3(() => S.strip(fill('abcd', b.length)));
    expect(best3(() => S.strip(b)) <= 5 * base + 100 ? 'linear' : 'slow').toBe('linear');
    expect(best3(() => S.go.strip(b)) <= 5 * base + 100 ? 'linear' : 'slow').toBe('linear');
  }, 300000);

  test.skipIf(AGENT === null)('the goldens hold with no change: the hostile section and every Strip vector, through the scanner', () => {
    const g = existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, 'utf8')) : null;
    expect(g).not.toBe(null);
    for (const c of g.strip) expect([c.name, S.go.strip(c.in)]).toEqual([c.name, c.out]);
  });
});

// A sweep of every rule as the module runs it, the 49 of the
// Go-parity port and the 24 embedded forms, on 30 credential prefixes (as written and upper case) times 5 fillers,
// repeated 8000 times. Every one must stay under 100 ms (best of 3 once a first try passes 30 ms); the quadratic
// RegExp took over a second here. A rule the module runs as a scanner (the JWT rule) is timed as that scanner.
describe('guard: no rule is superlinear on repeated credential prefixes', () => {
  const PRE = ['eyJ', 'sk-', 'pk-', 'sk-proj-', 'sk-ant-', 'sk-or-', 'hdy_', 'hbk_', 'ghp_', 'github_pat_', 'xoxb-', 'AKIA', 'AIza', 'npm_',
    'glpat-', 'dop_v1_', 'sk_live_', 'SG.', 'SK', 'hf_', 'hvs.', 'AccountKey=', 'Bearer ', 'token=', 'password=', 'a.b.',
    'xapp-1-', 'whsec_', '123456789:', 'hooks.slack.com/services/T'];
  const MID = ['A_', 'a-', 'A.', 'A', 'a1'];
  const N = 8000;
  const JWT = S.sources.find((src: string) => src.startsWith('eyJ'));
  function slow(run: (s: string) => unknown, prefixes: string[]) {
    const out: string[] = [];
    for (const p of prefixes) {
      for (const m of MID) {
        const s = (p + m).repeat(N);
        let t0 = performance.now();
        run(s);
        let ms = performance.now() - t0;
        if (ms > 30) for (let k = 0; k < 2; k++) { t0 = performance.now(); run(s); ms = Math.min(ms, performance.now() - t0); }
        if (ms >= 100) out.push(`${p}${m}: ${Math.round(ms)} ms`);
      }
    }
    return out;
  }
  test('the sweep covers 49 port rules and 24 embedded forms', () => {
    expect([S.sources.length, S.whole.length]).toEqual([49, 24]);
  });
  test('the 49 rules of the Go-parity port', () => {
    const bad: string[] = [];
    for (const src of S.sources) {
      const re = S.re2(src);
      const run = src === JWT ? (s: string) => S.jwtSpans(s, false) : (s: string) => s.replace(re, 'x');
      for (const x of slow(run, PRE)) bad.push(src.slice(0, 50) + ' | ' + x);
    }
    expect(bad).toEqual([]);
  }, 600000);
  test('the 24 embedded forms (prefixes also in upper case)', () => {
    const bad: string[] = [];
    for (const src of S.whole) {
      const re = new RegExp('(?<![A-Za-z0-9])(?:' + S.re2(S.embedSource(src), 'u').source + ')', 'gu');
      const run = src === JWT ? (s: string) => S.jwtSpans(s, true) : (s: string) => { re.lastIndex = 0; return re.test(s); };
      for (const x of slow(run, PRE.concat(PRE.map((p) => p.toUpperCase())))) bad.push(src.slice(0, 50) + ' | ' + x);
    }
    expect(bad).toEqual([]);
  }, 600000);
});

// Short stems and name/value pairs: the golden has no deep-scrub vector for them, so these
// inputs carry the output the agent's own scrub gave for each (go test -overlay over the agent tree).
const PAIRS = [
  { name: "short stems: a number, and a path under a bare pwd, are kept; a long stem and a short stem after a separator redact", in: {"pass": 12, "PWD": "/work/project", "pwd": "~/x", "db_pass": "hunter2", "MYSQL_PWD": "/notapath", "DB_PASSWORD": 5, "pat": 3.5, "devops-pat": "ghx", "bypass": "keep", "OLDPWD": "/x", "Pwd": "/y", "pwd2": "/z"}, out: {"DB_PASSWORD": "[REDACTED]", "MYSQL_PWD": "[REDACTED]", "OLDPWD": "/x", "PWD": "/work/project", "Pwd": "/y", "bypass": "keep", "db_pass": "[REDACTED]", "devops-pat": "[REDACTED]", "pass": 12, "pat": 3.5, "pwd": "~/x", "pwd2": "/z"} },
  { name: "k8s env pair: the value of a credential name", in: {"name": "DB_PASSWORD", "value": "hunter2"}, out: {"name": "DB_PASSWORD", "value": "[REDACTED]"} },
  { name: "SSM parameter (Name/Value, any case)", in: {"Name": "/prod/db/password", "Type": "SecureString", "Value": "s3"}, out: {"Name": "/prod/db/password", "Type": "SecureString", "Value": "[REDACTED]"} },
  { name: "SSM ARN: the last segment names the credential", in: {"name": "arn:aws:ssm:us-east-1:1:parameter/app/token", "value": "t"}, out: {"name": "arn:aws:ssm:us-east-1:1:parameter/app/token", "value": "[REDACTED]"} },
  { name: "the name field folds K (U+212A) with k", in: {"\u212aey": "api_key", "value": "x", "other": "y"}, out: {"other": "y", "value": "[REDACTED]", "\u212aey": "api_key"} },
  { name: "a pair whose name is no credential is kept", in: {"key": "DB_HOST", "value": "db.local"}, out: {"key": "DB_HOST", "value": "db.local"} },
  { name: "a boolean value of a credential pair is kept", in: {"name": "DB_PASSWORD", "value": true}, out: {"name": "DB_PASSWORD", "value": true} },
  { name: "every non-boolean value field of a credential pair, whatever its case", in: {"name": "DB_PASSWORD", "value": {"nested": "v"}, "VALUE": 7}, out: {"VALUE": "[REDACTED]", "name": "DB_PASSWORD", "value": "[REDACTED]"} },
  { name: "a name that is not a string names nothing", in: {"name": 5, "value": "v"}, out: {"name": 5, "value": "v"} },
  { name: "a numeric value of a credential pair is redacted", in: {"name": "AZURE_DEVOPS_PAT", "value": 1234}, out: {"name": "AZURE_DEVOPS_PAT", "value": "[REDACTED]"} },
  { name: "a nested pair is judged by its own name only", in: {"name": "aaaa", "value": "x", "list": [{"name": "TOKEN", "value": "y"}]}, out: {"list": [{"name": "TOKEN", "value": "[REDACTED]"}], "name": "aaaa", "value": "x"} },
  { name: "a path ending in a separator has no last segment", in: {"name": "/a/b/", "value": "x"}, out: {"name": "/a/b/", "value": "x"} },
  { name: "a name ending in ':' has no last segment", in: {"name": "x:", "value": "x"}, out: {"name": "x:", "value": "x"} },
  { name: "(?i) keys fold \u017f with s", in: {"pa\u017f\u017f": 4, "\u017fecret": "s"}, out: {"pa\u017f\u017f": 4, "\u017fecret": "[REDACTED]"} },
  { name: "a null value of a credential pair is redacted", in: {"name": "SECRET", "value": null}, out: {"name": "SECRET", "value": "[REDACTED]"} },
  { name: "valueFrom is no value field", in: {"env": [{"name": "API_TOKEN", "valueFrom": {"secretKeyRef": {"key": "token"}}}]}, out: {"env": [{"name": "API_TOKEN", "valueFrom": {"secretKeyRef": {"key": "token"}}}]} },
  { name: "a name of 256 UTF-8 bytes is classified", in: {"name": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "value": "kept?"}, out: {"name": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "value": "kept?"} },
  { name: "a name over 256 UTF-8 bytes counts as a credential (fail closed)", in: {"name": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "value": "red"}, out: {"name": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "value": "[REDACTED]"} },
  { name: "a name of 256 UTF-8 bytes in two-byte characters is classified", in: {"name": "\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9", "value": "kept?"}, out: {"name": "\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9", "value": "kept?"} },
  { name: "a name over 256 UTF-8 bytes in two-byte characters counts as a credential", in: {"name": "\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9", "value": "red"}, out: {"name": "\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9", "value": "[REDACTED]"} },
  { name: "a name whose last ':' segment names the credential", in: {"name": "ssm:token", "value": "x"}, out: {"name": "ssm:token", "value": "[REDACTED]"} },
  { name: "a name that is a list names nothing, whatever it holds", in: {"name": ["password"], "value": "v"}, out: {"name": ["password"], "value": "v"} },
];
describe('StripDeep: short stems and name/value pairs, as the agent answers them', () => {
  for (const c of PAIRS) {
    test(c.name, () => {
      expect(canon(S.go.stripDeep(c.in))).toBe(canon(c.out));
      expect(canon(S.stripDeep(c.in))).toBe(canon(c.out));
    });
  }
});

// RE2 counts a bounded repeat in runes, a JavaScript RegExp without the u flag in UTF-16
// units, so 33 emoji (66 units) before a curl password, or 65 before a credential name, passed the rule's bound and
// stayed visible. Each input carries the output the agent's scrub gave for it (go test -overlay over the agent tree).
const ASTRAL: [string, string][] = [
  ["curl -u \ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00:hunter2", "curl -u \ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00:[REDACTED]"],
  ["curl -u '\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00:hunter 2'", "curl -u '\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00:[REDACTED]'"],
  ["curl -u \"\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00:hunter 2\"", "curl -u \"\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00:[REDACTED]\""],
  ["{\"name\": \"\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00password\", \"value\": \"hunter2\"}", "{\"name\": \"\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00password\", \"value\": \"[REDACTED]\"}"],
  ["{\"value\": \"\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\", \"name\": \"DB_PASSWORD\"}", "{\"value\": \"[REDACTED]\", \"name\": \"DB_PASSWORD\"}"],
  ["- name: \ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00_token\n  value: hunter2", "- name: \ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00_token\n  value: [REDACTED]"],
  ["- name: \ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00_token\n  value: |\n    hunter2\n", "- name: \ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00_token\n  value: [REDACTED]\n"],
  ["password = '\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00'", "password = [REDACTED]"],
  ["API_KEY=\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00x", "API_KEY=[REDACTED]"],
  ["x\ud83d\ude00ghp_" + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "x\ud83d\ude00[REDACTED]"],
  ["token=\"\ud83d\ude00\ud83d\ude00\ud83d\ude00\na\"", "token=[REDACTED]"],
  ["MY_\ud83d\ude00_KEY=abc", "MY_\ud83d\ude00_KEY=abc"],
  ["{\"name\": \"DB_PASSWORD\", \"x\": \"\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\", \"value\": \"s\"}", "{\"name\": \"DB_PASSWORD\", \"x\": \"\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\", \"value\": \"s\"}"],
  ["{\"name\": \"DB_PASSWORD\", \"x\": \"\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\", \"value\": \"s\"}", "{\"name\": \"DB_PASSWORD\", \"x\": \"\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\", \"value\": \"[REDACTED]\"}"],
  ["curl -u \ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00:pw", "curl -u \ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00:[REDACTED]"],
  ["curl -u \ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00:pw", "curl -u \ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00:pw"],
  ["secret\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00=\"a\nb\"", "secret\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00=\"a\nb\""],
  ["secretxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx=\"a\nb\"", "secretxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx=\"[REDACTED]\""],
  ["{\"value\": \"hunter2\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\", \"name\": \"DB_PASSWORD\"}", "{\"value\": \"[REDACTED]\", \"name\": \"DB_PASSWORD\"}"],
];
describe('a bounded repeat counts code points, as RE2 counts runes', () => {
  for (const [input, out] of ASTRAL) {
    test(JSON.stringify(input).slice(0, 60), () => {
      expect(S.go.strip(input)).toBe(out);
      expect(S.strip(input)).not.toContain('hunter');
    });
  }
});
