// Home's spacing is the parents' gap, and hover states on kit links reach their own children only through
// inherited custom properties (layout.cssMargin, layout.cssReach). Formatting-tolerant: declarations are parsed.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => fs.readFileSync(path.join(__dirname, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const HOME = read('home.module.css');
const WIDGETS = read('../widgets/widgets.module.css');
const PARTS = read('parts.module.css');

/** Every rule as [selector list, declarations]; nested at-rules contribute their inner rules. */
function rules(css: string): [string[], Map<string, string>][] {
  const out: [string[], Map<string, string>][] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1]!.trim();
    if (sel.startsWith('@')) continue;
    const decls = new Map<string, string>();
    for (const d of m[2]!.split(';')) {
      const i = d.indexOf(':');
      if (i > 0) decls.set(d.slice(0, i).trim(), d.slice(i + 1).trim().replace(/\s+/g, ' '));
    }
    out.push([sel.split(',').map((s) => s.trim().replace(/\s+/g, ' ')), decls]);
  }
  return out;
}
const decl = (css: string, sel: string, prop: string) =>
  rules(css).find(([sels, d]) => sels.includes(sel) && d.has(prop))?.[1].get(prop);

describe('Home CSS: gap, not margin', () => {
  it('has no non-zero margin in home.module.css or widgets.module.css', () => {
    for (const css of [HOME, WIDGETS])
      for (const [sels, d] of rules(css))
        for (const [p, v] of d)
          if (/^margin/.test(p)) expect(v.split(' ').every((x) => x === '0' || x === 'auto'), `${sels.join(', ')} ${p}: ${v}`).toBe(true);
  });

  it('spaces each moved place by its parent gap', () => {
    expect(decl(HOME, '.fitsBody', 'gap')).toBe('var(--sp-4)');
    expect(decl(HOME, '.firstSteps', 'gap')).toBe('var(--sp-5)');
    expect(decl(HOME, '.stepsGroup', 'gap')).toBe('var(--sp-2)');
    expect(decl(HOME, '.stepsCardBody', 'gap')).toBe('var(--sp-3)');
    expect(decl(HOME, '.quick', 'gap')).toBe('var(--sp-3)');
    expect(decl(HOME, '.tile', 'gap')).toBe('var(--sp-2)');
    expect(decl(HOME, '.tileText', 'gap')).toBe('var(--sp-1)');
    expect(decl(HOME, '.customizeBody', 'gap')).toBe('var(--sp-4)');
    expect(decl(HOME, '.needMark', 'block-size')).toBe('var(--ctl-h)');
  });
});

describe('Home CSS: hover reaches no further than the kit link', () => {
  it('has no selector below .tile', () => {
    for (const [sels] of rules(HOME)) for (const s of sels) expect(s, s).not.toMatch(/\.tile\b[^ ,]*[ >+~]/);
  });

  // 19c: First steps rows are kit widget rows, so the page styles no checklist or try link of its own.
  it('keeps no First steps row, tick or try link class', () => {
    for (const [sels] of rules(HOME)) for (const s of sels) expect(s, s).not.toMatch(/\.(milestones?|milestoneName|milestoneBody|tick|tickDone|checking|tries|try(Row|Link|Name|Body|Arrow))\b/);
  });

  it('carries the tile icon state on the tile', () => {
    expect(decl(HOME, '.tile:hover', '--tile-icon-bg')).toBe('var(--hx-acc)');
    expect(decl(HOME, '.tile:focus-visible', '--tile-icon-ink')).toBe('var(--hx-acc-ink)');
    expect(decl(HOME, '.tileIcon', 'background')).toBe('var(--tile-icon-bg, var(--hx-fill))');
    expect(decl(HOME, '.tileIcon', 'color')).toBe('var(--tile-icon-ink, var(--hx-ink))');
  });
});

describe('Home CSS: no kit internals, no display type', () => {
  it('styles no element inside a kit part and no direct child of a card', () => {
    for (const css of [HOME, PARTS]) for (const [sels] of rules(css)) for (const s of sels) expect(s, s).not.toMatch(/(\binput\b|> \*)/);
  });

  it('sets no display font size', () => {
    for (const css of [HOME, PARTS, WIDGETS])
      for (const [sels, d] of rules(css)) for (const [p, v] of d) expect(`${sels.join(', ')} ${p}: ${v}`).not.toMatch(/--(fs-(lg|xl|2xl|3xl)|t-(section|heading|title|display))\b/);
  });
});
