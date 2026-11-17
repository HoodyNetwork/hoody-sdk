/**
 * `terminal.run(command, options?)`: run a command in the computer and wait for the result.
 *
 * Kept apart from terminal-exec.ts on purpose: this file is plain HTTP run+poll and uses no Node
 * builtin, so the browser bundle ships it as is. terminal-exec.ts (the `shell()` PTY stream) needs
 * `stream` and the Node TerminalClient, and the browser build stubs it.
 */
import { ApiError, isApiError, refuseRetiredOptions } from '../generated/errors.js';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Validate that the client is computer-scoped (has terminal urlTemplates).
 */
export function assertComputerScoped(client) {
    const t = client.urlTemplates?.['terminal'];
    if (!t) {
        throw new Error('terminal.run()/shell() require a computer-scoped client. Call withComputer() first.');
    }
    // Validate template completeness to give clear errors early
    if (!t.projectId || !t.computerId || !t.server) {
        throw new Error('Computer-scoped client has incomplete terminal URL templates (missing projectId, computerId, or server).');
    }
}
/**
 * Sleep with AbortSignal support. Rejects with AbortError if signal fires.
 *
 * setTimeout captures the resolve callback at bind time.
 * Reassigning the `resolve` variable afterward does nothing — the original
 * reference is still what setTimeout invokes. We wrap the timer callback
 * properly so that removeEventListener is always called on normal completion.
 */
function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
            return;
        }
        let onAbort;
        const timer = setTimeout(() => {
            // Timer fired normally — clean up abort listener before resolving
            if (onAbort && signal) {
                signal.removeEventListener('abort', onAbort);
            }
            resolve();
        }, ms);
        if (signal) {
            onAbort = () => {
                clearTimeout(timer);
                reject(new DOMException('The operation was aborted.', 'AbortError'));
            };
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
}
/**
 * What a terminal-kit refusal of the start request means for this call. The kit's own message
 * names the terminal by its id; this says what to change on the run() call.
 */
const TERMINAL_REFUSAL_HINTS = {
    PERSISTENT_SESSION: (index) => `terminal ${index} has a display and is not turned into an ephemeral session. `
        + 'Omit terminalId for a fresh ephemeral session',
    EPHEMERAL_SESSION: (index) => `terminal ${index} is an ephemeral session. Omit terminalId for a fresh one, `
        + `or delete it (terminal.sessions.delete('${index}')) and run again`,
    TERMINAL_ID_MISMATCH: (index) => `the request named another terminal than the terminal-${index} host. Use terminalId alone to pick the terminal`,
};
function explainTerminalRefusal(err, index) {
    if (!isApiError(err) || err.code === undefined)
        return err;
    if (!Object.prototype.hasOwnProperty.call(TERMINAL_REFUSAL_HINTS, err.code))
        return err;
    const hint = TERMINAL_REFUSAL_HINTS[err.code];
    return new ApiError({
        message: `terminal.run(): ${hint(index)} (${err.code}: ${err.message})`,
        status: err.status,
        code: err.code,
        ...(err.url !== undefined ? { url: err.url } : {}),
        ...(err.method !== undefined ? { method: err.method } : {}),
        ...(err.request !== undefined ? { request: err.request } : {}),
        response: err.response,
        cause: err,
    });
}
/** Maximum number of poll iterations before giving up (safety valve).
 * Adaptive backoff caps each wait at 500 ms after 2 s and at 1 s after 10 s,
 * so 2400 iterations wait roughly 40 minutes in total; the time each poll
 * request takes comes on top. */
const MAX_POLL_ITERATIONS = 2400;
/** POSIX single-quote an argument for `sh -c` (every character literal but `'`); a plain word stays as it is. */
export function shellQuote(arg) {
    if (/^[A-Za-z0-9_\-./=:@%+,]+$/.test(arg))
        return arg;
    return `'${arg.replace(/'/g, "'\\''")}'`;
}
/** Base64 to bytes with no Node builtin (this file ships in the browser bundle). */
function decodeBase64(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++)
        bytes[i] = bin.charCodeAt(i);
    return bytes;
}
/**
 * The default run (no terminalId) in the kit's raw mode. A PTY turns LF into
 * CRLF, merges stderr into stdout, strips escapes and whitespace and stops at a NUL byte; raw
 * mode runs `bash -c` as a process on pipes and returns the exact bytes. It answers once the
 * command has ended (wait=true; raw mode has no /result or /abort), so cancelling is closing
 * the request: the kit then stops the command's process group.
 */
async function runRaw(terminalApi, command, o, templateVars) {
    const startTime = Date.now();
    // Raw mode always starts bash (or /bin/sh); another shell is started from there.
    const cmd = o.shell && o.shell !== 'bash' ? `exec ${shellQuote(o.shell)} -c ${shellQuote(command)}` : command;
    // The answer comes at the command's timeout at the latest (the given one, else the kit's
    // default of 600 s) plus the kit's SIGTERM-to-SIGKILL grace: the request must outlast it
    // rather than end at the client's default request timeout while the command runs on.
    const timeoutMs = ((o.timeout || 600) + 30) * 1000;
    let response;
    try {
        response = await terminalApi.commands.run({
            command: cmd,
            mode: 'raw',
            wait: true,
            timeout: o.timeout || undefined,
            cwd: o.cwd || undefined,
            env: o.env || undefined,
        }, { terminal_id: '0', user: o.user || undefined, signal: o.signal, timeoutMs }, templateVars);
    }
    catch (err) {
        if (o.signal?.aborted)
            throw new DOMException('The operation was aborted.', 'AbortError');
        throw explainTerminalRefusal(err, 0);
    }
    const data = response?.data ?? response;
    if (typeof data?.stdout_b64 !== 'string' || typeof data.stderr_b64 !== 'string') {
        throw new Error('terminal.run(): the computer\'s terminal kit did not return the command\'s exact output; update the terminal kit in the computer');
    }
    const stdoutBytes = decodeBase64(data.stdout_b64);
    const stderrBytes = decodeBase64(data.stderr_b64);
    const text = new TextDecoder();
    const result = {
        stdout: text.decode(stdoutBytes),
        stderr: text.decode(stderrBytes),
        stdoutBytes,
        stderrBytes,
        stdoutTruncated: data.stdout_truncated === true,
        stderrTruncated: data.stderr_truncated === true,
        signal: typeof data.signal === 'string' ? data.signal : null,
        exitCode: typeof data.exit_code === 'number' ? data.exit_code : null,
        timedOut: data.timed_out === true || data.status === 'timed_out',
        duration: Date.now() - startTime,
        commandId: typeof data.command_id === 'string' ? data.command_id : '',
    };
    // Cut output must not pass for a complete run (exit 0 with half a file): like Node's exec()
    // past maxBuffer, reject, with what was read and the command's own status on the error.
    if (result.stdoutTruncated || result.stderrTruncated) {
        const cut = [result.stdoutTruncated ? 'stdout' : '', result.stderrTruncated ? 'stderr' : ''].filter(Boolean).join(' and ');
        throw Object.assign(new Error(`terminal.run(): ${cut} passed the terminal kit's capture limit; the output is incomplete (error.result holds it)`), { code: 'OUTPUT_TRUNCATED', result });
    }
    return result;
}
// ---------------------------------------------------------------------------
// exec() implementation
// ---------------------------------------------------------------------------
async function execImpl(command, options) {
    assertComputerScoped(this);
    refuseRetiredOptions(options, 'terminal.run', [['serviceIndex', 'terminalId'], ['terminal_id', 'terminalId']]);
    const { cwd, shell: shellType, user, timeout = 0, env, signal, pollIntervalMs: userPollInterval = 250, terminalId: serviceIndex = 0, } = options || {};
    const pollInterval = Math.max(100, userPollInterval);
    // Check if already aborted
    if (signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
    }
    // Access the terminal execution service.
    // In the generated client, kit namespaces (terminal, exec, files, etc.)
    // are top-level properties, not nested under `api`.
    const terminalApi = this.terminal ?? this.api?.terminal;
    if (!terminalApi?.commands) {
        throw new Error('Terminal commands service not available');
    }
    // tmux swallows the completion marker, so a run inside it never ends and leaks a tmux session.
    if (shellType === 'tmux') {
        throw new TypeError("terminal.run(): shell 'tmux' is not supported for a one-shot command; run tmux itself, for example terminal.run(\"tmux new -d -s work 'make build'\")");
    }
    if (!Number.isInteger(serviceIndex) || serviceIndex < 0 || serviceIndex > 65535) {
        throw new TypeError(`terminal.run(): terminalId must be an integer from 0 to 65535, got ${JSON.stringify(serviceIndex)}`);
    }
    // The host picks the terminal: the computers proxy sets terminal_id from its index.
    // terminal-0 (the default) runs the command in raw mode, with no terminal session; on
    // terminal-N the command runs in terminal N as a plain execute. ephemeral=true there
    // would ask the kit to turn terminal N ephemeral (refused when it has a display).
    // The default urlTemplates set serviceIndex=1 (for interactive terminals), so the
    // index is always passed.
    const templateVars = { serviceIndex };
    if (serviceIndex === 0) {
        return runRaw(terminalApi, command, options ?? {}, templateVars);
    }
    const sessionQuery = { terminal_id: String(serviceIndex) };
    // Remote cancellation: POST /api/v1/terminal/execute/{command_id}/abort
    // (`terminal.commands.cancel`) on the SAME terminal host the command runs on
    // (templateVars keeps the execution service index). It is sent without the
    // caller's signal — that signal is already aborted, and passing it would
    // cancel the cancellation.
    //
    // Race: the abort can fire before the start request has returned the
    // command id. The start request is therefore NOT tied to the signal (it is
    // short: wait:false); an abort that arrives first rejects the caller at
    // once and sends the remote abort as soon as the id is known.
    const extractCommandId = (response) => {
        const responseData = response?.data ?? response;
        return typeof responseData?.command_id === 'string'
            ? responseData.command_id
            : typeof responseData?.id === 'string'
                ? responseData.id
                : undefined;
    };
    let commandIdForAbort;
    let startPromise;
    let remoteAbortSent = false;
    const sendRemoteAbort = (id) => {
        if (remoteAbortSent)
            return;
        remoteAbortSent = true;
        try {
            // Typed on purpose: a rename of the generated `cancel` fails the typecheck.
            const typedTerminal = terminalApi;
            Promise.resolve(typedTerminal.commands.cancel(id, undefined, templateVars)).catch(() => { });
        }
        catch {
            // best-effort
        }
    };
    let abortCleanup;
    let rejectOnAbort;
    if (signal) {
        const onAbort = () => {
            if (commandIdForAbort) {
                sendRemoteAbort(commandIdForAbort);
            }
            else if (startPromise) {
                startPromise.then((response) => {
                    const id = extractCommandId(response);
                    if (id)
                        sendRemoteAbort(id);
                }, () => { });
            }
            rejectOnAbort?.(new DOMException('The operation was aborted.', 'AbortError'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        abortCleanup = () => signal.removeEventListener('abort', onAbort);
    }
    try {
        // 1. Fire command (wait: false — we poll ourselves)
        const startTime = Date.now();
        const start = terminalApi.commands.run({
            command,
            timeout: timeout || undefined,
            wait: false,
            cwd: cwd || undefined,
            env: env || undefined,
        }, {
            ...sessionQuery,
            shell: shellType || undefined,
            user: user || undefined,
        }, templateVars);
        startPromise = start;
        const started = start.catch((err) => { throw explainTerminalRefusal(err, serviceIndex); });
        const executeResponse = signal
            ? await Promise.race([
                started,
                new Promise((_, reject) => { rejectOnAbort = reject; }),
            ])
            : await started;
        rejectOnAbort = undefined;
        // Runtime guard: extract command_id from response
        const commandId = extractCommandId(executeResponse);
        if (!commandId) {
            throw new Error('terminal.commands.run did not return a command_id. Response: ' +
                JSON.stringify(executeResponse));
        }
        commandIdForAbort = commandId;
        // An abort that landed between the start response and here.
        if (signal?.aborted) {
            sendRemoteAbort(commandId);
            throw new DOMException('The operation was aborted.', 'AbortError');
        }
        // 2. Adaptive polling loop
        // Grace period measured from AFTER executeCommand
        // returns, not from startTime which includes the HTTP request latency.
        const pollStartTime = Date.now();
        const GRACE_PERIOD_MS = 2000; // tolerate 404 for first 2 seconds of polling
        let currentInterval = pollInterval;
        let iterations = 0;
        while (true) {
            iterations++;
            // Safety valve: prevent infinite polling on unknown statuses
            // (roughly 40 minutes of waits plus request time, see MAX_POLL_ITERATIONS).
            if (iterations > MAX_POLL_ITERATIONS) {
                throw new Error(`terminal.run() exceeded maximum poll iterations (${MAX_POLL_ITERATIONS}). ` +
                    `Command "${commandId}" may still be running on the server.`);
            }
            await sleep(currentInterval, signal);
            const elapsed = Date.now() - startTime;
            const pollElapsed = Date.now() - pollStartTime;
            // Adaptive backoff
            if (elapsed > 10_000) {
                currentInterval = Math.min(1000, pollInterval * 4);
            }
            else if (elapsed > 2_000) {
                currentInterval = Math.min(500, pollInterval * 2);
            }
            let pollResponse;
            try {
                pollResponse = await terminalApi.commands.get(commandId, templateVars, { signal });
            }
            catch (err) {
                // Status code checks only: a message substring could match by
                // accident.
                const is404 = err?.statusCode === 404 ||
                    err?.status === 404;
                if (is404 && pollElapsed < GRACE_PERIOD_MS) {
                    continue;
                }
                throw err;
            }
            const data = pollResponse?.data ?? pollResponse;
            // Runtime guards on response fields
            const status = typeof data?.status === 'string' ? data.status : '';
            const stdout = typeof data?.stdout === 'string' ? data.stdout : '';
            const stderr = typeof data?.stderr === 'string' ? data.stderr : '';
            const exitCode = typeof data?.exit_code === 'number' ? data.exit_code : null;
            const timedOut = data?.timed_out === true || status === 'timed_out';
            // Terminal status handling
            if (status === 'completed' || status === 'failed' || status === 'timed_out') {
                return {
                    stdout,
                    stderr,
                    exitCode,
                    timedOut,
                    duration: Date.now() - startTime,
                    commandId,
                };
            }
            // Known in-progress statuses: keep polling
            // Do NOT accept an empty string: a missing `status` field (coerced
            // to '') likely means a malformed response, which is treated as
            // terminal rather than polled until the safety valve.
            if (status === 'running' || status === 'pending') {
                continue;
            }
            // Unknown terminal status — treat as terminal to avoid infinite loop
            return {
                stdout,
                stderr,
                exitCode,
                timedOut,
                duration: Date.now() - startTime,
                commandId,
            };
        }
    }
    finally {
        abortCleanup?.();
    }
}
/**
 * Install `client.terminal.run` on this client's terminal namespace object. The object is
 * per instance (withComputer and withRealm build their own), so this runs for each client
 * from patchHoodyClientMetrics. Idempotent.
 */
export function installTerminalRun(client) {
    const terminal = client.terminal;
    if (!terminal || Object.prototype.hasOwnProperty.call(terminal, 'run'))
        return;
    Object.defineProperty(terminal, 'run', {
        value: (command, options) => execImpl.call(client, command, options),
        enumerable: false,
        configurable: true,
        writable: true,
    });
}
