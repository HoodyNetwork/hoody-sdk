// Vitest: the Explain drawer's model choice is the kit
// ModelChooser over a real useModelCatalogue (reads the test answers) and the page's real flow (explain-flow.ts over a
// scripted call). Readiness comes from the evidence, never all "can't tell"; Ask judges against the newest evidence
// with the Explain rules (output cap, no ensembles) and sends nothing when the judgement is not ok; the saved, default
// and Hoody Free resolution and the price line are unchanged; no ensembles, no endpoint link; setup happens inline.
// While Ask is off it says why.
import { act, render, screen, waitFor, within } from '@app/testing';
import userEvent from '@testing-library/user-event';
import { useEffect, useMemo } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { providers } from '@core';
import { setTarget, type Target } from '@core/ctx';
import { boot } from '@core/test/env';
import type { CatalogueReader } from '@core/providers/read';
import type { Outcome, Settled } from '@core/providers/types';
import type { CatalogueReads } from '@kit';
import { createExplainFlow } from './explain-flow';
import type { Call } from './explain';
import { ExplainDrawer } from './parts/ExplainDrawer';
import strings from './strings.en.json';

const table = strings as Record<string, string>;
const t = ((k: string, o?: Record<string, unknown>) => (table[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(o?.[x] ?? ''))) as never;

const ERR: Outcome = { kind: 'failed', code: 'unavailable', status: 503, retryAfter: null, details: {} };
const ok = (body: unknown): Settled<unknown> => ({ ok: true, body });
const no: Settled<unknown> = { ok: false, err: ERR };
const st = (state: string, cap = true) => ({ state, via: 'stored_key', methods: ['api_key'], alternatives: {}, output_cap: cap, shares_with: [] });

const A: Target = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } };
const FREE = providers.FREE;
const GPT = 'openai/gpt-5';

/** What the computer's agent answers: OpenAI's state, the ready list, which read fails. */
interface Agent {
  openai?: 'ready' | 'needs_key';
  ready?: string[];
  fail?: 'ready' | 'models';
  /** OpenAI no longer accepts an output cap (a ChatGPT sign-in): the Explain rules refuse its models. */
  noCap?: boolean;
  /** The reads never answer. */
  hold?: boolean;
}
function catalogueReads(a: Agent): () => CatalogueReads {
  const providersBody = { providers: [
    { id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', status: st('ready') },
    { id: 'openai', prefix: 'openai/', display_name: 'OpenAI', status: st(a.openai ?? 'needs_key', !a.noCap) },
  ] };
  const modelsBody = { models: [
    { spec: FREE, display_name: 'Hoody Free' },
    { spec: GPT, display_name: 'GPT-5' },
    { spec: 'openai/gpt-4o', display_name: 'GPT-4o' },
    { spec: 'fusion/team', display_name: 'Team', source: 'fusion', members: [FREE] },
  ] };
  const readyBody = { models: (a.ready ?? [FREE]).map((spec) => ({ spec })) };
  const wait = <T,>(v: T): Promise<T> => (a.hold ? new Promise<T>(() => undefined) : Promise.resolve(v));
  return () => ({
    catalogue: {
      providers: () => wait(ok(providersBody)),
      models: (q: { ready?: boolean } = {}) => wait(q.ready ? (a.fail === 'ready' ? no : ok(readyBody)) : a.fail === 'models' ? no : ok(modelsBody)),
      auth: () => Promise.resolve(ok({ auth: { ready: true, api_key_stored: true } })),
    } as unknown as CatalogueReader,
  });
}

function fakeApi(): providers.ProvidersApi {
  const none = () => Promise.resolve({ ok: false, err: ERR } as Settled<unknown>);
  return {
    version: none, providers: none, provider: none, auth: none, catalogue: none as never,
    oauthPoll: none, pkcePoll: none, pkceStart: none, pkceCode: none, pkceCancel: none,
    keyPut: () => Promise.resolve(ok({ check: 'valid' })),
    keyDelete: none, authTest: none, authDefault: none, oauthStart: none, oauthCancel: none, signOut: none,
  };
}

/** The page's own reads (explain.ts): /models with prices, /agents for the configured default, /completions. */
function page(o: { saved?: string | null; agentsModel?: string; hold?: '/models' | '/agents'; modelsFail?: boolean } = {}) {
  const sent: { path: string; body: unknown }[] = [];
  let saved = o.saved ?? null;
  let release = () => undefined as void;
  const held = new Promise<void>((r) => { release = r; });
  const call: Call = async (_m, path, body) => {
    sent.push({ path, body });
    if (path === o.hold) await held;
    if (path === '/models' && o.modelsFail) throw new Error('unavailable');
    if (path === '/models') return { items: [
      { spec: FREE, display_name: 'Hoody Free', source: 'provider', cost_in: 0, cost_out: 0 },
      { spec: GPT, display_name: 'GPT-5', source: 'provider', cost_in: 1.25, cost_out: 10 },
      { spec: 'openai/gpt-4o', display_name: 'GPT-4o', source: 'provider' },
      { spec: 'fusion/team', display_name: 'Team', source: 'fusion' },
    ] };
    if (path === '/agents') return { items: [{ name: 'general', is_configured_default: true, ...(o.agentsModel ? { model: o.agentsModel } : {}) }] };
    return { status: 'ok', model: GPT, text: 'It restarted.', stop_reason: 'end_turn' };
  };
  return {
    call,
    asks: () => sent.filter((x) => x.path === '/completions'),
    saved: { get: () => saved, set: (s: string) => { saved = s; return true; } },
    get savedNow() { return saved; },
    /** Lets the held read answer (page({ hold })). */
    release: async () => { release(); await flush(); },
  };
}

async function flush() {
  for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); });
}

function Host({ agent, p, on = A, onFlow }: { agent: Agent; p: ReturnType<typeof page>; on?: Target; onFlow?: (f: ReturnType<typeof createExplainFlow>) => void }) {
  const reads = useMemo(() => catalogueReads(agent), [agent]);
  const flow = useMemo(() => {
    const f = createExplainFlow({ subject: 'Files GET 500', entries: [{ message: 'boom' }], call: p.call, target: { container: { realm_ids: [] } }, realm: null, saved: p.saved, name: 'atlas' });
    f.start();
    return f;
  }, [p]);
  useEffect(() => onFlow?.(flow), [flow, onFlow]);
  return (
    <ExplainDrawer
      t={t}
      flow={flow}
      onClose={() => undefined}
      target={on}
      computer={{ id: on.container.id, name: 'atlas', row: { id: on.container.id, project_id: on.project.id, server_name: 'sv1' } }}
      seams={{ reads, api: () => fakeApi(), go: () => undefined }}
    />
  );
}

async function open(agent: Agent, o: Parameters<typeof page>[0] = {}) {
  const p = page(o);
  render(<Host agent={agent} p={p} />);
  await flush();
  return p;
}
// The model is a setting row; its value names the model and its readiness.
const modelLine = () => document.querySelector('[data-explain-model]') as HTMLElement;
const ask = async () => { await userEvent.click(screen.getByRole('button', { name: strings['explain.ask'] })); await flush(); };

beforeEach(() => {
  boot();
  setTarget(A);
});

describe('readiness from the evidence', () => {
  it('a saved model the ready list holds reads ready (not "This model may need a key or setup first")', async () => {
    await open({ openai: 'ready', ready: [FREE, GPT] }, { saved: GPT });
    expect(within(modelLine()).getByText('GPT-5')).toBeInTheDocument();
    expect(modelLine().textContent).not.toContain(strings['explain.model.unknown']);
  });

  it('Hoody Free with the ready read failed is "can\'t tell", never ready by its name alone', async () => {
    await open({ fail: 'ready' });
    expect(within(modelLine()).getByText('Hoody Free')).toBeInTheDocument();
    expect(modelLine().textContent).toContain(strings['explain.model.unknown']);
  });

  it('a saved model whose provider needs a key says so', async () => {
    await open({ openai: 'needs_key' }, { saved: GPT });
    expect(modelLine().textContent).toContain(strings['explain.model.needsKey']);
  });
});

describe('Ask judges first, and sends nothing when the judgement is not ok', () => {
  it('a ready model: Ask sends exactly one request for it; the price line is unchanged', async () => {
    const p = await open({ openai: 'ready', ready: [FREE, GPT] }, { saved: GPT });
    expect(screen.getByText(strings['explain.cost.underCent'])).toBeInTheDocument();
    await ask();
    expect(p.asks()).toHaveLength(1);
    expect((p.asks()[0]!.body as { model: string }).model).toBe(GPT);
  });

  it('needs setup: nothing sent, the reason in the drawer', async () => {
    const p = await open({ openai: 'needs_key' }, { saved: GPT });
    await ask();
    expect(p.asks()).toHaveLength(0);
    expect(screen.getByText(strings['explain.judge.setup'].replace('{{model}}', 'GPT-5'))).toBeInTheDocument();
  });

  it('a saved model that lost output-cap eligibility is refused before sending', async () => {
    const p = await open({ openai: 'ready', ready: [FREE, GPT], noCap: true }, { saved: GPT });
    await ask();
    expect(p.asks()).toHaveLength(0);
    expect(screen.getByText(strings['explain.choose'])).toBeInTheDocument();
  });

  it("can't tell: nothing sent until Use it anyway; then one Ask sends one request", async () => {
    const p = await open({ openai: 'ready', ready: [FREE] }, { saved: GPT });
    await ask();
    expect(p.asks()).toHaveLength(0);
    expect(screen.getByText(strings['explain.judge.consent'].replace('{{model}}', 'GPT-5').replace('{{computer}}', 'atlas'))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['explain.judge.useAnyway'] }));
    await flush();
    expect(p.asks()).toHaveLength(0);
    await ask();
    expect(p.asks()).toHaveLength(1);
  });

  it('consent is per scope: after the computer changes, Ask asks again and sends nothing', async () => {
    const p = page({ saved: GPT });
    const agent: Agent = { openai: 'ready', ready: [FREE] };
    const { rerender } = render(<Host agent={agent} p={p} />);
    await flush();
    await ask();
    await userEvent.click(screen.getByRole('button', { name: strings['explain.judge.useAnyway'] }));
    await flush();
    const B: Target = { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv1' } };
    rerender(<Host agent={agent} p={p} on={B} />);
    await flush();
    await ask();
    expect(p.asks()).toHaveLength(0);
    expect(screen.getByText(strings['explain.judge.consent'].replace('{{model}}', 'GPT-5').replace('{{computer}}', 'atlas'))).toBeInTheDocument();
  });

  it('a choice the chooser hands over is held: an unknown model chosen with consent sends on the next Ask', async () => {
    const p = page({ saved: 'openai/gpt-4o' });
    let flow: ReturnType<typeof createExplainFlow> | null = null;
    render(<Host agent={{ openai: 'ready', ready: [FREE] }} p={p} onFlow={(f) => { flow = f; }} />);
    await flush();
    await ask();
    await userEvent.click(screen.getByRole('button', { name: strings['explain.judge.useAnyway'] }));
    await flush();
    const held = flow!.get().choice;
    expect(held?.kind).toBe('model');
    if (held?.kind !== 'model') return;
    await act(async () => { flow!.choose({ ...held, spec: GPT }); });
    await ask();
    expect(p.asks()).toHaveLength(1);
    expect(p.asks()[0]!.body).toMatchObject({ model: GPT });
  });

  it('an explicit pick is sticky: a /models read that answers after the choice never replaces it', async () => {
    const p = await open({ openai: 'ready', ready: [FREE, GPT] }, { saved: GPT, hold: '/models' });
    await userEvent.click(screen.getByRole('button', { name: strings['explain.model.change'] }));
    await flush();
    await userEvent.click(screen.getByRole('option', { name: /Hoody Free/ }));
    await flush();
    await p.release();
    expect(within(modelLine()).getByText('Hoody Free')).toBeInTheDocument();
    expect(p.savedNow).toBe(FREE);
    await ask();
    expect(p.asks()).toHaveLength(1);
    expect(p.asks()[0]!.body).toMatchObject({ model: FREE });
  });

  it('an explicit pick is sticky: a configured default read after the choice never replaces it', async () => {
    const p = await open({ openai: 'ready', ready: [FREE, GPT] }, { agentsModel: GPT, hold: '/agents' });
    await userEvent.click(screen.getByRole('button', { name: strings['explain.model.change'] }));
    await flush();
    await userEvent.click(screen.getByRole('option', { name: /Hoody Free/ }));
    await flush();
    await p.release();
    expect(within(modelLine()).getByText('Hoody Free')).toBeInTheDocument();
    await ask();
    expect(p.asks()).toHaveLength(1);
    expect(p.asks()[0]!.body).toMatchObject({ model: FREE });
  });

  it('a refusal that opens the chooser moves focus into it (keyboard: the way out is next)', async () => {
    await open({ openai: 'needs_key', ready: [FREE] }, { saved: GPT });
    await ask();
    const chooser = screen.getByRole('group', { name: strings['explain.pick.label'] });
    expect(chooser).toContainElement(document.activeElement as HTMLElement);
  });

  it('every read failed and the configured default is an ensemble: nothing is sent, even after Use it anyway', async () => {
    const p = await open({ fail: 'models' }, { agentsModel: 'fusion/team', modelsFail: true });
    await ask();
    const consent = screen.queryByRole('button', { name: strings['explain.judge.useAnyway'] });
    if (consent) {
      await userEvent.click(consent);
      await flush();
      await ask();
    }
    expect(p.asks()).toHaveLength(0);
  });

  it('every read failed: an ordinary configured default still sends after Use it anyway', async () => {
    const p = await open({ fail: 'models' }, { agentsModel: GPT, modelsFail: true });
    await ask();
    await userEvent.click(screen.getByRole('button', { name: strings['explain.judge.useAnyway'] }));
    await flush();
    await ask();
    expect(p.asks()).toHaveLength(1);
    expect(p.asks()[0]!.body).toMatchObject({ model: GPT });
  });

  it('before the evidence arrives: nothing sent, "checking" in the drawer', async () => {
    const p = await open({ hold: true });
    await ask();
    expect(p.asks()).toHaveLength(0);
    expect(screen.getByText(strings['explain.judge.unread'])).toBeInTheDocument();
  });
});

describe('resolution unchanged', () => {
  it('no saved pick: the configured default agent\'s own model, else Hoody Free', async () => {
    await open({ openai: 'ready', ready: [FREE, GPT] }, { agentsModel: GPT });
    expect(within(modelLine()).getByText('GPT-5')).toBeInTheDocument();
  });
  it('nothing saved or configured: Hoody Free, free', async () => {
    await open({});
    expect(within(modelLine()).getByText('Hoody Free')).toBeInTheDocument();
    expect(screen.getByText(strings['explain.cost.free'])).toBeInTheDocument();
  });
  // The real path to the generic word. The model list read fails, so a saved pick cannot be checked and
  // the configured default agent's model is used (explain.ts models); that model is a Hoody AI spec with no name to
  // show (explain.ts nameOf): the drawer names it with the generic word, never an empty bold name.
  it('the list read failed and the configured model has no public name: the generic word', async () => {
    await open({ fail: 'models' }, { agentsModel: 'hoody-ai/upstream', modelsFail: true });
    expect(screen.getByText(strings['explain.model.failed'])).toBeInTheDocument();
    expect(modelLine().querySelector('b')?.textContent).toBe(strings['explain.model.noName']);
  });
  // The list read failed and nothing is configured, so the pick is Hoody Free with no row to name it:
  // the drawer says "Hoody Free", never its raw id.
  it('the list read failed and nothing is configured: Hoody Free by name, never its id', async () => {
    await open({ fail: 'models' }, { modelsFail: true });
    expect(screen.getByText(strings['explain.model.failed'])).toBeInTheDocument();
    expect(modelLine().querySelector('b')?.textContent).toBe('Hoody Free');
    expect(modelLine().textContent).not.toContain(FREE);
  });
  // Another Hoody AI model with no row to name it: the generic word, never the raw hoody-ai id.
  it('the list read failed and the configured model is another unnamed Hoody AI model: the generic word, never its id', async () => {
    await open({ fail: 'models' }, { agentsModel: 'hoody-ai/hoody-other', modelsFail: true });
    expect(modelLine().querySelector('b')?.textContent).toBe(strings['explain.model.noName']);
    expect(modelLine().textContent).not.toContain('hoody-ai/');
  });
});

describe('the chooser', () => {
  it('Change opens the kit chooser: no Select, no ensembles, no endpoint link', async () => {
    await open({ openai: 'ready', ready: [FREE, GPT] });
    await userEvent.click(screen.getByRole('button', { name: strings['explain.model.change'] }));
    await flush();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.queryByText('Team')).toBeNull();
    expect(screen.queryByText('Ensembles')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    expect(screen.queryByRole('button', { name: /Your own endpoint/ })).toBeNull();
  });

  it('choosing a ready model makes it the pick and saves it', async () => {
    const p = await open({ openai: 'ready', ready: [FREE, GPT] });
    await userEvent.click(screen.getByRole('button', { name: strings['explain.model.change'] }));
    await flush();
    await userEvent.click(screen.getByRole('option', { name: /GPT-5/ }));
    await flush();
    expect(within(modelLine()).getByText('GPT-5')).toBeInTheDocument();
    expect(p.savedNow).toBe(GPT);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('the Explain list keeps only ready models that take an output cap (purpose explain): no "can\'t tell" rows', async () => {
    await open({ openai: 'ready', ready: [FREE, GPT] });
    await userEvent.click(screen.getByRole('button', { name: strings['explain.model.change'] }));
    await flush();
    const list = screen.getByRole('listbox');
    expect(within(list).getByRole('option', { name: /GPT-5/ })).toBeInTheDocument();
    expect(within(list).queryByRole('option', { name: /GPT-4o/ })).toBeNull();
  });

  it('Set up a provider lists no provider that takes no output cap (purpose explain)', async () => {
    await open({ openai: 'needs_key', noCap: true, ready: [FREE] });
    await userEvent.click(screen.getByRole('button', { name: strings['explain.model.change'] }));
    await flush();
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    await flush();
    expect(screen.queryByRole('button', { name: 'Set up OpenAI' })).toBeNull();
  });

  it('a pick that needs setup sets up inline, inside the drawer', async () => {
    await open({ openai: 'needs_key' }, { saved: GPT });
    await userEvent.click(screen.getByRole('button', { name: strings['explain.model.change'] }));
    await flush();
    await userEvent.click(screen.getByRole('button', { name: 'Set up OpenAI' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 4, name: /Set up OpenAI/ })).toBeInTheDocument());
    expect(screen.getByRole('dialog')).toContainElement(screen.getByRole('heading', { level: 4, name: /Set up OpenAI/ }));
  });
});

describe('Ask says why it is off', () => {
  it('while the model list is still being read: Ask stays focusable and says it is finding the model', async () => {
    await open({ ready: [FREE] }, { hold: '/models' });
    const b = screen.getByRole('button', { name: strings['explain.ask'] });
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(b).toHaveAccessibleDescription(strings['explain.model.loading']);
  });
});
