> _**SDK skill · `agent` namespace** · ~154,350 tokens · hoody-sdk v1.0.0-beta.17_

# `agent` — In-container AI coding agent over HTTP

## Purpose

The `agent` kit exposes the in-container AI agent as a typed namespace: create a chat session, send a prompt, stream the turn (tool calls, gates, output), then confirm/answer/cancel as the agent works. services — `sessions` (with `sessions.turns`), `bots`, `definitions`, `models`, `providers`, `skills` (with `skills.hub`), `memory`, `github`, `workflows`, `tools`, `hooks`, `mcp`, `settings`, `loops`, `logs`, `tasks`, `stats`, `jobs`, `gates`, `changes`, `headless`, `todos`, `usage`, plus `platform` (token bootstrap) and `logs.export`.

## When to use

- **Drive the agent programmatically** — create a session, prompt it, and consume the turn: `client.agent.sessions.create` → stream the turn for live tool/gate/output events (per surface — see the streaming note under Quirks), or `sessions.turns.run` for one blocking call → resolve gates with `gates.approve` / `gates.deny` / `gates.answer` → `sessions.turns.cancel` to interrupt.
- **Inspect or configure the agent** — list `models` (`agent.models.list` / `agent.models.get`; the Jev decision-model catalogue is the separate `agent.jev.listModels`) and `providers.list` (configure providers via `providers.setDefaultAuth` / `providers.setApiKey` / `providers.startOauth`); switch a session's active model with `sessions.setModel`, browse/install `skills`, read/edit `memory`, manage `workflows`, `hooks`, `definitions` (named agent profiles), and `tools` — both the sessionless catalogue/registry (`tools.list` / `tools.listReadOnly` / `tools.get`, and `agent.tools.run` (blocks, returns the result; with `stream: true` it returns the one-shot result over SSE frames instead, not a per-token stream) / `agent.tools.start` (returns `{ job_id }`, poll `jobs`) to invoke a tool with no session — read-only by default, a mutating tool needs `allow_mutations: true` or a confirmed re-issue) and the per-session surface (`sessions.listTools` for a session's *effective* tool set, `sessions.listMcpTools`, and `sessions.runTool`). Unlike the sessionless `agent.tools.run`, a per-session run executes against the session's *frozen* realm/container/cwd/tool-mode and claims the session's single serial turn slot — so it returns 409 `turn_in_flight` while a turn is running, 409 `gate_parked` while a gate is open, and 404 `tool_not_found` if the tool is not in that session's effective list; whether a mutating tool may run is decided by the live session's own tool mode and confirmation settings (the `allow_mutations` escape hatch is sessionless-only).
- **One-shot non-interactive runs** — `client.agent.headless.start` (an async job) and `client.agent.headless.stream` (an SSE stream) each run the full agent loop once over a throwaway session (see workflow 7 for the per-surface form: an async job or an SSE stream).
- **GitHub from inside the agent** — first establish an account with `github.login` (omit the body for a GitHub device flow → poll `github.pollLogin`; or pass a `token` PAT to persist it directly), then `github.getAuth` to confirm; once an account is active, `github.clone` / `github.createCommit` (and `github.getStatus` / `github.listBranches` / `github.listRepos` / `github.createPr` / `github.sync`) for repo operations the agent performs in-container.

## When NOT to use

- Want the interactive TUI, not the API? Run the bare `hoody agent` launcher — it opens the in-container Agent TUI over the terminal-kit WebSocket; this namespace is the HTTP control surface beside it.
- Raw shell / command exec → `terminal` (PTY) or `exec` (one-shot). File I/O → `files`. The agent runs these as tools internally; call them directly when you don't need the LLM.
- Account-level resources (containers, billing, realms) → `api`.

## Prerequisites

- Container with the `agent` kit running; capability URL.
- At least one usable model provider before prompting: one with a stored API key, a stored OAuth login, or passwordless access (the shipped default agent is pinned to a passwordless model). `client.agent.providers.list` and `client.agent.models.list` list the CATALOGUE, which is populated whether or not anything is configured; `client.agent.providers.getAuth` reports whether a provider is actually usable (`ready`, with `api_key_stored`, `oauth_stored` and `no_auth_ready` behind it).
- A session id from `sessions.create` for every prompt/gate/cancel call.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Prompt a session and stream the turn

`client.agent.sessions.create` (returns a session id) → stream the turn with `{ text }` to receive live events (tool calls, gates, output deltas) — see the streaming note under Quirks for the supported per-surface method (SDK helper / HTTP SSE route / CLI command) → resolve any gate as it arrives → turn ends.

### 2. One-shot synchronous prompt

`client.agent.sessions.create` → `client.agent.sessions.turns.run` with `{ text }` — waits for the turn to end, a gate that needs a person, or the server deadline (290 seconds by default). A clean turn returns `{status:"done", session_id, turn_id}` with no reply text; check `status`, because a failed, cancelled or quit turn answers `error` (with the error `event`), `canceled` or `quit`. A turn that parks on a gate returns `{pending_gate, turn_id}`. When the deadline passes first the answer is `503 service_unavailable` with `details.turn_id` and `details.turn_running: true`: the turn is NOT cancelled, so follow it with `client.agent.sessions.turns.get` (or the stream) instead of prompting again. Read the reply with `client.agent.sessions.getTranscript`. Best for short, non-interactive prompts where you don't need streamed events.

### 3. Resolve gates mid-turn

While a prompt streams, the agent may pause for human input: a confirmation gate → `client.agent.gates.approve` / `client.agent.gates.deny`; an open question → `client.agent.gates.answer` (to get a helper model to DRAFT an answer for a parked question call `client.agent.gates.suggest` — it does NOT answer the gate: it dispatches an async job (HTTP 202) whose suggestion arrives via `client.agent.jobs.getResult` and an `event.question_suggestion` on the session stream — only one assist may be in flight per session — and the real answer still goes through `gates.answer`; for unattended runs arm `client.agent.sessions.setAutoReply` (a self-driving auto-user loop that withholds write-class actions unless you opt in with `allow_writes: true`, either on the arm call or later via `sessions.setAutoReplyWrites`)). The gate identity to echo is the ENVELOPE-level `gate {id, generation, type}` that the stream frame parking the gate carries beside `seq` / `incarnation` / `event`. The `event.confirm_request` payload also has a numeric `gate_id`, but that is the daemon's id space and is never the value to echo. The answer body for a question gate: the envelope's gate id as `gate_id` (optionally its `generation`), then **answer** (or **text**, used when **answer** is blank) for a single question; for a batch (`event.user_question` carrying `questions[]`), `answers` maps each `questions[].id` to its answer text, for example `{"gate_id":"<gate.id>","answers":{"<questions[].id>":"yes"}}`. A body with no `answer`, no `text` and no `answers` is `400 bad_request` and the question stays parked. The `question_id` on `event.user_question` is a diagnostic number, not a body field. Echoing a wrong/stale `gate_id`/`generation`, or answering when nothing is parked, returns 409 (`no_pending_gate` / `stale_gate` / `gate_already_answered` / `gate_type_mismatch`). On a session whose approval policy is `always` and whose approver lease was ever minted (`client.agent.sessions.claimApproverLease`, or the lease handed back by a create or attach that asserted `always`), EVERY decision — `gates.approve` / `gates.deny`, and the confirmed re-issue of a gated `sessions.runTool` — must carry the current lease capability in the `X-Hoody-Approver-Lease` request header. (SDK: the `XHoodyApproverLease` option.) Without it the decision is refused `409 approver_lease_required`, a capability that does not verify is `409 approver_lease_invalid`, and an expired one is `approver_lease_expired` until a holder acquires again. Interrupt a running turn with `client.agent.sessions.turns.cancel`. Tear the session down: `client.agent.sessions.close` removes it from the live map; `sessions.delete(id)` always erases the persisted record as well (the SDK method has no keep-the-record form); to keep the record, use `sessions.close` and re-attach later with `sessions.create({ attach: id })`. To roll a session back without tearing it down, `client.agent.sessions.trim` with `{ turn_idx }` truncates conversation history to (and including) that turn index.

### 4. Pick a model / provider

`client.agent.providers.list` to list the catalogued providers (and `client.agent.providers.getAuth` to check that one is `ready`: a stored credential or passwordless access), `client.agent.models.list` to list the catalogued models, then `client.agent.sessions.setModel` to bind a model to a session before prompting — SYNCHRONOUS: the response reports the actual outcome ({status:'ok', model, persisted} on success; structured 409/422 errors while busy or for an unconstructable spec). A successful switch is live for the session at once and then TRIES to persist into the chat agent's frontmatter (a global repin for future sessions of that agent); that save is best-effort, so only `persisted: true` confirms the repin — `persisted: false` means the session switched but future sessions keep the old pin. PRECEDENCE: the agent's frontmatter `model` is the DEFAULT for a session that does not request one; an explicit model on create (`sessions.create({ model })`), or this live `sessions.setModel`, OVERRIDES that pin for the session — create is session-scoped and does not rewrite the agent, this live switch repins globally. The shipped default agent ships pinned, so its pin is the out-of-the-box default until an explicit model is chosen (an explicit model together with `attach` or `backend: "acp"` is rejected 400 — a resumed/delegated session cannot take an explicit model). Each session has further per-session knobs (all session-scoped PATCHes that apply live): `sessions.setEffort` (`{ effort }` — `low|medium|high|xhigh|max`, or `""` for the model default), `sessions.setVerbosity` (`{ level }` — `normal|concise|terse|minimal`), `sessions.setHoodyEnv` (`{ enabled }` — toggle whether the `HOODY_*` shell-env contract is injected for the bash tool), and `sessions.setAgent` (`{ agent }` — bind a named profile from `agents`).

To use a model from an endpoint that is not in the catalogue (anything that speaks the OpenAI Chat Completions, OpenAI Responses or Anthropic Messages API from a public HTTPS address, such as a model server you run yourself or a company gateway), add it as a **custom provider** first. `client.agent.providers.create` takes `id`, `base_url` and `models`, then `client.agent.providers.setApiKey` stores its key (a key never goes in the create body), and its models are `<model_prefix>/<model>` wherever a model is chosen: `sessions.create({ model })`, `sessions.setModel` or `definitions.setModel`. `providers.update` changes it and `providers.delete` removes it with its stored key. The change applies at once, with no restart: new sessions, model switches and Jev see it, and an open session on one of its models picks it up before its next turn. `id` is 1-40 lowercase letters, digits or inner hyphens and cannot change later; `model_prefix` is the `id` unless given, and must equal it; `wire_format` is `chat_completions` (default), `responses` or `messages`, and `auth_scheme` follows it (`bearer`, or `x-api-key` for `messages`). Built-in providers refuse update and delete (`409 provider_builtin`), as does a provider defined in a project's providers file (`409 provider_not_managed`). See Examples for the full run.

### 5. Skills, memory, todos, workflows, agents

- **Skills** — `client.agent.skills.list` (each carries an enabled + trust state), `skills.hub.install` / `skills.hub.search` / `skills.hub.preview` to find and install from the hub. A newly installed/imported skill must be trusted before its code runs — `client.agent.skills.trust` is the gate (identify the skill by `root_dir`+`rel_dir`, set the `trusted` flag); `skills.enable` / `skills.disable` only enable or disable by `name` (set the `disabled` flag). Both `skills.trust` (which grants arbitrary code-execution trust) and `skills.hub.install` (which writes arbitrary skill code to disk) take effect immediately over this namespace: there is no confirmation step, and no privilege beyond ordinary access to the kit is required, so an autonomous caller can silently trust and install skill code. Add your own confirmation before exposing these to one.
- **Memory** — `client.agent.memory.search` for hybrid recall (BM25 + vector + graph) and `memory.listItems` to enumerate by `project`; `memory.createItem` / `memory.updateItem` / `memory.deleteItem` to write; `memory.getGraph` for the relation graph (or `memory.getItem` to read one record by `id`). `memory.enable` / `memory.disable` are the memory capture/privacy switch — they persist `features.memory` and flip the live store — and `memory.flush` forces the store's durability barrier; none of the three is admin-gated. Memory is project-scoped (pass `project`). Memory reads and item writes accept `X-Hoody-Realm` or `?realm=` to select `global` or a realm id (in the SDK, pass `realm` in the method's options); omitted, the agent's current realm is used. A realm this login does not serve returns `404 not_found`; an agent pinned to one realm refuses another with `400 realm_scope_unsupported`. If the selected realm's memory is not connected, the request returns `503 service_unavailable` with `Retry-After` and does not connect it. `memory.consolidate` remains human-only; see Common errors. `memory.search` / `memory.getGraph` also return `503 store_unavailable` while the store is still warming — retry rather than treating it as an empty result.
- **Todos** — `client.agent.todos.list` / `todos.create` to file; then `todos.triage` (LLM inbox pass), `todos.claim` / `todos.release`, `todos.start` (dispatch a background orchestrator — returns `{job_id, session_id}`), `todos.cancel` to abort an in-flight run, and `todos.approveProposal` / `todos.denyProposal` to resolve a proposed run — approve is NOT inert: it spawns a background worker session equivalent to `todos.start` (a J-class autonomous run that spends model budget), while `todos.denyProposal` spawns nothing — plus `todos.snooze` / `todos.archive`. To move a todo between states (`inbox`, `ready`, `blocked`, `review`, `done`, `dropped`) or edit its fields, `todos.update` applies a CAS-guarded patch / `state` transition (`in_progress` is entered only by `todos.claim` / `todos.start`; `todos.update` refuses it, and an unknown state is rejected) — read the todo's OWN `revision` with `todos.get` and pass it back (`todos.getRevision` is a store-wide change cursor, NOT the CAS token; a stale value → `409 todo_conflict`); a stale revision is rejected (409). `todos.archive` is not terminal — `todos.purgeArchived` permanently and irreversibly deletes archived todos of the selected realm that were archived more than 90 days ago (and those with a missing or invalid archive time); no confirmation gate, treat as destructive. Mind the comment split: `todos.createComment` (`/messages`, plural) only appends a comment, whereas `todos.sendMessage` (`/message`, singular) ALSO kicks an orchestrator turn — a budget-spending LLM run that returns `{job_id}` — so use the plural form for a plain note. The `job_id` returned by `todos.start`, `todos.sendMessage` and `todos.triage` completes as `succeeded` the moment the dispatch is accepted; it records the dispatch only, not the worker's outcome. Follow the todo itself (`todos.get`, its state and timeline) rather than polling that job. Note `todos.start` / `todos.triage` / `todos.approveProposal` are J-class autonomous runs with NO confirmation gate on the RPC (reaching the RPC is itself treated as the human approval; that denial lives only on the model-facing `run_todo` *tool*), so calling them from automation silently dispatches a real LLM run — gate them in your own caller.
- **Workflows** — `workflows.list` / `workflows.get` / `workflows.set` / `workflows.delete` / `workflows.setHidden` manage saved definitions; `sessions.startWorkflow` dispatches one onto a live session and returns a JOB, not a run (optionally seed the run with a `{ prompt }` body — input text fed to the workflow) — poll `client.agent.jobs.get` until its `run_id` populates (null during the brief dispatch window), then track via `workflows.listRuns` / `workflows.getRun` and stop with `workflows.cancelRun`; feed a running workflow with `client.agent.workflows.sendMessage` (`{ text }`). Run events flow on the owning session's stream, not a per-run bus.
- **Bots** — `client.agent.bots.create` opens a long-lived assistant that delegates work to sessions on containers; post to it with `bots.sendMessage` (HTTP 202; a busy Bot queues the message) rather than prompting its session, and see Examples for the full create, message, follow, forget, delete run. Replace its limits with `bots.setGuardrails(id, { guardrails })` (empty clears them): the Bot reads them before its next message and delegates opened afterwards receive them in their first prompt, while delegates already open keep theirs. `allowed_containers` and `allowed_agents` restrict the delegates it opens next (empty means any) and `yolo: true` (default false) asks delegates to approve tool calls automatically. Check `yolo_unapplied` in `bots.get`: `pending` means a delegate has not confirmed the change yet and it is sent again; `refused` means that delegate's approval policy does not allow YOLO, so it keeps asking for approvals and the change is not sent again until `yolo` changes. `bots.stream` and `bots.getLog` carry finished rows only; for live reply text, thinking and tool calls follow the Bot's `session_id` (from `bots.get`, it changes after `bots.reset`) with `sessions.stream`, and do not answer questions on that session whose `frame_request.kind` starts with `bot.`, because the Bot runtime answers them. To stop only the Bot's running turn use `sessions.turns.cancel` on its `session_id`.
- **Agent profiles** — `client.agent.definitions.list` to enumerate named profiles; `definitions.create` / `definitions.copy` / `definitions.rename` / `definitions.delete`; `definitions.getSource` → edit → `definitions.setSource` (pass the read's `revision` as `expected_revision`: a stale one is refused `409 revision_conflict` and nothing is written; without it the save is unconditional); `definitions.setModel` / `definitions.setTools` / `definitions.toggleTool` / `definitions.setTurnLimit` / `definitions.reset`. The product-owned `bot` profile (the one a Bot runs) allows only a model pin through `definitions.setModel` (an empty model clears it); `definitions.setSource`, `definitions.setTools`, `definitions.toggleTool` and `definitions.setTurnLimit` are refused for it with `400 bad_request`, as are creating over it and renaming it, and a Bot's own `model` overrides the pin. To make a session use a profile, `client.agent.sessions.setAgent` (`{ agent }`) — that selects, it does NOT edit the profile. Two daemon guard rails: `definitions.delete` refuses the configured default chat agent, and a shipped-default profile that has no removable override of its own (`is_error:true` — use `definitions.reset` or `definitions.setSource` instead); in a realm that holds its own saved override of a shipped profile, deleting it removes the override and the shipped version shows through again, and `definitions.reset` refuses a profile that has no shipped default (`is_error:true`).

### 6. Fire-and-observe, recurring prompts, and re-attach

- **Fire-and-observe** — `client.agent.sessions.startTurn` with `{ text }` dispatches a turn and returns `{ job_id, session_id, turn_id }` immediately (HTTP 202) without streaming or blocking; watch completion via the `agent_done` on the session event stream (a connected `client.agent.sessions.connect` socket, or `client.agent.sessions.stream`) whose `turn_id` matches (another client's turn on the same session ends with its own `agent_done`). A cancel scoped with that `turn_id` stops only this turn. Refuses with 409 `turn_in_flight` if a turn is running, or 409 `gate_parked` if a gate is open.
- **Observe / re-attach** — `client.agent.sessions.connect` attaches to a live session's full `event.*` stream over WebSocket, and `client.agent.sessions.stream` is the SSE form of the same route; neither falls back to the other on its own. `const socket = await client.agent.sessions.connect(id)` gives a socket client that is NOT connected yet: register handlers (`onEnvelope`, `onEnd`, `onError`), then `await socket.connect()`. Iterate the SSE form with `for await (const ev of await client.agent.sessions.stream(id))`. Either way, pass `since` (gateway int64 seq, or the `Last-Event-ID` header) to resume from the 1024-event replay ring after a disconnect (a gap past eviction yields `event: lagged {code:replay_gap}`). Each frame is `{seq, incarnation, event}`, and a session re-attached under the same id starts a new incarnation whose `seq` restarts at 1, so send `incarnation` (the one you last saw) together with `since`: a mismatch answers `replay_gap` plus the full retained ring instead of silently resuming into a different history. Over SSE the `event:` line drops the `event.` prefix (`event.agent_done` arrives as `event: agent_done`) while the JSON `data:` keeps the full name, so match ordinary event frames on the parsed payload's `event.type` (for example `event.agent_done`); control frames (`lagged`, `end`, `replay_boundary`) have no `event` key. WebSocket frames are delivered unchanged. `client.agent.sessions.replay` returns the buffered event tail of a *live* session (with `min_seq`/`max_seq`) for a one-shot catch-up (only a *live* session has this ring). `sessions.connect` does not revive a session either: on a persisted but non-live session it answers `404 not_found`, so re-attach it first (`sessions.create({ attach: id })`), then open the stream.
- **Recurring prompts (loops)** — `client.agent.loops.create` with `{ prompt, interval }` (plus optional `max_runs` / `stop_when` / `max_cost_usd` / `max_wall_ms` caps) schedules a prompt to re-fire on a live session; `sessions.listLoops` / `loops.update` (pause via `{ paused: true }`) / `loops.delete` to manage, `loops.startRun` to fire one immediately. Loops are entirely session-scoped. Three rules refuse a request rather than adjusting it: `interval` has a floor of 60 seconds; at most 8 loops can be active (not paused, not ended) per daemon, so the 9th create is rejected; and each `loops.update` carries at most ONE intent (`paused`, or `expires_in`, or the budget fields `max_cost_usd` / `max_wall_ms`), so a request mixing two is rejected 400 (a body with none of them is treated as a budget update).

### 7. Headless one-shot run

The run's shape is chosen by the request BODY, not by a header: the default (`format` `text` or `json`) is an async job — HTTP 202 `{ job_id }`, then poll `client.agent.jobs.get` and fetch the output with `client.agent.jobs.getResult` — while `format: "stream-json"` (or `stream: true`) streams the run over SSE (`start` → `result` or `error` → `end`). A failure after the acknowledgement (a timeout, `admin_unauthorized`) arrives later, in the job result or as the `error` frame, never as the HTTP status. Every confirm, plan and question auto-approves in a headless run, so treat it as arbitrary code execution. SDK: `client.agent.headless.start` sends `stream: false` on every call and accepts `format` `text` or `json` only (`stream-json` selects SSE, so `start` refuses it before anything is sent); it resolves to the 202 `{ job_id }`. `client.agent.headless.stream` sends `stream: true` on every call and returns a Promise of an async iterable of SSE events; it sends nothing until you start iterating. Consume it with `for await (const ev of await client.agent.headless.stream({ prompt }))`; the `await` inside the loop head is required, because without it the loop tries to iterate the Promise itself and fails before anything is sent. If the kit answers the 202 job acknowledgement instead of a stream, the first iteration throws an `ApiError` with code `NOT_AN_EVENT_STREAM` and status 202. That error holds only the code, a fixed sentence and the status: the `{ job_id }` body reaches only the client's diagnostic callback, `onStreamDiagnostic` in the client config (`headless.stream` takes no per-call callback), which receives the original error with the body on its `response` — take the id from there and poll the job.

### 8. Configure MCP servers for a session

Reads first: `client.agent.mcp.listServers` (`{ session_id }`) returns the EFFECTIVE merged `mcp_servers` config, the per-layer settings files behind it, and each server's LIVE runtime state (connected, negotiated protocol revision, tool count, pid, revocation reason, recent stderr). Every write is TWO steps: `client.agent.mcp.createWriteIntent` (`{ session_id, op, scope }`, op ∈ the strings "upsert", "delete", "set_enabled" and "import", scope ∈ `user`|`project`|`local`; an omitted scope means `user`, or `project` when the session has no user layer, which is the usual case for a container session — read the returned target path to confirm where the write lands) mints a single-use nonce bound to {session, op, resolved settings path} and returns the target path plus the current `mcp_servers` hash — then present that `nonce` plus the hash as `expect_hash` on the matching `client.agent.mcp.upsertServer` / `mcp.deleteServer` / `mcp.enableServer` / `mcp.disableServer` / `mcp.importServers`. BOTH are required on every write: skipping step one fails closed, a nonce minted for a different op or scope fails closed, and `expect_hash` has no omit-it default — a first write into a settings file that does not exist yet states that expectation with the empty-array hash rather than leaving the field out. To adopt someone else's config, preview it with `client.agent.mcp.previewImport` (`{ session_id, document }` — writes nothing, needs no nonce, strips credential values) and then `mcp.importServers` with a fresh `op: "import"` nonce; imported servers land DISABLED, so enable each one with `mcp.enableServer`. After editing a settings file by hand, or to recover a server that died, `client.agent.mcp.reconnect` (`{ session_id }`) re-reads the layers and reconciles every live session's pool — a healthy unchanged server is not restarted. `client.agent.mcp.testServer` trials a candidate config without saving it, but it is human-only (see Common errors).

## Quirks & gotchas

- The bare `hoody agent` verb is a **TUI launcher**, separate from this HTTP namespace; they coexist — the launcher opens the in-container Agent TUI, the namespace is the typed control surface. In that TUI, Ctrl+V pastes from the clipboard of the machine the CLI runs on, and Shift+click opens a link (the TUI tracks the mouse).
- Source of truth is the agent kit's own OpenAPI document, served at `GET /api/v1/agent/openapi.{json,yaml}`; every route lives under the single `/api/v1/agent` prefix. The kit checks no credential of its own and asks for no bearer header; access is decided by the container's proxy permission policy. Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only. A request that does not come through the kit URL gets 403 `forbidden`, so call the kit URL.
- The proxy service slug is `agent` and the kit URL host carries the index segment (`-agent-{index}`). Resolve it with `client.getKitUrl('agent', container)` rather than hand-building it.
- `sessions.turns.run` waits for the turn to end (or returns `{pending_gate}` the moment a turn parks on a confirm/question), but at most until the server deadline (290 seconds by default): a turn still running then answers `503 service_unavailable` with `details.turn_running: true` and keeps running; prefer streamed prompting for anything non-trivial so you can observe progress and resolve gates as they arrive. (SDK note: the generated `sessions.startTurnAndStream` accessor POSTs `prompt:stream` and returns a Promise of an async iterable of SSE events, so iterate `for await (const ev of await client.agent.sessions.startTurnAndStream(id, { text }))`. Nothing is sent until you start iterating or read `stream.response`. The stream does NOT close when the turn ends: it keeps delivering the session's later events, so break out at the `agent_done` for your own turn. `const stream = await client.agent.sessions.startTurnAndStream(id, { text }); const { documented } = await stream.response;` gives the turn id as `documented.XHoodyTurnId` (the `X-Hoody-Turn-Id` header; a browser sees it only if the kit exposes it over CORS); stop at the `agent_done` whose payload (`JSON.parse(ev.raw)`) carries that `turn_id`. Without the header, take the id from the stream itself: the `replay_boundary` frame's payload carries it as `turn_id`. Buffered frames arrive BEFORE `replay_boundary`, and a fast turn can finish inside them, so keep the `agent_done` frames seen before the boundary and check them against its `turn_id` as soon as it arrives; otherwise stop at the next `agent_done` carrying that `turn_id`. The higher-level `streamAgentPrompt` helper exported from the SDK wraps the same route and exposes `events` / `text` / `done` plus a cancel() method that aborts the turn.) For non-interactive turns where you cannot resolve gates by hand, enable the `auto_approve` gate policy to answer confirm gates (off by default). On the blocking form (`sessions.turns.run`, route `prompt:sync`) it stays on for the dispatched turn even after the request ends. On the streamed form (route `prompt:stream`) it is tied to the connection, not the turn: disconnecting before the turn ends stops it, and while the stream stays open it also answers confirm gates of LATER turns on the same session, so close the stream at your turn's `agent_done`. With either form, an ordinary confirm gate is approved, a gate raised by a tool-call rule is DENIED, and a session whose approval policy is `always` refuses the policy with `409 approval_policy_active` before the turn starts. SDK: `policy: 'auto_approve'` in the `sessions.startTurnAndStream` / `sessions.turns.run` options. This only answers **confirm** gates, never questions.
- **The agent's shell has the container user's own sudo.** The agent runs as the container's `user`, and its bash tool can use sudo exactly as that user can without a password: with the default passwordless sudo it can `sudo apt-get install`, `sudo systemctl enable --now` a unit and so on. When `user` has no passwordless sudo (the drop-in removed, a password required), the agent's shell has none either, because there is no terminal to type a password into; a policy that allows only some commands without a password allows the same commands to the agent (with sudo's default `listpw`). While the agent's shell can sudo, a session's `dir_scope` (`home`) no longer confines its bash commands: the file tools still keep to the scope, but the shell can reach the whole container, like the terminal kit. To take sudo away from the agent, take passwordless sudo away from `user` (see container-tools); the agent keeps everything else `user` has, such as Docker through the `docker` group.
- Every prompt/gate/cancel call is **session-scoped** — you must hold a session id from `sessions.create` first; there is no implicit default session. Hook writes are session-scoped too (the guarded writes — `hooks.upsert` / `hooks.delete` / `hooks.enable` / `hooks.disable` / `hooks.enableAll` / `hooks.disableAll` — plus `hooks.createWriteIntent`, and the side-effecting `hooks.run` / `hooks.trust`, all require a live `session_id` — `hooks.trust` clears the per-session hook-trust prompt (the execution-trust probe `hooks.list` reports), the gate that must be acknowledged before a saved hook command is allowed to fire, mirroring `skills.trust` for skills; `hooks.reload` accepts one only to also return the reloaded summary) AND nonce-guarded: call `client.agent.hooks.createWriteIntent` (`{ session_id, op, scope }`, op ∈ upsert|delete|toggle|set_disabled|rules_set; `rules_set` is for `hooks.setRules` and needs its own matching nonce) to mint a single-use nonce, then pass that `nonce` on the matching `hooks.upsert` / `hooks.delete` / `hooks.enable` / `hooks.disable` / `hooks.enableAll` / `hooks.disableAll` — the nonce binds to that session+op+scope tuple and the write fails closed without it. Note hooks are an arbitrary-command surface: `hooks.upsert` persists a command that fires on lifecycle events, and `hooks.run` on a command hook runs a command at once: running saved hooks goes through the session's hook-trust gate, while a run that supplies an unsaved inline `command` runs it without that saved-hook trust check. Every command-hook run is refused (`approval_policy_unsatisfiable`) while the session's approval policy is `always`, and `hooks.test` of a shipped hook only evaluates its trigger without running anything. These calls carry no confirmation step of their own — the same access that authorizes any agent-kit call authorizes these too, with nothing extra — so add your own confirmation before exposing this surface to an autonomous caller.
- **`env` and `headers` VALUES are never returned by the MCP surface; every other field comes back verbatim.** `mcp.listServers` reports `env_keys` / `header_keys` — key NAMES only — because a redacted value invites a client to write the placeholder back as the real secret; a write whose body carries the redaction placeholder for a credential is REFUSED rather than stored. Other fields, including `url`, `command` and `args`, are echoed verbatim, so a credential embedded in one of them (a token in a URL, a key on a command line) is NOT redacted: keep secrets in `env` / `headers`, and treat the rest of a listing as sensitive. To change a secret you must supply its real value; to leave one alone, omit the field — `mcp.upsertServer` merges FIELD BY FIELD over the existing entry of the same name, so omitted fields keep their stored value (including fields this build does not model), and `env` / `headers` merge per key (a key set to `null` is deleted, `{}` clears the map). A genuine re-point (a changed `type`, `command`, `args` or `url`) clears `env` and `headers` unless the same request re-supplies them, so send the credentials the new target needs in that write; restating the identity you read back is not a re-point. `mcp.enableServer` / `mcp.disableServer` flip only the `enabled` flag so credentials and options survive a disable. Writes apply to live sessions before the response returns: a deleted, disabled, or re-pointed server is REVOKED in every live session first (a stdio child is reaped when its last holder releases), so a caller mid-turn cannot still reach it. Import is WHOLE-BATCH — one bad entry aborts everything — it understands the hoody (`mcp_servers` list), Claude/Cursor (`mcpServers` map) and VS Code (`servers` map) dialects, and REFUSES a document carrying more than one of them rather than guessing.
- `client.agent.platform.bootstrapToken` (token bootstrap) is enabled by default; a deployment can turn it off, and then every call answers 404. Browser clients may call it; the body must be exactly `application/json`. Where the deployment requires a capability, the body must carry the matching `capability` (a mismatch is also 404). The token must belong to this box's owner and carry the full login grant (otherwise 403). On a box with no credential it installs (201 `installed`) and adopts any local sessions or todos that have no owner; on a box logged in to the SAME account it replaces the stored token whether or not it expired (200 `renewed`). A token for a different account is refused `409 agent_login_conflict`, and a credential supplied through the environment is never replaced (`409 credential_present`).

## Common errors

- A model rate limit can end the turn: `event.error.code` is `quota_wait_too_long` or `rate_limit`, and `agent_done.error_code` carries the same code. For `quota_wait_too_long`, read `retry_after_secs` from the error payload, wait that many seconds, then send the message again: the turn ended instead of waiting. `retry_after_secs` is omitted on other errors, so do not assume it exists for `rate_limit`.
- A gate or question left unresolved stalls the turn — a streamed prompt that emitted an `event.confirm_request` (confirm gate) or `event.user_question` (question gate) will not complete until you answer it: `gates.approve` / `gates.deny` for a confirm, `gates.answer` for a question. For unattended runs, arm `sessions.setAutoReply` (a self-driving auto-user loop), or pass `policy: "auto_approve"` on the prompt — but `auto_approve` only answers **confirm** gates (approving ordinary ones, denying rule-raised ones; refused with `409 approval_policy_active` on an `always` session), never questions; a parked question still stalls until `gates.answer` (or the auto-reply loop) answers it.
- `tasks.list` and `tasks.getTranscript` return their data INLINE and need no live session and no attached stream. `tasks.list` is the UNION of the live task registry and the session's PERSISTED task store (keyed by task id, live winning) — the live registry evicts completed tasks when a new one spawns, so a finished task can leave memory while its transcript is still durable, and a live-only list would hide it. `tasks.getTranscript` reads a task that reached a terminal state even for a closed session and after a daemon restart; a task still RUNNING when the daemon died is NOT recoverable and reads 404. Its `source` field is `"live"` or `"store"`, and `complete` reports whether the response reflects a terminal projection DURABLY COMMITTED to that store. `after_seq` is EXCLUSIVE (entries strictly after it, plus any still-open entry); OMITTING it returns the whole transcript, which is distinct from `after_seq=0`. `tasks.cancel` / `sessions.cancelTasks` still act on a LIVE session and stop background tasks mid-turn (server-layer; tasks survive `sessions.turns.cancel` but are not restartable).
- `memory.consolidate` (POST /memory/consolidate) is **human-only and ALWAYS fails over this namespace** — it has no successful HTTP/SDK/CLI path: a call that passes the admin check returns `403 human_only`, and the admin check can refuse it first with `403 admin_unauthorized`. It can only be triggered from an interactive human session. Do not call it programmatically.
- `mcp.testServer` (POST /mcp/probe) is **human-only and ALWAYS fails over this namespace** — probing STARTS A PROCESS (stdio) or makes an outbound request to a caller-chosen URL (http/sse), so a machine caller may not self-approve it and receives `403 human_only` on every HTTP/SDK/CLI call. The surface still exposes it for completeness, it simply always refuses. The deny list is still enforced on the candidate config before anything is started. Use `mcp.previewImport` for a write-free preview instead; there is no programmatic substitute for the live trial.
- An MCP write needs BOTH a `nonce` and an `expect_hash` — neither is optional, and a stale hash is a CONFLICT rather than a silent overwrite. `mcp.upsertServer` / `mcp.deleteServer` / `mcp.enableServer` / `mcp.disableServer` / `mcp.importServers` each require a fresh single-use `nonce` from `mcp.createWriteIntent` minted for that exact op and scope (one minted for a different op or scope fails closed) AND the `mcp_servers` hash you last read, from either `mcp.createWriteIntent` or `mcp.listServers`. A mismatch means someone else edited the layer since you read it — re-read, re-mint, retry; each nonce is good for exactly one write, so a retry always needs a new one. There is no "omit it for the first write" shortcut: writing into a settings file that does not exist yet means passing the empty-array hash.
- `workflows.delete` removes **user** workflows and saved customizations. A built-in/**system** workflow that you never customized is refused (`is_error:true`) and re-seeds on every boot; `workflows.setHidden` is the only way to remove it from view. Deleting your saved customization of a system workflow succeeds and brings the shipped version back: at once in a scoped realm, at the next daemon restart otherwise.
- Empty values on agent-profile edits mean *inherit / unrestrict*, not *clear to nothing*: `definitions.setModel` with `model: ""` removes the model line (falls back to the default model), and `definitions.setTools` with `tools: []` removes the allow-list line, which means **all tools are allowed** (NOT zero). Pass a non-empty `tools` array to genuinely restrict.
- Prompting with no usable model/provider configured fails the turn. `client.agent.providers.list` lists every catalogued provider whether or not it is set up, so check the one you intend to use with `client.agent.providers.getAuth` before you prompt (blocking or streamed): `ready` is true for a stored API key, a stored OAuth login, or a passwordless provider (`no_auth_ready`).
- A custom provider's `base_url` must be an `https` URL with no user name, password, query or fragment, at a public address; one that is not (an internal address, a name that only resolves inside a network, or a name that resolves to an internal address when a request is made) is refused `422 provider_invalid` with `details.field` `base_url`. Create is not idempotent by itself: repeating a create that went through answers `409 provider_exists`, so send an `Idempotency-Key` to retry safely (the same key with another body is `422 idempotency_key_reused`). Deleting a provider leaves an open session on one of its models unconfigured: its next prompt fails with `session_unconfigured` until you switch it to another model, and agents and Jev settings that name one of its models fail the same way until changed.
- Calling prompt/gate/cancel against a session whose live connection was torn down (`sessions.close`) returns not-found. If the record survives, re-attach with `sessions.create({ attach: id })`; otherwise start a fresh session (the same create call without `attach`). After a *hard* delete (`sessions.delete`, which always erases the record) the record is gone and only a fresh session works.

## Related namespaces

`terminal`, `exec`, `files`, `notes`, `api`.

## Examples

A **Bot** here is the agent's long-lived assistant (`client.agent.bots`). It opens delegate sessions on containers, follows them and reports back. It is not the chat-app `bot` namespace. Set `P`, `C`, `N` from `containers.get` first. The Bot's id below is `release-bot`; omit `id` on create to have one generated, and take it from the response.

### 1. Create a Bot, message it, follow its replies, forget, delete

**Goal:** run a Bot end to end. `guardrails` are limits on the work (they apply to the Bot and every delegate it opens), not instructions. A Bot lives in one realm: pass `realm` (`X-Hoody-Realm`) to pick one, otherwise the agent's current realm is used. The Bot's own session opens when the first message is posted, so `session_id` is empty until then.

**Step 1 — create.** Send `id` to make a retry safe: a second create with the same id answers `409 bot_exists`.

```typescript
const bot = await client.agent.bots.create({
  id: 'release-bot',
  name: 'Release bot',
  role: 'Ships the weekly release.',
  guardrails: 'Never push to main.',
});
```

**Step 2 — message it.** The answer is `202` with `{message_id, state}`: `posted` (with `turn_id`) when the Bot is free, `queued` while it is busy, and the message goes out when its turn ends. Add an `Idempotency-Key` to retry safely.

```typescript
const sent = await client.agent.bots.sendMessage('release-bot', {
  text: 'Check the staging build and tell me if it is green.',
});
```

**Step 3 — follow the replies.** The stream carries finished log rows only: first a `state` frame (the Bot), then `row` frames, plus `lagged`, `archived` and `end`. The reply is one `bot` row written when its turn ends, and a turn with no reply text writes none. Resume with `since` (or `Last-Event-ID`). For live text, thinking and tool calls, follow the Bot's own `session_id` with `sessions.stream` instead. To read without streaming, page the log: pass `next_since` back as `since` while `has_more` is true.

```typescript
for await (const frame of await client.agent.bots.stream('release-bot')) {
  if (frame.declared && frame.event === 'row' && frame.data.role === 'bot') console.log(frame.data.text);
}
```

**Step 4 — forget or reset.** `forget` moves the log to the archive and clears the conversation; the Bot keeps its settings and delegates. `reset` also archives the log but starts a new session with the Bot's current model, which is how a changed `model` takes effect. The old session is not closed. Neither deletes the archive; `purgeArchive` does.

```typescript
await client.agent.bots.forget('release-bot');
await client.agent.bots.reset('release-bot');
```

**Step 5 — delete.** Removes the Bot with its log and archive, after a best-effort stop of its working delegates. Its session and delegates are not closed: they stay listed under the sessions and a person can continue them. There is no stop route for the Bot itself: to stop its running turn, cancel its `session_id` with `sessions.turns.cancel`.

```typescript
await client.agent.bots.delete('release-bot');
```

### 2. Add a custom provider, store its key, use its model

**Goal:** connect an OpenAI-compatible endpoint and run a session on one of its models. The provider id below is `acme`; its model is selected as `acme/llama-3.3-70b`.

**Step 1 — create it.** `id`, `base_url` and `models` are required. Add an `Idempotency-Key` so a retry answers with the provider the first try created instead of `409 provider_exists`. The reply carries the provider, with each model's `spec`.

```typescript
const { provider } = await client.agent.providers.create(
  {
    id: 'acme',
    base_url: 'https://api.acme.example/v1',
    models: [{ model: 'llama-3.3-70b', context_window: 131072 }],
  },
  { IdempotencyKey: 'acme-create-1' },
);
```

**Step 2 — store its key.** The key has its own route and is never returned.

```typescript
// apiKey: the provider's key, read from wherever you keep secrets
await client.agent.providers.setApiKey('acme', { api_key: apiKey });
```

**Step 3 — use its model.** Start a session on it; `sessions.setModel` switches an open one and `definitions.setModel` pins an agent profile.

```typescript
const session = await client.agent.sessions.create({ model: 'acme/llama-3.3-70b' });
```

**Step 4 — change or remove it.** Update names only what changes (`models` and `headers` replace the current list and map; `id` and `model_prefix` are fixed). Delete asks for confirmation on the CLI and removes the stored key too.

```typescript
await client.agent.providers.update('acme', { base_url: 'https://eu.api.acme.example/v1' });
await client.agent.providers.delete('acme');
```

## Reference

**Accessor:** `client.agent`  |  **Import:** `import * as agent from 'hoody-sdk/agent'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, containerId?, serviceIndex?, server? }`, which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are refused) and `cache` (a GET's response cache: `true`, a TTL in ms, or `false` to bypass) (no `_realm`: that one is control-plane only). When the signature shows an options object, the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself is complete as written: the object after it takes the transport options too.

### `client.agent.acp` (5) — Process-wide settings (home settings.json)

#### `disable` — Enable or disable a BYOA ACP backend.

```typescript
client.agent.acp.disable(agent: string, data?: Omit<AgentSetACPEnabledRequest, "enabled">, options?: { realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `agent` | `string` | path | Yes | The agent. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `Omit<AgentSetACPEnabledRequest, "enabled">` | body | No |  |

**Fixed by the method:** the method sets `enabled: false`; do not pass `enabled`.

**Returns:** `Promise<AgentSetACPEnabledResponse>`  |  **HTTP:** `PUT /api/v1/agent/acp/agents/{agent}/enabled`
**CLI:** `hoody agent acp disable`

---

#### `enable` — Enable or disable a BYOA ACP backend.

```typescript
client.agent.acp.enable(agent: string, data?: Omit<AgentSetACPEnabledRequest, "enabled">, options?: { realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `agent` | `string` | path | Yes | The agent. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `Omit<AgentSetACPEnabledRequest, "enabled">` | body | No |  |

**Fixed by the method:** the method sets `enabled: true`; do not pass `enabled`.

**Returns:** `Promise<AgentSetACPEnabledResponse>`  |  **HTTP:** `PUT /api/v1/agent/acp/agents/{agent}/enabled`
**CLI:** `hoody agent acp enable`

---

#### `getStatus` — Get BYOA ACP backend status.

```typescript
client.agent.acp.getStatus(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentAcpGetStatusResponse>`  |  **HTTP:** `GET /api/v1/agent/acp/agents`
**CLI:** `hoody agent acp status`

---

#### `setModel` — Set a BYOA backend's default model and effort.

```typescript
client.agent.acp.setModel(agent: string, data?: AgentAcpSetModelRequest, options?: { realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `agent` | `string` | path | Yes | The agent. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentAcpSetModelRequest` | body | No |  |

**Body:** `{ model: string, effort: string }`

**Returns:** `Promise<AgentAcpSetModelResponse>`  |  **HTTP:** `PUT /api/v1/agent/acp/agents/{agent}/model`
**CLI:** `hoody agent acp model set`

---

#### `setSecret` — Store an ACP per-agent secret value.

```typescript
client.agent.acp.setSecret(agent: string, key: string, data?: AgentAcpSetSecretRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `agent` | `string` | path | Yes | The agent. |
| `key` | `string` | path | Yes | The key. |
| `data` | `AgentAcpSetSecretRequest` | body | No |  |

**Body:** `{ value: string }`

**Returns:** `Promise<AgentAcpSetSecretResponse>`  |  **HTTP:** `PUT /api/v1/agent/acp/agents/{agent}/secrets/{key}`
**CLI:** `hoody agent acp secrets set`

---

### `client.agent` (3) — Hoody operations

#### `signIn` — Sign this container's agent in to the Hoody platform with a token of the box's owner. Until then the agent's shell and file tools answer "not logged in".

```typescript
client.agent.signIn(data: AgentBootstrapHoodyTokenRequest & Required<Pick<AgentBootstrapHoodyTokenRequest, "token">>)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `AgentBootstrapHoodyTokenRequest & Required<Pick<AgentBootstrapHoodyTokenRequest, "token">>` | body | Yes |  |

**Body:** `{ token*: string, capability: string }`

- `capability` — The operator bootstrap capability, required only on deployments configured with one; a mismatch is answered 404.

**Returns:** `Promise<AgentBootstrapHoodyTokenResponse>`  |  **HTTP:** `POST /api/v1/agent/hoody/auth/bootstrap`

---

#### `stopAllWork` — Stop everything running in the realm.

```typescript
client.agent.stopAllWork(data?: AgentStopAllWorkRequest, options?: { realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentStopAllWorkRequest` | body | No |  |

**Body:** `{ after: string }`

- `after` — A next_cursor from an earlier call, unchanged (the cursor is opaque): act only on the items after it. Any other value is 400 bad_request.

**Returns:** `Promise<AgentStopAllWorkResponse>`  |  **HTTP:** `POST /api/v1/agent/stop`
**CLI:** `hoody agent work stop`

---

#### `whoami` — Hoody platform identity and realm scope.

```typescript
client.agent.whoami()
```

**Returns:** `Promise<AgentWhoamiResponse>`  |  **HTTP:** `GET /api/v1/agent/hoody/auth/status`
**CLI:** `hoody agent whoami`

---

#### `importLocalConfig` — Push a local agent CLI's config/credentials into the container.

```typescript
client.agent.importLocalConfig(tool: string, options?: AgentConfigSyncOptions)
```

**Returns:** `Promise<AgentConfigSyncResult>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `importLocalConfigs` — Import several tools with shared options.

```typescript
client.agent.importLocalConfigs(tools: string[], options?: AgentConfigSyncOptions)
```

**Returns:** `Promise<AgentConfigSyncResult[]>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `listLocalConfigTools` — Inspect the agent-config tool registry.

```typescript
client.agent.listLocalConfigTools()
```

**Returns:** `AgentConfigToolSpec[]`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

### `client.agent.bots` (23) — Bots operations

#### `create` — Create a Bot.

```typescript
client.agent.bots.create(data?: AgentBotsCreateRequest, options?: { realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentBotsCreateRequest` | body | No |  |

**Body:** `{ id: string, name: string, role: string, model: string, guardrails: string, allowed_containers: string[], allowed_agents: string[], yolo: bool, guardrail_check: "strict" | "lenient" | "off" }`

- `id` — The Bot's id. Omit it to have one generated. It cannot be changed later. To retry a create safely, pass an id: when the first try created the Bot, the retry answers 409 bot_exists.
- `model` — The model the Bot's session runs. Omit it for the bot agent's own model. A model no session could start with is refused 422 model_unavailable.
- `guardrail_check` — How the Bot's dispatches and delegate messages are checked against its guardrails before they go out. strict: work that may break a guardrail is refused, and so is work whose check cannot be completed (the Bot tells you and can try again). lenient: work that may break a guardrail is refused; when the check cannot be completed, the work goes ahead unchecked. off: no check. …

**Returns:** `Promise<AgentBotsCreateResponse>`  |  **HTTP:** `POST /api/v1/agent/bots`
**CLI:** `hoody agent bots create`

---

#### `delete` — Delete a Bot.

```typescript
client.agent.bots.delete(id: string, options?: { realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The bot id. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/agent/bots/{id}`
**CLI:** `hoody agent bots delete`

---

#### `forget` — Make a Bot forget its conversation.

```typescript
client.agent.bots.forget(id: string, options?: { realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The bot id. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentBotsForgetResponse>`  |  **HTTP:** `POST /api/v1/agent/bots/{id}/forget`
**CLI:** `hoody agent bots forget`

---

#### `get` — Get a Bot.

```typescript
client.agent.bots.get(id: string, options?: { realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The bot id. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentBotsGetResponse>`  |  **HTTP:** `GET /api/v1/agent/bots/{id}`
**CLI:** `hoody agent bots get`

---

#### `getArchive` — Read a Bot's archive.

```typescript
client.agent.bots.getArchive(id: string, options?: { since?: number; limit?: number; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The bot id. |
| `since` | `number` | query | No | Return only rows whose seq is greater than this: the next_since of the previous page. Default 0. |
| `limit` | `number` | query | No | At most this many rows: 100 when omitted or 0, at most 500 (a larger value reads 500). Negative or non-integer = 400. These routes page by since, not by page number: ?page is 400. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentBotsGetArchiveResponse>`  |  **HTTP:** `GET /api/v1/agent/bots/{id}/archive`
**CLI:** `hoody agent bots archive get`

---

#### `getArchiveAll` — Read a Bot's archive. (collect all pages)

```typescript
client.agent.bots.getArchiveAll(id: string, options?: { since?: number; limit?: number; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The bot id. |
| `since` | `number` | query | No | Return only rows whose seq is greater than this: the next_since of the previous page. Default 0. |
| `limit` | `number` | query | No | At most this many rows: 100 when omitted or 0, at most 500 (a larger value reads 500). Negative or non-integer = 400. These routes page by since, not by page number: ?page is 400. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<(NonNullable<AgentBotsGetArchiveResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`getArchive()` fetches one page). `getArchiveIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/bots/{id}/archive`
**CLI:** `hoody agent bots archive get`

---

#### `getArchiveIterator` — Read a Bot's archive. (async iterator)

```typescript
client.agent.bots.getArchiveIterator(id: string, options?: { since?: number; limit?: number; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The bot id. |
| `since` | `number` | query | No | Return only rows whose seq is greater than this: the next_since of the previous page. Default 0. |
| `limit` | `number` | query | No | At most this many rows: 100 when omitted or 0, at most 500 (a larger value reads 500). Negative or non-integer = 400. These routes page by since, not by page number: ?page is 400. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncGenerator<(NonNullable<AgentBotsGetArchiveResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`getArchive()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/bots/{id}/archive`
**CLI:** `hoody agent bots archive get`

---

#### `getLog` — Read a Bot's log.

```typescript
client.agent.bots.getLog(id: string, options?: { since?: number; limit?: number; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The bot id. |
| `since` | `number` | query | No | Return only rows whose seq is greater than this: the next_since of the previous page. Default 0. |
| `limit` | `number` | query | No | At most this many rows: 100 when omitted or 0, at most 500 (a larger value reads 500). Negative or non-integer = 400. These routes page by since, not by page number: ?page is 400. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentBotsGetLogResponse>`  |  **HTTP:** `GET /api/v1/agent/bots/{id}/log`
**CLI:** `hoody agent bots log get`

---

#### `getLogAll` — Read a Bot's log. (collect all pages)

```typescript
client.agent.bots.getLogAll(id: string, options?: { since?: number; limit?: number; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The bot id. |
| `since` | `number` | query | No | Return only rows whose seq is greater than this: the next_since of the previous page. Default 0. |
| `limit` | `number` | query | No | At most this many rows: 100 when omitted or 0, at most 500 (a larger value reads 500). Negative or non-integer = 400. These routes page by since, not by page number: ?page is 400. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<(NonNullable<AgentBotsGetLogResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`getLog()` fetches one page). `getLogIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/bots/{id}/log`
**CLI:** `hoody agent bots log get`

---

#### `getLogIterator` — Read a Bot's log. (async iterator)

```typescript
client.agent.bots.getLogIterator(id: string, options?: { since?: number; limit?: number; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The bot id. |
| `since` | `number` | query | No | Return only rows whose seq is greater than this: the next_since of the previous page. Default 0. |
| `limit` | `number` | query | No | At most this many rows: 100 when omitted or 0, at most 500 (a larger value reads 500). Negative or non-integer = 400. These routes page by since, not by page number: ?page is 400. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncGenerator<(NonNullable<AgentBotsGetLogResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`getLog()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/bots/{id}/log`
**CLI:** `hoody agent bots log get`

---

#### `list` — List the Bots.

```typescript
client.agent.bots.list(options?: { realm?: "global" | "all" | (string & {}); page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm` | `"global" \| "all" \| (string & {})` | query | No | The realm to list: "global" (Bots not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves, global included. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `realm` | `"global" \| "all" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentBotsListResponse>`  |  **HTTP:** `GET /api/v1/agent/bots`
**CLI:** `hoody agent bots list`

---

#### `listAll` — List the Bots. (collect all pages)

```typescript
client.agent.bots.listAll(options?: { realm?: "global" | "all" | (string & {}); page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm` | `"global" \| "all" \| (string & {})` | query | No | The realm to list: "global" (Bots not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves, global included. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `realm` | `"global" \| "all" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<(NonNullable<AgentBotsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/bots`
**CLI:** `hoody agent bots list`

---

#### `listDelegates` — List a Bot's delegates.

```typescript
client.agent.bots.listDelegates(id: string, options?: { state?: "open" | "closed"; page?: number; limit?: number; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The bot id. |
| `state` | `"open" \| "closed"` | query | No | open or closed: list only the delegates in that state. Omitted: both. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentBotsListDelegatesResponse>`  |  **HTTP:** `GET /api/v1/agent/bots/{id}/delegates`
**CLI:** `hoody agent bots delegates list`

---

#### `listDelegatesAll` — List a Bot's delegates. (collect all pages)

```typescript
client.agent.bots.listDelegatesAll(id: string, options?: { state?: "open" | "closed"; page?: number; limit?: number; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The bot id. |
| `state` | `"open" \| "closed"` | query | No | open or closed: list only the delegates in that state. Omitted: both. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<(NonNullable<AgentBotsListDelegatesResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`listDelegates()` fetches one page). `listDelegatesIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/bots/{id}/delegates`
**CLI:** `hoody agent bots delegates list`

---

#### `listDelegatesIterator` — List a Bot's delegates. (async iterator)

```typescript
client.agent.bots.listDelegatesIterator(id: string, options?: { state?: "open" | "closed"; page?: number; limit?: number; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The bot id. |
| `state` | `"open" \| "closed"` | query | No | open or closed: list only the delegates in that state. Omitted: both. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncGenerator<(NonNullable<AgentBotsListDelegatesResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`listDelegates()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/bots/{id}/delegates`
**CLI:** `hoody agent bots delegates list`

---

#### `listIterator` — List the Bots. (async iterator)

```typescript
client.agent.bots.listIterator(options?: { realm?: "global" | "all" | (string & {}); page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm` | `"global" \| "all" \| (string & {})` | query | No | The realm to list: "global" (Bots not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves, global included. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `realm` | `"global" \| "all" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncGenerator<(NonNullable<AgentBotsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/bots`
**CLI:** `hoody agent bots list`

---

#### `purgeArchive` — Delete a Bot's archive.

```typescript
client.agent.bots.purgeArchive(id: string, options?: { realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The bot id. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentBotsPurgeArchiveResponse>`  |  **HTTP:** `POST /api/v1/agent/bots/{id}/purge`
**CLI:** `hoody agent bots archive purge`

---

#### `reset` — Give a Bot a new session.

```typescript
client.agent.bots.reset(id: string, options?: { realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The bot id. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentBotsResetResponse>`  |  **HTTP:** `POST /api/v1/agent/bots/{id}/reset`
**CLI:** `hoody agent bots reset`

---

#### `sendMessage` — Post a message to a Bot.

```typescript
client.agent.bots.sendMessage(id: string, data: AgentBotsSendMessageRequest, options?: { IdempotencyKey?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The bot id. |
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key and text returns the same message_id and the message's current state, and queues nothing again; the same key with a different text is 422. A key is remembered while its message is queued and for at least 24 hours after it was accepted. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentBotsSendMessageRequest` | body | Yes |  |

**Body:** `{ text*: string }`

- `text` — The message (at most 64 KiB).

**Returns:** `Promise<AgentBotsSendMessageResponse>`  |  **HTTP:** `POST /api/v1/agent/bots/{id}/messages`
**CLI:** `hoody agent bots messages send`

---

#### `setGuardrails` — Replace a Bot's guardrails.

```typescript
client.agent.bots.setGuardrails(id: string, data: AgentBotsSetGuardrailsRequest, options?: { realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The bot id. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentBotsSetGuardrailsRequest` | body | Yes |  |

**Body:** `{ guardrails*: string }`

**Returns:** `Promise<AgentBotsSetGuardrailsResponse>`  |  **HTTP:** `PUT /api/v1/agent/bots/{id}/guardrails`
**CLI:** `hoody agent bots guardrails set`

---

#### `stopDelegate` — Stop one of a Bot's delegates now.

```typescript
client.agent.bots.stopDelegate(id: string, sid: string, data?: AgentBotsStopDelegateRequest, options?: { IdempotencyKey?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The bot id. |
| `sid` | `string` | path | Yes | The delegate id. |
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Opaque retry key (1–255 printable ASCII, no whitespace). The same stop sent again with the same key returns its outcome; the same key with a different close is 422. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentBotsStopDelegateRequest` | body | No |  |

**Body:** `{ close: bool }`

**Returns:** `Promise<AgentBotsStopDelegateResponse>`  |  **HTTP:** `POST /api/v1/agent/bots/{id}/delegates/{sid}/stop`
**CLI:** `hoody agent bots delegates stop`

---

#### `stream` — Follow a Bot's log (SSE).

```typescript
client.agent.bots.stream(id: string, options?: { since?: number; LastEventID?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The bot id. |
| `since` | `number` | query | No | Return only rows whose seq is greater than this. Default 0. |
| `LastEventID` | `string` | header `Last-Event-ID` | No | SSE resume cursor: the id (a non-negative integer seq) of the last frame received. It overrides ?since, and an SSE client sends it on reconnect. Another value is 400 bad_request. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentBotsStreamFrames>>>`  |  **HTTP:** `GET /api/v1/agent/bots/{id}/stream`
**CLI:** `hoody agent bots stream`

---

#### `update` — Change a Bot's settings.

```typescript
client.agent.bots.update(id: string, data?: AgentBotsUpdateRequest, options?: { realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The bot id. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentBotsUpdateRequest` | body | No |  |

**Body:** `{ name: string, role: string, model: string, allowed_containers: string[], allowed_agents: string[], yolo: bool, guardrail_check: "strict" | "lenient" | "off" }`

- `model` — The model of the Bot's next session, started by POST /bots/{id}/reset; the running session keeps its model. Empty for the bot agent's own model. A model no session could start with is refused 422 model_unavailable and nothing changes.
- `guardrail_check` — How the Bot's dispatches and delegate messages are checked against its guardrails before they go out. strict: work that may break a guardrail is refused, and so is work whose check cannot be completed (the Bot tells you and can try again). lenient: work that may break a guardrail is refused; when the check cannot be completed, the work goes ahead unchecked. off: no check. …

**Returns:** `Promise<AgentBotsUpdateResponse>`  |  **HTTP:** `PATCH /api/v1/agent/bots/{id}`
**CLI:** `hoody agent bots update`

---

#### `ask` — Send `text` to the Bot under an Idempotency-Key and wait for its reply.

```typescript
client.agent.bots.ask(id: string, text: string, options?: BotAskOptions, templateVars?: TemplateVars)
```

**Returns:** `Promise<BotAskResult>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `follow` — The Bot's log rows, live: the rows after `since`, then each new row as it is written.

```typescript
client.agent.bots.follow(id: string, options?: BotFollowOptions, templateVars?: TemplateVars)
```

**Returns:** `AsyncIterableIterator<BotLogRow>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

### `client.agent.changes` (2) — Changes operations

#### `get` — Change tokens for the Work lists.

```typescript
client.agent.changes.get(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentChangesGetResponse>`  |  **HTTP:** `GET /api/v1/agent/changes`
**CLI:** `hoody agent changes get`

---

#### `stream` — Stream the change tokens (SSE).

```typescript
client.agent.changes.stream(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentChangesStreamFrames>>>`  |  **HTTP:** `GET /api/v1/agent/changes/stream`
**CLI:** `hoody agent changes stream`

---

### `client.agent.completions` (1) — Catalogued models and fusion composites

#### `create` — Run one tool-free model completion.

```typescript
client.agent.completions.create(data: AgentStreamCompletionRequest, options: { stream: true })  // → Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentStreamCompletionFrames>>>
client.agent.completions.create(data: AgentCreateCompletionRequest, options?: { stream?: false })  // → Promise<AgentCreateCompletionResponse>
client.agent.completions.create(data: AgentCreateCompletionRequest, options?: { stream?: boolean })  // → Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentStreamCompletionFrames>>> | Promise<AgentCreateCompletionResponse>
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `AgentStreamCompletionRequest` | body | Yes |  |
| `stream` | `boolean` | option | No | Stream the completion as server-sent events. |

**Body:** `{ model*: string, system: string, messages*: { role*: "user" | "assistant", content*: string }[], settings: { thinking: object, temperature: number, max_tokens: int, response_format: object }, timeout_ms: int, max_tokens: int }`

- `model` — … The same policy as a session's model: the provider prefix must be catalogued, the model name after it need not be (an uncatalogued name is sent to the provider, which may reject it as upstream_error). An unknown provider or an empty model name is 422 model_unavailable (reason unknown_model); a fusion/ composite is 422 model_unavailable (reason fusion).
- `messages` — 1 to 1000 turns, oldest first; the last must be a user turn.
- `settings` — Optional per-call model settings. A setting the model cannot honour is 400 unsupported_setting, never dropped.
- `max_tokens` — Alias of settings.max_tokens (output-token cap, 1 to 1000000), accepted at the top level as most chat-completion APIs take it. Sending both with different values is 400 bad_request (details.field max_tokens).

**Returns:** see each form above  |  **HTTP:** `POST /api/v1/agent/completions`
**CLI:** `hoody agent completions create`

---

### `client.agent.containers` (3) — API discovery and related-operation hints

#### `list` — List containers in a realm (for binding).

```typescript
client.agent.containers.list(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentContainersListResponse>`  |  **HTTP:** `GET /api/v1/agent/containers`
**CLI:** `hoody agent containers list`

---

#### `listAll` — List containers in a realm (for binding). (collect all pages)

```typescript
client.agent.containers.listAll(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<(NonNullable<AgentContainersListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/containers`
**CLI:** `hoody agent containers list`

---

#### `listIterator` — List containers in a realm (for binding). (async iterator)

```typescript
client.agent.containers.listIterator(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncGenerator<(NonNullable<AgentContainersListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/containers`
**CLI:** `hoody agent containers list`

---

### `client.agent.definitions` (14) — Chat-agent definitions and per-agent settings

#### `copy` — Copy a chat agent.

```typescript
client.agent.definitions.copy(name: string, data: AgentDefinitionsCopyRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentDefinitionsCopyRequest` | body | Yes |  |

**Body:** `{ new_name*: string }`

**Returns:** `Promise<AgentDefinitionsCopyResponse>`  |  **HTTP:** `POST /api/v1/agent/agents/{name}/copy`
**CLI:** `hoody agent definitions copy`

---

#### `create` — Create a chat-agent definition.

```typescript
client.agent.definitions.create(data: AgentDefinitionsCreateRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentDefinitionsCreateRequest` | body | Yes |  |

**Body:** `{ name*: string, frontmatter: { description: string, model: string, tools: string[], effort: "adaptive" | "low" | "medium" | "high" | "max", max_turns: int, max_steps_per_turn: int, labels: string[], strict_tools: bool, mcp_tools: string[], skills: string[], prompt_blocks: object, ask_timeout: string | int, thinking: "enabled" | "disabled", temperature: number, response_format: "json_object", compaction: "same_prefix", compaction_max_tokens: int }, system_prompt: string }`

- `frontmatter` — … Any other key is rejected. strict_tools is a boolean: true gives the agent EXACTLY its tools list — no skill or workflow tool is added, no MCP tool unless mcp_tools names it, and a call to any other tool is refused — and with no tools list it gets only ask_question_to_user, todo_read …

**Returns:** `Promise<AgentDefinitionsCreateResponse>`  |  **HTTP:** `POST /api/v1/agent/agents`
**CLI:** `hoody agent definitions create`

---

#### `delete` — Delete a custom chat agent.

```typescript
client.agent.definitions.delete(name: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentDefinitionsDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/agent/agents/{name}`
**CLI:** `hoody agent definitions delete`

---

#### `getSource` — Read a chat agent's source.

```typescript
client.agent.definitions.getSource(name: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentDefinitionsGetSourceResponse>`  |  **HTTP:** `GET /api/v1/agent/agents/{name}/source`
**CLI:** `hoody agent definitions source get`

---

#### `list` — List chat-agent definitions.

```typescript
client.agent.definitions.list(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentDefinitionsListResponse>`  |  **HTTP:** `GET /api/v1/agent/agents`
**CLI:** `hoody agent definitions list`

---

#### `listAll` — List chat-agent definitions. (collect all pages)

```typescript
client.agent.definitions.listAll(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<(NonNullable<AgentDefinitionsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/agents`
**CLI:** `hoody agent definitions list`

---

#### `listIterator` — List chat-agent definitions. (async iterator)

```typescript
client.agent.definitions.listIterator(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncGenerator<(NonNullable<AgentDefinitionsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/agents`
**CLI:** `hoody agent definitions list`

---

#### `rename` — Rename a chat agent.

```typescript
client.agent.definitions.rename(name: string, data: AgentDefinitionsRenameRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentDefinitionsRenameRequest` | body | Yes |  |

**Body:** `{ new_name*: string }`

**Returns:** `Promise<AgentDefinitionsRenameResponse>`  |  **HTTP:** `POST /api/v1/agent/agents/{name}/rename`
**CLI:** `hoody agent definitions rename`

---

#### `reset` — Reset an agent to its shipped default.

```typescript
client.agent.definitions.reset(name: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentDefinitionsResetResponse>`  |  **HTTP:** `POST /api/v1/agent/agents/{name}/reset-to-shipped`
**CLI:** `hoody agent definitions reset`

---

#### `setModel` — Set an agent's model.

```typescript
client.agent.definitions.setModel(name: string, data?: AgentDefinitionsSetModelRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentDefinitionsSetModelRequest` | body | No |  |

**Body:** `{ model: string }`

**Returns:** `Promise<AgentDefinitionsSetModelResponse>`  |  **HTTP:** `PATCH /api/v1/agent/agents/{name}/model`
**CLI:** `hoody agent definitions model set`

---

#### `setSource` — Write a chat agent's source.

```typescript
client.agent.definitions.setSource(name: string, data: AgentDefinitionsSetSourceRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentDefinitionsSetSourceRequest` | body | Yes |  |

**Body:** `{ content*: string, expected_revision: string }`

- `content` — … Frontmatter is read as one `key: value` per line: a `tools:` line must be a comma-separated list on that same line, because a YAML block list underneath it parses to NOTHING and the agent is then granted every tool — the opposite of the restriction it looks like. The turn cap is spelled `max_turns`; a `turns` line is ignored.
- `expected_revision` — … A save whose source changed since is refused 409 revision_conflict (details.current_revision) and writes nothing. … The revision is bound to the realm this request resolves to: on a gateway without a realm pin, a revision read while another realm was active is refused 409 revision_conflict (details.current_revision is this realm's), never written into the other realm.

**Returns:** `Promise<AgentDefinitionsSetSourceResponse>`  |  **HTTP:** `PUT /api/v1/agent/agents/{name}/source`
**CLI:** `hoody agent definitions source set`

---

#### `setTools` — Set an agent's tool allow-list.

```typescript
client.agent.definitions.setTools(name: string, data: AgentDefinitionsSetToolsRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentDefinitionsSetToolsRequest` | body | Yes |  |

**Body:** `{ tools*: string[] }`

**Returns:** `Promise<AgentDefinitionsSetToolsResponse>`  |  **HTTP:** `PATCH /api/v1/agent/agents/{name}/tools`
**CLI:** `hoody agent definitions tools set`

---

#### `setTurnLimit` — Set an agent's max-turns.

```typescript
client.agent.definitions.setTurnLimit(name: string, data?: AgentDefinitionsSetTurnLimitRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentDefinitionsSetTurnLimitRequest` | body | No |  |

**Body:** `{ turns: int }`

**Returns:** `Promise<AgentDefinitionsSetTurnLimitResponse>`  |  **HTTP:** `PATCH /api/v1/agent/agents/{name}/turns`
**CLI:** `hoody agent definitions turns limit set`

---

#### `toggleTool` — Toggle a single tool for an agent.

```typescript
client.agent.definitions.toggleTool(name: string, tool: string, data?: AgentDefinitionsToggleToolRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `tool` | `string` | path | Yes | The tool. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentDefinitionsToggleToolRequest` | body | No |  |

**Returns:** `Promise<AgentDefinitionsToggleToolResponse>`  |  **HTTP:** `POST /api/v1/agent/agents/{name}/tools/{tool}/toggle`
**CLI:** `hoody agent definitions tools toggle`

---

### `client.agent.files` (3) — Chat-agent definitions and per-agent settings

#### `list` — List the files that shape the agents.

```typescript
client.agent.files.list(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentFilesListResponse>`  |  **HTTP:** `GET /api/v1/agent/agent-files`
**CLI:** `hoody agent files list`

---

#### `listAll` — List the files that shape the agents. (collect all pages)

```typescript
client.agent.files.listAll(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<(NonNullable<AgentFilesListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/agent-files`
**CLI:** `hoody agent files list`

---

#### `listIterator` — List the files that shape the agents. (async iterator)

```typescript
client.agent.files.listIterator(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncGenerator<(NonNullable<AgentFilesListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/agent-files`
**CLI:** `hoody agent files list`

---

### `client.agent.fusions` (5) — Process-wide settings (home settings.json)

#### `delete` — Delete a fusion composite.

```typescript
client.agent.fusions.delete(slug: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `slug` | `string` | path | Yes | The slug. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentFusionsDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/agent/settings/fusion/{slug}`
**CLI:** `hoody agent fusions delete`

---

#### `list` — List fusion composites.

```typescript
client.agent.fusions.list(options?: { include_invalid?: boolean; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_invalid` | `boolean` | query | No | When true, also return composites that failed validation as a top-level `invalid` array beside `items` (each with a reason + raw-file index) so a broken composite is diagnosable. An entry with no usable slug, or a duplicate slug, cannot be deleted through this API — see the operation description. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentFusionsListResponse>`  |  **HTTP:** `GET /api/v1/agent/settings/fusion`
**CLI:** `hoody agent fusions list`

---

#### `listAll` — List fusion composites. (collect all pages)

```typescript
client.agent.fusions.listAll(options?: { include_invalid?: boolean; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_invalid` | `boolean` | query | No | When true, also return composites that failed validation as a top-level `invalid` array beside `items` (each with a reason + raw-file index) so a broken composite is diagnosable. An entry with no usable slug, or a duplicate slug, cannot be deleted through this API — see the operation description. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<(NonNullable<AgentFusionsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/settings/fusion`
**CLI:** `hoody agent fusions list`

---

#### `listIterator` — List fusion composites. (async iterator)

```typescript
client.agent.fusions.listIterator(options?: { include_invalid?: boolean; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_invalid` | `boolean` | query | No | When true, also return composites that failed validation as a top-level `invalid` array beside `items` (each with a reason + raw-file index) so a broken composite is diagnosable. An entry with no usable slug, or a duplicate slug, cannot be deleted through this API — see the operation description. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `AsyncGenerator<(NonNullable<AgentFusionsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/settings/fusion`
**CLI:** `hoody agent fusions list`

---

#### `set` — Create or update a fusion composite.

```typescript
client.agent.fusions.set(slug: string, data: AgentFusionsSetRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `slug` | `string` | path | Yes | The slug. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `data` | `AgentFusionsSetRequest` | body | Yes |  |

**Body:** `{ spec*: object }`

**Returns:** `Promise<AgentFusionsSetResponse>`  |  **HTTP:** `PUT /api/v1/agent/settings/fusion/{slug}`
**CLI:** `hoody agent fusions set`

---

### `client.agent.gates` (7) — Create, drive, and tear down agent sessions

#### `answer` — Answer a parked question gate.

```typescript
client.agent.gates.answer(id: string, data?: AgentGatesAnswerRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentGatesAnswerRequest` | body | No |  |

**Body:** `{ gate_id: string, generation: int, answer: string, text: string, answers: { [key: string]: string } }`

- `gate_id` — Echo of the parked gate id, as published on the frame that parked it (gate.id), by GET /sessions/{id} (pending_gate.id) and in 409 details. Valid only for the session in the path. Optional for compatibility, but an answer without it applies to whatever gate is parked when it arrives — a client binding an answer to a gate the user saw must send it. Ids are unique per session incarnation, so an id from before a re-attach never matches (stale/mismatch → 409).

**Returns:** `Promise<AgentGatesAnswerResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/answer`
**CLI:** `hoody agent gates answer`

---

#### `approve` — Answer a parked confirm gate (on an always-approval session also --gate-id, --generation and the approver lease).

```typescript
client.agent.gates.approve(id: string, data?: Omit<AgentConfirmGateRequest, "approved">, options?: { XHoodyApproverLease?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyApproverLease` | `string` | header `X-Hoody-Approver-Lease` | No | The approver-lease capability returned by POST /sessions/{id}/approver-lease. Required on every decision (/confirm, or the confirmed re-issue of a gated tool run) on an "always" session whose lease was minted; the daemon verifies it at decision consumption. On renew/release it names the lease to act on. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `Omit<AgentConfirmGateRequest, "approved">` | body | No |  |

**Body:** `{ gate_id: string, generation: int, reason: string, persist_dirs: bool, remember: bool, superseded: bool, session_scope: bool, trust_container: bool, request_id: string, lease_generation: int }`

- `gate_id` — Echo of the parked gate id, as published on the frame that parked it (gate.id), by GET /sessions/{id} (pending_gate.id) and in 409 details. Valid only for the session in the path. Optional for compatibility, but an answer without it applies to whatever gate is parked when it arrives — a client binding an answer to a gate the user saw must send it. Ids are unique per session incarnation, so an id from before a re-attach never matches (stale/mismatch → 409). Required on a session that requires approval on every action: a confirm without it is rejected 400.
- `generation` — Echo of the parked gate generation. It restarts when the session is re-attached, so it is not an identity on its own — send gate_id. Optional on a default-policy session; required, and non-zero, on a session that requires approval on every action.
- `reason` — Optional, with approved false only: why the action is refused. The agent reads it in the refused call's result, flattened to one line, together with the instruction not to reach the same effect another way. At most 500 characters; sent with approved true, or longer, it is rejected 400 bad_request.
- `superseded` — With approved false only, and no reason or session_scope: the call is declined because the user sent a new message instead of answering. … Sent with approved true, a reason or session_scope, it is rejected 400 bad_request.
- `session_scope` — Remember this decision for the rest of the session (the Allow/Deny for session answer): with approved true the tool stops asking, with approved false it is refused without asking. Offer allow-for-session only when the gate's event.confirm_request carried offer_session_allow. Under a locked approval policy the wider grant is refused, but the one-shot decision still applies and the reply says so (session_scope_applied false, note).
- `request_id` — Optional: the caller's own id for this decision, at most 64 characters from A-Z, a-z, 0-9, '.', '_' and '-' (anything else is 400 bad_request). When this decision is the one the gate consumed, a later 409 gate_already_resolved for the gate echoes it as details.request_id, so a caller that lost the 200 knows the recorded decision is its own.
- `lease_generation` — … A decision carrying the lease capability (X-Hoody-Approver-Lease) is checked against the current lease whatever it sends; without one, a stale generation is refused. …

**Fixed by the method:** the method sets `approved: true`; do not pass `approved`.

**Returns:** `Promise<AgentConfirmGateResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/confirm`
**CLI:** `hoody agent gates approve`

---

#### `deny` — Answer a parked confirm gate (on an always-approval session also --gate-id, --generation and the approver lease).

```typescript
client.agent.gates.deny(id: string, data?: Omit<AgentConfirmGateRequest, "approved">, options?: { XHoodyApproverLease?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyApproverLease` | `string` | header `X-Hoody-Approver-Lease` | No | The approver-lease capability returned by POST /sessions/{id}/approver-lease. Required on every decision (/confirm, or the confirmed re-issue of a gated tool run) on an "always" session whose lease was minted; the daemon verifies it at decision consumption. On renew/release it names the lease to act on. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `Omit<AgentConfirmGateRequest, "approved">` | body | No |  |

**Body:** `{ gate_id: string, generation: int, reason: string, persist_dirs: bool, remember: bool, superseded: bool, session_scope: bool, trust_container: bool, request_id: string, lease_generation: int }`

- `gate_id` — Echo of the parked gate id, as published on the frame that parked it (gate.id), by GET /sessions/{id} (pending_gate.id) and in 409 details. Valid only for the session in the path. Optional for compatibility, but an answer without it applies to whatever gate is parked when it arrives — a client binding an answer to a gate the user saw must send it. Ids are unique per session incarnation, so an id from before a re-attach never matches (stale/mismatch → 409). Required on a session that requires approval on every action: a confirm without it is rejected 400.
- `generation` — Echo of the parked gate generation. It restarts when the session is re-attached, so it is not an identity on its own — send gate_id. Optional on a default-policy session; required, and non-zero, on a session that requires approval on every action.
- `reason` — Optional, with approved false only: why the action is refused. The agent reads it in the refused call's result, flattened to one line, together with the instruction not to reach the same effect another way. At most 500 characters; sent with approved true, or longer, it is rejected 400 bad_request.
- `superseded` — With approved false only, and no reason or session_scope: the call is declined because the user sent a new message instead of answering. … Sent with approved true, a reason or session_scope, it is rejected 400 bad_request.
- `session_scope` — Remember this decision for the rest of the session (the Allow/Deny for session answer): with approved true the tool stops asking, with approved false it is refused without asking. Offer allow-for-session only when the gate's event.confirm_request carried offer_session_allow. Under a locked approval policy the wider grant is refused, but the one-shot decision still applies and the reply says so (session_scope_applied false, note).
- `request_id` — Optional: the caller's own id for this decision, at most 64 characters from A-Z, a-z, 0-9, '.', '_' and '-' (anything else is 400 bad_request). When this decision is the one the gate consumed, a later 409 gate_already_resolved for the gate echoes it as details.request_id, so a caller that lost the 200 knows the recorded decision is its own.
- `lease_generation` — … A decision carrying the lease capability (X-Hoody-Approver-Lease) is checked against the current lease whatever it sends; without one, a stale generation is refused. …

**Fixed by the method:** the method sets `approved: false`; do not pass `approved`.

**Returns:** `Promise<AgentConfirmGateResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/confirm`
**CLI:** `hoody agent gates deny`

---

#### `list` — List the gates waiting for a human.

```typescript
client.agent.gates.list(options?: { include_system?: boolean; realm?: "global" | "all" | (string & {}); page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_system` | `boolean` | query | No | When true, also list the gates of daemon-owned system/resident sessions (as `curl.sessions.list` does). |
| `realm` | `"global" \| "all" \| (string & {})` | query | No | The realm to list: "global" (gates not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page, at most 100: 0 or omitted means 100, and a larger value is served as 100 (meta.limit echoes the value used). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| "all" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentGatesListResponse>`  |  **HTTP:** `GET /api/v1/agent/gates`
**CLI:** `hoody agent gates list`

---

#### `listAll` — List the gates waiting for a human. (collect all pages)

```typescript
client.agent.gates.listAll(options?: { include_system?: boolean; realm?: "global" | "all" | (string & {}); page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_system` | `boolean` | query | No | When true, also list the gates of daemon-owned system/resident sessions (as `curl.sessions.list` does). |
| `realm` | `"global" \| "all" \| (string & {})` | query | No | The realm to list: "global" (gates not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page, at most 100: 0 or omitted means 100, and a larger value is served as 100 (meta.limit echoes the value used). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| "all" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<(NonNullable<AgentGatesListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/gates`
**CLI:** `hoody agent gates list`

---

#### `listIterator` — List the gates waiting for a human. (async iterator)

```typescript
client.agent.gates.listIterator(options?: { include_system?: boolean; realm?: "global" | "all" | (string & {}); page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_system` | `boolean` | query | No | When true, also list the gates of daemon-owned system/resident sessions (as `curl.sessions.list` does). |
| `realm` | `"global" \| "all" \| (string & {})` | query | No | The realm to list: "global" (gates not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page, at most 100: 0 or omitted means 100, and a larger value is served as 100 (meta.limit echoes the value used). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| "all" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncGenerator<(NonNullable<AgentGatesListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/gates`
**CLI:** `hoody agent gates list`

---

#### `suggest` — Propose answers for a parked question (helper model).

```typescript
client.agent.gates.suggest(id: string, data?: AgentGatesSuggestRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentGatesSuggestRequest` | body | No |  |

**Body:** `{ mode: string, model: string, gen: int }`

**Returns:** `Promise<AgentGatesSuggestResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/answer:assist`
**CLI:** `hoody agent gates suggest`

---

### `client.agent.github` (30) — GitHub auth, repos, clone, status, commit, sync, PRs

#### `checkoutPr` — Check out a pull request.

```typescript
client.agent.github.checkoutPr(data: AgentGithubCheckoutPrRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentGithubCheckoutPrRequest` | body | Yes |  |

**Body:** `{ number*: string | int }`

- `number` — The PR number (required): a positive decimal string such as "42", or the JSON integer `agent.github.listPrs` returns. An empty value, 0, a fraction, a negative or anything non-numeric is refused, so a branch name or URL can never be smuggled in as a target.

**Returns:** `Promise<AgentGithubCheckoutPrResponse>`  |  **HTTP:** `POST /api/v1/agent/github/pr/checkout`
**CLI:** `hoody agent github prs checkout`

---

#### `clone` — Clone a GitHub repository.

```typescript
client.agent.github.clone(data?: AgentGithubCloneRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentGithubCloneRequest` | body | No |  |

**Body:** `{ repo: string, dir: string, clone_root: string, full_name: string, clone_url: string, shallow: bool, flat: bool, persist_credentials: bool }`

- `full_name` — Canonical "owner/name" (alternative to `repo`; used as-is when supplied, taking precedence over a derived value). Requires clone_url.
- `clone_url` — Canonical https clone URL (alternative to `repo`; re-validated against the active account host; takes precedence over a derived value). Requires full_name.
- `flat` — Optional, default false. true clones to <root>/<name> instead of <root>/<owner>/<name>. An existing checkout at that path is reused only when its origin is the same repository; anything else there is refused. Must be a JSON boolean.
- `persist_credentials` — … Must be a JSON boolean.

**Returns:** `Promise<AgentGithubCloneResponse>`  |  **HTTP:** `POST /api/v1/agent/github/clone`
**CLI:** `hoody agent github repos clone`

---

#### `createBranch` — Create a branch.

```typescript
client.agent.github.createBranch(data: AgentGithubCreateBranchRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentGithubCreateBranchRequest` | body | Yes |  |

**Body:** `{ branch*: string }`

- `branch` — The new branch name (required). Validated as a safe ref name before it reaches git — a leading dash, a whitespace/control character, or a name git itself would reject is refused with a 400.

**Returns:** `Promise<AgentGithubCreateBranchResponse>`  |  **HTTP:** `POST /api/v1/agent/github/branch`
**CLI:** `hoody agent github branches create`

---

#### `createCommit` — Stage all and commit.

```typescript
client.agent.github.createCommit(data: AgentGithubCommitPushRequest, options: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}); push: true })  // → Promise<AgentGithubCommitPushResponse>
client.agent.github.createCommit(data: AgentGithubCommitRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}); push?: false })  // → Promise<AgentGithubCommitResponse>
client.agent.github.createCommit(data: AgentGithubCommitRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}); push?: boolean })  // → Promise<AgentGithubCommitPushResponse> | Promise<AgentGithubCommitResponse>
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentGithubCommitPushRequest` | body | Yes |  |
| `push` | `boolean` | option | No | Stage, commit and push in one call. |

**Body:** `{ message*: string }`

**Returns:** see each form above  |  **HTTP:** `POST /api/v1/agent/github/commit`
**CLI:** `hoody agent github commits create`

---

#### `createIssue` — Open an issue.

```typescript
client.agent.github.createIssue(data: AgentGithubCreateIssueRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentGithubCreateIssueRequest` | body | Yes |  |

**Body:** `{ title*: string, body: string }`

- `title` — The issue title (required, non-empty — the daemon refuses an empty title).

**Returns:** `Promise<AgentGithubCreateIssueResponse>`  |  **HTTP:** `POST /api/v1/agent/github/issues`
**CLI:** `hoody agent github issues create`

---

#### `createPr` — Open a pull request.

```typescript
client.agent.github.createPr(data: AgentGithubCreatePrRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentGithubCreatePrRequest` | body | Yes |  |

**Body:** `{ title*: string, body: string, base: string }`

- `title` — The PR title (required, non-empty).

**Returns:** `Promise<AgentGithubCreatePrResponse>`  |  **HTTP:** `POST /api/v1/agent/github/pr`
**CLI:** `hoody agent github prs create`

---

#### `createWorktree` — Add a linked worktree.

```typescript
client.agent.github.createWorktree(data: AgentGithubCreateWorktreeRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentGithubCreateWorktreeRequest` | body | Yes |  |

**Body:** `{ path*: string, branch: string, start_ref: string }`

- `path` — Where to create the worktree (required). Lexically validated and checked against the session's deny list before git runs; a traversing or deny-listed path is refused with a 400. Must not already exist as a non-empty directory.

**Returns:** `Promise<AgentGithubCreateWorktreeResponse>`  |  **HTTP:** `POST /api/v1/agent/github/worktrees`
**CLI:** `hoody agent github worktrees create`

---

#### `deleteBranch` — Force-delete a local branch.

```typescript
client.agent.github.deleteBranch(data: AgentGithubDeleteBranchRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentGithubDeleteBranchRequest` | body | Yes |  |

**Body:** `{ branch*: string }`

- `branch` — The local branch name (required), as `agent.github.listBranches` reports it. Passed after `--`, so it is never read as an option.

**Returns:** `Promise<AgentGithubDeleteBranchResponse>`  |  **HTTP:** `POST /api/v1/agent/github/branch/delete`
**CLI:** `hoody agent github branches delete`

---

#### `deleteWorktree` — Remove a linked worktree.

```typescript
client.agent.github.deleteWorktree(data: AgentGithubDeleteWorktreeRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentGithubDeleteWorktreeRequest` | body | Yes |  |

**Body:** `{ path*: string, force: bool }`

- `path` — The worktree's path (required), as `agent.github.listWorktrees` reports it. Must not be the main checkout.
- `force` — Optional, default false. Removes the worktree EVEN WITH uncommitted or untracked changes (git worktree remove --force), DISCARDING them — they are not stashed and cannot be recovered. Must be a JSON boolean.

**Returns:** `Promise<AgentGithubDeleteWorktreeResponse>`  |  **HTTP:** `POST /api/v1/agent/github/worktrees/remove`
**CLI:** `hoody agent github worktrees delete`

---

#### `diff` — Read the working-tree diff.

```typescript
client.agent.github.diff(options?: { staged?: boolean; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `staged` | `boolean` | query | No | When true, return the STAGED (index) diff — what a commit would record — instead of the unstaged working-tree diff. Defaults to false. Accepts true/1/yes/on; every other value, including an empty one, is false. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentGithubDiffResponse>`  |  **HTTP:** `GET /api/v1/agent/github/diff`
**CLI:** `hoody agent github diff`

---

#### `getAuth` — GitHub auth status.

```typescript
client.agent.github.getAuth(options?: { realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentGithubGetAuthResponse>`  |  **HTTP:** `GET /api/v1/agent/github/auth/status`
**CLI:** `hoody agent github auth status`

---

#### `getStatus` — GitHub working-tree status.

```typescript
client.agent.github.getStatus(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentGithubGetStatusResponse>`  |  **HTTP:** `GET /api/v1/agent/github/status`
**CLI:** `hoody agent github status`

---

#### `listBranches` — List GitHub branches.

```typescript
client.agent.github.listBranches(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentGithubListBranchesResponse>`  |  **HTTP:** `GET /api/v1/agent/github/branches`
**CLI:** `hoody agent github branches list`

---

#### `listCommits` — Read recent commit history.

```typescript
client.agent.github.listCommits(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentGithubListCommitsResponse>`  |  **HTTP:** `GET /api/v1/agent/github/log`
**CLI:** `hoody agent github commits list`

---

#### `listIssues` — List issues.

```typescript
client.agent.github.listIssues(options: { owner: string; repo: string; state?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `owner` | `string` | query | Yes | Repository owner (user or org login). Required — not derived from the bound checkout; `agent.github.resolveRepo` returns it. |
| `repo` | `string` | query | Yes | Repository name without the owner. Required, same source as `owner`. |
| `state` | `string` | query | No | Which issues to return: open (the default when omitted), closed, or all. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentGithubListIssuesResponse>`  |  **HTTP:** `GET /api/v1/agent/github/issues`
**CLI:** `hoody agent github issues list`

---

#### `listPrs` — List pull requests.

```typescript
client.agent.github.listPrs(options: { owner: string; repo: string; state?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `owner` | `string` | query | Yes | Repository owner (user or org login), e.g. "octocat". Required — it is NOT derived from the bound checkout; `agent.github.resolveRepo` returns it. |
| `repo` | `string` | query | Yes | Repository name without the owner, e.g. "Hello-World". Required, same source as `owner`. |
| `state` | `string` | query | No | Which pull requests to return: open (the default when omitted), closed, or all. An unrecognized value is passed through to GitHub, which rejects it. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentGithubListPrsResponse>`  |  **HTTP:** `GET /api/v1/agent/github/pr`
**CLI:** `hoody agent github prs list`

---

#### `listRepos` — List GitHub repos.

```typescript
client.agent.github.listRepos(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentGithubListReposResponse>`  |  **HTTP:** `GET /api/v1/agent/github/repos`
**CLI:** `hoody agent github repos list`

---

#### `listWorktrees` — List linked worktrees.

```typescript
client.agent.github.listWorktrees(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentGithubListWorktreesResponse>`  |  **HTTP:** `GET /api/v1/agent/github/worktrees`
**CLI:** `hoody agent github worktrees list`

---

#### `login` — Start a GitHub device-flow login (or add a PAT).

```typescript
client.agent.github.login(data?: AgentGithubLoginRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentGithubLoginRequest` | body | No |  |

**Body:** `{ token: string, host: string, activate: bool }`

- `host` — GitHub host for GitHub Enterprise (GHES); defaults to github.com. Must match the host on the subsequent poll call.
- `activate` — Whether the linked account becomes the ACTIVE one. … A non-boolean value is rejected.

**Returns:** `Promise<AgentGithubLoginResponse>`  |  **HTTP:** `POST /api/v1/agent/github/auth/login`
**CLI:** `hoody agent github auth login`

---

#### `logout` — Remove a linked GitHub account.

```typescript
client.agent.github.logout(data: AgentGithubLogoutRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentGithubLogoutRequest` | body | Yes |  |

**Body:** `{ key*: string }`

**Returns:** `Promise<AgentGithubLogoutResponse>`  |  **HTTP:** `POST /api/v1/agent/github/auth/logout`
**CLI:** `hoody agent github auth logout`

---

#### `mergePr` — Merge a pull request.

```typescript
client.agent.github.mergePr(data: AgentGithubMergePrRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentGithubMergePrRequest` | body | Yes |  |

**Body:** `{ number*: string | int, method: "merge" | "squash" | "rebase" }`

- `number` — The PR number (required): a positive decimal string such as "42", or the JSON integer `agent.github.listPrs` returns. Anything else — 0, a fraction, a branch name or URL — is refused, so the merge can never target a different PR.

**Returns:** `Promise<AgentGithubMergePrResponse>`  |  **HTTP:** `POST /api/v1/agent/github/pr/merge`
**CLI:** `hoody agent github prs merge`

---

#### `pollLogin` — Poll a GitHub device-flow login to completion.

```typescript
client.agent.github.pollLogin(data: AgentGithubPollLoginRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentGithubPollLoginRequest` | body | Yes |  |

**Body:** `{ host: string, device_code*: string, interval: int, expires_in: int, activate: bool }`

- `host` — The GitHub host (default github.com); must match the start call.

**Returns:** `Promise<AgentGithubPollLoginResponse>`  |  **HTTP:** `POST /api/v1/agent/github/auth/login/poll`
**CLI:** `hoody agent github auth poll`

---

#### `popStash` — Restore the most recent stash entry.

```typescript
client.agent.github.popStash(data?: AgentGithubPopStashRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentGithubPopStashRequest` | body | No |  |

**Returns:** `Promise<AgentGithubPopStashResponse>`  |  **HTTP:** `POST /api/v1/agent/github/stash/pop`
**CLI:** `hoody agent github stash pop`

---

#### `pushStash` — Stash the working tree.

```typescript
client.agent.github.pushStash(data?: AgentGithubPushStashRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentGithubPushStashRequest` | body | No |  |

**Returns:** `Promise<AgentGithubPushStashResponse>`  |  **HTTP:** `POST /api/v1/agent/github/stash`
**CLI:** `hoody agent github stash push`

---

#### `resolveRepo` — Resolve the bound repository's owner/name.

```typescript
client.agent.github.resolveRepo(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentGithubResolveRepoResponse>`  |  **HTTP:** `GET /api/v1/agent/github/identity`
**CLI:** `hoody agent github repos resolve`

---

#### `setRepoCredentials` — Re-write a checkout's GitHub credential.

```typescript
client.agent.github.setRepoCredentials(data?: AgentGithubSetRepoCredentialsRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentGithubSetRepoCredentialsRequest` | body | No |  |

**Returns:** `Promise<AgentGithubSetRepoCredentialsResponse>`  |  **HTTP:** `POST /api/v1/agent/github/repo/reconnect`
**CLI:** `hoody agent github repos credentials set`

---

#### `suggestCommitMessage` — Draft a commit message with a model.

```typescript
client.agent.github.suggestCommitMessage(data: AgentGithubSuggestCommitMessageRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentGithubSuggestCommitMessageRequest` | body | Yes |  |

**Body:** `{ model*: string }`

- `model` — A concrete model spec, e.g. "anthropic/claude-sonnet-4-6" (required). A fusion/ composite cannot back a one-shot call and is refused.

**Returns:** `Promise<AgentGithubSuggestCommitMessageResponse>`  |  **HTTP:** `POST /api/v1/agent/github/commit/suggest-message`
**CLI:** `hoody agent github commits message suggest`

---

#### `sync` — Sync (fetch → pull → push).

```typescript
client.agent.github.sync(data?: AgentGithubSyncRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentGithubSyncRequest` | body | No |  |

**Body:** `{ direction: string, set_upstream: bool, force: bool }`

- `set_upstream` — Optional, default false: PUBLISH the current branch — push it and make it track the same-named branch on its remote. … Refused (502 sync_step_failed, step code upstream_exists) when the branch already tracks a DIFFERENT remote branch; a no-op when it already tracks exactly that one. …
- `force` — Optional, default false. … The lease only refuses when the remote moved since this repository last fetched it — and the full sync fetches first, so on a full sync it protects almost nothing. … Ignored by the fetch and pull legs. Must be a JSON boolean.

**Returns:** `Promise<AgentGithubSyncResponse>`  |  **HTTP:** `POST /api/v1/agent/github/sync`
**CLI:** `hoody agent github sync`

---

#### `useAccount` — Switch the active GitHub account.

```typescript
client.agent.github.useAccount(data: AgentGithubUseAccountRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentGithubUseAccountRequest` | body | Yes |  |

**Body:** `{ key*: string }`

**Returns:** `Promise<AgentGithubUseAccountResponse>`  |  **HTTP:** `POST /api/v1/agent/github/auth/active`
**CLI:** `hoody agent github accounts use`

---

#### `useBranch` — Switch to an existing branch.

```typescript
client.agent.github.useBranch(data: AgentGithubUseBranchRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentGithubUseBranchRequest` | body | Yes |  |

**Body:** `{ branch*: string }`

- `branch` — An existing branch name (required), as `agent.github.listBranches` reports it. Validated as a safe ref name; the switch fails rather than creating a branch that does not exist.

**Returns:** `Promise<AgentGithubUseBranchResponse>`  |  **HTTP:** `POST /api/v1/agent/github/branch/switch`
**CLI:** `hoody agent github branches use`

---

### `client.agent.headless` (2) — One-shot headless agent runs

#### `start` — Create a headless one-shot run.

```typescript
client.agent.headless.start(data?: Omit<AgentCreateHeadlessRunRequest, "stream" | "format"> & { format?: "text" | "json" }, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `Omit<AgentCreateHeadlessRunRequest, "stream" \| "format"> & { format?: "text" \| "json" }` | body | No |  |

**Body:** `{ prompt: string, workflow: string, inputs: { [key: string]: string }, model: string, format: "text" | "json", timeout_ms: int }`

- `prompt` — The prompt to drive the ephemeral session. Required unless workflow is set; with a workflow it is the optional $(workflow.prompt) text.
- `inputs` — Optional run-time values for the workflow's DECLARED input parameters (declared name → string value; resolves to $(input.<name>) in every step). Only accepted with workflow. A workflow with a REQUIRED declared parameter cannot run without these. Values must be strings; a non-string value is a 400.
- `timeout_ms` — Optional run timeout in milliseconds (clamped to the hard ceiling).

**Fixed by the method:** the method sets `stream: false`; do not pass `stream`.

**Returns:** `FacadeJson<Promise<ApiResponse<unknown>>>`  |  **HTTP:** `POST /api/v1/agent/headless/runs`
**CLI:** `hoody agent headless start`

---

#### `stream` — Create a headless one-shot run.

```typescript
client.agent.headless.stream(data?: Omit<AgentCreateHeadlessRunRequest, "stream">, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `Omit<AgentCreateHeadlessRunRequest, "stream">` | body | No |  |

**Body:** `{ prompt: string, workflow: string, inputs: { [key: string]: string }, model: string, format: string, timeout_ms: int }`

- `prompt` — The prompt to drive the ephemeral session. Required unless workflow is set; with a workflow it is the optional $(workflow.prompt) text.
- `inputs` — Optional run-time values for the workflow's DECLARED input parameters (declared name → string value; resolves to $(input.<name>) in every step). Only accepted with workflow. A workflow with a REQUIRED declared parameter cannot run without these. Values must be strings; a non-string value is a 400.
- `timeout_ms` — Optional run timeout in milliseconds (clamped to the hard ceiling).

**Fixed by the method:** the method sets `stream: true`; do not pass `stream`.

**Returns:** `Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentCreateHeadlessRunFrames>>>`  |  **HTTP:** `POST /api/v1/agent/headless/runs`
**CLI:** `hoody agent headless stream`

---

### `client.agent.hooks` (14) — Lifecycle hook configuration

#### `createWriteIntent` — Begin a hook write (nonce).

```typescript
client.agent.hooks.createWriteIntent(data: AgentHooksCreateWriteIntentRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentHooksCreateWriteIntentRequest` | body | Yes |  |

**Body:** `{ session_id*: string, op*: "upsert" | "delete" | "toggle" | "set_disabled" | "rules_set", scope*: string }`

- `op` — The write the nonce authorizes: upsert (`agent.hooks.upsert`), delete (`agent.hooks.delete`), toggle (`agent.hooks.enable`), set_disabled (`agent.hooks.enableAll`) or rules_set (`agent.hooks.setRules`). The nonce is rejected by any other op.

**Returns:** `Promise<AgentHooksCreateWriteIntentResponse>`  |  **HTTP:** `POST /api/v1/agent/hooks/begin-write`
**CLI:** `hoody agent hooks intents create`

---

#### `delete` — Delete a hook.

```typescript
client.agent.hooks.delete(data: AgentHooksDeleteRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentHooksDeleteRequest` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: string, event*: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", matcher: string, command: string }`

- `scope` — Scope of the settings file to write (must match the nonce's scope).
- `event` — Lifecycle event of the hook to remove; required — the daemon rejects any value outside the enum.

**Returns:** `Promise<AgentHooksDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/agent/hooks`
**CLI:** `hoody agent hooks delete`

---

#### `disable` — Toggle a hook.

```typescript
client.agent.hooks.disable(data: Omit<AgentToggleHookRequest, "enabled" | "event" | "matcher" | "command" | "disabled"> & Required<Pick<AgentToggleHookRequest, "shipped_id">>, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
client.agent.hooks.disable(data: Omit<AgentToggleHookRequest, "disabled" | "shipped_id" | "enabled"> & Required<Pick<AgentToggleHookRequest, "event" | "command">>, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `Omit<AgentToggleHookRequest, "enabled" \| "event" \| "matcher" \| "command" \| "disabled"> & Required<Pick<AgentToggleHookRequest, "shipped_id">>` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: string, shipped_id: string, event: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", matcher: string, command: string }`

- `scope` — Scope of the settings file to write (must match the nonce's scope).
- `event` — Lifecycle event of the ordinary hook to toggle; required on that branch (with matcher + command).
- `command` — Command text of the ordinary hook to toggle (exact match); required on that branch — a toggle must resolve to an existing entry.

**Fixed by the method**, by the form of the call:

- With `shipped_id` in the body: the method sets `enabled: false`; do not pass `enabled`, `event`, `matcher`, `command`, `disabled`.
- Otherwise: the method sets `disabled: true`; `event`, `command` are required; do not pass `disabled`, `shipped_id`, `enabled`.

**Returns:** `Promise<AgentToggleHookResponse>`  |  **HTTP:** `POST /api/v1/agent/hooks/toggle`
**CLI:** `hoody agent hooks disable`

---

#### `disableAll` — Disable all hooks.

```typescript
client.agent.hooks.disableAll(data: Omit<AgentDisableAllHooksRequest, "value">, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `Omit<AgentDisableAllHooksRequest, "value">` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: string }`

- `scope` — Scope of the settings file to write (must match the nonce's scope).

**Fixed by the method:** the method sets `value: true`; do not pass `value`.

**Returns:** `Promise<AgentDisableAllHooksResponse>`  |  **HTTP:** `POST /api/v1/agent/hooks/disable-all`
**CLI:** `hoody agent hooks disable`

---

#### `enable` — Toggle a hook.

```typescript
client.agent.hooks.enable(data: Omit<AgentToggleHookRequest, "enabled" | "event" | "matcher" | "command" | "disabled"> & Required<Pick<AgentToggleHookRequest, "shipped_id">>, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
client.agent.hooks.enable(data: Omit<AgentToggleHookRequest, "disabled" | "shipped_id" | "enabled"> & Required<Pick<AgentToggleHookRequest, "event" | "command">>, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `Omit<AgentToggleHookRequest, "enabled" \| "event" \| "matcher" \| "command" \| "disabled"> & Required<Pick<AgentToggleHookRequest, "shipped_id">>` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: string, shipped_id: string, event: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", matcher: string, command: string }`

- `scope` — Scope of the settings file to write (must match the nonce's scope).
- `event` — Lifecycle event of the ordinary hook to toggle; required on that branch (with matcher + command).
- `command` — Command text of the ordinary hook to toggle (exact match); required on that branch — a toggle must resolve to an existing entry.

**Fixed by the method**, by the form of the call:

- With `shipped_id` in the body: the method sets `enabled: true`; do not pass `enabled`, `event`, `matcher`, `command`, `disabled`.
- Otherwise: the method sets `disabled: false`; `event`, `command` are required; do not pass `disabled`, `shipped_id`, `enabled`.

**Returns:** `Promise<AgentToggleHookResponse>`  |  **HTTP:** `POST /api/v1/agent/hooks/toggle`
**CLI:** `hoody agent hooks enable`

---

#### `enableAll` — Disable all hooks.

```typescript
client.agent.hooks.enableAll(data: Omit<AgentDisableAllHooksRequest, "value">, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `Omit<AgentDisableAllHooksRequest, "value">` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: string }`

- `scope` — Scope of the settings file to write (must match the nonce's scope).

**Fixed by the method:** the method sets `value: false`; do not pass `value`.

**Returns:** `Promise<AgentDisableAllHooksResponse>`  |  **HTTP:** `POST /api/v1/agent/hooks/disable-all`
**CLI:** `hoody agent hooks enable`

---

#### `getRules` — Get the tool-call rules.

```typescript
client.agent.hooks.getRules(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentHooksGetRulesResponse>`  |  **HTTP:** `GET /api/v1/agent/hooks/rules`
**CLI:** `hoody agent hooks rules get`

---

#### `list` — List hooks.

```typescript
client.agent.hooks.list(options?: { session_id?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `session_id` | `string` | query | No | Live session id (hooks are session-scoped; required by the daemon RPC). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentHooksListResponse>`  |  **HTTP:** `GET /api/v1/agent/hooks`
**CLI:** `hoody agent hooks list`

---

#### `reload` — Reload hooks from disk.

```typescript
client.agent.hooks.reload(data?: AgentHooksReloadRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentHooksReloadRequest` | body | No |  |

**Body:** `{ session_id: string }`

- `session_id` — Optional: without it every live session in a realm the login serves reloads its own hooks, sessions counts those, and the reply has no summary; with it only that session reloads (it must be visible to the caller), sessions is 1, and the reply adds its summary.

**Returns:** `Promise<AgentHooksReloadResponse>`  |  **HTTP:** `POST /api/v1/agent/hooks/reload`
**CLI:** `hoody agent hooks reload`

---

#### `run` — Test-fire a hook.

```typescript
client.agent.hooks.run(data: Omit<AgentTestHookRequest, "shipped_id"> & Required<Pick<AgentTestHookRequest, "event">>, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `Omit<AgentTestHookRequest, "shipped_id"> & Required<Pick<AgentTestHookRequest, "event">>` | body | Yes |  |

**Body:** `{ session_id*: string, event*: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", match_value: string, command: string, timeout: int, exit_code: int, payload: object }`

- `event` — Lifecycle event to fire. Required on every branch except the shipped dry-run; the daemon rejects any value outside the enum.
- `timeout` — Timeout in whole seconds for an inline `command` (positive integers only; a fractional or non-positive value is ignored rather than truncated). Hard-capped at 60s: a larger value, an ignored one, and a saved hook's own longer timeout are all clamped to the 60s test ceiling, so a dry-run can never run longer than that.

**Fixed by the method:** do not pass `shipped_id`.

**Returns:** `Promise<AgentTestHookResponse>`  |  **HTTP:** `POST /api/v1/agent/hooks/test`
**CLI:** `hoody agent hooks run`

---

#### `setRules` — Set the tool-call rules.

```typescript
client.agent.hooks.setRules(data: AgentHooksSetRulesRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentHooksSetRulesRequest` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: string, rules: { id*: string, text*: string, kind*: "limit" | "check_in" | "guidance" | "playbook", tools: string[], agents: string[] }[], timeout_ms: int, exec_trust: { container_id*: string, realm*: string, name: string, granted_at: string, source: "card" | "rules_panel" }[], expected_revision: string }`

- `scope` — Scope of the settings file to write (must match the nonce's scope).
- `rules` — The complete rule list for the scope (at most 32 checked and 32 guidance/playbook rules; ids unique). An empty array removes the scope's rules.
- `exec_trust` — Optional: the COMPLETE list of per-container exec trust grants, replacing the scope's (at most 64 rows, each (container_id, realm) once, validated all-or-nothing); [] revokes every grant. Accepted only for the user scope (the realm's profile, or the X-Hoody-Config-Dir override); any other scope is 400. …
- `expected_revision` — … When it no longer matches the scope file (another tab, a hand edit, a timeout change), the write is refused with 409 revision_conflict, nothing is written, and details.current_revision carries the current value: re-read, re-apply the change, begin a new write (the refused call used up its nonce) and retry. … The revision is bound to the realm of the session it is read and written through, so a revision read through another realm's session is refused 409 revision_conflict, on a gateway with or without a realm pin.

**Returns:** `Promise<AgentHooksSetRulesResponse>`  |  **HTTP:** `POST /api/v1/agent/hooks/rules`
**CLI:** `hoody agent hooks rules set`

---

#### `test` — Test-fire a hook.

```typescript
client.agent.hooks.test(data: AgentTestHookRequest & Required<Pick<AgentTestHookRequest, "shipped_id">>, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentTestHookRequest & Required<Pick<AgentTestHookRequest, "shipped_id">>` | body | Yes |  |

**Body:** `{ session_id*: string, shipped_id*: string, event: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", match_value: string, command: string, timeout: int, exit_code: int, payload: object }`

- `event` — Lifecycle event to fire. Required on every branch except the shipped dry-run; the daemon rejects any value outside the enum.
- `timeout` — Timeout in whole seconds for an inline `command` (positive integers only; a fractional or non-positive value is ignored rather than truncated). Hard-capped at 60s: a larger value, an ignored one, and a saved hook's own longer timeout are all clamped to the 60s test ceiling, so a dry-run can never run longer than that.

**Returns:** `Promise<AgentTestHookResponse>`  |  **HTTP:** `POST /api/v1/agent/hooks/test`
**CLI:** `hoody agent hooks test`

---

#### `trust` — Acknowledge hook trust.

```typescript
client.agent.hooks.trust(data: AgentHooksTrustRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentHooksTrustRequest` | body | Yes |  |

**Body:** `{ session_id*: string, hash*: string, high_risk: bool }`

- `hash` — The trust hash being acknowledged, from `agent.hooks.list`' `trust.hash`. Required and non-empty; a hash that no longer matches the live hook config is rejected (anti-TOCTOU).
- `high_risk` — Acknowledge the elevated-risk grant rather than the ordinary one. The grant KIND is still derived server-side from the reviewed snapshot — this flag cannot widen it.

**Returns:** `Promise<AgentHooksTrustResponse>`  |  **HTTP:** `POST /api/v1/agent/hooks/trust/ack`
**CLI:** `hoody agent hooks trust`

---

#### `upsert` — Upsert a hook.

```typescript
client.agent.hooks.upsert(data: AgentHooksUpsertRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentHooksUpsertRequest` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: string, event*: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", matcher: string, command*: string, timeout: int, name: string, description: string }`

- `scope` — Scope of the settings file to write (must match the nonce's scope).
- `event` — Lifecycle event the hook fires on; part of the hook's identity triple. Required — the daemon rejects any value outside the enum.
- `command` — Command to run when the hook fires; part of the identity triple. Required and non-empty — a different command text addresses a DIFFERENT hook.
- `timeout` — Per-fire timeout in whole seconds (optional; non-negative whole numbers only — a fractional or negative value is refused, and anything above 86400 (24h) is clamped to it). … Two ceilings override this value at fire time: SessionEnd is always capped at 60s so a hook cannot wedge daemon shutdown, and every fire through `agent.hooks.run` is capped at 60s.
- `name` — … CONDITIONALLY required: a NEW hook (an identity triple event+matcher+command not yet in the settings) is refused 400 without it; on an UPDATE of an existing hook omit it to preserve the stored value. Not in the schema's required list only because of the update case.
- `description` — Short description of what the hook does. CONDITIONALLY required exactly like name: a NEW hook is refused 400 without it; omit on update to preserve.

**Returns:** `Promise<AgentHooksUpsertResponse>`  |  **HTTP:** `PUT /api/v1/agent/hooks`
**CLI:** `hoody agent hooks upsert`

---

### `client.agent.jev` (6) — Catalogued models and fusion composites

#### `decide` — Ask Jev to decide.

```typescript
client.agent.jev.decide(data: AgentJevDecideRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `data` | `AgentJevDecideRequest` | body | Yes |  |

**Body:** `{ state*: string | object | (string | number | bool | object | null)[], questions*: { [key: string]: object }, model: string, timeout_ms: int, provider: object, session_id: string, trace: object, user: string, x_session_id: string }`

- `session_id` — AI provider only: session grouping id (up to 256 characters).
- `user` — AI provider only: end-user id (up to 256 characters).

**Returns:** `Promise<AgentJevDecideResponse>`  |  **HTTP:** `POST /api/v1/agent/jev/decide`

---

#### `decideForSession` — Ask Jev to decide on behalf of a session.

```typescript
client.agent.jev.decideForSession(id: string, data: AgentJevDecideForSessionRequest, options?: { realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentJevDecideForSessionRequest` | body | Yes |  |

**Body:** `{ state*: string | object | (string | number | bool | object | null)[], questions*: { [key: string]: object }, model: string, timeout_ms: int, provider: object, session_id: string, trace: object, user: string, x_session_id: string }`

- `session_id` — AI provider only: session grouping id (up to 256 characters).
- `user` — AI provider only: end-user id (up to 256 characters).

**Returns:** `Promise<AgentJevDecideForSessionResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/jev/decide`

---

#### `getSettings` — Read the Jev settings.

```typescript
client.agent.jev.getSettings(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |

**Returns:** `Promise<AgentJevGetSettingsResponse>`  |  **HTTP:** `GET /api/v1/agent/jev/settings`
**CLI:** `hoody agent jev settings get`

---

#### `listModels` — List the models Jev can use.

```typescript
client.agent.jev.listModels(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |

**Returns:** `Promise<AgentJevListModelsResponse>`  |  **HTTP:** `GET /api/v1/agent/jev/models`
**CLI:** `hoody agent jev models list`

---

#### `test` — Test Jev with one tiny decision.

```typescript
client.agent.jev.test(data?: AgentJevTestRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `data` | `AgentJevTestRequest` | body | No |  |

**Body:** `{ model: string }`

**Returns:** `Promise<AgentJevTestResponse>`  |  **HTTP:** `POST /api/v1/agent/jev/test`
**CLI:** `hoody agent jev test`

---

#### `updateSettings` — Change the Jev settings.

```typescript
client.agent.jev.updateSettings(data?: AgentJevUpdateSettingsRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `data` | `AgentJevUpdateSettingsRequest` | body | No |  |

**Body:** `{ enabled: bool, model: string, timeout_ms: int }`

**Returns:** `Promise<AgentJevUpdateSettingsResponse>`  |  **HTTP:** `PUT /api/v1/agent/jev/settings`
**CLI:** `hoody agent jev settings update`

---

### `client.agent.jobs` (3) — Async job lifecycle (observe / result / cancel)

#### `delete` — Cancel a pending/running job, or delete a finished record.

```typescript
client.agent.jobs.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The job id. |

**Returns:** `Promise<AgentJobsDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/agent/jobs/{id}`
**CLI:** `hoody agent jobs delete`

---

#### `get` — Get an async job's status.

```typescript
client.agent.jobs.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The job id. |

**Returns:** `Promise<AgentJobsGetResponse>`  |  **HTTP:** `GET /api/v1/agent/jobs/{id}`
**CLI:** `hoody agent jobs get`

---

#### `getResult` — Get an async job's result.

```typescript
client.agent.jobs.getResult(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The job id. |

**Returns:** `Promise<AgentJobsGetResultResponse>`  |  **HTTP:** `GET /api/v1/agent/jobs/{id}/result`
**CLI:** `hoody agent jobs result get`

---

### `client.agent.kit` (3) — Health, metrics, and operational endpoints

#### `getHealth` — Standardized health check.

```typescript
client.agent.kit.getHealth()
```

**Returns:** `Promise<AgentKitGetHealthResponse>`  |  **HTTP:** `GET /api/v1/agent/health`
**CLI:** `hoody agent health`

---

#### `getMetrics` — Prometheus metrics.

```typescript
client.agent.kit.getMetrics()
```

**Returns:** `Promise<ApiResponse<string>>`  |  **HTTP:** `GET /api/v1/agent/metrics`
**CLI:** `hoody agent metrics`

---

#### `getVersion` — Agent API version and capabilities.

```typescript
client.agent.kit.getVersion(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |

**Returns:** `Promise<AgentKitGetVersionResponse>`  |  **HTTP:** `GET /api/v1/agent/version`
**CLI:** `hoody agent version`

---

### `client.agent.logs` (6) — Structured log query and read

#### `export` — Export logs as a downloadable file.

```typescript
client.agent.logs.export(options?: { source?: string; min_level?: string; comp?: string; session_id?: string; text?: string; since?: string; until?: string; event?: string; tool?: string; model?: string; status?: string; method?: string; min_status?: number; max_status?: number; errors_only?: boolean; event_type?: string; resource_type?: string; container?: string; kind?: string; host?: string; since_seq?: number; limit?: number; format?: string; filename?: string; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source` | `string` | query | No | Log source to export (see `agent.logs.listSources`; one local source, one platform source, or omitted for all local sources). |
| `min_level` | `string` | query | No | Minimum log level (debug\|info\|warn\|error). |
| `comp` | `string` | query | No | Component filter (daemon source). |
| `session_id` | `string` | query | No | Session id filter. |
| `text` | `string` | query | No | Case-insensitive substring filter over message+attrs. |
| `since` | `string` | query | No | Lower time bound (RFC3339 or relative like 1h/7d). |
| `until` | `string` | query | No | Upper time bound (RFC3339 or relative). |
| `event` | `string` | query | No | Session lifecycle event filter (session source). |
| `tool` | `string` | query | No | Tool name filter (tool source). |
| `model` | `string` | query | No | Model filter (llm source). |
| `status` | `string` | query | No | Tool outcome filter: ok\|error\|cancelled (tool source). |
| `method` | `string` | query | No | HTTP method filter (activity source). |
| `min_status` | `number` | query | No | Minimum HTTP status (activity source). |
| `max_status` | `number` | query | No | Maximum HTTP status (activity source). |
| `errors_only` | `boolean` | query | No | Only error rows (activity source; true/false). |
| `event_type` | `string` | query | No | Event type filter (events source). |
| `resource_type` | `string` | query | No | Resource type filter (events source). |
| `container` | `string` | query | No | Container filter (proxy source; empty = all running realm containers). Maps to the daemon's container_id filter. |
| `kind` | `string` | query | No | Proxy row kind: request\|response\|event (proxy source). |
| `host` | `string` | query | No | Proxy URL host filter (exact or dot-aligned suffix). |
| `since_seq` | `number` | query | No | Exclusive lower seq bound for incremental exports (local sources). |
| `limit` | `number` | query | No | TOTAL row cap across the export (default: everything the snapshot matches; platform default 2000). |
| `format` | `string` | query | No | Export format: jsonl (default) or txt. |
| `filename` | `string` | query | No | Download filename override (reduced to a safe basename). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `GET /api/v1/agent/logs/export`
**CLI:** `hoody agent logs export`

---

#### `get` — Read a log entry.

```typescript
client.agent.logs.get(ref: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `ref` | `string` | path | Yes | The ref. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentLogsGetResponse>`  |  **HTTP:** `GET /api/v1/agent/logs/entries/{ref}`
**CLI:** `hoody agent logs get`

---

#### `getStats` — Log statistics.

```typescript
client.agent.logs.getStats(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentLogsGetStatsResponse>`  |  **HTTP:** `GET /api/v1/agent/logs/stats`
**CLI:** `hoody agent logs stats`

---

#### `list` — Query logs.

```typescript
client.agent.logs.list(options?: { source?: string; level?: string; host?: string; session_id?: string; run_id?: string; since?: string; until?: string; since_seq?: number; before_seq?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source` | `string` | query | No | Filter to a log source/facet (see `agent.logs.listSources`). One local source, or exactly ONE platform source (activity\|events\|proxy) — mixing them is rejected. |
| `level` | `string` | query | No | Filter to a minimum log level. |
| `host` | `string` | query | No | Filter to a host. |
| `session_id` | `string` | query | No | Only entries correlated with this session id (exact match on the entry's session_id). |
| `run_id` | `string` | query | No | Only entries correlated with this workflow/task run id (exact match on the entry's run_id). |
| `since` | `string` | query | No | Lower TIME bound: RFC3339, or a relative duration like "1h"/"30m"/"7d". This is NOT a cursor — a bare sequence number is rejected 400 (use since_seq). Unparseable values are rejected the same way. |
| `until` | `string` | query | No | Upper TIME bound, same forms as since. Paging BACKWARDS by repeatedly lowering until works, but it is coarse (rows sharing a timestamp repeat); before_seq is the exact backwards cursor. |
| `since_seq` | `number` | query | No | Forward cursor: return only entries NEWER than this gateway seq. Take it from the previous reply's latest_seq to poll incrementally without re-reading rows. A non-numeric value is rejected 400. |
| `before_seq` | `number` | query | No | Backward cursor: return only entries OLDER than this seq. Take it from the SEQ OF THE OLDEST ENTRY THIS PAGE RETURNED — not from oldest_seq, which is the oldest sequence still retained in the ring and is usually far older than the page you just read. Paging back from oldest_seq jumps past every entry in between and returns an empty page, which reads as "history exhausted" when it is not. A non-numeric value is rejected 400. |
| `limit` | `number` | query | No | Caps this page. Omitted it is the daemon default 200; ANY explicit value is clamped to the ring maximum of 500, and limit=0 means 500 rather than 200 — a caller that needs more than 500 rows pages with before_seq/since_seq. A non-numeric value is rejected 400. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentLogsListResponse>`  |  **HTTP:** `GET /api/v1/agent/logs`
**CLI:** `hoody agent logs list`

---

#### `listSources` — Log sources.

```typescript
client.agent.logs.listSources(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentLogsListSourcesResponse>`  |  **HTTP:** `GET /api/v1/agent/logs/sources`
**CLI:** `hoody agent logs sources list`

---

#### `stream` — Stream the log tail (SSE).

```typescript
client.agent.logs.stream(options?: { source?: string; level?: string; host?: string; session_id?: string; run_id?: string; since_seq?: number; limit?: number; LastEventID?: string; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source` | `string` | query | No | Filter the tail to a log source/facet. |
| `level` | `string` | query | No | Filter to a minimum log level. |
| `host` | `string` | query | No | Filter to a host. |
| `session_id` | `string` | query | No | Only entries correlated with this session id. |
| `run_id` | `string` | query | No | Only entries correlated with this workflow/task run id. |
| `since_seq` | `number` | query | No | Initial resume cursor (the Last-Event-ID header overrides it). A non-numeric value is rejected 400. |
| `limit` | `number` | query | No | Caps each poll batch. A non-numeric value is rejected 400. |
| `LastEventID` | `string` | header `Last-Event-ID` | No | SSE resume cursor — the gateway int64 seq to resume from; OVERRIDES the ?since_seq query param. Sent automatically by an SSE client on reconnect. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentLogsStreamFrames>>>`  |  **HTTP:** `GET /api/v1/agent/logs/stream`
**CLI:** `hoody agent logs stream`

---

### `client.agent.loops` (7) — Recurring self-paced agent loops

#### `create` — Create a loop.

```typescript
client.agent.loops.create(id: string, data: AgentLoopsCreateRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentLoopsCreateRequest` | body | Yes |  |

**Body:** `{ prompt*: string, interval*: string, max_runs: int, stop_when: { kind: "expression" | "toolCall" | "judgeRef" | "convergence", expr: string, tool: string, check: string, judge: string, args: object, threshold: number, min_iters: int, allow_network: bool }, max_cost_usd: number, max_wall_ms: int, expires_in: string, fire_now: bool }`

- `interval` — Run interval as a duration token, for example "30m". Required, with no default: a create without it is rejected. The minimum accepted interval is 60 seconds — a shorter one is refused rather than rounded up.
- `stop_when` — Optional stop predicate, evaluated after each run. Omit the field entirely when there is no predicate: a string value is rejected, and that includes the empty string.
- `expires_in` — … Without fire_now an expiry shorter than one interval is rejected, because the loop would never fire; with fire_now it must be at least 2 seconds, so the immediate first run can happen.

**Returns:** `Promise<AgentLoopsCreateResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/loops`
**CLI:** `hoody agent loops create`

---

#### `delete` — Delete a loop.

```typescript
client.agent.loops.delete(id: string, loopId: string, data?: AgentLoopsDeleteRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `loopId` | `string` | path | Yes | The loop id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentLoopsDeleteRequest` | body | No |  |

**Returns:** `Promise<AgentLoopsDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/agent/sessions/{id}/loops/{loopId}`
**CLI:** `hoody agent loops delete`

---

#### `list` — List loops across all sessions.

```typescript
client.agent.loops.list(options?: { realm?: "global" | "all" | (string & {}); page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm` | `"global" \| "all" \| (string & {})` | query | No | The realm to list: "global" (loops not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| "all" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentLoopsListResponse>`  |  **HTTP:** `GET /api/v1/agent/loops`
**CLI:** `hoody agent loops list`

---

#### `listAll` — List loops across all sessions. (collect all pages)

```typescript
client.agent.loops.listAll(options?: { realm?: "global" | "all" | (string & {}); page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm` | `"global" \| "all" \| (string & {})` | query | No | The realm to list: "global" (loops not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| "all" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<(NonNullable<AgentLoopsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/loops`
**CLI:** `hoody agent loops list`

---

#### `listIterator` — List loops across all sessions. (async iterator)

```typescript
client.agent.loops.listIterator(options?: { realm?: "global" | "all" | (string & {}); page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm` | `"global" \| "all" \| (string & {})` | query | No | The realm to list: "global" (loops not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| "all" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncGenerator<(NonNullable<AgentLoopsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/loops`
**CLI:** `hoody agent loops list`

---

#### `startRun` — Run a loop immediately.

```typescript
client.agent.loops.startRun(id: string, loopId: string, data?: AgentLoopsStartRunRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `loopId` | `string` | path | Yes | The loop id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentLoopsStartRunRequest` | body | No |  |

**Returns:** `Promise<AgentLoopsStartRunResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/loops/{loopId}/run-now`
**CLI:** `hoody agent loops runs start`

---

#### `update` — Update a loop.

```typescript
client.agent.loops.update(id: string, loopId: string, data?: AgentLoopsUpdateRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `loopId` | `string` | path | Yes | The loop id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentLoopsUpdateRequest` | body | No |  |

**Body:** `{ paused: bool, expires_in: string, max_cost_usd: number, max_wall_ms: int }`

**Returns:** `Promise<AgentLoopsUpdateResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/loops/{loopId}`
**CLI:** `hoody agent loops update`

---

### `client.agent.mcp` (10) — Mcp operations

#### `createWriteIntent` — Begin an MCP config write.

```typescript
client.agent.mcp.createWriteIntent(data: AgentMcpCreateWriteIntentRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentMcpCreateWriteIntentRequest` | body | Yes |  |

**Body:** `{ session_id*: string, op*: "upsert" | "delete" | "set_enabled" | "import", scope: "user" | "project" | "local" }`

**Returns:** `Promise<AgentMcpCreateWriteIntentResponse>`  |  **HTTP:** `POST /api/v1/agent/mcp/write-intents`
**CLI:** `hoody agent mcp intents create`

---

#### `deleteServer` — Delete an MCP server.

```typescript
client.agent.mcp.deleteServer(data: AgentMcpDeleteServerRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentMcpDeleteServerRequest` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", name*: string, expect_hash*: string }`

- `scope` — Settings layer to write. Must match the scope the nonce was minted for.

**Returns:** `Promise<AgentMcpDeleteServerResponse>`  |  **HTTP:** `DELETE /api/v1/agent/mcp/servers`
**CLI:** `hoody agent mcp delete`

---

#### `disableServer` — Enable or disable an MCP server.

```typescript
client.agent.mcp.disableServer(data: Omit<AgentSetMCPServerEnabledRequest, "enabled">, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `Omit<AgentSetMCPServerEnabledRequest, "enabled">` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", name*: string, expect_hash*: string }`

- `scope` — Settings layer to write. Must match the scope the nonce was minted for.

**Fixed by the method:** the method sets `enabled: false`; do not pass `enabled`.

**Returns:** `Promise<AgentSetMCPServerEnabledResponse>`  |  **HTTP:** `POST /api/v1/agent/mcp/servers/enable`
**CLI:** `hoody agent mcp disable`

---

#### `enableServer` — Enable or disable an MCP server.

```typescript
client.agent.mcp.enableServer(data: Omit<AgentSetMCPServerEnabledRequest, "enabled">, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `Omit<AgentSetMCPServerEnabledRequest, "enabled">` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", name*: string, expect_hash*: string }`

- `scope` — Settings layer to write. Must match the scope the nonce was minted for.

**Fixed by the method:** the method sets `enabled: true`; do not pass `enabled`.

**Returns:** `Promise<AgentSetMCPServerEnabledResponse>`  |  **HTTP:** `POST /api/v1/agent/mcp/servers/enable`
**CLI:** `hoody agent mcp enable`

---

#### `importServers` — Import MCP servers from another tool's config.

```typescript
client.agent.mcp.importServers(data: AgentMcpImportServersRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentMcpImportServersRequest` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", document: string, servers: { name: string, type: string, command: string, args: string[], url: string, env: object, headers: object, allowed_tools: string[], require_confirmation: bool, enabled: bool }[], replace: bool, expect_hash*: string }`

- `scope` — Settings layer to write. Must match the scope the nonce was minted for.
- `document` — A pasted config document in any supported dialect. Mutually exclusive with the servers field. …
- `servers` — Explicit server entries, in hoody's own shape (the `agent.mcp.upsertServer` server entry). Mutually exclusive with document. API/SDK only — see document for why this has no CLI flag.

**Returns:** `Promise<AgentMcpImportServersResponse>`  |  **HTTP:** `POST /api/v1/agent/mcp/import`
**CLI:** `hoody agent mcp import`

---

#### `listServers` — List configured MCP servers.

```typescript
client.agent.mcp.listServers(options: { session_id: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `session_id` | `string` | query | Yes | Live session id (MCP config is resolved against the session's settings layers). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentMcpListServersResponse>`  |  **HTTP:** `GET /api/v1/agent/mcp/servers`
**CLI:** `hoody agent mcp list`

---

#### `previewImport` — Preview an MCP config import.

```typescript
client.agent.mcp.previewImport(data: AgentMcpPreviewImportRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentMcpPreviewImportRequest` | body | Yes |  |

**Body:** `{ session_id*: string, document*: string }`

**Returns:** `Promise<AgentMcpPreviewImportResponse>`  |  **HTTP:** `POST /api/v1/agent/mcp/parse`
**CLI:** `hoody agent mcp preview`

---

#### `reconnect` — Reload MCP config and reconnect.

```typescript
client.agent.mcp.reconnect(data: AgentMcpReconnectRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentMcpReconnectRequest` | body | Yes |  |

**Body:** `{ session_id*: string }`

**Returns:** `Promise<AgentMcpReconnectResponse>`  |  **HTTP:** `POST /api/v1/agent/mcp/reconnect`
**CLI:** `hoody agent mcp reconnect`

---

#### `testServer` — Probe an MCP server without saving it.

```typescript
client.agent.mcp.testServer(data: AgentMcpTestServerRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentMcpTestServerRequest` | body | Yes |  |

**Body:** `{ session_id*: string, server*: { name: string, type: string, command: string, args: string[], url: string, env: object, headers: object, allowed_tools: string[], require_confirmation: bool, enabled: bool } }`

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `POST /api/v1/agent/mcp/probe`
**CLI:** `hoody agent mcp test`

---

#### `upsertServer` — Create or update an MCP server.

```typescript
client.agent.mcp.upsertServer(data: AgentMcpUpsertServerRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentMcpUpsertServerRequest` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", expect_hash*: string, server*: { name: string, type: string, command: string, args: string[], url: string, env: object, headers: object, allowed_tools: string[], require_confirmation: bool, enabled: bool } }`

- `scope` — Settings layer to write. Must match the scope the nonce was minted for.
- `expect_hash` — The mcp_servers hash you last read, as returned by `agent.mcp.createWriteIntent` or `agent.mcp.listServers`. REQUIRED: a mismatch returns a conflict instead of overwriting a concurrent edit, and a first write into a file that does not exist yet states its expectation with the empty-array hash rather than omitting this.

**Returns:** `Promise<AgentMcpUpsertServerResponse>`  |  **HTTP:** `PUT /api/v1/agent/mcp/servers`
**CLI:** `hoody agent mcp upsert`

---

### `client.agent.memory` (21) — Long-term memory records (admin browse / CRUD)

#### `claimDataHost` — Assign this computer as the memory data host.

```typescript
client.agent.memory.claimDataHost(data: AgentMemoryClaimDataHostRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentMemoryClaimDataHostRequest` | body | Yes |  |

**Body:** `{ use_self*: bool, expect_realm: string }`

- `use_self` — Assign THIS computer. Only true is implemented; false is refused 400 unsupported.
- `expect_realm` — … Required unless X-Hoody-Realm or ?realm= names the realm; refused 400 when neither does (an empty value means the global realm to the daemon, never "unspecified"), and 400 bad_request when it names another realm than they do.

**Returns:** `Promise<AgentMemoryClaimDataHostResponse>`  |  **HTTP:** `PUT /api/v1/agent/memory/datahost`
**CLI:** `hoody agent memory datahost claim`

---

#### `consolidate` — Trigger a memory consolidation pass (human-only).

```typescript
client.agent.memory.consolidate(data: AgentMemoryConsolidateRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentMemoryConsolidateRequest` | body | Yes |  |

**Body:** `{ project*: string, min_observations: int }`

- `project` — Project key to consolidate (required).

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `POST /api/v1/agent/memory/consolidate`
**CLI:** `hoody agent memory consolidate`

---

#### `createItem` — Save a memory item.

```typescript
client.agent.memory.createItem(data: AgentMemoryCreateItemRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentMemoryCreateItemRequest` | body | Yes |  |

**Body:** `{ project*: string, content*: string, type: string, concepts: string[], files: string[], ttl_days: int, strength: int, expect_realm: string }`

- `ttl_days` — … Must be a whole number between -2147483648 and 106751 (about 292 years — the longest expiry the store can represent); a value outside that range is REFUSED, never clamped and never treated as no expiry. A fractional value like 30.5 and a numeric string like "30" are both REFUSED too, never truncated or coerced — a silent coercion to 0 would store the memory with no expiry at all while reporting success.
- `strength` — Initial ranking strength, a whole number from 1 (weakest) to 10 (strongest). Omitted or 0 takes the store's default of 7. Any other value — a negative number, anything above 10, a fractional value or a numeric string — is REFUSED, never coerced and never silently replaced with the default.
- `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The write is refused when it does not name the realm the request acts in (the named realm, else the agent's active realm), so it cannot land in a realm the caller switched away from.

**Returns:** `Promise<AgentMemoryCreateItemResponse>`  |  **HTTP:** `POST /api/v1/agent/memory/items`
**CLI:** `hoody agent memory items create`

---

#### `createWriteIntent` — Begin a guarded memory write (intent).

```typescript
client.agent.memory.createWriteIntent(data: AgentMemoryCreateWriteIntentRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentMemoryCreateWriteIntentRequest` | body | Yes |  |

**Body:** `{ op*: "wipe_project", project*: string, expect_realm: string }`

- `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The request is refused when it does not name the realm the request acts in (the named realm, else the agent's active realm).

**Returns:** `Promise<AgentMemoryCreateWriteIntentResponse>`  |  **HTTP:** `POST /api/v1/agent/memory/write-intents`
**CLI:** `hoody agent memory intents create`

---

#### `deleteItem` — Delete a memory item.

```typescript
client.agent.memory.deleteItem(data?: AgentMemoryDeleteItemRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentMemoryDeleteItemRequest` | body | No |  |

**Body:** `{ ids: string[], id: string, name: string, project: string, kind: "memory" | "observation" | "lesson" | "slot", reason: string, expect_realm: string }`

- `ids` — Record ids to delete. Required for kind memory/observation/lesson (the empty/default kind included). A `summary:<session_id>`-prefixed id deletes a summary.
- `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The delete is refused when it does not name the realm the request acts in (the named realm, else the agent's active realm).

**Returns:** `Promise<AgentMemoryDeleteItemResponse>`  |  **HTTP:** `DELETE /api/v1/agent/memory/items`
**CLI:** `hoody agent memory items delete`

---

#### `deleteProject` — Erase a memory project.

```typescript
client.agent.memory.deleteProject(project: string, data: AgentMemoryDeleteProjectRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `project` | `string` | path | Yes | The project. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentMemoryDeleteProjectRequest` | body | Yes |  |

**Body:** `{ nonce*: string, reason: string, expect_realm: string }`

- `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The request is refused when it does not name the realm the request acts in (the named realm, else the agent's active realm).

**Returns:** `Promise<AgentMemoryDeleteProjectResponse>`  |  **HTTP:** `DELETE /api/v1/agent/memory/projects/{project}`
**CLI:** `hoody agent memory projects delete`

---

#### `disable` — Toggle memory capture.

```typescript
client.agent.memory.disable(data?: Omit<AgentSetMemoryEnabledRequest, "enabled">, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `Omit<AgentSetMemoryEnabledRequest, "enabled">` | body | No |  |

**Fixed by the method:** the method sets `enabled: false`; do not pass `enabled`.

**Returns:** `Promise<AgentSetMemoryEnabledResponse>`  |  **HTTP:** `PUT /api/v1/agent/memory/enabled`
**CLI:** `hoody agent memory disable`

---

#### `enable` — Toggle memory capture.

```typescript
client.agent.memory.enable(data?: Omit<AgentSetMemoryEnabledRequest, "enabled">, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `Omit<AgentSetMemoryEnabledRequest, "enabled">` | body | No |  |

**Fixed by the method:** the method sets `enabled: true`; do not pass `enabled`.

**Returns:** `Promise<AgentSetMemoryEnabledResponse>`  |  **HTTP:** `PUT /api/v1/agent/memory/enabled`
**CLI:** `hoody agent memory enable`

---

#### `flush` — Flush the memory store.

```typescript
client.agent.memory.flush(data?: AgentMemoryFlushRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentMemoryFlushRequest` | body | No |  |

**Returns:** `Promise<AgentMemoryFlushResponse>`  |  **HTTP:** `POST /api/v1/agent/memory/flush`
**CLI:** `hoody agent memory flush`

---

#### `getDataHost` — Read the realm's memory data host.

```typescript
client.agent.memory.getDataHost(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentMemoryGetDataHostResponse>`  |  **HTTP:** `GET /api/v1/agent/memory/datahost`
**CLI:** `hoody agent memory datahost get`

---

#### `getGraph` — Read a project's memory relation graph.

```typescript
client.agent.memory.getGraph(options?: { project?: string; node_type?: string; limit?: number; offset?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `project` | `string` | query | No | Project key whose graph to read. |
| `node_type` | `string` | query | No | Optional node-type filter. |
| `limit` | `number` | query | No | Maximum nodes/edges to return. |
| `offset` | `number` | query | No | Pagination offset into the graph. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentMemoryGetGraphResponse>`  |  **HTTP:** `GET /api/v1/agent/memory/graph`
**CLI:** `hoody agent memory graph get`

---

#### `getItem` — Read a memory item.

```typescript
client.agent.memory.getItem(id: string, options?: { project?: string; kind?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The item id. |
| `project` | `string` | query | No | Project key the memory belongs to. |
| `kind` | `string` | query | No | Memory kind/store the record lives in. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentMemoryGetItemResponse>`  |  **HTTP:** `GET /api/v1/agent/memory/items/{id}`
**CLI:** `hoody agent memory items get`

---

#### `getStatus` — Read memory subsystem status.

```typescript
client.agent.memory.getStatus(options?: { project?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `project` | `string` | query | No | Project key to report per-project counts, embedding coverage and last-consolidation for. Omitted: only the whole-store totals are returned. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentMemoryGetStatusResponse>`  |  **HTTP:** `GET /api/v1/agent/memory/status`
**CLI:** `hoody agent memory status`

---

#### `listItems` — List memory items.

```typescript
client.agent.memory.listItems(options?: { project?: string; kind?: string; type?: string; query?: string; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `project` | `string` | query | No | Project key to scope the listing to. |
| `kind` | `string` | query | No | Memory kind/store to filter by. |
| `type` | `string` | query | No | Memory type to filter by (e.g. workflow, fact). kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `query` | `string` | query | No | Free-text filter over the records. kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `page` | `number` | query | No | 1-based page number. |
| `limit` | `number` | query | No | Items per page (1..200). 0 or omitted pages at the 200 ceiling; a value over 200 is clamped to 200. The effective page size is echoed in meta.limit. NOT "no pagination" — the daemon never returns an unbounded set. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentMemoryListItemsResponse>`  |  **HTTP:** `GET /api/v1/agent/memory/items`
**CLI:** `hoody agent memory items list`

---

#### `listItemsAll` — List memory items. (collect all pages)

```typescript
client.agent.memory.listItemsAll(options?: { project?: string; kind?: string; type?: string; query?: string; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `project` | `string` | query | No | Project key to scope the listing to. |
| `kind` | `string` | query | No | Memory kind/store to filter by. |
| `type` | `string` | query | No | Memory type to filter by (e.g. workflow, fact). kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `query` | `string` | query | No | Free-text filter over the records. kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `page` | `number` | query | No | 1-based page number. |
| `limit` | `number` | query | No | Items per page (1..200). 0 or omitted pages at the 200 ceiling; a value over 200 is clamped to 200. The effective page size is echoed in meta.limit. NOT "no pagination" — the daemon never returns an unbounded set. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<(NonNullable<AgentMemoryListItemsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`listItems()` fetches one page). `listItemsIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/memory/items`
**CLI:** `hoody agent memory items list`

---

#### `listItemsIterator` — List memory items. (async iterator)

```typescript
client.agent.memory.listItemsIterator(options?: { project?: string; kind?: string; type?: string; query?: string; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `project` | `string` | query | No | Project key to scope the listing to. |
| `kind` | `string` | query | No | Memory kind/store to filter by. |
| `type` | `string` | query | No | Memory type to filter by (e.g. workflow, fact). kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `query` | `string` | query | No | Free-text filter over the records. kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `page` | `number` | query | No | 1-based page number. |
| `limit` | `number` | query | No | Items per page (1..200). 0 or omitted pages at the 200 ceiling; a value over 200 is clamped to 200. The effective page size is echoed in meta.limit. NOT "no pagination" — the daemon never returns an unbounded set. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncGenerator<(NonNullable<AgentMemoryListItemsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`listItems()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/memory/items`
**CLI:** `hoody agent memory items list`

---

#### `listProjects` — List memory projects.

```typescript
client.agent.memory.listProjects(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentMemoryListProjectsResponse>`  |  **HTTP:** `GET /api/v1/agent/memory/projects`
**CLI:** `hoody agent memory projects list`

---

#### `listProjectsAll` — List memory projects. (collect all pages)

```typescript
client.agent.memory.listProjectsAll(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<(NonNullable<AgentMemoryListProjectsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`listProjects()` fetches one page). `listProjectsIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/memory/projects`
**CLI:** `hoody agent memory projects list`

---

#### `listProjectsIterator` — List memory projects. (async iterator)

```typescript
client.agent.memory.listProjectsIterator(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncGenerator<(NonNullable<AgentMemoryListProjectsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`listProjects()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/memory/projects`
**CLI:** `hoody agent memory projects list`

---

#### `search` — Search memory (hybrid recall).

```typescript
client.agent.memory.search(data?: AgentMemorySearchRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentMemorySearchRequest` | body | No |  |

**Body:** `{ project: string, query: string, limit: int, kinds: string[], skip_graph: bool }`

**Returns:** `Promise<AgentMemorySearchResponse>`  |  **HTTP:** `POST /api/v1/agent/memory/search`
**CLI:** `hoody agent memory search`

---

#### `updateItem` — Edit a memory item.

```typescript
client.agent.memory.updateItem(id: string, data?: AgentMemoryUpdateItemRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The item id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentMemoryUpdateItemRequest` | body | No |  |

**Body:** `{ project: string, kind: "memory" | "lesson" | "slot", content: string, type: string, concepts: string[], files: string[], strength: int, ttl_days: int, tier: string, context: string, confidence: number, expect_realm: string }`

- `content` — Replacement content. Applies to every kind, and is REQUIRED for kind=slot (a slot edit with no content is refused — use the delete route to remove a slot).
- `concepts` — kind=memory: replacement concept tags. The whole list is replaced, and a malformed array is rejected rather than silently truncated.
- `files` — kind=memory: replacement file paths. The whole list is replaced, and a malformed array is rejected rather than silently truncated.
- `strength` — kind=memory: replacement ranking strength, a whole number from 1 (weakest) to 10 (strongest). Any other value — 0, a negative number, anything above 10, a fractional value or a numeric string — is REFUSED, never coerced, and the stored strength is left unchanged.
- `ttl_days` — … Must be a whole number between -2147483648 and 106751 (about 292 years — the longest expiry the store can represent); a value outside that range is REFUSED, never clamped, and the stored expiry is left unchanged. A fractional value like 30.5 and a numeric string like "30" are both REFUSED too, never truncated or coerced.
- `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The edit is refused when it does not name the realm the request acts in (the named realm, else the agent's active realm).

**Returns:** `Promise<AgentMemoryUpdateItemResponse>`  |  **HTTP:** `PATCH /api/v1/agent/memory/items/{id}`
**CLI:** `hoody agent memory items update`

---

### `client.agent.models` (4) — Catalogued models and fusion composites

#### `get` — Get a model by spec.

```typescript
client.agent.models.get(spec: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `spec` | `string` | path | Yes | The spec. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentModelsGetResponse>`  |  **HTTP:** `GET /api/v1/agent/models/{spec}`
**CLI:** `hoody agent models get`

---

#### `list` — List models.

```typescript
client.agent.models.list(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentModelsListResponse>`  |  **HTTP:** `GET /api/v1/agent/models`
**CLI:** `hoody agent models list`

---

#### `listAll` — List models. (collect all pages)

```typescript
client.agent.models.listAll(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<(NonNullable<AgentModelsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/models`
**CLI:** `hoody agent models list`

---

#### `listIterator` — List models. (async iterator)

```typescript
client.agent.models.listIterator(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `AsyncGenerator<(NonNullable<AgentModelsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/models`
**CLI:** `hoody agent models list`

---

### `client.agent.platform` (1) — Hoody operations

#### `bootstrapToken` — Bootstrap the Hoody platform credential (install-if-absent).

```typescript
client.agent.platform.bootstrapToken(data: AgentBootstrapHoodyTokenRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `AgentBootstrapHoodyTokenRequest` | body | Yes |  |

**Body:** `{ token*: string, capability: string }`

- `capability` — The operator bootstrap capability, required only on deployments configured with one; a mismatch is answered 404.

**Returns:** `Promise<AgentBootstrapHoodyTokenResponse>`  |  **HTTP:** `POST /api/v1/agent/hoody/auth/bootstrap`

---

### `client.agent.providers` (21) — Catalogued models and fusion composites

#### `addAccount` — Add an OAuth account to a provider's pool.

```typescript
client.agent.providers.addAccount(id: string, data?: AgentProvidersAddAccountRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The provider id. |
| `data` | `AgentProvidersAddAccountRequest` | body | No |  |

**Returns:** `Promise<AgentProvidersAddAccountResponse>`  |  **HTTP:** `POST /api/v1/agent/providers/{id}/auth/accounts`
**CLI:** `hoody agent providers accounts add`

---

#### `create` — Create a custom provider.

```typescript
client.agent.providers.create(data: AgentProvidersCreateRequest, options?: { IdempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Opaque retry key (1-255 printable ASCII, no whitespace). A retry with the same key and body answers 201 with the provider the first try created; the same key with another body is 422 idempotency_key_reused. Keys are remembered for 24 hours, until the agent restarts. |
| `data` | `AgentProvidersCreateRequest` | body | Yes |  |

**Body:** `{ id*: string, model_prefix: string, display_name: string, wire_format: "chat_completions" | "responses" | "messages", base_url*: string, auth_scheme: "bearer" | "x-api-key", headers: { [key: string]: string }, models*: { model*: string, context_window: int, output_limit: int, reasoning: bool }[] }`

- `id` — The provider id: 1-40 lowercase letters, digits or inner hyphens. It cannot be changed later.
- `model_prefix` — The prefix of the provider's model specs (acme for acme/<model>). It must equal the id; omitted, it is the id. No provider's id or prefix may already use it, and fusion is reserved.
- `base_url` — The endpoint's base URL, the part before /chat/completions, /responses or /v1/messages (e.g. https://api.acme.example/v1). base_url must be an https URL with no user name, password, query or fragment, at a public address: an internal address, a name that only resolves inside a network, or a name that resolves to an internal address when a request is made is refused.
- `auth_scheme` — How the stored key is sent. It follows wire_format: bearer (Authorization: Bearer <key>) with chat_completions and responses, x-api-key with messages. Omitted, it is that value; any other pairing is refused 422 provider_invalid.
- `headers` — Static request headers sent on every request, chat_completions only, at most 16. Credential and transport headers (Authorization, x-api-key, api-key, Cookie, Host, Content-Type, Content-Length, Connection and the other hop-by-hop headers) are refused. Values must not contain ${...}. …

**Returns:** `Promise<AgentProvidersCreateResponse>`  |  **HTTP:** `POST /api/v1/agent/providers`
**CLI:** `hoody agent providers create`

---

#### `delete` — Delete a custom provider.

```typescript
client.agent.providers.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The provider id. |

**Returns:** `Promise<AgentProvidersDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/agent/providers/{id}`
**CLI:** `hoody agent providers delete`

---

#### `deleteApiKey` — Delete a provider API key.

```typescript
client.agent.providers.deleteApiKey(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The provider id. |

**Returns:** `Promise<AgentProvidersDeleteApiKeyResponse>`  |  **HTTP:** `DELETE /api/v1/agent/providers/{id}/auth/api-key`
**CLI:** `hoody agent providers keys delete`

---

#### `get` — Get a provider.

```typescript
client.agent.providers.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The provider id. |

**Returns:** `Promise<AgentProvidersGetResponse>`  |  **HTTP:** `GET /api/v1/agent/providers/{id}`
**CLI:** `hoody agent providers get`

---

#### `getAuth` — Get a provider's auth status.

```typescript
client.agent.providers.getAuth(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The provider id. |

**Returns:** `Promise<AgentProvidersGetAuthResponse>`  |  **HTTP:** `GET /api/v1/agent/providers/{id}/auth`
**CLI:** `hoody agent providers auth status`

---

#### `list` — List LLM providers.

```typescript
client.agent.providers.list(options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |

**Returns:** `Promise<AgentProvidersListResponse>`  |  **HTTP:** `GET /api/v1/agent/providers`
**CLI:** `hoody agent providers list`

---

#### `listAccounts` — List a provider's OAuth account pool.

```typescript
client.agent.providers.listAccounts(id: string, options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The provider id. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |

**Returns:** `Promise<AgentProvidersListAccountsResponse>`  |  **HTTP:** `GET /api/v1/agent/providers/{id}/auth/accounts`
**CLI:** `hoody agent providers accounts list`

---

#### `listAccountsAll` — List a provider's OAuth account pool. (collect all pages)

```typescript
client.agent.providers.listAccountsAll(id: string, options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The provider id. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |

**Returns:** `Promise<(NonNullable<AgentProvidersListAccountsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`listAccounts()` fetches one page). `listAccountsIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/providers/{id}/auth/accounts`
**CLI:** `hoody agent providers accounts list`

---

#### `listAccountsIterator` — List a provider's OAuth account pool. (async iterator)

```typescript
client.agent.providers.listAccountsIterator(id: string, options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The provider id. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |

**Returns:** `AsyncGenerator<(NonNullable<AgentProvidersListAccountsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`listAccounts()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/providers/{id}/auth/accounts`
**CLI:** `hoody agent providers accounts list`

---

#### `listAll` — List LLM providers. (collect all pages)

```typescript
client.agent.providers.listAll(options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |

**Returns:** `Promise<(NonNullable<AgentProvidersListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/providers`
**CLI:** `hoody agent providers list`

---

#### `listIterator` — List LLM providers. (async iterator)

```typescript
client.agent.providers.listIterator(options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |

**Returns:** `AsyncGenerator<(NonNullable<AgentProvidersListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/providers`
**CLI:** `hoody agent providers list`

---

#### `logoutOauth` — Remove a provider's OAuth login.

```typescript
client.agent.providers.logoutOauth(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The provider id. |

**Returns:** `Promise<AgentProvidersLogoutOauthResponse>`  |  **HTTP:** `DELETE /api/v1/agent/providers/{id}/auth/oauth`
**CLI:** `hoody agent providers oauth logout`

---

#### `pollOauth` — Poll a provider OAuth login.

```typescript
client.agent.providers.pollOauth(id: string, job: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The provider id. |
| `job` | `string` | path | Yes | The job. |

**Returns:** `Promise<AgentProvidersPollOauthResponse>`  |  **HTTP:** `GET /api/v1/agent/providers/{id}/auth/oauth/{job}`
**CLI:** `hoody agent providers oauth poll`

---

#### `removeAccount` — Remove a pooled OAuth account.

```typescript
client.agent.providers.removeAccount(id: string, key: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The provider id. |
| `key` | `string` | path | Yes | The key. |

**Returns:** `Promise<AgentProvidersRemoveAccountResponse>`  |  **HTTP:** `DELETE /api/v1/agent/providers/{id}/auth/accounts/{key}`
**CLI:** `hoody agent providers accounts remove`

---

#### `setApiKey` — Store a provider API key.

```typescript
client.agent.providers.setApiKey(id: string, data: AgentProvidersSetApiKeyRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The provider id. |
| `data` | `AgentProvidersSetApiKeyRequest` | body | Yes |  |

**Body:** `{ api_key*: string }`

**Returns:** `Promise<AgentProvidersSetApiKeyResponse>`  |  **HTTP:** `PUT /api/v1/agent/providers/{id}/auth/api-key`
**CLI:** `hoody agent providers keys set`

---

#### `setDefaultAuth` — Set a provider's default credential method.

```typescript
client.agent.providers.setDefaultAuth(id: string, data: AgentProvidersSetDefaultAuthRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The provider id. |
| `data` | `AgentProvidersSetDefaultAuthRequest` | body | Yes |  |

**Body:** `{ default*: string }`

- `default` — The default method: "api_key" or "oauth". Must be a method the provider supports AND has a stored credential for.

**Returns:** `Promise<AgentProvidersSetDefaultAuthResponse>`  |  **HTTP:** `PUT /api/v1/agent/providers/{id}/auth/default`
**CLI:** `hoody agent providers auth default set`

---

#### `startOauth` — Start a provider OAuth login.

```typescript
client.agent.providers.startOauth(id: string, data?: AgentProvidersStartOauthRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The provider id. |
| `data` | `AgentProvidersStartOauthRequest` | body | No |  |

**Body:** `{ add_account: bool }`

**Returns:** `Promise<AgentProvidersStartOauthResponse>`  |  **HTTP:** `POST /api/v1/agent/providers/{id}/auth/oauth`
**CLI:** `hoody agent providers oauth start`

---

#### `submitOauthCode` — Submit a provider OAuth authorization code.

```typescript
client.agent.providers.submitOauthCode(id: string, job: string, data: AgentProvidersSubmitOauthCodeRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The provider id. |
| `job` | `string` | path | Yes | The job. |
| `data` | `AgentProvidersSubmitOauthCodeRequest` | body | Yes |  |

**Body:** `{ code*: string }`

**Returns:** `Promise<AgentProvidersSubmitOauthCodeResponse>`  |  **HTTP:** `POST /api/v1/agent/providers/{id}/auth/oauth/{job}/code`
**CLI:** `hoody agent providers oauth submit`

---

#### `update` — Change a custom provider.

```typescript
client.agent.providers.update(id: string, data?: AgentProvidersUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The provider id. |
| `data` | `AgentProvidersUpdateRequest` | body | No |  |

**Body:** `{ display_name: string, wire_format: "chat_completions" | "responses" | "messages", base_url: string, auth_scheme: "bearer" | "x-api-key", headers: { [key: string]: string }, models: { model*: string, context_window: int, output_limit: int, reasoning: bool }[], model_prefix: string }`

- `base_url` — The endpoint's base URL, the part before /chat/completions, /responses or /v1/messages (e.g. https://api.acme.example/v1). base_url must be an https URL with no user name, password, query or fragment, at a public address: an internal address, a name that only resolves inside a network, or a name that resolves to an internal address when a request is made is refused.
- `auth_scheme` — How the stored key is sent. It follows wire_format: bearer (Authorization: Bearer <key>) with chat_completions and responses, x-api-key with messages. Omitted, it is that value; any other pairing is refused 422 provider_invalid.
- `headers` — Static request headers sent on every request, chat_completions only, at most 16. Credential and transport headers (Authorization, x-api-key, api-key, Cookie, Host, Content-Type, Content-Length, Connection and the other hop-by-hop headers) are refused. Values must not contain ${...}. …
- `model_prefix` — Fixed at creation. Accepted only when equal to the current prefix; any other value is refused 400 provider_field_immutable.

**Returns:** `Promise<AgentProvidersUpdateResponse>`  |  **HTTP:** `PATCH /api/v1/agent/providers/{id}`
**CLI:** `hoody agent providers update`

---

#### `useAccount` — Make a pooled OAuth account active.

```typescript
client.agent.providers.useAccount(id: string, key: string, data?: AgentProvidersUseAccountRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The provider id. |
| `key` | `string` | path | Yes | The key. |
| `data` | `AgentProvidersUseAccountRequest` | body | No |  |

**Returns:** `Promise<AgentProvidersUseAccountResponse>`  |  **HTTP:** `PUT /api/v1/agent/providers/{id}/auth/accounts/{key}/active`
**CLI:** `hoody agent providers accounts use`

---

### `client.agent.realms` (4) — API discovery and related-operation hints

#### `list` — List realms (for binding).

```typescript
client.agent.realms.list(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentRealmsListResponse>`  |  **HTTP:** `GET /api/v1/agent/realms`
**CLI:** `hoody agent realms list`

---

#### `listAll` — List realms (for binding). (collect all pages)

```typescript
client.agent.realms.listAll(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<(NonNullable<AgentRealmsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). Each item is `string`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/realms`
**CLI:** `hoody agent realms list`

---

#### `listIterator` — List realms (for binding). (async iterator)

```typescript
client.agent.realms.listIterator(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `AsyncGenerator<(NonNullable<AgentRealmsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page). Each item is `string`.  |  **HTTP:** `GET /api/v1/agent/realms`
**CLI:** `hoody agent realms list`

---

#### `use` — Switch the agent's active realm.

```typescript
client.agent.realms.use(data: AgentRealmsUseRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `AgentRealmsUseRequest` | body | Yes |  |

**Body:** `{ realm_id*: string }`

**Returns:** `Promise<AgentRealmsUseResponse>`  |  **HTTP:** `PUT /api/v1/agent/hoody/realm`
**CLI:** `hoody agent realms use`

---

### `client.agent.sessions` (51) — Create, drive, and tear down agent sessions

#### `cancelTasks` — Cancel all background tasks.

```typescript
client.agent.sessions.cancelTasks(id: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentSessionsCancelTasksResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/tasks/cancel`
**CLI:** `hoody agent sessions tasks cancel`

---

#### `claimApproverLease` — Acquire the right to answer this session's gates.

```typescript
client.agent.sessions.claimApproverLease(id: string, data: AgentSessionsClaimApproverLeaseRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsClaimApproverLeaseRequest` | body | Yes |  |

**Body:** `{ holder*: string, ttl_ms: int, replace: bool, lease: string }`

- `holder` — REQUIRED on acquire: an opaque per-caller id (1–64 printable ASCII, no spaces) that identifies THIS client as the holder (reported as `holder` on the event.gate_resolved stream event). Never a credential; an empty holder is 400.
- `replace` — Documentation only: a live lease is taken over ONLY by presenting its current capability as proof (X-Hoody-Approver-Lease or body.lease); replace:true without the proof is still 409 approver_lease_held. After expiry or release an acquire needs no proof.

**Returns:** `Promise<AgentSessionsClaimApproverLeaseResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/approver-lease`
**CLI:** `hoody agent sessions approver lease claim`

---

#### `claimAttachment` — Hold a live session (and its parked gate) alive.

```typescript
client.agent.sessions.claimAttachment(id: string, data?: AgentSessionsClaimAttachmentRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsClaimAttachmentRequest` | body | No |  |

**Body:** `{ ttl_ms: int }`

- `ttl_ms` — Requested lifetime in milliseconds (default 15m, capped at 60m).

**Returns:** `Promise<AgentSessionsClaimAttachmentResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/attachments`
**CLI:** `hoody agent sessions attachments claim`

---

#### `close` — Close the session (teardown).

```typescript
client.agent.sessions.close(id: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentSessionsCloseResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/close`
**CLI:** `hoody agent sessions close`

---

#### `connect` — Attach to a session's event stream (WebSocket / SSE).

```typescript
client.agent.sessions.connect(id: string, options?: { since?: number; incarnation?: string; LastEventID?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `since` | `number` | query | No | Resume from this gateway int64 seq (also accepted as the Last-Event-ID header). |
| `incarnation` | `string` | query | No | The incarnation the since cursor belongs to (from a frame, replay_boundary, or GET /sessions/{id}). When it differs from the live session's, the cursor is treated as invalid: a replay_gap frame, then the full retained ring. |
| `LastEventID` | `string` | header `Last-Event-ID` | No | SSE resume cursor — the gateway int64 seq to resume from (the in:header alias of ?since); sent automatically by an SSE client on reconnect. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentStreamSessionWebSocket>` — an unconnected wrapper: register handlers, then `await ws.connect()`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/stream`
**CLI:** `hoody agent sessions stream`

---

#### `create` — Create, fork, or attach a session.

```typescript
client.agent.sessions.create(data?: AgentSessionsCreateRequest, options?: { IdempotencyKey?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key returns the same receipt and never re-runs the turn; the same key with a different request body is 422. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsCreateRequest` | body | No |  |

**Body:** `{ realm: string, container: string, cwd: string, config_dir: string, model: string, agent: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", attach: string, fork: string, fork_turn_idx: int, backend: string, delegated_agent: string, headless: bool, approval: { mode: "" | "default" | "always", locked: bool }, expected_binding: { realm: string, container: string, cwd: string, backend: "" | "llm" | "acp" }, prompt_blocks: { contract: bool, transcripts: bool, frequent_files: bool, hook_context: bool, memory: bool, project_instructions: bool, agent_instructions: bool, team_rules: bool, skills: bool, workflows: bool, verbosity: bool, hoody_platform: bool, hoody_exec: bool, fleet_notice: bool }, model_settings: { thinking: object, temperature: number, max_tokens: int, response_format: object }, helper_gates: bool, outcome_claims: bool, frame_tools: bool }`

**Returns:** `Promise<AgentSessionsCreateResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions`
**CLI:** `hoody agent sessions create`

---

#### `delete` — Close (and optionally hard-delete) a session.

```typescript
client.agent.sessions.delete(id: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentDeleteSessionResponse>`  |  **HTTP:** `DELETE /api/v1/agent/sessions/{id}`
**CLI:** `hoody agent sessions delete`

---

#### `deleteApprovalRule` — Remove one session permission rule.

```typescript
client.agent.sessions.deleteApprovalRule(id: string, tool: string, options?: { IfMatch?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `tool` | `string` | path | Yes | The tool. |
| `IfMatch` | `string` | header `If-Match` | No | Conditional-request precondition: the ETag from GET /sessions/{id}/approval (a quoted policy revision, e.g. "3") or *. A mismatch is 412 precondition_failed. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentSessionsDeleteApprovalRuleResponse>`  |  **HTTP:** `DELETE /api/v1/agent/sessions/{id}/approval/rules/{tool}`
**CLI:** `hoody agent sessions approval rules delete`

---

#### `get` — Get a session summary.

```typescript
client.agent.sessions.get(id: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentSessionsGetResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}`
**CLI:** `hoody agent sessions get`

---

#### `getApproval` — Read a session's approval policy.

```typescript
client.agent.sessions.getApproval(id: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentSessionsGetApprovalResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/approval`
**CLI:** `hoody agent sessions approval get`

---

#### `getSnapshot` — Read a session's recoverable state.

```typescript
client.agent.sessions.getSnapshot(id: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentSessionsGetSnapshotResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/state`
**CLI:** `hoody agent sessions snapshot get`

---

#### `getTranscript` — Read a session's transcript without attaching.

```typescript
client.agent.sessions.getTranscript(id: string, options?: { after_turn?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `after_turn` | `number` | query | No | Exclusive completed-turn skip cursor: return content strictly after completed turn N (0 = full transcript; values past the end clamp; negative/non-integer = 400). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentSessionsGetTranscriptResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/transcript`
**CLI:** `hoody agent sessions transcript get`

---

#### `getUsage` — Read a session's per-call LLM usage.

```typescript
client.agent.sessions.getUsage(id: string, options?: { after_id?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `after_id` | `number` | query | No | Exclusive cursor: return rows whose id is greater than this. Omit (or 0) to start from the session's first row. Negative or non-integer = 400. |
| `limit` | `number` | query | No | Return at most this many rows (1 to 5000, default 500). Out of range or non-integer = 400. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentSessionsGetUsageResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/usage`
**CLI:** `hoody agent sessions usage get`

---

#### `getUsageAll` — Read a session's per-call LLM usage. (collect all pages)

```typescript
client.agent.sessions.getUsageAll(id: string, options?: { after_id?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `after_id` | `number` | query | No | Exclusive cursor: return rows whose id is greater than this. Omit (or 0) to start from the session's first row. Negative or non-integer = 400. |
| `limit` | `number` | query | No | Return at most this many rows (1 to 5000, default 500). Out of range or non-integer = 400. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<(NonNullable<AgentSessionsGetUsageResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`getUsage()` fetches one page). `getUsageIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/usage`
**CLI:** `hoody agent sessions usage get`

---

#### `getUsageIterator` — Read a session's per-call LLM usage. (async iterator)

```typescript
client.agent.sessions.getUsageIterator(id: string, options?: { after_id?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `after_id` | `number` | query | No | Exclusive cursor: return rows whose id is greater than this. Omit (or 0) to start from the session's first row. Negative or non-integer = 400. |
| `limit` | `number` | query | No | Return at most this many rows (1 to 5000, default 500). Out of range or non-integer = 400. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncGenerator<(NonNullable<AgentSessionsGetUsageResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`getUsage()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/usage`
**CLI:** `hoody agent sessions usage get`

---

#### `list` — List sessions.

```typescript
client.agent.sessions.list(options?: { include_system?: boolean; realm?: "global" | "all" | (string & {}); page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_system` | `boolean` | query | No | When true, also include daemon-owned system/resident sessions in the listing. |
| `realm` | `"global" \| "all" \| (string & {})` | query | No | The realm to list: "global" (sessions not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| "all" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentSessionsListResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions`
**CLI:** `hoody agent sessions list`

---

#### `listAll` — List sessions. (collect all pages)

```typescript
client.agent.sessions.listAll(options?: { include_system?: boolean; realm?: "global" | "all" | (string & {}); page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_system` | `boolean` | query | No | When true, also include daemon-owned system/resident sessions in the listing. |
| `realm` | `"global" \| "all" \| (string & {})` | query | No | The realm to list: "global" (sessions not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| "all" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<(NonNullable<AgentSessionsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/sessions`
**CLI:** `hoody agent sessions list`

---

#### `listApplicableRules` — Which tool-call rules apply.

```typescript
client.agent.sessions.listApplicableRules(id: string, options?: { agent?: string; tool?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `agent` | `string` | query | No | Agent name to ask about (default: the session's own agent). |
| `tool` | `string` | query | No | Tool name to ask about (default: any tool). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentSessionsListApplicableRulesResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/rules/applies`
**CLI:** `hoody agent sessions rules list`

---

#### `listDirectories` — List distinct session working directories.

```typescript
client.agent.sessions.listDirectories(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentSessionsListDirectoriesResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/cwds`
**CLI:** `hoody agent sessions directories list`

---

#### `listIterator` — List sessions. (async iterator)

```typescript
client.agent.sessions.listIterator(options?: { include_system?: boolean; realm?: "global" | "all" | (string & {}); page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_system` | `boolean` | query | No | When true, also include daemon-owned system/resident sessions in the listing. |
| `realm` | `"global" \| "all" \| (string & {})` | query | No | The realm to list: "global" (sessions not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| "all" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncGenerator<(NonNullable<AgentSessionsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/sessions`
**CLI:** `hoody agent sessions list`

---

#### `listLoops` — List a session's loops.

```typescript
client.agent.sessions.listLoops(id: string, options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentSessionsListLoopsResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/loops`
**CLI:** `hoody agent sessions loops list`

---

#### `listLoopsAll` — List a session's loops. (collect all pages)

```typescript
client.agent.sessions.listLoopsAll(id: string, options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<(NonNullable<AgentSessionsListLoopsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`listLoops()` fetches one page). `listLoopsIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/loops`
**CLI:** `hoody agent sessions loops list`

---

#### `listLoopsIterator` — List a session's loops. (async iterator)

```typescript
client.agent.sessions.listLoopsIterator(id: string, options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncGenerator<(NonNullable<AgentSessionsListLoopsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`listLoops()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/loops`
**CLI:** `hoody agent sessions loops list`

---

#### `listMcpTools` — List a session's MCP tools.

```typescript
client.agent.sessions.listMcpTools(id: string, options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentSessionsListMcpToolsResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tools/mcp`
**CLI:** `hoody agent sessions mcp tools list`

---

#### `listMcpToolsAll` — List a session's MCP tools. (collect all pages)

```typescript
client.agent.sessions.listMcpToolsAll(id: string, options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<(NonNullable<AgentSessionsListMcpToolsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`listMcpTools()` fetches one page). `listMcpToolsIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tools/mcp`
**CLI:** `hoody agent sessions mcp tools list`

---

#### `listMcpToolsIterator` — List a session's MCP tools. (async iterator)

```typescript
client.agent.sessions.listMcpToolsIterator(id: string, options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncGenerator<(NonNullable<AgentSessionsListMcpToolsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`listMcpTools()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tools/mcp`
**CLI:** `hoody agent sessions mcp tools list`

---

#### `listTools` — List a session's effective tool set.

```typescript
client.agent.sessions.listTools(id: string, options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentSessionsListToolsResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tools`
**CLI:** `hoody agent sessions tools list`

---

#### `listToolsAll` — List a session's effective tool set. (collect all pages)

```typescript
client.agent.sessions.listToolsAll(id: string, options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<(NonNullable<AgentSessionsListToolsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`listTools()` fetches one page). `listToolsIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tools`
**CLI:** `hoody agent sessions tools list`

---

#### `listToolsIterator` — List a session's effective tool set. (async iterator)

```typescript
client.agent.sessions.listToolsIterator(id: string, options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncGenerator<(NonNullable<AgentSessionsListToolsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`listTools()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tools`
**CLI:** `hoody agent sessions tools list`

---

#### `releaseApproverLease` — Release the approver lease.

```typescript
client.agent.sessions.releaseApproverLease(id: string, options?: { XHoodyApproverLease?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyApproverLease` | `string` | header `X-Hoody-Approver-Lease` | No | The approver-lease capability returned by POST /sessions/{id}/approver-lease. Required on every decision (/confirm, or the confirmed re-issue of a gated tool run) on an "always" session whose lease was minted; the daemon verifies it at decision consumption. On renew/release it names the lease to act on. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentSessionsReleaseApproverLeaseResponse>`  |  **HTTP:** `DELETE /api/v1/agent/sessions/{id}/approver-lease`
**CLI:** `hoody agent sessions approver lease release`

---

#### `releaseAttachment` — Release an attachment lease.

```typescript
client.agent.sessions.releaseAttachment(id: string, lease_id: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `lease_id` | `string` | path | Yes | The lease id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentSessionsReleaseAttachmentResponse>`  |  **HTTP:** `DELETE /api/v1/agent/sessions/{id}/attachments/{lease_id}`
**CLI:** `hoody agent sessions attachments release`

---

#### `rename` — Rename a session.

```typescript
client.agent.sessions.rename(id: string, data: AgentSessionsRenameRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsRenameRequest` | body | Yes |  |

**Body:** `{ name*: string }`

- `name` — The new title. An empty string clears it back to the automatic title. Required — omitting it is a 400, not a clear.

**Returns:** `Promise<AgentSessionsRenameResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}`
**CLI:** `hoody agent sessions rename`

---

#### `renewApproverLease` — Renew the approver lease.

```typescript
client.agent.sessions.renewApproverLease(id: string, data?: AgentSessionsRenewApproverLeaseRequest, options?: { XHoodyApproverLease?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyApproverLease` | `string` | header `X-Hoody-Approver-Lease` | No | The approver-lease capability returned by POST /sessions/{id}/approver-lease. Required on every decision (/confirm, or the confirmed re-issue of a gated tool run) on an "always" session whose lease was minted; the daemon verifies it at decision consumption. On renew/release it names the lease to act on. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsRenewApproverLeaseRequest` | body | No |  |

**Body:** `{ ttl_ms: int, lease: string }`

**Returns:** `Promise<AgentSessionsRenewApproverLeaseResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/approver-lease`
**CLI:** `hoody agent sessions approver lease renew`

---

#### `renewAttachment` — Renew an attachment lease.

```typescript
client.agent.sessions.renewAttachment(id: string, lease_id: string, data?: AgentSessionsRenewAttachmentRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `lease_id` | `string` | path | Yes | The lease id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsRenewAttachmentRequest` | body | No |  |

**Body:** `{ ttl_ms: int }`

- `ttl_ms` — New lifetime in milliseconds from now (default 15m, capped at 60m).

**Returns:** `Promise<AgentSessionsRenewAttachmentResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/attachments/{lease_id}`
**CLI:** `hoody agent sessions attachments renew`

---

#### `replay` — Replay a live session's buffered events.

```typescript
client.agent.sessions.replay(id: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentSessionsReplayResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/replay`
**CLI:** `hoody agent sessions replay`

---

#### `runTool` — Run a tool inside a live session (gated).

```typescript
client.agent.sessions.runTool(id: string, name: string, data?: AgentSessionsRunToolRequest, options?: { confirm?: boolean; confirm_token?: string; XHoodyApproverLease?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `name` | `string` | path | Yes | The name. |
| `confirm` | `boolean` | query | No | Query alias of the body `confirm` field — re-issue a previously-parked confirmation (pair with confirm_token). |
| `confirm_token` | `string` | query | No | Query alias of the body `confirm_token` field — the single-use token returned in the 409 tool_needs_confirmation details. |
| `XHoodyApproverLease` | `string` | header `X-Hoody-Approver-Lease` | No | The approver-lease capability returned by POST /sessions/{id}/approver-lease. Required on every decision (/confirm, or the confirmed re-issue of a gated tool run) on an "always" session whose lease was minted; the daemon verifies it at decision consumption. On renew/release it names the lease to act on. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsRunToolRequest` | body | No |  |

**Body:** `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }`

- `confirm` — Re-issue a previously-parked confirmation. MUST be paired with the confirm_token from the prior 409; a bare confirm:true with no valid token does NOT bypass the gate (it re-parks). A wire confirmed key in params is always scrubbed.
- `confirm_token` — The single-use token returned in the 409 tool_needs_confirmation details. Bound to the tool/session/params it was minted for; present it with confirm:true and the echoed params to approve the parked run.
- `allow_mutations` — Sessionless only: opt a non-read-only tool into running with every permission check applied (else a sessionless mutating run is refused 400 tool_mutation_refused).

**Returns:** `Promise<AgentSessionsRunToolResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/tools/{name}/run`
**CLI:** `hoody agent sessions tools run`

---

#### `setAfterCompaction` — Set the message re-added after every compaction.

```typescript
client.agent.sessions.setAfterCompaction(id: string, data: AgentSessionsSetAfterCompactionRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsSetAfterCompactionRequest` | body | Yes |  |

**Body:** `{ text*: string }`

- `text` — The message text, at most 16384 bytes in UTF-8. Empty or whitespace-only removes the message.

**Returns:** `Promise<AgentSessionsSetAfterCompactionResponse>`  |  **HTTP:** `PUT /api/v1/agent/sessions/{id}/after-compaction`
**CLI:** `hoody agent sessions aftercompaction set`

---

#### `setAgent` — Switch the chat agent.

```typescript
client.agent.sessions.setAgent(id: string, data?: AgentSessionsSetAgentRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsSetAgentRequest` | body | No |  |

**Body:** `{ agent: string }`

- `agent` — Chat-agent name to switch to. The bot agent is refused 400 bad_request (details.field agent) on every session: it runs only inside a Bot (POST /bots).

**Returns:** `Promise<AgentSessionsSetAgentResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/agent`
**CLI:** `hoody agent sessions agent set`

---

#### `setApprovalRule` — Set one session permission rule.

```typescript
client.agent.sessions.setApprovalRule(id: string, tool: string, data: AgentSessionsSetApprovalRuleRequest, options?: { IfMatch?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `tool` | `string` | path | Yes | The tool. |
| `IfMatch` | `string` | header `If-Match` | No | Conditional-request precondition: the ETag from GET /sessions/{id}/approval (a quoted policy revision, e.g. "3") or *. A mismatch is 412 precondition_failed. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsSetApprovalRuleRequest` | body | Yes |  |

**Body:** `{ decision*: "allow" | "deny" }`

**Returns:** `Promise<AgentSessionsSetApprovalRuleResponse>`  |  **HTTP:** `PUT /api/v1/agent/sessions/{id}/approval/rules/{tool}`
**CLI:** `hoody agent sessions approval rules set`

---

#### `setAutoReply` — Arm/disarm the auto-reply loop.

```typescript
client.agent.sessions.setAutoReply(id: string, data?: AgentSessionsSetAutoReplyRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsSetAutoReplyRequest` | body | No |  |

**Body:** `{ armed: bool, rounds: int, model: string, allow_writes: bool }`

**Returns:** `Promise<AgentSessionsSetAutoReplyResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/auto-reply`
**CLI:** `hoody agent sessions autoreply set`

---

#### `setAutoReplyWrites` — Flip the auto-reply write opt-in.

```typescript
client.agent.sessions.setAutoReplyWrites(id: string, data?: AgentSessionsSetAutoReplyWritesRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsSetAutoReplyWritesRequest` | body | No |  |

**Body:** `{ allow_writes: bool }`

**Returns:** `Promise<AgentSessionsSetAutoReplyWritesResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/auto-reply/writes`
**CLI:** `hoody agent sessions autoreply writes set`

---

#### `setEffort` — Set reasoning effort.

```typescript
client.agent.sessions.setEffort(id: string, data?: AgentSessionsSetEffortRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsSetEffortRequest` | body | No |  |

**Body:** `{ effort: "" | "low" | "medium" | "high" | "xhigh" | "max" }`

- `effort` — low|medium|high|xhigh|max, or "" for the model default. Any other value is 400 bad_request (details.field effort).

**Returns:** `Promise<AgentSessionsSetEffortResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/effort`
**CLI:** `hoody agent sessions effort set`

---

#### `setHoodyEnv` — Toggle Hoody shell-env injection.

```typescript
client.agent.sessions.setHoodyEnv(id: string, data?: AgentSessionsSetHoodyEnvRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsSetHoodyEnvRequest` | body | No |  |

**Body:** `{ enabled: bool }`

**Returns:** `Promise<AgentSessionsSetHoodyEnvResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/hoody-env`
**CLI:** `hoody agent sessions env set`

---

#### `setModel` — Switch the session model.

```typescript
client.agent.sessions.setModel(id: string, data: AgentSessionsSetModelRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsSetModelRequest` | body | Yes |  |

**Body:** `{ model*: string }`

- `model` — Model spec to switch to (provider-prefixed, e.g. anthropic/claude-opus-4-8, or fusion/<slug>). Required — a blank value is rejected, never a silent no-op.

**Returns:** `Promise<AgentSessionsSetModelResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/model`
**CLI:** `hoody agent sessions model set`

---

#### `setVerbosity` — Set response verbosity.

```typescript
client.agent.sessions.setVerbosity(id: string, data?: AgentSessionsSetVerbosityRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsSetVerbosityRequest` | body | No |  |

**Body:** `{ level: "normal" | "concise" | "terse" | "minimal" }`

- `level` — normal|concise|terse|minimal. Any other value is 400 bad_request (details.field level); the applied level is echoed on the stream as event.verbosity.

**Returns:** `Promise<AgentSessionsSetVerbosityResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/verbosity`
**CLI:** `hoody agent sessions verbosity set`

---

#### `setYolo` — Arm or disarm YOLO auto-approve.

```typescript
client.agent.sessions.setYolo(id: string, data: AgentSessionsSetYoloRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsSetYoloRequest` | body | Yes |  |

**Body:** `{ enabled*: bool }`

**Returns:** `Promise<AgentSessionsSetYoloResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/yolo`
**CLI:** `hoody agent sessions yolo set`

---

#### `startTurn` — Dispatch a turn (fire-and-observe).

```typescript
client.agent.sessions.startTurn(id: string, data: AgentSessionsStartTurnRequest, options?: { IdempotencyKey?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key returns the same receipt and never re-runs the turn; the same key with a different request body is 422. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsStartTurnRequest` | body | Yes |  |

**Body:** `{ text*: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", attachments: { type*: "image", media_type*: string, data*: string, name: string }[] }`

- `text` — Required (may be empty only with attachments). The user message text for this turn: empty or whitespace-only text with no attachments is refused (400 empty_prompt) and no turn runs.
- `tool_mode` — Optional per-turn tool mode override: standard or orchestrator. Any other value is refused 400 invalid_tool_mode.
- `dir_scope` — Optional per-turn directory-access scope override: home or full. Any other value is refused 400 invalid_dir_scope.
- `attachments` — … At most 4 per turn, each at most 4 MiB DECODED (~5.33 MiB of base64); the request body limit applies on top and is authoritative, so several individually-legal images can still exceed it. A violation is refused with 400 BEFORE the turn is accepted — nothing is silently dropped. `path` is not supported here: it would name a file on the CALLER's machine, and a path-bearing attachment is discarded outright on a container-bound session. If the active model cannot accept images the daemon reports that on the session stream.

**Returns:** `Promise<AgentSessionsStartTurnResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/messages`
**CLI:** `hoody agent sessions turns start`

---

#### `startTurnAndStream` — Dispatch a turn and stream the response.

```typescript
client.agent.sessions.startTurnAndStream(id: string, data: AgentSessionsStartTurnAndStreamRequest, options?: { policy?: string; XHoodyGatePolicy?: string; IdempotencyKey?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `policy` | `string` | query | No | auto_approve auto-answers confirm gates for the life of the stream (alias of the X-Hoody-Gate-Policy header); off by default; the gateway asks for no separate credentials to use it; access is decided by the container's proxy permission policy. |
| `XHoodyGatePolicy` | `string` | header `X-Hoody-Gate-Policy` | No | Confirm-gate posture: "auto_approve" adopts the headless auto-answer posture (off by default; the in:query alias is ?policy=). Any other value is rejected 400. |
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Opaque retry key (1–255 printable ASCII, no whitespace). The turn runs at most once per key: a retry is 409 replay_unavailable with the turn's receipt (details.turn), never a re-run and never a second stream; the same key with a different request body is 422. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsStartTurnAndStreamRequest` | body | Yes |  |

**Body:** `{ text*: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", attachments: { type*: "image", media_type*: string, data*: string, name: string }[] }`

- `text` — Required (may be empty only with attachments). The user message text for this turn: empty or whitespace-only text with no attachments is refused (400 empty_prompt) and no turn runs.
- `tool_mode` — Optional per-turn tool mode override: standard or orchestrator. Any other value is refused 400 invalid_tool_mode.
- `dir_scope` — Optional per-turn directory-access scope override: home or full. Any other value is refused 400 invalid_dir_scope.
- `attachments` — … At most 4 per turn, each at most 4 MiB DECODED (~5.33 MiB of base64); the request body limit applies on top and is authoritative, so several individually-legal images can still exceed it. A violation is refused with 400 BEFORE the turn is accepted — nothing is silently dropped. `path` is not supported here: it would name a file on the CALLER's machine, and a path-bearing attachment is discarded outright on a container-bound session. If the active model cannot accept images the daemon reports that on the session stream.

**Returns:** `Promise<IEventStream<{ XHoodyTurnId?: string; }, ITypedStreamEvent<AgentSessionsStartTurnAndStreamFrames>>>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/prompt:stream`
**CLI:** `hoody agent sessions turns start`

---

#### `startWorkflow` — Run a workflow onto an existing session.

```typescript
client.agent.sessions.startWorkflow(id: string, name: string, data?: AgentSessionsStartWorkflowRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsStartWorkflowRequest` | body | No |  |

**Body:** `{ prompt: string, inputs: { [key: string]: string } }`

- `inputs` — Optional run-time values for the workflow's DECLARED input parameters (declared name → string value; resolves to $(input.<name>) in every step). A workflow with a REQUIRED declared parameter cannot run without these. Values must be strings; a non-string value is a 400.

**Returns:** `Promise<AgentSessionsStartWorkflowResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/workflows/{name}/runs`
**CLI:** `hoody agent sessions workflows start`

---

#### `trim` — Trim session history to a turn index.

```typescript
client.agent.sessions.trim(id: string, data?: AgentSessionsTrimRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsTrimRequest` | body | No |  |

**Body:** `{ turn_idx: int }`

**Returns:** `Promise<AgentSessionsTrimResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/trim`
**CLI:** `hoody agent sessions trim`

---

#### `updateApproval` — Set a session's approval mode and lock.

```typescript
client.agent.sessions.updateApproval(id: string, data?: AgentSessionsUpdateApprovalRequest, options?: { IfMatch?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `IfMatch` | `string` | header `If-Match` | No | Conditional-request precondition: the ETag from GET /sessions/{id}/approval (a quoted policy revision, e.g. "3") or *. A mismatch is 412 precondition_failed. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsUpdateApprovalRequest` | body | No |  |

**Body:** `{ mode: "default" | "always", locked: bool }`

**Returns:** `Promise<AgentSessionsUpdateApprovalResponse>`  |  **HTTP:** `PUT /api/v1/agent/sessions/{id}/approval`
**CLI:** `hoody agent sessions approval update`

---

### `client.agent.sessions.commands` (2) — Create, drive, and tear down agent sessions

#### `get` — Get a command's receipt.

```typescript
client.agent.sessions.commands.get(id: string, command_id: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `command_id` | `string` | path | Yes | The command id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentSessionsCommandsGetResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/commands/{command_id}`
**CLI:** `hoody agent sessions commands get`

---

#### `send` — Send a message, an interrupt or a stop to a session.

```typescript
client.agent.sessions.commands.send(id: string, data: AgentSessionsCommandsSendRequest, options?: { IdempotencyKey?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Retry key, required on this route; the SDK and CLI send one automatically. 1–255 printable ASCII, no whitespace. A retry with the same key and command returns the stored receipt and admits nothing; the same key with a different command is 422. The key is remembered while the command waits and for 24 hours after it settled. Past 4096 remembered keys a new key is 429 idempotency_keys_exhausted; a stop is never refused because of the remembered-key limit. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsCommandsSendRequest` | body | Yes |  |

**Body:** `{ kind*: "message" | "interrupt" | "stop", text: string, close: bool, on_gate: "deny" | "wait", order: int, from: { kind*: "user" | "bot" | "delegate" | "system", id: string }, trigger: "human" | "wake" | "clear" }`

- `text` — The message (message and interrupt: required, non-empty, at most 32 KiB). Delivered verbatim. A stop takes none.
- `order` — Optional, at least 0: a sequence number for one caller's commands. A message or interrupt with a lower order than a stop already received is superseded.
- `from` — Optional: who sends it. … Set it only when your client relays a message on someone's behalf (a Bot runtime, a session forwarding to another); a client sending a person's own message leaves it out, which reads as from the user.

**Returns:** `Promise<AgentSessionsCommandsSendResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/commands`
**CLI:** `hoody agent sessions commands send`

---

### `client.agent.sessions.turns` (5) — Create, drive, and tear down agent sessions

#### `cancel` — Cancel the active turn (Esc), or one named turn.

```typescript
client.agent.sessions.turns.cancel(id: string, data?: AgentSessionsTurnsCancelRequest, options?: { turn_id?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `turn_id` | `string` | query | No | Cancel only this turn (alternative to the body field). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsTurnsCancelRequest` | body | No |  |

**Body:** `{ turn_id: string }`

**Returns:** `Promise<AgentSessionsTurnsCancelResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/cancel`
**CLI:** `hoody agent sessions turns cancel`

---

#### `create` — Dispatch a turn (retry-safe).

```typescript
client.agent.sessions.turns.create(id: string, data: AgentSessionsTurnsCreateRequest, options?: { IdempotencyKey?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key returns the same receipt and never re-runs the turn; the same key with a different request body is 422. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsTurnsCreateRequest` | body | Yes |  |

**Body:** `{ text*: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", attachments: { type*: "image", media_type*: string, data*: string, name: string }[] }`

- `text` — Required (may be empty only with attachments). The user message text for this turn: empty or whitespace-only text with no attachments is refused (400 empty_prompt) and no turn runs.
- `tool_mode` — Optional per-turn tool mode override: standard or orchestrator. Any other value is refused 400 invalid_tool_mode.
- `dir_scope` — Optional per-turn directory-access scope override: home or full. Any other value is refused 400 invalid_dir_scope.
- `attachments` — … At most 4 per turn, each at most 4 MiB DECODED (~5.33 MiB of base64); the request body limit applies on top and is authoritative, so several individually-legal images can still exceed it. A violation is refused with 400 BEFORE the turn is accepted — nothing is silently dropped. `path` is not supported here: it would name a file on the CALLER's machine, and a path-bearing attachment is discarded outright on a container-bound session. If the active model cannot accept images the daemon reports that on the session stream.

**Returns:** `Promise<AgentSessionsTurnsCreateResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/turns`
**CLI:** `hoody agent sessions turns create`

---

#### `get` — Get a turn's durable receipt.

```typescript
client.agent.sessions.turns.get(id: string, turn_id: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `turn_id` | `string` | path | Yes | The turn id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentSessionsTurnsGetResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/turns/{turn_id}`
**CLI:** `hoody agent sessions turns get`

---

#### `list` — List a session's durable turn receipts.

```typescript
client.agent.sessions.turns.list(id: string, options?: { limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `limit` | `number` | query | No | Return at most this many receipts, newest first (1–1000). A cap, not a page size: there is no next page. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentSessionsTurnsListResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/turns`
**CLI:** `hoody agent sessions turns list`

---

#### `run` — Dispatch a turn and block until it ends (no reply text: read it from the transcript)

```typescript
client.agent.sessions.turns.run(id: string, data: AgentSessionsTurnsRunRequest, options?: { policy?: string; XHoodyGatePolicy?: string; IdempotencyKey?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `policy` | `string` | query | No | auto_approve adopts the headless auto-answer posture (alias of the X-Hoody-Gate-Policy header); off by default; the gateway asks for no separate credentials to use it; access is decided by the container's proxy permission policy. |
| `XHoodyGatePolicy` | `string` | header `X-Hoody-Gate-Policy` | No | Confirm-gate posture: "auto_approve" adopts the headless auto-answer posture (off by default; the in:query alias is ?policy=). Any other value is rejected 400. |
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Opaque retry key (1–255 printable ASCII, no whitespace). The turn runs at most once per key: a retry answers 200 duplicate:true with the turn's outcome (or pending_turn while it still runs) and never re-runs it; the same key with a different request body is 422. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSessionsTurnsRunRequest` | body | Yes |  |

**Body:** `{ text*: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", attachments: { type*: "image", media_type*: string, data*: string, name: string }[] }`

- `text` — Required (may be empty only with attachments). The user message text for this turn: empty or whitespace-only text with no attachments is refused (400 empty_prompt) and no turn runs.
- `tool_mode` — Optional per-turn tool mode override: standard or orchestrator. Any other value is refused 400 invalid_tool_mode.
- `dir_scope` — Optional per-turn directory-access scope override: home or full. Any other value is refused 400 invalid_dir_scope.
- `attachments` — … At most 4 per turn, each at most 4 MiB DECODED (~5.33 MiB of base64); the request body limit applies on top and is authoritative, so several individually-legal images can still exceed it. A violation is refused with 400 BEFORE the turn is accepted — nothing is silently dropped. `path` is not supported here: it would name a file on the CALLER's machine, and a path-bearing attachment is discarded outright on a container-bound session. If the active model cannot accept images the daemon reports that on the session stream.

**Returns:** `Promise<AgentSessionsTurnsRunResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/prompt:sync`
**CLI:** `hoody agent sessions turns run`

---

### `client.agent.settings` (2) — Process-wide settings (home settings.json)

#### `get` — Get settings.

```typescript
client.agent.settings.get(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentSettingsGetResponse>`  |  **HTTP:** `GET /api/v1/agent/settings`
**CLI:** `hoody agent settings get`

---

#### `update` — Patch settings.

```typescript
client.agent.settings.update(data: AgentSettingsUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `AgentSettingsUpdateRequest` | body | Yes |  |

**Body:** `{ patch*: object }`

**Returns:** `Promise<AgentSettingsUpdateResponse>`  |  **HTTP:** `PATCH /api/v1/agent/settings`
**CLI:** `hoody agent settings update`

---

### `client.agent.skills` (13) — Reusable agent skill definitions

#### `create` — Create a skill.

```typescript
client.agent.skills.create(data: AgentSkillsCreateRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSkillsCreateRequest` | body | Yes |  |

**Body:** `{ name*: string }`

- `name` — Skill name (also the SKILL.md directory stem, and the frontmatter `name`). Must not collide with an existing skill in any root.

**Returns:** `Promise<AgentSkillsCreateResponse>`  |  **HTTP:** `POST /api/v1/agent/skills`
**CLI:** `hoody agent skills create`

---

#### `delete` — Delete a skill.

```typescript
client.agent.skills.delete(data: AgentSkillsDeleteRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSkillsDeleteRequest` | body | Yes |  |

**Body:** `{ root_dir*: string, rel_dir*: string }`

**Returns:** `Promise<AgentSkillsDeleteResponse>`  |  **HTTP:** `POST /api/v1/agent/skills/delete`
**CLI:** `hoody agent skills delete`

---

#### `disable` — Enable/disable a skill.

```typescript
client.agent.skills.disable(data: Omit<AgentToggleSkillRequest, "disabled">, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `Omit<AgentToggleSkillRequest, "disabled">` | body | Yes |  |

**Body:** `{ name*: string }`

**Fixed by the method:** the method sets `disabled: true`; do not pass `disabled`.

**Returns:** `Promise<AgentToggleSkillResponse>`  |  **HTTP:** `POST /api/v1/agent/skills/toggle`
**CLI:** `hoody agent skills disable`

---

#### `enable` — Enable/disable a skill.

```typescript
client.agent.skills.enable(data: Omit<AgentToggleSkillRequest, "disabled">, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `Omit<AgentToggleSkillRequest, "disabled">` | body | Yes |  |

**Body:** `{ name*: string }`

**Fixed by the method:** the method sets `disabled: false`; do not pass `disabled`.

**Returns:** `Promise<AgentToggleSkillResponse>`  |  **HTTP:** `POST /api/v1/agent/skills/toggle`
**CLI:** `hoody agent skills enable`

---

#### `getSource` — Read a skill's source.

```typescript
client.agent.skills.getSource(options?: { root_dir?: string; rel_dir?: string; root?: string; rel?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `root_dir` | `string` | query | No | Skill root directory (identity; alias: root). |
| `rel_dir` | `string` | query | No | Skill relative directory (identity; alias: rel). |
| `root` | `string` | query | No | Friendly alias of root_dir (translated to root_dir server-side). |
| `rel` | `string` | query | No | Friendly alias of rel_dir (translated to rel_dir server-side). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentSkillsGetSourceResponse>`  |  **HTTP:** `GET /api/v1/agent/skills/source`
**CLI:** `hoody agent skills source get`

---

#### `import` — Apply a skill import.

```typescript
client.agent.skills.import(data: AgentSkillsImportRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSkillsImportRequest` | body | Yes |  |

**Body:** `{ source*: "claude" | "codex", items*: { source: string, rel_dir: string }[], overwrite: bool }`

- `items` — The selected scan entries to import. At least one is required.

**Returns:** `Promise<AgentSkillsImportResponse>`  |  **HTTP:** `POST /api/v1/agent/skills/import/apply`
**CLI:** `hoody agent skills import`

---

#### `list` — List skills.

```typescript
client.agent.skills.list(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentSkillsListResponse>`  |  **HTTP:** `GET /api/v1/agent/skills`
**CLI:** `hoody agent skills list`

---

#### `listAll` — List skills. (collect all pages)

```typescript
client.agent.skills.listAll(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<(NonNullable<AgentSkillsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/skills`
**CLI:** `hoody agent skills list`

---

#### `listIterator` — List skills. (async iterator)

```typescript
client.agent.skills.listIterator(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncGenerator<(NonNullable<AgentSkillsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/skills`
**CLI:** `hoody agent skills list`

---

#### `rename` — Rename a skill.

```typescript
client.agent.skills.rename(data: AgentSkillsRenameRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSkillsRenameRequest` | body | Yes |  |

**Body:** `{ root_dir*: string, rel_dir*: string, new_name*: string }`

**Returns:** `Promise<AgentSkillsRenameResponse>`  |  **HTTP:** `POST /api/v1/agent/skills/rename`
**CLI:** `hoody agent skills rename`

---

#### `scan` — Scan for importable skills.

```typescript
client.agent.skills.scan(options: { source: "claude" | "codex"; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source` | `"claude" \| "codex"` | query | Yes | Which tool's skills to scan. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |

**Returns:** `Promise<AgentSkillsScanResponse>`  |  **HTTP:** `GET /api/v1/agent/skills/import/scan`
**CLI:** `hoody agent skills scan`

---

#### `setSource` — Write a skill's source.

```typescript
client.agent.skills.setSource(data: AgentSkillsSetSourceRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSkillsSetSourceRequest` | body | Yes |  |

**Body:** `{ root_dir*: string, rel_dir*: string, content*: string, base_gen: int }`

- `base_gen` — Optional: the `gen` returned by `agent.skills.getSource` (or a previous `agent.skills.setSource`). A save whose SKILL.md changed since is refused 409 revision_conflict (details.current_gen) and writes nothing. Omit or pass 0 to save unconditionally.

**Returns:** `Promise<AgentSkillsSetSourceResponse>`  |  **HTTP:** `PUT /api/v1/agent/skills/source`
**CLI:** `hoody agent skills source set`

---

#### `trust` — Set a skill's trust state.

```typescript
client.agent.skills.trust(data: AgentSkillsTrustRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSkillsTrustRequest` | body | Yes |  |

**Body:** `{ root_dir*: string, rel_dir*: string, trusted*: bool }`

**Returns:** `Promise<AgentSkillsTrustResponse>`  |  **HTTP:** `POST /api/v1/agent/skills/trust`
**CLI:** `hoody agent skills trust`

---

### `client.agent.skills.hub` (5) — Reusable agent skill definitions

#### `clearCache` — Clear the skill hub cache.

```typescript
client.agent.skills.hub.clearCache(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |

**Returns:** `Promise<AgentSkillsHubClearCacheResponse>`  |  **HTTP:** `DELETE /api/v1/agent/skills/hub/cache`
**CLI:** `hoody agent skills hub cache clear`

---

#### `getCacheStats` — Skill hub cache stats.

```typescript
client.agent.skills.hub.getCacheStats(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |

**Returns:** `Promise<AgentSkillsHubGetCacheStatsResponse>`  |  **HTTP:** `GET /api/v1/agent/skills/hub/cache`
**CLI:** `hoody agent skills hub cache stats`

---

#### `install` — Install a hub skill.

```typescript
client.agent.skills.hub.install(data: AgentSkillsHubInstallRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentSkillsHubInstallRequest` | body | Yes |  |

**Body:** `{ package_digest*: string, overwrite: bool }`

- `package_digest` — The `package_digest` `agent.skills.hub.preview` returned. The install takes exactly that cached package, so preview first; a digest no longer in the cache is refused (preview again).
- `overwrite` — Replace a skill already installed under the same name. Without it (default false) such an install is refused.

**Returns:** `Promise<AgentSkillsHubInstallResponse>`  |  **HTTP:** `POST /api/v1/agent/skills/hub/install`
**CLI:** `hoody agent skills hub install`

---

#### `preview` — Preview a hub skill.

```typescript
client.agent.skills.hub.preview(options: { provider: string; source: string; skill_id: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `provider` | `string` | query | Yes | Hub provider of the skill (a search result's ref.provider). |
| `source` | `string` | query | Yes | Source of the skill on the hub, such as owner/repo (a search result's ref.source). |
| `skill_id` | `string` | query | Yes | Hub skill id (a search result's ref.skill_id). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |

**Returns:** `Promise<AgentSkillsHubPreviewResponse>`  |  **HTTP:** `GET /api/v1/agent/skills/hub/preview`
**CLI:** `hoody agent skills hub preview`

---

#### `search` — Search the skill hub.

```typescript
client.agent.skills.hub.search(options: { query: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `query` | `string` | query | Yes | Search text. Required and non-empty. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |

**Returns:** `Promise<AgentSkillsHubSearchResponse>`  |  **HTTP:** `GET /api/v1/agent/skills/hub/search`
**CLI:** `hoody agent skills hub search`

---

### `client.agent.stats` (1) — Per-session and aggregate usage counters

#### `get` — Cross-session statistics.

```typescript
client.agent.stats.get(options?: { scope?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `scope` | `string` | query | No | cwd (default) rolls up the current working directory; all rolls up every session. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentStatsGetResponse>`  |  **HTTP:** `GET /api/v1/agent/statistics`
**CLI:** `hoody agent stats`

---

### `client.agent.tasks` (3) — Background task management

#### `cancel` — Cancel a background task.

```typescript
client.agent.tasks.cancel(id: string, tid: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `tid` | `string` | path | Yes | The task id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentTasksCancelResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/tasks/{tid}/cancel`
**CLI:** `hoody agent tasks cancel`

---

#### `getTranscript` — Read a background task's transcript.

```typescript
client.agent.tasks.getTranscript(id: string, tid: string, options?: { after_seq?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `tid` | `string` | path | Yes | The task id. |
| `after_seq` | `number` | query | No | Exclusive int64 upsert-poll cursor: entries with seq strictly greater than it, plus any still-OPEN entry regardless of its seq. Omit for the whole transcript (distinct from 0, which skips a closed seq-0 entry). Negative/non-integer = 400. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentTasksGetTranscriptResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tasks/{tid}/transcript`
**CLI:** `hoody agent tasks transcript get`

---

#### `list` — List a session's background tasks.

```typescript
client.agent.tasks.list(id: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentTasksListResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tasks`
**CLI:** `hoody agent tasks list`

---

### `client.agent.todos` (19) — Container-aware task list management

#### `approveProposal` — Approve a todo proposal.

```typescript
client.agent.todos.approveProposal(id: string, pid: string, data?: AgentTodosApproveProposalRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `pid` | `string` | path | Yes | The proposal id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentTodosApproveProposalRequest` | body | No |  |

**Returns:** `Promise<AgentTodosApproveProposalResponse>`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/proposals/{pid}/approve`
**CLI:** `hoody agent todos proposals approve`

---

#### `archive` — Archive a todo.

```typescript
client.agent.todos.archive(id: string, data: AgentTodosArchiveRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentTodosArchiveRequest` | body | Yes |  |

**Body:** `{ revision*: int }`

- `revision` — The TODO's own current `revision` (from `agent.todos.get`); required — a stale or absent value is rejected.

**Returns:** `Promise<AgentTodosArchiveResponse>`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/archive`
**CLI:** `hoody agent todos archive`

---

#### `cancel` — Cancel a todo's run.

```typescript
client.agent.todos.cancel(id: string, data?: AgentTodosCancelRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentTodosCancelRequest` | body | No |  |

**Returns:** `Promise<AgentTodosCancelResponse>`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/cancel-run`
**CLI:** `hoody agent todos cancel`

---

#### `claim` — Claim a todo.

```typescript
client.agent.todos.claim(id: string, data: AgentTodosClaimRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentTodosClaimRequest` | body | Yes |  |

**Body:** `{ session_id*: string, run_id: string, revision: int }`

- `session_id` — Identity that will OWN the lease — required and non-empty. `agent.todos.release` must present the same value; while the lease is live another session_id cannot claim the todo.
- `revision` — … CONDITIONALLY required: a FRESH claim (no live lease, or a lease held by another session_id) must carry it — omitted means revision 0 and the CAS refuses the claim (409 todo_conflict) — while the lease's CURRENT owner re-claiming to refresh its TTL may omit it (the daemon waives the CAS for the owner). It is not in the schema's required list only because of that second case.

**Returns:** `Promise<AgentTodosClaimResponse>`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/claim`
**CLI:** `hoody agent todos claim`

---

#### `create` — File a todo.

```typescript
client.agent.todos.create(data: AgentTodosCreateRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentTodosCreateRequest` | body | Yes |  |

**Body:** `{ title*: string, body: string, priority: int, tags: string[], cwd: string }`

- `priority` — Optional priority band 0..4 (0 = P0 urgent … 4 = P4 someday); defaults to 2 when omitted. Must be a JSON integer in range — a string or out-of-range value is rejected.
- `cwd` — The todo's working directory (labels the record's computer/path). Defaults to the X-Hoody-Cwd request-scope header when omitted; one of the two must be set.

**Returns:** `Promise<AgentTodosCreateResponse>`  |  **HTTP:** `POST /api/v1/agent/todos`
**CLI:** `hoody agent todos create`

---

#### `createComment` — Comment on a todo.

```typescript
client.agent.todos.createComment(id: string, data: AgentTodosCreateCommentRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentTodosCreateCommentRequest` | body | Yes |  |

**Body:** `{ text*: string }`

**Returns:** `Promise<AgentTodosCreateCommentResponse>`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/messages`
**CLI:** `hoody agent todos comments create`

---

#### `denyProposal` — Deny a todo proposal.

```typescript
client.agent.todos.denyProposal(id: string, pid: string, data?: AgentTodosDenyProposalRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `pid` | `string` | path | Yes | The proposal id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentTodosDenyProposalRequest` | body | No |  |

**Returns:** `Promise<AgentTodosDenyProposalResponse>`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/proposals/{pid}/deny`
**CLI:** `hoody agent todos proposals deny`

---

#### `get` — Read a todo.

```typescript
client.agent.todos.get(id: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentTodosGetResponse>`  |  **HTTP:** `GET /api/v1/agent/todos/{id}`
**CLI:** `hoody agent todos get`

---

#### `getRevision` — Get the todos store revision.

```typescript
client.agent.todos.getRevision(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentTodosGetRevisionResponse>`  |  **HTTP:** `GET /api/v1/agent/todos/revision`
**CLI:** `hoody agent todos revision get`

---

#### `list` — List todos.

```typescript
client.agent.todos.list(options?: { states?: ("inbox" | "ready" | "blocked" | "in_progress" | "review" | "done" | "dropped")[]; tags?: string[]; query?: string; open_only?: boolean; all?: boolean; sort?: "default" | "closed_at"; realm?: "global" | "all" | (string & {}); page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `states` | `("inbox" \| "ready" \| "blocked" \| "in_progress" \| "review" \| "done" \| "dropped")[]` | query | No | Only todos in one of these states. Repeat the parameter for several (?states=ready&states=blocked). |
| `tags` | `string[]` | query | No | Only todos carrying these tags. Repeat the parameter for several (?tags=a&tags=b). |
| `query` | `string` | query | No | Free-text filter over title/body. |
| `open_only` | `boolean` | query | No | When true, only open (non-terminal) todos. |
| `all` | `boolean` | query | No | When true, include archived/closed todos. |
| `sort` | `"default" \| "closed_at"` | query | No | List order. `default` (or omitted): open todos first, then priority, rank, number. `closed_at`: closed todos by `closed_at`, newest first; todos without a `closed_at` follow in the default order. Any other value is 400. |
| `realm` | `"global" \| "all" \| (string & {})` | query | No | The realm to list: "global" (todos not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| "all" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentTodosListResponse>`  |  **HTTP:** `GET /api/v1/agent/todos`
**CLI:** `hoody agent todos list`

---

#### `listAll` — List todos. (collect all pages)

```typescript
client.agent.todos.listAll(options?: { states?: ("inbox" | "ready" | "blocked" | "in_progress" | "review" | "done" | "dropped")[]; tags?: string[]; query?: string; open_only?: boolean; all?: boolean; sort?: "default" | "closed_at"; realm?: "global" | "all" | (string & {}); page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `states` | `("inbox" \| "ready" \| "blocked" \| "in_progress" \| "review" \| "done" \| "dropped")[]` | query | No | Only todos in one of these states. Repeat the parameter for several (?states=ready&states=blocked). |
| `tags` | `string[]` | query | No | Only todos carrying these tags. Repeat the parameter for several (?tags=a&tags=b). |
| `query` | `string` | query | No | Free-text filter over title/body. |
| `open_only` | `boolean` | query | No | When true, only open (non-terminal) todos. |
| `all` | `boolean` | query | No | When true, include archived/closed todos. |
| `sort` | `"default" \| "closed_at"` | query | No | List order. `default` (or omitted): open todos first, then priority, rank, number. `closed_at`: closed todos by `closed_at`, newest first; todos without a `closed_at` follow in the default order. Any other value is 400. |
| `realm` | `"global" \| "all" \| (string & {})` | query | No | The realm to list: "global" (todos not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| "all" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<(NonNullable<AgentTodosListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/todos`
**CLI:** `hoody agent todos list`

---

#### `listIterator` — List todos. (async iterator)

```typescript
client.agent.todos.listIterator(options?: { states?: ("inbox" | "ready" | "blocked" | "in_progress" | "review" | "done" | "dropped")[]; tags?: string[]; query?: string; open_only?: boolean; all?: boolean; sort?: "default" | "closed_at"; realm?: "global" | "all" | (string & {}); page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `states` | `("inbox" \| "ready" \| "blocked" \| "in_progress" \| "review" \| "done" \| "dropped")[]` | query | No | Only todos in one of these states. Repeat the parameter for several (?states=ready&states=blocked). |
| `tags` | `string[]` | query | No | Only todos carrying these tags. Repeat the parameter for several (?tags=a&tags=b). |
| `query` | `string` | query | No | Free-text filter over title/body. |
| `open_only` | `boolean` | query | No | When true, only open (non-terminal) todos. |
| `all` | `boolean` | query | No | When true, include archived/closed todos. |
| `sort` | `"default" \| "closed_at"` | query | No | List order. `default` (or omitted): open todos first, then priority, rank, number. `closed_at`: closed todos by `closed_at`, newest first; todos without a `closed_at` follow in the default order. Any other value is 400. |
| `realm` | `"global" \| "all" \| (string & {})` | query | No | The realm to list: "global" (todos not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| "all" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncGenerator<(NonNullable<AgentTodosListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/todos`
**CLI:** `hoody agent todos list`

---

#### `purgeArchived` — Purge archived todos.

```typescript
client.agent.todos.purgeArchived(data?: AgentTodosPurgeArchivedRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentTodosPurgeArchivedRequest` | body | No |  |

**Returns:** `Promise<AgentTodosPurgeArchivedResponse>`  |  **HTTP:** `POST /api/v1/agent/todos/purge`
**CLI:** `hoody agent todos archived purge`

---

#### `release` — Release a todo.

```typescript
client.agent.todos.release(id: string, data: AgentTodosReleaseRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentTodosReleaseRequest` | body | Yes |  |

**Body:** `{ session_id*: string, outcome*: "done" | "blocked" | "failed" | "cancelled", summary: string, question_for_human: string }`

- `session_id` — The session that owns the lease — required, and must match the value `agent.todos.claim` leased under; a mismatch is refused.
- `outcome` — How the run ended. done → review; blocked → blocked; failed → ready and increments the attempt counter; cancelled → ready without incrementing it. Required — any other value is rejected.
- `summary` — Short account of what the run did, written to the timeline as the run_end entry (capped at 1024 characters).
- `question_for_human` — A question to surface to the operator alongside the outcome — the field a blocked run uses to say what it needs (capped at 1024 characters).

**Returns:** `Promise<AgentTodosReleaseResponse>`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/release`
**CLI:** `hoody agent todos release`

---

#### `sendMessage` — Comment + run an orchestrator turn.

```typescript
client.agent.todos.sendMessage(id: string, data: AgentTodosSendMessageRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentTodosSendMessageRequest` | body | Yes |  |

**Body:** `{ text*: string }`

**Returns:** `Promise<AgentTodosSendMessageResponse>`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/message`
**CLI:** `hoody agent todos messages send`

---

#### `snooze` — Snooze a todo.

```typescript
client.agent.todos.snooze(id: string, data: AgentTodosSnoozeRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentTodosSnoozeRequest` | body | Yes |  |

**Body:** `{ wake_at*: string, revision*: int }`

- `revision` — The TODO's own current `revision` (from `agent.todos.get`); a stale value is rejected.

**Returns:** `Promise<AgentTodosSnoozeResponse>`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/snooze`
**CLI:** `hoody agent todos snooze`

---

#### `start` — Run a todo's orchestrator.

```typescript
client.agent.todos.start(id: string, data?: AgentTodosStartRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentTodosStartRequest` | body | No |  |

**Returns:** `Promise<AgentTodosStartResponse>`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/run`
**CLI:** `hoody agent todos start`

---

#### `triage` — Run an LLM triage pass.

```typescript
client.agent.todos.triage(data?: AgentTodosTriageRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentTodosTriageRequest` | body | No |  |

**Returns:** `Promise<AgentTodosTriageResponse>`  |  **HTTP:** `POST /api/v1/agent/todos/triage`
**CLI:** `hoody agent todos triage`

---

#### `update` — Update a todo (CAS).

```typescript
client.agent.todos.update(id: string, data: AgentTodosUpdateRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentTodosUpdateRequest` | body | Yes |  |

**Body:** `{ revision*: int, title: string, body: string, state: "inbox" | "ready" | "blocked" | "review" | "done" | "dropped", priority: int, rank: int, tags: string[], cwd: string }`

- `revision` — The TODO's own current `revision` (from `agent.todos.get` — NOT the store-wide revision); a stale value is rejected.
- `state` — … Sending the current state leaves the state as it is (the other fields still apply). in_progress is not settable here: `agent.todos.claim` or `agent.todos.start` enters it by taking the lease, and while a worker holds the lease the state cannot be changed (`agent.todos.cancel` or `agent.todos.release` ends it). Any other move is 400 bad_request ("invalid transition <from> → <to>"), and so is any update to an archived todo, whatever its revision. Otherwise the revision is checked first: a stale one is 409 todo_conflict whatever the state. …

**Returns:** `Promise<AgentTodosUpdateResponse>`  |  **HTTP:** `PATCH /api/v1/agent/todos/{id}`
**CLI:** `hoody agent todos update`

---

### `client.agent.tools` (9) — Tool catalogue and gated tool execution

#### `get` — Get one tool schema.

```typescript
client.agent.tools.get(name: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentToolsGetResponse>`  |  **HTTP:** `GET /api/v1/agent/tools/{name}`
**CLI:** `hoody agent tools get`

---

#### `list` — List the tool catalogue.

```typescript
client.agent.tools.list(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentToolsListResponse>`  |  **HTTP:** `GET /api/v1/agent/tools`
**CLI:** `hoody agent tools list`

---

#### `listAll` — List the tool catalogue. (collect all pages)

```typescript
client.agent.tools.listAll(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<(NonNullable<AgentToolsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/tools`
**CLI:** `hoody agent tools list`

---

#### `listIterator` — List the tool catalogue. (async iterator)

```typescript
client.agent.tools.listIterator(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `AsyncGenerator<(NonNullable<AgentToolsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/tools`
**CLI:** `hoody agent tools list`

---

#### `listReadOnly` — List the read-only tool subset.

```typescript
client.agent.tools.listReadOnly(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentToolsListReadOnlyResponse>`  |  **HTTP:** `GET /api/v1/agent/tools/read-only`
**CLI:** `hoody agent tools readonly list`

---

#### `listReadOnlyAll` — List the read-only tool subset. (collect all pages)

```typescript
client.agent.tools.listReadOnlyAll(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<(NonNullable<AgentToolsListReadOnlyResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`listReadOnly()` fetches one page). `listReadOnlyIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/tools/read-only`
**CLI:** `hoody agent tools readonly list`

---

#### `listReadOnlyIterator` — List the read-only tool subset. (async iterator)

```typescript
client.agent.tools.listReadOnlyIterator(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `AsyncGenerator<(NonNullable<AgentToolsListReadOnlyResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`listReadOnly()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/tools/read-only`
**CLI:** `hoody agent tools readonly list`

---

#### `run` — Run a tool (sessionless, gated).

```typescript
client.agent.tools.run(name: string, data: AgentStreamToolRequest | undefined, options: { confirm?: boolean; confirm_token?: string; XHoodyToolMode?: string; XHoodyDirScope?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}); stream: true })  // → Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentStreamToolFrames>>>
client.agent.tools.run(name: string, data?: AgentRunToolRequest, options?: { confirm?: boolean; confirm_token?: string; XHoodyToolMode?: string; XHoodyDirScope?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}); stream?: false })  // → Promise<AgentRunToolResponse>
client.agent.tools.run(name: string, data?: AgentRunToolRequest, options?: { confirm?: boolean; confirm_token?: string; XHoodyToolMode?: string; XHoodyDirScope?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}); stream?: boolean })  // → Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentStreamToolFrames>>> | Promise<AgentRunToolResponse>
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `confirm` | `boolean` | query | No | Query alias of the body `confirm` field — re-issue a previously-parked confirmation (pair with confirm_token). |
| `confirm_token` | `string` | query | No | Query alias of the body `confirm_token` field — the single-use token returned in the 409 tool_needs_confirmation details. |
| `XHoodyToolMode` | `string` | header `X-Hoody-Tool-Mode` | No | Sessionless tool-mode for the ephemeral session: `standard` (the default) or `orchestrator`. Any other value is refused 400 invalid_tool_mode. Ignored on the in-session run (it inherits the session's frozen tool-mode). |
| `XHoodyDirScope` | `string` | header `X-Hoody-Dir-Scope` | No | Sessionless directory-access scope for the ephemeral session: home (the default) or full. Any other value is refused 400 invalid_dir_scope. Ignored on the in-session run (it inherits the session's frozen dir-scope). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentStreamToolRequest \| undefined` | body | Yes |  |
| `stream` | `boolean` | option | No | Stream the tool output as server-sent events. |

**Body:** `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }`

- `confirm` — Re-issue a previously-parked confirmation. MUST be paired with the confirm_token from the prior 409; a bare confirm:true with no valid token does NOT bypass the gate (it re-parks). A wire confirmed key in params is always scrubbed.
- `confirm_token` — The single-use token returned in the 409 tool_needs_confirmation details. Bound to the tool/session/params it was minted for; present it with confirm:true and the echoed params to approve the parked run.
- `allow_mutations` — Sessionless only: opt a non-read-only tool into running with every permission check applied (else a sessionless mutating run is refused 400 tool_mutation_refused).

**Returns:** see each form above  |  **HTTP:** `POST /api/v1/agent/tools/{name}/run`
**CLI:** `hoody agent tools run`

---

#### `start` — Run a tool asynchronously (sessionless, gated).

```typescript
client.agent.tools.start(name: string, data?: AgentToolsStartRequest, options?: { confirm?: boolean; confirm_token?: string; XHoodyToolMode?: string; XHoodyDirScope?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `confirm` | `boolean` | query | No | Query alias of the body `confirm` field — re-issue a previously-parked confirmation (pair with confirm_token). |
| `confirm_token` | `string` | query | No | Query alias of the body `confirm_token` field — the single-use token returned in the 409 tool_needs_confirmation details. |
| `XHoodyToolMode` | `string` | header `X-Hoody-Tool-Mode` | No | Sessionless tool-mode for the ephemeral session: `standard` (the default) or `orchestrator`. Any other value is refused 400 invalid_tool_mode. Ignored on the in-session run (it inherits the session's frozen tool-mode). |
| `XHoodyDirScope` | `string` | header `X-Hoody-Dir-Scope` | No | Sessionless directory-access scope for the ephemeral session: home (the default) or full. Any other value is refused 400 invalid_dir_scope. Ignored on the in-session run (it inherits the session's frozen dir-scope). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentToolsStartRequest` | body | No |  |

**Body:** `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }`

- `confirm` — Re-issue a previously-parked confirmation. MUST be paired with the confirm_token from the prior 409; a bare confirm:true with no valid token does NOT bypass the gate (it re-parks). A wire confirmed key in params is always scrubbed.
- `confirm_token` — The single-use token returned in the 409 tool_needs_confirmation details. Bound to the tool/session/params it was minted for; present it with confirm:true and the echoed params to approve the parked run.
- `allow_mutations` — Sessionless only: opt a non-read-only tool into running with every permission check applied (else a sessionless mutating run is refused 400 tool_mutation_refused).

**Returns:** `Promise<AgentToolsStartResponse>`  |  **HTTP:** `POST /api/v1/agent/tools/{name}/runAsync`
**CLI:** `hoody agent tools start`

---

### `client.agent.usage` (2) — Per-session and aggregate usage counters

#### `listByAccount` — Usage rollup by account.

```typescript
client.agent.usage.listByAccount(options?: { since?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `since` | `number` | query | No | Unix-seconds lower bound; omit for all-time. A negative/non-numeric value is rejected 400. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentUsageListByAccountResponse>`  |  **HTTP:** `GET /api/v1/agent/usage/by-account`
**CLI:** `hoody agent usage accounts list`

---

#### `listByModel` — Usage rollup by model.

```typescript
client.agent.usage.listByModel(options?: { since?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `since` | `number` | query | No | Unix-seconds lower bound; omit for all-time. A negative/non-numeric value is rejected 400. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentUsageListByModelResponse>`  |  **HTTP:** `GET /api/v1/agent/usage/by-model`
**CLI:** `hoody agent usage models list`

---

### `client.agent.workflows` (16) — Multi-step workflow definitions and runs

#### `cancelRun` — Cancel a workflow run.

```typescript
client.agent.workflows.cancelRun(run_id: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `run_id` | `string` | path | Yes | The run id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentWorkflowsCancelRunResponse>`  |  **HTTP:** `POST /api/v1/agent/workflows/runs/{run_id}/cancel`
**CLI:** `hoody agent workflows runs cancel`

---

#### `delete` — Delete a workflow definition.

```typescript
client.agent.workflows.delete(name: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentWorkflowsDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/agent/workflows/{name}`
**CLI:** `hoody agent workflows delete`

---

#### `get` — Read one workflow definition.

```typescript
client.agent.workflows.get(name: string, options?: { include_revision?: boolean; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `include_revision` | `boolean` | query | No | If "true", the tool output's first line is `revision: <opaque>` — pass that value as `agent.workflows.set`'s expected_revision to guard against concurrent edits; the JSON below it is unchanged. Strictly parsed: exactly one value, "true" or "false"; anything else (empty, "TRUE", "1", repeated) is a 400 bad_request. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentWorkflowsGetResponse>`  |  **HTTP:** `GET /api/v1/agent/workflows/{name}`
**CLI:** `hoody agent workflows get`

---

#### `getRun` — Get one workflow run by id.

```typescript
client.agent.workflows.getRun(run_id: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `run_id` | `string` | path | Yes | The run id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentWorkflowsGetRunResponse>`  |  **HTTP:** `GET /api/v1/agent/workflows/runs/{run_id}`
**CLI:** `hoody agent workflows runs get`

---

#### `list` — List workflow definitions.

```typescript
client.agent.workflows.list(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentWorkflowsListResponse>`  |  **HTTP:** `GET /api/v1/agent/workflows`
**CLI:** `hoody agent workflows list`

---

#### `listAll` — List workflow definitions. (collect all pages)

```typescript
client.agent.workflows.listAll(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<(NonNullable<AgentWorkflowsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/workflows`
**CLI:** `hoody agent workflows list`

---

#### `listIterator` — List workflow definitions. (async iterator)

```typescript
client.agent.workflows.listIterator(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncGenerator<(NonNullable<AgentWorkflowsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/workflows`
**CLI:** `hoody agent workflows list`

---

#### `listRuns` — Snapshot in-flight and recent workflow runs.

```typescript
client.agent.workflows.listRuns(options?: { realm?: "global" | "all" | (string & {}); page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm` | `"global" \| "all" \| (string & {})` | query | No | The realm to list: "global" (runs not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| "all" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<AgentWorkflowsListRunsResponse>`  |  **HTTP:** `GET /api/v1/agent/workflows/runs`
**CLI:** `hoody agent workflows runs list`

---

#### `listRunsAll` — Snapshot in-flight and recent workflow runs. (collect all pages)

```typescript
client.agent.workflows.listRunsAll(options?: { realm?: "global" | "all" | (string & {}); page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm` | `"global" \| "all" \| (string & {})` | query | No | The realm to list: "global" (runs not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| "all" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `Promise<(NonNullable<AgentWorkflowsListRunsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`listRuns()` fetches one page). `listRunsIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/workflows/runs`
**CLI:** `hoody agent workflows runs list`

---

#### `listRunsIterator` — Snapshot in-flight and recent workflow runs. (async iterator)

```typescript
client.agent.workflows.listRunsIterator(options?: { realm?: "global" | "all" | (string & {}); page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm` | `"global" \| "all" \| (string & {})` | query | No | The realm to list: "global" (runs not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| "all" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |

**Returns:** `AsyncGenerator<(NonNullable<AgentWorkflowsListRunsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`listRuns()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/workflows/runs`
**CLI:** `hoody agent workflows runs list`

---

#### `resumeRun` — Resume a failed or cancelled workflow run.

```typescript
client.agent.workflows.resumeRun(run_id: string, data: AgentWorkflowsResumeRunRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `run_id` | `string` | path | Yes | The run id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentWorkflowsResumeRunRequest` | body | Yes |  |

**Body:** `{ session_id*: string }`

**Returns:** `Promise<AgentWorkflowsResumeRunResponse>`  |  **HTTP:** `POST /api/v1/agent/workflows/runs/{run_id}/resume`
**CLI:** `hoody agent workflows runs resume`

---

#### `sendMessage` — Send a message to a running workflow.

```typescript
client.agent.workflows.sendMessage(id: string, data?: AgentWorkflowsSendMessageRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentWorkflowsSendMessageRequest` | body | No |  |

**Body:** `{ text: string }`

**Returns:** `Promise<AgentWorkflowsSendMessageResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/workflow/messages`
**CLI:** `hoody agent workflows messages send`

---

#### `set` — Create or replace a workflow definition.

```typescript
client.agent.workflows.set(name: string, data: AgentWorkflowsSetRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentWorkflowsSetRequest` | body | Yes |  |

**Body:** `{ definition*: object, expected_revision: string, expected_absent: bool }`

- `expected_revision` — … If the stored workflow changed since that read, the upsert is refused with [revision_conflict] and nothing is written. … The revision is bound to the realm this request resolves to: on a gateway without a realm pin, a revision read while another realm was active is refused [revision_conflict] (current_revision is this realm's), never written into the other realm.
- `expected_absent` — Optional create-only guard: refuse with [already_exists] (writing nothing) if any workflow with this name already exists. Use when creating a new workflow that must not overwrite an existing one. Mutually exclusive with expected_revision.

**Returns:** `Promise<AgentWorkflowsSetResponse>`  |  **HTTP:** `PUT /api/v1/agent/workflows/{name}`
**CLI:** `hoody agent workflows set`

---

#### `setHidden` — Hide or un-hide a workflow.

```typescript
client.agent.workflows.setHidden(name: string, data?: AgentWorkflowsSetHiddenRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentWorkflowsSetHiddenRequest` | body | No |  |

**Body:** `{ hidden: bool }`

**Returns:** `Promise<AgentWorkflowsSetHiddenResponse>`  |  **HTTP:** `POST /api/v1/agent/workflows/{name}/hide`
**CLI:** `hoody agent workflows hidden set`

---

#### `setSummary` — Set or clear a workflow's summary.

```typescript
client.agent.workflows.setSummary(name: string, data: AgentWorkflowsSetSummaryRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentWorkflowsSetSummaryRequest` | body | Yes |  |

**Body:** `{ summary*: string, expected_revision: string }`

- `summary` — The new summary. An empty string clears it. Required — omitting it is a 400, not a clear.
- `expected_revision` — … If the workflow changed or was deleted since that read, the write is refused 409 revision_conflict and nothing is written. … The revision is bound to the realm this request resolves to: on a gateway without a realm pin, a revision read while another realm was active is refused 409 revision_conflict (details.current_revision is this realm's), never written into the other realm.

**Returns:** `Promise<AgentWorkflowsSetSummaryResponse>`  |  **HTTP:** `PUT /api/v1/agent/workflows/{name}/summary`
**CLI:** `hoody agent workflows summary set`

---

#### `start` — Run a workflow in a new session.

```typescript
client.agent.workflows.start(name: string, data?: AgentWorkflowsStartRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; realm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `realm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `data` | `AgentWorkflowsStartRequest` | body | No |  |

**Body:** `{ prompt: string, inputs: { [key: string]: string }, realm: string, container: string, cwd: string, config_dir: string, model: string, agent: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", headless: bool }`

- `inputs` — Optional run-time values for the workflow's DECLARED input parameters (declared name → string value; resolves to $(input.<name>) in every step). A workflow with a REQUIRED declared parameter cannot run without these. Values must be strings; a non-string value is a 400.
- `model` — Model for this session; overrides the chat agent's pinned model for this session only. An unknown model is refused 422 unknown_model.
- `tool_mode` — Initial tool mode (frozen at start): standard (the default) or orchestrator. Any other value is refused 400 invalid_tool_mode.
- `dir_scope` — Initial directory-access scope (frozen at start): home or full. Any other value is refused 400 invalid_dir_scope.

**Returns:** `Promise<AgentWorkflowsStartResponse>`  |  **HTTP:** `POST /api/v1/agent/workflows/{name}/runs`
**CLI:** `hoody agent workflows start`

