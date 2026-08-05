> _**SDK skill · `agent` namespace** · ~97,415 tokens · hoody-sdk v1.0.0-beta.11_

# `agent` — In-container AI coding agent over HTTP

## Purpose

The `hoody-agent-d` HTTP gateway exposes the in-container AI agent as a typed namespace: create a chat session, send a prompt, stream the turn (tool calls, gates, output), then confirm/answer/cancel as the agent works. 22 services — `sessions`, `agents`, `models`, `skills`, `memory`, `github`, `workflows`, `tools`, `hooks`, `mcp`, `settings`, `system`, `loops`, `logs`, `tasks`, `statistics`, `jobs`, `discovery`, `headless`, `todos`, plus `hoody` (token bootstrap) and a namespace-root `exportLogs`.

## When to use

- **Drive the agent programmatically** — create a session, prompt it, and consume the turn: `client.agent.sessions.createSession` → stream the turn for live tool/gate/output events (per surface — see the streaming note under Quirks), or `promptSync` for one blocking call → resolve gates with `confirmGate` / `answerQuestion` → `cancelSession` to interrupt.
- **Inspect or configure the agent** — list `models` (`listModels` / `getModel`) and `listProviders` (configure providers via `setProviderDefault` / `setProviderAPIKey` / `startProviderOAuth`); switch a session's active model with `sessions.setSessionModel`, browse/install `skills`, read/edit `memory`, manage `workflows`, `hooks`, `agents` (named agent profiles), and `tools` — both the sessionless catalogue/registry (`tools.listTools` / `listReadOnlyTools` / `getTool`, and `runTool` (blocks, returns the result) / `runToolAsync` (returns `{ job_id }`, poll `jobs`) / `streamTool` (one-shot result over SSE frames — not a per-token stream) to invoke a tool with no session — read-only by default, a mutating tool needs `allow_mutations: true` or a confirmed re-issue) and the per-session surface (`listSessionTools` for a session's *effective* tool set, `listSessionMCPTools`, and `runSessionTool`). Unlike the sessionless `runTool`, a per-session run executes against the session's *frozen* realm/container/cwd/tool-mode and claims the session's single serial turn slot — so it returns 409 `turn_in_flight` while a turn is running, 409 `gate_parked` while a gate is open, and 404 `tool_not_found` if the tool is not in that session's effective list; its mutating-tool posture comes from the live session's gate chain (the `allow_mutations` escape hatch is sessionless-only).
- **One-shot non-interactive runs** — `client.agent.headless.createHeadlessRun` for a fire-and-forget agent invocation that returns a job; poll `jobs.getJob` / `jobs.getJobResult`.
- **GitHub from inside the agent** — first establish an account with `github.githubLogin` (omit the body for a GitHub device flow → poll `github.githubLoginPoll`; or pass a `token` PAT to persist it directly), then `githubAuthStatus` to confirm; once an account is active, `githubClone` / `githubCommit` (and `githubStatus` / `githubBranches` / `githubRepos` / `githubPullRequest` / `githubSync`) for repo operations the agent performs in-container.

## When NOT to use

- Want the interactive TUI, not the API? Run the bare `hoody agent` launcher (`cli/agent-command.ts`) — it opens the in-container Agent TUI over the terminal-kit WebSocket; this namespace is the HTTP control surface beside it.
- Raw shell / command exec → `terminal` (PTY) or `exec` (one-shot). File I/O → `files`. The agent runs these as tools internally; call them directly when you don't need the LLM.
- Account-level resources (containers, billing, realms) → `api`.

## Prerequisites

- Container with the `agent` kit running (`hoody-agent-d` gateway); capability URL.
- At least one model provider configured (`client.agent.models.listProviders` / `listModels` to confirm one is usable) before prompting.
- A session id from `createSession` for every prompt/gate/cancel call.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Prompt a session and stream the turn

`client.agent.sessions.createSession` (returns a session id) → stream the turn with `{ text }` to receive live events (tool calls, gates, output deltas) — see the streaming note under Quirks for the supported per-surface method (SDK helper / HTTP SSE route / CLI command) → resolve any gate as it arrives → turn ends.

### 2. One-shot synchronous prompt

`client.agent.sessions.createSession` → `client.agent.sessions.promptSync` with `{ text }` — blocks until the turn finishes and returns the result in one call. Best for short, non-interactive prompts where you don't need streamed events.

### 3. Resolve gates mid-turn

While a prompt streams, the agent may pause for human input: a confirmation gate → `client.agent.sessions.confirmGate`; an open question → `client.agent.sessions.answerQuestion` (to get a helper model to DRAFT an answer for a parked question call `client.agent.sessions.answerAssist` — it does NOT answer the gate: it dispatches an async job (HTTP 202) whose suggestion arrives via `client.agent.jobs.getJobResult` and an `event.question_suggestion` on the session stream — only one assist may be in flight per session — and the real answer still goes through `answerQuestion`; for unattended runs arm `client.agent.sessions.setSessionAutoReply` (a self-driving auto-user loop that withholds write-class actions unless you opt in with `allow_writes: true`, either on the arm call or later via `setSessionAutoReplyWrites`)). Echoing a wrong/stale `gate_id`/`generation`, or answering when nothing is parked, returns 409 (`no_pending_gate` / `stale_gate` / `gate_already_answered` / `gate_type_mismatch`). Interrupt a running turn with `client.agent.sessions.cancelSession`. Tear the session down: `client.agent.sessions.closeSession` removes it from the live map; `deleteSession` drops the live connection but keeps the persisted record (re-attach via `createSession({ attach })`), while a *hard* delete (set the `hard` flag — SDK `deleteSession(id, { hard: true })`, HTTP `?hard=true`, CLI `--hard`) also erases the persisted record. To roll a session back without tearing it down, `client.agent.sessions.trimSession` with `{ turn_idx }` truncates conversation history to (and including) that turn index.

### 4. Pick a model / provider

`client.agent.models.listProviders` to see configured providers, `client.agent.models.listModels` to list available models, then `client.agent.sessions.setSessionModel` to bind a model to a session before prompting — SYNCHRONOUS: the response reports the actual outcome ({status:'ok', model, persisted} on success; structured 409/422 errors while busy or for an unconstructable spec) and a successful switch PERSISTS into the chat agent's frontmatter (a global repin for future sessions of that agent). PRECEDENCE: the agent's frontmatter `model` is the DEFAULT for a session that does not request one; an explicit `createSession({ model })` (or this live `setSessionModel`) OVERRIDES that pin for the session — create is session-scoped and does not rewrite the agent, this live switch repins globally. The shipped default agent ships pinned, so its pin is the out-of-the-box default until an explicit model is chosen (`createSession({ model })` with attach or backend:"acp" is rejected 400 — a resumed/delegated session cannot take an explicit model). Each session has further per-session knobs (all session-scoped PATCHes that apply live): `setSessionEffort` (`{ effort }` — `low|medium|high|xhigh`, or `""` for the model default), `setSessionVerbosity` (`{ level }` — `normal|concise|terse|minimal`), `setSessionHoodyEnv` (`{ enabled }` — toggle whether the `HOODY_*` shell-env contract is injected for the bash tool), and `setSessionAgent` (`{ agent }` — bind a named profile from `agents`).

### 5. Skills, memory, todos, workflows, agents

- **Skills** — `client.agent.skills.listSkills` (each carries an enabled + trust state), `installSkillHub` / `searchSkillHub` / `previewSkillHub` to find and install from the hub. A newly installed/imported skill must be trusted before its code runs — `client.agent.skills.trustSkill` is the gate (identify the skill by `root_dir`+`rel_dir`, set the `trusted` flag); `toggleSkill` only enables/disables by `name` (set the `disabled` flag). Like the J-class todo ops, both `trustSkill` (which grants arbitrary code-execution trust) and `installSkillHub` (which writes arbitrary skill code to disk) have NO human-confirmation gate over this namespace — that denial lives only on the model-facing skill-edit tool path, and the HTTP edge has no app-level admin gate, so an autonomous API caller can silently trust and install skill code; gate these in your own caller.
- **Memory** — `client.agent.memory.searchMemory` for hybrid recall (BM25 + vector + graph) and `listMemoryItems` to enumerate by `project`; `saveMemoryItem` / `editMemoryItem` / `deleteMemoryItem` to write; `getMemoryGraph` for the relation graph (or `getMemoryItem` to read one record by `id`). `setMemoryEnabled` (`{ enabled }`) is the memory capture/privacy switch — it persists `features.memory` and flips the live store — and `flushMemory` forces the store's durability barrier; both are not admin-gated. Memory is project-scoped (pass `project`); the reads (`searchMemory` / `listMemoryItems` / `getMemoryGraph` / `listMemoryProjects`) and `consolidateMemory` are active-realm-only (a realm header is rejected), while the writes (`saveMemoryItem` / `editMemoryItem` / `deleteMemoryItem`) carry no such restriction. `searchMemory` / `getMemoryGraph` also return `503 store_unavailable` while the store is still warming — retry rather than treating it as an empty result.
- **Todos** — `client.agent.todos.listTodos` / `createTodo` to file; then `triageTodos` (LLM inbox pass), `claimTodo` / `releaseTodo`, `runTodo` (dispatch a background orchestrator — returns `{job_id, session_id}`), `cancelTodoRun` to abort an in-flight run, and `approveTodoProposal` / `denyTodoProposal` to resolve a proposed run — approve is NOT inert: it spawns a background worker session equivalent to `runTodo` (a J-class autonomous run that spends model budget), while `denyTodoProposal` spawns nothing — plus `snoozeTodo` / `archiveTodo`. To advance a todo through its lifecycle (inbox→active→done) or edit its fields, `updateTodo` applies a CAS-guarded patch / `state` transition — read the todo's OWN `revision` with `getTodo` and pass it back (`getTodosRevision` is a store-wide change cursor, NOT the CAS token; a stale value → `409 todo_conflict`); a stale revision is rejected (409). `archiveTodo` is not terminal — `purgeTodos` permanently and irreversibly destroys all archived todos (no confirmation gate; treat as destructive). Mind the comment split: `postTodoComment` (`/messages`, plural) only appends a comment, whereas `messageTodo` (`/message`, singular) ALSO kicks an orchestrator turn — a budget-spending LLM run that returns `{job_id}` — so use the plural form for a plain note. Note `runTodo` / `triageTodos` / `approveTodoProposal` are J-class autonomous runs with NO confirmation gate on the RPC (reaching the RPC is itself treated as the human approval; that denial lives only on the model-facing `run_todo` *tool*), so calling them from automation silently dispatches a real LLM run — gate them in your own caller.
- **Workflows** — `listWorkflows` / `getWorkflow` / `putWorkflow` / `deleteWorkflow` / `hideWorkflow` manage saved definitions; `runSessionWorkflow` dispatches one onto a live session and returns a JOB, not a run (optionally seed the run with a `{ prompt }` body — input text fed to the workflow) — poll `client.agent.jobs.getJob` until its `run_id` populates (null during the brief dispatch window), then track via `listWorkflowRuns` / `getWorkflowRun` and stop with `cancelWorkflowRun`; feed a running workflow with `client.agent.sessions.postWorkflowMessage` (`{ text }`). Run events flow on the owning session's stream, not a per-run bus.
- **Agent profiles** — `client.agent.agents.listAgents` to enumerate named profiles; `createAgent` / `copyAgent` / `renameAgent` / `deleteAgent`; `getAgentSource` → edit → `putAgentSource` (pass `base_gen` from the read for conflict detection); `setAgentModel` / `setAgentTools` / `toggleAgentTool` / `setAgentTurns` / `resetAgentToShipped`. To make a session use a profile, `client.agent.sessions.setSessionAgent` (`{ agent }`) — that selects, it does NOT edit the profile. Two daemon guard rails: `deleteAgent` refuses a shipped-default profile or the configured default chat agent (`is_error:true` — use `resetAgentToShipped` or `putAgentSource` instead), and `resetAgentToShipped` refuses a profile that has no shipped default (`is_error:true`).

### 6. Fire-and-observe, recurring prompts, and re-attach

- **Fire-and-observe** — `client.agent.sessions.postSessionMessage` with `{ text }` dispatches a turn and returns `{ job_id }` immediately (HTTP 202) without streaming or blocking; watch completion via `agent_done` on `client.agent.sessions.streamSession`. Refuses with 409 `turn_in_flight` if a turn is running, or 409 `gate_parked` if a gate is open.
- **Observe / re-attach** — `client.agent.sessions.streamSession` attaches (WebSocket primary, SSE fallback) to a live session's full `event.*` stream; pass `since` (gateway int64 seq, or the `Last-Event-ID` header) to resume from the 1024-event replay ring after a disconnect (a gap past eviction yields `event: lagged {code:replay_gap}`). `client.agent.sessions.replaySession` returns the buffered event tail of a *live* session (with `min_seq`/`max_seq`) for a one-shot catch-up (only a *live* session has this ring; for a non-live session there is nothing to replay — attach via `streamSession` to receive the daemon's `event.replay` instead).
- **Recurring prompts (loops)** — `client.agent.loops.createLoop` with `{ prompt, interval }` (plus optional `max_runs` / `stop_when` / `max_cost_usd` / `max_wall_ms` caps) schedules a prompt to re-fire on a live session; `listLoops` / `updateLoop` (pause via `{ paused: true }`) / `deleteLoop` to manage, `runLoopNow` to fire one immediately. Loops are entirely session-scoped.

### 7. Headless one-shot run

`client.agent.headless.createHeadlessRun` for a non-interactive invocation that returns a job handle; poll `client.agent.jobs.getJob` and fetch the output with `client.agent.jobs.getJobResult`.

### 8. Configure MCP servers for a session

Reads first: `client.agent.mcp.listMCPServers` (`{ session_id }`) returns the EFFECTIVE merged `mcp_servers` config, the per-layer settings files behind it, and each server's LIVE runtime state (connected, negotiated protocol revision, tool count, pid, revocation reason, recent stderr). Every write is TWO steps: `client.agent.mcp.beginMCPWrite` (`{ session_id, op, scope }`, op ∈ `upsert`|`delete`|`set_enabled`|`import`, scope ∈ `user` (default)|`project`|`local`) mints a single-use nonce bound to {session, op, resolved settings path} and returns the target path plus the current `mcp_servers` hash — then present that `nonce` plus the hash as `expect_hash` on the matching `client.agent.mcp.upsertMCPServer` / `deleteMCPServer` / `setMCPServerEnabled` / `importMCPServers`. BOTH are required on every write: skipping step one fails closed, a nonce minted for a different op or scope fails closed, and `expect_hash` has no omit-it default — a first write into a settings file that does not exist yet states that expectation with the empty-array hash rather than leaving the field out. To adopt someone else's config, preview it with `client.agent.mcp.parseMCPImport` (`{ session_id, document }` — writes nothing, needs no nonce, strips credential values) and then `importMCPServers` with a fresh `op: "import"` nonce; imported servers land DISABLED, so enable each one with `setMCPServerEnabled`. After editing a settings file by hand, or to recover a server that died, `client.agent.mcp.reconnectMCP` (`{ session_id }`) re-reads the layers and reconciles every live session's pool — a healthy unchanged server is not restarted. `client.agent.mcp.probeMCPServer` trials a candidate config without saving it, but it is human-only (see Common errors).

## Quirks & gotchas

- The bare `hoody agent` verb is a **hand-written TUI launcher** (`cli/agent-command.ts`), distinct from this generated HTTP namespace; they coexist — the launcher opens the in-container Agent TUI, the namespace is the typed control surface.
- Source of truth is the `hoody-agent-d` gateway's own OpenAPI document, served at `GET /api/v1/agent/openapi.{json,yaml}`; every route lives under the single `/api/v1/agent` prefix. The kit URL is itself the credential; no HTTP bearer header is required.
- The proxy service slug is `agent` and the kit URL host carries the index segment (`-agent-{index}`); resolve it via `getKitUrl('agent', container)` rather than hand-building.
- `promptSync` blocks until the turn finishes (or returns `{pending_gate}` the moment a turn parks on a confirm/question) — long un-parked agent turns can still exceed default HTTP client timeouts; prefer streamed prompting for anything non-trivial so you can observe progress and resolve gates as they arrive. (SDK note: the generated `promptStream` accessor returns a WebSocket client that does NOT match the daemon's SSE wire format — use the supported `streamAgentPrompt` helper exported from the SDK, which POSTs `prompt:stream` and exposes `events` / `text` / `done` plus a cancel() method that aborts the turn.)For non-interactive turns where you cannot resolve gates by hand, enable the `auto_approve` gate policy on `promptStream` / `promptSync` to auto-approve confirm gates for the life of the turn (off by default) — HTTP: `?policy=auto_approve` (or the `X-Hoody-Gate-Policy: auto_approve` header); SDK: `policy: 'auto_approve'` in the prompt options; the generated CLI: `--policy auto_approve`. Note this only answers **confirm** gates, never questions. - Every prompt/gate/cancel call is **session-scoped** — you must hold a session id from `createSession` first; there is no implicit default session. Hook writes are session-scoped too (the guarded writes — `upsertHook` / `deleteHook` / `toggleHook` / `disableAllHooks` — plus `beginHookWrite`, and the side-effecting `testHook` / `ackHookTrust`, all require a live `session_id` — `ackHookTrust` clears the per-session hook-trust prompt (the execution-trust probe `listHooks` reports), the gate that must be acknowledged before any hook command is allowed to fire, mirroring `trustSkill` for skills; `reloadHooks` accepts one only to also return the reloaded summary) AND nonce-guarded: call `client.agent.hooks.beginHookWrite` (`{ session_id, op, scope }`, op ∈ upsert|delete|toggle|set_disabled) to mint a single-use nonce, then pass that `nonce` on the matching `upsertHook` / `deleteHook` / `toggleHook` / `disableAllHooks` — the nonce binds to that session+op+scope tuple and the write fails closed without it. Note hooks are an arbitrary-command surface: `upsertHook` persists a command that fires on lifecycle events and `testHook` executes one immediately. The human-only confirmation gate lives only on the model-facing tool path, not on these RPCs, and the gateway HTTP edge has no app-level admin gate — the same access that authorizes any agent-kit call authorizes these too, with nothing extra, so gating this surface is the caller's/proxy's responsibility.
- **Credential VALUES are never returned by the MCP surface.** `listMCPServers` reports `env_keys` / `header_keys` — key NAMES only — because a redacted value invites a client to write the placeholder back as the real secret; a write whose body carries the redaction placeholder for a credential is REFUSED rather than stored. To change a secret you must supply its real value; to leave one alone, omit the field — `upsertMCPServer` merges FIELD BY FIELD over the existing entry of the same name, so omitted fields keep their stored value (including fields this build does not model), and `setMCPServerEnabled` flips only the `enabled` flag so credentials and options survive a disable. Writes apply to live sessions before the response returns: a deleted, disabled, or re-pointed server is REVOKED in every live session first (a stdio child is reaped when its last holder releases), so a caller mid-turn cannot still reach it. Import is WHOLE-BATCH — one bad entry aborts everything — it understands the hoody (`mcp_servers` list), Claude/Cursor (`mcpServers` map) and VS Code (`servers` map) dialects, and REFUSES a document carrying more than one of them rather than guessing.

## Common errors

- A gate or question left unresolved stalls the turn — a streamed prompt that emitted an `event.confirm_request` (confirm gate) or `event.user_question` (question gate) will not complete until you answer it: `confirmGate` for a confirm, `answerQuestion` for a question. For unattended runs, arm `setSessionAutoReply` (a self-driving auto-user loop), or pass `policy: "auto_approve"` on the prompt — but `auto_approve` only auto-approves **confirm** gates, never questions; a parked question still stalls until `answerQuestion` (or the auto-reply loop) answers it.
- `tasks.listTasks` and `tasks.requestTaskTranscript` do NOT return data inline — they ask a *live* session to emit its background-subagent snapshot/transcript onto the session's WebSocket/SSE stream (`event.tasks_snapshot` for the snapshot, `event.task_transcript` for the transcript) and return only a JSON ack; you must already be attached via `streamSession` to receive the payload. `cancelTask` / `cancelAllTasks` stop background tasks mid-turn (server-layer; tasks survive `cancelSession` but are not restartable).
- `memory.consolidateMemory` (POST /memory/consolidate) is **human-only and ALWAYS fails over this namespace** — the gateway server-stamps a machine marker and the daemon's non-bypassable gate returns `403 human_only` for every HTTP/SDK/CLI call; it can only be triggered from an interactive human session. Do not call it programmatically.
- `mcp.probeMCPServer` (POST /mcp/probe) is **human-only and ALWAYS fails over this namespace** — probing STARTS A PROCESS (stdio) or makes an outbound request to a caller-chosen URL (http/sse), so a machine caller may not self-approve it and receives `403 human_only` on every HTTP/SDK/CLI call. The surface still exposes it for completeness, it simply always refuses. The deny list is still enforced on the candidate config before anything is started. Use `parseMCPImport` for a write-free preview instead; there is no programmatic substitute for the live trial.
- An MCP write needs BOTH a `nonce` and an `expect_hash` — neither is optional, and a stale hash is a CONFLICT rather than a silent overwrite. `upsertMCPServer` / `deleteMCPServer` / `setMCPServerEnabled` / `importMCPServers` each require a fresh single-use `nonce` from `beginMCPWrite` minted for that exact op and scope (one minted for a different op or scope fails closed) AND the `mcp_servers` hash you last read, from either `beginMCPWrite` or `listMCPServers`. A mismatch means someone else edited the layer since you read it — re-read, re-mint, retry; each nonce is good for exactly one write, so a retry always needs a new one. There is no "omit it for the first write" shortcut: writing into a settings file that does not exist yet means passing the empty-array hash.
- `deleteWorkflow` only removes **user** workflows — built-in/**system** workflows are refused (`is_error:true`) and re-seed on every boot; `hideWorkflow` is the only way to remove a system workflow from view.
- Empty values on agent-profile edits mean *inherit / unrestrict*, not *clear to nothing*: `setAgentModel` with `model: ""` removes the model line (falls back to the default model), and `setAgentTools` with `tools: []` removes the allow-list line, which means **all tools are allowed** (NOT zero). Pass a non-empty `tools` array to genuinely restrict.
- Prompting with no usable model/provider configured fails the turn — check `client.agent.models.listProviders` returns a ready provider before you prompt (blocking or streamed).
- Calling prompt/gate/cancel against a session whose live connection was torn down (`closeSession`, or `deleteSession` without `hard`) returns not-found — re-attach with `createSession({ attach: id })` if the record survives, or start fresh with `createSession`. After a *hard* `deleteSession` (the `hard` flag set) the record is gone and only a fresh `createSession` works.

## Related namespaces

`terminal`, `exec`, `files`, `notes`, `api`.

## Reference

**Accessor:** `client.agent`  |  **Import:** `import * as agent from 'hoody-sdk/agent'`

### `client.agent` (1) — General agent operations

#### `exportLogs` — Export logs as a downloadable file.

```typescript
client.agent.exportLogs(source?: string, min_level?: string, comp?: string, session_id?: string, text?: string, since?: string, until?: string, event?: string, tool?: string, model?: string, status?: string, method?: string, min_status?: integer, max_status?: integer, errors_only?: boolean, event_type?: string, resource_type?: string, container?: string, kind?: string, host?: string, since_seq?: integer, limit?: integer, format?: string, filename?: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source` | `string` | query | No | Log source to export (see logsSources; one local source, one platform source, or omitted for all local sources). |
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
| `min_status` | `integer` | query | No | Minimum HTTP status (activity source). |
| `max_status` | `integer` | query | No | Maximum HTTP status (activity source). |
| `errors_only` | `boolean` | query | No | Only error rows (activity source; true/false). |
| `event_type` | `string` | query | No | Event type filter (events source). |
| `resource_type` | `string` | query | No | Resource type filter (events source). |
| `container` | `string` | query | No | Container filter (proxy source; empty = all running realm containers). Maps to the daemon's container_id filter. |
| `kind` | `string` | query | No | Proxy row kind: request\|response\|event (proxy source). |
| `host` | `string` | query | No | Proxy URL host filter (exact or dot-aligned suffix). |
| `since_seq` | `integer` | query | No | Exclusive lower seq bound for incremental exports (local sources). |
| `limit` | `integer` | query | No | TOTAL row cap across the export (default: everything the snapshot matches; platform default 2000). |
| `format` | `string` | query | No | Export format: jsonl (default) or txt. |
| `filename` | `string` | query | No | Download filename override (reduced to a safe basename). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/logs/export`

---

### `client.agent.agents` (14) — Chat-agent definitions and per-agent settings

#### `copyAgent` — Copy a chat agent.

```typescript
client.agent.agents.copyAgent(name: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ new_name*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/agents/{name}/copy`
**CLI:** `hoody agent agents copy`

---

#### `createAgent` — Create a chat-agent definition.

```typescript
client.agent.agents.createAgent(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ name*: string, frontmatter: object, system_prompt: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/agents`
**CLI:** `hoody agent agents create`

---

#### `deleteAgent` — Delete a custom chat agent.

```typescript
client.agent.agents.deleteAgent(name: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/agent/agents/{name}`
**CLI:** `hoody agent agents delete`

---

#### `getAgentSource` — Read a chat agent's source.

```typescript
client.agent.agents.getAgentSource(name: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/agents/{name}/source`
**CLI:** `hoody agent agents get-source`

---

#### `listAgents` — List chat-agent definitions.

```typescript
client.agent.agents.listAgents(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/agents`
**CLI:** `hoody agent agents list`

---

#### `listAgentsAll` — List chat-agent definitions. (collect all pages)

```typescript
client.agent.agents.listAgentsAll(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/agent/agents`
**CLI:** `hoody agent agents list`

---

#### `listAgentsIterator` — List chat-agent definitions. (async iterator)

```typescript
client.agent.agents.listAgentsIterator(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/agent/agents`
**CLI:** `hoody agent agents list`

---

#### `putAgentSource` — Write a chat agent's source.

```typescript
client.agent.agents.putAgentSource(name: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ content*: string, base_gen: int }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/agent/agents/{name}/source`
**CLI:** `hoody agent agents put-source`

---

#### `renameAgent` — Rename a chat agent.

```typescript
client.agent.agents.renameAgent(name: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ new_name*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/agents/{name}/rename`
**CLI:** `hoody agent agents rename`

---

#### `resetAgentToShipped` — Reset an agent to its shipped default.

```typescript
client.agent.agents.resetAgentToShipped(name: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/agents/{name}/reset-to-shipped`
**CLI:** `hoody agent agents reset-to-shipped`

---

#### `setAgentModel` — Set an agent's model.

```typescript
client.agent.agents.setAgentModel(name: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ model: string }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/agent/agents/{name}/model`
**CLI:** `hoody agent agents set-model`

---

#### `setAgentTools` — Set an agent's tool allow-list.

```typescript
client.agent.agents.setAgentTools(name: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ tools: any[] }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/agent/agents/{name}/tools`
**CLI:** `hoody agent agents set-tools`

---

#### `setAgentTurns` — Set an agent's max-turns.

```typescript
client.agent.agents.setAgentTurns(name: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ turns: int }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/agent/agents/{name}/turns`
**CLI:** `hoody agent agents set-turns`

---

#### `toggleAgentTool` — Toggle a single tool for an agent.

```typescript
client.agent.agents.toggleAgentTool(name: string, tool: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Path identifier. |
| `tool` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/agents/{name}/tools/{tool}/toggle`
**CLI:** `hoody agent agents toggle-tool`

---

### `client.agent.discovery` (6) — API discovery and related-operation hints

#### `listContainers` — List containers in a realm (for binding).

```typescript
client.agent.discovery.listContainers(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/containers`
**CLI:** `hoody agent discovery list-containers`

---

#### `listContainersAll` — List containers in a realm (for binding). (collect all pages)

```typescript
client.agent.discovery.listContainersAll(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/agent/containers`
**CLI:** `hoody agent discovery list-containers`

---

#### `listContainersIterator` — List containers in a realm (for binding). (async iterator)

```typescript
client.agent.discovery.listContainersIterator(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/agent/containers`
**CLI:** `hoody agent discovery list-containers`

---

#### `listRealms` — List realms (for binding).

```typescript
client.agent.discovery.listRealms(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/realms`
**CLI:** `hoody agent discovery list-realms`

---

#### `listRealmsAll` — List realms (for binding). (collect all pages)

```typescript
client.agent.discovery.listRealmsAll(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/agent/realms`
**CLI:** `hoody agent discovery list-realms`

---

#### `listRealmsIterator` — List realms (for binding). (async iterator)

```typescript
client.agent.discovery.listRealmsIterator(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/agent/realms`
**CLI:** `hoody agent discovery list-realms`

---

### `client.agent.github` (12) — GitHub auth, repos, clone, status, commit, sync, PRs

#### `githubAuthStatus` — GitHub auth status.

```typescript
client.agent.github.githubAuthStatus(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/github/auth/status`
**CLI:** `hoody agent github auth-status`

---

#### `githubBranches` — List GitHub branches.

```typescript
client.agent.github.githubBranches(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/github/branches`
**CLI:** `hoody agent github branches`

---

#### `githubClone` — Clone a GitHub repository.

```typescript
client.agent.github.githubClone(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ repo: string, dir: string, full_name: string, clone_url: string, shallow: bool }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/github/clone`
**CLI:** `hoody agent github clone`

---

#### `githubCommit` — Stage all and commit.

```typescript
client.agent.github.githubCommit(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ message*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/github/commit`
**CLI:** `hoody agent github commit`

---

#### `githubLogin` — Start a GitHub device-flow login (or add a PAT).

```typescript
client.agent.github.githubLogin(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ token: string, host: string, activate: bool }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/github/auth/login`
**CLI:** `hoody agent github login`

---

#### `githubLoginPoll` — Poll a GitHub device-flow login to completion.

```typescript
client.agent.github.githubLoginPoll(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ host: string, device_code*: string, interval: int, expires_in: int }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/github/auth/login/poll`
**CLI:** `hoody agent github login-poll`

---

#### `githubLogout` — Remove a linked GitHub account.

```typescript
client.agent.github.githubLogout(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ key*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/github/auth/logout`

---

#### `githubPullRequest` — Open a pull request.

```typescript
client.agent.github.githubPullRequest(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ title*: string, body: string, base: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/github/pr`
**CLI:** `hoody agent github pull-request`

---

#### `githubRepos` — List GitHub repos.

```typescript
client.agent.github.githubRepos(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/github/repos`
**CLI:** `hoody agent github repos`

---

#### `githubSetActiveAccount` — Switch the active GitHub account.

```typescript
client.agent.github.githubSetActiveAccount(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ key*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/github/auth/active`

---

#### `githubStatus` — GitHub working-tree status.

```typescript
client.agent.github.githubStatus(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/github/status`
**CLI:** `hoody agent github status`

---

#### `githubSync` — Sync (fetch → pull → push).

```typescript
client.agent.github.githubSync(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ direction: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/github/sync`
**CLI:** `hoody agent github sync`

---

### `client.agent.headless` (1) — One-shot headless agent runs

#### `createHeadlessRun` — Create a headless one-shot run.

```typescript
client.agent.headless.createHeadlessRun(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ prompt*: string, workflow: string, model: string, format: string, stream: bool, timeout_ms: int }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/headless/runs`
**CLI:** `hoody agent headless create-run`

---

### `client.agent.hoody` (1) — Hoody operations

#### `bootstrapHoodyToken` — Bootstrap the Hoody platform credential (install-if-absent).

```typescript
client.agent.hoody.bootstrapHoodyToken(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ token*: string, capability: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/hoody/auth/bootstrap`

---

### `client.agent.hooks` (9) — Lifecycle hook configuration

#### `ackHookTrust` — Acknowledge hook trust.

```typescript
client.agent.hooks.ackHookTrust(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/hooks/trust/ack`
**CLI:** `hoody agent hooks ack-trust`

---

#### `beginHookWrite` — Begin a hook write (nonce).

```typescript
client.agent.hooks.beginHookWrite(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ session_id*: string, op*: string, scope*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/hooks/begin-write`
**CLI:** `hoody agent hooks begin-write`

---

#### `deleteHook` — Delete a hook.

```typescript
client.agent.hooks.deleteHook(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: string }`

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/agent/hooks`
**CLI:** `hoody agent hooks delete`

---

#### `disableAllHooks` — Disable all hooks.

```typescript
client.agent.hooks.disableAllHooks(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/hooks/disable-all`
**CLI:** `hoody agent hooks disable-all`

---

#### `listHooks` — List hooks.

```typescript
client.agent.hooks.listHooks(session_id?: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `session_id` | `string` | query | No | Live session id (hooks are session-scoped; required by the daemon RPC). Query alias of the body session_id (the body value wins). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ session_id: string }`

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/hooks`
**CLI:** `hoody agent hooks list`

---

#### `reloadHooks` — Reload hooks from disk.

```typescript
client.agent.hooks.reloadHooks(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/hooks/reload`
**CLI:** `hoody agent hooks reload`

---

#### `testHook` — Test-fire a hook.

```typescript
client.agent.hooks.testHook(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/hooks/test`
**CLI:** `hoody agent hooks test`

---

#### `toggleHook` — Toggle a hook.

```typescript
client.agent.hooks.toggleHook(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/hooks/toggle`
**CLI:** `hoody agent hooks toggle`

---

#### `upsertHook` — Upsert a hook.

```typescript
client.agent.hooks.upsertHook(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: string, event: string, matcher: string, command: string, timeout: int, name: string, description: string }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/agent/hooks`
**CLI:** `hoody agent hooks upsert`

---

### `client.agent.jobs` (3) — Async job lifecycle (observe / result / cancel)

#### `deleteJob` — Cancel a pending/running job, or delete a finished record.

```typescript
client.agent.jobs.deleteJob(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/agent/jobs/{id}`
**CLI:** `hoody agent jobs delete`

---

#### `getJob` — Get an async job's status.

```typescript
client.agent.jobs.getJob(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/jobs/{id}`
**CLI:** `hoody agent jobs get`

---

#### `getJobResult` — Get an async job's result.

```typescript
client.agent.jobs.getJobResult(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/jobs/{id}/result`
**CLI:** `hoody agent jobs get-result`

---

### `client.agent.logs` (5) — Structured log query and read

#### `logsSources` — Log sources.

```typescript
client.agent.logs.logsSources(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/logs/sources`
**CLI:** `hoody agent logs logs-sources`

---

#### `logsStats` — Log statistics.

```typescript
client.agent.logs.logsStats(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/logs/stats`
**CLI:** `hoody agent logs logs-stats`

---

#### `queryLogs` — Query logs.

```typescript
client.agent.logs.queryLogs(source?: string, level?: string, host?: string, since?: string, until?: string, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source` | `string` | query | No | Filter to a log source/facet (see logsSources). |
| `level` | `string` | query | No | Filter to a minimum log level. |
| `host` | `string` | query | No | Filter to a host. |
| `since` | `string` | query | No | Lower time/cursor bound (since_seq cursor passes through verbatim). |
| `until` | `string` | query | No | Upper time bound. |
| `limit` | `integer` | query | No | Caps the result set (daemon default 200). A non-numeric value is rejected 400. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/logs`
**CLI:** `hoody agent logs query-logs`

---

#### `readLogEntry` — Read a log entry.

```typescript
client.agent.logs.readLogEntry(ref: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `ref` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/logs/entries/{ref}`
**CLI:** `hoody agent logs read-log-entry`

---

#### `streamLogs` — Stream the log tail (SSE).

```typescript
client.agent.logs.streamLogs(source?: string, level?: string, host?: string, since_seq?: integer, limit?: integer, Last-Event-ID?: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source` | `string` | query | No | Filter the tail to a log source/facet. |
| `level` | `string` | query | No | Filter to a minimum log level. |
| `host` | `string` | query | No | Filter to a host. |
| `since_seq` | `integer` | query | No | Initial resume cursor (the Last-Event-ID header overrides it). A non-numeric value is rejected 400. |
| `limit` | `integer` | query | No | Caps each poll batch. A non-numeric value is rejected 400. |
| `Last-Event-ID` | `string` | header | No | SSE resume cursor — the gateway int64 seq to resume from; OVERRIDES the ?since_seq query param. Sent automatically by an SSE client on reconnect. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/logs/stream`
**CLI:** `hoody agent logs stream-logs`

---

### `client.agent.loops` (7) — Recurring self-paced agent loops

#### `createLoop` — Create a loop.

```typescript
client.agent.loops.createLoop(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ prompt*: string, interval: string, max_runs: int, stop_when: string, max_cost_usd: number, max_wall_ms: int }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/loops`
**CLI:** `hoody agent loops create`

---

#### `deleteLoop` — Delete a loop.

```typescript
client.agent.loops.deleteLoop(id: string, loopId: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `loopId` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/agent/sessions/{id}/loops/{loopId}`
**CLI:** `hoody agent loops delete`

---

#### `listLoops` — List a session's loops.

```typescript
client.agent.loops.listLoops(id: string, page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/loops`
**CLI:** `hoody agent loops list`

---

#### `listLoopsAll` — List a session's loops. (collect all pages)

```typescript
client.agent.loops.listLoopsAll(id: string, page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/loops`
**CLI:** `hoody agent loops list`

---

#### `listLoopsIterator` — List a session's loops. (async iterator)

```typescript
client.agent.loops.listLoopsIterator(id: string, page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/loops`
**CLI:** `hoody agent loops list`

---

#### `runLoopNow` — Run a loop immediately.

```typescript
client.agent.loops.runLoopNow(id: string, loopId: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `loopId` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/loops/{loopId}/run-now`
**CLI:** `hoody agent loops run-now`

---

#### `updateLoop` — Update a loop.

```typescript
client.agent.loops.updateLoop(id: string, loopId: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `loopId` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ paused: bool, expires_in: string, max_cost_usd: number, max_wall_ms: int }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/loops/{loopId}`
**CLI:** `hoody agent loops update`

---

### `client.agent.mcp` (9) — Mcp operations

#### `beginMCPWrite` — Begin an MCP config write.

```typescript
client.agent.mcp.beginMCPWrite(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ session_id*: string, op*: "upsert" | "delete" | "set_enabled" | "import", scope: "user" | "project" | "local" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/mcp/write-intents`
**CLI:** `hoody agent mcp begin-write`

---

#### `deleteMCPServer` — Delete an MCP server.

```typescript
client.agent.mcp.deleteMCPServer(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", name*: string, expect_hash*: string }`

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/agent/mcp/servers`
**CLI:** `hoody agent mcp delete`

---

#### `importMCPServers` — Import MCP servers from another tool's config.

```typescript
client.agent.mcp.importMCPServers(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", document: string, servers: any[], replace: bool, expect_hash*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/mcp/import`
**CLI:** `hoody agent mcp import`

---

#### `listMCPServers` — List configured MCP servers.

```typescript
client.agent.mcp.listMCPServers(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/mcp/servers`
**CLI:** `hoody agent mcp list`

---

#### `parseMCPImport` — Preview an MCP config import.

```typescript
client.agent.mcp.parseMCPImport(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ session_id*: string, document*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/mcp/parse`
**CLI:** `hoody agent mcp parse`

---

#### `probeMCPServer` — Probe an MCP server without saving it.

```typescript
client.agent.mcp.probeMCPServer(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ session_id*: string, server*: object }`

**Returns:** `void`  |  **HTTP:** `POST /api/v1/agent/mcp/probe`
**CLI:** `hoody agent mcp probe`

---

#### `reconnectMCP` — Reload MCP config and reconnect.

```typescript
client.agent.mcp.reconnectMCP(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ session_id*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/mcp/reconnect`
**CLI:** `hoody agent mcp reconnect`

---

#### `setMCPServerEnabled` — Enable or disable an MCP server.

```typescript
client.agent.mcp.setMCPServerEnabled(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", name*: string, enabled*: bool, expect_hash*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/mcp/servers/enable`
**CLI:** `hoody agent mcp set-enabled`

---

#### `upsertMCPServer` — Create or update an MCP server.

```typescript
client.agent.mcp.upsertMCPServer(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", expect_hash*: string, server*: object }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/agent/mcp/servers`
**CLI:** `hoody agent mcp upsert`

---

### `client.agent.memory` (15) — Long-term memory records (admin browse / CRUD)

#### `consolidateMemory` — Trigger a memory consolidation pass (human-only).

```typescript
client.agent.memory.consolidateMemory(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ project*: string, min_observations: int }`

**Returns:** `void`  |  **HTTP:** `POST /api/v1/agent/memory/consolidate`
**CLI:** `hoody agent memory consolidate`

---

#### `deleteMemoryItem` — Delete a memory item.

```typescript
client.agent.memory.deleteMemoryItem(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ id*: string, project: string, kind: string }`

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/agent/memory/items`
**CLI:** `hoody agent memory delete-item`

---

#### `editMemoryItem` — Edit a memory item.

```typescript
client.agent.memory.editMemoryItem(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ project: string, kind: string, content: string }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/agent/memory/items/{id}`
**CLI:** `hoody agent memory edit-item`

---

#### `flushMemory` — Flush the memory store.

```typescript
client.agent.memory.flushMemory(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/memory/flush`
**CLI:** `hoody agent memory flush`

---

#### `getMemoryGraph` — Read a project's memory relation graph.

```typescript
client.agent.memory.getMemoryGraph(project?: string, node_type?: string, limit?: integer, offset?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `project` | `string` | query | No | Project key whose graph to read. |
| `node_type` | `string` | query | No | Optional node-type filter. |
| `limit` | `integer` | query | No | Maximum nodes/edges to return. |
| `offset` | `integer` | query | No | Pagination offset into the graph. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/memory/graph`
**CLI:** `hoody agent memory get-graph`

---

#### `getMemoryItem` — Read a memory item.

```typescript
client.agent.memory.getMemoryItem(id: string, project?: string, kind?: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `project` | `string` | query | No | Project key the memory belongs to. |
| `kind` | `string` | query | No | Memory kind/store the record lives in. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/memory/items/{id}`
**CLI:** `hoody agent memory get-item`

---

#### `listMemoryItems` — List memory items.

```typescript
client.agent.memory.listMemoryItems(project?: string, kind?: string, type?: string, query?: string, page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `project` | `string` | query | No | Project key to scope the listing to. |
| `kind` | `string` | query | No | Memory kind/store to filter by. |
| `type` | `string` | query | No | Memory type to filter by (e.g. workflow, fact). kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `query` | `string` | query | No | Free-text filter over the records. kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `page` | `integer` | query | No | 1-based page number. |
| `limit` | `integer` | query | No | Items per page (1..200). 0 or omitted pages at the 200 ceiling; a value over 200 is clamped to 200. The effective page size is echoed in meta.limit. NOT "no pagination" — the daemon never returns an unbounded set. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/memory/items`
**CLI:** `hoody agent memory list-items`

---

#### `listMemoryItemsAll` — List memory items. (collect all pages)

```typescript
client.agent.memory.listMemoryItemsAll(project?: string, kind?: string, type?: string, query?: string, page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `project` | `string` | query | No | Project key to scope the listing to. |
| `kind` | `string` | query | No | Memory kind/store to filter by. |
| `type` | `string` | query | No | Memory type to filter by (e.g. workflow, fact). kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `query` | `string` | query | No | Free-text filter over the records. kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `page` | `integer` | query | No | 1-based page number. |
| `limit` | `integer` | query | No | Items per page (1..200). 0 or omitted pages at the 200 ceiling; a value over 200 is clamped to 200. The effective page size is echoed in meta.limit. NOT "no pagination" — the daemon never returns an unbounded set. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/agent/memory/items`
**CLI:** `hoody agent memory list-items`

---

#### `listMemoryItemsIterator` — List memory items. (async iterator)

```typescript
client.agent.memory.listMemoryItemsIterator(project?: string, kind?: string, type?: string, query?: string, page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `project` | `string` | query | No | Project key to scope the listing to. |
| `kind` | `string` | query | No | Memory kind/store to filter by. |
| `type` | `string` | query | No | Memory type to filter by (e.g. workflow, fact). kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `query` | `string` | query | No | Free-text filter over the records. kind=memory ONLY — rejected 400 with a lesson/slot/observation kind. |
| `page` | `integer` | query | No | 1-based page number. |
| `limit` | `integer` | query | No | Items per page (1..200). 0 or omitted pages at the 200 ceiling; a value over 200 is clamped to 200. The effective page size is echoed in meta.limit. NOT "no pagination" — the daemon never returns an unbounded set. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/agent/memory/items`
**CLI:** `hoody agent memory list-items`

---

#### `listMemoryProjects` — List memory projects.

```typescript
client.agent.memory.listMemoryProjects(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/memory/projects`
**CLI:** `hoody agent memory list-projects`

---

#### `listMemoryProjectsAll` — List memory projects. (collect all pages)

```typescript
client.agent.memory.listMemoryProjectsAll(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/agent/memory/projects`
**CLI:** `hoody agent memory list-projects`

---

#### `listMemoryProjectsIterator` — List memory projects. (async iterator)

```typescript
client.agent.memory.listMemoryProjectsIterator(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/agent/memory/projects`
**CLI:** `hoody agent memory list-projects`

---

#### `saveMemoryItem` — Save a memory item.

```typescript
client.agent.memory.saveMemoryItem(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ project*: string, content*: string, type: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/memory/items`
**CLI:** `hoody agent memory save-item`

---

#### `searchMemory` — Search memory (hybrid recall).

```typescript
client.agent.memory.searchMemory(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ project: string, query: string, limit: int, kinds: any[], skip_graph: bool }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/memory/search`
**CLI:** `hoody agent memory search`

---

#### `setMemoryEnabled` — Toggle memory capture.

```typescript
client.agent.memory.setMemoryEnabled(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ enabled: bool }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/agent/memory/enabled`
**CLI:** `hoody agent memory set-enabled`

---

### `client.agent.models` (22) — Catalogued models and fusion composites

#### `addProviderAccount` — Add an OAuth account to a provider's pool.

```typescript
client.agent.models.addProviderAccount(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/providers/{id}/auth/accounts`
**CLI:** `hoody agent models add-provider-account`

---

#### `deleteProviderAPIKey` — Delete a provider API key.

```typescript
client.agent.models.deleteProviderAPIKey(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/agent/providers/{id}/auth/api-key`
**CLI:** `hoody agent models delete-provider-api-key`

---

#### `getModel` — Get a model by spec.

```typescript
client.agent.models.getModel(spec: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `spec` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/models/{spec}`
**CLI:** `hoody agent models get`

---

#### `getProvider` — Get a provider.

```typescript
client.agent.models.getProvider(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/providers/{id}`
**CLI:** `hoody agent models get-provider`

---

#### `getProviderAuth` — Get a provider's auth status.

```typescript
client.agent.models.getProviderAuth(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/providers/{id}/auth`
**CLI:** `hoody agent models get-provider-auth`

---

#### `listModels` — List models.

```typescript
client.agent.models.listModels(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/models`
**CLI:** `hoody agent models list`

---

#### `listModelsAll` — List models. (collect all pages)

```typescript
client.agent.models.listModelsAll(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/agent/models`
**CLI:** `hoody agent models list`

---

#### `listModelsIterator` — List models. (async iterator)

```typescript
client.agent.models.listModelsIterator(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/agent/models`
**CLI:** `hoody agent models list`

---

#### `listProviderAccounts` — List a provider's OAuth account pool.

```typescript
client.agent.models.listProviderAccounts(id: string, page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/providers/{id}/auth/accounts`
**CLI:** `hoody agent models list-provider-accounts`

---

#### `listProviderAccountsAll` — List a provider's OAuth account pool. (collect all pages)

```typescript
client.agent.models.listProviderAccountsAll(id: string, page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/agent/providers/{id}/auth/accounts`
**CLI:** `hoody agent models list-provider-accounts`

---

#### `listProviderAccountsIterator` — List a provider's OAuth account pool. (async iterator)

```typescript
client.agent.models.listProviderAccountsIterator(id: string, page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/agent/providers/{id}/auth/accounts`
**CLI:** `hoody agent models list-provider-accounts`

---

#### `listProviders` — List LLM providers.

```typescript
client.agent.models.listProviders(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/providers`
**CLI:** `hoody agent models list-providers`

---

#### `listProvidersAll` — List LLM providers. (collect all pages)

```typescript
client.agent.models.listProvidersAll(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/agent/providers`
**CLI:** `hoody agent models list-providers`

---

#### `listProvidersIterator` — List LLM providers. (async iterator)

```typescript
client.agent.models.listProvidersIterator(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/agent/providers`
**CLI:** `hoody agent models list-providers`

---

#### `logoutProviderOAuth` — Remove a provider's OAuth login.

```typescript
client.agent.models.logoutProviderOAuth(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/agent/providers/{id}/auth/oauth`
**CLI:** `hoody agent models logout-provider-o-auth`

---

#### `pollProviderOAuth` — Poll a provider OAuth login.

```typescript
client.agent.models.pollProviderOAuth(id: string, job: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `job` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/providers/{id}/auth/oauth/{job}`
**CLI:** `hoody agent models poll-provider-o-auth`

---

#### `removeProviderAccount` — Remove a pooled OAuth account.

```typescript
client.agent.models.removeProviderAccount(id: string, key: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `key` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/agent/providers/{id}/auth/accounts/{key}`
**CLI:** `hoody agent models remove-provider-account`

---

#### `setProviderAPIKey` — Store a provider API key.

```typescript
client.agent.models.setProviderAPIKey(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ api_key*: string }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/agent/providers/{id}/auth/api-key`
**CLI:** `hoody agent models set-provider-api-key`

---

#### `setProviderAccountActive` — Make a pooled OAuth account active.

```typescript
client.agent.models.setProviderAccountActive(id: string, key: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `key` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/agent/providers/{id}/auth/accounts/{key}/active`
**CLI:** `hoody agent models set-provider-account-active`

---

#### `setProviderDefault` — Set a provider's default credential method.

```typescript
client.agent.models.setProviderDefault(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ default*: string }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/agent/providers/{id}/auth/default`
**CLI:** `hoody agent models set-provider-default`

---

#### `startProviderOAuth` — Start a provider OAuth login.

```typescript
client.agent.models.startProviderOAuth(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ add_account: bool }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/providers/{id}/auth/oauth`
**CLI:** `hoody agent models start-provider-o-auth`

---

#### `submitProviderOAuthCode` — Submit a provider OAuth authorization code.

```typescript
client.agent.models.submitProviderOAuthCode(id: string, job: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `job` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ code*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/providers/{id}/auth/oauth/{job}/code`
**CLI:** `hoody agent models submit-provider-o-auth-code`

---

### `client.agent.sessions` (27) — Create, drive, and tear down agent sessions

#### `answerAssist` — Propose answers for a parked question (helper model).

```typescript
client.agent.sessions.answerAssist(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ mode: string, model: string, gen: int }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/answer:assist`
**CLI:** `hoody agent sessions answer-assist`

---

#### `answerQuestion` — Answer a parked question gate.

```typescript
client.agent.sessions.answerQuestion(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ gate_id: string, generation: int, answer: string, text: string, answers: object }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/answer`
**CLI:** `hoody agent sessions answer-question`

---

#### `cancelSession` — Cancel the active turn (Esc).

```typescript
client.agent.sessions.cancelSession(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/cancel`
**CLI:** `hoody agent sessions cancel`

---

#### `closeSession` — Close the session (teardown).

```typescript
client.agent.sessions.closeSession(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/close`
**CLI:** `hoody agent sessions close`

---

#### `confirmGate` — Answer a parked confirm gate.

```typescript
client.agent.sessions.confirmGate(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ gate_id: string, generation: int, approved: bool, persist_dirs: bool }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/confirm`
**CLI:** `hoody agent sessions confirm-gate`

---

#### `createSession` — Create, fork, or attach a session.

```typescript
client.agent.sessions.createSession(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ realm: string, container: string, cwd: string, config_dir: string, model: string, agent: string, tool_mode: string, dir_scope: string, attach: string, fork: string, fork_turn_idx: int, backend: string, delegated_agent: string, headless: bool }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/sessions`
**CLI:** `hoody agent sessions create`

---

#### `deleteSession` — Close (and optionally hard-delete) a session.

```typescript
client.agent.sessions.deleteSession(id: string, hard?: boolean, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `hard` | `boolean` | query | No | When true, also remove the persisted session record (not just the live connection). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/agent/sessions/{id}`
**CLI:** `hoody agent sessions delete`

---

#### `getSession` — Get a session summary.

```typescript
client.agent.sessions.getSession(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}`
**CLI:** `hoody agent sessions get`

---

#### `getSessionTranscript` — Read a session's transcript without attaching.

```typescript
client.agent.sessions.getSessionTranscript(id: string, after_turn?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `after_turn` | `integer` | query | No | Exclusive completed-turn skip cursor: return content strictly after completed turn N (0 = full transcript; values past the end clamp; negative/non-integer = 400). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/transcript`

---

#### `listSessionCwds` — List distinct session working directories.

```typescript
client.agent.sessions.listSessionCwds(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/sessions/cwds`
**CLI:** `hoody agent sessions list-cwds`

---

#### `listSessions` — List sessions.

```typescript
client.agent.sessions.listSessions(include_system?: boolean, page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_system` | `boolean` | query | No | When true, also include daemon-owned system/resident sessions in the listing. |
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/sessions`
**CLI:** `hoody agent sessions list`

---

#### `listSessionsAll` — List sessions. (collect all pages)

```typescript
client.agent.sessions.listSessionsAll(include_system?: boolean, page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_system` | `boolean` | query | No | When true, also include daemon-owned system/resident sessions in the listing. |
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/agent/sessions`
**CLI:** `hoody agent sessions list`

---

#### `listSessionsIterator` — List sessions. (async iterator)

```typescript
client.agent.sessions.listSessionsIterator(include_system?: boolean, page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_system` | `boolean` | query | No | When true, also include daemon-owned system/resident sessions in the listing. |
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/agent/sessions`
**CLI:** `hoody agent sessions list`

---

#### `postSessionMessage` — Dispatch a turn (fire-and-observe).

```typescript
client.agent.sessions.postSessionMessage(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ text: string, tool_mode: string, dir_scope: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/messages`
**CLI:** `hoody agent sessions post-message`

---

#### `postWorkflowMessage` — Send a message to a running workflow.

```typescript
client.agent.sessions.postWorkflowMessage(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ text: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/workflow/messages`
**CLI:** `hoody agent sessions post-workflow-message`

---

#### `promptStream` — Dispatch a turn and stream the response.

```typescript
client.agent.sessions.promptStream(id: string, policy?: string, X-Hoody-Gate-Policy?: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `policy` | `string` | query | No | auto_approve auto-answers confirm gates for the life of the stream (alias of the X-Hoody-Gate-Policy header); off by default. |
| `X-Hoody-Gate-Policy` | `string` | header | No | Confirm-gate posture: "auto_approve" adopts the headless auto-answer posture (off by default; the in:query alias is ?policy=). Any other value is rejected 400. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ text: string, tool_mode: string, dir_scope: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/prompt:stream`
**CLI:** `hoody agent sessions prompt-stream`

---

#### `promptSync` — Dispatch a turn and block to completion.

```typescript
client.agent.sessions.promptSync(id: string, policy?: string, X-Hoody-Gate-Policy?: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `policy` | `string` | query | No | auto_approve adopts the headless auto-answer posture (alias of the X-Hoody-Gate-Policy header); off by default. |
| `X-Hoody-Gate-Policy` | `string` | header | No | Confirm-gate posture: "auto_approve" adopts the headless auto-answer posture (off by default; the in:query alias is ?policy=). Any other value is rejected 400. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ text: string, tool_mode: string, dir_scope: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/prompt:sync`
**CLI:** `hoody agent sessions prompt-sync`

---

#### `replaySession` — Replay a live session's buffered events.

```typescript
client.agent.sessions.replaySession(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/replay`
**CLI:** `hoody agent sessions replay`

---

#### `setSessionAgent` — Switch the chat agent.

```typescript
client.agent.sessions.setSessionAgent(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ agent: string }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/agent`
**CLI:** `hoody agent sessions set-chat-agent`

---

#### `setSessionAutoReply` — Arm/disarm the auto-reply loop.

```typescript
client.agent.sessions.setSessionAutoReply(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ armed: bool, rounds: int, model: string, allow_writes: bool }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/auto-reply`
**CLI:** `hoody agent sessions set-auto-reply`

---

#### `setSessionAutoReplyWrites` — Flip the auto-reply write opt-in.

```typescript
client.agent.sessions.setSessionAutoReplyWrites(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ allow_writes: bool }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/auto-reply/writes`
**CLI:** `hoody agent sessions set-auto-reply-writes`

---

#### `setSessionEffort` — Set reasoning effort.

```typescript
client.agent.sessions.setSessionEffort(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ effort: string }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/effort`
**CLI:** `hoody agent sessions set-effort`

---

#### `setSessionHoodyEnv` — Toggle Hoody shell-env injection.

```typescript
client.agent.sessions.setSessionHoodyEnv(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ enabled: bool }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/hoody-env`
**CLI:** `hoody agent sessions set-hoody-env`

---

#### `setSessionModel` — Switch the session model.

```typescript
client.agent.sessions.setSessionModel(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ model*: string }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/model`
**CLI:** `hoody agent sessions set-model`

---

#### `setSessionVerbosity` — Set response verbosity.

```typescript
client.agent.sessions.setSessionVerbosity(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ level: string }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/agent/sessions/{id}/verbosity`
**CLI:** `hoody agent sessions set-verbosity`

---

#### `streamSession` — Attach to a session's event stream (WebSocket / SSE).

```typescript
client.agent.sessions.streamSession(id: string, since?: integer, Last-Event-ID?: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `since` | `integer` | query | No | Resume from this gateway int64 seq (also accepted as the Last-Event-ID header). |
| `Last-Event-ID` | `string` | header | No | SSE resume cursor — the gateway int64 seq to resume from (the in:header alias of ?since); sent automatically by an SSE client on reconnect. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/stream`
**CLI:** `hoody agent sessions stream`

---

#### `trimSession` — Trim session history to a turn index.

```typescript
client.agent.sessions.trimSession(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ turn_idx: int }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/trim`
**CLI:** `hoody agent sessions trim`

---

### `client.agent.settings` (11) — Process-wide settings (home settings.json)

#### `deleteFusion` — Delete a fusion composite.

```typescript
client.agent.settings.deleteFusion(slug: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `slug` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/agent/settings/fusion/{slug}`
**CLI:** `hoody agent settings delete-fusion`

---

#### `getACPStatus` — Get BYOA ACP backend status.

```typescript
client.agent.settings.getACPStatus(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/acp/agents`
**CLI:** `hoody agent settings get-acp-status`

---

#### `getSettings` — Get settings.

```typescript
client.agent.settings.getSettings(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/settings`
**CLI:** `hoody agent settings get`

---

#### `listFusion` — List fusion composites.

```typescript
client.agent.settings.listFusion(include_invalid?: boolean, page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_invalid` | `boolean` | query | No | When true, also return composites that failed validation as a top-level `invalid` array beside `items` (each with a reason + raw-file index) so a broken composite is editable/deletable. |
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/settings/fusion`
**CLI:** `hoody agent settings list-fusion`

---

#### `listFusionAll` — List fusion composites. (collect all pages)

```typescript
client.agent.settings.listFusionAll(include_invalid?: boolean, page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_invalid` | `boolean` | query | No | When true, also return composites that failed validation as a top-level `invalid` array beside `items` (each with a reason + raw-file index) so a broken composite is editable/deletable. |
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/agent/settings/fusion`
**CLI:** `hoody agent settings list-fusion`

---

#### `listFusionIterator` — List fusion composites. (async iterator)

```typescript
client.agent.settings.listFusionIterator(include_invalid?: boolean, page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_invalid` | `boolean` | query | No | When true, also return composites that failed validation as a top-level `invalid` array beside `items` (each with a reason + raw-file index) so a broken composite is editable/deletable. |
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/agent/settings/fusion`
**CLI:** `hoody agent settings list-fusion`

---

#### `patchSettings` — Patch settings.

```typescript
client.agent.settings.patchSettings(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ patch*: object }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/agent/settings`
**CLI:** `hoody agent settings patch`

---

#### `setACPAgentModel` — Set a BYOA backend's default model and effort.

```typescript
client.agent.settings.setACPAgentModel(agent: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `agent` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ model: string, effort: string }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/agent/acp/agents/{agent}/model`

---

#### `setACPEnabled` — Enable or disable a BYOA ACP backend.

```typescript
client.agent.settings.setACPEnabled(agent: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `agent` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ enabled: bool }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/agent/acp/agents/{agent}/enabled`

---

#### `setACPSecret` — Store an ACP per-agent secret value.

```typescript
client.agent.settings.setACPSecret(agent: string, key: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `agent` | `string` | path | Yes | Path identifier. |
| `key` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ value: string }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/agent/acp/agents/{agent}/secrets/{key}`
**CLI:** `hoody agent settings set-acp-secret`

---

#### `upsertFusion` — Create or update a fusion composite.

```typescript
client.agent.settings.upsertFusion(slug: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `slug` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ spec*: object }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/agent/settings/fusion/{slug}`
**CLI:** `hoody agent settings upsert-fusion`

---

### `client.agent.skills` (17) — Reusable agent skill definitions

#### `applySkillImport` — Apply a skill import.

```typescript
client.agent.skills.applySkillImport(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/skills/import/apply`
**CLI:** `hoody agent skills apply-import`

---

#### `clearSkillHubCache` — Clear the skill hub cache.

```typescript
client.agent.skills.clearSkillHubCache(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/agent/skills/hub/cache`
**CLI:** `hoody agent skills clear-hub-cache`

---

#### `createSkill` — Create a skill.

```typescript
client.agent.skills.createSkill(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ name*: string, description: string, content: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/skills`
**CLI:** `hoody agent skills create`

---

#### `deleteSkill` — Delete a skill.

```typescript
client.agent.skills.deleteSkill(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ root_dir*: string, rel_dir*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/skills/delete`
**CLI:** `hoody agent skills delete`

---

#### `getSkillHubCache` — Skill hub cache stats.

```typescript
client.agent.skills.getSkillHubCache(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/skills/hub/cache`
**CLI:** `hoody agent skills get-hub-cache`

---

#### `getSkillSource` — Read a skill's source.

```typescript
client.agent.skills.getSkillSource(root_dir?: string, rel_dir?: string, root?: string, rel?: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `root_dir` | `string` | query | No | Skill root directory (identity; alias: root). |
| `rel_dir` | `string` | query | No | Skill relative directory (identity; alias: rel). |
| `root` | `string` | query | No | Friendly alias of root_dir (translated to root_dir server-side). |
| `rel` | `string` | query | No | Friendly alias of rel_dir (translated to rel_dir server-side). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/skills/source`
**CLI:** `hoody agent skills get-source`

---

#### `installSkillHub` — Install a hub skill.

```typescript
client.agent.skills.installSkillHub(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ id*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/skills/hub/install`
**CLI:** `hoody agent skills install-hub`

---

#### `listSkills` — List skills.

```typescript
client.agent.skills.listSkills(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/skills`
**CLI:** `hoody agent skills list`

---

#### `listSkillsAll` — List skills. (collect all pages)

```typescript
client.agent.skills.listSkillsAll(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/agent/skills`
**CLI:** `hoody agent skills list`

---

#### `listSkillsIterator` — List skills. (async iterator)

```typescript
client.agent.skills.listSkillsIterator(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/agent/skills`
**CLI:** `hoody agent skills list`

---

#### `previewSkillHub` — Preview a hub skill.

```typescript
client.agent.skills.previewSkillHub(id?: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | query | No | Hub skill identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/skills/hub/preview`
**CLI:** `hoody agent skills preview-hub`

---

#### `putSkillSource` — Write a skill's source.

```typescript
client.agent.skills.putSkillSource(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ root_dir*: string, rel_dir*: string, content*: string, base_gen: int }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/agent/skills/source`
**CLI:** `hoody agent skills put-source`

---

#### `renameSkill` — Rename a skill.

```typescript
client.agent.skills.renameSkill(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ root_dir*: string, rel_dir*: string, new_name*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/skills/rename`
**CLI:** `hoody agent skills rename`

---

#### `scanSkillImport` — Scan for importable skills.

```typescript
client.agent.skills.scanSkillImport(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/skills/import/scan`
**CLI:** `hoody agent skills scan-import`

---

#### `searchSkillHub` — Search the skill hub.

```typescript
client.agent.skills.searchSkillHub(q?: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `q` | `string` | query | No | Search query. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/skills/hub/search`
**CLI:** `hoody agent skills search-hub`

---

#### `toggleSkill` — Enable/disable a skill.

```typescript
client.agent.skills.toggleSkill(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ name*: string, disabled: bool }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/skills/toggle`
**CLI:** `hoody agent skills toggle`

---

#### `trustSkill` — Set a skill's trust state.

```typescript
client.agent.skills.trustSkill(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ root_dir*: string, rel_dir*: string, trusted*: bool }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/skills/trust`
**CLI:** `hoody agent skills trust`

---

### `client.agent.statistics` (3) — Per-session and aggregate usage counters

#### `getStatistics` — Cross-session statistics.

```typescript
client.agent.statistics.getStatistics(scope?: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `scope` | `string` | query | No | cwd (default) rolls up the current working directory; all rolls up every session. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/statistics`
**CLI:** `hoody agent statistics get`

---

#### `usageByAccount` — Usage rollup by account.

```typescript
client.agent.statistics.usageByAccount(since?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `since` | `integer` | query | No | Unix-seconds lower bound; omit for all-time. A negative/non-numeric value is rejected 400. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/usage/by-account`
**CLI:** `hoody agent statistics usage-by-account`

---

#### `usageByModel` — Usage rollup by model.

```typescript
client.agent.statistics.usageByModel(since?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `since` | `integer` | query | No | Unix-seconds lower bound; omit for all-time. A negative/non-numeric value is rejected 400. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/usage/by-model`
**CLI:** `hoody agent statistics usage-by-model`

---

### `client.agent.system` (5) — Health, metrics, and operational endpoints

#### `docs` — API documentation UI.

```typescript
client.agent.system.docs()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/docs`
**CLI:** `hoody agent system docs`

---

#### `healthCheck` — Standardized health check.

```typescript
client.agent.system.healthCheck()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/health`
**CLI:** `hoody agent system health-check`

---

#### `metrics` — Prometheus metrics.

```typescript
client.agent.system.metrics()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/metrics`
**CLI:** `hoody agent system metrics`

---

#### `openapiJSON` — OpenAPI spec (JSON).

```typescript
client.agent.system.openapiJSON()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/openapi.json`
**CLI:** `hoody agent system openapi-json`

---

#### `openapiYAML` — OpenAPI spec (YAML).

```typescript
client.agent.system.openapiYAML()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/openapi.yaml`
**CLI:** `hoody agent system openapi-yaml`

---

### `client.agent.tasks` (4) — Background task management

#### `cancelAllTasks` — Cancel all background tasks.

```typescript
client.agent.tasks.cancelAllTasks(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/tasks/cancel`
**CLI:** `hoody agent tasks cancel-all`

---

#### `cancelTask` — Cancel a background task.

```typescript
client.agent.tasks.cancelTask(id: string, tid: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `tid` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/tasks/{tid}/cancel`
**CLI:** `hoody agent tasks cancel`

---

#### `listTasks` — Request the session's task snapshot.

```typescript
client.agent.tasks.listTasks(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tasks`
**CLI:** `hoody agent tasks list`

---

#### `requestTaskTranscript` — Request a task's transcript (upsert-poll).

```typescript
client.agent.tasks.requestTaskTranscript(id: string, tid: string, after_seq?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `tid` | `string` | path | Yes | Path identifier. |
| `after_seq` | `integer` | query | No | int64 upsert-poll cursor; entries at/below it are re-sent (default 0). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tasks/{tid}/transcript`
**CLI:** `hoody agent tasks request-transcript`

---

### `client.agent.todos` (19) — Container-aware task list management

#### `approveTodoProposal` — Approve a todo proposal.

```typescript
client.agent.todos.approveTodoProposal(id: string, pid: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `pid` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/proposals/{pid}/approve`
**CLI:** `hoody agent todos approve-proposal`

---

#### `archiveTodo` — Archive a todo.

```typescript
client.agent.todos.archiveTodo(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ revision*: int }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/archive`
**CLI:** `hoody agent todos archive`

---

#### `cancelTodoRun` — Cancel a todo's run.

```typescript
client.agent.todos.cancelTodoRun(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/cancel-run`
**CLI:** `hoody agent todos cancel-run`

---

#### `claimTodo` — Claim a todo.

```typescript
client.agent.todos.claimTodo(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ revision: int }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/claim`
**CLI:** `hoody agent todos claim`

---

#### `createTodo` — File a todo.

```typescript
client.agent.todos.createTodo(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ title*: string, body: string, priority: int, tags: any[], cwd: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/todos`
**CLI:** `hoody agent todos create`

---

#### `denyTodoProposal` — Deny a todo proposal.

```typescript
client.agent.todos.denyTodoProposal(id: string, pid: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `pid` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/proposals/{pid}/deny`
**CLI:** `hoody agent todos deny-proposal`

---

#### `getTodo` — Read a todo.

```typescript
client.agent.todos.getTodo(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/todos/{id}`
**CLI:** `hoody agent todos get`

---

#### `getTodosRevision` — Get the todos store revision.

```typescript
client.agent.todos.getTodosRevision(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/todos/revision`
**CLI:** `hoody agent todos get-revision`

---

#### `listTodos` — List todos.

```typescript
client.agent.todos.listTodos(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ states: any[], tags: any[], query: string, open_only: bool, all: bool }`

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/todos`
**CLI:** `hoody agent todos list`

---

#### `listTodosAll` — List todos. (collect all pages)

```typescript
client.agent.todos.listTodosAll(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ states: any[], tags: any[], query: string, open_only: bool, all: bool }`

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/agent/todos`
**CLI:** `hoody agent todos list`

---

#### `listTodosIterator` — List todos. (async iterator)

```typescript
client.agent.todos.listTodosIterator(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ states: any[], tags: any[], query: string, open_only: bool, all: bool }`

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/agent/todos`
**CLI:** `hoody agent todos list`

---

#### `messageTodo` — Comment + run an orchestrator turn.

```typescript
client.agent.todos.messageTodo(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ text*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/message`
**CLI:** `hoody agent todos message`

---

#### `postTodoComment` — Comment on a todo.

```typescript
client.agent.todos.postTodoComment(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ text*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/messages`
**CLI:** `hoody agent todos post-comment`

---

#### `purgeTodos` — Purge archived todos.

```typescript
client.agent.todos.purgeTodos(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/todos/purge`
**CLI:** `hoody agent todos purge`

---

#### `releaseTodo` — Release a todo.

```typescript
client.agent.todos.releaseTodo(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/release`
**CLI:** `hoody agent todos release`

---

#### `runTodo` — Run a todo's orchestrator.

```typescript
client.agent.todos.runTodo(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/run`
**CLI:** `hoody agent todos run`

---

#### `snoozeTodo` — Snooze a todo.

```typescript
client.agent.todos.snoozeTodo(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ wake_at*: string, revision*: int }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/todos/{id}/snooze`
**CLI:** `hoody agent todos snooze`

---

#### `triageTodos` — Run an LLM triage pass.

```typescript
client.agent.todos.triageTodos(X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/todos/triage`
**CLI:** `hoody agent todos triage`

---

#### `updateTodo` — Update a todo (CAS).

```typescript
client.agent.todos.updateTodo(id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ revision*: int, title: string, body: string, state: string, priority: int, rank: int, tags: any[], cwd: string }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/agent/todos/{id}`
**CLI:** `hoody agent todos update`

---

### `client.agent.tools` (17) — Tool catalogue and gated tool execution

#### `getTool` — Get one tool schema.

```typescript
client.agent.tools.getTool(name: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/tools/{name}`
**CLI:** `hoody agent tools get`

---

#### `listReadOnlyTools` — List the read-only tool subset.

```typescript
client.agent.tools.listReadOnlyTools(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/tools/read-only`
**CLI:** `hoody agent tools list-read-only`

---

#### `listReadOnlyToolsAll` — List the read-only tool subset. (collect all pages)

```typescript
client.agent.tools.listReadOnlyToolsAll(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/agent/tools/read-only`
**CLI:** `hoody agent tools list-read-only`

---

#### `listReadOnlyToolsIterator` — List the read-only tool subset. (async iterator)

```typescript
client.agent.tools.listReadOnlyToolsIterator(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/agent/tools/read-only`
**CLI:** `hoody agent tools list-read-only`

---

#### `listSessionMCPTools` — List a session's MCP tools.

```typescript
client.agent.tools.listSessionMCPTools(id: string, page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tools/mcp`
**CLI:** `hoody agent tools list-session-mcp`

---

#### `listSessionMCPToolsAll` — List a session's MCP tools. (collect all pages)

```typescript
client.agent.tools.listSessionMCPToolsAll(id: string, page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tools/mcp`
**CLI:** `hoody agent tools list-session-mcp`

---

#### `listSessionMCPToolsIterator` — List a session's MCP tools. (async iterator)

```typescript
client.agent.tools.listSessionMCPToolsIterator(id: string, page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tools/mcp`
**CLI:** `hoody agent tools list-session-mcp`

---

#### `listSessionTools` — List a session's effective tool set.

```typescript
client.agent.tools.listSessionTools(id: string, page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tools`
**CLI:** `hoody agent tools list-session`

---

#### `listSessionToolsAll` — List a session's effective tool set. (collect all pages)

```typescript
client.agent.tools.listSessionToolsAll(id: string, page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tools`
**CLI:** `hoody agent tools list-session`

---

#### `listSessionToolsIterator` — List a session's effective tool set. (async iterator)

```typescript
client.agent.tools.listSessionToolsIterator(id: string, page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tools`
**CLI:** `hoody agent tools list-session`

---

#### `listTools` — List the tool catalogue.

```typescript
client.agent.tools.listTools(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/tools`
**CLI:** `hoody agent tools list`

---

#### `listToolsAll` — List the tool catalogue. (collect all pages)

```typescript
client.agent.tools.listToolsAll(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/agent/tools`
**CLI:** `hoody agent tools list`

---

#### `listToolsIterator` — List the tool catalogue. (async iterator)

```typescript
client.agent.tools.listToolsIterator(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/agent/tools`
**CLI:** `hoody agent tools list`

---

#### `runSessionTool` — Run a tool inside a live session (gated).

```typescript
client.agent.tools.runSessionTool(id: string, name: string, confirm?: boolean, confirm_token?: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `name` | `string` | path | Yes | Path identifier. |
| `confirm` | `boolean` | query | No | Query alias of the body `confirm` field — re-issue a previously-parked confirmation (pair with confirm_token). |
| `confirm_token` | `string` | query | No | Query alias of the body `confirm_token` field — the single-use token returned in the 409 tool_needs_confirmation details. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/tools/{name}/run`
**CLI:** `hoody agent tools run-session`

---

#### `runTool` — Run a tool (sessionless, gated).

```typescript
client.agent.tools.runTool(name: string, confirm?: boolean, confirm_token?: string, X-Hoody-Tool-Mode?: string, X-Hoody-Dir-Scope?: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Path identifier. |
| `confirm` | `boolean` | query | No | Query alias of the body `confirm` field — re-issue a previously-parked confirmation (pair with confirm_token). |
| `confirm_token` | `string` | query | No | Query alias of the body `confirm_token` field — the single-use token returned in the 409 tool_needs_confirmation details. |
| `X-Hoody-Tool-Mode` | `string` | header | No | Sessionless tool-mode for the ephemeral session (e.g. read_only / full); default per the daemon. Ignored on the in-session run (it inherits the session's frozen tool-mode). |
| `X-Hoody-Dir-Scope` | `string` | header | No | Sessionless directory-access scope for the ephemeral session (e.g. home / full); default home. Ignored on the in-session run (it inherits the session's frozen dir-scope). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/tools/{name}/run`
**CLI:** `hoody agent tools run`

---

#### `runToolAsync` — Run a tool asynchronously (sessionless, gated).

```typescript
client.agent.tools.runToolAsync(name: string, confirm?: boolean, confirm_token?: string, X-Hoody-Tool-Mode?: string, X-Hoody-Dir-Scope?: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Path identifier. |
| `confirm` | `boolean` | query | No | Query alias of the body `confirm` field — re-issue a previously-parked confirmation (pair with confirm_token). |
| `confirm_token` | `string` | query | No | Query alias of the body `confirm_token` field — the single-use token returned in the 409 tool_needs_confirmation details. |
| `X-Hoody-Tool-Mode` | `string` | header | No | Sessionless tool-mode for the ephemeral session (e.g. read_only / full); default per the daemon. Ignored on the in-session run (it inherits the session's frozen tool-mode). |
| `X-Hoody-Dir-Scope` | `string` | header | No | Sessionless directory-access scope for the ephemeral session (e.g. home / full); default home. Ignored on the in-session run (it inherits the session's frozen dir-scope). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/tools/{name}/runAsync`
**CLI:** `hoody agent tools run-async`

---

#### `streamTool` — Run a tool with a streamed result (sessionless, gated).

```typescript
client.agent.tools.streamTool(name: string, confirm?: boolean, confirm_token?: string, X-Hoody-Tool-Mode?: string, X-Hoody-Dir-Scope?: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Path identifier. |
| `confirm` | `boolean` | query | No | Query alias of the body `confirm` field — re-issue a previously-parked confirmation (pair with confirm_token). |
| `confirm_token` | `string` | query | No | Query alias of the body `confirm_token` field — the single-use token returned in the 409 tool_needs_confirmation details. |
| `X-Hoody-Tool-Mode` | `string` | header | No | Sessionless tool-mode for the ephemeral session (e.g. read_only / full); default per the daemon. Ignored on the in-session run (it inherits the session's frozen tool-mode). |
| `X-Hoody-Dir-Scope` | `string` | header | No | Sessionless directory-access scope for the ephemeral session (e.g. home / full); default home. Ignored on the in-session run (it inherits the session's frozen dir-scope). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/tools/{name}/stream`
**CLI:** `hoody agent tools stream`

---

### `client.agent.workflows` (14) — Multi-step workflow definitions and runs

#### `cancelWorkflowRun` — Cancel a workflow run.

```typescript
client.agent.workflows.cancelWorkflowRun(run_id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `run_id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/workflows/runs/{run_id}/cancel`
**CLI:** `hoody agent workflows cancel-run`

---

#### `deleteWorkflow` — Delete a workflow definition.

```typescript
client.agent.workflows.deleteWorkflow(name: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/agent/workflows/{name}`
**CLI:** `hoody agent workflows delete`

---

#### `getWorkflow` — Read one workflow definition.

```typescript
client.agent.workflows.getWorkflow(name: string, include_revision?: boolean, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Path identifier. |
| `include_revision` | `boolean` | query | No | If "true", the tool output's first line is `revision: <opaque>` — pass that value as putWorkflow's expected_revision to guard against concurrent edits; the JSON below it is unchanged. Strictly parsed: exactly one value, "true" or "false"; anything else (empty, "TRUE", "1", repeated) is a 400 bad_request. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/workflows/{name}`
**CLI:** `hoody agent workflows get`

---

#### `getWorkflowRun` — Get one workflow run by id.

```typescript
client.agent.workflows.getWorkflowRun(run_id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `run_id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/workflows/runs/{run_id}`
**CLI:** `hoody agent workflows get-run`

---

#### `hideWorkflow` — Hide or un-hide a workflow.

```typescript
client.agent.workflows.hideWorkflow(name: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ hidden: bool }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/workflows/{name}/hide`
**CLI:** `hoody agent workflows hide`

---

#### `listWorkflowRuns` — Snapshot in-flight and recent workflow runs.

```typescript
client.agent.workflows.listWorkflowRuns(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/workflows/runs`
**CLI:** `hoody agent workflows list-runs`

---

#### `listWorkflowRunsAll` — Snapshot in-flight and recent workflow runs. (collect all pages)

```typescript
client.agent.workflows.listWorkflowRunsAll(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/agent/workflows/runs`
**CLI:** `hoody agent workflows list-runs`

---

#### `listWorkflowRunsIterator` — Snapshot in-flight and recent workflow runs. (async iterator)

```typescript
client.agent.workflows.listWorkflowRunsIterator(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/agent/workflows/runs`
**CLI:** `hoody agent workflows list-runs`

---

#### `listWorkflows` — List workflow definitions.

```typescript
client.agent.workflows.listWorkflows(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/agent/workflows`
**CLI:** `hoody agent workflows list`

---

#### `listWorkflowsAll` — List workflow definitions. (collect all pages)

```typescript
client.agent.workflows.listWorkflowsAll(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/agent/workflows`
**CLI:** `hoody agent workflows list`

---

#### `listWorkflowsIterator` — List workflow definitions. (async iterator)

```typescript
client.agent.workflows.listWorkflowsIterator(page?: integer, limit?: integer, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number for pagination. |
| `limit` | `integer` | query | No | Maximum items per page (0 = no pagination). |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/agent/workflows`
**CLI:** `hoody agent workflows list`

---

#### `putWorkflow` — Create or replace a workflow definition.

```typescript
client.agent.workflows.putWorkflow(name: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ definition*: object, expected_revision: string, expected_absent: bool }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/agent/workflows/{name}`
**CLI:** `hoody agent workflows put`

---

#### `resumeWorkflowRun` — Resume a failed or cancelled workflow run.

```typescript
client.agent.workflows.resumeWorkflowRun(run_id: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `run_id` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | Yes |  |

**Body:** `{ session_id*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/workflows/runs/{run_id}/resume`

---

#### `runSessionWorkflow` — Run a workflow onto an existing session.

```typescript
client.agent.workflows.runSessionWorkflow(id: string, name: string, X-Hoody-Cwd?: string, X-Hoody-Config-Dir?: string, X-Hoody-Container?: string, X-Hoody-Realm?: string, realm?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Path identifier. |
| `name` | `string` | path | Yes | Path identifier. |
| `X-Hoody-Cwd` | `string` | header | No | Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd). |
| `X-Hoody-Config-Dir` | `string` | header | No | Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths). |
| `X-Hoody-Container` | `string` | header | No | Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension. |
| `X-Hoody-Realm` | `string` | header | No | Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `realm` | `string` | query | No | Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes. |
| `data` | `object` | body | No |  |

**Body:** `{ prompt: string, inputs: object }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/workflows/{name}/runs`
**CLI:** `hoody agent workflows run-session`

