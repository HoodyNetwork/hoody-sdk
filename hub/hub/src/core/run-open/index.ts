// core/run-open: the apps Open step machine for Hub v3, a typed facade over the shared run-open core.
//
// Contract:
//   - run-open-core.js beside this file is the SDK's lib/run-open-core.js byte for byte (also served as
//     public/auth/hub-run-open-core.js): ONE step machine for the SDK, the CLI and the Hub,
//     except the changes listed in sdk-carry.ts, which go to the SDK and are copied back. run-open.test.ts
//     fails on any other difference. Nothing else is edited here.
//   - It defines one frozen global, HoodyRunOpenCore, and is pure: the transport (send), clock (now, sleep) and
//     randomness are injected. It keeps nothing; the page holds handles, and access codes stay in memory only.
//   - send(target, method, path, query?, body?) is NOT a C9 outcome. It resolves {status, body, retryAfterMs?} for
//     ANY HTTP answer and rejects {notSent: true} only when the request provably never left, {code:
//     'preflight_refused'} for the access-policy refusal, and anything else for "no answer / outcome unknown". The
//     machine owns C9: an execute it re-sends is the identical request (same terminal incarnation, command id and
//     body), a signal only when it provably never left, never under a new key; so send() must not retry, mint a key
//     per call, or map answers.
//   - Every result is {ok, code, message, state?, reason?, handle?, ...}; code is a MESSAGES key a page maps to its
//     own strings (never shows `message`, which is the SDK's English). A failure with notSent and no state is
//     definite: nothing started. state 'unknown' means it may have gone through.
//   - Resolve answers hold secret values (launch_env). The machine scrubs what it reads; a caller holding a
//     resolve answer it will not pass on (dropped, stale) calls scrubResolveAnswer(answer) on it.
//   - A workload that ended on SIGINT or SIGTERM was stopped (close() sends those first; a reload reads the
//     record back): open/status/watch report it as state and code 'stopped', ok, keeping exit_code and signal.
//     Any other exit keeps the machine's verdict: a non-zero code or SIGKILL is 'exited_error'.
//   - open()'s 'execute' progress carries the handle before the request leaves (persist it then): a later
//     attempt under a new command id announces its own handle, which replaces the earlier one.
//   - Open with (sdk-carry.ts): a window app's execute keeps the kit's bounded display wait; an execute carries
//     req.cwd; open()'s beforeExecute(handle) is awaited before each new command id and only `true` sends it (else
//     not_durable, notSent, the terminal deleted); status/watch/close take expectTag, and a record that does not name
//     it reads unknown/foreign_record, close then sending no signal and no DELETE (nor after a failed read);
//     req.shell 'bash' creates the terminal with /bin/bash and executes only when the create answer echoes bash
//     (else shell_unavailable, notSent). Without these options the machine sends what it sent before.
//   - Leftover terminals (sdk-carry C1): a refusal after the create (still notSent) or a confirmed stop carries
//     `leftover` when the terminal's DELETE was not proven (deleted, already gone, already replaced); the page keeps it
//     listed, and discard(leftover) sends only that DELETE ('removed' on the same proof, else 'remove_unconfirmed').
import './run-open-core.js';

export type RunState = 'starting' | 'started' | 'running' | 'ready' | 'exited' | 'not_started' | 'stopped' | 'unknown';
export type OpensInWire = 'window' | 'terminal' | 'web';

export interface RunTarget {
  kit: 'run' | 'terminal' | 'display';
  index: number;
}
export interface RunAnswer {
  status: number;
  body?: unknown;
  retryAfterMs?: number;
}
export type RunSend = (target: RunTarget, method: string, path: string, query?: Record<string, string | number | boolean>, body?: unknown) => Promise<RunAnswer>;

/** One launch on one computer: terminal N, incarnation I, command C (compact form "N:I:C"). */
export interface RunHandle {
  v: number;
  terminal_id: number;
  incarnation: string;
  command_id: number;
  display: number;
  computer?: { project: string; computer_id: string };
  launch_tag?: string;
  kind?: 'oci' | 'app';
  opens_in?: OpensInWire;
  web?: { port: number; path: string };
  name?: string;
}

/** A terminal the machine made and could not prove closed (no command runs in it). */
export interface RunLeftover {
  terminal_id: number;
  incarnation: string;
  computer?: { project: string; computer_id: string };
  launch_tag?: string;
}

export interface RunResult {
  ok: boolean;
  code: string;
  message: string;
  state?: RunState;
  reason?: string;
  handle?: RunHandle;
  notSent?: boolean;
  transient?: boolean;
  replayed?: boolean;
  exit_code?: number | null;
  signal?: string | null;
  ipv6_only?: boolean;
  details?: { command?: string; title?: string; provider?: string; kind?: string; env_names?: string[] };
  /** A generated starter secret (the Jupyter access code): shown once, held in memory only. */
  access?: { name: string; value: string };
  entries?: Record<string, unknown>[];
  /** A terminal left open: kept by the page until discard() proves it closed. */
  leftover?: RunLeftover;
}

export interface RunProgress {
  state?: RunState;
  phase?: string;
  handle?: RunHandle;
  code?: string;
  /** On open()'s last event when the admission answer already carried the record (as on its result). */
  exit_code?: number | null;
  signal?: string | null;
}

export interface OpenRequest {
  app: string;
  catalog?: boolean;
  pick?: { candidate_id: string; set_id?: string };
  args?: string[];
  /** Values ride only in execute's staged env, never in the command. */
  env?: Record<string, string>;
  cwd?: string;
  selector?: Record<string, unknown>;
  opensIn?: 'window' | 'terminal';
  /** Pin the launch terminal's shell to bash (the only value); proven from the create answer before any execute. */
  shell?: 'bash';
}

/** Reads of a recovered handle: the record counts only when its track label names this launch tag (16 hex). */
export interface ExpectTag {
  expectTag?: string;
}

export interface RunOpenDeps {
  send: RunSend;
  user?: string;
  computer?: { project: string; computer_id: string };
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: (n: number) => Uint8Array;
}

export interface RunOpen {
  capabilities(): Promise<RunResult>;
  catalog(q?: string): Promise<RunResult>;
  open(req: OpenRequest, opts?: {
    onProgress?: (e: RunProgress) => void;
    signal?: AbortSignal;
    /** Awaited before each new command id leaves; anything but true sends no execute (not_durable, notSent). */
    beforeExecute?: (handle: RunHandle) => Promise<boolean> | boolean;
  }): Promise<RunResult>;
  status(target: RunHandle | string | number, opts?: ExpectTag): Promise<RunResult>;
  watch(target: RunHandle | string | number, opts?: { onProgress?: (e: RunResult) => void; signal?: AbortSignal; timeoutMs?: number } & ExpectTag): Promise<RunResult>;
  close(target: RunHandle | string | number, opts?: { signal?: AbortSignal } & ExpectTag): Promise<RunResult>;
  find(n: number): Promise<RunResult>;
  /** Only the leftover's DELETE: 'removed' when proven, else 'remove_unconfirmed'. */
  discard(lo: RunLeftover): Promise<RunResult>;
}

interface CoreGlobal {
  VERSION: number;
  LIMITS: Readonly<Record<string, number>>;
  STATES: readonly RunState[];
  MESSAGES: Readonly<Record<string, string>>;
  RUN_FEATURES: readonly string[];
  TERMINAL_FEATURES: readonly string[];
  createRunOpen(deps: RunOpenDeps): RunOpen;
  exitCodeFor(r: RunResult | null): number;
  parseTarget(input: unknown): { terminal: number } | { handle: RunHandle } | null;
  formatHandle(h: RunHandle): string;
  message(code: string, vars?: { name?: string }): string;
  scrubResolveAnswer(answer: unknown): number;
}

function core(): CoreGlobal {
  const c = (globalThis as { HoodyRunOpenCore?: CoreGlobal }).HoodyRunOpenCore;
  if (!c) throw new Error('run-open core is not loaded');
  return c;
}

const STOP_SIGNALS: ReadonlySet<string> = new Set(['SIGINT', 'SIGTERM']);

/** An exit on a stop signal reads as the stop it was (in place; returns r). */
function asStop(x: RunResult): RunResult {
  if (x && x.state === 'exited' && typeof x.signal === 'string' && STOP_SIGNALS.has(x.signal)) {
    x.state = 'stopped';
    x.code = 'stopped';
    x.ok = true;
    x.message = core().message('stopped', { ...(x.handle?.name ? { name: x.handle.name } : {}) });
  }
  return x;
}

/** The machine over an injected transport (see the contract: send is raw, the machine owns C9). */
export function createRunOpen(deps: RunOpenDeps): RunOpen {
  const m = core().createRunOpen(deps);
  return Object.freeze({
    capabilities: () => m.capabilities(),
    catalog: (q?: string) => m.catalog(q),
    open: (req: OpenRequest, opts?: Parameters<RunOpen['open']>[1]) => {
      const listen = opts?.onProgress;
      return m.open(req, listen ? { ...opts, onProgress: (e: RunProgress) => listen(asStop(e as RunResult)) } : opts).then(asStop);
    },
    status: (t: RunHandle | string | number, opts?: ExpectTag) => m.status(t, opts).then(asStop),
    watch: (t: RunHandle | string | number, opts?: Parameters<RunOpen['watch']>[1]) => {
      const listen = opts?.onProgress;
      return m.watch(t, listen ? { ...opts, onProgress: (e: RunResult) => listen(asStop(e)) } : opts).then(asStop);
    },
    close: (t: RunHandle | string | number, opts?: Parameters<RunOpen['close']>[1]) => m.close(t, opts),
    find: (n: number) => m.find(n),
    discard: (lo: RunLeftover) => m.discard(lo),
  });
}
/** The id half of a stored or handed computer reference: `computer_id` (the SDK handle's spelling, the only one
 *  written), else what an older Hub stored, `computer`, else `container` (before it; read only). The newest
 *  spelling present decides: an unusable one is undefined, never rescued by an older one. */
export function computerIdOf(c: unknown): string | undefined {
  if (!c || typeof c !== 'object') return undefined;
  const o = c as Record<string, unknown>;
  for (const k of ['computer_id', 'computer', 'container'] as const) if (o[k] !== undefined) return typeof o[k] === 'string' ? o[k] : undefined;
  return undefined;
}
/** Blanks the secret values of a resolve answer nobody will pass to the machine. Returns how many it blanked. */
export const scrubResolveAnswer = (answer: unknown): number => core().scrubResolveAnswer(answer);
export const parseRunTarget = (input: unknown) => core().parseTarget(input);
export const formatRunHandle = (h: RunHandle): string => core().formatHandle(h);
/** The outcome codes a page maps to its own strings. */
export const runOpenCodes = (): readonly string[] => Object.keys(core().MESSAGES);
export const RUN_OPEN_LIMITS = (): Readonly<Record<string, number>> => core().LIMITS;

export { BAND, LEGACY_BAND, RESOLVE_CODES, RESOLVE_PATH, RUN_OPEN_ROUTES, inBand, inHeld, qs, route } from './kitRoutes';
