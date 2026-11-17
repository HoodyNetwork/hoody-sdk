> _**CLI skill · `files` namespace** · ~16,856 tokens · hoody-sdk v1.0.1_

# `files` — computer filesystem over HTTP, with automatic Git-like change history

## Purpose

**Default surface: the computer's own filesystem, exposed over HTTP — with automatic mutation journaling when the deployment enabled it.** Read, write, copy, move, delete, stat, chmod, list, glob, grep, archive-preview/extract, fetch URLs into the FS, resumable upload — all on absolute computer paths (`/home/user/main.py`, `/etc/hostname`, `/hoody/databases/foo.db`). No backend flag needed.

**Headline feature when journaling is on — automatic change history for writes made through `files`.** With the journal enabled, every `PUT` / `PATCH` / `DELETE` / `MOVE` / `COPY` sent to this kit is appended to a per-computer mutation log, on a best-effort basis (an entry is skipped when the journal's storage budget is exceeded or its writer is unhealthy; the write itself still succeeds and the log can then show a `gap` entry; check `hoody files journal stats`): monotonic sequence number, timestamp, path, op, size, hash. **Only writes made through `files` are recorded:** the agent's file tools, a terminal, `exec` scripts and other programs write to the disk directly, and the journal never sees those changes. **History is kept for journaled paths, within limits:** retention prunes old entries (90 days or 2 GiB of journal storage by default), bodies over 2 MiB, and binary files, keep only their hash and size, and excluded paths (dev dirs such as `node_modules`, and `.git`) are never recorded. The journal lets you:

- **Time-travel a single file** — `hoody files get` with `--revision <seq>` or `--at <unix-ms>` returns the bytes the journal recorded for that point.
- **List a file's history** — `hoody files get` with `--history` returns one page of the path's revisions (renames followed), oldest first by global journal entry id: 100 entries by default, `--limit` up to 1000. While the response has `has_more: true`, request again with `--after-id` set to its `next_after_id`.
- **Diff between revisions** — `hoody files get` with `--diff --from-seq <N>` returns a unified diff between revision `N` and the file as it is on disk now; add `--to-seq` or `--to-ts` to compare two recorded revisions instead.
- **Tell when the journal is behind the disk** — a journal view of a file says, when the file on disk could be checked, whether the journal's newest record of it still matches it (no flag means the state is unknown): `head_matches_disk` in the `--history` JSON, the `X-Journal-Head-Matches-Disk` header on `--at`, `--revision` and `--diff` reads. `false` means the file does not match a known retained journal head: an outside write, a change the journal does not record, pruned history or no content history can each cause it, and the flag alone does not say which.
- **Replay / audit** — `hoody files journal list` with `--path <p> --after-id <id>` streams every operation after global journal entry `id` (while the response has `has_more: true`, resume from its `next_after_id`; on the last page `next_after_id` is `null`, so keep the last entry's `id` as your cursor; an entry's `seq` is its per-path revision number, not a cursor). Run `hoody files journal flush` to force-persist before querying for the absolute latest.
- **Cross-replicate** — pipe the journal into another computer as an event source for mirroring / fan-out / append-only sync.

When the deployment turned journaling on, no per-write setup is needed — every covered write is normally recorded. Exposing the journal query endpoints — history, revision, diff, stats, flush — over the API is a second deployment-side switch; where it is off those endpoints return `403`. Where API access is on but recording itself is off, they return `404 Journal is not enabled`. It is not a complete undo: retention pruning, the 2 MiB body cap, binary files (their contents are not kept), the exclude lists and write paths with no journal hook (URL downloads, archive extraction) all leave gaps, so check the file's history before relying on a restore. Journaling is ON in the standard `hoody_kit: true` computer image; a raw kit deployment that did not turn it on skips recording (writes there follow their own switches, see Prerequisites).

**Optional add-ons (per-request, opt-in):**
- **Remote backends** — pass `--backend-id <id>` to operate against a backend you've connected, of any of the 49 allowed rclone backend types (Mega, SFTP, S3, GDrive, Dropbox, Backblaze B2, WebDAV, …), instead of the local FS. A `?type=` parameter does not select a connected backend: on `/api/v1/files/{path}` it is ignored and the request runs on the local FS. Only where the deployment enabled remote backends; otherwise `403`. Note: the journal records local-FS mutations; remote-backend ops go to the remote and aren't replayable from the journal.
- **FUSE mounts** — `hoody files mounts create` to surface a remote backend AS a path in the local FS. Same deployment-side requirement.
- **chmod / chown** — Unix-only, and only where the deployment enabled them; otherwise `403`.

## When to use

- **Local computer FS (the 90% case)** — CRUD, archive entry / extract, search (glob, grep; grep stops at a file's first NUL byte and skips the whole read block (about 64 KiB) that contains it, so matches before the NUL are kept only if they sit in an earlier block; in a small file with a NUL, grep finds nothing), download a URL into a path, resumable upload. Local works out of the box.
- **Recover / inspect a previous version of a text file** — `hoody files get <path>` with `--history`, `--revision <seq>`, `--at <unix-ms>` or `--diff --from-seq <N>`. Available where journaling and journal API access are on (`403` when API access is off, `404` when recording is off), for writes the journal recorded and still retains (see Quirks for what is excluded).
- **Audit / replay the changes `files` recorded** — `hoody files journal list` for the full event stream (sequence, timestamp, path, op, size, hash). Changes made by the agent's tools, a terminal or a program are not in it; use `watch` to see those.
- **Remote cloud / SSH / S3** — pass `--backend-id <id>` to read (`hoody files get`), stat (`hoody files stat`), upload (`hoody files upload`, not with `append`), delete (`hoody files delete`) or create a directory (`hoody files mkdir`). Only `get`, `stat`, `upload`, `delete` and `mkdir` take `--backend-id`; `update`, `append`, `copy`, `move`, `archives extract` and `downloads create` have no such flag and refuse it as an unknown option, and `upload --append` with `--backend-id` is refused with `400`.
- **FUSE-mount a remote into the local FS** — when downstream code needs to read the remote as a regular path (under the mount directory, `/hoody/mounts/permanent/…` by default).
- **Share a folder as one download** — the bare `?zip` flag on a local folder's `/api/v1/files` path streams it as a zip from the files kit URL (Example 11); needs archive downloads enabled (`403 Archive download not allowed` otherwise).

## When NOT to use

Run binaries -> `terminal`/`exec`, live events -> `watch`, TS/JS gen -> `exec`, indexed queries -> `sqlite`, traffic logs -> `proxyLogs`.

## Prerequisites

- **For plain read/stat/list**: no deployment switch, but any authentication and per-path access rules configured on the kit still apply (`401` without credentials, `403` for a path outside your rules). **Writes are enabled by the deployment, not per request**: upload/write/append and copy need write enabled, delete needs delete enabled, move needs both; on the WebDAV-style `/{path}` route, replacing existing bytes (a `PUT` over a non-empty file, or a `PATCH` with an explicit `bytes=` range) needs delete enabled as well, while an append at the end does not (403 otherwise; all enabled in the standard hoody_kit computer image, off on a raw kit deployment that did not turn them on). Paths are absolute computer paths, so use `/home/user/...`, `/etc/...`, etc.
- **For glob / grep**: gated separately — glob needs search enabled, grep needs grep enabled (403 "not allowed" otherwise; both enabled in the standard hoody_kit computer image).
- **For remote backends** (`--backend-id` on the `hoody files` commands, `--type` on `hoody files touch`, FUSE mounts): the deployment must have enabled remote backends; otherwise `403`.
- **For chmod / chown**: the deployment must have enabled them, and the computer is Unix.
- **Which computer, which path.** Every `hoody files` command acts on the computer named by the global `-c <computerId>`, else `HOODY_COMPUTER` / `HOODY_COMPUTER_ID`, else the `computer` saved in `~/.hoody/config.json`, in that order: its id from `hoody computers list -o json`, or its name (a value not shaped like an id is looked up among your computers; an unknown or ambiguous name is refused). With no computer resolved the CLI refuses before sending anything. The positional `<path>` is an absolute path inside that computer, not a file id.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Read, search, write

1. `hoody files stat <path>` for the metadata, or `hoody files get <path> --lines 10-50`.
2. `hoody files glob <dir> --pattern '**/*.ts'`; `hoody files grep <dir> --pattern TODO --context 2` (local only).
3. `hoody files upload <path> --append`; `hoody files delete <path>`.

### 2. Download, extract, FUSE-mount

1. `hoody files downloads create <dir> --download <url>` returns when the download has finished; `hoody files downloads list <dir>` from another shell shows its progress meanwhile.
2. `hoody files archives preview <archive>`; `hoody files archives extract <archive> --member src/ --dest work-src` (`--member` is an exact entry name, or a directory prefix ending in `/`; no globs. `--dest` MUST be relative).
3. `hoody files backends s3 create` (49 backend types) -> `hoody files get <path> --backend-id <id>` for one-shot reads OR `hoody files mounts create` -> `hoody files get /hoody/mounts/permanent/...` for a regular FS view -> `hoody files mounts delete`, then `hoody files backends delete`. (A mounted path needs no `--backend-id`; `hoody files get`/`upload`/`delete` take it for a backend read.)

### 3. Journal time-travel + TUS-like upload

1. `hoody files get <path> --history`, `--revision N` or `--at <unix-ms>`, `--diff --from-seq N`.
2. `hoody files journal list --path <p> --after-id <id>` (global entry id, not `seq`; see Purpose for the last-page cursor rule); `hoody files journal flush` first.
3. Resumable: `hoody files upload` for the first chunk, then `hoody files append <path> --input <chunk>` per chunk (Example 3).

## Quirks & gotchas

- Reserved sub-prefixes (stat, chmod, chown, realpath, glob, grep, copy, move, append) dispatch by URL prefix, each scoped to a specific HTTP method (stat/grep/glob/realpath→GET, chmod/chown→PATCH, copy/move→POST, append→PUT) to prevent method bleeding -- so `DELETE /api/v1/files/stat/foo` does NOT trigger the stat dispatcher; it removes the literal path `/stat/foo`. `/api/v1/files/health` is a route of its own and never reaches the dispatcher.
- `hoody files glob`/`hoody files grep`/`hoody files realpath`/`hoody files get --lines` local-only; `hoody files get --lines` with `--backend-id` -> 400. `glob`, `grep` and `realpath` have no `--backend-id` flag and reject it as an unknown option before any request is sent.
- `--backend-id` and `hoody files touch --type` need remote backends enabled deployment-side.
- `--backend-id` on `/api/v1/files/{path}` is served only for GET, DELETE, PUT without `append`, and POST that creates a directory; on any other method or operation it returns `400` ("only supported for reading, uploading and deleting files and for creating directories"). `hoody files mkdir --backend-id <id>` creates the directory on the remote backend; `update`, `append`, `archives extract`, `downloads create`, `copy` and `move` have no `--backend-id` flag and reject it as an unknown option before any request is sent.
- `hoody files chmod`/`hoody files chown` Unix-only, and only where the deployment enabled them.
- WebDAV verbs on `/{path}`: PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK, CHECKAUTH, LOGOUT.
- `hoody files realpath` resolves symlinks whether or not symlink following is enabled, but still returns `403` when the resolved target is outside the serve root or outside your access rules.
- **Resumable upload PATCH must use the WebDAV root route (`PATCH /{path}`), NOT `PATCH /api/v1/files/{path}`** — the api/v1 PATCH reads a small JSON body as a metadata operation (at most 64 KiB, else `413 Request body too large`; malformed JSON is `400 Invalid JSON body`), so a raw chunk is refused unless it happens to be valid JSON, which can be taken as a move or rename. The WebDAV form takes `X-Update-Range: append` — or an HTTP-Range offset `bytes=<start>-<end>` (a Content-Range-style `/<size>` suffix is REJECTED with `400 Invalid X-Update-Range Header`) — plus the raw body, and returns `204 No Content` on success. Send the chunk with a non-JSON `Content-Type`, such as `application/octet-stream`: on the WebDAV route too, a content type starting with `application/json` selects a metadata request instead (chmod, chown or rename), and `X-Update-Range` is ignored. The path must already exist (`404` otherwise). An explicit range's start must fall INSIDE the current file, but only that start is used: the whole body is written from it, the range end does not bound the write, and a body longer than the rest of the file extends it. A start at or past EOF is refused, so use `append` to continue at the end.
- **Archive `?dest=` MUST be relative** (e.g. `?dest=extracted`), not absolute — sending `?dest=/abs/path` returns `400 Absolute destination path not allowed`. The directory is created relative to the archive's containing dir.
- **`?preview` query value matters** — pass `?preview` empty (no `=…`) for a full archive listing; `?preview=true` is parsed as the entry name `true` and returns `404 Entry not found in archive: true`. Same trap on `?contents`.
- **Bare `?extract_file=` is unhandled by the kit's GET dispatcher** — the request falls through to "send the raw archive file" and you get the **whole archive's bytes**, not the selected entry. The generated SDK and CLI work around this by ALSO sending `?extract=` — when both query params are present, the `hoody files archives extract` branch runs (writes to disk under `?dest=`). The OpenAPI-only `?extract_file=` form is effectively dead.
- **The journal retains body bytes only for text files up to 2 MiB by default; a binary file, or a larger one, still produces a journal entry with its hash and size, but its contents are not kept**.
- **Exclusions decide which paths are journalled.** Built-in dev-dir excludes (`node_modules`, `target`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `__pycache__`, `.venv`, `venv`, `env`, `__pypackages__`, `.tox`, `.nox`, `bower_components`, …) skip journaling unless the deployment turned the dev-dir exclusions off. `.git` is always excluded regardless of that setting (separate hardcoded check, not part of the toggleable list). The deployment can add further excludes of its own. This is why "I wrote to `node_modules/x` and saw no journal entry" is expected.
- **Journal does NOT cover everything by default.** Live behaviour observed: a fresh `PUT` (create) and an overwriting `PUT` (write) on `/home/user/...` produce entries; URL downloads (`hoody files downloads create`) and archive extraction are NOT journaled — those write through paths with no journal hook. `hoody files chmod`, `hoody files chown`, `hoody files touch`, `hoody files upload --append` and copy/move ARE recorded. Always call `hoody files journal flush` then `hoody files journal list` (or `hoody files get <path> --history`) to inspect what was actually recorded — don't assume coverage.
- **Built-in dev-dir exclude list always skips journaling** for `node_modules`, `__pycache__`, `.venv`, `target`, `.next`, `.nuxt`, etc. — even on `/home/user/...` paths. Only the deployment can turn these off, at kit start. `.git` is hardcoded to ALWAYS be excluded and stays excluded even then.
- **`HEAD` returns no body** on both routes. `HEAD /api/v1/files/{path}` ignores `Range`, so its status and headers need not match a ranged `GET`. It carries no metadata body; for a JSON metadata envelope use `hoody files stat`.
- **`hoody files chown` to root is rejected** with `400 Cannot change ownership to root (UID 0)` (owner) or `400 Cannot change group to root (GID 0)` (group) — even where the deployment enabled chown. Use a non-root user (`nobody`, `user`, …).
- **FUSE mount paths live under a configured mount directory** (`/hoody/mounts/permanent` by default, fixed by the deployment at kit start). An absolute `mount_path` must be under it (`400 Mount path must be under the configured mount directory` otherwise); a relative `mount_path` is resolved under it; an omitted one becomes `<mount dir>/<mount id>` (ids look like `mount_<32 hex>`). If the path already exists and is not a symlink, the create fails with `409 Mount path already exists and is not a symlink`.
- **Listing-style query params (`?downloads`, `?download_history`, `?extractions`, `?extraction_history`) are honoured on the WebDAV root route, NOT on `/api/v1/files/...`** — calling `GET /api/v1/files/<dir>?downloads` returns a regular directory listing (the query is ignored). Use `GET /<dir>?downloads` (or `GET /?download_history` for the global feed).
- **Mount the whole FS as a local drive on the USER's machine (client-side WebDAV).** Because the kit serves a WebDAV API at its URL root, the OS's built-in WebDAV client can mount the computer's files as a drive/folder: on **Windows** *Map network drive* to `https://{P}-{C}-files-1.{N}.computers.hoody.com/`, on **macOS** Finder → *Connect to Server* to the same URL. For a cross-platform, scriptable mount use `hoody mount <computerId> <localDir>` (`--read-only`/`--background`/`--auth-token`/`--auth-password`/`--auth-ip` flags); it runs rclone over WebDAV, so rclone must be installed on the local machine. A changed file is uploaded whole once it has been closed and idle for about 1 s. When the file on the kit is a version this mount never received (another machine or the computer changed it meanwhile), the files kit keeps that version as a conflict copy beside it (`<name> (conflict <host> <time>).<ext>`) and the mount's upload lands at the name, with no error on either side (safe save); conflict copies stay until someone deletes them, so look for them after concurrent edits. A program on the local machine that saves an older buffer after the mount re-read the newer version is not covered. A change made elsewhere shows at the next lookup once it has landed and the mount's 5 s directory cache has expired, while a program that already has the file open may keep its old view (`hoody mount --help`). This is the inverse of the server-side FUSE mounts (which mount remote backends INTO the computer); a **server-side** WebDAV mount whose remote is a Hoody Files kit gets the same safe save (the remote keeps a version the mount never received as a conflict copy beside the file); the safe save needs the mount-session header that `hoody mount` and the server-side mount send, so the built-in Windows and macOS WebDAV clients above get no safe-save guarantee; on every other backend type the upload that reaches the backend last wins, so keep one writer per file there.
- **`hoody files exists <path>` is a `HEAD`:** it prints the path's metadata from the response headers (size, type, modification time, ETag; `-o json` gives every header, credential headers masked) and exits 1 when the path does not exist. It takes no read flags: for history and diffs use `files get <path> --history` or `--diff --from-seq <N>`; for permissions, owner and symlink target use `files stat <path>`.
- **`hoody files chunks write <path> --input <file>` only appends, and only to a file that already exists.** It sends the bytes raw (a piped stdin works too), the append position is fixed, so there is no position flag to set, and it replies `204` with no body. It creates nothing: `hoody files upload <path> --append` creates a missing file and answers JSON.
- **Replace, refuse, create parents.** `hoody files upload` replaces an existing file (`--append` adds to its end instead) and creates missing parent directories. `hoody files copy` refuses an existing destination unless you pass `--overwrite true`. `hoody files move` never replaces a destination and has no overwrite option: delete the destination first. Both create the destination's missing parent directories.
- **`hoody files delete` on a directory deletes it with everything under it**, with no non-recursive mode for directories.
- **`hoody files mkdir` succeeds when the directory is already there**, and creates missing parent directories.
- **Pending uploads need remote mounts enabled.** `hoody files uploads list` lists them; `hoody files uploads files list`, `hoody files uploads download`, `hoody files uploads deliver`, `hoody files uploads stop` and `hoody files uploads delete` work on a file service started with remote mounts allowed; on one without, every pending-uploads request answers `403 REMOTE_DISABLED`.

## Common errors

- 400 not supported with remote backends -- drop `--backend-id`.
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

Most steps have a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `hoody computers get` first. Examples that need history use `/home/user/...`. The kit has no fixed rule for `/tmp` or `/home/user`: coverage depends on the exclude lists, so check `hoody files get <path> --history` rather than assuming it. An idle kit may be asleep: the first request can return `502` from the proxy with an HTML error body, so retry 2-3 times with a few seconds of backoff.

### 1. Read a file — full bytes, stat envelope, and a slice of lines

**Goal:** inspect an unknown text file three ways: get its metadata, peek the raw bytes, and slice an arbitrary line range without pulling the whole thing.

**Step 1 — stat first.** `hoody files stat` returns size, owner/group, octal permissions, mtime, and, when the journal has recorded the path, `revisions`: the path's latest per-path revision number. The field is absent for a path the journal has not recorded, and it is not a count of the entries still retained after pruning. Use this BEFORE downloading a file you don't know the size of.

```bash
hoody --computer "$C" files stat /etc/hostname
```

**Step 2 — line slice.** `--lines 2-3` returns just lines 2 through 3 inclusive. Local-FS only (rejected with `400` when combined with `--backend-id`). The lines print as plain text, on a terminal and in a pipe; `-o json` prints them as one JSON string.

```bash
hoody --computer "$C" -o raw files get /etc/passwd --lines 2-3
```

**Step 3 — full body.** No query params, raw bytes. The `Content-Type` of a later download is inferred from the filename, with `application/octet-stream` when it has no known extension.

```bash
hoody --computer "$C" files get /etc/hostname --out-file /tmp/hostname.txt   # byte for byte, text or binary
hoody --computer "$C" -o raw files get /etc/hostname                          # a text file to stdout
```

### 2. Find files then grep them — TODO scan across a tree

**Goal:** find the `.md` files under a directory (visible and not ignored by default), then grep them for `TODO` with surrounding context. Both ops are local-FS only.

**Step 1 — glob.** `pattern` matches relative to `path`; obeys `.gitignore` unless `no_ignore=true` (`.gitignore` rules apply only inside a git repository). Names starting with `.` are skipped unless `hidden=true` (CLI `--hidden`) or an ignore-file `!name` rule re-includes them. Results are capped by `max_results` (default 1000, maximum 10000); check `truncated` in the response and search a smaller subtree when you need every match.

```bash
hoody --computer "$C" files glob /home/user --pattern '**/*.md' --max-results 200 \
  -o json | jq '.entries[].name'
```

**Step 2 — grep with context.** `?glob=` filters which files grep looks at; `?context=2` mirrors `grep -C 2`.

```bash
hoody --computer "$C" files grep /home/user --pattern TODO \
  --glob '**/*.md' --context 2 --ignore-case -o json \
  | jq '.matches[] | {path, line_number, line}'
```

### 3. Resumable upload — split a payload into a first upload and appended chunks

**Goal:** push a 16 MiB payload as 8 MiB chunks. Many CDN/proxy combos cap a single body at 10 MiB; chunked upload sidesteps that.

**Step 1 — first chunk via PUT.** Creates the file with the first slab.

```bash
head -c $((8*1024*1024)) /dev/urandom > /tmp/chunk1.bin
hoody --computer "$C" files upload /home/user/upload-test.bin < /tmp/chunk1.bin
```

**Step 2 — append remaining chunks.** Each chunk is one `hoody files append`: it sends `PUT /api/v1/files/append/{path}`, stages the whole body before the file changes, creates the file when it does not exist, and answers `200` with `{ success, path, new_size }`. 

```bash
head -c $((8*1024*1024)) /dev/urandom > /tmp/chunk2.bin
hoody --computer "$C" files append /home/user/upload-test.bin --input /tmp/chunk2.bin
hoody --computer "$C" files stat /home/user/upload-test.bin
```

**Step 3 — resume after a network drop.** A WebDAV append (`PATCH /{path}` with `X-Update-Range: append`) writes bytes as they arrive, so a request that broke off may already have added part of its chunk. A REST append (`PUT /api/v1/files/append/{path}`, or an upload with `append`) stages the whole body first, so a body that broke off leaves the file unchanged, although a failure during the write that follows can still leave part of the chunk appended. For a REST append sent without `Content-Length` (streamed, chunked or HTTP/2), send `X-Expected-Length` with the chunk's byte count: an HTTP/2 client that is aborted mid-body can otherwise hand over a body that looks complete, so the append ends short with no error, whereas with the header the kit refuses a body of any other length with `400` before the file changes. A WebDAV append does not check that header, so after a break stat the file before resuming. Either way, do not resend the whole chunk blindly: stat the remote file, compare its size with how many bytes of the payload you have sent, and append only the bytes after that size. An explicit `bytes=<start>-<end>` range (no `/<total>` suffix — that is rejected) must start inside the existing file and writes the whole body from that start, so it can rewrite a tail you know is wrong, but a start at EOF is refused; appending is the way to continue. The CLI sends only appends (`hoody files append`); explicit byte ranges need raw HTTP.

### 4. Time-travel a single file — history → revision N → diff

**Goal:** roll back a config file by reading an earlier revision, comparing it to current, then writing the chosen revision back. Use a path the journal covers: not under an excluded directory (`.git`, dev dirs such as `node_modules`, or excludes the deployment added — see Quirks), and confirm with `hoody files get <path> --history`.

**Step 1 — write two revisions.** Use a path with no journal history yet: revisions count on per path, so the `revision=1` below is this example's first write only on a fresh path. On a path with history, take the revision numbers from step 2.

```bash
FILE_PATH=/home/user/config.toml
echo 'verbose = false' | hoody --computer "$C" files upload "$FILE_PATH"
sleep 1
echo 'verbose = true'  | hoody --computer "$C" files upload "$FILE_PATH"
hoody --computer "$C" files journal flush
```

**Step 2 — list history.** `--history` returns one page of the per-revision log (100 entries by default, `--limit` up to 1000; while `has_more` is `true`, repeat with `--after-id` set to the response's `next_after_id`): each entry has `seq`, `op` (`"create"` / `"write"` / `"delete"` / `"moved_from"`/`"moved_to"` / etc. — see Example 5 for the full enum), `ts`, hashes, and size deltas.

```bash
hoody --computer "$C" files get "$FILE_PATH" --history -o json \
  | jq '.revisions[] | {seq, op, ts, size_after}'
```

**Step 3 — fetch revision N.** `--revision 1` returns the bytes of that point-in-time. (Use `--at <unix-ms>` for an instant.)

```bash
hoody --computer "$C" files get "$FILE_PATH" --revision 1
hoody --computer "$C" -o raw files get "$FILE_PATH" --diff --from-seq 1
```

**Step 4 — restore by writing rev1 bytes back.** Write the bytes `--revision 1` returned back to the path.
```bash
hoody --computer "$C" -o raw files get "$FILE_PATH" --revision 1 \
  | hoody --computer "$C" files upload "$FILE_PATH"
```

### 5. Audit — stream recorded Hoody Files mutations since a cursor via the journal

**Goal:** wire a SIEM / alerting pipeline. Get the recorded FS mutations since the last cursor, including hashes for tamper detection. Don't forget `hoody files journal flush` first. The journal records only changes made through Hoody Files: a change made by a terminal, a script, a program or the agent's tools is not in it.

**Step 1 — flush so buffered journal writes are on disk.**

```bash
hoody --computer "$C" files journal flush
```

**Step 2 — query since cursor.** `after_id` is the last `id` you've seen. `op` enum is `"create"` / `"write"` / `"append"` / `"delete"` / `"touch"` / `"moved_from"` / `"moved_to"` / `"copied_from"` / `"copied_to"` / `"dir_moved_from"` / `"dir_moved_to"` / `"dir_copied_from"` / `"dir_copied_to"` / `"dir_deleted"` / `"mkdir"` / `"chmod"` / `"chown"` / `"gap"` (no bare `"move"`/`"copy"` — use the directional `"moved_from"`/`"moved_to"` etc. pair).

The response carries `has_more`. `next_after_id` is set only while `has_more` is true; on the last page it is `null`. Advance the cursor to `next_after_id` when it is set, otherwise to the last entry's `id`, and keep the old cursor when the page is empty. Storing `null` would restart the next poll from the beginning of the journal.

```bash
LAST=${LAST:-0}   # cursor; persist client-side
R=$(hoody --computer "$C" files journal list --after-id "$LAST" --limit 200 -o json)
echo "$R" | jq '{count, has_more, entries}'
LAST=$(echo "$R" | jq --argjson last "$LAST" '.next_after_id // (.entries | last | .id) // $last')
```

**Step 3 — health check.** Watch `hoody files journal stats` for `writer_healthy:false`, `parse_failures`, or `skipped_overflow > 0` — any of those means the audit trail is degraded.

```bash
hoody --computer "$C" files journal stats
```

### 6. Download a URL straight into the FS (no curl, no wget needed)

**Goal:** pull an asset from the public internet into a computer path. The kit handles the actual HTTP fetch — useful for sandboxed computers without outbound HTTP libs.

**Step 1 — download.** `GET /<directory>?download=<url>&filename=<name>` (URL-encode the URL). The directory must already exist (a missing one is `404`), so create it first. The request waits until the download has finished, then answers `201` with a `download_id`; to watch progress, list active downloads from a separate request while this one is still running.

```bash
hoody --computer "$C" files mkdir /home/user/inbox   # the target directory must exist
hoody --computer "$C" files downloads create /home/user/inbox \
  --download 'https://httpbin.org/robots.txt' --filename robots.txt --timeout 15
```

**Step 2 — list active** (from a second request while a download runs; a finished one moves to the history). `?downloads` ONLY works on the WebDAV root route — `GET /api/v1/files/<dir>?downloads` ignores the flag and returns a normal listing.

```bash
hoody --computer "$C" files downloads list /home/user/inbox
hoody --computer "$C" files downloads history list
```

### 7. Archive workflow — preview, then selective extract

**Goal:** extract just one subpath of a zip without unpacking the whole archive.

**Step 1 — preview** to see what's inside. `?preview` MUST be empty — `?preview=true` is parsed as the entry name `true` and 404s.

```bash
hoody --computer "$C" files archives preview /home/user/inbox/hello.zip
```

**Step 2 — extract a subset.** `?extract=<entry>` selects entries: an exact archive entry name extracts that one file, a directory prefix ending in `/` (`src/`) extracts that subtree, and an empty value extracts everything. There is no glob matching (`src/**` matches nothing). `?dest=` MUST be relative — absolute paths return `400 Absolute destination path not allowed`. Destination is created relative to the archive's parent dir.

```bash
hoody --computer "$C" files archives extract /home/user/inbox/hello.zip \
  --member 'Hello-World-master/' --dest extracted
```

**Step 3 — extract a single file to disk.** Pass `?extract=<entry>` with the exact entry name (a bare `?extract_file=` does nothing useful: it falls through to "send whole archive"). The kit writes the matched entry under `?dest=`; without `dest` it creates a directory named after the archive beside it (`hello.zip` → `hello/`, `x.tar.gz` → `x/`) and extracts there.

```bash
# extract-file writes the entry to disk and prints an extraction response, not the file
hoody --computer "$C" files archives members extract /home/user/inbox/hello.zip \
  Hello-World-master/README --dest extracted
# the entry keeps its archive path under dest; download it separately
hoody --computer "$C" files get /home/user/inbox/extracted/Hello-World-master/README --out-file /tmp/readme.txt
```

### 8. Cross-directory copy + move + chmod (a one-shot deploy)

**Goal:** stage a config in a working dir, copy to the target, set permissions, move the staging file to a backup folder. Uses POST against the copy/move reserved-prefix routes (`/api/v1/files/copy/...`, `/move/...`) and PATCH for chmod/chown (`/api/v1/files/chmod/...`, `/chown/...`).

**Step 1 — copy.** The destination is `--copy-to` (for move, `--move-to`). Add `--overwrite true` to allow replacing an existing destination.

```bash
hoody --computer "$C" files copy /home/user/staging/app.toml \
  --copy-to /etc/myapp/app.toml --overwrite true
```

**Step 2 — chmod.** Octal as a query param (`?chmod=600`). Requires chmod enabled by the deployment; Unix-only.

```bash
hoody --computer "$C" files chmod /etc/myapp/app.toml --chmod 600
```

**Step 3 — move staging → archive.** Same pattern as copy, but move never replaces an existing destination (409 `DESTINATION_EXISTS`) and takes no `overwrite`: delete the destination first. `--move-to` is required.

```bash
hoody --computer "$C" files move /home/user/staging/app.toml \
  --move-to /home/user/archive/app.toml
```

### 9. Connect a remote backend, mount it as a path, list through both surfaces

**Goal:** attach a remote backend (here `sftp`, with a placeholder host, user and password; `s3`, `drive` and the other types take the same steps with their own config) and surface it as a regular FS path via FUSE. Requires remote backends enabled by the deployment.

**Step 1 — connect.** Each backend has its own `POST /api/v1/backends/<type>` with type-specific config. Returns `201` with `{success, message, data: {id, type, vfs_backend_type, config, mount_paths}}`; the backend id is `data.id` (`config` has credentials stripped).

```bash
BID=$(hoody --computer "$C" files backends sftp create \
  --host sftp.example.com --user deploy --pass "$SFTP_PASS" \
  --description sftp-example -o json | jq -r '.data.id')   # the kit's own {success,message,data} body is printed as-is → .data.id
hoody --computer "$C" files backends test "$BID"
```

**Step 2 — mount.** `mount_path` is resolved against the kit's configured mount directory (default `/hoody/mounts/permanent`): an absolute path must be under it (`400 Mount path must be under the configured mount directory` otherwise), a relative path is joined under it, and an existing non-symlink path returns `409 Mount path already exists and is not a symlink`.

```bash
MID=$(hoody --computer "$C" files mounts create \
  --backend-id "$BID" --label sftp-mount \
  --mount-path /hoody/mounts/permanent/sftp-test -o json | jq -r '.data.id')   # same kit body shape → .data.id
```

**Step 3 — read through the mount as a regular path.**

```bash
hoody --computer "$C" files get /hoody/mounts/permanent/sftp-test
```

**Step 4 — tear down** (in order: unmount, then disconnect).

```bash
hoody --computer "$C" files mounts delete "$MID"
hoody --computer "$C" files backends delete "$BID"
```

### 10. Bulk delete a tree — and verify nothing is left

**Goal:** wipe a working directory and every file under it, then confirm via journal + listing that nothing remains. The recursive delete is not atomic: if it fails partway, the entries already removed stay removed and the rest remain, so always verify.

**Step 1 — DELETE on the directory.** `DELETE /api/v1/files/<dir>` removes recursively. (Reserved-prefix trap: a path like `/api/v1/files/stat/foo` is interpreted as removing `/stat/foo`, NOT a stat call. Always use absolute computer paths.)

```bash
hoody --computer "$C" files delete /home/user/files-examples-cleanup -y
```

**Step 2 — verify.** A `404` from `hoody files stat` is what you want. It means the path is not found through this API; it does not by itself prove that no entry remains on disk (a refused symlink also answers `404`).

```bash
# a 404 means not found through this API; 401/403/5xx or a connection error is a failed check
if out=$(hoody --computer "$C" files stat /home/user/files-examples-cleanup 2>&1); then
  echo "still present"
elif printf '%s' "$out" | grep -q 'Error \[404'; then
  echo "not found through this API"
else
  printf '%s\n' "$out" >&2; exit 1
fi
```

**Step 3 — confirm via journal.** Where the journal covers the path, a successful directory delete normally records one `op: "dir_deleted"` entry for the directory itself (no per-path `seq`), not an entry per child; deleting a single file records `op: "delete"`. Recording is best-effort: a delete still succeeds when its entry cannot be written, so an absent entry does not prove the delete failed. Flush first. The journal lists oldest first, so one `limit=10` call returns only the ten oldest matching records and can miss the new `dir_deleted` one: page on with `after_id` (continue from `next_after_id`) until the entry shows up or `has_more` is false.

```bash
hoody --computer "$C" files journal flush
hoody --computer "$C" files journal list --path /home/user/files-examples-cleanup --limit 10
```

### 11. Share a folder as a zip — one link, no archive on disk

**Goal:** hand a person (or another program) a folder as one download, without writing a `.zip` into the computer first. The files kit streams a folder as a zip when the bare flag `?zip` follows the folder's path on the REST route: `GET /api/v1/files/<abs dir>?zip`. The link is the kit's capability URL, so whoever holds it can download the folder, subject to the computer's proxy permissions: share it only with people who should see that folder.

Limits: local folders only (a folder of a remote backend, named with `backend`, answers `501`), and only where the deployment enabled archive downloads (the standard `hoody_kit: true` computer image enables them). Where they are off, this route answers `403` with `Archive download not allowed`; any other `403` is an access refusal, not this switch. The WebDAV-style route `GET /<abs dir>?zip` (`hoody files zip`) streams the same zip but answers `404` where archive downloads are off, so check and share the REST route. A folder one archive cannot hold whole (more than 1000000 files, more than 10000000 files and folders in all, or folders nested deeper than 50 levels) is refused with `422 ARCHIVE_TOO_LARGE` before anything is sent. A file that cannot be read, or that changes while it is added, is named in a `__hoody-files_zip_errors__.txt` entry at the end of the archive. The archive holds only what the requesting account may read: with per-account path rules, paths outside its rules, and symlinks that lead there, are left out.

**Step 1 — build the link.** Read `project_id`, `id` and `server_name` from the computer, then append the folder's absolute path and `?zip` (no value) to the files kit URL's `/api/v1/files` route.

```bash
read -r P N < <(hoody computers get "$C" -o json | jq -r '"\(.project_id) \(.server_name)"')
echo "https://${P}-${C}-files-1.${N}.computers.hoody.com/api/v1/files/home/user/project?zip"   # the link to hand over
```

**Step 2 — check it, or download it yourself, on the same route.** A `200` with `Content-Type: application/zip` means the link works. A `403` saying `Archive download not allowed` means archive downloads are off for this kit; a `422` means the folder is too large for one archive (zip a subfolder instead).

```bash
# files zip downloads the same zip; where archive downloads are off it answers 404, not 403
hoody --computer "$C" files zip /home/user/project --out-file project.zip
unzip -l project.zip | tail -1
```

## Reference

### `hoody files` (113) — File operations and remote backends

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody files append` |  | write | Append data to file | `files.append` | `hoody files append /home/user/file.txt --expected-length 16777216 --input ./local-file` |
| `hoody files archives extract` |  | write | Extract an archive | `files.archives.extract` | `hoody files archives extract /home/user/archive.zip --member src/main.rs` |
| `hoody files archives extract` |  | write | With `--owner`: Extract an archive with an owner for the new files (answers success and message only) | `files.archives.extract` | `hoody files archives extract /home/user/archive.zip --owner <owner> --member src/main.rs` |
| `hoody files archives members extract` |  | write | Extract file from archive | `files.archives.extractMember` | `hoody files archives members extract /home/user/archive.zip src/` |
| `hoody files archives members read` |  | read | View file from archive | `files.archives.readMember` | `hoody files archives members read /home/user/archive.zip src/` |
| `hoody files archives preview` |  | read | Preview archive contents or read file | `files.archives.preview` | `hoody files archives preview /home/user/archive.zip --watch 2s` |
| `hoody files backends azureblob create` |  | write | Connect to azureblob backend | `files.backends.createAzureblob` | `hoody files backends azureblob create --archive-tier-delete --chunk-size 4194304` |
| `hoody files backends azurefiles create` |  | write | Connect to azurefiles backend | `files.backends.createAzurefiles` | `hoody files backends azurefiles create --chunk-size 4194304 --client-send-certificate-chain` |
| `hoody files backends b2 create` |  | write | Connect to b2 backend | `files.backends.createB2` | `hoody files backends b2 create --account acc-abc --chunk-size 100663296 --copy-cutoff 4294967296 --key <key>` |
| `hoody files backends box create` |  | write | Connect to box backend | `files.backends.createBox` | `hoody files backends box create --auth-url https://example.com/auth --box-sub-type user` |
| `hoody files backends cloudinary create` |  | write | Connect to cloudinary backend | `files.backends.createCloudinary` | `hoody files backends cloudinary create --adjust-media-files-extensions --api-key <api_key> --api-secret <api_secret> --cloud-name <cloud_name> --description 'My description'` |
| `hoody files backends delete` |  | destructive | Disconnect backend | `files.backends.delete` | `hoody files backends delete abc-123 --uploads keep` |
| `hoody files backends drive create` |  | write | Connect to drive backend | `files.backends.createDrive` | `hoody files backends drive create --acknowledge-abuse --allow-import-name-change` |
| `hoody files backends dropbox create` |  | write | Connect to dropbox backend | `files.backends.createDropbox` | `hoody files backends dropbox create --auth-url https://example.com/auth --batch-commit-timeout 600` |
| `hoody files backends fichier create` |  | write | Connect to fichier backend | `files.backends.createFichier` | `hoody files backends fichier create --cdn --description 'My description'` |
| `hoody files backends filefabric create` |  | write | Connect to filefabric backend | `files.backends.createFilefabric` | `hoody files backends filefabric create --description 'My description' --encoding 50429954 --url https://example.com` |
| `hoody files backends filescom create` |  | write | Connect to filescom backend | `files.backends.createFilescom` | `hoody files backends filescom create --description 'My description' --encoding 60923906` |
| `hoody files backends ftp create` |  | write | Connect to ftp backend | `files.backends.createFtp` | `hoody files backends ftp create --close-timeout 60 --concurrency 0 --host ftp.example.com` |
| `hoody files backends get` |  | read | Get backend details | `files.backends.get` | `hoody files backends get abc-123` |
| `hoody files backends gofile create` |  | write | Connect to gofile backend | `files.backends.createGofile` | `hoody files backends gofile create --description 'My description' --encoding 323331982` |
| `hoody files backends googlecloudstorage create` |  | write | Connect to google cloud storage backend | `files.backends.createGoogleCloudStorage` | `hoody files backends googlecloudstorage create --anonymous --auth-url https://example.com/auth` |
| `hoody files backends googlephotos create` |  | write | Connect to google photos backend | `files.backends.createGooglePhotos` | `hoody files backends googlephotos create --auth-url https://example.com/auth --batch-commit-timeout 600` |
| `hoody files backends hdfs create` |  | write | Connect to hdfs backend | `files.backends.createHdfs` | `hoody files backends hdfs create --description 'My description' --encoding 50430082 --namenode namenode-1:8020,namenode-2:8020` |
| `hoody files backends hidrive create` |  | write | Connect to hidrive backend | `files.backends.createHidrive` | `hoody files backends hidrive create --auth-url https://example.com/auth --chunk-size 50331648` |
| `hoody files backends http create` |  | write | Connect to http backend | `files.backends.createHttp` | `hoody files backends http create --description 'My description' --headers Cookie,name=value --url https://example.com` |
| `hoody files backends iclouddrive create` |  | write | Connect to iclouddrive backend | `files.backends.createIclouddrive` | `hoody files backends iclouddrive create --apple-id abc-123 --client-id d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d --description 'My description' --password <password>` |
| `hoody files backends imagekit create` |  | write | Connect to imagekit backend | `files.backends.createImagekit` | `hoody files backends imagekit create --description 'My description' --encoding 117553486 --endpoint https://example.com --private-key <private_key> --public-key pk_abc123` |
| `hoody files backends internetarchive create` |  | write | Connect to internetarchive backend | `files.backends.createInternetarchive` | `hoody files backends internetarchive create --description 'My description' --disable-checksum` |
| `hoody files backends jottacloud create` |  | write | Connect to jottacloud backend | `files.backends.createJottacloud` | `hoody files backends jottacloud create --auth-url https://example.com/auth --client-credentials` |
| `hoody files backends koofr create` |  | write | Connect to koofr backend | `files.backends.createKoofr` | `hoody files backends koofr create --description 'My description' --encoding 50438146 --endpoint https://example.com --password <password> --user alice` |
| `hoody files backends linkbox create` |  | write | Connect to linkbox backend | `files.backends.createLinkbox` | `hoody files backends linkbox create --description 'My description' --email user@example.com --password <password> --backend-token <token>` |
| `hoody files backends list` |  | read | List all backends | `files.backends.list` | `hoody files backends list --watch 2s` |
| `hoody files backends mailru create` |  | write | Connect to mailru backend | `files.backends.createMailru` | `hoody files backends mailru create --auth-url https://example.com/auth --check-hash --pass <pass> --user alice` |
| `hoody files backends mega create` |  | write | Connect to mega backend | `files.backends.createMega` | `hoody files backends mega create --debug --description 'My description' --pass <pass> --user alice` |
| `hoody files backends netstorage create` |  | write | Connect to netstorage backend | `files.backends.createNetstorage` | `hoody files backends netstorage create --account acc-abc --description 'My description' --host example.com --protocol https --secret <secret>` |
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
| `hoody files backends s3 create` |  | write | Connect to s3 backend | `files.backends.createS3` | `hoody files backends s3 create --access-key-id abc-123 --bucket-object-lock-enabled --bypass-governance-retention --secret-access-key <secret_access_key>` |
| `hoody files backends seafile create` |  | write | Connect to seafile backend | `files.backends.createSeafile` | `hoody files backends seafile create --2fa --create-library --url https://example.com` |
| `hoody files backends sftp create` |  | write | Connect to sftp backend | `files.backends.createSftp` | `hoody files backends sftp create --chunk-size 32768 --concurrency 64 --host example.com --pass <pass> --user alice` |
| `hoody files backends sharefile create` |  | write | Connect to sharefile backend | `files.backends.createSharefile` | `hoody files backends sharefile create --auth-url https://example.com/auth --chunk-size 67108864` |
| `hoody files backends sia create` |  | write | Connect to sia backend | `files.backends.createSia` | `hoody files backends sia create --api-url https://example.com --description 'My description' --encoding 50436354` |
| `hoody files backends smb create` |  | write | Connect to smb backend | `files.backends.createSmb` | `hoody files backends smb create --case-insensitive --description 'My description' --host example.com` |
| `hoody files backends sugarsync create` |  | write | Connect to sugarsync backend | `files.backends.createSugarsync` | `hoody files backends sugarsync create --description 'My description' --encoding 50397186` |
| `hoody files backends swift create` |  | write | Connect to swift backend | `files.backends.createSwift` | `hoody files backends swift create --auth-version 0 --chunk-size 5368709120` |
| `hoody files backends test` |  | read | Test backend connection | `files.backends.test` | `hoody files backends test abc-123` |
| `hoody files backends ulozto create` |  | write | Connect to ulozto backend | `files.backends.createUlozto` | `hoody files backends ulozto create --description 'My description' --encoding 50438146` |
| `hoody files backends update` |  | write | Update backend credentials | `files.backends.update` | `hoody files backends update abc-123 --credential pass=s3cret` |
| `hoody files backends webdav create` |  | write | Connect to webdav backend | `files.backends.createWebdav` | `hoody files backends webdav create --auth-redirect --description 'My description' --url https://example.com` |
| `hoody files backends yandex create` |  | write | Connect to yandex backend | `files.backends.createYandex` | `hoody files backends yandex create --auth-url https://example.com/auth --client-credentials` |
| `hoody files backends zoho create` |  | write | Connect to zoho backend | `files.backends.createZoho` | `hoody files backends zoho create --auth-url https://example.com/auth --client-credentials` |
| `hoody files chmod` |  | write | Change file permissions | `files.chmod` | `hoody files chmod /home/user/file.txt --chmod 755` |
| `hoody files chown` |  | write | Change file ownership | `files.chown` | `hoody files chown /home/user/file.txt --chown user:group` |
| `hoody files chunks write` |  | write | Append bytes to an existing file (no creation, no offsets); `files upload --append` creates a missing file | `files.writeChunk` | `hoody files chunks write /home/user/file.txt --input ./local-file` |
| `hoody files copy` |  | write | Copy file or directory | `files.copy` | `hoody files copy /home/user/file.txt --copy-to <copy_to> --overwrite true` |
| `hoody files delete` |  | destructive | Delete file or directory | `files.delete` | `hoody files delete /home/user/file.txt -y` |
| `hoody files downloads cancel` |  | action | Cancel a running download | `files.downloads.cancel` | `hoody files downloads cancel 3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| `hoody files downloads create` |  | write | Download a file from a URL into a directory | `files.downloads.create` | `hoody files downloads create /home/user/src --download <download_from> --timeout 10` |
| `hoody files downloads create` |  | write | With `--owner`: Download a file from a URL with an owner for the new file or a client-chosen id (with an id it answers at once and the download runs on) | `files.downloads.create` | `hoody files downloads create /home/user/src --owner <owner> --download <download_from> --timeout 10` |
| `hoody files downloads history list` |  | read | Download history | `files.downloads.listHistory` | `hoody files downloads history list --watch 2s` |
| `hoody files downloads list` |  | read | List all active downloads | `files.downloads.list` | `hoody files downloads list --watch 2s` |
| `hoody files downloads list` |  | read | List active downloads of a directory | `files.downloads.listByDirectory` | `hoody files downloads list <directory> --watch 2s` |
| `hoody files exists` |  | read | Check that a path exists and print its size, type, ETag and modification time (the HEAD response headers); exits 1 when it does not exist. Revisions of a file: files get PATH --history | `files.exists` | `hoody files exists /home/user/file.txt` |
| `hoody files extractions cancel` |  | action | Cancel a running extraction | `files.extractions.cancel` | `hoody files extractions cancel 3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| `hoody files extractions history list` |  | read | Extraction history | `files.extractions.listHistory` | `hoody files extractions history list --watch 2s` |
| `hoody files extractions list` |  | read | List active extractions | `files.extractions.list` | `hoody files extractions list --watch 2s` |
| `hoody files ftp get` |  | read | Access file via FTP | `files.ftp.get` | `hoody files ftp get /home/user/file.txt --server ftp.example.com:21 --user anonymous --ftp-secure` |
| `hoody files get` |  | read | List directory or download file | `files.get` | `hoody files get /home/user/file.txt --hash --lines 50-` |
| `hoody files glob` |  | read | Find files by glob pattern | `files.glob` | `hoody files glob /home/user/src --pattern '*.ts' --max-results 1000 --max-depth 50` |
| `hoody files grep` |  | read | Search file contents (grep) | `files.grep` | `hoody files grep /home/user/file.txt --pattern TODO --ignore-case --fixed-string` |
| `hoody files health` |  | read | Service health check | `files.kit.getHealth` | `hoody files health` |
| `hoody files images convert` |  | read | Process and convert images | `files.images.convert` | `hoody files images convert img-abc --format jpeg --size 800x600` |
| `hoody files journal flush` |  | write | Flush journal to disk | `files.journal.flush` | `hoody files journal flush` |
| `hoody files journal list` |  | read | Query journal entries | `files.journal.list` | `hoody files journal list --path /home/user/file.txt --op write,delete` |
| `hoody files journal stats` |  | read | Get journal statistics | `files.journal.getStats` | `hoody files journal stats` |
| `hoody files mkdir` |  | write | Create a directory (--backend-id creates it on a remote backend, --owner sets its owner) | `files.mkdir` | `hoody files mkdir /home/user/file.txt` |
| `hoody files mounts create` |  | write | Create persistent FUSE mount | `files.mounts.create` | `hoody files mounts create --auto-deliver --backend-id a1b2c3d4e5f60718 --label my-label` |
| `hoody files mounts delete` |  | destructive | Unmount filesystem | `files.mounts.delete` | `hoody files mounts delete abc-123 --uploads keep` |
| `hoody files mounts get` |  | read | Get mount details | `files.mounts.get` | `hoody files mounts get abc-123` |
| `hoody files mounts list` |  | read | List all mounts | `files.mounts.list` | `hoody files mounts list --label my-label --watch 2s` |
| `hoody files mounts update` |  | write | Change a mount's VFS settings or its saved auto-deliver flag (currently has no effect) | `files.mounts.update` | `hoody files mounts update abc-123 --switch wait --auto-deliver` |
| `hoody files move` |  | write | Move file or directory | `files.move` | `hoody files move /home/user/file.txt --move-to <move_to>` |
| `hoody files open` |  | action | Open the Files kit file explorer at a folder in your browser |  | `hoody files open --path /home/user` |
| `hoody files realpath` |  | read | Resolve canonical path (realpath) | `files.realpath` | `hoody files realpath /home/user/file.txt` |
| `hoody files s3 get` |  | read | Access file from S3 | `files.s3.get` | `hoody files s3 get /home/user/file.txt --server s3.amazonaws.com --s3-bucket <s3_bucket> --s3-region us-east-1` |
| `hoody files search` |  | read | Search directory | `files.search` | `hoody files search /home/user/src --query <q> --theme oc-1 --color-scheme light` |
| `hoody files ssh get` |  | read | Access file via SSH/SFTP | `files.ssh.get` | `hoody files ssh get /home/user/file.txt --server nas.local:22 --user alice --pass <pass>` |
| `hoody files ssh upload` |  | write | Upload file via SSH/SFTP | `files.ssh.upload` | `hoody files ssh upload /home/user/file.txt --server nas.local:22 --user alice --pass <pass> --input ./local-file` |
| `hoody files stat` |  | read | Get file metadata (stat) | `files.stat` | `hoody files stat /home/user/file.txt` |
| `hoody files touch` |  | write | Touch file (create or update mtime) | `files.touch` | `hoody files touch /home/user/file.txt` |
| `hoody files update` |  | write | Modify file properties or move/rename | `files.update` | `hoody files update /home/user/file.txt --move-to /new/dir/file.txt` |
| `hoody files upload` |  | write | Upload or append file | `files.upload` | `hoody files upload /home/user/file.txt --append --expected-length 16777216 --input ./local-file` |
| `hoody files uploads delete` |  | destructive | Delete every held file of a pending upload. They are the only copy of those changes; the backend is not touched | `files.uploads.delete` | `hoody files uploads delete 550e8400e29b41d4a716446655440000 -y` |
| `hoody files uploads deliver` |  | write | Upload held files of a pending upload to a backend, overwriting newer versions there. Without --paths or --paths-b64, every complete file is delivered | `files.uploads.deliver` | `hoody files uploads deliver 550e8400e29b41d4a716446655440000 --paths photos/cat.jpg -y` |
| `hoody files uploads download` |  | read | Write the held copy of one file of a pending upload, byte for byte; save it with --out-file <path>. Name it with exactly one of --path or --path-b64, as listed | `files.uploads.download` | `hoody files uploads download 550e8400e29b41d4a716446655440000 --path photos/cat.jpg` |
| `hoody files uploads files list` |  | read | List the files of a pending upload, one page at a time. When more follow, -o json shows next_cursor; pass it to --cursor | `files.uploads.listFiles` | `hoody files uploads files list 550e8400e29b41d4a716446655440000 --limit 1000 --watch 2s` |
| `hoody files uploads list` |  | read | List pending uploads: unsent upload data held after a crash or stop, or still uploading | `files.uploads.list` | `hoody files uploads list --watch 2s` |
| `hoody files uploads stop` |  | action | Stop the uploads or the delivery of a pending upload and keep its unsent files. Nothing is lost | `files.uploads.stop` | `hoody files uploads stop 550e8400e29b41d4a716446655440000` |
| `hoody files uploads unreadable delete` |  | destructive | Delete an unreadable pending-upload record and every file it kept on the server. What it held cannot be known; the backend is not touched | `files.uploads.deleteUnreadable` | `hoody files uploads unreadable delete 550e8400e29b41d4a716446655440000 -y` |
| `hoody files uploads unreadable list` |  | read | List the stored records of unsent files that cannot be read. While one exists, a mount or backend delete cannot confirm that nothing was left unsent | `files.uploads.listUnreadable` | `hoody files uploads unreadable list --watch 2s` |
| `hoody files version` |  | read | Get API version | `files.kit.getVersion` | `hoody files version` |
| `hoody files webdav get` |  | read | Access file via WebDAV | `files.webdav.get` | `hoody files webdav get /home/user/file.txt --server cloud.nextcloud.com --user alice --webdav-path /` |
| `hoody files whoami` |  | read | Show the user your credentials authenticate as | `files.whoami` | `hoody files whoami /home/user/file.txt` |
| `hoody files zip` |  | read | Download directory as ZIP | `files.zip` | `hoody files zip /home/user/src` |

