// The Claude Code copy drawers on real core (fixture transport, answered as the agent answers). Preview
// first, then one apply of that preview's token; per-path Replace consent; an expired or dropped preview sends nothing; a
// stale preview or a target that changed writes nothing and asks for a new preview; a lost answer may have written and is
// never sent again; another computer starts the drawers over.
import { answers, bootFixtureCore, chooseComputer, fixtureWorld, queryClient, reply, type FixtureRequest, type FixtureRule } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the drawers, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a router harness (the files table reads the route), not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- the shell's data provider, a test harness for the computer list, not page code
import { ShellDataProvider, type ShellComputer } from '@shell/context';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LinksModule from '../../../files/links';
import { chatRoutes } from '../../parts/data';
import { clearCopies, copyStore } from './copyStore';
import { notifyPending, onPending, openMutations, type PendingNotice } from '@core/api';
import { bump, identity, resetCore, setIdentity, startLoggingOut } from '@core/ctx';
import { ClaudeCopies, ClaudeTransfer } from './Transfer';
import { computerRealms } from '../../realmRules.testing';
import { transferRules, type CopyComputer, type TransferOpts } from './transferFixtures';
import strings from './Transfer.strings.en.json';

// The kit's leave toast, recorded (a pending copy whose drawer goes away leaves one behind).
const toasts = vi.hoisted(() => [] as Array<{ title: string; tone?: string }>);
const closed = vi.hoisted(() => new Set<string>());
/** The toasts shown and not closed since. */
const openToasts = () => toasts.filter((_, i) => !closed.has(`t${i + 1}`)).map((x) => x.title);
vi.mock('@kit/states/Toast', async (orig) => ({
  ...(await orig<object>()),
  showToast: (c: { title: string; tone?: string }) => { toasts.push(c); return `t${toasts.length}`; },
  closeToast: (k: string) => { closed.add(k); },
}));

// The path field's folder reads: each folder by absolute path, answered from `tree` (the files program's
// entries); `asked` records every read started.
let tree: Record<string, unknown[]> = {};
const asked: string[] = [];
const fns = new Map<string, () => Promise<unknown>>();
function stable(path: string) {
  if (!fns.has(path)) fns.set(path, () => {
    asked.push(path);
    const r = tree[path];
    return Promise.resolve(r ? { isSuccess: true, data: { entries: r }, dataUpdatedAt: Date.now() } : { isSuccess: false, data: undefined, dataUpdatedAt: 0 });
  });
  return fns.get(path)!;
}
vi.mock('../../../files/links', async (orig) => ({
  ...(await orig<typeof LinksModule>()),
  useFolder: (_c: unknown, path: string) => ({
    data: undefined, dataUpdatedAt: 0, isPending: false, isError: false, isFetching: false, fetchStatus: 'idle', refetch: stable(path),
  }),
}));
const dirE = (name: string) => ({ name, dir: true, lossy: false, type: 'dir' });
const fileE = (name: string) => ({ name, dir: false, lossy: false, type: 'file' });
/** The agent's home folder as GET /sessions/cwds answers it (null: the read fails). */
let home: string | null = '/home/ada';

type K = keyof typeof strings;
const w = (k: K, v: Record<string, string | number> = {}) => strings[k].replace(/\{\{(\w+)\}\}/g, (_, n: string) => String(v[n] ?? ''));
const byName = (n: string) => fixtureWorld.computers.find((c) => c.name === n)!;
const ATLAS = () => byName('atlas');
const BOREALIS = () => byName('borealis');
const GRANITE = () => byName('granite');
const SHELL: ShellComputer[] = ['atlas', 'borealis', 'granite'].map((n) => ({ id: byName(n).id, name: n, running: true }));

let sent: FixtureRequest[] = [];
const applies = () => sent.filter((r) => r.path.endsWith('/apply'));
const previews = () => sent.filter((r) => !r.path.endsWith('/apply'));
let world: Record<string, CopyComputer> = {};

function seed(): Record<string, CopyComputer> {
  return {
    [ATLAS().id]: { login: '{"claudeAiOauth":{}}', files: { '.claude/settings.json': '{"a":1}', '.claude/CLAUDE.md': '# me', '.claude/agents/x.md': 'x', '.claude/projects/p.jsonl': 'chat', 'notes.txt': 'n' } },
    [BOREALIS().id]: { files: { '.claude/settings.json': '{"old":1}' } },
    [GRANITE().id]: { login: 'old', files: {} },
  };
}

interface ShellOver { computers?: ShellComputer[]; computersRead?: 'loading' | 'unknown'; retryComputers?: () => void }

async function show(o: TransferOpts & { realm?: string; shell?: ShellOver; rules?: FixtureRule[] } = {}) {
  sent = [];
  world = o.world ?? seed();
  const { realm, shell, rules, ...opts } = o;
  const cwds = reply(chatRoutes.cwds, () => (home === null ? answers.refused(500, 'internal') : answers.ok({ cwds: [], home })));
  bootFixtureCore({ rules: [...(rules ?? []), ...transferRules({ ...opts, world, onSend: (r) => sent.push(r) }), cwds], ...(realm !== undefined ? { realm } : {}) });
  await act(async () => { chooseComputer(ATLAS()); });
  await mount(shell);
}

/** Mounts the page (again) on the booted core and the same world: a remount after the page left. */
async function mount(shell?: ShellOver) {
  const Page = () => (
    <ShellDataProvider value={{ realms: [], realmId: 'r', computers: SHELL, ...shell }}>
      <ClaudeCopies><ClaudeTransfer /></ClaudeCopies>
    </ShellDataProvider>
  );
  const router = createRouter({ routeTree: createRootRoute({ component: Page }), history: createMemoryHistory({ initialEntries: ['/ai'] }) });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
}

const button = (k: K, v: Record<string, string | number> = {}) => screen.getByRole('button', { name: w(k, v) });
const drawer = (k: K) => screen.findByRole('dialog', { name: w(k) });
async function pickTo(name: string) {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(`${w('to')}$`) }));
  const list = await screen.findByRole('dialog', { name: w('to') });
  await userEvent.click(within(list).getByText(name));
}
async function openLogin(to = 'borealis') {
  await userEvent.click(button('login.open'));
  await drawer('login.title');
  await pickTo(to);
}
async function openFiles(to = 'borealis') {
  await userEvent.click(button('files.open'));
  await drawer('files.title');
  await pickTo(to);
}
const pathBox = () => screen.getByRole('combobox', { name: new RegExp(w('path')) });
const rows = () => screen.queryAllByRole('option').filter((o) => o.hasAttribute('data-key')).map((o) => o.textContent);
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const press = async (k: K, v: Record<string, string | number> = {}) => { await userEvent.click(button(k, v)); };

beforeEach(() => {
  toasts.length = 0;
  closed.clear();
  home = '/home/ada';
  tree = { '/home/ada': [dirE('.claude'), fileE('notes.txt'), dirE('projects')], '/home/ada/.claude': [fileE('settings.json'), dirE('agents')] };
  asked.length = 0;
  fns.clear();
});

afterEach(() => {
  cleanup();
  clearCopies();
  queryClient.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('sign-in copy', () => {
  it('Preview reads both computers and writes nothing; Copy applies that token once, overwrite false onto an empty target', async () => {
    await show();
    await openLogin('borealis');
    expect(applies()).toHaveLength(0);
    await press('preview');
    await screen.findByText(w('login.absent', { to: 'borealis' }));
    expect(world[BOREALIS().id]!.login).toBeUndefined();
    const p = previews()[0]!;
    expect(p.body).toEqual({ source: { kind: 'host' }, target_computer: BOREALIS().id });
    expect(p.target?.container.id).toBe(ATLAS().id);
    await press('login.copy');
    await screen.findByText(w('login.done', { to: 'borealis' }));
    expect(applies()).toHaveLength(1);
    expect(applies()[0]!.body).toEqual({ preview_token: 'tok-1', overwrite: false });
    expect(world[BOREALIS().id]!.login).toBe('{"claudeAiOauth":{}}');
    // The token is spent: the next step is a new preview, never a second Copy.
    expect(screen.queryByRole('button', { name: w('login.copy') })).toBeNull();
    expect(button('preview.again')).toBeEnabled();
  });

  it('a target that already has a sign-in: Copy stays off until the Replace tick, then sends overwrite true', async () => {
    await show();
    await openLogin('granite');
    await press('preview');
    await screen.findByText(w('login.present', { to: 'granite' }));
    // forms-required: Copy is soft-disabled and says the tick is needed; a press on it sends nothing.
    expect(button('login.copy')).toHaveAttribute('aria-disabled', 'true');
    expect(button('login.copy')).not.toBeDisabled();
    expect(screen.getAllByText(w('need.consent', { to: 'granite' })).length).toBeGreaterThan(0);
    await press('login.copy');
    await flush();
    expect(applies()).toHaveLength(0);
    await userEvent.click(screen.getByRole('checkbox', { name: w('login.consent', { to: 'granite' }) }));
    expect(screen.queryByText(w('need.consent', { to: 'granite' }))).toBeNull();
    expect(button('login.copy')).toBeEnabled();
    expect(button('login.copy')).not.toHaveAttribute('aria-disabled', 'true');
    await press('login.copy');
    await screen.findByText(w('login.doneReplaced', { to: 'granite' }));
    expect(applies().map((r) => r.body)).toEqual([{ preview_token: 'tok-1', overwrite: true }]);
  });

  it('Preview says it waits for the computer to copy to; with one chosen it is on', async () => {
    await show();
    await userEvent.click(button('login.open'));
    await drawer('login.title');
    expect(button('preview')).toHaveAttribute('aria-disabled', 'true');
    expect(button('preview')).not.toBeDisabled();
    expect(screen.getAllByText(w('need.to')).length).toBeGreaterThan(0);
    await press('preview');
    await flush();
    expect(previews()).toHaveLength(0);
    await pickTo('borealis');
    expect(screen.queryByText(w('need.to'))).toBeNull();
    expect(button('preview')).toBeEnabled();
    expect(button('preview')).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('a sign-in that appeared on the target after the preview: 409 preview_stale (changed) writes nothing and asks for a new preview, never resends', async () => {
    await show({ beforeApply: (wd) => { wd[BOREALIS().id]!.login = 'someone else'; } });
    await openLogin('borealis');
    await press('preview');
    await screen.findByText(w('login.absent', { to: 'borealis' }));
    await press('login.copy');
    await screen.findByText(w('stale.changed', { to: 'borealis' }));
    expect(world[BOREALIS().id]!.login).toBe('someone else');
    expect(applies()).toHaveLength(1);
    expect(button('preview.again')).toBeEnabled();
  });

  it('a lost answer may have copied: "may have copied", Preview again, and the apply is never sent again', async () => {
    await show({ apply: 'lost' });
    await openLogin('borealis');
    await press('preview');
    await screen.findByText(w('login.absent', { to: 'borealis' }));
    await press('login.copy');
    await screen.findByText(w('pending.body', { to: 'borealis' }));
    expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull();
    expect(applies()).toHaveLength(1);
    await press('preview.again');
    // The new preview shows what is there now: the copy did land.
    await screen.findByText(w('login.present', { to: 'borealis' }));
    expect(screen.queryByText(w('pending.body', { to: 'borealis' }))).toBeNull();
    expect(applies()).toHaveLength(1);
  });

  it('a source with no sign-in is refused at preview: nothing planned, nothing to copy', async () => {
    await show({ world: { [ATLAS().id]: { files: {} } } });
    await openLogin('borealis');
    await press('preview');
    await screen.findByText(w('why.source_empty'));
    expect(screen.queryByRole('button', { name: w('login.copy') })).toBeNull();
    expect(applies()).toHaveLength(0);
  });

  it('changing To after a preview drops it: Copy is gone and nothing is sent for the old target', async () => {
    await show();
    await openLogin('borealis');
    await press('preview');
    await screen.findByText(w('login.absent', { to: 'borealis' }));
    await pickTo('granite');
    expect(screen.queryByRole('button', { name: w('login.copy') })).toBeNull();
    expect(screen.queryByText(w('login.absent', { to: 'borealis' }))).toBeNull();
    expect(applies()).toHaveLength(0);
  });

  it('an expired preview turns Copy off by itself and asks for Preview again, sending nothing', async () => {
    await show({ ttlMs: 7_000 });
    await openLogin('borealis');
    await press('preview');
    await screen.findByText(w('login.absent', { to: 'borealis' }));
    expect(button('login.copy')).toBeEnabled();
    await screen.findByText(w('plan.expired'), undefined, { timeout: 4_000 });
    expect(screen.queryByRole('button', { name: w('login.copy') })).toBeNull();
    expect(button('preview.again')).toBeEnabled();
    expect(applies()).toHaveLength(0);
  });

  it('To never offers this computer or the From computer', async () => {
    await show();
    await userEvent.click(button('login.open'));
    await drawer('login.title');
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`${w('to')}$`) }));
    const list = await screen.findByRole('dialog', { name: w('to') });
    expect(within(list).queryByText('atlas')).toBeNull();
    expect(within(list).queryByText(/atlas/)).toBeNull();
    expect(within(list).getByText('borealis')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    // From another computer: that one leaves To too, and the plan reads from it.
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`${w('from')}$`) }));
    const from = await screen.findByRole('dialog', { name: w('from') });
    await userEvent.click(within(from).getByText('granite'));
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`${w('to')}$`) }));
    const to2 = await screen.findByRole('dialog', { name: w('to') });
    expect(within(to2).queryByText('granite')).toBeNull();
    // This computer stays out of To even when the copy reads from another one (the agent refuses not_remote).
    expect(within(to2).queryByText(/atlas/)).toBeNull();
    await userEvent.click(within(to2).getByText('borealis'));
    await press('preview');
    await screen.findByText(w('login.absent', { to: 'borealis' }));
    expect(previews()[0]!.body).toEqual({ source: { kind: 'computer', computer: GRANITE().id }, target_computer: BOREALIS().id });
  });
});

describe('layout.overlayId: each copy drawer names its overlay', () => {
  it('the open sign-in drawer carries data-hub-overlay="claude-copy-login", the settings drawer "claude-copy-files"', async () => {
    await show();
    await userEvent.click(button('login.open'));
    expect((await drawer('login.title')).closest('[data-hub-overlay]')?.getAttribute('data-hub-overlay')).toBe('claude-copy-login');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: w('login.title') })).toBeNull());
    await userEvent.click(button('files.open'));
    expect((await drawer('files.title')).closest('[data-hub-overlay]')?.getAttribute('data-hub-overlay')).toBe('claude-copy-files');
  });
});

describe('settings copy', () => {
  it('per-path consent: existing files are kept unless ticked; only ticked paths go in overwrite; skipped ones are shown', async () => {
    await show({ world: { ...seed(), [BOREALIS().id]: { files: { '.claude/settings.json': 'old', '.claude/CLAUDE.md': 'old md' } } } });
    await openFiles('borealis');
    await press('preview');
    const table = await screen.findByRole('table', { name: w('files.label') });
    // Configuration only: the chat file under projects/ and files outside .claude are not planned.
    expect(within(table).queryByText('.claude/projects/p.jsonl')).toBeNull();
    expect(within(table).getByText('.claude/agents/x.md')).toBeInTheDocument();
    expect(within(table).queryByRole('checkbox', { name: w('replace', { path: '.claude/agents/x.md' }) })).toBeNull();
    const settings = within(table).getByRole('checkbox', { name: w('replace', { path: '.claude/settings.json' }) });
    expect(settings).not.toBeChecked();
    await userEvent.click(settings);
    await press('files.copy_other', { count: 2 });
    await screen.findByText(new RegExp(w('files.done_other', { count: 2, to: 'borealis' }).replace('.', '\\.')));
    expect(applies().map((r) => r.body)).toEqual([{ preview_token: 'tok-1', overwrite: ['.claude/settings.json'] }]);
    expect(world[BOREALIS().id]!.files['.claude/settings.json']).toBe('{"a":1}');
    expect(world[BOREALIS().id]!.files['.claude/CLAUDE.md']).toBe('old md');
    expect(screen.getByText(new RegExp(w('files.skipped_one', { count: 1, paths: '.claude/CLAUDE.md' })))).toBeInTheDocument();
  });

  it('every file exists and none is ticked: nothing would be copied, so Copy is off', async () => {
    await show({ world: { ...seed(), [BOREALIS().id]: { files: { '.claude/settings.json': 'o', '.claude/CLAUDE.md': 'o', '.claude/agents/x.md': 'o' } } } });
    await openFiles('borealis');
    await press('preview');
    await screen.findByText(w('files.nothing', { to: 'borealis' }));
    expect(button('files.copy_other', { count: 0 })).toBeDisabled();
    expect(applies()).toHaveLength(0);
  });

  it('a preview that went stale (a file changed since): 409 writes nothing and asks for a new preview, never resends', async () => {
    await show({ beforeApply: (wd) => { wd[ATLAS().id]!.files['.claude/settings.json'] = 'edited'; } });
    await openFiles('borealis');
    await press('preview');
    await screen.findByRole('table', { name: w('files.label') });
    await press('files.copy_other', { count: 2 });
    await screen.findByText(w('stale.changed', { to: 'borealis' }));
    expect(applies()).toHaveLength(1);
    expect(world[BOREALIS().id]!.files['.claude/CLAUDE.md']).toBeUndefined();
    expect(button('preview.again')).toBeEnabled();
  });

  it('503 outcome_unknown is pending, never failed, and never sent again', async () => {
    await show({ apply: 'unknown' });
    await openFiles('borealis');
    await press('preview');
    await screen.findByRole('table', { name: w('files.label') });
    await press('files.copy_other', { count: 2 });
    await screen.findByText(w('pending.body', { to: 'borealis' }));
    expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull();
    expect(applies()).toHaveLength(1);
  });

  it('another file or folder: the path is checked before anything is sent, and editing it drops the preview', async () => {
    await show();
    await openFiles('borealis');
    await userEvent.click(screen.getByRole('radio', { name: w('what.path') }));
    const field = pathBox();
    await userEvent.type(field, '../etc');
    await userEvent.keyboard('{Escape}');
    expect(screen.getByText(w('path.bad'))).toBeInTheDocument();
    expect(button('preview')).toBeDisabled();
    await userEvent.clear(field);
    await userEvent.type(field, 'notes.txt');
    await userEvent.keyboard('{Escape}');
    await press('preview');
    await screen.findByRole('table', { name: w('files.label') });
    expect(previews().at(-1)!.body).toEqual({ mode: 'file', path: 'notes.txt', source: { kind: 'host' }, target_computer: BOREALIS().id });
    await userEvent.type(field, 'x');
    await userEvent.keyboard('{Escape}');
    // the Escape closed the path list only: the drawer is still open, so the preview is gone because the path changed
    expect(screen.getByRole('dialog', { name: w('files.title') })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: w('files.label') })).toBeNull();
    expect(applies()).toHaveLength(0);
  });

  it('the path is typed below the agent\'s home on this computer: its entries are listed as typed, and a picked file is the path sent', async () => {
    await show();
    await openFiles('borealis');
    await userEvent.click(screen.getByRole('radio', { name: w('what.path') }));
    expect(await screen.findByText('/home/ada/')).toBeInTheDocument();
    await userEvent.type(pathBox(), 'n');
    await flush();
    expect(rows()).toEqual(['notes.txt']);
    await userEvent.click(screen.getByRole('option', { name: 'notes.txt' }));
    await flush();
    expect(pathBox()).toHaveValue('notes.txt');
    expect([...new Set(asked)]).toEqual(['/home/ada']);
    await press('preview');
    await screen.findByRole('table', { name: w('files.label') });
    expect(previews().at(-1)!.body).toEqual({ mode: 'file', path: 'notes.txt', source: { kind: 'host' }, target_computer: BOREALIS().id });
  });

  it('a folder: a picked folder is sent without its trailing "/"; as a file, a path still ending in "/" is not ready and is not called wrong', async () => {
    await show();
    await openFiles('borealis');
    await userEvent.click(screen.getByRole('radio', { name: w('what.path') }));
    await userEvent.click(screen.getByRole('radio', { name: w('kind.dir') }));
    await userEvent.type(pathBox(), '.c');
    await flush();
    await userEvent.click(screen.getByRole('option', { name: '.claude/' }));
    await flush();
    await userEvent.keyboard('{Escape}');
    expect(pathBox()).toHaveValue('.claude/');
    expect(screen.queryByText(w('path.bad'))).toBeNull();
    await press('preview');
    await screen.findByRole('table', { name: w('files.label') });
    expect(previews().at(-1)!.body).toEqual({ mode: 'dir', path: '.claude', source: { kind: 'host' }, target_computer: BOREALIS().id });
    await userEvent.click(screen.getByRole('radio', { name: w('kind.file') }));
    expect(screen.queryByText(w('path.bad'))).toBeNull();
    // forms-required: off, and it says why (a folder where a file is asked), staying focusable; nothing is sent.
    const before = previews().length;
    expect(button('preview')).toHaveAttribute('aria-disabled', 'true');
    expect(button('preview')).not.toBeDisabled();
    expect(screen.getAllByText(w('need.file')).length).toBeGreaterThan(0);
    await press('preview');
    await flush();
    expect(previews()).toHaveLength(before);
  });
  // forms-required, "Copy settings drawer, Preview": Preview was off with nothing naming the missing
  // target computer or the empty path.
  it('Preview says what it waits for: the computer to copy to, then the path; with both it is on', async () => {
    await show();
    await userEvent.click(button('files.open'));
    await drawer('files.title');
    expect(button('preview')).toHaveAttribute('aria-disabled', 'true');
    expect(button('preview')).not.toBeDisabled();
    expect(screen.getAllByText(w('need.to')).length).toBeGreaterThan(0);
    await press('preview');
    await flush();
    expect(previews()).toHaveLength(0);
    await pickTo('borealis');
    expect(screen.queryByText(w('need.to'))).toBeNull();
    expect(button('preview')).toBeEnabled();
    expect(button('preview')).not.toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(screen.getByRole('radio', { name: w('what.path') }));
    expect(button('preview')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByText(w('need.path')).length).toBeGreaterThan(0);
    expect(pathBox()).toBeRequired();
    await press('preview');
    await flush();
    expect(previews()).toHaveLength(0);
    await userEvent.type(pathBox(), 'notes.txt');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText(w('need.path'))).toBeNull();
    expect(button('preview')).toBeEnabled();
  });

  it('from another computer nothing is listed (its home is not read): no root is shown and nothing can be browsed, and a typed path is still sent', async () => {
    await show();
    await userEvent.click(button('files.open'));
    await drawer('files.title');
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`${w('from')}$`) }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: w('from') })).getByText('granite'));
    await pickTo('borealis');
    await userEvent.click(screen.getByRole('radio', { name: w('what.path') }));
    // No root is known here: a plain typed path (the label says it is below the home folder), with no "~" and no Browse.
    expect(screen.queryByText('~/')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Browse' })).toBeNull();
    expect(screen.getByText(w('path.elsewhere'))).toBeInTheDocument();
    await userEvent.type(pathBox(), 'notes.txt');
    await flush();
    await userEvent.keyboard('{Escape}');
    expect(asked).toEqual([]);
    await press('preview');
    await waitFor(() => expect(previews()).toHaveLength(1));
    expect(previews()[0]!.body).toEqual({ mode: 'file', path: 'notes.txt', source: { kind: 'computer', computer: GRANITE().id }, target_computer: BOREALIS().id });
  });

  it('a typed path stays through a From switch: on another computer nothing is read or offered, and back here it is listed again', async () => {
    await show();
    await openFiles('borealis');
    await userEvent.click(screen.getByRole('radio', { name: w('what.path') }));
    expect(await screen.findByText('/home/ada/')).toBeInTheDocument();
    await userEvent.type(pathBox(), 'n');
    await flush();
    expect(rows()).toEqual(['notes.txt']);
    await userEvent.keyboard('{Escape}');
    const before = asked.length;
    const from = async (name: string) => {
      await userEvent.click(screen.getByRole('button', { name: new RegExp(`${w('from')}$`) }));
      await userEvent.click(within(await screen.findByRole('dialog', { name: w('from') })).getByText(name));
      await flush();
    };
    await from('granite');
    expect(pathBox()).toHaveValue('n');
    // No root is known here: a plain typed path (the label says it is below the home folder), with no "~" and no Browse.
    expect(screen.queryByText('~/')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Browse' })).toBeNull();
    expect(screen.getByText(w('path.elsewhere'))).toBeInTheDocument();
    await userEvent.click(pathBox());
    await flush();
    expect(rows()).toEqual([]);
    expect(asked).toHaveLength(before);
    await userEvent.keyboard('{Escape}');
    await from(w('here', { name: 'atlas' }));
    expect(pathBox()).toHaveValue('n');
    expect(await screen.findByText('/home/ada/')).toBeInTheDocument();
    expect(screen.queryByText(w('path.elsewhere'))).toBeNull();
    await userEvent.click(pathBox());
    await flush();
    expect(rows()).toEqual(['notes.txt']);
  });

  it('home unknown (its read fails): nothing is listed or browsed, no root is shown, and a typed path is still checked and sent', async () => {
    home = null;
    await show();
    await openFiles('borealis');
    await userEvent.click(screen.getByRole('radio', { name: w('what.path') }));
    // No root is known here: a plain typed path (the label says it is below the home folder), with no "~" and no Browse.
    expect(screen.queryByText('~/')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Browse' })).toBeNull();
    await userEvent.type(pathBox(), '../x');
    await userEvent.keyboard('{Escape}');
    expect(screen.getByText(w('path.bad'))).toBeInTheDocument();
    await userEvent.clear(pathBox());
    await userEvent.type(pathBox(), 'notes.txt');
    await userEvent.keyboard('{Escape}');
    expect(asked).toEqual([]);
    await press('preview');
    await screen.findByRole('table', { name: w('files.label') });
    expect(previews().at(-1)!.body).toEqual({ mode: 'file', path: 'notes.txt', source: { kind: 'host' }, target_computer: BOREALIS().id });
  });

  it('a sign-in file asked for through a settings copy is refused with the pointer to Copy sign-in', async () => {
    await show();
    await openFiles('borealis');
    await userEvent.click(screen.getByRole('radio', { name: w('what.path') }));
    await userEvent.type(pathBox(), '.claude/.credentials.json');
    await userEvent.keyboard('{Escape}');
    await press('preview');
    await screen.findByText(w('why.credential_requires_import'));
    expect(applies()).toHaveLength(0);
  });
});

describe('where', () => {
  it('another computer starts the drawers over: a preview made on atlas is gone and nothing goes to the new computer for it', async () => {
    await show();
    await openLogin('borealis');
    await press('preview');
    await screen.findByText(w('login.absent', { to: 'borealis' }));
    await act(async () => { chooseComputer(GRANITE()); });
    await waitFor(() => expect(screen.queryByText(w('login.absent', { to: 'borealis' }))).toBeNull());
    expect(screen.queryByRole('button', { name: w('login.copy') })).toBeNull();
    expect(applies()).toHaveLength(0);
  });

  it('All realms, a computer in several realms: both rows say to choose one realm and open nothing', async () => {
    const [r1, r2] = fixtureWorld.realms.map((r) => r.id) as [string, string];
    await show({ realm: 'all', rules: [computerRealms(ATLAS().id, [r1, r2])] });
    expect(screen.getAllByText(w('noRealm'))).toHaveLength(2);
    expect(button('login.open')).toBeDisabled();
    expect(button('files.open')).toBeDisabled();
    expect(sent).toHaveLength(0);
  });
});

// ── lost answers and stale reads ─────────────────────────────────────────
const NEG = /Nothing was copied|Nothing was written|Not copied/;
const FOLLOW_UPS: Array<[string, NonNullable<TransferOpts['previewAfter']>]> = [
  ['no answer (connection lost)', { network: true, delayMs: 5 }],
  ['a 503', { status: 503, body: { error: 'service_unavailable' } }],
  ['a 4xx refusal', { status: 422, body: { error: 'source_unusable', details: { reason: 'source_read_failed' } } }],
  ['an unreadable 200', { status: 200, body: { nonsense: true } }],
];

async function loginToPending(o: TransferOpts = {}) {
  await show({ apply: 'lost', ...o });
  await openLogin('borealis');
  await press('preview');
  await screen.findByText(w('login.absent', { to: 'borealis' }));
  await press('login.copy');
  await screen.findByText(w('pending.body', { to: 'borealis' }));
}
async function filesToPending(o: TransferOpts = {}) {
  await show({ apply: 'lost', ...o });
  await openFiles('borealis');
  await press('preview');
  await screen.findByRole('table', { name: w('files.label') });
  await press('files.copy_other', { count: 2 });
  await screen.findByText(w('pending.body', { to: 'borealis' }));
}

describe('an unknown copy stays unknown until a preview reads the target', () => {
  it.each(FOLLOW_UPS)('sign-in: a follow-up preview that fails with %s keeps "may have copied", says the target was not checked, never claims nothing was copied, never resends', async (_n, answer) => {
    await loginToPending({ previewAfter: answer });
    expect(screen.queryByText(NEG)).toBeNull();
    await press('preview.again');
    await screen.findByText(new RegExp(w('preview.checkFailed', { to: 'borealis' }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    expect(screen.getByText(w('pending.body', { to: 'borealis' }))).toBeInTheDocument();
    expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull();
    expect(screen.queryByText(NEG)).toBeNull();
    expect(applies()).toHaveLength(1);
  });

  it.each(FOLLOW_UPS)('settings: a follow-up preview that fails with %s keeps "may have copied", says the target was not checked, never claims nothing was copied, never resends', async (_n, answer) => {
    await filesToPending({ previewAfter: answer });
    await press('preview.again');
    await screen.findByText(new RegExp(w('preview.checkFailed', { to: 'borealis' }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    expect(screen.getByText(w('pending.body', { to: 'borealis' }))).toBeInTheDocument();
    expect(screen.queryByText(NEG)).toBeNull();
    expect(applies()).toHaveLength(1);
  });

  it('a preview of another target leaves the unknown copy to borealis shown; only a preview that reads borealis settles it', async () => {
    await loginToPending();
    await pickTo('granite');
    await press('preview.again');
    await screen.findByText(w('login.present', { to: 'granite' }));
    expect(screen.getByText(w('pending.body', { to: 'borealis' }))).toBeInTheDocument();
    await pickTo('borealis');
    await press('preview.again');
    await screen.findByText(w('login.present', { to: 'borealis' }));
    expect(screen.queryByText(w('pending.body', { to: 'borealis' }))).toBeNull();
    expect(applies()).toHaveLength(1);
  });
});

describe('a 200 that is not a whole receipt is never a completed copy', () => {
  it('sign-in: 200 {imported:false} reads "may have copied", offers Preview again, never says signed in, never resends', async () => {
    await show({ apply: 'malformed', applyBody: { imported: false, owner_only: true } });
    await openLogin('borealis');
    await press('preview');
    await screen.findByText(w('login.absent', { to: 'borealis' }));
    await press('login.copy');
    await screen.findByText(w('pending.unreadable', { to: 'borealis' }));
    expect(screen.queryByText(new RegExp(w('login.done', { to: 'borealis' }).replace('.', '\\.')))).toBeNull();
    expect(button('preview.again')).toBeEnabled();
    expect(screen.queryByRole('button', { name: w('login.copy') })).toBeNull();
    expect(applies()).toHaveLength(1);
  });

  it('settings: 200 {files_written:3} without its lists reads "may have copied", never "Copied 0 files", never resends', async () => {
    await show({ apply: 'malformed', applyBody: { files_written: 3, bytes: 42 } });
    await openFiles('borealis');
    await press('preview');
    await screen.findByRole('table', { name: w('files.label') });
    await press('files.copy_other', { count: 2 });
    await screen.findByText(w('pending.unreadable', { to: 'borealis' }));
    expect(screen.queryByText(/Copied 0 files/)).toBeNull();
    expect(button('preview.again')).toBeEnabled();
    expect(applies()).toHaveLength(1);
  });
});

describe('one apply per preview, whatever the render timing', () => {
  async function twice(name: string) {
    const btn = button(name as K, name === 'files.copy_other' ? { count: 2 } : {});
    await act(async () => { btn.click(); btn.click(); });
  }
  it('sign-in: two presses before any render send one apply', async () => {
    let release!: () => void;
    await show({ gate: new Promise<void>((r) => { release = r; }) });
    await openLogin('borealis');
    await press('preview');
    await screen.findByText(w('login.absent', { to: 'borealis' }));
    await twice('login.copy');
    await act(async () => { release(); });
    await screen.findByText(w('login.done', { to: 'borealis' }));
    expect(applies()).toHaveLength(1);
  });
  it('settings: two presses before any render send one apply', async () => {
    let release!: () => void;
    await show({ gate: new Promise<void>((r) => { release = r; }) });
    await openFiles('borealis');
    await press('preview');
    await screen.findByRole('table', { name: w('files.label') });
    await twice('files.copy_other');
    await act(async () => { release(); });
    await screen.findByText(new RegExp(w('files.done_other', { count: 2, to: 'borealis' }).replace('.', '\\.')));
    expect(applies()).toHaveLength(1);
  });
});

describe('an unknown copy outlives its drawer, one notice per copy, owned by the page', () => {
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  const leavePage = async () => { cleanup(); await settle(); };
  const subj = (k: 'login.subject' | 'files.subject', to: string) => `Your change to ${w(k, { to })} may have gone through`;
  const close = async (title: K) => {
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: w(title) })).toBeNull());
    await settle();
  };

  it('sign-in: closing the drawer keeps "may have copied" on the page (no toast); leaving the page leaves the toast naming the copy', async () => {
    await loginToPending();
    await close('login.title');
    expect(screen.getByText(w('pending.body', { to: 'borealis' }))).toBeInTheDocument();
    expect(toasts).toHaveLength(0);
    await leavePage();
    expect(toasts.map((x) => x.title)).toEqual([subj('login.subject', 'borealis')]);
    expect(applies()).toHaveLength(1);
  });

  it('settings: closing keeps the page notice; leaving the page leaves the toast', async () => {
    await filesToPending();
    await close('files.title');
    expect(screen.getByText(w('pending.body', { to: 'borealis' }))).toBeInTheDocument();
    expect(toasts).toHaveLength(0);
    await leavePage();
    expect(toasts.map((x) => x.title)).toEqual([subj('files.subject', 'borealis')]);
  });

  it('two unknown copies to two computers: closing keeps both on the page; leaving leaves one toast for each; each apply went once', async () => {
    await loginToPending();
    await pickTo('granite');
    await press('preview.again');
    await screen.findByText(w('login.present', { to: 'granite' }));
    await userEvent.click(screen.getByRole('checkbox', { name: w('login.consent', { to: 'granite' }) }));
    await press('login.copy');
    await screen.findByText(w('pending.body', { to: 'granite' }));
    await close('login.title');
    expect(screen.getByText(w('pending.body', { to: 'borealis' }))).toBeInTheDocument();
    expect(screen.getByText(w('pending.body', { to: 'granite' }))).toBeInTheDocument();
    await leavePage();
    expect(toasts.map((x) => x.title).sort()).toEqual([subj('login.subject', 'borealis'), subj('login.subject', 'granite')].sort());
    expect(applies()).toHaveLength(2);
  });

  it('two unknown settings copies, then another computer chosen: both stay on the page, bound to their copies', async () => {
    await filesToPending();
    await pickTo('granite');
    await press('preview.again');
    await screen.findByRole('table', { name: w('files.label') });
    // granite holds none of the files: all three are new.
    await press('files.copy_other', { count: 3 });
    await screen.findByText(w('pending.body', { to: 'granite' }));
    await act(async () => { chooseComputer(GRANITE()); });
    await settle();
    expect(screen.getByText(w('pending.body', { to: 'borealis' }))).toBeInTheDocument();
    expect(screen.getByText(w('pending.body', { to: 'granite' }))).toBeInTheDocument();
    expect(toasts).toHaveLength(0);
    expect(applies()).toHaveLength(2);
  });

  it('close, reopen, close again: no toast piles up; a later read that settles the copy retires its notice, so leaving leaves none', async () => {
    await loginToPending();
    await close('login.title');
    await press('login.open');
    await drawer('login.title');
    await close('login.title');
    await press('login.open');
    await drawer('login.title');
    expect(toasts).toHaveLength(0);
    await pickTo('borealis');
    await press('preview.again');
    await screen.findByText(w('login.present', { to: 'borealis' }));
    await close('login.title');
    expect(screen.queryByText(w('pending.body', { to: 'borealis' }))).toBeNull();
    await leavePage();
    expect(toasts).toHaveLength(0);
    expect(applies()).toHaveLength(1);
  });

  it('another computer chosen while the apply is out: its unknown answer still lands on the page, for the copy to borealis, sent once to the planning computer', async () => {
    let release!: () => void;
    await show({ apply: 'lost', gate: new Promise<void>((r) => { release = r; }) });
    await openLogin('borealis');
    await press('preview');
    await screen.findByText(w('login.absent', { to: 'borealis' }));
    await press('login.copy');
    await act(async () => { chooseComputer(GRANITE()); });
    await settle();
    await act(async () => { release(); });
    await screen.findByText(w('pending.body', { to: 'borealis' }));
    expect(toasts).toHaveLength(0);
    expect(applies()).toHaveLength(1);
    expect(applies()[0]!.target?.container.id).toBe(ATLAS().id);
  });

  it('leaving the page while the apply is out leaves the toast for that copy', async () => {
    await show({ gate: new Promise<void>(() => undefined) });
    await openLogin('borealis');
    await press('preview');
    await screen.findByText(w('login.absent', { to: 'borealis' }));
    await press('login.copy');
    await leavePage();
    expect(toasts.map((x) => x.title)).toEqual([subj('login.subject', 'borealis')]);
  });

  it('a copy that answered done leaves no notice and no toast', async () => {
    await show();
    await openLogin('borealis');
    await press('preview');
    await screen.findByText(w('login.absent', { to: 'borealis' }));
    await press('login.copy');
    await screen.findByText(w('login.done', { to: 'borealis' }));
    await close('login.title');
    await leavePage();
    expect(toasts).toHaveLength(0);
  });
});

describe('only a read that checked the copied paths settles an unknown copy', () => {
  const later = () => Date.now() + 600_000;
  const CRED = '/home/user/.claude/.credentials.json';
  const loginPlan = (target_state: string) => ({ status: 200, body: { preview_token: 'tok-r', expires_ms: later(), target_path: CRED, target_state, bytes: 3, preview: 'x' } });
  const filesPlan = (rows: Array<[string, string]>) => ({ status: 200, body: { preview_token: 'tok-r', expires_ms: later(), mode: 'dir', file_count: rows.length, total_bytes: rows.length,
    files: rows.map(([path, target_state]) => ({ path, size: 1, target_state })) } });

  it('sign-in: a recovery preview whose target state is unknown keeps "may have copied"', async () => {
    await loginToPending({ previewAfter: loginPlan('unknown') });
    await press('preview.again');
    await screen.findByText(w('login.unknown', { to: 'borealis' }));
    expect(screen.getByText(w('pending.body', { to: 'borealis' }))).toBeInTheDocument();
    expect(applies()).toHaveLength(1);
  });

  it('settings: a recovery preview that could not check the copied files keeps "may have copied"', async () => {
    await filesToPending({ previewAfter: filesPlan([['.claude/CLAUDE.md', 'unknown'], ['.claude/agents/x.md', 'unknown']]) });
    await press('preview.again');
    await screen.findByRole('table', { name: w('files.label') });
    expect(screen.getByText(w('pending.body', { to: 'borealis' }))).toBeInTheDocument();
  });

  it('settings: a recovery preview covering only one of the copied files keeps the copy unknown', async () => {
    await filesToPending({ previewAfter: filesPlan([['.claude/CLAUDE.md', 'present']]) });
    await press('preview.again');
    await screen.findByRole('table', { name: w('files.label') });
    expect(screen.getByText(w('pending.body', { to: 'borealis' }))).toBeInTheDocument();
  });

  it('settings: a preview of an unrelated file on the same computer keeps it; a preview of the copied files settles it', async () => {
    await filesToPending();
    await userEvent.click(screen.getByRole('radio', { name: w('what.path') }));
    await userEvent.type(pathBox(), 'notes.txt');
    await userEvent.keyboard('{Escape}');
    await press('preview.again');
    await screen.findByRole('table', { name: w('files.label') });
    expect(screen.getByText(w('pending.body', { to: 'borealis' }))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: new RegExp(`^${w('what.settings')}`) }));
    await press('preview.again');
    await screen.findByRole('checkbox', { name: w('replace', { path: '.claude/CLAUDE.md' }) });
    expect(screen.queryByText(w('pending.body', { to: 'borealis' }))).toBeNull();
    expect(applies()).toHaveLength(1);
  });
});

describe('a computer list not read yet is never "no other computer"', () => {
  const alone: ShellComputer[] = [{ id: byName('atlas').id, name: 'atlas', running: true }];
  it.each([['login.open', 'login.title'], ['files.open', 'files.title']] as const)('%s: loading says so; the empty sentence is not shown', async (open, title) => {
    await show({ shell: { computers: alone, computersRead: 'loading' } });
    await press(open);
    await drawer(title);
    expect(screen.queryByText(w('to.none'))).toBeNull();
    expect(screen.getByText('Loading computers…')).toBeInTheDocument();
  });
  it.each([['login.open', 'login.title'], ['files.open', 'files.title']] as const)('%s: a failed read says so and offers the shell\'s Try again', async (open, title) => {
    const retry = vi.fn();
    await show({ shell: { computers: alone, computersRead: 'unknown', retryComputers: retry } });
    await press(open);
    await drawer(title);
    expect(screen.queryByText(w('to.none'))).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`${w('to')}$`) }));
    const panel = await screen.findByRole('dialog', { name: w('to') });
    await userEvent.click(within(panel).getByRole('button', { name: /Try again/ }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it.each([['login.open', 'login.title'], ['files.open', 'files.title']] as const)('%s: a list read whole with no other computer says so', async (open, title) => {
    await show({ shell: { computers: alone } });
    await press(open);
    await drawer(title);
    expect(screen.getByText(w('to.none'))).toBeInTheDocument();
  });
});

// ── Reads racing an apply, and where an unknown copy shows ─────────────────────────────────────
describe('a read started before an apply answered never settles that copy', () => {
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  /** After another computer is chosen the drawer may stay open (it remounts for the new computer); open it only when it is closed. */
  const reopen = async (open: K, title: K, to: string) => {
    if (!screen.queryByRole('dialog', { name: w(title) })) await userEvent.click(button(open));
    await screen.findByRole('dialog', { name: w(title) });
    await pickTo(to);
  };
  it('sign-in: apply out, another computer chosen, a preview of the same target reads before the write and answers after the copy turned unknown: still "may have copied"', async () => {
    let releaseApply!: () => void;
    let releasePreview!: () => void;
    await show({ apply: 'lost', gate: new Promise<void>((r) => { releaseApply = r; }), previewHold: new Promise<void>((r) => { releasePreview = r; }) });
    await openLogin('borealis');
    await press('preview');
    await screen.findByText(w('login.absent', { to: 'borealis' }));
    await press('login.copy');
    await act(async () => { chooseComputer(GRANITE()); });
    await settle();
    await reopen('login.open', 'login.title', 'borealis');
    await press('preview');
    // The preview has read borealis (no sign-in yet); then the apply writes and its answer is lost.
    await act(async () => { releaseApply(); });
    await screen.findByText(w('pending.body', { to: 'borealis' }));
    await act(async () => { releasePreview(); });
    await screen.findByText(w('login.absent', { to: 'borealis' }));
    expect(screen.getByText(w('pending.body', { to: 'borealis' }))).toBeInTheDocument();
    expect(applies()).toHaveLength(1);
  });

  it('settings: the same ordering keeps the settings copy unknown', async () => {
    let releaseApply!: () => void;
    let releasePreview!: () => void;
    const wd = seed();
    wd[GRANITE().id]!.files = { ...wd[ATLAS().id]!.files };
    await show({ world: wd, apply: 'lost', gate: new Promise<void>((r) => { releaseApply = r; }), previewHold: new Promise<void>((r) => { releasePreview = r; }) });
    await openFiles('borealis');
    await press('preview');
    await screen.findByRole('table', { name: w('files.label') });
    await press('files.copy_other', { count: 2 });
    await act(async () => { chooseComputer(GRANITE()); });
    await settle();
    await reopen('files.open', 'files.title', 'borealis');
    await press('preview');
    await act(async () => { releaseApply(); });
    await screen.findByText(w('pending.body', { to: 'borealis' }));
    await act(async () => { releasePreview(); });
    await screen.findByRole('table', { name: w('files.label') });
    expect(screen.getByText(w('pending.body', { to: 'borealis' }))).toBeInTheDocument();
    expect(applies()).toHaveLength(1);
  });
});

describe('an unknown copy stays shown, once, whichever drawer is open', () => {
  const close = async (title: K) => {
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: w(title) })).toBeNull());
  };
  it('unknown sign-in copy, then the settings drawer: the sign-in copy is shown once', async () => {
    await loginToPending();
    await close('login.title');
    await press('files.open');
    await drawer('files.title');
    expect(screen.getAllByText(w('pending.body', { to: 'borealis' }))).toHaveLength(1);
    expect(applies()).toHaveLength(1);
  });
  it('unknown settings copy, then the sign-in drawer: the settings copy is shown once', async () => {
    await filesToPending();
    await close('files.title');
    await press('login.open');
    await drawer('login.title');
    expect(screen.getAllByText(w('pending.body', { to: 'borealis' }))).toHaveLength(1);
    expect(applies()).toHaveLength(1);
  });
});

describe('the account owns each copy and its toast, whatever is mounted', () => {
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  const leave = async () => { cleanup(); await settle(); };
  const close = async (title: K) => {
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: w(title) })).toBeNull());
    await settle();
  };
  const KINDS = [
    { kind: 'sign-in', open: openLogin, title: 'login.title' as K, ready: () => screen.findByText(w('login.absent', { to: 'borealis' })), again: () => screen.findByText(w('login.present', { to: 'borealis' })), copy: () => press('login.copy') },
    { kind: 'settings', open: openFiles, title: 'files.title' as K, ready: () => screen.findByRole('table', { name: w('files.label') }), again: () => screen.findByRole('table', { name: w('files.label') }), copy: () => press('files.copy_other', { count: 2 }) },
  ] as const;

  it.each(KINDS)('$kind: the page leaves while the apply is out; a definite answer after that closes the toast it left', async (k) => {
    let release!: () => void;
    await show({ gate: new Promise<void>((r) => { release = r; }) });
    await k.open('borealis');
    await press('preview');
    await k.ready();
    await k.copy();
    await leave();
    expect(openToasts()).toHaveLength(1);
    await act(async () => { release(); });
    await settle();
    expect(openToasts(), 'the definite answer retired the toast').toEqual([]);
    expect(applies()).toHaveLength(1);
  });

  it.each(KINDS)('$kind: unknown, the page leaves and comes back: the same copy shows once, a known read settles it, no toast stays', async (k) => {
    await show({ apply: 'lost' });
    await k.open('borealis');
    await press('preview');
    await k.ready();
    await k.copy();
    await screen.findByText(w('pending.body', { to: 'borealis' }));
    await leave();
    expect(openToasts()).toHaveLength(1);
    await mount();
    await settle();
    expect(openToasts(), 'shown inline again: the toast closes').toEqual([]);
    expect(screen.getAllByText(w('pending.body', { to: 'borealis' }))).toHaveLength(1);
    await k.open('borealis');
    await press('preview.again');
    await k.again();
    await waitFor(() => expect(screen.queryByText(w('pending.body', { to: 'borealis' }))).toBeNull());
    await close(k.title);
    await leave();
    expect(openToasts()).toEqual([]);
    expect(applies()).toHaveLength(1);
  });

  it.each(KINDS)('$kind: unknown, a realm switch (the outlet remounts), back: the copy survives once, its toast shows when the page leaves', async (k) => {
    await show({ apply: 'lost' });
    await k.open('borealis');
    await press('preview');
    await k.ready();
    await k.copy();
    await screen.findByText(w('pending.body', { to: 'borealis' }));
    await close(k.title);
    // The shell remounts the page on a realm switch (ContextOutlet), and the switch moves the core generation.
    await leave();
    await act(async () => { bump('switch'); });
    await mount();
    await settle();
    expect(screen.getAllByText(w('pending.body', { to: 'borealis' }))).toHaveLength(1);
    expect(openToasts()).toEqual([]);
    await act(async () => { bump('switch'); });
    await leave();
    expect(openToasts(), 'the page left after a realm switch: the copy still holds its toast').toHaveLength(1);
    expect(applies()).toHaveLength(1);
  });

  it('another account: the copies and their toasts go (their recovery is that account\'s)', async () => {
    await loginToPending();
    await close('login.title');
    await leave();
    expect(openToasts()).toHaveLength(1);
    const was = identity();
    try {
      await act(async () => { setIdentity({ id: 'someone-else', banned: false } as never); bump('account'); });
      expect(openToasts()).toEqual([]);
      await mount();
      await settle();
      expect(screen.queryByText(w('pending.body', { to: 'borealis' }))).toBeNull();
    } finally {
      setIdentity(was);
    }
    expect(applies()).toHaveLength(1);
  });

  // Attempts bind to their target: while a copy is unknown its target offers only Check again.
  it('settings: unknown; a preview of another file on that target plans, but Copy stays off (no resend over an unknown)', async () => {
    await filesToPending();
    await userEvent.click(screen.getByRole('radio', { name: w('what.path') }));
    await userEvent.type(pathBox(), 'notes.txt');
    await userEvent.keyboard('{Escape}');
    await press('preview.again');
    await screen.findByRole('table', { name: w('files.label') });
    expect(button('files.copy_one', { count: 1 })).toBeDisabled();
    await userEvent.click(button('files.copy_one', { count: 1 }));
    expect(applies()).toHaveLength(1);
  });

  it('sign-in: Check again on the unknown line reads the CAPTURED target, not the drawer\'s current To, and settles the copy', async () => {
    await loginToPending();
    await pickTo('granite');
    const before = previews().length;
    await userEvent.click(within(screen.getByText(w('pending.body', { to: 'borealis' })).closest('[role]') ?? document.body).getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(screen.queryByText(w('pending.body', { to: 'borealis' }))).toBeNull());
    const checks = previews().slice(before);
    expect(checks).toHaveLength(1);
    expect((checks[0]!.body as { target_computer?: string }).target_computer).toBe(BOREALIS().id);
    expect(applies()).toHaveLength(1);
  });

  it('settings: the page left, the toast\'s Check again reads the captured target, settles the copy and closes the toast', async () => {
    await filesToPending();
    await close('files.title');
    await leave();
    expect(openToasts()).toHaveLength(1);
    const shown = toasts[toasts.length - 1] as { action?: { label: string; onAction: () => void } };
    expect(shown.action?.label).toBe('Check again');
    await act(async () => { shown.action!.onAction(); });
    await settle();
    expect(openToasts()).toEqual([]);
    expect(applies()).toHaveLength(1);
  });
});

describe('the store owns each copy\'s whole lifecycle', () => {
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  const leave = async () => { cleanup(); await settle(); };
  const latest = () => toasts[toasts.length - 1] as { title: string; action?: { label: string; onAction: () => unknown } };
  const KINDS = [
    { kind: 'sign-in', open: openLogin, title: 'login.title' as K, ready: () => screen.findByText(w('login.absent', { to: 'borealis' })), again: () => screen.findByText(w('login.present', { to: 'borealis' })), copy: () => press('login.copy') },
    { kind: 'settings', open: openFiles, title: 'files.title' as K, ready: () => screen.findByRole('table', { name: w('files.label') }), again: () => screen.findByRole('table', { name: w('files.label') }), copy: () => press('files.copy_other', { count: 2 }) },
  ] as const;
  let notices: PendingNotice[] = [];
  let off: () => void = () => {};
  beforeEach(() => { notices = []; off = onPending((n) => notices.push(n)); });
  afterEach(() => { off(); });

  it.each(KINDS)('$kind: out, the page leaves, a realm switch, then a lost answer: one toast (the copy\'s, now with Check again), no notice of core\'s; its Check again settles and closes it', async (k) => {
    let release!: () => void;
    await show({ apply: 'lost', gate: new Promise<void>((r) => { release = r; }) });
    await k.open('borealis');
    await press('preview');
    await k.ready();
    await k.copy();
    await leave();
    expect(openToasts()).toHaveLength(1);
    expect(latest().action, 'out: nothing to check yet').toBeUndefined();
    await act(async () => { bump('switch'); });
    await act(async () => { release(); });
    await settle();
    expect(notices, 'the copy\'s own toast is its only notice').toEqual([]);
    expect(openToasts(), 'updated in place, never a second toast').toHaveLength(1);
    expect(latest().action?.label, 'unknown now: the toast offers Check again').toBe('Check again');
    await act(async () => { await latest().action!.onAction(); });
    await settle();
    expect(openToasts()).toEqual([]);
    expect(copyStore.get()).toEqual([]);
    expect(applies()).toHaveLength(1);
  });

  it.each(KINDS)('$kind: unknown, Preview again held, the page leaves before it answers: the answer still settles the copy and closes its toast', async (k) => {
    let release!: () => void;
    await show({ apply: 'lost', previewHold: new Promise<void>((r) => { release = r; }) });
    await k.open('borealis');
    await press('preview');
    await k.ready();
    await k.copy();
    await screen.findByText(w('pending.body', { to: 'borealis' }));
    await press('preview.again');
    await leave();
    expect(openToasts()).toHaveLength(1);
    await act(async () => { release(); });
    await settle();
    expect(copyStore.get(), 'the store settles, not the drawer').toEqual([]);
    expect(openToasts()).toEqual([]);
    expect(applies()).toHaveLength(1);
  });

  it.each(KINDS)('$kind: signing out (the shown account unchanged) drops the account\'s copies and toasts; a copy still out hands its notice back to the sign-out', async (k) => {
    let release!: () => void;
    await show({ apply: 'lost', gates: [Promise.resolve(), new Promise<void>((r) => { release = r; })] });
    await k.open('borealis');
    await press('preview');
    await k.ready();
    await k.copy();
    await screen.findByText(w('pending.body', { to: 'borealis' }));
    await pickTo('granite');
    await userEvent.click(screen.queryByRole('button', { name: w('preview') }) ?? button('preview.again'));
    await (k.kind === 'sign-in' ? screen.findByText(w('login.present', { to: 'granite' })) : screen.findByRole('table', { name: w('files.label') }));
    if (k.kind === 'sign-in') await userEvent.click(screen.getByRole('checkbox', { name: w('login.consent', { to: 'granite' }) }));
    await (k.kind === 'sign-in' ? press('login.copy') : press('files.copy_other', { count: 3 }));
    await leave();
    expect(openToasts()).toHaveLength(2);
    const out = copyStore.get().find((c) => c.state === 'out')!.ctx;
    expect(out.pendingShown, 'while it is the account\'s, the copy\'s toast is its notice').toBe(true);
    expect(openMutations()).toContain(out);
    const was = identity();
    try {
      await act(async () => { startLoggingOut(); bump('logout'); });
      expect(openToasts()).toEqual([]);
      expect(copyStore.get()).toEqual([]);
      expect(out.pendingShown, 'handed back to core').toBe(false);
      // As core's sign-out does next (lifecycle.ts logout): one notice per change still out.
      await act(async () => { for (const c of openMutations()) notifyPending(c, true); });
      expect(out.pendingShown).toBe(true);
      expect(notices, 'the copy still out is the sign-out\'s to name').toContainEqual(expect.objectContaining({ signingOut: true }));
      await act(async () => { release(); });
      await settle();
      expect(openToasts(), 'a late answer after the purge opens nothing').toEqual([]);
      expect(copyStore.get()).toEqual([]);
    } finally {
      resetCore();
      setIdentity(was);
    }
  });

  it('another account shown without a bump: the next section to attach drops the copies of the account captured at send', async () => {
    await loginToPending();
    await leave();
    expect(openToasts()).toHaveLength(1);
    const was = identity();
    try {
      setIdentity({ id: 'someone-else', banned: false } as never);
      await mount();
      await settle();
      expect(copyStore.get()).toEqual([]);
      expect(openToasts()).toEqual([]);
      expect(screen.queryByText(w('pending.body', { to: 'borealis' }))).toBeNull();
    } finally {
      setIdentity(was);
    }
  });

  it.each(KINDS)('$kind: two overlapping applies to one target: a check sent while the second was still out settles only the first', async (k) => {
    let releaseA!: () => void;
    let releaseB!: () => void;
    const check: { hold?: Promise<void>; release?: () => void } = {};
    const wd = seed();
    wd[GRANITE().id]!.files = { ...wd[ATLAS().id]!.files };
    await show({ world: wd, apply: 'unknown', gates: [new Promise<void>((r) => { releaseA = r; }), new Promise<void>((r) => { releaseB = r; })], previewHold: () => check.hold });
    await k.open('borealis');
    await press('preview');
    await k.ready();
    await k.copy();
    // The second apply, planned from another computer while the first is still out (Copy is held only over an unknown).
    await act(async () => { chooseComputer(GRANITE()); });
    await settle();
    if (!screen.queryByRole('dialog', { name: w(k.title) })) await press(k.kind === 'sign-in' ? 'login.open' : 'files.open');
    await screen.findByRole('dialog', { name: w(k.title) });
    await pickTo('borealis');
    await press('preview');
    await k.ready();
    await k.copy();
    expect(applies()).toHaveLength(2);
    const [, second] = copyStore.get().map((c) => c.id);
    await act(async () => { releaseA(); });
    await screen.findByText(w('pending.body', { to: 'borealis' }));
    check.hold = new Promise<void>((r) => { check.release = r; });
    await userEvent.click(within(screen.getByText(w('pending.body', { to: 'borealis' })).closest('[role]') ?? document.body).getByRole('button', { name: 'Check again' }));
    await act(async () => { releaseB(); });
    await waitFor(() => expect(screen.getAllByText(w('pending.body', { to: 'borealis' }))).toHaveLength(2));
    await act(async () => { check.release!(); });
    await settle();
    expect(screen.getAllByText(w('pending.body', { to: 'borealis' })), 'the second copy turned unknown after the check was sent').toHaveLength(1);
    expect(copyStore.get().map((c) => c.id)).toEqual([second]);
    expect(applies()).toHaveLength(2);
  });
});
