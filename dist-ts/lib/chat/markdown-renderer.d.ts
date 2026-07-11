/**
 * markdown-renderer — streaming ANSI renderer for `hoody chat`.
 *
 * Strategy:
 *   - Outside code fences: stream tokens to stdout immediately. Re-parse only
 *     the CURRENT line at `\n` to apply inline formatting (bold, italic,
 *     headings, inline code). Throttled to 30ms minimum cadence to avoid
 *     quadratic re-parse on fast streams.
 *   - Inside code fences: buffer raw bytes until the closing ``` arrives.
 *     On close: pass buffer to paste-safety.classifyShellBlock(), then render
 *     with left gutter + header + footer.
 *   - Defensive flushes: 4KB buffered OR 1.5s idle → flush the fence as
 *     "unclosed-so-far" with a notice, keep buffering subsequent deltas.
 *   - Fallback: --no-markdown / non-TTY / NO_COLOR=1 → raw pass-through.
 *
 * We intentionally do NOT bundle `marked` or `marked-terminal` (~1.4MB for
 * marked-terminal). Block parsing is done by detecting fence boundaries in
 * the incoming text stream; inline chalk formatting uses small regex-based
 * transforms. This keeps the lazy chat chunk small and avoids an AST walker
 * that's awkward to feed with streaming partial input. If we ever need
 * tables or complex lists we'll wire `marked` into the inline path only —
 * fence handling stays in this module.
 */
import { type ClassificationResult } from './paste-safety.js';
export interface RendererOptions {
    /** Destination stream (defaults to process.stdout). */
    out?: NodeJS.WritableStream;
    /** Disable all color/formatting — emit raw text only. */
    noMarkdown?: boolean;
    /** Org-policy DANGER patterns appended to built-ins. */
    extraDangerPatternsEnv?: string;
}
export interface StreamingRenderer {
    /** Append a delta from the LLM. Emits rendered output as a side effect. */
    write(delta: string): void;
    /** Called when the stream ends. Flushes any pending buffer + trailing newline. */
    end(): void;
}
/**
 * Factory. Pass to streamCompletion's onDelta: (d) => r.write(d.content ?? '').
 *
 * TTY / color detection:
 *   - out not TTY → raw mode regardless of noMarkdown flag.
 *   - NO_COLOR env set → raw mode (respects the common convention).
 *   - noMarkdown === true → raw mode.
 * Otherwise: rendered mode.
 */
export declare function createRenderer(opts?: RendererOptions): StreamingRenderer;
export interface OpeningFence {
    index: number;
    length: number;
    lang: string;
}
/**
 * Find the next opening fence marker. Returns the position of the three
 * backticks and the consumed length (through the newline ending the fence
 * line). The "lang" is the token after the fence on the same line.
 *
 * A valid opening fence is ``` at start-of-string OR after a `\n`, followed
 * by an optional language token, followed by `\n`.
 */
export declare function findOpeningFence(s: string): OpeningFence | -1;
export interface ClosingFence {
    index: number;
    length: number;
}
/**
 * Find the next closing fence marker. Returns the position of the three
 * backticks and the consumed length through the following newline (if any).
 *
 * A valid closing fence is ``` at start-of-string OR after a `\n`, followed
 * by optional whitespace and a newline (or end-of-string).
 */
export declare function findClosingFence(s: string): ClosingFence | -1;
/**
 * Apply chalk-based inline formatting to a single prose chunk.
 *
 *   # heading         → bold cyan (heading level collapsed; we don't style
 *                       level 2+ differently in v1 — just bold).
 *   **bold**          → bold
 *   *italic* / _it_   → italic
 *   `inline code`     → dim cyan
 *   [label](url)      → underline cyan label, then dim `url` in parens
 *
 * This is intentionally minimal. We do NOT attempt to render tables, lists,
 * or block quotes — they pass through as literal text.
 */
export declare function formatInline(s: string): string;
export interface RenderFenceExtras {
    partial?: boolean;
    partialReason?: string;
}
export declare function renderFenceBlock(out: NodeJS.WritableStream, lang: string, body: string, classification: ClassificationResult, extras?: RenderFenceExtras): void;
