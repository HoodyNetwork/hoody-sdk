// Vitest, AI Default: the Default model rows on the one model picker (ModelPickPanel, live mode), over a real
// useModelCatalogue whose reads the test answers. The Bots row lists ensembles and the helper row does not; a needs-setup pick sets up inline in the drawer; Confirm judges the pick against the newest evidence before
// anything is sent, and a refresh that made the model unknown (or needing setup) reopens the chooser to choose again.
import { act, render, screen, waitFor, within } from '@app/testing';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '@core';
import type * as Nav from '@kit/nav';
import { setTarget, type Target } from '@core/ctx';
import { boot } from '@core/test/env';
import { readCatalogue, type CatalogueReader, type Snapshot } from '@core/providers/read';
import type { Outcome, Settled } from '@core/providers/types';
import { catalogue7k, type Answer as Fixture, type Scenario } from '@kit/pickers/fixtures/catalogue7k';
import chooser from '@kit/pickers/ModelChooser.strings.en.json';
import pick from '@kit/pickers/ModelPick.strings.en.json';
import { VIEW_MAX } from '@kit/pickers/modelPaging';
import { defaults, list, rows } from './logic';
import { AiProvider, type AiCtx } from './parts/ctx';
import { DefaultSection } from './parts/Default';
import strings from './strings.en.json';
import type { Api } from './api';

// No router here: the page's search param is empty and navigation is a no-op (the chooser stays in the page).
vi.mock('@kit/nav', async (orig) => ({ ...(await orig<typeof Nav>()), useSearchParam: () => [undefined, () => undefined], useGo: () => () => undefined }));

const ERR: Outcome = { kind: 'failed', code: 'unexpected', status: 500, retryAfter: null, details: {} };
const ok = (body: unknown): Settled<unknown> => ({ ok: true, body });
const FREE = 'hoody-ai/hoody-free';
const A: Target = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } };
const st = (state: string) => ({ state, via: 'stored_key', methods: ['api_key'], alternatives: {}, output_cap: true, shares_with: [] });

/** One read's answer: OpenAI's state and the ready list. */
interface Answer {
  openai?: 'ready' | 'needs_key';
  ready?: string[];
  /** The ready read fails: nothing can be proven ready. */
  readyFails?: boolean;
  /** The whole read fails (providers and models): the chooser keeps its last answer. */
  fails?: boolean;
}
const bodies = (a: Answer) => ({
  providers: { providers: [
    { id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', status: st('ready') },
    { id: 'openai', prefix: 'openai/', display_name: 'OpenAI', status: st(a.openai ?? 'ready') },
    { id: 'anthropic', prefix: 'anthropic/', display_name: 'Anthropic', status: st('needs_key') },
    { id: 'fusion', prefix: 'fusion/', display_name: 'Ensembles', status: st('ready') },
  ] },
  models: { models: [
    { spec: FREE, display_name: 'Hoody Free' },
    { spec: 'hoody-ai/hoody-decide', display_name: 'Hoody safety checker' },
    { spec: 'openai/gpt-5', display_name: 'GPT-5' },
    { spec: 'anthropic/claude-sonnet', display_name: 'Claude Sonnet' },
    { spec: 'fusion/duo', display_name: 'Duo ensemble', source: 'fusion', members: [FREE, 'openai/gpt-5'] },
  ] },
  ready: { models: (a.ready ?? [FREE, 'hoody-ai/hoody-decide', 'openai/gpt-5', 'fusion/duo']).map((spec) => ({ spec })) },
});

/** One answer as a reader that answers at once (the page bundle's own read). */
const readerOf = (a: Answer): CatalogueReader =>
  ({
    providers: () => Promise.resolve(ok(bodies(a).providers)),
    models: (q: { ready?: boolean } = {}) => Promise.resolve(q.ready ? (a.readyFails ? { ok: false as const, err: ERR } : ok(bodies(a).ready)) : ok(bodies(a).models)),
    auth: () => Promise.resolve(ok({ auth: { ready: true, api_key_stored: true } })),
  }) as unknown as CatalogueReader;

/** The page bundle's snapshot for one answer. */
async function snapOf(a: Answer): Promise<Snapshot> {
  const p = await readCatalogue(readerOf(a));
  if (p.state !== 'ok') throw new Error('no snapshot');
  return p.value;
}

/** Reads the test answers in order: each read takes the next queued answer, or waits for one. */
function world() {
  const queue: Answer[] = [];
  const waiting: Array<(a: Answer) => void> = [];
  let count = 0;
  const readerFor = (_t: Target, _ctx: Ctx): CatalogueReader => {
    count++;
    const gate = new Promise<Answer>((res) => {
      const next = queue.shift();
      if (next !== undefined) res(next);
      else waiting.push(res);
    });
    return {
      providers: () => gate.then((a) => (a.fails ? { ok: false as const, err: ERR } : ok(bodies(a).providers))),
      models: (q: { ready?: boolean } = {}) => gate.then((a) => (a.fails ? { ok: false as const, err: ERR } : q.ready ? (a.readyFails ? { ok: false as const, err: ERR } : ok(bodies(a).ready)) : ok(bodies(a).models))),
      auth: () => Promise.resolve(ok({ auth: { ready: true, api_key_stored: true } })),
    } as unknown as CatalogueReader;
  };
  return {
    readerFor,
    get count() { return count; },
    async next(...as: Answer[]) {
      await act(async () => {
        for (const a of as) {
          const w = waiting.shift();
          if (w) w(a);
          else queue.push(a);
        }
      });
      await flush();
    },
  };
}

/** The real catalogue's size: every read answers one 7k scenario at once. */
function world7k(scenario: Scenario) {
  const r = catalogue7k(scenario);
  const settle = (a: Fixture<unknown>): Settled<unknown> => (a.status === 200 ? ok(a.body) : { ok: false, err: { ...ERR, status: a.status } });
  const readerFor = (): CatalogueReader =>
    ({
      providers: () => Promise.resolve(settle(r.providers)),
      models: (q: { ready?: boolean } = {}) => Promise.resolve(settle(q.ready ? r.ready : r.models)),
      auth: (pid: string) => Promise.resolve(settle(r.auth(pid))),
    }) as unknown as CatalogueReader;
  return { readerFor, count: 0, next: async () => flush() } as unknown as ReturnType<typeof world>;
}

/** Rows the chooser draws (options, cards, action rows), as the kit's reach test counts them. */
const drawnRows = () => document.querySelectorAll('[data-mc-row]').length;

async function flush() {
  for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); });
}

/** How the counting Api's save lands: never (the readback still shows the old model), at once, or on the second read. */
type Apply = 'never' | 'now' | 'later';

/**
 * The page context with the agents' defaults (helper: Hoody Free; Bots follow it unless `bot` names their own) and a
 * counting Api. `snap` is the page bundle's snapshot (names, tags); `page()` replaces it as a later page read would.
 */
function mount(w: ReturnType<typeof world>, o: { snap?: Snapshot; bot?: string; apply?: Apply } = {}) {
  const sent: unknown[][] = [];
  const agentsBody = { agents: [{ name: 'general', model: FREE, is_configured_default: true }, { name: 'bot', model: o.bot ?? '' }] };
  let landed: (() => void) | null = null;
  let reads = 0;
  const api = new Proxy({} as Api, {
    get: (_t, k) => {
      if (k === 'agentModel') return (...a: unknown[]) => {
        sent.push(a);
        const row = agentsBody.agents.find((x) => x.name === a[1])!;
        landed = () => { row.model = a[2] as string; };
        reads = 0;
        if (o.apply === 'now') landed();
        return Promise.resolve(ok({}));
      };
      if (k === 'agents') return () => {
        if (o.apply === 'later' && landed && ++reads === 2) landed();
        return Promise.resolve(ok(structuredClone(agentsBody)));
      };
      return () => Promise.resolve({ ok: false, err: ERR });
    },
  });
  const connect = vi.fn();
  const goto = vi.fn();
  const mOf = (snap: Snapshot | null, at: number, err: Outcome | null = null) => {
    const cat = snap ? snap.cat : { byId: {}, byPrefix: {}, models: [] };
    return {
      computer: { id: 'c1', name: 'atlas' }, target: A, realm: 'global', realmIds: ['global'], caps: {},
      cat, models: snap ? list(snap.cat, 'worker', null) : [], named: snap ? list(snap.cat, 'bot', null) : [], defaults: defaults(rows(agentsBody, 'agents')), bots: [], accounts: [],
      bundle: { snap, at, err, refreshFailed: false }, readerFor: w.readerFor,
      loads: { catalogue: 'ok', defaults: 'ok', accounts: 'ok', claude: 'ok', checker: 'ok', bots: 'ok' },
    };
  };
  const env = { sleep: () => Promise.resolve(), now: () => 0, hidden: () => false, visible: () => Promise.resolve(), newKey: () => 'idem-1', digest: () => Promise.resolve('fp-1'), alive: () => true };
  const tree = (snap: Snapshot | null, at: number, err: Outcome | null = null) => (
    <AiProvider value={{ m: mOf(snap, at, err), api, env, reload: () => undefined, connect, goto } as unknown as AiCtx}>
      <DefaultSection />
    </AiProvider>
  );
  let r = render(tree(o.snap ?? null, 0));
  /** The page bundle answers again (its own return refresh), `at` ms since the epoch. */
  const page = (snap: Snapshot, at: number) => r.rerender(tree(snap, at));
  /** The page bundle's run fails with no answer held (evidenceOfAi: failed evidence). */
  const pageFails = (at: number) => r.rerender(tree(null, at, ERR));
  /** Leaving the page and coming back: the section unmounts, then mounts again on the same core. */
  const remount = () => {
    r.unmount();
    r = render(tree(o.snap ?? null, 0));
  };
  /** The last save lands now: the agents list shows it from the next read. */
  const land = () => landed?.();
  return { sent, connect, goto, page, pageFails, remount, land };
}

const change = (part: 'helper' | 'bots') => userEvent.click(document.querySelector<HTMLElement>(`[data-def-change="${part}"]`)!);
const drawer = () => screen.getByRole('dialog');
const option = (name: RegExp) => within(drawer()).getByRole('option', { name });
const confirm = async (title?: string) => {
  const dlg = await screen.findByRole('alertdialog', title ? { name: title } : {});
  await userEvent.click(within(dlg).getByRole('button', { name: strings['impact.save'] }));
};
/** Find GPT-5 by search (an unknown pick is not in the Ready view) and choose it with consent. */
const chooseUnknownGpt5 = async () => {
  await userEvent.type(within(drawer()).getByRole('searchbox'), 'gpt-5');
  await userEvent.click(await within(drawer()).findByRole('option', { name: /GPT-5/ }));
  await userEvent.click(within(drawer()).getByRole('button', { name: chooser['unk.use'] }));
};

beforeEach(() => {
  boot();
  setTarget(A);
  // The picker's list is virtualized: jsdom lays out nothing, so give it a viewport to draw rows into.
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const caveat = strings['def.savedUnknown'].replace('{{computer}}', 'atlas');

describe('AI Default on the model chooser (the shared provider directory)', () => {
  it('a closed Change reads nothing; opening it reads once', async () => {
    const w = world();
    mount(w);
    await flush();
    expect(w.count).toBe(0);
    await change('helper');
    expect(w.count).toBe(1);
  });

  it('the Bots row lists ensembles; the helper row does not; neither offers Hoody Decide', async () => {
    const w = world();
    mount(w);
    await change('bots');
    await w.next({});
    expect(option(/Duo ensemble/)).toBeInTheDocument();
    expect(within(drawer()).queryByRole('option', { name: /Hoody safety checker/ })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await change('helper');
    await w.next({});
    expect(option(/GPT-5/)).toBeInTheDocument();
    expect(within(drawer()).queryByRole('option', { name: /Duo ensemble/ })).toBeNull();
    expect(within(drawer()).queryByRole('option', { name: /Hoody safety checker/ })).toBeNull();
  });

  it('a new Bots default says each Bot switches when its conversation restarts; the helper default does not', async () => {
    const w = world();
    mount(w);
    await change('bots');
    await w.next({});
    await userEvent.click(option(/GPT-5/));
    const bots = await screen.findByRole('alertdialog');
    expect(bots).toHaveTextContent(strings['impact.bots']);
    expect(bots).toHaveTextContent(/each when its conversation restarts/);
    // The effects are one list, an item each, never a stack of paragraphs.
    const items = within(bots).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(strings['impact.bots']);
    expect(bots.querySelectorAll('p').length === 0 || [...bots.querySelectorAll('p')].every((p) => !p.textContent?.includes(strings['impact.bots']))).toBe(true);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await change('helper');
    await w.next({});
    await userEvent.click(option(/GPT-5/));
    const helper = await screen.findByRole('alertdialog');
    expect(helper).toHaveTextContent(strings['impact.helper']);
    expect(helper).not.toHaveTextContent(/conversation restarts/);
  });

  it('a needs-setup pick sets up inline in the drawer, never jumping to Connect', async () => {
    const w = world();
    const { connect } = mount(w);
    await change('helper');
    await w.next({});
    await userEvent.type(within(drawer()).getByRole('searchbox'), 'sonnet');
    // The list opens on Ready: a model that needs setup is found under every readiness.
    await userEvent.click(await within(drawer()).findByRole('button', { name: pick['none.all'] }));
    await userEvent.click(await within(drawer()).findByRole('option', { name: /Claude Sonnet/ }));
    expect(await within(drawer()).findByRole('heading', { level: 4, name: /Set up Anthropic/ })).toBeInTheDocument();
    expect(connect).not.toHaveBeenCalled();
  });

  it('a ready pick opens the impact dialog; Confirm on the same evidence sends the pick', async () => {
    const w = world();
    const { sent } = mount(w);
    await change('helper');
    await w.next({});
    await userEvent.click(option(/GPT-5/));
    const dlg = await screen.findByRole('alertdialog');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['impact.save'] }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual(['global', 'general', 'openai/gpt-5', { defaultAgent: 'general' }]);
  });

  it('Confirm judges: a refresh that made the pick unknown sends nothing and reopens the chooser to choose again', async () => {
    const w = world();
    const { sent } = mount(w);
    await change('helper');
    await w.next({});
    await userEvent.click(option(/GPT-5/));
    const dlg = await screen.findByRole('alertdialog');
    // Back to the tab: the chooser reads again, and the ready list now fails (nothing can be proven ready).
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await w.next({ readyFails: true });
    await userEvent.click(within(dlg).getByRole('button', { name: strings['impact.save'] }));
    expect(sent).toHaveLength(0);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(within(drawer()).getByText(/can't be checked right now/)).toBeInTheDocument();
  });

  it('Confirm judges: a refresh that made the provider need setup sends nothing and reopens the chooser', async () => {
    const w = world();
    const { sent } = mount(w);
    await change('helper');
    await w.next({});
    await userEvent.click(option(/GPT-5/));
    const dlg = await screen.findByRole('alertdialog');
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await w.next({ openai: 'needs_key', ready: [FREE] });
    await userEvent.click(within(dlg).getByRole('button', { name: strings['impact.save'] }));
    expect(sent).toHaveLength(0);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(within(drawer()).getByText(/needs setup now/)).toBeInTheDocument();
  });

  it.each([
    ['freeOnly', 'helper'],
    ['freeOnly', 'bots'],
    ['manyReady', 'helper'],
    ['manyEnsembles', 'bots'],
  ] as const)(`over the 7k catalogue (%s) the %s row's Change opens with at most ${VIEW_MAX.ready} rows (its Ready view)`, async (scenario, part) => {
    mount(world7k(scenario));
    await change(part);
    await flush();
    await waitFor(() => expect(within(drawer()).getAllByRole('option').length).toBeGreaterThan(0));
    expect(drawnRows()).toBeGreaterThan(0);
    expect(drawnRows()).toBeLessThanOrEqual(VIEW_MAX.ready);
    expect(within(drawer()).getAllByRole('option').length).toBeLessThanOrEqual(VIEW_MAX.ready);
  });

  it("Your own endpoint and Set up on the AI page stay in the page: the Connect drawer opens, nothing leaves", async () => {
    const w = world();
    const { connect } = mount(w);
    await change('helper');
    await w.next({});
    await userEvent.click(within(drawer()).getByRole('button', { name: chooser['dir.endpoint'] }));
    expect(connect).toHaveBeenCalledWith(undefined, { endpoint: true });
  });
  it('Confirm judges the newest evidence: a page read that answered after the chooser\'s says GPT-5 needs setup; nothing is sent', async () => {
    const w = world();
    const { sent, page } = mount(w);
    await change('helper');
    await w.next({});
    await userEvent.click(option(/GPT-5/));
    const dlg = await screen.findByRole('alertdialog');
    // The page's return refresh (a shorter gap than the chooser's) answers: OpenAI needs a key now. The chooser does not read.
    const n = w.count;
    page(await snapOf({ openai: 'needs_key', ready: [FREE] }), Date.now() + 60_000);
    await flush();
    expect(w.count).toBe(n);
    await userEvent.click(within(dlg).getByRole('button', { name: strings['impact.save'] }));
    expect(sent).toHaveLength(0);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(within(drawer()).getByText(/needs setup now/)).toBeInTheDocument();
    // The chooser reads again, so it shows what Confirm saw (GPT-5 needs a key) rather than offering it as ready.
    expect(w.count).toBe(n + 1);
    await w.next({ openai: 'needs_key', ready: [FREE] });
    await waitFor(() => expect(within(drawer()).queryByRole('option', { name: /GPT-5/ })).toBeNull());
  });

  it.each([
    ['still running', false],
    ['failed', true],
  ] as const)('after the page\'s newer evidence refused Confirm, the reopened chooser shows that evidence while its re-read is %s: GPT-5 is not offered as ready again', async (_, fails) => {
    const w = world();
    const { sent, page } = mount(w);
    await change('helper');
    await w.next({});
    await userEvent.click(option(/GPT-5/));
    const dlg = await screen.findByRole('alertdialog');
    page(await snapOf({ openai: 'needs_key', ready: [FREE] }), Date.now() + 60_000);
    await flush();
    await userEvent.click(within(dlg).getByRole('button', { name: strings['impact.save'] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    if (fails) await w.next({ fails: true });
    // The Ready view holds only what is proven ready: GPT-5 needs a key now, so it is not there to pick again.
    expect(within(drawer()).queryByRole('option', { name: /GPT-5/ })).toBeNull();
    expect(within(drawer()).getByRole('option', { name: /Hoody Free/ })).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('an older page read never overrides the chooser\'s newer evidence: Confirm sends', async () => {
    const w = world();
    const { sent, page } = mount(w);
    await change('helper');
    await w.next({});
    await userEvent.click(option(/GPT-5/));
    page(await snapOf({ openai: 'needs_key', ready: [FREE] }), 1);
    await confirm();
    await waitFor(() => expect(sent).toHaveLength(1));
  });

  it('a newer failed page read holds no facts: it never overrides the chooser\'s answer, Confirm sends', async () => {
    const w = world();
    const { sent, pageFails } = mount(w);
    await change('helper');
    await w.next({});
    await userEvent.click(option(/GPT-5/));
    pageFails(Date.now() + 60_000);
    await confirm();
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]![2]).toBe('openai/gpt-5');
  });

  it('an ensemble keeps its name through Confirm and the saved message', async () => {
    const w = world();
    const { sent } = mount(w, { snap: await snapOf({}), apply: 'now' });
    await change('bots');
    await w.next({});
    await userEvent.click(option(/Duo ensemble/));
    await confirm(strings['impact.title'].replace('{{model}}', 'Duo ensemble'));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]![2]).toBe('fusion/duo');
    expect(await screen.findByText(strings['def.saved'].replace('{{model}}', 'Duo ensemble'))).toBeInTheDocument();
  });

  it('a Bots row set to an ensemble names it and tags it', async () => {
    mount(world(), { snap: await snapOf({}), bot: 'fusion/duo' });
    await flush();
    const row = document.querySelector<HTMLElement>('[data-def-change="bots"]')!.closest<HTMLElement>('[data-sg-row]')!;
    expect(row).toHaveTextContent('Duo ensemble');
    expect(row).not.toHaveTextContent(strings['name.model']);
  });

  it('a save of an unknown-readiness pick keeps the caveat', async () => {
    const w = world();
    const { sent } = mount(w, { apply: 'now' });
    await change('helper');
    await w.next({ readyFails: true });
    await chooseUnknownGpt5();
    await confirm();
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(await screen.findByText(caveat)).toBeInTheDocument();
    expect(screen.queryByText(strings['def.saved'].replace('{{model}}', 'GPT-5'))).toBeNull();
  });

  it('the unknown-readiness caveat stays in the row after the done flash ends (2.4 s)', async () => {
    const w = world();
    const { sent, page } = mount(w, { apply: 'now' });
    await change('helper');
    await w.next({ readyFails: true });
    await chooseUnknownGpt5();
    await confirm();
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(await screen.findByText(caveat)).toBeInTheDocument();
    // The page reads again (the defaults now hold the save): the row shows GPT-5.
    page(await snapOf({ openai: 'needs_key', ready: [FREE] }), 1);
    await flush();
    const row = () => document.querySelector<HTMLElement>('[data-def-change="helper"]')!.closest<HTMLElement>('[data-sg-row]')!;
    await waitFor(() => expect(row()).toHaveTextContent(/GPT-5/i));
    await act(async () => { await new Promise((r) => setTimeout(r, 2600)); });
    // The done flash is over; the caveat stays in the row's help.
    expect(screen.queryByText(caveat)).toBeNull();
    expect(row()).toHaveTextContent(strings['def.runsUnknown'].replace('{{computer}}', 'atlas'));
  }, 10_000);

  it('an unknown-readiness save confirmed later by Check again keeps the caveat', async () => {
    const w = world();
    const { sent } = mount(w, { apply: 'later' });
    await change('helper');
    await w.next({ readyFails: true });
    await chooseUnknownGpt5();
    await confirm();
    await waitFor(() => expect(sent).toHaveLength(1));
    await userEvent.click(await screen.findByRole('button', { name: /Check again/ }));
    expect(await screen.findByText(caveat)).toBeInTheDocument();
  });
});

// A save whose outcome is unknown is held by core (attempts), keyed by the computer, the realm
// and the agent, so leaving Settings and coming back shows it again with Check again: never a row a second change could go over.
describe('agent-model-held-write: an unknown default save outlives the page', () => {
  // The row's Change button; a held row (its outcome pending) has none: the kit takes a row's actions away while pending.
  const helperChange = () => document.querySelector<HTMLElement>('[data-def-change="helper"]');
  // The row's held banner: "may have gone through", or, after a Check again that did not find it yet, "still not there".
  const pendingBanner = () =>
    screen.queryAllByRole('alert').find((a) => [strings['def.notConfirmed'], strings['def.stillNot']].some((x) => a.textContent?.includes(x)));
  const saveGpt5 = async (w: ReturnType<typeof world>) => {
    await change('helper');
    await w.next({});
    await userEvent.click(option(/GPT-5/));
    await confirm();
  };

  it('a pending save shows again after leaving and coming back: Check again, Change disabled, nothing sent again', async () => {
    const w = world();
    const { sent, remount } = mount(w);
    await saveGpt5(w);
    await waitFor(() => expect(pendingBanner()).toBeDefined());
    remount();
    await flush();
    const banner = pendingBanner();
    expect(banner).toBeDefined();
    expect(within(banner!).getByRole('button', { name: /Check again/ })).toBeInTheDocument();
    expect(helperChange()).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sent).toHaveLength(1);
  });

  it('after coming back, Check again only reads: once the list shows the model the hold is released and the row says saved', async () => {
    const w = world();
    const { sent, remount, land } = mount(w, { snap: await snapOf({}) });
    await saveGpt5(w);
    await waitFor(() => expect(pendingBanner()).toBeDefined());
    remount();
    await flush();
    // Not there yet: the read keeps it held.
    await userEvent.click(within(pendingBanner()!).getByRole('button', { name: /Check again/ }));
    expect(await screen.findByText(strings['def.stillNot'])).toBeInTheDocument();
    expect(helperChange()).toBeNull();
    land();
    await userEvent.click(within(pendingBanner()!).getByRole('button', { name: /Check again/ }));
    expect(await screen.findByText(strings['def.saved'].replace('{{model}}', 'GPT-5'))).toBeInTheDocument();
    expect(pendingBanner()).toBeUndefined();
    expect(helperChange()).not.toBeDisabled();
    expect(sent).toHaveLength(1);
    // Gone for good: coming back once more shows no held save.
    remount();
    await flush();
    expect(pendingBanner()).toBeUndefined();
    expect(helperChange()).not.toBeDisabled();
  });

  it('an unknown-readiness save keeps its caveat through leaving, coming back and Check again', async () => {
    const w = world();
    const { sent, remount, land } = mount(w);
    await change('helper');
    await w.next({ readyFails: true });
    await chooseUnknownGpt5();
    await confirm();
    await waitFor(() => expect(pendingBanner()).toBeDefined());
    remount();
    await flush();
    land();
    await userEvent.click(within(pendingBanner()!).getByRole('button', { name: /Check again/ }));
    expect(await screen.findByText(caveat)).toBeInTheDocument();
    expect(sent).toHaveLength(1);
  });

  it('Stop tracking, after its warning, lets the save go: Change works again and nothing is sent', async () => {
    const w = world();
    const { sent, remount } = mount(w);
    await saveGpt5(w);
    await waitFor(() => expect(pendingBanner()).toBeDefined());
    remount();
    await flush();
    await userEvent.click(within(pendingBanner()!).getByRole('button', { name: /Stop tracking/ }));
    // The page's own model-specific warning, not the kit's generic one: the change may still land later,
    // even over a model chosen next.
    const ask = await screen.findByRole('alertdialog', { name: strings['def.stop.title'] });
    expect(ask).toHaveTextContent(strings['def.stop.body']);
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    await userEvent.click(within(ask).getByRole('button', { name: strings['def.stop.confirm'] }));
    await waitFor(() => expect(helperChange()).not.toBeDisabled());
    expect(pendingBanner()).toBeUndefined();
    expect(sent).toHaveLength(1);
  });
});

