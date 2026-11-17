// The dock draws its conversation with the kit's SessionView over the dock's OWN
// engine (no hand-over: the Composer, header and Recent stay on the engine that holds the conversation), and what the dock sends on
// that engine is what the AI tab's source shows when it holds the same engine (the registry lends the dock's engine while it has a
// send to settle): one engine, one stream, one turn seen in both.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import type * as Data from './data';

type Hang = Record<string, boolean>;
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
import { engineActive, liveDeps } from './active';
import { scripts } from './fake';
import { ConvBody, dockConvRef } from './AskPanel';
import { ACCOUNT, REALM, slot, world, type World } from './accept/env';

let w: World | null = null;
afterEach(async () => {
  cleanup();
  const R = await import('./registry');
  R.resetRegistryForTests();
  vi.restoreAllMocks();
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
const Dock = ({ eng }: { eng: AskEngine }) => (
  <ConvBody eng={eng} conv={dockConvRef(eng, target)} host={{ computer: 'atlas', realm: 'This realm' }} agentUrl="https://agent.example/" typing={false} empty={<p>Nothing yet</p>} onTakeBack={() => undefined} column={<p>THE COLUMN</p>} />
);
const opts = (o: object): void => { (globalThis as { __fakeOpts?: object }).__fakeOpts = o; };
const rowStates = (e: AskEngine): string[] => Object.values(e.getSnapshot().conv.users).map((u) => u.state);
const log = () => screen.queryByRole('log', { name: 'Conversation' });

async function dock(): Promise<{ R: typeof Reg; eng: AskEngine }> {
  w = world();
  const R = await import('./registry');
  R.setComputerDirectory(dir);
  const eng = R.engineFor(slot, target);
  await vi.waitFor(() => expect(eng.getSnapshot().phase).toBe('ready'), { timeout: 5000 });
  return { R, eng };
}
async function withSession(): Promise<{ R: typeof Reg; eng: AskEngine; sid: string }> {
  const { R, eng } = await dock();
  eng.send('Build me a dashboard');
  await vi.waitFor(() => {
    expect(sidOf(eng)).not.toBe('');
    expect(Object.values(eng.getSnapshot().conv.users).every((u) => u.state === 'sent')).toBe(true);
  }, { timeout: 8000 });
  await vi.waitFor(() => expect(fake().openStreams(sidOf(eng))).toBe(1), { timeout: 5000 });
  return { R, eng, sid: sidOf(eng) };
}

describe('the dock over its own engine', () => {
  it('no session yet: the column; once the conversation has a session: the SessionView, on the same engine, with no hand-over', async () => {
    const { eng } = await dock();
    const v = render(<Dock eng={eng} />);
    await act(async () => { await tick(20); });
    expect(screen.getByText('THE COLUMN')).toBeTruthy();
    expect(log()).toBeNull();
    eng.send('Build me a dashboard');
    await vi.waitFor(() => expect(sidOf(eng)).not.toBe(''), { timeout: 8000 });
    v.rerender(<Dock eng={eng} />);
    await vi.waitFor(() => expect(log(), 'the SessionView is not drawn').not.toBeNull(), { timeout: 5000 });
    expect(screen.queryByText('THE COLUMN')).toBeNull();
    expect(screen.getByText('Build me a dashboard')).toBeTruthy();
    await act(async () => { await tick(200); });
    // The dock still holds its conversation (the SessionView did not take it away), and one engine streams it.
    expect(eng.session(), 'the dock engine lost its session').toBe(sidOf(eng));
    expect(fake().openStreams(sidOf(eng))).toBe(1);
  });

  it('a follow-up the dock sends shows in the SessionView; unmounting it leaves the dock\'s engine alive', async () => {
    const { eng, sid } = await withSession();
    const v = render(<Dock eng={eng} />);
    await vi.waitFor(() => expect(log()).not.toBeNull(), { timeout: 5000 });
    await act(async () => { eng.send('and a chart'); await tick(100); });
    await vi.waitFor(() => expect(screen.getByText('and a chart')).toBeTruthy(), { timeout: 5000 });
    v.unmount();
    expect(eng.getSnapshot().phase).not.toBe('ended');
    expect(eng.session()).toBe(sid);
    expect(fake().openStreams(sid)).toBe(1);
  });

  it('the dock\'s send lands on the SAME engine the AI tab\'s source holds: one turn, seen in both', async () => {
    // A turn that stays running, with a follow-up queued behind it: the dock is not quiet, so the AI tab opening the reference is
    // lent the dock's own engine (a quiet dock would hand its conversation over instead, and be blank).
    opts({ script: [[scripts.dashboard[0], { k: 'hold' }]] });
    const { R, eng } = await dock();
    eng.send('Build me a dashboard');
    await vi.waitFor(() => expect(sidOf(eng)).not.toBe(''), { timeout: 8000 });
    const sid = sidOf(eng);
    await vi.waitFor(() => expect(fake().openStreams(sid)).toBe(1), { timeout: 5000 });
    // The follow-up goes once the turn is parked at its hold: before that the fixture commits it at the turn's next step.
    await vi.waitFor(() => expect(fake().held(sid)).toBe(true), { timeout: 5000 });
    eng.send('and a chart');
    await vi.waitFor(() => expect(rowStates(eng)).toContain('queued'), { timeout: 5000 });
    const ref = { computer: HANDLE, realm: REALM, sid };
    const h = R.openRef(ACCOUNT, ref, AT)!;
    expect(h.current(), 'the AI tab got a second engine').toBe(eng);
    const tab = engineActive(h, ref, () => ({ computer: 'atlas', realm: 'This realm' }), liveDeps());
    render(<Dock eng={eng} />);
    await vi.waitFor(() => expect(log()).not.toBeNull(), { timeout: 5000 });
    // The dock's Composer sends with eng.send: the same call, here.
    let sent = false;
    await act(async () => { sent = eng.send('and a table'); await tick(100); });
    expect(sent, 'the engine refused the send').toBe(true);
    const texts = () => tab.snapshot().blocks.filter((b) => b.k === 'user').map((b) => (b as { text: string }).text);
    expect(texts(), 'the AI tab\'s source does not show the dock\'s send').toContain('and a table');
    expect(texts().filter((x) => x === 'and a table'), 'one turn, not two').toHaveLength(1);
    expect(within(log()!).getAllByText('and a table'), 'the dock\'s own view does not show it once').toHaveLength(1);
    expect(fake().openStreams(sid), 'two engines stream one session').toBe(1);
    tab.release();
    h.release();
  });
});
