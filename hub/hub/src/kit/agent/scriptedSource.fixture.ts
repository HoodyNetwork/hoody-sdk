// scriptedSource.fixture: a deterministic ActiveSource for terminal tests, benchmarks and the agent demo screen. It plays
// a script of steps (a user message, step trails, a reply streamed in chunks, a gate) on an injected clock, and records
// what the views send (send, stop, decide, answer). Fixture only: never imported by a page or the kit at runtime.
// Names come from fixtureWorld's style (Ada, atlas); nothing here is real data.
import { can, type CapFacts } from './capability';
import type { ActiveSource, ConvBlock, ConvSnapshot, Decision, Draft, GateEntry, GateRef, SendOutcome } from './source';
import type { GateView } from './GateCard';

export type ScriptStep =
  | { k: 'user'; text: string }
  | { k: 'steps'; label: string; rows: { verb: string; summary?: string; state?: 'running' | 'ok' | 'failed' | 'unknown' }[] }
  /** A reply streamed `chunk` characters at a time (one chunk per tick). */
  | { k: 'reply'; text: string; chunk?: number; cost?: number; files?: number }
  /** A message the agent did not take: its row says so and offers Edit (take back). */
  | { k: 'unsent'; text: string }
  | { k: 'gate'; gate: GateView }
  | { k: 'line'; text: string; tone: 'muted' | 'bad' | 'info' };

export interface Recorded { send: Draft[]; stop: string[]; decide: Array<{ ref: GateRef; d: Decision }>; answer: unknown[] }

const FACTS: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  completedTurns: 0, prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};

export interface ScriptedSource extends ActiveSource {
  /** Plays the next tick of the script; false once it is all played. */
  tick(): boolean;
  /** Plays everything left. */
  drain(): void;
  /** Adds steps to the end of the script. */
  push(...steps: ScriptStep[]): void;
  readonly recorded: Recorded;
}

/** A source over `script`. `now` stamps replies (default a fixed instant, so frames are stable). */
export function scriptedSource(script: ScriptStep[], o: { title?: string; now?: () => number } = {}): ScriptedSource {
  const now = o.now ?? (() => Date.UTC(2026, 10, 11, 9, 30));
  const queue = [...script];
  const listeners = new Set<() => void>();
  const blocks: ConvBlock[] = [];
  const gates: GateEntry[] = [];
  let facts: CapFacts = { ...FACTS };
  let n = 0;
  let streaming: { key: string; text: string; at: number; chunk: number; cost: number; files?: number } | null = null;
  const unsent = new Map<string, string>();
  let snap: ConvSnapshot = make();
  const recorded: Recorded = { send: [], stop: [], decide: [], answer: [] };

  function make(): ConvSnapshot {
    return {
      facts, title: o.title ?? 'Build the dashboard', blocks: [...blocks], gates: [...gates],
      meta: { computer: 'atlas', realm: 'Personal', folder: '~/dash', agent: 'general', model: 'Claude Sonnet', status: facts.turn ? 'running' : gates.length ? 'needs' : 'idle' },
    };
  }
  const emit = () => { snap = make(); for (const l of listeners) l(); };

  function tick(): boolean {
    if (streaming) {
      const s = streaming;
      const i = blocks.findIndex((b) => b.key === s.key);
      const cur = blocks[i] as Extract<ConvBlock, { k: 'reply' }>;
      const next = s.text.slice(0, cur.text.length + s.chunk);
      const done = next.length >= s.text.length;
      blocks[i] = { ...cur, text: next, streaming: !done, final: done, at: done ? s.at : null, cost: done ? s.cost : null, ...(done ? { turn: facts.completedTurns ?? 0, ...(s.files ? { files: s.files } : {}) } : {}) };
      if (done) { streaming = null; facts = { ...facts, turn: false, state: 'idle', completedTurns: (facts.completedTurns ?? 0) + 1 }; }
      emit();
      return true;
    }
    const st = queue.shift();
    if (!st) return false;
    const key = `b${++n}`;
    if (st.k === 'user') {
      blocks.push({ k: 'user', key, text: st.text, at: now() });
      facts = { ...facts, turn: true, state: 'running' };
    } else if (st.k === 'steps') {
      const rows = st.rows.map((r, j) => ({ id: `${key}-${j}`, state: r.state ?? 'ok', verb: r.verb, ...(r.summary ? { summary: r.summary } : {}) }));
      const state = rows.some((r) => r.state === 'running') ? 'running' : rows.some((r) => r.state === 'failed') ? 'failed' : 'ok';
      blocks.push({ k: 'steps', key, label: st.label, state, rows });
    } else if (st.k === 'reply') {
      blocks.push({ k: 'reply', key, text: '', streaming: true, final: false, cost: null, at: null });
      streaming = { key, text: st.text, at: now(), chunk: st.chunk ?? 40, cost: st.cost ?? 0.0123, ...(st.files ? { files: st.files } : {}) };
      return tick();
    } else if (st.k === 'unsent') {
      unsent.set(key, st.text);
      blocks.push({ k: 'user', key, text: st.text, at: now(), note: { text: 'Not sent; nothing ran.', bad: true }, req: { key, kind: 'message' }, actions: ['takeBack'] });
    } else if (st.k === 'gate') {
      gates.push({ key, ref: { id: `g${n}`, generation: 1 }, gate: st.gate, helper: false, addressing: false, held: null, decision: null });
      facts = { ...facts, gate: st.gate.kind };
    } else {
      blocks.push({ k: 'line', key, text: st.text, tone: st.tone });
    }
    emit();
    return true;
  }

  const done: SendOutcome = { k: 'done' };
  const src: ScriptedSource = {
    kind: 'session',
    ref: { computer: 'atlas.1a2b', realm: 'global', sid: 'sess-demo' },
    snapshot: () => snap,
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    watch() {},
    can: (a) => can(a, facts),
    async send(d) { recorded.send.push(d); queue.push({ k: 'user', text: d.text }); tick(); return done; },
    async stop(scope) { recorded.stop.push(scope); streaming = null; facts = { ...facts, turn: false, state: 'idle' }; emit(); return done; },
    async decide(ref, d) {
      recorded.decide.push({ ref, d });
      const i = gates.findIndex((g) => g.ref.id === ref.id);
      if (i >= 0) {
        const g = gates[i]!;
        gates.splice(i, 1);
        blocks.push({ k: 'decided', key: `d${++n}`, d: { kind: d.choice, tool: g.gate.tool ?? '', text: String((g.gate.params as { command?: string } | null | undefined)?.command ?? '') } });
        facts = { ...facts, gate: 'none' };
        emit();
      }
      return done;
    },
    async answer(ref, a) {
      recorded.answer.push(a);
      const i = gates.findIndex((g) => g.ref.id === ref.id);
      if (i >= 0) { gates.splice(i, 1); facts = { ...facts, gate: 'none' }; emit(); }
      return done;
    },
    async check() { return done; },
    takeBack(p) {
      const text = unsent.get(p.key);
      if (text === undefined) return { k: 'refused', code: 'gone' };
      unsent.delete(p.key);
      const i = blocks.findIndex((b) => b.key === p.key);
      if (i >= 0) blocks.splice(i, 1);
      emit();
      return { k: 'text', text, files: 0 };
    },
    dismissDecision() {},
    canDismiss: () => false,
    tick,
    drain() { while (tick()) { /* play */ } },
    push(...steps) { queue.push(...steps); },
    recorded,
  };
  return src;
}

/** The demo conversation: a question, steps, a streamed answer with code and a table, then an approval. */
export const DEMO_SCRIPT: ScriptStep[] = [
  { k: 'user', text: 'Make the dashboard show each service with its port, and restart the web one.' },
  { k: 'steps', label: 'Looked at 3 files', rows: [{ verb: 'Read', summary: '~/dash/services.json' }, { verb: 'Read', summary: '~/dash/index.html' }, { verb: 'Ran', summary: 'ss -ltnp' }] },
  {
    k: 'reply',
    chunk: 48,
    text: [
      '## What runs on atlas',
      'I found **three services**. The `web` one listens on port 3000; see [the service list](https://example.com/services) for details.',
      '| Service | Port | State |',
      '| --- | --- | --- |',
      '| web | 3000 | running |',
      '| api | 8080 | running |',
      '| db | 5432 | stopped |',
      'Here is the change to the page:',
      '```ts',
      "const services = await fetch('/services.json').then((r) => r.json());",
      'for (const s of services) {',
      '  table.append(row(s.name, s.port, s.state));',
      '}',
      '```',
      '- The table now updates every 10 seconds.',
      '- Stopped services are listed last.',
    ].join('\n'),
  },
  { k: 'gate', gate: { kind: 'confirm', risk: 'restarts a service', tool: 'bash', params: { command: 'systemctl --user restart web', cwd: '/home/ada/dash' }, offerSession: true } },
];

/** A long conversation for the scale benchmark: `turns` question/answer pairs of about `lines` lines each. */
export function longScript(turns: number, lines: number): ScriptStep[] {
  const out: ScriptStep[] = [];
  for (let i = 0; i < turns; i++) {
    out.push({ k: 'user', text: `Question ${i + 1}: what changed in run ${i + 1}?` });
    out.push({ k: 'reply', chunk: 1_000_000, text: Array.from({ length: lines }, (_, j) => (j % 9 === 0 ? `### Part ${j}` : `Line ${j + 1} of answer ${i + 1}: the service restarted cleanly and the checks passed.`)).join('\n\n') });
  }
  return out;
}
