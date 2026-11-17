// The hook editor on a live page: the real core over a fake fetch and a scripted session manager (the harness of Hooks.test.tsx). The settings chat opens when
// the section is shown, the list is read on it, every change mints its own one-time permission and is sent once, a lost answer is
// held until a fresh read proves it, and a hook whose settings file is not known is read only with the reason.
// eslint-disable-next-line no-restricted-imports -- a router harness for the table's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { queryClient, useCurrentComputer, useRealms } from '@core';
import { boot, calls, onFetch, settle, type Reply } from '@core/test/env';
import type { LeaseHandle, LeaseManager, LeaseRef } from '@kit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HooksSection } from './Hooks';
import { PlaceBar, PlaceProvider } from './Place';
import { createSettingsSessions, setSettingsSessionsForTests, type SessionApi, type SettingsSessions } from './Session';
import strings from './Hooks.strings.en.json';
import kitStates from '@kit/states/strings.en.json';
import askStrings from './HookAsk.strings.en.json';
import es from './HookEdit.strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const FOLDER = '/home/ada/shop';
const U = '/home/ada/.hoody/settings.json';
const P = `${FOLDER}/.hoody/settings.json`;
const L = `${FOLDER}/.hoody/settings.local.json`;
type Hook = (c: { url: URL; method: string; body: Record<string, unknown> | null; headers: Record<string, string> }) => Reply | Promise<Reply> | undefined;
type Over = Partial<Record<'list' | 'begin' | 'toggle' | 'remove' | 'disable' | 'upsert' | 'test', Hook>>;
let over: Over = {};
/** The body of the held notice; its title ("This may have gone through") is a second element, so the words alone match twice. */
const HELD = /Outcome unknown: a hook change .* may have gone through/;
let seq = 0;

interface H { event: string; matcher?: string; command: string; source: string; disabled?: boolean; label?: string; description?: string; timeout?: number; when?: unknown }
let hooks: H[] = [];
let files: { scope: string; path: string; exists: boolean; sets_disable_all: boolean }[] = [];
let trust: Record<string, unknown> = { state: 'ok', hash: 'h1' };
let stale = false;

const u = (s: string) => new URL(s);
const pathOf = (c: { url: string }) => u(c.url).pathname.split('/agent')[1] ?? '';
const writes = () => calls.filter((c) => c.method !== 'GET' && pathOf(c).startsWith('/hooks') && !pathOf(c).endsWith('/begin-write') && !pathOf(c).endsWith('/hooks/test'));
const tests = () => calls.filter((c) => pathOf(c).endsWith('/hooks/test'));
const begins = () => calls.filter((c) => pathOf(c).endsWith('/hooks/begin-write'));
const flush = async () => { for (let i = 0; i < 20; i++) await act(async () => { await settle(); }); };

let created = 0;
let closed: string[] = [];
/** Whether the scripted agent lists call_when in GET /version. */
let callWhen = true;
function sessions(): SettingsSessions {
  const api: SessionApi = {
    status: async () => ({ connected: true, account_id: 'acct', auth_active: true, owner_fingerprint: 'fp', restriction: 'none' }),
    version: async () => ({ session_protocol_version: 3, capabilities: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding', ...(callWhen ? ['call_when'] : [])].map((name) => ({ name, supported: true, available: true })) }),
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

let mgr: SettingsSessions;
beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  over = {};
  seq = 0;
  created = 0;
  closed = [];
  callWhen = true;
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
    if (p.endsWith('/hooks/begin-write')) return hit('begin', () => ({ status: 200, body: { status: 'ok', nonce: `nonce-${++seq}`, op: c.body?.op, scope: c.body?.scope } }));
    if (p.endsWith('/hooks/toggle')) {
      return hit('toggle', () => {
        const b = c.body!;
        hooks = hooks.map((h) => (h.event === b.event && (h.matcher ?? '') === (b.matcher ?? '') && h.command === b.command ? { ...h, disabled: b.disabled === true } : h));
        return { status: 200, body: { status: 'ok' } };
      });
    }
    if (p.endsWith('/hooks/disable-all')) {
      return hit('disable', () => {
        files = files.map((f) => (f.scope === c.body?.scope ? { ...f, sets_disable_all: c.body?.value === true } : f));
        return { status: 200, body: { status: 'ok' } };
      });
    }
    if (p.endsWith('/hooks/test')) {
      return hit('test', () => ({ status: 200, body: { status: 'ok', rows: [{ command: c.body?.command, exit_code: 0, stdout: 'hello\n', stderr: '', timed_out: false, duration_ms: 12 }], warnings: [] } }));
    }
    if (p.endsWith('/hooks') && c.method === 'PUT') {
      return hit('upsert', () => {
        const b = c.body!;
        const same = (h: H) => h.event === b.event && (h.matcher ?? '') === ((b.matcher as string | undefined) ?? '') && h.command === b.command;
        const at = hooks.find(same);
        if (at) {
          // As the agent: an absent `when` keeps the stored condition, a sent one replaces it.
          hooks = hooks.map((h) => (same(h) ? { ...h, ...(b.name !== undefined ? { label: b.name as string } : {}), ...(b.when !== undefined ? { when: b.when } : {}), timeout: b.timeout as number } : h));
          return { status: 200, body: { status: 'ok' } };
        }
        if (!b.name || !b.description) return { status: 400, body: { error: 'x', code: 'bad_request' } };
        const src = b.scope === 'project' ? P : b.scope === 'local' ? L : U;
        hooks = [...hooks, { event: b.event as string, ...(b.matcher ? { matcher: b.matcher as string } : {}), command: b.command as string, source: src, label: b.name as string, ...(b.when !== undefined ? { when: b.when } : {}) }];
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

const label = (k: string) => new RegExp('^' + (es as Record<string, string>)[k]!.replace(/[()]/g, '\\$&'));
const box = (dlg: HTMLElement, k: string) => within(dlg).getByRole('textbox', { name: label(k) }) as HTMLInputElement;
const setBox = async (dlg: HTMLElement, k: string, v: string) => {
  const el = box(dlg, k);
  await userEvent.clear(el);
  if (v !== '') await userEvent.type(el, v);
};
const edit = async (text: string) => {
  await rowMenu(text, es['row.edit'].replace('…', ''));
  return screen.findByRole('dialog');
};
const press = async (dlg: HTMLElement, name: string) => {
  await userEvent.click(within(dlg).getByRole('button', { name }));
  await flush();
};
const stopTracking2 = async () => {
  await userEvent.click(screen.getByRole('button', { name: kitStates['err.stopTracking'] }));
  await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['stop.confirm'] }));
  await flush();
};
const ops = () => begins().map((c) => (c.body as { op: string }).op);
const HELD_ADD = /Outcome unknown: a hook change \(add or change\) may have gone through/;
const HELD_DEL = /Outcome unknown: a hook change \(delete\) may have gone through/;

describe('hook editor: editing in place', () => {
  it('a label change is ONE upsert, one nonce of op upsert, the timeout always sent, and no delete', async () => {
    hooks = [{ event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', source: U, label: 'Guard shell' }];
    await show();
    const dlg = await edit('Guard shell');
    expect(box(dlg, 'field.command').value).toBe('./guard.sh');
    // forms-required: an edit in place needs its command only; the name and description may stay as they are.
    expect(box(dlg, 'field.command')).toBeRequired();
    expect(box(dlg, 'field.name')).not.toBeRequired();
    expect(box(dlg, 'field.description')).not.toBeRequired();
    await setBox(dlg, 'field.name', 'Guard the shell');
    await press(dlg, es['save.update']);
    expect(ops()).toEqual(['upsert']);
    expect(writes()).toHaveLength(1);
    expect(writes()[0]!.method).toBe('PUT');
    expect(writes()[0]!.body).toEqual({ session_id: 's1', nonce: 'nonce-1', scope: 'user', event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', timeout: 0, name: 'Guard the shell' });
  });
  it('the stored timeout is sent again unchanged', async () => {
    hooks = [{ event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', source: U, label: 'Guard shell', timeout: 20 }];
    await show();
    const dlg = await edit('Guard shell');
    expect(box(dlg, 'field.timeout').value).toBe('20');
    await setBox(dlg, 'field.name', 'Guard the shell');
    await press(dlg, es['save.update']);
    expect(writes()[0]!.body).toMatchObject({ timeout: 20 });
  });
});

describe('hook editor: adding a hook', () => {
  const add = async () => {
    await userEvent.click(await screen.findByRole('button', { name: es['toolbar.add'] }));
    // Add asks how first; by hand is the hook editor.
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${askStrings['how.self']}`) }));
    return screen.findByRole('dialog');
  };
  it('ONE upsert with name, description and the timeout, on a nonce of op upsert for the file', async () => {
    await show();
    await screen.findByText('Guard shell');
    const dlg = await add();
    await setBox(dlg, 'field.command', './fmt.sh');
    await setBox(dlg, 'field.name', 'Format');
    await setBox(dlg, 'field.description', 'Formats files after an edit');
    await setBox(dlg, 'field.timeout', '30');
    await press(dlg, es['save.create']);
    expect(ops()).toEqual(['upsert']);
    expect(begins()[0]!.body).toMatchObject({ session_id: 's1', op: 'upsert', scope: 'user' });
    expect(writes()).toHaveLength(1);
    expect(writes()[0]!.body).toEqual({ session_id: 's1', nonce: 'nonce-1', scope: 'user', event: 'PreToolUse', command: './fmt.sh', timeout: 30, name: 'Format', description: 'Formats files after an edit' });
    expect(await screen.findByText(es['title.done'])).toBeInTheDocument();
  });
  it('nothing is minted or sent while a field is wrong; the problem is named', async () => {
    await show();
    await screen.findByText('Guard shell');
    const dlg = await add();
    // forms-required: before anything is typed, the three fields a new hook needs are marked as needed; the others are not.
    for (const k of ['field.command', 'field.name', 'field.description']) expect(box(dlg, k), k).toBeRequired();
    for (const k of ['field.matcher', 'field.timeout']) expect(box(dlg, k), k).not.toBeRequired();
    await setBox(dlg, 'field.command', './fmt.sh');
    expect(within(dlg).getAllByText(es['problem.name_missing']).length).toBeGreaterThan(0);
    expect(within(dlg).getByRole('button', { name: es['save.create'] })).toHaveAttribute('aria-disabled', 'true');
    expect(within(dlg).getByRole('button', { name: es['save.create'] })).toHaveAccessibleDescription(es['save.need']);
    expect(begins()).toHaveLength(0);
    expect(writes()).toHaveLength(0);
  });
  it('a command and tool that another hook of the file already has is refused before anything is minted', async () => {
    await show();
    await screen.findByText('Guard shell');
    const dlg = await add();
    await setBox(dlg, 'field.matcher', 'Bash');
    await setBox(dlg, 'field.command', './guard.sh');
    await setBox(dlg, 'field.name', 'Again');
    await setBox(dlg, 'field.description', 'Again');
    expect(within(dlg).getByText(es['refuse.collision'])).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: es['save.create'] })).toBeDisabled();
    expect(begins()).toHaveLength(0);
  });
});

async function replace(dlg: HTMLElement, command: string) {
  await setBox(dlg, 'field.command', command);
  await press(dlg, es['save.replace']);
}

describe('hook editor: replacing a hook: add the new one, then remove the old one', () => {
  beforeEach(() => { hooks = [{ event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', source: U, label: 'Guard shell', description: 'Checks shell commands' }]; });
  it('upsert first, delete second, two nonces (upsert then delete), the delete naming the OLD hook exactly; both steps reported', async () => {
    await show();
    const dlg = await edit('Guard shell');
    await replace(dlg, './guard2.sh');
    expect(ops()).toEqual(['upsert', 'delete']);
    const w = writes();
    expect(w.map((c) => c.method)).toEqual(['PUT', 'DELETE']);
    expect(w[0]!.body).toMatchObject({ nonce: 'nonce-1', command: './guard2.sh', name: 'Guard shell', description: 'Checks shell commands' });
    expect(w[1]!.body).toEqual({ session_id: 's1', nonce: 'nonce-2', scope: 'user', event: 'PreToolUse', matcher: 'Bash', command: './guard.sh' });
    expect(await screen.findByText(es['ran.replaced'])).toBeInTheDocument();
    expect(screen.getByText('1. Add the new hook: done')).toBeInTheDocument();
    expect(screen.getByText('2. Remove the old hook: done')).toBeInTheDocument();
    expect(hooks.map((h) => h.command)).toEqual(['./guard2.sh']);
  });
  it('step 1 refused: nothing is held, the delete is never minted or sent', async () => {
    over.upsert = () => ({ status: 400, body: { error: 'x', code: 'bad_request' } });
    await show();
    const dlg = await edit('Guard shell');
    await replace(dlg, './guard2.sh');
    expect(ops()).toEqual(['upsert']);
    expect(writes()).toHaveLength(1);
    expect(screen.getByText('2. Remove the old hook: not started')).toBeInTheDocument();
    expect(screen.queryByText(HELD_ADD)).toBeNull();
  });
  it('step 1 whose nonce could not be minted sends nothing at all', async () => {
    over.begin = () => ({ status: 503, body: { error: 'x', code: 'unavailable' } });
    await show();
    const dlg = await edit('Guard shell');
    await replace(dlg, './guard2.sh');
    expect(writes()).toHaveLength(0);
    expect(begins()).toHaveLength(1);
    expect(screen.getByText('1. Add the new hook: not sent')).toBeInTheDocument();
  });
  it('a lost answer to the add is HELD: the delete is not minted or sent, nothing is resent, and only Stop tracking ends it', async () => {
    over.upsert = () => ({ status: 0, network: true });
    await show();
    const dlg = await edit('Guard shell');
    await replace(dlg, './guard2.sh');
    expect(screen.getByText('1. Add the new hook: outcome unknown')).toBeInTheDocument();
    // The delete is never attempted, not merely refused by the lock.
    expect(screen.getByText(new RegExp(`^2\\. .*: ${es['state.skipped']}$`))).toBeInTheDocument();
    expect(screen.getByText(es['ran.unknownAdd'])).toBeInTheDocument();
    expect(ops()).toEqual(['upsert']);
    expect(writes()).toHaveLength(1);
    await userEvent.click(within(dlg).getByRole('button', { name: es.close }));
    await flush();
    expect(await screen.findByText(HELD_ADD)).toBeInTheDocument();
    // The held add holds the whole file: the toggle and the delete of every hook wait too (one lock per file).
    await userEvent.click(row(await screen.findByText('Guard shell')).querySelector('[data-row-menu] button') as HTMLElement);
    expect(await screen.findByRole('menuitem', { name: new RegExp(strings.turnOff) })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await flush();
    expect(screen.getByText(HELD_ADD)).toBeInTheDocument();
    await stopTracking2();
    expect(screen.queryByText(HELD_ADD)).toBeNull();
    expect(writes()).toHaveLength(1);
    expect(begins()).toHaveLength(1);
  });
  it('the held add is the file\'s hold after leaving and coming back: the toggle still waits, nothing is sent', async () => {
    over.upsert = () => ({ status: 0, network: true });
    await show();
    const dlg = await edit('Guard shell');
    await replace(dlg, './guard2.sh');
    await userEvent.click(within(dlg).getByRole('button', { name: es.close }));
    await flush();
    cleanup();
    await flush();
    await show();
    await userEvent.click(row(await screen.findByText('Guard shell')).querySelector('[data-row-menu] button') as HTMLElement);
    expect(await screen.findByRole('menuitem', { name: new RegExp(strings.turnOff) })).toHaveAttribute('aria-disabled', 'true');
    expect(writes()).toHaveLength(1);
  });
  it('the add went through and the delete was refused: "the old one is still there", and ONE explicit button sends a fresh delete once', async () => {
    let first = true;
    over.remove = () => { if (first) { first = false; return { status: 400, body: { error: 'x', code: 'bad_request' } }; } return undefined; };
    await show();
    const dlg = await edit('Guard shell');
    await replace(dlg, './guard2.sh');
    expect(screen.getByText(es['ran.oldStays'])).toBeInTheDocument();
    expect(screen.getByText('2. Remove the old hook: refused, nothing changed')).toBeInTheDocument();
    expect(writes().map((c) => c.method)).toEqual(['PUT', 'DELETE']);
    await press(dlg, es.removeOld);
    expect(ops()).toEqual(['upsert', 'delete', 'delete']);
    expect(writes()).toHaveLength(3);
    expect(writes()[2]!.body).toMatchObject({ nonce: 'nonce-3', command: './guard.sh' });
    expect(await screen.findByText(es['ran.replaced'])).toBeInTheDocument();
  });
  it('a lost answer to the delete is HELD as "outcome unknown", not resent, no done', async () => {
    over.remove = () => ({ status: 0, network: true });
    await show();
    const dlg = await edit('Guard shell');
    await replace(dlg, './guard2.sh');
    expect(screen.getByText(es['ran.unknownRemove'])).toBeInTheDocument();
    expect(screen.getByText('1. Add the new hook: done')).toBeInTheDocument();
    expect(screen.getByText('2. Remove the old hook: outcome unknown')).toBeInTheDocument();
    expect(screen.queryByText(es['ran.replaced'])).toBeNull();
    expect(writes().map((c) => c.method)).toEqual(['PUT', 'DELETE']);
    await userEvent.click(within(dlg).getByRole('button', { name: es.close }));
    await flush();
    expect(await screen.findByText(HELD_DEL)).toBeInTheDocument();
  });
  it('a draft the agent may take for another hook is refused before anything is minted', async () => {
    hooks = [...hooks, { event: 'PreToolUse', matcher: 'Edit', command: './guard.sh', source: U, label: 'Edit guard' }];
    await show();
    const dlg = await edit('Guard shell');
    await setBox(dlg, 'field.matcher', 'Edit');
    expect(within(dlg).getByText(es['refuse.collision'])).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: es['save.replace'] })).toBeDisabled();
    await setBox(dlg, 'field.matcher', 'bash');
    expect(within(dlg).getByText(es['refuse.ambiguous'])).toBeInTheDocument();
    expect(begins()).toHaveLength(0);
    expect(writes()).toHaveLength(0);
  });
  it('replacing the identity of a hook that is OFF is refused with its reason; saving its label is not', async () => {
    hooks = [{ event: 'Stop', command: 'notify-send done', source: U, disabled: true, label: 'Notify' }];
    await show();
    const dlg = await edit('Notify');
    await setBox(dlg, 'field.command', 'notify-send finished');
    expect(within(dlg).getByText(es['refuse.off'])).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: es['save.replace'] })).toBeDisabled();
    await setBox(dlg, 'field.command', 'notify-send done');
    await setBox(dlg, 'field.name', 'Notify me');
    await press(dlg, es['save.update']);
    expect(ops()).toEqual(['upsert']);
  });
  it('a held change disables Edit and Add, like the toggle and the delete', async () => {
    over.toggle = () => ({ status: 0, network: true });
    await show();
    await rowMenu('Guard shell', strings.turnOff);
    await screen.findByText(HELD);
    expect(screen.getByRole('button', { name: es['toolbar.add'] })).toBeDisabled();
    await userEvent.click(row(await screen.findByText('Guard shell')).querySelector('[data-row-menu] button') as HTMLElement);
    expect(await screen.findByRole('menuitem', { name: new RegExp(es['row.edit'].replace('…', '')) })).toHaveAttribute('aria-disabled', 'true');
  });
  it('a settings chat lost between the steps is honest: step 2 is not sent, never "done"', async () => {
    let n = 0;
    over.begin = () => { n++; return n === 2 ? { status: 503, body: { error: 'x', code: 'unavailable' } } : undefined; };
    await show();
    const dlg = await edit('Guard shell');
    await replace(dlg, './guard2.sh');
    expect(screen.getByText('1. Add the new hook: done')).toBeInTheDocument();
    expect(screen.getByText('2. Remove the old hook: not sent')).toBeInTheDocument();
    expect(screen.getByText(es['ran.oldStays'])).toBeInTheDocument();
    expect(writes()).toHaveLength(1);
  });
});

describe('hook editor: testing a command', () => {
  it('a confirm names the command and the computer; nothing runs before it; one POST with the draft command and no nonce', async () => {
    await show();
    const dlg = await edit('Guard shell');
    await setBox(dlg, 'field.command', 'echo draft');
    await userEvent.click(within(dlg).getByRole('button', { name: es.test }));
    const ask = await screen.findByRole('alertdialog');
    expect(within(ask).getByText(es['test.runs'].replace('{{command}}', 'echo draft').replace('{{computer}}', 'atlas'))).toBeInTheDocument();
    expect(tests()).toHaveLength(0);
    await userEvent.click(within(ask).getByRole('button', { name: es['test.confirm'] }));
    await flush();
    expect(tests()).toHaveLength(1);
    expect(tests()[0]!.method).toBe('POST');
    expect(tests()[0]!.body).toEqual({ session_id: 's1', event: 'PreToolUse', command: 'echo draft' });
    expect(begins()).toHaveLength(0);
    expect(writes()).toHaveLength(0);
    expect(await screen.findByDisplayValue(/hello/)).toBeInTheDocument();
  });
  it('cancelling the confirm runs nothing', async () => {
    await show();
    const dlg = await edit('Guard shell');
    await userEvent.click(within(dlg).getByRole('button', { name: es.test }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /Cancel/ }));
    await flush();
    expect(tests()).toHaveLength(0);
  });
  it('a refusal under Strict is said in the typed words, once', async () => {
    over.test = () => ({ status: 409, body: { error: 'x', code: 'approval_policy_unsatisfiable' } });
    await show();
    const dlg = await edit('Guard shell');
    await userEvent.click(within(dlg).getByRole('button', { name: es.test }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: es['test.confirm'] }));
    await flush();
    expect(await screen.findByText(es['test.refused.approval_policy_unsatisfiable'])).toBeInTheDocument();
    expect(tests()).toHaveLength(1);
  });
  it('a lost answer to a test says the command may have run, and is not resent', async () => {
    over.test = () => ({ status: 0, network: true });
    await show();
    const dlg = await edit('Guard shell');
    await userEvent.click(within(dlg).getByRole('button', { name: es.test }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: es['test.confirm'] }));
    await flush();
    expect(await screen.findByText(es['test.unknown'])).toBeInTheDocument();
    expect(tests()).toHaveLength(1);
  });
});

describe('hook editor: no raw words', () => {
  it('a refusal shows the typed sentence, never the body the agent sent', async () => {
    over.upsert = () => ({ status: 400, body: { error: 'RAW-AGENT-TEXT-xyz', code: 'bad_request' } });
    hooks = [{ event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', source: U, label: 'Guard shell', description: 'Checks shell commands' }];
    await show();
    const dlg = await edit('Guard shell');
    await replace(dlg, './guard2.sh');
    expect(screen.queryByText(/RAW-AGENT-TEXT-xyz/)).toBeNull();
    expect(within(dlg).getAllByText(es['refused.bad_request']).length).toBeGreaterThan(0);
  });
});

describe('hook editor: holds, refusals and stale answers', () => {
  beforeEach(() => { hooks = [{ event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', source: U, label: 'Guard shell', description: 'Checks shell commands' }]; });
  it('a hook the agent could take for the old one, added before Remove, refuses the delete; nothing is minted or sent', async () => {
    let first = true;
    over.remove = () => { if (first) { first = false; return { status: 400, body: { error: 'x', code: 'bad_request' } }; } return undefined; };
    await show();
    const dlg = await edit('Guard shell');
    await replace(dlg, './guard2.sh');
    expect(screen.getByText(es['ran.oldStays'])).toBeInTheDocument();
    hooks = [...hooks, { event: 'PreToolUse', matcher: 'bash', command: './guard.sh', source: U, label: 'Twin guard' }];
    await press(dlg, es.removeOld);
    expect(await within(dlg).findByText(es['remove.twin'])).toBeInTheDocument();
    expect(ops()).toEqual(['upsert', 'delete']);
    expect(writes()).toHaveLength(2);
    expect(hooks.some((h) => h.label === 'Twin guard')).toBe(true);
  });
  it('the old hook gone from the fresh list sends nothing and says so', async () => {
    let first = true;
    over.remove = () => { if (first) { first = false; return { status: 400, body: { error: 'x', code: 'bad_request' } }; } return undefined; };
    await show();
    const dlg = await edit('Guard shell');
    await replace(dlg, './guard2.sh');
    hooks = hooks.filter((h) => h.command !== './guard.sh');
    await press(dlg, es.removeOld);
    expect(await within(dlg).findByText(es['remove.gone'])).toBeInTheDocument();
    expect(ops()).toEqual(['upsert', 'delete']);
    expect(writes()).toHaveLength(2);
  });
  it('a fresh list that cannot be read sends nothing (the page shows the failed read)', async () => {
    let first = true;
    over.remove = () => { if (first) { first = false; return { status: 400, body: { error: 'x', code: 'bad_request' } }; } return undefined; };
    await show();
    const dlg = await edit('Guard shell');
    await replace(dlg, './guard2.sh');
    over.list = () => ({ status: 500, body: { error: 'x', code: 'internal' } });
    await press(dlg, es.removeOld);
    expect(await screen.findByText(strings.loadFailed)).toBeInTheDocument();
    expect(ops()).toEqual(['upsert', 'delete']);
    expect(writes()).toHaveLength(2);
  });
  it('a fresh read cancelled while the cached list is there authorizes nothing: no mint, no delete, "not sent"', async () => {
    let first = true;
    over.remove = () => { if (first) { first = false; return { status: 400, body: { error: 'x', code: 'bad_request' } }; } return undefined; };
    await show();
    const dlg = await edit('Guard shell');
    await replace(dlg, './guard2.sh');
    expect(screen.getByText(es['ran.oldStays'])).toBeInTheDocument();
    // The cached list has no twin; the agent's list now has one. The read for this press never answers: it is cancelled.
    hooks = [...hooks, { event: 'PreToolUse', matcher: 'bash', command: './guard.sh', source: U, label: 'Twin guard' }];
    over.list = () => new Promise<Reply>(() => undefined);
    await press(dlg, es.removeOld);
    await act(async () => { await queryClient.cancelQueries(); });
    await flush();
    expect(await within(dlg).findByText(es['remove.unread'])).toBeInTheDocument();
    expect(ops()).toEqual(['upsert', 'delete']);
    expect(writes()).toHaveLength(2);
    expect(hooks.some((h) => h.label === 'Twin guard')).toBe(true);
  });
  it('the settings chat lost (404) between the steps: no new chat carries on, step 2 is not sent and never done', async () => {
    let n = 0;
    over.begin = () => { n++; return n === 2 ? { status: 404, body: { error: 'x', code: 'not_found' } } : undefined; };
    await show();
    const dlg = await edit('Guard shell');
    await replace(dlg, './guard2.sh');
    expect(screen.getByText('1. Add the new hook: done')).toBeInTheDocument();
    expect(screen.getByText('2. Remove the old hook: not sent')).toBeInTheDocument();
    expect(screen.getByText(es['ran.oldStays'])).toBeInTheDocument();
    expect(writes().map((c) => c.method)).toEqual(['PUT']);
    // Nothing is minted on the chat opened in its place: the only delete nonce asked for is the one the lost chat refused.
    expect(begins().map((c) => [(c.body as { op: string }).op, (c.body as { session_id: string }).session_id])).toEqual([['upsert', 's1'], ['delete', 's1']]);
    expect(hooks.some((h) => h.command === './guard.sh')).toBe(true);
  });
  it('the same with 410 gone: zero begin-write on the replacement chat, step 2 not sent', async () => {
    let n = 0;
    over.begin = () => { n++; return n === 2 ? { status: 410, body: { error: 'x', code: 'gone' } } : undefined; };
    await show();
    const dlg = await edit('Guard shell');
    await replace(dlg, './guard2.sh');
    expect(screen.getByText('2. Remove the old hook: not sent')).toBeInTheDocument();
    expect(begins().map((c) => (c.body as { session_id: string }).session_id)).toEqual(['s1', 's1']);
    expect(writes().map((c) => c.method)).toEqual(['PUT']);
  });
  it('a test answer whose fields have the wrong types reads as unknown, never as a clean run', async () => {
    over.test = () => ({ status: 200, body: { status: 'ok', rows: [{ exit_code: 0, timed_out: 'true', stdout: 42, stderr: null, duration_ms: 'slow' }] } });
    await show();
    const dlg = await edit('Guard shell');
    await userEvent.click(within(dlg).getByRole('button', { name: es.test }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: es['test.confirm'] }));
    await flush();
    expect(await within(dlg).findByText(es['test.unknown'])).toBeInTheDocument();
    expect(within(dlg).queryByText(/^Exit code/)).toBeNull();
    expect(tests()).toHaveLength(1);
  });
  it('the test confirm says the command can change files', async () => {
    await show();
    const dlg = await edit('Guard shell');
    await userEvent.click(within(dlg).getByRole('button', { name: es.test }));
    expect(within(await screen.findByRole('alertdialog')).getByText('It can change files. Nothing is saved.')).toBeInTheDocument();
  });
  it('the list read again with another hook in front keeps the open edit working', async () => {
    await show();
    const dlg = await edit('Guard shell');
    hooks = [{ event: 'PostToolUse', command: './after.sh', source: U, label: 'After' }, ...hooks];
    await act(async () => { await queryClient.refetchQueries(); });
    await flush();
    expect(await screen.findByText('After')).toBeInTheDocument();
    await setBox(dlg, 'field.name', 'Guard shell 2');
    await press(dlg, es['save.update']);
    expect(ops()).toEqual(['upsert']);
    expect(writes()[0]!.body).toMatchObject({ command: './guard.sh', name: 'Guard shell 2' });
  });
});

// The condition line spelled out here, not read from the strings file, so a run on the old code fails on the behaviour itself.
const whenLine = (atoms: string): string => `Runs only when: ${atoms}`;
// A Stop or SubagentStop hook may carry `when` (call_when). An update in place sends no `when` (the agent keeps the stored one);
// the add of a replace carries the old hook's condition, and only to an agent that lists call_when.
describe('hook conditions (call_when)', () => {
  const W = ['+edit_file|write_file', '-bash(command=\\bgo test\\b):success'];
  const line = whenLine(W.join(', '));
  beforeEach(() => { hooks = [{ event: 'Stop', command: './check.sh', source: U, label: 'Check tests', description: 'Checks the tests ran', when: W }]; });
  it('shows the condition on one read-only line', async () => {
    await show();
    expect(await screen.findByText(line)).toBeInTheDocument();
  });
  it('an update in place sends no when key, and the agent keeps the stored condition', async () => {
    await show();
    const dlg = await edit('Check tests');
    await setBox(dlg, 'field.name', 'Check the tests');
    await press(dlg, es['save.update']);
    expect(writes()).toHaveLength(1);
    expect('when' in writes()[0]!.body!).toBe(false);
    expect(hooks[0]!.when).toEqual(W);
    expect(await screen.findByText(line)).toBeInTheDocument();
  });
  it('a replace carries the old hook\'s condition into the new hook, verbatim', async () => {
    await show();
    const dlg = await edit('Check tests');
    await replace(dlg, './check2.sh');
    expect(ops()).toEqual(['upsert', 'delete']);
    expect(writes()[0]!.body).toMatchObject({ command: './check2.sh', when: W });
    expect(hooks).toEqual([expect.objectContaining({ command: './check2.sh', when: W })]);
  });
  it('an agent that does not list call_when gets nothing for a replace: no permission, no add, no delete', async () => {
    callWhen = false;
    await show();
    const dlg = await edit('Check tests');
    await replace(dlg, './check2.sh');
    expect(begins()).toHaveLength(0);
    expect(writes()).toHaveLength(0);
    expect(await screen.findByText(es['notsent.CAPABILITY_MISSING'])).toBeInTheDocument();
    expect(hooks[0]!.command).toBe('./check.sh');
  });
});

describe('a hidden character in a hook\'s name or description is dropped by the editor, so a save writes clean text', () => {
  it('opening and saving sends the name and description without them; the identity is unchanged (one upsert, no delete)', async () => {
    const RAW = String.fromCodePoint(0x200b);
    hooks = [{ event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', source: U, label: `Guard${RAW}shell`, description: `Checks${String.fromCodePoint(0x202e)} shell commands` }];
    await show();
    const dlg = await edit('Guard⟨U+200B⟩shell');
    expect(box(dlg, 'field.name').value).toBe('Guardshell');
    expect(within(dlg).getByText(es['field.name.stripped'])).toBeInTheDocument();
    expect(within(dlg).getByText(es['field.description.stripped'])).toBeInTheDocument();
    await press(dlg, es['save.update']);
    expect(ops()).toEqual(['upsert']);
    expect(writes()).toHaveLength(1);
    expect(writes()[0]!.body).toEqual({ session_id: 's1', nonce: 'nonce-1', scope: 'user', event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', timeout: 0, name: 'Guardshell', description: 'Checks shell commands' });
  });
});


describe('what the person types or pastes into a name or description is shown marked, and a direction-turning one is refused', () => {
  const cp = (...c: number[]) => String.fromCodePoint(...c);
  const RLO = cp(0x202e);
  const paste = async (dlg: HTMLElement, k: string, v: string) => {
    const el = box(dlg, k);
    await userEvent.clear(el);
    await userEvent.click(el);
    await userEvent.paste(v);
  };
  it('a pasted name with an override is shown marked under its field, refused with its reason, and saved only once removed', async () => {
    hooks = [{ event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', source: U, label: 'Guard shell', description: 'Checks shell commands' }];
    await show();
    const dlg = await edit('Guard shell');
    expect(box(dlg, 'field.name')).not.toHaveAccessibleDescription(/hidden characters/i);
    await paste(dlg, 'field.name', `Guard${RLO}llehs`);
    const name = box(dlg, 'field.name');
    expect(name.value).toBe(`Guard${RLO}llehs`);
    expect(name).toHaveAccessibleDescription(new RegExp(`${es['field.shownAs'].replace('{{text}}', 'Guard⟨U\\+202E⟩llehs')}`));
    expect(within(dlg).getByText(es['problem.name_bidi'])).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: es['save.update'] })).toHaveAttribute('aria-disabled', 'true');
    expect(begins()).toHaveLength(0);
    await setBox(dlg, 'field.name', 'Guard shell 2');
    expect(within(dlg).queryByText(es['problem.name_bidi'])).toBeNull();
    expect(box(dlg, 'field.name')).not.toHaveAccessibleDescription(/hidden characters/i);
    await press(dlg, es['save.update']);
    expect(writes()).toHaveLength(1);
    expect(writes()[0]!.body).toMatchObject({ name: 'Guard shell 2' });
  });
  it('a pasted description with an isolate is refused the same way; a pasted ZWJ emoji name is shown marked and saved as pasted', async () => {
    const emoji = `Deploy ${cp(0x1f9d1, 0x200d, 0x1f4bb)}`;
    hooks = [{ event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', source: U, label: 'Deploy', description: 'Checks shell commands' }];
    await show();
    const dlg = await edit('Deploy');
    await paste(dlg, 'field.name', emoji);
    await paste(dlg, 'field.description', `Checks ${cp(0x2067)}shell${cp(0x2069)}`);
    // drawn under the field AND its accessible description, though it appears after the field mounted and the field stays valid
    // (the kit's TextField links a description that arrives late)
    const zwj = es['field.shownAs'].replace('{{text}}', `Deploy ${cp(0x1f9d1)}⟨U+200D⟩${cp(0x1f4bb)}`);
    expect(within(dlg).getByText(zwj)).toBeInTheDocument();
    expect(box(dlg, 'field.name')).toHaveAccessibleDescription(zwj);
    expect(box(dlg, 'field.description')).toHaveAccessibleDescription(new RegExp(es['field.shownAs'].replace('{{text}}', 'Checks ⟨U\\+2067⟩shell⟨U\\+2069⟩')));
    expect(within(dlg).getByText(es['problem.desc_bidi'])).toBeInTheDocument();
    expect(within(dlg).queryByText(es['problem.name_bidi'])).toBeNull();
    expect(within(dlg).getByRole('button', { name: es['save.update'] })).toHaveAttribute('aria-disabled', 'true');
    await setBox(dlg, 'field.description', 'Checks shell commands');
    await press(dlg, es['save.update']);
    expect(writes()).toHaveLength(1);
    expect(writes()[0]!.body).toMatchObject({ name: emoji, description: 'Checks shell commands' });
  });
  it('a saved hidden name opens stripped with its note; pasting one back shows the marked preview in its place', async () => {
    hooks = [{ event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', source: U, label: `Guard${cp(0x200b)}shell`, description: 'Checks shell commands' }];
    await show();
    const dlg = await edit('Guard⟨U+200B⟩shell');
    expect(box(dlg, 'field.name')).toHaveAccessibleDescription(es['field.name.stripped']);
    await paste(dlg, 'field.name', `Guard${cp(0x200b)}shell`);
    expect(box(dlg, 'field.name')).toHaveAccessibleDescription(es['field.shownAs'].replace('{{text}}', 'Guard⟨U+200B⟩shell'));
  });
});
