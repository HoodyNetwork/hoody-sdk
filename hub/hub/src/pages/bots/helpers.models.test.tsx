// Vitest on a live page (the person must see whether a chosen model applies to the agents below, and every option the agent takes
// is offered). Settings says the Bot's own model is not passed to its helpers and what they run on instead; Helpers offers
// every option the agent takes for them: Routing with its two tiers, the agents a task may name, and Claude Code's model. Each saves with
// the section's one PATCH, fenced like the rest of the form.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, userEvent, within } from '@app/testing';
import { CoreQueryProvider, queryClient } from '@core';
import { boot, onFetch, settle, type Call, type Reply } from '@core/test/env';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BotView, Change, GuardrailsResult, ModelRow, RoutingSet, SavedSettings, SettingsPatch, Workers } from './data';
import { registerTargets } from './data';
import type { SettingsSection } from './logic';
import { SettingsDrawer } from './parts/SettingsDrawer';
import strings from './strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const KEY = `c1~${R1}~chief`;
const llmOnly: Workers = { known: true, backend: 'llm', allowed: ['llm'], agent: '', model: '' };
const both: Workers = { known: true, backend: 'llm', allowed: ['llm', 'acp'], agent: 'claude', model: '' };
const acpOnly: Workers = { known: true, backend: 'acp', allowed: ['acp'], agent: 'claude', model: 'sonnet' };
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
// A newer read of the Bot arriving under the open form (a refresh): the drawer gets the new view, as the page hands it.
let readBot: (b: BotView) => void = () => undefined;
function Holder({ first }: { first: BotView }) {
  const [bot, setBot] = useState(first);
  readBot = setBot;
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

describe('the words: the Bot model is its own, helpers run on what Helpers says', () => {
  it('Model says helpers do not use the Bot model and links to Helpers', async () => {
    await show(botWith(llmOnly), 'model');
    expect(screen.getByText(/Helpers it starts don't use it/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['model.helpersLink'] }));
    expect(section).toBe('workers');
  });

  it('Hoody models names the AI helper model the realm holds now, never the Bot model', async () => {
    await show(botWith(llmOnly));
    expect(screen.getByText(strings['workers.desc'])).toBeInTheDocument();
    const llm = kind(strings['workers.llm.title']);
    expect(within(llm).getByText(/run on the AI helper's model, now Swift 1, set on the AI page/)).toBeInTheDocument();
    expect(within(llm).queryByText(/\bA\b, set on/)).toBeNull();
  });

  it('a realm whose default agent names no model runs helpers on Hoody Free', async () => {
    answer = (c) => (/\/agents(\?|$)/.test(c.url) && !/acp/.test(c.url) ? { status: 200, body: { items: [{ name: 'general', is_configured_default: true }] } } : undefined);
    await show(botWith(llmOnly));
    expect(within(kind(strings['workers.llm.title'])).getByText(/now Hoody Free,/)).toBeInTheDocument();
  });

  it('a failed agents read names no model (the words without a value, never a guess)', async () => {
    answer = (c) => (/\/agents(\?|$)/.test(c.url) && !/acp/.test(c.url) ? { status: 500, body: { error: { code: 'internal' } } } : undefined);
    await show(botWith(llmOnly));
    const llm = kind(strings['workers.llm.title']);
    expect(within(llm).getByText(/run on the AI helper's model, set on the AI page/)).toBeInTheDocument();
    expect(within(llm).queryByText(/now /)).toBeNull();
  });

  it('a kind the Bot may not use shows one line instead of its fields', async () => {
    await show(botWith(llmOnly));
    expect(within(kind(strings['workers.acp.title'])).getByText(strings['workers.acp.off'])).toBeInTheDocument();
    cleanup();
    await show(botWith(acpOnly));
    expect(within(kind(strings['workers.llm.title'])).getByText(strings['workers.llm.off'])).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: strings['routing.mode'] })).toBeNull();
  });
});

describe('Claude Code helpers: every model the computer offers, plus its default', () => {
  it('the picker lists the default and every claude_code row, and saves worker_delegated_model in the one PATCH', async () => {
    await show(botWith(both));
    const acp = kind(strings['workers.acp.title']);
    await userEvent.click(within(acp).getByRole('button', { name: new RegExp(strings['workers.model']) }));
    const names = screen.getAllByRole('option').map((o) => o.textContent);
    expect(names).toEqual(expect.arrayContaining([strings['workers.model.own'], 'Opus 5.5', 'sonnet']));
    await userEvent.click(screen.getByRole('option', { name: 'Opus 5.5' }));
    await userEvent.click(save());
    await flush();
    expect(sent).toEqual([{ patch: { worker_delegated_model: 'claude-opus-5-5' }, uid: 'u-chief', revision: 6 }]);
    expect(within(acp).getByText(strings['workers.effort'])).toBeInTheDocument();
  });
});

describe('Routing: editable under Hoody models, saved with the section', () => {
  it('Pick per task with a light and a heavy model sends the whole routing in the one PATCH', async () => {
    await show(botWith(llmOnly));
    await userEvent.click(screen.getByRole('radio', { name: new RegExp(`^${strings['routing.mode.auto']}`) }));
    expect(save()).toBeDisabled(); // both tiers need a model
    expect(screen.getAllByText(strings['routing.pickModel']).length).toBeGreaterThan(0);
    await userEvent.type(screen.getByRole('combobox', { name: new RegExp(`^${strings['routing.light']}`) }), 'Swi');
    await userEvent.click(await screen.findByRole('option', { name: 'Swift 1' }));
    await userEvent.type(screen.getByRole('combobox', { name: new RegExp(`^${strings['routing.heavy']}`) }), 'C');
    expect(screen.queryByRole('option', { name: 'Council' })).toBeNull(); // an ensemble is never offered
    await userEvent.clear(screen.getByRole('combobox', { name: new RegExp(`^${strings['routing.heavy']}`) }));
    await userEvent.type(screen.getByRole('combobox', { name: new RegExp(`^${strings['routing.heavy']}`) }), 'Dee');
    await userEvent.click(await screen.findByRole('option', { name: 'Deep 9' }));
    await userEvent.click(save());
    await flush();
    expect(sent).toEqual([{ patch: { routing: { mode: 'auto', light: { model: 'acme/swift-1', thinking: '' }, heavy: { model: 'acme/deep-9', thinking: '' } } }, uid: 'u-chief', revision: 6 }]);
  });

  it('Thinking shows only for a reasoning model', async () => {
    const r: RoutingSet = { mode: 'suggest', light: { model: 'acme/swift-1', thinking: '' }, heavy: { model: 'acme/deep-9', thinking: 'high' } };
    await show(botWith(llmOnly, { routing: 'suggest', routingSet: r }));
    expect(screen.queryByRole('button', { name: new RegExp(`${strings['routing.light.thinking']}$`) })).toBeNull();
    expect(screen.getByRole('button', { name: new RegExp(`${strings['routing.heavy.thinking']}$`) })).toBeInTheDocument();
    expect(save()).toBeDisabled(); // held as it is: nothing to save
  });

  it('a Thinking value held on a model the catalogue does not mark stays editable, so it can be taken away', async () => {
    const r: RoutingSet = { mode: 'auto', light: { model: 'acme/swift-1', thinking: 'low' }, heavy: { model: 'acme/deep-9', thinking: '' } };
    await show(botWith(llmOnly, { routing: 'auto', routingSet: r }));
    expect(screen.getByRole('button', { name: new RegExp(`${strings['routing.light.thinking']}$`) })).toBeInTheDocument();
  });

  it('under Off no tier is drawn; choosing a mode brings both', async () => {
    await show(botWith(llmOnly));
    expect(screen.queryByRole('combobox', { name: new RegExp(`^${strings['routing.light']}`) })).toBeNull();
    expect(screen.queryByRole('combobox', { name: new RegExp(`^${strings['routing.heavy']}`) })).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: new RegExp(`^${strings['routing.mode.suggest']}`) }));
    expect(screen.getByRole('combobox', { name: new RegExp(`^${strings['routing.light']}`) })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: new RegExp(`^${strings['routing.heavy']}`) })).toBeInTheDocument();
  });

  it('Off sends the mode alone', async () => {
    const r: RoutingSet = { mode: 'auto', light: { model: 'acme/swift-1', thinking: '' }, heavy: { model: 'acme/deep-9', thinking: '' } };
    await show(botWith(llmOnly, { routing: 'auto', routingSet: r }));
    await userEvent.click(screen.getByRole('radio', { name: new RegExp(`^${strings['routing.mode.off']}`) }));
    await userEvent.click(save());
    await flush();
    expect(sent.map((x) => x.patch)).toEqual([{ routing: { mode: 'off' } }]);
  });

  it('a 422 on routing.heavy.model marks the heavy field, not the whole section', async () => {
    shown = { outcome: 'failed', code: 'model_unavailable', details: { field: 'routing.heavy.model' } };
    const r: RoutingSet = { mode: 'auto', light: { model: 'acme/swift-1', thinking: '' }, heavy: { model: 'acme/deep-9', thinking: '' } };
    await show(botWith(llmOnly, { routing: 'auto', routingSet: r }));
    // A refusal shows for the section's own save.
    await userEvent.click(screen.getByRole('radio', { name: new RegExp(`^${strings['routing.mode.suggest']}`) }));
    await userEvent.click(save());
    await flush();
    expect(screen.getByText(strings['routing.refused.model'])).toBeInTheDocument();
    expect(screen.queryByText(strings['workers.refused.generic'])).toBeNull();
  });
});

describe('the agents a task may name', () => {
  it('Any agent by default; restricting needs one ticked, then sends the ticked list', async () => {
    await show(botWith(llmOnly));
    const any = screen.getByRole('switch', { name: new RegExp(strings['agents.any']) });
    expect(any).toBeChecked();
    await userEvent.click(any);
    expect(screen.getByText(strings['agents.pickOne'])).toBeInTheDocument();
    expect(save()).toBeDisabled();
    const list = screen.getByRole('group', { name: strings['agents.label'] });
    expect(within(list).queryByText('bot')).toBeNull(); // the Bot's own agent is never a helper
    expect(within(list).getByText('Deep 9')).toBeInTheDocument(); // research names its model
    await userEvent.click(within(list).getByRole('checkbox', { name: /^research/ }));
    await userEvent.click(save());
    await flush();
    expect(sent.map((x) => x.patch)).toEqual([{ allowed_agents: ['research'] }]);
  });

  it('a Bot limited to some agents opens with them ticked; back to any sends the empty list', async () => {
    await show(botWith(llmOnly, { allowedAgents: ['writer'] }));
    const any = screen.getByRole('switch', { name: new RegExp(strings['agents.any']) });
    expect(any).not.toBeChecked();
    await userEvent.click(any);
    await userEvent.click(save());
    await flush();
    expect(sent.map((x) => x.patch)).toEqual([{ allowed_agents: [] }]);
  });
});

describe('the section follows its own saves and newer reads without losing an edit', () => {
  it('a saved agent choice reads as saved before the Bot is read again, and going back to the earlier list is an edit again', async () => {
    await show(botWith(llmOnly, { allowedAgents: ['writer'] }));
    const any = () => screen.getByRole('switch', { name: new RegExp(strings['agents.any']) });
    await userEvent.click(any());
    await userEvent.click(save());
    await flush();
    expect(sent.map((x) => x.patch)).toEqual([{ allowed_agents: [] }]);
    expect(save()).toBeDisabled(); // nothing left to save
    await userEvent.click(any()); // restricted again: the ticks kept from before come back
    expect(within(screen.getByRole('group', { name: strings['agents.label'] })).getByRole('checkbox', { name: /^writer/ })).toBeChecked();
    expect(save()).toBeEnabled();
    await userEvent.click(save());
    await flush();
    expect(sent.map((x) => x.patch)).toEqual([{ allowed_agents: [] }, { allowed_agents: ['writer'] }]);
  });

  it('a saved routing reads as saved before the Bot is read again', async () => {
    await show(botWith(llmOnly));
    await userEvent.click(screen.getByRole('radio', { name: new RegExp(`^${strings['routing.mode.suggest']}`) }));
    await userEvent.type(screen.getByRole('combobox', { name: new RegExp(`^${strings['routing.light']}`) }), 'Swi');
    await userEvent.click(await screen.findByRole('option', { name: 'Swift 1' }));
    await userEvent.type(screen.getByRole('combobox', { name: new RegExp(`^${strings['routing.heavy']}`) }), 'Dee');
    await userEvent.click(await screen.findByRole('option', { name: 'Deep 9' }));
    await userEvent.click(save());
    await flush();
    expect(sent).toHaveLength(1);
    expect(save()).toBeDisabled();
  });

  it('a newer read that takes Hoody models away keeps an unsaved agent edit, its fields and its Save', async () => {
    await show(botWith(both));
    await userEvent.click(screen.getByRole('switch', { name: new RegExp(strings['agents.any']) }));
    await userEvent.click(within(screen.getByRole('group', { name: strings['agents.label'] })).getByRole('checkbox', { name: /^research/ }));
    await act(async () => readBot(botWith({ ...acpOnly, model: '' }, { guardrailRevision: 7 })));
    await flush();
    expect(screen.getByRole('switch', { name: new RegExp(strings['agents.any']) })).not.toBeChecked();
    expect(within(screen.getByRole('group', { name: strings['agents.label'] })).getByRole('checkbox', { name: /^research/ })).toBeChecked();
  });

  it('a newer read under a clean section is taken: its routing and agents show', async () => {
    await show(botWith(llmOnly));
    const r: RoutingSet = { mode: 'auto', light: { model: 'acme/swift-1', thinking: '' }, heavy: { model: 'acme/deep-9', thinking: '' } };
    await act(async () => readBot(botWith(llmOnly, { guardrailRevision: 7, routing: 'auto', routingSet: r, allowedAgents: ['writer'] })));
    await flush();
    expect(screen.getByRole('radio', { name: new RegExp(`^${strings['routing.mode.auto']}`) })).toBeChecked();
    expect(screen.getByRole('switch', { name: new RegExp(strings['agents.any']) })).not.toBeChecked();
    expect(save()).toBeDisabled();
  });

  it('a new tier model starts on its default thinking', async () => {
    const r: RoutingSet = { mode: 'auto', light: { model: 'acme/swift-1', thinking: '' }, heavy: { model: 'acme/deep-9', thinking: 'high' } };
    await show(botWith(llmOnly, { routing: 'auto', routingSet: r }));
    const heavy = screen.getByRole('combobox', { name: new RegExp(`^${strings['routing.heavy']}`) });
    await userEvent.clear(heavy);
    await userEvent.type(heavy, 'Swi');
    await userEvent.click(await screen.findByRole('option', { name: 'Swift 1' }));
    expect(screen.queryByRole('button', { name: new RegExp(`${strings['routing.heavy.thinking']}$`) })).toBeNull(); // not a reasoning model, nothing held
    await userEvent.click(save());
    await flush();
    expect(sent.map((x) => x.patch)).toEqual([{ routing: { mode: 'auto', light: { model: 'acme/swift-1', thinking: '' }, heavy: { model: 'acme/swift-1', thinking: '' } } }]);
  });

  it('ticking Claude Code reads its models at once, before any save', async () => {
    await show(botWith(llmOnly));
    await userEvent.click(screen.getByRole('switch', { name: new RegExp(`^${strings['workers.allow.acp']}`) }));
    await flush();
    const acp = kind(strings['workers.acp.title']);
    await userEvent.click(within(acp).getByRole('button', { name: new RegExp(strings['workers.model']) }));
    expect(screen.getByRole('option', { name: 'Opus 5.5' })).toBeInTheDocument();
  });

  it('a failed agents read after a good one names no model', async () => {
    await show(botWith(llmOnly));
    expect(within(kind(strings['workers.llm.title'])).getByText(/now Swift 1,/)).toBeInTheDocument();
    answer = (c) => (/\/agents(\?|$)/.test(c.url) && !/acp/.test(c.url) ? { status: 500, body: { error: { code: 'internal' } } } : undefined);
    await act(async () => { await queryClient.refetchQueries(); });
    await flush();
    const llm = kind(strings['workers.llm.title']);
    expect(within(llm).queryByText(/now /)).toBeNull();
    expect(within(llm).getByText(/run on the AI helper's model, set on the AI page/)).toBeInTheDocument();
  });

  it('the agent list is locked with the rest of the section', async () => {
    await show(botWith(llmOnly, { allowedAgents: ['writer'], caps: { botExpect: false, botGateHttp: false, botTurnCancel: false } }));
    const box = within(screen.getByRole('group', { name: strings['agents.label'] })).getByRole('checkbox', { name: /^writer/ });
    expect(box).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('the rail: two groups, the same sections', () => {
  it('"The Bot itself" and "The helpers it starts" head their sections; ids are unchanged', async () => {
    await show(botWith(llmOnly));
    const rail = screen.getByRole('navigation', { name: strings['settings.rail'] });
    // The rail's one list holds the group heads and the sections, in reading order.
    expect(rail.children).toHaveLength(1);
    const text = Array.from((rail.firstElementChild as HTMLElement).children).map((c) => c.textContent);
    expect(text).toEqual([
      strings['settings.group.bot'], strings['model.title'], strings['behaviour.title'], strings['voice.title'],
      strings['settings.group.helpers'], strings['workers.title'], strings['guard.title'],
      strings['advanced.title'],
    ]);
    expect(within(rail).getAllByRole('button')).toHaveLength(6);
  });
});
