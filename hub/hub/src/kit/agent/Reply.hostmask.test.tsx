// Vitest: a Prose link's tooltip names the host it opens. A computer's host holds the project's and the computer's ids:
// they never reach the page whole (the tooltip text is masked, maskAddress, as every shown address is); any other host
// is shown as it is.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Prose } from './Reply';

const P = 'a'.repeat(24);
const C = 'b'.repeat(24);
const HOST = `${P}-${C}-http-3000.sg1.computers.hoody.test`;
let unmount: (() => void) | null = null;
afterEach(() => {
  unmount?.();
  unmount = null;
});

async function focusAndHover(text: string) {
  unmount = render(<Prose text={text} />).unmount;
  const u = userEvent.setup();
  await u.tab();
  await u.hover(document.activeElement as HTMLElement);
}

describe('the host in a Prose link tooltip', () => {
  it("a computer's host: its ids never show whole, focused or hovered", async () => {
    await focusAndHover(`See [the docs](https://${HOST}/guide)`);
    await new Promise((r) => setTimeout(r, 1200)); // reason: past the tooltip delay, so a tooltip would have shown
    expect(document.body.innerHTML).not.toContain(P);
    expect(document.body.innerHTML).not.toContain(C);
  });
  it('any other host: unchanged in the tooltip', async () => {
    await focusAndHover('See [the docs](https://example.org/guide)');
    expect((await screen.findByRole('tooltip')).textContent).toContain('example.org');
  });
});
