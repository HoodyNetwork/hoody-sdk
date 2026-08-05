> _**SDK skill · `files` namespace** · ~30,097 tokens · hoody-sdk v1.0.0-beta.11_

# `files` — container filesystem over HTTP, with automatic Git-like change history

## Purpose

**Default surface: the container's own filesystem, exposed over HTTP — with optional automatic mutation journaling when the kit is started with `--journal-path`.** Read, write, copy, move, delete, stat, chmod, list, glob, grep, archive-preview/extract, fetch URLs into the FS, resumable upload — all on absolute container paths (`/workspace/main.py`, `/etc/hostname`, `/hoody/databases/foo.db`). No backend flag needed.

**Headline feature when journaling is on — automatic change history (think Git, but for every file write).** With the journal enabled, every `PUT` / `PATCH` / `DELETE` / `MOVE` / `COPY` is appended to a per-container mutation log: monotonic sequence number, timestamp, path, op, size, hash. **You never lose a previous version of a journaled path.** The journal lets you:

- **Time-travel a single file** — `files.get` `?revision=<seq>` or `?at=<unix-ms>` returns the bytes as they were at that point.
- **List a file's history** — `files.get` `?history=1` walks every revision of the path.
- **Diff between revisions** — `files.get` `?diff=1&from_seq=<N>` returns a unified diff between revision `N` and current.
- **Replay / audit** — `journal.query` `?path=<p>&after_id=<seq>` streams every operation since seq `N`. Run `journal.flush` to force-persist before querying for the absolute latest.
- **Cross-replicate** — pipe the journal into another container as an event source for mirroring / fan-out / append-only sync.

When provisioned with `--journal-path`, no per-write setup is needed — every covered write is recorded (add `--allow-journal` to expose the journal query endpoints — history, revision, diff, stats, flush — over the API). Treat it as "always-on undo for the whole filesystem." Journaling is ON in the standard `hoody_kit: true` container image; raw kit deployments without those flags will accept writes but skip recording.

**Optional add-ons (per-request, opt-in):**
- **Remote backends** — append `?backend=<id>` (or `?type=<rclone-type>`) to operate against any of the 60+ rclone backend types you've connected (Mega, SFTP, S3, GDrive, Dropbox, Backblaze B2, WebDAV, Git, …) instead of the local FS. Requires `--allow-remote` server-side flag. Note: the journal records local-FS mutations; remote-backend ops go to the remote and aren't replayable from the journal.
- **FUSE mounts** — `mounts.create` to surface a remote backend AS a path in the local FS. Same `--allow-remote` requirement.
- **chmod / chown** — Unix-only, requires `--allow-chmod` / `--allow-chown` server flags.

## When to use

- **Local container FS (the 90% case)** — CRUD, archive entry / extract, cross-binary search (glob, grep), download a URL into a path, resumable upload. Local works out of the box.
- **Recover / inspect a previous version of any file** — `?history=1`, `?revision=<seq>`, `?at=<unix-ms>`, `?diff=1&from_seq=<N>`. Always available because every write is journaled.
- **Audit / replay every change to the filesystem** — `journal.query` for the full event stream (sequence, timestamp, path, op, size, hash).
- **Remote cloud / SSH / S3 / Git** — append `?backend=<id>` on `files.get` / `files.put` / `files.delete` / `files.patchApi` / `files.operate` calls (the methods that accept a `backend` option). The same endpoints transparently target the remote.
- **FUSE-mount a remote into the local FS** — when downstream code needs to read the remote as a regular path (`/mnt/s3/…`).

## When NOT to use

Run binaries -> `terminal`/`exec`, live events -> `watch`, TS/JS gen -> `exec`, indexed queries -> `sqlite`, traffic logs -> `proxyLogs`.

## Prerequisites

- **For plain read/write/stat/list (the default)**: nothing beyond the kit URL. Paths are absolute container paths; the namespace is not workspace-scoped, so use `/workspace/...`, `/home/user/...`, etc.
- **For glob / grep**: kit started with `--allow-search` / `--allow-grep` (403 "not allowed" otherwise; enabled in the standard hoody_kit container image).
- **For remote backends** (`?backend=` / `?type=` / FUSE mounts): the kit must be started with `--allow-remote`.
- **For chmod / chown**: kit started with `--allow-chmod` / `--allow-chown`, and the container is Unix.
- Cross-host file propagation (`/external/...` paths that route to another container) goes via SSHFS — that travels by container-to-container, not via this kit's API surface.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Read, search, write

1. `files.get` `?stat`/`?lines=10-50`.
2. `files.glob` `?pattern=**/*.ts`; `files.grep` `?pattern=TODO&context=2` (local only).
3. `files.put` `?append=true`; `files.delete`.

### 2. Download, extract, FUSE-mount

1. `downloads.fetch` `GET /{dir}?download=<url>`; `downloads.listActive` to poll.
2. `archives.preview` `?preview`; `archives.extract` `?extract=src/**&dest=work-src` (`?dest=` MUST be relative).
3. `backends.connectS3` (60+ `connect*`) -> `files.get('/remote/path', { backend: id })` for one-shot reads OR `mounts.create` -> `files.listDirectory('/hoody/mounts/...')` for a regular FS view -> `mounts.unmount`/`backends.disconnect`. (`files.listDirectory` itself has no `backend` option; `files.get`/`files.put`/`files.delete` do.)

### 3. Journal time-travel + TUS-like upload

1. `files.get` `?history=1`, `?revision=N`/`?at=<unix-ms>`, `?diff=1&from_seq=<N>`.
2. `journal.query` `?path=<p>&after_id=<seq>`; `journal.flush` first.
3. Resumable: `PUT /{path}` first chunk, then `PATCH /{path}` `X-Update-Range: append` per chunk.

## Quirks & gotchas

- Reserved sub-prefixes (stat, chmod, chown, realpath, glob, grep, copy, move, append) dispatch by URL prefix in `api/files.rs`, each scoped to a specific HTTP method (stat/grep/glob/realpath→GET, chmod/chown→PATCH, copy/move→POST, append→PUT) to prevent method bleeding -- so `DELETE /api/v1/files/stat/foo` does NOT trigger the stat dispatcher; it removes the literal path `/stat/foo`. (`/api/v1/files/health` is intercepted by a separate top-level route in `api/mod.rs:106` before this dispatcher sees it.)
- `glob`/`grep`/`realpath`/`?lines=` local-only; `?backend=` -> 400.
- `?backend=` and `?type=` need `--allow-remote`.
- `chmod`/`chown` Unix-only + `--allow-chmod`/`--allow-chown`.
- WebDAV verbs on `/{path}`: PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK, CHECKAUTH, LOGOUT.
- Cross-host propagation is SSHFS-only via `/external/...`.
- `realpath` follows symlinks even where blocked.
- **Resumable upload PATCH must use the WebDAV root route (`PATCH /{path}`), NOT `PATCH /api/v1/files/{path}`** — the api/v1 PATCH expects a JSON body and rejects raw bytes with `400 Invalid JSON body`. The WebDAV form takes `X-Update-Range: append` — or an HTTP-Range offset `bytes=<start>-<end>` (a Content-Range-style `/<size>` suffix is REJECTED with `400 Invalid X-Update-Range Header`) — plus the raw body, and returns `204 No Content` on success. An explicit offset must fall INSIDE the current file, so it can only overwrite, never extend past EOF; use `append` to extend. [live-verified]
- **Archive `?dest=` MUST be relative** (e.g. `?dest=extracted`), not absolute — sending `?dest=/abs/path` returns `400 Absolute destination path not allowed`. The directory is created relative to the archive's containing dir. [live-verified]
- **`?preview` query value matters** — pass `?preview` empty (no `=…`) for a full archive listing; `?preview=true` is parsed as the entry name `true` and returns `404 Entry not found in archive: true`. Same trap on `?contents`. [live-verified]
- **Bare `?extract_file=` is unhandled by the kit's GET dispatcher** — the request falls through to "send the raw archive file" and you get the **whole archive's bytes**, not the selected entry. The generated SDK and CLI work around this by ALSO sending `?extract=` — when both query params are present, the `extract` branch runs (writes to disk under `?dest=`). The OpenAPI-only `?extract_file=` form is effectively dead.
- **Journal default `max_file_size` is 2 MiB; oversized files still produce a journal entry with hash + size, but the body bytes are not stored**.
- **`journal.is_excluded(<relative-path>)` gates which paths are recorded.** Built-in dev-dir excludes (`node_modules`, `target`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `__pycache__`, `.venv`, `venv`, `env`, `__pypackages__`, `.tox`, `.nox`, `bower_components`, …) skip journaling unless you pass `--no-journal-ignore-dev-dirs`. `.git` is always excluded regardless of that flag (separate hardcoded check, not part of the toggleable list). Custom excludes via `--journal-exclude`. This is why "I wrote to `node_modules/x` and saw no journal entry" is expected.
- **Journal does NOT cover everything by default.** Live behaviour observed: a fresh `PUT` (create) and an overwriting `PUT` (write) on `/home/user/...` produce entries; URL downloads (`?download=`) and archive extraction are NOT journaled — those write through paths with no journal hook. `chmod`, `chown`, `touch`, `?append=true` and copy/move ARE recorded. Always call `journal.flush` then `journal.query` (or `?history=1`) to inspect what was actually recorded — don't assume coverage. [live-verified]
- **Built-in dev-dir exclude list always skips journaling** for `node_modules`, `__pycache__`, `.venv`, `target`, `.next`, `.nuxt`, etc. — even on `/home/user/...` paths. Disable these with `--no-journal-ignore-dev-dirs` at kit start. `.git` is hardcoded to ALWAYS be excluded and stays excluded even with `--no-journal-ignore-dev-dirs`.
- **`/tmp/...` paths appear NOT to be journaled** at all (live-verified — 0 entries for `/tmp/files-examples-*` writes). Use `/home/user/...` (or another non-`/tmp` path) when you need history.
- **`HEAD /api/v1/files/{path}` returns `405`**; the `getMetadata` operation in mappings is the WebDAV-style `HEAD /{path}` route (no `/api/v1/files/` prefix). Use `files.stat` (`GET /api/v1/files/stat/{path}`) for a JSON envelope instead. [live-verified]
- **`chown` to root is rejected** with `400 Cannot change ownership to root (UID 0)` (owner) or `400 Cannot change group to root (GID 0)` (group) — even if the kit has `--allow-chown`. Use a non-root user (`nobody`, `user`, …). [live-verified]
- **FUSE mount paths are confined to a configured mount-dir** (`/hoody/mounts` by default); arbitrary paths return `400 Mount path must be under the configured mount directory`. Override at kit start with `--mount-dir <path>`.
- **Listing-style query params (`?downloads`, `?download_history`, `?extractions`, `?extraction_history`) are honoured on the WebDAV root route, NOT on `/api/v1/files/...`** — calling `GET /api/v1/files/<dir>?downloads` returns a regular directory listing (the query is ignored). Use `GET /<dir>?downloads` (or `GET /?download_history` for the global feed). [live-verified]
- **`hoody-files` test container goes to sleep** between requests on a quiet kit; first hit may return `502` from the proxy with a `<!DOCTYPE html>…Error 502` body. Retry 2-3× with a few seconds backoff and the kit wakes up. [live-verified]
- **Mount the whole FS as a local drive on the USER's machine (client-side WebDAV).** Because the kit serves a WebDAV API at its URL root, the container's files mount natively as a drive/folder with no install: on **Windows** *Map network drive* to `https://{P}-{C}-files-1.{N}.containers.hoody.com/`, on **macOS** Finder → *Connect to Server* to the same URL; cross-platform/scripted, via `hoody mount <containerId> <localDir>` (WebDAV-backed remote mount; `--read-only`/`--background`/`--auth-token`/`--auth-password`/`--auth-ip` flags). This is the inverse of the server-side FUSE `mounts.*` family (which mounts remote backends INTO the container).

## Common errors

- 400 not supported with remote backends -- drop `?backend=`.
- 400 Cannot combine realpath with other ops.
- 400 Cannot preview a directory as archive.
- 400 Unknown operation -- POST needs one query op.
- 400 Missing query or body -- PATCH needs op or body.

## Related namespaces

- `terminal` -- run binaries.
- `exec` -- TS/JS gen.
- `watch` -- live events.
- `sqlite` -- indexed queries.
- `browser`/`curl` -- scripted HTTP.

## Examples

Every step in every example was live-tested against a real `files-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first. Paths under `/tmp/...` are NOT journaled by default — examples that need history use `/home/user/...`.

### 1. Read a file — full bytes, stat envelope, and a slice of lines

**Goal:** inspect an unknown text file three ways: get its metadata, peek the raw bytes, and slice an arbitrary line range without pulling the whole thing.

**Step 1 — stat first.** `files.stat` returns size, owner/group, octal permissions, mtime, plus a `revisions` count (how many journal entries exist for this path). Use this BEFORE downloading a file you don't know the size of.

```typescript
const s = await client.files.stat('/etc/hostname');
console.log(s.data!.size, s.data!.permissions);
```
**Step 2 — line slice.** `?lines=2-3` returns just lines 2 through 3 inclusive. Local-FS only (rejected with `400` when combined with `?backend=`).

```typescript
const slice = await client.files.get('/var/log/syslog', { lines: '2-3' });
```
**Step 3 — full body.** No query params, raw bytes (or `Content-Type: application/octet-stream` for binaries).

```typescript
const body = await client.files.get('/etc/hostname');
```
### 2. Find files then grep them — TODO scan across a tree

**Goal:** find every `.md` file under a directory, then grep them for `TODO` with surrounding context. Both ops are local-FS only.

**Step 1 — glob.** `pattern` matches relative to `path`; obeys `.gitignore` unless `no_ignore=true`.

```typescript
const r = await client.files.glob('/home/user', { pattern: '**/*.md' });
const paths = r.data!.entries.map(e => e.name);
```
**Step 2 — grep with context.** `?glob=` filters which files grep looks at; `?context=2` mirrors `grep -C 2`.

```typescript
const m = await client.files.grep('/home/user', { pattern: 'TODO', ignore_case: true, glob: '**/*.md', context: 2 });
console.log(m.data!.total_matches, m.data!.matches.length);
```
### 3. Resumable upload — split a payload into PUT-then-PATCH-append chunks

**Goal:** push a 16 MiB payload as 8 MiB chunks. Many CDN/proxy combos cap a single body at 10 MiB; chunked upload sidesteps that.

**Step 1 — first chunk via PUT.** Creates the file with the first slab.

```typescript
import { readFileSync } from 'fs';
await client.files.put('/home/user/upload-test.bin', readFileSync('/tmp/chunk1.bin'));
```
**Step 2 — append remaining chunks.** Send `PATCH /<path>` (the WebDAV root route, NOT `/api/v1/files/...` — that one expects JSON and 400s on raw bytes). Header `X-Update-Range: append` says "concatenate". Returns `204 No Content`.

```typescript
await client.files.patch('/home/user/upload-test.bin', readFileSync('/tmp/chunk2.bin') as any, { XUpdateRange: 'append' });
const s = await client.files.stat('/home/user/upload-test.bin');
```
**Step 3 — same shape for resume after a network drop.** Re-append the missing chunk with `X-Update-Range: append` if you tracked the cursor client-side. An explicit `bytes=<start>-<end>` offset (no `/<total>` suffix — that is rejected) only overwrites INSIDE the existing file and cannot extend it, so it is not a resume mechanism. The generated **SDK and CLI currently expose only `X-Update-Range: append`**; explicit byte ranges need raw HTTP.

### 4. Time-travel a single file — history → revision N → diff

**Goal:** roll back a config file by reading an earlier revision, comparing it to current, then writing the chosen revision back. Journal tracks every PUT under `/home/user/...` (NOT `/tmp/...` — see Quirks).

**Step 1 — write two revisions.**

```typescript
const path = '/home/user/config.toml';
await client.files.put(path, Buffer.from('verbose = false'));
await new Promise(r => setTimeout(r, 1000));
await client.files.put(path, Buffer.from('verbose = true'));
await client.files.journal.flush();
```
**Step 2 — list history.** `?history=1` returns the per-revision log: each entry has `seq`, `op` (`"create"` / `"write"` / `"delete"` / `"moved_from"`/`"moved_to"` / etc. — see Example 5 for the full enum), `ts`, hashes, and size deltas.

```typescript
// Empty-string sentinel for valueless query flags — generated SDK rejects '1'.
const h = await client.files.get(path, { history: '' });
```
**Step 3 — fetch revision N.** `?revision=1` returns the bytes of that point-in-time. (Use `?at=<unix-ms>` for an instant.)

```typescript
const old = await client.files.get(path, { revision: 1 });
const diff = await client.files.get(path, { diff: '', from_seq: 1 });
```
**Step 4 — restore by writing rev1 bytes back.** PUT the body returned by `?revision=1`.

### 5. Audit — stream every mutation since seq N via the journal

**Goal:** wire a SIEM / alerting pipeline. Get every FS mutation since the last cursor, including hashes for tamper detection. Don't forget `journal.flush` first.

**Step 1 — flush so buffered journal writes are on disk.**

```typescript
await client.files.journal.flush();
```
**Step 2 — query since cursor.** `after_id` is the last `id` you've seen. `op` enum is `"create"` / `"write"` / `"append"` / `"delete"` / `"touch"` / `"moved_from"` / `"moved_to"` / `"copied_from"` / `"copied_to"` / `"dir_moved_from"` / `"dir_moved_to"` / `"dir_copied_from"` / `"dir_copied_to"` / `"dir_deleted"` / `"mkdir"` / `"chmod"` / `"chown"` / `"gap"` (no bare `"move"`/`"copy"` — use the directional `"moved_from"`/`"moved_to"` etc. pair).

```typescript
const r = await client.files.journal.query({ limit: 200, after_id: 0 });
const next = r.data!.next_after_id;
```
**Step 3 — health check.** Watch `journal.getStats` for `writer_healthy:false`, `parse_failures`, or `skipped_overflow > 0` — any of those means the audit trail is degraded.

```typescript
const s = await client.files.journal.getStats();
```
### 6. Download a URL straight into the FS (no curl, no wget needed)

**Goal:** pull an asset from the public internet into a container path. The kit handles the actual HTTP fetch — useful for sandboxed containers without outbound HTTP libs.

**Step 1 — fire-and-poll.** `GET /<directory>?download=<url>&filename=<name>` (URL-encode the URL). Returns a `download_id` for tracking.

```typescript
const r = await client.files.downloads.fetch('/home/user/inbox', {
  download: 'https://httpbin.org/robots.txt',
  filename: 'robots.txt',
  timeout: 15,
});
```
**Step 2 — list active.** `?downloads` ONLY works on the WebDAV root route — `GET /api/v1/files/<dir>?downloads` ignores the flag and returns a normal listing (live-verified).

```typescript
await client.files.downloads.listActive('/home/user/inbox', { downloads: '' });
await client.files.downloads.getHistory({ download_history: '' });
```
### 7. Archive workflow — preview, then selective extract

**Goal:** extract just one subpath of a zip without unpacking the whole archive.

**Step 1 — preview** to see what's inside. `?preview` MUST be empty — `?preview=true` is parsed as the entry name `true` and 404s (live-verified).

```typescript
const p = await client.files.archives.preview('/home/user/inbox/hello.zip');
```
**Step 2 — extract a subset.** `?extract=<glob>` selects entries (empty = all). `?dest=` MUST be relative — absolute paths return `400 Absolute destination path not allowed`. Destination is created relative to the archive's parent dir.

```typescript
await client.files.archives.extract('/home/user/inbox/hello.zip', { extract: 'Hello-World-master/', dest: 'extracted' });
```
**Step 3 — extract a single file to disk.** Pass BOTH `?extract=<glob>` and `?extract_file=<path>` (the bare `?extract_file=` form falls through to "send whole archive"). The kit writes the matched entry under `?dest=` (or alongside the archive if omitted).

```typescript
// extract-file writes the chosen entry under `dest` and returns an extraction
// response; to get the bytes back, follow up with files.get(`${dest}/<entry>`).
const extracted = await client.files.archives.extractFile('/home/user/inbox/hello.zip', { extract: 'Hello-World-master/README', dest: 'extracted' });
```
### 8. Cross-directory copy + move + chmod (a one-shot deploy)

**Goal:** stage a config in a working dir, copy to the target, set permissions, move the staging file to a backup folder. Uses POST against the copy/move reserved-prefix routes (`/api/v1/files/copy/...`, `/move/...`) and PATCH for chmod/chown (`/api/v1/files/chmod/...`, `/chown/...`).

**Step 1 — copy.** Both `copy_to` and (for move) `move_to` are **query params**, NOT body fields. Add `?overwrite=true` to allow replacing an existing destination.

```typescript
await client.files.copy('/home/user/staging/app.toml', { copy_to: '/etc/myapp/app.toml', overwrite: 'true' });
```
**Step 2 — chmod.** Octal as a query param (`?chmod=600`). Requires `--allow-chmod` at kit start; Unix-only.

```typescript
await client.files.chmod('/etc/myapp/app.toml', { chmod: '600' });
```
**Step 3 — move staging → archive.** Same pattern as copy but no overwrite by default; `?move_to=` is required.

```typescript
await client.files.move('/home/user/staging/app.toml', { move_to: '/home/user/archive/app.toml' });
```
### 9. Connect a remote backend, mount it as a path, list through both surfaces

**Goal:** attach a remote backend (here: `local` for portability — swap in `s3`/`sftp`/`drive` etc.) and surface it as a regular FS path via FUSE. Requires `--allow-remote` at kit start.

**Step 1 — connect.** Each backend has its own `POST /api/v1/backends/<type>` with type-specific config. Returns `{id, type, vfs_backend_type}`.

```typescript
const conn = await client.files.backends.connectLocal({ description: 'local-passthrough' });
const bid = conn.data!.id;
await client.files.backends.testConnection(bid);
```
**Step 2 — mount.** `mount_path` MUST sit under the kit's configured mount-dir (default `/hoody/mounts/...`) — arbitrary paths return `400 Mount path must be under the configured mount directory`.

```typescript
const m = await client.files.mounts.create({
  backend_id: bid,
  label: 'local-mount',
  mount_path: '/hoody/mounts/local-test',
});
const mid = m.data!.id;
```
**Step 3 — read through the mount as a regular path.**

```typescript
await client.files.listDirectory('/hoody/mounts/local-test');
```
**Step 4 — tear down** (in order: unmount, then disconnect).

```typescript
await client.files.mounts.unmount(mid);
await client.files.backends.disconnect(bid);
```
### 10. Bulk delete a tree atomically — and verify nothing leaked

**Goal:** wipe a working directory and every file under it, then confirm via journal + listing that nothing remains.

**Step 1 — DELETE on the directory.** `DELETE /api/v1/files/<dir>` removes recursively. (Reserved-prefix trap: a path like `/api/v1/files/stat/foo` is interpreted as removing `/stat/foo`, NOT a stat call. Always use absolute container paths.)

```typescript
await client.files.delete('/home/user/files-examples-cleanup');
```
**Step 2 — verify.** A `404` from `files.stat` is what you want.

```typescript
try { await client.files.stat('/home/user/files-examples-cleanup'); }
catch (e: any) { if (e.status === 404) console.log('gone'); else throw e; }
```
**Step 3 — confirm via journal.** A successful tree-delete emits `op: "delete"` (or `op: "dir_deleted"` per child). Flush first.

```typescript
await client.files.journal.flush();
const r = await client.files.journal.query({ path: '/home/user/files-examples-cleanup', limit: 10 });
```

## Reference

**Accessor:** `client.files`  |  **Import:** `import * as files from 'hoody-sdk/files'`

### `client.files.archives` (8) — Archive operations - extract, preview, download directories as ZIP

#### `downloadAsZip` — Download directory as ZIP

```typescript
client.files.archives.downloadAsZip(directory: string, zip: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `directory` | `string` | path | Yes |  |
| `zip` | `string` | query | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /{directory}?zip`
**CLI:** `hoody files downloads zip`

---

#### `extract` — Extract archive

```typescript
client.files.archives.extract(archive: string, extract: string, dest?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `archive` | `string` | path | Yes |  |
| `extract` | `string` | query | Yes | Empty for full extraction; path for selective (e.g. "src/" or "lib/") |
| `dest` | `string` | query | No | Destination directory name (default: archive name) |

**Returns:** `files_ExtractionResult`  |  **HTTP:** `GET /{archive}?extract`
**CLI:** `hoody files extractions create`

---

#### `extractFile` — Extract file from archive

```typescript
client.files.archives.extractFile(archive: string, extract: string, dest?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `archive` | `string` | path | Yes | Path to archive file |
| `extract` | `string` | query | Yes | Path of the file or directory inside the archive to extract (e.g. "src/" or "lib/") |
| `dest` | `string` | query | No | Destination directory name (default: archive name) |

**Returns:** `files_ExtractionResult`  |  **HTTP:** `GET /{archive}?extract_file`
**CLI:** `hoody files extractions extract-file`

---

#### `getHistory` — Extraction history

```typescript
client.files.archives.getHistory(extraction_history: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `extraction_history` | `string` | query | Yes |  |

**Returns:** `files_ExtractionHistory`  |  **HTTP:** `GET /?extraction_history`
**CLI:** `hoody files extractions history`

---

#### `listActive` — List active extractions

```typescript
client.files.archives.listActive(extractions: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `extractions` | `string` | query | Yes |  |

**Returns:** `files_ActiveExtractions`  |  **HTTP:** `GET /?extractions`
**CLI:** `hoody files extractions active`

---

#### `listGlobal` — List active extractions

```typescript
client.files.archives.listGlobal()
```

**Returns:** `files_ActiveExtractions`  |  **HTTP:** `GET /api/v1/extractions`
**CLI:** `hoody files extractions all`

---

#### `preview` — Preview archive contents or read file

```typescript
client.files.archives.preview(archive: string, preview?: string, contents?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `archive` | `string` | path | Yes | Path to archive file |
| `preview` | `string` | query | No | Empty value lists archive contents; non-empty value reads a specific file from the archive (alias: ?contents) |
| `contents` | `string` | query | No | Alias for ?preview |

**Returns:** `files_ArchiveContents`  |  **HTTP:** `GET /{archive}?preview`
**CLI:** `hoody files archive preview`

---

#### `viewFile` — View file from archive

```typescript
client.files.archives.viewFile(archive: string, preview: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `archive` | `string` | path | Yes | Path to archive file |
| `preview` | `string` | query | Yes | Path of the file inside the archive to view (e.g. "src/" or "README.md") |

**Returns:** `any`  |  **HTTP:** `GET /{archive}?view_file`
**CLI:** `hoody files archive view`

---

### `client.files.authentication` (2) — Authentication operations - check auth status and logout

#### `checkAuth` — Check authentication status

```typescript
client.files.authentication.checkAuth(path: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `CHECKAUTH /{path}`

---

#### `logout` — Clear authentication

```typescript
client.files.authentication.logout(path: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |

**Returns:** `void`  |  **HTTP:** `LOGOUT /{path}`

---

### `client.files.backends` (67) — Backend management - connect, list, test, and disconnect remote cloud storage backends

#### `connectAlias` — Connect to alias backend

```typescript
client.files.backends.connectAlias(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ description: string="", remote*: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/alias`
**CLI:** `hoody files backends connect alias`

---

#### `connectAzureblob` — Connect to azureblob backend

```typescript
client.files.backends.connectAzureblob(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ access_tier: string="", account: string="", archive_tier_delete: bool=false, chunk_size: string="4194304", client_certificate_password: string="", client_certificate_path: string="", client_id: string="", client_secret: string="", client_send_certificate_chain: bool=false, delete_snapshots: "" | "include" | "only"="", description: string="", directory_markers: bool=false, disable_checksum: bool=false, disable_instance_discovery: bool=false, encoding: string="21078018", endpoint: string="", env_auth: bool=false, key: string="", list_chunk: int=5000, memory_pool_flush_time: int=60, memory_pool_use_mmap: bool=false, msi_client_id: string="", msi_mi_res_id: string="", msi_object_id: string="", no_check_container: bool=false, no_head_object: bool=false, password: string="", public_access: "" | "blob" | "container"="", sas_url: string="", service_principal_file: string="", tenant: string="", upload_concurrency: int=16, upload_cutoff: string="", use_az: bool=false, use_emulator: bool=false, use_msi: bool=false, username: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/azureblob`
**CLI:** `hoody files backends connect azureblob`

---

#### `connectAzurefiles` — Connect to azurefiles backend

```typescript
client.files.backends.connectAzurefiles(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ account: string="", chunk_size: string="4194304", client_certificate_password: string="", client_certificate_path: string="", client_id: string="", client_secret: string="", client_send_certificate_chain: bool=false, connection_string: string="", description: string="", encoding: string="54634382", endpoint: string="", env_auth: bool=false, key: string="", max_stream_size: string="10737418240", msi_client_id: string="", msi_mi_res_id: string="", msi_object_id: string="", password: string="", sas_url: string="", service_principal_file: string="", share_name: string="", tenant: string="", upload_concurrency: int=16, use_msi: bool=false, username: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/azurefiles`
**CLI:** `hoody files backends connect azurefiles`

---

#### `connectB2` — Connect to b2 backend

```typescript
client.files.backends.connectB2(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ account*: string="", chunk_size: string="100663296", copy_cutoff: string="4294967296", description: string="", disable_checksum: bool=false, download_auth_duration: int=604800, download_url: string="", encoding: string="50438146", endpoint: string="", hard_delete: bool=false, key*: string="", lifecycle: int=0, memory_pool_flush_time: int=60, memory_pool_use_mmap: bool=false, test_mode: string="", upload_concurrency: int=4, upload_cutoff: string="209715200", version_at: string="0001-01-01T00:00:00Z", versions: bool=false }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/b2`
**CLI:** `hoody files backends connect b2`

---

#### `connectBox` — Connect to box backend

```typescript
client.files.backends.connectBox(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ access_token: string="", auth_url: string="", box_config_file: string="", box_sub_type: "user" | "enterprise"="user", client_credentials: bool=false, client_id: string="", client_secret: string="", commit_retries: int=100, description: string="", encoding: string="52535298", impersonate: string="", list_chunk: int=1000, owned_by: string="", root_folder_id: string="0", token: string="", token_url: string="", upload_cutoff: string="52428800" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/box`
**CLI:** `hoody files backends connect box`

---

#### `connectCache` — Connect to cache backend

```typescript
client.files.backends.connectCache(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ chunk_clean_interval: int=60, chunk_no_memory: bool=false, chunk_path: string="/home/user/.cache/hoody-vfs/cache-backend", chunk_size: "1M" | "5M" | "10M"="5242880", chunk_total_size: "500M" | "1G" | "10G"="10737418240", db_path: string="/home/user/.cache/hoody-vfs/cache-backend", db_purge: bool=false, db_wait_time: int=1, description: string="", info_age: "1h" | "24h" | "48h"=21600, plex_insecure: string="", plex_password: string="", plex_token: string="", plex_url: string="", plex_username: string="", read_retries: int=10, remote*: string="", rps: int=-1, tmp_upload_path: string="", tmp_wait_time: int=15, workers: int=4, writes: bool=false }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/cache`
**CLI:** `hoody files backends connect cache`

---

#### `connectChunker` — Connect to chunker backend

```typescript
client.files.backends.connectChunker(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ chunk_size: string="2147483648", description: string="", fail_hard: "true" | "false"=false, hash_type: "none" | "md5" | "sha1" | "md5all" | "sha1all" | "md5quick" | "sha1quick"="md5", meta_format: "none" | "simplejson"="simplejson", name_format: string="*.hoody-vfs_chunk.###", remote*: string="", start_from: int=1, transactions: "rename" | "norename" | "auto"="rename" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/chunker`
**CLI:** `hoody files backends connect chunker`

---

#### `connectCloudinary` — Connect to cloudinary backend

```typescript
client.files.backends.connectCloudinary(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ api_key*: string="", api_secret*: string="", cloud_name*: string="", description: string="", encoding: string="52543246", eventually_consistent_delay: int=0, upload_prefix: string="", upload_preset: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/cloudinary`
**CLI:** `hoody files backends connect cloudinary`

---

#### `connectCombine` — Connect to combine backend

```typescript
client.files.backends.connectCombine(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ description: string="", upstreams*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/combine`
**CLI:** `hoody files backends connect combine`

---

#### `connectCompress` — Connect to compress backend

```typescript
client.files.backends.connectCompress(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ description: string="", level: int=-1, mode: "gzip"="gzip", ram_cache_limit: string="20971520", remote*: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/compress`
**CLI:** `hoody files backends connect compress`

---

#### `connectCrypt` — Connect to crypt backend

```typescript
client.files.backends.connectCrypt(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ description: string="", directory_name_encryption: "true" | "false"=true, filename_encoding: "base32" | "base64" | "base32768"="base32", filename_encryption: "standard" | "obfuscate" | "off"="standard", no_data_encryption: "true" | "false"=false, pass_bad_blocks: bool=false, password*: string="", password2: string="", remote*: string="", server_side_across_configs: bool=false, show_mapping: bool=false, strict_names: bool=false, suffix: string=".bin" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/crypt`
**CLI:** `hoody files backends connect crypt`

---

#### `connectDrive` — Connect to drive backend

```typescript
client.files.backends.connectDrive(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ acknowledge_abuse: bool=false, allow_import_name_change: bool=false, alternate_export: bool=false, auth_owner_only: bool=false, auth_url: string="", chunk_size: string="8388608", client_credentials: bool=false, client_id: string="", client_secret: string="", copy_shortcut_content: bool=false, description: string="", disable_http2: bool=true, encoding: string="16777216", env_auth: "false" | "true"=false, export_formats: string="docx,xlsx,pptx,svg", fast_list_bug_fix: bool=true, formats: string="", impersonate: string="", import_formats: string="", keep_revision_forever: bool=false, list_chunk: int=1000, metadata_labels: "off" | "read" | "write" | "failok" | "read,write"="0", metadata_owner: "off" | "read" | "write" | "failok" | "read,write"="1", metadata_permissions: "off" | "read" | "write" | "failok" | "read,write"="0", pacer_burst: int=100, pacer_min_sleep: int=0, resource_key: string="", root_folder_id: string="", scope: "drive" | "drive.readonly" | "drive.file" | "drive.appfolder" | "drive.metadata.readonly"="", server_side_across_configs: bool=false, service_account_credentials: string="", service_account_file: string="", shared_with_me: bool=false, show_all_gdocs: bool=false, size_as_quota: bool=false, skip_checksum_gphotos: bool=false, skip_dangling_shortcuts: bool=false, skip_gdocs: bool=false, skip_shortcuts: bool=false, starred_only: bool=false, stop_on_download_limit: bool=false, stop_on_upload_limit: bool=false, team_drive: string="", token: string="", token_url: string="", trashed_only: bool=false, upload_cutoff: string="8388608", use_created_date: bool=false, use_shared_date: bool=false, use_trash: bool=true, v2_download_min_size: string="-1" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/drive`
**CLI:** `hoody files backends connect drive`

---

#### `connectDropbox` — Connect to dropbox backend

```typescript
client.files.backends.connectDropbox(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ auth_url: string="", batch_commit_timeout: int=600, batch_mode: string="sync", batch_size: int=0, batch_timeout: int=0, chunk_size: string="50331648", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="52469762", impersonate: string="", pacer_min_sleep: int=0, root_namespace: string="", shared_files: bool=false, shared_folders: bool=false, token: string="", token_url: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/dropbox`
**CLI:** `hoody files backends connect dropbox`

---

#### `connectFichier` — Connect to fichier backend

```typescript
client.files.backends.connectFichier(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ api_key: string="", cdn: bool=false, description: string="", encoding: string="52666494", file_password: string="", folder_password: string="", shared_folder: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/fichier`
**CLI:** `hoody files backends connect fichier`

---

#### `connectFilefabric` — Connect to filefabric backend

```typescript
client.files.backends.connectFilefabric(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ description: string="", encoding: string="50429954", permanent_token: string="", root_folder_id: string="", token: string="", token_expiry: string="", url*: "https://storagemadeeasy.com" | "https://eu.storagemadeeasy.com" | "https://yourfabric.smestorage.com"="", version: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/filefabric`
**CLI:** `hoody files backends connect filefabric`

---

#### `connectFilescom` — Connect to filescom backend

```typescript
client.files.backends.connectFilescom(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ api_key: string="", description: string="", encoding: string="60923906", password: string="", site: string="", username: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/filescom`
**CLI:** `hoody files backends connect filescom`

---

#### `connectFtp` — Connect to ftp backend

```typescript
client.files.backends.connectFtp(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ ask_password: bool=false, close_timeout: int=60, concurrency: int=0, description: string="", disable_epsv: bool=false, disable_mlsd: bool=false, disable_tls13: bool=false, disable_utf8: bool=false, encoding: "Asterisk,Ctl,Dot,Slash" | "BackSlash,Ctl,Del,Dot,RightSpace,Slash,SquareBracket" | "Ctl,LeftPeriod,Slash"="35749890", explicit_tls: bool=false, force_list_hidden: bool=false, host*: string="", idle_timeout: int=60, no_check_certificate: bool=false, no_check_upload: bool=false, pass: string="", port: int=21, shut_timeout: int=60, socks_proxy: string="", tls: bool=false, tls_cache_size: int=32, user: string="user", writing_mdtm: bool=false }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/ftp`
**CLI:** `hoody files backends connect ftp`

---

#### `connectGofile` — Connect to gofile backend

```typescript
client.files.backends.connectGofile(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ access_token: string="", account_id: string="", description: string="", encoding: string="323331982", list_chunk: int=1000, root_folder_id: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/gofile`
**CLI:** `hoody files backends connect gofile`

---

#### `connectGoogleCloudStorage` — Connect to google cloud storage backend

```typescript
client.files.backends.connectGoogleCloudStorage(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ access_token: string="", anonymous: bool=false, auth_url: string="", bucket_acl: "authenticatedRead" | "private" | "projectPrivate" | "publicRead" | "publicReadWrite"="", bucket_policy_only: bool=false, client_credentials: bool=false, client_id: string="", client_secret: string="", decompress: bool=false, description: string="", directory_markers: bool=false, encoding: string="50348034", endpoint: string="", env_auth: "false" | "true"=false, location: "" | "asia" | "eu" | "us" | "asia-east1" | "asia-east2" | "asia-northeast1" | "asia-northeast2" | …(36 values)="", no_check_bucket: bool=false, object_acl: "authenticatedRead" | "bucketOwnerFullControl" | "bucketOwnerRead" | "private" | "projectPrivate" | "publicRead"="", project_number: string="", service_account_credentials: string="", service_account_file: string="", storage_class: "" | "MULTI_REGIONAL" | "REGIONAL" | "NEARLINE" | "COLDLINE" | "ARCHIVE" | "DURABLE_REDUCED_AVAILABILITY"="", token: string="", token_url: string="", user_project: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/google-cloud-storage`
**CLI:** `hoody files backends connect google-cloud-storage`

---

#### `connectGooglePhotos` — Connect to google photos backend

```typescript
client.files.backends.connectGooglePhotos(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ auth_url: string="", batch_commit_timeout: int=600, batch_mode: string="sync", batch_size: int=0, batch_timeout: int=0, client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50348034", include_archived: bool=false, proxy: string="", read_only: bool=false, read_size: bool=false, start_year: int=2000, token: string="", token_url: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/google-photos`
**CLI:** `hoody files backends connect google-photos`

---

#### `connectHasher` — Connect to hasher backend

```typescript
client.files.backends.connectHasher(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ auto_size: string="0", description: string="", hashes: string, max_age: int=0, remote*: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/hasher`
**CLI:** `hoody files backends connect hasher`

---

#### `connectHdfs` — Connect to hdfs backend

```typescript
client.files.backends.connectHdfs(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ data_transfer_protection: "privacy"="", description: string="", encoding: string="50430082", namenode*: string, service_principal_name: string="", username: "root"="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/hdfs`
**CLI:** `hoody files backends connect hdfs`

---

#### `connectHidrive` — Connect to hidrive backend

```typescript
client.files.backends.connectHidrive(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ auth_url: string="", chunk_size: string="50331648", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", disable_fetching_member_count: bool=false, encoding: string="33554434", endpoint: string="https://api.hidrive.strato.com/2.1", root_prefix: "/" | "root" | ""="/", scope_access: "rw" | "ro"="rw", scope_role: "user" | "admin" | "owner"="user", token: string="", token_url: string="", upload_concurrency: int=4, upload_cutoff: string="100663296" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/hidrive`
**CLI:** `hoody files backends connect hidrive`

---

#### `connectHttp` — Connect to http backend

```typescript
client.files.backends.connectHttp(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ description: string="", headers: string, no_escape: bool=false, no_head: bool=false, no_slash: bool=false, url*: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/http`
**CLI:** `hoody files backends connect http`

---

#### `connectIclouddrive` — Connect to iclouddrive backend

```typescript
client.files.backends.connectIclouddrive(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ apple_id*: string="", client_id: string="d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d", cookies: string="", description: string="", encoding: string="50438146", password*: string="", trust_token: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/iclouddrive`
**CLI:** `hoody files backends connect iclouddrive`

---

#### `connectImagekit` — Connect to imagekit backend

```typescript
client.files.backends.connectImagekit(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ description: string="", encoding: string="117553486", endpoint*: string="", only_signed: bool=false, private_key*: string="", public_key*: string="", upload_tags: string="", versions: bool=false }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/imagekit`
**CLI:** `hoody files backends connect imagekit`

---

#### `connectInternetarchive` — Connect to internetarchive backend

```typescript
client.files.backends.connectInternetarchive(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ access_key_id: string="", description: string="", disable_checksum: bool=true, encoding: string="50446342", endpoint: string="https://s3.us.archive.org", front_endpoint: string="https://archive.org", secret_access_key: string="", wait_archive: int=0 }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/internetarchive`
**CLI:** `hoody files backends connect internetarchive`

---

#### `connectJottacloud` — Connect to jottacloud backend

```typescript
client.files.backends.connectJottacloud(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50431886", hard_delete: bool=false, md5_memory_limit: string="10485760", no_versions: bool=false, token: string="", token_url: string="", trashed_only: bool=false, upload_resume_limit: string="10485760" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/jottacloud`
**CLI:** `hoody files backends connect jottacloud`

---

#### `connectKoofr` — Connect to koofr backend

```typescript
client.files.backends.connectKoofr(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ description: string="", encoding: string="50438146", endpoint*: string="", mountid: string="", password*: string="", provider: "koofr" | "digistorage" | "other"="", setmtime: bool=true, user*: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/koofr`
**CLI:** `hoody files backends connect koofr`

---

#### `connectLinkbox` — Connect to linkbox backend

```typescript
client.files.backends.connectLinkbox(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ description: string="", token*: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/linkbox`
**CLI:** `hoody files backends connect linkbox`

---

#### `connectLocal` — Connect to local backend

```typescript
client.files.backends.connectLocal(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ case_insensitive: bool=false, case_sensitive: bool=false, copy_links: bool=false, description: string="", encoding: string="33554434", links: bool=false, no_check_updated: bool=false, no_clone: bool=false, no_preallocate: bool=false, no_set_modtime: bool=false, no_sparse: bool=false, nounc: "true"=false, one_file_system: bool=false, skip_links: bool=false, time_type: "mtime" | "atime" | "btime" | "ctime"="0", unicode_normalization: bool=false, zero_size_links: bool=false }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/local`
**CLI:** `hoody files backends connect local`

---

#### `connectMailru` — Connect to mailru backend

```typescript
client.files.backends.connectMailru(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ auth_url: string="", check_hash: "true" | "false"=true, client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50440078", pass*: string="", quirks: string="", speedup_enable: "true" | "false"=true, speedup_file_patterns: "" | "*" | "*.mkv,*.avi,*.mp4,*.mp3" | "*.zip,*.gz,*.rar,*.pdf"="*.mkv,*.avi,*.mp4,*.mp3,*.zip,*.gz,*.rar,*.pdf", speedup_max_disk: "0" | "1G" | "3G"="3221225472", speedup_max_memory: "0" | "32M" | "256M"="33554432", token: string="", token_url: string="", user*: string="", user_agent: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/mailru`
**CLI:** `hoody files backends connect mailru`

---

#### `connectMega` — Connect to mega backend

```typescript
client.files.backends.connectMega(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ debug: bool=false, description: string="", encoding: string="50331650", hard_delete: bool=false, pass*: string="", use_https: bool=false, user*: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/mega`
**CLI:** `hoody files backends connect mega`

---

#### `connectMemory` — Connect to memory backend

```typescript
client.files.backends.connectMemory(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ description: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/memory`
**CLI:** `hoody files backends connect memory`

---

#### `connectNetstorage` — Connect to netstorage backend

```typescript
client.files.backends.connectNetstorage(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ account*: string="", description: string="", host*: string="", protocol: "http" | "https"="https", secret*: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/netstorage`
**CLI:** `hoody files backends connect netstorage`

---

#### `connectOnedrive` — Connect to onedrive backend

```typescript
client.files.backends.connectOnedrive(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ access_scopes: "Files.Read Files.ReadWrite Files.Read.All Files.ReadWrite.All Sites.Read.All offline_access" | "Files.Read Files.Read.All Sites.Read.All offline_access" | "Files.Read Files.ReadWrite Files.Read.All Files.ReadWrite.All offline_access", auth_url: string="", av_override: bool=false, chunk_size: string="10485760", client_credentials: bool=false, client_id: string="", client_secret: string="", delta: bool=false, description: string="", disable_site_permission: bool=false, drive_id: string="", drive_type: string="", encoding: string="57386894", expose_onenote_files: bool=false, hard_delete: bool=false, hash_type: "auto" | "quickxor" | "sha1" | "sha256" | "crc32" | "none"="auto", link_password: string="", link_scope: "anonymous" | "organization"="anonymous", link_type: "view" | "edit" | "embed"="view", list_chunk: int=1000, metadata_permissions: "off" | "read" | "write" | "read,write" | "failok"="0", no_versions: bool=false, region: "global" | "us" | "de" | "cn"="global", root_folder_id: string="", server_side_across_configs: bool=false, tenant: string="", token: string="", token_url: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/onedrive`
**CLI:** `hoody files backends connect onedrive`

---

#### `connectOpendrive` — Connect to opendrive backend

```typescript
client.files.backends.connectOpendrive(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ chunk_size: string="10485760", description: string="", encoding: string="62007182", password*: string="", username*: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/opendrive`
**CLI:** `hoody files backends connect opendrive`

---

#### `connectOracleobjectstorage` — Connect to oracleobjectstorage backend

```typescript
client.files.backends.connectOracleobjectstorage(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ attempt_resume_upload: bool=false, chunk_size: string="5242880", compartment: string="", config_file: "~/.oci/config"="~/.oci/config", config_profile: "Default"="Default", copy_cutoff: string="4999610368", copy_timeout: int=60, description: string="", disable_checksum: bool=false, encoding: string="50331650", endpoint: string="", leave_parts_on_error: bool=false, max_upload_parts: int=10000, namespace*: string="", no_check_bucket: bool=false, provider*: "env_auth" | "user_principal_auth" | "instance_principal_auth" | "workload_identity_auth" | "resource_principal_auth" | "no_auth"="env_auth", region*: string="", sse_customer_algorithm: "" | "AES256"="", sse_customer_key: ""="", sse_customer_key_file: ""="", sse_customer_key_sha256: ""="", sse_kms_key_id: ""="", storage_tier: "Standard" | "InfrequentAccess" | "Archive"="Standard", upload_concurrency: int=10, upload_cutoff: string="209715200" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/oracleobjectstorage`
**CLI:** `hoody files backends connect oracleobjectstorage`

---

#### `connectPcloud` — Connect to pcloud backend

```typescript
client.files.backends.connectPcloud(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50438146", hostname: "api.pcloud.com" | "eapi.pcloud.com"="api.pcloud.com", password: string="", root_folder_id: string="d0", token: string="", token_url: string="", username: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/pcloud`
**CLI:** `hoody files backends connect pcloud`

---

#### `connectPikpak` — Connect to pikpak backend

```typescript
client.files.backends.connectPikpak(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ chunk_size: string="5242880", description: string="", device_id: string="", encoding: string="56829838", hash_memory_limit: string="10485760", no_media_link: bool=false, pass*: string="", root_folder_id: string="", trashed_only: bool=false, upload_concurrency: int=5, use_trash: bool=true, user*: string="", user_agent: string="Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/pikpak`
**CLI:** `hoody files backends connect pikpak`

---

#### `connectPixeldrain` — Connect to pixeldrain backend

```typescript
client.files.backends.connectPixeldrain(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ api_key: string="", api_url*: string="https://pixeldrain.com/api", description: string="", root_folder_id: string="me" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/pixeldrain`
**CLI:** `hoody files backends connect pixeldrain`

---

#### `connectPremiumizeme` — Connect to premiumizeme backend

```typescript
client.files.backends.connectPremiumizeme(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ api_key: string="", auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50438154", token: string="", token_url: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/premiumizeme`
**CLI:** `hoody files backends connect premiumizeme`

---

#### `connectProtondrive` — Connect to protondrive backend

```typescript
client.files.backends.connectProtondrive(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ 2fa: string="", app_version: string="macos-drive@1.0.0-alpha.1+hoody-vfs", client_access_token: string="", client_refresh_token: string="", client_salted_key_pass: string="", client_uid: string="", description: string="", enable_caching: bool=true, encoding: string="52559874", mailbox_password: string="", original_file_size: bool=true, password*: string="", replace_existing_draft: bool=false, username*: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/protondrive`
**CLI:** `hoody files backends connect protondrive`

---

#### `connectPutio` — Connect to putio backend

```typescript
client.files.backends.connectPutio(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50438146", token: string="", token_url: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/putio`
**CLI:** `hoody files backends connect putio`

---

#### `connectQingstor` — Connect to qingstor backend

```typescript
client.files.backends.connectQingstor(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ access_key_id: string="", chunk_size: string="4194304", connection_retries: int=3, description: string="", encoding: string="16842754", endpoint: string="", env_auth: "false" | "true"=false, secret_access_key: string="", upload_concurrency: int=1, upload_cutoff: string="209715200", zone: "pek3a" | "sh1a" | "gd2a"="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/qingstor`
**CLI:** `hoody files backends connect qingstor`

---

#### `connectQuatrix` — Connect to quatrix backend

```typescript
client.files.backends.connectQuatrix(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ api_key*: string="", description: string="", effective_upload_time: string="4s", encoding: string="50438146", hard_delete: bool=false, host*: string="", maximal_summary_chunk_size: string="100000000", minimal_chunk_size: string="10000000", skip_project_folders: bool=false }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/quatrix`
**CLI:** `hoody files backends connect quatrix`

---

#### `connectS3` — Connect to s3 backend

```typescript
client.files.backends.connectS3(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ access_key_id: string="", acl: "default" | "private" | "public-read" | "public-read-write" | "authenticated-read" | "bucket-owner-read" | "bucket-owner-full-control"="", bucket_acl: "private" | "public-read" | "public-read-write" | "authenticated-read"="", chunk_size: string="5242880", copy_cutoff: string="4999610368", decompress: bool=false, description: string="", directory_bucket: bool=false, directory_markers: bool=false, disable_checksum: bool=false, disable_http2: bool=false, download_url: string="", encoding: string="50331650", endpoint*: "objects-us-east-1.dream.io" | "syd1.digitaloceanspaces.com" | "sfo3.digitaloceanspaces.com" | "fra1.digitaloceanspaces.com" | "nyc3.digitaloceanspaces.com" | "ams3.digitaloceanspaces.com" | "sgp1.digitaloceanspaces.com" | "localhost:8333" | …(35 values)="", env_auth: "false" | "true"=false, force_path_style: bool=true, leave_parts_on_error: bool=false, list_chunk: int=1000, list_url_encode: string, list_version: int=0, location_constraint: string="", max_upload_parts: int=10000, memory_pool_flush_time: int=60, memory_pool_use_mmap: bool=false, might_gzip: string, no_check_bucket: bool=false, no_head: bool=false, no_head_object: bool=false, no_system_metadata: bool=false, profile: string="", provider: "AWS" | "Alibaba" | "ArvanCloud" | "Ceph" | "ChinaMobile" | "Cloudflare" | "DigitalOcean" | "Dreamhost" | …(34 values)="", region: "" | "other-v2-signature"="", requester_pays: bool=false, sdk_log_mode: string="0", secret_access_key: string="", server_side_encryption: "" | "AES256" | "aws:kms"="", session_token: string="", shared_credentials_file: string="", sse_customer_algorithm: "" | "AES256"="", sse_customer_key: ""="", sse_customer_key_base64: ""="", sse_customer_key_md5: ""="", sse_kms_key_id: "" | "arn:aws:kms:us-east-1:*"="", storage_class: "STANDARD" | "LINE" | "GLACIER" | "DEEP_ARCHIVE"="", sts_endpoint: string="", upload_concurrency: int=4, upload_cutoff: string="209715200", use_accelerate_endpoint: bool=false, use_accept_encoding_gzip: string, use_already_exists: string, use_dual_stack: bool=false, use_multipart_etag: string, use_multipart_uploads: string, use_presigned_request: bool=false, use_unsigned_payload: string, v2_auth: bool=false, version_at: string="0001-01-01T00:00:00Z", version_deleted: bool=false, versions: bool=false }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/s3`
**CLI:** `hoody files backends connect s3`

---

#### `connectSeafile` — Connect to seafile backend

```typescript
client.files.backends.connectSeafile(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ 2fa: bool=false, auth_token: string="", create_library: bool=false, description: string="", encoding: string="16850954", library: string="", library_key: string="", pass: string="", url*: "https://cloud.seafile.com/"="", user*: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/seafile`
**CLI:** `hoody files backends connect seafile`

---

#### `connectSftp` — Connect to sftp backend

```typescript
client.files.backends.connectSftp(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ ask_password: bool=false, chunk_size: string="32768", ciphers: string, concurrency: int=64, connections: int=0, copy_is_hardlink: bool=false, description: string="", disable_concurrent_reads: bool=false, disable_concurrent_writes: bool=false, disable_hashcheck: bool=false, host*: string="", host_key_algorithms: string, idle_timeout: int=60, key_exchange: string, key_file: string="", key_file_pass: string="", key_pem: string="", key_use_agent: bool=false, known_hosts_file: "~/.ssh/known_hosts"="", macs: string, md5sum_command: string="", pass: string="", path_override: string="", port: int=22, pubkey: string="", pubkey_file: string="", server_command: string="", set_env: string, set_modtime: bool=true, sha1sum_command: string="", shell_type: "none" | "unix" | "powershell" | "cmd"="", skip_links: bool=false, socks_proxy: string="", ssh: string, subsystem: string="sftp", use_fstat: bool=false, use_insecure_cipher: "false" | "true"=false, user: string="user" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/sftp`
**CLI:** `hoody files backends connect sftp`

---

#### `connectSharefile` — Connect to sharefile backend

```typescript
client.files.backends.connectSharefile(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ auth_url: string="", chunk_size: string="67108864", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="57091982", endpoint: string="", root_folder_id: "" | "favorites" | "allshared" | "connectors" | "top"="", token: string="", token_url: string="", upload_cutoff: string="134217728" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/sharefile`
**CLI:** `hoody files backends connect sharefile`

---

#### `connectSia` — Connect to sia backend

```typescript
client.files.backends.connectSia(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ api_password: string="", api_url: string="http://127.0.0.1:9980", description: string="", encoding: string="50436354", user_agent: string="Sia-Agent" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/sia`
**CLI:** `hoody files backends connect sia`

---

#### `connectSmb` — Connect to smb backend

```typescript
client.files.backends.connectSmb(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ case_insensitive: bool=true, description: string="", domain: string="WORKGROUP", encoding: string="56698766", hide_special_share: bool=true, host*: string="", idle_timeout: int=60, pass: string="", port: int=445, spn: string="", user: string="user" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/smb`
**CLI:** `hoody files backends connect smb`

---

#### `connectStorj` — Connect to storj backend

```typescript
client.files.backends.connectStorj(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ access_grant: string="", api_key: string="", description: string="", passphrase: string="", provider: "existing" | "new"="existing", satellite_address: "us1.storj.io" | "eu1.storj.io" | "ap1.storj.io"="us1.storj.io" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/storj`
**CLI:** `hoody files backends connect storj`

---

#### `connectSugarsync` — Connect to sugarsync backend

```typescript
client.files.backends.connectSugarsync(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ access_key_id: string="", app_id: string="", authorization: string="", authorization_expiry: string="", deleted_id: string="", description: string="", encoding: string="50397186", hard_delete: bool=false, private_access_key: string="", refresh_token: string="", root_id: string="", user: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/sugarsync`
**CLI:** `hoody files backends connect sugarsync`

---

#### `connectSwift` — Connect to swift backend

```typescript
client.files.backends.connectSwift(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ application_credential_id: string="", application_credential_name: string="", application_credential_secret: string="", auth: "https://auth.api.rackspacecloud.com/v1.0" | "https://lon.auth.api.rackspacecloud.com/v1.0" | "https://identity.api.rackspacecloud.com/v2.0" | "https://auth.storage.memset.com/v1.0" | "https://auth.storage.memset.com/v2.0" | "https://auth.cloud.ovh.net/v3" | "https://authenticate.ain.net"="", auth_token: string="", auth_version: int=0, chunk_size: string="5368709120", description: string="", domain: string="", encoding: string="16777218", endpoint_type: "public" | "internal" | "admin"="public", env_auth: "false" | "true"=false, fetch_until_empty_page: bool=false, key: string="", leave_parts_on_error: bool=false, no_chunk: bool=false, no_large_objects: bool=false, partial_page_fetch_threshold: int=0, region: string="", storage_policy: "" | "pcs" | "pca"="", storage_url: string="", tenant: string="", tenant_domain: string="", tenant_id: string="", use_segments_container: string, user: string="", user_id: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/swift`
**CLI:** `hoody files backends connect swift`

---

#### `connectTardigrade` — Connect to tardigrade backend

```typescript
client.files.backends.connectTardigrade(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ access_grant: string="", api_key: string="", description: string="", passphrase: string="", provider: "existing" | "new"="existing", satellite_address: "us1.storj.io" | "eu1.storj.io" | "ap1.storj.io"="us1.storj.io" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/tardigrade`
**CLI:** `hoody files backends connect tardigrade`

---

#### `connectUlozto` — Connect to ulozto backend

```typescript
client.files.backends.connectUlozto(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ app_token: string="", description: string="", encoding: string="50438146", list_page_size: int=500, password: string="", root_folder_slug: string="", username: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/ulozto`
**CLI:** `hoody files backends connect ulozto`

---

#### `connectUnion` — Connect to union backend

```typescript
client.files.backends.connectUnion(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ action_policy: string="epall", cache_time: int=120, create_policy: string="epmfs", description: string="", min_free_space: string="1073741824", search_policy: string="ff", upstreams*: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/union`
**CLI:** `hoody files backends connect union`

---

#### `connectUptobox` — Connect to uptobox backend

```typescript
client.files.backends.connectUptobox(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ access_token: string="", description: string="", encoding: string="50561070", private: bool=false }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/uptobox`
**CLI:** `hoody files backends connect uptobox`

---

#### `connectWebdav` — Connect to webdav backend

```typescript
client.files.backends.connectWebdav(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ auth_redirect: bool=false, bearer_token: string="", bearer_token_command: string="", description: string="", encoding: string="", headers: string, nextcloud_chunk_size: string="10485760", owncloud_exclude_mounts: bool=false, owncloud_exclude_shares: bool=false, pacer_min_sleep: int=0, pass: string="", unix_socket: string="", url*: string="", user: string="", vendor: "fastmail" | "nextcloud" | "owncloud" | "sharepoint" | "sharepoint-ntlm" | "hoody-vfs" | "other"="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/webdav`
**CLI:** `hoody files backends connect webdav`

---

#### `connectYandex` — Connect to yandex backend

```typescript
client.files.backends.connectYandex(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50429954", hard_delete: bool=false, spoof_ua: bool=true, token: string="", token_url: string="" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/yandex`
**CLI:** `hoody files backends connect yandex`

---

#### `connectZoho` — Connect to zoho backend

```typescript
client.files.backends.connectZoho(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="16875520", region: "com" | "eu" | "in" | "jp" | "com.cn" | "com.au"="", token: string="", token_url: string="", upload_cutoff: string="10485760" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/backends/zoho`
**CLI:** `hoody files backends connect zoho`

---

#### `disconnect` — Disconnect backend

```typescript
client.files.backends.disconnect(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/backends/{id}`
**CLI:** `hoody files backends disconnect`

---

#### `getDetails` — Get backend details

```typescript
client.files.backends.getDetails(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/backends/{id}`
**CLI:** `hoody files backends get`

---

#### `list` — List all backends

```typescript
client.files.backends.list()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/backends`
**CLI:** `hoody files backends list`

---

#### `testConnection` — Test backend connection

```typescript
client.files.backends.testConnection(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/backends/{id}/test`
**CLI:** `hoody files backends test`

---

#### `update` — Update backend credentials

```typescript
client.files.backends.update(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Backend ID (16-character hex string) |
| `data` | `object` | body | Yes |  |

**Body:** `{ [key: string]: string|null }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/backends/{id}`
**CLI:** `hoody files backends update`

---

### `client.files.directories` (1) — Directory operations - create, list, download as ZIP

#### `create` — Create directory

```typescript
client.files.directories.create(path: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `MKCOL /{path}`

---

### `client.files.downloads` (4) — Downloads

#### `fetch` — Download file from remote URL

```typescript
client.files.downloads.fetch(directory: string, download: string, filename?: string, timeout?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `directory` | `string` | path | Yes | Destination directory |
| `download` | `string` | query | Yes | URL to download from |
| `filename` | `string` | query | No | Custom filename for downloaded file |
| `timeout` | `integer` | query | No | Download timeout in seconds |

**Returns:** `files_DownloadResult`  |  **HTTP:** `GET /{directory}?download`
**CLI:** `hoody files downloads url`

---

#### `getHistory` — Download history

```typescript
client.files.downloads.getHistory(download_history: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `download_history` | `string` | query | Yes |  |

**Returns:** `files_DownloadHistory`  |  **HTTP:** `GET /?download_history`
**CLI:** `hoody files downloads history`

---

#### `listActive` — List active downloads

```typescript
client.files.downloads.listActive(directory: string, downloads: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `directory` | `string` | path | Yes |  |
| `downloads` | `string` | query | Yes |  |

**Returns:** `files_ActiveDownloads`  |  **HTTP:** `GET /{directory}?downloads`
**CLI:** `hoody files downloads active`

---

#### `listGlobal` — List active downloads

```typescript
client.files.downloads.listGlobal()
```

**Returns:** `files_ActiveDownloads`  |  **HTTP:** `GET /api/v1/downloads`
**CLI:** `hoody files downloads all`

---

### `client.files` (21) — File operations - upload, download, delete, list files

#### `append` — Append data to file

```typescript
client.files.append(path: string, owner?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File path |
| `owner` | `string` | query | No | Create-time owner (user[:group]/uid[:gid]) when this append creates a new file. Requires --allow-chown + allowlist; refuses root. Absent → server default. |

**Returns:** `files_AppendResponse`  |  **HTTP:** `PUT /api/v1/files/append/{path}`
**CLI:** `hoody files append`

---

#### `chmod` — Change file permissions

```typescript
client.files.chmod(path: string, chmod: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File or directory path |
| `chmod` | `string` | query | Yes | Octal permission mode (e.g., 755, 644, 0755) |

**Returns:** `files_ChmodResponse`  |  **HTTP:** `PATCH /api/v1/files/chmod/{path}`
**CLI:** `hoody files chmod`

---

#### `chown` — Change file ownership

```typescript
client.files.chown(path: string, chown: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File or directory path |
| `chown` | `string` | query | Yes | Owner and optional group (e.g., user:group, user,:group, or UID:GID) |

**Returns:** `files_ChownResponse`  |  **HTTP:** `PATCH /api/v1/files/chown/{path}`
**CLI:** `hoody files chown`

---

#### `copy` — Copy file or directory

```typescript
client.files.copy(path: string, copy_to: string, overwrite?: string, owner?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Source file or directory path |
| `copy_to` | `string` | query | Yes | Destination path to copy the file/directory to |
| `overwrite` | `string` | query | No | Allow overwriting existing destination (default: false) |
| `owner` | `string` | query | No | Create-time owner (user[:group]/uid[:gid]) for newly-created copies. Requires --allow-chown + allowlist; refuses root. Overwritten existing files preserve their owner. Absent → server default. |

**Returns:** `files_CopyResponse`  |  **HTTP:** `POST /api/v1/files/copy/{path}`
**CLI:** `hoody files copy`

---

#### `delete` — Delete file or directory

```typescript
client.files.delete(path: string, backend?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `backend` | `string` | query | No | Backend ID for remote file deletion |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/files/{path}`
**CLI:** `hoody files delete`

---

#### `deleteRecursive` — Delete file or directory

```typescript
client.files.deleteRecursive(path: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Path to file or directory to delete |

**Returns:** `any`  |  **HTTP:** `DELETE /{path}`
**CLI:** `hoody files delete-recursive`

---

#### `get` — List directory or download file

```typescript
client.files.get(path: string, backend?: string, hash?: string, sha256?: string, base64?: string, preview?: string, contents?: string, stat?: string, thumbnail?: string, grep?: string, ignore_case?: boolean, fixed_string?: boolean, glob?: string, context?: integer, max_count?: integer, max_matches?: integer, max_depth?: integer, max_filesize?: integer, timeout?: integer, no_ignore?: boolean, max_results?: integer, max_files_scanned?: integer, sort?: string, order?: string, lines?: string, history?: string, at?: string, revision?: integer, diff?: string, from_seq?: integer, from_ts?: string, to_seq?: integer, to_ts?: string, after_id?: integer, limit?: integer, zip?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File or directory path |
| `backend` | `string` | query | No | Backend ID for remote file access |
| `hash` | `string` | query | No | Get SHA256 hash of file |
| `sha256` | `string` | query | No | Get SHA256 hash of file (alias for hash) |
| `base64` | `string` | query | No | Get file content as base64 |
| `preview` | `string` | query | No | Preview archive contents (for zip/tar files). Alias: ?contents |
| `contents` | `string` | query | No | Alias for ?preview - list archive contents |
| `stat` | `string` | query | No | Get file/directory metadata (stat) without downloading content |
| `thumbnail` | `string` | query | No | Return a processed image (resize, format convert, blur, grayscale). Requires the service to be started with --allow-thumbnails; returns 403 when disabled. |
| `grep` | `string` | query | No | Search file/directory contents for regex pattern (or literal if fixed_string=true). Requires --allow-grep. |
| `ignore_case` | `boolean` | query | No | Case-insensitive grep matching |
| `fixed_string` | `boolean` | query | No | Treat grep pattern as literal string, not regex |
| `glob` | `string` | query | No | Find files matching glob pattern (e.g. '**/*.rs', 'src/**/*.{ts,tsx}'). Requires --allow-search. Directory paths only. |
| `context` | `integer` | query | No | Number of context lines before/after each grep match |
| `max_count` | `integer` | query | No | Max matches per file for grep |
| `max_matches` | `integer` | query | No | Total max matches across all files for grep |
| `max_depth` | `integer` | query | No | Directory recursion depth for grep |
| `max_filesize` | `integer` | query | No | Skip files larger than this (bytes) during grep |
| `timeout` | `integer` | query | No | Grep timeout in seconds |
| `no_ignore` | `boolean` | query | No | Bypass.gitignore filtering during grep |
| `max_results` | `integer` | query | No | Max entries returned for glob search |
| `max_files_scanned` | `integer` | query | No | Max filesystem entries scanned during glob search |
| `sort` | `string` | query | No | Sort glob results by: mtime (default), name, or size |
| `order` | `string` | query | No | Sort order for glob results. Default: desc for mtime, asc for name/size |
| `lines` | `string` | query | No | Extract specific lines from a file. Formats: '10-50' (range, 1-indexed inclusive), '100' (single line), '-20' (last 20 lines / tail), '50-' (line 50 to end). Returns text/plain with X-Line-Range header. X-Total-Lines header included when naturally known (scan reached EOF). Max 100,000 lines or 64MB per request. |
| `history` | `string` | query | No | List all revisions of a file. Returns JSON with revisions array, pagination via after_id. Mutually exclusive with at/revision/diff. |
| `at` | `string` | query | No | Read file content at a point in time. Accepts RFC3339 timestamp or Unix milliseconds. Mutually exclusive with history/revision/diff. Composable with ?lines, ?hash, ?base64. |
| `revision` | `integer` | query | No | Read file content by stable per-path sequence number. Mutually exclusive with history/at/diff. Composable with ?lines, ?hash, ?base64. |
| `diff` | `string` | query | No | Compute unified diff between two versions. Requires from_seq or from_ts. Optional to_seq or to_ts (defaults to current file). Mutually exclusive with history/at/revision. |
| `from_seq` | `integer` | query | No | Source revision seq number for ?diff. Mutually exclusive with from_ts. |
| `from_ts` | `string` | query | No | Source timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with from_seq. |
| `to_seq` | `integer` | query | No | Target revision seq number for ?diff. Mutually exclusive with to_ts. Default: current file on disk. |
| `to_ts` | `string` | query | No | Target timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with to_seq. |
| `after_id` | `integer` | query | No | Cursor for ?history pagination. Returns entries with id > after_id. |
| `limit` | `integer` | query | No | Max entries to return for ?history. |
| `zip` | `string` | query | No | Download a directory as a streaming zip archive (bare flag, e.g. ?zip). Local directories only; requires --allow-archive. Same behavior as the WebDAV-style /{directory}?zip. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/files/{path}`
**CLI:** `hoody files get`

---

#### `getMetadata` — Get file metadata

```typescript
client.files.getMetadata(path: string, history?: string, at?: string, revision?: integer, diff?: string, from_seq?: integer, from_ts?: string, to_seq?: integer, to_ts?: string, after_id?: integer, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `history` | `string` | query | No | List all revisions of a file. Returns JSON with revisions array, pagination via after_id. Mutually exclusive with at/revision/diff. |
| `at` | `string` | query | No | Read file content at a point in time. Accepts RFC3339 timestamp or Unix milliseconds. Mutually exclusive with history/revision/diff. Composable with ?lines, ?hash, ?base64. |
| `revision` | `integer` | query | No | Read file content by stable per-path sequence number. Mutually exclusive with history/at/diff. Composable with ?lines, ?hash, ?base64. |
| `diff` | `string` | query | No | Compute unified diff between two versions. Requires from_seq or from_ts. Optional to_seq or to_ts (defaults to current file). Mutually exclusive with history/at/revision. |
| `from_seq` | `integer` | query | No | Source revision seq number for ?diff. Mutually exclusive with from_ts. |
| `from_ts` | `string` | query | No | Source timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with from_seq. |
| `to_seq` | `integer` | query | No | Target revision seq number for ?diff. Mutually exclusive with to_ts. Default: current file on disk. |
| `to_ts` | `string` | query | No | Target timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with to_seq. |
| `after_id` | `integer` | query | No | Cursor for ?history pagination. Returns entries with id > after_id. |
| `limit` | `integer` | query | No | Max entries to return for ?history. |

**Returns:** `any`  |  **HTTP:** `HEAD /{path}`
**CLI:** `hoody files metadata`

---

#### `glob` — Find files by glob pattern

```typescript
client.files.glob(path: string, pattern: string, max_results?: integer, max_depth?: integer, max_files_scanned?: integer, timeout?: integer, no_ignore?: boolean, sort?: string, order?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Directory path to search within |
| `pattern` | `string` | query | Yes | Glob pattern (e.g. '**/*.rs', 'src/**/*.{ts,tsx}', '*.md') |
| `max_results` | `integer` | query | No | Maximum entries to return |
| `max_depth` | `integer` | query | No | Maximum directory recursion depth |
| `max_files_scanned` | `integer` | query | No | Maximum filesystem entries to scan |
| `timeout` | `integer` | query | No | Search timeout in seconds |
| `no_ignore` | `boolean` | query | No | Bypass.gitignore filtering |
| `sort` | `string` | query | No | Sort results by: mtime (modification time), name, or size |
| `order` | `string` | query | No | Sort order. Default: desc for mtime, asc for name/size |

**Returns:** `files_GlobResults`  |  **HTTP:** `GET /api/v1/files/glob/{path}`
**CLI:** `hoody files glob`

---

#### `grep` — Search file contents (grep)

```typescript
client.files.grep(path: string, pattern: string, ignore_case?: boolean, fixed_string?: boolean, glob?: string, context?: integer, max_count?: integer, max_matches?: integer, max_depth?: integer, max_filesize?: integer, timeout?: integer, no_ignore?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File or directory path to search |
| `pattern` | `string` | query | Yes | Search pattern (regex by default, literal if fixed_string=true) |
| `ignore_case` | `boolean` | query | No | Case-insensitive matching |
| `fixed_string` | `boolean` | query | No | Treat pattern as literal string, not regex |
| `glob` | `string` | query | No | Filter files by glob pattern (e.g. '*.rs', '*.{ts,tsx}') |
| `context` | `integer` | query | No | Number of context lines before and after each match |
| `max_count` | `integer` | query | No | Maximum matches per file |
| `max_matches` | `integer` | query | No | Total maximum matches across all files |
| `max_depth` | `integer` | query | No | Maximum directory recursion depth |
| `max_filesize` | `integer` | query | No | Skip files larger than this (bytes) |
| `timeout` | `integer` | query | No | Search timeout in seconds |
| `no_ignore` | `boolean` | query | No | Bypass.gitignore filtering |

**Returns:** `files_GrepResults`  |  **HTTP:** `GET /api/v1/files/grep/{path}`
**CLI:** `hoody files grep`

---

#### `listDirectory` — List directory contents or download file

```typescript
client.files.listDirectory(path: string, json?: string, simple?: string, sort?: string, order?: string, hash?: string, sha256?: string, base64?: string, edit?: string, view?: string, download?: string, content-type?: string, history?: string, at?: string, revision?: integer, diff?: string, from_seq?: integer, from_ts?: string, to_seq?: integer, to_ts?: string, after_id?: integer, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File or directory path |
| `json` | `string` | query | No | Return JSON format instead of HTML |
| `simple` | `string` | query | No | Return simple text listing |
| `sort` | `string` | query | No | Sort by field |
| `order` | `string` | query | No | Sort order |
| `hash` | `string` | query | No | Get SHA256 hash of file (returns plain text hash) |
| `sha256` | `string` | query | No | Get SHA256 hash of file (alias for hash) |
| `base64` | `string` | query | No | Get file content as base64 encoded string |
| `edit` | `string` | query | No | Open file in Web UI editor (requires allow-upload permission) |
| `view` | `string` | query | No | View file in Web UI (read-only mode) |
| `download` | `string` | query | No | For file paths only: force browser download (Content-Disposition: attachment). Accepted values: empty (?download), 1, or true. For directory paths, ?download is the URL download-manager operation. |
| `content-type` | `string` | query | No | Override Content-Type header for file downloads |
| `history` | `string` | query | No | List all revisions of a file. Returns JSON with revisions array, pagination via after_id. Mutually exclusive with at/revision/diff. |
| `at` | `string` | query | No | Read file content at a point in time. Accepts RFC3339 timestamp or Unix milliseconds. Mutually exclusive with history/revision/diff. Composable with ?lines, ?hash, ?base64. |
| `revision` | `integer` | query | No | Read file content by stable per-path sequence number. Mutually exclusive with history/at/diff. Composable with ?lines, ?hash, ?base64. |
| `diff` | `string` | query | No | Compute unified diff between two versions. Requires from_seq or from_ts. Optional to_seq or to_ts (defaults to current file). Mutually exclusive with history/at/revision. |
| `from_seq` | `integer` | query | No | Source revision seq number for ?diff. Mutually exclusive with from_ts. |
| `from_ts` | `string` | query | No | Source timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with from_seq. |
| `to_seq` | `integer` | query | No | Target revision seq number for ?diff. Mutually exclusive with to_ts. Default: current file on disk. |
| `to_ts` | `string` | query | No | Target timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with to_seq. |
| `after_id` | `integer` | query | No | Cursor for ?history pagination. Returns entries with id > after_id. |
| `limit` | `integer` | query | No | Max entries to return for ?history. |

**Returns:** `files_DirectoryListing`  |  **HTTP:** `GET /{path}`
**CLI:** `hoody files dir`

---

#### `move` — Move file or directory

```typescript
client.files.move(path: string, move_to: string, owner?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Source file or directory path |
| `move_to` | `string` | query | Yes | Destination path to move the file/directory to |
| `owner` | `string` | query | No | Create-time owner (user[:group]/uid[:gid]) for newly-created destination PARENT directories. Requires --allow-chown + --allowed-create-owners; refuses root. The moved inode itself preserves its existing owner. Absent → server default. |

**Returns:** `files_MoveResponse`  |  **HTTP:** `POST /api/v1/files/move/{path}`
**CLI:** `hoody files move`

---

#### `operate` — File operations (mkdir, extract, download, move, copy)

```typescript
client.files.operate(path: string, backend?: string, mkdir?: string, extract?: string, dest?: string, download_from?: string, move_to?: string, copy_to?: string, overwrite?: string, owner?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `backend` | `string` | query | No |  |
| `mkdir` | `string` | query | No | Create directory |
| `extract` | `string` | query | No | Extract archive. Empty value extracts all; non-empty value is a selective path to extract (e.g. "src/" or "lib/") |
| `dest` | `string` | query | No | Destination directory name for extraction (default: archive name without extension) |
| `download_from` | `string` | query | No | Download file from remote URL |
| `move_to` | `string` | query | No | Move file/directory to destination path |
| `copy_to` | `string` | query | No | Copy file/directory to destination path |
| `overwrite` | `string` | query | No | Allow overwriting existing destination (for copy) |
| `owner` | `string` | query | No | Create-time owner for newly-created inodes as user[:group] or uid[:gid]. Requires --allow-chown and must resolve to an entry in --allowed-create-owners; refuses root (uid/gid 0). Absent → the server default create owner. Applies to mkdir/extract/download_from/copy_to. |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/files/{path}`
**CLI:** `hoody files operation`

---

#### `patch` — File operations

```typescript
client.files.patch(path: string, X-Update-Range?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `X-Update-Range` | `string` | header | No | Set to 'append' to append data to the end of the file. Perfect for logs and incremental writes. Example: curl -X PATCH -H 'X-Update-Range: append' --data-binary @data.txt http://server/file.log |
| `data` | `object` | body | No |  |

**Body:** `files_ChmodRequest | files_ChownRequest | files_RenameRequest`

**Returns:** `void`  |  **HTTP:** `PATCH /{path}`
**CLI:** `hoody files patch`

---

#### `patchApi` — Modify file properties or move/rename

```typescript
client.files.patchApi(path: string, backend?: string, owner?: string, chmod?: string, chown?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File path |
| `backend` | `string` | query | No | Backend ID for remote file operations |
| `owner` | `string` | query | No | Create-time owner (user[:group]/uid[:gid]) for newly-created destination parent directories on a JSON-body move_to. Requires --allow-chown + --allowed-create-owners; cannot be root. The moved item keeps its own owner. Absent → server default. |
| `chmod` | `string` | query | No | Set file permissions using octal mode value (e.g., ?chmod=755) |
| `chown` | `string` | query | No | Set file ownership (e.g., ?chown=user:group or ?chown=user) |
| `data` | `object` | body | No |  |

**Body:** `files_MoveRequest | files_RenameRequest`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/files/{path}`
**CLI:** `hoody files modify-properties`

---

#### `put` — Upload or append file

```typescript
client.files.put(path: string, backend?: string, append?: string, owner?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `backend` | `string` | query | No | Backend ID for remote upload |
| `append` | `string` | query | No | Append body to end of existing file (create if missing) instead of overwriting |
| `owner` | `string` | query | No | Create-time owner (user[:group]/uid[:gid]) for a newly-created file. Requires --allow-chown + --allowed-create-owners; refuses root. Overwrites/appends to an existing file preserve its owner. Absent → server default. |

**Returns:** `files_AppendResponse`  |  **HTTP:** `PUT /api/v1/files/{path}`
**CLI:** `hoody files put`

---

#### `realpath` — Resolve canonical path (realpath)

```typescript
client.files.realpath(path: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File or directory path to resolve |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/files/realpath/{path}`
**CLI:** `hoody files realpath`

---

#### `search` — Search directory

```typescript
client.files.search(directory: string, q: string, json?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `directory` | `string` | path | Yes |  |
| `q` | `string` | query | Yes | Search query (case-insensitive filename match). Maximum 512 BYTES of UTF-8 after form/percent decoding, measured both before and after Unicode lowercasing — lowercasing can change a string's byte length in either direction. Longer queries are rejected with 400; they are not truncated. Note this is a byte limit, not a character limit, so it is deliberately not expressed as `maxLength`. |
| `json` | `string` | query | No | Return JSON format instead of HTML |

**Returns:** `files_DirectoryListing`  |  **HTTP:** `GET /{directory}?q`
**CLI:** `hoody files search`

---

#### `stat` — Get file metadata (stat)

```typescript
client.files.stat(path: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File or directory path |

**Returns:** `files_FileStatResponse`  |  **HTTP:** `GET /api/v1/files/stat/{path}`
**CLI:** `hoody files stat`

---

#### `touch` — Touch file (create or update mtime)

```typescript
client.files.touch(path: string, touch: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File path to touch |
| `touch` | `string` | query | Yes | Flag to indicate touch operation |

**Returns:** `any`  |  **HTTP:** `PUT /{path}?touch`
**CLI:** `hoody files touch`

---

#### `upload` — Upload file

```typescript
client.files.upload(path: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Destination file path |

**Returns:** `any`  |  **HTTP:** `PUT /{path}`
**CLI:** `hoody files upload`

---

### `client.files.ftp` (1) — WebDAV-compatible API for FTP/FTPS

#### `access` — Access file via FTP

```typescript
client.files.ftp.access(path: string, type: string, server: string, user?: string, pass?: string, ftp_secure?: boolean, ftp_passive?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `type` | `string` | query | Yes |  |
| `server` | `string` | query | Yes |  |
| `user` | `string` | query | No |  |
| `pass` | `string` | query | No |  |
| `ftp_secure` | `boolean` | query | No | Use FTPS (FTP over TLS) |
| `ftp_passive` | `boolean` | query | No | Use passive mode |

**Returns:** `any`  |  **HTTP:** `GET /{path}?type=ftp`
**CLI:** `hoody files access ftp`

---

### `client.files.git` (1) — WebDAV-compatible API for Git repositories

#### `fetch` — Fetch file from Git repository

```typescript
client.files.git.fetch(path: string, type: string, url: string, ref?: string, pass?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `type` | `string` | query | Yes |  |
| `url` | `string` | query | Yes | Full GitHub/GitLab/Bitbucket URL or repository URL |
| `ref` | `string` | query | No | Branch, tag, or commit (defaults to HEAD or extracted from URL) |
| `pass` | `string` | query | No | Personal Access Token (base64 encoded) for private repos |

**Returns:** `any`  |  **HTTP:** `GET /{path}?type=git`
**CLI:** `hoody files fetch-from-git`

---

### `client.files.health` (1) — Health

#### `check` — Service health check

```typescript
client.files.health.check()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/files/health`
**CLI:** `hoody files health`

---

### `client.files.images` (1) — On-the-fly image conversion, resizing, and effects with format conversion (JPEG/PNG/WebP/GIF/BMP), multiple resize modes, quality control, blur, grayscale, and two-tier caching (memory + disk)

#### `process` — Process and convert images

```typescript
client.files.images.process(image: string, thumbnail: string, format?: string, size?: string, width?: integer, height?: integer, resize?: string, quality?: string, q?: integer, blur?: number, grayscale?: string, bg?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `image` | `string` | path | Yes | Path to image file |
| `thumbnail` | `string` | query | Yes | Enable image processing |
| `format` | `string` | query | No | Output format (default: jpeg) |
| `size` | `string` | query | No | Width×Height in pixels (max: 2000×2000) |
| `width` | `integer` | query | No | Width in pixels (height auto-calculated) |
| `height` | `integer` | query | No | Height in pixels (width auto-calculated) |
| `resize` | `string` | query | No | Resize mode: fit (preserve aspect, fit within), fill (exact size, crop), cover (cover area), exact (force dimensions) |
| `quality` | `string` | query | No | Resize algorithm quality: low (box filter), medium (bilinear), high (Lanczos3) |
| `q` | `integer` | query | No | JPEG/WebP quality (1-100, higher is better quality) |
| `blur` | `number` | query | No | Gaussian blur radius (0-50) |
| `grayscale` | `string` | query | No | Convert to grayscale/black-and-white |
| `bg` | `string` | query | No | Background color for transparency (hex RGB, e.g., 'ffffff' for white) |

**Returns:** `any`  |  **HTTP:** `GET /{image}?thumbnail`
**CLI:** `hoody files process-image`

---

### `client.files.journal` (3) — Journal

#### `flush` — Flush journal to disk

```typescript
client.files.journal.flush()
```

**Returns:** `any`  |  **HTTP:** `POST /api/v1/journal/flush`
**CLI:** `hoody files journal flush`

---

#### `getStats` — Get journal statistics

```typescript
client.files.journal.getStats()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/journal/stats`
**CLI:** `hoody files journal stats`

---

#### `query` — Query journal entries

```typescript
client.files.journal.query(path?: string, op?: string, since?: string, limit?: integer, after_id?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | query | No | Filter entries by path prefix |
| `op` | `string` | query | No | Filter by operation type(s), comma-separated (e.g. 'write,delete') |
| `since` | `string` | query | No | Filter entries since timestamp (RFC3339 or Unix ms) |
| `limit` | `integer` | query | No | Max entries to return |
| `after_id` | `integer` | query | No | Cursor: return entries with id > after_id |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/journal`
**CLI:** `hoody files journal query`

---

### `client.files.mounts` (5) — Mount management - create, list, and remove FUSE filesystem mounts for remote backends

#### `create` — Create persistent FUSE mount

```typescript
client.files.mounts.create(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ backend_id*: string, label: string, mount_path: string, vfs_config: { cache_max_age: int | string=3600, cache_max_size: int | string=10737418240, cache_mode: "off" | "minimal" | "writes" | "full"="writes", dir_cache_time: int | string=300 } }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/mounts`
**CLI:** `hoody files mounts create`

---

#### `getDetails` — Get mount details

```typescript
client.files.mounts.getDetails(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/mounts/{id}`
**CLI:** `hoody files mounts get`

---

#### `list` — List all mounts

```typescript
client.files.mounts.list(label?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `label` | `string` | query | No | Filter mounts by label. Only mounts with this exact label will be returned. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/mounts`
**CLI:** `hoody files mounts list`

---

#### `unmount` — Unmount filesystem

```typescript
client.files.mounts.unmount(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/mounts/{id}`
**CLI:** `hoody files mounts unmount`

---

#### `update` — Update mount VFS configuration

```typescript
client.files.mounts.update(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Mount ID |
| `data` | `object` | body | Yes |  |

**Body:** `{ vfs_config*: object }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/mounts/{id}`
**CLI:** `hoody files mounts update`

---

### `client.files.s3` (1) — WebDAV-compatible API for S3 storage

#### `access` — Access file from S3

```typescript
client.files.s3.access(path: string, type: string, server: string, s3_bucket: string, s3_region: string, user?: string, pass?: string, s3_endpoint?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `type` | `string` | query | Yes |  |
| `server` | `string` | query | Yes |  |
| `s3_bucket` | `string` | query | Yes | S3 bucket name |
| `s3_region` | `string` | query | Yes |  |
| `user` | `string` | query | No | AWS Access Key ID |
| `pass` | `string` | query | No | AWS Secret Key (base64 encoded) |
| `s3_endpoint` | `string` | query | No | Custom S3 endpoint for MinIO, etc. |

**Returns:** `any`  |  **HTTP:** `GET /{path}?type=s3`
**CLI:** `hoody files access s3`

---

### `client.files.ssh` (2) — WebDAV-compatible API for SSH/SFTP

#### `access` — Access file via SSH/SFTP

```typescript
client.files.ssh.access(path: string, type: string, server: string, user: string, pass?: string, key?: string, passphrase?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `type` | `string` | query | Yes |  |
| `server` | `string` | query | Yes | Server hostname:port |
| `user` | `string` | query | Yes | SSH username |
| `pass` | `string` | query | No | Password (base64 encoded) |
| `key` | `string` | query | No | Private key PEM (base64 encoded) |
| `passphrase` | `string` | query | No | Key passphrase (base64 encoded) |

**Returns:** `any`  |  **HTTP:** `GET /{path}?type=ssh`
**CLI:** `hoody files access ssh`

---

#### `upload` — Upload file via SSH/SFTP

```typescript
client.files.ssh.upload(path: string, server: string, user: string, pass?: string, key?: string, passphrase?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `server` | `string` | query | Yes | Server hostname:port |
| `user` | `string` | query | Yes | SSH username |
| `pass` | `string` | query | No | Password (base64 encoded) |
| `key` | `string` | query | No | Private key PEM (base64 encoded) |
| `passphrase` | `string` | query | No | Key passphrase (base64 encoded) |

**Returns:** `any`  |  **HTTP:** `PUT /{path}?type=ssh`
**CLI:** `hoody files access ssh-upload`

---

### `client.files.system` (1) — System endpoints - health checks, version info, and status monitoring

#### `getApiVersion` — Get API version

```typescript
client.files.system.getApiVersion()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/version`
**CLI:** `hoody files version`

---

### `client.files.webdav` (8) — WebDAV protocol operations - PROPFIND, PROPPATCH, COPY, MOVE, LOCK, UNLOCK, OPTIONS

#### `access` — Access file via WebDAV

```typescript
client.files.webdav.access(path: string, type: string, server: string, user?: string, pass?: string, webdav_path?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `type` | `string` | query | Yes |  |
| `server` | `string` | query | Yes |  |
| `user` | `string` | query | No |  |
| `pass` | `string` | query | No |  |
| `webdav_path` | `string` | query | No | WebDAV endpoint path |

**Returns:** `any`  |  **HTTP:** `GET /{path}?type=webdav`
**CLI:** `hoody files access webdav`

---

#### `copyResource` — Copy file or directory

```typescript
client.files.webdav.copyResource(path: string, Destination: string, Depth?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Source file or directory path |
| `Destination` | `string` | header | Yes | Destination URL for the copy |
| `Depth` | `string` | header | No | Copy depth: 0 (file only) or infinity (recursive for directories) |

**Returns:** `any`  |  **HTTP:** `COPY /{path}`

---

#### `getOptions` — Get allowed methods

```typescript
client.files.webdav.getOptions(path: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |

**Returns:** `void`  |  **HTTP:** `OPTIONS /{path}`
**CLI:** `hoody files options`

---

#### `lockResource` — Lock file (WebDAV compatibility)

```typescript
client.files.webdav.lockResource(path: string, Depth?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `Depth` | `string` | header | No |  |

**Returns:** `any`  |  **HTTP:** `LOCK /{path}`

---

#### `moveResource` — Move or rename file/directory

```typescript
client.files.webdav.moveResource(path: string, Destination: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Source file or directory path |
| `Destination` | `string` | header | Yes | Destination URL for the move |

**Returns:** `any`  |  **HTTP:** `MOVE /{path}`

---

#### `propfindResource` — Get WebDAV properties

```typescript
client.files.webdav.propfindResource(path: string, Depth?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `Depth` | `string` | header | No | Depth of property retrieval: 0 (resource only), 1 (immediate children), infinity (recursive) |

**Returns:** `void`  |  **HTTP:** `PROPFIND /{path}`

---

#### `proppatchResource` — Update WebDAV properties

```typescript
client.files.webdav.proppatchResource(path: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |

**Returns:** `void`  |  **HTTP:** `PROPPATCH /{path}`

---

#### `unlockResource` — Unlock file (WebDAV compatibility)

```typescript
client.files.webdav.unlockResource(path: string, Lock-Token: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `Lock-Token` | `string` | header | Yes | Lock token to release |

**Returns:** `void`  |  **HTTP:** `UNLOCK /{path}`


### Body schemas

- `files_MoveRequest` — `{ move_to*: string }`
- `files_RenameRequest` — `{ name*: string }`
- `files_ChmodRequest` — `{ mode*: string }`
- `files_ChownRequest` — `{ group: string, owner: string }`

