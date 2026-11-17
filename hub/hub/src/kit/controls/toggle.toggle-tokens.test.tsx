// Vitest: every toggle group (SegmentedControl, a radiogroup of radio
// buttons) is one track in the field look (the input fill, the field line) with a white thumb under the current option. The CSS is read as text (a CSS module import gives class names,
// not rules); the component is rendered for the a11y invariants. The computed side, both themes, is d2toggle.spec.ts.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './SegmentedControl';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

const KIT = path.join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(KIT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of the first rule whose selector list is exactly `sel`. */
function rule(file: string, sel: string): Map<string, string> | null {
  for (const m of read(file).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if ((m[1] ?? '').replace(/\s+/g, ' ').trim() !== sel) continue;
    const out = new Map<string, string>();
    for (const d of (m[2] ?? '').split(';')) {
      const i = d.indexOf(':');
      if (i > 0) out.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
    }
    return out;
  }
  return null;
}
const SEG = 'controls/SegmentedControl.module.css';
const root = rule('tokens.css', ':root');
const dark = rule('tokens.css', ':root[data-hx-theme="dark"]');

describe('toggle tokens', () => {
  it('light: track the field fill #f8f8f8, frame the field line, thumb #fff, ink #101010, text #5c5c5c, shadow 0 2px 2px 10%', () => {
    expect(root?.get('--hx-input-bg')).toBe('#f8f8f8');
    expect(root?.get('--hx-field-bg')).toBe('var(--hx-input-bg)');
    expect(root?.get('--hx-field-line')).toBe('#7a7a7a');
    expect(root?.get('--hx-tog-track')).toBe('var(--hx-field-bg)');
    expect(root?.get('--hx-tog-line')).toBe('var(--hx-field-line)');
    expect(root?.get('--hx-tog-thumb')).toBe('#fff');
    expect(root?.get('--hx-frame')).toBe('#101010');
    expect(root?.get('--hx-tog-ink')).toBe('var(--hx-frame)');
    expect(root?.get('--hx-dim')).toBe('#5c5c5c');
    expect(root?.get('--hx-tog-text')).toBe('var(--hx-dim)');
    expect([root?.get('--tog-h-default'), root?.get('--tog-pad'), root?.get('--tog-gap')]).toEqual(['32px', '3px', '7px']);
    expect(root?.get('--sh-tog')).toBe('0 2px 2px rgb(0 0 0 / 10%)');
  });
  it('dark: a sunken track, a raised thumb, ink and muted text', () => {
    expect(dark?.get('--hx-tog-track')).toBe('var(--hx-field-bg)');
    expect(dark?.get('--hx-tog-line')).toBe('var(--hx-field-line)');
    expect(dark?.get('--hx-input-bg')).toBe('var(--hx-bg)');
    expect(dark?.get('--hx-tog-thumb')).toBe('var(--hx-fill)');
    expect(dark?.get('--hx-tog-ink')).toBe('var(--hx-ink)');
    expect(dark?.get('--hx-dim')).toBe('var(--hx-muted-text)');
    expect(dark?.get('--hx-tog-text')).toBe('var(--hx-dim)');
  });
});

describe('the look', () => {
  it('the track: 3 px padding, 2 px gap, 1 px frame, the grey, square, no fixed height at any size', () => {
    const t = rule(SEG, '.track');
    expect(t?.get('padding')).toBe('var(--tog-pad)');
    expect(t?.get('gap')).toBe('var(--sp-half)');
    expect(t?.get('border')).toBe('var(--bw) solid var(--hx-tog-line)');
    expect(t?.get('background')).toBe('var(--hx-tog-track)');
    expect(t?.get('border-radius')).toBe('0');
    expect(t?.has('height')).toBe(false);
    expect(rule(SEG, '.md')).toBeNull();
    expect(rule(SEG, '.lg')).toBeNull();
  });
  it('an option: 32 px (--tog-h), 12 px sides, 7 px icon gap, no fill or frame, the text grey, mono 12/500/uppercase/0.06em', () => {
    const o = rule(SEG, '.segment');
    expect(o?.get('height')).toBe('var(--tog-h)');
    expect(o?.get('padding-inline')).toBe('var(--seg-pad-inline, var(--sp-3))');
    expect(o?.get('gap')).toBe('var(--tog-gap)');
    expect(o?.get('border')).toBe('var(--bw) solid transparent');
    expect(o?.get('background')).toBe('transparent');
    expect(o?.get('border-radius')).toBe('0');
    expect(o?.get('color')).toBe('var(--hx-tog-text)');
    expect(o?.get('font-family')).toBe('var(--font-mono)');
    expect(o?.get('font-size')).toBe('var(--fs-sm)');
    expect(o?.get('font-weight')).toBe('var(--fw-medium)');
    // The design's 0.06em, through its tracking role.
    expect(o?.get('letter-spacing')).toBe('var(--tracking-label)');
    expect(root?.get('--tracking-label')).toBe('0.06em');
    expect(o?.get('text-transform')).toBe('uppercase');
  });
  it('hover turns the text ink; the current option is the thumb with an ink frame and a shadow', () => {
    expect(rule(SEG, '.segment[data-hovered], .segment[data-pressed]')?.get('color')).toBe('var(--hx-tog-ink)');
    const c = rule(SEG, '.segment[data-selected]');
    expect(c?.get('background')).toBe('var(--hx-tog-thumb)');
    expect(c?.get('border-color')).toBe('var(--hx-tog-ink)');
    expect(c?.get('color')).toBe('var(--hx-tog-ink)');
    expect(c?.get('box-shadow')).toBe('var(--sh-tog)');
  });
  it('a count is part of its label: the option\'s colour (idle, hovered, current) and its 12/500 mono text', () => {
    const k = rule(SEG, '.count');
    expect(k?.get('color')).toBe('inherit');
    expect(k?.get('font')).toBe('inherit');
  });
  it('focus: the kit ring, no outline', () => {
    const f = rule(SEG, '.segment[data-focus-visible]');
    expect(f?.get('box-shadow')).toBe('var(--focus-ring)');
    expect(f?.get('outline')).toBe('none');
  });
});

describe('a11y unchanged', () => {
  it('a radiogroup named by its label, radios named by their labels, the current one checked', () => {
    render(<SegmentedControl label="View" items={[{ id: 'a', label: 'Cards' }, { id: 'b', label: 'List', count: 3 }]} value="b" onChange={() => undefined} />);
    const g = screen.getByRole('radiogroup', { name: 'View' });
    expect(g).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Cards' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'true');
  });
});
