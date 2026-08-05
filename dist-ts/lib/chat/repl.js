/**
 * repl — readline-based interactive loop for `hoody chat`.
 *
 * NOT a TUI: no alt-screen, no ncurses, no cursor moves. Plain readline
 * + stdout writes through the existing markdown renderer. Ctrl-C, pipes,
 * SSH, dumb terminals all behave like any normal CLI tool.
 *
 * Invariants:
 *   - One `AbortController` per turn, disposed on done/abort.
 *   - SIGINT state machine: idle → confirm-exit; inflight → abort + return
 *     to idle. Ctrl-D exits cleanly.
 *   - Slash commands never network (dispatched synchronously).
 *   - `/private` turns disk-write + disk-read disable on for the rest of the
 *     REPL, and cannot downgrade process-scoped `--private`.
 */
import chalk from 'chalk';
import readline from 'node:readline';
import { existsSync } from 'node:fs';
import { createRenderer } from './markdown-renderer.js';
import { askHoody, renderSources, TRUNCATION_NOTICE, SERVICE_MODEL_LABEL, SERVICE_TIER_LABEL, } from './service-client.js';
import { docsLimiter } from './docs-singletons.js';
import { createSession, appendTurn, listSessions, findMatchingSessions, deleteSession as deleteSessionFile, wipeAllSessions, truncateSessionTurns, readSession, saveEphemeralSession, } from './sessions.js';
import { showBannerIfNeeded } from './first-run-banner.js';
import { redactForDisk } from './redact.js';
export async function runRepl(opts) {
    const input = opts.input ?? process.stdin;
    const output = opts.output ?? process.stdout;
    const isTty = output.isTTY === true;
    const isStdinTty = input.isTTY === true;
    // "Truly interactive" = user can both see our output AND type input.
    // Needed for SIGINT traps, readline terminal mode, and distinguishing
    // SSH disconnect (stdin TTY → EOF mid-session = abort) from piped input
    // (`echo hi | hoody chat` in a terminal = stdout TTY but stdin pipe =
    // let the inflight LLM finish before exiting).
    const isInteractive = isTty && isStdinTty;
    // Banner gate — only on interactive TTY AND only if we're not in private
    // mode. The banner marker at ~/.hoody/chats/.seen-privacy-banner is both
    // read (existsSync) and written; under `--private` / HOODY_CHAT_PRIVATE=1
    // that would violate the "no disk reads or writes" contract. Private-mode
    // users already know about /private (that's why they enabled it), so the
    // guidance is redundant anyway.
    if (!opts.initialPrivate) {
        await showBannerIfNeeded({ out: output, isInteractive });
    }
    // Mutable REPL state.
    const noMarkdown = opts.markdown === false;
    const noStream = opts.stream === false;
    let privateMode = opts.initialPrivate;
    // In-memory session state (ephemeral unless --persist is on).
    let sessionFilePath;
    let sessionMeta;
    // Set to true once a persistence write has failed — we warn once, then
    // silently keep the REPL running in-memory-only. Prevents disk-full or
    // readonly-mount from turning the REPL into a one-shot-crash.
    let persistenceDisabled = false;
    const disablePersistenceOnError = (err, action) => {
        if (persistenceDisabled)
            return;
        persistenceDisabled = true;
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(chalk.yellow(`\n[hoody chat] Persistence ${action} failed (${msg}). Continuing in-memory only — disk writes disabled for this REPL.\n`));
    };
    const transcript = [];
    // docsLimiter is a process-wide singleton from ./docs-singletons.js so
    // runChat + runRepl share ONE rate bucket per process.
    // Non-interactive callers read the exit code; a piped REPL whose last turn
    // failed must not report success.
    let lastTurnFailed = false;
    /** Set by /save, which promotes an ephemeral session to a persistent one. */
    let persistFromSave = false;
    /** Documented exit code 2 — kept distinct from a generic runtime failure. */
    let endpointRefused = false;
    /** Delete one session file, reporting failure instead of tearing down the REPL. */
    const tryDeleteSession = async (filePath, label) => {
        try {
            await deleteSessionFile(filePath);
            return true;
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            process.stderr.write(chalk.red(`Failed to delete ${label}: ${msg}\n`));
            // A scripted run reads the exit code; a destructive command that did NOT
            // happen must not look like success.
            lastTurnFailed = true;
            return false;
        }
    };
    let state = 'idle';
    let currentAbort;
    // Resume persistent session if requested. Without --persist the request is
    // meaningless — say so rather than starting a blank session that looks
    // resumed. docs/reference/guides/chat.md documents --resume as requiring it.
    if (opts.resume !== undefined && privateMode) {
        process.stderr.write(chalk.yellow('hoody chat: --resume does nothing in private mode (it would have to read from disk); starting a new session.\n'));
    }
    else if (opts.resume !== undefined && !opts.persist) {
        process.stderr.write(chalk.yellow('hoody chat: --resume requires --persist; starting a new session.\n'));
    }
    if (opts.persist && opts.resume !== undefined && !privateMode) {
        const resumed = await resolveResumeTarget(opts.resume);
        if (resumed) {
            sessionFilePath = resumed.filePath;
            sessionMeta = resumed.meta;
            for (const t of resumed.turns) {
                transcript.push({ role: t.role, content: t.content, ts: t.ts });
            }
            output.write(chalk.dim(`Resumed session ${resumed.meta.id} — ${redactForDisk(resumed.meta.title)}\n`));
        }
        else {
            // Say so. Silently starting fresh leaves the user believing they are
            // continuing a conversation while every follow-up lacks its context.
            process.stderr.write(chalk.yellow(typeof opts.resume === 'string'
                ? `hoody chat: no session matches "${opts.resume}" — starting a new one.\n`
                : 'hoody chat: no previous session to resume — starting a new one.\n'));
        }
    }
    // Set up readline. In piped-stdin tests the caller may provide `input`.
    const rl = readline.createInterface({
        input,
        output: isTty ? output : undefined, // don't echo on pipes
        terminal: isInteractive,
        prompt: chalk.cyan('hoody> '),
    });
    // SIGINT handling (Ctrl-C).
    const onSigint = () => {
        if (state === 'inflight' && currentAbort) {
            currentAbort.abort(new Error('user-interrupt'));
            currentAbort = undefined;
            state = 'idle';
            output.write('\n' + chalk.dim('(aborted)\n'));
            rl.prompt();
            return;
        }
        if (state === 'confirm-exit') {
            output.write('\n' + chalk.dim('Exiting.\n'));
            rl.close();
            return;
        }
        state = 'confirm-exit';
        output.write('\n' + chalk.dim('Press Ctrl-C again to exit, or continue typing.\n'));
        rl.prompt();
        // Any new line flips state back; we handle that in the `line` handler.
    };
    if (isStdinTty) {
        // Readline in terminal mode CONSUMES ^C itself: it emits its own 'SIGINT'
        // event and, when nobody is listening for it, closes the interface. A
        // process-level handler alone therefore never runs, and the first Ctrl-C
        // exits the REPL outright — contradicting the "press twice" contract the
        // banner and /help advertise. Listening on `rl` is what actually takes
        // over that key; the process-level handler stays for the non-terminal
        // case, where readline does not intercept the signal.
        rl.on('SIGINT', onSigint);
        process.on('SIGINT', onSigint);
    }
    if (opts.sigintSignal) {
        opts.sigintSignal.addEventListener('abort', onSigint);
    }
    // Multi-line input state.
    let buffered = '';
    let fenced = false;
    const lineQueue = [];
    let queueResolvers = [];
    let closed = false;
    // /retry replays a previously-sent user message verbatim. If that message
    // was a fenced-block that happened to start with `/`, routing it back
    // through the slash dispatcher would execute an unintended command
    // (e.g. /load, /delete). enqueueLine(line, true) flags the replayed line
    // to bypass slash dispatch in the main loop.
    const enqueueLine = (line, bypassSlash = false) => {
        const item = { line, bypassSlash };
        if (queueResolvers.length > 0) {
            const r = queueResolvers.shift();
            r(item);
        }
        else {
            lineQueue.push(item);
        }
    };
    const nextLine = () => {
        if (lineQueue.length > 0)
            return Promise.resolve(lineQueue.shift());
        if (closed)
            return Promise.resolve(null);
        return new Promise(resolve => {
            queueResolvers.push(resolve);
        });
    };
    rl.on('line', (l) => enqueueLine(l));
    rl.once('close', () => {
        closed = true;
        // Unblock any waiters with null → loop exits.
        for (const r of queueResolvers)
            r(null);
        queueResolvers = [];
        // If stdin closes with NO pending input AND a turn is mid-flight (SSH
        // disconnect, terminal hangup), abort the outstanding LLM fetch so the
        // process exits promptly instead of sitting until the 60s timeout.
        //
        // Piped-input invocations (scripted tests, here-docs) commonly queue
        // `hi\n/exit\n` — EOF arrives before the LLM responds, yet the user
        // clearly wants the current turn to finish and /exit to run. If the
        // queue still has lines, we let the current turn complete.
        if (isStdinTty && state === 'inflight' && currentAbort && lineQueue.length === 0) {
            currentAbort.abort(new Error('stdin-closed'));
        }
    });
    // Expose a pull-the-next-line helper for destructive confirmations
    // (e.g., /wipe). Must be called from inside a handler — otherwise it
    // races with the main loop.
    const readConfirmation = async () => {
        const item = await nextLine();
        return item === null ? null : item.line;
    };
    // Initial prompt.
    rl.prompt();
    // Main consume loop.
    while (true) {
        const queued = await nextLine();
        if (queued === null)
            break;
        const line = queued.line;
        const bypassSlash = queued.bypassSlash;
        // Any normal input clears pending confirm-exit — user kept typing, so
        // they are no longer trying to exit via double-Ctrl-C.
        // Cast: TS narrows `state` to its init value across closure boundaries
        // and can't see the SIGINT handler mutating it to 'confirm-exit'.
        if (state === 'confirm-exit')
            state = 'idle';
        // Multi-line fence: """ toggles.
        if (line.trim() === '"""') {
            if (!fenced) {
                fenced = true;
                rl.prompt();
                continue;
            }
            fenced = false;
            const full = buffered;
            buffered = '';
            if (!full.trim()) {
                rl.prompt();
                continue;
            }
            await handleMessage(full);
            rl.prompt();
            continue;
        }
        if (fenced) {
            buffered += (buffered.length > 0 ? '\n' : '') + line;
            rl.prompt();
            continue;
        }
        // Trailing-backslash continuation.
        if (line.endsWith('\\')) {
            buffered += (buffered.length > 0 ? '\n' : '') + line.slice(0, -1);
            rl.prompt();
            continue;
        }
        const msg = (buffered.length > 0 ? buffered + '\n' : '') + line;
        buffered = '';
        if (!msg.trim()) {
            rl.prompt();
            continue;
        }
        // Slash command dispatch — skipped when the line was enqueued with
        // bypassSlash=true (e.g. a /retry replay of a user message that began
        // with '/').
        if (!bypassSlash && msg.trim().startsWith('/')) {
            const handled = await handleSlash(msg.trim(), readConfirmation);
            if (handled === 'exit') {
                rl.close();
                break;
            }
            rl.prompt();
            continue;
        }
        await handleMessage(msg);
        rl.prompt();
    }
    // A non-interactive run (`printf 'q\n' | hoody chat`) is scripted: its exit
    // code is the only signal the caller gets, so a failed final turn must not
    // report success. An interactive session is not failed by one bad turn.
    if (!isInteractive && lastTurnFailed) {
        // docs/reference/guides/chat.md reserves 2 for "service endpoint not
        // accepted"; the one-shot path already exits 2 for it.
        process.exitCode = endpointRefused ? 2 : 1;
    }
    return cleanup();
    // -------------------------------------------------------------------------
    // Handlers
    // -------------------------------------------------------------------------
    async function handleMessage(userMsg) {
        state = 'inflight';
        // Hold our OWN reference. The SIGINT handler sets `currentAbort` back to
        // undefined, and there are awaits (the persist write) between here and the
        // request — reading the shared binding afterwards can dereference null and
        // crash the REPL instead of returning to the prompt.
        const abort = new AbortController();
        currentAbort = abort;
        // Persist this user turn (if applicable) — AFTER redaction downstream.
        const ts = new Date().toISOString();
        transcript.push({ role: 'user', content: userMsg, ts });
        if (shouldPersist()) {
            try {
                await ensureSessionFile(userMsg);
                if (sessionFilePath) {
                    await appendTurn(sessionFilePath, { role: 'user', content: userMsg, ts });
                }
            }
            catch (err) {
                disablePersistenceOnError(err, 'user-turn write');
            }
        }
        // Replay prior turns as conversation history so follow-ups resolve
        // ("it", "that one"). Capped at HOODY_CHAT_MAX_HISTORY, then again at the
        // service's own limit inside the client. Parse carefully so an explicit
        // `0` (disable memory) is honored rather than falling through to 10.
        const rawHistoryEnv = process.env.HOODY_CHAT_MAX_HISTORY;
        const parsedHistory = rawHistoryEnv !== undefined && /^\d+$/.test(rawHistoryEnv)
            ? Number(rawHistoryEnv)
            : undefined;
        const historyCap = parsedHistory !== undefined ? parsedHistory : 10;
        // Replay COMPLETE exchanges only. The current user turn is already on the
        // transcript (the client sends it as `message`), and a user turn whose
        // request FAILED — rejected locally as over-long, network error, Ctrl-C —
        // has no assistant reply. Replaying those forever re-sends the same dead
        // text on every later turn, so a 60 KB rejected question keeps pushing the
        // request past the server's body cap. Walking pairs drops them.
        //
        // `historyCap === 0` means "send each question standalone" — a documented
        // privacy control. It MUST be special-cased: `slice(-0)` is `slice(0)`,
        // which returns the WHOLE array, so the naive expression would send
        // everything precisely when the user asked for nothing.
        const pairs = [];
        const prior = transcript.slice(0, -1);
        for (let i = 0; i < prior.length - 1; i++) {
            const u = prior[i];
            const a = prior[i + 1];
            if (u.role === 'user' && a.role === 'assistant') {
                pairs.push({ role: 'user', content: u.content });
                pairs.push({ role: 'assistant', content: a.content });
                i++; // consume the assistant turn too
            }
        }
        const history = historyCap <= 0 ? [] : pairs.slice(-historyCap * 2);
        const renderer = createRenderer({ out: output, noMarkdown });
        let assistantText = '';
        let turnFailed = false;
        // Spinner: braille-dots rotation + "thinking…" label, shown only on a
        // real TTY so piped output stays clean. Auto-clears on the first stream
        // byte and on turn end / abort / error.
        const spinner = isInteractive ? startSpinner(output) : null;
        const result = await askHoody({
            message: userMsg,
            history,
            limiter: docsLimiter,
            acceptEndpointFlag: opts.acceptEndpointFlag,
            acceptEndpointEnv: opts.acceptEndpointEnv,
            isTty: isInteractive,
            sessionOnly: privateMode,
            // Thread the per-turn abort signal so SIGINT cancels the in-flight
            // request instead of waiting out the timeout.
            signal: abort.signal,
            onDelta: noStream
                ? undefined
                : chunk => {
                    if (spinner)
                        spinner.stop();
                    assistantText += chunk;
                    renderer.write(chunk);
                },
        });
        if (spinner)
            spinner.stop();
        if ('error' in result) {
            turnFailed = true;
            // A user-initiated abort (Ctrl-C) or a closed stdin is not a failure to
            // report — onSigint has already printed "(aborted)". Printing a red
            // "Error: user-interrupt" on top of it is noise, and it must not set a
            // non-zero exit code for a scripted run either.
            const userAborted = abort.signal.aborted ||
                /user-interrupt|stdin-closed|aborted by caller/.test(result.message);
            // Per-turn, not sticky: a refusal on turn 1 must not relabel a network
            // failure on turn 2 as an endpoint refusal.
            endpointRefused = result.error === 'endpoint-not-accepted';
            if (!userAborted) {
                lastTurnFailed = true;
                // Errors go to stderr, never stdout: a piped `hoody chat` must not get
                // an error message mixed into the answer text.
                process.stderr.write(chalk.red(`Error: ${result.message}`) + '\n');
            }
        }
        else {
            lastTurnFailed = false;
            if (noStream) {
                assistantText = result.text;
                renderer.write(result.text);
            }
            if (result.truncated)
                renderer.write(TRUNCATION_NOTICE);
            // Citations are RENDERED, never folded back into `assistantText`.
            // That text is replayed to the service as conversation history, and a
            // model shown a hand-written "Sources:" list in a prior assistant turn
            // copies the pattern — inventing doc links on later turns, which the
            // service's own instructions forbid. Keep history to what the model
            // actually said; the links are ours, derived from the `sources` frame.
            const citations = renderSources(result.sources);
            if (citations)
                renderer.write(citations);
        }
        renderer.end();
        // Record assistant turn + persist, but ONLY if the turn completed cleanly
        // and we have content. An aborted (Ctrl-C) or network-errored turn would
        // otherwise leave a partial/empty assistant message in the transcript
        // and on disk.
        const aborted = abort.signal.aborted === true;
        if (!turnFailed && !aborted && assistantText.length > 0) {
            const tsA = new Date().toISOString();
            transcript.push({ role: 'assistant', content: assistantText, ts: tsA });
            if (shouldPersist() && sessionFilePath) {
                try {
                    await appendTurn(sessionFilePath, { role: 'assistant', content: assistantText, ts: tsA });
                }
                catch (err) {
                    disablePersistenceOnError(err, 'assistant-turn write');
                }
            }
        }
        currentAbort = undefined;
        state = 'idle';
    }
    async function handleSlash(raw, readConfirmation) {
        const [cmd, ...restTokens] = raw.slice(1).split(/\s+/);
        const rest = restTokens.join(' ').trim();
        switch (cmd) {
            case 'help': return helpCmd();
            case 'exit':
            case 'quit':
                return 'exit';
            case 'clear':
                if (isTty)
                    output.write('\x1b[2J\x1b[H');
                return 'continue';
            case 'new':
                return newCmd();
            case 'history':
                return historyCmd();
            case 'sessions':
                return sessionsCmd();
            case 'load':
                return loadCmd(rest);
            case 'save':
                return saveCmd();
            case 'delete':
                return deleteCmd(rest);
            case 'wipe':
                return wipeCmd(readConfirmation);
            case 'private':
                return privateCmd();
            case 'retry':
                return retryCmd();
            default:
                output.write(chalk.red(`Unknown command: /${cmd}. Try /help.\n`));
                return 'continue';
        }
    }
    /**
     * /retry — drop the last exchange (trailing assistant turn + the user
     * turn that prompted it) and re-send that user message through the
     * normal handleMessage() path. Useful when the model flubbed the reply
     * or the stream cut off.
     *
     * For persistent sessions, also ATOMICALLY rewrites the session file to
     * drop those same turns from disk, so `--resume` later shows only the
     * retried reply (no orphaned user/assistant residue).
     *
     * No-op if there's no prior user turn. In-flight turns block retry with
     * an explicit notice (race-proof: state is always 'idle' here by design,
     * but we check defensively).
     */
    async function retryCmd() {
        if (state === 'inflight') {
            output.write(chalk.yellow('/retry refused: a turn is in flight. Ctrl-C to abort first.\n'));
            return 'continue';
        }
        if (transcript.length === 0) {
            output.write(chalk.dim('Nothing to retry — no turns yet.\n'));
            return 'continue';
        }
        let lastUserIdx = -1;
        for (let i = transcript.length - 1; i >= 0; i--) {
            if (transcript[i].role === 'user') {
                lastUserIdx = i;
                break;
            }
        }
        if (lastUserIdx === -1) {
            output.write(chalk.dim('Nothing to retry — no user turn in transcript.\n'));
            return 'continue';
        }
        const lastUserMsg = transcript[lastUserIdx].content;
        // Drop the user turn AND everything after (assistant reply, other
        // trailing turns). handleMessage will write a fresh user turn + reply.
        transcript.length = lastUserIdx;
        // Mirror the truncation on disk if this session is persisted, so
        // --resume doesn't resurrect the dropped assistant reply later.
        if (shouldPersist() && sessionFilePath) {
            try {
                await truncateSessionTurns(sessionFilePath, lastUserIdx);
            }
            catch (err) {
                disablePersistenceOnError(err, 'retry truncate');
            }
        }
        output.write(chalk.dim('Retrying last message…\n'));
        // A fenced-block message whose first char is '/' must not re-enter the
        // slash dispatcher when replayed.
        const bypassSlash = true;
        enqueueLine(lastUserMsg, bypassSlash);
        return 'continue';
    }
    function helpCmd() {
        const rows = [
            ['/help', 'Print this table'],
            ['/exit, /quit', 'Exit the REPL'],
            ['/clear', 'Clear the screen (keeps current session)'],
            ['/new', 'Start a fresh session in-place'],
            ['/history', 'Print current transcript'],
            ['/sessions', `List persistent sessions (${privateMode ? 'disabled in private mode' : 'OK'})`],
            ['/load <id>', `Switch REPL to that session's history${privateMode ? ' (disabled in private mode)' : ''}`],
            ['/save', `Promote current session → persistent file${privateMode ? ' (refused in private mode)' : ''}`],
            ['/delete [id]', `Delete session <id>; no arg = delete current + /new${privateMode ? ' (disabled in private mode)' : ''}`],
            ['/wipe', `Delete ALL persistent sessions (confirms)${privateMode ? ' (disabled in private mode)' : ''}`],
            ['/private', `Toggle private mode (currently: ${privateMode ? 'ON' : 'OFF'})`],
            ['/retry', 'Drop the last assistant reply and re-send the last user message'],
        ];
        for (const [name, desc] of rows) {
            output.write(`  ${chalk.cyan(name.padEnd(18))} ${desc}\n`);
        }
        return 'continue';
    }
    /** Adopt a session file as the live one, persisting subsequent turns to it. */
    function adoptSession(filePath, meta) {
        sessionFilePath = filePath;
        sessionMeta = meta;
        // Without this, follow-ups after /load are answered but never written, and
        // /save then reports "already persisted" while still dropping them.
        persistFromSave = true;
    }
    function newCmd() {
        transcript.length = 0;
        sessionFilePath = undefined;
        sessionMeta = undefined;
        // /save promoted the PREVIOUS conversation. A fresh one is ephemeral again
        // unless the user asks for it — a REPL started without --persist must not
        // start writing new files just because one conversation was saved.
        persistFromSave = false;
        // privateMode is deliberately NOT reset: /private is one-way for the life
        // of the process, and silently re-enabling disk writes here would be the
        // surprising direction to be wrong in.
        output.write(chalk.dim('New session.\n'));
        return 'continue';
    }
    function historyCmd() {
        if (transcript.length === 0) {
            output.write(chalk.dim('(empty transcript)\n'));
            return 'continue';
        }
        for (const t of transcript) {
            const roleColor = t.role === 'user' ? chalk.green : t.role === 'assistant' ? chalk.blue : chalk.dim;
            output.write(roleColor(`[${t.role}]`) + ' ' + redactForDisk(t.content) + '\n');
        }
        return 'continue';
    }
    async function sessionsCmd() {
        if (privateMode) {
            output.write(chalk.yellow('/sessions disabled in private mode.\n'));
            return 'continue';
        }
        const list = await listSessions();
        if (list.length === 0) {
            output.write(chalk.dim('(no persistent sessions)\n'));
            return 'continue';
        }
        for (const s of list) {
            output.write(`  ${chalk.cyan(s.id)}  ${chalk.dim(s.updatedAt)}  ${s.turnCount} turn${s.turnCount === 1 ? '' : 's'}  ${redactForDisk(s.title)}\n`);
        }
        return 'continue';
    }
    async function loadCmd(id) {
        if (privateMode) {
            output.write(chalk.yellow('/load disabled in private mode.\n'));
            return 'continue';
        }
        if (!id) {
            output.write(chalk.red('Usage: /load <id>\n'));
            return 'continue';
        }
        // Use findMatchingSessions (error-on-ambiguous) instead of
        // findSessionById (newest-match-wins). Silent newest-match on an
        // ambiguous prefix could load the wrong session under the user's
        // nose. Matches the CLI `hoody chat sessions show` contract.
        //
        // Sanitize user-supplied id before echoing — C0/DEL control chars could
        // otherwise set the terminal title or forge output. Cap matches list at
        // 10 for parity with the CLI side.
        const safeId = id.replace(/[\x00-\x1f\x7f]/g, '?');
        const matches = await findMatchingSessions(id);
        if (matches.length === 0) {
            output.write(chalk.red(`No session matches: ${safeId}\n`));
            return 'continue';
        }
        if (matches.length > 1) {
            output.write(chalk.red(`Ambiguous prefix ${safeId} — matches ${matches.length} sessions:\n`) +
                matches.slice(0, 10).map(m => `  ${m.id}  ${redactForDisk(m.title)}`).join('\n') + '\n' +
                (matches.length > 10 ? chalk.dim(`  ... and ${matches.length - 10} more\n`) : ''));
            return 'continue';
        }
        const match = matches[0];
        const session = await readSession(match.filePath);
        if (!session) {
            output.write(chalk.red(`Failed to read session ${id}.\n`));
            return 'continue';
        }
        adoptSession(session.filePath, session.meta);
        transcript.length = 0;
        for (const t of session.turns) {
            transcript.push({ role: t.role, content: t.content, ts: t.ts });
        }
        output.write(chalk.dim(`Loaded ${session.meta.id} — ${redactForDisk(session.meta.title)} (${session.turns.length} turns)\n`));
        return 'continue';
    }
    async function saveCmd() {
        if (privateMode) {
            output.write(chalk.yellow('/save is disabled in private mode. Exit and rerun without --private to persist.\n'));
            return 'continue';
        }
        if (persistenceDisabled) {
            output.write(chalk.yellow('/save is disabled — disk writes failed earlier this session.\n'));
            return 'continue';
        }
        if (sessionFilePath) {
            output.write(chalk.dim(`Session already persisted: ${sessionMeta?.id}\n`));
            return 'continue';
        }
        const first = transcript.find(t => t.role === 'user');
        if (!first) {
            output.write(chalk.dim('Nothing to save yet — no user turns.\n'));
            return 'continue';
        }
        try {
            const created = await saveEphemeralSession({
                firstUserMessage: first.content,
                model: SERVICE_MODEL_LABEL,
                tier: SERVICE_TIER_LABEL,
                turns: transcript,
            });
            sessionFilePath = created.filePath;
            sessionMeta = created.meta;
            // Turn persistence ON for the rest of the REPL. Without this the file is
            // a one-off snapshot: later turns are never appended, and a second /save
            // just reports "already persisted" while still dropping them.
            persistFromSave = true;
            output.write(chalk.dim(`Saved as ${created.meta.id} — ${created.meta.title}\n`));
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            output.write(chalk.red(`Failed to save session: ${msg}\n`));
        }
        return 'continue';
    }
    async function deleteCmd(id) {
        if (privateMode) {
            output.write(chalk.yellow('/delete disabled in private mode.\n'));
            return 'continue';
        }
        if (!id) {
            if (!sessionFilePath) {
                output.write(chalk.dim('Ephemeral session — nothing to delete. Starting fresh.\n'));
                transcript.length = 0;
                return 'continue';
            }
            if (!(await tryDeleteSession(sessionFilePath, `session ${sessionMeta?.id}`))) {
                return 'continue';
            }
            output.write(chalk.dim(`Deleted current session ${sessionMeta?.id}. Starting fresh.\n`));
            sessionFilePath = undefined;
            sessionMeta = undefined;
            transcript.length = 0;
            // A save-promoted session is gone; don't silently mint a new file.
            persistFromSave = false;
            return 'continue';
        }
        // Destructive op → refuse ambiguous prefixes.
        // Sanitize control chars in echoed id; cap match-list display at 10.
        const safeId = id.replace(/[\x00-\x1f\x7f]/g, '?');
        const matches = await findMatchingSessions(id);
        if (matches.length === 0) {
            output.write(chalk.red(`No session matches: ${safeId}\n`));
            return 'continue';
        }
        if (matches.length > 1) {
            output.write(chalk.red(`Ambiguous prefix ${safeId} — matches ${matches.length} sessions; refusing to delete:\n`) +
                matches.slice(0, 10).map(m => `  ${m.id}  ${redactForDisk(m.title)}`).join('\n') + '\n' +
                (matches.length > 10 ? chalk.dim(`  ... and ${matches.length - 10} more\n`) : ''));
            return 'continue';
        }
        const match = matches[0];
        if (!(await tryDeleteSession(match.filePath, match.id)))
            return 'continue';
        output.write(chalk.dim(`Deleted ${match.id}.\n`));
        if (match.filePath === sessionFilePath) {
            sessionFilePath = undefined;
            sessionMeta = undefined;
            transcript.length = 0;
            persistFromSave = false;
        }
        return 'continue';
    }
    async function wipeCmd(readConfirmation) {
        if (privateMode) {
            output.write(chalk.yellow('/wipe is disabled in private mode.\n'));
            return 'continue';
        }
        output.write(chalk.red('This will DELETE all persistent sessions.\n'));
        output.write(chalk.red('Type the word "yes" (lowercase) to confirm: '));
        const line = await readConfirmation();
        const confirmation = (line ?? '').trim();
        if (confirmation !== 'yes') {
            output.write(chalk.dim('Wipe cancelled.\n'));
            return 'continue';
        }
        const { deleted, failed } = await wipeAllSessions();
        output.write(chalk.dim(`Deleted ${deleted} session${deleted === 1 ? '' : 's'}.\n`));
        if (failed > 0) {
            process.stderr.write(chalk.red(`Failed to delete ${failed} session file${failed === 1 ? '' : 's'} — they are still on disk.\n`));
            lastTurnFailed = true;
        }
        // Only detach the current session if it is actually gone. Detaching a
        // survivor makes /delete report "ephemeral" for a file still on disk, and a
        // later /save mints a duplicate once permissions recover.
        if (failed === 0 || !sessionFilePath || !existsSync(sessionFilePath)) {
            sessionFilePath = undefined;
            sessionMeta = undefined;
            // Everything the user saved is gone; don't re-create a file behind them.
            persistFromSave = false;
        }
        return 'continue';
    }
    function privateCmd() {
        // `--private` / HOODY_CHAT_PRIVATE=1 are documented as process-scoped:
        // no disk access "from startup". A mid-session toggle must not be able to
        // downgrade that — otherwise `--private` followed by `/private` then
        // `/save` writes the transcript the flag promised never to write.
        // One-way. Turning privacy back OFF is not a safe operation: the turns
        // taken while it was on are still in the transcript, so a later /save or
        // /persist would write exactly the material the user hid. `--private` and
        // HOODY_CHAT_PRIVATE=1 are process-scoped and equally irreversible.
        if (privateMode) {
            output.write(chalk.yellow(opts.initialPrivate
                ? 'Private mode was set for this whole process (--private / HOODY_CHAT_PRIVATE=1) and cannot be turned off.\n'
                : 'Private mode is already on and cannot be turned off — turns taken while it was on would otherwise become writable. Restart `hoody chat` for a non-private session.\n'));
            return 'continue';
        }
        privateMode = true;
        output.write(chalk.dim(`Private mode ${privateMode ? chalk.green('ON') : chalk.yellow('OFF')}. ${privateMode ? 'No disk writes or reads.' : 'Disk writes/reads allowed.'}\n`));
        return 'continue';
    }
    // -------------------------------------------------------------------------
    // Session file helpers
    // -------------------------------------------------------------------------
    function shouldPersist() {
        return (opts.persist || persistFromSave) && !privateMode && !persistenceDisabled;
    }
    async function ensureSessionFile(firstUserMessage) {
        if (sessionFilePath)
            return;
        if (!shouldPersist())
            return;
        const created = await createSession({
            firstUserMessage,
            model: SERVICE_MODEL_LABEL,
            tier: SERVICE_TIER_LABEL,
        });
        sessionFilePath = created.filePath;
        sessionMeta = created.meta;
    }
    async function resolveResumeTarget(resume) {
        if (resume === undefined || resume === false)
            return null;
        if (resume === true) {
            // Latest session.
            const list = await listSessions();
            if (list.length === 0)
                return null;
            return await readSession(list[0].filePath);
        }
        // Specific id or prefix. Mirror loadCmd / deleteCmd: findMatchingSessions
        // refuses ambiguous prefixes instead of silently picking the newest
        // match, which is the wrong default for `--resume` (a surprise-context
        // answer beats any nominal UX win from auto-pick).
        const matches = await findMatchingSessions(resume);
        if (matches.length === 0)
            return null;
        if (matches.length > 1) {
            const preview = matches
                .slice(0, 5)
                .map(m => `  - ${m.id}`)
                .join('\n');
            throw new Error(`Ambiguous session id/prefix "${resume}" — ${matches.length} matches:\n${preview}${matches.length > 5 ? `\n  ... and ${matches.length - 5} more` : ''}\nProvide a longer prefix.`);
        }
        return await readSession(matches[0].filePath);
    }
    function cleanup() {
        if (isStdinTty)
            process.removeListener('SIGINT', onSigint);
        opts.sigintSignal?.removeEventListener('abort', onSigint);
        rl.close();
    }
}
/**
 * Minimal TTY spinner. Writes a braille-dot frame + " thinking…" label
 * every 80ms and clears the line on stop(). Idempotent stop().
 */
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
function startSpinner(out) {
    let i = 0;
    let stopped = false;
    const tick = () => {
        if (stopped)
            return;
        const frame = SPINNER_FRAMES[i++ % SPINNER_FRAMES.length];
        out.write(`\r${chalk.cyan(frame)} ${chalk.dim('thinking…')}`);
    };
    tick();
    const handle = setInterval(tick, 80);
    return {
        stop() {
            if (stopped)
                return;
            stopped = true;
            clearInterval(handle);
            // Clear the spinner line so downstream content starts fresh.
            out.write('\x1b[2K\r');
        },
    };
}
