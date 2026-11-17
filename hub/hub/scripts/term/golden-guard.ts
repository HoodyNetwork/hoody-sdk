// golden-guard.ts: what a page golden may never be.
//   crash   the frame shows an error screen instead of the page (goldens.ts crashShown: a stack, the router's error,
//           "This page could not be drawn.") or the failed-mount line (shot-guard.ts STOPPED_LINE)
//   secret  the frame holds a fixture secret of the page (scripts/term/secrets.ts pageNeedles + hitOf)
// --update never stores such a frame (an earlier stored one of a crashing case is removed); a check fails a stored
// golden that is one, so old ones fail until refreshed. Problem text is passed through the secrets gate's redaction.
import { STOPPED_LINE } from './shot-guard';

export interface SecretTools {
  needles: readonly string[];
  hitOf(needle: string, hay: string): string | null;
  redact(text: string, needles: Iterable<string>): string;
}

export type Refusal = { kind: 'crash' | 'secret'; why: string };

/** Why this frame may not be a golden, or null. `crashShown` is goldens.ts's own reader of error screens. */
export function frameRefusal(frame: string, crashShown: (f: string) => string | null, sec: SecretTools | null): Refusal | null {
  const c = crashShown(frame);
  if (c) return { kind: 'crash', why: c };
  const m = STOPPED_LINE.exec(frame);
  if (m) return { kind: 'crash', why: frame.slice(m.index).split('\n')[0]!.trim() };
  if (sec) for (const n of sec.needles) {
    const how = sec.hitOf(n, frame);
    if (how) return { kind: 'secret', why: `holds a fixture secret (${how} match; the value is never printed)` };
  }
  return null;
}

/** Cases that show a fixture secret ON PURPOSE (a reveal flow): judged by every gate, never stored or compared (no
 *  golden, no identity copy), and a frame that no longer shows the secret fails (`reveal-missing`). Keyed by page, case
 *  name as goldens.ts names it (`shot-<name>`). Any other frame with a secret still fails (`golden-secret`). */
export const REVEAL_CASES: Readonly<Record<string, readonly string[]>> = {
  vault: ['shot-value-shown', 'shot-value-decrypted'],
};

/** The secrets gate's helpers for one page (scripts/term/secrets.ts). A page whose needles cannot be read throws (the
 *  caller fails the page: no golden is judged without them). */
export async function secretToolsFor(page: string): Promise<SecretTools> {
  // Loaded here, not at the top: secrets.ts is itself a runner entry that awaits goldens.ts (which imports this file),
  // and a static import would close that cycle; the entry would wait on its own evaluation (goldens-entry test).
  const { hitOf, pageNeedles, redactSecrets } = await import('./secrets');
  return { needles: await pageNeedles(page), hitOf, redact: redactSecrets };
}
