// conv.ts: the conversation as data. Turns, follow-ups that split a running turn, notes vs the reply, outcomes,
// the transcript history and the reference-only store.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import * as C from './conv';
import type * as L from './logic';

let SEQ = 0;
const env = (type: string, data: any, o: any = {}) => ({ seq: o.seq ?? ++SEQ, incarnation: 'i1', ...(o.turn === null ? {} : { turn_id: o.turn ?? 'T1' }), ...(o.gate ? { gate: o.gate } : {}), event: { type, data } });
const frame = (e: any, now?: number): L.Action => ({ type: 'frame', name: e.event.type.slice(6), data: e, now });
const user = (id: string, text: string, p: Partial<C.UserMsg> = {}): C.UserMsg => ({ id, text, at: 0, key: 'k' + id, via: 'turn', state: 'sent', turnId: null, commandId: null, reason: '', ...p });
function started(text = 'Build me a dashboard'): C.Conv {
  let c = C.addUser(C.emptyConv('s1'), user('1', text, { via: 'create', state: 'sending' }));
  c = C.addTurn(c, { turnId: 'T1', user: '1', now: 1000 });
  return C.patchUser(c, '1', { state: 'sent', turnId: 'T1' });
}
const kinds = (bs: C.Block[]) => bs.map((b) => b.k);

describe('routing a new message', () => {
  it('create first, then a command while a turn runs, then a turn once it ended', () => {
    expect(C.routeFor(C.emptyConv())).toBe('create');
    let c = started();
    expect(C.routeFor(c)).toBe('command');
    c = C.onTurn(c, { type: 'receipt', body: { turn_id: 'T1', state: 'completed' } }, 5000);
    expect(C.routeFor(c)).toBe('turn');
  });
  it('a turn that said agent_done takes a new turn (its receipt is being read)', () => {
    const c = C.onTurn(started(), frame(env('event.agent_done', { outcome: 'completed' })));
    expect(C.routeFor(c)).toBe('turn');
  });
  it('a message in flight or of unknown outcome holds the next one', () => {
    let c = C.addUser(started(), user('2', 'more', { state: 'unknown', via: 'command' }));
    expect(C.canSendMore(c)).toBe(false);
    c = C.patchUser(c, '2', { state: 'refused' });
    expect(C.canSendMore(c)).toBe(true);
  });
  it('what holds the next message back: going out, or of unknown outcome (which wins)', () => {
    const c0 = started();
    expect(C.sendHeldBy(c0)).toBeNull();
    const sending = C.addUser(c0, user('2', 'more', { state: 'sending', via: 'command' }));
    expect(C.sendHeldBy(sending)).toBe('sending');
    expect(C.sendHeldBy(C.addUser(sending, user('3', 'again', { state: 'unknown', via: 'command' })))).toBe('unknown');
    // Whatever the order of the rows, the unknown one is what is reported.
    const unknownFirst = C.addUser(C.addUser(c0, user('5', 'a', { state: 'unknown', via: 'command' })), user('6', 'b', { state: 'sending', via: 'command' }));
    expect(C.sendHeldBy(unknownFirst)).toBe('unknown');
    expect(C.sendHeldBy(C.addUser(c0, user('4', '', { state: 'unknown', via: 'command' })))).toBeNull();   // no text: nothing to retype
  });
});

describe('blocks: user, trail, reply', () => {
  it('earlier text is a note in the trail; only the text after the last step is the reply', () => {
    let c = started();
    c = C.onTurn(c, frame(env('event.stream_chunk', { text: 'Let me look.' })));
    c = C.onTurn(c, frame(env('event.tool_call', { tool_id: 'a', name: 'bash', summary: '$ ls' }), 2000));
    c = C.onTurn(c, frame(env('event.tool_result', { tool_id: 'a' }), 3000));
    c = C.onTurn(c, frame(env('event.stream_chunk', { text: 'Made it.' })));
    const bs = C.blocks(c, 9000);
    expect(kinds(bs)).toEqual(['user', 'trail', 'reply']);
    const tr = bs[1] as any;
    expect(tr.rows.map((r: any) => r.k)).toEqual(['note', 'step']);
    expect(tr.rows[0].text).toBe('Let me look.');
    expect(tr.ms).toBe(8000);   // running: since the turn started
    expect(tr.done).toBe(false);
    expect((bs[2] as any)).toMatchObject({ text: 'Made it.', streaming: true, final: false });
  });
  it('the live step is the last one still running', () => {
    let c = started();
    c = C.onTurn(c, frame(env('event.tool_call', { tool_id: 'a', name: 'edit_file', summary: 'src/index.html' })));
    const tr = C.blocks(c, 0).find((b) => b.k === 'trail') as any;
    expect(tr.live.name).toBe('edit_file');
  });
  it('a follow-up that reached the running turn splits it: its own trail and reply follow it', () => {
    let c = started();
    c = C.onTurn(c, frame(env('event.tool_call', { tool_id: 'a', name: 'bash' })));
    c = C.onTurn(c, frame(env('event.stream_chunk', { text: 'half' })));
    c = C.addUser(c, user('2', 'Also add a README', { via: 'command', state: 'queued' }));
    c = C.commitIntoTurn(c, '2');
    expect(c.users['2']!.state).toBe('sent');
    expect(c.loose).toEqual([]);
    c = C.onTurn(c, frame(env('event.tool_call', { tool_id: 'b', name: 'write_file' })));
    c = C.onTurn(c, frame(env('event.stream_chunk', { text: 'README done.' })));
    const bs = C.blocks(c, 0);
    expect(kinds(bs)).toEqual(['user', 'trail', 'reply', 'user', 'trail', 'reply']);
    expect((bs[2] as any).text).toBe('half');
    expect((bs[2] as any).streaming).toBe(false);
    expect((bs[4] as any).rows.map((r: any) => r.step.id)).toEqual(['b']);
    expect((bs[5] as any).text).toBe('README done.');
  });
  it('messages not attached to a turn show last, with their state', () => {
    const c = C.addUser(started(), user('2', 'x', { state: 'unknown', via: 'command' }));
    const bs = C.blocks(c, 0);
    expect(bs[bs.length - 1]).toMatchObject({ k: 'user', msg: { state: 'unknown' } });
  });
  it('the next turn starts on the same connection', () => {
    let c = started();
    c = C.onTurn(c, frame(env('event.stream_chunk', { text: 'one' })));
    c = C.onTurn(c, { type: 'receipt', body: { turn_id: 'T1', state: 'completed' } }, 2000);
    c = C.addUser(c, user('2', 'two'));
    c = C.addTurn(c, { turnId: 'T2', user: '2', now: 3000 });
    expect(c.turns[1]!.s.seq).toBe(c.turns[0]!.s.seq);
    c = C.onTurn(c, frame(env('event.stream_chunk', { text: 'second' }, { turn: 'T2' })));
    const replies = C.blocks(c, 0).filter((b) => b.k === 'reply').map((b: any) => b.text);
    expect(replies).toEqual(['one', 'second']);
  });
});

describe('blocks: outcomes and errors', () => {
  it('a failed turn ends with its outcome and offers its text again; a stopped one says steps may have run', () => {
    let c = C.onTurn(started(), { type: 'receipt', body: { turn_id: 'T1', state: 'failed', error_code: 'rate_limit', retry_at: '2026-10-23T14:05:00Z' } }, 2);
    const o = C.blocks(c, 0).find((b) => b.k === 'outcome') as any;
    // Retry names the failed message itself (its text and its files go again, never the composer's).
    expect(o).toMatchObject({ state: 'failed', code: 'rate_limit', retryAt: '2026-10-23T14:05:00Z' });
    expect(c.users[o.retry]?.text).toBe('Build me a dashboard');
    c = C.onTurn(started(), { type: 'receipt', body: { turn_id: 'T1', state: 'cancelled', effects_may_have_occurred: true } }, 2);
    expect(C.blocks(c, 0).find((b) => b.k === 'outcome')).toMatchObject({ state: 'cancelled', retry: null, effects: true });
  });
  it('a completed turn has no outcome line', () => {
    const c = C.onTurn(started(), { type: 'receipt', body: { turn_id: 'T1', state: 'completed' } }, 2);
    expect(kinds(C.blocks(c, 0))).toEqual(['user']);
  });
  it('a live error shows while the turn still runs', () => {
    const c = C.onTurn(started(), frame(env('event.error', { code: 'rate_limit', retry_at: '2026-10-23T14:05:00Z' })));
    expect(C.blocks(c, 0).find((b) => b.k === 'error')).toMatchObject({ code: 'rate_limit' });
  });
  it('a decided card folds where it was decided', () => {
    let c = C.onTurn(started(), frame(env('event.tool_call', { tool_id: 'a', name: 'bash' })));
    c = C.addDecided(c, { kind: 'once', tool: 'bash', text: 'npm install chart.js' });
    c = C.onTurn(c, frame(env('event.tool_call', { tool_id: 'b', name: 'bash' })));
    const d = C.blocks(c, 0).find((b) => b.k === 'decided') as any;
    expect(d.d).toMatchObject({ kind: 'once', step: 1 });
  });
});

describe('command frames', () => {
  it('reads committed and settled frames by their data type', () => {
    const e = { seq: 9, event: { type: 'event.command_committed', data: { command_ids: ['cmd_1', 5], turn_id: 'T1', how: 'next_step' } } };
    expect(C.commandFrame('command_committed', e)).toMatchObject({ kind: 'committed', ids: ['cmd_1'], turnId: 'T1', how: 'next_step' });
    expect(C.commandFrame('command_committed', { event: { type: 'event.other' } })).toBeNull();
    expect(C.commandFrame('stream_chunk', e)).toBeNull();
    const s = { seq: 10, event: { type: 'event.command_settled', data: { command_ids: ['cmd_2'], state: 'refused', reason: 'hook' } } };
    expect(C.commandFrame('command_settled', s)).toMatchObject({ kind: 'settled', state: 'refused', reason: 'hook' });
  });
});

describe('history from the transcript', () => {
  const body = {
    turn_boundaries: [2, 6],
    messages: [
      { role: 'user', blocks: [{ kind: 'text', text: 'What is running?' }] },
      { role: 'assistant', blocks: [{ kind: 'text', text: 'Checking.' }, { kind: 'tool_use', tool_id: 'a', tool_name: 'bash', input: { command: 'ps aux' } }] },
      { role: 'user', blocks: [{ kind: 'tool_result', tool_id: 'a', output: '…' }] },
      { role: 'user', blocks: [{ kind: 'text', text: 'And the disk?' }] },
      { role: 'assistant', blocks: [{ kind: 'tool_use', tool_id: 'b', tool_name: 'read_file', input: { path: '/etc/fstab' } }] },
      { role: 'user', blocks: [{ kind: 'tool_result', tool_id: 'b', is_error: true }] },
      { role: 'assistant', blocks: [{ kind: 'text', text: 'Disk is fine.' }] },
      { role: 'user', blocks: [{ kind: 'text', text: 'live tail' }] },
    ],
  };
  it('turns, steps with summaries, notes and replies; the live tail left out when a turn is observed', () => {
    const h = C.historyFrom(body, { liveTail: true, idOf: (i) => 'h' + i, at: 0 });
    expect(h.users.map((u) => u.text)).toEqual(['What is running?', 'And the disk?']);
    expect(h.turns).toHaveLength(2);
    expect(h.turns[0]!.s.steps[0]).toMatchObject({ name: 'bash', summary: '$ ps aux', ok: true });
    expect(h.turns[1]!.s.steps[0]).toMatchObject({ summary: '/etc/fstab', ok: false });
    const c: C.Conv = { ...C.emptyConv('s1'), users: Object.fromEntries(h.users.map((u) => [u.id, u])), turns: h.turns };
    const bs = C.blocks(c, 0);
    expect(kinds(bs)).toEqual(['user', 'trail', 'user', 'trail', 'reply']);
    expect((bs[1] as any).rows[0]).toEqual({ k: 'note', text: 'Checking.' });
    expect((bs[4] as any)).toMatchObject({ text: 'Disk is fine.', streaming: false });
    // A turn read from the transcript saw no stream_done: its reply carries no responses (its requests stay under Other spend).
    expect(bs.some((b) => 'responses' in b || 'responsesSkipped' in b)).toBe(false);
  });
  it('the tail is kept when no turn is observed', () => {
    const h = C.historyFrom(body, { liveTail: false, idOf: (i) => 'h' + i, at: 0 });
    expect(h.users.map((u) => u.text)).toContain('live tail');
  });
  it('junk is skipped', () => {
    expect(C.historyFrom({ messages: [null, 3, { role: 'x' }] }, { liveTail: false, idOf: String, at: 0 }).turns).toEqual([]);
    expect(C.historyFrom(null, { liveTail: false, idOf: String, at: 0 }).turns).toEqual([]);
  });
});

describe('status line', () => {
  it('working, waiting, stopping, reconnecting, lost; nothing at rest', () => {
    let c = started();
    expect(C.statusOf(c, { lost: false, reconnecting: false })).toBe('working');
    expect(C.statusOf(c, { lost: false, reconnecting: true })).toBe('reconnecting');
    expect(C.statusOf(c, { lost: true, reconnecting: true })).toBe('lost');
    c = C.onTurn(c, frame(env('event.confirm_request', { gate_id: 1, tool: 'bash', params: { command: 'ls' } }, { gate: { id: 'g1', generation: 1, type: 'confirm' } })));
    expect(C.statusOf(c, { lost: false, reconnecting: false })).toBe('waiting');
    c = C.onTurn(c, { type: 'receipt', body: { turn_id: 'T1', state: 'completed' } });
    expect(C.statusOf(c, { lost: false, reconnecting: false })).toBeNull();
  });
});

describe('titles', () => {
  it('first message, one line, 48 code points', () => {
    expect(C.titleOf('  a\n b  ')).toBe('a b');
    const t = C.titleOf('x'.repeat(60));
    expect(Array.from(t)).toHaveLength(48);
    expect(t.endsWith('…')).toBe(true);
  });
});

describe('the store keeps references, several conversations per computer', () => {
  const K = (n: number) => 'hx-' + String(n).padStart(32, '0');
  const rec = (n: number, p: Partial<L.AskRecord> = {}): L.AskRecord => ({ p: 'p1', c: 'c1', r: 'global', s: 's' + n, t: null, k1: K(n), k2: K(n + 100), rc: 'custom', n: null, at: n, i: null, q: 0, ph: 'completed', l: 'en', ...p });
  const slot = { p: 'p1', c: 'c1', r: 'global' };
  it('a new conversation goes first; saving keeps its place; promote moves it', () => {
    let st = C.putConv(null, 'ada', rec(1))!;
    st = C.putConv(st, 'ada', rec(2))!;
    expect(C.convsFor(st, 'ada', slot).map((r) => r.s)).toEqual(['s2', 's1']);
    st = C.putConv(st, 'ada', rec(1, { ph: 'waiting' }))!;
    expect(C.convsFor(st, 'ada', slot).map((r) => r.s)).toEqual(['s2', 's1']);
    expect(C.waitingRecs(st, 'ada').map((r) => r.s)).toEqual(['s1']);
    st = C.putConv(st, 'ada', rec(1), { front: true })!;
    expect(C.convsFor(st, 'ada', slot)[0]!.s).toBe('s1');
  });
  it('at most 8 per account; the oldest finished one goes, a live one stays', () => {
    let st: L.AskStore | null = C.putConv(null, 'ada', rec(1, { ph: 'working' }));
    for (let i = 2; i <= 9; i++) st = C.putConv(st, 'ada', rec(i));
    const ids = C.convsFor(st, 'ada', slot).map((r) => r.s);
    expect(ids).toHaveLength(8);
    expect(ids).toContain('s1');
    expect(ids).not.toContain('s2');
  });
  it('drop removes only that conversation; an invalid record or account writes nothing', () => {
    let st = C.putConv(C.putConv(null, 'ada', rec(1))!, 'ada', rec(2))!;
    st = C.dropConv(st, 'ada', slot, K(1))!;
    expect(C.convsFor(st, 'ada', slot).map((r) => r.s)).toEqual(['s2']);
    expect(C.dropConv(st, 'ada', slot, K(7))).toBeNull();
    expect(C.putConv(st, '__proto__', rec(3))).toBeNull();
    expect(C.putConv(st, 'ada', { ...rec(3), k1: 'bad' })).toBeNull();
  });
  it('the stored record never holds text', () => {
    const st = C.putConv(null, 'ada', { ...rec(1), text: 'secret prompt' } as any)!;
    expect(JSON.stringify(st)).not.toContain('secret');
  });
});

describe('withoutCloseMarker', () => {
  it('drops the closing marker of an interrupted turn, and only at the end', () => {
    expect(C.withoutCloseMarker('[response interrupted: cancelled by the user]')).toBe('');
    expect(C.withoutCloseMarker('Working on it.\n\n[response interrupted: the work was stopped]')).toBe('Working on it.');
    expect(C.withoutCloseMarker('[response interrupted: x] then more')).toBe('[response interrupted: x] then more');
    expect(C.withoutCloseMarker('plain reply')).toBe('plain reply');
  });
});

describe('withoutCommandHeader', () => {
  it('drops the daemon header of a command message, and nothing else', () => {
    expect(C.withoutCommandHeader('[Message from the user while you were working, sent 2026-10-23T08:10:13Z — it may change or replace what you are doing]\nAlso say banana.')).toBe('Also say banana.');
    expect(C.withoutCommandHeader('[Message from the user, sent 2026-10-23T08:10:13Z]\nHello')).toBe('Hello');
    expect(C.withoutCommandHeader('[Message from me] not a header')).toBe('[Message from me] not a header');
    expect(C.withoutCommandHeader('plain')).toBe('plain');
  });
});

describe('Recent row state', () => {
  it('an unknown send is its own state, never Running, Failed or Done (C9)', () => {
    expect(C.rowState('unknown')).toBe('Unknown');
  });
  it('maps every phase to one state', () => {
    expect(C.rowState('waiting')).toBe('Waiting');
    for (const ph of ['opening', 'sending', 'working', 'stopping', 'finishing']) expect(C.rowState(ph)).toBe('Running');
    expect(C.rowState('failed')).toBe('Failed');
    expect(C.rowState('cancelled')).toBe('Stopped');
    expect(C.rowState('interrupted')).toBe('Interrupted');
    expect(C.rowState('gone')).toBe('Gone');
    expect(C.rowState('completed')).toBe('Done');
  });
});

describe('Recent never says Done over an unsettled message', () => {
  it('an ended turn with a queued, maybe-sent or replaced key reads as unknown; live and gone stay as they are', () => {
    const K = 'hx-' + 'a'.repeat(32);
    expect(C.recentPhase({ ph: 'completed' })).toBe('completed');
    expect(C.recentPhase({ ph: 'completed', k3: [K] })).toBe('unknown');
    expect(C.recentPhase({ ph: 'failed', w: true })).toBe('unknown');
    expect(C.recentPhase({ ph: 'completed', kw: [K] })).toBe('unknown');
    expect(C.recentPhase({ ph: 'working', k3: [K] })).toBe('working');
    expect(C.recentPhase({ ph: 'gone', w: true })).toBe('gone');
  });
});

describe('usageTurns: each turn\'s streamed responses, read from the turn (:2140,:2143)', () => {
  const done = (n: number, extra: Record<string, unknown> = {}, o: any = {}) => frame(env('event.stream_done', { cost_usd: 0.1 * n, input_tokens: 10 * n, output_tokens: n, cache_read_tokens: 100 * n, cache_creation_tokens: 0, ...extra }, o));
  const counts = (n: number) => ({ input: 10 * n, output: n, cacheRead: 100 * n, cacheWrite: 0 });
  const replies = (c: C.Conv) => C.blocks(c, 9000).filter((b) => b.k === 'reply') as Array<Extract<C.Block, { k: 'reply' }>>;
  /** Ends T1 and starts T2 under `text`. */
  const next = (c: C.Conv, text: string): C.Conv => {
    c = C.onTurn(c, { type: 'receipt', body: { turn_id: 'T1', state: 'completed' } }, 5000);
    c = C.addUser(c, user('2', text, { state: 'sending' }));
    c = C.addTurn(c, { turnId: 'T2', user: '2', now: 6000 });
    return C.patchUser(c, '2', { state: 'sent', turnId: 'T2' });
  };
  it('a turn lists its responses in order under its turn id and its own question; the reply carries no counts, its cost line is unchanged', () => {
    let c = started();
    c = C.onTurn(c, frame(env('event.tool_call', { tool_id: 'a', name: 'bash', summary: '$ ls' }), 2000));
    c = C.onTurn(c, done(1));
    c = C.onTurn(c, frame(env('event.tool_result', { tool_id: 'a' }), 3000));
    c = C.onTurn(c, frame(env('event.stream_chunk', { text: 'Made it.' })));
    c = C.onTurn(c, done(2));
    expect(C.usageTurns(c)).toEqual([{ key: 't:T1', turn: 1, asked: 'Build me a dashboard', responses: [counts(1), counts(2)] }]);
    const [r] = replies(c);
    expect(r!.key, 'the key is that reply\'s').toBe('r0:0');
    expect(r!.cost).toBeCloseTo(0.3, 10);
    expect('responses' in r! || 'responsesSkipped' in r!, 'the counts live on the turn, not the block').toBe(false);
  });
  it('a follow-up that splits a turn: one entry, under the same key, named by the first question', () => {
    let c = started();
    c = C.onTurn(c, frame(env('event.tool_call', { tool_id: 'a', name: 'bash' })));
    c = C.onTurn(c, frame(env('event.stream_chunk', { text: 'First part.' })));
    c = C.onTurn(c, done(1));
    c = C.addUser(c, user('2', 'and also this', { via: 'command', state: 'queued' }));
    c = C.commitIntoTurn(c, '2');
    c = C.onTurn(c, frame(env('event.tool_call', { tool_id: 'b', name: 'write_file' })));
    c = C.onTurn(c, frame(env('event.stream_chunk', { text: 'Second part.' })));
    c = C.onTurn(c, done(2));
    expect(C.usageTurns(c)).toEqual([{ key: 't:T1', turn: 1, asked: 'Build me a dashboard', responses: [counts(1), counts(2)] }]);
  });
  it('a turn that reported no counts, or only unreadable ones, is not listed', () => {
    let c = started();
    c = C.onTurn(c, frame(env('event.stream_chunk', { text: 'Hi.' })));
    c = C.onTurn(c, frame(env('event.stream_done', { cost_usd: 0.2 })));
    expect(C.usageTurns(c)).toEqual([]);
    c = started();
    c = C.onTurn(c, frame(env('event.stream_chunk', { text: 'Hi.' })));
    expect(C.usageTurns(c)).toEqual([]);
  });
  it(':2140 a turn that ends with no reply text (no reply block) keeps its responses', () => {
    let c = started('Look at the logs');
    c = C.onTurn(c, frame(env('event.tool_call', { tool_id: 'a', name: 'bash', summary: '$ tail log' }), 2000));
    c = C.onTurn(c, done(1));
    c = C.onTurn(c, frame(env('event.tool_result', { tool_id: 'a' }), 3000));
    c = C.onTurn(c, done(2));
    c = C.onTurn(c, { type: 'receipt', body: { turn_id: 'T1', state: 'completed' } }, 5000);
    expect(replies(c), 'the turn drew no reply block').toHaveLength(0);
    expect(C.usageTurns(c)).toEqual([{ key: 't:T1', turn: 1, asked: 'Look at the logs', responses: [counts(1), counts(2)] }]);
  });
  it('a turn started without its question (another client, a command): Turn N, never the follow-up committed into it', () => {
    let c = C.addTurn(C.emptyConv('s1'), { turnId: 'T1', now: 1000 });
    c = C.onTurn(c, frame(env('event.stream_chunk', { text: 'Working.' })));
    c = C.addUser(c, user('2', 'and also this', { via: 'command', state: 'queued' }));
    c = C.commitIntoTurn(c, '2');
    c = C.onTurn(c, done(1));
    expect(C.usageTurns(c)).toEqual([{ key: 't:T1', turn: 1, asked: '', promptless: true, responses: [counts(1)] }]);
  });
  it('a turn\'s key is its agent turn id: a follow-up committed after its first counts does not change it', () => {
    let c = started();
    c = C.onTurn(c, done(1));
    expect(C.usageTurns(c).map((u) => u.key)).toEqual(['t:T1']);
    c = C.addUser(c, user('2', 'and also this', { via: 'command', state: 'queued' }));
    c = C.commitIntoTurn(c, '2');
    c = C.onTurn(c, done(2));
    expect(C.usageTurns(c).map((u) => [u.key, u.asked, u.responses.length])).toEqual([['t:T1', 'Build me a dashboard', 2]]);
  });
  it('mergeUsage: kept turns stay in order; a turn in both takes the longer list, the shown question, its place now; new turns follow', () => {
    const e = (key: string, turn: number, asked: string, n: number[]): C.UsageEntry => ({ key, turn, asked, responses: n.map(counts) });
    const kept = [e('t:A', 1, 'first', [1, 2]), e('t:B', 2, 'second', [3])];
    const shown = (l: C.UsageEntry[]) => C.shownUsage(l);
    expect(shown(C.mergeUsage(kept, []))).toEqual(kept);
    // A rebuilt view shows A again from a replay that started past its first response, B with a later one, and a new turn C.
    expect(shown(C.mergeUsage(kept, [e('t:B', 3, '', [3, 4]), e('t:A', 2, '', [2]), e('t:C', 4, 'third', [5])]))).toEqual([
      e('t:A', 2, 'first', [1, 2]), e('t:B', 3, 'second', [3, 4]), e('t:C', 4, 'third', [5]),
    ]);
    // The question this viewer saw stays: a reopened turn's is read from the transcript's tail, which may be a follow-up.
    expect(C.mergeUsage(kept, [e('t:A', 1, 'a follow-up', [1, 2])])[0]!.asked).toBe('first');
    expect(C.mergeUsage([e('t:A', 1, '', [1])], [e('t:A', 1, 'first', [1])])[0]!.asked).toBe('first');
  });
  it('mergeUsage: a replay that starts past the first responses never replaces what was seen; each response once', () => {
    const e = (n: number[]): C.UsageEntry => ({ key: 't:A', turn: 1, asked: 'q', responses: n.map(counts) });
    const join = (kept: number[], now: number[]) => C.mergeUsage([e(kept)], [e(now)])[0]!.responses.map((r) => r.output);
    expect(join([1, 2], [2, 3]), 'the ring dropped 1; 3 came live after the replay').toEqual([1, 2, 3]);
    expect(join([1, 2, 3], [2]), 'a replay still under way').toEqual([1, 2, 3]);
    expect(join([1, 2], [1, 2, 3]), 'a whole replay').toEqual([1, 2, 3]);
    expect(join([2, 3], [1, 2, 3, 4]), 'a view that reads further back than the kept one').toEqual([1, 2, 3, 4]);
    expect(join([1, 2], [4, 5]), 'nothing in common (frames neither view saw): both kept').toEqual([1, 2, 4, 5]);
    expect(join([1, 2], [2]), 'inside the kept list').toEqual([1, 2]);
    // Laid only where every response both hold agrees: one agreeing response is not the same run.
    expect(join([1, 2, 3], [2, 9]), 'the second disagrees: no common place').toEqual([1, 2, 3, 2, 9]);
  });
  it('mergeUsage: views folding disjoint, then overlapping, runs into one ledger count each response once', () => {
    const e = (n: number[]): C.UsageEntry => ({ key: 't:A', turn: 1, asked: 'q', responses: n.map(counts) });
    const fold = (...views: number[][]) => views.reduce<C.UsageEntry[]>((kept, v) => C.mergeUsage(kept, [e(v)]), [])[0]!.responses.map((r) => r.output);
    expect(fold([1], [3], [1, 2]), 'one view saw 1, a later one 3, the first then 1 and 2').toEqual([1, 2, 3]);
    expect(fold([1], [3], [2, 3], [1, 2]), 'two runs joined by a third').toEqual([1, 2, 3]);
    expect(fold([1], [4], [3], [1, 2, 3]), 'a whole run absorbs the two it covers').toEqual([1, 2, 3, 4]);
    expect(fold([1], [3], [1], [3]), 'views reading again what was kept add nothing').toEqual([1, 3]);
  });
  it('mergeUsage: a turn this viewer saw start without its question stays unnamed; a follow-up never names it', () => {
    const k: C.UsageEntry = { key: 't:A', turn: 1, asked: '', promptless: true, responses: [counts(1)] };
    const [m] = C.mergeUsage([k], [{ key: 't:A', turn: 1, asked: 'a follow-up from the transcript tail', responses: [counts(1)] }]);
    expect([m!.asked, m!.promptless]).toEqual(['', true]);
    const [u] = C.mergeUsage([{ ...k, promptless: undefined }], [{ key: 't:A', turn: 1, asked: 'the question', responses: [counts(1)] }]);
    expect(u!.asked, 'a question not shown before is taken').toBe('the question');
  });
  it(':2143 a turn that drew no block keeps its own question; the next turn is named by its own', () => {
    let c = started('Look at the logs');
    c = C.onTurn(c, done(1));                                          // a response, and no text, step or decision: no block names turn 0
    c = next(c, 'And the disk?');
    c = C.onTurn(c, frame(env('event.stream_chunk', { text: 'Fine.' }, { turn: 'T2' })));
    c = C.onTurn(c, done(2, {}, { turn: 'T2' }));
    expect(C.usageTurns(c).map((u) => [u.key, u.turn, u.asked, u.responses.length])).toEqual([['t:T1', 1, 'Look at the logs', 1], ['t:T2', 2, 'And the disk?', 1]]);
  });
});

// The agent compacts a long chat into a summary it keeps as the first message of its record, a user message whose only mark is its
// fixed first line. Read back, it is the agent's note above the next turn, never a message of the person's.
describe('historyFrom: the compaction summary', () => {
  const SUMMARY = '**User goals and instructions**\n- Fix the cart total\n- Keep `round()` as is\n\n```ts\nconst total = round(sum);\n```';
  const body = {
    turn_boundaries: [2],
    messages: [
      { role: 'user', blocks: [{ kind: 'text', text: C.COMPACTION_SUMMARY_PREFIX + SUMMARY }] },
      { role: 'user', blocks: [{ kind: 'text', text: 'Now round it half up.' }] },
      { role: 'assistant', blocks: [{ kind: 'text', text: 'Done: it rounds half up.' }] },
    ],
  };
  it('is no message of the person\'s: the next turn carries it, its index in the record is kept', () => {
    expect(C.COMPACTION_SUMMARY_PREFIX).toBe('[Summary of earlier conversation, compacted to save context]\n\n');
    const h = C.historyFrom(body, { liveTail: false, idOf: (i) => 'h' + i, at: 0 });
    expect(h.users.map((u) => u.text)).toEqual(['Now round it half up.']);
    expect(h.turns).toHaveLength(1);
    expect(h.turns[0]).toMatchObject({ summary: SUMMARY, idx: 0, pin: 2 });
    const c: C.Conv = { ...C.emptyConv('s1'), users: Object.fromEntries(h.users.map((u) => [u.id, u])), turns: h.turns };
    const bs = C.blocks(c, 0);
    expect(kinds(bs)).toEqual(['summary', 'user', 'reply']);
    expect(bs[0]).toEqual({ k: 'summary', key: 'c0', text: SUMMARY });
  });
  it('a summary with nothing after it is drawn alone; the same words later in a message are the person\'s', () => {
    const alone = C.historyFrom({ messages: [body.messages[0]] }, { liveTail: false, idOf: (i) => 'h' + i, at: 0 });
    expect(alone.users).toEqual([]);
    expect(kinds(C.blocks({ ...C.emptyConv('s1'), turns: alone.turns }, 0))).toEqual(['summary']);
    const quoted = 'Why did it say ' + C.COMPACTION_SUMMARY_PREFIX.trim();
    const mine = C.historyFrom({ messages: [{ role: 'user', blocks: [{ kind: 'text', text: quoted }] }] }, { liveTail: false, idOf: (i) => 'h' + i, at: 0 });
    expect(mine.users.map((u) => u.text)).toEqual([quoted]);
    expect(mine.turns[0]!.summary).toBeUndefined();
  });
  it('a person who typed those very words keeps the message: the agent answered it, so it is theirs, whole, with its answer', () => {
    const typed = C.COMPACTION_SUMMARY_PREFIX + 'is what my notes say. Is that right?';
    const u = (text: string) => ({ role: 'user', blocks: [{ kind: 'text', text }] });
    const a = (text: string) => ({ role: 'assistant', blocks: [{ kind: 'text', text }] });
    for (const msgs of [[u(typed), a('Yes.')], [u('Hello'), a('Hi.'), u(typed), a('Yes.')]]) {
      const h = C.historyFrom({ messages: msgs, turn_boundaries: msgs.length === 2 ? [1] : [1, 3] }, { liveTail: false, idOf: (i) => 'h' + i, at: 0 });
      expect(h.users.at(-1)!.text).toBe(typed.trim());
      expect(h.turns.every((t) => t.summary === undefined)).toBe(true);
      expect(h.turns.at(-1)).toMatchObject({ idx: h.turns.length - 1 });
      const c: C.Conv = { ...C.emptyConv('s1'), users: Object.fromEntries(h.users.map((x) => [x.id, x])), turns: h.turns };
      const bs = C.blocks(c, 0);
      expect(kinds(bs).slice(-2)).toEqual(['user', 'reply']);
      expect(bs.at(-1)).toMatchObject({ text: 'Yes.' });
    }
  });
});
