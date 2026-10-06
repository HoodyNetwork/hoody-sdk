> _**CLI skill · `run` namespace** · ~6,829 tokens · hoody-sdk v1.0.0-beta.15_

# `run` — resolve apps to shell commands

## Purpose

Hoody Run — HTTP resolver across package sources (trusted-list, system-path, nixpkgs, pkgx, AppImage, OCI, manifests). Returns ranked candidates (each carrying a `kind`) or a resolved `shell_command`. Resolve produces a command plus a preview; it never launches the app itself.

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

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Search then pick

1. `hoody run search` → `{ set_id, total_count, items[], next_cursor? }`.
2. `hoody run resolve ...` → `shell_command`.

### 2. Preflight

1. `hoody run test` → `recommended_mode`, `missing_requirements`, `effective_policy`.
2. `hoody run resolve` → resolved command + preview.

### 3. Cursor-paged search

`hoody run search` → `{ set_id, total_count, items, next_cursor }` (note `items`, not `candidates`). The cursor-paged endpoint returns one page per call; carry `next_cursor` forward until it's null/absent.

### 4. Batch

`POST /api/v1/run/batch` (HTTP only; no CLI command). `mode:"run"` resolves each item to a command. Each result item is `result: "search"`, `"run"` or `"error"` (the item's own `{ error, code }`), so one bad item does not fail the batch. The CLI has no batch command; POST the route with curl against the kit URL, or resolve the apps one by one with `hoody run resolve`.

### 5. Recipes

`hoody run recipes create` with `{ name, selector_template, allowed_overrides }`; invoke it with `hoody run recipes resolve`, passing only the allow-listed fields under `overrides`.

## Quirks & gotchas

- Kit slug/URL/HTTP prefix all `run`. The resolve endpoint answers both `GET /api/v1/run/resolve` (selector in the query string) and `POST /api/v1/run/resolve` (selector as a JSON body). CLI: `hoody run resolve` (POST form), or the bare `hoody run <app>`.
- Every candidate carries a `kind` — `gui` | `cli` | `any` (`any` means the source doesn't classify it). `kind` and `os` in the selector are applied by each source from its own metadata, not by a final filter: system-path results ignore them (and report `kind: any`), nix lets packages it cannot classify through, trusted-list and manifest entries are filtered only when they declare the field, and the nix, pkgx, OCI and AppImage sources return nothing at all for a non-Linux `os` such as `windows`. Inspect the selected candidate and its command before treating it as GUI, CLI or Windows-compatible.
- Omitted selector fields inherit the requested `profile`, or else the kit's selected profile (`os`, `kind`, `source`, `pick`, `terminal_id`, `display`, `limit`). With no profile default, `limit` defaults to 25, clamped 1..=100.
- Candidates are ordered by source priority first (the trusted list outranks system-path and the package sources), then score, then title and id, so the top hit is not always the highest score. Read the returned list and use the actual index or `candidate_id`.
- `candidate_id` is a content hash the kit computes over what the candidate runs, not a readable `<provider>:<path>` string. Copy it from a search response; never build one by hand.
- Query results are cached for about 30 s.
- `set_id` expires 300s.
- Selector requires `app`. Aliases `q`/`name` are accepted ONLY by the urlencoded query-string parser (GET / form-style); the JSON `Selector` model has only `app`, so JSON POST / SDK calls must use `app:`.
- Resolve is command-only; the kit never launches the app or executes anything. The response `status` is `"dry-run"` (one picked candidate), `"printed-curl"` (one picked candidate, plus a `curl` line because `print_curl` was set) or `"resolved"` (pick mode `ask`: the candidate set, nothing selected). Only a picked response carries `handoff` (`{ state: "preview", terminal_id, display, preview_display_url?, preview_terminal_url? }`); a `resolved` response has none. The two preview URLs are built from the kit's configured URL templates for the target `terminal_id`, not from the candidate, so they are absent when no template is configured and do not prove anything is running.
- `POST /api/v1/run/batch` (HTTP only; no CLI command) only knows `mode: "search" | "run"` (no `"preflight"`); `"run"` resolves to a command.
- `hoody run recipes resolve` / `hoody run recipes search` reject a recognized selector field outside `allowed_overrides` with `400 "recipe override not allowed: <field>"`; it is not silently dropped. An unknown key under `overrides` is ignored, so spell the selector field names exactly.
- **Outbound requests the kit makes itself (webhook delivery, remote manifest index fetches, source fetches) go only to public IPv4 addresses.** Private, loopback, link-local, CGNAT, reserved and multicast destinations and every IPv6 form are refused, and a name that resolves to ANY prohibited IPv4 address is refused whole; no setting admits one, so a remote index URL on `localhost` or a sibling container's private address cannot work. Webhooks are configured in the kit's config file only (`GET /api/v1/run/config` is read-only), so this matters mainly when diagnosing a source sync or a webhook someone set up. A refusal carries the marker `refusing to connect to` and is not retried; `the name <host> resolved to no address` carries no marker and is a transient failure. Proxy environment variables are ignored; webhook and remote-index fetches follow no redirects, and source fetches follow at most ten. Helper binaries a provider shells out to (`nix search`) are outside this guarantee.
- `selected.run_plan` carries `command`/`env`/`cwd` and is always present. `selected.execution_plan` (`argv`/`env`/`cwd`) is optional: trusted-list, manifest and AppImage candidates omit it. Read it as optional and use `shell_command` for the command to run.
- `/go/...` are alias routes for bookmarkable resolve URLs — `GET /api/v1/run/go/{rest}` (selector parsed from path segments) and `GET /api/v1/run/t/{terminal_id}/go/{rest}` (terminal id baked into the path prefix, where it wins over any other `terminal_id`). Both are public HTTP routes, but neither has an SDK method: programmatic callers use the resolve endpoint from the first bullet. The CLI reaches only the first, as `hoody run resolve <path>`; `--terminal-id N` sends `terminal_id=N` as a query parameter on that same route.
- CLI: `hoody run <app>` resolves an app to a command (e.g. `hoody run firefox`). Bare `run` PRINTS the command on stdout (context — `title · provider · kind · score`, viewer URLs, warnings — on stderr) and launches nothing; the run kit stays a pure resolver.
- CLI `--open`: after resolving, the CLI executes the command in the container for you (via the terminal kit's `POST /api/v1/terminal/execute`, detached with `wait:false`) — the run kit still never executes. `--open` needs a single pick, so it can't combine with `--pick ask` (or an unpicked candidate set); use `--pick first|id|index`. In `--open` mode the PRIMARY viewer URL goes to stdout (display URL for a GUI app, terminal URL for a CLI app).
- CLI GUI apps: a `kind:'gui'` result is launched with `DISPLAY` pointed at the handoff's display and surfaces BOTH a display URL (where it renders) and a terminal URL; a `kind:'cli'` result surfaces the terminal URL. Without `--open`, the resolver's `handoff.preview_*_url` is used when set and the URL built from the container's kit routing (`display-{n}` / `terminal-{n}`) is the fallback. With `--open` the order is reversed: the built kit URL first, the preview URL as the fallback. A CLI app never gets a display URL, even when the resolver set `preview_display_url`.
- CLI `--browser`: with `--open`, also opens the primary viewer URL in the local browser (implies `--open`; falls back to printing the URL when headless).

## Common errors

Every error body is `{ "error": "<text>", "code": <HTTP status> }`. There is no symbolic error-code field, so match on the status and the start of the text.

- `400` `pick_index required`, `pick_index out of range: <N>`, `candidate_id required`, `candidate_id not found` or `no candidates`: the pick does not match the candidate set.
- `400 INVALID_SELECTOR: invalid <field>: <value>`: a query-string selector value is not accepted, for example an unknown `source`.
- `422` with a deserialization message: a JSON body carries a value that is not in the field's enum (for example `"kind":"create"`), in the same `{error, code}` body.
- `409 SET_EXPIRED: …`: the `set_id` is unknown or older than 300 s; search again and pick against the new `set_id`.
- `403 POLICY_DENIED: …`: the effective policy does not permit the selected candidate.
- `409 cursor set expired`: `search/paged` only; start again without a cursor.
- A single source such as `nix` or `pkgx` that fails or is missing does not fail the request: the search continues with the other sources and can return an empty list (a pick against it then gives `400 no candidates`). An error the source reports is recorded in its diagnostics (`GET /api/v1/run/sources/{source_id}/diagnostics`), but some sources, `pkgx` among them, turn a missing tool or a failed query into an empty successful result, so the diagnostics can show no error at all. `502` is reserved for a resolution that fails as a whole.
- `404 job not found`: the job id is unknown or its TTL ran out (see example 7).

## Related namespaces

- `terminal` — run a known command / interactive shell. `exec` — one-shot remote exec. `daemon` — supervised process. `display` — GUI X11.

## Examples

Each example below has a copy-pasteable code block in the mode you're reading (curl for HTTP, TypeScript for SDK, or the CLI). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. These examples reflect the resolve/preview contract — re-verify against a live `run-1` kit before relying on exact response shapes.

### 1. Resolve `firefox` to a shell command — search, then pick the top hit

**Goal:** turn the user's typed `firefox` into a runnable shell command. When no profile sets a default, an omitted `pick` returns the candidates without selecting one; send `pick:"ask"` explicitly to be sure nothing is selected. The bare `hoody run <app>` CLI defaults to `--pick first` instead; pass `--pick ask` to keep the selection pending.

**Step 1 — resolve to a command.** `hoody run firefox` resolves with `--pick first`, which picks from a freshly resolved list. To pin a list you displayed, run `hoody run search --selector-app firefox` and then `hoody run resolve --app firefox --set-id <set_id> --pick index --pick-index 0`.

```bash
# Print the command (resolver only — nothing runs):
hoody run firefox -c "$C"
# → nix run nixpkgs#firefox        (stdout; title/provider/kind/score + viewer URLs on stderr)

# Launch it in the container (detached) and print the viewer URLs.
# firefox is a GUI app, so you get BOTH a display URL and a terminal URL:
hoody run firefox -c "$C" --open
#   Firefox · registry · gui · score 337
#   command: nix run nixpkgs#firefox
#   launched (detached) in terminal 1 on display :1.
#   display:  https://<P>-<C>-display-1.<N>.containers.hoody.com/     (stderr)
#   terminal: https://<P>-<C>-terminal-1.<N>.containers.hoody.com/    (stderr)
# → https://<P>-<C>-display-1.<N>.containers.hoody.com/               (stdout: primary viewer)

# Launch AND open the display in your local browser:
hoody run firefox -c "$C" --browser
```

### 2. Resolve to a command and read the execution plan

**Goal:** get the exact command plus its structured plan. Lightweight CLI app (`echo`) used so we don't leak GUI state.

The response carries `shell_command` plus the full selected entry: `run_plan.{command,env,cwd}` (the shell-form, always present) and, when the source provides one, `execution_plan.{argv,env,cwd}` (the argv-form; trusted-list, manifest and AppImage candidates have none). `shell_command` is the command to run either way. A picked response also carries `handoff`; its `preview_display_url` / `preview_terminal_url` are present only when the kit's URL templates are configured, and they are built for the target terminal, not from the candidate. Resolve itself never launches anything.

```bash
hoody --container "$C" run resolve --app echo --kind cli --pick first -o json \
  | jq '{status, shell_command, argv: .selected.execution_plan.argv, preview_terminal_url: .handoff.preview_terminal_url}'
```

### 3. Pick a non-default candidate by index when multiple match

**Goal:** `git` matches several candidates and you want one other than the first (say the `pkgx` one). Positions depend on source priority and on which sources are available, so list the candidates, find the index of the one you want, and bind the pick to the `set_id` so the list cannot shift under you. The examples below use index 2; use the index you actually found.

**Step 1 — list candidates with `set_id`.**

```bash
hoody --container "$C" run search --selector-app git --selector-kind cli --selector-limit 5 -o json \
  | jq '{set_id, listing: (.items | to_entries | map({i: .key, id: .value.candidate_id, provider: .value.provider, score: .value.score}))}'
```

**Step 2 — pick by index against the captured `set_id`.** Out-of-range raises `400 pick_index out of range: <N>`.

```bash
SET="<paste set_id from step 1>"
hoody --container "$C" run resolve --app git --kind cli --set-id "$SET" --pick index --pick-index 2 -o json \
  | jq '{shell_command, picked: .selected.candidate_id, provider: .selected.provider}'
```

**Pick by id alternative** — use `pick: 'id'` + `candidate_id`, copying the exact `candidate_id` from the step 1 response. It is a content hash, so never build one from the provider or the executable path.

```bash
CID="<paste candidate_id from step 1>"
hoody --container "$C" run resolve --app git --kind cli --set-id "$SET" --pick id --candidate-id "$CID" -o json | jq .shell_command
```

### 4. Filter by os / arch / kind / source / tags

**Goal:** narrow candidates to Linux x86_64 CLI tools sourced only from the system PATH (skip `nix`/`pkgx`/`appimage`). Useful when you don't want long resolver tails.

`source` is repeatable on `GET` (`source=system&source=registry`); it's an array on the JSON body. Empty / absent → the profile's default sources if a profile sets them, otherwise no filter; `source:["any"]` always means no source filter. `kind`, `os` and `arch` are passed to each source, which applies them only as far as its metadata allows (see Quirks).

```bash
# --selector-source is repeatable (or comma-separated): --selector-source system --selector-source registry
hoody --container "$C" run search --selector-app jq --selector-os linux --selector-arch amd64 --selector-kind cli --selector-source system --selector-limit 5 -o json \
  | jq '{count: (.items|length), providers: [.items[].provider]}'
```

**Tags** are accepted and passed to sources and recipe templates, but the kit does not use them to rank or filter candidates, so do not rely on them to narrow a search. Filtering by `kind: 'gui'` or `os: 'windows'` (Wine-runnable variants) is up to each source: system-path ignores both, trusted-list and manifest entries are filtered on the fields they declare, and nix, pkgx, OCI and AppImage return no candidates at all for a Windows `os`, even though their candidates carry no kind classification.

### 5. Preflight before resolving — check requirements + policy

**Goal:** before resolving a GUI app, learn whether the kit thinks it'll succeed. `preflight` returns `recommended_mode`, `missing_requirements`, and the `effective_policy` (verify, integrity, deny-lists).

```bash
hoody --container "$C" run test --app xeyes --kind gui --pick first -o json \
  | jq '{recommended_mode, missing_requirements, policy: .effective_policy}'
```

### 6. Pagination — walk a long candidate list with `search`

**Goal:** the `git` query returns many candidates across providers. Fetch them in pages of 3 without re-running expensive nix/pkgx queries.

`POST /api/v1/run/search/paged` returns `{ set_id, total_count, items, next_cursor }`. (Note: response field is `items`, not `candidates`.) Pass `next_cursor` back to get the next page; bound to the original `set_id` so the candidate set is stable.

**Step 1 — first page.**

```bash
RESP=$(hoody --container "$C" run search --selector-app git --selector-kind cli --page-size 3 -o json)
echo "$RESP" | jq '{total_count, count: (.items|length), next_cursor}'
CURSOR=$(echo "$RESP" | jq -r .next_cursor)
```

**Step 2 — fetch all pages.** The `search/paged` endpoint returns one page per call; carry `next_cursor` between calls until it's null/absent.

```bash
while [ -n "$CURSOR" ] && [ "$CURSOR" != "null" ]; do
  RESP=$(hoody --container "$C" run search --selector-app git --selector-kind cli --page-size 3 --cursor "$CURSOR" -o json)
  echo "$RESP" | jq '.items | length'
  CURSOR=$(echo "$RESP" | jq -r .next_cursor)
done
```

⚠ `409 cursor set expired` after ~300s — re-run the initial search with `selector` (no cursor) to get a fresh `set_id`.

### 7. Async search via job queue — for slow nix/pkgx queries

**Goal:** searching `firefox` across nixpkgs can take 15+s synchronously. Submit as a job, do other work, fetch result later.

⚠ `POST /api/v1/run/search/jobs` body is a **flat Selector** (NOT `{selector: ...}` like `search/paged`) — the wrapped form returns `Failed to deserialize ... missing field 'app'`.

**Step 1 — submit.**

```bash
JID=$(hoody --container "$C" run jobs search create --app firefox --kind any -o json | jq -r .job_id)
```

**Step 2 — wait for the result.** Status transitions `queued → running → done`, or ends in `error`, or in `cancelled` after a cancel request; all three are final, so stop polling on any of them. The job's TTL restarts only when its state changes, not when it is read, so polling does not keep a finished job alive; a caller that comes back too late gets `404 job not found`. Long-poll with `wait=done` and `timeout_ms` (max 120000) so the call returns as soon as the job finishes, and read the result from that response.

```bash
# Keep --timeout-ms below the CLI's default 30 s request timeout.
hoody --container "$C" run jobs get "$JID" --wait done --timeout-ms 25000 -o json | jq '{status, result}'
# Repeat while status is still queued or running.
```

### 8. Batch — resolve N apps in a single round-trip

**Goal:** the agent decided on three apps at once (`ls`, `echo`, `git`); resolve all to commands without three separate HTTP hits.

`POST /api/v1/run/batch` (HTTP only; no CLI command) accepts items with `mode: 'search' | 'run'` (NOT `'preflight'`). Each item has its own `request_id` for correlation; results come back in the same order with one of `result: 'search'` (full search response), `result: 'run'` (with `selected` + `shell_command`) or `result: 'error'` (with `error: { error, code }` for that item only; the rest of the batch still runs).
The CLI has no batch command. POST `{ items: [...] }` to `/api/v1/run/batch` with curl against the kit URL, or run `hoody run resolve` once per app.

### 9. Save a recipe — reusable selector template with override allow-list

**Goal:** the team often resolves "give me a JS runtime" with a fixed set of filters. Save it once as a recipe; teammates run it by name and only override approved fields.

**Step 1 — create.** `allowed_overrides` is a whitelist; a recognized selector field under `overrides` that is outside it is rejected with `400 "recipe override not allowed: <field>"` on `hoody run recipes resolve` — update the recipe to widen the allow-list. An unknown key is ignored, not rejected.

```bash
hoody --container "$C" run recipes create --name team-js-runtime \
  --description 'Resolve a JS runtime; team-default = node CLI' \
  --selector-template-app node --selector-template-kind cli \
  --selector-template-os linux --selector-template-arch amd64 --selector-template-pick first \
  --allowed-overrides app,version,tags
```

**Step 2 — list / get / update / delete.**

```bash
hoody --container "$C" run recipes list
hoody --container "$C" run recipes get team-js-runtime -o json
hoody --container "$C" run recipes update team-js-runtime --description 'Updated: now also resolves bun/deno via override'
# When done:
hoody --container "$C" run recipes delete team-js-runtime -y
```

### 10. Invoke a recipe with overrides — `hoody run recipes resolve <name>`

**Goal:** teammate uses the `team-js-runtime` recipe but wants `bun` instead of the default `node`. They override only the allow-listed `app` field; other selector fields stay locked.

**Step 1 — run with overrides.** Returns the same envelope as `resolve` (`{ status, shell_command, selected, ... }`).

```bash
hoody --container "$C" run recipes resolve team-js-runtime --overrides-app bun -o json \
  | jq '{status, shell_command, picked: .selected.candidate_id}'
```

**Step 2 — search through the recipe** (same selector, but stop at candidate listing instead of resolving) via `hoody run recipes search`:

```bash
hoody --container "$C" run recipes search team-js-runtime --overrides-app node -o json \
  | jq '{set_id, count: (.candidates|length), providers: [.candidates[].provider] | unique}'
```

⚠ A recognized selector field outside `allowed_overrides` is **rejected** with `400 "recipe override not allowed: <field>"`, not silently dropped; a key that is not a selector field at all is ignored, so spell field names exactly. Use `hoody run recipes update` to widen the allow-list.

## Reference

### `hoody run` (30) — Application resolution across multiple package sources (Hoody Run)

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody run config get` |  | read | Show the stored configuration: sources, profiles and the active profile | `run.config.get` | `hoody run config get` |
| `hoody run health` |  | read | Check hoody-run service health |  | `hoody run health` |
| `hoody run jobs cancel` |  | action | Cancel a queued or running search job | `run.jobs.cancel` | `hoody run jobs cancel abc-123` |
| `hoody run jobs get` |  | read | Get the status of a job | `run.jobs.get` | `hoody run jobs get abc-123 --wait done --timeout-ms 0` |
| `hoody run jobs list` |  | read | List the background jobs the service still holds, newest first | `run.jobs.list` | `hoody run jobs list --kind search-resolve --status queued` |
| `hoody run jobs search create` |  | action | Start a background search job and return its handle | `run.jobs.createSearch` | `hoody run jobs search create --app firefox --os linux --kind gui` |
| `hoody run open` |  | action | Open the Run kit results page for an app in your browser |  | `hoody run open --app APP` |
| `hoody run profiles create` |  | write | Create a profile | `run.profiles.create` | `hoody run profiles create --name default --description 'Default profile (inherits global sources)' --defaults-os linux` |
| `hoody run profiles delete` |  | destructive | Delete a profile | `run.profiles.delete` | `hoody run profiles delete default -y` |
| `hoody run profiles list` |  | read | List profiles | `run.profiles.list` | `hoody run profiles list` |
| `hoody run profiles update` |  | write | Update a profile | `run.profiles.update` | `hoody run profiles update default --description 'Default profile (inherits global sources)' --defaults-os linux` |
| `hoody run profiles use` |  | write | Make a profile the active one | `run.profiles.use` | `hoody run profiles use default` |
| `hoody run recipes create` |  | write | Save a launch recipe | `run.recipes.create` | `hoody run recipes create --name my-resource --description 'My description' --selector-template-app firefox` |
| `hoody run recipes delete` |  | destructive | Delete a saved recipe | `run.recipes.delete` | `hoody run recipes delete my-resource -y` |
| `hoody run recipes get` |  | read | Show a saved recipe | `run.recipes.get` | `hoody run recipes get my-resource` |
| `hoody run recipes list` |  | read | List saved launch recipes | `run.recipes.list` | `hoody run recipes list` |
| `hoody run recipes resolve` |  | action | Resolve a saved recipe to a shell command | `run.recipes.resolve` | `hoody run recipes resolve my-resource --overrides-app firefox --overrides-os linux` |
| `hoody run recipes search` |  | read | Search candidates using a saved recipe | `run.recipes.search` | `hoody run recipes search my-resource --overrides-app firefox --overrides-os linux` |
| `hoody run recipes update` |  | write | Update a saved recipe | `run.recipes.update` | `hoody run recipes update my-resource --description 'My description' --selector-template-app firefox` |
| `hoody run resolve` |  | action | Resolve an app to an exact shell command | `run.resolve` | `hoody run resolve --app firefox --os linux --kind gui` |
| `hoody run resolve` |  | action | Resolve an app by path to an exact shell command |  | `hoody run resolve --app firefox --os linux --kind gui` |
| `hoody run search` |  | read | Search candidates page by page with a cursor | `run.search` | `hoody run search --selector-app firefox --selector-os linux --selector-kind gui` |
| `hoody run sources create` |  | write | Add a package source | `run.sources.create` | `hoody run sources create --source-id nixpkgs --enabled --priority 100 --provider nix --source-type nix-pkgs --pin-url https://github.com/numtide/llm-agents.nix --source-config flake=nixpkgs` |
| `hoody run sources delete` |  | destructive | Remove a package source | `run.sources.delete` | `hoody run sources delete abc-123 -y` |
| `hoody run sources diagnostics get` |  | read | Show runtime health for a source: last error, last search latency, last sync job | `run.sources.getDiagnostics` | `hoody run sources diagnostics get abc-123` |
| `hoody run sources list` |  | read | List configured package sources | `run.sources.list` | `hoody run sources list` |
| `hoody run sources sync` |  | action | Sync one source and return the job | `run.sources.sync` | `hoody run sources sync abc-123` |
| `hoody run sources sync` |  | action | Sync every source and return the job | `run.sources.syncAll` | `hoody run sources sync abc-123` |
| `hoody run sources update` |  | write | Update a package source | `run.sources.update` | `hoody run sources update abc-123 --enabled --priority 100` |
| `hoody run test` |  | read | Plan a run and show the command, missing requirements and effective policy | `run.test` | `hoody run test --app firefox --os linux --kind gui` |

