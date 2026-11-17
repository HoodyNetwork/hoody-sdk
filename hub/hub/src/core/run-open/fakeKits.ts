// Test-only: the SDK's FakeKits (hoody-sdk/tests/unit/helpers/run-open-fake-kits.ts), copied unchanged below this
// header, so the Hub drives the same shared machine against the same published kit shapes. Never imported by app code.
/* eslint-disable @typescript-eslint/no-explicit-any */
// Hub change: base64 without node's Buffer (core's tsc has no node types).
const b64 = (s: string): string => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
/**
 * A fake run-1 + terminal + display kit set for run-open-core, on a virtual clock.
 *
 * Shapes follow the kits' published shapes: every error
 * body is {error, code}; incarnations are 32 hex; command ids are numeric strings. The fake keeps
 * the behaviour the core's evidence rules depend on: exclusive create, digest replay of a tracked
 * execute, a workload record that only it decides, signals keyed by (I, C) (a repeat is not a no-op), and labelled
 * Docker containers that outlive the workload until removed.
 */

type Target = { kit: 'run' | 'terminal' | 'display'; index: number };
export interface Sent { target: Target; method: string; path: string; query?: Record<string, string>; body?: any }
export interface Answer { status: number; body?: unknown }
/** One-shot interceptor: return 'drop-request' (rejects, nothing done), 'drop-reply' (done, then rejects), an Answer, or undefined. */
export type Fault = (s: Sent) => 'drop-request' | 'drop-reply' | 'not-sent' | 'preflight' | Answer | undefined;

export interface WorkloadRec {
  terminal_id: string;
  incarnation: string;
  command_id: string;
  track_label: string;
  state: 'pending' | 'running' | 'gone' | 'never_started' | 'unknown';
  exit_code: number | null;
  signal: string | null;
  reason: string | null;
  user: string;
  uid: number;
  members: number[];
  digest: string;
  env: Record<string, string>;
  command: string;
  /** Hub change (Open with): the folder the command ran in (the execute's cwd, else the shell's folder). */
  ranIn?: string;
}

export interface AppBehaviour {
  /** Signals the app survives (INT, TERM). KILL always ends it unless a member runs as another user. */
  ignores?: string[];
  /** A member runs as another uid (sudo): never signalled, so gone is never reached. */
  otherUserMember?: boolean;
  /** Stay pending forever (the helper never gets go). */
  neverGo?: boolean;
  /** Reads before pending becomes running. */
  goAfterReads?: number;
  /** Exit by itself after this many running reads, with this code. */
  exitAfterReads?: number;
  exitCode?: number;
  /** An OCI launch: on go, a labelled container appears. */
  oci?: boolean;
  /** A labelled container appears only after the workload is gone (a create in flight at kill time). */
  lateContainer?: boolean;
}

const ALL_RUN = { args: true, pass_env: true, launch_tag: true, launch_env: true, catalog: true };
const ALL_TERM = { exclusive_create: true, require_staged: true, incarnation: true, tracked_exec: true, effective_uid: true };

export class FakeKits {
  clock = 0;
  sent: Sent[] = [];
  faults: Fault[] = [];
  runCaps: Answer = { status: 200, body: { service: 'run', features: { ...ALL_RUN } } };
  termCaps: Answer = { status: 200, body: { service: 'terminal', features: { ...ALL_TERM } } };
  resolve: Answer = FakeKits.resolveAnswer({});
  catalog: Answer = { status: 200, body: { entries: [{ catalog_id: 'htop', name: 'htop', description: 'Process viewer', opens_in: 'terminal', available: true }] } };
  /** Sessions by terminal id. */
  sessions = new Map<number, { incarnation: string; user: string; uid: number; foreign?: boolean; cwd?: string }>();
  createAs: { user: string; uid: number | null | undefined; incarnation?: string | null } = { user: 'user', uid: 1000 };
  /** Hub change (Open with): what a create answer echoes for a body `shell`: the kit's own normalisation
   *  ('/bin/bash' -> 'bash'), nothing (an old kit that ignores the field), or a fixed value. */
  createShellEcho: 'normalized' | 'none' | { shell: string } = 'normalized';
  /** Hub change (Open with): where the shell is after its startup files ran (a startup `cd ~`); default the create's cwd. */
  startupCwd?: string;
  createError?: Answer;
  stagingFails = false;
  workloads: WorkloadRec[] = [];
  /** Command ids held by another caller (anywhere on the kit). */
  foreignCommandIds = new Set<string>();
  behaviour: AppBehaviour = {};
  reads = new Map<string, number>();
  ports: Array<Record<string, unknown>> = [];
  windows: Array<Record<string, unknown>> = [];
  /** Labelled containers: id → tag. */
  containers = new Map<string, string>();
  dockerFault?: 'exit1' | 'truncated' | 'garbage' | 'root';
  executions = 0;
  deletes: Array<{ n: number; incarnation?: string }> = [];
  private incSeq = 0;

  static resolveAnswer(over: {
    title?: string; kind?: string; provider?: string; starter?: unknown; launchEnv?: unknown; command?: string; suggested?: string;
  }): Answer {
    const selected: Record<string, unknown> = {
      candidate_id: 'c1', title: over.title ?? 'htop', kind: over.kind ?? 'any', provider: over.provider ?? 'nix', source_id: 's',
    };
    if (over.starter !== undefined) selected.starter = over.starter;
    return {
      status: 200,
      body: {
        status: 'dry-run', set_id: 'set1', selected,
        shell_command: over.command ?? "'htop'",
        launch_env: over.launchEnv ?? { HOODY_AI_KEY: { value: 'ai-secret-value-123', secret: true } },
        handoff: { state: 'preview', terminal_id: 1, display: '1', suggested: { band: [8001, 9999], opens_in: over.suggested ?? 'terminal' } },
        warnings: [],
      },
    };
  }

  now = (): number => this.clock;
  sleep = async (ms: number): Promise<void> => { this.clock += ms; };
  /** Deterministic "random" bytes: a counter, so C and L differ per call but tests are stable. */
  private rnd = 1;
  random = (n: number): Uint8Array => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = (this.rnd++ * 37 + i * 11) & 0xff;
    return out;
  };

  newIncarnation(): string {
    this.incSeq++;
    return this.incSeq.toString(16).padStart(32, 'a');
  }

  of(path: string, method?: string): Sent[] {
    return this.sent.filter((s) => s.path === path && (method === undefined || s.method === method));
  }

  send = async (target: Target, method: string, path: string, query?: Record<string, string>, body?: unknown): Promise<Answer> => {
    const s: Sent = { target, method, path, ...(query ? { query } : {}), ...(body !== undefined ? { body: JSON.parse(JSON.stringify(body)) } : {}) };
    this.sent.push(s);
    for (let i = 0; i < this.faults.length; i++) {
      const verdict = this.faults[i]!(s);
      if (verdict === undefined) continue;
      this.faults.splice(i, 1);
      if (verdict === 'drop-request') throw new Error('network');
      if (verdict === 'not-sent') throw Object.assign(new Error('blocked'), { notSent: true });
      if (verdict === 'preflight') throw Object.assign(new Error('refused'), { code: 'preflight_refused' });
      if (verdict === 'drop-reply') { this.handle(s); throw new Error('reply lost'); }
      return verdict;
    }
    return this.handle(s);
  };

  private err(status: number, code: string): Answer { return { status, body: { error: code.toLowerCase(), code } }; }

  private handle(s: Sent): Answer {
    const { target, method, path } = s;
    if (target.kit === 'run') {
      if (path === '/api/v1/run/capabilities') return this.runCaps;
      // A fresh object per answer, as over HTTP (the core scrubs the answer it reads in place).
      if (path === '/api/v1/run/resolve') return structuredClone(this.resolve);
      if (path === '/api/v1/run/catalog') return this.catalog;
      return this.err(404, 'NOT_FOUND');
    }
    if (target.kit === 'display') {
      if (path === '/api/v1/display/windows') return { status: 200, body: { success: true, display: target.index, focusedWindowId: null, windows: this.windows } };
      return this.err(404, 'NOT_FOUND');
    }
    const n = target.index;
    if (path === '/api/v1/terminal/capabilities') return this.termCaps;
    if (path === '/api/v1/terminal/sessions') {
      return { status: 200, body: [...this.sessions.entries()].map(([id, v]) => ({ id: String(id), terminal_id: String(id), incarnation: v.incarnation, user: v.user, uid: v.uid })) };
    }
    if (path === '/api/v1/system/ports') return { status: 200, body: this.ports };
    if (path === '/api/v1/terminal/create') {
      if (this.createError) return this.createError;
      if (this.sessions.has(n)) return this.err(409, 'SESSION_EXISTS');
      const inc = this.createAs.incarnation === undefined ? this.newIncarnation() : this.createAs.incarnation;
      const asked = s.body as { cwd?: string; shell?: string } | undefined;
      this.sessions.set(n, { incarnation: inc ?? '', user: this.createAs.user, uid: this.createAs.uid ?? -1, cwd: this.startupCwd ?? asked?.cwd ?? '/home/user' });
      const body: Record<string, unknown> = { status: 'ok', terminal_id: String(n), user: this.createAs.user, display_id: n };
      const echo = this.createShellEcho;
      if (typeof asked?.shell === 'string' && echo !== 'none') body.shell = echo === 'normalized' ? asked.shell.replace(/^\/bin\/bash$/, 'bash') : echo.shell;
      if (this.createAs.uid !== undefined) body.uid = this.createAs.uid;
      if (inc !== null) body.incarnation = inc;
      return { status: 200, body };
    }
    if (path === '/api/v1/terminal/execute' && s.query?.ephemeral === 'true') return this.raw(s.body);
    if (path === '/api/v1/terminal/execute') return this.execute(n, s.body);
    if (path === '/api/v1/terminal/workloads') return this.readWorkloads(n, s.query ?? {});
    const sig = /^\/api\/v1\/terminal\/workloads\/(\d+)\/signal$/.exec(path);
    if (sig && method === 'POST') return this.signal(n, sig[1]!, s.body);
    const del = /^\/api\/v1\/terminal\/(\d+)$/.exec(path);
    if (del && method === 'DELETE') {
      this.deletes.push({ n: Number(del[1]), incarnation: s.query?.incarnation });
      const cur = this.sessions.get(n);
      if (!cur) return this.err(404, 'SESSION_NOT_FOUND');
      if (s.query?.incarnation !== cur.incarnation) return this.err(409, 'INCARNATION_MISMATCH');
      this.sessions.delete(n);
      for (const w of this.workloads) if (w.incarnation === cur.incarnation && w.state === 'pending') { w.state = 'never_started'; w.reason = 'deleted'; }
      return { status: 200, body: { message: 'Terminal session deleted', terminal_id: String(n), incarnation: cur.incarnation } };
    }
    return this.err(404, 'NOT_FOUND');
  }

  private view(w: WorkloadRec): Record<string, unknown> {
    const { digest: _d, env: _e, command: _c, ranIn: _r, ...pub } = w;
    return { ...pub, members: w.state === 'running' ? [...w.members] : [] };
  }

  private execute(n: number, b: any): Answer {
    const cur = this.sessions.get(n);
    if (!cur || cur.incarnation !== b.incarnation) return this.err(409, 'INCARNATION_MISMATCH');
    const digest = JSON.stringify([b.incarnation, b.command, b.cwd ?? null, b.env, b.track_label]);
    const existing = this.workloads.find((w) => w.incarnation === b.incarnation && w.command_id === b.id);
    if (existing) {
      if (existing.digest !== digest) return this.err(409, 'COMMAND_ID_EXISTS');
      return { status: 200, body: { terminal_id: String(n), command_id: b.id, incarnation: b.incarnation, replayed: true, user: 'user', uid: 1000, workload: this.view(existing) } };
    }
    if (this.foreignCommandIds.has(b.id)) return this.err(409, 'COMMAND_ID_EXISTS');
    if (this.stagingFails) return this.err(409, 'STAGING_UNAVAILABLE');
    this.executions++;
    const w: WorkloadRec = {
      terminal_id: String(n), incarnation: b.incarnation, command_id: b.id, track_label: b.track_label,
      state: 'pending', exit_code: null, signal: null, reason: null, user: 'user', uid: 1000,
      members: [5000 + Number(b.id) % 1000, 7000 + Number(b.id) % 1000], digest, env: { ...b.env }, command: b.command,
      ranIn: b.cwd ?? cur.cwd,
    };
    this.workloads.push(w);
    return { status: 200, body: { terminal_id: String(n), command_id: b.id, incarnation: b.incarnation, status: 'running', started: false, replayed: false, user: 'user', uid: 1000, workload: this.view(w) } };
  }

  private tagOf(w: WorkloadRec): string | undefined {
    return /^run:oci:([0-9a-f]{16})$/.exec(w.track_label)?.[1];
  }

  private advance(w: WorkloadRec): void {
    const key = w.incarnation + ':' + w.command_id;
    const r = (this.reads.get(key) ?? 0) + 1;
    this.reads.set(key, r);
    const b = this.behaviour;
    if (w.state === 'pending' && !b.neverGo && r >= (b.goAfterReads ?? 1)) {
      w.state = 'running';
      const tag = this.tagOf(w);
      if (tag && b.oci && !b.lateContainer) this.containers.set('a'.repeat(52) + String(Number(w.command_id)).padStart(12, '0'), tag);
      this.reads.set(key, 0);
    } else if (w.state === 'running' && b.exitAfterReads !== undefined && r >= b.exitAfterReads) {
      this.end(w, b.exitCode ?? 0, null);
    }
  }

  private end(w: WorkloadRec, code: number | null, signal: string | null): void {
    w.state = 'gone'; w.exit_code = code; w.signal = signal; w.members = [];
    const tag = this.tagOf(w);
    if (tag && this.behaviour.lateContainer) this.containers.set('b'.repeat(52) + String(Number(w.command_id)).padStart(12, '0'), tag);
  }

  private readWorkloads(n: number, q: Record<string, string>): Answer {
    const list = this.workloads.filter((w) => w.terminal_id === String(n)
      && (q.incarnation === undefined || w.incarnation === q.incarnation)
      && (q.command_id === undefined || w.command_id === q.command_id));
    for (const w of list) this.advance(w);
    return { status: 200, body: { terminal_id: String(n), workloads: list.map((w) => this.view(w)) } };
  }

  private signal(_n: number, c: string, b: any): Answer {
    const w = this.workloads.find((x) => x.incarnation === b.incarnation && x.command_id === c);
    if (!w) return this.err(404, 'WORKLOAD_NOT_FOUND');
    if (w.state === 'pending') { w.state = 'never_started'; w.reason = 'signalled'; return { status: 200, body: { delivered: 0, failed: [], workload: this.view(w) } }; }
    if (w.state !== 'running') return { status: 200, body: { delivered: 0, failed: [], workload: this.view(w) } };
    const failed = this.behaviour.otherUserMember ? [{ pid: 9999, errno: 1, reason: 'other_user' }] : [];
    const survives = b.signal !== 'KILL' && (this.behaviour.ignores ?? []).includes(b.signal);
    if (!survives && !this.behaviour.otherUserMember) this.end(w, null, 'SIG' + b.signal);
    return { status: 202, body: { delivered: w.members.length || 2, failed, workload: this.view(w) } };
  }

  private raw(b: any): Answer {
    if (this.dockerFault === 'root') return { status: 200, body: { mode: 'raw', exit_code: 0, user: 'root', uid: 0, stdout_b64: '', stdout_truncated: false } };
    const out = (text: string, exit = 0, truncated = false): Answer => ({
      status: 200, body: { mode: 'raw', exit_code: exit, user: b.user, uid: 1000, stdout_b64: b64(text), stdout_truncated: truncated, stderr_b64: '' },
    });
    const ps = /^docker ps -a --no-trunc --filter label=hoody\.run\.tag=([0-9a-f]{16}) --format '\{\{json \.\}\}'$/.exec(b.command);
    if (ps) {
      if (this.dockerFault === 'exit1') return out('', 1);
      if (this.dockerFault === 'garbage') return out('not json\n');
      const lines = [...this.containers.entries()].filter(([, t]) => t === ps[1]).map(([id]) => JSON.stringify({ ID: id, Names: 'hoody-run-' + ps[1] }));
      if (this.dockerFault === 'truncated') return out(lines.join('\n'), 0, true);
      return out(lines.length ? lines.join('\n') + '\n' : '');
    }
    const rm = /^docker rm -f ((?:[0-9a-f]{12,64} ?)+)$/.exec(b.command);
    if (rm) {
      for (const id of rm[1]!.trim().split(' ')) this.containers.delete(id);
      return out('');
    }
    return out('', 127);
  }
}
