// Vitest: the Programs tab of a computer whose server is not known. The programs read needs the
// server to build its target, so it never runs; a running computer says plainly why nothing lists (no error, no empty
// "No programs"), and a stopped one keeps the stopped state. Nothing is mocked: the fixture computer has no server.
import { describe, expect, it } from 'vitest';
import { renderPage, screen } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

describe('computers: Programs tab, server not known', () => {
  it('a running computer says why no programs list, and reads none', async () => {
    const r = await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=programs', state: 'noServer' });
    await screen.findByText(strings['prog.noServer'], undefined, { timeout: 8000 });
    expect(screen.getByText(strings['prog.noServer.body'])).toBeInTheDocument();
    expect(screen.queryByText(strings['prog.empty'])).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    await new Promise((res) => setTimeout(res, 300));
    const ran = r.queryClient.getQueryCache().getAll().filter((q) => JSON.stringify(q.queryKey).includes('programs') && (q.state.dataUpdatedAt > 0 || q.state.errorUpdatedAt > 0 || q.state.fetchStatus !== 'idle'));
    expect(ran).toEqual([]);
  }, 30000);

  it('a stopped computer shows the stopped state', async () => {
    await renderPage(page, { path: '/computers?sel=cedar.00c3&tab=programs', state: 'noServer' });
    await screen.findByText(strings['prog.notRunning'].replace('{{name}}', 'cedar'), undefined, { timeout: 8000 });
    expect(screen.queryByText(strings['prog.noServer'])).toBeNull();
  }, 30000);
});
