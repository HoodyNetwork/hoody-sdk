> _**SDK skill · `files` namespace** · ~44,364 tokens · hoody-sdk v1.0.1_

# `files` — computer filesystem over HTTP, with automatic Git-like change history

## Purpose

**Default surface: the computer's own filesystem, exposed over HTTP — with automatic mutation journaling when the deployment enabled it.** Read, write, copy, move, delete, stat, chmod, list, glob, grep, archive-preview/extract, fetch URLs into the FS, resumable upload — all on absolute computer paths (`/home/user/main.py`, `/etc/hostname`, `/hoody/databases/foo.db`). No backend flag needed.

**Headline feature when journaling is on — automatic change history for writes made through `files`.** With the journal enabled, every `PUT` / `PATCH` / `DELETE` / `MOVE` / `COPY` sent to this kit is appended to a per-computer mutation log, on a best-effort basis (an entry is skipped when the journal's storage budget is exceeded or its writer is unhealthy; the write itself still succeeds and the log can then show a `gap` entry; check `journal.getStats`): monotonic sequence number, timestamp, path, op, size, hash. **Only writes made through `files` are recorded:** the agent's file tools, a terminal, `exec` scripts and other programs write to the disk directly, and the journal never sees those changes. **History is kept for journaled paths, within limits:** retention prunes old entries (90 days or 2 GiB of journal storage by default), bodies over 2 MiB, and binary files, keep only their hash and size, and excluded paths (dev dirs such as `node_modules`, and `.git`) are never recorded. The journal lets you:

- **Time-travel a single file** — `files.get` with `{ revision: <seq> }` or `{ at: '<unix-ms>' }` returns the bytes the journal recorded for that point.
- **List a file's history** — `files.get` with `{ history: '' }` returns one page of the path's revisions (renames followed), oldest first by global journal entry id: 100 entries by default, `limit` up to 1000. While the response has `has_more: true`, request again with `after_id` set to its `next_after_id`.
- **Diff between revisions** — `files.get` with `{ diff: '', from_seq: <N> }` returns a unified diff between revision `N` and the file as it is on disk now; add `to_seq` or `to_ts` to compare two recorded revisions instead.
- **Tell when the journal is behind the disk** — a journal view of a file says, when the file on disk could be checked, whether the journal's newest record of it still matches it (no flag means the state is unknown): `head_matches_disk` in the `{ history: '' }` JSON, the `X-Journal-Head-Matches-Disk` header on `at`, `revision` and `diff` reads. `false` means the file does not match a known retained journal head: an outside write, a change the journal does not record, pruned history or no content history can each cause it, and the flag alone does not say which.
- **Replay / audit** — `journal.list` with `{ path, after_id }` streams every operation after global journal entry `id` (while the response has `has_more: true`, resume from its `next_after_id`; on the last page `next_after_id` is `null`, so keep the last entry's `id` as your cursor; an entry's `seq` is its per-path revision number, not a cursor). Run `journal.flush` to force-persist before querying for the absolute latest.
- **Cross-replicate** — pipe the journal into another computer as an event source for mirroring / fan-out / append-only sync.

When the deployment turned journaling on, no per-write setup is needed — every covered write is normally recorded. Exposing the journal query endpoints — history, revision, diff, stats, flush — over the API is a second deployment-side switch; where it is off those endpoints return `403`. Where API access is on but recording itself is off, they return `404 Journal is not enabled`. It is not a complete undo: retention pruning, the 2 MiB body cap, binary files (their contents are not kept), the exclude lists and write paths with no journal hook (URL downloads, archive extraction) all leave gaps, so check the file's history before relying on a restore. Journaling is ON in the standard `hoody_kit: true` computer image; a raw kit deployment that did not turn it on skips recording (writes there follow their own switches, see Prerequisites).

**Optional add-ons (per-request, opt-in):**
- **Remote backends** — pass the `backend: <id>` option to operate against a backend you've connected, of any of the 49 allowed rclone backend types (Mega, SFTP, S3, GDrive, Dropbox, Backblaze B2, WebDAV, …), instead of the local FS. A `?type=` parameter does not select a connected backend: on `/api/v1/files/{path}` it is ignored and the request runs on the local FS. Only where the deployment enabled remote backends; otherwise `403`. Note: the journal records local-FS mutations; remote-backend ops go to the remote and aren't replayable from the journal.
- **FUSE mounts** — `mounts.create` to surface a remote backend AS a path in the local FS. Same deployment-side requirement.
- **chmod / chown** — Unix-only, and only where the deployment enabled them; otherwise `403`.

## When to use

- **Local computer FS (the 90% case)** — CRUD, archive entry / extract, search (glob, grep; grep stops at a file's first NUL byte and skips the whole read block (about 64 KiB) that contains it, so matches before the NUL are kept only if they sit in an earlier block; in a small file with a NUL, grep finds nothing), download a URL into a path, resumable upload. Local works out of the box.
- **Recover / inspect a previous version of a text file** — `files.get` with `{ history: '' }`, `{ revision: <seq> }`, `{ at: '<unix-ms>' }` or `{ diff: '', from_seq: <N> }`. Available where journaling and journal API access are on (`403` when API access is off, `404` when recording is off), for writes the journal recorded and still retains (see Quirks for what is excluded).
- **Audit / replay the changes `files` recorded** — `journal.list` for the full event stream (sequence, timestamp, path, op, size, hash). Changes made by the agent's tools, a terminal or a program are not in it; use `watch` to see those.
- **Remote cloud / SSH / S3** — pass the `backend: <id>` option to read (`files.get`), stat (`files.stat`), upload (`files.upload`, not with `append`), delete (`files.delete`) or create a directory (`files.mkdir`). Only `files.get`, `files.stat`, `files.upload`, `files.delete` and `files.mkdir` take a `backend` option, and `files.upload` refuses it with `400` together with `append`. `files.update`, `files.append`, `files.copy`, `files.move`, `files.archives.extract` and `files.downloads.create` have no `backend` option; do not bypass the types with a cast. A `backend` forced onto `archives.extract` together with `owner`, or onto `downloads.create` together with `owner` or `id`, throws a client-side `ValidationError` (those forms are valid without it); on any other call the forced option is dropped and the operation runs locally.
- **FUSE-mount a remote into the local FS** — when downstream code needs to read the remote as a regular path (under the mount directory, `/hoody/mounts/permanent/…` by default).
- **Share a folder as one download** — the bare `?zip` flag on a local folder's `/api/v1/files` path streams it as a zip from the files kit URL (Example 11); needs archive downloads enabled (`403 Archive download not allowed` otherwise).

## When NOT to use

Run binaries -> `terminal`/`exec`, live events -> `watch`, TS/JS gen -> `exec`, indexed queries -> `sqlite`, traffic logs -> `proxyLogs`.

## Prerequisites

- **For plain read/stat/list**: no deployment switch, but any authentication and per-path access rules configured on the kit still apply (`401` without credentials, `403` for a path outside your rules). **Writes are enabled by the deployment, not per request**: upload/write/append and copy need write enabled, delete needs delete enabled, move needs both; on the WebDAV-style `/{path}` route, replacing existing bytes (a `PUT` over a non-empty file, or a `PATCH` with an explicit `bytes=` range) needs delete enabled as well, while an append at the end does not (403 otherwise; all enabled in the standard hoody_kit computer image, off on a raw kit deployment that did not turn them on). Paths are absolute computer paths, so use `/home/user/...`, `/etc/...`, etc.
- **For glob / grep**: gated separately — glob needs search enabled, grep needs grep enabled (403 "not allowed" otherwise; both enabled in the standard hoody_kit computer image).
- **For remote backends** (`?backend=` on `/api/v1/files`, the legacy `?type=` on the WebDAV-style `/{path}` front, FUSE mounts): the deployment must have enabled remote backends; otherwise `403`. `/api/v1/files` reads only `backend`; a `?type=` there is ignored and the request goes to local disk.
- **For chmod / chown**: the deployment must have enabled them, and the computer is Unix.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Read, search, write

1. `files.readText` / `files.readJson` / `files.readBytes` resolve to the content itself (string, parsed value, `Uint8Array`); `files.get` resolves to `{ statusCode, message, data }`, where `data` is the body exactly as the kit sent it (a stored file shaped like `{ statusCode, data }` is not unwrapped), with `{ lines: '10-50' }` for a line range; `files.stat` gives the metadata.
2. `files.glob` with `{ pattern: '**/*.ts' }`; `files.grep` with `{ pattern: 'TODO', context: 2 }` (local only).
3. `files.upload` with `{ append: '' }`; `files.delete`. (An append is never sent twice once it may have reached the kit: see Example 3, step 3.)

### 2. Download, extract, FUSE-mount

1. `downloads.create(dir, { download: url })` resolves when the download has finished; `downloads.listByDirectory`, called meanwhile, shows its progress.
2. `archives.preview`; `archives.extract(archive, { extract: 'src/', dest: 'work-src' })` (`extract` is an exact entry name, or a directory prefix ending in `/`; no globs. `dest` MUST be relative).
3. `backends.createS3` (one `create*` method per backend type, e.g. `createSftp`) -> `files.get('/remote/path', { backend: id })` for one-shot reads OR `mounts.create` -> `files.list('/hoody/mounts/permanent/...')` for a regular FS view -> `mounts.delete`/`backends.delete`. (`files.list` itself has no `backend` option; `files.get`/`files.upload`/`files.delete` do.)

### 3. Journal time-travel + TUS-like upload

1. `files.get` with `{ history: '' }`, `{ revision: N }` or `{ at: '<unix-ms>' }`, `{ diff: '', from_seq: N }` (valueless flags take `''`).
2. `journal.list({ path, after_id })` (global entry id, not `seq`; see Purpose for the last-page cursor rule); `journal.flush` first.
3. Resumable: `files.upload` for the first chunk, then `files.append(path, bytes)` per chunk (Example 3); it takes raw bytes, no cast. `files.writeChunk(path, bytes)` also appends raw bytes, over the WebDAV route: it takes bytes directly and sets the append header itself, so do not pass `XUpdateRange` (the call throws if you do). Do not override its content type with `application/json`: the WebDAV route would read the chunk as a metadata request (a `Blob` typed `application/json` is sent as `application/octet-stream`).

## Quirks & gotchas

- Reserved sub-prefixes (stat, chmod, chown, realpath, glob, grep, copy, move, append) dispatch by URL prefix, each scoped to a specific HTTP method (stat/grep/glob/realpath→GET, chmod/chown→PATCH, copy/move→POST, append→PUT) to prevent method bleeding -- so `DELETE /api/v1/files/stat/foo` does NOT trigger the stat dispatcher; it removes the literal path `/stat/foo`. `/api/v1/files/health` is a route of its own and never reaches the dispatcher.
- `files.glob`/`files.grep`/`files.realpath`/`lines` local-only; `backend` -> 400.
- `?backend=` (on `/api/v1/files`) and the legacy `?type=` (on the `/{path}` front only) need remote backends enabled deployment-side.
- `backend` on `/api/v1/files/{path}` is served only for GET, DELETE, PUT without `append`, and POST that creates a directory; on any other method or operation it returns `400` ("only supported for reading, uploading and deleting files and for creating directories").
- `files.chmod`/`files.chown` Unix-only, and only where the deployment enabled them.
- WebDAV verbs on `/{path}`: PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK, CHECKAUTH, LOGOUT.
- `files.realpath` resolves symlinks whether or not symlink following is enabled, but still returns `403` when the resolved target is outside the serve root or outside your access rules.
- **Resumable upload PATCH must use the WebDAV root route (`PATCH /{path}`), NOT `PATCH /api/v1/files/{path}`** — the api/v1 PATCH reads a small JSON body as a metadata operation (at most 64 KiB, else `413 Request body too large`; malformed JSON is `400 Invalid JSON body`), so a raw chunk is refused unless it happens to be valid JSON, which can be taken as a move or rename. The WebDAV form takes `X-Update-Range: append` — or an HTTP-Range offset `bytes=<start>-<end>` (a Content-Range-style `/<size>` suffix is REJECTED with `400 Invalid X-Update-Range Header`) — plus the raw body, and returns `204 No Content` on success. Send the chunk with a non-JSON `Content-Type`, such as `application/octet-stream`: on the WebDAV route too, a content type starting with `application/json` selects a metadata request instead (chmod, chown or rename), and `X-Update-Range` is ignored. The path must already exist (`404` otherwise). An explicit range's start must fall INSIDE the current file, but only that start is used: the whole body is written from it, the range end does not bound the write, and a body longer than the rest of the file extends it. A start at or past EOF is refused, so use `append` to continue at the end.
- **Archive `?dest=` MUST be relative** (e.g. `?dest=extracted`), not absolute — sending `?dest=/abs/path` returns `400 Absolute destination path not allowed`. The directory is created relative to the archive's containing dir.
- **`?preview` query value matters** — pass `?preview` empty (no `=…`) for a full archive listing; `?preview=true` is parsed as the entry name `true` and returns `404 Entry not found in archive: true`. Same trap on `?contents`.
- **Bare `?extract_file=` is unhandled by the kit's GET dispatcher** — the request falls through to "send the raw archive file" and you get the **whole archive's bytes**, not the selected entry. The generated SDK and CLI work around this by ALSO sending `?extract=` — when both query params are present, the `archives.extract` branch runs (writes to disk under `?dest=`). The OpenAPI-only `?extract_file=` form is effectively dead.
- **The journal retains body bytes only for text files up to 2 MiB by default; a binary file, or a larger one, still produces a journal entry with its hash and size, but its contents are not kept**.
- **Exclusions decide which paths are journalled.** Built-in dev-dir excludes (`node_modules`, `target`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `__pycache__`, `.venv`, `venv`, `env`, `__pypackages__`, `.tox`, `.nox`, `bower_components`, …) skip journaling unless the deployment turned the dev-dir exclusions off. `.git` is always excluded regardless of that setting (separate hardcoded check, not part of the toggleable list). The deployment can add further excludes of its own. This is why "I wrote to `node_modules/x` and saw no journal entry" is expected.
- **Journal does NOT cover everything by default.** Live behaviour observed: a fresh `PUT` (create) and an overwriting `PUT` (write) on `/home/user/...` produce entries; URL downloads (`?download=`) and archive extraction are NOT journaled — those write through paths with no journal hook. `files.chmod`, `files.chown`, `files.touch`, `?append=true` and copy/move ARE recorded. Always call `journal.flush` then `journal.list` (or `?history=1`) to inspect what was actually recorded — don't assume coverage.
- **Built-in dev-dir exclude list always skips journaling** for `node_modules`, `__pycache__`, `.venv`, `target`, `.next`, `.nuxt`, etc. — even on `/home/user/...` paths. Only the deployment can turn these off, at kit start. `.git` is hardcoded to ALWAYS be excluded and stays excluded even then.
- **`HEAD` returns no body** on both routes. `HEAD /api/v1/files/{path}` ignores `Range`, so its status and headers need not match a ranged `GET`. It carries no metadata body; for a JSON metadata envelope use `files.stat`.
- **`files.chown` to root is rejected** with `400 Cannot change ownership to root (UID 0)` (owner) or `400 Cannot change group to root (GID 0)` (group) — even where the deployment enabled chown. Use a non-root user (`nobody`, `user`, …).
- **FUSE mount paths live under a configured mount directory** (`/hoody/mounts/permanent` by default, fixed by the deployment at kit start). An absolute `mount_path` must be under it (`400 Mount path must be under the configured mount directory` otherwise); a relative `mount_path` is resolved under it; an omitted one becomes `<mount dir>/<mount id>` (ids look like `mount_<32 hex>`). If the path already exists and is not a symlink, the create fails with `409 Mount path already exists and is not a symlink`.
- **Listing-style query params (`?downloads`, `?download_history`, `?extractions`, `?extraction_history`) are honoured on the WebDAV root route, NOT on `/api/v1/files/...`** — calling `GET /api/v1/files/<dir>?downloads` returns a regular directory listing (the query is ignored). Use `GET /<dir>?downloads` (or `GET /?download_history` for the global feed).
- **Mount the whole FS as a local drive on the USER's machine (client-side WebDAV).** Because the kit serves a WebDAV API at its URL root, the OS's built-in WebDAV client can mount the computer's files as a drive/folder: on **Windows** *Map network drive* to `https://{P}-{C}-files-1.{N}.computers.hoody.com/`, on **macOS** Finder → *Connect to Server* to the same URL. This is the inverse of the server-side FUSE mounts (which mount remote backends INTO the computer); a **server-side** WebDAV mount whose remote is a Hoody Files kit gets the same safe save (the remote keeps a version the mount never received as a conflict copy beside the file); the safe save needs the mount-session header that `hoody mount` and the server-side mount send, so the built-in Windows and macOS WebDAV clients above get no safe-save guarantee; on every other backend type the upload that reaches the backend last wins, so keep one writer per file there.

## Common errors

- 400 not supported with remote backends -- drop `?backend=`.
- 400 Cannot combine realpath with other ops.
- 400 Cannot preview a directory as archive.
- 400 Unknown operation -- POST needs one query op.
- 400 Missing query parameter or request body -- PATCH needs op or body.
- Refusals on the WebDAV path route (`/{path}`) answer JSON `{success: false, error, code}`: `ACCESS_FORBIDDEN` 403, `RESOURCE_NOT_FOUND` 404, `INVALID_PATH` 400, `PATH_CONFLICT` 409, `OVERWRITE_REFUSED` 412 (a WebDAV `COPY`/`MOVE` with `Overwrite: F` onto an existing target), `DIRECTORY_EXISTS` 405 (creating a directory that exists), `PAYLOAD_TOO_LARGE` 413, `UPLOAD_INCOMPLETE` 400 and `REMOTE_UPLOAD_FAILED` 502 (an upload to a remote backend), and `MOUNT_PATH_RESERVED` 409 for a change to a path a mount holds. `INVALID_PARAMETER` means the request itself is wrong. The shared concurrent download/extraction limit answers 429 with `code: "JOB_COUNT_LIMIT"`: retry after a running job ends. Some OS errors and backend failures carry no `code` (others do: a refused write is `ACCESS_FORBIDDEN` 403, a failed remote upload `REMOTE_UPLOAD_FAILED` 502), so branch on the status when it is absent. On `/api/v1/files/{path}` many refusals carry no `code` — a REST copy or move onto an existing target without overwrite is 409 `{success: false, error, code: "DESTINATION_EXISTS"}` and changes nothing. REST codes include `INVALID_PATH` 400 (`{success: false, error: "Invalid path", code: "INVALID_PATH"}`), `ACCESS_FORBIDDEN` 403 (a path rule), `CONTAINS_SERVICE_STORAGE` 409, `FILE_MOVE_CROSSES_DEVICES` 409, `INVALID_PARAMETER` 400 on some parameter checks, and `FILE_PATH_BUSY`, `FILE_PATH_CHANGED` and `MOUNT_PATH_RESERVED` 409 for a change to a path that is in use or held for a mount. `PERMISSIONS_NOT_APPLIED` and `OWNER_NOT_APPLIED` 409 mean the filesystem does not retain the requested permission bits or owner, as on a mount of remote storage: use storage that retains them when you need them. A chmod, or an upload whose requested permissions are narrower than the file's fixed ones, changes nothing; an upload requesting broader permissions writes its whole body under the fixed ones and still answers `PERMISSIONS_NOT_APPLIED`, so read the message before deciding whether to resend the body. When `code` is absent, branch on the HTTP status.
- A URL download streams into a hidden part file, `.hoody-download-<id>.part`, in the destination folder, and the file gets its final name only once it is complete. Cancelling the download (or a failure or timeout) removes that part file on a local filesystem (ext4, xfs, btrfs, tmpfs) only if its inode is still the one the download created. On FUSE mounts and network filesystems cleanup removes the part file by its unique name while it is still a regular file; cleanup can still fail, so check the destination for leftovers.

## Related namespaces

- `terminal` -- run binaries.
- `exec` -- TS/JS gen.
- `watch` -- live events.
- `sqlite` -- indexed queries.
- `browser`/`curl` -- scripted HTTP.

## Examples

Most steps have a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `computers.get` (`client.api.computers.get(computerId)`) first. Examples that need history use `/home/user/...`. The kit has no fixed rule for `/tmp` or `/home/user`: coverage depends on the exclude lists, so check `{ history: '' }` rather than assuming it. An idle kit may be asleep: the first request can return `502` from the proxy with an HTML error body, so retry 2-3 times with a few seconds of backoff.

### 1. Read a file — full bytes, stat envelope, and a slice of lines

**Goal:** inspect an unknown text file three ways: get its metadata, peek the raw bytes, and slice an arbitrary line range without pulling the whole thing.

**Step 1 — stat first.** `files.stat` returns size, owner/group, octal permissions, mtime, and, when the journal has recorded the path, `revisions`: the path's latest per-path revision number. The field is absent for a path the journal has not recorded, and it is not a count of the entries still retained after pruning. Use this BEFORE downloading a file you don't know the size of.

```typescript
const s = await client.files.stat('/etc/hostname');
console.log(s.data!.size, s.data!.permissions);
```

**Step 2 — line slice.** `lines: '2-3'` returns just lines 2 through 3 inclusive. Local-FS only (rejected with `400` when combined with `backend`).

```typescript
const slice = await client.files.readText('/etc/passwd', { lines: '2-3' });   // the two lines as a string
```

**Step 3 — full body.** No query params, raw bytes. The `Content-Type` of a later download is inferred from the filename, with `application/octet-stream` when it has no known extension.

```typescript
const body = await client.files.readText('/etc/hostname');   // readBytes for a binary file
```

### 2. Find files then grep them — TODO scan across a tree

**Goal:** find the `.md` files under a directory (visible and not ignored by default), then grep them for `TODO` with surrounding context. Both ops are local-FS only.

**Step 1 — glob.** `pattern` matches relative to `path`; obeys `.gitignore` unless `no_ignore=true` (`.gitignore` rules apply only inside a git repository). Names starting with `.` are skipped unless `hidden=true` (CLI `--hidden`) or an ignore-file `!name` rule re-includes them. Results are capped by `max_results` (default 1000, maximum 10000); check `truncated` in the response and search a smaller subtree when you need every match.

```typescript
const r = await client.files.glob('/home/user', { pattern: '**/*.md' });
const paths = r.data!.entries.map(e => e.name);
```

**Step 2 — grep with context.** `?glob=` filters which files grep looks at; `?context=2` mirrors `grep -C 2`.

```typescript
const m = await client.files.grep('/home/user', { pattern: 'TODO', ignore_case: true, glob: '**/*.md', context: 2 });
console.log(m.data!.total_matches, m.data!.matches.length);
```

### 3. Resumable upload — split a payload into a first upload and appended chunks

**Goal:** push a 16 MiB payload as 8 MiB chunks. Many CDN/proxy combos cap a single body at 10 MiB; chunked upload sidesteps that.

**Step 1 — first chunk via PUT.** Creates the file with the first slab.

```typescript
import { randomBytes } from 'node:crypto';
await client.files.upload('/home/user/upload-test.bin', randomBytes(8 * 1024 * 1024));
```

**Step 2 — append remaining chunks.** Each chunk is one `files.append`: it sends `PUT /api/v1/files/append/{path}`, stages the whole body before the file changes, creates the file when it does not exist, and answers `200` with `{ success, path, new_size }`. 

```typescript
import { randomBytes } from 'node:crypto';
// files.append sends raw bytes to PUT /api/v1/files/append/{path}; no cast needed.
await client.files.append('/home/user/upload-test.bin', randomBytes(8 * 1024 * 1024)); // never resent once it may have reached the kit, see step 3
const s = await client.files.stat('/home/user/upload-test.bin');
```

**Step 3 — resume after a network drop.** A WebDAV append (`PATCH /{path}` with `X-Update-Range: append`) writes bytes as they arrive, so a request that broke off may already have added part of its chunk. A REST append (`PUT /api/v1/files/append/{path}`, or an upload with `append`) stages the whole body first, so a body that broke off leaves the file unchanged, although a failure during the write that follows can still leave part of the chunk appended. For a REST append sent without `Content-Length` (streamed, chunked or HTTP/2), send `X-Expected-Length` with the chunk's byte count: an HTTP/2 client that is aborted mid-body can otherwise hand over a body that looks complete, so the append ends short with no error, whereas with the header the kit refuses a body of any other length with `400` before the file changes. A WebDAV append does not check that header, so after a break stat the file before resuming. Either way, do not resend the whole chunk blindly: stat the remote file, compare its size with how many bytes of the payload you have sent, and append only the bytes after that size. An explicit `bytes=<start>-<end>` range (no `/<total>` suffix — that is rejected) must start inside the existing file and writes the whole body from that start, so it can rewrite a tail you know is wrong, but a start at EOF is refused; appending is the way to continue. The generated SDK sends only appends (`files.append`); explicit byte ranges need raw HTTP. The SDK never sends an append twice once it may have reached the kit: for `files.append`, and for `files.upload` with `append: ''`, any answer or a lost connection is final, and a retry covers only a request that never reached a server. A failed append can therefore still have added the chunk; after a failed call, stat the file before deciding which bytes to send next.

### 4. Time-travel a single file — history → revision N → diff

**Goal:** roll back a config file by reading an earlier revision, comparing it to current, then writing the chosen revision back. Use a path the journal covers: not under an excluded directory (`.git`, dev dirs such as `node_modules`, or excludes the deployment added — see Quirks), and confirm with `?history`.

**Step 1 — write two revisions.** Use a path with no journal history yet: revisions count on per path, so the `revision=1` below is this example's first write only on a fresh path. On a path with history, take the revision numbers from step 2.

```typescript
const path = '/home/user/config.toml';
await client.files.upload(path, Buffer.from('verbose = false'));
await new Promise(r => setTimeout(r, 1000));
await client.files.upload(path, Buffer.from('verbose = true'));
await client.files.journal.flush();
```

**Step 2 — list history.** `{ history: '' }` returns one page of the per-revision log (100 entries by default, `limit` up to 1000; while `has_more` is `true`, repeat with `after_id` set to the response's `next_after_id`): each entry has `seq`, `op` (`"create"` / `"write"` / `"delete"` / `"moved_from"`/`"moved_to"` / etc. — see Example 5 for the full enum), `ts`, hashes, and size deltas.

```typescript
// Empty-string sentinel for valueless query flags — generated SDK rejects '1'.
const h = await client.files.get(path, { history: '' });
```

**Step 3 — fetch revision N.** `revision: 1` returns the bytes of that point-in-time. (Use `at: '<unix-ms>'` for an instant.)

```typescript
const old = await client.files.get(path, { revision: 1 });
const diff = await client.files.get(path, { diff: '', from_seq: 1 });
```

**Step 4 — restore by writing rev1 bytes back.** Write the bytes returned by `revision: 1` back to the path.
```typescript
const { data: rev1 } = await client.files.get(path, { revision: 1, responseType: 'arrayBuffer' });
await client.files.upload(path, rev1 as ArrayBuffer);
```

### 5. Audit — stream recorded Hoody Files mutations since a cursor via the journal

**Goal:** wire a SIEM / alerting pipeline. Get the recorded FS mutations since the last cursor, including hashes for tamper detection. Don't forget `journal.flush` first. The journal records only changes made through Hoody Files: a change made by a terminal, a script, a program or the agent's tools is not in it.

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

**Goal:** pull an asset from the public internet into a computer path. The kit handles the actual HTTP fetch — useful for sandboxed computers without outbound HTTP libs.

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

**Step 3 — extract a single file to disk.** Pass `?extract=<entry>` with the exact entry name (a bare `?extract_file=` does nothing useful: it falls through to "send whole archive"). The kit writes the matched entry under `?dest=`; without `dest` it creates a directory named after the archive beside it (`hello.zip` → `hello/`, `x.tar.gz` → `x/`) and extracts there.

```typescript
// extract-file writes the chosen entry under `dest` (relative to the archive's folder,
// here /home/user/inbox/extracted) and returns an extraction response; to get the bytes
// back, follow up with client.files.readBytes('/home/user/inbox/extracted/Hello-World-master/README').
const extracted = await client.files.archives.extractMember('/home/user/inbox/hello.zip', { extract: 'Hello-World-master/README', dest: 'extracted' });
```

### 8. Cross-directory copy + move + chmod (a one-shot deploy)

**Goal:** stage a config in a working dir, copy to the target, set permissions, move the staging file to a backup folder. Uses POST against the copy/move reserved-prefix routes (`/api/v1/files/copy/...`, `/move/...`) and PATCH for chmod/chown (`/api/v1/files/chmod/...`, `/chown/...`).

**Step 1 — copy.** The destination is the `copy_to` option (for move, `move_to`). Add `overwrite: 'true'` (a string) to allow replacing an existing destination.

```typescript
await client.files.copy('/home/user/staging/app.toml', { copy_to: '/etc/myapp/app.toml', overwrite: 'true' });
```

**Step 2 — chmod.** Octal as a query param (`?chmod=600`). Requires chmod enabled by the deployment; Unix-only.

```typescript
await client.files.chmod('/etc/myapp/app.toml', { chmod: '600' });
```

**Step 3 — move staging → archive.** Same pattern as copy, but move never replaces an existing destination (409 `DESTINATION_EXISTS`) and takes no `overwrite`: delete the destination first. `move_to` is required.

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

**Step 1 — DELETE on the directory.** `DELETE /api/v1/files/<dir>` removes recursively. (Reserved-prefix trap: a path like `/api/v1/files/stat/foo` is interpreted as removing `/stat/foo`, NOT a stat call. Always use absolute computer paths.)

```typescript
await client.files.delete('/home/user/files-examples-cleanup');
```

**Step 2 — verify.** A `404` from `files.stat` is what you want. It means the path is not found through this API; it does not by itself prove that no entry remains on disk (a refused symlink also answers `404`).

```typescript
try { await client.files.stat('/home/user/files-examples-cleanup'); }
catch (e: any) { if (e.status === 404) console.log('not found through this API'); else throw e; }
```

**Step 3 — confirm via journal.** Where the journal covers the path, a successful directory delete normally records one `op: "dir_deleted"` entry for the directory itself (no per-path `seq`), not an entry per child; deleting a single file records `op: "delete"`. Recording is best-effort: a delete still succeeds when its entry cannot be written, so an absent entry does not prove the delete failed. Flush first. The journal lists oldest first, so one `limit=10` call returns only the ten oldest matching records and can miss the new `dir_deleted` one: page on with `after_id` (continue from `next_after_id`) until the entry shows up or `has_more` is false.

```typescript
await client.files.journal.flush();
const r = await client.files.journal.list({ path: '/home/user/files-examples-cleanup', limit: 10 });
```

### 11. Share a folder as a zip — one link, no archive on disk

**Goal:** hand a person (or another program) a folder as one download, without writing a `.zip` into the computer first. The files kit streams a folder as a zip when the bare flag `?zip` follows the folder's path on the REST route: `GET /api/v1/files/<abs dir>?zip`. The link is the kit's capability URL, so whoever holds it can download the folder, subject to the computer's proxy permissions: share it only with people who should see that folder.

Limits: local folders only (a folder of a remote backend, named with `backend`, answers `501`), and only where the deployment enabled archive downloads (the standard `hoody_kit: true` computer image enables them). Where they are off, this route answers `403` with `Archive download not allowed`; any other `403` is an access refusal, not this switch. The WebDAV-style route `GET /<abs dir>?zip` (`files.zip`) streams the same zip but answers `404` where archive downloads are off, so check and share the REST route. A folder one archive cannot hold whole (more than 1000000 files, more than 10000000 files and folders in all, or folders nested deeper than 50 levels) is refused with `422 ARCHIVE_TOO_LARGE` before anything is sent. A file that cannot be read, or that changes while it is added, is named in a `__hoody-files_zip_errors__.txt` entry at the end of the archive. The archive holds only what the requesting account may read: with per-account path rules, paths outside its rules, and symlinks that lead there, are left out.

**Step 1 — build the link.** Read `project_id`, `id` and `server_name` from the computer, then append the folder's absolute path and `?zip` (no value) to the files kit URL's `/api/v1/files` route.

```typescript
const { data: c } = await client.api.computers.get(C);
const link = `https://${c!.project_id}-${C}-files-1.${c!.server_name}.computers.hoody.com/api/v1/files/home/user/project?zip`;
```

**Step 2 — check it, or download it yourself, on the same route.** A `200` with `Content-Type: application/zip` means the link works. A `403` saying `Archive download not allowed` means archive downloads are off for this kit; a `422` means the folder is too large for one archive (zip a subfolder instead).

```typescript
// files.zip downloads the same zip; where archive downloads are off it answers 404, not 403
const zip = await client.files.zip('/home/user/project');
```

## Reference

**Accessor:** `client.files`  |  **Import:** `import * as files from 'hoody-sdk/files'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, computerId?, serviceIndex?, serverName? }` (`server` is the older spelling of `serverName`, which wins when both are set), which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are set by the client and are refused with a `TypeError` before the call is sent: configure the token on the client, a kit credential as `kitAuth` on `withComputer()` or the client config (`middlewareContext.kitAuth` replaces the client's `kitAuth` for one call), and use another client for another identity), `cache` (ignored here: only an `api` GET is cached, never a GET to a kit host), `responseIsFinal` (`true`: never sent again once it may have reached the server), `keyedInProgressWait` (`false`: a 409 IDEMPOTENCY_REQUEST_IN_PROGRESS is the answer, not asked again), `redactBodyKeys` (body keys whose values an ApiError shows as [REDACTED]) and `maxResponseBytes` (a response body over this many bytes is refused with code RESPONSE_TOO_LARGE, and reading stops) (no `_realm`: that one is control-plane only). When the signature shows an options object (`options?: object` is one that takes the transport options only), the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself keeps the argument order it displays. A `wsOptions` argument (WebSocket methods only) accepts just `reconnect`, `connectTimeoutMs` and `transport`; the other transport options (`timeoutMs`, `signal`, …) stay in the request options the signature shows, never in `wsOptions`.

**Reading a method.** A method that shows no **Returns:** returns the response type named after it, the words after `client.` joined in PascalCase plus `Response`: `client.files.archives.extractMember()` returns `Promise<FilesArchivesExtractMemberResponse>`. `data` is the request body; it has a row only where the row says more than the signature.

**Services** (the ones the notes and examples above call most come first):

- `client.files`: append, chmod, chown, copy, delete, exists, get, glob, grep, logout, mkdir, move, realpath, search, stat, touch, update, upload, whoami, writeChunk, zip, classify, getUrl, getZipUrl, list, readText, readJson, readBytes
- `client.files.journal`: flush, getStats, list
- `client.files.archives`: extract, extractMember, preview, readMember
- `client.files.downloads`: cancel, create, get, list, listByDirectory, listHistory
- `client.files.backends`: createAzureblob, createAzurefiles, createB2, createBox, createCloudinary, createDrive, createDropbox, createFichier, createFilefabric, createFilescom, createFtp, createGofile, createGoogleCloudStorage, createGooglePhotos, createHdfs, createHidrive, createHttp, createIclouddrive, createImagekit, createInternetarchive, createJottacloud, createKoofr, createLinkbox, createMailru, createMega, createNetstorage, createOnedrive, createOpendrive, createOracleobjectstorage, createPcloud, createPikpak, createPixeldrain, createPremiumizeme, createProtondrive, createPutio, createQingstor, createQuatrix, createS3, createSeafile, createSftp, createSharefile, createSia, createSmb, createSugarsync, createSwift, createUlozto, createWebdav, createYandex, createZoho, delete, get, list, test, update
- `client.files.mounts`: create, delete, get, list, update
- `client.files.extractions`: cancel, list, listByDirectory, listHistory
- `client.files.ftp`: get
- `client.files.images`: convert, getThumbnailUrl
- `client.files.kit`: getHealth, getVersion
- `client.files.s3`: get
- `client.files.ssh`: get, upload
- `client.files.ui`: getPage
- `client.files.uploads`: delete, deleteUnreadable, deliver, download, list, listFiles, listUnreadable, stop
- `client.files.webdav`: copy, get, getOptions, getProperties, lock, move, unlock, updateProperties

**Shared parameters.** A parameter row that repeats is printed once. When a signature shows a parameter that the method's own table does not list, its row is in the "Shared parameters" table of the method's service section when the name is there, else in the table below: same type, wire location, required mark and description. A row in a method's own table always describes that method. An SDK helper (marked as one) has no table and takes nothing from these lists.

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes |  |

### `client.files` (21) — File operations - upload, download, delete, list files

#### `append` — Append data to file

```typescript
client.files.append(path: string, data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string, options?: { owner?: string; expectedLength?: string; ifMatch?: string; ifNoneMatch?: string; ifUnmodifiedSince?: string; contentType?: 'application/octet-stream' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File path |
| `owner` | `string` | query | No | Create-time owner (user[:group]/uid[:gid]) when this append creates a new file. Requires the deployment to have enabled chown and to permit the owner you name; refuses root. Absent → server default. |
| `expectedLength` | `string` | header `X-Expected-Length` | No | The length of the whole body in bytes, for a body streamed without Content-Length. A body that ends before this many bytes, or runs past them, is refused with 400 and nothing is written or appended: the file stays as it was. Send it whenever the length is known: some HTTP/2 clients end a request's body normally when they are aborted, so without it a cut-off body can look complete. Over the upload size limit it is refused with 413 before the body is read. |
| `ifMatch` | `string` | header `If-Match` | No | Write only if the file has this ETag (the one a download of it answers with; a weak ETag never matches), or with '*' only if a file exists at the path. Otherwise 412 and nothing is written or created. |
| `ifNoneMatch` | `string` | header `If-None-Match` | No | '*' writes only if nothing exists at the path (create only); a tag writes only if the file does not have that ETag. Otherwise 412 and nothing is written. |
| `ifUnmodifiedSince` | `string` | header `If-Unmodified-Since` | No | Without If-Match, write only if the file has not changed since this HTTP date. Otherwise 412 and nothing is written. |

**HTTP:** `PUT /api/v1/files/append/{path}`
**CLI:** `hoody files append <path>`

---

#### `chmod` — Change file permissions

```typescript
client.files.chmod(path: string, options: { chmod: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File or directory path |
| `chmod` | `string` | query | Yes | Octal permission mode (e.g., 755, 644, 0755) |

**HTTP:** `PATCH /api/v1/files/chmod/{path}`
**CLI:** `hoody files chmod <path> --chmod <chmod>`

---

#### `chown` — Change file ownership

```typescript
client.files.chown(path: string, options: { chown: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File or directory path |
| `chown` | `string` | query | Yes | Owner and optional group (e.g., user:group, user, :group, or UID:GID) |

**HTTP:** `PATCH /api/v1/files/chown/{path}`
**CLI:** `hoody files chown <path> --chown <chown>`

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

**HTTP:** `POST /api/v1/files/copy/{path}`
**CLI:** `hoody files copy <path> --copy-to <copy-to>`

---

#### `delete` — Delete file or directory

```typescript
client.files.delete(path: string, options?: { backend?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `backend` | `string` | query | No | Backend ID for remote file deletion |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/files/{path}`
**CLI:** `hoody files delete <path>`

---

#### `exists` — Whether a file or directory exists at `path`: true, or false when the kit answers 404.

```typescript
client.files.exists(path: string, options?: FilesExistsOptions, templateVars?: FilesReadTarget)
```

**Returns:** `Promise<boolean>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `get` — List a directory, or read a file: a line range, its hash, base64 or a journal version.

```typescript
client.files.get(path: string, options?: { backend?: string; hash?: ""; base64?: ""; lines?: string; history?: ""; at?: string; revision?: number; diff?: ""; from_seq?: number; from_ts?: string; to_seq?: number; to_ts?: string; after_id?: number; limit?: number; range?: string; ifRange?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File or directory path |
| `backend` | `string` | query | No | Backend ID for remote file access. Remote reads support listings, downloads, stat, hash, and base64. grep, glob, lines, and journal queries return 400. Remote folder ZIP and file thumbnails return 501. Archive-preview flags do not produce a preview: a remote file is downloaded and a remote directory is listed. |
| `hash` | `""` | query | No | Get SHA256 hash of file |
| `base64` | `""` | query | No | Get file content as base64 |
| `lines` | `string` | query | No | Extract specific lines from a file. Formats: '10-50' (range, 1-indexed inclusive), '100' (single line), '-20' (last 20 lines / tail), '50-' (line 50 to end). Returns text/plain with X-Line-Range header. X-Total-Lines header included when naturally known (scan reached EOF). Max 100,000 lines or 64MB per request. |
| `history` | `""` | query | No | List all revisions of a file recorded in the journal. Returns JSON with revisions array, pagination via after_id, and head_matches_disk: true when the file on disk holds what the journal's newest record of it says, false when it does not (an outside write, an unrecorded change, pruned history or missing content history can each cause this; the flag alone does not identify the cause); absent for a folder or any other path that is neither a file nor missing, and when the file could not be read. Mutually exclusive with at/revision/diff. The journal records only changes made through Hoody Files; a change made by the agent's tools, a terminal, a script or a program is not recorded. |
| `at` | `string` | query | No | Read file content at a point in time, as the journal recorded it. Accepts RFC3339 timestamp or Unix milliseconds. Mutually exclusive with history/revision/diff. Composable with ?lines, ?hash, ?base64. The X-Journal-Head-Matches-Disk response header is true when the file on disk holds what the journal's newest record of it says, false when it does not (an outside write, an unrecorded change, pruned history or missing content history can each cause this; the flag alone does not identify the cause); absent for a folder or any other path that is neither a file nor missing, and when the file could not be read. The journal records only changes made through Hoody Files; a change made by the agent's tools, a terminal, a script or a program is not recorded. |
| `revision` | `number` | query | No | Read file content by stable per-path sequence number. Mutually exclusive with history/at/diff. Composable with ?lines, ?hash, ?base64. The X-Journal-Head-Matches-Disk response header is true when the file on disk holds what the journal's newest record of it says, false when it does not (an outside write, an unrecorded change, pruned history or missing content history can each cause this; the flag alone does not identify the cause); absent for a folder or any other path that is neither a file nor missing, and when the file could not be read. The journal records only changes made through Hoody Files; a change made by the agent's tools, a terminal, a script or a program is not recorded. |
| `diff` | `""` | query | No | Compute unified diff between two versions. Requires from_seq or from_ts. With to_seq or to_ts it compares two recorded versions; with neither it compares with the file as it is on disk now (410 when the file no longer exists, 422 when it is over the journal's size limit). Mutually exclusive with history/at/revision. The X-Journal-Head-Matches-Disk response header is true when the file on disk holds what the journal's newest record of it says, false when it does not (an outside write, an unrecorded change, pruned history or missing content history can each cause this; the flag alone does not identify the cause); absent for a folder or any other path that is neither a file nor missing, and when the file could not be read. The journal records only changes made through Hoody Files; a change made by the agent's tools, a terminal, a script or a program is not recorded. |
| `from_seq` | `number` | query | No | Source revision seq number for ?diff. Mutually exclusive with from_ts. |
| `from_ts` | `string` | query | No | Source timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with from_seq. |
| `to_seq` | `number` | query | No | Target revision seq number for ?diff. Mutually exclusive with to_ts. Default: current file on disk. |
| `to_ts` | `string` | query | No | Target timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with to_seq. |
| `after_id` | `number` | query | No | Cursor for ?history pagination. Returns entries with id > after_id. |
| `limit` | `number` | query | No | Max entries to return for ?history. |
| `range` | `string` | header `Range` | No | File download only: ask for part of the file, as 'bytes=first-last', 'bytes=first-' or 'bytes=-suffix_length'. A last position past the end is clamped to the last byte, and a suffix longer than the file selects all of it. One satisfiable range answers 206 with Content-Range; several answer 206 as multipart/byteranges for a local file, while a remote file (with backend) answers 200 with the whole file. Ranges that cannot be satisfied are dropped from a list, and 416 comes only when none is left. A malformed header, another unit or more than 100 ranges is ignored (200, whole file). HEAD ignores Range. |
| `ifRange` | `string` | header `If-Range` | No | File download only: honour Range only if the file still has this ETag, exactly; otherwise answer 200 with the whole file. A date never matches, since two versions saved within the same second share it. A remote file's (with backend) ETag is weak, so with If-Range a remote file is always sent whole. |

**Returns:** `Promise<ApiResponse<ArrayBuffer> | FilesGetResponse>` — the response Content-Type picks the branch, always under `.data`: JSON gives the parsed value, a binary type (or a non-text body sent as an attachment) an `ArrayBuffer`, and any other type, such as an HTML or plain-text body, a string, which the declared type does not list (narrow it before use)  |  **HTTP:** `GET /api/v1/files/{path}`
**CLI:** `hoody files get <path>`

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

**HTTP:** `GET /api/v1/files/glob/{path}`
**CLI:** `hoody files glob <path> --pattern <pattern>`

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

**HTTP:** `GET /api/v1/files/grep/{path}`
**CLI:** `hoody files grep <path> --pattern <pattern>`

---

#### `logout` — Clear authentication

```typescript
client.files.logout(path: string)
```

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `LOGOUT /{path}`

---

#### `mkdir` — File operations (mkdir, extract, download, move, copy)

```typescript
client.files.mkdir(path: string, options?: { backend?: string; owner?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `backend` | `string` | query | No | Backend ID, for mkdir only: create the directory on that remote backend. Any other operation with backend is refused with 400 INVALID_PARAMETER. |
| `owner` | `string` | query | No | Create-time owner for newly-created inodes as user[:group] or uid[:gid]. Requires the deployment to have enabled chown, and must resolve to one of the owners it permits; refuses root (uid/gid 0). Absent → the server default create owner. Applies to mkdir/extract/download_from/copy_to. |

**HTTP:** `POST /api/v1/files/{path}?mkdir`
**CLI:** `hoody files mkdir <path>`

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

**HTTP:** `POST /api/v1/files/move/{path}`
**CLI:** `hoody files move <path> --move-to <move-to>`

---

#### `realpath` — Resolve canonical path (realpath)

```typescript
client.files.realpath(path: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File or directory path to resolve |

**HTTP:** `GET /api/v1/files/realpath/{path}`
**CLI:** `hoody files realpath <path>`

---

#### `search` — Search directory

```typescript
client.files.search(directory: string, options: { q: string; json?: ""; theme?: "oc-1" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper"; colorScheme?: "light" | "dark"; font?: "ibm-plex-mono" | "cascadia-code" | "fira-code" | "hack" | "inconsolata" | "intel-one-mono" | "iosevka" | "jetbrains-mono" | "meslo-lgs" | "roboto-mono" | "source-code-pro" | "ubuntu-mono"; fontSize?: number; embedderOrigin?: string; chromeless?: boolean; borderless?: boolean; hideHeader?: boolean; hideSidebar?: boolean; hidePreview?: boolean; hideFooter?: boolean; embedBg?: "transparent" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `directory` | `string` | path | Yes |  |
| `q` | `string` | query | Yes | Search query (case-insensitive filename match). Maximum 512 BYTES of UTF-8 after form/percent decoding, measured both before and after Unicode lowercasing, because lowercasing can change a string's byte length in either direction. Longer queries are rejected with 400; they are not truncated. Note this is a byte limit, not a character limit, so it is deliberately not expressed as `maxLength`. |
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

**HTTP:** `GET /{directory}?q`
**CLI:** `hoody files search <directory> --query <query>`

---

#### `stat` — Get file metadata (stat)

```typescript
client.files.stat(path: string, options?: { backend?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File or directory path |
| `backend` | `string` | query | No | Backend ID: the metadata of the path on that remote backend instead of a local path |

**HTTP:** `GET /api/v1/files/stat/{path}`
**CLI:** `hoody files stat <path>`

---

#### `touch` — Touch file (create or update mtime)

```typescript
client.files.touch(path: string, options?: { type?: string; touch?: "" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | File path to touch |
| `touch` | `""` | query | No | Flag to indicate touch operation |
| `type` | `string` | query | No | Names a remote backend type (an Hoody backend name such as sftp, webdav, ftp or s3). The request is then not a local touch: it is a remote request, which takes the connection parameters of an SSH upload, PUT /{path}?type=ssh (server, user, pass and the others) and needs remote access and uploads enabled. It writes the request body to the remote path, replacing a file already there, so an empty body leaves an empty file. |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `PUT /{path}?touch`
**CLI:** `hoody files touch <path>`

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

**Body:** `MoveRequest | RenameRequest`

**HTTP:** `PATCH /api/v1/files/{path}`
**CLI:** `hoody files update <path>`

---

#### `upload` — Upload or append file

```typescript
client.files.upload(path: string, data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string, options?: { backend?: string; append?: ""; chmod?: string; owner?: string; expectedLength?: string; ifMatch?: string; ifNoneMatch?: string; ifUnmodifiedSince?: string; contentType?: 'application/octet-stream' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `backend` | `string` | query | No | Backend ID for remote upload |
| `append` | `""` | query | No | Append body to end of existing file (create if missing) instead of overwriting |
| `chmod` | `string` | query | No | Permission bits the local file ends with, in octal (`644`, `0600`, `0o755`, `000`), whatever the server's umask; the response gives them in `mode`, read back from the file. Where the filesystem keeps no permission bits of its own (a mount of a remote storage without them), the upload is answered 409 PERMISSIONS_NOT_APPLIED instead: nothing is changed when the bits asked for are narrower than the file's, and otherwise the body is written whole under the file's bits. Requires both upload and chmod to be enabled (403 otherwise). setuid, setgid and sticky bits are refused, as are values above 777. Refused with 400 together with `backend` or `append`, and when the path names something other than a regular file (a directory, a pipe, a device, a socket). Each of these refusals comes before the body is read: nothing is created or changed. |
| `owner` | `string` | query | No | Create-time owner (user[:group]/uid[:gid]) for a newly-created file. Requires the deployment to have enabled chown and to permit the owner you name; refuses root. Overwrites/appends to an existing file preserve its owner. Absent → server default. |
| `expectedLength` | `string` | header `X-Expected-Length` | No | The length of the whole body in bytes, for a body streamed without Content-Length. A body that ends before this many bytes, or runs past them, is refused with 400 and nothing is written or appended: the file stays as it was. Send it whenever the length is known: some HTTP/2 clients end a request's body normally when they are aborted, so without it a cut-off body can look complete. Over the upload size limit it is refused with 413 before the body is read. |
| `ifMatch` | `string` | header `If-Match` | No | Local files only; with backend it is refused with 400. Write only if the file has this ETag (the one a download of it answers with; a weak ETag never matches), or with '*' only if a file exists at the path. Otherwise 412 and nothing is written or created. |
| `ifNoneMatch` | `string` | header `If-None-Match` | No | Local files only; with backend it is refused with 400. '*' writes only if nothing exists at the path (create only); a tag writes only if the file does not have that ETag. Otherwise 412 and nothing is written. |
| `ifUnmodifiedSince` | `string` | header `If-Unmodified-Since` | No | Local files only; with backend it is refused with 400. Without If-Match, write only if the file has not changed since this HTTP date. Otherwise 412 and nothing is written. |

**HTTP:** `PUT /api/v1/files/{path}`
**CLI:** `hoody files upload <path>`

---

#### `whoami` — Check authentication status

```typescript
client.files.whoami(path: string)
```

**Returns:** `Promise<ApiResponse<string>>`  |  **HTTP:** `CHECKAUTH /{path}`
**CLI:** `hoody files whoami <path>`

---

#### `writeChunk` — File operations

```typescript
client.files.writeChunk(path: string, data?: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>, options?: { ifMatch?: string; ifNoneMatch?: string; ifUnmodifiedSince?: string; contentType?: 'application/octet-stream' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `ifMatch` | `string` | header `If-Match` | No | Writes of content (X-Update-Range) only. Write only if the file has this ETag (the one a download of it answers with; a weak ETag never matches), or with '*' only if a file exists at the path. Otherwise 412 and nothing is written or created. |
| `ifNoneMatch` | `string` | header `If-None-Match` | No | Writes of content (X-Update-Range) only. '*' writes only if nothing exists at the path (create only); a tag writes only if the file does not have that ETag. Otherwise 412 and nothing is written. |
| `ifUnmodifiedSince` | `string` | header `If-Unmodified-Since` | No | Writes of content (X-Update-Range) only. Without If-Match, write only if the file has not changed since this HTTP date. Otherwise 412 and nothing is written. |

**Body:** Raw bytes (`Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>`), nothing else. The method sends `X-Update-Range: append` itself.

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `PATCH /{path}`
**CLI:** `hoody files chunks write <path>`

---

#### `zip` — Download directory as ZIP

```typescript
client.files.zip(directory: string, options?: { zip?: "" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `directory` | `string` | path | Yes |  |
| `zip` | `""` | query | No | Selects this operation: send zip with no value. It is part of the route, not an option. |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /{directory}?zip`
**CLI:** `hoody files zip <directory>`

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
client.files.list(path: string, options?: { simple?: ""; sort?: "name" | "mtime" | "size"; order?: "asc" | "desc"; hash?: ""; sha256?: ""; base64?: ""; edit?: ""; view?: ""; download?: "" | "1" | "true"; contentType?: string; history?: ""; at?: string; revision?: number; diff?: ""; from_seq?: number; from_ts?: string; to_seq?: number; to_ts?: string; after_id?: number; limit?: number; theme?: "oc-1" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper"; colorScheme?: "light" | "dark"; font?: "ibm-plex-mono" | "cascadia-code" | "fira-code" | "hack" | "inconsolata" | "intel-one-mono" | "iosevka" | "jetbrains-mono" | "meslo-lgs" | "roboto-mono" | "source-code-pro" | "ubuntu-mono"; fontSize?: number; embedderOrigin?: string; chromeless?: boolean; borderless?: boolean; hideHeader?: boolean; hideSidebar?: boolean; hidePreview?: boolean; hideFooter?: boolean; embedBg?: "transparent" }, templateVars?: { projectId?: string; computerId?: string; serviceIndex?: string | number; serverName?: string; server?: string })
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

### `client.files.journal` (3) — Change journal - which files were changed through Hoody Files and when, its statistics, and flushing it to disk

#### `flush` — Flush journal to disk

```typescript
client.files.journal.flush()
```

**HTTP:** `POST /api/v1/journal/flush`
**CLI:** `hoody files journal flush`

---

#### `getStats` — Get journal statistics

```typescript
client.files.journal.getStats()
```

**HTTP:** `GET /api/v1/journal/stats`
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
| `limit` | `number` | query | No | Maximum entries to return, from `1` to `1000`. Default `100`. A whole number from `1001` up to `18446744073709551615` is lowered to `1000` and `0` is raised to `1`; any other value (a negative number, a fraction, a larger number, or not a number) uses the default. |
| `after_id` | `number` | query | No | Cursor: return entries with id > after_id |

**HTTP:** `GET /api/v1/journal`
**CLI:** `hoody files journal list`

---

### `client.files.archives` (4) — Archive operations - extract, preview, download directories as ZIP

#### `extract` — Extract archive

```typescript
client.files.archives.extract(path: string, options: { extract?: string; dest?: string; owner: string })  // → Promise<FilesArchivesExtractResponse>
client.files.archives.extract(archive: string, options?: { dest?: string; extract?: string })  // → Promise<{ statusCode: number; message: string; data: { destination?: string; error?: string | null; extracted_bytes?: number; extracted_files?: number; extraction_id?: string; message?: string; replaced?: string[]; replaced_count?: number; selective?: boolean; selective_path?: string | null; skipped?: { path: string; reason: string }[]; skipped_count?: number; success?: boolean } }>
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `extract` | `string` | query | No | Empty for full extraction; path for selective (e.g. "src/" or "lib/") |
| `dest` | `string` | query | No | Destination folder, relative to the folder holding the archive. By default, the archive's name is used with its last extension removed, and then a `.tar` left at its end removed too: `release` for `release.zip`, `release.tar.gz` or `release.tar.zip`. Absolute paths and `..` components are refused with 400. |
| `owner` | `string` | query | form 1: Yes; form 2: — | Create-time owner for newly-created inodes as user[:group] or uid[:gid]. Requires the deployment to have enabled chown, and must resolve to one of the owners it permits; refuses root (uid/gid 0). Absent → the server default create owner. Applies to mkdir/extract/download_from/copy_to. |

**Returns:** see each form above  |  **HTTP:** `GET /{archive}?extract` (with `owner`: `POST /api/v1/files/{path}?extract&owner=<owner>`)
**CLI:** `hoody files archives extract <archive> --member <member>`

---

#### `extractMember` — Extract file from archive

```typescript
client.files.archives.extractMember(archive: string, options: { extract: string; dest?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `archive` | `string` | path | Yes | Path to archive file |
| `extract` | `string` | query | Yes | Path of the file or directory inside the archive to extract (e.g. "src/" or "lib/") |
| `dest` | `string` | query | No | Destination folder, relative to the folder holding the archive. By default, the archive's name is used with its last extension removed, and then a `.tar` left at its end removed too: `release` for `release.zip`, `release.tar.gz` or `release.tar.zip`. Absolute paths and `..` components are refused with 400. |

**HTTP:** `GET /{archive}?extract_file`
**CLI:** `hoody files archives members extract <archive> <member>`

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

**HTTP:** `GET /{archive}?preview`
**CLI:** `hoody files archives preview <archive>`

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
**CLI:** `hoody files archives members read <archive> <member>`

---

### `client.files.downloads` (6) — Download from a URL

#### `cancel` — Cancel a running download

```typescript
client.files.downloads.cancel(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The id listed by GET /api/v1/downloads |

**HTTP:** `DELETE /api/v1/downloads/{id}`
**CLI:** `hoody files downloads cancel <id>`

---

#### `create` — Download file from remote URL

```typescript
client.files.downloads.create(path: string, options: { id?: string; filename?: string; timeout?: number; owner: string; download?: string })  // → Promise<FilesDownloadsCreateResponse>
client.files.downloads.create(path: string, options: { id: string; filename?: string; timeout?: number; owner?: string; download?: string })  // → Promise<FilesDownloadsCreateResponse>
client.files.downloads.create(directory: string, options: { download: string; filename?: string; timeout?: number })  // → Promise<{ statusCode: number; message: string; data: { download_id: string; filename: string; message: string; path: string; sha256?: string | null; size?: number; success: true } }>
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Destination directory |
| `download` | `string` | query | form 1: No; form 2: No; form 3: Yes | URL to download from |
| `filename` | `string` | query | No | Custom filename for downloaded file |
| `timeout` | `number` | query | No | Download timeout in seconds. Default and maximum: 43200 (12 hours) |
| `id` | `string` | query | form 1: No; form 2: Yes; form 3: — | With download_from: the download's id, chosen by the client, so that a request sent again after a lost answer never starts it twice. A random (version 4) UUID, hyphenated; anything else is refused with 400 INVALID_PARAMETER. The request answers 202 once the download is accepted. An id a download already had, running or ended within the last 7 days, is refused with 409 DOWNLOAD_ID_EXISTS and nothing changes; GET /api/v1/downloads/{id} finds that download. When a record of the id exists but cannot be read, the request is refused with 500 and nothing starts: an id is free only when no record of it is certain. The 202 is sent once the download's record is on stable storage, so a download accepted keeps its id across a crash. The id is checked after the limit of running jobs (a 429 records nothing) and before the path is reserved (a busy path records nothing). Servers that take id list `download_client_id` in the `features` of GET /api/v1/version. |
| `owner` | `string` | query | form 1: Yes; form 2: No; form 3: — | Create-time owner for newly-created inodes as user[:group] or uid[:gid]. Requires the deployment to have enabled chown, and must resolve to one of the owners it permits; refuses root (uid/gid 0). Absent → the server default create owner. Applies to mkdir/extract/download_from/copy_to. |

**Returns:** see each form above  |  **HTTP:** `GET /{directory}?download` (with `owner`: `POST /api/v1/files/{path}?download_from=<download>&owner=<owner>`; with `id`: `POST /api/v1/files/{path}?download_from=<download>&id=<id>`)
**CLI:** `hoody files downloads create <directory> --download <download>`

---

#### `get` — Get one download by id

```typescript
client.files.downloads.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The download's id |

**HTTP:** `GET /api/v1/downloads/{id}`

---

#### `list` — List active downloads

```typescript
client.files.downloads.list()
```

**HTTP:** `GET /api/v1/downloads`
**CLI:** `hoody files downloads list`

---

#### `listByDirectory` — List active downloads

```typescript
client.files.downloads.listByDirectory(directory: string, options: { downloads: "" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `directory` | `string` | path | Yes |  |
| `downloads` | `""` | query | Yes | Selects this operation: send downloads with no value. It is part of the route, not an option. |

**HTTP:** `GET /{directory}?downloads`
**CLI:** `hoody files downloads list <directory>`

---

#### `listHistory` — Download history

```typescript
client.files.downloads.listHistory(options?: { download_history?: "" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `download_history` | `""` | query | No | Selects this operation: send download_history with no value. It is part of the route, not an option. |

**HTTP:** `GET /?download_history`
**CLI:** `hoody files downloads history list`

---

### `client.files.backends` (54) — Backend management - connect, list, test, and disconnect remote cloud storage backends

**Shared parameters of `client.files.backends`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

#### `createAzureblob` — Connect to azureblob backend

```typescript
client.files.backends.createAzureblob(data: FilesBackendsCreateAzureblobRequest)
```

**Body:** `{ access_tier: string="", account: string="", archive_tier_delete: bool=false, chunk_size: string="4194304", client_certificate_password: string="", client_id: string="", client_secret: string="", client_send_certificate_chain: bool=false, copy_concurrency: int=512, copy_cutoff: string="8388608", copy_total_concurrency: int=0, decompress: bool=false, delete_snapshots: "" | "include" | "only"="", description: string="", directory_markers: bool=false, disable_checksum: bool=false, disable_instance_discovery: bool=false, encoding: string="21078018", endpoint: string="", env_auth: false=false, key: string="", list_chunk: int=5000, list_parallelism: int=0, memory_pool_flush_time: int=60, memory_pool_use_mmap: bool=false, msi_client_id: string="", msi_mi_res_id: string="", msi_object_id: string="", no_check_container: bool=false, no_head_object: bool=false, password: string="", public_access: string="", sas_url: string="", tenant: string="", upload_concurrency: int=16, upload_cutoff: string="", use_arrow_list: bool=false, use_az: false=false, use_copy_blob: bool=true, use_emulator: false=false, use_msi: false=false, username: string="" }`

- azureblob backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/azureblob`
**CLI:** `hoody files backends azureblob create`

---

#### `createAzurefiles` — Connect to azurefiles backend

```typescript
client.files.backends.createAzurefiles(data: FilesBackendsCreateAzurefilesRequest)
```

**Body:** `{ account: string="", chunk_size: string="4194304", client_certificate_password: string="", client_id: string="", client_secret: string="", client_send_certificate_chain: bool=false, description: string="", disable_instance_discovery: bool=false, encoding: string="54634382", endpoint: string="", env_auth: false=false, key: string="", max_stream_size: string="10737418240", msi_client_id: string="", msi_mi_res_id: string="", msi_object_id: string="", password: string="", sas_url: string="", share_name: string="", tenant: string="", upload_concurrency: int=16, use_az: false=false, use_emulator: false=false, use_msi: false=false, username: string="" }`

- azurefiles backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
- `env_auth` — Runtime credentials are not available: leave env_auth false (true is refused with 400) and send the credentials in the request.
- `share_name` — Azure Files Share Name. This is required and is the name of the share to access.
- `use_az` — Azure CLI authentication is not available: leave use_az false (true is refused with 400).
- `use_emulator` — The storage emulator is not available: leave use_emulator false (true is refused with 400).
- `use_msi` — Managed identity authentication is not available: leave use_msi false (true is refused with 400).

**HTTP:** `POST /api/v1/backends/azurefiles`
**CLI:** `hoody files backends azurefiles create`

---

#### `createB2` — Connect to b2 backend

```typescript
client.files.backends.createB2(data: FilesBackendsCreateB2Request)
```

**Body:** `{ account*: string="", chunk_size: string="100663296", copy_cutoff: string="4294967296", description: string="", disable_checksum: bool=false, download_auth_duration: int=604800, download_url: string="", encoding: string="50438146", endpoint: string="", hard_delete: bool=false, key*: string="", lifecycle: int=0, memory_pool_flush_time: int=60, memory_pool_use_mmap: bool=false, sse_customer_algorithm: string="", sse_customer_key: string="", sse_customer_key_base64: string="", sse_customer_key_md5: string="", test_mode: string="", upload_concurrency: int=4, upload_cutoff: string="209715200", version_at: string="0001-01-01T00:00:00Z", versions: bool=false }`

- b2 backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/b2`
**CLI:** `hoody files backends b2 create --account <account> --key <key>`

---

#### `createBox` — Connect to box backend

```typescript
client.files.backends.createBox(data: FilesBackendsCreateBoxRequest)
```

**Body:** `{ access_token: string="", auth_url: string="", box_sub_type: string="user", client_credentials: bool=false, client_id: string="", client_secret: string="", commit_retries: int=100, description: string="", encoding: string="52535298", impersonate: string="", list_chunk: int=1000, owned_by: string="", root_folder_id: string="0", token: string="", token_url: string="", upload_cutoff: string="52428800" }`

- box backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
- `token` — … Needed to connect: the connection lists the remote's root before it is kept, which needs a token. client_id and client_secret are needed only when the token was made with your own OAuth client.

**HTTP:** `POST /api/v1/backends/box`
**CLI:** `hoody files backends box create`

---

#### `createCloudinary` — Connect to cloudinary backend

```typescript
client.files.backends.createCloudinary(data: FilesBackendsCreateCloudinaryRequest)
```

**Body:** `{ adjust_media_files_extensions: bool=true, api_key*: string="", api_secret*: string="", cloud_name*: string="", description: string="", encoding: string="52543246", eventually_consistent_delay: int=0, media_extensions: string="3ds,3g2,3gp,ai,arw,avi,avif,bmp,bw,cr2,cr3,djvu,dng,eps3,fbx,flif,flv,gif,glb,gltf,hdp,heic,heif,ico,indd,jp2,jpe,jpeg,jpg,jxl,jxr,m2ts,mov,mp4,mpeg,mts,mxf,obj,ogv,pdf,ply,png,psd,svg,tga,tif,tiff,ts,u3ma,usdz,wdp,webm,webp,wmv", upload_prefix: string="", upload_preset: string="" }`

- cloudinary backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/cloudinary`
**CLI:** `hoody files backends cloudinary create --cloud-name <cloud-name> --api-key <api-key> --api-secret <api-secret>`

---

#### `createDrive` — Connect to drive backend

```typescript
client.files.backends.createDrive(data: FilesBackendsCreateDriveRequest)
```

**Body:** `{ acknowledge_abuse: bool=false, allow_import_name_change: bool=false, alternate_export: bool=false, auth_owner_only: bool=false, auth_url: string="", chunk_size: string="8388608", client_credentials: bool=false, client_id: string="", client_secret: string="", copy_shortcut_content: bool=false, description: string="", disable_http2: bool=true, encoding: string="16777216", env_auth: false=false, export_formats: string="docx,xlsx,pptx,svg", fast_list_bug_fix: bool=true, formats: string="", impersonate: string="", import_formats: string="", keep_revision_forever: bool=false, list_chunk: int=1000, metadata_enforce_expansive_access: bool=false, metadata_labels: string="0", metadata_owner: string="1", metadata_permissions: string="0", pacer_burst: int=100, pacer_min_sleep: int=0, resource_key: string="", root_folder_id: string="", scope: string="", server_side_across_configs: bool=false, service_account_credentials: string="", shared_with_me: bool=false, show_all_gdocs: bool=false, size_as_quota: bool=false, skip_checksum_gphotos: bool=false, skip_dangling_shortcuts: bool=false, skip_gdocs: bool=false, skip_shortcuts: bool=false, starred_only: bool=false, stop_on_download_limit: bool=false, stop_on_upload_limit: bool=false, team_drive: string="", token: string="", token_url: string="", trashed_only: bool=false, upload_cutoff: string="8388608", use_created_date: bool=false, use_shared_date: bool=false, use_trash: bool=true, v2_download_min_size: string="-1" }`

- drive backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/drive`
**CLI:** `hoody files backends drive create`

---

#### `createDropbox` — Connect to dropbox backend

```typescript
client.files.backends.createDropbox(data: FilesBackendsCreateDropboxRequest)
```

**Body:** `{ auth_url: string="", batch_commit_timeout: int=600, batch_mode: string="sync", batch_size: int=0, batch_timeout: int=0, chunk_size: string="50331648", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="52469762", export_formats: string="html,md", impersonate: string="", impersonate_admin: string="", pacer_min_sleep: int=0, root_namespace: string="", shared_files: bool=false, shared_folders: bool=false, show_all_exports: bool=false, skip_exports: bool=false, skip_shared_folders: bool=false, skip_unowned_folders: bool=false, token: string="", token_url: string="" }`

- dropbox backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/dropbox`
**CLI:** `hoody files backends dropbox create`

---

#### `createFichier` — Connect to fichier backend

```typescript
client.files.backends.createFichier(data: FilesBackendsCreateFichierRequest)
```

**Body:** `{ api_key: string="", cdn: bool=false, description: string="", encoding: string="52666494", file_password: string="", folder_password: string="", shared_folder: string="" }`

- fichier backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/fichier`
**CLI:** `hoody files backends fichier create`

---

#### `createFilefabric` — Connect to filefabric backend

```typescript
client.files.backends.createFilefabric(data: FilesBackendsCreateFilefabricRequest)
```

**Body:** `{ description: string="", encoding: string="50429954", permanent_token: string="", root_folder_id: string="", token: string="", token_expiry: string="", url*: string="", version: string="" }`

- filefabric backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/filefabric`
**CLI:** `hoody files backends filefabric create --url <url>`

---

#### `createFilescom` — Connect to filescom backend

```typescript
client.files.backends.createFilescom(data: FilesBackendsCreateFilescomRequest)
```

**Body:** `{ api_key: string="", description: string="", encoding: string="60923906", password: string="", site: string="", username: string="" }`

- filescom backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/filescom`
**CLI:** `hoody files backends filescom create`

---

#### `createFtp` — Connect to ftp backend

```typescript
client.files.backends.createFtp(data: FilesBackendsCreateFtpRequest)
```

**Body:** `{ allow_insecure_tls_ciphers: bool=false, ask_password: bool=false, close_timeout: int=60, concurrency: int=0, description: string="", disable_epsv: bool=false, disable_mlsd: bool=false, disable_tls13: bool=false, disable_utf8: bool=false, encoding: string="35749890", explicit_tls: bool=false, force_list_hidden: bool=false, host*: string="", http_proxy: string="", idle_timeout: int=60, no_check_upload: bool=false, pass: string="", port: int=21, shut_timeout: int=60, socks_proxy: string="", tls: bool=false, tls_cache_size: int=32, user: string, writing_mdtm: bool=false }`

- ftp backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
- `ask_password` — Password prompting is unavailable. Leave ask_password false and supply pass when the server requires a password.
- `explicit_tls` — Use Explicit FTPS (FTP over TLS). When using explicit FTP over TLS the client explicitly requests security from the server in order to upgrade a plain text connection to an encrypted one. Cannot be used in combination with implicit FTPS.
- `tls` — Use Implicit FTPS (FTP over TLS). When using implicit FTP over TLS the client connects using TLS right from the start which breaks compatibility with non-TLS-aware servers. This is usually served over port 990 rather than port 21. Cannot be used in combination with explicit FTPS.

**HTTP:** `POST /api/v1/backends/ftp`
**CLI:** `hoody files backends ftp create --host <host>`

---

#### `createGofile` — Connect to gofile backend

```typescript
client.files.backends.createGofile(data: FilesBackendsCreateGofileRequest)
```

**Body:** `{ access_token: string="", account_id: string="", description: string="", encoding: string="323331982", list_chunk: int=1000, root_folder_id: string="" }`

- gofile backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/gofile`
**CLI:** `hoody files backends gofile create`

---

#### `createGoogleCloudStorage` — Connect to google cloud storage backend

```typescript
client.files.backends.createGoogleCloudStorage(data: FilesBackendsCreateGoogleCloudStorageRequest)
```

**Body:** `{ access_token: string="", anonymous: bool=false, auth_url: string="", bucket_acl: string="", bucket_policy_only: bool=false, client_credentials: bool=false, client_id: string="", client_secret: string="", decompress: bool=false, description: string="", directory_markers: bool=false, encoding: string="50348034", endpoint: string="", env_auth: false=false, location: string="", no_check_bucket: bool=false, object_acl: string="", project_number: string="", service_account_credentials: string="", storage_class: string="", token: string="", token_url: string="", user_project: string="" }`

- google cloud storage backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
- `access_token` — Short-lived access token. Leave blank normally. Needed only if you want use short-lived access token instead of interactive login.
- `env_auth` — Runtime credentials are not available: leave env_auth false (true is refused with 400) and send the credentials in the request.
- `project_number` — Project number. Optional - needed only for list/create/delete buckets - see your developer console.
- `service_account_credentials` — Service Account Credentials JSON blob. Leave blank normally. Needed only if you want use SA instead of interactive login.
- `user_project` — User project. Optional - needed only for requester pays.

**HTTP:** `POST /api/v1/backends/google-cloud-storage`
**CLI:** `hoody files backends googlecloudstorage create`

---

#### `createGooglePhotos` — Connect to google photos backend

```typescript
client.files.backends.createGooglePhotos(data: FilesBackendsCreateGooglePhotosRequest)
```

**Body:** `{ auth_url: string="", batch_commit_timeout: int=600, batch_mode: string="sync", batch_size: int=0, batch_timeout: int=0, client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50348034", include_archived: bool=false, proxy: string="", read_only: bool=false, read_size: bool=false, start_year: int=2000, token: string="", token_url: string="" }`

- google photos backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
- `token` — … Needed to connect: the connection lists the remote's root before it is kept, which needs a token. client_id and client_secret are needed only when the token was made with your own OAuth client.

**HTTP:** `POST /api/v1/backends/google-photos`
**CLI:** `hoody files backends googlephotos create`

---

#### `createHdfs` — Connect to hdfs backend

```typescript
client.files.backends.createHdfs(data: FilesBackendsCreateHdfsRequest)
```

**Body:** `{ data_transfer_protection: string="", description: string="", encoding: string="50430082", namenode*: string="", username: string="" }`

- hdfs backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
- `data_transfer_protection` — Kerberos data transfer protection: authentication|integrity|privacy. Specifies whether or not authentication, data signature integrity checks, and wire encryption are required when communicating with the datanodes. … Used only with KERBEROS enabled.

**HTTP:** `POST /api/v1/backends/hdfs`
**CLI:** `hoody files backends hdfs create --namenode <namenode>`

---

#### `createHidrive` — Connect to hidrive backend

```typescript
client.files.backends.createHidrive(data: FilesBackendsCreateHidriveRequest)
```

**Body:** `{ auth_url: string="", chunk_size: string="50331648", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", disable_fetching_member_count: bool=false, encoding: string="33554434", endpoint: string="https://api.hidrive.strato.com/2.1", root_prefix: string="/", scope_access: string="rw", scope_role: string="user", token: string="", token_url: string="", upload_concurrency: int=4, upload_cutoff: string="100663296" }`

- hidrive backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
- `token` — … Needed to connect: the connection lists the remote's root before it is kept, which needs a token. client_id and client_secret are needed only when the token was made with your own OAuth client.

**HTTP:** `POST /api/v1/backends/hidrive`
**CLI:** `hoody files backends hidrive create`

---

#### `createHttp` — Connect to http backend

```typescript
client.files.backends.createHttp(data: FilesBackendsCreateHttpRequest)
```

**Body:** `{ description: string="", headers: string="", no_escape: bool=false, no_head: bool=false, no_slash: bool=false, url*: string="" }`

- http backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
- `headers` — Set HTTP headers for all transactions. … When headers are set, a redirect from https to http is refused as it would send them in cleartext.

**HTTP:** `POST /api/v1/backends/http`
**CLI:** `hoody files backends http create --url <url>`

---

#### `createIclouddrive` — Connect to iclouddrive backend

```typescript
client.files.backends.createIclouddrive(data: FilesBackendsCreateIclouddriveRequest)
```

**Body:** `{ apple_id*: string="", client_id: string="d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d", cookies: string="", description: string="", encoding: string="50438146", password*: string="", service: string="drive", trust_token: string="" }`

- iclouddrive backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/iclouddrive`
**CLI:** `hoody files backends iclouddrive create --apple-id <apple-id> --password <password>`

---

#### `createImagekit` — Connect to imagekit backend

```typescript
client.files.backends.createImagekit(data: FilesBackendsCreateImagekitRequest)
```

**Body:** `{ description: string="", encoding: string="117553486", endpoint*: string="", only_signed: bool=false, private_key*: string="", public_key*: string="", upload_tags: string="", versions: bool=false }`

- imagekit backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/imagekit`
**CLI:** `hoody files backends imagekit create --endpoint <endpoint> --public-key <public-key> --private-key <private-key>`

---

#### `createInternetarchive` — Connect to internetarchive backend

```typescript
client.files.backends.createInternetarchive(data: FilesBackendsCreateInternetarchiveRequest)
```

**Body:** `{ access_key_id: string="", description: string="", disable_checksum: bool=true, encoding: string="50446342", endpoint: string="https://s3.us.archive.org", front_endpoint: string="https://archive.org", item_derive: bool=true, item_metadata: string="", secret_access_key: string="", wait_archive: int=0 }`

- internetarchive backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/internetarchive`
**CLI:** `hoody files backends internetarchive create`

---

#### `createJottacloud` — Connect to jottacloud backend

```typescript
client.files.backends.createJottacloud(data: FilesBackendsCreateJottacloudRequest)
```

**Body:** `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50435982", hard_delete: bool=false, md5_memory_limit: string="10485760", no_versions: bool=false, token: string="", token_url: string="", trashed_only: bool=false, upload_resume_limit: string="10485760" }`

- jottacloud backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
- `md5_memory_limit` — Files bigger than this will be cached on disk to calculate the MD5 if required.
- `token` — … Needed to connect: the connection lists the remote's root before it is kept, which needs a token. client_id and client_secret are needed only when the token was made with your own OAuth client.

**HTTP:** `POST /api/v1/backends/jottacloud`
**CLI:** `hoody files backends jottacloud create`

---

#### `createKoofr` — Connect to koofr backend

```typescript
client.files.backends.createKoofr(data: FilesBackendsCreateKoofrRequest)
```

**Body:** `{ description: string="", encoding: string="50438146", endpoint*: string="", mountid: string="", password*: string="", provider: string="", setmtime: bool=true, user*: string="" }`

- koofr backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/koofr`
**CLI:** `hoody files backends koofr create --endpoint <endpoint> --user <user> --password <password>`

---

#### `createLinkbox` — Connect to linkbox backend

```typescript
client.files.backends.createLinkbox(data: FilesBackendsCreateLinkboxRequest)
```

**Body:** `{ description: string="", email*: string="", password*: string="", token*: string="", web_token: string="" }`

- linkbox backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/linkbox`
**CLI:** `hoody files backends linkbox create --backend-token <backend-token> --email <email> --password <password>`

---

#### `createMailru` — Connect to mailru backend

```typescript
client.files.backends.createMailru(data: FilesBackendsCreateMailruRequest)
```

**Body:** `{ auth_url: string="", check_hash: bool=true, client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50440078", pass*: string="", speedup_enable: bool=true, speedup_file_patterns: string="*.mkv,*.avi,*.mp4,*.mp3,*.zip,*.gz,*.rar,*.pdf", speedup_max_disk: string="3221225472", speedup_max_memory: string="33554432", token: string="", token_url: string="", user*: string="", user_agent: string="" }`

- mailru backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
- `pass` — Password. This must be an app password - Hoody will not work with your normal password. See the Configuration section in the docs for how to make an app password.
- `speedup_enable` — Skip full upload if there is another file with same data hash. … Please note that Hoody may need local memory and disk space to calculate content hash in advance and decide whether full upload is required. …
- `token` — … Needed to connect: the connection lists the remote's root before it is kept, which needs a token. client_id and client_secret are needed only when the token was made with your own OAuth client.

**HTTP:** `POST /api/v1/backends/mailru`
**CLI:** `hoody files backends mailru create --user <user> --pass <pass>`

---

#### `createMega` — Connect to mega backend

```typescript
client.files.backends.createMega(data: FilesBackendsCreateMegaRequest)
```

**Body:** `{ 2fa: string="", debug: bool=false, description: string="", encoding: string="50331650", hard_delete: bool=false, master_key: string="", pass: string="", password: string, session_id: string="", use_https: bool=false, user*: string="" } (at least one of: pass | password required)`

- mega backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
- `password` — Another name for pass. An empty value is ignored; a value that differs from a non-empty pass is refused with 400.

**HTTP:** `POST /api/v1/backends/mega`
**CLI:** `hoody files backends mega create --user <user>`

---

#### `createNetstorage` — Connect to netstorage backend

```typescript
client.files.backends.createNetstorage(data: FilesBackendsCreateNetstorageRequest)
```

**Body:** `{ account*: string="", description: string="", host*: string="", protocol: string="https", secret*: string="" }`

- netstorage backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/netstorage`
**CLI:** `hoody files backends netstorage create --host <host> --account <account> --secret <secret>`

---

#### `createOnedrive` — Connect to onedrive backend

```typescript
client.files.backends.createOnedrive(data: FilesBackendsCreateOnedriveRequest)
```

**Body:** `{ access_scopes: string="Files.Read Files.ReadWrite Files.Read.All Files.ReadWrite.All Sites.Read.All offline_access", auth_url: string="", av_override: bool=false, chunk_size: string="10485760", client_credentials: bool=false, client_id: string="", client_secret: string="", delta: bool=false, description: string="", disable_site_permission: bool=false, drive_id: string="", drive_type: string="", encoding: string="57386894", expose_onenote_files: bool=false, hard_delete: bool=false, hash_type: string="auto", link_password: string="", link_scope: string="anonymous", link_type: string="view", list_chunk: int=1000, metadata_permissions: string="0", no_versions: bool=false, region: string="global", root_folder_id: string="", server_side_across_configs: bool=false, tenant: string="", tenant_url: string="", token: string="", token_url: string="", upload_cutoff: string="-1" }`

- onedrive backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/onedrive`
**CLI:** `hoody files backends onedrive create`

---

#### `createOpendrive` — Connect to opendrive backend

```typescript
client.files.backends.createOpendrive(data: FilesBackendsCreateOpendriveRequest)
```

**Body:** `{ access: string="private", chunk_size: string="10485760", description: string="", encoding: string="62007182", password*: string="", username*: string="" }`

- opendrive backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/opendrive`
**CLI:** `hoody files backends opendrive create --username <username> --password <password>`

---

#### `createOracleobjectstorage` — Connect to oracleobjectstorage backend

```typescript
client.files.backends.createOracleobjectstorage(data: FilesBackendsCreateOracleobjectstorageRequest)
```

**Body:** `{ attempt_resume_upload: bool=false, chunk_size: string="5242880", compartment: string="", copy_cutoff: string="4999610368", copy_timeout: int=60, decompress: bool=false, description: string="", disable_checksum: bool=false, encoding: string="50331650", endpoint: string="", leave_parts_on_error: bool=false, max_upload_parts: int=10000, namespace*: string="", no_check_bucket: bool=false, provider*: "no_auth"="no_auth", region*: string="", sse_customer_algorithm: string="", sse_customer_key: string="", sse_customer_key_sha256: string="", sse_kms_key_id: string="", storage_tier: string="Standard", upload_concurrency: int=10, upload_cutoff: string="209715200" }`

- oracleobjectstorage backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/oracleobjectstorage`
**CLI:** `hoody files backends oracleobjectstorage create --provider <provider> --namespace <namespace> --region <region>`

---

#### `createPcloud` — Connect to pcloud backend

```typescript
client.files.backends.createPcloud(data: FilesBackendsCreatePcloudRequest)
```

**Body:** `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50438146", hostname: string="api.pcloud.com", password: string="", root_folder_id: string="d0", token: string="", token_url: string="", username: string="" }`

- pcloud backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
- `token` — … Needed to connect: the connection lists the remote's root before it is kept, which needs a token. client_id and client_secret are needed only when the token was made with your own OAuth client.
- `username` — Your pcloud username. This is only required when you want to use the cleanup command. Due to a bug in the pcloud API the required API does not support OAuth authentication so we have to rely on user password authentication for it.

**HTTP:** `POST /api/v1/backends/pcloud`
**CLI:** `hoody files backends pcloud create`

---

#### `createPikpak` — Connect to pikpak backend

```typescript
client.files.backends.createPikpak(data: FilesBackendsCreatePikpakRequest)
```

**Body:** `{ chunk_size: string="5242880", description: string="", device_id: string="", encoding: string="56829838", hash_memory_limit: string="10485760", no_media_link: bool=false, pass: string="", root_folder_id: string="", trashed_only: bool=false, upload_concurrency: int=4, upload_cutoff: string="209715200", use_trash: bool=true, user: string="", user_agent: string="Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0" }`

- pikpak backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
- `hash_memory_limit` — Files bigger than this will be cached on disk to calculate hash if required.

**HTTP:** `POST /api/v1/backends/pikpak`
**CLI:** `hoody files backends pikpak create`

---

#### `createPixeldrain` — Connect to pixeldrain backend

```typescript
client.files.backends.createPixeldrain(data: FilesBackendsCreatePixeldrainRequest)
```

**Body:** `{ api_key: string="", api_url: string="https://pixeldrain.com/api", description: string="", root_folder_id: string="me" }`

- pixeldrain backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/pixeldrain`
**CLI:** `hoody files backends pixeldrain create`

---

#### `createPremiumizeme` — Connect to premiumizeme backend

```typescript
client.files.backends.createPremiumizeme(data: FilesBackendsCreatePremiumizemeRequest)
```

**Body:** `{ api_key: string="", auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50438154", token: string="", token_url: string="" }`

- premiumizeme backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
- `token` — … Needed to connect: the connection lists the remote's root before it is kept, which needs a token. client_id and client_secret are needed only when the token was made with your own OAuth client.

**HTTP:** `POST /api/v1/backends/premiumizeme`
**CLI:** `hoody files backends premiumizeme create`

---

#### `createProtondrive` — Connect to protondrive backend

```typescript
client.files.backends.createProtondrive(data: FilesBackendsCreateProtondriveRequest)
```

**Body:** `{ 2fa: string="", app_version: string="", client_access_token: string="", client_refresh_token: string="", client_salted_key_pass: string="", client_uid: string="", description: string="", enable_caching: bool=true, encoding: string="52559874", mailbox_password: string="", original_file_size: bool=true, otp_secret_key: string="", password: string="", replace_existing_draft: bool=false, username: string="" }`

- protondrive backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/protondrive`
**CLI:** `hoody files backends protondrive create`

---

#### `createPutio` — Connect to putio backend

```typescript
client.files.backends.createPutio(data: FilesBackendsCreatePutioRequest)
```

**Body:** `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50438146", token: string="", token_url: string="" }`

- putio backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
- `token` — … Needed to connect: the connection lists the remote's root before it is kept, which needs a token. client_id and client_secret are needed only when the token was made with your own OAuth client.

**HTTP:** `POST /api/v1/backends/putio`
**CLI:** `hoody files backends putio create`

---

#### `createQingstor` — Connect to qingstor backend

```typescript
client.files.backends.createQingstor(data: FilesBackendsCreateQingstorRequest)
```

**Body:** `{ access_key_id: string="", chunk_size: string="4194304", connection_retries: int=3, description: string="", encoding: string="16842754", endpoint: string="", env_auth: false=false, secret_access_key: string="", upload_concurrency: int=1, upload_cutoff: string="209715200", zone: string="" }`

- qingstor backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
- `env_auth` — Runtime credentials are not available: leave env_auth false (true is refused with 400) and send the credentials in the request.

**HTTP:** `POST /api/v1/backends/qingstor`
**CLI:** `hoody files backends qingstor create`

---

#### `createQuatrix` — Connect to quatrix backend

```typescript
client.files.backends.createQuatrix(data: FilesBackendsCreateQuatrixRequest)
```

**Body:** `{ api_key*: string="", description: string="", effective_upload_time: string="4s", encoding: string="50438146", hard_delete: bool=false, host*: string="", maximal_summary_chunk_size: string="100000000", minimal_chunk_size: string="10000000", skip_project_folders: bool=false }`

- quatrix backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/quatrix`
**CLI:** `hoody files backends quatrix create --api-key <api-key> --host <host>`

---

#### `createS3` — Connect to s3 backend

```typescript
client.files.backends.createS3(data: FilesBackendsCreateS3Request)
```

**Body:** `{ access_key_id: string="", acl: string="", bucket_acl: string="", bucket_object_lock_enabled: bool=false, bypass_governance_retention: bool=false, chunk_size: string="5242880", copy_cutoff: string="4999610368", decompress: bool=false, description: string="", directory_bucket: bool=false, directory_markers: bool=false, disable_checksum: bool=false, disable_http2: bool=false, download_url: string="", encoding: string="50331650", endpoint: string="", env_auth: false=false, force_path_style: bool=true, ibm_api_key: string="", ibm_iam_endpoint: string="", ibm_resource_instance_id: string="", leave_parts_on_error: bool=false, list_chunk: int=1000, list_url_encode: string="unset", list_version: int=0, list_versions_oldest_first: string="unset", location_constraint: string="", max_upload_parts: int=10000, memory_pool_flush_time: int=60, memory_pool_use_mmap: bool=false, might_gzip: string="unset", no_check_bucket: bool=false, no_head: bool=false, no_head_object: bool=false, no_system_metadata: bool=false, object_lock_legal_hold_status: string="", object_lock_mode: string="", object_lock_retain_until_date: string="", object_lock_set_after_upload: bool=false, object_lock_supported: string="unset", provider: string="", region: string="", requester_pays: bool=false, role_arn: string="", role_external_id: string="", role_session_duration: string="", role_session_name: string="", sdk_log_mode: string="0", secret_access_key: string="", server_side_encryption: string="", session_token: string="", sign_accept_encoding: string="unset", sse_customer_algorithm: string="", sse_customer_key: string="", sse_customer_key_base64: string="", sse_customer_key_md5: string="", sse_kms_key_id: string="", storage_class: string="", sts_endpoint: string="", upload_concurrency: int=4, upload_cutoff: string="209715200", use_accelerate_endpoint: bool=false, use_accept_encoding_gzip: string="unset", use_already_exists: string="unset", use_arn_region: bool=false, use_data_integrity_protections: string="unset", use_dual_stack: bool=false, use_multipart_etag: string="unset", use_multipart_uploads: string="unset", use_presigned_request: bool=false, use_unsigned_payload: string="unset", use_x_id: string="unset", v2_auth: bool=false, version_at: string="0001-01-01T00:00:00Z", version_deleted: bool=false, versions: bool=false }`

- s3 backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/s3`
**CLI:** `hoody files backends s3 create`

---

#### `createSeafile` — Connect to seafile backend

```typescript
client.files.backends.createSeafile(data: FilesBackendsCreateSeafileRequest)
```

**Body:** `{ 2fa: bool=false, auth_token: string="", create_library: bool=false, description: string="", encoding: string="50405386", library: string="", library_key: string="", pass: string="", url*: string="", user: string="" }`

- seafile backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/seafile`
**CLI:** `hoody files backends seafile create --url <url>`

---

#### `createSftp` — Connect to sftp backend

```typescript
client.files.backends.createSftp(data: FilesBackendsCreateSftpRequest)
```

**Body:** `{ ask_password: bool=false, chunk_size: string="32768", ciphers: string="", concurrency: int=64, connections: int=0, copy_is_hardlink: bool=false, description: string="", disable_concurrent_reads: bool=false, disable_concurrent_writes: bool=false, disable_hashcheck: bool=false, encoding: string="33652738", hashes: string="", host*: string="", host_key_algorithms: string="", host_keys: string="", http_proxy: string="", idle_timeout: int=60, key: string, key_exchange: string="", key_file_pass: string="", key_pem: string="", macs: string="", pass: string="", passphrase: string, password: string, path_override: string="", pin_host_key: bool=false, port: int=22, pubkey: string="", set_env: string="", set_modtime: bool=true, shell_type: string="", skip_links: bool=false, socks_proxy: string="", subsystem: string="sftp", use_fstat: bool=false, use_insecure_cipher: bool=false, user*: string }`

- … Requires host, user, and one of pass, password, key_pem or key (the PEM itself; real line breaks are accepted). Credentials kept on the server, such as a key file or an ssh-agent, cannot be used. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/sftp`
**CLI:** `hoody files backends sftp create --host <host> --user <user>`

---

#### `createSharefile` — Connect to sharefile backend

```typescript
client.files.backends.createSharefile(data: FilesBackendsCreateSharefileRequest)
```

**Body:** `{ auth_url: string="", chunk_size: string="67108864", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="57091982", endpoint: string="", root_folder_id: string="", token: string="", token_url: string="", upload_cutoff: string="134217728" }`

- sharefile backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
- `chunk_size` — Upload chunk size. Must a power of 2 >= 256k. Making this larger will improve performance, but note that each chunk is buffered in memory one per transfer. Reducing this will reduce memory usage but decrease performance.
- `token` — … Needed to connect: the connection lists the remote's root before it is kept, which needs a token. client_id and client_secret are needed only when the token was made with your own OAuth client.

**HTTP:** `POST /api/v1/backends/sharefile`
**CLI:** `hoody files backends sharefile create`

---

#### `createSia` — Connect to sia backend

```typescript
client.files.backends.createSia(data: FilesBackendsCreateSiaRequest)
```

**Body:** `{ api_password: string="", api_url*: string, description: string="", encoding: string="50436354", user_agent: string="Sia-Agent" }`

- sia backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
- `api_url` — Sia daemon API URL, like http://sia.daemon.host:9980. Note that siad must run with --disable-api-security to open API port for other hosts (not recommended). Required: there is no default, so name the Sia daemon's URL.
- `user_agent` — Siad User Agent Sia daemon requires the 'Sia-Agent' user agent by default for security

**HTTP:** `POST /api/v1/backends/sia`
**CLI:** `hoody files backends sia create --api-url <api-url>`

---

#### `createSmb` — Connect to smb backend

```typescript
client.files.backends.createSmb(data: FilesBackendsCreateSmbRequest)
```

**Body:** `{ case_insensitive: bool=true, description: string="", domain: string="WORKGROUP", encoding: string="56698766", hide_special_share: bool=true, host*: string="", idle_timeout: int=60, pass: string="", port: int=445, spn: string="", use_kerberos: false=false, user: string }`

- smb backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
- `use_kerberos` — Kerberos authentication is not available. The schema permits `false`; enabling this option is refused with 400.

**HTTP:** `POST /api/v1/backends/smb`
**CLI:** `hoody files backends smb create --host <host>`

---

#### `createSugarsync` — Connect to sugarsync backend

```typescript
client.files.backends.createSugarsync(data: FilesBackendsCreateSugarsyncRequest)
```

**Body:** `{ access_key_id: string="", app_id: string="", authorization: string="", authorization_expiry: string="", deleted_id: string="", description: string="", encoding: string="50397186", hard_delete: bool=false, private_access_key: string="", refresh_token: string="", root_id: string="", user: string="" }`

- sugarsync backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/sugarsync`
**CLI:** `hoody files backends sugarsync create`

---

#### `createSwift` — Connect to swift backend

```typescript
client.files.backends.createSwift(data: FilesBackendsCreateSwiftRequest)
```

**Body:** `{ application_credential_id: string="", application_credential_name: string="", application_credential_secret: string="", auth: string="", auth_token: string="", auth_version: int=0, chunk_size: string="5368709120", description: string="", domain: string="", encoding: string="16777218", endpoint_type: string="public", env_auth: false=false, fetch_until_empty_page: bool=false, key: string="", leave_parts_on_error: bool=false, no_chunk: bool=false, no_large_objects: bool=false, partial_page_fetch_threshold: int=0, region: string="", storage_policy: string="", storage_url: string="", tenant: string="", tenant_domain: string="", tenant_id: string="", use_segments_container: string="unset", user: string="", user_id: string="" }`

- swift backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/swift`
**CLI:** `hoody files backends swift create`

---

#### `createUlozto` — Connect to ulozto backend

```typescript
client.files.backends.createUlozto(data: FilesBackendsCreateUloztoRequest)
```

**Body:** `{ app_token: string="", description: string="", encoding: string="50438146", list_page_size: int=500, password: string="", root_folder_slug: string="", username: string="" }`

- ulozto backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/ulozto`
**CLI:** `hoody files backends ulozto create`

---

#### `createWebdav` — Connect to webdav backend

```typescript
client.files.backends.createWebdav(data: FilesBackendsCreateWebdavRequest)
```

**Body:** `{ auth_redirect: bool=false, bearer_token: string="", description: string="", encoding: string="", headers: string="", nextcloud_chunk_size: string="10485760", owncloud_exclude_mounts: bool=false, owncloud_exclude_shares: bool=false, pacer_min_sleep: int=0, pass: string="", url*: string="", user: string="", vendor: string="" }`

- webdav backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
- `auth_redirect` — Preserve authentication on redirect. … Note that enabling this also permits sending your credentials over a plaintext HTTP connection if the server redirects from HTTPS to HTTP, which Hoody otherwise refuses to do.

**HTTP:** `POST /api/v1/backends/webdav`
**CLI:** `hoody files backends webdav create --url <url>`

---

#### `createYandex` — Connect to yandex backend

```typescript
client.files.backends.createYandex(data: FilesBackendsCreateYandexRequest)
```

**Body:** `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50429954", hard_delete: bool=false, spoof_ua: bool=true, token: string="", token_url: string="", upload_wait: int=0 }`

- yandex backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
- `token` — … Needed to connect: the connection lists the remote's root before it is kept, which needs a token. client_id and client_secret are needed only when the token was made with your own OAuth client.

**HTTP:** `POST /api/v1/backends/yandex`
**CLI:** `hoody files backends yandex create`

---

#### `createZoho` — Connect to zoho backend

```typescript
client.files.backends.createZoho(data: FilesBackendsCreateZohoRequest)
```

**Body:** `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="16875520", list_folder_burst: int=6, list_folder_limit: int=19, list_folder_window: int=60, region: string="", root_folder_id: string="", token: string="", token_url: string="", tpslimit: string="6", tpslimit_burst: int=1, upload_cutoff: string="10485760" }`

- zoho backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).

**HTTP:** `POST /api/v1/backends/zoho`
**CLI:** `hoody files backends zoho create`

---

#### `delete` — Disconnect backend

```typescript
client.files.backends.delete(id: string, options?: { uploads?: "keep" | "discard" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `uploads` | `"keep" \| "discard"` | query | No | What becomes of what was written on the backend's mounts and is not uploaded yet: keep uploading it (`keep`) or delete it (`discard`; refused with 409 `UPLOADS_DISCARD_SHARED` while a mount is served by the backend's shared connection: remove those mounts first) |

**HTTP:** `DELETE /api/v1/backends/{id}`
**CLI:** `hoody files backends delete <id>`

---

#### `get` — Get backend details

```typescript
client.files.backends.get(id: string)
```

**HTTP:** `GET /api/v1/backends/{id}`
**CLI:** `hoody files backends get <id>`

---

#### `list` — List all backends

```typescript
client.files.backends.list()
```

**HTTP:** `GET /api/v1/backends`
**CLI:** `hoody files backends list`

---

#### `test` — Test backend connection

```typescript
client.files.backends.test(id: string)
```

**HTTP:** `GET /api/v1/backends/{id}/test`
**CLI:** `hoody files backends test <id>`

---

#### `update` — Update backend credentials

```typescript
client.files.backends.update(id: string, data: FilesBackendsUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Backend ID (16-character hex string) |

**Body:** `{ [key: string]: string|null }`

- … Values must be strings or null (null deletes the field). pass and password together are refused with 400. On sftp, key, passphrase and password are other names for key_pem, key_file_pass and pass, and on mega password is another name for pass, as on connect: both names of one field set to different values are refused with 400, and a null under the other name is ignored, so it removes nothing (send key_pem: null to remove a key). On s3, oracleobjectstorage and qingstor, access_key_id and secret_access_key are changed together: one without the other is refused with 400.

**HTTP:** `PUT /api/v1/backends/{id}`
**CLI:** `hoody files backends update <id> --credential <credential>`

---

### `client.files.mounts` (5) — Mount management - create, list, and remove FUSE filesystem mounts for remote backends

#### `create` — Create persistent FUSE mount

```typescript
client.files.mounts.create(data: FilesMountsCreateRequest)
```

**Body:** `{ auto_deliver: bool=true, backend_id*: string, label: string, mount_path: string, vfs_config: VfsConfigPatch }`

**HTTP:** `POST /api/v1/mounts`
**CLI:** `hoody files mounts create --backend-id <backend-id>`

---

#### `delete` — Unmount filesystem

```typescript
client.files.mounts.delete(id: string, options?: { uploads?: "keep" | "wait" | "discard"; wait_seconds?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `uploads` | `"keep" \| "wait" \| "discard"` | query | No | What becomes of what was written on the mount and is not uploaded yet: keep uploading it (`keep`), the same and wait for it (`wait`), or delete it (`discard`; refused with 409 `UPLOADS_DISCARD_SHARED` for a mount served by its backend's shared connection) |
| `wait_seconds` | `number` | query | No | With `uploads=wait` only: the longest the answer waits, in seconds |

**HTTP:** `DELETE /api/v1/mounts/{id}`
**CLI:** `hoody files mounts delete <id>`

---

#### `get` — Get mount details

```typescript
client.files.mounts.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**HTTP:** `GET /api/v1/mounts/{id}`
**CLI:** `hoody files mounts get <id>`

---

#### `list` — List all mounts

```typescript
client.files.mounts.list(options?: { label?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `label` | `string` | query | No | Filter mounts by label. Only mounts with this exact label will be returned. |

**HTTP:** `GET /api/v1/mounts`
**CLI:** `hoody files mounts list`

---

#### `update` — Update mount VFS configuration

```typescript
client.files.mounts.update(id: string, data: FilesMountsUpdateRequest, options?: { switch?: "wait" | "immediate" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Mount ID |
| `switch` | `"wait" \| "immediate"` | query | No | wait (the default): files closed before the update finish uploading before the switch. immediate: switch at once; those files upload later with the previous settings, and such an upload can replace a newer write made through the new settings. If those files cannot all be checked within 10 seconds, the update answers 409 MOUNT_BUSY and changes nothing. |

**Body:** `{ auto_deliver: bool, vfs_config: VfsConfigPatch }`

**HTTP:** `PATCH /api/v1/mounts/{id}`
**CLI:** `hoody files mounts update <id>`

---

### `client.files.extractions` (4) — Running archive extractions

#### `cancel` — Cancel a running extraction

```typescript
client.files.extractions.cancel(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The id listed by GET /api/v1/extractions |

**HTTP:** `DELETE /api/v1/extractions/{id}`
**CLI:** `hoody files extractions cancel <id>`

---

#### `list` — List active extractions

```typescript
client.files.extractions.list()
```

**HTTP:** `GET /api/v1/extractions`
**CLI:** `hoody files extractions list`

---

#### `listByDirectory` — List active extractions

```typescript
client.files.extractions.listByDirectory(options: { extractions: "" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `extractions` | `""` | query | Yes | Selects this operation: send extractions with no value. It is part of the route, not an option. |

**HTTP:** `GET /?extractions`

---

#### `listHistory` — Extraction history

```typescript
client.files.extractions.listHistory(options?: { extraction_history?: "" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `extraction_history` | `""` | query | No | Selects this operation: send extraction_history with no value. It is part of the route, not an option. |

**HTTP:** `GET /?extraction_history`
**CLI:** `hoody files extractions history list`

---

### `client.files.ftp` (1) — Access a file over FTP

#### `get` — Access file via FTP

```typescript
client.files.ftp.get(path: string, options: { type: "ftp"; server: string; user?: string; pass?: string; ftp_secure?: boolean; ftp_passive?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `type` | `"ftp"` | query | Yes |  |
| `server` | `string` | query | Yes |  |
| `user` | `string` | query | No |  |
| `pass` | `string` | query | No | FTP password, base64 encoded. |
| `ftp_secure` | `boolean` | query | No | Use explicit FTPS (AUTH TLS on the control connection). Accepts true, false, 1 or 0. |
| `ftp_passive` | `boolean` | query | No | Passive mode, the only mode supported: `false` is refused with 400. Accepts true, false, 1 or 0. |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `GET /{path}?type=ftp`
**CLI:** `hoody files ftp get <path> --server <server>`

---

### `client.files.images` (1) — Image processing and conversion

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
**CLI:** `hoody files images convert <image>`

---

#### `getThumbnailUrl` — SDK helper

```typescript
client.files.images.getThumbnailUrl(imagePath: string, options?: { width?: number; height?: number; format?: string; quality?: string }, templateVars?: TemplateVars)
```

**Returns:** `string`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

### `client.files.kit` (2) — System endpoints - health checks, version info, and status monitoring

#### `getHealth` — Service health check

```typescript
client.files.kit.getHealth()
```

**HTTP:** `GET /api/v1/files/health`
**CLI:** `hoody files health`

---

#### `getVersion` — Get API version

```typescript
client.files.kit.getVersion()
```

**HTTP:** `GET /api/v1/version`
**CLI:** `hoody files version`

---

### `client.files.s3` (1) — Access a file over S3

#### `get` — Access file from S3

```typescript
client.files.s3.get(path: string, options: { type: "s3"; server: string; s3_bucket: string; s3_region: string; user?: string; pass?: string; s3_endpoint?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `type` | `"s3"` | query | Yes |  |
| `server` | `string` | query | Yes | S3 service host. An AWS host (`*.amazonaws.com`) is reached by `s3_region`; any other host is the endpoint of an S3-compatible service (MinIO, DigitalOcean Spaces, ...), unless `s3_endpoint` names one. |
| `s3_bucket` | `string` | query | Yes | S3 bucket name. The connection is rooted at this bucket, and the path is the object key (or key prefix) within it. Reading an object also lists its folder, so the credentials (or anonymous access) need permission to list the bucket. |
| `s3_region` | `string` | query | Yes |  |
| `user` | `string` | query | No | Access key ID. Give both `user` and `pass`, or neither for anonymous access to a public bucket. |
| `pass` | `string` | query | No | Secret access key (base64 encoded). Give both `user` and `pass`, or neither. |
| `s3_endpoint` | `string` | query | No | Endpoint of an S3-compatible service (MinIO, etc.), as a host or URL. Takes precedence over `server`. |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `GET /{path}?type=s3`
**CLI:** `hoody files s3 get <path> --server <server> --s3-bucket <s3-bucket> --s3-region <s3-region>`

---

### `client.files.ssh` (2) — Access files over SSH/SFTP

#### `get` — Access file via SSH/SFTP

```typescript
client.files.ssh.get(path: string, options: { type: "ssh"; server: string; user: string; pass?: string; key?: string; passphrase?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `type` | `"ssh"` | query | Yes |  |
| `server` | `string` | query | Yes | Server hostname:port |
| `user` | `string` | query | Yes | SSH username |
| `pass` | `string` | query | No | Password (base64 encoded). Give `pass` or `key`; a request with neither is refused with 400. |
| `key` | `string` | query | No | Private key in PEM form (base64 encoded). Give `pass` or `key`; a request with neither is refused with 400. |
| `passphrase` | `string` | query | No | Key passphrase (base64 encoded) |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /{path}?type=ssh`
**CLI:** `hoody files ssh get <path> --server <server> --user <user>`

---

#### `upload` — Upload file via SSH/SFTP

```typescript
client.files.ssh.upload(path: string, data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string, options: { server: string; user: string; pass?: string; key?: string; passphrase?: string; contentType?: 'application/octet-stream' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `server` | `string` | query | Yes | Server hostname:port |
| `user` | `string` | query | Yes | SSH username |
| `pass` | `string` | query | No | Password (base64 encoded). Give `pass` or `key`; a request with neither is refused with 400. |
| `key` | `string` | query | No | Private key in PEM form (base64 encoded). Give `pass` or `key`; a request with neither is refused with 400. |
| `passphrase` | `string` | query | No | Key passphrase (base64 encoded) |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `PUT /{path}?type=ssh`
**CLI:** `hoody files ssh upload <path> --server <server> --user <user>`

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
| `simple` | `""` | query | No | Directory only: return the entry names one per line (directories end in /) as text/plain |
| `sort` | `"name" \| "mtime" \| "size"` | query | No | Sort by field |
| `order` | `"asc" \| "desc"` | query | No | Sort order |
| `hash` | `""` | query | No | Get SHA256 hash of file (returns plain text hash) |
| `sha256` | `""` | query | No | Get SHA256 hash of file (alias for hash) |
| `base64` | `""` | query | No | Get file content as base64 encoded string |
| `edit` | `""` | query | No | Open file in Web UI editor (requires allow-upload permission) |
| `view` | `""` | query | No | Open file in a read-only Web UI page: the text is shown with no Save, rename, move or delete. |
| `download` | `"" \| "1" \| "true"` | query | No | For file paths only: force browser download (Content-Disposition: attachment). Accepted values: empty (?download), 1, or true. For directory paths, ?download is the URL download-manager operation. |
| `contentType` | `string` | query `content-type` | No | Override Content-Type header for file downloads |
| `history` | `""` | query | No | List all revisions of a file recorded in the journal. Returns JSON with revisions array, pagination via after_id, and head_matches_disk: true when the file on disk holds what the journal's newest record of it says, false when it does not (an outside write, an unrecorded change, pruned history or missing content history can each cause this; the flag alone does not identify the cause); absent for a folder or any other path that is neither a file nor missing, and when the file could not be read. Mutually exclusive with at/revision/diff. The journal records only changes made through Hoody Files; a change made by the agent's tools, a terminal, a script or a program is not recorded. |
| `at` | `string` | query | No | Read file content at a point in time, as the journal recorded it. Accepts RFC3339 timestamp or Unix milliseconds. Mutually exclusive with history/revision/diff. Composable with ?lines, ?hash, ?base64. The X-Journal-Head-Matches-Disk response header is true when the file on disk holds what the journal's newest record of it says, false when it does not (an outside write, an unrecorded change, pruned history or missing content history can each cause this; the flag alone does not identify the cause); absent for a folder or any other path that is neither a file nor missing, and when the file could not be read. The journal records only changes made through Hoody Files; a change made by the agent's tools, a terminal, a script or a program is not recorded. |
| `revision` | `number` | query | No | Read file content by stable per-path sequence number. Mutually exclusive with history/at/diff. Composable with ?lines, ?hash, ?base64. The X-Journal-Head-Matches-Disk response header is true when the file on disk holds what the journal's newest record of it says, false when it does not (an outside write, an unrecorded change, pruned history or missing content history can each cause this; the flag alone does not identify the cause); absent for a folder or any other path that is neither a file nor missing, and when the file could not be read. The journal records only changes made through Hoody Files; a change made by the agent's tools, a terminal, a script or a program is not recorded. |
| `diff` | `""` | query | No | Compute unified diff between two versions. Requires from_seq or from_ts. With to_seq or to_ts it compares two recorded versions; with neither it compares with the file as it is on disk now (410 when the file no longer exists, 422 when it is over the journal's size limit). Mutually exclusive with history/at/revision. The X-Journal-Head-Matches-Disk response header is true when the file on disk holds what the journal's newest record of it says, false when it does not (an outside write, an unrecorded change, pruned history or missing content history can each cause this; the flag alone does not identify the cause); absent for a folder or any other path that is neither a file nor missing, and when the file could not be read. The journal records only changes made through Hoody Files; a change made by the agent's tools, a terminal, a script or a program is not recorded. |
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

**Returns:** `Promise<ApiResponse<ArrayBuffer> | FilesUiGetPageResponse>` — the response Content-Type picks the branch, always under `.data`: JSON gives the parsed value, a binary type (or a non-text body sent as an attachment) an `ArrayBuffer`, and any other type, such as an HTML or plain-text body, a string, which the declared type does not list (narrow it before use)  |  **HTTP:** `GET /{path}`

---

### `client.files.uploads` (8) — Held upload data

**Shared parameters of `client.files.uploads`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Pending upload ID: 32 lowercase hex characters, as the listing gives it |

#### `delete` — Discard a pending upload

```typescript
client.files.uploads.delete(id: string)
```

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/pending-uploads/{id}`
**CLI:** `hoody files uploads delete <id>`

---

#### `deleteUnreadable` — Delete an unreadable pending upload

```typescript
client.files.uploads.deleteUnreadable(id: string)
```

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/pending-uploads/unreadable/{id}`
**CLI:** `hoody files uploads unreadable delete <id>`

---

#### `deliver` — Deliver a pending upload

```typescript
client.files.uploads.deliver(id: string, data?: FilesUploadsDeliverRequest)
```

**Body:** `{ backend_id: string, paths: string[], paths_b64: string[] }`

**HTTP:** `POST /api/v1/pending-uploads/{id}/deliver`
**CLI:** `hoody files uploads deliver <id>`

---

#### `download` — Download a held file

```typescript
client.files.uploads.download(id: string, options?: { path?: string; path_b64?: string; range?: string; ifRange?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | query | No | A path from the item's files, exactly as listed. Give this or path_b64, not both. |
| `path_b64` | `string` | query | No | A path_b64 from the item's files, exactly as listed. Give this or path, not both. |
| `range` | `string` | header `Range` | No | Ask for part of the held file, as 'bytes=first-last', 'bytes=first-' or 'bytes=-suffix_length', as for a file download. One satisfiable range answers 206 with Content-Range; several answer 206 as multipart/byteranges. Ranges that cannot be satisfied are dropped from a list, and 416 comes only when none is left. A malformed header is ignored (200, whole file). |
| `ifRange` | `string` | header `If-Range` | No | Honour Range only if the held file still has this ETag, exactly; otherwise answer 200 with the whole file. |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /api/v1/pending-uploads/{id}/file`
**CLI:** `hoody files uploads download <id>`

---

#### `list` — List pending uploads

```typescript
client.files.uploads.list(options?: { backend_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `backend_id` | `string` | query | No | Only items of this backend |

**HTTP:** `GET /api/v1/pending-uploads`
**CLI:** `hoody files uploads list`

---

#### `listFiles` — List a pending upload's files

```typescript
client.files.uploads.listFiles(id: string, options?: { cursor?: string; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `cursor` | `string` | query | No | next_cursor from the previous page. Omit it for the first page. |
| `limit` | `number` | query | No | Largest number of files on the page |

**HTTP:** `GET /api/v1/pending-uploads/{id}/files`
**CLI:** `hoody files uploads files list <id>`

---

#### `listUnreadable` — List unreadable pending uploads

```typescript
client.files.uploads.listUnreadable()
```

**HTTP:** `GET /api/v1/pending-uploads/unreadable`
**CLI:** `hoody files uploads unreadable list`

---

#### `stop` — Stop a running upload

```typescript
client.files.uploads.stop(id: string)
```

**HTTP:** `POST /api/v1/pending-uploads/{id}/stop`
**CLI:** `hoody files uploads stop <id>`

---

### `client.files.webdav` (8) — WebDAV protocol operations - PROPFIND, PROPPATCH, COPY, MOVE, LOCK, UNLOCK, OPTIONS

#### `copy` — Copy a file

```typescript
client.files.webdav.copy(path: string, options: { destination: string; overwrite?: "T" | "F" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Source file path |
| `destination` | `string` | header `Destination` | Yes | Destination URL for the copy |
| `overwrite` | `"T" \| "F"` | header `Overwrite` | No | T (default) replaces an existing destination; F refuses one, answering 412 and leaving it untouched. A request refused for another reason is answered for that reason instead, whatever this header says: copying or moving a resource onto itself is 403, and so is a source that is not a regular file. |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `COPY /{path}`

---

#### `get` — Access file via WebDAV

```typescript
client.files.webdav.get(path: string, options: { type: "webdav"; server: string; user?: string; pass?: string; webdav_path?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `type` | `"webdav"` | query | Yes |  |
| `server` | `string` | query | Yes |  |
| `user` | `string` | query | No |  |
| `pass` | `string` | query | No |  |
| `webdav_path` | `string` | query | No | WebDAV endpoint path |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `GET /{path}?type=webdav`
**CLI:** `hoody files webdav get <path> --server <server>`

---

#### `getOptions` — Get allowed methods

```typescript
client.files.webdav.getOptions(path: string)
```

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `OPTIONS /{path}`

---

#### `getProperties` — Get WebDAV properties

```typescript
client.files.webdav.getProperties(path: string, data?: string, options?: { depth?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `depth` | `string` | header `Depth` | No | For directories, Depth 0 or 1 is accepted, defaulting to 1; other values receive 400. For files, Depth is ignored. |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `PROPFIND /{path}`

---

#### `lock` — Lock file (WebDAV compatibility)

```typescript
client.files.webdav.lock(path: string, data?: string, options?: { depth?: "0" | "infinity" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `depth` | `"0" \| "infinity"` | header `Depth` | No |  |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `LOCK /{path}`

---

#### `move` — Move or rename file/directory

```typescript
client.files.webdav.move(path: string, options: { destination: string; overwrite?: "T" | "F" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Source file or directory path |
| `destination` | `string` | header `Destination` | Yes | Destination URL for the move |
| `overwrite` | `"T" \| "F"` | header `Overwrite` | No | T (default) replaces an existing destination; F refuses one, answering 412 and leaving it untouched. A request refused for another reason is answered for that reason instead, whatever this header says: copying or moving a resource onto itself is 403. |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `MOVE /{path}`

---

#### `unlock` — Unlock file (WebDAV compatibility)

```typescript
client.files.webdav.unlock(path: string)
```

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `UNLOCK /{path}`

---

#### `updateProperties` — Update WebDAV properties

```typescript
client.files.webdav.updateProperties(path: string, data?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Path of the file; a directory is answered 404 |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `PROPPATCH /{path}`


### Body schemas

- `MoveRequest` — `{ move_to*: string }`
- `RenameRequest` — `{ name*: string }`
  - `name` — New filename (cannot contain path separators)
- `ChmodRequest` — `{ mode*: string }`
- `ChownRequest` — `{ group: string, owner: string }`
- `VfsConfigPatch` — `{ allow_non_empty: false, allow_other: false, cache_max_age: string | int, cache_max_size: string | 0 | int, cache_mode: "off" | "minimal" | "writes" | "full", contimeout: string | int, dir_cache_time: string | int, low_level_retries: int, poll_interval: string | int, read_chunk_size: string | int, read_only: bool, timeout: string | int, write_back: string | int }`
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

