// run.ts: one "From GitHub" install on one computer. The agent on that computer does
// the work; this machine checks the agent, makes one session, sends one turn (github.ts promptFor), follows the
// turn's stream, lets the person answer its approvals and questions, and reads the RESULT line at the end. It
// speaks only through Ask's AgentIO (@ask/io) and Ask's pure helpers (readiness, realm rule, the stream reducer,
// gate bodies, error views), so the wire rules are Ask's.
//
// C9, as Ask keeps it:
//   - the create and the turn each go out once under their own key; an answer that may have been lost is
//     "may have started", and Check repeats exactly that request (same key, same body), which the agent answers
//     from its key record, never a second session or turn;
//   - Stop is POST /commands {kind:'stop'} under its own key; a lost answer is checked the same way (same key);
//   - a decision names the gate the person saw (id + generation + request id); a lost decision is read back
//     from the session's state, never sent again on its own;
//   - an unknown outcome is never shown as failed, and a stopped turn says earlier steps may have run.
// The keys and the step outlive this page (C9 across a reload): the run is admitted through one held
// change (RunHold; the page wires core's holdAttempt, the same held changes the launcher's Open uses) before the
// create leaves, the create goes out under the hold's own key, and each later send is saved first (the turn's key,
// the turn's id, the stop's key); a send whose save is refused does not go out. A known end frees the hold. After a
// reload the stored hold rebuilds the run (GitHubRun.resume) as unknown: Check repeats the saved request under its
// saved key (a create or a turn whose answer never came) or reads the saved turn, and nothing goes out on its own.
// While the hold is open a new run on that computer is refused; the person's warned Dismiss frees it.
//
// The journal's held door (ask/journal/held.ts) stands between the run and the agent: the run's io is guardIO, which refuses a
// create, turn, stop or decision without the door's ticket. The door admits a request only against the STORED hold (this tab's
// live sending stamp, the stored version this run just saved, and the stored meta naming exactly this request), once per stored
// version; a decision is stored (`d`) before it is admitted and is never sent twice. Every save goes through metaOf, which always
// carries the run's unresolved decision, and the hold's sending stamp ends only through leases (held.ts): when no request of the
// hold is out and no sending save is pending.
import * as A from '@ask/io';
import type { AgentIO, StreamHandlers } from '@ask/io';
import { INSTALLER_AGENT, INSTALLER_CAP, parseRepo, promptFor, repoLine, resultOf, type Repo, type Result } from '../github';

export const DEFAULT_MODEL = 'hoody-ai/hoody-free';
/** A waking agent (502/503) is asked once more after this long. */
export const WAKE_MS = 3000;
/** The whole preflight's budget. */
export const READ_MS = 20000;
/** A dropped stream is opened again after this long (and the turn's receipt read). */
export const REOPEN_MS = 2000;
/** Reads of the receipt after the turn's end before its outcome is "unknown" (Check reads it again). */
const FINISH_READS = 5;

export interface Clock { now(): number; set(fn: () => void, ms: number): unknown; clear(id: unknown): void; random(n: number): Uint8Array | null }
export const realClock: Clock = {
  now: () => Date.now(),
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  random: (n) => (globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint8Array(n)) : null),
};

export type Phase =
  | 'idle' | 'checking' | 'blocked' | 'creating' | 'sending' | 'working' | 'waiting' | 'stopping' | 'finishing'
  | 'done' | 'unknown' | 'failed' | 'cancelled' | 'interrupted' | 'notSent';
/** Why the run cannot go on, and what the card offers. act: retry = Try again; agent = open the Agent (sign in,
 *  update); programs = open Programs (start its agent) and offer a new computer with the Hoody kit; computers = open
 *  Computers (start the computer, or see what is wrong with it); none = nothing here can fix it. */
export interface Block { key: BlockKey; act: 'retry' | 'agent' | 'programs' | 'computers' | 'none' }
export type BlockKey =
  | 'unreachable' | 'stopped' | 'starting' | 'computerFailed' | 'unsupported' | 'accessRefused' | 'signIn' | 'otherAccount' | 'identity'
  | 'realm' | 'binding' | 'noModel' | 'busy' | 'refused' | 'held' | 'storage';
/** What a computer's status says before anything is sent: not running (stopped, paused), on its way (starting and the
 *  like), or broken; null: nothing against it (running, or a status not named here). The run's own check and the pane's
 *  before-Start notice read the same mapping. */
export function computerBlock(status: unknown): Block | null {
  const st = String(status || '').toLowerCase();
  if (st === 'stopped' || st === 'paused') return { key: 'stopped', act: 'computers' };
  if (/^(starting|restarting|pending|creating|provisioning)$/.test(st)) return { key: 'starting', act: 'retry' };
  if (st === 'failed' || st === 'error') return { key: 'computerFailed', act: 'computers' };
  return null;
}
/** No answer from the agent: not running, or this computer has no Hoody agent (Ask's mapping; the two look the same). */
const UNREACHABLE: Block = { key: 'unreachable', act: 'programs' };
/** What may have gone through without an answer: Check repeats it under the same key ('running': a turn this page
 *  stopped following at a reload; Check reads it by its id). */
export type Unknown = 'create' | 'turn' | 'stop' | 'running';
export interface Snapshot {
  phase: Phase;
  block: Block | null;
  unknown: Unknown | null;
  /** A Check is out. */
  checking: boolean;
  steps: readonly A.Step[];
  gate: A.Gate | null;
  /** A decision for the shown gate is out (or its answer was lost and is being read back). */
  deciding: boolean;
  /** Something of the run was handed to the agent (the create, or anything after it): never "nothing was sent". */
  sent: boolean;
  /** The last session allow was applied to its one call only (a locked approval policy); cleared by the next gate. */
  onceOnly: boolean;
  result: Result | null;
  /** The turn ended without finishing (failed or cancelled): earlier steps may have run. */
  effects: boolean;
  /** The agent's failure code, when it said one. */
  code: string;
  /** The run holds its held change (Dismiss can free it). */
  held: boolean;
}

/** What the held change keeps (plain data, never a secret): enough to rebuild the run after a reload. */
export interface RunMeta {
  v: 1;
  repo: Repo;
  computer: string;
  /** The session's realm (as resolved: 'global' or a realm id), the create's owner fingerprint and model. */
  realm: string;
  owner: string;
  model: string;
  /** The installer agent the session is created on (the agent listed github_installer when the run began); absent: today's
   *  session and full prompt. A Check after a reload repeats the stored path, whatever /version says by then. */
  agent?: typeof INSTALLER_AGENT;
  /** create: the create may be out (its key is the hold's); turn: the turn may be out (k2); running: the turn was
   *  accepted (turnId), and a stop may be out (k4). */
  step: 'create' | 'turn' | 'running';
  sid?: string;
  k2?: string;
  turnId?: string;
  k4?: string;
  /** A decision this run sent (or is sending) that nothing has settled: it is never sent again; after a reload the run reads the
   *  session back before it offers the gate. */
  d?: RunDecision;
}
/** The create's options: the model, and the installer agent when the run is on it. */
function createOpts(model: string, agent: typeof INSTALLER_AGENT | null): A.CreateOpts {
  return agent ? { model, agent } : { model };
}
/** The turn: the REPO line alone for the installer agent, today's full prompt otherwise. */
function turnText(repo: Repo, agent: typeof INSTALLER_AGENT | null): string {
  return agent ? repoLine(repo) : promptFor(repo);
}
/** The created session reports `agent`'s tool ceiling (started.tool_ceiling, as the script writer reads it). */
function ceilingIs(res: unknown, agent: string): boolean {
  const s = A.isObj(res) ? res.started : undefined;
  return A.isObj(s) && s.tool_ceiling === agent;
}
/** The unresolved decision: its request id, the gate and generation it names, and which kind. */
export interface RunDecision { rid: string; gate: string; gen: number; kind: 'confirm' | 'answer' }
/** The run's one held change (the page's adapter over core's AttemptHold). */
export interface RunHold {
  readonly id: string;
  /** The idempotency key minted at admission: the create's key. */
  readonly key: string;
  /** The meta version this handle last stored (or was built at): another one stored means another tab saved since. */
  version(): number;
  /** Stores `meta` before a send (`sending`: the send is about to go out). False: not stored; nothing may be sent. */
  save(meta: RunMeta, sending: boolean): Promise<boolean>;
  /** Takes a sending lease on this hold: its sending stamp stays until every lease taken on it in this page (any handle, any
   *  run instance) is released; the last release ends the stamp. The returned release is idempotent. */
  lease(): () => void;
  /** A known outcome: freed. */
  release(): void;
  /** The person's warned Dismiss (it may have gone through) of the hold as shown (its meta version), decided inside
   *  core's store lock: 'freed'; 'refused' while it changed since (another tab's Check or save) or a request of it may
   *  still be out (a live sending stamp, this tab's own after a reload included); 'unresolved' when storage did not
   *  settle it. Never frees a version that may still be sending. */
  dismiss(shown: { readonly metaVersion: number }): Promise<Freed>;
}
export type Freed = 'freed' | 'refused' | 'unresolved';
export type Admission = { hold: RunHold } | { refused: 'held' | 'storage' };
/** Admits the run (one hold per computer) before anything is sent; refused while another hold of it is open. */
export type Admit = (meta: RunMeta, realm: string) => Promise<Admission>;

const STR = (x: unknown, max = 200): x is string => typeof x === 'string' && x.length > 0 && x.length <= max;
/** The stored meta, read strictly (another build or a damaged record reads as null: only Dismiss is offered). */
export function readMeta(x: unknown): RunMeta | null {
  if (!A.isObj(x) || x.v !== 1 || !A.isObj(x.repo)) return null;
  const r = x.repo;
  const addr = STR(r.owner) && STR(r.name) ? `github.com/${r.owner}/${r.name}${STR(r.ref) ? `/tree/${r.ref}${STR(r.path, 400) ? `/${r.path}` : ''}` : ''}` : '';
  const p = addr ? parseRepo(addr) : null;
  if (!p?.ok || p.repo.owner !== r.owner || p.repo.name !== r.name || p.repo.ref !== (r.ref ?? undefined) || p.repo.path !== (r.path ?? undefined)) return null;
  if (!STR(x.computer) || !STR(x.realm, 64) || typeof x.owner !== 'string' || !STR(x.model)) return null;
  if (x.agent !== undefined && x.agent !== INSTALLER_AGENT) return null;
  if (x.step !== 'create' && x.step !== 'turn' && x.step !== 'running') return null;
  const opt = (k: string) => x[k] === undefined || STR(x[k]);
  if (!opt('sid') || !opt('k2') || !opt('turnId') || !opt('k4')) return null;
  if (x.step !== 'create' && !x.sid) return null;
  if (x.step === 'turn' && !x.k2) return null;
  if (x.step === 'running' && !x.turnId) return null;
  const m: RunMeta = { v: 1, repo: p.repo, computer: x.computer, realm: x.realm, owner: x.owner, model: x.model, step: x.step };
  if (x.agent === INSTALLER_AGENT) m.agent = INSTALLER_AGENT;
  for (const k of ['sid', 'k2', 'turnId', 'k4'] as const) if (typeof x[k] === 'string') m[k] = x[k];
  if (x.d !== undefined) {
    const d = readDecision(x.d);
    if (!d) return null;
    m.d = d;
  }
  return m;
}
const RID = /^hx-[0-9a-f]{24}$/;
const SEG = /^[A-Za-z0-9_.:-]{1,200}$/;
/** The stored decision, strictly: exactly {rid, gate, gen, kind}. */
function readDecision(x: unknown): RunDecision | null {
  if (!A.isObj(x) || Array.isArray(x)) return null;
  const k = Object.keys(x);
  if (k.length !== 4 || !['rid', 'gate', 'gen', 'kind'].every((n) => Object.prototype.hasOwnProperty.call(x, n))) return null;
  if (typeof x.rid !== 'string' || !RID.test(x.rid) || typeof x.gate !== 'string' || !SEG.test(x.gate)) return null;
  if (typeof x.gen !== 'number' || !Number.isInteger(x.gen) || x.gen < 0) return null;
  if (x.kind !== 'confirm' && x.kind !== 'answer') return null;
  return { rid: x.rid, gate: x.gate, gen: x.gen, kind: x.kind };
}


export interface RunInput {
  computer: string;
  account: string;
  /** core's realm selection ('all' or a realm id). */
  realm: string;
  model?: string;
  admit: Admit;
}

type Settled = A.Settled;
/** What a request the journal's door refused looks like to the run: nothing left. */
const unsentError = (n: A.NotSent): { kind: 'not_sent'; notSent: true; code: string } => ({ kind: 'not_sent', notSent: true, code: 'JOURNAL_' + n.why });
/** A /state body that can close a stored decision: one the reducer's state step evaluates whole (`A.stateUsable`, the step's own fields). Anything
 *  else (null, empty, malformed, a gate ref without its gate) is a read that proved nothing. */
const stateProved = A.stateUsable;
const settle = (p: Promise<unknown>): Promise<Settled> => p.then((b) => ({ ok: true as const, b }), (e: unknown) => ({ ok: false as const, e }));
/** A refusal that says an earlier send under this key may have run, so its outcome is unknown and the key and the hold
 *  stay: a retired key (409 turn_key_retired / command_key_retired) whose details.admitted is anything but "false"
 *  (only "false" allows a new key), and 409 creation_interrupted (the agent: an earlier send with the key may still
 *  have created the session). */
function mayHaveRun(e: unknown): boolean {
  if (!A.isObj(e) || e.status !== 409) return false;
  if (e.code === 'creation_interrupted') return true;
  if (e.code !== 'turn_key_retired' && e.code !== 'command_key_retired') return false;
  return !notAdmitted(e);
}
/** The agent's ledger proof that nothing under the key ran: a retired key (409 turn_key_retired / command_key_retired)
 *  with details.admitted "false". It settles even a Check's repeat as not run, and a new key may be used. */
function notAdmitted(e: unknown): boolean {
  return A.isObj(e) && e.status === 409 && (e.code === 'turn_key_retired' || e.code === 'command_key_retired') && A.isObj(e.details) && e.details.admitted === 'false';
}
const MUT_KEYS: Readonly<Record<string, BlockKey>> = {
  'ask.noModel': 'noModel', 'ask.busy': 'busy', 'ask.realmNeeded': 'realm', 'ask.accessRefused': 'accessRefused', 'ask.bindingFailed': 'binding', 'ask.rateLimited': 'refused',
};

export class GitHubRun {
  private readonly io: AgentIO;
  private readonly clock: Clock;
  private readonly input: RunInput;
  private gen = 0;
  private timers = new Set<unknown>();
  private es: { close(): void } | null = null;
  private listeners = new Set<() => void>();
  private snap: Snapshot;
  // flow state
  private phase: Phase = 'idle';
  private block: Block | null = null;
  private unknown: Unknown | null = null;
  private checking = false;
  private realm = '';
  private owner = '';
  private version: unknown = null;
  private prompt = '';
  private k1: string | null = null;
  private body: A.CreateBody | null = null;
  private sid: string | null = null;
  private k2: string | null = null;
  private k4: string | null = null;
  private st: A.AskState = A.initial();
  private result: Result | null = null;
  private reading = false;
  private repo: Repo | null = null;
  private dismissing = false;
  private hold: RunHold | null = null;
  /** Something of this run was handed to the agent (its create, so everything after it): set once, never cleared. A run
   *  rebuilt from a stored hold counts as sent. Before it, only checks were read and the run's own held change admitted. */
  private sent = false;
  private syncing = false;
  private finReads = 0;
  private finWait: unknown = null;
  /** A decision whose outcome is being reconciled (its answer lost, still pending, or a refusal that asked to read
   *  again): no decision is taken until a read of the session settles it, whatever else (Stop) changes meanwhile. */
  private reconciling = false;
  /** The unresolved decision (stored in every save of the meta until a settled answer clears it). */
  private d: RunDecision | null = null;
  /** The cancel tokens of the requests admitted and not yet claimed: end() cancels them. */
  private toks = new Set<A.SendToken>();
  private model: string;
  /** The installer agent this run's session is on, or null for today's path (RunMeta.agent). */
  private agent: typeof INSTALLER_AGENT | null = null;

  constructor(io: AgentIO, input: RunInput, clock: Clock = realClock) {
    // The run's only io: a create, turn, stop or decision leaves only through the journal's held door.
    this.io = A.guardIO(io, { acct: input.account, container: input.computer });
    this.input = input; this.clock = clock;
    this.model = input.model ?? DEFAULT_MODEL;
    this.snap = this.build();
  }

  /** After a reload: the run as its held change kept it, unknown until Check. Null when the record does not read as
   *  a run of this computer (the page offers only Dismiss). */
  static resume(io: AgentIO, input: RunInput, h: { hold: RunHold; meta: unknown }, clock: Clock = realClock): GitHubRun | null {
    const m = readMeta(h.meta);
    const body = m ? A.createBody(m.realm, m.computer, createOpts(m.model, m.agent ?? null)) : null;
    if (!m || !body || m.computer !== input.computer) return null;
    const r = new GitHubRun(io, input, clock);
    r.agent = m.agent ?? null;
    r.hold = h.hold; r.repo = m.repo; r.prompt = turnText(m.repo, r.agent);
    r.realm = m.realm; r.owner = m.owner; r.k1 = h.hold.key; r.body = body;
    r.sent = true;
    r.sid = m.sid ?? null; r.k2 = m.k2 ?? null; r.k4 = m.k4 ?? null; r.model = m.model;
    // A decision the stored hold names may be out: the run reads the session back (Check) and sends nothing on its own.
    if (m.d) { r.d = m.d; r.reconciling = true; }
    if (m.turnId) r.st = A.reduce(A.initial({ turnId: m.turnId }), { type: 'turn', turnId: m.turnId });
    r.set('unknown', { unknown: m.step === 'running' ? 'running' : m.step });
    return r;
  }
  /** The held change's id while the run holds it. */
  holdId(): string | null { return this.hold?.id ?? null; }
  /** The meta version this run's handle last stored (null: no hold). Another one stored means another tab saved. */
  holdVersion(): number | null { return this.hold ? this.hold.version() : null; }

  // ---- the snapshot (useSyncExternalStore) ----
  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => void this.listeners.delete(fn); };
  getSnapshot = (): Snapshot => this.snap;
  private build(): Snapshot {
    const t = this.st.terminal;
    return {
      phase: this.phase, block: this.block, unknown: this.unknown, checking: this.checking,
      steps: this.st.steps, gate: this.st.gate, deciding: !!this.st.decision || this.recovering(), onceOnly: this.st.onceOnly, sent: this.sent, result: this.result,
      effects: !!t && t.state !== 'completed' && t.effects !== false, code: t?.code || this.st.error?.code || '',
      held: !!this.hold,
    };
  }
  private publish(): void {
    this.snap = this.build();
    for (const fn of this.listeners) fn();
  }
  private live(g: number): boolean { return g === this.gen && this.io.alive(); }
  private later(fn: () => void, ms: number): unknown {
    const id = this.clock.set(() => { this.timers.delete(id); fn(); }, ms);
    this.timers.add(id);
    return id;
  }
  private set(phase: Phase, o: { block?: Block | null; unknown?: Unknown | null } = {}): void {
    this.phase = phase;
    if (o.block !== undefined) this.block = o.block;
    if (o.unknown !== undefined) this.unknown = o.unknown;
    this.publish();
  }

  /** A known outcome: the hold is freed (a new run may start). */
  private known(): void {
    this.hold?.release();
    this.hold = null;
  }
  /** Saves the next step before its send; false: not stored, so it is not sent. */
  private save(m: RunMeta, sending: boolean): Promise<boolean> {
    if (!this.hold) return Promise.resolve(false);
    return this.hold.save(m, sending).catch(() => false);
  }
  /** Saves `m` stamped as sending, then `then(ok, lease)` while this machine is live; `lease` is the sending lease the save took
   *  (handed on to sendHeld), null when the save failed. A save that fails, or lands after end() (a send that will not go out),
   *  gives its lease back at once (the record stays, unknown, for its Check). */
  private saveSend(g: number, m: RunMeta, then: (ok: boolean, lease: (() => void) | null) => void): void {
    const lease = this.hold ? this.hold.lease() : null;
    void this.save(m, true).then((ok) => {
      if (!ok || !this.live(g)) { lease?.(); if (this.live(g)) then(false, null); return; }
      then(true, lease);
    });
  }
  /** Sends one held request through the journal's door: admitted against the stored hold, then one claimed call. `lease` is given
   *  back when nothing of it can be out (refused before the claim, or the claimed call settled). `then` sees the call's result,
   *  or an unsent error, while this machine is live. */
  private sendHeld(g: number, op: A.HeldOp, go: (t: A.Ticket) => Promise<unknown>, lease: (() => void) | null, then: (x: Settled) => void): void {
    const hold = this.hold, tok = new A.SendToken();
    this.toks.add(tok);
    const a = hold ? A.held.admit(op, hold.id, hold.version(), tok) : null;
    if (!a || 'why' in a) {
      this.toks.delete(tok);
      lease?.();
      this.checking = false;
      if (this.live(g)) then({ ok: false, e: unsentError(a ?? { kind: 'notSent', why: 'notKept' }) });
      return;
    }
    void A.held.post(a, go).then((o) => {
      this.toks.delete(tok);
      lease?.();
      if (!this.live(g)) return;
      then(o.kind === 'sent' ? o.x : { ok: false, e: unsentError(o) });
    });
  }
  /** The meta of a step, always carrying the run's unresolved decision: every save of the meta goes through here. */
  private metaOf(step: RunMeta['step'], extra: { sid?: string; k2?: string; turnId?: string; k4?: string } = {}): RunMeta | null {
    const b = this.metaBase(step);
    return b ? { ...b, ...extra, ...(this.d ? { d: this.d } : {}) } : null;
  }
  /** The decision `rid` (or the current one) is settled: it leaves the stored meta with one save. A late settle of an older
   *  decision finds another rid and clears nothing. */
  private clearD(rid?: string): void {
    const d = this.d;
    if (!d || (rid !== undefined && d.rid !== rid)) return;
    this.d = null;
    const sid = this.sid, turnId = this.st.turnId;
    const m = sid && turnId ? this.metaOf('running', { sid, turnId, ...(this.k4 ? { k4: this.k4 } : {}) }) : null;
    if (m) void this.save(m, false);
  }
  /** The person's warned Dismiss of the hold as shown: freed, then this page stops watching (the run itself goes
   *  on). Refused while the hold changed since it was shown or a send of it may still be out (the card says to try
   *  again later or Check); a Check meanwhile is refused. */
  dismiss(shown: { readonly metaVersion: number }): Promise<Freed> {
    const hold = this.hold;
    if (!hold || this.dismissing || this.checking) return Promise.resolve('refused');
    this.dismissing = true;
    const g = this.gen;
    return hold.dismiss(shown).catch((): Freed => 'unresolved').then((r) => {
      this.dismissing = false;
      if (r !== 'freed' || g !== this.gen) return r === 'freed' ? 'refused' : r;
      this.hold = null;
      this.unknown = null;
      this.end();
      return 'freed';
    });
  }

  /** The machine is done with: no answer that arrives later changes anything. */
  /** Ends the run when nothing of it was sent, read at call time (not from a render), so its checks can't go on to a create: true
   *  when ended. A run that sent anything, or holds its change, is kept. */
  abandonUnsent(): boolean {
    if (this.sent || this.hold) return false;
    this.end();
    return true;
  }
  end(): void {
    this.gen++;
    for (const t of this.toks) t.cancel();
    this.toks.clear();
    for (const id of this.timers) this.clock.clear(id);
    this.timers.clear();
    this.es?.close();
    this.es = null;
  }

  // ---- start: preflight, then the create ----
  start(repo: Repo): boolean {
    if (this.phase !== 'idle') return false;
    this.repo = repo;
    this.prompt = promptFor(repo);
    this.set('checking', { block: null });
    this.preflight(this.gen);
    return true;
  }
  /** Again after a block that offers Try again (before anything was sent, or after a definite refusal). */
  retry(): boolean {
    if (this.phase !== 'blocked' && this.phase !== 'notSent') return false;
    // A session already made: only the turn is sent again (a refused turn's key was dropped, so a new one). A
    // refused turn freed the hold: the turn is admitted again first.
    if (this.sid) {
      if (this.hold) this.sendTurn(this.gen);
      else this.admitTurn(this.gen);
      return true;
    }
    this.k1 = null; this.body = null;
    this.set('checking', { block: null });
    this.preflight(this.gen);
    return true;
  }

  // The computer's row first (as Ask): a computer that is not running has no agent to answer, so the card says
  // why instead of "can't reach"; its realms decide the session's realm.
  private preflight(g: number): void {
    let timedOut = false;
    const budget = this.later(() => { timedOut = true; this.set('blocked', { block: UNREACHABLE }); }, READ_MS);
    void settle(this.io.computer(this.input.computer)).then((r) => {
      if (!this.live(g) || timedOut) return;
      this.clock.clear(budget); this.timers.delete(budget);
      const row = r.ok && A.isObj(r.b) ? (A.isObj(r.b.data) ? r.b.data : r.b) : null;
      const ids = row && Array.isArray(row.realm_ids) ? (row.realm_ids as unknown[]).filter((x): x is string => typeof x === 'string') : null;
      const block = computerBlock(row ? row.status : 'running');
      if (block) return this.set('blocked', { block });
      this.agentCheck(g, ids);
    });
  }
  private agentCheck(g: number, ids: readonly string[] | null): void {
    let timedOut = false;
    const budget = this.later(() => { timedOut = true; this.set('blocked', { block: UNREACHABLE }); }, READ_MS);
    // Each chained read asks only while this machine is live (a late answer after end() schedules nothing).
    const health = () => settle(this.io.health()).then((x) => {
      if (!this.live(g) || x.ok || !A.isObj(x.e) || (x.e.status !== 502 && x.e.status !== 503)) return x;
      return new Promise<Settled>((res) => void this.later(() => void settle(this.io.health()).then(res), WAKE_MS));
    });
    void health()
      .then((h): Promise<Settled[]> | Settled[] => (h.ok && this.live(g) ? Promise.all([h, settle(this.io.version()), settle(this.io.authStatus())]) : [h]))
      .then((r) => {
        if (!this.live(g) || timedOut) return;
        this.clock.clear(budget); this.timers.delete(budget);
        for (const x of r) if (!x.ok) return this.readBlock(x.e);
        const [, ver, status] = r;
        this.version = ver?.b;
        this.agent = A.capOn(ver?.b, INSTALLER_CAP) ? INSTALLER_AGENT : null;
        if (this.repo) this.prompt = turnText(this.repo, this.agent);
        const rd = A.readiness(ver?.b, status?.b, this.input.account);
        if (rd.state === 'unsupported') return this.set('blocked', { block: { key: 'unsupported', act: 'agent' } });
        if (rd.state === 'otherAccount') return this.set('blocked', { block: { key: 'otherAccount', act: 'agent' } });
        if (rd.state === 'login') return this.set('blocked', { block: { key: 'signIn', act: 'agent' } });
        if (rd.state === 'identity') return this.set('blocked', { block: { key: 'identity', act: 'retry' } });
        const rr = A.realmFor({ selected: this.input.realm, pinned: rd.pinned, restricted: rd.restricted, loginRealms: rd.loginRealms, computerRealms: ids, picked: null });
        if (!('realm' in rr)) return this.set('blocked', { block: { key: 'realm', act: 'none' } });
        this.realm = rr.realm;
        this.owner = rd.owner;
        this.canAct(g);
      });
  }
  /** A preflight read's error (Ask's readView): no answer is "the agent isn't running here"; nothing on a stale IO. */
  private readBlock(e: unknown): void {
    const v = A.readView(e);
    if (v.drop) return;
    if (v.key === 'ask.accessRefused') return this.set('blocked', { block: { key: 'accessRefused', act: 'retry' } });
    if (v.key === 'ask.unsupported') return this.set('blocked', { block: { key: 'unsupported', act: 'agent' } });
    this.set('blocked', { block: UNREACHABLE });
  }
  // A realm other than Global needs the agent to hold that realm's token: the realm read makes it resolve the
  // token, read-only; the status read after it says how that went (Ask's canAct, the same typed signals).
  private canAct(g: number): void {
    if (A.realmAuth(null, this.realm, null) === 'ok') return this.create(g);
    let timedOut = false;
    const budget = this.later(() => { timedOut = true; this.set('blocked', { block: UNREACHABLE }); }, READ_MS);
    const readBlock = (e: unknown) => this.readBlock(e);
    // The status read asks only while this machine is live (a late probe answer after end() reads nothing more).
    void settle(this.io.probe(this.realm)).then((p) => (this.live(g) ? settle(this.io.authStatus()) : Promise.resolve<Settled>({ ok: false, e: null })).then((s) => [p, s] as const)).then(([p, s]) => {
      if (!this.live(g) || timedOut) return;
      this.clock.clear(budget); this.timers.delete(budget);
      if (A.probeFault(p)) return readBlock((p as { e?: unknown }).e);
      if (!s.ok) return readBlock(s.e);
      const rd = A.readiness(this.version, s.b, this.input.account);
      if (rd.state === 'otherAccount') return this.set('blocked', { block: { key: 'otherAccount', act: 'agent' } });
      if (rd.state === 'login') return this.set('blocked', { block: { key: 'signIn', act: 'agent' } });
      if (rd.state !== 'ready' || rd.owner !== this.owner) return this.set('blocked', { block: { key: 'identity', act: 'retry' } });
      const k = A.realmAuth(s.b, this.realm, p);
      if (k === 'update') return this.set('blocked', { block: { key: 'unsupported', act: 'agent' } });
      if (k === 'renew') return this.set('blocked', { block: { key: 'signIn', act: 'agent' } });
      if (k === 'read') return readBlock((p as { e?: unknown }).e);
      this.create(g);
    });
  }

  private metaBase(step: RunMeta['step']): RunMeta | null {
    if (!this.repo) return null;
    return { v: 1, repo: this.repo, computer: this.input.computer, realm: this.realm, owner: this.owner, model: this.model, ...(this.agent ? { agent: this.agent } : {}), step };
  }
  /** Admits the run (its held change) with `meta`; then `go` with the hold. Refused: nothing is sent. */
  private admit(g: number, meta: RunMeta, go: (h: RunHold) => void): void {
    const no = (key: 'held' | 'storage') => this.set('blocked', { block: { key, act: key === 'storage' ? 'retry' : 'none' } });
    void this.input.admit(meta, this.realm).then((a) => {
      // Admitted for a machine that is done with: nothing was sent, so the hold is freed again.
      if (!this.live(g)) { if ('hold' in a) a.hold.release(); return; }
      if (!('hold' in a)) return no(a.refused);
      this.hold = a.hold;
      go(a.hold);
    }, () => { if (this.live(g)) no('storage'); });
  }
  private create(g: number): void {
    const body = A.createBody(this.realm, this.input.computer, createOpts(this.model, this.agent));
    const meta = this.metaBase('create');
    if (!body || !meta) return this.set('blocked', { block: { key: 'refused', act: 'none' } });
    this.set('creating');
    this.admit(g, meta, (h) => {
      this.k1 = h.key; this.body = body;
      this.sent = true;
      this.publish();
      this.sendCreate(g, h.lease());
    });
  }
  private sendCreate(g: number, lease: (() => void) | null): void {
    const key = this.k1 as string, body = this.body as A.CreateBody, replay = this.checking, realm = this.realm;
    // Answered: the send's stamp ends even when this page stopped watching (the hold stays for its Check).
    this.sendHeld(g, { route: 'create', acct: this.input.account, container: this.input.computer, r: realm, key }, (t) => this.io.create(body, key, realm, [t]), lease, (x) => {
      this.checking = false;
      if (!x.ok) return this.refusal(x.e, 'create', replay);
      // Only well-formed evidence of another binding is a failure. A reply that lacks the evidence proves nothing either way (C9): the
      // create stays unknown, its hold and key kept for Check (ask/logic.ts checkStarted).
      const bound = A.checkStarted(x.b, { realm: this.realm, container: this.input.computer, owner: this.owner });
      if (bound === 'MISMATCH') { this.known(); return this.set('failed', { block: { key: 'binding', act: 'none' }, unknown: null }); }
      if (bound === 'MISSING') return this.set('unknown', { unknown: 'create' });
      // A session of the installer agent gets a turn only under that agent's tool ceiling. An agent that lists the capability and
      // starts a session without it is broken or mismatched: nothing is sent, and the person is asked to update the agent (never a
      // second create on a less constrained path). The session has no prompt, so the agent discards it.
      if (this.agent && !ceilingIs(x.b, this.agent)) { this.known(); return this.set('failed', { block: { key: 'unsupported', act: 'agent' }, unknown: null }); }
      this.sid = (x.b as { session_id: string }).session_id;
      this.unknown = null;
      this.sendTurn(g);
    });
  }

  // ---- the turn ----
  /** A refused turn freed the hold: Try again admits the turn again (same session) before it is sent. */
  private admitTurn(g: number): void {
    const meta = this.metaBase('turn');
    if (!meta || !this.sid) return this.set('blocked', { block: { key: 'refused', act: 'none' } });
    this.set('sending', { block: null });
    this.admit(g, meta, () => this.sendTurn(g));
  }
  private sendTurn(g: number): void {
    if (!this.k2) this.k2 = A.newKey(this.clock.random(16));
    const meta = this.k2 && this.sid ? this.metaOf('turn', { sid: this.sid, k2: this.k2 }) : null;
    if (!meta || !this.k2 || !this.sid) return this.set('blocked', { block: { key: 'refused', act: 'none' } });
    const sid = this.sid, k2 = this.k2, replay = this.checking, realm = this.realm;
    // A Check repeats a turn that may have run: it stays unknown on any outcome that does not settle that turn.
    if (!replay) this.set('sending', { block: null });
    // The turn's key is stored before the turn leaves: a reload then repeats this turn, never a new one.
    this.saveSend(g, meta, (ok, lease) => {
      if (!ok) {
        this.checking = false;
        // Not stored, so not sent: a first turn is "not started"; a Check's turn may have run before, still unknown.
        if (replay) return this.set('unknown', { unknown: 'turn' });
        return this.set('notSent', { block: { key: 'storage', act: 'retry' }, unknown: null });
      }
      this.sendHeld(g, { route: 'turn', acct: this.input.account, container: this.input.computer, r: realm, sid, key: k2 }, (t) => this.io.turn(sid, this.prompt, k2, realm, undefined, undefined, [t]), lease, (x) => {
        this.checking = false;
        if (!x.ok) return this.refusal(x.e, 'turn', replay);
        const b = x.b as A.Rec;
        if (!A.seg(b.turn_id)) return this.set('unknown', { unknown: 'turn' });
        const cur = A.streamCursor(b.stream_url, sid);
        this.st = A.reduce(A.initial({ turnId: b.turn_id, inc: cur?.incarnation, seq: cur?.since }), { type: 'turn', turnId: b.turn_id });
        // The agent may answer a repeated key with the turn's stored receipt: a finished turn ends here (its stream
        // need not say so again).
        this.st = A.reduce(this.st, { type: 'receipt', body: b });
        this.unknown = null;
        if (this.st.terminal) return this.follow();
        // The accepted turn's id is stored (no send waits on it: a refused save leaves the turn's key, and a Check
        // after a reload then repeats the turn, which the agent answers from its key record).
        const running = this.metaOf('running', { sid, turnId: b.turn_id });
        if (running) void this.save(running, false);
        this.set('working');
        this.openStream(g, cur);
      });
    });
  }

  /** A mutation's error: a lost answer is "may have started" (Check repeats it); a definite refusal says why.
   *  `replay`: the refused request was a Check's repeat of one that may have run. Its refusal (rate limited, busy,
   *  anything) says nothing about that earlier send, so the outcome stays unknown under the same key and hold, except
   *  the agent's proof that the key admitted nothing (notAdmitted), which settles it as not run. */
  private refusal(e: unknown, what: Unknown, replay = false): void {
    const v = A.errorView(e);
    if (v.drop) return;
    // A refusal that says the request may have run is as unknown as a lost answer: same key, same hold. What a refusal says is
    // judged by the route's own rules (the journal's classifier): only a code documented as "nothing ran" is a definite refusal.
    const key = what === 'create' ? this.k1 : what === 'turn' ? this.k2 : what === 'stop' ? this.k4 : null;
    const route = what === 'create' ? 'create' : what === 'turn' ? 'turn' : 'command';
    const doubt = !!key && A.heldVerdict(route, key, { ok: false, e }) === 'unknown';
    const unknown = v.unknown || doubt || (replay && !notAdmitted(e)) || mayHaveRun(e);
    // A lost stop: the stream goes on showing the turn (it may have stopped); Check asks with the same key.
    if (unknown && what === 'stop') { this.unknown = 'stop'; return this.follow(); }
    if (unknown) return this.set('unknown', { unknown: what });
    // A definitely refused stop applied nothing: the turn runs as before and Stop can be pressed again. Its key
    // leaves the hold too (a reload then asks nothing about it).
    if (what === 'stop') {
      this.k4 = null;
      this.unknown = null;
      this.st = A.reduce(this.st, { type: 'stopRefused', turnId: this.st.turnId });
      const turnId = this.st.turnId;
      const m = this.sid && turnId ? this.metaOf('running', { sid: this.sid, turnId }) : null;
      if (m) void this.save(m, false);
      return this.follow();
    }
    // A definitely refused create or turn sent nothing that runs: the hold is freed, and Try again starts over (a
    // turn: same session, new key).
    if (what === 'turn') this.k2 = null;
    this.known();
    this.set('notSent', { block: { key: MUT_KEYS[v.key ?? ''] ?? 'refused', act: 'retry' }, unknown: null });
  }

  /** Check: repeat exactly the request whose answer was lost, under its key. */
  check(): boolean {
    if (this.checking || this.dismissing || !this.unknown || (this.unknown !== 'stop' && this.phase !== 'unknown')) return false;
    const g = this.gen;
    this.checking = true;
    this.publish();
    if (this.unknown === 'create') {
      // The same create, stamped as out again first (another tab then sees it in flight).
      const m = this.metaOf('create');
      if (!m) { this.checking = false; this.publish(); return false; }
      this.saveSend(g, m, (ok, lease) => {
        if (!ok) { this.checking = false; return this.publish(); }
        this.sendCreate(g, lease);
      });
    } else if (this.unknown === 'turn') this.sendTurn(g);
    else if (this.unknown === 'running') this.readRunning(g);
    else {
      // The same stop, stamped as out again first (another tab then sees it in flight; a refused stamp sends nothing).
      const turnId = this.st.turnId;
      const m = this.sid && turnId && this.k4 ? this.metaOf('running', { sid: this.sid, turnId, k4: this.k4 }) : null;
      if (!m) { this.checking = false; this.publish(); return false; }
      this.saveSend(g, m, (ok, lease) => {
        if (!ok) { this.checking = false; return this.publish(); }
        this.sendStop(g, lease);
      });
    }
    return true;
  }
  // After a reload: the saved turn is read by its id (read-only). Over: its end as usual. Still going: followed on
  // its stream again (a saved stop's question stays open, its Check repeats that stop). No answer: still unknown.
  private readRunning(g: number): void {
    const sid = this.sid, turnId = this.st.turnId;
    if (!sid || !turnId) { this.checking = false; return this.publish(); }
    void settle(this.io.receipt(sid, turnId, this.realm)).then((x) => {
      if (!this.live(g)) return;
      this.checking = false;
      if (!x.ok) return this.publish();
      this.st = A.reduce(this.st, { type: 'receipt', body: x.b });
      this.unknown = null;
      // This read counts as the first of the end's receipt reads.
      this.finReads = 1;
      if (this.st.terminal) return this.follow();
      if (this.k4) { this.st = A.reduce(this.st, { type: 'stop' }); this.unknown = 'stop'; }
      this.follow();
      this.openStream(g, null);
      // A decision the stored hold names may be out: the session's state says what became of it, and nothing is sent.
      if (this.d && !this.st.terminal) { this.reconciling = true; this.readBack(g); }
    });
  }

  // ---- the stream ----
  private openStream(g: number, cur: A.Cursor | null): void {
    if (!this.sid) return;
    const h: StreamHandlers = {
      open: () => undefined,
      frame: (name, raw) => {
        if (!this.live(g)) return;
        let data: unknown;
        try { data = JSON.parse(raw); } catch { return; }
        this.st = A.reduce(this.st, { type: 'frame', name, data, now: this.clock.now() });
        // A request to read again (lagged, a new incarnation): the stream is reconciled. A history gap alone is a
        // marker the reducer keeps; the frames after a reconciled gap are applied as usual.
        if (this.st.resync) return this.drop(g);
        this.follow();
      },
      error: () => { if (this.live(g)) this.drop(g); },
    };
    this.es?.close();
    this.es = this.io.stream(this.sid, cur, this.realm, h, 'visible');
    if (!this.es) this.drop(g);
  }
  // A lost or lagging stream: after a wait the turn is reconciled (Ask's recovery: receipt, state and replay read
  // together and applied as one reply stamped with the epoch and gate revision), and the stream opens again from
  // the newest point known. A reply left out or a failed read is read again after the next wait.
  private drop(g: number): void {
    this.es?.close();
    this.es = null;
    this.later(() => {
      if (!this.live(g) || this.st.terminal) return;
      this.resync(g);
    }, REOPEN_MS);
  }
  private resync(g: number): void {
    const sid = this.sid, turnId = this.st.turnId;
    if (!sid || !turnId || this.syncing) return;
    this.syncing = true;
    const ep = this.st.epoch, rev = this.st.gateRev;
    void Promise.all([settle(this.io.receipt(sid, turnId, this.realm)), settle(this.io.state(sid, this.realm)), settle(this.io.replay(sid, this.realm))]).then(([rc, st, rp]) => {
      this.syncing = false;
      if (!this.live(g)) return;
      const stb = st.ok ? st.b : null;
      this.st = A.reduce(this.st, {
        type: 'reply', epoch: ep, rev, receipt: rc.ok ? rc.b : null, replay: rp.ok ? rp.b : null, state: stb,
        turnSince: A.isObj(stb) && typeof stb.turn_since === 'number' ? stb.turn_since : undefined,
      });
      if (this.st.terminal) return this.follow();
      if (this.st.replyDropped || this.st.stateLeftOut || !st.ok || !rp.ok) { this.follow(); return this.drop(g); }
      const rb = rp.b;
      const max = A.isObj(rb) && typeof rb.max_seq === 'number' && rb.max_seq >= 0 && (!this.st.inc || rb.incarnation === this.st.inc) ? rb.max_seq : 0;
      this.st = A.reduce(this.st, { type: 'resynced' });
      // A decision reconciled through this read: settled when it left no decision out, else read back.
      if (this.reconciling) {
        if (this.decisionOut(st.ok && stateProved(st.b))) this.later(() => this.readBack(g), REOPEN_MS);
        else { this.reconciling = false; this.clearD(); }
      }
      this.follow();
      this.openStream(g, this.st.inc ? { since: Math.max(this.st.seq, max), incarnation: this.st.inc } : null);
    });
  }
  private readReceipt(g: number): void {
    if (!this.sid || !this.st.turnId || this.reading) return;
    this.reading = true;
    void settle(this.io.receipt(this.sid, this.st.turnId, this.realm)).then((x) => {
      this.reading = false;
      if (!this.live(g)) return;
      if (x.ok) this.st = A.reduce(this.st, { type: 'receipt', body: x.b });
      this.follow();
    });
  }
  // The turn ended (its done frame) but its receipt is not settled yet: read at once, then after a wait each time,
  // FINISH_READS in all; still unsettled, its outcome is unknown and Check reads it again (the hold stays).
  private finishRead(g: number): void {
    if (this.reading || this.finWait !== null) return;
    if (this.finReads >= FINISH_READS) {
      this.es?.close();
      this.es = null;
      return this.set('unknown', { unknown: 'running' });
    }
    const go = () => { this.finWait = null; this.finReads++; this.readReceipt(g); };
    if (this.finReads === 0) return go();
    this.finWait = this.later(() => { if (this.live(g)) go(); }, REOPEN_MS);
  }
  /** The phase from the reduced state; at the turn's end, its receipt and then its RESULT line. */
  private follow(): void {
    const g = this.gen;
    const p = A.phase(this.st);
    // The turn ended: whether a lost stop went through no longer matters.
    if (this.st.terminal && this.unknown === 'stop') this.unknown = null;
    if (p === 'finishing') { this.set('finishing'); return this.finishRead(g); }
    if (p === 'completed') return this.finish(g);
    // failed, cancelled, interrupted (the agent restarted mid-turn): each says earlier steps may have run.
    if (p === 'failed' || p === 'cancelled' || p === 'interrupted') { this.es?.close(); this.es = null; this.known(); return this.set(p, { block: null }); }
    this.set(p);
  }
  private finish(g: number): void {
    this.es?.close();
    this.es = null;
    // The turn is over: the hold is freed whatever the result line says.
    this.known();
    this.set('finishing');
    const r = resultOf(A.reply(this.st));
    if (r.kind !== 'none' || !this.sid) { this.result = r; return this.set('done'); }
    // The reply as streamed may be cut; the transcript's last reply is the agent's own record.
    void settle(this.io.transcript(this.sid, this.realm)).then((x) => {
      if (!this.live(g)) return;
      this.result = x.ok ? resultOf(A.transcriptReply(x.b)) : r;
      this.set('done');
    });
  }

  // ---- gates ----
  /** session: allow this call and its like for the rest of the session, only for a gate that offers it (confirmBody refuses
   *  it otherwise); remember is always off. */
  decide(choice: 'once' | 'session' | 'deny', seen: { id: string; generation: number }): boolean {
    const gate = this.decidable(seen);
    if (!gate || gate.kind !== 'confirm') return false;
    const rid = A.newRequestId(this.clock.random(12));
    const body = A.confirmBody(gate, choice, rid);
    if (!rid || !body) return false;
    return this.sendDecision('confirm', rid, gate, (t) => this.io.confirm(this.sid as string, body, this.realm, [t]));
  }
  /** value: the answer to a single question, or {questionId: answer} for a batch (every question). */
  answer(value: string | Readonly<Record<string, string>>, seen: { id: string; generation: number }): boolean {
    const gate = this.decidable(seen);
    if (!gate || gate.kind !== 'question') return false;
    const rid = A.newRequestId(this.clock.random(12));
    const body = A.answerBody(gate, value);
    if (!rid || !body) return false;
    return this.sendDecision('answer', rid, gate, (t) => this.io.answer(this.sid as string, body, this.realm, [t]));
  }
  /** The shown gate, when this page may decide it: the turn not over, no decision out, the gate the person saw, and
   *  not one the Hub cannot decide (an approver lease needed, or unreadable: those go to the Agent). */
  private decidable(seen: { id: string; generation: number }): A.Gate | null {
    const gate = this.st.gate;
    if (!gate || !this.sid || this.st.terminal || this.st.decision || this.recovering() || gate.invalid || gate.blocked) return null;
    return gate.id === seen.id && gate.generation === seen.generation ? gate : null;
  }
  /** A decision is stored (the hold's meta `d`, sending) before the door admits it; a refused save sends nothing and the gate
   *  stays decidable. It is never sent twice: a lost answer is read back from the session's state. */
  private sendDecision(kind: 'confirm' | 'answer', rid: string, gate: A.Gate, go: (t: A.Ticket) => Promise<unknown>): boolean {
    const g = this.gen, sid = this.sid, turnId = this.st.turnId, realm = this.realm;
    if (!sid || !turnId || !this.hold) return false;
    const prev = this.d;
    this.d = { rid, gate: gate.id, gen: gate.generation, kind };
    const meta = this.metaOf('running', { sid, turnId, ...(this.k4 ? { k4: this.k4 } : {}) });
    if (!meta) { this.d = prev; return false; }
    this.st = A.reduce(this.st, { type: 'decide', requestId: rid });
    this.publish();
    const decided = (status: number | undefined, body: unknown) => A.reduce(this.st, { type: 'decided', requestId: rid, gateId: gate.id, generation: gate.generation, status, body });
    this.saveSend(g, meta, (ok, lease) => {
      if (!ok) {
        // Not stored, so not sent: the gate is answerable again.
        this.d = prev;
        this.st = decided(undefined, undefined);
        this.reconciling = true;
        return this.reconcile(g);
      }
      this.sendHeld(g, { route: kind, acct: this.input.account, container: this.input.computer, r: realm, sid, gate: gate.id, gen: gate.generation, key: rid }, go, lease, (x) => {
        // Only the route's documented success or a documented "nothing ran" settles the request; anything else (a lost answer, a
        // 2xx that is not the documented success, an unlisted refusal) may have run: the stored decision stays and is read back.
        const verdict = A.heldVerdict(kind, rid, x.ok ? { ok: true, b: x.b } : { ok: false, e: x.e }, { id: gate.id, gen: gate.generation });
        if (verdict === 'unknown' || verdict === 'admitted') { this.reconciling = true; return this.readBack(g); }
        const status = x.ok ? 200 : A.isObj(x.e) && typeof x.e.status === 'number' ? x.e.status : undefined;
        // A rejection carries the agent's reply under data (core's HubError).
        const body = x.ok ? x.b : A.isObj(x.e) ? (x.e.data ?? x.e.body) : undefined;
        this.st = decided(status, body);
        // Still pending (gate_decision_pending keeps the decision), or the reducer asks to read again: read back like a
        // lost answer, never decided again meanwhile.
        if (this.st.decision?.requestId === rid) { this.reconciling = true; return this.readBack(g); }
        // A known answer settles the decision, and so does a proven non-send (refused before it left: nothing to read back about
        // this request; the gate itself is reconciled below).
        this.clearD(rid);
        if (this.st.resync) { this.reconciling = true; return this.reconcile(g); }
        this.follow();
      });
    });
    return true;
  }
  /** Whether a decision of this run may still be out: the reducer holds one, or the stored decision (it survives a reload, where the
   *  reducer holds none) is not yet closed. It is closed only by positive evidence: `proved` (a state snapshot that was read, valid
   *  and applied) that no longer shows its gate parked, or the turn over. A read that proves nothing (null, empty, malformed) closes
   *  nothing. */
  private decisionOut(proved: boolean): boolean {
    if (this.st.decision) return true;
    const d = this.d;
    if (!d) return false;
    if (!proved) return true;
    const gate = this.st.gate;
    return !!gate && gate.id === d.gate && gate.generation === d.gen;
  }
  private recovering(): boolean {
    return this.reconciling && !this.st.terminal;
  }
  /** The reducer asked to read again: Ask's recovery (receipt, state and replay together, retried after a wait on any
   *  failure) reconciles the turn, and the stream reopens from it. */
  private reconcile(g: number): void {
    this.es?.close();
    this.es = null;
    this.publish();
    this.resync(g);
  }
  // A decision whose answer was lost is read back from the session's state (the gate still parked, resolved, or
  // the turn moved on), never sent again on its own.
  // The reads are stamped with the epoch and gate revision at dispatch: one that answers after the gate or the turn
  // moved on (the turn ended meanwhile) cannot bring the gate back.
  private readBack(g: number): void {
    if (!this.sid || this.st.terminal) return;
    const ep = this.st.epoch, rev = this.st.gateRev;
    void Promise.all([settle(this.io.state(this.sid, this.realm)), settle(this.io.replay(this.sid, this.realm))]).then(([s, r]) => {
      if (!this.live(g) || this.st.terminal) return;
      this.st = A.reduce(this.st, { type: 'reply', epoch: ep, rev, state: s.ok ? s.b : null, replay: r.ok ? r.b : null });
      if (this.st.resync) return this.reconcile(g);
      // Settled only by a read that answered, was applied whole (not dropped for a moved incarnation, its snapshot not
      // left out for a moved gate) and left no decision out; anything else is read again after a wait.
      if (s.ok && r.ok && !this.st.replyDropped && !this.st.stateLeftOut && !this.decisionOut(stateProved(s.b))) { this.reconciling = false; this.clearD(); }
      else this.later(() => this.readBack(g), REOPEN_MS);
      this.follow();
    });
  }

  // ---- stop ----
  stop(): boolean {
    const p = this.phase;
    const turnId = this.st.turnId;
    if (!this.sid || this.k4 || !turnId || !this.metaBase('running') || (p !== 'working' && p !== 'waiting')) return false;
    this.k4 = A.newKey(this.clock.random(16));
    if (!this.k4) return false;
    const g = this.gen, k4 = this.k4;
    const meta = this.metaOf('running', { sid: this.sid, turnId, k4 });
    if (!meta) { this.k4 = null; return false; }
    this.st = A.reduce(this.st, { type: 'stop' });
    this.set('stopping');
    // The stop's key is stored before it leaves; refused: the stop is not sent and the turn runs as before.
    this.saveSend(g, meta, (ok, lease) => {
      if (ok) return this.sendStop(g, lease);
      this.k4 = null;
      this.st = A.reduce(this.st, { type: 'stopRefused', turnId: this.st.turnId });
      this.follow();
    });
    return true;
  }
  private sendStop(g: number, lease: (() => void) | null): void {
    const sid = this.sid as string, k4 = this.k4 as string, replay = this.checking, realm = this.realm;
    this.sendHeld(g, { route: 'command', acct: this.input.account, container: this.input.computer, r: realm, sid, cmd: 'stop', key: k4 }, (t) => this.io.stop(sid, k4, realm, [t]), lease, (x) => {
      this.checking = false;
      if (!x.ok) return this.refusal(x.e, 'stop', replay);
      this.unknown = null;
      // The stream brings the turn's end; a turn already over is read from its receipt.
      if (!this.es) this.readReceipt(g);
      this.follow();
    });
  }
}
