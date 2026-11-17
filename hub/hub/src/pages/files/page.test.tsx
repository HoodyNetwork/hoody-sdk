// Vitest: the Files page in every fixture state (states), and what each pane sends.
import { beforeAll, describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within, type RenderedPage } from '@app/testing';
import { seen } from './fixtures';
import { links } from './links';
import page from './page';
import strings from './strings.en.json';

// The page's view loads lazily: load it once up front, so the first case's waits are not spent on that load (a cold
// transform under load takes longer than one 5 s wait).
beforeAll(async () => {
  await import('./view');
}, 120_000);

const A = '/files?a=atlas.00a1';
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
// Core keeps the rows it had when a refresh fails: put the shared computers read in that state.
async function failComputersRefresh(qc: RenderedPage['queryClient']) {
  const q = qc.getQueryCache().getAll().find((x) => x.state.data !== undefined && JSON.stringify(x.queryKey).includes('/computers'));
  if (!q) throw new Error('no computers read in the cache');
  await act(async () => { q.setState({ status: 'error', error: new Error('refresh failed'), fetchStatus: 'idle' }); });
}
const table = (name = 'atlas') => screen.findByRole('table', { name: fill(strings['table.label'], { name }) });

describe('files page', () => {
  it('never calls a top folder empty when it only holds items it cannot show', async () => {
    await renderPage(page, { path: A, state: 'rootHiddenOnly' });
    expect(await screen.findByText(strings['empty.hidden'])).toBeInTheDocument();
    expect(screen.queryByText(strings['empty.title'])).toBeNull();
    expect(screen.getByText(fill(strings.hidden_one, { count: '1' }))).toBeInTheDocument();
  });

  it('shows a top folder with items it cannot show, and says how many are left out', async () => {
    await renderPage(page, { path: A, state: 'rootOdd' });
    const tb = await table();
    expect(await within(tb).findByRole('row', { name: /\bhome\b/ })).toBeInTheDocument();
    expect(within(tb).queryByRole('row', { name: /\bpipe\b/ })).toBeNull();
    expect(screen.getByText(fill(strings.hidden_other, { count: '2' }))).toBeInTheDocument();
  });

  it('is in the main nav after Computers and links in by handle', () => {
    expect(page.nav).toMatchObject({ group: 'main', order: 25, icon: 'files' });
    expect(links.at('atlas.00a1')).toBe('/files?computer=atlas.00a1');
    expect(links.at('atlas.00a1', '/srv/app')).toBe('/files?computer=atlas.00a1&path=%2Fsrv%2Fapp');
  });

  it('opens the computer page link as the left pane', async () => {
    const { router } = await renderPage(page, { path: links.at('atlas.00a1', '/srv') });
    await waitFor(() => expect(router.state.location.search).toMatchObject({ a: 'atlas.00a1', ap: '/srv' }));
    expect(router.state.location.search).not.toHaveProperty('computer');
    await within(await table()).findByRole('row', { name: /media/ });
  });

  it('lists the top folder, folders first, and opens a folder with Enter', async () => {
    seen.length = 0;
    const { router } = await renderPage(page, { path: A });
    const t = await table();
    await within(t).findByRole('row', { name: /\bbin\b/ });
    const rows = within(t).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('bin');
    expect(seen).toContain('atlas:/');
    const srv = within(t).getByRole('row', { name: /\bsrv\b/ });
    srv.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.search).toMatchObject({ a: 'atlas.00a1', ap: '/srv' }));
    await within(await table()).findByRole('row', { name: /media/ });
  });

  it('starts the left pane on the top bar computer, and asks for one on the right', async () => {
    await renderPage(page, { path: '/files' });
    await table();
    // One pane is the default: the Two panes toggle opens the right one.
    await userEvent.click(screen.getByRole('radio', { name: strings['view.two'] }));
    expect(screen.getByText(strings['pick.title'])).toBeInTheDocument();
  });

  it('binds the left pane to the top bar computer, dropping a folder and filters no computer was named for', async () => {
    const { router } = await renderPage(page, { path: '/files?ap=%2Fprivate&aq=secret&akind=file&apage=2' });
    await waitFor(() => expect(router.state.location.search).toMatchObject({ a: 'atlas.00a1' }));
    for (const k of ['ap', 'aq', 'akind', 'apage']) expect(router.state.location.search).not.toHaveProperty(k);
    await within(await table()).findByRole('row', { name: /\bsrv\b/ });
  });

  it('a listing with an entry it cannot read is unreadable, never an empty folder', async () => {
    await renderPage(page, { path: A, state: 'badEntry' });
    expect(await screen.findByText(strings['pr.unreadable'])).toBeInTheDocument();
    expect(screen.queryByText(strings['empty.title'])).toBeNull();
  });

  it('a 403 while the access rules are not known names no cause it cannot prove', async () => {
    await renderPage(page, { path: A, state: 'rulesUnknown' });
    expect(await screen.findByText(strings['pr.denied'])).toBeInTheDocument();
    expect(screen.queryByText(strings['pr.access'])).toBeNull();
    expect(screen.queryByText(strings['pr.refused'])).toBeNull();
  });

  it('a state the computer list cannot place is not called a failed start', () => {
    expect(strings['st.attention']).not.toMatch(/didn't start|failed|couldn't start/i);
  });

  it('goes up with the Up button and with Backspace in the list', async () => {
    const { router } = await renderPage(page, { path: `${A}&ap=%2Fsrv%2Fapp` });
    await within(await table()).findByRole('row', { name: /server\.js/ });
    await userEvent.click(screen.getAllByRole('button', { name: strings['action.up'] })[0]!);
    await waitFor(() => expect(router.state.location.search).toMatchObject({ ap: '/srv' }));
    const row = await within(await table()).findByRole('row', { name: /media/ });
    row.focus();
    await userEvent.keyboard('{Backspace}');
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('ap'));
  });

  it('shows a lossy name with its actions off and a control character escaped', async () => {
    await renderPage(page, { path: `${A}&ap=%2Fhome%2Fada` });
    const t = await table();
    await within(t).findByText('bell\\x07.txt');
    expect(within(t).getAllByText(strings['row.lossy']).length).toBe(1);
  });

  it('keeps a folder core cannot address closed, with the reason', async () => {
    const { router } = await renderPage(page, { path: `${A}&ap=%2Fsrv%2Fa%2Fb%2Fc%2Fd%2Fe%2Ff%2Fg%2Fh` });
    expect(await screen.findByText(strings['blocked.deep'])).toBeInTheDocument();
    // The state's own Up one folder (the last; the bar's Up comes first and does the same).
    await userEvent.click(screen.getAllByRole('button', { name: strings['action.parent'] }).at(-1)!);
    await waitFor(() => expect(router.state.location.search).toMatchObject({ ap: '/srv/a/b/c/d/e/f/g' }));
  });

  it('refuses a first part the files program reads as a command, and sends nothing for it', async () => {
    seen.length = 0;
    await renderPage(page, { path: `${A}&ap=%2Fcopy&b=atlas.00a1&bp=%2Fhome%2Fada%2Fodd%25dir` });
    expect(await screen.findByText(strings['blocked.alias'])).toBeInTheDocument();
    expect(await screen.findByText(strings['blocked.name'])).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(seen).toEqual([]);
  });

  it('never reads a stopped computer', async () => {
    seen.length = 0;
    await renderPage(page, { path: '/files?a=cedar.00c3' });
    await screen.findByText(fill(strings['st.stopped'], { name: 'cedar' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(seen).toEqual([]);
  });

  it('marks a listed folder the Hub cannot open yet, in its row', async () => {
    await renderPage(page, { path: `${A}&ap=%2Fhome%2Fada` });
    const t = await table();
    expect(within(await within(t).findByRole('row', { name: /odd%dir/ })).getByText(strings['row.closed'])).toBeInTheDocument();
    expect(within(within(t).getByRole('row', { name: /projects/ })).queryByText(strings['row.closed'])).toBeNull();
  });

  it('marks a listed folder past the depth bound, in its row', async () => {
    await renderPage(page, { path: `${A}&ap=%2Fsrv%2Fa%2Fb%2Fc%2Fd%2Fe%2Ff%2Fg` });
    const t = await table();
    expect(within(await within(t).findByRole('row', { name: /\bh\b/ })).getByText(strings['row.closed'])).toBeInTheDocument();
  });

  it('says an empty folder is empty', async () => {
    await renderPage(page, { path: `${A}&ap=%2Ftmp` });
    expect(await screen.findByText(strings['empty.title'])).toBeInTheDocument();
  });

  it('says a folder is gone (404) and offers its parent', async () => {
    await renderPage(page, { path: `${A}&ap=%2Fnope` });
    expect(await screen.findByText(strings['pr.gone'])).toBeInTheDocument();
    // The bar's Up and the state's own button, one name for one action.
    expect(screen.getAllByRole('button', { name: strings['action.parent'] })).toHaveLength(2);
  });

  it('says the program refuses a folder (403 without access rules)', async () => {
    await renderPage(page, { path: `${A}&ap=%2Froot` });
    expect(await screen.findByText(strings['pr.refused'])).toBeInTheDocument();
  });

  it('says access rules keep the Hub out (401), with the way to the computer', async () => {
    await renderPage(page, { path: A, state: 'access' });
    expect(await screen.findByText(strings['pr.access'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['action.openComputers'] })).toBeInTheDocument();
    expect(screen.getByText(strings['pr.accessBody'])).toBeInTheDocument();
  });

  it('says access rules keep the Hub out (403 with rules set)', async () => {
    await renderPage(page, { path: A, state: 'rules' });
    expect(await screen.findByText(strings['pr.access'])).toBeInTheDocument();
    expect(screen.queryByText(strings['pr.refused'])).toBeNull();
  });

  it('shows a 502 as a failed read, never as a computer that did not answer', async () => {
    await renderPage(page, { path: A, state: 'error' });
    expect(await screen.findByText(strings['pr.failed'])).toBeInTheDocument();
    expect(screen.queryByText(/isn't reachable right now/)).toBeNull();
    expect(screen.getByRole('button', { name: /try again|check again/i })).toBeInTheDocument();
  });

  it('shows no answer as the computer not reachable, with Try again', async () => {
    await renderPage(page, { path: A, state: 'unreachable' });
    expect(await screen.findByRole('heading', { name: "atlas isn't reachable right now" }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText(strings['empty.title'])).toBeNull();
  });

  it('never shows an answer that is not a listing as an empty folder', async () => {
    await renderPage(page, { path: A, state: 'notListing' });
    expect(await screen.findByText(strings['pr.unreadable'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again|check again/i })).toBeInTheDocument();
    expect(screen.queryByText(strings['empty.title'])).toBeNull();
  });

  it('shows an answer that is not JSON as an error with a retry, never as too many entries', async () => {
    await renderPage(page, { path: A, state: 'notJson' });
    expect(await screen.findByText(strings['pr.unreadable'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again|check again/i })).toBeInTheDocument();
    expect(screen.queryByText(strings['pr.tooBig'])).toBeNull();
  });

  it('says a failed refresh of the computer list, with a retry, while it keeps the rows it had', async () => {
    const { queryClient } = await renderPage(page, { path: A });
    await table();
    await failComputersRefresh(queryClient);
    expect(await screen.findByText(strings['list.stale'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['list.retry'] })).toBeInTheDocument();
  });

  it('says a listing over the byte bound is too big', async () => {
    await renderPage(page, { path: A, state: 'tooBig' });
    expect(await screen.findByText(strings['pr.tooBig'], {}, { timeout: 10_000 })).toBeInTheDocument();
  }, 20_000);

  it('says a computer without a files address has none', async () => {
    await renderPage(page, { path: A, state: 'noAddress' });
    expect(await screen.findByText(strings['st.noAddress'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['action.openComputers'] })).toBeInTheDocument();
  });

  it('asks to start a stopped computer', async () => {
    await renderPage(page, { path: '/files?a=cedar.00c3' });
    expect(await screen.findByText(fill(strings['st.stopped'], { name: 'cedar' }))).toBeInTheDocument();
  });

  it('asks to start a paused computer', async () => {
    await renderPage(page, { path: '/files?a=fjord.00f6' });
    expect(await screen.findByText(fill(strings['st.stopped'], { name: 'fjord' }))).toBeInTheDocument();
  });

  it('says a computer is starting, and one that did not start, without reading either', async () => {
    seen.length = 0;
    await renderPage(page, { realm: 'all', path: '/files?a=dune.00d4&b=ember.00e5' });
    expect(await screen.findByText(fill(strings['st.starting'], { name: 'dune' }))).toBeInTheDocument();
    expect(screen.getByText(fill(strings['st.attention'], { name: 'ember' }))).toBeInTheDocument();
    expect(seen).toEqual([]);
  });

  it('says a computer from another realm is not in this one', async () => {
    await renderPage(page, { path: '/files?a=borealis.00b2' });
    expect(await screen.findByText(strings['pick.gone'])).toBeInTheDocument();
  });

  it('shows the page state when the realm has no computer', async () => {
    const { router } = await renderPage(page, { state: 'none' });
    expect(await screen.findByText(strings['none.body'])).toBeInTheDocument();
    expect(screen.getByText(strings['none.title'])).toBeInTheDocument();
    // The one next step: Get a computer opens Computers.
    await userEvent.click(screen.getByRole('button', { name: strings['none.action'] }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/computers'));
  });

  it('shows the page state when the computer list fails', async () => {
    await renderPage(page, { state: 'listError' });
    expect((await screen.findAllByText(strings['list.failed'])).length).toBeGreaterThan(0);
  });

  it('keeps each pane view under its own letter: the right pane\'s search stays in its own box, never in the URL', async () => {
    const { router } = await renderPage(page, { path: `${A}&ap=%2Fsrv%2Fmedia&b=atlas.00a1&bp=%2Fetc` });
    const [left] = await screen.findAllByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) });
    await within(left!).findByRole('row', { name: /photo-001/ });
    const boxes = screen.getAllByRole('searchbox');
    await userEvent.type(boxes[1]!, 'host');
    expect(boxes[1]).toHaveValue('host');
    expect(boxes[0]).toHaveValue('');
    await waitFor(() => expect(router.state.location.search).toMatchObject({ ap: '/srv/media', bp: '/etc' }));
    expect(router.state.location.search).not.toHaveProperty('aq');
    expect(router.state.location.search).not.toHaveProperty('bq');
  });
});
