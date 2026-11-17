// Vitest: a running computer whose desktop address the Hub cannot build (server or proxy domain unknown: desktopUrl
// answers '') says so, with no frame and no Open in a new tab (never a frame of about:blank).
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';
import type * as urlsModule from './urls';

vi.mock('./urls', async (orig) => {
  const real = await orig<typeof urlsModule>();
  return { ...real, desktopUrl: () => '' };
});

describe('computers: Desktop tab, no address', () => {
  it('says there is no address, with no frame and nothing to open', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=desktop' });
    await screen.findByText(strings['desktop.noAddress'], undefined, { timeout: 8000 });
    const panel = screen.getByRole('tabpanel');
    expect(panel.querySelector('iframe')).toBeNull();
    expect(within(panel).queryByRole('link', { name: strings['desktop.open'] })).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Put on Board' })).toBeNull();
  }, 30000);
});
