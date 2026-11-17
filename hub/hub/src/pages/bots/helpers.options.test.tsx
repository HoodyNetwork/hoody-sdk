// Vitest on a live page: Settings > Helpers offers the helper options the agent takes (capability
// bot_worker_options): a Hoody-model helper's model and thinking, used when no Routing tier applies, and a Claude Code helper's effort.
// Each saves with the section's one PATCH; an agent that does not report them gets the old words and sends none of them.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, userEvent, within } from '@app/testing';
import { renderHook } from '@testing-library/react';
import { CoreQueryProvider, queryClient } from '@core';
import { boot, onFetch, settle, type Call, type Reply } from '@core/test/env';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BotView, Change, GuardrailsResult, ModelRow, RoutingSet, SavedSettings, SettingsPatch, Workers } from './data';
import { registerTargets, useBotModelLabel, useBotModelLabels, workersOf } from './data';
import { workersPatch, workersFormOf, workersRefusalKey } from './logic';
import type { SettingsSection } from './logic';
import { SettingsDrawer } from './parts/SettingsDrawer';
import strings from './strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const KEY = `c1~${R1}~chief`;
const llmOnly: Workers = { known: true, backend: 'llm', allowed: ['llm'], agent: '', model: '' };
const both: Workers = { known: true, backend: 'llm', allowed: ['llm', 'acp'], agent: 'claude', model: '' };
const opts = (w: Workers, model = '', thinking: '' | 'high' | 'on' = '', effort: '' | 'high' = ''): Workers => ({ ...w, options: { model, thinking, effort } });
const OFF: RoutingSet = { mode: 'off', light: null, heavy: null };
const botWith = (workers: Workers, extra: Partial<BotView> = {}): BotView =>
  ({
    key: KEY, id: 'chief', uid: 'u-chief', name: 'Chief', role: '', instructions: '', model: 'p/a', modelLabel: 'A',
    provider: { id: 'p', label: 'P', ready: 'ready' }, yolo: false, gate: null, turnRunning: false, turnId: null, sessionModel: null,
    pausedAtLimit: false, queued: 0, tasksOpen: 0, allowedComputers: null, allowedAgents: null, guardrails: [], guardrailCheck: 'off',
    guardrailRevision: 6, checkerOk: true, routing: 'off', routingSet: OFF, async: false, waitSeconds: 0, realtimeMaxItems: 0,
    speech: { enabled: false, ready: null, why: null, config: null }, workers, caps: { botExpect: true, botGateHttp: true, botTurnCancel: true }, attention: [], createdAt: '',
    ...extra,
  }) as BotView;

const row = (spec: string, label: string, reasoning = false): ModelRow => ({ spec, label, provider: spec.split('/')[0] ?? '', providerLabel: spec.split('/')[0] ?? '', source: 'provider', ready: 'ready', computerDefault: false, reasoning });
const MODELS: ModelRow[] = [
  row('hoody-ai/hoody-free', 'Hoody Free'),
  row('acme/swift-1', 'Swift 1'),
  row('acme/deep-9', 'Deep 9', true),
  { ...row('fusion/council', 'Council'), source: 'fusion' },
];

type Sent = { patch: SettingsPatch; uid?: string; revision?: number };
let sent: Sent[] = [];
let shown: { outcome: 'idle' | 'failed'; code?: string; details?: Record<string, unknown> } = { outcome: 'idle' };
const saveChange = (): Change<SavedSettings, Sent> =>
  ({
    run: async (v: Sent) => { sent.push(v); return { outcome: 'done' as const }; },
    outcome: shown.outcome, data: undefined, code: shown.code, details: shown.details, idem: undefined, running: false,
    readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
  }) as unknown as Change<SavedSettings, Sent>;
const rules = { run: async () => ({ outcome: 'done' as const }), outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false, readBack: async () => true, dismiss: () => undefined, reset: () => undefined } as unknown as Change<GuardrailsResult, never>;

const AGENTS = { items: [
  { name: 'general', model: 'acme/swift-1', is_configured_default: true },
  { name: 'bot', model: '' },
  { name: 'research', model: 'acme/deep-9' },
  { name: 'writer', model: '' },
], meta: { total: 4 } };
const ACP = { report: { agents: [{ name: 'claude', enabled: true, startable: true }] }, claude_code: { models: [{ id: 'claude-opus-5-5', label: 'Opus 5.5' }], aliases: ['sonnet'], efforts: ['low', 'high'] } };
// The Bot computer's catalogue: the helper lists offer what it can run now. nokey/big-1 needs a key, so it is never offered.
const ST = (state: string) => ({ state, via: state === 'ready' ? 'stored_key' : null, methods: ['api_key'], alternatives: {}, output_cap: true, shares_with: [] });
const CAT_PROVIDERS = { providers: [
  { id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', status: ST('ready') },
  { id: 'acme', prefix: 'acme/', display_name: 'Acme', status: ST('ready') },
  { id: 'nokey', prefix: 'nokey/', display_name: 'NoKey', status: ST('needs_key') },
] };
const CAT_MODELS = { models: [
  { spec: 'hoody-ai/hoody-free', display_name: 'Hoody Free' },
  { spec: 'acme/swift-1', display_name: 'Swift 1' },
  { spec: 'acme/deep-9', display_name: 'Deep 9', reasoning: true },
  { spec: 'nokey/big-1', display_name: 'Big 1' },
  { spec: 'fusion/council', display_name: 'Council', source: 'fusion', members: ['acme/swift-1'] },
] };
const CAT_READY = { models: ['hoody-ai/hoody-free', 'acme/swift-1', 'acme/deep-9', 'fusion/council'].map((spec) => ({ spec })) };
let catalogueFails = false;
let answer: (c: Call) => Reply | undefined = () => undefined;
const serve = (c: Call): Reply => {
  const mine = answer(c);
  if (mine) return mine;
  if (/\/acp\/agents(\?|$)/.test(c.url)) return { status: 200, body: ACP };
  if (/\/agents(\?|$)/.test(c.url)) return { status: 200, body: AGENTS };
  if (/\/providers(\?|$)/.test(c.url)) return catalogueFails ? { status: 500, body: {} } : { status: 200, body: CAT_PROVIDERS };
  if (/\/models(\?|$)/.test(c.url)) return catalogueFails ? { status: 500, body: {} } : { status: 200, body: /[?&]ready=true/.test(c.url) ? CAT_READY : CAT_MODELS };
  return { status: 200, body: { data: {} } };
};

const flush = async () => {
  for (let i = 0; i < 10; i++) await act(async () => { await settle(); });
};
let section: SettingsSection = 'workers';
function Holder({ first }: { first: BotView }) {
  const [bot] = useState(first);
  return <SettingsDrawer section={section} onSection={(x) => { section = x; }} onClose={() => undefined} bot={bot} models={MODELS} computers={[]} save={saveChange()} saveRules={rules as never} />;
}
async function show(bot: BotView, at: SettingsSection = 'workers'): Promise<void> {
  section = at;
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <Holder first={bot} /> }),
    history: createMemoryHistory({ initialEntries: ['/bots'] }),
  });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
  await flush();
}
beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  sent = [];
  shown = { outcome: 'idle' };
  answer = () => undefined;
  catalogueFails = false;
  onFetch(serve);
  registerTargets([{ id: 'c1', project_id: 'p1', server_name: 'sv1' }]);
});
afterEach(() => cleanup());

const save = () => screen.getByRole('button', { name: /^Save/ });
const kind = (title: string) => screen.getByRole('group', { name: title });
const helperModel = () => screen.getByRole('combobox', { name: new RegExp(`^${strings['workers.hModel']}`) });

describe('an agent that does not report the options', () => {
  it('offers no helper model or effort picker and keeps the words on where the effort comes from', async () => {
    await show(botWith(both));
    expect(screen.queryByRole('combobox', { name: new RegExp(`^${strings['workers.hModel']}`) })).toBeNull();
    expect(within(kind(strings['workers.acp.title'])).getByText(strings['workers.effort'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: new RegExp(strings['workers.effortPick']) })).toBeNull();
  });
});

describe('the Hoody-model helper model', () => {
  it('offers what the Bot computer can run now: never a model that needs a key, never an ensemble', async () => {
    await show(botWith(opts(llmOnly)));
    await userEvent.clear(helperModel());
    await userEvent.type(helperModel(), 'Swi');
    expect(await screen.findByRole('option', { name: 'Swift 1' })).toBeInTheDocument();
    await userEvent.clear(helperModel());
    await userEvent.type(helperModel(), 'Big');
    expect(screen.queryByRole('option', { name: 'Big 1' })).toBeNull();
    await userEvent.clear(helperModel());
    await userEvent.type(helperModel(), 'Coun');
    expect(screen.queryByRole('option', { name: 'Council' })).toBeNull();
  });

  it('a catalogue that cannot be read offers the held model and Hoody Free only, never the unscoped list', async () => {
    catalogueFails = true;
    await show(botWith(opts(llmOnly, 'acme/deep-9')));
    await userEvent.clear(helperModel());
    await userEvent.type(helperModel(), 'Swi');
    expect(screen.queryByRole('option', { name: 'Swift 1' })).toBeNull();
    await userEvent.clear(helperModel());
    await userEvent.type(helperModel(), 'Hoody');
    expect(await screen.findByRole('option', { name: 'Hoody Free' })).toBeInTheDocument();
  });

  it('picking a model sends worker_model alone and the words say helpers run on it', async () => {
    await show(botWith(opts(llmOnly)));
    await userEvent.clear(helperModel());
    await userEvent.type(helperModel(), 'Swi');
    await userEvent.click(await screen.findByRole('option', { name: 'Swift 1' }));
    expect(screen.queryByRole('button', { name: new RegExp(strings['workers.hThinking']) })).toBeNull(); // Swift 1 does not think
    expect(within(kind(strings['workers.llm.title'])).getByText(strings['workers.llm.runOnPicked'])).toBeInTheDocument();
    await userEvent.click(save());
    await flush();
    expect(sent).toEqual([{ patch: { worker_model: 'acme/swift-1' }, uid: 'u-chief', revision: 6 }]);
  });

  it('a model that thinks offers its thinking, sent with the model', async () => {
    await show(botWith(opts(llmOnly)));
    await userEvent.clear(helperModel());
    await userEvent.type(helperModel(), 'Dee');
    await userEvent.click(await screen.findByRole('option', { name: 'Deep 9' }));
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['workers.hThinking']) }));
    await userEvent.click(screen.getByRole('option', { name: strings['routing.thinking.high'] }));
    await userEvent.click(save());
    await flush();
    expect(sent[0]?.patch).toEqual({ worker_model: 'acme/deep-9', worker_thinking: 'high' });
  });

  it("picking the agent's own choice takes the model away and sends no thinking (the agent clears it with the model)", async () => {
    await show(botWith(opts(llmOnly, 'acme/deep-9', 'high')));
    expect(helperModel()).toHaveValue('Deep 9');
    await userEvent.clear(helperModel());
    await userEvent.click(await screen.findByRole('option', { name: strings['workers.hModel.own'] }));
    expect(helperModel()).toHaveValue(strings['workers.hModel.own']);
    expect(screen.queryByRole('button', { name: new RegExp(strings['workers.hThinking']) })).toBeNull();
    await userEvent.click(save());
    await flush();
    expect(sent[0]?.patch).toEqual({ worker_model: '' });
  });

  // Suggest: both tiers are drawn (under Off none; with Routing on the helper pick is not drawn).
  const tier = (t: 'light' | 'heavy') => screen.getByRole('combobox', { name: new RegExp(`^${strings[`routing.${t}`]}`) });
  const offers = async (box: HTMLElement, typed: string, name: string): Promise<boolean> => {
    await userEvent.clear(box);
    await userEvent.type(box, typed);
    const shown = screen.queryByRole('option', { name }) !== null;
    await userEvent.keyboard('{Escape}'); // close the list so the other fields are reachable again
    return shown;
  };
  it('a model only one tier holds (it needs a key) stays in that tier, never offered newly in the other', async () => {
    const r: RoutingSet = { mode: 'suggest', light: { model: 'nokey/big-1', thinking: '' }, heavy: { model: 'acme/deep-9', thinking: '' } };
    await show(botWith(opts(llmOnly), { routing: 'suggest', routingSet: r }));
    expect(tier('light')).toHaveValue('Big 1'); // the field holding it keeps it
    expect(await offers(tier('heavy'), 'Swi', 'Swift 1')).toBe(true); // the list itself is there
    expect(await offers(tier('heavy'), 'Big', 'Big 1')).toBe(false);
  });
  it('a model the helper pick holds (it needs a key) is never offered in the tiers', async () => {
    const r: RoutingSet = { mode: 'suggest', light: { model: 'acme/swift-1', thinking: '' }, heavy: { model: 'acme/deep-9', thinking: '' } };
    await show(botWith(opts(llmOnly, 'nokey/big-1'), { routing: 'suggest', routingSet: r }));
    expect(await offers(tier('light'), 'Dee', 'Deep 9')).toBe(true);
    expect(await offers(tier('light'), 'Big', 'Big 1')).toBe(false);
    expect(await offers(tier('heavy'), 'Big', 'Big 1')).toBe(false);
  });

  it('a held model the computer no longer lists is kept as it is, and nothing is sent untouched', async () => {
    await show(botWith(opts(llmOnly, 'gone/old-1')));
    expect(helperModel()).toHaveValue('old-1');
    expect(save()).toBeDisabled();
  });
});

describe('a Bot that follows the AI page: a failed agents refetch cannot tell', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <CoreQueryProvider>{children}</CoreQueryProvider>;
  const failAgents = () => {
    answer = (c) => (/\/agents(\?|$)/.test(c.url) && !/\/acp\//.test(c.url) ? { status: 500, body: {} } : undefined);
  };
  it('the chip drops a resolved name kept from an earlier read once a refetch fails', async () => {
    const hook = renderHook(() => useBotModelLabel(KEY, { model: '', modelLabel: '' }), { wrapper });
    await flush();
    expect(hook.result.current).toBe('Hoody Free (AI page)');
    failAgents();
    await act(async () => { await queryClient.refetchQueries(); });
    await flush();
    expect(hook.result.current).toBe(strings['model.botsDefault']);
  });
  it('the list cell does too', async () => {
    const rows = [{ key: KEY, model: '', modelLabel: '' }];
    const hook = renderHook(() => useBotModelLabels(rows), { wrapper });
    await flush();
    expect(hook.result.current?.[0]?.modelLabel).toBe('Hoody Free (AI page)');
    failAgents();
    await act(async () => { await queryClient.refetchQueries(); });
    await flush();
    expect(hook.result.current?.[0]?.modelLabel).toBe(strings['model.botsDefault']);
  });
});

describe('the Claude Code effort', () => {
  it('picking an effort sends worker_delegated_effort', async () => {
    await show(botWith(opts(both)));
    const acp = kind(strings['workers.acp.title']);
    expect(within(acp).queryByText(strings['workers.effort'])).toBeNull();
    await userEvent.click(within(acp).getByRole('button', { name: new RegExp(strings['workers.effortPick']) }));
    await userEvent.click(screen.getByRole('option', { name: strings['routing.thinking.high'] }));
    await userEvent.click(save());
    await flush();
    expect(sent[0]?.patch).toEqual({ worker_delegated_effort: 'high' });
  });

  it('taking Claude Code away leaves its effort alone', async () => {
    await show(botWith(opts(both, '', '', 'high')));
    await userEvent.click(screen.getByRole('switch', { name: /^Claude Code/ }));
    await userEvent.click(save());
    await flush();
    expect(sent[0]?.patch).toEqual({ allowed_worker_backends: ['llm'] });
  });
});

describe('reading and refusals', () => {
  it('a Bot read carries the options only when all three are the agent\'s words', () => {
    const raw = { worker_backend: 'llm', allowed_worker_backends: ['llm'], worker_model: 'a/b', worker_thinking: 'on', worker_delegated_effort: 'max' };
    expect(workersOf(raw).options).toEqual({ model: 'a/b', thinking: 'on', effort: 'max' });
    expect(workersOf({ ...raw, worker_delegated_effort: 'huge' }).options).toBeUndefined();
    expect(workersOf({ ...raw, worker_thinking: 'loud' }).options).toBeUndefined();
    const old: Record<string, unknown> = { ...raw };
    delete old.worker_model;
    expect(workersOf(old).options).toBeUndefined();
  });

  it('thinking changed under a held model is sent alone; nothing is sent for a kind the Bot may not use', () => {
    const w = opts(llmOnly, 'a/b', 'on');
    expect(workersPatch({ ...workersFormOf(w), hThinking: 'high' }, w)).toEqual({ worker_thinking: 'high' });
    const acp = opts({ ...both, allowed: ['acp'], backend: 'acp' }, 'a/b');
    expect(workersPatch({ ...workersFormOf(acp), hModel: 'c/d' }, acp)).toEqual({});
  });

  it('a refused helper option names its own words', () => {
    expect(workersRefusalKey('model_unavailable', { field: 'worker_model' })).toBe('workers.refused.hModel');
    expect(workersRefusalKey('bad_request', { field: 'worker_thinking' })).toBe('workers.refused.worker_thinking');
    expect(workersRefusalKey('bad_request', { field: 'worker_delegated_effort' })).toBe('workers.refused.worker_delegated_effort');
  });
});
