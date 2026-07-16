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
 *   - MAX_TOOL_CALLS_PER_TURN=1 still enforced via dispatchTurn.
 *   - `/private` toggles disk-write + disk-read disable for rest of REPL.
 *   - `/tool on|off` mutates tool-enabled state for subsequent turns.
 */

import chalk from 'chalk';
import readline from 'node:readline';
import type { Msg } from '../ai/types.js';
import type { ProviderConfig } from '../ai/provider-resolve.js';
import { buildSystemPrompt } from './system-prompt.js';
import { createRenderer } from './markdown-renderer.js';
import {
  executeDocsSearch,
  type DocsSearchResult,
} from './docs-search-tool.js';
import { dispatchTurn } from './tool-dispatch.js';
import { detectTrigger, escapeXmlLike } from './trigger-parse.js';
import { docsLimiter, triggerDedupe } from './docs-singletons.js';
import {
  createSession,
  appendTurn,
  listSessions,
  findMatchingSessions,
  deleteSession as deleteSessionFile,
  wipeAllSessions,
  truncateSessionTurns,
  readSession,
  saveEphemeralSession,
  type SessionMeta,
  type SessionTurn,
} from './sessions.js';
import { showBannerIfNeeded } from './first-run-banner.js';
import { redactForDisk } from './redact.js';

export interface ReplOptions {
  provider: ProviderConfig;
  model: string;
  maxTokens: number;
  temperature: number;
  initialToolsEnabled: boolean;
  initialPrivate: boolean;
  persist: boolean;
  resume: string | boolean | undefined; // undefined | true (latest) | '<id>'
  acceptEndpointFlag: string | undefined;
  acceptEndpointEnv: string | undefined;
  contextPreface: string | undefined; // --context, applied to first turn only
  /** For tests. */
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  /** For tests: feed the SIGINT signal via this controller. */
  sigintSignal?: AbortSignal;
}

type ReplState = 'idle' | 'inflight' | 'confirm-exit';

export async function runRepl(opts: ReplOptions): Promise<void> {
  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;
  const isTty = (output as NodeJS.WriteStream).isTTY === true;
  const isStdinTty = (input as NodeJS.ReadStream).isTTY === true;
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
  let toolsEnabled = opts.initialToolsEnabled;
  let privateMode = opts.initialPrivate;
  // In-memory session state (ephemeral unless --persist is on).
  let sessionFilePath: string | undefined;
  let sessionMeta: SessionMeta | undefined;
  // Set to true once a persistence write has failed — we warn once, then
  // silently keep the REPL running in-memory-only. Prevents disk-full or
  // readonly-mount from turning the REPL into a one-shot-crash.
  let persistenceDisabled = false;
  const disablePersistenceOnError = (err: unknown, action: string) => {
    if (persistenceDisabled) return;
    persistenceDisabled = true;
    const msg = err instanceof Error ? err.message : String(err);
    output.write(
      chalk.yellow(
        `\n[hoody chat] Persistence ${action} failed (${msg}). Continuing in-memory only — disk writes disabled for this REPL.\n`,
      ),
    );
  };
  const transcript: Array<Omit<SessionTurn, 'type'>> = [];
  // docsLimiter + triggerDedupe are process-wide singletons from
  // ./docs-singletons.js so runChat + runRepl share ONE rate bucket and ONE
  // dedupe cache per process.
  let state: ReplState = 'idle';
  let currentAbort: AbortController | undefined;

  // --context applied on first user message only.
  let pendingContext = opts.contextPreface;

  // Resume persistent session if requested.
  if (opts.persist && opts.resume !== undefined && !privateMode) {
    const resumed = await resolveResumeTarget(opts.resume);
    if (resumed) {
      sessionFilePath = resumed.filePath;
      sessionMeta = resumed.meta;
      for (const t of resumed.turns) {
        transcript.push({ role: t.role, content: t.content, ts: t.ts });
      }
      output.write(
        chalk.dim(`Resumed session ${resumed.meta.id} — ${redactForDisk(resumed.meta.title)}\n`),
      );
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
    process.on('SIGINT', onSigint);
  }
  if (opts.sigintSignal) {
    opts.sigintSignal.addEventListener('abort', onSigint);
  }

  // Multi-line input state.
  let buffered = '';
  let fenced = false;
  // Confirmation prompts pull lines via the readConfirmation callback
  // passed into handleSlash — no shared state needed.

  // Explicit async line queue. Decoupling line arrival from line
  // consumption lets handlers pull lines on demand (e.g., a destructive
  // confirmation pulls the next line directly) while still serializing
  // normal message processing.
  type QueuedLine = { line: string; bypassSlash: boolean };
  const lineQueue: QueuedLine[] = [];
  let queueResolvers: Array<(v: QueuedLine | null) => void> = [];
  let closed = false;

  // /retry replays a previously-sent user message verbatim. If that message
  // was a fenced-block that happened to start with `/`, routing it back
  // through the slash dispatcher would execute an unintended command
  // (e.g. /load, /delete). enqueueLine(line, true) flags the replayed line
  // to bypass slash dispatch in the main loop.
  const enqueueLine = (line: string, bypassSlash = false) => {
    const item: QueuedLine = { line, bypassSlash };
    if (queueResolvers.length > 0) {
      const r = queueResolvers.shift()!;
      r(item);
    } else {
      lineQueue.push(item);
    }
  };
  const nextLine = (): Promise<QueuedLine | null> => {
    if (lineQueue.length > 0) return Promise.resolve(lineQueue.shift()!);
    if (closed) return Promise.resolve(null);
    return new Promise<QueuedLine | null>(resolve => {
      queueResolvers.push(resolve);
    });
  };

  rl.on('line', (l: string) => enqueueLine(l));
  rl.once('close', () => {
    closed = true;
    // Unblock any waiters with null → loop exits.
    for (const r of queueResolvers) r(null);
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
  const readConfirmation = async (): Promise<string | null> => {
    const item = await nextLine();
    return item === null ? null : item.line;
  };

  // Initial prompt.
  rl.prompt();

  // Main consume loop.
  while (true) {
    const queued = await nextLine();
    if (queued === null) break;
    const line = queued.line;
    const bypassSlash = queued.bypassSlash;

    // Any normal input clears pending confirm-exit — user kept typing, so
    // they are no longer trying to exit via double-Ctrl-C.
    // Cast: TS narrows `state` to its init value across closure boundaries
    // and can't see the SIGINT handler mutating it to 'confirm-exit'.
    if ((state as ReplState) === 'confirm-exit') state = 'idle';

    // Multi-line fence: """ toggles.
    if (line.trim() === '"""') {
      if (!fenced) { fenced = true; rl.prompt(); continue; }
      fenced = false;
      const full = buffered;
      buffered = '';
      if (!full.trim()) { rl.prompt(); continue; }
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
    if (!msg.trim()) { rl.prompt(); continue; }

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

  return cleanup();

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  async function handleMessage(userMsg: string): Promise<void> {
    state = 'inflight';
    currentAbort = new AbortController();

    // Persist this user turn (if applicable) — AFTER redaction downstream.
    const ts = new Date().toISOString();
    transcript.push({ role: 'user', content: userMsg, ts });

    if (shouldPersist()) {
      try {
        await ensureSessionFile(userMsg);
        if (sessionFilePath) {
          await appendTurn(sessionFilePath, { role: 'user', content: userMsg, ts });
        }
      } catch (err) {
        disablePersistenceOnError(err, 'user-turn write');
      }
    }

    // @hoody.com trigger pre-fetch — same logic as run.ts one-shot path.
    let docsPrefetch: DocsSearchResult | undefined;
    let prefetchedQuery = '';
    if (toolsEnabled) {
      const trig = detectTrigger({ userMessage: userMsg });
      if (trig.hit && trig.query.length >= 8) {
        prefetchedQuery = trig.query;
        const cached = triggerDedupe.get(prefetchedQuery);
        if (cached) docsPrefetch = cached;
        else {
          if (isTty) output.write(chalk.dim('[hoody chat] searching docs…\r'));
          docsPrefetch = await executeDocsSearch({
            query: prefetchedQuery,
            limiter: docsLimiter,
            acceptEndpointFlag: opts.acceptEndpointFlag,
            acceptEndpointEnv: opts.acceptEndpointEnv,
            isTty: isInteractive,
            sessionOnly: privateMode,
            // SIGINT during the pre-fetch cancels immediately rather than
            // waiting for the 30s docs timeout.
            signal: currentAbort?.signal,
          });
          if (isTty) output.write('\x1b[2K\r');
          triggerDedupe.set(prefetchedQuery, docsPrefetch);
        }
      }
    }

    // Build system prompt with per-turn retrieval.
    const { systemPrompt, retrievalText } = buildSystemPrompt({ userMessage: userMsg });
    const retrievalBlock = retrievalText
      ? `<retrieved-context source="cli-reference">\n${retrievalText}\n</retrieved-context>\n\n`
      : '';
    const ctxBlock = pendingContext
      ? `<user-context untrusted="true">\n${escapeXmlLike(pendingContext.slice(0, 1000))}\n</user-context>\n\n`
      : '';
    pendingContext = undefined; // applied only once
    const docsBlock = docsPrefetch
      ? `<hoody-docs-result untrusted="true" source="https://docs.hoody.com" query=${JSON.stringify(prefetchedQuery)}>\n${
          'error' in docsPrefetch
            ? `<error code="${docsPrefetch.error}">${escapeXmlLike(docsPrefetch.message)}</error>`
            : escapeXmlLike(docsPrefetch.text)
        }\n</hoody-docs-result>\n\n`
      : '';

    // Replay transcript as message history — capped at HOODY_CHAT_MAX_HISTORY.
    // Parse carefully so an explicit `0` (disable memory) is honored rather
    // than falling through to the default 10.
    const rawHistoryEnv = process.env.HOODY_CHAT_MAX_HISTORY;
    const parsedHistory = rawHistoryEnv !== undefined && /^\d+$/.test(rawHistoryEnv)
      ? Number(rawHistoryEnv)
      : undefined;
    const historyCap = parsedHistory !== undefined ? parsedHistory : 10;
    const historyTurns = transcript.slice(-historyCap * 2 - 1); // pairs + current
    const llmMessages: Msg[] = [{ role: 'system', content: systemPrompt }];
    for (let i = 0; i < historyTurns.length - 1; i++) {
      const t = historyTurns[i]!;
      llmMessages.push({ role: t.role, content: t.content });
    }
    llmMessages.push({
      role: 'user',
      content: `${retrievalBlock}${docsBlock}${ctxBlock}${userMsg}`,
    });

    const renderer = createRenderer({ out: output });
    let assistantText = '';
    let turnFailed = false;
    // Spinner: braille-dots rotation + "thinking…" label, shown only on a
    // real TTY so piped output stays clean. Auto-clears on the first stream
    // byte (model started answering) and on turn end / abort / error. The
    // line is cleared with `\x1b[2K\r` before writing the real answer so
    // there's no leftover spinner residue.
    const spinner = isInteractive ? startSpinner(output) : null;
    try {
      await dispatchTurn({
        url: opts.provider.url,
        key: opts.provider.key,
        model: opts.model,
        messages: llmMessages,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        onDelta: chunk => {
          if (spinner) spinner.stop();
          assistantText += chunk;
          renderer.write(chunk);
        },
        toolsEnabled,
        limiter: docsLimiter,
        acceptEndpointFlag: opts.acceptEndpointFlag,
        acceptEndpointEnv: opts.acceptEndpointEnv,
        isTty: isInteractive,
        sessionOnly: privateMode,
        // Thread the per-turn abort signal through so SIGINT cancels the
        // in-flight LLM fetch and any docs-tool fetch.
        signal: currentAbort.signal,
      });
    } catch (err) {
      turnFailed = true;
      const msg = err instanceof Error ? err.message : String(err);
      output.write('\n' + chalk.red(`Error: ${msg}`) + '\n');
    } finally {
      if (spinner) spinner.stop();
    }
    renderer.end();

    // Record assistant turn + persist, but ONLY if the turn completed cleanly
    // and we have content. An aborted (Ctrl-C) or network-errored turn would
    // otherwise leave a partial/empty assistant message in the transcript
    // and on disk.
    const aborted = currentAbort?.signal.aborted === true;
    if (!turnFailed && !aborted && assistantText.length > 0) {
      const tsA = new Date().toISOString();
      transcript.push({ role: 'assistant', content: assistantText, ts: tsA });
      if (shouldPersist() && sessionFilePath) {
        try {
          await appendTurn(sessionFilePath, { role: 'assistant', content: assistantText, ts: tsA });
        } catch (err) {
          disablePersistenceOnError(err, 'assistant-turn write');
        }
      }
    }

    currentAbort = undefined;
    state = 'idle';
  }

  async function handleSlash(
    raw: string,
    readConfirmation: () => Promise<string | null>,
  ): Promise<'continue' | 'exit'> {
    const [cmd, ...restTokens] = raw.slice(1).split(/\s+/);
    const rest = restTokens.join(' ').trim();
    switch (cmd) {
      case 'help': return helpCmd();
      case 'exit':
      case 'quit':
        return 'exit';
      case 'clear':
        if (isTty) output.write('\x1b[2J\x1b[H');
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
      case 'tool':
        return toolCmd(rest);
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
  async function retryCmd(): Promise<'continue'> {
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
      if (transcript[i]!.role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) {
      output.write(chalk.dim('Nothing to retry — no user turn in transcript.\n'));
      return 'continue';
    }
    const lastUserMsg = transcript[lastUserIdx]!.content;
    // Drop the user turn AND everything after (assistant reply, other
    // trailing turns). handleMessage will write a fresh user turn + reply.
    transcript.length = lastUserIdx;
    // Mirror the truncation on disk if this session is persisted, so
    // --resume doesn't resurrect the dropped assistant reply later.
    if (shouldPersist() && sessionFilePath) {
      try {
        await truncateSessionTurns(sessionFilePath, lastUserIdx);
      } catch (err) {
        disablePersistenceOnError(err, 'retry truncate');
      }
    }
    // Restore the `--context` preface when /retry drops the FIRST user
    // turn (the one handleMessage originally consumed pendingContext on).
    // Without this, `hoody chat --context "pretend you are an expert" ...`
    // loses the expert persona on the retry. Subsequent retries preserve
    // context via earlier transcript turns already in conversation history,
    // so we only re-seed when the transcript is now empty.
    if (transcript.length === 0 && opts.contextPreface && !pendingContext) {
      pendingContext = opts.contextPreface;
    }
    output.write(chalk.dim('Retrying last message…\n'));
    // A fenced-block message whose first char is '/' must not re-enter the
    // slash dispatcher when replayed.
    const bypassSlash = true;
    enqueueLine(lastUserMsg, bypassSlash);
    return 'continue';
  }

  function helpCmd(): 'continue' {
    const rows: Array<[string, string]> = [
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
      ['/tool on|off', `Toggle hoody_docs_search (currently: ${toolsEnabled ? 'ON' : 'OFF'})`],
      ['/retry', 'Drop the last assistant reply and re-send the last user message'],
    ];
    for (const [name, desc] of rows) {
      output.write(`  ${chalk.cyan(name.padEnd(18))} ${desc}\n`);
    }
    return 'continue';
  }

  function newCmd(): 'continue' {
    transcript.length = 0;
    sessionFilePath = undefined;
    sessionMeta = undefined;
    pendingContext = undefined;
    output.write(chalk.dim('New session.\n'));
    return 'continue';
  }

  function historyCmd(): 'continue' {
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

  async function sessionsCmd(): Promise<'continue'> {
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
      output.write(
        `  ${chalk.cyan(s.id)}  ${chalk.dim(s.updatedAt)}  ${s.turnCount} turn${s.turnCount === 1 ? '' : 's'}  ${redactForDisk(s.title)}\n`,
      );
    }
    return 'continue';
  }

  async function loadCmd(id: string): Promise<'continue'> {
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
      output.write(
        chalk.red(`Ambiguous prefix ${safeId} — matches ${matches.length} sessions:\n`) +
        matches.slice(0, 10).map(m => `  ${m.id}  ${redactForDisk(m.title)}`).join('\n') + '\n' +
        (matches.length > 10 ? chalk.dim(`  ... and ${matches.length - 10} more\n`) : ''),
      );
      return 'continue';
    }
    const match = matches[0]!;
    const session = await readSession(match.filePath);
    if (!session) {
      output.write(chalk.red(`Failed to read session ${id}.\n`));
      return 'continue';
    }
    sessionFilePath = session.filePath;
    sessionMeta = session.meta;
    transcript.length = 0;
    for (const t of session.turns) {
      transcript.push({ role: t.role, content: t.content, ts: t.ts });
    }
    output.write(chalk.dim(`Loaded ${session.meta.id} — ${redactForDisk(session.meta.title)} (${session.turns.length} turns)\n`));
    return 'continue';
  }

  async function saveCmd(): Promise<'continue'> {
    if (privateMode) {
      output.write(
        chalk.yellow('/save is disabled in private mode. Exit and rerun without --private to persist.\n'),
      );
      return 'continue';
    }
    if (persistenceDisabled) {
      output.write(
        chalk.yellow('/save is disabled — disk writes failed earlier this session.\n'),
      );
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
        model: opts.model,
        tier: opts.provider.tier,
        turns: transcript,
      });
      sessionFilePath = created.filePath;
      sessionMeta = created.meta;
      output.write(chalk.dim(`Saved as ${created.meta.id} — ${created.meta.title}\n`));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      output.write(chalk.red(`Failed to save session: ${msg}\n`));
    }
    return 'continue';
  }

  async function deleteCmd(id: string): Promise<'continue'> {
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
      await deleteSessionFile(sessionFilePath);
      output.write(chalk.dim(`Deleted current session ${sessionMeta?.id}. Starting fresh.\n`));
      sessionFilePath = undefined;
      sessionMeta = undefined;
      transcript.length = 0;
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
      output.write(
        chalk.red(`Ambiguous prefix ${safeId} — matches ${matches.length} sessions; refusing to delete:\n`) +
        matches.slice(0, 10).map(m => `  ${m.id}  ${redactForDisk(m.title)}`).join('\n') + '\n' +
        (matches.length > 10 ? chalk.dim(`  ... and ${matches.length - 10} more\n`) : ''),
      );
      return 'continue';
    }
    const match = matches[0]!;
    await deleteSessionFile(match.filePath);
    output.write(chalk.dim(`Deleted ${match.id}.\n`));
    if (match.filePath === sessionFilePath) {
      sessionFilePath = undefined;
      sessionMeta = undefined;
      transcript.length = 0;
    }
    return 'continue';
  }

  async function wipeCmd(
    readConfirmation: () => Promise<string | null>,
  ): Promise<'continue'> {
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
    const count = await wipeAllSessions();
    output.write(chalk.dim(`Deleted ${count} session${count === 1 ? '' : 's'}.\n`));
    sessionFilePath = undefined;
    sessionMeta = undefined;
    return 'continue';
  }

  function privateCmd(): 'continue' {
    privateMode = !privateMode;
    // Docs-search results are keyed by query text only; keeping a refusal
    // cached across a private-mode toggle would replay the wrong accept-mode
    // on the next identical query. Cheap to rebuild — just clear.
    triggerDedupe.clear();
    output.write(
      chalk.dim(
        `Private mode ${privateMode ? chalk.green('ON') : chalk.yellow('OFF')}. ${
          privateMode ? 'No disk writes or reads.' : 'Disk writes/reads allowed.'
        }\n`,
      ),
    );
    return 'continue';
  }

  function toolCmd(arg: string): 'continue' {
    const a = arg.toLowerCase();
    if (a === 'on') {
      toolsEnabled = true;
      output.write(chalk.dim('hoody_docs_search tool: ON.\n'));
    } else if (a === 'off') {
      toolsEnabled = false;
      output.write(chalk.dim('hoody_docs_search tool: OFF.\n'));
    } else {
      output.write(
        chalk.dim(`Usage: /tool on|off (currently: ${toolsEnabled ? 'ON' : 'OFF'})\n`),
      );
    }
    return 'continue';
  }

  // -------------------------------------------------------------------------
  // Session file helpers
  // -------------------------------------------------------------------------

  function shouldPersist(): boolean {
    return opts.persist && !privateMode && !persistenceDisabled;
  }

  async function ensureSessionFile(firstUserMessage: string): Promise<void> {
    if (sessionFilePath) return;
    if (!shouldPersist()) return;
    const created = await createSession({
      firstUserMessage,
      model: opts.model,
      tier: opts.provider.tier,
    });
    sessionFilePath = created.filePath;
    sessionMeta = created.meta;
  }

  async function resolveResumeTarget(
    resume: string | boolean | undefined,
  ): Promise<{ meta: SessionMeta; turns: SessionTurn[]; filePath: string } | null> {
    if (resume === undefined || resume === false) return null;
    if (resume === true) {
      // Latest session.
      const list = await listSessions();
      if (list.length === 0) return null;
      return await readSession(list[0]!.filePath);
    }
    // Specific id or prefix. Mirror loadCmd / deleteCmd: findMatchingSessions
    // refuses ambiguous prefixes instead of silently picking the newest
    // match, which is the wrong default for `--resume` (a surprise-context
    // answer beats any nominal UX win from auto-pick).
    const matches = await findMatchingSessions(resume);
    if (matches.length === 0) return null;
    if (matches.length > 1) {
      const preview = matches
        .slice(0, 5)
        .map(m => `  - ${m.id}`)
        .join('\n');
      throw new Error(
        `Ambiguous session id/prefix "${resume}" — ${matches.length} matches:\n${preview}${matches.length > 5 ? `\n  ... and ${matches.length - 5} more` : ''}\nProvide a longer prefix.`,
      );
    }
    return await readSession(matches[0]!.filePath);
  }

  function cleanup(): void {
    if (isStdinTty) process.removeListener('SIGINT', onSigint);
    opts.sigintSignal?.removeEventListener('abort', onSigint);
    rl.close();
  }
}

/**
 * Minimal TTY spinner. Writes a braille-dot frame + " thinking…" label
 * every 80ms and clears the line on stop(). Idempotent stop().
 */
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
function startSpinner(out: NodeJS.WritableStream): { stop(): void } {
  let i = 0;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const frame = SPINNER_FRAMES[i++ % SPINNER_FRAMES.length];
    out.write(`\r${chalk.cyan(frame)} ${chalk.dim('thinking…')}`);
  };
  tick();
  const handle = setInterval(tick, 80);
  return {
    stop(): void {
      if (stopped) return;
      stopped = true;
      clearInterval(handle);
      // Clear the spinner line so downstream content starts fresh.
      out.write('\x1b[2K\r');
    },
  };
}

