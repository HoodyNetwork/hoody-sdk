// The Tunnels page in every fixture state: the program gate, the grouped live rows, and
// the read failures that never read as "nothing connected".
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import { routes } from './routes';
import strings from './strings.en.json';

const tunnelReads = new Set([routes.tunnels.id, routes.sessions.id, routes.bindings.id, routes.health.id]);
/** Tunnel-program reads that went out (fetched, failed or in flight). */
function kitReads(qc: Awaited<ReturnType<typeof renderPage>>['queryClient']): string[] {
  return qc
    .getQueryCache()
    .findAll()
    .filter((q) => q.queryKey.some((k) => typeof k === 'string' && tunnelReads.has(k)))
    .filter((q) => q.state.dataUpdatedAt > 0 || q.state.errorUpdatedAt > 0 || q.state.fetchStatus !== 'idle')
    .map((q) => JSON.stringify(q.queryKey));
}
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
const table = () => screen.findByRole('table', { name: strings.title });

describe('tunnels: the live view', () => {
  it('groups the rows by session, with the masked connection address and the streams', async () => {
    await renderPage(page);
    const tb = await table();
    expect(await within(tb).findByText('Session 4f2a9c… · from 203.0.113.x · 3 streams of 1024')).toBeInTheDocument();
    expect(within(tb).getByText('Session 9b1d7e… · from 192.0.2.x · 0 streams of 1024')).toBeInTheDocument();
    expect(within(tb).getAllByText(strings['kind.expose']).length).toBeGreaterThanOrEqual(2);
    // The full connection address never shows in the list.
    expect(tb.textContent).not.toContain('203.0.113.42');
  });

  it('keeps two PULL listeners on one port apart (session + bind id, never the port alone)', async () => {
    await renderPage(page);
    const tb = await table();
    expect(await within(tb).findByText('127.0.0.1:5432')).toBeInTheDocument();
    expect(within(tb).getByText('127.0.0.2:5432')).toBeInTheDocument();
    expect(within(tb).getByText('127.0.0.1:6379')).toBeInTheDocument();
  });

  it('puts a listener of no live session under Reconnecting or closing, and says nothing more about the orphan', async () => {
    await renderPage(page);
    const tb = await table();
    expect(await within(tb).findByText(strings['group.reconnecting'])).toBeInTheDocument();
    expect(screen.queryByText(/reconnecting and shares nothing/)).toBeNull();
  });

  it('opens a web address in the detail with its access line and links', async () => {
    const { router } = await renderPage(page);
    const tb = await table();
    await within(tb).findByText('127.0.0.1:5432');
    const row = within(tb).getAllByRole('row').find((r) => /\b3000\b/.test(r.textContent ?? '') && r.textContent?.includes(strings['kind.expose']));
    if (!row) throw new Error('no :3000 row');
    await userEvent.click(row);
    await waitFor(() => expect(String((router.state.location.search as Record<string, unknown>).sel ?? '')).toContain('~1'));
    expect(await screen.findByText(strings['access.line'])).toBeInTheDocument();
    // The session's facts come first, then the web address; Board is in the detail's header, Computer
    // visits and Make an alias in its menu, then a rule and Disconnect (danger) last.
    const head = (await screen.findByRole('heading', { name: `${strings['kind.expose']} :3000` })).closest('header') as HTMLElement;
    expect(within(head).getByRole('button', { name: strings['action.board'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['action.visits'] })).toBeNull();
    const sessionHead = screen.getByRole('heading', { name: strings['detail.facts'] });
    const webHead = screen.getByRole('heading', { name: strings['kind.expose'] });
    expect(sessionHead.compareDocumentPosition(webHead) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: strings['access.settings'] })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['note.title'] })).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(within(head).getByRole('button', { name: /more/i }));
    const items = (await screen.findAllByRole('menuitem')).map((m) => m.textContent ?? '');
    expect(items[0]).toMatch(new RegExp(`^${strings['action.visits']}`));
    expect(items[1]).toMatch(new RegExp(`^${strings['action.alias']}`));
    expect(items[items.length - 1]).toMatch(new RegExp(`^${strings['disc.menu']}`));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());
    // The connection address: masked, Show reveals it (an account session).
    expect(screen.getByText('203.0.113.x')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['from.show']) }));
    expect(await screen.findByText('203.0.113.42')).toBeInTheDocument();
  });

  it('a session that shares nothing says so', async () => {
    await renderPage(page, { state: 'nothing-shared' });
    expect(await screen.findByText(strings['kind.idle'])).toBeInTheDocument();
  });

  it('the orphan count shows when nothing else accounts for it', async () => {
    await renderPage(page, { state: 'orphans' });
    expect(await screen.findByText('2 sessions are reconnecting and share nothing right now.')).toBeInTheDocument();
  });
});

describe('tunnels: the program gate', () => {
  it('a stopped program sends no read to the tunnel program', async () => {
    const { queryClient } = await renderPage(page, { state: 'program-stopped' });
    expect(await screen.findByText(strings['st.stopped'])).toBeInTheDocument();
    await settle();
    expect(kitReads(queryClient)).toEqual([]);
  });

  it('a computer without the program says so, and reads nothing from it', async () => {
    const { queryClient } = await renderPage(page, { state: 'not-installed' });
    expect(await screen.findByText(strings['st.none'], { exact: false })).toBeInTheDocument();
    await settle();
    expect(kitReads(queryClient)).toEqual([]);
  });

  it('a running program with nothing connected says so', async () => {
    await renderPage(page, { state: 'idle' });
    expect(await screen.findByText(strings['st.idle'])).toBeInTheDocument();
  });

  it('an overview that did not answer: cannot tell, never "not installed"', async () => {
    await renderPage(page, { state: 'daemon-error' });
    expect(await screen.findByText(strings['st.title.daemon'])).toBeInTheDocument();
    expect(screen.queryByText(strings['st.none'], { exact: false })).toBeNull();
    expect(screen.queryByText(strings['st.stopped'])).toBeNull();
  });

  it('no computer shown: the shared none state, nothing read', async () => {
    const { queryClient } = await renderPage(page, { computer: false });
    expect(await screen.findByText(strings['st.title.noComputer'])).toBeInTheDocument();
    await settle();
    expect(kitReads(queryClient)).toEqual([]);
  });
});

describe('tunnels: read failures never render as empty', () => {
  for (const state of ['error', 'unreadable'] as const) {
    it(`${state}: Could not read, with Try again; never "nothing connected"`, async () => {
      await renderPage(page, { state });
      expect(await screen.findByText(strings['st.title.failed'])).toBeInTheDocument();
      expect(screen.getByRole('button', { name: strings['st.retry'] })).toBeInTheDocument();
      expect(screen.queryByText(strings['st.idle'])).toBeNull();
      expect(screen.queryByText(strings['st.title.idle'])).toBeNull();
    });
  }

  it('401/403: Not allowed, with the way to the access settings', async () => {
    await renderPage(page, { state: 'forbidden' });
    expect(await screen.findByText(strings['st.title.forbidden'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['st.openAccess'] })).toBeInTheDocument();
    expect(screen.queryByText(strings['st.idle'])).toBeNull();
  });

  it('a failed refresh keeps the last rows, dimmed, "as of" their read', async () => {
    await renderPage(page, { state: 'stale' });
    const tb = await table();
    expect(await within(tb).findByText('127.0.0.2:5432')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(/^Could not read this computer's tunnels\. Showing what was read at /)).toBeInTheDocument();
    expect(within(await table()).getByText('127.0.0.2:5432')).toBeInTheDocument();
    expect(screen.queryByText(strings['st.idle'])).toBeNull();
  });
});

describe('tunnels: a refresh that fails keeps the last complete read', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('one read failing while the others answer empty keeps the rows, never "nothing connected"', async () => {
    await renderPage(page, { state: 'partial' });
    const tb = await table();
    expect(await within(tb).findByText('127.0.0.2:5432')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(/^Could not read this computer's tunnels\. Showing what was read at /)).toBeInTheDocument();
    expect(within(await table()).getByText('127.0.0.2:5432')).toBeInTheDocument();
    expect(screen.queryByText(strings['st.idle'])).toBeNull();
  });

  it('the three reads have no timer of their own (timers drift apart; one poll refetches them together)', async () => {
    const { queryClient } = await renderPage(page);
    await within(await table()).findByText('127.0.0.2:5432');
    const kit = queryClient.getQueryCache().findAll().filter((q) => q.queryKey.some((k) => typeof k === 'string' && (k === routes.tunnels.id || k === routes.sessions.id || k === routes.bindings.id)));
    expect(kit.length).toBe(3);
    for (const q of kit) for (const o of q.observers) expect(o.options.refetchInterval ?? false).toBe(false);
  });

  it('an automatic poll where one read fails after the others answered keeps the rows', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await renderPage(page, { state: 'drift' });
    const tb = await table();
    expect(await within(tb).findByText('127.0.0.2:5432')).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    expect(await screen.findByText(/^Could not read this computer's tunnels\. Showing what was read at /)).toBeInTheDocument();
    expect(within(await table()).getByText('127.0.0.2:5432')).toBeInTheDocument();
    expect(screen.queryByText(strings['st.idle'])).toBeNull();
  });

  it('answers that do not parse keep the rows and say they are old', async () => {
    await renderPage(page, { state: 'malformed' });
    const tb = await table();
    expect(await within(tb).findByText('127.0.0.2:5432')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(/^Could not read this computer's tunnels\. Showing what was read at /)).toBeInTheDocument();
    expect(within(await table()).getByText('127.0.0.2:5432')).toBeInTheDocument();
  });

  it('the open inspector says it is out of date too (the list is hidden beside it on a phone)', async () => {
    await renderPage(page, { state: 'stale', path: `/tunnels?sel=${encodeURIComponent('S-9b1d7e20-41c6-4f8a-b2d3-5e6f7a8b9c02~2')}` });
    expect(await screen.findByText(strings['pull.line'])).toBeInTheDocument();
    expect(screen.getByText(strings['status.connected'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    // The table's note and the inspector's own line.
    await waitFor(() => expect(screen.getAllByText(/Showing what was read at /).length).toBe(2));
    expect(screen.queryByText(strings['status.connected'])).toBeNull();
  });
});

describe('tunnels: the overview gate beyond running/stopped', () => {
  it('an unknown program state: cannot tell, nothing read from the program, never "nothing connected"', async () => {
    const { queryClient } = await renderPage(page, { state: 'program-unknown' });
    expect(await screen.findByText(strings['st.unknown'])).toBeInTheDocument();
    expect(screen.queryByText(strings['st.stopped'])).toBeNull();
    await settle();
    expect(kitReads(queryClient)).toEqual([]);
  });

  it('an overview refused by the access settings: Not allowed, with the way to them', async () => {
    const { queryClient } = await renderPage(page, { state: 'daemon-forbidden' });
    expect(await screen.findByText(strings['st.forbiddenDaemon'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['st.openAccess'] })).toBeInTheDocument();
    expect(screen.queryByText(strings['st.daemon'])).toBeNull();
    await settle();
    expect(kitReads(queryClient)).toEqual([]);
  });
});

describe('tunnels: shared access', () => {
  it('a token session never sees the connection address', async () => {
    await renderPage(page, { state: 'token' });
    const tb = await table();
    expect(await within(tb).findByText('Session 4f2a9c… · 3 streams of 1024')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/203\.0\.113|192\.0\.2\.44/);
    const row = (await within(tb).findAllByRole('row')).find((r) => /\b3000\b/.test(r.textContent ?? ''));
    if (!row) throw new Error('no :3000 row');
    await userEvent.click(row);
    expect(await screen.findByText(strings['access.line'])).toBeInTheDocument();
    expect(screen.queryByText(strings['fact.from'])).toBeNull();
    expect(document.body.textContent).not.toMatch(/203\.0\.113|192\.0\.2\.44/);
  });
});

describe('tunnels: strings', () => {
  it('name no internal host, address class or bypass (public text rule)', () => {
    const all = Object.values(strings).join('\n');
    const banned = ['10\\.', '127\\.', '192\\.168', 'localhost', 'private address', 'dev' + ' host', 'hoody\\.[a-z]{2,}', 'source ip', 'bypass'];
    expect(all).not.toMatch(new RegExp(`\\b(?:${banned.join('|')})\\b`, 'i'));
  });
});
