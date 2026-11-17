// Vitest, mounted on core's real change source (as page.delete.order.test.tsx): the delete of a script turns off only the public links
// Exec answers with that script. A link whose target the file's pattern matches but Exec resolves to a sibling (static
// beats dynamic: users/me.ts beside users/[id].ts; users.ts beside users/index.ts) stays on. Each matching link is resolved at the press;
// a resolve that does not answer, or a link change while the resolves were out, stops the delete with nothing changed.
import { aliasLock, CoreQueryProvider, queryClient, sendingChanges } from '@core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTarget } from '@core/ctx';
import { boot, calls, onFetch, R1, settle, TARGET, type Call, type Reply } from '@core/test/env';

const world = vi.hoisted(() => ({
  // Target path -> the file Exec answers it with ('' = no script answers; 500 = the resolve fails).
  answers: {} as Record<string, string | 500>,
  toasts: [] as Array<{ title: string; tone?: string }>,
  // Called once at the first resolve (the shell moving on while the delete runs).
  onResolve: null as null | (() => void),
  // The computer's links as the page reads them (set by the host below).
  setAliases: null as null | ((rows: unknown[]) => void),
  // An alias change that never answers (another view's, still out).
  hang: '' as string,
  // A link being made (POST /proxy/aliases) that never answers.
  hangCreate: false,
  unmount: null as null | (() => void),
  // The links read again from the computer after the resolves (null = core's own read; no page holds it here, so 'none').
  fresh: null as null | { state: 'fresh' | 'failed'; rows?: unknown[] },
}));
vi.mock('@core', async (orig) => {
  const m = await orig<Record<string, unknown>>();
  const real = m.refreshFresh as (...a: unknown[]) => Promise<unknown>;
  return { ...m, refreshFresh: (...a: unknown[]) => (world.fresh ? Promise.resolve({ state: world.fresh.state, answers: world.fresh.state === 'fresh' ? [{ key: [], data: { data: { aliases: world.fresh.rows } } }] : [] }) : real(...a)) };
});
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: { title: string; tone?: string }) => { world.toasts.push(c); return 'toast-1'; } }));
vi.mock('./data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useFile: () => ({ data: { revision: 'r1', content: 'export default 1;\n' }, refetch: async () => undefined }),
  useEnv: () => ({ data: undefined, refetch: async () => undefined }),
  useTests: () => ({ data: { revision: null, cases: [] }, refetch: async () => undefined }),
}));

import { useAliasCreate, useAliasState } from './data';
import { SettingsTab } from './parts/SettingsTab';
import strings from './strings.en.json';

const dyn = { id: 'atlas.1111~users/[id].ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: 'default/1/users/[id].ts', name: 'users/[id]', route: '/users/:id', pattern: '/users/:id', served: true, description: '', status: 'working', schedule: null, keyed: false, calls: 0, failed: 0, managed: null, ownershipUnknown: false, group: 'ok' } as never;
const stat = { ...(dyn as object), id: 'atlas.1111~users.ts', path: 'default/1/users.ts', name: 'users', route: '/users', pattern: '/users' } as never;
const B = { ...TARGET, container: { id: 'c2', server_name: 'sv1' } };
const link = (id: string, target_path: string, enabled = true) => ({ id, url: `https://${id}.example`, target_path, enabled, program: 'exec', index: 1 });
const comp = (aliases: unknown[]) => ({ id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', caps: { revisions: true, history: true, env: true, executions: true, tests: false, publishable: true }, agent: { templates: true, writer: true, guardedDelete: true }, agentRealm: null, ownerRealm: R1, instances: {}, rows: [], summary: {}, aliases, deleted: [] } as never);
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };
const reply = (c: Call): Reply | Promise<Reply> => {
  if (c.url.includes('/exec/route/resolve')) {
    const once = world.onResolve;
    world.onResolve = null;
    once?.();
    // Another view's change started here is out (core lists it) before this resolve answers.
    if (once && (world.hang || world.hangCreate)) return (async (): Promise<Reply> => {
      for (let i = 0; i < 200 && sendingChanges(aliasLock.lock).length === 0; i++) await new Promise((r) => setTimeout(r, 5));
      return reply({ ...c, url: c.url });
    })();
    const a = world.answers[String((c.body as { path?: unknown } | undefined)?.path)];
    if (a === 500) return { status: 500, body: { error: { code: 'INTERNAL' } } };
    return { status: 200, body: a ? { matched: true, scriptPath: a, type: a.includes('[') ? 'dynamic' : 'static' } : { matched: false } };
  }
  if (world.hangCreate && c.method === 'POST' && /\/proxy\/aliases(\?|$)/.test(c.url)) return new Promise<Reply>(() => undefined);
  if (world.hang && c.url.includes(`/proxy/aliases/${world.hang}/`)) return new Promise<Reply>(() => undefined);
  if (c.url.includes('/exec/scripts/list')) return { status: 200, body: { scripts: [{ path: 'default/1/users/[id].ts' }] } };
  return { status: 200, body: { data: {} } };
};
// The changes the delete sent, in order (a resolve changes nothing and is listed apart).
const sent = () => calls.filter((c) => c.method !== 'GET' && !c.url.includes('/route/resolve')).map((c) => (c.url.includes('/proxy/aliases/') ? `alias:${c.url.split('/aliases/')[1]}:${JSON.stringify(c.body)}` : c.url.includes('/scripts/delete') ? 'remove' : c.url));
const resolved = () => calls.filter((c) => c.url.includes('/route/resolve')).map((c) => String((c.body as { path?: unknown }).path));
let other: ReturnType<typeof useAliasState> | undefined;
let making: ReturnType<typeof useAliasCreate> | undefined;
function Host({ item, initial }: { item: unknown; initial: unknown[] }) {
  const [rows, setRows] = useState(initial);
  world.setAliases = setRows;
  other = useAliasState();
  making = useAliasCreate();
  return <SettingsTab item={item as never} comp={comp(rows)} onChanged={() => undefined} onDeleted={() => undefined} />;
}
const mount = (item: unknown, aliases: unknown[]) => {
  const r = render(<Host item={item} initial={aliases} />, { wrapper: CoreQueryProvider });
  world.unmount = r.unmount;
  return r;
};
const click = async (name: string) => { await act(async () => { fireEvent.click(await screen.findByRole('button', { name })); await flush(); }); };
const deleteIt = async () => { await click(strings['delete.action']); await click(strings['delete.confirm']); };
// The delete has ended when it says why it stopped (a resolve that waited for another view's change answers later than a flush).
const stopped = async () => { await act(async () => { await vi.waitFor(() => expect(world.toasts.map((x) => x.title)).toContain(strings['delete.linksUnchecked']), { timeout: 4000 }); await flush(); }); };

describe("a dynamic script's delete turns off only the links Exec answers with it", () => {
  beforeEach(() => {
    boot({ realm: R1 });
    queryClient.clear();
    calls.length = 0;
    world.answers = {};
    world.toasts.length = 0;
    world.onResolve = null;
    world.setAliases = null;
    world.hang = '';
    world.hangCreate = false;
    world.unmount = null;
    world.fresh = null;
    onFetch(reply);
    setTarget(TARGET);
  });

  it("a link a sibling answers stays on; the script's own link and one nobody answers go off, then the script is deleted", async () => {
    world.answers = { '/users/me': 'default/1/users/me.ts', '/users/42': 'default/1/users/[id].ts', '/users/7': '' };
    mount(dyn, [link('al1', '/users/me'), link('al2', '/users/42?x=1'), link('al3', '/users/7'), link('al4', '/users/9', false), link('al5', '/other')]);
    await deleteIt();
    // Only the enabled links the pattern matches are asked about; a link already off and one the pattern misses are not.
    expect(resolved().sort()).toEqual(['/users/42', '/users/7', '/users/me']);
    expect(sent()).toEqual(['alias:al2/state:{"enabled":false}', 'alias:al3/state:{"enabled":false}', 'remove']);
  });

  it('a resolve that does not answer stops the delete before anything changes, and says so', async () => {
    world.answers = { '/users/me': 500, '/users/42': 'default/1/users/[id].ts' };
    mount(dyn, [link('al1', '/users/42'), link('al2', '/users/me')]);
    await deleteIt();
    expect(sent()).toEqual([]);
    expect(world.toasts.map((x) => x.title)).toContain(strings['delete.linksUnchecked']);
  });

  it('every resolve goes to the computer the delete was confirmed on, even when the shell moves on between them', async () => {
    world.answers = { '/users/42': 'default/1/users/[id].ts', '/users/me': 'default/1/users/me.ts' };
    world.onResolve = () => setTarget(B);
    mount(dyn, [link('al1', '/users/42'), link('al2', '/users/me')]);
    await deleteIt();
    const urls = calls.filter((c) => c.url.includes('/route/resolve')).map((c) => c.url);
    expect(urls.length).toBe(2);
    for (const u of urls) {
      expect(u).toContain('p1-c1-');
      expect(u).not.toContain('p1-c2-');
    }
  });

  it("a static script's links are resolved too: one a sibling answers stays on (users.ts beside users/index.ts)", async () => {
    world.answers = { '/users': 'default/1/users/index.ts', '/users.ts': 'default/1/users.ts' };
    mount(stat, [link('al1', '/users'), link('al2', '/users.ts')]);
    await deleteIt();
    expect(resolved().sort()).toEqual(['/users', '/users.ts']);
    expect(sent()).toEqual(['alias:al2/state:{"enabled":false}', 'remove']);
  });

  it('a matching link made while the resolves were out stops the delete: it was never resolved', async () => {
    world.answers = { '/users/42': 'default/1/users/[id].ts' };
    world.onResolve = () => world.setAliases?.([link('al1', '/users/42'), link('al9', '/users/43')]);
    mount(dyn, [link('al1', '/users/42')]);
    await deleteIt();
    expect(sent()).toEqual([]);
    expect(world.toasts.map((x) => x.title)).toContain(strings['delete.linksUnchecked']);
  });

  it("a change to one of the script's links still out from another view while the resolves were out stops the delete", async () => {
    world.answers = { '/users/42': 'default/1/users/[id].ts' };
    world.hang = 'al1';
    world.onResolve = () => void other?.mutateAsync({ id: 'al1', enabled: true });
    mount(dyn, [link('al1', '/users/42')]);
    await deleteIt();
    await stopped();
    // Only the other view's change left (it never answers); nothing of the delete.
    expect(sent()).toEqual(['alias:al1/state:{"enabled":true}']);
    expect(world.toasts.map((x) => x.title)).toContain(strings['delete.linksUnchecked']);
  });

  it('a link being made for a path this script answers, still out while the resolves were out, stops the delete', async () => {
    world.answers = { '/users/42': 'default/1/users/[id].ts' };
    world.hangCreate = true;
    world.onResolve = () => void making?.mutateAsync({ compId: 'c1', target: '/users/43', exec: 1 });
    mount(dyn, [link('al1', '/users/42')]);
    await deleteIt();
    await stopped();
    expect(sent().filter((x) => x === 'remove' || x.startsWith('alias:'))).toEqual([]);
    expect(world.toasts.map((x) => x.title)).toContain(strings['delete.linksUnchecked']);
  });

  it('a delete whose tab closed while its resolves were out stops: its links can no longer be read', async () => {
    world.answers = { '/users/42': 'default/1/users/[id].ts' };
    world.onResolve = () => world.unmount?.();
    mount(dyn, [link('al1', '/users/42')]);
    await deleteIt();
    expect(sent()).toEqual([]);
    expect(world.toasts.map((x) => x.title)).toContain(strings['delete.linksUnchecked']);
  });

  it("the links are read again from the computer after the resolves: one made since the press that the page has not shown stops the delete", async () => {
    world.answers = { '/users/42': 'default/1/users/[id].ts' };
    world.fresh = { state: 'fresh', rows: [link('al1', '/users/42'), link('al9', '/users/43')] };
    mount(dyn, [link('al1', '/users/42')]);
    await deleteIt();
    expect(sent()).toEqual([]);
    expect(world.toasts.map((x) => x.title)).toContain(strings['delete.linksUnchecked']);
  });

  it('a fresh read that answers the same links lets the delete go on; one that fails stops it', async () => {
    world.answers = { '/users/42': 'default/1/users/[id].ts' };
    world.fresh = { state: 'fresh', rows: [link('al1', '/users/42')] };
    const r = mount(dyn, [link('al1', '/users/42')]);
    await deleteIt();
    expect(sent()).toEqual(['alias:al1/state:{"enabled":false}', 'remove']);
    r.unmount();
    calls.length = 0;
    world.toasts.length = 0;
    world.fresh = { state: 'failed' };
    mount({ ...(dyn as object), id: 'atlas.1111~users/[n].ts', path: 'default/1/users/[n].ts' }, [link('al1', '/users/42')]);
    world.answers = { '/users/42': 'default/1/users/[n].ts' };
    await deleteIt();
    expect(sent()).toEqual([]);
    expect(world.toasts.map((x) => x.title)).toContain(strings['delete.linksUnchecked']);
  });

  it('a script the page shows with no enabled link is checked too: a link the fresh read shows stops the delete', async () => {
    world.fresh = { state: 'fresh', rows: [link('al9', '/users/43')] };
    mount(dyn, [link('al1', '/users/42', false)]);
    await deleteIt();
    expect(resolved()).toEqual([]);
    expect(sent()).toEqual([]);
    expect(world.toasts.map((x) => x.title)).toContain(strings['delete.linksUnchecked']);
  });
});
