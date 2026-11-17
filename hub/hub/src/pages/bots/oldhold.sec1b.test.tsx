// Vitest: a change the previous build left unresolved is held under that build's id (its
// definition named no lockKey, so the id is the digest of the whole variables). This build's LOCK_KEYS move
// the id of saveSettings and keyChange, so core admission alone would not find that hold. The page still
// shows the change as pending, because a page reads its lock scope-wide (isPending(scope)): Settings offers
// Check again instead of Save, choosing a model sends nothing, the key drawer's Save stays disabled, and
// only the person's Stop tracking frees it.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawers' URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, renderHook, screen, userEvent, waitFor, within } from '@app/testing';
import { CoreQueryProvider, queryClient, useLockedChange } from '@core';
import { bump } from '@core/ctx';
import { installTransport, startFixtureMode, type Transport } from '@core/transport';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { changeId, registerTargets, useKeyChange, useMintKey, useSaveGuardrails, useSaveSettings, type BotView, type LinkKey, type ModelRow } from './data';
import { KeyDrawer } from './parts/LinkDrawers';
import { SettingsDrawer } from './parts/SettingsDrawer';
import strings from './strings.en.json';

const BOT_KEY = 'c1~global~chief';
const ctx = { botKey: BOT_KEY, uid: 'u-chief' };
const LINK = 'link-1';

let sent: string[] = [];
// The provider reports its status and both models are on the ready list: the kit chooser reads Model B as ready.
const AGENT_PROVIDERS = { providers: [{ id: 'p', prefix: 'p/', display_name: 'P', status: { state: 'ready', via: 'stored_key', methods: [] } }] };
const AGENT_MODELS = { models: [{ spec: 'p/a', display_name: 'Model A' }, { spec: 'p/b', display_name: 'Model B' }] };
// A live transport (not the fixture one): the page's changes take the locked path, as on a real page.
const live: Transport = {
  hoody(method, url) {
    sent.push(`${method} ${url}`);
    return Promise.resolve({ data: {} });
  },
  fetch(url, init) {
    sent.push(`${init.method ?? 'GET'} ${url}`);
    // The model picker reads the Bot computer's providers and models.
    const path = new URL(String(url), 'http://x').pathname;
    const body = path.endsWith('/providers') ? AGENT_PROVIDERS : path.endsWith('/models') ? AGENT_MODELS : {};
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
  },
};

const wrap = ({ children }: { children: ReactNode }) => <CoreQueryProvider>{children}</CoreQueryProvider>;

/** What the previous build wrote: the same change id, no lockKey (so the whole variables are the identity), an unknown answer. */
async function holdFromPreviousBuild(key: 'saveSettings' | 'keyChange', idCtx: Record<string, unknown>, vars: Record<string, unknown>): Promise<void> {
  const unknown = () => Promise.reject({ kind: 'pending' });
  const h = renderHook(() => useLockedChange(unknown, [], changeId(key, idCtx), { realm: true }), { wrapper: wrap });
  const r = await act(() => h.result.current.run(vars));
  expect(r.outcome).toBe('pending');
  h.unmount();
}

const bot = {
  key: BOT_KEY, id: 'chief', uid: 'u-chief', name: 'Chief', role: '', instructions: '', model: 'p/a', modelLabel: 'A',
  provider: { id: 'p', label: 'P', ready: 'ready' }, yolo: false, gate: null, turnRunning: false, turnId: null, sessionModel: null,
  pausedAtLimit: false, queued: 0, tasksOpen: 0, allowedComputers: null, allowedAgents: null, guardrails: [], guardrailCheck: 'off',
  guardrailRevision: 1, checkerOk: true, routing: 'off', async: false, waitSeconds: 0, realtimeMaxItems: 0,
  speech: { enabled: false, ready: null, why: null, config: null }, workers: { known: true, backend: 'llm', allowed: ['llm'], agent: '', model: '' }, caps: { botExpect: true, botGateHttp: true, botTurnCancel: true }, attention: [], createdAt: '',
} as BotView;
const models: ModelRow[] = [
  { spec: 'p/a', label: 'Model A', provider: 'p', providerLabel: 'P', source: 'provider', ready: 'ready', computerDefault: false },
  { spec: 'p/b', label: 'Model B', provider: 'p', providerLabel: 'P', source: 'provider', ready: 'ready', computerDefault: false },
];
const key: LinkKey = { id: 'k1', name: 'default', prefix: 'hk_', enabled: true, allowlist: [], expiresAt: null, notes: '', holderNote: '', createdAt: '', rotatedAt: null };

function Settings({ section }: { section: 'model' | 'behaviour' }) {
  const save = useSaveSettings(ctx);
  const saveRules = useSaveGuardrails(ctx);
  return <SettingsDrawer section={section} onSection={() => undefined} onClose={() => undefined} bot={bot} models={models} computers={[]} save={save} saveRules={saveRules} />;
}
function Keys() {
  const mint = useMintKey(LINK);
  const edit = useKeyChange(LINK);
  return <KeyDrawer open onClose={() => undefined} editing={key} mint={mint} edit={edit} />;
}
// The drawers read the URL (the model list's search), so they render under a router, as on the page.
async function show(ui: ReactNode): Promise<void> {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <>{ui}</> }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
}
/** The writes sent (the drawers' own reads, such as the key form's IP lookup, are not changes). */
const writes = () => sent.filter((c) => !c.startsWith('GET '));
/** Lets a press that was not refused reach the transport (its admission digests and locks asynchronously). */
const settle = () => act(() => new Promise<void>((r) => { setTimeout(r, 200); }));

beforeEach(() => {
  bump('test-boot');
  startFixtureMode([], { realm: 'global', target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 's1' } } });
  installTransport(live);
  // The Bot's computer has an address, so a freed change reaches the transport.
  registerTargets([{ id: 'c1', project_id: 'p1', server_name: 's1' }]);
  queryClient.clear();
  sent = [];
});
afterEach(() => {
  cleanup();
  installTransport(null);
});

describe("a previous build's unresolved save holds the page under this build's lockKey", () => {
  it('Behaviour shows Check again, not Save, and sends nothing', async () => {
    await holdFromPreviousBuild('saveSettings', ctx, { ...ctx, patch: { name: 'Old', role: '', instructions: '', yolo: false } });
    await show(<Settings section="behaviour" />);
    expect(await screen.findByRole('button', { name: 'Check again' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(writes()).toEqual([]);
  });

  it('choosing another model returns early: nothing is sent', async () => {
    await holdFromPreviousBuild('saveSettings', ctx, { ...ctx, patch: { model: 'p/a' } });
    await show(<Settings section="model" />);
    expect(await screen.findByText(strings['settings.maybe'])).toBeTruthy();
    await userEvent.click(await screen.findByRole('option', { name: /Model B/ }, { timeout: 8000 }));
    await settle();
    expect(writes()).toEqual([]);
  });

  it("the key drawer's Save stays disabled under an old edit hold", async () => {
    await holdFromPreviousBuild('keyChange', { linkId: LINK }, { linkId: LINK, keyId: 'k1', action: 'edit', fields: { name: 'old', allowlist: [], expiresAt: null, notes: '' } });
    await show(<Keys />);
    expect(await screen.findByText(strings['keyForm.editMaybe'])).toBeTruthy();
    expect((screen.getByRole('button', { name: strings['ui.save'] }) as HTMLButtonElement).disabled).toBe(true);
    expect(writes()).toEqual([]);
  });

  it("Stop tracking frees it: the model choice then sends one PATCH", async () => {
    await holdFromPreviousBuild('saveSettings', ctx, { ...ctx, patch: { model: 'p/a' } });
    await show(<Settings section="model" />);
    const banner = (await screen.findByText(strings['settings.maybe'])).closest('[role="alert"]') as HTMLElement;
    // The banner's close is the warned Stop tracking: it asks first, and only "Stop tracking anyway" frees the change.
    await userEvent.click(within(banner).getByRole('button', { name: 'Stop tracking' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Stop tracking anyway' }));
    await waitFor(() => expect(screen.queryByText(strings['settings.maybe'])).toBeNull());
    await userEvent.click(await screen.findByRole('option', { name: /Model B/ }, { timeout: 8000 }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatch(/^PATCH /);
  });
});
