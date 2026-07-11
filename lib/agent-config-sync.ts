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

import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import * as nodePath from 'node:path';
import { HoodyClient } from './hoody-client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncCategory = 'credentials' | 'config' | 'skills' | 'history' | 'cache';

/** Categories synced by default ("whole dir minus history+cache"). */
export const DEFAULT_SYNC_CATEGORIES: SyncCategory[] = ['credentials', 'config', 'skills'];

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
  skipped: Array<{ path: string; reason: string }>;
  /** Per-file errors (write/chmod/chown). */
  errors: Array<{ path: string; stage: string; message: string }>;
  /** Total bytes written. */
  bytesWritten: number;
}

// ---------------------------------------------------------------------------
// Registry — best-effort per-CLI layout. Verify against each CLI's docs.
// ---------------------------------------------------------------------------

export const AGENT_CONFIG_TOOLS: Record<string, AgentConfigToolSpec> = {
  codex: {
    tool: 'codex',
    roots: [{ local: '~/.codex', remote: '~/.codex' }],
    defaultCategory: 'config',
    categories: {
      credentials: ['auth.json', 'credentials.json'],
      config: ['config.toml', 'config.json', 'AGENTS.md', 'instructions.md'],
      skills: ['prompts/**', 'skills/**'],
      history: [
        'history.jsonl',
        'session_index.jsonl',
        '.codex-global-state.json',
        'sessions/**',
        'log/**',
        'logs/**',
      ],
      // Regenerable local state DBs (sqlite/WAL) — never carry these by default.
      cache: ['cache/**', '.cache/**', '*.sqlite', '*.sqlite-*', '*.db', '*.db-wal', '*.db-shm'],
    },
  },
  claude: {
    tool: 'claude',
    roots: [
      { local: '~/.claude', remote: '~/.claude' },
      { local: '~/.claude.json', remote: '~/.claude.json', isFile: true, category: 'credentials' },
    ],
    defaultCategory: 'config',
    categories: {
      credentials: ['.credentials.json'],
      config: ['settings.json', 'settings.local.json', 'CLAUDE.md'],
      skills: ['skills/**', 'agents/**', 'commands/**', 'plugins/**', 'hooks/**'],
      history: [
        'projects/**',
        'todos/**',
        'history.jsonl',
        'shell-snapshots/**',
        'statsig/**',
        'logs/**',
      ],
      cache: ['.cache/**'],
    },
  },
  opencode: {
    tool: 'opencode',
    roots: [
      { local: '~/.config/opencode', remote: '~/.config/opencode' },
      { local: '~/.local/share/opencode', remote: '~/.local/share/opencode' },
    ],
    defaultCategory: 'config',
    categories: {
      credentials: ['auth.json'],
      config: ['opencode.json', 'opencode.jsonc', 'config.json', 'tui.json', 'AGENTS.md'],
      // Plural dirs are current; singular kept for backward compatibility.
      skills: [
        'agents/**', 'agent/**',
        'commands/**', 'command/**',
        'modes/**',
        'plugins/**', 'plugin/**',
        'skills/**',
        'tools/**',
        'themes/**', 'theme/**',
        'prompts/**',
      ],
      history: ['storage/**', 'log/**', 'logs/**', 'project/**', 'sessions/**'],
      cache: ['cache/**'],
    },
  },
  gemini: {
    tool: 'gemini',
    roots: [{ local: '~/.gemini', remote: '~/.gemini' }],
    defaultCategory: 'config',
    categories: {
      credentials: ['oauth_creds.json', 'access_tokens.json', 'google_accounts.json'],
      config: ['settings.json', 'GEMINI.md', '.env'],
      skills: ['commands/**', 'extensions/**'],
      history: ['tmp/**', 'logs/**', 'sessions/**', 'history/**'],
      cache: ['cache/**'],
    },
  },
};

// Classification priority — first match wins. credentials beats everything;
// history/cache beat config so e.g. claude `projects/**` is excluded by default.
const CATEGORY_PRIORITY: SyncCategory[] = ['credentials', 'history', 'cache', 'skills', 'config'];

// ---------------------------------------------------------------------------
// Path / glob helpers
// ---------------------------------------------------------------------------

function expandLocal(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return nodePath.join(homedir(), p.slice(2));
  return p;
}

function expandRemote(p: string, destHome: string): string {
  // Reject traversal in the RAW pattern — normalize() would otherwise collapse
  // `..` segments (turning `~/../../etc/passwd` into `/etc/passwd`) and slip the
  // escape past the guard.
  if (p.split('/').includes('..')) {
    throw new Error(`refusing remote path with '..' traversal: ${p}`);
  }
  let out = p;
  if (out === '~') out = destHome;
  else if (out.startsWith('~/')) out = `${destHome.replace(/\/+$/, '')}/${out.slice(2)}`;
  out = nodePath.posix.normalize(out);
  if (out.split('/').includes('..')) {
    throw new Error(`refusing remote path with '..' traversal: ${p}`);
  }
  return out;
}

/** Translate a glob (supports `**`, `**​/`, `*`, `?`) to a RegExp anchored full-match. */
function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob.charAt(i);
    if (c === '*') {
      if (glob.charAt(i + 1) === '*') {
        i++; // consume the second '*'
        if (glob.charAt(i + 1) === '/') {
          // `**/` → zero or more WHOLE leading segments. Using `(?:[^/]*/)*`
          // (not `.*`) keeps `**/auth.json` from matching `xauth.json`.
          i++;
          re += '(?:[^/]*/)*';
        } else {
          // bare `**` (typically trailing) → anything, including `/`
          re += '.*';
        }
      } else {
        re += '[^/]*'; // single `*` does not cross a path separator
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      // Escape every regex metacharacter so literal glob chars stay literal.
      re += c.replace(/[[\]{}()*+?.\\^$|]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

function matchesAny(relPath: string, globs: string[] | undefined): boolean {
  if (!globs || globs.length === 0) return false;
  return globs.some((g) => globToRegExp(g).test(relPath));
}

function classify(relPath: string, spec: AgentConfigToolSpec): SyncCategory {
  for (const cat of CATEGORY_PRIORITY) {
    if (matchesAny(relPath, spec.categories[cat])) return cat;
  }
  return spec.defaultCategory ?? 'config';
}

function resolveCategories(opts: AgentConfigSyncOptions): SyncCategory[] {
  if (opts.only) {
    const list = Array.isArray(opts.only) ? opts.only : [opts.only];
    return [...new Set(list)];
  }
  let cats = opts.categories ? [...opts.categories] : [...DEFAULT_SYNC_CATEGORIES];
  if (opts.includeHistory && !cats.includes('history')) cats.push('history');
  return [...new Set(cats)];
}

// ---------------------------------------------------------------------------
// Local filesystem walk (no symlink follow by default)
// ---------------------------------------------------------------------------

interface WalkedFile {
  abs: string;
  rel: string; // relative to the root dir, POSIX separators
  bytes: number;
}

async function walkDir(
  rootAbs: string,
  followSymlinks: boolean,
  skipped: Array<{ path: string; reason: string }>,
): Promise<WalkedFile[]> {
  const out: WalkedFile[] = [];
  // Guard against symlink loops (followSymlinks) and accidental revisits: dedupe
  // directories by their resolved real path before descending.
  const seenRealDirs = new Set<string>();
  async function recurse(dirAbs: string): Promise<void> {
    const real = await fs.realpath(dirAbs).catch(() => dirAbs);
    if (seenRealDirs.has(real)) {
      skipped.push({ path: dirAbs, reason: 'symlink cycle / already visited' });
      return;
    }
    seenRealDirs.add(real);
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dirAbs, { withFileTypes: true });
    } catch (err) {
      skipped.push({ path: dirAbs, reason: `readdir failed: ${(err as Error).message}` });
      return;
    }
    for (const ent of entries) {
      const abs = nodePath.join(dirAbs, ent.name);
      if (ent.isSymbolicLink()) {
        if (!followSymlinks) {
          skipped.push({ path: abs, reason: 'symlink (followSymlinks=false)' });
          continue;
        }
        // Resolve and stat the symlink target.
        try {
          const st = await fs.stat(abs);
          if (st.isDirectory()) {
            await recurse(abs);
          } else if (st.isFile()) {
            out.push({ abs, rel: posixRel(rootAbs, abs), bytes: st.size });
          }
        } catch (err) {
          skipped.push({ path: abs, reason: `symlink stat failed: ${(err as Error).message}` });
        }
        continue;
      }
      if (ent.isDirectory()) {
        await recurse(abs);
      } else if (ent.isFile()) {
        try {
          const st = await fs.stat(abs);
          out.push({ abs, rel: posixRel(rootAbs, abs), bytes: st.size });
        } catch (err) {
          skipped.push({ path: abs, reason: `stat failed: ${(err as Error).message}` });
        }
      }
    }
  }
  await recurse(rootAbs);
  return out;
}

function posixRel(rootAbs: string, abs: string): string {
  return nodePath.relative(rootAbs, abs).split(nodePath.sep).join('/');
}

// ---------------------------------------------------------------------------
// Plan builder
// ---------------------------------------------------------------------------

async function buildPlan(
  spec: AgentConfigToolSpec,
  opts: AgentConfigSyncOptions,
  skipped: Array<{ path: string; reason: string }>,
): Promise<SyncFileEntry[]> {
  const destHome = opts.destHome ?? '/home/user';
  const wantCats = new Set(resolveCategories(opts));
  const maxBytes = opts.maxFileBytes ?? 25 * 1024 * 1024;
  const followSymlinks = opts.followSymlinks ?? false;
  const plan: SyncFileEntry[] = [];

  for (let i = 0; i < spec.roots.length; i++) {
    const root = spec.roots[i]!;
    // Resolve local override.
    let localBase = root.local;
    const srcOverride = opts.sources?.[root.local];
    if (srcOverride) localBase = srcOverride;
    else if (i === 0 && opts.source) localBase = opts.source;
    const localAbs = expandLocal(localBase);
    const remoteBase = expandRemote(root.remote, destHome);

    let exists = false;
    let isFile = !!root.isFile;
    try {
      const st = await fs.stat(localAbs);
      exists = true;
      isFile = st.isFile();
    } catch {
      exists = false;
    }
    if (!exists) {
      skipped.push({ path: localAbs, reason: 'local path does not exist' });
      continue;
    }

    if (isFile) {
      const fileRel = nodePath.basename(localAbs);
      const cat = root.category ?? classify(fileRel, spec);
      const st = await fs.stat(localAbs);
      // Match include/exclude against the basename so e.g. exclude:['.claude.json']
      // works for single-file roots, not just directory-relative paths.
      if (!shouldInclude(fileRel, fileRel, cat, wantCats, opts)) {
        skipped.push({ path: localAbs, reason: `excluded or category '${cat}' not selected` });
        continue;
      }
      if (st.size > maxBytes) {
        skipped.push({ path: localAbs, reason: `exceeds maxFileBytes (${st.size})` });
        continue;
      }
      plan.push({ local: localAbs, remote: remoteBase, category: cat, bytes: st.size });
      continue;
    }

    // Directory root.
    const files = await walkDir(localAbs, followSymlinks, skipped);
    for (const f of files) {
      const cat = classify(f.rel, spec);
      if (!shouldInclude(f.rel, nodePath.basename(f.rel), cat, wantCats, opts)) {
        skipped.push({ path: f.abs, reason: `category '${cat}' not selected` });
        continue;
      }
      if (f.bytes > maxBytes) {
        skipped.push({ path: f.abs, reason: `exceeds maxFileBytes (${f.bytes})` });
        continue;
      }
      plan.push({
        local: f.abs,
        remote: expandRemote(`${root.remote.replace(/\/+$/, '')}/${f.rel}`, destHome),
        category: cat,
        bytes: f.bytes,
      });
    }
  }
  return plan;
}

function shouldInclude(
  relPath: string,
  _basename: string,
  cat: SyncCategory,
  wantCats: Set<SyncCategory>,
  opts: AgentConfigSyncOptions,
): boolean {
  // Explicit exclude wins.
  if (matchesAny(relPath, opts.exclude)) return false;
  // Force-include via include globs.
  if (matchesAny(relPath, opts.include)) return true;
  return wantCats.has(cat);
}

// ---------------------------------------------------------------------------
// Concurrency helper
// ---------------------------------------------------------------------------

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  const n = Math.max(1, limit);
  let idx = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (idx < items.length) {
      const cur = idx++;
      await fn(items[cur]!);
    }
  });
  await Promise.all(workers);
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

function getFilesService(client: unknown): any {
  const files = (client as any).files;
  if (!files || typeof files.put !== 'function') {
    throw new Error(
      'syncAgentConfig() requires a container-scoped client with a files service. Call withContainer() first.',
    );
  }
  return files;
}

async function syncAgentConfigImpl(
  this: HoodyClient,
  tool: string,
  options: AgentConfigSyncOptions = {},
): Promise<AgentConfigSyncResult> {
  const spec = AGENT_CONFIG_TOOLS[tool];
  if (!spec) {
    throw new Error(
      `Unknown agent tool '${tool}'. Known: ${Object.keys(AGENT_CONFIG_TOOLS).join(', ')}.`,
    );
  }
  const files = getFilesService(this);

  const result: AgentConfigSyncResult = {
    tool,
    dryRun: !!options.dryRun,
    planned: [],
    written: [],
    skipped: [],
    errors: [],
    bytesWritten: 0,
  };

  result.planned = await buildPlan(spec, options, result.skipped);
  if (options.dryRun) return result;

  const user = options.user ?? 'user';
  const fileMode = options.fileMode ?? '0600';
  const dirMode = options.dirMode ?? '0700';
  const doChown = options.chown !== false;

  // 1. Pre-create + harden EVERY directory we own under destHome — not just the
  //    immediate parent. Walk each file's path up to (but not including) destHome
  //    so intermediate ancestors (e.g. ~/.codex when only ~/.codex/skills/* syncs)
  //    also get 0700 + chown.
  const destPrefix = (options.destHome ?? '/home/user').replace(/\/+$/, '');
  const dirs = new Set<string>();
  for (const e of result.planned) {
    let d = nodePath.posix.dirname(e.remote);
    while (d.length > destPrefix.length && d.startsWith(`${destPrefix}/`)) {
      dirs.add(d);
      const parent = nodePath.posix.dirname(d);
      if (parent === d) break;
      d = parent;
    }
  }
  const sortedDirs = [...dirs].sort((a, b) => a.split('/').length - b.split('/').length);
  for (const d of sortedDirs) {
    try {
      await files.operate(d, { mkdir: '' });
    } catch (err) {
      // dir may already exist — non-fatal
      result.errors.push({ path: d, stage: 'mkdir', message: (err as Error).message });
    }
    await hardenDir(files, d, dirMode, doChown ? user : undefined, result);
  }

  // 2. Upload files (raw bytes) + harden, with bounded concurrency.
  await pool(result.planned, options.concurrency ?? 4, async (entry) => {
    let buf: Buffer;
    try {
      buf = await fs.readFile(entry.local);
    } catch (err) {
      result.errors.push({ path: entry.local, stage: 'read', message: (err as Error).message });
      return;
    }
    try {
      // Buffer is a Uint8Array → sent as raw body (NOT JSON-wrapped).
      await files.put(entry.remote, buf);
    } catch (err) {
      result.errors.push({ path: entry.remote, stage: 'put', message: (err as Error).message });
      return;
    }
    try {
      await files.chmod(entry.remote, { chmod: fileMode });
    } catch (err) {
      result.errors.push({ path: entry.remote, stage: 'chmod', message: (err as Error).message });
    }
    if (doChown) {
      try {
        await files.chown(entry.remote, { chown: `${user}:${user}` });
      } catch (err) {
        result.errors.push({ path: entry.remote, stage: 'chown', message: (err as Error).message });
      }
    }
    result.written.push(entry);
    result.bytesWritten += entry.bytes;
  });

  return result;
}

async function hardenDir(
  files: any,
  dir: string,
  dirMode: string,
  user: string | undefined,
  result: AgentConfigSyncResult,
): Promise<void> {
  try {
    await files.chmod(dir, { chmod: dirMode });
  } catch (err) {
    result.errors.push({ path: dir, stage: 'chmod-dir', message: (err as Error).message });
  }
  if (user) {
    try {
      await files.chown(dir, { chown: `${user}:${user}` });
    } catch (err) {
      result.errors.push({ path: dir, stage: 'chown-dir', message: (err as Error).message });
    }
  }
}

async function syncAgentConfigsImpl(
  this: HoodyClient,
  tools: string[],
  options: AgentConfigSyncOptions = {},
): Promise<AgentConfigSyncResult[]> {
  const out: AgentConfigSyncResult[] = [];
  for (const t of tools) {
    out.push(await syncAgentConfigImpl.call(this, t, options));
  }
  return out;
}

function listAgentConfigToolsImpl(this: HoodyClient): AgentConfigToolSpec[] {
  return Object.values(AGENT_CONFIG_TOOLS).map((s) => ({
    ...s,
    roots: s.roots.map((r) => ({ ...r })),
    categories: { ...s.categories },
  }));
}

// ---------------------------------------------------------------------------
// Module augmentation
// ---------------------------------------------------------------------------

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
    syncAgentConfigs(
      tools: string[],
      options?: AgentConfigSyncOptions,
    ): Promise<AgentConfigSyncResult[]>;
    /** Inspect the agent-config tool registry. */
    listAgentConfigTools(): AgentConfigToolSpec[];
  }
}

// ---------------------------------------------------------------------------
// Prototype patch
// ---------------------------------------------------------------------------

const AGENT_CONFIG_SYNC_PATCH_MARKER = Symbol.for('hoody.sdk.agent.config.sync.patch');

/**
 * Attach syncAgentConfig/syncAgentConfigs/listAgentConfigTools to
 * HoodyClient.prototype. Called from lib/index.ts (Node entry) after all
 * modules load. Idempotent.
 */
export function patchAgentConfigSyncPrototype(HoodyClientClass: { prototype: unknown }): void {
  const prototype = HoodyClientClass.prototype as Record<string | symbol, unknown>;
  if (prototype[AGENT_CONFIG_SYNC_PATCH_MARKER]) return;
  prototype.syncAgentConfig = syncAgentConfigImpl;
  prototype.syncAgentConfigs = syncAgentConfigsImpl;
  prototype.listAgentConfigTools = listAgentConfigToolsImpl;
  prototype[AGENT_CONFIG_SYNC_PATCH_MARKER] = true;
}

// Exported for unit tests (pure functions, no client needed).
export const __testing = {
  expandLocal,
  expandRemote,
  globToRegExp,
  matchesAny,
  classify,
  resolveCategories,
  buildPlan,
};
