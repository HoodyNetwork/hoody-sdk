// The engine reads the approval resource through core's one parser (agent.approvalOf).
// Only an answer the parser accepts tells the mode and the switch; an answer it refuses is unknown: the chat counts Strict,
// the card says the mode could not be read (with Check again), and the switch is never shown On (nor a stale Off). A failed
// read learns nothing: the last answer stands.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState, useSyncExternalStore } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Composer } from './Composer';
import { AskEngine, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock, scripts } from './fake';
import type { AskStore } from './logic';
import strings from './strings.en.json';

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas', server: 'srv' };

function memStore(): StoreIO {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); } };
}
type Answer = { body: unknown } | { fail: unknown };

async function setup(script = scripts.dashboard, off = false) {
  const clock = manualClock();
  const agent = new FakeAgent({ account: ACCOUNT, pace: 10, realms: [REALM], script: [script, scripts.dashboard] }, clock);
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
  if (off) eng.setAuto(false);   // a gate parks only while Approve automatically is Off
  eng.send('Hello');
  await flush(3000);
  const sid = eng.record!.s!;
  expect(sid).toBeTruthy();
  // From here the agent's approval read answers what the test says (a body as sent, or a failure).
  const fa = agent as unknown as { approval(sid: string): Promise<unknown> };
  const reads: string[] = [];
  const answerAs = (a: Answer) => {
    fa.approval = (s: string) => { reads.push(s); return 'fail' in a ? Promise.reject(a.fail) : Promise.resolve(a.body); };
  };
  /** One read (Check again), answered. */
  const read = async (a: Answer) => { answerAs(a); eng.checkMode(); await flush(50); };
  return { agent, eng, flush, sid, reads, answerAs, read };
}
const auto = (eng: AskEngine) => eng.getSnapshot().auto;
const lost = (eng: AskEngine) => (eng as unknown as { modeLost: boolean }).modeLost;
const ok = (b: Record<string, unknown>) => ({ body: { locked: false, revision: 1, ...b } });

describe('an answer the parser accepts', () => {
  it('default with yolo: relaxed, read, the switch shows the answer', async () => {
    const t = await setup();
    await t.read(ok({ mode: 'default', yolo: false }));
    expect(t.eng.activation().strict).toBe(false);
    expect(lost(t.eng)).toBe(false);
    expect(auto(t.eng)).toMatchObject({ on: false, err: '' });
  });
  it('a locked default is relaxed: Strict is the mode (always), not the lock', async () => {
    const t = await setup();
    await t.read({ body: { mode: 'default', locked: true, revision: 1, yolo: false } });
    expect(t.eng.activation().strict).toBe(false);
    await t.read({ body: { mode: 'always', locked: true, revision: 2, yolo: false } });
    expect(t.eng.activation().strict).toBe(true);
    expect(lost(t.eng)).toBe(false);
  });
  it('always without yolo: Strict and read; a switch shown On is not kept On (null, unknown), one shown Off stays Off', async () => {
    const t = await setup();
    expect(auto(t.eng).on).toBe(true);
    await t.read(ok({ mode: 'always' }));
    expect(t.eng.activation().strict).toBe(true);
    expect(lost(t.eng)).toBe(false);
    expect(auto(t.eng)).toMatchObject({ on: null, err: 'ask.autoUnknown' });
    await t.read(ok({ mode: 'default', yolo: false }));
    await t.read(ok({ mode: 'always' }));
    expect(auto(t.eng)).toMatchObject({ on: false, err: '' });
  });
  it('a reopen\'s read opens the handle only for an accepted answer', async () => {
    const t = await setup();
    const spy = vi.spyOn(t.eng as unknown as { leaseHandle(r: string): unknown }, 'leaseHandle');
    t.answerAs(ok({ mode: 'weird', yolo: false }));
    (t.eng as unknown as { readAuto(d?: unknown, o?: boolean): void }).readAuto(undefined, true);
    await t.flush(50);
    expect(spy).not.toHaveBeenCalled();
    t.answerAs(ok({ mode: 'default', yolo: false }));
    (t.eng as unknown as { readAuto(d?: unknown, o?: boolean): void }).readAuto(undefined, true);
    await t.flush(50);
    expect(spy).toHaveBeenCalled();
  });
});

describe('an answer the parser refuses is unknown: Strict, not read, never Auto', () => {
  const cases: Array<[string, unknown]> = [
    ['R3 another mode string', { mode: 'weird', locked: false, yolo: true }],
    ['R3b no mode', { yolo: true }],
    ['R4 YOLO armed under Strict', { mode: 'always', locked: false, yolo: true }],
    ['R5 locked not a boolean', { mode: 'default', yolo: true }],
    ['R7 a body that is not an object', 'default'],
  ];
  for (const [name, body] of cases) {
    it(`${name}: after a relaxed answer, the chat goes back to Strict, the mode reads as not read, and the switch is unknown`, async () => {
      const t = await setup();
      await t.read(ok({ mode: 'default', yolo: true }));
      expect(t.eng.activation().strict).toBe(false);
      await t.read({ body });
      expect(t.eng.activation().strict).toBe(true);
      expect(lost(t.eng)).toBe(true);
      expect(auto(t.eng)).toMatchObject({ on: null, err: 'ask.autoUnknown' });
    });
  }
  it('a switch shown Off is not kept Off either (the answer may be On)', async () => {
    const t = await setup();
    await t.read(ok({ mode: 'default', yolo: false }));
    await t.read({ body: { mode: 'weird', locked: false, yolo: false } });
    expect(auto(t.eng)).toMatchObject({ on: null, err: 'ask.autoUnknown' });
  });
  it('a read that says unknown tells its caller "not known": a message then puts Off, and goes only once Off is confirmed', async () => {
    const t = await setup();
    await t.read(ok({ mode: 'default', yolo: false }));
    let known: boolean | null = null;
    t.answerAs({ body: { mode: 'always', locked: false, yolo: true } });
    (t.eng as unknown as { readAuto(d?: (k: boolean) => void, o?: boolean): void }).readAuto((k) => { known = k; }, false);
    await t.flush(50);
    expect(known).toBe(false);
    const fa = t.agent as unknown as { yolo(sid: string, on: boolean): Promise<unknown> };
    const real = fa.yolo.bind(t.agent);
    const writes: boolean[] = [];
    let release = (): void => {};
    fa.yolo = (sid: string, on: boolean) => { writes.push(on); return new Promise((res, rej) => { release = () => { real(sid, on).then(res, rej); }; }); };
    const turns = () => t.agent.log.filter(([m]) => m === 'turn').length;
    const before = turns();
    t.eng.send('Next');
    await t.flush(200);
    expect(writes, 'Off was not put before the message').toEqual([false]);
    expect(turns(), 'the message went before Off was confirmed').toBe(before);
    release();
    await t.flush(500);
    expect(turns(), 'the message did not go once Off was confirmed').toBe(before + 1);
  });
});

describe('reads that overlap: the newest answer wins', () => {
  /** The agent's approval reads wait; each is answered by the test, in any order. */
  function holdAll(t: Awaited<ReturnType<typeof setup>>) {
    const fa = t.agent as unknown as { approval(sid: string): Promise<unknown> };
    const out: Array<(a: Answer) => void> = [];
    fa.approval = () => new Promise((res, rej) => out.push((a) => ('fail' in a ? rej(a.fail) : res(a.body))));
    return { count: () => out.length, answer: async (i: number, a: Answer) => { out[i]!(a); await t.flush(50); } };
  }
  const older: Array<[string, unknown, boolean]> = [
    ['R10 a newer unknown answer', { mode: 'weird', locked: false, yolo: true }, true],
    ['R10b a newer accepted always without yolo', { mode: 'always', locked: false, revision: 2 }, false],
  ];
  for (const [name, body, unknown] of older) {
    it(`${name} is not undone by an older read answering after it`, async () => {
      const t = await setup();
      const h = holdAll(t);
      t.eng.checkMode(); t.eng.checkMode();
      await t.flush(10);
      expect(h.count()).toBe(2);
      await h.answer(1, { body });
      await h.answer(0, ok({ mode: 'default', yolo: true }));
      expect(t.eng.activation().strict, 'the older answer relaxed the chat').toBe(true);
      expect(auto(t.eng).on, 'the older answer showed the switch On').toBeNull();
      expect(lost(t.eng)).toBe(unknown);
    });
  }
  it('the last read out discarded (after an Off/On frame) while a newer answer left the mode unknown: the card says it was not read', async () => {
    const t = await setup();
    await t.read(ok({ mode: 'default', yolo: true }));
    const h = holdAll(t);
    t.eng.checkMode();
    await t.flush(10);
    (t.eng as unknown as { autoFrame(d: unknown): void }).autoFrame({ event: { data: { enabled: true } } });
    await t.flush(10);
    expect(h.count(), 'the frame did not ask again').toBe(2);
    await h.answer(1, { body: { mode: 'weird', locked: false, yolo: true } });
    expect(t.eng.activation().strict).toBe(true);
    await h.answer(0, ok({ mode: 'default', yolo: true }));
    expect(t.eng.activation().strict).toBe(true);
    expect(lost(t.eng), 'no read is left, and the unknown mode is not said').toBe(true);
  });
  it('a read nobody answers, with the switch not known yet: after the budget the switch says unknown, with Check again', async () => {
    const t = await setup();
    const a = (t.eng as unknown as { auto: { on: boolean | null; err: string } }).auto;
    a.on = null; a.err = '';
    holdAll(t);
    t.eng.checkMode();
    await t.flush(20_100);
    expect(auto(t.eng)).toMatchObject({ on: null, err: 'ask.autoUnknown' });
  });
});

describe('a failed read learns nothing', () => {
  it('after a relaxed answer: still relaxed, still read, the switch keeps its answer', async () => {
    const t = await setup();
    await t.read(ok({ mode: 'default', yolo: true }));
    await t.read({ fail: { status: 503, code: 'unavailable' } });
    expect(t.eng.activation().strict).toBe(false);
    expect(lost(t.eng)).toBe(false);
    expect(auto(t.eng)).toMatchObject({ on: true, err: '' });
  });
  it('after a refusal (4xx): the same', async () => {
    const t = await setup();
    await t.read(ok({ mode: 'default', yolo: true }));
    await t.read({ fail: { status: 403, code: 'forbidden' } });
    expect(t.eng.activation().strict).toBe(false);
    expect(auto(t.eng)).toMatchObject({ on: true, err: '' });
  });
});

describe('what the person sees', () => {
  it('a parked gate whose mode answer is unknown: the card says it was not read, and an accepted answer clears it', async () => {
    const t = await setup(scripts.approval, true);
    await vi.waitFor(async () => { await t.flush(100); expect(t.eng.getSnapshot().gates.length).toBeGreaterThan(0); }, { timeout: 8000 });
    await t.read(ok({ mode: 'default', yolo: false }));
    expect(t.eng.getSnapshot().modeUnread).toBeUndefined();
    await t.read({ body: { mode: 'weird', locked: false, yolo: false } });
    expect(t.eng.getSnapshot().modeUnread).toBe(true);
    await t.read(ok({ mode: 'default', yolo: false }));
    expect(t.eng.getSnapshot().modeUnread).toBeUndefined();
  });
  it('the switch\'s unknown note offers Check again (gate or not): it reads once and the switch shows the answer', async () => {
    const t = await setup();
    function Dock() {
      const snap = useSyncExternalStore(t.eng.subscribe, t.eng.getSnapshot);
      const [draft, setDraft] = useState('');
      return <Composer eng={t.eng} snap={snap} computer="atlas" draft={draft} setDraft={setDraft} note={null} onDismissNote={() => {}} flash={false} inputRef={{ current: null }} onTyping={() => {}} />;
    }
    render(<Dock />);
    await t.read({ body: { mode: 'always', locked: false, yolo: true } });
    const note = screen.getByText(strings['ask.autoUnknown']).closest('p') as HTMLElement;
    t.answerAs(ok({ mode: 'default', yolo: false }));
    const before = t.reads.length;
    fireEvent.click(within(note).getByRole('button', { name: strings['ask.checkAgain'] }));
    await t.flush(50);
    expect(t.reads.length).toBe(before + 1);
    expect(auto(t.eng)).toMatchObject({ on: false, err: '' });
    expect(screen.queryByText(strings['ask.autoUnknown'])).toBeNull();
  });
});
