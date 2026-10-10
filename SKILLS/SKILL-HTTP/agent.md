> _**HTTP skill · `agent` namespace** · ~55,915 tokens · hoody-sdk v1.0.0-beta.17_

# `agent` — In-container AI coding agent over HTTP

## Purpose

The `agent` kit exposes the in-container AI agent as a typed namespace: create a chat session, send a prompt, stream the turn (tool calls, gates, output), then confirm/answer/cancel as the agent works. services — `sessions` (with `sessions.turns`), `bots`, `definitions`, `models`, `providers`, `skills` (with `skills.hub`), `memory`, `github`, `workflows`, `tools`, `hooks`, `mcp`, `settings`, `loops`, `logs`, `tasks`, `stats`, `jobs`, `gates`, `changes`, `headless`, `todos`, `usage`, plus `platform` (token bootstrap) and `GET /api/v1/agent/logs/export`.

## When to use

- **Drive the agent programmatically** — create a session, prompt it, and consume the turn: `POST /api/v1/agent/sessions` → stream the turn for live tool/gate/output events (per surface — see the streaming note under Quirks), or `POST /api/v1/agent/sessions/{id}/prompt:sync` for one blocking call → resolve gates with `POST /api/v1/agent/sessions/{id}/confirm` / `POST /api/v1/agent/sessions/{id}/confirm` / `POST /api/v1/agent/sessions/{id}/answer` → `POST /api/v1/agent/sessions/{id}/cancel` to interrupt.
- **Inspect or configure the agent** — list `models` (`GET /api/v1/agent/models` / `GET /api/v1/agent/models/{spec}`; the Jev decision-model catalogue is the separate `GET /api/v1/agent/jev/models`) and `GET /api/v1/agent/providers` (configure providers via `PUT /api/v1/agent/providers/{id}/auth/default` / `PUT /api/v1/agent/providers/{id}/auth/api-key` / `POST /api/v1/agent/providers/{id}/auth/oauth`); switch a session's active model with `PATCH /api/v1/agent/sessions/{id}/model`, browse/install `skills`, read/edit `memory`, manage `workflows`, `hooks`, `definitions` (named agent profiles), and `tools` — both the sessionless catalogue/registry (`GET /api/v1/agent/tools` / `GET /api/v1/agent/tools/read-only` / `GET /api/v1/agent/tools/{name}`, and `POST /api/v1/agent/tools/{name}/run` (blocks, returns the result; `POST /api/v1/agent/tools/{name}/stream` returns the one-shot result over SSE frames instead, not a per-token stream) / `POST /api/v1/agent/tools/{name}/runAsync` (returns `{ job_id }`, poll `jobs`) to invoke a tool with no session — read-only by default, a mutating tool needs `allow_mutations: true` or a confirmed re-issue) and the per-session surface (`GET /api/v1/agent/sessions/{id}/tools` for a session's *effective* tool set, `GET /api/v1/agent/sessions/{id}/tools/mcp`, and `POST /api/v1/agent/sessions/{id}/tools/{name}/run`). Unlike the sessionless `POST /api/v1/agent/tools/{name}/run`, a per-session run executes against the session's *frozen* realm/container/cwd/tool-mode and claims the session's single serial turn slot — so it returns 409 `turn_in_flight` while a turn is running, 409 `gate_parked` while a gate is open, and 404 `tool_not_found` if the tool is not in that session's effective list; whether a mutating tool may run is decided by the live session's own tool mode and confirmation settings (the `allow_mutations` escape hatch is sessionless-only).
- **One-shot non-interactive runs** — `POST /api/v1/agent/headless/runs` runs the full agent loop once over a throwaway session (see workflow 7 for the per-surface form: an async job or an SSE stream).
- **GitHub from inside the agent** — first establish an account with `POST /api/v1/agent/github/auth/login` (omit the body for a GitHub device flow → poll `POST /api/v1/agent/github/auth/login/poll`; or pass a `token` PAT to persist it directly), then `GET /api/v1/agent/github/auth/status` to confirm; once an account is active, `POST /api/v1/agent/github/clone` / `POST /api/v1/agent/github/commit` (and `GET /api/v1/agent/github/status` / `GET /api/v1/agent/github/branches` / `GET /api/v1/agent/github/repos` / `POST /api/v1/agent/github/pr` / `POST /api/v1/agent/github/sync`) for repo operations the agent performs in-container.

## When NOT to use

- Want the interactive TUI, not the API? Run the bare `hoody agent` launcher — it opens the in-container Agent TUI over the terminal-kit WebSocket; this namespace is the HTTP control surface beside it.
- Raw shell / command exec → `terminal` (PTY) or `exec` (one-shot). File I/O → `files`. The agent runs these as tools internally; call them directly when you don't need the LLM.
- Account-level resources (containers, billing, realms) → `api`.

## Prerequisites

- Container with the `agent` kit running; capability URL.
- At least one usable model provider before prompting: one with a stored API key, a stored OAuth login, or passwordless access (the shipped default agent is pinned to a passwordless model). `GET /api/v1/agent/providers` and `GET /api/v1/agent/models` list the CATALOGUE, which is populated whether or not anything is configured; `GET /api/v1/agent/providers/{id}/auth` reports whether a provider is actually usable (`ready`, with `api_key_stored`, `oauth_stored` and `no_auth_ready` behind it).
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

`POST /api/v1/agent/sessions` → `POST /api/v1/agent/sessions/{id}/prompt:sync` with `{ text }` — waits for the turn to end, a gate that needs a person, or the server deadline (290 seconds by default). A clean turn returns `{status:"done", session_id, turn_id}` with no reply text; check `status`, because a failed, cancelled or quit turn answers `error` (with the error `event`), `canceled` or `quit`. A turn that parks on a gate returns `{pending_gate, turn_id}`. When the deadline passes first the answer is `503 service_unavailable` with `details.turn_id` and `details.turn_running: true`: the turn is NOT cancelled, so follow it with `GET /api/v1/agent/sessions/{id}/turns/{turn_id}` (or the stream) instead of prompting again. Read the reply with `GET /api/v1/agent/sessions/{id}/transcript`. Best for short, non-interactive prompts where you don't need streamed events.

### 3. Resolve gates mid-turn

While a prompt streams, the agent may pause for human input: a confirmation gate → `POST /api/v1/agent/sessions/{id}/confirm` / `POST /api/v1/agent/sessions/{id}/confirm`; an open question → `POST /api/v1/agent/sessions/{id}/answer` (to get a helper model to DRAFT an answer for a parked question call `POST /api/v1/agent/sessions/{id}/answer:assist` — it does NOT answer the gate: it dispatches an async job (HTTP 202) whose suggestion arrives via `GET /api/v1/agent/jobs/{id}/result` and an `event.question_suggestion` on the session stream — only one assist may be in flight per session — and the real answer still goes through `POST /api/v1/agent/sessions/{id}/answer`; for unattended runs arm `PATCH /api/v1/agent/sessions/{id}/auto-reply` (a self-driving auto-user loop that withholds write-class actions unless you opt in with `allow_writes: true`, either on the arm call or later via `PATCH /api/v1/agent/sessions/{id}/auto-reply/writes`)). The gate identity to echo is the ENVELOPE-level `gate {id, generation, type}` that the stream frame parking the gate carries beside `seq` / `incarnation` / `event`. The `event.confirm_request` payload also has a numeric `gate_id`, but that is the daemon's id space and is never the value to echo. The answer body for a question gate: the envelope's gate id as `gate_id` (optionally its `generation`), then **answer** (or **text**, used when **answer** is blank) for a single question; for a batch (`event.user_question` carrying `questions[]`), `answers` maps each `questions[].id` to its answer text, for example `{"gate_id":"<gate.id>","answers":{"<questions[].id>":"yes"}}`. A body with no `POST /api/v1/agent/sessions/{id}/answer`, no `text` and no `answers` is `400 bad_request` and the question stays parked. The `question_id` on `event.user_question` is a diagnostic number, not a body field. Echoing a wrong/stale `gate_id`/`generation`, or answering when nothing is parked, returns 409 (`no_pending_gate` / `stale_gate` / `gate_already_answered` / `gate_type_mismatch`). On a session whose approval policy is `always` and whose approver lease was ever minted (`POST /api/v1/agent/sessions/{id}/approver-lease`, or the lease handed back by a create or attach that asserted `always`), EVERY decision — `POST /api/v1/agent/sessions/{id}/confirm` / `POST /api/v1/agent/sessions/{id}/confirm`, and the confirmed re-issue of a gated `POST /api/v1/agent/sessions/{id}/tools/{name}/run` — must carry the current lease capability in the `X-Hoody-Approver-Lease` request header. Without it the decision is refused `409 approver_lease_required`, a capability that does not verify is `409 approver_lease_invalid`, and an expired one is `approver_lease_expired` until a holder acquires again. Interrupt a running turn with `POST /api/v1/agent/sessions/{id}/cancel`. Tear the session down: `POST /api/v1/agent/sessions/{id}/close` removes it from the live map; `DELETE /api/v1/agent/sessions/{id}` drops the live connection but keeps the persisted record (re-attach with `POST /api/v1/agent/sessions` with `{ "attach": "<id>" }`), while a *hard* delete also erases the persisted record: `DELETE /api/v1/agent/sessions/{id}?hard=true`. To roll a session back without tearing it down, `POST /api/v1/agent/sessions/{id}/trim` with `{ turn_idx }` truncates conversation history to (and including) that turn index.

### 4. Pick a model / provider

`GET /api/v1/agent/providers` to list the catalogued providers (and `GET /api/v1/agent/providers/{id}/auth` to check that one is `ready`: a stored credential or passwordless access), `GET /api/v1/agent/models` to list the catalogued models, then `PATCH /api/v1/agent/sessions/{id}/model` to bind a model to a session before prompting — SYNCHRONOUS: the response reports the actual outcome ({status:'ok', model, persisted} on success; structured 409/422 errors while busy or for an unconstructable spec). A successful switch is live for the session at once and then TRIES to persist into the chat agent's frontmatter (a global repin for future sessions of that agent); that save is best-effort, so only `persisted: true` confirms the repin — `persisted: false` means the session switched but future sessions keep the old pin. PRECEDENCE: the agent's frontmatter `model` is the DEFAULT for a session that does not request one; an explicit model on create (`POST /api/v1/agent/sessions` with `{ "model": "..." }`), or this live `PATCH /api/v1/agent/sessions/{id}/model`, OVERRIDES that pin for the session — create is session-scoped and does not rewrite the agent, this live switch repins globally. The shipped default agent ships pinned, so its pin is the out-of-the-box default until an explicit model is chosen (an explicit model together with `attach` or `backend: "acp"` is rejected 400 — a resumed/delegated session cannot take an explicit model). Each session has further per-session knobs (all session-scoped PATCHes that apply live): `PATCH /api/v1/agent/sessions/{id}/effort` (`{ effort }` — `low|medium|high|xhigh|max`, or `""` for the model default), `PATCH /api/v1/agent/sessions/{id}/verbosity` (`{ level }` — `normal|concise|terse|minimal`), `PATCH /api/v1/agent/sessions/{id}/hoody-env` (`{ enabled }` — toggle whether the `HOODY_*` shell-env contract is injected for the bash tool), and `PATCH /api/v1/agent/sessions/{id}/agent` (`{ agent }` — bind a named profile from `agents`).

To use a model from an endpoint that is not in the catalogue (anything that speaks the OpenAI Chat Completions, OpenAI Responses or Anthropic Messages API from a public HTTPS address, such as a model server you run yourself or a company gateway), add it as a **custom provider** first. `POST /api/v1/agent/providers` takes `id`, `base_url` and `models`, then `PUT /api/v1/agent/providers/{id}/auth/api-key` stores its key (a key never goes in the create body), and its models are `<model_prefix>/<model>` wherever a model is chosen: `model` on `POST /api/v1/agent/sessions`, `PATCH /api/v1/agent/sessions/{id}/model` or `PATCH /api/v1/agent/agents/{name}/model`. `PATCH /api/v1/agent/providers/{id}` changes it and `DELETE /api/v1/agent/providers/{id}` removes it with its stored key. The change applies at once, with no restart: new sessions, model switches and Jev see it, and an open session on one of its models picks it up before its next turn. `id` is 1-40 lowercase letters, digits or inner hyphens and cannot change later; `model_prefix` is the `id` unless given, and must equal it; `wire_format` is `chat_completions` (default), `responses` or `messages`, and `auth_scheme` follows it (`bearer`, or `x-api-key` for `messages`). Built-in providers refuse update and delete (`409 provider_builtin`), as does a provider defined in a project's providers file (`409 provider_not_managed`). See Examples for the full run.

### 5. Skills, memory, todos, workflows, agents

- **Skills** — `GET /api/v1/agent/skills` (each carries an enabled + trust state), `POST /api/v1/agent/skills/hub/install` / `GET /api/v1/agent/skills/hub/search` / `GET /api/v1/agent/skills/hub/preview` to find and install from the hub. A newly installed/imported skill must be trusted before its code runs — `POST /api/v1/agent/skills/trust` is the gate (identify the skill by `root_dir`+`rel_dir`, set the `trusted` flag); `POST /api/v1/agent/skills/toggle` / `POST /api/v1/agent/skills/toggle` only enable or disable by `name` (set the `disabled` flag). Both `POST /api/v1/agent/skills/trust` (which grants arbitrary code-execution trust) and `POST /api/v1/agent/skills/hub/install` (which writes arbitrary skill code to disk) take effect immediately over this namespace: there is no confirmation step, and no privilege beyond ordinary access to the kit is required, so an autonomous caller can silently trust and install skill code. Add your own confirmation before exposing these to one.
- **Memory** — `POST /api/v1/agent/memory/search` for hybrid recall (BM25 + vector + graph) and `GET /api/v1/agent/memory/items` to enumerate by `project`; `POST /api/v1/agent/memory/items` / `PATCH /api/v1/agent/memory/items/{id}` / `DELETE /api/v1/agent/memory/items` to write; `GET /api/v1/agent/memory/graph` for the relation graph (or `GET /api/v1/agent/memory/items/{id}` to read one record by `id`). `PUT /api/v1/agent/memory/enabled` / `PUT /api/v1/agent/memory/enabled` are the memory capture/privacy switch — they persist `features.memory` and flip the live store — and `POST /api/v1/agent/memory/flush` forces the store's durability barrier; none of the three is admin-gated. Memory is project-scoped (pass `project`). Memory reads and item writes accept `X-Hoody-Realm` or `?realm=` to select `global` or a realm id (in the SDK, pass `realm` in the method's options); omitted, the agent's current realm is used. A realm this login does not serve returns `404 not_found`; an agent pinned to one realm refuses another with `400 realm_scope_unsupported`. If the selected realm's memory is not connected, the request returns `503 service_unavailable` with `Retry-After` and does not connect it. `POST /api/v1/agent/memory/consolidate` remains human-only; see Common errors. `POST /api/v1/agent/memory/search` / `GET /api/v1/agent/memory/graph` also return `503 store_unavailable` while the store is still warming — retry rather than treating it as an empty result.
- **Todos** — `GET /api/v1/agent/todos` / `POST /api/v1/agent/todos` to file; then `POST /api/v1/agent/todos/triage` (LLM inbox pass), `POST /api/v1/agent/todos/{id}/claim` / `POST /api/v1/agent/todos/{id}/release`, `POST /api/v1/agent/todos/{id}/run` (dispatch a background orchestrator — returns `{job_id, session_id}`), `POST /api/v1/agent/todos/{id}/cancel-run` to abort an in-flight run, and `POST /api/v1/agent/todos/{id}/proposals/{pid}/approve` / `POST /api/v1/agent/todos/{id}/proposals/{pid}/deny` to resolve a proposed run — approve is NOT inert: it spawns a background worker session equivalent to `POST /api/v1/agent/todos/{id}/run` (a J-class autonomous run that spends model budget), while `POST /api/v1/agent/todos/{id}/proposals/{pid}/deny` spawns nothing — plus `POST /api/v1/agent/todos/{id}/snooze` / `POST /api/v1/agent/todos/{id}/archive`. To move a todo between states (`inbox`, `ready`, `blocked`, `review`, `done`, `dropped`) or edit its fields, `PATCH /api/v1/agent/todos/{id}` applies a CAS-guarded patch / `state` transition (`in_progress` is entered only by `POST /api/v1/agent/todos/{id}/claim` / `POST /api/v1/agent/todos/{id}/run`; `PATCH /api/v1/agent/todos/{id}` refuses it, and an unknown state is rejected) — read the todo's OWN `revision` with `GET /api/v1/agent/todos/{id}` and pass it back (`GET /api/v1/agent/todos/revision` is a store-wide change cursor, NOT the CAS token; a stale value → `409 todo_conflict`); a stale revision is rejected (409). `POST /api/v1/agent/todos/{id}/archive` is not terminal — `POST /api/v1/agent/todos/purge` permanently and irreversibly deletes archived todos of the selected realm that were archived more than 90 days ago (and those with a missing or invalid archive time); no confirmation gate, treat as destructive. Mind the comment split: `POST /api/v1/agent/todos/{id}/messages` (`/messages`, plural) only appends a comment, whereas `POST /api/v1/agent/todos/{id}/message` (`/message`, singular) ALSO kicks an orchestrator turn — a budget-spending LLM run that returns `{job_id}` — so use the plural form for a plain note. The `job_id` returned by `POST /api/v1/agent/todos/{id}/run`, `POST /api/v1/agent/todos/{id}/message` and `POST /api/v1/agent/todos/triage` completes as `succeeded` the moment the dispatch is accepted; it records the dispatch only, not the worker's outcome. Follow the todo itself (`GET /api/v1/agent/todos/{id}`, its state and timeline) rather than polling that job. Note `POST /api/v1/agent/todos/{id}/run` / `POST /api/v1/agent/todos/triage` / `POST /api/v1/agent/todos/{id}/proposals/{pid}/approve` are J-class autonomous runs with NO confirmation gate on the RPC (reaching the RPC is itself treated as the human approval; that denial lives only on the model-facing `run_todo` *tool*), so calling them from automation silently dispatches a real LLM run — gate them in your own caller.
- **Workflows** — `GET /api/v1/agent/workflows` / `GET /api/v1/agent/workflows/{name}` / `PUT /api/v1/agent/workflows/{name}` / `DELETE /api/v1/agent/workflows/{name}` / `POST /api/v1/agent/workflows/{name}/hide` manage saved definitions; `POST /api/v1/agent/sessions/{id}/workflows/{name}/runs` dispatches one onto a live session and returns a JOB, not a run (optionally seed the run with a `{ prompt }` body — input text fed to the workflow) — poll `GET /api/v1/agent/jobs/{id}` until its `run_id` populates (null during the brief dispatch window), then track via `GET /api/v1/agent/workflows/runs` / `GET /api/v1/agent/workflows/runs/{run_id}` and stop with `POST /api/v1/agent/workflows/runs/{run_id}/cancel`; feed a running workflow with `POST /api/v1/agent/sessions/{id}/workflow/messages` (`{ text }`). Run events flow on the owning session's stream, not a per-run bus.
- **Bots** — `POST /api/v1/agent/bots` opens a long-lived assistant that delegates work to sessions on containers; post to it with `POST /api/v1/agent/bots/{id}/messages` (HTTP 202; a busy Bot queues the message) rather than prompting its session, and see Examples for the full create, message, follow, forget, delete run. Replace its limits with `PUT /api/v1/agent/bots/{id}/guardrails` with `{ guardrails }` (empty clears them): the Bot reads them before its next message and delegates opened afterwards receive them in their first prompt, while delegates already open keep theirs. `allowed_containers` and `allowed_agents` restrict the delegates it opens next (empty means any) and `yolo: true` (default false) asks delegates to approve tool calls automatically. Check `yolo_unapplied` in `GET /api/v1/agent/bots/{id}`: `pending` means a delegate has not confirmed the change yet and it is sent again; `refused` means that delegate's approval policy does not allow YOLO, so it keeps asking for approvals and the change is not sent again until `yolo` changes. `GET /api/v1/agent/bots/{id}/stream` and `GET /api/v1/agent/bots/{id}/log` carry finished rows only; for live reply text, thinking and tool calls follow the Bot's `session_id` (from `GET /api/v1/agent/bots/{id}`, it changes after `POST /api/v1/agent/bots/{id}/reset`) with `GET /api/v1/agent/sessions/{id}/stream`, and do not answer questions on that session whose `frame_request.kind` starts with `bot.`, because the Bot runtime answers them. To stop only the Bot's running turn use `POST /api/v1/agent/sessions/{id}/cancel` on its `session_id`.
- **Agent profiles** — `GET /api/v1/agent/agents` to enumerate named profiles; `POST /api/v1/agent/agents` / `POST /api/v1/agent/agents/{name}/copy` / `POST /api/v1/agent/agents/{name}/rename` / `DELETE /api/v1/agent/agents/{name}`; `GET /api/v1/agent/agents/{name}/source` → edit → `PUT /api/v1/agent/agents/{name}/source` (put the read's `revision` in the body as `expected_revision`: a stale one is refused `409 revision_conflict` and nothing is written; without it the save is unconditional); `PATCH /api/v1/agent/agents/{name}/model` / `PATCH /api/v1/agent/agents/{name}/tools` / `POST /api/v1/agent/agents/{name}/tools/{tool}/toggle` / `PATCH /api/v1/agent/agents/{name}/turns` / `POST /api/v1/agent/agents/{name}/reset-to-shipped`. The product-owned `bot` profile (the one a Bot runs) allows only a model pin through `PATCH /api/v1/agent/agents/{name}/model` (an empty model clears it); `PUT /api/v1/agent/agents/{name}/source`, `PATCH /api/v1/agent/agents/{name}/tools`, `POST /api/v1/agent/agents/{name}/tools/{tool}/toggle` and `PATCH /api/v1/agent/agents/{name}/turns` are refused for it with `400 bad_request`, as are creating over it and renaming it, and a Bot's own `model` overrides the pin. To make a session use a profile, `PATCH /api/v1/agent/sessions/{id}/agent` (`{ agent }`) — that selects, it does NOT edit the profile. Two daemon guard rails: `DELETE /api/v1/agent/agents/{name}` refuses the configured default chat agent, and a shipped-default profile that has no removable override of its own (`is_error:true` — use `POST /api/v1/agent/agents/{name}/reset-to-shipped` or `PUT /api/v1/agent/agents/{name}/source` instead); in a realm that holds its own saved override of a shipped profile, deleting it removes the override and the shipped version shows through again, and `POST /api/v1/agent/agents/{name}/reset-to-shipped` refuses a profile that has no shipped default (`is_error:true`).

### 6. Fire-and-observe, recurring prompts, and re-attach

- **Fire-and-observe** — `POST /api/v1/agent/sessions/{id}/messages` with `{ text }` dispatches a turn and returns `{ job_id, session_id, turn_id }` immediately (HTTP 202) without streaming or blocking; watch completion via the `agent_done` on the session event stream (a connected `GET /api/v1/agent/sessions/{id}/stream` socket, or `GET /api/v1/agent/sessions/{id}/stream`) whose `turn_id` matches (another client's turn on the same session ends with its own `agent_done`). A cancel scoped with that `turn_id` stops only this turn. Refuses with 409 `turn_in_flight` if a turn is running, or 409 `gate_parked` if a gate is open.
- **Observe / re-attach** — `GET /api/v1/agent/sessions/{id}/stream` attaches to a live session's full `event.*` stream over WebSocket, and `GET /api/v1/agent/sessions/{id}/stream` is the SSE form of the same route; neither falls back to the other on its own. Either way, pass `since` (gateway int64 seq, or the `Last-Event-ID` header) to resume from the 1024-event replay ring after a disconnect (a gap past eviction yields `event: lagged {code:replay_gap}`). Each frame is `{seq, incarnation, event}`, and a session re-attached under the same id starts a new incarnation whose `seq` restarts at 1, so send `incarnation` (the one you last saw) together with `since`: a mismatch answers `replay_gap` plus the full retained ring instead of silently resuming into a different history. Over SSE the `event:` line drops the `event.` prefix (`event.agent_done` arrives as `event: agent_done`) while the JSON `data:` keeps the full name, so match ordinary event frames on the parsed payload's `event.type` (for example `event.agent_done`); control frames (`lagged`, `end`, `replay_boundary`) have no `event` key. WebSocket frames are delivered unchanged. `GET /api/v1/agent/sessions/{id}/replay` returns the buffered event tail of a *live* session (with `min_seq`/`max_seq`) for a one-shot catch-up (only a *live* session has this ring). `GET /api/v1/agent/sessions/{id}/stream` does not revive a session either: on a persisted but non-live session it answers `404 not_found`, so re-attach it first (`POST /api/v1/agent/sessions` with `{"attach":"<id>"}`), then open the stream.
- **Recurring prompts (loops)** — `POST /api/v1/agent/sessions/{id}/loops` with `{ prompt, interval }` (plus optional `max_runs` / `stop_when` / `max_cost_usd` / `max_wall_ms` caps) schedules a prompt to re-fire on a live session; `GET /api/v1/agent/sessions/{id}/loops` / `PATCH /api/v1/agent/sessions/{id}/loops/{loopId}` (pause via `{ paused: true }`) / `DELETE /api/v1/agent/sessions/{id}/loops/{loopId}` to manage, `POST /api/v1/agent/sessions/{id}/loops/{loopId}/run-now` to fire one immediately. Loops are entirely session-scoped. Three rules refuse a request rather than adjusting it: `interval` has a floor of 60 seconds; at most 8 loops can be active (not paused, not ended) per daemon, so the 9th create is rejected; and each `PATCH /api/v1/agent/sessions/{id}/loops/{loopId}` carries at most ONE intent (`paused`, or `expires_in`, or the budget fields `max_cost_usd` / `max_wall_ms`), so a request mixing two is rejected 400 (a body with none of them is treated as a budget update).

### 7. Headless one-shot run

The run's shape is chosen by the request BODY, not by a header: the default (`format` `text` or `json`) is an async job — HTTP 202 `{ job_id }`, then poll `GET /api/v1/agent/jobs/{id}` and fetch the output with `GET /api/v1/agent/jobs/{id}/result` — while `format: "stream-json"` (or `stream: true`) streams the run over SSE (`start` → `result` or `error` → `end`). A failure after the acknowledgement (a timeout, `admin_unauthorized`) arrives later, in the job result or as the `error` frame, never as the HTTP status. Every confirm, plan and question auto-approves in a headless run, so treat it as arbitrary code execution. `POST /api/v1/agent/headless/runs` with `{ "prompt": "..." }` returns 202 `{ "job_id": "..." }`; add `"format": "stream-json"` to read `text/event-stream` instead.

### 8. Configure MCP servers for a session

Reads first: `GET /api/v1/agent/mcp/servers` (`{ session_id }`) returns the EFFECTIVE merged `mcp_servers` config, the per-layer settings files behind it, and each server's LIVE runtime state (connected, negotiated protocol revision, tool count, pid, revocation reason, recent stderr). Every write is TWO steps: `POST /api/v1/agent/mcp/write-intents` (`{ session_id, op, scope }`, op ∈ the strings "upsert", "delete", "set_enabled" and "import", scope ∈ `user`|`project`|`local`; an omitted scope means `user`, or `project` when the session has no user layer, which is the usual case for a container session — read the returned target path to confirm where the write lands) mints a single-use nonce bound to {session, op, resolved settings path} and returns the target path plus the current `mcp_servers` hash — then present that `nonce` plus the hash as `expect_hash` on the matching `PUT /api/v1/agent/mcp/servers` / `DELETE /api/v1/agent/mcp/servers` / `POST /api/v1/agent/mcp/servers/enable` / `POST /api/v1/agent/mcp/servers/enable` / `POST /api/v1/agent/mcp/import`. BOTH are required on every write: skipping step one fails closed, a nonce minted for a different op or scope fails closed, and `expect_hash` has no omit-it default — a first write into a settings file that does not exist yet states that expectation with the empty-array hash rather than leaving the field out. To adopt someone else's config, preview it with `POST /api/v1/agent/mcp/parse` (`{ session_id, document }` — writes nothing, needs no nonce, strips credential values) and then `POST /api/v1/agent/mcp/import` with a fresh `op: "import"` nonce; imported servers land DISABLED, so enable each one with `POST /api/v1/agent/mcp/servers/enable`. After editing a settings file by hand, or to recover a server that died, `POST /api/v1/agent/mcp/reconnect` (`{ session_id }`) re-reads the layers and reconciles every live session's pool — a healthy unchanged server is not restarted. `POST /api/v1/agent/mcp/probe` trials a candidate config without saving it, but it is human-only (see Common errors).

## Quirks & gotchas

- The bare `hoody agent` verb is a **TUI launcher**, separate from this HTTP namespace; they coexist — the launcher opens the in-container Agent TUI, the namespace is the typed control surface. In that TUI, Ctrl+V pastes from the clipboard of the machine the CLI runs on, and Shift+click opens a link (the TUI tracks the mouse).
- Source of truth is the agent kit's own OpenAPI document, served at `GET /api/v1/agent/openapi.{json,yaml}`; every route lives under the single `/api/v1/agent` prefix. The kit checks no credential of its own and asks for no bearer header; access is decided by the container's proxy permission policy. Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only. A request that does not come through the kit URL gets 403 `forbidden`, so call the kit URL.
- The proxy service slug is `agent` and the kit URL host carries the index segment (`-agent-{index}`). Build it as `https://{projectId}-{containerId}-agent-{index}.{server}.containers.hoody.com` (see § Proxy URLs).
- `POST /api/v1/agent/sessions/{id}/prompt:sync` waits for the turn to end (or returns `{pending_gate}` the moment a turn parks on a confirm/question), but at most until the server deadline (290 seconds by default): a turn still running then answers `503 service_unavailable` with `details.turn_running: true` and keeps running; prefer streamed prompting for anything non-trivial so you can observe progress and resolve gates as they arrive. (The `prompt:stream` route emits **SSE** (`Content-Type: text/event-stream`), so POST it and read the event stream directly. It does NOT close when the turn ends: stop reading at the `agent_done` whose `turn_id` matches the `X-Hoody-Turn-Id` response header and close the connection yourself.) For non-interactive turns where you cannot resolve gates by hand, enable the `auto_approve` gate policy to answer confirm gates (off by default). On the blocking form (`POST /api/v1/agent/sessions/{id}/prompt:sync`, route `prompt:sync`) it stays on for the dispatched turn even after the request ends. On the streamed form (route `prompt:stream`) it is tied to the connection, not the turn: disconnecting before the turn ends stops it, and while the stream stays open it also answers confirm gates of LATER turns on the same session, so close the stream at your turn's `agent_done`. With either form, an ordinary confirm gate is approved, a gate raised by a tool-call rule is DENIED, and a session whose approval policy is `always` refuses the policy with `409 approval_policy_active` before the turn starts. HTTP: `?policy=auto_approve` (or the `X-Hoody-Gate-Policy: auto_approve` header) on `prompt:stream` / `prompt:sync`. This only answers **confirm** gates, never questions.
- **The agent's shell has the container user's own sudo.** The agent runs as the container's `user`, and its bash tool can use sudo exactly as that user can without a password: with the default passwordless sudo it can `sudo apt-get install`, `sudo systemctl enable --now` a unit and so on. When `user` has no passwordless sudo (the drop-in removed, a password required), the agent's shell has none either, because there is no terminal to type a password into; a policy that allows only some commands without a password allows the same commands to the agent (with sudo's default `listpw`). While the agent's shell can sudo, a session's `dir_scope` (`home`) no longer confines its bash commands: the file tools still keep to the scope, but the shell can reach the whole container, like the terminal kit. To take sudo away from the agent, take passwordless sudo away from `user` (see container-tools); the agent keeps everything else `user` has, such as Docker through the `docker` group.
- Every prompt/gate/cancel call is **session-scoped** — you must hold a session id from `POST /api/v1/agent/sessions` first; there is no implicit default session. Hook writes are session-scoped too (the guarded writes — `PUT /api/v1/agent/hooks` / `DELETE /api/v1/agent/hooks` / `POST /api/v1/agent/hooks/toggle` / `POST /api/v1/agent/hooks/toggle` / `POST /api/v1/agent/hooks/disable-all` / `POST /api/v1/agent/hooks/disable-all` — plus `POST /api/v1/agent/hooks/begin-write`, and the side-effecting `POST /api/v1/agent/hooks/test` / `POST /api/v1/agent/hooks/trust/ack`, all require a live `session_id` — `POST /api/v1/agent/hooks/trust/ack` clears the per-session hook-trust prompt (the execution-trust probe `GET /api/v1/agent/hooks` reports), the gate that must be acknowledged before a saved hook command is allowed to fire, mirroring `POST /api/v1/agent/skills/trust` for skills; `POST /api/v1/agent/hooks/reload` accepts one only to also return the reloaded summary) AND nonce-guarded: call `POST /api/v1/agent/hooks/begin-write` (`{ session_id, op, scope }`, op ∈ upsert|delete|toggle|set_disabled|rules_set; `rules_set` is for `POST /api/v1/agent/hooks/rules` and needs its own matching nonce) to mint a single-use nonce, then pass that `nonce` on the matching `PUT /api/v1/agent/hooks` / `DELETE /api/v1/agent/hooks` / `POST /api/v1/agent/hooks/toggle` / `POST /api/v1/agent/hooks/toggle` / `POST /api/v1/agent/hooks/disable-all` / `POST /api/v1/agent/hooks/disable-all` — the nonce binds to that session+op+scope tuple and the write fails closed without it. Note hooks are an arbitrary-command surface: `PUT /api/v1/agent/hooks` persists a command that fires on lifecycle events, and `POST /api/v1/agent/hooks/test` on a command hook runs a command at once: running saved hooks goes through the session's hook-trust gate, while a run that supplies an unsaved inline `command` runs it without that saved-hook trust check. Every command-hook run is refused (`approval_policy_unsatisfiable`) while the session's approval policy is `always`, and `POST /api/v1/agent/hooks/test` of a shipped hook only evaluates its trigger without running anything. These calls carry no confirmation step of their own — the same access that authorizes any agent-kit call authorizes these too, with nothing extra — so add your own confirmation before exposing this surface to an autonomous caller.
- **`env` and `headers` VALUES are never returned by the MCP surface; every other field comes back verbatim.** `GET /api/v1/agent/mcp/servers` reports `env_keys` / `header_keys` — key NAMES only — because a redacted value invites a client to write the placeholder back as the real secret; a write whose body carries the redaction placeholder for a credential is REFUSED rather than stored. Other fields, including `url`, `command` and `args`, are echoed verbatim, so a credential embedded in one of them (a token in a URL, a key on a command line) is NOT redacted: keep secrets in `env` / `headers`, and treat the rest of a listing as sensitive. To change a secret you must supply its real value; to leave one alone, omit the field — `PUT /api/v1/agent/mcp/servers` merges FIELD BY FIELD over the existing entry of the same name, so omitted fields keep their stored value (including fields this build does not model), and `env` / `headers` merge per key (a key set to `null` is deleted, `{}` clears the map). A genuine re-point (a changed `type`, `command`, `args` or `url`) clears `env` and `headers` unless the same request re-supplies them, so send the credentials the new target needs in that write; restating the identity you read back is not a re-point. `POST /api/v1/agent/mcp/servers/enable` / `POST /api/v1/agent/mcp/servers/enable` flip only the `enabled` flag so credentials and options survive a disable. Writes apply to live sessions before the response returns: a deleted, disabled, or re-pointed server is REVOKED in every live session first (a stdio child is reaped when its last holder releases), so a caller mid-turn cannot still reach it. Import is WHOLE-BATCH — one bad entry aborts everything — it understands the hoody (`mcp_servers` list), Claude/Cursor (`mcpServers` map) and VS Code (`servers` map) dialects, and REFUSES a document carrying more than one of them rather than guessing.
- `POST /api/v1/agent/hoody/auth/bootstrap` (token bootstrap) is enabled by default; a deployment can turn it off, and then every call answers 404. Browser clients may call it; the body must be exactly `application/json`. Where the deployment requires a capability, the body must carry the matching `capability` (a mismatch is also 404). The token must belong to this box's owner and carry the full login grant (otherwise 403). On a box with no credential it installs (201 `installed`) and adopts any local sessions or todos that have no owner; on a box logged in to the SAME account it replaces the stored token whether or not it expired (200 `renewed`). A token for a different account is refused `409 agent_login_conflict`, and a credential supplied through the environment is never replaced (`409 credential_present`).

## Common errors

- A model rate limit can end the turn: `event.error.code` is `quota_wait_too_long` or `rate_limit`, and `agent_done.error_code` carries the same code. For `quota_wait_too_long`, read `retry_after_secs` from the error payload, wait that many seconds, then send the message again: the turn ended instead of waiting. `retry_after_secs` is omitted on other errors, so do not assume it exists for `rate_limit`.
- A gate or question left unresolved stalls the turn — a streamed prompt that emitted an `event.confirm_request` (confirm gate) or `event.user_question` (question gate) will not complete until you answer it: `POST /api/v1/agent/sessions/{id}/confirm` / `POST /api/v1/agent/sessions/{id}/confirm` for a confirm, `POST /api/v1/agent/sessions/{id}/answer` for a question. For unattended runs, arm `PATCH /api/v1/agent/sessions/{id}/auto-reply` (a self-driving auto-user loop), or pass `policy: "auto_approve"` on the prompt — but `auto_approve` only answers **confirm** gates (approving ordinary ones, denying rule-raised ones; refused with `409 approval_policy_active` on an `always` session), never questions; a parked question still stalls until `POST /api/v1/agent/sessions/{id}/answer` (or the auto-reply loop) answers it.
- `GET /api/v1/agent/sessions/{id}/tasks` and `GET /api/v1/agent/sessions/{id}/tasks/{tid}/transcript` return their data INLINE and need no live session and no attached stream. `GET /api/v1/agent/sessions/{id}/tasks` is the UNION of the live task registry and the session's PERSISTED task store (keyed by task id, live winning) — the live registry evicts completed tasks when a new one spawns, so a finished task can leave memory while its transcript is still durable, and a live-only list would hide it. `GET /api/v1/agent/sessions/{id}/tasks/{tid}/transcript` reads a task that reached a terminal state even for a closed session and after a daemon restart; a task still RUNNING when the daemon died is NOT recoverable and reads 404. Its `source` field is `"live"` or `"store"`, and `complete` reports whether the response reflects a terminal projection DURABLY COMMITTED to that store. `after_seq` is EXCLUSIVE (entries strictly after it, plus any still-open entry); OMITTING it returns the whole transcript, which is distinct from `after_seq=0`. `POST /api/v1/agent/sessions/{id}/tasks/{tid}/cancel` / `POST /api/v1/agent/sessions/{id}/tasks/cancel` still act on a LIVE session and stop background tasks mid-turn (server-layer; tasks survive `POST /api/v1/agent/sessions/{id}/cancel` but are not restartable).
- `POST /api/v1/agent/memory/consolidate` (POST /memory/consolidate) is **human-only and ALWAYS fails over this namespace** — it has no successful HTTP/SDK/CLI path: a call that passes the admin check returns `403 human_only`, and the admin check can refuse it first with `403 admin_unauthorized`. It can only be triggered from an interactive human session. Do not call it programmatically.
- `POST /api/v1/agent/mcp/probe` (POST /mcp/probe) is **human-only and ALWAYS fails over this namespace** — probing STARTS A PROCESS (stdio) or makes an outbound request to a caller-chosen URL (http/sse), so a machine caller may not self-approve it and receives `403 human_only` on every HTTP/SDK/CLI call. The surface still exposes it for completeness, it simply always refuses. The deny list is still enforced on the candidate config before anything is started. Use `POST /api/v1/agent/mcp/parse` for a write-free preview instead; there is no programmatic substitute for the live trial.
- An MCP write needs BOTH a `nonce` and an `expect_hash` — neither is optional, and a stale hash is a CONFLICT rather than a silent overwrite. `PUT /api/v1/agent/mcp/servers` / `DELETE /api/v1/agent/mcp/servers` / `POST /api/v1/agent/mcp/servers/enable` / `POST /api/v1/agent/mcp/servers/enable` / `POST /api/v1/agent/mcp/import` each require a fresh single-use `nonce` from `POST /api/v1/agent/mcp/write-intents` minted for that exact op and scope (one minted for a different op or scope fails closed) AND the `mcp_servers` hash you last read, from either `POST /api/v1/agent/mcp/write-intents` or `GET /api/v1/agent/mcp/servers`. A mismatch means someone else edited the layer since you read it — re-read, re-mint, retry; each nonce is good for exactly one write, so a retry always needs a new one. There is no "omit it for the first write" shortcut: writing into a settings file that does not exist yet means passing the empty-array hash.
- `DELETE /api/v1/agent/workflows/{name}` removes **user** workflows and saved customizations. A built-in/**system** workflow that you never customized is refused (`is_error:true`) and re-seeds on every boot; `POST /api/v1/agent/workflows/{name}/hide` is the only way to remove it from view. Deleting your saved customization of a system workflow succeeds and brings the shipped version back: at once in a scoped realm, at the next daemon restart otherwise.
- Empty values on agent-profile edits mean *inherit / unrestrict*, not *clear to nothing*: `PATCH /api/v1/agent/agents/{name}/model` with `model: ""` removes the model line (falls back to the default model), and `PATCH /api/v1/agent/agents/{name}/tools` with `tools: []` removes the allow-list line, which means **all tools are allowed** (NOT zero). Pass a non-empty `tools` array to genuinely restrict.
- Prompting with no usable model/provider configured fails the turn. `GET /api/v1/agent/providers` lists every catalogued provider whether or not it is set up, so check the one you intend to use with `GET /api/v1/agent/providers/{id}/auth` before you prompt (blocking or streamed): `ready` is true for a stored API key, a stored OAuth login, or a passwordless provider (`no_auth_ready`).
- A custom provider's `base_url` must be an `https` URL with no user name, password, query or fragment, at a public address; one that is not (an internal address, a name that only resolves inside a network, or a name that resolves to an internal address when a request is made) is refused `422 provider_invalid` with `details.field` `base_url`. Create is not idempotent by itself: repeating a create that went through answers `409 provider_exists`, so send an `Idempotency-Key` to retry safely (the same key with another body is `422 idempotency_key_reused`). Deleting a provider leaves an open session on one of its models unconfigured: its next prompt fails with `session_unconfigured` until you switch it to another model, and agents and Jev settings that name one of its models fail the same way until changed.
- Calling prompt/gate/cancel against a session whose live connection was torn down (`POST /api/v1/agent/sessions/{id}/close`, or `DELETE /api/v1/agent/sessions/{id}` without `hard`) returns not-found. If the record survives, re-attach with `POST /api/v1/agent/sessions` with `{ "attach": "<id>" }`; otherwise start a fresh session (the same create call without `attach`). After a *hard* delete (the `hard` flag set) the record is gone and only a fresh session works.

## Related namespaces

`terminal`, `exec`, `files`, `notes`, `api`.

## Examples

A **Bot** here is the agent's long-lived assistant (routes under `/api/v1/agent/bots`). It opens delegate sessions on containers, follows them and reports back. It is not the chat-app `bot` namespace. Set `P`, `C`, `N` from `GET /api/v1/containers/{id}` first. The Bot's id below is `release-bot`; omit `id` on create to have one generated, and take it from the response.

### 1. Create a Bot, message it, follow its replies, forget, delete

**Goal:** run a Bot end to end. `guardrails` are limits on the work (they apply to the Bot and every delegate it opens), not instructions. A Bot lives in one realm: pass `realm` (`X-Hoody-Realm`) to pick one, otherwise the agent's current realm is used. The Bot's own session opens when the first message is posted, so `session_id` is empty until then.

**Step 1 — create.** Send `id` to make a retry safe: a second create with the same id answers `409 bot_exists`.

```bash
K="https://${P}-${C}-agent-1.${N}.containers.hoody.com"
curl -sS -X POST "$K/api/v1/agent/bots" -H 'Content-Type: application/json' \
  -d '{"id":"release-bot","name":"Release bot","role":"Ships the weekly release.","guardrails":"Never push to main."}'
```

**Step 2 — message it.** The answer is `202` with `{message_id, state}`: `posted` (with `turn_id`) when the Bot is free, `queued` while it is busy, and the message goes out when its turn ends. Add an `Idempotency-Key` to retry safely.

```bash
curl -sS -X POST "$K/api/v1/agent/bots/release-bot/messages" -H 'Content-Type: application/json' \
  -d '{"text":"Check the staging build and tell me if it is green."}'
```

**Step 3 — follow the replies.** The stream carries finished log rows only: first a `state` frame (the Bot), then `row` frames, plus `lagged`, `archived` and `end`. The reply is one `bot` row written when its turn ends, and a turn with no reply text writes none. Resume with `since` (or `Last-Event-ID`). For live text, thinking and tool calls, follow the Bot's own `session_id` with `GET /api/v1/agent/sessions/{id}/stream` instead. To read without streaming, page the log: pass `next_since` back as `since` while `has_more` is true.

```bash
curl -sS -N "$K/api/v1/agent/bots/release-bot/stream"
curl -sS "$K/api/v1/agent/bots/release-bot/log?since=0"
```

**Step 4 — forget or reset.** `POST /api/v1/agent/bots/{id}/forget` moves the log to the archive and clears the conversation; the Bot keeps its settings and delegates. `reset` also archives the log but starts a new session with the Bot's current model, which is how a changed `model` takes effect. The old session is not closed. Neither deletes the archive; `POST /api/v1/agent/bots/{id}/purge` does.

```bash
curl -sS -X POST "$K/api/v1/agent/bots/release-bot/forget"
curl -sS -X POST "$K/api/v1/agent/bots/release-bot/reset"
```

**Step 5 — delete.** Removes the Bot with its log and archive, after a best-effort stop of its working delegates. Its session and delegates are not closed: they stay listed under the sessions and a person can continue them. There is no stop route for the Bot itself: to stop its running turn, cancel its `session_id` with `POST /api/v1/agent/sessions/{id}/cancel`.

```bash
curl -sS -X DELETE "$K/api/v1/agent/bots/release-bot"
```

### 2. Add a custom provider, store its key, use its model

**Goal:** connect an OpenAI-compatible endpoint and run a session on one of its models. The provider id below is `acme`; its model is selected as `acme/llama-3.3-70b`.

**Step 1 — create it.** `id`, `base_url` and `models` are required. Add an `Idempotency-Key` so a retry answers with the provider the first try created instead of `409 provider_exists`. The reply carries the provider, with each model's `spec`.

```bash
K="https://${P}-${C}-agent-1.${N}.containers.hoody.com"
curl -sS -X POST "$K/api/v1/agent/providers" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: acme-create-1' \
  -d '{"id":"acme","base_url":"https://api.acme.example/v1","models":[{"model":"llama-3.3-70b","context_window":131072}]}'
```

**Step 2 — store its key.** The key has its own route and is never returned.

```bash
curl -sS -X PUT "$K/api/v1/agent/providers/acme/auth/api-key" -H 'Content-Type: application/json' \
  -d "{\"api_key\":\"$KEY\"}"
```

**Step 3 — use its model.** Start a session on it; `PATCH /api/v1/agent/sessions/{id}/model` switches an open one and `PATCH /api/v1/agent/agents/{name}/model` pins an agent profile.

```bash
curl -sS -X POST "$K/api/v1/agent/sessions" -H 'Content-Type: application/json' \
  -d '{"model":"acme/llama-3.3-70b"}'
```

**Step 4 — change or remove it.** Update names only what changes (`models` and `headers` replace the current list and map; `id` and `model_prefix` are fixed). Delete asks for confirmation on the CLI and removes the stored key too.

```bash
curl -sS -X PATCH "$K/api/v1/agent/providers/acme" -H 'Content-Type: application/json' \
  -d '{"base_url":"https://eu.api.acme.example/v1"}'
curl -sS -X DELETE "$K/api/v1/agent/providers/acme"
```

## Reference

### `acp` (4) — Process-wide settings (home settings.json)

| Method | Summary | Params |
|--------|---------|--------|
| `PUT /api/v1/agent/acp/agents/{agent}/enabled` | Enable or disable a BYOA ACP backend. | `H:X-Hoody-Realm` `body` |
| `GET /api/v1/agent/acp/agents` | Get BYOA ACP backend status. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `PUT /api/v1/agent/acp/agents/{agent}/model` | Set a BYOA backend's default model and effort. | `H:X-Hoody-Realm` `body` |
| `PUT /api/v1/agent/acp/agents/{agent}/secrets/{key}` | Store an ACP per-agent secret value. | `body` |

**Param notes:**

- `agent` — The agent.
- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.
- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `key` — The key.

**Body shapes:**

- `PUT /api/v1/agent/acp/agents/{agent}/enabled` body — `{ enabled: bool }` — Whether the backend is armed for delegated sessions.
  - `enabled` — True arms the backend; false disarms it. Defaults to true when omitted.
- `PUT /api/v1/agent/acp/agents/{agent}/model` body — `{ model: string, effort: string }` — The default model / effort for this backend. An empty string clears the pin.
  - `model` — Backend model id or alias. Empty clears the pin.
  - `effort` — Reasoning effort (backend-specific; empty clears).
- `PUT /api/v1/agent/acp/agents/{agent}/secrets/{key}` body — `{ value: string }` — The secret value to store (never returned). An empty value clears the reference.
  - `value` — The env secret value. Empty string clears (unsets) the reference. Stored only in the agent's owner-only secrets file.

### `agent` (3) — Hoody operations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/hoody/auth/bootstrap` | Sign this container's agent in to the Hoody platform with a token of the box's owner. Until then the agent's shell and file tools answer "not logged in". | `body*` |
| `POST /api/v1/agent/stop` | Stop everything running in the realm. | `H:X-Hoody-Realm` `body` |
| `GET /api/v1/agent/hoody/auth/status` | Hoody platform identity and realm scope. |  |

**Param notes:**

- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.

**Body shapes:**

- `POST /api/v1/agent/hoody/auth/bootstrap` body — `{ token*: string, capability: string }` — The platform token to install (write-only; never returned) and an optional operator capability.
  - `token` — The raw Hoody platform token to install. Write-only; validated via the sidecar before install and never echoed.
  - `capability` — The operator bootstrap capability, required only on deployments configured with one; a mismatch is answered 404.
- `POST /api/v1/agent/stop` body — `{ after: string }` — Optional. Omit (or send {}) to start from the first item.
  - `after` — A next_cursor from an earlier call, unchanged (the cursor is opaque): act only on the items after it. Any other value is 400 bad_request.

### `bots` (15) — Bots operations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/bots` | Create a Bot. | `H:X-Hoody-Realm` `body` |
| `DELETE /api/v1/agent/bots/{id}` | Delete a Bot. | `H:X-Hoody-Realm` |
| `POST /api/v1/agent/bots/{id}/forget` | Make a Bot forget its conversation. | `H:X-Hoody-Realm` |
| `GET /api/v1/agent/bots/{id}` | Get a Bot. | `H:X-Hoody-Realm` |
| `GET /api/v1/agent/bots/{id}/archive` | Read a Bot's archive. | `?since` `?limit` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/bots/{id}/log` | Read a Bot's log. | `?since` `?limit` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/bots` | List the Bots. | `?realm` `?page` `?limit` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/bots/{id}/delegates` | List a Bot's delegates. | `?state` `?page` `?limit` `H:X-Hoody-Realm` |
| `POST /api/v1/agent/bots/{id}/purge` | Delete a Bot's archive. | `H:X-Hoody-Realm` |
| `POST /api/v1/agent/bots/{id}/reset` | Give a Bot a new session. | `H:X-Hoody-Realm` |
| `POST /api/v1/agent/bots/{id}/messages` | Post a message to a Bot. | `H:Idempotency-Key` `H:X-Hoody-Realm` `body*` |
| `PUT /api/v1/agent/bots/{id}/guardrails` | Replace a Bot's guardrails. | `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/bots/{id}/delegates/{sid}/stop` | Stop one of a Bot's delegates now. | `H:Idempotency-Key` `H:X-Hoody-Realm` `body` |
| `GET /api/v1/agent/bots/{id}/stream` | Follow a Bot's log (SSE). | `?since` `H:Last-Event-ID` `H:X-Hoody-Realm` |
| `PATCH /api/v1/agent/bots/{id}` | Change a Bot's settings. | `H:X-Hoody-Realm` `body` |

**Param notes:**

- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.
- `since` — Return only rows whose seq is greater than this: the next_since of the previous page. Default 0. _(on `GET /api/v1/agent/bots/{id}/archive`, `GET /api/v1/agent/bots/{id}/log`)_
- `limit` — At most this many rows: 100 when omitted or 0, at most 500 (a larger value reads 500). Negative or non-integer = 400. These routes page by since, not by page number: ?page is 400. _(on `GET /api/v1/agent/bots/{id}/archive`, `GET /api/v1/agent/bots/{id}/log`)_
- `realm` — The realm to list: "global" (Bots not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves, global included. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination). _(on `GET /api/v1/agent/bots`, `GET /api/v1/agent/bots/{id}/delegates`)_
- `state` — open or closed: list only the delegates in that state. Omitted: both.
- `Idempotency-Key` — Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key and text returns the same message_id and the message's current state, and queues nothing again; the same key with a different text is 422. A key is remembered while its message is queued and for at least 24 hours after it was accepted. _(on `POST /api/v1/agent/bots/{id}/messages`)_
- `Idempotency-Key` — Opaque retry key (1–255 printable ASCII, no whitespace). The same stop sent again with the same key returns its outcome; the same key with a different close is 422. _(on `POST /api/v1/agent/bots/{id}/delegates/{sid}/stop`)_
- `since` — Return only rows whose seq is greater than this. Default 0. _(on `GET /api/v1/agent/bots/{id}/stream`)_
- `Last-Event-ID` — SSE resume cursor: the id (a non-negative integer seq) of the last frame received. It overrides ?since, and an SSE client sends it on reconnect. Another value is 400 bad_request.

**Body shapes:**

- `POST /api/v1/agent/bots` body — `{ id: string, name: string, role: string, model: string, guardrails: string, allowed_containers: string[], allowed_agents: string[], yolo: bool, guardrail_check: "strict" | "lenient" | "off" }` — All fields are optional.
  - `id` — The Bot's id. Omit it to have one generated. It cannot be changed later. To retry a create safely, pass an id: when the first try created the Bot, the retry answers 409 bot_exists.
  - `name` — Display name. Omitted, it is the id.
  - `role` — What the Bot is for, in one paragraph.
  - `model` — The model the Bot's session runs. Omit it for the bot agent's own model. A model no session could start with is refused 422 model_unavailable.
  - `guardrails` — Limits that apply to the Bot and to every delegate it opens.
  - `allowed_containers` — Containers delegates may run on. Empty or omitted means any.
  - `allowed_agents` — Agents delegates may run. Empty or omitted means any.
  - `yolo` — Run every delegate with YOLO mode on (approvals granted without asking). Default false.
  - `guardrail_check` — How the Bot's dispatches and delegate messages are checked against its guardrails before they go out. strict: work that may break a guardrail is refused, and so is work whose check cannot be completed (the Bot tells you and can try again). lenient: work that may break a guardrail is refused; when the check cannot be completed, the work goes ahead unchecked. off: no check. …
- `POST /api/v1/agent/bots/{id}/messages` body — `{ text*: string }`
  - `text` — The message (at most 64 KiB).
- `PUT /api/v1/agent/bots/{id}/guardrails` body — `{ guardrails*: string }`
  - `guardrails` — The new limits; empty clears them.
- `POST /api/v1/agent/bots/{id}/delegates/{sid}/stop` body — `{ close: bool }` — Optional.
  - `close` — Also close the delegate's session for good. Default false.
- `PATCH /api/v1/agent/bots/{id}` body — `{ name: string, role: string, model: string, allowed_containers: string[], allowed_agents: string[], yolo: bool, guardrail_check: "strict" | "lenient" | "off" }` — The fields to change; omitted fields are kept. id, uid, realm, created, created_at and created_by are fixed at creation: naming one is refused 400 field_immutable.
  - `name` — Display name.
  - `role` — What the Bot is for, in one paragraph. Empty clears it.
  - `model` — The model of the Bot's next session, started by POST /bots/{id}/reset; the running session keeps its model. Empty for the bot agent's own model. A model no session could start with is refused 422 model_unavailable and nothing changes.
  - `allowed_containers` — Containers delegates may run on. Empty means any.
  - `allowed_agents` — Agents delegates may run. Empty means any.
  - `yolo` — YOLO mode for every delegate.
  - `guardrail_check` — How the Bot's dispatches and delegate messages are checked against its guardrails before they go out. strict: work that may break a guardrail is refused, and so is work whose check cannot be completed (the Bot tells you and can try again). lenient: work that may break a guardrail is refused; when the check cannot be completed, the work goes ahead unchecked. off: no check. …

### `changes` (2) — Changes operations

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/changes` | Change tokens for the Work lists. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/changes/stream` | Stream the change tokens (SSE). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.

### `completions` (1) — Catalogued models and fusion composites

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/completions` | Run one tool-free model completion. | `body*` `?stream` |

**Param notes:**

- `stream` — Stream the completion as server-sent events.

**Body shapes:**

- `POST /api/v1/agent/completions` body — `{ model*: string, system: string, messages*: { role*: "user" | "assistant", content*: string }[], settings: { thinking: object, temperature: number, max_tokens: int, response_format: object }, timeout_ms: int, max_tokens: int }` — One tool-free model call. Unknown members are refused at every level (400 bad_request, details.field names the JSON path). For every optional member, null is the same as absent.
  - `model` — … The same policy as a session's model: the provider prefix must be catalogued, the model name after it need not be (an uncatalogued name is sent to the provider, which may reject it as upstream_error). An unknown provider or an empty model name is 422 model_unavailable (reason unknown_model); a fusion/ composite is 422 model_unavailable (reason fusion).
  - `system` — Optional system prompt.
  - `messages` — 1 to 1000 turns, oldest first; the last must be a user turn.
  - `settings` — Optional per-call model settings. A setting the model cannot honour is 400 unsupported_setting, never dropped.
  - `timeout_ms` — Deadline for the whole call, 1 to 600000 ms (default 120000). Reaching it is 504 timeout (an error frame once streaming).
  - `max_tokens` — Alias of settings.max_tokens (output-token cap, 1 to 1000000), accepted at the top level as most chat-completion APIs take it. Sending both with different values is 400 bad_request (details.field max_tokens).

### `containers` (1) — API discovery and related-operation hints

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/containers` | List containers in a realm (for binding). | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |

**Param notes:**

- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).
- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.

### `definitions` (12) — Chat-agent definitions and per-agent settings

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/agents/{name}/copy` | Copy a chat agent. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/agents` | Create a chat-agent definition. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `DELETE /api/v1/agent/agents/{name}` | Delete a custom chat agent. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/agents/{name}/source` | Read a chat agent's source. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/agents` | List chat-agent definitions. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `POST /api/v1/agent/agents/{name}/rename` | Rename a chat agent. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/agents/{name}/reset-to-shipped` | Reset an agent to its shipped default. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `PATCH /api/v1/agent/agents/{name}/model` | Set an agent's model. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `PUT /api/v1/agent/agents/{name}/source` | Write a chat agent's source. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `PATCH /api/v1/agent/agents/{name}/tools` | Set an agent's tool allow-list. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `PATCH /api/v1/agent/agents/{name}/turns` | Set an agent's max-turns. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `POST /api/v1/agent/agents/{name}/tools/{tool}/toggle` | Toggle a single tool for an agent. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |

**Param notes:**

- `name` — The name.
- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).
- `tool` — The tool.

**Body shapes:**

- `POST /api/v1/agent/agents/{name}/copy` body — `{ new_name*: string }` — Destination name (the source {name} comes from the path).
  - `new_name` — Name for the copied agent.
- `POST /api/v1/agent/agents` body — `{ name*: string, frontmatter: { description: string, model: string, tools: string[], effort: "adaptive" | "low" | "medium" | "high" | "max", max_turns: int, max_steps_per_turn: int, labels: string[], strict_tools: bool, mcp_tools: string[], skills: string[], prompt_blocks: object, ask_timeout: string | int, thinking: "enabled" | "disabled", temperature: number, response_format: "json_object", compaction: "same_prefix", compaction_max_tokens: int }, system_prompt: string }` — Chat-agent definition.
  - `name` — Agent name (the definition file stem).
  - `frontmatter` — … Any other key is rejected. strict_tools is a boolean: true gives the agent EXACTLY its tools list — no skill or workflow tool is added, no MCP tool unless mcp_tools names it, and a call to any other tool is refused — and with no tools list it gets only ask_question_to_user, todo_read …
  - `system_prompt` — The agent's system prompt body.
- `POST /api/v1/agent/agents/{name}/rename` body — `{ new_name*: string }` — New agent name (the current {name} comes from the path).
  - `new_name` — New agent name.
- `PATCH /api/v1/agent/agents/{name}/model` body — `{ model: string }` — New model line (the {name} comes from the path).
  - `model` — Model spec (e.g. anthropic/claude-opus-4-8); "" removes the frontmatter model line.
- `PUT /api/v1/agent/agents/{name}/source` body — `{ content*: string, expected_revision: string }` — New agent source (the {name} comes from the path).
  - `content` — … Frontmatter is read as one `key: value` per line: a `tools:` line must be a comma-separated list on that same line, because a YAML block list underneath it parses to NOTHING and the agent is then granted every tool — the opposite of the restriction it looks like. The turn cap is spelled `max_turns`; a `turns` line is ignored.
  - `expected_revision` — … A save whose source changed since is refused 409 revision_conflict (details.current_revision) and writes nothing. … The revision is bound to the realm this request resolves to: on a gateway without a realm pin, a revision read while another realm was active is refused 409 revision_conflict (details.current_revision is this realm's), never written into the other realm.
- `PATCH /api/v1/agent/agents/{name}/tools` body — `{ tools*: string[] }` — New tool allow-list (the {name} comes from the path).
  - `tools` — Tool names allowed for the agent; an empty list removes the line (= all tools).
- `PATCH /api/v1/agent/agents/{name}/turns` body — `{ turns: int }` — New max-turns value (the {name} comes from the path).
  - `turns` — Max agent turns per dispatch.
- `POST /api/v1/agent/agents/{name}/tools/{tool}/toggle` body — `object` — No body fields are read; the agent {name} and {tool} come from the path, and each call flips the tool.

### `files` (1) — Chat-agent definitions and per-agent settings

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/agent-files` | List the files that shape the agents. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |

**Param notes:**

- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).
- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.

### `fusions` (3) — Process-wide settings (home settings.json)

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/agent/settings/fusion/{slug}` | Delete a fusion composite. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `GET /api/v1/agent/settings/fusion` | List fusion composites. | `?include_invalid` `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `PUT /api/v1/agent/settings/fusion/{slug}` | Create or update a fusion composite. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `body*` |

**Param notes:**

- `slug` — The slug.
- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `include_invalid` — When true, also return composites that failed validation as a top-level `invalid` array beside `items` (each with a reason + raw-file index) so a broken composite is diagnosable. An entry with no usable slug, or a duplicate slug, cannot be deleted through this API — see the operation description.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).

**Body shapes:**

- `PUT /api/v1/agent/settings/fusion/{slug}` body — `{ spec*: object }` — The fusion composite spec.
  - `spec` — The fusion definition (name, method, members, ...).

### `gates` (4) — Create, drive, and tear down agent sessions

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/sessions/{id}/answer` | Answer a parked question gate. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `POST /api/v1/agent/sessions/{id}/confirm` | Answer a parked confirm gate (on an always-approval session also --gate-id, --generation and the approver lease). | `H:X-Hoody-Approver-Lease` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `GET /api/v1/agent/gates` | List the gates waiting for a human. | `?include_system` `?realm` `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `POST /api/v1/agent/sessions/{id}/answer:assist` | Propose answers for a parked question (helper model). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.
- `X-Hoody-Approver-Lease` — The approver-lease capability returned by POST /sessions/{id}/approver-lease. Required on every decision (/confirm, or the confirmed re-issue of a gated tool run) on an "always" session whose lease was minted; the daemon verifies it at decision consumption. On renew/release it names the lease to act on.
- `include_system` — When true, also list the gates of daemon-owned system/resident sessions (as `GET /api/v1/curl/sessions` does).
- `realm` — The realm to list: "global" (gates not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page, at most 100: 0 or omitted means 100, and a larger value is served as 100 (meta.limit echoes the value used).

**Body shapes:**

- `POST /api/v1/agent/sessions/{id}/answer` body — `{ gate_id: string, generation: int, answer: string, text: string, answers: { [key: string]: string } }` — Question-gate answer. … A body with no answer, no text and no answers is 400 bad_request: nothing is sent and the question stays parked. gate_id/generation are echoes of the parked gate (a mismatch is 409).
  - `gate_id` — Echo of the parked gate id, as published on the frame that parked it (gate.id), by GET /sessions/{id} (pending_gate.id) and in 409 details. Valid only for the session in the path. Optional for compatibility, but an answer without it applies to whatever gate is parked when it arrives — a client binding an answer to a gate the user saw must send it. Ids are unique per session incarnation, so an id from before a re-attach never matches (stale/mismatch → 409).
  - `generation` — Optional echo of the parked gate generation. It restarts when the session is re-attached, so it is not an identity on its own — send gate_id.
  - `answer` — Free-form answer text. When it is absent or blank, text is used in its place. It may be empty when text or answers carries the answer.
  - `text` — Answer text used when answer is absent or blank; ignored otherwise.
  - `answers` — Structured per-field answers for a multi-field question.
- `POST /api/v1/agent/sessions/{id}/confirm` body — `{ gate_id: string, generation: int, approved*: bool, reason: string, persist_dirs: bool, remember: bool, superseded: bool, session_scope: bool, trust_container: bool, request_id: string, lease_generation: int }` — … On a session that requires approval on every action, gate_id and generation are required as well as approved, and once the session's approver lease was minted every decision also carries it in X-Hoody-Approver-Lease. gate_id/generation are echoes of the parked gate (a mismatch is 409). request_id is optional. approved is always required: a confirm without a boolean approved is rejected 400 (approved_required) and the gate stays parked. … On a session that requires approval on every action they are required too: a confirm missing any of them is rejected 400 and the gate stays parked.
  - `gate_id` — Echo of the parked gate id, as published on the frame that parked it (gate.id), by GET /sessions/{id} (pending_gate.id) and in 409 details. Valid only for the session in the path. Optional for compatibility, but an answer without it applies to whatever gate is parked when it arrives — a client binding an answer to a gate the user saw must send it. Ids are unique per session incarnation, so an id from before a re-attach never matches (stale/mismatch → 409). Required on a session that requires approval on every action: a confirm without it is rejected 400.
  - `generation` — Echo of the parked gate generation. It restarts when the session is re-attached, so it is not an identity on its own — send gate_id. Optional on a default-policy session; required, and non-zero, on a session that requires approval on every action.
  - `approved` — Required: true to approve, false to deny. There is no default; a missing, null or non-boolean value is rejected 400.
  - `reason` — Optional, with approved false only: why the action is refused. The agent reads it in the refused call's result, flattened to one line, together with the instruction not to reach the same effect another way. At most 500 characters; sent with approved true, or longer, it is rejected 400 bad_request.
  - `persist_dirs` — Persist an approved directory grant to settings.json (WS↔REST parity).
  - `remember` — … Omitted or true, approving a file change also lets later changes to that file run without asking for the rest of the session, and persist_dirs is honoured; false asks again for the next change and saves nothing to settings.json (persist_dirs is ignored).
  - `superseded` — With approved false only, and no reason or session_scope: the call is declined because the user sent a new message instead of answering. … Sent with approved true, a reason or session_scope, it is rejected 400 bad_request.
  - `session_scope` — Remember this decision for the rest of the session (the Allow/Deny for session answer): with approved true the tool stops asking, with approved false it is refused without asking. Offer allow-for-session only when the gate's event.confirm_request carried offer_session_allow. Under a locked approval policy the wider grant is refused, but the one-shot decision still applies and the reply says so (session_scope_applied false, note).
  - `trust_container` — With approved true, accept the gate's exec_trust offer (event.confirm_request): the call runs and exec cards on that container in this realm stop until the grant is revoked (`POST /api/v1/agent/hooks/rules` exec_trust). Ignored when the gate carried no offer or the approval policy is locked.
  - `request_id` — Optional: the caller's own id for this decision, at most 64 characters from A-Z, a-z, 0-9, '.', '_' and '-' (anything else is 400 bad_request). When this decision is the one the gate consumed, a later 409 gate_already_resolved for the gate echoes it as details.request_id, so a caller that lost the 200 knows the recorded decision is its own.
  - `lease_generation` — … A decision carrying the lease capability (X-Hoody-Approver-Lease) is checked against the current lease whatever it sends; without one, a stale generation is refused. …
- `POST /api/v1/agent/sessions/{id}/answer:assist` body — `{ mode: string, model: string, gen: int }` — Helper-model suggestion request (all optional).
  - `mode` — Suggestion mode (default "suggest").
  - `model` — Helper model override; empty uses the configured helper.
  - `gen` — Generation counter to correlate the suggestion event (echoed as event.question_suggestion gen).

### `github` (30) — GitHub auth, repos, clone, status, commit, sync, PRs

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/github/pr/checkout` | Check out a pull request. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/github/clone` | Clone a GitHub repository. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `POST /api/v1/agent/github/branch` | Create a branch. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/github/commit` | Stage all and commit. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` `?push` |
| `POST /api/v1/agent/github/issues` | Open an issue. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/github/pr` | Open a pull request. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/github/worktrees` | Add a linked worktree. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/github/branch/delete` | Force-delete a local branch. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/github/worktrees/remove` | Remove a linked worktree. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `GET /api/v1/agent/github/diff` | Read the working-tree diff. | `?staged` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/github/auth/status` | GitHub auth status. | `H:X-Hoody-Realm` |
| `GET /api/v1/agent/github/status` | GitHub working-tree status. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/github/branches` | List GitHub branches. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/github/log` | Read recent commit history. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/github/issues` | List issues. | `?owner*` `?repo*` `?state` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/github/pr` | List pull requests. | `?owner*` `?repo*` `?state` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/github/repos` | List GitHub repos. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/github/worktrees` | List linked worktrees. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `POST /api/v1/agent/github/auth/login` | Start a GitHub device-flow login (or add a PAT). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `POST /api/v1/agent/github/auth/logout` | Remove a linked GitHub account. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/github/pr/merge` | Merge a pull request. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/github/auth/login/poll` | Poll a GitHub device-flow login to completion. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/github/stash/pop` | Restore the most recent stash entry. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `POST /api/v1/agent/github/stash` | Stash the working tree. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `GET /api/v1/agent/github/identity` | Resolve the bound repository's owner/name. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `POST /api/v1/agent/github/repo/reconnect` | Re-write a checkout's GitHub credential. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `POST /api/v1/agent/github/commit/suggest-message` | Draft a commit message with a model. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/github/sync` | Sync (fetch → pull → push). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `POST /api/v1/agent/github/auth/active` | Switch the active GitHub account. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/github/branch/switch` | Switch to an existing branch. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.
- `push` — Stage, commit and push in one call.
- `staged` — When true, return the STAGED (index) diff — what a commit would record — instead of the unstaged working-tree diff. Defaults to false. Accepts true/1/yes/on; every other value, including an empty one, is false.
- `owner` — Repository owner (user or org login). Required — not derived from the bound checkout; `GET /api/v1/agent/github/identity` returns it. _(on `GET /api/v1/agent/github/issues`)_
- `repo` — Repository name without the owner. Required, same source as `owner`. _(on `GET /api/v1/agent/github/issues`)_
- `state` — Which issues to return: open (the default when omitted), closed, or all. _(on `GET /api/v1/agent/github/issues`)_
- `owner` — Repository owner (user or org login), e.g. "octocat". Required — it is NOT derived from the bound checkout; `GET /api/v1/agent/github/identity` returns it. _(on `GET /api/v1/agent/github/pr`)_
- `repo` — Repository name without the owner, e.g. "Hello-World". Required, same source as `owner`. _(on `GET /api/v1/agent/github/pr`)_
- `state` — Which pull requests to return: open (the default when omitted), closed, or all. An unrecognized value is passed through to GitHub, which rejects it. _(on `GET /api/v1/agent/github/pr`)_

**Body shapes:**

- `POST /api/v1/agent/github/pr/checkout` body — `{ number*: string | int }` — The pull request to check out (cwd-scoped).
  - `number` — The PR number (required): a positive decimal string such as "42", or the JSON integer `GET /api/v1/agent/github/pr` returns. An empty value, 0, a fraction, a negative or anything non-numeric is refused, so a branch name or URL can never be smuggled in as a target.
- `POST /api/v1/agent/github/clone` body — `{ repo: string, dir: string, clone_root: string, full_name: string, clone_url: string, shallow: bool, flat: bool, persist_credentials: bool }` — The clone request. … At least one form is required; a request with NEITHER is rejected. …
  - `repo` — The repository to clone: "owner/name" or an https github URL (https://<host>/<owner>/<name>[.git]). Translated to full_name + clone_url against the active account host. Supply this OR the canonical full_name+clone_url; if both, the canonical fields win.
  - `dir` — Optional managed clone root override; the traversal-safe parent/dest are derived under it.
  - `clone_root` — Canonical form of `dir`; wins when both are sent.
  - `full_name` — Canonical "owner/name" (alternative to `repo`; used as-is when supplied, taking precedence over a derived value). Requires clone_url.
  - `clone_url` — Canonical https clone URL (alternative to `repo`; re-validated against the active account host; takes precedence over a derived value). Requires full_name.
  - `shallow` — Shallow clone (default true).
  - `flat` — Optional, default false. true clones to <root>/<name> instead of <root>/<owner>/<name>. An existing checkout at that path is reused only when its origin is the same repository; anything else there is refused. Must be a JSON boolean.
  - `persist_credentials` — … Must be a JSON boolean.
- `POST /api/v1/agent/github/branch` body — `{ branch*: string }` — The branch to create (cwd-scoped).
  - `branch` — The new branch name (required). Validated as a safe ref name before it reaches git — a leading dash, a whitespace/control character, or a name git itself would reject is refused with a 400.
- `POST /api/v1/agent/github/commit` body — `{ message*: string }` — The commit request (cwd-scoped).
  - `message` — The commit message.
- `POST /api/v1/agent/github/issues` body — `{ title*: string, body: string }` — The issue to create (the repository comes from the cwd scope).
  - `title` — The issue title (required, non-empty — the daemon refuses an empty title).
  - `body` — The issue body. Optional; an omitted body creates the issue with an empty description.
- `POST /api/v1/agent/github/pr` body — `{ title*: string, body: string, base: string }` — The pull-request request.
  - `title` — The PR title (required, non-empty).
  - `body` — The PR description.
  - `base` — Optional base branch (default the repo default).
- `POST /api/v1/agent/github/worktrees` body — `{ path*: string, branch: string, start_ref: string }` — The worktree to add (the repository comes from the cwd scope).
  - `path` — Where to create the worktree (required). Lexically validated and checked against the session's deny list before git runs; a traversing or deny-listed path is refused with a 400. Must not already exist as a non-empty directory.
  - `branch` — Optional NEW branch to create for this worktree (git's -b). Validated as a safe ref name. Omit it to check out an existing ref instead — in which case `start_ref` names what to check out.
  - `start_ref` — Optional ref the worktree starts from — a branch, tag or commit; defaults to the current HEAD. Validated as a safe ref name. With `branch` it is the new branch's start point; without it, the ref to check out.
- `POST /api/v1/agent/github/branch/delete` body — `{ branch*: string }` — The branch to delete (the repository comes from the cwd scope).
  - `branch` — The local branch name (required), as `GET /api/v1/agent/github/branches` reports it. Passed after `--`, so it is never read as an option.
- `POST /api/v1/agent/github/worktrees/remove` body — `{ path*: string, force: bool }` — The worktree to remove (the repository comes from the cwd scope).
  - `path` — The worktree's path (required), as `GET /api/v1/agent/github/worktrees` reports it. Must not be the main checkout.
  - `force` — Optional, default false. Removes the worktree EVEN WITH uncommitted or untracked changes (git worktree remove --force), DISCARDING them — they are not stashed and cannot be recovered. Must be a JSON boolean.
- `POST /api/v1/agent/github/auth/login` body — `{ token: string, host: string, activate: bool }` — Optional login options. Supply `token` to add a PAT directly; omit it to start a device flow. Supply `host` for GitHub Enterprise (GHES).
  - `token` — Optional PAT. When present the login validates + persists this token (no device flow); kept in env, never returned.
  - `host` — GitHub host for GitHub Enterprise (GHES); defaults to github.com. Must match the host on the subsequent poll call.
  - `activate` — Whether the linked account becomes the ACTIVE one. … A non-boolean value is rejected.
- `POST /api/v1/agent/github/auth/logout` body — `{ key*: string }` — The account to remove.
  - `key` — Account handle from `GET /api/v1/agent/github/auth/status` accounts[].key, e.g. "github.com/octocat".
- `POST /api/v1/agent/github/pr/merge` body — `{ number*: string | int, method: "merge" | "squash" | "rebase" }` — The pull request to merge (the repository comes from the cwd scope).
  - `number` — The PR number (required): a positive decimal string such as "42", or the JSON integer `GET /api/v1/agent/github/pr` returns. Anything else — 0, a fraction, a branch name or URL — is refused, so the merge can never target a different PR.
  - `method` — Optional merge method, default merge (a merge commit). squash squashes the PR into one commit; rebase rebases its commits onto the base.
- `POST /api/v1/agent/github/auth/login/poll` body — `{ host: string, device_code*: string, interval: int, expires_in: int, activate: bool }` — The device-flow handle the start reply returned.
  - `host` — The GitHub host (default github.com); must match the start call.
  - `device_code` — The device_code returned by POST /github/auth/login.
  - `interval` — The poll interval (seconds) the start reply returned.
  - `expires_in` — The device-code lifetime (seconds) the start reply returned.
  - `activate` — Whether the account this poll links becomes the ACTIVE one. Defaults to FALSE — the credential is stored without changing which account your next push authenticates as. This is where a DEVICE-flow login activates: the same flag on `POST /api/v1/agent/github/auth/login` applies only to its PAT branch. …
- `POST /api/v1/agent/github/stash/pop` body — `object` — No fields. The pop always targets the most recent entry (stash@{0}) — there is no index selector over HTTP. Send an empty object.
- `POST /api/v1/agent/github/stash` body — `object` — No fields. The stash is always "everything in the bound repository, untracked included" — there is no path selector, no message and no keep-index option over HTTP. Send an empty object.
- `POST /api/v1/agent/github/repo/reconnect` body — `object` — No fields. The checkout is the one the X-Hoody-* scope headers select. Send an empty object.
- `POST /api/v1/agent/github/commit/suggest-message` body — `{ model*: string }` — The model to draft with (the repository comes from the cwd scope).
  - `model` — A concrete model spec, e.g. "anthropic/claude-sonnet-4-6" (required). A fusion/ composite cannot back a one-shot call and is refused.
- `POST /api/v1/agent/github/sync` body — `{ direction: string, set_upstream: bool, force: bool }` — The sync request.
  - `direction` — Optional: "pull" (fetch+pull) or "push" (push only). Default is the full fetch→pull→push.
  - `set_upstream` — Optional, default false: PUBLISH the current branch — push it and make it track the same-named branch on its remote. … Refused (502 sync_step_failed, step code upstream_exists) when the branch already tracks a DIFFERENT remote branch; a no-op when it already tracks exactly that one. …
  - `force` — Optional, default false. … The lease only refuses when the remote moved since this repository last fetched it — and the full sync fetches first, so on a full sync it protects almost nothing. … Ignored by the fetch and pull legs. Must be a JSON boolean.
- `POST /api/v1/agent/github/auth/active` body — `{ key*: string }` — The account to activate.
- `POST /api/v1/agent/github/branch/switch` body — `{ branch*: string }` — The branch to switch to (cwd-scoped).
  - `branch` — An existing branch name (required), as `GET /api/v1/agent/github/branches` reports it. Validated as a safe ref name; the switch fails rather than creating a branch that does not exist.

### `headless` (1) — One-shot headless agent runs

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/headless/runs` | Create a headless one-shot run. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.

**Body shapes:**

- `POST /api/v1/agent/headless/runs` body — `{ prompt: string, workflow: string, inputs: { [key: string]: string }, model: string, format: string, stream: bool, timeout_ms: int }` — The one-shot run request. SECURITY: write-permission is hard-wired OFF and dir-scope is home (no caller opt-in over this surface); but bash/exec are NOT write-gated, so reaching this surface grants RCE — access is decided by the container's proxy permission policy.
  - `prompt` — The prompt to drive the ephemeral session. Required unless workflow is set; with a workflow it is the optional $(workflow.prompt) text.
  - `workflow` — Optional workflow name to run instead of a plain prompt turn.
  - `inputs` — Optional run-time values for the workflow's DECLARED input parameters (declared name → string value; resolves to $(input.<name>) in every step). Only accepted with workflow. A workflow with a REQUIRED declared parameter cannot run without these. Values must be strings; a non-string value is a 400.
  - `model` — Optional model spec for the run.
  - `format` — Output rendering: text | json | stream-json. stream-json (or stream:true) streams the run over SSE; otherwise the run is an async job.
  - `stream` — Force SSE streaming (equivalent to format:stream-json).
  - `timeout_ms` — Optional run timeout in milliseconds (clamped to the hard ceiling).

### `hooks` (11) — Lifecycle hook configuration

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/hooks/begin-write` | Begin a hook write (nonce). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `DELETE /api/v1/agent/hooks` | Delete a hook. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/hooks/toggle` | Toggle a hook. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/hooks/disable-all` | Disable all hooks. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `GET /api/v1/agent/hooks/rules` | Get the tool-call rules. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/hooks` | List hooks. | `?session_id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `POST /api/v1/agent/hooks/reload` | Reload hooks from disk. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `POST /api/v1/agent/hooks/test` | Test-fire a hook. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/hooks/rules` | Set the tool-call rules. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/hooks/trust/ack` | Acknowledge hook trust. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `PUT /api/v1/agent/hooks` | Upsert a hook. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.
- `session_id` — Live session id (hooks are session-scoped; required by the daemon RPC).

**Body shapes:**

- `POST /api/v1/agent/hooks/begin-write` body — `{ session_id*: string, op*: "upsert" | "delete" | "toggle" | "set_disabled" | "rules_set", scope*: string }` — Write target: session, op, and scope the nonce binds to.
  - `session_id` — Live session id (hooks are session-scoped).
  - `op` — The write the nonce authorizes: upsert (`PUT /api/v1/agent/hooks`), delete (`DELETE /api/v1/agent/hooks`), toggle (`POST /api/v1/agent/hooks/toggle`), set_disabled (`POST /api/v1/agent/hooks/disable-all`) or rules_set (`POST /api/v1/agent/hooks/rules`). The nonce is rejected by any other op.
  - `scope` — Scope of the settings file the write targets (e.g. project/user); the nonce binds to its resolved path.
- `DELETE /api/v1/agent/hooks` body — `{ session_id*: string, nonce*: string, scope: string, event*: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", matcher: string, command: string }` — Hook identity + the begin-write nonce (op:delete).
  - `nonce` — The single-use write nonce from `POST /api/v1/agent/hooks/begin-write` minted for op:delete + this scope; the RPC fails closed without it.
  - `scope` — Scope of the settings file to write (must match the nonce's scope).
  - `event` — Lifecycle event of the hook to remove; required — the daemon rejects any value outside the enum.
  - `matcher` — Matcher of the hook to remove, exactly as `GET /api/v1/agent/hooks` reports it. Omit it — or pass "*" — to address the wildcard group.
  - `command` — Command text of the entry to remove (exact match). Omitting it removes EVERY command in the matched event+matcher group.
- `POST /api/v1/agent/hooks/toggle` body — `{ session_id*: string, nonce*: string, scope: string, shipped_id: string, enabled: bool, event: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", matcher: string, command: string, disabled: bool }` — The begin-write nonce (op:toggle) + the session/scope it binds to, plus the operation's own fields.
  - `nonce` — The single-use write nonce from `POST /api/v1/agent/hooks/begin-write` minted for op:toggle + this scope; the RPC fails closed without it.
  - `shipped_id` — Id of a SHIPPED (catalogue) hook to toggle. Selects the shipped branch: pair it with `enabled` and send no event/matcher/command.
  - `enabled` — New state for the shipped hook named by `shipped_id` (true records it in the first settings layer; false removes the key, reverting to the catalogue default). Ignored on the ordinary-hook branch — that branch uses `disabled`.
  - `event` — Lifecycle event of the ordinary hook to toggle; required on that branch (with matcher + command).
  - `matcher` — Matcher of the ordinary hook to toggle, exactly as `GET /api/v1/agent/hooks` reports it (omit — or "*" — for the wildcard group).
  - `command` — Command text of the ordinary hook to toggle (exact match); required on that branch — a toggle must resolve to an existing entry.
  - `disabled` — New state for the ordinary hook: true disables the entry, false enables it. Absent reads as false (enable). Ignored on the shipped branch — that branch uses `enabled`.
- `POST /api/v1/agent/hooks/disable-all` body — `{ session_id*: string, nonce*: string, scope: string, value*: bool }` — The begin-write nonce (op:set_disabled) + the session/scope it binds to, plus the operation's own fields.
  - `nonce` — The single-use write nonce from `POST /api/v1/agent/hooks/begin-write` minted for op:set_disabled + this scope; the RPC fails closed without it.
  - `value` — New kill-switch state: true disables all hooks in this scope, false clears the setting and re-enables them. REQUIRED — an absent value is read as false, i.e. as a re-enable.
- `POST /api/v1/agent/hooks/reload` body — `{ session_id: string }` — Optional session the reload reports on.
  - `session_id` — Optional: without it every live session in a realm the login serves reloads its own hooks, sessions counts those, and the reply has no summary; with it only that session reloads (it must be visible to the caller), sessions is 1, and the reply adds its summary.
- `POST /api/v1/agent/hooks/test` body — `{ session_id*: string, shipped_id: string, event: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", match_value: string, command: string, timeout: int, exit_code: int, payload: object }` — Live session the op resolves against, plus the operation's own fields.
  - `shipped_id` — Id of a SHIPPED (catalogue) hook to DRY-RUN. Selects the predicate-only branch: nothing is executed and `event` is not consulted.
  - `event` — Lifecycle event to fire. Required on every branch except the shipped dry-run; the daemon rejects any value outside the enum.
  - `match_value` — Value the saved hooks' matchers are evaluated against (e.g. the tool name for PreToolUse). Ignored when `command` supplies an inline hook.
  - `command` — On the ordinary branch: an unsaved command to dry-run INLINE (this executes it) instead of the saved matching hooks. On the shipped branch: the sample command the trigger predicate is evaluated against (defaults to a representative failing invocation).
  - `timeout` — Timeout in whole seconds for an inline `command` (positive integers only; a fractional or non-positive value is ignored rather than truncated). Hard-capped at 60s: a larger value, an ignored one, and a saved hook's own longer timeout are all clamped to the 60s test ceiling, so a dry-run can never run longer than that.
  - `exit_code` — Exit code of the sample command on the shipped dry-run branch (default 2).
  - `payload` — Extra fields merged into the hook's stdin JSON. The daemon stamps session_id, cwd, hook_event_name and hook_test itself — values supplied here for those keys are overwritten.
- `POST /api/v1/agent/hooks/rules` body — `{ session_id*: string, nonce*: string, scope: string, rules: { id*: string, text*: string, kind*: "limit" | "check_in" | "guidance" | "playbook", tools: string[], agents: string[] }[], timeout_ms: int, exec_trust: { container_id*: string, realm*: string, name: string, granted_at: string, source: "card" | "rules_panel" }[], expected_revision: string }` — The begin-write nonce (op:rules_set) + the session/scope it binds to, plus the operation's own fields.
  - `nonce` — The single-use write nonce from `POST /api/v1/agent/hooks/begin-write` minted for op:rules_set + this scope; the RPC fails closed without it.
  - `rules` — The complete rule list for the scope (at most 32 checked and 32 guidance/playbook rules; ids unique). An empty array removes the scope's rules.
  - `timeout_ms` — Optional: the scope's Jev budget for one rules check, 100 to 120000 ms; 0 removes it (back to the default 3000). Omit to leave it unchanged. This is the only way to write rules_timeout_ms.
  - `exec_trust` — Optional: the COMPLETE list of per-container exec trust grants, replacing the scope's (at most 64 rows, each (container_id, realm) once, validated all-or-nothing); [] revokes every grant. Accepted only for the user scope (the realm's profile, or the X-Hoody-Config-Dir override); any other scope is 400. …
  - `expected_revision` — … When it no longer matches the scope file (another tab, a hand edit, a timeout change), the write is refused with 409 revision_conflict, nothing is written, and details.current_revision carries the current value: re-read, re-apply the change, begin a new write (the refused call used up its nonce) and retry. … The revision is bound to the realm of the session it is read and written through, so a revision read through another realm's session is refused 409 revision_conflict, on a gateway with or without a realm pin.
- `POST /api/v1/agent/hooks/trust/ack` body — `{ session_id*: string, hash*: string, high_risk: bool }` — Live session the op resolves against, plus the operation's own fields.
  - `hash` — The trust hash being acknowledged, from `GET /api/v1/agent/hooks`' `trust.hash`. Required and non-empty; a hash that no longer matches the live hook config is rejected (anti-TOCTOU).
  - `high_risk` — Acknowledge the elevated-risk grant rather than the ordinary one. The grant KIND is still derived server-side from the reviewed snapshot — this flag cannot widen it.
- `PUT /api/v1/agent/hooks` body — `{ session_id*: string, nonce*: string, scope: string, event*: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", matcher: string, command*: string, timeout: int, name: string, description: string }` — Hook definition + the begin-write nonce (op:upsert).
  - `nonce` — The single-use write nonce from `POST /api/v1/agent/hooks/begin-write` minted for op:upsert + this scope; the RPC fails closed without it.
  - `event` — Lifecycle event the hook fires on; part of the hook's identity triple. Required — the daemon rejects any value outside the enum.
  - `matcher` — Matcher selecting when the hook fires (a tool name, a Claude Code alias such as Bash/Edit, or a regex); part of the identity triple. Omit it — or pass "*" — for the wildcard group.
  - `command` — Command to run when the hook fires; part of the identity triple. Required and non-empty — a different command text addresses a DIFFERENT hook.
  - `timeout` — Per-fire timeout in whole seconds (optional; non-negative whole numbers only — a fractional or negative value is refused, and anything above 86400 (24h) is clamped to it). … Two ceilings override this value at fire time: SessionEnd is always capped at 60s so a hook cannot wedge daemon shutdown, and every fire through `POST /api/v1/agent/hooks/test` is capped at 60s.
  - `name` — … CONDITIONALLY required: a NEW hook (an identity triple event+matcher+command not yet in the settings) is refused 400 without it; on an UPDATE of an existing hook omit it to preserve the stored value. Not in the schema's required list only because of the update case.
  - `description` — Short description of what the hook does. CONDITIONALLY required exactly like name: a NEW hook is refused 400 without it; omit on update to preserve.

### `jev` (6) — Catalogued models and fusion composites

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/jev/decide` | Ask Jev to decide. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `body*` |
| `POST /api/v1/agent/sessions/{id}/jev/decide` | Ask Jev to decide on behalf of a session. | `H:X-Hoody-Realm` `body*` |
| `GET /api/v1/agent/jev/settings` | Read the Jev settings. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` |
| `GET /api/v1/agent/jev/models` | List the models Jev can use. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` |
| `POST /api/v1/agent/jev/test` | Test Jev with one tiny decision. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `body` |
| `PUT /api/v1/agent/jev/settings` | Change the Jev settings. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `body` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.

**Body shapes:**

- `POST /api/v1/agent/jev/decide` body — `{ state*: string | object | (string | number | bool | object | null)[], questions*: { [key: string]: object }, model: string, timeout_ms: int, provider: object, session_id: string, trace: object, user: string, x_session_id: string }` — A Jev decision request. `state` (required) is what the questions are about: a string, a JSON object or a JSON array.
  - `state` — What the questions are about: a string, a JSON object or a JSON array (never null, a number or a boolean). Passed to the provider as is. Array elements are not checked: the schema lists the scalar and object forms, and a nested array is accepted too.
  - `questions` — Question name → {type: noul|choice|score, instructions, criteria}. At least one.
  - `model` — Provider/model spec to use instead of the effective model.
  - `timeout_ms` — Budget for this call in milliseconds (100 to 120000), the one retry included.
  - `provider` — AI provider only: provider routing preferences.
  - `session_id` — AI provider only: session grouping id (up to 256 characters).
  - `trace` — AI provider only: trace configuration.
  - `user` — AI provider only: end-user id (up to 256 characters).
  - `x_session_id` — AI provider only: sent as the x-session-id header.
- `POST /api/v1/agent/sessions/{id}/jev/decide` body — `{ state*: string | object | (string | number | bool | object | null)[], questions*: { [key: string]: object }, model: string, timeout_ms: int, provider: object, session_id: string, trace: object, user: string, x_session_id: string }` — A Jev decision request. `state` (required) is what the questions are about: a string, a JSON object or a JSON array.
- `POST /api/v1/agent/jev/test` body — `{ model: string }` — Optional. An empty body tests the effective model.
  - `model` — A provider/model spec to test instead of the effective model.
- `PUT /api/v1/agent/jev/settings` body — `{ enabled: bool, model: string, timeout_ms: int }` — The fields to change.
  - `enabled` — Whether Jev calls are allowed (default true). When false every decide/test call fails with jev_disabled.
  - `model` — Provider/model spec, e.g. typesafe/jev-latest or AI provider/typesafe/jev-1.13. "" returns to the derived default.
  - `timeout_ms` — Budget in milliseconds for one whole call, the one retry included: 100 to 120000 (default 15000).

### `jobs` (3) — Async job lifecycle (observe / result / cancel)

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/agent/jobs/{id}` | Cancel a pending/running job, or delete a finished record. |  |
| `GET /api/v1/agent/jobs/{id}` | Get an async job's status. |  |
| `GET /api/v1/agent/jobs/{id}/result` | Get an async job's result. |  |

### `kit` (3) — Health, metrics, and operational endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/health` | Standardized health check. |  |
| `GET /api/v1/agent/metrics` | Prometheus metrics. |  |
| `GET /api/v1/agent/version` | Agent API version and capabilities. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.

### `logs` (6) — Structured log query and read

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/logs/export` | Export logs as a downloadable file. | `?source` `?min_level` `?comp` `?session_id` `?text` `?since` `?until` `?event` `?tool` `?model` `?status` `?method` `?min_status` `?max_status` `?errors_only` `?event_type` `?resource_type` `?container` `?kind` `?host` `?since_seq` `?limit` `?format` `?filename` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `GET /api/v1/agent/logs/entries/{ref}` | Read a log entry. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `GET /api/v1/agent/logs/stats` | Log statistics. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `GET /api/v1/agent/logs` | Query logs. | `?source` `?level` `?host` `?session_id` `?run_id` `?since` `?until` `?since_seq` `?before_seq` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `GET /api/v1/agent/logs/sources` | Log sources. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `GET /api/v1/agent/logs/stream` | Stream the log tail (SSE). | `?source` `?level` `?host` `?session_id` `?run_id` `?since_seq` `?limit` `H:Last-Event-ID` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |

**Param notes:**

- `source` — Log source to export (see `GET /api/v1/agent/logs/sources`; one local source, one platform source, or omitted for all local sources). _(on `GET /api/v1/agent/logs/export`)_
- `min_level` — Minimum log level (debug|info|warn|error).
- `comp` — Component filter (daemon source).
- `session_id` — Session id filter. _(on `GET /api/v1/agent/logs/export`)_
- `text` — Case-insensitive substring filter over message+attrs.
- `since` — Lower time bound (RFC3339 or relative like 1h/7d). _(on `GET /api/v1/agent/logs/export`)_
- `until` — Upper time bound (RFC3339 or relative). _(on `GET /api/v1/agent/logs/export`)_
- `event` — Session lifecycle event filter (session source).
- `tool` — Tool name filter (tool source).
- `model` — Model filter (llm source).
- `status` — Tool outcome filter: ok|error|cancelled (tool source).
- `method` — HTTP method filter (activity source).
- `min_status` — Minimum HTTP status (activity source).
- `max_status` — Maximum HTTP status (activity source).
- `errors_only` — Only error rows (activity source; true/false).
- `event_type` — Event type filter (events source).
- `resource_type` — Resource type filter (events source).
- `container` — Container filter (proxy source; empty = all running realm containers). Maps to the daemon's container_id filter.
- `kind` — Proxy row kind: request|response|event (proxy source).
- `host` — Proxy URL host filter (exact or dot-aligned suffix). _(on `GET /api/v1/agent/logs/export`)_
- `since_seq` — Exclusive lower seq bound for incremental exports (local sources). _(on `GET /api/v1/agent/logs/export`)_
- `limit` — TOTAL row cap across the export (default: everything the snapshot matches; platform default 2000). _(on `GET /api/v1/agent/logs/export`)_
- `format` — Export format: jsonl (default) or txt.
- `filename` — Download filename override (reduced to a safe basename).
- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `ref` — The ref.
- `source` — Filter to a log source/facet (see `GET /api/v1/agent/logs/sources`). One local source, or exactly ONE platform source (activity|events|proxy) — mixing them is rejected. _(on `GET /api/v1/agent/logs`)_
- `level` — Filter to a minimum log level.
- `host` — Filter to a host. _(on `GET /api/v1/agent/logs`, `GET /api/v1/agent/logs/stream`)_
- `session_id` — Only entries correlated with this session id (exact match on the entry's session_id). _(on `GET /api/v1/agent/logs`)_
- `run_id` — Only entries correlated with this workflow/task run id (exact match on the entry's run_id). _(on `GET /api/v1/agent/logs`)_
- `since` — Lower TIME bound: RFC3339, or a relative duration like "1h"/"30m"/"7d". This is NOT a cursor — a bare sequence number is rejected 400 (use since_seq). Unparseable values are rejected the same way. _(on `GET /api/v1/agent/logs`)_
- `until` — Upper TIME bound, same forms as since. Paging BACKWARDS by repeatedly lowering until works, but it is coarse (rows sharing a timestamp repeat); before_seq is the exact backwards cursor. _(on `GET /api/v1/agent/logs`)_
- `since_seq` — Forward cursor: return only entries NEWER than this gateway seq. Take it from the previous reply's latest_seq to poll incrementally without re-reading rows. A non-numeric value is rejected 400. _(on `GET /api/v1/agent/logs`)_
- `before_seq` — Backward cursor: return only entries OLDER than this seq. Take it from the SEQ OF THE OLDEST ENTRY THIS PAGE RETURNED — not from oldest_seq, which is the oldest sequence still retained in the ring and is usually far older than the page you just read. Paging back from oldest_seq jumps past every entry in between and returns an empty page, which reads as "history exhausted" when it is not. A non-numeric value is rejected 400.
- `limit` — Caps this page. Omitted it is the daemon default 200; ANY explicit value is clamped to the ring maximum of 500, and limit=0 means 500 rather than 200 — a caller that needs more than 500 rows pages with before_seq/since_seq. A non-numeric value is rejected 400. _(on `GET /api/v1/agent/logs`)_
- `source` — Filter the tail to a log source/facet. _(on `GET /api/v1/agent/logs/stream`)_
- `session_id` — Only entries correlated with this session id. _(on `GET /api/v1/agent/logs/stream`)_
- `run_id` — Only entries correlated with this workflow/task run id. _(on `GET /api/v1/agent/logs/stream`)_
- `since_seq` — Initial resume cursor (the Last-Event-ID header overrides it). A non-numeric value is rejected 400. _(on `GET /api/v1/agent/logs/stream`)_
- `limit` — Caps each poll batch. A non-numeric value is rejected 400. _(on `GET /api/v1/agent/logs/stream`)_
- `Last-Event-ID` — SSE resume cursor — the gateway int64 seq to resume from; OVERRIDES the ?since_seq query param. Sent automatically by an SSE client on reconnect.

### `loops` (5) — Recurring self-paced agent loops

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/sessions/{id}/loops` | Create a loop. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `body*` |
| `DELETE /api/v1/agent/sessions/{id}/loops/{loopId}` | Delete a loop. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `body` |
| `GET /api/v1/agent/loops` | List loops across all sessions. | `?realm` `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `POST /api/v1/agent/sessions/{id}/loops/{loopId}/run-now` | Run a loop immediately. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/loops/{loopId}` | Update a loop. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `body` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.
- `realm` — The realm to list: "global" (loops not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).

**Body shapes:**

- `POST /api/v1/agent/sessions/{id}/loops` body — `{ prompt*: string, interval*: string, max_runs: int, stop_when: { kind: "expression" | "toolCall" | "judgeRef" | "convergence", expr: string, tool: string, check: string, judge: string, args: object, threshold: number, min_iters: int, allow_network: bool }, max_cost_usd: number, max_wall_ms: int, expires_in: string, fire_now: bool }` — Loop definition (the session_id comes from the path).
  - `prompt` — The prompt fired each loop run.
  - `interval` — Run interval as a duration token, for example "30m". Required, with no default: a create without it is rejected. The minimum accepted interval is 60 seconds — a shorter one is refused rather than rounded up.
  - `max_runs` — Stop after this many runs. Omitted, 0 or negative applies the default ceiling of 50 runs; there are no unbounded loops.
  - `stop_when` — Optional stop predicate, evaluated after each run. Omit the field entirely when there is no predicate: a string value is rejected, and that includes the empty string.
  - `max_cost_usd` — Cost ceiling (0 = unlimited).
  - `max_wall_ms` — Wall-clock ceiling in ms (0 = unlimited).
  - `expires_in` — … Without fire_now an expiry shorter than one interval is rejected, because the loop would never fire; with fire_now it must be at least 2 seconds, so the immediate first run can happen.
  - `fire_now` — Run the first fire on the next scheduler tick instead of one interval out; later fires keep the normal cadence. Default false.
- `DELETE /api/v1/agent/sessions/{id}/loops/{loopId}` body — `object` — JSON object of the operation's fields. Every `_`-prefixed key is ignored (removed before dispatch), the request scope (cwd/config_dir) is added from the scope headers, and all other keys are passed through verbatim. The session_id and loop id come from the path; the body is optional.
- `POST /api/v1/agent/sessions/{id}/loops/{loopId}/run-now` body — `object` — No body fields are read; the session id and loop id come from the path.
- `PATCH /api/v1/agent/sessions/{id}/loops/{loopId}` body — `{ paused: bool, expires_in: string, max_cost_usd: number, max_wall_ms: int }` — Exactly one update intent: run state, expiry, or budget.
  - `paused` — Run-state intent (true pauses, false resumes).
  - `expires_in` — Expiry intent: a duration-from-now token, e.g. "2h"; "" or "never" clears it.
  - `max_cost_usd` — Budget intent: the cost ceiling; 0 = unlimited.
  - `max_wall_ms` — Budget intent: the wall-clock ceiling in ms, or a duration token; 0 = unlimited.

### `mcp` (9) — Mcp operations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/mcp/write-intents` | Begin an MCP config write. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `DELETE /api/v1/agent/mcp/servers` | Delete an MCP server. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/mcp/servers/enable` | Enable or disable an MCP server. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/mcp/import` | Import MCP servers from another tool's config. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `GET /api/v1/agent/mcp/servers` | List configured MCP servers. | `?session_id*` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `POST /api/v1/agent/mcp/parse` | Preview an MCP config import. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/mcp/reconnect` | Reload MCP config and reconnect. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/mcp/probe` | Probe an MCP server without saving it. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `PUT /api/v1/agent/mcp/servers` | Create or update an MCP server. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.
- `session_id` — Live session id (MCP config is resolved against the session's settings layers).

**Body shapes:**

- `POST /api/v1/agent/mcp/write-intents` body — `{ session_id*: string, op*: "upsert" | "delete" | "set_enabled" | "import", scope: "user" | "project" | "local" }` — Which write is intended, and in which settings layer.
  - `op` — Which write the nonce authorizes. The minted nonce is valid for this op alone.
  - `scope` — Settings layer to write. Defaults to user, or project when there is no user layer (which is the case under --config-dir).
- `DELETE /api/v1/agent/mcp/servers` body — `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", name*: string, expect_hash*: string }` — Server name, the begin-write nonce (op:delete) and the expected content hash.
  - `session_id` — Live session id.
  - `nonce` — Single-use nonce from `POST /api/v1/agent/mcp/write-intents` minted for op:delete and this scope.
  - `scope` — Settings layer to write. Must match the scope the nonce was minted for.
  - `name` — The server name to remove.
  - `expect_hash` — The mcp_servers hash you last read.
- `POST /api/v1/agent/mcp/servers/enable` body — `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", name*: string, enabled*: bool, expect_hash*: string }` — Server name, desired state, the begin-write nonce (op:set_enabled) and the expected content hash.
  - `nonce` — Single-use nonce from `POST /api/v1/agent/mcp/write-intents` minted for op:set_enabled and this scope.
  - `name` — The server name.
  - `enabled` — true to enable, false to disable.
- `POST /api/v1/agent/mcp/import` body — `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", document: string, servers: { name: string, type: string, command: string, args: string[], url: string, env: object, headers: object, allowed_tools: string[], require_confirmation: bool, enabled: bool }[], replace: bool, expect_hash*: string }` — The document or server array, plus the begin-write nonce (op:import).
  - `nonce` — Single-use nonce from `POST /api/v1/agent/mcp/write-intents` minted for op:import and this scope.
  - `document` — A pasted config document in any supported dialect. Mutually exclusive with the servers field. …
  - `servers` — Explicit server entries, in hoody's own shape (the `PUT /api/v1/agent/mcp/servers` server entry). Mutually exclusive with document. API/SDK only — see document for why this has no CLI flag.
  - `replace` — Overwrite entries whose name already exists. Without it, a collision aborts the whole import.
- `POST /api/v1/agent/mcp/parse` body — `{ session_id*: string, document*: string }` — The document to parse.
  - `document` — A config document in any supported dialect.
- `POST /api/v1/agent/mcp/reconnect` body — `{ session_id*: string }` — Which session to reconcile against.
- `POST /api/v1/agent/mcp/probe` body — `{ session_id*: string, server*: { name: string, type: string, command: string, args: string[], url: string, env: object, headers: object, allowed_tools: string[], require_confirmation: bool, enabled: bool } }` — The candidate server config.
  - `session_id` — Live session id (supplies the deny list and transport policy).
  - `server` — The candidate entry, same shape as `PUT /api/v1/agent/mcp/servers`'s server.
- `PUT /api/v1/agent/mcp/servers` body — `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", expect_hash*: string, server*: { name: string, type: string, command: string, args: string[], url: string, env: object, headers: object, allowed_tools: string[], require_confirmation: bool, enabled: bool } }` — The server entry, the begin-write nonce (op:upsert) and the expected content hash.
  - `nonce` — Single-use nonce from `POST /api/v1/agent/mcp/write-intents` minted for op:upsert and this scope; the RPC fails closed without it.
  - `expect_hash` — The mcp_servers hash you last read, as returned by `POST /api/v1/agent/mcp/write-intents` or `GET /api/v1/agent/mcp/servers`. REQUIRED: a mismatch returns a conflict instead of overwriting a concurrent edit, and a first write into a file that does not exist yet states its expectation with the empty-array hash rather than omitting this.
  - `server` — The server entry. A key set to JSON null inside env or headers deletes that one key.

### `memory` (16) — Long-term memory records (admin browse / CRUD)

| Method | Summary | Params |
|--------|---------|--------|
| `PUT /api/v1/agent/memory/datahost` | Assign this computer as the memory data host. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/memory/consolidate` | Trigger a memory consolidation pass (human-only). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/memory/items` | Save a memory item. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/memory/write-intents` | Begin a guarded memory write (intent). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `body*` |
| `DELETE /api/v1/agent/memory/items` | Delete a memory item. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `body` |
| `DELETE /api/v1/agent/memory/projects/{project}` | Erase a memory project. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `body*` |
| `PUT /api/v1/agent/memory/enabled` | Toggle memory capture. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `body` |
| `POST /api/v1/agent/memory/flush` | Flush the memory store. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `body` |
| `GET /api/v1/agent/memory/datahost` | Read the realm's memory data host. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/memory/graph` | Read a project's memory relation graph. | `?project` `?node_type` `?limit` `?offset` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/memory/items/{id}` | Read a memory item. | `?project` `?kind` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/memory/status` | Read memory subsystem status. | `?project` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/memory/items` | List memory items. | `?project` `?kind` `?type` `?query` `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/memory/projects` | List memory projects. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `POST /api/v1/agent/memory/search` | Search memory (hybrid recall). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `body` |
| `PATCH /api/v1/agent/memory/items/{id}` | Edit a memory item. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `body` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.
- `project` — The project. _(on `DELETE /api/v1/agent/memory/projects/{project}`)_
- `project` — Project key whose graph to read. _(on `GET /api/v1/agent/memory/graph`)_
- `node_type` — Optional node-type filter.
- `limit` — Maximum nodes/edges to return. _(on `GET /api/v1/agent/memory/graph`)_
- `offset` — Pagination offset into the graph.
- `project` — Project key the memory belongs to. _(on `GET /api/v1/agent/memory/items/{id}`)_
- `kind` — Memory kind/store the record lives in. _(on `GET /api/v1/agent/memory/items/{id}`)_
- `project` — Project key to report per-project counts, embedding coverage and last-consolidation for. Omitted: only the whole-store totals are returned. _(on `GET /api/v1/agent/memory/status`)_
- `project` — Project key to scope the listing to. _(on `GET /api/v1/agent/memory/items`)_
- `kind` — Memory kind/store to filter by. _(on `GET /api/v1/agent/memory/items`)_
- `type` — Memory type to filter by (e.g. workflow, fact). kind=memory ONLY — rejected 400 with a lesson/slot/observation kind.
- `query` — Free-text filter over the records. kind=memory ONLY — rejected 400 with a lesson/slot/observation kind.
- `page` — 1-based page number. _(on `GET /api/v1/agent/memory/items`)_
- `limit` — Items per page (1..200). 0 or omitted pages at the 200 ceiling; a value over 200 is clamped to 200. The effective page size is echoed in meta.limit. NOT "no pagination" — the daemon never returns an unbounded set. _(on `GET /api/v1/agent/memory/items`)_
- `page` — 1-based page number for pagination. _(on `GET /api/v1/agent/memory/projects`)_
- `limit` — Maximum items per page (0 = no pagination). _(on `GET /api/v1/agent/memory/projects`)_

**Body shapes:**

- `PUT /api/v1/agent/memory/datahost` body — `{ use_self*: bool, expect_realm: string }` — The assignment, and the realm it is asserted against.
  - `use_self` — Assign THIS computer. Only true is implemented; false is refused 400 unsupported.
  - `expect_realm` — … Required unless X-Hoody-Realm or ?realm= names the realm; refused 400 when neither does (an empty value means the global realm to the daemon, never "unspecified"), and 400 bad_request when it names another realm than they do.
- `POST /api/v1/agent/memory/consolidate` body — `{ project*: string, min_observations: int }` — The consolidation target.
  - `project` — Project key to consolidate (required).
  - `min_observations` — Optional minimum-observations threshold for a fact to be consolidated.
- `POST /api/v1/agent/memory/items` body — `{ project*: string, content*: string, type: string, concepts: string[], files: string[], ttl_days: int, strength: int, expect_realm: string }` — The memory record.
  - `content` — The memory content.
  - `type` — Memory type (e.g. workflow, fact).
  - `concepts` — Concept tags to index the memory under.
  - `files` — File paths the memory is about.
  - `ttl_days` — … Must be a whole number between -2147483648 and 106751 (about 292 years — the longest expiry the store can represent); a value outside that range is REFUSED, never clamped and never treated as no expiry. A fractional value like 30.5 and a numeric string like "30" are both REFUSED too, never truncated or coerced — a silent coercion to 0 would store the memory with no expiry at all while reporting success.
  - `strength` — Initial ranking strength, a whole number from 1 (weakest) to 10 (strongest). Omitted or 0 takes the store's default of 7. Any other value — a negative number, anything above 10, a fractional value or a numeric string — is REFUSED, never coerced and never silently replaced with the default.
  - `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The write is refused when it does not name the realm the request acts in (the named realm, else the agent's active realm), so it cannot land in a realm the caller switched away from.
- `POST /api/v1/agent/memory/write-intents` body — `{ op*: "wipe_project", project*: string, expect_realm: string }` — Which write the intent authorizes, and against which project.
  - `op` — The write this intent authorizes. The minted intent is valid for this op alone.
  - `project` — Project key the write will target. The intent is valid for this project alone.
  - `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The request is refused when it does not name the realm the request acts in (the named realm, else the agent's active realm).
- `DELETE /api/v1/agent/memory/items` body — `{ ids: string[], id: string, name: string, project: string, kind: "memory" | "observation" | "lesson" | "slot", reason: string, expect_realm: string }` — Which memory records to delete. Address them by `ids` (one or many) or, for a slot, by `name` or `id`. A lone `id` is accepted and treated as a one-element `ids`; a native `ids` array wins when both are present.
  - `ids` — Record ids to delete. Required for kind memory/observation/lesson (the empty/default kind included). A `summary:<session_id>`-prefixed id deletes a summary.
  - `id` — A single record id — shorthand for a one-element `ids`. For kind=slot it is the slot NAME (an alias for `name`).
  - `name` — kind=slot: the slot to delete. Takes precedence over `id`.
  - `project` — Project key the records belong to.
  - `kind` — Which store the records live in. Omitted means memory.
  - `reason` — Optional reason recorded on the governance audit row.
  - `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The delete is refused when it does not name the realm the request acts in (the named realm, else the agent's active realm).
- `DELETE /api/v1/agent/memory/projects/{project}` body — `{ nonce*: string, reason: string, expect_realm: string }` — The write intent, and optionally why the project was erased.
  - `nonce` — The single-use intent from `POST /api/v1/agent/memory/write-intents`, minted for op "wipe_project" and this project.
  - `reason` — Optional reason recorded on the audit row.
- `PUT /api/v1/agent/memory/enabled` body — `{ enabled*: bool }` — The desired enabled state.
  - `enabled` — Whether memory capture is enabled.
- `POST /api/v1/agent/memory/flush` body — `object` — … Every `_`-prefixed key is ignored (removed before dispatch), the request scope (cwd/config_dir) is added from the scope headers, and all other keys are passed through verbatim. No fields are required; the request scope (cwd/config_dir) is folded in automatically.
- `POST /api/v1/agent/memory/search` body — `{ project: string, query: string, limit: int, kinds: string[], skip_graph: bool }` — The recall query.
  - `project` — Project key to search within.
  - `query` — The natural-language recall query (privacy-Strip'd server-side).
  - `limit` — Maximum hits to return.
  - `kinds` — Optional memory kinds/stores to restrict the search to.
  - `skip_graph` — Skip the graph-fusion component of recall.
- `PATCH /api/v1/agent/memory/items/{id}` body — `{ project: string, kind: "memory" | "lesson" | "slot", content: string, type: string, concepts: string[], files: string[], strength: int, ttl_days: int, tier: string, context: string, confidence: number, expect_realm: string }` — Patch fields for the memory record (the {id} comes from the path). An absent field preserves the stored value; a present one overwrites it.
  - `project` — Project key the record belongs to.
  - `kind` — Which store the record lives in. Omitted means memory. It selects which of the fields below apply; observation is not editable.
  - `content` — Replacement content. Applies to every kind, and is REQUIRED for kind=slot (a slot edit with no content is refused — use the delete route to remove a slot).
  - `type` — kind=memory: replacement memory type (e.g. workflow, fact).
  - `concepts` — kind=memory: replacement concept tags. The whole list is replaced, and a malformed array is rejected rather than silently truncated.
  - `files` — kind=memory: replacement file paths. The whole list is replaced, and a malformed array is rejected rather than silently truncated.
  - `strength` — kind=memory: replacement ranking strength, a whole number from 1 (weakest) to 10 (strongest). Any other value — 0, a negative number, anything above 10, a fractional value or a numeric string — is REFUSED, never coerced, and the stored strength is left unchanged.
  - `ttl_days` — … Must be a whole number between -2147483648 and 106751 (about 292 years — the longest expiry the store can represent); a value outside that range is REFUSED, never clamped, and the stored expiry is left unchanged. A fractional value like 30.5 and a numeric string like "30" are both REFUSED too, never truncated or coerced.
  - `tier` — kind=memory: replacement storage tier.
  - `context` — kind=lesson: replacement context. Send it verbatim to preserve it — an absent value preserves the stored one, but the field is how the TUI resends it unchanged.
  - `confidence` — kind=lesson: replacement confidence.
  - `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The edit is refused when it does not name the realm the request acts in (the named realm, else the agent's active realm).

### `models` (2) — Catalogued models and fusion composites

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/models/{spec}` | Get a model by spec. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `GET /api/v1/agent/models` | List models. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |

**Param notes:**

- `spec` — The spec.
- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).

### `platform` (1) — Hoody operations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/hoody/auth/bootstrap` | Bootstrap the Hoody platform credential (install-if-absent). | `body*` |

**Body shapes:**

- `POST /api/v1/agent/hoody/auth/bootstrap` body — `{ token*: string, capability: string }` — The platform token to install (write-only; never returned) and an optional operator capability.
  - `token` — The raw Hoody platform token to install. Write-only; validated via the sidecar before install and never echoed.
  - `capability` — The operator bootstrap capability, required only on deployments configured with one; a mismatch is answered 404.

### `providers` (17) — Catalogued models and fusion composites

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/providers/{id}/auth/accounts` | Add an OAuth account to a provider's pool. | `body` |
| `POST /api/v1/agent/providers` | Create a custom provider. | `H:Idempotency-Key` `body*` |
| `DELETE /api/v1/agent/providers/{id}` | Delete a custom provider. |  |
| `DELETE /api/v1/agent/providers/{id}/auth/api-key` | Delete a provider API key. |  |
| `GET /api/v1/agent/providers/{id}` | Get a provider. |  |
| `GET /api/v1/agent/providers/{id}/auth` | Get a provider's auth status. |  |
| `GET /api/v1/agent/providers` | List LLM providers. | `?page` `?limit` |
| `GET /api/v1/agent/providers/{id}/auth/accounts` | List a provider's OAuth account pool. | `?page` `?limit` |
| `DELETE /api/v1/agent/providers/{id}/auth/oauth` | Remove a provider's OAuth login. |  |
| `GET /api/v1/agent/providers/{id}/auth/oauth/{job}` | Poll a provider OAuth login. |  |
| `DELETE /api/v1/agent/providers/{id}/auth/accounts/{key}` | Remove a pooled OAuth account. |  |
| `PUT /api/v1/agent/providers/{id}/auth/api-key` | Store a provider API key. | `body*` |
| `PUT /api/v1/agent/providers/{id}/auth/default` | Set a provider's default credential method. | `body*` |
| `POST /api/v1/agent/providers/{id}/auth/oauth` | Start a provider OAuth login. | `body` |
| `POST /api/v1/agent/providers/{id}/auth/oauth/{job}/code` | Submit a provider OAuth authorization code. | `body*` |
| `PATCH /api/v1/agent/providers/{id}` | Change a custom provider. | `body` |
| `PUT /api/v1/agent/providers/{id}/auth/accounts/{key}/active` | Make a pooled OAuth account active. | `body` |

**Param notes:**

- `Idempotency-Key` — Opaque retry key (1-255 printable ASCII, no whitespace). A retry with the same key and body answers 201 with the provider the first try created; the same key with another body is 422 idempotency_key_reused. Keys are remembered for 24 hours, until the agent restarts.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).
- `job` — The job.
- `key` — The key.

**Body shapes:**

- `POST /api/v1/agent/providers/{id}/auth/accounts` body — `object` — No fields are required; the login flow is started for the {id} provider.
- `POST /api/v1/agent/providers` body — `{ id*: string, model_prefix: string, display_name: string, wire_format: "chat_completions" | "responses" | "messages", base_url*: string, auth_scheme: "bearer" | "x-api-key", headers: { [key: string]: string }, models*: { model*: string, context_window: int, output_limit: int, reasoning: bool }[] }` — The provider definition. id, base_url and models are required.
  - `id` — The provider id: 1-40 lowercase letters, digits or inner hyphens. It cannot be changed later.
  - `model_prefix` — The prefix of the provider's model specs (acme for acme/<model>). It must equal the id; omitted, it is the id. No provider's id or prefix may already use it, and fusion is reserved.
  - `display_name` — Display name. Omitted on create, it is the id.
  - `wire_format` — The API the endpoint speaks: chat_completions (OpenAI-compatible Chat Completions, the default on create), responses (OpenAI Responses) or messages (Anthropic Messages).
  - `base_url` — The endpoint's base URL, the part before /chat/completions, /responses or /v1/messages (e.g. https://api.acme.example/v1). base_url must be an https URL with no user name, password, query or fragment, at a public address: an internal address, a name that only resolves inside a network, or a name that resolves to an internal address when a request is made is refused.
  - `auth_scheme` — How the stored key is sent. It follows wire_format: bearer (Authorization: Bearer <key>) with chat_completions and responses, x-api-key with messages. Omitted, it is that value; any other pairing is refused 422 provider_invalid.
  - `headers` — Static request headers sent on every request, chat_completions only, at most 16. Credential and transport headers (Authorization, x-api-key, api-key, Cookie, Host, Content-Type, Content-Length, Connection and the other hop-by-hop headers) are refused. Values must not contain ${...}. …
  - `models` — The provider's models, 1 to 500, each selectable as <model_prefix>/<model>. On PATCH the list replaces the current one.
- `PUT /api/v1/agent/providers/{id}/auth/api-key` body — `{ api_key*: string }` — The provider API key to store (never returned).
  - `api_key` — The provider API key. Stored in the agent's owner-only credential file; the reply echoes only a prefix.
- `PUT /api/v1/agent/providers/{id}/auth/default` body — `{ default*: string }` — The default credential method to set.
  - `default` — The default method: "api_key" or "oauth". Must be a method the provider supports AND has a stored credential for.
- `POST /api/v1/agent/providers/{id}/auth/oauth` body — `{ add_account: bool }` — Optional OAuth start options.
  - `add_account` — When true, the login ADDS to the provider's OAuth account pool instead of replacing the primary login.
- `POST /api/v1/agent/providers/{id}/auth/oauth/{job}/code` body — `{ code*: string }` — The authorization code or full redirect URL the flow is waiting for.
  - `code` — The authorization code (or the full redirect URL) to complete the exchange.
- `PATCH /api/v1/agent/providers/{id}` body — `{ display_name: string, wire_format: "chat_completions" | "responses" | "messages", base_url: string, auth_scheme: "bearer" | "x-api-key", headers: { [key: string]: string }, models: { model*: string, context_window: int, output_limit: int, reasoning: bool }[], model_prefix: string }` — The members to change; omitted members are kept.
  - `model_prefix` — Fixed at creation. Accepted only when equal to the current prefix; any other value is refused 400 provider_field_immutable.
- `PUT /api/v1/agent/providers/{id}/auth/accounts/{key}/active` body — `object` — No body fields are required; the account is identified by the {key} path value.

### `realms` (2) — API discovery and related-operation hints

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/realms` | List realms (for binding). | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `PUT /api/v1/agent/hoody/realm` | Switch the agent's active realm. | `body*` |

**Param notes:**

- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).
- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.

**Body shapes:**

- `PUT /api/v1/agent/hoody/realm` body — `{ realm_id*: string }` — The realm to select.
  - `realm_id` — A 24-hex realm id, or an empty string for all realms.

### `sessions` (41) — Create, drive, and tear down agent sessions

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/sessions/{id}/tasks/cancel` | Cancel all background tasks. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `POST /api/v1/agent/sessions/{id}/approver-lease` | Acquire the right to answer this session's gates. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/sessions/{id}/attachments` | Hold a live session (and its parked gate) alive. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `POST /api/v1/agent/sessions/{id}/close` | Close the session (teardown). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/sessions/{id}/stream` | Attach to a session's event stream (WebSocket / SSE). | `?since` `?incarnation` `H:Last-Event-ID` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `POST /api/v1/agent/sessions` | Create, fork, or attach a session. | `H:Idempotency-Key` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `DELETE /api/v1/agent/sessions/{id}` | Close (and optionally hard-delete) a session. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `DELETE /api/v1/agent/sessions/{id}/approval/rules/{tool}` | Remove one session permission rule. | `H:If-Match` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/sessions/{id}` | Get a session summary. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/sessions/{id}/approval` | Read a session's approval policy. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/sessions/{id}/state` | Read a session's recoverable state. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/sessions/{id}/transcript` | Read a session's transcript without attaching. | `?after_turn` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/sessions/{id}/usage` | Read a session's per-call LLM usage. | `?after_id` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/sessions` | List sessions. | `?include_system` `?realm` `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/sessions/{id}/rules/applies` | Which tool-call rules apply. | `?agent` `?tool` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/sessions/cwds` | List distinct session working directories. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/sessions/{id}/loops` | List a session's loops. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/sessions/{id}/tools/mcp` | List a session's MCP tools. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/sessions/{id}/tools` | List a session's effective tool set. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `DELETE /api/v1/agent/sessions/{id}/approver-lease` | Release the approver lease. | `H:X-Hoody-Approver-Lease` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `DELETE /api/v1/agent/sessions/{id}/attachments/{lease_id}` | Release an attachment lease. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `PATCH /api/v1/agent/sessions/{id}` | Rename a session. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `body*` |
| `PATCH /api/v1/agent/sessions/{id}/approver-lease` | Renew the approver lease. | `H:X-Hoody-Approver-Lease` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/attachments/{lease_id}` | Renew an attachment lease. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `GET /api/v1/agent/sessions/{id}/replay` | Replay a live session's buffered events. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `POST /api/v1/agent/sessions/{id}/tools/{name}/run` | Run a tool inside a live session (gated). | `?confirm` `?confirm_token` `H:X-Hoody-Approver-Lease` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `PUT /api/v1/agent/sessions/{id}/after-compaction` | Set the message re-added after every compaction. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `PATCH /api/v1/agent/sessions/{id}/agent` | Switch the chat agent. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `PUT /api/v1/agent/sessions/{id}/approval/rules/{tool}` | Set one session permission rule. | `H:If-Match` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `PATCH /api/v1/agent/sessions/{id}/auto-reply` | Arm/disarm the auto-reply loop. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/auto-reply/writes` | Flip the auto-reply write opt-in. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/effort` | Set reasoning effort. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/hoody-env` | Toggle Hoody shell-env injection. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/model` | Switch the session model. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `PATCH /api/v1/agent/sessions/{id}/verbosity` | Set response verbosity. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/yolo` | Arm or disarm YOLO auto-approve. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/sessions/{id}/messages` | Dispatch a turn (fire-and-observe). | `H:Idempotency-Key` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/sessions/{id}/prompt:stream` | Dispatch a turn and stream the response. | `?policy` `H:X-Hoody-Gate-Policy` `H:Idempotency-Key` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/sessions/{id}/workflows/{name}/runs` | Run a workflow onto an existing session. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `POST /api/v1/agent/sessions/{id}/trim` | Trim session history to a turn index. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `PUT /api/v1/agent/sessions/{id}/approval` | Set a session's approval mode and lock. | `H:If-Match` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.
- `since` — Resume from this gateway int64 seq (also accepted as the Last-Event-ID header).
- `incarnation` — The incarnation the since cursor belongs to (from a frame, replay_boundary, or GET /sessions/{id}). When it differs from the live session's, the cursor is treated as invalid: a replay_gap frame, then the full retained ring.
- `Last-Event-ID` — SSE resume cursor — the gateway int64 seq to resume from (the in:header alias of ?since); sent automatically by an SSE client on reconnect.
- `Idempotency-Key` — Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key returns the same receipt and never re-runs the turn; the same key with a different request body is 422. _(on `POST /api/v1/agent/sessions`, `POST /api/v1/agent/sessions/{id}/messages`)_
- `tool` — The tool. _(on `DELETE /api/v1/agent/sessions/{id}/approval/rules/{tool}`, `PUT /api/v1/agent/sessions/{id}/approval/rules/{tool}`)_
- `If-Match` — Conditional-request precondition: the ETag from GET /sessions/{id}/approval (a quoted policy revision, e.g. "3") or *. A mismatch is 412 precondition_failed.
- `after_turn` — Exclusive completed-turn skip cursor: return content strictly after completed turn N (0 = full transcript; values past the end clamp; negative/non-integer = 400).
- `after_id` — Exclusive cursor: return rows whose id is greater than this. Omit (or 0) to start from the session's first row. Negative or non-integer = 400.
- `limit` — Return at most this many rows (1 to 5000, default 500). Out of range or non-integer = 400. _(on `GET /api/v1/agent/sessions/{id}/usage`)_
- `include_system` — When true, also include daemon-owned system/resident sessions in the listing.
- `realm` — The realm to list: "global" (sessions not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination). _(on `GET /api/v1/agent/sessions`, `GET /api/v1/agent/sessions/{id}/loops`, `GET /api/v1/agent/sessions/{id}/tools/mcp` +1 more)_
- `agent` — Agent name to ask about (default: the session's own agent).
- `tool` — Tool name to ask about (default: any tool). _(on `GET /api/v1/agent/sessions/{id}/rules/applies`)_
- `X-Hoody-Approver-Lease` — The approver-lease capability returned by POST /sessions/{id}/approver-lease. Required on every decision (/confirm, or the confirmed re-issue of a gated tool run) on an "always" session whose lease was minted; the daemon verifies it at decision consumption. On renew/release it names the lease to act on.
- `name` — The name.
- `confirm` — Query alias of the body `confirm` field — re-issue a previously-parked confirmation (pair with confirm_token).
- `confirm_token` — Query alias of the body `confirm_token` field — the single-use token returned in the 409 tool_needs_confirmation details.
- `policy` — auto_approve auto-answers confirm gates for the life of the stream (alias of the X-Hoody-Gate-Policy header); off by default; the gateway asks for no separate credentials to use it; access is decided by the container's proxy permission policy.
- `X-Hoody-Gate-Policy` — Confirm-gate posture: "auto_approve" adopts the headless auto-answer posture (off by default; the in:query alias is ?policy=). Any other value is rejected 400.
- `Idempotency-Key` — Opaque retry key (1–255 printable ASCII, no whitespace). The turn runs at most once per key: a retry is 409 replay_unavailable with the turn's receipt (details.turn), never a re-run and never a second stream; the same key with a different request body is 422. _(on `POST /api/v1/agent/sessions/{id}/prompt:stream`)_

**Body shapes:**

- `POST /api/v1/agent/sessions/{id}/approver-lease` body — `{ holder*: string, ttl_ms: int, replace: bool, lease: string }` — Lease request. holder is REQUIRED on acquire; renew/release need only the capability.
  - `holder` — REQUIRED on acquire: an opaque per-caller id (1–64 printable ASCII, no spaces) that identifies THIS client as the holder (reported as `holder` on the event.gate_resolved stream event). Never a credential; an empty holder is 400.
  - `ttl_ms` — Requested lifetime in milliseconds (the daemon clamps to its bounds).
  - `replace` — Documentation only: a live lease is taken over ONLY by presenting its current capability as proof (X-Hoody-Approver-Lease or body.lease); replace:true without the proof is still 409 approver_lease_held. After expiry or release an acquire needs no proof.
  - `lease` — The capability: what renew/release act on, and the PROOF an acquire presents to take over a live lease (alternative to the X-Hoody-Approver-Lease header).
- `POST /api/v1/agent/sessions/{id}/attachments` body — `{ ttl_ms: int }` — Lease request.
  - `ttl_ms` — Requested lifetime in milliseconds (default 15m, capped at 60m).
- `POST /api/v1/agent/sessions` body — `{ realm: string, container: string, cwd: string, config_dir: string, model: string, agent: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", attach: string, fork: string, fork_turn_idx: int, backend: string, delegated_agent: string, headless: bool, approval: { mode: "" | "default" | "always", locked: bool }, expected_binding: { realm: string, container: string, cwd: string, backend: "" | "llm" | "acp" }, prompt_blocks: { contract: bool, transcripts: bool, frequent_files: bool, hook_context: bool, memory: bool, project_instructions: bool, agent_instructions: bool, team_rules: bool, skills: bool, workflows: bool, verbosity: bool, hoody_platform: bool, hoody_exec: bool, fleet_notice: bool }, model_settings: { thinking: object, temperature: number, max_tokens: int, response_format: object }, helper_gates: bool, outcome_claims: bool, frame_tools: bool }` — Session start binding (all optional; header scope augments the body, body wins). backend:"acp" requires delegated_agent.
  - _(21 fields carry longer docs — see the spec shipped as `hoody-sdk/openapi.json` for full field semantics)_
- `PATCH /api/v1/agent/sessions/{id}` body — `{ name*: string }` — The new title.
  - `name` — The new title. An empty string clears it back to the automatic title. Required — omitting it is a 400, not a clear.
- `PATCH /api/v1/agent/sessions/{id}/approver-lease` body — `{ ttl_ms: int, lease: string }` — Lease request (renew/release): the capability via body.lease or the X-Hoody-Approver-Lease header; ttl_ms optional on renew.
- `PATCH /api/v1/agent/sessions/{id}/attachments/{lease_id}` body — `{ ttl_ms: int }` — Renewal.
  - `ttl_ms` — New lifetime in milliseconds from now (default 15m, capped at 60m).
- `POST /api/v1/agent/sessions/{id}/tools/{name}/run` body — `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }` — Tool parameters and an optional confirmation posture. Caller-supplied `confirmed`/`_`-prefixed control keys are ignored — they are never trusted from the wire.
  - `params` — The tool's input parameters (its JSON-Schema body).
  - `confirm` — Re-issue a previously-parked confirmation. MUST be paired with the confirm_token from the prior 409; a bare confirm:true with no valid token does NOT bypass the gate (it re-parks). A wire confirmed key in params is always scrubbed.
  - `confirm_token` — The single-use token returned in the 409 tool_needs_confirmation details. Bound to the tool/session/params it was minted for; present it with confirm:true and the echoed params to approve the parked run.
  - `allow_mutations` — Sessionless only: opt a non-read-only tool into running with every permission check applied (else a sessionless mutating run is refused 400 tool_mutation_refused).
- `PUT /api/v1/agent/sessions/{id}/after-compaction` body — `{ text*: string }` — The after-compaction message.
  - `text` — The message text, at most 16384 bytes in UTF-8. Empty or whitespace-only removes the message.
- `PATCH /api/v1/agent/sessions/{id}/agent` body — `{ agent: string }` — New chat agent.
  - `agent` — Chat-agent name to switch to. The bot agent is refused 400 bad_request (details.field agent) on every session: it runs only inside a Bot (POST /bots).
- `PUT /api/v1/agent/sessions/{id}/approval/rules/{tool}` body — `{ decision*: "allow" | "deny" }` — One permission rule.
  - `decision` — allow | deny.
- `PATCH /api/v1/agent/sessions/{id}/auto-reply` body — `{ armed: bool, rounds: int, model: string, allow_writes: bool }` — Auto-reply loop config.
  - `armed` — true to arm the auto-reply loop, false to disarm.
  - `rounds` — Number of auto-reply rounds budgeted.
  - `model` — Replier model override.
  - `allow_writes` — Opt in to write-class actions during auto-reply.
- `PATCH /api/v1/agent/sessions/{id}/auto-reply/writes` body — `{ allow_writes: bool }` — Write opt-in flip.
  - `allow_writes` — New write-class opt-in state.
- `PATCH /api/v1/agent/sessions/{id}/effort` body — `{ effort: "" | "low" | "medium" | "high" | "xhigh" | "max" }` — Reasoning effort.
  - `effort` — low|medium|high|xhigh|max, or "" for the model default. Any other value is 400 bad_request (details.field effort).
- `PATCH /api/v1/agent/sessions/{id}/hoody-env` body — `{ enabled: bool }` — Enable/disable HOODY_* shell-env injection.
  - `enabled` — Whether to inject the HOODY_* shell-env contract.
- `PATCH /api/v1/agent/sessions/{id}/model` body — `{ model*: string }` — New model.
  - `model` — Model spec to switch to (provider-prefixed, e.g. anthropic/claude-opus-4-8, or fusion/<slug>). Required — a blank value is rejected, never a silent no-op.
- `PATCH /api/v1/agent/sessions/{id}/verbosity` body — `{ level: "normal" | "concise" | "terse" | "minimal" }` — Verbosity level.
  - `level` — normal|concise|terse|minimal. Any other value is 400 bad_request (details.field level); the applied level is echoed on the stream as event.verbosity.
- `PATCH /api/v1/agent/sessions/{id}/yolo` body — `{ enabled*: bool }` — YOLO state.
  - `enabled` — true to arm auto-approve, false to disarm.
- `POST /api/v1/agent/sessions/{id}/messages` body — `{ text*: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", attachments: { type*: "image", media_type*: string, data*: string, name: string }[] }` — Turn input: the user text, optional inline image attachments, plus optional per-turn tool_mode / dir_scope overrides.
  - `text` — Required (may be empty only with attachments). The user message text for this turn: empty or whitespace-only text with no attachments is refused (400 empty_prompt) and no turn runs.
  - `tool_mode` — Optional per-turn tool mode override: standard or orchestrator. Any other value is refused 400 invalid_tool_mode.
  - `dir_scope` — Optional per-turn directory-access scope override: home or full. Any other value is refused 400 invalid_dir_scope.
  - `attachments` — … At most 4 per turn, each at most 4 MiB DECODED (~5.33 MiB of base64); the request body limit applies on top and is authoritative, so several individually-legal images can still exceed it. A violation is refused with 400 BEFORE the turn is accepted — nothing is silently dropped. `path` is not supported here: it would name a file on the CALLER's machine, and a path-bearing attachment is discarded outright on a container-bound session. If the active model cannot accept images the daemon reports that on the session stream.
- `POST /api/v1/agent/sessions/{id}/prompt:stream` body — `{ text*: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", attachments: { type*: "image", media_type*: string, data*: string, name: string }[] }` — Turn input: the user text, optional inline image attachments, plus optional per-turn tool_mode / dir_scope overrides.
- `POST /api/v1/agent/sessions/{id}/workflows/{name}/runs` body — `{ prompt: string, inputs: { [key: string]: string } }` — Optional workflow input prompt and declared input-parameter values.
  - `prompt` — Optional input text fed to the workflow run ($(workflow.prompt)).
  - `inputs` — Optional run-time values for the workflow's DECLARED input parameters (declared name → string value; resolves to $(input.<name>) in every step). A workflow with a REQUIRED declared parameter cannot run without these. Values must be strings; a non-string value is a 400.
- `POST /api/v1/agent/sessions/{id}/trim` body — `{ turn_idx: int }` — Trim target.
  - `turn_idx` — 0-based turn index to truncate history to (and including). An index past the last turn changes nothing.
- `PUT /api/v1/agent/sessions/{id}/approval` body — `{ mode: "default" | "always", locked: bool }` — Approval policy change. Send If-Match (the ETag from GET) to make it conditional.
  - `mode` — "default" or "always". Omit to keep the current mode.
  - `locked` — Freeze the policy for the session's lifetime (monotonic; never unlocked). Omit to keep the current lock.

### `sessions.commands` (2) — Create, drive, and tear down agent sessions

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/sessions/{id}/commands/{command_id}` | Get a command's receipt. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `POST /api/v1/agent/sessions/{id}/commands` | Send a message, an interrupt or a stop to a session. | `H:Idempotency-Key` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.
- `Idempotency-Key` — Retry key, required on this route; the SDK and CLI send one automatically. 1–255 printable ASCII, no whitespace. A retry with the same key and command returns the stored receipt and admits nothing; the same key with a different command is 422. The key is remembered while the command waits and for 24 hours after it settled. Past 4096 remembered keys a new key is 429 idempotency_keys_exhausted; a stop is never refused because of the remembered-key limit.

**Body shapes:**

- `POST /api/v1/agent/sessions/{id}/commands` body — `{ kind*: "message" | "interrupt" | "stop", text: string, close: bool, on_gate: "deny" | "wait", order: int, from: { kind*: "user" | "bot" | "delegate" | "system", id: string }, trigger: "human" | "wake" | "clear" }` — The command.
  - `kind` — message, interrupt or stop.
  - `text` — The message (message and interrupt: required, non-empty, at most 32 KiB). Delivered verbatim. A stop takes none.
  - `close` — A stop only: close the session once its work is stopped.
  - `on_gate` — A message only: deny (default) declines a confirmation or question the session is waiting on so the message is read now; wait leaves it waiting.
  - `order` — Optional, at least 0: a sequence number for one caller's commands. A message or interrupt with a lower order than a stop already received is superseded.
  - `from` — Optional: who sends it. … Set it only when your client relays a message on someone's behalf (a Bot runtime, a session forwarding to another); a client sending a person's own message leaves it out, which reads as from the user.
  - `trigger` — Optional: what caused it, recorded on the receipt. With from kind bot, human introduces the message as the user's via their Bot and wake or clear as the Bot's own. Like from, it is the caller's claim, not verified, and grants nothing; leave it out unless your client relays messages.

### `sessions.turns` (5) — Create, drive, and tear down agent sessions

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/sessions/{id}/cancel` | Cancel the active turn (Esc), or one named turn. | `?turn_id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `POST /api/v1/agent/sessions/{id}/turns` | Dispatch a turn (retry-safe). | `H:Idempotency-Key` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `GET /api/v1/agent/sessions/{id}/turns/{turn_id}` | Get a turn's durable receipt. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/sessions/{id}/turns` | List a session's durable turn receipts. | `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `POST /api/v1/agent/sessions/{id}/prompt:sync` | Dispatch a turn and block until it ends (no reply text: read it from the transcript) | `?policy` `H:X-Hoody-Gate-Policy` `H:Idempotency-Key` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |

**Param notes:**

- `turn_id` — Cancel only this turn (alternative to the body field).
- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.
- `Idempotency-Key` — Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key returns the same receipt and never re-runs the turn; the same key with a different request body is 422. _(on `POST /api/v1/agent/sessions/{id}/turns`)_
- `limit` — Return at most this many receipts, newest first (1–1000). A cap, not a page size: there is no next page.
- `policy` — auto_approve adopts the headless auto-answer posture (alias of the X-Hoody-Gate-Policy header); off by default; the gateway asks for no separate credentials to use it; access is decided by the container's proxy permission policy.
- `X-Hoody-Gate-Policy` — Confirm-gate posture: "auto_approve" adopts the headless auto-answer posture (off by default; the in:query alias is ?policy=). Any other value is rejected 400.
- `Idempotency-Key` — Opaque retry key (1–255 printable ASCII, no whitespace). The turn runs at most once per key: a retry answers 200 duplicate:true with the turn's outcome (or pending_turn while it still runs) and never re-runs it; the same key with a different request body is 422. _(on `POST /api/v1/agent/sessions/{id}/prompt:sync`)_

**Body shapes:**

- `POST /api/v1/agent/sessions/{id}/cancel` body — `{ turn_id: string }` — Optional. Omit (or send {}) to cancel whatever is running.
  - `turn_id` — The turn to cancel, as returned when it was dispatched. Cancels only that turn.
- `POST /api/v1/agent/sessions/{id}/turns` body — `{ text*: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", attachments: { type*: "image", media_type*: string, data*: string, name: string }[] }` — Turn input: the user text, optional inline image attachments, plus optional per-turn tool_mode / dir_scope overrides.
  - `text` — Required (may be empty only with attachments). The user message text for this turn: empty or whitespace-only text with no attachments is refused (400 empty_prompt) and no turn runs.
  - `tool_mode` — Optional per-turn tool mode override: standard or orchestrator. Any other value is refused 400 invalid_tool_mode.
  - `dir_scope` — Optional per-turn directory-access scope override: home or full. Any other value is refused 400 invalid_dir_scope.
  - `attachments` — … At most 4 per turn, each at most 4 MiB DECODED (~5.33 MiB of base64); the request body limit applies on top and is authoritative, so several individually-legal images can still exceed it. A violation is refused with 400 BEFORE the turn is accepted — nothing is silently dropped. `path` is not supported here: it would name a file on the CALLER's machine, and a path-bearing attachment is discarded outright on a container-bound session. If the active model cannot accept images the daemon reports that on the session stream.
- `POST /api/v1/agent/sessions/{id}/prompt:sync` body — `{ text*: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", attachments: { type*: "image", media_type*: string, data*: string, name: string }[] }` — Turn input: the user text, optional inline image attachments, plus optional per-turn tool_mode / dir_scope overrides.

### `settings` (2) — Process-wide settings (home settings.json)

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/settings` | Get settings. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `PATCH /api/v1/agent/settings` | Patch settings. | `body*` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.

**Body shapes:**

- `PATCH /api/v1/agent/settings` body — `{ patch*: object }` — The settings patch.
  - `patch` — Top-level keys to merge into the home settings.json (a null value deletes the key).

### `skills` (10) — Reusable agent skill definitions

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/skills` | Create a skill. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/skills/delete` | Delete a skill. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/skills/toggle` | Enable/disable a skill. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `GET /api/v1/agent/skills/source` | Read a skill's source. | `?root_dir` `?rel_dir` `?root` `?rel` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `POST /api/v1/agent/skills/import/apply` | Apply a skill import. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `GET /api/v1/agent/skills` | List skills. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `POST /api/v1/agent/skills/rename` | Rename a skill. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `GET /api/v1/agent/skills/import/scan` | Scan for importable skills. | `?source*` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` |
| `PUT /api/v1/agent/skills/source` | Write a skill's source. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/skills/trust` | Set a skill's trust state. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.
- `root_dir` — Skill root directory (identity; alias: root).
- `rel_dir` — Skill relative directory (identity; alias: rel).
- `root` — Friendly alias of root_dir (translated to root_dir server-side).
- `rel` — Friendly alias of rel_dir (translated to rel_dir server-side).
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).
- `source` — Which tool's skills to scan.

**Body shapes:**

- `POST /api/v1/agent/skills` body — `{ name*: string }` — Name of the skill to scaffold. The description and body are NOT settable here — write them with `PUT /api/v1/agent/skills/source` afterwards.
  - `name` — Skill name (also the SKILL.md directory stem, and the frontmatter `name`). Must not collide with an existing skill in any root.
- `POST /api/v1/agent/skills/delete` body — `{ root_dir*: string, rel_dir*: string }` — Skill identity.
- `POST /api/v1/agent/skills/toggle` body — `{ name*: string, disabled: bool }` — Effective skill name + new disabled state.
  - `name` — Effective skill name (NOT root/rel — toggle is name-scoped).
  - `disabled` — true to disable the skill, false to enable it.
- `POST /api/v1/agent/skills/import/apply` body — `{ source*: "claude" | "codex", items*: { source: string, rel_dir: string }[], overwrite: bool }` — The discovered skills to import: the import source and the selected entries returned by the import scan, plus an optional overwrite flag. A client-supplied filesystem path is not an input — every source location is re-derived from the source and the selected entry.
  - `source` — The import source the entries were scanned from.
  - `items` — The selected scan entries to import. At least one is required.
  - `overwrite` — Replace an already-installed skill at the same destination instead of refusing that entry. Defaults to false.
- `POST /api/v1/agent/skills/rename` body — `{ root_dir*: string, rel_dir*: string, new_name*: string }` — Skill identity + new name.
  - `new_name` — New skill directory name.
- `PUT /api/v1/agent/skills/source` body — `{ root_dir*: string, rel_dir*: string, content*: string, base_gen: int }` — Skill identity + new source body.
  - `content` — New SKILL.md body (alias: source).
  - `base_gen` — Optional: the `gen` returned by `GET /api/v1/agent/skills/source` (or a previous `PUT /api/v1/agent/skills/source`). A save whose SKILL.md changed since is refused 409 revision_conflict (details.current_gen) and writes nothing. Omit or pass 0 to save unconditionally.
- `POST /api/v1/agent/skills/trust` body — `{ root_dir*: string, rel_dir*: string, trusted*: bool }` — Skill identity + trust flag.
  - `trusted` — true to grant execution trust, false to revoke.

### `skills.hub` (5) — Reusable agent skill definitions

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/agent/skills/hub/cache` | Clear the skill hub cache. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` |
| `GET /api/v1/agent/skills/hub/cache` | Skill hub cache stats. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` |
| `POST /api/v1/agent/skills/hub/install` | Install a hub skill. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `GET /api/v1/agent/skills/hub/preview` | Preview a hub skill. | `?provider*` `?source*` `?skill_id*` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` |
| `GET /api/v1/agent/skills/hub/search` | Search the skill hub. | `?query*` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.
- `provider` — Hub provider of the skill (a search result's ref.provider).
- `source` — Source of the skill on the hub, such as owner/repo (a search result's ref.source).
- `skill_id` — Hub skill id (a search result's ref.skill_id).
- `query` — Search text. Required and non-empty.

**Body shapes:**

- `POST /api/v1/agent/skills/hub/install` body — `{ package_digest*: string, overwrite: bool }` — The previewed package to install.
  - `package_digest` — The `package_digest` `GET /api/v1/agent/skills/hub/preview` returned. The install takes exactly that cached package, so preview first; a digest no longer in the cache is refused (preview again).
  - `overwrite` — Replace a skill already installed under the same name. Without it (default false) such an install is refused.

### `stats` (1) — Per-session and aggregate usage counters

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/statistics` | Cross-session statistics. | `?scope` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |

**Param notes:**

- `scope` — cwd (default) rolls up the current working directory; all rolls up every session.
- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.

### `tasks` (3) — Background task management

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/sessions/{id}/tasks/{tid}/cancel` | Cancel a background task. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/sessions/{id}/tasks/{tid}/transcript` | Read a background task's transcript. | `?after_seq` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/sessions/{id}/tasks` | List a session's background tasks. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.
- `after_seq` — Exclusive int64 upsert-poll cursor: entries with seq strictly greater than it, plus any still-OPEN entry regardless of its seq. Omit for the whole transcript (distinct from 0, which skips a closed seq-0 entry). Negative/non-integer = 400.

### `todos` (17) — Container-aware task list management

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/todos/{id}/proposals/{pid}/approve` | Approve a todo proposal. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `POST /api/v1/agent/todos/{id}/archive` | Archive a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/todos/{id}/cancel-run` | Cancel a todo's run. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `POST /api/v1/agent/todos/{id}/claim` | Claim a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/todos` | File a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/todos/{id}/messages` | Comment on a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/todos/{id}/proposals/{pid}/deny` | Deny a todo proposal. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `GET /api/v1/agent/todos/{id}` | Read a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/todos/revision` | Get the todos store revision. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/todos` | List todos. | `?states` `?tags` `?query` `?open_only` `?all` `?sort` `?realm` `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `POST /api/v1/agent/todos/purge` | Purge archived todos. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `POST /api/v1/agent/todos/{id}/release` | Release a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/todos/{id}/message` | Comment + run an orchestrator turn. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/todos/{id}/snooze` | Snooze a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/todos/{id}/run` | Run a todo's orchestrator. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `POST /api/v1/agent/todos/triage` | Run an LLM triage pass. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `PATCH /api/v1/agent/todos/{id}` | Update a todo (CAS). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.
- `states` — Only todos in one of these states. Repeat the parameter for several (?states=ready&states=blocked).
- `tags` — Only todos carrying these tags. Repeat the parameter for several (?tags=a&tags=b).
- `query` — Free-text filter over title/body.
- `open_only` — When true, only open (non-terminal) todos.
- `all` — When true, include archived/closed todos.
- `sort` — List order. `default` (or omitted): open todos first, then priority, rank, number. `closed_at`: closed todos by `closed_at`, newest first; todos without a `closed_at` follow in the default order. Any other value is 400.
- `realm` — The realm to list: "global" (todos not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).

**Body shapes:**

- `POST /api/v1/agent/todos/{id}/proposals/{pid}/approve` body — `object` — No body fields are read; the todo {id} and proposal {pid} come from the path.
- `POST /api/v1/agent/todos/{id}/archive` body — `{ revision*: int }` — CAS guard (the {id} comes from the path).
  - `revision` — The TODO's own current `revision` (from `GET /api/v1/agent/todos/{id}`); required — a stale or absent value is rejected.
- `POST /api/v1/agent/todos/{id}/cancel-run` body — `object` — No body fields are read; the todo {id} comes from the path.
- `POST /api/v1/agent/todos/{id}/claim` body — `{ session_id*: string, run_id: string, revision: int }` — Lease owner + CAS guard (the {id} comes from the path).
  - `session_id` — Identity that will OWN the lease — required and non-empty. `POST /api/v1/agent/todos/{id}/release` must present the same value; while the lease is live another session_id cannot claim the todo.
  - `run_id` — Optional correlation id recorded on the lease (e.g. the run this claim belongs to); not an identity — it is never used for ownership checks.
  - `revision` — … CONDITIONALLY required: a FRESH claim (no live lease, or a lease held by another session_id) must carry it — omitted means revision 0 and the CAS refuses the claim (409 todo_conflict) — while the lease's CURRENT owner re-claiming to refresh its TTL may omit it (the daemon waives the CAS for the owner). It is not in the schema's required list only because of that second case.
- `POST /api/v1/agent/todos` body — `{ title*: string, body: string, priority: int, tags: string[], cwd: string }` — New todo (deterministic triage runs server-side). The todo's working directory is taken from the body `cwd` OR, if omitted, the X-Hoody-Cwd request-scope header; one of the two is required (an empty cwd is rejected).
  - `title` — Todo title.
  - `body` — Todo body / description.
  - `priority` — Optional priority band 0..4 (0 = P0 urgent … 4 = P4 someday); defaults to 2 when omitted. Must be a JSON integer in range — a string or out-of-range value is rejected.
  - `tags` — Optional tags.
  - `cwd` — The todo's working directory (labels the record's computer/path). Defaults to the X-Hoody-Cwd request-scope header when omitted; one of the two must be set.
- `POST /api/v1/agent/todos/{id}/messages` body — `{ text*: string }` — Comment text (the {id} comes from the path).
  - `text` — The comment body to append to the todo timeline.
- `POST /api/v1/agent/todos/{id}/proposals/{pid}/deny` body — `object` — No body fields are read; the todo {id} and proposal {pid} come from the path.
- `POST /api/v1/agent/todos/purge` body — `object` — JSON object of the operation's fields. Every `_`-prefixed key is ignored (removed before dispatch), the request scope (cwd/config_dir) is added from the scope headers, and all other keys are passed through verbatim. …
- `POST /api/v1/agent/todos/{id}/release` body — `{ session_id*: string, outcome*: "done" | "blocked" | "failed" | "cancelled", summary: string, question_for_human: string }` — Lease owner + run outcome (the {id} comes from the path).
  - `session_id` — The session that owns the lease — required, and must match the value `POST /api/v1/agent/todos/{id}/claim` leased under; a mismatch is refused.
  - `outcome` — How the run ended. done → review; blocked → blocked; failed → ready and increments the attempt counter; cancelled → ready without incrementing it. Required — any other value is rejected.
  - `summary` — Short account of what the run did, written to the timeline as the run_end entry (capped at 1024 characters).
  - `question_for_human` — A question to surface to the operator alongside the outcome — the field a blocked run uses to say what it needs (capped at 1024 characters).
- `POST /api/v1/agent/todos/{id}/message` body — `{ text*: string }` — Comment text that kicks an orchestrator turn (the {id} comes from the path). Returns {job_id}.
  - `text` — The message that both comments and prompts the orchestrator.
- `POST /api/v1/agent/todos/{id}/snooze` body — `{ wake_at*: string, revision*: int }` — Snooze target (the {id} comes from the path). The daemon reads `wake_at` + the CAS `revision` — there is no `until` field.
  - `wake_at` — Wake time, RFC3339 (e.g. 2026-07-04T09:00:00Z); an empty string clears the snooze.
  - `revision` — The TODO's own current `revision` (from `GET /api/v1/agent/todos/{id}`); a stale value is rejected.
- `POST /api/v1/agent/todos/{id}/run` body — `object` — JSON object of the operation's fields. Every `_`-prefixed key is ignored (removed before dispatch), the request scope (cwd/config_dir) is added from the scope headers, and all other keys are passed through verbatim. The todo {id} comes from the path; the body is optional.
- `POST /api/v1/agent/todos/triage` body — `object` — JSON object of the operation's fields. Every `_`-prefixed key is ignored (removed before dispatch), the request scope (cwd/config_dir) is added from the scope headers, and all other keys are passed through verbatim. Optional triage scoping; an empty body triages the whole inbox. Returns {job_id}.
- `PATCH /api/v1/agent/todos/{id}` body — `{ revision*: int, title: string, body: string, state: "inbox" | "ready" | "blocked" | "review" | "done" | "dropped", priority: int, rank: int, tags: string[], cwd: string }` — CAS-guarded field patch / state transition (the {id} comes from the path). Only the keys present are patched.
  - `revision` — The TODO's own current `revision` (from `GET /api/v1/agent/todos/{id}` — NOT the store-wide revision); a stale value is rejected.
  - `title` — New title.
  - `body` — New body.
  - `state` — … Sending the current state leaves the state as it is (the other fields still apply). in_progress is not settable here: `POST /api/v1/agent/todos/{id}/claim` or `POST /api/v1/agent/todos/{id}/run` enters it by taking the lease, and while a worker holds the lease the state cannot be changed (`POST /api/v1/agent/todos/{id}/cancel-run` or `POST /api/v1/agent/todos/{id}/release` ends it). Any other move is 400 bad_request ("invalid transition <from> → <to>"), and so is any update to an archived todo, whatever its revision. Otherwise the revision is checked first: a stale one is 409 todo_conflict whatever the state. …
  - `priority` — New priority.
  - `rank` — New ordering rank.
  - `tags` — New tag set.
  - `cwd` — Retarget the todo's working directory.

### `tools` (5) — Tool catalogue and gated tool execution

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/tools/{name}` | Get one tool schema. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `GET /api/v1/agent/tools` | List the tool catalogue. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `GET /api/v1/agent/tools/read-only` | List the read-only tool subset. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `POST /api/v1/agent/tools/{name}/run` | Run a tool (sessionless, gated). | `?confirm` `?confirm_token` `H:X-Hoody-Tool-Mode` `H:X-Hoody-Dir-Scope` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` `?stream` |
| `POST /api/v1/agent/tools/{name}/runAsync` | Run a tool asynchronously (sessionless, gated). | `?confirm` `?confirm_token` `H:X-Hoody-Tool-Mode` `H:X-Hoody-Dir-Scope` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |

**Param notes:**

- `name` — The name.
- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).
- `confirm` — Query alias of the body `confirm` field — re-issue a previously-parked confirmation (pair with confirm_token).
- `confirm_token` — Query alias of the body `confirm_token` field — the single-use token returned in the 409 tool_needs_confirmation details.
- `X-Hoody-Tool-Mode` — Sessionless tool-mode for the ephemeral session: `standard` (the default) or `orchestrator`. Any other value is refused 400 invalid_tool_mode. Ignored on the in-session run (it inherits the session's frozen tool-mode).
- `X-Hoody-Dir-Scope` — Sessionless directory-access scope for the ephemeral session: home (the default) or full. Any other value is refused 400 invalid_dir_scope. Ignored on the in-session run (it inherits the session's frozen dir-scope).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.
- `stream` — Stream the tool output as server-sent events.

**Body shapes:**

- `POST /api/v1/agent/tools/{name}/run` body — `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }` — Tool parameters and an optional confirmation posture. Caller-supplied `confirmed`/`_`-prefixed control keys are ignored — they are never trusted from the wire.
  - `params` — The tool's input parameters (its JSON-Schema body).
  - `confirm` — Re-issue a previously-parked confirmation. MUST be paired with the confirm_token from the prior 409; a bare confirm:true with no valid token does NOT bypass the gate (it re-parks). A wire confirmed key in params is always scrubbed.
  - `confirm_token` — The single-use token returned in the 409 tool_needs_confirmation details. Bound to the tool/session/params it was minted for; present it with confirm:true and the echoed params to approve the parked run.
  - `allow_mutations` — Sessionless only: opt a non-read-only tool into running with every permission check applied (else a sessionless mutating run is refused 400 tool_mutation_refused).
- `POST /api/v1/agent/tools/{name}/runAsync` body — `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }` — Tool parameters and an optional confirmation posture. Caller-supplied `confirmed`/`_`-prefixed control keys are ignored — they are never trusted from the wire.

### `usage` (2) — Per-session and aggregate usage counters

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/usage/by-account` | Usage rollup by account. | `?since` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `GET /api/v1/agent/usage/by-model` | Usage rollup by model. | `?since` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |

**Param notes:**

- `since` — Unix-seconds lower bound; omit for all-time. A negative/non-numeric value is rejected 400.
- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.

### `workflows` (12) — Multi-step workflow definitions and runs

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/workflows/runs/{run_id}/cancel` | Cancel a workflow run. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `DELETE /api/v1/agent/workflows/{name}` | Delete a workflow definition. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/workflows/{name}` | Read one workflow definition. | `?include_revision` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/workflows/runs/{run_id}` | Get one workflow run by id. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/workflows` | List workflow definitions. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/workflows/runs` | Snapshot in-flight and recent workflow runs. | `?realm` `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `POST /api/v1/agent/workflows/runs/{run_id}/resume` | Resume a failed or cancelled workflow run. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/sessions/{id}/workflow/messages` | Send a message to a running workflow. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `PUT /api/v1/agent/workflows/{name}` | Create or replace a workflow definition. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/workflows/{name}/hide` | Hide or un-hide a workflow. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |
| `PUT /api/v1/agent/workflows/{name}/summary` | Set or clear a workflow's summary. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body*` |
| `POST /api/v1/agent/workflows/{name}/runs` | Run a workflow in a new session. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `body` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `POST /api/v1/agent/todos` also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against.
- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.
- `name` — The name.
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `include_revision` — If "true", the tool output's first line is `revision: <opaque>` — pass that value as `PUT /api/v1/agent/workflows/{name}`'s expected_revision to guard against concurrent edits; the JSON below it is unchanged. Strictly parsed: exactly one value, "true" or "false"; anything else (empty, "TRUE", "1", repeated) is a 400 bad_request.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).
- `realm` — The realm to list: "global" (runs not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm.

**Body shapes:**

- `POST /api/v1/agent/workflows/runs/{run_id}/resume` body — `{ session_id*: string }` — The live session that executes the resume.
  - `session_id` — A live session matching the run's realm, owner, working directory, and container binding.
- `POST /api/v1/agent/sessions/{id}/workflow/messages` body — `{ text: string }` — Workflow input message.
  - `text` — Feedback/input text fed to the running workflow.
- `PUT /api/v1/agent/workflows/{name}` body — `{ definition*: object, expected_revision: string, expected_absent: bool }` — The workflow definition (forwarded as the upsert_workflow tool's `definition`; the {name} comes from the path), plus the optional optimistic-concurrency guards.
  - `definition` — The full workflow definition object (steps, entry_point, summary). Validated strictly by the agent before an atomic write.
  - `expected_revision` — … If the stored workflow changed since that read, the upsert is refused with [revision_conflict] and nothing is written. … The revision is bound to the realm this request resolves to: on a gateway without a realm pin, a revision read while another realm was active is refused [revision_conflict] (current_revision is this realm's), never written into the other realm.
  - `expected_absent` — Optional create-only guard: refuse with [already_exists] (writing nothing) if any workflow with this name already exists. Use when creating a new workflow that must not overwrite an existing one. Mutually exclusive with expected_revision.
- `POST /api/v1/agent/workflows/{name}/hide` body — `{ hidden: bool }` — Visibility flag (the {name} comes from the path). Defaults to hide:true.
  - `hidden` — true (default) to hide the workflow; false to un-hide it.
- `PUT /api/v1/agent/workflows/{name}/summary` body — `{ summary*: string, expected_revision: string }` — The new summary (the {name} comes from the path), plus the optional optimistic-concurrency guard.
  - `summary` — The new summary. An empty string clears it. Required — omitting it is a 400, not a clear.
  - `expected_revision` — … If the workflow changed or was deleted since that read, the write is refused 409 revision_conflict and nothing is written. … The revision is bound to the realm this request resolves to: on a gateway without a realm pin, a revision read while another realm was active is refused 409 revision_conflict (details.current_revision is this realm's), never written into the other realm.
- `POST /api/v1/agent/workflows/{name}/runs` body — `{ prompt: string, inputs: { [key: string]: string }, realm: string, container: string, cwd: string, config_dir: string, model: string, agent: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", headless: bool }` — Optional run input and the new session's binding (all optional; header scope augments the body, body wins).
  - `prompt` — Optional input text fed to the workflow run ($(workflow.prompt)).
  - `inputs` — Optional run-time values for the workflow's DECLARED input parameters (declared name → string value; resolves to $(input.<name>) in every step). A workflow with a REQUIRED declared parameter cannot run without these. Values must be strings; a non-string value is a 400.
  - `realm` — Realm selector for the new session (frozen at start). A pinned gateway always uses its pin.
  - `container` — Container id/selector to run tools on (frozen at start).
  - `cwd` — Working directory for the session (frozen at start); it also selects the project workflow layer.
  - `config_dir` — Config directory override.
  - `model` — Model for this session; overrides the chat agent's pinned model for this session only. An unknown model is refused 422 unknown_model.
  - `agent` — Initial chat-agent name.
  - `tool_mode` — Initial tool mode (frozen at start): standard (the default) or orchestrator. Any other value is refused 400 invalid_tool_mode.
  - `dir_scope` — Initial directory-access scope (frozen at start): home or full. Any other value is refused 400 invalid_dir_scope.
  - `headless` — Start the session in headless posture.

