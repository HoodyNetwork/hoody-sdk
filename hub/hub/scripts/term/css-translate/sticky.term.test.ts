// position: sticky is kept as a run-time marker (src/term/jsx/sticky.ts sticks it), with its top/bottom insets in cells.
import { describe, expect, test } from 'bun:test';
import { translateDecls, type Scope, type SrcDecl } from './translate';

const scope = (): Scope => ({ global: () => undefined, module: () => undefined });
let order = 0;
const decls = (css: string): SrcDecl[] => css.split(';').map((x) => x.trim()).filter(Boolean).map((x) => {
  const i = x.indexOf(':');
  return { prop: x.slice(0, i).trim(), value: x.slice(i + 1).trim(), important: false, order: order++, spec: [0, 1, 0] as [number, number, number], file: 't', line: 0 };
});
const sticky = (css: string) => (translateDecls(decls(css), scope()).style as { sticky?: unknown }).sticky;

describe('position: sticky', () => {
  test('bottom (also from inset-block-end) and top are kept as insets in cells', () => {
    expect(sticky('position: sticky; bottom: 0')).toEqual({ bottom: 0 });
    expect(sticky('position: sticky; inset-block-end: 0')).toEqual({ bottom: 0 });
    expect(sticky('position: sticky; top: 0')).toEqual({ top: 0 });
    expect(sticky('top: 0; position: sticky')).toEqual({ top: 0 });
  });
  test('without an inset it is a marker that sticks to nothing; left/right are not kept', () => {
    expect(sticky('position: sticky')).toEqual({});
    expect(sticky('position: sticky; left: 0')).toEqual({});
  });
  test('other positions carry no marker and keep their offsets as before', () => {
    expect(sticky('position: relative; top: 0')).toBeUndefined();
    const t = translateDecls(decls('position: absolute; top: 0'), scope()).style as Record<string, unknown>;
    expect(t.sticky).toBeUndefined();
    expect(t.position).toBe('absolute');
    expect(t.top).toBe(0);
  });
});
