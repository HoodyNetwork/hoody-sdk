// Vitest: the header's Add funds ends in a dollar sign on Plans and on Wallet & usage, never the
// plus or the arrow the kit would pick for its label.
import { describe, expect, it } from 'vitest';
import { cleanup, renderPage, screen } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

async function headerAddFunds(path: string) {
  await renderPage(page, { path });
  const [button] = await screen.findAllByRole('button', { name: strings.addFunds }, { timeout: 8000 });
  return button!;
}

describe('Add funds shows the dollar glyph', () => {
  it.each([['/billing'], ['/billing?view=wallet']])('%s', async (path) => {
    const button = await headerAddFunds(path);
    expect(button.querySelector('[data-glyph-mark] [data-px]')?.getAttribute('data-px')).toBe('dollar');
    cleanup();
  });
});
