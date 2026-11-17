// Vitest: the JSON formatter keeps the stored text (only white space outside
// strings changes), and its output is bounded before anything is built.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HL_MAX, PRETTY_MAX_DEPTH, PRETTY_MAX_LEN, jsonView, prettyJson, prettyJsonTokens } from './highlight';

afterEach(() => vi.restoreAllMocks());

/** The text with every white space outside strings removed (strings kept byte for byte, escapes included). */
function squeeze(src: string): string {
  let out = '';
  let inStr = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (inStr) {
      out += c;
      if (c === '\\') out += src[++i] ?? '';
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
      out += c;
    } else if (!/\s/.test(c)) out += c;
  }
  return out;
}

const text = (src: string) => prettyJsonTokens(src)?.map((t) => t.text).join('') ?? null;

const SAMPLES = [
  '{"id":12345678901234567890,"n":-0.5e-3}',
  '{"a":1,"a":2}',
  '{"u":"\\u00e9\\n\\"q\\"","s":"a{b,c:d}[e]"}',
  '{"deep":{"x":[1,[2,[3,{"y":null}]]],"t":true,"f":false}}',
  '{}',
  '[]',
  '[{},[],{"k":[]}]',
  '  {"lead":"and trail"}  \n',
  '{"key with : and ,":"v, : {"}',
];

describe('prettyJsonTokens: faithful formatting', () => {
  it('the compact nested sample gives the exact multi-line text', () => {
    expect(text('{"a":[{"b":{}},[]],"c":1}')).toBe('{\n  "a": [\n    {\n      "b": {}\n    },\n    []\n  ],\n  "c": 1\n}');
  });

  it.each(SAMPLES)('only white space outside strings changes: %s', (src) => {
    const out = text(src);
    expect(out).not.toBeNull();
    expect(squeeze(out!)).toBe(squeeze(src));
  });

  it('big integers, duplicate keys and escapes are the source text, never a JSON.stringify round trip', () => {
    expect(text('{"id":12345678901234567890}')).toContain('12345678901234567890');
    expect(text('{"a":1,"a":2}')).toBe('{\n  "a": 1,\n  "a": 2\n}');
    expect(text('{"u":"\\u00e9"}')).toContain('"\\u00e9"');
  });

  it('keys, strings, numbers and literals keep their colour kinds', () => {
    const kinds = new Map(prettyJsonTokens('{"k":"v","n":1,"b":true}')!.map((t) => [t.text, t.kind]));
    expect(kinds.get('"k"')).toBe('key');
    expect(kinds.get('"v"')).toBe('str');
    expect(kinds.get('1')).toBe('num');
    expect(kinds.get('true')).toBe('lit');
  });

  it.each(['"x"', '42', 'true', 'null', '{"a":', '{a:1}', '[1,]', 'not json', ''])('a scalar or invalid input is not formatted: %s', (src) => {
    expect(prettyJsonTokens(src)).toBeNull();
    expect(jsonView(src).kind).toBe('plain');
  });

  it('measure gives exactly the length emit builds', () => {
    for (const src of SAMPLES) expect(text(src)!.length).toBe(prettyJson.measure(atomsOf(src)).length);
  });
});

/** The formatter's atoms of `src`, through the public path: measure is called by jsonView with them. */
function atomsOf(src: string) {
  const seen: Parameters<typeof prettyJson.measure>[0][] = [];
  const real = prettyJson.measure;
  const spy = vi.spyOn(prettyJson, 'measure').mockImplementation((a) => (seen.push(a), real(a)));
  jsonView(src);
  spy.mockRestore();
  return seen[0]!;
}

const nest = (depth: number, inner = '0') => '['.repeat(depth) + inner + ']'.repeat(depth);

describe('prettyJsonTokens: bounded output', () => {
  it('10,000-deep arrays: refused by the measure, emit never runs, quickly', () => {
    const emit = vi.spyOn(prettyJson, 'emit');
    const src = nest(10_000);
    const t0 = performance.now();
    expect(jsonView(src).kind).toBe('tooBig');
    expect(prettyJsonTokens(src)).toBeNull();
    expect(performance.now() - t0).toBeLessThan(2_000);
    expect(emit).not.toHaveBeenCalled();
  });

  it('depth exactly PRETTY_MAX_DEPTH formats; one deeper is refused without emit', () => {
    expect(PRETTY_MAX_DEPTH).toBe(64);
    expect(jsonView(nest(64)).kind).toBe('json');
    const emit = vi.spyOn(prettyJson, 'emit');
    expect(jsonView(nest(65)).kind).toBe('tooBig');
    expect(emit).not.toHaveBeenCalled();
  });

  it('an empty container counts as a level: depth 64 of arrays around [] is 65 levels', () => {
    expect(jsonView(nest(63, '[]')).kind).toBe('json');
    expect(jsonView(nest(64, '[]')).kind).toBe('tooBig');
  });

  it('wide, not deep: 20,000 scalars at depth 32, under HL_MAX, formatted past 1 MiB: refused without emit', () => {
    // 32 levels, the innermost holding the scalars: each scalar line costs 1 + 64 spaces + the digit + its comma.
    const src = nest(31, `[${Array.from({ length: 20_000 }, () => '0').join(',')}]`);
    expect(src.length).toBeLessThan(HL_MAX);
    const emit = vi.spyOn(prettyJson, 'emit');
    const v = jsonView(src);
    expect(v.kind).toBe('tooBig');
    expect(emit).not.toHaveBeenCalled();
  });

  it('formatted length exactly PRETTY_MAX_LEN formats; one more is refused', () => {
    expect(PRETTY_MAX_LEN).toBe(1_048_576);
    // Short strings at depth 32 (each line costs 1 + 64 spaces), so a text under HL_MAX formats near 1 MiB; then the
    // last string is lengthened by exactly what is missing (one more character in it is one more in the output).
    const build = (n: number, last: number) => nest(31, `[${Array.from({ length: n }, (_, i) => `"${'a'.repeat(i === n - 1 ? last : 1)}"`).join(',')}]`);
    const base = jsonView(build(15_000, 1));
    expect(base.kind).toBe('json');
    const missing = PRETTY_MAX_LEN - (base.kind === 'json' ? base.text.length : 0);
    expect(missing).toBeGreaterThan(0);
    const exact = build(15_000, 1 + missing);
    expect(exact.length).toBeLessThan(HL_MAX);
    const ok = jsonView(exact);
    expect(ok.kind === 'json' && ok.text.length).toBe(PRETTY_MAX_LEN);
    const emit = vi.spyOn(prettyJson, 'emit');
    expect(jsonView(build(15_000, 2 + missing)).kind).toBe('tooBig');
    expect(emit).not.toHaveBeenCalled();
  });

  it('longer than HL_MAX: never parsed, shown as too long', () => {
    const parse = vi.spyOn(JSON, 'parse');
    expect(jsonView(`[${'1,'.repeat(HL_MAX / 2)}1]`).kind).toBe('tooLong');
    expect(parse).not.toHaveBeenCalled();
  });
});
