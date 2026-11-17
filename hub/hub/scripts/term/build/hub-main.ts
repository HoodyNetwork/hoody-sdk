// The `hoody hub` executable's main, after build/hub-cache.ts put the process in its private library cache: the BUILT
// ship bundle on this process's terminal. Nothing of hub/src is imported here (the bundle is the Hub; a second copy of
// any of its modules must not exist in the executable). The client is the caller's: the Hub never reads a credential,
// and none is ever taken from argv.
import { dropCacheEnv } from './hub-cache';
import { storeNoticeText, storeNoticeToast, writeResume, type OpenedStore } from './hub-store-open';

/** What the main needs of the ship bundle (build/ship-entry.ts). */
export interface ShipReceipt { exitCode: number; ok?: boolean; reason?: string; lastView?: { page?: string } }
export interface ShipHub { mountTerminalHub(o: unknown): Promise<ShipReceipt>; mountDemoHub(o: unknown): Promise<ShipReceipt> }

export interface HubMainOptions {
  /** Imports the bundle (the engine and its native library load here, not before). */
  load(): Promise<ShipHub>;
  /** The signed-in client (src/term/host-types.ts HoodyClient). */
  client(): Promise<unknown> | unknown;
  context: { profile: string; realmId: string; [k: string]: unknown };
  route?: { page: string; path: string; search?: Record<string, string> };
  onSetDefault?(realmId: string, containerId?: string): Promise<void>;
  webOrigin?: string;
  /** The sample account (`hoody hub --demo`): the bundle's demo mount, which takes only a demo client. */
  demo?: boolean;
  /** The account's local store, opened by the caller (build/hub-store-open.ts openAccountStore) before it chose the
   *  realm and the page (readResume). hubMain hands it to the mount, saves where the run ended, says its notice before
   *  and after the Hub, and closes it. Never used by the sample account. */
  store?: OpenedStore;
}

/** The mount's `store` option for an opened store (host-types.ts HubTermOptions.store; the sentence is said by the host). */
export function mountStore(store: OpenedStore): { area: OpenedStore['area']; openedAt: number; notice: { title: string; body: string } | null } {
  return { area: store.area, openedAt: store.openedAt, notice: storeNoticeToast(store.notice) };
}
/** Where the next start opens: only after a good run (a crash or a failed start keeps the last good place). */
export function keepPlace(store: OpenedStore, receipt: ShipReceipt, realmId: string): boolean {
  if (receipt.ok !== true) return false;
  try { return writeResume(store.area, { ...(receipt.lastView?.page ? { page: receipt.lastView.page } : {}), realmId }); } catch { return false; }
}

type Tier = 'truecolor' | 'ansi16' | 'mono';
/** The same rule as src/term/prim/tokens.ts tierFromEnv (kept equal by hub-main.term.test.ts). */
export function tierOf(env: Readonly<Record<string, string | undefined>>): Tier {
  if ((env.NO_COLOR ?? '') !== '' || env.TERM === 'dumb') return 'mono';
  if (env.HUB_TERM_COLOUR === 'truecolor' || env.HUB_TERM_COLOUR === 'ansi16' || env.HUB_TERM_COLOUR === 'mono') return env.HUB_TERM_COLOUR;
  if (env.COLORTERM === 'truecolor' || env.COLORTERM === '24bit' || /-(direct|truecolor)$/.test(env.TERM ?? '')) return 'truecolor';
  return 'ansi16';
}

type Listener = (...a: unknown[]) => void;
/** `ours` becomes the host's one listener for `events` until the returned off(): the listeners there before step aside
 *  (one by one, never all: a listener added meanwhile, the engine's, stays) and come back in their order. A second
 *  off() does nothing. */
function takeOver(events: readonly string[], ours: Listener): () => void {
  const proc = process as unknown as { listeners(e: string): Listener[]; on(e: string, l: Listener): unknown; off(e: string, l: Listener): unknown };
  const saved = events.map((e) => [e, proc.listeners(e)] as const);
  for (const [e, ls] of saved) for (const l of ls) proc.off(e, l);
  for (const e of events) proc.on(e, ours);
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    for (const e of events) proc.off(e, ours);
    for (const [e, ls] of saved) for (const l of ls) proc.on(e, l);
  };
}

const UNCAUGHT = ['uncaughtException', 'unhandledRejection'] as const;
/** While the Hub draws, an error nobody caught is told to `onError` in place of the host's own handlers (the CLI's
 *  writes a stack to the console the mount keeps, then exits at once: the Hub vanished, no line, nothing disposed).
 *  Those step aside until off() puts them back in their order; a listener added meanwhile (the engine's) stays.
 *  `onError` may be told more than once; nothing here throws or exits. */
export function ownUncaught(onError: () => void): () => void {
  return takeOver(UNCAUGHT, () => { try { onError(); } catch { /* the main ends the mount either way */ } });
}

/** The signals that end a run, and their numbers (the exit code is 128 + the number, as a shell reports it). */
export const END_SIGNALS = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 } as const;
export type EndSignal = keyof typeof END_SIGNALS;
/** While the Hub draws, a signal that ends it (SIGTERM, the terminal closing, a SIGINT sent from outside: in raw mode
 *  Ctrl-C is a key, never a signal) is told to `onSignal`, which ends the mount: the mount restores the terminal. The
 *  host's handlers step aside meanwhile, as for ownUncaught: the CLI's exit at once, and the engine cannot restore a
 *  terminal it draws on through the host's stream from an exit hook, so the other screen, the mouse and the hidden
 *  cursor stayed. */
export function ownSignals(onSignal: (s: EndSignal) => void): () => void {
  const offs = (Object.keys(END_SIGNALS) as EndSignal[]).map((s) => takeOver([s], () => { try { onSignal(s); } catch { /* the main ends the mount either way */ } }));
  return () => { for (const off of offs) off(); };
}

/** The line a run that ended by itself leaves in the shell, and its exit code; null when the end needs no words. A
 *  sign-in that expired while the Hub drew says what the start says for it (and exits 2, as that start does). */
export function endLine(receipt: ShipReceipt, demo: boolean): { code: number; line: string } | null {
  if (!demo && receipt.reason === 'expired') return { code: 2, line: 'hoody hub: your sign-in has expired. Run `hoody login`, then `hoody hub` again.' };
  return null;
}

/** Until the Hub's first frame nothing reads the keys: the mount boots first, and its reads wait on the API. A Ctrl-C
 *  typed then (raw mode: a byte, never a signal) is told to `onInterrupt` at once, as a shell's Ctrl-C would stop a
 *  start; from the first frame on (drawn()) every key is the Hub's. */
export function earlyInterrupt(input: { on(e: 'data', l: (b: Buffer | string) => void): unknown; off(e: 'data', l: (b: Buffer | string) => void): unknown }, onInterrupt: () => void): { drawn(): void; off(): void } {
  let on = true;
  const listen = (b: Buffer | string): void => { if (on && (typeof b === 'string' ? b.includes('\x03') : b.includes(0x03))) onInterrupt(); };
  input.on('data', listen);
  return { drawn: () => { on = false; }, off: () => { on = false; input.off('data', listen); } };
}

/** Mounts the Hub on the process's terminal; resolves with the exit code once the terminal is restored. */
export async function hubMain(o: HubMainOptions): Promise<number> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY || !stdout.isTTY) {
    process.stderr.write('hoody hub: needs an interactive terminal (TERM_HUB_NO_TTY)\n');
    return 2;
  }
  const tier = tierOf(process.env);
  const store = o.demo ? undefined : o.store;
  const storeSaid = store ? storeNoticeText(store.notice) : null;
  if (storeSaid) process.stderr.write(storeSaid + '\n');
  // From the engine's load on, an error nobody caught (a promise the Hub does not wait for, a throw in the client)
  // ends the mount; it is said once the terminal is back.
  const ac = new AbortController();
  let crashed = false;
  // The one line said after the terminal is back (an uncaught error, an expired sign-in).
  let said: string | null = null;
  const off = ownUncaught(() => { crashed = true; ac.abort(); });
  let hub: ShipHub;
  try { hub = await o.load(); } catch (e) { off(); throw e; }
  // The library is open: programs the Hub starts must not inherit the cache as their temp directory.
  dropCacheEnv(process.env);
  let by = null as EndSignal | null;
  const offSignals = ownSignals((s) => { by ??= s; ac.abort(); });
  stdin.setRawMode(true);
  // A Ctrl-C before the first frame leaves as an outside SIGINT does (the mount ends at once, even mid-boot).
  const boot = earlyInterrupt(stdin, () => { by ??= 'SIGINT'; ac.abort(); });
  try {
    const receipt = await (o.demo ? hub.mountDemoHub.bind(hub) : hub.mountTerminalHub.bind(hub))({
      client: await o.client(),
      context: o.context,
      ...(o.route ? { route: o.route } : {}),
      ...(store ? { store: mountStore(store) } : {}),
      io: {
        cells: { write: (s: string) => { boot.drawn(); stdout.write(s); } },
        input: { onData: (cb: (s: string) => void) => { const on = (b: Buffer): void => cb(b.toString('utf8')); stdin.on('data', on); return () => { stdin.off('data', on); }; } },
        size: () => ({ cols: stdout.columns ?? 80, rows: stdout.rows ?? 24 }),
        onResize: (cb: () => void) => { stdout.on('resize', cb); return () => { stdout.off('resize', cb); }; },
        colourTier: tier,
      },
      onSetDefault: o.onSetDefault ?? (async () => {}),
      ...(o.webOrigin ? { webOrigin: o.webOrigin } : {}),
      signal: ac.signal,
    });
    // Ended by an error nobody caught: a failure, so the place is not kept. Its line comes below, after the terminal
    // is restored, unless the mount failed by itself and said its own.
    if (crashed) { if (receipt.ok !== false) said = 'hoody hub: stopped after an error (TERM_HUB_UNCAUGHT)'; return receipt.exitCode || 1; }
    if (store) keepPlace(store, receipt, o.context.realmId);
    // Ended by a signal: the code a shell reports for it (the mount itself says closed, 0).
    if (by !== null) return 128 + END_SIGNALS[by];
    const ended = endLine(receipt, o.demo === true);
    if (ended) { said = ended.line; return ended.code; }
    return receipt.exitCode;
  } catch {
    // Could not start at all (another mount open, no styles): a fixed line, never the error's text.
    process.stderr.write('hoody hub: could not start (TERM_HUB_MOUNT_REFUSED)\n');
    return 1;
  } finally {
    boot.off();
    offSignals();
    off();
    // The terminal may be gone (the SSH link dropped, SIGHUP): turning raw mode off then fails (EIO), and the rest
    // below still runs.
    if (stdin.isTTY) { try { stdin.setRawMode(false); } catch { /* no terminal left to restore */ } }
    if (said) process.stderr.write(said + '\n');
    stdin.pause();
    if (store) { try { store.close(); } catch { /* the run is over */ } }
    if (storeSaid) process.stderr.write(storeSaid + '\n');
  }
}
