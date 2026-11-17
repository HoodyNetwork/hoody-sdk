// fake.ts: a scripted agent behind the AgentIO seam, for the engine's tests, the fixture dev server and the shots.
// It speaks the real wire shapes (receipts, /state, /replay, stream envelopes with seq + incarnation + turn_id,
// gates with their envelope identity, command receipts), so the engine runs exactly as it does against an agent.
// Names come from core's fixtureWorld (Ada, Personal, atlas); nothing here is shown as real data.
import type { SignInResult } from '@core';
import type { AgentIO, AttachBody, StreamHandlers } from './data';
import type { Clock } from './engine';
import type { WireImage } from './attach';
import data from './fake.scripts.json';
import * as L from './logic';

type Rec = Record<string, unknown>;
interface Env { seq: number; incarnation: string; turn_id?: string; gate?: Rec; event: { type: string; data: Rec } }
interface Turn { id: string; state: string; code?: string; retryAt?: string; effects?: boolean; since: number; flush?: () => void }
interface Gate { id: string; generation: number; dnum: number; kind: 'confirm' | 'question'; payload: Rec; resume: (ok: boolean, answer?: string) => void; at: number; claimed?: boolean; helper?: string; turn?: string }
interface Msg { role: 'user' | 'assistant'; blocks: Rec[] }

/** A step of a scripted turn. */
export type Beat =
  | { k: 'text'; text: string }
  /** fail: is_error; output: what the tool answered; code: the result's error_code (hook_held, outcome_unknown). */
  | { k: 'tool'; name: string; summary: string; input?: Rec; fail?: boolean; output?: string; code?: string }
  | { k: 'confirm'; tool: string; params: Rec; detail?: string; risk?: string; offerSession?: boolean; denied?: Beat[] }
  | { k: 'question'; question: string; options: string[] }
  | { k: 'fail'; code: string; retryAt?: string }
  /** Parallel workflow lanes: every confirm parks at once; the turn goes on when all are decided. */
  | { k: 'lanes'; gates: { tool: string; params: Rec }[] }
  /** A helper's approval (helper_id on its frames): it never holds the turn, can outlive it, and is answered from
   *  the Agent; it resolves by itself after lifeMs. */
  | { k: 'helper'; tool: string; params: Rec; lifeMs: number }
  | { k: 'hold' }
  /** The agent compacting the conversation: event.compaction_started (`compact`), then event.compacted (`compacted`). */
  | { k: 'compact' }
  | { k: 'compacted' }
  /** The agent's /clear: the transcript is emptied and event.clear (then the cleared TODO list) goes out, as the agent does. */
  | { k: 'clear' };

/** One seeded session (FakeOptions.seed). */
export interface SeedSession { sid: string; turns: { text: string; script: Beat[] | ScriptName; pictures?: readonly SeedPicture[] }[] }
/** A picture a seeded message was sent with, as the agent's transcript names it: with `id` (64 hex) one it serves, without one it cannot. */
export interface SeedPicture { name: string; id?: string; media?: string; bytes?: number }
type ScriptName = 'dashboard' | 'approval' | 'question' | 'followUp' | 'failed' | 'markdown' | 'lanes' | 'helper' | 'stepFacts' | 'attach' | 'hostile' | 'access';

export interface FakeOptions {
  account: string;
  owner?: string;
  caps?: string[];
  /** The /version session_protocol_version (default 3, the first that reads `computer`). */
  protocol?: number;
  auth?: 'ready' | 'login' | 'other';
  health?: 'ok' | 'lost' | 'forbidden' | 'missing';
  computerStatus?: string;
  /** The computer row's realm_ids (absent: not said). */
  realms?: string[];
  /** The create's first answer is lost (C9). */
  createLost?: boolean;
  /** The first create never reaches the agent: its answer is lost and no session or key row is made (the retire then proves it was not admitted). */
  createLostBefore?: boolean;
  /** The first create is refused with this status and code; nothing is made and the key is consumed. */
  createRefuse?: { status: number; code: string };
  /** GET /acp/default: its body; 'fail' answers 500; absent: `{delegated_agent: ''}`. */
  acpDefault?: unknown;
  /** An attach carrying helper_gates to a session started without them answers 400 helper_gates_unavailable. */
  helperGatesUnavailable?: boolean;
  /** The first turn's answer is lost. */
  turnLost?: boolean;
  /** Follow-ups wait for the turn's end and start the next turn (never delivered at a step). */
  holdQueued?: boolean;
  /** With holdQueued: ms between the turn's end and the follow-ups' new turn (default: pace). */
  queuedGapMs?: number;
  /** The first follow-up command's answer is lost. */
  commandLost?: boolean;
  /** POST /commands/{id}/withdraw: absent = the agent's answer for the command's state (withdrawn while queued, taken once committed,
   *  ended once settled otherwise). 'missing': an agent without the route (404 not_found). 'lost': withdrawn, but the answer (and the event) is lost.
   *  'unconfirmed': 503 withdraw_unconfirmed and nothing changed. 'taken': already taken (nothing changed; delivered as usual).
   *  'ended': a stop superseded it first (quietly), so the answer is ended. 'writeFailed': 503 withdraw_write_failed, nothing changed. */
  withdraw?: 'missing' | 'lost' | 'unconfirmed' | 'taken' | 'ended' | 'writeFailed';
  /** POST /turns answers 409 turn_in_flight. */
  busy?: boolean;
  /** The session's approval policy is "always" (Strict): a turn asking ?policy=auto_approve is 409 approval_policy_active. */
  strictApproval?: boolean;
  /** GET approval names the session's mode, as the daemon's flattened SessionApproval does (core/agent/approval.ts): `default` or `always`, with `locked: false`.
   *  Absent: the answer carries only `yolo` (an older reading, which the engine takes as a mode not known: Strict until read). */
  /** The mode the approval read answers. Default 'default', as the agent always names one; null answers none (an agent that names no mode). */
  approvalMode?: 'default' | 'always' | (string & {}) | null;
  /** The stream fails right after it opens (connection lost mid-turn). */
  streamDrops?: boolean;
  /** The first decision's answer is lost. */
  decisionLost?: boolean;
  /** With decisionLost: how long (ms) before the applied decision shows on the stream (default: pace). */
  decisionLag?: number;
  /** Beats per turn, in order (the last one repeats). */
  script?: Beat[][];
  /** ms between beats (0 = synchronous chains through the clock). */
  pace?: number;
  /** Sessions that exist before anything is asked (the fixture pages' chats, by their ids). Each plays its turns in order at
   *  construction, synchronously whatever `pace` says; a last turn that parks (a confirm, a question, `hold`) stays running there.
   *  A turn's `script` is its beats or the name of one of `scripts`. */
  seed?: SeedSession[];
  /** /state omits pending_gate_ref for a gate parked less than this long ago (the gateway has not seen it yet). */
  refLagMs?: number;
  /** /state names no current_turn_id while a turn runs (the window after the slot is taken). */
  noTurnId?: boolean;
  /** Replay ring size (default 1024). */
  ringMax?: number;
  /** /state reads its watermark, then the daemon's content this many ms later (events between land in neither
   *  or both: the contract reads the watermark first). */
  stateGapMs?: number;
  /** /replay takes its tail this many ms after the call. */
  replayGapMs?: number;
  /** An answer takes this long to apply; meanwhile another answer is 409 gate_already_answered without details. */
  answerLagMs?: number;
  /** With answerLagMs: an answer in flight fails (the agent rolls it back; the question stays parked). */
  answerFail?: boolean;
  /** The first confirm is refused 429 rate_limited (the gate stays parked). */
  rateLimitOnce?: boolean;
  /** An unrelated frame on every live session this often (ms): a busy stream never goes quiet. */
  noiseMs?: number;
}

/** One scripted session. */
interface Ses { turns: Turn[]; msgs: Msg[]; bounds: number[]; yolo: boolean; running: string | null; starting: string | null; gate: Gate | null; lanes: Gate[]; helpers: Gate[]; keys: Map<string, unknown>; script: number; queued: { id: string; text: string }[]; holding: string | null; dormant: boolean; fenced: Set<string>; expired: Set<string> }

const DEFAULT_CAPS = ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding', 'approval_policy'];

// The scripted agent's own words are record data (what an agent would say), kept out of the code as JSON.
export const scripts = data as unknown as Record<ScriptName, Beat[]> & { markdownEdges: Beat[][]; seed: SeedSession[] };

export class FakeAgent implements AgentIO {
  private readonly o: FakeOptions;
  private readonly clock: Clock;
  private seq = 0;
  private inc = 'inc-1';
  private incN = 1;
  private ring: { sid: string; env: Env }[] = [];
  // Every open stream (one per tab): frames go to all of a session's subscribers.
  private subs = new Set<{ sid: string; h: StreamHandlers; drop: () => void }>();
  private ss = new Map<string, Ses>();
  /** Whether this agent has the session (the fixture lease routes answer for the sessions a fake agent made, pages/ai/fixtures.ts). */
  knows(sid: string): boolean { return this.ss.has(sid); }
  /** The pictures messages sent here carried, by session and the id the record gives each (the image route serves them). */
  private pics = new Map<string, { bytes: Uint8Array; media: string }>();
  picture(sid: string, id: string): { bytes: Uint8Array; media: string } | null { return this.pics.get(sid + '/' + id) ?? null; }
  /** The agent's policy is Strict (`always`, option strictApproval): every action is asked, whatever auto-approval says. A create
   *  asking Strict is not modelled per session (tests rely on its default answers). */
  private strictOn(_s: Ses): boolean { return this.o.strictApproval === true; }
  /** Decisions applied per gate id (tests: never more than one). */
  readonly applied = new Map<string, number>();
  private createdByKey = new Map<string, string>();
  /** Recovery by key: create keys fenced by a retire (the agent's create ledger fence), and the rows whose started mark was not written / that are in flight. */
  private createFenced = new Set<string>();
  private createAllocated = new Map<string, { inFlight: boolean }>();
  // The text each (session, key) admitted: the same key with other text is 422 idempotency_key_reused, as on the agent.
  private keyText = new Map<string, string>();
  /** A turn key's fingerprint: its text and its images (as the agent's turn ledger). */
  private keyPrint = new Map<string, string>();
  private n = 0;
  private lost = { create: false, turn: false, command: false, decision: false, rate: false, before: false, refuse: false };
  /** Gates that ended, by "id#generation": a later decision is answered from this record, as the agent does. */
  private ended = new Map<string, { kind: 'confirm' | 'question'; outcome: string; requestId?: string; approved?: boolean; scope?: boolean; answer?: string }>();
  private reqN = 0;
  /** Every request, for tests: [method, args]. */
  readonly log: Array<[string, unknown[]]> = [];
  aliveFlag = true;

  constructor(o: FakeOptions, clock: Clock) {
    this.o = o;
    this.clock = clock;
    if (o.seed?.length) this.plant(o.seed);
  }

  /** Seeding: beats run at once instead of through the clock. */
  private seeding = false;
  /** The seeded sessions, each turn played to its end (or to where it parks) before the next starts. */
  private plant(seed: SeedSession[]): void {
    this.seeding = true;
    try {
      for (const ses of seed) {
        if (this.ss.has(ses.sid)) continue;
        this.ss.set(ses.sid, { turns: [], msgs: [], bounds: [], yolo: false, running: null, starting: null, gate: null, lanes: [], helpers: [], keys: new Map(), script: 0, queued: [], holding: null, dormant: false, fenced: new Set(), expired: new Set() });
        const s = this.ss.get(ses.sid)!;
        for (const t of ses.turns) {
          if (s.running) break;                 // the turn before parked: it is the last one played
          const beats = typeof t.script === 'string' ? scripts[t.script] : t.script;
          const at = s.msgs.length;
          this.startTurn(ses.sid, t.text, 'turn-' + ++this.n, true, beats);
          // The agent's record of a message sent with pictures: one "[Image: name]" line each on top of the text, then one image
          // block each (never the bytes: those are the image route's).
          if (t.pictures?.length && s.msgs[at]?.role === 'user') {
            s.msgs[at] = { role: 'user', blocks: [
              { kind: 'text', text: t.pictures.map((p) => `[Image: ${p.name}]`).join('\n') + '\n\n' + t.text },
              ...t.pictures.map((p): Rec => (p.id ? { kind: 'image', image_id: p.id, media_type: p.media ?? 'image/png', ...(p.bytes ? { bytes: p.bytes } : {}) } : { kind: 'image' })),
            ] };
          }
        }
      }
    } finally { this.seeding = false; }
  }

  private rec(m: string, ...a: unknown[]) { this.log.push([m, a]); }
  private ok<T>(v: T): Promise<T> { return Promise.resolve(v); }
  private no(status: number, code: string, extra: Rec = {}): Promise<never> { return Promise.reject({ status, code, ...extra }); }
  private session(sid: string) {
    const s = this.ss.get(sid);
    if (!s) throw { status: 404, code: 'not_found' };
    return s;
  }
  private after(fn: () => void): void { if (this.seeding) fn(); else this.clock.set(fn, this.o.pace ?? 0); }

  // ---- stream plumbing ----
  private emit(sid: string, turnId: string | undefined, type: string, data: Rec, gate?: Rec): void {
    const env: Env = { seq: ++this.seq, incarnation: this.inc, event: { type, data } };
    if (turnId) env.turn_id = turnId;
    if (gate) env.gate = gate;
    this.ring.push({ sid, env });
    if (this.ring.length > (this.o.ringMax ?? 1024)) this.ring.shift();
    for (const x of [...this.subs]) if (x.sid === sid) x.h.frame(type.slice(6), JSON.stringify(env));
  }
  private parkGate(sid: string, tid: string | undefined, b: { k: 'confirm' | 'question'; tool?: string; params?: Rec; detail?: string; risk?: string; offerSession?: boolean; question?: string; options?: string[] }, resume: (ok: boolean) => void, helper?: string): Gate {
    const dnum = ++this.n, gid = 'gate-' + dnum;
    const ref = { id: gid, generation: 1, type: b.k };
    const payload: Rec = b.k === 'confirm'
      ? { gate_id: dnum, tool_name: b.tool, params: b.params, detail: b.detail ?? '', risk: b.risk ?? '', offer_session_allow: b.offerSession === true }
      : { question_id: dnum, question: b.question, options: b.options };
    if (helper) payload.helper_id = helper;
    const g: Gate = { id: gid, generation: 1, dnum, kind: b.k, payload, resume, at: this.clock.now(), ...(helper ? { helper } : {}), ...(tid ? { turn: tid } : {}) };
    this.emit(sid, tid, b.k === 'confirm' ? 'event.confirm_request' : 'event.user_question', payload, ref);
    return g;
  }
  private leadGates(s: { gate: Gate | null; lanes: Gate[] }): Gate[] { return [...(s.gate ? [s.gate] : []), ...s.lanes]; }

  // ---- scripted turns ----
  private startTurn(sid: string, text: string, turnId: string, tag: boolean, given?: Beat[]): void {
    const s = this.session(sid);
    const t: Turn = { id: turnId, state: 'dispatched', since: this.seq + 1 };
    s.turns.unshift(t);
    s.running = turnId;
    s.msgs.push({ role: 'user', blocks: [{ kind: 'text', text }] });
    // With no script of the test's own, a page's "who can open" ask (its context opens with the access snapshot's first
    // words) gets the short list such an ask is answered with, so the fixtures show that flow as it reads.
    const list = this.o.script && this.o.script.length ? this.o.script : [/\u2060\nAccess rules of /.test(text) ? scripts.access : scripts.dashboard];
    const beats = (given ?? (list[Math.min(s.script, list.length - 1)] as Beat[])).slice();
    if (!given) s.script++;
    const tid = tag ? turnId : undefined;
    let segText = '';
    const assistant: Msg = { role: 'assistant', blocks: [] };
    s.msgs.push(assistant);
    const flushText = () => { if (segText) { assistant.blocks.push({ kind: 'text', text: segText }); segText = ''; } };
    // A stop or a cancel ends the turn from outside: its streamed text still goes into the transcript.
    t.flush = flushText;
    const next = (): void => {
      if (s.running !== turnId) return;
      // follow-ups waiting: delivered at this step
      if (s.queued.length && !this.o.holdQueued) {
        const q = s.queued.splice(0);
        flushText();
        for (const c of q) { s.msgs.push({ role: 'user', blocks: [{ kind: 'text', text: c.text }] }); this.setCmd(s, c.id, { state: 'committed', how: 'next_step', turn_id: turnId }); }
        this.emit(sid, tid, 'event.command_committed', { command_ids: q.map((c) => c.id), turn_id: turnId, how: 'next_step' });
        beats.unshift(...scripts.followUp);
      }
      const b = beats.shift();
      if (!b) return this.endTurn(sid, t, 'completed', tid, flushText);
      if (b.k === 'hold') { s.holding = turnId; return; }
      if (b.k === 'compact') { flushText(); this.emit(sid, tid, 'event.compaction_started', { summarized_turns: s.bounds.length, kept_turns: 1, auto: false }); return this.after(next); }
      if (b.k === 'compacted') { this.emit(sid, tid, 'event.compacted', { from_tokens: 0, to_tokens: 0, summarized_turns: s.bounds.length, kept_turns: 1, auto: false }); return this.after(next); }
      if (b.k === 'clear') {
        segText = ''; s.msgs = []; s.bounds = [];
        this.emit(sid, tid, 'event.clear', {});
        this.emit(sid, tid, 'event.todo_list_updated', { todos: [] });
        return this.after(next);
      }
      if (b.k === 'text') { segText += b.text; this.emit(sid, tid, 'event.stream_chunk', { text: b.text }); return this.after(next); }
      if (b.k === 'fail') {
        t.code = b.code; t.retryAt = b.retryAt;
        this.emit(sid, tid, 'event.error', { code: b.code, ...(b.retryAt ? { retry_at: b.retryAt } : {}) });
        // The agent's turn close: when nothing of the model's answer was saved after the last user message,
        // the failed turn's transcript ends with "[response failed: <code>]" after any partial text, and the marker is streamed too.
        const tail = s.msgs[s.msgs.length - 1];
        const userTail = !!tail && (tail.role === 'user' || (tail === assistant && !assistant.blocks.length));
        if (userTail) {
          const marker = `[response failed: ${b.code || 'error'}]`;
          const chunk = segText.trim() ? '\n\n' + marker : marker;
          this.emit(sid, tid, 'event.stream_chunk', { text: chunk });
          const text = segText + chunk;
          segText = '';
          if (tail === assistant) assistant.blocks.push({ kind: 'text', text });
          else s.msgs.push({ role: 'assistant', blocks: [{ kind: 'text', text }] });
        }
        return this.endTurn(sid, t, 'failed', tid, flushText);
      }
      if (b.k === 'tool') {
        flushText();
        const id = 'tool' + ++this.n;
        assistant.blocks.push({ kind: 'tool_use', tool_id: id, tool_name: b.name, input: b.input ?? {} });
        this.emit(sid, tid, 'event.tool_call', { tool_id: id, name: b.name, summary: b.summary, ...(b.input && Object.keys(b.input).length ? { arguments: b.input } : {}) });
        this.after(() => {
          if (s.running !== turnId) return;
          const facts = { ...(b.output !== undefined ? { output: b.output } : {}), ...(b.code ? { error_code: b.code } : {}) };
          s.msgs.push({ role: 'user', blocks: [{ kind: 'tool_result', tool_id: id, ...(b.fail ? { is_error: true } : {}), ...facts }] });
          this.emit(sid, tid, 'event.tool_result', { tool_id: id, is_error: b.fail === true, ...facts });
          this.after(next);
        });
        return;
      }
      if (b.k === 'confirm' || b.k === 'question') {
        if (b.k === 'confirm' && s.yolo && !this.strictOn(s)) return this.after(next);
        flushText();
        s.gate = this.parkGate(sid, tid, b, (ok) => {
          s.gate = null;
          if (!ok && b.k === 'confirm') { beats.splice(0, beats.length, ...(b.denied ?? [])); }
          this.after(next);
        });
        return;
      }
      if (b.k === 'lanes') {
        if (s.yolo && !this.strictOn(s)) return this.after(next);
        flushText();
        let open = b.gates.length;
        for (const lg of b.gates) {
          const g: Gate = this.parkGate(sid, tid, { k: 'confirm', tool: lg.tool, params: lg.params }, () => {
            s.lanes = s.lanes.filter((x) => x !== g);
            if (--open === 0) this.after(next);
          });
          s.lanes.push(g);
        }
        return;
      }
      if (b.k === 'helper') {
        const hid = 'helper-' + ++this.n;
        const g: Gate = this.parkGate(sid, tid, { k: 'confirm', tool: b.tool, params: b.params }, () => { s.helpers = s.helpers.filter((x) => x !== g); }, hid);
        s.helpers.push(g);
        this.clock.set(() => {
          if (!s.helpers.includes(g)) return;
          s.helpers = s.helpers.filter((x) => x !== g);
          this.emit(sid, g.turn && s.running === g.turn ? tid : undefined, 'event.gate_resolved', { kind: 'confirm', gate_id: g.dnum, helper_id: hid, outcome: 'answered', provenance: 'decision', decision: { approved: true, persist_dirs: false, session_scope: false, trust_computer: false } });
        }, b.lifeMs);
        return this.after(next);
      }
    };
    this.after(next);
  }
  private endTurn(sid: string, t: Turn, state: string, tid: string | undefined, flush: () => void): void {
    const s = this.session(sid);
    flush();
    t.state = state;
    if (state === 'cancelled') t.effects = true;
    s.running = null;
    s.gate = null;
    s.lanes = [];
    if (s.msgs.length) s.bounds.push(s.msgs.length - 1);
    this.emit(sid, tid ?? t.id, 'event.agent_done', { outcome: state, ...(t.code ? { error_code: t.code } : {}) });
    // queued follow-ups start the next turn
    const go = () => {
      if (!s.queued.length || s.running) return;
      const q = s.queued.splice(0);
      const nt = 'turn-' + ++this.n;
      for (const c of q) this.setCmd(s, c.id, { state: 'committed', how: 'new_turn', turn_id: nt });
      // The turn exists before its commit event names it (a receipt read at once finds it).
      this.startTurn(sid, q.map((c) => c.text).join('\n'), nt, false);
      this.emit(sid, undefined, 'event.command_committed', { command_ids: q.map((c) => c.id), turn_id: nt, how: 'new_turn' });
    };
    if (this.o.holdQueued) this.clock.set(go, this.o.queuedGapMs ?? this.o.pace ?? 0); else go();
  }
  private setCmd(s: { keys: Map<string, unknown> }, id: string, p: Rec): void {
    for (const [k, v] of s.keys) if (L.isObj(v) && v.command_id === id) s.keys.set(k, { ...v, ...p });
  }

  // ---- AgentIO ----
  alive(): boolean { return this.aliveFlag; }
  health() {
    this.rec('health');
    const h = this.o.health ?? 'ok';
    if (h === 'lost') return Promise.reject({ status: 0, code: null });
    if (h === 'forbidden') return this.no(403, 'forbidden');
    if (h === 'missing') return this.no(404, 'not_found');
    return this.ok({ status: 'ok' });
  }
  version() {
    this.rec('version');
    return this.ok({ api_version: '1', session_protocol_version: this.o.protocol ?? 3, capabilities: (this.o.caps ?? DEFAULT_CAPS).map((name) => ({ name, supported: true, available: true })) });
  }
  authStatus() {
    this.rec('authStatus');
    const a = this.o.auth ?? 'ready';
    if (a === 'other') return this.ok({ auth_active: true, account_id: 'someoneelse0000000000000', owner_fingerprint: 'fp-x', restriction: 'none' });
    if (a === 'login') return this.ok({ auth_active: false });
    return this.ok({ auth_active: true, account_id: this.o.account, owner_fingerprint: this.o.owner ?? 'fp-ada', restriction: 'none', realm_isolation_by_realm: {} });
  }
  probe(realm: string) { this.rec('probe', realm); return this.ok({ items: [] }); }
  // Core's sign-in without a key to give (no cached 2FA token, a token session): refused, nothing sent.
  signIn(): Promise<SignInResult> { this.rec('signIn'); return Promise.resolve({ kind: 'refused', reason: 'key' }); }
  sessions(realm: string) {
    this.rec('sessions', realm);
    const items = [...this.ss.entries()].map(([id, s]) => {
      const first = s.msgs.find((m) => m.role === 'user' && m.blocks.some((b) => b.kind === 'text'));
      const t = first ? (first.blocks.find((b) => b.kind === 'text') as Rec).text : undefined;
      return { id, ...(t ? { first_message: t } : {}) };
    });
    return this.ok({ items, meta: { total: items.length } });
  }
  /** Reopening a session (POST /sessions with `attach`): no key, no entry; a session this agent does not have is 404. */
  acpDefault(realm: string) {
    this.rec('acpDefault', realm);
    if (this.o.acpDefault === 'fail') return this.no(500, 'internal');
    return this.ok(this.o.acpDefault === undefined ? { delegated_agent: '' } : this.o.acpDefault);
  }
  attach(body: AttachBody, realm: string) {
    this.rec('attach', body, realm);
    if (!this.ss.has(body.attach)) return this.no(404, 'not_found');
    if (this.o.helperGatesUnavailable && L.isObj(body) && (body as { helper_gates?: unknown }).helper_gates === true) return this.no(400, 'helper_gates_unavailable');
    // An attach ASSERTS an approval policy, never sets one: a mode other than the chat's is
    // refused; no `approval` asserts nothing.
    const asserted = L.isObj(body) ? (body as { approval?: { mode?: unknown } }).approval : undefined;
    if (asserted !== undefined) {
      const cur = this.o.approvalMode === 'always' || this.o.strictApproval ? 'always' : 'default';
      const mode = asserted?.mode === undefined || asserted.mode === '' ? 'default' : asserted.mode;
      if (mode !== cur) return this.no(409, 'approval_policy_unsatisfiable');
    }
    this.ss.get(body.attach)!.dormant = false;
    return this.ok({ session_id: body.attach, started: { realm_selector: body.realm, computer_id: '', owner_fingerprint: this.o.owner ?? 'fp-ada' } });
  }
  create(body: L.CreateBody | L.ForkBody, key: string, realm: string) {
    // As the route's body list: a create carrying `attach` is refused before it leaves.
    if (L.isObj(body) && 'attach' in body) return Promise.reject({ kind: 'not_sent', notSent: true, code: 'ROUTE_BODY' });
    this.rec('create', body, key, realm);
    // A retired key is refused before any session is reserved, whatever arrives later with it.
    if (this.createFenced.has(key)) return this.no(409, 'create_key_retired', { details: { admitted: 'false' } });
    if (this.o.createLostBefore && !this.lost.before) { this.lost.before = true; return Promise.reject({ pending: true, kind: 'pending' }); }
    if (this.o.createRefuse && !this.lost.refuse) { this.lost.refuse = true; return this.no(this.o.createRefuse.status, this.o.createRefuse.code); }
    let sid = this.createdByKey.get(key);
    let echo: Record<string, unknown> = {};
    if (!sid) {
      // A fork: the parent must be LIVE here (unknown, other realm or ended = the uniform 404), the index 0-based
      // within the parent's turns (absent = the last turn; out of range = 400 bad_request); nothing is made on a refusal.
      const parent = 'fork' in body ? (body as L.ForkBody).fork : undefined;
      const idxIn = 'fork' in body ? (body as L.ForkBody).fork_turn_idx : undefined;
      let seed: { msgs: Msg[]; bounds: number[] } = { msgs: [], bounds: [] };
      if (parent !== undefined) {
        const src = this.ss.get(parent);
        // The key is reserved before the parent is judged: a refused fork leaves its row allocated, not in
        // flight, with no session; a read or retire of the key says so (it is not a miss, and it is not admitted).
        if (!src || src.dormant) { this.reservedBare.add(key); return this.no(404, 'not_found'); }
        if (idxIn !== undefined && (!Number.isInteger(idxIn) || idxIn < 0 || idxIn >= src.bounds.length)) { this.reservedBare.add(key); return this.no(400, 'bad_request'); }
        const idx = idxIn === undefined ? src.bounds.length - 1 : idxIn;
        if (idx >= 0) seed = { msgs: JSON.parse(JSON.stringify(src.msgs.slice(0, (src.bounds[idx] as number) + 1))) as Msg[], bounds: src.bounds.slice(0, idx + 1) };
        // The started ack names the parent and the resolved index; the index is omitted when it is 0 (omitempty).
        echo = { parent_id: parent, ...(idx > 0 ? { fork_turn_idx: idx } : {}) };
      }
      sid = 'sess-' + ++this.n;
      this.createdByKey.set(key, sid);
      this.ss.set(sid, { turns: [], msgs: seed.msgs, bounds: seed.bounds, yolo: false, running: null, starting: null, gate: null, lanes: [], helpers: [], keys: new Map(), script: 0, queued: [], holding: null, dormant: false, fenced: new Set(), expired: new Set() });
      this.forkEcho.set(sid, echo);
      this.noise();
    }
    if (this.o.createLost && !this.lost.create) { this.lost.create = true; return Promise.reject({ pending: true, kind: 'pending' }); }
    return this.ok({ session_id: sid, started: { realm_selector: body.realm, computer_id: '', owner_fingerprint: this.o.owner ?? 'fp-ada', ...(this.forkEcho.get(sid) ?? {}) } });
  }
  /** Keys a refused fork reserved without making a session: the row reads allocated, not in flight, no session id. */
  private reservedBare = new Set<string>();
  /** What a fork's started ack says about its origin, per created session (a replay answers the same). */
  private forkEcho = new Map<string, Record<string, unknown>>();
  turn(sid: string, text: string, key: string, _realm?: string, attachments?: WireImage[], policy?: 'auto_approve') {
    this.rec('turn', sid, text, key, ...(attachments ? [attachments] : []), ...(policy ? [{ policy }] : []));
    // The agent's fingerprint covers the attachments and the gate policy: the same key with
    // other bytes or another policy is a conflict.
    const print = text + '\u0000' + JSON.stringify(attachments ?? []) + '\u0000' + (policy ?? '');
    let s;
    try { s = this.session(sid); } catch (e) { return Promise.reject(e); }
    // The turn route serves a live session only: a dormant session answers 404 not_found
    // until it is attached.
    if (s.dormant) return this.no(404, 'not_found');
    if (s.fenced.has(key)) return this.no(409, 'turn_key_retired', { details: { admitted: 'false' } });
    const seen = s.keys.get(key);
    if (L.isObj(seen)) return this.keyPrint.get(sid + ' ' + key) === print ? this.ok({ ...seen, duplicate: true }) : this.no(422, 'idempotency_key_reused');
    if (policy && this.strictOn(s)) return this.no(409, 'approval_policy_active');
    if (this.o.busy) return this.no(409, 'turn_in_flight');
    if (s.running || s.starting) return this.no(409, 'turn_in_flight');
    const id = 'turn-' + ++this.n;
    const r = { turn_id: id, state: 'accepted', stream_url: '/api/v1/agent/sessions/' + sid + '/stream?since=' + this.seq + '&incarnation=' + this.inc };
    s.keys.set(key, r);
    this.keyText.set(sid + ' ' + key, text);
    this.keyPrint.set(sid + ' ' + key, print);
    const at = s.msgs.length;
    this.startTurn(sid, text, id, true);
    // The agent's record of a message sent with pictures (as a seeded one): a name line each above the text, one image block each,
    // the bytes kept for the image route under an id good in this chat only.
    if (attachments?.length && s.msgs[at]?.role === 'user') {
      const blocks = attachments.map((a): Rec => {
        const pid = (++this.n).toString(16).padStart(64, '0');
        const bytes = Uint8Array.from(atob(a.data), (c) => c.charCodeAt(0));
        this.pics.set(sid + '/' + pid, { bytes, media: a.media_type });
        return { kind: 'image', image_id: pid, media_type: a.media_type, bytes: bytes.length };
      });
      s.msgs[at] = { role: 'user', blocks: [{ kind: 'text', text: attachments.map((a) => `[Image: ${a.name}]`).join('\n') + (text ? '\n\n' + text : '') }, ...blocks] };
    }
    if (this.o.turnLost && !this.lost.turn) { this.lost.turn = true; return Promise.reject({ status: 502, pending: true }); }
    return this.ok(r);
  }
  turns(sid: string) {
    this.rec('turns', sid);
    try { return this.ok({ session_id: sid, turns: this.session(sid).turns.map((t) => ({ turn_id: t.id, state: t.state, ...(t.code ? { error_code: t.code } : {}) })) }); } catch (e) { return Promise.reject(e); }
  }
  receipt(sid: string, turnId: string) {
    this.rec('receipt', sid, turnId);
    let s;
    try { s = this.session(sid); } catch (e) { return Promise.reject(e); }
    const t = s.turns.find((x) => x.id === turnId);
    if (!t) return this.no(404, 'not_found');
    return this.ok({ turn_id: t.id, state: t.state, ...(t.code ? { error_code: t.code } : {}), ...(t.retryAt ? { retry_at: t.retryAt } : {}), ...(t.effects ? { effects_may_have_occurred: true } : {}) });
  }
  /** A message from elsewhere that declines what waits (another app of the person's sending with on_gate deny): every lead gate
   *  parked now, in every session, is declined (helpers' gates are not the lead's). This page's own messages never do this.
   *  (The agent resolves first and then says so: a snapshot whose watermark is past the event never shows it.) */
  declineGates(): void {
    for (const [sid, s] of this.ss) {
      for (const g of this.leadGates(s)) { this.ended.set(g.id + '#' + g.generation, { kind: g.kind, outcome: 'declined' }); g.resume(false); this.emit(sid, s.running ?? undefined, 'event.gate_resolved', { kind: g.kind, [g.kind === 'confirm' ? 'gate_id' : 'question_id']: g.dnum, outcome: 'cancelled', provenance: 'cancelled' }); }
    }
  }
  command(sid: string, text: string, key: string) {
    this.rec('command', sid, text, key);
    let s;
    try { s = this.session(sid); } catch (e) { return Promise.reject(e); }
    // As withdraw: a sleeping chat's command routes answer 409 session_closed (commandSession), nothing admitted.
    if (s.dormant) return this.no(409, 'session_closed');
    if (s.fenced.has(key)) return this.no(409, 'command_key_retired', { details: { admitted: 'false' } });
    const seen = s.keys.get(key);
    if (L.isObj(seen)) return seen.kind === 'message' && this.keyText.get(sid + ' ' + key) === text ? this.ok({ ...seen, duplicate: true }) : this.no(422, 'idempotency_key_reused');
    const id = 'cmd_' + ++this.n;
    const r: Rec = { command_id: id, kind: 'message', state: 'queued', admitted_at: '2026-10-23T05:00:00Z' };
    s.keys.set(key, r);
    this.keyText.set(sid + ' ' + key, text);
    // on_gate wait: a parked gate is left alone; the message stays queued until the turn's next step, after the gate is answered.
    if (s.running || s.starting) s.queued.push({ id, text });
    else {
      const nt = 'turn-' + ++this.n;
      r.state = 'committed'; r.how = 'new_turn'; r.turn_id = nt;
      // The start is pending until the clock runs it; a stop before then cancels it (s.starting).
      s.starting = nt;
      this.after(() => {
        if (s.starting !== nt) return;
        s.starting = null;
        this.emit(sid, undefined, 'event.command_committed', { command_ids: [id], turn_id: nt, how: 'new_turn' });
        this.startTurn(sid, text, nt, false);
      });
    }
    if (this.o.commandLost && !this.lost.command) { this.lost.command = true; return Promise.reject({ status: 0 }); }
    return this.ok({ ...r });
  }
  // An interrupt, as the agent carries it out: the work the chat was running when it was sent
  // is stopped (a parked lead gate is released as cancelled, the running turn ends cancelled, a committed start not yet running never
  // starts), then the text is delivered as a NEW turn. Queued follow-ups stay queued. The receipt says whether work was stopped
  // (interrupted: false = nothing ran, nothing was parked, a plain send: a parked helper gate alone counts as work, as in the daemon). The same key with the same kind and text answers the stored receipt.
  interrupt(sid: string, text: string, key: string) {
    this.rec('interrupt', sid, text, key);
    let s;
    try { s = this.session(sid); } catch (e) { return Promise.reject(e); }
    if (s.fenced.has(key)) return this.no(409, 'command_key_retired', { details: { admitted: 'false' } });
    const seen = s.keys.get(key);
    if (L.isObj(seen)) return seen.kind === 'interrupt' && this.keyText.get(sid + ' ' + key) === text ? this.ok({ ...seen, duplicate: true }) : this.no(422, 'idempotency_key_reused');
    const id = 'cmd_' + ++this.n;
    const running = s.running;
    const t = running ? s.turns.find((x) => x.id === running) : undefined;
    const parked = [...this.leadGates(s), ...s.helpers];
    s.gate = null; s.lanes = []; s.helpers = [];
    for (const g of parked) this.ended.set(g.id + '#' + g.generation, { kind: g.kind, outcome: 'superseded' });
    for (const g of parked) this.emit(sid, running ?? undefined, 'event.gate_resolved', { kind: g.kind, [g.kind === 'confirm' ? 'gate_id' : 'question_id']: g.dnum, outcome: 'cancelled', provenance: 'cancelled', ...(g.helper ? { helper_id: g.helper } : {}) });
    if (t && running) this.endTurn(sid, t, 'cancelled', running, t.flush ?? (() => {}));
    const pending = s.starting;
    if (pending) {
      s.starting = null;
      s.turns.unshift({ id: pending, state: 'cancelled', since: this.seq + 1 });
      this.emit(sid, pending, 'event.agent_done', { outcome: 'cancelled' });
    }
    const nt = 'turn-' + ++this.n;
    const r: Rec = { command_id: id, kind: 'interrupt', state: 'committed', how: 'new_turn', turn_id: nt, interrupted: !!(t || pending || parked.length), admitted_at: '2026-10-23T05:00:00Z' };
    s.keys.set(key, r);
    this.keyText.set(sid + ' ' + key, text);
    s.starting = nt;
    this.after(() => {
      if (s.starting !== nt) return;
      s.starting = null;
      this.emit(sid, undefined, 'event.command_committed', { command_ids: [id], turn_id: nt, how: 'new_turn' });
      this.startTurn(sid, text, nt, false);
    });
    if (this.o.commandLost && !this.lost.command) { this.lost.command = true; return Promise.reject({ status: 0 }); }
    return this.ok({ ...r });
  }
  // A stop, as the agent carries it out: every follow-up not yet delivered is superseded, every parked gate is
  // resolved superseded, the running turn ends cancelled (its earlier steps may have run), and the receipt lists
  // the session as stopped (empty when nothing was running, as on the agent). Nothing scheduled before it starts later.
  stop(sid: string, key: string) {
    this.rec('stop', sid, key);
    let s;
    try { s = this.session(sid); } catch (e) { return Promise.reject(e); }
    if (s.fenced.has(key)) return this.no(409, 'command_key_retired', { details: { admitted: 'false' } });
    const seen = s.keys.get(key);
    if (L.isObj(seen)) return seen.kind === 'stop' ? this.ok({ ...seen, duplicate: true }) : this.no(422, 'idempotency_key_reused');
    // As the agent: the stop's own id names what it superseded, on each receipt and in one event.command_settled.
    const stopId = 'cmd_' + ++this.n;
    const superseded = s.queued.splice(0);
    for (const q of superseded) this.setCmd(s, q.id, { state: 'superseded', reason: 'stop', superseded_by: stopId });
    if (superseded.length) this.emit(sid, s.running ?? undefined, 'event.command_settled', { command_ids: superseded.map((q) => q.id), state: 'superseded', reason: 'stop', superseded_by: stopId });
    const running = s.running;
    const t = running ? s.turns.find((x) => x.id === running) : undefined;
    // (The agent resolves first and then says so.)
    const parked = [...this.leadGates(s), ...s.helpers];
    s.gate = null; s.lanes = []; s.helpers = [];
    for (const g of parked) this.ended.set(g.id + '#' + g.generation, { kind: g.kind, outcome: 'superseded' });
    for (const g of parked) this.emit(sid, running ?? undefined, 'event.gate_resolved', { kind: g.kind, [g.kind === 'confirm' ? 'gate_id' : 'question_id']: g.dnum, outcome: 'cancelled', provenance: 'cancelled', ...(g.helper ? { helper_id: g.helper } : {}) });
    if (t && running) this.endTurn(sid, t, 'cancelled', running, t.flush ?? (() => {}));
    // A committed message whose turn has not started yet: it never starts; its turn ends cancelled with no step run.
    const pending = s.starting;
    if (pending) {
      s.starting = null;
      s.turns.unshift({ id: pending, state: 'cancelled', since: this.seq + 1 });
      this.emit(sid, pending, 'event.agent_done', { outcome: 'cancelled' });
    }
    const r: Rec = {
      command_id: stopId, kind: 'stop', state: 'committed', admitted_at: '2026-10-23T05:00:00Z',
      stopped: t || pending ? [{ kind: 'session', id: sid, outcome: 'stopped' }] : [],
    };
    s.keys.set(key, r);
    return this.ok({ ...r });
  }
  // A queued message taken back, as the agent decides it under its queue lock: withdrawn while it
  // still waits (superseded, reason withdrawn, never delivered), taken once a delivery has it, ended when it had settled otherwise.
  withdraw(sid: string, commandId: string) {
    this.rec('withdraw', sid, commandId);
    const mode = this.o.withdraw;
    if (mode === 'missing') return this.no(404, 'not_found');
    if (mode === 'unconfirmed') return this.no(503, 'withdraw_unconfirmed');
    if (mode === 'writeFailed') return this.no(503, 'withdraw_write_failed', { notApplied: true });
    let s;
    try { s = this.session(sid); } catch (e) { return Promise.reject(e); }
    // The command routes serve a live chat only: one the caller can see that is asleep is 409 session_closed,
    // nothing taken back.
    if (s.dormant) return this.no(409, 'session_closed');
    const find = (): Rec | null => { for (const v of s.keys.values()) if (L.isObj(v) && v.command_id === commandId) return v as Rec; return null; };
    const r0 = find();
    if (!r0) return this.no(404, 'not_found');
    if (r0.kind !== 'message') return this.no(409, 'command_not_withdrawable');
    const i = s.queued.findIndex((q) => q.id === commandId);
    if (mode === 'taken') return this.ok({ outcome: 'taken', command: { ...r0 } });
    if (mode === 'ended' && i >= 0) {
      s.queued.splice(i, 1);
      this.setCmd(s, commandId, { state: 'superseded', reason: 'stop' });
      return this.ok({ outcome: 'ended', command: { ...find() } });
    }
    if (i >= 0) {
      s.queued.splice(i, 1);
      this.setCmd(s, commandId, { state: 'superseded', reason: 'withdrawn' });
      // 'lost': the page's stream misses the announcement too, so only a read can tell.
      if (mode === 'lost') return Promise.reject({ status: 0 });
      this.emit(sid, s.running ?? undefined, 'event.command_settled', { command_ids: [commandId], state: 'superseded', reason: 'withdrawn' });
      return this.ok({ outcome: 'withdrawn', command: { ...find() } });
    }
    const st = String(r0.state);
    if (st === 'superseded' && r0.reason === 'withdrawn') return this.ok({ outcome: 'withdrawn', command: { ...r0 } });
    return this.ok({ outcome: st === 'committed' ? 'taken' : 'ended', command: { ...r0 } });
  }
  commandGet(sid: string, commandId: string) {
    this.rec('commandGet', sid, commandId);
    let s;
    try { s = this.session(sid); } catch (e) { return Promise.reject(e); }
    for (const v of s.keys.values()) if (L.isObj(v) && v.command_id === commandId) return this.ok({ ...v });
    return this.no(404, 'not_found');
  }
  // ---- Reads and retires by key (the agent's by-key routes). A read changes nothing; a retire fences a key that admitted
  // nothing, and answers what an admitted key became instead. Neither ever runs the original request.
  private keyReceipt(s: Ses, key: string, kind: 'turn' | 'command'): Rec | null {
    const v = s.keys.get(key);
    if (!L.isObj(v)) return null;
    if (kind === 'command') return typeof v.command_id === 'string' ? { ...v } : null;
    if (typeof v.turn_id !== 'string' || typeof v.command_id === 'string') return null;
    const t = s.turns.find((x) => x.id === v.turn_id);
    return { turn_id: v.turn_id, state: t ? t.state : 'accepted', ...(t?.code ? { error_code: t.code } : {}), ...(t?.retryAt ? { retry_at: t.retryAt } : {}), ...(t?.effects ? { effects_may_have_occurred: true } : {}) };
  }
  private byKey(sid: string, key: string, kind: 'turn' | 'command', retire: boolean) {
    this.rec(kind + (retire ? 'KeyRetire' : 'ByKey'), sid, key);
    let s;
    try { s = this.session(sid); } catch (e) { return Promise.reject(e); }
    const r = this.keyReceipt(s, key, kind);
    if (r) return this.ok(retire ? { retired: false, admitted: 'true', [kind]: r } : r);
    const fenced = s.fenced.has(key), expired = s.expired.has(key);
    if (!retire) return this.no(404, kind + '_not_found', { details: fenced ? { retired: true, admitted: expired ? 'unknown' : 'false' } : { retired: false } });
    if (expired) { s.fenced.add(key); return this.ok({ retired: true, admitted: 'unknown' }); }
    s.fenced.add(key);
    return this.ok({ retired: true, admitted: 'false' });
  }
  turnByKey(sid: string, key: string) { return this.byKey(sid, key, 'turn', false); }
  turnKeyRetire(sid: string, key: string) { return this.byKey(sid, key, 'turn', true); }
  commandByKey(sid: string, key: string) { return this.byKey(sid, key, 'command', false); }
  commandKeyRetire(sid: string, key: string) { return this.byKey(sid, key, 'command', true); }
  createKeyGet(key: string, realm: string) {
    this.rec('createKeyGet', key, realm);
    if (this.createFenced.has(key)) return this.ok({ state: 'retired', admitted: 'false' });
    const sid = this.createdByKey.get(key);
    if (!sid && this.reservedBare.has(key)) return this.ok({ state: 'allocated', in_flight: false });
    if (!sid) return this.no(404, 'create_not_found');
    const al = this.createAllocated.get(key);
    // A started row whose session no longer resolves (a draft discarded after 5 minutes, or deleted) reads as a miss, as on the agent.
    if (al) return this.ok({ state: 'allocated', in_flight: al.inFlight, ...(!al.inFlight && this.ss.has(sid) ? { session_id: sid } : {}) });
    if (!this.ss.has(sid)) return this.no(404, 'create_not_found');
    return this.ok({ state: 'started', session_id: sid });
  }
  createKeyRetire(key: string, realm: string) {
    this.rec('createKeyRetire', key, realm);
    if (this.createFenced.has(key)) return this.ok({ retired: true, admitted: 'false' });
    const sid = this.createdByKey.get(key);
    if (!sid && this.reservedBare.has(key)) return this.ok({ retired: false, admitted: 'unknown', state: 'allocated', in_flight: false });
    if (!sid) { this.createFenced.add(key); return this.ok({ retired: true, admitted: 'false' }); }
    const al = this.createAllocated.get(key);
    if (al) return this.ok({ retired: false, admitted: 'unknown', state: 'allocated', in_flight: al.inFlight, ...(!al.inFlight && this.ss.has(sid) ? { session_id: sid } : {}) });
    return this.ok({ retired: false, admitted: 'true', state: 'started', in_flight: false, ...(this.ss.has(sid) ? { session_id: sid } : {}) });
  }
  /** Tests: a create row the agent holds as allocated (its started mark not written, or the create still in flight). */
  allocate(key: string, inFlight: boolean): void { this.createAllocated.set(key, { inFlight }); }
  /** Tests: the session of a create key is gone (discarded after 5 minutes, or deleted); the key's row stays. */
  dropSession(sid: string): void { this.ss.delete(sid); }
  /** Tests: the agent no longer keeps this key (a receipt expired): a retire of it reads admitted "unknown". */
  expireKey(sid: string, key: string): void { const s = this.ss.get(sid); if (s) { s.keys.delete(key); s.expired.add(key); } }
  /** Tests: sessions the agent holds, and the rows its ledgers hold (one per admitted key). */
  sessionCount(): number { return this.ss.size; }
  ledgerRows(sid: string, kind?: 'turn' | 'command'): number {
    const s = this.ss.get(sid);
    if (!s) return 0;
    return [...s.keys.values()].filter((v) => !kind || (L.isObj(v) && (kind === 'command' ? typeof v.command_id === 'string' : typeof v.turn_id === 'string' && typeof v.command_id !== 'string'))).length;
  }

  state(sid: string) {
    this.rec('state', sid);
    let s;
    try { s = this.session(sid); } catch (e) { return Promise.reject(e); }
    if (s.dormant) return this.ok({ session_id: sid, live: false, state: 'idle', current_turn_id: null });
    // The watermark first, the daemon's content later (the contract's order).
    const wm = this.seq, inc = this.inc, gap = this.o.stateGapMs ?? 0;
    if (!gap) return this.ok(this.stateBody(sid, s, wm, inc));
    return new Promise((res) => this.clock.set(() => res(this.stateBody(sid, s, wm, inc)), gap));
  }
  private stateBody(sid: string, s: Ses, wm: number, inc: string): Rec {
    const t = s.running ? s.turns.find((x) => x.id === s.running) : null;
    const now = this.clock.now(), lag = this.o.refLagMs ?? 0;
    const desc = (g: Gate): Rec => ({ type: g.kind, ...g.payload, generation: 7 });   // generation here: the lease's, never the gate's
    const ref = (g: Gate): Rec | null => (now - g.at < lag ? null : { id: g.id, generation: g.generation, type: g.kind });
    const lead = this.leadGates(s);
    const body: Rec = {
      session_id: sid, live: true, incarnation: inc, seq: wm,
      state: lead.length ? 'parked' : s.running ? 'running' : 'idle',
      current_turn_id: s.running && !this.o.noTurnId ? s.running : null,
      ...(t ? { turn_since: t.since } : {}),
    };
    const g0 = lead[0];
    if (g0) { body.pending_gate = desc(g0); const r = ref(g0); if (r) body.pending_gate_ref = r; }
    if (lead.length > 1) {
      body.pending_lead_gates = lead.map(desc);
      const refs = lead.map(ref).filter((x): x is Rec => !!x);
      if (refs.length) body.pending_lead_gate_refs = refs;
    }
    if (s.helpers.length) {
      // The daemon's helper entries carry no question text or params (only identity and the helper).
      body.pending_helper_gates = s.helpers.map((g) => ({ type: g.kind, gate_id: g.dnum, helper_id: g.helper }));
      const refs = s.helpers.filter((g) => now - g.at >= lag).map((g) => ({ id: g.id, generation: g.generation, type: g.kind, helper_id: g.helper }));
      if (refs.length) body.pending_helper_gate_refs = refs;
    }
    return body;
  }
  replay(sid: string) {
    this.rec('replay', sid);
    const take = () => ({ incarnation: this.inc, min_seq: this.ring[0]?.env.seq ?? this.seq + 1, max_seq: this.seq, events: this.ring.filter((x) => x.sid === sid).map((x) => x.env) });
    const gap = this.o.replayGapMs ?? 0;
    if (!gap) return this.ok(take());
    return new Promise((res) => this.clock.set(() => res(take()), gap));
  }
  /** Starts the unrelated traffic (noiseMs): one frame per live session, again and again. */
  private noiseOn = false;
  private noise(): void {
    if (this.noiseOn || !this.o.noiseMs) return;
    this.noiseOn = true;
    const tick = () => { for (const [sid, s] of this.ss) if (!s.dormant) this.emit(sid, undefined, 'event.usage_update', { n: this.seq }); this.clock.set(tick, this.o.noiseMs as number); };
    this.clock.set(tick, this.o.noiseMs);
  }
  transcript(sid: string) {
    this.rec('transcript', sid);
    let s;
    try { s = this.session(sid); } catch (e) { return Promise.reject(e); }
    return this.ok({ session_id: sid, live: true, turn_boundaries: s.bounds.slice(), messages: JSON.parse(JSON.stringify(s.msgs)) });
  }
  /** The parked gate a decision names (lead or helper), by its addressable id and generation. */
  private gateFor(s: { gate: Gate | null; lanes: Gate[]; helpers: Gate[] }, id: string, generation: number): Gate | null {
    return [...this.leadGates(s), ...s.helpers].find((g) => g.id === id && g.generation === generation) ?? null;
  }
  private applyOnce(g: Gate): void { this.applied.set(g.id, (this.applied.get(g.id) ?? 0) + 1); }
  confirm(sid: string, body: L.ConfirmBody) {
    this.rec('confirm', sid, body);
    let s;
    try { s = this.session(sid); } catch (e) { return Promise.reject(e); }
    const g = this.gateFor(s, body.gate_id, body.generation);
    if (!g) {
      // A gate that ended answers from the session's record of it.
      const e = this.ended.get(body.gate_id + '#' + body.generation);
      // The documented details: the gate, the outcome, and exactly one of the decision object / decision_unknown.
      if (e && e.kind === 'confirm') {
        const answered = e.outcome === 'approved' || e.outcome === 'denied';
        return this.no(409, 'gate_already_resolved', { details: {
          gate_id: body.gate_id, generation: body.generation, outcome: answered ? 'answered' : 'cancelled',
          ...(answered ? { decision: { approved: e.approved === true, persist_dirs: false, session_scope: e.scope === true, trust_computer: false } } : { decision_unknown: true }),
          ...(e.requestId ? { request_id: e.requestId } : {}),
        } });
      }
      return this.no(409, 'stale_gate');
    }
    if (g.kind !== 'confirm') return this.no(409, 'gate_type_mismatch');
    if (g.claimed) return this.no(409, 'gate_decision_pending');
    if (this.o.rateLimitOnce && !this.lost.rate) { this.lost.rate = true; return this.no(429, 'rate_limited'); }
    const turn = s.running;
    // A decision applies only to the gate and turn it named: a stop (or anything else) that ended them first wins.
    const applied = () => {
      if (!this.gateFor(s, g.id, g.generation) || s.running !== turn) return;
      this.applyOnce(g);
      if (g.helper) s.helpers = s.helpers.filter((x) => x !== g);
      const tid = s.running ?? undefined;
      g.resume(body.approved);
      this.ended.set(g.id + '#' + g.generation, { kind: 'confirm', outcome: body.approved ? 'approved' : 'denied', requestId: body.request_id, approved: body.approved, scope: !!body.session_scope });
      // The frame carries the gateway's own correlation id, never the caller's request_id.
      this.emit(sid, tid, 'event.gate_resolved', { kind: 'confirm', gate_id: g.dnum, outcome: 'answered', provenance: 'decision', decision: { approved: body.approved, persist_dirs: false, session_scope: !!body.session_scope, trust_computer: false }, request_id: 'req-' + this.inc + '-' + ++this.reqN, ...(g.helper ? { helper_id: g.helper } : {}), ...(body.session_scope ? { session_scope_applied: true } : {}) });
    };
    // A lost answer: the decision applies, the answer never arrives, and the stream says so a little later.
    if (this.o.decisionLost && !this.lost.decision) {
      this.lost.decision = true;
      // Claimed at once: a second decision meanwhile is refused as pending.
      g.claimed = true;
      this.clock.set(() => { g.claimed = false; applied(); }, this.o.decisionLag ?? this.o.pace ?? 0);
      return Promise.reject({ status: 502, pending: true });
    }
    applied();
    return this.ok({ status: 'ok' });
  }
  answer(sid: string, body: L.AnswerBody) {
    this.rec('answer', sid, body);
    let s;
    try { s = this.session(sid); } catch (e) { return Promise.reject(e); }
    const g = this.gateFor(s, body.gate_id, body.generation);
    const same = (a: unknown) => JSON.stringify(a) === JSON.stringify(body.answer);
    if (!g) {
      const e = this.ended.get(body.gate_id + '#' + body.generation);
      if (e && e.kind === 'question') return same(e.answer) ? this.ok({ status: 'ok', replayed: true }) : this.no(409, 'gate_already_answered', { details: { gate_id: body.gate_id, generation: body.generation } });
      return this.no(409, 'stale_gate');
    }
    if (g.kind !== 'question') return this.no(409, 'gate_type_mismatch');
    // Another answer is being applied: this one is not (no details: that answer may still fail).
    if (g.claimed) return this.no(409, 'gate_already_answered');
    const turn = s.running;
    const apply = () => {
      if (!this.gateFor(s, g.id, g.generation) || s.running !== turn) return;
      this.applyOnce(g);
      const tid = s.running ?? undefined;
      this.ended.set(g.id + '#' + g.generation, { kind: 'question', outcome: 'answered', answer: body.answer as unknown as string });
      g.resume(true, body.answer);
      this.emit(sid, tid, 'event.gate_resolved', { kind: 'question', question_id: g.dnum, outcome: 'answered', provenance: 'decision' });
    };
    const lag = this.o.answerLagMs ?? 0;
    if (!lag) { apply(); return this.ok({ status: 'ok' }); }
    g.claimed = true;
    return new Promise((res, rej) => this.clock.set(() => {
      g.claimed = false;
      // A failed answer is rolled back: the question stays parked.
      if (this.o.answerFail) return rej({ status: 504, code: 'decision_unconfirmed' });
      apply(); res({ status: 'ok' });
    }, lag));
  }
  approval(sid: string) {
    this.rec('approval', sid);
    const mode = this.o.strictApproval ? 'always' : this.o.approvalMode === undefined ? 'default' : this.o.approvalMode;
    try { return this.ok({ yolo: this.session(sid).yolo, ...(mode ? { mode, locked: false } : {}) }); } catch (e) { return Promise.reject(e); }
  }
  yolo(sid: string, enabled: boolean) {
    this.rec('yolo', sid, enabled);
    // A live-chat write: a sleeping chat answers 404 until it is attached.
    try { const s = this.session(sid); if (s.dormant) return this.no(404, 'not_found'); s.yolo = enabled; return this.ok({ yolo: enabled }); } catch (e) { return Promise.reject(e); }
  }
  cancel(sid: string, turnId: string) {
    this.rec('cancel', sid, turnId);
    let s;
    try { s = this.session(sid); } catch (e) { return Promise.reject(e); }
    const t = s.turns.find((x) => x.id === turnId);
    if (t && s.running === turnId) this.after(() => this.endTurn(sid, t, 'cancelled', turnId, t.flush ?? (() => {})));
    return this.ok({ cancelled: true });
  }
  stream(sid: string, cursor: L.Cursor | null, _realm: string, h: StreamHandlers) {
    this.rec('stream', sid, cursor);
    const ses = this.ss.get(sid);
    if (!ses || ses.dormant) return null;
    let open = true;
    const sub = { sid, h, drop: () => { if (!open) return; open = false; this.subs.delete(sub); h.error(); } };
    this.after(() => {
      if (!open) return;
      this.subs.add(sub);
      h.open();
      // An old incarnation's cursor resumes nothing of the new one: the whole retained history comes.
      const from = cursor && cursor.incarnation === this.inc ? cursor.since : 0;
      for (const e of this.ring) if (e.sid === sid && e.env.seq > from) h.frame(e.env.event.type.slice(6), JSON.stringify(e.env));
      if (this.o.streamDrops) this.after(() => sub.drop());
    });
    return { close: () => { open = false; this.subs.delete(sub); } };
  }
  /** Tests: whether the session's running turn is parked at a scripted hold. Until then a follow-up may still be committed at the
   *  turn's next step (next() delivers queued follow-ups before it takes a beat); from then on one stays queued. */
  held(sid: string): boolean { const s = this.ss.get(sid); return !!s && s.running !== null && s.holding === s.running; }
  /** Tests: how many streams are open on the session (all sessions without one). */
  openStreams(sid?: string): number { return [...this.subs].filter((x) => !sid || x.sid === sid).length; }
  /** Tests: every open stream of the session fails (a dropped connection). */
  dropStreams(sid?: string): void { for (const x of [...this.subs]) if (!sid || x.sid === sid) x.drop(); }
  /** Tests: the gateway re-attached the session: a new incarnation (seq restarts, old gate ids refused, the ring
   *  starts empty), every stream drops. Parked gates stay parked on the daemon under new ids. */
  reattach(): void {
    this.inc = 'inc-' + ++this.incN;
    this.seq = 0;
    this.ring = [];
    for (const s of this.ss.values()) for (const g of [...this.leadGates(s), ...s.helpers]) g.id = 'gate-' + ++this.n;
    this.dropStreams();
  }
  /** Tests: the session goes dormant (no gateway session: /state live:false, no stream) or wakes again. */
  setDormant(sid: string, on: boolean): void { const s = this.ss.get(sid); if (s) s.dormant = on; if (on) this.dropStreams(sid); }
  /** Tests: the gates parked on the agent now (the oracle). */
  parked(sid: string): { lead: string[]; helpers: string[] } {
    const s = this.ss.get(sid);
    return s ? { lead: this.leadGates(s).map((g) => g.id), helpers: s.helpers.map((g) => g.id) } : { lead: [], helpers: [] };
  }
  computer(id: string) { this.rec('computer', id); return this.ok({ data: { id, status: this.o.computerStatus ?? 'running', ...(this.o.realms ? { realm_ids: this.o.realms } : {}) } }); }
  start(id: string) {
    this.rec('start', id);
    this.o.computerStatus = 'starting';
    this.clock.set(() => { this.o.computerStatus = 'running'; }, 6000);
    return this.ok({});
  }

  /** Tests: the open gate, the running turn. */
  peek(sid: string) { const s = this.ss.get(sid); return { gate: s?.gate ?? null, running: s?.running ?? null, yolo: s?.yolo ?? false }; }
}

/** A manual clock for tests: timers run in order when `run()` is called. */
export function manualClock(start = 1_000_000): Clock & { run(ms?: number): void; t: number } {
  let id = 0, r = 0;
  const q: Array<{ id: number; at: number; fn: () => void }> = [];
  const c = {
    t: start,
    now: () => c.t,
    set: (fn: () => void, ms: number) => { q.push({ id: ++id, at: c.t + Math.max(0, ms), fn }); return id; },
    clear: (x: unknown) => { const i = q.findIndex((e) => e.id === x); if (i >= 0) q.splice(i, 1); },
    // Deterministic but never repeating within one clock (the draw counter leads), as crypto keys never collide.
    random: (n: number) => { r++; const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = i < 4 ? (r >>> (8 * (3 - i))) & 255 : (i * 37 + r * 101 + 7) & 255; return b; },
    run(ms = 0) {
      const until = c.t + ms;
      for (let guard = 0; guard < 100000; guard++) {
        q.sort((a, b) => a.at - b.at || a.id - b.id);
        const e = q[0];
        if (!e || e.at > until) break;
        q.shift();
        c.t = Math.max(c.t, e.at);
        e.fn();
      }
      c.t = Math.max(c.t, until);
    },
  };
  return c;
}
