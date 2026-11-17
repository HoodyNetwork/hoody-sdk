// lifecycle.ts: the ONE application lifecycle of the terminal Hub. Every way in (the live entry a CLI mounts, the fixture
// entry dev.ts / render.ts / termshot runners use, tests) goes through startTermHub:
//
//   host env (preinstall, once per process) -> strict globals (optional, once per process) -> styles checked (REQUIRED,
//   styles.ts: a missing value rejects before anything starts) -> begin session (its stores, vault, locks and host
//   services) -> class styles installed at the terminal's width -> console captured -> boot core (injected: live or
//   fixtures, so a ship build never imports fixtures) -> mount (runTerm: renderer, app, router) -> ... -> end -> dispose,
//   in this order, each step run even when an earlier one threw: renderer and React tree (runTerm.end), query client
//   (cancel + clear), core session (boot.dispose: purge, transport, lifecycle config), shell stores (menus), class styles
//   removed, console given back, session (stores, vault, locks; waiting lock requests refused), colour tier back.
//   Nothing of the mount stays registered.
//
// A mount never hides a failure: a strict-global trap while it lives ends it at once as a crash (a swallowed
// read included: the page that swallowed it may stay blank), a render error outside the page boundaries is a crash, and
// TermHubEnd.ok is false for a crash, a failed boot, any trap or any failed dispose step. Everything the engine or the
// app writes to the console while the mount lives, and every failure, is kept as the mount's `problems`: allowlisted
// records (diagnostic.ts: kind, code, class name, component path), never messages, error objects or bodies,
// never written over the frame. `reason` is the safe end reason the host reports.
//
// One mount at a time per process (the session: TERM_SESSION_ACTIVE).
import '../env/preinstall';
import { focusManager, onlineManager, type QueryClient } from '@tanstack/react-query';
import { hostEnv } from '../../core/host-env';
import type { PageManifest } from '@kit/page';
import { createTermApp } from './App';
import { runTerm, type TermExit, type TermRun, type TermRunOptions } from './run';
import type { SecretScreenAsk } from './secret-screen-ctx';
import { assertStyles, type TermStyles } from './styles';
import { setStyleTable, setStyleTables, setStyleWidth } from '../jsx/style';
import { safeDiagnostic } from '../prim/safe';
import { TermGlobalError } from '../env/strict-globals';
import { viewsLoading } from './router';
import { whenIdle as idleOf, type WhenIdleResult } from './idle';
import { diagnosticLine, diagnosticOf, diagnosticsOf, publicDiagnostic, srcFrames, type Diagnostic } from './diagnostic';
import { pageFailures } from './router';
import { beginTermSession, type TermHostServices, type TermSession } from '../env/session';
import { activeStrictGlobals, installStrictGlobals } from '../env/strict-globals';
import { closeMenu } from '../shell/menus-store';
import { colourTier, setColourTier, type ColourTier } from '../prim';
import type { CliRenderer } from '../prim/otui';

export type DisposeReason = 'term-quit' | 'term-abort' | 'term-error';

/** How core is booted for one mount. Live and fixture boots implement it; the lifecycle never imports either. */
export interface TermBoot {
  /** Boots core on the open session. `end` lets core end the mount itself (session expired, signed out). A rejection
   *  fails the mount before anything is drawn. */
  start(session: TermSession, end: (why: 'expired' | 'signed-out') => void): Promise<void>;
  /** True once core showed the account suspended (403 ACCOUNT_BANNED) during this mount: the end reason says so. */
  suspended?(): boolean;
  /** Closes the send gate: from here no request of this mount reaches the wire (a call waiting for its turn is refused
   *  unsent; one already out settles stale). Called FIRST whenever the mount ends (quit, abort, signal, crash, core's
   *  own end), before the app is unmounted and the renderer shut down; dispose still follows.
   *  Idempotent. */
  closeGate?(): void;
  /** The mount's screen asking (run.ts secretScreenFor), handed over once the renderer exists, before the first frame
   *  (after start: core's boot runs before anything is drawn). A live boot's send policy asks it from then on. */
  screen?(ask: SecretScreenAsk): void;
  /** Undoes start. Runs exactly once per mount, after the app is unmounted, whether start finished, failed or never ran
   *  to its end; it must leave core reusable by the next mount in this process. */
  dispose(reason: DisposeReason): Promise<void>;
}

export interface TermHubOptions {
  pages: readonly PageManifest[];
  /** The route opened first (path + query). */
  path: string;
  boot: TermBoot;
  queryClient: QueryClient;
  /** The class-style tables (styles.ts). REQUIRED: a missing value is a start error, never a default. */
  styles: TermStyles;
  /** Keep each problem's sanitised message too (diagnostic.ts `detail`), and show it on a failed page. Only for a
   *  developer's own run (dev.ts): the ship entry never sets it, and the host receipt never carries it. */
  diagnosticDetail?: boolean;
  /** The test-renderer seam (run.ts createRenderer): render.ts, goldens, shots, scenarios and tests mount through here. */
  createRenderer?: TermRunOptions['createRenderer'];
  /** Services the host lends this mount (clipboard, browser). Absent members are absent facilities. */
  host?: TermHostServices;
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  width?: number;
  height?: number;
  colourTier?: ColourTier;
  /** Own the process: signals, suspend, uncaught errors (a runner); false for a mount inside a host program. */
  process?: boolean;
  /** Install strict globals (once per process; a DOM global read anywhere then throws and is recorded). */
  strictGlobals?: boolean;
  /** Abort = a forced close: nothing is asked. */
  signal?: AbortSignal;
  onFrame?(n: number): void;
  onResize?(cols: number, rows: number): void;
  /** Where a crash's text goes once the terminal is restored (it is passed through safeDiagnostic first). */
  report?(text: string): void;
}

export interface TermHubEnd {
  exit: TermExit | { reason: 'expired'; code: 0 } | { reason: 'signed-out'; code: 0 } | { reason: 'boot-failed'; code: 1; error: unknown };
  /** The safe end reason (no error, no text): what a host prints and decides on. */
  reason: EndReason;
  /** The page and route shown last. */
  lastView: { page: string; path: string; search: Record<string, string> };
  /** Failures of the teardown steps, as diagnostic records (never thrown: the mount still ended). The raw errors are
   *  not kept; neither is a crash's or failed boot's: `exit.error` holds its record. */
  disposeErrors: Diagnostic[];
  /** Strict-global traps recorded during this mount (names), swallowed ones included: a check fails on any. */
  traps: string[];
  /** What the mount wrote to the console and the crash report, sanitised (at most PROBLEMS_MAX lines, the last says
   *  how many were dropped). Console lines alone do not fail a mount. */
  problems: Diagnostic[];
  /** False for a crash, a failed boot, any trap or any failed dispose step: the host's exit code is then non-zero. */
  ok: boolean;
}

export interface TermHub {
  /** Settles once, after every dispose step ran. */
  closed: Promise<TermHubEnd>;
  /** Ends the mount (as an abort unless said otherwise). */
  end(reason?: 'quit' | 'abort'): Promise<TermHubEnd>;
  renderer(): CliRenderer | null;
  /** Resolves once nothing that could change the frame is on its way (idle.ts: queries, mutations, page views and, when
   *  the runner tracks them, short timers), then `still` identical frames; or at the deadline, naming what is pending. */
  whenIdle(o?: { still?: number; deadlineMs?: number }): Promise<WhenIdleResult>;
}

/** The most problem records a mount keeps (the last one counts the rest: code PROBLEMS_DROPPED). */
export const PROBLEMS_MAX = 100;

/** Why a mount ended, as a host reports it. */
export type EndReason = 'quit' | 'closed' | 'expired' | 'signed-out' | 'suspended' | 'crashed' | 'boot-failed';

export function endReasonOf(exit: TermHubEnd['exit'], suspended: boolean): EndReason {
  switch (exit.reason) {
    case 'crash': return 'crashed';
    case 'boot-failed': return suspended ? 'suspended' : 'boot-failed';
    case 'expired': return 'expired';
    case 'signed-out': return 'signed-out';
    default: return suspended ? 'suspended' : exit.reason === 'quit' ? 'quit' : 'closed';
  }
}

/** The console methods a mount captures while it lives (none may write over the frame). */
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;

/** The strict-global traps of this process so far (every read, swallowed or not). Empty when strict globals are off. */
/** The trap rows a mount's end keeps (the first ones; the mount failed on the first anyway). */
const MOUNT_TRAPS = 20;

export function strictTraps(): ReadonlyArray<{ name: string; stack: string }> {
  return activeStrictGlobals()?.ledger() ?? [];
}

/**
 * Turns strict globals on for this process (idempotent). A runner calls it BEFORE it imports the app (or imports
 * env/install-strict.ts first), so module-load reads are checked too; turning them on at mount checks only what runs
 * from then on.
 */
export function ensureStrictGlobals(): void {
  if (!activeStrictGlobals()) installStrictGlobals();
}

/**
 * TanStack Query's focus and online managers listen on window by default (visibilitychange, online/offline): in a
 * terminal, focus follows the host's visibility (always shown) and the process is online (a failed request says so on
 * its own). Set once per process, before the first query observer subscribes.
 */
let managersSet = false;
function setQueryManagers(): void {
  if (managersSet) return;
  managersSet = true;
  focusManager.setEventListener((handleFocus) => hostEnv().onVisibilityChange(() => { handleFocus(hostEnv().visible()); }));
  onlineManager.setEventListener((setOnline) => { setOnline(true); return () => {}; });
}

const disposeReason = (e: TermHubEnd['exit']): DisposeReason =>
  e.reason === 'quit' ? 'term-quit' : e.reason === 'crash' || e.reason === 'boot-failed' ? 'term-error' : 'term-abort';

export async function startTermHub(o: TermHubOptions): Promise<TermHub> {
  assertStyles(o.styles); // TERM_STYLES_REQUIRED: nothing has started
  setQueryManagers();
  if (o.strictGlobals) ensureStrictGlobals();
  // This mount's traps, heard as they happen (its own listener below): the ledger is bounded process-wide, so
  // an index into it is not this mount's list. At most MOUNT_TRAPS rows; more are counted in the first's place.
  // Heard from here until the end is settled (dispose included), not only while the mount lives.
  const mountTraps: Array<{ name: string; stack: string }> = [];
  const session = beginTermSession(o.host); // TERM_SESSION_ACTIVE: another mount is open; nothing of it is touched
  const offMountTraps = activeStrictGlobals()?.onTrap((row) => { if (mountTraps.length < MOUNT_TRAPS) mountTraps.push(row); }) ?? null;
  const tierBefore = colourTier();
  if (o.colourTier) setColourTier(o.colourTier);
  const startCols = o.width ?? o.stdout?.columns ?? (globalThis as { process?: { stdout?: { columns?: number } } }).process?.stdout?.columns ?? 120;
  const styles = o.styles;
  setStyleTables((w) => styles.resolver(w), (c, pane) => styles.classFor(c, pane), startCols);

  const detail = o.diagnosticDetail === true;
  diagnosticsOf().detail = detail;
  // The console while the mount lives: kept as problem records, never written over the frame (or into the host's output).
  const problems: Diagnostic[] = [];
  let dropped = 0;
  const note = (d: Diagnostic) => {
    if (problems.length < PROBLEMS_MAX - 1) problems.push(d);
    else dropped++;
  };
  const consoleWas = new Map<string, unknown>();
  const con = console as unknown as Record<string, (...a: unknown[]) => void>;
  for (const m of CONSOLE_METHODS) {
    consoleWas.set(m, con[m]);
    con[m] = (...a: unknown[]) => {
      // The first error among the arguments names the code; else the first string's `CODE:` prefix; else UNHANDLED.
      const e = a.find((x) => x instanceof Error) ?? a.find((x) => typeof x === 'string') ?? a[0];
      note(diagnosticOf('console', e, { what: m, ...(detail ? { detail: true } : {}) }));
      if (detail && a.length > 1 && problems.length) {
        const last = problems[problems.length - 1]!;
        problems[problems.length - 1] = Object.freeze({ ...last, detail: safeDiagnostic(a.map((x) => (x instanceof Error ? `${x.name}: ${x.message}` : typeof x === 'string' ? x : safeString(x))).join(' '), 500) });
      }
    };
  }
  const giveConsoleBack = () => { for (const [m, f] of consoleWas) con[m] = f as (...a: unknown[]) => void; consoleWas.clear(); };

  let run: TermRun | null = null;
  let app: ReturnType<typeof createTermApp> | null = null;
  let forced: TermHubEnd['exit'] | null = null;
  let settle!: (e: TermHubEnd) => void;
  const closed = new Promise<TermHubEnd>((r) => { settle = r; });
  let disposing = false;
  /** True while the renderer is being created (runTerm not yet answered): an end asked for now waits for it. */
  let mounting = false;
  const offs: Array<() => void> = [];

  const closeGate = (): void => { try { o.boot.closeGate?.(); } catch { /* the end goes on; dispose trips it again */ } };

  const lastView = (): TermHubEnd['lastView'] => {
    const loc = app?.router.state.location;
    const page = app?.router.state.matches.at(-1)?.staticData.pageId ?? o.pages.find((p) => o.path.startsWith(p.path))?.id ?? 'home';
    return { page, path: loc?.pathname ?? o.path.split('?')[0]!, search: { ...((loc?.search ?? {}) as Record<string, string>) } };
  };

  const dispose = async (exit: TermHubEnd['exit']): Promise<void> => {
    closeGate();
    if (disposing) return;
    disposing = true;
    const errors: unknown[] = [];
    // A step's AggregateError (boot dispose: core teardown AND the late-answer drain) is one record per failure.
    const step = async (f: () => unknown) => { try { await f(); } catch (e) { if (e instanceof AggregateError) errors.push(...e.errors); else errors.push(e); } };
    const view = lastView();
    for (const off of offs.splice(0)) await step(off);
    await step(() => o.queryClient.cancelQueries());
    await step(() => { o.queryClient.clear(); });
    await step(() => o.boot.dispose(disposeReason(exit)));
    await step(() => { closeMenu(); });
    await step(() => { setStyleTable(null); });
    await step(giveConsoleBack);
    // Page failures are the mount's (router sessionSlot): read before the session drops them. A page failure is shown
    // in place by its boundary and does not fail the mount by itself; the receipt names it.
    await step(() => { for (const f of pageFailures()) note(f.error); });
    await step(() => { session.end(); });
    await step(() => { setColourTier(tierBefore); });
    offMountTraps?.();
    const trapRows = mountTraps.slice();
    const traps = trapRows.map((t) => t.name);
    const rec = (k: Diagnostic['kind'], e: unknown, x: { what?: string; where?: readonly string[] } = {}) => diagnosticOf(k, e, { ...x, ...(detail ? { detail: true } : {}) });
    // Traps first (the reason a strict mount ended), then the crash, the boot, the teardown, then what was noted.
    // Each trap names where the read happened (its first Hub source frames; none in a ship bundle).
    const head: Diagnostic[] = trapRows.map((t) => rec('trap', new TermGlobalError(t.name), { what: t.name, where: srcFrames(t.stack) }));
    if (exit.reason === 'crash') head.push(rec('crash', exit.error));
    if (exit.reason === 'boot-failed') head.push(rec('boot', exit.error));
    for (const e of errors) head.push(rec('dispose', e));
    const all = [...head, ...problems];
    const kept = all.slice(0, PROBLEMS_MAX - 1);
    const more = all.length - kept.length + dropped;
    if (more > 0) kept.push(Object.freeze({ kind: 'console', code: 'PROBLEMS_DROPPED', name: 'Error', what: String(more) }) as Diagnostic);
    const ok = exit.reason !== 'crash' && exit.reason !== 'boot-failed' && traps.length === 0 && errors.length === 0;
    // Records only past this point: the end holds no raw error object.
    const endExit = ('error' in exit ? { ...exit, error: rec(exit.reason === 'crash' ? 'crash' : 'boot', exit.error) } : exit) as TermHubEnd['exit'];
    forced = null;
    let suspended = false;
    try { suspended = o.boot.suspended?.() === true; } catch { /* unknown = not reported */ }
    // The host's report hook (after restore): the first record only, without detail.
    if (!ok && o.report && head[0]) { try { o.report(diagnosticLine(publicDiagnostic(head[0]))); } catch { /* the host's */ } }
    settle({ exit: endExit, reason: endReasonOf(exit, suspended), lastView: view, disposeErrors: errors.map((e) => rec('dispose', e)), traps, problems: kept, ok });
    errors.length = 0;
  };

  // Ending before or while booting: the mount ends at once; the boot's own answer, if it comes, changes nothing.
  const endNow = async (exit: TermHubEnd['exit']): Promise<TermHubEnd> => {
    closeGate();
    forced ??= exit;
    if (run) await run.end(exit.reason === 'quit' ? { reason: 'quit', code: 0 } : { reason: 'abort', code: 0 });
    // The renderer is on its way and cannot be stopped from here: the start ends it as soon as it exists, then disposes.
    else if (!mounting) await dispose(forced);
    return closed;
  };

  if (o.signal) {
    const sig = o.signal;
    const onAbort = () => { void endNow({ reason: 'abort', code: 0 }); };
    sig.addEventListener('abort', onAbort, { once: true });
    offs.push(() => { sig.removeEventListener('abort', onAbort); });
  }

  // A trap while the mount lives is a failed mount, at once (a swallowed one included): the gate closes synchronously
  // (no call leaves after it), the crash ends the run, the terminal is
  // restored and the report names it. Before the run exists (during boot) the boot's end decides the rest.
  const strict = activeStrictGlobals();
  if (strict) offs.push(strict.onTrap((row) => {
    closeGate();
    const error = new TermGlobalError(row.name);
    forced ??= { reason: 'crash', code: 1, error };
    if (run) void run.end(forced as TermExit);
  }));

  const hub: TermHub = {
    closed,
    end: (reason = 'abort') => endNow(reason === 'quit' ? { reason: 'quit', code: 0 } : { reason: 'abort', code: 0 }),
    renderer: () => run?.renderer ?? null,
    whenIdle: (w = {}) => idleOf({
      queryClient: o.queryClient,
      views: viewsLoading,
      ...(w.still !== undefined ? { still: w.still } : {}),
      ...(w.deadlineMs !== undefined ? { deadlineMs: w.deadlineMs } : {}),
      frame: async () => {
        const r = run?.renderer;
        if (!r || disposing) return '';
        r.requestRender();
        await r.idle();
        const buf = (r as unknown as { currentRenderBuffer?: { getRealCharBytes?: (b: boolean) => Uint8Array } }).currentRenderBuffer;
        const bytes = buf?.getRealCharBytes?.(true);
        return bytes ? new TextDecoder().decode(bytes) : '';
      },
    }),
  };
  if (o.signal?.aborted) { await dispose({ reason: 'abort', code: 0 }); return hub; }

  try {
    await o.boot.start(session, (why) => { void endNow(why === 'signed-out' ? { reason: 'signed-out', code: 0 } : { reason: 'expired', code: 0 }); });
  } catch (error) {
    await dispose({ reason: 'boot-failed', code: 1, error });
    return hub;
  }
  const early = forced as TermHubEnd['exit'] | null;
  if (early) { await dispose(early); return hub; }

  mounting = true;
  try {
    run = await runTerm({
      ...(o.stdin ? { stdin: o.stdin } : {}),
      ...(o.stdout ? { stdout: o.stdout } : {}),
      ...(o.width ? { width: o.width } : {}),
      ...(o.height ? { height: o.height } : {}),
      process: o.process === true,
      ...(o.colourTier ? { colourTier: o.colourTier } : {}),
      ...(o.createRenderer ? { createRenderer: o.createRenderer } : {}),
      // Every resize re-selects the class-style table for the new width; then the host hears it.
      onResize: (cols, rows) => { setStyleWidth(cols); o.onResize?.(cols, rows); },
      // The engine's crash text is never kept or passed on: the crash is a record (dispose), the host gets its line.
      report: () => {},
      // The send gate closes before the app unmounts and the renderer shuts down.
      onEnding: closeGate,
      onScreen: (ask) => { o.boot.screen?.(ask); },
      render: (ctl) => {
        app = createTermApp({ pages: o.pages, queryClient: o.queryClient, path: o.path, onQuit: ctl.quit, ...(ctl.suspend ? { onSuspend: ctl.suspend } : {}) });
        return app.element;
      },
    });
  } catch (error) {
    mounting = false;
    await dispose({ reason: 'crash', code: 1, error });
    return hub;
  }
  mounting = false;
  // Ended while the renderer was being created (an abort, hub.end, a session end, a trap): the renderer that just
  // arrived is shut down and the terminal given back before the mount is disposed and `closed` settles.
  const late = forced as TermHubEnd['exit'] | null;
  if (late) {
    await run.end(late.reason === 'quit' ? { reason: 'quit', code: 0 } : late.reason === 'crash' ? (late as TermExit) : { reason: 'abort', code: 0 });
    await dispose(late);
    return hub;
  }
  if (o.onFrame) {
    let n = 0;
    const r = run.renderer;
    const onFrame = async () => { o.onFrame?.(++n); };
    r.setFrameCallback(onFrame);
    offs.push(() => { r.removeFrameCallback(onFrame); });
  }
  void run.closed.then((exit) => dispose(forced ?? exit));
  return hub;
}

function safeString(x: unknown): string {
  try { return JSON.stringify(x) ?? String(x); } catch { return String(x); }
}

/** Failures of pages drawn in this process (the error boundary's record), for diagnostics. */
export { pageFailures };
