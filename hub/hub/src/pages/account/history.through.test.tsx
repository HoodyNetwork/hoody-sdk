// Vitest: Security history's "Through" column says how a sign-in came in with the sessions table's
// words (logic historyChannel), never the server's raw channel ("web", "cli", "unknown"); a channel it does not know
// shows the no-value dash. The fixture history signs in through web and once through cli; Everything adds an event
// with no channel ("backup code used").
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const SLOW = { timeout: 8000 };
const table = () => screen.findByRole('table', { name: strings['h.title'] }, SLOW);
const bodyRows = async () => within(await table()).getAllByRole('row').filter((r) => r.closest('tbody'));

describe('security history: Through', () => {
  it('names the channel with the session words, never the raw channel', async () => {
    await renderPage(page);
    const t = await table();
    expect((await within(t).findAllByText(strings['s.ch.web'], undefined, SLOW)).length).toBeGreaterThan(0);
    expect(within(t).getAllByText(strings['s.ch.cli'])).toHaveLength(1);
    expect(within(t).queryByText(/^(web|cli|unknown|webssh)$/)).toBeNull();
  });

  it('an entry without a known channel shows the no-value dash', async () => {
    await renderPage(page, { path: '/account?history=all' });
    const cell = (await within(await table()).findByText('backup code used', undefined, SLOW)).closest('tr') as HTMLElement;
    expect(within(cell).getByText('—')).toBeInTheDocument();
    expect(within(cell).queryByText(strings['s.ch.web'])).toBeNull();
  });

  // Raw, "cli" sorts before "web"; shown, "Browser" sorts before "Hoody CLI".
  it('the column sorts up by the shown word, not the raw channel', async () => {
    await renderPage(page, { path: '/account?histsort=client' });
    await within(await table()).findAllByText(strings['s.ch.web'], undefined, SLOW);
    const rows = await bodyRows();
    expect(within(rows[0]!).getByText(strings['s.ch.web'])).toBeInTheDocument();
    expect(within(rows[rows.length - 1]!).getByText(strings['s.ch.cli'])).toBeInTheDocument();
  });

  it('the column sorts down by the shown word, not the raw channel', async () => {
    await renderPage(page, { path: '/account?histsort=-client' });
    await within(await table()).findAllByText(strings['s.ch.cli'], undefined, SLOW);
    const rows = await bodyRows();
    expect(within(rows[0]!).getByText(strings['s.ch.cli'])).toBeInTheDocument();
    expect(within(rows[rows.length - 1]!).getByText(strings['s.ch.web'])).toBeInTheDocument();
  });

  it('the search still finds a sign-in by its raw channel', async () => {
    await renderPage(page);
    const view = (await table()).closest('[data-dataview]') as HTMLElement;
    // "web" is only in the raw channel: the shown word is "Browser". 8 of the 9 sign-ins came in through web.
    await userEvent.type(within(view).getByRole('searchbox'), 'web');
    await waitFor(async () => expect(await bodyRows()).toHaveLength(8), SLOW);
    expect(within(await table()).queryByText(strings['s.ch.cli'])).toBeNull();
  });

  it('the search finds a sign-in by the shown word', async () => {
    await renderPage(page);
    const view = (await table()).closest('[data-dataview]') as HTMLElement;
    await userEvent.type(within(view).getByRole('searchbox'), strings['s.ch.cli']);
    await waitFor(async () => expect(await bodyRows()).toHaveLength(1), SLOW);
    expect(within(await table()).getByText(strings['s.ch.cli'])).toBeInTheDocument();
  });
});
