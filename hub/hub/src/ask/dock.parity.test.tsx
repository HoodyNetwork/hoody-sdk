// Parity of the dock's SessionView with the column it replaces: the affordances the column had
// that the kit's transcript has no place for, and the gate card with its decided line, through the real engine and the fake agent.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSyncExternalStore } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import type * as Data from './data';

import type * as AL from '@kit/agent/approver-live';
type Hang = Record<string, boolean>;
// The approver manager the engine's handle opens on: the page's own, unless a test gives the real manager over the fake daemon.
const AP = vi.hoisted(() => ({ mgr: null as unknown }));
vi.mock('@kit/agent/approver-live', async (orig) => {
  const real = await orig<typeof AL>();
  return { ...real, approvers: () => (AP.mgr ?? real.approvers()) as ReturnType<typeof real.approvers> };
});
type Held = Array<() => void>;
vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  const { FakeAgent } = await import('./fake');
  const { realClock } = await import('./engine');
  return {
    ...real,
    // One agent per computer for the whole test; `__hang` makes the named agent calls never answer (a request in flight).
    liveIO: (t: { container: { id: string } }) => {
      const g = globalThis as { __fake?: InstanceType<typeof FakeAgent>; __fakeOpts?: object; __hang?: Hang; __held?: Held; __fail?: Record<string, unknown> };
      g.__fake ??= new FakeAgent({ account: '64f0c0ffee0000000000c0de', pace: 10, realms: ['f1f1f1f1f1f1f1f1f1f1f1f1'], ...g.__fakeOpts }, realClock);
      const agent = g.__fake;
      const wrapped = new Proxy(agent, {
        get(target, p) {
          const v = (target as any)[p];
          if (typeof v !== 'function') return v;
          // A held call is made, and its answer given, when the test lets it go (releaseHang).
          // A failed call never reaches the agent: the request may or may not have left (the answer is a pending-type fault).
          if (g.__fail && String(p) in g.__fail) return () => Promise.reject(g.__fail![String(p)]);
          return (...a: unknown[]) => (g.__hang?.[String(p)] ? new Promise((res, rej) => { (g.__held ??= []).push(() => { Promise.resolve(v.apply(target, a)).then(res, rej); }); }) : v.apply(target, a));
        },
      });
      return real.withFixtureDest(wrapped, t.container.id);
    },
  };
});

import './data';
import { computerHandle } from '@core';
import type { AskEngine } from './engine';
import type * as Reg from './registry';
import type { FakeAgent } from './fake';
import { scripts } from './fake';
import { createLeaseManager } from '@kit/agent/lease';
import { createApproverManager, type ApproverManager } from '@kit/agent/approver';
import { fakeDaemon } from '@kit/agent/approver.fakedaemon';
import type { ActiveDeps } from './active';
import { ConvBody, dockConvRef } from './AskPanel';
import { Composer, stopFor } from './Composer';
import { DockSessionView } from './DockSession';
import { engineActive } from './active';
import { slot, world, type World } from './accept/env';

let w: World | null = null;
let AD: ReturnType<typeof approverDaemon> | null = null;
afterEach(async () => {
  cleanup();
  const R = await import('./registry');
  R.resetRegistryForTests();
  vi.restoreAllMocks();
  try { (AP.mgr as ApproverManager | null)?.reset(); } catch { /* none */ }
  AP.mgr = null;
  AD = null;
  w?.dispose();
  w = null;
  const g = globalThis as Record<string, unknown>;
  for (const k of ['__fake', '__fakeOpts', '__hang', '__fail', '__held']) delete g[k];
});
const fake = (): FakeAgent => (globalThis as { __fake?: FakeAgent }).__fake!;

const AT = { project: slot.project, id: slot.computer, name: 'atlas' };
const HANDLE = computerHandle(AT);
const target = { project: { id: slot.project }, container: { id: slot.computer, server_name: 'atlas' } } as any;
const dir = { resolve: (h: string) => (h === HANDLE ? AT : null), handleOf: (id: string) => (id === AT.id ? HANDLE : null) };
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const sidOf = (e: AskEngine): string => e.record?.s ?? '';
const Dock = ({ eng, deps }: { eng: AskEngine; deps?: ActiveDeps }) => (
  <ConvBody deps={deps} eng={eng} conv={dockConvRef(eng, target)} host={{ computer: 'atlas', realm: 'This realm' }} agentUrl="https://agent.example/" typing={false} empty={<p>Nothing yet</p>} onTakeBack={() => undefined} column={<p>THE COLUMN</p>} />
);
const opts = (o: object): void => { (globalThis as { __fakeOpts?: object }).__fakeOpts = o; };
const rowStates = (e: AskEngine): string[] => Object.values(e.getSnapshot().conv.users).map((u) => u.state);
const log = () => screen.queryByRole('log', { name: 'Conversation' });

/** The page's approver manager over the fake daemon (real clock), the one the engine's handle opens on: made after the test's world
 *  (a manager made before it would have its tickets retired by the page reset). Every dock test runs on it, so no test reaches the page's own. */
function approverDaemon() {
  const d = fakeDaemon(() => Date.now());
  const mgr = createApproverManager({ api: () => d.api, routes: d.routes, clock: { mono: () => Date.now(), wall: () => Date.now() }, account: () => '64f0c0ffee0000000000c0de', holder: 'hub-test', claim: d.core.claim });
  AP.mgr = mgr;
  return { d, mgr };
}
async function dock(): Promise<{ R: typeof Reg; eng: AskEngine }> {
  w = world();
  AD = approverDaemon();
  const R = await import('./registry');
  R.setComputerDirectory(dir);
  const eng = R.engineFor(slot, target);
  await vi.waitFor(() => expect(eng.getSnapshot().phase).toBe('ready'), { timeout: 5000 });
  return { R, eng };
}
async function withScript(script: unknown[], more: object = {}): Promise<{ R: typeof Reg; eng: AskEngine; sid: string }> {
  opts({ script, ...more });
  const { R, eng } = await dock();
  eng.setAuto(false);
  eng.send('Build me a dashboard');
  await vi.waitFor(() => expect(sidOf(eng)).not.toBe(''), { timeout: 8000 });
  return { R, eng, sid: sidOf(eng) };
}
/** The page's attachment leases as they are (the real manager), over an api whose POST /attachments answers when the test says. */
function gatedLeases() {
  const calls: string[] = [];
  let land!: () => void;
  const landed = new Promise<void>((r) => { land = r; });
  const api: any = {
    acquire: async (id: string) => { calls.push('acquire ' + id); await landed; return { ok: true, body: { lease_id: 'L1', expires_at: new Date(Date.now() + 900000).toISOString() } }; },
    renew: async () => ({ ok: true, body: { lease_id: 'L1', expires_at: new Date(Date.now() + 900000).toISOString() } }),
    release: async () => ({ ok: true, body: { status: 'ok', released: true } }),
  };
  const mgr = createLeaseManager({ api: () => api, store: { read: () => undefined, write: () => undefined }, graceMs: 0 });
  const deps: ActiveDeps = {
    approvers: { state: () => ({ phase: 'none' }), subscribe: () => () => undefined } as any,
    leases: mgr as any, pending: () => [], onPending: () => () => undefined,
    set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as any), decode: () => new Uint8Array(), waitMs: 1000,
  };
  return { calls, deps, land };
}
/** The dock's composer over the engine, as AskPanel draws it under the transcript. */
function DockComposer({ eng }: { eng: AskEngine }) {
  const snap = useSyncExternalStore(eng.subscribe, eng.getSnapshot, eng.getSnapshot);
  return <Composer eng={eng} snap={snap} computer="atlas" draft="" setDraft={() => undefined} note={null} onDismissNote={() => undefined} flash={false} inputRef={{ current: null }} onTyping={() => undefined} />;
}
const decisions = () => fake().log.filter((x) => x[0] === 'confirm').length;
const names = () => screen.queryAllByRole('button').map((b) => b.textContent);

describe('the dock\'s SessionView keeps what the column did', () => {
  it('while a turn runs the dock draws ONE Stop, at the end of the working bar, as the AI page does: the box draws none', async () => {
    const { eng } = await withScript([[scripts.dashboard[0], { k: 'hold' }]]);
    await vi.waitFor(() => expect(stopFor(eng.getSnapshot(), () => undefined, true), 'a turn the agent named, running').not.toBeNull(), { timeout: 8000 });
    render(<><Dock eng={eng} /><DockComposer eng={eng} /></>);
    await vi.waitFor(() => expect(log()).not.toBeNull(), { timeout: 5000 });
    await vi.waitFor(() => expect(screen.getAllByRole('button', { name: 'Stop' })).toHaveLength(1), { timeout: 5000 });
    expect(screen.getByRole('textbox'), 'the box is drawn').toBeTruthy();
    const stop = vi.spyOn(eng, 'stop').mockImplementation(() => undefined as never);
    await act(async () => { screen.getByRole('button', { name: 'Stop' }).click(); await tick(20); });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('gate card: the dock attaches like the AI tab, Allow waits for the hold with its reason, then decides once; the decided line reads Allowed once', async () => {
    const { eng, sid } = await withScript([scripts.approval], { approvalMode: 'default' });
    await vi.waitFor(() => expect(eng.getSnapshot().gates.length).toBeGreaterThan(0), { timeout: 8000 });
    const L = gatedLeases();
    render(<Dock eng={eng} deps={L.deps} />);
    const allow = await screen.findByRole('button', { name: /Allow once/ });
    // The dock's source took the attachment hold for the dock's own session (one POST), and until it lands the card says why it waits.
    await vi.waitFor(() => expect(L.calls).toEqual(['acquire ' + sid]), { timeout: 5000 });
    expect((allow as HTMLButtonElement).disabled, 'Allow enabled before the hold landed').toBe(true);
    expect(log()!.textContent).toMatch(/not ready yet/);
    expect(document.querySelector('[aria-live="assertive"]')!.textContent, 'the card\'s arrival is announced').toBe('Your agent needs your approval');
    await act(async () => { allow.click(); await tick(100); });
    expect(decisions(), 'a decision was sent before the hold').toBe(0);
    await act(async () => { L.land(); await tick(100); });
    await vi.waitFor(() => expect((screen.getByRole('button', { name: /Allow once/ }) as HTMLButtonElement).disabled, 'never decidable: ' + (log()?.textContent ?? '').slice(-260) + ' | strict=' + String(eng.activation().strict) + ' approval reads=' + fake().log.filter((x) => x[0] === 'approval').length).toBe(false), { timeout: 8000 });
    await act(async () => { screen.getByRole('button', { name: /Allow once/ }).click(); await tick(200); });
    await vi.waitFor(() => expect(screen.getByText('Allowed once')).toBeTruthy(), { timeout: 8000 });
    expect(decisions(), 'a gate was decided more than once').toBe(1);
    expect(eng.getSnapshot().gates.length).toBe(0);
    await vi.waitFor(() => expect(document.querySelector('[aria-live="assertive"]')!.textContent, 'announcement left after the card').toBe(''), { timeout: 3000 });
    await vi.waitFor(() => expect(document.querySelector('[aria-live="polite"]')!.textContent, 'a finished reply is announced').not.toBe(''), { timeout: 8000 });
  });

  const acquires = (d: any, sid: string): number => d.sent.filter((x: any) => x.op === 'acquire' && x.id === sid).length;
  const releases = (d: any): number => d.sent.filter((x: any) => x.op === 'release').length;
  const held = (): Array<() => void> => ((globalThis as { __held?: Array<() => void> }).__held ??= []);
  const hang = (on: boolean): void => { (globalThis as { __hang?: object }).__hang = on ? { approval: true } : {}; };
  const letGo = (): void => { for (const f of held().splice(0)) f(); };
  /** The dock's gate card decided by the person once both leases are held (the attachment hold lands here). */
  async function decidable(eng: AskEngine, d: any, mgr: ApproverManager, sid: string, strict: boolean) {
    const L = gatedLeases();
    render(<Dock eng={eng} deps={{ ...L.deps, approvers: mgr as any }} />);
    await screen.findByRole('button', { name: /Allow once/ });
    if (strict) await vi.waitFor(() => expect(mgr.state({ computer: slot.computer, realm: eng.record!.r, sid }).phase).toBe('held'), { timeout: 5000 });
    await act(async () => { L.land(); await tick(100); });
    await vi.waitFor(() => expect((screen.getByRole('button', { name: /Allow once/ }) as HTMLButtonElement).disabled, 'the gate never became decidable').toBe(false), { timeout: 8000 });
    await act(async () => { screen.getByRole('button', { name: /Allow once/ }).click(); await tick(200); });
    await vi.waitFor(() => expect(decisions(), 'the decision was not sent').toBe(1), { timeout: 8000 });
  }
  /** The approver handle follows two facts, Strict and a parked card, and the read decides the first: a read still out changes nothing. */
  describe('the approver handle follows the facts (reconcileApproverHandle)', () => {
    it('a yolo frame while the approval read is out drops that read: it is asked again, and the Strict answer takes the lease for the parked gate, which is then decidable', async () => {
      hang(true);
      const { eng, sid } = await withScript([scripts.approval], { approvalMode: 'always' });
      const { d, mgr } = AD!;
      await vi.waitFor(() => expect(eng.getSnapshot().gates.length).toBeGreaterThan(0), { timeout: 8000 });
      await vi.waitFor(() => expect(held().length, 'the first read is out').toBe(1), { timeout: 5000 });
      await act(async () => { (eng as any).autoFrame({ event: { data: { enabled: false } } }); await tick(50); });
      expect(held().length, 'the read the frame dropped was not asked again').toBe(2);
      expect(acquires(d, sid), 'the lease was taken before the mode was read').toBe(0);
      hang(false);
      await act(async () => { letGo(); await tick(150); });
      await vi.waitFor(() => expect(acquires(d, sid), 'the re-asked read never took the lease').toBeGreaterThan(0), { timeout: 5000 });
      await decidable(eng, d, mgr, sid, true);
    });
    it('a yolo frame while the approval read is out: the re-asked read still tells the mode, so a "default" answer relaxes the chat and the gate needs no lease', async () => {
      hang(true);
      const { eng, sid } = await withScript([scripts.approval], { approvalMode: 'default' });
      const { d, mgr } = AD!;
      await vi.waitFor(() => expect(eng.getSnapshot().gates.length).toBeGreaterThan(0), { timeout: 8000 });
      await vi.waitFor(() => expect(held().length).toBe(1), { timeout: 5000 });
      await act(async () => { (eng as any).autoFrame({ event: { data: { enabled: false } } }); await tick(50); });
      hang(false);
      await act(async () => { letGo(); await tick(150); });
      await vi.waitFor(() => expect(eng.activation().strict, 'the mode the dropped read brought was never read').toBe(false), { timeout: 5000 });
      expect(acquires(d, sid), 'a relaxed chat took a lease').toBe(0);
      await decidable(eng, d, mgr, sid, false);
    });
    it('a read still out while a gate is parked changes nothing: a chat whose mode is not read yet takes no lease, and a "default" answer never takes one', async () => {
      hang(true);
      const { eng, sid } = await withScript([scripts.approval], { approvalMode: 'default' });
      const { d } = AD!;
      await vi.waitFor(() => expect(eng.getSnapshot().gates.length).toBeGreaterThan(0), { timeout: 8000 });
      await vi.waitFor(() => expect(held().length).toBe(1), { timeout: 5000 });
      await act(async () => { await tick(150); });
      expect(eng.activation().strict, 'counts Strict until read').toBe(true);
      expect(acquires(d, sid), 'a lease was taken while the mode was being read').toBe(0);
      hang(false);
      await act(async () => { letGo(); await tick(150); });
      await vi.waitFor(() => expect(eng.activation().strict).toBe(false), { timeout: 5000 });
      expect(acquires(d, sid), 'a "default" answer took a lease').toBe(0);
    });
    it('a read dropped by an Off/On request that failed (so nothing asks again) still ends: the Strict chat takes the lease for its parked gate', async () => {
      hang(true);
      const { eng, sid } = await withScript([scripts.approval], { approvalMode: 'always' });
      const { d } = AD!;
      await vi.waitFor(() => expect(eng.getSnapshot().gates.length).toBeGreaterThan(0), { timeout: 8000 });
      await vi.waitFor(() => expect(held().length).toBe(1), { timeout: 5000 });
      (globalThis as { __fail?: unknown }).__fail = { yolo: { status: 409, code: 'approval_policy_locked' } };
      await act(async () => { eng.setAuto(true); await tick(150); });
      expect(held().length, 'a failed put asked again').toBe(1);
      hang(false);
      await act(async () => { letGo(); await tick(150); });
      await vi.waitFor(() => expect(acquires(d, sid), 'the dropped read never let the handle follow the parked gate').toBeGreaterThan(0), { timeout: 5000 });
    });
    /** The engine's 20 s read budget, fired by hand: timers of that length are held (everything else runs as usual). */
    function budgetTimers(eng: AskEngine): Array<() => void> {
      const fire: Array<() => void> = [];
      const c = (eng as any).clock;
      (eng as any).clock = { ...c, set: (fn: () => void, ms: number) => (ms === 20000 ? (fire.push(fn), 0) : c.set(fn, ms)) };
      return fire;
    }
    async function hungDock(mode: string) {
      hang(true);
      opts({ script: [scripts.approval], approvalMode: mode });
      const { eng } = await dock();
      const fire = budgetTimers(eng);
      eng.setAuto(false);
      eng.send('Build me a dashboard');
      await vi.waitFor(() => expect(sidOf(eng)).not.toBe(''), { timeout: 8000 });
      return { eng, sid: sidOf(eng), fire };
    }
    it('a read nobody answers is given up on after its budget: the Strict chat takes the lease for its parked gate, the card says the mode could not be read, and Check again reads it (a "default" answer relaxes it)', async () => {
      const { eng, sid, fire } = await hungDock('default');
      const { d, mgr } = AD!;
      await vi.waitFor(() => expect(eng.getSnapshot().gates.length).toBeGreaterThan(0), { timeout: 8000 });
      await vi.waitFor(() => expect(held().length, 'the first read is out').toBe(1), { timeout: 5000 });
      expect(fire.length, 'a read arms its budget').toBeGreaterThan(0);
      expect(acquires(d, sid), 'a lease before any budget passed').toBe(0);
      await act(async () => { for (const f of fire.splice(0)) f(); await tick(50); });
      expect(eng.getSnapshot().modeUnread, 'the card does not say the mode could not be read').toBe(true);
      await vi.waitFor(() => expect(acquires(d, sid), 'the unanswered reads kept the handle shut').toBeGreaterThan(0), { timeout: 5000 });
      const L = gatedLeases();
      render(<Dock eng={eng} deps={{ ...L.deps, approvers: mgr as any }} />);
      const again = await screen.findByRole('button', { name: /Check again/ });
      hang(false);
      await act(async () => { again.click(); await tick(150); });
      await vi.waitFor(() => expect(eng.activation().strict, 'Check again did not read the mode').toBe(false), { timeout: 5000 });
      expect(eng.getSnapshot().modeUnread, 'the note stayed after the mode was read').toBeUndefined();
      await act(async () => { L.land(); await tick(100); });
      await vi.waitFor(() => expect((screen.getByRole('button', { name: /Allow once/ }) as HTMLButtonElement).disabled, 'never decidable').toBe(false), { timeout: 8000 });
      await act(async () => { screen.getByRole('button', { name: /Allow once/ }).click(); await tick(200); });
      await vi.waitFor(() => expect(decisions(), 'the decision was not sent').toBe(1), { timeout: 8000 });
    });
    it('a replacement read that fails (the yolo frame dropped the first, which nobody answers) does not keep the handle shut: the budget lets the Strict chat take the lease', async () => {
      const { eng, sid, fire } = await hungDock('always');
      const { d } = AD!;
      await vi.waitFor(() => expect(eng.getSnapshot().gates.length).toBeGreaterThan(0), { timeout: 8000 });
      await vi.waitFor(() => expect(held().length).toBe(1), { timeout: 5000 });
      (globalThis as { __fail?: unknown }).__fail = { approval: { status: 500, code: 'internal' } };
      hang(false);
      await act(async () => { (eng as any).autoFrame({ event: { data: { enabled: false } } }); await tick(100); });
      expect(acquires(d, sid), 'the failed replacement read alone decided').toBe(0);
      await act(async () => { for (const f of fire.splice(0)) f(); await tick(50); });
      await vi.waitFor(() => expect(acquires(d, sid), 'the unanswered read still holds the handle shut').toBeGreaterThan(0), { timeout: 5000 });
      expect(eng.getSnapshot().modeUnread).toBe(true);
    });
    /** A Strict chat holds the lease for a gate; a read then says "default" (the lease stays while that gate does); the gate leaves
     *  by `how`, with no further read: the lease goes back. */
    const leaves: Array<[string, (x: { eng: AskEngine; sid: string }) => Promise<void>]> = [
      ['a resolution frame', async ({ sid }) => {
        const f = fake() as any;
        const g = f.ss.get(sid).gate;
        f.emit(sid, undefined, 'event.gate_resolved', { kind: 'confirm', gate_id: g.dnum, outcome: 'answered' }, { id: g.id, generation: g.generation, type: 'confirm' });
      }],
      ['a state reconcile', async ({ eng }) => {
        const f = fake() as any;
        const orig = f.state.bind(f);
        f.state = (s: string) => orig(s).then((b: any) => { const c = { ...b, state: 'running' }; for (const k of ['pending_gate', 'pending_gate_ref', 'pending_lead_gates', 'pending_lead_gate_refs']) delete c[k]; return c; });
        (eng as any).recon('test');
      }],
      ['a decision', async ({ eng }) => { eng.decide('once'); }],
    ];
    for (const [how, leave] of leaves) {
      it(`a lease held for a gate goes back when the gate leaves by ${how}, after a "default" read relaxed the chat and with no further read`, async () => {
        const { eng, sid } = await withScript([scripts.approval], { approvalMode: 'weird' });
        const { d, mgr } = AD!;
        await vi.waitFor(() => expect(eng.getSnapshot().gates.length).toBeGreaterThan(0), { timeout: 8000 });
        await vi.waitFor(() => expect(mgr.state({ computer: slot.computer, realm: eng.record!.r, sid }).phase).toBe('held'), { timeout: 5000 });
        (fake() as any).o.approvalMode = 'default';
        (eng as any).readAuto(undefined, true);
        await vi.waitFor(() => expect(eng.activation().strict, 'the read did not relax the chat').toBe(false), { timeout: 5000 });
        await act(async () => { await tick(200); });
        expect(releases(d), 'the lease was given back with its gate still parked').toBe(0);
        const before = reads();
        await act(async () => { await leave({ eng, sid }); await tick(300); });
        await vi.waitFor(() => expect(eng.getSnapshot().gates.length, 'the gate is still shown').toBe(0), { timeout: 5000 });
        await vi.waitFor(() => expect(releases(d), 'the lease was not given back when its gate left').toBeGreaterThan(0), { timeout: 5000 });
        expect(reads(), 'the lease went back by a read, not by the gate leaving').toBe(before);
      });
    }
  });
  /** A default-mode create whose approval READ answers `mode` (a string) or no mode at all (null): core's parser (agent.approvalOf)
   *  refuses the answer, so the mode is unknown: the chat counts Strict, the card says the mode could not be read and
   *  offers Check again, the switch is not shown On, and the Strict chat takes the lease for its parked gate (the create opened
   *  none); the card is decidable once the attachment hold has landed too, not before. */
  async function strictByRead(mode: string | null, between?: (x: { eng: AskEngine; d: any; mgr: ApproverManager; sid: string }) => Promise<void>) {
    const { eng, sid } = await withScript([scripts.approval], { approvalMode: mode });
    const { d, mgr } = AD!;
    await vi.waitFor(() => expect(eng.getSnapshot().gates.length).toBeGreaterThan(0), { timeout: 8000 });
    const L = gatedLeases();
    render(<Dock eng={eng} deps={{ ...L.deps, approvers: mgr as any }} />);
    const allow = await screen.findByRole('button', { name: /Allow once/ });
    await vi.waitFor(() => expect(eng.activation().strict, 'the read left the chat relaxed').toBe(true), { timeout: 5000 });
    await vi.waitFor(() => expect(eng.getSnapshot().modeUnread, 'an answer the parser refuses did not read as unknown').toBe(true), { timeout: 5000 });
    expect(screen.getAllByRole('button', { name: /Check again/ }).length, 'the unknown mode offers no Check again').toBeGreaterThan(0);
    expect(eng.autoShown(), 'an unknown mode shows the switch On').not.toBe(true);
    await vi.waitFor(() => expect(d.sent.filter((x) => x.op === 'acquire' && x.id === sid).length, 'the Strict chat never took the approver lease for its gate').toBeGreaterThan(0), { timeout: 5000 });
    await vi.waitFor(() => expect(mgr.state({ computer: slot.computer, realm: eng.record!.r, sid }).phase).toBe('held'), { timeout: 5000 });
    await vi.waitFor(() => expect(L.calls).toEqual(['acquire ' + sid]), { timeout: 5000 });
    await between?.({ eng, d, mgr, sid });
    // The approver lease is held, the attachment hold is not: still no decision.
    expect((allow as HTMLButtonElement).disabled, 'Allow enabled before the attachment hold landed').toBe(true);
    await act(async () => { allow.click(); await tick(150); });
    expect(decisions(), 'a decision was sent before the attachment hold').toBe(0);
    await act(async () => { L.land(); await tick(100); });
    await vi.waitFor(() => expect((screen.getByRole('button', { name: /Allow once/ }) as HTMLButtonElement).disabled, 'never decidable with both leases held').toBe(false), { timeout: 8000 });
    await act(async () => { screen.getByRole('button', { name: /Allow once/ }).click(); await tick(200); });
    await vi.waitFor(() => expect(decisions(), 'the decision was not sent once both leases were held').toBe(1), { timeout: 8000 });
  }
  it('an approval mode the page does not know is unknown (Strict, not read, Check again): the lease is taken for the parked gate, and the gate is decidable only once both leases are held', async () => {
    await strictByRead('weird');
  });
  it('a later read that says "default" while the gate is parked does not give the held approver lease back', async () => {
    await strictByRead('weird', async ({ eng, d, mgr, sid }) => {
      (fake() as any).o.approvalMode = 'default';
      (eng as any).readAuto(undefined, true);
      await vi.waitFor(() => expect(eng.activation().strict, 'the read did not relax the chat').toBe(false), { timeout: 5000 });
      await act(async () => { await tick(200); });
      expect(d.sent.filter((x: any) => x.op === 'release'), 'the lease was given back with a gate parked').toHaveLength(0);
      expect(mgr.state({ computer: slot.computer, realm: eng.record!.r, sid }).phase).toBe('held');
    });
  });
  it('an agent that names no approval mode: unknown, so the chat counts Strict and the switch is not shown On, and no lease is taken while no gate is parked (the lease is for a gate)', async () => {
    const { eng, sid } = await withScript([scripts.dashboard], { approvalMode: null });
    const { d } = AD!;
    await vi.waitFor(() => expect(reads(), 'the mode was never read').toBeGreaterThan(0), { timeout: 8000 });
    await act(async () => { await tick(200); });
    expect(eng.activation().strict, 'no mode read counts as relaxed').toBe(true);
    expect(eng.getSnapshot().auto.on, 'an answer without a mode shows the switch as known').toBeNull();
    expect(acquires(d, sid), 'a lease was taken with no gate parked').toBe(0);
  });
  it('an approval read without a mode (none was ever read) is unknown (Strict, not read, Check again): the lease is taken for the parked gate, and the gate is decidable once both leases are held', async () => {
    await strictByRead(null);
  });

  it('a failed turn: the words, and Retry on the prompt (the row action); nothing else is offered', async () => {
    const { eng } = await withScript([scripts.failed]);
    await vi.waitFor(() => expect(JSON.stringify(eng.getSnapshot().conv.turns)).toContain('failed'), { timeout: 8000 });
    render(<Dock eng={eng} />);
    await vi.waitFor(() => expect(log()).not.toBeNull(), { timeout: 5000 });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(names()).not.toContain('New conversation');
  });

  it('a conversation that ran out of room: New conversation and the models page are offered under the transcript, and New acts on the engine', async () => {
    const { eng } = await withScript([[{ k: 'text', text: 'ok' }, { k: 'fail', code: 'context_overflow' }]]);
    await vi.waitFor(() => expect(JSON.stringify(eng.getSnapshot().conv.turns)).toContain('failed'), { timeout: 8000 });
    render(<Dock eng={eng} />);
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: 'New conversation' }), 'no New conversation').not.toBeNull(), { timeout: 5000 });
    expect(screen.queryByText('Open AI models'), 'no link to the models page after too long').not.toBeNull();
    const spy = vi.spyOn(eng, 'newConversation');
    await act(async () => { screen.getByRole('button', { name: 'New conversation' }).click(); await tick(20); });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a chat with no usable model: the models page is offered, and no New conversation or Retry', async () => {
    const { eng } = await withScript([[{ k: 'fail', code: 'model_unavailable' }]]);
    await vi.waitFor(() => expect(JSON.stringify(eng.getSnapshot().conv.turns)).toContain('failed'), { timeout: 8000 });
    render(<Dock eng={eng} />);
    await vi.waitFor(() => expect(screen.queryByText('Open AI models'), 'no link to the models page').not.toBeNull(), { timeout: 5000 });
    expect(screen.queryByText(/No usable model/), 'the words of the failure').not.toBeNull();
    // The dock's own way on, once: the transcript line's page link is left to pages without that tail.
    expect(screen.getAllByText('Open AI models')).toHaveLength(1);
    expect(names()).not.toContain('New conversation');
    expect(names()).not.toContain('Retry');
  });

  it('a follow-up that waits: the row says Queued once, with Check status and Remove; no Stop tracking while Remove can take it back', async () => {
    const hold = { k: 'hold' };
    opts({ script: [[scripts.dashboard[0], hold]] });
    const { eng } = await dock();
    eng.send('Build me a dashboard');
    await vi.waitFor(() => expect(sidOf(eng)).not.toBe(''), { timeout: 8000 });
    eng.send('and a chart');
    await vi.waitFor(() => expect(rowStates(eng)).toContain('queued'), { timeout: 5000 });
    render(<Dock eng={eng} />);
    await vi.waitFor(() => expect(log()).not.toBeNull(), { timeout: 5000 });
    expect(screen.getAllByText(/reads this at its next step/), 'the queued note is drawn twice').toHaveLength(1);
    const row = Object.values(eng.getSnapshot().conv.users).find((u) => u.state === 'queued')!;
    // Remove asks the agent to take it back; Stop tracking (and its "doesn't cancel" note) beside it would offer a second, weaker way out.
    expect(screen.getAllByRole('button', { name: 'Remove' }), 'Remove is on offer').toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Stop tracking' }), 'no Stop tracking beside Remove').toBeNull();
    expect(screen.queryByText(/doesn't cancel the message/), 'no dismiss note beside Remove').toBeNull();
    const check = vi.spyOn(eng, 'check').mockImplementation(() => undefined as never);
    await act(async () => { screen.getByRole('button', { name: 'Check status' }).click(); await tick(20); });
    expect(check).toHaveBeenCalledWith(row.id);
  });

  it('a take-back whose answer was lost: its words once, ONE Check (the tail\'s), no Remove, no Check again beside the bubble', async () => {
    opts({ withdraw: 'lost', script: [[scripts.dashboard[0], { k: 'hold' }]] });
    const { eng } = await dock();
    eng.send('Build me a dashboard');
    await vi.waitFor(() => expect(sidOf(eng)).not.toBe(''), { timeout: 8000 });
    eng.send('and a chart');
    await vi.waitFor(() => expect(rowStates(eng)).toContain('queued'), { timeout: 5000 });
    const row = Object.values(eng.getSnapshot().conv.users).find((u) => u.state === 'queued')!;
    await act(async () => { await eng.withdraw(row.id, 'remove'); });
    expect(eng.getSnapshot().conv.users[row.id]?.wd).toBe('unknown');
    render(<Dock eng={eng} />);
    await vi.waitFor(() => expect(log()).not.toBeNull(), { timeout: 5000 });
    expect(screen.getAllByText(/may have been taken back/), 'the words once').toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /^Check (status|again)$/ }).map((b) => b.textContent), 'one Check').toEqual(['Check status']);
    expect(screen.queryByRole('button', { name: 'Remove' }), 'never asked again').toBeNull();
  });

  it('a rate limit names the time to try again, and Retry appears by itself when that time comes (the column\'s countdown did this)', async () => {
    const at = new Date(Date.now() + 1500).toISOString();
    const { eng } = await withScript([[{ k: 'text', text: 'ok' }, { k: 'fail', code: 'rate_limit', retryAt: at }]]);
    await vi.waitFor(() => expect(JSON.stringify(eng.getSnapshot().conv.turns)).toContain('failed'), { timeout: 8000 });
    render(<Dock eng={eng} />);
    await vi.waitFor(() => expect(log()).not.toBeNull(), { timeout: 5000 });
    expect(screen.queryByRole('button', { name: 'Retry' }), 'Retry before its time').toBeNull();
    expect(log()!.textContent).toMatch(/try again/i);
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: 'Retry' }), 'Retry never came').not.toBeNull(), { timeout: 6000 });
  });

  it('a rate limit on the page\'s own source (it has no refresh to ask): Retry is absent before the time and drawn once it has come', async () => {
    const at = new Date(Date.now() + 1500).toISOString();
    const { eng } = await withScript([[{ k: 'text', text: 'ok' }, { k: 'fail', code: 'rate_limit', retryAt: at }]]);
    await vi.waitFor(() => expect(JSON.stringify(eng.getSnapshot().conv.turns)).toContain('failed'), { timeout: 8000 });
    const real = engineActive({ current: () => eng, release: () => undefined }, dockConvRef(eng, target)!, () => ({ computer: 'atlas', realm: 'This realm' }));
    expect('refresh' in real, 'the production source offers a refresh').toBe(false);
    // The blocks the source built before the time: the source is held to them, so Retry can only come from the dock's own wake.
    const early = real.snapshot();
    expect(early.blocks.some((b) => b.k === 'user' && b.actions?.includes('retry')), 'Retry offered before its time').toBe(false);
    const held = Object.create(real, { snapshot: { value: () => early } });
    render(<DockSessionView source={held} eng={eng} conv={dockConvRef(eng, target)} host={{ computer: 'atlas', realm: 'This realm' }} agentUrl="https://agent.example/" typing={false} empty={<p>Nothing yet</p>} onTakeBack={() => undefined} fallback={null} />);
    await vi.waitFor(() => expect(log()).not.toBeNull(), { timeout: 5000 });
    expect(screen.queryByRole('button', { name: 'Retry' }), 'Retry before its time').toBeNull();
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: 'Retry' }), 'Retry never came').not.toBeNull(), { timeout: 6000 });
    expect(Date.parse(at) - Date.now(), 'Retry came before the time').toBeLessThanOrEqual(0);
    expect(screen.getAllByRole('button', { name: 'Retry' }), 'Retry drawn more than once').toHaveLength(1);
    real.release();
  });

  it('a follow-up of unknown outcome: its state line has Check status, and the note is drawn once', async () => {
    const { eng } = await withScript([scripts.dashboard]);
    await vi.waitFor(() => expect(Object.values(eng.getSnapshot().conv.users).every((u) => u.state === 'sent')).toBe(true), { timeout: 8000 });
    (globalThis as { __fail?: unknown }).__fail = { turn: { status: 502, pending: true }, command: { status: 502, pending: true } };
    eng.send('and a chart');
    await vi.waitFor(() => expect(rowStates(eng)).toContain('unknown'), { timeout: 5000 });
    render(<Dock eng={eng} />);
    await vi.waitFor(() => expect(log()).not.toBeNull(), { timeout: 5000 });
    expect(screen.getAllByText(/May have gone through/), 'the unknown note is drawn twice').toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Check status' })).not.toBeNull();
  });

  it('a session the dock just made has its approval mode read, so a gate in its first turn is not left Strict', async () => {
    const { eng } = await withScript([scripts.dashboard], { approvalMode: 'default' });
    await vi.waitFor(() => expect(eng.activation().strict, 'the new session is still counted Strict').toBe(false), { timeout: 8000 });
    expect(fake().log.filter((x) => x[0] === 'approval').length).toBeGreaterThan(0);
  });

  const reads = () => fake().log.filter((x) => x[0] === 'approval').length;

  it('the mode is read once for a session the dock made, and a later put does not read it again (an opened session is read at open, not again by its puts)', async () => {
    const { eng } = await withScript([scripts.dashboard], { approvalMode: 'default' });
    await vi.waitFor(() => expect(eng.activation().strict).toBe(false), { timeout: 8000 });
    await tick(100);
    expect(reads(), 'the new session\'s mode was read more than once').toBe(1);
    await act(async () => { eng.setAuto(true); await tick(150); });
    await act(async () => { eng.setAuto(false); await tick(150); });
    expect(reads(), 'a put read the mode again').toBe(1);
  });

  it('a refused put reads nothing: the message is not sent, the chat stays counted Strict, and no gate can exist to be decided', async () => {
    opts({ script: [scripts.approval], approvalMode: 'default' });
    const { eng } = await dock();
    eng.setAuto(false);
    (globalThis as { __fail?: unknown }).__fail = { yolo: { status: 409, code: 'approval_policy_locked' } };
    eng.send('Build me a dashboard');
    await vi.waitFor(() => expect(rowStates(eng)).toContain('notSent'), { timeout: 8000 });
    await tick(200);
    expect(reads(), 'a refused put read the mode').toBe(0);
    expect(eng.activation().strict, 'a mode that was never read is not Default').toBe(true);
    expect(eng.getSnapshot().gates.length).toBe(0);
  });
});
