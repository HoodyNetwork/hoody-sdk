// Vitest: a computer whose server is not known: the Desktop tab still renders. Running, it
// says there is no address (no frame, no open, no Board) and never asks the terminal program for its sessions; stopped,
// it shows the stopped state. Nothing is mocked: the fixture computer has no server, so no address can be built.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

describe('computers: Desktop tab, server not known', () => {
  it('a running computer says there is no address, with no frame, no open and no Board, and reads no sessions', async () => {
    const r = await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=desktop', state: 'noServer' });
    await screen.findByText(strings['desktop.noAddress'], undefined, { timeout: 8000 });
    const panel = screen.getByRole('tabpanel');
    expect(panel.querySelector('iframe')).toBeNull();
    expect(within(panel).queryByRole('link', { name: strings['desktop.open'] })).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Put on Board' })).toBeNull();
    await new Promise((res) => setTimeout(res, 300));
    // The desktops read never ran (no answer and no error recorded for it).
    const ran = r.queryClient.getQueryCache().getAll().filter((q) => JSON.stringify(q.queryKey).includes('desktops') && (q.state.dataUpdatedAt > 0 || q.state.errorUpdatedAt > 0 || q.state.fetchStatus !== 'idle'));
    expect(ran).toEqual([]);
  }, 30000);

  it('a stopped computer shows the stopped state', async () => {
    await renderPage(page, { path: '/computers?sel=cedar.00c3&tab=desktop', state: 'noServer' });
    await screen.findByText(strings['desktop.stopped'].replace('{{name}}', 'cedar'), undefined, { timeout: 8000 });
    expect(screen.getByRole('tabpanel').querySelector('iframe')).toBeNull();
  }, 30000);
});
