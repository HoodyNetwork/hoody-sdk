// This page's spacing is its own padding or its parent's gap, never a margin (layout.cssMargin).
// Formatting-tolerant: declarations are parsed.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => fs.readFileSync(path.join(__dirname, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const FILES = ['parts/Learn.module.css'];

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

describe('notifications CSS: padding or gap, not margin', () => {
  it('has no non-zero margin', () => {
    for (const f of FILES)
      for (const [sels, d] of rules(read(f)))
        for (const [p, v] of d)
          if (/^margin/.test(p)) expect(v.split(' ').every((x) => x === '0' || x === 'auto'), `${f} ${sels.join(', ')} ${p}: ${v}`).toBe(true);
  });

  // The kinds list's groups are kit SettingGroups now (their spacing is the kit's): no page group rule is left to pin.
  it('draws no group of its own for the kinds list', () => {
    expect(rules(read('parts/Learn.module.css')).some(([sels]) => sels.some((x) => /^\.(group|groupTitle|items)\b/.test(x)))).toBe(false);
  });
});

describe('Inbox CSS: the unread mark is the table row mark', () => {
  const inbox = rules(read('parts/Inbox.module.css'));
  it('the tip under the list sits 8 px below the table (padding, not a margin), and a dismissed tip leaves no gap', () => {
    expect(inbox.find(([sels]) => sels.includes('.hintRow'))?.[1].get('padding-block-start')).toBe('var(--sp-2)');
    expect(inbox.find(([sels]) => sels.includes('.hintRow:empty'))?.[1].get('display')).toBe('none');
    // The row's div is written once, in parts/noticeBits.tsx (hintRow, styled by Inbox.module.css; its terminal twin
    // draws its own); the Inbox hands it the tip.
    const bits = read('parts/noticeBits.tsx');
    expect(bits).toMatch(/import s from '\.\/Inbox\.module\.css';/);
    expect(bits).toMatch(/return <div className=\{s\.hintRow\}>\{hint\}<\/div>;/);
    expect(read('parts/Inbox.tsx')).toMatch(/\{hintRow\(<NotifyHint kind="inbox" \/>\)\}/);
  });
  it('draws no dot of its own', () => {
    expect(inbox.some(([sels]) => sels.some((s) => /\.dot\b/.test(s)))).toBe(false);
  });
  it('draws no severity colour of its own: the icon takes the kit Icon tone', () => {
    expect(inbox.some(([sels]) => sels.some((x) => /\.sev[A-Z]|\.readSev/.test(x)))).toBe(false);
    expect(read('parts/Inbox.tsx')).toMatch(/<Icon name=\{SEV_ICON\[c\.getValue\(\)\]\} tone=\{\(c\.row\.original\.read \? READ_SEV_TONE : SEV_TONE\)\[c\.getValue\(\)\]\}/);
  });
  it('quiet (read) text is the muted text token', () => {
    expect(inbox.find(([sels]) => sels.includes('.readText'))?.[1].get('color')).toBe('var(--hx-muted)');
  });
});
