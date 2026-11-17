// The switch half: the dock's Approve automatically switch and Details → Session keep one
// attempt store per conversation (kit useApproval). The switch takes the conversation's attempt before it sends and
// settles it from the engine's answer; a lost answer the read does not settle stays "may have gone through" in both
// surfaces; while either holds an unsettled change the other sends nothing, and Check again reads once, sending nothing.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState, useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreMod from '@core';
import { approvalAttemptOf, checkApprovalAttempt, forgetApprovalAttempts, takeApprovalAttempt, useApproval } from '@kit/agent/useApproval';
import { Composer } from './Composer';
import { AskEngine, targetOf, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock, scripts, type Beat } from './fake';
import { factsOf } from './source';
import type { AskStore } from './logic';
import strings from './strings.en.json';

// Details → Session reads and writes through core's approval API; here its auto-approve reaches the same fake agent the
// engine does, and its mode is `W.mode`. While `W.hold` is set, a read waits in `W.waiting` and answers what is there then.
const W = vi.hoisted(() => ({
  agent: null as null | { peek(sid: string): { yolo: boolean }; yolo(sid: string, on: boolean): Promise<unknown> },
  reads: [] as string[],
  sent: [] as string[],
  mode: 'default' as 'default' | 'always',
  onMode: null as null | (() => void),
  hold: false,
  waiting: [] as Array<() => void>,
}));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof CoreMod>();
  const fake = (realm?: string): CoreMod.agent.ApprovalApi => ({
    approval: (id: string) => {
      W.reads.push(`${realm}:${id}`);
      const answer = () => ({ ok: true, body: { mode: W.mode, locked: false, revision: 1, yolo: W.agent!.peek(id).yolo } });
      return W.hold ? new Promise((res) => W.waiting.push(() => res(answer()))) : Promise.resolve(answer());
    },
    setMode: (_id: string, value: 'default' | 'always') => {
      W.sent.push(`mode=${value}`);
      W.mode = value;
      W.onMode?.();
      return Promise.resolve({ ok: true, body: {} });
    },
    setYolo: (id: string, on: boolean) => {
      W.sent.push(`yolo=${String(on)}`);
      return W.agent!.yolo(id, on).then(() => ({ ok: true, body: {} }));
    },
  }) as unknown as CoreMod.agent.ApprovalApi;
  return { ...real, agent: { ...real.agent, approvalApi: (_t?: unknown, realm?: string) => fake(realm) } };
});

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas', server: 'srv' };
// The target Details → Session gets for this chat (pages/ai: the computer's project, id and server_name).
const TARGET = targetOf(slot.project, slot.computer, slot.server);

function memStore(): StoreIO {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); } };
}
/** The agent's yolo answers, lost or held: 'lost' answers nothing (the change does or does not land, `lands`). */
function yoloAs(agent: FakeAgent, how: { lost?: boolean; lands?: boolean; hold?: boolean; refuse?: string }) {
  const fa = agent as unknown as { yolo(sid: string, on: boolean): Promise<unknown> };
  const real = fa.yolo.bind(agent);
  const held: Array<() => void> = [];
  const calls: boolean[] = [];
  fa.yolo = (sid: string, on: boolean) => {
    calls.push(on);
    const answer = (): Promise<unknown> => {
      if (how.refuse) return Promise.reject({ status: 409, code: how.refuse, body: { error: { code: how.refuse } } });
      if (how.lost) {
        if (how.lands) void real(sid, on);
        return Promise.reject({ status: 0 });
      }
      return real(sid, on);
    };
    return how.hold ? new Promise((res, rej) => held.push(() => { answer().then(res, rej); })) : answer();
  };
  return {
    calls,
    release: () => { for (const f of held.splice(0)) f(); },
    /** Answers the i-th write still held (in the order they were sent), the others stay held. */
    releaseAt: (i: number) => { const [f] = held.splice(i, 1); f!(); },
  };
}
/** The agent's approval reads wait until released. */
function holdReads(agent: FakeAgent) {
  const fa = agent as unknown as { approval(sid: string): Promise<unknown> };
  const real = fa.approval.bind(agent);
  const held: Array<() => void> = [];
  fa.approval = (sid: string) => new Promise((res, rej) => held.push(() => { real(sid).then(res, rej); }));
  return { count: () => held.length, release: () => { for (const f of held.splice(0)) f(); } };
}

async function setup(script: Beat[][] = [scripts.dashboard, scripts.dashboard]) {
  const clock = manualClock();
  const agent = new FakeAgent({ account: ACCOUNT, pace: 10, realms: [REALM], script }, clock);
  W.agent = agent as unknown as typeof W.agent;
  const eng = new AskEngine(slot, agent, memStore(), clock);
  const flush = async (ms = 0) => {
    await act(async () => {
      const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); } };
      await drain();
      for (let left = ms; left > 0; left -= 10) { clock.run(Math.min(10, left)); await drain(); }
    });
  };
  eng.open();
  await flush();
  return { agent, eng, flush };
}
/** A conversation with a session: one message sent and answered (the switch starts On). */
async function withSession(script?: Beat[][]) {
  const t = await setup(script);
  t.eng.send('Hello');
  await t.flush(3000);
  const sid = t.eng.record!.s!;
  expect(sid).toBeTruthy();
  expect(t.eng.record!.r).toBe(REALM);
  expect(t.eng.getSnapshot().auto.on).toBe(true);
  return { ...t, sid };
}

function Dock({ eng }: { eng: AskEngine }) {
  const snap = useSyncExternalStore(eng.subscribe, eng.getSnapshot);
  const [draft, setDraft] = useState('');
  return <Composer eng={eng} snap={snap} computer="atlas" draft={draft} setDraft={setDraft} note={null} onDismissNote={() => {}} flash={false} inputRef={{ current: null }} onTyping={() => {}} />;
}
function Details({ sid }: { sid: string }) {
  const d = useApproval(TARGET, sid, REALM);
  return (
    <div data-testid="details">
      <span data-testid="change">{d.change ? `${d.change.kind}:${d.change.change.field}=${String(d.change.change.value)}` : 'none'}</span>
      <button type="button" onClick={() => d.save({ field: 'yolo', value: true })}>details-on</button>
      <button type="button" onClick={() => d.save({ field: 'mode', value: 'default' })}>details-default</button>
      <button type="button" onClick={() => d.retry()}>details-read</button>
      <button type="button" onClick={() => void d.check()}>details-check</button>
    </div>
  );
}
const sw = () => screen.getByRole('switch') as HTMLInputElement;
const swOff = (el: HTMLInputElement) => el.disabled || el.getAttribute('aria-disabled') === 'true';
const held = (sid: string) => approvalAttemptOf(TARGET, REALM, sid);
const change = () => screen.getByTestId('change').textContent;
/** Another client sets the session's auto-approve (no frame reaches this page). */
const yoloThere = (agent: FakeAgent, sid: string, on: boolean) => {
  (agent as unknown as { ss: Map<string, { yolo: boolean }> }).ss.get(sid)!.yolo = on;
};

beforeEach(() => {
  forgetApprovalAttempts();
  W.reads = [];
  W.sent = [];
  W.mode = 'default';
  W.onMode = null;
  W.hold = false;
  W.waiting = [];
});

describe('the switch takes the conversation\'s shared attempt', () => {
  it('SA1 an answered Off: the attempt is held (running) while the answer is out, under Details\' key, and dropped once it says Off', async () => {
    const t = await withSession();
    const y = yoloAs(t.agent, { hold: true });
    // The engine alone tells the write's end; the switch subscribes to nothing for it (only the dock's own store read does).
    const sub = vi.spyOn(t.eng, 'subscribe');
    render(<><Dock eng={t.eng} /><Details sid={t.sid} /></>);
    await t.flush();
    const mounted = sub.mock.calls.length;
    fireEvent.click(sw());
    await t.flush();
    expect(sub.mock.calls.length).toBe(mounted);
    expect(y.calls).toEqual([false]);
    expect(held(t.sid)).toEqual({ kind: 'running', change: { field: 'yolo', value: false } });
    await waitFor(() => expect(change()).toBe('running:yolo=false'));
    y.release();
    await t.flush();
    expect(held(t.sid)).toBeNull();
    expect(change()).toBe('none');
    expect(t.eng.getSnapshot().auto.on).toBe(false);
  });

  it('SA2 a lost answer whose read does not show the change: pending in both surfaces; the switch is off and offers Check again, and its own "may not have changed" note gives way', async () => {
    const t = await withSession();
    const y = yoloAs(t.agent, { lost: true, lands: false });
    render(<><Dock eng={t.eng} /><Details sid={t.sid} /></>);
    await t.flush();
    fireEvent.click(sw());
    await t.flush(100);
    expect(y.calls).toEqual([false]);
    expect(held(t.sid)).toEqual({ kind: 'pending', change: { field: 'yolo', value: false } });
    await waitFor(() => expect(change()).toBe('pending:yolo=false'));
    expect(screen.getByText(strings['ask.autoMaybe'])).toBeTruthy();
    expect(screen.queryByText(strings['ask.autoUnknown'])).toBeNull();
    expect(swOff(sw())).toBe(true);
    // A second press sends nothing (C9: never a resend while it may have gone through).
    fireEvent.click(sw());
    await t.flush(100);
    expect(y.calls).toEqual([false]);
    // Details cannot send its own change over it either.
    fireEvent.click(screen.getByRole('button', { name: 'details-on' }));
    await t.flush(100);
    expect(W.sent).toEqual([]);
  });

  it('SA3 a lost answer whose read shows the change settles: nothing held, no note', async () => {
    const t = await withSession();
    yoloAs(t.agent, { lost: true, lands: true });
    render(<><Dock eng={t.eng} /><Details sid={t.sid} /></>);
    await t.flush();
    fireEvent.click(sw());
    await t.flush(100);
    expect(t.eng.getSnapshot().auto.on).toBe(false);
    expect(held(t.sid)).toBeNull();
    expect(screen.queryByText(strings['ask.autoMaybe'])).toBeNull();
  });

  it('SA4 a refusal settles: nothing held, the refusal says why', async () => {
    const t = await withSession();
    yoloAs(t.agent, { refuse: 'approval_policy_locked' });
    render(<Dock eng={t.eng} />);
    await t.flush();
    fireEvent.click(sw());
    await t.flush(100);
    expect(held(t.sid)).toBeNull();
    expect(screen.getByText(strings['ask.autoLocked'])).toBeTruthy();
    expect(swOff(sw())).toBe(false);
  });

  it('SA5 the conversation changes while the answer is out: the change may have gone through, never settled by the reset', async () => {
    const t = await withSession();
    const y = yoloAs(t.agent, { hold: true });
    render(<Dock eng={t.eng} />);
    await t.flush();
    fireEvent.click(sw());
    expect(held(t.sid)?.kind).toBe('running');
    act(() => t.eng.newConversation());
    await t.flush();
    expect(held(t.sid)).toEqual({ kind: 'pending', change: { field: 'yolo', value: false } });
    y.release();
    await t.flush();
    expect(held(t.sid)?.kind).toBe('pending');
  });

  it('SA6 before the conversation has a session the switch only sets the wish: no attempt is taken', async () => {
    const t = await setup();
    render(<Dock eng={t.eng} />);
    await t.flush();
    fireEvent.click(sw());
    expect(t.eng.autoBefore()).toBe(false);
    expect(t.eng.record?.s ?? null).toBeNull();
    expect(W.reads).toEqual([]);
  });
});

describe('the switch\'s attempt ends with its own write, and with nothing else', () => {
  it('SA7 the engine ends while the switch\'s write is out: may have gone through, and the late answer does not settle it', async () => {
    const t = await withSession();
    const y = yoloAs(t.agent, { hold: true });
    render(<Dock eng={t.eng} />);
    await t.flush();
    fireEvent.click(sw());
    expect(held(t.sid)?.kind).toBe('running');
    act(() => t.eng.end());
    await t.flush();
    expect(held(t.sid)).toEqual({ kind: 'pending', change: { field: 'yolo', value: false } });
    y.release();
    await t.flush(100);
    expect(held(t.sid)?.kind).toBe('pending');
  });

  it('SA8 the engine ends while a lost answer is being read back: may have gone through, and the late read does not settle it', async () => {
    const t = await withSession();
    yoloAs(t.agent, { lost: true, lands: true });
    render(<Dock eng={t.eng} />);
    await t.flush();
    const r = holdReads(t.agent);
    fireEvent.click(sw());
    await t.flush();
    expect(r.count()).toBe(1);
    expect(held(t.sid)?.kind).toBe('running');
    act(() => t.eng.end());
    await t.flush();
    expect(held(t.sid)?.kind).toBe('pending');
    r.release();
    await t.flush(100);
    expect(held(t.sid)?.kind).toBe('pending');
  });

  it('SA9 a send-path write that answers first does not settle the switch\'s write still out; its own answer does', async () => {
    const t = await withSession();
    const y = yoloAs(t.agent, { hold: true });
    render(<Dock eng={t.eng} />);
    await t.flush();
    fireEvent.click(sw());
    // A message now: the send path reads the mode (still On, the switch's Off has not landed) and arms Off itself.
    act(() => { t.eng.send('Next'); });
    await t.flush(100);
    expect(y.calls).toEqual([false, false]);
    y.releaseAt(1);
    await t.flush(100);
    expect(held(t.sid)).toEqual({ kind: 'running', change: { field: 'yolo', value: false } });
    y.releaseAt(0);
    await t.flush(100);
    expect(held(t.sid)).toBeNull();
  });
});

describe('the engine ends every switch write exactly once, reset() included', () => {
  it('SA10 the same conversation opened again while the lost answer is read back: may have gone through; the late read leaves it so', async () => {
    const t = await withSession();
    yoloAs(t.agent, { lost: true, lands: true });
    render(<Dock eng={t.eng} />);
    await t.flush();
    const r = holdReads(t.agent);
    fireEvent.click(sw());
    await t.flush();
    expect(r.count()).toBe(1);
    expect(held(t.sid)?.kind).toBe('running');
    act(() => { expect(t.eng.openConversation(t.eng.record!.k1)).toBe(true); });
    await t.flush();
    expect(t.eng.record?.s).toBe(t.sid);
    expect(held(t.sid)).toEqual({ kind: 'pending', change: { field: 'yolo', value: false } });
    r.release();
    await t.flush(100);
    expect(held(t.sid)?.kind).toBe('pending');
  });

  it('SA11 the same conversation opened again while the write is out: may have gone through; the late answer leaves it so', async () => {
    const t = await withSession();
    const y = yoloAs(t.agent, { hold: true });
    render(<Dock eng={t.eng} />);
    await t.flush();
    fireEvent.click(sw());
    act(() => { expect(t.eng.openConversation(t.eng.record!.k1)).toBe(true); });
    await t.flush();
    expect(t.eng.record?.s).toBe(t.sid);
    expect(held(t.sid)?.kind).toBe('pending');
    y.release();
    await t.flush(100);
    expect(held(t.sid)?.kind).toBe('pending');
  });

  it('SA12 the On confirm is open when a send-path write makes the engine busy: Turn on sends nothing and leaves no attempt', async () => {
    const t = await withSession();
    act(() => t.eng.setAuto(false));
    await t.flush(100);
    // Another client turns the session On; this page still shows Off.
    (t.agent as unknown as { ss: Map<string, { yolo: boolean }> }).ss.get(t.sid)!.yolo = true;
    const y = yoloAs(t.agent, { hold: true });
    render(<Dock eng={t.eng} />);
    await t.flush();
    fireEvent.click(sw());
    const d = screen.getByRole('alertdialog');
    // A message: the send path reads On and arms Off itself, which is held.
    act(() => { t.eng.send('Next'); });
    await t.flush(100);
    expect(y.calls).toEqual([false]);
    expect(t.eng.getSnapshot().auto.busy).toBe(true);
    fireEvent.click(within(d).getByRole('button', { name: strings['ask.autoConfirmGo'] }));
    await t.flush();
    expect(y.calls).toEqual([false]);
    expect(held(t.sid)).toBeNull();
  });

  it('SE1 each write is told once: reset tells unknown while the conversation is still the write\'s, and its late answer tells nothing', async () => {
    const t = await withSession();
    const y = yoloAs(t.agent, { hold: true });
    const told: Array<[string, string | null | undefined]> = [];
    expect(t.eng.setAuto(false, (o) => told.push([o, t.eng.record?.s]))).toBe(true);
    await t.flush();
    act(() => t.eng.newConversation());
    expect(told).toEqual([['unknown', t.sid]]);
    y.release();
    await t.flush(100);
    expect(told).toEqual([['unknown', t.sid]]);
  });

  it('SE2 end() with a write out tells it unknown, once', async () => {
    const t = await withSession();
    const y = yoloAs(t.agent, { hold: true });
    const told: string[] = [];
    t.eng.setAuto(false, (o) => told.push(o));
    await t.flush();
    t.eng.end();
    expect(told).toEqual(['unknown']);
    y.release();
    await t.flush(100);
    expect(told).toEqual(['unknown']);
  });

  it('SE3 an answered write is told once; nothing is left for a later reset to tell', async () => {
    const t = await withSession();
    yoloAs(t.agent, {});
    const told: string[] = [];
    t.eng.setAuto(false, (o) => told.push(o));
    await t.flush(100);
    expect(told).toEqual(['answered']);
    act(() => t.eng.newConversation());
    expect(told).toEqual(['answered']);
  });
});

describe('a change Details → Session holds stops the switch', () => {
  it('SB1 Details\' change out now: the switch is off and says it is being saved; a press sends nothing', async () => {
    const t = await withSession();
    const y = yoloAs(t.agent, {});
    const h = takeApprovalAttempt(TARGET, REALM, t.sid, { field: 'mode', value: 'always' });
    expect(h).not.toBeNull();
    render(<Dock eng={t.eng} />);
    await t.flush();
    expect(screen.getByText(strings['ask.autoHeld'])).toBeTruthy();
    expect(swOff(sw())).toBe(true);
    fireEvent.click(sw());
    await t.flush(100);
    expect(y.calls).toEqual([]);
    act(() => h!.settle());
    await t.flush();
    expect(screen.queryByText(strings['ask.autoHeld'])).toBeNull();
    expect(swOff(sw())).toBe(false);
  });

  it('SB2 Details\' change that may have gone through: Check again here reads once, sends nothing, and frees the switch when it shows', async () => {
    const t = await withSession();
    const y = yoloAs(t.agent, {});
    // Details sent Off and lost the answer; the change did land.
    takeApprovalAttempt(TARGET, REALM, t.sid, { field: 'yolo', value: false })!.unknown();
    (t.agent as unknown as { ss: Map<string, { yolo: boolean }> }).ss.get(t.sid)!.yolo = false;
    render(<Dock eng={t.eng} />);
    await t.flush();
    expect(screen.getByText(strings['ask.autoMaybe'])).toBeTruthy();
    expect(swOff(sw())).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: strings['ask.checkAgain'] }));
    await t.flush(100);
    expect(W.reads).toEqual([`${REALM}:${t.sid}`]);
    expect(y.calls).toEqual([]);
    expect(held(t.sid)).toBeNull();
    expect(screen.queryByText(strings['ask.autoMaybe'])).toBeNull();
    // The engine read the mode again, so the switch shows what the session is now.
    expect(t.eng.getSnapshot().auto.on).toBe(false);
    expect(swOff(sw())).toBe(false);
  });

  it('SB4 a change Details takes while the On confirm is open: Turn on sends nothing', async () => {
    const t = await withSession();
    act(() => t.eng.setAuto(false));
    await t.flush(100);
    const y = yoloAs(t.agent, {});
    render(<Dock eng={t.eng} />);
    await t.flush();
    fireEvent.click(sw());
    const d = screen.getByRole('alertdialog');
    act(() => { takeApprovalAttempt(TARGET, REALM, t.sid, { field: 'mode', value: 'always' }); });
    fireEvent.click(within(d).getByRole('button', { name: strings['ask.autoConfirmGo'] }));
    await t.flush(100);
    expect(y.calls).toEqual([]);
    expect(held(t.sid)).toEqual({ kind: 'running', change: { field: 'mode', value: 'always' } });
  });

  it('SB3 another conversation\'s change does not stop this one\'s switch', async () => {
    const t = await withSession();
    takeApprovalAttempt(TARGET, REALM, 'another-session', { field: 'yolo', value: true });
    takeApprovalAttempt(TARGET, 'global', t.sid, { field: 'yolo', value: true });
    render(<Dock eng={t.eng} />);
    await t.flush();
    expect(screen.queryByText(strings['ask.autoHeld'])).toBeNull();
    expect(swOff(sw())).toBe(false);
  });
});

describe('the shared attempt, one per conversation', () => {
  it('SC1 a second take for the same conversation is refused; settle and unknown each act once', () => {
    const a = takeApprovalAttempt(TARGET, REALM, 's1', { field: 'yolo', value: true })!;
    expect(takeApprovalAttempt(TARGET, REALM, 's1', { field: 'yolo', value: false })).toBeNull();
    a.unknown();
    expect(held('s1')?.kind).toBe('pending');
    a.settle();
    expect(held('s1')?.kind).toBe('pending');
    expect(takeApprovalAttempt(TARGET, REALM, 's1', { field: 'yolo', value: false })).toBeNull();    // The other order: settled first, a late unknown changes nothing.
    const b = takeApprovalAttempt(TARGET, REALM, 's1b', { field: 'yolo', value: true })!;
    b.settle();
    b.unknown();
    expect(held('s1b')).toBeNull();
  });
  it('SC2 Check again reads only a pending attempt: one out now reads nothing', async () => {
    W.agent = { peek: () => ({ yolo: true }), yolo: () => Promise.resolve({}) };
    takeApprovalAttempt(TARGET, REALM, 's2', { field: 'yolo', value: true });
    expect(await checkApprovalAttempt(TARGET, REALM, 's2')).toBe(false);
    expect(W.reads).toEqual([]);
    expect(held('s2')?.kind).toBe('running');
  });
  it('SC3 Check again that does not show the change keeps it pending', async () => {
    W.agent = { peek: () => ({ yolo: false }), yolo: () => Promise.resolve({}) };
    takeApprovalAttempt(TARGET, REALM, 's3', { field: 'yolo', value: true })!.unknown();
    expect(await checkApprovalAttempt(TARGET, REALM, 's3')).toBe(false);
    expect(W.reads).toEqual([`${REALM}:s3`]);
    expect(held('s3')?.kind).toBe('pending');
  });
});

describe('a finished change is said only while the read bears it out', () => {
  /** A chat on Ask every time (auto-approve off), Details → Session shown. */
  async function strictChat() {
    const t = await withSession();
    W.mode = 'always';
    yoloThere(t.agent, t.sid, false);
    render(<Details sid={t.sid} />);
    await t.flush();
    return t;
  }
  /** Details saves Ask when needed; the read-back shows it with auto-approve off, so it is said. */
  async function savedDefault(t: Awaited<ReturnType<typeof strictChat>>) {
    fireEvent.click(screen.getByRole('button', { name: 'details-default' }));
    await t.flush(100);
    expect(W.sent).toEqual(['mode=default']);
    expect(held(t.sid)).toBeNull();
    expect(change()).toBe('done:mode=default');
  }
  /** Details reads the chat again: one read. */
  async function readAgain(t: Awaited<ReturnType<typeof strictChat>>) {
    const n = W.reads.length;
    fireEvent.click(screen.getByRole('button', { name: 'details-read' }));
    await t.flush(100);
    expect(W.reads.length).toBe(n + 1);
  }

  it('SD1 another client turns auto-approve on: the next read no longer says Ask when needed (it asks nothing under it)', async () => {
    const t = await strictChat();
    await savedDefault(t);
    yoloThere(t.agent, t.sid, true);
    await readAgain(t);
    expect(change()).toBe('none');
  });

  it('SD2 another client chooses Ask every time: the next read no longer says Ask when needed', async () => {
    const t = await strictChat();
    await savedDefault(t);
    W.mode = 'always';
    await readAgain(t);
    expect(change()).toBe('none');
  });

  it('SD3 another client turns auto-approve on while the change is out: the read-back shows the mode and settles it, and nothing is said', async () => {
    const t = await strictChat();
    W.onMode = () => yoloThere(t.agent, t.sid, true);
    fireEvent.click(screen.getByRole('button', { name: 'details-default' }));
    await t.flush(100);
    expect(W.sent).toEqual(['mode=default']);
    expect(held(t.sid)).toBeNull();
    expect(change()).toBe('none');
  });

  it('SD4 another surface\'s change begins after Details finished one: the finished one is not said again, even before the next read answers', async () => {
    const t = await strictChat();
    await savedDefault(t);
    // The dock turns auto-approve on and loses the answer: it may have gone through.
    act(() => { takeApprovalAttempt(TARGET, REALM, t.sid, { field: 'yolo', value: true })!.unknown(); });
    await t.flush();
    expect(change()).toBe('pending:yolo=true');
    // It did land, and the dock's Check again shows it. Details then reads the chat again; that read is held.
    yoloThere(t.agent, t.sid, true);
    let checked: Promise<boolean> = Promise.resolve(false);
    act(() => {
      checked = checkApprovalAttempt(TARGET, REALM, t.sid);
      W.hold = true;
    });
    await t.flush();
    expect(await checked).toBe(true);
    expect(held(t.sid)).toBeNull();
    expect(W.waiting.length).toBe(1);
    expect(change()).toBe('none');
    W.hold = false;
    act(() => { for (const f of W.waiting.splice(0)) f(); });
    await t.flush();
    expect(change()).toBe('none');
  });
});

describe('another client\'s switch reaches the page at once', () => {
  it('a yolo_mode frame during a running turn publishes the snapshot before any paint, and the source\'s facts carry it', async () => {
    // The second turn parks running: no turn end publishes for the frame, so only the frame's own publish can reach `seen`.
    const t = await withSession([scripts.dashboard, [{ k: 'text', text: 'Working' }, { k: 'hold' }]]);
    t.eng.send('Keep going');
    await t.flush(3000);
    expect(t.agent.held(t.sid)).toBe(true);
    expect(t.eng.getSnapshot().conv.turns.at(-1)?.s.terminal ?? null).toBeNull();
    const seen = vi.fn();
    const off = t.eng.subscribe(seen);
    const frame = (enabled: boolean) => (t.eng as unknown as { onFrame(name: string, d: unknown): void }).onFrame('yolo_mode', { seq: 1, event: { type: 'event.yolo_mode', data: { enabled } } });
    // Called synchronously, outside act and with no clock step: the frame's own paint (a timer) has not come yet.
    frame(false);
    expect(seen).toHaveBeenCalled();
    expect(t.eng.getSnapshot().auto.on).toBe(false);
    expect(factsOf(t.eng.getSnapshot()).auto).toBe(false);
    seen.mockClear();
    frame(true);
    expect(seen).toHaveBeenCalled();
    expect(factsOf(t.eng.getSnapshot()).auto).toBe(true);
    off();
  });
});
