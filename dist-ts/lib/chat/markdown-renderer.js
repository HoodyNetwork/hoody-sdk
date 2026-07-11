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
import chalk from 'chalk';
import { classifyShellBlock, parseExtraPatterns, } from './paste-safety.js';
/** 4KB buffered inside an open fence triggers a defensive flush. */
const FENCE_MAX_BUF_BYTES = 4096;
/** 1.5s of no new deltas inside an open fence triggers a defensive flush. */
const FENCE_IDLE_FLUSH_MS = 1500;
/** Minimum cadence for re-rendering the current prose line. */
const PROSE_RENDER_MIN_MS = 30;
/**
 * Factory. Pass to streamCompletion's onDelta: (d) => r.write(d.content ?? '').
 *
 * TTY / color detection:
 *   - out not TTY → raw mode regardless of noMarkdown flag.
 *   - NO_COLOR env set → raw mode (respects the common convention).
 *   - noMarkdown === true → raw mode.
 * Otherwise: rendered mode.
 */
export function createRenderer(opts = {}) {
    const out = opts.out ?? process.stdout;
    const isTty = out.isTTY === true;
    const forceColor = !!process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0';
    const noColor = !!process.env.NO_COLOR;
    // Chalk's own convention: FORCE_COLOR wins over non-TTY detection; NO_COLOR
    // wins over everything. We mirror that so our renderer's ANSI output matches
    // chalk's own ANSI emission decisions.
    const raw = opts.noMarkdown === true || noColor || (!isTty && !forceColor);
    if (raw)
        return new RawRenderer(out);
    const extraDanger = parseExtraPatterns(opts.extraDangerPatternsEnv ?? process.env.HOODY_CHAT_EXTRA_DESTRUCTIVE_PATTERNS);
    return new AnsiRenderer(out, extraDanger);
}
// ---------------------------------------------------------------------------
// Raw renderer (pipes, scripts, NO_COLOR)
// ---------------------------------------------------------------------------
class RawRenderer {
    out;
    lastChunkEndedWithNewline = false;
    constructor(out) {
        this.out = out;
    }
    write(delta) {
        if (!delta)
            return;
        this.out.write(delta);
        this.lastChunkEndedWithNewline = delta.endsWith('\n');
    }
    end() {
        if (!this.lastChunkEndedWithNewline)
            this.out.write('\n');
    }
}
class AnsiRenderer {
    out;
    extraDanger;
    /** Raw stream buffer — all deltas concatenated. We scan this for fence
     *  boundaries; content in front of an unparsed fence-open is safe to stream. */
    tail = '';
    /** Rendered-but-not-yet-flushed prose accumulator (single line that's still
     *  being completed). Flushed on `\n` or throttle interval. */
    proseLine = '';
    lastProseRenderAt = 0;
    proseThrottleTimer;
    /** Current fence (open) or undefined (prose mode). */
    fence;
    /** Whether the most-recent character written to `out` was `\n`. Used to
     *  ensure exactly one trailing newline. */
    lastWrittenIsNewline = true;
    constructor(out, extraDanger) {
        this.out = out;
        this.extraDanger = extraDanger;
    }
    write(delta) {
        if (!delta)
            return;
        this.tail += delta;
        this.consume();
    }
    end() {
        // Flush any pending prose.
        if (this.proseThrottleTimer) {
            clearTimeout(this.proseThrottleTimer);
            this.proseThrottleTimer = undefined;
        }
        if (this.proseLine.length > 0) {
            this.emit(formatInline(this.proseLine));
            this.proseLine = '';
        }
        // An unclosed fence at EOS → render partial content with an explicit notice.
        if (this.fence) {
            this.flushFenceAsPartial('stream ended before closing fence');
        }
        if (!this.lastWrittenIsNewline)
            this.emit('\n');
        if (this.tail.length > 0) {
            // Any remainder that wasn't a recognized construct — emit as prose.
            this.emit(formatInline(this.tail));
            this.tail = '';
            this.emit('\n');
        }
    }
    // -------------------------------------------------------------------------
    // Core consumer: iterate the tail buffer and dispatch fence-open / close /
    // prose logic.
    // -------------------------------------------------------------------------
    consume() {
        while (this.tail.length > 0) {
            if (this.fence) {
                // Look for closing fence: ```\n or ```$ (at end of stream).
                const close = findClosingFence(this.tail);
                if (close === -1) {
                    // No close yet. Append the entire tail to fence buffer and wait.
                    this.fence.buf += this.tail;
                    this.tail = '';
                    this.fence.lastAppendAt = Date.now();
                    this.scheduleFenceIdleTimer();
                    this.maybeDefensiveFlush();
                    return;
                }
                // Close found at index `close.index`. Consume up to and including
                // the fence marker + newline.
                this.fence.buf += this.tail.slice(0, close.index);
                this.tail = this.tail.slice(close.index + close.length);
                this.clearFenceIdleTimer();
                this.renderClosedFence();
                this.fence = undefined;
                continue;
            }
            // Prose mode — look for the NEXT fence open or `\n`.
            const open = findOpeningFence(this.tail);
            const nl = this.tail.indexOf('\n');
            if (open === -1 && nl === -1) {
                // No boundaries. Accumulate and wait for more, but throttle render.
                this.proseLine += this.tail;
                this.tail = '';
                this.scheduleProseRender();
                return;
            }
            if (open !== -1 && (nl === -1 || open.index < nl)) {
                // A fence starts before the next newline. Flush prose up to the fence.
                this.proseLine += this.tail.slice(0, open.index);
                this.tail = this.tail.slice(open.index + open.length);
                this.flushProseLine(/*trailingNewline*/ false);
                // If there was already content after the prose line break, newline it.
                if (!this.lastWrittenIsNewline)
                    this.emit('\n');
                this.fence = {
                    lang: open.lang,
                    buf: '',
                    openedAt: Date.now(),
                    lastAppendAt: Date.now(),
                    idleTimer: undefined,
                    partialFlushed: false,
                };
                continue;
            }
            // A newline before any fence — flush the prose line.
            this.proseLine += this.tail.slice(0, nl);
            this.tail = this.tail.slice(nl + 1);
            this.flushProseLine(/*trailingNewline*/ true);
        }
    }
    // -------------------------------------------------------------------------
    // Prose rendering
    // -------------------------------------------------------------------------
    flushProseLine(trailingNewline) {
        if (this.proseThrottleTimer) {
            clearTimeout(this.proseThrottleTimer);
            this.proseThrottleTimer = undefined;
        }
        if (this.proseLine.length > 0) {
            this.emit(formatInline(this.proseLine));
            this.proseLine = '';
        }
        if (trailingNewline)
            this.emit('\n');
    }
    scheduleProseRender() {
        if (this.proseThrottleTimer)
            return;
        const now = Date.now();
        const sinceLast = now - this.lastProseRenderAt;
        const delay = sinceLast >= PROSE_RENDER_MIN_MS ? 0 : PROSE_RENDER_MIN_MS - sinceLast;
        this.proseThrottleTimer = setTimeout(() => {
            this.proseThrottleTimer = undefined;
            if (this.proseLine.length > 0 && !this.fence) {
                // Stream the current prose line so far WITHOUT a trailing newline;
                // it will be completed on next `\n` or end().
                this.emit(formatInline(this.proseLine));
                this.proseLine = '';
                this.lastProseRenderAt = Date.now();
            }
        }, delay);
    }
    // -------------------------------------------------------------------------
    // Fence rendering
    // -------------------------------------------------------------------------
    renderClosedFence() {
        if (!this.fence)
            return;
        const { lang, buf, partialFlushed } = this.fence;
        const classification = classifyShellBlock({
            lang,
            body: buf,
            extraDanger: this.extraDanger,
        });
        if (partialFlushed) {
            // Already emitted partial content + "(flushing partial)" notice. Just
            // emit a short "(complete)" tail so the user knows the fence closed.
            this.emit(chalk.dim('— fence complete —\n'));
            return;
        }
        renderFenceBlock(this.out, lang, buf, classification);
        this.lastWrittenIsNewline = true;
    }
    maybeDefensiveFlush() {
        if (!this.fence)
            return;
        if (this.fence.buf.length < FENCE_MAX_BUF_BYTES)
            return;
        this.flushFenceAsPartial('buffer size limit reached');
    }
    scheduleFenceIdleTimer() {
        if (!this.fence)
            return;
        if (this.fence.idleTimer)
            return;
        this.fence.idleTimer = setTimeout(() => {
            if (!this.fence)
                return;
            this.flushFenceAsPartial('idle inside fence');
        }, FENCE_IDLE_FLUSH_MS);
    }
    clearFenceIdleTimer() {
        if (this.fence?.idleTimer) {
            clearTimeout(this.fence.idleTimer);
            this.fence.idleTimer = undefined;
        }
    }
    flushFenceAsPartial(reason) {
        if (!this.fence)
            return;
        const { lang, buf } = this.fence;
        const classification = classifyShellBlock({
            lang,
            body: buf,
            extraDanger: this.extraDanger,
        });
        renderFenceBlock(this.out, lang, buf, classification, {
            partial: true,
            partialReason: reason,
        });
        this.fence.buf = ''; // already emitted; keep consuming new deltas
        this.fence.partialFlushed = true;
        this.clearFenceIdleTimer();
        this.lastWrittenIsNewline = true;
    }
    emit(s) {
        if (!s)
            return;
        this.out.write(s);
        this.lastWrittenIsNewline = s.endsWith('\n');
    }
}
/**
 * Find the next opening fence marker. Returns the position of the three
 * backticks and the consumed length (through the newline ending the fence
 * line). The "lang" is the token after the fence on the same line.
 *
 * A valid opening fence is ``` at start-of-string OR after a `\n`, followed
 * by an optional language token, followed by `\n`.
 */
export function findOpeningFence(s) {
    let from = 0;
    while (from < s.length) {
        const i = s.indexOf('```', from);
        if (i === -1)
            return -1;
        // Must be at string start or preceded by newline.
        if (i > 0 && s[i - 1] !== '\n') {
            from = i + 3;
            continue;
        }
        // Find end of fence line.
        const lineEnd = s.indexOf('\n', i + 3);
        if (lineEnd === -1) {
            // Incomplete open — wait for more data.
            return -1;
        }
        const fenceLine = s.slice(i + 3, lineEnd);
        // If the fence line contains ``` it's actually a close on the same line
        // (not supported as both open+close; skip).
        if (fenceLine.includes('```')) {
            from = lineEnd + 1;
            continue;
        }
        const lang = fenceLine.trim();
        return { index: i, length: lineEnd - i + 1, lang };
    }
    return -1;
}
/**
 * Find the next closing fence marker. Returns the position of the three
 * backticks and the consumed length through the following newline (if any).
 *
 * A valid closing fence is ``` at start-of-string OR after a `\n`, followed
 * by optional whitespace and a newline (or end-of-string).
 */
export function findClosingFence(s) {
    let from = 0;
    while (from < s.length) {
        const i = s.indexOf('```', from);
        if (i === -1)
            return -1;
        if (i > 0 && s[i - 1] !== '\n') {
            from = i + 3;
            continue;
        }
        // Rest of line must be whitespace-only to count as a close.
        const after = i + 3;
        const nl = s.indexOf('\n', after);
        const rest = nl === -1 ? s.slice(after) : s.slice(after, nl);
        if (/^\s*$/.test(rest)) {
            const length = nl === -1 ? s.length - i : nl - i + 1;
            return { index: i, length };
        }
        from = after;
    }
    return -1;
}
// ---------------------------------------------------------------------------
// Inline prose formatter
// ---------------------------------------------------------------------------
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
export function formatInline(s) {
    if (!s)
        return s;
    // Two-pass approach: first extract inline `code` spans into placeholders
    // so subsequent bold/italic regexes can't touch their content. After the
    // other transforms run, substitute the formatted code back in.
    //
    // Placeholder uses U+FFFE — a "non-character" explicitly reserved by
    // Unicode to NEVER appear in interchange (stronger guarantee than NUL
    // byte, which LLMs can theoretically emit). Even so, we pre-scrub any
    // U+FFFE from the input up front so a pathological LLM output that does
    // contain it cannot collide with our placeholder.
    const PLACEHOLDER_START = '\uFFFE\uFFFE';
    const PLACEHOLDER_END = '\uFFFE';
    const safe = s.replace(/\uFFFE/g, '');
    const codeSpans = [];
    let out = safe.replace(/`([^`\n]+)`/g, (_m, c) => {
        const idx = codeSpans.length;
        codeSpans.push(chalk.dim.cyan(c));
        return `${PLACEHOLDER_START}${idx}${PLACEHOLDER_END}`;
    });
    // Headings: line-leading # … — detect at start of string OR after newline.
    out = out.replace(/(^|\n)(#{1,6})\s+(.+?)(\n|$)/g, (_m, pre, _hash, text, post) => {
        return `${pre}${chalk.bold.cyan(text)}${post}`;
    });
    // Bold **...**
    out = out.replace(/\*\*([^*\n]+)\*\*/g, (_m, b) => chalk.bold(b));
    // Italic *...* or _..._ (single marker, no nesting).
    out = out.replace(/(^|[^\w*])\*([^*\n]+)\*/g, (_m, pre, i) => `${pre}${chalk.italic(i)}`);
    out = out.replace(/(^|[^\w_])_([^_\n]+)_/g, (_m, pre, i) => `${pre}${chalk.italic(i)}`);
    // Links [label](url)
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => `${chalk.underline.cyan(label)} ${chalk.dim(`(${url})`)}`);
    // Substitute inline-code placeholders back.
    out = out.replace(/\uFFFE\uFFFE(\d+)\uFFFE/g, (_m, i) => codeSpans[Number(i)] ?? '');
    return out;
}
const GUTTER = '│';
const FOOTER_TEXT = 'Review before pasting. hoody chat cannot execute commands.';
export function renderFenceBlock(out, lang, body, classification, extras = {}) {
    const isShell = classification.isShellFence;
    const gutter = (() => {
        if (!isShell)
            return chalk.dim(GUTTER);
        if (classification.severity === 'danger')
            return chalk.red.bold(GUTTER);
        if (classification.severity === 'review')
            return chalk.yellow(GUTTER);
        return chalk.blue(GUTTER);
    })();
    const langLabel = (lang || '').trim() || (isShell ? 'shell' : 'text');
    const headerTop = chalk.dim(`─── ${langLabel} ${extras.partial ? `(partial: ${extras.partialReason}) ` : ''}───`);
    out.write(headerTop + '\n');
    if (isShell && classification.severity === 'danger') {
        out.write(chalk.red.bold('⚠ DESTRUCTIVE SUGGESTION — verify manually') + '\n');
    }
    else if (isShell && classification.severity === 'review') {
        out.write(chalk.yellow('⚠ REVIEW') + '\n');
    }
    const lines = body.replace(/\n$/, '').split('\n');
    // Set lookups are O(1). The prior Array.includes scan was O(n·m); on a
    // 10k-line closed fence with many DANGER matches that pushed render time
    // into seconds.
    const dangerSet = new Set(classification.dangerLines);
    const reviewSet = new Set(classification.reviewLines);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const prefix = dangerSet.has(i)
            ? chalk.red.bold('⚠ ')
            : reviewSet.has(i)
                ? chalk.yellow('⚠ ')
                : '  ';
        out.write(`${gutter} ${prefix}${line}\n`);
    }
    if (isShell) {
        out.write(chalk.dim(`  ${FOOTER_TEXT}`) + '\n');
    }
}
