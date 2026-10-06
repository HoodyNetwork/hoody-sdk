/**
 * `terminal.run(command, options?)`: run a command in the container and wait for the result.
 *
 * Kept apart from terminal-exec.ts on purpose: this file is plain HTTP run+poll and uses no Node
 * builtin, so the browser bundle ships it as is. terminal-exec.ts (the `shell()` PTY stream) needs
 * `stream` and the Node TerminalClient, and the browser build stubs it.
 */

import type { HoodyClient } from './hoody-client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TerminalExecOptions {
  /** Working directory for command execution */
  cwd?: string;
  /** Shell to use (bash, zsh, fish, sh) */
  shell?: string;
  /** System user to run as */
  user?: string;
  /** Timeout in seconds (default: 0 = no timeout) */
  timeout?: number;
  /** Environment variables */
  env?: Record<string, string>;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Polling interval in ms (default: 250, min: 100) */
  pollIntervalMs?: number;
  /** Terminal service instance index (default: 0 — ephemeral PTY uses terminal-0) */
  serviceIndex?: number;
}

export interface TerminalExecResult {
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Process exit code (null if unknown) */
  exitCode: number | null;
  /** Whether the command timed out */
  timedOut: boolean;
  /** Execution duration in milliseconds
   */
  duration: number;
  /** Server-assigned command ID */
  commandId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validate that the client is container-scoped (has terminal urlTemplates).
 */
export function assertContainerScoped(client: any): void {
  const t = client.urlTemplates?.['terminal'];
  if (!t) {
    throw new Error(
      'terminal.run()/shell() require a container-scoped client. Call withContainer() first.',
    );
  }
  // Validate template completeness to give clear errors early
  if (!t.projectId || !t.containerId || !t.server) {
    throw new Error(
      'Container-scoped client has incomplete terminal URL templates (missing projectId, containerId, or server).',
    );
  }
}

/**

/**
 * Sleep with AbortSignal support. Rejects with AbortError if signal fires.
 *
 * FIX: setTimeout captures the resolve callback at bind time.
 * Reassigning the `resolve` variable afterward does nothing — the original
 * reference is still what setTimeout invokes. We wrap the timer callback
 * properly so that removeEventListener is always called on normal completion.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }

    let onAbort: (() => void) | undefined;

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

/** Maximum number of poll iterations before giving up (safety valve).
 * With adaptive backoff (250ms → 500ms → 1000ms), 2400 iterations
 * allows approximately 30-40 minutes of polling. */
const MAX_POLL_ITERATIONS = 2400;

// ---------------------------------------------------------------------------
// exec() implementation
// ---------------------------------------------------------------------------

async function execImpl(
  this: HoodyClient,
  command: string,
  options?: TerminalExecOptions,
): Promise<TerminalExecResult> {
  assertContainerScoped(this);

  const {
    cwd,
    shell: shellType,
    user,
    timeout = 0,
    env,
    signal,
    pollIntervalMs: userPollInterval = 250,
    serviceIndex = 0,
  } = options || {};

  const pollInterval = Math.max(100, userPollInterval);

  // Check if already aborted
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }

  // Access the terminal execution service.
  // In the generated client, kit namespaces (terminal, exec, files, etc.)
  // are top-level properties, not nested under `api`.
  const terminalApi = (this as any).terminal ?? (this as any).api?.terminal;
  if (!terminalApi?.commands) {
    throw new Error('Terminal commands service not available');
  }

  // Ephemeral PTY must use terminal-0 in the URL hostname.
  // The default urlTemplates set serviceIndex=1 (for interactive terminals),
  // so we always override to 0 for terminal.run().
  const templateVars = { serviceIndex };

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
  const extractCommandId = (response: unknown): string | undefined => {
    const responseData = (response as any)?.data ?? response;
    return typeof responseData?.command_id === 'string'
      ? responseData.command_id
      : typeof responseData?.id === 'string'
        ? responseData.id
        : undefined;
  };
  let commandIdForAbort: string | undefined;
  let startPromise: Promise<unknown> | undefined;
  let remoteAbortSent = false;
  const sendRemoteAbort = (id: string): void => {
    if (remoteAbortSent) return;
    remoteAbortSent = true;
    try {
      // Typed on purpose: a rename of the generated `cancel` fails the typecheck.
      const typedTerminal: HoodyClient['terminal'] = terminalApi;
      Promise.resolve(typedTerminal.commands.cancel(id, undefined, templateVars)).catch(() => {});
    } catch {
      // best-effort
    }
  };
  let abortCleanup: (() => void) | undefined;
  let rejectOnAbort: ((err: unknown) => void) | undefined;
  if (signal) {
    const onAbort = () => {
      if (commandIdForAbort) {
        sendRemoteAbort(commandIdForAbort);
      } else if (startPromise) {
        startPromise.then(
          (response) => {
            const id = extractCommandId(response);
            if (id) sendRemoteAbort(id);
          },
          () => {},
        );
      }
      rejectOnAbort?.(new DOMException('The operation was aborted.', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    abortCleanup = () => signal.removeEventListener('abort', onAbort);
  }

  try {
    // 1. Fire command (wait: false — we poll ourselves)
    const startTime = Date.now();
    startPromise = terminalApi.commands.run(
      {
        command,
        timeout: timeout || undefined,
        wait: false,
        cwd: cwd || undefined,
        env: env || undefined,
      } as any,
      {
        terminal_id: '0',
        ephemeral: true,
        skip_display_wait: true,
        shell: shellType || undefined,
        user: user || undefined,
      },
      templateVars,
    );
    const executeResponse = signal
      ? await Promise.race([
          startPromise,
          new Promise<never>((_, reject) => { rejectOnAbort = reject; }),
        ])
      : await startPromise;
    rejectOnAbort = undefined;

    // Runtime guard: extract command_id from response
    const commandId = extractCommandId(executeResponse);

    if (!commandId) {
      throw new Error(
        'terminal.commands.run did not return a command_id. Response: ' +
        JSON.stringify(executeResponse),
      );
    }
    commandIdForAbort = commandId;
    // An abort that landed between the start response and here.
    if (signal?.aborted) {
      sendRemoteAbort(commandId);
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    // 2. Adaptive polling loop
    // FIX: Grace period measured from AFTER executeCommand
    // returns, not from startTime which includes the HTTP request latency.
    const pollStartTime = Date.now();
    const GRACE_PERIOD_MS = 2000; // tolerate 404 for first 2 seconds of polling
    let currentInterval = pollInterval;
    let iterations = 0;

    while (true) {
      iterations++;

      // FIX: Safety valve — prevent infinite polling on
      // unknown statuses. Max ~10 minutes of polling.
      if (iterations > MAX_POLL_ITERATIONS) {
        throw new Error(
          `terminal.run() exceeded maximum poll iterations (${MAX_POLL_ITERATIONS}). ` +
          `Command "${commandId}" may still be running on the server.`,
        );
      }

      await sleep(currentInterval, signal);

      const elapsed = Date.now() - startTime;
      const pollElapsed = Date.now() - pollStartTime;

      // Adaptive backoff
      if (elapsed > 10_000) {
        currentInterval = Math.min(1000, pollInterval * 4);
      } else if (elapsed > 2_000) {
        currentInterval = Math.min(500, pollInterval * 2);
      }

      let pollResponse: any;
      try {
        pollResponse = await terminalApi.commands.get(
          commandId,
          templateVars,
          { signal },
        );
      } catch (err: any) {
        // FIX: Use status code checks only — remove over-broad
        // message substring matching that could false-positive.
        const is404 =
          err?.statusCode === 404 ||
          err?.status === 404;

        if (is404 && pollElapsed < GRACE_PERIOD_MS) {
          continue;
        }
        throw err;
      }

      const data = pollResponse?.data ?? pollResponse;

      // Runtime guards on response fields
      const status: string =
        typeof data?.status === 'string' ? data.status : '';
      const stdout: string =
        typeof data?.stdout === 'string' ? data.stdout : '';
      const stderr: string =
        typeof data?.stderr === 'string' ? data.stderr : '';
      const exitCode: number | null =
        typeof data?.exit_code === 'number' ? data.exit_code : null;
      const timedOut: boolean =
        data?.timed_out === true || status === 'timed_out';

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
      // FIX: Do NOT whitelist empty string — a missing
      // `status` field (coerced to '') likely means a malformed response,
      // which should be treated as terminal rather than hanging for 10 min.
      if (status === 'running' || status === 'pending') {
        continue;
      }

      // Unknown terminal status — treat as terminal to avoid infinite loop
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
  } finally {
    abortCleanup?.();
  }
}

/**
 * Install `client.terminal.run` on this client's terminal namespace object. The object is
 * per instance (withContainer and withRealm build their own), so this runs for each client
 * from patchHoodyClientMetrics. Idempotent.
 */
export function installTerminalRun(client: object): void {
  const terminal = (client as { terminal?: object }).terminal;
  if (!terminal || Object.prototype.hasOwnProperty.call(terminal, 'run')) return;
  Object.defineProperty(terminal, 'run', {
    value: (command: string, options?: TerminalExecOptions) => execImpl.call(client as HoodyClient, command, options),
    enumerable: false,
    configurable: true,
    writable: true,
  });
}
