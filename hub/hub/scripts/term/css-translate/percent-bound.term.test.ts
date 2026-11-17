// `min(P%, L)` / `max(P%, L)` on a size property: the percent, bounded by the length (NewChat's `.page { inline-size:
// min(100%, 760px); margin-inline: auto }` lost its width and shrank to its content, cutting the suggestion cards).
import { describe, expect, test } from 'bun:test';
import { translateDecls, type Scope, type SrcDecl } from './translate';
import { percentOrLength } from './values';

const scope = (): Scope => ({ global: () => undefined, module: () => undefined });
let order = 0;
const decls = (css: string): SrcDecl[] => css.split(';').map((x) => x.trim()).filter(Boolean).map((x) => {
  const i = x.indexOf(':');
  return { prop: x.slice(0, i).trim(), value: x.slice(i + 1).trim(), important: false, order: order++, spec: [0, 1, 0] as [number, number, number], file: 't', line: 0 };
});
const tr = (css: string) => translateDecls(decls(css), scope());
const style = (css: string) => tr(css).style as Record<string, unknown>;
const kind = (css: string, prop: string) => [...tr(css).outcomes.values()].find((o) => o.decl.startsWith(prop + ':'))?.kind;

describe('percentOrLength', () => {
  test('a percent and a length, in either order, calc allowed', () => {
    expect(percentOrLength('min(100%, 760px)')).toEqual({ f: 'min', pct: 100, px: 760 });
    expect(percentOrLength('max(240px, 50%)')).toEqual({ f: 'max', pct: 50, px: 240 });
    expect(percentOrLength('min(100%, calc(4 * 80px))')).toEqual({ f: 'min', pct: 100, px: 320 });
  });
  test('anything else is not this shape', () => {
    for (const v of ['min(10px, 20px)', 'min(10%, 20%)', '100%', 'clamp(10px, 50%, 90px)', 'min(100%, 10vh)', 'min(100%, 0px)', 'min(100%)', 'min(1, 100%)']) expect(percentOrLength(v)).toBeUndefined();
  });
});

describe('size properties', () => {
  test('width: min(P%, L) is the percent with a maximum; inline-size says the same', () => {
    expect(style('width: min(100%, 760px)')).toMatchObject({ width: '100%', maxWidth: 95 });
    expect(style('inline-size: min(100%, 760px)')).toMatchObject({ width: '100%', maxWidth: 95 });
    expect(kind('width: min(100%, 760px)', 'width')).toBe('translated');
  });
  test('width: max(P%, L) is the percent with a minimum; height uses rows', () => {
    expect(style('width: max(50%, 240px)')).toMatchObject({ width: '50%', minWidth: 30 });
    const h = style('height: min(100%, 160px)');
    expect(h.height).toBe('100%');
    expect(typeof h.maxHeight).toBe('number');
  });
  test("the rule's own bound stands", () => {
    const s = style('width: min(100%, 760px); max-width: 400px');
    expect(s).toMatchObject({ width: '100%', maxWidth: 50 });
    expect(kind('width: min(100%, 760px); max-width: 400px', 'width')).toBe('lossy');
  });
  test('max-width: min(100%, L) is the length; under 100% the percent is reported lost', () => {
    expect(style('max-inline-size: min(100%, 720px)')).toMatchObject({ maxWidth: 90 });
    expect(kind('max-width: min(100%, 720px)', 'max-width')).toBe('translated');
    expect(kind('max-width: min(80%, 720px)', 'max-width')).toBe('lossy');
    expect(kind('max-width: max(80%, 720px)', 'max-width')).toBe('unexpressible');
  });
  test('a min-width is left to the single-value rules (still unexpressible)', () => {
    expect(kind('min-width: min(100%, 240px)', 'min-width')).toBe('unexpressible');
  });
});
