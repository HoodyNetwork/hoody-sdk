// Vitest: IconButton dropTarget (S-strip, Board strip New Board): the button is marked as the place a drag would drop on
// (data-drop-target) only while dropTarget is set, and its look is the kit Tabs drop-tab look (Tabs.module.css
// .tab[data-drop-target]), with the focus ring kept its own. Read from source: jsdom applies no CSS module rules.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IconButton } from './Button';

const SRC = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
function rule(css: string, sel: string): string {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // The selector alone or as one entry of a selector list.
  const m = new RegExp(`(?:^|[}\\s,])${esc}\\s*(?:,[^{}]*)?\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`no rule ${sel}`);
  return m[1]!;
}
const decl = (body: string, prop: string) => new RegExp(`(?:^|;|\\s)${prop.replace(/[-]/g, '\\-')}\\s*:\\s*([^;]+);`).exec(body)?.[1]?.trim();

// The bodies of every @media (forced-colors: active) block, in file order.
function forcedBlocks(css: string): string[] {
  const out: string[] = [];
  for (let at = css.indexOf('@media (forced-colors: active)'); at >= 0; at = css.indexOf('@media (forced-colors: active)', at + 1)) {
    const open = css.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}' && --depth === 0) { out.push(css.slice(open + 1, i)); break; }
    }
  }
  return out;
}
// Class/attribute/pseudo-class count of a compound selector (no ids or elements in these rules).
const specificity = (sel: string) => (sel.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) ?? []).length;

// A length in px: var(--x) from the kit tokens, px literals, and calc() of + - * / with parentheses.
const TOKENS = new Map([...read('kit/tokens.css').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()] as const));
function px(expr: string): number {
  let s = expr;
  for (let i = 0; /var\(/.test(s); i++) {
    if (i > 16) throw new Error(`unresolved ${expr}`);
    s = s.replace(/var\((--[\w-]+)\)/g, (_, n: string) => {
      const v = TOKENS.get(n);
      if (v === undefined) throw new Error(`no token ${n}`);
      return `(${v})`;
    });
  }
  const t = s.replace(/calc/g, '').replace(/(\d)px/g, '$1').match(/\d+(?:\.\d+)?|[-+*/()]/g) ?? [];
  if (t.join('') !== s.replace(/calc/g, '').replace(/(\d)px/g, '$1').replace(/\s+/g, '')) throw new Error(`not a px length: ${expr}`);
  let i = 0;
  const atom = (): number => {
    const k = t[i++];
    if (k === '-') return -atom();
    if (k === '(') { const v = sum(); i++; return v; }
    return Number(k);
  };
  const prod = (): number => { let v = atom(); while (t[i] === '*' || t[i] === '/') v = t[i++] === '*' ? v * atom() : v / atom(); return v; };
  const sum = (): number => { let v = prod(); while (t[i] === '+' || t[i] === '-') v = t[i++] === '+' ? v + prod() : v - prod(); return v; };
  return sum();
}

describe('IconButton dropTarget (S-strip)', () => {
  it('marks the button only while set; data attributes pass through', () => {
    const { rerender } = render(<IconButton icon="plus" label="New Board" data-board-new-drop="" dropTarget />);
    const b = screen.getByRole('button', { name: 'New Board' });
    expect(b.hasAttribute('data-drop-target')).toBe(true);
    expect(b.hasAttribute('data-board-new-drop')).toBe(true);
    rerender(<IconButton icon="plus" label="New Board" dropTarget={false} />);
    expect(screen.getByRole('button', { name: 'New Board' }).hasAttribute('data-drop-target')).toBe(false);
    rerender(<IconButton icon="plus" label="New Board" />);
    expect(screen.getByRole('button', { name: 'New Board' }).hasAttribute('data-drop-target')).toBe(false);
  });

  it('draws the Tabs drop-tab ring (its own text colour per surface), and leaves the focus ring alone', () => {
    const button = read('kit/controls/Button.module.css');
    const tab = rule(read('kit/controls/Tabs.module.css'), '.tab[data-drop-target]');
    expect(decl(tab, 'background')).toBeUndefined(); // never the chosen tab's fill (folder tabs)
    expect(decl(rule(button, '.iconOnly[data-drop-target]'), 'background')).toBeUndefined();
    // The tab takes the folder's on-text; the IconButton (on the plain bar, not a folder tab) keeps ink.
    expect(decl(tab, 'color')).toBe('var(--hx-folder-on-text)');
    expect(decl(rule(button, '.iconOnly[data-drop-target]'), 'color')).toBe('var(--hx-ink)');
    expect(decl(rule(button, '.iconOnly[data-drop-target]'), 'box-shadow')).toBeUndefined();
    expect(decl(rule(button, '.iconOnly[data-drop-target]:not([data-focus-visible])'), 'box-shadow')).toBe(decl(tab, 'box-shadow'));
  });

  it('marks the drop target in forced colours too, where the ring and text colour are dropped', () => {
    for (const [file, sel] of [['kit/controls/Tabs.module.css', '.tab[data-drop-target]'], ['kit/controls/Button.module.css', '.iconOnly[data-drop-target]']] as const) {
      const css = read(file);
      const forced = css.slice(css.lastIndexOf('@media (forced-colors: active)'));
      expect(forced).toContain(sel);
      expect(decl(rule(forced, sel), 'outline')).toBe('var(--bw-2) solid Highlight');
    }
  });

  // In forced colours the outline lies fully inside the border, never over it: its outer edge
  // (offset + width, the offset negative) is at or inside the border's inner edge, so offset ≤ −(border + width).
  it('keeps the forced-colours outline inside the border of the tab (a chosen one too) and of the button', () => {
    const cases = [
      ['kit/controls/Tabs.module.css', '.tab[data-drop-target]', ['.tab', '.tab[data-selected]']],
      ['kit/controls/Button.module.css', '.iconOnly[data-drop-target]', ['.button']],
    ] as const;
    for (const [file, sel, borders] of cases) {
      const css = read(file);
      const forced = rule(css.slice(css.lastIndexOf('@media (forced-colors: active)')), sel);
      const border = Math.max(...[...borders.map((b) => rule(css, b)), forced].map((body) => decl(body, 'border')).filter((v): v is string => !!v).map((v) => px(v.split(/\s+/)[0]!)));
      const width = px(decl(forced, 'outline')!.split(/\s+/)[0]!);
      const offset = px(decl(forced, 'outline-offset')!);
      expect(border).toBeGreaterThan(0);
      expect(offset).toBeLessThanOrEqual(-(border + width));
      expect(offset).toBeLessThanOrEqual(-(border + 2));
      // The offset is built from the border's own token, not a literal.
      expect(decl(forced, 'outline-offset')).toContain('var(--bw)');
    }
  });

  // A tab both focused and a drop target, in forced colours, shows the drop outline: strip owns that
  // case with a selector more specific than any forced focus rule on the tab (.tab[data-focus-visible]).
  it('lets the drop outline win over the forced-colours focus outline on a focused drop tab', () => {
    const css = read('kit/controls/Tabs.module.css');
    const blocks = forcedBlocks(css);
    const both = '.tab[data-focus-visible][data-drop-target]';
    const drop = rule(blocks.at(-1)!, '.tab[data-drop-target]');
    const combined = rule(blocks.at(-1)!, both);
    expect(decl(combined, 'outline')).toBe(decl(drop, 'outline'));
    expect(decl(combined, 'outline-offset')).toBe(decl(drop, 'outline-offset'));
    // Every forced rule that outlines a focused tab without being a drop target loses to the combined selector.
    const focusSels = blocks.flatMap((b) => [...b.matchAll(/([^{}]+)\{([^}]*)\}/g)])
      .filter((m) => /(?:^|;|\s)outline(?:-offset)?\s*:/.test(m[2]!))
      .flatMap((m) => m[1]!.split(',').map((x) => x.trim()))
      .filter((x) => /^\.tab\b/.test(x) && /data-focus-visible|:focus/.test(x) && !x.includes('data-drop-target'));
    for (const f of [...focusSels, '.tab[data-focus-visible]', '.tab:focus-visible']) expect(specificity(both)).toBeGreaterThan(specificity(f));
  });
});
