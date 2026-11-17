// The secret-safe screen (admission row 7). The live boot
// asks it; nothing here draws or writes to the terminal.
//
//   - `secretRevealOf(facts)` is row 7's capability `secretReveal`: a secret may be SHOWN only when the mount really runs
//     on the terminal's alternate screen, read from the renderer itself (`renderer.screenMode`), never from the options
//     it was given: OTUI_USE_ALTERNATE_SCREEN in the environment overrides them (the engine's resolveModes), and a
//     main-screen mount writes every frame into the scrollback. Also false without a terminal (not a TTY) or with
//     TERM unset or `dumb`. Without it the mount still runs; secret fields stay masked and a show-only create is refused
//     unsent (row 7, TERM_SECRET_SCREEN).
//   - `secretCopyOf(facts)`: Copy is offered only when the terminal SAID it takes OSC 52 (capability `supported`; the
//     engine's own isOsc52Supported also writes on `unknown`), and only where a reveal is allowed. Asked at each press:
//     the engine's capability answer can arrive after the first frame.
//   - `secretCopyText(text)`: what a secret's Copy may write: the value exactly as it is, and only when prim's
//     safeCopyText would leave it unchanged (no control or format character, no \r\n) and it is at most
//     SECRET_COPY_MAX bytes before base64. Copy never writes a cleaned value that differs from the secret
//     (a wrong credential pasted with no sign of it): such a secret gets no Copy and stays reveal-only. Write-only: the
//     copy seam (prim/clipboard.ts) only writes, nothing here reads a clipboard.
//   - `RevealIdle`: rule 3's re-hide: a revealed secret is hidden again after REVEAL_IDLE_MS with no key press. The
//     SecretField's owner wires it (shown → start, any key → touch, hidden → stop).
import { safeCopyText } from '../prim/safe';

export interface ScreenFacts {
  /** The renderer's own screen mode (`renderer.screenMode`). */
  readonly screenMode: unknown;
  /** The output is a terminal. */
  readonly tty: boolean;
  /** TERM as the process sees it. */
  readonly term: string | undefined;
  /** The engine's capability answer (`renderer.capabilities.osc52_support`). */
  readonly osc52: unknown;
}

/** The facts from the live renderer, its output stream and the environment, read now. */
export function screenFactsOf(renderer: { readonly screenMode?: unknown; readonly capabilities?: { readonly osc52_support?: unknown } | null }, out: { readonly isTTY?: boolean } | null | undefined, env: Readonly<Record<string, string | undefined>>): ScreenFacts {
  let screenMode: unknown, osc52: unknown;
  try { screenMode = renderer.screenMode; } catch { screenMode = undefined; }
  try { osc52 = renderer.capabilities?.osc52_support; } catch { osc52 = undefined; }
  return { screenMode, tty: out?.isTTY === true, term: env.TERM, osc52 };
}

/** Row 7's `secretReveal`. */
export function secretRevealOf(f: ScreenFacts): boolean {
  const term = typeof f.term === 'string' ? f.term.trim() : '';
  return f.tty && f.screenMode === 'alternate-screen' && term !== '' && term !== 'dumb';
}

/** Copy is offered for a secret: a reveal is allowed and the terminal said it takes OSC 52. */
export function secretCopyOf(f: ScreenFacts): boolean {
  return secretRevealOf(f) && f.osc52 === 'supported';
}

/** Most a secret's Copy writes, in UTF-8 bytes before base64. */
export const SECRET_COPY_MAX = 4096;

/** The text a secret's Copy may write (the secret itself, unchanged), or null (nothing copied, Copy not offered). */
export function secretCopyText(text: unknown): string | null {
  const t = safeCopyText(text);
  return t !== null && t === text && new TextEncoder().encode(t).length <= SECRET_COPY_MAX ? t : null;
}

/** Shown without a key press this long, a secret is hidden again. */
export const REVEAL_IDLE_MS = 60_000;

export interface IdleTimers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}
const realTimers: IdleTimers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

/** One revealed secret's idle clock: `shown()` starts it, `touch()` (a key press) restarts it while shown, `hidden()`
 *  stops it. When it runs out `hide` is called once and the clock stops. */
export class RevealIdle {
  private handle: unknown = null;
  constructor(private readonly hide: () => void, private readonly ms: number = REVEAL_IDLE_MS, private readonly timers: IdleTimers = realTimers) {}
  shown(): void { this.arm(); }
  touch(): void { if (this.handle !== null) this.arm(); }
  hidden(): void { if (this.handle !== null) { this.timers.clear(this.handle); this.handle = null; } }
  private arm(): void {
    this.hidden();
    this.handle = this.timers.set(() => { this.handle = null; this.hide(); }, this.ms);
  }
}
