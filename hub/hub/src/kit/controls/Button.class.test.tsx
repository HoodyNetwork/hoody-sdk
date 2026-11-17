// buttonClass is the kit Button's base classes only (the base, the variant, the size), and the Button renders exactly
// the composition spelled out here for every variant x size x full width x strip x glyph x caller class: base, variant,
// size; then full, the strip look, the caller's class. The end glyph needs no root class: a glyph button and a
// glyphless one of the same variant and size carry the same classes. md is the default and has no rule in the CSS (the
// test's CSS modules give every key a name, so `s.md` reads 'md' here; in a build it is no class at all).
import { readFileSync } from 'node:fs';
import { join as joinPath } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Button, buttonClass, chipFor, type ButtonVariant } from './Button';
import { ButtonStrip } from './ButtonStrip';
import s from './Button.module.css';

afterEach(cleanup);

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger', 'dangerSolid', 'row', 'bubble'];
const join = (...p: Array<string | false | undefined>) => p.filter(Boolean).join(' ');

describe('buttonClass', () => {
  it('the classes it composes are rules of the Button CSS; md and the retired looks have none', () => {
    const css = readFileSync(joinPath(import.meta.dirname, 'Button.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const has = (name: string) => new RegExp(`\\.${name}(?![\\w-])`).test(css);
    for (const name of ['button', ...VARIANTS, 'xs', 'sm', 'toolbar', 'full', 'inStrip']) expect(has(name), name).toBe(true);
    for (const gone of ['md', 'lg', 'chipped', 'cell', 'sep', 'chip', 'blue', 'grey']) expect(has(gone), gone).toBe(false);
  });

  it('is the base, the variant and the size, nothing else; the glyph adds no class', () => {
    expect(buttonClass({ variant: 'primary', size: 'md', chipped: true })).toBe(join(s.button, s.primary, s.md));
    expect(buttonClass({ variant: 'primary', size: 'md', chipped: false })).toBe(join(s.button, s.primary, s.md));
    expect(buttonClass({ variant: 'primary', size: 'md' })).toBe(join(s.button, s.primary, s.md));
    expect(buttonClass({ variant: 'primary', size: 'sm', chipped: true })).toBe(join(s.button, s.primary, s.sm));
    expect(buttonClass({ variant: 'ghost', size: 'sm', chipped: false })).toBe(join(s.button, s.ghost, s.sm));
    expect(buttonClass({ variant: 'ghost', size: 'xs' })).toBe(join(s.button, s.ghost, s.xs));
    expect(buttonClass({ variant: 'secondary', size: 'toolbar', chipped: false })).toBe(join(s.button, s.secondary, s.toolbar));
  });

  it('the kit Button renders exactly these classes for every variant, size, width, strip, glyph and caller class', () => {
    for (const variant of VARIANTS)
      for (const size of ['xs', 'sm', 'md', 'toolbar'] as const)
        for (const fullWidth of [false, true])
          for (const inStrip of [false, true])
            for (const chip of [undefined, true, false])
              for (const className of [undefined, 'mine']) {
                const props = { variant, size, fullWidth, className, chip } as Parameters<typeof Button>[0];
                const b = <Button {...props}>{'Go'}</Button>;
                render(inStrip ? <ButtonStrip label="strip">{b}</ButtonStrip> : b);
                const el = screen.getByRole('button', { name: 'Go' });
                const what = `${variant} ${size} full=${fullWidth} strip=${inStrip} chip=${chip} ${className}`;
                expect(el.className, what).toBe(join(s.button, s[variant], s[size], fullWidth && s.full, inStrip && s.inStrip, className));
                // The glyph is markup, never a class: drawn exactly when chipFor says so, and never in a strip.
                expect(el.hasAttribute('data-glyph'), what).toBe(!inStrip && chipFor({ variant, size, hasEnd: false, chip }));
                cleanup();
              }
  });
});
