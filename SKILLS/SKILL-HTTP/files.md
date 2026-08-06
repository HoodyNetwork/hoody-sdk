> _**HTTP skill · `files` namespace** · ~30,756 tokens · hoody-sdk v1.0.0-beta.12_

# `files` — container filesystem over HTTP, with automatic Git-like change history

## Purpose

**Default surface: the container's own filesystem, exposed over HTTP — with optional automatic mutation journaling when the kit is started with `--journal-path`.** Read, write, copy, move, delete, stat, chmod, list, glob, grep, archive-preview/extract, fetch URLs into the FS, resumable upload — all on absolute container paths (`/workspace/main.py`, `/etc/hostname`, `/hoody/databases/foo.db`). No backend flag needed.

**Headline feature when journaling is on — automatic change history (think Git, but for every file write).** With the journal enabled, every `PUT` / `PATCH` / `DELETE` / `MOVE` / `COPY` is appended to a per-container mutation log: monotonic sequence number, timestamp, path, op, size, hash. **You never lose a previous version of a journaled path.** The journal lets you:

- **Time-travel a single file** — `GET /api/v1/files/{path}` `?revision=<seq>` or `?at=<unix-ms>` returns the bytes as they were at that point.
- **List a file's history** — `GET /api/v1/files/{path}` `?history=1` walks every revision of the path.
- **Diff between revisions** — `GET /api/v1/files/{path}` `?diff=1&from_seq=<N>` returns a unified diff between revision `N` and current.
- **Replay / audit** — `GET /api/v1/journal` `?path=<p>&after_id=<seq>` streams every operation since seq `N`. Run `POST /api/v1/journal/flush` to force-persist before querying for the absolute latest.
- **Cross-replicate** — pipe the journal into another container as an event source for mirroring / fan-out / append-only sync.

When provisioned with `--journal-path`, no per-write setup is needed — every covered write is recorded (add `--allow-journal` to expose the journal query endpoints — history, revision, diff, stats, flush — over the API). Treat it as "always-on undo for the whole filesystem." Journaling is ON in the standard `hoody_kit: true` container image; raw kit deployments without those flags will accept writes but skip recording.

**Optional add-ons (per-request, opt-in):**
- **Remote backends** — append `?backend=<id>` (or `?type=<rclone-type>`) to operate against any of the 60+ rclone backend types you've connected (Mega, SFTP, S3, GDrive, Dropbox, Backblaze B2, WebDAV, Git, …) instead of the local FS. Requires `--allow-remote` server-side flag. Note: the journal records local-FS mutations; remote-backend ops go to the remote and aren't replayable from the journal.
- **FUSE mounts** — `POST /api/v1/mounts` to surface a remote backend AS a path in the local FS. Same `--allow-remote` requirement.
- **chmod / chown** — Unix-only, requires `--allow-chmod` / `--allow-chown` server flags.

## When to use

- **Local container FS (the 90% case)** — CRUD, archive entry / extract, cross-binary search (glob, grep), download a URL into a path, resumable upload. Local works out of the box.
- **Recover / inspect a previous version of any file** — `?history=1`, `?revision=<seq>`, `?at=<unix-ms>`, `?diff=1&from_seq=<N>`. Always available because every write is journaled.
- **Audit / replay every change to the filesystem** — `GET /api/v1/journal` for the full event stream (sequence, timestamp, path, op, size, hash).
- **Remote cloud / SSH / S3 / Git** — append `?backend=<id>` on `GET /api/v1/files/{path}` / `PUT /api/v1/files/{path}` / `DELETE /api/v1/files/{path}` / `PATCH /api/v1/files/{path}` / `POST /api/v1/files/{path}` calls (the methods that accept a `backend` option). The same endpoints transparently target the remote.
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

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Read, search, write

1. `GET /api/v1/files/{path}` `?stat`/`?lines=10-50`.
2. `GET /api/v1/files/glob/{path}` `?pattern=**/*.ts`; `GET /api/v1/files/grep/{path}` `?pattern=TODO&context=2` (local only).
3. `PUT /api/v1/files/{path}` `?append=true`; `DELETE /api/v1/files/{path}`.

### 2. Download, extract, FUSE-mount

1. `GET /{directory}?download` `GET /{dir}?download=<url>`; `GET /{directory}?downloads` to poll.
2. `GET /{archive}?preview` `?preview`; `GET /{archive}?extract` `?extract=src/**&dest=work-src` (`?dest=` MUST be relative).
3. `POST /api/v1/backends/s3` (60+ `connect*`) -> `GET /api/v1/files/{path}` for one-shot reads OR `POST /api/v1/mounts` -> `GET /{path}` for a regular FS view -> `DELETE /api/v1/mounts/{id}`/`DELETE /api/v1/backends/{id}`. (`GET /{path}` itself has no `backend` option; `GET /api/v1/files/{path}`/`PUT /api/v1/files/{path}`/`DELETE /api/v1/files/{path}` do.)

### 3. Journal time-travel + TUS-like upload

1. `GET /api/v1/files/{path}` `?history=1`, `?revision=N`/`?at=<unix-ms>`, `?diff=1&from_seq=<N>`.
2. `GET /api/v1/journal` `?path=<p>&after_id=<seq>`; `POST /api/v1/journal/flush` first.
3. Resumable: `PUT /{path}` first chunk, then `PATCH /{path}` `X-Update-Range: append` per chunk.

## Quirks & gotchas

- Reserved sub-prefixes (stat, chmod, chown, realpath, glob, grep, copy, move, append) dispatch by URL prefix in `api/files.rs`, each scoped to a specific HTTP method (stat/grep/glob/realpath→GET, chmod/chown→PATCH, copy/move→POST, append→PUT) to prevent method bleeding -- so `DELETE /api/v1/files/stat/foo` does NOT trigger the stat dispatcher; it removes the literal path `/stat/foo`. (`/api/v1/files/health` is intercepted by a separate top-level route in `api/mod.rs:106` before this dispatcher sees it.)
- `GET /api/v1/files/glob/{path}`/`GET /api/v1/files/grep/{path}`/`GET /api/v1/files/realpath/{path}`/`?lines=` local-only; `?backend=` -> 400.
- `?backend=` and `?type=` need `--allow-remote`.
- `PATCH /api/v1/files/chmod/{path}`/`PATCH /api/v1/files/chown/{path}` Unix-only + `--allow-chmod`/`--allow-chown`.
- WebDAV verbs on `/{path}`: PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK, CHECKAUTH, LOGOUT.
- Cross-host propagation is SSHFS-only via `/external/...`.
- `GET /api/v1/files/realpath/{path}` follows symlinks even where blocked.
- **Resumable upload PATCH must use the WebDAV root route (`PATCH /{path}`), NOT `PATCH /api/v1/files/{path}`** — the api/v1 PATCH expects a JSON body and rejects raw bytes with `400 Invalid JSON body`. The WebDAV form takes `X-Update-Range: append` — or an HTTP-Range offset `bytes=<start>-<end>` (a Content-Range-style `/<size>` suffix is REJECTED with `400 Invalid X-Update-Range Header`) — plus the raw body, and returns `204 No Content` on success. An explicit offset must fall INSIDE the current file, so it can only overwrite, never extend past EOF; use `PUT /api/v1/files/append/{path}` to extend. [live-verified]
- **Archive `?dest=` MUST be relative** (e.g. `?dest=extracted`), not absolute — sending `?dest=/abs/path` returns `400 Absolute destination path not allowed`. The directory is created relative to the archive's containing dir. [live-verified]
- **`?preview` query value matters** — pass `?preview` empty (no `=…`) for a full archive listing; `?preview=true` is parsed as the entry name `true` and returns `404 Entry not found in archive: true`. Same trap on `?contents`. [live-verified]
- **Bare `?extract_file=` is unhandled by the kit's GET dispatcher** — the request falls through to "send the raw archive file" and you get the **whole archive's bytes**, not the selected entry. The generated SDK and CLI work around this by ALSO sending `?extract=` — when both query params are present, the `GET /{archive}?extract` branch runs (writes to disk under `?dest=`). The OpenAPI-only `?extract_file=` form is effectively dead.
- **Journal default `max_file_size` is 2 MiB; oversized files still produce a journal entry with hash + size, but the body bytes are not stored**.
- **`journal.is_excluded(<relative-path>)` gates which paths are recorded.** Built-in dev-dir excludes (`node_modules`, `target`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `__pycache__`, `.venv`, `venv`, `env`, `__pypackages__`, `.tox`, `.nox`, `bower_components`, …) skip journaling unless you pass `--no-journal-ignore-dev-dirs`. `.git` is always excluded regardless of that flag (separate hardcoded check, not part of the toggleable list). Custom excludes via `--journal-exclude`. This is why "I wrote to `node_modules/x` and saw no journal entry" is expected.
- **Journal does NOT cover everything by default.** Live behaviour observed: a fresh `PUT` (create) and an overwriting `PUT` (write) on `/home/user/...` produce entries; URL downloads (`?download=`) and archive extraction are NOT journaled — those write through paths with no journal hook. `PATCH /api/v1/files/chmod/{path}`, `PATCH /api/v1/files/chown/{path}`, `PUT /{path}?touch`, `?append=true` and copy/move ARE recorded. Always call `POST /api/v1/journal/flush` then `GET /api/v1/journal` (or `?history=1`) to inspect what was actually recorded — don't assume coverage. [live-verified]
- **Built-in dev-dir exclude list always skips journaling** for `node_modules`, `__pycache__`, `.venv`, `target`, `.next`, `.nuxt`, etc. — even on `/home/user/...` paths. Disable these with `--no-journal-ignore-dev-dirs` at kit start. `.git` is hardcoded to ALWAYS be excluded and stays excluded even with `--no-journal-ignore-dev-dirs`.
- **`/tmp/...` paths appear NOT to be journaled** at all (live-verified — 0 entries for `/tmp/files-examples-*` writes). Use `/home/user/...` (or another non-`/tmp` path) when you need history.
- **`HEAD /api/v1/files/{path}` returns `405`**; the `HEAD /{path}` operation in mappings is the WebDAV-style `HEAD /{path}` route (no `/api/v1/files/` prefix). Use `GET /api/v1/files/stat/{path}` (`GET /api/v1/files/stat/{path}`) for a JSON envelope instead. [live-verified]
- **`PATCH /api/v1/files/chown/{path}` to root is rejected** with `400 Cannot change ownership to root (UID 0)` (owner) or `400 Cannot change group to root (GID 0)` (group) — even if the kit has `--allow-chown`. Use a non-root user (`nobody`, `user`, …). [live-verified]
- **FUSE mount paths are confined to a configured mount-dir** (`/hoody/mounts` by default); arbitrary paths return `400 Mount path must be under the configured mount directory`. Override at kit start with `--mount-dir <path>`.
- **Listing-style query params (`?downloads`, `?download_history`, `?extractions`, `?extraction_history`) are honoured on the WebDAV root route, NOT on `/api/v1/files/...`** — calling `GET /api/v1/files/<dir>?downloads` returns a regular directory listing (the query is ignored). Use `GET /<dir>?downloads` (or `GET /?download_history` for the global feed). [live-verified]
- **`hoody-files` test container goes to sleep** between requests on a quiet kit; first hit may return `502` from the proxy with a `<!DOCTYPE html>…Error 502` body. Retry 2-3× with a few seconds backoff and the kit wakes up. [live-verified]
- **Mount the whole FS as a local drive on the USER's machine (client-side WebDAV).** Because the kit serves a WebDAV API at its URL root, the container's files mount natively as a drive/folder with no install: on **Windows** *Map network drive* to `https://{P}-{C}-files-1.{N}.containers.hoody.com/`, on **macOS** Finder → *Connect to Server* to the same URL; cross-platform/scripted, via `hoody mount <containerId> <localDir>` (WebDAV-backed remote mount; `--read-only`/`--background`/`--auth-token`/`--auth-password`/`--auth-ip` flags). This is the inverse of the server-side FUSE `* /api/v1/mounts*` family (which mounts remote backends INTO the container).

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

Every step in every example was live-tested against a real `files-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first. Paths under `/tmp/...` are NOT journaled by default — examples that need history use `/home/user/...`.

### 1. Read a file — full bytes, stat envelope, and a slice of lines

**Goal:** inspect an unknown text file three ways: get its metadata, peek the raw bytes, and slice an arbitrary line range without pulling the whole thing.

**Step 1 — stat first.** `GET /api/v1/files/stat/{path}` returns size, owner/group, octal permissions, mtime, plus a `revisions` count (how many journal entries exist for this path). Use this BEFORE downloading a file you don't know the size of.

```bash
KIT="https://${P}-${C}-files-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/files/stat/etc/hostname"
# → {"name":"hostname","path":"/etc/hostname","path_type":"File","size":13,"permissions":"644","owner":"root","group":"root","mtime":...,"revisions":0,...}
```
**Step 2 — line slice.** `?lines=2-3` returns just lines 2 through 3 inclusive. Local-FS only (rejected with `400` when combined with `?backend=`).

```bash
curl -sf "$KIT/api/v1/files/var/log/syslog?lines=2-3"
# returns just two lines, plain text
```
**Step 3 — full body.** No query params, raw bytes (or `Content-Type: application/octet-stream` for binaries).

```bash
curl -sf "$KIT/api/v1/files/etc/hostname" -o /tmp/hostname.txt
```
### 2. Find files then grep them — TODO scan across a tree

**Goal:** find every `.md` file under a directory, then grep them for `TODO` with surrounding context. Both ops are local-FS only.

**Step 1 — glob.** `pattern` matches relative to `path`; obeys `.gitignore` unless `no_ignore=true`.

```bash
KIT="https://${P}-${C}-files-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/files/glob/home/user?pattern=**/*.md&max_results=200" \
  | jq '.entries[].name'
```
**Step 2 — grep with context.** `?glob=` filters which files grep looks at; `?context=2` mirrors `grep -C 2`.

```bash
curl -sf "$KIT/api/v1/files/grep/home/user?pattern=TODO&glob=**/*.md&context=2&ignore_case=true" \
  | jq '.matches[] | {path, line_number, line}'
```
### 3. Resumable upload — split a payload into PUT-then-PATCH-append chunks

**Goal:** push a 16 MiB payload as 8 MiB chunks. Many CDN/proxy combos cap a single body at 10 MiB; chunked upload sidesteps that.

**Step 1 — first chunk via PUT.** Creates the file with the first slab.

```bash
KIT="https://${P}-${C}-files-1.${N}.containers.hoody.com"
DST=/home/user/upload-test.bin
head -c $((8*1024*1024)) /dev/urandom > /tmp/chunk1.bin
curl -sf -X PUT "$KIT/api/v1/files$DST" \
  -H 'Content-Type: application/octet-stream' \
  --data-binary @/tmp/chunk1.bin
# → {"path":"...","size":8388608,"success":true}
```
**Step 2 — append remaining chunks.** Send `PATCH /<path>` (the WebDAV root route, NOT `/api/v1/files/...` — that one expects JSON and 400s on raw bytes). Header `X-Update-Range: append` says "concatenate". Returns `204 No Content`.

```bash
head -c $((8*1024*1024)) /dev/urandom > /tmp/chunk2.bin
curl -sf -X PATCH "$KIT$DST" \
  -H 'X-Update-Range: append' \
  --data-binary @/tmp/chunk2.bin
curl -sf "$KIT/api/v1/files/stat$DST" | jq '.size'   # → 16777216
```
**Step 3 — same shape for resume after a network drop.** Re-append the missing chunk with `X-Update-Range: append` if you tracked the cursor client-side. An explicit `bytes=<start>-<end>` offset (no `/<total>` suffix — that is rejected) only overwrites INSIDE the existing file and cannot extend it, so it is not a resume mechanism. The generated **SDK and CLI currently expose only `X-Update-Range: append`**; explicit byte ranges need raw HTTP.

### 4. Time-travel a single file — history → revision N → diff

**Goal:** roll back a config file by reading an earlier revision, comparing it to current, then writing the chosen revision back. Journal tracks every PUT under `/home/user/...` (NOT `/tmp/...` — see Quirks).

**Step 1 — write two revisions.**

```bash
KIT="https://${P}-${C}-files-1.${N}.containers.hoody.com"
P=/home/user/config.toml
curl -sf -X PUT "$KIT/api/v1/files$P" --data-binary 'verbose = false'
sleep 1
curl -sf -X PUT "$KIT/api/v1/files$P" --data-binary 'verbose = true'
curl -sf -X POST "$KIT/api/v1/journal/flush"   # force-persist before query
```
**Step 2 — list history.** `?history=1` returns the per-revision log: each entry has `seq`, `op` (`"create"` / `"write"` / `"delete"` / `"moved_from"`/`"moved_to"` / etc. — see Example 5 for the full enum), `ts`, hashes, and size deltas.

```bash
curl -sf "$KIT/api/v1/files$P?history=1" \
  | jq '.revisions[] | {seq, op, ts, size_after}'
```
**Step 3 — fetch revision N.** `?revision=1` returns the bytes of that point-in-time. (Use `?at=<unix-ms>` for an instant.)

```bash
curl -sf "$KIT/api/v1/files$P?revision=1"        # → "verbose = false"
curl -sf "$KIT/api/v1/files$P?diff=1&from_seq=1" # unified diff seq 1 → current
```
**Step 4 — restore by writing rev1 bytes back.** PUT the body returned by `?revision=1`.

### 5. Audit — stream every mutation since seq N via the journal

**Goal:** wire a SIEM / alerting pipeline. Get every FS mutation since the last cursor, including hashes for tamper detection. Don't forget `POST /api/v1/journal/flush` first.

**Step 1 — flush so buffered journal writes are on disk.**

```bash
KIT="https://${P}-${C}-files-1.${N}.containers.hoody.com"
curl -sf -X POST "$KIT/api/v1/journal/flush"
```
**Step 2 — query since cursor.** `after_id` is the last `id` you've seen. `op` enum is `"create"` / `"write"` / `"append"` / `"delete"` / `"touch"` / `"moved_from"` / `"moved_to"` / `"copied_from"` / `"copied_to"` / `"dir_moved_from"` / `"dir_moved_to"` / `"dir_copied_from"` / `"dir_copied_to"` / `"dir_deleted"` / `"mkdir"` / `"chmod"` / `"chown"` / `"gap"` (no bare `"move"`/`"copy"` — use the directional `"moved_from"`/`"moved_to"` etc. pair).

```bash
LAST=0   # cursor; persist client-side
curl -sf "$KIT/api/v1/journal?after_id=$LAST&limit=200" \
  | jq '{count, next: .next_after_id, ops: [.entries[] | {seq, op, path, ts, size_after, hash}]}'
```
**Step 3 — health check.** Watch `GET /api/v1/journal/stats` for `writer_healthy:false`, `parse_failures`, or `skipped_overflow > 0` — any of those means the audit trail is degraded.

```bash
curl -sf "$KIT/api/v1/journal/stats" | jq '{writer_healthy, parse_failures, skipped_overflow, entries_skipped_total}'
```
### 6. Download a URL straight into the FS (no curl, no wget needed)

**Goal:** pull an asset from the public internet into a container path. The kit handles the actual HTTP fetch — useful for sandboxed containers without outbound HTTP libs.

**Step 1 — fire-and-poll.** `GET /<directory>?download=<url>&filename=<name>` (URL-encode the URL). Returns a `download_id` for tracking.

```bash
KIT="https://${P}-${C}-files-1.${N}.containers.hoody.com"
DIR=/home/user/inbox
curl -sf -X POST "$KIT/api/v1/files$DIR?mkdir=true"
URL='https://httpbin.org/robots.txt'
curl -sf "$KIT$DIR?download=$(printf '%s' "$URL" | jq -sRr @uri)&filename=robots.txt&timeout=15"
# → {"download_id":"…","filename":"robots.txt","path":"…/robots.txt","success":true}
```
**Step 2 — list active.** `?downloads` ONLY works on the WebDAV root route — `GET /api/v1/files/<dir>?downloads` ignores the flag and returns a normal listing (live-verified).

```bash
curl -sf "$KIT$DIR/?downloads"        # active in this dir
curl -sf "$KIT/?download_history"     # global history (across all dirs)
```
### 7. Archive workflow — preview, then selective extract

**Goal:** extract just one subpath of a zip without unpacking the whole archive.

**Step 1 — preview** to see what's inside. `?preview` MUST be empty — `?preview=true` is parsed as the entry name `true` and 404s (live-verified).

```bash
KIT="https://${P}-${C}-files-1.${N}.containers.hoody.com"
ARCHIVE=/home/user/inbox/hello.zip
curl -sf "$KIT$ARCHIVE?preview" \
  | jq '{format, total_files, total_size, entries: [.entries[] | {path, size, is_dir}]}'
```
**Step 2 — extract a subset.** `?extract=<glob>` selects entries (empty = all). `?dest=` MUST be relative — absolute paths return `400 Absolute destination path not allowed`. Destination is created relative to the archive's parent dir.

```bash
curl -sf "$KIT$ARCHIVE?extract=Hello-World-master/&dest=extracted"
# → {"destination":"/home/user/inbox/extracted","extracted_files":2,...}
curl -sf "$KIT/api/v1/files/home/user/inbox/extracted" | jq -r '.entries[].name'   # via files.get (directory listing on /api/v1/files/{path})
```
**Step 3 — extract a single file to disk.** Pass BOTH `?extract=<glob>` and `?extract_file=<path>` (the bare `?extract_file=` form falls through to "send whole archive"). The kit writes the matched entry under `?dest=` (or alongside the archive if omitted).

```bash
curl -sf "$KIT$ARCHIVE?extract=Hello-World-master/README&extract_file=Hello-World-master/README&dest=extracted"
```
### 8. Cross-directory copy + move + chmod (a one-shot deploy)

**Goal:** stage a config in a working dir, copy to the target, set permissions, move the staging file to a backup folder. Uses POST against the copy/move reserved-prefix routes (`/api/v1/files/copy/...`, `/move/...`) and PATCH for chmod/chown (`/api/v1/files/chmod/...`, `/chown/...`).

**Step 1 — copy.** Both `copy_to` and (for move) `move_to` are **query params**, NOT body fields. Add `?overwrite=true` to allow replacing an existing destination.

```bash
KIT="https://${P}-${C}-files-1.${N}.containers.hoody.com"
SRC=/home/user/staging/app.toml
DST=/etc/myapp/app.toml
curl -sf -X POST "$KIT/api/v1/files/copy$SRC?copy_to=$DST&overwrite=true"
# → {"source":"…","destination":"…","success":true}
```
**Step 2 — chmod.** Octal as a query param (`?chmod=600`). Requires `--allow-chmod` at kit start; Unix-only.

```bash
curl -sf -X PATCH "$KIT/api/v1/files/chmod$DST?chmod=600"
```
**Step 3 — move staging → archive.** Same pattern as copy but no overwrite by default; `?move_to=` is required.

```bash
curl -sf -X POST "$KIT/api/v1/files/move$SRC?move_to=/home/user/archive/app.toml"
```
### 9. Connect a remote backend, mount it as a path, list through both surfaces

**Goal:** attach a remote backend (here: `local` for portability — swap in `s3`/`sftp`/`drive` etc.) and surface it as a regular FS path via FUSE. Requires `--allow-remote` at kit start.

**Step 1 — connect.** Each backend has its own `POST /api/v1/backends/<type>` with type-specific config. Returns `{id, type, vfs_backend_type}`.

```bash
KIT="https://${P}-${C}-files-1.${N}.containers.hoody.com"
BID=$(curl -sf -X POST "$KIT/api/v1/backends/local" \
  -H 'Content-Type: application/json' \
  -d '{"description":"local-passthrough"}' \
  | jq -r '.data.id')
echo "backend=$BID"
curl -sf "$KIT/api/v1/backends/$BID/test" | jq '.status'   # → "connected"
```
**Step 2 — mount.** `mount_path` MUST sit under the kit's configured mount-dir (default `/hoody/mounts/...`) — arbitrary paths return `400 Mount path must be under the configured mount directory`.

```bash
MID=$(curl -sf -X POST "$KIT/api/v1/mounts" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg b "$BID" '{backend_id:$b, label:"local-mount", mount_path:"/hoody/mounts/local-test"}')" \
  | jq -r '.data.id')
echo "mount=$MID"
```
**Step 3 — read through the mount as a regular path.**

```bash
curl -sf "$KIT/api/v1/files/hoody/mounts/local-test" | jq '.entries[].name'
```
**Step 4 — tear down** (in order: unmount, then disconnect).

```bash
curl -sf -X DELETE "$KIT/api/v1/mounts/$MID"
curl -sf -X DELETE "$KIT/api/v1/backends/$BID"
```
### 10. Bulk delete a tree atomically — and verify nothing leaked

**Goal:** wipe a working directory and every file under it, then confirm via journal + listing that nothing remains.

**Step 1 — DELETE on the directory.** `DELETE /api/v1/files/<dir>` removes recursively. (Reserved-prefix trap: a path like `/api/v1/files/stat/foo` is interpreted as removing `/stat/foo`, NOT a stat call. Always use absolute container paths.)

```bash
KIT="https://${P}-${C}-files-1.${N}.containers.hoody.com"
DIR=/home/user/files-examples-cleanup
curl -sf -X DELETE "$KIT/api/v1/files$DIR"
# → {"success":true,"path":"…"}
```
**Step 2 — verify.** A `404` from `GET /api/v1/files/stat/{path}` is what you want.

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$KIT/api/v1/files/stat$DIR"   # → 404
```
**Step 3 — confirm via journal.** A successful tree-delete emits `op: "delete"` (or `op: "dir_deleted"` per child). Flush first.

```bash
curl -sf -X POST "$KIT/api/v1/journal/flush" >/dev/null
curl -sf "$KIT/api/v1/journal?path=$DIR&limit=10" \
  | jq '.entries[] | {seq, op, ts}'
```

## Reference

### `archives` (8) — Archive operations - extract, preview, download directories as ZIP

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{directory}?zip` | Download directory as ZIP | `?zip*` |
| `GET /{archive}?extract` | Extract archive | `?extract*` `?dest` |
| `GET /{archive}?extract_file` | Extract file from archive | `?extract*` `?dest` |
| `GET /?extraction_history` | Extraction history | `?extraction_history*` |
| `GET /?extractions` | List active extractions | `?extractions*` |
| `GET /api/v1/extractions` | List active extractions |  |
| `GET /{archive}?preview` | Preview archive contents or read file | `?preview` `?contents` |
| `GET /{archive}?view_file` | View file from archive | `?preview*` |

**Param notes:**

- `extract` — Empty for full extraction; path for selective (e.g. "src/" or "lib/")
- `dest` — Destination directory name (default: archive name)
- `archive` — Path to archive file
- `extract` — Path of the file or directory inside the archive to extract (e.g. "src/" or "lib/")
- `preview` — Empty value lists archive contents; non-empty value reads a specific file from the archive (alias: ?contents)
- `contents` — Alias for ?preview
- `preview` — Path of the file inside the archive to view (e.g. "src/" or "README.md")

### `authentication` (2) — Authentication operations - check auth status and logout

| Method | Summary | Params |
|--------|---------|--------|
| `CHECKAUTH /{path}` | Check authentication status |  |
| `LOGOUT /{path}` | Clear authentication |  |

### `backends` (67) — Backend management - connect, list, test, and disconnect remote cloud storage backends

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/backends/alias` | Connect to alias backend | `body*` |
| `POST /api/v1/backends/azureblob` | Connect to azureblob backend | `body*` |
| `POST /api/v1/backends/azurefiles` | Connect to azurefiles backend | `body*` |
| `POST /api/v1/backends/b2` | Connect to b2 backend | `body*` |
| `POST /api/v1/backends/box` | Connect to box backend | `body*` |
| `POST /api/v1/backends/cache` | Connect to cache backend | `body*` |
| `POST /api/v1/backends/chunker` | Connect to chunker backend | `body*` |
| `POST /api/v1/backends/cloudinary` | Connect to cloudinary backend | `body*` |
| `POST /api/v1/backends/combine` | Connect to combine backend | `body*` |
| `POST /api/v1/backends/compress` | Connect to compress backend | `body*` |
| `POST /api/v1/backends/crypt` | Connect to crypt backend | `body*` |
| `POST /api/v1/backends/drive` | Connect to drive backend | `body*` |
| `POST /api/v1/backends/dropbox` | Connect to dropbox backend | `body*` |
| `POST /api/v1/backends/fichier` | Connect to fichier backend | `body*` |
| `POST /api/v1/backends/filefabric` | Connect to filefabric backend | `body*` |
| `POST /api/v1/backends/filescom` | Connect to filescom backend | `body*` |
| `POST /api/v1/backends/ftp` | Connect to ftp backend | `body*` |
| `POST /api/v1/backends/gofile` | Connect to gofile backend | `body*` |
| `POST /api/v1/backends/google-cloud-storage` | Connect to google cloud storage backend | `body*` |
| `POST /api/v1/backends/google-photos` | Connect to google photos backend | `body*` |
| `POST /api/v1/backends/hasher` | Connect to hasher backend | `body*` |
| `POST /api/v1/backends/hdfs` | Connect to hdfs backend | `body*` |
| `POST /api/v1/backends/hidrive` | Connect to hidrive backend | `body*` |
| `POST /api/v1/backends/http` | Connect to http backend | `body*` |
| `POST /api/v1/backends/iclouddrive` | Connect to iclouddrive backend | `body*` |
| `POST /api/v1/backends/imagekit` | Connect to imagekit backend | `body*` |
| `POST /api/v1/backends/internetarchive` | Connect to internetarchive backend | `body*` |
| `POST /api/v1/backends/jottacloud` | Connect to jottacloud backend | `body*` |
| `POST /api/v1/backends/koofr` | Connect to koofr backend | `body*` |
| `POST /api/v1/backends/linkbox` | Connect to linkbox backend | `body*` |
| `POST /api/v1/backends/local` | Connect to local backend | `body*` |
| `POST /api/v1/backends/mailru` | Connect to mailru backend | `body*` |
| `POST /api/v1/backends/mega` | Connect to mega backend | `body*` |
| `POST /api/v1/backends/memory` | Connect to memory backend | `body*` |
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
| `POST /api/v1/backends/storj` | Connect to storj backend | `body*` |
| `POST /api/v1/backends/sugarsync` | Connect to sugarsync backend | `body*` |
| `POST /api/v1/backends/swift` | Connect to swift backend | `body*` |
| `POST /api/v1/backends/tardigrade` | Connect to tardigrade backend | `body*` |
| `POST /api/v1/backends/ulozto` | Connect to ulozto backend | `body*` |
| `POST /api/v1/backends/union` | Connect to union backend | `body*` |
| `POST /api/v1/backends/uptobox` | Connect to uptobox backend | `body*` |
| `POST /api/v1/backends/webdav` | Connect to webdav backend | `body*` |
| `POST /api/v1/backends/yandex` | Connect to yandex backend | `body*` |
| `POST /api/v1/backends/zoho` | Connect to zoho backend | `body*` |
| `DELETE /api/v1/backends/{id}` | Disconnect backend |  |
| `GET /api/v1/backends/{id}` | Get backend details |  |
| `GET /api/v1/backends` | List all backends |  |
| `GET /api/v1/backends/{id}/test` | Test backend connection |  |
| `PUT /api/v1/backends/{id}` | Update backend credentials | `body*` |

**Body shapes:**

- `POST /api/v1/backends/alias` body — `{ description: string="", remote*: string="" }` — alias backend configuration
  - `description` — Description of the remote.
  - `remote` — Remote or path to alias.  Can be "myremote:path/to/dir", "myremote:bucket", "myremote:" or "/local/path".
- `POST /api/v1/backends/azureblob` body — `{ access_tier: string="", account: string="", archive_tier_delete: bool=false, chunk_size: string="4194304", client_certificate_password: string="", client_certificate_path: string="", client_id: string="", client_secret: string="", client_send_certificate_chain: bool=false, delete_snapshots: "" | "include" | "only"="", description: string="", directory_markers: bool=false, disable_checksum: bool=false, disable_instance_discovery: bool=false, encoding: string="21078018", endpoint: string="", env_auth: bool=false, key: string="", list_chunk: int=5000, memory_pool_flush_time: int=60, memory_pool_use_mmap: bool=false, msi_client_id: string="", msi_mi_res_id: string="", msi_object_id: string="", no_check_container: bool=false, no_head_object: bool=false, password: string="", public_access: "" | "blob" | "container"="", sas_url: string="", service_principal_file: string="", tenant: string="", upload_concurrency: int=16, upload_cutoff: string="", use_az: bool=false, use_emulator: bool=false, use_msi: bool=false, username: string="" }` — azureblob backend configuration
  - _(37 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/azurefiles` body — `{ account: string="", chunk_size: string="4194304", client_certificate_password: string="", client_certificate_path: string="", client_id: string="", client_secret: string="", client_send_certificate_chain: bool=false, connection_string: string="", description: string="", encoding: string="54634382", endpoint: string="", env_auth: bool=false, key: string="", max_stream_size: string="10737418240", msi_client_id: string="", msi_mi_res_id: string="", msi_object_id: string="", password: string="", sas_url: string="", service_principal_file: string="", share_name: string="", tenant: string="", upload_concurrency: int=16, use_msi: bool=false, username: string="" }` — azurefiles backend configuration
  - _(25 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/b2` body — `{ account*: string="", chunk_size: string="100663296", copy_cutoff: string="4294967296", description: string="", disable_checksum: bool=false, download_auth_duration: int=604800, download_url: string="", encoding: string="50438146", endpoint: string="", hard_delete: bool=false, key*: string="", lifecycle: int=0, memory_pool_flush_time: int=60, memory_pool_use_mmap: bool=false, test_mode: string="", upload_concurrency: int=4, upload_cutoff: string="209715200", version_at: string="0001-01-01T00:00:00Z", versions: bool=false }` — b2 backend configuration
  - _(19 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/box` body — `{ access_token: string="", auth_url: string="", box_config_file: string="", box_sub_type: "user" | "enterprise"="user", client_credentials: bool=false, client_id: string="", client_secret: string="", commit_retries: int=100, description: string="", encoding: string="52535298", impersonate: string="", list_chunk: int=1000, owned_by: string="", root_folder_id: string="0", token: string="", token_url: string="", upload_cutoff: string="52428800" }` — box backend configuration
  - `access_token` — Box App Primary Access Token  Leave blank normally.
  - `auth_url` — Auth server URL.  Leave blank to use the provider defaults.
  - `box_config_file` — Box App config.json location  Leave blank normally.  Leading `~` will be expanded in the file name as will environment variables such as `${RCLONE_CONFIG_DIR}`.
  - `client_credentials` — Use client credentials OAuth flow.  This will use the OAUTH2 client Credentials Flow as described in RFC 6749.
  - `client_id` — OAuth Client Id.  Leave blank normally.
  - `client_secret` — OAuth Client Secret.  Leave blank normally.
  - `commit_retries` — Max number of times to try committing a multipart file.
  - `encoding` — The encoding for the backend.  See the [encoding section in the overview](/overview/#encoding) for more info.
  - `impersonate` — Impersonate this user ID when using a service account.  Setting this flag allows Hoody, when using a JWT service account, to act on behalf of another user by setting the as-user header.  The user ID is the Box identifier for a user. User IDs can found for any user via the GET /users endpoint, which…
  - `list_chunk` — Size of listing chunk 1-1000.
  - `owned_by` — Only show items owned by the login (email address) passed in.
  - `root_folder_id` — Fill in for Hoody to use a non root folder as its starting point.
  - `token` — OAuth Access Token as a JSON blob.
  - `token_url` — Token server url.  Leave blank to use the provider defaults.
  - `upload_cutoff` — Cutoff for switching to multipart upload (>= 50 MiB).
- `POST /api/v1/backends/cache` body — `{ chunk_clean_interval: int=60, chunk_no_memory: bool=false, chunk_path: string="/home/user/.cache/hoody-vfs/cache-backend", chunk_size: "1M" | "5M" | "10M"="5242880", chunk_total_size: "500M" | "1G" | "10G"="10737418240", db_path: string="/home/user/.cache/hoody-vfs/cache-backend", db_purge: bool=false, db_wait_time: int=1, description: string="", info_age: "1h" | "24h" | "48h"=21600, plex_insecure: string="", plex_password: string="", plex_token: string="", plex_url: string="", plex_username: string="", read_retries: int=10, remote*: string="", rps: int=-1, tmp_upload_path: string="", tmp_wait_time: int=15, workers: int=4, writes: bool=false }` — cache backend configuration
  - _(22 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/chunker` body — `{ chunk_size: string="2147483648", description: string="", fail_hard: "true" | "false"=false, hash_type: "none" | "md5" | "sha1" | "md5all" | "sha1all" | "md5quick" | "sha1quick"="md5", meta_format: "none" | "simplejson"="simplejson", name_format: string="*.hoody-vfs_chunk.###", remote*: string="", start_from: int=1, transactions: "rename" | "norename" | "auto"="rename" }` — chunker backend configuration
  - `chunk_size` — Files larger than chunk size will be split in chunks.
  - `fail_hard` — Choose how chunker should handle files with missing or invalid chunks.
  - `hash_type` — Choose how chunker handles hash sums.  All modes but "none" require metadata.
  - `meta_format` — Format of the metadata object or "none".  By default "simplejson". Metadata is a small JSON file named after the composite file.
  - `name_format` — String format of chunk file names.  The two placeholders are: base file name (*) and chunk number (#...). There must be one and only one asterisk and one or more consecutive hash characters. If chunk number has less digits than the number of hashes, it is left-padded by zeros. If there are more dig…
  - `remote` — Remote to chunk/unchunk.  Normally should contain a ':' and a path, e.g. "myremote:path/to/dir", "myremote:bucket" or maybe "myremote:" (not recommended).
  - `start_from` — Minimum valid chunk number. Usually 0 or 1.  By default chunk numbers start from 1.
  - `transactions` — Choose how chunker should handle temporary files during transactions.
- `POST /api/v1/backends/cloudinary` body — `{ api_key*: string="", api_secret*: string="", cloud_name*: string="", description: string="", encoding: string="52543246", eventually_consistent_delay: int=0, upload_prefix: string="", upload_preset: string="" }` — cloudinary backend configuration
  - `api_key` — Cloudinary API Key
  - `api_secret` — Cloudinary API Secret
  - `cloud_name` — Cloudinary Environment Name
  - `eventually_consistent_delay` — Wait N seconds for eventual consistency of the databases that support the backend operation
  - `upload_prefix` — Specify the API endpoint for environments out of the US
  - `upload_preset` — Upload Preset to select asset manipulation on upload
- `POST /api/v1/backends/combine` body — `{ description: string="", upstreams*: string }` — combine backend configuration
  - `upstreams` — Upstreams for combining  These should be in the form   dir=remote:path dir2=remote2:path  Where before the = is specified the root directory and after is the remote to put there.  Embedded spaces can be added using quotes   "dir=remote:path with space" "dir2=remote2:path with space"
- `POST /api/v1/backends/compress` body — `{ description: string="", level: int=-1, mode: "gzip"="gzip", ram_cache_limit: string="20971520", remote*: string="" }` — compress backend configuration
  - `level` — GZIP compression level (-2 to 9).  Generally -1 (default, equivalent to 5) is recommended. Levels 1 to 9 increase compression at the cost of speed. Going past 6  generally offers very little return.  Level -2 uses Huffman encoding only. Only use if you know what you are doing. Level 0 turns off com…
  - `mode` — Compression mode.
  - `ram_cache_limit` — Some remotes don't allow the upload of files with unknown size. In this case the compressed file will need to be cached to determine it's size.  Files smaller than this limit will be cached in RAM, files larger than  this limit will be cached on disk.
  - `remote` — Remote to compress.
- `POST /api/v1/backends/crypt` body — `{ description: string="", directory_name_encryption: "true" | "false"=true, filename_encoding: "base32" | "base64" | "base32768"="base32", filename_encryption: "standard" | "obfuscate" | "off"="standard", no_data_encryption: "true" | "false"=false, pass_bad_blocks: bool=false, password*: string="", password2: string="", remote*: string="", server_side_across_configs: bool=false, show_mapping: bool=false, strict_names: bool=false, suffix: string=".bin" }` — crypt backend configuration
  - `directory_name_encryption` — Option to either encrypt directory names or leave them intact.  NB If filename_encryption is "off" then this option will do nothing.
  - `filename_encoding` — How to encode the encrypted filename to text string.  This option could help with shortening the encrypted filename. The  suitable option would depend on the way your remote count the filename length and if it's case sensitive.
  - `filename_encryption` — How to encrypt the filenames.
  - `no_data_encryption` — Option to either encrypt file data or leave it unencrypted.
  - `pass_bad_blocks` — If set this will pass bad blocks through as all 0.  This should not be set in normal operation, it should only be set if trying to recover an encrypted file with errors and it is desired to recover as much of the file as possible.
  - `password` — Password or pass phrase for encryption.
  - `password2` — Password or pass phrase for salt.  Optional but recommended. Should be different to the previous password.
  - `remote` — Remote to encrypt/decrypt.  Normally should contain a ':' and a path, e.g. "myremote:path/to/dir", "myremote:bucket" or maybe "myremote:" (not recommended).
  - `server_side_across_configs` — Deprecated: use --server-side-across-configs instead.  Allow server-side operations (e.g. copy) to work across different crypt configs.  Normally this option is not what you want, but if you have two crypts pointing to the same backend you can use it.  This can be used, for example, to change file…
  - `show_mapping` — For all files listed show how the names encrypt.  If this flag is set then for each file that the remote is asked to list, it will log (at level INFO) a line stating the decrypted file name and the encrypted file name.  This is so you can work out which encrypted names are which decrypted names jus…
  - `strict_names` — If set, this will raise an error when crypt comes across a filename that can't be decrypted.  (By default, Hoody will just log a NOTICE and continue as normal.) This can happen if encrypted and unencrypted files are stored in the same directory (which is not recommended.) It may also indicate a mor…
  - `suffix` — If this is set it will override the default suffix of ".bin".  Setting suffix to "none" will result in an empty suffix. This may be useful  when the path length is critical.
- `POST /api/v1/backends/drive` body — `{ acknowledge_abuse: bool=false, allow_import_name_change: bool=false, alternate_export: bool=false, auth_owner_only: bool=false, auth_url: string="", chunk_size: string="8388608", client_credentials: bool=false, client_id: string="", client_secret: string="", copy_shortcut_content: bool=false, description: string="", disable_http2: bool=true, encoding: string="16777216", env_auth: "false" | "true"=false, export_formats: string="docx,xlsx,pptx,svg", fast_list_bug_fix: bool=true, formats: string="", impersonate: string="", import_formats: string="", keep_revision_forever: bool=false, list_chunk: int=1000, metadata_labels: "off" | "read" | "write" | "failok" | "read,write"="0", metadata_owner: "off" | "read" | "write" | "failok" | "read,write"="1", metadata_permissions: "off" | "read" | "write" | "failok" | "read,write"="0", pacer_burst: int=100, pacer_min_sleep: int=0, resource_key: string="", root_folder_id: string="", scope: "drive" | "drive.readonly" | "drive.file" | "drive.appfolder" | "drive.metadata.readonly"="", server_side_across_configs: bool=false, service_account_credentials: string="", service_account_file: string="", shared_with_me: bool=false, show_all_gdocs: bool=false, size_as_quota: bool=false, skip_checksum_gphotos: bool=false, skip_dangling_shortcuts: bool=false, skip_gdocs: bool=false, skip_shortcuts: bool=false, starred_only: bool=false, stop_on_download_limit: bool=false, stop_on_upload_limit: bool=false, team_drive: string="", token: string="", token_url: string="", trashed_only: bool=false, upload_cutoff: string="8388608", use_created_date: bool=false, use_shared_date: bool=false, use_trash: bool=true, v2_download_min_size: string="-1" }` — drive backend configuration
  - _(51 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/dropbox` body — `{ auth_url: string="", batch_commit_timeout: int=600, batch_mode: string="sync", batch_size: int=0, batch_timeout: int=0, chunk_size: string="50331648", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="52469762", impersonate: string="", pacer_min_sleep: int=0, root_namespace: string="", shared_files: bool=false, shared_folders: bool=false, token: string="", token_url: string="" }` — dropbox backend configuration
  - _(18 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/fichier` body — `{ api_key: string="", cdn: bool=false, description: string="", encoding: string="52666494", file_password: string="", folder_password: string="", shared_folder: string="" }` — fichier backend configuration
  - `api_key` — Your API Key, get it from https://1fichier.com/console/params.pl.
  - `cdn` — Set if you wish to use CDN download links.
  - `file_password` — If you want to download a shared file that is password protected, add this parameter.
  - `folder_password` — If you want to list the files in a shared folder that is password protected, add this parameter.
  - `shared_folder` — If you want to download a shared folder, add this parameter.
- `POST /api/v1/backends/filefabric` body — `{ description: string="", encoding: string="50429954", permanent_token: string="", root_folder_id: string="", token: string="", token_expiry: string="", url*: "https://storagemadeeasy.com" | "https://eu.storagemadeeasy.com" | "https://yourfabric.smestorage.com"="", version: string="" }` — filefabric backend configuration
  - `permanent_token` — Permanent Authentication Token.  A Permanent Authentication Token can be created in the Enterprise File Fabric, on the users Dashboard under Security, there is an entry you'll see called "My Authentication Tokens". Click the Manage button to create one.  These tokens are normally valid for several…
  - `root_folder_id` — ID of the root folder.  Leave blank normally.  Fill in to make Hoody start with directory of a given ID.
  - `token` — Session Token.  This is a session token which Hoody caches in the config file. It is usually valid for 1 hour.  Don't set this value - Hoody will set it automatically.
  - `token_expiry` — Token expiry time.  Don't set this value - Hoody will set it automatically.
  - `url` — URL of the Enterprise File Fabric to connect to.
  - `version` — Version read from the file fabric.  Don't set this value - Hoody will set it automatically.
- `POST /api/v1/backends/filescom` body — `{ api_key: string="", description: string="", encoding: string="60923906", password: string="", site: string="", username: string="" }` — filescom backend configuration
  - `api_key` — The API key used to authenticate with Files.com.
  - `password` — The password used to authenticate with Files.com.
  - `site` — Your site subdomain (e.g. mysite) or custom domain (e.g. myfiles.customdomain.com).
  - `username` — The username used to authenticate with Files.com.
- `POST /api/v1/backends/ftp` body — `{ ask_password: bool=false, close_timeout: int=60, concurrency: int=0, description: string="", disable_epsv: bool=false, disable_mlsd: bool=false, disable_tls13: bool=false, disable_utf8: bool=false, encoding: "Asterisk,Ctl,Dot,Slash" | "BackSlash,Ctl,Del,Dot,RightSpace,Slash,SquareBracket" | "Ctl,LeftPeriod,Slash"="35749890", explicit_tls: bool=false, force_list_hidden: bool=false, host*: string="", idle_timeout: int=60, no_check_certificate: bool=false, no_check_upload: bool=false, pass: string="", port: int=21, shut_timeout: int=60, socks_proxy: string="", tls: bool=false, tls_cache_size: int=32, user: string="user", writing_mdtm: bool=false }` — ftp backend configuration
  - `ask_password` — Allow asking for FTP password when needed.  If this is set and no password is supplied then Hoody will ask for a password
  - `close_timeout` — Maximum time to wait for a response to close. (in seconds)
  - `concurrency` — Maximum number of FTP simultaneous connections, 0 for unlimited.  Note that setting this is very likely to cause deadlocks so it should be used with care.  If you are doing a sync or copy then make sure concurrency is one more than the sum of `--transfers` and `--checkers`.  If you use `--check-fir…
  - `disable_epsv` — Disable using EPSV even if server advertises support.
  - `disable_mlsd` — Disable using MLSD even if server advertises support.
  - `disable_tls13` — Disable TLS 1.3 (workaround for FTP servers with buggy TLS)
  - `disable_utf8` — Disable using UTF-8 even if server advertises support.
  - `explicit_tls` — Use Explicit FTPS (FTP over TLS).  When using explicit FTP over TLS the client explicitly requests security from the server in order to upgrade a plain text connection to an encrypted one. Cannot be used in combination with implicit FTPS.
  - `force_list_hidden` — Use LIST -a to force listing of hidden files and folders. This will disable the use of MLSD.
  - `host` — FTP host to connect to.  E.g. "ftp.example.com".
  - `idle_timeout` — Max time before closing idle connections.  If no connections have been returned to the connection pool in the time given, Hoody will empty the connection pool.  Set to 0 to keep connections indefinitely. (in seconds)
  - `no_check_certificate` — Do not verify the TLS certificate of the server.
  - `no_check_upload` — Don't check the upload is OK  Normally Hoody will try to check the upload exists after it has uploaded a file to make sure the size and modification time are as expected.  This flag stops Hoody doing these checks. This enables uploading to folders which are write only.  You will likely need to use…
  - `pass` — FTP password.
  - `port` — FTP port number.
  - `shut_timeout` — Maximum time to wait for data connection closing status. (in seconds)
  - `socks_proxy` — Socks 5 proxy host.   Supports the format user:pass@host:port, user@host:port, host:port.   Example:    myUser:myPass@localhost:9005
  - `tls` — Use Implicit FTPS (FTP over TLS).  When using implicit FTP over TLS the client connects using TLS right from the start which breaks compatibility with non-TLS-aware servers. This is usually served over port 990 rather than port 21. Cannot be used in combination with explicit FTPS.
  - `tls_cache_size` — Size of TLS session cache for all control and data connections.  TLS cache allows to resume TLS sessions and reuse PSK between connections. Increase if default size is not enough resulting in TLS resumption errors. Enabled by default. Use 0 to disable.
  - `user` — FTP username.
  - `writing_mdtm` — Use MDTM to set modification time (VsFtpd quirk)
- `POST /api/v1/backends/gofile` body — `{ access_token: string="", account_id: string="", description: string="", encoding: string="323331982", list_chunk: int=1000, root_folder_id: string="" }` — gofile backend configuration
  - `access_token` — API Access token  You can get this from the web control panel.
  - `account_id` — Account ID  Leave this blank normally, Hoody will fill it in automatically.
  - `list_chunk` — Number of items to list in each call
  - `root_folder_id` — ID of the root folder  Leave this blank normally, Hoody will fill it in automatically.  If you want Hoody to be restricted to a particular folder you can fill it in - see the docs for more info.
- `POST /api/v1/backends/google-cloud-storage` body — `{ access_token: string="", anonymous: bool=false, auth_url: string="", bucket_acl: "authenticatedRead" | "private" | "projectPrivate" | "publicRead" | "publicReadWrite"="", bucket_policy_only: bool=false, client_credentials: bool=false, client_id: string="", client_secret: string="", decompress: bool=false, description: string="", directory_markers: bool=false, encoding: string="50348034", endpoint: string="", env_auth: "false" | "true"=false, location: "" | "asia" | "eu" | "us" | "asia-east1" | "asia-east2" | "asia-northeast1" | "asia-northeast2" | …(36 values)="", no_check_bucket: bool=false, object_acl: "authenticatedRead" | "bucketOwnerFullControl" | "bucketOwnerRead" | "private" | "projectPrivate" | "publicRead"="", project_number: string="", service_account_credentials: string="", service_account_file: string="", storage_class: "" | "MULTI_REGIONAL" | "REGIONAL" | "NEARLINE" | "COLDLINE" | "ARCHIVE" | "DURABLE_REDUCED_AVAILABILITY"="", token: string="", token_url: string="", user_project: string="" }` — google cloud storage backend configuration
  - `access_token` — Short-lived access token.  Leave blank normally. Needed only if you want use short-lived access token instead of interactive login.
  - `anonymous` — Access public buckets and objects without credentials.  Set to 'true' if you just want to download files and don't configure credentials.
  - `bucket_acl` — Access Control List for new buckets.
  - `bucket_policy_only` — Access checks should use bucket-level IAM policies.  If you want to upload objects to a bucket with Bucket Policy Only set then you will need to set this.  When it is set, Hoody:  - ignores ACLs set on buckets - ignores ACLs set on objects - creates buckets with Bucket Policy Only set  Docs: https:…
  - `decompress` — If set this will decompress gzip encoded objects.  It is possible to upload objects to GCS with "Content-Encoding: gzip" set. Normally Hoody will download these files as compressed objects.  If this flag is set then Hoody will decompress these files with "Content-Encoding: gzip" as they are receive…
  - `directory_markers` — Upload an empty object with a trailing slash when a new directory is created  Empty folders are unsupported for bucket based remotes, this option creates an empty object ending with "/", to persist the folder.
  - `endpoint` — Endpoint for the service.  Leave blank normally.
  - `env_auth` — Get GCP IAM credentials from runtime (environment variables or instance meta data if no env vars).  Only applies if service_account_file and service_account_credentials is blank.
  - `location` — Location for the newly created buckets.
  - `no_check_bucket` — If set, don't attempt to check the bucket exists or create it.  This can be useful when trying to minimise the number of transactions Hoody does if you know the bucket exists already.
  - `object_acl` — Access Control List for new objects.
  - `project_number` — Project number.  Optional - needed only for list/create/delete buckets - see your developer console.
  - `service_account_credentials` — Service Account Credentials JSON blob.  Leave blank normally. Needed only if you want use SA instead of interactive login.
  - `service_account_file` — Service Account Credentials JSON file path.  Leave blank normally. Needed only if you want use SA instead of interactive login.  Leading `~` will be expanded in the file name as will environment variables such as `${RCLONE_CONFIG_DIR}`.
  - `storage_class` — The storage class to use when storing objects in Google Cloud Storage.
  - `user_project` — User project.  Optional - needed only for requester pays.
- `POST /api/v1/backends/google-photos` body — `{ auth_url: string="", batch_commit_timeout: int=600, batch_mode: string="sync", batch_size: int=0, batch_timeout: int=0, client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50348034", include_archived: bool=false, proxy: string="", read_only: bool=false, read_size: bool=false, start_year: int=2000, token: string="", token_url: string="" }` — google photos backend configuration
  - `batch_commit_timeout` — Max time to wait for a batch to finish committing (in seconds)
  - `batch_mode` — Upload file batching sync\|async\|off.  This sets the batch mode used by Hoody.  This has 3 possible values  - off - no batching - sync - batch uploads and check completion (default) - async - batch upload and don't check completion  Hoody-VFS will close any outstanding batches when it exits which ma…
  - `batch_size` — Max number of files in upload batch.  This sets the batch size of files to upload. It has to be less than 50.  By default this is 0 which means Hoody will calculate the batch size depending on the setting of batch_mode.  - batch_mode: async - default batch_size is 50 - batch_mode: sync - default ba…
  - `batch_timeout` — Max time to allow an idle upload batch before uploading.  If an upload batch is idle for more than this long then it will be uploaded.  The default for this is 0 which means Hoody will choose a sensible default based on the batch_mode in use.  - batch_mode: async - default batch_timeout is 10s - ba…
  - `include_archived` — Also view and download archived media.  By default, Hoody does not request archived media. Thus, when syncing, archived media is not visible in directory listings or transferred.  Note that media in albums is always visible and synced, no matter their archive status.  With this flag, archived media…
  - `proxy` — Use the gphotosdl proxy for downloading the full resolution images  The Google API will deliver images and video which aren't full resolution, and/or have EXIF data missing.  However if you ue the gphotosdl proxy tnen you can download original, unchanged images.  This runs a headless browser in the…
  - `read_only` — Set to make the Google Photos backend read only.  If you choose read only then Hoody will only request read only access to your photos, otherwise Hoody will request full access.
  - `read_size` — Set to read the size of media items.  Normally Hoody does not read the size of media items since this takes another transaction. This isn't necessary for syncing. However Hoody mount needs to know the size of files in advance of reading them, so setting this flag when using Hoody mount is recommend…
  - `start_year` — Year limits the photos to be downloaded to those which are uploaded after the given year.
- `POST /api/v1/backends/hasher` body — `{ auto_size: string="0", description: string="", hashes: string, max_age: int=0, remote*: string="" }` — hasher backend configuration
  - `auto_size` — Auto-update checksum for files smaller than this size (disabled by default).
  - `hashes` — Comma separated list of supported checksum types.
  - `max_age` — Maximum time to keep checksums in cache (0 = no cache, off = cache forever). (in seconds)
  - `remote` — Remote to cache checksums for (e.g. myRemote:path).
- `POST /api/v1/backends/hdfs` body — `{ data_transfer_protection: "privacy"="", description: string="", encoding: string="50430082", namenode*: string, service_principal_name: string="", username: "root"="" }` — hdfs backend configuration
  - `data_transfer_protection` — Kerberos data transfer protection: authentication\|integrity\|privacy.  Specifies whether or not authentication, data signature integrity checks, and wire encryption are required when communicating with the datanodes. Possible values are 'authentication', 'integrity' and 'privacy'. Used only with KER…
  - `namenode` — Hadoop name nodes and ports.  E.g. "namenode-1:8020,namenode-2:8020,..." to connect to host namenodes at port 8020.
  - `service_principal_name` — Kerberos service principal name for the namenode.  Enables KERBEROS authentication. Specifies the Service Principal Name (SERVICE/FQDN) for the namenode. E.g. \"hdfs/namenode.hadoop.docker\" for namenode running as service 'hdfs' with FQDN 'namenode.hadoop.docker'.
  - `username` — Hadoop user name.
- `POST /api/v1/backends/hidrive` body — `{ auth_url: string="", chunk_size: string="50331648", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", disable_fetching_member_count: bool=false, encoding: string="33554434", endpoint: string="https://api.hidrive.strato.com/2.1", root_prefix: "/" | "root" | ""="/", scope_access: "rw" | "ro"="rw", scope_role: "user" | "admin" | "owner"="user", token: string="", token_url: string="", upload_concurrency: int=4, upload_cutoff: string="100663296" }` — hidrive backend configuration
  - `chunk_size` — Chunksize for chunked uploads.  Any files larger than the configured cutoff (or files of unknown size) will be uploaded in chunks of this size.  The upper limit for this is 2147483647 bytes (about 2.000Gi). That is the maximum amount of bytes a single upload-operation will support. Setting this abo…
  - `disable_fetching_member_count` — Do not fetch number of objects in directories unless it is absolutely necessary.  Requests may be faster if the number of objects in subdirectories is not fetched.
  - `endpoint` — Endpoint for the service.  This is the URL that API-calls will be made to.
  - `root_prefix` — The root/parent folder for all paths.  Fill in to use the specified folder as the parent for all paths given to the remote. This way Hoody can use any folder as its starting point.
  - `scope_access` — Access permissions that Hoody should use when requesting access from HiDrive.
  - `scope_role` — User-level that Hoody should use when requesting access from HiDrive.
  - `upload_concurrency` — Concurrency for chunked uploads.  This is the upper limit for how many transfers for the same file are running concurrently. Setting this above to a value smaller than 1 will cause uploads to deadlock.  If you are uploading small numbers of large files over high-speed links and these uploads do not…
  - `upload_cutoff` — Cutoff/Threshold for chunked uploads.  Any files larger than this will be uploaded in chunks of the configured chunksize.  The upper limit for this is 2147483647 bytes (about 2.000Gi). That is the maximum amount of bytes a single upload-operation will support. Setting this above the upper limit wil…
- `POST /api/v1/backends/http` body — `{ description: string="", headers: string, no_escape: bool=false, no_head: bool=false, no_slash: bool=false, url*: string="" }` — http backend configuration
  - `headers` — Set HTTP headers for all transactions.  Use this to set additional HTTP headers for all transactions.  The input format is comma separated list of key,value pairs. Standard [CSV encoding](https://godoc.org/encoding/csv) may be used.  For example, to set a Cookie use 'Cookie,name=value', or '"Cookie…
  - `no_escape` — Do not escape URL metacharacters in path names.
  - `no_head` — Don't use HEAD requests.  HEAD requests are mainly used to find file sizes in dir listing. If your site is being very slow to load then you can try this option. Normally Hoody does a HEAD request for each potential file in a directory listing to:  - find its size - check it really exists - check to…
  - `no_slash` — Set this if the site doesn't end directories with /.  Use this if your target website does not use / on the end of directories.  A / on the end of a path is how Hoody normally tells the difference between files and directories. If this flag is set, then Hoody will treat all files with Content-Type:…
  - `url` — URL of HTTP host to connect to.  E.g. "https://example.com", or "https://example.com" to use a username and password.
- `POST /api/v1/backends/iclouddrive` body — `{ apple_id*: string="", client_id: string="d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d", cookies: string="", description: string="", encoding: string="50438146", password*: string="", trust_token: string="" }` — iclouddrive backend configuration
  - `apple_id` — Apple ID.
  - `cookies` — cookies (internal use only)
  - `password` — Password.
- `POST /api/v1/backends/imagekit` body — `{ description: string="", encoding: string="117553486", endpoint*: string="", only_signed: bool=false, private_key*: string="", public_key*: string="", upload_tags: string="", versions: bool=false }` — imagekit backend configuration
  - `endpoint` — You can find your ImageKit.io URL endpoint in your [dashboard](https://imagekit.io/dashboard/developer/api-keys)
  - `only_signed` — If you have configured `Restrict unsigned image URLs` in your dashboard settings, set this to true.
  - `private_key` — You can find your ImageKit.io private key in your [dashboard](https://imagekit.io/dashboard/developer/api-keys)
  - `public_key` — You can find your ImageKit.io public key in your [dashboard](https://imagekit.io/dashboard/developer/api-keys)
  - `upload_tags` — Tags to add to the uploaded files, e.g. "tag1,tag2".
  - `versions` — Include old versions in directory listings.
- `POST /api/v1/backends/internetarchive` body — `{ access_key_id: string="", description: string="", disable_checksum: bool=true, encoding: string="50446342", endpoint: string="https://s3.us.archive.org", front_endpoint: string="https://archive.org", secret_access_key: string="", wait_archive: int=0 }` — internetarchive backend configuration
  - `access_key_id` — IAS3 Access Key.  Leave blank for anonymous access. You can find one here: https://archive.org/account/s3.php
  - `disable_checksum` — Don't ask the server to test against MD5 checksum calculated by Hoody. Normally Hoody will calculate the MD5 checksum of the input before uploading it so it can ask the server to check the object against checksum. This is great for data integrity checking but can cause long delays for large files t…
  - `endpoint` — IAS3 Endpoint.  Leave blank for default value.
  - `front_endpoint` — Host of InternetArchive Frontend.  Leave blank for default value.
  - `secret_access_key` — IAS3 Secret Key (password).  Leave blank for anonymous access.
  - `wait_archive` — Timeout for waiting the server's processing tasks (specifically archive and book_op) to finish. Only enable if you need to be guaranteed to be reflected after write operations. 0 to disable waiting. No errors to be thrown in case of timeout. (in seconds)
- `POST /api/v1/backends/jottacloud` body — `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50431886", hard_delete: bool=false, md5_memory_limit: string="10485760", no_versions: bool=false, token: string="", token_url: string="", trashed_only: bool=false, upload_resume_limit: string="10485760" }` — jottacloud backend configuration
  - `hard_delete` — Delete files permanently rather than putting them into the trash.
  - `md5_memory_limit` — Files bigger than this will be cached on disk to calculate the MD5 if required.
  - `no_versions` — Avoid server side versioning by deleting files and recreating files instead of overwriting them.
  - `trashed_only` — Only show files that are in the trash.  This will show trashed files in their original directory structure.
  - `upload_resume_limit` — Files bigger than this can be resumed if the upload fail's.
- `POST /api/v1/backends/koofr` body — `{ description: string="", encoding: string="50438146", endpoint*: string="", mountid: string="", password*: string="", provider: "koofr" | "digistorage" | "other"="", setmtime: bool=true, user*: string="" }` — koofr backend configuration
  - `endpoint` — The Koofr API endpoint to use.
  - `mountid` — Mount ID of the mount to use.  If omitted, the primary mount is used.
  - `password` — Your password for Hoody (generate one at your service's settings page).
  - `provider` — Choose your storage provider.
  - `setmtime` — Does the backend support setting modification time.  Set this to false if you use a mount ID that points to a Dropbox or Amazon Drive backend.
  - `user` — Your user name.
- `POST /api/v1/backends/linkbox` body — `{ description: string="", token*: string="" }` — linkbox backend configuration
  - `token` — Token from https://www.linkbox.to/admin/account
- `POST /api/v1/backends/local` body — `{ case_insensitive: bool=false, case_sensitive: bool=false, copy_links: bool=false, description: string="", encoding: string="33554434", links: bool=false, no_check_updated: bool=false, no_clone: bool=false, no_preallocate: bool=false, no_set_modtime: bool=false, no_sparse: bool=false, nounc: "true"=false, one_file_system: bool=false, skip_links: bool=false, time_type: "mtime" | "atime" | "btime" | "ctime"="0", unicode_normalization: bool=false, zero_size_links: bool=false }` — local backend configuration
  - _(17 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/mailru` body — `{ auth_url: string="", check_hash: "true" | "false"=true, client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50440078", pass*: string="", quirks: string="", speedup_enable: "true" | "false"=true, speedup_file_patterns: "" | "*" | "*.mkv,*.avi,*.mp4,*.mp3" | "*.zip,*.gz,*.rar,*.pdf"="*.mkv,*.avi,*.mp4,*.mp3,*.zip,*.gz,*.rar,*.pdf", speedup_max_disk: "0" | "1G" | "3G"="3221225472", speedup_max_memory: "0" | "32M" | "256M"="33554432", token: string="", token_url: string="", user*: string="", user_agent: string="" }` — mailru backend configuration
  - `check_hash` — What should copy do if file checksum is mismatched or invalid.
  - `pass` — Password.  This must be an app password - Hoody will not work with your normal password. See the Configuration section in the docs for how to make an app password.
  - `quirks` — Comma separated list of internal maintenance flags.  This option must not be used by an ordinary user. It is intended only to facilitate remote troubleshooting of backend issues. Strict meaning of flags is not documented and not guaranteed to persist between releases. Quirks will be removed when th…
  - `speedup_enable` — Skip full upload if there is another file with same data hash.  This feature is called "speedup" or "put by hash". It is especially efficient in case of generally available files like popular books, video or audio clips, because files are searched by hash in all accounts of all mailru users. It is…
  - `speedup_file_patterns` — Comma separated list of file name patterns eligible for speedup (put by hash).  Patterns are case insensitive and can contain '*' or '?' meta characters.
  - `speedup_max_disk` — This option allows you to disable speedup (put by hash) for large files.  Reason is that preliminary hashing can exhaust your RAM or disk space.
  - `speedup_max_memory` — Files larger than the size given below will always be hashed on disk.
  - `user` — User name (usually email).
  - `user_agent` — HTTP user agent used internally by client.  Defaults to "Hoody/VERSION" or "--user-agent" provided on command line.
- `POST /api/v1/backends/mega` body — `{ debug: bool=false, description: string="", encoding: string="50331650", hard_delete: bool=false, pass*: string="", use_https: bool=false, user*: string="" }` — mega backend configuration
  - `debug` — Output more debug from Mega.  If this flag is set (along with -vv) it will print further debugging information from the mega backend.
  - `hard_delete` — Delete files permanently rather than putting them into the trash.  Normally the mega backend will put all deletions into the trash rather than permanently deleting them. If you specify this then Hoody will permanently delete objects instead.
  - `pass` — Password.
  - `use_https` — Use HTTPS for transfers.  MEGA uses plain text HTTP connections by default. Some ISPs throttle HTTP connections, this causes transfers to become very slow. Enabling this will force MEGA to use HTTPS for all transfers. HTTPS is normally not necessary since all data is already encrypted anyway. Enabl…
  - `user` — User name.
- `POST /api/v1/backends/memory` body — `{ description: string="" }` — memory backend configuration
- `POST /api/v1/backends/netstorage` body — `{ account*: string="", description: string="", host*: string="", protocol: "http" | "https"="https", secret*: string="" }` — netstorage backend configuration
  - `account` — Set the NetStorage account name
  - `host` — Domain+path of NetStorage host to connect to.  Format should be `<domain>/<internal folders>`
  - `protocol` — Select between HTTP or HTTPS protocol.  Most users should choose HTTPS, which is the default. HTTP is provided primarily for debugging purposes.
  - `secret` — Set the NetStorage account secret/G2O key for authentication.  Please choose the 'y' option to set your own password then enter your secret.
- `POST /api/v1/backends/onedrive` body — `{ access_scopes: "Files.Read Files.ReadWrite Files.Read.All Files.ReadWrite.All Sites.Read.All offline_access" | "Files.Read Files.Read.All Sites.Read.All offline_access" | "Files.Read Files.ReadWrite Files.Read.All Files.ReadWrite.All offline_access", auth_url: string="", av_override: bool=false, chunk_size: string="10485760", client_credentials: bool=false, client_id: string="", client_secret: string="", delta: bool=false, description: string="", disable_site_permission: bool=false, drive_id: string="", drive_type: string="", encoding: string="57386894", expose_onenote_files: bool=false, hard_delete: bool=false, hash_type: "auto" | "quickxor" | "sha1" | "sha256" | "crc32" | "none"="auto", link_password: string="", link_scope: "anonymous" | "organization"="anonymous", link_type: "view" | "edit" | "embed"="view", list_chunk: int=1000, metadata_permissions: "off" | "read" | "write" | "read,write" | "failok"="0", no_versions: bool=false, region: "global" | "us" | "de" | "cn"="global", root_folder_id: string="", server_side_across_configs: bool=false, tenant: string="", token: string="", token_url: string="" }` — onedrive backend configuration
  - _(28 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/opendrive` body — `{ chunk_size: string="10485760", description: string="", encoding: string="62007182", password*: string="", username*: string="" }` — opendrive backend configuration
  - `chunk_size` — Files will be uploaded in chunks this size.  Note that these chunks are buffered in memory so increasing them will increase memory use.
  - `username` — Username.
- `POST /api/v1/backends/oracleobjectstorage` body — `{ attempt_resume_upload: bool=false, chunk_size: string="5242880", compartment: string="", config_file: "~/.oci/config"="~/.oci/config", config_profile: "Default"="Default", copy_cutoff: string="4999610368", copy_timeout: int=60, description: string="", disable_checksum: bool=false, encoding: string="50331650", endpoint: string="", leave_parts_on_error: bool=false, max_upload_parts: int=10000, namespace*: string="", no_check_bucket: bool=false, provider*: "env_auth" | "user_principal_auth" | "instance_principal_auth" | "workload_identity_auth" | "resource_principal_auth" | "no_auth"="env_auth", region*: string="", sse_customer_algorithm: "" | "AES256"="", sse_customer_key: ""="", sse_customer_key_file: ""="", sse_customer_key_sha256: ""="", sse_kms_key_id: ""="", storage_tier: "Standard" | "InfrequentAccess" | "Archive"="Standard", upload_concurrency: int=10, upload_cutoff: string="209715200" }` — oracleobjectstorage backend configuration
  - _(25 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/pcloud` body — `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50438146", hostname: "api.pcloud.com" | "eapi.pcloud.com"="api.pcloud.com", password: string="", root_folder_id: string="d0", token: string="", token_url: string="", username: string="" }` — pcloud backend configuration
  - `hostname` — Hostname to connect to.  This is normally set when Hoody initially does the oauth connection, however you will need to set it by hand if you are using remote config with Hoody authorize.
  - `password` — Your pcloud password.
  - `username` — Your pcloud username.   This is only required when you want to use the cleanup command. Due to a bug in the pcloud API the required API does not support OAuth authentication so we have to rely on user password authentication for it.
- `POST /api/v1/backends/pikpak` body — `{ chunk_size: string="5242880", description: string="", device_id: string="", encoding: string="56829838", hash_memory_limit: string="10485760", no_media_link: bool=false, pass*: string="", root_folder_id: string="", trashed_only: bool=false, upload_concurrency: int=5, use_trash: bool=true, user*: string="", user_agent: string="Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0" }` — pikpak backend configuration
  - `chunk_size` — Chunk size for multipart uploads. 	 Large files will be uploaded in chunks of this size.  Note that this is stored in memory and there may be up to "--transfers" * "--pikpak-upload-concurrency" chunks stored at once in memory.  If you are transferring large files over high-speed links and you have…
  - `device_id` — Device ID used for authorization.
  - `hash_memory_limit` — Files bigger than this will be cached on disk to calculate hash if required.
  - `no_media_link` — Use original file links instead of media links.  This avoids issues caused by invalid media links, but may reduce download speeds.
  - `pass` — Pikpak password.
  - `root_folder_id` — ID of the root folder. Leave blank normally.  Fill in for Hoody to use a non root folder as its starting point.
  - `upload_concurrency` — Concurrency for multipart uploads.  This is the number of chunks of the same file that are uploaded concurrently for multipart uploads.  Note that chunks are stored in memory and there may be up to "--transfers" * "--pikpak-upload-concurrency" chunks stored at once in memory.  If you are uploading…
  - `use_trash` — Send files to the trash instead of deleting permanently.  Defaults to true, namely sending files to the trash. Use `--pikpak-use-trash=false` to delete files permanently instead.
  - `user` — Pikpak username.
  - `user_agent` — HTTP user agent for pikpak.  Defaults to "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0" or "--pikpak-user-agent" provided on command line.
- `POST /api/v1/backends/pixeldrain` body — `{ api_key: string="", api_url*: string="https://pixeldrain.com/api", description: string="", root_folder_id: string="me" }` — pixeldrain backend configuration
  - `api_key` — API key for your pixeldrain account. Found on https://pixeldrain.com/user/api_keys.
  - `api_url` — The API endpoint to connect to. In the vast majority of cases it's fine to leave this at default. It is only intended to be changed for testing purposes.
  - `root_folder_id` — Root of the filesystem to use.  Set to 'me' to use your personal filesystem. Set to a shared directory ID to use a shared directory.
- `POST /api/v1/backends/premiumizeme` body — `{ api_key: string="", auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50438154", token: string="", token_url: string="" }` — premiumizeme backend configuration
  - `api_key` — API Key.  This is not normally used - use oauth instead.
- `POST /api/v1/backends/protondrive` body — `{ 2fa: string="", app_version: string="macos-drive@1.0.0-alpha.1+hoody-vfs", client_access_token: string="", client_refresh_token: string="", client_salted_key_pass: string="", client_uid: string="", description: string="", enable_caching: bool=true, encoding: string="52559874", mailbox_password: string="", original_file_size: bool=true, password*: string="", replace_existing_draft: bool=false, username*: string="" }` — protondrive backend configuration
  - `2fa` — The 2FA code  The value can also be provided with --protondrive-2fa=000000  The 2FA code of your proton drive account if the account is set up with  two-factor authentication
  - `app_version` — The app version string   The app version string indicates the client that is currently performing  the API request. This information is required and will be sent with every  API request.
  - `client_access_token` — Client access token key (internal use only)
  - `client_refresh_token` — Client refresh token key (internal use only)
  - `client_salted_key_pass` — Client salted key pass key (internal use only)
  - `client_uid` — Client uid key (internal use only)
  - `enable_caching` — Caches the files and folders metadata to reduce API calls  Notice: If you are mounting ProtonDrive as a VFS, please disable this feature,  as the current implementation doesn't update or clear the cache when there are  external changes.   The files and folders on ProtonDrive are represented as link…
  - `mailbox_password` — The mailbox password of your two-password proton account.  For more information regarding the mailbox password, please check the  following official knowledge base article:  https://proton.me/support/the-difference-between-the-mailbox-password-and-login-password
  - `original_file_size` — Return the file size before encryption   The size of the encrypted file will be different from (bigger than) the  original file size. Unless there is a reason to return the file size  after encryption is performed, otherwise, set this option to true, as  features like Open() which will need to be s…
  - `password` — The password of your proton account.
  - `replace_existing_draft` — Create a new revision when filename conflict is detected  When a file upload is cancelled or failed before completion, a draft will be  created and the subsequent upload of the same file to the same location will be  reported as a conflict.  The value can also be set by --protondrive-replace-existi…
  - `username` — The username of your proton account
- `POST /api/v1/backends/putio` body — `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50438146", token: string="", token_url: string="" }` — putio backend configuration
- `POST /api/v1/backends/qingstor` body — `{ access_key_id: string="", chunk_size: string="4194304", connection_retries: int=3, description: string="", encoding: string="16842754", endpoint: string="", env_auth: "false" | "true"=false, secret_access_key: string="", upload_concurrency: int=1, upload_cutoff: string="209715200", zone: "pek3a" | "sh1a" | "gd2a"="" }` — qingstor backend configuration
  - `access_key_id` — QingStor Access Key ID.  Leave blank for anonymous access or runtime credentials.
  - `chunk_size` — Chunk size to use for uploading.  When uploading files larger than upload_cutoff they will be uploaded as multipart uploads using this chunk size.  Note that "--qingstor-upload-concurrency" chunks of this size are buffered in memory per transfer.  If you are transferring large files over high-speed…
  - `connection_retries` — Number of connection retries.
  - `endpoint` — Enter an endpoint URL to connection QingStor API.  Leave blank will use the default value "https://qingstor.com:443".
  - `env_auth` — Get QingStor credentials from runtime.  Only applies if access_key_id and secret_access_key is blank.
  - `secret_access_key` — QingStor Secret Access Key (password).  Leave blank for anonymous access or runtime credentials.
  - `upload_concurrency` — Concurrency for multipart uploads.  This is the number of chunks of the same file that are uploaded concurrently.  NB if you set this to > 1 then the checksums of multipart uploads become corrupted (the uploads themselves are not corrupted though).  If you are uploading small numbers of large files…
  - `upload_cutoff` — Cutoff for switching to chunked upload.  Any files larger than this will be uploaded in chunks of chunk_size. The minimum is 0 and the maximum is 5 GiB.
  - `zone` — Zone to connect to.  Default is "pek3a".
- `POST /api/v1/backends/quatrix` body — `{ api_key*: string="", description: string="", effective_upload_time: string="4s", encoding: string="50438146", hard_delete: bool=false, host*: string="", maximal_summary_chunk_size: string="100000000", minimal_chunk_size: string="10000000", skip_project_folders: bool=false }` — quatrix backend configuration
  - `api_key` — API key for accessing Quatrix account
  - `effective_upload_time` — Wanted upload time for one chunk
  - `hard_delete` — Delete files permanently rather than putting them into the trash
  - `host` — Host name of Quatrix account
  - `maximal_summary_chunk_size` — The maximal summary for all chunks. It should not be less than 'transfers'*'minimal_chunk_size'
  - `minimal_chunk_size` — The minimal size for one chunk
  - `skip_project_folders` — Skip project folders in operations
- `POST /api/v1/backends/s3` body — `{ access_key_id: string="", acl: "default" | "private" | "public-read" | "public-read-write" | "authenticated-read" | "bucket-owner-read" | "bucket-owner-full-control"="", bucket_acl: "private" | "public-read" | "public-read-write" | "authenticated-read"="", chunk_size: string="5242880", copy_cutoff: string="4999610368", decompress: bool=false, description: string="", directory_bucket: bool=false, directory_markers: bool=false, disable_checksum: bool=false, disable_http2: bool=false, download_url: string="", encoding: string="50331650", endpoint*: "objects-us-east-1.dream.io" | "syd1.digitaloceanspaces.com" | "sfo3.digitaloceanspaces.com" | "fra1.digitaloceanspaces.com" | "nyc3.digitaloceanspaces.com" | "ams3.digitaloceanspaces.com" | "sgp1.digitaloceanspaces.com" | "localhost:8333" | …(35 values)="", env_auth: "false" | "true"=false, force_path_style: bool=true, leave_parts_on_error: bool=false, list_chunk: int=1000, list_url_encode: string, list_version: int=0, location_constraint: string="", max_upload_parts: int=10000, memory_pool_flush_time: int=60, memory_pool_use_mmap: bool=false, might_gzip: string, no_check_bucket: bool=false, no_head: bool=false, no_head_object: bool=false, no_system_metadata: bool=false, profile: string="", provider: "AWS" | "Alibaba" | "ArvanCloud" | "Ceph" | "ChinaMobile" | "Cloudflare" | "DigitalOcean" | "Dreamhost" | …(34 values)="", region: "" | "other-v2-signature"="", requester_pays: bool=false, sdk_log_mode: string="0", secret_access_key: string="", server_side_encryption: "" | "AES256" | "aws:kms"="", session_token: string="", shared_credentials_file: string="", sse_customer_algorithm: "" | "AES256"="", sse_customer_key: ""="", sse_customer_key_base64: ""="", sse_customer_key_md5: ""="", sse_kms_key_id: "" | "arn:aws:kms:us-east-1:*"="", storage_class: "STANDARD" | "LINE" | "GLACIER" | "DEEP_ARCHIVE"="", sts_endpoint: string="", upload_concurrency: int=4, upload_cutoff: string="209715200", use_accelerate_endpoint: bool=false, use_accept_encoding_gzip: string, use_already_exists: string, use_dual_stack: bool=false, use_multipart_etag: string, use_multipart_uploads: string, use_presigned_request: bool=false, use_unsigned_payload: string, v2_auth: bool=false, version_at: string="0001-01-01T00:00:00Z", version_deleted: bool=false, versions: bool=false }` — s3 backend configuration
  - _(59 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/seafile` body — `{ 2fa: bool=false, auth_token: string="", create_library: bool=false, description: string="", encoding: string="16850954", library: string="", library_key: string="", pass: string="", url*: "https://cloud.seafile.com/"="", user*: string="" }` — seafile backend configuration
  - `2fa` — Two-factor authentication ('true' if the account has 2FA enabled).
  - `auth_token` — Authentication token.
  - `create_library` — Should Hoody create a library if it doesn't exist.
  - `library` — Name of the library.  Leave blank to access all non-encrypted libraries.
  - `library_key` — Library password (for encrypted libraries only).  Leave blank if you pass it through the command line.
  - `url` — URL of seafile host to connect to.
  - `user` — User name (usually email address).
- `POST /api/v1/backends/sftp` body — `{ ask_password: bool=false, chunk_size: string="32768", ciphers: string, concurrency: int=64, connections: int=0, copy_is_hardlink: bool=false, description: string="", disable_concurrent_reads: bool=false, disable_concurrent_writes: bool=false, disable_hashcheck: bool=false, host*: string="", host_key_algorithms: string, idle_timeout: int=60, key_exchange: string, key_file: string="", key_file_pass: string="", key_pem: string="", key_use_agent: bool=false, known_hosts_file: "~/.ssh/known_hosts"="", macs: string, md5sum_command: string="", pass: string="", path_override: string="", port: int=22, pubkey: string="", pubkey_file: string="", server_command: string="", set_env: string, set_modtime: bool=true, sha1sum_command: string="", shell_type: "none" | "unix" | "powershell" | "cmd"="", skip_links: bool=false, socks_proxy: string="", ssh: string, subsystem: string="sftp", use_fstat: bool=false, use_insecure_cipher: "false" | "true"=false, user: string="user" }` — sftp backend configuration
  - _(38 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/sharefile` body — `{ auth_url: string="", chunk_size: string="67108864", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="57091982", endpoint: string="", root_folder_id: "" | "favorites" | "allshared" | "connectors" | "top"="", token: string="", token_url: string="", upload_cutoff: string="134217728" }` — sharefile backend configuration
  - `chunk_size` — Upload chunk size.  Must a power of 2 >= 256k.  Making this larger will improve performance, but note that each chunk is buffered in memory one per transfer.  Reducing this will reduce memory usage but decrease performance.
  - `endpoint` — Endpoint for API calls.  This is usually auto discovered as part of the oauth process, but can be set manually to something like: https://XXX.sharefile.com
  - `root_folder_id` — ID of the root folder.  Leave blank to access "Personal Folders". You can use one of the standard values here or any folder ID (long hex number ID).
  - `upload_cutoff` — Cutoff for switching to multipart upload.
- `POST /api/v1/backends/sia` body — `{ api_password: string="", api_url: string="http://127.0.0.1:9980", description: string="", encoding: string="50436354", user_agent: string="Sia-Agent" }` — sia backend configuration
  - `api_password` — Sia Daemon API Password.  Can be found in the apipassword file located in HOME/.sia/ or in the daemon directory.
  - `api_url` — Sia daemon API URL, like http://sia.daemon.host:9980.  Note that siad must run with --disable-api-security to open API port for other hosts (not recommended). Keep default if Sia daemon runs on localhost.
  - `user_agent` — Siad User Agent  Sia daemon requires the 'Sia-Agent' user agent by default for security
- `POST /api/v1/backends/smb` body — `{ case_insensitive: bool=true, description: string="", domain: string="WORKGROUP", encoding: string="56698766", hide_special_share: bool=true, host*: string="", idle_timeout: int=60, pass: string="", port: int=445, spn: string="", user: string="user" }` — smb backend configuration
  - `case_insensitive` — Whether the server is configured to be case-insensitive.  Always true on Windows shares.
  - `domain` — Domain name for NTLM authentication.
  - `hide_special_share` — Hide special shares (e.g. print$) which users aren't supposed to access.
  - `host` — SMB server hostname to connect to.  E.g. "example.com".
  - `pass` — SMB password.
  - `port` — SMB port number.
  - `spn` — Service principal name.  Hoody-VFS presents this name to the server. Some servers use this as further authentication, and it often needs to be set for clusters. For example:   cifs/remotehost:1020  Leave blank if not sure.
  - `user` — SMB username.
- `POST /api/v1/backends/storj` body — `{ access_grant: string="", api_key: string="", description: string="", passphrase: string="", provider: "existing" | "new"="existing", satellite_address: "us1.storj.io" | "eu1.storj.io" | "ap1.storj.io"="us1.storj.io" }` — storj backend configuration
  - `access_grant` — Access grant.
  - `api_key` — API key.
  - `passphrase` — Encryption passphrase.  To access existing objects enter passphrase used for uploading.
  - `provider` — Choose an authentication method.
  - `satellite_address` — Satellite address.  Custom satellite address should match the format: `<nodeid>@<address>:<port>`.
- `POST /api/v1/backends/sugarsync` body — `{ access_key_id: string="", app_id: string="", authorization: string="", authorization_expiry: string="", deleted_id: string="", description: string="", encoding: string="50397186", hard_delete: bool=false, private_access_key: string="", refresh_token: string="", root_id: string="", user: string="" }` — sugarsync backend configuration
  - `access_key_id` — Sugarsync Access Key ID.  Leave blank to use Hoody's.
  - `app_id` — Sugarsync App ID.  Leave blank to use Hoody's.
  - `authorization` — Sugarsync authorization.  Leave blank normally, will be auto configured by Hoody.
  - `authorization_expiry` — Sugarsync authorization expiry.  Leave blank normally, will be auto configured by Hoody.
  - `deleted_id` — Sugarsync deleted folder id.  Leave blank normally, will be auto configured by Hoody.
  - `hard_delete` — Permanently delete files if true otherwise put them in the deleted files.
  - `private_access_key` — Sugarsync Private Access Key.  Leave blank to use Hoody's.
  - `refresh_token` — Sugarsync refresh token.  Leave blank normally, will be auto configured by Hoody.
  - `root_id` — Sugarsync root id.  Leave blank normally, will be auto configured by Hoody.
  - `user` — Sugarsync user.  Leave blank normally, will be auto configured by Hoody.
- `POST /api/v1/backends/swift` body — `{ application_credential_id: string="", application_credential_name: string="", application_credential_secret: string="", auth: "https://auth.api.rackspacecloud.com/v1.0" | "https://lon.auth.api.rackspacecloud.com/v1.0" | "https://identity.api.rackspacecloud.com/v2.0" | "https://auth.storage.memset.com/v1.0" | "https://auth.storage.memset.com/v2.0" | "https://auth.cloud.ovh.net/v3" | "https://authenticate.ain.net"="", auth_token: string="", auth_version: int=0, chunk_size: string="5368709120", description: string="", domain: string="", encoding: string="16777218", endpoint_type: "public" | "internal" | "admin"="public", env_auth: "false" | "true"=false, fetch_until_empty_page: bool=false, key: string="", leave_parts_on_error: bool=false, no_chunk: bool=false, no_large_objects: bool=false, partial_page_fetch_threshold: int=0, region: string="", storage_policy: "" | "pcs" | "pca"="", storage_url: string="", tenant: string="", tenant_domain: string="", tenant_id: string="", use_segments_container: string, user: string="", user_id: string="" }` — swift backend configuration
  - _(27 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/tardigrade` body — `{ access_grant: string="", api_key: string="", description: string="", passphrase: string="", provider: "existing" | "new"="existing", satellite_address: "us1.storj.io" | "eu1.storj.io" | "ap1.storj.io"="us1.storj.io" }` — tardigrade backend configuration
- `POST /api/v1/backends/ulozto` body — `{ app_token: string="", description: string="", encoding: string="50438146", list_page_size: int=500, password: string="", root_folder_slug: string="", username: string="" }` — ulozto backend configuration
  - `app_token` — The application token identifying the app. An app API key can be either found in the API doc https://uloz.to/upload-resumable-api-beta or obtained from customer service.
  - `list_page_size` — The size of a single page for list commands. 1-500
  - `password` — The password for the user.
  - `root_folder_slug` — If set, Hoody will use this folder as the root folder for all operations. For example, if the slug identifies 'foo/bar/', 'ulozto:baz' is equivalent to 'ulozto:foo/bar/baz' without any root slug set.
  - `username` — The username of the principal to operate as.
- `POST /api/v1/backends/union` body — `{ action_policy: string="epall", cache_time: int=120, create_policy: string="epmfs", description: string="", min_free_space: string="1073741824", search_policy: string="ff", upstreams*: string="" }` — union backend configuration
  - `action_policy` — Policy to choose upstream on ACTION category.
  - `cache_time` — Cache time of usage and free space (in seconds).  This option is only useful when a path preserving policy is used.
  - `create_policy` — Policy to choose upstream on CREATE category.
  - `min_free_space` — Minimum viable free space for lfs/eplfs policies.  If a remote has less than this much free space then it won't be considered for use in lfs or eplfs policies.
  - `search_policy` — Policy to choose upstream on SEARCH category.
  - `upstreams` — List of space separated upstreams.  Can be 'upstreama:test/dir upstreamb:', '"upstreama:test/space:ro dir" upstreamb:', etc.
- `POST /api/v1/backends/uptobox` body — `{ access_token: string="", description: string="", encoding: string="50561070", private: bool=false }` — uptobox backend configuration
  - `access_token` — Your access token.  Get it from https://uptobox.com/my_account.
  - `private` — Set to make uploaded files private
- `POST /api/v1/backends/webdav` body — `{ auth_redirect: bool=false, bearer_token: string="", bearer_token_command: string="", description: string="", encoding: string="", headers: string, nextcloud_chunk_size: string="10485760", owncloud_exclude_mounts: bool=false, owncloud_exclude_shares: bool=false, pacer_min_sleep: int=0, pass: string="", unix_socket: string="", url*: string="", user: string="", vendor: "fastmail" | "nextcloud" | "owncloud" | "sharepoint" | "sharepoint-ntlm" | "hoody-vfs" | "other"="" }` — webdav backend configuration
  - `auth_redirect` — Preserve authentication on redirect.  If the server redirects Hoody to a new domain when it is trying to read a file then normally Hoody will drop the Authorization: header from the request.  This is standard security practice to avoid sending your credentials to an unknown webserver.  However this…
  - `bearer_token` — Bearer token instead of user/pass (e.g. a Macaroon).
  - `bearer_token_command` — Command to run to get a bearer token.
  - `encoding` — The encoding for the backend.  See the [encoding section in the overview](/overview/#encoding) for more info.  Default encoding is Slash,LtGt,DoubleQuote,Colon,Question,Asterisk,Pipe,Hash,Percent,BackSlash,Del,Ctl,LeftSpace,LeftTilde,RightSpace,RightPeriod,InvalidUtf8 for sharepoint-ntlm or identit…
  - `headers` — Set HTTP headers for all transactions.  Use this to set additional HTTP headers for all transactions  The input format is comma separated list of key,value pairs. Standard [CSV encoding](https://godoc.org/encoding/csv) may be used.  For example, to set a Cookie use 'Cookie,name=value', or '"Cookie"…
  - `nextcloud_chunk_size` — Nextcloud upload chunk size.  We recommend configuring your NextCloud instance to increase the max chunk size to 1 GB for better upload performances. See https://docs.nextcloud.com/server/latest/admin_manual/configuration_files/big_file_upload_configuration.html#adjust-chunk-size-on-nextcloud-side…
  - `owncloud_exclude_mounts` — Exclude ownCloud mounted storages
  - `owncloud_exclude_shares` — Exclude ownCloud shares
  - `pacer_min_sleep` — Minimum time to sleep between API calls. (in seconds)
  - `unix_socket` — Path to a unix domain socket to dial to, instead of opening a TCP connection directly
  - `url` — URL of http host to connect to.  E.g. https://example.com.
  - `user` — User name.  In case NTLM authentication is used, the username should be in the format 'Domain\User'.
  - `vendor` — Name of the WebDAV site/service/software you are using.
- `POST /api/v1/backends/yandex` body — `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50429954", hard_delete: bool=false, spoof_ua: bool=true, token: string="", token_url: string="" }` — yandex backend configuration
  - `spoof_ua` — Set the user agent to match an official version of the yandex disk client. May help with upload performance.
- `POST /api/v1/backends/zoho` body — `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="16875520", region: "com" | "eu" | "in" | "jp" | "com.cn" | "com.au"="", token: string="", token_url: string="", upload_cutoff: string="10485760" }` — zoho backend configuration
  - `region` — Zoho region to connect to.  You'll have to use the region your organization is registered in. If not sure use the same top level domain as you connect to in your browser.
  - `upload_cutoff` — Cutoff for switching to large file upload api (>= 10 MiB).
- `PUT /api/v1/backends/{id}` body — `{ [key: string]: string|null }` — Credential fields to update. Allowed keys: pass, password, key, passphrase, token, refresh_token, auth_token, bearer_token, session_token, secret, secret_key, secret_access_key, access_key_id, client_secret, client_id, service_account_credentials, private_key. Values must be strings or null (null d…

### `directories` (1) — Directory operations - create, list, download as ZIP

| Method | Summary | Params |
|--------|---------|--------|
| `MKCOL /{path}` | Create directory |  |

### `downloads` (4) — Downloads

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{directory}?download` | Download file from remote URL | `?download*` `?filename` `?timeout` |
| `GET /?download_history` | Download history | `?download_history*` |
| `GET /{directory}?downloads` | List active downloads | `?downloads*` |
| `GET /api/v1/downloads` | List active downloads |  |

**Param notes:**

- `directory` — Destination directory
- `download` — URL to download from
- `filename` — Custom filename for downloaded file
- `timeout` — Download timeout in seconds

### `files` (21) — File operations - upload, download, delete, list files

| Method | Summary | Params |
|--------|---------|--------|
| `PUT /api/v1/files/append/{path}` | Append data to file | `?owner` |
| `PATCH /api/v1/files/chmod/{path}` | Change file permissions | `?chmod*` |
| `PATCH /api/v1/files/chown/{path}` | Change file ownership | `?chown*` |
| `POST /api/v1/files/copy/{path}` | Copy file or directory | `?copy_to*` `?overwrite` `?owner` |
| `DELETE /api/v1/files/{path}` | Delete file or directory | `?backend` |
| `DELETE /{path}` | Delete file or directory |  |
| `GET /api/v1/files/{path}` | List directory or download file | `?backend` `?hash` `?sha256` `?base64` `?preview` `?contents` `?stat` `?thumbnail` `?grep` `?ignore_case` `?fixed_string` `?glob` `?context` `?max_count` `?max_matches` `?max_depth` `?max_filesize` `?timeout` `?no_ignore` `?max_results` `?max_files_scanned` `?sort` `?order` `?lines` `?history` `?at` `?revision` `?diff` `?from_seq` `?from_ts` `?to_seq` `?to_ts` `?after_id` `?limit` `?zip` |
| `HEAD /{path}` | Get file metadata | `?history` `?at` `?revision` `?diff` `?from_seq` `?from_ts` `?to_seq` `?to_ts` `?after_id` `?limit` |
| `GET /api/v1/files/glob/{path}` | Find files by glob pattern | `?pattern*` `?max_results` `?max_depth` `?max_files_scanned` `?timeout` `?no_ignore` `?sort` `?order` |
| `GET /api/v1/files/grep/{path}` | Search file contents (grep) | `?pattern*` `?ignore_case` `?fixed_string` `?glob` `?context` `?max_count` `?max_matches` `?max_depth` `?max_filesize` `?timeout` `?no_ignore` |
| `GET /{path}` | List directory contents or download file | `?json` `?simple` `?sort` `?order` `?hash` `?sha256` `?base64` `?edit` `?view` `?download` `?content-type` `?history` `?at` `?revision` `?diff` `?from_seq` `?from_ts` `?to_seq` `?to_ts` `?after_id` `?limit` |
| `POST /api/v1/files/move/{path}` | Move file or directory | `?move_to*` `?owner` |
| `POST /api/v1/files/{path}` | File operations (mkdir, extract, download, move, copy) | `?backend` `?mkdir` `?extract` `?dest` `?download_from` `?move_to` `?copy_to` `?overwrite` `?owner` |
| `PATCH /{path}` | File operations | `H:X-Update-Range` `body` |
| `PATCH /api/v1/files/{path}` | Modify file properties or move/rename | `?backend` `?owner` `?chmod` `?chown` `body` |
| `PUT /api/v1/files/{path}` | Upload or append file | `?backend` `?append` `?owner` |
| `GET /api/v1/files/realpath/{path}` | Resolve canonical path (realpath) |  |
| `GET /{directory}?q` | Search directory | `?q*` `?json` |
| `GET /api/v1/files/stat/{path}` | Get file metadata (stat) |  |
| `PUT /{path}?touch` | Touch file (create or update mtime) | `?touch*` |
| `PUT /{path}` | Upload file |  |

**Param notes:**

- `path` — File path
- `owner` — Create-time owner (user[:group]/uid[:gid]) when this append creates a new file. Requires --allow-chown + allowlist; refuses root. Absent → server default.
- `path` — File or directory path
- `chmod` — Octal permission mode (e.g., 755, 644, 0755)
- `chown` — Owner and optional group (e.g., user:group, user,:group, or UID:GID)
- `path` — Source file or directory path
- `copy_to` — Destination path to copy the file/directory to
- `overwrite` — Allow overwriting existing destination (default: false)
- `owner` — Create-time owner (user[:group]/uid[:gid]) for newly-created copies. Requires --allow-chown + allowlist; refuses root. Overwritten existing files preserve their owner. Absent → server default.
- `backend` — Backend ID for remote file deletion
- `path` — Path to file or directory to delete
- `backend` — Backend ID for remote file access
- `hash` — Get SHA256 hash of file
- `sha256` — Get SHA256 hash of file (alias for hash)
- `base64` — Get file content as base64
- `preview` — Preview archive contents (for zip/tar files). Alias: ?contents
- `contents` — Alias for ?preview - list archive contents
- `stat` — Get file/directory metadata (stat) without downloading content
- `thumbnail` — Return a processed image (resize, format convert, blur, grayscale). Requires the service to be started with --allow-thumbnails; returns 403 when disabled.
- `grep` — Search file/directory contents for regex pattern (or literal if fixed_string=true). Requires --allow-grep.
- `ignore_case` — Case-insensitive grep matching
- `fixed_string` — Treat grep pattern as literal string, not regex
- `glob` — Find files matching glob pattern (e.g. '**/*.rs', 'src/**/*.{ts,tsx}'). Requires --allow-search. Directory paths only.
- `context` — Number of context lines before/after each grep match
- `max_count` — Max matches per file for grep
- `max_matches` — Total max matches across all files for grep
- `max_depth` — Directory recursion depth for grep
- `max_filesize` — Skip files larger than this (bytes) during grep
- `timeout` — Grep timeout in seconds
- `no_ignore` — Bypass.gitignore filtering during grep
- `max_results` — Max entries returned for glob search
- `max_files_scanned` — Max filesystem entries scanned during glob search
- `sort` — Sort glob results by: mtime (default), name, or size
- `order` — Sort order for glob results. Default: desc for mtime, asc for name/size
- `lines` — Extract specific lines from a file. Formats: '10-50' (range, 1-indexed inclusive), '100' (single line), '-20' (last 20 lines / tail), '50-' (line 50 to end). Returns text/plain with X-Line-Range header. X-Total-Lines header included when naturally known (scan reached EOF). Max 100,000 lines or 64MB per request.
- `history` — List all revisions of a file. Returns JSON with revisions array, pagination via after_id. Mutually exclusive with at/revision/diff.
- `at` — Read file content at a point in time. Accepts RFC3339 timestamp or Unix milliseconds. Mutually exclusive with history/revision/diff. Composable with ?lines, ?hash, ?base64.
- `revision` — Read file content by stable per-path sequence number. Mutually exclusive with history/at/diff. Composable with ?lines, ?hash, ?base64.
- `diff` — Compute unified diff between two versions. Requires from_seq or from_ts. Optional to_seq or to_ts (defaults to current file). Mutually exclusive with history/at/revision.
- `from_seq` — Source revision seq number for ?diff. Mutually exclusive with from_ts.
- `from_ts` — Source timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with from_seq.
- `to_seq` — Target revision seq number for ?diff. Mutually exclusive with to_ts. Default: current file on disk.
- `to_ts` — Target timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with to_seq.
- `after_id` — Cursor for ?history pagination. Returns entries with id > after_id.
- `limit` — Max entries to return for ?history.
- `zip` — Download a directory as a streaming zip archive (bare flag, e.g. ?zip). Local directories only; requires --allow-archive. Same behavior as the WebDAV-style /{directory}?zip.
- `path` — Directory path to search within
- `pattern` — Glob pattern (e.g. '**/*.rs', 'src/**/*.{ts,tsx}', '*.md')
- `max_results` — Maximum entries to return
- `max_depth` — Maximum directory recursion depth
- `max_files_scanned` — Maximum filesystem entries to scan
- `timeout` — Search timeout in seconds
- `no_ignore` — Bypass.gitignore filtering
- `sort` — Sort results by: mtime (modification time), name, or size
- `order` — Sort order. Default: desc for mtime, asc for name/size
- `path` — File or directory path to search
- `pattern` — Search pattern (regex by default, literal if fixed_string=true)
- `ignore_case` — Case-insensitive matching
- `fixed_string` — Treat pattern as literal string, not regex
- `glob` — Filter files by glob pattern (e.g. '*.rs', '*.{ts,tsx}')
- `context` — Number of context lines before and after each match
- `max_count` — Maximum matches per file
- `max_matches` — Total maximum matches across all files
- `max_filesize` — Skip files larger than this (bytes)
- `json` — Return JSON format instead of HTML
- `simple` — Return simple text listing
- `sort` — Sort by field
- `order` — Sort order
- `hash` — Get SHA256 hash of file (returns plain text hash)
- `base64` — Get file content as base64 encoded string
- `edit` — Open file in Web UI editor (requires allow-upload permission)
- `view` — View file in Web UI (read-only mode)
- `download` — For file paths only: force browser download (Content-Disposition: attachment). Accepted values: empty (?download), 1, or true. For directory paths, ?download is the URL download-manager operation.
- `content-type` — Override Content-Type header for file downloads
- `move_to` — Destination path to move the file/directory to
- `owner` — Create-time owner (user[:group]/uid[:gid]) for newly-created destination PARENT directories. Requires --allow-chown + --allowed-create-owners; refuses root. The moved inode itself preserves its existing owner. Absent → server default.
- `mkdir` — Create directory
- `extract` — Extract archive. Empty value extracts all; non-empty value is a selective path to extract (e.g. "src/" or "lib/")
- `dest` — Destination directory name for extraction (default: archive name without extension)
- `download_from` — Download file from remote URL
- `move_to` — Move file/directory to destination path
- `copy_to` — Copy file/directory to destination path
- `overwrite` — Allow overwriting existing destination (for copy)
- `owner` — Create-time owner for newly-created inodes as user[:group] or uid[:gid]. Requires --allow-chown and must resolve to an entry in --allowed-create-owners; refuses root (uid/gid 0). Absent → the server default create owner. Applies to mkdir/extract/download_from/copy_to.
- `X-Update-Range` — Set to 'append' to append data to the end of the file. Perfect for logs and incremental writes. Example: curl -X PATCH -H 'X-Update-Range: append' --data-binary @data.txt http://server/file.log
- `backend` — Backend ID for remote file operations
- `owner` — Create-time owner (user[:group]/uid[:gid]) for newly-created destination parent directories on a JSON-body move_to. Requires --allow-chown + --allowed-create-owners; cannot be root. The moved item keeps its own owner. Absent → server default.
- `chmod` — Set file permissions using octal mode value (e.g., ?chmod=755)
- `chown` — Set file ownership (e.g., ?chown=user:group or ?chown=user)
- `backend` — Backend ID for remote upload
- `append` — Append body to end of existing file (create if missing) instead of overwriting
- `owner` — Create-time owner (user[:group]/uid[:gid]) for a newly-created file. Requires --allow-chown + --allowed-create-owners; refuses root. Overwrites/appends to an existing file preserve its owner. Absent → server default.
- `path` — File or directory path to resolve
- `q` — Search query (case-insensitive filename match). Maximum 512 BYTES of UTF-8 after form/percent decoding, measured both before and after Unicode lowercasing — lowercasing can change a string's byte length in either direction. Longer queries are rejected with 400; they are not truncated. Note this is a byte limit, not a character limit, so it is deliberately not expressed as `maxLength`.
- `path` — File path to touch
- `touch` — Flag to indicate touch operation
- `path` — Destination file path

**Body shapes:**

- `PATCH /{path}` body — `files_ChmodRequest | files_ChownRequest | files_RenameRequest`
- `PATCH /api/v1/files/{path}` body — `files_MoveRequest | files_RenameRequest`

### `ftp` (1) — WebDAV-compatible API for FTP/FTPS

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{path}?type=ftp` | Access file via FTP | `?type*` `?server*` `?user` `?pass` `?ftp_secure` `?ftp_passive` |

**Param notes:**

- `ftp_secure` — Use FTPS (FTP over TLS)
- `ftp_passive` — Use passive mode

### `git` (1) — WebDAV-compatible API for Git repositories

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{path}?type=git` | Fetch file from Git repository | `?type*` `?url*` `?ref` `?pass` |

**Param notes:**

- `url` — Full GitHub/GitLab/Bitbucket URL or repository URL
- `ref` — Branch, tag, or commit (defaults to HEAD or extracted from URL)
- `pass` — Personal Access Token (base64 encoded) for private repos

### `health` (1) — Health

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/files/health` | Service health check |  |

### `images` (1) — On-the-fly image conversion, resizing, and effects with format conversion (JPEG/PNG/WebP/GIF/BMP), multiple resize modes, quality control, blur, grayscale, and two-tier caching (memory + disk)

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{image}?thumbnail` | Process and convert images | `?thumbnail*` `?format` `?size` `?width` `?height` `?resize` `?quality` `?q` `?blur` `?grayscale` `?bg` |

**Param notes:**

- `image` — Path to image file
- `thumbnail` — Enable image processing
- `format` — Output format (default: jpeg)
- `size` — Width×Height in pixels (max: 2000×2000)
- `width` — Width in pixels (height auto-calculated)
- `height` — Height in pixels (width auto-calculated)
- `resize` — Resize mode: fit (preserve aspect, fit within), fill (exact size, crop), cover (cover area), exact (force dimensions)
- `quality` — Resize algorithm quality: low (box filter), medium (bilinear), high (Lanczos3)
- `q` — JPEG/WebP quality (1-100, higher is better quality)
- `blur` — Gaussian blur radius (0-50)
- `grayscale` — Convert to grayscale/black-and-white
- `bg` — Background color for transparency (hex RGB, e.g., 'ffffff' for white)

### `journal` (3) — Journal

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/journal/flush` | Flush journal to disk |  |
| `GET /api/v1/journal/stats` | Get journal statistics |  |
| `GET /api/v1/journal` | Query journal entries | `?path` `?op` `?since` `?limit` `?after_id` |

**Param notes:**

- `path` — Filter entries by path prefix
- `op` — Filter by operation type(s), comma-separated (e.g. 'write,delete')
- `since` — Filter entries since timestamp (RFC3339 or Unix ms)
- `limit` — Max entries to return
- `after_id` — Cursor: return entries with id > after_id

### `mounts` (5) — Mount management - create, list, and remove FUSE filesystem mounts for remote backends

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/mounts` | Create persistent FUSE mount | `body*` |
| `GET /api/v1/mounts/{id}` | Get mount details |  |
| `GET /api/v1/mounts` | List all mounts | `?label` |
| `DELETE /api/v1/mounts/{id}` | Unmount filesystem |  |
| `PATCH /api/v1/mounts/{id}` | Update mount VFS configuration | `body*` |

**Param notes:**

- `label` — Filter mounts by label. Only mounts with this exact label will be returned.

**Body shapes:**

- `POST /api/v1/mounts` body — `{ backend_id*: string, label: string, mount_path: string, vfs_config: { cache_max_age: int | string=3600, cache_max_size: int | string=10737418240, cache_mode: "off" | "minimal" | "writes" | "full"="writes", dir_cache_time: int | string=300 } }`
  - `backend_id` — ID of an existing backend connection
  - `label` — Optional human-readable label for this mount (e.g., "My NAS", "Work S3", "Photos Backup"). Used by the UI to identify mounts. Can be used to filter mounts via GET /api/v1/mounts?label=...
  - `mount_path` — Path for the mount. If omitted, defaults to /hoody/mounts/mount_{uuid}. Relative paths are resolved under the server's mount directory (/hoody/mounts/ by default).
  - `vfs_config` — VFS configuration for performance tuning (optional)
- `PATCH /api/v1/mounts/{id}` body — `{ vfs_config*: object }`
  - `vfs_config` — VFS configuration parameters

### `s3` (1) — WebDAV-compatible API for S3 storage

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{path}?type=s3` | Access file from S3 | `?type*` `?server*` `?s3_bucket*` `?s3_region*` `?user` `?pass` `?s3_endpoint` |

**Param notes:**

- `s3_bucket` — S3 bucket name
- `user` — AWS Access Key ID
- `pass` — AWS Secret Key (base64 encoded)
- `s3_endpoint` — Custom S3 endpoint for MinIO, etc.

### `ssh` (2) — WebDAV-compatible API for SSH/SFTP

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{path}?type=ssh` | Access file via SSH/SFTP | `?type*` `?server*` `?user*` `?pass` `?key` `?passphrase` |
| `PUT /{path}?type=ssh` | Upload file via SSH/SFTP | `?server*` `?user*` `?pass` `?key` `?passphrase` |

**Param notes:**

- `server` — Server hostname:port
- `user` — SSH username
- `pass` — Password (base64 encoded)
- `key` — Private key PEM (base64 encoded)
- `passphrase` — Key passphrase (base64 encoded)

### `system` (1) — System endpoints - health checks, version info, and status monitoring

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/version` | Get API version |  |

### `webdav` (8) — WebDAV protocol operations - PROPFIND, PROPPATCH, COPY, MOVE, LOCK, UNLOCK, OPTIONS

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{path}?type=webdav` | Access file via WebDAV | `?type*` `?server*` `?user` `?pass` `?webdav_path` |
| `COPY /{path}` | Copy file or directory | `H:Destination*` `H:Depth` |
| `OPTIONS /{path}` | Get allowed methods |  |
| `LOCK /{path}` | Lock file (WebDAV compatibility) | `H:Depth` |
| `MOVE /{path}` | Move or rename file/directory | `H:Destination*` |
| `PROPFIND /{path}` | Get WebDAV properties | `H:Depth` |
| `PROPPATCH /{path}` | Update WebDAV properties |  |
| `UNLOCK /{path}` | Unlock file (WebDAV compatibility) | `H:Lock-Token*` |

**Param notes:**

- `webdav_path` — WebDAV endpoint path
- `path` — Source file or directory path
- `Destination` — Destination URL for the copy
- `Depth` — Copy depth: 0 (file only) or infinity (recursive for directories)
- `Destination` — Destination URL for the move
- `Depth` — Depth of property retrieval: 0 (resource only), 1 (immediate children), infinity (recursive)
- `Lock-Token` — Lock token to release


### Body schemas

- `files_MoveRequest` — `{ move_to*: string }`
- `files_RenameRequest` — `{ name*: string }`
- `files_ChmodRequest` — `{ mode*: string }`
- `files_ChownRequest` — `{ group: string, owner: string }`
