// The AI tab's open chat on /ai/c over the REAL Ask engine as an active
// source, the real journal and the FakeAgent, mounted through the tab's routes. It lives under ask/ because pages reach
// src/ask only through @ask/io, and this test needs the engine itself. Send reaches the agent once and the draft clears only when the engine's row
// says the agent took it; a send whose answer never comes reads "may have gone through" and nothing sends it again (C9).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';

// The engine's own approver handle is a stub (a default-mode chat needs none); the attachment lease is held by the deps below.
vi.mock('@kit/agent/approver-live', () => ({
  approvers: () => ({
    open: () => ({ sid: null, setStrict: () => undefined, mintTicket: () => null, decide: () => null, close: () => undefined }),
    state: () => ({ phase: 'none' }), subscribe: () => () => undefined, stamp: () => 0, noteEpoch: () => undefined,
  }),
  resetApproversForTests: () => undefined,
}));
import { bootFixtureCore, chooseComputer, fixtureWorld, queryClient } from '@core';
import { provideActiveConversations, type ActiveConversationProvider, type ShellData } from '@kit';
import { WAIT_MS, engineActive, liveDeps, type ActiveDeps } from './active';
import { scripts } from './fake';
import { world, type World, type WorldOptions } from './accept/env';
import { ShellDataProvider } from '@shell/context';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
// The fixture side of core's seam (pageFixtures): New chat reads the computer's realms through it (pages/ai/data useComputer),
// and these tests leave the chat for /ai without app/testing (which loads it), so without this New chat draws FIXTURES_NOT_INSTALLED.
import '@app/fixtures';
import AiTab from '../pages/ai/tab';
import { chatRules } from '../pages/ai/parts/fixtures.chats';
import strings from '../pages/ai/parts/Conversation.strings.en.json';
import { resetAttemptsForTests } from '@kit/agent/convComposer';
import kc from '@kit/agent/Conversation.strings.en.json';

const atlas = fixtureWorld.computers[0]!;
const HANDLE = `atlas.${atlas.id.slice(-4)}`;
const PERSONAL = fixtureWorld.realms[0]!.id;
const shell: ShellData = { realms: [], realmId: PERSONAL, computers: [{ id: atlas.id, name: 'atlas', running: true }] as ShellData['computers'] };

let w: World | null = null;
afterEach(() => { cleanup(); resetAttemptsForTests(); provideActiveConversations(null); queryClient.clear(); w?.dispose(); w = null; vi.restoreAllMocks(); });

/** A chat made on one engine (its first turn runs to the end), reopened as the pinned engine the page sends through. */
async function chatWorld(waitMs = WAIT_MS, o: WorldOptions = {}, follow?: string, settle = 3000) {
  // Core first: the world then names its own account (setIdentity), which its journal admits sends under.
  bootFixtureCore({ rules: chatRules() });
  act(() => chooseComputer(atlas));
  w = world({ script: [scripts.dashboard], ...o });
  const approval = (w.agent as any).approval.bind(w.agent);
  (w.agent as any).approval = (sid: string) => approval(sid).then((r: any) => ({ ...r, mode: 'default' }));
  const first = await w.dock();
  first.setAuto(false);
  first.send('start');
  // `follow`: a follow-up sent while the first turn still runs (its answer may be lost: o.commandLost).
  // `settle`: how long the first turn is given before the page opens (short: it still runs).
  if (follow) { await w.flush(250); first.send(follow); await w.flush(10); } else await w.flush(settle);
  const sid = first.record!.s! as string;
  const eng = w.pinned(sid);
  eng.open();
  await w.flush(1000);
  const x = w;
  const d: ActiveDeps = {
    approvers: { state: () => ({ phase: 'none' }), subscribe: () => () => undefined } as any,
    leases: { track: () => ({ set: () => undefined, close: () => undefined }), state: () => ({ phase: 'held' }), subscribe: () => () => undefined } as any,
    pending: (h) => x.j.pending(h), onPending: (fn) => x.j.subscribe(fn), set: (fn, ms) => x.clock.set(fn, ms), clear: (id) => x.clock.clear(id),
    decode: liveDeps().decode, waitMs,
  };
  /** The page's provider over one engine (a fresh one stands for a reload: rebuilt from the agent and the journal). */
  const over = (e: typeof eng): ActiveConversationProvider => ({
    open(_account, ref) {
      const a = engineActive({ current: () => e, release: () => undefined }, ref, () => ({ computer: 'atlas', realm: 'Personal' }), d);
      return { source: a, release: () => a.release() };
    },
  });
  provideActiveConversations(over(eng));
  return { eng, sid, over };
}

async function open(sid: string) {
  const router = createRouter({ routeTree: createRootRoute({ component: AiTab }), history: createMemoryHistory({ initialEntries: [`/ai/c/${sid}?computer=${HANDLE}&realm=${PERSONAL}`] }) });
  await act(async () => {
    render(
      <ShellDataProvider value={shell}>
        <main id="hub-main"><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></main>
      </ShellDataProvider>,
    );
    await router.load();
  });
  return router;
}
const box = () => screen.getByRole('textbox', { name: kc['agent.composer'] }) as HTMLTextAreaElement;

describe('the conversation page on the real engine', () => {
  it('Send reaches the agent once; the draft clears when the engine says it was taken, and the message is in the chat', async () => {
    const { sid } = await chatWorld();
    const calls: unknown[] = [];
    const turn = (w!.agent as any).turn.bind(w!.agent);
    (w!.agent as any).turn = (...a: unknown[]) => { calls.push(a); return turn(...a); };
    await open(sid);
    await waitFor(() => expect(screen.getByRole('button', { name: kc['agent.send'] })).toBeInTheDocument());
    fireEvent.change(box(), { target: { value: 'hello again' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.send'] })); });
    await act(async () => { await w!.flush(2000); });
    await waitFor(() => expect(box().value).toBe(''));
    expect(calls).toHaveLength(1);
    expect(screen.getAllByText('hello again').length).toBeGreaterThan(0);
    expect(screen.queryByText(strings['conv.send.unknown'])).toBeNull();
  });

  it('a send whose answer never comes reads "may have gone through", and no press sends it again', async () => {
    const { sid } = await chatWorld(5);
    const calls: unknown[] = [];
    (w!.agent as any).turn = (...a: unknown[]) => { calls.push(a); return new Promise(() => undefined); };
    await open(sid);
    await waitFor(() => expect(screen.getByRole('button', { name: kc['agent.send'] })).toBeInTheDocument());
    fireEvent.change(box(), { target: { value: 'stuck' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.send'] })); });
    await act(async () => { await w!.flush(50); });
    expect(await screen.findByText(strings['conv.send.unknown'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['conv.send.again'] })).toBeNull();
    expect(box().value).toBe('');
    // A second press, by button or Enter, with a new text: Send is held for this chat, nothing goes.
    fireEvent.change(box(), { target: { value: 'another' } });
    // The reason Send waits is its description, not its name.
    const held = screen.getByRole('button', { name: kc['agent.send'] });
    expect(held).toHaveAccessibleDescription(strings['conv.send.held']);
    fireEvent.click(held);
    fireEvent.keyDown(box(), { key: 'Enter' });
    await act(async () => { await w!.flush(50); });
    expect(calls).toHaveLength(1);
  });

  it('a Stop without an answer, then the chat rebuilt on a fresh engine (a reload): the same turn is still held, no second cancel', async () => {
    const { sid, over } = await chatWorld(5, { pace: 400 } as WorldOptions, undefined, 300);
    const cancels: unknown[] = [];
    (w!.agent as any).cancel = (...a: unknown[]) => { cancels.push(a); return new Promise(() => undefined); };
    const router = await open(sid);
    // A follow-up sent from this page while the turn runs: its row has this engine's local id, which a rebuilt transcript
    // names differently (the same turn, another row key).
    await screen.findByRole('button', { name: kc['agent.stop'] });
    fireEvent.change(box(), { target: { value: 'Also the tax line' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.send'] })); });
    await act(async () => { await w!.flush(100); });
    expect(screen.getAllByText('Also the tax line').length).toBeGreaterThan(0);
    const stop = await screen.findByRole('button', { name: kc['agent.stop'] });
    await act(async () => { fireEvent.click(stop); });
    await act(async () => { await w!.flush(50); });
    expect(await screen.findByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    expect(cancels).toHaveLength(1);
    // Leave; the chat comes back on a NEW engine that knows nothing of the first one's Stop (its rows rebuilt from history).
    await act(async () => { router.history.push('/ai'); });
    const fresh = w!.pinned(sid);
    fresh.open();
    await act(async () => { await w!.flush(1000); });
    act(() => provideActiveConversations(over(fresh)));
    await act(async () => { router.history.push(`/ai/c/${sid}?computer=${HANDLE}&realm=${PERSONAL}`); });
    const again = await screen.findByRole('button', { name: kc['agent.stop'] });
    expect(screen.getByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    expect(again.getAttribute('aria-disabled')).toBe('true');
    await act(async () => { fireEvent.click(again); });
    await act(async () => { await w!.flush(50); });
    expect(cancels).toHaveLength(1);
  });

  it('a Stop for a turn another tab started (learned from the agent\'s state), then a reopen whose recovery reads are slow: the stored record\'s idle settles nothing, and the turn found again is not cancelled twice', async () => {
    // The second turn (the other tab's) is long, so it still runs through the reopen.
    const long = Array.from({ length: 200 }, (_, i) => ({ k: 'text' as const, text: `step ${i}` }));
    const { sid, eng, over } = await chatWorld(5, { pace: 400, script: [scripts.dashboard, long] } as WorldOptions, undefined, 30000);
    const router = await open(sid);
    await waitFor(() => expect(screen.getByRole('button', { name: kc['agent.send'] })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: kc['agent.stop'] })).toBeNull();
    // Another tab starts a turn: this page learns it only from the agent's state.
    await act(async () => { await (w!.agent as any).turn(sid, 'from another tab', 'k-elsewhere'); });
    act(() => eng.wake());
    await act(async () => { await w!.flush(1500); });
    expect(eng.getSnapshot().status).toBe('working');
    const cancels: unknown[] = [];
    (w!.agent as any).cancel = (...a: unknown[]) => { cancels.push(a); return new Promise(() => undefined); };
    const stop = await screen.findByRole('button', { name: kc['agent.stop'] });
    await act(async () => { fireEvent.click(stop); });
    await act(async () => { await w!.flush(50); });
    expect(await screen.findByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    expect(cancels).toHaveLength(1);
    // Leave; the fresh engine's /state reads are held until the test lets them go.
    await act(async () => { router.history.push('/ai'); });
    let letGo: () => void = () => undefined;
    const held = new Promise<void>((res) => { letGo = res; });
    const state = (w!.agent as any).state.bind(w!.agent);
    (w!.agent as any).state = (...a: unknown[]) => held.then(() => state(...a));
    const fresh = w!.pinned(sid);
    fresh.open();
    act(() => provideActiveConversations(over(fresh)));
    await act(async () => { router.history.push(`/ai/c/${sid}?computer=${HANDLE}&realm=${PERSONAL}`); });
    await act(async () => { await w!.flush(300); });
    expect(screen.getByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    await act(async () => { letGo(); await w!.flush(1500); });
    expect(fresh.getSnapshot().status).toBe('working');
    const again = await screen.findByRole('button', { name: kc['agent.stop'] });
    expect(again.getAttribute('aria-disabled')).toBe('true');
    await act(async () => { fireEvent.click(again); });
    await act(async () => { await w!.flush(50); });
    expect(cancels).toHaveLength(1);
  });

  it('a Stop for another tab\'s turn, then a reopen whose stored turn is still shown (its receipt is slow) while the agent\'s state names the other turn: Stop stays held, and that turn is cancelled once', async () => {
    const long = Array.from({ length: 200 }, (_, i) => ({ k: 'text' as const, text: `step ${i}` }));
    const { sid, eng, over } = await chatWorld(5, { pace: 400, script: [scripts.dashboard, long] } as WorldOptions, undefined, 30000);
    const router = await open(sid);
    await waitFor(() => expect(screen.getByRole('button', { name: kc['agent.send'] })).toBeInTheDocument());
    await act(async () => { await (w!.agent as any).turn(sid, 'from another tab', 'k-elsewhere'); });
    act(() => eng.wake());
    await act(async () => { await w!.flush(1500); });
    const other = eng.getSnapshot().stateTurn;
    expect(other).toEqual(expect.any(String));
    const cancels: unknown[][] = [];
    (w!.agent as any).cancel = (...a: unknown[]) => { cancels.push(a); return new Promise(() => undefined); };
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: kc['agent.stop'] })); });
    await act(async () => { await w!.flush(50); });
    expect(await screen.findByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    expect(cancels).toHaveLength(1);
    // Leave; the stored turn's receipt reads are held, so the fresh engine shows it running while its state names the other turn.
    await act(async () => { router.history.push('/ai'); });
    eng.end();
    let letGo: () => void = () => undefined;
    const held = new Promise<void>((res) => { letGo = res; });
    const receipt = (w!.agent as any).receipt.bind(w!.agent);
    (w!.agent as any).receipt = (sid2: string, turnId: string, ...a: unknown[]) => (turnId !== other ? held.then(() => receipt(sid2, turnId, ...a)) : receipt(sid2, turnId, ...a));
    const fresh = w!.pinned(sid);
    fresh.open();
    act(() => provideActiveConversations(over(fresh)));
    await act(async () => { router.history.push(`/ai/c/${sid}?computer=${HANDLE}&realm=${PERSONAL}`); });
    await act(async () => { await w!.flush(1500); });
    expect(fresh.getSnapshot().stateTurn).toBe(other);
    // The stored turn is still shown running: the turn facts disagree with the agent's state.
    expect(fresh.getSnapshot().conv.turns.at(-1)?.s.turnId).not.toBe(other);
    expect(screen.getByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    const mid = screen.queryByRole('button', { name: kc['agent.stop'] });
    if (mid) { await act(async () => { fireEvent.click(mid); }); await act(async () => { await w!.flush(50); }); }
    await act(async () => { letGo(); await w!.flush(1500); });
    expect(fresh.getSnapshot().status).toBe('working');
    const again = await screen.findByRole('button', { name: kc['agent.stop'] });
    await act(async () => { fireEvent.click(again); });
    await act(async () => { await w!.flush(50); });
    expect(cancels).toHaveLength(1);
  });

  it('a Stop for another tab\'s turn that ends while the page is away: a reopen forgets the old state read until a new one is applied, and the agent\'s idle then settles the Stop', async () => {
    const short = Array.from({ length: 12 }, (_, i) => ({ k: 'text' as const, text: `step ${i}` }));
    const { sid, eng, over } = await chatWorld(5, { pace: 400, script: [scripts.dashboard, short] } as WorldOptions, undefined, 30000);
    const router = await open(sid);
    await waitFor(() => expect(screen.getByRole('button', { name: kc['agent.send'] })).toBeInTheDocument());
    await act(async () => { await (w!.agent as any).turn(sid, 'from another tab', 'k-elsewhere'); });
    act(() => eng.wake());
    await act(async () => { await w!.flush(1500); });
    expect(eng.getSnapshot().status).toBe('working');
    expect(eng.getSnapshot().stateTurn).toEqual(expect.any(String));
    const cancels: unknown[] = [];
    (w!.agent as any).cancel = (...a: unknown[]) => { cancels.push(a); return new Promise(() => undefined); };
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: kc['agent.stop'] })); });
    await act(async () => { await w!.flush(50); });
    expect(await screen.findByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    // Leave; the turn ends while the page is away.
    await act(async () => { router.history.push('/ai'); });
    eng.end();
    await act(async () => { await w!.flush(8000); });
    let letGo: () => void = () => undefined;
    const held = new Promise<void>((res) => { letGo = res; });
    const state = (w!.agent as any).state.bind(w!.agent);
    (w!.agent as any).state = (...a: unknown[]) => held.then(() => state(...a));
    // The same engine reopened: its old state read is not certainty for the reopened chat.
    eng.open();
    await act(async () => { await w!.flush(300); });
    expect(eng.getSnapshot()).not.toHaveProperty('stateTurn');
    eng.end();
    // A fresh engine (a reload): its record has no ended turn to show, so only its own state read can settle the Stop.
    const again = w!.pinned(sid);
    again.open();
    act(() => provideActiveConversations(over(again)));
    await act(async () => { router.history.push(`/ai/c/${sid}?computer=${HANDLE}&realm=${PERSONAL}`); });
    await act(async () => { await w!.flush(300); });
    expect(screen.getByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    await act(async () => { letGo(); await w!.flush(1500); });
    expect(again.getSnapshot().stateTurn).toBeNull();
    await waitFor(() => expect(screen.queryByText(strings['conv.stop.unknown'])).toBeNull());
    expect(cancels).toHaveLength(1);
  });

  it('a follow-up a reload left unresolved, with no text kept: a new message is held as "still unresolved", never called sent', async () => {
    // The first turn runs; its follow-up's answer is lost; the page then opens the chat on a fresh engine (a reload), which
    // restores that follow-up from the journal without its text.
    const { sid } = await chatWorld(WAIT_MS, { pace: 200, commandLost: true } as WorldOptions, 'Also add a README');
    const commands: unknown[] = [];
    const command = (w!.agent as any).command.bind(w!.agent);
    (w!.agent as any).command = (...a: unknown[]) => { commands.push(a); return command(...a); };
    await open(sid);
    await waitFor(() => expect(screen.getByRole('textbox', { name: kc['agent.composer'] })).toBeInTheDocument());
    fireEvent.change(box(), { target: { value: 'Something else' } });
    const send = await screen.findByRole('button', { name: kc['agent.send'] });
    await act(async () => { fireEvent.click(send); });
    await act(async () => { await w!.flush(100); });
    expect(await screen.findByText(strings['conv.send.unresolved'])).toBeInTheDocument();
    expect(commands).toHaveLength(0);
    expect(box().value).toBe('Something else');
  });
});
