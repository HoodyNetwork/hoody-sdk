// This page's spacing is its own padding or its parent's gap, never a margin (layout.cssMargin).
// Formatting-tolerant: declarations are parsed.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => fs.readFileSync(path.join(__dirname, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const FILES = ['parts/keys.module.css'];

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

describe('keys CSS: padding or gap, not margin', () => {
  it('has no non-zero margin', () => {
    for (const f of FILES)
      for (const [sels, d] of rules(read(f)))
        for (const [p, v] of d)
          if (/^margin/.test(p)) expect(v.split(' ').every((x) => x === '0' || x === 'auto'), `${f} ${sels.join(', ')} ${p}: ${v}`).toBe(true);
  });

  it.each([
    ['parts/keys.module.css', '.sectionTitle', 'padding-block-end', 'var(--sp-2)'],
    ['parts/keys.module.css', '.sshSub', 'padding-block-end', 'var(--sp-3)'],
  ])('keeps the moved space: %s %s %s', (f, sel, prop, value) => {
    const found = rules(read(f)).find(([sels, d]) => sels.includes(sel) && d.has(prop));
    expect(found?.[1].get(prop)).toBe(value);
  });
});
