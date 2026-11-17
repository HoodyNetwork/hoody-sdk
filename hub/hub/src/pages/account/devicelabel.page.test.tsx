// Vitest: the sessions table, its End action and the end confirmation name each device with logic deviceLabel
// (so the Device column never reads "unknown" or "web"). The fixture rows carry what the server records: a
// user agent, the channel, and for one row the client's own name.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const SLOW = { timeout: 8000 };
const table = () => screen.findByRole('table', { name: strings['s.title'] }, SLOW);
// Device names can repeat (one device signed in twice): the first row with the name.
const rowOf = async (text: string) => (await within(await table()).findAllByText(text, undefined, SLOW))[0]?.closest('tr') as HTMLElement;

describe('account: sign-in session device names', () => {
  it('names browsers from their user agent, never "web" or "unknown"', async () => {
    await renderPage(page, { path: '/account?section=sessions' });
    const t = await table();
    expect((await within(t).findAllByText('Chrome on macOS', undefined, SLOW)).length).toBeGreaterThan(0);
    expect(within(t).getAllByText('Firefox on Linux').length).toBeGreaterThan(0);
    expect(within(t).getAllByText('Edge on Windows').length).toBeGreaterThan(0);
    expect(within(t).queryByText(/^(web|unknown)$/i)).toBeNull();
    // A browser row says nothing more: its channel is the browser.
    expect(within(await rowOf('Chrome on macOS')).queryByText(strings['s.ch.web'])).toBeNull();
  });

  it('a named client and a script carry how they signed in as a tag', async () => {
    await renderPage(page, { path: '/account?section=sessions' });
    expect(within(await rowOf('build-server')).getByText(strings['s.ch.cli'])).toBeInTheDocument();
    expect(within(await rowOf('Script (Node.js)')).getByText(strings['s.ch.sdk'])).toBeInTheDocument();
  });

  it('the search finds a row by its tag', async () => {
    await renderPage(page, { path: '/account?section=sessions' });
    const view = (await table()).closest('section') ?? document.body;
    await userEvent.type(within(view as HTMLElement).getByRole('searchbox'), strings['s.ch.sdk']);
    await waitFor(async () => expect(within(await table()).getAllByRole('row').filter((r) => r.closest('tbody'))).toHaveLength(1), { timeout: 8000 });
    expect(within(await table()).getByText('Script (Node.js)')).toBeInTheDocument();
  });

  it('a row the server knows nothing about reads Unknown device', async () => {
    await renderPage(page, { path: '/account?section=sessions' });
    expect(await rowOf(strings['s.unknownDevice'])).toBeInTheDocument();
    expect(strings['s.unknownDevice']).toBe('Unknown device');
  });

  it('the End action and the end confirmation use the same name', async () => {
    await renderPage(page, { path: '/account?section=sessions' });
    const r = await rowOf('Script (Node.js)');
    expect(within(r).getByRole('button', { name: 'End the session on Script (Node.js)' })).toBeInTheDocument();
    await renderPage(page, { path: '/account?end=5e55c0ffee00000000000009' });
    expect(await screen.findByText(/^Script \(Node\.js\) must sign in again\./, undefined, SLOW)).toBeInTheDocument();
  });
});
