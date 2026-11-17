// Settings → Connections → GitHub accounts, on real core (fixture transport). The realm's accounts with the one in use
// and its health; a device login (code + GitHub's page, then one wait); switching and logging out, each sent once; a lost
// answer is "may have gone through" with Check again (a status read, nothing sent) until the list shows it; GitHub's own
// refusals are failed, never unknown; All realms reads nothing; the device code never reaches the page.
import { bootFixtureCore, fixtureWorld, queryClient, useCurrentComputer, type FixtureRequest, type FixtureRule } from '@core';
// eslint-disable-next-line no-restricted-imports -- a router harness for the table's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the section, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
// The fixture transport's fetch sees the URL: the only place the realm a call sent shows (the fixture request has none).
import { transport } from '@core/transport';
import { bump, setRealm } from '@core/ctx';
import { pin } from '@core/realm';
import GitHubAccounts from './Accounts';
import { codesWaiting, forgetLoggedOut, githubTable, pickAccountsPlace, useActivate, useDeviceLogin, useGitHubAt, useGitHubStatus, useLogin, useLogout } from './data';
import { githubRules, type GitHubOpts } from './fixtures';
import { computerRealms } from '../../realmRules.testing';
import kitStrings from '@kit/strings.en.json';
import mcpStrings from './Mcp.strings.en.json';
import strings from './strings.en.json';

let sent: FixtureRequest[] = [];
const reads = () => sent.filter((r) => r.method === 'GET');
const posts = (path: string) => sent.filter((r) => r.method === 'POST' && r.path === path);
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');

// Under All realms the section reads in the current computer's own realm (aiRealm.ts); the cases here that ask for a
// realm put that computer (atlas, the one core boots with) in two realms, so there is no one realm to tell. `own` gives
// it other realms (one, or none: Global).
const ATLAS_ID = fixtureWorld.computers[0]!.id;
const [W1, W2] = [fixtureWorld.realms[0]!.id, fixtureWorld.realms[1]!.id];
const realmsOfAtlas = (realm: string | undefined, own?: readonly string[]): FixtureRule[] =>
  realm === 'all' ? [computerRealms(ATLAS_ID, own ?? [W1, W2])] : [];

// The accounts table keeps its view in the URL, so the section is mounted under a memory router.
async function mount() {
  const router = createRouter({ routeTree: createRootRoute({ component: GitHubAccounts }), history: createMemoryHistory({ initialEntries: ['/ai/connections'] }) });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
}
/** Every agent call the transport sent: method, path and the realm read from its URL. kit.ts sends an agent call's realm in
 *  its URL only (admit: never in the built query), so a fixture request's query never carries it; the recorder is how a test
 *  reads it (as the GitHub Global case below reads the fetched URLs). */
type AgentCall = { method: string; path: string; realm: string | null };
let agentCalls: AgentCall[] = [];
function recordAgentCalls(t: ReturnType<typeof bootFixtureCore>, first?: (c: AgentCall) => Response | undefined): void {
  agentCalls = [];
  const real = t.fetch.bind(t);
  t.fetch = (url, init, meta) => {
    const c: AgentCall = { method: meta.method.toUpperCase(), path: meta.path, realm: new URL(url, 'http://fixture.invalid').searchParams.get('realm') };
    agentCalls.push(c);
    const own = first?.(c);
    return own ? Promise.resolve(own) : real(url, init, meta);
  };
}
async function show(o: GitHubOpts = {}, realm?: string, own?: readonly string[]) {
  sent = [];
  recordAgentCalls(bootFixtureCore({ rules: [...realmsOfAtlas(realm, own), ...githubRules({ ...o, onSend: (r) => sent.push(r) })], ...(realm !== undefined ? { realm } : {}) }));
  await mount();
}
function gate(): { p: Promise<void>; open: () => void } {
  let open = () => {};
  const p = new Promise<void>((r) => { open = r; });
  return { p, open };
}
const CODE = 'fixture-device-code';
const seed3 = [
  { key: 'github.com/ada', host: 'github.com', login: 'ada', active: true },
  { key: 'github.com/ada-work', host: 'github.com', login: 'ada-work', active: false },
  { key: 'github.com/ada-lab', host: 'github.com', login: 'ada-lab', active: false },
];
// The accounts are a kit DataTable. A row is its table row; Use is its inline action and Log out an
// item of its ⋯ menu; an action held off is soft-disabled (focusable, aria-disabled, its reason on focus).
const rowEl = (login: string): HTMLElement => {
  const el = screen.getByText(login, { exact: true }).closest<HTMLElement>('[data-row-id]');
  if (!el) throw new Error(`no row ${login}`);
  return el;
};
const isOff = (el: HTMLElement | null) => el === null || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
async function closeMenu() {
  if (!screen.queryByRole('menu')) return;
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
}
/** A row's ⋯ menu item (the menu opens first). */
async function menuItem(r: HTMLElement, label: string) {
  await closeMenu();
  await userEvent.click(within(r).getByRole('button', { name: kitStrings['table.rowActions'] }));
  return within(await screen.findByRole('menu')).getByRole('menuitem', { name: label });
}
const clickLogout = async (r: HTMLElement) => { await userEvent.click(await menuItem(r, strings['action.logout'])); };
/** Log out is held off in this row (its menu item is disabled); the menu closes again. */
async function logoutOff(r: HTMLElement) {
  const off = isOff(await menuItem(r, strings['action.logout']));
  await closeMenu();
  return off;
}
/** The add dialog (opened from the section head's one primary action). */
const addDialog = () => screen.queryByRole('dialog', { name: strings['add.title'] });
async function openAdd() {
  if (!addDialog()) await userEvent.click(await screen.findByRole('button', { name: strings['add.start'] }));
  return screen.findByRole('dialog', { name: strings['add.title'] });
}
/** The dialog's start (Get a code, or Add another after a link), absent while a code is shown. */
const goButton = () => {
  const d = addDialog();
  return d ? within(d).queryByRole('button', { name: new RegExp(`^(${strings['add.go']}|${strings['add.again']})$`) }) : null;
};
/** Opens the add dialog if needed and starts a sign-in. */
async function startAdd() {
  await openAdd();
  await userEvent.click(goButton()!);
}
/** Closes the add dialog (it is modal: the rows behind it take no press while it is open). */
async function closeAdd() {
  const d = addDialog();
  if (!d) return;
  await userEvent.click(within(d).getByRole('button', { name: (n, el) => n === strings['add.close'] && !el.hasAttribute('data-dialog-close') }));
  await waitFor(() => expect(addDialog()).toBeNull());
}
/** A new start cannot be made now: the dialog's start is off or gone (the dialog open), or the head's Add is (closed). */
const addOff = () => (addDialog() ? isOff(goButton()) : isOff(screen.queryByRole('button', { name: strings['add.start'] })));
const row = async (login: string) => {
  await screen.findByText(login, { exact: true });
  return rowEl(login);
};
const inUse = (login: string) => within(rowEl(login)).queryByText(strings.active) !== null;
const confirmIn = async (label: string) => {
  const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
  await userEvent.click(within(dlg).getByRole('button', { name: label }));
};

afterEach(() => {
  forgetLoggedOut();
  pickAccountsPlace('realm');
  vi.restoreAllMocks();
  cleanup();
  queryClient.clear();
});

describe('GitHub accounts: list', () => {
  it('shows the realm’s accounts, the one in use and that GitHub accepts it, in one read', async () => {
    await show();
    const ada = await row('ada');
    expect(within(ada).getByText(strings.active)).toBeInTheDocument();
    expect(within(ada).getByText(strings['health.ok'])).toBeInTheDocument();
    const work = await row('ada-work');
    expect(within(work).queryByText(strings.active)).toBeNull();
    expect(within(work).getByRole('button', { name: strings['action.use'] })).toBeInTheDocument();
    expect(within(ada).queryByRole('button', { name: strings['action.use'] })).toBeNull();
    expect(reads()).toHaveLength(1);
    expect(reads()[0]!.path).toBe('/github/auth/status');
    expect(sent.filter((r) => r.method !== 'GET')).toHaveLength(0);
  });

  it('a token GitHub no longer accepts, a refused one and an unchecked one say so; unchecked is never shown as broken', async () => {
    await show({ health: 'invalid' });
    expect(await screen.findByText(strings['health.invalid'])).toBeInTheDocument();
    cleanup(); queryClient.clear();
    await show({ health: 'forbidden' });
    expect(await screen.findByText(strings['health.forbidden'])).toBeInTheDocument();
    cleanup(); queryClient.clear();
    await show({ health: 'unchecked' });
    expect(await screen.findByText(strings['health.unchecked'])).toBeInTheDocument();
    expect(screen.queryByText(strings['health.invalid'])).toBeNull();
    cleanup(); queryClient.clear();
    await show({ noPush: true });
    expect(await screen.findByText(strings.noPush, { exact: false })).toBeInTheDocument();
  });

  it('All realms, a computer in several realms: reads nothing and asks for a realm', async () => {
    await show({}, 'all');
    expect(await screen.findByText(strings['allRealms.title'])).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('All realms, a computer in one realm: reads that realm\'s accounts, no question', async () => {
    await show({}, 'all', [W1]);
    expect(await screen.findByText('ada', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText(strings['allRealms.title'])).toBeNull();
    expect(reads().length).toBeGreaterThan(0);
    const sentIn = agentCalls.filter((c) => c.method === 'GET' && c.path.startsWith('/github/')).map((c) => c.realm);
    expect(sentIn.length).toBeGreaterThan(0);
    for (const r of sentIn) expect(r).toBe(W1);
  });

  it('All realms, a computer in no realm: reads Global\'s accounts, no question', async () => {
    await show({}, 'all', []);
    expect(await screen.findByText('ada', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText(strings['allRealms.title'])).toBeNull();
    expect(reads().length).toBeGreaterThan(0);
    const sentIn = agentCalls.filter((c) => c.method === 'GET' && c.path.startsWith('/github/')).map((c) => c.realm);
    expect(sentIn.length).toBeGreaterThan(0);
    for (const r of sentIn) expect(r).toBe('global');
  });

  it('an answer without the accounts list: "not read" with Read again in place (a read, nothing sent); Add waits for a list', async () => {
    let missing = true;
    await show({ noList: () => missing });
    expect(await screen.findByText(strings['unknown.title'])).toBeInTheDocument();
    expect(screen.queryByText(strings['empty.title'])).toBeNull();
    expect(isOff(screen.queryByRole('button', { name: strings['add.start'] }))).toBe(true);
    const before = reads().length;
    missing = false;
    await userEvent.click(screen.getByRole('button', { name: strings['unknown.retry'] }));
    await row('ada');
    expect(reads().length).toBe(before + 1);
    expect(sent.filter((r) => r.method !== 'GET')).toHaveLength(0);
    expect(screen.queryByText(strings['unknown.title'])).toBeNull();
    expect(isOff(screen.getByRole('button', { name: strings['add.start'] }))).toBe(false);
  });

  it('a failed status read is an error with Try again, never "no account"', async () => {
    await show({ statusFails: true });
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText(strings['empty.title'])).toBeNull();
    expect(screen.queryByRole('button', { name: strings['add.start'] })).toBeNull();
  });
});

describe('GitHub accounts: switch the account in use', () => {
  it('sends the key once and the list shows it in use', async () => {
    await show();
    await userEvent.click(within(await row('ada-work')).getByRole('button', { name: strings['action.use'] }));
    await waitFor(() => expect(inUse('ada-work')).toBe(true));
    expect(posts('/github/auth/active').map((r) => r.body)).toEqual([{ key: 'github.com/ada-work' }]);
    expect(within(await row('ada')).getByRole('button', { name: strings['action.use'] })).toBeInTheDocument();
  });

  it('a lost answer is proved by the list (nothing sent again); one that did not apply stays held until Stop tracking', async () => {
    await show({ active: 'lost' });
    await userEvent.click(within(await row('ada-work')).getByRole('button', { name: strings['action.use'] }));
    await waitFor(() => expect(inUse('ada-work')).toBe(true));
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
    expect(posts('/github/auth/active')).toHaveLength(1);
    cleanup(); queryClient.clear();

    await show({ active: 'notApplied' });
    await userEvent.click(within(await row('ada-work')).getByRole('button', { name: strings['action.use'] }));
    const line = await screen.findByRole('alert');
    expect(line).toHaveAttribute('data-outcome', 'pending');
    expect(screen.getByText(fill(strings['use.held'], { login: 'ada-work' }), { exact: false })).toBeInTheDocument();
    await userEvent.click(within(line).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(within(screen.getByRole('alert')).getByRole('button', { name: /check again/i })).not.toBeDisabled());
    expect(screen.getByRole('alert')).toHaveAttribute('data-outcome', 'pending');
    expect(isOff(within(await row('ada-work')).getByRole('button', { name: strings['action.use'] }))).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: strings.dismiss }));
    await confirmIn(strings.dismiss);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(isOff(within(await row('ada-work')).getByRole('button', { name: strings['action.use'] }))).toBe(false);
    expect(posts('/github/auth/active')).toHaveLength(1);
  });
});

describe('GitHub accounts: log out', () => {
  it('asks first, naming what stays; Cancel sends nothing; Log out sends the key once and says to revoke on GitHub', async () => {
    await show();
    await clickLogout(await row('ada-work'));
    let dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    expect(within(dlg).getByText(fill(strings['logout.body'], { login: 'ada-work', place: strings['place.inRealm'] }))).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: /cancel/i }));
    expect(posts('/github/auth/logout')).toHaveLength(0);
    await clickLogout(await row('ada-work'));
    dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['logout.confirm'] }));
    await waitFor(() => expect(screen.queryByText('ada-work', { exact: true })).toBeNull());
    expect(posts('/github/auth/logout').map((r) => r.body)).toEqual([{ key: 'github.com/ada-work' }]);
    expect(screen.getByText(strings['logout.done'])).toBeInTheDocument();
  });

  it('logging out the account in use says another linked account takes over', async () => {
    await show();
    await clickLogout(await row('ada'));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    expect(within(dlg).getByText(strings['logout.bodyActive'], { exact: false })).toBeInTheDocument();
  });

  it('a lost log-out holds the row (no second send) until the list shows it gone', async () => {
    await show({ logout: 'notApplied' });
    await clickLogout(await row('ada-work'));
    await confirmIn(strings['logout.confirm']);
    await waitFor(() => expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull());
    // Closing the question keeps the hold: its line stays under the table and the row's actions stay off.
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: kitStrings['action.cancel'] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.queryByText(strings['logout.done'])).toBeNull();
    expect(posts('/github/auth/logout')).toHaveLength(1);
    expect(await logoutOff(await row('ada-work'))).toBe(true);
  });

  it('a lost log-out that did apply is proved by the list: the row goes, nothing sent again', async () => {
    await show({ logout: 'lost' });
    await clickLogout(await row('ada-work'));
    await confirmIn(strings['logout.confirm']);
    await waitFor(() => expect(screen.queryByText('ada-work', { exact: true })).toBeNull());
    expect(posts('/github/auth/logout')).toHaveLength(1);
    // Proved by the list, not by its answer: the dialog closes and the done line says what may remain.
    await waitFor(() => expect(screen.getByText(strings['logout.done'])).toBeInTheDocument());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('GitHub accounts: add an account (device login)', () => {
  it('shows GitHub’s code and page, waits once, then names the linked account; the device code never shows', async () => {
    await show();
    await startAdd();
    expect(await screen.findByText('WDJB-MJHT')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: new RegExp(strings['add.open']) })).toHaveAttribute('href', 'https://github.com/login/device');
    await screen.findByText(fill(strings['add.done'], { login: 'ada-lab' }));
    expect(posts('/github/auth/login').map((r) => r.body)).toEqual([{}]);
    const polls = posts('/github/auth/login/poll');
    expect(polls).toHaveLength(1);
    expect(polls[0]!.body).toMatchObject({ device_code: 'fixture-device-code', activate: false });
    expect(await row('ada-lab')).toBeTruthy();
    expect(screen.queryByText('WDJB-MJHT')).toBeNull();
    expect(document.body.textContent).not.toContain('fixture-device-code');
  });

  it('"Use it from now on" sends activate true', async () => {
    await show();
    const dlg = await openAdd();
    await userEvent.click(within(dlg).getByRole('switch', { name: new RegExp(strings['add.activate']) }));
    await startAdd();
    await screen.findByText(fill(strings['add.done'], { login: 'ada-lab' }));
    expect(posts('/github/auth/login/poll')[0]!.body).toMatchObject({ activate: true });
    expect(within(await row('ada-lab')).getByText(strings.active)).toBeInTheDocument();
  });

  it('GitHub’s refusals are failed with their reason, never unknown, and a new start is offered', async () => {
    await show({ login: 'expired' });
    await startAdd();
    expect(await screen.findByText(strings['add.expired'], { exact: false })).toBeInTheDocument();
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
    expect(addOff()).toBe(false);
    cleanup(); queryClient.clear();
    await show({ login: 'denied' });
    await startAdd();
    expect(await screen.findByText(strings['add.denied'], { exact: false })).toBeInTheDocument();
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
  });

  it('a lost wait is proved by a new account in the list; nothing is sent again', async () => {
    await show({ login: 'lost' });
    await startAdd();
    await row('ada-lab');
    await waitFor(() => expect(document.querySelector('[data-outcome="pending"]')).toBeNull());
    expect(posts('/github/auth/login/poll')).toHaveLength(1);
    expect(addOff()).toBe(false);
  });

  it('a wait that did not link stays held (Add locked) after Check again; Stop tracking frees it after a warning', async () => {
    await show({ login: 'notApplied' });
    await startAdd();
    const line = await screen.findByRole('alert');
    expect(line).toHaveAttribute('data-outcome', 'pending');
    expect(screen.getByText(strings['add.held'], { exact: false })).toBeInTheDocument();
    expect(addOff()).toBe(true);
    await userEvent.click(within(line).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(within(screen.getByRole('alert')).getByRole('button', { name: /check again/i })).not.toBeDisabled());
    expect(screen.getByRole('alert')).toHaveAttribute('data-outcome', 'pending');
    await userEvent.click(screen.getByRole('button', { name: strings.dismiss }));
    await confirmIn(strings.dismiss);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(addOff()).toBe(false);
    expect(posts('/github/auth/login/poll')).toHaveLength(1);
  });

  it('a lost start links nothing: Check again proves it did not go through, and no wait is sent', async () => {
    await show({ startLost: true });
    await startAdd();
    const line = await screen.findByRole('alert');
    expect(line).toHaveAttribute('data-outcome', 'pending');
    await userEvent.click(within(line).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(document.querySelector('[data-outcome="pending"]')).toBeNull());
    expect(posts('/github/auth/login/poll')).toHaveLength(0);
    expect(posts('/github/auth/login')).toHaveLength(1);
  });
});

describe('GitHub accounts: the device code, leaving mid-login, a switch whose account left, health of the account checked', () => {
  const hook = () => renderHook(() => useDeviceLogin(useGitHubAt()!), {
    wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  });

  it('nothing keeps the device code once the wait has an outcome: linked, refused, lost or unknown', async () => {
    for (const login of [undefined, 'expired', 'lost', 'notApplied'] as const) {
      sent = [];
      bootFixtureCore({ rules: githubRules({ ...(login ? { login } : {}), onSend: (r) => sent.push(r) }) });
      const h = hook();
      await act(async () => { await h.result.current.begin(false, ['github.com/ada', 'github.com/ada-work']); });
      expect(posts('/github/auth/login/poll')[0]!.body).toMatchObject({ device_code: CODE });
      expect(h.result.current.holdsCode()).toBe(false);
      expect(JSON.stringify([h.result.current.start.outcome ?? null, h.result.current.login.outcome ?? null, h.result.current.shown])).not.toContain(CODE);
      // A held wait (lost, unknown) is freed so the next round can send one.
      if (h.result.current.login.outcome?.kind === 'pending') await act(async () => { await h.result.current.login.dismiss(); });
      h.unmount();
      cleanup();
      queryClient.clear();
    }
  });

  it('the start\'s answer is cleared at once: during the wait only the wait holds the code', async () => {
    const g = gate();
    sent = [];
    bootFixtureCore({ rules: githubRules({ pollGate: g.p, onSend: (r) => sent.push(r) }) });
    const h = hook();
    let done: Promise<void> = Promise.resolve();
    act(() => { done = h.result.current.begin(false, []); });
    await waitFor(() => expect(h.result.current.shown?.userCode).toBe('WDJB-MJHT'));
    expect(h.result.current.start.leftover()).toBeUndefined();
    expect(h.result.current.holdsCode()).toBe(true);
    g.open();
    await act(async () => { await done; });
    expect(h.result.current.holdsCode()).toBe(false);
  });

  it('a start answered after the page was left sends no wait', async () => {
    const g = gate();
    await show({ startGate: g.p });
    await startAdd();
    await waitFor(() => expect(posts('/github/auth/login')).toHaveLength(1));
    cleanup();
    await act(async () => { g.open(); await new Promise((r) => setTimeout(r, 50)); });
    expect(posts('/github/auth/login/poll')).toHaveLength(0);
    expect(codesWaiting()).toBe(0);
  });

  it('a wait out when the page was left: back on it there is no code and no second sign-in, then the account shows', async () => {
    const g = gate();
    await show({ pollGate: g.p });
    await startAdd();
    expect(await screen.findByText('WDJB-MJHT')).toBeInTheDocument();
    cleanup();
    await mount();
    expect(await screen.findByText(strings['add.earlier'])).toBeInTheDocument();
    expect(screen.queryByText('WDJB-MJHT')).toBeNull();
    expect(addOff()).toBe(true);
    await act(async () => { g.open(); });
    await row('ada-lab');
    await waitFor(() => expect(addOff()).toBe(false));
    expect(screen.queryByText(strings['add.earlier'])).toBeNull();
    expect(posts('/github/auth/login/poll')).toHaveLength(1);
    expect(posts('/github/auth/login')).toHaveLength(1);
  });

  it('a held switch stays in view with Check again and Stop tracking after its account is logged out', async () => {
    await show({ seed: seed3, active: 'notApplied' });
    await userEvent.click(within(await row('ada-work')).getByRole('button', { name: strings['action.use'] }));
    const heldText = fill(strings['use.held'], { login: 'ada-work' });
    expect(await screen.findByText(heldText, { exact: false })).toBeInTheDocument();
    expect(isOff(within(await row('ada-lab')).getByRole('button', { name: strings['action.use'] }))).toBe(true);
    await clickLogout(await row('ada-work'));
    await confirmIn(strings['logout.confirm']);
    await waitFor(() => expect(screen.queryByText('ada-work', { exact: true })).toBeNull());
    expect(screen.getByText(heldText, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check again/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings.dismiss }));
    await confirmIn(strings.dismiss);
    await waitFor(() => expect(isOff(within(rowEl('ada-lab')).getByRole('button', { name: strings['action.use'] }))).toBe(false));
    expect(screen.queryByText(heldText, { exact: false })).toBeNull();
    expect(posts('/github/auth/active')).toHaveLength(1);
  });

  it('health and push access are shown only for the account the agent checked', async () => {
    await show({ observed: 'ada-work' });
    const ada = await row('ada');
    expect(within(ada).getByText(strings['health.unchecked'])).toBeInTheDocument();
    expect(screen.queryByText(strings['health.ok'])).toBeNull();
    cleanup(); queryClient.clear();
    await show({ observed: 'ada-work', health: 'invalid' });
    await row('ada');
    expect(screen.queryByText(strings['health.invalid'])).toBeNull();
    cleanup(); queryClient.clear();
    await show({ observed: 'ada-work', noPush: true });
    await row('ada');
    expect(screen.queryByText(strings.noPush, { exact: false })).toBeNull();
    cleanup(); queryClient.clear();
    await show({ observed: 'ADA' });
    expect(within(await row('ada')).getByText(strings['health.ok'])).toBeInTheDocument();
  });
});

describe('GitHub accounts: no copy of the code once the page is left, a log-out done before the list comes back, how a wait ended', () => {
  it('leaving during a wait: nothing the page or core keeps can produce the code; only the request already sent had it', async () => {
    // Every input object core builds for the wait (core keeps them with the call until it settles).
    const def = (githubTable.changes as Record<string, { input?: (v: never) => unknown }>).login!;
    const orig = def.input!;
    const kept: unknown[] = [];
    def.input = (v: never) => { const o = orig(v); kept.push(o); return o; };
    try {
      const g = gate();
      await show({ pollGate: g.p });
      await startAdd();
      expect(await screen.findByText('WDJB-MJHT')).toBeInTheDocument();
      await waitFor(() => expect(posts('/github/auth/login/poll')).toHaveLength(1));
      // The request carried the code when it was sent, and while the page is here core's input still yields it.
      expect(posts('/github/auth/login/poll')[0]!.body).toMatchObject({ device_code: CODE });
      expect(kept.length).toBeGreaterThan(0);
      expect(JSON.stringify(kept)).toContain(CODE);
      expect(codesWaiting()).toBe(1);
      cleanup();
      // Left, the wait still out: the page's store is empty and no object core keeps for the call yields the code.
      expect(codesWaiting()).toBe(0);
      expect(JSON.stringify(kept)).not.toContain(CODE);
      await mount();
      await screen.findByText(strings['add.earlier']);
      await act(async () => { g.open(); });
      await row('ada-lab');
      expect(posts('/github/auth/login/poll')).toHaveLength(1);
      expect(codesWaiting()).toBe(0);
    } finally {
      def.input = orig;
    }
  });

  it('the wait\'s variables, its held record and its byte snapshot never carry the code (only a handle)', async () => {
    sent = [];
    bootFixtureCore({ rules: githubRules({ login: 'notApplied', onSend: (r) => sent.push(r) }) });
    const h = renderHook(() => useDeviceLogin(useGitHubAt()!), {
      wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
    });
    await act(async () => { await h.result.current.begin(false, []); });
    expect(posts('/github/auth/login/poll')[0]!.body).toMatchObject({ device_code: CODE });
    // A held wait: its identity (what the page and other tabs read) and the runner's state carry no code.
    expect(h.result.current.login.outcome?.kind).toBe('pending');
    expect(JSON.stringify([h.result.current.login.held, h.result.current.login.outcome, queryClient.getMutationCache().getAll().map((m) => m.state.variables ?? null)])).not.toContain(CODE);
    expect(codesWaiting()).toBe(0);
    await act(async () => { await h.result.current.login.dismiss(); });
    h.unmount();
  });

  it('a log-out answered done closes its dialog and says so at once, while the list is still being read; sent once', async () => {
    let hold: Promise<void> | undefined;
    let release = () => {};
    await show({ statusWait: () => hold });
    await clickLogout(await row('ada-work'));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    hold = new Promise<void>((r) => { release = r; });
    await userEvent.click(within(dlg).getByRole('button', { name: strings['logout.confirm'] }));
    await waitFor(() => expect(screen.getByText(strings['logout.done'])).toBeInTheDocument());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(posts('/github/auth/logout')).toHaveLength(1);
    hold = undefined;
    await act(async () => { release(); });
    await waitFor(() => expect(screen.queryByText('ada-work', { exact: true })).toBeNull());
    expect(posts('/github/auth/logout')).toHaveLength(1);
    expect(screen.getByText(strings['logout.done'])).toBeInTheDocument();
  });

  for (const [mode, words] of [['expired', 'add.expired'], ['denied', 'add.denied']] as const) {
    it(`a wait refused (${mode}) after the page was left: back on it, the refusal shows, the wait line goes, Add is offered`, async () => {
      const g = gate();
      await show({ pollGate: g.p, login: mode });
      await startAdd();
      expect(await screen.findByText('WDJB-MJHT')).toBeInTheDocument();
      cleanup();
      await mount();
      expect(await screen.findByText(strings['add.earlier'])).toBeInTheDocument();
      await act(async () => { g.open(); });
      expect(await screen.findByText(`${strings['add.late']} ${strings[words]}`)).toBeInTheDocument();
      expect(screen.queryByText(strings['add.earlier'])).toBeNull();
      await waitFor(() => expect(addOff()).toBe(false));
      expect(posts('/github/auth/login')).toHaveLength(1);
      expect(posts('/github/auth/login/poll')).toHaveLength(1);
      // The next start clears it: once that start's own wait has ended (refused again, shown as this page's own refusal).
      await startAdd();
      await screen.findByText(strings[words], { exact: true });
      await waitFor(() => expect(addOff()).toBe(false));
      expect(screen.queryByText(`${strings['add.late']} ${strings[words]}`)).toBeNull();
      expect(codesWaiting()).toBe(0);
    });
  }

  it('a wait that linked after the page was left says so when back', async () => {
    const g = gate();
    await show({ pollGate: g.p });
    await startAdd();
    expect(await screen.findByText('WDJB-MJHT')).toBeInTheDocument();
    cleanup();
    await mount();
    await screen.findByText(strings['add.earlier']);
    await act(async () => { g.open(); });
    expect(await screen.findByText(`${strings['add.late']} ${fill(strings['add.done'], { login: 'ada-lab' })}`)).toBeInTheDocument();
  });
});

describe('GitHub accounts: a logged-out row before the list comes back', () => {
  it('a log-out answered done marks its row "Logged out" with its actions off at once; no second log-out; the row goes with the list', async () => {
    let hold: Promise<void> | undefined;
    let release = () => {};
    await show({ statusWait: () => hold });
    await clickLogout(await row('ada-work'));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    hold = new Promise<void>((r) => { release = r; });
    await userEvent.click(within(dlg).getByRole('button', { name: strings['logout.confirm'] }));
    await waitFor(() => expect(screen.getByText(strings['logout.done'])).toBeInTheDocument());
    // The list is still being read: the row stays, says so, and offers nothing.
    const r = await row('ada-work');
    expect(within(r).getByText(strings['logout.gone'])).toBeInTheDocument();
    expect(await logoutOff(r)).toBe(true);
    expect(isOff(within(r).getByRole('button', { name: strings['action.use'] }))).toBe(true);
    await clickLogout(r);
    await closeMenu();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    // Another account is untouched.
    expect(await logoutOff(await row('ada'))).toBe(false);
    expect(within(await row('ada')).queryByText(strings['logout.gone'])).toBeNull();
    expect(posts('/github/auth/logout')).toHaveLength(1);
    hold = undefined;
    await act(async () => { release(); });
    await waitFor(() => expect(screen.queryByText('ada-work', { exact: true })).toBeNull());
    expect(screen.queryByText(strings['logout.gone'])).toBeNull();
    expect(posts('/github/auth/logout')).toHaveLength(1);
  });

  it('linked again after the list dropped it: the row is an ordinary row again (the mark is gone)', async () => {
    await show({ newLogin: 'ada-work' });
    await clickLogout(await row('ada-work'));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['logout.confirm'] }));
    await waitFor(() => expect(screen.queryByText('ada-work', { exact: true })).toBeNull());
    await startAdd();
    const r = await waitFor(() => row('ada-work'));
    await closeAdd();
    await waitFor(async () => expect(await logoutOff(r)).toBe(false));
    expect(within(r).queryByText(strings['logout.gone'])).toBeNull();
  });

  it('leaving and coming back before the list drops it keeps the row marked and its actions off; sent once', async () => {
    let hold: Promise<void> | undefined;
    let release = () => {};
    await show({ statusWait: () => hold });
    await clickLogout(await row('ada-work'));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    hold = new Promise<void>((r) => { release = r; });
    await userEvent.click(within(dlg).getByRole('button', { name: strings['logout.confirm'] }));
    await waitFor(() => expect(screen.getByText(strings['logout.done'])).toBeInTheDocument());
    cleanup();
    await mount();
    const r = await row('ada-work');
    expect(within(r).getByText(strings['logout.gone'])).toBeInTheDocument();
    expect(await logoutOff(r)).toBe(true);
    expect(isOff(within(r).getByRole('button', { name: strings['action.use'] }))).toBe(true);
    hold = undefined;
    await act(async () => { release(); });
    await waitFor(() => expect(screen.queryByText('ada-work', { exact: true })).toBeNull());
    expect(posts('/github/auth/logout')).toHaveLength(1);
  });

  it('a done answer that comes after a list already dropped the key and the account was linked again marks nothing', async () => {
    const g = gate();
    await show({ logoutGate: g.p, newLogin: 'ada-work' });
    await clickLogout(await row('ada-work'));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['logout.confirm'] }));
    // The log-out applied (the server has it: a list read before it arrives still holds the key, and nothing reads again);
    // its answer is late. A list read now lacks the key (the section counts it done).
    await waitFor(() => expect(posts('/github/auth/logout')).toHaveLength(1));
    await act(async () => { await queryClient.invalidateQueries(); });
    await waitFor(() => expect(screen.queryByText('ada-work', { exact: true })).toBeNull());
    // Linked again before the answer comes.
    await startAdd();
    const r = await waitFor(() => row('ada-work'));
    await closeAdd();
    await act(async () => { g.open(); });
    await waitFor(() => expect(posts('/github/auth/logout')).toHaveLength(1));
    await act(async () => { await new Promise((x) => setTimeout(x, 50)); });
    expect(within(r).queryByText(strings['logout.gone'])).toBeNull();
    expect(await logoutOff(await row('ada-work'))).toBe(false);
  });

  it('a late done answer from a section left before the list dropped the key marks nothing after a re-link', async () => {
    const g = gate();
    await show({ logoutGate: g.p, newLogin: 'ada-work' });
    await clickLogout(await row('ada-work'));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['logout.confirm'] }));
    await waitFor(() => expect(posts('/github/auth/logout')).toHaveLength(1));
    // Leave and come back while the answer is out; the new section's list lacks the key.
    cleanup();
    await mount();
    await act(async () => { await queryClient.invalidateQueries(); });
    await waitFor(() => expect(screen.queryByText('ada-work', { exact: true })).toBeNull());
    await startAdd();
    await waitFor(() => row('ada-work'));
    await closeAdd();
    await act(async () => { g.open(); });
    await act(async () => { await new Promise((x) => setTimeout(x, 50)); });
    await act(async () => { await queryClient.invalidateQueries(); });
    const r = await row('ada-work');
    expect(within(r).queryByText(strings['logout.gone'])).toBeNull();
    expect(await logoutOff(r)).toBe(false);
    expect(posts('/github/auth/logout')).toHaveLength(1);
  });
});

// Global accounts (realm=global), offered while the top bar shows All realms (core reads and releases a held change
// only in the realm view it was sent in). The realm a call sent is read from its URL: the fixture request does not carry it.
describe('GitHub accounts: Global accounts', () => {
  const R1 = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  let urls: string[] = [];
  const spyUrls = () => {
    urls = [];
    const t = transport();
    const real = t.fetch.bind(t);
    vi.spyOn(t, 'fetch').mockImplementation((url, init, meta) => { urls.push(url); return real(url, init, meta); });
  };
  const showSpied = async (o: GitHubOpts, realm: string) => {
    sent = [];
    bootFixtureCore({ rules: [...realmsOfAtlas(realm), ...githubRules({ ...o, onSend: (r) => sent.push(r) })], realm });
    spyUrls();
    await mount();
  };
  const realmOf = (u: string) => new URL(u).searchParams.get('realm');
  const callsTo = (path: string) => urls.filter((u) => new URL(u).pathname.endsWith(path));
  const globalRadio = () => screen.getByRole('radio', { name: strings['place.global'] });
  const pickGlobal = async () => { await userEvent.click(globalRadio()); };
  // The top bar's realm pick, as pages/vault/page.realm.test.tsx does it.
  const switchRealm = (r: string) => act(() => { setRealm(r); bump('switch'); });

  it('under a picked realm Global is offered too and reads and changes realm=global; the realm place reads the realm', async () => {
    await showSpied({ seed: seed3 }, R1);
    await screen.findByText('ada', { exact: true });
    expect(globalRadio()).not.toBeDisabled();
    expect(screen.getByRole('radiogroup', { name: strings.place })).toHaveAccessibleDescription(strings['place.globalOk']);
    expect(urls.map(realmOf).every((r) => r === R1)).toBe(true);
    urls = [];
    await pickGlobal();
    expect(screen.getByText(strings['place.globalNote'])).toBeInTheDocument();
    await userEvent.click(within(await row('ada-lab')).getByRole('button', { name: strings['action.use'] }));
    await waitFor(() => expect(inUse('ada-lab')).toBe(true));
    for (const path of ['/github/auth/status', '/github/auth/active']) {
      expect(callsTo(path).length, path).toBeGreaterThan(0);
      expect(callsTo(path).map(realmOf), path).toEqual(callsTo(path).map(() => 'global'));
    }
    expect(urls.map(realmOf).every((r) => r === 'global')).toBe(true);
    urls = [];
    await userEvent.click(screen.getByRole('radio', { name: strings['place.realm'] }));
    await screen.findByText('ada', { exact: true });
    expect(urls.map(realmOf).every((r) => r === R1)).toBe(true);
  });

  it('a shared-access session cannot reach Global (its calls carry its pin): the choice is off and says so, and only its realm is read', async () => {
    sent = [];
    bootFixtureCore({ rules: githubRules({ onSend: (r) => sent.push(r) }), realm: R1 });
    pin(R1);
    spyUrls();
    await mount();
    await screen.findByText('ada', { exact: true });
    expect(globalRadio()).toBeDisabled();
    expect(screen.getByRole('radiogroup', { name: strings.place })).toHaveAccessibleDescription(strings['place.globalOff']);
    await act(async () => { pickAccountsPlace('global'); });
    expect(screen.getByRole('radio', { name: strings['place.realm'] })).toBeChecked();
    await waitFor(() => expect(callsTo('/github/auth/status').length).toBeGreaterThan(0));
    expect(urls.map(realmOf).every((r) => r === R1)).toBe(true);
  });

  it('a session pinned to every realm (an access key with no realm limit) reaches Global like an account session', async () => {
    // Its agent calls send the realm each names (core kit.ts agentRealm), so Global is offered and its calls say global.
    sent = [];
    bootFixtureCore({ rules: [...realmsOfAtlas('all'), ...githubRules({ onSend: (r) => sent.push(r) })], realm: 'all' });
    pin('all');
    spyUrls();
    await mount();
    expect(await screen.findByText(strings['allRealms.title'])).toBeInTheDocument();
    expect(globalRadio()).not.toBeDisabled();
    expect(screen.getByRole('radiogroup', { name: strings.place })).toHaveAccessibleDescription(strings['place.globalOk']);
    expect(callsTo('/github/auth/status')).toHaveLength(0);
    await pickGlobal();
    await waitFor(() => expect(callsTo('/github/auth/status').length).toBeGreaterThan(0));
    expect(urls.map(realmOf).every((r) => r === 'global')).toBe(true);
  });

  it('under All realms Global reads and changes realm=global: status, switch, log-out and a device login', async () => {
    await showSpied({}, 'all');
    expect(await screen.findByText(strings['allRealms.title'])).toBeInTheDocument();
    expect(globalRadio()).not.toBeDisabled();
    expect(screen.getByRole('radiogroup', { name: strings.place })).toHaveAccessibleDescription(strings['place.globalOk']);
    await pickGlobal();
    expect(screen.getByText(strings['place.globalNote'])).toBeInTheDocument();
    await userEvent.click(within(await row('ada-work')).getByRole('button', { name: strings['action.use'] }));
    await waitFor(() => expect(inUse('ada-work')).toBe(true));
    await clickLogout(await row('ada'));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    expect(within(dlg).getByText(fill(strings['logout.body'], { login: 'ada', place: strings['place.inGlobal'] }), { exact: false })).toBeInTheDocument();
    await confirmIn(strings['logout.confirm']);
    await screen.findByText(strings['logout.done']);
    await startAdd();
    await screen.findByText(fill(strings['add.done'], { login: 'ada-lab' }));
    for (const path of ['/github/auth/status', '/github/auth/active', '/github/auth/logout', '/github/auth/login', '/github/auth/login/poll']) {
      expect(callsTo(path).length, path).toBeGreaterThan(0);
      expect(callsTo(path).map(realmOf), path).toEqual(callsTo(path).map(() => 'global'));
    }
    expect(urls.map(realmOf).every((r) => r === 'global')).toBe(true);
  });

  it('a realm\'s held switch, log-out and sign-in never show, block or settle in Global (the picks match the realm)', async () => {
    await showSpied({ active: 'notApplied', logout: 'notApplied', login: 'notApplied' }, 'all');
    // Each sent under All realms with the realm's own place, lost: core lists all three in the All realms view.
    const { result } = renderHook(() => {
      const target = useCurrentComputer();
      const at = target ? { target, realm: R1 } : null;
      return { at, use: useActivate(at), out: useLogout(at, 'github.com/ada-work'), login: useLogin(at) };
    }, { wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> });
    const at = result.current.at!;
    await act(async () => { await result.current.use.run({ ...at, key: 'github.com/ada-work', login: 'ada-work' }); });
    await act(async () => { await result.current.out.run({ ...at, key: 'github.com/ada-work', login: 'ada-work' }); });
    await act(async () => {
      await result.current.login.run({ ...at, activate: false, before: [], device: { handle: 'gh-global-h', interval: 0, expiresIn: 600 } });
    });
    expect(result.current.use.outcome?.kind).toBe('pending');
    expect(result.current.out.outcome?.kind).toBe('pending');
    expect(result.current.login.outcome?.kind).toBe('pending');
    for (const path of ['/github/auth/active', '/github/auth/logout', '/github/auth/login/poll']) expect(callsTo(path).map(realmOf), path).toEqual([R1]);
    await pickGlobal();
    const work = await row('ada-work');
    expect(screen.queryByText(fill(strings['use.held'], { login: 'ada-work' }), { exact: false })).toBeNull();
    expect(screen.queryByText(fill(strings['logout.held'], { login: 'ada-work' }), { exact: false })).toBeNull();
    expect(screen.queryByText(strings['add.held'], { exact: false })).toBeNull();
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
    expect(isOff(within(work).getByRole('button', { name: strings['action.use'] }))).toBe(false);
    expect(await logoutOff(work)).toBe(false);
    expect(addOff()).toBe(false);
    // Seen from Global, the realm's three are untouched: still held, each with its own hold.
    expect(result.current.use.outcome?.kind).toBe('pending');
    expect(result.current.out.outcome?.kind).toBe('pending');
    expect(result.current.login.outcome?.kind).toBe('pending');
    expect(result.current.use.hold).toBeTruthy();
    expect(result.current.out.hold).toBeTruthy();
    // Back in that realm (the top bar picks it, then its place; Global stays picked across a top-bar switch): its three are
    // shown there, held, with their own recovery.
    await switchRealm(R1);
    await userEvent.click(screen.getByRole('radio', { name: strings['place.realm'] }));
    expect(await screen.findByText(fill(strings['use.held'], { login: 'ada-work' }), { exact: false })).toBeInTheDocument();
    expect(screen.getByText(fill(strings['logout.held'], { login: 'ada-work' }), { exact: false })).toBeInTheDocument();
    expect(screen.getByText(strings['add.held'], { exact: false })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /check again/i }).length).toBeGreaterThanOrEqual(3);
  });

  it('the reverse: a Global hold stays shown in Global after the top bar picks a realm, and never shows in a realm place', async () => {
    await showSpied({ seed: seed3, active: 'notApplied' }, 'all');
    await pickGlobal();
    await userEvent.click(within(await row('ada-lab')).getByRole('button', { name: strings['action.use'] }));
    expect(await screen.findByText(fill(strings['use.held'], { login: 'ada-lab' }), { exact: false })).toBeInTheDocument();
    await switchRealm(R1);
    // Global stays picked and offered: its hold is still shown, with its own recovery.
    expect(globalRadio()).toBeChecked();
    expect(await screen.findByText(fill(strings['use.held'], { login: 'ada-lab' }), { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveAttribute('data-outcome', 'pending');
    // The realm's own place knows nothing of it.
    await userEvent.click(screen.getByRole('radio', { name: strings['place.realm'] }));
    const lab = await row('ada-lab');
    expect(screen.queryByText(fill(strings['use.held'], { login: 'ada-lab' }), { exact: false })).toBeNull();
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
    expect(isOff(within(lab).getByRole('button', { name: strings['action.use'] }))).toBe(false);
    await pickGlobal();
    expect(await screen.findByText(fill(strings['use.held'], { login: 'ada-lab' }), { exact: false })).toBeInTheDocument();
    // Another realm at the top: Global's hold is still there.
    await switchRealm('bbbbbbbbbbbbbbbbbbbbbbbb');
    expect(await screen.findByText(fill(strings['use.held'], { login: 'ada-lab' }), { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveAttribute('data-outcome', 'pending');
    expect(posts('/github/auth/active')).toHaveLength(1);
    expect(callsTo('/github/auth/active').map(realmOf)).toEqual(['global']);
  });

  it('a Global hold made under a picked realm is shown there and freed by Check again there; only Global is read', async () => {
    let failReads = false;
    const stuck = gate();
    await showSpied({ seed: seed3, active: 'lost', statusWait: () => (failReads ? stuck.p : undefined) }, R1);
    await screen.findByText('ada', { exact: true });
    await pickGlobal();
    await row('ada-lab');
    failReads = true;
    await userEvent.click(within(rowEl('ada-lab')).getByRole('button', { name: strings['action.use'] }));
    const held = () => document.querySelector<HTMLElement>('[data-outcome="pending"]');
    await waitFor(() => expect(held()).not.toBeNull());
    expect(globalRadio()).toBeChecked();
    expect(screen.getByText(fill(strings['use.held'], { login: 'ada-lab' }), { exact: false })).toBeInTheDocument();
    expect(callsTo('/github/auth/active').map(realmOf)).toEqual(['global']);
    failReads = false;
    urls = [];
    await userEvent.click(within(held()!).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(held()).toBeNull());
    await waitFor(() => expect(inUse('ada-lab')).toBe(true));
    expect(posts('/github/auth/active')).toHaveLength(1);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.map(realmOf)).toEqual(urls.map(() => 'global'));
    await act(async () => { stuck.open(); });
  });

  it('a Global log-out and sign-in wait held under a picked realm stay shown in Global after the top bar moves: each names its realm', async () => {
    await showSpied({ logout: 'notApplied', login: 'notApplied' }, R1);
    await screen.findByText('ada', { exact: true });
    const { result } = renderHook(() => {
      const target = useCurrentComputer();
      const at = target ? { target, realm: 'global' } : null;
      return { at, out: useLogout(at, 'github.com/ada-work'), login: useLogin(at) };
    }, { wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> });
    const at = result.current.at!;
    await act(async () => { await result.current.out.run({ ...at, key: 'github.com/ada-work', login: 'ada-work' }); });
    await act(async () => {
      await result.current.login.run({ ...at, activate: false, before: [], device: { handle: 'gh-global-l2', interval: 0, expiresIn: 600 } });
    });
    expect(result.current.out.outcome?.kind).toBe('pending');
    expect(result.current.login.outcome?.kind).toBe('pending');
    for (const path of ['/github/auth/logout', '/github/auth/login/poll']) expect(callsTo(path).map(realmOf), path).toEqual(['global']);
    await pickGlobal();
    expect(await screen.findByText(fill(strings['logout.held'], { login: 'ada-work' }), { exact: false })).toBeInTheDocument();
    expect(screen.getByText(strings['add.held'], { exact: false })).toBeInTheDocument();
    await switchRealm('bbbbbbbbbbbbbbbbbbbbbbbb');
    expect(await screen.findByText(fill(strings['logout.held'], { login: 'ada-work' }), { exact: false })).toBeInTheDocument();
    expect(screen.getByText(strings['add.held'], { exact: false })).toBeInTheDocument();
    expect(posts('/github/auth/logout')).toHaveLength(1);
    expect(posts('/github/auth/login/poll')).toHaveLength(1);
  });

  it('Check again from another place reads nothing and frees nothing; back in its place the hold is the same', async () => {
    await showSpied({ seed: seed3, active: 'notApplied' }, R1);
    await screen.findByText('ada', { exact: true });
    const { result, rerender } = renderHook(({ realm }: { realm: string }) => {
      const target = useCurrentComputer();
      const at = target ? { target, realm } : null;
      return { at, use: useActivate(at) };
    }, { initialProps: { realm: R1 }, wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> });
    await act(async () => { await result.current.use.run({ ...result.current.at!, key: 'github.com/ada-work', login: 'ada-work' }); });
    expect(result.current.use.outcome?.kind).toBe('pending');
    const hold = result.current.use.hold;
    expect(hold).toBeTruthy();
    rerender({ realm: 'global' });
    urls = [];
    let freed: boolean | undefined;
    await act(async () => { freed = await result.current.use.check(); });
    expect(freed).toBe(false);
    expect(urls).toEqual([]);
    rerender({ realm: R1 });
    await waitFor(() => expect(result.current.use.outcome?.kind).toBe('pending'));
    expect(result.current.use.hold).toBe(hold);
    expect(posts('/github/auth/active')).toHaveLength(1);
  });

  it('Check again on a Global hold reads only Global and leaves a realm hold held (holds in both places)', async () => {
    await showSpied({ seed: seed3, active: 'notApplied' }, 'all');
    // The realm's switch, sent under All realms, with that realm's status read open too (another view of it).
    const { result } = renderHook(() => {
      const target = useCurrentComputer();
      const at = target ? { target, realm: R1 } : null;
      return { at, use: useActivate(at), status: useGitHubStatus(at) };
    }, { wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> });
    await waitFor(() => expect(result.current.status.data).toBeTruthy());
    await act(async () => { await result.current.use.run({ ...result.current.at!, key: 'github.com/ada-work', login: 'ada-work' }); });
    expect(result.current.use.outcome?.kind).toBe('pending');
    await pickGlobal();
    await userEvent.click(within(await row('ada-lab')).getByRole('button', { name: strings['action.use'] }));
    const line = await screen.findByRole('alert');
    expect(line).toHaveAttribute('data-outcome', 'pending');
    expect(screen.getByText(fill(strings['use.held'], { login: 'ada-lab' }), { exact: false })).toBeInTheDocument();
    const realmHold = result.current.use.hold;
    urls = [];
    await userEvent.click(within(line).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(within(screen.getByRole('alert')).getByRole('button', { name: /check again/i })).not.toBeDisabled());
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.map(realmOf)).toEqual(urls.map(() => 'global'));
    expect(screen.getByRole('alert')).toHaveAttribute('data-outcome', 'pending');
    expect(result.current.use.outcome?.kind).toBe('pending');
    expect(result.current.use.hold).toBe(realmHold);
  });

  it('Check again on a Global hold frees it once Global\'s list shows it applied; only Global is read', async () => {
    let failReads = false;
    const stuck = gate();
    await showSpied({ seed: seed3, active: 'lost', statusWait: () => (failReads ? stuck.p : undefined) }, 'all');
    await pickGlobal();
    await row('ada-lab');
    // The switch applies but its answer is lost, and the read core makes right after never answers: it stays held.
    failReads = true;
    await userEvent.click(within(rowEl('ada-lab')).getByRole('button', { name: strings['action.use'] }));
    const held = () => document.querySelector<HTMLElement>('[data-outcome="pending"]');
    await waitFor(() => expect(held()).not.toBeNull());
    expect(screen.getByText(fill(strings['use.held'], { login: 'ada-lab' }), { exact: false })).toBeInTheDocument();
    failReads = false;
    urls = [];
    await userEvent.click(within(held()!).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(held()).toBeNull());
    await waitFor(() => expect(inUse('ada-lab')).toBe(true));
    expect(posts('/github/auth/active')).toHaveLength(1);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.map(realmOf)).toEqual(urls.map(() => 'global'));
    await act(async () => { stuck.open(); });
  });

  it('a Global wait out when the section remounts or the place flips: shown as still waiting, no second sign-in', async () => {
    const g = gate();
    await showSpied({ pollGate: g.p }, 'all');
    await pickGlobal();
    await startAdd();
    expect(await screen.findByText('WDJB-MJHT')).toBeInTheDocument();
    cleanup();
    await mount();
    expect(await screen.findByText(strings['add.earlier'])).toBeInTheDocument();
    expect(addOff()).toBe(true);
    await userEvent.click(screen.getByRole('radio', { name: strings['place.realm'] }));
    expect(await screen.findByText(strings['allRealms.title'])).toBeInTheDocument();
    await pickGlobal();
    expect(await screen.findByText(strings['add.earlier'])).toBeInTheDocument();
    expect(addOff()).toBe(true);
    await act(async () => { g.open(); });
    expect(await screen.findByText(`${strings['add.late']} ${fill(strings['add.done'], { login: 'ada-lab' })}`)).toBeInTheDocument();
    await waitFor(() => expect(addOff()).toBe(false));
    expect(posts('/github/auth/login')).toHaveLength(1);
    expect(posts('/github/auth/login/poll')).toHaveLength(1);
    expect(urls.map(realmOf).every((r) => r === 'global')).toBe(true);
  });

  it('a Global wait that ends after the page was left shows in Global, never in a realm of the same computer', async () => {
    const g = gate();
    await showSpied({ pollGate: g.p }, 'all');
    await pickGlobal();
    await startAdd();
    expect(await screen.findByText('WDJB-MJHT')).toBeInTheDocument();
    cleanup();
    await act(async () => { g.open(); });
    await waitFor(() => expect(posts('/github/auth/login/poll')).toHaveLength(1));
    await waitFor(() => expect(codesWaiting()).toBe(0));
    const late = `${strings['add.late']} ${fill(strings['add.done'], { login: 'ada-lab' })}`;
    // The same computer, a picked realm and its place: that realm's section knows nothing of Global's wait.
    queryClient.clear();
    pickAccountsPlace('realm');
    await showSpied({}, R1);
    await screen.findByText('ada', { exact: true });
    expect(screen.queryByText(late)).toBeNull();
    expect(screen.queryByText(strings['add.earlier'])).toBeNull();
    expect(addOff()).toBe(false);
    cleanup(); queryClient.clear();
    // Back in Global (under All realms; any realm offers it): there it is.
    pickAccountsPlace('global');
    await showSpied({}, 'all');
    expect(await screen.findByText(late)).toBeInTheDocument();
  });
});

// Public text of this folder: none of the banned forms (the "Stop tracking" wording is the one used).
describe('GitHub accounts is kit structure: no unstructured sections', () => {
  it('one framed section with one h2; its one primary, Add, in the head; the place a choice in a setting group; the accounts a table', async () => {
    await show({ seed: seed3 });
    await row('ada');
    const h = screen.getByRole('heading', { level: 2, name: strings.title });
    const frame = h.closest('section')!;
    expect(frame).not.toBeNull();
    expect(within(frame).getAllByRole('heading', { level: 2 })).toHaveLength(1);
    expect(within(h.closest('header')!).getByRole('button', { name: strings['add.start'] })).toBeInTheDocument();
    expect(within(frame).getByRole('radiogroup', { name: strings.place }).closest('[data-setting-group]')).not.toBeNull();
    expect(rowEl('ada').closest('table')).not.toBeNull();
    // No other primary in the section: the add flow's own start is in its dialog.
    expect(frame.querySelectorAll('[data-variant="primary"]').length).toBeLessThanOrEqual(1);
  });

  it('no account: the empty state is in the table and says in one line to add one above; the head keeps Add', async () => {
    await show({ seed: [] });
    const empty = await screen.findByText(strings['empty.body']);
    // The table's own empty place (the kit draws no rows and no toolbar while nothing exists yet).
    expect(empty.closest('[data-dataview-empty]')).not.toBeNull();
    expect(strings['empty.body']).toBe('Add a GitHub account above.');
    expect(screen.getByRole('button', { name: strings['add.start'] })).toBeInTheDocument();
  });

  it('"Use it from now on" is a switch in the add dialog, never a loose control in the section', async () => {
    await show({ seed: seed3 });
    await row('ada');
    expect(screen.queryByRole('checkbox', { name: new RegExp(strings['add.activate']) })).toBeNull();
    expect(screen.queryByRole('switch', { name: new RegExp(strings['add.activate']) })).toBeNull();
    const dlg = await openAdd();
    expect(within(dlg).getByRole('switch', { name: new RegExp(strings['add.activate']) }).closest('[data-setting-group]')).not.toBeNull();
    // Opening the dialog sends nothing: the code is asked for only by its own button.
    expect(posts('/github/auth/login')).toHaveLength(0);
  });
});

describe('connections public strings', () => {
  const BANNED = /\b(forget|forgets|forgetting|forgot|forgotten|dismiss|dismisses|dismissed|dismissing|abandon|abandons|abandoned|abandoning)\b|\bstop(s|ped|ping)?\s+(watching|waiting)\b/i;
  it('no banned word form in any shown string (keys are not shown)', () => {
    for (const [file, table] of [['strings.en.json', strings], ['Mcp.strings.en.json', mcpStrings]] as const) {
      const hits = Object.entries(table as Record<string, unknown>).filter(([, v]) => typeof v === 'string' && BANNED.test(v)).map(([k]) => `${file}:${k}`);
      expect(hits).toEqual([]);
    }
    expect(BANNED.test('This only stops waiting here.')).toBe(true);
    expect(BANNED.test('The agent forgets it.')).toBe(true);
    expect(BANNED.test('This page stops tracking it.')).toBe(false);
  });
});
