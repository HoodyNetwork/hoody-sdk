// Vitest: an untouched prefill whose owed new conversation was replayed onto a replacement
// engine (a realm switch and back with the dock open) is taken out on close: the replacement no longer owes it, and
// the conversation it picks up when loading ends stays the one that was open.
import { afterEach, describe, expect, it } from 'vitest';
import { AskEngine, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock, scripts, type FakeOptions } from './fake';
import type { AskStore } from './logic';
import { draftFresh, draftGet, draftSet, dropUntouchedPrefills, markDraftFresh, notePrefill, oweFreshForDraft, purgeDrafts } from './drafts';
import { slotKey } from './registry';

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas' };

function memStore(): StoreIO {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); } };
}
async function setup(o: Partial<FakeOptions> = {}, opts: { store?: StoreIO; agent?: FakeAgent; hold?: (agent: FakeAgent) => void; reload?: boolean } = {}) {
  const clock = manualClock();
  if (opts.reload) for (let i = 0; i < 10_000; i++) clock.random(1);
  const store = opts.store ?? memStore();
  const agent = opts.agent ?? new FakeAgent({ account: ACCOUNT, pace: 10, realms: [REALM], ...o }, clock);
  opts.hold?.(agent);
  const eng = new AskEngine(slot, agent, store, clock);
  const flush = async (ms = 0) => {
    const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); } };
    await drain();
    for (let left = ms; left > 0; left -= 10) { clock.run(Math.min(10, left)); await drain(); }
  };
  eng.open();
  await flush();
  return { agent, eng, store, flush };
}
/** Holds one agent method's answers until released. */
function holdMethod(agent: FakeAgent, m: 'probe'): { release: () => void } {
  const host = agent as unknown as Record<string, (...a: unknown[]) => unknown>;
  const real = host[m]!.bind(agent);
  const waiting: Array<() => void> = [];
  let open = false;
  host[m] = (...a: unknown[]) => (open ? real(...a) : new Promise((res) => waiting.push(() => res(real(...a)))));
  return { release: () => { open = true; for (const w of waiting.splice(0)) w(); } };
}

afterEach(() => { purgeDrafts(null); });

describe('an untouched prefill replayed onto a replacement engine', () => {
  it('close takes it out, the replacement owes nothing, and the open conversation stays after loading', async () => {
    const t = await setup({ script: [scripts.dashboard, [{ k: 'text', text: 'ok' }]] });
    t.eng.send('original');
    await t.flush(2000);
    const oldSid = t.eng.record!.s!;
    const k = slotKey(slot);
    oweFreshForDraft(k, t.eng);
    draftSet(k, 'typed before prefill');
    // Schedules' prefill, as the panel applies it.
    const owedBefore = draftFresh(k), engOwed = t.eng.owesFresh();
    t.eng.wantFresh();
    const cur = draftGet(k)!, next = cur + '\nSchedule ';
    draftSet(k, next);
    markDraftFresh(k, true);
    notePrefill(k, cur, next, owedBefore, engOwed ? null : () => t.eng.releaseFresh());
    t.eng.end();   // realm B, then back to A with the dock open: a new engine, its loading held
    let held: { release: () => void } = { release: () => {} };
    const t2 = await setup({}, { store: t.store, agent: t.agent, reload: true, hold: (a) => { held = holdMethod(a, 'probe'); } });
    oweFreshForDraft(k, t2.eng);
    expect(t2.eng.owesFresh()).toBe(true);
    dropUntouchedPrefills();   // the panel closed
    expect(draftGet(k)).toBe('typed before prefill');
    expect(draftFresh(k)).toBe(false);
    expect(t2.eng.owesFresh()).toBe(false);
    held.release();
    await t2.flush(3000);
    expect(t2.eng.record?.s).toBe(oldSid);
  });
});
