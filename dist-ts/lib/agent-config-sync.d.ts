/**
 * Agent config sync — push local AI-agent CLI config/credentials into a container.
 *
 * Purpose:
 *   Dev containers created with `--dev-kit` ship the agent CLIs (claude-code,
 *   codex, opencode, gemini) but NOT their credentials. This helper copies the
 *   relevant files from the operator's local home (`~/.codex`, `~/.claude`,
 *   `~/.config/opencode`, `~/.gemini`, …) into the container so the tools are
 *   usable immediately.
 *
 * Design:
 *   - Filesystem-only transport. No vault. We send the file bytes over the
 *     files kit (capability-URL, HTTPS) and harden perms in-container.
 *   - "Whole dir with excludes" by default: everything EXCEPT history/cache.
 *     Intelligent category flags let you narrow to e.g. credentials-only or
 *     skills-only.
 *   - Uses the PROPER raw-byte write path: `files.put(path, Buffer)`. Passing a
 *     Buffer/Uint8Array sends the body verbatim (http-client.browser.ts), unlike
 *     `files.put(path, {content})` which stores the JSON envelope (GOTCHA-5).
 *   - Perms via TYPED endpoints `files.chmod` / `files.chown` (no shell-exec,
 *     no injection surface). Dirs 0700, files 0600, chown <user>:<user>.
 *
 * Wiring (browser-safety):
 *   This module uses node:fs/os/path. It is Node-only. The patch is applied
 *   from lib/index.ts (NOT lib/hoody-client.ts, which is in the browser entry),
 *   and build.config.ts stubs it for the browser build — mirroring
 *   screenshot-save.ts exactly.
 *
 * Attached to HoodyClient.prototype:
 *   - syncAgentConfig(tool, options?)   — sync one tool
 *   - syncAgentConfigs(tools[], options?) — sync several
 *   - listAgentConfigTools()            — inspect the registry
 *
 * All three require a container-scoped client (call `withContainer()` first).
 */
export type SyncCategory = 'credentials' | 'config' | 'skills' | 'history' | 'cache';
/** Categories synced by default ("whole dir minus history+cache"). */
export declare const DEFAULT_SYNC_CATEGORIES: SyncCategory[];
export interface AgentRoot {
    /** Local path, may start with `~`. A directory unless `isFile`. */
    local: string;
    /** Remote path, may start with `~` (expanded to destHome). */
    remote: string;
    /** True when this root is a single file rather than a directory. */
    isFile?: boolean;
    /** For file-roots, the category this file belongs to. */
    category?: SyncCategory;
}
export interface AgentConfigToolSpec {
    /** Tool id, e.g. 'codex'. */
    tool: string;
    /** Roots to sync (dirs and/or single files). */
    roots: AgentRoot[];
    /** Glob patterns (relative to a dir-root) classifying files into categories. */
    categories: Partial<Record<SyncCategory, string[]>>;
    /** Category assigned to files matching no glob (default 'config'). */
    defaultCategory?: SyncCategory;
}
export interface AgentConfigSyncOptions {
    /** Override the local path of the tool's PRIMARY (first) root. */
    source?: string;
    /** Override local paths per registry-root local string. */
    sources?: Record<string, string>;
    /** Container home used to expand remote `~` (default '/home/user'). */
    destHome?: string;
    /** Container user for chown (default 'user'). */
    user?: string;
    /** Categories to include (default DEFAULT_SYNC_CATEGORIES). */
    categories?: SyncCategory[];
    /** Convenience: shorthand for `categories` (single or list). */
    only?: SyncCategory | SyncCategory[];
    /** Also include history (projects/sessions/logs). */
    includeHistory?: boolean;
    /** Extra globs (relative to a root) to force-include regardless of category. */
    include?: string[];
    /** Extra globs (relative to a root) to force-exclude. */
    exclude?: string[];
    /** Plan only — do not write anything. */
    dryRun?: boolean;
    /** Parallel uploads (default 4). */
    concurrency?: number;
    /** File mode (default '0600'). */
    fileMode?: string;
    /** Directory mode (default '0700'). */
    dirMode?: string;
    /** chown synced paths to `<user>:<user>` (default true). */
    chown?: boolean;
    /** Follow symlinks while walking (default false — skipped & reported). */
    followSymlinks?: boolean;
    /** Max single-file size in bytes (default 25 MiB) — larger files skipped. */
    maxFileBytes?: number;
}
export interface SyncFileEntry {
    /** Absolute local source path. */
    local: string;
    /** Absolute remote destination path. */
    remote: string;
    /** Classified category. */
    category: SyncCategory;
    /** File size in bytes. */
    bytes: number;
}
export interface AgentConfigSyncResult {
    tool: string;
    dryRun: boolean;
    /** Files selected for sync. */
    planned: SyncFileEntry[];
    /** Files actually written (empty on dryRun). */
    written: SyncFileEntry[];
    /** Skipped paths with reason. */
    skipped: Array<{
        path: string;
        reason: string;
    }>;
    /** Per-file errors (write/chmod/chown). */
    errors: Array<{
        path: string;
        stage: string;
        message: string;
    }>;
    /** Total bytes written. */
    bytesWritten: number;
}
export declare const AGENT_CONFIG_TOOLS: Record<string, AgentConfigToolSpec>;
declare function expandLocal(p: string): string;
declare function expandRemote(p: string, destHome: string): string;
/** Translate a glob (supports `**`, `**​/`, `*`, `?`) to a RegExp anchored full-match. */
declare function globToRegExp(glob: string): RegExp;
declare function matchesAny(relPath: string, globs: string[] | undefined): boolean;
declare function classify(relPath: string, spec: AgentConfigToolSpec): SyncCategory;
declare function resolveCategories(opts: AgentConfigSyncOptions): SyncCategory[];
declare function buildPlan(spec: AgentConfigToolSpec, opts: AgentConfigSyncOptions, skipped: Array<{
    path: string;
    reason: string;
}>): Promise<SyncFileEntry[]>;
declare module './hoody-client.js' {
    interface HoodyClient {
        /**
         * Push a local agent CLI's config/credentials into the container.
         * Requires a container-scoped client (call `withContainer()` first).
         *
         * @example
         * const box = await client.withContainer(container);
         * await box.syncAgentConfig('codex');                    // whole dir minus history/cache
         * await box.syncAgentConfig('claude', { only: 'credentials' });
         * await box.syncAgentConfig('gemini', { source: '/custom/.gemini', dryRun: true });
         */
        syncAgentConfig(tool: string, options?: AgentConfigSyncOptions): Promise<AgentConfigSyncResult>;
        /** Sync several tools with shared options. */
        syncAgentConfigs(tools: string[], options?: AgentConfigSyncOptions): Promise<AgentConfigSyncResult[]>;
        /** Inspect the agent-config tool registry. */
        listAgentConfigTools(): AgentConfigToolSpec[];
    }
}
/**
 * Attach syncAgentConfig/syncAgentConfigs/listAgentConfigTools to
 * HoodyClient.prototype. Called from lib/index.ts (Node entry) after all
 * modules load. Idempotent.
 */
export declare function patchAgentConfigSyncPrototype(HoodyClientClass: {
    prototype: unknown;
}): void;
export declare const __testing: {
    expandLocal: typeof expandLocal;
    expandRemote: typeof expandRemote;
    globToRegExp: typeof globToRegExp;
    matchesAny: typeof matchesAny;
    classify: typeof classify;
    resolveCategories: typeof resolveCategories;
    buildPlan: typeof buildPlan;
};
export {};
