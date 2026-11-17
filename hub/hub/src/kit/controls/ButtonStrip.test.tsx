// ButtonStrip: quiet actions joined into one row of plates at the control height, on one shared line, where only the
// strip's last button carries the cut. The CSS is read as text (a CSS module import gives class names, not rules); the
// component is rendered for the a11y invariants and the DOM shape the shared-line rule needs. The computed side, both
// themes, is d18strip.spec.ts.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActionMenu } from '../overlays/Menu';
import { Button, IconButton } from './Button';
import { ButtonStrip } from './ButtonStrip';

const KIT = path.join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(KIT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const oneLine = (sel: string) => sel.replace(/\s+/g, ' ').trim();

/** Every innermost rule of a file as [selector list on one line, declarations]. */
function rules(file: string): Array<[string, Map<string, string>]> {
  return [...read(file).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => {
    const out = new Map<string, string>();
    for (const d of (m[2] ?? '').split(';')) {
      const i = d.indexOf(':');
      if (i > 0) out.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
    }
    return [oneLine(m[1] ?? ''), out];
  });
}
/** The declarations of the first rule whose selector list is exactly `sel`. */
const rule = (file: string, sel: string): Map<string, string> | null => rules(file).find(([s]) => s === sel)?.[1] ?? null;
const BTN = 'controls/Button.module.css';
const stripRules = rules(BTN).filter(([sel]) => /\.inStrip\b/.test(sel.replace(/:not\([^)]*\)/g, '')));

describe('a strip has no colours of its own', () => {
  it('no strip token is declared or read: a strip button is the family\'s plate', () => {
    expect(read('tokens.css')).not.toMatch(/--hx-strip-/);
    expect(read(BTN)).not.toMatch(/--hx-strip-/);
    expect(read('controls/ButtonStrip.module.css')).not.toMatch(/--hx-|background|border/);
  });
  it('no strip rule paints: none sets a plate colour, a background, a border colour, an ink, a shadow or a transform', () => {
    expect(stripRules.length).toBeGreaterThanOrEqual(5);
    const painted = stripRules.flatMap(([sel, d]) => [...d.keys()].filter((p) => /^(--plate|--plate-line|background(-color|-image)?|border(-color)?|color|box-shadow|transform|translate)$/.test(p)).map((p) => `${sel} | ${p}`));
    expect(painted).toEqual([]);
  });
});

describe('the look, in the shared Button CSS (no page override)', () => {
  it('a button in a strip: a plate at the header button height (32 px) with the strip padding, sized through --plate-h alone', () => {
    const r = rule(BTN, '.button.inStrip');
    expect(r?.get('--plate-h')).toBe('var(--btn-h)');
    expect(r?.get('padding-inline')).toBe('var(--sp-3)');
    expect([...r!.keys()].sort()).toEqual(['--plate-cut', '--plate-h', 'padding-inline']);
    // Square like every plate: the family's base rule, which no strip rule overrides.
    expect(rule(BTN, '.button')?.get('border-radius')).toBe('0');
    expect(stripRules.some(([, d]) => d.has('border-radius'))).toBe(false);
  });
  it('only the strip\'s last button carries the cut', () => {
    expect(rule(BTN, '.button.inStrip')?.get('--plate-cut')).toBe('var(--btn-cut)');
    expect(rule(BTN, '.button.inStrip:has(~ .button.inStrip)')?.get('--plate-cut')).toBe('0px');
    // After the rule it narrows, and heavier, so it wins.
    const css = read(BTN);
    expect(css.indexOf('.button.inStrip:has(~ .button.inStrip)')).toBeGreaterThan(css.indexOf('.button.inStrip {'));
  });
  it('an icon button in a strip is a square, no padding', () => {
    expect(rule(BTN, '.button.iconOnly.inStrip')?.get('padding-inline')).toBe('0');
    const icon = rule(BTN, '.iconOnly');
    expect(icon?.get('inline-size')).toBe(icon?.get('block-size'));
  });
  it('one shared line: the second button drops its start edge', () => {
    expect(rule(BTN, '.button.inStrip ~ .button.inStrip')?.get('border-inline-start-width')).toBe('0');
  });
  it('hover and press are the family\'s steps (the darker plate inside the full-ink line); the focus ring stays, above its neighbour', () => {
    // No strip rule restates a state: a strip button takes the family's hover and pressed plate.
    expect(stripRules.map(([sel]) => sel).filter((sel) => /data-hovered|data-pressed/.test(sel))).toEqual([]);
    const h = rule(BTN, '.button[data-hovered]');
    expect([h?.get('--plate'), h?.get('--plate-line')]).toEqual(['var(--hx-btn-plate-hover)', 'var(--hx-btn-line-hover)']);
    const p = rule(BTN, '.button[data-pressed]');
    expect([p?.get('--plate'), p?.get('--plate-line')]).toEqual(['var(--hx-btn-plate-press)', 'var(--hx-btn-line-hover)']);
    expect(rule(BTN, '.button[data-focus-visible]')?.get('box-shadow')).toBe('var(--focus-ring)');
    // A focused strip button paints above its later neighbour, so the neighbour never covers the ring.
    expect(rule(BTN, '.button.inStrip[data-focus-visible]')?.get('z-index')).toBe('var(--z-raised)');
  });
  it('an icon-only ghost in a strip keeps its plate: the frameless rules leave strip buttons out', () => {
    const frameless = rules(BTN).map(([sel]) => sel).filter((sel) => sel.startsWith('.iconOnly.ghost'));
    expect(frameless.length).toBeGreaterThanOrEqual(3);
    for (const sel of frameless) expect(sel, sel).toContain(':not(.more, .toolbar, .inStrip)');
  });
  it('an icon button in a strip never drops under its touch target (compact density on a coarse pointer)', () => {
    // A text button takes --touch-min from the Button rule (:where, coarse only), which beats the plate height; the icon
    // button takes --icon-hit (44 on a coarse pointer), so the two stay one height whatever --ctl-h is.
    const icon = rule(BTN, '.iconOnly');
    expect([icon?.get('inline-size'), icon?.get('block-size')]).toEqual(['max(var(--plate-h), var(--icon-hit))', 'max(var(--plate-h), var(--icon-hit))']);
    // No strip rule sets a size of its own over it. The one sized strip rule is the coarse label floor of a strip button
    // WITH words (`:where(.button.inStrip:not(.iconOnly) > .label)`, a minimum on the label, pinned in touch-tokens.test.ts);
    // it names the label of a non-icon button, so it never reaches an icon button.
    const sized = stripRules.filter(([, d]) => [...d.keys()].some((k) => /^(min-|max-)?(inline-size|block-size|width|height)$/.test(k)));
    expect(sized.map(([sel]) => sel)).toEqual([':where(.button.inStrip:not(.iconOnly) > .label)']);
    expect(sized[0]![1].get('min-inline-size')).toBe('calc(var(--touch-min) - 2 * var(--sp-3))');
    expect([...sized[0]![1].keys()]).toEqual(['min-inline-size']);
  });
  it('the strip rules come after the size and three-dot rules they override', () => {
    const css = read(BTN);
    const at = (sel: string) => {
      const i = css.indexOf(sel);
      expect(i, sel).toBeGreaterThanOrEqual(0);
      return i;
    };
    expect(at('.button.inStrip {')).toBeGreaterThan(at('.iconOnly.more:not(.toolbar, .inStrip) {'));
    expect(at('.button.inStrip {')).toBeGreaterThan(at('\n.sm {'));
    expect(at('.button.inStrip {')).toBeGreaterThan(at('\n.xs {'));
  });
  it('the strip itself only lays out, and draws nothing when empty', () => {
    expect(rule('controls/ButtonStrip.module.css', '.strip')?.get('display')).toBe('inline-flex');
    expect(rule('controls/ButtonStrip.module.css', '.strip:empty')?.get('display')).toBe('none');
  });
});

describe('the strip as rendered', () => {
  it('a named group whose buttons keep their names and sit side by side (the shared-line rule applies)', () => {
    render(
      <ButtonStrip label="Page actions">
        <Button variant="ghost" size="sm" icon="agent">
          Use with your agent
        </Button>
        <ActionMenu label="More actions" items={[{ id: 'a', label: 'Export', onAction: () => {} }]} />
      </ButtonStrip>,
    );
    const group = screen.getByRole('group', { name: 'Page actions' });
    const agent = within(group).getByRole('button', { name: 'Use with your agent' });
    const more = within(group).getByRole('button', { name: 'More actions' });
    expect(agent).toHaveAttribute('data-strip', '');
    expect(more).toHaveAttribute('data-strip', '');
    expect(more).toHaveAttribute('aria-haspopup');
    // Direct children, in order: the `+` rule sees the menu trigger right after the first button.
    expect([...group.children]).toEqual([agent, more]);
    expect(agent.nextElementSibling).toBe(more);
  });

  it('a button inside never draws the end glyph; outside a strip a button is unchanged', () => {
    render(
      <>
        <ButtonStrip label="Strip">
          <Button variant="secondary">Inside</Button>
        </ButtonStrip>
        <Button variant="secondary">Outside</Button>
        <IconButton icon="dots" label="Loose" more />
      </>,
    );
    const inside = screen.getByRole('button', { name: 'Inside' });
    const outside = screen.getByRole('button', { name: 'Outside' });
    expect(inside).not.toHaveAttribute('data-glyph');
    expect(inside.querySelector('[data-glyph-mark]')).toBeNull();
    expect(inside).toHaveAttribute('data-strip', '');
    expect(outside).toHaveAttribute('data-glyph', '');
    expect(outside).not.toHaveAttribute('data-strip');
    expect(outside.className).toBe(outside.className.replace(/inStrip/, ''));
    expect(screen.getByRole('button', { name: 'Loose' })).not.toHaveAttribute('data-strip');
  });

  it('a strip whose children render nothing is an empty element (hidden by :empty)', () => {
    const Nothing = () => null;
    render(
      <ButtonStrip label="Empty">
        <Nothing />
        {false}
      </ButtonStrip>,
    );
    expect(screen.getByRole('group', { name: 'Empty' }).childNodes).toHaveLength(0);
  });
});
