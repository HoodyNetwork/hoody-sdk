// The AI tab composer's text files over the REAL Ask engine. A text file goes as its
// own part (Draft.files -> ask/active.ts attachParts -> engine.attach -> UserMsg.files), under the dock's 24 KB file and 28 KB
// message rules, never folded into the typed text, so MAX_TEXT (4000) counts the typed text only. A message over 28 KB is held before
// Send with its reason, nothing reaches the agent, and the engine itself refuses it too, so the two rules can't drift apart. It
// lives under ask/ for the reason conversation.page.test.tsx gives (the engine is reached only from here); its harness is that
// file's, copied.
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
import { MSG_BYTES, messageBytes, messageText, prepare } from './attach';
import { MAX_TEXT, textLength } from './logic';
import { scripts } from './fake';
import { world, type World, type WorldOptions } from './accept/env';
import { ShellDataProvider } from '@shell/context';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const chips = () => { const l = screen.queryByRole('list', { name: kc['agent.attList'] }); return l ? within(l).queryAllByRole('listitem') : []; };
const tooLong = strings['conv.att.tooLong'];
const txt = (name: string, text: string) => new File([text], name, { type: 'text/plain' });
const asFile = (name: string, text: string) => ({ name, text }) as never;

describe('text files on the real engine', () => {
  it('a text file far over 4000 characters goes as its own part: one turn, the row keeps the typed text and the file, the chip leaves', async () => {
    const { sid, eng } = await chatWorld();
    const calls: string[] = [];
    const turn = (w!.agent as any).turn.bind(w!.agent);
    (w!.agent as any).turn = (s: string, text: string, ...a: unknown[]) => { calls.push(text); return turn(s, text, ...a); };
    await open(sid);
    await waitFor(() => expect(screen.getByRole('button', { name: kc['agent.send'] })).toBeInTheDocument());
    const body = 'a'.repeat(20000);
    await act(async () => { fireEvent.change(fileInput(), { target: { files: [txt('n.txt', body)] } }); });
    await waitFor(() => expect(chips()).toHaveLength(1));
    fireEvent.change(box(), { target: { value: 'x' } });
    expect(screen.queryAllByText(tooLong)).toHaveLength(0);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.send'] })); });
    await act(async () => { await w!.flush(2000); });
    expect(calls).toHaveLength(1);
    // On the wire the turn carries the typed text then the file as a fenced block (logic.ts turnBody), five times MAX_TEXT here.
    expect(calls[0]).toBe(messageText('x', [asFile('n.txt', body)]));
    expect(textLength(calls[0]!)).toBeGreaterThan(MAX_TEXT * 5);
    // ...and the message itself holds them apart: its text is what was typed, the file is its part.
    const rows = Object.values(eng.getSnapshot().conv.users).filter((u) => u.files?.length);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.text).toBe('x');
    expect(rows[0]!.files!.map((f) => [f.name, f.text])).toEqual([['n.txt', body]]);
    await waitFor(() => expect(chips()).toHaveLength(0));
    await waitFor(() => expect(box().value).toBe(''));
  });

  it('a BOM-prefixed text file beginning "BM" goes as text, exactly as read: no image, nothing refused', async () => {
    // Its bytes once read (one BOM stripped) begin "BM", a BMP's sniff: the composer read it as text, and it stays text.
    const { sid, eng } = await chatWorld();
    const calls: string[] = [];
    const turn = (w!.agent as any).turn.bind(w!.agent);
    (w!.agent as any).turn = (s: string, text: string, ...a: unknown[]) => { calls.push(text); return turn(s, text, ...a); };
    await open(sid);
    await waitFor(() => expect(screen.getByRole('button', { name: kc['agent.send'] })).toBeInTheDocument());
    const read = 'BM notes, first line\n';
    await act(async () => { fireEvent.change(fileInput(), { target: { files: [txt('bm.txt', '\uFEFF' + read)] } }); });
    await waitFor(() => expect(chips()).toHaveLength(1));
    fireEvent.change(box(), { target: { value: 'x' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.send'] })); });
    await act(async () => { await w!.flush(2000); });
    expect(calls).toEqual([messageText('x', [asFile('bm.txt', read)])]);
    const rows = Object.values(eng.getSnapshot().conv.users).filter((u) => u.files?.length || u.imgs?.length);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.imgs).toBeUndefined();
    expect(rows[0]!.files!.map((f) => [f.name, f.text])).toEqual([['bm.txt', read]]);
    await waitFor(() => expect(chips()).toHaveLength(0));
  });

  it('a message over 28 KB with its files is held before Send with its reason, nothing reaches the agent, and the engine refuses it too', async () => {
    const { sid, eng } = await chatWorld();
    const calls: unknown[] = [];
    (w!.agent as any).turn = (...a: unknown[]) => { calls.push(a); return new Promise(() => undefined); };
    await open(sid);
    await waitFor(() => expect(screen.getByRole('button', { name: kc['agent.send'] })).toBeInTheDocument());
    // Two files that fit together (and each under 24 KB); the typed text then takes the message past 28 KB.
    const a = 'a'.repeat(14000), b = 'b'.repeat(14000), over = 'y'.repeat(1000);
    expect(messageBytes('', [asFile('a.txt', a), asFile('b.txt', b)])).toBeLessThan(MSG_BYTES);
    expect(messageBytes(over, [asFile('a.txt', a), asFile('b.txt', b)])).toBeGreaterThan(MSG_BYTES);
    await act(async () => { fireEvent.change(fileInput(), { target: { files: [txt('a.txt', a), txt('b.txt', b)] } }); });
    await waitFor(() => expect(chips()).toHaveLength(2));
    fireEvent.change(box(), { target: { value: over } });
    expect(screen.getAllByText(tooLong).length).toBeGreaterThan(0);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.send'] })); });
    fireEvent.keyDown(box(), { key: 'Enter' });
    await act(async () => { await w!.flush(500); });
    expect(calls).toHaveLength(0);
    expect(chips()).toHaveLength(2);
    // The engine's own rule is the same one: with those two files in its draft it sends nothing for that text...
    const enc = (n: string, t: string, id: string) => prepare(id, n, new TextEncoder().encode(t), () => '');
    // Admitted as the composer's read admits them (before the long text is typed); Send judges the message as it is then.
    act(() => eng.attach([enc('a.txt', a, 'ta'), enc('b.txt', b, 'tb')], ''));
    expect(eng.getSnapshot().att.items).toHaveLength(2);
    let sent = true;
    act(() => { sent = eng.send(over); });
    await act(async () => { await w!.flush(500); });
    expect(sent).toBe(false);
    expect(calls).toHaveLength(0);
    // ...and it was the size that refused it: the same engine, right after, takes a short text with the same two files.
    act(() => { sent = eng.send('y'); });
    await act(async () => { await w!.flush(500); });
    expect(sent).toBe(true);
    expect(calls).toHaveLength(1);
    expect((calls[0] as unknown[])[1]).toBe(messageText('y', [asFile('a.txt', a), asFile('b.txt', b)]));
  });
});
