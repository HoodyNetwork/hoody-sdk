/**
 * `hoody-sdk/mount` — programmatic and CLI-facing module for
 * mounting Hoody container filesystems locally via rclone+WebDAV.
 *
 * Architecture:
 *   - Resolves a kit URL: a caller-supplied raw URL, or a {@link ContainerLike}
 *     on the containers domain of the caller's API (`client.getKitUrl`, or
 *     `containersDomain`). No platform host is written in here.
 *   - Probes the mounted path with the supplied {@link ProxyAuth} ({@link probeKit},
 *     PROPFIND) before rclone starts, and reports the mount only once it is in the
 *     OS mount table.
 *   - Writes a 0600 rclone config at `~/.hoody/sdk/mounts/<id>.conf`
 *     containing the secret material (bearer_token / pass / headers).
 *     `--auth-container-claim` is the only auth type that may leak via
 *     argv `--header` if the bundled rclone is older than 1.61; v1.74
 *     (the modern reference) supports `headers` config natively.
 *   - Spawns `rclone mount hoody: <localPath>` with `--config <id>.conf`,
 *     foreground (default) or `--daemon` (background; Linux/macOS only).
 *   - Records the mount in `~/.hoody/sdk/mounts/<id>.json` via the
 *     {@link claimState} `wx` exclusive-create + reclaim probe.
 */

import { ChildProcess, spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { homedir, hostname, platform, userInfo } from 'node:os';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { execFile as execFileCb } from 'node:child_process';

import type { ProxyAuth } from './proxy-auth.js';
import { assertRcloneInstalled, detectRcloneVersion, isVersionAtLeast } from './rclone-local.js';
import {
  type AliveState,
  type MountStateFile,
  cacheDirPath,
  checkLiveness,
  claimState,
  computeMountId,
  configFilePath,
  deleteState,
  ensureMountpointParent,
  getStateDir,
  isMountpointEmpty,
  listStates,
  mountTableHas,
  pruneStale,
  readState,
  stateFilePath,
} from './mount-state.js';

const execFile = promisify(execFileCb);

const RCLONE_HEADERS_MIN_VERSION: readonly [number, number] = [1, 61];

export interface ContainerLike {
  // Every field is optional in the type and server / server_name flow through the index
  // signature, so the SDK's own container responses (containers.get / create: `id?: string;
  // project_id?: string; server_name?: string | null`; a containers.list item: `server` an
  // object) are assignable unchanged. The mount helpers validate id + project_id + a
  // resolvable server at runtime before building a URL.
  id?: string;
  project_id?: string;
  [key: string]: unknown;
}

/** Anything that builds kit URLs for the caller's API: a `HoodyClient` or a container-scoped client. */
export interface KitUrlSource {
  getKitUrl(kit: string, container: ContainerLike, serviceIndex: number): string;
}

/**
 * A container is reached on the containers domain of the API it belongs to, so the container
 * form names that API: `client` (its `getKitUrl`) or `containersDomain` (e.g. the
 * `containers.<platform>` sibling of `api.<platform>`). One of the two is required.
 */
export type MountTarget =
  | { container: ContainerLike; client: KitUrlSource; subpath?: string; serviceIndex?: number }
  | { container: ContainerLike; containersDomain: string; subpath?: string; serviceIndex?: number }
  | { kitUrl: string; subpath?: string };

export interface MountOptionsBase {
  localPath: string;
  auth?: ProxyAuth;
  background?: boolean;
  readOnly?: boolean;
  noVfsCache?: boolean;
  extraRcloneArgs?: readonly string[];
  rclonePath?: string;
  /** Override of `~/`. For tests. */
  home?: string;
  /** stdout / stderr inheritance for foreground mode. */
  stdio?: 'inherit' | 'ignore' | 'pipe';
  /**
   * Check the kit with {@link probeKit} (a WebDAV PROPFIND of the mounted path, with `auth`)
   * before rclone starts, and refuse an unreachable kit, a refused credential or a missing path.
   * Default true. The probe is a plain fetch: turn it off when rclone reaches the kit through a
   * proxy that this process does not use.
   */
  probe?: boolean;
  /** How long to wait for the mount to appear in the OS mount table. Default 30 s. */
  readyTimeoutMs?: number;
}

export type MountOptions = MountTarget & MountOptionsBase;

export interface MountHandle {
  id: string;
  pid: number | null;
  rclonePid: number | null;
  localPath: string;
  kitUrl: string;
  mode: 'foreground' | 'background';
  /** Resolves with the rclone exit code (foreground only). */
  wait(): Promise<number>;
  unmount(): Promise<void>;
}

export interface MountListEntry {
  id: string;
  containerId: string;
  kitUrl: string;
  /** Subpath inside the container that's been mounted (e.g. `home/user`). */
  subpath: string;
  localPath: string;
  mode: 'foreground' | 'background';
  pid: number | null;
  alive: AliveState;
  startedAt: string;
}

export interface ProbeResult {
  ok: boolean;
  status: number;
  davHeader?: string | undefined;
  needsAuth: boolean;
  detail?: string | undefined;
}

// ─── Public entry points ─────────────────────────────────────────────────

export async function listMounts(home?: string): Promise<MountListEntry[]> {
  const records = await listStates(home);
  const out: MountListEntry[] = [];
  for (const r of records) {
    const liveness = await checkLiveness(r);
    out.push({
      id: r.id,
      containerId: r.containerId,
      kitUrl: r.kitUrl,
      subpath: r.subpath,
      localPath: r.localPath,
      mode: r.mode,
      pid: r.pid,
      alive: liveness.alive,
      startedAt: r.startedAt,
    });
  }
  return out;
}

export async function pruneStaleMounts(home?: string): Promise<{ removed: number; orphans: number }> {
  return pruneStale(home);
}

/**
 * Ask the kit about `kitUrl` with `auth`: `OPTIONS` (default) answers whether the kit is there
 * and speaks WebDAV; `PROPFIND` (Depth 0) also answers whether the path exists (404).
 */
export async function probeKit(
  kitUrl: string,
  auth?: ProxyAuth,
  timeoutMs = 10000,
  method: 'OPTIONS' | 'PROPFIND' = 'OPTIONS',
): Promise<ProbeResult> {
  const headers: Record<string, string> = {};
  applyAuthToHeaders(headers, auth);
  if (method === 'PROPFIND') headers['depth'] = '0';
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Never follow a redirect: fetch strips only Authorization on a cross-origin hop,
    // so a kit token under another header name would reach the redirect's target.
    const res = await fetch(kitUrl, {
      method,
      headers,
      signal: controller.signal,
      redirect: 'manual',
    });
    const dav = res.headers.get('dav') ?? undefined;
    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
      return { ok: false, status: res.status, davHeader: dav, needsAuth: false, detail: `redirect refused (${res.status}): the probe carries the kit credential and is sent only to ${kitUrl}` };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, davHeader: dav, needsAuth: true, detail: `${res.status} ${res.statusText}` };
    }
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, status: res.status, davHeader: dav, needsAuth: false };
    }
    return { ok: false, status: res.status, davHeader: dav, needsAuth: false, detail: `${res.status} ${res.statusText}` };
  } catch (err) {
    return { ok: false, status: 0, needsAuth: false, detail: (err as Error).message };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Resolve a kit URL from MountTarget. The full path the WebDAV remote
 * mounts is `<kit base URL>/<subpath>` (subpath stripped of leading
 * slashes and percent-encoded segment-by-segment).
 */
export function resolveKitUrl(target: MountTarget): { kitUrl: string; subpath: string; containerId: string } {
  const subpath = normalizeSubpath('subpath' in target ? target.subpath : undefined);
  if ('kitUrl' in target) {
    if (!/^https?:\/\//.test(target.kitUrl)) {
      throw new Error(`kitUrl must start with http:// or https:// (got ${JSON.stringify(target.kitUrl)})`);
    }
    return {
      kitUrl: stripTrailingSlash(target.kitUrl),
      subpath,
      containerId: extractContainerIdFromUrl(target.kitUrl),
    };
  }
  const c = target.container;
  // server_name, else server: a string when hand-built, the server-details object
  // ({ name, country, … }) on a containers.list item, whose server_name is null.
  const serverField = typeof c.server === 'object' && c.server !== null ? (c.server as { name?: unknown }).name : c.server;
  const server = typeof c.server_name === 'string' && c.server_name !== ''
    ? c.server_name
    : (typeof serverField === 'string' ? serverField : undefined);
  if (typeof c.id !== 'string' || !c.id || typeof c.project_id !== 'string' || !c.project_id || !server) {
    throw new Error('container must include id, project_id, and server_name (or server)');
  }
  const idx = target.serviceIndex ?? 1;
  const client = 'client' in target ? target.client : undefined;
  const domain = 'containersDomain' in target ? target.containersDomain : undefined;
  if (client !== undefined && domain !== undefined) {
    throw new Error('pass client or containersDomain, not both');
  }
  let kitUrl: string;
  if (client !== undefined && client !== null && typeof client.getKitUrl === 'function') {
    kitUrl = stripTrailingSlash(client.getKitUrl('files', { id: c.id, project_id: c.project_id, server_name: server }, idx));
    if (!/^https?:\/\//.test(kitUrl)) {
      throw new Error(`client.getKitUrl returned ${JSON.stringify(kitUrl)}, not an http(s) URL`);
    }
  } else if (typeof domain === 'string' && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i.test(domain)) {
    kitUrl = `https://${c.project_id}-${c.id}-files-${idx}.${server}.${domain.toLowerCase()}`;
  } else if (domain !== undefined) {
    throw new Error(`containersDomain must be a DNS name such as containers.example.com (got ${JSON.stringify(domain)})`);
  } else {
    throw new Error(
      'a container target needs the API it belongs to: pass client (a HoodyClient) or containersDomain, ' +
        "or pass kitUrl (client.getKitUrl('files', container))",
    );
  }
  return { kitUrl, subpath, containerId: c.id };
}

export async function mount(opts: MountOptions): Promise<MountHandle> {
  const { kitUrl, subpath, containerId } = resolveKitUrl(opts);
  const localPath = resolve(opts.localPath);
  refuseSafeSaveHeaders(opts.auth, opts.extraRcloneArgs);

  if (opts.background && platform() === 'win32') {
    throw new Error(
      '--background is not supported on Windows. WinFsp does not expose a daemonize flag. ' +
        'Run hoody mount in a separate terminal (foreground), or use Windows Task Scheduler.',
    );
  }

  await ensureMountpointParent(localPath);
  const empty = await isMountpointEmpty(localPath);
  if (!empty) {
    throw new Error(`mountpoint ${localPath} is not empty (rclone requires an empty directory)`);
  }

  await fs.mkdir(localPath, { recursive: true, mode: 0o700 }).catch(() => undefined);

  const rclonePath = opts.rclonePath ?? 'rclone';
  await assertRcloneInstalled(rclonePath);
  const rcloneVersion = await detectRcloneVersion(rclonePath);
  const supportsHeadersConfig = isVersionAtLeast(rcloneVersion, RCLONE_HEADERS_MIN_VERSION);

  const id = computeMountId(localPath, userInfo().uid);
  const url = subpath ? `${kitUrl}/${subpath}` : kitUrl;
  const auth = opts.auth ?? { type: 'ip' as const };
  if (opts.probe !== false) await assertKitAnswers(url, subpath, auth);

  const { configBody, authMethod, headerArgs } = await buildAuthDelivery({
    auth,
    url,
    rclonePath,
    supportsHeadersConfig,
  });

  await fs.mkdir(getStateDir(opts.home), { recursive: true, mode: 0o700 });
  const confPath = configFilePath(id, opts.home);
  const cacheDir = cacheDirPath(id, url, opts.home);
  await fs.mkdir(cacheDir, { recursive: true, mode: 0o700 });

  const record: MountStateFile = {
    id,
    version: 1,
    containerId,
    kitUrl: url,
    subpath,
    localPath,
    mode: opts.background ? 'background' : 'foreground',
    pid: null,
    rclonePid: null,
    auth: { method: authMethod },
    startedAt: new Date().toISOString(),
    platform: platform(),
  };
  await claimState(record, opts.home);

  try {
    await fs.writeFile(confPath, configBody, { mode: 0o600 });
  } catch (err) {
    await deleteState(id, opts.home);
    throw err;
  }

  const args = [
    'mount',
    'hoody:',
    localPath,
    '--config',
    confPath,
    '--cache-dir',
    cacheDir,
    ...syncArgs(opts.noVfsCache === true),
    ...(opts.readOnly ? ['--read-only'] : []),
    ...headerArgs,
    ...safeSaveHeaderArgs(),
    ...(opts.extraRcloneArgs ?? []),
  ];

  const env = { ...process.env };
  delete env.RCLONE_WEBDAV_USER;
  delete env.RCLONE_WEBDAV_PASS;
  delete env.RCLONE_WEBDAV_BEARER_TOKEN;
  delete env.RCLONE_WEBDAV_HEADERS;

  if (opts.background) {
    args.push('--daemon', '--daemon-timeout', '10m');
    let child: ChildProcess;
    try {
      child = spawn(rclonePath, args, {
        detached: true,
        stdio: 'ignore',
        env,
      });
    } catch (err) {
      await deleteState(id, opts.home);
      throw err;
    }
    child.unref();

    let parentExit: number | null = null;
    await new Promise<void>((res) => {
      child.once('exit', (code) => {
        parentExit = code ?? -1;
        res();
      });
      const t = setTimeout(() => res(), 12000);
      child.once('exit', () => clearTimeout(t));
    });

    if (parentExit !== 0 && parentExit !== null) {
      await deleteState(id, opts.home);
      throw new Error(`rclone --daemon parent exited with code ${parentExit} — mount failed`);
    }

    const daemonPid = await pollDaemonPid(rclonePath, localPath);
    const ready = await waitUntilMounted(localPath, null, opts.readyTimeoutMs ?? 30000);
    if (ready !== true) {
      // Stop everything this call started (the parent, if its wait ran out, and the daemon,
      // looked for again when it was not found), then undo a mount that came up meanwhile.
      // The record goes only once the path is known not to be mounted.
      if (child.exitCode === null && child.signalCode === null) {
        try { child.kill('SIGTERM'); } catch { /* ignore */ }
      }
      const daemon = daemonPid ?? (await pollDaemonPid(rclonePath, localPath, 3000));
      if (daemon !== null) {
        try { process.kill(daemon, 'SIGTERM'); } catch { /* gone */ }
      }
      const reason = `rclone did not mount ${localPath}: ${ready === 'unreadable' ? 'the OS mount table could not be read' : 'it is not in the OS mount table'} (daemon ${daemon === null ? 'not found' : `pid ${daemon} stopped`})`;
      try {
        await detachMountpoint(localPath, null);
      } catch (err) {
        record.pid = daemon;
        record.rclonePid = daemon;
        await fs.writeFile(stateFilePath(id, opts.home), JSON.stringify(record, null, 2), { mode: 0o600 }).catch(() => undefined);
        throw new Error(`${reason}; ${ready === 'unreadable' ? 'it could not be confirmed unmounted' : 'it then appeared and could not be unmounted'} (${(err as Error).message}); its record is kept`);
      }
      await deleteState(id, opts.home);
      throw new Error(reason);
    }
    record.pid = daemonPid;
    record.rclonePid = daemonPid;
    await fs.writeFile(stateFilePath(id, opts.home), JSON.stringify(record, null, 2), { mode: 0o600 });

    return {
      id,
      pid: daemonPid,
      rclonePid: daemonPid,
      localPath,
      kitUrl: url,
      mode: 'background',
      wait: () => Promise.resolve(0),
      unmount: () => unmountById(id, opts.home),
    };
  }

  let child: ChildProcess;
  try {
    child = spawn(rclonePath, args, {
      stdio: opts.stdio ?? 'inherit',
      env,
    });
  } catch (err) {
    await deleteState(id, opts.home);
    throw err;
  }
  // Listen at once: an rclone that exits during the awaits below would otherwise go unseen.
  const childExit = new Promise<number>((res) => child.once('exit', (code) => res(code ?? -1)));

  const childPid = child.pid ?? null;
  record.pid = childPid;
  record.rclonePid = childPid;
  const recordWrite = fs.writeFile(stateFilePath(id, opts.home), JSON.stringify(record, null, 2), { mode: 0o600 });
  const recordWritten = recordWrite.then(() => undefined, () => undefined);
  // The stop and the signal handler exist before the first await after spawn, so a signal from
  // here on stops this rclone; the stop waits for the record write so it never outlives it.
  const stop = makeForegroundStop(child, id, opts.home, localPath, recordWritten);
  const signalHandler = installSignalHandlers(stop, localPath);
  // rclone may end on its own (a crash, a signal from the terminal); its mount can outlive it.
  // wait() rejects when the mount point could not be unmounted afterwards.
  const exited = childExit.then(async (code) => {
    try {
      await stop();
    } finally {
      uninstallSignalHandlers(signalHandler);
    }
    return code;
  });
  exited.catch(() => undefined); // reported through wait(); never an unhandled rejection
  try {
    await recordWrite;
  } catch (err) {
    // No record of this rclone exists: never leave it running, even when its mount is busy
    // (the record claimState made stays, so a later unmount still finds the path).
    await stop().catch(() => {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
    });
    throw err;
  }
  // Report the mount only once it is there: rclone that fails (bad config, no FUSE) exits, and
  // one that never mounts is stopped. Its own messages are on the inherited stderr.
  let childCode: number | null = null;
  void childExit.then((code) => { childCode = code; });
  const ready = await waitUntilMounted(localPath, () => childCode !== null, opts.readyTimeoutMs ?? 30000);
  if (ready !== true) {
    const reason = childCode !== null
      ? `rclone exited with code ${childCode} before ${localPath} was mounted`
      : ready === 'unreadable'
        ? `could not confirm ${localPath} was mounted: the OS mount table could not be read; rclone was stopped`
        : `rclone did not mount ${localPath} within ${Math.round((opts.readyTimeoutMs ?? 30000) / 1000)} s; it was stopped`;
    await stop().catch(() => {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
    });
    throw new Error(reason);
  }

  return {
    id,
    pid: childPid,
    rclonePid: childPid,
    localPath,
    kitUrl: url,
    mode: 'foreground',
    wait: () => exited,
    unmount: () => stop(),
  };
}

export async function unmountById(id: string, home?: string): Promise<void> {
  let rec: MountStateFile;
  try {
    rec = await readState(id, home);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`no mount found with id ${id}`);
    }
    throw err;
  }
  // Unmount first: on a busy mount this throws and leaves rclone and the record in place,
  // so the mount keeps working and a later unmount still finds it.
  await detachMountpoint(rec.localPath, rec.pid);
  if (rec.pid !== null) {
    try {
      process.kill(rec.pid, 'SIGTERM');
    } catch {
      // pid may be gone
    }
  }
  await deleteState(id, home);
}

export async function unmount(idOrPath: string, home?: string): Promise<void> {
  if (/^[a-f0-9]{16}$/.test(idOrPath)) {
    return unmountById(idOrPath, home);
  }
  const localPath = resolve(idOrPath);
  const id = computeMountId(localPath, userInfo().uid);
  try {
    await readState(id, home);
    return unmountById(id, home);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  const records = await listStates(home);
  const match = records.find((r) => resolve(r.localPath) === localPath);
  if (!match) throw new Error(`no mount found for ${idOrPath}`);
  return unmountById(match.id, home);
}

/** Thrown by {@link unmountAll} / {@link unmountByContainer} when a mount could not be unmounted. */
export class UnmountError extends Error {
  constructor(
    /** How many mounts were unmounted. */
    readonly unmounted: number,
    readonly failures: ReadonlyArray<{ id: string; localPath: string; message: string }>,
  ) {
    super(
      `unmounted ${unmounted} mount(s); ${failures.length} failed:\n` +
        failures.map((f) => `  ${f.localPath}: ${f.message}`).join('\n'),
    );
    this.name = 'UnmountError';
  }
}

/** Unmount every record; throws {@link UnmountError} after trying them all if any is still mounted. */
/** Throw a clear error unless the kit answers a PROPFIND of `url` with `auth`. */
async function assertKitAnswers(url: string, subpath: string, auth: ProxyAuth): Promise<void> {
  const probe = await probeKit(url, auth, 10000, 'PROPFIND');
  if (probe.ok) return;
  if (probe.status === 0) {
    throw new Error(`cannot reach the files kit at ${url}: ${probe.detail ?? 'no answer'} (if rclone reaches it through a proxy this process does not use, skip the check: --no-probe / probe: false)`);
  }
  if (probe.needsAuth) {
    throw new Error(`the files kit refused the request (${probe.detail}): pass the credential its permission rule expects (--auth-token-file / --auth-password-file; SDK: auth)`);
  }
  if (probe.status === 404) {
    throw new Error(`/${decodeURIComponent(subpath)} does not exist in the container (404 from the files kit)`);
  }
  throw new Error(`the files kit at ${url} answered ${probe.detail ?? probe.status}`);
}

/**
 * Wait until `localPath` is in the OS mount table. False on timeout or when `gaveUp()` says the
 * mounter is gone, 'unreadable' when the table could not be read by then (Linux, macOS); true
 * at once on Windows, which has no table to read and where nothing can tell.
 */
async function waitUntilMounted(localPath: string, gaveUp: (() => boolean) | null, timeoutMs: number): Promise<boolean | 'unreadable'> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const mounted = await mountTableHas(localPath);
    if (mounted === true || (mounted === null && process.platform === 'win32')) return true;
    if ((gaveUp && gaveUp()) || Date.now() >= deadline) return mounted === null ? 'unreadable' : false;
    await sleep(200);
  }
}

async function unmountRecords(records: readonly MountStateFile[], home?: string): Promise<number> {
  let count = 0;
  const failures: Array<{ id: string; localPath: string; message: string }> = [];
  for (const r of records) {
    try {
      await unmountById(r.id, home);
      count++;
    } catch (err) {
      // A record another process removed meanwhile is not a failure.
      if (/^no mount found/.test((err as Error).message)) continue;
      failures.push({ id: r.id, localPath: r.localPath, message: (err as Error).message });
    }
  }
  if (failures.length > 0) throw new UnmountError(count, failures);
  return count;
}

export async function unmountAll(home?: string): Promise<number> {
  return unmountRecords(await listStates(home), home);
}

export async function unmountByContainer(containerId: string, home?: string): Promise<number> {
  const records = await listStates(home);
  return unmountRecords(records.filter((x) => x.containerId === containerId), home);
}

// ─── Internals ───────────────────────────────────────────────────────────

/**
 * How long a mount trusts its own directory listing, and how long a file must stay closed and
 * idle before its upload starts. rclone's defaults (5 min, 5 s) left another machine's (or the
 * container's) changes and deletes invisible for up to 5 min, and served a file the box had
 * rewritten cut to the size the stale listing recorded. A change that has landed now shows at
 * the next lookup after MOUNT_DIR_CACHE_TIME (plus rclone's 1 s attribute cache); a handle
 * that is already open can keep its old view.
 *
 * This bounds staleness; it is not a lock. rclone's WebDAV client uploads a whole file once it
 * has been closed and idle, with an unconditional PUT (no rclone flag adds If-Match), so with
 * two writers to one file the last upload lands at the name; what it replaced is kept by the kit
 * as a conflict copy when this mount had never received it (safe save, `safeSaveHeaderArgs`). The cost is one
 * PROPFIND per directory still in use each time its listing expires (on demand, not polled).
 * A later `--extra` value of either flag wins, since rclone keeps the last one given.
 */
export const MOUNT_DIR_CACHE_TIME = '5s';
export const MOUNT_WRITE_BACK = '1s';

/**
 * Safe save: the headers that name this mount to the files kit. The kit keeps, per session,
 * which versions this mount has received (a download, or its own upload); an upload or delete
 * from the mount over a version it never received keeps that version as a conflict copy beside
 * the file (`name (conflict <label> <time>).ext`) instead of losing it. The session is new on
 * every mount start, so a restarted mount knows nothing yet and only makes extra copies. The
 * label is this machine's short host name, as the copy's name shows it. `--header` is rclone's
 * global flag, so every auth method gets both; a kit without safe save ignores them.
 */
export function safeSaveHeaderArgs(host: string = hostname()): string[] {
  const label = mountLabel(host);
  return ['--header', `X-Mount-Session: ${randomBytes(16).toString('hex')}`, '--header', `X-Mount-Label: ${label}`];
}

const SAFE_SAVE_HEADERS = ['x-mount-session', 'x-mount-label'];

/**
 * Refuse a caller's header that `safeSaveHeaderArgs` sets itself: an auth header of that name, or
 * one in the extra rclone args (`--header`, `--header-upload`, `--header-download`, as
 * `--flag value` or `--flag=value`, and `--webdav-headers`). A second session id would decide
 * what the kit believes this mount received.
 */
export function refuseSafeSaveHeaders(auth: ProxyAuth | undefined, extraRcloneArgs: readonly string[] = []): void {
  const names: string[] = [];
  if (auth && (auth.type === 'token' || auth.type === 'jwt') && auth.header) names.push(auth.header);
  for (let i = 0; i < extraRcloneArgs.length; i++) {
    const m = /^--(header|header-upload|header-download|webdav-headers)(?:=(.*))?$/s.exec(extraRcloneArgs[i]!);
    if (!m) continue;
    const value = m[2] ?? extraRcloneArgs[++i] ?? '';
    // --webdav-headers is a CSV row "Name,value,Name,value"; the others are "Name: value".
    if (m[1] === 'webdav-headers') names.push(...csvFields(value).filter((_, k) => k % 2 === 0));
    else names.push(value.split(':')[0] ?? '');
  }
  const taken = names.find((n) => SAFE_SAVE_HEADERS.includes(n.trim().toLowerCase()));
  if (taken !== undefined) {
    throw new Error(`${taken.trim()} is set by hoody mount itself (safe save); remove it from the rclone args or the auth header name`);
  }
}

/** The fields of one CSV row, as rclone reads a comma-separated list: a quoted field may hold commas, and "" in it is a quote. */
function csvFields(row: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i]!;
    if (quoted) {
      if (c === '"' && row[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field.trim() === '') {
      field = '';
      quoted = true;
    } else if (c === ',') {
      out.push(field);
      field = '';
    } else field += c;
  }
  out.push(field);
  return out;
}

/** The host name's first part, as the kit accepts a label: [A-Za-z0-9-], at most 32. */
export function mountLabel(host: string): string {
  const label = (host.split('.')[0] ?? '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 32);
  return label === '' ? 'mount' : label;
}

/** The rclone cache and write-back flags `mount()` passes before the caller's extra args. */
function syncArgs(noVfsCache: boolean): string[] {
  return [
    '--dir-cache-time',
    MOUNT_DIR_CACHE_TIME,
    ...(noVfsCache ? [] : ['--vfs-cache-mode', 'writes', '--vfs-write-back', MOUNT_WRITE_BACK]),
  ];
}

export interface AuthDelivery {
  configBody: string;
  authMethod: MountStateFile['auth']['method'];
  headerArgs: string[];
}

export interface BuildAuthDeliveryOpts {
  auth: ProxyAuth;
  url: string;
  rclonePath: string;
  supportsHeadersConfig: boolean;
}

export async function buildAuthDelivery(opts: BuildAuthDeliveryOpts): Promise<AuthDelivery> {
  const { auth, url, rclonePath, supportsHeadersConfig } = opts;
  const base = `[hoody]\ntype = webdav\nurl = ${url}\nvendor = other\n`;
  switch (auth.type) {
    case 'ip':
      return { configBody: base, authMethod: 'ip', headerArgs: [] };
    case 'password': {
      const obscured = await rcloneObscure(rclonePath, auth.password);
      return {
        configBody: `${base}user = ${auth.username}\npass = ${obscured}\n`,
        authMethod: 'password',
        headerArgs: [],
      };
    }
    case 'jwt':
    case 'token': {
      const tokenValue = auth.type === 'jwt' ? auth.token : auth.value;
      const headerName = auth.header;
      if (!headerName || /^authorization$/i.test(headerName)) {
        return { configBody: `${base}bearer_token = ${tokenValue}\n`, authMethod: 'token', headerArgs: [] };
      }
      if (supportsHeadersConfig) {
        const csv = csvEncodeHeader(headerName, tokenValue);
        return { configBody: `${base}headers = ${csv}\n`, authMethod: 'header', headerArgs: [] };
      }
      return {
        configBody: base,
        authMethod: 'header',
        headerArgs: ['--header', `${headerName}: ${tokenValue}`],
      };
    }
    case 'containerClaim': {
      if (supportsHeadersConfig) {
        const csv = csvEncodeHeaders([
          ['X-Hoody-Container-Claim', auth.claim],
          ['X-Hoody-Token', auth.token],
        ]);
        return { configBody: `${base}headers = ${csv}\n`, authMethod: 'containerClaim', headerArgs: [] };
      }
      return {
        configBody: base,
        authMethod: 'containerClaim',
        headerArgs: [
          '--header',
          `X-Hoody-Container-Claim: ${auth.claim}`,
          '--header',
          `X-Hoody-Token: ${auth.token}`,
        ],
      };
    }
    default: {
      const _exhaustive: never = auth;
      throw new Error(`unsupported ProxyAuth: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function csvEncodeHeader(name: string, value: string): string {
  return `${csvField(name)},${csvField(value)}`;
}

function csvEncodeHeaders(pairs: ReadonlyArray<readonly [string, string]>): string {
  return pairs.map(([k, v]) => csvEncodeHeader(k, v)).join(',');
}

function csvField(s: string): string {
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function applyAuthToHeaders(headers: Record<string, string>, auth?: ProxyAuth): void {
  if (!auth || auth.type === 'ip') return;
  if (auth.type === 'password') {
    const b64 = base64(`${auth.username}:${auth.password}`);
    headers['authorization'] = `Basic ${b64}`;
    return;
  }
  if (auth.type === 'jwt' || auth.type === 'token') {
    // As buildAuthDelivery hands it to rclone: `Bearer <value>` on Authorization (bearer_token),
    // the raw value under any other header name.
    const value = auth.type === 'jwt' ? auth.token : auth.value;
    const name = auth.header?.toLowerCase() ?? 'authorization';
    headers[name] = name === 'authorization' ? `Bearer ${value}` : value;
    return;
  }
  if (auth.type === 'containerClaim') {
    headers['x-hoody-container-claim'] = auth.claim;
    headers['x-hoody-token'] = auth.token;
  }
}

function base64(s: string): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(s).toString('base64');
  return btoa(s);
}

async function rcloneObscure(rclonePath: string, plaintext: string): Promise<string> {
  // execFile (no shell): plaintext password cannot contain shell syntax
  // that would inject commands. Worst case is a weird-but-literal value
  // passed to rclone obscure, which rclone handles fine.
  const { stdout } = await execFile(rclonePath, ['obscure', plaintext], { timeout: 10000 });
  return stdout.trim();
}

/**
 * Poll the OS process table for the rclone daemon process matching the
 * given localPath. Uses execFile (no shell) so untrusted-looking
 * characters in `localPath` cannot inject shell syntax.
 */
async function pollDaemonPid(rclonePath: string, localPath: string, deadlineMs = 15000): Promise<number | null> {
  void rclonePath;
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    try {
      let stdout: string;
      if (process.platform === 'win32') {
        const escaped = localPath.replace(/'/g, "''");
        const { stdout: out } = await execFile(
          'wmic',
          ['process', 'where', `CommandLine like '%${escaped}%'`, 'get', 'processid'],
          { timeout: 3000 },
        );
        stdout = out;
      } else {
        // `pgrep -af <regex>` — pattern is the LAST arg, not concatenated
        // into a shell command, so it cannot inject shell syntax. The regex
        // is anchored loosely (rclone mount ... <localPath>) but exact
        // argv-token matching happens in parseRcloneCandidates anyway.
        const { stdout: out } = await execFile(
          'pgrep',
          ['-af', `rclone mount.*${escapeForRegex(localPath)}`],
          { timeout: 3000 },
        );
        stdout = out;
      }
      const candidates = parseRcloneCandidates(stdout, localPath);
      if (candidates.length === 1) return candidates[0]!;
    } catch {
      // ignore; retry
    }
    await sleep(500);
  }
  return null;
}

function parseRcloneCandidates(stdout: string, localPath: string): number[] {
  const out: number[] = [];
  for (const line of stdout.split('\n')) {
    if (!hasExactPathArg(line, localPath)) continue;
    const m = line.match(/^\s*(\d+)/);
    if (m) out.push(Number(m[1]));
  }
  return out;
}

/**
 * Whether `line` contains `localPath` as a *whole argv token*, not as a
 * substring. Avoids false matches when one mountpoint is a prefix of
 * another (e.g. `/mnt/a` and `/mnt/abc`).
 */
function hasExactPathArg(line: string, localPath: string): boolean {
  const tokens = line.split(/\s+/);
  return tokens.some((t) => t === localPath || t === `"${localPath}"` || t === `'${localPath}'`);
}

/** The unmount commands to try in order; the next one runs only when one is not installed. */
function unmountCommands(localPath: string): Array<[string, string[]]> {
  if (process.platform === 'darwin') return [['diskutil', ['unmount', 'force', localPath]], ['umount', [localPath]]];
  return [['fusermount', ['-u', localPath]], ['fusermount3', ['-u', localPath]], ['umount', [localPath]]];
}

/**
 * Unmount the filesystem at `localPath`, then check the OS mount table. Throws while the path
 * is still mounted (busy: an open file, a shell inside it), and in that case leaves rclone
 * running. On Windows WinFsp unmounts when rclone exits, so rclone is stopped instead.
 */
async function detachMountpoint(localPath: string, pid: number | null): Promise<void> {
  if (process.platform === 'win32') {
    if (pid !== null) {
      try { process.kill(pid, 'SIGTERM'); } catch { /* pid may be gone */ }
    }
    return;
  }
  let failure: string | null = 'no unmount command (fusermount, fusermount3, umount) is installed';
  for (const [cmd, args] of unmountCommands(localPath)) {
    try {
      await execFile(cmd, args, { timeout: 5000 });
      failure = null;
      break;
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { stderr?: string };
      if (e.code === 'ENOENT') continue;
      failure = (typeof e.stderr === 'string' && e.stderr.trim()) || e.message;
      break;
    }
  }
  const mounted = await mountTableHas(localPath);
  // The mount table decides; when it cannot be read, a successful unmount command does.
  if (mounted === false || (mounted === null && failure === null)) return;
  throw new Error(
    `${localPath} is still mounted${failure ? ` (${failure})` : ''}: ` +
      'close what is using it (a shell or editor inside it, a running program) and unmount again',
  );
}

/**
 * Stop a foreground mount: unmount, stop rclone, remove the record. One run at a time; after a
 * failure (the mount is busy) a later call tries again.
 */
function makeForegroundStop(
  child: ChildProcess,
  id: string,
  home: string | undefined,
  localPath: string,
  recordWritten: Promise<void>,
): () => Promise<void> {
  let running: Promise<void> | null = null;
  const run = async (): Promise<void> => {
    await recordWritten;
    const exited = new Promise<void>((res) => {
      if (child.exitCode !== null || child.signalCode !== null) return res();
      child.once('exit', () => res());
    });
    await detachMountpoint(localPath, child.pid ?? null);
    if (child.exitCode === null && child.signalCode === null) {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
    }
    await Promise.race([exited, sleep(10000)]);
    await deleteState(id, home);
  };
  return () => {
    if (!running) {
      running = run();
      running.catch(() => { running = null; });
    }
    return running;
  };
}

/**
 * Per-mount signal handler. Each foreground mount installs its own
 * handler so concurrent programmatic mounts both clean up on SIGINT.
 * The previous singleton design dropped cleanup for the 2nd+ mount.
 *
 * The process exits once the mount is stopped, with `process.exitCode` (the CLI sets 130 /
 * 143; 0 when nothing set it), or 1 when the mount could not be unmounted. A second signal
 * exits at once.
 */
/** Foreground mounts whose stop a signal started and that have not settled; the last one exits. */
const signalStops = { pending: 0, failed: false };

function installSignalHandlers(stop: () => Promise<void>, localPath: string): (...args: unknown[]) => void {
  let signalled = false;
  const handler = (..._args: unknown[]): void => {
    if (signalled) {
      process.stderr.write(`hoody mount: exiting before ${localPath} was unmounted; it may still be mounted (hoody unmount ${localPath})\n`);
      process.exit();
    }
    signalled = true;
    // Every mount's handler runs for the same signal before any stop settles, so the process
    // exits once all of them have finished, not when the quickest one has.
    signalStops.pending++;
    stop()
      .catch((err: unknown) => {
        signalStops.failed = true;
        process.stderr.write(`hoody mount: ${(err as Error).message}. It is left mounted; unmount it later with hoody unmount ${localPath}\n`);
      })
      .finally(() => {
        if (--signalStops.pending > 0) return;
        const failed = signalStops.failed;
        signalStops.failed = false;
        if (failed) {
          process.exitCode = 1;
          process.exit(1);
        } else {
          process.exit();
        }
      });
  };
  process.on('SIGINT', handler);
  process.on('SIGTERM', handler);
  process.on('SIGHUP', handler);
  // Ctrl-Break on Windows; the CLI's lock handler only records 149 for it while a mount runs.
  if (process.platform === 'win32') process.on('SIGBREAK' as NodeJS.Signals, handler);
  return handler;
}

function uninstallSignalHandlers(handler: (...args: unknown[]) => void): void {
  process.removeListener('SIGINT', handler);
  process.removeListener('SIGTERM', handler);
  process.removeListener('SIGHUP', handler);
  if (process.platform === 'win32') process.removeListener('SIGBREAK' as NodeJS.Signals, handler);
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

function normalizeSubpath(subpath: string | undefined): string {
  if (!subpath || subpath === '/') return '';
  let s = subpath.replace(/^\/+/, '').replace(/\/+$/, '');
  if (s.includes('..')) throw new Error(`subpath ${JSON.stringify(subpath)} contains '..' (path traversal not allowed)`);
  return s.split('/').map(encodeURIComponent).join('/');
}

function extractContainerIdFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const m = u.hostname.match(/^[a-z0-9]+-([a-z0-9]+)-/i);
    if (m) return m[1]!;
  } catch {
    // ignore
  }
  return '';
}

/**
 * Parse a CLI target like "abc123" or "abc123:/path" or "https://..." into
 * a MountTarget. Disambiguation:
 *   - starts with http:// or https://    → raw kit URL
 *   - matches /^[a-z0-9]{4,64}$/         → bare containerId
 *   - matches /^[a-z0-9]{4,64}:\/.*$/    → containerId:subpath
 *   - anything else (hostname:port, etc) → reject with hint
 */
export interface ParsedCliTarget {
  containerId: string | null;
  kitUrl: string | null;
  subpath: string;
}

export function parseCliTarget(input: string): ParsedCliTarget {
  if (/^https?:\/\//.test(input)) {
    const hashIdx = input.indexOf('#');
    if (hashIdx >= 0) throw new Error(`URL must not contain '#': ${input}`);
    return { containerId: null, kitUrl: stripTrailingSlash(input), subpath: '' };
  }
  const idOnly = input.match(/^([a-z0-9]{4,64})$/i);
  if (idOnly) return { containerId: idOnly[1]!, kitUrl: null, subpath: '' };
  const withSub = input.match(/^([a-z0-9]{4,64}):\/(.*)$/i);
  if (withSub) return { containerId: withSub[1]!, kitUrl: null, subpath: withSub[2] ?? '' };
  throw new Error(
    `cannot parse mount target ${JSON.stringify(input)}: ` +
      'expected <containerId>, <containerId>:/path, or https://...',
  );
}

export { homedir as _homedir };
