// One toolbar type, the segments' style (mono, --fs-sm 12, --fw-medium 500, --case-caps, and --tracking-label 0.06em),
// on every toolbar control's words: a toolbar Button, a filter chip, and the DataTable toolbar's own small word buttons
// (.tbWords). A chip's value is data and keeps its case with no tracking. Scripts without case or tracking clear
// --tracking-label as they clear the other trackings. Source pins; toolbartype.spec.ts measures them drawn.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(import.meta.dirname, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = read('tokens.css');
const button = read('controls/Button.module.css');
const table = read('data/DataTable.module.css');
const segments = read('controls/SegmentedControl.module.css');

/** `css` split into what is outside any @media block and what is inside one (a forced-colours or coarse-pointer rule). */
function split(css: string): { rest: string; inAt: string } {
  let rest = '';
  let inAt = '';
  for (let i = 0; i < css.length; ) {
    const at = css.indexOf('@media', i);
    if (at < 0) {
      rest += css.slice(i);
      break;
    }
    rest += css.slice(i, at);
    let depth = 0;
    let j = css.indexOf('{', at);
    do depth += css[j] === '{' ? 1 : css[j] === '}' ? -1 : 0;
    while (++j < css.length && depth > 0);
    inAt += css.slice(at, j);
    i = j;
  }
  return { rest, inAt };
}

/** The declarations of the one rule outside any at-rule whose selector list is exactly `sel` (whitespace-insensitive). */
function rule(css: string, sel: string): Record<string, string> {
  const want = sel.replace(/\s+/g, ' ').trim();
  const out: Record<string, string>[] = [];
  for (const m of split(css).rest.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1]!.replace(/\s+/g, ' ').trim() !== want) continue;
    out.push(Object.fromEntries(m[2]!.split(';').map((d) => d.split(':').map((x) => x.trim())).filter((d) => d.length === 2 && d[0]) as [string, string][]));
  }
  expect(out, `one rule named "${want}"`).toHaveLength(1);
  return out[0]!;
}

describe('the toolbar type', () => {
  it('a toolbar Button takes 12 px, weight 500 and --tracking-label itself; the family and the case are every button\'s', () => {
    expect(rule(button, '.button.toolbar')).toMatchObject({ 'font-size': 'var(--fs-sm)', 'font-weight': 'var(--fw-medium)', 'letter-spacing': 'var(--tracking-label)' });
    expect(rule(button, '.button')).toMatchObject({ 'font-family': 'var(--font-mono)', 'text-transform': 'var(--case-caps)' });
    // A plain button's own voice is lighter and tighter, so the toolbar rule has to set both.
    expect(rule(button, '.button')).toMatchObject({ 'font-size': 'var(--fs-md)', 'font-weight': 'var(--fw-regular)', 'letter-spacing': 'var(--btn-tracking)' });
    // No rule inside an at-rule (forced colours, a coarse pointer) sets a button's type.
    const { inAt } = split(button);
    expect(inAt).toMatch(/forced-colors: active/);
    expect(inAt).toMatch(/pointer: coarse/);
    expect(inAt).not.toMatch(/font-(?:family|size|weight)\s*:|letter-spacing\s*:|text-transform\s*:/);
  });

  it('a filter chip takes the whole toolbar type; its value keeps its case with no tracking', () => {
    expect(rule(table, '.chip, .chipX')).toMatchObject({
      'font-family': 'var(--font-mono)',
      'font-size': 'var(--fs-sm)',
      'font-weight': 'var(--fw-medium)',
      'letter-spacing': 'var(--tracking-label)',
      'text-transform': 'var(--case-caps)',
    });
    expect(rule(table, '.chipValue')).toMatchObject({ 'letter-spacing': 'normal', 'text-transform': 'none' });
  });

  it("the toolbar's own word buttons take 12 px at --tracking-label, under a selector that outweighs .sm", () => {
    expect(rule(table, 'button.tbWords')).toEqual({ 'font-size': 'var(--fs-sm)', 'letter-spacing': 'var(--tracking-label)' });
  });

  it('it is the segments style', () => {
    expect(segments).toMatch(/font-family:\s*var\(--font-mono\)/);
    expect(segments).toMatch(/font-size:\s*var\(--fs-sm\)/);
    expect(segments).toMatch(/letter-spacing:\s*var\(--tracking-label\)/);
  });

  it('scripts without case or tracking clear --tracking-label too', () => {
    const lang = /:lang\(ar\), :lang\(th\), :lang\(ja\), :lang\(ko\), :lang\(zh\) \{([^}]*)\}/.exec(tokens);
    expect(lang?.[1]).toMatch(/--tracking-label:\s*normal/);
  });
});
