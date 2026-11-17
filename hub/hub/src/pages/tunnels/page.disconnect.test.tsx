// Disconnect: one DELETE per press, never resent by the page. 202 → "Disconnecting…" until a
// read no longer lists the session; a lost answer → "May have disconnected" with Check again (reads only: gone → done,
// still listed → still held: after 30 s a warned "Disconnect again"); 404 → "Already disconnected", never a failure; any other refusal → its details.
// The session row carries only its state; the actions are in its rows' ⋯ menu, the inspector and the notes above.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetChanges, reloadChangesForTests } from '@core/changes';
import { transport } from '@core/transport';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { chooseComputer, fixtureWorld } from '@core';
import { resetDisconnectForTests } from './disconnect';
import page from './page';
import { routes } from './routes';
import strings from './strings.en.json';

const S1 = 'S-4f2a9c1e-7b3d-4e21-9a55-0c1d2e3f4a51';
const GROUP1 = 'Session 4f2a9c… · from 203.0.113.x · 3 streams of 1024';
const table = () => screen.findByRole('table', { name: strings.title });

/** The DELETEs that went out, by session id. */
function deletes(): string[] {
  const sent: string[] = [];
  const tr = transport();
  const real = tr.fetch.bind(tr);
  vi.spyOn(tr, 'fetch').mockImplementation((url, init, meta) => {
    if (meta.route.id === routes.disconnect.id) sent.push(decodeURIComponent(meta.path.split('/').pop() ?? ''));
    return real(url, init, meta);
  });
  return sent;
}

/** The /tunnels reads that went out (a refresh, a read-back), counted. */
function tunnelReads(): { n: number } {
  const c = { n: 0 };
  const tr = transport();
  const real = tr.fetch.bind(tr);
  vi.spyOn(tr, 'fetch').mockImplementation((url, init, meta) => {
    if (meta.route.id === routes.tunnels.id) c.n++;
    return real(url, init, meta);
  });
  return c;
}

/** The session row of S1 (its label, then its state after the count). */
async function group1(): Promise<HTMLElement> {
  const tb = await table();
  const label = await within(tb).findByText(GROUP1);
  return label.closest('tr') as HTMLElement;
}
/** Opens the ⋯ menu of a row of S1 (its inside :5432) and returns the menu items' names. */
async function s1Menu(): Promise<string[]> {
  const row = (await within(await table()).findByText('127.0.0.1:5432')).closest('tr') as HTMLElement;
  await userEvent.click(within(row).getByRole('button', { name: /actions|more/i }));
  await screen.findByRole('menuitem', { name: strings['action.open'] });
  return screen.getAllByRole('menuitem').map((m) => m.textContent ?? '');
}
const has = (items: string[], label: string) => items.some((x) => x.startsWith(label));
/** Opens the ⋯ menu of the detail open on S1's web address :3000 (Disconnect is there) and returns its items. */
async function detailMenu(): Promise<string[]> {
  const head = (await screen.findByRole('heading', { name: `${strings['kind.expose']} :3000` })).closest('header') as HTMLElement;
  await userEvent.click(within(head).getByRole('button', { name: /more/i }));
  await screen.findAllByRole('menuitem');
  return screen.getAllByRole('menuitem').map((m) => m.textContent ?? '');
}
async function closeMenu(): Promise<void> {
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());
}
async function choose(label: string): Promise<void> {
  await s1Menu();
  await userEvent.click(screen.getByRole('menuitem', { name: new RegExp(`^${label}`) }));
}
async function pressDisconnect(): Promise<HTMLElement> {
  await choose(strings['disc.menu']);
  return screen.findByRole('alertdialog', { name: strings['disc.title'] });
}
/** The note naming S1's disconnect that may have gone through (with Check again, and Disconnect again once offered). */
async function heldBand(): Promise<HTMLElement> {
  const text = await screen.findByText(/A disconnect of session 4f2a9c… may have gone through/);
  return text.closest('[role="status"]') as HTMLElement;
}
async function confirm(dlg: HTMLElement): Promise<void> {
  await userEvent.click(within(dlg).getByRole('button', { name: strings['disc.action'] }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
}

beforeEach(() => {
  // eslint-disable-next-line no-restricted-globals -- each test starts with no held change kept by an earlier one
  localStorage.removeItem('hub.v3.changes');
  resetChanges();
  resetDisconnectForTests();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('tunnels disconnect: the confirm', () => {
  it('names everything the session shares and that the laptop can connect again; Cancel sends nothing', async () => {
    await renderPage(page, { state: 'disconnect' });
    const sent = deletes();
    const dlg = await pressDisconnect();
    expect(dlg).toHaveTextContent('It ends everything it shares: web address :3000, web address :5173, inside :5432. The laptop can connect again.');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(sent).toEqual([]);
    expect(await group1()).toBeInTheDocument();
  });

  it('while its one request is out, the confirm stays open and busy: Escape does not close it', async () => {
    await renderPage(page, { state: 'disconnect-lost-listed' });
    const sent = deletes();
    const dlg = await pressDisconnect();
    await userEvent.click(within(dlg).getByRole('button', { name: strings['disc.action'] }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog', { name: strings['disc.title'] })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(sent).toEqual([S1]);
  });

  it('the inspector offers Disconnect for its session, in its menu', async () => {
    await renderPage(page, { state: 'disconnect', path: `/tunnels?sel=${encodeURIComponent(`${S1}~1`)}` });
    await screen.findByText('Not loading?');
    expect(screen.queryByRole('button', { name: strings['disc.action'] })).toBeNull();
    expect(has(await detailMenu(), strings['disc.menu'])).toBe(true);
    await userEvent.click(screen.getByRole('menuitem', { name: new RegExp(`^${strings['disc.menu']}`) }));
    expect(await screen.findByRole('alertdialog', { name: strings['disc.title'] })).toBeInTheDocument();
  });
});

describe('tunnels disconnect: 202', () => {
  it('sends one DELETE; the session leaves the list at the next read', async () => {
    await renderPage(page, { state: 'disconnect' });
    const sent = deletes();
    await confirm(await pressDisconnect());
    await waitFor(() => expect(screen.queryByText(GROUP1)).toBeNull());
    expect(sent).toEqual([S1]);
    expect(screen.queryByText(strings['disc.failed'])).toBeNull();
    // The other session is untouched.
    expect(within(await table()).getByText('127.0.0.2:5432')).toBeInTheDocument();
  });

  it('still listed: Disconnecting…, then after 30 s "Still listed" with Check again and Disconnect offered again', async () => {
    await renderPage(page, { state: 'disconnect-slow' });
    const sent = deletes();
    await confirm(await pressDisconnect());
    expect(await within(await group1()).findByText(strings['disc.closing'])).toBeInTheDocument();
    // Disconnecting: nothing to press again yet.
    let items = await s1Menu();
    expect(has(items, strings['disc.menu'])).toBe(false);
    expect(has(items, strings['disc.check'])).toBe(false);
    await closeMenu();
    const t0 = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => t0 + 31_000);
    await userEvent.click(screen.getByRole('button', { name: strings.refresh }));
    expect(await within(await group1()).findByText(strings['disc.still'])).toBeInTheDocument();
    items = await s1Menu();
    expect(has(items, strings['disc.check'])).toBe(true);
    expect(has(items, strings['disc.menu'])).toBe(true);
    await closeMenu();
    expect(sent).toEqual([S1]);
  });
});

describe('tunnels disconnect: the answer was lost', () => {
  it('May have disconnected: nothing is resent, Disconnect is not offered; Check again reads, gone → done', async () => {
    await renderPage(page, { state: 'disconnect-lost' });
    const sent = deletes();
    await confirm(await pressDisconnect());
    expect(await within(await group1()).findByText(strings['disc.pending'])).toBeInTheDocument();
    expect(has(await s1Menu(), strings['disc.menu'])).toBe(false);
    await closeMenu();
    await userEvent.click(within(await heldBand()).getByRole('button', { name: strings['disc.check'] }));
    await waitFor(() => expect(screen.queryByText(GROUP1)).toBeNull());
    expect(screen.queryByText(/may have gone through/)).toBeNull();
    expect(sent).toEqual([S1]);
  });

  it('Check again finds it still listed: still held, nothing offered; after 30 s a warned Disconnect again sends once more', async () => {
    await renderPage(page, { state: 'disconnect-lost-listed' });
    const sent = deletes();
    await confirm(await pressDisconnect());
    expect(await within(await group1()).findByText(strings['disc.pending'])).toBeInTheDocument();
    await userEvent.click(within(await heldBand()).getByRole('button', { name: strings['disc.check'] }));
    await waitFor(async () => expect(within(await heldBand()).getByRole('button', { name: strings['disc.check'] })).toBeEnabled());
    // Still listed proves nothing: the kit may still be closing it. The outcome stays unknown, nothing to press.
    expect(within(await group1()).getByText(strings['disc.pending'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['disc.action'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['disc.again'] })).toBeNull();
    expect(sent).toEqual([S1]);
    // 30 s later and still listed: Disconnect again, behind a confirm that says the first may still be closing it.
    const t0 = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => t0 + 31_000);
    await userEvent.click(screen.getByRole('button', { name: strings.refresh }));
    await userEvent.click(await within(await heldBand()).findByRole('button', { name: strings['disc.again'] }));
    const dlg = await screen.findByRole('alertdialog', { name: strings['disc.again.title'] });
    expect(dlg).toHaveTextContent(strings['disc.again.body']);
    await userEvent.click(within(dlg).getByRole('button', { name: strings['disc.again'] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(sent).toEqual([S1, S1]));
  });

  it('Check again that reads the session still listed says May have disconnected, never that it could not read', async () => {
    await renderPage(page, { state: 'disconnect-lost-listed', path: `/tunnels?sel=${encodeURIComponent(`${S1}~1`)}` });
    await screen.findByText('Not loading?');
    await confirm(await pressDisconnect());
    expect(await screen.findByText(strings['disc.pending.line'])).toBeInTheDocument();
    const checks = screen.getAllByRole('button', { name: strings['disc.check'] });
    await userEvent.click(checks[checks.length - 1] as HTMLElement);
    await waitFor(() => expect(screen.getAllByRole('button', { name: strings['disc.check'] }).every((b) => !b.hasAttribute('disabled'))).toBe(true));
    expect(screen.getByText(strings['disc.pending.line'])).toBeInTheDocument();
    expect(screen.queryByText(/could not read/)).toBeNull();
  });

  it('a reload keeps "May have disconnected" (core holds it) and still offers no Disconnect', async () => {
    const first = await renderPage(page, { state: 'disconnect-lost-listed' });
    await confirm(await pressDisconnect());
    expect(await within(await group1()).findByText(strings['disc.pending'])).toBeInTheDocument();
    first.unmount();
    resetDisconnectForTests();
    reloadChangesForTests();
    await renderPage(page, { state: 'disconnect-lost-listed' });
    expect(await within(await group1()).findByText(strings['disc.pending'])).toBeInTheDocument();
    expect(has(await s1Menu(), strings['disc.menu'])).toBe(false);
  });

  it('while it may have gone through, neither the inspector nor the row menu offers Disconnect for that session', async () => {
    await renderPage(page, { state: 'disconnect-lost-listed', path: `/tunnels?sel=${encodeURIComponent(`${S1}~1`)}` });
    await screen.findByText('Not loading?');
    // The inspector's menu and the row menu.
    expect(has(await detailMenu(), strings['disc.menu'])).toBe(true);
    await closeMenu();
    await confirm(await pressDisconnect());
    expect(await screen.findByText(strings['disc.pending.line'])).toBeInTheDocument();
    expect(has(await detailMenu(), strings['disc.menu'])).toBe(false);
    await closeMenu();
    expect(has(await s1Menu(), strings['disc.menu'])).toBe(false);
    await closeMenu();
    // The other session's rows still offer it.
    const other = within(await table()).getByText('127.0.0.2:5432').closest('tr') as HTMLElement;
    await userEvent.click(within(other).getByRole('button', { name: /actions|more/i }));
    expect(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['disc.menu']}`) })).toBeInTheDocument();
  });

  it('the next poll shows the session gone: the page reads back by itself and nothing stays held unseen', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await renderPage(page, { state: 'disconnect-lost' });
    await confirm(await pressDisconnect());
    expect(await within(await group1()).findByText(strings['disc.pending'])).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    await waitFor(() => expect(screen.queryByText(GROUP1)).toBeNull());
    await waitFor(() => expect(screen.queryByText(/may have gone through/)).toBeNull());
  });
});

describe('tunnels disconnect: held without a list', () => {
  for (const state of ['error', 'program-stopped', 'program-unknown', 'daemon-error']) {
    it(`a held disconnect still shows, with Check again, when the page reads nothing (${state})`, async () => {
      const first = await renderPage(page, { state: 'disconnect-lost-listed' });
      await confirm(await pressDisconnect());
      expect(await within(await group1()).findByText(strings['disc.pending'])).toBeInTheDocument();
      first.unmount();
      resetDisconnectForTests();
      reloadChangesForTests();
      await renderPage(page, { state });
      expect(await screen.findByText(/A disconnect of session 4f2a9c… may have gone through/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: strings['disc.check'] })).toBeInTheDocument();
    });
  }
});

describe('tunnels disconnect: held, the list replaced by a state', () => {
  it('an overview refresh fails after the list showed the held session: the error state still names it', async () => {
    const first = await renderPage(page, { state: 'disconnect-lost-listed' });
    await confirm(await pressDisconnect());
    expect(await within(await group1()).findByText(strings['disc.pending'])).toBeInTheDocument();
    first.unmount();
    resetDisconnectForTests();
    reloadChangesForTests();
    await renderPage(page, { state: 'overview-flaky' });
    // The list shows it (its row says May have disconnected) ...
    expect(await within(await group1()).findByText(strings['disc.pending'])).toBeInTheDocument();
    // ... then the overview's next read fails and its error replaces the list: the held disconnect is still named.
    await userEvent.click(screen.getByRole('button', { name: strings.refresh }));
    await waitFor(() => expect(screen.queryByRole('table', { name: strings.title })).toBeNull());
    expect(await screen.findByText(/A disconnect of session 4f2a9c… may have gone through/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['disc.check'] })).toBeInTheDocument();
  });

});

describe('tunnels disconnect: automatic read-back', () => {
  it('a read-back that cannot free the hold is not repeated at every read: once per poll, reads only', async () => {
    // Every other /tunnels read fails: a read-back proves nothing, so the hold stays while the refreshes show it gone.
    await renderPage(page, { state: 'disconnect-lost-flaky' });
    await confirm(await pressDisconnect());
    expect(await within(await group1()).findByText(strings['disc.pending'])).toBeInTheDocument();
    const reads = tunnelReads();
    await userEvent.click(screen.getByRole('button', { name: strings.refresh }));
    await waitFor(() => expect(screen.queryByText(GROUP1)).toBeNull());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1500));
    });
    // The refresh, and at most one read-back: never a read-back that refreshes and asks again.
    expect(reads.n).toBeLessThanOrEqual(2);
    // Another read within the poll: no second read-back yet.
    await userEvent.click(screen.getByRole('button', { name: strings.refresh }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1000));
    });
    expect(reads.n).toBeLessThanOrEqual(3);
    expect(screen.getByText(/A disconnect of session 4f2a9c… may have gone through/)).toBeInTheDocument();
  });
});

describe('tunnels disconnect: the session row and its menu', () => {
  it('the session row carries only its state, never a button (one fixed line at every width)', async () => {
    const acts = new RegExp(`^(${[strings['disc.action'], strings['disc.check'], strings['disc.again']].join('|')})`);
    await renderPage(page, { state: 'disconnect-lost-listed' });
    expect(within(await group1()).queryAllByRole('button', { name: acts })).toHaveLength(0);
    await confirm(await pressDisconnect());
    const g = await group1();
    expect(await within(g).findByText(strings['disc.pending'])).toBeInTheDocument();
    expect(within(g).queryAllByRole('button', { name: acts })).toHaveLength(0);
  });

  it('a held session searched out of the list is still named above it, with Check again', async () => {
    await renderPage(page, { state: 'disconnect-lost-listed' });
    await confirm(await pressDisconnect());
    expect(await within(await group1()).findByText(strings['disc.pending'])).toBeInTheDocument();
    await userEvent.type(screen.getAllByRole('searchbox')[0] as HTMLElement, '127.0.0.2');
    await waitFor(() => expect(screen.queryByText(GROUP1)).toBeNull());
    expect(within(await heldBand()).getByRole('button', { name: strings['disc.check'] })).toBeInTheDocument();
  });

  it('its rows\' menu offers Check again, then Disconnect again once a read 30 s after still lists it', async () => {
    await renderPage(page, { state: 'disconnect-lost-listed' });
    const sent = deletes();
    await confirm(await pressDisconnect());
    expect(await within(await group1()).findByText(strings['disc.pending'])).toBeInTheDocument();
    let items = await s1Menu();
    expect(has(items, strings['disc.check'])).toBe(true);
    expect(has(items, strings['disc.again'])).toBe(false);
    await closeMenu();
    const t0 = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => t0 + 31_000);
    await userEvent.click(screen.getByRole('button', { name: strings.refresh }));
    await within(await heldBand()).findByRole('button', { name: strings['disc.again'] });
    items = await s1Menu();
    expect(has(items, strings['disc.again'])).toBe(true);
    await userEvent.click(screen.getByRole('menuitem', { name: new RegExp(`^${strings['disc.again']}`) }));
    const dlg = await screen.findByRole('alertdialog', { name: strings['disc.again.title'] });
    await userEvent.click(within(dlg).getByRole('button', { name: strings['disc.again'] }));
    await waitFor(() => expect(sent).toEqual([S1, S1]));
  });

  it('Cancel on the Disconnect again confirm keeps the hold and sends nothing', async () => {
    await renderPage(page, { state: 'disconnect-lost-listed' });
    const sent = deletes();
    await confirm(await pressDisconnect());
    expect(await within(await group1()).findByText(strings['disc.pending'])).toBeInTheDocument();
    const t0 = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => t0 + 31_000);
    await userEvent.click(screen.getByRole('button', { name: strings.refresh }));
    await userEvent.click(await within(await heldBand()).findByRole('button', { name: strings['disc.again'] }));
    const dlg = await screen.findByRole('alertdialog', { name: strings['disc.again.title'] });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(sent).toEqual([S1]);
    expect(within(await group1()).getByText(strings['disc.pending'])).toBeInTheDocument();
    expect(within(await heldBand()).getByRole('button', { name: strings['disc.again'] })).toBeInTheDocument();
  });
});

describe('tunnels disconnect: the confirm belongs to its computer', () => {
  it('a computer switch closes the confirm; nothing is sent to the new computer', async () => {
    await renderPage(page, { state: 'disconnect' });
    const sent = deletes();
    await pressDisconnect();
    const other = fixtureWorld.computers.find((x) => x.name === 'borealis');
    if (!other) throw new Error('no borealis');
    await act(async () => {
      chooseComputer(other);
    });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(sent).toEqual([]);
  });
});

describe('tunnels disconnect: refusals', () => {
  it('404 SESSION_NOT_FOUND: Already disconnected, then the list is read again; never a failure', async () => {
    await renderPage(page, { state: 'disconnect-gone' });
    const sent = deletes();
    await confirm(await pressDisconnect());
    await waitFor(() => expect(screen.queryByText(GROUP1)).toBeNull());
    expect(screen.queryByText(strings['disc.failed'])).toBeNull();
    expect(sent).toEqual([S1]);
  });

  it('another refusal: Could not disconnect, with Disconnect offered again', async () => {
    await renderPage(page, { state: 'disconnect-refused' });
    await confirm(await pressDisconnect());
    expect(await within(await group1()).findByText(strings['disc.failed'])).toBeInTheDocument();
    expect(has(await s1Menu(), strings['disc.menu'])).toBe(true);
  });

  it('with the inspector closed, the list says which session could not be disconnected, with its details', async () => {
    await renderPage(page, { state: 'disconnect-refused' });
    await confirm(await pressDisconnect());
    const band = (await screen.findByText('Could not disconnect session 4f2a9c….')).closest('[role="alert"]') as HTMLElement;
    expect(within(band).getByRole('button', { name: /details/i })).toBeInTheDocument();
  });

  it('the inspector shows a refusal with its details', async () => {
    await renderPage(page, { state: 'disconnect-refused', path: `/tunnels?sel=${encodeURIComponent(`${S1}~1`)}` });
    await screen.findByText('Not loading?');
    await confirm(await pressDisconnect());
    expect(await screen.findByText(strings['disc.failed.line'])).toBeInTheDocument();
  });
});
