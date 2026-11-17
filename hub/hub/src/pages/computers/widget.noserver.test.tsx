// The Home widget on a running computer whose server is not known: its programs cannot be read, so the
// foot says why, never "Start … to open its programs" for a computer that is running, and no programs read runs.
// A stopped computer keeps the Start line; one that is still starting says so and is never told to "Start".
import { chooseComputer, fixtureWorld } from '@core';
import { describe, expect, it } from 'vitest';
import { act, renderPage, screen } from '@app/testing';
import strings from './strings.en.json';
import page from './page';

const host = { ...page, load: () => import('./widget') };
const named = (n: string) => fixtureWorld.computers.find((c) => c.name === n)!;
const choose = (n: string) => act(async () => { chooseComputer(named(n)); });

describe('computers widget: server not known', () => {
  it('a running computer says its programs cannot be listed, offers no Start line, and reads no programs', async () => {
    const r = await renderPage(host, { state: 'noServer' });
    await choose('atlas');
    await screen.findByText(strings['prog.noServer.body'], undefined, { timeout: 8000 });
    expect(screen.queryByText(strings['widget.stopped'].replace('{{name}}', 'atlas'))).toBeNull();
    await new Promise((res) => setTimeout(res, 300));
    const ran = r.queryClient.getQueryCache().getAll().filter((q) => JSON.stringify(q.queryKey).includes('programs') && (q.state.dataUpdatedAt > 0 || q.state.errorUpdatedAt > 0 || q.state.fetchStatus !== 'idle'));
    expect(ran).toEqual([]);
  }, 30000);

  it('a stopped computer keeps the Start line', async () => {
    await renderPage(host, { state: 'noServer' });
    await choose('cedar');
    await screen.findByText(strings['widget.stopped'].replace('{{name}}', 'cedar'), undefined, { timeout: 8000 });
    expect(screen.queryByText(strings['prog.noServer.body'])).toBeNull();
  }, 30000);

  it('a computer that is still starting says so, with no Start line', async () => {
    await renderPage(host, { state: 'noServer' });
    await choose('dune');
    await screen.findByText(strings['state.starting.note'], undefined, { timeout: 8000 });
    expect(screen.queryByText(strings['widget.stopped'].replace('{{name}}', 'dune'))).toBeNull();
  }, 30000);
});
