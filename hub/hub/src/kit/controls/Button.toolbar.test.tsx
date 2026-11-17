// The kit Button size "toolbar": a table toolbar's control. It never carries the end glyph, takes the toolbar class and
// the toolbar's height and cut, and no ink rule covers a state: a toolbar IconButton marked as a drop target keeps the
// drop-target ink (IconButton dropTarget, the Board strip). The CSS is read from source: jsdom applies no CSS module
// rules.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, IconButton, chipFor } from './Button';
import s from './Button.module.css';

const css = readFileSync(join(import.meta.dirname, 'Button.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** Every top-level rule as [selector, body]. */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1]!.trim(), m[2]!] as const);

/** A selector's weight in classes, attributes and pseudo-classes (:not and :is take their heaviest argument, :where none). */
function weight(sel: string): number {
  let n = 0;
  const rest = sel
    .replace(/::[\w-]+/g, '')
    .replace(/:where\([^)]*\)/g, '')
    .replace(/:(?:not|is)\(([^)]*)\)/g, (_m, args: string) => {
      n += Math.max(...args.split(',').map(weight));
      return '';
    });
  return n + (rest.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g) ?? []).length;
}

describe('Button size "toolbar"', () => {
  it('never carries the end glyph, whatever the variant or request', () => {
    for (const variant of ['primary', 'secondary', 'ghost', 'row', 'danger'] as const)
      for (const chip of [undefined, true, false]) expect(chipFor({ variant, size: 'toolbar', hasEnd: false, chip }), `${variant} chip=${chip}`).toBe(false);
    render(
      <Button size="toolbar" variant="primary" chip>
        Export
      </Button>,
    );
    const b = screen.getByRole('button', { name: 'Export' });
    expect(b).not.toHaveAttribute('data-glyph');
    expect(b.querySelector('[data-glyph-mark]')).toBeNull();
  });

  it('is as tall as the toolbar field beside it, with the md cut, in the toolbar label type; set after every other size', () => {
    const body = new Map(rules.find(([sel]) => sel === '.button.toolbar')![1].split(';').map((d) => d.split(':').map((x) => x.trim()) as [string, string]));
    expect(body.get('--plate-h')).toBe('var(--tb-ctl-h)');
    expect(body.get('--plate-cut')).toBe('var(--btn-cut)');
    expect(body.get('padding-inline')).toBe('var(--sp-3)');
    expect([body.get('font-size'), body.get('font-weight'), body.get('letter-spacing')]).toEqual(['var(--fs-sm)', 'var(--fw-medium)', 'var(--tracking-label)']);
    // Two classes and last of the rules that set a plate height, so it outweighs a variant's, a strip's or the three-dot's.
    const sizing = rules.filter(([, b]) => /(^|[;\s])--plate-h\s*:/.test(b)).map(([sel]) => sel);
    expect(sizing.at(-1)).toBe('.button.toolbar');
    // An open toolbar control holds the family's pressed step.
    const open = rules.find(([sel]) => sel === '.button.toolbar.pressed')![1];
    expect(open).toMatch(/--plate:\s*var\(--hx-btn-plate-press\)/);
    expect(open).toMatch(/--plate-line:\s*var\(--hx-btn-line-hover\)/);
  });

  it('a toolbar Button and IconButton carry the toolbar class', () => {
    render(
      <>
        <Button size="toolbar" variant="secondary">
          Filters
        </Button>
        <IconButton size="toolbar" icon="reload" label="Refresh" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Filters' }).classList.contains(s.toolbar!)).toBe(true);
    expect(screen.getByRole('button', { name: 'Refresh' }).classList.contains(s.toolbar!)).toBe(true);
  });

  it('a toolbar IconButton marked as a drop target keeps the drop-target ink: no heavier or later ink rule covers it', () => {
    render(<IconButton size="toolbar" icon="plus" label="New Board" dropTarget />);
    const b = screen.getByRole('button', { name: 'New Board' });
    expect(b.getAttribute('data-drop-target')).not.toBeNull();
    expect(b.classList.contains(s.toolbar!)).toBe(true);
    // The drop-target ink rule exists.
    const DROP = '.iconOnly[data-drop-target]';
    const ink = (body: string) => /(?:^|[;\s])color\s*:\s*([^;]+)/.exec(body)?.[1]?.trim();
    const dropAt = rules.findIndex(([sel]) => sel === DROP);
    expect(dropAt).toBeGreaterThanOrEqual(0);
    expect(ink(rules[dropAt]![1])).toBe('var(--hx-ink)');
    // Every ink rule that can reach a toolbar icon button (it names the icon-only or the toolbar class and does not
    // leave a toolbar control or a drop target out) is lighter than the drop-target rule, or as heavy and before it,
    // or gives the same ink.
    const reaching = rules.flatMap(([sel, body], at) =>
      ink(body) === undefined
        ? []
        : sel
            .split(/,(?![^(]*\))/)
            .map((one) => one.trim())
            .filter((one) => /\.(iconOnly|toolbar)\b/.test(one.replace(/:not\([^)]*\)/g, '')) && !/:not\([^)]*(\.toolbar|\[data-drop-target\])[^)]*\)/.test(one) && one !== DROP)
            .map((one) => ({ one, at, ink: ink(body)! })),
    );
    expect(reaching.map((r) => r.one), 'the icon ink the drop target must outweigh is among them').toContain('.iconOnly');
    for (const r of reaching) {
      const covers = weight(r.one) > weight(DROP) || (weight(r.one) === weight(DROP) && r.at > dropAt);
      expect(!covers || r.ink === 'var(--hx-ink)', `${r.one} must not cover a drop target's ink`).toBe(true);
    }
  });

  it('the weight helper counts the CSS way', () => {
    expect(weight('.iconOnly')).toBe(1);
    expect(weight('.iconOnly[data-drop-target]')).toBe(2);
    expect(weight('.iconOnly.ghost:not(.more, .toolbar, .inStrip)[data-hovered]')).toBe(4);
    expect(weight('.iconOnly:is(.danger, .dangerSolid)')).toBe(2);
    expect(weight(':where(.button:not(.iconOnly, .xs))')).toBe(0);
    expect(weight('.iconOnly.xs::after')).toBe(2);
  });
});
