> _**CLI skill · `run` namespace** · ~8,223 tokens · hoody-sdk v1.0.1_

# `run` — resolve apps to shell commands

## Purpose

Hoody Run — HTTP resolver across package sources (the built-in starter catalogue, trusted-list, system-path, nixpkgs, pkgx, AppImage, OCI, manifests, npm, PyPI). Returns ranked candidates (each carrying a `kind`) or a resolved `shell_command`. Resolve produces a command plus a preview; it never launches the app itself.

## When to use

- Resolve `firefox`/`react`/`owner/repo` to a command.
- Cross-provider candidates with stable `set_id`.
- Preview the resolved command via `print_curl` / `preflight`.
- Batch via `POST /api/v1/run/batch` (HTTP only; no CLI command); persist profiles/recipes.

## When NOT to use

Not for: command known → `terminal`, long-lived process → `daemon`, one-shot remote exec → `exec`, arbitrary HTTP → `curl`.

## Prerequisites

- Kit slug `run`.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Search then pick

1. `hoody run search --app <app> --page-size 25 -o json` (`page_size`, default 25, max 100, sets the page; `--cursor` for the next page) → `set_id`, `total_count`, `items`, `next_cursor`.
2. `hoody run resolve --app <app> --set-id <set_id> --pick id --candidate-id <id> -o json` → `shell_command`. Copy `candidate_id` from the chosen item: `--pick-index` indexes the whole cached set, not the current page, so a position from a later page can select a different candidate or fail; if the policy changed since the search, later pages may also skip candidates that are now denied.

### 2. Preflight

1. `hoody run test --app <app> --pick first` → `recommended_mode`, `missing_requirements`, `effective_policy`.
2. `hoody run resolve --app <app> --pick first` → `shell_command` and `handoff` (the preview).

Without `--pick` (and no profile default), or with `--pick ask`, preflight answers `search-only` with no command, and resolve lists the candidates and selects none.

### 3. Cursor-paged search

`hoody run search --app <app>` → `{ set_id, total_count, items, next_cursor }` (note `items`, not `candidates`). The cursor-paged endpoint returns one page per call; carry `next_cursor` forward until it's null/absent.

### 4. Batch

`POST /api/v1/run/batch` (HTTP only; no CLI command). `mode:"run"` resolves each item like `resolve`: a successful `first`, `index` or `id` pick returns a selected candidate and its command; if the effective pick is absent or `ask` (an omitted pick can inherit a profile default), the item returns the candidate set with `status: "resolved"`. Each result item is `result: "search"`, `"run"` or `"error"` (the item's own `{ error, code, status }`), so one bad item does not fail the batch. The CLI has no batch command; POST the route with curl against the kit URL, or resolve the apps one by one with `hoody run resolve`.

### 5. Recipes

`hoody run recipes create` takes the recipe as flags: `--name`, one flag per field of the recipe's selector template (`--app`, `--os`, `--kind`, `--pick`, `--limit` and so on; a recipe cannot set `enrich`, `args`, `pass_env`, `launch_tag` or `launch_env`), and `--allowed-overrides` naming the fields a caller may change. Invoke it with `hoody run recipes resolve <name>`, passing only allow-listed fields, each as its own flag (`--app bun`); there is no JSON object to build.

## Quirks & gotchas

- Kit slug/URL/HTTP prefix all `run`. The resolve endpoint answers both `GET /api/v1/run/resolve` (selector in the query string) and `POST /api/v1/run/resolve` (selector as a JSON body). CLI: `hoody run resolve` (POST form), or the bare `hoody run <app>`.
- Every candidate carries a `kind` — `gui` | `cli` | `any` (`any` means the source doesn't classify it). `kind` and `os` in the selector are applied by each source from its own metadata, not by a final filter: system-path results ignore them (and report `kind: any`); nix ignores `kind` (every nix candidate reports `kind: any`); npm and PyPI ignore `kind` and report every candidate as `kind: cli`, so a `kind: gui` search can still return them; the starter catalogue filters by exact kind for `gui` and `cli`, while `any` allows all kinds; trusted-list and manifest entries are filtered only when they declare the field; and the starter catalogue, nix, pkgx, OCI, AppImage, npm and PyPI return no candidates for an `os` other than `linux` or `any`, such as `windows`. `arch` is applied only by the AppImage sources, which use it to pick a release asset; every other source, including system-path, ignores it, so it does not narrow their results. Inspect the selected candidate and its command before treating it as GUI, CLI or Windows-compatible.
- Omitted selector fields inherit the requested `profile`, or else the kit's selected profile (`os`, `kind`, `source`, `pick`, `terminal_id`, `display`, `limit`). With no profile default, `limit` defaults to 25, clamped 1..=100.
- Candidates are ordered by source priority first (under the default priorities the built-in starter catalogue, 1100, ranks above the trusted list, 1000, which ranks above system-path, 200, and the package sources), then score, then the source and that source's own order, then `candidate_id`, so the top hit is not always the highest score. Read the returned list and pick by `candidate_id`, or by its index in the full cached set (not its position on a page).
- `candidate_id` is a content hash the kit computes over what the candidate runs, not a readable `<provider>:<path>` string. Copy it from a search response; never build one by hand.
- Query results are cached for 30 seconds by default; the kit configuration can change that duration.
- `set_id` expires 300s.
- Selector requires `app`. Aliases `q`/`name` are accepted ONLY by the urlencoded query-string parser (GET / form-style); the JSON `Selector` model has only `app`, so JSON POST / SDK calls must use `app:`.
- Resolve is command-only; the kit never launches the app or executes anything. The response `status` is `"dry-run"` (one picked candidate), `"printed-curl"` (one picked candidate, plus a `curl` line because `print_curl` was set) or `"resolved"` (pick mode `ask`: the candidate set, nothing selected). Only a picked response carries `handoff` (`{ state: "preview", terminal_id, display, preview_display_url?, preview_terminal_url?, suggested: { band: [8001, 9999], opens_in } }`, where `suggested` is where a client that opens the app itself should put it: a starter entry's own surface, a terminal for an OCI image, a window for a `gui` candidate, else a terminal); a `resolved` response has none. The two preview URLs are predicted for the target, not from the candidate: an operator URL template takes `terminal_id`; without one, `preview_terminal_url` is the computer's own kit host for `terminal_id` and `preview_display_url` the one for `display` (default `terminal_id`). Either is absent when it cannot be built (no template or routing, or a `display` that is not a display number), and neither proves anything is running.
- `POST /api/v1/run/batch` (HTTP only; no CLI command) only knows `mode: "search" | "run"` (no `"preflight"`); `"run"` resolves to a command.
- `hoody run recipes resolve` / `hoody run recipes search` reject a recipe template field set (non-null) under `overrides` outside `allowed_overrides` with `400 OVERRIDE_NOT_ALLOWED` (`recipe override not allowed: <field>`); it is not silently dropped. Keys that are not recipe template fields are ignored, including `enrich`, `args`, `pass_env`, `launch_tag` and `launch_env`: a recipe cannot set them. Spell field names exactly.
- **Outbound requests the kit makes itself (webhook delivery, remote manifest index fetches, source fetches) go only to public internet destinations.** A URL that points at the computer itself or at another computer is refused, so a remote index or webhook URL of that kind cannot work. Webhooks are configured in the kit's config file only (`GET /api/v1/run/config` is read-only), so this matters mainly when diagnosing a source sync or a webhook someone set up. A refusal carries the marker `refusing to connect to` and is not retried; `the name <host> resolved to no address` carries no marker and is a transient failure. Proxy environment variables are ignored; webhook and remote-index fetches follow no redirects, and source fetches follow at most ten. Helper binaries a provider shells out to (`nix search`) are outside this guarantee.
- `selected.run_plan` carries `command`/`env`/`cwd` and is always present. `selected.execution_plan` (`argv`/`env`/`cwd`) is optional: trusted-list and manifest candidates omit it. Read it as optional and use `shell_command` for the command to run.
- `/go/...` are alias routes for bookmarkable resolve URLs — `GET /api/v1/run/go/{rest}` (selector parsed from path segments) and `GET /api/v1/run/t/{terminal_id}/go/{rest}` (terminal id baked into the path prefix, where it wins over any other `terminal_id`). Both are public HTTP routes, but neither has an SDK method: programmatic callers use the resolve endpoint from the first bullet. The CLI reaches only the first, as `hoody run resolve <path>`; `--terminal-id N` sends `terminal_id=N` as a query parameter on that same route.
- CLI: `hoody run <app>` resolves an app to a command (e.g. `hoody run firefox`). Bare `run` PRINTS the command on stdout (context — `title · provider · kind · score`, viewer URLs, warnings — on stderr) and launches nothing; the run kit stays a pure resolver.
- CLI `--open`: after resolving, the CLI opens the app in a fresh terminal N (and display N) of the computer via the terminal kit — N is the first free id from 8001 up to 9999 — runs it there as a tracked detached `POST /api/v1/terminal/execute` (`wait:false`), watches it start for `--wait` seconds (default 30) and prints a state line and a handle `N:<incarnation>:<command_id>`; the run kit still never executes. Stop it with `hoody run close <handle|N>`, check it with `hoody run status <handle|N>`. `--open` needs a single pick: use `--pick first` (the default) or `--pick id --candidate-id <id>`; `--pick ask` and `--pick index` are refused with `--open` (exit 2). In non-JSON `--open` output, a primary viewer URL goes to stdout when the state is `started`, `running` or `ready` and a URL is available: the display URL for an app that opens in a window, the web URL for a ready web app (such as the `jupyterlab` starter; also printed as a `web:` line), or the terminal URL otherwise; the terminal URL is also the fallback when the preferred URL cannot be built. An OCI image opens in a terminal.
- CLI viewer URLs: without `--open`, a `kind:'gui'` result surfaces BOTH a display URL (where it renders) and a terminal URL, and any other kind the terminal URL only; the resolver's `handoff.preview_*_url` is used when set and the URL built from the computer's kit routing (`display-{n}` / `terminal-{n}`) is the fallback. With `--open` the URLs follow the launch's `opens_in` surface, not the candidate's `kind`: they are built for the launch's own terminal N, plus display N for an app that opens in a window and the app's web address for one that opens on the web, not taken from the resolver's handoff. Without `--open`, a non-`gui` result never gets a display URL, even when the resolver set `preview_display_url`.
- CLI `--browser`: with `--open`, also opens the primary viewer URL in the local browser (implies `--open`; falls back to printing the URL when headless).

## Common errors

Every error body is `{ "error": "<text>", "code": "<code>", "status": <HTTP status> }`. Match on the symbolic `code` and the HTTP `status`; a batch error item carries the same payload under `error`.

- `400 INVALID_PICK` (`pick_index required`, `pick_index out of range: <N>`, `candidate_id required`, `candidate_id not found`) or `400 NO_CANDIDATES` (`no candidates`): the pick does not match the candidate set.
- `400 INVALID_SELECTOR: invalid <field>: <value>`: a query-string selector value is not accepted, for example an unknown `source`.
- `400 INVALID_BODY` with a deserialization message: a JSON body carries a value that is not in the field's enum (for example `"kind":"create"`), misses a required field or has a wrongly typed one.
- `409 SET_EXPIRED`: an index pick (`pick_index`) names a `set_id` that is unknown or older than 300 s and is not the freshly resolved set; search again and pick against the new `set_id`. An id pick (`candidate_id`) does not get this error: it falls back to the fresh set, since `candidate_id` is content-addressed.
- `403 POLICY_DENIED: …`: the effective policy does not permit the selected candidate.
- `409 CURSOR_SET_EXPIRED` (`cursor set expired`): `search/paged` only; start again without a cursor.
- A single source such as `nix` or `pkgx` that fails or is missing does not fail the request: the search continues with the other sources and can return an empty list (a pick against it then gives `400 NO_CANDIDATES`). An error the source reports is recorded in its diagnostics (`GET /api/v1/run/sources/{source_id}/diagnostics`), and can also appear in the response `warnings`, for example as `SOURCE_FAILED` for a source error or `SOURCE_TIMEOUT` for a source timeout. A missing pkgx tool is treated as an empty successful result, so it produces no warning and the diagnostics can show no error. `502 SOURCE_RESOLUTION_FAILED` is reserved for a resolution that fails as a whole.
- `404 JOB_NOT_FOUND` (`job not found`): the job id is unknown or its TTL ran out (see example 7).

## Related namespaces

- `terminal` — run a known command / interactive shell. `exec` — one-shot remote exec. `daemon` — supervised process. `display` — GUI X11.

## Examples

Each example below has a copy-pasteable code block in the mode you're reading (curl for HTTP, TypeScript for SDK, or the CLI). Set `P`, `C`, `N` (project id, computer id, server name) from `hoody computers get` first. These examples reflect the resolve/preview contract — re-verify against a live `run-1` kit before relying on exact response shapes.

### 1. Resolve `firefox` to a shell command — search, then pick the top hit

**Goal:** turn the user's typed `firefox` into a runnable shell command. When no profile sets a default, an omitted `pick` returns the candidates without selecting one; send `pick:"ask"` explicitly to be sure nothing is selected. The bare `hoody run <app>` CLI defaults to `--pick first` instead; pass `--pick ask` to keep the selection pending.

**Step 1 — resolve to a command.** `hoody run firefox` resolves with `--pick first`, which picks from a freshly resolved list. To pin a list you displayed, run `hoody run search --app firefox` and then `hoody run resolve --app firefox --set-id <set_id> --pick index --pick-index 0`.

```bash
# Print the command (resolver only — nothing runs):
hoody run firefox -c "$C"
# → 'nix' '--extra-experimental-features' 'nix-command' '--extra-experimental-features' 'flakes' 'run' 'nixpkgs#firefox' '--'
#   (illustrative, the starter catalogue's entry; stdout; title/provider/kind/score + viewer URLs on stderr)

# Launch it in the computer (detached) and print the viewer URLs.
# firefox is a GUI app, so you get BOTH a display URL and a terminal URL:
hoody run firefox -c "$C" --open
# It opens in a fresh terminal and display numbered from 8001 (the first free id);
# the state line varies (starting, running, ready, ...):
#   Firefox · registry · gui
#   command: 'nix' '--extra-experimental-features' 'nix-command' '--extra-experimental-features' 'flakes' 'run' 'nixpkgs#firefox' '--'
#   Firefox is starting…
#   display:  https://<P>-<C>-display-8001.<N>.computers.hoody.com/     (stderr)
#   terminal: https://<P>-<C>-terminal-8001.<N>.computers.hoody.com/    (stderr)
#   handle:   8001:<incarnation>:<command_id>   stop it with: hoody run close 8001:<incarnation>:<command_id>
# → https://<P>-<C>-display-8001.<N>.computers.hoody.com/               (stdout: primary viewer)

# Check or stop it later (the handle or just the terminal number):
hoody run status 8001 -c "$C"
hoody run close 8001 -c "$C"

# Launch AND open the display in your local browser:
hoody run firefox -c "$C" --browser
```

### 2. Resolve to a command and read the execution plan

**Goal:** get the exact command plus its structured plan. Lightweight CLI app (`echo`) used so we don't leak GUI state.

The response carries `shell_command` plus the full selected entry: `run_plan.{command,env,cwd}` (the shell-form, always present) and, when the source provides one, `execution_plan.{argv,env,cwd}` (the argv-form; trusted-list and manifest candidates have none). `shell_command` is the command to run either way. A picked response also carries `handoff`; its `preview_display_url` / `preview_terminal_url` are built for the target, not from the candidate (from an operator URL template when one is set, else from the computer's own kit host for `display` and `terminal_id`), and either is absent when it cannot be built. Resolve itself never launches anything.

```bash
hoody --computer "$C" run resolve --app echo --kind cli --pick first -o json \
  | jq '{status, shell_command, argv: .selected.execution_plan.argv, preview_terminal_url: .handoff.preview_terminal_url}'
```

### 3. Pick a non-default candidate by index when multiple match

**Goal:** `git` matches several candidates and you want one other than the first (say the `pkgx` one). Positions depend on source priority and on which sources are available, so list the candidates, find the index of the one you want, and bind the pick to the `set_id` so the list cannot shift under you. The examples below use index 2; use the index you actually found.

**Step 1 — list candidates with `set_id`.**

```bash
hoody --computer "$C" run search --app git --kind cli --page-size 5 -o json \
  | jq '{set_id, listing: (.items | to_entries | map({i: .key, id: .value.candidate_id, provider: .value.provider, score: .value.score}))}'
```

**Step 2 — pick by index against the captured `set_id`.** Out-of-range raises `400 pick_index out of range: <N>`.

```bash
SET="<paste set_id from step 1>"
hoody --computer "$C" run resolve --app git --kind cli --set-id "$SET" --pick index --pick-index 2 -o json \
  | jq '{shell_command, picked: .selected.candidate_id, provider: .selected.provider}'
```

**Pick by id alternative** — use `pick: 'id'` + `candidate_id`, copying the exact `candidate_id` from the step 1 response. It is a content hash, so never build one from the provider or the executable path.

```bash
CID="<paste candidate_id from step 1>"
hoody --computer "$C" run resolve --app git --kind cli --set-id "$SET" --pick id --candidate-id "$CID" -o json | jq .shell_command
```

### 4. Filter by os / arch / kind / source / tags

**Goal:** restrict a search to one source (here the system PATH) so the nix/pkgx/appimage tails are skipped. Useful when you don't want long resolver tails.

`source` is repeatable on `GET` (`source=system&source=registry`); it's an array on the JSON body. Empty / absent → the profile's default sources if a profile sets them, otherwise no filter; `source:["any"]` always means no source filter. `kind`, `os` and `arch` are passed to each source, which applies them only as far as its metadata allows (see Quirks).

```bash
# --source is repeatable (or comma-separated): --source system --source registry
hoody --computer "$C" run search --app jq --os linux --arch amd64 --kind cli --source system --page-size 5 -o json \
  | jq '{count: (.items|length), providers: [.items[].provider]}'
```

**Tags** are accepted and passed to sources and recipe templates, but the kit does not use them to rank or filter candidates, so do not rely on them to narrow a search. Filtering by `kind: 'gui'` or `os: 'windows'` (Wine-runnable variants) is up to each source: system-path ignores both; nix ignores `kind`; npm and PyPI ignore `kind` and report every candidate as `kind: cli`; the starter catalogue keeps only the requested `gui` or `cli` kind; trusted-list and manifest entries are filtered on the fields they declare; and the starter catalogue, nix, pkgx, OCI, AppImage, npm and PyPI return no candidates at all for a Windows `os`. `arch` is applied only by the AppImage sources, which use it to pick a release asset; every other source, including system-path, ignores it, so it does not narrow their results.

### 5. Preflight before resolving — check requirements + policy

**Goal:** before resolving a GUI app, learn whether the kit thinks it'll succeed. `preflight` returns `recommended_mode`, `missing_requirements`, and the `effective_policy` (verify, integrity, deny-lists).

```bash
hoody --computer "$C" run test --app xeyes --kind gui --pick first -o json \
  | jq '{recommended_mode, missing_requirements, policy: .effective_policy}'
```

### 6. Pagination — walk a long candidate list with `search`

**Goal:** the `git` query returns many candidates across providers. Fetch them in pages of 3 without re-running expensive nix/pkgx queries.

`POST /api/v1/run/search/paged` returns `{ set_id, total_count, items, next_cursor }`. (Note: response field is `items`, not `candidates`.) Pass `next_cursor` back to get the next page; bound to the original `set_id` and its cached candidates. Each page re-applies the current effective policy to that cached set, so a page can hold fewer items than `page_size` and `total_count` can change between pages. The cursor's position does not shift: it is a position in the unfiltered cached set. A cursor sent with a different selector is refused with `400 INVALID_CURSOR`.

**Step 1 — first page.**

```bash
RESP=$(hoody --computer "$C" run search --app git --kind cli --page-size 3 -o json)
echo "$RESP" | jq '{total_count, count: (.items|length), next_cursor}'
CURSOR=$(echo "$RESP" | jq -r .next_cursor)
```

**Step 2 — fetch all pages.** The `search/paged` endpoint returns one page per call; carry `next_cursor` between calls until it's null/absent.

```bash
while [ -n "$CURSOR" ] && [ "$CURSOR" != "null" ]; do
  RESP=$(hoody --computer "$C" run search --app git --kind cli --page-size 3 --cursor "$CURSOR" -o json)
  echo "$RESP" | jq '.items | length'
  CURSOR=$(echo "$RESP" | jq -r .next_cursor)
done
```

Warning: `409 CURSOR_SET_EXPIRED` means the snapshot behind the cursor is gone (it lives about 300s from the last search that stored it, and the kit keeps at most 16 per `set_id`). Search again without a cursor and page from that answer; its `set_id` is the same when the candidates are unchanged.

### 7. Async search via job queue — for slow nix/pkgx queries

**Goal:** searching `firefox` across nixpkgs can take 15+s synchronously. Submit as a job, do other work, fetch result later.

Warning: `POST /api/v1/run/search/jobs` body is a **flat Selector** (NOT `{selector: ...}` like `search/paged`) — the wrapped form is refused with `400 INVALID_BODY` (missing field `app`).

**Step 1 — submit.**

```bash
JID=$(hoody --computer "$C" run jobs search start --app firefox --kind any -o json | jq -r .job_id)
```

**Step 2 — wait for the result.** Status transitions `queued → running → done`, or ends in `error`, or in `cancelled` after a cancel request; all three are final, so stop polling on any of them. The job's TTL restarts only when its state changes, not when it is read, so polling does not keep a finished job alive; a caller that comes back too late gets `404 JOB_NOT_FOUND`. Long-poll with `wait=done` and `timeout_ms` (max 120000) so the call returns as soon as the job finishes, and read the result from that response.

```bash
# Keep --timeout-ms below the CLI's default 30 s request timeout.
hoody --computer "$C" run jobs get "$JID" --wait done --timeout-ms 25000 -o json | jq '{status, result}'
# Repeat while status is still queued or running.
```

### 8. Batch — resolve N apps in a single round-trip

**Goal:** the agent decided on three apps at once (`ls`, `echo`, `git`); resolve all to commands without three separate HTTP hits.

`POST /api/v1/run/batch` (HTTP only; no CLI command) accepts items with `mode: 'search' | 'run'` (NOT `'preflight'`). Each item has its own `request_id` for correlation; results come back in the same order with one of `result: 'search'` (full search response), `result: 'run'` (a resolve response, including `selected` and `shell_command` when a candidate is successfully picked) or `result: 'error'` (with `error: { error, code, status }` for that item only; the rest of the batch still runs).
The CLI has no batch command. POST `{ items: [...] }` to `/api/v1/run/batch` with curl against the kit URL, or run `hoody run resolve` once per app.

### 9. Save a recipe — reusable selector template with override allow-list

**Goal:** the team often resolves "give me a JS runtime" with a fixed set of filters. Save it once as a recipe; teammates run it by name and only override approved fields.

**Step 1 — create.** `allowed_overrides` is a whitelist; a recipe template field set under `overrides` that is outside it is rejected with `400 "recipe override not allowed: <field>"` on `hoody run recipes resolve` — update the recipe to widen the allow-list. A key that is not a recipe template field (an unknown key, or `enrich`, `args`, `pass_env`, `launch_tag`, `launch_env`) is ignored, not rejected.

```bash
hoody --computer "$C" run recipes create --name team-js-runtime \
  --description 'Resolve a JS runtime; team-default = node CLI' \
  --app node --kind cli \
  --os linux --arch amd64 --pick first \
  --allowed-overrides app,version,tags
```

**Step 2 — list / get / update / delete.**

```bash
hoody --computer "$C" run recipes list
hoody --computer "$C" run recipes get team-js-runtime -o json
hoody --computer "$C" run recipes update team-js-runtime --description 'Updated: now also resolves bun/deno via override'
# After example 10 (it uses this recipe):
# hoody --computer "$C" run recipes delete team-js-runtime -y
```

### 10. Invoke a recipe with overrides — `hoody run recipes resolve <name>`

**Goal:** teammate uses the `team-js-runtime` recipe but wants `bun` instead of the default `node`. They override only the allow-listed `app` field; other selector fields stay locked.

**Step 1 — run with overrides.** Returns the same envelope as `resolve` (`{ status, shell_command, selected, ... }`).

```bash
hoody --computer "$C" run recipes resolve team-js-runtime --app bun -o json \
  | jq '{status, shell_command, picked: .selected.candidate_id}'
```

**Step 2 — search through the recipe** (same selector, but stop at candidate listing instead of resolving) via `hoody run recipes search`:

```bash
hoody --computer "$C" run recipes search team-js-runtime --app node -o json \
  | jq '{set_id, count: (.candidates|length), providers: [.candidates[].provider] | unique}'
```

Warning: A recipe template field set under `overrides` outside `allowed_overrides` is **rejected** with `400 "recipe override not allowed: <field>"`, not silently dropped; a key that is not a recipe template field (an unknown key, or `enrich`, `args`, `pass_env`, `launch_tag`, `launch_env`) is ignored, so spell field names exactly. Use `hoody run recipes update` to widen the allow-list.

## Reference

### `hoody run` (32) — Application resolution across multiple package sources (Hoody Run)

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody run close` |  | destructive | Stop an app opened with `hoody run <app> --open` and close its terminal | `run.close` | `hoody run close 15001` |
| `hoody run config get` |  | read | Show the stored configuration: sources, profiles and the active profile | `run.kit.getConfig` | `hoody run config get` |
| `hoody run health` |  | read | Check hoody-run service health |  | `hoody run health` |
| `hoody run jobs cancel` |  | action | Cancel a queued or running search job | `run.jobs.cancel` | `hoody run jobs cancel abc-123` |
| `hoody run jobs get` |  | read | Get the status of a job | `run.jobs.get` | `hoody run jobs get abc-123 --timeout-ms 0` |
| `hoody run jobs list` |  | read | List the background jobs the service still holds, newest first | `run.jobs.list` | `hoody run jobs list --kind search-resolve --status queued` |
| `hoody run jobs search start` |  | action | Start a background search job and return its handle | `run.jobs.startSearch` | `hoody run jobs search start --app firefox --os linux --kind gui` |
| `hoody run open` |  | action | Open the Run kit results page for an app in your browser |  | `hoody run open --app APP` |
| `hoody run profiles create` |  | write | Create a profile | `run.profiles.create` | `hoody run profiles create --name demo-profile --description 'Default profile (inherits global sources)' --defaults-os linux` |
| `hoody run profiles delete` |  | destructive | Delete a profile | `run.profiles.delete` | `hoody run profiles delete demo-profile -y` |
| `hoody run profiles list` |  | read | List profiles | `run.profiles.list` | `hoody run profiles list --watch 2s` |
| `hoody run profiles update` |  | write | Update a profile | `run.profiles.update` | `hoody run profiles update demo-profile --description 'Default profile (inherits global sources)' --defaults-os linux` |
| `hoody run profiles use` |  | write | Make a profile the active one | `run.profiles.use` | `hoody run profiles use demo-profile` |
| `hoody run recipes create` |  | write | Save a launch recipe | `run.recipes.create` | `hoody run recipes create --name my-resource --description 'My description' --app firefox` |
| `hoody run recipes delete` |  | destructive | Delete a saved recipe | `run.recipes.delete` | `hoody run recipes delete my-resource -y` |
| `hoody run recipes get` |  | read | Show a saved recipe | `run.recipes.get` | `hoody run recipes get my-resource` |
| `hoody run recipes list` |  | read | List saved launch recipes | `run.recipes.list` | `hoody run recipes list --watch 2s` |
| `hoody run recipes resolve` |  | action | Resolve a saved recipe to a shell command | `run.recipes.resolve` | `hoody run recipes resolve my-resource` |
| `hoody run recipes search` |  | read | Search candidates using a saved recipe | `run.recipes.search` | `hoody run recipes search my-resource` |
| `hoody run recipes update` |  | write | Update a saved recipe | `run.recipes.update` | `hoody run recipes update my-resource --description 'My description' --app firefox` |
| `hoody run resolve` |  | action | Resolve an app to an exact shell command | `run.resolve` | `hoody run resolve --app firefox --os linux --kind gui` |
| `hoody run resolve` |  | action | Resolve an app by path to an exact shell command |  | `hoody run resolve <path> --os linux --kind gui` |
| `hoody run search` |  | read | Search candidates page by page with a cursor | `run.search` | `hoody run search --app firefox --os linux --kind gui` |
| `hoody run sources create` |  | write | Add a package source | `run.sources.create` | `hoody run sources create --source-id demo-nix --enabled --priority 100 --provider nix --source-type nix-pkgs --pin-url https://example.com --source-config flake=nixpkgs` |
| `hoody run sources delete` |  | destructive | Remove a package source | `run.sources.delete` | `hoody run sources delete abc-123 -y` |
| `hoody run sources diagnostics get` |  | read | Show runtime health for a source: last error, last search latency, last sync job | `run.sources.getDiagnostics` | `hoody run sources diagnostics get abc-123` |
| `hoody run sources list` |  | read | List configured package sources | `run.sources.list` | `hoody run sources list --watch 2s` |
| `hoody run sources sync` |  | action | Sync one source and return the job | `run.sources.sync` | `hoody run sources sync abc-123` |
| `hoody run sources sync` |  | action | Sync every source and return the job | `run.sources.syncAll` | `hoody run sources sync` |
| `hoody run sources update` |  | write | Update a package source | `run.sources.update` | `hoody run sources update abc-123 --enabled --priority 100` |
| `hoody run status` |  | read | Show whether an app opened with `hoody run <app> --open` is starting, running, ready or gone | `run.getStatus` | `hoody run status 15001` |
| `hoody run test` |  | read | Plan a run and show the command, missing requirements and effective policy | `run.test` | `hoody run test --app firefox --os linux --kind gui` |

