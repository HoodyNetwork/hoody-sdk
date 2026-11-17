// What the screen allows a secret field (admission row 7), asked at every Show and
// every Copy press, never kept from the mount: the terminal's answers can change while it runs. A mount provides the
// asking once (`SecretScreenCtx`); a field under no provider shows nothing and copies nothing (fail closed).
//
//   - runTerm (run.ts) provides `screenAsk(renderer, stdout, env)`: the real facts of secret-screen.ts, read at each ask.
//   - The test renderer (prim/testing.ts testRender) and runTerm's createRenderer test hook provide `ALLOW_ALL`: a
//     headless frame never reaches a terminal or its scrollback.
import { createContext, useContext } from 'react';
import { REVEAL_IDLE_MS, screenFactsOf, secretCopyOf, secretRevealOf } from './secret-screen';

export interface SecretScreen {
  /** A secret may be shown (row 7's `secretReveal`). */
  readonly reveal: boolean;
  /** A secret may be copied (OSC 52 said `supported`, and a reveal is allowed). */
  readonly copy: boolean;
}
export type SecretScreenAsk = () => SecretScreen;

const DENY: SecretScreen = Object.freeze({ reveal: false, copy: false });
const ALLOW: SecretScreen = Object.freeze({ reveal: true, copy: true });

/** No provider: nothing shown, nothing copied. */
export const DENY_ALL: SecretScreenAsk = () => DENY;
/** Headless test renderers only. */
export const ALLOW_ALL: SecretScreenAsk = () => ALLOW;

export const SecretScreenCtx = createContext<SecretScreenAsk>(DENY_ALL);

/** The mount's asking; call it at the press, never keep its answer. */
export const useSecretScreen = (): SecretScreenAsk => useContext(SecretScreenCtx);

let idleMs = REVEAL_IDLE_MS;
/** How long a shown secret stays shown with no key press (rule 3), read when a field starts its clock. */
export const revealIdleMs = (): number => idleMs;
/** Tests only: a shorter idle time; `reset()` restores REVEAL_IDLE_MS. */
export const __secretIdleSeams = {
  setMs(ms: number): void { idleMs = ms; },
  reset(): void { idleMs = REVEAL_IDLE_MS; },
};

/** The real asking: the renderer's own screen mode and capability answer, the output stream and TERM, read at each
 *  call. A throw anywhere reads as "no". */
export function screenAsk(
  renderer: Parameters<typeof screenFactsOf>[0],
  out: Parameters<typeof screenFactsOf>[1],
  env: Parameters<typeof screenFactsOf>[2],
): SecretScreenAsk {
  return () => {
    try {
      const f = screenFactsOf(renderer, out, env);
      return { reveal: secretRevealOf(f), copy: secretCopyOf(f) };
    } catch {
      return DENY;
    }
  };
}
