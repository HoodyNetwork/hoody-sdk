// This page's spacing is its own padding or its parent's gap, never a margin (layout.cssMargin).
// Formatting-tolerant: declarations are parsed.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => fs.readFileSync(path.join(__dirname, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const FILES = ['parts/Rules.module.css', 'parts/Wipe.module.css'];

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

describe('account CSS: padding or gap, not margin', () => {
  it('has no non-zero margin', () => {
    for (const f of FILES)
      for (const [sels, d] of rules(read(f)))
        for (const [p, v] of d)
          if (/^margin/.test(p)) expect(v.split(' ').every((x) => x === '0' || x === 'auto'), `${f} ${sels.join(', ')} ${p}: ${v}`).toBe(true);
  });

  it.each([
    ['parts/Rules.module.css', '.banner', 'padding-block-end', 'var(--sp-4)'],
    ['parts/Wipe.module.css', '.banner', 'padding-block-end', 'var(--sp-3)'],
    ['parts/Wipe.module.css', '.list', 'padding', '0 0 var(--sp-3) var(--sp-5)'],
  ])('keeps the moved space: %s %s %s', (f, sel, prop, value) => {
    const found = rules(read(f)).find(([sels, d]) => sels.includes(sel) && d.has(prop));
    expect(found?.[1].get(prop)).toBe(value);
  });

  it('pads a wrapper around every banner, never the banner itself (its padding would grow its frame)', () => {
    // Each sheet's banners, all of them spaced by the wrapper: a banner left bare loses its space below.
    const banners: Record<string, number> = {
      'parts/PasswordSheet.tsx': 2,
      'parts/NameSheet.tsx': 2,
      'parts/LockSheet.tsx': 1,
      'parts/EmailSheet.tsx': 2,
      'parts/WipeSection.tsx': 2,
    };
    for (const [f, n] of Object.entries(banners)) {
      const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
      expect(src.match(/<OutcomeBanner\b/g)?.length ?? 0, f).toBe(n);
      expect(src.match(/<div className=\{s\.banner\}>\s*<OutcomeBanner\b/g)?.length ?? 0, f).toBe(n);
      expect(src.split('className={s.banner}').length - 1, f).toBe(n);
    }
  });
});
