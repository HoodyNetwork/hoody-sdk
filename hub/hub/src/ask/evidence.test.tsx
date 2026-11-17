// A reopened conversation whose record says its last turn failed
// shows "failed" only when the agent's turn list, read before AND after the transcript, names that same turn as the
// newest and failed both times. Any disagreement or unreadable read shows "Couldn't tell" with Check again, never
// failed and never done (C9), in the conversation and in Recent.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { act, render, screen } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { describe, expect, it } from 'vitest';
import { Column } from './Column';
import * as C from './conv';
import { AskEngine, tailVerdict, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock } from './fake';
import { validRec, type AskStore } from './logic';
import strings from './strings.en.json';

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas' };
const SENDS = ['create', 'turn', 'command', 'cancel', 'decide', 'answer'];

/** A browser store; `refuse` makes it keep nothing (blocked or full storage: the write reports false), `blind`
 *  makes reads come back empty (unreadable storage). */
function memStore(): StoreIO & { refuse: boolean; blind: boolean; writes: number; edit: (fn: (st: AskStore) => void) => void } {
  let st: AskStore = { v: 1, a: {} };
  const io = {
    refuse: false,
    blind: false,
    writes: 0,
    read: () => (io.blind ? { v: 1, a: {} } : JSON.parse(JSON.stringify(st))),
    write: (_a: string, s: AskStore | null) => { io.writes++; if (io.refuse) return false; if (s) st = JSON.parse(JSON.stringify(s)); return true; },
    edit: (fn: (x: AskStore) => void) => { fn(st); },
  };
  return io;
}
type ListAnswer = 'real' | 'fail' | { id: string; state?: unknown; code?: unknown }[];
type TranscriptAnswer = 'marker' | 'plain' | 'empty' | 'fail';
interface Held { name: 'turns' | 'transcript'; go: () => void }

/** A failed turn on the fake agent; then each panel opened by `open()` reads its turn list from `lists` and its
 *  transcript from `transcripts`, in order ('marker': the real transcript ending with the daemon's close marker,
 *  so a confirmed failure is visible; 'plain': the real transcript as it is, with no marker). With `hold`, each read waits until the test lets it go. */
async function failedConversation(o: { lists?: ListAnswer[]; transcripts?: TranscriptAnswer[]; hold?: boolean } = {}) {
  const clock = manualClock();
  const agent = new FakeAgent({ account: ACCOUNT, pace: 10, realms: [REALM], script: [[{ k: 'fail', code: 'provider_error' }]] }, clock);
  const store = memStore();
  const flush = async (ms = 0) => {
    const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); } };
    await act(async () => {
      await drain();
      for (let left = ms; left > 0; left -= 10) { clock.run(Math.min(10, left)); await drain(); }
    });
  };
  const first = new AskEngine(slot, agent, store, clock);
  first.revokeUrl = () => {};
  first.open();
  await flush();
  first.send('Unzip the site');
  await flush(2000);
  first.end();
  const host = agent as any;
  const realTurns = host.turns.bind(agent);
  const realTranscript = host.transcript.bind(agent);
  const order: string[] = [];
  const lists = [...(o.lists ?? [])];
  const transcripts = [...(o.transcripts ?? [])];
  const held: Held[] = [];
  let hold = !!o.hold;
  const later = <T,>(name: Held['name'], p: () => Promise<T>): Promise<T> => {
    if (!hold) return p();
    return new Promise<T>((res, rej) => { held.push({ name, go: () => { p().then(res, rej); } }); });
  };
  host.turns = (sid: string) => {
    order.push('turns');
    const a = lists.shift() ?? 'real';
    return later('turns', () => {
      if (a === 'real') return realTurns(sid);
      if (a === 'fail') return Promise.reject({ status: 503 });
      return Promise.resolve({ session_id: sid, turns: a.map((t) => ({ turn_id: t.id, ...(t.state === undefined ? {} : { state: t.state }), ...(t.code === undefined ? {} : { error_code: t.code }) })) });
    });
  };
  host.transcript = (sid: string) => {
    order.push('transcript');
    const a = transcripts.shift() ?? 'marker';
    return later('transcript', () => {
      if (a === 'fail') return Promise.reject({ status: 503 });
      if (a === 'empty') return Promise.resolve({ session_id: sid, live: false, turn_boundaries: [], messages: [] });
      // 'plain': the transcript with no close marker (the fake agent writes one on a failed turn, as the agent does).
      if (a === 'plain') return realTranscript(sid).then((b: any) => {
        const ms = b.messages as any[];
        const last = ms[ms.length - 1];
        if (last && last.role === 'assistant') {
          last.blocks = last.blocks.map((x: any) => (x.kind === 'text' ? { ...x, text: String(x.text).replace(/(?:^|\n\n)\[response failed: [a-z0-9_.-]+\]\s*$/, '') } : x)).filter((x: any) => x.kind !== 'text' || x.text);
          if (!last.blocks.length) ms.pop();
        }
        return b;
      });
      return realTranscript(sid).then((b: any) => {
        const ms = b.messages as any[];
        const last = ms[ms.length - 1];
        if (last && last.role === 'assistant') last.blocks = [...last.blocks, { kind: 'text', text: '\n\n[response failed: provider_error]' }];
        else ms.push({ role: 'assistant', blocks: [{ kind: 'text', text: '[response failed: provider_error]' }] });
        return b;
      });
    });
  };
  const sends = () => agent.log.filter((x) => SENDS.includes(x[0] as string)).length;
  const open = async () => {
    const eng = new AskEngine(slot, agent, store, clock);
    eng.revokeUrl = () => {};
    order.length = 0;
    eng.open();
    await flush(2000);
    return eng;
  };
  const stored = () => C.convsFor(store.read(ACCOUNT), ACCOUNT, { p: slot.project, c: slot.computer, r: REALM })[0] as AskStore['a'][string][number];
  /** Another tab stores this conversation on another turn (its record only: this page's copy is not told). */
  const otherTabTurn = (t: string, ph: string, unsure = false) => store.edit((st) => { const r = (st.a[ACCOUNT] as any[]).find((x) => x.k1 === stored().k1); r.t = t; r.ph = ph; if (unsure) r.u = t; else delete r.u; });
  return { agent, flush, order, lists, transcripts, held, sends, open, stored, store, otherTabTurn, setHold: (v: boolean) => { hold = v; } };
}
const blocks = (eng: AskEngine) => C.blocks(eng.getSnapshot().conv, 0);
const failedShown = (eng: AskEngine) => blocks(eng).some((b) => b.k === 'outcome' && b.state === 'failed');
const unsureShown = (eng: AskEngine) => blocks(eng).some((b) => b.k === 'unsure');
const recent = (eng: AskEngine) => C.recentPhase((eng as any).rec);
function Live({ eng }: { eng: AskEngine }) {
  const snap = useSyncExternalStore(eng.subscribe, () => eng.getSnapshot());
  return <Column eng={eng} snap={snap} agentUrl="" typing empty={null} onEdit={() => {}} />;
}

describe('the failed outcome needs both turn-list reads to agree', () => {
  it('both reads name the failed turn as the newest: failed is shown, and Recent says Failed', async () => {
    const f = await failedConversation({ lists: ['real', 'real'] });
    const eng = await f.open();
    expect(f.order.slice(0, 3)).toEqual(['turns', 'transcript', 'turns']);
    expect(failedShown(eng)).toBe(true);
    expect(unsureShown(eng)).toBe(false);
    expect(recent(eng)).toBe('failed');
  });

  it('each read starts only after the one before it settled: list, then transcript, then list', async () => {
    const f = await failedConversation({ lists: ['real', 'real'], hold: true });
    const eng = await f.open();
    expect(f.order).toEqual(['turns']);
    f.held.shift()!.go();
    await f.flush(50);
    expect(f.order).toEqual(['turns', 'transcript']);
    f.held.shift()!.go();
    await f.flush(50);
    expect(f.order).toEqual(['turns', 'transcript', 'turns']);
    expect(failedShown(eng)).toBe(false);   // nothing decided before the second list read settles
    f.held.shift()!.go();
    await f.flush(2000);
    for (const h of f.held.splice(0)) h.go();
    await f.flush(2000);
    expect(failedShown(eng)).toBe(true);
  });

  it('the reads disagree: "Couldn\'t tell" with Check again (in Recent too), nothing sent; Check again settles it', async () => {
    const f = await failedConversation({ lists: ['real', [{ id: 'T-newer', state: 'dispatched' }, { id: 'T-old', state: 'failed' }]] });
    const eng = await f.open();
    const sent = f.sends();
    expect(failedShown(eng)).toBe(false);
    expect(unsureShown(eng)).toBe(true);
    expect(recent(eng)).toBe('unknown');
    expect((eng as any).rec.ph).toBe('failed');   // kept for the next check, never saved as done
    render(<Live eng={eng} />);
    expect(screen.getByText(strings['ask.o.unsure'])).toBeTruthy();
    expect(screen.queryByText(strings['ask.o.failed'])).toBeNull();
    f.lists.push('real', 'real');
    act(() => { screen.getByRole('button', { name: strings['ask.checkAgain'] }).click(); });
    await f.flush(2000);
    expect(f.sends()).toBe(sent);
    expect(unsureShown(eng)).toBe(false);
    expect(failedShown(eng)).toBe(true);
    expect(recent(eng)).toBe('failed');
  });

  it('reopened again after "Couldn\'t tell": the next panel reads both lists again and still cannot tell', async () => {
    const disagree: ListAnswer = [{ id: 'T-newer', state: 'accepted' }];
    const f = await failedConversation({ lists: ['real', disagree] });
    const one = await f.open();
    expect(unsureShown(one)).toBe(true);
    one.end();
    f.lists.push('real', disagree);
    const two = await f.open();
    expect(f.order.slice(0, 3)).toEqual(['turns', 'transcript', 'turns']);
    expect(unsureShown(two)).toBe(true);
    expect(failedShown(two)).toBe(false);
    expect(recent(two)).toBe('unknown');
  });

  it('the first read fails: "Couldn\'t tell", not done', async () => {
    const eng = await (await failedConversation({ lists: ['fail', 'real'] })).open();
    expect(failedShown(eng)).toBe(false);
    expect(unsureShown(eng)).toBe(true);
  });

  it('the second read fails: "Couldn\'t tell", not failed', async () => {
    const eng = await (await failedConversation({ lists: ['real', 'fail'] })).open();
    expect(failedShown(eng)).toBe(false);
    expect(unsureShown(eng)).toBe(true);
  });

  it('both reads carry the same malformed state, or none: unreadable, so "Couldn\'t tell", never done', async () => {
    for (const state of ['weird', undefined, 7]) {
      const bad: ListAnswer = [{ id: 'T-x', state }];
      const eng = await (await failedConversation({ lists: [bad, bad] })).open();
      expect(unsureShown(eng)).toBe(true);
      expect(recent(eng)).toBe('unknown');
      expect((eng as any).rec.ph).toBe('failed');
    }
  });

  it('an empty transcript and unreadable reads: the note shows on its own, with Check again', async () => {
    const f = await failedConversation({ lists: ['fail', 'fail'], transcripts: ['empty'] });
    const eng = await f.open();
    expect(eng.getSnapshot().conv.turns).toHaveLength(0);
    render(<Live eng={eng} />);
    expect(screen.getByText(strings['ask.o.unsure'])).toBeTruthy();
    expect(screen.getByRole('button', { name: strings['ask.checkAgain'] })).toBeTruthy();
  });

  it('Check again whose transcript read fails keeps the note (nothing becomes failed or done)', async () => {
    const f = await failedConversation({ lists: ['real', 'fail'] });
    const eng = await f.open();
    expect(unsureShown(eng)).toBe(true);
    f.lists.push('real', 'real');
    f.transcripts.push('fail');
    eng.checkOutcome();
    await f.flush(2000);
    expect(unsureShown(eng)).toBe(true);
    expect(failedShown(eng)).toBe(false);
    expect(recent(eng)).toBe('unknown');
  });

  it('two tabs: a stale save from the other tab neither drops the unsure mark nor brings back a cleared one', async () => {
    const f = await failedConversation({ lists: ['real', 'real'] });
    const b = await f.open();                       // tab B: confirmed failed, no mark in its copy
    f.lists.push('real', 'fail');
    const a = await f.open();                       // tab A: cannot tell, marks the turn
    expect(C.recentPhase(f.stored())).toBe('unknown');
    (b as any).save();                              // B's incidental save from its older copy
    expect(C.recentPhase(f.stored())).toBe('unknown');
    f.lists.push('real', 'real');
    a.checkOutcome();                               // A confirms: the mark is cleared
    await f.flush(2000);
    expect(C.recentPhase(f.stored())).toBe('failed');
    (b as any).rec.u = (b as any).rec.t;            // B's copy still holding a mark (as if it had read one)
    (b as any).save();
    expect(C.recentPhase(f.stored())).toBe('failed');
  });

  it('a slow Check again that comes back after the conversation moved to a newer turn changes nothing', async () => {
    const f = await failedConversation({ lists: ['real', 'fail'] });
    const eng = await f.open();
    expect(unsureShown(eng)).toBe(true);
    const old = (eng as any).rec.t;
    f.setHold(true);
    f.lists.push('real', [{ id: 'T-elsewhere', state: 'dispatched' }]);
    eng.checkOutcome();
    await f.flush(50);
    expect(f.held.map((h) => h.name)).toEqual(['turns']);
    // Meanwhile a newer turn starts and finishes here.
    f.setHold(false);
    expect(eng.send('next one')).toBe(true);
    await f.flush(3000);
    const now = (eng as any).rec.t;
    expect(now).not.toBe(old);
    const shown = JSON.stringify(eng.getSnapshot().conv);
    // The slow check's reads come back now, and disagree.
    for (let i = 0; i < 6 && f.held.length; i++) { f.held.shift()!.go(); await f.flush(100); }
    await f.flush(2000);
    expect((eng as any).rec.t).toBe(now);
    expect((eng as any).rec.u).toBeUndefined();
    expect(C.recentPhase(f.stored())).not.toBe('unknown');
    expect(JSON.stringify(eng.getSnapshot().conv)).toBe(shown);
  });

  it('a verdict the browser did not keep stays for the next save: an unsure mark is not lost', async () => {
    const f = await failedConversation({ lists: ['real', 'fail'] });
    f.store.refuse = true;
    const eng = await f.open();
    expect(unsureShown(eng)).toBe(true);
    expect(C.recentPhase(f.stored())).toBe('failed');   // not kept yet
    f.store.refuse = false;
    (eng as any).save();                                 // an incidental save later
    expect(C.recentPhase(f.stored())).toBe('unknown');
  });

  it('a cleared mark the browser did not keep stays for the next save: an unsure mark does not come back', async () => {
    const f = await failedConversation({ lists: ['real', 'fail'] });
    const eng = await f.open();
    expect(C.recentPhase(f.stored())).toBe('unknown');
    f.store.refuse = true;
    f.lists.push('real', 'real');
    eng.checkOutcome();
    await f.flush(2000);
    expect(failedShown(eng)).toBe(true);
    expect(C.recentPhase(f.stored())).toBe('unknown');  // not kept yet
    f.store.refuse = false;
    (eng as any).save();
    expect(C.recentPhase(f.stored())).toBe('failed');
  });

  it('a verdict not kept goes once another tab moved the conversation on: it never touches the newer turn\'s mark', async () => {
    const f = await failedConversation({ lists: ['real', 'fail'] });
    const eng = await f.open();
    f.store.refuse = true;
    f.lists.push('real', 'real');
    eng.checkOutcome();                                 // clears the old turn's mark: not kept
    await f.flush(2000);
    f.store.refuse = false;
    f.otherTabTurn('T-other', 'failed', true);          // another tab: a newer turn, itself unsure
    (eng as any).save();                                // this page takes the newer turn (save's own merge)
    expect((eng as any).rec.t).toBe('T-other');
    expect(f.stored().u).toBe('T-other');
    expect(C.recentPhase(f.stored())).toBe('unknown');
  });

  it('unreadable storage: the same unsure verdict again does not drop the one not kept yet', async () => {
    const f = await failedConversation({ lists: ['real', 'fail'] });
    f.store.refuse = true;
    const eng = await f.open();
    f.store.blind = true;
    f.lists.push('real', 'fail');
    eng.checkOutcome();
    await f.flush(2000);
    f.store.blind = false;
    f.store.refuse = false;
    expect(C.recentPhase(f.stored())).toBe('failed');   // still not kept
    (eng as any).save();
    expect(C.recentPhase(f.stored())).toBe('unknown');
  });

  it('unreadable storage: the same confirmed verdict again does not drop the clear not kept yet', async () => {
    const f = await failedConversation({ lists: ['real', 'fail'] });
    const eng = await f.open();
    expect(C.recentPhase(f.stored())).toBe('unknown');
    f.store.refuse = true;
    f.lists.push('real', 'real');
    eng.checkOutcome();
    await f.flush(2000);
    f.store.blind = true;
    f.lists.push('real', 'real');
    eng.checkOutcome();
    await f.flush(2000);
    f.store.blind = false;
    f.store.refuse = false;
    expect(C.recentPhase(f.stored())).toBe('unknown');  // still not kept
    (eng as any).save();
    expect(C.recentPhase(f.stored())).toBe('failed');
  });

  it('Check again takes another tab\'s newer turn whose history is empty: the older turn and its note go', async () => {
    const f = await failedConversation({ lists: ['real', 'fail'] });
    const eng = await f.open();
    expect(unsureShown(eng)).toBe(true);
    expect(eng.getSnapshot().conv.turns.length).toBeGreaterThan(0);
    f.otherTabTurn('T-other', 'completed');
    f.lists.push('real', 'fail');
    f.transcripts.push('marker', 'empty');
    eng.checkOutcome();
    await f.flush(2000);
    expect((eng as any).rec.t).toBe('T-other');
    expect(eng.getSnapshot().conv.turns.length).toBe(0);
    expect(unsureShown(eng)).toBe(false);
    expect(failedShown(eng)).toBe(false);
    f.transcripts.push('empty');
    eng.checkOutcome();
    await f.flush(2000);
    expect(eng.getSnapshot().conv.turns.length).toBe(0);
    expect(unsureShown(eng)).toBe(false);
  });

  it('the store already holds the verdict: this page writes nothing for it (no time moved in Recent)', async () => {
    const f = await failedConversation({ lists: ['real', 'fail'] });
    const a = await f.open();
    expect(C.recentPhase(f.stored())).toBe('unknown');
    const at = f.stored().at;
    (a as any).rec.u = undefined;                      // this copy lost its mark; the store has it
    const w = f.store.writes;
    f.lists.push('real', 'fail');
    a.checkOutcome();
    await f.flush(2000);
    expect(f.store.writes).toBe(w);
    expect(f.stored().at).toBe(at);
    expect((a as any).rec.u).toBe((a as any).rec.t);   // the copy follows the store
  });

  it('opening: another tab stores a newer turn while the reads run, so the older verdict never lands on it', async () => {
    const f = await failedConversation({ lists: ['real', [{ id: 'T-newer', state: 'dispatched' }]], hold: true });
    const eng = await f.open();
    expect(f.held.map((h) => h.name)).toEqual(['turns']);
    f.otherTabTurn('T-other', 'completed');
    f.setHold(false);
    for (let i = 0; i < 6 && f.held.length; i++) { f.held.shift()!.go(); await f.flush(100); }
    await f.flush(2000);
    expect((eng as any).rec.t).toBe('T-other');
    expect((eng as any).rec.u).toBeUndefined();
    expect(f.stored().u).toBeUndefined();
    expect(unsureShown(eng)).toBe(false);
    expect(C.recentPhase(f.stored())).toBe('completed');
  });

  it('Check again: another tab stores a newer turn while the reads run, so the older verdict never lands on it', async () => {
    const f = await failedConversation({ lists: ['real', 'real'] });
    const eng = await f.open();
    expect(failedShown(eng)).toBe(true);
    f.setHold(true);
    f.lists.push('real', [{ id: 'T-newer', state: 'dispatched' }]);
    eng.checkOutcome();
    await f.flush(50);
    expect(f.held.map((h) => h.name)).toEqual(['turns']);
    f.otherTabTurn('T-other', 'completed');
    f.setHold(false);
    for (let i = 0; i < 6 && f.held.length; i++) { f.held.shift()!.go(); await f.flush(100); }
    await f.flush(2000);
    expect((eng as any).rec.t).toBe('T-other');
    expect((eng as any).rec.u).toBeUndefined();
    expect(f.stored().u).toBeUndefined();
    expect(unsureShown(eng)).toBe(false);
    expect(failedShown(eng)).toBe(false);              // the older turn's failure is not shown on the newer one
  });

  it('an empty history: Check again that settles it takes the note away (and Recent says Failed)', async () => {
    const f = await failedConversation({ lists: ['fail', 'fail'], transcripts: ['empty'] });
    const eng = await f.open();
    expect(unsureShown(eng)).toBe(true);
    f.lists.push('real', 'real');
    f.transcripts.push('empty');
    eng.checkOutcome();
    await f.flush(2000);
    expect(unsureShown(eng)).toBe(false);
    expect(recent(eng)).toBe('failed');
    f.lists.push('fail', 'real');
    f.transcripts.push('empty');
    eng.checkOutcome();
    await f.flush(2000);
    expect(unsureShown(eng)).toBe(true);
  });

  it('both reads agree on another newest turn that finished: no failed line and no "Couldn\'t tell" (the record is stale)', async () => {
    const other = [{ id: 'T-other', state: 'completed' }];
    const eng = await (await failedConversation({ lists: [other, other] })).open();
    expect(failedShown(eng)).toBe(false);
    expect(unsureShown(eng)).toBe(false);
  });

  it('tailVerdict: agree, disagree, empty and unreadable reads', () => {
    const f = { id: 'T1', state: 'failed' };
    expect(tailVerdict('T1', f, f)).toBe(true);
    expect(tailVerdict('T1', f, { id: 'T1', state: 'completed' })).toBe('unsure');
    expect(tailVerdict('T1', f, { id: 'T2', state: 'dispatched' })).toBe('unsure');
    expect(tailVerdict('T1', { id: 'T2', state: 'dispatched' }, f)).toBe('unsure');
    expect(tailVerdict('T1', null, f)).toBe('unsure');
    expect(tailVerdict('T1', f, null)).toBe('unsure');
    expect(tailVerdict('T1', null, null)).toBe(false);
    expect(tailVerdict('T1', 'bad', f)).toBe('unsure');
    expect(tailVerdict('T1', f, 'bad')).toBe('unsure');
    expect(tailVerdict('T1', { id: 'T2', state: 'completed' }, { id: 'T2', state: 'completed' })).toBe(false);
    expect(tailVerdict('T1', { id: 'T1', state: 'completed' }, { id: 'T1', state: 'completed' })).toBe(false);
  });

  it('the stored record keeps the unsure mark when it is read back, and drops a malformed one', async () => {
    const f = await failedConversation({ lists: ['real', 'fail'] });
    const eng = await f.open();
    const rec = (eng as any).rec;
    expect(rec.u).toBe(rec.t);
    expect(validRec(JSON.parse(JSON.stringify(rec)))?.u).toBe(rec.t);
    expect(validRec({ ...JSON.parse(JSON.stringify(rec)), u: 7 })?.u).toBeUndefined();
  });

  it('Recent: an unsure mark reads unknown only while it names the record\'s own turn', () => {
    expect(C.recentPhase({ ph: 'failed', t: 'T1', u: 'T1' })).toBe('unknown');
    expect(C.recentPhase({ ph: 'failed', t: 'T2', u: 'T1' })).toBe('failed');
    expect(C.recentPhase({ ph: 'failed', t: 'T1' })).toBe('failed');
  });

  it('historyFrom: "unsure" marks the last history turn and never strips the marker or sets failed', () => {
    const body = {
      turn_boundaries: [1],
      messages: [
        { role: 'user', blocks: [{ kind: 'text', text: 'Unzip the site' }] },
        { role: 'assistant', blocks: [{ kind: 'text', text: 'Looking.' }, { kind: 'text', text: '\n\n[response failed: provider_error]' }] },
      ],
    };
    const h = C.historyFrom(body, { liveTail: false, idOf: (i) => 'h' + i, at: 0, lastFailed: 'unsure' });
    const t = h.turns[h.turns.length - 1] as C.TurnBlock;
    expect(t.unsure).toBe(true);
    expect(t.s.terminal?.state).not.toBe('failed');
  });
});

// The transcript names no turn, so a trim between the two list reads can leave an older failed turn last.
// When the turn list names a non-empty error code, the close marker must name the same code, else "Couldn't tell".
// An empty code (the agent leaves it empty for an ordinary request failure) binds nothing: as before.
describe('the close marker must name the turn list\'s error code', () => {
  const failedAs = (t: string, code?: unknown): ListAnswer => [{ id: t, state: 'failed', ...(code === undefined ? {} : { code }) }];

  it('a trim between the reads: the marker names another code, so "Couldn\'t tell" (Recent too), never failed', async () => {
    const f = await failedConversation();
    const t = f.stored().t as string;
    f.lists.push(failedAs(t, 'rate_limited'), failedAs(t, 'rate_limited'));
    const eng = await f.open();
    expect(f.order.slice(0, 3)).toEqual(['turns', 'transcript', 'turns']);
    expect(failedShown(eng)).toBe(false);
    expect(unsureShown(eng)).toBe(true);
    expect(recent(eng)).toBe('unknown');
    expect((eng as any).rec.u).toBe(t);
    render(<Live eng={eng} />);
    expect(screen.getByText(strings['ask.o.unsure'])).toBeTruthy();
    expect(screen.queryByText(strings['ask.o.failed'])).toBeNull();
  });

  it('the marker names the same code: failed is shown, and Recent says Failed', async () => {
    const f = await failedConversation();
    const t = f.stored().t as string;
    f.lists.push(failedAs(t, 'provider_error'), failedAs(t, 'provider_error'));
    const eng = await f.open();
    expect(failedShown(eng)).toBe(true);
    expect(unsureShown(eng)).toBe(false);
    expect(recent(eng)).toBe('failed');
  });

  it('an empty ledger code still stamps failed (an ordinary request failure keeps today\'s behaviour)', async () => {
    for (const code of [undefined, '']) {
      const f = await failedConversation();
      const t = f.stored().t as string;
      f.lists.push(failedAs(t, code), failedAs(t, code));
      const eng = await f.open();
      expect(failedShown(eng)).toBe(true);
      expect(unsureShown(eng)).toBe(false);
      expect(recent(eng)).toBe('failed');
    }
  });

  it('the two reads name different codes: "Couldn\'t tell", even when the first matches the marker', async () => {
    const f = await failedConversation();
    const t = f.stored().t as string;
    f.lists.push(failedAs(t, 'provider_error'), failedAs(t, 'rate_limited'));
    const eng = await f.open();
    expect(failedShown(eng)).toBe(false);
    expect(unsureShown(eng)).toBe(true);
    expect(recent(eng)).toBe('unknown');
  });

  it('a code that is not a string is an unreadable read: "Couldn\'t tell"', async () => {
    const f = await failedConversation();
    const t = f.stored().t as string;
    f.lists.push(failedAs(t, 7), failedAs(t, 7));
    const eng = await f.open();
    expect(failedShown(eng)).toBe(false);
    expect(unsureShown(eng)).toBe(true);
  });

  it('a last turn with no close marker is left as it was (nothing stamped, no note), whatever the code', async () => {
    const f = await failedConversation({ transcripts: ['plain'] });
    const t = f.stored().t as string;
    f.lists.push(failedAs(t, 'rate_limited'), failedAs(t, 'rate_limited'));
    const eng = await f.open();
    expect(failedShown(eng)).toBe(false);
    expect(unsureShown(eng)).toBe(false);
  });

  it('Check again after "Couldn\'t tell" binds again: matching codes settle it as failed, sending nothing', async () => {
    const f = await failedConversation();
    const t = f.stored().t as string;
    f.lists.push(failedAs(t, 'rate_limited'), failedAs(t, 'rate_limited'));
    const eng = await f.open();
    const sent = f.sends();
    render(<Live eng={eng} />);
    f.lists.push(failedAs(t, 'provider_error'), failedAs(t, 'provider_error'));
    act(() => { screen.getByRole('button', { name: strings['ask.checkAgain'] }).click(); });
    await f.flush(2000);
    expect(f.sends()).toBe(sent);
    expect(unsureShown(eng)).toBe(false);
    expect(failedShown(eng)).toBe(true);
    expect(recent(eng)).toBe('failed');
  });

  it('Check again that itself finds the codes differ keeps "Couldn\'t tell" (the mark, Recent unknown, no failed)', async () => {
    const f = await failedConversation();
    const t = f.stored().t as string;
    // Opens unsure because the two reads disagree on the code; the recheck's reads then agree, on a code the marker does not name.
    f.lists.push(failedAs(t, 'provider_error'), failedAs(t, 'rate_limited'));
    const eng = await f.open();
    expect(unsureShown(eng)).toBe(true);
    const sent = f.sends();
    render(<Live eng={eng} />);
    f.lists.push(failedAs(t, 'rate_limited'), failedAs(t, 'rate_limited'));
    act(() => { screen.getByRole('button', { name: strings['ask.checkAgain'] }).click(); });
    await f.flush(2000);
    expect(f.order.slice(-3)).toEqual(['turns', 'transcript', 'turns']);
    expect(f.sends()).toBe(sent);
    expect(failedShown(eng)).toBe(false);
    expect(unsureShown(eng)).toBe(true);
    expect((eng as any).rec.u).toBe(t);
    expect(recent(eng)).toBe('unknown');
    expect(screen.getByText(strings['ask.o.unsure'])).toBeTruthy();
    expect(screen.queryByText(strings['ask.o.failed'])).toBeNull();
  });

  it('historyFrom: a different code on a live tail changes nothing; off a live tail it equals the "unsure" read exactly', () => {
    const body = () => ({
      turn_boundaries: [1, 3],
      messages: [
        { role: 'user', blocks: [{ kind: 'text', text: 'Unzip the site' }] },
        { role: 'assistant', blocks: [{ kind: 'text', text: 'Done.' }] },
        { role: 'user', blocks: [{ kind: 'text', text: 'Now deploy it' }] },
        { role: 'assistant', blocks: [{ kind: 'text', text: 'Deploying.' }, { kind: 'text', text: '\n\n[response failed: provider_error]' }] },
      ],
    });
    const base = { idOf: (i: number) => 'h' + i, at: 0 };
    const live = C.historyFrom(body(), { ...base, liveTail: true, lastFailed: true, failCode: 'rate_limited' });
    const plain = C.historyFrom(body(), { ...base, liveTail: true });
    expect(live.unsure).toBeUndefined();
    expect(live).toEqual(plain);
    const other = C.historyFrom(body(), { ...base, liveTail: false, lastFailed: true, failCode: 'rate_limited' });
    const unsure = C.historyFrom(body(), { ...base, liveTail: false, lastFailed: 'unsure' });
    expect(other.unsure).toBe(true);
    expect({ users: other.users, turns: other.turns }).toEqual(unsure);
    expect(other.turns).toHaveLength(2);
    expect(other.turns[0]?.unsure).toBeUndefined();
  });

  it('tailVerdict: the two reads must agree on the code too', () => {
    const f = (code?: string) => ({ id: 'T1', state: 'failed', ...(code === undefined ? {} : { code }) });
    expect(tailVerdict('T1', f('a'), f('a'))).toBe(true);
    expect(tailVerdict('T1', f('a'), f('b'))).toBe('unsure');
    expect(tailVerdict('T1', f('a'), f())).toBe('unsure');
    expect(tailVerdict('T1', f(''), f())).toBe(true);
  });

  it('historyFrom: another code marks unsure and keeps the marker; the same or an empty code stamps failed', () => {
    const body = () => ({
      turn_boundaries: [1],
      messages: [
        { role: 'user', blocks: [{ kind: 'text', text: 'Unzip the site' }] },
        { role: 'assistant', blocks: [{ kind: 'text', text: 'Looking.' }, { kind: 'text', text: '\n\n[response failed: provider_error]' }] },
      ],
    });
    const read = (failCode?: string) => C.historyFrom(body(), { liveTail: false, idOf: (i) => 'h' + i, at: 0, lastFailed: true, ...(failCode === undefined ? {} : { failCode }) });
    const other = read('rate_limited');
    const ot = other.turns[other.turns.length - 1] as C.TurnBlock;
    expect(other.unsure).toBe(true);
    expect(ot.unsure).toBe(true);
    expect(ot.s.terminal?.state).not.toBe('failed');
    expect(ot.s.segs.join('')).toContain('[response failed: provider_error]');
    for (const code of ['provider_error', '', undefined]) {
      const h = read(code);
      expect(h.unsure).toBeUndefined();
      expect((h.turns[h.turns.length - 1] as C.TurnBlock).s.terminal).toMatchObject({ state: 'failed', code: 'provider_error' });
    }
  });
});
