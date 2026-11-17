// A held or arriving Board tile draws on its own theme surface. The tile body is the
// app window (--hx-app, dark in both themes), so a card that inherits it shows theme ink on near-black. Read from source.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'launch.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of the one rule whose selector is exactly `sel`. */
function rule(sel: string): string {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`no rule ${sel}`);
  return m[1]!;
}
const decl = (body: string, prop: string) => new RegExp(`(?:^|;|\\s)${prop.replace(/-/g, '\\-')}\\s*:\\s*([^;]+);`).exec(body)?.[1]?.trim();

describe('the held tile (.hold) is its own theme surface', () => {
  const hold = rule('.hold');

  it('sets its own background and ink from the theme, never the app window colours', () => {
    expect(decl(hold, 'background')).toBe('var(--hx-bg)');
    expect(decl(hold, 'color')).toBe('var(--hx-ink)');
    expect(css).not.toMatch(/--hx-app/);
  });

  it('fills the tile and centres what it holds', () => {
    expect(decl(hold, 'flex')).toBe('1');
    // safe: a frame taller than a short tile scrolls from its top instead of being cut above it.
    expect(decl(hold, 'align-items')).toBe('safe center');
    expect(decl(hold, 'justify-content')).toBe('safe center');
    expect(decl(hold, 'overflow')).toBe('auto');
  });

  it('keeps its text to a readable measure, centred; the outcome banner keeps its own alignment', () => {
    expect(decl(rule('.frame'), 'max-width')).toBe('40ch');
    expect(decl(rule('.loader'), 'text-align')).toBe('center');
    expect(decl(rule('.frame'), 'text-align')).toBeUndefined();
  });

  it('the step reads as the title (the title type, theme ink)', () => {
    expect(decl(rule('.title'), 'font')).toBe('var(--t-title)');
    expect(decl(rule('.title'), 'color')).toBe('var(--hx-ink)');
  });

  it('the wait lines read in the muted theme colour, the time in tabular figures', () => {
    expect(decl(rule('.wait'), 'color')).toBe('var(--hx-muted)');
    expect(decl(rule('.elapsed'), 'font-variant-numeric')).toBe('tabular-nums');
  });
});
