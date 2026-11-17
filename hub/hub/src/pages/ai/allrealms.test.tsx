// Agents, Workflows and TODOs read one realm's list (route realm
// 'realm'), which core refuses before sending under All realms (AGENT_REALM_REQUIRED). Under All realms each page reads in
// the current computer's own realm (aiRealm.ts, realmOf): its one realm, Global for a computer in no realm. Only a computer
// in several realms leaves no one realm to tell: like Skills, Memory, Instructions and Rules, the page then asks for one
// realm and reads nothing; never an error card whose words blame a late answer or the network. Workflows' All runs view
// reads every realm (route realm 'list') and stays reachable.
import { beforeAll, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, type RenderedPage } from '@app/testing';
import { fixtureWorld } from '@core';
import kitStates from '@kit/states/strings.en.json';
import kitStrings from '@kit/strings.en.json';
import page from './page';
import agentStrings from './agents/strings.en.json';
import todoStrings from './auto/todos/List.strings.en.json';
import wfStrings from './auto/workflows/strings.en.json';
import runStrings from './auto/workflows/Runs.strings.en.json';
import { computerRealms } from './realmRules.testing';

const SLOW = { timeout: 5000 };
type QueryClient = RenderedPage['queryClient'];
// The current computer the fixture world boots with (atlas, in one realm), and two of the world's realms.
const ATLAS = (fixtureWorld.computers[0] as { id: string }).id;
const [R1, R2] = fixtureWorld.realms.map((r) => r.id) as [string, string];
// atlas in two realms: under All realms no one realm can be told (the page asks); in none: its own is Global.
const SEVERAL = { rules: [computerRealms(ATLAS, [R1, R2])] };
const NONE = { rules: [computerRealms(ATLAS, [])] };

beforeAll(async () => {
  await Promise.all([import('./view'), import('./agents/AgentsView'), import('./auto/todos/List'), import('./auto/workflows/List')]);
}, 120_000);

// A refused read (admission included: it never reaches the network) leaves its query in error, so the cache shows
// whether a page tried a read it may not make.
const failedReads = (qc: QueryClient) => qc.getQueryCache().getAll().filter((q) => q.state.status === 'error').map((q) => JSON.stringify(q.queryKey));
// The reads core refused for want of one realm (what these pages must never try under All realms).
const realmRefusals = (qc: QueryClient) =>
  qc.getQueryCache().getAll().filter((q) => (q.state.error as { code?: unknown } | null)?.code === 'AGENT_REALM_REQUIRED').map((q) => JSON.stringify(q.queryKey));
// The fixture world has no answer for the agent version read (Workflows reads it for one capability); any other read
// that fails here fails the case.
const otherFailedReads = (qc: QueryClient) => failedReads(qc).filter((k) => !k.includes('"agentVersion"'));
const readsInFlight = (qc: QueryClient) => qc.getQueryCache().getAll().filter((q) => q.state.fetchStatus === 'fetching').length;

/** Waits until every read has settled, then checks the named table holds rows of the answer and nothing failed. */
async function readsAndShowsRows(qc: QueryClient, table: string) {
  await waitFor(() => {
    expect(readsInFlight(qc)).toBe(0);
    const t = screen.getByRole('table', { name: table });
    expect(t.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
  }, SLOW);
  expect(screen.queryByText(kitStrings['state.emptyTitle'])).toBeNull(); // rows of the answer, not the empty state's row
  expect(realmRefusals(qc)).toEqual([]);
  expect(otherFailedReads(qc)).toEqual([]);
  expect(screen.queryByRole('alert')).toBeNull();
}

const CASES = [
  { name: 'Agents', path: '/ai/agents', title: agentStrings['allRealms.title'], body: agentStrings['allRealms.body'], failed: agentStrings['state.failed'], table: agentStrings['list.label'] },
  { name: 'TODOs', path: '/ai/auto/todos', title: todoStrings['allRealms.title'], body: todoStrings['allRealms.body'], failed: todoStrings['error.title'], table: todoStrings['title'] },
  { name: 'Workflows', path: '/ai/auto/workflows', title: wfStrings['wf.allRealms.title'], body: wfStrings['wf.allRealms.body'], failed: null, table: wfStrings['wf.title'] },
] as const;

describe('under All realms the one-realm AI lists follow the computer\'s own realm', () => {
  for (const c of CASES) {
    it(`${c.name}: a computer in several realms: asks for one realm, says why, shows no error, and tries no read it may not make`, async () => {
      const { queryClient } = await renderPage(page, { path: c.path, realm: 'all', ...SEVERAL });
      expect(await screen.findByText(c.title, {}, SLOW)).toBeInTheDocument();
      expect(screen.getByText(c.body)).toBeInTheDocument();
      await waitFor(() => expect(readsInFlight(queryClient)).toBe(0), SLOW);
      expect(realmRefusals(queryClient)).toEqual([]);
      expect(otherFailedReads(queryClient)).toEqual([]);
      expect(screen.queryByRole('alert')).toBeNull();
      if (c.failed) expect(screen.queryByText(c.failed)).toBeNull();
      expect(screen.queryByText(kitStates['err.stale'])).toBeNull();
    });

    it(`${c.name}: a computer in one realm: reads that realm's list and shows its rows (no realm question)`, async () => {
      const { queryClient } = await renderPage(page, { path: c.path, realm: 'all' });
      await readsAndShowsRows(queryClient, c.table);
      expect(screen.queryByText(c.title)).toBeNull();
      // Read in atlas's own realm, named on the call (the context's is 'all').
      expect(queryClient.getQueryCache().getAll().some((q) => q.state.status === 'success' && JSON.stringify(q.queryKey).includes(`"${R1}"`))).toBe(true);
    });

    it(`${c.name}: a computer in no realm: reads Global's list and shows its rows (no realm question)`, async () => {
      const { queryClient } = await renderPage(page, { path: c.path, realm: 'all', ...NONE });
      await readsAndShowsRows(queryClient, c.table);
      expect(screen.queryByText(c.title)).toBeNull();
      expect(queryClient.getQueryCache().getAll().some((q) => q.state.status === 'success' && JSON.stringify(q.queryKey).includes('"global"'))).toBe(true);
    });
  }

  it('Workflows: the view switch beside the realm question opens All runs, which reads every realm and lists its runs', async () => {
    const { queryClient, router } = await renderPage(page, { path: '/ai/auto/workflows', realm: 'all', ...SEVERAL });
    expect(await screen.findByText(wfStrings['wf.allRealms.title'], {}, SLOW)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: runStrings['view.runs'] }));
    expect(router.state.location.search).toMatchObject({ view: 'runs' });
    await readsAndShowsRows(queryClient, runStrings['title']);
    // No realm question, and the one-realm workflow list is not read behind All runs: its refusal would be a failed
    // read in readsAndShowsRows.
    expect(screen.queryByText(wfStrings['wf.allRealms.title'])).toBeNull();
  });

  it('Workflows: the realm question keeps the line that says what a workflow is', async () => {
    await renderPage(page, { path: '/ai/auto/workflows', realm: 'all', ...SEVERAL });
    expect(await screen.findByText(wfStrings['wf.allRealms.title'], {}, SLOW)).toBeInTheDocument();
    expect(screen.getByText(wfStrings['wf.desc'])).toBeInTheDocument();
  });

  it('Workflows with no current computer: the page does not ask for a realm, and its list read is made, never left waiting disabled', async () => {
    // The realm question needs a current computer; without one the page is as before, so the list read must not be
    // switched off (a switched-off read with no answer is a skeleton that never ends).
    const { queryClient } = await renderPage(page, { path: '/ai/auto/workflows', realm: 'all', computer: false });
    await waitFor(() => expect(queryClient.getQueryCache().getAll().some((q) => q.queryKey.includes('workflows'))).toBe(true), SLOW);
    await waitFor(() => expect(readsInFlight(queryClient)).toBe(0), SLOW);
    const parked = queryClient.getQueryCache().getAll().filter((q) => q.queryKey.includes('workflows') && q.state.status === 'pending' && q.state.fetchStatus === 'idle');
    expect(parked.map((q) => JSON.stringify(q.queryKey))).toEqual([]);
    expect(screen.queryByText(wfStrings['wf.allRealms.title'])).toBeNull();
  });

  for (const c of CASES) {
    it(`${c.name}: with one realm the list reads and shows its rows (no realm question)`, async () => {
      const { queryClient } = await renderPage(page, { path: c.path });
      await readsAndShowsRows(queryClient, c.table);
      expect(screen.queryByText(c.title)).toBeNull();
    });
  }
});
