// The real round trip from a Bot drawer to the AI page and back, through the shell. Both
// pages are mounted in the app's router with the shell (as the app mounts them), the drawer leaves through the chooser's
// own "Open the AI page", the AI page shows its trip band, and the way back is AI's own Go back button or the
// browser's Back. Both drawers, on a Bot computer that is not the one the shell started on: what was typed comes back,
// a Settings draft keeps the revision it was typed on, and a trip is taken once.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Fixtures from '@app/fixtures';
import { loadCoreRules } from '@app/fixtures';
import type * as Core from '@core';
import { bootFixtureCore, capture, containersRoute, CoreQueryProvider, fixtureWorld, handoff, queryClient, reply, type providers } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness mounting the app's router with the shell, not page code
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line hub/page-boundaries -- a round-trip test mounting Bots and AI in the app's router, not page code
import { buildRouter } from '../../app/router';
// eslint-disable-next-line hub/page-boundaries -- a round-trip test mounting Bots and AI in the app's router, not page code
import aiPage from '../ai/page';
// eslint-disable-next-line hub/page-boundaries -- a round-trip test mounting Bots and AI in the app's router, not page code
import aiStrings from '../ai/strings.en.json';
import page from './page';
import strings from './strings.en.json';

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const fail = (status = 500): Settled => ({ ok: false, err: { kind: 'failed', code: 'unexpected', status, retryAfter: null, details: {} } });

const R_MAIN = 'a1b2c3d4e5f60718293a4b5c';
const SCOUT = `c-cinder~${R_MAIN}~scout`;
const BOT_COMPUTER = 'c-cinder';

const W = vi.hoisted(() => ({ catalogueFails: false, sent: [] as { route: string; patch?: Record<string, unknown>; revision?: unknown }[] }));

// The Bot computer's catalogue: it fails while the drawer is open, so the chooser offers "Open the AI page".
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  const none = () => Promise.resolve(fail());
  const api = (): providers.ProvidersApi => ({
    version: () => Promise.resolve(ok({ capabilities: [] })),
    providers: () => Promise.resolve(W.catalogueFails ? fail() : ok({ providers: [{ id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', status: { state: 'ready', via: 'included', methods: [] } }] })),
    models: (q: { ready?: boolean } = {}) => Promise.resolve(W.catalogueFails ? fail() : ok({ models: q.ready ? [{ spec: 'hoody-ai/hoody-free' }] : [{ spec: 'hoody-ai/hoody-free', display_name: 'Hoody Free' }] })),
    provider: none, auth: () => Promise.resolve(ok({ auth: { ready: false } })),
    catalogue: none as never,
    oauthPoll: none, pkcePoll: none, pkceStart: none, pkceCode: none, pkceCancel: none,
    keyPut: none, keyDelete: none, authTest: none, authDefault: none, oauthStart: none, oauthCancel: none, signOut: none,
  });
  return { ...real, providers: { ...real.providers, providersApi: () => api() } };
});

// Fixture mode runs a change through the page source's mutation: record each Settings save with the revision it carries.
vi.mock('@app/fixtures', async (orig) => {
  const fx = await orig<typeof Fixtures>();
  return {
    ...fx,
    fixtureSource: (pageId: string) => {
      const real = fx.fixtureSource(pageId);
      return {
        ...real,
        useMutation: <T, V = void>(key: string) => {
          const mu = real.useMutation<T, V>(key);
          if (pageId !== 'bots' || key !== 'saveSettings') return mu;
          const note = (vars: unknown): void => {
            const v = vars as { patch?: Record<string, unknown>; revision?: unknown } | undefined;
            W.sent.push({ route: 'PATCH /bots/:id', ...(v?.patch ? { patch: v.patch } : {}), revision: v?.revision });
          };
          return { ...mu, mutateAsync: (vars: V, o?: unknown) => { note(vars); return (mu.mutateAsync as (a: V, b?: unknown) => Promise<unknown>)(vars, o); } } as typeof mu;
        },
      };
    },
  };
});

beforeEach(() => {
  W.catalogueFails = true;
  W.sent = [];
});

const SLOW = { timeout: 8000 };

// Both pages load their views lazily. Loaded once here (the Bots specs' own warm-up), so the first case's waits time the
// round trip, not the first compile of both views (under host load that alone outlasted the 8 s band wait). Each case
// walks two pages through the shell; under load one takes 7-13 s, so each gets the Bots specs' 60 s, not the 15 s default.
beforeAll(async () => {
  await import('./view');
  // eslint-disable-next-line hub/page-boundaries -- warms the AI page's lazy view for this round-trip test, not page code
  await import('../ai/tab');
}, 60_000);

// The shell's computer list: the world's computers in the selected realm, and the Bots fixtures' cinder (the Bots'
// computer), so the shell can show the Bot's computer as it would live (a computer its list lacks is chosen again).
const shellComputers = reply(containersRoute, () => {
  const realm = capture().realm;
  const world = fixtureWorld.computers.filter((c) => realm === 'all' || c.realm_ids.includes(realm));
  const cinder = { id: BOT_COMPUTER, name: 'cinder', status: 'running', project_id: 'p-fixture', server_name: 'a2 Ashburn', realm_ids: [realm] };
  return { status: 200, body: { data: { computers: [...world, cinder] } } };
});

/** Bots and AI in the app's router, with the shell, starting at `path`. */
async function mountApp(path: string) {
  const rules = await loadCoreRules(['bots', 'ai'], null);
  bootFixtureCore({ rules: [shellComputers, ...rules] });
  queryClient.clear();
  // A trip an earlier case left for the Bot's computer goes (session storage outlives a render).
  handoff.removeHandoff(BOT_COMPUTER);
  const router = buildRouter([page, aiPage], { queryClient, shell: true, history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(
      <CoreQueryProvider>
        <RouterProvider router={router} />
      </CoreQueryProvider>,
    );
    await router.load();
  });
  const loc = () => router.state.location;
  const go = async (href: string) => {
    await act(async () => {
      await router.navigate({ href } as never);
    });
  };
  const back = async () => {
    await act(async () => {
      router.history.back();
      await router.load();
    });
  };
  return { router, loc, go, back };
}

const failedRead = (root: HTMLElement) => within(root).findByText(/Models couldn't be read/, undefined, SLOW);
const newBotDialog = () => screen.findByRole('dialog', { name: strings['newBot.title'] }, SLOW);
const nameBox = (d: HTMLElement) => within(d).getByRole('textbox', { name: strings['newBot.name'] });

/**
 * Leaves through the chooser and lands on the AI page with its band; the catalogue answers again from here, as a
 * computer would once set up. Returns the trip id the address carries.
 */
async function departToAI(app: Awaited<ReturnType<typeof mountApp>>, root: HTMLElement, origin: string): Promise<string> {
  await userEvent.click(within(root).getByRole('button', { name: 'Open the AI page' }));
  W.catalogueFails = false;
  await waitFor(() => expect(app.loc().pathname.startsWith('/ai')).toBe(true), SLOW);
  const band = aiStrings['ho.band'].replace('{{origin}}', origin).replace('{{computer}}', 'cinder');
  expect((await screen.findAllByText(band, undefined, SLOW)).length, 'the AI page shows the trip band').toBeGreaterThan(0);
  expect(capture().target?.container.id, 'the shell now shows the Bot computer').toBe(BOT_COMPUTER);
  const id = String((app.loc().search as Record<string, unknown>).handoff ?? '');
  expect(id).toMatch(/^[0-9a-f]{16}$/);
  return id;
}

/** AI's own Go back: the one on the trip band in its Connect drawer, the layer the person sees on top. */
async function pressGoBack() {
  const connect = screen.getByRole('dialog', { name: aiStrings['connect.title'] });
  await userEvent.click(within(connect).getByRole('button', { name: aiStrings['ho.back'] }));
}

async function startOnAnotherComputer(path: string) {
  const app = await mountApp(path);
  const start = capture().target?.container.id;
  expect(start, 'the shell starts on a computer').toBeTruthy();
  expect(start, "the shell starts on another computer than the Bot's").not.toBe(BOT_COMPUTER);
  return app;
}

describe('New Bot to the AI page and back, through the shell', () => {
  async function typeAndLeave() {
    const app = await startOnAnotherComputer(`/bots?drawer=new&initial=${BOT_COMPUTER}`);
    const d = await newBotDialog();
    await userEvent.clear(nameBox(d));
    await userEvent.type(nameBox(d), 'quiet-heron');
    // The chooser is the drawer's body behind the Model row's Change; the trip leaves from there.
    await userEvent.click(within(d).getByRole('button', { name: strings['newBot.model.changeName'] }));
    await failedRead(d);
    const id = await departToAI(app, d, strings['newBot.title']);
    expect(handoff.readHandoff(BOT_COMPUTER, id)?.draft).toMatchObject({ kind: 'newBot', name: 'quiet-heron', computer: BOT_COMPUTER });
    return { app, id };
  }

  async function expectRestoredOnce(app: Awaited<ReturnType<typeof mountApp>>, id: string) {
    await waitFor(() => expect(app.loc().pathname).toBe('/bots'), SLOW);
    // The trip lands in the chooser it left from; Back shows the form with what was typed.
    const chooser = await screen.findByRole('dialog', { name: strings['newBot.model.pick'] }, SLOW);
    await userEvent.click(within(chooser).getByRole('button', { name: strings['newBot.model.back'] }));
    const d = await newBotDialog();
    expect(await within(d).findByDisplayValue('quiet-heron', undefined, SLOW)).toBeInTheDocument();
    await waitFor(() => expect(handoff.readHandoff(BOT_COMPUTER, id), 'taken: the trip is gone from storage').toBeNull(), SLOW);
    expect((app.loc().search as Record<string, unknown>).handoff, 'and from the address').toBeUndefined();
    // Taken once: closing and opening New Bot again starts fresh.
    await app.go('/bots');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['newBot.title'] })).toBeNull(), SLOW);
    await app.go(`/bots?drawer=new&initial=${BOT_COMPUTER}`);
    const again = await newBotDialog();
    expect(within(again).queryByDisplayValue('quiet-heron')).toBeNull();
  }

  it("AI's Go back brings back the typed name, once", async () => {
    const { app, id } = await typeAndLeave();
    await pressGoBack();
    await expectRestoredOnce(app, id);
  }, 60_000);

  it("the browser's Back brings back the typed name, once", async () => {
    const { app, id } = await typeAndLeave();
    await app.back();
    await expectRestoredOnce(app, id);
  }, 60_000);
});

describe('Bot Settings to the AI page and back, through the shell', () => {
  const at = (section: string) => `/bots?sel=${encodeURIComponent(SCOUT)}&settings=${section}`;
  const instructions = () => screen.findByRole('textbox', { name: strings['behaviour.instructions'] }, SLOW);

  async function typeAndLeave() {
    const app = await startOnAnotherComputer(at('behaviour'));
    const box = await instructions();
    await userEvent.clear(box);
    await userEvent.type(box, 'Typed before the trip.');
    await app.go(at('model'));
    await failedRead(document.body);
    const id = await departToAI(app, document.body, strings['settings.title'].replace('{{name}}', 'Scout'));
    const draft = handoff.readHandoff(BOT_COMPUTER, id)?.draft;
    expect(draft).toMatchObject({ kind: 'settings', botKey: SCOUT, instructions: 'Typed before the trip.' });
    const revision = (draft as { revision?: unknown } | undefined)?.revision;
    expect(typeof revision).toBe('number');
    return { app, id, revision };
  }

  async function expectRestoredOnce(app: Awaited<ReturnType<typeof mountApp>>, id: string, revision: unknown) {
    await waitFor(() => expect(app.loc().pathname).toBe('/bots'), SLOW);
    await waitFor(() => expect(handoff.readHandoff(BOT_COMPUTER, id), 'taken: the trip is gone from storage').toBeNull(), SLOW);
    await app.go(at('behaviour'));
    const box = await instructions();
    await waitFor(() => expect(box).toHaveValue('Typed before the trip.'), SLOW);
    // The draft saves on the revision it was typed on.
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));
    await waitFor(() => expect(W.sent).toHaveLength(1), SLOW);
    expect(W.sent[0]?.revision).toBe(revision);
    expect(W.sent[0]?.patch).toMatchObject({ instructions: 'Typed before the trip.' });
  }

  it("AI's Go back brings back the typed instructions on their revision, once", async () => {
    const { app, id, revision } = await typeAndLeave();
    await pressGoBack();
    await expectRestoredOnce(app, id, revision);
  }, 60_000);

  it("the browser's Back brings back the typed instructions on their revision, once", async () => {
    const { app, id, revision } = await typeAndLeave();
    await app.back();
    await expectRestoredOnce(app, id, revision);
  }, 60_000);

  it('a trip is taken once: after Go back, closing Settings and opening it again shows what the Bot holds', async () => {
    const { app } = await typeAndLeave();
    await pressGoBack();
    await waitFor(() => expect(app.loc().pathname).toBe('/bots'), SLOW);
    await app.go(`/bots?sel=${encodeURIComponent(SCOUT)}`);
    await app.go(at('behaviour'));
    const box = await instructions();
    await waitFor(() => expect(box).not.toHaveValue('Typed before the trip.'), SLOW);
  }, 60_000);
});
