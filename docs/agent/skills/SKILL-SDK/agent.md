> _**SDK skill · `agent` namespace** · ~128,857 tokens · hoody-sdk v1.0.0-beta.15_

# `agent` — In-container AI coding agent over HTTP

## Purpose

The `agent` kit exposes the in-container AI agent as a typed namespace: create a chat session, send a prompt, stream the turn (tool calls, gates, output), then confirm/answer/cancel as the agent works. services — `sessions` (with `sessions.turns`), `definitions`, `models`, `providers`, `skills` (with `skills.hub`), `memory`, `github`, `workflows`, `tools`, `hooks`, `mcp`, `settings`, `loops`, `logs`, `tasks`, `stats`, `jobs`, `gates`, `changes`, `headless`, `todos`, `usage`, plus `platform` (token bootstrap) and `logs.export`.

## When to use

- **Drive the agent programmatically** — create a session, prompt it, and consume the turn: `client.agent.sessions.create` → stream the turn for live tool/gate/output events (per surface — see the streaming note under Quirks), or `sessions.turns.run` for one blocking call → resolve gates with `gates.approve` / `gates.deny` / `gates.answer` → `sessions.turns.cancel` to interrupt.
- **Inspect or configure the agent** — list `models` (`agent.models.list` / `agent.models.get`; the Jev decision-model catalogue is the separate `agent.jev.listModels`) and `providers.list` (configure providers via `providers.setDefaultAuth` / `providers.setApiKey` / `providers.startOauth`); switch a session's active model with `sessions.setModel`, browse/install `skills`, read/edit `memory`, manage `workflows`, `hooks`, `agents` (named agent profiles), and `tools` — both the sessionless catalogue/registry (`tools.list` / `tools.listReadOnly` / `tools.get`, and `agent.tools.run` (blocks, returns the result; with `stream: true` it returns the one-shot result over SSE frames instead, not a per-token stream) / `agent.tools.start` (returns `{ job_id }`, poll `jobs`) to invoke a tool with no session — read-only by default, a mutating tool needs `allow_mutations: true` or a confirmed re-issue) and the per-session surface (`sessions.listTools` for a session's *effective* tool set, `sessions.listMcpTools`, and `sessions.runTool`). Unlike the sessionless `agent.tools.run`, a per-session run executes against the session's *frozen* realm/container/cwd/tool-mode and claims the session's single serial turn slot — so it returns 409 `turn_in_flight` while a turn is running, 409 `gate_parked` while a gate is open, and 404 `tool_not_found` if the tool is not in that session's effective list; whether a mutating tool may run is decided by the live session's own tool mode and confirmation settings (the `allow_mutations` escape hatch is sessionless-only).
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

`client.agent.sessions.create` → `client.agent.sessions.turns.run` with `{ text }` — blocks until the turn finishes, then returns `{status:"done", session_id, turn_id}` with no reply text (or a pending gate, if the turn parks on one); read the reply with `client.agent.sessions.getTranscript`. Best for short, non-interactive prompts where you don't need streamed events.

### 3. Resolve gates mid-turn

While a prompt streams, the agent may pause for human input: a confirmation gate → `client.agent.gates.approve` / `client.agent.gates.deny`; an open question → `client.agent.gates.answer` (to get a helper model to DRAFT an answer for a parked question call `client.agent.gates.suggest` — it does NOT answer the gate: it dispatches an async job (HTTP 202) whose suggestion arrives via `client.agent.jobs.getResult` and an `event.question_suggestion` on the session stream — only one assist may be in flight per session — and the real answer still goes through `gates.answer`; for unattended runs arm `client.agent.sessions.setAutoReply` (a self-driving auto-user loop that withholds write-class actions unless you opt in with `allow_writes: true`, either on the arm call or later via `sessions.setAutoReplyWrites`)). The gate identity to echo is the ENVELOPE-level `gate {id, generation, type}` that the stream frame parking the gate carries beside `seq` / `incarnation` / `event`. The `event.confirm_request` payload also has a numeric `gate_id`, but that is the daemon's id space and is never the value to echo. Echoing a wrong/stale `gate_id`/`generation`, or answering when nothing is parked, returns 409 (`no_pending_gate` / `stale_gate` / `gate_already_answered` / `gate_type_mismatch`). On a session whose approval policy is `always` and whose approver lease was ever minted (`client.agent.sessions.claimApproverLease`, or the lease handed back by a create or attach that asserted `always`), EVERY decision — `gates.approve` / `gates.deny`, and the confirmed re-issue of a gated `sessions.runTool` — must carry the current lease capability in the `X-Hoody-Approver-Lease` request header. (SDK: the `XHoodyApproverLease` option.) Without it the decision is refused `409 approver_lease_required`, a capability that does not verify is `409 approver_lease_invalid`, and an expired one is `approver_lease_expired` until a holder acquires again. Interrupt a running turn with `client.agent.sessions.turns.cancel`. Tear the session down: `client.agent.sessions.close` removes it from the live map; `sessions.delete(id)` always erases the persisted record as well (the SDK method has no keep-the-record form); to keep the record, use `sessions.close` and re-attach later with `sessions.create({ attach: id })`. To roll a session back without tearing it down, `client.agent.sessions.trim` with `{ turn_idx }` truncates conversation history to (and including) that turn index.

### 4. Pick a model / provider

`client.agent.providers.list` to list the catalogued providers (and `client.agent.providers.getAuth` to check that one is `ready`: a stored credential or passwordless access), `client.agent.models.list` to list the catalogued models, then `client.agent.sessions.setModel` to bind a model to a session before prompting — SYNCHRONOUS: the response reports the actual outcome ({status:'ok', model, persisted} on success; structured 409/422 errors while busy or for an unconstructable spec). A successful switch is live for the session at once and then TRIES to persist into the chat agent's frontmatter (a global repin for future sessions of that agent); that save is best-effort, so only `persisted: true` confirms the repin — `persisted: false` means the session switched but future sessions keep the old pin. PRECEDENCE: the agent's frontmatter `model` is the DEFAULT for a session that does not request one; an explicit model on create (`sessions.create({ model })`), or this live `sessions.setModel`, OVERRIDES that pin for the session — create is session-scoped and does not rewrite the agent, this live switch repins globally. The shipped default agent ships pinned, so its pin is the out-of-the-box default until an explicit model is chosen (an explicit model together with `attach` or `backend: "acp"` is rejected 400 — a resumed/delegated session cannot take an explicit model). Each session has further per-session knobs (all session-scoped PATCHes that apply live): `sessions.setEffort` (`{ effort }` — `low|medium|high|xhigh`, or `""` for the model default), `sessions.setVerbosity` (`{ level }` — `normal|concise|terse|minimal`), `sessions.setHoodyEnv` (`{ enabled }` — toggle whether the `HOODY_*` shell-env contract is injected for the bash tool), and `sessions.setAgent` (`{ agent }` — bind a named profile from `agents`).

### 5. Skills, memory, todos, workflows, agents

- **Skills** — `client.agent.skills.list` (each carries an enabled + trust state), `skills.hub.install` / `skills.hub.search` / `skills.hub.preview` to find and install from the hub. A newly installed/imported skill must be trusted before its code runs — `client.agent.skills.trust` is the gate (identify the skill by `root_dir`+`rel_dir`, set the `trusted` flag); `skills.enable` / `skills.disable` only enable or disable by `name` (set the `disabled` flag). Both `skills.trust` (which grants arbitrary code-execution trust) and `skills.hub.install` (which writes arbitrary skill code to disk) take effect immediately over this namespace: there is no confirmation step, and no privilege beyond ordinary access to the kit is required, so an autonomous caller can silently trust and install skill code. Add your own confirmation before exposing these to one.
- **Memory** — `client.agent.memory.search` for hybrid recall (BM25 + vector + graph) and `memory.listItems` to enumerate by `project`; `memory.createItem` / `memory.updateItem` / `memory.deleteItem` to write; `memory.getGraph` for the relation graph (or `memory.getItem` to read one record by `id`). `memory.enable` / `memory.disable` are the memory capture/privacy switch — they persist `features.memory` and flip the live store — and `memory.flush` forces the store's durability barrier; none of the three is admin-gated. Memory is project-scoped (pass `project`); the reads (`memory.search` / `memory.listItems` / `memory.getGraph` / `memory.listProjects`) and `memory.consolidate` are active-realm-only, and so are the item reads and writes (`memory.getItem` / `memory.createItem` / `memory.updateItem` / `memory.deleteItem`): send no per-request realm selector, since every one of them answers `400 realm_scope_unsupported` to one. `memory.search` / `memory.getGraph` also return `503 store_unavailable` while the store is still warming — retry rather than treating it as an empty result.
- **Todos** — `client.agent.todos.list` / `todos.create` to file; then `todos.triage` (LLM inbox pass), `todos.claim` / `todos.release`, `todos.start` (dispatch a background orchestrator — returns `{job_id, session_id}`), `todos.cancel` to abort an in-flight run, and `todos.approveProposal` / `todos.denyProposal` to resolve a proposed run — approve is NOT inert: it spawns a background worker session equivalent to `todos.start` (a J-class autonomous run that spends model budget), while `todos.denyProposal` spawns nothing — plus `todos.snooze` / `todos.archive`. To move a todo between states (`inbox`, `ready`, `blocked`, `review`, `done`, `dropped`) or edit its fields, `todos.update` applies a CAS-guarded patch / `state` transition (`in_progress` is entered only by `todos.claim` / `todos.start`; `todos.update` refuses it, and an unknown state is rejected) — read the todo's OWN `revision` with `todos.get` and pass it back (`todos.getRevision` is a store-wide change cursor, NOT the CAS token; a stale value → `409 todo_conflict`); a stale revision is rejected (409). `todos.archive` is not terminal — `todos.purgeArchived` permanently and irreversibly deletes archived todos of the selected realm that were archived more than 90 days ago (and those with a missing or invalid archive time); no confirmation gate, treat as destructive. Mind the comment split: `todos.createComment` (`/messages`, plural) only appends a comment, whereas `todos.sendMessage` (`/message`, singular) ALSO kicks an orchestrator turn — a budget-spending LLM run that returns `{job_id}` — so use the plural form for a plain note. The `job_id` returned by `todos.start`, `todos.sendMessage` and `todos.triage` completes as `succeeded` the moment the dispatch is accepted; it records the dispatch only, not the worker's outcome. Follow the todo itself (`todos.get`, its state and timeline) rather than polling that job. Note `todos.start` / `todos.triage` / `todos.approveProposal` are J-class autonomous runs with NO confirmation gate on the RPC (reaching the RPC is itself treated as the human approval; that denial lives only on the model-facing `run_todo` *tool*), so calling them from automation silently dispatches a real LLM run — gate them in your own caller.
- **Workflows** — `workflows.list` / `workflows.get` / `workflows.set` / `workflows.delete` / `workflows.setHidden` manage saved definitions; `sessions.startWorkflow` dispatches one onto a live session and returns a JOB, not a run (optionally seed the run with a `{ prompt }` body — input text fed to the workflow) — poll `client.agent.jobs.get` until its `run_id` populates (null during the brief dispatch window), then track via `workflows.listRuns` / `workflows.getRun` and stop with `workflows.cancelRun`; feed a running workflow with `client.agent.workflows.sendMessage` (`{ text }`). Run events flow on the owning session's stream, not a per-run bus.
- **Agent profiles** — `client.agent.definitions.list` to enumerate named profiles; `definitions.create` / `definitions.copy` / `definitions.rename` / `definitions.delete`; `definitions.getSource` → edit → `definitions.setSource` (pass the read's `revision` as `expected_revision`: a stale one is refused `409 revision_conflict` and nothing is written; without it the save is unconditional); `definitions.setModel` / `definitions.setTools` / `definitions.toggleTool` / `definitions.setTurnLimit` / `definitions.reset`. To make a session use a profile, `client.agent.sessions.setAgent` (`{ agent }`) — that selects, it does NOT edit the profile. Two daemon guard rails: `definitions.delete` refuses the configured default chat agent, and a shipped-default profile that has no removable override of its own (`is_error:true` — use `definitions.reset` or `definitions.setSource` instead); in a realm that holds its own saved override of a shipped profile, deleting it removes the override and the shipped version shows through again, and `definitions.reset` refuses a profile that has no shipped default (`is_error:true`).

### 6. Fire-and-observe, recurring prompts, and re-attach

- **Fire-and-observe** — `client.agent.sessions.startTurn` with `{ text }` dispatches a turn and returns `{ job_id, session_id, turn_id }` immediately (HTTP 202) without streaming or blocking; watch completion via the `agent_done` on `client.agent.sessions.connect` whose `turn_id` matches (another client's turn on the same session ends with its own `agent_done`). A cancel scoped with that `turn_id` stops only this turn. Refuses with 409 `turn_in_flight` if a turn is running, or 409 `gate_parked` if a gate is open.
- **Observe / re-attach** — `client.agent.sessions.connect` attaches (WebSocket primary, SSE fallback) to a live session's full `event.*` stream; pass `since` (gateway int64 seq, or the `Last-Event-ID` header) to resume from the 1024-event replay ring after a disconnect (a gap past eviction yields `event: lagged {code:replay_gap}`). Each frame is `{seq, incarnation, event}`, and a session re-attached under the same id starts a new incarnation whose `seq` restarts at 1, so send `incarnation` (the one you last saw) together with `since`: a mismatch answers `replay_gap` plus the full retained ring instead of silently resuming into a different history. Over SSE the `event:` line drops the `event.` prefix (`event.agent_done` arrives as `event: agent_done`) while the JSON `data:` keeps the full name, so match on the payload's `type`; WebSocket frames are delivered unchanged. `client.agent.sessions.replay` returns the buffered event tail of a *live* session (with `min_seq`/`max_seq`) for a one-shot catch-up (only a *live* session has this ring). `sessions.connect` does not revive a session either: on a persisted but non-live session it answers `404 not_found`, so re-attach it first (`sessions.create({ attach: id })`), then open the stream.
- **Recurring prompts (loops)** — `client.agent.loops.create` with `{ prompt, interval }` (plus optional `max_runs` / `stop_when` / `max_cost_usd` / `max_wall_ms` caps) schedules a prompt to re-fire on a live session; `listLoops` / `loops.update` (pause via `{ paused: true }`) / `loops.delete` to manage, `loops.startRun` to fire one immediately. Loops are entirely session-scoped. Three rules refuse a request rather than adjusting it: `interval` has a floor of 60 seconds; at most 8 loops can be active (not paused, not ended) per daemon, so the 9th create is rejected; and each `loops.update` carries at most ONE intent (`paused`, or `expires_in`, or the budget fields `max_cost_usd` / `max_wall_ms`), so a request mixing two is rejected 400 (a body with none of them is treated as a budget update).

### 7. Headless one-shot run

The run's shape is chosen by the request BODY, not by a header: the default (`format` `text` or `json`) is an async job — HTTP 202 `{ job_id }`, then poll `client.agent.jobs.get` and fetch the output with `client.agent.jobs.getResult` — while `format: "stream-json"` (or `stream: true`) streams the run over SSE (`start` → `result` or `error` → `end`). A failure after the acknowledgement (a timeout, `admin_unauthorized`) arrives later, in the job result or as the `error` frame, never as the HTTP status. Every confirm, plan and question auto-approves in a headless run, so treat it as arbitrary code execution. SDK: `client.agent.headless.start` sends `stream: false` on every call and accepts `format` `text` or `json` only (`stream-json` selects SSE, so `start` refuses it before anything is sent); it resolves to the 202 `{ job_id }`. `client.agent.headless.stream` sends `stream: true` on every call and returns a Promise of an async iterable of SSE events; it sends nothing until you start iterating. Consume it with `for await (const ev of await client.agent.headless.stream({ prompt }))`; the `await` inside the loop head is required, because without it the loop tries to iterate the Promise itself and fails before anything is sent. If the kit answers the 202 job acknowledgement instead of a stream, the first iteration throws an `ApiError` with code `NOT_AN_EVENT_STREAM` and status 202. That error holds only the code, a fixed sentence and the status: the `{ job_id }` body reaches only the client's diagnostic callback, `onStreamDiagnostic` in the client config (`headless.stream` takes no per-call callback), which receives the original error with the body on its `response` — take the id from there and poll the job.

### 8. Configure MCP servers for a session

Reads first: `client.agent.mcp.listServers` (`{ session_id }`) returns the EFFECTIVE merged `mcp_servers` config, the per-layer settings files behind it, and each server's LIVE runtime state (connected, negotiated protocol revision, tool count, pid, revocation reason, recent stderr). Every write is TWO steps: `client.agent.mcp.createWriteIntent` (`{ session_id, op, scope }`, op ∈ the strings "upsert", "delete", "set_enabled" and "import", scope ∈ `user`|`project`|`local`; an omitted scope means `user`, or `project` when the session has no user layer, which is the usual case for a container session — read the returned target path to confirm where the write lands) mints a single-use nonce bound to {session, op, resolved settings path} and returns the target path plus the current `mcp_servers` hash — then present that `nonce` plus the hash as `expect_hash` on the matching `client.agent.mcp.upsertServer` / `mcp.deleteServer` / `mcp.enableServer` / `mcp.disableServer` / `mcp.importServers`. BOTH are required on every write: skipping step one fails closed, a nonce minted for a different op or scope fails closed, and `expect_hash` has no omit-it default — a first write into a settings file that does not exist yet states that expectation with the empty-array hash rather than leaving the field out. To adopt someone else's config, preview it with `client.agent.mcp.previewImport` (`{ session_id, document }` — writes nothing, needs no nonce, strips credential values) and then `mcp.importServers` with a fresh `op: "import"` nonce; imported servers land DISABLED, so enable each one with `mcp.enableServer`. After editing a settings file by hand, or to recover a server that died, `client.agent.mcp.reconnect` (`{ session_id }`) re-reads the layers and reconciles every live session's pool — a healthy unchanged server is not restarted. `client.agent.mcp.testServer` trials a candidate config without saving it, but it is human-only (see Common errors).

## Quirks & gotchas

- The bare `hoody agent` verb is a **TUI launcher**, separate from this HTTP namespace; they coexist — the launcher opens the in-container Agent TUI, the namespace is the typed control surface.
- Source of truth is the agent kit's own OpenAPI document, served at `GET /api/v1/agent/openapi.{json,yaml}`; every route lives under the single `/api/v1/agent` prefix. The kit checks no credential of its own and asks for no bearer header; access is decided by the container's proxy permission policy. It trusts only traffic that arrives through the proxy: a request whose source address is private or loopback (curl to the kit's local port from inside the container, the host, or a sibling container) is refused 403, so call the public kit URL even from inside the container.
- The proxy service slug is `agent` and the kit URL host carries the index segment (`-agent-{index}`). Resolve it with `client.getKitUrl('agent', container)` rather than hand-building it.
- `sessions.turns.run` blocks until the turn finishes (or returns `{pending_gate}` the moment a turn parks on a confirm/question) — long un-parked agent turns can still exceed default HTTP client timeouts; prefer streamed prompting for anything non-trivial so you can observe progress and resolve gates as they arrive. (SDK note: the generated `sessions.startTurnAndStream` accessor POSTs `prompt:stream` and returns a Promise of an async iterable of SSE events, so iterate `for await (const ev of await client.agent.sessions.startTurnAndStream(id, { text }))`. Nothing is sent until you start iterating or read `stream.response`. The stream does NOT close when the turn ends: it keeps delivering the session's later events, so break out at the `agent_done` for your own turn. `const stream = await client.agent.sessions.startTurnAndStream(id, { text }); const { documented } = await stream.response;` gives the turn id as `documented.XHoodyTurnId` (the `X-Hoody-Turn-Id` header; a browser sees it only if the kit exposes it over CORS); stop at the `agent_done` whose payload (`JSON.parse(ev.raw)`) carries that `turn_id`. Without the header, take the id from the stream itself: the `replay_boundary` frame's payload carries it as `turn_id`. Buffered frames arrive BEFORE `replay_boundary`, and a fast turn can finish inside them, so keep the `agent_done` frames seen before the boundary and check them against its `turn_id` as soon as it arrives; otherwise stop at the next `agent_done` carrying that `turn_id`. The higher-level `streamAgentPrompt` helper exported from the SDK wraps the same route and exposes `events` / `text` / `done` plus a cancel() method that aborts the turn.) For non-interactive turns where you cannot resolve gates by hand, enable the `auto_approve` gate policy to answer confirm gates for the life of the turn (off by default): an ordinary confirm gate is approved, a gate raised by a tool-call rule is DENIED, and a session whose approval policy is `always` refuses the policy with `409 approval_policy_active` before the turn starts. SDK: `policy: 'auto_approve'` in the `sessions.startTurnAndStream` / `sessions.turns.run` options. This only answers **confirm** gates, never questions.
- Every prompt/gate/cancel call is **session-scoped** — you must hold a session id from `sessions.create` first; there is no implicit default session. Hook writes are session-scoped too (the guarded writes — `hooks.upsert` / `hooks.delete` / `hooks.enable` / `hooks.disable` / `hooks.enableAll` / `hooks.disableAll` — plus `hooks.createWriteIntent`, and the side-effecting `hooks.run` / `hooks.trust`, all require a live `session_id` — `hooks.trust` clears the per-session hook-trust prompt (the execution-trust probe `hooks.list` reports), the gate that must be acknowledged before a saved hook command is allowed to fire, mirroring `skills.trust` for skills; `hooks.reload` accepts one only to also return the reloaded summary) AND nonce-guarded: call `client.agent.hooks.createWriteIntent` (`{ session_id, op, scope }`, op ∈ upsert|delete|toggle|set_disabled) to mint a single-use nonce, then pass that `nonce` on the matching `hooks.upsert` / `hooks.delete` / `hooks.enable` / `hooks.disable` / `hooks.enableAll` / `hooks.disableAll` — the nonce binds to that session+op+scope tuple and the write fails closed without it. Note hooks are an arbitrary-command surface: `hooks.upsert` persists a command that fires on lifecycle events, and `hooks.run` on a command hook runs a command at once: running saved hooks goes through the session's hook-trust gate, while a run that supplies an unsaved inline `command` runs it without that saved-hook trust check. Every command-hook run is refused (`approval_policy_unsatisfiable`) while the session's approval policy is `always`, and `hooks.test` of a shipped hook only evaluates its trigger without running anything. These calls carry no confirmation step of their own — the same access that authorizes any agent-kit call authorizes these too, with nothing extra — so add your own confirmation before exposing this surface to an autonomous caller.
- **`env` and `headers` VALUES are never returned by the MCP surface; every other field comes back verbatim.** `mcp.listServers` reports `env_keys` / `header_keys` — key NAMES only — because a redacted value invites a client to write the placeholder back as the real secret; a write whose body carries the redaction placeholder for a credential is REFUSED rather than stored. Other fields, including `url`, `command` and `args`, are echoed verbatim, so a credential embedded in one of them (a token in a URL, a key on a command line) is NOT redacted: keep secrets in `env` / `headers`, and treat the rest of a listing as sensitive. To change a secret you must supply its real value; to leave one alone, omit the field — `mcp.upsertServer` merges FIELD BY FIELD over the existing entry of the same name, so omitted fields keep their stored value (including fields this build does not model), and `mcp.enableServer` / `mcp.disableServer` flip only the `enabled` flag so credentials and options survive a disable. Writes apply to live sessions before the response returns: a deleted, disabled, or re-pointed server is REVOKED in every live session first (a stdio child is reaped when its last holder releases), so a caller mid-turn cannot still reach it. Import is WHOLE-BATCH — one bad entry aborts everything — it understands the hoody (`mcp_servers` list), Claude/Cursor (`mcpServers` map) and VS Code (`servers` map) dialects, and REFUSES a document carrying more than one of them rather than guessing.
- `client.agent.platform.bootstrapToken` (token bootstrap) is enabled by default; a deployment can turn it off, and then every call answers 404. Browser clients may call it; the body must be exactly `application/json`. Where the deployment requires a capability, the body must carry the matching `capability` (a mismatch is also 404). The token must belong to this box's owner and carry the full login grant (otherwise 403). On a box with no credential it installs (201 `installed`) and adopts any local sessions or todos that have no owner; on a box logged in to the SAME account it replaces the stored token whether or not it expired (200 `renewed`). A token for a different account is refused `409 agent_login_conflict`, and a credential supplied through the environment is never replaced (`409 credential_present`).

## Common errors

- A gate or question left unresolved stalls the turn — a streamed prompt that emitted an `event.confirm_request` (confirm gate) or `event.user_question` (question gate) will not complete until you answer it: `gates.approve` / `gates.deny` for a confirm, `gates.answer` for a question. For unattended runs, arm `sessions.setAutoReply` (a self-driving auto-user loop), or pass `policy: "auto_approve"` on the prompt — but `auto_approve` only answers **confirm** gates (approving ordinary ones, denying rule-raised ones; refused with `409 approval_policy_active` on an `always` session), never questions; a parked question still stalls until `gates.answer` (or the auto-reply loop) answers it.
- `tasks.list` and `tasks.getTranscript` return their data INLINE and need no live session and no attached stream. `tasks.list` is the UNION of the live task registry and the session's PERSISTED task store (keyed by task id, live winning) — the live registry evicts completed tasks when a new one spawns, so a finished task can leave memory while its transcript is still durable, and a live-only list would hide it. `tasks.getTranscript` reads a task that reached a terminal state even for a closed session and after a daemon restart; a task still RUNNING when the daemon died is NOT recoverable and reads 404. Its `source` field is `"live"` or `"store"`, and `complete` reports whether the response reflects a terminal projection DURABLY COMMITTED to that store. `after_seq` is EXCLUSIVE (entries strictly after it, plus any still-open entry); OMITTING it returns the whole transcript, which is distinct from `after_seq=0`. `tasks.cancel` / `sessions.cancelTasks` still act on a LIVE session and stop background tasks mid-turn (server-layer; tasks survive `sessions.turns.cancel` but are not restartable).
- `memory.consolidate` (POST /memory/consolidate) is **human-only and ALWAYS fails over this namespace** — every HTTP/SDK/CLI call returns `403 human_only`; it can only be triggered from an interactive human session. Do not call it programmatically.
- `mcp.testServer` (POST /mcp/probe) is **human-only and ALWAYS fails over this namespace** — probing STARTS A PROCESS (stdio) or makes an outbound request to a caller-chosen URL (http/sse), so a machine caller may not self-approve it and receives `403 human_only` on every HTTP/SDK/CLI call. The surface still exposes it for completeness, it simply always refuses. The deny list is still enforced on the candidate config before anything is started. Use `mcp.previewImport` for a write-free preview instead; there is no programmatic substitute for the live trial.
- An MCP write needs BOTH a `nonce` and an `expect_hash` — neither is optional, and a stale hash is a CONFLICT rather than a silent overwrite. `mcp.upsertServer` / `mcp.deleteServer` / `mcp.enableServer` / `mcp.disableServer` / `mcp.importServers` each require a fresh single-use `nonce` from `mcp.createWriteIntent` minted for that exact op and scope (one minted for a different op or scope fails closed) AND the `mcp_servers` hash you last read, from either `mcp.createWriteIntent` or `mcp.listServers`. A mismatch means someone else edited the layer since you read it — re-read, re-mint, retry; each nonce is good for exactly one write, so a retry always needs a new one. There is no "omit it for the first write" shortcut: writing into a settings file that does not exist yet means passing the empty-array hash.
- `workflows.delete` removes **user** workflows and saved customizations. A built-in/**system** workflow that you never customized is refused (`is_error:true`) and re-seeds on every boot; `workflows.setHidden` is the only way to remove it from view. Deleting your saved customization of a system workflow succeeds and brings the shipped version back: at once in a scoped realm, at the next daemon restart otherwise.
- Empty values on agent-profile edits mean *inherit / unrestrict*, not *clear to nothing*: `definitions.setModel` with `model: ""` removes the model line (falls back to the default model), and `definitions.setTools` with `tools: []` removes the allow-list line, which means **all tools are allowed** (NOT zero). Pass a non-empty `tools` array to genuinely restrict.
- Prompting with no usable model/provider configured fails the turn. `client.agent.providers.list` lists every catalogued provider whether or not it is set up, so check the one you intend to use with `client.agent.providers.getAuth` before you prompt (blocking or streamed): `ready` is true for a stored API key, a stored OAuth login, or a passwordless provider (`no_auth_ready`).
- Calling prompt/gate/cancel against a session whose live connection was torn down (`sessions.close`) returns not-found. If the record survives, re-attach with `sessions.create({ attach: id })`; otherwise start a fresh session (the same create call without `attach`). After a *hard* delete (`sessions.delete`, which always erases the record) the record is gone and only a fresh session works.

## Related namespaces

`terminal`, `exec`, `files`, `notes`, `api`.

## Reference

**Accessor:** `client.agent`  |  **Import:** `import * as agent from 'hoody-sdk/agent'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, containerId?, serviceIndex?, server? }`, which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are refused) and `cache` (a GET's response cache: `true`, a TTL in ms, or `false` to bypass) (no `_realm`: that one is control-plane only). When the signature shows an options object, the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`.

### `client.agent.acp` (5) — Process-wide settings (home settings.json)

#### `disable` — Enable or disable a BYOA ACP backend.

```typescript
client.agent.acp.disable(agent: Parameters<AcpServiceBase['__setACPEnabled']>[0], data?: FacadeWithout<NonNullable<Parameters<AcpServiceBase['__setACPEnabled']>[1]>, "enabled">, options?: NonNullable<Parameters<AcpServiceBase['__setACPEnabled']>[3]>)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `agent` | `string` | path | Yes | The agent. |
| `data` | `FacadeWithout<NonNullable<Parameters<AcpServiceBase['__setACPEnabled']>[1]>, "enabled">` | body | No |  |

**Body:** `{ enabled: bool }`

**Returns:** `ReturnType<AcpServiceBase['__setACPEnabled']>`  |  **HTTP:** `PUT /api/v1/agent/acp/agents/{agent}/enabled`
**CLI:** `hoody agent acp disable`

---

#### `enable` — Enable or disable a BYOA ACP backend.

```typescript
client.agent.acp.enable(agent: Parameters<AcpServiceBase['__setACPEnabled']>[0], data?: FacadeWithout<NonNullable<Parameters<AcpServiceBase['__setACPEnabled']>[1]>, "enabled">, options?: NonNullable<Parameters<AcpServiceBase['__setACPEnabled']>[3]>)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `agent` | `string` | path | Yes | The agent. |
| `data` | `FacadeWithout<NonNullable<Parameters<AcpServiceBase['__setACPEnabled']>[1]>, "enabled">` | body | No |  |

**Body:** `{ enabled: bool }`

**Returns:** `ReturnType<AcpServiceBase['__setACPEnabled']>`  |  **HTTP:** `PUT /api/v1/agent/acp/agents/{agent}/enabled`
**CLI:** `hoody agent acp enable`

---

#### `getStatus` — Get BYOA ACP backend status.

```typescript
client.agent.acp.getStatus(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentAcpGetStatusResponse>`  |  **HTTP:** `GET /api/v1/agent/acp/agents`
**CLI:** `hoody agent acp status`

---

#### `setModel` — Set a BYOA backend's default model and effort.

```typescript
client.agent.acp.setModel(agent: string, data?: AgentAcpSetModelRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `agent` | `string` | path | Yes | The agent. |
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

### `client.agent` (2) — Create, drive, and tear down agent sessions

#### `stopAllWork` — Stop everything running in the realm.

```typescript
client.agent.stopAllWork(data?: AgentStopAllWorkRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
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

### `client.agent.changes` (2) — Changes operations

#### `get` — Change tokens for the Work lists.

```typescript
client.agent.changes.get(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentChangesGetResponse>`  |  **HTTP:** `GET /api/v1/agent/changes`
**CLI:** `hoody agent changes get`

---

#### `stream` — Stream the change tokens (SSE).

```typescript
client.agent.changes.stream(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<IEventStream>`  |  **HTTP:** `GET /api/v1/agent/changes/stream`
**CLI:** `hoody agent changes stream`

---

### `client.agent.completions` (1) — Catalogued models and fusion composites

#### `create` — Run one tool-free model completion.

```typescript
client.agent.completions.create(data: NonNullable<Parameters<CompletionsServiceBase['__streamCompletion']>[0]>, options: NonNullable<Parameters<CompletionsServiceBase['__streamCompletion']>[2]> & { stream: true })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `NonNullable<Parameters<CompletionsServiceBase['__streamCompletion']>[0]>` | body | Yes |  |
| `stream` | `boolean` | option | No | Stream the completion as server-sent events. |

**Body:** `{ model*: string, system: string, messages*: { role*: "user" | "assistant", content*: string }[], settings: { thinking: object, temperature: number, max_tokens: int, response_format: object }, timeout_ms: int }`

- `model` — … The same policy as a session's model: the provider prefix must be catalogued, the model name after it need not be (an uncatalogued name is sent to the provider, which may reject it as upstream_error). An unknown provider or an empty model name is 422 model_unavailable (reason unknown_model); a fusion/ composite is 422 model_unavailable (reason fusion).
- `messages` — 1 to 1000 turns, oldest first; the last must be a user turn.
- `settings` — Optional per-call model settings. A setting the model cannot honour is 400 unsupported_setting, never dropped.

**Returns:** `ReturnType<CompletionsServiceBase['__streamCompletion']>`  |  **HTTP:** `POST /api/v1/agent/completions`
**CLI:** `hoody agent completions create`

---

### `client.agent.containers` (3) — API discovery and related-operation hints

#### `list` — List containers in a realm (for binding).

```typescript
client.agent.containers.list(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentContainersListResponse>`  |  **HTTP:** `GET /api/v1/agent/containers`
**CLI:** `hoody agent containers list`

---

#### `listAll` — List containers in a realm (for binding). (collect all pages)

```typescript
client.agent.containers.listAll(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<(NonNullable<AgentContainersListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/containers`
**CLI:** `hoody agent containers list`

---

#### `listIterator` — List containers in a realm (for binding). (async iterator)

```typescript
client.agent.containers.listIterator(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncGenerator<(NonNullable<AgentContainersListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/containers`
**CLI:** `hoody agent containers list`

---

### `client.agent.definitions` (14) — Chat-agent definitions and per-agent settings

#### `copy` — Copy a chat agent.

```typescript
client.agent.definitions.copy(name: string, data: AgentDefinitionsCopyRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentDefinitionsCopyRequest` | body | Yes |  |

**Body:** `{ new_name*: string }`

**Returns:** `Promise<AgentDefinitionsCopyResponse>`  |  **HTTP:** `POST /api/v1/agent/agents/{name}/copy`
**CLI:** `hoody agent definitions copy`

---

#### `create` — Create a chat-agent definition.

```typescript
client.agent.definitions.create(data: AgentDefinitionsCreateRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentDefinitionsCreateRequest` | body | Yes |  |

**Body:** `{ name*: string, frontmatter: { description: string, model: string, tools: string[], effort: "adaptive" | "low" | "medium" | "high" | "max", max_turns: int, labels: string[], strict_tools: bool, mcp_tools: string[], skills: string[], prompt_blocks: object, ask_timeout: string | int, thinking: "enabled" | "disabled", temperature: number, response_format: "json_object" }, system_prompt: string }`

- `frontmatter` — … Any other key is rejected. strict_tools is a boolean: true gives the agent EXACTLY its tools list — no skill or workflow tool is added, no MCP tool unless mcp_tools names it, and a call to any other tool is refused — and with no tools list it gets only ask_question_to_user, todo_read …

**Returns:** `Promise<AgentDefinitionsCreateResponse>`  |  **HTTP:** `POST /api/v1/agent/agents`
**CLI:** `hoody agent definitions create`

---

#### `delete` — Delete a custom chat agent.

```typescript
client.agent.definitions.delete(name: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentDefinitionsDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/agent/agents/{name}`
**CLI:** `hoody agent definitions delete`

---

#### `getSource` — Read a chat agent's source.

```typescript
client.agent.definitions.getSource(name: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentDefinitionsGetSourceResponse>`  |  **HTTP:** `GET /api/v1/agent/agents/{name}/source`
**CLI:** `hoody agent definitions source get`

---

#### `list` — List chat-agent definitions.

```typescript
client.agent.definitions.list(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentDefinitionsListResponse>`  |  **HTTP:** `GET /api/v1/agent/agents`
**CLI:** `hoody agent definitions list`

---

#### `listAll` — List chat-agent definitions. (collect all pages)

```typescript
client.agent.definitions.listAll(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<(NonNullable<AgentDefinitionsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/agents`
**CLI:** `hoody agent definitions list`

---

#### `listIterator` — List chat-agent definitions. (async iterator)

```typescript
client.agent.definitions.listIterator(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncGenerator<(NonNullable<AgentDefinitionsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/agents`
**CLI:** `hoody agent definitions list`

---

#### `rename` — Rename a chat agent.

```typescript
client.agent.definitions.rename(name: string, data: AgentDefinitionsRenameRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentDefinitionsRenameRequest` | body | Yes |  |

**Body:** `{ new_name*: string }`

**Returns:** `Promise<AgentDefinitionsRenameResponse>`  |  **HTTP:** `POST /api/v1/agent/agents/{name}/rename`
**CLI:** `hoody agent definitions rename`

---

#### `reset` — Reset an agent to its shipped default.

```typescript
client.agent.definitions.reset(name: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentDefinitionsResetResponse>`  |  **HTTP:** `POST /api/v1/agent/agents/{name}/reset-to-shipped`
**CLI:** `hoody agent definitions reset`

---

#### `setModel` — Set an agent's model.

```typescript
client.agent.definitions.setModel(name: string, data?: AgentDefinitionsSetModelRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentDefinitionsSetModelRequest` | body | No |  |

**Body:** `{ model: string }`

**Returns:** `Promise<AgentDefinitionsSetModelResponse>`  |  **HTTP:** `PATCH /api/v1/agent/agents/{name}/model`
**CLI:** `hoody agent definitions model set`

---

#### `setSource` — Write a chat agent's source.

```typescript
client.agent.definitions.setSource(name: string, data: AgentDefinitionsSetSourceRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentDefinitionsSetSourceRequest` | body | Yes |  |

**Body:** `{ content*: string, expected_revision: string }`

- `content` — … Frontmatter is read as one `key: value` per line: a `tools:` line must be a comma-separated list on that same line, because a YAML block list underneath it parses to NOTHING and the agent is then granted every tool — the opposite of the restriction it looks like. The turn cap is spelled `max_turns`; a `turns` line is ignored.
- `expected_revision` — … A save whose source changed since is refused 409 revision_conflict (details.current_revision) and writes nothing. … The revision is bound to the realm this request resolves to: on a gateway without a realm pin, a revision read while another realm was active is refused 409 revision_conflict (details.current_revision is this realm's), never written into the other realm.

**Returns:** `Promise<AgentDefinitionsSetSourceResponse>`  |  **HTTP:** `PUT /api/v1/agent/agents/{name}/source`
**CLI:** `hoody agent definitions source set`

---

#### `setTools` — Set an agent's tool allow-list.

```typescript
client.agent.definitions.setTools(name: string, data: AgentDefinitionsSetToolsRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentDefinitionsSetToolsRequest` | body | Yes |  |

**Body:** `{ tools*: string[] }`

**Returns:** `Promise<AgentDefinitionsSetToolsResponse>`  |  **HTTP:** `PATCH /api/v1/agent/agents/{name}/tools`
**CLI:** `hoody agent definitions tools set`

---

#### `setTurnLimit` — Set an agent's max-turns.

```typescript
client.agent.definitions.setTurnLimit(name: string, data?: AgentDefinitionsSetTurnLimitRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentDefinitionsSetTurnLimitRequest` | body | No |  |

**Body:** `{ turns: int }`

**Returns:** `Promise<AgentDefinitionsSetTurnLimitResponse>`  |  **HTTP:** `PATCH /api/v1/agent/agents/{name}/turns`
**CLI:** `hoody agent definitions turns limit set`

---

#### `toggleTool` — Toggle a single tool for an agent.

```typescript
client.agent.definitions.toggleTool(name: string, tool: string, data?: AgentDefinitionsToggleToolRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `tool` | `string` | path | Yes | The tool. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentDefinitionsToggleToolRequest` | body | No |  |

**Returns:** `Promise<AgentDefinitionsToggleToolResponse>`  |  **HTTP:** `POST /api/v1/agent/agents/{name}/tools/{tool}/toggle`
**CLI:** `hoody agent definitions tools toggle`

---

### `client.agent.files` (3) — Chat-agent definitions and per-agent settings

#### `list` — List the files that shape the agents.

```typescript
client.agent.files.list(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentFilesListResponse>`  |  **HTTP:** `GET /api/v1/agent/agent-files`
**CLI:** `hoody agent files list`

---

#### `listAll` — List the files that shape the agents. (collect all pages)

```typescript
client.agent.files.listAll(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<(NonNullable<AgentFilesListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/agent-files`
**CLI:** `hoody agent files list`

---

#### `listIterator` — List the files that shape the agents. (async iterator)

```typescript
client.agent.files.listIterator(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

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
client.agent.gates.answer(id: string, data: AgentGatesAnswerRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentGatesAnswerRequest` | body | Yes |  |

**Body:** `{ gate_id: string, generation: int, answer*: string, text: string, answers: { [key: string]: string } }`

- `gate_id` — Echo of the parked gate id, as published on the frame that parked it (gate.id), by GET /sessions/{id} (pending_gate.id) and in 409 details. Valid only for the session in the path. Optional for compatibility, but an answer without it applies to whatever gate is parked when it arrives — a client binding an answer to a gate the user saw must send it. Ids are unique per session incarnation, so an id from before a re-attach never matches (stale/mismatch → 409).

**Returns:** `Promise<AgentGatesAnswerResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/answer`
**CLI:** `hoody agent gates answer`

---

#### `approve` — Answer a parked confirm gate (on an always-approval session also --gate-id, --generation and the approver lease).

```typescript
client.agent.gates.approve(id: Parameters<GatesServiceBase['__confirmGate']>[0], ...args: FacadeBodyArgs<FacadeWithout<NonNullable<Parameters<GatesServiceBase['__confirmGate']>[1]>, "approved">, [options?: NonNullable<Parameters<GatesServiceBase['__confirmGate']>[2]>, _templateVars?: Parameters<GatesServiceBase['__confirmGate']>[3]]>)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `X-Hoody-Approver-Lease` | `string` | header | No | The approver-lease capability returned by POST /sessions/{id}/approver-lease. Required on every decision (/confirm, or the confirmed re-issue of a gated tool run) on an "always" session whose lease was minted; the daemon verifies it at decision consumption. On renew/release it names the lease to act on. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ gate_id: string, generation: int, approved*: bool, persist_dirs: bool, session_scope: bool, trust_container: bool, request_id: string, lease_generation: int }`

- `gate_id` — Echo of the parked gate id, as published on the frame that parked it (gate.id), by GET /sessions/{id} (pending_gate.id) and in 409 details. Valid only for the session in the path. Optional for compatibility, but an answer without it applies to whatever gate is parked when it arrives — a client binding an answer to a gate the user saw must send it. Ids are unique per session incarnation, so an id from before a re-attach never matches (stale/mismatch → 409). Required on a session that requires approval on every action: a confirm without it is rejected 400.
- `generation` — Echo of the parked gate generation. It restarts when the session is re-attached, so it is not an identity on its own — send gate_id. Optional on a default-policy session; required, and non-zero, on a session that requires approval on every action.
- `approved` — Required: true to approve, false to deny. There is no default; a missing, null or non-boolean value is rejected 400.
- `session_scope` — Remember this decision for the rest of the session (the Allow/Deny for session answer): with approved true the tool stops asking, with approved false it is refused without asking. Offer allow-for-session only when the gate's event.confirm_request carried offer_session_allow. Under a locked approval policy the wider grant is refused, but the one-shot decision still applies and the reply says so (session_scope_applied false, note).
- `request_id` — Optional: the caller's own id for this decision, at most 64 characters from A-Z, a-z, 0-9, '.', '_' and '-' (anything else is 400 bad_request). When this decision is the one the gate consumed, a later 409 gate_already_resolved for the gate echoes it as details.request_id, so a caller that lost the 200 knows the recorded decision is its own.
- `lease_generation` — … A decision carrying the lease capability (X-Hoody-Approver-Lease) is checked against the current lease whatever it sends; without one, a stale generation is refused. …

**Returns:** `ReturnType<GatesServiceBase['__confirmGate']>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/confirm`
**CLI:** `hoody agent gates approve`

---

#### `deny` — Answer a parked confirm gate (on an always-approval session also --gate-id, --generation and the approver lease).

```typescript
client.agent.gates.deny(id: Parameters<GatesServiceBase['__confirmGate']>[0], ...args: FacadeBodyArgs<FacadeWithout<NonNullable<Parameters<GatesServiceBase['__confirmGate']>[1]>, "approved">, [options?: NonNullable<Parameters<GatesServiceBase['__confirmGate']>[2]>, _templateVars?: Parameters<GatesServiceBase['__confirmGate']>[3]]>)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `X-Hoody-Approver-Lease` | `string` | header | No | The approver-lease capability returned by POST /sessions/{id}/approver-lease. Required on every decision (/confirm, or the confirmed re-issue of a gated tool run) on an "always" session whose lease was minted; the daemon verifies it at decision consumption. On renew/release it names the lease to act on. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ gate_id: string, generation: int, approved*: bool, persist_dirs: bool, session_scope: bool, trust_container: bool, request_id: string, lease_generation: int }`

- `gate_id` — Echo of the parked gate id, as published on the frame that parked it (gate.id), by GET /sessions/{id} (pending_gate.id) and in 409 details. Valid only for the session in the path. Optional for compatibility, but an answer without it applies to whatever gate is parked when it arrives — a client binding an answer to a gate the user saw must send it. Ids are unique per session incarnation, so an id from before a re-attach never matches (stale/mismatch → 409). Required on a session that requires approval on every action: a confirm without it is rejected 400.
- `generation` — Echo of the parked gate generation. It restarts when the session is re-attached, so it is not an identity on its own — send gate_id. Optional on a default-policy session; required, and non-zero, on a session that requires approval on every action.
- `approved` — Required: true to approve, false to deny. There is no default; a missing, null or non-boolean value is rejected 400.
- `session_scope` — Remember this decision for the rest of the session (the Allow/Deny for session answer): with approved true the tool stops asking, with approved false it is refused without asking. Offer allow-for-session only when the gate's event.confirm_request carried offer_session_allow. Under a locked approval policy the wider grant is refused, but the one-shot decision still applies and the reply says so (session_scope_applied false, note).
- `request_id` — Optional: the caller's own id for this decision, at most 64 characters from A-Z, a-z, 0-9, '.', '_' and '-' (anything else is 400 bad_request). When this decision is the one the gate consumed, a later 409 gate_already_resolved for the gate echoes it as details.request_id, so a caller that lost the 200 knows the recorded decision is its own.
- `lease_generation` — … A decision carrying the lease capability (X-Hoody-Approver-Lease) is checked against the current lease whatever it sends; without one, a stale generation is refused. …

**Returns:** `ReturnType<GatesServiceBase['__confirmGate']>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/confirm`
**CLI:** `hoody agent gates deny`

---

#### `list` — List the gates waiting for a human.

```typescript
client.agent.gates.list(options?: { include_system?: boolean; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_system` | `boolean` | query | No | When true, also list the gates of daemon-owned system/resident sessions (as `curl.sessions.list` does). |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page, at most 100: 0 or omitted means 100, and a larger value is served as 100 (meta.limit echoes the value used). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentGatesListResponse>`  |  **HTTP:** `GET /api/v1/agent/gates`
**CLI:** `hoody agent gates list`

---

#### `listAll` — List the gates waiting for a human. (collect all pages)

```typescript
client.agent.gates.listAll(options?: { include_system?: boolean; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_system` | `boolean` | query | No | When true, also list the gates of daemon-owned system/resident sessions (as `curl.sessions.list` does). |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page, at most 100: 0 or omitted means 100, and a larger value is served as 100 (meta.limit echoes the value used). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<(NonNullable<AgentGatesListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/gates`
**CLI:** `hoody agent gates list`

---

#### `listIterator` — List the gates waiting for a human. (async iterator)

```typescript
client.agent.gates.listIterator(options?: { include_system?: boolean; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_system` | `boolean` | query | No | When true, also list the gates of daemon-owned system/resident sessions (as `curl.sessions.list` does). |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page, at most 100: 0 or omitted means 100, and a larger value is served as 100 (meta.limit echoes the value used). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `AsyncGenerator<(NonNullable<AgentGatesListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/gates`
**CLI:** `hoody agent gates list`

---

#### `suggest` — Propose answers for a parked question (helper model).

```typescript
client.agent.gates.suggest(id: string, data?: AgentGatesSuggestRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentGatesSuggestRequest` | body | No |  |

**Body:** `{ mode: string, model: string, gen: int }`

**Returns:** `Promise<AgentGatesSuggestResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/answer:assist`
**CLI:** `hoody agent gates suggest`

---

### `client.agent.github` (30) — GitHub auth, repos, clone, status, commit, sync, PRs

#### `checkoutPr` — Check out a pull request.

```typescript
client.agent.github.checkoutPr(data: AgentGithubCheckoutPrRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentGithubCheckoutPrRequest` | body | Yes |  |

**Body:** `{ number*: string | int }`

- `number` — The PR number (required): a positive decimal string such as "42", or the JSON integer `agent.github.listPrs` returns. An empty value, 0, a fraction, a negative or anything non-numeric is refused, so a branch name or URL can never be smuggled in as a target.

**Returns:** `Promise<AgentGithubCheckoutPrResponse>`  |  **HTTP:** `POST /api/v1/agent/github/pr/checkout`
**CLI:** `hoody agent github prs checkout`

---

#### `clone` — Clone a GitHub repository.

```typescript
client.agent.github.clone(data?: AgentGithubCloneRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
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
client.agent.github.createBranch(data: AgentGithubCreateBranchRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentGithubCreateBranchRequest` | body | Yes |  |

**Body:** `{ branch*: string }`

- `branch` — The new branch name (required). Validated as a safe ref name before it reaches git — a leading dash, a whitespace/control character, or a name git itself would reject is refused with a 400.

**Returns:** `Promise<AgentGithubCreateBranchResponse>`  |  **HTTP:** `POST /api/v1/agent/github/branch`
**CLI:** `hoody agent github branches create`

---

#### `createCommit` — Stage all and commit.

```typescript
client.agent.github.createCommit(data: NonNullable<Parameters<GithubServiceBase['__githubCommitPush']>[0]>, options: NonNullable<Parameters<GithubServiceBase['__githubCommitPush']>[1]> & { push: true })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `NonNullable<Parameters<GithubServiceBase['__githubCommitPush']>[0]>` | body | Yes |  |
| `push` | `boolean` | option | No | Stage, commit and push in one call. |

**Body:** `{ message*: string }`

**Returns:** `ReturnType<GithubServiceBase['__githubCommitPush']>`  |  **HTTP:** `POST /api/v1/agent/github/commit`
**CLI:** `hoody agent github commits create`

---

#### `createIssue` — Open an issue.

```typescript
client.agent.github.createIssue(data: AgentGithubCreateIssueRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentGithubCreateIssueRequest` | body | Yes |  |

**Body:** `{ title*: string, body: string }`

- `title` — The issue title (required, non-empty — the daemon refuses an empty title).

**Returns:** `Promise<AgentGithubCreateIssueResponse>`  |  **HTTP:** `POST /api/v1/agent/github/issues`
**CLI:** `hoody agent github issues create`

---

#### `createPr` — Open a pull request.

```typescript
client.agent.github.createPr(data: AgentGithubCreatePrRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentGithubCreatePrRequest` | body | Yes |  |

**Body:** `{ title*: string, body: string, base: string }`

- `title` — The PR title (required, non-empty).

**Returns:** `Promise<AgentGithubCreatePrResponse>`  |  **HTTP:** `POST /api/v1/agent/github/pr`
**CLI:** `hoody agent github prs create`

---

#### `createWorktree` — Add a linked worktree.

```typescript
client.agent.github.createWorktree(data: AgentGithubCreateWorktreeRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentGithubCreateWorktreeRequest` | body | Yes |  |

**Body:** `{ path*: string, branch: string, start_ref: string }`

- `path` — Where to create the worktree (required). Lexically validated and checked against the session's deny list before git runs; a traversing or deny-listed path is refused with a 400. Must not already exist as a non-empty directory.

**Returns:** `Promise<AgentGithubCreateWorktreeResponse>`  |  **HTTP:** `POST /api/v1/agent/github/worktrees`
**CLI:** `hoody agent github worktrees create`

---

#### `deleteBranch` — Force-delete a local branch.

```typescript
client.agent.github.deleteBranch(data: AgentGithubDeleteBranchRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentGithubDeleteBranchRequest` | body | Yes |  |

**Body:** `{ branch*: string }`

- `branch` — The local branch name (required), as `agent.github.listBranches` reports it. Passed after `--`, so it is never read as an option.

**Returns:** `Promise<AgentGithubDeleteBranchResponse>`  |  **HTTP:** `POST /api/v1/agent/github/branch/delete`
**CLI:** `hoody agent github branches delete`

---

#### `deleteWorktree` — Remove a linked worktree.

```typescript
client.agent.github.deleteWorktree(data: AgentGithubDeleteWorktreeRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentGithubDeleteWorktreeRequest` | body | Yes |  |

**Body:** `{ path*: string, force: bool }`

- `path` — The worktree's path (required), as `agent.github.listWorktrees` reports it. Must not be the main checkout.
- `force` — Optional, default false. Removes the worktree EVEN WITH uncommitted or untracked changes (git worktree remove --force), DISCARDING them — they are not stashed and cannot be recovered. Must be a JSON boolean.

**Returns:** `Promise<AgentGithubDeleteWorktreeResponse>`  |  **HTTP:** `POST /api/v1/agent/github/worktrees/remove`
**CLI:** `hoody agent github worktrees delete`

---

#### `diff` — Read the working-tree diff.

```typescript
client.agent.github.diff(options?: { staged?: boolean; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `staged` | `boolean` | query | No | When true, return the STAGED (index) diff — what a commit would record — instead of the unstaged working-tree diff. Defaults to false. Accepts true/1/yes/on; every other value, including an empty one, is false. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |

**Returns:** `Promise<AgentGithubDiffResponse>`  |  **HTTP:** `GET /api/v1/agent/github/diff`
**CLI:** `hoody agent github diff`

---

#### `getAuth` — GitHub auth status.

```typescript
client.agent.github.getAuth()
```

**Returns:** `Promise<AgentGithubGetAuthResponse>`  |  **HTTP:** `GET /api/v1/agent/github/auth/status`
**CLI:** `hoody agent github auth status`

---

#### `getStatus` — GitHub working-tree status.

```typescript
client.agent.github.getStatus(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentGithubGetStatusResponse>`  |  **HTTP:** `GET /api/v1/agent/github/status`
**CLI:** `hoody agent github status`

---

#### `listBranches` — List GitHub branches.

```typescript
client.agent.github.listBranches(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentGithubListBranchesResponse>`  |  **HTTP:** `GET /api/v1/agent/github/branches`
**CLI:** `hoody agent github branches list`

---

#### `listCommits` — Read recent commit history.

```typescript
client.agent.github.listCommits(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentGithubListCommitsResponse>`  |  **HTTP:** `GET /api/v1/agent/github/log`
**CLI:** `hoody agent github commits list`

---

#### `listIssues` — List issues.

```typescript
client.agent.github.listIssues(options: { owner: string; repo: string; state?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `owner` | `string` | query | Yes | Repository owner (user or org login). Required — not derived from the bound checkout; `agent.github.resolveRepo` returns it. |
| `repo` | `string` | query | Yes | Repository name without the owner. Required, same source as `owner`. |
| `state` | `string` | query | No | Which issues to return: open (the default when omitted), closed, or all. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |

**Returns:** `Promise<AgentGithubListIssuesResponse>`  |  **HTTP:** `GET /api/v1/agent/github/issues`
**CLI:** `hoody agent github issues list`

---

#### `listPrs` — List pull requests.

```typescript
client.agent.github.listPrs(options: { owner: string; repo: string; state?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `owner` | `string` | query | Yes | Repository owner (user or org login), e.g. "octocat". Required — it is NOT derived from the bound checkout; `agent.github.resolveRepo` returns it. |
| `repo` | `string` | query | Yes | Repository name without the owner, e.g. "Hello-World". Required, same source as `owner`. |
| `state` | `string` | query | No | Which pull requests to return: open (the default when omitted), closed, or all. An unrecognized value is passed through to GitHub, which rejects it. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |

**Returns:** `Promise<AgentGithubListPrsResponse>`  |  **HTTP:** `GET /api/v1/agent/github/pr`
**CLI:** `hoody agent github prs list`

---

#### `listRepos` — List GitHub repos.

```typescript
client.agent.github.listRepos(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |

**Returns:** `Promise<AgentGithubListReposResponse>`  |  **HTTP:** `GET /api/v1/agent/github/repos`
**CLI:** `hoody agent github repos list`

---

#### `listWorktrees` — List linked worktrees.

```typescript
client.agent.github.listWorktrees(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentGithubListWorktreesResponse>`  |  **HTTP:** `GET /api/v1/agent/github/worktrees`
**CLI:** `hoody agent github worktrees list`

---

#### `login` — Start a GitHub device-flow login (or add a PAT).

```typescript
client.agent.github.login(data?: AgentGithubLoginRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentGithubLoginRequest` | body | No |  |

**Body:** `{ token: string, host: string, activate: bool }`

- `host` — GitHub host for GitHub Enterprise (GHES); defaults to github.com. Must match the host on the subsequent poll call.
- `activate` — Whether the linked account becomes the ACTIVE one. … A non-boolean value is rejected.

**Returns:** `Promise<AgentGithubLoginResponse>`  |  **HTTP:** `POST /api/v1/agent/github/auth/login`
**CLI:** `hoody agent github auth login`

---

#### `logout` — Remove a linked GitHub account.

```typescript
client.agent.github.logout(data: AgentGithubLogoutRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentGithubLogoutRequest` | body | Yes |  |

**Body:** `{ key*: string }`

**Returns:** `Promise<AgentGithubLogoutResponse>`  |  **HTTP:** `POST /api/v1/agent/github/auth/logout`
**CLI:** `hoody agent github auth logout`

---

#### `mergePr` — Merge a pull request.

```typescript
client.agent.github.mergePr(data: AgentGithubMergePrRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentGithubMergePrRequest` | body | Yes |  |

**Body:** `{ number*: string | int, method: "merge" | "squash" | "rebase" }`

- `number` — The PR number (required): a positive decimal string such as "42", or the JSON integer `agent.github.listPrs` returns. Anything else — 0, a fraction, a branch name or URL — is refused, so the merge can never target a different PR.

**Returns:** `Promise<AgentGithubMergePrResponse>`  |  **HTTP:** `POST /api/v1/agent/github/pr/merge`
**CLI:** `hoody agent github prs merge`

---

#### `pollLogin` — Poll a GitHub device-flow login to completion.

```typescript
client.agent.github.pollLogin(data: AgentGithubPollLoginRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentGithubPollLoginRequest` | body | Yes |  |

**Body:** `{ host: string, device_code*: string, interval: int, expires_in: int, activate: bool }`

- `host` — The GitHub host (default github.com); must match the start call.

**Returns:** `Promise<AgentGithubPollLoginResponse>`  |  **HTTP:** `POST /api/v1/agent/github/auth/login/poll`
**CLI:** `hoody agent github auth poll`

---

#### `popStash` — Restore the most recent stash entry.

```typescript
client.agent.github.popStash(data?: AgentGithubPopStashRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentGithubPopStashRequest` | body | No |  |

**Returns:** `Promise<AgentGithubPopStashResponse>`  |  **HTTP:** `POST /api/v1/agent/github/stash/pop`
**CLI:** `hoody agent github stash pop`

---

#### `pushStash` — Stash the working tree.

```typescript
client.agent.github.pushStash(data?: AgentGithubPushStashRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentGithubPushStashRequest` | body | No |  |

**Returns:** `Promise<AgentGithubPushStashResponse>`  |  **HTTP:** `POST /api/v1/agent/github/stash`
**CLI:** `hoody agent github stash push`

---

#### `resolveRepo` — Resolve the bound repository's owner/name.

```typescript
client.agent.github.resolveRepo(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentGithubResolveRepoResponse>`  |  **HTTP:** `GET /api/v1/agent/github/identity`
**CLI:** `hoody agent github repos resolve`

---

#### `setRepoCredentials` — Re-write a checkout's GitHub credential.

```typescript
client.agent.github.setRepoCredentials(data?: AgentGithubSetRepoCredentialsRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentGithubSetRepoCredentialsRequest` | body | No |  |

**Returns:** `Promise<AgentGithubSetRepoCredentialsResponse>`  |  **HTTP:** `POST /api/v1/agent/github/repo/reconnect`
**CLI:** `hoody agent github repos credentials set`

---

#### `suggestCommitMessage` — Draft a commit message with a model.

```typescript
client.agent.github.suggestCommitMessage(data: AgentGithubSuggestCommitMessageRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentGithubSuggestCommitMessageRequest` | body | Yes |  |

**Body:** `{ model*: string }`

- `model` — A concrete model spec, e.g. "anthropic/claude-sonnet-4-6" (required). A fusion/ composite cannot back a one-shot call and is refused.

**Returns:** `Promise<AgentGithubSuggestCommitMessageResponse>`  |  **HTTP:** `POST /api/v1/agent/github/commit/suggest-message`
**CLI:** `hoody agent github commits message suggest`

---

#### `sync` — Sync (fetch → pull → push).

```typescript
client.agent.github.sync(data?: AgentGithubSyncRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentGithubSyncRequest` | body | No |  |

**Body:** `{ direction: string, set_upstream: bool, force: bool }`

- `set_upstream` — Optional, default false: PUBLISH the current branch — push it and make it track the same-named branch on its remote. … Refused (502 sync_step_failed, step code upstream_exists) when the branch already tracks a DIFFERENT remote branch; a no-op when it already tracks exactly that one. …
- `force` — Optional, default false. … The lease only refuses when the remote moved since this repository last fetched it — and the full sync fetches first, so on a full sync it protects almost nothing. … Ignored by the fetch and pull legs. Must be a JSON boolean.

**Returns:** `Promise<AgentGithubSyncResponse>`  |  **HTTP:** `POST /api/v1/agent/github/sync`
**CLI:** `hoody agent github sync`

---

#### `useAccount` — Switch the active GitHub account.

```typescript
client.agent.github.useAccount(data: AgentGithubUseAccountRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentGithubUseAccountRequest` | body | Yes |  |

**Body:** `{ key*: string }`

**Returns:** `Promise<AgentGithubUseAccountResponse>`  |  **HTTP:** `POST /api/v1/agent/github/auth/active`
**CLI:** `hoody agent github accounts use`

---

#### `useBranch` — Switch to an existing branch.

```typescript
client.agent.github.useBranch(data: AgentGithubUseBranchRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentGithubUseBranchRequest` | body | Yes |  |

**Body:** `{ branch*: string }`

- `branch` — An existing branch name (required), as `agent.github.listBranches` reports it. Validated as a safe ref name; the switch fails rather than creating a branch that does not exist.

**Returns:** `Promise<AgentGithubUseBranchResponse>`  |  **HTTP:** `POST /api/v1/agent/github/branch/switch`
**CLI:** `hoody agent github branches use`

---

### `client.agent.headless` (2) — One-shot headless agent runs

#### `start` — Create a headless one-shot run.

```typescript
client.agent.headless.start(data?: FacadeWithout<FacadeWithout<NonNullable<Parameters<HeadlessServiceBase['__createHeadlessRunJson']>[0]>, "stream">, "format"> & { format?: "text" | "json" }, options?: NonNullable<Parameters<HeadlessServiceBase['__createHeadlessRunJson']>[1]>)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `FacadeWithout<FacadeWithout<NonNullable<Parameters<HeadlessServiceBase['__createHeadlessRunJson']>[0]>, "stream">, "format"> & { format?: "text" \| "json" }` | body | No |  |

**Body:** `{ prompt: string, workflow: string, inputs: { [key: string]: string }, model: string, format: string, stream: bool, timeout_ms: int }`

- `prompt` — The prompt to drive the ephemeral session. Required unless workflow is set; with a workflow it is the optional $(workflow.prompt) text.
- `inputs` — Optional run-time values for the workflow's DECLARED input parameters (declared name → string value; resolves to $(input.<name>) in every step). Only accepted with workflow. A workflow with a REQUIRED declared parameter cannot run without these. Values must be strings; a non-string value is a 400.
- `timeout_ms` — Optional run timeout in milliseconds (clamped to the hard ceiling).

**Returns:** `ReturnType<HeadlessServiceBase['__createHeadlessRunJson']>`  |  **HTTP:** `POST /api/v1/agent/headless/runs`
**CLI:** `hoody agent headless start`

---

#### `stream` — Create a headless one-shot run.

```typescript
client.agent.headless.stream(data?: FacadeWithout<NonNullable<Parameters<HeadlessServiceBase['__createHeadlessRun']>[0]>, "stream">, options?: NonNullable<Parameters<HeadlessServiceBase['__createHeadlessRun']>[1]>)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `FacadeWithout<NonNullable<Parameters<HeadlessServiceBase['__createHeadlessRun']>[0]>, "stream">` | body | No |  |

**Body:** `{ prompt: string, workflow: string, inputs: { [key: string]: string }, model: string, format: string, stream: bool, timeout_ms: int }`

- `prompt` — The prompt to drive the ephemeral session. Required unless workflow is set; with a workflow it is the optional $(workflow.prompt) text.
- `inputs` — Optional run-time values for the workflow's DECLARED input parameters (declared name → string value; resolves to $(input.<name>) in every step). Only accepted with workflow. A workflow with a REQUIRED declared parameter cannot run without these. Values must be strings; a non-string value is a 400.
- `timeout_ms` — Optional run timeout in milliseconds (clamped to the hard ceiling).

**Returns:** `ReturnType<HeadlessServiceBase['__createHeadlessRun']>`  |  **HTTP:** `POST /api/v1/agent/headless/runs`
**CLI:** `hoody agent headless stream`

---

### `client.agent.hooks` (14) — Lifecycle hook configuration

#### `createWriteIntent` — Begin a hook write (nonce).

```typescript
client.agent.hooks.createWriteIntent(data: AgentHooksCreateWriteIntentRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentHooksCreateWriteIntentRequest` | body | Yes |  |

**Body:** `{ session_id*: string, op*: "upsert" | "delete" | "toggle" | "set_disabled" | "rules_set", scope*: string }`

- `op` — The write the nonce authorizes: upsert (`agent.hooks.upsert`), delete (`agent.hooks.delete`), toggle (`agent.hooks.enable`), set_disabled (`agent.hooks.enableAll`) or rules_set (`agent.hooks.setRules`). The nonce is rejected by any other op.

**Returns:** `Promise<AgentHooksCreateWriteIntentResponse>`  |  **HTTP:** `POST /api/v1/agent/hooks/begin-write`
**CLI:** `hoody agent hooks intents create`

---

#### `delete` — Delete a hook.

```typescript
client.agent.hooks.delete(data: AgentHooksDeleteRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentHooksDeleteRequest` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: string, event*: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", matcher: string, command: string }`

- `scope` — Scope of the settings file to write (must match the nonce's scope).
- `event` — Lifecycle event of the hook to remove; required — the daemon rejects any value outside the enum.

**Returns:** `Promise<AgentHooksDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/agent/hooks`
**CLI:** `hoody agent hooks delete`

---

#### `disable` — Toggle a hook.

```typescript
client.agent.hooks.disable(data: FacadeWithout<NonNullable<Parameters<HooksServiceBase['__toggleHook']>[0]>, "enabled" | "event" | "matcher" | "command" | "disabled"> & FacadeRequire<NonNullable<Parameters<HooksServiceBase['__toggleHook']>[0]>, "shipped_id">, options?: NonNullable<Parameters<HooksServiceBase['__toggleHook']>[1]>)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `FacadeWithout<NonNullable<Parameters<HooksServiceBase['__toggleHook']>[0]>, "enabled" \| "event" \| "matcher" \| "command" \| "disabled"> & FacadeRequire<NonNullable<Parameters<HooksServiceBase['__toggleHook']>[0]>, "shipped_id">` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: string, shipped_id: string, enabled: bool, event: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", matcher: string, command: string, disabled: bool }`

- `scope` — Scope of the settings file to write (must match the nonce's scope).
- `event` — Lifecycle event of the ordinary hook to toggle; required on that branch (with matcher + command).
- `command` — Command text of the ordinary hook to toggle (exact match); required on that branch — a toggle must resolve to an existing entry.

**Returns:** `ReturnType<HooksServiceBase['__toggleHook']>`  |  **HTTP:** `POST /api/v1/agent/hooks/toggle`
**CLI:** `hoody agent hooks disable`

---

#### `disableAll` — Disable all hooks.

```typescript
client.agent.hooks.disableAll(...args: FacadeBodyArgs<FacadeWithout<NonNullable<Parameters<HooksServiceBase['__disableAllHooks']>[0]>, "value">, [options?: NonNullable<Parameters<HooksServiceBase['__disableAllHooks']>[1]>, _templateVars?: Parameters<HooksServiceBase['__disableAllHooks']>[2]]>)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: string, value*: bool }`

- `scope` — Scope of the settings file to write (must match the nonce's scope).
- `value` — New kill-switch state: true disables all hooks in this scope, false clears the setting and re-enables them. REQUIRED — an absent value is read as false, i.e. as a re-enable.

**Returns:** `ReturnType<HooksServiceBase['__disableAllHooks']>`  |  **HTTP:** `POST /api/v1/agent/hooks/disable-all`
**CLI:** `hoody agent hooks disable`

---

#### `enable` — Toggle a hook.

```typescript
client.agent.hooks.enable(data: FacadeWithout<NonNullable<Parameters<HooksServiceBase['__toggleHook']>[0]>, "enabled" | "event" | "matcher" | "command" | "disabled"> & FacadeRequire<NonNullable<Parameters<HooksServiceBase['__toggleHook']>[0]>, "shipped_id">, options?: NonNullable<Parameters<HooksServiceBase['__toggleHook']>[1]>)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `FacadeWithout<NonNullable<Parameters<HooksServiceBase['__toggleHook']>[0]>, "enabled" \| "event" \| "matcher" \| "command" \| "disabled"> & FacadeRequire<NonNullable<Parameters<HooksServiceBase['__toggleHook']>[0]>, "shipped_id">` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: string, shipped_id: string, enabled: bool, event: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", matcher: string, command: string, disabled: bool }`

- `scope` — Scope of the settings file to write (must match the nonce's scope).
- `event` — Lifecycle event of the ordinary hook to toggle; required on that branch (with matcher + command).
- `command` — Command text of the ordinary hook to toggle (exact match); required on that branch — a toggle must resolve to an existing entry.

**Returns:** `ReturnType<HooksServiceBase['__toggleHook']>`  |  **HTTP:** `POST /api/v1/agent/hooks/toggle`
**CLI:** `hoody agent hooks enable`

---

#### `enableAll` — Disable all hooks.

```typescript
client.agent.hooks.enableAll(...args: FacadeBodyArgs<FacadeWithout<NonNullable<Parameters<HooksServiceBase['__disableAllHooks']>[0]>, "value">, [options?: NonNullable<Parameters<HooksServiceBase['__disableAllHooks']>[1]>, _templateVars?: Parameters<HooksServiceBase['__disableAllHooks']>[2]]>)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: string, value*: bool }`

- `scope` — Scope of the settings file to write (must match the nonce's scope).
- `value` — New kill-switch state: true disables all hooks in this scope, false clears the setting and re-enables them. REQUIRED — an absent value is read as false, i.e. as a re-enable.

**Returns:** `ReturnType<HooksServiceBase['__disableAllHooks']>`  |  **HTTP:** `POST /api/v1/agent/hooks/disable-all`
**CLI:** `hoody agent hooks enable`

---

#### `getRules` — Get the tool-call rules.

```typescript
client.agent.hooks.getRules(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentHooksGetRulesResponse>`  |  **HTTP:** `GET /api/v1/agent/hooks/rules`
**CLI:** `hoody agent hooks rules get`

---

#### `list` — List hooks.

```typescript
client.agent.hooks.list(options?: { session_id?: string; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `session_id` | `string` | query | No | Live session id (hooks are session-scoped; required by the daemon RPC). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentHooksListResponse>`  |  **HTTP:** `GET /api/v1/agent/hooks`
**CLI:** `hoody agent hooks list`

---

#### `reload` — Reload hooks from disk.

```typescript
client.agent.hooks.reload(data?: AgentHooksReloadRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentHooksReloadRequest` | body | No |  |

**Body:** `{ session_id: string }`

- `session_id` — Optional: without it every live session reloads its own hooks and the reply has no summary; with it the session must be visible to the caller, and the reply adds its summary.

**Returns:** `Promise<AgentHooksReloadResponse>`  |  **HTTP:** `POST /api/v1/agent/hooks/reload`
**CLI:** `hoody agent hooks reload`

---

#### `run` — Test-fire a hook.

```typescript
client.agent.hooks.run(data: FacadeWithout<NonNullable<Parameters<HooksServiceBase['__testHook']>[0]>, "shipped_id"> & FacadeRequire<NonNullable<Parameters<HooksServiceBase['__testHook']>[0]>, "event">, options?: NonNullable<Parameters<HooksServiceBase['__testHook']>[1]>)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `FacadeWithout<NonNullable<Parameters<HooksServiceBase['__testHook']>[0]>, "shipped_id"> & FacadeRequire<NonNullable<Parameters<HooksServiceBase['__testHook']>[0]>, "event">` | body | Yes |  |

**Body:** `{ session_id*: string, shipped_id: string, event: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", match_value: string, command: string, timeout: int, exit_code: int, payload: object }`

- `event` — Lifecycle event to fire. Required on every branch except the shipped dry-run; the daemon rejects any value outside the enum.
- `timeout` — Timeout in whole seconds for an inline `command` (positive integers only; a fractional or non-positive value is ignored rather than truncated). Hard-capped at 60s: a larger value, an ignored one, and a saved hook's own longer timeout are all clamped to the 60s test ceiling, so a dry-run can never run longer than that.

**Returns:** `ReturnType<HooksServiceBase['__testHook']>`  |  **HTTP:** `POST /api/v1/agent/hooks/test`
**CLI:** `hoody agent hooks run`

---

#### `setRules` — Set the tool-call rules.

```typescript
client.agent.hooks.setRules(data: AgentHooksSetRulesRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
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
client.agent.hooks.test(data: NonNullable<Parameters<HooksServiceBase['__testHook']>[0]> & FacadeRequire<NonNullable<Parameters<HooksServiceBase['__testHook']>[0]>, "shipped_id">, options?: NonNullable<Parameters<HooksServiceBase['__testHook']>[1]>)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `NonNullable<Parameters<HooksServiceBase['__testHook']>[0]> & FacadeRequire<NonNullable<Parameters<HooksServiceBase['__testHook']>[0]>, "shipped_id">` | body | Yes |  |

**Body:** `{ session_id*: string, shipped_id: string, event: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", match_value: string, command: string, timeout: int, exit_code: int, payload: object }`

- `event` — Lifecycle event to fire. Required on every branch except the shipped dry-run; the daemon rejects any value outside the enum.
- `timeout` — Timeout in whole seconds for an inline `command` (positive integers only; a fractional or non-positive value is ignored rather than truncated). Hard-capped at 60s: a larger value, an ignored one, and a saved hook's own longer timeout are all clamped to the 60s test ceiling, so a dry-run can never run longer than that.

**Returns:** `ReturnType<HooksServiceBase['__testHook']>`  |  **HTTP:** `POST /api/v1/agent/hooks/test`
**CLI:** `hoody agent hooks test`

---

#### `trust` — Acknowledge hook trust.

```typescript
client.agent.hooks.trust(data: AgentHooksTrustRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentHooksTrustRequest` | body | Yes |  |

**Body:** `{ session_id*: string, hash*: string, high_risk: bool }`

- `hash` — The trust hash being acknowledged, from `agent.hooks.list`' `trust.hash`. Required and non-empty; a hash that no longer matches the live hook config is rejected (anti-TOCTOU).
- `high_risk` — Acknowledge the elevated-risk grant rather than the ordinary one. The grant KIND is still derived server-side from the reviewed snapshot — this flag cannot widen it.

**Returns:** `Promise<AgentHooksTrustResponse>`  |  **HTTP:** `POST /api/v1/agent/hooks/trust/ack`
**CLI:** `hoody agent hooks trust`

---

#### `upsert` — Upsert a hook.

```typescript
client.agent.hooks.upsert(data: AgentHooksUpsertRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
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
client.agent.jev.decideForSession(id: string, data: AgentJevDecideForSessionRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
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
client.agent.kit.getVersion(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

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
client.agent.logs.list(options?: { source?: string; level?: string; host?: string; since?: string; until?: string; since_seq?: number; before_seq?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source` | `string` | query | No | Filter to a log source/facet (see `agent.logs.listSources`). One local source, or exactly ONE platform source (activity\|events\|proxy) — mixing them is rejected. |
| `level` | `string` | query | No | Filter to a minimum log level. |
| `host` | `string` | query | No | Filter to a host. |
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
client.agent.logs.stream(options?: { source?: string; level?: string; host?: string; since_seq?: number; limit?: number; LastEventID?: string; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source` | `string` | query | No | Filter the tail to a log source/facet. |
| `level` | `string` | query | No | Filter to a minimum log level. |
| `host` | `string` | query | No | Filter to a host. |
| `since_seq` | `number` | query | No | Initial resume cursor (the Last-Event-ID header overrides it). A non-numeric value is rejected 400. |
| `limit` | `number` | query | No | Caps each poll batch. A non-numeric value is rejected 400. |
| `LastEventID` | `string` | header `Last-Event-ID` | No | SSE resume cursor — the gateway int64 seq to resume from; OVERRIDES the ?since_seq query param. Sent automatically by an SSE client on reconnect. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<IEventStream>`  |  **HTTP:** `GET /api/v1/agent/logs/stream`
**CLI:** `hoody agent logs stream`

---

### `client.agent.loops` (7) — Recurring self-paced agent loops

#### `create` — Create a loop.

```typescript
client.agent.loops.create(id: string, data: AgentLoopsCreateRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
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
client.agent.loops.delete(id: string, loopId: string, data?: AgentLoopsDeleteRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `loopId` | `string` | path | Yes | The loop id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `data` | `AgentLoopsDeleteRequest` | body | No |  |

**Returns:** `Promise<AgentLoopsDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/agent/sessions/{id}/loops/{loopId}`
**CLI:** `hoody agent loops delete`

---

#### `list` — List loops across all sessions.

```typescript
client.agent.loops.list(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentLoopsListResponse>`  |  **HTTP:** `GET /api/v1/agent/loops`
**CLI:** `hoody agent loops list`

---

#### `listAll` — List loops across all sessions. (collect all pages)

```typescript
client.agent.loops.listAll(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<(NonNullable<AgentLoopsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/loops`
**CLI:** `hoody agent loops list`

---

#### `listIterator` — List loops across all sessions. (async iterator)

```typescript
client.agent.loops.listIterator(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `AsyncGenerator<(NonNullable<AgentLoopsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/loops`
**CLI:** `hoody agent loops list`

---

#### `startRun` — Run a loop immediately.

```typescript
client.agent.loops.startRun(id: string, loopId: string, data?: AgentLoopsStartRunRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `loopId` | `string` | path | Yes | The loop id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `data` | `AgentLoopsStartRunRequest` | body | No |  |

**Returns:** `Promise<AgentLoopsStartRunResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/loops/{loopId}/run-now`
**CLI:** `hoody agent loops runs start`

---

#### `update` — Update a loop.

```typescript
client.agent.loops.update(id: string, loopId: string, data?: AgentLoopsUpdateRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `loopId` | `string` | path | Yes | The loop id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `data` | `AgentLoopsUpdateRequest` | body | No |  |

**Body:** `{ paused: bool, expires_in: string, max_cost_usd: number, max_wall_ms: int }`

**Returns:** `Promise<AgentLoopsUpdateResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/loops/{loopId}`
**CLI:** `hoody agent loops update`

---

### `client.agent.mcp` (10) — Mcp operations

#### `createWriteIntent` — Begin an MCP config write.

```typescript
client.agent.mcp.createWriteIntent(data: AgentMcpCreateWriteIntentRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentMcpCreateWriteIntentRequest` | body | Yes |  |

**Body:** `{ session_id*: string, op*: "upsert" | "delete" | "set_enabled" | "import", scope: "user" | "project" | "local" }`

**Returns:** `Promise<AgentMcpCreateWriteIntentResponse>`  |  **HTTP:** `POST /api/v1/agent/mcp/write-intents`
**CLI:** `hoody agent mcp intents create`

---

#### `deleteServer` — Delete an MCP server.

```typescript
client.agent.mcp.deleteServer(data: AgentMcpDeleteServerRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentMcpDeleteServerRequest` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", name*: string, expect_hash*: string }`

- `scope` — Settings layer to write. Must match the scope the nonce was minted for.

**Returns:** `Promise<AgentMcpDeleteServerResponse>`  |  **HTTP:** `DELETE /api/v1/agent/mcp/servers`
**CLI:** `hoody agent mcp delete`

---

#### `disableServer` — Enable or disable an MCP server.

```typescript
client.agent.mcp.disableServer(...args: FacadeBodyArgs<FacadeWithout<NonNullable<Parameters<McpServiceBase['__setMCPServerEnabled']>[0]>, "enabled">, [options?: NonNullable<Parameters<McpServiceBase['__setMCPServerEnabled']>[1]>, _templateVars?: Parameters<McpServiceBase['__setMCPServerEnabled']>[2]]>)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", name*: string, enabled*: bool, expect_hash*: string }`

- `scope` — Settings layer to write. Must match the scope the nonce was minted for.

**Returns:** `ReturnType<McpServiceBase['__setMCPServerEnabled']>`  |  **HTTP:** `POST /api/v1/agent/mcp/servers/enable`
**CLI:** `hoody agent mcp disable`

---

#### `enableServer` — Enable or disable an MCP server.

```typescript
client.agent.mcp.enableServer(...args: FacadeBodyArgs<FacadeWithout<NonNullable<Parameters<McpServiceBase['__setMCPServerEnabled']>[0]>, "enabled">, [options?: NonNullable<Parameters<McpServiceBase['__setMCPServerEnabled']>[1]>, _templateVars?: Parameters<McpServiceBase['__setMCPServerEnabled']>[2]]>)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", name*: string, enabled*: bool, expect_hash*: string }`

- `scope` — Settings layer to write. Must match the scope the nonce was minted for.

**Returns:** `ReturnType<McpServiceBase['__setMCPServerEnabled']>`  |  **HTTP:** `POST /api/v1/agent/mcp/servers/enable`
**CLI:** `hoody agent mcp enable`

---

#### `importServers` — Import MCP servers from another tool's config.

```typescript
client.agent.mcp.importServers(data: AgentMcpImportServersRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
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
client.agent.mcp.listServers(options: { session_id: string; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `session_id` | `string` | query | Yes | Live session id (MCP config is resolved against the session's settings layers). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentMcpListServersResponse>`  |  **HTTP:** `GET /api/v1/agent/mcp/servers`
**CLI:** `hoody agent mcp list`

---

#### `previewImport` — Preview an MCP config import.

```typescript
client.agent.mcp.previewImport(data: AgentMcpPreviewImportRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentMcpPreviewImportRequest` | body | Yes |  |

**Body:** `{ session_id*: string, document*: string }`

**Returns:** `Promise<AgentMcpPreviewImportResponse>`  |  **HTTP:** `POST /api/v1/agent/mcp/parse`
**CLI:** `hoody agent mcp preview`

---

#### `reconnect` — Reload MCP config and reconnect.

```typescript
client.agent.mcp.reconnect(data: AgentMcpReconnectRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentMcpReconnectRequest` | body | Yes |  |

**Body:** `{ session_id*: string }`

**Returns:** `Promise<AgentMcpReconnectResponse>`  |  **HTTP:** `POST /api/v1/agent/mcp/reconnect`
**CLI:** `hoody agent mcp reconnect`

---

#### `testServer` — Probe an MCP server without saving it.

```typescript
client.agent.mcp.testServer(data: AgentMcpTestServerRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentMcpTestServerRequest` | body | Yes |  |

**Body:** `{ session_id*: string, server*: { name: string, type: string, command: string, args: string[], url: string, env: object, headers: object, allowed_tools: string[], require_confirmation: bool, enabled: bool } }`

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `POST /api/v1/agent/mcp/probe`
**CLI:** `hoody agent mcp test`

---

#### `upsertServer` — Create or update an MCP server.

```typescript
client.agent.mcp.upsertServer(data: AgentMcpUpsertServerRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
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
client.agent.memory.claimDataHost(data: AgentMemoryClaimDataHostRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `data` | `AgentMemoryClaimDataHostRequest` | body | Yes |  |

**Body:** `{ use_self*: bool, expect_realm*: string }`

- `use_self` — Assign THIS computer. Only true is implemented; false is refused 400 unsupported.
- `expect_realm` — REQUIRED. The realm this assignment is for: "global" for the global partition, or a 24-hex realm id. Refused 400 when absent — an empty value means the global realm to the daemon, never "unspecified".

**Returns:** `Promise<AgentMemoryClaimDataHostResponse>`  |  **HTTP:** `PUT /api/v1/agent/memory/datahost`
**CLI:** `hoody agent memory datahost claim`

---

#### `consolidate` — Trigger a memory consolidation pass (human-only).

```typescript
client.agent.memory.consolidate(data: AgentMemoryConsolidateRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `data` | `AgentMemoryConsolidateRequest` | body | Yes |  |

**Body:** `{ project*: string, min_observations: int }`

- `project` — Project key to consolidate (required).

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `POST /api/v1/agent/memory/consolidate`
**CLI:** `hoody agent memory consolidate`

---

#### `createItem` — Save a memory item.

```typescript
client.agent.memory.createItem(data: AgentMemoryCreateItemRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `data` | `AgentMemoryCreateItemRequest` | body | Yes |  |

**Body:** `{ project*: string, content*: string, type: string, concepts: string[], files: string[], ttl_days: int, strength: int, expect_realm: string }`

- `ttl_days` — … Must be a whole number between -2147483648 and 106751 (about 292 years — the longest expiry the store can represent); a value outside that range is REFUSED, never clamped and never treated as no expiry. A fractional value like 30.5 and a numeric string like "30" are both REFUSED too, never truncated or coerced — a silent coercion to 0 would store the memory with no expiry at all while reporting success.
- `strength` — Initial ranking strength, a whole number from 1 (weakest) to 10 (strongest). Omitted or 0 takes the store's default of 7. Any other value — a negative number, anything above 10, a fractional value or a numeric string — is REFUSED, never coerced and never silently replaced with the default.
- `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The write is refused when the daemon's active realm no longer matches, so it cannot land in a realm the caller switched away from.

**Returns:** `Promise<AgentMemoryCreateItemResponse>`  |  **HTTP:** `POST /api/v1/agent/memory/items`
**CLI:** `hoody agent memory items create`

---

#### `createWriteIntent` — Begin a guarded memory write (intent).

```typescript
client.agent.memory.createWriteIntent(data: AgentMemoryCreateWriteIntentRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `data` | `AgentMemoryCreateWriteIntentRequest` | body | Yes |  |

**Body:** `{ op*: "wipe_project", project*: string, expect_realm: string }`

- `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The request is refused when the daemon's active realm no longer matches.

**Returns:** `Promise<AgentMemoryCreateWriteIntentResponse>`  |  **HTTP:** `POST /api/v1/agent/memory/write-intents`
**CLI:** `hoody agent memory intents create`

---

#### `deleteItem` — Delete a memory item.

```typescript
client.agent.memory.deleteItem(data?: AgentMemoryDeleteItemRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `data` | `AgentMemoryDeleteItemRequest` | body | No |  |

**Body:** `{ ids: string[], id: string, name: string, project: string, kind: "memory" | "observation" | "lesson" | "slot", reason: string, expect_realm: string }`

- `ids` — Record ids to delete. Required for kind memory/observation/lesson (the empty/default kind included). A `summary:<session_id>`-prefixed id deletes a summary.
- `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The delete is refused when the daemon's active realm no longer matches.

**Returns:** `Promise<AgentMemoryDeleteItemResponse>`  |  **HTTP:** `DELETE /api/v1/agent/memory/items`
**CLI:** `hoody agent memory items delete`

---

#### `deleteProject` — Erase a memory project.

```typescript
client.agent.memory.deleteProject(project: string, data: AgentMemoryDeleteProjectRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `project` | `string` | path | Yes | The project. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `data` | `AgentMemoryDeleteProjectRequest` | body | Yes |  |

**Body:** `{ nonce*: string, reason: string, expect_realm: string }`

- `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The request is refused when the daemon's active realm no longer matches.

**Returns:** `Promise<AgentMemoryDeleteProjectResponse>`  |  **HTTP:** `DELETE /api/v1/agent/memory/projects/{project}`
**CLI:** `hoody agent memory projects delete`

---

#### `disable` — Toggle memory capture.

```typescript
client.agent.memory.disable(...args: FacadeBodyArgs<FacadeWithout<NonNullable<Parameters<MemoryServiceBase['__setMemoryEnabled']>[0]>, "enabled">, [options?: NonNullable<Parameters<MemoryServiceBase['__setMemoryEnabled']>[1]>, _templateVars?: Parameters<MemoryServiceBase['__setMemoryEnabled']>[2]]>)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `data` | `object` | body | No |  |

**Body:** `{ enabled*: bool }`

**Returns:** `ReturnType<MemoryServiceBase['__setMemoryEnabled']>`  |  **HTTP:** `PUT /api/v1/agent/memory/enabled`
**CLI:** `hoody agent memory disable`

---

#### `enable` — Toggle memory capture.

```typescript
client.agent.memory.enable(...args: FacadeBodyArgs<FacadeWithout<NonNullable<Parameters<MemoryServiceBase['__setMemoryEnabled']>[0]>, "enabled">, [options?: NonNullable<Parameters<MemoryServiceBase['__setMemoryEnabled']>[1]>, _templateVars?: Parameters<MemoryServiceBase['__setMemoryEnabled']>[2]]>)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `data` | `object` | body | No |  |

**Body:** `{ enabled*: bool }`

**Returns:** `ReturnType<MemoryServiceBase['__setMemoryEnabled']>`  |  **HTTP:** `PUT /api/v1/agent/memory/enabled`
**CLI:** `hoody agent memory enable`

---

#### `flush` — Flush the memory store.

```typescript
client.agent.memory.flush(data?: AgentMemoryFlushRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `data` | `AgentMemoryFlushRequest` | body | No |  |

**Returns:** `Promise<AgentMemoryFlushResponse>`  |  **HTTP:** `POST /api/v1/agent/memory/flush`
**CLI:** `hoody agent memory flush`

---

#### `getDataHost` — Read the realm's memory data host.

```typescript
client.agent.memory.getDataHost(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentMemoryGetDataHostResponse>`  |  **HTTP:** `GET /api/v1/agent/memory/datahost`
**CLI:** `hoody agent memory datahost get`

---

#### `getGraph` — Read a project's memory relation graph.

```typescript
client.agent.memory.getGraph(options?: { project?: string; node_type?: string; limit?: number; offset?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `project` | `string` | query | No | Project key whose graph to read. |
| `node_type` | `string` | query | No | Optional node-type filter. |
| `limit` | `number` | query | No | Maximum nodes/edges to return. |
| `offset` | `number` | query | No | Pagination offset into the graph. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentMemoryGetGraphResponse>`  |  **HTTP:** `GET /api/v1/agent/memory/graph`
**CLI:** `hoody agent memory graph get`

---

#### `getItem` — Read a memory item.

```typescript
client.agent.memory.getItem(id: string, options?: { project?: string; kind?: string; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The item id. |
| `project` | `string` | query | No | Project key the memory belongs to. |
| `kind` | `string` | query | No | Memory kind/store the record lives in. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentMemoryGetItemResponse>`  |  **HTTP:** `GET /api/v1/agent/memory/items/{id}`
**CLI:** `hoody agent memory items get`

---

#### `getStatus` — Read memory subsystem status.

```typescript
client.agent.memory.getStatus(options?: { project?: string; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `project` | `string` | query | No | Project key to report per-project counts, embedding coverage and last-consolidation for. Omitted: only the whole-store totals are returned. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentMemoryGetStatusResponse>`  |  **HTTP:** `GET /api/v1/agent/memory/status`
**CLI:** `hoody agent memory status`

---

#### `listItems` — List memory items.

```typescript
client.agent.memory.listItems(options?: { project?: string; kind?: string; type?: string; query?: string; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
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

**Returns:** `Promise<AgentMemoryListItemsResponse>`  |  **HTTP:** `GET /api/v1/agent/memory/items`
**CLI:** `hoody agent memory items list`

---

#### `listItemsAll` — List memory items. (collect all pages)

```typescript
client.agent.memory.listItemsAll(options?: { project?: string; kind?: string; type?: string; query?: string; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
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

**Returns:** `Promise<(NonNullable<AgentMemoryListItemsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`listItems()` fetches one page). `listItemsIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/memory/items`
**CLI:** `hoody agent memory items list`

---

#### `listItemsIterator` — List memory items. (async iterator)

```typescript
client.agent.memory.listItemsIterator(options?: { project?: string; kind?: string; type?: string; query?: string; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
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

**Returns:** `AsyncGenerator<(NonNullable<AgentMemoryListItemsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`listItems()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/memory/items`
**CLI:** `hoody agent memory items list`

---

#### `listProjects` — List memory projects.

```typescript
client.agent.memory.listProjects(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentMemoryListProjectsResponse>`  |  **HTTP:** `GET /api/v1/agent/memory/projects`
**CLI:** `hoody agent memory projects list`

---

#### `listProjectsAll` — List memory projects. (collect all pages)

```typescript
client.agent.memory.listProjectsAll(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<(NonNullable<AgentMemoryListProjectsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`listProjects()` fetches one page). `listProjectsIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/memory/projects`
**CLI:** `hoody agent memory projects list`

---

#### `listProjectsIterator` — List memory projects. (async iterator)

```typescript
client.agent.memory.listProjectsIterator(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `AsyncGenerator<(NonNullable<AgentMemoryListProjectsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`listProjects()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/memory/projects`
**CLI:** `hoody agent memory projects list`

---

#### `search` — Search memory (hybrid recall).

```typescript
client.agent.memory.search(data?: AgentMemorySearchRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `data` | `AgentMemorySearchRequest` | body | No |  |

**Body:** `{ project: string, query: string, limit: int, kinds: string[], skip_graph: bool }`

**Returns:** `Promise<AgentMemorySearchResponse>`  |  **HTTP:** `POST /api/v1/agent/memory/search`
**CLI:** `hoody agent memory search`

---

#### `updateItem` — Edit a memory item.

```typescript
client.agent.memory.updateItem(id: string, data?: AgentMemoryUpdateItemRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The item id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `data` | `AgentMemoryUpdateItemRequest` | body | No |  |

**Body:** `{ project: string, kind: "memory" | "lesson" | "slot", content: string, type: string, concepts: string[], files: string[], strength: int, ttl_days: int, tier: string, context: string, confidence: number, expect_realm: string }`

- `content` — Replacement content. Applies to every kind, and is REQUIRED for kind=slot (a slot edit with no content is refused — use the delete route to remove a slot).
- `concepts` — kind=memory: replacement concept tags. The whole list is replaced, and a malformed array is rejected rather than silently truncated.
- `files` — kind=memory: replacement file paths. The whole list is replaced, and a malformed array is rejected rather than silently truncated.
- `strength` — kind=memory: replacement ranking strength, a whole number from 1 (weakest) to 10 (strongest). Any other value — 0, a negative number, anything above 10, a fractional value or a numeric string — is REFUSED, never coerced, and the stored strength is left unchanged.
- `ttl_days` — … Must be a whole number between -2147483648 and 106751 (about 292 years — the longest expiry the store can represent); a value outside that range is REFUSED, never clamped, and the stored expiry is left unchanged. A fractional value like 30.5 and a numeric string like "30" are both REFUSED too, never truncated or coerced.
- `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The edit is refused when the daemon's active realm no longer matches.

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
client.agent.platform.bootstrapToken(data: AgentPlatformBootstrapTokenRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `AgentPlatformBootstrapTokenRequest` | body | Yes |  |

**Body:** `{ token*: string, capability: string }`

- `capability` — The operator bootstrap capability, required only on deployments configured with one; a mismatch is answered 404.

**Returns:** `Promise<AgentPlatformBootstrapTokenResponse>`  |  **HTTP:** `POST /api/v1/agent/hoody/auth/bootstrap`

---

### `client.agent.providers` (18) — Catalogued models and fusion composites

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
client.agent.realms.list(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentRealmsListResponse>`  |  **HTTP:** `GET /api/v1/agent/realms`
**CLI:** `hoody agent realms list`

---

#### `listAll` — List realms (for binding). (collect all pages)

```typescript
client.agent.realms.listAll(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<(NonNullable<AgentRealmsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). Each item is `string`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/realms`
**CLI:** `hoody agent realms list`

---

#### `listIterator` — List realms (for binding). (async iterator)

```typescript
client.agent.realms.listIterator(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

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

### `client.agent.sessions` (47) — Create, drive, and tear down agent sessions

#### `cancelTasks` — Cancel all background tasks.

```typescript
client.agent.sessions.cancelTasks(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentSessionsCancelTasksResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/tasks/cancel`
**CLI:** `hoody agent sessions tasks cancel`

---

#### `claimApproverLease` — Acquire the right to answer this session's gates.

```typescript
client.agent.sessions.claimApproverLease(id: string, data: AgentSessionsClaimApproverLeaseRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSessionsClaimApproverLeaseRequest` | body | Yes |  |

**Body:** `{ holder*: string, ttl_ms: int, replace: bool, lease: string }`

- `holder` — REQUIRED on acquire: an opaque per-caller id (1–64 printable ASCII, no spaces) that identifies THIS client as the holder (reported as `holder` on the event.gate_resolved stream event). Never a credential; an empty holder is 400.
- `replace` — Documentation only: a live lease is taken over ONLY by presenting its current capability as proof (X-Hoody-Approver-Lease or body.lease); replace:true without the proof is still 409 approver_lease_held. After expiry or release an acquire needs no proof.

**Returns:** `Promise<AgentSessionsClaimApproverLeaseResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/approver-lease`
**CLI:** `hoody agent sessions approver lease claim`

---

#### `claimAttachment` — Hold a live session (and its parked gate) alive.

```typescript
client.agent.sessions.claimAttachment(id: string, data?: AgentSessionsClaimAttachmentRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSessionsClaimAttachmentRequest` | body | No |  |

**Body:** `{ ttl_ms: int }`

- `ttl_ms` — Requested lifetime in milliseconds (default 15m, capped at 60m).

**Returns:** `Promise<AgentSessionsClaimAttachmentResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/attachments`
**CLI:** `hoody agent sessions attachments claim`

---

#### `close` — Close the session (teardown).

```typescript
client.agent.sessions.close(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentSessionsCloseResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/close`
**CLI:** `hoody agent sessions close`

---

#### `connect` — Attach to a session's event stream (WebSocket / SSE).

```typescript
client.agent.sessions.connect(id: string, options?: { since?: number; incarnation?: string; realm?: string; LastEventID?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
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
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentStreamSessionWebSocket>` — an unconnected wrapper: register handlers, then `await ws.connect()`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/stream`
**CLI:** `hoody agent sessions stream`

---

#### `create` — Create, fork, or attach a session.

```typescript
client.agent.sessions.create(data?: AgentSessionsCreateRequest, options?: { realm?: string; IdempotencyKey?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key returns the same receipt and never re-runs the turn; the same key with a different request body is 422. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSessionsCreateRequest` | body | No |  |

**Body:** `{ realm: string, container: string, cwd: string, config_dir: string, model: string, agent: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", attach: string, fork: string, fork_turn_idx: int, backend: string, delegated_agent: string, headless: bool, approval: { mode: "" | "default" | "always", locked: bool }, expected_binding: { realm: string, container: string, cwd: string, backend: "" | "llm" | "acp" }, prompt_blocks: { contract: bool, transcripts: bool, frequent_files: bool, hook_context: bool, memory: bool, project_instructions: bool, agent_instructions: bool, team_rules: bool, skills: bool, workflows: bool, verbosity: bool, hoody_platform: bool, hoody_exec: bool, fleet_notice: bool }, model_settings: { thinking: object, temperature: number, max_tokens: int, response_format: object }, helper_gates: bool, outcome_claims: bool, frame_tools: bool }`

**Returns:** `Promise<AgentSessionsCreateResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions`
**CLI:** `hoody agent sessions create`

---

#### `delete` — Close (and optionally hard-delete) a session.

```typescript
client.agent.sessions.delete(id: Parameters<SessionsServiceBase['__deleteSession']>[0], options?: FacadeWithout<NonNullable<Parameters<SessionsServiceBase['__deleteSession']>[1]>, "hard">)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `ReturnType<SessionsServiceBase['__deleteSession']>`  |  **HTTP:** `DELETE /api/v1/agent/sessions/{id}`
**CLI:** `hoody agent sessions delete`

---

#### `deleteApprovalRule` — Remove one session permission rule.

```typescript
client.agent.sessions.deleteApprovalRule(id: string, tool: string, options?: { realm?: string; IfMatch?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `tool` | `string` | path | Yes | The tool. |
| `IfMatch` | `string` | header `If-Match` | No | Conditional-request precondition: the ETag from GET /sessions/{id}/approval (a quoted policy revision, e.g. "3") or *. A mismatch is 412 precondition_failed. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentSessionsDeleteApprovalRuleResponse>`  |  **HTTP:** `DELETE /api/v1/agent/sessions/{id}/approval/rules/{tool}`
**CLI:** `hoody agent sessions approval rules delete`

---

#### `get` — Get a session summary.

```typescript
client.agent.sessions.get(id: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentSessionsGetResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}`
**CLI:** `hoody agent sessions get`

---

#### `getApproval` — Read a session's approval policy.

```typescript
client.agent.sessions.getApproval(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentSessionsGetApprovalResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/approval`
**CLI:** `hoody agent sessions approval get`

---

#### `getSnapshot` — Read a session's recoverable state.

```typescript
client.agent.sessions.getSnapshot(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentSessionsGetSnapshotResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/state`
**CLI:** `hoody agent sessions snapshot get`

---

#### `getTranscript` — Read a session's transcript without attaching.

```typescript
client.agent.sessions.getTranscript(id: string, options?: { after_turn?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `after_turn` | `number` | query | No | Exclusive completed-turn skip cursor: return content strictly after completed turn N (0 = full transcript; values past the end clamp; negative/non-integer = 400). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentSessionsGetTranscriptResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/transcript`
**CLI:** `hoody agent sessions transcript get`

---

#### `list` — List sessions.

```typescript
client.agent.sessions.list(options?: { include_system?: boolean; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_system` | `boolean` | query | No | When true, also include daemon-owned system/resident sessions in the listing. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentSessionsListResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions`
**CLI:** `hoody agent sessions list`

---

#### `listAll` — List sessions. (collect all pages)

```typescript
client.agent.sessions.listAll(options?: { include_system?: boolean; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_system` | `boolean` | query | No | When true, also include daemon-owned system/resident sessions in the listing. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<(NonNullable<AgentSessionsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/sessions`
**CLI:** `hoody agent sessions list`

---

#### `listApplicableRules` — Which tool-call rules apply.

```typescript
client.agent.sessions.listApplicableRules(id: string, options?: { agent?: string; tool?: string; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `agent` | `string` | query | No | Agent name to ask about (default: the session's own agent). |
| `tool` | `string` | query | No | Tool name to ask about (default: any tool). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentSessionsListApplicableRulesResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/rules/applies`
**CLI:** `hoody agent sessions rules list`

---

#### `listDirectories` — List distinct session working directories.

```typescript
client.agent.sessions.listDirectories(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentSessionsListDirectoriesResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/cwds`
**CLI:** `hoody agent sessions directories list`

---

#### `listIterator` — List sessions. (async iterator)

```typescript
client.agent.sessions.listIterator(options?: { include_system?: boolean; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_system` | `boolean` | query | No | When true, also include daemon-owned system/resident sessions in the listing. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `AsyncGenerator<(NonNullable<AgentSessionsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/sessions`
**CLI:** `hoody agent sessions list`

---

#### `listLoops` — List a session's loops.

```typescript
client.agent.sessions.listLoops(id: string, options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentSessionsListLoopsResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/loops`
**CLI:** `hoody agent sessions loops list`

---

#### `listLoopsAll` — List a session's loops. (collect all pages)

```typescript
client.agent.sessions.listLoopsAll(id: string, options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<(NonNullable<AgentSessionsListLoopsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`listLoops()` fetches one page). `listLoopsIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/loops`
**CLI:** `hoody agent sessions loops list`

---

#### `listLoopsIterator` — List a session's loops. (async iterator)

```typescript
client.agent.sessions.listLoopsIterator(id: string, options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `AsyncGenerator<(NonNullable<AgentSessionsListLoopsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`listLoops()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/loops`
**CLI:** `hoody agent sessions loops list`

---

#### `listMcpTools` — List a session's MCP tools.

```typescript
client.agent.sessions.listMcpTools(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentSessionsListMcpToolsResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tools/mcp`
**CLI:** `hoody agent sessions mcp tools list`

---

#### `listMcpToolsAll` — List a session's MCP tools. (collect all pages)

```typescript
client.agent.sessions.listMcpToolsAll(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<(NonNullable<AgentSessionsListMcpToolsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`listMcpTools()` fetches one page). `listMcpToolsIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tools/mcp`
**CLI:** `hoody agent sessions mcp tools list`

---

#### `listMcpToolsIterator` — List a session's MCP tools. (async iterator)

```typescript
client.agent.sessions.listMcpToolsIterator(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncGenerator<(NonNullable<AgentSessionsListMcpToolsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`listMcpTools()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tools/mcp`
**CLI:** `hoody agent sessions mcp tools list`

---

#### `listTools` — List a session's effective tool set.

```typescript
client.agent.sessions.listTools(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentSessionsListToolsResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tools`
**CLI:** `hoody agent sessions tools list`

---

#### `listToolsAll` — List a session's effective tool set. (collect all pages)

```typescript
client.agent.sessions.listToolsAll(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<(NonNullable<AgentSessionsListToolsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`listTools()` fetches one page). `listToolsIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tools`
**CLI:** `hoody agent sessions tools list`

---

#### `listToolsIterator` — List a session's effective tool set. (async iterator)

```typescript
client.agent.sessions.listToolsIterator(id: string, options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncGenerator<(NonNullable<AgentSessionsListToolsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`listTools()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tools`
**CLI:** `hoody agent sessions tools list`

---

#### `releaseApproverLease` — Release the approver lease.

```typescript
client.agent.sessions.releaseApproverLease(id: string, options?: { realm?: string; XHoodyApproverLease?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyApproverLease` | `string` | header `X-Hoody-Approver-Lease` | No | The approver-lease capability returned by POST /sessions/{id}/approver-lease. Required on every decision (/confirm, or the confirmed re-issue of a gated tool run) on an "always" session whose lease was minted; the daemon verifies it at decision consumption. On renew/release it names the lease to act on. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentSessionsReleaseApproverLeaseResponse>`  |  **HTTP:** `DELETE /api/v1/agent/sessions/{id}/approver-lease`
**CLI:** `hoody agent sessions approver lease release`

---

#### `releaseAttachment` — Release an attachment lease.

```typescript
client.agent.sessions.releaseAttachment(id: string, lease_id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `lease_id` | `string` | path | Yes | The lease id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentSessionsReleaseAttachmentResponse>`  |  **HTTP:** `DELETE /api/v1/agent/sessions/{id}/attachments/{lease_id}`
**CLI:** `hoody agent sessions attachments release`

---

#### `rename` — Rename a session.

```typescript
client.agent.sessions.rename(id: string, data: AgentSessionsRenameRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `data` | `AgentSessionsRenameRequest` | body | Yes |  |

**Body:** `{ name*: string }`

- `name` — The new title. An empty string clears it back to the automatic title. Required — omitting it is a 400, not a clear.

**Returns:** `Promise<AgentSessionsRenameResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}`
**CLI:** `hoody agent sessions rename`

---

#### `renewApproverLease` — Renew the approver lease.

```typescript
client.agent.sessions.renewApproverLease(id: string, data?: AgentSessionsRenewApproverLeaseRequest, options?: { realm?: string; XHoodyApproverLease?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyApproverLease` | `string` | header `X-Hoody-Approver-Lease` | No | The approver-lease capability returned by POST /sessions/{id}/approver-lease. Required on every decision (/confirm, or the confirmed re-issue of a gated tool run) on an "always" session whose lease was minted; the daemon verifies it at decision consumption. On renew/release it names the lease to act on. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSessionsRenewApproverLeaseRequest` | body | No |  |

**Body:** `{ ttl_ms: int, lease: string }`

**Returns:** `Promise<AgentSessionsRenewApproverLeaseResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/approver-lease`
**CLI:** `hoody agent sessions approver lease renew`

---

#### `renewAttachment` — Renew an attachment lease.

```typescript
client.agent.sessions.renewAttachment(id: string, lease_id: string, data?: AgentSessionsRenewAttachmentRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `lease_id` | `string` | path | Yes | The lease id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSessionsRenewAttachmentRequest` | body | No |  |

**Body:** `{ ttl_ms: int }`

- `ttl_ms` — New lifetime in milliseconds from now (default 15m, capped at 60m).

**Returns:** `Promise<AgentSessionsRenewAttachmentResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/attachments/{lease_id}`
**CLI:** `hoody agent sessions attachments renew`

---

#### `replay` — Replay a live session's buffered events.

```typescript
client.agent.sessions.replay(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentSessionsReplayResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/replay`
**CLI:** `hoody agent sessions replay`

---

#### `runTool` — Run a tool inside a live session (gated).

```typescript
client.agent.sessions.runTool(id: string, name: string, data?: AgentSessionsRunToolRequest, options?: { confirm?: boolean; confirm_token?: string; realm?: string; XHoodyApproverLease?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
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
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSessionsRunToolRequest` | body | No |  |

**Body:** `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }`

- `confirm` — Re-issue a previously-parked confirmation. MUST be paired with the confirm_token from the prior 409; a bare confirm:true with no valid token does NOT bypass the gate (it re-parks). A wire confirmed key in params is always scrubbed.
- `confirm_token` — The single-use token returned in the 409 tool_needs_confirmation details. Bound to the tool/session/params it was minted for; present it with confirm:true and the echoed params to approve the parked run.
- `allow_mutations` — Sessionless only: opt a non-read-only tool into running with every permission check applied (else a sessionless mutating run is refused 400 tool_mutation_refused).

**Returns:** `Promise<AgentSessionsRunToolResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/tools/{name}/run`
**CLI:** `hoody agent sessions tools run`

---

#### `setAgent` — Switch the chat agent.

```typescript
client.agent.sessions.setAgent(id: string, data?: AgentSessionsSetAgentRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSessionsSetAgentRequest` | body | No |  |

**Body:** `{ agent: string }`

**Returns:** `Promise<AgentSessionsSetAgentResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/agent`
**CLI:** `hoody agent sessions agent set`

---

#### `setApprovalRule` — Set one session permission rule.

```typescript
client.agent.sessions.setApprovalRule(id: string, tool: string, data: AgentSessionsSetApprovalRuleRequest, options?: { realm?: string; IfMatch?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `tool` | `string` | path | Yes | The tool. |
| `IfMatch` | `string` | header `If-Match` | No | Conditional-request precondition: the ETag from GET /sessions/{id}/approval (a quoted policy revision, e.g. "3") or *. A mismatch is 412 precondition_failed. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSessionsSetApprovalRuleRequest` | body | Yes |  |

**Body:** `{ decision*: "allow" | "deny" }`

**Returns:** `Promise<AgentSessionsSetApprovalRuleResponse>`  |  **HTTP:** `PUT /api/v1/agent/sessions/{id}/approval/rules/{tool}`
**CLI:** `hoody agent sessions approval rules set`

---

#### `setAutoReply` — Arm/disarm the auto-reply loop.

```typescript
client.agent.sessions.setAutoReply(id: string, data?: AgentSessionsSetAutoReplyRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSessionsSetAutoReplyRequest` | body | No |  |

**Body:** `{ armed: bool, rounds: int, model: string, allow_writes: bool }`

**Returns:** `Promise<AgentSessionsSetAutoReplyResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/auto-reply`
**CLI:** `hoody agent sessions autoreply set`

---

#### `setAutoReplyWrites` — Flip the auto-reply write opt-in.

```typescript
client.agent.sessions.setAutoReplyWrites(id: string, data?: AgentSessionsSetAutoReplyWritesRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSessionsSetAutoReplyWritesRequest` | body | No |  |

**Body:** `{ allow_writes: bool }`

**Returns:** `Promise<AgentSessionsSetAutoReplyWritesResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/auto-reply/writes`
**CLI:** `hoody agent sessions autoreply writes set`

---

#### `setEffort` — Set reasoning effort.

```typescript
client.agent.sessions.setEffort(id: string, data?: AgentSessionsSetEffortRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSessionsSetEffortRequest` | body | No |  |

**Body:** `{ effort: string }`

**Returns:** `Promise<AgentSessionsSetEffortResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/effort`
**CLI:** `hoody agent sessions effort set`

---

#### `setHoodyEnv` — Toggle Hoody shell-env injection.

```typescript
client.agent.sessions.setHoodyEnv(id: string, data?: AgentSessionsSetHoodyEnvRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSessionsSetHoodyEnvRequest` | body | No |  |

**Body:** `{ enabled: bool }`

**Returns:** `Promise<AgentSessionsSetHoodyEnvResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/hoody-env`
**CLI:** `hoody agent sessions env set`

---

#### `setModel` — Switch the session model.

```typescript
client.agent.sessions.setModel(id: string, data: AgentSessionsSetModelRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSessionsSetModelRequest` | body | Yes |  |

**Body:** `{ model*: string }`

- `model` — Model spec to switch to (provider-prefixed, e.g. anthropic/claude-opus-4-8, or fusion/<slug>). Required — a blank value is rejected, never a silent no-op.

**Returns:** `Promise<AgentSessionsSetModelResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/model`
**CLI:** `hoody agent sessions model set`

---

#### `setVerbosity` — Set response verbosity.

```typescript
client.agent.sessions.setVerbosity(id: string, data?: AgentSessionsSetVerbosityRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSessionsSetVerbosityRequest` | body | No |  |

**Body:** `{ level: string }`

**Returns:** `Promise<AgentSessionsSetVerbosityResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/verbosity`
**CLI:** `hoody agent sessions verbosity set`

---

#### `setYolo` — Arm or disarm YOLO auto-approve.

```typescript
client.agent.sessions.setYolo(id: string, data: AgentSessionsSetYoloRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSessionsSetYoloRequest` | body | Yes |  |

**Body:** `{ enabled*: bool }`

**Returns:** `Promise<AgentSessionsSetYoloResponse>`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/yolo`
**CLI:** `hoody agent sessions yolo set`

---

#### `startTurn` — Dispatch a turn (fire-and-observe).

```typescript
client.agent.sessions.startTurn(id: string, data: AgentSessionsStartTurnRequest, options?: { realm?: string; IdempotencyKey?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key returns the same receipt and never re-runs the turn; the same key with a different request body is 422. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
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
client.agent.sessions.startTurnAndStream(id: string, data: AgentSessionsStartTurnAndStreamRequest, options?: { policy?: string; realm?: string; XHoodyGatePolicy?: string; IdempotencyKey?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
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
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSessionsStartTurnAndStreamRequest` | body | Yes |  |

**Body:** `{ text*: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", attachments: { type*: "image", media_type*: string, data*: string, name: string }[] }`

- `text` — Required (may be empty only with attachments). The user message text for this turn: empty or whitespace-only text with no attachments is refused (400 empty_prompt) and no turn runs.
- `tool_mode` — Optional per-turn tool mode override: standard or orchestrator. Any other value is refused 400 invalid_tool_mode.
- `dir_scope` — Optional per-turn directory-access scope override: home or full. Any other value is refused 400 invalid_dir_scope.
- `attachments` — … At most 4 per turn, each at most 4 MiB DECODED (~5.33 MiB of base64); the request body limit applies on top and is authoritative, so several individually-legal images can still exceed it. A violation is refused with 400 BEFORE the turn is accepted — nothing is silently dropped. `path` is not supported here: it would name a file on the CALLER's machine, and a path-bearing attachment is discarded outright on a container-bound session. If the active model cannot accept images the daemon reports that on the session stream.

**Returns:** `Promise<IEventStream<{ XHoodyTurnId?: string; }>>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/prompt:stream`
**CLI:** `hoody agent sessions turns start`

---

#### `startWorkflow` — Run a workflow onto an existing session.

```typescript
client.agent.sessions.startWorkflow(id: string, name: string, data?: AgentSessionsStartWorkflowRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSessionsStartWorkflowRequest` | body | No |  |

**Body:** `{ prompt: string, inputs: { [key: string]: string } }`

- `inputs` — Optional run-time values for the workflow's DECLARED input parameters (declared name → string value; resolves to $(input.<name>) in every step). A workflow with a REQUIRED declared parameter cannot run without these. Values must be strings; a non-string value is a 400.

**Returns:** `Promise<AgentSessionsStartWorkflowResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/workflows/{name}/runs`
**CLI:** `hoody agent sessions workflows start`

---

#### `trim` — Trim session history to a turn index.

```typescript
client.agent.sessions.trim(id: string, data?: AgentSessionsTrimRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSessionsTrimRequest` | body | No |  |

**Body:** `{ turn_idx: int }`

**Returns:** `Promise<AgentSessionsTrimResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/trim`
**CLI:** `hoody agent sessions trim`

---

#### `updateApproval` — Set a session's approval mode and lock.

```typescript
client.agent.sessions.updateApproval(id: string, data?: AgentSessionsUpdateApprovalRequest, options?: { realm?: string; IfMatch?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `IfMatch` | `string` | header `If-Match` | No | Conditional-request precondition: the ETag from GET /sessions/{id}/approval (a quoted policy revision, e.g. "3") or *. A mismatch is 412 precondition_failed. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSessionsUpdateApprovalRequest` | body | No |  |

**Body:** `{ mode: "default" | "always", locked: bool }`

**Returns:** `Promise<AgentSessionsUpdateApprovalResponse>`  |  **HTTP:** `PUT /api/v1/agent/sessions/{id}/approval`
**CLI:** `hoody agent sessions approval update`

---

### `client.agent.sessions.turns` (5) — Create, drive, and tear down agent sessions

#### `cancel` — Cancel the active turn (Esc), or one named turn.

```typescript
client.agent.sessions.turns.cancel(id: string, data?: AgentSessionsTurnsCancelRequest, options?: { turn_id?: string; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `turn_id` | `string` | query | No | Cancel only this turn (alternative to the body field). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSessionsTurnsCancelRequest` | body | No |  |

**Body:** `{ turn_id: string }`

**Returns:** `Promise<AgentSessionsTurnsCancelResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/cancel`
**CLI:** `hoody agent sessions turns cancel`

---

#### `create` — Dispatch a turn (retry-safe).

```typescript
client.agent.sessions.turns.create(id: string, data: AgentSessionsTurnsCreateRequest, options?: { realm?: string; IdempotencyKey?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key returns the same receipt and never re-runs the turn; the same key with a different request body is 422. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
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
client.agent.sessions.turns.get(id: string, turn_id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `turn_id` | `string` | path | Yes | The turn id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentSessionsTurnsGetResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/turns/{turn_id}`
**CLI:** `hoody agent sessions turns get`

---

#### `list` — List a session's durable turn receipts.

```typescript
client.agent.sessions.turns.list(id: string, options?: { limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `limit` | `number` | query | No | Return at most this many receipts, newest first (1–1000). A cap, not a page size: there is no next page. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentSessionsTurnsListResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/turns`
**CLI:** `hoody agent sessions turns list`

---

#### `run` — Dispatch a turn and block until it ends (no reply text: read it from the transcript)

```typescript
client.agent.sessions.turns.run(id: string, data: AgentSessionsTurnsRunRequest, options?: { policy?: string; realm?: string; XHoodyGatePolicy?: string; IdempotencyKey?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
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
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
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
client.agent.skills.create(data: AgentSkillsCreateRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSkillsCreateRequest` | body | Yes |  |

**Body:** `{ name*: string }`

- `name` — Skill name (also the SKILL.md directory stem, and the frontmatter `name`). Must not collide with an existing skill in any root.

**Returns:** `Promise<AgentSkillsCreateResponse>`  |  **HTTP:** `POST /api/v1/agent/skills`
**CLI:** `hoody agent skills create`

---

#### `delete` — Delete a skill.

```typescript
client.agent.skills.delete(data: AgentSkillsDeleteRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSkillsDeleteRequest` | body | Yes |  |

**Body:** `{ root_dir*: string, rel_dir*: string }`

**Returns:** `Promise<AgentSkillsDeleteResponse>`  |  **HTTP:** `POST /api/v1/agent/skills/delete`
**CLI:** `hoody agent skills delete`

---

#### `disable` — Enable/disable a skill.

```typescript
client.agent.skills.disable(...args: FacadeBodyArgs<FacadeWithout<NonNullable<Parameters<SkillsServiceBase['__toggleSkill']>[0]>, "disabled">, [options?: NonNullable<Parameters<SkillsServiceBase['__toggleSkill']>[1]>, _templateVars?: Parameters<SkillsServiceBase['__toggleSkill']>[2]]>)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ name*: string, disabled: bool }`

**Returns:** `ReturnType<SkillsServiceBase['__toggleSkill']>`  |  **HTTP:** `POST /api/v1/agent/skills/toggle`
**CLI:** `hoody agent skills disable`

---

#### `enable` — Enable/disable a skill.

```typescript
client.agent.skills.enable(...args: FacadeBodyArgs<FacadeWithout<NonNullable<Parameters<SkillsServiceBase['__toggleSkill']>[0]>, "disabled">, [options?: NonNullable<Parameters<SkillsServiceBase['__toggleSkill']>[1]>, _templateVars?: Parameters<SkillsServiceBase['__toggleSkill']>[2]]>)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ name*: string, disabled: bool }`

**Returns:** `ReturnType<SkillsServiceBase['__toggleSkill']>`  |  **HTTP:** `POST /api/v1/agent/skills/toggle`
**CLI:** `hoody agent skills enable`

---

#### `getSource` — Read a skill's source.

```typescript
client.agent.skills.getSource(options?: { root_dir?: string; rel_dir?: string; root?: string; rel?: string; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
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
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentSkillsGetSourceResponse>`  |  **HTTP:** `GET /api/v1/agent/skills/source`
**CLI:** `hoody agent skills source get`

---

#### `import` — Apply a skill import.

```typescript
client.agent.skills.import(data: AgentSkillsImportRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSkillsImportRequest` | body | Yes |  |

**Body:** `{ source*: "claude" | "codex", items*: { source: string, rel_dir: string }[], overwrite: bool }`

- `items` — The selected scan entries to import. At least one is required.

**Returns:** `Promise<AgentSkillsImportResponse>`  |  **HTTP:** `POST /api/v1/agent/skills/import/apply`
**CLI:** `hoody agent skills import`

---

#### `list` — List skills.

```typescript
client.agent.skills.list(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentSkillsListResponse>`  |  **HTTP:** `GET /api/v1/agent/skills`
**CLI:** `hoody agent skills list`

---

#### `listAll` — List skills. (collect all pages)

```typescript
client.agent.skills.listAll(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<(NonNullable<AgentSkillsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/skills`
**CLI:** `hoody agent skills list`

---

#### `listIterator` — List skills. (async iterator)

```typescript
client.agent.skills.listIterator(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncGenerator<(NonNullable<AgentSkillsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/skills`
**CLI:** `hoody agent skills list`

---

#### `rename` — Rename a skill.

```typescript
client.agent.skills.rename(data: AgentSkillsRenameRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSkillsRenameRequest` | body | Yes |  |

**Body:** `{ root_dir*: string, rel_dir*: string, new_name*: string }`

**Returns:** `Promise<AgentSkillsRenameResponse>`  |  **HTTP:** `POST /api/v1/agent/skills/rename`
**CLI:** `hoody agent skills rename`

---

#### `scan` — Scan for importable skills.

```typescript
client.agent.skills.scan(options: { source: "claude" | "codex"; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source` | `"claude" \| "codex"` | query | Yes | Which tool's skills to scan. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentSkillsScanResponse>`  |  **HTTP:** `GET /api/v1/agent/skills/import/scan`
**CLI:** `hoody agent skills scan`

---

#### `setSource` — Write a skill's source.

```typescript
client.agent.skills.setSource(data: AgentSkillsSetSourceRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSkillsSetSourceRequest` | body | Yes |  |

**Body:** `{ root_dir*: string, rel_dir*: string, content*: string, base_gen: int }`

- `base_gen` — Optional: the `gen` returned by `agent.skills.getSource` (or a previous `agent.skills.setSource`). A save whose SKILL.md changed since is refused 409 revision_conflict (details.current_gen) and writes nothing. Omit or pass 0 to save unconditionally.

**Returns:** `Promise<AgentSkillsSetSourceResponse>`  |  **HTTP:** `PUT /api/v1/agent/skills/source`
**CLI:** `hoody agent skills source set`

---

#### `trust` — Set a skill's trust state.

```typescript
client.agent.skills.trust(data: AgentSkillsTrustRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSkillsTrustRequest` | body | Yes |  |

**Body:** `{ root_dir*: string, rel_dir*: string, trusted*: bool }`

**Returns:** `Promise<AgentSkillsTrustResponse>`  |  **HTTP:** `POST /api/v1/agent/skills/trust`
**CLI:** `hoody agent skills trust`

---

### `client.agent.skills.hub` (5) — Reusable agent skill definitions

#### `clearCache` — Clear the skill hub cache.

```typescript
client.agent.skills.hub.clearCache(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentSkillsHubClearCacheResponse>`  |  **HTTP:** `DELETE /api/v1/agent/skills/hub/cache`
**CLI:** `hoody agent skills hub cache clear`

---

#### `getCacheStats` — Skill hub cache stats.

```typescript
client.agent.skills.hub.getCacheStats(options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentSkillsHubGetCacheStatsResponse>`  |  **HTTP:** `GET /api/v1/agent/skills/hub/cache`
**CLI:** `hoody agent skills hub cache stats`

---

#### `install` — Install a hub skill.

```typescript
client.agent.skills.hub.install(data: AgentSkillsHubInstallRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentSkillsHubInstallRequest` | body | Yes |  |

**Body:** `{ package_digest*: string, overwrite: bool }`

- `package_digest` — The `package_digest` `agent.skills.hub.preview` returned. The install takes exactly that cached package, so preview first; a digest no longer in the cache is refused (preview again).
- `overwrite` — Replace a skill already installed under the same name. Without it (default false) such an install is refused.

**Returns:** `Promise<AgentSkillsHubInstallResponse>`  |  **HTTP:** `POST /api/v1/agent/skills/hub/install`
**CLI:** `hoody agent skills hub install`

---

#### `preview` — Preview a hub skill.

```typescript
client.agent.skills.hub.preview(options: { provider: string; source: string; skill_id: string; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `provider` | `string` | query | Yes | Hub provider of the skill (a search result's ref.provider). |
| `source` | `string` | query | Yes | Source of the skill on the hub, such as owner/repo (a search result's ref.source). |
| `skill_id` | `string` | query | Yes | Hub skill id (a search result's ref.skill_id). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentSkillsHubPreviewResponse>`  |  **HTTP:** `GET /api/v1/agent/skills/hub/preview`
**CLI:** `hoody agent skills hub preview`

---

#### `search` — Search the skill hub.

```typescript
client.agent.skills.hub.search(options: { query: string; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `query` | `string` | query | Yes | Search text. Required and non-empty. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentSkillsHubSearchResponse>`  |  **HTTP:** `GET /api/v1/agent/skills/hub/search`
**CLI:** `hoody agent skills hub search`

---

### `client.agent.stats` (1) — Per-session and aggregate usage counters

#### `get` — Cross-session statistics.

```typescript
client.agent.stats.get(options?: { scope?: string; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `scope` | `string` | query | No | cwd (default) rolls up the current working directory; all rolls up every session. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentStatsGetResponse>`  |  **HTTP:** `GET /api/v1/agent/statistics`
**CLI:** `hoody agent stats`

---

### `client.agent.tasks` (3) — Background task management

#### `cancel` — Cancel a background task.

```typescript
client.agent.tasks.cancel(id: string, tid: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `tid` | `string` | path | Yes | The task id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentTasksCancelResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/tasks/{tid}/cancel`
**CLI:** `hoody agent tasks cancel`

---

#### `getTranscript` — Read a background task's transcript.

```typescript
client.agent.tasks.getTranscript(id: string, tid: string, options?: { after_seq?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `tid` | `string` | path | Yes | The task id. |
| `after_seq` | `number` | query | No | Exclusive int64 upsert-poll cursor: entries with seq strictly greater than it, plus any still-OPEN entry regardless of its seq. Omit for the whole transcript (distinct from 0, which skips a closed seq-0 entry). Negative/non-integer = 400. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentTasksGetTranscriptResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tasks/{tid}/transcript`
**CLI:** `hoody agent tasks transcript get`

---

#### `list` — List a session's background tasks.

```typescript
client.agent.tasks.list(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentTasksListResponse>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tasks`
**CLI:** `hoody agent tasks list`

---

### `client.agent.todos` (19) — Container-aware task list management

#### `approveProposal` — Approve a todo proposal.

```typescript
client.agent.todos.approveProposal(id: string, pid: string, data?: AgentTodosApproveProposalRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `pid` | `string` | path | Yes | The proposal id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentTodosApproveProposalRequest` | body | No |  |

**Returns:** `Promise<AgentTodosApproveProposalResponse>`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/proposals/{pid}/approve`
**CLI:** `hoody agent todos proposals approve`

---

#### `archive` — Archive a todo.

```typescript
client.agent.todos.archive(id: string, data: AgentTodosArchiveRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentTodosArchiveRequest` | body | Yes |  |

**Body:** `{ revision*: int }`

- `revision` — The TODO's own current `revision` (from `agent.todos.get`); required — a stale or absent value is rejected.

**Returns:** `Promise<AgentTodosArchiveResponse>`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/archive`
**CLI:** `hoody agent todos archive`

---

#### `cancel` — Cancel a todo's run.

```typescript
client.agent.todos.cancel(id: string, data?: AgentTodosCancelRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentTodosCancelRequest` | body | No |  |

**Returns:** `Promise<AgentTodosCancelResponse>`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/cancel-run`
**CLI:** `hoody agent todos cancel`

---

#### `claim` — Claim a todo.

```typescript
client.agent.todos.claim(id: string, data: AgentTodosClaimRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentTodosClaimRequest` | body | Yes |  |

**Body:** `{ session_id*: string, run_id: string, revision: int }`

- `session_id` — Identity that will OWN the lease — required and non-empty. `agent.todos.release` must present the same value; while the lease is live another session_id cannot claim the todo.
- `revision` — … CONDITIONALLY required: a FRESH claim (no live lease, or a lease held by another session_id) must carry it — omitted means revision 0 and the CAS refuses the claim (409 todo_conflict) — while the lease's CURRENT owner re-claiming to refresh its TTL may omit it (the daemon waives the CAS for the owner). It is not in the schema's required list only because of that second case.

**Returns:** `Promise<AgentTodosClaimResponse>`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/claim`
**CLI:** `hoody agent todos claim`

---

#### `create` — File a todo.

```typescript
client.agent.todos.create(data: AgentTodosCreateRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentTodosCreateRequest` | body | Yes |  |

**Body:** `{ title*: string, body: string, priority: int, tags: string[], cwd: string }`

- `priority` — Optional priority band 0..4 (0 = P0 urgent … 4 = P4 someday); defaults to 2 when omitted. Must be a JSON integer in range — a string or out-of-range value is rejected.
- `cwd` — The todo's working directory (labels the record's computer/path). Defaults to the X-Hoody-Cwd request-scope header when omitted; one of the two must be set.

**Returns:** `Promise<AgentTodosCreateResponse>`  |  **HTTP:** `POST /api/v1/agent/todos`
**CLI:** `hoody agent todos create`

---

#### `createComment` — Comment on a todo.

```typescript
client.agent.todos.createComment(id: string, data: AgentTodosCreateCommentRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentTodosCreateCommentRequest` | body | Yes |  |

**Body:** `{ text*: string }`

**Returns:** `Promise<AgentTodosCreateCommentResponse>`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/messages`
**CLI:** `hoody agent todos comments create`

---

#### `denyProposal` — Deny a todo proposal.

```typescript
client.agent.todos.denyProposal(id: string, pid: string, data?: AgentTodosDenyProposalRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `pid` | `string` | path | Yes | The proposal id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentTodosDenyProposalRequest` | body | No |  |

**Returns:** `Promise<AgentTodosDenyProposalResponse>`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/proposals/{pid}/deny`
**CLI:** `hoody agent todos proposals deny`

---

#### `get` — Read a todo.

```typescript
client.agent.todos.get(id: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentTodosGetResponse>`  |  **HTTP:** `GET /api/v1/agent/todos/{id}`
**CLI:** `hoody agent todos get`

---

#### `getRevision` — Get the todos store revision.

```typescript
client.agent.todos.getRevision(options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentTodosGetRevisionResponse>`  |  **HTTP:** `GET /api/v1/agent/todos/revision`
**CLI:** `hoody agent todos revision get`

---

#### `list` — List todos.

```typescript
client.agent.todos.list(options?: { states?: ("inbox" | "ready" | "blocked" | "in_progress" | "review" | "done" | "dropped")[]; tags?: string[]; query?: string; open_only?: boolean; all?: boolean; sort?: "default" | "closed_at"; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `states` | `("inbox" \| "ready" \| "blocked" \| "in_progress" \| "review" \| "done" \| "dropped")[]` | query | No | Only todos in one of these states. Repeat the parameter for several (?states=ready&states=blocked). |
| `tags` | `string[]` | query | No | Only todos carrying these tags. Repeat the parameter for several (?tags=a&tags=b). |
| `query` | `string` | query | No | Free-text filter over title/body. |
| `open_only` | `boolean` | query | No | When true, only open (non-terminal) todos. |
| `all` | `boolean` | query | No | When true, include archived/closed todos. |
| `sort` | `"default" \| "closed_at"` | query | No | List order. `default` (or omitted): open todos first, then priority, rank, number. `closed_at`: closed todos by `closed_at`, newest first; todos without a `closed_at` follow in the default order. Any other value is 400. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentTodosListResponse>`  |  **HTTP:** `GET /api/v1/agent/todos`
**CLI:** `hoody agent todos list`

---

#### `listAll` — List todos. (collect all pages)

```typescript
client.agent.todos.listAll(options?: { states?: ("inbox" | "ready" | "blocked" | "in_progress" | "review" | "done" | "dropped")[]; tags?: string[]; query?: string; open_only?: boolean; all?: boolean; sort?: "default" | "closed_at"; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `states` | `("inbox" \| "ready" \| "blocked" \| "in_progress" \| "review" \| "done" \| "dropped")[]` | query | No | Only todos in one of these states. Repeat the parameter for several (?states=ready&states=blocked). |
| `tags` | `string[]` | query | No | Only todos carrying these tags. Repeat the parameter for several (?tags=a&tags=b). |
| `query` | `string` | query | No | Free-text filter over title/body. |
| `open_only` | `boolean` | query | No | When true, only open (non-terminal) todos. |
| `all` | `boolean` | query | No | When true, include archived/closed todos. |
| `sort` | `"default" \| "closed_at"` | query | No | List order. `default` (or omitted): open todos first, then priority, rank, number. `closed_at`: closed todos by `closed_at`, newest first; todos without a `closed_at` follow in the default order. Any other value is 400. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<(NonNullable<AgentTodosListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/todos`
**CLI:** `hoody agent todos list`

---

#### `listIterator` — List todos. (async iterator)

```typescript
client.agent.todos.listIterator(options?: { states?: ("inbox" | "ready" | "blocked" | "in_progress" | "review" | "done" | "dropped")[]; tags?: string[]; query?: string; open_only?: boolean; all?: boolean; sort?: "default" | "closed_at"; page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `states` | `("inbox" \| "ready" \| "blocked" \| "in_progress" \| "review" \| "done" \| "dropped")[]` | query | No | Only todos in one of these states. Repeat the parameter for several (?states=ready&states=blocked). |
| `tags` | `string[]` | query | No | Only todos carrying these tags. Repeat the parameter for several (?tags=a&tags=b). |
| `query` | `string` | query | No | Free-text filter over title/body. |
| `open_only` | `boolean` | query | No | When true, only open (non-terminal) todos. |
| `all` | `boolean` | query | No | When true, include archived/closed todos. |
| `sort` | `"default" \| "closed_at"` | query | No | List order. `default` (or omitted): open todos first, then priority, rank, number. `closed_at`: closed todos by `closed_at`, newest first; todos without a `closed_at` follow in the default order. Any other value is 400. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `AsyncGenerator<(NonNullable<AgentTodosListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/todos`
**CLI:** `hoody agent todos list`

---

#### `purgeArchived` — Purge archived todos.

```typescript
client.agent.todos.purgeArchived(data?: AgentTodosPurgeArchivedRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentTodosPurgeArchivedRequest` | body | No |  |

**Returns:** `Promise<AgentTodosPurgeArchivedResponse>`  |  **HTTP:** `POST /api/v1/agent/todos/purge`
**CLI:** `hoody agent todos archived purge`

---

#### `release` — Release a todo.

```typescript
client.agent.todos.release(id: string, data: AgentTodosReleaseRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
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
client.agent.todos.sendMessage(id: string, data: AgentTodosSendMessageRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentTodosSendMessageRequest` | body | Yes |  |

**Body:** `{ text*: string }`

**Returns:** `Promise<AgentTodosSendMessageResponse>`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/message`
**CLI:** `hoody agent todos messages send`

---

#### `snooze` — Snooze a todo.

```typescript
client.agent.todos.snooze(id: string, data: AgentTodosSnoozeRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentTodosSnoozeRequest` | body | Yes |  |

**Body:** `{ wake_at*: string, revision*: int }`

- `revision` — The TODO's own current `revision` (from `agent.todos.get`); a stale value is rejected.

**Returns:** `Promise<AgentTodosSnoozeResponse>`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/snooze`
**CLI:** `hoody agent todos snooze`

---

#### `start` — Run a todo's orchestrator.

```typescript
client.agent.todos.start(id: string, data?: AgentTodosStartRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentTodosStartRequest` | body | No |  |

**Returns:** `Promise<AgentTodosStartResponse>`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/run`
**CLI:** `hoody agent todos start`

---

#### `triage` — Run an LLM triage pass.

```typescript
client.agent.todos.triage(data?: AgentTodosTriageRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentTodosTriageRequest` | body | No |  |

**Returns:** `Promise<AgentTodosTriageResponse>`  |  **HTTP:** `POST /api/v1/agent/todos/triage`
**CLI:** `hoody agent todos triage`

---

#### `update` — Update a todo (CAS).

```typescript
client.agent.todos.update(id: string, data: AgentTodosUpdateRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
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
client.agent.tools.run(name: Parameters<ToolsServiceBase['__streamTool']>[0], data: NonNullable<Parameters<ToolsServiceBase['__streamTool']>[1]> | undefined, options: NonNullable<Parameters<ToolsServiceBase['__streamTool']>[2]> & { stream: true })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `confirm` | `boolean` | query | No | Query alias of the body `confirm` field — re-issue a previously-parked confirmation (pair with confirm_token). |
| `confirm_token` | `string` | query | No | Query alias of the body `confirm_token` field — the single-use token returned in the 409 tool_needs_confirmation details. |
| `X-Hoody-Tool-Mode` | `string` | header | No | Sessionless tool-mode for the ephemeral session: `standard` (the default) or `orchestrator`. Any other value is refused 400 invalid_tool_mode. Ignored on the in-session run (it inherits the session's frozen tool-mode). |
| `X-Hoody-Dir-Scope` | `string` | header | No | Sessionless directory-access scope for the ephemeral session: home (the default) or full. Any other value is refused 400 invalid_dir_scope. Ignored on the in-session run (it inherits the session's frozen dir-scope). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `NonNullable<Parameters<ToolsServiceBase['__streamTool']>[1]> \| undefined` | body | Yes |  |
| `stream` | `boolean` | option | No | Stream the tool output as server-sent events. |

**Body:** `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }`

- `confirm` — Re-issue a previously-parked confirmation. MUST be paired with the confirm_token from the prior 409; a bare confirm:true with no valid token does NOT bypass the gate (it re-parks). A wire confirmed key in params is always scrubbed.
- `confirm_token` — The single-use token returned in the 409 tool_needs_confirmation details. Bound to the tool/session/params it was minted for; present it with confirm:true and the echoed params to approve the parked run.
- `allow_mutations` — Sessionless only: opt a non-read-only tool into running with every permission check applied (else a sessionless mutating run is refused 400 tool_mutation_refused).

**Returns:** `ReturnType<ToolsServiceBase['__streamTool']>`  |  **HTTP:** `POST /api/v1/agent/tools/{name}/run`
**CLI:** `hoody agent tools run`

---

#### `start` — Run a tool asynchronously (sessionless, gated).

```typescript
client.agent.tools.start(name: string, data?: AgentToolsStartRequest, options?: { confirm?: boolean; confirm_token?: string; realm?: string; XHoodyToolMode?: string; XHoodyDirScope?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
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
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
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
client.agent.workflows.cancelRun(run_id: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `run_id` | `string` | path | Yes | The run id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentWorkflowsCancelRunResponse>`  |  **HTTP:** `POST /api/v1/agent/workflows/runs/{run_id}/cancel`
**CLI:** `hoody agent workflows runs cancel`

---

#### `delete` — Delete a workflow definition.

```typescript
client.agent.workflows.delete(name: string, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentWorkflowsDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/agent/workflows/{name}`
**CLI:** `hoody agent workflows delete`

---

#### `get` — Read one workflow definition.

```typescript
client.agent.workflows.get(name: string, options?: { include_revision?: boolean; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `include_revision` | `boolean` | query | No | If "true", the tool output's first line is `revision: <opaque>` — pass that value as `agent.workflows.set`'s expected_revision to guard against concurrent edits; the JSON below it is unchanged. Strictly parsed: exactly one value, "true" or "false"; anything else (empty, "TRUE", "1", repeated) is a 400 bad_request. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentWorkflowsGetResponse>`  |  **HTTP:** `GET /api/v1/agent/workflows/{name}`
**CLI:** `hoody agent workflows get`

---

#### `getRun` — Get one workflow run by id.

```typescript
client.agent.workflows.getRun(run_id: string, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `run_id` | `string` | path | Yes | The run id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentWorkflowsGetRunResponse>`  |  **HTTP:** `GET /api/v1/agent/workflows/runs/{run_id}`
**CLI:** `hoody agent workflows runs get`

---

#### `list` — List workflow definitions.

```typescript
client.agent.workflows.list(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<AgentWorkflowsListResponse>`  |  **HTTP:** `GET /api/v1/agent/workflows`
**CLI:** `hoody agent workflows list`

---

#### `listAll` — List workflow definitions. (collect all pages)

```typescript
client.agent.workflows.listAll(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `Promise<(NonNullable<AgentWorkflowsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/workflows`
**CLI:** `hoody agent workflows list`

---

#### `listIterator` — List workflow definitions. (async iterator)

```typescript
client.agent.workflows.listIterator(options?: { page?: number; limit?: number; realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncGenerator<(NonNullable<AgentWorkflowsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/workflows`
**CLI:** `hoody agent workflows list`

---

#### `listRuns` — Snapshot in-flight and recent workflow runs.

```typescript
client.agent.workflows.listRuns(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<AgentWorkflowsListRunsResponse>`  |  **HTTP:** `GET /api/v1/agent/workflows/runs`
**CLI:** `hoody agent workflows runs list`

---

#### `listRunsAll` — Snapshot in-flight and recent workflow runs. (collect all pages)

```typescript
client.agent.workflows.listRunsAll(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `Promise<(NonNullable<AgentWorkflowsListRunsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`listRuns()` fetches one page). `listRunsIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/workflows/runs`
**CLI:** `hoody agent workflows runs list`

---

#### `listRunsIterator` — Snapshot in-flight and recent workflow runs. (async iterator)

```typescript
client.agent.workflows.listRunsIterator(options?: { page?: number; limit?: number; XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |

**Returns:** `AsyncGenerator<(NonNullable<AgentWorkflowsListRunsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`listRuns()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/workflows/runs`
**CLI:** `hoody agent workflows runs list`

---

#### `resumeRun` — Resume a failed or cancelled workflow run.

```typescript
client.agent.workflows.resumeRun(run_id: string, data: AgentWorkflowsResumeRunRequest, options?: { XHoodyCwd?: string; XHoodyConfigDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `run_id` | `string` | path | Yes | The run id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `data` | `AgentWorkflowsResumeRunRequest` | body | Yes |  |

**Body:** `{ session_id*: string }`

**Returns:** `Promise<AgentWorkflowsResumeRunResponse>`  |  **HTTP:** `POST /api/v1/agent/workflows/runs/{run_id}/resume`
**CLI:** `hoody agent workflows runs resume`

---

#### `sendMessage` — Send a message to a running workflow.

```typescript
client.agent.workflows.sendMessage(id: string, data?: AgentWorkflowsSendMessageRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentWorkflowsSendMessageRequest` | body | No |  |

**Body:** `{ text: string }`

**Returns:** `Promise<AgentWorkflowsSendMessageResponse>`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/workflow/messages`
**CLI:** `hoody agent workflows messages send`

---

#### `set` — Create or replace a workflow definition.

```typescript
client.agent.workflows.set(name: string, data: AgentWorkflowsSetRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentWorkflowsSetRequest` | body | Yes |  |

**Body:** `{ definition*: object, expected_revision: string, expected_absent: bool }`

- `expected_revision` — … If the stored workflow changed since that read, the upsert is refused with [revision_conflict] and nothing is written. … The revision is bound to the realm this request resolves to: on a gateway without a realm pin, a revision read while another realm was active is refused [revision_conflict] (current_revision is this realm's), never written into the other realm.
- `expected_absent` — Optional create-only guard: refuse with [already_exists] (writing nothing) if any workflow with this name already exists. Use when creating a new workflow that must not overwrite an existing one. Mutually exclusive with expected_revision.

**Returns:** `Promise<AgentWorkflowsSetResponse>`  |  **HTTP:** `PUT /api/v1/agent/workflows/{name}`
**CLI:** `hoody agent workflows set`

---

#### `setHidden` — Hide or un-hide a workflow.

```typescript
client.agent.workflows.setHidden(name: string, data?: AgentWorkflowsSetHiddenRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentWorkflowsSetHiddenRequest` | body | No |  |

**Body:** `{ hidden: bool }`

**Returns:** `Promise<AgentWorkflowsSetHiddenResponse>`  |  **HTTP:** `POST /api/v1/agent/workflows/{name}/hide`
**CLI:** `hoody agent workflows hidden set`

---

#### `setSummary` — Set or clear a workflow's summary.

```typescript
client.agent.workflows.setSummary(name: string, data: AgentWorkflowsSetSummaryRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentWorkflowsSetSummaryRequest` | body | Yes |  |

**Body:** `{ summary*: string, expected_revision: string }`

- `summary` — The new summary. An empty string clears it. Required — omitting it is a 400, not a clear.
- `expected_revision` — … If the workflow changed or was deleted since that read, the write is refused 409 revision_conflict and nothing is written. … The revision is bound to the realm this request resolves to: on a gateway without a realm pin, a revision read while another realm was active is refused 409 revision_conflict (details.current_revision is this realm's), never written into the other realm.

**Returns:** `Promise<AgentWorkflowsSetSummaryResponse>`  |  **HTTP:** `PUT /api/v1/agent/workflows/{name}/summary`
**CLI:** `hoody agent workflows summary set`

---

#### `start` — Run a workflow in a new session.

```typescript
client.agent.workflows.start(name: string, data?: AgentWorkflowsStartRequest, options?: { realm?: string; XHoodyCwd?: string; XHoodyConfigDir?: string; XHoodyContainer?: string; XHoodyRealm?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The name. |
| `XHoodyCwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; `agent.todos.create` also accepts a body cwd). |
| `XHoodyConfigDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. |
| `XHoodyContainer` | `string` | header `X-Hoody-Container` | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `XHoodyRealm` | `string` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `AgentWorkflowsStartRequest` | body | No |  |

**Body:** `{ prompt: string, inputs: { [key: string]: string }, realm: string, container: string, cwd: string, config_dir: string, model: string, agent: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", headless: bool }`

- `inputs` — Optional run-time values for the workflow's DECLARED input parameters (declared name → string value; resolves to $(input.<name>) in every step). A workflow with a REQUIRED declared parameter cannot run without these. Values must be strings; a non-string value is a 400.
- `model` — Model for this session; overrides the chat agent's pinned model for this session only. An unknown model is refused 422 unknown_model.
- `tool_mode` — Initial tool mode (frozen at start): standard (the default) or orchestrator. Any other value is refused 400 invalid_tool_mode.
- `dir_scope` — Initial directory-access scope (frozen at start): home or full. Any other value is refused 400 invalid_dir_scope.

**Returns:** `Promise<AgentWorkflowsStartResponse>`  |  **HTTP:** `POST /api/v1/agent/workflows/{name}/runs`
**CLI:** `hoody agent workflows start`

