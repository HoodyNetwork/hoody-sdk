// The Bots callers on the kit chooser. Page-level, so the drawers'
// props may change freely. (1) New Bot offers the Agent's default (inherit) and Create sends model ''. (2) The starting
// Hoody Free reads unknown when readiness cannot be read: Create asks Use it anyway and creates nothing until the
// person says so. (3) Consent belongs to the computer: after Use it anyway, a computer change asks again. (4) A trip
// to the AI page and back restores New Bot's typed fields from the handoff record. (5) Settings > Model offers the
// Agent's default, and picking it saves model ''.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Fixtures from '@app/fixtures';
import type * as Core from '@core';
import { capture, handoff, type providers } from '@core';
import { registerTargets, type ModelRow } from './data';
import { chooserComputer } from './model-adapters';
import page from './page';
import strings from './strings.en.json';

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const fail = (status = 500): Settled => ({ ok: false, err: { kind: 'failed', code: 'unexpected', status, retryAfter: null, details: {} } });

const FREE = 'hoody-ai/hoody-free';
const ROWS: ModelRow[] = [
  { spec: FREE, label: 'Hoody Free', provider: 'hoody-ai', providerLabel: 'Hoody AI', source: 'provider', ready: 'unknown', computerDefault: true },
  { spec: 'acme/model-1', label: 'Acme One', provider: 'acme', providerLabel: 'Acme', source: 'provider', ready: 'unknown', computerDefault: false },
  // A Hoody AI model that is not in Hoody's own form (it reads "A model"), and another provider's model (kept whole).
  { spec: 'hoody-ai/up-widget', label: 'Upstream: Widget', provider: 'hoody-ai', providerLabel: 'Hoody AI', source: 'provider', ready: 'unknown', computerDefault: false },
  { spec: 'gizmos/gizmo', label: 'Upstream: Gizmo', provider: 'gizmos', providerLabel: 'Gizmos', source: 'provider', ready: 'unknown', computerDefault: false },
  // Another one, named by a single word: it reads "A model" too.
  { spec: 'hoody-ai/upstream', label: 'Upstream', provider: 'hoody-ai', providerLabel: 'Hoody AI', source: 'provider', ready: 'unknown', computerDefault: false },
];
const R_MAIN = 'a1b2c3d4e5f60718293a4b5c';
// Scout holds an explicit model (Chief holds none, so the Agent's default would be no change for it).
const SCOUT = `c-cinder~${R_MAIN}~scout`;

const W = vi.hoisted(() => ({ catalogueFails: false, hold: false, sent: [] as { model: unknown; route: string; revision?: unknown }[], readOn: [] as string[] }));

// The computer's answers as the kit catalogue reads them (providers, models, ready models).
const BODIES = {
  providers: { providers: [{ id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', status: { state: 'ready', via: 'included', methods: [] } }, { id: 'acme', prefix: 'acme/', display_name: 'Acme', status: { state: 'needs_key', methods: ['api_key'] } }] },
  models: { models: ROWS.map((r) => ({ spec: r.spec, display_name: r.label })) },
  ready: { models: [{ spec: FREE }] },
};

vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  const none = () => Promise.resolve(fail());
  // `hold`: the computer never answers (the first read stays unsettled).
  const answer = (r: () => Settled): Promise<Settled> => (W.hold ? new Promise<Settled>(() => undefined) : Promise.resolve(r()));
  const api = (target?: Core.Target): providers.ProvidersApi => ({
    version: () => Promise.resolve(ok({ capabilities: [] })),
    providers: () => {
      W.readOn.push(target?.container.id ?? '');
      return answer(() => (W.catalogueFails ? fail() : ok(BODIES.providers)));
    },
    models: (q: { ready?: boolean } = {}) => answer(() => (W.catalogueFails ? fail() : ok(q.ready ? BODIES.ready : BODIES.models))),
    provider: none, auth: () => Promise.resolve(ok({ auth: { ready: false } })),
    catalogue: none as never,
    oauthPoll: none, pkcePoll: none, pkceStart: none, pkceCode: none, pkceCancel: none,
    keyPut: none, keyDelete: none, authTest: none, authDefault: none, oauthStart: none, oauthCancel: none, signOut: none,
  });
  // Every create (POST /bots) and Bot PATCH that carries a model is recorded; the real call still answers.
  const recorded: typeof real.api = ((route: { path?: string; method?: string }, opts?: { body?: Record<string, unknown> }) => {
    if (opts?.body && 'model' in opts.body) W.sent.push({ model: opts.body.model, route: `${route.method ?? ''} ${route.path ?? ''}` });
    return (real.api as (...a: unknown[]) => unknown)(route, opts);
  }) as typeof real.api;
  return { ...real, api: recorded, providers: { ...real.providers, providersApi: (t?: Core.Target) => api(t) } };
});

vi.mock('@app/fixtures', async (orig) => {
  const fx = await orig<typeof Fixtures>();
  return {
    ...fx,
    fixtureSource: (pageId: string) => {
      const real = fx.fixtureSource(pageId);
      return {
        ...real,
        useQuery: <T,>(key: string) => {
          const r = real.useQuery<T>(key);
          return pageId === 'bots' && key === 'models' && r.data ? { ...r, data: ROWS as unknown as T } : r;
        },
        // Fixture mode runs a change through the page source's mutation with its vars: record the model a create or a
        // Settings save carries (live mode goes through @core api, recorded above).
        useMutation: <T, V = void>(key: string) => {
          const mu = real.useMutation<T, V>(key);
          if (pageId !== 'bots' || (key !== 'createBot' && key !== 'saveSettings')) return mu;
          const note = (vars: unknown): void => {
            const v = vars as { model?: unknown; patch?: { model?: unknown }; revision?: unknown } | undefined;
            if (key === 'createBot' && v && 'model' in v) W.sent.push({ model: v.model, route: 'POST /bots' });
            if (key === 'saveSettings' && v?.patch && 'model' in v.patch) W.sent.push({ model: v.patch.model, route: 'PATCH /bots/:id', revision: v.revision });
          };
          return { ...mu, mutateAsync: (vars: V, o?: unknown) => { note(vars); return (mu.mutateAsync as (a: V, b?: unknown) => Promise<unknown>)(vars, o); } } as typeof mu;
        },
      };
    },
  };
});

beforeEach(() => {
  W.catalogueFails = false;
  W.hold = false;
  W.sent = [];
  W.readOn = [];
  handoff.removeHandoff('c-atlas'); // a trip left by an earlier case (only this account's entry)
});

const MC = { inherit: "Agent's default", use: 'Use it anyway' };
// The chooser draws its list again once the computer's catalogue settles: wait for the ready Hoody Free row first, so a
// press lands on the list the person sees.
const settled = (root: HTMLElement) => within(root).findByRole('option', { name: /Hoody Free/ }, { timeout: 8000 });
// The same after a read that failed: the chooser says so, and the rows drawn then are the ones a press reaches.
const failedRead = (root: HTMLElement) => within(root).findByText(/Models couldn't be read/, undefined, { timeout: 8000 });

async function openNewBot(extra = '') {
  await renderPage(page, { path: `/bots?drawer=new&initial=c-atlas${extra}` });
  return screen.findByRole('dialog', { name: strings['newBot.title'] }, { timeout: 8000 });
}
// The form names the held model in one row; Change swaps the drawer's body for the chooser (the same dialog, named
// "Choose a model" meanwhile), and a pick or Back returns to the form.
const openChooser = async (d: HTMLElement) => {
  await userEvent.click(await within(d).findByRole('button', { name: strings['newBot.model.changeName'] }, { timeout: 8000 }));
  return d;
};
const backToForm = (d: HTMLElement) => userEvent.click(within(d).getByRole('button', { name: strings['newBot.model.back'] }));
// The form's own sign that the computer's models are read: the held Hoody Free reads Included.
const formSettled = (d: HTMLElement) => within(d).findByText(strings['newBot.model.included'], undefined, { timeout: 8000 });
// A trip back lands in the chooser it left from; Back shows the form with what was typed.
const tripForm = async () => {
  const d = await screen.findByRole('dialog', { name: strings['newBot.model.pick'] }, { timeout: 8000 });
  await backToForm(d);
  return screen.findByRole('dialog', { name: strings['newBot.title'] }, { timeout: 8000 });
};
const createButton = (d: HTMLElement) => within(d).getByRole('button', { name: strings['newBot.create'] });
const creates = () => W.sent.filter((s) => s.route.startsWith('POST'));

describe('New Bot on the kit chooser', () => {
  it('control (green with or without the kit chooser): Create with a ready Hoody Free sends it at once, and the recorder sees it', async () => {
    const dialog = await openNewBot();
    await formSettled(dialog);
    await userEvent.click(createButton(dialog));
    await waitFor(() => expect(creates()).toHaveLength(1));
    expect(creates()[0]).toEqual({ model: FREE, route: 'POST /bots' });
  });

  it("offers the Agent's default, and Create with it sends model '' (no readiness claim, no consent)", async () => {
    const dialog = await openNewBot();
    await openChooser(dialog);
    await settled(dialog);
    await userEvent.click(within(dialog).getByRole('option', { name: new RegExp(MC.inherit) }));
    // The pick returns to the form, whose Model row now names it.
    expect(await within(dialog).findByText(strings['newBot.model.inherit'])).toBeInTheDocument();
    await userEvent.click(createButton(dialog));
    await waitFor(() => expect(creates()).toHaveLength(1));
    expect(creates()[0]?.model).toBe('');
  });

  it('an unknown Hoody Free at Create asks Use it anyway and creates nothing until the person says so', async () => {
    W.catalogueFails = true;
    const dialog = await openNewBot();
    await userEvent.click(createButton(dialog));
    const use = await within(dialog).findByRole('button', { name: MC.use }, { timeout: 8000 });
    expect(creates()).toHaveLength(0);
    await userEvent.click(use);
    await userEvent.click(createButton(dialog));
    await waitFor(() => expect(creates()).toHaveLength(1));
    expect(creates()[0]?.model).toBe(FREE);
  });

  it('consent belongs to the computer: after Use it anyway, changing the computer asks again', async () => {
    W.catalogueFails = true;
    const dialog = await openNewBot();
    await userEvent.click(createButton(dialog));
    await userEvent.click(await within(dialog).findByRole('button', { name: MC.use }, { timeout: 8000 }));
    await userEvent.click(within(dialog).getByRole('button', { name: new RegExp(strings['picker.computer.label']) }));
    const list = await screen.findByRole('dialog', { name: strings['picker.computer.label'] });
    await userEvent.click(within(list).getByText('cinder'));
    await userEvent.click(createButton(dialog));
    expect(await within(dialog).findByRole('button', { name: MC.use })).toBeInTheDocument();
    expect(creates()).toHaveLength(0);
  });

  it('a trip to the AI page and back restores the typed name and instructions from the handoff record', async () => {
    const r = await renderPage(page, { path: '/bots' });
    const ctx = capture();
    const id = handoff.newHandoffId();
    const draft = { kind: 'newBot' as const, name: 'Quiet Heron', instructions: 'Answer in French.', link: false, computer: 'c-atlas', model: { spec: FREE, consent: false } };
    const scope = { account: String(ctx.account ?? ''), realm: ctx.realm, computer: 'c-atlas', gen: ctx.gen, boot: '' };
    const href = '/bots?drawer=new&initial=c-atlas';
    // The trip as the chooser writes it before leaving; the harness must be able to store it (else this test proves nothing).
    expect(handoff.writeHandoff({ v: 1, id, at: Date.now(), scope, origin: { page: 'bots', href, label: 'New Bot', focus: 'model' }, target: { computer: 'c-atlas', name: 'atlas' }, dest: 'connect', draft })).toBe(true);
    await act(async () => { r.router.history.push(`${href}&handoff=${id}`); await r.router.load(); });
    const dialog = await tripForm();
    expect(await within(dialog).findByDisplayValue('Quiet Heron', undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('Answer in French.')).toBeInTheDocument();
  });

  it('a trip back that brought consent is taken once: Change opens the chooser again and it stays open', async () => {
    W.catalogueFails = true;
    const href = '/bots?drawer=new&initial=c-atlas';
    const r = await renderPage(page, { path: href });
    const d0 = await screen.findByRole('dialog', { name: strings['newBot.title'] }, { timeout: 8000 });
    await openChooser(d0);
    await failedRead(d0);
    await userEvent.click(within(d0).getByRole('button', { name: 'Open the AI page' }));
    await waitFor(() => expect(r.router.state.location.pathname).not.toBe('/bots'));
    // The trip as the chooser stored it (its real scope), now carrying consent for Hoody Free.
    const left = handoff.handoffAtOrigin('c-atlas', href);
    expect(left?.draft?.kind).toBe('newBot');
    if (left?.draft?.kind !== 'newBot') return;
    expect(handoff.writeHandoff({ ...left, draft: { ...left.draft, model: { spec: FREE, consent: true } } })).toBe(true);
    W.catalogueFails = false;
    await act(async () => { r.router.history.back(); await r.router.load(); });
    // The chooser takes the trip's consent on a fresh read and hands the model back: the form shows again.
    const d = await screen.findByRole('dialog', { name: strings['newBot.title'] }, { timeout: 8000 });
    await openChooser(d);
    await settled(d);
    // Give a replayed trip every chance to hand the model back again (that would close the chooser).
    await act(async () => { await new Promise((res) => setTimeout(res, 1500)); });
    expect(screen.getByRole('dialog', { name: strings['newBot.model.pick'] })).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('option', { name: new RegExp(MC.inherit) }));
    expect(await screen.findByRole('dialog', { name: strings['newBot.title'] })).toBeInTheDocument();
    expect(within(d).getByText(strings['newBot.model.inherit'])).toBeInTheDocument();
  });
});

describe('the Bots side of the old picker contracts (model.picker.target / setup / lag)', () => {
  it('reads the computer chosen for the Bot, and reads the new one after a computer change', async () => {
    const dialog = await openNewBot();
    await formSettled(dialog);
    expect(W.readOn).toContain('c-atlas');
    expect(W.readOn).not.toContain('c-cinder');
    await userEvent.click(within(dialog).getByRole('button', { name: new RegExp(strings['picker.computer.label']) }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: strings['picker.computer.label'] })).getByText('cinder'));
    await waitFor(() => expect(W.readOn).toContain('c-cinder'));
  });

  it('before the first read settles, Create says it is still checking and makes no Bot', async () => {
    W.hold = true;
    const dialog = await openNewBot();
    await waitFor(() => expect(W.readOn).toContain('c-atlas'));
    await userEvent.click(createButton(dialog));
    expect(await within(dialog).findByText(strings['model.why.unread'])).toBeInTheDocument();
    expect(creates()).toHaveLength(0);
  });

  it("a failed read keeps this page's rows as Can't tell; one is used with the person's say-so and created", async () => {
    W.catalogueFails = true;
    const dialog = await openNewBot();
    await openChooser(dialog);
    await failedRead(dialog);
    await userEvent.click(within(dialog).getByRole('option', { name: /Acme One/ }));
    // The chooser's own consent bar, before anything is held.
    await userEvent.click(await within(dialog).findByRole('button', { name: MC.use }));
    await userEvent.click(createButton(dialog));
    await waitFor(() => expect(creates()).toHaveLength(1));
    expect(creates()[0]?.model).toBe('acme/model-1');
  });

  it('typing in the model search writes nothing to the address', async () => {
    const r = await renderPage(page, { path: '/bots?drawer=new&initial=c-atlas' });
    const dialog = await screen.findByRole('dialog', { name: strings['newBot.title'] });
    await openChooser(dialog);
    await settled(dialog);
    const before = r.router.state.location.href;
    await userEvent.type(within(dialog).getByRole('searchbox'), 'acme');
    expect(r.router.state.location.href).toBe(before);
  });
});

describe('the trip back from the AI page', () => {
  const trip = (computer: string, draft: handoff.Handoff['draft'], href: string) => {
    const ctx = capture();
    const id = handoff.newHandoffId();
    const scope = { account: String(ctx.account ?? ''), realm: ctx.realm, computer, gen: ctx.gen, boot: '' };
    expect(handoff.writeHandoff({ v: 1, id, at: Date.now(), scope, origin: { page: 'bots', href, label: 'x', focus: 'model' }, target: { computer, name: computer }, dest: 'connect', draft })).toBe(true);
    return id;
  };

  it('takes ?handoff= off the address once read, so Back or a reload never restores it twice', async () => {
    const r = await renderPage(page, { path: '/bots' });
    const href = '/bots?drawer=new&initial=c-atlas';
    const id = trip('c-atlas', { kind: 'newBot', name: 'Quiet Heron', instructions: '', link: false, computer: 'c-atlas', model: { spec: FREE, consent: false } }, href);
    await act(async () => { r.router.history.push(`${href}&handoff=${id}`); await r.router.load(); });
    const dialog = await tripForm();
    await within(dialog).findByDisplayValue('Quiet Heron', undefined, { timeout: 8000 });
    await waitFor(() => expect(r.router.state.location.search).not.toHaveProperty('handoff'));
  });

  it('a trip written for another computer restores nothing', async () => {
    const r = await renderPage(page, { path: '/bots' });
    const id = trip('c-atlas', { kind: 'newBot', name: 'Quiet Heron', instructions: '', link: false, computer: 'c-atlas', model: { spec: FREE, consent: false } }, '/bots?drawer=new&initial=c-atlas');
    await act(async () => { r.router.history.push(`/bots?drawer=new&initial=c-cinder&handoff=${id}`); await r.router.load(); });
    const dialog = await screen.findByRole('dialog', { name: strings['newBot.title'] }, { timeout: 8000 });
    await formSettled(dialog);
    expect(within(dialog).queryByDisplayValue('Quiet Heron')).toBeNull();
  });

  it('Settings: the restored text comes back on its old revision, so a Bot changed meanwhile shows Changed elsewhere', async () => {
    const r = await renderPage(page, { path: '/bots' });
    const SCOUT_UID = '0192f3a0-7c11-7552-8b1d-5c0a9e3f4d05';
    const href = `/bots?sel=${encodeURIComponent(SCOUT)}&settings=behaviour`;
    // The fixture Scout is at guardrail revision 3; the trip left at revision 2.
    const id = trip('c-cinder', { kind: 'settings', botKey: SCOUT, uid: SCOUT_UID, revision: 2, name: 'Scout', role: 'Watches deploys and reports failures', instructions: 'Typed before the trip.', rules: '' }, href);
    await act(async () => { r.router.history.push(`${href}&handoff=${id}`); await r.router.load(); });
    expect(await screen.findByDisplayValue('Typed before the trip.', undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(await screen.findByText(strings['settings.stale'])).toBeInTheDocument();
  });

  it("a trip back that held the Agent's default restores it, and Create sends model ''", async () => {
    const r = await renderPage(page, { path: '/bots' });
    const href = '/bots?drawer=new&initial=c-atlas';
    const id = trip('c-atlas', { kind: 'newBot', name: 'Quiet Heron', instructions: '', link: false, computer: 'c-atlas', model: { spec: '', consent: false } }, href);
    await act(async () => { r.router.history.push(`${href}&handoff=${id}`); await r.router.load(); });
    const chooser = await screen.findByRole('dialog', { name: strings['newBot.model.pick'] }, { timeout: 8000 });
    await settled(chooser);
    await backToForm(chooser);
    const dialog = await screen.findByRole('dialog', { name: strings['newBot.title'] }, { timeout: 8000 });
    await within(dialog).findByDisplayValue('Quiet Heron', undefined, { timeout: 8000 });
    expect(within(dialog).getByText(strings['newBot.model.inherit'])).toBeInTheDocument();
    await userEvent.click(createButton(dialog));
    await waitFor(() => expect(creates()).toHaveLength(1));
    expect(creates()[0]?.model).toBe('');
  });

  it('Settings: a trip for the same address but a Bot made again (another uid) restores nothing', async () => {
    const r = await renderPage(page, { path: '/bots' });
    const href = `/bots?sel=${encodeURIComponent(SCOUT)}&settings=behaviour`;
    const id = trip('c-cinder', { kind: 'settings', botKey: SCOUT, uid: '0192f3a0-0000-7000-8000-000000000000', revision: 3, name: 'Scout', role: 'Watches deploys and reports failures', instructions: 'Typed before the trip.', rules: '' }, href);
    await act(async () => { r.router.history.push(`${href}&handoff=${id}`); await r.router.load(); });
    await waitFor(() => expect(r.router.state.location.search).not.toHaveProperty('handoff'));
    expect(screen.queryByDisplayValue('Typed before the trip.')).toBeNull();
  });

  it("Settings never takes, or removes, a trip New Bot left on the Bot's computer", async () => {
    const r = await renderPage(page, { path: '/bots' });
    const href = `/bots?sel=${encodeURIComponent(SCOUT)}&settings=behaviour`;
    const id = trip('c-cinder', { kind: 'newBot', name: 'Quiet Heron', instructions: '', link: false, computer: 'c-cinder', model: { spec: FREE, consent: false } }, '/bots?drawer=new&initial=c-cinder');
    await act(async () => { r.router.history.push(`${href}&handoff=${id}`); await r.router.load(); });
    await waitFor(() => expect(r.router.state.location.search).not.toHaveProperty('handoff'));
    expect(handoff.readHandoff('c-cinder', id)?.draft?.kind).toBe('newBot');
    handoff.removeHandoff('c-cinder');
  });
});

describe('Bot Settings > Model on the kit chooser', () => {
  it('a pick the computer cannot confirm saves with the say-so, and the saved words say so', async () => {
    W.catalogueFails = true;
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(SCOUT)}&settings=model` });
    await failedRead(document.body);
    await userEvent.click(screen.getByRole('option', { name: /Acme One/ }));
    await userEvent.click(await screen.findByRole('button', { name: MC.use }));
    await waitFor(() => expect(W.sent.filter((s) => s.route.startsWith('PATCH'))).toHaveLength(1));
    expect(W.sent.find((s) => s.route.startsWith('PATCH'))?.model).toBe('acme/model-1');
    expect(await screen.findByText("Saved. We can't tell yet if it runs on cinder.")).toBeInTheDocument();
  });

  it("offers the Agent's default, and picking it saves model ''", async () => {
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(SCOUT)}&settings=model` });
    await settled(document.body);
    await userEvent.click(screen.getByRole('option', { name: new RegExp(MC.inherit) }));
    await waitFor(() => expect(W.sent.filter((s) => s.route.startsWith('PATCH'))).toHaveLength(1));
    expect(W.sent.find((s) => s.route.startsWith('PATCH'))?.model).toBe('');
  });
});

// A trip is taken once per opening; browser Back restores it; a returned
// Settings draft keeps its revision; leaving with Auto-approve Off says it will not come back; names are public names.
describe('the trip back, taken once and found again by browser Back', () => {
  const trip = (computer: string, draft: handoff.Handoff['draft'], href: string) => {
    const ctx = capture();
    const id = handoff.newHandoffId();
    const scope = { account: String(ctx.account ?? ''), realm: ctx.realm, computer, gen: ctx.gen, boot: '' };
    expect(handoff.writeHandoff({ v: 1, id, at: Date.now(), scope, origin: { page: 'bots', href, label: 'x', focus: 'model' }, target: { computer, name: computer }, dest: 'connect', draft })).toBe(true);
    return id;
  };
  const go = async (r: Awaited<ReturnType<typeof renderPage>>, href: string) => {
    await act(async () => { r.router.history.push(href); await r.router.load(); });
  };
  const nameBox = (d: HTMLElement) => within(d).getByRole('textbox', { name: strings['newBot.name'] });

  it('New Bot: a restored draft is used for that opening only; reopening, here or for another computer, starts fresh', async () => {
    const r = await renderPage(page, { path: '/bots' });
    const href = '/bots?drawer=new&initial=c-atlas';
    const id = trip('c-atlas', { kind: 'newBot', name: 'quiet-heron', instructions: 'Answer in French.', link: false, computer: 'c-atlas', model: { spec: FREE, consent: false } }, href);
    await go(r, `${href}&handoff=${id}`);
    const d1 = await tripForm();
    await within(d1).findByDisplayValue('quiet-heron', undefined, { timeout: 8000 });
    await go(r, '/bots');
    await go(r, '/bots?drawer=new&initial=c-cinder');
    const d2 = await screen.findByRole('dialog', { name: strings['newBot.title'] }, { timeout: 8000 });
    await formSettled(d2);
    expect(within(d2).queryByDisplayValue('quiet-heron')).toBeNull();
    expect(within(d2).queryByDisplayValue('Answer in French.')).toBeNull();
    expect(within(d2).getByRole('button', { name: new RegExp(strings['picker.computer.label']) })).toHaveTextContent('cinder');
    await go(r, '/bots');
    await go(r, href);
    const d3 = await screen.findByRole('dialog', { name: strings['newBot.title'] }, { timeout: 8000 });
    await formSettled(d3);
    expect(within(d3).queryByDisplayValue('quiet-heron')).toBeNull();
  });

  it('Settings: a restored draft is used for that opening only; closing and opening again shows what the Bot holds', async () => {
    const r = await renderPage(page, { path: '/bots' });
    const SCOUT_UID = '0192f3a0-7c11-7552-8b1d-5c0a9e3f4d05';
    const href = `/bots?sel=${encodeURIComponent(SCOUT)}&settings=behaviour`;
    const id = trip('c-cinder', { kind: 'settings', botKey: SCOUT, uid: SCOUT_UID, revision: 3, name: 'Scout', role: 'Watches deploys and reports failures', instructions: 'Typed before the trip.', rules: '' }, href);
    await go(r, `${href}&handoff=${id}`);
    expect(await screen.findByDisplayValue('Typed before the trip.', undefined, { timeout: 8000 })).toBeInTheDocument();
    await go(r, `/bots?sel=${encodeURIComponent(SCOUT)}`);
    await go(r, href);
    expect(await screen.findByDisplayValue(/Be brief and kind/, undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Typed before the trip.')).toBeNull();
  });

  it('New Bot: a link that names another computer while the drawer is open starts fresh there', async () => {
    const r = await renderPage(page, { path: '/bots' });
    const href = '/bots?drawer=new&initial=c-atlas';
    const id = trip('c-atlas', { kind: 'newBot', name: 'quiet-heron', instructions: '', link: false, computer: 'c-atlas', model: { spec: FREE, consent: false } }, href);
    await go(r, `${href}&handoff=${id}`);
    const d1 = await tripForm();
    await within(d1).findByDisplayValue('quiet-heron', undefined, { timeout: 8000 });
    await go(r, '/bots?drawer=new&initial=c-cinder');
    const d2 = await screen.findByRole('dialog', { name: strings['newBot.title'] }, { timeout: 8000 });
    await waitFor(() => expect(within(d2).getByRole('button', { name: new RegExp(strings['picker.computer.label']) })).toHaveTextContent('cinder'));
    expect(within(d2).queryByDisplayValue('quiet-heron')).toBeNull();
  });

  it('Settings: switching to another Bot and back while open never restores the trip again', async () => {
    const r = await renderPage(page, { path: '/bots' });
    const SCOUT_UID = '0192f3a0-7c11-7552-8b1d-5c0a9e3f4d05';
    const href = `/bots?sel=${encodeURIComponent(SCOUT)}&settings=behaviour`;
    const id = trip('c-cinder', { kind: 'settings', botKey: SCOUT, uid: SCOUT_UID, revision: 3, name: 'Scout', role: 'Watches deploys and reports failures', instructions: 'Typed before the trip.', rules: '' }, href);
    await go(r, `${href}&handoff=${id}`);
    expect(await screen.findByDisplayValue('Typed before the trip.', undefined, { timeout: 8000 })).toBeInTheDocument();
    await go(r, `/bots?sel=${encodeURIComponent('c-cinder~global~relay')}&settings=behaviour`);
    expect(await screen.findByDisplayValue('Relay', undefined, { timeout: 8000 })).toBeInTheDocument();
    await go(r, href);
    expect(await screen.findByDisplayValue('Scout', undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Typed before the trip.')).toBeNull();
  });

  it('Settings: after a Reload, the next opening still takes its trip', async () => {
    const r = await renderPage(page, { path: '/bots' });
    const SCOUT_UID = '0192f3a0-7c11-7552-8b1d-5c0a9e3f4d05';
    const href = `/bots?sel=${encodeURIComponent(SCOUT)}&settings=behaviour`;
    // A draft at an older revision shows Changed elsewhere; Reload takes the Bot as it is.
    const old = trip('c-cinder', { kind: 'settings', botKey: SCOUT, uid: SCOUT_UID, revision: 2, name: 'Scout', role: 'Watches deploys and reports failures', instructions: 'First trip.', rules: '' }, href);
    await go(r, `${href}&handoff=${old}`);
    await screen.findByText(strings['settings.stale'], undefined, { timeout: 8000 });
    await userEvent.click(screen.getByRole('button', { name: /Reload/ }));
    expect(await screen.findByDisplayValue(/Be brief and kind/, undefined, { timeout: 8000 })).toBeInTheDocument();
    await go(r, `/bots?sel=${encodeURIComponent(SCOUT)}`);
    const next = trip('c-cinder', { kind: 'settings', botKey: SCOUT, uid: SCOUT_UID, revision: 3, name: 'Scout', role: 'Watches deploys and reports failures', instructions: 'Second trip.', rules: '' }, href);
    await go(r, `${href}&handoff=${next}`);
    expect(await screen.findByDisplayValue('Second trip.', undefined, { timeout: 8000 })).toBeInTheDocument();
  });

  it('New Bot (Bots page alone): Back to the replaced origin entry brings back what was typed', async () => {
    W.catalogueFails = true;
    const r = await renderPage(page, { path: '/bots?drawer=new&initial=c-atlas' });
    const d = await screen.findByRole('dialog', { name: strings['newBot.title'] }, { timeout: 8000 });
    await userEvent.clear(nameBox(d));
    await userEvent.type(nameBox(d), 'quiet-heron');
    await openChooser(d);
    await failedRead(d);
    await userEvent.click(within(d).getByRole('button', { name: 'Open the AI page' }));
    await waitFor(() => expect(r.router.state.location.pathname).not.toBe('/bots'));
    await act(async () => { r.router.history.back(); await r.router.load(); });
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/bots'));
    const back = await tripForm();
    expect(await within(back).findByDisplayValue('quiet-heron', undefined, { timeout: 8000 })).toBeInTheDocument();
  });

  // Not a round trip (no shell, no AI page): the return address AI's Go back would open. The real round trips, through
  // the shell and AI's own Go back, are model.roundtrip.test.tsx.
  it("New Bot: the trip's return address brings back what was typed, once", async () => {
    W.catalogueFails = true;
    const r = await renderPage(page, { path: '/bots?drawer=new&initial=c-atlas' });
    const d = await screen.findByRole('dialog', { name: strings['newBot.title'] }, { timeout: 8000 });
    await userEvent.clear(nameBox(d));
    await userEvent.type(nameBox(d), 'quiet-heron');
    await openChooser(d);
    await failedRead(d);
    await userEvent.click(within(d).getByRole('button', { name: 'Open the AI page' }));
    await waitFor(() => expect(r.router.state.location.pathname).not.toBe('/bots'));
    const id = String((r.router.state.location.search as Record<string, unknown>).handoff ?? '');
    const h = handoff.readHandoff('c-atlas', id);
    expect(h?.draft?.kind).toBe('newBot');
    await go(r, handoff.handoffReturnHref(h as handoff.Handoff));
    const back = await tripForm();
    expect(await within(back).findByDisplayValue('quiet-heron', undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(handoff.readHandoff('c-atlas', id), 'taken: Back or a reload never restores it again').toBeNull();
  });

  it('Settings (Bots page alone): Back to the replaced origin entry brings back the typed instructions', async () => {
    W.catalogueFails = true;
    const r = await renderPage(page, { path: `/bots?sel=${encodeURIComponent(SCOUT)}&settings=behaviour` });
    const box = await screen.findByRole('textbox', { name: strings['behaviour.instructions'] }, { timeout: 8000 });
    await userEvent.clear(box);
    await userEvent.type(box, 'Typed before the trip.');
    await go(r, `/bots?sel=${encodeURIComponent(SCOUT)}&settings=model`);
    await failedRead(document.body);
    await userEvent.click(screen.getByRole('button', { name: 'Open the AI page' }));
    await waitFor(() => expect(r.router.state.location.pathname).not.toBe('/bots'));
    await act(async () => { r.router.history.back(); await r.router.load(); });
    await failedRead(document.body);
    await go(r, `/bots?sel=${encodeURIComponent(SCOUT)}&settings=behaviour`);
    expect(await screen.findByDisplayValue('Typed before the trip.', undefined, { timeout: 8000 })).toBeInTheDocument();
  });
});

describe('Settings keeps a returned draft on its own revision', () => {
  it('a Bot changed during the trip shows Changed elsewhere even when the returned text matches, and a save sends the draft revision', async () => {
    const r = await renderPage(page, { path: '/bots' });
    const SCOUT_UID = '0192f3a0-7c11-7552-8b1d-5c0a9e3f4d05';
    const href = `/bots?sel=${encodeURIComponent(SCOUT)}&settings=model`;
    const ctx = capture();
    const id = handoff.newHandoffId();
    const draft = { kind: 'settings' as const, botKey: SCOUT, uid: SCOUT_UID, revision: 2, name: 'Scout', role: 'Watches deploys and reports failures', instructions: 'Be brief and kind. Ask before anything that costs money. Never reveal keys or addresses.', rules: 'Never delete data without asking.\nStay inside the shop repository.' };
    expect(handoff.writeHandoff({ v: 1, id, at: Date.now(), scope: { account: String(ctx.account ?? ''), realm: ctx.realm, computer: 'c-cinder', gen: ctx.gen, boot: '' }, origin: { page: 'bots', href, label: 'x', focus: 'model' }, target: { computer: 'c-cinder', name: 'cinder' }, dest: 'connect', draft })).toBe(true);
    await act(async () => { r.router.history.push(`${href}&handoff=${id}`); await r.router.load(); });
    expect(await screen.findByText(strings['settings.stale'], undefined, { timeout: 8000 })).toBeInTheDocument();
    await settled(document.body);
    await userEvent.click(screen.getByRole('option', { name: new RegExp(MC.inherit) }));
    await waitFor(() => expect(W.sent.filter((s) => s.route.startsWith('PATCH'))).toHaveLength(1));
    expect(W.sent.find((s) => s.route.startsWith('PATCH'))?.revision).toBe(2);
  });
});

describe('Auto-approve on a trip', () => {
  it('leaving with Auto-approve Off says that choice will not come back, and Stay keeps it Off', async () => {
    W.catalogueFails = true;
    const r = await renderPage(page, { path: '/bots?drawer=new&initial=c-atlas' });
    const d = await screen.findByRole('dialog', { name: strings['newBot.title'] }, { timeout: 8000 });
    const sw = () => within(d).getByRole('switch', { name: strings['newBot.auto'] });
    await userEvent.click(sw());
    expect(sw()).not.toBeChecked();
    await openChooser(d);
    await failedRead(d);
    await userEvent.click(within(d).getByRole('button', { name: 'Open the AI page' }));
    expect(await within(d).findByText(`Unsaved changes in ${strings['newBot.auto']} won't come back. Save first, or leave without them.`)).toBeInTheDocument();
    expect(r.router.state.location.pathname).toBe('/bots');
    await userEvent.click(within(d).getByRole('button', { name: 'Stay' }));
    await backToForm(d);
    expect(sw()).not.toBeChecked();
  });
});

describe('model names around the chooser are public names', () => {
  it("a failed read names a Hoody AI model that is not in Hoody's own form \"A model\" and keeps another provider's name whole; Create's words use that word", async () => {
    W.catalogueFails = true;
    const r = await renderPage(page, { path: '/bots' });
    const ctx = capture();
    const id = handoff.newHandoffId();
    const href = '/bots?drawer=new&initial=c-atlas';
    const draft = { kind: 'newBot' as const, name: 'quiet-heron', instructions: '', link: false, computer: 'c-atlas', model: { spec: 'hoody-ai/up-widget', consent: false } };
    expect(handoff.writeHandoff({ v: 1, id, at: Date.now(), scope: { account: String(ctx.account ?? ''), realm: ctx.realm, computer: 'c-atlas', gen: ctx.gen, boot: '' }, origin: { page: 'bots', href, label: 'x', focus: 'model' }, target: { computer: 'c-atlas', name: 'atlas' }, dest: 'connect', draft })).toBe(true);
    await act(async () => { r.router.history.push(`${href}&handoff=${id}`); await r.router.load(); });
    const d = await screen.findByRole('dialog', { name: strings['newBot.model.pick'] }, { timeout: 8000 });
    await failedRead(d);
    expect(within(d).getAllByRole('option', { name: new RegExp(`^${strings['model.anyName']}`) })).toHaveLength(2);
    expect(within(d).getByRole('option', { name: /Upstream: Gizmo/ })).toBeInTheDocument();
    expect(within(d).queryByRole('option', { name: /Widget/ })).toBeNull();
    await backToForm(d);
    // The form's Model row names the held model by the same word.
    expect(within(d).queryByText(/Widget/)).toBeNull();
    await userEvent.click(createButton(d));
    expect(await within(d).findByText(`We can't tell yet if ${strings['model.anyNameMid']} runs on atlas. Use it anyway, or choose another model.`)).toBeInTheDocument();
    expect(within(d).queryByText(/Widget/)).toBeNull();
  });
});

describe('a Hoody AI model with no name to show', () => {
  it('reads "A model" in the failed-read rows and in Create\'s words, never the raw spec', async () => {
    W.catalogueFails = true;
    const r = await renderPage(page, { path: '/bots' });
    const ctx = capture();
    const id = handoff.newHandoffId();
    const href = '/bots?drawer=new&initial=c-atlas';
    const draft = { kind: 'newBot' as const, name: 'quiet-heron', instructions: '', link: false, computer: 'c-atlas', model: { spec: 'hoody-ai/upstream', consent: false } };
    expect(handoff.writeHandoff({ v: 1, id, at: Date.now(), scope: { account: String(ctx.account ?? ''), realm: ctx.realm, computer: 'c-atlas', gen: ctx.gen, boot: '' }, origin: { page: 'bots', href, label: 'x', focus: 'model' }, target: { computer: 'c-atlas', name: 'atlas' }, dest: 'connect', draft })).toBe(true);
    await act(async () => { r.router.history.push(`${href}&handoff=${id}`); await r.router.load(); });
    const d = await screen.findByRole('dialog', { name: strings['newBot.model.pick'] }, { timeout: 8000 });
    await failedRead(d);
    expect(within(d).getAllByRole('option', { name: new RegExp(`^${strings['model.anyName']}`) })).toHaveLength(2);
    expect(within(d).getByRole('option', { name: /Upstream: Gizmo/ })).toBeInTheDocument();
    expect(within(d).queryAllByRole('option').map((o) => o.textContent ?? '').join(' ')).not.toMatch(/hoody-ai\//);
    await backToForm(d);
    await userEvent.click(createButton(d));
    expect(await within(d).findByText(`We can't tell yet if ${strings['model.anyNameMid']} runs on atlas. Use it anyway, or choose another model.`)).toBeInTheDocument();
    expect(within(d).queryByText(/hoody-ai\//)).toBeNull();
  });
});

describe('a Hoody AI model with no name to show, in Settings', () => {
  it('reads "A model" in Settings\' failed-read rows, never the raw spec', async () => {
    W.catalogueFails = true;
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(SCOUT)}&settings=model` });
    await failedRead(document.body);
    expect(screen.getAllByRole('option', { name: new RegExp(`^${strings['model.anyName']}`) }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('option').map((o) => o.textContent ?? '').join(' ')).not.toMatch(/hoody-ai\/|upstream$/i);
  });
});

describe('no read before the address', () => {
  it("the chooser gets no computer (so no read, the version read included) until the computer's address is known", () => {
    const computers = [{ id: 'c-new', name: 'newbox' }] as unknown as Parameters<typeof chooserComputer>[1];
    expect(chooserComputer('c-new', computers)).toBeNull();
    registerTargets([{ id: 'c-new', project_id: 'p-1', server_name: 'srv-new' }]);
    expect(chooserComputer('c-new', computers)?.row).toEqual({ id: 'c-new', project_id: 'p-1', server_name: 'srv-new' });
  });
});

describe('the model search on the Bots path', () => {
  it('shows what matches, hides what does not, and settles on the last thing typed', async () => {
    const dialog = await openNewBot();
    await openChooser(dialog);
    await settled(dialog);
    const search = within(dialog).getByRole('searchbox');
    await userEvent.type(search, 'acme');
    await waitFor(() => expect(within(dialog).getByRole('option', { name: /Acme One/ })).toBeInTheDocument());
    await waitFor(() => expect(within(dialog).queryByRole('option', { name: /Hoody Free/ })).toBeNull());
    await userEvent.type(search, 'x');
    await waitFor(() => expect(within(dialog).queryByRole('option', { name: /Acme One/ })).toBeNull());
    expect(within(dialog).getByText('No model or provider matches "acmex".')).toBeInTheDocument();
  });
});
