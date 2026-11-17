// The AI page's open chat when the computer has put it to sleep (GET /state live:false). The agent serves an attachment lease for a
// LIVE chat only (404 otherwise), so the lease manager reads a sleeping chat as `gone`. The page still lets the person write: Send is
// open, the message wakes the chat once and goes as one turn, and the chat's lease is taken again once it is awake. Real engine, real
// journal, real lease manager; the agent is the FakeAgent, whose lease routes answer as the agent does.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import { createLeaseManager, type LeaseManager } from '@kit/agent/lease';
import { bootFixtureCore, chooseComputer, fixtureWorld, queryClient } from '@core';
import { provideActiveConversations, type ShellData } from '@kit';
import { WAIT_MS, engineActive, liveDeps, type ActiveDeps } from './active';
import { scripts } from './fake';
import { world, type World } from './accept/env';
import { ShellDataProvider } from '@shell/context';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AiTab from '../pages/ai/tab';
import { chatRules } from '../pages/ai/parts/fixtures.chats';
import { resetAttemptsForTests } from '@kit/agent/convComposer';
import kc from '@kit/agent/Conversation.strings.en.json';
import ask from './strings.en.json';
import sv from '@kit/agent/SessionView.strings.en.json';
import fm from '@kit/agent/ForkMenu.strings.en.json';
import ti from '../pages/ai/parts/TrimItems.strings.en.json';

const atlas = fixtureWorld.computers[0]!;
const HANDLE = `atlas.${atlas.id.slice(-4)}`;
const PERSONAL = fixtureWorld.realms[0]!.id;
const shell: ShellData = { realms: [], realmId: PERSONAL, computers: [{ id: atlas.id, name: 'atlas', running: true }] as ShellData['computers'] };

let w: World | null = null;
let mgr: LeaseManager | null = null;
beforeEach(() => { resetApproversForTests(); });
afterEach(() => { cleanup(); resetAttemptsForTests(); provideActiveConversations(null); queryClient.clear(); mgr?.reset(); mgr = null; w?.dispose(); w = null; resetApproversForTests(); });

const count = (m: string) => w!.agent.log.filter((x) => x[0] === m).length;
const dormant = (sid: string): boolean => !!(w!.agent as any).ss.get(sid)?.dormant;

/** A chat with one finished exchange, then the page's provider over a pinned engine. `sleep`: the computer puts it to sleep before the
 *  page opens it (a chat opened from the list long after it was used). */
async function chatWorld(sleep: boolean, exchanges = 1) {
  bootFixtureCore({ rules: chatRules() });
  act(() => chooseComputer(atlas));
  w = world({ script: [scripts.dashboard] });
  const approval = (w.agent as any).approval.bind(w.agent);
  (w.agent as any).approval = (sid: string) => approval(sid).then((r: any) => ({ ...r, mode: 'default' }));
  const first = await w.dock();
  first.setAuto(false);
  first.send('hi!');
  await w.flush(3000);
  for (let i = 1; i < exchanges; i++) {
    first.send(`more ${i}`);
    await w.flush(3000);
  }
  const sid = first.record!.s! as string;
  if (sleep) w.agent.setDormant(sid, true);
  const eng = w.pinned(sid);
  eng.open();
  await w.flush(1000);
  // The agent's lease routes: acquire and renew serve a LIVE chat only; a sleeping one is 404 not_found.
  let n = 0;
  const x = w;
  const no404 = { ok: false, err: { kind: 'failed', code: 'not_found', status: 404 } };
  const grant = () => ({ ok: true, body: { lease_id: `lease-${++n}`, expires_at: new Date(Date.now() + 15 * 60_000).toISOString() } });
  mgr = createLeaseManager({
    graceMs: 0,
    api: () => ({
      acquire: async (id: string) => { (x.agent as any).rec('leaseAcquire', id); return (dormant(id) ? no404 : grant()) as any; },
      renew: async (id: string) => (dormant(id) ? no404 : grant()) as any,
      release: async () => ({ ok: true, body: {} }) as any,
    }),
  });
  const d: ActiveDeps = {
    approvers: { state: () => ({ phase: 'none' }), subscribe: () => () => undefined } as any,
    leases: mgr,
    pending: (h) => x.j.pending(h), onPending: (fn) => x.j.subscribe(fn), set: (fn, ms) => x.clock.set(fn, ms), clear: (id) => x.clock.clear(id),
    decode: liveDeps().decode, waitMs: WAIT_MS,
  };
  provideActiveConversations({
    open(_account, ref) {
      const a = engineActive({ current: () => eng, release: () => undefined }, ref, () => ({ computer: 'atlas', realm: 'Personal' }), d);
      return { source: a, release: () => a.release() };
    },
  });
  return { eng, sid };
}

async function open(sid: string) {
  act(() => chooseComputer(atlas));
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
const sendBtn = () => screen.getByRole('button', { name: kc['agent.send'] });
const settled = async (ms = 50) => { await act(async () => { await w!.flush(ms); await new Promise((r) => setTimeout(r, 0)); }); };

describe('the AI page on a chat asleep on the computer', () => {
  it('opened while asleep: the line says what is true, Send is open, and one press wakes the chat then sends one turn', async () => {
    const { eng, sid } = await chatWorld(true);
    expect(eng.getSnapshot().dormant).toBe(true);
    await open(sid);
    await settled();
    expect(await screen.findByText(ask['ask.dormant'])).toBeInTheDocument();
    fireEvent.change(box(), { target: { value: 'TEST TYPING' } });
    await settled();
    await waitFor(() => expect(sendBtn().getAttribute('aria-disabled')).not.toBe('true'));
    const a0 = count('attach'), t0 = count('turn');
    await act(async () => { fireEvent.click(sendBtn()); });
    await settled(2000);
    expect(count('attach') - a0, 'woken once').toBe(1);
    expect(count('turn') - t0, 'one turn').toBe(1);
    await waitFor(() => expect(box().value).toBe(''));
    expect(screen.getAllByText('TEST TYPING').length).toBeGreaterThan(0);
    expect(screen.queryByText(ask['ask.dormant'])).toBeNull();
    // Awake again: the page holds the chat's lease once more.
    await settled(100);
    expect(mgr!.state({ computer: (eng.activation().ref as any).computer, realm: (eng.activation().ref as any).realm, sid, target: (eng.activation().ref as any).target }).phase).toBe('held');
  });

  it('the lease ran out while the page was away and the chat fell asleep: back on the page, Send still works (one wake, one turn)', async () => {
    const { eng, sid } = await chatWorld(false);
    await open(sid);
    await settled(100);
    const ref = eng.activation().ref as any;
    await waitFor(() => expect(mgr!.state(ref).phase).toBe('held'));
    // The page is hidden (its leases are given back), the computer puts the idle chat to sleep, the page comes back.
    act(() => mgr!.releaseAll());
    w!.agent.setDormant(sid, true);
    act(() => mgr!.resume());
    act(() => eng.wake());
    await settled(200);
    expect(mgr!.state(ref).phase).toBe('gone');
    expect(eng.getSnapshot().dormant).toBe(true);
    fireEvent.change(box(), { target: { value: 'back again' } });
    await settled();
    await waitFor(() => expect(sendBtn().getAttribute('aria-disabled')).not.toBe('true'));
    const a0 = count('attach'), t0 = count('turn');
    await act(async () => { fireEvent.click(sendBtn()); });
    await settled(2000);
    expect(count('attach') - a0).toBe(1);
    expect(count('turn') - t0).toBe(1);
    await waitFor(() => expect(box().value).toBe(''));
    await settled(100);
    expect(mgr!.state(ref).phase).toBe('held');
  });

  it('a wake the computer refuses: the message is Not sent with a plain reason, the text is kept, and nothing ran', async () => {
    const { sid } = await chatWorld(true);
    (w!.agent as any).attach = (...a: unknown[]) => { (w!.agent as any).rec('attach', ...a); return Promise.reject({ status: 503, code: 'service_unavailable' }); };
    await open(sid);
    await settled();
    fireEvent.change(box(), { target: { value: 'please wake' } });
    await settled();
    await waitFor(() => expect(sendBtn().getAttribute('aria-disabled')).not.toBe('true'));
    const t0 = count('turn');
    await act(async () => { fireEvent.click(sendBtn()); });
    await settled(1000);
    expect(count('turn') - t0).toBe(0);
    expect(box().value).toBe('please wake');
  });

  it('a "/" draft on a sleeping chat: Send is open and goes the same way', async () => {
    const { sid } = await chatWorld(true);
    await open(sid);
    await settled();
    fireEvent.change(box(), { target: { value: '/plan the next step' } });
    await settled(200);
    const a0 = count('attach'), t0 = count('turn');
    await waitFor(() => expect(sendBtn().getAttribute('aria-disabled')).not.toBe('true'));
    await act(async () => { fireEvent.click(sendBtn()); });
    await settled(2000);
    expect(count('attach') - a0).toBe(1);
    expect(count('turn') - t0).toBe(1);
  });

  it('a chat the computer discarded (a chat never written to goes once it sleeps): the message is Not sent, the chat says "start a new chat", the text is kept', async () => {
    const { sid } = await chatWorld(true);
    // The agent discards a never-prompted chat when it goes idle: every route then answers 404 not_found, the wake included.
    (w!.agent as any).attach = (...a: unknown[]) => { (w!.agent as any).rec('attach', ...a); return Promise.reject({ status: 404, code: 'not_found' }); };
    await open(sid);
    await settled();
    // Discarded after the page read it: every later read of it is 404 too.
    (w!.agent as any).state = () => Promise.reject({ status: 404, code: 'not_found' });
    await settled();
    fireEvent.change(box(), { target: { value: 'still there?' } });
    await settled();
    await waitFor(() => expect(sendBtn().getAttribute('aria-disabled')).not.toBe('true'));
    const t0 = count('turn');
    await act(async () => { fireEvent.click(sendBtn()); });
    await settled(1000);
    expect(count('turn') - t0).toBe(0);
    expect(box().value).toBe('still there?');
    expect(box()).not.toBeDisabled();
    expect(box().getAttribute('aria-disabled')).not.toBe('true');
    // The chat line says it plainly; the row is Not sent; the text stays in the box, which still takes typing.
    expect(await screen.findByText(ask['ask.gone'])).toBeInTheDocument();
    expect(screen.queryByText(ask['ask.dormant'])).toBeNull();
    expect(screen.getAllByText('still there?').length).toBeGreaterThan(1);
    fireEvent.change(box(), { target: { value: 'still there? copy' } });
    expect(box().value).toBe('still there? copy');
  });
});

describe('live-only changes on a chat asleep on the computer say to send a message first (Details > Session: kit/agent/SessionTab.test.tsx ST-asleep)', () => {
  it('Remove what follows: offered with the reason instead of failing at the computer', async () => {
    const { sid } = await chatWorld(true, 3);
    await open(sid);
    await settled();
    const menus = await screen.findAllByRole('button', { name: fm['tm.more'] });
    await act(async () => { fireEvent.click(menus[0]!); });
    const item = await screen.findByRole('menuitem', { name: new RegExp(ti['trim.item']) });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menu').textContent).toContain(sv['sv.why.asleep']);
    expect(count('trim')).toBe(0);
  });
});
