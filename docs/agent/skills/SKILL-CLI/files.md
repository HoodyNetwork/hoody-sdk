> _**CLI skill · `files` namespace** · ~15,992 tokens · hoody-sdk v1.0.0-beta.12_

# `files` — container filesystem over HTTP, with automatic Git-like change history

## Purpose

**Default surface: the container's own filesystem, exposed over HTTP — with optional automatic mutation journaling when the kit is started with `--journal-path`.** Read, write, copy, move, delete, stat, chmod, list, glob, grep, archive-preview/extract, fetch URLs into the FS, resumable upload — all on absolute container paths (`/workspace/main.py`, `/etc/hostname`, `/hoody/databases/foo.db`). No backend flag needed.

**Headline feature when journaling is on — automatic change history (think Git, but for every file write).** With the journal enabled, every `PUT` / `PATCH` / `DELETE` / `MOVE` / `COPY` is appended to a per-container mutation log: monotonic sequence number, timestamp, path, op, size, hash. **You never lose a previous version of a journaled path.** The journal lets you:

- **Time-travel a single file** — `hoody files get` `?revision=<seq>` or `?at=<unix-ms>` returns the bytes as they were at that point.
- **List a file's history** — `hoody files get` `?history=1` walks every revision of the path.
- **Diff between revisions** — `hoody files get` `?diff=1&from_seq=<N>` returns a unified diff between revision `N` and current.
- **Replay / audit** — `hoody files journal query` `?path=<p>&after_id=<seq>` streams every operation since seq `N`. Run `hoody files journal flush` to force-persist before querying for the absolute latest.
- **Cross-replicate** — pipe the journal into another container as an event source for mirroring / fan-out / append-only sync.

When provisioned with `--journal-path`, no per-write setup is needed — every covered write is recorded (add `--allow-journal` to expose the journal query endpoints — history, revision, diff, stats, flush — over the API). Treat it as "always-on undo for the whole filesystem." Journaling is ON in the standard `hoody_kit: true` container image; raw kit deployments without those flags will accept writes but skip recording.

**Optional add-ons (per-request, opt-in):**
- **Remote backends** — append `?backend=<id>` (or `?type=<rclone-type>`) to operate against any of the 60+ rclone backend types you've connected (Mega, SFTP, S3, GDrive, Dropbox, Backblaze B2, WebDAV, Git, …) instead of the local FS. Requires `--allow-remote` server-side flag. Note: the journal records local-FS mutations; remote-backend ops go to the remote and aren't replayable from the journal.
- **FUSE mounts** — `hoody files mounts create` to surface a remote backend AS a path in the local FS. Same `--allow-remote` requirement.
- **chmod / chown** — Unix-only, requires `--allow-chmod` / `--allow-chown` server flags.

## When to use

- **Local container FS (the 90% case)** — CRUD, archive entry / extract, cross-binary search (glob, grep), download a URL into a path, resumable upload. Local works out of the box.
- **Recover / inspect a previous version of any file** — `?history=1`, `?revision=<seq>`, `?at=<unix-ms>`, `?diff=1&from_seq=<N>`. Always available because every write is journaled.
- **Audit / replay every change to the filesystem** — `hoody files journal query` for the full event stream (sequence, timestamp, path, op, size, hash).
- **Remote cloud / SSH / S3 / Git** — append `?backend=<id>` on `hoody files get` / `hoody files put` / `hoody files delete` / `hoody files modify-properties` / `hoody files operation` calls (the methods that accept a `backend` option). The same endpoints transparently target the remote.
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

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Read, search, write

1. `hoody files get` `?stat`/`?lines=10-50`.
2. `hoody files glob` `?pattern=**/*.ts`; `hoody files grep` `?pattern=TODO&context=2` (local only).
3. `hoody files put` `?append=true`; `hoody files delete`.

### 2. Download, extract, FUSE-mount

1. `hoody files downloads url` `GET /{dir}?download=<url>`; `hoody files downloads active` to poll.
2. `hoody files archive preview` `?preview`; `hoody files extractions create` `?extract=src/**&dest=work-src` (`?dest=` MUST be relative).
3. `hoody files backends connect s3` (60+ `connect*`) -> `hoody files get` for one-shot reads OR `hoody files mounts create` -> `hoody files dir` for a regular FS view -> `hoody files mounts unmount`/`hoody files backends disconnect`. (`hoody files dir` itself has no `backend` option; `hoody files get`/`hoody files put`/`hoody files delete` do.)

### 3. Journal time-travel + TUS-like upload

1. `hoody files get` `?history=1`, `?revision=N`/`?at=<unix-ms>`, `?diff=1&from_seq=<N>`.
2. `hoody files journal query` `?path=<p>&after_id=<seq>`; `hoody files journal flush` first.
3. Resumable: `PUT /{path}` first chunk, then `PATCH /{path}` `X-Update-Range: append` per chunk.

## Quirks & gotchas

- Reserved sub-prefixes (stat, chmod, chown, realpath, glob, grep, copy, move, append) dispatch by URL prefix in `api/files.rs`, each scoped to a specific HTTP method (stat/grep/glob/realpath→GET, chmod/chown→PATCH, copy/move→POST, append→PUT) to prevent method bleeding -- so `DELETE /api/v1/files/stat/foo` does NOT trigger the stat dispatcher; it removes the literal path `/stat/foo`. (`/api/v1/files/health` is intercepted by a separate top-level route in `api/mod.rs:106` before this dispatcher sees it.)
- `hoody files glob`/`hoody files grep`/`hoody files realpath`/`?lines=` local-only; `?backend=` -> 400.
- `?backend=` and `?type=` need `--allow-remote`.
- `hoody files chmod`/`hoody files chown` Unix-only + `--allow-chmod`/`--allow-chown`.
- WebDAV verbs on `/{path}`: PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK, CHECKAUTH, LOGOUT.
- Cross-host propagation is SSHFS-only via `/external/...`.
- `hoody files realpath` follows symlinks even where blocked.
- **Resumable upload PATCH must use the WebDAV root route (`PATCH /{path}`), NOT `PATCH /api/v1/files/{path}`** — the api/v1 PATCH expects a JSON body and rejects raw bytes with `400 Invalid JSON body`. The WebDAV form takes `X-Update-Range: append` — or an HTTP-Range offset `bytes=<start>-<end>` (a Content-Range-style `/<size>` suffix is REJECTED with `400 Invalid X-Update-Range Header`) — plus the raw body, and returns `204 No Content` on success. An explicit offset must fall INSIDE the current file, so it can only overwrite, never extend past EOF; use `hoody files append` to extend. [live-verified]
- **Archive `?dest=` MUST be relative** (e.g. `?dest=extracted`), not absolute — sending `?dest=/abs/path` returns `400 Absolute destination path not allowed`. The directory is created relative to the archive's containing dir. [live-verified]
- **`?preview` query value matters** — pass `?preview` empty (no `=…`) for a full archive listing; `?preview=true` is parsed as the entry name `true` and returns `404 Entry not found in archive: true`. Same trap on `?contents`. [live-verified]
- **Bare `?extract_file=` is unhandled by the kit's GET dispatcher** — the request falls through to "send the raw archive file" and you get the **whole archive's bytes**, not the selected entry. The generated SDK and CLI work around this by ALSO sending `?extract=` — when both query params are present, the `hoody files extractions create` branch runs (writes to disk under `?dest=`). The OpenAPI-only `?extract_file=` form is effectively dead.
- **Journal default `max_file_size` is 2 MiB; oversized files still produce a journal entry with hash + size, but the body bytes are not stored**.
- **`journal.is_excluded(<relative-path>)` gates which paths are recorded.** Built-in dev-dir excludes (`node_modules`, `target`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `__pycache__`, `.venv`, `venv`, `env`, `__pypackages__`, `.tox`, `.nox`, `bower_components`, …) skip journaling unless you pass `--no-journal-ignore-dev-dirs`. `.git` is always excluded regardless of that flag (separate hardcoded check, not part of the toggleable list). Custom excludes via `--journal-exclude`. This is why "I wrote to `node_modules/x` and saw no journal entry" is expected.
- **Journal does NOT cover everything by default.** Live behaviour observed: a fresh `PUT` (create) and an overwriting `PUT` (write) on `/home/user/...` produce entries; URL downloads (`?download=`) and archive extraction are NOT journaled — those write through paths with no journal hook. `hoody files chmod`, `hoody files chown`, `hoody files touch`, `?append=true` and copy/move ARE recorded. Always call `hoody files journal flush` then `hoody files journal query` (or `?history=1`) to inspect what was actually recorded — don't assume coverage. [live-verified]
- **Built-in dev-dir exclude list always skips journaling** for `node_modules`, `__pycache__`, `.venv`, `target`, `.next`, `.nuxt`, etc. — even on `/home/user/...` paths. Disable these with `--no-journal-ignore-dev-dirs` at kit start. `.git` is hardcoded to ALWAYS be excluded and stays excluded even with `--no-journal-ignore-dev-dirs`.
- **`/tmp/...` paths appear NOT to be journaled** at all (live-verified — 0 entries for `/tmp/files-examples-*` writes). Use `/home/user/...` (or another non-`/tmp` path) when you need history.
- **`HEAD /api/v1/files/{path}` returns `405`**; the `hoody files metadata` operation in mappings is the WebDAV-style `HEAD /{path}` route (no `/api/v1/files/` prefix). Use `hoody files stat` (`GET /api/v1/files/stat/{path}`) for a JSON envelope instead. [live-verified]
- **`hoody files chown` to root is rejected** with `400 Cannot change ownership to root (UID 0)` (owner) or `400 Cannot change group to root (GID 0)` (group) — even if the kit has `--allow-chown`. Use a non-root user (`nobody`, `user`, …). [live-verified]
- **FUSE mount paths are confined to a configured mount-dir** (`/hoody/mounts` by default); arbitrary paths return `400 Mount path must be under the configured mount directory`. Override at kit start with `--mount-dir <path>`.
- **Listing-style query params (`?downloads`, `?download_history`, `?extractions`, `?extraction_history`) are honoured on the WebDAV root route, NOT on `/api/v1/files/...`** — calling `GET /api/v1/files/<dir>?downloads` returns a regular directory listing (the query is ignored). Use `GET /<dir>?downloads` (or `GET /?download_history` for the global feed). [live-verified]
- **`hoody-files` test container goes to sleep** between requests on a quiet kit; first hit may return `502` from the proxy with a `<!DOCTYPE html>…Error 502` body. Retry 2-3× with a few seconds backoff and the kit wakes up. [live-verified]
- **Mount the whole FS as a local drive on the USER's machine (client-side WebDAV).** Because the kit serves a WebDAV API at its URL root, the container's files mount natively as a drive/folder with no install: on **Windows** *Map network drive* to `https://{P}-{C}-files-1.{N}.containers.hoody.com/`, on **macOS** Finder → *Connect to Server* to the same URL; cross-platform/scripted, via `hoody mount <containerId> <localDir>` (WebDAV-backed remote mount; `--read-only`/`--background`/`--auth-token`/`--auth-password`/`--auth-ip` flags). This is the inverse of the server-side FUSE `hoody files mounts *` family (which mounts remote backends INTO the container).

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

Every step in every example was live-tested against a real `files-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. Paths under `/tmp/...` are NOT journaled by default — examples that need history use `/home/user/...`.

### 1. Read a file — full bytes, stat envelope, and a slice of lines

**Goal:** inspect an unknown text file three ways: get its metadata, peek the raw bytes, and slice an arbitrary line range without pulling the whole thing.

**Step 1 — stat first.** `hoody files stat` returns size, owner/group, octal permissions, mtime, plus a `revisions` count (how many journal entries exist for this path). Use this BEFORE downloading a file you don't know the size of.

```bash
hoody --container "$C" files stat /etc/hostname
```
**Step 2 — line slice.** `?lines=2-3` returns just lines 2 through 3 inclusive. Local-FS only (rejected with `400` when combined with `?backend=`).

```bash
hoody --container "$C" files get /var/log/syslog --lines 2-3
```
**Step 3 — full body.** No query params, raw bytes (or `Content-Type: application/octet-stream` for binaries).

```bash
hoody --container "$C" files get /etc/hostname > /tmp/hostname.txt
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
hoody --container "$C" files put /home/user/upload-test.bin < /tmp/chunk1.bin
```
**Step 2 — append remaining chunks.** Send `PATCH /<path>` (the WebDAV root route, NOT `/api/v1/files/...` — that one expects JSON and 400s on raw bytes). Header `X-Update-Range: append` says "concatenate". Returns `204 No Content`.

```bash
# _(no native `hoody files` shape)_ — `files patch` is not a raw-body command: its
# `--body` is an inline string with NO `@file` expansion, and `--input` is rejected.
# Use the HTTP form (`curl -X PATCH --data-binary @/tmp/chunk2.bin`) for this step.
hoody --container "$C" files stat /home/user/upload-test.bin
```
**Step 3 — same shape for resume after a network drop.** Re-append the missing chunk with `X-Update-Range: append` if you tracked the cursor client-side. An explicit `bytes=<start>-<end>` offset (no `/<total>` suffix — that is rejected) only overwrites INSIDE the existing file and cannot extend it, so it is not a resume mechanism. The generated **SDK and CLI currently expose only `X-Update-Range: append`**; explicit byte ranges need raw HTTP.

### 4. Time-travel a single file — history → revision N → diff

**Goal:** roll back a config file by reading an earlier revision, comparing it to current, then writing the chosen revision back. Journal tracks every PUT under `/home/user/...` (NOT `/tmp/...` — see Quirks).

**Step 1 — write two revisions.**

```bash
P=/home/user/config.toml
echo 'verbose = false' | hoody --container "$C" files put "$P"
sleep 1
echo 'verbose = true'  | hoody --container "$C" files put "$P"
hoody --container "$C" files journal flush
```
**Step 2 — list history.** `?history=1` returns the per-revision log: each entry has `seq`, `op` (`"create"` / `"write"` / `"delete"` / `"moved_from"`/`"moved_to"` / etc. — see Example 5 for the full enum), `ts`, hashes, and size deltas.

```bash
hoody --container "$C" files get "$P" --history -o json \
  | jq '.revisions[] | {seq, op, ts, size_after}'
```
**Step 3 — fetch revision N.** `?revision=1` returns the bytes of that point-in-time. (Use `?at=<unix-ms>` for an instant.)

```bash
hoody --container "$C" files get "$P" --revision 1
hoody --container "$C" files get "$P" --diff --from-seq 1
```
**Step 4 — restore by writing rev1 bytes back.** PUT the body returned by `?revision=1`.

### 5. Audit — stream every mutation since seq N via the journal

**Goal:** wire a SIEM / alerting pipeline. Get every FS mutation since the last cursor, including hashes for tamper detection. Don't forget `hoody files journal flush` first.

**Step 1 — flush so buffered journal writes are on disk.**

```bash
hoody --container "$C" files journal flush
```
**Step 2 — query since cursor.** `after_id` is the last `id` you've seen. `op` enum is `"create"` / `"write"` / `"append"` / `"delete"` / `"touch"` / `"moved_from"` / `"moved_to"` / `"copied_from"` / `"copied_to"` / `"dir_moved_from"` / `"dir_moved_to"` / `"dir_copied_from"` / `"dir_copied_to"` / `"dir_deleted"` / `"mkdir"` / `"chmod"` / `"chown"` / `"gap"` (no bare `"move"`/`"copy"` — use the directional `"moved_from"`/`"moved_to"` etc. pair).

```bash
hoody --container "$C" files journal query --after-id 0 --limit 200 -o json \
  | jq '{count, next: .next_after_id, entries}'
```
**Step 3 — health check.** Watch `hoody files journal stats` for `writer_healthy:false`, `parse_failures`, or `skipped_overflow > 0` — any of those means the audit trail is degraded.

```bash
hoody --container "$C" files journal stats
```
### 6. Download a URL straight into the FS (no curl, no wget needed)

**Goal:** pull an asset from the public internet into a container path. The kit handles the actual HTTP fetch — useful for sandboxed containers without outbound HTTP libs.

**Step 1 — fire-and-poll.** `GET /<directory>?download=<url>&filename=<name>` (URL-encode the URL). Returns a `download_id` for tracking.

```bash
hoody --container "$C" files downloads url /home/user/inbox \
  --download 'https://httpbin.org/robots.txt' --filename robots.txt --timeout 15
```
**Step 2 — list active.** `?downloads` ONLY works on the WebDAV root route — `GET /api/v1/files/<dir>?downloads` ignores the flag and returns a normal listing (live-verified).

```bash
hoody --container "$C" files downloads active /home/user/inbox --downloads
hoody --container "$C" files downloads history --download-history
```
### 7. Archive workflow — preview, then selective extract

**Goal:** extract just one subpath of a zip without unpacking the whole archive.

**Step 1 — preview** to see what's inside. `?preview` MUST be empty — `?preview=true` is parsed as the entry name `true` and 404s (live-verified).

```bash
hoody --container "$C" files archive preview /home/user/inbox/hello.zip --preview ''
```
**Step 2 — extract a subset.** `?extract=<glob>` selects entries (empty = all). `?dest=` MUST be relative — absolute paths return `400 Absolute destination path not allowed`. Destination is created relative to the archive's parent dir.

```bash
hoody --container "$C" files extractions create /home/user/inbox/hello.zip \
  --extract 'Hello-World-master/' --dest extracted
```
**Step 3 — extract a single file to disk.** Pass BOTH `?extract=<glob>` and `?extract_file=<path>` (the bare `?extract_file=` form falls through to "send whole archive"). The kit writes the matched entry under `?dest=` (or alongside the archive if omitted).

```bash
hoody --container "$C" files extractions extract-file /home/user/inbox/hello.zip \
  --extract Hello-World-master/README > /tmp/readme.txt
```
### 8. Cross-directory copy + move + chmod (a one-shot deploy)

**Goal:** stage a config in a working dir, copy to the target, set permissions, move the staging file to a backup folder. Uses POST against the copy/move reserved-prefix routes (`/api/v1/files/copy/...`, `/move/...`) and PATCH for chmod/chown (`/api/v1/files/chmod/...`, `/chown/...`).

**Step 1 — copy.** Both `copy_to` and (for move) `move_to` are **query params**, NOT body fields. Add `?overwrite=true` to allow replacing an existing destination.

```bash
hoody --container "$C" files copy /home/user/staging/app.toml \
  --copy-to /etc/myapp/app.toml --overwrite true
```
**Step 2 — chmod.** Octal as a query param (`?chmod=600`). Requires `--allow-chmod` at kit start; Unix-only.

```bash
hoody --container "$C" files chmod /etc/myapp/app.toml --chmod 600
```
**Step 3 — move staging → archive.** Same pattern as copy but no overwrite by default; `?move_to=` is required.

```bash
hoody --container "$C" files move /home/user/staging/app.toml \
  --move-to /home/user/archive/app.toml
```
### 9. Connect a remote backend, mount it as a path, list through both surfaces

**Goal:** attach a remote backend (here: `local` for portability — swap in `s3`/`sftp`/`drive` etc.) and surface it as a regular FS path via FUSE. Requires `--allow-remote` at kit start.

**Step 1 — connect.** Each backend has its own `POST /api/v1/backends/<type>` with type-specific config. Returns `{id, type, vfs_backend_type}`.

```bash
BID=$(hoody --container "$C" files backends connect local \
  --description local-passthrough -o json | jq -r '.id')   # CLI -o json unwraps the envelope → .id (not .data.id)
hoody --container "$C" files backends test "$BID"
```
**Step 2 — mount.** `mount_path` MUST sit under the kit's configured mount-dir (default `/hoody/mounts/...`) — arbitrary paths return `400 Mount path must be under the configured mount directory`.

```bash
MID=$(hoody --container "$C" files mounts create \
  --backend-id "$BID" --label local-mount \
  --mount-path /hoody/mounts/local-test -o json | jq -r '.id')   # CLI -o json unwraps the envelope → .id (not .data.id)
```
**Step 3 — read through the mount as a regular path.**

```bash
hoody --container "$C" files dir /hoody/mounts/local-test
```
**Step 4 — tear down** (in order: unmount, then disconnect).

```bash
hoody --container "$C" files mounts unmount "$MID"
hoody --container "$C" files backends disconnect "$BID"
```
### 10. Bulk delete a tree atomically — and verify nothing leaked

**Goal:** wipe a working directory and every file under it, then confirm via journal + listing that nothing remains.

**Step 1 — DELETE on the directory.** `DELETE /api/v1/files/<dir>` removes recursively. (Reserved-prefix trap: a path like `/api/v1/files/stat/foo` is interpreted as removing `/stat/foo`, NOT a stat call. Always use absolute container paths.)

```bash
hoody --container "$C" files delete /home/user/files-examples-cleanup
```
**Step 2 — verify.** A `404` from `hoody files stat` is what you want.

```bash
hoody --container "$C" files stat /home/user/files-examples-cleanup || echo "gone"
```
**Step 3 — confirm via journal.** A successful tree-delete emits `op: "delete"` (or `op: "dir_deleted"` per child). Flush first.

```bash
hoody --container "$C" files journal flush
hoody --container "$C" files journal query --path /home/user/files-examples-cleanup --limit 10
```

## Reference

### `hoody files` (117) — File operations and remote backends

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody files access ftp` |  | read | Access file via FTP | `files.ftp.access` | `hoody files access ftp /home/user/file.txt --type ftp --server srv-abc --user anonymous --pass <pass> --ftp-secure --ftp-passive` |
| `hoody files access s3` |  | read | Access file from S3 | `files.s3.access` | `hoody files access s3 /home/user/file.txt --type s3 --server srv-abc --s3-bucket <s3_bucket> --s3-region <s3_region> --user alice --pass <pass> --s3-endpoint <s3_endpoint>` |
| `hoody files access ssh` |  | read | Access file via SSH/SFTP | `files.ssh.access` | `hoody files access ssh /home/user/file.txt --type ssh --server srv-abc --user alice --pass <pass> --key <key> --passphrase <passphrase>` |
| `hoody files access ssh-upload` |  | write | Upload file via SSH/SFTP | `files.ssh.upload` | `hoody files access ssh-upload /home/user/file.txt --server srv-abc --user alice --pass <pass> --key <key> --passphrase <passphrase> --input <input>` |
| `hoody files access webdav` |  | read | Access file via WebDAV | `files.webdav.access` | `hoody files access webdav /home/user/file.txt --type webdav --server srv-abc --user alice --pass <pass> --webdav-path /` |
| `hoody files append` |  | write | Append data to file | `files.append` | `hoody files append /home/user/file.txt --owner <owner> --input <input>` |
| `hoody files archive preview` |  | read | Preview archive contents or read file | `files.archives.preview` | `hoody files archive preview /home/user/archive.zip --preview <preview> --contents <contents>` |
| `hoody files archive view` |  | read | View file from archive | `files.archives.viewFile` | `hoody files archive view /home/user/archive.zip --preview <preview>` |
| `hoody files backends connect alias` |  | write | Connect to alias backend | `files.backends.connectAlias` | `hoody files backends connect alias --description "My description" --remote origin` |
| `hoody files backends connect azureblob` |  | write | Connect to azureblob backend | `files.backends.connectAzureblob` | `hoody files backends connect azureblob --access-tier <access_tier> --account acc-abc --archive-tier-delete --chunk-size 4194304 --client-certificate-password <client_certificate_password> --client-certificate-path /home/user/file.txt --client-id abc-123 --client-secret <client_secret> --client-send-certificate-chain --delete-snapshots include --description "My description" --directory-markers --disable-checksum --disable-instance-discovery --encoding 21078018 --endpoint https://example.com --env-auth --key <key> --list-chunk 5000 --memory-pool-flush-time 60 --memory-pool-use-mmap --msi-client-id abc-123 --msi-mi-res-id abc-123 --msi-object-id abc-123 --password <password> --public-access blob --sas-url https://example.com --service-principal-file <service_principal_file> --tenant tenant-abc --upload-concurrency 16 --upload-cutoff 1048576 --use-az --use-emulator --use-msi --username alice` |
| `hoody files backends connect azurefiles` |  | write | Connect to azurefiles backend | `files.backends.connectAzurefiles` | `hoody files backends connect azurefiles --account acc-abc --chunk-size 4194304 --client-certificate-password <client_certificate_password> --client-certificate-path /home/user/file.txt --client-id abc-123 --client-secret <client_secret> --client-send-certificate-chain --connection-string <connection_string> --description "My description" --encoding 54634382 --endpoint https://example.com --env-auth --key <key> --max-stream-size 10737418240 --msi-client-id abc-123 --msi-mi-res-id abc-123 --msi-object-id abc-123 --password <password> --sas-url https://example.com --service-principal-file <service_principal_file> --share-name <share_name> --tenant tenant-abc --upload-concurrency 16 --use-msi --username alice` |
| `hoody files backends connect b2` |  | write | Connect to b2 backend | `files.backends.connectB2` | `hoody files backends connect b2 --account acc-abc --chunk-size 100663296 --copy-cutoff 4294967296 --description "My description" --disable-checksum --download-auth-duration 604800 --download-url https://example.com --encoding 50438146 --endpoint https://example.com --hard-delete --key <key> --lifecycle 0 --memory-pool-flush-time 60 --memory-pool-use-mmap --test-mode <test_mode> --upload-concurrency 4 --upload-cutoff 209715200 --version-at 0001-01-01T00:00:00Z --versions` |
| `hoody files backends connect box` |  | write | Connect to box backend | `files.backends.connectBox` | `hoody files backends connect box --access-token <access_token> --auth-url https://example.com/auth --box-config-file <box_config_file> --box-sub-type user --client-credentials --client-id abc-123 --client-secret <client_secret> --commit-retries 100 --description "My description" --encoding 52535298 --impersonate abc-123 --list-chunk 1000 --owned-by <owned_by> --root-folder-id 0 --token <token> --token-url https://example.com/token --upload-cutoff 52428800` |
| `hoody files backends connect cache` |  | write | Connect to cache backend | `files.backends.connectCache` | `hoody files backends connect cache --chunk-clean-interval 60 --chunk-no-memory --chunk-path /home/user/.cache/hoody-vfs/cache-backend --chunk-size 1M --chunk-total-size 500M --db-path /home/user/.cache/hoody-vfs/cache-backend --db-purge --db-wait-time 1 --description "My description" --info-age 1h --plex-insecure <plex_insecure> --plex-password <plex_password> --plex-token <plex_token> --plex-url https://example.com --plex-username <plex_username> --read-retries 10 --remote origin --rps=-1 --tmp-upload-path /home/user/file.txt --tmp-wait-time 15 --workers 4 --writes` |
| `hoody files backends connect chunker` |  | write | Connect to chunker backend | `files.backends.connectChunker` | `hoody files backends connect chunker --chunk-size 2147483648 --description "My description" --fail-hard --hash-type none --meta-format none --name-format *.hoody-vfs_chunk.### --remote origin --start-from 1 --transactions rename` |
| `hoody files backends connect cloudinary` |  | write | Connect to cloudinary backend | `files.backends.connectCloudinary` | `hoody files backends connect cloudinary --api-key <api_key> --api-secret <api_secret> --cloud-name <cloud_name> --description "My description" --encoding 52543246 --eventually-consistent-delay 0 --upload-prefix <upload_prefix> --upload-preset <upload_preset>` |
| `hoody files backends connect combine` |  | write | Connect to combine backend | `files.backends.connectCombine` | `hoody files backends connect combine --description "My description" --upstreams <upstreams>` |
| `hoody files backends connect compress` |  | write | Connect to compress backend | `files.backends.connectCompress` | `hoody files backends connect compress --description "My description" --level=-1 --mode gzip --ram-cache-limit 20971520 --remote origin` |
| `hoody files backends connect crypt` |  | write | Connect to crypt backend | `files.backends.connectCrypt` | `hoody files backends connect crypt --description "My description" --directory-name-encryption --filename-encoding base32 --filename-encryption standard --pass-bad-blocks --password <password> --password2 <password2> --remote origin --server-side-across-configs --show-mapping --strict-names --suffix .bin` |
| `hoody files backends connect drive` |  | write | Connect to drive backend | `files.backends.connectDrive` | `hoody files backends connect drive --acknowledge-abuse --allow-import-name-change --alternate-export --auth-owner-only --auth-url https://example.com/auth --chunk-size 8388608 --client-credentials --client-id abc-123 --client-secret <client_secret> --copy-shortcut-content --description "My description" --disable-http2 --encoding 16777216 --env-auth --export-formats docx,xlsx,pptx,svg --fast-list-bug-fix --formats <formats> --impersonate <impersonate> --import-formats <import_formats> --keep-revision-forever --list-chunk 1000 --metadata-labels off --metadata-owner off --metadata-permissions off --pacer-burst 100 --pacer-min-sleep 0 --resource-key <resource_key> --root-folder-id abc-123 --scope drive --server-side-across-configs --service-account-credentials <service_account_credentials> --service-account-file <service_account_file> --shared-with-me --show-all-gdocs --size-as-quota --skip-checksum-gphotos --skip-dangling-shortcuts --skip-gdocs --skip-shortcuts --starred-only --stop-on-download-limit --stop-on-upload-limit --team-drive <team_drive> --token <token> --token-url https://example.com/token --trashed-only --upload-cutoff 8388608 --use-created-date --use-shared-date --use-trash --v2-download-min-size=-1` |
| `hoody files backends connect dropbox` |  | write | Connect to dropbox backend | `files.backends.connectDropbox` | `hoody files backends connect dropbox --auth-url https://example.com/auth --batch-commit-timeout 600 --batch-mode sync --batch-size 0 --batch-timeout 0 --chunk-size 50331648 --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 52469762 --impersonate <impersonate> --pacer-min-sleep 0 --root-namespace <root_namespace> --shared-files --shared-folders --token <token> --token-url https://example.com/token` |
| `hoody files backends connect fichier` |  | write | Connect to fichier backend | `files.backends.connectFichier` | `hoody files backends connect fichier --api-key <api_key> --cdn --description "My description" --encoding 52666494 --file-password <file_password> --folder-password <folder_password> --shared-folder <shared_folder>` |
| `hoody files backends connect filefabric` |  | write | Connect to filefabric backend | `files.backends.connectFilefabric` | `hoody files backends connect filefabric --description "My description" --encoding 50429954 --permanent-token <permanent_token> --root-folder-id abc-123 --token <token> --token-expiry <token_expiry> --url https://storagemadeeasy.com --version 1.0.0` |
| `hoody files backends connect filescom` |  | write | Connect to filescom backend | `files.backends.connectFilescom` | `hoody files backends connect filescom --api-key <api_key> --description "My description" --encoding 60923906 --password <password> --site <site> --username alice` |
| `hoody files backends connect ftp` |  | write | Connect to ftp backend | `files.backends.connectFtp` | `hoody files backends connect ftp --ask-password --close-timeout 60 --concurrency 0 --description "My description" --disable-epsv --disable-mlsd --disable-tls13 --disable-utf8 --encoding Asterisk,Ctl,Dot,Slash --explicit-tls --force-list-hidden --host example.com --idle-timeout 60 --pass <pass> --port 21 --shut-timeout 60 --socks-proxy <socks_proxy> --tls --tls-cache-size 32 --user user --writing-mdtm` |
| `hoody files backends connect gofile` |  | write | Connect to gofile backend | `files.backends.connectGofile` | `hoody files backends connect gofile --access-token <access_token> --account-id abc-123 --description "My description" --encoding 323331982 --list-chunk 1000 --root-folder-id abc-123` |
| `hoody files backends connect google-cloud-storage` |  | write | Connect to google cloud storage backend | `files.backends.connectGoogleCloudStorage` | `hoody files backends connect google-cloud-storage --access-token <access_token> --anonymous --auth-url https://example.com/auth --bucket-acl authenticatedRead --bucket-policy-only --client-credentials --client-id abc-123 --client-secret <client_secret> --decompress --description "My description" --directory-markers --encoding 50348034 --endpoint https://example.com --env-auth --location asia --object-acl authenticatedRead --project-number <project_number> --service-account-credentials <service_account_credentials> --service-account-file <service_account_file> --storage-class MULTI_REGIONAL --token <token> --token-url https://example.com/token --user-project <user_project>` |
| `hoody files backends connect google-photos` |  | write | Connect to google photos backend | `files.backends.connectGooglePhotos` | `hoody --proxy <proxy> files backends connect google-photos --auth-url https://example.com/auth --batch-commit-timeout 600 --batch-mode sync --batch-size 0 --batch-timeout 0 --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 50348034 --include-archived --read-only --read-size --start-year 2000 --token <token> --token-url https://example.com/token` |
| `hoody files backends connect hasher` |  | write | Connect to hasher backend | `files.backends.connectHasher` | `hoody files backends connect hasher --auto-size 0 --description "My description" --hashes <hashes> --max-age 0 --remote origin` |
| `hoody files backends connect hdfs` |  | write | Connect to hdfs backend | `files.backends.connectHdfs` | `hoody files backends connect hdfs --data-transfer-protection privacy --description "My description" --encoding 50430082 --namenode <namenode> --service-principal-name <service_principal_name> --username root` |
| `hoody files backends connect hidrive` |  | write | Connect to hidrive backend | `files.backends.connectHidrive` | `hoody files backends connect hidrive --auth-url https://example.com/auth --chunk-size 50331648 --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --disable-fetching-member-count --encoding 33554434 --endpoint https://api.hidrive.strato.com/2.1 --root-prefix / --scope-access rw --scope-role user --token <token> --token-url https://example.com/token --upload-concurrency 4 --upload-cutoff 100663296` |
| `hoody files backends connect http` |  | write | Connect to http backend | `files.backends.connectHttp` | `hoody files backends connect http --description "My description" --headers '{}' --url https://example.com` |
| `hoody files backends connect iclouddrive` |  | write | Connect to iclouddrive backend | `files.backends.connectIclouddrive` | `hoody files backends connect iclouddrive --apple-id abc-123 --client-id d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d --cookies <cookies> --description "My description" --encoding 50438146 --password <password> --trust-token <trust_token>` |
| `hoody files backends connect imagekit` |  | write | Connect to imagekit backend | `files.backends.connectImagekit` | `hoody files backends connect imagekit --description "My description" --encoding 117553486 --endpoint https://example.com --only-signed --private-key <private_key> --public-key pk_abc123 --upload-tags <upload_tags> --versions` |
| `hoody files backends connect internetarchive` |  | write | Connect to internetarchive backend | `files.backends.connectInternetarchive` | `hoody files backends connect internetarchive --access-key-id abc-123 --description "My description" --disable-checksum --encoding 50446342 --endpoint https://s3.us.archive.org --front-endpoint https://archive.org --secret-access-key <secret_access_key> --wait-archive 0` |
| `hoody files backends connect jottacloud` |  | write | Connect to jottacloud backend | `files.backends.connectJottacloud` | `hoody files backends connect jottacloud --auth-url https://example.com/auth --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 50431886 --hard-delete --md5-memory-limit 10485760 --token <token> --token-url https://example.com/token --trashed-only --upload-resume-limit 10485760` |
| `hoody files backends connect koofr` |  | write | Connect to koofr backend | `files.backends.connectKoofr` | `hoody files backends connect koofr --description "My description" --encoding 50438146 --endpoint https://example.com --mountid <mountid> --password <password> --provider koofr --setmtime --user alice` |
| `hoody files backends connect linkbox` |  | write | Connect to linkbox backend | `files.backends.connectLinkbox` | `hoody files backends connect linkbox --description "My description" --token <token>` |
| `hoody files backends connect local` |  | write | Connect to local backend | `files.backends.connectLocal` | `hoody files backends connect local --case-insensitive --case-sensitive --copy-links --description "My description" --encoding 33554434 --links --nounc --one-file-system --skip-links --time-type mtime --unicode-normalization --zero-size-links` |
| `hoody files backends connect mailru` |  | write | Connect to mailru backend | `files.backends.connectMailru` | `hoody files backends connect mailru --auth-url https://example.com/auth --check-hash --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 50440078 --pass <pass> --quirks <quirks> --speedup-enable --speedup-file-patterns * --speedup-max-disk 0 --speedup-max-memory 0 --token <token> --token-url https://example.com/token --user alice --user-agent "Mozilla/5.0"` |
| `hoody files backends connect mega` |  | write | Connect to mega backend | `files.backends.connectMega` | `hoody files backends connect mega --debug --description "My description" --encoding 50331650 --hard-delete --pass <pass> --use-https --user alice` |
| `hoody files backends connect memory` |  | write | Connect to memory backend | `files.backends.connectMemory` | `hoody files backends connect memory --description "My description"` |
| `hoody files backends connect netstorage` |  | write | Connect to netstorage backend | `files.backends.connectNetstorage` | `hoody files backends connect netstorage --account acc-abc --description "My description" --host example.com --protocol http --secret <secret>` |
| `hoody files backends connect onedrive` |  | write | Connect to onedrive backend | `files.backends.connectOnedrive` | `hoody files backends connect onedrive --access-scopes "Files.Read Files.ReadWrite Files.Read.All Files.ReadWrite.All Sites.Read.All offline_access" --auth-url https://example.com/auth --av-override --chunk-size 10485760 --client-credentials --client-id abc-123 --client-secret <client_secret> --delta --description "My description" --disable-site-permission --drive-id abc-123 --drive-type <drive_type> --encoding 57386894 --expose-onenote-files --hard-delete --hash-type auto --link-password <link_password> --link-scope anonymous --link-type view --list-chunk 1000 --metadata-permissions off --region global --root-folder-id abc-123 --server-side-across-configs --tenant tenant-abc --token <token> --token-url https://example.com/token` |
| `hoody files backends connect opendrive` |  | write | Connect to opendrive backend | `files.backends.connectOpendrive` | `hoody files backends connect opendrive --chunk-size 10485760 --description "My description" --encoding 62007182 --password <password> --username alice` |
| `hoody files backends connect oracleobjectstorage` |  | write | Connect to oracleobjectstorage backend | `files.backends.connectOracleobjectstorage` | `hoody files backends connect oracleobjectstorage --attempt-resume-upload --chunk-size 5242880 --compartment <compartment> --config-file ~/.oci/config --config-profile Default --copy-cutoff 4999610368 --copy-timeout 60 --description "My description" --disable-checksum --encoding 50331650 --endpoint https://example.com --leave-parts-on-error --max-upload-parts 10000 --namespace <namespace> --provider env_auth --region eu-west-1 --sse-customer-algorithm AES256 --sse-customer-key <sse_customer_key> --sse-customer-key-file <sse_customer_key_file> --sse-customer-key-sha256 <sse_customer_key_sha256> --sse-kms-key-id abc-123 --storage-tier Standard --upload-concurrency 10 --upload-cutoff 209715200` |
| `hoody files backends connect pcloud` |  | write | Connect to pcloud backend | `files.backends.connectPcloud` | `hoody files backends connect pcloud --auth-url https://example.com/auth --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 50438146 --hostname api.pcloud.com --password <password> --root-folder-id d0 --token <token> --token-url https://example.com/token --username alice` |
| `hoody files backends connect pikpak` |  | write | Connect to pikpak backend | `files.backends.connectPikpak` | `hoody files backends connect pikpak --chunk-size 5242880 --description "My description" --device-id abc-123 --encoding 56829838 --hash-memory-limit 10485760 --pass <pass> --root-folder-id abc-123 --trashed-only --upload-concurrency 5 --use-trash --user alice --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0"` |
| `hoody files backends connect pixeldrain` |  | write | Connect to pixeldrain backend | `files.backends.connectPixeldrain` | `hoody files backends connect pixeldrain --api-key <api_key> --api-url https://pixeldrain.com/api --description "My description" --root-folder-id me` |
| `hoody files backends connect premiumizeme` |  | write | Connect to premiumizeme backend | `files.backends.connectPremiumizeme` | `hoody files backends connect premiumizeme --api-key <api_key> --auth-url https://example.com/auth --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 50438154 --token <token> --token-url https://example.com/token` |
| `hoody files backends connect protondrive` |  | write | Connect to protondrive backend | `files.backends.connectProtondrive` | `hoody files backends connect protondrive --2fa <2fa> --app-version macos-drive@1.0.0-alpha.1+hoody-vfs --client-access-token <client_access_token> --client-refresh-token <client_refresh_token> --client-salted-key-pass <client_salted_key_pass> --client-uid <client_uid> --description "My description" --enable-caching --encoding 52559874 --mailbox-password <mailbox_password> --original-file-size --password <password> --replace-existing-draft --username alice` |
| `hoody files backends connect putio` |  | write | Connect to putio backend | `files.backends.connectPutio` | `hoody files backends connect putio --auth-url https://example.com/auth --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 50438146 --token <token> --token-url https://example.com/token` |
| `hoody files backends connect qingstor` |  | write | Connect to qingstor backend | `files.backends.connectQingstor` | `hoody files backends connect qingstor --access-key-id abc-123 --chunk-size 4194304 --connection-retries 3 --description "My description" --encoding 16842754 --endpoint https://example.com --env-auth --secret-access-key <secret_access_key> --upload-concurrency 1 --upload-cutoff 209715200 --zone pek3a` |
| `hoody files backends connect quatrix` |  | write | Connect to quatrix backend | `files.backends.connectQuatrix` | `hoody files backends connect quatrix --api-key <api_key> --description "My description" --effective-upload-time 4s --encoding 50438146 --hard-delete --host example.com --maximal-summary-chunk-size 100000000 --minimal-chunk-size 10000000 --skip-project-folders` |
| `hoody files backends connect s3` |  | write | Connect to s3 backend | `files.backends.connectS3` | `hoody --profile default files backends connect s3 --access-key-id abc-123 --acl default --bucket-acl private --chunk-size 5242880 --copy-cutoff 4999610368 --decompress --description "My description" --directory-bucket --directory-markers --disable-checksum --disable-http2 --download-url https://example.com --encoding 50331650 --endpoint objects-us-east-1.dream.io --env-auth --force-path-style --leave-parts-on-error --list-chunk 1000 --list-url-encode <list_url_encode> --list-version 0 --location-constraint <location_constraint> --max-upload-parts 10000 --memory-pool-flush-time 60 --memory-pool-use-mmap --might-gzip <might_gzip> --provider AWS --region other-v2-signature --requester-pays --sdk-log-mode 0 --secret-access-key <secret_access_key> --server-side-encryption AES256 --session-token <session_token> --shared-credentials-file <shared_credentials_file> --sse-customer-algorithm AES256 --sse-customer-key <sse_customer_key> --sse-customer-key-base64 <sse_customer_key_base64> --sse-customer-key-md5 <sse_customer_key_md5> --sse-kms-key-id arn:aws:kms:us-east-1:* --storage-class STANDARD --sts-endpoint <sts_endpoint> --upload-concurrency 4 --upload-cutoff 209715200 --use-accelerate-endpoint --use-accept-encoding-gzip <use_accept_encoding_gzip> --use-already-exists <use_already_exists> --use-dual-stack --use-multipart-etag <use_multipart_etag> --use-multipart-uploads <use_multipart_uploads> --use-presigned-request --use-unsigned-payload <use_unsigned_payload> --v2-auth --version-at 0001-01-01T00:00:00Z --version-deleted --versions` |
| `hoody files backends connect seafile` |  | write | Connect to seafile backend | `files.backends.connectSeafile` | `hoody files backends connect seafile --2fa --auth-token <auth_token> --create-library --description "My description" --encoding 16850954 --library <library> --library-key <library_key> --pass <pass> --url https://cloud.seafile.com/ --user alice` |
| `hoody files backends connect sftp` |  | write | Connect to sftp backend | `files.backends.connectSftp` | `hoody files backends connect sftp --ask-password --chunk-size 32768 --ciphers <ciphers> --concurrency 64 --connections 0 --copy-is-hardlink --description "My description" --disable-concurrent-reads --disable-concurrent-writes --disable-hashcheck --host example.com --host-key-algorithms <host_key_algorithms> --idle-timeout 60 --key-exchange <key_exchange> --key-file <key_file> --key-file-pass <key_file_pass> --key-pem <key_pem> --key-use-agent --known-hosts-file ~/.ssh/known_hosts --macs <macs> --md5sum-command <md5sum_command> --pass <pass> --path-override <path_override> --port 22 --pubkey <pubkey> --pubkey-file <pubkey_file> --server-command <server_command> --set-env <set_env> --set-modtime --sha1sum-command <sha1sum_command> --shell-type none --skip-links --socks-proxy <socks_proxy> --ssh <ssh> --subsystem sftp --use-fstat --use-insecure-cipher --user user` |
| `hoody files backends connect sharefile` |  | write | Connect to sharefile backend | `files.backends.connectSharefile` | `hoody files backends connect sharefile --auth-url https://example.com/auth --chunk-size 67108864 --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 57091982 --endpoint https://example.com --root-folder-id favorites --token <token> --token-url https://example.com/token --upload-cutoff 134217728` |
| `hoody files backends connect sia` |  | write | Connect to sia backend | `files.backends.connectSia` | `hoody files backends connect sia --api-password <api_password> --api-url http://127.0.0.1:9980 --description "My description" --encoding 50436354 --user-agent Sia-Agent` |
| `hoody files backends connect smb` |  | write | Connect to smb backend | `files.backends.connectSmb` | `hoody files backends connect smb --case-insensitive --description "My description" --domain WORKGROUP --encoding 56698766 --hide-special-share --host example.com --idle-timeout 60 --pass <pass> --port 445 --spn <spn> --user user` |
| `hoody files backends connect storj` |  | write | Connect to storj backend | `files.backends.connectStorj` | `hoody files backends connect storj --access-grant <access_grant> --api-key <api_key> --description "My description" --passphrase <passphrase> --provider existing --satellite-address us1.storj.io` |
| `hoody files backends connect sugarsync` |  | write | Connect to sugarsync backend | `files.backends.connectSugarsync` | `hoody files backends connect sugarsync --access-key-id abc-123 --app-id abc-123 --authorization <authorization> --authorization-expiry <authorization_expiry> --deleted-id abc-123 --description "My description" --encoding 50397186 --hard-delete --private-access-key <private_access_key> --refresh-token <refresh_token> --root-id abc-123 --user alice` |
| `hoody files backends connect swift` |  | write | Connect to swift backend | `files.backends.connectSwift` | `hoody files backends connect swift --application-credential-id abc-123 --application-credential-name <application_credential_name> --application-credential-secret <application_credential_secret> --auth https://auth.api.rackspacecloud.com/v1.0 --auth-token <auth_token> --auth-version 0 --chunk-size 5368709120 --description "My description" --domain example.com --encoding 16777218 --endpoint-type public --env-auth --fetch-until-empty-page --key <key> --leave-parts-on-error --partial-page-fetch-threshold 0 --region eu-west-1 --storage-policy pcs --storage-url https://example.com --tenant tenant-abc --tenant-domain <tenant_domain> --tenant-id abc-123 --use-segments-container <use_segments_container> --user alice --user-id abc-123` |
| `hoody files backends connect tardigrade` |  | write | Connect to tardigrade backend | `files.backends.connectTardigrade` | `hoody files backends connect tardigrade --access-grant <access_grant> --api-key <api_key> --description "My description" --passphrase <passphrase> --provider existing --satellite-address us1.storj.io` |
| `hoody files backends connect ulozto` |  | write | Connect to ulozto backend | `files.backends.connectUlozto` | `hoody files backends connect ulozto --app-token <app_token> --description "My description" --encoding 50438146 --list-page-size 500 --password <password> --root-folder-slug <root_folder_slug> --username alice` |
| `hoody files backends connect union` |  | write | Connect to union backend | `files.backends.connectUnion` | `hoody files backends connect union --action-policy epall --cache-time 120 --create-policy epmfs --description "My description" --min-free-space 1073741824 --search-policy ff --upstreams <upstreams>` |
| `hoody files backends connect uptobox` |  | write | Connect to uptobox backend | `files.backends.connectUptobox` | `hoody files backends connect uptobox --access-token <access_token> --description "My description" --encoding 50561070 --private` |
| `hoody files backends connect webdav` |  | write | Connect to webdav backend | `files.backends.connectWebdav` | `hoody files backends connect webdav --auth-redirect --bearer-token <bearer_token> --bearer-token-command <bearer_token_command> --description "My description" --encoding utf-8 --headers '{}' --nextcloud-chunk-size 10485760 --owncloud-exclude-mounts --owncloud-exclude-shares --pacer-min-sleep 0 --pass <pass> --unix-socket <unix_socket> --url https://example.com --user alice --vendor fastmail` |
| `hoody files backends connect yandex` |  | write | Connect to yandex backend | `files.backends.connectYandex` | `hoody files backends connect yandex --auth-url https://example.com/auth --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 50429954 --hard-delete --spoof-ua --token <token> --token-url https://example.com/token` |
| `hoody files backends connect zoho` |  | write | Connect to zoho backend | `files.backends.connectZoho` | `hoody files backends connect zoho --auth-url https://example.com/auth --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 16875520 --region com --token <token> --token-url https://example.com/token --upload-cutoff 10485760` |
| `hoody files backends disconnect` |  | destructive | Disconnect backend | `files.backends.disconnect` | `hoody files backends disconnect abc-123` |
| `hoody files backends get` |  | read | Get backend details | `files.backends.getDetails` | `hoody files backends get abc-123` |
| `hoody files backends list` |  | read | List all backends | `files.backends.list` | `hoody files backends list` |
| `hoody files backends test` |  | read | Test backend connection | `files.backends.testConnection` | `hoody files backends test abc-123` |
| `hoody files backends update` |  | write | Update backend credentials | `files.backends.update` | `hoody files backends update abc-123 --body '{}'` |
| `hoody files chmod` |  | write | Change file permissions | `files.chmod` | `hoody files chmod /home/user/file.txt --chmod <chmod>` |
| `hoody files chown` |  | write | Change file ownership | `files.chown` | `hoody files chown /home/user/file.txt --chown <chown>` |
| `hoody files copy` |  | write | Copy file or directory | `files.copy` | `hoody files copy /home/user/file.txt --copy-to <copy_to> --overwrite true --owner <owner>` |
| `hoody files delete` | rm, remove | destructive | Delete file or directory | `files.delete` | `hoody files delete /home/user/file.txt --backend <backend>` |
| `hoody files delete-recursive` |  | destructive | Delete file or directory | `files.deleteRecursive` | `hoody files delete-recursive /home/user/file.txt` |
| `hoody files dir` |  | read | List directory contents or download file | `files.listDirectory` | `hoody files dir /home/user/file.txt --json --simple --sort name --order asc --hash --sha256 --base64 --edit --view --download 1 --content-type <content_type> --history --at <at> --revision 10 --diff --from-seq 10 --from-ts <from_ts> --to-seq 10 --to-ts <to_ts> --after-id 10 --limit 100` |
| `hoody files downloads active` |  | read | List active downloads | `files.downloads.listActive` | `hoody files downloads active /home/user/src --downloads` |
| `hoody files downloads all` |  | read | List active downloads | `files.downloads.listGlobal` | `hoody files downloads all` |
| `hoody files downloads history` |  | read | Download history | `files.downloads.getHistory` | `hoody files downloads history --download-history` |
| `hoody files downloads url` |  | read | Download file from remote URL | `files.downloads.fetch` | `hoody files downloads url /home/user/src --download <download> --filename <filename> --timeout 300` |
| `hoody files downloads zip` |  | read | Download directory as ZIP | `files.archives.downloadAsZip` | `hoody files downloads zip /home/user/src --zip` |
| `hoody files extractions active` |  | read | List active extractions | `files.archives.listActive` | `hoody files extractions active --extractions` |
| `hoody files extractions all` |  | read | List active extractions | `files.archives.listGlobal` | `hoody files extractions all` |
| `hoody files extractions create` |  | read | Extract archive | `files.archives.extract` | `hoody files extractions create /home/user/archive.zip --extract <extract> --dest <dest>` |
| `hoody files extractions extract-file` |  | read | Extract file from archive | `files.archives.extractFile` | `hoody files extractions extract-file /home/user/archive.zip --extract <extract> --dest <dest>` |
| `hoody files extractions history` |  | read | Extraction history | `files.archives.getHistory` | `hoody files extractions history --extraction-history` |
| `hoody files fetch-from-git` |  | read | Fetch file from Git repository | `files.git.fetch` | `hoody files fetch-from-git /home/user/file.txt --type git --url https://example.com --ref <ref> --pass <pass>` |
| `hoody files get` |  | read | List directory or download file | `files.get` | `hoody files get /home/user/file.txt --backend <backend> --hash --sha256 --base64 --preview --contents --stat --thumbnail <thumbnail> --grep ".*" --ignore-case --fixed-string --glob "*.ts" --context 0 --max-count 50 --max-matches 500 --max-depth 50 --max-filesize 10485760 --timeout 30 --max-results 1000 --max-files-scanned 100000 --sort mtime --order asc --lines 100 --history --at <at> --revision 10 --diff --from-seq 10 --from-ts <from_ts> --to-seq 10 --to-ts <to_ts> --after-id 10 --limit 100 --zip` |
| `hoody files glob` |  | read | Find files by glob pattern | `files.glob` | `hoody files glob /home/user/file.txt --pattern "*.ts" --max-results 1000 --max-depth 50 --max-files-scanned 100000 --timeout 30 --sort mtime --order asc` |
| `hoody files grep` |  | read | Search file contents (grep) | `files.grep` | `hoody files grep /home/user/file.txt --pattern "TODO" --ignore-case --fixed-string --glob "*.ts" --context 0 --max-count 50 --max-matches 500 --max-depth 50 --max-filesize 10485760 --timeout 30` |
| `hoody files health` |  | read | Service health check | `files.health.check` | `hoody files health` |
| `hoody files journal flush` |  | write | Flush journal to disk | `files.journal.flush` | `hoody files journal flush` |
| `hoody files journal query` |  | read | Query journal entries | `files.journal.query` | `hoody files journal query --path /home/user/file.txt --op <op> --since 2026-01-01T00:00:00Z --limit 100 --after-id 0` |
| `hoody files journal stats` |  | read | Get journal statistics | `files.journal.getStats` | `hoody files journal stats` |
| `hoody files metadata` |  | read | Get file metadata | `files.getMetadata` | `hoody files metadata /home/user/file.txt --history --at <at> --revision 10 --diff --from-seq 10 --from-ts <from_ts> --to-seq 10 --to-ts <to_ts> --after-id 10 --limit 100` |
| `hoody files mounts create` | new, add | write | Create persistent FUSE mount | `files.mounts.create` | `hoody files mounts create --backend-id abc-123 --label my-label --mount-path /home/user/file.txt --vfs-config-cache-max-age <vfs_config.cache_max_age> --vfs-config-cache-max-size 100 --vfs-config-cache-mode <vfs_config.cache_mode> --vfs-config-dir-cache-time <vfs_config.dir_cache_time>` |
| `hoody files mounts get` |  | read | Get mount details | `files.mounts.getDetails` | `hoody files mounts get abc-123` |
| `hoody files mounts list` |  | read | List all mounts | `files.mounts.list` | `hoody files mounts list --label my-label` |
| `hoody files mounts unmount` |  | destructive | Unmount filesystem | `files.mounts.unmount` | `hoody files mounts unmount abc-123` |
| `hoody files mounts update` |  | write | Update mount VFS configuration | `files.mounts.update` | `hoody files mounts update abc-123` |
| `hoody files move` |  | write | Move file or directory | `files.move` | `hoody files move /home/user/file.txt --move-to <move_to> --owner <owner>` |
| `hoody files open` |  | action | Open the Files kit service (file explorer) in your browser |  | `hoody files open [index] [--url]` |
| `hoody files options` |  | read | Get allowed methods | `files.webdav.getOptions` | `hoody files options /home/user/file.txt` |
| `hoody files patch` |  | write | File operations | `files.patch` | `hoody files patch /home/user/file.txt --x-update-range append --body '{}'` |
| `hoody files process-image` |  | read | Process and convert images | `files.images.process` | `hoody files process-image img-abc --thumbnail --format jpeg --size <size> --width 10 --height 10 --resize fit --quality low --q 85 --blur 10 --grayscale --bg <bg>` |
| `hoody files put` |  | write | Upload or append file | `files.put` | `hoody files put /home/user/file.txt --backend <backend> --append --owner <owner> --input <input>` |
| `hoody files realpath` |  | read | Resolve canonical path (realpath) | `files.realpath` | `hoody files realpath /home/user/file.txt` |
| `hoody files search` |  | read | Search directory | `files.search` | `hoody files search /home/user/src --q <q> --json` |
| `hoody files stat` |  | read | Get file metadata (stat) | `files.stat` | `hoody files stat /home/user/file.txt` |
| `hoody files touch` |  | write | Touch file (create or update mtime) | `files.touch` | `hoody files touch /home/user/file.txt --touch` |
| `hoody files upload` |  | write | Upload file | `files.upload` | `hoody files upload /home/user/file.txt --input <input>` |
| `hoody files version` |  | read | Get API version | `files.system.getApiVersion` | `hoody files version` |

