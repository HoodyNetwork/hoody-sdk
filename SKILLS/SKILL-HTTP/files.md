> _**HTTP skill · `files` namespace** · ~43,572 tokens · hoody-sdk v1.0.1_

# `files` — computer filesystem over HTTP, with automatic Git-like change history

## Purpose

**Default surface: the computer's own filesystem, exposed over HTTP — with automatic mutation journaling when the deployment enabled it.** Read, write, copy, move, delete, stat, chmod, list, glob, grep, archive-preview/extract, fetch URLs into the FS, resumable upload — all on absolute computer paths (`/home/user/main.py`, `/etc/hostname`, `/hoody/databases/foo.db`). No backend flag needed.

**Headline feature when journaling is on — automatic change history for writes made through `files`.** With the journal enabled, every `PUT` / `PATCH` / `DELETE` / `MOVE` / `COPY` sent to this kit is appended to a per-computer mutation log, on a best-effort basis (an entry is skipped when the journal's storage budget is exceeded or its writer is unhealthy; the write itself still succeeds and the log can then show a `gap` entry; check `GET /api/v1/journal/stats`): monotonic sequence number, timestamp, path, op, size, hash. **Only writes made through `files` are recorded:** the agent's file tools, a terminal, `exec` scripts and other programs write to the disk directly, and the journal never sees those changes. **History is kept for journaled paths, within limits:** retention prunes old entries (90 days or 2 GiB of journal storage by default), bodies over 2 MiB, and binary files, keep only their hash and size, and excluded paths (dev dirs such as `node_modules`, and `.git`) are never recorded. The journal lets you:

- **Time-travel a single file** — `GET /api/v1/files/{path}` `?revision=<seq>` or `?at=<unix-ms>` returns the bytes the journal recorded for that point.
- **List a file's history** — `GET /api/v1/files/{path}` `?history=1` returns one page of the path's revisions (renames followed), oldest first by global journal entry id: 100 entries by default, `limit` up to 1000. While the response has `has_more: true`, request again with `after_id` set to its `next_after_id`.
- **Diff between revisions** — `GET /api/v1/files/{path}` `?diff=1&from_seq=<N>` returns a unified diff between revision `N` and the file as it is on disk now; add `to_seq` or `to_ts` to compare two recorded revisions instead.
- **Tell when the journal is behind the disk** — a journal view of a file says, when the file on disk could be checked, whether the journal's newest record of it still matches it (no flag means the state is unknown): `head_matches_disk` in the `?history` JSON, the `X-Journal-Head-Matches-Disk` header on `?at`, `?revision` and `?diff`. `false` means the file does not match a known retained journal head: an outside write, a change the journal does not record, pruned history or no content history can each cause it, and the flag alone does not say which.
- **Replay / audit** — `GET /api/v1/journal` `?path=<p>&after_id=<id>` streams every operation after global journal entry `id` (while the response has `has_more: true`, resume from its `next_after_id`; on the last page `next_after_id` is `null`, so keep the last entry's `id` as your cursor; an entry's `seq` is its per-path revision number, not a cursor). Run `POST /api/v1/journal/flush` to force-persist before querying for the absolute latest.
- **Cross-replicate** — pipe the journal into another computer as an event source for mirroring / fan-out / append-only sync.

When the deployment turned journaling on, no per-write setup is needed — every covered write is normally recorded. Exposing the journal query endpoints — history, revision, diff, stats, flush — over the API is a second deployment-side switch; where it is off those endpoints return `403`. Where API access is on but recording itself is off, they return `404 Journal is not enabled`. It is not a complete undo: retention pruning, the 2 MiB body cap, binary files (their contents are not kept), the exclude lists and write paths with no journal hook (URL downloads, archive extraction) all leave gaps, so check the file's history before relying on a restore. Journaling is ON in the standard `hoody_kit: true` computer image; a raw kit deployment that did not turn it on skips recording (writes there follow their own switches, see Prerequisites).

**Optional add-ons (per-request, opt-in):**
- **Remote backends** — append `?backend=<id>` to operate against a backend you've connected, of any of the 49 allowed rclone backend types (Mega, SFTP, S3, GDrive, Dropbox, Backblaze B2, WebDAV, …), instead of the local FS. A `?type=` parameter does not select a connected backend: on `/api/v1/files/{path}` it is ignored and the request runs on the local FS. Only where the deployment enabled remote backends; otherwise `403`. Note: the journal records local-FS mutations; remote-backend ops go to the remote and aren't replayable from the journal.
- **FUSE mounts** — `POST /api/v1/mounts` to surface a remote backend AS a path in the local FS. Same deployment-side requirement.
- **chmod / chown** — Unix-only, and only where the deployment enabled them; otherwise `403`.

## When to use

- **Local computer FS (the 90% case)** — CRUD, archive entry / extract, search (glob, grep; grep stops at a file's first NUL byte and skips the whole read block (about 64 KiB) that contains it, so matches before the NUL are kept only if they sit in an earlier block; in a small file with a NUL, grep finds nothing), download a URL into a path, resumable upload. Local works out of the box.
- **Recover / inspect a previous version of a text file** — `?history=1`, `?revision=<seq>`, `?at=<unix-ms>`, `?diff=1&from_seq=<N>`. Available where journaling and journal API access are on (`403` when API access is off, `404` when recording is off), for writes the journal recorded and still retains (see Quirks for what is excluded).
- **Audit / replay the changes `files` recorded** — `GET /api/v1/journal` for the full event stream (sequence, timestamp, path, op, size, hash). Changes made by the agent's tools, a terminal or a program are not in it; use `watch` to see those.
- **Remote cloud / SSH / S3** — append `?backend=<id>` to read (`GET /api/v1/files/{path}`), stat (`GET /api/v1/files/stat/{path}`), upload (`PUT /api/v1/files/{path}`, not with `append`), delete (`DELETE /api/v1/files/{path}`) or create a directory (`POST /api/v1/files/{path}?mkdir`). On `/api/v1/files/{path}`, PATCH, PUT with `append`, and POST extraction, URL download, copy and move reject `backend` with `400`. Do not add it to the WebDAV-root extraction or URL-download requests either: there it selects no remote and is ignored.
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

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Read, search, write

1. `GET /api/v1/files/{path}?stat` or `?lines=10-50`.
2. `GET /api/v1/files/glob/{path}?pattern=**/*.ts`; `GET /api/v1/files/grep/{path}?pattern=TODO&context=2` (local only).
3. `PUT /api/v1/files/{path}?append=true`; `DELETE /api/v1/files/{path}`.

### 2. Download, extract, FUSE-mount

1. `GET /{dir}?download=<url>` answers when the download has finished; `GET /{dir}?downloads` from a second request shows its progress meanwhile.
2. `GET /{archive}?preview` (empty value); `GET /{archive}?extract=src/&dest=work-src` (`extract` is an exact entry name, or a directory prefix ending in `/`; no globs. `dest` MUST be relative).
3. `POST /api/v1/backends/s3` (49 backend types) -> `GET /api/v1/files/{path}?backend=<id>` for one-shot reads OR `POST /api/v1/mounts` -> `GET /hoody/mounts/permanent/...` for a regular FS view -> `DELETE /api/v1/mounts/{id}`, then `DELETE /api/v1/backends/{id}`. (The WebDAV root listing has no `backend` parameter; `GET`/`PUT`/`DELETE /api/v1/files/{path}` do.)

### 3. Journal time-travel + TUS-like upload

1. `GET /api/v1/files/{path}?history`, `?revision=N` or `?at=<unix-ms>`, `?diff&from_seq=<N>`.
2. `GET /api/v1/journal?path=<p>&after_id=<id>` (global entry id, not `seq`; see Purpose for the last-page cursor rule); `POST /api/v1/journal/flush` first.
3. Resumable: `PUT /{path}` first chunk, then `PATCH /{path}` with `X-Update-Range: append` (or `PUT /api/v1/files/append/{path}`) per chunk.

## Quirks & gotchas

- Reserved sub-prefixes (stat, chmod, chown, realpath, glob, grep, copy, move, append) dispatch by URL prefix, each scoped to a specific HTTP method (stat/grep/glob/realpath→GET, chmod/chown→PATCH, copy/move→POST, append→PUT) to prevent method bleeding -- so `DELETE /api/v1/files/stat/foo` does NOT trigger the stat dispatcher; it removes the literal path `/stat/foo`. `/api/v1/files/health` is a route of its own and never reaches the dispatcher.
- `GET /api/v1/files/glob/{path}`/`GET /api/v1/files/grep/{path}`/`GET /api/v1/files/realpath/{path}`/`?lines=` local-only; `?backend=` -> 400.
- `?backend=` (on `/api/v1/files`) and the legacy `?type=` (on the `/{path}` front only) need remote backends enabled deployment-side.
- `?backend=` on `/api/v1/files/{path}` is served only for GET, DELETE, PUT without `append`, and POST that creates a directory; on any other method or operation it returns `400` ("only supported for reading, uploading and deleting files and for creating directories").
- `PATCH /api/v1/files/chmod/{path}`/`PATCH /api/v1/files/chown/{path}` Unix-only, and only where the deployment enabled them.
- WebDAV verbs on `/{path}`: PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK, CHECKAUTH, LOGOUT.
- `GET /api/v1/files/realpath/{path}` resolves symlinks whether or not symlink following is enabled, but still returns `403` when the resolved target is outside the serve root or outside your access rules.
- **Resumable upload PATCH must use the WebDAV root route (`PATCH /{path}`), NOT `PATCH /api/v1/files/{path}`** — the api/v1 PATCH reads a small JSON body as a metadata operation (at most 64 KiB, else `413 Request body too large`; malformed JSON is `400 Invalid JSON body`), so a raw chunk is refused unless it happens to be valid JSON, which can be taken as a move or rename. The WebDAV form takes `X-Update-Range: append` — or an HTTP-Range offset `bytes=<start>-<end>` (a Content-Range-style `/<size>` suffix is REJECTED with `400 Invalid X-Update-Range Header`) — plus the raw body, and returns `204 No Content` on success. Send the chunk with a non-JSON `Content-Type`, such as `application/octet-stream`: on the WebDAV route too, a content type starting with `application/json` selects a metadata request instead (chmod, chown or rename), and `X-Update-Range` is ignored. The path must already exist (`404` otherwise). An explicit range's start must fall INSIDE the current file, but only that start is used: the whole body is written from it, the range end does not bound the write, and a body longer than the rest of the file extends it. A start at or past EOF is refused, so use `append` to continue at the end.
- **Archive `?dest=` MUST be relative** (e.g. `?dest=extracted`), not absolute — sending `?dest=/abs/path` returns `400 Absolute destination path not allowed`. The directory is created relative to the archive's containing dir.
- **`?preview` query value matters** — pass `?preview` empty (no `=…`) for a full archive listing; `?preview=true` is parsed as the entry name `true` and returns `404 Entry not found in archive: true`. Same trap on `?contents`.
- **Bare `?extract_file=` is unhandled by the kit's GET dispatcher** — the request falls through to "send the raw archive file" and you get the **whole archive's bytes**, not the selected entry. The generated SDK and CLI work around this by ALSO sending `?extract=` — when both query params are present, the `GET /{archive}?extract` branch runs (writes to disk under `?dest=`). The OpenAPI-only `?extract_file=` form is effectively dead.
- **The journal retains body bytes only for text files up to 2 MiB by default; a binary file, or a larger one, still produces a journal entry with its hash and size, but its contents are not kept**.
- **Exclusions decide which paths are journalled.** Built-in dev-dir excludes (`node_modules`, `target`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `__pycache__`, `.venv`, `venv`, `env`, `__pypackages__`, `.tox`, `.nox`, `bower_components`, …) skip journaling unless the deployment turned the dev-dir exclusions off. `.git` is always excluded regardless of that setting (separate hardcoded check, not part of the toggleable list). The deployment can add further excludes of its own. This is why "I wrote to `node_modules/x` and saw no journal entry" is expected.
- **Journal does NOT cover everything by default.** Live behaviour observed: a fresh `PUT` (create) and an overwriting `PUT` (write) on `/home/user/...` produce entries; URL downloads (`?download=`) and archive extraction are NOT journaled — those write through paths with no journal hook. `PATCH /api/v1/files/chmod/{path}`, `PATCH /api/v1/files/chown/{path}`, `PUT /{path}?touch`, `?append=true` and copy/move ARE recorded. Always call `POST /api/v1/journal/flush` then `GET /api/v1/journal` (or `?history=1`) to inspect what was actually recorded — don't assume coverage.
- **Built-in dev-dir exclude list always skips journaling** for `node_modules`, `__pycache__`, `.venv`, `target`, `.next`, `.nuxt`, etc. — even on `/home/user/...` paths. Only the deployment can turn these off, at kit start. `.git` is hardcoded to ALWAYS be excluded and stays excluded even then.
- **`HEAD` returns no body** on both routes. `HEAD /api/v1/files/{path}` ignores `Range`, so its status and headers need not match a ranged `GET`. It carries no metadata body; for a JSON metadata envelope use `GET /api/v1/files/stat/{path}`.
- **`PATCH /api/v1/files/chown/{path}` to root is rejected** with `400 Cannot change ownership to root (UID 0)` (owner) or `400 Cannot change group to root (GID 0)` (group) — even where the deployment enabled chown. Use a non-root user (`nobody`, `user`, …).
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

Most steps have a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `GET /api/v1/computers/{id}` first. Examples that need history use `/home/user/...`. The kit has no fixed rule for `/tmp` or `/home/user`: coverage depends on the exclude lists, so check `?history` rather than assuming it. An idle kit may be asleep: the first request can return `502` from the proxy with an HTML error body, so retry 2-3 times with a few seconds of backoff.

### 1. Read a file — full bytes, stat envelope, and a slice of lines

**Goal:** inspect an unknown text file three ways: get its metadata, peek the raw bytes, and slice an arbitrary line range without pulling the whole thing.

**Step 1 — stat first.** `GET /api/v1/files/stat/{path}` returns size, owner/group, octal permissions, mtime, and, when the journal has recorded the path, `revisions`: the path's latest per-path revision number. The field is absent for a path the journal has not recorded, and it is not a count of the entries still retained after pruning. Use this BEFORE downloading a file you don't know the size of.

```bash
KIT="https://${P}-${C}-files-1.${N}.computers.hoody.com"
curl -sf "$KIT/api/v1/files/stat/etc/hostname"
# → {"name":"hostname","path":"/etc/hostname","path_type":"File","size":13,"permissions":"644","owner":"root","group":"root","mtime":...}   # "revisions":N only for a journaled path
```

**Step 2 — line slice.** `?lines=2-3` returns just lines 2 through 3 inclusive. Local-FS only (rejected with `400` when combined with `?backend=`).

```bash
curl -sf "$KIT/api/v1/files/etc/passwd?lines=2-3"
# returns just two lines, plain text
```

**Step 3 — full body.** No query params, raw bytes. The `Content-Type` of a later download is inferred from the filename, with `application/octet-stream` when it has no known extension.

```bash
curl -sf "$KIT/api/v1/files/etc/hostname" -o /tmp/hostname.txt
```

### 2. Find files then grep them — TODO scan across a tree

**Goal:** find the `.md` files under a directory (visible and not ignored by default), then grep them for `TODO` with surrounding context. Both ops are local-FS only.

**Step 1 — glob.** `pattern` matches relative to `path`; obeys `.gitignore` unless `no_ignore=true` (`.gitignore` rules apply only inside a git repository). Names starting with `.` are skipped unless `hidden=true` (CLI `--hidden`) or an ignore-file `!name` rule re-includes them. Results are capped by `max_results` (default 1000, maximum 10000); check `truncated` in the response and search a smaller subtree when you need every match.

```bash
KIT="https://${P}-${C}-files-1.${N}.computers.hoody.com"
curl -sf "$KIT/api/v1/files/glob/home/user?pattern=**/*.md&max_results=200" \
  | jq '.entries[].name'
```

**Step 2 — grep with context.** `?glob=` filters which files grep looks at; `?context=2` mirrors `grep -C 2`.

```bash
curl -sf "$KIT/api/v1/files/grep/home/user?pattern=TODO&glob=**/*.md&context=2&ignore_case=true" \
  | jq '.matches[] | {path, line_number, line}'
```

### 3. Resumable upload — split a payload into a first upload and appended chunks

**Goal:** push a 16 MiB payload as 8 MiB chunks. Many CDN/proxy combos cap a single body at 10 MiB; chunked upload sidesteps that.

**Step 1 — first chunk via PUT.** Creates the file with the first slab.

```bash
KIT="https://${P}-${C}-files-1.${N}.computers.hoody.com"
DST=/home/user/upload-test.bin
head -c $((8*1024*1024)) /dev/urandom > /tmp/chunk1.bin
curl -sf -X PUT "$KIT/api/v1/files$DST" \
  -H 'Content-Type: application/octet-stream' \
  --data-binary @/tmp/chunk1.bin
# → {"path":"...","size":8388608,"success":true}
```

**Step 2 — append remaining chunks.** Send `PATCH /<path>` (the WebDAV root route, NOT `/api/v1/files/...` — that one reads a small body as JSON metadata operations: an oversized body gets `413`, malformed JSON `400`, and a chunk that happens to be valid JSON can be taken as a move or rename). Header `X-Update-Range: append` says "concatenate". Send the chunk with a non-JSON `Content-Type`, such as `application/octet-stream`: on the WebDAV route, a content type starting with `application/json` selects a metadata request instead, and `X-Update-Range` is ignored. The path must already exist. Returns `204 No Content`. (`PUT /api/v1/files/append/{path}` is the REST append, described in step 3.)

```bash
head -c $((8*1024*1024)) /dev/urandom > /tmp/chunk2.bin
curl -sf -X PATCH "$KIT$DST" \
  -H 'X-Update-Range: append' -H 'Content-Type: application/octet-stream' \
  --data-binary @/tmp/chunk2.bin
curl -sf "$KIT/api/v1/files/stat$DST" | jq '.size'   # → 16777216
```

**Step 3 — resume after a network drop.** A WebDAV append (`PATCH /{path}` with `X-Update-Range: append`) writes bytes as they arrive, so a request that broke off may already have added part of its chunk. A REST append (`PUT /api/v1/files/append/{path}`, or an upload with `append`) stages the whole body first, so a body that broke off leaves the file unchanged, although a failure during the write that follows can still leave part of the chunk appended. For a REST append sent without `Content-Length` (streamed, chunked or HTTP/2), send `X-Expected-Length` with the chunk's byte count: an HTTP/2 client that is aborted mid-body can otherwise hand over a body that looks complete, so the append ends short with no error, whereas with the header the kit refuses a body of any other length with `400` before the file changes. A WebDAV append does not check that header, so after a break stat the file before resuming. Either way, do not resend the whole chunk blindly: stat the remote file, compare its size with how many bytes of the payload you have sent, and append only the bytes after that size. An explicit `bytes=<start>-<end>` range (no `/<total>` suffix — that is rejected) must start inside the existing file and writes the whole body from that start, so it can rewrite a tail you know is wrong, but a start at EOF is refused; appending is the way to continue. 

### 4. Time-travel a single file — history → revision N → diff

**Goal:** roll back a config file by reading an earlier revision, comparing it to current, then writing the chosen revision back. Use a path the journal covers: not under an excluded directory (`.git`, dev dirs such as `node_modules`, or excludes the deployment added — see Quirks), and confirm with `?history`.

**Step 1 — write two revisions.** Use a path with no journal history yet: revisions count on per path, so the `revision=1` below is this example's first write only on a fresh path. On a path with history, take the revision numbers from step 2.

```bash
KIT="https://${P}-${C}-files-1.${N}.computers.hoody.com"
FILE_PATH=/home/user/config.toml
curl -sf -X PUT "$KIT/api/v1/files$FILE_PATH" --data-binary 'verbose = false'
sleep 1
curl -sf -X PUT "$KIT/api/v1/files$FILE_PATH" --data-binary 'verbose = true'
curl -sf -X POST "$KIT/api/v1/journal/flush"   # force-persist before query
```

**Step 2 — list history.** `?history=1` returns one page of the per-revision log (100 entries by default, `limit` up to 1000; while `has_more` is `true`, repeat with `after_id` set to the response's `next_after_id`): each entry has `seq`, `op` (`"create"` / `"write"` / `"delete"` / `"moved_from"`/`"moved_to"` / etc. — see Example 5 for the full enum), `ts`, hashes, and size deltas.

```bash
curl -sf "$KIT/api/v1/files$FILE_PATH?history=1" \
  | jq '.revisions[] | {seq, op, ts, size_after}'
```

**Step 3 — fetch revision N.** `?revision=1` returns the bytes of that point-in-time. (Use `?at=<unix-ms>` for an instant.)

```bash
curl -sf "$KIT/api/v1/files$FILE_PATH?revision=1"        # → "verbose = false"
curl -sf "$KIT/api/v1/files$FILE_PATH?diff=1&from_seq=1" # unified diff seq 1 → current
```

**Step 4 — restore by writing rev1 bytes back.** PUT the body returned by `?revision=1`.
```bash
curl -sf "$KIT/api/v1/files$FILE_PATH?revision=1" \
  | curl -sf -X PUT "$KIT/api/v1/files$FILE_PATH" --data-binary @-
```

### 5. Audit — stream recorded Hoody Files mutations since a cursor via the journal

**Goal:** wire a SIEM / alerting pipeline. Get the recorded FS mutations since the last cursor, including hashes for tamper detection. Don't forget `POST /api/v1/journal/flush` first. The journal records only changes made through Hoody Files: a change made by a terminal, a script, a program or the agent's tools is not in it.

**Step 1 — flush so buffered journal writes are on disk.**

```bash
KIT="https://${P}-${C}-files-1.${N}.computers.hoody.com"
curl -sf -X POST "$KIT/api/v1/journal/flush"
```

**Step 2 — query since cursor.** `after_id` is the last `id` you've seen. `op` enum is `"create"` / `"write"` / `"append"` / `"delete"` / `"touch"` / `"moved_from"` / `"moved_to"` / `"copied_from"` / `"copied_to"` / `"dir_moved_from"` / `"dir_moved_to"` / `"dir_copied_from"` / `"dir_copied_to"` / `"dir_deleted"` / `"mkdir"` / `"chmod"` / `"chown"` / `"gap"` (no bare `"move"`/`"copy"` — use the directional `"moved_from"`/`"moved_to"` etc. pair).

The response carries `has_more`. `next_after_id` is set only while `has_more` is true; on the last page it is `null`. Advance the cursor to `next_after_id` when it is set, otherwise to the last entry's `id`, and keep the old cursor when the page is empty. Storing `null` would restart the next poll from the beginning of the journal.

```bash
LAST=${LAST:-0}   # cursor; persist client-side
R=$(curl -sf "$KIT/api/v1/journal?after_id=$LAST&limit=200")
echo "$R" | jq '{count, has_more, ops: [.entries[] | {id, seq, op, path, ts, size_after, before, after, hash}]}'   # before/after: content SHA-256; hash: move/copy
LAST=$(echo "$R" | jq --argjson last "$LAST" '.next_after_id // (.entries | last | .id) // $last')
```

**Step 3 — health check.** Watch `GET /api/v1/journal/stats` for `writer_healthy:false`, `parse_failures`, or `skipped_overflow > 0` — any of those means the audit trail is degraded.

```bash
curl -sf "$KIT/api/v1/journal/stats" | jq '{writer_healthy, parse_failures, skipped_overflow, entries_skipped_total}'
```

### 6. Download a URL straight into the FS (no curl, no wget needed)

**Goal:** pull an asset from the public internet into a computer path. The kit handles the actual HTTP fetch — useful for sandboxed computers without outbound HTTP libs.

**Step 1 — download.** `GET /<directory>?download=<url>&filename=<name>` (URL-encode the URL). The directory must already exist (a missing one is `404`), so create it first. The request waits until the download has finished, then answers `201` with a `download_id`; to watch progress, list active downloads from a separate request while this one is still running.

```bash
KIT="https://${P}-${C}-files-1.${N}.computers.hoody.com"
DIR=/home/user/inbox
curl -sf -X POST "$KIT/api/v1/files$DIR?mkdir=true"
URL='https://httpbin.org/robots.txt'
curl -sf "$KIT$DIR?download=$(printf '%s' "$URL" | jq -sRr @uri)&filename=robots.txt&timeout=15"
# → {"download_id":"…","filename":"robots.txt","path":"…/robots.txt","success":true}
```

**Step 2 — list active** (from a second request while a download runs; a finished one moves to the history). `?downloads` ONLY works on the WebDAV root route — `GET /api/v1/files/<dir>?downloads` ignores the flag and returns a normal listing.

```bash
curl -sf "$KIT$DIR/?downloads"        # active in this dir
curl -sf "$KIT/?download_history"     # global history (across all dirs)
```

### 7. Archive workflow — preview, then selective extract

**Goal:** extract just one subpath of a zip without unpacking the whole archive.

**Step 1 — preview** to see what's inside. `?preview` MUST be empty — `?preview=true` is parsed as the entry name `true` and 404s.

```bash
KIT="https://${P}-${C}-files-1.${N}.computers.hoody.com"
ARCHIVE=/home/user/inbox/hello.zip
curl -sf "$KIT$ARCHIVE?preview" \
  | jq '{format, total_files, total_size, entries: [.entries[] | {path, size, is_dir}]}'
```

**Step 2 — extract a subset.** `?extract=<entry>` selects entries: an exact archive entry name extracts that one file, a directory prefix ending in `/` (`src/`) extracts that subtree, and an empty value extracts everything. There is no glob matching (`src/**` matches nothing). `?dest=` MUST be relative — absolute paths return `400 Absolute destination path not allowed`. Destination is created relative to the archive's parent dir.

```bash
curl -sf "$KIT$ARCHIVE?extract=Hello-World-master/&dest=extracted"
# → {"destination":"/home/user/inbox/extracted","extracted_files":2,...}
curl -sf "$KIT/api/v1/files/home/user/inbox/extracted" | jq -r '.entries[].name'   # via files.get (directory listing on /api/v1/files/{path})
```

**Step 3 — extract a single file to disk.** Pass `?extract=<entry>` with the exact entry name (a bare `?extract_file=` does nothing useful: it falls through to "send whole archive"). The kit writes the matched entry under `?dest=`; without `dest` it creates a directory named after the archive beside it (`hello.zip` → `hello/`, `x.tar.gz` → `x/`) and extracts there.

```bash
curl -sf "$KIT$ARCHIVE?extract=Hello-World-master/README&dest=extracted"
```

### 8. Cross-directory copy + move + chmod (a one-shot deploy)

**Goal:** stage a config in a working dir, copy to the target, set permissions, move the staging file to a backup folder. Uses POST against the copy/move reserved-prefix routes (`/api/v1/files/copy/...`, `/move/...`) and PATCH for chmod/chown (`/api/v1/files/chmod/...`, `/chown/...`).

**Step 1 — copy.** Both `copy_to` and (for move) `move_to` are **query params**, NOT body fields. Add `?overwrite=true` to allow replacing an existing destination.

```bash
KIT="https://${P}-${C}-files-1.${N}.computers.hoody.com"
SRC=/home/user/staging/app.toml
DST=/etc/myapp/app.toml
curl -sf -X POST "$KIT/api/v1/files/copy$SRC?copy_to=$DST&overwrite=true"
# → {"source":"…","destination":"…","success":true}
```

**Step 2 — chmod.** Octal as a query param (`?chmod=600`). Requires chmod enabled by the deployment; Unix-only.

```bash
curl -sf -X PATCH "$KIT/api/v1/files/chmod$DST?chmod=600"
```

**Step 3 — move staging → archive.** Same pattern as copy, but move never replaces an existing destination (409 `DESTINATION_EXISTS`) and takes no `overwrite`: delete the destination first. `?move_to=` is required.

```bash
curl -sf -X POST "$KIT/api/v1/files/move$SRC?move_to=/home/user/archive/app.toml"
```

### 9. Connect a remote backend, mount it as a path, list through both surfaces

**Goal:** attach a remote backend (here `sftp`, with a placeholder host, user and password; `s3`, `drive` and the other types take the same steps with their own config) and surface it as a regular FS path via FUSE. Requires remote backends enabled by the deployment.

**Step 1 — connect.** Each backend has its own `POST /api/v1/backends/<type>` with type-specific config. Returns `201` with `{success, message, data: {id, type, vfs_backend_type, config, mount_paths}}`; the backend id is `data.id` (`config` has credentials stripped).

```bash
KIT="https://${P}-${C}-files-1.${N}.computers.hoody.com"
BID=$(curl -sf -X POST "$KIT/api/v1/backends/sftp" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg pass "$SFTP_PASS" '{host:"sftp.example.com", user:"deploy", pass:$pass, description:"sftp-example"}')" \
  | jq -r '.data.id')
echo "backend=$BID"
curl -sf "$KIT/api/v1/backends/$BID/test" | jq '.status'   # → "connected"
```

**Step 2 — mount.** `mount_path` is resolved against the kit's configured mount directory (default `/hoody/mounts/permanent`): an absolute path must be under it (`400 Mount path must be under the configured mount directory` otherwise), a relative path is joined under it, and an existing non-symlink path returns `409 Mount path already exists and is not a symlink`.

```bash
MID=$(curl -sf -X POST "$KIT/api/v1/mounts" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg b "$BID" '{backend_id:$b, label:"sftp-mount", mount_path:"/hoody/mounts/permanent/sftp-test"}')" \
  | jq -r '.data.id')
echo "mount=$MID"
```

**Step 3 — read through the mount as a regular path.**

```bash
curl -sf "$KIT/api/v1/files/hoody/mounts/permanent/sftp-test" | jq '.entries[].name'
```

**Step 4 — tear down** (in order: unmount, then disconnect).

```bash
curl -sf -X DELETE "$KIT/api/v1/mounts/$MID"
curl -sf -X DELETE "$KIT/api/v1/backends/$BID"
```

### 10. Bulk delete a tree — and verify nothing is left

**Goal:** wipe a working directory and every file under it, then confirm via journal + listing that nothing remains. The recursive delete is not atomic: if it fails partway, the entries already removed stay removed and the rest remain, so always verify.

**Step 1 — DELETE on the directory.** `DELETE /api/v1/files/<dir>` removes recursively. (Reserved-prefix trap: a path like `/api/v1/files/stat/foo` is interpreted as removing `/stat/foo`, NOT a stat call. Always use absolute computer paths.)

```bash
KIT="https://${P}-${C}-files-1.${N}.computers.hoody.com"
DIR=/home/user/files-examples-cleanup
curl -sf -X DELETE "$KIT/api/v1/files$DIR"
# → 204 No Content (no response body)
```

**Step 2 — verify.** A `404` from `GET /api/v1/files/stat/{path}` is what you want. It means the path is not found through this API; it does not by itself prove that no entry remains on disk (a refused symlink also answers `404`).

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$KIT/api/v1/files/stat$DIR"   # → 404
```

**Step 3 — confirm via journal.** Where the journal covers the path, a successful directory delete normally records one `op: "dir_deleted"` entry for the directory itself (no per-path `seq`), not an entry per child; deleting a single file records `op: "delete"`. Recording is best-effort: a delete still succeeds when its entry cannot be written, so an absent entry does not prove the delete failed. Flush first. The journal lists oldest first, so one `limit=10` call returns only the ten oldest matching records and can miss the new `dir_deleted` one: page on with `after_id` (continue from `next_after_id`) until the entry shows up or `has_more` is false.

```bash
curl -sf -X POST "$KIT/api/v1/journal/flush" >/dev/null
curl -sf "$KIT/api/v1/journal?path=$DIR&limit=10" \
  | jq '.entries[] | {id, op, ts}'
```

### 11. Share a folder as a zip — one link, no archive on disk

**Goal:** hand a person (or another program) a folder as one download, without writing a `.zip` into the computer first. The files kit streams a folder as a zip when the bare flag `?zip` follows the folder's path on the REST route: `GET /api/v1/files/<abs dir>?zip`. The link is the kit's capability URL, so whoever holds it can download the folder, subject to the computer's proxy permissions: share it only with people who should see that folder.

Limits: local folders only (a folder of a remote backend, named with `backend`, answers `501`), and only where the deployment enabled archive downloads (the standard `hoody_kit: true` computer image enables them). Where they are off, this route answers `403` with `Archive download not allowed`; any other `403` is an access refusal, not this switch. The WebDAV-style route `GET /<abs dir>?zip` streams the same zip but answers `404` where archive downloads are off, so check and share the REST route. A folder one archive cannot hold whole (more than 1000000 files, more than 10000000 files and folders in all, or folders nested deeper than 50 levels) is refused with `422 ARCHIVE_TOO_LARGE` before anything is sent. A file that cannot be read, or that changes while it is added, is named in a `__hoody-files_zip_errors__.txt` entry at the end of the archive. The archive holds only what the requesting account may read: with per-account path rules, paths outside its rules, and symlinks that lead there, are left out.

**Step 1 — build the link.** Read `project_id`, `id` and `server_name` from the computer, then append the folder's absolute path and `?zip` (no value) to the files kit URL's `/api/v1/files` route.

```bash
KIT="https://${P}-${C}-files-1.${N}.computers.hoody.com"
DIR=/home/user/project
echo "$KIT/api/v1/files$DIR?zip"   # the link to hand over
```

**Step 2 — check it, or download it yourself, on the same route.** A `200` with `Content-Type: application/zip` means the link works. A `403` saying `Archive download not allowed` means archive downloads are off for this kit; a `422` means the folder is too large for one archive (zip a subfolder instead).

```bash
curl -sf -o project.zip "$KIT/api/v1/files$DIR?zip"
unzip -l project.zip | tail -1
```

## Reference

### `archives` (4) — Archive operations - extract, preview, download directories as ZIP

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{archive}?extract` | Extract archive | `?extract*` `?dest` |
| `GET /{archive}?extract_file` | Extract file from archive | `?extract*` `?dest` |
| `GET /{archive}?preview` | Preview archive contents or read file | `?preview` `?contents` |
| `GET /{archive}?view_file` | View file from archive | `?preview*` |

**Param notes:**

- `extract` — Empty for full extraction; path for selective (e.g. "src/" or "lib/") _(on `GET /{archive}?extract`)_
- `dest` — Destination folder, relative to the folder holding the archive. By default, the archive's name is used with its last extension removed, and then a `.tar` left at its end removed too: `release` for `release.zip`, `release.tar.gz` or `release.tar.zip`. Absolute paths and `..` components are refused with 400.
- `archive` — Path to archive file
- `extract` — Path of the file or directory inside the archive to extract (e.g. "src/" or "lib/") _(on `GET /{archive}?extract_file`)_
- `preview` — Empty value lists archive contents; non-empty value reads a specific file from the archive (alias: ?contents) _(on `GET /{archive}?preview`)_
- `contents` — Alias for ?preview
- `preview` — Path of the file inside the archive to view (e.g. "src/" or "README.md") _(on `GET /{archive}?view_file`)_

### `backends` (54) — Backend management - connect, list, test, and disconnect remote cloud storage backends

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/backends/azureblob` | Connect to azureblob backend | `body*` |
| `POST /api/v1/backends/azurefiles` | Connect to azurefiles backend | `body*` |
| `POST /api/v1/backends/b2` | Connect to b2 backend | `body*` |
| `POST /api/v1/backends/box` | Connect to box backend | `body*` |
| `POST /api/v1/backends/cloudinary` | Connect to cloudinary backend | `body*` |
| `POST /api/v1/backends/drive` | Connect to drive backend | `body*` |
| `POST /api/v1/backends/dropbox` | Connect to dropbox backend | `body*` |
| `POST /api/v1/backends/fichier` | Connect to fichier backend | `body*` |
| `POST /api/v1/backends/filefabric` | Connect to filefabric backend | `body*` |
| `POST /api/v1/backends/filescom` | Connect to filescom backend | `body*` |
| `POST /api/v1/backends/ftp` | Connect to ftp backend | `body*` |
| `POST /api/v1/backends/gofile` | Connect to gofile backend | `body*` |
| `POST /api/v1/backends/google-cloud-storage` | Connect to google cloud storage backend | `body*` |
| `POST /api/v1/backends/google-photos` | Connect to google photos backend | `body*` |
| `POST /api/v1/backends/hdfs` | Connect to hdfs backend | `body*` |
| `POST /api/v1/backends/hidrive` | Connect to hidrive backend | `body*` |
| `POST /api/v1/backends/http` | Connect to http backend | `body*` |
| `POST /api/v1/backends/iclouddrive` | Connect to iclouddrive backend | `body*` |
| `POST /api/v1/backends/imagekit` | Connect to imagekit backend | `body*` |
| `POST /api/v1/backends/internetarchive` | Connect to internetarchive backend | `body*` |
| `POST /api/v1/backends/jottacloud` | Connect to jottacloud backend | `body*` |
| `POST /api/v1/backends/koofr` | Connect to koofr backend | `body*` |
| `POST /api/v1/backends/linkbox` | Connect to linkbox backend | `body*` |
| `POST /api/v1/backends/mailru` | Connect to mailru backend | `body*` |
| `POST /api/v1/backends/mega` | Connect to mega backend | `body*` |
| `POST /api/v1/backends/netstorage` | Connect to netstorage backend | `body*` |
| `POST /api/v1/backends/onedrive` | Connect to onedrive backend | `body*` |
| `POST /api/v1/backends/opendrive` | Connect to opendrive backend | `body*` |
| `POST /api/v1/backends/oracleobjectstorage` | Connect to oracleobjectstorage backend | `body*` |
| `POST /api/v1/backends/pcloud` | Connect to pcloud backend | `body*` |
| `POST /api/v1/backends/pikpak` | Connect to pikpak backend | `body*` |
| `POST /api/v1/backends/pixeldrain` | Connect to pixeldrain backend | `body*` |
| `POST /api/v1/backends/premiumizeme` | Connect to premiumizeme backend | `body*` |
| `POST /api/v1/backends/protondrive` | Connect to protondrive backend | `body*` |
| `POST /api/v1/backends/putio` | Connect to putio backend | `body*` |
| `POST /api/v1/backends/qingstor` | Connect to qingstor backend | `body*` |
| `POST /api/v1/backends/quatrix` | Connect to quatrix backend | `body*` |
| `POST /api/v1/backends/s3` | Connect to s3 backend | `body*` |
| `POST /api/v1/backends/seafile` | Connect to seafile backend | `body*` |
| `POST /api/v1/backends/sftp` | Connect to sftp backend | `body*` |
| `POST /api/v1/backends/sharefile` | Connect to sharefile backend | `body*` |
| `POST /api/v1/backends/sia` | Connect to sia backend | `body*` |
| `POST /api/v1/backends/smb` | Connect to smb backend | `body*` |
| `POST /api/v1/backends/sugarsync` | Connect to sugarsync backend | `body*` |
| `POST /api/v1/backends/swift` | Connect to swift backend | `body*` |
| `POST /api/v1/backends/ulozto` | Connect to ulozto backend | `body*` |
| `POST /api/v1/backends/webdav` | Connect to webdav backend | `body*` |
| `POST /api/v1/backends/yandex` | Connect to yandex backend | `body*` |
| `POST /api/v1/backends/zoho` | Connect to zoho backend | `body*` |
| `DELETE /api/v1/backends/{id}` | Disconnect backend | `?uploads` |
| `GET /api/v1/backends/{id}` | Get backend details |  |
| `GET /api/v1/backends` | List all backends |  |
| `GET /api/v1/backends/{id}/test` | Test backend connection |  |
| `PUT /api/v1/backends/{id}` | Update backend credentials | `body*` |

**Param notes:**

- `uploads` — What becomes of what was written on the backend's mounts and is not uploaded yet: keep uploading it (`keep`) or delete it (`discard`; refused with 409 `UPLOADS_DISCARD_SHARED` while a mount is served by the backend's shared connection: remove those mounts first)

**Body shapes:**

- `POST /api/v1/backends/azureblob` body — `{ access_tier: string="", account: string="", archive_tier_delete: bool=false, chunk_size: string="4194304", client_certificate_password: string="", client_id: string="", client_secret: string="", client_send_certificate_chain: bool=false, copy_concurrency: int=512, copy_cutoff: string="8388608", copy_total_concurrency: int=0, decompress: bool=false, delete_snapshots: "" | "include" | "only"="", description: string="", directory_markers: bool=false, disable_checksum: bool=false, disable_instance_discovery: bool=false, encoding: string="21078018", endpoint: string="", env_auth: false=false, key: string="", list_chunk: int=5000, list_parallelism: int=0, memory_pool_flush_time: int=60, memory_pool_use_mmap: bool=false, msi_client_id: string="", msi_mi_res_id: string="", msi_object_id: string="", no_check_container: bool=false, no_head_object: bool=false, password: string="", public_access: string="", sas_url: string="", tenant: string="", upload_concurrency: int=16, upload_cutoff: string="", use_arrow_list: bool=false, use_az: false=false, use_copy_blob: bool=true, use_emulator: false=false, use_msi: false=false, username: string="" }` — azureblob backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - _(42 fields carry longer docs — see the spec shipped as `hoody-sdk/openapi.json` for full field semantics)_
- `POST /api/v1/backends/azurefiles` body — `{ account: string="", chunk_size: string="4194304", client_certificate_password: string="", client_id: string="", client_secret: string="", client_send_certificate_chain: bool=false, description: string="", disable_instance_discovery: bool=false, encoding: string="54634382", endpoint: string="", env_auth: false=false, key: string="", max_stream_size: string="10737418240", msi_client_id: string="", msi_mi_res_id: string="", msi_object_id: string="", password: string="", sas_url: string="", share_name: string="", tenant: string="", upload_concurrency: int=16, use_az: false=false, use_emulator: false=false, use_msi: false=false, username: string="" }` — azurefiles backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `account` — Azure Storage Account Name. Set this to the Azure Storage Account Name in use. Leave blank when using a SAS URL; otherwise it needs to be set.
  - `chunk_size` — Upload chunk size. Note that this is stored in memory and there may be up to `upload_concurrency` chunks of each upload stored at once in memory.
  - `client_certificate_password` — Password for the certificate file (optional). Optionally set this if using Service principal with certificate And the certificate has a password.
  - `client_id` — The ID of the client in use. Set this if using Service principal with client secret; Service principal with certificate; User with username and password
  - `client_secret` — One of the service principal's client secrets Set this if using Service principal with client secret
  - `client_send_certificate_chain` — Send the certificate chain when using certificate auth. Specifies whether an authentication request will include an x5c header to support subject name / issuer based authentication. When set to true, authentication requests include the x5c header. …
  - `description` — Description of the remote.
  - `disable_instance_discovery` — Skip requesting Microsoft Entra instance metadata This should be set true only by applications authenticating in disconnected clouds, or private clouds such as Azure Stack. …
  - `encoding` — The encoding for the backend.
  - `endpoint` — Endpoint for the service. Leave blank normally.
  - `env_auth` — Runtime credentials are not available: leave env_auth false (true is refused with 400) and send the credentials in the request.
  - `key` — Storage Account Shared Key. Leave blank when using a SAS URL.
  - `max_stream_size` — Max size for streamed files. Azure files needs to know in advance how big the file will be. When Hoody doesn't know it uses this value instead. This will be used when Hoody is streaming data, for example when copying a file of unknown length. …
  - `msi_client_id` — Client ID of a user-assigned managed identity. Managed identity authentication is unavailable.
  - `msi_mi_res_id` — Azure resource ID of the user-assigned MSI to use, if any. Leave blank if msi_client_id or msi_object_id specified.
  - `msi_object_id` — Object ID of the user-assigned MSI to use, if any. Leave blank if msi_client_id or msi_mi_res_id specified.
  - `password` — The user's password Set this if using User with username and password
  - `sas_url` — SAS URL for container level access only. Leave blank if using account/key.
  - `share_name` — Azure Files Share Name. This is required and is the name of the share to access.
  - `tenant` — ID of the service principal's tenant. Also called its directory ID. Set this if using Service principal with client secret; Service principal with certificate; User with username and password
  - `upload_concurrency` — Concurrency for multipart uploads. This is the number of chunks of the same file that are uploaded concurrently. If you are uploading small numbers of large files over high-speed links and these uploads do not fully utilize your bandwidth, then increasing this may help to speed up the transfers. …
  - `use_az` — Azure CLI authentication is not available: leave use_az false (true is refused with 400).
  - `use_emulator` — The storage emulator is not available: leave use_emulator false (true is refused with 400).
  - `use_msi` — Managed identity authentication is not available: leave use_msi false (true is refused with 400).
  - `username` — User name (usually an email address) Set this if using User with username and password
- `POST /api/v1/backends/b2` body — `{ account*: string="", chunk_size: string="100663296", copy_cutoff: string="4294967296", description: string="", disable_checksum: bool=false, download_auth_duration: int=604800, download_url: string="", encoding: string="50438146", endpoint: string="", hard_delete: bool=false, key*: string="", lifecycle: int=0, memory_pool_flush_time: int=60, memory_pool_use_mmap: bool=false, sse_customer_algorithm: string="", sse_customer_key: string="", sse_customer_key_base64: string="", sse_customer_key_md5: string="", test_mode: string="", upload_concurrency: int=4, upload_cutoff: string="209715200", version_at: string="0001-01-01T00:00:00Z", versions: bool=false }` — b2 backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - _(23 fields carry longer docs — see the spec shipped as `hoody-sdk/openapi.json` for full field semantics)_
- `POST /api/v1/backends/box` body — `{ access_token: string="", auth_url: string="", box_sub_type: string="user", client_credentials: bool=false, client_id: string="", client_secret: string="", commit_retries: int=100, description: string="", encoding: string="52535298", impersonate: string="", list_chunk: int=1000, owned_by: string="", root_folder_id: string="0", token: string="", token_url: string="", upload_cutoff: string="52428800" }` — box backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `access_token` — Box App Primary Access Token Leave blank normally.
  - `auth_url` — Auth server URL. Leave blank to use the provider defaults.
  - `client_credentials` — Use client credentials OAuth flow. This will use the OAUTH2 client Credentials Flow as described in RFC 6749. Note that this option is NOT supported by all backends.
  - `client_id` — OAuth Client Id. Leave blank normally.
  - `client_secret` — OAuth Client Secret. Leave blank normally.
  - `commit_retries` — Max number of times to try committing a multipart file.
  - `impersonate` — Impersonate this user ID when using a service account. Setting this flag allows Hoody, when using a JWT service account, to act on behalf of another user by setting the as-user header. The user ID is the Box identifier for a user. …
  - `list_chunk` — Size of listing chunk 1-1000.
  - `owned_by` — Only show items owned by the login (email address) passed in.
  - `root_folder_id` — Fill in for Hoody to use a non root folder as its starting point.
  - `token` — … Needed to connect: the connection lists the remote's root before it is kept, which needs a token. client_id and client_secret are needed only when the token was made with your own OAuth client.
  - `token_url` — Token server url. Leave blank to use the provider defaults.
  - `upload_cutoff` — Cutoff for switching to multipart upload (>= 50 MiB).
- `POST /api/v1/backends/cloudinary` body — `{ adjust_media_files_extensions: bool=true, api_key*: string="", api_secret*: string="", cloud_name*: string="", description: string="", encoding: string="52543246", eventually_consistent_delay: int=0, media_extensions: string="3ds,3g2,3gp,ai,arw,avi,avif,bmp,bw,cr2,cr3,djvu,dng,eps3,fbx,flif,flv,gif,glb,gltf,hdp,heic,heif,ico,indd,jp2,jpe,jpeg,jpg,jxl,jxr,m2ts,mov,mp4,mpeg,mts,mxf,obj,ogv,pdf,ply,png,psd,svg,tga,tif,tiff,ts,u3ma,usdz,wdp,webm,webp,wmv", upload_prefix: string="", upload_preset: string="" }` — cloudinary backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `adjust_media_files_extensions` — Cloudinary handles media formats as a file attribute and strips it from the name, which is unlike most other file systems
  - `api_key` — Cloudinary API Key
  - `api_secret` — Cloudinary API Secret
  - `cloud_name` — Cloudinary Environment Name
  - `eventually_consistent_delay` — Wait N seconds for eventual consistency of the databases that support the backend operation
  - `media_extensions` — Cloudinary supported media extensions
  - `upload_prefix` — Specify the API endpoint for environments out of the US
  - `upload_preset` — Upload Preset to select asset manipulation on upload
- `POST /api/v1/backends/drive` body — `{ acknowledge_abuse: bool=false, allow_import_name_change: bool=false, alternate_export: bool=false, auth_owner_only: bool=false, auth_url: string="", chunk_size: string="8388608", client_credentials: bool=false, client_id: string="", client_secret: string="", copy_shortcut_content: bool=false, description: string="", disable_http2: bool=true, encoding: string="16777216", env_auth: false=false, export_formats: string="docx,xlsx,pptx,svg", fast_list_bug_fix: bool=true, formats: string="", impersonate: string="", import_formats: string="", keep_revision_forever: bool=false, list_chunk: int=1000, metadata_enforce_expansive_access: bool=false, metadata_labels: string="0", metadata_owner: string="1", metadata_permissions: string="0", pacer_burst: int=100, pacer_min_sleep: int=0, resource_key: string="", root_folder_id: string="", scope: string="", server_side_across_configs: bool=false, service_account_credentials: string="", shared_with_me: bool=false, show_all_gdocs: bool=false, size_as_quota: bool=false, skip_checksum_gphotos: bool=false, skip_dangling_shortcuts: bool=false, skip_gdocs: bool=false, skip_shortcuts: bool=false, starred_only: bool=false, stop_on_download_limit: bool=false, stop_on_upload_limit: bool=false, team_drive: string="", token: string="", token_url: string="", trashed_only: bool=false, upload_cutoff: string="8388608", use_created_date: bool=false, use_shared_date: bool=false, use_trash: bool=true, v2_download_min_size: string="-1" }` — drive backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - _(51 fields carry longer docs — see the spec shipped as `hoody-sdk/openapi.json` for full field semantics)_
- `POST /api/v1/backends/dropbox` body — `{ auth_url: string="", batch_commit_timeout: int=600, batch_mode: string="sync", batch_size: int=0, batch_timeout: int=0, chunk_size: string="50331648", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="52469762", export_formats: string="html,md", impersonate: string="", impersonate_admin: string="", pacer_min_sleep: int=0, root_namespace: string="", shared_files: bool=false, shared_folders: bool=false, show_all_exports: bool=false, skip_exports: bool=false, skip_shared_folders: bool=false, skip_unowned_folders: bool=false, token: string="", token_url: string="" }` — dropbox backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - _(24 fields carry longer docs — see the spec shipped as `hoody-sdk/openapi.json` for full field semantics)_
- `POST /api/v1/backends/fichier` body — `{ api_key: string="", cdn: bool=false, description: string="", encoding: string="52666494", file_password: string="", folder_password: string="", shared_folder: string="" }` — fichier backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `api_key` — Your API Key, get it from https://1fichier.com/console/params.pl.
  - `cdn` — Set if you wish to use CDN download links.
  - `file_password` — If you want to download a shared file that is password protected, add this parameter.
  - `folder_password` — If you want to list the files in a shared folder that is password protected, add this parameter.
  - `shared_folder` — If you want to download a shared folder, add this parameter.
- `POST /api/v1/backends/filefabric` body — `{ description: string="", encoding: string="50429954", permanent_token: string="", root_folder_id: string="", token: string="", token_expiry: string="", url*: string="", version: string="" }` — filefabric backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `permanent_token` — Permanent Authentication Token. A Permanent Authentication Token can be created in the Enterprise File Fabric, on the users Dashboard under Security, there is an entry you'll see called "My Authentication Tokens". Click the Manage button to create one. …
  - `root_folder_id` — ID of the root folder. Leave blank normally. Fill in to make Hoody start with directory of a given ID.
  - `token` — Session Token. This is a session token which Hoody caches in the config file. It is usually valid for 1 hour. Don't set this value - Hoody will set it automatically.
  - `token_expiry` — Token expiry time. Don't set this value - Hoody will set it automatically.
  - `url` — URL of the Enterprise File Fabric to connect to.
  - `version` — Version read from the file fabric. Don't set this value - Hoody will set it automatically.
- `POST /api/v1/backends/filescom` body — `{ api_key: string="", description: string="", encoding: string="60923906", password: string="", site: string="", username: string="" }` — filescom backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `api_key` — The API key used to authenticate with Files.com.
  - `password` — The password used to authenticate with Files.com.
  - `site` — Your site subdomain (e.g. mysite) or custom domain (e.g. myfiles.customdomain.com).
  - `username` — The username used to authenticate with Files.com.
- `POST /api/v1/backends/ftp` body — `{ allow_insecure_tls_ciphers: bool=false, ask_password: bool=false, close_timeout: int=60, concurrency: int=0, description: string="", disable_epsv: bool=false, disable_mlsd: bool=false, disable_tls13: bool=false, disable_utf8: bool=false, encoding: string="35749890", explicit_tls: bool=false, force_list_hidden: bool=false, host*: string="", http_proxy: string="", idle_timeout: int=60, no_check_upload: bool=false, pass: string="", port: int=21, shut_timeout: int=60, socks_proxy: string="", tls: bool=false, tls_cache_size: int=32, user: string, writing_mdtm: bool=false }` — ftp backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `allow_insecure_tls_ciphers` — Allow insecure TLS ciphers Setting this flag will allow the usage of the following TLS ciphers in addition to the secure defaults: TLS_RSA_WITH_AES_128_GCM_SHA256
  - `ask_password` — Password prompting is unavailable. Leave ask_password false and supply pass when the server requires a password.
  - `close_timeout` — Maximum time to wait for a response to close. (in seconds)
  - `concurrency` — Maximum number of FTP simultaneous connections, 0 for unlimited. Setting it can make transfers stall, so use it with care.
  - `disable_epsv` — Disable using EPSV even if server advertises support.
  - `disable_mlsd` — Disable using MLSD even if server advertises support.
  - `disable_tls13` — Disable TLS 1.3 (workaround for FTP servers with buggy TLS)
  - `disable_utf8` — Disable using UTF-8 even if server advertises support.
  - `explicit_tls` — Use Explicit FTPS (FTP over TLS). When using explicit FTP over TLS the client explicitly requests security from the server in order to upgrade a plain text connection to an encrypted one. Cannot be used in combination with implicit FTPS.
  - `force_list_hidden` — Use LIST -a to force listing of hidden files and folders. This will disable the use of MLSD.
  - `host` — FTP host to connect to. E.g. "ftp.example.com".
  - `http_proxy` — URL for HTTP CONNECT proxy Set this to a URL for an HTTP proxy which supports the HTTP CONNECT verb. Supports the format http://host:port, http://host:port, http://host. Example: http://proxyhostname.example.com:8000
  - `idle_timeout` — Max time before closing idle connections. If no connections have been returned to the connection pool in the time given, Hoody will empty the connection pool. Set to 0 to keep connections indefinitely. (in seconds)
  - `no_check_upload` — Don't check the upload is OK Normally Hoody will try to check the upload exists after it has uploaded a file to make sure the size and modification time are as expected. This flag stops Hoody doing these checks. This enables uploading to folders which are write only.
  - `pass` — FTP password.
  - `port` — FTP port number.
  - `shut_timeout` — Maximum time to wait for data connection closing status. (in seconds)
  - `socks_proxy` — Socks 5 proxy host. Supports the format user:pass@host:port, user@host:port, host:port. Example: myUser:myPass@localhost:9005
  - `tls` — Use Implicit FTPS (FTP over TLS). When using implicit FTP over TLS the client connects using TLS right from the start which breaks compatibility with non-TLS-aware servers. This is usually served over port 990 rather than port 21. Cannot be used in combination with explicit FTPS.
  - `tls_cache_size` — Size of TLS session cache for all control and data connections. TLS cache allows to resume TLS sessions and reuse PSK between connections. Increase if default size is not enough resulting in TLS resumption errors. Enabled by default. Use 0 to disable.
  - `user` — FTP username. If left out, the name of the account the Hoody Files service runs as.
  - `writing_mdtm` — Use MDTM to set modification time (VsFtpd quirk)
- `POST /api/v1/backends/gofile` body — `{ access_token: string="", account_id: string="", description: string="", encoding: string="323331982", list_chunk: int=1000, root_folder_id: string="" }` — gofile backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `access_token` — API Access token You can get this from the web control panel.
  - `account_id` — Account ID Leave this blank normally, Hoody will fill it in automatically.
  - `list_chunk` — Number of items to list in each call
  - `root_folder_id` — ID of the root folder Leave this blank normally, Hoody will fill it in automatically. If you want Hoody to be restricted to a particular folder you can fill it in - see the docs for more info.
- `POST /api/v1/backends/google-cloud-storage` body — `{ access_token: string="", anonymous: bool=false, auth_url: string="", bucket_acl: string="", bucket_policy_only: bool=false, client_credentials: bool=false, client_id: string="", client_secret: string="", decompress: bool=false, description: string="", directory_markers: bool=false, encoding: string="50348034", endpoint: string="", env_auth: false=false, location: string="", no_check_bucket: bool=false, object_acl: string="", project_number: string="", service_account_credentials: string="", storage_class: string="", token: string="", token_url: string="", user_project: string="" }` — google cloud storage backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `access_token` — Short-lived access token. Leave blank normally. Needed only if you want use short-lived access token instead of interactive login.
  - `anonymous` — Access public buckets and objects without credentials. Set to 'true' if you just want to download files and don't configure credentials.
  - `bucket_acl` — Access Control List for new buckets.
  - `bucket_policy_only` — Access checks should use bucket-level IAM policies. If you want to upload objects to a bucket with Bucket Policy Only set then you will need to set this. …
  - `decompress` — If set this will decompress gzip encoded objects. It is possible to upload objects to GCS with "Content-Encoding: gzip" set. Normally Hoody will download these files as compressed objects. If this flag is set then Hoody will decompress these files with "Content-Encoding: gzip" as they are …
  - `directory_markers` — Upload an empty object with a trailing slash when a new directory is created Empty folders are unsupported for bucket based remotes, this option creates an empty object ending with "/", to persist the folder.
  - `endpoint` — Custom endpoint for the storage API. … When using a custom endpoint that includes a subpath (e.g. example.org/custom/endpoint), the subpath will be ignored during upload operations due to a limitation in the underlying Google API Go client library. …
  - `location` — Location for the newly created buckets.
  - `no_check_bucket` — If set, don't attempt to check the bucket exists or create it. This can be useful when trying to minimise the number of transactions Hoody does if you know the bucket exists already.
  - `object_acl` — Access Control List for new objects.
  - `project_number` — Project number. Optional - needed only for list/create/delete buckets - see your developer console.
  - `service_account_credentials` — Service Account Credentials JSON blob. Leave blank normally. Needed only if you want use SA instead of interactive login.
  - `storage_class` — The storage class to use when storing objects in Google Cloud Storage.
  - `token` — OAuth token, as a JSON object with access_token, token_type, refresh_token and expiry, sent as a string, curly brackets included. Needed to connect unless you send service_account_credentials or access_token instead.
  - `user_project` — User project. Optional - needed only for requester pays.
- `POST /api/v1/backends/google-photos` body — `{ auth_url: string="", batch_commit_timeout: int=600, batch_mode: string="sync", batch_size: int=0, batch_timeout: int=0, client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50348034", include_archived: bool=false, proxy: string="", read_only: bool=false, read_size: bool=false, start_year: int=2000, token: string="", token_url: string="" }` — google photos backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `batch_commit_timeout` — Max time to wait for a batch to finish committing. (no longer used) (in seconds)
  - `batch_mode` — Upload file batching sync|async|off. This sets the batch mode used by Hoody. …
  - `batch_size` — Max number of files in upload batch. This sets the batch size of files to upload. It has to be less than 50. …
  - `batch_timeout` — Max time to allow an idle upload batch before uploading. If an upload batch is idle for more than this long then it will be uploaded. …
  - `client_id` — OAuth Client Id. Creating your own is now strongly recommended. If you leave this blank Hoody uses a shared client_id which is being retired and will stop working during 2026.
  - `client_secret` — OAuth Client Secret. Leave blank to use Hoody's shared client_id. If you created your own client_id then enter its client secret here.
  - `include_archived` — Also view and download archived media. By default, Hoody does not request archived media. Thus, when syncing, archived media is not visible in directory listings or transferred. Note that media in albums is always visible and synced, no matter their archive status. …
  - `proxy` — Use the gphotosdl proxy for downloading the full resolution images The Google API will deliver images and video which aren't full resolution, and/or have EXIF data missing. However if you use the gphotosdl proxy then you can download original, unchanged images. …
  - `read_only` — Set to make the Google Photos backend read only. If you choose read only then Hoody will only request read only access to your photos, otherwise Hoody will request full access.
  - `read_size` — Set to read the size of media items. Normally Hoody does not read the size of media items since this takes another transaction. This isn't necessary for syncing. …
  - `start_year` — Year limits the photos to be downloaded to those which are uploaded after the given year.
- `POST /api/v1/backends/hdfs` body — `{ data_transfer_protection: string="", description: string="", encoding: string="50430082", namenode*: string="", username: string="" }` — hdfs backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `data_transfer_protection` — Kerberos data transfer protection: authentication|integrity|privacy. Specifies whether or not authentication, data signature integrity checks, and wire encryption are required when communicating with the datanodes. … Used only with KERBEROS enabled.
  - `namenode` — Hadoop name nodes and ports. E.g. "namenode-1:8020,namenode-2:8020,..." to connect to host namenodes at port 8020.
  - `username` — Hadoop user name.
- `POST /api/v1/backends/hidrive` body — `{ auth_url: string="", chunk_size: string="50331648", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", disable_fetching_member_count: bool=false, encoding: string="33554434", endpoint: string="https://api.hidrive.strato.com/2.1", root_prefix: string="/", scope_access: string="rw", scope_role: string="user", token: string="", token_url: string="", upload_concurrency: int=4, upload_cutoff: string="100663296" }` — hidrive backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `chunk_size` — Chunksize for chunked uploads. … That is the maximum amount of bytes a single upload-operation will support. …
  - `disable_fetching_member_count` — Do not fetch number of objects in directories unless it is absolutely necessary. Requests may be faster if the number of objects in subdirectories is not fetched.
  - `endpoint` — Endpoint for the service. This is the URL that API-calls will be made to.
  - `root_prefix` — The root/parent folder for all paths. Fill in to use the specified folder as the parent for all paths given to the remote. This way Hoody can use any folder as its starting point.
  - `scope_access` — Access permissions that Hoody should use when requesting access from HiDrive.
  - `scope_role` — User-level that Hoody should use when requesting access from HiDrive.
  - `upload_concurrency` — Concurrency for chunked uploads. This is the upper limit for how many transfers for the same file are running concurrently. Setting this above to a value smaller than 1 will cause uploads to deadlock. …
  - `upload_cutoff` — Cutoff/Threshold for chunked uploads. … That is the maximum amount of bytes a single upload-operation will support. …
- `POST /api/v1/backends/http` body — `{ description: string="", headers: string="", no_escape: bool=false, no_head: bool=false, no_slash: bool=false, url*: string="" }` — http backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `headers` — Set HTTP headers for all transactions. … When headers are set, a redirect from https to http is refused as it would send them in cleartext.
  - `no_escape` — Do not escape URL metacharacters in path names.
  - `no_head` — Don't use HEAD requests. HEAD requests are mainly used to find file sizes in dir listing. If your site is being very slow to load then you can try this option. …
  - `no_slash` — Set this if the site doesn't end directories with /. Use this if your target website does not use / on the end of directories. A / on the end of a path is how Hoody normally tells the difference between files and directories. …
  - `url` — URL of HTTP host to connect to. E.g. "https://example.com", or "https://example.com" to use a username and password.
- `POST /api/v1/backends/iclouddrive` body — `{ apple_id*: string="", client_id: string="d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d", cookies: string="", description: string="", encoding: string="50438146", password*: string="", service: string="drive", trust_token: string="" }` — iclouddrive backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `apple_id` — Apple ID.
  - `client_id` — Client ID for iCloud API access.
  - `cookies` — Session cookies.
  - `password` — Password.
  - `service` — iCloud service to use.
  - `trust_token` — Trust token for session authentication.
- `POST /api/v1/backends/imagekit` body — `{ description: string="", encoding: string="117553486", endpoint*: string="", only_signed: bool=false, private_key*: string="", public_key*: string="", upload_tags: string="", versions: bool=false }` — imagekit backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `endpoint` — You can find your ImageKit.io URL endpoint in your [dashboard](https://imagekit.io/dashboard/developer/api-keys)
  - `only_signed` — If you have configured `Restrict unsigned image URLs` in your dashboard settings, set this to true.
  - `private_key` — You can find your ImageKit.io private key in your [dashboard](https://imagekit.io/dashboard/developer/api-keys)
  - `public_key` — You can find your ImageKit.io public key in your [dashboard](https://imagekit.io/dashboard/developer/api-keys)
  - `upload_tags` — Tags to add to the uploaded files, e.g. "tag1,tag2".
  - `versions` — Include old versions in directory listings.
- `POST /api/v1/backends/internetarchive` body — `{ access_key_id: string="", description: string="", disable_checksum: bool=true, encoding: string="50446342", endpoint: string="https://s3.us.archive.org", front_endpoint: string="https://archive.org", item_derive: bool=true, item_metadata: string="", secret_access_key: string="", wait_archive: int=0 }` — internetarchive backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `access_key_id` — IAS3 Access Key. Leave blank for anonymous access. You can find one here: https://archive.org/account/s3.php
  - `disable_checksum` — Don't ask the server to test against MD5 checksum calculated by Hoody. Normally Hoody will calculate the MD5 checksum of the input before uploading it so it can ask the server to check the object against checksum. …
  - `endpoint` — IAS3 Endpoint. Leave blank for default value.
  - `front_endpoint` — Host of InternetArchive Frontend. Leave blank for default value.
  - `item_derive` — Whether to trigger derive on the IA item or not. If set to false, the item will not be derived by IA upon upload. The derive process produces a number of secondary files from an upload to make an upload more usable on the web. …
  - `item_metadata` — Metadata to be set on the IA item. Format is key=value and the 'x-archive-meta-' prefix is automatically added.
  - `secret_access_key` — IAS3 Secret Key (password). Leave blank for anonymous access.
  - `wait_archive` — Timeout for waiting the server's processing tasks (specifically archive and book_op) to finish. Only enable if you need to be guaranteed to be reflected after write operations. 0 to disable waiting. No errors to be thrown in case of timeout. (in seconds)
- `POST /api/v1/backends/jottacloud` body — `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50435982", hard_delete: bool=false, md5_memory_limit: string="10485760", no_versions: bool=false, token: string="", token_url: string="", trashed_only: bool=false, upload_resume_limit: string="10485760" }` — jottacloud backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `hard_delete` — Delete files permanently rather than putting them into the trash.
  - `md5_memory_limit` — Files bigger than this will be cached on disk to calculate the MD5 if required.
  - `no_versions` — Avoid server side versioning by deleting files and recreating files instead of overwriting them.
  - `trashed_only` — Only show files that are in the trash. This will show trashed files in their original directory structure.
  - `upload_resume_limit` — Files bigger than this can be resumed if the upload fail's.
- `POST /api/v1/backends/koofr` body — `{ description: string="", encoding: string="50438146", endpoint*: string="", mountid: string="", password*: string="", provider: string="", setmtime: bool=true, user*: string="" }` — koofr backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `endpoint` — The Koofr API endpoint to use.
  - `mountid` — Mount ID of the mount to use. If omitted, the primary mount is used.
  - `password` — Password generated in your storage provider's settings.
  - `provider` — Choose your storage provider.
  - `setmtime` — Does the backend support setting modification time. Set this to false if you use a mount ID that points to a Dropbox or Amazon Drive backend.
  - `user` — Your user name.
- `POST /api/v1/backends/linkbox` body — `{ description: string="", email*: string="", password*: string="", token*: string="", web_token: string="" }` — linkbox backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `email` — Email for login
  - `password` — Password for login
  - `token` — Token from https://www.linkbox.to/admin/account
  - `web_token` — Web API login token - set automatically.
- `POST /api/v1/backends/mailru` body — `{ auth_url: string="", check_hash: bool=true, client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50440078", pass*: string="", speedup_enable: bool=true, speedup_file_patterns: string="*.mkv,*.avi,*.mp4,*.mp3,*.zip,*.gz,*.rar,*.pdf", speedup_max_disk: string="3221225472", speedup_max_memory: string="33554432", token: string="", token_url: string="", user*: string="", user_agent: string="" }` — mailru backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `check_hash` — What should copy do if file checksum is mismatched or invalid.
  - `pass` — Password. This must be an app password - Hoody will not work with your normal password. See the Configuration section in the docs for how to make an app password.
  - `speedup_enable` — Skip full upload if there is another file with same data hash. … Please note that Hoody may need local memory and disk space to calculate content hash in advance and decide whether full upload is required. …
  - `speedup_file_patterns` — Comma separated list of file name patterns eligible for speedup (put by hash). Patterns are case insensitive and can contain '*' or '?' meta characters.
  - `speedup_max_disk` — This option allows you to disable speedup (put by hash) for large files. Reason is that preliminary hashing can exhaust your RAM or disk space.
  - `speedup_max_memory` — Files larger than the size given below will always be hashed on disk.
  - `user` — User name (usually email).
  - `user_agent` — HTTP user agent used internally by client. Defaults to "Hoody/VERSION" or "--user-agent" provided on command line.
- `POST /api/v1/backends/mega` body — `{ 2fa: string="", debug: bool=false, description: string="", encoding: string="50331650", hard_delete: bool=false, master_key: string="", pass: string="", password: string, session_id: string="", use_https: bool=false, user*: string="" } (at least one of: pass | password required)` — mega backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `2fa` — The 2FA code of your MEGA account if the account is set up with one
  - `debug` — Output more debug from Mega. If this flag is set (along with -vv) it will print further debugging information from the mega backend.
  - `hard_delete` — Delete files permanently rather than putting them into the trash. Normally the mega backend will put all deletions into the trash rather than permanently deleting them. If you specify this then Hoody will permanently delete objects instead.
  - `master_key` — Master key (internal use only)
  - `pass` — Password.
  - `password` — Another name for pass. An empty value is ignored; a value that differs from a non-empty pass is refused with 400.
  - `session_id` — Session (internal use only)
  - `use_https` — Use HTTPS for transfers. MEGA uses plain text HTTP connections by default. Some ISPs throttle HTTP connections, this causes transfers to become very slow. Enabling this will force MEGA to use HTTPS for all transfers. HTTPS is normally not necessary since all data is already encrypted anyway. …
  - `user` — User name.
- `POST /api/v1/backends/netstorage` body — `{ account*: string="", description: string="", host*: string="", protocol: string="https", secret*: string="" }` — netstorage backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `account` — Set the NetStorage account name
  - `host` — Domain+path of NetStorage host to connect to. Format should be `<domain>/<internal folders>`
  - `protocol` — Select between HTTP or HTTPS protocol. Most users should choose HTTPS, which is the default. HTTP is provided primarily for debugging purposes.
  - `secret` — Set the NetStorage account secret/G2O key for authentication. Please choose the 'y' option to set your own password then enter your secret.
- `POST /api/v1/backends/onedrive` body — `{ access_scopes: string="Files.Read Files.ReadWrite Files.Read.All Files.ReadWrite.All Sites.Read.All offline_access", auth_url: string="", av_override: bool=false, chunk_size: string="10485760", client_credentials: bool=false, client_id: string="", client_secret: string="", delta: bool=false, description: string="", disable_site_permission: bool=false, drive_id: string="", drive_type: string="", encoding: string="57386894", expose_onenote_files: bool=false, hard_delete: bool=false, hash_type: string="auto", link_password: string="", link_scope: string="anonymous", link_type: string="view", list_chunk: int=1000, metadata_permissions: string="0", no_versions: bool=false, region: string="global", root_folder_id: string="", server_side_across_configs: bool=false, tenant: string="", tenant_url: string="", token: string="", token_url: string="", upload_cutoff: string="-1" }` — onedrive backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - _(30 fields carry longer docs — see the spec shipped as `hoody-sdk/openapi.json` for full field semantics)_
- `POST /api/v1/backends/opendrive` body — `{ access: string="private", chunk_size: string="10485760", description: string="", encoding: string="62007182", password*: string="", username*: string="" }` — opendrive backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `access` — Files and folders will be uploaded with this access permission (default private)
  - `chunk_size` — Files will be uploaded in chunks this size. Note that these chunks are buffered in memory so increasing them will increase memory use.
  - `username` — Username.
- `POST /api/v1/backends/oracleobjectstorage` body — `{ attempt_resume_upload: bool=false, chunk_size: string="5242880", compartment: string="", copy_cutoff: string="4999610368", copy_timeout: int=60, decompress: bool=false, description: string="", disable_checksum: bool=false, encoding: string="50331650", endpoint: string="", leave_parts_on_error: bool=false, max_upload_parts: int=10000, namespace*: string="", no_check_bucket: bool=false, provider*: "no_auth"="no_auth", region*: string="", sse_customer_algorithm: string="", sse_customer_key: string="", sse_customer_key_sha256: string="", sse_kms_key_id: string="", storage_tier: string="Standard", upload_concurrency: int=10, upload_cutoff: string="209715200" }` — oracleobjectstorage backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - _(23 fields carry longer docs — see the spec shipped as `hoody-sdk/openapi.json` for full field semantics)_
- `POST /api/v1/backends/pcloud` body — `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50438146", hostname: string="api.pcloud.com", password: string="", root_folder_id: string="d0", token: string="", token_url: string="", username: string="" }` — pcloud backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `hostname` — Hostname to connect to. This is normally set when Hoody initially does the oauth connection, however you will need to set it by hand if the token was obtained elsewhere.
  - `password` — Your pcloud password.
  - `username` — Your pcloud username. This is only required when you want to use the cleanup command. Due to a bug in the pcloud API the required API does not support OAuth authentication so we have to rely on user password authentication for it.
- `POST /api/v1/backends/pikpak` body — `{ chunk_size: string="5242880", description: string="", device_id: string="", encoding: string="56829838", hash_memory_limit: string="10485760", no_media_link: bool=false, pass: string="", root_folder_id: string="", trashed_only: bool=false, upload_concurrency: int=4, upload_cutoff: string="209715200", use_trash: bool=true, user: string="", user_agent: string="Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0" }` — pikpak backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `chunk_size` — Chunk size for multipart uploads. Large files will be uploaded in chunks of this size. Note that this is stored in memory and there may be up to `upload_concurrency` chunks of each upload stored at once in memory. …
  - `device_id` — Device ID used for authorization.
  - `hash_memory_limit` — Files bigger than this will be cached on disk to calculate hash if required.
  - `no_media_link` — Use original file links instead of media links. This avoids issues caused by invalid media links, but may reduce download speeds.
  - `pass` — Pikpak password.
  - `root_folder_id` — ID of the root folder. Leave blank normally. Fill in for Hoody to use a non root folder as its starting point.
  - `upload_concurrency` — Concurrency for multipart uploads. This is the number of chunks of the same file that are uploaded concurrently for multipart uploads. Note that chunks are stored in memory and there may be up to `upload_concurrency` chunks of each upload stored at once in memory. …
  - `upload_cutoff` — Cutoff for switching to chunked upload. Any files larger than this will be uploaded in chunks of chunk_size. The minimum is 0 and the maximum is 5 GiB.
  - `use_trash` — Send files to the trash instead of deleting permanently. Defaults to true, namely sending files to the trash. Send `use_trash: false` to delete files permanently instead.
  - `user` — Pikpak username.
  - `user_agent` — HTTP user agent for pikpak. Defaults to "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0"; send user_agent to override it.
- `POST /api/v1/backends/pixeldrain` body — `{ api_key: string="", api_url: string="https://pixeldrain.com/api", description: string="", root_folder_id: string="me" }` — pixeldrain backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `api_key` — API key for your pixeldrain account. Found on https://pixeldrain.com/user/api_keys.
  - `api_url` — The API endpoint to connect to. In the vast majority of cases it's fine to leave this at default. It is only intended to be changed for testing purposes.
  - `root_folder_id` — Root of the filesystem to use. Set to 'me' to use your personal filesystem. Set to a shared directory ID to use a shared directory.
- `POST /api/v1/backends/premiumizeme` body — `{ api_key: string="", auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50438154", token: string="", token_url: string="" }` — premiumizeme backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `api_key` — API Key. This is not normally used - use oauth instead.
- `POST /api/v1/backends/protondrive` body — `{ 2fa: string="", app_version: string="", client_access_token: string="", client_refresh_token: string="", client_salted_key_pass: string="", client_uid: string="", description: string="", enable_caching: bool=true, encoding: string="52559874", mailbox_password: string="", original_file_size: bool=true, otp_secret_key: string="", password: string="", replace_existing_draft: bool=false, username: string="" }` — protondrive backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `2fa` — The 2FA code The 2FA code of your proton drive account if the account is set up with two-factor authentication
  - `app_version` — The app version string The app version string identifies the client that is currently performing the API request. Third-party Proton Drive integrations should use the form external-drive-<project>@<version>. If this option is left empty, Hoody derives a compliant value from its own version. …
  - `client_access_token` — Client access token key (internal use only)
  - `client_refresh_token` — Client refresh token key (internal use only)
  - `client_salted_key_pass` — Client salted key pass key (internal use only)
  - `client_uid` — Client uid key (internal use only)
  - `enable_caching` — Caches the files and folders metadata to reduce API calls Notice: If you are mounting ProtonDrive as a VFS, please disable this feature, as the current implementation doesn't update or clear the cache when there are external changes. …
  - `mailbox_password` — The mailbox password of your two-password proton account. For more information regarding the mailbox password, please check the following official knowledge base article: https://proton.me/support/the-difference-between-the-mailbox-password-and-login-password
  - `original_file_size` — Return the file size before encryption The size of the encrypted file will be different from (bigger than) the original file size. …
  - `otp_secret_key` — The OTP secret key The OTP secret key of your proton drive account if the account is set up with two-factor authentication
  - `password` — The password of your proton account.
  - `replace_existing_draft` — Create a new revision when filename conflict is detected When a file upload is cancelled or failed before completion, a draft will be created and the subsequent upload of the same file to the same location will be reported as a conflict. …
  - `username` — The username of your proton account
- `POST /api/v1/backends/putio` body — `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50438146", token: string="", token_url: string="" }` — putio backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
- `POST /api/v1/backends/qingstor` body — `{ access_key_id: string="", chunk_size: string="4194304", connection_retries: int=3, description: string="", encoding: string="16842754", endpoint: string="", env_auth: false=false, secret_access_key: string="", upload_concurrency: int=1, upload_cutoff: string="209715200", zone: string="" }` — qingstor backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `access_key_id` — QingStor Access Key ID. Leave blank for anonymous access. Runtime credentials are not available.
  - `chunk_size` — Chunk size to use for uploading. When uploading files larger than upload_cutoff they will be uploaded as multipart uploads using this chunk size. Note that `upload_concurrency` chunks of this size are buffered in memory per transfer. …
  - `connection_retries` — Number of connection retries.
  - `endpoint` — Enter an endpoint URL to connection QingStor API. Leave blank will use the default value "https://qingstor.com:443".
  - `secret_access_key` — QingStor Secret Access Key (password). Leave blank for anonymous access. Runtime credentials are not available.
  - `upload_concurrency` — Concurrency for multipart uploads. This is the number of chunks of the same file that are uploaded concurrently. NB if you set this to > 1 then the checksums of multipart uploads become corrupted (the uploads themselves are not corrupted though). …
  - `zone` — Zone to connect to. Default is "pek3a".
- `POST /api/v1/backends/quatrix` body — `{ api_key*: string="", description: string="", effective_upload_time: string="4s", encoding: string="50438146", hard_delete: bool=false, host*: string="", maximal_summary_chunk_size: string="100000000", minimal_chunk_size: string="10000000", skip_project_folders: bool=false }` — quatrix backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `api_key` — API key for accessing Quatrix account
  - `effective_upload_time` — Wanted upload time for one chunk
  - `hard_delete` — Delete files permanently rather than putting them into the trash
  - `host` — Host name of Quatrix account
  - `maximal_summary_chunk_size` — The maximal summary for all chunks. It should not be less than 'transfers'*'minimal_chunk_size'
  - `minimal_chunk_size` — The minimal size for one chunk
  - `skip_project_folders` — Skip project folders in operations
- `POST /api/v1/backends/s3` body — `{ access_key_id: string="", acl: string="", bucket_acl: string="", bucket_object_lock_enabled: bool=false, bypass_governance_retention: bool=false, chunk_size: string="5242880", copy_cutoff: string="4999610368", decompress: bool=false, description: string="", directory_bucket: bool=false, directory_markers: bool=false, disable_checksum: bool=false, disable_http2: bool=false, download_url: string="", encoding: string="50331650", endpoint: string="", env_auth: false=false, force_path_style: bool=true, ibm_api_key: string="", ibm_iam_endpoint: string="", ibm_resource_instance_id: string="", leave_parts_on_error: bool=false, list_chunk: int=1000, list_url_encode: string="unset", list_version: int=0, list_versions_oldest_first: string="unset", location_constraint: string="", max_upload_parts: int=10000, memory_pool_flush_time: int=60, memory_pool_use_mmap: bool=false, might_gzip: string="unset", no_check_bucket: bool=false, no_head: bool=false, no_head_object: bool=false, no_system_metadata: bool=false, object_lock_legal_hold_status: string="", object_lock_mode: string="", object_lock_retain_until_date: string="", object_lock_set_after_upload: bool=false, object_lock_supported: string="unset", provider: string="", region: string="", requester_pays: bool=false, role_arn: string="", role_external_id: string="", role_session_duration: string="", role_session_name: string="", sdk_log_mode: string="0", secret_access_key: string="", server_side_encryption: string="", session_token: string="", sign_accept_encoding: string="unset", sse_customer_algorithm: string="", sse_customer_key: string="", sse_customer_key_base64: string="", sse_customer_key_md5: string="", sse_kms_key_id: string="", storage_class: string="", sts_endpoint: string="", upload_concurrency: int=4, upload_cutoff: string="209715200", use_accelerate_endpoint: bool=false, use_accept_encoding_gzip: string="unset", use_already_exists: string="unset", use_arn_region: bool=false, use_data_integrity_protections: string="unset", use_dual_stack: bool=false, use_multipart_etag: string="unset", use_multipart_uploads: string="unset", use_presigned_request: bool=false, use_unsigned_payload: string="unset", use_x_id: string="unset", v2_auth: bool=false, version_at: string="0001-01-01T00:00:00Z", version_deleted: bool=false, versions: bool=false }` — s3 backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - _(76 fields carry longer docs — see the spec shipped as `hoody-sdk/openapi.json` for full field semantics)_
- `POST /api/v1/backends/seafile` body — `{ 2fa: bool=false, auth_token: string="", create_library: bool=false, description: string="", encoding: string="50405386", library: string="", library_key: string="", pass: string="", url*: string="", user: string="" }` — seafile backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `2fa` — Two-factor authentication ('true' if the account has 2FA enabled).
  - `auth_token` — Authentication token.
  - `create_library` — Should Hoody create a library if it doesn't exist.
  - `library` — Name of the library. Leave blank to access all non-encrypted libraries.
  - `library_key` — Library password (for encrypted libraries only). Leave blank if you pass it through the command line.
  - `url` — URL of seafile host to connect to.
  - `user` — User name (usually email address).
- `POST /api/v1/backends/sftp` body — `{ ask_password: bool=false, chunk_size: string="32768", ciphers: string="", concurrency: int=64, connections: int=0, copy_is_hardlink: bool=false, description: string="", disable_concurrent_reads: bool=false, disable_concurrent_writes: bool=false, disable_hashcheck: bool=false, encoding: string="33652738", hashes: string="", host*: string="", host_key_algorithms: string="", host_keys: string="", http_proxy: string="", idle_timeout: int=60, key: string, key_exchange: string="", key_file_pass: string="", key_pem: string="", macs: string="", pass: string="", passphrase: string, password: string, path_override: string="", pin_host_key: bool=false, port: int=22, pubkey: string="", set_env: string="", set_modtime: bool=true, shell_type: string="", skip_links: bool=false, socks_proxy: string="", subsystem: string="sftp", use_fstat: bool=false, use_insecure_cipher: bool=false, user*: string }` — … Requires host, user, and one of pass, password, key_pem or key (the PEM itself; real line breaks are accepted). Credentials kept on the server, such as a key file or an ssh-agent, cannot be used. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - _(38 fields carry longer docs — see the spec shipped as `hoody-sdk/openapi.json` for full field semantics)_
- `POST /api/v1/backends/sharefile` body — `{ auth_url: string="", chunk_size: string="67108864", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="57091982", endpoint: string="", root_folder_id: string="", token: string="", token_url: string="", upload_cutoff: string="134217728" }` — sharefile backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `chunk_size` — Upload chunk size. Must a power of 2 >= 256k. Making this larger will improve performance, but note that each chunk is buffered in memory one per transfer. Reducing this will reduce memory usage but decrease performance.
  - `endpoint` — Endpoint for API calls. This is usually auto discovered as part of the oauth process, but can be set manually to something like: https://XXX.sharefile.com
  - `root_folder_id` — ID of the root folder. Leave blank to access "Personal Folders". You can use one of the standard values here or any folder ID (long hex number ID).
  - `upload_cutoff` — Cutoff for switching to multipart upload.
- `POST /api/v1/backends/sia` body — `{ api_password: string="", api_url*: string, description: string="", encoding: string="50436354", user_agent: string="Sia-Agent" }` — sia backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `api_password` — Sia Daemon API Password. Can be found in the apipassword file located in HOME/.sia/ or in the daemon directory.
  - `api_url` — Sia daemon API URL, like http://sia.daemon.host:9980. Note that siad must run with --disable-api-security to open API port for other hosts (not recommended). Required: there is no default, so name the Sia daemon's URL.
  - `user_agent` — Siad User Agent Sia daemon requires the 'Sia-Agent' user agent by default for security
- `POST /api/v1/backends/smb` body — `{ case_insensitive: bool=true, description: string="", domain: string="WORKGROUP", encoding: string="56698766", hide_special_share: bool=true, host*: string="", idle_timeout: int=60, pass: string="", port: int=445, spn: string="", use_kerberos: false=false, user: string }` — smb backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `case_insensitive` — Whether the server is configured to be case-insensitive. Always true on Windows shares.
  - `domain` — Domain name for NTLM authentication.
  - `hide_special_share` — Hide special shares (e.g. print$) which users aren't supposed to access.
  - `host` — SMB server hostname to connect to. E.g. "example.com".
  - `pass` — SMB password.
  - `port` — SMB port number.
  - `spn` — Service principal name. Hoody presents this name to the server. Some servers use this as further authentication, and it often needs to be set for clusters. For example: cifs/remotehost:1020 Leave blank if not sure.
  - `use_kerberos` — Kerberos authentication is not available. The schema permits `false`; enabling this option is refused with 400.
  - `user` — SMB username. Leave blank to use the current user name. If left out, the name of the account the Hoody Files service runs as.
- `POST /api/v1/backends/sugarsync` body — `{ access_key_id: string="", app_id: string="", authorization: string="", authorization_expiry: string="", deleted_id: string="", description: string="", encoding: string="50397186", hard_delete: bool=false, private_access_key: string="", refresh_token: string="", root_id: string="", user: string="" }` — sugarsync backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `access_key_id` — Sugarsync Access Key ID. Leave blank to use Hoody's.
  - `app_id` — Sugarsync App ID. Leave blank to use Hoody's.
  - `authorization` — Sugarsync authorization. Leave blank normally, will be auto configured by Hoody.
  - `authorization_expiry` — Sugarsync authorization expiry. Leave blank normally, will be auto configured by Hoody.
  - `deleted_id` — Sugarsync deleted folder id. Leave blank normally, will be auto configured by Hoody.
  - `hard_delete` — Permanently delete files if true otherwise put them in the deleted files.
  - `private_access_key` — Sugarsync Private Access Key. Leave blank to use Hoody's.
  - `refresh_token` — Sugarsync refresh token. Leave blank normally, will be auto configured by Hoody.
  - `root_id` — Sugarsync root id. Leave blank normally, will be auto configured by Hoody.
  - `user` — Sugarsync user. Leave blank normally, will be auto configured by Hoody.
- `POST /api/v1/backends/swift` body — `{ application_credential_id: string="", application_credential_name: string="", application_credential_secret: string="", auth: string="", auth_token: string="", auth_version: int=0, chunk_size: string="5368709120", description: string="", domain: string="", encoding: string="16777218", endpoint_type: string="public", env_auth: false=false, fetch_until_empty_page: bool=false, key: string="", leave_parts_on_error: bool=false, no_chunk: bool=false, no_large_objects: bool=false, partial_page_fetch_threshold: int=0, region: string="", storage_policy: string="", storage_url: string="", tenant: string="", tenant_domain: string="", tenant_id: string="", use_segments_container: string="unset", user: string="", user_id: string="" }` — swift backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - _(27 fields carry longer docs — see the spec shipped as `hoody-sdk/openapi.json` for full field semantics)_
- `POST /api/v1/backends/ulozto` body — `{ app_token: string="", description: string="", encoding: string="50438146", list_page_size: int=500, password: string="", root_folder_slug: string="", username: string="" }` — ulozto backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `app_token` — The application token identifying the app. An app API key can be either found in the API doc https://uloz.to/upload-resumable-api-beta or obtained from customer service.
  - `list_page_size` — The size of a single page for list commands. 1-500
  - `password` — The password for the user.
  - `root_folder_slug` — If set, Hoody will use this folder as the root folder for all operations. For example, if the slug identifies 'foo/bar/', 'ulozto:baz' is equivalent to 'ulozto:foo/bar/baz' without any root slug set.
  - `username` — The username of the principal to operate as.
- `POST /api/v1/backends/webdav` body — `{ auth_redirect: bool=false, bearer_token: string="", description: string="", encoding: string="", headers: string="", nextcloud_chunk_size: string="10485760", owncloud_exclude_mounts: bool=false, owncloud_exclude_shares: bool=false, pacer_min_sleep: int=0, pass: string="", url*: string="", user: string="", vendor: string="" }` — webdav backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `auth_redirect` — Preserve authentication on redirect. … Note that enabling this also permits sending your credentials over a plaintext HTTP connection if the server redirects from HTTPS to HTTP, which Hoody otherwise refuses to do.
  - `bearer_token` — Bearer token instead of user/pass (e.g. a Macaroon).
  - `encoding` — The encoding for the backend. Default encoding is Slash,LtGt,DoubleQuote,Colon,Question,Asterisk,Pipe,Hash,Percent,BackSlash,Del,Ctl,LeftSpace,LeftTilde,RightSpace,RightPeriod,InvalidUtf8 for sharepoint-ntlm or identity otherwise.
  - `headers` — Set HTTP headers for all transactions. Use this to set additional HTTP headers for all transactions The input format is comma separated list of key,value pairs. Standard [CSV encoding](https://godoc.org/encoding/csv) may be used. …
  - `nextcloud_chunk_size` — Nextcloud upload chunk size. We recommend configuring your NextCloud instance to increase the max chunk size to 1 GB for better upload performances. …
  - `owncloud_exclude_mounts` — Exclude ownCloud mounted storages
  - `owncloud_exclude_shares` — Exclude ownCloud shares
  - `pacer_min_sleep` — Minimum time to sleep between API calls. (in seconds)
  - `url` — URL of http host to connect to. E.g. https://example.com.
  - `user` — User name. In case NTLM authentication is used, the username should be in the format 'Domain\User'.
  - `vendor` — Name of the WebDAV site/service/software you are using.
- `POST /api/v1/backends/yandex` body — `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50429954", hard_delete: bool=false, spoof_ua: bool=true, token: string="", token_url: string="", upload_wait: int=0 }` — yandex backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - `spoof_ua` — Set the user agent to match an official version of the yandex disk client. May help with upload performance.
  - `upload_wait` — Wait this long after an upload before setting the modification time. Yandex Disk finalizes an upload asynchronously on its servers after the upload has completed. If the modification time is set while this finalization is still in progress the server returns 500 Internal Server Error errors. …
- `POST /api/v1/backends/zoho` body — `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="16875520", list_folder_burst: int=6, list_folder_limit: int=19, list_folder_window: int=60, region: string="", root_folder_id: string="", token: string="", token_url: string="", tpslimit: string="6", tpslimit_burst: int=1, upload_cutoff: string="10485760" }` — zoho backend configuration. A field not listed here is not refused for being unknown: it goes through the same admission rules (for example, an option that uses ambient credentials, a local file or a command is refused with 400).
  - _(16 fields carry longer docs — see the spec shipped as `hoody-sdk/openapi.json` for full field semantics)_
- `PUT /api/v1/backends/{id}` body — `{ [key: string]: string|null }` — … Values must be strings or null (null deletes the field). pass and password together are refused with 400. On sftp, key, passphrase and password are other names for key_pem, key_file_pass and pass, and on mega password is another name for pass, as on connect: both names of one field set to different values are refused with 400, and a null under the other name is ignored, so it removes nothing (send key_pem: null to remove a key). On s3, oracleobjectstorage and qingstor, access_key_id and secret_access_key are changed together: one without the other is refused with 400.

### `downloads` (6) — Download from a URL

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/downloads/{id}` | Cancel a running download |  |
| `GET /{directory}?download` | Download file from remote URL | `?download*` `?filename` `?timeout` |
| `GET /api/v1/downloads/{id}` | Get one download by id |  |
| `GET /api/v1/downloads` | List active downloads |  |
| `GET /{directory}?downloads` | List active downloads | `?downloads*` |
| `GET /?download_history` | Download history | `?download_history*` |

**Param notes:**

- `directory` — Destination directory
- `download` — URL to download from
- `filename` — Custom filename for downloaded file
- `timeout` — Download timeout in seconds. Default and maximum: 43200 (12 hours)
- `id` — The download's id
- `downloads` — Selects this operation: send downloads with no value. It is part of the route, not an option.
- `download_history` — Selects this operation: send download_history with no value. It is part of the route, not an option.

### `extractions` (4) — Running archive extractions

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/extractions/{id}` | Cancel a running extraction |  |
| `GET /api/v1/extractions` | List active extractions |  |
| `GET /?extractions` | List active extractions | `?extractions*` |
| `GET /?extraction_history` | Extraction history | `?extraction_history*` |

**Param notes:**

- `extractions` — Selects this operation: send extractions with no value. It is part of the route, not an option.
- `extraction_history` — Selects this operation: send extraction_history with no value. It is part of the route, not an option.

### `files` (25) — File operations - upload, download, delete, list files

| Method | Summary | Params |
|--------|---------|--------|
| `PUT /api/v1/files/append/{path}` | Append data to file | `?owner` `H:X-Expected-Length` `H:If-Match` `H:If-None-Match` `H:If-Unmodified-Since` `body*:application/octet-stream` |
| `PATCH /api/v1/files/chmod/{path}` | Change file permissions | `?chmod*` |
| `PATCH /api/v1/files/chown/{path}` | Change file ownership | `?chown*` |
| `POST /api/v1/files/copy/{path}` | Copy file or directory | `?copy_to*` `?overwrite` `?owner` |
| `DELETE /api/v1/files/{path}` | Delete file or directory | `?backend` |
| `HEAD /{path}` | Get file metadata | `?history` `?at` `?revision` `?diff` `?from_seq` `?from_ts` `?to_seq` `?to_ts` `?after_id` `?limit` |
| `GET /api/v1/files/{path}` | List directory or download file | `?backend` `?hash` `?sha256` `?base64` `?preview` `?contents` `?stat` `?thumbnail` `?format` `?size` `?width` `?height` `?resize` `?quality` `?blur` `?grayscale` `?bg` `?q` `?grep` `?ignore_case` `?fixed_string` `?glob` `?context` `?max_count` `?max_matches` `?max_depth` `?max_filesize` `?timeout` `?no_ignore` `?hidden` `?max_results` `?max_files_scanned` `?sort` `?order` `?lines` `?history` `?at` `?revision` `?diff` `?from_seq` `?from_ts` `?to_seq` `?to_ts` `?after_id` `?limit` `?zip` `H:Range` `H:If-Range` |
| `GET /api/v1/files/glob/{path}` | Find files by glob pattern | `?pattern*` `?max_results` `?max_depth` `?max_files_scanned` `?timeout` `?no_ignore` `?hidden` `?sort` `?order` |
| `GET /api/v1/files/grep/{path}` | Search file contents (grep) | `?pattern*` `?ignore_case` `?fixed_string` `?glob` `?context` `?max_count` `?max_matches` `?max_depth` `?max_filesize` `?timeout` `?no_ignore` `?hidden` |
| `LOGOUT /{path}` | Clear authentication |  |
| `POST /api/v1/files/{path}` | File operations (mkdir, extract, download, move, copy) | `?backend` `?mkdir` `?extract` `?dest` `?download_from` `?id` `?filename` `?timeout` `?move_to` `?copy_to` `?overwrite` `?owner` |
| `POST /api/v1/files/move/{path}` | Move file or directory | `?move_to*` `?owner` |
| `GET /api/v1/files/realpath/{path}` | Resolve canonical path (realpath) |  |
| `GET /{directory}?q` | Search directory | `?q*` `?json` `?theme` `?colorScheme` `?font` `?fontSize` `?embedderOrigin` `?chromeless` `?borderless` `?hideHeader` `?hideSidebar` `?hidePreview` `?hideFooter` `?embedBg` |
| `GET /api/v1/files/stat/{path}` | Get file metadata (stat) | `?backend` |
| `PUT /{path}?touch` | Touch file (create or update mtime) | `?touch*` `?type` |
| `PATCH /api/v1/files/{path}` | Modify file properties or move/rename | `?owner` `?chmod` `?chown` `body` |
| `PUT /api/v1/files/{path}` | Upload or append file | `?backend` `?append` `?chmod` `?owner` `H:X-Expected-Length` `H:If-Match` `H:If-None-Match` `H:If-Unmodified-Since` `body*:application/octet-stream` |
| `CHECKAUTH /{path}` | Check authentication status |  |
| `PATCH /{path}` | File operations | `H:X-Update-Range` `H:If-Match` `H:If-None-Match` `H:If-Unmodified-Since` `body:application/json,application/octet-stream` |
| `PUT /{path}` | Upload file | `H:If-Match` `H:If-None-Match` `H:If-Unmodified-Since` `body*:application/octet-stream` |
| `DELETE /{path}` | Delete file or directory |  |
| `MKCOL /{path}` | Create directory |  |
| `GET /{directory}?zip` | Download directory as ZIP | `?zip*` |
| `GET /` | List the root directory | `?json` `?simple` `?sort` `?order` `?hash` `?sha256` `?base64` `?edit` `?view` `?download` `?content-type` `?history` `?at` `?revision` `?diff` `?from_seq` `?from_ts` `?to_seq` `?to_ts` `?after_id` `?limit` `?theme` `?colorScheme` `?font` `?fontSize` `?embedderOrigin` `?chromeless` `?borderless` `?hideHeader` `?hideSidebar` `?hidePreview` `?hideFooter` `?embedBg` |

**Param notes:**

- `path` — File path _(on `PUT /api/v1/files/append/{path}`, `PATCH /api/v1/files/{path}`)_
- `owner` — Create-time owner (user[:group]/uid[:gid]) when this append creates a new file. Requires the deployment to have enabled chown and to permit the owner you name; refuses root. Absent → server default. _(on `PUT /api/v1/files/append/{path}`)_
- `X-Expected-Length` — The length of the whole body in bytes, for a body streamed without Content-Length. A body that ends before this many bytes, or runs past them, is refused with 400 and nothing is written or appended: the file stays as it was. Send it whenever the length is known: some HTTP/2 clients end a request's body normally when they are aborted, so without it a cut-off body can look complete. Over the upload size limit it is refused with 413 before the body is read.
- `If-Match` — Write only if the file has this ETag (the one a download of it answers with; a weak ETag never matches), or with '*' only if a file exists at the path. Otherwise 412 and nothing is written or created. _(on `PUT /api/v1/files/append/{path}`, `PUT /{path}`)_
- `If-None-Match` — '*' writes only if nothing exists at the path (create only); a tag writes only if the file does not have that ETag. Otherwise 412 and nothing is written. _(on `PUT /api/v1/files/append/{path}`, `PUT /{path}`)_
- `If-Unmodified-Since` — Without If-Match, write only if the file has not changed since this HTTP date. Otherwise 412 and nothing is written. _(on `PUT /api/v1/files/append/{path}`, `PUT /{path}`)_
- `path` — File or directory path _(on `PATCH /api/v1/files/chmod/{path}`, `PATCH /api/v1/files/chown/{path}`, `GET /api/v1/files/{path}` +1 more)_
- `chmod` — Octal permission mode (e.g., 755, 644, 0755) _(on `PATCH /api/v1/files/chmod/{path}`)_
- `chown` — Owner and optional group (e.g., user:group, user, :group, or UID:GID) _(on `PATCH /api/v1/files/chown/{path}`)_
- `path` — Source file or directory path _(on `POST /api/v1/files/copy/{path}`, `POST /api/v1/files/move/{path}`)_
- `copy_to` — Destination path to copy the file/directory to. The path is taken from the serve root: a destination without a leading '/' is also taken from the serve root, not from the source's folder. _(on `POST /api/v1/files/copy/{path}`)_
- `overwrite` — Allow overwriting existing destination (default: false) _(on `POST /api/v1/files/copy/{path}`)_
- `owner` — Create-time owner (user[:group]/uid[:gid]) for newly-created copies. Requires the deployment to have enabled chown and to permit the owner you name; refuses root. Overwritten existing files preserve their owner. Absent → server default. _(on `POST /api/v1/files/copy/{path}`)_
- `backend` — Backend ID for remote file deletion _(on `DELETE /api/v1/files/{path}`)_
- `history` — List all revisions of a file recorded in the journal. Returns JSON with revisions array, pagination via after_id, and head_matches_disk: true when the file on disk holds what the journal's newest record of it says, false when it does not (an outside write, an unrecorded change, pruned history or missing content history can each cause this; the flag alone does not identify the cause); absent for a folder or any other path that is neither a file nor missing, and when the file could not be read. Mutually exclusive with at/revision/diff. The journal records only changes made through Hoody Files; a change made by the agent's tools, a terminal, a script or a program is not recorded.
- `at` — Read file content at a point in time, as the journal recorded it. Accepts RFC3339 timestamp or Unix milliseconds. Mutually exclusive with history/revision/diff. Composable with ?lines, ?hash, ?base64. The X-Journal-Head-Matches-Disk response header is true when the file on disk holds what the journal's newest record of it says, false when it does not (an outside write, an unrecorded change, pruned history or missing content history can each cause this; the flag alone does not identify the cause); absent for a folder or any other path that is neither a file nor missing, and when the file could not be read. The journal records only changes made through Hoody Files; a change made by the agent's tools, a terminal, a script or a program is not recorded.
- `revision` — Read file content by stable per-path sequence number. Mutually exclusive with history/at/diff. Composable with ?lines, ?hash, ?base64. The X-Journal-Head-Matches-Disk response header is true when the file on disk holds what the journal's newest record of it says, false when it does not (an outside write, an unrecorded change, pruned history or missing content history can each cause this; the flag alone does not identify the cause); absent for a folder or any other path that is neither a file nor missing, and when the file could not be read. The journal records only changes made through Hoody Files; a change made by the agent's tools, a terminal, a script or a program is not recorded.
- `diff` — Compute unified diff between two versions. Requires from_seq or from_ts. With to_seq or to_ts it compares two recorded versions; with neither it compares with the file as it is on disk now (410 when the file no longer exists, 422 when it is over the journal's size limit). Mutually exclusive with history/at/revision. The X-Journal-Head-Matches-Disk response header is true when the file on disk holds what the journal's newest record of it says, false when it does not (an outside write, an unrecorded change, pruned history or missing content history can each cause this; the flag alone does not identify the cause); absent for a folder or any other path that is neither a file nor missing, and when the file could not be read. The journal records only changes made through Hoody Files; a change made by the agent's tools, a terminal, a script or a program is not recorded.
- `from_seq` — Source revision seq number for ?diff. Mutually exclusive with from_ts.
- `from_ts` — Source timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with from_seq.
- `to_seq` — Target revision seq number for ?diff. Mutually exclusive with to_ts. Default: current file on disk.
- `to_ts` — Target timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with to_seq.
- `after_id` — Cursor for ?history pagination. Returns entries with id > after_id.
- `limit` — Max entries to return for ?history.
- `backend` — Backend ID for remote file access. Remote reads support listings, downloads, stat, hash, and base64. grep, glob, lines, and journal queries return 400. Remote folder ZIP and file thumbnails return 501. Archive-preview flags do not produce a preview: a remote file is downloaded and a remote directory is listed. _(on `GET /api/v1/files/{path}`)_
- `hash` — Get SHA256 hash of file _(on `GET /api/v1/files/{path}`)_
- `sha256` — Get SHA256 hash of file (alias for hash)
- `base64` — Get file content as base64 _(on `GET /api/v1/files/{path}`)_
- `preview` — Preview archive contents (for zip/tar files). Alias: ?contents
- `contents` — Alias for ?preview - list archive contents
- `stat` — Get file/directory metadata (stat) without downloading content
- `thumbnail` — Return a processed image (resize, format convert, blur, grayscale), shaped by format, size, width, height, resize, quality, blur, grayscale and bg: the same image as the WebDAV-style /{image}?thumbnail. Only where the deployment enabled thumbnail processing; returns 403 when disabled.
- `format` — With thumbnail: output image format
- `size` — With thumbnail: Target box in pixels: WIDTHxHEIGHT, or a single N for an N×N box
- `width` — With thumbnail: target width in pixels
- `height` — With thumbnail: target height in pixels
- `resize` — With thumbnail: How the image meets a target box given by size, or by width and height together: fit (default) keeps the aspect ratio and fits inside the box; fill keeps the aspect ratio, covers the box and centre-crops to exactly WIDTH×HEIGHT; cover keeps the aspect ratio and covers the box, so one side may be larger than the box; exact forces WIDTH×HEIGHT and may distort. With only width or only height, the other side follows the aspect ratio.
- `quality` — With thumbnail: Resampling filter for resizing: low (box), medium (bilinear, the default) or high (Lanczos3). It does not set compression; q sets JPEG quality.
- `blur` — With thumbnail: Gaussian blur radius
- `grayscale` — With thumbnail: convert to grayscale
- `bg` — With thumbnail: background color for transparent areas
- `q` — Two roles. On a directory (without thumbnail): search the names and paths below it for this text, case-insensitive; at most 512 bytes of UTF-8, measured before and after lowercasing (longer is refused with 400, not truncated); only where the deployment enabled search (403 otherwise). With thumbnail: JPEG quality, 1-100 (default 85); only JPEG output uses it. _(on `GET /api/v1/files/{path}`)_
- `grep` — Search file/directory contents for regex pattern (or literal if fixed_string=true). Only where the deployment enabled content search.
- `ignore_case` — Case-insensitive grep matching _(on `GET /api/v1/files/{path}`)_
- `fixed_string` — Treat grep pattern as literal string, not regex _(on `GET /api/v1/files/{path}`)_
- `glob` — Without grep, finds files and folders matching this glob (e.g. '**/*.rs', 'src/**/*.{ts,tsx}'); directory paths only, where the deployment enabled search. The pattern is matched against each path relative to the searched folder: '*' stays within one folder and '**' crosses folders, so '*.md' finds only the folder's own files and '**/*.md' finds them at any depth. A pattern starting with '/' or holding a '..' segment is refused with 400. Symbolic links are listed but the search does not go into a linked folder. With grep, the content-search file filter. Only search files matching this glob (ripgrep -g syntax, one pattern per request, at most 1024 bytes). A pattern without '/' matches file names at any depth ('*.rs', '*.{ts,tsx}'). A pattern with a '/' other than a trailing one matches the path relative to the searched folder, and a leading '/' anchors it there ('src/**/*.go'). '*' stays within one folder and '**' crosses folders. A leading '!' excludes instead ('!*_test.go'; '!vendor/' skips every folder named vendor); write '\!' for a literal '!' and '\#' for a leading '#'. Matching is case-sensitive whatever ignore_case says. A positive pattern ending in '/' names folders only and so selects no files; use 'src/**' for everything under a folder. A pattern that is only whitespace or a comment (an unescaped leading '#') is refused. The filter only narrows the search: it never brings back a file that ignore files or the default exclusion of names starting with '.' leave out; no_ignore and hidden do that. Not applied when the path is a single file. Repeating glob in a content search is refused. _(on `GET /api/v1/files/{path}`)_
- `context` — Number of context lines before/after each grep match _(on `GET /api/v1/files/{path}`)_
- `max_count` — Max matches per file for grep _(on `GET /api/v1/files/{path}`)_
- `max_matches` — Total max matches across all files for grep _(on `GET /api/v1/files/{path}`)_
- `max_depth` — Directory recursion depth for grep _(on `GET /api/v1/files/{path}`)_
- `max_filesize` — Skip files larger than this (bytes) during grep _(on `GET /api/v1/files/{path}`)_
- `timeout` — Grep timeout in seconds _(on `GET /api/v1/files/{path}`)_
- `no_ignore` — Also search files excluded by .gitignore (inside a git repository), .ignore, .git/info/exclude and the global git excludes
- `hidden` — Also search names starting with '.', which are otherwise skipped unless an ignore file whitelists them. '.git' folders found inside the searched folder are still skipped, and the server's configured hidden paths still apply. Refused with 403 for an account that may only list this path.
- `max_results` — Max entries returned for glob search _(on `GET /api/v1/files/{path}`)_
- `max_files_scanned` — Max filesystem entries scanned during glob search _(on `GET /api/v1/files/{path}`)_
- `sort` — Sort glob results by: mtime (default), name, or size _(on `GET /api/v1/files/{path}`)_
- `order` — Sort order for glob results. Default: desc for mtime, asc for name/size _(on `GET /api/v1/files/{path}`)_
- `lines` — Extract specific lines from a file. Formats: '10-50' (range, 1-indexed inclusive), '100' (single line), '-20' (last 20 lines / tail), '50-' (line 50 to end). Returns text/plain with X-Line-Range header. X-Total-Lines header included when naturally known (scan reached EOF). Max 100,000 lines or 64MB per request.
- `zip` — Download a directory as a streaming zip archive (bare flag, e.g. ?zip). Local directories only (a folder of a remote backend, named with backend, answers 501), and only where the deployment enabled archive downloads (403 otherwise). Same behavior as the WebDAV-style /{directory}?zip, including its limits: a folder one archive cannot hold whole (more than 1000000 files, more than 10000000 files and folders in all, or folders nested deeper than 50 levels) is refused with 422 `ARCHIVE_TOO_LARGE`. _(on `GET /api/v1/files/{path}`)_
- `Range` — File download only: ask for part of the file, as 'bytes=first-last', 'bytes=first-' or 'bytes=-suffix_length'. A last position past the end is clamped to the last byte, and a suffix longer than the file selects all of it. One satisfiable range answers 206 with Content-Range; several answer 206 as multipart/byteranges for a local file, while a remote file (with backend) answers 200 with the whole file. Ranges that cannot be satisfied are dropped from a list, and 416 comes only when none is left. A malformed header, another unit or more than 100 ranges is ignored (200, whole file). HEAD ignores Range.
- `If-Range` — File download only: honour Range only if the file still has this ETag, exactly; otherwise answer 200 with the whole file. A date never matches, since two versions saved within the same second share it. A remote file's (with backend) ETag is weak, so with If-Range a remote file is always sent whole.
- `path` — Directory path to search within _(on `GET /api/v1/files/glob/{path}`)_
- `pattern` — Glob pattern, matched against paths relative to the searched folder (e.g. '**/*.rs', 'src/**/*.{ts,tsx}', '*.md'). '*' stays within one folder, '**' crosses folders. Cannot start with '/' or contain a '..' segment. _(on `GET /api/v1/files/glob/{path}`)_
- `max_results` — Maximum entries to return _(on `GET /api/v1/files/glob/{path}`)_
- `max_depth` — Maximum directory recursion depth _(on `GET /api/v1/files/glob/{path}`, `GET /api/v1/files/grep/{path}`)_
- `max_files_scanned` — Maximum filesystem entries to scan _(on `GET /api/v1/files/glob/{path}`)_
- `timeout` — Search timeout in seconds _(on `GET /api/v1/files/glob/{path}`, `GET /api/v1/files/grep/{path}`)_
- `sort` — Sort results by: mtime (modification time), name, or size _(on `GET /api/v1/files/glob/{path}`)_
- `order` — Sort order. Default: desc for mtime, asc for name/size _(on `GET /api/v1/files/glob/{path}`)_
- `path` — File or directory path to search _(on `GET /api/v1/files/grep/{path}`)_
- `pattern` — Search pattern (regex by default, literal if fixed_string=true) _(on `GET /api/v1/files/grep/{path}`)_
- `ignore_case` — Case-insensitive matching _(on `GET /api/v1/files/grep/{path}`)_
- `fixed_string` — Treat pattern as literal string, not regex _(on `GET /api/v1/files/grep/{path}`)_
- `glob` — Only search files matching this glob (ripgrep -g syntax, one pattern per request, at most 1024 bytes). A pattern without '/' matches file names at any depth ('*.rs', '*.{ts,tsx}'). A pattern with a '/' other than a trailing one matches the path relative to the searched folder, and a leading '/' anchors it there ('src/**/*.go'). '*' stays within one folder and '**' crosses folders. A leading '!' excludes instead ('!*_test.go'; '!vendor/' skips every folder named vendor); write '\!' for a literal '!' and '\#' for a leading '#'. Matching is case-sensitive whatever ignore_case says. A positive pattern ending in '/' names folders only and so selects no files; use 'src/**' for everything under a folder. A pattern that is only whitespace or a comment (an unescaped leading '#') is refused. The filter only narrows the search: it never brings back a file that ignore files or the default exclusion of names starting with '.' leave out; no_ignore and hidden do that. Not applied when the path is a single file. Repeating glob in a content search is refused. _(on `GET /api/v1/files/grep/{path}`)_
- `context` — Number of context lines before and after each match _(on `GET /api/v1/files/grep/{path}`)_
- `max_count` — Maximum matches per file _(on `GET /api/v1/files/grep/{path}`)_
- `max_matches` — Total maximum matches across all files _(on `GET /api/v1/files/grep/{path}`)_
- `max_filesize` — Skip files larger than this (bytes) _(on `GET /api/v1/files/grep/{path}`)_
- `backend` — Backend ID, for mkdir only: create the directory on that remote backend. Any other operation with backend is refused with 400 INVALID_PARAMETER. _(on `POST /api/v1/files/{path}`)_
- `mkdir` — Create directory
- `extract` — Extract archive. Empty value extracts all; non-empty value is a selective path to extract (e.g. "src/" or "lib/")
- `dest` — Destination directory name for extraction (default: archive name without extension)
- `download_from` — Download the file at this URL into the directory named by the path. Without id, the request answers when the download has finished; with id, it answers 202 as soon as the download is accepted, and GET /api/v1/downloads/{id} gives its progress and outcome. Either way it appears in GET /api/v1/downloads while it runs, and can be cancelled with DELETE /api/v1/downloads/{id}. A client that stops waiting does not stop the download: it runs to its end and its outcome is recorded in the download history. The file appears under its name only once it is complete; until then the bytes go to a hidden `.hoody-download-<id>.part` file in the same directory, which is removed if the download fails or is cancelled.
- `id` — With download_from: the download's id, chosen by the client, so that a request sent again after a lost answer never starts it twice. A random (version 4) UUID, hyphenated; anything else is refused with 400 INVALID_PARAMETER. The request answers 202 once the download is accepted. An id a download already had, running or ended within the last 7 days, is refused with 409 DOWNLOAD_ID_EXISTS and nothing changes; GET /api/v1/downloads/{id} finds that download. When a record of the id exists but cannot be read, the request is refused with 500 and nothing starts: an id is free only when no record of it is certain. The 202 is sent once the download's record is on stable storage, so a download accepted keeps its id across a crash. The id is checked after the limit of running jobs (a 429 records nothing) and before the path is reserved (a busy path records nothing). Servers that take id list `download_client_id` in the `features` of GET /api/v1/version.
- `filename` — With download_from: the name to save the download as (default: from the response or the URL)
- `timeout` — With download_from: the most seconds the download may take, capped by the server's own limit _(on `POST /api/v1/files/{path}`)_
- `move_to` — Move file/directory to destination path. The path is taken from the serve root: a destination without a leading '/' is also taken from the serve root, not from the source's folder. _(on `POST /api/v1/files/{path}`)_
- `copy_to` — Copy file/directory to destination path. The path is taken from the serve root: a destination without a leading '/' is also taken from the serve root, not from the source's folder. A directory copy keeps symbolic links as links (see POST /api/v1/files/copy/{path}). _(on `POST /api/v1/files/{path}`)_
- `overwrite` — Allow overwriting existing destination (for copy) _(on `POST /api/v1/files/{path}`)_
- `owner` — Create-time owner for newly-created inodes as user[:group] or uid[:gid]. Requires the deployment to have enabled chown, and must resolve to one of the owners it permits; refuses root (uid/gid 0). Absent → the server default create owner. Applies to mkdir/extract/download_from/copy_to. _(on `POST /api/v1/files/{path}`)_
- `move_to` — Destination path to move the file/directory to. The path is taken from the serve root: a destination without a leading '/' is also taken from the serve root, not from the source's folder. _(on `POST /api/v1/files/move/{path}`)_
- `owner` — Create-time owner (user[:group]/uid[:gid]) for newly-created destination PARENT directories. Requires the deployment to have enabled chown and to permit the owner you name; refuses root. The moved inode itself preserves its existing owner. Absent → server default. _(on `POST /api/v1/files/move/{path}`)_
- `path` — File or directory path to resolve _(on `GET /api/v1/files/realpath/{path}`)_
- `q` — Search query (case-insensitive filename match). Maximum 512 BYTES of UTF-8 after form/percent decoding, measured both before and after Unicode lowercasing, because lowercasing can change a string's byte length in either direction. Longer queries are rejected with 400; they are not truncated. Note this is a byte limit, not a character limit, so it is deliberately not expressed as `maxLength`. _(on `GET /{directory}?q`)_
- `json` — Return JSON format instead of HTML
- `theme` — HTML page only: colour theme of the page. Default oc-1.
- `colorScheme` — HTML page only: light or dark colour scheme. Without it the page follows the system setting.
- `font` — HTML page only: monospace font of the editor and listing.
- `fontSize` — HTML page only: editor font size in pixels. Default 14.
- `embedderOrigin` — HTML page only: origin of the page that embeds this one, such as https://app.example.com. The page then accepts theme and layout messages from that origin and tells it when it is ready. Only https origins are accepted.
- `chromeless` — HTML page only: hide the header, sidebar, preview, footer and borders at once. Each can be turned back on with its own parameter set to false.
- `borderless` — HTML page only: hide the page borders.
- `hideHeader` — HTML page only: hide the header bar.
- `hideSidebar` — HTML page only: hide the sidebar.
- `hidePreview` — HTML page only: hide the preview pane.
- `hideFooter` — HTML page only: hide the footer.
- `embedBg` — HTML page only: transparent lets the background of the embedding page show through.
- `backend` — Backend ID: the metadata of the path on that remote backend instead of a local path _(on `GET /api/v1/files/stat/{path}`)_
- `path` — File path to touch _(on `PUT /{path}?touch`)_
- `touch` — Flag to indicate touch operation
- `type` — Names a remote backend type (an Hoody backend name such as sftp, webdav, ftp or s3). The request is then not a local touch: it is a remote request, which takes the connection parameters of an SSH upload, PUT /{path}?type=ssh (server, user, pass and the others) and needs remote access and uploads enabled. It writes the request body to the remote path, replacing a file already there, so an empty body leaves an empty file.
- `owner` — Create-time owner (user[:group]/uid[:gid]) for newly-created destination parent directories on a JSON-body move_to. Requires the deployment to have enabled chown and to permit the owner you name; cannot be root. The moved item keeps its own owner. Absent → server default. _(on `PATCH /api/v1/files/{path}`)_
- `chmod` — Set file permissions using octal mode value (e.g., ?chmod=755) _(on `PATCH /api/v1/files/{path}`)_
- `chown` — Set file ownership (e.g., ?chown=user:group or ?chown=user) _(on `PATCH /api/v1/files/{path}`)_
- `backend` — Backend ID for remote upload _(on `PUT /api/v1/files/{path}`)_
- `append` — Append body to end of existing file (create if missing) instead of overwriting
- `chmod` — Permission bits the local file ends with, in octal (`644`, `0600`, `0o755`, `000`), whatever the server's umask; the response gives them in `mode`, read back from the file. Where the filesystem keeps no permission bits of its own (a mount of a remote storage without them), the upload is answered 409 PERMISSIONS_NOT_APPLIED instead: nothing is changed when the bits asked for are narrower than the file's, and otherwise the body is written whole under the file's bits. Requires both upload and chmod to be enabled (403 otherwise). setuid, setgid and sticky bits are refused, as are values above 777. Refused with 400 together with `backend` or `append`, and when the path names something other than a regular file (a directory, a pipe, a device, a socket). Each of these refusals comes before the body is read: nothing is created or changed. _(on `PUT /api/v1/files/{path}`)_
- `owner` — Create-time owner (user[:group]/uid[:gid]) for a newly-created file. Requires the deployment to have enabled chown and to permit the owner you name; refuses root. Overwrites/appends to an existing file preserve its owner. Absent → server default. _(on `PUT /api/v1/files/{path}`)_
- `If-Match` — Local files only; with backend it is refused with 400. Write only if the file has this ETag (the one a download of it answers with; a weak ETag never matches), or with '*' only if a file exists at the path. Otherwise 412 and nothing is written or created. _(on `PUT /api/v1/files/{path}`)_
- `If-None-Match` — Local files only; with backend it is refused with 400. '*' writes only if nothing exists at the path (create only); a tag writes only if the file does not have that ETag. Otherwise 412 and nothing is written. _(on `PUT /api/v1/files/{path}`)_
- `If-Unmodified-Since` — Local files only; with backend it is refused with 400. Without If-Match, write only if the file has not changed since this HTTP date. Otherwise 412 and nothing is written. _(on `PUT /api/v1/files/{path}`)_
- `X-Update-Range` — Set to 'append' to append data to the end of the file. Perfect for logs and incremental writes. Example: curl -X PATCH -H 'X-Update-Range: append' --data-binary @data.txt http://server/file.log
- `If-Match` — Writes of content (X-Update-Range) only. Write only if the file has this ETag (the one a download of it answers with; a weak ETag never matches), or with '*' only if a file exists at the path. Otherwise 412 and nothing is written or created. _(on `PATCH /{path}`)_
- `If-None-Match` — Writes of content (X-Update-Range) only. '*' writes only if nothing exists at the path (create only); a tag writes only if the file does not have that ETag. Otherwise 412 and nothing is written. _(on `PATCH /{path}`)_
- `If-Unmodified-Since` — Writes of content (X-Update-Range) only. Without If-Match, write only if the file has not changed since this HTTP date. Otherwise 412 and nothing is written. _(on `PATCH /{path}`)_
- `path` — Destination file path _(on `PUT /{path}`)_
- `path` — Path to file or directory to delete _(on `DELETE /{path}`)_
- `zip` — Selects this operation: send zip with no value. It is part of the route, not an option. _(on `GET /{directory}?zip`)_
- `simple` — Directory only: return the entry names one per line (directories end in /) as text/plain
- `sort` — Sort by field _(on `GET /`)_
- `order` — Sort order _(on `GET /`)_
- `hash` — Get SHA256 hash of file (returns plain text hash) _(on `GET /`)_
- `base64` — Get file content as base64 encoded string _(on `GET /`)_
- `edit` — Open file in Web UI editor (requires allow-upload permission)
- `view` — Open file in a read-only Web UI page: the text is shown with no Save, rename, move or delete.
- `download` — For file paths only: force browser download (Content-Disposition: attachment). Accepted values: empty (?download), 1, or true. For directory paths, ?download is the URL download-manager operation.
- `content-type` — Override Content-Type header for file downloads

**Body shapes:**

- `PATCH /api/v1/files/{path}` body — `files_MoveRequest | files_RenameRequest`
- `PATCH /{path}` body — `files_ChmodRequest | files_ChownRequest | files_RenameRequest` — application/octet-stream: for resumable uploads or appending to files; use the X-Update-Range: append header to append data to the end of the file. application/json: a chmod, chown or rename.

### `ftp` (1) — Access a file over FTP

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{path}?type=ftp` | Access file via FTP | `?type*` `?server*` `?user` `?pass` `?ftp_secure` `?ftp_passive` |

**Param notes:**

- `pass` — FTP password, base64 encoded.
- `ftp_secure` — Use explicit FTPS (AUTH TLS on the control connection). Accepts true, false, 1 or 0.
- `ftp_passive` — Passive mode, the only mode supported: `false` is refused with 400. Accepts true, false, 1 or 0.

### `images` (1) — Image processing and conversion

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{image}?thumbnail` | Process and convert images | `?thumbnail*` `?format` `?size` `?width` `?height` `?resize` `?quality` `?q` `?blur` `?grayscale` `?bg` |

**Param notes:**

- `image` — Path to image file
- `thumbnail` — Enable image processing
- `format` — Output format (default: jpeg)
- `size` — Target box in pixels: WIDTHxHEIGHT, or a single N for an N×N box (max: 2000×2000)
- `width` — Width in pixels (height auto-calculated)
- `height` — Height in pixels (width auto-calculated)
- `resize` — How the image meets a target box given by size, or by width and height together: fit (default) keeps the aspect ratio and fits inside the box; fill keeps the aspect ratio, covers the box and centre-crops to exactly WIDTH×HEIGHT; cover keeps the aspect ratio and covers the box, so one side may be larger than the box; exact forces WIDTH×HEIGHT and may distort. With only width or only height, the other side follows the aspect ratio.
- `quality` — Resampling filter for resizing: low (box), medium (bilinear, the default) or high (Lanczos3). It does not set compression; q sets JPEG quality.
- `q` — JPEG quality, 1-100 (higher is better). Only JPEG output uses it: PNG, WebP (lossless), GIF and BMP ignore it.
- `blur` — Gaussian blur radius (0-50)
- `grayscale` — Convert to grayscale/black-and-white
- `bg` — Background color for transparency (hex RGB, e.g., 'ffffff' for white)

### `journal` (3) — Change journal - which files were changed through Hoody Files and when, its statistics, and flushing it to disk

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/journal/flush` | Flush journal to disk |  |
| `GET /api/v1/journal/stats` | Get journal statistics |  |
| `GET /api/v1/journal` | Query journal entries | `?path` `?op` `?since` `?limit` `?after_id` |

**Param notes:**

- `path` — Filter entries by path prefix
- `op` — Filter by operation type(s), comma-separated (e.g. 'write,delete')
- `since` — Return entries at or after this time: an RFC3339 timestamp (Z or an offset, any fractional precision), or a Unix timestamp in seconds or milliseconds. A number below 100000000000 is read as seconds. Omitted or empty, no time filter applies; any other value is refused with 400.
- `limit` — Maximum entries to return, from `1` to `1000`. Default `100`. A whole number from `1001` up to `18446744073709551615` is lowered to `1000` and `0` is raised to `1`; any other value (a negative number, a fraction, a larger number, or not a number) uses the default.
- `after_id` — Cursor: return entries with id > after_id

### `kit` (2) — System endpoints - health checks, version info, and status monitoring

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/files/health` | Service health check |  |
| `GET /api/v1/version` | Get API version |  |

### `mounts` (5) — Mount management - create, list, and remove FUSE filesystem mounts for remote backends

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/mounts` | Create persistent FUSE mount | `body*` |
| `DELETE /api/v1/mounts/{id}` | Unmount filesystem | `?uploads` `?wait_seconds` |
| `GET /api/v1/mounts/{id}` | Get mount details |  |
| `GET /api/v1/mounts` | List all mounts | `?label` |
| `PATCH /api/v1/mounts/{id}` | Update mount VFS configuration | `?switch` `body*` |

**Param notes:**

- `uploads` — What becomes of what was written on the mount and is not uploaded yet: keep uploading it (`keep`), the same and wait for it (`wait`), or delete it (`discard`; refused with 409 `UPLOADS_DISCARD_SHARED` for a mount served by its backend's shared connection)
- `wait_seconds` — With `uploads=wait` only: the longest the answer waits, in seconds
- `label` — Filter mounts by label. Only mounts with this exact label will be returned.
- `switch` — wait (the default): files closed before the update finish uploading before the switch. immediate: switch at once; those files upload later with the previous settings, and such an upload can replace a newer write made through the new settings. If those files cannot all be checked within 10 seconds, the update answers 409 MOUNT_BUSY and changes nothing.

**Body shapes:**

- `POST /api/v1/mounts` body — `{ auto_deliver: bool=true, backend_id*: string, label: string, mount_path: string, vfs_config: files_VfsConfigPatch }`
  - `auto_deliver` — Saved with the mount. It currently has no effect: files kept on the server are not uploaded, whatever its value. Changing it does not restart the mount. Default for new mounts: true.
  - `backend_id` — Backend ID: 16 lowercase hex characters, the data.id of the connect answer
  - `label` — Optional human-readable label for this mount (e.g., "My NAS", "Work S3", "Photos Backup"). Used by the UI to identify mounts. Can be used to filter mounts via GET /api/v1/mounts?label=...
  - `mount_path` — Path for the mount. If omitted, the mount gets a new directory of its own in the configured mount directory. Relative paths are resolved under the configured mount directory.
- `PATCH /api/v1/mounts/{id}` body — `{ auto_deliver: bool, vfs_config: files_VfsConfigPatch }`

### `s3` (1) — Access a file over S3

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{path}?type=s3` | Access file from S3 | `?type*` `?server*` `?s3_bucket*` `?s3_region*` `?user` `?pass` `?s3_endpoint` |

**Param notes:**

- `server` — S3 service host. An AWS host (`*.amazonaws.com`) is reached by `s3_region`; any other host is the endpoint of an S3-compatible service (MinIO, DigitalOcean Spaces, ...), unless `s3_endpoint` names one.
- `s3_bucket` — S3 bucket name. The connection is rooted at this bucket, and the path is the object key (or key prefix) within it. Reading an object also lists its folder, so the credentials (or anonymous access) need permission to list the bucket.
- `user` — Access key ID. Give both `user` and `pass`, or neither for anonymous access to a public bucket.
- `pass` — Secret access key (base64 encoded). Give both `user` and `pass`, or neither.
- `s3_endpoint` — Endpoint of an S3-compatible service (MinIO, etc.), as a host or URL. Takes precedence over `server`.

### `ssh` (2) — Access files over SSH/SFTP

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{path}?type=ssh` | Access file via SSH/SFTP | `?type*` `?server*` `?user*` `?pass` `?key` `?passphrase` |
| `PUT /{path}?type=ssh` | Upload file via SSH/SFTP | `?server*` `?user*` `?pass` `?key` `?passphrase` `body*:application/octet-stream` |

**Param notes:**

- `server` — Server hostname:port
- `user` — SSH username
- `pass` — Password (base64 encoded). Give `pass` or `key`; a request with neither is refused with 400.
- `key` — Private key in PEM form (base64 encoded). Give `pass` or `key`; a request with neither is refused with 400.
- `passphrase` — Key passphrase (base64 encoded)

### `ui` (1) — File operations - upload, download, delete, list files

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{path}` | List directory contents or download file | `?json` `?simple` `?sort` `?order` `?hash` `?sha256` `?base64` `?edit` `?view` `?download` `?content-type` `?history` `?at` `?revision` `?diff` `?from_seq` `?from_ts` `?to_seq` `?to_ts` `?after_id` `?limit` `?theme` `?colorScheme` `?font` `?fontSize` `?embedderOrigin` `?chromeless` `?borderless` `?hideHeader` `?hideSidebar` `?hidePreview` `?hideFooter` `?embedBg` |

**Param notes:**

- `path` — File or directory path
- `json` — Return JSON format instead of HTML
- `simple` — Directory only: return the entry names one per line (directories end in /) as text/plain
- `sort` — Sort by field
- `order` — Sort order
- `hash` — Get SHA256 hash of file (returns plain text hash)
- `sha256` — Get SHA256 hash of file (alias for hash)
- `base64` — Get file content as base64 encoded string
- `edit` — Open file in Web UI editor (requires allow-upload permission)
- `view` — Open file in a read-only Web UI page: the text is shown with no Save, rename, move or delete.
- `download` — For file paths only: force browser download (Content-Disposition: attachment). Accepted values: empty (?download), 1, or true. For directory paths, ?download is the URL download-manager operation.
- `content-type` — Override Content-Type header for file downloads
- `history` — List all revisions of a file recorded in the journal. Returns JSON with revisions array, pagination via after_id, and head_matches_disk: true when the file on disk holds what the journal's newest record of it says, false when it does not (an outside write, an unrecorded change, pruned history or missing content history can each cause this; the flag alone does not identify the cause); absent for a folder or any other path that is neither a file nor missing, and when the file could not be read. Mutually exclusive with at/revision/diff. The journal records only changes made through Hoody Files; a change made by the agent's tools, a terminal, a script or a program is not recorded.
- `at` — Read file content at a point in time, as the journal recorded it. Accepts RFC3339 timestamp or Unix milliseconds. Mutually exclusive with history/revision/diff. Composable with ?lines, ?hash, ?base64. The X-Journal-Head-Matches-Disk response header is true when the file on disk holds what the journal's newest record of it says, false when it does not (an outside write, an unrecorded change, pruned history or missing content history can each cause this; the flag alone does not identify the cause); absent for a folder or any other path that is neither a file nor missing, and when the file could not be read. The journal records only changes made through Hoody Files; a change made by the agent's tools, a terminal, a script or a program is not recorded.
- `revision` — Read file content by stable per-path sequence number. Mutually exclusive with history/at/diff. Composable with ?lines, ?hash, ?base64. The X-Journal-Head-Matches-Disk response header is true when the file on disk holds what the journal's newest record of it says, false when it does not (an outside write, an unrecorded change, pruned history or missing content history can each cause this; the flag alone does not identify the cause); absent for a folder or any other path that is neither a file nor missing, and when the file could not be read. The journal records only changes made through Hoody Files; a change made by the agent's tools, a terminal, a script or a program is not recorded.
- `diff` — Compute unified diff between two versions. Requires from_seq or from_ts. With to_seq or to_ts it compares two recorded versions; with neither it compares with the file as it is on disk now (410 when the file no longer exists, 422 when it is over the journal's size limit). Mutually exclusive with history/at/revision. The X-Journal-Head-Matches-Disk response header is true when the file on disk holds what the journal's newest record of it says, false when it does not (an outside write, an unrecorded change, pruned history or missing content history can each cause this; the flag alone does not identify the cause); absent for a folder or any other path that is neither a file nor missing, and when the file could not be read. The journal records only changes made through Hoody Files; a change made by the agent's tools, a terminal, a script or a program is not recorded.
- `from_seq` — Source revision seq number for ?diff. Mutually exclusive with from_ts.
- `from_ts` — Source timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with from_seq.
- `to_seq` — Target revision seq number for ?diff. Mutually exclusive with to_ts. Default: current file on disk.
- `to_ts` — Target timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with to_seq.
- `after_id` — Cursor for ?history pagination. Returns entries with id > after_id.
- `limit` — Max entries to return for ?history.
- `theme` — HTML page only: colour theme of the page. Default oc-1.
- `colorScheme` — HTML page only: light or dark colour scheme. Without it the page follows the system setting.
- `font` — HTML page only: monospace font of the editor and listing.
- `fontSize` — HTML page only: editor font size in pixels. Default 14.
- `embedderOrigin` — HTML page only: origin of the page that embeds this one, such as https://app.example.com. The page then accepts theme and layout messages from that origin and tells it when it is ready. Only https origins are accepted.
- `chromeless` — HTML page only: hide the header, sidebar, preview, footer and borders at once. Each can be turned back on with its own parameter set to false.
- `borderless` — HTML page only: hide the page borders.
- `hideHeader` — HTML page only: hide the header bar.
- `hideSidebar` — HTML page only: hide the sidebar.
- `hidePreview` — HTML page only: hide the preview pane.
- `hideFooter` — HTML page only: hide the footer.
- `embedBg` — HTML page only: transparent lets the background of the embedding page show through.

### `uploads` (8) — Held upload data

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/pending-uploads/{id}` | Discard a pending upload |  |
| `DELETE /api/v1/pending-uploads/unreadable/{id}` | Delete an unreadable pending upload |  |
| `POST /api/v1/pending-uploads/{id}/deliver` | Deliver a pending upload | `body` |
| `GET /api/v1/pending-uploads/{id}/file` | Download a held file | `?path` `?path_b64` `H:Range` `H:If-Range` |
| `GET /api/v1/pending-uploads` | List pending uploads | `?backend_id` |
| `GET /api/v1/pending-uploads/{id}/files` | List a pending upload's files | `?cursor` `?limit` |
| `GET /api/v1/pending-uploads/unreadable` | List unreadable pending uploads |  |
| `POST /api/v1/pending-uploads/{id}/stop` | Stop a running upload |  |

**Param notes:**

- `path` — A path from the item's files, exactly as listed. Give this or path_b64, not both.
- `path_b64` — A path_b64 from the item's files, exactly as listed. Give this or path, not both.
- `Range` — Ask for part of the held file, as 'bytes=first-last', 'bytes=first-' or 'bytes=-suffix_length', as for a file download. One satisfiable range answers 206 with Content-Range; several answer 206 as multipart/byteranges. Ranges that cannot be satisfied are dropped from a list, and 416 comes only when none is left. A malformed header is ignored (200, whole file).
- `If-Range` — Honour Range only if the held file still has this ETag, exactly; otherwise answer 200 with the whole file.
- `backend_id` — Only items of this backend
- `cursor` — next_cursor from the previous page. Omit it for the first page.
- `limit` — Largest number of files on the page

**Body shapes:**

- `POST /api/v1/pending-uploads/{id}/deliver` body — `{ backend_id: string, paths: string[], paths_b64: string[] }`
  - `backend_id` — Deliver with this backend's current connection settings instead of the item's saved ones. Use it when deliverable is false because the saved settings are no longer accepted, or to deliver to another backend.
  - `paths` — Paths from the item's files, exactly as listed. Omit this and paths_b64 to deliver every complete file.
  - `paths_b64` — path_b64 values from the item's files, exactly as listed. Combined with paths.

### `webdav` (8) — WebDAV protocol operations - PROPFIND, PROPPATCH, COPY, MOVE, LOCK, UNLOCK, OPTIONS

| Method | Summary | Params |
|--------|---------|--------|
| `COPY /{path}` | Copy a file | `H:Destination*` `H:Overwrite` |
| `GET /{path}?type=webdav` | Access file via WebDAV | `?type*` `?server*` `?user` `?pass` `?webdav_path` |
| `OPTIONS /{path}` | Get allowed methods |  |
| `PROPFIND /{path}` | Get WebDAV properties | `H:Depth` `body:application/xml` |
| `LOCK /{path}` | Lock file (WebDAV compatibility) | `H:Depth` `body:application/xml` |
| `MOVE /{path}` | Move or rename file/directory | `H:Destination*` `H:Overwrite` |
| `UNLOCK /{path}` | Unlock file (WebDAV compatibility) |  |
| `PROPPATCH /{path}` | Update WebDAV properties | `body:application/xml` |

**Param notes:**

- `path` — Source file path _(on `COPY /{path}`)_
- `Destination` — Destination URL for the copy _(on `COPY /{path}`)_
- `Overwrite` — T (default) replaces an existing destination; F refuses one, answering 412 and leaving it untouched. A request refused for another reason is answered for that reason instead, whatever this header says: copying or moving a resource onto itself is 403, and so is a source that is not a regular file. _(on `COPY /{path}`)_
- `webdav_path` — WebDAV endpoint path
- `Depth` — For directories, Depth 0 or 1 is accepted, defaulting to 1; other values receive 400. For files, Depth is ignored.
- `path` — Source file or directory path _(on `MOVE /{path}`)_
- `Destination` — Destination URL for the move _(on `MOVE /{path}`)_
- `Overwrite` — T (default) replaces an existing destination; F refuses one, answering 412 and leaving it untouched. A request refused for another reason is answered for that reason instead, whatever this header says: copying or moving a resource onto itself is 403. _(on `MOVE /{path}`)_
- `path` — Path of the file; a directory is answered 404 _(on `PROPPATCH /{path}`)_


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
