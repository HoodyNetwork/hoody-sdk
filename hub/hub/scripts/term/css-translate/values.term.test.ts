// var() chains, calc/min/max/clamp, length classification, and tokens.css loading.
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { envFor, WIDTH_CLASSES } from './queries';
import { loadTokens } from './tokens';
import { parseLength, parseNumber, resolveVars, type VarLookup } from './values';

const table: Record<string, string> = {
  '--sp-2': '8px',
  '--sp-3': '12px',
  '--gap': 'var(--sp-3)',
  '--gap-alias': 'var(--gap)',
  '--two': 'var(--sp-2) var(--sp-3)',
  '--loop-a': 'var(--loop-b)',
  '--loop-b': 'var(--loop-a)',
  '--touch-min': '0px',
  '--bw': '1px',
};
const lookup: VarLookup = (n) => (table[n] !== undefined ? { value: table[n]!, from: 'test' } : undefined);

describe('resolveVars', () => {
  test('follows chains and records them outermost first', () => {
    const r = resolveVars('var(--gap-alias)', lookup);
    expect(r.value).toBe('12px');
    expect(r.chain.map((c) => c.name)).toEqual(['--gap-alias', '--gap', '--sp-3']);
    expect(r.unresolved).toEqual([]);
  });
  test('a var holding several parts', () => {
    expect(resolveVars('var(--two)', lookup).value).toBe('8px 12px');
  });
  test('fallbacks, including nested var fallbacks', () => {
    expect(resolveVars('var(--nope, 4px)', lookup).value).toBe('4px');
    expect(resolveVars('var(--nope, var(--sp-2))', lookup).value).toBe('8px');
  });
  test('unresolved names are reported and kept', () => {
    const r = resolveVars('var(--c-time)', lookup);
    expect(r.unresolved).toEqual(['--c-time']);
    expect(r.value).toBe('var(--c-time)');
  });
  test('cycles stop', () => {
    const r = resolveVars('var(--loop-a)', lookup);
    expect(r.unresolved.length).toBeGreaterThan(0);
  });
  test('inside functions', () => {
    expect(resolveVars('max(36px, calc(var(--touch-min) + var(--bw)))', lookup).value).toBe('max(36px, calc(0px + 1px))');
  });
});

describe('parseLength', () => {
  test('plain values', () => {
    expect(parseLength('12px')).toEqual({ kind: 'px', px: 12 });
    expect(parseLength('0')).toEqual({ kind: 'zero' });
    expect(parseLength('50%')).toEqual({ kind: 'pct', pct: 50 });
    expect(parseLength('2fr')).toEqual({ kind: 'fr', fr: 2 });
    expect(parseLength('auto')).toEqual({ kind: 'keyword', kw: 'auto' });
    expect(parseLength('1.5rem')).toEqual({ kind: 'px', px: 24 });
  });
  test('calc, min, max, clamp', () => {
    expect(parseLength('calc(64px + 64px + 16px)')).toEqual({ kind: 'px', px: 144 });
    expect(parseLength('calc(12px + 2px)')).toEqual({ kind: 'px', px: 14 });
    expect(parseLength('calc(2 * 8px)')).toEqual({ kind: 'px', px: 16 });
    expect(parseLength('calc(32px / 2)')).toEqual({ kind: 'px', px: 16 });
    expect(parseLength('max(36px, calc(0px + 1px))')).toEqual({ kind: 'px', px: 36 });
    expect(parseLength('min(88px, 72px)')).toEqual({ kind: 'px', px: 72 });
    expect(parseLength('clamp(10px, 50px, 40px)')).toEqual({ kind: 'px', px: 40 });
    expect(parseLength('env(safe-area-inset-bottom, 0px)')).toEqual({ kind: 'zero' });
    expect(parseLength('env(safe-area-inset-bottom)')).toEqual({ kind: 'zero' });
  });
  test('not expressible', () => {
    expect(parseLength('calc(100% - 2px)').kind).toBe('bad');
    expect(parseLength('100vw').kind).toBe('bad');
    expect(parseLength('calc(100vh + 10%)').kind).toBe('bad');
    expect(parseLength('min(100%, 320px)').kind).toBe('bad');
    expect(parseLength('50cqi').kind).toBe('bad');
  });
  test('viewport height: kept for run time (the mounted region\'s rows)', () => {
    expect(parseLength('100vh')).toEqual({ kind: 'vh', vh: 100, px: 0 });
    expect(parseLength('calc(100dvh - 16px)')).toEqual({ kind: 'vh', vh: 100, px: -16 });
  });
  test('numbers', () => {
    expect(parseNumber('calc(10 + 1)')).toBe(11);
    expect(parseNumber('3')).toBe(3);
    expect(parseNumber('4px')).toBeUndefined();
  });
});

describe('tokens.css', () => {
  const css = fs.readFileSync(path.resolve(import.meta.dir, '../../../src/kit/tokens.css'), 'utf8');
  test('dark theme over the light base; narrow media blocks applied; coarse pointer not', () => {
    const t = loadTokens(css, envFor(WIDTH_CLASSES.narrow!));
    expect(t.values.get('--sp-3')).toBe('12px');
    expect(t.from.get('--hx-bg')).toMatch(/dark/);
    expect(t.values.get('--touch-min')).toBe('0px');
    expect(t.from.get('--tabs-h')).toMatch(/width < 600px/);
    expect(t.ignored.some((i) => /data-hx-perf/.test(i.selector))).toBe(true);
    expect(t.ignored.some((i) => /pointer: coarse/.test(i.selector))).toBe(true);
  });
  test('wide width class keeps the desktop tab height', () => {
    const t = loadTokens(css, envFor(WIDTH_CLASSES.wide!));
    expect(t.values.get('--tabs-h')).toBe('34px');
  });
});
