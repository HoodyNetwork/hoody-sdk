// Memory administration on a live page: the real core over a fake fetch. Tidy-up and erase are typed with the project's
// name; each mints its own one-time intent when pressed and is sent once; a lost answer is held as unknown until a fresh read
// proves it (never resent, never failed); a refused or lost mint sent no write. Flush is repeatable. The band's host action
// shows whenever the agent says this computer can serve a realm no host serves (electing, unavailable or stuck), always
// names the realm, and says it moves no data.
// eslint-disable-next-line no-restricted-imports -- a router harness for the view's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { queryClient, refreshFresh, sourceReads } from '@core';
import { boot, calls, onFetch, settle, type Reply } from '@core/test/env';
import { interpolate } from '@kit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { holdOfLock, pendingOf, settleChange } from '@core/changes';
import MemoryView, { realmWord } from './Memory';
import { ADMIN_SOURCE, MEMORY_CONSOLIDATE_LOCK, MEMORY_ERASE_LOCK, useErase } from './admin';
import { useMemoryAt } from './data';
import strings from './Admin.strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const P = 'proj_shop';
type Hook = (c: { url: URL; method: string; body: unknown }) => Reply | Promise<Reply> | undefined;
type Over = Partial<Record<'host' | 'status' | 'projects' | 'intent' | 'consolidate' | 'erase' | 'flush' | 'assign', Hook>>;
let over: Over = {};
let host: Record<string, unknown> = {};
let status: Record<string, unknown> = {};
let listed = true;
let seq = 0;

// An account route's address is relative (/api/v1/…, the computer list under All realms), an agent's is absolute: both read against a base.
const u = (s: string) => new URL(s, 'https://h.invalid');
const mem = () => calls.filter((c) => u(c.url).pathname.includes('/agent/memory'));
const of = (method: string, tail: string) => mem().filter((c) => c.method === method && u(c.url).pathname.endsWith(tail));
const writes = () => mem().filter((c) => c.method !== 'GET');
const flush = async () => {
  for (let i = 0; i < 20; i++) await act(async () => { await settle(); });
};
async function show(at = `/ai/knowledge/memory?project=${P}`) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <MemoryView computer="atlas" /> }),
    history: createMemoryHistory({ initialEntries: [at] }),
  });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
  await flush();
  return router;
}
const word = realmWord(R1);
const lost: Hook = () => ({ status: 0, network: true });

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  over = {};
  listed = true;
  seq = 0;
  host = { status: 'ok', datahost: { realm: R1, state: 'leader', host: 'c1', self_id: 'c1', can_use_self: true, hosts: [{ id: 'c1', name: 'atlas', is_current: true, is_self: true }] } };
  status = { enabled: true, available: true, degraded: false, recoverable: false, remote: true, last_consolidated: 'never' };
  onFetch((c) => {
    const url = u(c.url);
    const p = url.pathname;
    const x = { url, method: c.method, body: c.body };
    const hit = (k: keyof Over, d: () => Reply): Reply | Promise<Reply> => over[k]?.(x) ?? d();
    if (p.endsWith('/memory/datahost') && c.method === 'PUT') return hit('assign', () => ({ status: 200, body: { status: 'ok', outcome: 'won', host: 'c1' } }));
    if (p.endsWith('/memory/datahost')) return hit('host', () => ({ status: 200, body: host }));
    if (p.endsWith('/memory/status')) return hit('status', () => ({ status: 200, body: status }));
    if (p.endsWith('/memory/projects')) {
      return hit('projects', () => {
        const rows = [
          { key: '', root: '', memories: 4, observations: 0, sessions: 0, lessons: 0, slots: 0 },
          ...(listed ? [{ key: P, root: '/home/ada/projects/shop', memories: 2, observations: 5, sessions: 3, lessons: 1, slots: 0, updated_at: '2026-10-27T08:00:00Z' }] : []),
        ];
        return { status: 200, body: { items: rows, meta: { total: rows.length } } };
      });
    }
    if (p.endsWith('/memory/write-intents')) {
      return hit('intent', () => ({ status: 200, body: { status: 'ok', nonce: `nonce-${++seq}`, op: c.body.op, project: c.body.project, expires_in: 60 } }));
    }
    if (p.endsWith('/memory/consolidate')) return hit('consolidate', () => ({ status: 200, body: { status: 'ok', queued: true, project: c.body.project } }));
    if (p.endsWith('/memory/flush')) return hit('flush', () => ({ status: 200, body: { status: 'ok' } }));
    if (/\/memory\/projects\/[^/]+$/.test(p) && c.method === 'DELETE') {
      return hit('erase', () => { listed = false; return { status: 200, body: { status: 'ok', project: P, wiped: true, deleted: 7 } }; });
    }
    if (p.endsWith('/memory/items')) return { status: 200, body: { items: [], meta: { total: 0, page: 1, limit: 50 } } };
    return { status: 404, body: {} };
  });
});
afterEach(() => cleanup());

const menu = async (name: string) => {
  await userEvent.click(await screen.findByRole('button', { name: strings.manage }));
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(name) }));
};
const typeAndConfirm = async (typed: string, confirm: string) => {
  const dialog = await screen.findByRole('alertdialog');
  const box = within(dialog).getByRole('textbox');
  await userEvent.type(box, typed);
  await userEvent.click(within(dialog).getByRole('button', { name: confirm }));
  await flush();
};
// What another tab's warned Dismiss does to the shared registry: the held change goes, nothing else in this tab moves.
const dismissElsewhere = async () => {
  for (const c of pendingOf('lock:' + MEMORY_CONSOLIDATE_LOCK)) {
    const hold = holdOfLock(c.scope, c.digest);
    await act(async () => { await settleChange({ scope: c.scope, digest: c.digest, hold: hold!, kind: 'release', warned: true, by: c.by, nobodys: true }); });
  }
};
const tidy = async () => { await menu(strings.tidy); await typeAndConfirm('shop', strings['tidy.confirm']); };
const erase = async () => { await menu(strings.erase); await typeAndConfirm('shop', strings['erase.confirm']); };

describe('manage menu', () => {
  it('offers tidy-up, flush and erase in a project of a ready realm', async () => {
    await show();
    await userEvent.click(await screen.findByRole('button', { name: strings.manage }));
    for (const n of [strings.tidy, strings.flush, strings.erase]) expect(await screen.findByRole('menuitem', { name: new RegExp(n) })).toBeInTheDocument();
  });

  it('with no project open, tidy-up and erase are disabled and say why; flush stays', async () => {
    await show('/ai/knowledge/memory');
    await userEvent.click(await screen.findByRole('button', { name: strings.manage }));
    expect(await screen.findByRole('menuitem', { name: new RegExp(strings.tidy) })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: new RegExp(strings.erase) })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: new RegExp(strings.flush) })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('an off realm offers no management (nothing is stored to manage)', async () => {
    status = { enabled: false, available: false, degraded: false, recoverable: false };
    await show();
    expect(screen.queryByRole('button', { name: strings.manage })).toBeNull();
  });
});

describe('tidy up (consolidate)', () => {
  it('is typed with the project name: nothing is sent until the exact name is typed, and Cancel sends nothing', async () => {
    await show();
    await menu(strings.tidy);
    const dialog = await screen.findByRole('alertdialog');
    const go = within(dialog).getByRole('button', { name: strings['tidy.confirm'] });
    expect(go).toBeDisabled();
    await userEvent.type(within(dialog).getByRole('textbox'), 'sho');
    expect(go).toBeDisabled();
    await userEvent.type(within(dialog).getByRole('textbox'), 'pp');
    expect(go).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
    await flush();
    expect(writes()).toHaveLength(0);
  });

  it('mints its own intent, then sends the pass with that nonce, the project and the realm, once', async () => {
    await show();
    await tidy();
    const intents = of('POST', '/memory/write-intents');
    const passes = of('POST', '/memory/consolidate');
    expect(intents).toHaveLength(1);
    expect(passes).toHaveLength(1);
    expect(intents[0]!.body).toMatchObject({ op: 'consolidate', project: P, expect_realm: R1 });
    expect(passes[0]!.body).toMatchObject({ project: P, nonce: 'nonce-1', expect_realm: R1 });
    for (const c of writes()) expect(u(c.url).searchParams.get('realm')).toBe(R1);
    expect(mem().findIndex((c) => c === intents[0])).toBeLessThan(mem().findIndex((c) => c === passes[0]));
  });

  it('a settled tidy-up shows no result notice: only the page\'s own status says anything', async () => {
    await show();
    await tidy();
    expect(document.querySelector('[data-outcome]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/queued|finished/i);
  });

  it('every press mints a fresh intent (the first is spent)', async () => {
    await show();
    await tidy();
    await tidy();
    expect(of('POST', '/memory/write-intents').map((c) => (c.body as { op: string }).op)).toEqual(['consolidate', 'consolidate']);
    expect(of('POST', '/memory/consolidate').map((c) => (c.body as { nonce: string }).nonce)).toEqual(['nonce-1', 'nonce-2']);
  });

  it('a lost answer is held as unknown: never failed, never resent, and the menu will not send another', async () => {
    over.consolidate = lost;
    await show();
    await tidy();
    expect(screen.getByText(interpolate(strings['tidy.held'], { name: 'shop' }), { exact: false })).toBeInTheDocument();
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
    expect(of('POST', '/memory/consolidate')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: strings.manage }));
    expect(await screen.findByRole('menuitem', { name: new RegExp(strings.tidy) })).toHaveAttribute('aria-disabled', 'true');
    expect(of('POST', '/memory/write-intents')).toHaveLength(1);
  });

  it('Check again reads only; an agent that reports no tidy-up block proves nothing and the hold stays', async () => {
    over.consolidate = lost;
    await show();
    await tidy();
    const before = writes().length;
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await flush();
    expect(writes()).toHaveLength(before);
    expect(screen.getByText(interpolate(strings['tidy.held'], { name: 'shop' }), { exact: false })).toBeInTheDocument();
    expect(screen.getByText(strings['tidy.heldNoStatus'], { exact: false })).toBeInTheDocument();
  });

  it('a status that reports a pass queued for this project proves the lost answer', async () => {
    over.consolidate = lost;
    await show();
    await tidy();
    status = { ...status, consolidation: { state: 'queued', project: P, queued_at_ms: 1 } };
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await flush();
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
    expect(of('POST', '/memory/consolidate')).toHaveLength(1);
  });

  it('a pass queued for ANOTHER project, or an idle block, proves nothing', async () => {
    over.consolidate = lost;
    await show();
    await tidy();
    status = { ...status, consolidation: { state: 'queued', project: 'other' } };
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await flush();
    status = { ...status, consolidation: { state: 'idle', last_done_ms: Date.now() + 1000, last_result: 'ok' } };
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await flush();
    expect(screen.getByText(interpolate(strings['tidy.held'], { name: 'shop' }), { exact: false })).toBeInTheDocument();
    expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull();
  });

  it('an earlier proof never hides a later definite refusal', async () => {
    over.consolidate = lost;
    await show();
    await tidy();
    status = { ...status, consolidation: { state: 'queued', project: P, queued_at_ms: 1 } };
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await flush();
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
    // A new press whose write is refused by the agent: the refusal shows, the old proof is gone.
    over.consolidate = () => ({ status: 409, body: { error: 'x', code: 'write_intent_invalid' } });
    await tidy();
    expect(document.querySelector('[data-outcome]')).toBeNull();
    expect(document.body.textContent).not.toContain(strings['act.refused.write_intent_invalid']);
  });

  it('an earlier proof is not revealed by a later unknown press and Stop waiting', async () => {
    over.consolidate = lost;
    await show();
    await tidy();
    status = { ...status, consolidation: { state: 'queued', project: P, queued_at_ms: 1 } };
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await flush();
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
    status = { ...status, consolidation: { state: 'idle' } };
    await tidy();
    await userEvent.click(screen.getByRole('button', { name: /close|dismiss|stop/i }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['stop.confirm'] }));
    await flush();
    expect(document.querySelector('[data-outcome]')).toBeNull();
    expect(document.querySelector('[data-outcome="done"]')).toBeNull();
  });

  it('Stop waiting confirmed while a Check again is still reading is not a proof', async () => {
    over.consolidate = lost;
    await show();
    await tidy();
    let release!: (r: Reply) => void;
    over.status = (() => new Promise<Reply>((res) => { release = res; })) as never;
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await userEvent.click(screen.getByRole('button', { name: /close|dismiss|stop/i }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['stop.confirm'] }));
    delete over.status;
    release({ status: 200, body: status });
    await flush();
    expect(document.querySelector('[data-outcome]')).toBeNull();
    expect(document.querySelector('[data-outcome="done"]')).toBeNull();
  });

  it('a stale Check again read never proves a replacement hold of the same action, whatever happens to it later', async () => {
    over.consolidate = lost;
    await show();
    await tidy();
    let release!: (r: Reply) => void;
    over.status = (() => new Promise<Reply>((res) => { release = res; })) as never;
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    // Another tab dismisses the hold the read was started for; a new hold of the same action replaces it.
    await dismissElsewhere();
    delete over.status;
    await tidy();
    expect(screen.getByText(interpolate(strings['tidy.held'], { name: 'shop' }), { exact: false })).toBeInTheDocument();
    // The old read comes back positive.
    release({ status: 200, body: { ...status, consolidation: { state: 'queued', project: P, queued_at_ms: 1 } } });
    await flush();
    expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull();
    expect(screen.getByText(interpolate(strings['tidy.held'], { name: 'shop' }), { exact: false })).toBeInTheDocument();
    // The replacement is then dismissed in another tab without any proof: still no success.
    await dismissElsewhere();
    await flush();
    expect(screen.queryByText(interpolate(strings['tidy.held'], { name: 'shop' }), { exact: false })).toBeNull();
    expect(document.querySelector('[data-outcome]')).toBeNull();
    expect(document.querySelector('[data-outcome="done"]')).toBeNull();
  });

  it('no background read ends a hold, even one that shows the change: only the press of Check again does', async () => {
    over.consolidate = lost;
    // The server already shows the change when the lost press is followed by the page's own automatic read-back.
    status = { ...status, consolidation: { state: 'queued', project: P, queued_at_ms: 1 } };
    await show();
    await tidy();
    // The page's own reads run again (its refresh button, a reload of the status, a visibility refresh): reads only.
    await act(async () => { await queryClient.invalidateQueries(); });
    await flush();
    expect(screen.getByText(interpolate(strings['tidy.held'], { name: 'shop' }), { exact: false })).toBeInTheDocument();
    expect(of('POST', '/consolidate')).toHaveLength(1);
    // The press is what ends it, and the page then claims nothing about the change.
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await flush();
    expect(screen.queryByText(interpolate(strings['tidy.held'], { name: 'shop' }), { exact: false })).toBeNull();
    expect(document.querySelector('[data-outcome="done"]')).toBeNull();
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
    expect(of('POST', '/consolidate')).toHaveLength(1);
  });

  it('a hold stays reachable from the project list: Check again and Stop waiting follow the hold, not the open project', async () => {
    over.consolidate = lost;
    const router = await show();
    await tidy();
    await act(async () => { await router.navigate({ to: '/', search: {} as never }); });
    await flush();
    expect(screen.getByText(interpolate(strings['tidy.held'], { name: 'shop' }), { exact: false })).toBeInTheDocument();
    status = { ...status, consolidation: { state: 'queued', project: P, queued_at_ms: 1 } };
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await flush();
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
  });

  it('a tidy-up answer naming another project may have gone through: held, not queued', async () => {
    over.consolidate = (c) => ({ status: 200, body: { status: 'ok', queued: true, project: `${String((c.body as { project: string }).project)}-other` } });
    await show();
    await tidy();
    expect(document.querySelector('[data-outcome="done"]')).toBeNull();
    expect(screen.getByText(interpolate(strings['tidy.held'], { name: 'shop' }), { exact: false })).toBeInTheDocument();
  });

  it('while a change waits, the menu entries say why they are off', async () => {
    over.consolidate = lost;
    await show();
    await tidy();
    await userEvent.click(screen.getByRole('button', { name: strings.manage }));
    const item = await screen.findByRole('menuitem', { name: new RegExp(strings.tidy) });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(within(item).queryByText(strings.waiting) ?? screen.queryAllByText(strings.waiting)[0]).toBeTruthy();
  });

  it('Stop waiting asks first and frees only the hold', async () => {
    over.consolidate = lost;
    await show();
    await tidy();
    await userEvent.click(screen.getByRole('button', { name: /close|dismiss|stop/i }));
    const dialog = await screen.findByRole('alertdialog');
    expect(of('POST', '/memory/consolidate')).toHaveLength(1);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['stop.confirm'] }));
    await flush();
    expect(screen.queryByText(interpolate(strings['tidy.held'], { name: 'shop' }), { exact: false })).toBeNull();
    expect(of('POST', '/memory/consolidate')).toHaveLength(1);
  });

  it('a Check again that proves nothing leaves no proof behind: Stop waiting then shows no "queued" banner', async () => {
    over.consolidate = lost;
    await show();
    await tidy();
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await flush();
    await userEvent.click(screen.getByRole('button', { name: /close|dismiss|stop/i }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['stop.confirm'] }));
    await flush();
    expect(document.querySelector('[data-outcome]')).toBeNull();
    expect(document.querySelector('[data-outcome="done"]')).toBeNull();
  });

  it('a refused mint sent no write: not sent, nothing held, and the person may try again', async () => {
    over.intent = () => ({ status: 503, body: { error: 'x', code: 'service_unavailable' }, headers: { 'Retry-After': '5' } });
    await show();
    await tidy();
    expect(of('POST', '/memory/consolidate')).toHaveLength(0);
    expect(document.querySelector('[data-outcome="not_sent"]')).toBeNull();
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
    delete over.intent;
    await tidy();
    expect(of('POST', '/memory/consolidate')).toHaveLength(1);
  });

  it('a lost mint answer sent no write either: not sent, not held', async () => {
    over.intent = lost;
    await show();
    await tidy();
    expect(of('POST', '/memory/consolidate')).toHaveLength(0);
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
    expect(document.querySelector('[data-outcome="not_sent"]')).toBeNull();
  });

  it('a mint for another op or project is refused: the write is not sent', async () => {
    over.intent = ({ body }) => ({ status: 200, body: { status: 'ok', nonce: 'x', op: 'wipe_project', project: (body as { project: string }).project, expires_in: 60 } });
    await show();
    await tidy();
    expect(of('POST', '/memory/consolidate')).toHaveLength(0);
  });

  it.each([
    ['write_intent_invalid', 409],
    ['realm_mismatch', 409],
    ['consolidate_unavailable', 503],
    ['store_unavailable', 503],
    ['service_unavailable', 503],
  ] as const)('%s (%i) is a definite refusal with its own words: failed, not held, nothing queued', async (code, st) => {
    over.consolidate = () => ({ status: st, body: { error: 'no', code } });
    await show();
    await tidy();
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
    expect(document.body.textContent).not.toContain(strings[`act.refused.${code}`]);
    expect(of('POST', '/memory/consolidate')).toHaveLength(1);
  });

  it('a 200 that is not a queued answer may have gone through: held, not done', async () => {
    over.consolidate = () => ({ status: 200, body: { status: 'ok' } });
    await show();
    await tidy();
    expect(document.querySelector('[data-outcome="done"]')).toBeNull();
    expect(screen.getByText(interpolate(strings['tidy.held'], { name: 'shop' }), { exact: false })).toBeInTheDocument();
  });

  it('the status block the agent reports is shown as it reports it', async () => {
    status = { ...status, consolidation: { state: 'running', project: P } };
    await show();
    expect(await screen.findByText(interpolate(strings['tidy.status.running'], { name: 'shop' }), { exact: false })).toBeInTheDocument();
  });
});

describe('erase', () => {
  it('is typed and dangerous: it names the realm and that it cannot be undone, and sends nothing until armed', async () => {
    await show();
    await menu(strings.erase);
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(interpolate(strings['erase.effect1'], { realm: word }))).toBeInTheDocument();
    expect(within(dialog).getByText(strings['erase.effect2'])).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: strings['erase.confirm'] })).toBeDisabled();
    expect(writes()).toHaveLength(0);
  });

  it('mints a wipe_project intent and erases with its nonce, the project in the path and the realm asserted', async () => {
    await show();
    await erase();
    const intents = of('POST', '/memory/write-intents');
    const wipes = mem().filter((c) => c.method === 'DELETE');
    expect(intents).toHaveLength(1);
    expect(intents[0]!.body).toMatchObject({ op: 'wipe_project', project: P, expect_realm: R1 });
    expect(wipes).toHaveLength(1);
    expect(u(wipes[0]!.url).pathname.endsWith(`/memory/projects/${P}`)).toBe(true);
    expect(wipes[0]!.body).toMatchObject({ nonce: 'nonce-1', expect_realm: R1 });
    expect(u(wipes[0]!.url).searchParams.get('realm')).toBe(R1);
  });

  it('a settled erase shows no notice at all and the lists are read again', async () => {
    await show();
    const before = of('GET', '/memory/projects').length + of('GET', '/memory/status').length;
    await erase();
    expect(document.querySelector('[data-outcome]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Erase finished|Everything stored|follow-up/i);
    expect(of('GET', '/memory/projects').length + of('GET', '/memory/status').length).toBeGreaterThan(before);
  });

  it('an erasure with unconfirmed follow-up steps shows no notice and no step ids', async () => {
    over.erase = () => { listed = false; return { status: 200, body: { status: 'ok', project: P, wiped: true, deleted: 3, incomplete_erasure: true, incomplete_steps: ['profile_invalidate', 'snapshot_purge', 'mystery_step'] } }; };
    await show();
    await erase();
    expect(document.querySelector('[data-outcome]')).toBeNull();
    expect(document.body.textContent).not.toContain('profile_invalidate');
    expect(document.body.textContent).not.toContain('mystery_step');
  });

  it('a lost answer is held; Check again proves it only with the project gone AND the realm answering with a store', async () => {
    over.erase = lost;
    await show();
    await erase();
    expect(screen.getByText(interpolate(strings['erase.held'], { name: 'shop' }), { exact: false })).toBeInTheDocument();
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
    // Still listed: not proved.
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await flush();
    expect(screen.getByText(interpolate(strings['erase.held'], { name: 'shop' }), { exact: false })).toBeInTheDocument();
    // Gone from the list but the realm has no store (an off realm lists nothing): not proved.
    listed = false;
    status = { enabled: false, available: false, degraded: false, recoverable: false };
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await flush();
    expect(screen.getByText(interpolate(strings['erase.held'], { name: 'shop' }), { exact: false })).toBeInTheDocument();
    // Gone and a store answers: proved.
    status = { enabled: true, available: true, degraded: false, recoverable: false, remote: true, last_consolidated: 'never' };
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await flush();
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
    expect(mem().filter((c) => c.method === 'DELETE')).toHaveLength(1);
    expect(of('POST', '/memory/write-intents')).toHaveLength(1);
  });

  it('a successful erase refreshes what the page shows', async () => {
    await show();
    const before = of('GET', '/memory/projects').length + of('GET', '/memory/status').length;
    await erase();
    expect(of('GET', '/memory/projects').length + of('GET', '/memory/status').length).toBeGreaterThan(before);
  });

  it('a list that does not say it is whole proves no erasure', async () => {
    over.erase = lost;
    await show();
    await erase();
    listed = false;
    over.projects = () => ({ status: 200, body: { items: [], meta: { total: 42 } } });
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await flush();
    expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull();
    expect(screen.getByText(interpolate(strings['erase.held'], { name: 'shop' }), { exact: false })).toBeInTheDocument();
  });

  it('an erased project that is gone from the list still has its hold and its controls', async () => {
    over.erase = lost;
    const router = await show();
    await erase();
    listed = false;
    await act(async () => { await router.navigate({ to: '/', search: {} as never }); });
    await flush();
    expect(screen.getByText(interpolate(strings['erase.held'], { name: 'shop' }), { exact: false })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await flush();
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
  });

  it.each([
    ['cleanup steps without the flag', { status: 'ok', project: P, wiped: true, incomplete_steps: ['profile_invalidate'] }],
    ['cleanup steps with the flag false', { status: 'ok', project: P, wiped: true, incomplete_erasure: false, incomplete_steps: ['profile_invalidate'] }],
  ])('an erase 200 with %s is a contradiction: held, not a clean erasure', async (_n, body) => {
    over.erase = () => ({ status: 200, body });
    await show();
    await erase();
    expect(screen.getByText(interpolate(strings['erase.held'], { name: 'shop' }), { exact: false })).toBeInTheDocument();
  });

  it('a list that repeats a project key proves no erasure', async () => {
    over.erase = lost;
    await show();
    await erase();
    listed = false;
    over.projects = () => ({ status: 200, body: { items: [{ key: 'q', root: '/q' }, { key: 'q', root: '/q' }], meta: { total: 2 } } });
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await flush();
    expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull();
    expect(screen.getByText(interpolate(strings['erase.held'], { name: 'shop' }), { exact: false })).toBeInTheDocument();
  });

  it('a refused mint erases nothing', async () => {
    over.intent = () => ({ status: 409, body: { error: 'x', code: 'realm_mismatch' } });
    await show();
    await erase();
    expect(mem().filter((c) => c.method === 'DELETE')).toHaveLength(0);
  });

  it('write_intent_invalid on the erase is a definite refusal: failed, nothing erased', async () => {
    over.erase = () => ({ status: 409, body: { error: 'x', code: 'write_intent_invalid' } });
    await show();
    await erase();
    expect(document.body.textContent).not.toContain(strings['act.refused.write_intent_invalid']);
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
  });

  it.each(['store_unavailable', 'service_unavailable'] as const)('%s (503) on the erase refused it before it began: failed, not held', async (code) => {
    over.erase = () => ({ status: 503, body: { error: 'no', code } });
    await show();
    await erase();
    expect(document.body.textContent).not.toContain(strings[`act.refused.${code}`]);
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
  });

  it('a 500 from the erase may have begun it: held, not failed', async () => {
    over.erase = () => ({ status: 500, body: { error: 'boom', code: 'store_failed' } });
    await show();
    await erase();
    expect(screen.getByText(interpolate(strings['erase.held'], { name: 'shop' }), { exact: false })).toBeInTheDocument();
  });

  it('an erase 200 that does not say wiped may have gone through: held, not done', async () => {
    over.erase = () => ({ status: 200, body: { status: 'ok' } });
    await show();
    await erase();
    expect(screen.getByText(interpolate(strings['erase.held'], { name: 'shop' }), { exact: false })).toBeInTheDocument();
  });
});

// A second hook on the same lock stands for another tab: its press makes a hold this page did not send.
let otherErase: ((project?: string) => void) | null = null;
let otherCheck: (() => Promise<boolean>) | null = null;
function OtherTab() {
  const at = useMemoryAt();
  const erase = useErase(at!);
  otherErase = (project = P) => { void erase.run({ target: at!.target, realm: at!.realm, project }); };
  otherCheck = () => erase.check();
  return null;
}
async function showWithOtherTab() {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <><MemoryView computer="atlas" /><OtherTab /></> }),
    history: createMemoryHistory({ initialEntries: [`/ai/knowledge/memory?project=${P}`] }),
  });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
  await flush();
}

// There is no erase result notice at all. Whatever order holds, checks and replies come in (the 7b, 7c, 7d, 8 and
// refusal orderings), no operation's outcome is on screen afterwards: no banner of any kind, only the re-read list.
describe('the erase has no result notice', () => {
  const okReply: Reply = { status: 200, body: { status: 'ok', project: P, wiped: true, deleted: 7 } };
  const refusal: Reply = { status: 409, body: { status: 'error', code: 'write_intent_invalid' } };
  const quiet = () => {
    expect(document.querySelector('[data-outcome]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Everything stored|Erase finished|Memory erased|didn.t finish|one-time permission/i);
    expect(screen.queryByText(interpolate(strings['erase.held'], { name: 'proj_other' }), { exact: false })).toBeNull();
  };
  const ends = async (how: 'ui-stop' | 'ui-check' | 'ext-stop' | 'ext-check') => {
    if (how === 'ui-stop') {
      await userEvent.click(screen.getByRole('button', { name: /close|dismiss|stop/i }));
      await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['stop.confirm'] }));
    } else if (how === 'ui-check') {
      await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    } else if (how === 'ext-stop') {
      for (const c of pendingOf('lock:' + MEMORY_ERASE_LOCK)) {
        const hold = holdOfLock(c.scope, c.digest);
        await act(async () => { await settleChange({ scope: c.scope, digest: c.digest, hold: hold!, kind: 'release', warned: true, by: c.by, nobodys: true }); });
      }
    } else {
      await act(async () => { await otherCheck!(); });
    }
    await flush();
  };
  const orderings = [
    ['before', 'ui-stop'], ['before', 'ui-check'], ['before', 'ext-stop'], ['before', 'ext-check'],
    ['after', 'ui-stop'], ['after', 'ui-check'], ['after', 'ext-stop'], ['after', 'ext-check'],
  ] as const;

  it.each(orderings)('this page\'s erase succeeds %s a newer hold ends by %s: nothing of it is shown', async (when, how) => {
    let answer!: (r: Reply) => void;
    over.erase = (c) => (c.url.pathname.endsWith(`/projects/${P}`)
      ? new Promise<Reply>((res) => { answer = res; })
      : { status: 0, network: true });
    await showWithOtherTab();
    await menu(strings.erase);
    await typeAndConfirm('shop', strings['erase.confirm']);
    await act(async () => { otherErase!('proj_other'); });
    await flush();
    expect(screen.getByText(interpolate(strings['erase.held'], { name: 'proj_other' }), { exact: false })).toBeInTheDocument();
    const deliver = async (r: Reply) => { listed = false; await act(async () => { answer(r); }); await flush(); };
    if (when === 'before') await deliver(okReply);
    await ends(how);
    if (when === 'after') await deliver(okReply);
    quiet();
  });

  it.each(orderings)('this page\'s erase is refused %s a newer hold ends by %s: no refusal text is shown', async (when, how) => {
    let answer!: (r: Reply) => void;
    over.erase = (c) => (c.url.pathname.endsWith(`/projects/${P}`)
      ? new Promise<Reply>((res) => { answer = res; })
      : { status: 0, network: true });
    await showWithOtherTab();
    await menu(strings.erase);
    await typeAndConfirm('shop', strings['erase.confirm']);
    await act(async () => { otherErase!('proj_other'); });
    await flush();
    const deliver = async (r: Reply) => { await act(async () => { answer(r); }); await flush(); };
    if (when === 'before') await deliver(refusal);
    await ends(how);
    if (when === 'after') await deliver(refusal);
    quiet();
  });

  it('the list is read again after a settled erase and after a hold ends (reads only)', async () => {
    over.erase = lost;
    await show();
    await erase();
    const before = of('GET', '/memory/projects').length;
    await userEvent.click(screen.getByRole('button', { name: /close|dismiss|stop/i }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['stop.confirm'] }));
    await flush();
    expect(of('GET', '/memory/projects').length).toBeGreaterThan(before);
    expect(mem().filter((c) => c.method === 'DELETE')).toHaveLength(1);
  });

  it('a refused erase leaves no notice; the menu is the only way to press again', async () => {
    over.erase = () => refusal;
    await show();
    await erase();
    quiet();
    expect(document.body.textContent).not.toContain(strings['act.refused.write_intent_invalid']);
  });
});

describe('write pending memory now', () => {
  it('sends the barrier with the realm and no intent, and says written', async () => {
    await show();
    await menu(strings.flush);
    await flush();
    expect(of('POST', '/memory/flush')).toHaveLength(1);
    expect(u(of('POST', '/memory/flush')[0]!.url).searchParams.get('realm')).toBe(R1);
    expect(of('POST', '/memory/write-intents')).toHaveLength(0);
    expect(screen.getByText(strings['flush.done'])).toBeInTheDocument();
  });

  it('a lost answer is unknown (not failed), offers no resend, and a new press from the menu is the person asking again', async () => {
    over.flush = lost;
    await show();
    await menu(strings.flush);
    await flush();
    expect(screen.getByText(strings['flush.pending'])).toBeInTheDocument();
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
    // The notice carries no "write again" button, and nothing was sent a second time by itself.
    expect(screen.queryByRole('button', { name: /write again/i })).toBeNull();
    expect(of('POST', '/memory/flush')).toHaveLength(1);
    delete over.flush;
    await menu(strings.flush);
    await flush();
    expect(of('POST', '/memory/flush')).toHaveLength(2);
    expect(screen.getByText(strings['flush.done'])).toBeInTheDocument();
  });

  it.each([
    ['null', { status: 200, text: 'null' }],
    ['an error-shaped object', { status: 200, body: { status: 'error', message: 'boom' } }],
    ['an empty object', { status: 200, body: {} }],
  ] as const)('a 200 with %s is not the agent’s ok: unknown, not done', async (_n, reply) => {
    over.flush = () => reply as never;
    await show();
    await menu(strings.flush);
    await flush();
    expect(screen.queryByText(strings['flush.done'])).toBeNull();
    expect(screen.getByText(strings['flush.pending'])).toBeInTheDocument();
  });

  it('the agent’s own fault after draining some stores (an uncoded 400) is unknown, not failed', async () => {
    over.flush = () => ({ status: 400, body: { code: 'bad_request', message: 'flush: disk' } });
    await show();
    await menu(strings.flush);
    await flush();
    expect(screen.getByText(strings['flush.pending'])).toBeInTheDocument();
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
  });

  it('a refusal before anything drained (a realm the agent does not serve) is failed', async () => {
    over.flush = () => ({ status: 404, body: { code: 'not_found', message: 'realm not found' } });
    await show();
    await menu(strings.flush);
    await flush();
    expect(document.querySelector('[data-outcome="failed"]')).not.toBeNull();
  });

  it('is available with no project open', async () => {
    await show('/ai/knowledge/memory');
    await menu(strings.flush);
    await flush();
    expect(of('POST', '/memory/flush')).toHaveLength(1);
  });
});

describe('use this computer as the realm’s memory host', () => {
  const stuck = (canUseSelf: boolean) => {
    host = { status: 'ok', datahost: { realm: R1, state: 'stuck', host: '', self_id: 'c1', can_use_self: canUseSelf, hosts: [{ id: 'c1', name: 'atlas', is_self: true }] } };
  };
  const action = () => screen.queryByRole('button', { name: strings['host.action'] });

  // The agent offers the takeover in a peer outage (unavailable) and a slow election as
  // well as a stuck one (can_use_self); the page follows it, never a state of its own.
  it.each(['stuck', 'unavailable', 'electing'])('is offered in state %s when the agent says this computer can serve, and not when it says no', async (state) => {
    host = { status: 'ok', datahost: { realm: R1, state, host: state === 'unavailable' ? 'c2' : '', self_id: 'c1', can_use_self: true, hosts: [{ id: 'c1', name: 'atlas', is_self: true }] } };
    await show();
    expect(action()).not.toBeNull();
    cleanup(); queryClient.clear();
    host = { status: 'ok', datahost: { realm: R1, state, host: '', self_id: 'c1', can_use_self: false, hosts: [{ id: 'c1', name: 'atlas', is_self: true }] } };
    await show();
    expect(action()).toBeNull();
  });

  it.each(['leader', 'follower'])('is never offered while a host serves the realm (state %s), whatever can_use_self says', async (state) => {
    host = { status: 'ok', datahost: { realm: R1, state, host: 'c2', self_id: 'c1', can_use_self: true, hosts: [{ id: 'c2', name: 'borealis', is_current: true, is_self: false }] } };
    await show();
    expect(action()).toBeNull();
  });

  it('the confirm says it moves no data, and Cancel sends nothing', async () => {
    stuck(true);
    await show();
    await userEvent.click(action()!);
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(strings['host.note'])).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
    await flush();
    expect(writes()).toHaveLength(0);
  });

  it('sends use_self with the realm named twice (header and expect_realm), once, with no intent', async () => {
    stuck(true);
    await show();
    await userEvent.click(action()!);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: interpolate(strings['host.confirm'], { computer: 'atlas' }) }));
    await flush();
    const puts = of('PUT', '/memory/datahost');
    expect(puts).toHaveLength(1);
    expect(puts[0]!.body).toEqual({ use_self: true, expect_realm: R1 });
    expect(u(puts[0]!.url).searchParams.get('realm')).toBe(R1);
    expect(of('POST', '/memory/write-intents')).toHaveLength(0);
    expect(document.querySelector('[data-outcome="done"]')).toBeNull();
  });

  it('a lost answer is held; only a fresh host read naming this computer current proves it', async () => {
    stuck(true);
    over.assign = lost;
    await show();
    await userEvent.click(action()!);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: interpolate(strings['host.confirm'], { computer: 'atlas' }) }));
    await flush();
    expect(screen.getByText(interpolate(strings['host.held'], { computer: 'atlas' }), { exact: false })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await flush();
    expect(screen.getByText(interpolate(strings['host.held'], { computer: 'atlas' }), { exact: false })).toBeInTheDocument();
    host = { status: 'ok', datahost: { realm: R1, state: 'leader', host: 'c1', self_id: 'c1', can_use_self: true, hosts: [{ id: 'c1', name: 'atlas', is_self: true, is_current: true }] } };
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await flush();
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
    expect(of('PUT', '/memory/datahost')).toHaveLength(1);
  });

  it.each([
    ['a flag that is not a boolean', { id: 'c2', name: 'x', is_self: 'yes', is_current: 1 }],
    ['both flags missing', { id: 'c2', name: 'x' }],
    ['one flag missing', { id: 'c2', name: 'x', is_self: false }],
  ])('a host list with a row with %s proves nothing, however the page reads it', async (_n, row) => {
    stuck(true);
    over.assign = lost;
    await show();
    await userEvent.click(action()!);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: interpolate(strings['host.confirm'], { computer: 'atlas' }) }));
    await flush();
    host = { status: 'ok', datahost: { realm: R1, state: 'leader', host: 'c1', self_id: 'c1', can_use_self: true, hosts: [{ id: 'c1', name: 'atlas', is_self: true, is_current: true }, row] } };
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await flush();
    expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull();
    expect(screen.getByText(interpolate(strings['host.held'], { computer: 'atlas' }), { exact: false })).toBeInTheDocument();
    expect(of('PUT', '/memory/datahost')).toHaveLength(1);
  });

  it('a read already out when Check again is pressed never ends the hold: the check sends its own read', async () => {
    stuck(true);
    over.assign = lost;
    await show();
    await userEvent.click(action()!);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: interpolate(strings['host.confirm'], { computer: 'atlas' }) }));
    await flush();
    const good = { status: 'ok', datahost: { realm: R1, state: 'leader', host: 'c1', self_id: 'c1', can_use_self: true, hosts: [{ id: 'c1', name: 'atlas', is_self: true, is_current: true }] } };
    const out: ((r: Reply) => void)[] = [];
    over.host = () => new Promise<Reply>((res) => { out.push(res); });
    // An automatic read-back that is still out (core's own shape: a read of the held reads, shared by whoever asks next).
    void refreshFresh(sourceReads(ADMIN_SOURCE, ['memory.datahost']));
    await flush();
    const before = out.length;
    expect(before).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await flush();
    // The check did not join it: it sent a read of its own after the press.
    expect(out.length).toBeGreaterThan(before);
    // The older read now answers with the proof: it ends nothing.
    for (let i = 0; i < before; i++) out[i]!({ status: 200, body: good });
    await flush();
    expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull();
    expect(screen.getByText(interpolate(strings['host.held'], { computer: 'atlas' }), { exact: false })).toBeInTheDocument();
    // The check's own read is what decides, and it says the same: now it ends.
    for (let i = before; i < out.length; i++) out[i]!({ status: 200, body: good });
    await flush();
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
    expect(of('PUT', '/memory/datahost')).toHaveLength(1);
  });

  it('a Check again whose host read names another realm proves nothing', async () => {
    stuck(true);
    over.assign = lost;
    await show();
    await userEvent.click(action()!);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: interpolate(strings['host.confirm'], { computer: 'atlas' }) }));
    await flush();
    host = { status: 'ok', datahost: { realm: 'bbbbbbbbbbbbbbbbbbbbbbb2', state: 'leader', host: 'c1', self_id: 'c1', can_use_self: true, hosts: [{ id: 'c1', name: 'atlas', is_self: true, is_current: true }] } };
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await flush();
    expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull();
    expect(screen.getByText(interpolate(strings['host.held'], { computer: 'atlas' }), { exact: false })).toBeInTheDocument();
  });

  it('an assignment answer naming another computer as host may have gone through: held, not done', async () => {
    stuck(true);
    over.assign = () => ({ status: 200, body: { status: 'ok', outcome: 'published', host: 'other-computer' } });
    await show();
    await userEvent.click(action()!);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: interpolate(strings['host.confirm'], { computer: 'atlas' }) }));
    await flush();
    expect(document.querySelector('[data-outcome="done"]')).toBeNull();
    expect(screen.getByText(interpolate(strings['host.held'], { computer: 'atlas' }), { exact: false })).toBeInTheDocument();
  });

  it.each(['not_ready_recovering', 'stopped'])('an ok whose coordinator outcome is %s did not make this computer the host: held, not done', async (outcome) => {
    stuck(true);
    over.assign = () => ({ status: 200, body: { status: 'ok', outcome, host: 'c1' } });
    await show();
    await userEvent.click(action()!);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: interpolate(strings['host.confirm'], { computer: 'atlas' }) }));
    await flush();
    expect(document.querySelector('[data-outcome="done"]')).toBeNull();
    expect(screen.getByText(interpolate(strings['host.held'], { computer: 'atlas' }), { exact: false })).toBeInTheDocument();
  });

  // A definite "not this computer" ends the press: nothing held, nothing done, the
  // hosts read again (the band then names who serves), the assignment sent once.
  it.each([
    ['refused_healthy_host', 'c2'],
    ['adopted', 'c2'],
  ])('an ok whose coordinator outcome is %s naming another computer is a definite no: not held, hosts read again', async (outcome, named) => {
    stuck(true);
    over.assign = () => ({ status: 200, body: { status: 'ok', outcome, host: named } });
    await show();
    await userEvent.click(action()!);
    host = { status: 'ok', datahost: { realm: R1, state: 'follower', host: 'c2', self_id: 'c1', can_use_self: false, hosts: [{ id: 'c1', name: 'atlas', is_self: true, is_current: false }, { id: 'c2', name: 'borealis', is_self: false, is_current: true }] } };
    const readsBefore = of('GET', '/memory/datahost').length;
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: interpolate(strings['host.confirm'], { computer: 'atlas' }) }));
    await flush();
    expect(screen.queryByText(interpolate(strings['host.held'], { computer: 'atlas' }), { exact: false })).toBeNull();
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
    expect(document.querySelector('[data-outcome="done"]')).toBeNull();
    expect(of('GET', '/memory/datahost').length).toBeGreaterThan(readsBefore);
    expect(of('PUT', '/memory/datahost')).toHaveLength(1);
    // The band follows the new read: a host serves, so the action is gone.
    expect(action()).toBeNull();
  });

  it('an ok whose coordinator outcome is adopted naming this computer proves nothing: held until a host read does', async () => {
    stuck(true);
    over.assign = () => ({ status: 200, body: { status: 'ok', outcome: 'adopted', host: 'c1' } });
    await show();
    await userEvent.click(action()!);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: interpolate(strings['host.confirm'], { computer: 'atlas' }) }));
    await flush();
    expect(screen.getByText(interpolate(strings['host.held'], { computer: 'atlas' }), { exact: false })).toBeInTheDocument();
    expect(document.querySelector('[data-outcome="done"]')).toBeNull();
    expect(of('PUT', '/memory/datahost')).toHaveLength(1);
  });


  // The agent's 503 stopped is not "nothing ran": the coordinator can stop after the command was queued, and the queued
  // command may still have published. It stays held, as any other 5xx.
  it('a 503 stopped may have gone through: held, sent once', async () => {
    stuck(true);
    over.assign = () => ({ status: 503, body: { error: 'the data-host coordinator is not running', code: 'stopped' } });
    await show();
    await userEvent.click(action()!);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: interpolate(strings['host.confirm'], { computer: 'atlas' }) }));
    await flush();
    expect(screen.getByText(interpolate(strings['host.held'], { computer: 'atlas' }), { exact: false })).toBeInTheDocument();
    expect(of('PUT', '/memory/datahost')).toHaveLength(1);
  });

  it('a host read whose ids name another computer proves nothing', async () => {
    stuck(true);
    over.assign = lost;
    await show();
    await userEvent.click(action()!);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: interpolate(strings['host.confirm'], { computer: 'atlas' }) }));
    await flush();
    host = { status: 'ok', datahost: { realm: R1, state: 'follower', host: 'c2', self_id: 'c2', can_use_self: true, hosts: [{ id: 'c2', name: 'other', is_self: true, is_current: true }] } };
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await flush();
    expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull();
    expect(screen.getByText(interpolate(strings['host.held'], { computer: 'atlas' }), { exact: false })).toBeInTheDocument();
  });

  it('a 200 that is not the agent’s ok may have gone through: held, not done', async () => {
    stuck(true);
    over.assign = () => ({ status: 200, body: {} });
    await show();
    await userEvent.click(action()!);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: interpolate(strings['host.confirm'], { computer: 'atlas' }) }));
    await flush();
    expect(document.querySelector('[data-outcome="done"]')).toBeNull();
    expect(screen.getByText(interpolate(strings['host.held'], { computer: 'atlas' }), { exact: false })).toBeInTheDocument();
  });

  it('refused_realm_changed is a definite refusal with its words', async () => {
    stuck(true);
    over.assign = () => ({ status: 409, body: { error: 'x', code: 'refused_realm_changed' } });
    await show();
    await userEvent.click(action()!);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: interpolate(strings['host.confirm'], { computer: 'atlas' }) }));
    await flush();
    expect(document.body.textContent).not.toContain(strings['act.refused.refused_realm_changed']);
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
  });
});

describe('the realm', () => {
  it('with All realms nothing is sent', async () => {
    boot({});
    queryClient.clear();
    await show();
    expect(mem()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: strings.manage })).toBeNull();
  });

  it('waits for the project list before offering a tidy-up or an erase of a project it does not know', async () => {
    await show(`/ai/knowledge/memory?project=gone`);
    await userEvent.click(await screen.findByRole('button', { name: strings.manage }));
    expect(await screen.findByRole('menuitem', { name: new RegExp(strings.tidy) })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: new RegExp(strings.erase) })).toHaveAttribute('aria-disabled', 'true');
  });
});

