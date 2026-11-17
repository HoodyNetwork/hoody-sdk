// Under the chalk highlight in the light theme the accent is white, so every shell accent mark takes a line in the
// muted mark grey (about 3:1 on its ground). One rule per kind of mark and file, scoped to chalk + not dark; no other
// highlight or theme gets it. A mark that paints its own accent fill (the current item, a dot) draws an inset shadow;
// an accent count is the kit CountBadge (in a shell CountMark), which draws the same line itself (--hx-count-line), so
// the shell adds none. chalkShots (Playwright) shows the drawn result for the marks the fixtures draw; this guard covers
// every mark, the ones that need a waiting agent or bot too.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const CHALK = ':global(:root[data-hx-hl="chalk"]:not([data-hx-theme="dark"]))';
const SHADOW = 'box-shadow: inset 0 0 0 var(--bw) var(--hx-muted-fill);';
const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');

/** The selectors of the rule that draws `line`, or [] when the file has none. */
function ruleOf(src: string, line: string): string[] {
  const at = src.indexOf(line);
  if (at < 0) return [];
  const open = src.lastIndexOf('{', at);
  const head = src.slice(src.lastIndexOf('}', open) + 1, open);
  return head.replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((s) => s.trim()).filter(Boolean);
}

const count = (src: string, line: string) => src.split(line).length - 1;

/** Per file: the marks that paint their own accent fill. */
const MARKS: Record<string, string[]> = {
  'Sidebar.module.css': ['.current:not([data-focus-visible])', '.railDot.needs'],
  'TopBar.module.css': ['.askDot'],
  'BottomNav.module.css': ['.dot'],
};

describe('chalk accent marks', () => {
  for (const [file, marks] of Object.entries(MARKS)) {
    it(`${file}: every accent mark has the muted line under chalk in the light theme, and only there`, () => {
      const src = read(file);
      expect(ruleOf(src, SHADOW)).toEqual(marks.map((m) => `${CHALK} ${m}`));
      expect(count(src, SHADOW)).toBe(1);
      // The counts' line is the badge's own: no shell rule draws a second one around it.
      expect(count(src, CHALK)).toBe(marks.length);
    });
  }

  it('the accent fills these marks (so the rule names what the line is for)', () => {
    const sidebar = read('Sidebar.module.css');
    expect(sidebar).toMatch(/\.current,\n\.current\[data-hovered\] \{\n {2}background: var\(--hx-acc\);/);
    expect(sidebar).toMatch(/\.railDot\.needs \{\n {2}background: var\(--hx-acc\);/);
    expect(read('TopBar.module.css')).toMatch(/\.askDot \{[^}]*\n {2}background: var\(--hx-acc\);/);
    expect(read('BottomNav.module.css')).toMatch(/\.dot \{[^}]*\n {2}background: var\(--hx-acc\);/);
  });

  // The accent counts are the kit badge in its accent tone, which carries the chalk line: every place that pins one
  // passes that tone (only the "needs you" count in the sidebar; unread and a page's own count stay neutral), and the
  // badge's accent draws the line from --hx-count-line, the muted grey under chalk in light only.
  it('the accent counts are kit CountBadges in the accent tone, which draw the chalk line themselves', () => {
    const src = (f: string) => read(f).replace(/\s+/g, ' ');
    expect(src('Sidebar.tsx')).toContain("<CountMark n={badge.count} capped={badge.capped} tone={badge.tone === 'needs' ? 'accent' : 'neutral'} className={s.count} />");
    expect(src('CountMark.tsx')).toMatch(/<CountBadge count=\{n\} atLeast=\{capped\} hidden tone=\{tone\} \/>/);
    const kit = (f: string) => fs.readFileSync(path.join(__dirname, '../kit', f), 'utf8');
    expect(kit('controls/CountBadge.module.css')).toMatch(/\.accent \{[^}]*box-shadow: inset 0 0 0 var\(--bw\) var\(--hx-count-line\);/);
    expect(kit('tokens.css')).toMatch(/:root\[data-hx-hl="chalk"\] \{[^}]*--hx-count-line: var\(--hx-muted-fill\);/);
    expect(kit('tokens.css')).toMatch(/:root\[data-hx-theme="dark"\]\[data-hx-hl="chalk"\] \{[^}]*--hx-count-line: var\(--hx-acc\);/);
    for (const f of ['TopBar.tsx', 'BottomNav.tsx']) {
      const marks = src(f).match(/<CountMark [^>]*\/>/g) ?? [];
      expect(marks.length, f).toBeGreaterThan(0);
      for (const m of marks) expect(m, f).toMatch(/tone="accent" className=\{s\.(count|bellCount)\}/);
    }
  });
});
