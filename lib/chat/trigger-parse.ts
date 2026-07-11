/**
 * trigger-parse — detect the user's `@hoody.com` docs-search trigger with
 * robustness against incidental matches.
 *
 * Contract:
 *   - Unicode-safe lookbehind: `@hoody.com` must NOT be part of a word
 *     (rejects `foo@hoody.com` email, `а@hoody.com` Cyrillic homograph).
 *   - Strip fenced/inline/indented code blocks before matching so a pasted
 *     example containing `@hoody.com` does NOT trigger.
 *   - Stripped query must be ≥ 8 chars. Shorter → TTY prompt, non-TTY refuse.
 *   - 60-second intra-process dedupe on identical queries (callers pass a
 *     cache map).
 */

export interface DetectTriggerOptions {
  userMessage: string;
}

export interface DetectTriggerResult {
  /** True if a valid trigger was found after all strippers. */
  hit: boolean;
  /** User message with the @hoody.com token removed; used as the fallback
   *  query if the surrounding text is all that's available. */
  strippedMessage: string;
  /** The proposed query: user message minus the trigger, trimmed. */
  query: string;
}

// Unicode-aware negative lookbehind — reject any letter/number/underscore
// before `@`. Covers Cyrillic/CJK homographs (`а@hoody.com` etc.).
const HOODY_TRIGGER = /(?<![\p{L}\p{N}_])@hoody\.com\b/iu;

/**
 * Strip four code forms so `@hoody.com` appearing in quoted examples does
 * NOT trigger the search:
 *   1. Backtick fences (```) — closed or unclosed. Unclosed eats to EOM.
 *   2. Tilde fences (~~~) — same rules. CommonMark alternative delimiter.
 *   3. Inline single-backtick spans.
 *   4. Indented code lines: 4-space OR leading-tab (CommonMark convention).
 */
export function stripCodeContexts(s: string): string {
  let out = s.replace(/```[\s\S]*?(?:```|$)/g, '');           // backtick fenced
  out = out.replace(/~~~[\s\S]*?(?:~~~|$)/g, '');              // tilde fenced
  out = out.replace(/`[^`\n]*`/g, '');                         // inline backticks
  out = out.split('\n').filter(l => !/^(?: {4,}|\t)/.test(l)).join('\n');
  return out;
}

/**
 * Detect whether `@hoody.com` appears in the user's message OUTSIDE of any
 * code context.
 */
export function detectTrigger(opts: DetectTriggerOptions): DetectTriggerResult {
  const stripped = stripCodeContexts(opts.userMessage);
  const hit = HOODY_TRIGGER.test(stripped);
  // Derive the search query from the stripped text — NOT the original
  // message — so code-block content (quoted shell logs, example emails,
  // etc.) can't leak into the docs-search query nor satisfy the 8-char
  // length gate elsewhere in the pipeline.
  const query = stripped.replace(HOODY_TRIGGER, '').trim();
  return { hit, strippedMessage: stripped, query };
}

// ---------------------------------------------------------------------------
// Dedupe cache — per-process, per-REPL
// ---------------------------------------------------------------------------

export interface DedupeEntry<T> {
  at: number;
  result: T;
}

export class DedupeCache<T> {
  private map = new Map<string, DedupeEntry<T>>();
  constructor(private ttlMs = 60_000) {}

  get(key: string, now = Date.now()): T | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (now - e.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return e.result;
  }

  set(key: string, result: T, now = Date.now()): void {
    this.map.set(key, { at: now, result });
  }

  clear(): void {
    this.map.clear();
  }
}

// ---------------------------------------------------------------------------
// XML-like escape (shared with run.ts; redefined here to avoid a run.ts dep)
// ---------------------------------------------------------------------------

/** Escape `&`, `<`, `>` so a crafted payload cannot break out of wrappers. */
export function escapeXmlLike(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
