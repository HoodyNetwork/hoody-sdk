> _**SDK skill · `files` namespace** · ~45,068 tokens · hoody-sdk v1.0.0-beta.17_

# `files` — container filesystem over HTTP, with automatic Git-like change history

## Purpose

**Default surface: the container's own filesystem, exposed over HTTP — with automatic mutation journaling when the deployment enabled it.** Read, write, copy, move, delete, stat, chmod, list, glob, grep, archive-preview/extract, fetch URLs into the FS, resumable upload — all on absolute container paths (`/home/user/main.py`, `/etc/hostname`, `/hoody/databases/foo.db`). No backend flag needed.

**Headline feature when journaling is on — automatic change history (think Git, but for every file write).** With the journal enabled, every `PUT` / `PATCH` / `DELETE` / `MOVE` / `COPY` is appended to a per-container mutation log: monotonic sequence number, timestamp, path, op, size, hash. **History is kept for journaled paths, within limits:** retention prunes old entries (90 days or 2 GiB of journal storage by default), bodies over 2 MiB keep only their hash and size, and excluded paths (dev dirs such as `node_modules`, and `.git`) are never recorded. The journal lets you:

- **Time-travel a single file** — `files.get` `?revision=<seq>` or `?at=<unix-ms>` returns the bytes as they were at that point.
- **List a file's history** — `files.get` `?history=1` returns one page of the path's revisions (renames followed), oldest first by global journal entry id: 100 entries by default, `limit` up to 1000. While the response has `has_more: true`, request again with `after_id` set to its `next_after_id`.
- **Diff between revisions** — `files.get` `?diff=1&from_seq=<N>` returns a unified diff between revision `N` and current.
- **Replay / audit** — `journal.list` `?path=<p>&after_id=<id>` streams every operation after global journal entry `id` (while the response has `has_more: true`, resume from its `next_after_id`; on the last page `next_after_id` is `null`, so keep the last entry's `id` as your cursor; an entry's `seq` is its per-path revision number, not a cursor). Run `journal.flush` to force-persist before querying for the absolute latest.
- **Cross-replicate** — pipe the journal into another container as an event source for mirroring / fan-out / append-only sync.

When the deployment turned journaling on, no per-write setup is needed — every covered write is recorded. Exposing the journal query endpoints — history, revision, diff, stats, flush — over the API is a second deployment-side switch; where it is off those endpoints return `403`. Where API access is on but recording itself is off, they return `404 Journal is not enabled`. It is not a complete undo: retention pruning, the 2 MiB body cap, the exclude lists and write paths with no journal hook (URL downloads, archive extraction) all leave gaps, so check `?history` before relying on a restore. Journaling is ON in the standard `hoody_kit: true` container image; raw kit deployments that did not turn it on will accept writes but skip recording.

**Optional add-ons (per-request, opt-in):**
- **Remote backends** — append `?backend=<id>` to operate against a backend you've connected, of any of the 49 allowed rclone backend types (Mega, SFTP, S3, GDrive, Dropbox, Backblaze B2, WebDAV, …), instead of the local FS. A `?type=` parameter does not select a connected backend: on `/api/v1/files/{path}` it is ignored and the request runs on the local FS. = &["] Only where the deployment enabled remote backends; otherwise `403`. Note: the journal records local-FS mutations; remote-backend ops go to the remote and aren't replayable from the journal.
- **FUSE mounts** — `mounts.create` to surface a remote backend AS a path in the local FS. Same deployment-side requirement.
- **chmod / chown** — Unix-only, and only where the deployment enabled them; otherwise `403`.

## When to use

- **Local container FS (the 90% case)** — CRUD, archive entry / extract, cross-binary search (glob, grep), download a URL into a path, resumable upload. Local works out of the box.
- **Recover / inspect a previous version of any file** — `?history=1`, `?revision=<seq>`, `?at=<unix-ms>`, `?diff=1&from_seq=<N>`. Available where journaling and journal API access are on (`403` when API access is off, `404` when recording is off), for writes the journal recorded and still retains (see Quirks for what is excluded).
- **Audit / replay every change to the filesystem** — `journal.list` for the full event stream (sequence, timestamp, path, op, size, hash).
- **Remote cloud / SSH / S3** — append `?backend=<id>` to read (`files.get`), upload (`files.upload`, not with `append`), delete (`files.delete`) or create a directory (`files.mkdir`). Only `files.get`, `files.upload`, `files.delete` and `files.mkdir` take a `backend` option, and `files.upload` refuses it with `400` together with `append`. `files.update`, `files.append`, `files.copy`, `files.move`, `files.archives.extract` and `files.downloads.create` have no `backend` option; do not bypass the types: with `owner`, `archives.extract` and `downloads.create` throw a client-side `ValidationError`, and without `owner` the option is dropped and the operation runs locally.
- **FUSE-mount a remote into the local FS** — when downstream code needs to read the remote as a regular path (under the mount directory, `/hoody/mounts/permanent/…` by default).

## When NOT to use

Run binaries -> `terminal`/`exec`, live events -> `watch`, TS/JS gen -> `exec`, indexed queries -> `sqlite`, traffic logs -> `proxyLogs`.

## Prerequisites

- **For plain read/stat/list**: no deployment switch, but any authentication and per-path access rules configured on the kit still apply (`401` without credentials, `403` for a path outside your rules). **Writes are enabled by the deployment, not per request**: upload/write/append and copy need write enabled, delete needs delete enabled, move needs both (403 otherwise; all enabled in the standard hoody_kit container image, off on a raw kit deployment that did not turn them on). Paths are absolute container paths; the namespace is not workspace-scoped, so use `/home/user/...`, `/etc/...`, etc.
- **For glob / grep**: gated separately — glob needs search enabled, grep needs grep enabled (403 "not allowed" otherwise; both enabled in the standard hoody_kit container image).
- **For remote backends** (`?backend=` / `?type=` / FUSE mounts): the deployment must have enabled remote backends; otherwise `403`.
- **For chmod / chown**: the deployment must have enabled them, and the container is Unix.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Read, search, write

1. `files.readText` / `files.readJson` / `files.readBytes` resolve to the content itself (string, parsed value, `Uint8Array`); `files.get` resolves to the `{ statusCode, message, data }` envelope, with `{ stat: '' }` or `{ lines: '10-50' }`.
2. `files.glob` with `{ pattern: '**/*.ts' }`; `files.grep` with `{ pattern: 'TODO', context: 2 }` (local only).
3. `files.upload` with `{ append: '', retries: 0 }`; `files.delete`. (`retries: 0` on an append: see Example 3, step 3.)

### 2. Download, extract, FUSE-mount

1. `downloads.create(dir, { download: url })`; `downloads.listByDirectory` to poll.
2. `archives.preview`; `archives.extract(archive, { extract: 'src/', dest: 'work-src' })` (`extract` is an exact entry name, or a directory prefix ending in `/`; no globs. `dest` MUST be relative).
3. `backends.createS3` (one `create*` method per backend type, e.g. `createSftp`) -> `files.get('/remote/path', { backend: id })` for one-shot reads OR `mounts.create` -> `files.list('/hoody/mounts/permanent/...')` for a regular FS view -> `mounts.delete`/`backends.delete`. (`files.list` itself has no `backend` option; `files.get`/`files.upload`/`files.delete` do.)

### 3. Journal time-travel + TUS-like upload

1. `files.get` with `{ history: '' }`, `{ revision: N }` or `{ at: '<unix-ms>' }`, `{ diff: '', from_seq: N }` (valueless flags take `''`).
2. `journal.list({ path, after_id })` (global entry id, not `seq`; see Purpose for the last-page cursor rule); `journal.flush` first.
3. Resumable: `files.upload` for the first chunk, then `files.append(path, bytes, { retries: 0 })` per chunk (Example 3); it takes raw bytes, no cast. `files.writeChunk(path, bytes)` also appends raw bytes, over the WebDAV route: it takes bytes directly and sets the append header itself, so do not pass `XUpdateRange` (the call throws if you do).

## Quirks & gotchas

- Reserved sub-prefixes (stat, chmod, chown, realpath, glob, grep, copy, move, append) dispatch by URL prefix, each scoped to a specific HTTP method (stat/grep/glob/realpath→GET, chmod/chown→PATCH, copy/move→POST, append→PUT) to prevent method bleeding -- so `DELETE /api/v1/files/stat/foo` does NOT trigger the stat dispatcher; it removes the literal path `/stat/foo`. `/api/v1/files/health` is a route of its own and never reaches the dispatcher.
- `glob`/`grep`/`realpath`/`?lines=` local-only; `?backend=` -> 400.
- `?backend=` and `?type=` need remote backends enabled deployment-side.
- `?backend=` on `/api/v1/files/{path}` is served only for GET, DELETE, PUT without `append`, and POST that creates a directory; on any other method or operation it returns `400` ("only supported for reading, uploading and deleting files and for creating directories").
- `chmod`/`chown` Unix-only, and only where the deployment enabled them.
- WebDAV verbs on `/{path}`: PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK, CHECKAUTH, LOGOUT.
- `realpath` resolves symlinks whether or not symlink following is enabled, but still returns `403` when the resolved target is outside the serve root or outside your access rules.
- **Resumable upload PATCH must use the WebDAV root route (`PATCH /{path}`), NOT `PATCH /api/v1/files/{path}`** — the api/v1 PATCH expects a JSON body and rejects raw bytes with `400 Invalid JSON body`. The WebDAV form takes `X-Update-Range: append` — or an HTTP-Range offset `bytes=<start>-<end>` (a Content-Range-style `/<size>` suffix is REJECTED with `400 Invalid X-Update-Range Header`) — plus the raw body, and returns `204 No Content` on success. An explicit range's start must fall INSIDE the current file, but only that start is used: the whole body is written from it, the range end does not bound the write, and a body longer than the rest of the file extends it. A start at or past EOF is refused, so use `append` to continue at the end..0)),"]
- **Archive `?dest=` MUST be relative** (e.g. `?dest=extracted`), not absolute — sending `?dest=/abs/path` returns `400 Absolute destination path not allowed`. The directory is created relative to the archive's containing dir.
- **`?preview` query value matters** — pass `?preview` empty (no `=…`) for a full archive listing; `?preview=true` is parsed as the entry name `true` and returns `404 Entry not found in archive: true`. Same trap on `?contents`.
- **Bare `?extract_file=` is unhandled by the kit's GET dispatcher** — the request falls through to "send the raw archive file" and you get the **whole archive's bytes**, not the selected entry. The generated SDK and CLI work around this by ALSO sending `?extract=` — when both query params are present, the `extract` branch runs (writes to disk under `?dest=`). The OpenAPI-only `?extract_file=` form is effectively dead.
- **The journal retains body bytes only for files up to 2 MiB by default; a larger file still produces a journal entry with its hash and size, but its contents are not kept**.
- **Exclusions decide which paths are journalled.** Built-in dev-dir excludes (`node_modules`, `target`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `__pycache__`, `.venv`, `venv`, `env`, `__pypackages__`, `.tox`, `.nox`, `bower_components`, …) skip journaling unless the deployment turned the dev-dir exclusions off. `.git` is always excluded regardless of that setting (separate hardcoded check, not part of the toggleable list). The deployment can add further excludes of its own. This is why "I wrote to `node_modules/x` and saw no journal entry" is expected.
- **Journal does NOT cover everything by default.** Live behaviour observed: a fresh `PUT` (create) and an overwriting `PUT` (write) on `/home/user/...` produce entries; URL downloads (`?download=`) and archive extraction are NOT journaled — those write through paths with no journal hook. `chmod`, `chown`, `touch`, `?append=true` and copy/move ARE recorded. Always call `journal.flush` then `journal.list` (or `?history=1`) to inspect what was actually recorded — don't assume coverage.
- **Built-in dev-dir exclude list always skips journaling** for `node_modules`, `__pycache__`, `.venv`, `target`, `.next`, `.nuxt`, etc. — even on `/home/user/...` paths. Only the deployment can turn these off, at kit start. `.git` is hardcoded to ALWAYS be excluded and stays excluded even then.
- **`HEAD` returns no body** on both routes. `HEAD /api/v1/files/{path}` ignores `Range`, so its status and headers need not match a ranged `GET`. It carries no metadata body; for a JSON metadata envelope use `files.stat`.
- **`chown` to root is rejected** with `400 Cannot change ownership to root (UID 0)` (owner) or `400 Cannot change group to root (GID 0)` (group) — even where the deployment enabled chown. Use a non-root user (`nobody`, `user`, …).
- **FUSE mount paths live under a configured mount directory** (`/hoody/mounts/permanent` by default, fixed by the deployment at kit start). An absolute `mount_path` must be under it (`400 Mount path must be under the configured mount directory` otherwise); a relative `mount_path` is resolved under it; an omitted one becomes `<mount dir>/mount_<id>`. If the path already exists and is not a symlink, the create fails with `409 Mount path already exists and is not a symlink`.
- **Listing-style query params (`?downloads`, `?download_history`, `?extractions`, `?extraction_history`) are honoured on the WebDAV root route, NOT on `/api/v1/files/...`** — calling `GET /api/v1/files/<dir>?downloads` returns a regular directory listing (the query is ignored). Use `GET /<dir>?downloads` (or `GET /?download_history` for the global feed).
- **Mount the whole FS as a local drive on the USER's machine (client-side WebDAV).** Because the kit serves a WebDAV API at its URL root, the OS's built-in WebDAV client can mount the container's files as a drive/folder: on **Windows** *Map network drive* to `https://{P}-{C}-files-1.{N}.containers.hoody.com/`, on **macOS** Finder → *Connect to Server* to the same URL. This is the inverse of the server-side FUSE mounts (which mount remote backends INTO the container); those have no safe save: the upload that reaches the backend last wins, so keep one writer per file there.

## Common errors

- 400 not supported with remote backends -- drop `?backend=`.
- 400 Cannot combine realpath with other ops.
- 400 Cannot preview a directory as archive.
- 400 Unknown operation -- POST needs one query op.
- 400 Missing query parameter or request body -- PATCH needs op or body.
- Refusals on the WebDAV path route (`/{path}`) answer JSON `{success: false, error, code}`: `ACCESS_FORBIDDEN` 403, `RESOURCE_NOT_FOUND` 404, `INVALID_PATH` 400, `PATH_CONFLICT` 409, `OVERWRITE_REFUSED` 412 (a WebDAV `COPY`/`MOVE` with `Overwrite: F` onto an existing target), `DIRECTORY_EXISTS` 405 (creating a directory that exists), `PAYLOAD_TOO_LARGE` 413, `UPLOAD_INCOMPLETE` 400 and `REMOTE_UPLOAD_FAILED` 502 (an upload to a remote backend), and `MOUNT_PATH_RESERVED` 409 for a change to a path a mount holds. `INVALID_PARAMETER` means the request itself is wrong; a failure that a changed request would not fix (an OS error, a backend failure, the concurrent-download limit's 429) carries no `code`, so branch on the status. On `/api/v1/files/{path}` many refusals carry no `code` — a REST copy or move onto an existing target without overwrite is 409 `{success: false, error}`. REST codes include `INVALID_PATH` 400 (`{success: false, error: "Invalid path", code: "INVALID_PATH"}`), `ACCESS_FORBIDDEN` 403 (a path rule), `CONTAINS_SERVICE_STORAGE` 409, `FILE_MOVE_CROSSES_DEVICES` 409, `INVALID_PARAMETER` 400 on some parameter checks, and `FILE_PATH_BUSY`, `FILE_PATH_CHANGED` and `MOUNT_PATH_RESERVED` 409 for a change to a path that is in use or held for a mount. `PERMISSIONS_NOT_APPLIED` and `OWNER_NOT_APPLIED` 409 mean the filesystem does not retain the requested permission bits or owner, as on a mount of remote storage: use storage that retains them when you need them. A chmod, or an upload whose requested permissions are narrower than the file's fixed ones, changes nothing; an upload requesting broader permissions writes its whole body under the fixed ones and still answers `PERMISSIONS_NOT_APPLIED`, so read the message before deciding whether to resend the body. When `code` is absent, branch on the HTTP status.
- A URL download streams into a hidden part file, `.hoody-download-<id>.part`, in the destination folder, and the file gets its final name only once it is complete. Cancelling the download (or a failure or timeout) removes that part file on a local filesystem (ext4, xfs, btrfs, tmpfs) only if its inode is still the one the download created. On FUSE mounts and network filesystems the partial file is kept, so check the destination for leftovers.

## Related namespaces

- `terminal` -- run binaries.
- `exec` -- TS/JS gen.
- `watch` -- live events.
- `sqlite` -- indexed queries.
- `browser`/`curl` -- scripted HTTP.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first. Examples that need history use `/home/user/...`. The kit has no fixed rule for `/tmp` or `/home/user`: coverage depends on the exclude lists, so check `?history` rather than assuming it. An idle kit may be asleep: the first request can return `502` from the proxy with an HTML error body, so retry 2-3 times with a few seconds of backoff.

### 1. Read a file — full bytes, stat envelope, and a slice of lines

**Goal:** inspect an unknown text file three ways: get its metadata, peek the raw bytes, and slice an arbitrary line range without pulling the whole thing.

**Step 1 — stat first.** `files.stat` returns size, owner/group, octal permissions, mtime, and, when the journal has recorded the path, `revisions`: the path's latest per-path revision number. The field is absent for a path the journal has not recorded, and it is not a count of the entries still retained after pruning. Use this BEFORE downloading a file you don't know the size of.

```typescript
const s = await client.files.stat('/etc/hostname');
console.log(s.data!.size, s.data!.permissions);
```

**Step 2 — line slice.** `?lines=2-3` returns just lines 2 through 3 inclusive. Local-FS only (rejected with `400` when combined with `?backend=`).

```typescript
const slice = await client.files.readText('/var/log/syslog', { lines: '2-3' });   // the two lines as a string
```

**Step 3 — full body.** No query params, raw bytes (or `Content-Type: application/octet-stream` for binaries).

```typescript
const body = await client.files.readText('/etc/hostname');   // readBytes for a binary file
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
import { randomBytes } from 'node:crypto';
await client.files.upload('/home/user/upload-test.bin', randomBytes(8 * 1024 * 1024));
```

**Step 2 — append remaining chunks.** Send `PATCH /<path>` (the WebDAV root route, NOT `/api/v1/files/...` — that one expects JSON and 400s on raw bytes). Header `X-Update-Range: append` says "concatenate". Returns `204 No Content`.

```typescript
import { randomBytes } from 'node:crypto';
// files.append sends raw bytes to PUT /api/v1/files/append/{path}; no cast needed.
await client.files.append('/home/user/upload-test.bin', randomBytes(8 * 1024 * 1024), { retries: 0 }); // retries: 0, see step 3
const s = await client.files.stat('/home/user/upload-test.bin');
```

**Step 3 — resume after a network drop.** A WebDAV append (`PATCH /{path}` with `X-Update-Range: append`) writes bytes as they arrive, so a request that broke off may already have added part of its chunk. A REST append (`PUT /api/v1/files/append/{path}`, or an upload with `append`) stages the whole body first, so a body that broke off leaves the file unchanged, although a failure during the write that follows can still leave part of the chunk appended. Either way, do not resend the whole chunk blindly: stat the remote file, compare its size with how many bytes of the payload you have sent, and append only the bytes after that size. An explicit `bytes=<start>-<end>` range (no `/<total>` suffix — that is rejected) must start inside the existing file and writes the whole body from that start, so it can rewrite a tail you know is wrong, but a start at EOF is refused; appending is the way to continue. The generated SDK sends only appends (`files.append`); explicit byte ranges need raw HTTP. Pass `{ retries: 0 }` to `files.append`, and to `files.upload` when using `append: ''`: the SDK sends these as `PUT`, and by default it sends a `PUT` again after a lost connection, so a chunk the kit already applied (whose response was lost) would be appended twice. After a failed call, stat the file before deciding which bytes to send next.

### 4. Time-travel a single file — history → revision N → diff

**Goal:** roll back a config file by reading an earlier revision, comparing it to current, then writing the chosen revision back. Use a path the journal covers: not under an excluded directory (`.git`, dev dirs such as `node_modules`, or excludes the deployment added — see Quirks), and confirm with `?history`.

**Step 1 — write two revisions.**

```typescript
const path = '/home/user/config.toml';
await client.files.upload(path, Buffer.from('verbose = false'));
await new Promise(r => setTimeout(r, 1000));
await client.files.upload(path, Buffer.from('verbose = true'));
await client.files.journal.flush();
```

**Step 2 — list history.** `?history=1` returns one page of the per-revision log (100 entries by default, `limit` up to 1000; while `has_more` is `true`, repeat with `after_id` set to the response's `next_after_id`): each entry has `seq`, `op` (`"create"` / `"write"` / `"delete"` / `"moved_from"`/`"moved_to"` / etc. — see Example 5 for the full enum), `ts`, hashes, and size deltas.

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

### 5. Audit — stream every mutation since a cursor via the journal

**Goal:** wire a SIEM / alerting pipeline. Get every FS mutation since the last cursor, including hashes for tamper detection. Don't forget `journal.flush` first.

**Step 1 — flush so buffered journal writes are on disk.**

```typescript
await client.files.journal.flush();
```

**Step 2 — query since cursor.** `after_id` is the last `id` you've seen. `op` enum is `"create"` / `"write"` / `"append"` / `"delete"` / `"touch"` / `"moved_from"` / `"moved_to"` / `"copied_from"` / `"copied_to"` / `"dir_moved_from"` / `"dir_moved_to"` / `"dir_copied_from"` / `"dir_copied_to"` / `"dir_deleted"` / `"mkdir"` / `"chmod"` / `"chown"` / `"gap"` (no bare `"move"`/`"copy"` — use the directional `"moved_from"`/`"moved_to"` etc. pair).

The response carries `has_more`. `next_after_id` is set only while `has_more` is true; on the last page it is `null`. Advance the cursor to `next_after_id` when it is set, otherwise to the last entry's `id`, and keep the old cursor when the page is empty. Storing `null` would restart the next poll from the beginning of the journal.

```typescript
let cursor = 0;   // persist client-side
const r = await client.files.journal.list({ limit: 200, after_id: cursor });
const { entries, has_more, next_after_id } = r.data!;
cursor = next_after_id ?? entries.at(-1)?.id ?? cursor;
// has_more === true means another page is waiting: query again right away.
```

**Step 3 — health check.** Watch `journal.getStats` for `writer_healthy:false`, `parse_failures`, or `skipped_overflow > 0` — any of those means the audit trail is degraded.

```typescript
const s = await client.files.journal.getStats();
```

### 6. Download a URL straight into the FS (no curl, no wget needed)

**Goal:** pull an asset from the public internet into a container path. The kit handles the actual HTTP fetch — useful for sandboxed containers without outbound HTTP libs.

**Step 1 — download.** `GET /<directory>?download=<url>&filename=<name>` (URL-encode the URL). The directory must already exist (a missing one is `404`), so create it first. The request waits until the download has finished, then answers `201` with a `download_id`; to watch progress, list active downloads from a separate request while this one is still running.

```typescript
await client.files.mkdir('/home/user/inbox');   // the target directory must exist
const r = await client.files.downloads.create('/home/user/inbox', {
  download: 'https://httpbin.org/robots.txt',
  filename: 'robots.txt',
  timeout: 15,
});
```

**Step 2 — list active** (from a second request while a download runs; a finished one moves to the history). `?downloads` ONLY works on the WebDAV root route — `GET /api/v1/files/<dir>?downloads` ignores the flag and returns a normal listing.

```typescript
await client.files.downloads.listByDirectory('/home/user/inbox', { downloads: '' });
await client.files.downloads.listHistory({ download_history: '' });
```

### 7. Archive workflow — preview, then selective extract

**Goal:** extract just one subpath of a zip without unpacking the whole archive.

**Step 1 — preview** to see what's inside. `?preview` MUST be empty — `?preview=true` is parsed as the entry name `true` and 404s.

```typescript
const p = await client.files.archives.preview('/home/user/inbox/hello.zip');
```

**Step 2 — extract a subset.** `?extract=<entry>` selects entries: an exact archive entry name extracts that one file, a directory prefix ending in `/` (`src/`) extracts that subtree, and an empty value extracts everything. There is no glob matching (`src/**` matches nothing). `?dest=` MUST be relative — absolute paths return `400 Absolute destination path not allowed`. Destination is created relative to the archive's parent dir.

```typescript
await client.files.archives.extract('/home/user/inbox/hello.zip', { extract: 'Hello-World-master/', dest: 'extracted' });
```

**Step 3 — extract a single file to disk.** Pass BOTH `?extract=<entry>` and `?extract_file=<entry>` (the bare `?extract_file=` form falls through to "send whole archive"). The kit writes the matched entry under `?dest=`; without `dest` it creates a directory named after the archive beside it (`hello.zip` → `hello/`, `x.tar.gz` → `x/`) and extracts there.

```typescript
// extract-file writes the chosen entry under `dest` and returns an extraction
// response; to get the bytes back, follow up with files.get(`${dest}/<entry>`).
const extracted = await client.files.archives.extractMember('/home/user/inbox/hello.zip', { extract: 'Hello-World-master/README', dest: 'extracted' });
```

### 8. Cross-directory copy + move + chmod (a one-shot deploy)

**Goal:** stage a config in a working dir, copy to the target, set permissions, move the staging file to a backup folder. Uses POST against the copy/move reserved-prefix routes (`/api/v1/files/copy/...`, `/move/...`) and PATCH for chmod/chown (`/api/v1/files/chmod/...`, `/chown/...`).

**Step 1 — copy.** Both `copy_to` and (for move) `move_to` are **query params**, NOT body fields. Add `?overwrite=true` to allow replacing an existing destination.

```typescript
await client.files.copy('/home/user/staging/app.toml', { copy_to: '/etc/myapp/app.toml', overwrite: 'true' });
```

**Step 2 — chmod.** Octal as a query param (`?chmod=600`). Requires chmod enabled by the deployment; Unix-only.

```typescript
await client.files.chmod('/etc/myapp/app.toml', { chmod: '600' });
```

**Step 3 — move staging → archive.** Same pattern as copy but no overwrite by default; `?move_to=` is required.

```typescript
await client.files.move('/home/user/staging/app.toml', { move_to: '/home/user/archive/app.toml' });
```

### 9. Connect a remote backend, mount it as a path, list through both surfaces

**Goal:** attach a remote backend (here `sftp`, with a placeholder host, user and password; `s3`, `drive` and the other types take the same steps with their own config) and surface it as a regular FS path via FUSE. Requires remote backends enabled by the deployment.

**Step 1 — connect.** Each backend has its own `POST /api/v1/backends/<type>` with type-specific config. Returns `201` with `{success, message, data: {id, type, vfs_backend_type, config, mount_paths}}`; the backend id is `data.id` (`config` has credentials stripped).

```typescript
const conn = await client.files.backends.createSftp({
  host: 'sftp.example.com',
  user: 'deploy',
  pass: process.env.SFTP_PASS!,
  description: 'sftp-example',
});
const bid = conn.data.data!.id!;   // SDK envelope .data wraps the kit body {success, message, data}
await client.files.backends.test(bid);
```

**Step 2 — mount.** `mount_path` is resolved against the kit's configured mount directory (default `/hoody/mounts/permanent`): an absolute path must be under it (`400 Mount path must be under the configured mount directory` otherwise), a relative path is joined under it, and an existing non-symlink path returns `409 Mount path already exists and is not a symlink`.

```typescript
const m = await client.files.mounts.create({
  backend_id: bid,
  label: 'sftp-mount',
  mount_path: '/hoody/mounts/permanent/sftp-test',
});
const mid = m.data.data!.id!;
```

**Step 3 — read through the mount as a regular path.**

```typescript
await client.files.list('/hoody/mounts/permanent/sftp-test');
```

**Step 4 — tear down** (in order: unmount, then disconnect).

```typescript
await client.files.mounts.delete(mid);
await client.files.backends.delete(bid);
```

### 10. Bulk delete a tree — and verify nothing is left

**Goal:** wipe a working directory and every file under it, then confirm via journal + listing that nothing remains. The recursive delete is not atomic: if it fails partway, the entries already removed stay removed and the rest remain, so always verify.

**Step 1 — DELETE on the directory.** `DELETE /api/v1/files/<dir>` removes recursively. (Reserved-prefix trap: a path like `/api/v1/files/stat/foo` is interpreted as removing `/stat/foo`, NOT a stat call. Always use absolute container paths.)

```typescript
await client.files.delete('/home/user/files-examples-cleanup');
```

**Step 2 — verify.** A `404` from `files.stat` is what you want.

```typescript
try { await client.files.stat('/home/user/files-examples-cleanup'); }
catch (e: any) { if (e.status === 404) console.log('gone'); else throw e; }
```

**Step 3 — confirm via journal.** A journaled directory delete records one `op: "dir_deleted"` entry for the directory itself (no per-path `seq`), not an entry per child; deleting a single file records `op: "delete"`. Flush first.

```typescript
await client.files.journal.flush();
const r = await client.files.journal.list({ path: '/home/user/files-examples-cleanup', limit: 10 });
```

## Reference

**Accessor:** `client.files`  |  **Import:** `import * as files from 'hoody-sdk/files'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, containerId?, serviceIndex?, server? }`, which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are refused) and `cache` (a GET's response cache: `true`, a TTL in ms, or `false` to bypass) (no `_realm`: that one is control-plane only). When the signature shows an options object, the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself is complete as written: the object after it takes the transport options too.

### `client.files.archives` (4) — Archive operations - extract, preview, download directories as ZIP

#### `extract` — Extract archive

```typescript
client.files.archives.extract(path: string, options: { extract?: string; dest?: string; owner: string })  // → Promise<PostFileOperationResponse>
client.files.archives.extract(archive: string, options?: { dest?: string; extract?: string })  // → Promise<ExtractArchiveResponse>
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `extract` | `string` | query | No | Empty for full extraction; path for selective (e.g. "src/" or "lib/") |
| `dest` | `string` | query | No | Destination directory name (default: archive name) |
| `owner` | `string` | query | Yes | Create-time owner for newly-created inodes as user[:group] or uid[:gid]. Requires the deployment to have enabled chown, and must resolve to one of the owners it permits; refuses root (uid/gid 0). Absent → the server default create owner. Applies to mkdir/extract/download_from/copy_to. |

**Returns:** see each form above  |  **HTTP:** `GET /{archive}?extract`
**CLI:** `hoody files archives extract`

---

#### `extractMember` — Extract file from archive

```typescript
client.files.archives.extractMember(archive: string, options: { extract: string; dest?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `archive` | `string` | path | Yes | Path to archive file |
| `extract` | `string` | query | Yes | Path of the file or directory inside the archive to extract (e.g. "src/" or "lib/") |
| `dest` | `string` | query | No | Destination directory name (default: archive name) |

**Returns:** `Promise<FilesArchivesExtractMemberResponse>`  |  **HTTP:** `GET /{archive}?extract_file`
**CLI:** `hoody files archives members extract`

---

#### `preview` — Preview archive contents or read file

```typescript
client.files.archives.preview(archive: string, options?: { preview?: string; contents?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `archive` | `string` | path | Yes | Path to archive file |
| `preview` | `string` | query | No | Empty value lists archive contents; non-empty value reads a specific file from the archive (alias: ?contents) |
| `contents` | `string` | query | No | Alias for ?preview |

**Returns:** `Promise<FilesArchivesPreviewResponse>`  |  **HTTP:** `GET /{archive}?preview`
**CLI:** `hoody files archives preview`

---

#### `readMember` — View file from archive

```typescript
client.files.archives.readMember(archive: string, options: { preview: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `archive` | `string` | path | Yes | Path to archive file |
| `preview` | `string` | query | Yes | Path of the file inside the archive to view (e.g. "src/" or "README.md") |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /{archive}?view_file`
**CLI:** `hoody files archives members read`

---

### `client.files.backends` (54) — Backend management - connect, list, test, and disconnect remote cloud storage backends

#### `createAzureblob` — Connect to azureblob backend

```typescript
client.files.backends.createAzureblob(data: FilesBackendsCreateAzureblobRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateAzureblobRequest` | body | Yes |  |

**Body:** `{ access_tier: string="", account: string="", archive_tier_delete: bool=false, chunk_size: string="4194304", client_certificate_password: string="", client_id: string="", client_secret: string="", client_send_certificate_chain: bool=false, copy_concurrency: int=512, copy_cutoff: string="8388608", copy_total_concurrency: int=0, decompress: bool=false, delete_snapshots: "" | "include" | "only"="", description: string="", directory_markers: bool=false, disable_checksum: bool=false, disable_instance_discovery: bool=false, encoding: string="21078018", endpoint: string="", env_auth: false=false, key: string="", list_chunk: int=5000, list_parallelism: int=0, memory_pool_flush_time: int=60, memory_pool_use_mmap: bool=false, msi_client_id: string="", msi_mi_res_id: string="", msi_object_id: string="", no_check_container: bool=false, no_head_object: bool=false, password: string="", public_access: "" | "blob" | "container"="", sas_url: string="", tenant: string="", upload_concurrency: int=16, upload_cutoff: string="", use_arrow_list: bool=false, use_az: false=false, use_copy_blob: bool=true, use_emulator: false=false, use_msi: false=false, username: string="" }`

**Returns:** `Promise<FilesBackendsCreateAzureblobResponse>`  |  **HTTP:** `POST /api/v1/backends/azureblob`
**CLI:** `hoody files backends azureblob create`

---

#### `createAzurefiles` — Connect to azurefiles backend

```typescript
client.files.backends.createAzurefiles(data: FilesBackendsCreateAzurefilesRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateAzurefilesRequest` | body | Yes |  |

**Body:** `{ account: string="", chunk_size: string="4194304", client_certificate_password: string="", client_id: string="", client_secret: string="", client_send_certificate_chain: bool=false, description: string="", disable_instance_discovery: bool=false, encoding: string="54634382", endpoint: string="", env_auth: false=false, key: string="", max_stream_size: string="10737418240", msi_client_id: string="", msi_mi_res_id: string="", msi_object_id: string="", password: string="", sas_url: string="", share_name: string="", tenant: string="", upload_concurrency: int=16, use_az: false=false, use_emulator: false=false, use_msi: false=false, username: string="" }`

**Returns:** `Promise<FilesBackendsCreateAzurefilesResponse>`  |  **HTTP:** `POST /api/v1/backends/azurefiles`
**CLI:** `hoody files backends azurefiles create`

---

#### `createB2` — Connect to b2 backend

```typescript
client.files.backends.createB2(data: FilesBackendsCreateB2Request)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateB2Request` | body | Yes |  |

**Body:** `{ account*: string="", chunk_size: string="100663296", copy_cutoff: string="4294967296", description: string="", disable_checksum: bool=false, download_auth_duration: int=604800, download_url: string="", encoding: string="50438146", endpoint: string="", hard_delete: bool=false, key*: string="", lifecycle: int=0, memory_pool_flush_time: int=60, memory_pool_use_mmap: bool=false, sse_customer_algorithm: "" | "AES256"="", sse_customer_key: ""="", sse_customer_key_base64: ""="", sse_customer_key_md5: ""="", test_mode: string="", upload_concurrency: int=4, upload_cutoff: string="209715200", version_at: string="0001-01-01T00:00:00Z", versions: bool=false }`

**Returns:** `Promise<FilesBackendsCreateB2Response>`  |  **HTTP:** `POST /api/v1/backends/b2`
**CLI:** `hoody files backends b2 create`

---

#### `createBox` — Connect to box backend

```typescript
client.files.backends.createBox(data: FilesBackendsCreateBoxRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateBoxRequest` | body | Yes |  |

**Body:** `{ access_token: string="", auth_url: string="", box_sub_type: "user" | "enterprise"="user", client_credentials: bool=false, client_id: string="", client_secret: string="", commit_retries: int=100, description: string="", encoding: string="52535298", impersonate: string="", list_chunk: int=1000, owned_by: string="", root_folder_id: string="0", token: string="", token_url: string="", upload_cutoff: string="52428800" }`

**Returns:** `Promise<FilesBackendsCreateBoxResponse>`  |  **HTTP:** `POST /api/v1/backends/box`
**CLI:** `hoody files backends box create`

---

#### `createCloudinary` — Connect to cloudinary backend

```typescript
client.files.backends.createCloudinary(data: FilesBackendsCreateCloudinaryRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateCloudinaryRequest` | body | Yes |  |

**Body:** `{ adjust_media_files_extensions: bool=true, api_key*: string="", api_secret*: string="", cloud_name*: string="", description: string="", encoding: string="52543246", eventually_consistent_delay: int=0, media_extensions: string="3ds,3g2,3gp,ai,arw,avi,avif,bmp,bw,cr2,cr3,djvu,dng,eps3,fbx,flif,flv,gif,glb,gltf,hdp,heic,heif,ico,indd,jp2,jpe,jpeg,jpg,jxl,jxr,m2ts,mov,mp4,mpeg,mts,mxf,obj,ogv,pdf,ply,png,psd,svg,tga,tif,tiff,ts,u3ma,usdz,wdp,webm,webp,wmv", upload_prefix: string="", upload_preset: string="" }`

**Returns:** `Promise<FilesBackendsCreateCloudinaryResponse>`  |  **HTTP:** `POST /api/v1/backends/cloudinary`
**CLI:** `hoody files backends cloudinary create`

---

#### `createDrive` — Connect to drive backend

```typescript
client.files.backends.createDrive(data: FilesBackendsCreateDriveRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateDriveRequest` | body | Yes |  |

**Body:** `{ acknowledge_abuse: bool=false, allow_import_name_change: bool=false, alternate_export: bool=false, auth_owner_only: bool=false, auth_url: string="", chunk_size: string="8388608", client_credentials: bool=false, client_id: string="", client_secret: string="", copy_shortcut_content: bool=false, description: string="", disable_http2: bool=true, encoding: string="16777216", env_auth: false=false, export_formats: string="docx,xlsx,pptx,svg", fast_list_bug_fix: bool=true, formats: string="", impersonate: string="", import_formats: string="", keep_revision_forever: bool=false, list_chunk: int=1000, metadata_enforce_expansive_access: bool=false, metadata_labels: "off" | "read" | "write" | "failok" | "read,write"="0", metadata_owner: "off" | "read" | "write" | "failok" | "read,write"="1", metadata_permissions: "off" | "read" | "write" | "failok" | "read,write"="0", pacer_burst: int=100, pacer_min_sleep: int=0, resource_key: string="", root_folder_id: string="", scope: "drive" | "drive.readonly" | "drive.file" | "drive.appfolder" | "drive.metadata.readonly"="", server_side_across_configs: bool=false, service_account_credentials: string="", shared_with_me: bool=false, show_all_gdocs: bool=false, size_as_quota: bool=false, skip_checksum_gphotos: bool=false, skip_dangling_shortcuts: bool=false, skip_gdocs: bool=false, skip_shortcuts: bool=false, starred_only: bool=false, stop_on_download_limit: bool=false, stop_on_upload_limit: bool=false, team_drive: string="", token: string="", token_url: string="", trashed_only: bool=false, upload_cutoff: string="8388608", use_created_date: bool=false, use_shared_date: bool=false, use_trash: bool=true, v2_download_min_size: string="-1" }`

**Returns:** `Promise<FilesBackendsCreateDriveResponse>`  |  **HTTP:** `POST /api/v1/backends/drive`
**CLI:** `hoody files backends drive create`

---

#### `createDropbox` — Connect to dropbox backend

```typescript
client.files.backends.createDropbox(data: FilesBackendsCreateDropboxRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateDropboxRequest` | body | Yes |  |

**Body:** `{ auth_url: string="", batch_commit_timeout: int=600, batch_mode: string="sync", batch_size: int=0, batch_timeout: int=0, chunk_size: string="50331648", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="52469762", export_formats: string="html,md", impersonate: string="", impersonate_admin: string="", pacer_min_sleep: int=0, root_namespace: string="", shared_files: bool=false, shared_folders: bool=false, show_all_exports: bool=false, skip_exports: bool=false, skip_shared_folders: bool=false, skip_unowned_folders: bool=false, token: string="", token_url: string="" }`

**Returns:** `Promise<FilesBackendsCreateDropboxResponse>`  |  **HTTP:** `POST /api/v1/backends/dropbox`
**CLI:** `hoody files backends dropbox create`

---

#### `createFichier` — Connect to fichier backend

```typescript
client.files.backends.createFichier(data: FilesBackendsCreateFichierRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateFichierRequest` | body | Yes |  |

**Body:** `{ api_key: string="", cdn: bool=false, description: string="", encoding: string="52666494", file_password: string="", folder_password: string="", shared_folder: string="" }`

**Returns:** `Promise<FilesBackendsCreateFichierResponse>`  |  **HTTP:** `POST /api/v1/backends/fichier`
**CLI:** `hoody files backends fichier create`

---

#### `createFilefabric` — Connect to filefabric backend

```typescript
client.files.backends.createFilefabric(data: FilesBackendsCreateFilefabricRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateFilefabricRequest` | body | Yes |  |

**Body:** `{ description: string="", encoding: string="50429954", permanent_token: string="", root_folder_id: string="", token: string="", token_expiry: string="", url*: "https://storagemadeeasy.com" | "https://eu.storagemadeeasy.com" | "https://yourfabric.smestorage.com"="", version: string="" }`

**Returns:** `Promise<FilesBackendsCreateFilefabricResponse>`  |  **HTTP:** `POST /api/v1/backends/filefabric`
**CLI:** `hoody files backends filefabric create`

---

#### `createFilescom` — Connect to filescom backend

```typescript
client.files.backends.createFilescom(data: FilesBackendsCreateFilescomRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateFilescomRequest` | body | Yes |  |

**Body:** `{ api_key: string="", description: string="", encoding: string="60923906", password: string="", site: string="", username: string="" }`

**Returns:** `Promise<FilesBackendsCreateFilescomResponse>`  |  **HTTP:** `POST /api/v1/backends/filescom`
**CLI:** `hoody files backends filescom create`

---

#### `createFtp` — Connect to ftp backend

```typescript
client.files.backends.createFtp(data: FilesBackendsCreateFtpRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateFtpRequest` | body | Yes |  |

**Body:** `{ allow_insecure_tls_ciphers: bool=false, ask_password: bool=false, close_timeout: int=60, concurrency: int=0, description: string="", disable_epsv: bool=false, disable_mlsd: bool=false, disable_tls13: bool=false, disable_utf8: bool=false, encoding: "Asterisk,Ctl,Dot,Slash" | "BackSlash,Ctl,Del,Dot,RightSpace,Slash,SquareBracket" | "Ctl,LeftPeriod,Slash"="35749890", explicit_tls: bool=false, force_list_hidden: bool=false, host*: string="", http_proxy: string="", idle_timeout: int=60, no_check_upload: bool=false, pass: string="", port: int=21, shut_timeout: int=60, socks_proxy: string="", tls: bool=false, tls_cache_size: int=32, user: string="user", writing_mdtm: bool=false }`

- `explicit_tls` — Use Explicit FTPS (FTP over TLS). When using explicit FTP over TLS the client explicitly requests security from the server in order to upgrade a plain text connection to an encrypted one. Cannot be used in combination with implicit FTPS.
- `tls` — Use Implicit FTPS (FTP over TLS). When using implicit FTP over TLS the client connects using TLS right from the start which breaks compatibility with non-TLS-aware servers. This is usually served over port 990 rather than port 21. Cannot be used in combination with explicit FTPS.

**Returns:** `Promise<FilesBackendsCreateFtpResponse>`  |  **HTTP:** `POST /api/v1/backends/ftp`
**CLI:** `hoody files backends ftp create`

---

#### `createGofile` — Connect to gofile backend

```typescript
client.files.backends.createGofile(data: FilesBackendsCreateGofileRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateGofileRequest` | body | Yes |  |

**Body:** `{ access_token: string="", account_id: string="", description: string="", encoding: string="323331982", list_chunk: int=1000, root_folder_id: string="" }`

**Returns:** `Promise<FilesBackendsCreateGofileResponse>`  |  **HTTP:** `POST /api/v1/backends/gofile`
**CLI:** `hoody files backends gofile create`

---

#### `createGoogleCloudStorage` — Connect to google cloud storage backend

```typescript
client.files.backends.createGoogleCloudStorage(data: FilesBackendsCreateGoogleCloudStorageRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateGoogleCloudStorageRequest` | body | Yes |  |

**Body:** `{ access_token: string="", anonymous: bool=false, auth_url: string="", bucket_acl: "authenticatedRead" | "private" | "projectPrivate" | "publicRead" | "publicReadWrite"="", bucket_policy_only: bool=false, client_credentials: bool=false, client_id: string="", client_secret: string="", decompress: bool=false, description: string="", directory_markers: bool=false, encoding: string="50348034", endpoint: "storage.example.org" | "storage.example.org:4443" | "storage.example.org:4443/gcs/api"="", env_auth: false=false, location: "" | "asia" | "eu" | "us" | "asia-east1" | "asia-east2" | "asia-northeast1" | "asia-northeast2" | "asia-northeast3" | "asia-south1" | "asia-south2" | "asia-southeast1" | "asia-southeast2" | "australia-southeast1" | "australia-southeast2" | "europe-north1" | "europe-west1" | "europe-west2" | "europe-west3" | "europe-west4" | "europe-west6" | "europe-central2" | "us-central1" | "us-east1" | "us-east4" | "us-east5" | "us-west1" | "us-west2" | "us-west3" | "us-west4" | "northamerica-northeast1" | "northamerica-northeast2" | "southamerica-east1" | "southamerica-west1" | "asia1" | "eur4" | "nam4"="", no_check_bucket: bool=false, object_acl: "authenticatedRead" | "bucketOwnerFullControl" | "bucketOwnerRead" | "private" | "projectPrivate" | "publicRead"="", project_number: string="", service_account_credentials: string="", storage_class: "" | "MULTI_REGIONAL" | "REGIONAL" | "NEARLINE" | "COLDLINE" | "ARCHIVE" | "DURABLE_REDUCED_AVAILABILITY"="", token: string="", token_url: string="", user_project: string="" }`

- `access_token` — Short-lived access token. Leave blank normally. Needed only if you want use short-lived access token instead of interactive login.
- `project_number` — Project number. Optional - needed only for list/create/delete buckets - see your developer console.
- `service_account_credentials` — Service Account Credentials JSON blob. Leave blank normally. Needed only if you want use SA instead of interactive login.
- `user_project` — User project. Optional - needed only for requester pays.

**Returns:** `Promise<FilesBackendsCreateGoogleCloudStorageResponse>`  |  **HTTP:** `POST /api/v1/backends/google-cloud-storage`
**CLI:** `hoody files backends googlecloudstorage create`

---

#### `createGooglePhotos` — Connect to google photos backend

```typescript
client.files.backends.createGooglePhotos(data: FilesBackendsCreateGooglePhotosRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateGooglePhotosRequest` | body | Yes |  |

**Body:** `{ auth_url: string="", batch_commit_timeout: int=600, batch_mode: string="sync", batch_size: int=0, batch_timeout: int=0, client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50348034", include_archived: bool=false, proxy: string="", read_only: bool=false, read_size: bool=false, start_year: int=2000, token: string="", token_url: string="" }`

**Returns:** `Promise<FilesBackendsCreateGooglePhotosResponse>`  |  **HTTP:** `POST /api/v1/backends/google-photos`
**CLI:** `hoody files backends googlephotos create`

---

#### `createHdfs` — Connect to hdfs backend

```typescript
client.files.backends.createHdfs(data: FilesBackendsCreateHdfsRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateHdfsRequest` | body | Yes |  |

**Body:** `{ data_transfer_protection: "privacy"="", description: string="", encoding: string="50430082", namenode*: string="", username: "root"="" }`

- `data_transfer_protection` — Kerberos data transfer protection: authentication|integrity|privacy. Specifies whether or not authentication, data signature integrity checks, and wire encryption are required when communicating with the datanodes. … Used only with KERBEROS enabled.

**Returns:** `Promise<FilesBackendsCreateHdfsResponse>`  |  **HTTP:** `POST /api/v1/backends/hdfs`
**CLI:** `hoody files backends hdfs create`

---

#### `createHidrive` — Connect to hidrive backend

```typescript
client.files.backends.createHidrive(data: FilesBackendsCreateHidriveRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateHidriveRequest` | body | Yes |  |

**Body:** `{ auth_url: string="", chunk_size: string="50331648", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", disable_fetching_member_count: bool=false, encoding: string="33554434", endpoint: string="https://api.hidrive.strato.com/2.1", root_prefix: "/" | "root" | ""="/", scope_access: "rw" | "ro"="rw", scope_role: "user" | "admin" | "owner"="user", token: string="", token_url: string="", upload_concurrency: int=4, upload_cutoff: string="100663296" }`

**Returns:** `Promise<FilesBackendsCreateHidriveResponse>`  |  **HTTP:** `POST /api/v1/backends/hidrive`
**CLI:** `hoody files backends hidrive create`

---

#### `createHttp` — Connect to http backend

```typescript
client.files.backends.createHttp(data: FilesBackendsCreateHttpRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateHttpRequest` | body | Yes |  |

**Body:** `{ description: string="", headers: string="", no_escape: bool=false, no_head: bool=false, no_slash: bool=false, url*: string="" }`

- `headers` — Set HTTP headers for all transactions. … When headers are set, a redirect from https to http is refused as it would send them in cleartext.

**Returns:** `Promise<FilesBackendsCreateHttpResponse>`  |  **HTTP:** `POST /api/v1/backends/http`
**CLI:** `hoody files backends http create`

---

#### `createIclouddrive` — Connect to iclouddrive backend

```typescript
client.files.backends.createIclouddrive(data: FilesBackendsCreateIclouddriveRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateIclouddriveRequest` | body | Yes |  |

**Body:** `{ apple_id*: string="", client_id: string="d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d", cookies: string="", description: string="", encoding: string="50438146", password*: string="", service: "drive" | "photos"="drive", trust_token: string="" }`

**Returns:** `Promise<FilesBackendsCreateIclouddriveResponse>`  |  **HTTP:** `POST /api/v1/backends/iclouddrive`
**CLI:** `hoody files backends iclouddrive create`

---

#### `createImagekit` — Connect to imagekit backend

```typescript
client.files.backends.createImagekit(data: FilesBackendsCreateImagekitRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateImagekitRequest` | body | Yes |  |

**Body:** `{ description: string="", encoding: string="117553486", endpoint*: string="", only_signed: bool=false, private_key*: string="", public_key*: string="", upload_tags: string="", versions: bool=false }`

**Returns:** `Promise<FilesBackendsCreateImagekitResponse>`  |  **HTTP:** `POST /api/v1/backends/imagekit`
**CLI:** `hoody files backends imagekit create`

---

#### `createInternetarchive` — Connect to internetarchive backend

```typescript
client.files.backends.createInternetarchive(data: FilesBackendsCreateInternetarchiveRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateInternetarchiveRequest` | body | Yes |  |

**Body:** `{ access_key_id: string="", description: string="", disable_checksum: bool=true, encoding: string="50446342", endpoint: string="https://s3.us.archive.org", front_endpoint: string="https://archive.org", item_derive: bool=true, item_metadata: string="", secret_access_key: string="", wait_archive: int=0 }`

**Returns:** `Promise<FilesBackendsCreateInternetarchiveResponse>`  |  **HTTP:** `POST /api/v1/backends/internetarchive`
**CLI:** `hoody files backends internetarchive create`

---

#### `createJottacloud` — Connect to jottacloud backend

```typescript
client.files.backends.createJottacloud(data: FilesBackendsCreateJottacloudRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateJottacloudRequest` | body | Yes |  |

**Body:** `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50435982", hard_delete: bool=false, md5_memory_limit: string="10485760", no_versions: bool=false, token: string="", token_url: string="", trashed_only: bool=false, upload_resume_limit: string="10485760" }`

- `md5_memory_limit` — Files bigger than this will be cached on disk to calculate the MD5 if required.

**Returns:** `Promise<FilesBackendsCreateJottacloudResponse>`  |  **HTTP:** `POST /api/v1/backends/jottacloud`
**CLI:** `hoody files backends jottacloud create`

---

#### `createKoofr` — Connect to koofr backend

```typescript
client.files.backends.createKoofr(data: FilesBackendsCreateKoofrRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateKoofrRequest` | body | Yes |  |

**Body:** `{ description: string="", encoding: string="50438146", endpoint*: string="", mountid: string="", password*: string="", provider: "koofr" | "digistorage" | "other"="", setmtime: bool=true, user*: string="" }`

**Returns:** `Promise<FilesBackendsCreateKoofrResponse>`  |  **HTTP:** `POST /api/v1/backends/koofr`
**CLI:** `hoody files backends koofr create`

---

#### `createLinkbox` — Connect to linkbox backend

```typescript
client.files.backends.createLinkbox(data: FilesBackendsCreateLinkboxRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateLinkboxRequest` | body | Yes |  |

**Body:** `{ description: string="", email*: string="", password*: string="", token*: string="", web_token: string="" }`

**Returns:** `Promise<FilesBackendsCreateLinkboxResponse>`  |  **HTTP:** `POST /api/v1/backends/linkbox`
**CLI:** `hoody files backends linkbox create`

---

#### `createMailru` — Connect to mailru backend

```typescript
client.files.backends.createMailru(data: FilesBackendsCreateMailruRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateMailruRequest` | body | Yes |  |

**Body:** `{ auth_url: string="", check_hash: "true" | "false"=true, client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50440078", pass*: string="", speedup_enable: "true" | "false"=true, speedup_file_patterns: "" | "*" | "*.mkv,*.avi,*.mp4,*.mp3" | "*.zip,*.gz,*.rar,*.pdf"="*.mkv,*.avi,*.mp4,*.mp3,*.zip,*.gz,*.rar,*.pdf", speedup_max_disk: "0" | "1G" | "3G"="3221225472", speedup_max_memory: "0" | "32M" | "256M"="33554432", token: string="", token_url: string="", user*: string="", user_agent: string="" }`

- `pass` — Password. This must be an app password - Hoody will not work with your normal password. See the Configuration section in the docs for how to make an app password.
- `speedup_enable` — Skip full upload if there is another file with same data hash. … Please note that Hoody may need local memory and disk space to calculate content hash in advance and decide whether full upload is required. …

**Returns:** `Promise<FilesBackendsCreateMailruResponse>`  |  **HTTP:** `POST /api/v1/backends/mailru`
**CLI:** `hoody files backends mailru create`

---

#### `createMega` — Connect to mega backend

```typescript
client.files.backends.createMega(data: FilesBackendsCreateMegaRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateMegaRequest` | body | Yes |  |

**Body:** `{ 2fa: string="", debug: bool=false, description: string="", encoding: string="50331650", hard_delete: bool=false, master_key: string="", pass: string="", password: string, session_id: string="", use_https: bool=false, user*: string="" } (at least one of: pass | password required)`

- `password` — Another name for pass. An empty value is ignored; a value that differs from a non-empty pass is refused with 400.

**Returns:** `Promise<FilesBackendsCreateMegaResponse>`  |  **HTTP:** `POST /api/v1/backends/mega`
**CLI:** `hoody files backends mega create`

---

#### `createNetstorage` — Connect to netstorage backend

```typescript
client.files.backends.createNetstorage(data: FilesBackendsCreateNetstorageRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateNetstorageRequest` | body | Yes |  |

**Body:** `{ account*: string="", description: string="", host*: string="", protocol: "http" | "https"="https", secret*: string="" }`

**Returns:** `Promise<FilesBackendsCreateNetstorageResponse>`  |  **HTTP:** `POST /api/v1/backends/netstorage`
**CLI:** `hoody files backends netstorage create`

---

#### `createOnedrive` — Connect to onedrive backend

```typescript
client.files.backends.createOnedrive(data: FilesBackendsCreateOnedriveRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateOnedriveRequest` | body | Yes |  |

**Body:** `{ access_scopes: "Files.Read Files.ReadWrite Files.Read.All Files.ReadWrite.All Sites.Read.All offline_access" | "Files.Read Files.Read.All Sites.Read.All offline_access" | "Files.Read Files.ReadWrite Files.Read.All Files.ReadWrite.All offline_access"="Files.Read Files.ReadWrite Files.Read.All Files.ReadWrite.All Sites.Read.All offline_access", auth_url: string="", av_override: bool=false, chunk_size: string="10485760", client_credentials: bool=false, client_id: string="", client_secret: string="", delta: bool=false, description: string="", disable_site_permission: bool=false, drive_id: string="", drive_type: string="", encoding: string="57386894", expose_onenote_files: bool=false, hard_delete: bool=false, hash_type: "auto" | "quickxor" | "sha1" | "sha256" | "crc32" | "none"="auto", link_password: string="", link_scope: "anonymous" | "organization"="anonymous", link_type: "view" | "edit" | "embed"="view", list_chunk: int=1000, metadata_permissions: "off" | "read" | "write" | "read,write" | "failok"="0", no_versions: bool=false, region: "global" | "us" | "de" | "cn"="global", root_folder_id: string="", server_side_across_configs: bool=false, tenant: string="", tenant_url: string="", token: string="", token_url: string="", upload_cutoff: string="-1" }`

**Returns:** `Promise<FilesBackendsCreateOnedriveResponse>`  |  **HTTP:** `POST /api/v1/backends/onedrive`
**CLI:** `hoody files backends onedrive create`

---

#### `createOpendrive` — Connect to opendrive backend

```typescript
client.files.backends.createOpendrive(data: FilesBackendsCreateOpendriveRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateOpendriveRequest` | body | Yes |  |

**Body:** `{ access: "private" | "public" | "hidden"="private", chunk_size: string="10485760", description: string="", encoding: string="62007182", password*: string="", username*: string="" }`

**Returns:** `Promise<FilesBackendsCreateOpendriveResponse>`  |  **HTTP:** `POST /api/v1/backends/opendrive`
**CLI:** `hoody files backends opendrive create`

---

#### `createOracleobjectstorage` — Connect to oracleobjectstorage backend

```typescript
client.files.backends.createOracleobjectstorage(data: FilesBackendsCreateOracleobjectstorageRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateOracleobjectstorageRequest` | body | Yes |  |

**Body:** `{ attempt_resume_upload: bool=false, chunk_size: string="5242880", compartment: string="", copy_cutoff: string="4999610368", copy_timeout: int=60, decompress: bool=false, description: string="", disable_checksum: bool=false, encoding: string="50331650", endpoint: string="", leave_parts_on_error: bool=false, max_upload_parts: int=10000, namespace*: string="", no_check_bucket: bool=false, provider*: "no_auth"="no_auth", region*: string="", sse_customer_algorithm: "" | "AES256"="", sse_customer_key: ""="", sse_customer_key_sha256: ""="", sse_kms_key_id: ""="", storage_tier: "Standard" | "InfrequentAccess" | "Archive"="Standard", upload_concurrency: int=10, upload_cutoff: string="209715200" }`

**Returns:** `Promise<FilesBackendsCreateOracleobjectstorageResponse>`  |  **HTTP:** `POST /api/v1/backends/oracleobjectstorage`
**CLI:** `hoody files backends oracleobjectstorage create`

---

#### `createPcloud` — Connect to pcloud backend

```typescript
client.files.backends.createPcloud(data: FilesBackendsCreatePcloudRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreatePcloudRequest` | body | Yes |  |

**Body:** `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50438146", hostname: "api.pcloud.com" | "eapi.pcloud.com"="api.pcloud.com", password: string="", root_folder_id: string="d0", token: string="", token_url: string="", username: string="" }`

- `username` — Your pcloud username. This is only required when you want to use the cleanup command. Due to a bug in the pcloud API the required API does not support OAuth authentication so we have to rely on user password authentication for it.

**Returns:** `Promise<FilesBackendsCreatePcloudResponse>`  |  **HTTP:** `POST /api/v1/backends/pcloud`
**CLI:** `hoody files backends pcloud create`

---

#### `createPikpak` — Connect to pikpak backend

```typescript
client.files.backends.createPikpak(data: FilesBackendsCreatePikpakRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreatePikpakRequest` | body | Yes |  |

**Body:** `{ chunk_size: string="5242880", description: string="", device_id: string="", encoding: string="56829838", hash_memory_limit: string="10485760", no_media_link: bool=false, pass: string="", root_folder_id: string="", trashed_only: bool=false, upload_concurrency: int=4, upload_cutoff: string="209715200", use_trash: bool=true, user: string="", user_agent: string="Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0" }`

- `hash_memory_limit` — Files bigger than this will be cached on disk to calculate hash if required.

**Returns:** `Promise<FilesBackendsCreatePikpakResponse>`  |  **HTTP:** `POST /api/v1/backends/pikpak`
**CLI:** `hoody files backends pikpak create`

---

#### `createPixeldrain` — Connect to pixeldrain backend

```typescript
client.files.backends.createPixeldrain(data: FilesBackendsCreatePixeldrainRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreatePixeldrainRequest` | body | Yes |  |

**Body:** `{ api_key: string="", api_url: string="https://pixeldrain.com/api", description: string="", root_folder_id: string="me" }`

**Returns:** `Promise<FilesBackendsCreatePixeldrainResponse>`  |  **HTTP:** `POST /api/v1/backends/pixeldrain`
**CLI:** `hoody files backends pixeldrain create`

---

#### `createPremiumizeme` — Connect to premiumizeme backend

```typescript
client.files.backends.createPremiumizeme(data: FilesBackendsCreatePremiumizemeRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreatePremiumizemeRequest` | body | Yes |  |

**Body:** `{ api_key: string="", auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50438154", token: string="", token_url: string="" }`

**Returns:** `Promise<FilesBackendsCreatePremiumizemeResponse>`  |  **HTTP:** `POST /api/v1/backends/premiumizeme`
**CLI:** `hoody files backends premiumizeme create`

---

#### `createProtondrive` — Connect to protondrive backend

```typescript
client.files.backends.createProtondrive(data: FilesBackendsCreateProtondriveRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateProtondriveRequest` | body | Yes |  |

**Body:** `{ 2fa: string="", app_version: string="", client_access_token: string="", client_refresh_token: string="", client_salted_key_pass: string="", client_uid: string="", description: string="", enable_caching: bool=true, encoding: string="52559874", mailbox_password: string="", original_file_size: bool=true, otp_secret_key: string="", password: string="", replace_existing_draft: bool=false, username: string="" }`

**Returns:** `Promise<FilesBackendsCreateProtondriveResponse>`  |  **HTTP:** `POST /api/v1/backends/protondrive`
**CLI:** `hoody files backends protondrive create`

---

#### `createPutio` — Connect to putio backend

```typescript
client.files.backends.createPutio(data: FilesBackendsCreatePutioRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreatePutioRequest` | body | Yes |  |

**Body:** `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50438146", token: string="", token_url: string="" }`

**Returns:** `Promise<FilesBackendsCreatePutioResponse>`  |  **HTTP:** `POST /api/v1/backends/putio`
**CLI:** `hoody files backends putio create`

---

#### `createQingstor` — Connect to qingstor backend

```typescript
client.files.backends.createQingstor(data: FilesBackendsCreateQingstorRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateQingstorRequest` | body | Yes |  |

**Body:** `{ access_key_id: string="", chunk_size: string="4194304", connection_retries: int=3, description: string="", encoding: string="16842754", endpoint: string="", env_auth: false=false, secret_access_key: string="", upload_concurrency: int=1, upload_cutoff: string="209715200", zone: "pek3a" | "sh1a" | "gd2a"="" }`

**Returns:** `Promise<FilesBackendsCreateQingstorResponse>`  |  **HTTP:** `POST /api/v1/backends/qingstor`
**CLI:** `hoody files backends qingstor create`

---

#### `createQuatrix` — Connect to quatrix backend

```typescript
client.files.backends.createQuatrix(data: FilesBackendsCreateQuatrixRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateQuatrixRequest` | body | Yes |  |

**Body:** `{ api_key*: string="", description: string="", effective_upload_time: string="4s", encoding: string="50438146", hard_delete: bool=false, host*: string="", maximal_summary_chunk_size: string="100000000", minimal_chunk_size: string="10000000", skip_project_folders: bool=false }`

**Returns:** `Promise<FilesBackendsCreateQuatrixResponse>`  |  **HTTP:** `POST /api/v1/backends/quatrix`
**CLI:** `hoody files backends quatrix create`

---

#### `createS3` — Connect to s3 backend

```typescript
client.files.backends.createS3(data: FilesBackendsCreateS3Request)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateS3Request` | body | Yes |  |

**Body:** `{ access_key_id: string="", acl: "private" | "public-read" | "public-read-write" | "authenticated-read" | "bucket-owner-read" | "bucket-owner-full-control" | "default"="", bucket_acl: "private" | "public-read" | "public-read-write" | "authenticated-read"="", bucket_object_lock_enabled: bool=false, bypass_governance_retention: bool=false, chunk_size: string="5242880", copy_cutoff: string="4999610368", decompress: bool=false, description: string="", directory_bucket: bool=false, directory_markers: bool=false, disable_checksum: bool=false, disable_http2: bool=false, download_url: string="", encoding: string="50331650", endpoint: "oss-accelerate.aliyuncs.com" | "oss-accelerate-overseas.aliyuncs.com" | "oss-cn-hangzhou.aliyuncs.com" | "oss-cn-shanghai.aliyuncs.com" | "oss-cn-qingdao.aliyuncs.com" | "oss-cn-beijing.aliyuncs.com" | "oss-cn-zhangjiakou.aliyuncs.com" | "oss-cn-huhehaote.aliyuncs.com" | "oss-cn-wulanchabu.aliyuncs.com" | "oss-cn-shenzhen.aliyuncs.com" | "oss-cn-heyuan.aliyuncs.com" | "oss-cn-guangzhou.aliyuncs.com" | "oss-cn-chengdu.aliyuncs.com" | "oss-cn-hongkong.aliyuncs.com" | "oss-us-west-1.aliyuncs.com" | "oss-us-east-1.aliyuncs.com" | "oss-ap-southeast-1.aliyuncs.com" | "oss-ap-southeast-2.aliyuncs.com" | "oss-ap-southeast-3.aliyuncs.com" | "oss-ap-southeast-5.aliyuncs.com" | "oss-ap-northeast-1.aliyuncs.com" | "oss-ap-south-1.aliyuncs.com" | "oss-eu-central-1.aliyuncs.com" | "oss-eu-west-1.aliyuncs.com" | "oss-me-east-1.aliyuncs.com" | "s3.ir-thr-at1.arvanstorage.ir" | "s3.ir-tbz-sh1.arvanstorage.ir" | "hn.ss.bfcplatform.vn" | "hcm.ss.bfcplatform.vn" | "eos-wuxi-1.cmecloud.cn" | "eos-jinan-1.cmecloud.cn" | "eos-ningbo-1.cmecloud.cn" | "eos-shanghai-1.cmecloud.cn" | "eos-zhengzhou-1.cmecloud.cn" | "eos-hunan-1.cmecloud.cn" | "eos-zhuzhou-1.cmecloud.cn" | "eos-guangzhou-1.cmecloud.cn" | "eos-dongguan-1.cmecloud.cn" | "eos-beijing-1.cmecloud.cn" | "eos-beijing-2.cmecloud.cn" | "eos-beijing-4.cmecloud.cn" | "eos-huhehaote-1.cmecloud.cn" | "eos-chengdu-1.cmecloud.cn" | "eos-chongqing-1.cmecloud.cn" | "eos-guiyang-1.cmecloud.cn" | "eos-xian-1.cmecloud.cn" | "eos-yunnan.cmecloud.cn" | "eos-yunnan-2.cmecloud.cn" | "eos-tianjin-1.cmecloud.cn" | "eos-jilin-1.cmecloud.cn" | "eos-hubei-1.cmecloud.cn" | "eos-jiangxi-1.cmecloud.cn" | "eos-gansu-1.cmecloud.cn" | "eos-shanxi-1.cmecloud.cn" | "eos-liaoning-1.cmecloud.cn" | "eos-hebei-1.cmecloud.cn" | "eos-fujian-1.cmecloud.cn" | "eos-guangxi-1.cmecloud.cn" | "eos-anhui-1.cmecloud.cn" | "s3.cubbit.eu" | "s3.{tenant_name}.cubbit.eu" | "syd1.digitaloceanspaces.com" | "sfo3.digitaloceanspaces.com" | "sfo2.digitaloceanspaces.com" | "fra1.digitaloceanspaces.com" | "nyc3.digitaloceanspaces.com" | "ams3.digitaloceanspaces.com" | "sgp1.digitaloceanspaces.com" | "lon1.digitaloceanspaces.com" | "tor1.digitaloceanspaces.com" | "blr1.digitaloceanspaces.com" | "objects-us-east-1.dream.io" | "au-east-1.object.fastlystorage.app" | "eu-central.object.fastlystorage.app" | "eu-south-1.object.fastlystorage.app" | "eu-west-1.object.fastlystorage.app" | "jp-central-1.object.fastlystorage.app" | "uk-east-1.object.fastlystorage.app" | "us-central-1.object.fastlystorage.app" | "us-east.object.fastlystorage.app" | "us-east-1.object.fastlystorage.app" | "us-west.object.fastlystorage.app" | "us-west-1.object.fastlystorage.app" | "s5lu.com" | "us.s5lu.com" | "eu.s5lu.com" | "ap.s5lu.com" | "me.s5lu.com" | "https://storage.googleapis.com" | "hel1.your-objectstorage.com" | "fsn1.your-objectstorage.com" | "nbg1.your-objectstorage.com" | "obs.af-south-1.myhuaweicloud.com" | "obs.ap-southeast-2.myhuaweicloud.com" | "obs.ap-southeast-3.myhuaweicloud.com" | "obs.cn-east-3.myhuaweicloud.com" | "obs.cn-east-2.myhuaweicloud.com" | "obs.cn-north-1.myhuaweicloud.com" | "obs.cn-north-4.myhuaweicloud.com" | "obs.cn-south-1.myhuaweicloud.com" | "obs.ap-southeast-1.myhuaweicloud.com" | "obs.sa-argentina-1.myhuaweicloud.com" | "obs.sa-peru-1.myhuaweicloud.com" | "obs.na-mexico-1.myhuaweicloud.com" | "obs.sa-chile-1.myhuaweicloud.com" | "obs.sa-brazil-1.myhuaweicloud.com" | "obs.ru-northwest-2.myhuaweicloud.com" | "s3.us.cloud-object-storage.appdomain.cloud" | "s3.dal.us.cloud-object-storage.appdomain.cloud" | "s3.wdc.us.cloud-object-storage.appdomain.cloud" | "s3.sjc.us.cloud-object-storage.appdomain.cloud" | "s3.private.us.cloud-object-storage.appdomain.cloud" | "s3.private.dal.us.cloud-object-storage.appdomain.cloud" | "s3.private.wdc.us.cloud-object-storage.appdomain.cloud" | "s3.private.sjc.us.cloud-object-storage.appdomain.cloud" | "s3.us-east.cloud-object-storage.appdomain.cloud" | "s3.private.us-east.cloud-object-storage.appdomain.cloud" | "s3.us-south.cloud-object-storage.appdomain.cloud" | "s3.private.us-south.cloud-object-storage.appdomain.cloud" | "s3.eu.cloud-object-storage.appdomain.cloud" | "s3.fra.eu.cloud-object-storage.appdomain.cloud" | "s3.mil.eu.cloud-object-storage.appdomain.cloud" | "s3.ams.eu.cloud-object-storage.appdomain.cloud" | "s3.private.eu.cloud-object-storage.appdomain.cloud" | "s3.private.fra.eu.cloud-object-storage.appdomain.cloud" | "s3.private.mil.eu.cloud-object-storage.appdomain.cloud" | "s3.private.ams.eu.cloud-object-storage.appdomain.cloud" | "s3.eu-gb.cloud-object-storage.appdomain.cloud" | "s3.private.eu-gb.cloud-object-storage.appdomain.cloud" | "s3.eu-de.cloud-object-storage.appdomain.cloud" | "s3.private.eu-de.cloud-object-storage.appdomain.cloud" | "s3.ap.cloud-object-storage.appdomain.cloud" | "s3.tok.ap.cloud-object-storage.appdomain.cloud" | "s3.hkg.ap.cloud-object-storage.appdomain.cloud" | "s3.seo.ap.cloud-object-storage.appdomain.cloud" | "s3.private.ap.cloud-object-storage.appdomain.cloud" | "s3.private.tok.ap.cloud-object-storage.appdomain.cloud" | "s3.private.hkg.ap.cloud-object-storage.appdomain.cloud" | "s3.private.seo.ap.cloud-object-storage.appdomain.cloud" | "s3.jp-tok.cloud-object-storage.appdomain.cloud" | "s3.private.jp-tok.cloud-object-storage.appdomain.cloud" | "s3.au-syd.cloud-object-storage.appdomain.cloud" | "s3.private.au-syd.cloud-object-storage.appdomain.cloud" | "s3.ams03.cloud-object-storage.appdomain.cloud" | "s3.private.ams03.cloud-object-storage.appdomain.cloud" | "s3.che01.cloud-object-storage.appdomain.cloud" | "s3.private.che01.cloud-object-storage.appdomain.cloud" | "s3.mel01.cloud-object-storage.appdomain.cloud" | "s3.private.mel01.cloud-object-storage.appdomain.cloud" | "s3.osl01.cloud-object-storage.appdomain.cloud" | "s3.private.osl01.cloud-object-storage.appdomain.cloud" | "s3.tor01.cloud-object-storage.appdomain.cloud" | "s3.private.tor01.cloud-object-storage.appdomain.cloud" | "s3.seo01.cloud-object-storage.appdomain.cloud" | "s3.private.seo01.cloud-object-storage.appdomain.cloud" | "s3.mon01.cloud-object-storage.appdomain.cloud" | "s3.private.mon01.cloud-object-storage.appdomain.cloud" | "s3.mex01.cloud-object-storage.appdomain.cloud" | "s3.private.mex01.cloud-object-storage.appdomain.cloud" | "s3.sjc04.cloud-object-storage.appdomain.cloud" | "s3.private.sjc04.cloud-object-storage.appdomain.cloud" | "s3.mil01.cloud-object-storage.appdomain.cloud" | "s3.private.mil01.cloud-object-storage.appdomain.cloud" | "s3.hkg02.cloud-object-storage.appdomain.cloud" | "s3.private.hkg02.cloud-object-storage.appdomain.cloud" | "s3.par01.cloud-object-storage.appdomain.cloud" | "s3.private.par01.cloud-object-storage.appdomain.cloud" | "s3.sng01.cloud-object-storage.appdomain.cloud" | "s3.private.sng01.cloud-object-storage.appdomain.cloud" | "eu-central-2.storage.impossibleapi.net" | "eu-west-1.storage.impossibleapi.net" | "eu-west-2.storage.impossibleapi.net" | "eu-west-3.storage.impossibleapi.net" | "eu-east-1.storage.impossibleapi.net" | "eu-north-1.storage.impossibleapi.net" | "us-east-1.storage.impossibleapi.net" | "de-fra.i3storage.com" | "s3.eu-central-1.ionoscloud.com" | "s3.eu-central-2.ionoscloud.com" | "s3.eu-central-3.ionoscloud.com" | "s3.eu-central-4.ionoscloud.com" | "s3.eu-south-2.ionoscloud.com" | "s3.us-central-1.ionoscloud.com" | "s3.leviia.com" | "storage.iran.liara.space" | "nl-ams-1.linodeobjects.com" | "us-southeast-1.linodeobjects.com" | "in-maa-1.linodeobjects.com" | "us-ord-1.linodeobjects.com" | "eu-central-1.linodeobjects.com" | "id-cgk-1.linodeobjects.com" | "gb-lon-1.linodeobjects.com" | "us-lax-1.linodeobjects.com" | "es-mad-1.linodeobjects.com" | "us-mia-1.linodeobjects.com" | "it-mil-1.linodeobjects.com" | "us-east-1.linodeobjects.com" | "jp-osa-1.linodeobjects.com" | "fr-par-1.linodeobjects.com" | "br-gru-1.linodeobjects.com" | "us-sea-1.linodeobjects.com" | "ap-south-1.linodeobjects.com" | "example-1.linodeobjects.com" | "se-sto-1.linodeobjects.com" | "jp-tyo-1.linodeobjects.com" | "us-iad-10.linodeobjects.com" | "s3.us-west-1.{account_name}.lyve.seagate.com" | "s3.eu-west-1.{account_name}.lyve.seagate.com" | "br-se1.magaluobjects.com" | "br-ne1.magaluobjects.com" | "s3.eu-luxembourg-1.megas4.com" | "s3.eu-luxembourg-2.megas4.com" | "s3.eu-amsterdam-1.megas4.com" | "s3.eu-amsterdam-2.megas4.com" | "s3.eu-paris-1.megas4.com" | "s3.eu-paris-2.megas4.com" | "s3.eu-barcelona-1.megas4.com" | "s3.eu-barcelona-2.megas4.com" | "s3.ca-montreal-1.megas4.com" | "s3.ca-montreal-2.megas4.com" | "s3.ca-vancouver-1.megas4.com" | "s3.ca-vancouver-2.megas4.com" | "s3.ap-tokyo-1.megas4.com" | "s3.ap-tokyo-2.megas4.com" | "oos.eu-west-2.outscale.com" | "oos.us-east-2.outscale.com" | "oos.us-west-1.outscale.com" | "oos.cloudgouv-eu-west-1.outscale.com" | "oos.ap-northeast-1.outscale.com" | "s3.gra.io.cloud.ovh.net" | "s3.rbx.io.cloud.ovh.net" | "s3.sbg.io.cloud.ovh.net" | "s3.eu-west-par.io.cloud.ovh.net" | "s3.de.io.cloud.ovh.net" | "s3.uk.io.cloud.ovh.net" | "s3.waw.io.cloud.ovh.net" | "s3.bhs.io.cloud.ovh.net" | "s3.ca-east-tor.io.cloud.ovh.net" | "s3.sgp.io.cloud.ovh.net" | "s3.ap-southeast-syd.io.cloud.ovh.net" | "s3.ap-south-mum.io.cloud.ovh.net" | "s3.us-east-va.io.cloud.ovh.us" | "s3.us-west-or.io.cloud.ovh.us" | "s3.rbx-archive.io.cloud.ovh.net" | "s3.petabox.io" | "s3.us-east-1.petabox.io" | "s3.eu-central-1.petabox.io" | "s3.ap-southeast-1.petabox.io" | "s3.me-south-1.petabox.io" | "s3.sa-east-1.petabox.io" | "s3-cn-east-1.qiniucs.com" | "s3-cn-east-2.qiniucs.com" | "s3-cn-north-1.qiniucs.com" | "s3-cn-south-1.qiniucs.com" | "s3-us-north-1.qiniucs.com" | "s3-ap-southeast-1.qiniucs.com" | "s3-ap-northeast-1.qiniucs.com" | "s3.us-east-1.rabata.io" | "s3.eu-west-1.rabata.io" | "s3.eu-west-2.rabata.io" | "s3.rackcorp.com" | "au.s3.rackcorp.com" | "au-nsw.s3.rackcorp.com" | "au-qld.s3.rackcorp.com" | "au-vic.s3.rackcorp.com" | "au-wa.s3.rackcorp.com" | "ph.s3.rackcorp.com" | "th.s3.rackcorp.com" | "hk.s3.rackcorp.com" | "mn.s3.rackcorp.com" | "kg.s3.rackcorp.com" | "id.s3.rackcorp.com" | "jp.s3.rackcorp.com" | "sg.s3.rackcorp.com" | "de.s3.rackcorp.com" | "us.s3.rackcorp.com" | "us-east-1.s3.rackcorp.com" | "us-west-1.s3.rackcorp.com" | "nz.s3.rackcorp.com" | "s3.nl-ams.scw.cloud" | "s3.fr-par.scw.cloud" | "s3.pl-waw.scw.cloud" | "localhost:8333" | "s3.ru-1.storage.selcloud.ru" | "s3.ru-3.storage.selcloud.ru" | "s3.ru-7.storage.selcloud.ru" | "s3.gis-1.storage.selcloud.ru" | "s3.kz-1.storage.selcloud.ru" | "s3.uz-2.storage.selcloud.ru" | "s3.uz-2.srvstorage.uz" | "s3.kz-1.srvstorage.kz" | "gateway.storjshare.io" | "eu-001.s3.synologyc2.net" | "eu-002.s3.synologyc2.net" | "us-001.s3.synologyc2.net" | "us-002.s3.synologyc2.net" | "tw-001.s3.synologyc2.net" | "cos.ap-beijing.myqcloud.com" | "cos.ap-nanjing.myqcloud.com" | "cos.ap-shanghai.myqcloud.com" | "cos.ap-guangzhou.myqcloud.com" | "cos.ap-chengdu.myqcloud.com" | "cos.ap-chongqing.myqcloud.com" | "cos.ap-hongkong.myqcloud.com" | "cos.ap-singapore.myqcloud.com" | "cos.ap-mumbai.myqcloud.com" | "cos.ap-seoul.myqcloud.com" | "cos.ap-bangkok.myqcloud.com" | "cos.ap-tokyo.myqcloud.com" | "cos.na-siliconvalley.myqcloud.com" | "cos.na-ashburn.myqcloud.com" | "cos.na-toronto.myqcloud.com" | "cos.eu-frankfurt.myqcloud.com" | "cos.eu-moscow.myqcloud.com" | "cos.accelerate.myqcloud.com" | "s3-cn-bj.ufileos.com" | "s3-cn-wlcb.ufileos.com" | "s3-cn-sh2.ufileos.com" | "s3-cn-gd.ufileos.com" | "s3-hk.ufileos.com" | "s3-us-ca.ufileos.com" | "s3-sg.ufileos.com" | "s3-idn-jakarta.ufileos.com" | "s3-tw-tp.ufileos.com" | "s3-afr-nigeria.ufileos.com" | "s3-bra-saopaulo.ufileos.com" | "s3-uae-dubai.ufileos.com" | "s3-ge-fra.ufileos.com" | "s3-vn-sng.ufileos.com" | "s3-us-ws.ufileos.com" | "s3-ind-mumbai.ufileos.com" | "s3-kr-seoul.ufileos.com" | "s3-jpn-tky.ufileos.com" | "s3-th-bkk.ufileos.com" | "s3-uk-london.ufileos.com" | "s3-rus-mosc.ufileos.com" | "s3-cn-guiyang1.ufileos.com" | "s3-pk-khi.ufileos.com" | "s3.wasabisys.com" | "s3.us-east-2.wasabisys.com" | "s3.us-central-1.wasabisys.com" | "s3.us-west-1.wasabisys.com" | "s3.ca-central-1.wasabisys.com" | "s3.eu-central-1.wasabisys.com" | "s3.eu-central-2.wasabisys.com" | "s3.eu-west-1.wasabisys.com" | "s3.eu-west-2.wasabisys.com" | "s3.eu-south-1.wasabisys.com" | "s3.ap-northeast-1.wasabisys.com" | "s3.ap-northeast-2.wasabisys.com" | "s3.ap-southeast-1.wasabisys.com" | "s3.ap-southeast-2.wasabisys.com" | "idr01.zata.ai" | "fra1.s3.zeroservices.eu" | "fra.s3.zeroservices.eu" | "eyl1.s3.zeroservices.eu"="", env_auth: false=false, force_path_style: bool=true, ibm_api_key: string="", ibm_iam_endpoint: string="", ibm_resource_instance_id: string="", leave_parts_on_error: bool=false, list_chunk: int=1000, list_url_encode: string="unset", list_version: int=0, list_versions_oldest_first: string="unset", location_constraint: "" | "us-east-2" | "us-west-1" | "us-west-2" | "ca-central-1" | "eu-west-1" | "eu-west-2" | "eu-west-3" | "eu-north-1" | "eu-south-1" | "EU" | "ap-southeast-1" | "ap-southeast-2" | "ap-northeast-1" | "ap-northeast-2" | "ap-northeast-3" | "ap-south-1" | "ap-east-1" | "sa-east-1" | "il-central-1" | "me-south-1" | "af-south-1" | "cn-north-1" | "cn-northwest-1" | "us-gov-east-1" | "us-gov-west-1" | "ir-thr-at1" | "ir-tbz-sh1" | "wuxi1" | "jinan1" | "ningbo1" | "shanghai1" | "zhengzhou1" | "hunan1" | "zhuzhou1" | "guangzhou1" | "dongguan1" | "beijing1" | "beijing2" | "beijing4" | "huhehaote1" | "chengdu1" | "chongqing1" | "guiyang1" | "xian1" | "yunnan" | "yunnan2" | "tianjin1" | "jilin1" | "hubei1" | "jiangxi1" | "gansu1" | "shanxi1" | "liaoning1" | "hebei1" | "fujian1" | "guangxi1" | "anhui1" | "us-standard" | "us-vault" | "us-cold" | "us-flex" | "us-east-standard" | "us-east-vault" | "us-east-cold" | "us-east-flex" | "us-south-standard" | "us-south-vault" | "us-south-cold" | "us-south-flex" | "eu-standard" | "eu-vault" | "eu-cold" | "eu-flex" | "eu-gb-standard" | "eu-gb-vault" | "eu-gb-cold" | "eu-gb-flex" | "ap-standard" | "ap-vault" | "ap-cold" | "ap-flex" | "mel01-standard" | "mel01-vault" | "mel01-cold" | "mel01-flex" | "tor01-standard" | "tor01-vault" | "tor01-cold" | "tor01-flex" | "cn-east-1" | "cn-east-2" | "cn-south-1" | "us-north-1" | "us-east-1" | "global" | "au" | "au-nsw" | "au-qld" | "au-vic" | "au-wa" | "ph" | "th" | "hk" | "mn" | "kg" | "id" | "jp" | "sg" | "de" | "us" | "nz"="", max_upload_parts: int=10000, memory_pool_flush_time: int=60, memory_pool_use_mmap: bool=false, might_gzip: string="unset", no_check_bucket: bool=false, no_head: bool=false, no_head_object: bool=false, no_system_metadata: bool=false, object_lock_legal_hold_status: "ON" | "OFF" | "copy"="", object_lock_mode: "GOVERNANCE" | "COMPLIANCE" | "copy"="", object_lock_retain_until_date: "copy" | "2030-01-01T00:00:00Z" | "365d" | "1y"="", object_lock_set_after_upload: bool=false, object_lock_supported: string="unset", provider: "AWS" | "Alibaba" | "ArvanCloud" | "BizflyCloud" | "Ceph" | "ChinaMobile" | "Cloudflare" | "Cubbit" | "DigitalOcean" | "Dreamhost" | "Exaba" | "Fastly" | "FileLu" | "FlashBlade" | "GCS" | "HCP" | "Hetzner" | "HuaweiOBS" | "IBMCOS" | "IDrive" | "ImpossibleCloud" | "Intercolo" | "IONOS" | "Leviia" | "Liara" | "Linode" | "LyveCloud" | "Magalu" | "Mega" | "Minio" | "Netease" | "Outscale" | "OVHcloud" | "Petabox" | "Qiniu" | "Rabata" | "RackCorp" | "Hoody-VFS" | "Scaleway" | "Scality" | "SeaweedFS" | "Selectel" | "Servercore" | "SpectraLogic" | "Storj" | "Synology" | "TencentCOS" | "US3" | "Wasabi" | "Zadara" | "Zata" | "ZeroServices" | "Other"="", region: "us-east-1" | "us-east-2" | "us-west-1" | "us-west-2" | "ca-central-1" | "eu-west-1" | "eu-west-2" | "eu-west-3" | "eu-north-1" | "eu-south-1" | "eu-central-1" | "ap-southeast-1" | "ap-southeast-2" | "ap-northeast-1" | "ap-northeast-2" | "ap-northeast-3" | "ap-south-1" | "ap-east-1" | "sa-east-1" | "il-central-1" | "me-south-1" | "af-south-1" | "cn-north-1" | "cn-northwest-1" | "us-gov-east-1" | "us-gov-west-1" | "hn" | "hcm" | "" | "other-v2-signature" | "auto" | "au-east-1" | "eu-central" | "jp-central-1" | "uk-east-1" | "us-central-1" | "us-east" | "us-west" | "global" | "ap-southeast" | "me-central" | "hel1" | "fsn1" | "nbg1" | "ap-southeast-3" | "cn-east-3" | "cn-east-2" | "cn-north-4" | "cn-south-1" | "sa-argentina-1" | "sa-peru-1" | "na-mexico-1" | "sa-chile-1" | "sa-brazil-1" | "ru-northwest-2" | "eu-central-2" | "eu-east-1" | "de-fra" | "de" | "eu-central-3" | "eu-central-4" | "eu-south-2" | "cloudgouv-eu-west-1" | "gra" | "rbx" | "sbg" | "eu-west-par" | "uk" | "waw" | "bhs" | "ca-east-tor" | "sgp" | "ap-southeast-syd" | "ap-south-mum" | "us-east-va" | "us-west-or" | "rbx-archive" | "cn-east-1" | "us-north-1" | "au" | "au-nsw" | "au-qld" | "au-vic" | "au-wa" | "ph" | "th" | "hk" | "mn" | "kg" | "id" | "jp" | "sg" | "us" | "nz" | "nl-ams" | "fr-par" | "pl-waw" | "ru-1" | "ru-3" | "ru-7" | "gis-1" | "kz-1" | "uz-2" | "eu-001" | "eu-002" | "us-001" | "us-002" | "tw-001" | "zero-fra1" | "zero-fra2" | "zero-eyl1"="", requester_pays: bool=false, role_arn: string="", role_external_id: string="", role_session_duration: string="", role_session_name: string="", sdk_log_mode: string="0", secret_access_key: string="", server_side_encryption: "" | "AES256" | "aws:kms"="", session_token: string="", sign_accept_encoding: string="unset", sse_customer_algorithm: "" | "AES256"="", sse_customer_key: ""="", sse_customer_key_base64: ""="", sse_customer_key_md5: ""="", sse_kms_key_id: "" | "arn:aws:kms:us-east-1:*"="", storage_class: "" | "STANDARD" | "REDUCED_REDUNDANCY" | "STANDARD_IA" | "ONEZONE_IA" | "GLACIER" | "DEEP_ARCHIVE" | "INTELLIGENT_TIERING" | "GLACIER_IR" | "EXPRESS_ONEZONE" | "LINE" | "ARCHIVE"="", sts_endpoint: string="", upload_concurrency: int=4, upload_cutoff: string="209715200", use_accelerate_endpoint: bool=false, use_accept_encoding_gzip: string="unset", use_already_exists: string="unset", use_arn_region: bool=false, use_data_integrity_protections: string="unset", use_dual_stack: bool=false, use_multipart_etag: string="unset", use_multipart_uploads: string="unset", use_presigned_request: bool=false, use_unsigned_payload: string="unset", use_x_id: string="unset", v2_auth: bool=false, version_at: string="0001-01-01T00:00:00Z", version_deleted: bool=false, versions: bool=false }`

**Returns:** `Promise<FilesBackendsCreateS3Response>`  |  **HTTP:** `POST /api/v1/backends/s3`
**CLI:** `hoody files backends s3 create`

---

#### `createSeafile` — Connect to seafile backend

```typescript
client.files.backends.createSeafile(data: FilesBackendsCreateSeafileRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateSeafileRequest` | body | Yes |  |

**Body:** `{ 2fa: bool=false, auth_token: string="", create_library: bool=false, description: string="", encoding: string="50405386", library: string="", library_key: string="", pass: string="", url*: "https://cloud.seafile.com/"="", user: string="" }`

**Returns:** `Promise<FilesBackendsCreateSeafileResponse>`  |  **HTTP:** `POST /api/v1/backends/seafile`
**CLI:** `hoody files backends seafile create`

---

#### `createSftp` — Connect to sftp backend

```typescript
client.files.backends.createSftp(data: FilesBackendsCreateSftpRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateSftpRequest` | body | Yes |  |

**Body:** `{ ask_password: bool=false, chunk_size: string="32768", ciphers: string="", concurrency: int=64, connections: int=0, copy_is_hardlink: bool=false, description: string="", disable_concurrent_reads: bool=false, disable_concurrent_writes: bool=false, disable_hashcheck: bool=false, encoding: string="33652738", hashes: string="", host*: string="", host_key_algorithms: string="", host_keys: string="", http_proxy: string="", idle_timeout: int=60, key: string, key_exchange: string="", key_file_pass: string="", key_pem: string="", macs: string="", pass: string="", passphrase: string, password: string, path_override: string="", pin_host_key: bool=false, port: int=22, pubkey: string="", set_env: string="", set_modtime: bool=true, shell_type: "none" | "unix" | "powershell" | "cmd"="", skip_links: bool=false, socks_proxy: string="", subsystem: string="sftp", use_fstat: bool=false, use_insecure_cipher: "false" | "true"=false, user*: string="user" }`

- sftp backend configuration. Needs host, user, and one of pass, password, key_pem or key (the PEM itself; real line breaks are accepted). Credentials kept on the server, such as a key file or an ssh-agent, cannot be used.

**Returns:** `Promise<FilesBackendsCreateSftpResponse>`  |  **HTTP:** `POST /api/v1/backends/sftp`
**CLI:** `hoody files backends sftp create`

---

#### `createSharefile` — Connect to sharefile backend

```typescript
client.files.backends.createSharefile(data: FilesBackendsCreateSharefileRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateSharefileRequest` | body | Yes |  |

**Body:** `{ auth_url: string="", chunk_size: string="67108864", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="57091982", endpoint: string="", root_folder_id: "" | "favorites" | "allshared" | "connectors" | "top"="", token: string="", token_url: string="", upload_cutoff: string="134217728" }`

- `chunk_size` — Upload chunk size. Must a power of 2 >= 256k. Making this larger will improve performance, but note that each chunk is buffered in memory one per transfer. Reducing this will reduce memory usage but decrease performance.

**Returns:** `Promise<FilesBackendsCreateSharefileResponse>`  |  **HTTP:** `POST /api/v1/backends/sharefile`
**CLI:** `hoody files backends sharefile create`

---

#### `createSia` — Connect to sia backend

```typescript
client.files.backends.createSia(data: FilesBackendsCreateSiaRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateSiaRequest` | body | Yes |  |

**Body:** `{ api_password: string="", api_url*: string, description: string="", encoding: string="50436354", user_agent: string="Sia-Agent" }`

- `api_url` — Sia daemon API URL, like http://sia.daemon.host:9980. Note that siad must run with --disable-api-security to open API port for other hosts (not recommended). Keep default if Sia daemon runs on localhost.
- `user_agent` — Siad User Agent Sia daemon requires the 'Sia-Agent' user agent by default for security

**Returns:** `Promise<FilesBackendsCreateSiaResponse>`  |  **HTTP:** `POST /api/v1/backends/sia`
**CLI:** `hoody files backends sia create`

---

#### `createSmb` — Connect to smb backend

```typescript
client.files.backends.createSmb(data: FilesBackendsCreateSmbRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateSmbRequest` | body | Yes |  |

**Body:** `{ case_insensitive: bool=true, description: string="", domain: string="WORKGROUP", encoding: string="56698766", hide_special_share: bool=true, host*: string="", idle_timeout: int=60, pass: string="", port: int=445, spn: string="", use_kerberos: false=false, user: string="user" }`

- `use_kerberos` — Use Kerberos authentication. If set, Hoody will use Kerberos authentication instead of NTLM. This requires a valid Kerberos configuration and credentials cache to be available, either in the default locations or as specified by the KRB5_CONFIG and KRB5CCNAME environment variables.

**Returns:** `Promise<FilesBackendsCreateSmbResponse>`  |  **HTTP:** `POST /api/v1/backends/smb`
**CLI:** `hoody files backends smb create`

---

#### `createSugarsync` — Connect to sugarsync backend

```typescript
client.files.backends.createSugarsync(data: FilesBackendsCreateSugarsyncRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateSugarsyncRequest` | body | Yes |  |

**Body:** `{ access_key_id: string="", app_id: string="", authorization: string="", authorization_expiry: string="", deleted_id: string="", description: string="", encoding: string="50397186", hard_delete: bool=false, private_access_key: string="", refresh_token: string="", root_id: string="", user: string="" }`

**Returns:** `Promise<FilesBackendsCreateSugarsyncResponse>`  |  **HTTP:** `POST /api/v1/backends/sugarsync`
**CLI:** `hoody files backends sugarsync create`

---

#### `createSwift` — Connect to swift backend

```typescript
client.files.backends.createSwift(data: FilesBackendsCreateSwiftRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateSwiftRequest` | body | Yes |  |

**Body:** `{ application_credential_id: string="", application_credential_name: string="", application_credential_secret: string="", auth: "https://auth.api.rackspacecloud.com/v1.0" | "https://lon.auth.api.rackspacecloud.com/v1.0" | "https://identity.api.rackspacecloud.com/v2.0" | "https://auth.storage.memset.com/v1.0" | "https://auth.storage.memset.com/v2.0" | "https://auth.cloud.ovh.net/v3" | "https://authenticate.ain.net"="", auth_token: string="", auth_version: int=0, chunk_size: string="5368709120", description: string="", domain: string="", encoding: string="16777218", endpoint_type: "public" | "internal" | "admin"="public", env_auth: false=false, fetch_until_empty_page: bool=false, key: string="", leave_parts_on_error: bool=false, no_chunk: bool=false, no_large_objects: bool=false, partial_page_fetch_threshold: int=0, region: string="", storage_policy: "" | "pcs" | "pca"="", storage_url: string="", tenant: string="", tenant_domain: string="", tenant_id: string="", use_segments_container: string="unset", user: string="", user_id: string="" }`

**Returns:** `Promise<FilesBackendsCreateSwiftResponse>`  |  **HTTP:** `POST /api/v1/backends/swift`
**CLI:** `hoody files backends swift create`

---

#### `createUlozto` — Connect to ulozto backend

```typescript
client.files.backends.createUlozto(data: FilesBackendsCreateUloztoRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateUloztoRequest` | body | Yes |  |

**Body:** `{ app_token: string="", description: string="", encoding: string="50438146", list_page_size: int=500, password: string="", root_folder_slug: string="", username: string="" }`

**Returns:** `Promise<FilesBackendsCreateUloztoResponse>`  |  **HTTP:** `POST /api/v1/backends/ulozto`
**CLI:** `hoody files backends ulozto create`

---

#### `createWebdav` — Connect to webdav backend

```typescript
client.files.backends.createWebdav(data: FilesBackendsCreateWebdavRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateWebdavRequest` | body | Yes |  |

**Body:** `{ auth_redirect: bool=false, bearer_token: string="", description: string="", encoding: string="", headers: string="", nextcloud_chunk_size: string="10485760", owncloud_exclude_mounts: bool=false, owncloud_exclude_shares: bool=false, pacer_min_sleep: int=0, pass: string="", url*: string="", user: string="", vendor: "fastmail" | "nextcloud" | "owncloud" | "infinitescale" | "sharepoint" | "sharepoint-ntlm" | "hoody-vfs" | "other"="" }`

- `auth_redirect` — Preserve authentication on redirect. … Note that enabling this also permits sending your credentials over a plaintext HTTP connection if the server redirects from HTTPS to HTTP, which Hoody otherwise refuses to do.

**Returns:** `Promise<FilesBackendsCreateWebdavResponse>`  |  **HTTP:** `POST /api/v1/backends/webdav`
**CLI:** `hoody files backends webdav create`

---

#### `createYandex` — Connect to yandex backend

```typescript
client.files.backends.createYandex(data: FilesBackendsCreateYandexRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateYandexRequest` | body | Yes |  |

**Body:** `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50429954", hard_delete: bool=false, spoof_ua: bool=true, token: string="", token_url: string="", upload_wait: int=0 }`

**Returns:** `Promise<FilesBackendsCreateYandexResponse>`  |  **HTTP:** `POST /api/v1/backends/yandex`
**CLI:** `hoody files backends yandex create`

---

#### `createZoho` — Connect to zoho backend

```typescript
client.files.backends.createZoho(data: FilesBackendsCreateZohoRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesBackendsCreateZohoRequest` | body | Yes |  |

**Body:** `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="16875520", list_folder_burst: int=6, list_folder_limit: int=19, list_folder_window: int=60, region: "com" | "eu" | "in" | "jp" | "com.cn" | "com.au"="", root_folder_id: string="", token: string="", token_url: string="", tpslimit: string="6", tpslimit_burst: int=1, upload_cutoff: string="10485760" }`

**Returns:** `Promise<FilesBackendsCreateZohoResponse>`  |  **HTTP:** `POST /api/v1/backends/zoho`
**CLI:** `hoody files backends zoho create`

---

#### `delete` — Disconnect backend

```typescript
client.files.backends.delete(id: string, options?: { uploads?: "keep" | "discard" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `uploads` | `"keep" \| "discard"` | query | No | What becomes of what was written on the backend's mounts and is not uploaded yet: keep uploading it (`keep`) or delete it (`discard`) |

**Returns:** `Promise<FilesBackendsDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/backends/{id}`
**CLI:** `hoody files backends delete`

---

#### `get` — Get backend details

```typescript
client.files.backends.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<FilesBackendsGetResponse>`  |  **HTTP:** `GET /api/v1/backends/{id}`
**CLI:** `hoody files backends get`

---

#### `list` — List all backends

```typescript
client.files.backends.list()
```

**Returns:** `Promise<FilesBackendsListResponse>`  |  **HTTP:** `GET /api/v1/backends`
**CLI:** `hoody files backends list`

---

#### `test` — Test backend connection

```typescript
client.files.backends.test(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<FilesBackendsTestResponse>`  |  **HTTP:** `GET /api/v1/backends/{id}/test`
**CLI:** `hoody files backends test`

---

#### `update` — Update backend credentials

```typescript
client.files.backends.update(id: string, data: FilesBackendsUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Backend ID (16-character hex string) |
| `data` | `FilesBackendsUpdateRequest` | body | Yes |  |

**Body:** `{ [key: string]: string|null }`

- … Values must be strings or null (null deletes the field). pass and password together are refused with 400. On sftp, key, passphrase and password are other names for key_pem, key_file_pass and pass, and on mega password is another name for pass, as on connect: both names of one field set to different values are refused with 400, and a null under the other name is ignored, so it removes nothing (send key_pem: null to remove a key).

**Returns:** `Promise<FilesBackendsUpdateResponse>`  |  **HTTP:** `PUT /api/v1/backends/{id}`
**CLI:** `hoody files backends update`

---

### `client.files.downloads` (5) — Download files from remote URLs with progress tracking

#### `cancel` — Cancel a running download

```typescript
client.files.downloads.cancel(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The id listed by GET /api/v1/downloads |

**Returns:** `Promise<FilesDownloadsCancelResponse>`  |  **HTTP:** `DELETE /api/v1/downloads/{id}`
**CLI:** `hoody files downloads cancel`

---

#### `create` — Download file from remote URL

```typescript
client.files.downloads.create(path: string, options: { filename?: string; timeout?: number; owner: string; download?: string })  // → Promise<PostFileOperationResponse>
client.files.downloads.create(directory: string, options: { download: string; filename?: string; timeout?: number })  // → Promise<DownloadFromUrlResponse>
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Destination directory |
| `download` | `string` | query | No | URL to download from |
| `filename` | `string` | query | No | Custom filename for downloaded file |
| `timeout` | `number` | query | No | Download timeout in seconds. Default and maximum: 43200 (12 hours) |
| `owner` | `string` | query | Yes | Create-time owner for newly-created inodes as user[:group] or uid[:gid]. Requires the deployment to have enabled chown, and must resolve to one of the owners it permits; refuses root (uid/gid 0). Absent → the server default create owner. Applies to mkdir/extract/download_from/copy_to. |

**Returns:** see each form above  |  **HTTP:** `GET /{directory}?download`
**CLI:** `hoody files downloads create`

---

#### `list` — List active downloads

```typescript
client.files.downloads.list()
```

**Returns:** `Promise<FilesDownloadsListResponse>`  |  **HTTP:** `GET /api/v1/downloads`
**CLI:** `hoody files downloads list`

---

#### `listByDirectory` — List active downloads

```typescript
client.files.downloads.listByDirectory(directory: string, options: { downloads: "" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `directory` | `string` | path | Yes |  |
| `downloads` | `""` | query | Yes |  |

**Returns:** `Promise<FilesDownloadsListByDirectoryResponse>`  |  **HTTP:** `GET /{directory}?downloads`
**CLI:** `hoody files downloads list`

---

#### `listHistory` — Download history

```typescript
client.files.downloads.listHistory(options?: { download_history?: "" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `download_history` | `""` | query | No |  |

**Returns:** `Promise<GetDownloadHistoryResponse>`  |  **HTTP:** `GET /?download_history`
**CLI:** `hoody files downloads history list`

---

### `client.files.extractions` (4) — Archive operations - extract, preview, download directories as ZIP

#### `cancel` — Cancel a running extraction

```typescript
client.files.extractions.cancel(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The id listed by GET /api/v1/extractions |

**Returns:** `Promise<FilesExtractionsCancelResponse>`  |  **HTTP:** `DELETE /api/v1/extractions/{id}`
**CLI:** `hoody files extractions cancel`

---

#### `list` — List active extractions

```typescript
client.files.extractions.list()
```

**Returns:** `Promise<FilesExtractionsListResponse>`  |  **HTTP:** `GET /api/v1/extractions`
**CLI:** `hoody files extractions list`

---

#### `listByDirectory` — List active extractions

```typescript
client.files.extractions.listByDirectory(options: { extractions: "" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `extractions` | `""` | query | Yes |  |

**Returns:** `Promise<FilesExtractionsListByDirectoryResponse>`  |  **HTTP:** `GET /?extractions`

---

#### `listHistory` — Extraction history

```typescript
client.files.extractions.listHistory(options?: { extraction_history?: "" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `extraction_history` | `""` | query | No |  |

**Returns:** `Promise<GetExtractionHistoryResponse>`  |  **HTTP:** `GET /?extraction_history`
**CLI:** `hoody files extractions history list`

---

### `client.files` (21) — File operations - upload, download, delete, list files

#### `append` — Append data to file

```typescript
client.files.append(path: string, data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string, options?: { owner?: string; IfMatch?: string; IfNoneMatch?: string; IfUnmodifiedSince?: string; contentType?: 'application/octet-stream' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File path |
| `owner` | `string` | query | No | Create-time owner (user[:group]/uid[:gid]) when this append creates a new file. Requires the deployment to have enabled chown and to permit the owner you name; refuses root. Absent → server default. |
| `IfMatch` | `string` | header `If-Match` | No | Write only if the file has this ETag (the one a download of it answers with; a weak ETag never matches), or with '*' only if a file exists at the path. Otherwise 412 and nothing is written or created. |
| `IfNoneMatch` | `string` | header `If-None-Match` | No | '*' writes only if nothing exists at the path (create only); a tag writes only if the file does not have that ETag. Otherwise 412 and nothing is written. |
| `IfUnmodifiedSince` | `string` | header `If-Unmodified-Since` | No | Without If-Match, write only if the file has not changed since this HTTP date. Otherwise 412 and nothing is written. |
| `data` | `Blob \| ArrayBuffer \| Uint8Array \| ReadableStream<Uint8Array> \| string` | body | Yes |  |

**Returns:** `Promise<FilesAppendResponse>`  |  **HTTP:** `PUT /api/v1/files/append/{path}`
**CLI:** `hoody files append`

---

#### `chmod` — Change file permissions

```typescript
client.files.chmod(path: string, options: { chmod: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File or directory path |
| `chmod` | `string` | query | Yes | Octal permission mode (e.g., 755, 644, 0755) |

**Returns:** `Promise<FilesChmodResponse>`  |  **HTTP:** `PATCH /api/v1/files/chmod/{path}`
**CLI:** `hoody files chmod`

---

#### `chown` — Change file ownership

```typescript
client.files.chown(path: string, options: { chown: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File or directory path |
| `chown` | `string` | query | Yes | Owner and optional group (e.g., user:group, user, :group, or UID:GID) |

**Returns:** `Promise<FilesChownResponse>`  |  **HTTP:** `PATCH /api/v1/files/chown/{path}`
**CLI:** `hoody files chown`

---

#### `copy` — Copy file or directory

```typescript
client.files.copy(path: string, options: { copy_to: string; overwrite?: "true" | "false"; owner?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Source file or directory path |
| `copy_to` | `string` | query | Yes | Destination path to copy the file/directory to. The path is taken from the serve root: a destination without a leading '/' is also taken from the serve root, not from the source's folder. |
| `overwrite` | `"true" \| "false"` | query | No | Allow overwriting existing destination (default: false) |
| `owner` | `string` | query | No | Create-time owner (user[:group]/uid[:gid]) for newly-created copies. Requires the deployment to have enabled chown and to permit the owner you name; refuses root. Overwritten existing files preserve their owner. Absent → server default. |

**Returns:** `Promise<FilesCopyResponse>`  |  **HTTP:** `POST /api/v1/files/copy/{path}`
**CLI:** `hoody files copy`

---

#### `delete` — Delete file or directory

```typescript
client.files.delete(path: string, options?: { backend?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `backend` | `string` | query | No | Backend ID for remote file deletion |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/files/{path}`
**CLI:** `hoody files delete`

---

#### `exists` — Whether a file or directory exists at `path`: true, or false when the kit answers 404.

```typescript
client.files.exists(path: string, options?: FilesExistsOptions, templateVars?: FilesReadTarget)
```

**Returns:** `Promise<boolean>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `get` — List directory or download file

```typescript
client.files.get(path: string, options?: { backend?: string; hash?: ""; sha256?: ""; base64?: ""; preview?: ""; contents?: ""; stat?: ""; thumbnail?: string; format?: "jpeg" | "png" | "webp" | "gif" | "bmp"; size?: string; width?: number; height?: number; resize?: "fit" | "fill" | "cover" | "exact"; quality?: "low" | "medium" | "high"; blur?: number; grayscale?: ""; bg?: string; q?: string; grep?: string; ignore_case?: boolean; fixed_string?: boolean; glob?: string; context?: number; max_count?: number; max_matches?: number; max_depth?: number; max_filesize?: number; timeout?: number; no_ignore?: boolean; hidden?: boolean; max_results?: number; max_files_scanned?: number; sort?: "mtime" | "name" | "size"; order?: "asc" | "desc"; lines?: string; history?: ""; at?: string; revision?: number; diff?: ""; from_seq?: number; from_ts?: string; to_seq?: number; to_ts?: string; after_id?: number; limit?: number; zip?: ""; Range?: string; IfRange?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File or directory path |
| `backend` | `string` | query | No | Backend ID for remote file access |
| `hash` | `""` | query | No | Get SHA256 hash of file |
| `sha256` | `""` | query | No | Get SHA256 hash of file (alias for hash) |
| `base64` | `""` | query | No | Get file content as base64 |
| `preview` | `""` | query | No | Preview archive contents (for zip/tar files). Alias: ?contents |
| `contents` | `""` | query | No | Alias for ?preview - list archive contents |
| `stat` | `""` | query | No | Get file/directory metadata (stat) without downloading content |
| `thumbnail` | `string` | query | No | Return a processed image (resize, format convert, blur, grayscale), shaped by format, size, width, height, resize, quality, blur, grayscale and bg: the same image as the WebDAV-style /{image}?thumbnail. Only where the deployment enabled thumbnail processing; returns 403 when disabled. |
| `format` | `"jpeg" \| "png" \| "webp" \| "gif" \| "bmp"` | query | No | With thumbnail: output image format |
| `size` | `string` | query | No | With thumbnail: Target box in pixels: WIDTHxHEIGHT, or a single N for an N×N box |
| `width` | `number` | query | No | With thumbnail: target width in pixels |
| `height` | `number` | query | No | With thumbnail: target height in pixels |
| `resize` | `"fit" \| "fill" \| "cover" \| "exact"` | query | No | With thumbnail: How the image meets a target box given by size, or by width and height together: fit (default) keeps the aspect ratio and fits inside the box; fill keeps the aspect ratio, covers the box and centre-crops to exactly WIDTH×HEIGHT; cover keeps the aspect ratio and covers the box, so one side may be larger than the box; exact forces WIDTH×HEIGHT and may distort. With only width or only height, the other side follows the aspect ratio. |
| `quality` | `"low" \| "medium" \| "high"` | query | No | With thumbnail: Resampling filter for resizing: low (box), medium (bilinear, the default) or high (Lanczos3). It does not set compression; q sets JPEG quality. |
| `blur` | `number` | query | No | With thumbnail: Gaussian blur radius |
| `grayscale` | `""` | query | No | With thumbnail: convert to grayscale |
| `bg` | `string` | query | No | With thumbnail: background color for transparent areas |
| `q` | `string` | query | No | Two roles. On a directory (without thumbnail): search the names and paths below it for this text, case-insensitive; at most 512 bytes of UTF-8, measured before and after lowercasing (longer is refused with 400, not truncated); only where the deployment enabled search (403 otherwise). With thumbnail: JPEG quality, 1-100 (default 85); only JPEG output uses it. |
| `grep` | `string` | query | No | Search file/directory contents for regex pattern (or literal if fixed_string=true). Only where the deployment enabled content search. |
| `ignore_case` | `boolean` | query | No | Case-insensitive grep matching |
| `fixed_string` | `boolean` | query | No | Treat grep pattern as literal string, not regex |
| `glob` | `string` | query | No | Without grep, finds files and folders matching this glob (e.g. '**/*.rs', 'src/**/*.{ts,tsx}'); directory paths only, where the deployment enabled search. The pattern is matched against each path relative to the searched folder: '*' stays within one folder and '**' crosses folders, so '*.md' finds only the folder's own files and '**/*.md' finds them at any depth. A pattern starting with '/' or holding a '..' segment is refused with 400. Symbolic links are listed but the search does not go into a linked folder. With grep, the content-search file filter. Only search files matching this glob (ripgrep -g syntax, one pattern per request, at most 1024 bytes). A pattern without '/' matches file names at any depth ('*.rs', '*.{ts,tsx}'). A pattern with a '/' other than a trailing one matches the path relative to the searched folder, and a leading '/' anchors it there ('src/**/*.go'). '*' stays within one folder and '**' crosses folders. A leading '!' excludes instead ('!*_test.go'; '!vendor/' skips every folder named vendor); write '\!' for a literal '!' and '\#' for a leading '#'. Matching is case-sensitive whatever ignore_case says. A positive pattern ending in '/' names folders only and so selects no files; use 'src/**' for everything under a folder. A pattern that is only whitespace or a comment (an unescaped leading '#') is refused. The filter only narrows the search: it never brings back a file that ignore files or the default exclusion of names starting with '.' leave out; no_ignore and hidden do that. Not applied when the path is a single file. Repeating glob in a content search is refused. |
| `context` | `number` | query | No | Number of context lines before/after each grep match |
| `max_count` | `number` | query | No | Max matches per file for grep |
| `max_matches` | `number` | query | No | Total max matches across all files for grep |
| `max_depth` | `number` | query | No | Directory recursion depth for grep |
| `max_filesize` | `number` | query | No | Skip files larger than this (bytes) during grep |
| `timeout` | `number` | query | No | Grep timeout in seconds |
| `no_ignore` | `boolean` | query | No | Also search files excluded by .gitignore (inside a git repository), .ignore, .git/info/exclude and the global git excludes |
| `hidden` | `boolean` | query | No | Also search names starting with '.', which are otherwise skipped unless an ignore file whitelists them. '.git' folders found inside the searched folder are still skipped, and the server's configured hidden paths still apply. Refused with 403 for an account that may only list this path. |
| `max_results` | `number` | query | No | Max entries returned for glob search |
| `max_files_scanned` | `number` | query | No | Max filesystem entries scanned during glob search |
| `sort` | `"mtime" \| "name" \| "size"` | query | No | Sort glob results by: mtime (default), name, or size |
| `order` | `"asc" \| "desc"` | query | No | Sort order for glob results. Default: desc for mtime, asc for name/size |
| `lines` | `string` | query | No | Extract specific lines from a file. Formats: '10-50' (range, 1-indexed inclusive), '100' (single line), '-20' (last 20 lines / tail), '50-' (line 50 to end). Returns text/plain with X-Line-Range header. X-Total-Lines header included when naturally known (scan reached EOF). Max 100,000 lines or 64MB per request. |
| `history` | `""` | query | No | List all revisions of a file. Returns JSON with revisions array, pagination via after_id. Mutually exclusive with at/revision/diff. |
| `at` | `string` | query | No | Read file content at a point in time. Accepts RFC3339 timestamp or Unix milliseconds. Mutually exclusive with history/revision/diff. Composable with ?lines, ?hash, ?base64. |
| `revision` | `number` | query | No | Read file content by stable per-path sequence number. Mutually exclusive with history/at/diff. Composable with ?lines, ?hash, ?base64. |
| `diff` | `""` | query | No | Compute unified diff between two versions. Requires from_seq or from_ts. Optional to_seq or to_ts (defaults to current file). Mutually exclusive with history/at/revision. |
| `from_seq` | `number` | query | No | Source revision seq number for ?diff. Mutually exclusive with from_ts. |
| `from_ts` | `string` | query | No | Source timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with from_seq. |
| `to_seq` | `number` | query | No | Target revision seq number for ?diff. Mutually exclusive with to_ts. Default: current file on disk. |
| `to_ts` | `string` | query | No | Target timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with to_seq. |
| `after_id` | `number` | query | No | Cursor for ?history pagination. Returns entries with id > after_id. |
| `limit` | `number` | query | No | Max entries to return for ?history. |
| `zip` | `""` | query | No | Download a directory as a streaming zip archive (bare flag, e.g. ?zip). Local directories only (a folder of a remote backend, named with backend, answers 501), and only where the deployment enabled archive downloads (403 otherwise). Same behavior as the WebDAV-style /{directory}?zip, including its limits: a folder one archive cannot hold whole (more than 100000 files, more than 1000000 files and folders in all, or folders nested deeper than 50 levels) is refused with 422 `ARCHIVE_TOO_LARGE`. |
| `Range` | `string` | header | No | File download only: ask for part of the file, as 'bytes=first-last', 'bytes=first-' or 'bytes=-suffix_length'. A last position past the end is clamped to the last byte, and a suffix longer than the file selects all of it. One satisfiable range answers 206 with Content-Range; several answer 206 as multipart/byteranges for a local file, while a remote file (with backend) answers 200 with the whole file. Ranges that cannot be satisfied are dropped from a list, and 416 comes only when none is left. A malformed header, another unit or more than 100 ranges is ignored (200, whole file). HEAD ignores Range. |
| `IfRange` | `string` | header `If-Range` | No | File download only: honour Range only if the file still has this ETag, exactly; otherwise answer 200 with the whole file. A date never matches, since two versions saved within the same second share it. A remote file's (with backend) ETag is weak, so with If-Range a remote file is always sent whole. |

**Returns:** `Promise<ApiResponse<ArrayBuffer> | FilesGetResponse>` — the response Content-Type picks the branch: JSON gives the payload in `.data`, a binary type gives the bytes  |  **HTTP:** `GET /api/v1/files/{path}`
**CLI:** `hoody files get`

---

#### `glob` — Find files by glob pattern

```typescript
client.files.glob(path: string, options: { pattern: string; max_results?: number; max_depth?: number; max_files_scanned?: number; timeout?: number; no_ignore?: boolean; hidden?: boolean; sort?: "mtime" | "name" | "size"; order?: "asc" | "desc" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Directory path to search within |
| `pattern` | `string` | query | Yes | Glob pattern, matched against paths relative to the searched folder (e.g. '**/*.rs', 'src/**/*.{ts,tsx}', '*.md'). '*' stays within one folder, '**' crosses folders. Cannot start with '/' or contain a '..' segment. |
| `max_results` | `number` | query | No | Maximum entries to return |
| `max_depth` | `number` | query | No | Maximum directory recursion depth |
| `max_files_scanned` | `number` | query | No | Maximum filesystem entries to scan |
| `timeout` | `number` | query | No | Search timeout in seconds |
| `no_ignore` | `boolean` | query | No | Also search files excluded by .gitignore (inside a git repository), .ignore, .git/info/exclude and the global git excludes |
| `hidden` | `boolean` | query | No | Also search names starting with '.', which are otherwise skipped unless an ignore file whitelists them. '.git' folders found inside the searched folder are still skipped, and the server's configured hidden paths still apply. Refused with 403 for an account that may only list this path. |
| `sort` | `"mtime" \| "name" \| "size"` | query | No | Sort results by: mtime (modification time), name, or size |
| `order` | `"asc" \| "desc"` | query | No | Sort order. Default: desc for mtime, asc for name/size |

**Returns:** `Promise<FilesGlobResponse>`  |  **HTTP:** `GET /api/v1/files/glob/{path}`
**CLI:** `hoody files glob`

---

#### `grep` — Search file contents (grep)

```typescript
client.files.grep(path: string, options: { pattern: string; ignore_case?: boolean; fixed_string?: boolean; glob?: string; context?: number; max_count?: number; max_matches?: number; max_depth?: number; max_filesize?: number; timeout?: number; no_ignore?: boolean; hidden?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File or directory path to search |
| `pattern` | `string` | query | Yes | Search pattern (regex by default, literal if fixed_string=true) |
| `ignore_case` | `boolean` | query | No | Case-insensitive matching |
| `fixed_string` | `boolean` | query | No | Treat pattern as literal string, not regex |
| `glob` | `string` | query | No | Only search files matching this glob (ripgrep -g syntax, one pattern per request, at most 1024 bytes). A pattern without '/' matches file names at any depth ('*.rs', '*.{ts,tsx}'). A pattern with a '/' other than a trailing one matches the path relative to the searched folder, and a leading '/' anchors it there ('src/**/*.go'). '*' stays within one folder and '**' crosses folders. A leading '!' excludes instead ('!*_test.go'; '!vendor/' skips every folder named vendor); write '\!' for a literal '!' and '\#' for a leading '#'. Matching is case-sensitive whatever ignore_case says. A positive pattern ending in '/' names folders only and so selects no files; use 'src/**' for everything under a folder. A pattern that is only whitespace or a comment (an unescaped leading '#') is refused. The filter only narrows the search: it never brings back a file that ignore files or the default exclusion of names starting with '.' leave out; no_ignore and hidden do that. Not applied when the path is a single file. Repeating glob in a content search is refused. |
| `context` | `number` | query | No | Number of context lines before and after each match |
| `max_count` | `number` | query | No | Maximum matches per file |
| `max_matches` | `number` | query | No | Total maximum matches across all files |
| `max_depth` | `number` | query | No | Maximum directory recursion depth |
| `max_filesize` | `number` | query | No | Skip files larger than this (bytes) |
| `timeout` | `number` | query | No | Search timeout in seconds |
| `no_ignore` | `boolean` | query | No | Also search files excluded by .gitignore (inside a git repository), .ignore, .git/info/exclude and the global git excludes |
| `hidden` | `boolean` | query | No | Also search names starting with '.', which are otherwise skipped unless an ignore file whitelists them. '.git' folders found inside the searched folder are still skipped, and the server's configured hidden paths still apply. Refused with 403 for an account that may only list this path. |

**Returns:** `Promise<FilesGrepResponse>`  |  **HTTP:** `GET /api/v1/files/grep/{path}`
**CLI:** `hoody files grep`

---

#### `logout` — Clear authentication

```typescript
client.files.logout(path: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `LOGOUT /{path}`

---

#### `mkdir` — File operations (mkdir, extract, download, move, copy)

```typescript
client.files.mkdir(path: string, options?: { backend?: string; owner?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `backend` | `string` | query | No | Backend ID, for mkdir only: create the directory on that remote backend. Any other operation with backend is refused with 400 INVALID_PARAMETER. |
| `owner` | `string` | query | No | Create-time owner for newly-created inodes as user[:group] or uid[:gid]. Requires the deployment to have enabled chown, and must resolve to one of the owners it permits; refuses root (uid/gid 0). Absent → the server default create owner. Applies to mkdir/extract/download_from/copy_to. |

**Returns:** `Promise<PostFileOperationResponse>`  |  **HTTP:** `POST /api/v1/files/{path}`
**CLI:** `hoody files mkdir`

---

#### `move` — Move file or directory

```typescript
client.files.move(path: string, options: { move_to: string; owner?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Source file or directory path |
| `move_to` | `string` | query | Yes | Destination path to move the file/directory to. The path is taken from the serve root: a destination without a leading '/' is also taken from the serve root, not from the source's folder. |
| `owner` | `string` | query | No | Create-time owner (user[:group]/uid[:gid]) for newly-created destination PARENT directories. Requires the deployment to have enabled chown and to permit the owner you name; refuses root. The moved inode itself preserves its existing owner. Absent → server default. |

**Returns:** `Promise<FilesMoveResponse>`  |  **HTTP:** `POST /api/v1/files/move/{path}`
**CLI:** `hoody files move`

---

#### `realpath` — Resolve canonical path (realpath)

```typescript
client.files.realpath(path: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File or directory path to resolve |

**Returns:** `Promise<FilesRealpathResponse>`  |  **HTTP:** `GET /api/v1/files/realpath/{path}`
**CLI:** `hoody files realpath`

---

#### `search` — Search directory

```typescript
client.files.search(directory: string, options: { q: string; json?: ""; theme?: "oc-1" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper"; colorScheme?: "light" | "dark"; font?: "ibm-plex-mono" | "cascadia-code" | "fira-code" | "hack" | "inconsolata" | "intel-one-mono" | "iosevka" | "jetbrains-mono" | "meslo-lgs" | "roboto-mono" | "source-code-pro" | "ubuntu-mono"; fontSize?: number; embedderOrigin?: string; chromeless?: boolean; borderless?: boolean; hideHeader?: boolean; hideSidebar?: boolean; hidePreview?: boolean; hideFooter?: boolean; embedBg?: "transparent" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `directory` | `string` | path | Yes |  |
| `q` | `string` | query | Yes | Search query (case-insensitive filename match). Maximum 512 BYTES of UTF-8 after form/percent decoding, measured both before and after Unicode lowercasing — lowercasing can change a string's byte length in either direction. Longer queries are rejected with 400; they are not truncated. Note this is a byte limit, not a character limit, so it is deliberately not expressed as `maxLength`. |
| `json` | `""` | query | No | Return JSON format instead of HTML |
| `theme` | `"oc-1" \| "aura" \| "ayu" \| "carbonfox" \| "catppuccin" \| "dracula" \| "gruvbox" \| "monokai" \| "nightowl" \| "nord" \| "onedarkpro" \| "shadesofpurple" \| "solarized" \| "tokyonight" \| "vesper"` | query | No | HTML page only: colour theme of the page. Default oc-1. |
| `colorScheme` | `"light" \| "dark"` | query | No | HTML page only: light or dark colour scheme. Without it the page follows the system setting. |
| `font` | `"ibm-plex-mono" \| "cascadia-code" \| "fira-code" \| "hack" \| "inconsolata" \| "intel-one-mono" \| "iosevka" \| "jetbrains-mono" \| "meslo-lgs" \| "roboto-mono" \| "source-code-pro" \| "ubuntu-mono"` | query | No | HTML page only: monospace font of the editor and listing. |
| `fontSize` | `number` | query | No | HTML page only: editor font size in pixels. Default 14. |
| `embedderOrigin` | `string` | query | No | HTML page only: origin of the page that embeds this one, such as https://app.example.com. The page then accepts theme and layout messages from that origin and tells it when it is ready. Only https origins are accepted. |
| `chromeless` | `boolean` | query | No | HTML page only: hide the header, sidebar, preview, footer and borders at once. Each can be turned back on with its own parameter set to false. |
| `borderless` | `boolean` | query | No | HTML page only: hide the page borders. |
| `hideHeader` | `boolean` | query | No | HTML page only: hide the header bar. |
| `hideSidebar` | `boolean` | query | No | HTML page only: hide the sidebar. |
| `hidePreview` | `boolean` | query | No | HTML page only: hide the preview pane. |
| `hideFooter` | `boolean` | query | No | HTML page only: hide the footer. |
| `embedBg` | `"transparent"` | query | No | HTML page only: transparent lets the background of the embedding page show through. |

**Returns:** `Promise<FilesSearchResponse>`  |  **HTTP:** `GET /{directory}?q`
**CLI:** `hoody files search`

---

#### `stat` — Get file metadata (stat)

```typescript
client.files.stat(path: string, options?: { backend?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File or directory path |
| `backend` | `string` | query | No | Backend ID: the metadata of the path on that remote backend instead of a local path |

**Returns:** `Promise<FilesStatResponse>`  |  **HTTP:** `GET /api/v1/files/stat/{path}`
**CLI:** `hoody files stat`

---

#### `touch` — Touch file (create or update mtime)

```typescript
client.files.touch(path: string, options?: { touch?: "" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File path to touch |
| `touch` | `""` | query | No | Flag to indicate touch operation |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `PUT /{path}?touch`
**CLI:** `hoody files touch`

---

#### `update` — Modify file properties or move/rename

```typescript
client.files.update(path: string, data?: FilesUpdateRequest, options?: { owner?: string; chmod?: string; chown?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File path |
| `owner` | `string` | query | No | Create-time owner (user[:group]/uid[:gid]) for newly-created destination parent directories on a JSON-body move_to. Requires the deployment to have enabled chown and to permit the owner you name; cannot be root. The moved item keeps its own owner. Absent → server default. |
| `chmod` | `string` | query | No | Set file permissions using octal mode value (e.g., ?chmod=755) |
| `chown` | `string` | query | No | Set file ownership (e.g., ?chown=user:group or ?chown=user) |
| `data` | `FilesUpdateRequest` | body | No |  |

**Body:** `files_MoveRequest | files_RenameRequest`

**Returns:** `Promise<FilesUpdateResponse>`  |  **HTTP:** `PATCH /api/v1/files/{path}`
**CLI:** `hoody files update`

---

#### `upload` — Upload or append file

```typescript
client.files.upload(path: string, data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string, options?: { backend?: string; append?: ""; chmod?: string; owner?: string; XExpectedLength?: string; IfMatch?: string; IfNoneMatch?: string; IfUnmodifiedSince?: string; contentType?: 'application/octet-stream' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `backend` | `string` | query | No | Backend ID for remote upload |
| `append` | `""` | query | No | Append body to end of existing file (create if missing) instead of overwriting |
| `chmod` | `string` | query | No | Permission bits the local file ends with, in octal (`644`, `0600`, `0o755`, `000`), whatever the server's umask; the response gives them in `mode`, read back from the file. Where the filesystem keeps no permission bits of its own (a mount of a remote storage without them), the upload is answered 409 PERMISSIONS_NOT_APPLIED instead: nothing is changed when the bits asked for are narrower than the file's, and otherwise the body is written whole under the file's bits. Requires both upload and chmod to be enabled (403 otherwise). setuid, setgid and sticky bits are refused, as are values above 777. Refused with 400 together with `backend` or `append`, and when the path names something other than a regular file (a directory, a pipe, a device, a socket). Each of these refusals comes before the body is read: nothing is created or changed. |
| `owner` | `string` | query | No | Create-time owner (user[:group]/uid[:gid]) for a newly-created file. Requires the deployment to have enabled chown and to permit the owner you name; refuses root. Overwrites/appends to an existing file preserve its owner. Absent → server default. |
| `XExpectedLength` | `string` | header `X-Expected-Length` | No | The length of the whole body in bytes, for a body streamed without Content-Length. A body that ends before this many bytes, or runs past them, is refused with 400 and nothing is written or appended: the file stays as it was. Send it whenever the length is known: some HTTP/2 clients end a request's body normally when they are aborted, so without it a cut-off body can look complete. Over the upload size limit it is refused with 413 before the body is read. |
| `IfMatch` | `string` | header `If-Match` | No | Local files only; with backend it is refused with 400. Write only if the file has this ETag (the one a download of it answers with; a weak ETag never matches), or with '*' only if a file exists at the path. Otherwise 412 and nothing is written or created. |
| `IfNoneMatch` | `string` | header `If-None-Match` | No | Local files only; with backend it is refused with 400. '*' writes only if nothing exists at the path (create only); a tag writes only if the file does not have that ETag. Otherwise 412 and nothing is written. |
| `IfUnmodifiedSince` | `string` | header `If-Unmodified-Since` | No | Local files only; with backend it is refused with 400. Without If-Match, write only if the file has not changed since this HTTP date. Otherwise 412 and nothing is written. |
| `data` | `Blob \| ArrayBuffer \| Uint8Array \| ReadableStream<Uint8Array> \| string` | body | Yes |  |

**Returns:** `Promise<FilesUploadResponse>`  |  **HTTP:** `PUT /api/v1/files/{path}`
**CLI:** `hoody files upload`

---

#### `whoami` — Check authentication status

```typescript
client.files.whoami(path: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |

**Returns:** `Promise<ApiResponse<string>>`  |  **HTTP:** `CHECKAUTH /{path}`
**CLI:** `hoody files whoami`

---

#### `writeChunk` — File operations

```typescript
client.files.writeChunk(path: string, data?: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>, options?: { IfMatch?: string; IfNoneMatch?: string; IfUnmodifiedSince?: string; contentType?: 'application/octet-stream' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `IfMatch` | `string` | header `If-Match` | No | Writes of content (X-Update-Range) only. Write only if the file has this ETag (the one a download of it answers with; a weak ETag never matches), or with '*' only if a file exists at the path. Otherwise 412 and nothing is written or created. |
| `IfNoneMatch` | `string` | header `If-None-Match` | No | Writes of content (X-Update-Range) only. '*' writes only if nothing exists at the path (create only); a tag writes only if the file does not have that ETag. Otherwise 412 and nothing is written. |
| `IfUnmodifiedSince` | `string` | header `If-Unmodified-Since` | No | Writes of content (X-Update-Range) only. Without If-Match, write only if the file has not changed since this HTTP date. Otherwise 412 and nothing is written. |
| `data` | `Blob \| ArrayBuffer \| Uint8Array \| ReadableStream<Uint8Array>` | body | No |  |

**Body:** `files_ChmodRequest | files_ChownRequest | files_RenameRequest`

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `PATCH /{path}`
**CLI:** `hoody files chunks write`

---

#### `zip` — Download directory as ZIP

```typescript
client.files.zip(directory: string, options?: { zip?: "" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `directory` | `string` | path | Yes |  |
| `zip` | `""` | query | No |  |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /{directory}?zip`
**CLI:** `hoody files zip`

---

#### `classify` — SDK helper

```typescript
client.files.classify(filepath: string)
```

**Returns:** `'renderable' | 'binary' | 'text'`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `getUrl` — SDK helper

```typescript
client.files.getUrl(absPath: string, options?: { download?: '' }, templateVars?: TemplateVars)
```

**Returns:** `string`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `getZipUrl` — URL that downloads a directory as a zip (the URL of `zip`, without sending the request).

```typescript
client.files.getZipUrl(directory: string, templateVars?: TemplateVars)
```

**Returns:** `string`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `list` — List a directory as JSON: `files.ui.getPage(path, { json: '' })`.

```typescript
client.files.list(path: string, options?: { simple?: ""; sort?: "name" | "mtime" | "size"; order?: "asc" | "desc"; hash?: ""; sha256?: ""; base64?: ""; edit?: ""; view?: ""; download?: "" | "1" | "true"; contentType?: string; history?: ""; at?: string; revision?: number; diff?: ""; from_seq?: number; from_ts?: string; to_seq?: number; to_ts?: string; after_id?: number; limit?: number; theme?: "oc-1" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper"; colorScheme?: "light" | "dark"; font?: "ibm-plex-mono" | "cascadia-code" | "fira-code" | "hack" | "inconsolata" | "intel-one-mono" | "iosevka" | "jetbrains-mono" | "meslo-lgs" | "roboto-mono" | "source-code-pro" | "ubuntu-mono"; fontSize?: number; embedderOrigin?: string; chromeless?: boolean; borderless?: boolean; hideHeader?: boolean; hideSidebar?: boolean; hidePreview?: boolean; hideFooter?: boolean; embedBg?: "transparent" }, templateVars?: { projectId?: string; containerId?: string; serviceIndex?: string | number; serverName?: string; server?: string })
```

**Returns:** `Promise<FilesUiGetPageResponse>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `readText` — Read a file as text (UTF-8).

```typescript
client.files.readText(path: string, options?: FilesReadOptions, templateVars?: FilesReadTarget)
```

**Returns:** `Promise<string>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `readJson` — Read a file and parse it as JSON.

```typescript
client.files.readJson<T = unknown>(path: string, options?: FilesReadOptions, templateVars?: FilesReadTarget)
```

**Returns:** `Promise<T>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `readBytes` — Read a file as bytes.

```typescript
client.files.readBytes(path: string, options?: FilesReadOptions, templateVars?: FilesReadTarget)
```

**Returns:** `Promise<Uint8Array>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

### `client.files.ftp` (1) — WebDAV-compatible API for FTP/FTPS

#### `get` — Access file via FTP

```typescript
client.files.ftp.get(path: string, options: { type: "ftp"; server: string; user?: string; pass?: string; ftp_secure?: boolean; ftp_passive?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `type` | `"ftp"` | query | Yes |  |
| `server` | `string` | query | Yes |  |
| `user` | `string` | query | No |  |
| `pass` | `string` | query | No |  |
| `ftp_secure` | `boolean` | query | No | Use explicit FTPS (AUTH TLS on the control connection) |
| `ftp_passive` | `boolean` | query | No | Passive mode, the only mode supported: `false` is refused with 400 |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `GET /{path}?type=ftp`
**CLI:** `hoody files ftp get`

---

### `client.files.images` (1) — On-the-fly image conversion, resizing, and effects with format conversion (JPEG/PNG/WebP/GIF/BMP), multiple resize modes, quality control, blur, grayscale, and two-tier caching (memory + disk)

#### `convert` — Process and convert images

```typescript
client.files.images.convert(image: string, options?: { format?: "jpeg" | "png" | "webp" | "gif" | "bmp"; size?: string; width?: number; height?: number; resize?: "fit" | "fill" | "cover" | "exact"; quality?: "low" | "medium" | "high"; q?: number; blur?: number; grayscale?: ""; bg?: string; thumbnail?: "" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `image` | `string` | path | Yes | Path to image file |
| `thumbnail` | `""` | query | No | Enable image processing |
| `format` | `"jpeg" \| "png" \| "webp" \| "gif" \| "bmp"` | query | No | Output format (default: jpeg) |
| `size` | `string` | query | No | Target box in pixels: WIDTHxHEIGHT, or a single N for an N×N box (max: 2000×2000) |
| `width` | `number` | query | No | Width in pixels (height auto-calculated) |
| `height` | `number` | query | No | Height in pixels (width auto-calculated) |
| `resize` | `"fit" \| "fill" \| "cover" \| "exact"` | query | No | How the image meets a target box given by size, or by width and height together: fit (default) keeps the aspect ratio and fits inside the box; fill keeps the aspect ratio, covers the box and centre-crops to exactly WIDTH×HEIGHT; cover keeps the aspect ratio and covers the box, so one side may be larger than the box; exact forces WIDTH×HEIGHT and may distort. With only width or only height, the other side follows the aspect ratio. |
| `quality` | `"low" \| "medium" \| "high"` | query | No | Resampling filter for resizing: low (box), medium (bilinear, the default) or high (Lanczos3). It does not set compression; q sets JPEG quality. |
| `q` | `number` | query | No | JPEG quality, 1-100 (higher is better). Only JPEG output uses it: PNG, WebP (lossless), GIF and BMP ignore it. |
| `blur` | `number` | query | No | Gaussian blur radius (0-50) |
| `grayscale` | `""` | query | No | Convert to grayscale/black-and-white |
| `bg` | `string` | query | No | Background color for transparency (hex RGB, e.g., 'ffffff' for white) |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /{image}?thumbnail`
**CLI:** `hoody files images convert`

---

#### `getThumbnailUrl` — SDK helper

```typescript
client.files.images.getThumbnailUrl(imagePath: string, options?: { width?: number; height?: number; format?: string; quality?: string }, templateVars?: TemplateVars)
```

**Returns:** `string`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

### `client.files.journal` (3) — Journal

#### `flush` — Flush journal to disk

```typescript
client.files.journal.flush()
```

**Returns:** `Promise<FilesJournalFlushResponse>`  |  **HTTP:** `POST /api/v1/journal/flush`
**CLI:** `hoody files journal flush`

---

#### `getStats` — Get journal statistics

```typescript
client.files.journal.getStats()
```

**Returns:** `Promise<FilesJournalGetStatsResponse>`  |  **HTTP:** `GET /api/v1/journal/stats`
**CLI:** `hoody files journal stats`

---

#### `list` — Query journal entries

```typescript
client.files.journal.list(options?: { path?: string; op?: string; since?: string; limit?: number; after_id?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | query | No | Filter entries by path prefix |
| `op` | `string` | query | No | Filter by operation type(s), comma-separated (e.g. 'write,delete') |
| `since` | `string` | query | No | Return entries at or after this time: an RFC3339 timestamp (Z or an offset, any fractional precision), or a Unix timestamp in seconds or milliseconds. A number below 100000000000 is read as seconds. Omitted or empty, no time filter applies; any other value is refused with 400. |
| `limit` | `number` | query | No | Max entries to return |
| `after_id` | `number` | query | No | Cursor: return entries with id > after_id |

**Returns:** `Promise<FilesJournalListResponse>`  |  **HTTP:** `GET /api/v1/journal`
**CLI:** `hoody files journal list`

---

### `client.files.kit` (2) — System endpoints - health checks, version info, and status monitoring

#### `getHealth` — Service health check

```typescript
client.files.kit.getHealth()
```

**Returns:** `Promise<FilesHealthCheckResponse>`  |  **HTTP:** `GET /api/v1/files/health`
**CLI:** `hoody files health`

---

#### `getVersion` — Get API version

```typescript
client.files.kit.getVersion()
```

**Returns:** `Promise<FilesKitGetVersionResponse>`  |  **HTTP:** `GET /api/v1/version`
**CLI:** `hoody files version`

---

### `client.files.mounts` (5) — Mount management - create, list, and remove FUSE filesystem mounts for remote backends

#### `create` — Create persistent FUSE mount

```typescript
client.files.mounts.create(data: FilesMountsCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `FilesMountsCreateRequest` | body | Yes |  |

**Body:** `{ auto_deliver: bool=true, backend_id*: string, label: string, mount_path: string, vfs_config: files_VfsConfigPatch }`

**Returns:** `Promise<FilesMountsCreateResponse>`  |  **HTTP:** `POST /api/v1/mounts`
**CLI:** `hoody files mounts create`

---

#### `delete` — Unmount filesystem

```typescript
client.files.mounts.delete(id: string, options?: { uploads?: "keep" | "wait" | "discard"; wait_seconds?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `uploads` | `"keep" \| "wait" \| "discard"` | query | No | What becomes of what was written on the mount and is not uploaded yet: keep uploading it (`keep`), the same and wait for it (`wait`), or delete it (`discard`) |
| `wait_seconds` | `number` | query | No | With `uploads=wait` only: the longest the answer waits, in seconds |

**Returns:** `Promise<FilesMountsDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/mounts/{id}`
**CLI:** `hoody files mounts delete`

---

#### `get` — Get mount details

```typescript
client.files.mounts.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<FilesMountsGetResponse>`  |  **HTTP:** `GET /api/v1/mounts/{id}`
**CLI:** `hoody files mounts get`

---

#### `list` — List all mounts

```typescript
client.files.mounts.list(options?: { label?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `label` | `string` | query | No | Filter mounts by label. Only mounts with this exact label will be returned. |

**Returns:** `Promise<FilesMountsListResponse>`  |  **HTTP:** `GET /api/v1/mounts`
**CLI:** `hoody files mounts list`

---

#### `update` — Update mount VFS configuration

```typescript
client.files.mounts.update(id: string, data: FilesMountsUpdateRequest, options?: { switch?: "wait" | "immediate" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Mount ID |
| `switch_` | `string` | query `switch` | No | wait (the default): files closed before the update finish uploading before the switch. immediate: switch at once; those files upload later with the previous settings, and such an upload can replace a newer write made through the new settings. If those files cannot all be checked within 10 seconds, the update answers 409 MOUNT_BUSY and changes nothing. |
| `data` | `FilesMountsUpdateRequest` | body | Yes |  |

**Body:** `{ auto_deliver: bool, vfs_config: files_VfsConfigPatch }`

**Returns:** `Promise<FilesMountsUpdateResponse>`  |  **HTTP:** `PATCH /api/v1/mounts/{id}`
**CLI:** `hoody files mounts update`

---

### `client.files.s3` (1) — WebDAV-compatible API for S3 storage

#### `get` — Access file from S3

```typescript
client.files.s3.get(path: string, options: { type: "s3"; server: string; s3_bucket: string; s3_region: string; user?: string; pass?: string; s3_endpoint?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `type` | `"s3"` | query | Yes |  |
| `server` | `string` | query | Yes | S3 service host. An AWS host (`*.amazonaws.com`) is reached by `s3_region`; any other host is the endpoint of an S3-compatible service (MinIO, DigitalOcean Spaces, ...), unless `s3_endpoint` names one. |
| `s3_bucket` | `string` | query | Yes | S3 bucket name. The path is the object key (or key prefix) within this bucket. |
| `s3_region` | `string` | query | Yes |  |
| `user` | `string` | query | No | Access key ID. Give both `user` and `pass`, or neither for anonymous access to a public bucket. |
| `pass` | `string` | query | No | Secret access key (base64 encoded). Give both `user` and `pass`, or neither. |
| `s3_endpoint` | `string` | query | No | Endpoint of an S3-compatible service (MinIO, etc.), as a host or URL. Takes precedence over `server`. |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `GET /{path}?type=s3`
**CLI:** `hoody files s3 get`

---

### `client.files.ssh` (2) — WebDAV-compatible API for SSH/SFTP

#### `get` — Access file via SSH/SFTP

```typescript
client.files.ssh.get(path: string, options: { type: "ssh"; server: string; user: string; pass?: string; key?: string; passphrase?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `type` | `"ssh"` | query | Yes |  |
| `server` | `string` | query | Yes | Server hostname:port |
| `user` | `string` | query | Yes | SSH username |
| `pass` | `string` | query | No | Password (base64 encoded) |
| `key` | `string` | query | No | Private key in PEM form (base64 encoded) |
| `passphrase` | `string` | query | No | Key passphrase (base64 encoded) |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /{path}?type=ssh`
**CLI:** `hoody files ssh get`

---

#### `upload` — Upload file via SSH/SFTP

```typescript
client.files.ssh.upload(path: string, data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string, options: { server: string; user: string; pass?: string; key?: string; passphrase?: string; contentType?: 'application/octet-stream' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `server` | `string` | query | Yes | Server hostname:port |
| `user` | `string` | query | Yes | SSH username |
| `pass` | `string` | query | No | Password (base64 encoded) |
| `key` | `string` | query | No | Private key in PEM form (base64 encoded) |
| `passphrase` | `string` | query | No | Key passphrase (base64 encoded) |
| `data` | `Blob \| ArrayBuffer \| Uint8Array \| ReadableStream<Uint8Array> \| string` | body | Yes |  |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `PUT /{path}?type=ssh`
**CLI:** `hoody files ssh upload`

---

### `client.files.ui` (1) — File operations - upload, download, delete, list files

#### `getPage` — List directory contents or download file

```typescript
client.files.ui.getPage(path: string, options?: { json?: ""; simple?: ""; sort?: "name" | "mtime" | "size"; order?: "asc" | "desc"; hash?: ""; sha256?: ""; base64?: ""; edit?: ""; view?: ""; download?: "" | "1" | "true"; contentType?: string; history?: ""; at?: string; revision?: number; diff?: ""; from_seq?: number; from_ts?: string; to_seq?: number; to_ts?: string; after_id?: number; limit?: number; theme?: "oc-1" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper"; colorScheme?: "light" | "dark"; font?: "ibm-plex-mono" | "cascadia-code" | "fira-code" | "hack" | "inconsolata" | "intel-one-mono" | "iosevka" | "jetbrains-mono" | "meslo-lgs" | "roboto-mono" | "source-code-pro" | "ubuntu-mono"; fontSize?: number; embedderOrigin?: string; chromeless?: boolean; borderless?: boolean; hideHeader?: boolean; hideSidebar?: boolean; hidePreview?: boolean; hideFooter?: boolean; embedBg?: "transparent" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File or directory path |
| `json` | `""` | query | No | Return JSON format instead of HTML |
| `simple` | `""` | query | No | Return simple text listing |
| `sort` | `"name" \| "mtime" \| "size"` | query | No | Sort by field |
| `order` | `"asc" \| "desc"` | query | No | Sort order |
| `hash` | `""` | query | No | Get SHA256 hash of file (returns plain text hash) |
| `sha256` | `""` | query | No | Get SHA256 hash of file (alias for hash) |
| `base64` | `""` | query | No | Get file content as base64 encoded string |
| `edit` | `""` | query | No | Open file in Web UI editor (requires allow-upload permission) |
| `view` | `""` | query | No | Open file in a read-only Web UI page: the text is shown with no Save, rename, move or delete. |
| `download` | `"" \| "1" \| "true"` | query | No | For file paths only: force browser download (Content-Disposition: attachment). Accepted values: empty (?download), 1, or true. For directory paths, ?download is the URL download-manager operation. |
| `contentType` | `string` | query `content-type` | No | Override Content-Type header for file downloads |
| `history` | `""` | query | No | List all revisions of a file. Returns JSON with revisions array, pagination via after_id. Mutually exclusive with at/revision/diff. |
| `at` | `string` | query | No | Read file content at a point in time. Accepts RFC3339 timestamp or Unix milliseconds. Mutually exclusive with history/revision/diff. Composable with ?lines, ?hash, ?base64. |
| `revision` | `number` | query | No | Read file content by stable per-path sequence number. Mutually exclusive with history/at/diff. Composable with ?lines, ?hash, ?base64. |
| `diff` | `""` | query | No | Compute unified diff between two versions. Requires from_seq or from_ts. Optional to_seq or to_ts (defaults to current file). Mutually exclusive with history/at/revision. |
| `from_seq` | `number` | query | No | Source revision seq number for ?diff. Mutually exclusive with from_ts. |
| `from_ts` | `string` | query | No | Source timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with from_seq. |
| `to_seq` | `number` | query | No | Target revision seq number for ?diff. Mutually exclusive with to_ts. Default: current file on disk. |
| `to_ts` | `string` | query | No | Target timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with to_seq. |
| `after_id` | `number` | query | No | Cursor for ?history pagination. Returns entries with id > after_id. |
| `limit` | `number` | query | No | Max entries to return for ?history. |
| `theme` | `"oc-1" \| "aura" \| "ayu" \| "carbonfox" \| "catppuccin" \| "dracula" \| "gruvbox" \| "monokai" \| "nightowl" \| "nord" \| "onedarkpro" \| "shadesofpurple" \| "solarized" \| "tokyonight" \| "vesper"` | query | No | HTML page only: colour theme of the page. Default oc-1. |
| `colorScheme` | `"light" \| "dark"` | query | No | HTML page only: light or dark colour scheme. Without it the page follows the system setting. |
| `font` | `"ibm-plex-mono" \| "cascadia-code" \| "fira-code" \| "hack" \| "inconsolata" \| "intel-one-mono" \| "iosevka" \| "jetbrains-mono" \| "meslo-lgs" \| "roboto-mono" \| "source-code-pro" \| "ubuntu-mono"` | query | No | HTML page only: monospace font of the editor and listing. |
| `fontSize` | `number` | query | No | HTML page only: editor font size in pixels. Default 14. |
| `embedderOrigin` | `string` | query | No | HTML page only: origin of the page that embeds this one, such as https://app.example.com. The page then accepts theme and layout messages from that origin and tells it when it is ready. Only https origins are accepted. |
| `chromeless` | `boolean` | query | No | HTML page only: hide the header, sidebar, preview, footer and borders at once. Each can be turned back on with its own parameter set to false. |
| `borderless` | `boolean` | query | No | HTML page only: hide the page borders. |
| `hideHeader` | `boolean` | query | No | HTML page only: hide the header bar. |
| `hideSidebar` | `boolean` | query | No | HTML page only: hide the sidebar. |
| `hidePreview` | `boolean` | query | No | HTML page only: hide the preview pane. |
| `hideFooter` | `boolean` | query | No | HTML page only: hide the footer. |
| `embedBg` | `"transparent"` | query | No | HTML page only: transparent lets the background of the embedding page show through. |

**Returns:** `Promise<ApiResponse<ArrayBuffer> | FilesUiGetPageResponse>` — the response Content-Type picks the branch: JSON gives the payload in `.data`, a binary type gives the bytes  |  **HTTP:** `GET /{path}`

---

### `client.files.uploads` (8) — Mount management - create, list, and remove FUSE filesystem mounts for remote backends

#### `delete` — Discard a pending upload

```typescript
client.files.uploads.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Pending upload ID |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/pending-uploads/{id}`
**CLI:** `hoody files uploads delete`

---

#### `deleteUnreadable` — Delete an unreadable pending upload

```typescript
client.files.uploads.deleteUnreadable(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Pending upload ID |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/pending-uploads/unreadable/{id}`
**CLI:** `hoody files uploads unreadable delete`

---

#### `deliver` — Deliver a pending upload

```typescript
client.files.uploads.deliver(id: string, data?: FilesUploadsDeliverRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Pending upload ID |
| `data` | `FilesUploadsDeliverRequest` | body | No |  |

**Body:** `{ backend_id: string, paths: string[], paths_b64: string[] }`

**Returns:** `Promise<FilesUploadsDeliverResponse>`  |  **HTTP:** `POST /api/v1/pending-uploads/{id}/deliver`
**CLI:** `hoody files uploads deliver`

---

#### `download` — Download a held file

```typescript
client.files.uploads.download(id: string, options?: { path?: string; path_b64?: string; Range?: string; IfRange?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Pending upload ID |
| `path` | `string` | query | No | A path from the item's files, exactly as listed. Give this or path_b64, not both. |
| `path_b64` | `string` | query | No | A path_b64 from the item's files, exactly as listed. Give this or path, not both. |
| `Range` | `string` | header | No | Ask for part of the held file, as 'bytes=first-last', 'bytes=first-' or 'bytes=-suffix_length', as for a file download. One satisfiable range answers 206 with Content-Range; several answer 206 as multipart/byteranges. Ranges that cannot be satisfied are dropped from a list, and 416 comes only when none is left. A malformed header is ignored (200, whole file). |
| `IfRange` | `string` | header `If-Range` | No | Honour Range only if the held file still has this ETag, exactly; otherwise answer 200 with the whole file. |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /api/v1/pending-uploads/{id}/file`
**CLI:** `hoody files uploads download`

---

#### `list` — List pending uploads

```typescript
client.files.uploads.list(options?: { backend_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `backend_id` | `string` | query | No | Only items of this backend |

**Returns:** `Promise<FilesUploadsListResponse>`  |  **HTTP:** `GET /api/v1/pending-uploads`
**CLI:** `hoody files uploads list`

---

#### `listFiles` — List a pending upload's files

```typescript
client.files.uploads.listFiles(id: string, options?: { cursor?: string; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Pending upload ID |
| `cursor` | `string` | query | No | next_cursor from the previous page. Omit it for the first page. |
| `limit` | `number` | query | No | Largest number of files on the page |

**Returns:** `Promise<FilesUploadsListFilesResponse>`  |  **HTTP:** `GET /api/v1/pending-uploads/{id}/files`
**CLI:** `hoody files uploads files list`

---

#### `listUnreadable` — List unreadable pending uploads

```typescript
client.files.uploads.listUnreadable()
```

**Returns:** `Promise<FilesUploadsListUnreadableResponse>`  |  **HTTP:** `GET /api/v1/pending-uploads/unreadable`
**CLI:** `hoody files uploads unreadable list`

---

#### `stop` — Stop a running upload

```typescript
client.files.uploads.stop(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Pending upload ID |

**Returns:** `Promise<FilesUploadsStopResponse>`  |  **HTTP:** `POST /api/v1/pending-uploads/{id}/stop`
**CLI:** `hoody files uploads stop`

---

### `client.files.webdav` (8) — WebDAV protocol operations - PROPFIND, PROPPATCH, COPY, MOVE, LOCK, UNLOCK, OPTIONS

#### `copy` — Copy a file

```typescript
client.files.webdav.copy(path: string, options: { Destination: string; Overwrite?: "T" | "F" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Source file path |
| `Destination` | `string` | header | Yes | Destination URL for the copy |
| `Overwrite` | `"T" \| "F"` | header | No | T (default) replaces an existing destination; F refuses one, answering 412 and leaving it untouched. A request refused for another reason is answered for that reason instead, whatever this header says: copying or moving a resource onto itself is 403, and so is a source that is not a regular file. |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `COPY /{path}`

---

#### `get` — Access file via WebDAV

```typescript
client.files.webdav.get(path: string, options: { type: "webdav"; server: string; user?: string; pass?: string; webdav_path?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `type` | `"webdav"` | query | Yes |  |
| `server` | `string` | query | Yes |  |
| `user` | `string` | query | No |  |
| `pass` | `string` | query | No |  |
| `webdav_path` | `string` | query | No | WebDAV endpoint path |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `GET /{path}?type=webdav`
**CLI:** `hoody files webdav get`

---

#### `getOptions` — Get allowed methods

```typescript
client.files.webdav.getOptions(path: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `OPTIONS /{path}`

---

#### `getProperties` — Get WebDAV properties

```typescript
client.files.webdav.getProperties(path: string, data?: string, options?: { Depth?: "0" | "1" | "infinity" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `Depth` | `"0" \| "1" \| "infinity"` | header | No | Depth of property retrieval: 0 (resource only), 1 (immediate children), infinity (recursive) |
| `data` | `string` | body | No |  |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `PROPFIND /{path}`

---

#### `lock` — Lock file (WebDAV compatibility)

```typescript
client.files.webdav.lock(path: string, data?: string, options?: { Depth?: "0" | "infinity" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `Depth` | `"0" \| "infinity"` | header | No |  |
| `data` | `string` | body | No |  |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `LOCK /{path}`

---

#### `move` — Move or rename file/directory

```typescript
client.files.webdav.move(path: string, options: { Destination: string; Overwrite?: "T" | "F" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Source file or directory path |
| `Destination` | `string` | header | Yes | Destination URL for the move |
| `Overwrite` | `"T" \| "F"` | header | No | T (default) replaces an existing destination; F refuses one, answering 412 and leaving it untouched. A request refused for another reason is answered for that reason instead, whatever this header says: copying or moving a resource onto itself is 403, and so is a source that is not a regular file. |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `MOVE /{path}`

---

#### `unlock` — Unlock file (WebDAV compatibility)

```typescript
client.files.webdav.unlock(path: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `UNLOCK /{path}`

---

#### `updateProperties` — Update WebDAV properties

```typescript
client.files.webdav.updateProperties(path: string, data?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |
| `data` | `string` | body | No |  |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `PROPPATCH /{path}`


### Body schemas

- `files_MoveRequest` — `{ move_to*: string }`
- `files_RenameRequest` — `{ name*: string }`
  - `name` — New filename (cannot contain path separators)
- `files_ChmodRequest` — `{ mode*: string }`
- `files_ChownRequest` — `{ group: string, owner: string }`
- `files_VfsConfigPatch` — `{ allow_non_empty: false, allow_other: false, cache_max_age: string | int, cache_max_size: string | 0 | int, cache_mode: "off" | "minimal" | "writes" | "full", contimeout: string | int, dir_cache_time: string | int, low_level_retries: int, poll_interval: string | int, read_chunk_size: string | int, read_only: bool, timeout: string | int, write_back: string | int }`
  - `allow_non_empty` — Accepted only as false, so a GET response can be sent back unchanged. It cannot be set.
  - `allow_other` — Accepted only as false, so a GET response can be sent back unchanged. It cannot be set.
  - `cache_max_age` — How long an unused file stays in the local cache. Seconds as a whole number, or a string such as "30s", "5m" or "1h30m" (units h, m and s; a number without a unit is seconds). Between 0 and 2592000 seconds (30 days). Default for new mounts: 1h.
  - `cache_mode` — How file contents are cached locally: off (no cache; a file cannot be opened for reading and writing at once), minimal, writes (files opened for writing), or full. Default for new mounts: writes.
  - `contimeout` — How long connecting to the backend may take before the attempt fails (1 minute when not set). Seconds as a whole number, or a string such as "30s", "5m" or "1h30m" (units h, m and s; a number without a unit is seconds). Between 1 and 120 seconds (2m).
  - `dir_cache_time` — How long directory listings are cached. Seconds as a whole number, or a string such as "30s", "5m" or "1h30m" (units h, m and s; a number without a unit is seconds). Between 0 and 2592000 seconds (30 days). Default for new mounts: 5m.
  - `low_level_retries` — How many times one failed request to the backend is retried before the operation fails: a whole number between 0 and 10. Not set for new mounts: 10 retries.
  - `poll_interval` — How often the backend is checked for changes, on backends that support it; 0 turns checking off. Seconds as a whole number, or a string such as "30s", "5m" or "1h30m" (units h, m and s; a number without a unit is seconds). Between 0 and 2592000 seconds (30 days). Default for new mounts: 1m.
  - `read_only` — Refuse writes through the mount path. The backend file API can still write. Default for new mounts: false.
  - `timeout` — How long a transfer with the backend may stay idle before it fails. … Between 1 and 600 seconds (10m).
  - `write_back` — Upload delay: how long a file written and closed waits before it is uploaded. Seconds as a whole number, or a string such as "30s", "5m" or "1h30m" (units h, m and s; a number without a unit is seconds). Between 0 and 3600 seconds (1h). Default for new mounts: 5s.

