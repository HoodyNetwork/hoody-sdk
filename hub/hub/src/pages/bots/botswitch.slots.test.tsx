// Vitest: the Bot pane stays mounted across a Bot change, and so do its change hooks; each keeps its own answer per change
// (useChange's slots), so what a hook alone knows comes back with its Bot, and a late answer never lands on another one.
// - A Guardrails save whose rules write lost its answer (the PATCH answered, the PUT did not): guardrailsFlow answers done
//   with rules 'unknown', so core holds nothing and the hook's answer is the only record that the rules may not be saved.
//   Another Bot's drawer does not say it; the first Bot's drawer says it again when that Bot is picked back.
// - A rotated key: its secret is kept only while its link is on screen; back on it the outcome is there, the key is not.
//   A rotate answered after the person moved to another link changes nothing of that link's own answer.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, renderHook, screen, userEvent, waitFor } from '@app/testing';
import { CoreQueryProvider, queryClient } from '@core';
import { bump } from '@core/ctx';
import { installTransport, startFixtureMode, type Transport } from '@core/transport';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerTargets, useRotateKey, useSaveGuardrails, useSaveSettings, type BotView, type Computer } from './data';
import { SettingsDrawer } from './parts/SettingsDrawer';
import strings from './strings.en.json';

const comp = (id: string, name: string): Computer => ({ id, name, server: `srv-${id}`, flag: '🇸🇬', state: 'running', listState: 'ok', suspended: 0, hasMore: false });
const computers: Computer[] = [comp('c1', 'Atlas')];
const botOf = (id: string, name: string): BotView =>
  ({
    key: `c1~global~${id}`, id, uid: `u-${id}`, name, role: '', instructions: '', model: 'p/a', modelLabel: 'A',
    provider: { id: 'p', label: 'P', ready: 'ready' }, yolo: false, gate: null, turnRunning: false, turnId: null, sessionModel: null,
    pausedAtLimit: false, queued: 0, tasksOpen: 0, allowedComputers: null, allowedAgents: null, guardrails: [], guardrailCheck: 'off',
    guardrailRevision: 5, checkerOk: true, routing: 'off', async: false, waitSeconds: 0, realtimeMaxItems: 0,
    speech: { enabled: false, ready: null, why: null, config: null }, workers: { known: true, backend: 'llm', allowed: ['llm'], agent: '', model: '' }, caps: { botExpect: true, botGateHttp: true, botTurnCancel: true }, attention: [], createdAt: '',
  }) as BotView;
const CHIEF = botOf('chief', 'Chief');
const SUPPORT = botOf('support', 'Support');

type Sent = { method: string; path: string };
let sent: Sent[] = [];
// A rotate's answer: each link's own (fake) key. A gate may hold one link's answer back.
const SECRET = { one: 'hbk_TEST_one_0000000000000000', two: 'hbk_TEST_two_0000000000000000' };
const rotated = (link: 'one' | 'two') => ({ data: { key: { id: `bk_${link}`, name: `key ${link}` }, secret: SECRET[link], curl: `curl -H 'Authorization: Bearer ${SECRET[link]}'` } });
let gate: { link: string; wait: Promise<void>; open: () => void } | null = null;
const holdLink = (link: string) => {
  let open = (): void => undefined;
  const wait = new Promise<void>((go) => { open = () => go(); });
  gate = { link, wait, open };
};
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
// A live transport (not the fixture one): the change takes the locked path, as on a real page. Every PATCH lands; every
// rules PUT loses its answer (502: it may have been applied); a key rotate answers its link's key.
const live: Transport = {
  async hoody(_method, url) {
    const link = /\/bot-urls\/link-(one|two)\/keys\/[^/]+\/rotate/.exec(url)?.[1] as 'one' | 'two' | undefined;
    if (!link) return { data: {} };
    if (gate?.link === `link-${link}`) await gate.wait;
    return rotated(link);
  },
  fetch(url, init) {
    const method = init.method ?? 'GET';
    if (method === 'GET') return json({});
    sent.push({ method, path: new URL(String(url), 'http://x').pathname });
    return method === 'PUT' ? json({}, 502) : json({ revision: 6 });
  },
};

let pick: (b: BotView) => void = () => undefined;
// The pane's shape: one mounted pair of save hooks whose context follows the Bot on screen.
function Pane() {
  const [b, setB] = useState<BotView>(CHIEF);
  pick = setB;
  const ctx = { botKey: b.key, uid: b.uid };
  const save = useSaveSettings(ctx);
  const saveRules = useSaveGuardrails(ctx);
  return <SettingsDrawer section="guardrails" onSection={() => undefined} onClose={() => undefined} bot={b} models={[]} computers={computers} save={save} saveRules={saveRules} />;
}
async function show(ui: ReactNode): Promise<void> {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <>{ui}</> }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
}
const unknown = () => screen.queryByText(strings['settings.rules.unknown.title']);
// The drawer of that Bot is on screen (its title names it; findAll: the title may be drawn more than once).
const titled = async (name: string) => expect((await screen.findAllByText(strings['settings.title'].replace('{{name}}', name))).length).toBeGreaterThan(0);

beforeEach(() => {
  bump('test-boot');
  startFixtureMode([], { realm: 'global', target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 's1' } } });
  installTransport(live);
  registerTargets([{ id: 'c1', project_id: 'p1', server_name: 's1' }]);
  queryClient.clear();
  sent = [];
});
afterEach(() => {
  gate?.open();
  gate = null;
  cleanup();
  installTransport(null);
});
const wrap = ({ children }: { children: ReactNode }) => <CoreQueryProvider>{children}</CoreQueryProvider>;

describe('Guardrails: rules that may not be saved, then another Bot', () => {
  it('says so on its own Bot only, and again when that Bot comes back', async () => {
    await show(<Pane />);
    await userEvent.click(await screen.findByRole('textbox', { name: strings['guard.rules'] }));
    await userEvent.keyboard('Never deploy on Fridays');
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));
    // The control: the mode landed, the rules write lost its answer, and Chief's drawer says the rules may not be saved.
    expect(await screen.findByText(strings['settings.rules.unknown.title'], undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(sent.map((s) => s.method)).toEqual(['PATCH', 'PUT']);
    expect(sent[0]?.path).toMatch(/\/bots\/chief$/);

    // Support: its drawer is on screen, and it does not say Chief's rules may not be saved.
    await act(async () => pick(SUPPORT));
    await titled('Support');
    await waitFor(() => expect(unknown()).toBeNull());

    // Chief again: the warning is back (nothing in core holds it; the hook kept Chief's answer).
    await act(async () => pick(CHIEF));
    await titled('Chief');
    expect(await screen.findByText(strings['settings.rules.unknown.title'])).toBeInTheDocument();
    // Nothing was sent by the round trip.
    expect(sent.map((s) => s.method)).toEqual(['PATCH', 'PUT']);
  }, 30000);
});

describe('a rotated key, then another link', () => {
  it('is kept only while its link is on screen: back on it, the outcome is there and the key is not', async () => {
    const h = renderHook(({ link }: { link: string }) => useRotateKey(link), { wrapper: wrap, initialProps: { link: 'link-one' } });
    await act(async () => { await h.result.current.run({ keyId: 'bk_one' }); });
    // The control: on its own link the answer holds the new key.
    expect(h.result.current.outcome).toBe('done');
    expect(h.result.current.data?.secret).toBe(SECRET.one);
    h.rerender({ link: 'link-two' });
    expect(h.result.current.outcome).toBe('idle');
    expect(h.result.current.data).toBeUndefined();
    h.rerender({ link: 'link-one' });
    expect(h.result.current.outcome).toBe('done');
    expect(h.result.current.data).toBeUndefined();
  });

  it("a late answer for the link left lands in that link's slot: the link on screen keeps its own key", async () => {
    const h = renderHook(({ link }: { link: string }) => useRotateKey(link), { wrapper: wrap, initialProps: { link: 'link-one' } });
    holdLink('link-one');
    let first!: Promise<unknown>;
    act(() => { first = h.result.current.run({ keyId: 'bk_one' }); });
    h.rerender({ link: 'link-two' });
    await act(async () => { await h.result.current.run({ keyId: 'bk_two' }); });
    expect(h.result.current.data?.secret).toBe(SECRET.two);
    // link-one's answer lands now, with link-two on screen.
    await act(async () => { gate?.open(); await first; });
    expect(h.result.current.outcome).toBe('done');
    expect(h.result.current.data?.secret).toBe(SECRET.two);
    // Back on link-one: its rotate is done, and its key (answered while it was off screen) was never kept.
    h.rerender({ link: 'link-one' });
    expect(h.result.current.outcome).toBe('done');
    expect(h.result.current.data).toBeUndefined();
  });
});
