// The terminal Hub's lifecycle: one renderer, one React root, one end. Every way out goes through end(), once:
//   quit     q, Ctrl-C (asked, or twice), the quit prompt's Leave              → code 0
//   signal   SIGTERM, SIGHUP (the terminal closed), SIGINT from outside        → 128 + signal number
//   crash    an uncaught exception or rejection, or a render error outside a page (pages have their own boundary)
//   abort    the host's abort (a mount's signal)
// end() unmounts React (effects clean up: timers, listeners, core subscriptions), destroys the renderer (it restores
// the terminal: alternate screen, mouse, bracketed paste, cursor) and waits for its output to drain, then settles
// `closed`. A crash prints its error AFTER the terminal is restored, so it is readable in the shell.
// Ctrl-Z (and SIGTSTP from outside) suspends: the renderer gives the terminal back, the process stops; SIGCONT (fg)
// resumes and redraws. A resize is the renderer's own (it re-lays out and redraws); `onResize` is told after.
// Process handlers are installed only with `process: true` (a runner that owns the process); a mount inside a host
// (entry.ts) leaves the process alone.
import { PassThrough } from 'node:stream';
import { Component, createElement, type ReactNode } from 'react';
import { createCliRenderer, createRoot, type CliRenderer } from '../prim/engine';
import { safeDiagnostic } from '../prim/safe';
import { setThemeMode, themeFromEnv, themeMode, type ColourTier, type ThemeMode } from '../prim/tokens';
import { ALLOW_ALL, SecretScreenCtx, screenAsk, type SecretScreenAsk } from './secret-screen-ctx';

export type TermExit =
  | { reason: 'quit'; code: 0 }
  | { reason: 'signal'; code: number; signal: NodeJS.Signals }
  | { reason: 'crash'; code: 1; error: unknown }
  | { reason: 'abort'; code: 0 };

export interface TermControl {
  /** Leave the Hub (the shell's q / Ctrl-C / Leave). */
  quit(): void;
  /** Ctrl-Z: give the terminal back and stop until SIGCONT; absent where the process is not ours. */
  suspend?(): void;
}

export interface TermRunOptions {
  /** What to draw, given the run's controls. */
  render: (ctl: TermControl) => ReactNode;
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  /** Size when stdout has none (a custom stream). */
  width?: number;
  height?: number;
  /** The Hub's colour tier (prim tokens): the engine writes colours in that mode. Absent: the engine decides from the
   *  terminal's own answers. */
  colourTier?: ColourTier;
  /** Own the process: signals, crashes, suspend. */
  process?: boolean;
  /** After each resize the renderer handled. */
  onResize?(cols: number, rows: number): void;
  /** Where a crash's error text goes once the terminal is restored (default stderr when owning the process). */
  report?(text: string): void;
  /** How long end() waits for the renderer's output to drain. */
  drainMs?: number;
  /** Called first when the run ends, by any path (quit, abort, signal, crash), before the app is unmounted or the
   *  renderer shut down: the mount closes its send gate here, so nothing the unmount or the
   *  shutdown triggers reaches the wire. A throw is ignored. */
  onEnding?(): void;
  /** The mount's screen asking (secretScreenFor below), handed over once the renderer exists, before the first frame:
   *  the send policy then asks the same screen the secret fields ask. A throw ends the run as a crash (nothing drawn). */
  onScreen?(ask: SecretScreenAsk): void;
  /**
   * The test-renderer seam (render.ts, goldens, shots, scenarios, tests): makes the renderer instead of a terminal one
   * (e.g. @opentui/core/testing createTestRenderer). The run then reads no stdin (input comes from the test renderer's
   * mock input) and follows no stdout resize; everything else (the app, the lifecycle, the end) is the shipped path.
   * It gets the same engine flags a terminal renderer gets.
   */
  createRenderer?: (flags: RendererFlags & { width: number; height: number; colorMode?: ColourTier }) => Promise<CliRenderer>;
}

/** The engine flags every Hub renderer is made with, terminal or test. */
export interface RendererFlags {
  exitOnCtrlC: false;
  exitSignals: never[];
  autoFocus: false;
  useMouse: true;
  /** The engine's own console overlay never shows: console output goes to the mount's problems instead. */
  consoleMode: 'disabled';
  openConsoleOnError: false;
}
export const RENDERER_FLAGS: Readonly<RendererFlags> = Object.freeze({
  // The shell owns Ctrl-C (asks first, twice leaves) and the signals (end() restores and settles).
  exitOnCtrlC: false,
  exitSignals: [],
  // A click must not hand the engine's focus to a scroll box or panel (the prim focus store owns focus): with it on, a
  // click on the sidebar focused its scroll box and drew its border in the focus colour.
  autoFocus: false,
  useMouse: true,
  // The engine's debug console (stack traces, absolute build paths) is never the user's screen: no overlay, never
  // opened on an error. The lifecycle collects console output as the mount's problems.
  consoleMode: 'disabled',
  openConsoleOnError: false,
}) as RendererFlags;

export interface TermRun {
  renderer: CliRenderer;
  /** Settles once, after the terminal is restored. */
  closed: Promise<TermExit>;
  end(exit: TermExit): Promise<void>;
}

/** The process calls this file makes (the hub's types declare only process.env). */
interface Proc {
  env: Readonly<Record<string, string | undefined>>;
  pid: number;
  platform: string;
  stderr: { write(s: string): unknown };
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  kill(pid: number, signal: string): unknown;
  on(event: string, fn: (...a: never[]) => void): unknown;
  off(event: string, fn: (...a: never[]) => void): unknown;
}
const proc = (): Proc => (globalThis as unknown as { process: Proc }).process;

/** What secret fields may do in this mount (secret-screen-ctx.ts): the real screen facts (this renderer, this output,
 *  TERM), asked at every press. The createRenderer hook draws headless, so a secret there reaches no terminal. */
export function secretScreenFor(o: Pick<TermRunOptions, 'createRenderer' | 'stdout'>, renderer: CliRenderer): SecretScreenAsk {
  return o.createRenderer ? ALLOW_ALL : screenAsk(renderer, o.stdout ?? proc().stdout, process.env);
}

const SIGNAL_NUMBER: Readonly<Partial<Record<NodeJS.Signals, number>>> = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 };

/** A render error outside every page boundary (the shell itself): the run ends as a crash. */
class RootBoundary extends Component<{ onCrash: (e: unknown) => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  override componentDidCatch(error: unknown, info: { componentStack?: string | null }): void {
    const where = info.componentStack ? `\n${info.componentStack.trim().split('\n').slice(0, 8).join('\n')}` : '';
    this.props.onCrash(error instanceof Error ? Object.assign(error, { where }) : error);
  }
  override render(): ReactNode { return this.state.failed ? null : this.props.children; }
}

export function describeCrash(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}${(e as { where?: string }).where ?? ''}\n${e.stack?.split('\n').slice(1, 6).join('\n') ?? ''}`;
  return String(e);
}

/**
 * The input the renderer reads, held while a resize is on its way: the renderer re-lays out a resize only after a short
 * debounce, so a click sent right after one was hit-tested on the old layout (the PTY defect: a click on Logs right
 * after a resize missed). Bytes that arrive between the terminal's resize and the first frame drawn at the new size are
 * kept and given to the renderer then, in order (at most HOLD_MAX_MS).
 */
const HOLD_MAX_MS = 400;
function heldInput(src: NodeJS.ReadStream, out: NodeJS.WriteStream) {
  const gate = new PassThrough() as unknown as NodeJS.ReadStream & PassThrough;
  Object.assign(gate, {
    isTTY: src.isTTY === true,
    setRawMode: (on: boolean) => { (src as { setRawMode?: (b: boolean) => unknown }).setRawMode?.(on); return gate; },
  });
  let held: Buffer[] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const release = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    const chunks = held;
    held = null;
    for (const c of chunks ?? []) gate.write(c);
  };
  const onData = (c: Buffer | string) => { const b = typeof c === 'string' ? Buffer.from(c) : c; if (held) held.push(b); else gate.write(b); };
  const onResize = () => { held ??= []; if (timer) clearTimeout(timer); timer = setTimeout(release, HOLD_MAX_MS); };
  src.on('data', onData);
  out.on('resize', onResize);
  return {
    stdin: gate as NodeJS.ReadStream,
    /** The renderer drew a frame: when it was laid out at the new size, the held input goes. */
    drawnAfterResize: release,
    off: () => { src.off('data', onData); out.off('resize', onResize); if (timer) clearTimeout(timer); held = null; (src as { pause?: () => void }).pause?.(); gate.end(); },
  };
}

/** How long the first frame waits for the terminal to say what its background is. */
export const THEME_WAIT_MS = 200;
/** The terminal's theme as the engine read it from the terminal's answer, or null (no answer in time, or no such engine). */
export async function terminalTheme(renderer: { themeMode?: ThemeMode | null; waitForThemeMode?: (ms: number) => Promise<ThemeMode | null> }): Promise<ThemeMode | null> {
  try {
    const m = renderer.themeMode ?? (await renderer.waitForThemeMode?.(THEME_WAIT_MS)) ?? null;
    return m === 'light' || m === 'dark' ? m : null;
  } catch { return null; }
}

const NO_INPUT = { stdin: undefined, drawnAfterResize: () => {}, off: () => {} };

export async function runTerm(o: TermRunOptions): Promise<TermRun> {
  const input = o.createRenderer ? NO_INPUT : heldInput(o.stdin ?? proc().stdin, o.stdout ?? proc().stdout);
  // The tier's names are the engine's colour modes. Left to itself the engine writes 24-bit colour on a terminal that
  // reports none (its "auto"), so a 16-colour tier's colours would go out as 24-bit SGR.
  const colorMode = o.colourTier ? { colorMode: o.colourTier } : {};
  let renderer: CliRenderer;
  try {
    renderer = o.createRenderer
      ? await o.createRenderer({ ...RENDERER_FLAGS, ...colorMode, width: o.width ?? 120, height: o.height ?? 40 })
      : await createCliRenderer({
        stdin: input.stdin!,
        ...(o.stdout ? { stdout: o.stdout } : {}),
        ...(o.width ? { width: o.width } : {}),
        ...(o.height ? { height: o.height } : {}),
        ...RENDERER_FLAGS,
        ...colorMode,
      });
  } catch (e) {
    // No renderer: the input listeners this run put on the terminal go, nothing else was taken.
    input.off();
    throw e;
  }
  // Every useTerminalDimensions adds a resize listener: dozens are expected, not a leak.
  (renderer as unknown as { setMaxListeners?: (n: number) => void }).setMaxListeners?.(0);
  // The renderer took the new size (its 'resize'): once it is idle again the frame at that size is drawn and its hit
  // grid is the one input is tested on.
  const onRendererResize = () => { void renderer.idle().then(() => { input.drawnAfterResize(); }, () => { input.drawnAfterResize(); }); };
  renderer.on('resize', onRendererResize);
  // The renderer follows SIGWINCH only on the process's own stdout: a given stdout's resizes are passed on here.
  let offOutResize = () => {};
  if (o.stdout && !o.createRenderer) {
    const out = o.stdout;
    const onOutResize = () => { if (out.columns > 0 && out.rows > 0) renderer.requestResize(out.columns, out.rows); };
    out.on('resize', onOutResize);
    offOutResize = () => { out.off('resize', onOutResize); };
  }
  // The theme follows the terminal's own background, decided once before the first frame: its answer to the engine's
  // colour question (waited for briefly), else what its environment names, else dark. A test renderer is no terminal:
  // it draws the theme that is set.
  const themeBefore = themeMode();
  if (!o.createRenderer) setThemeMode((await terminalTheme(renderer)) ?? themeFromEnv(proc().env) ?? 'dark');
  const root = createRoot(renderer);
  let settle!: (x: TermExit) => void;
  const closed = new Promise<TermExit>((r) => { settle = r; });
  const offs: Array<() => void> = [];
  let ending = false;
  const report = o.report ?? (o.process ? (t: string) => { proc().stderr.write(t + '\n'); } : undefined);

  const end = async (exit: TermExit): Promise<void> => {
    if (ending) return;
    ending = true;
    try { o.onEnding?.(); } catch { /* the end goes on */ }
    for (const off of offs.splice(0)) { try { off(); } catch { /* a removal never stops the end */ } }
    try { root.unmount(); } catch { /* the renderer still restores the terminal below */ }
    try { renderer.destroy(); } catch { /* already destroyed */ }
    offOutResize();
    renderer.off('resize', onRendererResize);
    input.off();
    setThemeMode(themeBefore);
    // Bounded wait for the restore to drain; the bound's timer goes as soon as the renderer closed (no timer outlives a mount).
    let bound: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([renderer.closed.catch(() => {}), new Promise((r) => { bound = setTimeout(r, o.drainMs ?? 2000); })]);
    clearTimeout(bound);
    if (exit.reason === 'crash' && report) report(safeDiagnostic('hoody hub: crashed: ' + describeCrash(exit.error)));
    settle(exit);
  };

  const ctl: TermControl = { quit: () => { void end({ reason: 'quit', code: 0 }); } };
  // From here the terminal is taken (raw mode, the other screen, signal and input listeners). A throw while the rest is
  // set up or while the caller builds its app gives it all back before this run rejects: nobody else holds an `end`.
  try {
  if (o.process && proc().platform !== 'win32') {
    let suspended = false;
    const suspend = async () => {
      if (suspended || ending) return;
      suspended = true;
      try { await renderer.suspend(); } catch { /* still stop: the terminal is the user's either way */ }
      // The run ended while the renderer was suspending (a quit, a signal, a crash): the process is on its way out and
      // is never stopped.
      if (ending) return;
      proc().kill(proc().pid, 'SIGSTOP');
    };
    const resume = () => {
      if (!suspended || ending) return;
      suspended = false;
      void renderer.resume().then(() => renderer.requestRender());
    };
    ctl.suspend = () => { void suspend(); };
    const on = (sig: string, fn: () => void) => { proc().on(sig, fn); offs.push(() => { proc().off(sig, fn); }); };
    for (const sig of ['SIGTERM', 'SIGHUP', 'SIGINT'] as const) on(sig, () => { void end({ reason: 'signal', code: 128 + (SIGNAL_NUMBER[sig] ?? 0), signal: sig }); });
    on('SIGTSTP', () => { void suspend(); });
    on('SIGCONT', resume);
    const crash = (e: unknown) => { void end({ reason: 'crash', code: 1, error: e }); };
    on('uncaughtException', crash as () => void);
    on('unhandledRejection', crash as () => void);
  }
  if (o.onResize) {
    const onResize = (w: number, h: number) => o.onResize?.(w, h);
    renderer.on('resize', onResize);
    offs.push(() => { renderer.off('resize', onResize); });
  }
  // A resize that came before this run listened (while the mount booted, or while the renderer was being created) was
  // heard by nobody: the renderer would keep drawing the old width into the new terminal, or the caller (style table,
  // host) would keep the size it started at. Every listener is on now, so catch up once: a renderer behind its stdout
  // takes the new size (its 'resize' tells onResize, as for any resize); a renderer created at another size than the
  // caller asked for is told to onResize.
  const out = o.stdout && !o.createRenderer ? o.stdout : null;
  if (out && out.columns > 0 && out.rows > 0 && (out.columns !== renderer.width || out.rows !== renderer.height)) renderer.requestResize(out.columns, out.rows);
  else if (o.width !== undefined && o.height !== undefined && (renderer.width !== o.width || renderer.height !== o.height)) o.onResize?.(renderer.width, renderer.height);
  // One asking for the mount: the secret fields read it from the provider, the send policy gets it here first.
  const screen = secretScreenFor(o, renderer);
  o.onScreen?.(screen);
  root.render(createElement(RootBoundary, { onCrash: (e: unknown) => { void end({ reason: 'crash', code: 1, error: e }); }, children: createElement(SecretScreenCtx.Provider, { value: screen }, o.render(ctl)) }));
  } catch (e) {
    await end({ reason: 'crash', code: 1, error: e });
    throw e;
  }
  return { renderer, closed, end };
}
