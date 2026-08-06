> _**HTTP skill · `agent` namespace** · ~31,826 tokens · hoody-sdk v1.0.0-beta.12_

# `agent` — In-container AI coding agent over HTTP

## Purpose

The `hoody-agent-d` HTTP gateway exposes the in-container AI agent as a typed namespace: create a chat session, send a prompt, stream the turn (tool calls, gates, output), then confirm/answer/cancel as the agent works. 22 services — `sessions`, `agents`, `models`, `skills`, `memory`, `github`, `workflows`, `tools`, `hooks`, `mcp`, `settings`, `system`, `loops`, `logs`, `tasks`, `statistics`, `jobs`, `discovery`, `headless`, `todos`, plus `hoody` (token bootstrap) and a namespace-root `GET /api/v1/agent/logs/export`.

## When to use

- **Drive the agent programmatically** — create a session, prompt it, and consume the turn: `POST /api/v1/agent/sessions` → stream the turn for live tool/gate/output events (per surface — see the streaming note under Quirks), or `POST /api/v1/agent/sessions/{id}/prompt:sync` for one blocking call → resolve gates with `POST /api/v1/agent/sessions/{id}/confirm` / `POST /api/v1/agent/sessions/{id}/answer` → `POST /api/v1/agent/sessions/{id}/cancel` to interrupt.
- **Inspect or configure the agent** — list `models` (`GET /api/v1/agent/models` / `GET /api/v1/agent/models/{spec}`) and `GET /api/v1/agent/providers` (configure providers via `PUT /api/v1/agent/providers/{id}/auth/default` / `PUT /api/v1/agent/providers/{id}/auth/api-key` / `POST /api/v1/agent/providers/{id}/auth/oauth`); switch a session's active model with `PATCH /api/v1/agent/sessions/{id}/model`, browse/install `skills`, read/edit `memory`, manage `workflows`, `hooks`, `agents` (named agent profiles), and `tools` — both the sessionless catalogue/registry (`GET /api/v1/agent/tools` / `GET /api/v1/agent/tools/read-only` / `GET /api/v1/agent/tools/{name}`, and `POST /api/v1/agent/tools/{name}/run` (blocks, returns the result) / `POST /api/v1/agent/tools/{name}/runAsync` (returns `{ job_id }`, poll `jobs`) / `POST /api/v1/agent/tools/{name}/stream` (one-shot result over SSE frames — not a per-token stream) to invoke a tool with no session — read-only by default, a mutating tool needs `allow_mutations: true` or a confirmed re-issue) and the per-session surface (`GET /api/v1/agent/sessions/{id}/tools` for a session's *effective* tool set, `GET /api/v1/agent/sessions/{id}/tools/mcp`, and `POST /api/v1/agent/sessions/{id}/tools/{name}/run`). Unlike the sessionless `POST /api/v1/agent/tools/{name}/run`, a per-session run executes against the session's *frozen* realm/container/cwd/tool-mode and claims the session's single serial turn slot — so it returns 409 `turn_in_flight` while a turn is running, 409 `gate_parked` while a gate is open, and 404 `tool_not_found` if the tool is not in that session's effective list; its mutating-tool posture comes from the live session's gate chain (the `allow_mutations` escape hatch is sessionless-only).
- **One-shot non-interactive runs** — `POST /api/v1/agent/headless/runs` for a fire-and-forget agent invocation that returns a job; poll `GET /api/v1/agent/jobs/{id}` / `GET /api/v1/agent/jobs/{id}/result`.
- **GitHub from inside the agent** — first establish an account with `POST /api/v1/agent/github/auth/login` (omit the body for a GitHub device flow → poll `POST /api/v1/agent/github/auth/login/poll`; or pass a `token` PAT to persist it directly), then `GET /api/v1/agent/github/auth/status` to confirm; once an account is active, `POST /api/v1/agent/github/clone` / `POST /api/v1/agent/github/commit` (and `GET /api/v1/agent/github/status` / `GET /api/v1/agent/github/branches` / `GET /api/v1/agent/github/repos` / `POST /api/v1/agent/github/pr` / `POST /api/v1/agent/github/sync`) for repo operations the agent performs in-container.

## When NOT to use

- Want the interactive TUI, not the API? Run the bare `hoody agent` launcher (`cli/agent-command.ts`) — it opens the in-container Agent TUI over the terminal-kit WebSocket; this namespace is the HTTP control surface beside it.
- Raw shell / command exec → `terminal` (PTY) or `exec` (one-shot). File I/O → `files`. The agent runs these as tools internally; call them directly when you don't need the LLM.
- Account-level resources (containers, billing, realms) → `api`.

## Prerequisites

- Container with the `agent` kit running (`hoody-agent-d` gateway); capability URL.
- At least one model provider configured (`GET /api/v1/agent/providers` / `GET /api/v1/agent/models` to confirm one is usable) before prompting.
- A session id from `POST /api/v1/agent/sessions` for every prompt/gate/cancel call.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Prompt a session and stream the turn

`POST /api/v1/agent/sessions` (returns a session id) → stream the turn with `{ text }` to receive live events (tool calls, gates, output deltas) — see the streaming note under Quirks for the supported per-surface method (SDK helper / HTTP SSE route / CLI command) → resolve any gate as it arrives → turn ends.

### 2. One-shot synchronous prompt

`POST /api/v1/agent/sessions` → `POST /api/v1/agent/sessions/{id}/prompt:sync` with `{ text }` — blocks until the turn finishes and returns the result in one call. Best for short, non-interactive prompts where you don't need streamed events.

### 3. Resolve gates mid-turn

While a prompt streams, the agent may pause for human input: a confirmation gate → `POST /api/v1/agent/sessions/{id}/confirm`; an open question → `POST /api/v1/agent/sessions/{id}/answer` (to get a helper model to DRAFT an answer for a parked question call `POST /api/v1/agent/sessions/{id}/answer:assist` — it does NOT answer the gate: it dispatches an async job (HTTP 202) whose suggestion arrives via `GET /api/v1/agent/jobs/{id}/result` and an `event.question_suggestion` on the session stream — only one assist may be in flight per session — and the real answer still goes through `POST /api/v1/agent/sessions/{id}/answer`; for unattended runs arm `PATCH /api/v1/agent/sessions/{id}/auto-reply` (a self-driving auto-user loop that withholds write-class actions unless you opt in with `allow_writes: true`, either on the arm call or later via `PATCH /api/v1/agent/sessions/{id}/auto-reply/writes`)). Echoing a wrong/stale `gate_id`/`generation`, or answering when nothing is parked, returns 409 (`no_pending_gate` / `stale_gate` / `gate_already_answered` / `gate_type_mismatch`). Interrupt a running turn with `POST /api/v1/agent/sessions/{id}/cancel`. Tear the session down: `POST /api/v1/agent/sessions/{id}/close` removes it from the live map; `DELETE /api/v1/agent/sessions/{id}` drops the live connection but keeps the persisted record (re-attach via `POST /api/v1/agent/sessions`), while a *hard* delete (set the `hard` flag — SDK `DELETE /api/v1/agent/sessions/{id}`, HTTP `?hard=true`, CLI `--hard`) also erases the persisted record. To roll a session back without tearing it down, `POST /api/v1/agent/sessions/{id}/trim` with `{ turn_idx }` truncates conversation history to (and including) that turn index.

### 4. Pick a model / provider

`GET /api/v1/agent/providers` to see configured providers, `GET /api/v1/agent/models` to list available models, then `PATCH /api/v1/agent/sessions/{id}/model` to bind a model to a session before prompting — SYNCHRONOUS: the response reports the actual outcome ({status:'ok', model, persisted} on success; structured 409/422 errors while busy or for an unconstructable spec) and a successful switch PERSISTS into the chat agent's frontmatter (a global repin for future sessions of that agent). PRECEDENCE: the agent's frontmatter `model` is the DEFAULT for a session that does not request one; an explicit `POST /api/v1/agent/sessions` (or this live `PATCH /api/v1/agent/sessions/{id}/model`) OVERRIDES that pin for the session — create is session-scoped and does not rewrite the agent, this live switch repins globally. The shipped default agent ships pinned, so its pin is the out-of-the-box default until an explicit model is chosen (`POST /api/v1/agent/sessions` with attach or backend:"acp" is rejected 400 — a resumed/delegated session cannot take an explicit model). Each session has further per-session knobs (all session-scoped PATCHes that apply live): `PATCH /api/v1/agent/sessions/{id}/effort` (`{ effort }` — `low|medium|high|xhigh`, or `""` for the model default), `PATCH /api/v1/agent/sessions/{id}/verbosity` (`{ level }` — `normal|concise|terse|minimal`), `PATCH /api/v1/agent/sessions/{id}/hoody-env` (`{ enabled }` — toggle whether the `HOODY_*` shell-env contract is injected for the bash tool), and `PATCH /api/v1/agent/sessions/{id}/agent` (`{ agent }` — bind a named profile from `agents`).

### 5. Skills, memory, todos, workflows, agents

- **Skills** — `GET /api/v1/agent/skills` (each carries an enabled + trust state), `POST /api/v1/agent/skills/hub/install` / `GET /api/v1/agent/skills/hub/search` / `GET /api/v1/agent/skills/hub/preview` to find and install from the hub. A newly installed/imported skill must be trusted before its code runs — `POST /api/v1/agent/skills/trust` is the gate (identify the skill by `root_dir`+`rel_dir`, set the `trusted` flag); `POST /api/v1/agent/skills/toggle` only enables/disables by `name` (set the `disabled` flag). Like the J-class todo ops, both `POST /api/v1/agent/skills/trust` (which grants arbitrary code-execution trust) and `POST /api/v1/agent/skills/hub/install` (which writes arbitrary skill code to disk) have NO human-confirmation gate over this namespace — that denial lives only on the model-facing skill-edit tool path, and the HTTP edge has no app-level admin gate, so an autonomous API caller can silently trust and install skill code; gate these in your own caller.
- **Memory** — `POST /api/v1/agent/memory/search` for hybrid recall (BM25 + vector + graph) and `GET /api/v1/agent/memory/items` to enumerate by `project`; `POST /api/v1/agent/memory/items` / `PATCH /api/v1/agent/memory/items/{id}` / `DELETE /api/v1/agent/memory/items` to write; `GET /api/v1/agent/memory/graph` for the relation graph (or `GET /api/v1/agent/memory/items/{id}` to read one record by `id`). `PUT /api/v1/agent/memory/enabled` (`{ enabled }`) is the memory capture/privacy switch — it persists `features.memory` and flips the live store — and `POST /api/v1/agent/memory/flush` forces the store's durability barrier; both are not admin-gated. Memory is project-scoped (pass `project`); the reads (`POST /api/v1/agent/memory/search` / `GET /api/v1/agent/memory/items` / `GET /api/v1/agent/memory/graph` / `GET /api/v1/agent/memory/projects`) and `POST /api/v1/agent/memory/consolidate` are active-realm-only (a realm header is rejected), while the writes (`POST /api/v1/agent/memory/items` / `PATCH /api/v1/agent/memory/items/{id}` / `DELETE /api/v1/agent/memory/items`) carry no such restriction. `POST /api/v1/agent/memory/search` / `GET /api/v1/agent/memory/graph` also return `503 store_unavailable` while the store is still warming — retry rather than treating it as an empty result.
- **Todos** — `GET /api/v1/agent/todos` / `POST /api/v1/agent/todos` to file; then `POST /api/v1/agent/todos/triage` (LLM inbox pass), `POST /api/v1/agent/todos/{id}/claim` / `POST /api/v1/agent/todos/{id}/release`, `POST /api/v1/agent/todos/{id}/run` (dispatch a background orchestrator — returns `{job_id, session_id}`), `POST /api/v1/agent/todos/{id}/cancel-run` to abort an in-flight run, and `POST /api/v1/agent/todos/{id}/proposals/{pid}/approve` / `POST /api/v1/agent/todos/{id}/proposals/{pid}/deny` to resolve a proposed run — approve is NOT inert: it spawns a background worker session equivalent to `POST /api/v1/agent/todos/{id}/run` (a J-class autonomous run that spends model budget), while `POST /api/v1/agent/todos/{id}/proposals/{pid}/deny` spawns nothing — plus `POST /api/v1/agent/todos/{id}/snooze` / `POST /api/v1/agent/todos/{id}/archive`. To advance a todo through its lifecycle (inbox→active→done) or edit its fields, `PATCH /api/v1/agent/todos/{id}` applies a CAS-guarded patch / `state` transition — read the todo's OWN `revision` with `GET /api/v1/agent/todos/{id}` and pass it back (`GET /api/v1/agent/todos/revision` is a store-wide change cursor, NOT the CAS token; a stale value → `409 todo_conflict`); a stale revision is rejected (409). `POST /api/v1/agent/todos/{id}/archive` is not terminal — `POST /api/v1/agent/todos/purge` permanently and irreversibly destroys all archived todos (no confirmation gate; treat as destructive). Mind the comment split: `POST /api/v1/agent/todos/{id}/messages` (`/messages`, plural) only appends a comment, whereas `POST /api/v1/agent/todos/{id}/message` (`/message`, singular) ALSO kicks an orchestrator turn — a budget-spending LLM run that returns `{job_id}` — so use the plural form for a plain note. Note `POST /api/v1/agent/todos/{id}/run` / `POST /api/v1/agent/todos/triage` / `POST /api/v1/agent/todos/{id}/proposals/{pid}/approve` are J-class autonomous runs with NO confirmation gate on the RPC (reaching the RPC is itself treated as the human approval; that denial lives only on the model-facing `run_todo` *tool*), so calling them from automation silently dispatches a real LLM run — gate them in your own caller.
- **Workflows** — `GET /api/v1/agent/workflows` / `GET /api/v1/agent/workflows/{name}` / `PUT /api/v1/agent/workflows/{name}` / `DELETE /api/v1/agent/workflows/{name}` / `POST /api/v1/agent/workflows/{name}/hide` manage saved definitions; `POST /api/v1/agent/sessions/{id}/workflows/{name}/runs` dispatches one onto a live session and returns a JOB, not a run (optionally seed the run with a `{ prompt }` body — input text fed to the workflow) — poll `GET /api/v1/agent/jobs/{id}` until its `run_id` populates (null during the brief dispatch window), then track via `GET /api/v1/agent/workflows/runs` / `GET /api/v1/agent/workflows/runs/{run_id}` and stop with `POST /api/v1/agent/workflows/runs/{run_id}/cancel`; feed a running workflow with `POST /api/v1/agent/sessions/{id}/workflow/messages` (`{ text }`). Run events flow on the owning session's stream, not a per-run bus.
- **Agent profiles** — `GET /api/v1/agent/agents` to enumerate named profiles; `POST /api/v1/agent/agents` / `POST /api/v1/agent/agents/{name}/copy` / `POST /api/v1/agent/agents/{name}/rename` / `DELETE /api/v1/agent/agents/{name}`; `GET /api/v1/agent/agents/{name}/source` → edit → `PUT /api/v1/agent/agents/{name}/source` (pass `base_gen` from the read for conflict detection); `PATCH /api/v1/agent/agents/{name}/model` / `PATCH /api/v1/agent/agents/{name}/tools` / `POST /api/v1/agent/agents/{name}/tools/{tool}/toggle` / `PATCH /api/v1/agent/agents/{name}/turns` / `POST /api/v1/agent/agents/{name}/reset-to-shipped`. To make a session use a profile, `PATCH /api/v1/agent/sessions/{id}/agent` (`{ agent }`) — that selects, it does NOT edit the profile. Two daemon guard rails: `DELETE /api/v1/agent/agents/{name}` refuses a shipped-default profile or the configured default chat agent (`is_error:true` — use `POST /api/v1/agent/agents/{name}/reset-to-shipped` or `PUT /api/v1/agent/agents/{name}/source` instead), and `POST /api/v1/agent/agents/{name}/reset-to-shipped` refuses a profile that has no shipped default (`is_error:true`).

### 6. Fire-and-observe, recurring prompts, and re-attach

- **Fire-and-observe** — `POST /api/v1/agent/sessions/{id}/messages` with `{ text }` dispatches a turn and returns `{ job_id }` immediately (HTTP 202) without streaming or blocking; watch completion via `agent_done` on `GET /api/v1/agent/sessions/{id}/stream`. Refuses with 409 `turn_in_flight` if a turn is running, or 409 `gate_parked` if a gate is open.
- **Observe / re-attach** — `GET /api/v1/agent/sessions/{id}/stream` attaches (WebSocket primary, SSE fallback) to a live session's full `event.*` stream; pass `since` (gateway int64 seq, or the `Last-Event-ID` header) to resume from the 1024-event replay ring after a disconnect (a gap past eviction yields `event: lagged {code:replay_gap}`). `GET /api/v1/agent/sessions/{id}/replay` returns the buffered event tail of a *live* session (with `min_seq`/`max_seq`) for a one-shot catch-up (only a *live* session has this ring; for a non-live session there is nothing to replay — attach via `GET /api/v1/agent/sessions/{id}/stream` to receive the daemon's `event.replay` instead).
- **Recurring prompts (loops)** — `POST /api/v1/agent/sessions/{id}/loops` with `{ prompt, interval }` (plus optional `max_runs` / `stop_when` / `max_cost_usd` / `max_wall_ms` caps) schedules a prompt to re-fire on a live session; `GET /api/v1/agent/sessions/{id}/loops` / `PATCH /api/v1/agent/sessions/{id}/loops/{loopId}` (pause via `{ paused: true }`) / `DELETE /api/v1/agent/sessions/{id}/loops/{loopId}` to manage, `POST /api/v1/agent/sessions/{id}/loops/{loopId}/run-now` to fire one immediately. Loops are entirely session-scoped.

### 7. Headless one-shot run

`POST /api/v1/agent/headless/runs` for a non-interactive invocation that returns a job handle; poll `GET /api/v1/agent/jobs/{id}` and fetch the output with `GET /api/v1/agent/jobs/{id}/result`.

### 8. Configure MCP servers for a session

Reads first: `GET /api/v1/agent/mcp/servers` (`{ session_id }`) returns the EFFECTIVE merged `mcp_servers` config, the per-layer settings files behind it, and each server's LIVE runtime state (connected, negotiated protocol revision, tool count, pid, revocation reason, recent stderr). Every write is TWO steps: `POST /api/v1/agent/mcp/write-intents` (`{ session_id, op, scope }`, op ∈ `upsert`|`delete`|`set_enabled`|`import`, scope ∈ `user` (default)|`project`|`local`) mints a single-use nonce bound to {session, op, resolved settings path} and returns the target path plus the current `mcp_servers` hash — then present that `nonce` plus the hash as `expect_hash` on the matching `PUT /api/v1/agent/mcp/servers` / `DELETE /api/v1/agent/mcp/servers` / `POST /api/v1/agent/mcp/servers/enable` / `POST /api/v1/agent/mcp/import`. BOTH are required on every write: skipping step one fails closed, a nonce minted for a different op or scope fails closed, and `expect_hash` has no omit-it default — a first write into a settings file that does not exist yet states that expectation with the empty-array hash rather than leaving the field out. To adopt someone else's config, preview it with `POST /api/v1/agent/mcp/parse` (`{ session_id, document }` — writes nothing, needs no nonce, strips credential values) and then `POST /api/v1/agent/mcp/import` with a fresh `op: "import"` nonce; imported servers land DISABLED, so enable each one with `POST /api/v1/agent/mcp/servers/enable`. After editing a settings file by hand, or to recover a server that died, `POST /api/v1/agent/mcp/reconnect` (`{ session_id }`) re-reads the layers and reconciles every live session's pool — a healthy unchanged server is not restarted. `POST /api/v1/agent/mcp/probe` trials a candidate config without saving it, but it is human-only (see Common errors).

## Quirks & gotchas

- The bare `hoody agent` verb is a **hand-written TUI launcher** (`cli/agent-command.ts`), distinct from this generated HTTP namespace; they coexist — the launcher opens the in-container Agent TUI, the namespace is the typed control surface.
- Source of truth is the `hoody-agent-d` gateway's own OpenAPI document, served at `GET /api/v1/agent/openapi.{json,yaml}`; every route lives under the single `/api/v1/agent` prefix. The kit URL is itself the credential; no HTTP bearer header is required.
- The proxy service slug is `agent` and the kit URL host carries the index segment (`-agent-{index}`); resolve it via `getKitUrl('agent', container)` rather than hand-building.
- `POST /api/v1/agent/sessions/{id}/prompt:sync` blocks until the turn finishes (or returns `{pending_gate}` the moment a turn parks on a confirm/question) — long un-parked agent turns can still exceed default HTTP client timeouts; prefer streamed prompting for anything non-trivial so you can observe progress and resolve gates as they arrive. (The `prompt:stream` route emits **SSE** — `Content-Type: text/event-stream` — so POST it and read the event stream directly.)For non-interactive turns where you cannot resolve gates by hand, enable the `auto_approve` gate policy on `POST /api/v1/agent/sessions/{id}/prompt:stream` / `POST /api/v1/agent/sessions/{id}/prompt:sync` to auto-approve confirm gates for the life of the turn (off by default) — HTTP: `?policy=auto_approve` (or the `X-Hoody-Gate-Policy: auto_approve` header); SDK: `policy: 'auto_approve'` in the prompt options; the generated CLI: `--policy auto_approve`. Note this only answers **confirm** gates, never questions. - Every prompt/gate/cancel call is **session-scoped** — you must hold a session id from `POST /api/v1/agent/sessions` first; there is no implicit default session. Hook writes are session-scoped too (the guarded writes — `PUT /api/v1/agent/hooks` / `DELETE /api/v1/agent/hooks` / `POST /api/v1/agent/hooks/toggle` / `POST /api/v1/agent/hooks/disable-all` — plus `POST /api/v1/agent/hooks/begin-write`, and the side-effecting `POST /api/v1/agent/hooks/test` / `POST /api/v1/agent/hooks/trust/ack`, all require a live `session_id` — `POST /api/v1/agent/hooks/trust/ack` clears the per-session hook-trust prompt (the execution-trust probe `GET /api/v1/agent/hooks` reports), the gate that must be acknowledged before any hook command is allowed to fire, mirroring `POST /api/v1/agent/skills/trust` for skills; `POST /api/v1/agent/hooks/reload` accepts one only to also return the reloaded summary) AND nonce-guarded: call `POST /api/v1/agent/hooks/begin-write` (`{ session_id, op, scope }`, op ∈ upsert|delete|toggle|set_disabled) to mint a single-use nonce, then pass that `nonce` on the matching `PUT /api/v1/agent/hooks` / `DELETE /api/v1/agent/hooks` / `POST /api/v1/agent/hooks/toggle` / `POST /api/v1/agent/hooks/disable-all` — the nonce binds to that session+op+scope tuple and the write fails closed without it. Note hooks are an arbitrary-command surface: `PUT /api/v1/agent/hooks` persists a command that fires on lifecycle events and `POST /api/v1/agent/hooks/test` executes one immediately. The human-only confirmation gate lives only on the model-facing tool path, not on these RPCs, and the gateway HTTP edge has no app-level admin gate — the same access that authorizes any agent-kit call authorizes these too, with nothing extra, so gating this surface is the caller's/proxy's responsibility.
- **Credential VALUES are never returned by the MCP surface.** `GET /api/v1/agent/mcp/servers` reports `env_keys` / `header_keys` — key NAMES only — because a redacted value invites a client to write the placeholder back as the real secret; a write whose body carries the redaction placeholder for a credential is REFUSED rather than stored. To change a secret you must supply its real value; to leave one alone, omit the field — `PUT /api/v1/agent/mcp/servers` merges FIELD BY FIELD over the existing entry of the same name, so omitted fields keep their stored value (including fields this build does not model), and `POST /api/v1/agent/mcp/servers/enable` flips only the `enabled` flag so credentials and options survive a disable. Writes apply to live sessions before the response returns: a deleted, disabled, or re-pointed server is REVOKED in every live session first (a stdio child is reaped when its last holder releases), so a caller mid-turn cannot still reach it. Import is WHOLE-BATCH — one bad entry aborts everything — it understands the hoody (`mcp_servers` list), Claude/Cursor (`mcpServers` map) and VS Code (`servers` map) dialects, and REFUSES a document carrying more than one of them rather than guessing.

## Common errors

- A gate or question left unresolved stalls the turn — a streamed prompt that emitted an `event.confirm_request` (confirm gate) or `event.user_question` (question gate) will not complete until you answer it: `POST /api/v1/agent/sessions/{id}/confirm` for a confirm, `POST /api/v1/agent/sessions/{id}/answer` for a question. For unattended runs, arm `PATCH /api/v1/agent/sessions/{id}/auto-reply` (a self-driving auto-user loop), or pass `policy: "auto_approve"` on the prompt — but `auto_approve` only auto-approves **confirm** gates, never questions; a parked question still stalls until `POST /api/v1/agent/sessions/{id}/answer` (or the auto-reply loop) answers it.
- `GET /api/v1/agent/sessions/{id}/tasks` and `GET /api/v1/agent/sessions/{id}/tasks/{tid}/transcript` do NOT return data inline — they ask a *live* session to emit its background-subagent snapshot/transcript onto the session's WebSocket/SSE stream (`event.tasks_snapshot` for the snapshot, `event.task_transcript` for the transcript) and return only a JSON ack; you must already be attached via `GET /api/v1/agent/sessions/{id}/stream` to receive the payload. `POST /api/v1/agent/sessions/{id}/tasks/{tid}/cancel` / `POST /api/v1/agent/sessions/{id}/tasks/cancel` stop background tasks mid-turn (server-layer; tasks survive `POST /api/v1/agent/sessions/{id}/cancel` but are not restartable).
- `POST /api/v1/agent/memory/consolidate` (POST /memory/consolidate) is **human-only and ALWAYS fails over this namespace** — the gateway server-stamps a machine marker and the daemon's non-bypassable gate returns `403 human_only` for every HTTP/SDK/CLI call; it can only be triggered from an interactive human session. Do not call it programmatically.
- `POST /api/v1/agent/mcp/probe` (POST /mcp/probe) is **human-only and ALWAYS fails over this namespace** — probing STARTS A PROCESS (stdio) or makes an outbound request to a caller-chosen URL (http/sse), so a machine caller may not self-approve it and receives `403 human_only` on every HTTP/SDK/CLI call. The surface still exposes it for completeness, it simply always refuses. The deny list is still enforced on the candidate config before anything is started. Use `POST /api/v1/agent/mcp/parse` for a write-free preview instead; there is no programmatic substitute for the live trial.
- An MCP write needs BOTH a `nonce` and an `expect_hash` — neither is optional, and a stale hash is a CONFLICT rather than a silent overwrite. `PUT /api/v1/agent/mcp/servers` / `DELETE /api/v1/agent/mcp/servers` / `POST /api/v1/agent/mcp/servers/enable` / `POST /api/v1/agent/mcp/import` each require a fresh single-use `nonce` from `POST /api/v1/agent/mcp/write-intents` minted for that exact op and scope (one minted for a different op or scope fails closed) AND the `mcp_servers` hash you last read, from either `POST /api/v1/agent/mcp/write-intents` or `GET /api/v1/agent/mcp/servers`. A mismatch means someone else edited the layer since you read it — re-read, re-mint, retry; each nonce is good for exactly one write, so a retry always needs a new one. There is no "omit it for the first write" shortcut: writing into a settings file that does not exist yet means passing the empty-array hash.
- `DELETE /api/v1/agent/workflows/{name}` only removes **user** workflows — built-in/**system** workflows are refused (`is_error:true`) and re-seed on every boot; `POST /api/v1/agent/workflows/{name}/hide` is the only way to remove a system workflow from view.
- Empty values on agent-profile edits mean *inherit / unrestrict*, not *clear to nothing*: `PATCH /api/v1/agent/agents/{name}/model` with `model: ""` removes the model line (falls back to the default model), and `PATCH /api/v1/agent/agents/{name}/tools` with `tools: []` removes the allow-list line, which means **all tools are allowed** (NOT zero). Pass a non-empty `tools` array to genuinely restrict.
- Prompting with no usable model/provider configured fails the turn — check `GET /api/v1/agent/providers` returns a ready provider before you prompt (blocking or streamed).
- Calling prompt/gate/cancel against a session whose live connection was torn down (`POST /api/v1/agent/sessions/{id}/close`, or `DELETE /api/v1/agent/sessions/{id}` without `hard`) returns not-found — re-attach with `POST /api/v1/agent/sessions` if the record survives, or start fresh with `POST /api/v1/agent/sessions`. After a *hard* `DELETE /api/v1/agent/sessions/{id}` (the `hard` flag set) the record is gone and only a fresh `POST /api/v1/agent/sessions` works.

## Related namespaces

`terminal`, `exec`, `files`, `notes`, `api`.

## Reference

### `agent` (1) — General agent operations

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/logs/export` | Export logs as a downloadable file. | `?source` `?min_level` `?comp` `?session_id` `?text` `?since` `?until` `?event` `?tool` `?model` `?status` `?method` `?min_status` `?max_status` `?errors_only` `?event_type` `?resource_type` `?container` `?kind` `?host` `?since_seq` `?limit` `?format` `?filename` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |

**Param notes:**

- `source` — Log source to export (see logsSources; one local source, one platform source, or omitted for all local sources).
- `min_level` — Minimum log level (debug\|info\|warn\|error).
- `comp` — Component filter (daemon source).
- `session_id` — Session id filter.
- `text` — Case-insensitive substring filter over message+attrs.
- `since` — Lower time bound (RFC3339 or relative like 1h/7d).
- `until` — Upper time bound (RFC3339 or relative).
- `event` — Session lifecycle event filter (session source).
- `tool` — Tool name filter (tool source).
- `model` — Model filter (llm source).
- `status` — Tool outcome filter: ok\|error\|cancelled (tool source).
- `method` — HTTP method filter (activity source).
- `min_status` — Minimum HTTP status (activity source).
- `max_status` — Maximum HTTP status (activity source).
- `errors_only` — Only error rows (activity source; true/false).
- `event_type` — Event type filter (events source).
- `resource_type` — Resource type filter (events source).
- `container` — Container filter (proxy source; empty = all running realm containers). Maps to the daemon's container_id filter.
- `kind` — Proxy row kind: request\|response\|event (proxy source).
- `host` — Proxy URL host filter (exact or dot-aligned suffix).
- `since_seq` — Exclusive lower seq bound for incremental exports (local sources).
- `limit` — TOTAL row cap across the export (default: everything the snapshot matches; platform default 2000).
- `format` — Export format: jsonl (default) or txt.
- `filename` — Download filename override (reduced to a safe basename).
- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.

### `agents` (12) — Chat-agent definitions and per-agent settings

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/agents/{name}/copy` | Copy a chat agent. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/agents` | Create a chat-agent definition. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `DELETE /api/v1/agent/agents/{name}` | Delete a custom chat agent. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/agents/{name}/source` | Read a chat agent's source. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/agents` | List chat-agent definitions. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `PUT /api/v1/agent/agents/{name}/source` | Write a chat agent's source. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/agents/{name}/rename` | Rename a chat agent. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/agents/{name}/reset-to-shipped` | Reset an agent to its shipped default. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `PATCH /api/v1/agent/agents/{name}/model` | Set an agent's model. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/agents/{name}/tools` | Set an agent's tool allow-list. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/agents/{name}/turns` | Set an agent's max-turns. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/agents/{name}/tools/{tool}/toggle` | Toggle a single tool for an agent. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).

**Body shapes:**

- `POST /api/v1/agent/agents/{name}/copy` body — `{ new_name*: string }` — Destination name (forwarded to agents.copy; the source {name} comes from the path).
  - `new_name` — Name for the copied agent.
- `POST /api/v1/agent/agents` body — `{ name*: string, frontmatter: object, system_prompt: string }` — Chat-agent definition (forwarded to agents.create).
  - `name` — Agent name (the definition file stem).
  - `frontmatter` — Optional frontmatter keys (model/tools/turns/description).
  - `system_prompt` — The agent's system prompt body.
- `PUT /api/v1/agent/agents/{name}/source` body — `{ content*: string, base_gen: int }` — New agent source (forwarded to agents.write_source; the {name} comes from the path).
  - `content` — The full markdown source (frontmatter + system prompt).
  - `base_gen` — The gen returned by agents.read_source, for conflict detection.
- `POST /api/v1/agent/agents/{name}/rename` body — `{ new_name*: string }` — New agent name (forwarded to agents.rename; the current {name} comes from the path).
  - `new_name` — New agent name.
- `PATCH /api/v1/agent/agents/{name}/model` body — `{ model: string }` — New model line (forwarded to agents.set_model; the {name} comes from the path).
  - `model` — Model spec (e.g. anthropic/claude-opus-4-8); "" removes the frontmatter model line.
- `PATCH /api/v1/agent/agents/{name}/tools` body — `{ tools: any[] }` — New tool allow-list (forwarded to agents.set_tools; the {name} comes from the path).
  - `tools` — Tool names allowed for the agent; an empty list removes the line (= all tools).
- `PATCH /api/v1/agent/agents/{name}/turns` body — `{ turns: int }` — New max-turns value (forwarded to agents.set_turns; the {name} comes from the path).
  - `turns` — Max agent turns per dispatch.
- `POST /api/v1/agent/agents/{name}/tools/{tool}/toggle` body — `object` — JSON object forwarded to the daemon `agents.toggle_tool` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. The agent {name} and {tool} come fro…

### `discovery` (2) — API discovery and related-operation hints

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/containers` | List containers in a realm (for binding). | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/realms` | List realms (for binding). | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |

**Param notes:**

- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).
- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.

### `github` (12) — GitHub auth, repos, clone, status, commit, sync, PRs

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/github/auth/status` | GitHub auth status. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/github/branches` | List GitHub branches. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/github/clone` | Clone a GitHub repository. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/github/commit` | Stage all and commit. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/github/auth/login` | Start a GitHub device-flow login (or add a PAT). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/github/auth/login/poll` | Poll a GitHub device-flow login to completion. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/github/auth/logout` | Remove a linked GitHub account. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/github/pr` | Open a pull request. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/github/repos` | List GitHub repos. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/github/auth/active` | Switch the active GitHub account. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/github/status` | GitHub working-tree status. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/github/sync` | Sync (fetch → pull → push). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.

**Body shapes:**

- `POST /api/v1/agent/github/clone` body — `{ repo: string, dir: string, full_name: string, clone_url: string, shallow: bool }` — The clone request. Supply EITHER `repo` (owner/name or an https github URL) — the service derives the canonical full_name + host-validated clone_url — OR the canonical `full_name` + `clone_url` fields directly. At least one form is required; a request with NEITHER is rejected. If BOTH are supplied…
  - `repo` — The repository to clone: "owner/name" or an https github URL (https://<host>/<owner>/<name>[.git]). Translated to full_name + clone_url against the active account host. Supply this OR the canonical full_name+clone_url; if both, the canonical fields win.
  - `dir` — Optional managed clone root override (clone_root); the traversal-safe parent/dest are derived under it.
  - `full_name` — Canonical "owner/name" (alternative to `repo`; used as-is when supplied, taking precedence over a derived value). Requires clone_url.
  - `clone_url` — Canonical https clone URL (alternative to `repo`; re-validated against the active account host; takes precedence over a derived value). Requires full_name.
  - `shallow` — Shallow clone (default true).
- `POST /api/v1/agent/github/commit` body — `{ message*: string }` — The commit request (forwarded to github.commit; cwd-scoped).
  - `message` — The commit message.
- `POST /api/v1/agent/github/auth/login` body — `{ token: string, host: string, activate: bool }` — Optional login options. Supply `token` to add a PAT directly; omit it to start a device flow. Supply `host` for GitHub Enterprise (GHES).
  - `token` — Optional PAT. When present the login validates + persists this token (no device flow); kept in env, never returned.
  - `host` — GitHub host for GitHub Enterprise (GHES); defaults to github.com. Must match the host on the subsequent poll call.
  - `activate` — Whether the linked account becomes the ACTIVE one. Defaults to FALSE — linking stores the credential without changing which account is in use, because activation decides the identity your next push authenticates as. Send true when RECOVERING from an expired/revoked token: the account is linked and…
- `POST /api/v1/agent/github/auth/login/poll` body — `{ host: string, device_code*: string, interval: int, expires_in: int }` — The device-flow handle the start reply returned.
  - `host` — The GitHub host (default github.com); must match the start call.
  - `device_code` — The device_code returned by POST /github/auth/login.
  - `interval` — The poll interval (seconds) the start reply returned.
  - `expires_in` — The device-code lifetime (seconds) the start reply returned.
- `POST /api/v1/agent/github/auth/logout` body — `{ key*: string }` — The account to remove.
  - `key` — Account handle from githubAuthStatus accounts[].key, e.g. "github.com/octocat".
- `POST /api/v1/agent/github/pr` body — `{ title*: string, body: string, base: string }` — The pull-request request (forwarded to github.pr.create).
  - `title` — The PR title (required, non-empty).
  - `body` — The PR description.
  - `base` — Optional base branch (default the repo default).
- `POST /api/v1/agent/github/auth/active` body — `{ key*: string }` — The account to activate.
- `POST /api/v1/agent/github/sync` body — `{ direction: string }` — The sync request (forwarded to the service).
  - `direction` — Optional: "pull" (fetch+pull) or "push" (push only). Default is the full fetch→pull→push.

### `headless` (1) — One-shot headless agent runs

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/headless/runs` | Create a headless one-shot run. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.

**Body shapes:**

- `POST /api/v1/agent/headless/runs` body — `{ prompt*: string, workflow: string, model: string, format: string, stream: bool, timeout_ms: int }` — The one-shot run request. SECURITY: write-permission is hard-wired OFF and dir-scope is home (no caller opt-in over this surface); but bash/exec are NOT write-gated, so reaching this surface grants RCE.
  - `prompt` — The prompt to drive the ephemeral session (required).
  - `workflow` — Optional workflow name to run instead of / alongside the prompt.
  - `model` — Optional model spec for the run.
  - `format` — Output rendering: text \| json \| stream-json. stream-json (or stream:true) streams the run over SSE; otherwise the run is an async job.
  - `stream` — Force SSE streaming (equivalent to format:stream-json).
  - `timeout_ms` — Optional run timeout in milliseconds (clamped to the hard ceiling).

### `hoody` (1) — Hoody operations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/hoody/auth/bootstrap` | Bootstrap the Hoody platform credential (install-if-absent). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.

**Body shapes:**

- `POST /api/v1/agent/hoody/auth/bootstrap` body — `{ token*: string, capability: string }` — The platform token to install (write-only; never returned) and an optional operator capability.
  - `token` — The raw Hoody platform token to install. Write-only; validated via the sidecar before install and never echoed.
  - `capability` — The operator bootstrap capability (--http-bootstrap-token), required only when the daemon was started with one; a mismatch is answered 404.

### `hooks` (9) — Lifecycle hook configuration

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/hooks/trust/ack` | Acknowledge hook trust. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/hooks/begin-write` | Begin a hook write (nonce). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `DELETE /api/v1/agent/hooks` | Delete a hook. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/hooks/disable-all` | Disable all hooks. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/hooks` | List hooks. | `?session_id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/hooks/reload` | Reload hooks from disk. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/hooks/test` | Test-fire a hook. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/hooks/toggle` | Toggle a hook. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `PUT /api/v1/agent/hooks` | Upsert a hook. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `session_id` — Live session id (hooks are session-scoped; required by the daemon RPC). Query alias of the body session_id (the body value wins).

**Body shapes:**

- `POST /api/v1/agent/hooks/trust/ack` body — `object` — JSON object forwarded to the daemon `hooks.trust_ack` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. Pass `session_id` (the live session the…
- `POST /api/v1/agent/hooks/begin-write` body — `{ session_id*: string, op*: string, scope*: string }` — Write target: session, op, and scope the nonce binds to.
  - `session_id` — Live session id (hooks are session-scoped).
  - `op` — The write the nonce authorizes; one of: upsert, delete, toggle, set_disabled. The nonce is rejected by any other op.
  - `scope` — Scope of the settings file the write targets (e.g. project/user); the nonce binds to its resolved path.
- `DELETE /api/v1/agent/hooks` body — `{ session_id*: string, nonce*: string, scope: string }` — Hook identity + the begin-write nonce (op:delete).
  - `nonce` — The single-use write nonce from beginHookWrite minted for op:delete + this scope; the RPC fails closed without it.
  - `scope` — Scope of the settings file to write (must match the nonce's scope).
- `POST /api/v1/agent/hooks/disable-all` body — `{ session_id*: string, nonce*: string, scope: string }` — The begin-write nonce (op:set_disabled) + session/scope it binds to.
  - `nonce` — The single-use write nonce from beginHookWrite minted for op:set_disabled + this scope; the RPC fails closed without it.
- `GET /api/v1/agent/hooks` body — `{ session_id: string }` — Optional: the live session_id (hooks are session-scoped). May be supplied here OR as the ?session_id query alias; the body value wins.
  - `session_id` — Live session id (hooks are session-scoped; required by the daemon RPC).
- `POST /api/v1/agent/hooks/reload` body — `object` — JSON object forwarded to the daemon `hooks.reload` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. Pass `session_id` (the live session the ho…
- `POST /api/v1/agent/hooks/test` body — `object` — JSON object forwarded to the daemon `hooks.test` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. Pass `session_id` (the live session the hook…
- `POST /api/v1/agent/hooks/toggle` body — `{ session_id*: string, nonce*: string, scope: string }` — The begin-write nonce (op:toggle) + session/scope it binds to.
  - `nonce` — The single-use write nonce from beginHookWrite minted for op:toggle + this scope; the RPC fails closed without it.
- `PUT /api/v1/agent/hooks` body — `{ session_id*: string, nonce*: string, scope: string, event: string, matcher: string, command: string, timeout: int, name: string, description: string }` — Hook definition + the begin-write nonce (op:upsert).
  - `nonce` — The single-use write nonce from beginHookWrite minted for op:upsert + this scope; the RPC fails closed without it.
  - `event` — Lifecycle event the hook fires on.
  - `matcher` — Matcher selecting when the hook fires.
  - `command` — Command to run when the hook fires.
  - `timeout` — Per-fire timeout (optional).
  - `name` — Short human label shown in the Hooks tab (required when creating a new hook; omit to preserve on update).
  - `description` — Short description of what the hook does (required when creating a new hook; omit to preserve on update).

### `jobs` (3) — Async job lifecycle (observe / result / cancel)

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/agent/jobs/{id}` | Cancel a pending/running job, or delete a finished record. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/jobs/{id}` | Get an async job's status. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/jobs/{id}/result` | Get an async job's result. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.

### `logs` (5) — Structured log query and read

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/logs/sources` | Log sources. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/logs/stats` | Log statistics. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/logs` | Query logs. | `?source` `?level` `?host` `?since` `?until` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/logs/entries/{ref}` | Read a log entry. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/logs/stream` | Stream the log tail (SSE). | `?source` `?level` `?host` `?since_seq` `?limit` `H:Last-Event-ID` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `source` — Filter to a log source/facet (see logsSources).
- `level` — Filter to a minimum log level.
- `host` — Filter to a host.
- `since` — Lower time/cursor bound (since_seq cursor passes through verbatim).
- `until` — Upper time bound.
- `limit` — Caps the result set (daemon default 200). A non-numeric value is rejected 400.
- `source` — Filter the tail to a log source/facet.
- `since_seq` — Initial resume cursor (the Last-Event-ID header overrides it). A non-numeric value is rejected 400.
- `limit` — Caps each poll batch. A non-numeric value is rejected 400.
- `Last-Event-ID` — SSE resume cursor — the gateway int64 seq to resume from; OVERRIDES the ?since_seq query param. Sent automatically by an SSE client on reconnect.

### `loops` (5) — Recurring self-paced agent loops

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/sessions/{id}/loops` | Create a loop. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `DELETE /api/v1/agent/sessions/{id}/loops/{loopId}` | Delete a loop. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `GET /api/v1/agent/sessions/{id}/loops` | List a session's loops. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions/{id}/loops/{loopId}/run-now` | Run a loop immediately. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/loops/{loopId}` | Update a loop. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).

**Body shapes:**

- `POST /api/v1/agent/sessions/{id}/loops` body — `{ prompt*: string, interval: string, max_runs: int, stop_when: string, max_cost_usd: number, max_wall_ms: int }` — Loop definition (forwarded to loops.create; the session_id comes from the path).
  - `prompt` — The prompt fired each loop run.
  - `interval` — Run interval (duration token, e.g. "30m").
  - `max_runs` — Stop after this many runs (0 = unlimited).
  - `stop_when` — Optional stop predicate evaluated each run.
  - `max_cost_usd` — Cost ceiling (0 = unlimited).
  - `max_wall_ms` — Wall-clock ceiling in ms (0 = unlimited).
- `DELETE /api/v1/agent/sessions/{id}/loops/{loopId}` body — `object` — JSON object forwarded to the daemon `loops.delete` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. The session_id and loop id come from the p…
- `POST /api/v1/agent/sessions/{id}/loops/{loopId}/run-now` body — `object` — JSON object forwarded to the daemon `loops.run_now` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. The session_id and loop id come from the…
- `PATCH /api/v1/agent/sessions/{id}/loops/{loopId}` body — `{ paused: bool, expires_in: string, max_cost_usd: number, max_wall_ms: int }` — Exactly one update intent: run state, expiry, or budget.
  - `paused` — Run-state intent → loops.set_state (true pauses, false resumes).
  - `expires_in` — Expiry intent → loops.set_expiry (duration-from-now token, e.g. "2h"; ""/"never" clears).
  - `max_cost_usd` — Budget intent → loops.update (cost ceiling; 0 = unlimited).
  - `max_wall_ms` — Budget intent → loops.update (wall-clock ceiling in ms, or a duration token; 0 = unlimited).

### `mcp` (9) — Mcp operations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/mcp/write-intents` | Begin an MCP config write. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `DELETE /api/v1/agent/mcp/servers` | Delete an MCP server. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/mcp/import` | Import MCP servers from another tool's config. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/mcp/servers` | List configured MCP servers. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/mcp/parse` | Preview an MCP config import. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/mcp/probe` | Probe an MCP server without saving it. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/mcp/reconnect` | Reload MCP config and reconnect. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/mcp/servers/enable` | Enable or disable an MCP server. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `PUT /api/v1/agent/mcp/servers` | Create or update an MCP server. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.

**Body shapes:**

- `POST /api/v1/agent/mcp/write-intents` body — `{ session_id*: string, op*: "upsert" | "delete" | "set_enabled" | "import", scope: "user" | "project" | "local" }` — Which write is intended, and in which settings layer.
  - `session_id` — Live session id (MCP config is resolved against the session's settings layers).
  - `op` — Which write the nonce authorizes. The minted nonce is valid for this op alone.
  - `scope` — Settings layer to write. Defaults to user, or project when there is no user layer (which is the case under --config-dir).
- `DELETE /api/v1/agent/mcp/servers` body — `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", name*: string, expect_hash*: string }` — Server name, the begin-write nonce (op:delete) and the expected content hash.
  - `session_id` — Live session id.
  - `nonce` — Single-use nonce from beginMCPWrite minted for op:delete and this scope.
  - `scope` — Settings layer to write. Must match the scope the nonce was minted for.
  - `name` — The server name to remove.
  - `expect_hash` — The mcp_servers hash you last read.
- `POST /api/v1/agent/mcp/import` body — `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", document: string, servers: any[], replace: bool, expect_hash*: string }` — The document or server array, plus the begin-write nonce (op:import).
  - `nonce` — Single-use nonce from beginMCPWrite minted for op:import and this scope.
  - `document` — A pasted config document in any supported dialect. Mutually exclusive with servers.
  - `servers` — Explicit server entries, in hoody's own shape. Mutually exclusive with document.
  - `replace` — Overwrite entries whose name already exists. Without it, a collision aborts the whole import.
- `POST /api/v1/agent/mcp/parse` body — `{ session_id*: string, document*: string }` — The document to parse.
  - `document` — A config document in any supported dialect.
- `POST /api/v1/agent/mcp/probe` body — `{ session_id*: string, server*: object }` — The candidate server config.
  - `session_id` — Live session id (supplies the deny list and transport policy).
  - `server` — The candidate entry, same shape as upsertMCPServer's server.
- `POST /api/v1/agent/mcp/reconnect` body — `{ session_id*: string }` — Which session to reconcile against.
- `POST /api/v1/agent/mcp/servers/enable` body — `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", name*: string, enabled*: bool, expect_hash*: string }` — Server name, desired state, the begin-write nonce (op:set_enabled) and the expected content hash.
  - `nonce` — Single-use nonce from beginMCPWrite minted for op:set_enabled and this scope.
  - `name` — The server name.
  - `enabled` — true to enable, false to disable.
- `PUT /api/v1/agent/mcp/servers` body — `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", expect_hash*: string, server*: object }` — The server entry, the begin-write nonce (op:upsert) and the expected content hash.
  - `nonce` — Single-use nonce from beginMCPWrite minted for op:upsert and this scope; the RPC fails closed without it.
  - `expect_hash` — The mcp_servers hash you last read, as returned by beginMCPWrite or listMCPServers. REQUIRED: a mismatch returns a conflict instead of overwriting a concurrent edit, and a first write into a file that does not exist yet states its expectation with the empty-array hash rather than omitting this.
  - `server` — The server entry. Fields: `name` — letters, digits, `_` and `-`, max 64 chars, no `__` (it separates the tool name), may not be `hoody` or `mcp` — both are reserved namespaces, and that check alone is case-insensitive, so `Hoody` is refused too; `type` — `stdio` (default), `http` (aliases `url`, `s…

### `memory` (11) — Long-term memory records (admin browse / CRUD)

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/memory/consolidate` | Trigger a memory consolidation pass (human-only). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `DELETE /api/v1/agent/memory/items` | Delete a memory item. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `PATCH /api/v1/agent/memory/items/{id}` | Edit a memory item. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/memory/flush` | Flush the memory store. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `GET /api/v1/agent/memory/graph` | Read a project's memory relation graph. | `?project` `?node_type` `?limit` `?offset` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/memory/items/{id}` | Read a memory item. | `?project` `?kind` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/memory/items` | List memory items. | `?project` `?kind` `?type` `?query` `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/memory/projects` | List memory projects. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/memory/items` | Save a memory item. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/memory/search` | Search memory (hybrid recall). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PUT /api/v1/agent/memory/enabled` | Toggle memory capture. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `project` — Project key whose graph to read.
- `node_type` — Optional node-type filter.
- `limit` — Maximum nodes/edges to return.
- `offset` — Pagination offset into the graph.
- `project` — Project key the memory belongs to.
- `kind` — Memory kind/store the record lives in.
- `project` — Project key to scope the listing to.
- `kind` — Memory kind/store to filter by.
- `type` — Memory type to filter by (e.g. workflow, fact). kind=memory ONLY — rejected 400 with a lesson/slot/observation kind.
- `query` — Free-text filter over the records. kind=memory ONLY — rejected 400 with a lesson/slot/observation kind.
- `page` — 1-based page number.
- `limit` — Items per page (1..200). 0 or omitted pages at the 200 ceiling; a value over 200 is clamped to 200. The effective page size is echoed in meta.limit. NOT "no pagination" — the daemon never returns an unbounded set.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).

**Body shapes:**

- `POST /api/v1/agent/memory/consolidate` body — `{ project*: string, min_observations: int }` — The consolidation target.
  - `project` — Project key to consolidate (required).
  - `min_observations` — Optional minimum-observations threshold for a fact to be consolidated.
- `DELETE /api/v1/agent/memory/items` body — `{ id*: string, project: string, kind: string }` — Identity of the memory record to delete.
  - `id` — Memory record id.
- `PATCH /api/v1/agent/memory/items/{id}` body — `{ project: string, kind: string, content: string }` — Patch fields for the memory record (the {id} comes from the path).
  - `content` — Replacement memory content.
- `POST /api/v1/agent/memory/flush` body — `object` — JSON object forwarded to the daemon `memory.flush` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. No fields are required; the request scope…
- `POST /api/v1/agent/memory/items` body — `{ project*: string, content*: string, type: string }` — The memory record.
  - `content` — The memory content.
  - `type` — Memory type (e.g. workflow, fact).
- `POST /api/v1/agent/memory/search` body — `{ project: string, query: string, limit: int, kinds: any[], skip_graph: bool }` — The recall query.
  - `project` — Project key to search within.
  - `query` — The natural-language recall query (privacy-Strip'd server-side).
  - `limit` — Maximum hits to return.
  - `kinds` — Optional memory kinds/stores to restrict the search to.
  - `skip_graph` — Skip the graph-fusion component of recall.
- `PUT /api/v1/agent/memory/enabled` body — `{ enabled: bool }` — The desired enabled state.
  - `enabled` — Whether memory capture is enabled.

### `models` (16) — Catalogued models and fusion composites

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/providers/{id}/auth/accounts` | Add an OAuth account to a provider's pool. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `DELETE /api/v1/agent/providers/{id}/auth/api-key` | Delete a provider API key. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/models/{spec}` | Get a model by spec. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/providers/{id}` | Get a provider. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/providers/{id}/auth` | Get a provider's auth status. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/models` | List models. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/providers/{id}/auth/accounts` | List a provider's OAuth account pool. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/providers` | List LLM providers. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `DELETE /api/v1/agent/providers/{id}/auth/oauth` | Remove a provider's OAuth login. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/providers/{id}/auth/oauth/{job}` | Poll a provider OAuth login. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `DELETE /api/v1/agent/providers/{id}/auth/accounts/{key}` | Remove a pooled OAuth account. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `PUT /api/v1/agent/providers/{id}/auth/api-key` | Store a provider API key. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `PUT /api/v1/agent/providers/{id}/auth/accounts/{key}/active` | Make a pooled OAuth account active. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PUT /api/v1/agent/providers/{id}/auth/default` | Set a provider's default credential method. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/providers/{id}/auth/oauth` | Start a provider OAuth login. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/providers/{id}/auth/oauth/{job}/code` | Submit a provider OAuth authorization code. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).

**Body shapes:**

- `POST /api/v1/agent/providers/{id}/auth/accounts` body — `object` — No fields are required; the login flow is started for the {id} provider.
- `PUT /api/v1/agent/providers/{id}/auth/api-key` body — `{ api_key*: string }` — The provider API key to store (written 0600-atomic; never returned).
  - `api_key` — The provider API key. Stored in the 0600 ~/.hoody/.env store; the reply echoes only a prefix.
- `PUT /api/v1/agent/providers/{id}/auth/accounts/{key}/active` body — `object` — No body fields are required; the account is identified by the {key} path value.
- `PUT /api/v1/agent/providers/{id}/auth/default` body — `{ default*: string }` — The default credential method to set.
  - `default` — The default method: "api_key" or "oauth". Must be a method the provider supports AND has a stored credential for.
- `POST /api/v1/agent/providers/{id}/auth/oauth` body — `{ add_account: bool }` — Optional OAuth start options.
  - `add_account` — When true, the login ADDS to the provider's OAuth account pool (LoginAddAccount) instead of replacing the primary login.
- `POST /api/v1/agent/providers/{id}/auth/oauth/{job}/code` body — `{ code*: string }` — The authorization code or full redirect URL the flow is waiting for.
  - `code` — The authorization code (or the full redirect URL) to complete the exchange.

### `sessions` (25) — Create, drive, and tear down agent sessions

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/sessions/{id}/answer:assist` | Propose answers for a parked question (helper model). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/sessions/{id}/answer` | Answer a parked question gate. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/sessions/{id}/cancel` | Cancel the active turn (Esc). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions/{id}/close` | Close the session (teardown). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions/{id}/confirm` | Answer a parked confirm gate. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/sessions` | Create, fork, or attach a session. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `DELETE /api/v1/agent/sessions/{id}` | Close (and optionally hard-delete) a session. | `?hard` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}` | Get a session summary. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/transcript` | Read a session's transcript without attaching. | `?after_turn` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/cwds` | List distinct session working directories. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions` | List sessions. | `?include_system` `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions/{id}/messages` | Dispatch a turn (fire-and-observe). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/sessions/{id}/workflow/messages` | Send a message to a running workflow. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/sessions/{id}/prompt:stream` | Dispatch a turn and stream the response. | `?policy` `H:X-Hoody-Gate-Policy` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/sessions/{id}/prompt:sync` | Dispatch a turn and block to completion. | `?policy` `H:X-Hoody-Gate-Policy` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `GET /api/v1/agent/sessions/{id}/replay` | Replay a live session's buffered events. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `PATCH /api/v1/agent/sessions/{id}/agent` | Switch the chat agent. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/auto-reply` | Arm/disarm the auto-reply loop. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/auto-reply/writes` | Flip the auto-reply write opt-in. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/effort` | Set reasoning effort. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/hoody-env` | Toggle Hoody shell-env injection. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/model` | Switch the session model. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `PATCH /api/v1/agent/sessions/{id}/verbosity` | Set response verbosity. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `GET /api/v1/agent/sessions/{id}/stream` | Attach to a session's event stream (WebSocket / SSE). | `?since` `H:Last-Event-ID` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions/{id}/trim` | Trim session history to a turn index. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `hard` — When true, also remove the persisted session record (not just the live connection).
- `after_turn` — Exclusive completed-turn skip cursor: return content strictly after completed turn N (0 = full transcript; values past the end clamp; negative/non-integer = 400).
- `include_system` — When true, also include daemon-owned system/resident sessions in the listing.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).
- `policy` — auto_approve auto-answers confirm gates for the life of the stream (alias of the X-Hoody-Gate-Policy header); off by default.
- `X-Hoody-Gate-Policy` — Confirm-gate posture: "auto_approve" adopts the headless auto-answer posture (off by default; the in:query alias is ?policy=). Any other value is rejected 400.
- `policy` — auto_approve adopts the headless auto-answer posture (alias of the X-Hoody-Gate-Policy header); off by default.
- `since` — Resume from this gateway int64 seq (also accepted as the Last-Event-ID header).
- `Last-Event-ID` — SSE resume cursor — the gateway int64 seq to resume from (the in:header alias of ?since); sent automatically by an SSE client on reconnect.

**Body shapes:**

- `POST /api/v1/agent/sessions/{id}/answer:assist` body — `{ mode: string, model: string, gen: int }` — Helper-model suggestion request (all optional).
  - `mode` — Suggestion mode (default "suggest").
  - `model` — Helper model override; empty uses the configured helper.
  - `gen` — Generation counter to correlate the suggestion event.
- `POST /api/v1/agent/sessions/{id}/answer` body — `{ gate_id: string, generation: int, answer: string, text: string, answers: object }` — Question-gate answer. Provide answer/text for a free-form reply, or answers (a map) for a structured multi-field question. gate_id/generation are optional echoes (a mismatch is 409).
  - `gate_id` — Optional echo of the parked gate id (stale/mismatch → 409).
  - `generation` — Optional echo of the parked gate generation.
  - `answer` — Free-form answer text.
  - `text` — Alternate answer text field (forwarded alongside answer).
  - `answers` — Structured per-field answers for a multi-field question.
- `POST /api/v1/agent/sessions/{id}/confirm` body — `{ gate_id: string, generation: int, approved: bool, persist_dirs: bool }` — Confirm-gate answer. gate_id/generation are optional echoes of the parked gate (a mismatch is 409). approved defaults to true when omitted.
  - `approved` — true to approve, false to deny (defaults to true if omitted).
  - `persist_dirs` — Persist an approved directory grant to settings.json (WS↔REST parity).
- `POST /api/v1/agent/sessions` body — `{ realm: string, container: string, cwd: string, config_dir: string, model: string, agent: string, tool_mode: string, dir_scope: string, attach: string, fork: string, fork_turn_idx: int, backend: string, delegated_agent: string, headless: bool }` — Session start binding (all optional; header scope augments the body, body wins). backend:"acp" requires delegated_agent.
  - `realm` — Realm selector to scope the session (frozen at start).
  - `container` — Container id/selector to run tools on (frozen at start).
  - `cwd` — Working directory for the session (frozen at start).
  - `config_dir` — Config directory override.
  - `model` — Model for this session. On a fresh create/fork it OVERRIDES the chat agent's pinned model for this session only (it is NOT written to the agent; use PATCH /sessions/{id}/model to change it and repin the agent globally). Omit it to use the agent's pinned model (or your default). Rejected (400) toget…
  - `agent` — Initial chat-agent name. Rejected (400) together with fork (a fork inherits its parent's chat agent) or attach (a resumed session keeps its agent).
  - `tool_mode` — Initial tool mode (frozen at start).
  - `dir_scope` — Initial directory-access scope: home\|full (frozen at start).
  - `attach` — attach_session_id — attach to an existing session instead of creating one.
  - `fork` — fork_session_id — fork from an existing session.
  - `fork_turn_idx` — Turn index to fork at (with fork).
  - `backend` — Session backend: "" (Hoody LLM) or "acp" (BYOA delegated agent).
  - `delegated_agent` — BYOA agent when backend:"acp": claude.
  - `headless` — Start the session in headless posture.
- `POST /api/v1/agent/sessions/{id}/messages` body — `{ text: string, tool_mode: string, dir_scope: string }` — Turn input: the user text plus optional per-turn tool_mode / dir_scope overrides.
  - `text` — The user message text for this turn.
  - `tool_mode` — Optional per-turn tool mode override.
  - `dir_scope` — Optional per-turn directory-access scope override: home\|full.
- `POST /api/v1/agent/sessions/{id}/workflow/messages` body — `{ text: string }` — Workflow input message.
  - `text` — Feedback/input text fed to the running workflow.
- `POST /api/v1/agent/sessions/{id}/prompt:stream` body — `{ text: string, tool_mode: string, dir_scope: string }` — Turn input: the user text plus optional per-turn tool_mode / dir_scope overrides.
- `POST /api/v1/agent/sessions/{id}/prompt:sync` body — `{ text: string, tool_mode: string, dir_scope: string }` — Turn input: the user text plus optional per-turn tool_mode / dir_scope overrides.
- `PATCH /api/v1/agent/sessions/{id}/agent` body — `{ agent: string }` — New chat agent.
  - `agent` — Chat-agent name to switch to.
- `PATCH /api/v1/agent/sessions/{id}/auto-reply` body — `{ armed: bool, rounds: int, model: string, allow_writes: bool }` — Auto-reply loop config.
  - `armed` — true to arm the auto-reply loop, false to disarm.
  - `rounds` — Number of auto-reply rounds budgeted.
  - `model` — Replier model override.
  - `allow_writes` — Opt in to write-class actions during auto-reply.
- `PATCH /api/v1/agent/sessions/{id}/auto-reply/writes` body — `{ allow_writes: bool }` — Write opt-in flip.
  - `allow_writes` — New write-class opt-in state.
- `PATCH /api/v1/agent/sessions/{id}/effort` body — `{ effort: string }` — Reasoning effort.
  - `effort` — low\|medium\|high\|xhigh, or "" for the model default.
- `PATCH /api/v1/agent/sessions/{id}/hoody-env` body — `{ enabled: bool }` — Enable/disable HOODY_* shell-env injection.
  - `enabled` — Whether to inject the HOODY_* shell-env contract.
- `PATCH /api/v1/agent/sessions/{id}/model` body — `{ model*: string }` — New model.
  - `model` — Model spec to switch to (provider-prefixed, e.g. anthropic/claude-opus-4-8, or fusion/<slug>). Required — a blank value is rejected, never a silent no-op.
- `PATCH /api/v1/agent/sessions/{id}/verbosity` body — `{ level: string }` — Verbosity level.
  - `level` — normal\|concise\|terse\|minimal.
- `POST /api/v1/agent/sessions/{id}/trim` body — `{ turn_idx: int }` — Trim target.
  - `turn_idx` — Turn index to truncate history to (and including).

### `settings` (9) — Process-wide settings (home settings.json)

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/agent/settings/fusion/{slug}` | Delete a fusion composite. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/acp/agents` | Get BYOA ACP backend status. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/settings` | Get settings. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/settings/fusion` | List fusion composites. | `?include_invalid` `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `PATCH /api/v1/agent/settings` | Patch settings. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `PUT /api/v1/agent/acp/agents/{agent}/model` | Set a BYOA backend's default model and effort. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PUT /api/v1/agent/acp/agents/{agent}/enabled` | Enable or disable a BYOA ACP backend. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PUT /api/v1/agent/acp/agents/{agent}/secrets/{key}` | Store an ACP per-agent secret value. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PUT /api/v1/agent/settings/fusion/{slug}` | Create or update a fusion composite. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `include_invalid` — When true, also return composites that failed validation as a top-level `invalid` array beside `items` (each with a reason + raw-file index) so a broken composite is editable/deletable.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).

**Body shapes:**

- `PATCH /api/v1/agent/settings` body — `{ patch*: object }` — The settings patch.
  - `patch` — Top-level keys to merge into the home settings.json (a null value deletes the key).
- `PUT /api/v1/agent/acp/agents/{agent}/model` body — `{ model: string, effort: string }` — The default model / effort for this backend. An empty string clears the pin.
  - `model` — Backend model id or alias. Empty clears the pin.
  - `effort` — Reasoning effort (backend-specific; empty clears).
- `PUT /api/v1/agent/acp/agents/{agent}/enabled` body — `{ enabled: bool }` — Whether the backend is armed for delegated sessions.
  - `enabled` — True arms the backend; false disarms it. Defaults to true when omitted.
- `PUT /api/v1/agent/acp/agents/{agent}/secrets/{key}` body — `{ value: string }` — The secret value to store (0600-atomic; never returned). An empty value clears the reference.
  - `value` — The env secret value. Empty string clears (unsets) the reference. Stored only in the 0600 acp-secrets.env store.
- `PUT /api/v1/agent/settings/fusion/{slug}` body — `{ spec*: object }` — The fusion composite spec.
  - `spec` — The FusionSpec object (name, method, members,...).

### `skills` (15) — Reusable agent skill definitions

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/skills/import/apply` | Apply a skill import. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `DELETE /api/v1/agent/skills/hub/cache` | Clear the skill hub cache. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/skills` | Create a skill. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/skills/delete` | Delete a skill. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/skills/hub/cache` | Skill hub cache stats. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/skills/source` | Read a skill's source. | `?root_dir` `?rel_dir` `?root` `?rel` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/skills/hub/install` | Install a hub skill. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/skills` | List skills. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/skills/hub/preview` | Preview a hub skill. | `?id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `PUT /api/v1/agent/skills/source` | Write a skill's source. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/skills/rename` | Rename a skill. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/skills/import/scan` | Scan for importable skills. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/skills/hub/search` | Search the skill hub. | `?q` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/skills/toggle` | Enable/disable a skill. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/skills/trust` | Set a skill's trust state. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `root_dir` — Skill root directory (identity; alias: root).
- `rel_dir` — Skill relative directory (identity; alias: rel).
- `root` — Friendly alias of root_dir (translated to root_dir server-side).
- `rel` — Friendly alias of rel_dir (translated to rel_dir server-side).
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).
- `id` — Hub skill identifier.
- `q` — Search query.

**Body shapes:**

- `POST /api/v1/agent/skills/import/apply` body — `object` — JSON object forwarded to the daemon `skills.import_apply` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. Identify the discovered skill to im…
- `POST /api/v1/agent/skills` body — `{ name*: string, description: string, content: string }` — New skill definition (forwarded to skills.create).
  - `name` — Skill name (the SKILL.md directory stem).
  - `description` — Skill description (frontmatter).
  - `content` — Initial SKILL.md body.
- `POST /api/v1/agent/skills/delete` body — `{ root_dir*: string, rel_dir*: string }` — Skill identity.
- `POST /api/v1/agent/skills/hub/install` body — `{ id*: string }` — Hub skill to install (forwarded to skills.hub_install).
  - `id` — Hub skill identifier (from searchSkillHub/previewSkillHub).
- `PUT /api/v1/agent/skills/source` body — `{ root_dir*: string, rel_dir*: string, content*: string, base_gen: int }` — Skill identity + new source body.
  - `content` — New SKILL.md body (alias: source).
  - `base_gen` — The gen returned by skills.read_source, for conflict detection.
- `POST /api/v1/agent/skills/rename` body — `{ root_dir*: string, rel_dir*: string, new_name*: string }` — Skill identity + new name.
  - `new_name` — New skill directory name.
- `POST /api/v1/agent/skills/toggle` body — `{ name*: string, disabled: bool }` — Effective skill name + new disabled state.
  - `name` — Effective skill name (NOT root/rel — toggle is name-scoped).
  - `disabled` — true to disable the skill, false to enable it.
- `POST /api/v1/agent/skills/trust` body — `{ root_dir*: string, rel_dir*: string, trusted*: bool }` — Skill identity + trust flag.
  - `trusted` — true to grant execution trust, false to revoke.

### `statistics` (3) — Per-session and aggregate usage counters

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/statistics` | Cross-session statistics. | `?scope` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/usage/by-account` | Usage rollup by account. | `?since` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/usage/by-model` | Usage rollup by model. | `?since` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |

**Param notes:**

- `scope` — cwd (default) rolls up the current working directory; all rolls up every session.
- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `since` — Unix-seconds lower bound; omit for all-time. A negative/non-numeric value is rejected 400.

### `system` (5) — Health, metrics, and operational endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/docs` | API documentation UI. |  |
| `GET /api/v1/agent/health` | Standardized health check. |  |
| `GET /api/v1/agent/metrics` | Prometheus metrics. |  |
| `GET /api/v1/agent/openapi.json` | OpenAPI spec (JSON). |  |
| `GET /api/v1/agent/openapi.yaml` | OpenAPI spec (YAML). |  |

### `tasks` (4) — Background task management

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/sessions/{id}/tasks/cancel` | Cancel all background tasks. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions/{id}/tasks/{tid}/cancel` | Cancel a background task. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/tasks` | Request the session's task snapshot. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/tasks/{tid}/transcript` | Request a task's transcript (upsert-poll). | `?after_seq` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `after_seq` — int64 upsert-poll cursor; entries at/below it are re-sent (default 0).

### `todos` (17) — Container-aware task list management

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/todos/{id}/proposals/{pid}/approve` | Approve a todo proposal. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/todos/{id}/archive` | Archive a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/todos/{id}/cancel-run` | Cancel a todo's run. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/todos/{id}/claim` | Claim a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/todos` | File a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/todos/{id}/proposals/{pid}/deny` | Deny a todo proposal. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `GET /api/v1/agent/todos/{id}` | Read a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/todos/revision` | Get the todos store revision. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/todos` | List todos. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/todos/{id}/message` | Comment + run an orchestrator turn. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/todos/{id}/messages` | Comment on a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/todos/purge` | Purge archived todos. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/todos/{id}/release` | Release a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/todos/{id}/run` | Run a todo's orchestrator. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/todos/{id}/snooze` | Snooze a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/todos/triage` | Run an LLM triage pass. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/todos/{id}` | Update a todo (CAS). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).

**Body shapes:**

- `POST /api/v1/agent/todos/{id}/proposals/{pid}/approve` body — `object` — JSON object forwarded to the daemon `todos.approve_proposal` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. The todo {id} and proposal {pid}…
- `POST /api/v1/agent/todos/{id}/archive` body — `{ revision*: int }` — CAS guard (forwarded to todos.archive; the {id} comes from the path).
  - `revision` — The TODO's own current `revision` (from getTodo); required — a stale or absent value is rejected.
- `POST /api/v1/agent/todos/{id}/cancel-run` body — `object` — JSON object forwarded to the daemon `todos.cancel_run` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. The todo {id} comes from the path; the…
- `POST /api/v1/agent/todos/{id}/claim` body — `{ revision: int }` — CAS guard (forwarded to todos.claim; the {id} comes from the path).
  - `revision` — The TODO's own current `revision` (from getTodo); required for a fresh claim (only the lease's existing owner may refresh without it).
- `POST /api/v1/agent/todos` body — `{ title*: string, body: string, priority: int, tags: any[], cwd: string }` — New todo (forwarded to todos.create; deterministic triage runs server-side). The todo's working directory is taken from the body `cwd` OR, if omitted, the X-Hoody-Cwd request-scope header; one of the two is required (todos.create rejects an empty cwd).
  - `title` — Todo title.
  - `body` — Todo body / description.
  - `priority` — Optional priority band 0..4 (0 = P0 urgent … 4 = P4 someday); defaults to 2 when omitted. Must be a JSON integer in range — a string or out-of-range value is rejected.
  - `tags` — Optional tags.
  - `cwd` — The todo's working directory (labels the record's computer/path). Defaults to the X-Hoody-Cwd request-scope header when omitted; one of the two must be set.
- `POST /api/v1/agent/todos/{id}/proposals/{pid}/deny` body — `object` — JSON object forwarded to the daemon `todos.deny_proposal` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. The todo {id} and proposal {pid} co…
- `GET /api/v1/agent/todos` body — `{ states: any[], tags: any[], query: string, open_only: bool, all: bool }` — Optional typed filters forwarded to todos.list. All optional; omit the body for the full list.
  - `states` — Filter to these todo states (array of strings).
  - `tags` — Filter to todos carrying these tags (array of strings).
  - `query` — Free-text filter over title/body.
  - `open_only` — When true, only open (non-terminal) todos.
  - `all` — When true, include archived/closed todos.
- `POST /api/v1/agent/todos/{id}/message` body — `{ text*: string }` — Comment text that kicks an orchestrator turn (forwarded to todos.message; the {id} comes from the path). Returns {job_id}.
  - `text` — The message that both comments and prompts the orchestrator.
- `POST /api/v1/agent/todos/{id}/messages` body — `{ text*: string }` — Comment text (forwarded to todos.post_message; the {id} comes from the path).
  - `text` — The comment body to append to the todo timeline.
- `POST /api/v1/agent/todos/purge` body — `object` — JSON object forwarded to the daemon `todos.purge` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. Optional filters scoping which archived tod…
- `POST /api/v1/agent/todos/{id}/release` body — `object` — JSON object forwarded to the daemon `todos.release` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. The todo {id} comes from the path; the bo…
- `POST /api/v1/agent/todos/{id}/run` body — `object` — JSON object forwarded to the daemon `todos.run` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. The todo {id} comes from the path; the body i…
- `POST /api/v1/agent/todos/{id}/snooze` body — `{ wake_at*: string, revision*: int }` — Snooze target (forwarded to todos.snooze; the {id} comes from the path). The daemon reads `wake_at` + the CAS `revision` — there is no `until` field.
  - `wake_at` — Wake time, RFC3339 (e.g. 2026-07-04T09:00:00Z); an empty string clears the snooze.
  - `revision` — The TODO's own current `revision` (from getTodo); a stale value is rejected.
- `POST /api/v1/agent/todos/triage` body — `object` — JSON object forwarded to the daemon `todos.triage` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. Optional triage scoping; an empty body tri…
- `PATCH /api/v1/agent/todos/{id}` body — `{ revision*: int, title: string, body: string, state: string, priority: int, rank: int, tags: any[], cwd: string }` — CAS-guarded field patch / state transition (forwarded to todos.update; the {id} comes from the path). Only the keys present are patched.
  - `revision` — The TODO's own current `revision` (from getTodo — NOT the store-wide revision); a stale value is rejected.
  - `title` — New title.
  - `body` — New body.
  - `state` — New state transition.
  - `priority` — New priority.
  - `rank` — New ordering rank.
  - `tags` — New tag set.
  - `cwd` — Retarget the todo's working directory.

### `tools` (9) — Tool catalogue and gated tool execution

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/tools/{name}` | Get one tool schema. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/tools/read-only` | List the read-only tool subset. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/tools/mcp` | List a session's MCP tools. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/tools` | List a session's effective tool set. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/tools` | List the tool catalogue. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions/{id}/tools/{name}/run` | Run a tool inside a live session (gated). | `?confirm` `?confirm_token` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/tools/{name}/run` | Run a tool (sessionless, gated). | `?confirm` `?confirm_token` `H:X-Hoody-Tool-Mode` `H:X-Hoody-Dir-Scope` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/tools/{name}/runAsync` | Run a tool asynchronously (sessionless, gated). | `?confirm` `?confirm_token` `H:X-Hoody-Tool-Mode` `H:X-Hoody-Dir-Scope` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/tools/{name}/stream` | Run a tool with a streamed result (sessionless, gated). | `?confirm` `?confirm_token` `H:X-Hoody-Tool-Mode` `H:X-Hoody-Dir-Scope` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).
- `confirm` — Query alias of the body `confirm` field — re-issue a previously-parked confirmation (pair with confirm_token).
- `confirm_token` — Query alias of the body `confirm_token` field — the single-use token returned in the 409 tool_needs_confirmation details.
- `X-Hoody-Tool-Mode` — Sessionless tool-mode for the ephemeral session (e.g. read_only / full); default per the daemon. Ignored on the in-session run (it inherits the session's frozen tool-mode).
- `X-Hoody-Dir-Scope` — Sessionless directory-access scope for the ephemeral session (e.g. home / full); default home. Ignored on the in-session run (it inherits the session's frozen dir-scope).

**Body shapes:**

- `POST /api/v1/agent/sessions/{id}/tools/{name}/run` body — `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }` — Tool parameters and an optional confirmation posture. Caller-supplied `confirmed`/`_`-prefixed control keys are ignored — they are never trusted from the wire.
  - `params` — The tool's input parameters (its JSON-Schema body).
  - `confirm` — Re-issue a previously-parked confirmation. MUST be paired with the confirm_token from the prior 409; a bare confirm:true with no valid token does NOT bypass the gate (it re-parks). A wire confirmed key in params is always scrubbed.
  - `confirm_token` — The single-use token returned in the 409 tool_needs_confirmation details. Bound to the tool/session/params it was minted for; present it with confirm:true and the echoed params to approve the parked run.
  - `allow_mutations` — Sessionless only: opt a non-read-only tool into running under the full permission checks (else a sessionless mutating run is refused 400 tool_mutation_refused).
- `POST /api/v1/agent/tools/{name}/run` body — `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }` — Tool parameters and an optional confirmation posture. Caller-supplied `confirmed`/`_`-prefixed control keys are ignored — they are never trusted from the wire.
- `POST /api/v1/agent/tools/{name}/runAsync` body — `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }` — Tool parameters and an optional confirmation posture. Caller-supplied `confirmed`/`_`-prefixed control keys are ignored — they are never trusted from the wire.
- `POST /api/v1/agent/tools/{name}/stream` body — `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }` — Tool parameters and an optional confirmation posture. Caller-supplied `confirmed`/`_`-prefixed control keys are ignored — they are never trusted from the wire.

### `workflows` (10) — Multi-step workflow definitions and runs

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/workflows/runs/{run_id}/cancel` | Cancel a workflow run. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `DELETE /api/v1/agent/workflows/{name}` | Delete a workflow definition. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/workflows/{name}` | Read one workflow definition. | `?include_revision` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/workflows/runs/{run_id}` | Get one workflow run by id. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/workflows/{name}/hide` | Hide or un-hide a workflow. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `GET /api/v1/agent/workflows/runs` | Snapshot in-flight and recent workflow runs. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/workflows` | List workflow definitions. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `PUT /api/v1/agent/workflows/{name}` | Create or replace a workflow definition. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/workflows/runs/{run_id}/resume` | Resume a failed or cancelled workflow run. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/sessions/{id}/workflows/{name}/runs` | Run a workflow onto an existing session. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `include_revision` — If "true", the tool output's first line is `revision: <opaque>` — pass that value as putWorkflow's expected_revision to guard against concurrent edits; the JSON below it is unchanged. Strictly parsed: exactly one value, "true" or "false"; anything else (empty, "TRUE", "1", repeated) is a 400 bad_request.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).

**Body shapes:**

- `POST /api/v1/agent/workflows/{name}/hide` body — `{ hidden: bool }` — Visibility flag (the {name} comes from the path). Defaults to hide:true.
  - `hidden` — true (default) to hide the workflow; false to un-hide it.
- `PUT /api/v1/agent/workflows/{name}` body — `{ definition*: object, expected_revision: string, expected_absent: bool }` — The workflow definition (forwarded as the upsert_workflow tool's `definition`; the {name} comes from the path), plus the optional optimistic-concurrency guards.
  - `definition` — The full workflow definition object (steps, entry_point, summary). Validated strictly server-side before an atomic write.
  - `expected_revision` — Optional optimistic-concurrency guard: the 'revision:' value from getWorkflow (?include_revision=true). If the stored workflow changed since that read, the upsert is refused with [revision_conflict] and nothing is written. Omit to save unconditionally.
  - `expected_absent` — Optional create-only guard: refuse with [already_exists] (writing nothing) if any workflow with this name already exists. Use when creating a new workflow that must not overwrite an existing one. Mutually exclusive with expected_revision.
- `POST /api/v1/agent/workflows/runs/{run_id}/resume` body — `{ session_id*: string }` — The live session that executes the resume.
  - `session_id` — A live session matching the run's realm, owner, working directory, and container binding.
- `POST /api/v1/agent/sessions/{id}/workflows/{name}/runs` body — `{ prompt: string, inputs: object }` — Optional workflow input prompt and declared input-parameter values.
  - `prompt` — Optional input text fed to the workflow run ($(workflow.prompt)).
  - `inputs` — Optional run-time values for the workflow's DECLARED input parameters (declared name → string value; resolves to $(input.<name>) in every step). A workflow with a REQUIRED declared parameter cannot run without these. Values must be strings; a non-string value is a 400.

