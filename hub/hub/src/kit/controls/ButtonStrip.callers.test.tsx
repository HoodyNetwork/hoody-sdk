// The strip context is minimal and changes no other Button caller. Every Button, IconButton and LinkButton outside a
// ButtonStrip, across the variant/size/glyph/end-icon matrix, renders with no strip marker, no strip class, and the end
// glyph exactly when chipFor says so (LinkButton's variant/chip props are a typed union; the matrix casts them so every
// runtime pairing is checked, the invalid ones included); a button beside a strip (not inside it) is the same.
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { Button, IconButton, LinkButton, chipFor, type ButtonSize, type ButtonProps, type ButtonVariant, type LinkButtonProps } from './Button';
import s from './Button.module.css';
import { ButtonStrip } from './ButtonStrip';

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger', 'dangerSolid', 'row', 'bubble'];
const SIZES: ButtonSize[] = ['xs', 'sm', 'md', 'toolbar'];
const CHIPS: Array<boolean | undefined> = [undefined, true, false];
const ENDS = [false, true];

/** Every button the element renders carries no strip marker or class; returns whether the outer one draws the end glyph
 *  (the root's data-glyph and the glyph mark inside it always go together). */
function outside(el: ReactElement): boolean {
  const { container, unmount } = render(el);
  const all = Array.from(container.querySelectorAll<HTMLElement>('button, a'));
  expect(all.length).toBeGreaterThan(0);
  for (const b of all) {
    expect(b.hasAttribute('data-strip')).toBe(false);
    expect(b.className.split(/\s+/)).not.toContain(s.inStrip);
  }
  const glyphed = all[0]?.hasAttribute('data-glyph') ?? false;
  expect(all[0]?.querySelector(':scope > [data-glyph-mark]') !== null).toBe(glyphed);
  unmount();
  return glyphed;
}

describe('outside a ButtonStrip nothing changes', () => {
  it('the strip class name is a real class (the checks below are not vacuous)', () => expect(s.inStrip).toBeTruthy());
  for (const variant of VARIANTS)
    for (const size of SIZES)
      for (const chip of CHIPS)
        for (const end of ENDS) {
          const props = { variant, size, chip, ...(end ? { iconEnd: 'chevron-down' as const } : {}) };
          const want = chipFor({ variant, size, hasEnd: end, chip });
          const wantLink = chipFor({ variant, size, hasEnd: end, chip, link: true });
          it(`Button ${JSON.stringify(props)}: glyph ${want}, no strip`, () => expect(outside(<Button {...(props as unknown as ButtonProps)}>Go</Button>)).toBe(want));
          it(`LinkButton ${JSON.stringify(props)}: glyph ${wantLink}, no strip`, () =>
            expect(outside(<LinkButton {...({ ...props, href: '/x' } as unknown as LinkButtonProps)}>Go</LinkButton>)).toBe(wantLink));
        }
  for (const variant of ['primary', 'secondary', 'ghost', 'danger'] as const)
    for (const more of [false, true])
      it(`IconButton ${variant} more=${more}: no glyph, no strip`, () =>
        expect(outside(<IconButton icon="dots" label="More" variant={variant} more={more} />)).toBe(false));
  it('a button rendered beside a strip, not inside it, takes neither the strip look nor loses its glyph', () => {
    const { getByRole } = render(
      <div>
        <ButtonStrip label="Actions">
          <Button variant="ghost">Inside</Button>
        </ButtonStrip>
        <Button variant="primary">Beside</Button>
      </div>,
    );
    const beside = getByRole('button', { name: 'Beside' });
    expect(beside.hasAttribute('data-strip')).toBe(false);
    expect(beside.hasAttribute('data-glyph')).toBe(true);
    // Inside the strip a button never draws the glyph.
    expect(getByRole('button', { name: 'Inside' }).hasAttribute('data-glyph')).toBe(false);
    expect(getByRole('button', { name: 'Inside' }).hasAttribute('data-strip')).toBe(true);
  });
});
