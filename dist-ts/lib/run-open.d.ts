/**
 * Open an app in a computer — `box.run.open()`, `getStatus()`, `wait()`, `findOpen()`, `canOpen()` and `close()`.
 * Browser-safe (no Node imports). Maintained in lib/, not generated.
 *
 * The machine is lib/run-open-core.js, shared with the Hub (which loads its own copy of that
 * file) and driven by the CLI's `hoody run <app> --open` too. This file only gives
 * it a transport over this client and types for its results. Hoody Run (`run-1`) only resolves
 * what to run; the terminal kit creates the terminal, runs the app as a tracked workload and
 * reports its state. See the core's header for the evidence each state needs.
 *
 * Every request goes out once (`retries: 0`): the core decides what may be re-sent (an execute
 * only identically, a signal only when it provably never left) and what a lost answer means. A request that failed before
 * it left (an unbuildable URL) is reported to the core as not sent.
 *
 * The core's catalog() has no method here: `box.run.catalog` is the generated catalog service of the
 * same Hoody Run route (`box.run.catalog.list({ q })`), and a prototype method could not show through it.
 */
import './run-open-core.js';
/** Where an app opens: the computer's screen (`display-N`), a terminal, or a web page on a port. */
export type RunOpenWhere = 'window' | 'terminal' | 'web';
export type RunOpenState = 'starting' | 'started' | 'running' | 'ready' | 'exited' | 'not_started' | 'stopped' | 'unknown';
/** Names one launch: terminal N, its incarnation I, command C. Holds no secret; safe to store. */
export interface RunOpenHandle {
    v: number;
    computer?: {
        project: string;
        computer_id: string;
    };
    terminal_id: number;
    incarnation: string;
    command_id: number;
    display: number;
    launch_tag?: string;
    kind?: 'oci' | 'app';
    opens_in?: RunOpenWhere;
    web?: {
        port: number;
        path: string;
    };
    name?: string;
}
export interface RunOpenRequest {
    /** An app name, a search query, or a catalog id (`jupyterlab`). */
    app: string;
    /** `app` is a catalog id (from Hoody Run's catalog): open that entry only, never another first match. */
    catalog?: boolean;
    /** A candidate from an earlier search, instead of the first match. */
    pick?: {
        candidate_id: string;
        set_id?: string;
    };
    /**
     * Where a plain app opens when the caller knows better than the resolver (it classifies only some sources): `window`
     * is the computer's screen. A catalog entry, a web app and an OCI image keep what the resolver said.
     */
    opensIn?: 'window' | 'terminal';
    /** Appended to the app's command (at most 64, each at most 4096 bytes). */
    args?: string[];
    /** Environment for the app only (at most 32 names; names starting with HOODY_ are reserved). Never on a command line. */
    env?: Record<string, string>;
    cwd?: string;
    selector?: {
        kind?: string;
        os?: string;
        source?: string[];
        tags?: string[];
    };
    /**
     * Run the app under bash whatever the terminal's default shell is. If the terminal kit does not
     * confirm it started bash, nothing is run (`shell_unavailable`).
     */
    shell?: 'bash';
}
export interface RunOpenResult {
    ok: boolean;
    /** One key of the core's MESSAGES (`started`, `ready`, `needs_update`, `stop_unconfirmed`, …). */
    code: string;
    /** Plain English for `code`. */
    message: string;
    state?: RunOpenState;
    reason?: string;
    handle?: RunOpenHandle;
    /** A definite failure: the app was not started. */
    notSent?: boolean;
    /** What will run, with env names only. */
    details?: {
        command: string;
        title: string;
        provider: string;
        kind: string;
        env_names: string[];
    };
    /** open() only: a secret the app needs to be entered (JupyterLab's token). Show it as a secret; never store it. */
    access?: {
        name: string;
        value: string;
    };
    exit_code?: number | null;
    signal?: string | null;
    ipv6_only?: boolean;
    replayed?: boolean;
    workloads?: Array<{
        terminal_id: number;
        incarnation: string;
        command_id: number;
        state: string;
        track_label: string;
        handle: string;
    }>;
    /** `busy` only: the server's Retry-After, in milliseconds, when it sent one (at most an hour). */
    retryAfterMs?: number;
}
export interface RunOpenOptions {
    /**
     * Called at each step of open() (`starting`, then `started`, or what the start already showed).
     * `exit_code` and `signal` come with a last step whose answer already shows the app gone.
     */
    onProgress?: (event: {
        state: RunOpenState;
        phase?: string;
        terminal_id?: number;
        handle?: RunOpenHandle;
        exit_code?: number | null;
        signal?: string | null;
    }) => void;
    signal?: AbortSignal;
    /**
     * For a caller that keeps its own record of each launch: awaited with the launch's handle before
     * each new command id leaves. Only `true` lets it be sent. Anything else (a throw included) sends
     * nothing and fails with `not_durable`.
     */
    beforeExecute?: (handle: RunOpenHandle) => boolean | Promise<boolean>;
}
/** getStatus() options. */
export interface RunOpenGetStatusOptions {
    /**
     * The launch tag of the launch you mean (`handle.launch_tag`). A record naming another launch then
     * reads `unknown`, reason `foreign_record`, instead of its state.
     */
    expectTag?: string;
}
/** close() options. */
export interface RunOpenCloseOptions {
    onProgress?: RunOpenOptions['onProgress'];
    signal?: AbortSignal;
    /** As for getStatus(): close neither signals nor deletes anything that does not show this launch tag. */
    expectTag?: string;
}
/**
 * wait() result: a getStatus() result. `transient: true` marks an observation that learned nothing: no read
 * answered (state `unknown`, code `unreachable`), or the wait was cancelled while an ended OCI app's containers
 * were still being confirmed gone (state `unknown`, code `unknown`, reason `cancelled`). It is returned only
 * when no complete observation came before it: once one did, a later transient one is not reported, and the
 * wait returns that earlier answer as it was, without `transient`, so it may be older than the wait's end.
 */
export type RunOpenWaitResult = RunOpenResult & {
    transient?: boolean;
};
/** A failed result: always a `code` and its `message`. */
export type RunOpenFailure = RunOpenResult & {
    ok: false;
};
/** findOpen() result: the one live app's handle, or a failure (`no_app`, `several_apps` with `workloads`, `unreachable`, …). */
export type RunOpenFindResult = {
    ok: true;
    handle: RunOpenHandle;
} | RunOpenFailure;
/** canOpen() result: `{ ok: true }` alone, or a failure (`needs_update`, `access_refused`, `unreachable`). */
export type RunOpenCanOpenResult = {
    ok: true;
} | RunOpenFailure;
/** wait() options. */
export interface RunOpenWaitOptions {
    /** How long to keep reading (default 30 000 ms); the last answer is returned when it runs out. */
    timeoutMs?: number;
    /** Stops the wait: no further read is sent, and the last answer (or `unknown`, reason `cancelled`) is returned. */
    signal?: AbortSignal;
    /** As for getStatus(): a record naming another launch reads `unknown` (`foreign_record`) and ends the wait. */
    expectTag?: string;
    /** Called with the whole status result each time the state changes (failed reads are not reported). */
    onProgress?: (result: RunOpenResult) => void;
}
/** findOpen() options. */
export interface RunOpenFindOptions {
    /** The launch tag of the launch you mean: a live app in the terminal that shows another reads `unknown` (`foreign_record`). */
    expectTag?: string;
}
/** One catalog entry, as Hoody Run lists it (fields beyond these pass through). */
export interface RunOpenCatalogEntry {
    catalog_id?: string;
    name?: string;
    description?: string;
    opens_in?: RunOpenWhere;
    available?: boolean;
    [field: string]: unknown;
}
interface Target {
    kit: 'run' | 'terminal' | 'display';
    index: number;
}
interface Machine {
    capabilities(): Promise<RunOpenCanOpenResult>;
    catalog(q?: string): Promise<{
        ok: true;
        entries: RunOpenCatalogEntry[];
    } | RunOpenFailure>;
    open(req: RunOpenRequest, opts?: RunOpenOptions): Promise<RunOpenResult>;
    status(target: RunOpenHandle | string | number, opts?: RunOpenGetStatusOptions): Promise<RunOpenResult>;
    watch(target: RunOpenHandle | string | number, opts?: RunOpenWaitOptions): Promise<RunOpenWaitResult>;
    close(target: RunOpenHandle | string | number, opts?: RunOpenCloseOptions): Promise<RunOpenResult>;
    /** The core's find(n, expectTag): no check of n or of the tag (findOpen() checks both first). */
    find(terminal: number, expectTag?: string): Promise<RunOpenFindResult>;
}
interface CoreApi {
    VERSION: number;
    createRunOpen(deps: {
        send: (target: Target, method: string, path: string, query: Record<string, string> | undefined, body: unknown) => Promise<{
            status: number;
            body: unknown;
            retryAfterMs?: number;
        }>;
        computer?: {
            project: string;
            computer_id: string;
        };
    }): Machine;
    exitCodeFor(result: RunOpenResult): number;
    formatHandle(handle: RunOpenHandle): string;
    parseTarget(input: unknown): {
        terminal: number;
    } | {
        handle: RunOpenHandle;
    } | null;
    message(code: string, vars?: Record<string, unknown>): string;
    /**
     * Blank the secret values (`launch_env`) of a Hoody Run resolve or preflight answer in place and
     * return how many it blanked. open() already does this to the answer it reads; call it on any
     * resolve answer you hold yourself once it is dropped, stale or used. Never throws.
     */
    scrubResolveAnswer(answer: unknown): number;
}
/** The shared core (lib/run-open-core.js), as the global it defines. */
export declare function runOpenCore(): CoreApi;
declare module '../generated/run/run.service.js' {
    interface RunService {
        /**
         * Open an app in this computer: resolve it, create a fresh terminal (and screen) for it, and
         * start it there as a tracked workload. Resolves as soon as the start is admitted
         * (`state: 'started'`) with a `handle`; follow it with getStatus(). Never throws for an outcome:
         * read `ok`, `state` and `code`. `code: 'needs_update'` means a kit on this computer is too old
         * to open apps safely, and nothing was sent.
         */
        open(request: RunOpenRequest, options?: RunOpenOptions): Promise<RunOpenResult>;
        /**
         * Where an opened app is: `started`, `running`, `ready`, `exited`, `not_started` or `unknown`.
         * With `expectTag`, a record naming another launch reads `unknown` (`foreign_record`).
         */
        getStatus(handle: RunOpenHandle | string, options?: RunOpenGetStatusOptions): Promise<RunOpenResult>;
        /**
         * Read getStatus() until the state settles (`ready`, `exited`, `not_started`, `stopped`, `unknown`, or
         * `running` for an app without a window or port to wait for): every second for 10 s, then every 3 s,
         * up to `timeoutMs`; the pause before a read is not cut short at the deadline, so it can return up to one
         * poll (3 s) plus one read after `timeoutMs`. A failed read is retried, never reported as a state. Never throws
         * for an outcome.
         */
        wait(handle: RunOpenHandle | string, options?: RunOpenWaitOptions): Promise<RunOpenWaitResult>;
        /**
         * The app opened in terminal N, when exactly one live one runs there: its `handle`. `no_app` when
         * none, `several_apps` (with `workloads`) when more than one. Reads only; nothing is signalled.
         */
        findOpen(terminal: number, options?: RunOpenFindOptions): Promise<RunOpenFindResult>;
        /**
         * Whether this computer's kits can open apps: `ok: true`, else `needs_update` (a kit is too old),
         * `access_refused` or `unreachable`. open() asks the same before it sends anything.
         */
        canOpen(): Promise<RunOpenCanOpenResult>;
        /**
         * Stop an opened app (INT, then TERM, then KILL) and close its terminal. `stopped` only once the
         * terminal kit reports no process of it left (and, for a Docker image, no container). A
         * terminal number alone works when exactly one opened app runs in it. With `expectTag`, nothing
         * that does not show that launch tag is signalled or deleted.
         */
        close(target: RunOpenHandle | string | number, options?: RunOpenCloseOptions): Promise<RunOpenResult>;
    }
}
/**
 * Install `open()`, `getStatus()`, `wait()`, `findOpen()`, `canOpen()` and `close()` on the run service. Runs once
 * when this module loads; a second call does nothing.
 */
export declare function patchRunOpenExtensions(): void;
export {};
