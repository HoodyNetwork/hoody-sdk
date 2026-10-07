> _**CLI skill · `files` namespace** · ~14,210 tokens · hoody-sdk v1.0.0-beta.16_

# `files` — container filesystem over HTTP, with automatic Git-like change history

## Purpose

**Default surface: the container's own filesystem, exposed over HTTP — with automatic mutation journaling when the deployment enabled it.** Read, write, copy, move, delete, stat, chmod, list, glob, grep, archive-preview/extract, fetch URLs into the FS, resumable upload — all on absolute container paths (`/home/user/main.py`, `/etc/hostname`, `/hoody/databases/foo.db`). No backend flag needed.

**Headline feature when journaling is on — automatic change history (think Git, but for every file write).** With the journal enabled, every `PUT` / `PATCH` / `DELETE` / `MOVE` / `COPY` is appended to a per-container mutation log: monotonic sequence number, timestamp, path, op, size, hash. **History is kept for journaled paths, within limits:** retention prunes old entries (90 days or 2 GiB of journal storage by default), bodies over 2 MiB keep only their hash and size, and excluded paths (dev dirs such as `node_modules`, and `.git`) are never recorded. The journal lets you:

- **Time-travel a single file** — `hoody files get` `?revision=<seq>` or `?at=<unix-ms>` returns the bytes as they were at that point.
- **List a file's history** — `hoody files get` `?history=1` returns one page of the path's revisions (renames followed), oldest first by global journal entry id: 100 entries by default, `limit` up to 1000. While the response has `has_more: true`, request again with `after_id` set to its `next_after_id`.
- **Diff between revisions** — `hoody files get` `?diff=1&from_seq=<N>` returns a unified diff between revision `N` and current.
- **Replay / audit** — `hoody files journal list` `?path=<p>&after_id=<id>` streams every operation after global journal entry `id` (while the response has `has_more: true`, resume from its `next_after_id`; on the last page `next_after_id` is `null`, so keep the last entry's `id` as your cursor; an entry's `seq` is its per-path revision number, not a cursor). Run `hoody files journal flush` to force-persist before querying for the absolute latest.
- **Cross-replicate** — pipe the journal into another container as an event source for mirroring / fan-out / append-only sync.

When the deployment turned journaling on, no per-write setup is needed — every covered write is recorded. Exposing the journal query endpoints — history, revision, diff, stats, flush — over the API is a second deployment-side switch; where it is off those endpoints return `403`. Where API access is on but recording itself is off, they return `404 Journal is not enabled`. It is not a complete undo: retention pruning, the 2 MiB body cap, the exclude lists and write paths with no journal hook (URL downloads, archive extraction) all leave gaps, so check `?history` before relying on a restore. Journaling is ON in the standard `hoody_kit: true` container image; raw kit deployments that did not turn it on will accept writes but skip recording.

**Optional add-ons (per-request, opt-in):**
- **Remote backends** — append `?backend=<id>` to operate against a backend you've connected, of any of the 49 allowed rclone backend types (Mega, SFTP, S3, GDrive, Dropbox, Backblaze B2, WebDAV, …), instead of the local FS. A `?type=` parameter does not select a connected backend: on `/api/v1/files/{path}` it is ignored and the request runs on the local FS. = &["] Only where the deployment enabled remote backends; otherwise `403`. Note: the journal records local-FS mutations; remote-backend ops go to the remote and aren't replayable from the journal.
- **FUSE mounts** — `hoody files mounts create` to surface a remote backend AS a path in the local FS. Same deployment-side requirement.
- **chmod / chown** — Unix-only, and only where the deployment enabled them; otherwise `403`.

## When to use

- **Local container FS (the 90% case)** — CRUD, archive entry / extract, cross-binary search (glob, grep), download a URL into a path, resumable upload. Local works out of the box.
- **Recover / inspect a previous version of any file** — `?history=1`, `?revision=<seq>`, `?at=<unix-ms>`, `?diff=1&from_seq=<N>`. Available where journaling and journal API access are on (`403` when API access is off, `404` when recording is off), for writes the journal recorded and still retains (see Quirks for what is excluded).
- **Audit / replay every change to the filesystem** — `hoody files journal list` for the full event stream (sequence, timestamp, path, op, size, hash).
- **Remote cloud / SSH / S3** — append `?backend=<id>` to read (`hoody files get`), upload (`hoody files upload`, not with `append`), delete (`hoody files delete`) or create a directory (`hoody files mkdir`). Only `get`, `upload`, `delete` and `mkdir` take `--backend`; `update`, `append`, `copy`, `move`, `archives extract` and `downloads create` have no such flag and refuse it as an unknown option, and `upload --append` with `--backend` is refused with `400`.
- **FUSE-mount a remote into the local FS** — when downstream code needs to read the remote as a regular path (under the mount directory, `/hoody/mounts/permanent/…` by default).

## When NOT to use

Run binaries -> `terminal`/`exec`, live events -> `watch`, TS/JS gen -> `exec`, indexed queries -> `sqlite`, traffic logs -> `proxyLogs`.

## Prerequisites

- **For plain read/stat/list**: no deployment switch, but any authentication and per-path access rules configured on the kit still apply (`401` without credentials, `403` for a path outside your rules). **Writes are enabled by the deployment, not per request**: upload/write/append and copy need write enabled, delete needs delete enabled, move needs both (403 otherwise; all enabled in the standard hoody_kit container image, off on a raw kit deployment that did not turn them on). Paths are absolute container paths; the namespace is not workspace-scoped, so use `/home/user/...`, `/etc/...`, etc.
- **For glob / grep**: gated separately — glob needs search enabled, grep needs grep enabled (403 "not allowed" otherwise; both enabled in the standard hoody_kit container image).
- **For remote backends** (`?backend=` / `?type=` / FUSE mounts): the deployment must have enabled remote backends; otherwise `403`.
- **For chmod / chown**: the deployment must have enabled them, and the container is Unix.
- **Which container, which path.** Every `hoody files` command acts on the container named by the global `-c <containerId>` (or `HOODY_CONTAINER`): its id from `hoody containers list -o json`, never its name. Without one the CLI refuses before sending anything. The positional `<path>` is an absolute path inside that container, not a file id.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Read, search, write

1. `hoody files get <path> --stat` or `--lines 10-50`.
2. `hoody files glob <dir> --pattern '**/*.ts'`; `hoody files grep <dir> --pattern TODO --context 2` (local only).
3. `hoody files upload <path> --append`; `hoody files delete <path>`.

### 2. Download, extract, FUSE-mount

1. `hoody files downloads create <dir> --download <url>`; `hoody files downloads list <dir> --downloads` to poll.
2. `hoody files archives preview <archive>`; `hoody files archives extract <archive> --extract src/ --dest work-src` (`--extract` is an exact entry name, or a directory prefix ending in `/`; no globs. `--dest` MUST be relative).
3. `hoody files backends s3 create` (49 backend types) -> `hoody files get <path> --backend <id>` for one-shot reads OR `hoody files mounts create` -> `hoody files get /hoody/mounts/permanent/...` for a regular FS view -> `hoody files mounts delete`, then `hoody files backends delete`. (A mounted path needs no `--backend`; `hoody files get`/`upload`/`delete` take it for a backend read.)

### 3. Journal time-travel + TUS-like upload

1. `hoody files get <path> --history`, `--revision N` or `--at <unix-ms>`, `--diff --from-seq N`.
2. `hoody files journal list --path <p> --after-id <id>` (global entry id, not `seq`; see Purpose for the last-page cursor rule); `hoody files journal flush` first.
3. Resumable: `hoody files upload` for the first chunk, then `hoody files append <path> --input <chunk>` per chunk (Example 3).

## Quirks & gotchas

- Reserved sub-prefixes (stat, chmod, chown, realpath, glob, grep, copy, move, append) dispatch by URL prefix, each scoped to a specific HTTP method (stat/grep/glob/realpath→GET, chmod/chown→PATCH, copy/move→POST, append→PUT) to prevent method bleeding -- so `DELETE /api/v1/files/stat/foo` does NOT trigger the stat dispatcher; it removes the literal path `/stat/foo`. `/api/v1/files/health` is a route of its own and never reaches the dispatcher.
- `hoody files glob`/`hoody files grep`/`hoody files realpath`/`?lines=` local-only; `?backend=` -> 400.
- `?backend=` and `?type=` need remote backends enabled deployment-side.
- `?backend=` on `/api/v1/files/{path}` is served only for GET, DELETE, PUT without `append`, and POST that creates a directory; on any other method or operation it returns `400` ("only supported for reading, uploading and deleting files and for creating directories"). `hoody files mkdir --backend <id>` creates the directory on the remote backend; `update`, `append`, `archives extract`, `downloads create`, `copy` and `move` have no `--backend` flag and reject it as an unknown option before any request is sent.
- `hoody files chmod`/`hoody files chown` Unix-only, and only where the deployment enabled them.
- WebDAV verbs on `/{path}`: PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK, CHECKAUTH, LOGOUT.
- `hoody files realpath` resolves symlinks whether or not symlink following is enabled, but still returns `403` when the resolved target is outside the serve root or outside your access rules.
- **Resumable upload PATCH must use the WebDAV root route (`PATCH /{path}`), NOT `PATCH /api/v1/files/{path}`** — the api/v1 PATCH expects a JSON body and rejects raw bytes with `400 Invalid JSON body`. The WebDAV form takes `X-Update-Range: append` — or an HTTP-Range offset `bytes=<start>-<end>` (a Content-Range-style `/<size>` suffix is REJECTED with `400 Invalid X-Update-Range Header`) — plus the raw body, and returns `204 No Content` on success. An explicit range's start must fall INSIDE the current file, but only that start is used: the whole body is written from it, the range end does not bound the write, and a body longer than the rest of the file extends it. A start at or past EOF is refused, so use `append` to continue at the end..0)),"]
- **Archive `?dest=` MUST be relative** (e.g. `?dest=extracted`), not absolute — sending `?dest=/abs/path` returns `400 Absolute destination path not allowed`. The directory is created relative to the archive's containing dir.
- **`?preview` query value matters** — pass `?preview` empty (no `=…`) for a full archive listing; `?preview=true` is parsed as the entry name `true` and returns `404 Entry not found in archive: true`. Same trap on `?contents`.
- **Bare `?extract_file=` is unhandled by the kit's GET dispatcher** — the request falls through to "send the raw archive file" and you get the **whole archive's bytes**, not the selected entry. The generated SDK and CLI work around this by ALSO sending `?extract=` — when both query params are present, the `hoody files archives extract` branch runs (writes to disk under `?dest=`). The OpenAPI-only `?extract_file=` form is effectively dead.
- **The journal retains body bytes only for files up to 2 MiB by default; a larger file still produces a journal entry with its hash and size, but its contents are not kept**.
- **Exclusions decide which paths are journalled.** Built-in dev-dir excludes (`node_modules`, `target`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `__pycache__`, `.venv`, `venv`, `env`, `__pypackages__`, `.tox`, `.nox`, `bower_components`, …) skip journaling unless the deployment turned the dev-dir exclusions off. `.git` is always excluded regardless of that setting (separate hardcoded check, not part of the toggleable list). The deployment can add further excludes of its own. This is why "I wrote to `node_modules/x` and saw no journal entry" is expected.
- **Journal does NOT cover everything by default.** Live behaviour observed: a fresh `PUT` (create) and an overwriting `PUT` (write) on `/home/user/...` produce entries; URL downloads (`?download=`) and archive extraction are NOT journaled — those write through paths with no journal hook. `hoody files chmod`, `hoody files chown`, `hoody files touch`, `?append=true` and copy/move ARE recorded. Always call `hoody files journal flush` then `hoody files journal list` (or `?history=1`) to inspect what was actually recorded — don't assume coverage.
- **Built-in dev-dir exclude list always skips journaling** for `node_modules`, `__pycache__`, `.venv`, `target`, `.next`, `.nuxt`, etc. — even on `/home/user/...` paths. Only the deployment can turn these off, at kit start. `.git` is hardcoded to ALWAYS be excluded and stays excluded even then.
- **`HEAD` answers like `GET` with no body** on both routes: `HEAD /api/v1/files/{path}` returns the status and headers its `GET` would, and so does `HEAD /{path}`. It carries no metadata body; for a JSON metadata envelope use `hoody files stat`.
- **`hoody files chown` to root is rejected** with `400 Cannot change ownership to root (UID 0)` (owner) or `400 Cannot change group to root (GID 0)` (group) — even where the deployment enabled chown. Use a non-root user (`nobody`, `user`, …).
- **FUSE mount paths live under a configured mount directory** (`/hoody/mounts/permanent` by default, fixed by the deployment at kit start). An absolute `mount_path` must be under it (`400 Mount path must be under the configured mount directory` otherwise); a relative `mount_path` is resolved under it; an omitted one becomes `<mount dir>/mount_<id>`. If the path already exists and is not a symlink, the create fails with `409 Mount path already exists and is not a symlink`.
- **Listing-style query params (`?downloads`, `?download_history`, `?extractions`, `?extraction_history`) are honoured on the WebDAV root route, NOT on `/api/v1/files/...`** — calling `GET /api/v1/files/<dir>?downloads` returns a regular directory listing (the query is ignored). Use `GET /<dir>?downloads` (or `GET /?download_history` for the global feed).
- **Mount the whole FS as a local drive on the USER's machine (client-side WebDAV).** Because the kit serves a WebDAV API at its URL root, the OS's built-in WebDAV client can mount the container's files as a drive/folder: on **Windows** *Map network drive* to `https://{P}-{C}-files-1.{N}.containers.hoody.com/`, on **macOS** Finder → *Connect to Server* to the same URL. For a cross-platform, scriptable mount use `hoody mount <containerId> <localDir>` (`--read-only`/`--background`/`--auth-token`/`--auth-password`/`--auth-ip` flags); it runs rclone over WebDAV, so rclone must be installed on the local machine. This is the inverse of the server-side FUSE mounts (which mount remote backends INTO the container).
- **Known defect (CLI):** `hoody files exists` sends `HEAD`, and the CLI prints no body for a `HEAD` answer, so it shows no metadata, history or diff. For metadata use `files stat <path>` or `files get <path> --stat`; for history and diffs use `files get <path> --history` or `--diff --from-seq <N>`.
- **`hoody files chunks write <path> --input <file>` only appends, and only to a file that already exists.** It sends the bytes raw (a piped stdin works too), the append position is fixed, so there is no position flag to set, and it replies `204` with no body. It creates nothing: `hoody files upload <path> --append` creates a missing file and answers JSON.
- **Replace, refuse, create parents.** `hoody files upload` replaces an existing file (`--append` adds to its end instead) and creates missing parent directories. `hoody files copy` refuses an existing destination unless you pass `--overwrite true`. `hoody files move` never replaces a destination and has no overwrite option: delete the destination first. Both create the destination's missing parent directories.
- **`hoody files delete` on a directory deletes it with everything under it**, with no non-recursive mode for directories.
- **`hoody files mkdir` succeeds when the directory is already there**, and creates missing parent directories.
- **Pending uploads need remote mounts enabled.** `hoody files uploads list` lists them; `hoody files uploads files list`, `hoody files uploads download`, `hoody files uploads deliver`, `hoody files uploads stop` and `hoody files uploads delete` work on a file service started with remote mounts allowed; on one without, every pending-uploads request answers `403 REMOTE_DISABLED`.

## Common errors

- 400 not supported with remote backends -- drop `?backend=`.
- 400 Cannot combine realpath with other ops.
- 400 Cannot preview a directory as archive.
- 400 Unknown operation -- POST needs one query op.
- 400 Missing query parameter or request body -- PATCH needs op or body.
- Refusals on the WebDAV path route (`/{path}`) answer JSON `{success: false, error, code}`: `ACCESS_FORBIDDEN` 403, `RESOURCE_NOT_FOUND` 404, `INVALID_PATH` 400, `PATH_CONFLICT` 409, `OVERWRITE_REFUSED` 412 (a WebDAV `COPY`/`MOVE` with `Overwrite: F` onto an existing target), `DIRECTORY_EXISTS` 405 (creating a directory that exists), `PAYLOAD_TOO_LARGE` 413, `UPLOAD_INCOMPLETE` 400 and `REMOTE_UPLOAD_FAILED` 502 (an upload to a remote backend), and `MOUNT_PATH_RESERVED` 409 for a change to a path a mount holds. `INVALID_PARAMETER` means the request itself is wrong; a failure that a changed request would not fix (an OS error, a backend failure, the concurrent-download limit's 429) carries no `code`, so branch on the status. On `/api/v1/files/{path}` many refusals carry no `code` — a REST copy or move onto an existing target without overwrite is 409 `{success: false, error}`. The REST codes are `INVALID_PATH` 400 (`{success: false, error: "Invalid path", code: "INVALID_PATH"}`), `ACCESS_FORBIDDEN` 403 (a path rule), `CONTAINS_SERVICE_STORAGE` 409, `FILE_MOVE_CROSSES_DEVICES` 409, `INVALID_PARAMETER` 400 on some parameter checks, and `FILE_PATH_BUSY`, `FILE_PATH_CHANGED` and `MOUNT_PATH_RESERVED` 409 for a change to a path that is in use or held for a mount. When `code` is absent, branch on the HTTP status.
- A URL download streams into a hidden part file, `.hoody-download-<id>.part`, in the destination folder, and the file gets its final name only once it is complete. Cancelling the download (or a failure or timeout) removes that part file: where inode numbers identify a file (local filesystems such as ext4, xfs, btrfs, tmpfs) only if its inode is still the one the download created, and elsewhere (FUSE mounts, network filesystems) by its download-specific name while it is a regular file.

## Related namespaces

- `terminal` -- run binaries.
- `exec` -- TS/JS gen.
- `watch` -- live events.
- `sqlite` -- indexed queries.
- `browser`/`curl` -- scripted HTTP.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. Examples that need history use `/home/user/...`. The kit has no fixed rule for `/tmp` or `/home/user`: coverage depends on the exclude lists, so check `?history` rather than assuming it. An idle kit may be asleep: the first request can return `502` from the proxy with an HTML error body, so retry 2-3 times with a few seconds of backoff.

### 1. Read a file — full bytes, stat envelope, and a slice of lines

**Goal:** inspect an unknown text file three ways: get its metadata, peek the raw bytes, and slice an arbitrary line range without pulling the whole thing.

**Step 1 — stat first.** `hoody files stat` returns size, owner/group, octal permissions, mtime, and, when the journal has recorded the path, `revisions`: the path's latest per-path revision number. The field is absent for a path the journal has not recorded, and it is not a count of the entries still retained after pruning. Use this BEFORE downloading a file you don't know the size of.

```bash
hoody --container "$C" files stat /etc/hostname
```

**Step 2 — line slice.** `?lines=2-3` returns just lines 2 through 3 inclusive. Local-FS only (rejected with `400` when combined with `?backend=`).

```bash
hoody --container "$C" files get /var/log/syslog --lines 2-3
```

**Step 3 — full body.** No query params, raw bytes (or `Content-Type: application/octet-stream` for binaries).

```bash
hoody --container "$C" files get /etc/hostname --out-file /tmp/hostname.txt   # byte for byte, text or binary
hoody --container "$C" -o raw files get /etc/hostname                          # a text file to stdout; without -o raw it prints as a JSON string
```

### 2. Find files then grep them — TODO scan across a tree

**Goal:** find every `.md` file under a directory, then grep them for `TODO` with surrounding context. Both ops are local-FS only.

**Step 1 — glob.** `pattern` matches relative to `path`; obeys `.gitignore` unless `no_ignore=true`.

```bash
hoody --container "$C" files glob /home/user --pattern '**/*.md' --max-results 200 \
  -o json | jq '.entries[].name'
```

**Step 2 — grep with context.** `?glob=` filters which files grep looks at; `?context=2` mirrors `grep -C 2`.

```bash
hoody --container "$C" files grep /home/user --pattern TODO \
  --glob '**/*.md' --context 2 --ignore-case -o json \
  | jq '.matches[] | {path, line_number, line}'
```

### 3. Resumable upload — split a payload into PUT-then-PATCH-append chunks

**Goal:** push a 16 MiB payload as 8 MiB chunks. Many CDN/proxy combos cap a single body at 10 MiB; chunked upload sidesteps that.

**Step 1 — first chunk via PUT.** Creates the file with the first slab.

```bash
head -c $((8*1024*1024)) /dev/urandom > /tmp/chunk1.bin
hoody --container "$C" files upload /home/user/upload-test.bin < /tmp/chunk1.bin
```

**Step 2 — append remaining chunks.** Send `PATCH /<path>` (the WebDAV root route, NOT `/api/v1/files/...` — that one expects JSON and 400s on raw bytes). Header `X-Update-Range: append` says "concatenate". Returns `204 No Content`.

```bash
head -c $((8*1024*1024)) /dev/urandom > /tmp/chunk2.bin
hoody --container "$C" files append /home/user/upload-test.bin --input /tmp/chunk2.bin
hoody --container "$C" files stat /home/user/upload-test.bin
```

**Step 3 — resume after a network drop.** A WebDAV append (`PATCH /{path}` with `X-Update-Range: append`) writes bytes as they arrive, so a request that broke off may already have added part of its chunk. A REST append (`PUT /api/v1/files/append/{path}`, or an upload with `append`) stages the whole body first, so a body that broke off leaves the file unchanged, although a failure during the write that follows can still leave part of the chunk appended. Either way, do not resend the whole chunk blindly: stat the remote file, compare its size with how many bytes of the payload you have sent, and append only the bytes after that size. An explicit `bytes=<start>-<end>` range (no `/<total>` suffix — that is rejected) must start inside the existing file and writes the whole body from that start, so it can rewrite a tail you know is wrong, but a start at EOF is refused; appending is the way to continue. The CLI sends only appends (`hoody files append`); explicit byte ranges need raw HTTP.

### 4. Time-travel a single file — history → revision N → diff

**Goal:** roll back a config file by reading an earlier revision, comparing it to current, then writing the chosen revision back. Use a path the journal covers: not under an excluded directory (`.git`, dev dirs such as `node_modules`, or excludes the deployment added — see Quirks), and confirm with `?history`.

**Step 1 — write two revisions.**

```bash
FILE_PATH=/home/user/config.toml
echo 'verbose = false' | hoody --container "$C" files upload "$FILE_PATH"
sleep 1
echo 'verbose = true'  | hoody --container "$C" files upload "$FILE_PATH"
hoody --container "$C" files journal flush
```

**Step 2 — list history.** `?history=1` returns one page of the per-revision log (100 entries by default, `limit` up to 1000; while `has_more` is `true`, repeat with `after_id` set to the response's `next_after_id`): each entry has `seq`, `op` (`"create"` / `"write"` / `"delete"` / `"moved_from"`/`"moved_to"` / etc. — see Example 5 for the full enum), `ts`, hashes, and size deltas.

```bash
hoody --container "$C" files get "$FILE_PATH" --history -o json \
  | jq '.revisions[] | {seq, op, ts, size_after}'
```

**Step 3 — fetch revision N.** `?revision=1` returns the bytes of that point-in-time. (Use `?at=<unix-ms>` for an instant.)

```bash
hoody --container "$C" files get "$FILE_PATH" --revision 1
hoody --container "$C" files get "$FILE_PATH" --diff --from-seq 1
```

**Step 4 — restore by writing rev1 bytes back.** PUT the body returned by `?revision=1`.

### 5. Audit — stream every mutation since a cursor via the journal

**Goal:** wire a SIEM / alerting pipeline. Get every FS mutation since the last cursor, including hashes for tamper detection. Don't forget `hoody files journal flush` first.

**Step 1 — flush so buffered journal writes are on disk.**

```bash
hoody --container "$C" files journal flush
```

**Step 2 — query since cursor.** `after_id` is the last `id` you've seen. `op` enum is `"create"` / `"write"` / `"append"` / `"delete"` / `"touch"` / `"moved_from"` / `"moved_to"` / `"copied_from"` / `"copied_to"` / `"dir_moved_from"` / `"dir_moved_to"` / `"dir_copied_from"` / `"dir_copied_to"` / `"dir_deleted"` / `"mkdir"` / `"chmod"` / `"chown"` / `"gap"` (no bare `"move"`/`"copy"` — use the directional `"moved_from"`/`"moved_to"` etc. pair).

The response carries `has_more`. `next_after_id` is set only while `has_more` is true; on the last page it is `null`. Advance the cursor to `next_after_id` when it is set, otherwise to the last entry's `id`, and keep the old cursor when the page is empty. Storing `null` would restart the next poll from the beginning of the journal.

```bash
LAST=${LAST:-0}   # cursor; persist client-side
R=$(hoody --container "$C" files journal list --after-id "$LAST" --limit 200 -o json)
echo "$R" | jq '{count, has_more, entries}'
LAST=$(echo "$R" | jq --argjson last "$LAST" '.next_after_id // (.entries | last | .id) // $last')
```

**Step 3 — health check.** Watch `hoody files journal stats` for `writer_healthy:false`, `parse_failures`, or `skipped_overflow > 0` — any of those means the audit trail is degraded.

```bash
hoody --container "$C" files journal stats
```

### 6. Download a URL straight into the FS (no curl, no wget needed)

**Goal:** pull an asset from the public internet into a container path. The kit handles the actual HTTP fetch — useful for sandboxed containers without outbound HTTP libs.

**Step 1 — download.** `GET /<directory>?download=<url>&filename=<name>` (URL-encode the URL). The directory must already exist (a missing one is `404`), so create it first. The request waits until the download has finished, then answers `201` with a `download_id`; to watch progress, list active downloads from a separate request while this one is still running.

```bash
hoody --container "$C" files mkdir /home/user/inbox   # the target directory must exist
hoody --container "$C" files downloads create /home/user/inbox \
  --download 'https://httpbin.org/robots.txt' --filename robots.txt --timeout 15
```

**Step 2 — list active** (from a second request while a download runs; a finished one moves to the history). `?downloads` ONLY works on the WebDAV root route — `GET /api/v1/files/<dir>?downloads` ignores the flag and returns a normal listing.

```bash
hoody --container "$C" files downloads list /home/user/inbox --downloads
hoody --container "$C" files downloads history list --download-history
```

### 7. Archive workflow — preview, then selective extract

**Goal:** extract just one subpath of a zip without unpacking the whole archive.

**Step 1 — preview** to see what's inside. `?preview` MUST be empty — `?preview=true` is parsed as the entry name `true` and 404s.

```bash
hoody --container "$C" files archives preview /home/user/inbox/hello.zip --preview ''
```

**Step 2 — extract a subset.** `?extract=<entry>` selects entries: an exact archive entry name extracts that one file, a directory prefix ending in `/` (`src/`) extracts that subtree, and an empty value extracts everything. There is no glob matching (`src/**` matches nothing). `?dest=` MUST be relative — absolute paths return `400 Absolute destination path not allowed`. Destination is created relative to the archive's parent dir.

```bash
hoody --container "$C" files archives extract /home/user/inbox/hello.zip \
  --extract 'Hello-World-master/' --dest extracted
```

**Step 3 — extract a single file to disk.** Pass BOTH `?extract=<entry>` and `?extract_file=<entry>` (the bare `?extract_file=` form falls through to "send whole archive"). The kit writes the matched entry under `?dest=`; without `dest` it creates a directory named after the archive beside it (`hello.zip` → `hello/`, `x.tar.gz` → `x/`) and extracts there.

```bash
# extract-file writes the entry to disk and prints an extraction response, not the file
hoody --container "$C" files archives members extract /home/user/inbox/hello.zip \
  --extract Hello-World-master/README --dest extracted
# the entry keeps its archive path under dest; download it separately
hoody --container "$C" files get /home/user/inbox/extracted/Hello-World-master/README --out-file /tmp/readme.txt
```

### 8. Cross-directory copy + move + chmod (a one-shot deploy)

**Goal:** stage a config in a working dir, copy to the target, set permissions, move the staging file to a backup folder. Uses POST against the copy/move reserved-prefix routes (`/api/v1/files/copy/...`, `/move/...`) and PATCH for chmod/chown (`/api/v1/files/chmod/...`, `/chown/...`).

**Step 1 — copy.** Both `copy_to` and (for move) `move_to` are **query params**, NOT body fields. Add `?overwrite=true` to allow replacing an existing destination.

```bash
hoody --container "$C" files copy /home/user/staging/app.toml \
  --copy-to /etc/myapp/app.toml --overwrite true
```

**Step 2 — chmod.** Octal as a query param (`?chmod=600`). Requires chmod enabled by the deployment; Unix-only.

```bash
hoody --container "$C" files chmod /etc/myapp/app.toml --chmod 600
```

**Step 3 — move staging → archive.** Same pattern as copy but no overwrite by default; `?move_to=` is required.

```bash
hoody --container "$C" files move /home/user/staging/app.toml \
  --move-to /home/user/archive/app.toml
```

### 9. Connect a remote backend, mount it as a path, list through both surfaces

**Goal:** attach a remote backend (here `sftp`, with a placeholder host, user and password; `s3`, `drive` and the other types take the same steps with their own config) and surface it as a regular FS path via FUSE. Requires remote backends enabled by the deployment.

**Step 1 — connect.** Each backend has its own `POST /api/v1/backends/<type>` with type-specific config. Returns `201` with `{success, message, data: {id, type, vfs_backend_type, config, mount_paths}}`; the backend id is `data.id` (`config` has credentials stripped).

```bash
BID=$(hoody --container "$C" files backends sftp create \
  --host sftp.example.com --user deploy --pass "$SFTP_PASS" \
  --description sftp-example -o json | jq -r '.data.id')   # the kit's own {success,message,data} body is printed as-is → .data.id
hoody --container "$C" files backends test "$BID"
```

**Step 2 — mount.** `mount_path` is resolved against the kit's configured mount directory (default `/hoody/mounts/permanent`): an absolute path must be under it (`400 Mount path must be under the configured mount directory` otherwise), a relative path is joined under it, and an existing non-symlink path returns `409 Mount path already exists and is not a symlink`.

```bash
MID=$(hoody --container "$C" files mounts create \
  --backend-id "$BID" --label sftp-mount \
  --mount-path /hoody/mounts/permanent/sftp-test -o json | jq -r '.data.id')   # same kit body shape → .data.id
```

**Step 3 — read through the mount as a regular path.**

```bash
hoody --container "$C" files get /hoody/mounts/permanent/sftp-test
```

**Step 4 — tear down** (in order: unmount, then disconnect).

```bash
hoody --container "$C" files mounts delete "$MID"
hoody --container "$C" files backends delete "$BID"
```

### 10. Bulk delete a tree — and verify nothing is left

**Goal:** wipe a working directory and every file under it, then confirm via journal + listing that nothing remains. The recursive delete is not atomic: if it fails partway, the entries already removed stay removed and the rest remain, so always verify.

**Step 1 — DELETE on the directory.** `DELETE /api/v1/files/<dir>` removes recursively. (Reserved-prefix trap: a path like `/api/v1/files/stat/foo` is interpreted as removing `/stat/foo`, NOT a stat call. Always use absolute container paths.)

```bash
hoody --container "$C" files delete /home/user/files-examples-cleanup -y
```

**Step 2 — verify.** A `404` from `hoody files stat` is what you want.

```bash
# only a 404 proves absence; 401/403/5xx or a connection error is a failed check
if out=$(hoody --container "$C" files stat /home/user/files-examples-cleanup 2>&1); then
  echo "still present"
elif printf '%s' "$out" | grep -q 'Error \[404'; then
  echo "gone"
else
  printf '%s\n' "$out" >&2; exit 1
fi
```

**Step 3 — confirm via journal.** A journaled directory delete records one `op: "dir_deleted"` entry for the directory itself (no per-path `seq`), not an entry per child; deleting a single file records `op: "delete"`. Flush first.

```bash
hoody --container "$C" files journal flush
hoody --container "$C" files journal list --path /home/user/files-examples-cleanup --limit 10
```

## Reference

### `hoody files` (113) — File operations and remote backends

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody files append` |  | write | Append data to file | `files.append` | `hoody files append /home/user/file.txt --input ./local-file` |
| `hoody files archives extract` |  | write | Extract an archive (--owner sets the owner of the extracted files; the reply is then shorter) | `files.archives.extract` | `hoody files archives extract /home/user/archive.zip --extract src/main.rs --owner <owner>` |
| `hoody files archives extract` |  | write | Extract an archive with an owner for the new files (answers success and message only) | `files.mkdir` | `hoody files archives extract /home/user/archive.zip --extract src/main.rs --owner <owner>` |
| `hoody files archives members extract` |  | write | Extract file from archive | `files.archives.extractMember` | `hoody files archives members extract /home/user/archive.zip --extract src/main.rs` |
| `hoody files archives members read` |  | read | View file from archive | `files.archives.readMember` | `hoody files archives members read /home/user/archive.zip --preview src/main.rs` |
| `hoody files archives preview` |  | read | Preview archive contents or read file | `files.archives.preview` | `hoody files archives preview /home/user/archive.zip` |
| `hoody files backends azureblob create` |  | write | Connect to azureblob backend | `files.backends.createAzureblob` | `hoody files backends azureblob create --archive-tier-delete --chunk-size 4194304` |
| `hoody files backends azurefiles create` |  | write | Connect to azurefiles backend | `files.backends.createAzurefiles` | `hoody files backends azurefiles create --chunk-size 4194304 --client-send-certificate-chain` |
| `hoody files backends b2 create` |  | write | Connect to b2 backend | `files.backends.createB2` | `hoody files backends b2 create --account acc-abc --chunk-size 100663296 --copy-cutoff 4294967296 --key <key>` |
| `hoody files backends box create` |  | write | Connect to box backend | `files.backends.createBox` | `hoody files backends box create --auth-url https://example.com/auth --box-sub-type user` |
| `hoody files backends cloudinary create` |  | write | Connect to cloudinary backend | `files.backends.createCloudinary` | `hoody files backends cloudinary create --adjust-media-files-extensions --api-key <api_key> --api-secret <api_secret> --cloud-name <cloud_name> --description 'My description'` |
| `hoody files backends delete` |  | destructive | Disconnect backend | `files.backends.delete` | `hoody files backends delete abc-123 --uploads keep` |
| `hoody files backends drive create` |  | write | Connect to drive backend | `files.backends.createDrive` | `hoody files backends drive create --acknowledge-abuse --allow-import-name-change` |
| `hoody files backends dropbox create` |  | write | Connect to dropbox backend | `files.backends.createDropbox` | `hoody files backends dropbox create --auth-url https://example.com/auth --batch-commit-timeout 600` |
| `hoody files backends fichier create` |  | write | Connect to fichier backend | `files.backends.createFichier` | `hoody files backends fichier create --cdn --description 'My description'` |
| `hoody files backends filefabric create` |  | write | Connect to filefabric backend | `files.backends.createFilefabric` | `hoody files backends filefabric create --description 'My description' --encoding 50429954 --url https://storagemadeeasy.com` |
| `hoody files backends filescom create` |  | write | Connect to filescom backend | `files.backends.createFilescom` | `hoody files backends filescom create --description 'My description' --encoding 60923906` |
| `hoody files backends ftp create` |  | write | Connect to ftp backend | `files.backends.createFtp` | `hoody files backends ftp create --allow-insecure-tls-ciphers --ask-password --host ftp.example.com` |
| `hoody files backends get` |  | read | Get backend details | `files.backends.get` | `hoody files backends get abc-123` |
| `hoody files backends gofile create` |  | write | Connect to gofile backend | `files.backends.createGofile` | `hoody files backends gofile create --description 'My description' --encoding 323331982` |
| `hoody files backends googlecloudstorage create` |  | write | Connect to google cloud storage backend | `files.backends.createGoogleCloudStorage` | `hoody files backends googlecloudstorage create --anonymous --auth-url https://example.com/auth` |
| `hoody files backends googlephotos create` |  | write | Connect to google photos backend | `files.backends.createGooglePhotos` | `hoody files backends googlephotos create --auth-url https://example.com/auth --batch-commit-timeout 600` |
| `hoody files backends hdfs create` |  | write | Connect to hdfs backend | `files.backends.createHdfs` | `hoody files backends hdfs create --description 'My description' --encoding 50430082 --namenode namenode-1:8020,namenode-2:8020` |
| `hoody files backends hidrive create` |  | write | Connect to hidrive backend | `files.backends.createHidrive` | `hoody files backends hidrive create --auth-url https://example.com/auth --chunk-size 50331648` |
| `hoody files backends http create` |  | write | Connect to http backend | `files.backends.createHttp` | `hoody files backends http create --description 'My description' --headers '{}' --url https://example.com` |
| `hoody files backends iclouddrive create` |  | write | Connect to iclouddrive backend | `files.backends.createIclouddrive` | `hoody files backends iclouddrive create --apple-id abc-123 --client-id d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d --description 'My description' --password <password>` |
| `hoody files backends imagekit create` |  | write | Connect to imagekit backend | `files.backends.createImagekit` | `hoody files backends imagekit create --description 'My description' --encoding 117553486 --endpoint https://example.com --private-key <private_key> --public-key pk_abc123` |
| `hoody files backends internetarchive create` |  | write | Connect to internetarchive backend | `files.backends.createInternetarchive` | `hoody files backends internetarchive create --description 'My description' --disable-checksum` |
| `hoody files backends jottacloud create` |  | write | Connect to jottacloud backend | `files.backends.createJottacloud` | `hoody files backends jottacloud create --auth-url https://example.com/auth --client-credentials` |
| `hoody files backends koofr create` |  | write | Connect to koofr backend | `files.backends.createKoofr` | `hoody files backends koofr create --description 'My description' --encoding 50438146 --endpoint https://example.com --password <password> --user alice` |
| `hoody files backends linkbox create` |  | write | Connect to linkbox backend | `files.backends.createLinkbox` | `hoody files backends linkbox create --description 'My description' --email user@example.com --password <password> --token <token>` |
| `hoody files backends list` |  | read | List all backends | `files.backends.list` | `hoody files backends list` |
| `hoody files backends mailru create` |  | write | Connect to mailru backend | `files.backends.createMailru` | `hoody files backends mailru create --auth-url https://example.com/auth --check-hash --pass <pass> --user alice` |
| `hoody files backends mega create` |  | write | Connect to mega backend | `files.backends.createMega` | `hoody files backends mega create --debug --description 'My description' --pass <pass> --user alice` |
| `hoody files backends netstorage create` |  | write | Connect to netstorage backend | `files.backends.createNetstorage` | `hoody files backends netstorage create --account acc-abc --description 'My description' --host example.com --protocol http --secret <secret>` |
| `hoody files backends onedrive create` |  | write | Connect to onedrive backend | `files.backends.createOnedrive` | `hoody files backends onedrive create --access-scopes 'Files.Read Files.ReadWrite Files.Read.All Files.ReadWrite.All Sites.Read.All offline_access' --auth-url https://example.com/auth` |
| `hoody files backends opendrive create` |  | write | Connect to opendrive backend | `files.backends.createOpendrive` | `hoody files backends opendrive create --access private --chunk-size 10485760 --password <password> --username alice` |
| `hoody files backends oracleobjectstorage create` |  | write | Connect to oracleobjectstorage backend | `files.backends.createOracleobjectstorage` | `hoody files backends oracleobjectstorage create --attempt-resume-upload --chunk-size 5242880 --namespace <namespace> --provider no_auth --region eu-west-1` |
| `hoody files backends pcloud create` |  | write | Connect to pcloud backend | `files.backends.createPcloud` | `hoody files backends pcloud create --auth-url https://example.com/auth --client-credentials` |
| `hoody files backends pikpak create` |  | write | Connect to pikpak backend | `files.backends.createPikpak` | `hoody files backends pikpak create --chunk-size 5242880 --description 'My description'` |
| `hoody files backends pixeldrain create` |  | write | Connect to pixeldrain backend | `files.backends.createPixeldrain` | `hoody files backends pixeldrain create --api-url https://pixeldrain.com/api --description 'My description'` |
| `hoody files backends premiumizeme create` |  | write | Connect to premiumizeme backend | `files.backends.createPremiumizeme` | `hoody files backends premiumizeme create --auth-url https://example.com/auth --client-credentials` |
| `hoody files backends protondrive create` |  | write | Connect to protondrive backend | `files.backends.createProtondrive` | `hoody files backends protondrive create --description 'My description' --enable-caching` |
| `hoody files backends putio create` |  | write | Connect to putio backend | `files.backends.createPutio` | `hoody files backends putio create --auth-url https://example.com/auth --client-credentials` |
| `hoody files backends qingstor create` |  | write | Connect to qingstor backend | `files.backends.createQingstor` | `hoody files backends qingstor create --chunk-size 4194304 --connection-retries 3` |
| `hoody files backends quatrix create` |  | write | Connect to quatrix backend | `files.backends.createQuatrix` | `hoody files backends quatrix create --api-key <api_key> --description 'My description' --effective-upload-time 4s --host example.com` |
| `hoody files backends s3 create` |  | write | Connect to s3 backend | `files.backends.createS3` | `hoody files backends s3 create --bucket-object-lock-enabled --bypass-governance-retention` |
| `hoody files backends seafile create` |  | write | Connect to seafile backend | `files.backends.createSeafile` | `hoody files backends seafile create --2fa --create-library --url https://cloud.seafile.com/` |
| `hoody files backends sftp create` |  | write | Connect to sftp backend | `files.backends.createSftp` | `hoody files backends sftp create --ask-password --chunk-size 32768 --host example.com --user user` |
| `hoody files backends sharefile create` |  | write | Connect to sharefile backend | `files.backends.createSharefile` | `hoody files backends sharefile create --auth-url https://example.com/auth --chunk-size 67108864` |
| `hoody files backends sia create` |  | write | Connect to sia backend | `files.backends.createSia` | `hoody files backends sia create --api-url https://example.com --description 'My description' --encoding 50436354` |
| `hoody files backends smb create` |  | write | Connect to smb backend | `files.backends.createSmb` | `hoody files backends smb create --case-insensitive --description 'My description' --host example.com` |
| `hoody files backends sugarsync create` |  | write | Connect to sugarsync backend | `files.backends.createSugarsync` | `hoody files backends sugarsync create --description 'My description' --encoding 50397186` |
| `hoody files backends swift create` |  | write | Connect to swift backend | `files.backends.createSwift` | `hoody files backends swift create --auth https://auth.api.rackspacecloud.com/v1.0 --auth-version 0` |
| `hoody files backends test` |  | read | Test backend connection | `files.backends.test` | `hoody files backends test abc-123` |
| `hoody files backends ulozto create` |  | write | Connect to ulozto backend | `files.backends.createUlozto` | `hoody files backends ulozto create --description 'My description' --encoding 50438146` |
| `hoody files backends update` |  | write | Update backend credentials | `files.backends.update` | `hoody files backends update abc-123 --body '{}'` |
| `hoody files backends webdav create` |  | write | Connect to webdav backend | `files.backends.createWebdav` | `hoody files backends webdav create --auth-redirect --description 'My description' --url https://example.com` |
| `hoody files backends yandex create` |  | write | Connect to yandex backend | `files.backends.createYandex` | `hoody files backends yandex create --auth-url https://example.com/auth --client-credentials` |
| `hoody files backends zoho create` |  | write | Connect to zoho backend | `files.backends.createZoho` | `hoody files backends zoho create --auth-url https://example.com/auth --client-credentials` |
| `hoody files chmod` |  | write | Change file permissions | `files.chmod` | `hoody files chmod /home/user/file.txt --chmod 755` |
| `hoody files chown` |  | write | Change file ownership | `files.chown` | `hoody files chown /home/user/file.txt --chown user:group` |
| `hoody files chunks write` |  | write | Append bytes to an existing file (no creation, no offsets); `files upload --append` creates a missing file | `files.writeChunk` | `hoody files chunks write /home/user/file.txt --input ./local-file` |
| `hoody files copy` |  | write | Copy file or directory | `files.copy` | `hoody files copy /home/user/file.txt --copy-to <copy_to> --overwrite true` |
| `hoody files delete` |  | destructive | Delete file or directory | `files.delete` | `hoody files delete /home/user/file.txt -y` |
| `hoody files downloads cancel` |  | action | Cancel a running download | `files.downloads.cancel` | `hoody files downloads cancel 3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| `hoody files downloads create` |  | write | Download a file from a URL into a directory (--owner sets the owner of the new file; the reply is then shorter) | `files.downloads.create` | `hoody files downloads create /home/user/src --download <download_from> --timeout 10 --owner <owner>` |
| `hoody files downloads create` |  | write | Download a file from a URL with an owner for the new file (answers success and message only) | `files.mkdir` | `hoody files downloads create /home/user/src --download <download_from> --timeout 10 --owner <owner>` |
| `hoody files downloads history list` |  | read | Download history | `files.downloads.listHistory` | `hoody files downloads history list` |
| `hoody files downloads list` |  | read | List all active downloads | `files.downloads.list` | `hoody files downloads list` |
| `hoody files downloads list` |  | read | List active downloads of a directory | `files.downloads.listByDirectory` | `hoody files downloads list` |
| `hoody files exists` |  | read | Get file metadata | `files.exists` | `hoody files exists /home/user/file.txt --history` |
| `hoody files extractions cancel` |  | action | Cancel a running extraction | `files.extractions.cancel` | `hoody files extractions cancel 3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| `hoody files extractions history list` |  | read | Extraction history | `files.extractions.listHistory` | `hoody files extractions history list` |
| `hoody files extractions list` |  | read | List active extractions | `files.extractions.list` | `hoody files extractions list` |
| `hoody files ftp get` |  | read | Access file via FTP | `files.ftp.get` | `hoody files ftp get /home/user/file.txt --type ftp --server ftp.example.com:21 --user anonymous --ftp-secure` |
| `hoody files get` |  | read | List directory or download file | `files.get` | `hoody files get /home/user/file.txt --hash --size 800x600` |
| `hoody files glob` |  | read | Find files by glob pattern | `files.glob` | `hoody files glob /home/user/src --pattern '*.ts' --max-results 1000 --max-depth 50` |
| `hoody files grep` |  | read | Search file contents (grep) | `files.grep` | `hoody files grep /home/user/file.txt --pattern TODO --ignore-case --fixed-string` |
| `hoody files health` |  | read | Service health check | `files.kit.getHealth` | `hoody files health` |
| `hoody files images convert` |  | read | Process and convert images | `files.images.convert` | `hoody files images convert img-abc --format jpeg --size 800x600` |
| `hoody files journal flush` |  | write | Flush journal to disk | `files.journal.flush` | `hoody files journal flush` |
| `hoody files journal list` |  | read | Query journal entries | `files.journal.list` | `hoody files journal list --path /home/user/file.txt --op write,delete` |
| `hoody files journal stats` |  | read | Get journal statistics | `files.journal.getStats` | `hoody files journal stats` |
| `hoody files mkdir` |  | write | Create a directory (--backend creates it on a remote backend, --owner sets its owner) | `files.mkdir` | `hoody files mkdir /home/user/file.txt` |
| `hoody files mounts create` |  | write | Create persistent FUSE mount | `files.mounts.create` | `hoody files mounts create --auto-deliver --backend-id abc-123 --label my-label` |
| `hoody files mounts delete` |  | destructive | Unmount filesystem | `files.mounts.delete` | `hoody files mounts delete abc-123 --uploads keep --wait-seconds 120` |
| `hoody files mounts get` |  | read | Get mount details | `files.mounts.get` | `hoody files mounts get abc-123` |
| `hoody files mounts list` |  | read | List all mounts | `files.mounts.list` | `hoody files mounts list --label my-label` |
| `hoody files mounts update` |  | write | Change a mount's VFS settings or its saved auto-deliver flag (currently has no effect) | `files.mounts.update` | `hoody files mounts update abc-123 --switch wait --auto-deliver` |
| `hoody files move` |  | write | Move file or directory | `files.move` | `hoody files move /home/user/file.txt --move-to <move_to>` |
| `hoody files open` |  | action | Open the Files kit file explorer at a folder in your browser |  | `hoody files open --path /home/user` |
| `hoody files realpath` |  | read | Resolve canonical path (realpath) | `files.realpath` | `hoody files realpath /home/user/file.txt` |
| `hoody files s3 get` |  | read | Access file from S3 | `files.s3.get` | `hoody files s3 get /home/user/file.txt --type s3 --server s3.amazonaws.com --s3-bucket <s3_bucket> --s3-region us-east-1 --user alice` |
| `hoody files search` |  | read | Search directory | `files.search` | `hoody files search /home/user/src --q <q> --json --theme oc-1` |
| `hoody files ssh get` |  | read | Access file via SSH/SFTP | `files.ssh.get` | `hoody files ssh get /home/user/file.txt --type ssh --server nas.local:22 --user alice` |
| `hoody files ssh upload` |  | write | Upload file via SSH/SFTP | `files.ssh.upload` | `hoody files ssh upload /home/user/file.txt --server nas.local:22 --user alice --input ./local-file` |
| `hoody files stat` |  | read | Get file metadata (stat) | `files.stat` | `hoody files stat /home/user/file.txt` |
| `hoody files touch` |  | write | Touch file (create or update mtime) | `files.touch` | `hoody files touch /home/user/file.txt` |
| `hoody files update` |  | write | Modify file properties or move/rename | `files.update` | `hoody files update /home/user/file.txt --body '{"move_to":"/new/dir/file.txt"}'` |
| `hoody files upload` |  | write | Upload or append file | `files.upload` | `hoody files upload /home/user/file.txt --append --input ./local-file` |
| `hoody files uploads delete` |  | destructive | Delete every held file of a pending upload. They are the only copy of those changes; the backend is not touched | `files.uploads.delete` | `hoody files uploads delete abc-123 -y` |
| `hoody files uploads deliver` |  | write | Upload held files of a pending upload to a backend, overwriting newer versions there. Without --paths or --paths-b64, every complete file is delivered | `files.uploads.deliver` | `hoody files uploads deliver abc-123 --paths /home/user/src -y` |
| `hoody files uploads download` |  | read | Write the held copy of one file of a pending upload, byte for byte; save it with --out-file <path>. Name it with exactly one of --path or --path-b64, as listed | `files.uploads.download` | `hoody files uploads download abc-123 --path /home/user/file.txt` |
| `hoody files uploads files list` |  | read | List the files of a pending upload, one page at a time. When more follow, -o json shows next_cursor; pass it to --cursor | `files.uploads.listFiles` | `hoody files uploads files list abc-123 --limit 1000` |
| `hoody files uploads list` |  | read | List pending uploads: unsent upload data held after a crash or stop, or still uploading | `files.uploads.list` | `hoody files uploads list` |
| `hoody files uploads stop` |  | action | Stop the uploads or the delivery of a pending upload and keep its unsent files. Nothing is lost | `files.uploads.stop` | `hoody files uploads stop abc-123` |
| `hoody files uploads unreadable delete` |  | destructive | Delete an unreadable pending-upload record and every file it kept on the server. What it held cannot be known; the backend is not touched | `files.uploads.deleteUnreadable` | `hoody files uploads unreadable delete abc-123 -y` |
| `hoody files uploads unreadable list` |  | read | List the stored records of unsent files that cannot be read. While one exists, a mount or backend delete cannot confirm that nothing was left unsent | `files.uploads.listUnreadable` | `hoody files uploads unreadable list` |
| `hoody files version` |  | read | Get API version | `files.kit.getVersion` | `hoody files version` |
| `hoody files webdav get` |  | read | Access file via WebDAV | `files.webdav.get` | `hoody files webdav get /home/user/file.txt --type webdav --server cloud.nextcloud.com --user alice --webdav-path /` |
| `hoody files whoami` |  | read | Show the user your credentials authenticate as | `files.whoami` | `hoody files whoami /home/user/file.txt` |
| `hoody files zip` |  | read | Download directory as ZIP | `files.zip` | `hoody files zip /home/user/src` |

