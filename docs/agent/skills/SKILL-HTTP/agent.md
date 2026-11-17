> _**HTTP skill · `agent` namespace** · ~76,119 tokens · hoody-sdk v1.0.1_

# `agent` — In-computer AI coding agent over HTTP

## Purpose

The `agent` kit exposes the in-computer AI agent as a typed namespace: create a chat session, send a prompt, stream the turn (tool calls, gates, output), then confirm/answer/cancel as the agent works. services — `sessions` (with `sessions.turns`), `bots`, `definitions`, `models`, `providers`, `skills` (with `skills.hub`), `memory`, `github`, `workflows`, `tools`, `hooks`, `mcp`, `settings`, `loops`, `logs` (with `GET /api/v1/agent/logs/export`), `jobs`, `gates`, `changes`, `headless`, `todos`, `usage` (usage statistics), plus the namespace's own calls (`whoami`, the `login` token bootstrap, `pause` and `resume`). Session tasks live under `sessions.tasks`.

## When to use

- **Drive the agent programmatically** — create a session, prompt it, and consume the turn: `POST /api/v1/agent/sessions` → stream the turn for live tool/gate/output events (per surface — see the streaming note under Quirks), or `POST /api/v1/agent/sessions/{id}/prompt:sync` for one blocking call → resolve gates with `POST /api/v1/agent/sessions/{id}/confirm` with `{"approved":true}` / `POST /api/v1/agent/sessions/{id}/confirm` with `{"approved":false}` / `POST /api/v1/agent/sessions/{id}/answer` → `POST /api/v1/agent/sessions/{id}/cancel` to interrupt.
- **Inspect or configure the agent** — list `models` (`GET /api/v1/agent/models` / `GET /api/v1/agent/models/{spec}`; the Jev decision-model catalogue is the separate `GET /api/v1/agent/jev/models`) and `GET /api/v1/agent/providers` (configure providers via `PUT /api/v1/agent/providers/{id}/auth/default` / `PUT /api/v1/agent/providers/{id}/auth/api-key` / `POST /api/v1/agent/providers/{id}/auth/oauth`); switch a session's active model with `PATCH /api/v1/agent/sessions/{id}/model`, browse/install `skills`, read/edit `memory`, manage `workflows`, `hooks`, `definitions` (named agent profiles), and `tools` — both the sessionless catalogue/registry (`GET /api/v1/agent/tools` / `GET /api/v1/agent/tools/read-only` / `GET /api/v1/agent/tools/{name}`, and `POST /api/v1/agent/tools/{name}/run` (blocks, returns the result; `POST /api/v1/agent/tools/{name}/stream` returns the one-shot result over SSE frames instead, not a per-token stream) / `POST /api/v1/agent/tools/{name}/runAsync` (returns `{ job_id }`, poll `jobs`) to invoke a tool with no session — read-only by default, a mutating tool needs `allow_mutations: true` or a confirmed re-issue) and the per-session surface (`GET /api/v1/agent/sessions/{id}/tools` for a session's *effective* tool set, `GET /api/v1/agent/sessions/{id}/tools/mcp`, and `POST /api/v1/agent/sessions/{id}/tools/{name}/run`). Unlike the sessionless `POST /api/v1/agent/tools/{name}/run`, a per-session run executes against the session's *frozen* realm/computer/cwd/tool-mode and claims the session's single serial turn slot — so it returns 409 `turn_in_flight` while a turn is running, 409 `gate_parked` while a gate is open, and 404 `tool_not_found` if the tool is not in that session's effective list; whether a mutating tool may run is decided by the live session's own tool mode and confirmation settings (the `allow_mutations` escape hatch is sessionless-only).
- **One-shot non-interactive runs** — `POST /api/v1/agent/headless/runs` runs the full agent loop once over a throwaway session (see workflow 7 for the per-surface form: an async job or an SSE stream).
- **GitHub from inside the agent** — first establish an account with `POST /api/v1/agent/github/auth/login` (a GitHub device flow → poll `POST /api/v1/agent/github/auth/login/poll`) or `POST /api/v1/agent/github/auth/login` with `{ token }` (a PAT, persisted directly), then `GET /api/v1/agent/github/auth/status` to confirm; once an account is active, `POST /api/v1/agent/github/clone` / `POST /api/v1/agent/github/commit` (and `GET /api/v1/agent/github/status` / `GET /api/v1/agent/github/branches` / `GET /api/v1/agent/github/repos` / `POST /api/v1/agent/github/pr` / `POST /api/v1/agent/github/sync`) for repo operations the agent performs in-computer.

## When NOT to use

- Want an interactive UI, not the API? The agent's own TUI opens at its `agent-1` URL or a terminal link with `agent=true`; in a terminal, `hoody hub` opens the Hub. This namespace is the HTTP control surface beside them.
- Raw shell / command exec → `terminal` (PTY) or `exec` (one-shot). File I/O → `files`. The agent runs these as tools internally; call them directly when you don't need the LLM.
- Account-level resources (computers, billing, realms) → `api`.

## Prerequisites

- Computer with the `agent` kit running; capability URL.
- At least one usable model provider before prompting: one with a stored API key, a stored OAuth login, or passwordless access (the shipped default agent is pinned to a passwordless model). `GET /api/v1/agent/providers` and `GET /api/v1/agent/models` list the CATALOGUE, which is populated whether or not anything is configured; `GET /api/v1/agent/providers/{id}/auth` reports whether a provider is actually usable (`ready`, with `api_key_stored`, `oauth_stored` and `no_auth_ready` behind it).
- A session id from `POST /api/v1/agent/sessions` for every prompt/gate/cancel call.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Prompt a session and stream the turn

`POST /api/v1/agent/sessions` (returns a session id) → stream the turn with `{ text }` to receive live events (tool calls, gates, output deltas) — see the streaming note under Quirks for the supported per-surface method (SDK helper / HTTP SSE route / CLI command) → resolve any gate as it arrives → turn ends.

### 2. One-shot synchronous prompt

`POST /api/v1/agent/sessions` → `POST /api/v1/agent/sessions/{id}/prompt:sync` with `{ text }` — waits for the turn to end, a gate that needs a person, or the server deadline (290 seconds by default). A clean turn returns `{status:"done", session_id, turn_id}` with no reply text; check `status`, because a failed, cancelled or quit turn answers `error` (with the error `event`), `canceled` or `quit`. A turn that parks on a gate returns `{pending_gate, turn_id}`. When the deadline passes first the answer is `503 service_unavailable` with `details.turn_id` and `details.turn_running: true`: the turn is NOT cancelled, so follow it with `GET /api/v1/agent/sessions/{id}/turns/{turn_id}` (or the stream) instead of prompting again. Read the reply with `GET /api/v1/agent/sessions/{id}/transcript`. Best for short, non-interactive prompts where you don't need streamed events.

### 3. Resolve gates mid-turn

While a prompt streams, the agent may pause for human input: a confirmation gate → `POST /api/v1/agent/sessions/{id}/confirm` with `{"approved":true}` / `POST /api/v1/agent/sessions/{id}/confirm` with `{"approved":false}`; an open question → `POST /api/v1/agent/sessions/{id}/answer` (to get a helper model to DRAFT an answer for a parked question call `POST /api/v1/agent/sessions/{id}/answer:assist` — it does NOT answer the gate and needs a parked lead question gate (otherwise `409 no_pending_gate`; a helper's gate does not count): it dispatches an async job (HTTP 202) whose suggestion arrives via `GET /api/v1/agent/jobs/{id}/result` and an `event.question_suggestion` on the session stream — only one assist may be in flight per session — and the real answer still goes through `POST /api/v1/agent/sessions/{id}/answer`; for unattended runs arm `PATCH /api/v1/agent/sessions/{id}/auto-reply` (a self-driving auto-user loop that answers questions only during its own rounds, so arming it does not resolve a question an ordinary prompt already parked: answer that with `POST /api/v1/agent/sessions/{id}/answer`; it also withholds write-class actions unless you opt in with `allow_writes: true`, either on the arm call or later via `PATCH /api/v1/agent/sessions/{id}/auto-reply/writes` with `{"allow_writes":true}`)). The gate identity to echo is the ENVELOPE-level `gate {id, generation, type}` that the stream frame parking the gate carries beside `seq` / `incarnation` / `event`. The `event.confirm_request` payload also has a numeric `gate_id`, but that is the daemon's id space and is never the value to echo. The answer body for a question gate: the envelope's gate id as `gate_id` (optionally its `generation`), then **answer** (or **text**, used when **answer** is blank) for a single question; for a batch (`event.user_question` carrying `questions[]`), `answers` maps each `questions[].id` to its answer text, for example `{"gate_id":"<gate.id>","answers":{"<questions[].id>":"yes"}}`. A body with no `answer`, no `text` and no `answers` is `400 bad_request` and the question stays parked. The `question_id` on `event.user_question` is a diagnostic number, not a body field. Echoing a wrong/stale `gate_id`/`generation`, or answering when nothing is parked, returns 409 (`no_pending_gate` / `stale_gate` / `gate_already_answered` / `gate_type_mismatch`). A retry of a question answer that names the gate just resolved with the same answer (a lost 200) gets `200` with `replayed: true` and the original acknowledgement, while another answer to that gate is `409 gate_already_answered`. For `POST /api/v1/agent/sessions/{id}/confirm` with `{"approved":true}` / `POST /api/v1/agent/sessions/{id}/confirm` with `{"approved":false}`, a decision naming a gate that already ended is `409 gate_already_resolved` (with its recorded outcome), and one naming a gate whose decision is still being applied is `409 gate_decision_pending`: retry naming the gate to learn the outcome. On a session whose approval policy is `always` and whose approver lease was ever minted (`POST /api/v1/agent/sessions/{id}/approver-lease`, or the lease handed back by a create or attach that asserted `always`), EVERY decision — `POST /api/v1/agent/sessions/{id}/confirm` with `{"approved":true}` / `POST /api/v1/agent/sessions/{id}/confirm` with `{"approved":false}`, and the confirmed re-issue of a gated `POST /api/v1/agent/sessions/{id}/tools/{name}/run` — must carry the current lease capability in the `X-Hoody-Approver-Lease` request header. Without it the decision is refused `409 approver_lease_required`, a capability that does not verify is `409 approver_lease_invalid`, and an expired one is `approver_lease_expired` until a holder acquires again. Interrupt a running turn with `POST /api/v1/agent/sessions/{id}/cancel`. Tear the session down: `POST /api/v1/agent/sessions/{id}/close` removes it from the live map; `DELETE /api/v1/agent/sessions/{id}` drops the live connection but keeps the persisted record (re-attach with `POST /api/v1/agent/sessions` with `{ "attach": "<id>" }`), while a *hard* delete also erases the persisted record: `DELETE /api/v1/agent/sessions/{id}?hard=true`. To roll a session back without tearing it down, `POST /api/v1/agent/sessions/{id}/trim` with `{ turn_idx }` truncates conversation history to (and including) that turn index.

### 4. Pick a model / provider

`GET /api/v1/agent/providers` to list the catalogued providers (and `GET /api/v1/agent/providers/{id}/auth` to check that one is `ready`: a stored credential or passwordless access), `GET /api/v1/agent/models` to list the catalogued models, then `PATCH /api/v1/agent/sessions/{id}/model` to bind a model to a session before prompting — SYNCHRONOUS: the response reports the actual outcome ({status:'ok', model, persisted} on success; structured 409/422 errors while busy or for an unconstructable spec). For a native session, the default `scope: "agent"` switches the session and TRIES to rewrite the `model:` line of the chat agent's highest-precedence on-disk file (project before home; an embedded-only agent in a scoped realm gets a new copy in that realm's profile layer). That pin applies to later sessions resolving that file: it is per profile layer, not global. That save is best-effort, so only `persisted: true` confirms the repin — `persisted: false` means the session switched but future sessions keep the old pin. With `scope: "session"`, the switch affects only this session and leaves the agent file alone; `persisted` then says whether the session record was saved. A Claude Code (delegated) session's switch is always session-scoped, takes a Claude alias or model id, and applies from its next turn; it does not rewrite an agent file. PRECEDENCE: the agent's frontmatter `model` is the DEFAULT for a session that does not request one; an explicit model on create (`POST /api/v1/agent/sessions` with `{ "model": "..." }`), or this live `PATCH /api/v1/agent/sessions/{id}/model`, OVERRIDES that pin for the session — create is session-scoped and does not rewrite the agent, for a native session, this live switch repins the agent file it resolves with the default scope (see above). The shipped default agent ships pinned, so its pin is the out-of-the-box default until an explicit model is chosen (an explicit model together with `attach` is rejected 400, because a resumed session keeps its model; with `backend: "acp"` the model is the Claude Code model: a Claude alias such as `opus`, `sonnet` or `haiku`, or a Claude model id. Any other model is `422 model_unavailable` with `details.reason: not_claude`). Each session has further per-session knobs (all session-scoped PATCHes; while a gate is parked, `PATCH /api/v1/agent/sessions/{id}/effort` and `PATCH /api/v1/agent/sessions/{id}/agent` answer 200 with `deferred: true`, and the change is dropped, not queued: send it again once the turn has ended): `PATCH /api/v1/agent/sessions/{id}/effort` (`{ effort }` — `low|medium|high|xhigh|max`, or `""` for the model default), `PATCH /api/v1/agent/sessions/{id}/verbosity` (`{ level }` — `normal|concise|terse|minimal`), `PATCH /api/v1/agent/sessions/{id}/hoody-env` with `{"enabled":true}` / `PATCH /api/v1/agent/sessions/{id}/hoody-env` with `{"enabled":false}` (turn injection of the `HOODY_*` shell-env contract for the bash tool on or off), and `PATCH /api/v1/agent/sessions/{id}/agent` (`{ agent }` — bind a named profile from `definitions` (`GET /api/v1/agent/agents`); `bot`, `script-writer` and `github-installer` are refused `400 bad_request` (a Bot runs `bot`, and the other two are fixed at session start: a session started on one cannot switch away)).

To use a model from an endpoint that is not in the catalogue (anything that speaks the OpenAI Chat Completions, OpenAI Responses or Anthropic Messages API from a public HTTPS address, such as a model server you run yourself or a company gateway), add it as a **custom provider** first. `POST /api/v1/agent/providers` takes `id`, `base_url` and `models`, then `PUT /api/v1/agent/providers/{id}/auth/api-key` stores its key (a key never goes in the create body), and its models are `<model_prefix>/<model>` wherever a model is chosen: `model` on `POST /api/v1/agent/sessions`, `PATCH /api/v1/agent/sessions/{id}/model` or `PATCH /api/v1/agent/agents/{name}/model`. `PATCH /api/v1/agent/providers/{id}` changes it and `DELETE /api/v1/agent/providers/{id}` removes it; `api_key_removed` in the result says whether its stored key was removed too. The change applies at once, with no restart: new sessions, model switches and Jev see it, and an open session on one of its models picks it up before its next turn. `id` is 1-40 lowercase letters, digits or inner hyphens and cannot change later; `model_prefix` is the `id` unless given, and must equal it; `wire_format` is `chat_completions` (default), `responses` or `messages`, and `auth_scheme` follows it (`bearer`, or `x-api-key` for `messages`). Built-in providers refuse update and delete (`409 provider_builtin`), as does a provider defined in a project's providers file (`409 provider_not_managed`). See Examples for the full run.

### 5. Skills, memory, todos, workflows, agents

- **Skills** — `GET /api/v1/agent/skills` (each carries an enabled + trust state), `POST /api/v1/agent/skills/hub/install` / `GET /api/v1/agent/skills/hub/search` / `GET /api/v1/agent/skills/hub/preview` to find and install from the hub. A newly installed/imported skill must be trusted before its code runs — `POST /api/v1/agent/skills/trust` with `{"trusted":true, …}` is the gate (identify the skill by `root_dir`+`rel_dir`; `POST /api/v1/agent/skills/trust` with `{"trusted":false, …}` takes the trust back); `POST /api/v1/agent/skills/toggle` with `{"disabled":false, …}` / `POST /api/v1/agent/skills/toggle` with `{"disabled":true, …}` enable or disable by `name` (the toggle body takes `name` and `disabled`, `false` to enable, `true` to disable). Both `POST /api/v1/agent/skills/trust` with `{"trusted":true, …}` (which grants arbitrary code-execution trust) and `POST /api/v1/agent/skills/hub/install` (which writes arbitrary skill code to disk) take effect immediately over this namespace: there is no confirmation step, and no privilege beyond ordinary access to the kit is required, so an autonomous caller can silently trust and install skill code. Add your own confirmation before exposing these to one.
- **Memory** — `POST /api/v1/agent/memory/search` for hybrid recall (BM25 + vector + graph) and `GET /api/v1/agent/memory/items` to enumerate by `project`; `POST /api/v1/agent/memory/items` / `PATCH /api/v1/agent/memory/items/{id}` / `DELETE /api/v1/agent/memory/items` to write; `GET /api/v1/agent/memory/graph` for the relation graph (or `GET /api/v1/agent/memory/items/{id}` to read one record by `id`). `PUT /api/v1/agent/memory/enabled` with `{"enabled":true}` / `PUT /api/v1/agent/memory/enabled` with `{"enabled":false}` are the memory capture/privacy switch — they persist `features.memory` and flip the live store — and `POST /api/v1/agent/memory/flush` forces the store's durability barrier; none of the three is admin-gated. Memory is project-scoped (pass `project`). Memory reads and item writes accept `X-Hoody-Realm` or `?realm=` to select `global` or a realm id (in the SDK, pass `agentRealm` in the method's options); omitted, the agent's current realm is used. A realm this login does not serve returns `404 not_found`; an agent pinned to one realm refuses another with `400 realm_scope_unsupported`. If the selected realm's memory is not connected, the request returns `503 service_unavailable` with `Retry-After` and does not connect it. `POST /api/v1/agent/memory/consolidate` is a guarded write: it needs a single-use intent from `POST /api/v1/agent/memory/write-intents`; see Common errors. `POST /api/v1/agent/memory/search` / `GET /api/v1/agent/memory/graph` also return `503 store_unavailable` while the store is still warming — retry rather than treating it as an empty result.
- **Todos** — `GET /api/v1/agent/todos` / `POST /api/v1/agent/todos` to file; then `POST /api/v1/agent/todos/triage` (LLM inbox pass), `POST /api/v1/agent/todos/{id}/claim` / `POST /api/v1/agent/todos/{id}/release`, `POST /api/v1/agent/todos/{id}/run` (dispatch a background orchestrator — returns `{job_id, session_id}`), `POST /api/v1/agent/todos/{id}/cancel-run` to abort an in-flight run, and `POST /api/v1/agent/todos/{id}/proposals/{pid}/approve` / `POST /api/v1/agent/todos/{id}/proposals/{pid}/deny` to resolve a proposed run — approve is NOT inert: it spawns a background worker session equivalent to `POST /api/v1/agent/todos/{id}/run` (a J-class autonomous run that spends model budget), while `POST /api/v1/agent/todos/{id}/proposals/{pid}/deny` spawns nothing — plus `POST /api/v1/agent/todos/{id}/snooze` / `POST /api/v1/agent/todos/{id}/archive`. To move a todo between states (`inbox`, `ready`, `blocked`, `review`, `done`, `dropped`) or edit its fields, `PATCH /api/v1/agent/todos/{id}` applies a CAS-guarded patch / `state` transition (`in_progress` is entered only by `POST /api/v1/agent/todos/{id}/claim` / `POST /api/v1/agent/todos/{id}/run`; `PATCH /api/v1/agent/todos/{id}` refuses it, and an unknown state is rejected) — read the todo's OWN `revision` with `GET /api/v1/agent/todos/{id}` and pass it back (`GET /api/v1/agent/todos/revision` is a change cursor filtered by realm and account visibility, NOT the per-todo CAS token; a stale value → `409 todo_conflict`); a stale revision is rejected (409). `POST /api/v1/agent/todos/{id}/archive` is not terminal — `POST /api/v1/agent/todos/purge` permanently and irreversibly deletes archived todos of the selected realm that were archived more than 90 days ago (and those with a missing or invalid archive time); a read-only todo from before the computer rename is kept; no confirmation gate, treat as destructive. Mind the comment split: `POST /api/v1/agent/todos/{id}/messages` (`/messages`, plural) only appends a comment, whereas `POST /api/v1/agent/todos/{id}/message` (`/message`, singular) ALSO kicks an orchestrator turn — a budget-spending LLM run that returns `{job_id}` — so use the plural form for a plain note. The `job_id` returned by `POST /api/v1/agent/todos/{id}/run`, `POST /api/v1/agent/todos/{id}/message` and `POST /api/v1/agent/todos/triage` completes as `succeeded` the moment the dispatch is accepted; it records the dispatch only, not the worker's outcome. Follow the todo itself (`GET /api/v1/agent/todos/{id}`, its state and timeline) rather than polling that job. Note `POST /api/v1/agent/todos/{id}/run` / `POST /api/v1/agent/todos/triage` / `POST /api/v1/agent/todos/{id}/proposals/{pid}/approve` are J-class autonomous runs with NO confirmation gate on the RPC (reaching the RPC is itself treated as the human approval; that denial lives only on the model-facing `run_todo` *tool*), so calling them from automation silently dispatches a real LLM run — gate them in your own caller.
- **Workflows** — `GET /api/v1/agent/workflows` / `GET /api/v1/agent/workflows/{name}` / `PUT /api/v1/agent/workflows/{name}` / `DELETE /api/v1/agent/workflows/{name}` / `POST /api/v1/agent/workflows/{name}/hide` with `{"hidden":true}` / `POST /api/v1/agent/workflows/{name}/hide` with `{"hidden":false}` manage saved definitions; `POST /api/v1/agent/sessions/{id}/workflows/{name}/runs` dispatches one onto a live session and returns a JOB, not a run (optionally seed the run with a `{ prompt }` body — input text fed to the workflow). `PUT /api/v1/agent/workflows/{name}` takes the whole definition as `definition`; a small definition that saves is `{"entry_point":{"id":"check"},"steps":{"check":{"type":"bash","command":"echo hello"}}}` (`steps` is a non-empty object keyed by step id; this example uses a `bash` step with a `command` and ends after that step because it has no `next_steps`) — poll `GET /api/v1/agent/jobs/{id}`, checking both `status` and `run_id`: once `run_id` populates (null during the brief dispatch window), track the run via `GET /api/v1/agent/workflows/runs` / `GET /api/v1/agent/workflows/runs/{run_id}` and stop it with `POST /api/v1/agent/workflows/runs/{run_id}/cancel`; a dispatch the agent refuses (a missing required input, a blocking hook, no configured model) ends the job as failed with `run_id` still null, so read its result and the session stream: no run exists to track or cancel; feed a running workflow with `POST /api/v1/agent/sessions/{id}/workflow/messages` (`{ text }`). Run events flow on the owning session's stream, not a per-run bus.
- **Bots** — `POST /api/v1/agent/bots` opens a long-lived assistant that delegates work to sessions on computers; post to it with `POST /api/v1/agent/bots/{id}/messages` (HTTP 202; a busy Bot queues the message) rather than prompting its session, and see Examples for the full create, message, follow, forget, delete run. Replace its limits with `PUT /api/v1/agent/bots/{id}/guardrails` with `{ guardrails }` (empty clears them): the Bot reads them before its next message and delegates opened afterwards receive them in their first prompt, while delegates already open keep theirs. `allowed_computers` and `allowed_agents` restrict the delegates it opens next (empty means any) and `yolo: true` (default false) asks delegates to approve tool calls automatically. Check `yolo_unapplied` in `GET /api/v1/agent/bots/{id}`: `pending` means a delegate has not confirmed the change yet and it is sent again; `refused` means that delegate's approval policy does not allow YOLO, so it keeps asking for approvals and the change is not sent again until `yolo` changes. `GET /api/v1/agent/bots/{id}/stream` and `GET /api/v1/agent/bots/{id}/log` carry finished rows only; for live reply text, thinking and tool calls follow the Bot's `session_id` (from `GET /api/v1/agent/bots/{id}`, it changes after `POST /api/v1/agent/bots/{id}/reset`) with `GET /api/v1/agent/sessions/{id}/stream`, and do not answer questions on that session whose `frame_request.kind` starts with `bot.`, because the Bot runtime answers them. To stop only the Bot's running turn, `POST /api/v1/agent/bots/{id}/cancel` with `{"turn_id":"…"}`, naming the `turn_id` that `GET /api/v1/agent/bots/{id}` shows while `turn_running` is true.
- **Share a Bot through a public URL** — a Bot URL, `https://<label>.hoody.bot`, lets a person with no Hoody account talk to one of your Bots with a named key (`hbk_…`) you hand out. It belongs to your account, not to the agent kit: the owner calls `POST /api/v1/bot-urls` (and `/api/v1/bot-urls/{id}/keys`) on the control plane, and a caller sends its key to the Bot URL itself. You name the Bot by the `realm`, `id` and `uid` that `GET /api/v1/agent/bots/{id}` returns. A Bot has one Bot URL at most, a deleted and recreated Bot has a new `uid` that the URL does not follow (`repoint` it), and everyone holding a key shares one conversation with the Bot. Example 4 runs the whole flow (create, key, call, rotate, panic); the `## Bot URLs` section of the appendix is the reference for the doors, the caller client and the errors.
- **Audio / voice** — the kit speaks and listens through the speech models it lists. `GET /api/v1/agent/audio/models?capability=tts|stt` lists the text-to-speech and speech-to-text models with their formats, rates, languages and whether their provider has a key; `GET /api/v1/agent/audio/voices?model=` lists a model's voices (omit `model` for the voices of every available model except the Hoody AI relay ones, which are listed only when named). `POST /api/v1/agent/audio/speech` with JSON `{ input, model?, voice?, instructions?, response_format?, speed? }` speaks `input` (at most 4096 characters) and answers the whole audio (`audio/mpeg`, `audio/wav`, or `application/octet-stream` for `pcm`, whose rate is in `X-Hoody-Audio-Rate`); `POST /api/v1/agent/audio/speech/stream` is the same call as SSE (`speech.audio.delta` frames carrying base64 audio, then `speech.audio.done` with `usage`), for models that stream; its `response_format` is `pcm` or `mp3` (default `pcm` when the model streams PCM, otherwise `mp3`), and `wav` is refused `400`. `POST /api/v1/agent/audio/transcriptions` takes `multipart/form-data` with one recording (`file`: wav or mp3, at most 16 MiB and 600 seconds; `model`, `language`, `prompt` and `response_format` optional) and answers `{ text }` with the default `response_format` `json` (`text`: the plain transcript as `text/plain`; `verbose_json`: `text` plus `language`, `duration` and `segments` when the model gives them); `POST /api/v1/agent/audio/transcriptions/stream` is the SSE form (`transcript.text.delta`, then `transcript.text.done` with the whole `text`), wav and mp3 only, for models with partial results. A capability the model lacks (a format, `instructions`, a `speed`) is refused `400` before any paid call; `response_format` is `mp3`, `wav` or `pcm` (16-bit little-endian mono, no header; omitted: `wav`, or `mp3` when the model gives no wav, and on a stream `pcm`, else `mp3`). Some transcription models also take webm, ogg, m4a or flac on the non-streaming call (the model's `opaque_formats`): Hoody passes those on undecoded, does not verify their duration, and bills the provider's reported duration or the model's maximum when none is reported. Every speech call is billed, a stream included, so do not replay a stream automatically; a failure before the first frame is an ordinary JSON error with its status, after it an `error` frame, and a `: ping` comment arrives every 25 s. `X-Hoody-Realm` (or `?realm=`) names the realm the call is billed to; omitted, the agent's current realm. The cwd, config-dir and computer headers are refused `400 realm_scope_unsupported`.
- **Spoken messages to a Bot** — `POST /api/v1/agent/bots/{id}/messages/audio` (`multipart/form-data`: `file`, `language` optional) transcribes one recording (wav or mp3, at most 16 MiB and 600 seconds) and queues the transcript as a message to the Bot exactly like `POST /api/v1/agent/bots/{id}/messages`: `202 { message_id, state: 'posted' | 'queued' | 'dropped', turn_id?, transcript }`. `dropped` means the Bot dropped the message before posting it and never will post it (`reason` says why); that key keeps answering `dropped`, so send the recording again under a new key. Audio with no speech in it is answered `200 { no_speech: true }` and nothing is queued or billed. Send an `Idempotency-Key` on anything you may retry: once the message is admitted, the same key with the same audio, the same `language` and the Bot's same `speech.stt_model` and `speech.stt_prompt` returns the same `message_id` without transcribing again (a replay of a finished one has no `transcript`; a retry that waited on one still running gets it), and the same key with any of those changed is `422`, even for the same recording. A transcription that failed or was refused stores nothing, so a retry with that key transcribes again; a recording with no speech in it is answered `no_speech` each time, without a transcription. At most 4 recordings per Bot are transcribed at once (`503 speech_busy` past it); a request repeating the key of one still running waits for it (`429 speech_busy` when too many wait); `409 bot_deleted` or `bot_reset` means the Bot was deleted or reset before the recording was admitted. The Bot's `speech` settings (`tts_model`, `stt_model`, `voice`, `language`, `speed`, `speak_wakes`, `speak_gates`) choose the models and voice used for its spoken messages and replies.
- **Talk to a Bot by voice (WebSocket)** — `GET /api/v1/agent/bots/{id}/voice` upgrades to a WebSocket (request it with `Sec-WebSocket-Protocol: hoody.voice.v1`) that carries the user's speech to the Bot and the Bot's spoken replies back. `GET /api/v1/agent/bots/{id}/voice/check` (`?speak=false` checks speech-to-text only) answers 200 either way with `{ ready, speak, stt, tts, max_utterance_secs, diag_id? }`: `stt` and `tts` (`null` with `speak=false`) each carry `ok` and `model` (plus `language` or `voice`), and when `ok` is false also `code`, `reason`, `message`, `retryable` and, when known, `retry_after_secs` and `diag_id`. It follows the inference path (the Bot's own model, else the agent's `audio.stt_model` and `audio.tts_model` settings, else the Hoody AI voice relay when the audio setting `relay_default` is on; then capability, voice and language, then key), runs no inference, bills nothing and takes at most 6 s; `ready` is not a promise that the provider will answer. `require=stt`, `require=tts` or `require=stt,tts` on the voice URL runs the same check before the upgrade and refuses it `400 bad_request` when every failure is a voice or language the model does not offer, else `503 speech_unavailable`, with the check's result in `details` (messages may be shortened and the echoed model, voice and language values removed to fit the error's size limit; `details` is omitted if the reduced result still does not fit); a refused check takes nothing over; omitted, nothing is checked; `require=tts` with `speak=false` is `400`. `speak=false` gives text-only replies: no speech is made, every `reply.final` has `spoken: false`, nothing is billed for synthesis (speech-to-text still is), and the `session` frame shows `speak: false`. An agent supports `require`, `speak` and the check when `GET /api/v1/agent/version` lists the capability `bot_voice_check` with `supported` and `available` true. `mode` is fixed for the connection (default `vad`); in `ptt` mode only audio between `ptt.down` and `ptt.up` counts and other audio is dropped. One utterance is at most 60 seconds, or the speech-to-text model's limit when lower. Binary frames from the client are input audio: one byte `0x00`, a big-endian unsigned 32-bit sequence number, then 20 to 200 ms of audio in `in_format` (`pcm16` default, `pcmu`, `pcma`) at `in_rate` (8000, 16000 default, 24000 or 48000); binary frames from the agent are output audio: one byte `0x01`, a big-endian unsigned 32-bit output number, a big-endian unsigned 32-bit sample offset, then 16-bit little-endian PCM at `out_rate` (default 24000). Text frames are JSON objects with a `type`: the client sends `input.commit`, `ptt.down` / `ptt.up` (`mode=ptt`; the default `vad` lets the agent hear when the user starts and stops), `output.cancel`, `playback.mark` (with `play_lead=true`, at least every 500 ms while playing), `own_gate.decide` / `own_gate.answer`, `text` and `ping`; the agent sends `session` first, then `vad.start` / `vad.end`, `transcript.partial` / `transcript.final`, `reply.provisional` / `reply.invalidate` / `reply.final` / `reply.diverged`, `output.start` / `output.end` / `output.stop`, `cancel.result`, `gate.announced`, `own_gate.pending` / `own_gate.resolved`, `busy`, `error`, `takeover` and `pong`. A spoken message counts once the Bot's log shows it; only replies to this connection's own messages are spoken (plus the Bot's own replies with `speak_wakes`), and every reply's final text still arrives in `reply.final` (at most 64 KiB: a longer text is cut and `truncated` is true; the whole text is in the Bot's log). Voice never answers a delegate's approval or question: answer it on screen or by typing. One connection controls a Bot's voice at a time, over this route, the Realtime route or a phone call: a second is refused `409 voice_busy` unless it asks `takeover=true`, which closes the first (it receives `takeover`, close 1000). `reply.final` carries `own: true` when its turn answers a message sent on this connection, `false` when it does not, and no `own` when the connection cannot tell; `own` is about this connection only: a new connection starts at the next event, so a reconnect that misses the turn start gets no `own` on that reply (not `own: false`), and when it is absent match the reply's `turn_id` and your `message_id` in the Bot's log. A speech failure carries `error { code, reason?, message, diag_id?, retryable, retry_after_secs? }`: on `transcript.final` when it `failed` or was `rejected` `stt_suspect` (the outer `failed` value is unchanged; branch on `error.code` when present), on `reply.final` when `reason` is `tts_failed` or `tts_incomplete`, and on an `error` frame with code `service_unavailable` when the speech service failed while a gate announcement was spoken (at most once per code and reason per connection; the connection stays open; an announcement stopped for the daily speech limit, or silenced because speech output is off, sends no error frame). `message` says what happened and what to do next; `diag_id` names the failure in the agent's log. A `pcm16` frame of an odd byte length, a sequence gap, or audio faster than 1.5 times real time over 2 s counts as lost: the open utterance ends `rejected: frame_loss` and the connection stays open. The connection closes 1000 when the client closes it, after 10 minutes without a frame from the client (the Bot's output does not count; send `ping`), on takeover or when the Bot is deleted or suspended; 1001 when the Bot is stopped (as when the agent shuts down); 1002 without the subprotocol; 1008 for a malformed frame, text frames faster than 50 a second once the burst of 100 (the bucket starts full) is used up, an input frame outside 20 to 200 ms or a `playback.mark` past the audio sent; 1009 for a frame over 64 KiB; 1011 when a write fails, the agent runs out of voice memory, or on an internal error (a client that does not read gets no close frame; the connection just ends). The Bot's own approvals and questions (`own_gate.decide` / `own_gate.answer`) report their outcome in `own_gate.resolved` (`applied`, `resolved`, `stale`, `unavailable`, `not_offered`, `no_pending_gate`, `stale_gate`, `gate_cancelled` or `decision_unconfirmed`), never as an HTTP status.
- **Talk to a Bot with an OpenAI Realtime client (WebSocket)** — `GET /api/v1/agent/bots/{id}/realtime` upgrades to a WebSocket that speaks the OpenAI Realtime protocol (GA event names), so an off-the-shelf Realtime client library talks to the Bot. The client sends `session.update`, `input_audio_buffer.append` / `.commit` / `.clear`, `conversation.item.create` / `.delete` / `.retrieve` / `.truncate`, `response.create` and `response.cancel`; the agent answers with the matching server events (`session.created` first). Input audio is `audio/pcm` (24000 Hz, 16-bit little-endian, the default), `audio/pcmu` or `audio/pcma` (8000 Hz); output audio follows the session's output format. With `server_vad` the agent hears when the user starts and stops speaking and answers on its own; without turn detection the client commits and asks with `response.create`. A user item reaches the Bot once, by its id, and the Bot never forgets an id it has seen, so a client replaying its history on reconnect does not resend an old item; at the Bot's limit (`realtime_items` on the Bot) a new item is refused and the connection closed. An event that would change an item already sent (deleting, truncating or editing a user item waiting for a response) closes the connection with 1008; so do a binary or non-JSON frame, a frame over 1 MiB, control events faster than 50 a second once the burst of 100 (the bucket starts full) is used up, and input audio faster than 1.5 times real time. The same one-controller rule applies: `409 voice_busy` unless `takeover=true`. A WebSocket upgrade of the Bot's own OpenAI base URL plus `/realtime` (`…/api/v1/agent/bots/<realm>/<bot>/v1/realtime`, the `urls.openai` of `GET /api/v1/agent/bots/{id}` plus `/realtime`) opens the same connection for a Realtime client that only takes a base URL, with the same `?takeover=true`.
- **A phone call as the Bot's voice** — `GET /api/v1/agent/bots/{id}/twilio` is the WebSocket URL for Twilio's `<Connect><Stream>` instruction: one Twilio Media Stream becomes the Bot's voice controller. Audio is μ-law at 8000 Hz, mono; Twilio's `connected`, `start`, `media`, `mark`, `stop` and `dtmf` events are taken as Twilio documents them. What the caller says is cut into utterances by voice activity detection, each transcribed in order and posted to the Bot as the user's message; the reply comes back as 20 ms media frames with one `mark` per spoken segment, and a caller speaking over the reply stops its playback (a `clear` is sent). A `stop` event, or the call ending, drops the utterance still being spoken (never transcribed or posted); complete ones are still posted. DTMF digits are ignored, and gates are never announced or answered by voice. A second controller is refused and its stream closed with code `1008` unless the `start` event's custom parameter `takeover=true` (or `?takeover=true` on the URL) asks to take over from the open one. Access to this URL is controlled by the agent's proxy permission rules; configure one before pointing a Twilio number at it. Live Twilio accounts are not supported in this release: the route is tested against a Twilio Media Streams simulator.
- **Agent profiles** — `GET /api/v1/agent/agents` to enumerate named profiles; `POST /api/v1/agent/agents` / `POST /api/v1/agent/agents/{name}/copy` / `POST /api/v1/agent/agents/{name}/rename` / `DELETE /api/v1/agent/agents/{name}`; `GET /api/v1/agent/agents/{name}/source` → edit → `PUT /api/v1/agent/agents/{name}/source` (put the read's `revision` in the body as `expected_revision`: a stale one is refused `409 revision_conflict` and nothing is written; without it the save is unconditional); `PATCH /api/v1/agent/agents/{name}/model` / `PATCH /api/v1/agent/agents/{name}/tools` / `POST /api/v1/agent/agents/{name}/tools/{tool}/toggle` / `PATCH /api/v1/agent/agents/{name}/turns` / `POST /api/v1/agent/agents/{name}/reset-to-shipped`. The product-owned `bot` profile (the one a Bot runs) allows only a model pin through `PATCH /api/v1/agent/agents/{name}/model` (an empty model clears it); `PUT /api/v1/agent/agents/{name}/source`, `PATCH /api/v1/agent/agents/{name}/tools`, `POST /api/v1/agent/agents/{name}/tools/{tool}/toggle` and `PATCH /api/v1/agent/agents/{name}/turns` are refused for it with `400 bad_request`, as are creating over it and renaming it, and a Bot's own `model` overrides the pin. To make a session use a profile, `PATCH /api/v1/agent/sessions/{id}/agent` (`{ agent }`; not `bot`, `script-writer` or `github-installer`, see step 4) — that selects, it does NOT edit the profile. Two daemon guard rails: `DELETE /api/v1/agent/agents/{name}` refuses the configured default chat agent, and a shipped-default profile that has no removable override of its own (`is_error:true` — use `POST /api/v1/agent/agents/{name}/reset-to-shipped` or `PUT /api/v1/agent/agents/{name}/source` instead); in a realm that holds its own saved override of a shipped profile, deleting it removes the override and the shipped version shows through again, and `POST /api/v1/agent/agents/{name}/reset-to-shipped` refuses a profile that has no shipped default (`is_error:true`).

### 6. Fire-and-observe, recurring prompts, and re-attach

- **Fire-and-observe** — `POST /api/v1/agent/sessions/{id}/messages` with `{ text }` dispatches a turn and returns `{ job_id, session_id, turn_id }` immediately (HTTP 202) without streaming or blocking; watch completion via the `agent_done` on the session event stream (a connected `GET /api/v1/agent/sessions/{id}/stream` socket, or `GET /api/v1/agent/sessions/{id}/stream`) whose `turn_id` matches (another client's turn on the same session ends with its own `agent_done`). A cancel scoped with that `turn_id` stops only this turn. Refuses with 409 `turn_in_flight` if a turn is running, or 409 `gate_parked` if a gate is open.
- **Observe / re-attach** — `GET /api/v1/agent/sessions/{id}/stream` attaches to a live session's full `event.*` stream: send it as a WebSocket upgrade request to attach over WebSocket, or as a plain GET (`Accept: text/event-stream`) for the SSE form; neither falls back to the other on its own. Either way, pass `since` (gateway int64 seq, or the `Last-Event-ID` header) to resume from the 1024-event replay ring after a disconnect (a gap past eviction yields `event: lagged {code:replay_gap}`). Each frame is `{seq, incarnation, event}`, and a session re-attached under the same id starts a new incarnation whose `seq` restarts at 1, so send `incarnation` (the one you last saw) together with `since`: a mismatch answers `replay_gap` plus the full retained ring instead of silently resuming into a different history. Over SSE the `event:` line drops the `event.` prefix (`event.agent_done` arrives as `event: agent_done`) while the JSON `data:` keeps the full name, so match ordinary event frames on the parsed payload's `event.type` (for example `event.agent_done`); control frames (`lagged`, `end`, `replay_boundary`) have no `event` key. WebSocket frames are delivered unchanged. `GET /api/v1/agent/sessions/{id}/replay` returns the buffered event tail of a *live* session (with `min_seq`/`max_seq`) for a one-shot catch-up (only a *live* session has this ring). `GET /api/v1/agent/sessions/{id}/stream` does not revive a session either: on a persisted but non-live session it answers `404 not_found`, so re-attach it first (`POST /api/v1/agent/sessions` with `{"attach":"<id>"}`), then open the stream.
- **Recurring prompts (loops)** — `POST /api/v1/agent/sessions/{id}/loops` with `{ prompt, interval }` (plus optional `max_runs` / `stop_when` / `max_cost_usd` / `max_wall_ms` caps) schedules a prompt to re-fire on a live session; `GET /api/v1/agent/sessions/{id}/loops` / `PATCH /api/v1/agent/sessions/{id}/loops/{loopId}` (pause via `{ paused: true }`) / `DELETE /api/v1/agent/sessions/{id}/loops/{loopId}` to manage, `POST /api/v1/agent/sessions/{id}/loops/{loopId}/run-now` to fire one immediately. Loops are entirely session-scoped. Three rules refuse a request rather than adjusting it: `interval` has a floor of 60 seconds; at most 8 loops can be active (not paused, not ended) per daemon, so the 9th create is rejected; and each `PATCH /api/v1/agent/sessions/{id}/loops/{loopId}` carries at most ONE intent (`paused`, or `expires_in`, or the budget fields `max_cost_usd` / `max_wall_ms`), so a request mixing two is rejected 400 (a body with none of them is treated as a budget update).

- **Stop the realm's work** — `POST /api/v1/agent/stop` acts on at most 256 items per call: when the answer has `complete: false`, send its `next_cursor` back as `after`; a `complete: false` answer with no `next_cursor` (work started during the call, or items behind the cursor) is answered by calling again without `after`. Synchronous and streaming tool and headless requests end when their HTTP request closes and are not covered.

### 7. Headless one-shot run

The run's shape is chosen by the request BODY, not by a header: the default (`format` `text` or `json`) is an async job — HTTP 202 `{ job_id }`, then poll `GET /api/v1/agent/jobs/{id}` and fetch the output with `GET /api/v1/agent/jobs/{id}/result` — while `format: "stream-json"` (or `stream: true`) streams the run over SSE (`start` → `result` or `error` → `end`). A failure after the acknowledgement (a timeout, `admin_unauthorized`) arrives later, in the job result or as the `error` frame, never as the HTTP status. A headless run approves every plan and every ordinary confirm, denies a `human_only` confirm and one carrying a `helper_id` (the tool call then fails), and answers every question itself (the first rich-option title, else the first plain option, else an empty answer), so treat it as arbitrary code execution. `POST /api/v1/agent/headless/runs` with `{ "prompt": "..." }` returns 202 `{ "job_id": "..." }`; add `"format": "stream-json"` to read `text/event-stream` instead.

### 8. Configure MCP servers for a session

Reads first: `GET /api/v1/agent/mcp/servers` (`{ session_id }`) returns the EFFECTIVE merged `mcp_servers` config, the per-layer settings files behind it, and each server's LIVE runtime state (connected, negotiated protocol revision, tool count, pid, revocation reason, recent stderr). Every write is TWO steps: `POST /api/v1/agent/mcp/write-intents` (`{ session_id, op, scope }`, op ∈ the strings "upsert", "delete", "set_enabled" and "import", scope ∈ `user`|`project`|`local`; an omitted scope means `user`, or `project` when the session has no user layer, which is the usual case for a computer session — read the returned target path to confirm where the write lands) mints a single-use nonce bound to {session, op, resolved settings path} and returns the target path plus the current `mcp_servers` hash — then present that `nonce` plus the hash as `expect_hash` on the matching `PUT /api/v1/agent/mcp/servers` / `DELETE /api/v1/agent/mcp/servers` / `POST /api/v1/agent/mcp/servers/enable` with `{"enabled":true, …}` / `POST /api/v1/agent/mcp/servers/enable` with `{"enabled":false, …}` / `POST /api/v1/agent/mcp/import`. BOTH are required on every write: skipping step one fails closed, a nonce minted for a different op or scope fails closed, and `expect_hash` has no omit-it default — a first write into a settings file that does not exist yet states that expectation with the empty-array hash rather than leaving the field out. To adopt someone else's config, preview it with `POST /api/v1/agent/mcp/parse` (`{ session_id, document }` — writes nothing, needs no nonce, strips credential values) and then `POST /api/v1/agent/mcp/import` with a fresh `op: "import"` nonce; imported servers land DISABLED, so enable each one with `POST /api/v1/agent/mcp/servers/enable` with `{"enabled":true, …}`. After editing a settings file by hand, or to recover a server that died, `POST /api/v1/agent/mcp/reconnect` (`{ session_id }`) re-reads the layers and reconciles every live session's pool — a healthy unchanged server is not restarted. `POST /api/v1/agent/mcp/probe` trials a candidate config without saving it, but it is human-only (see Common errors).

## Quirks & gotchas

- **Settings take a JSON patch, and its JSON types matter.** `PATCH /api/v1/agent/settings` with `{"patch":{…}}` merges the top-level keys of `patch` into the home `settings.json`, one level deep: a key set to `null` is deleted, while the string `"null"` is stored as text, and a nested object replaces the whole stored value of its key (a dotted key such as `"a.b"` is one top-level key, not a path). Guardrail keys cannot be changed this way and answer `403 settings_key_protected`: `deny_list`, `deny_urls`, `features`, `allowed_directories`, `hooks`, `disableAllHooks`, `mcp_servers`, `tools`, `rules`, `rules_timeout_ms`, `shipped_hooks`, `exec_trust` and `audio` (so `audio.tts_model` / `audio.stt_model` are set in settings.json on the computer, not over this API). A non-null top-level `model` is refused 400: pin a model with `PATCH /api/v1/agent/agents/{name}/model` or `PATCH /api/v1/agent/sessions/{id}/model`, while `{"model":null}` still deletes an old value.
- **A chat nobody has named gets its title from the agent.** After the chat's first finished exchange, a model writes a short title into the session's `name`; `event.session_renamed` carries the new name. A name set with `PATCH /api/v1/agent/sessions/{id}` with `{"name":"…"}` is never replaced, and an empty name asks for a new title (at once on a live chat, after its next finished turn on a closed one). Turn titles off with the `session_titles` feature (`PATCH /api/v1/agent/settings/features` with `{"features":{"session_titles":false}}`). The home settings key `session_title_model` (a `provider/model`) picks the model; absent, each chat uses its own (a Claude Code session uses Hoody's helper model, and a fusion chat gets no title). Daemon-managed sessions and a Bot's own sessions are not titled.
- Bare `hoody agent` (no subcommand) is `hoody hub`: it opens the Hub, on the page the last run ended on (else Home); a computer given (an id or a name, as the argument or with `-c`) is checked first, but the Hub does not open on it. It is separate from this HTTP namespace, the typed control surface. The CLI does not attach the agent's own TUI: it opens at the computer's `agent-1` URL, or in a terminal session started with `agent=true`.
- Source of truth is the agent kit's own OpenAPI document. Its `GET /api/v1/agent/openapi.{json,yaml}` routes are not reachable through the kit URL (the proxy refuses them), so use the agent reference bundled with this skill for request paths and schemas; every route lives under the single `/api/v1/agent` prefix. The kit checks no credential of its own and asks for no bearer header; access is decided by the computer's proxy permission policy. 403 `forbidden` — Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only.
- The proxy service slug is `agent` and the kit URL host carries the index segment (`-agent-{index}`). Build it as `https://{projectId}-{computerId}-agent-{index}.{server}.computers.hoody.com` (see § Proxy URLs).
- `POST /api/v1/agent/sessions/{id}/prompt:sync` waits for the turn to end (or returns `{pending_gate}` the moment a turn parks on a confirm/question), but at most until the server deadline (290 seconds by default): a turn still running then answers `503 service_unavailable` with `details.turn_running: true` and keeps running; prefer streamed prompting for anything non-trivial so you can observe progress and resolve gates as they arrive. (The `prompt:stream` route emits **SSE** (`Content-Type: text/event-stream`), so POST it and read the event stream directly. It does NOT close when the turn ends: stop reading at the `agent_done` whose `turn_id` matches the `X-Hoody-Turn-Id` response header and close the connection yourself.) For non-interactive turns where you cannot resolve gates by hand, enable the `auto_approve` gate policy to answer the lead's confirm gates (off by default; a gate raised by a helper agent waits for a person). On the blocking form (`POST /api/v1/agent/sessions/{id}/prompt:sync`, route `prompt:sync`) it stays on for the dispatched turn even after the request ends (for at most 24 hours), unless its watcher falls behind and is dropped, after which later gates of that turn need a person. On the streamed form (route `prompt:stream`) it is tied to the connection, not the turn: disconnecting before the turn ends stops it, and while the stream stays open it also answers confirm gates of LATER turns on the same session, so close the stream at your turn's `agent_done`. With either form, an ordinary confirm gate is approved, a gate raised by a tool-call rule and a destructive-shape gate (cause `static_stakes`: a recursive force delete, curl piped to a shell, `sudo`, a force push) are DENIED, a `human_only` confirm gate is never answered: it waits for a person (on `prompt:sync` it comes back as `{pending_gate}` with `human_only: true`), and a session whose approval policy is `always` refuses the policy with `409 approval_policy_active` before the turn starts. HTTP: `?policy=auto_approve` (or the `X-Hoody-Gate-Policy: auto_approve` header) on `prompt:stream` / `prompt:sync`. This only answers **confirm** gates, never questions.
- **The agent's shell has the computer user's own sudo.** The agent runs as the computer's `user`, and its bash tool can use sudo exactly as that user can without a password: with the default passwordless sudo it can `sudo apt-get install`, `sudo systemctl enable --now` a unit and so on. When `user` has no passwordless sudo (the drop-in removed, a password required), the agent's shell has none either, because there is no terminal to type a password into; a policy that allows only some commands without a password allows the same commands to the agent (with sudo's default `listpw`). While the agent's shell can sudo, a session's `dir_scope` (`home`) no longer confines its bash commands: the file tools still keep to the scope, but the shell can reach the whole computer, like the terminal kit. To take sudo away from the agent, take passwordless sudo away from `user` (`SKILL-HTTP.md` § Default user); the agent keeps everything else `user` has, such as Docker through the `docker` group.
- Every prompt/gate/cancel call is **session-scoped** — you must hold a session id from `POST /api/v1/agent/sessions` first; there is no implicit default session. Hook writes are session-scoped too (the guarded writes — `PUT /api/v1/agent/hooks` / `DELETE /api/v1/agent/hooks` / `POST /api/v1/agent/hooks/toggle` with `{"disabled":false, …}` / `POST /api/v1/agent/hooks/toggle` with `{"disabled":true, …}` / `POST /api/v1/agent/hooks/disable-all` with `{"value":false, …}` / `POST /api/v1/agent/hooks/disable-all` with `{"value":true, …}` — plus `POST /api/v1/agent/hooks/begin-write`, and the side-effecting `POST /api/v1/agent/hooks/test` / `POST /api/v1/agent/hooks/trust/ack`, all require a live `session_id` — `POST /api/v1/agent/hooks/trust/ack` clears the per-session hook-trust prompt (the execution-trust probe `GET /api/v1/agent/hooks` reports), the gate that must be acknowledged before a saved hook command is allowed to fire, mirroring `POST /api/v1/agent/skills/trust` with `{"trusted":true, …}` for skills; `POST /api/v1/agent/hooks/reload` with a `session_id` reloads only that session and returns its summary, and without one reloads every live session in the realms the caller is served) AND the config writes are nonce-guarded (`POST /api/v1/agent/hooks/test`, `POST /api/v1/agent/hooks/trust/ack` and `POST /api/v1/agent/hooks/begin-write` itself need a live `session_id` but no nonce, and each call still needs its own fields): call `POST /api/v1/agent/hooks/begin-write` (`{ session_id, op, scope }`, op ∈ upsert|delete|toggle|set_disabled|rules_set; `rules_set` is for `POST /api/v1/agent/hooks/rules` and needs its own matching nonce) to mint a single-use nonce, then pass that `nonce` on the matching `PUT /api/v1/agent/hooks` / `DELETE /api/v1/agent/hooks` / `POST /api/v1/agent/hooks/toggle` with `{"disabled":false, …}` / `POST /api/v1/agent/hooks/toggle` with `{"disabled":true, …}` / `POST /api/v1/agent/hooks/disable-all` with `{"value":false, …}` / `POST /api/v1/agent/hooks/disable-all` with `{"value":true, …}` — the nonce binds to that session+op+scope tuple and the write fails closed without it. Note hooks are an arbitrary-command surface: `PUT /api/v1/agent/hooks` persists a command that fires on lifecycle events, and `POST /api/v1/agent/hooks/test` on a command hook runs a command at once: running saved hooks goes through the session's hook-trust gate, while a run that supplies an unsaved inline `command` runs it without that saved-hook trust check. Every command-hook run is refused (`approval_policy_unsatisfiable`) while the session's approval policy is `always`, and `POST /api/v1/agent/hooks/test` of a shipped hook only evaluates its trigger without running anything. These calls carry no confirmation step of their own — the same access that authorizes any agent-kit call authorizes these too, with nothing extra — so add your own confirmation before exposing this surface to an autonomous caller.
- **`env` and `headers` VALUES are never returned by the MCP surface; every other field comes back verbatim.** `GET /api/v1/agent/mcp/servers` reports `env_keys` / `header_keys` — key NAMES only — because a redacted value invites a client to write the placeholder back as the real secret; a write whose body carries the redaction placeholder for a credential is REFUSED rather than stored. Other fields, including `url`, `command` and `args`, are echoed verbatim in a listing (only the import preview differs: it shows each entry as it would be stored, with a missing `type` becoming `http` when `url` is set, `${env:VAR}` references translated in `env` and `headers` only (others stay as written, with a warning), an env-file setting dropped with a warning and `enabled` false, and `env` and `headers` replaced by `env_keys` and `header_keys` name lists), so a credential embedded in one of them (a token in a URL, a key on a command line) is NOT redacted: keep secrets in `env` / `headers`, and treat the rest of a listing as sensitive. To change a secret you must supply its real value; to leave one alone, omit the field — `PUT /api/v1/agent/mcp/servers` merges FIELD BY FIELD over the existing entry of the same name, so omitted fields keep their stored value (including fields this build does not model), and `env` / `headers` merge per key (a key set to `null` is deleted, `{}` clears the map). A genuine re-point (a changed `type`, `command`, `args` or `url`) clears `env` and `headers` unless the same request re-supplies them, so send the credentials the new target needs in that write; restating the identity you read back is not a re-point. `POST /api/v1/agent/mcp/servers/enable` with `{"enabled":true, …}` / `POST /api/v1/agent/mcp/servers/enable` with `{"enabled":false, …}` flip only the `enabled` flag so credentials and options survive a disable. A deleted, disabled, or re-pointed server is REVOKED in every live session before the response returns, including mid-turn (a stdio child is reaped when its last holder releases). Reconnecting is awaited only for the session named in the request: check `servers[].connected`, because a failed connection still answers 200. Other live sessions reconnect in the background, best effort, and a session mid-turn adopts added tools at its next turn boundary. Import is WHOLE-BATCH — one bad entry aborts everything — it understands the hoody (`mcp_servers` list), Claude/Cursor (`mcpServers` map) and VS Code (`servers` map) dialects, and REFUSES a document carrying more than one of them rather than guessing.
- `POST /api/v1/agent/hoody/auth/bootstrap` (token bootstrap) is enabled by default; a deployment can turn it off, and then every call answers 404. Browser clients may call it; the `Content-Type` media type must be `application/json` (parameters such as `charset=utf-8` are accepted). Where the deployment requires a capability, the body must carry the matching `capability` (a mismatch is also 404). The token must belong to this box's owner and carry the full login grant (otherwise 403). On a box with no credential it installs (201 `installed`) and adopts any local sessions or todos that have no owner; on a box logged in to the SAME account it replaces the stored token whether or not it expired (200 `renewed`). A token for a different account is refused `409 agent_login_conflict`, and a credential supplied through the environment is never replaced (`409 credential_present`).
- A Bot URL is bound to a Bot by its `uid`, not its id: if the Bot is deleted and created again, the Bot URL refuses keyed calls with `bot_disabled` (403) until the owner points it at the new Bot with `repoint`. The agent serves a Bot URL's doors but does not create, list or manage Bot URLs; they are an `api` resource that only the project owner (or an administrator) can manage.
- **A keyed request whose answer was lost is recovered by its key, never by sending it again under a new one.** Read the key first: `GET /api/v1/agent/session-create-keys/{key}`, `GET /api/v1/agent/sessions/{id}/turns/by-key/{key}`, `GET /api/v1/agent/sessions/{id}/commands/by-key/{key}`, `GET /api/v1/agent/bots/{id}/messages/by-key/{key}`. A hit is what the key admitted. A miss proves nothing: the request may still be on its way. For a create, turn or command, retire the key (`POST …/retire` on the same path): `admitted: "false"` means nothing ran and nothing ever will (the late request is refused `409 create_key_retired`, `turn_key_retired` or `command_key_retired`), so a new key is safe; `"true"` returns what the key admitted; `"unknown"`, or a `503`, means it may have run: check before sending again. A create sent with a config dir keeps its key in that install: read and retire it with the same `X-Hoody-Config-Dir`. A Bot message has no retire: read the Bot's log.

## Common errors

- A model rate limit can end the turn: `event.error.code` is `quota_wait_too_long` or `rate_limit`, and `agent_done.error_code` carries the same code. For `quota_wait_too_long`, read `retry_after_secs` from the error payload, wait that many seconds, then send the message again: the turn ended instead of waiting. `retry_after_secs` is always present for `quota_wait_too_long` and may also appear on another failed model request when the provider named a wait (a rate limit or a busy provider); honor it when present, but do not assume it exists for `rate_limit`.
- A gate or question left unresolved stalls the turn — a streamed prompt that emitted an `event.confirm_request` (confirm gate) or `event.user_question` (question gate) will not complete until you answer it: `POST /api/v1/agent/sessions/{id}/confirm` with `{"approved":true}` / `POST /api/v1/agent/sessions/{id}/confirm` with `{"approved":false}` for a confirm, `POST /api/v1/agent/sessions/{id}/answer` for a question. For unattended runs, arm `PATCH /api/v1/agent/sessions/{id}/auto-reply` (a self-driving auto-user loop; it answers questions only during its own rounds, so arming it does not resolve a question an ordinary prompt already parked), or pass the `auto_approve` gate policy on the prompt — but `auto_approve` only answers **confirm** gates (approving ordinary ones, denying rule-raised and destructive-shape (`static_stakes`) ones; refused with `409 approval_policy_active` on an `always` session), never questions or a `human_only` confirm gate; either still stalls: a question until `POST /api/v1/agent/sessions/{id}/answer` answers it (the auto-reply loop answers only the questions its own rounds raise), a `human_only` gate until a person answers it.
- `GET /api/v1/agent/sessions/{id}/tasks` and `GET /api/v1/agent/sessions/{id}/tasks/{tid}/transcript` return their data INLINE and need no live session and no attached stream. `GET /api/v1/agent/sessions/{id}/tasks` is the UNION of the live task registry and the session's PERSISTED task store (keyed by task id, live winning) — the live registry evicts completed tasks when a new one spawns, so a finished task can leave memory while its transcript is still durable, and a live-only list would hide it. `GET /api/v1/agent/sessions/{id}/tasks/{tid}/transcript` reads a task that reached a terminal state even for a closed session and after a daemon restart; a task still running when the daemon stops orderly is cancelled; if it does not stop within about 5 seconds shutdown tries to save its partial transcript as `cancelled` with `complete: false` (`source: "store"`); a saved row survives restarts, and one it could not save in time reads 404. A task running when the daemon is killed without that shutdown (crash, SIGKILL) leaves nothing and reads 404. Tasks never resume after a restart. Its `source` field is `"live"` or `"store"`, and `complete` reports whether the response reflects a terminal projection DURABLY COMMITTED to that store. `after_seq` is EXCLUSIVE (entries strictly after it, plus any still-open entry); OMITTING it returns the whole transcript, which is distinct from `after_seq=0`. `POST /api/v1/agent/sessions/{id}/tasks/{tid}/cancel` / `POST /api/v1/agent/sessions/{id}/tasks/cancel` still act on a LIVE session and stop background tasks mid-turn (server-layer; tasks survive `POST /api/v1/agent/sessions/{id}/cancel` but are not restartable).
- `POST /api/v1/agent/memory/consolidate` (`POST /api/v1/agent/memory/consolidate`) is a **guarded write**: first `POST /api/v1/agent/memory/write-intents` with `{ op: "consolidate", project }`, then pass the returned `nonce` with the same `project` to `POST /api/v1/agent/memory/consolidate`. The intent is single use, expires after a few minutes, and is bound to the store, the realm it was minted in, the op and the project, so a `wipe_project` intent or one for another project is refused. Without a valid intent the call returns `409 write_intent_invalid` and nothing is enqueued; every attempt that reaches the consolidate handler spends the intent, so such a retry needs a fresh one (a request refused earlier, such as a failed admin authorization or a 429, does not spend it). A `200` means the pass was enqueued and runs in the background, not that it finished. `503 consolidate_unavailable` means the maintenance queue is full or memory is disabled: retry shortly with a new intent. Consolidation spends model budget, so ask the user before running it.
- `POST /api/v1/agent/mcp/probe` (`POST /api/v1/agent/mcp/probe`) is **human-only and ALWAYS fails over this namespace** — probing STARTS A PROCESS (stdio) or makes an outbound request to a caller-chosen URL (http/sse), so a machine caller may not self-approve it: with a valid session it receives `403 human_only` on every HTTP/SDK/CLI call (a missing session id is refused `400` and an unknown or closed session `404` before that check). The surface still exposes it for completeness, it simply always refuses. The deny list is still enforced on the candidate config before anything is started. Use `POST /api/v1/agent/mcp/parse` for a write-free preview instead; there is no programmatic substitute for the live trial.
- An MCP write needs BOTH a `nonce` and an `expect_hash` — neither is optional, and a stale hash is a CONFLICT rather than a silent overwrite. `PUT /api/v1/agent/mcp/servers` / `DELETE /api/v1/agent/mcp/servers` / `POST /api/v1/agent/mcp/servers/enable` with `{"enabled":true, …}` / `POST /api/v1/agent/mcp/servers/enable` with `{"enabled":false, …}` / `POST /api/v1/agent/mcp/import` each require a fresh single-use `nonce` from `POST /api/v1/agent/mcp/write-intents` minted for that exact op and scope (one minted for a different op or scope fails closed) AND the `mcp_servers` hash you last read, from either `POST /api/v1/agent/mcp/write-intents` or `GET /api/v1/agent/mcp/servers`. A mismatch means someone else edited the layer since you read it — re-read, re-mint, retry; each nonce is good for exactly one write, so a retry always needs a new one. There is no "omit it for the first write" shortcut: writing into a settings file that does not exist yet means passing the empty-array hash.
- `DELETE /api/v1/agent/workflows/{name}` removes **user** workflows and saved customizations. A built-in/**system** workflow that you never customized is refused (`is_error:true`) and re-seeds on every boot; `POST /api/v1/agent/workflows/{name}/hide` with `{"hidden":true}` is the only way to remove it from view. Deleting your saved customization of a system workflow succeeds and brings the shipped version back: at once in a scoped realm, at the next daemon restart otherwise.
- Empty values on agent-profile edits mean *inherit / unrestrict*, not *clear to nothing*: `PATCH /api/v1/agent/agents/{name}/model` with `model: ""` removes the model line (falls back to the default model), and `PATCH /api/v1/agent/agents/{name}/tools` with `tools: []` removes the allow-list line, which means **all tools are allowed** (NOT zero). Pass a non-empty `tools` array to set the base allow-list. `PATCH /api/v1/agent/agents/{name}/tools` takes only `tools` and `none`; to enforce the listed tools exactly, set `strict_tools: true` in the profile's frontmatter: read it with `GET /api/v1/agent/agents/{name}/source`, add the key and write it back with `PUT /api/v1/agent/agents/{name}/source`. To give the profile no tools at all, pass `tools: []` with `none: true` (writes `tools: none`); `none: true` with a non-empty list returns `400 bad_request`. A profile with `strict_tools: true` is the exception: there an empty list grants only the benign special tools, never the full set.
- Prompting with no usable model/provider configured fails the turn. `GET /api/v1/agent/providers` lists every catalogued provider whether or not it is set up, so check the one you intend to use with `GET /api/v1/agent/providers/{id}/auth` before you prompt (blocking or streamed): `ready` is true for a stored API key, a stored OAuth login, or a passwordless provider (`no_auth_ready`).
- A custom provider's `base_url` must be an `https` URL with no user name, password, query or fragment, at a public address. Create, and updates that change `base_url`, refuse one that is not (an internal address, or a name that resolves inside a network) with `422 provider_invalid` and `details.field` `base_url`. The destination is checked again when the agent connects, and a later refusal (a name that now resolves to an internal address) fails the model request instead, for example with `502 upstream_error` on a non-streaming completion. Create is not idempotent by itself: repeating a create that went through answers `409 provider_exists`, so send an `Idempotency-Key` to retry safely (the same key with another body is `422 idempotency_key_reused`). Deleting a provider (the result's `api_key_removed` says whether its stored key went too) leaves an open session on one of its models unconfigured: its next prompt fails with `session_unconfigured` until you switch it to another model, and agents and Jev settings that name one of its models fail the same way until changed.
- Speech calls answer `413 audio_too_long` for a wav or mp3 over 600 seconds (`413` too for a file over 16 MiB), `415` on a transcription for audio the model does not take, `422` when the model is unavailable or the input is refused, `502` / `504` for a provider failure or timeout, and `503` when speech is unavailable (`speech_unavailable`: speech is unavailable for this request; read `details.reason` when present: `no_credentials` means the selected model's provider has no key stored, `relay_*` means the voice relay could not serve it, and another speech model may still work) or busy (`speech_busy`: too many speech calls running on the agent, or, for a spoken Bot message, 4 recordings already being transcribed for that Bot) — honor `Retry-After`; resend a spoken Bot message with the same `Idempotency-Key` (an admitted message is not queued twice, but a failed transcription stored nothing, so the retry transcribes again; other speech calls do not deduplicate it: each retry is a new, billed call). A `429` is `rate_limited` (the per-client request rate; each non-streaming speech call also takes one of the client IP's completion slots and each open stream one of its stream slots), `speech_quota_exceeded` (the realm's, Bot's or agent's speech budget is spent for now) or, on a spoken Bot message, `idempotency_keys_exhausted` or `speech_busy` (too many requests waiting): read the code.
- Calling prompt/gate/cancel against a session whose live connection was torn down (`POST /api/v1/agent/sessions/{id}/close`, or `DELETE /api/v1/agent/sessions/{id}` without `hard`) returns not-found. If the record survives, re-attach with `POST /api/v1/agent/sessions` with `{ "attach": "<id>" }`; otherwise start a fresh session (the same create call without `attach`). After a *hard* delete (the `hard` flag set) the record is gone and only a fresh session works.

## Related namespaces

`terminal`, `exec`, `files`, `notes`, `api` (its `botUrls` service gives a Bot a public URL).

## Examples

A **Bot** here is the agent's long-lived assistant (routes under `/api/v1/agent/bots`). It opens delegate sessions on computers, follows them and reports back. Chat apps reach it as its channels; there is no separate `bot` namespace. Set `P`, `C`, `N` from `GET /api/v1/computers/{id}` first. The Bot's id below is `release-bot`; omit `id` on create to have one generated, and take it from the response.

### 1. Create a Bot, message it, follow its replies, forget, delete

**Goal:** run a Bot end to end. `guardrails` are limits on the work (they apply to the Bot and every delegate it opens), not instructions. A Bot lives in one realm: pick one with `X-Hoody-Realm`, otherwise the agent's current realm is used. The Bot's own session opens when the first message is posted, or earlier on a spoken-message attempt (even one whose transcription then fails), so `session_id` is empty until then. A reset starts a new session at once, so read `session_id` again after one. This Bot has guardrails, so its default `guardrail_check` (`strict`) needs the guardrail checker (Jev), which needs the credential of the provider of `jev.model` when that provider is key-backed (`hoody-ai/hoody-decide` needs none). Hoody Decide is used only when `jev.model` names it; when `jev.model` is unset, Jev uses the default of a key-backed provider whose key is set. Without the key, every dispatch and delegate message is refused and the Bot says which key is missing; `lenient` still checks and refuses work that may break a guardrail, and lets the work go ahead unchecked only when the check cannot be made; `off` skips the check.

**Step 1 — create.** Send `id` to make a retry safe: a second create with the same id answers `409 bot_exists`.

```bash
K="https://${P}-${C}-agent-1.${N}.computers.hoody.com"
curl -sS -X POST "$K/api/v1/agent/bots" -H 'Content-Type: application/json' \
  -d '{"id":"release-bot","name":"Release bot","role":"Ships the weekly release.","guardrails":"Never push to main."}'
```

**Step 2 — message it.** The answer is `202` with `{message_id, state}`: `posted` (with `turn_id`) once dispatch is confirmed, `queued` when the message is accepted but dispatch is not yet confirmed. A busy Bot answers `queued` at once and the message goes out when its turn ends; a free Bot can also answer `queued` after a 3 second dispatch wait. Add an `Idempotency-Key` to retry safely.

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

**Step 5 — delete.** Removes the Bot with its log and archive, after a best-effort stop of its working delegates. Its session and delegates are not closed: they stay listed under the sessions. Delegate sessions can be continued directly; to continue the former Bot session, fork it, because the Bot's own responder is removed with the Bot. To stop the Bot's running turn, `POST /api/v1/agent/bots/{id}/cancel` with `{"turn_id":"…"}`, naming the `turn_id` that `GET /api/v1/agent/bots/{id}` shows while `turn_running` is true. Only that turn stops: a late stop never stops a newer one, and delegates keep running (stop one with `POST /api/v1/agent/bots/{id}/delegates/{sid}/stop`).

```bash
curl -sS -X DELETE "$K/api/v1/agent/bots/release-bot"
```

### 2. Add a custom provider, store its key, use its model

**Goal:** connect an OpenAI-compatible endpoint and run a session on one of its models. The provider id below is `acme`; its model is selected as `acme/llama-3.3-70b`. Replace `https://api.acme.example/v1` (and `https://eu.api.acme.example/v1` in Step 4) with your provider's real https base URL: create resolves the host and refuses one that does not resolve (`422 provider_invalid`).

**Step 1 — create it.** `id`, `base_url` and `models` are required. Add an `Idempotency-Key` so a retry answers with the provider the first try created instead of `409 provider_exists`. The reply carries the provider, with each model's `spec`.

```bash
K="https://${P}-${C}-agent-1.${N}.computers.hoody.com"
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

**Step 4 — change or remove it.** Update names only what changes (`models` and `headers` replace the current list and map; `id` and `model_prefix` are fixed). Delete asks for confirmation on the CLI and removes the stored key too when it is the one stored for this provider; `api_key_removed` in the result says whether it did.

```bash
curl -sS -X PATCH "$K/api/v1/agent/providers/acme" -H 'Content-Type: application/json' \
  -d '{"base_url":"https://eu.api.acme.example/v1"}'
curl -sS -X DELETE "$K/api/v1/agent/providers/acme"
```

### 3. Speak a sentence, transcribe a recording, post a spoken message to a Bot

**Goal:** turn text into an mp3, turn a wav recording into text, then send that recording to the Bot from Example 1 as a spoken message (run step 4 before Example 1's step 5 deletes the Bot, or create it again with Example 1, step 1). Pick models from the list first: a text-to-speech model whose `formats` include `mp3` and a speech-to-text one, each with a provider key in place, and pass each as `model` (steps 2 and 3). A call without `model` uses settings `audio.tts_model` / `audio.stt_model`, and with neither set (and the Hoody AI relay default off) it is `422 speech_not_configured`; listing a model does not select it.

**Step 1 — list the speech models and one model's voices.**

```bash
curl -sS "$K/api/v1/agent/audio/models?capability=tts"
TTS_MODEL='<an id from that list>'
curl -sS -G "$K/api/v1/agent/audio/voices" --data-urlencode "model=$TTS_MODEL"
```

**Step 2 — speak a sentence.** The whole audio comes back in one answer; `response_format: 'mp3'` asks for mp3, and a model whose resolved formats lack `mp3` is refused `400`. Models served through the Hoody AI relay list an empty `formats` (it is resolved when the call is made).

```bash
curl -sS -X POST "$K/api/v1/agent/audio/speech" -H 'Content-Type: application/json' \
  -d "{\"model\":\"$TTS_MODEL\",\"input\":\"The staging build is green.\",\"response_format\":\"mp3\"}" -o hello.mp3
```

**Step 3 — transcribe a recording.** One wav or mp3 file, at most 16 MiB and 600 seconds; `language` helps when you know it.

```bash
curl -sS "$K/api/v1/agent/audio/models?capability=stt"
STT_MODEL='<an id from that list>'
curl -sS -X POST "$K/api/v1/agent/audio/transcriptions" -F file=@question.wav -F "model=$STT_MODEL" -F language=en
```

**Step 3b — give the Bot a speech-to-text model (once; skip it when settings `audio.stt_model` is set).** The Bot's `speech` object replaces its speech settings whole (`null` removes them), so send every field you want to keep. A model that is unknown, lacks speech-to-text (`details.reason: "not_stt"`) or is not available is refused `422 model_unavailable`; nothing changes.

```bash
curl -sS -X PATCH "$K/api/v1/agent/bots/release-bot" -H 'Content-Type: application/json' \
  -d "{\"speech\":{\"stt_model\":\"$STT_MODEL\"}}"
```

**Step 4 — post the recording to the Bot as a spoken message.** Same queueing as a text message (`202` with `state` `posted`, `queued` or `dropped`); a recording with no speech in it is answered `200 { no_speech: true }` and nothing is queued; an `Idempotency-Key` makes a retry safe. The form takes `file` and `language` only (another field is `400`): the Bot transcribes with its own `speech.stt_model`, else settings `audio.stt_model`, and with neither (and the Hoody AI relay default off) the call is `422 speech_not_configured`. Follow the reply as in Example 1, step 3.

```bash
curl -sS -X POST "$K/api/v1/agent/bots/release-bot/messages/audio" -H 'Idempotency-Key: q-2026-10-12-1' \
  -F file=@question.wav -F language=en
```

### 4. Give a Bot a public URL, hand out a key, call it, rotate, panic

**Goal:** let someone without a Hoody account talk to the Bot from Example 1 (run its step 1 first, or use any Bot of yours). A **Bot URL** is the Bot's public address, `https://<label>.hoody.bot`, plus named keys (`hbk_…`) you hand out; the URL belongs to your account, so you manage it with the `api` namespace and a Hoody login, while the person you share it with needs only the URL and a key. A Bot has at most one Bot URL, and everyone holding a key shares one conversation with the Bot (each caller appears to the Bot under its key's name). The work callers start is your Bot's work, at your cost. The project owner or an administrator can manage Bot URLs; a project member gets `403 BOT_URL_OWNER_ONLY`. Set `C` to the id of the computer whose agent runs the Bot. `$A` is `https://api.hoody.com` and `$TOKEN` your bearer token. The reference for the doors a caller can use (chat, Responses, Anthropic messages, MCP), the SDK caller client and the error codes is the `## Bot URLs` section of the appendix.

**Step 1 — read the Bot's reference.** The URL is bound to the Bot by the `realm`, `id` and `uid` the agent reports for it. A deleted and recreated Bot has a new `uid`, so a Bot URL never follows it: point it at the new Bot with `repoint`.

```bash
curl -sS "$K/api/v1/agent/bots/release-bot" | jq '{realm, id, uid}'
REALM='<the realm it printed>'; BUID='<the uid it printed>'
```

**Step 2 — create the Bot URL.** Omit `label` to get a generated one (`GET /api/v1/bot-urls/suggest-label` shows a free one without reserving it). A label is 8 to 48 characters of `a-z`, `0-9` and single hyphens, starting with a letter and ending with a letter or digit; every label ever used stays taken, even after its Bot URL is deleted. `bot.realm` must be `global` or a realm the computer belongs to. The URL starts with no keys, so nobody can call it yet; `cors` (default true) lets browsers call it. The answer carries `data.id` (`bu_…`) and `data.url`; `url` is `null` while the platform has no usable Bot zone, and create is refused then.

```bash
curl -sS -X POST "$A/api/v1/bot-urls" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"computer_id\":\"$C\",\"bot\":{\"realm\":\"$REALM\",\"id\":\"release-bot\",\"uid\":\"$BUID\"},\"label\":\"release-bot-team\"}"
BU='<data.id it returned, bu_…>'
```

**Step 3 — wait until the change is applied.** Every write returns `propagation`; callers see a change about 11 seconds after `propagation.state` is `applied`, so poll `get` before you hand anything out, and again after you mint a key and after a rotate, revoke or panic (a new key does not work for its holder until then). `applied` covers publication only: a newly created or re-pointed Bot URL can take a little longer before its address resolves for callers, so after minting the first key check that `GET /v1/models` answers with that key before you hand it out, and retry if the name does not resolve yet. Deleting a Bot URL is the exception to polling: its reply is the only snapshot, and a later `get` answers 404 `BOT_URL_NOT_FOUND` at once, which does not mean the removal is applied. Poll only while the state is `pending`, with a bound: `failed` means publication encountered a failure; inspect `propagation.failed_count` and investigate rather than waiting indefinitely. The count can be zero when the intent has an error.

```bash
curl -sS "$A/api/v1/bot-urls/$BU" -H "Authorization: Bearer $TOKEN" | jq '.propagation.state, .data.status'
```

**Step 4 — mint a key for one person.** A key has a name (1 to 32 characters; unique on the Bot URL, and the Bot sees it as the caller's name), and optionally an expiry, an IPv4 allowlist and owner-only notes. The secret is in this answer only and cannot be read again: pass it to its holder over a private channel, never into a chat log or an issue. A Bot URL holds at most 20 live keys. A caller signed in with a login session, on an account that has 2FA with its API-key requirement on (the default), must also send a current 2FA code on key create and rotate (and on `repoint`, and on an `update` that turns the URL on, allows browser calls or frames, or changes its limits), else `400 OTP_REQUIRED`: add `"otp_code":"<code>"` to the body. A code works once. A caller with an `hdy_` auth token needs no code.

```bash
curl -sS -X POST "$A/api/v1/bot-urls/$BU/keys" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Dana","expires_at":"2026-12-31T23:59:59Z"}' | jq '.data | {id: .key.id, secret}'
```

**Step 5 — call it as the person you shared it with.** No Hoody login. Send the key as a bearer token (`Authorization: Bearer`). Over HTTP, a call with a key goes to `/v1/chat/completions` (any model name works; use the label), `/v1/responses`, `/v1/messages` or `/mcp`; `GET /` and `GET /SKILL.md` on the URL need no key and describe the doors. A long answer can take a while: the CLI and SDK `ask` wait for it, and the MCP `ask` over HTTP returns a `ref` to ask again with.

```bash
read -rs HOODY_BOT_KEY && export HOODY_BOT_KEY   # paste the key; it never goes on a command line
printf 'Authorization: Bearer %s\n' "$HOODY_BOT_KEY" | curl -sS https://release-bot-team.hoody.bot/v1/chat/completions \
  -H @- -H 'Content-Type: application/json' \
  -d '{"model":"release-bot-team","messages":[{"role":"user","content":"Is the staging build green?"}]}'
```

**Step 6 — rotate, revoke, panic, delete.** `rotate` keeps the key's id and settings and returns a new secret; the old one stops working for callers about 11 seconds after the change is `applied`; it needs the 2FA code under the same condition as key create (Step 4). `revoke` ends one key for good (a revoked key is gone, not paused; to pause a key use `update` with `enabled` false). `panic` is the emergency stop: in one step the URL is turned off and every key is revoked, while work the Bot already started keeps running (stop it in the agent). To reopen a panicked URL, turn it on with `update` (`enabled` true) and mint new keys. `delete` removes the URL; its label stays taken for ever. Deleting the computer detaches the URL (label and keys are kept, callers are refused) until you `repoint` it at a Bot in another computer.

```bash
KID='<the key id, bk_…>'
curl -sS -X POST "$A/api/v1/bot-urls/$BU/keys/$KID/rotate" -H "Authorization: Bearer $TOKEN" | jq '.data.secret'
curl -sS -X DELETE "$A/api/v1/bot-urls/$BU/keys/$KID" -H "Authorization: Bearer $TOKEN"
curl -sS -X POST "$A/api/v1/bot-urls/$BU/panic" -H "Authorization: Bearer $TOKEN"
```

## Reference

**Param notes for every section** (a parameter named here means this wherever a row lists it, unless its own section says otherwise):

- `X-Hoody-Realm` — Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.
- `realm` — Per-request realm selector: the in:query alias of the X-Hoody-Realm header (read when the header is absent or empty): "global" (not tied to a realm) or a 24-hex realm id. "all" is taken only by a list route's own realm parameter, never by this one. On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm.
- `X-Hoody-Cwd` — Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request.
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request.
- `X-Hoody-Computer` — Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension.
- `key` — The key.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).
- `name` — The name.
- `X-Hoody-Approver-Lease` — The approver-lease capability returned by POST /api/v1/agent/sessions/{id}/approver-lease. Required on every decision (/api/v1/agent/sessions/{id}/confirm, or the confirmed re-issue of a gated tool run) on an "always" session whose lease was minted; the daemon verifies it at decision consumption. On renew/release it names the lease to act on.

### `acp` (10) — Delegated ACP agent backend

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/acp/agents/{agent}/credential-imports/apply` | Copy Claude Code's login to another computer, as previewed. | `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/acp/agents/{agent}/file-syncs/apply` | Copy Claude Code files to another computer, as previewed. | `H:X-Hoody-Realm` `?realm` `body*` |
| `PUT /api/v1/agent/acp/agents/{agent}/enabled` | Enable or disable a BYOA ACP backend. | `H:X-Hoody-Realm` `?realm` `body` |
| `GET /api/v1/agent/acp/default` | Get the realm's default delegated agent. | `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/acp/agents` | Get BYOA ACP backend status. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/acp/agents/{agent}/credential-imports` | Preview copying Claude Code's login to another computer. | `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/acp/agents/{agent}/file-syncs` | Preview copying Claude Code files to another computer. | `H:X-Hoody-Realm` `?realm` `body*` |
| `PUT /api/v1/agent/acp/default` | Set the realm's default delegated agent. | `H:X-Hoody-Realm` `?realm` `body*` |
| `PUT /api/v1/agent/acp/agents/{agent}/model` | Set a BYOA backend's default model and effort. | `H:X-Hoody-Realm` `?realm` `body` |
| `PUT /api/v1/agent/acp/agents/{agent}/secrets/{key}` | Store an ACP per-agent secret value. | `body` |

**Param notes:**

- `agent` — The agent.

**Body shapes:**

- `POST /api/v1/agent/acp/agents/{agent}/credential-imports/apply` body — `{ preview_token*: string, overwrite: bool }` — The preview's token and the person's consent to replacing an existing login.
  - `preview_token` — The preview_token the preview returned.
  - `overwrite` — True replaces a credential file the preview showed as present or unknown. Defaults to false.
- `POST /api/v1/agent/acp/agents/{agent}/file-syncs/apply` body — `{ preview_token*: string, overwrite: string[] }` — The preview's token and the person's per-path consent to replacing existing files.
  - `overwrite` — Paths from the preview's files whose target_state was present or unknown, to be replaced. Omitted or empty replaces none.
- `PUT /api/v1/agent/acp/agents/{agent}/enabled` body — `{ enabled: bool }` — Whether the backend is armed for delegated sessions.
  - `enabled` — True arms the backend; false disarms it. Defaults to true when omitted.
- `POST /api/v1/agent/acp/agents/{agent}/credential-imports` body — `{ source: { kind: "host" | "computer", computer: string }, target_computer*: string }` — The source and the target.
  - `source` — Where the files are read from. kind host reads them on the computer this agent runs on (the default when source is omitted); kind computer reads them on another computer of the same realm, named by computer.
  - `target_computer` — The id of the computer the files are written to. It must be another computer than the one this agent runs on.
- `POST /api/v1/agent/acp/agents/{agent}/file-syncs` body — `{ mode*: "file" | "dir", path*: string, exclude_creds: bool, source: { kind: "host" | "computer", computer: string }, target_computer*: string }` — What to copy, from where, to where.
  - `mode` — file copies one file; dir copies the eligible files below a directory. Credential files, logins, conversations and symlinks are never copied, and a directory sync of .claude copies only its configuration (settings.json, CLAUDE.md, keybindings.json, agents, commands, skills, output-styles, hooks).
  - `path` — The path below the home folder, for example .claude or .claude/settings.json. No leading / and no .. segment.
  - `exclude_creds` — Also leave out the agent's registered credential file in a directory sync. Credential files are never copied either way.
- `PUT /api/v1/agent/acp/default` body — `{ delegated_agent*: "" | "claude" }` — The new default.
  - `delegated_agent` — The realm's default delegated agent: claude (Claude Code) or empty (Hoody models).
- `PUT /api/v1/agent/acp/agents/{agent}/model` body — `{ model: string, effort: string }` — The default model / effort for this backend. An empty string clears the pin.
  - `model` — Claude alias or Claude model id. Empty clears the pin.
  - `effort` — Reasoning effort Claude Code takes (low, medium, high, xhigh, max); empty clears.
- `PUT /api/v1/agent/acp/agents/{agent}/secrets/{key}` body — `{ value: string }` — The secret value to store (never returned). An empty value clears the reference.
  - `value` — The env secret value. Empty string clears (unsets) the reference. Stored only in the agent's owner-only secrets file.

### `agent` (5) — AI agent — sessions, prompting, models, skills, memory, todos, workflows

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/pause` | Get the pause state. |  |
| `POST /api/v1/agent/hoody/auth/bootstrap` | Bootstrap the Hoody platform credential (install-if-absent). | `body*` |
| `PUT /api/v1/agent/pause` | Pause or resume the agent. | `body*` |
| `POST /api/v1/agent/stop` | Stop the work running in the realm that the caller may see (at most 256 items per call; next_cursor continues). | `H:X-Hoody-Realm` `?realm` `body` |
| `GET /api/v1/agent/hoody/auth/status` | Hoody platform identity and realm scope. |  |

**Body shapes:**

- `POST /api/v1/agent/hoody/auth/bootstrap` body — `{ token*: string, capability: string }` — The platform token to install (write-only; never returned) and an optional operator capability.
  - `token` — The raw Hoody platform token to install. Write-only; validated via the sidecar before install and never echoed.
  - `capability` — The operator bootstrap capability, required only on deployments configured with one; a mismatch is answered 404.
- `PUT /api/v1/agent/pause` body — `{ paused*: bool }` — The state to put the agent in.
  - `paused` — true to pause, false to resume.
- `POST /api/v1/agent/stop` body — `{ after: string }` — Optional. Omit (or send {}) to start from the first item.
  - `after` — A next_cursor from an earlier call, unchanged (the cursor is opaque): act only on the items after it. Any other value is 400 bad_request.

### `audio` (8) — Audio operations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/audio/speech` | Turn text into speech. | `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/audio/speech/stream` | Turn text into speech, streamed over SSE. | `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/audio/transcriptions` | Turn speech into text. | `H:X-Hoody-Realm` `?realm` `body*:multipart/form-data` |
| `POST /api/v1/agent/audio/transcriptions/stream` | Turn speech into text, streamed over SSE. | `H:X-Hoody-Realm` `?realm` `body*:multipart/form-data` |
| `GET /api/v1/agent/audio/models` | List the speech models. | `?capability` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/audio/voices` | List the voices of the speech models. | `?model` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/compat/openai/v1/audio/speech` | Turn text into speech (OpenAI-compatible). | `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/compat/openai/v1/audio/transcriptions` | Turn speech into text (OpenAI-compatible). | `H:X-Hoody-Realm` `?realm` `body*:multipart/form-data` |

**Param notes:**

- `capability` — Only models with this capability.
- `model` — A speech model spec. Omitted, every available text-to-speech model except the Hoody AI relay models.

**Body shapes:**

- `POST /api/v1/agent/audio/speech` body — `{ model: string, input*: string, voice: string, instructions: string, response_format: "mp3" | "wav" | "pcm", speed: number, stream_format: "" }` — The text and how to speak it.
  - `model` — A speech model spec (GET /api/v1/agent/audio/models?capability=tts). Omitted: settings audio.tts_model, else the Hoody AI relay model (hoody-ai/hoody-tts) unless settings audio.relay_default is false; with that off and no model set the call is 422 speech_not_configured.
  - `input` — The text to speak (at most 4096 characters; less for some models).
  - `voice` — A voice of the model (GET /api/v1/agent/audio/voices). Omitted, the model's first voice.
  - `instructions` — How to speak (tone, pace), for models that take it; a model that does not is 400.
  - `response_format` — The audio format. pcm is 16-bit little-endian mono with no header (X-Hoody-Audio-Rate gives the rate). Omitted: wav when the model gives pcm or wav, else mp3.
  - `speed` — Speaking speed, for models that take it.
  - `stream_format` — Not read here. Only an empty string is accepted; any other value is 400 bad_request (details.field stream_format). For a stream, use POST /api/v1/agent/audio/speech/stream.
- `POST /api/v1/agent/audio/speech/stream` body — `{ model: string, input*: string, voice: string, instructions: string, response_format: "pcm" | "mp3", speed: number, stream_format: "" }` — The text and how to speak it.
  - `response_format` — The audio format of the stream: pcm or mp3 (wav is 400). pcm is 16-bit little-endian mono with no header (X-Hoody-Audio-Rate gives the rate). Omitted: pcm, else mp3 when the model gives no pcm.
  - `stream_format` — Not read here: this route always streams. Only an empty string is accepted; any other value is 400 bad_request (details.field stream_format).
- `POST /api/v1/agent/compat/openai/v1/audio/speech` body — `{ model: string, input*: string, voice: string, instructions: string, response_format: "mp3" | "wav" | "pcm", speed: number, stream_format: "" | "audio" | "sse" }` — The text and how to speak it.
  - `response_format` — The audio format. pcm is 16-bit little-endian mono with no header (X-Hoody-Audio-Rate gives the rate). Omitted: mp3.
  - `stream_format` — audio (default): the audio bytes. sse: an event stream of speech.audio.delta frames, then speech.audio.done. An empty string is audio, like omitting it. Any other value is refused 400 with code bad_request.

### `bots` (35) — Bots operations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/bots/{id}/gate` | Answer the approval or question the Bot itself waits on. | `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/bots/{id}/cancel` | Stop the Bot's running turn, and only that turn. | `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/bots/{id}/purge` | Delete a Bot's archive. | `?expect_uid` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/bots/{id}/forget` | Make a Bot forget its conversation. | `?expect_uid` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/bots/{id}/realtime` | Talk to a Bot with an OpenAI Realtime client (WebSocket). | `?takeover` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/bots/{id}/twilio` | Connect a Twilio Media Stream to a Bot (WebSocket). | `?takeover` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/bots/{id}/voice` | Talk to a Bot by voice (WebSocket). | `?in_rate` `?out_rate` `?in_format` `?mode` `?voice` `?language` `?speak_wakes` `?takeover` `?speak` `?refuse` `?play_lead` `?require` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/bots` | Create a Bot. | `H:X-Hoody-Realm` `?realm` `body` |
| `DELETE /api/v1/agent/bots/{id}` | Delete a Bot. | `?expect_uid` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/bots/{id}` | Get a Bot. | `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/bots/{id}/archive` | Read a Bot's archive. | `?since` `?limit` `?before` `?tail` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/bots/{id}/log` | Read a Bot's log. | `?since` `?limit` `?before` `?tail` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/bots/{id}/voice/check` | Check that a Bot can talk by voice. | `?in_rate` `?out_rate` `?in_format` `?mode` `?voice` `?language` `?speak` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/bots` | List the Bots. | `?realm` `?page` `?limit` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/bots/{id}/delegates` | List a Bot's delegates. | `?state` `?page` `?limit` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/bots/{id}/reset` | Give a Bot a new session. | `?expect_uid` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/bots/resume` | Resume suspended Bots. | `?realm` `H:X-Hoody-Realm` |
| `PUT /api/v1/agent/bots/{id}/guardrails` | Replace a Bot's guardrails. | `?expect_uid` `?expect_revision` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/bots/{id}/delegates/{sid}/stop` | Stop one of a Bot's delegates now. | `H:Idempotency-Key` `H:X-Hoody-Realm` `?realm` `body` |
| `GET /api/v1/agent/bots/{id}/stream` | Follow a Bot's log (SSE). | `?since` `H:Last-Event-ID` `H:X-Hoody-Realm` `?realm` |
| `PATCH /api/v1/agent/bots/{id}` | Change a Bot's settings. | `?expect_uid` `?expect_revision` `H:X-Hoody-Realm` `?realm` `body` |
| `GET /api/v1/agent/bots/{realm}/{bot}` | Open a Bot URL: model list or help page. |  |
| `POST /api/v1/agent/bots/{realm}/{bot}` | Chat with a Bot through its URL (OpenAI, Anthropic or MCP). | `body*` |
| `DELETE /api/v1/agent/bots/{realm}/{bot}` | End an MCP session on a Bot URL (answers 405: the server is stateless). |  |
| `GET /api/v1/agent/bots/{realm}/{bot}/{door}` | Open a Bot URL: model list, help page or the Realtime WebSocket. | `?takeover` `H:Last-Event-ID` |
| `POST /api/v1/agent/bots/{realm}/{bot}/{door}` | Chat with a Bot through its URL (OpenAI, Anthropic or MCP). | `body` |
| `DELETE /api/v1/agent/bots/{realm}/{bot}/{door}` | End an MCP session on a Bot URL (answers 405: the server is stateless). |  |
| `POST /api/v1/agent/compat/anthropic/v1/messages` | Chat with a Bot (Anthropic Messages). | `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/compat/anthropic/v1/models` | List the Bots as models (Anthropic-compatible). | `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/compat/anthropic/v1/models/{model}` | Read one Bot as a model (Anthropic-compatible). | `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/compat/openai/v1/chat/completions` | Chat with a Bot (OpenAI chat completions). | `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/compat/openai/v1/models` | List the Bots as models (OpenAI-compatible). | `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/compat/openai/v1/models/{model}` | Read one Bot as a model (OpenAI-compatible). | `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/compat/openai/v1/realtime` | Talk to a Bot by voice (OpenAI Realtime over WebSocket). | `?model` `?takeover` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/compat/openai/v1/responses` | Chat with a Bot (OpenAI Responses). | `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `expect_uid` — The uid of the Bot you read. When the id now names another Bot (the one you read was deleted and a new one created under the id), the request is refused 412 bot_changed and nothing changes. A Bot that is gone answers 404 not_found, as without it, and a request carrying it never creates chief. Omitted: no check.
- `takeover` — true: take over from the connection that controls the Bot's voice now. _(on `GET /api/v1/agent/bots/{id}/realtime`, `GET /api/v1/agent/bots/{id}/voice`, `GET /api/v1/agent/compat/openai/v1/realtime`)_
- `takeover` — true: take over from the Bot's open voice controller. _(on `GET /api/v1/agent/bots/{id}/twilio`)_
- `in_rate` — Input sample rate: 8000, 16000 (default), 24000 or 48000. _(on `GET /api/v1/agent/bots/{id}/voice`)_
- `out_rate` — Output sample rate: 8000, 16000, 24000 (default) or 48000. _(on `GET /api/v1/agent/bots/{id}/voice`)_
- `in_format` — Input encoding: pcm16 (16-bit little-endian, default), pcmu or pcma. _(on `GET /api/v1/agent/bots/{id}/voice`)_
- `mode` — vad (default): the agent detects when the user starts and stops speaking. ptt (push to talk): the client sends ptt.down and ptt.up. _(on `GET /api/v1/agent/bots/{id}/voice`)_
- `voice` — The voice to speak in; omitted, the Bot's own.
- `language` — The language the user speaks; omitted, the Bot's own.
- `speak_wakes` — true: also speak replies the Bot gives on its own; omitted, the Bot's setting.
- `speak` — false: replies arrive as text only (reply.final); no speech is made and nothing is billed for speech synthesis. Speech-to-text still runs. Default true. _(on `GET /api/v1/agent/bots/{id}/voice`)_
- `refuse` — frame: when the agent refuses the connection, accept the upgrade, send one refused frame with the code, message, details and retry_after_secs of the refusal, then close with 4000 plus its HTTP status (4400, 4404, 4409, 4500 or 4503), so a client that cannot read an HTTP refusal of a WebSocket, such as a browser, learns why. Omitted: refusals are HTTP answers.
- `play_lead` — true: the agent keeps at most 8 seconds of reply audio ahead of what playback.mark says was played, and a reply whose audio waits 5 seconds with no mark moving on stops speaking (output.stop and reply.final reason no_marks, spoken unknown, or partial when whole segments were heard; the turn goes on). Send playback.mark at least every 500 ms while playing. Omitted or false: reply audio is sent as fast as the connection takes it.
- `require` — stt, tts or stt,tts: check those speech settings before the upgrade and refuse it when they are not ready (400 bad_request for a voice or language the model does not offer, else 503 speech_unavailable). tts needs speak=true. Omitted: no check.
- `since` — Return only rows whose seq is greater than this: the next_since of the previous page. Default 0. _(on `GET /api/v1/agent/bots/{id}/archive`, `GET /api/v1/agent/bots/{id}/log`)_
- `limit` — At most this many rows: 100 when omitted or 0, at most 500 (a larger value reads 500). Negative or non-integer = 400. These routes page by since, not by page number: ?page is 400. _(on `GET /api/v1/agent/bots/{id}/archive`, `GET /api/v1/agent/bots/{id}/log`)_
- `before` — Read back from the end: the newest rows whose seq is less than this, oldest first. Pass the answer's before back to read the page older than it. Not with since or tail.
- `tail` — true: the newest rows of the log, oldest first, as before would give them for the next seq the log writes. The log only (on the archive, 400). Not with since or before.
- `in_rate` — Input sample rate: 8000, 16000 (default), 24000 or 48000. Checked for a valid value only (else 400 bad_request); it does not change the result. _(on `GET /api/v1/agent/bots/{id}/voice/check`)_
- `out_rate` — Output sample rate: 8000, 16000, 24000 (default) or 48000. Checked for a valid value only (else 400 bad_request); it does not change the result. _(on `GET /api/v1/agent/bots/{id}/voice/check`)_
- `in_format` — Input encoding: pcm16 (16-bit little-endian, default), pcmu or pcma. Checked for a valid value only (else 400 bad_request); it does not change the result. _(on `GET /api/v1/agent/bots/{id}/voice/check`)_
- `mode` — vad (default): the agent detects when the user starts and stops speaking. ptt (push to talk): the client sends ptt.down and ptt.up. Checked for a valid value only (else 400 bad_request); it does not change the result. _(on `GET /api/v1/agent/bots/{id}/voice/check`)_
- `speak` — false: check speech-to-text only, as for a voice connection opened with speak=false. Default true. _(on `GET /api/v1/agent/bots/{id}/voice/check`)_
- `realm` — The realm to list: "global" (Bots not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves, global included. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. _(on `GET /api/v1/agent/bots`)_
- `state` — open or closed: list only the delegates in that state. Omitted: both.
- `realm` — The realm whose Bots to resume: "global" (Bots not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves, global included. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. _(on `POST /api/v1/agent/bots/resume`)_
- `expect_revision` — The revision of the Bot you read. When the Bot's settings or guardrails were written since, the request is refused 412 revision_mismatch and nothing changes. Omitted: no check.
- `Idempotency-Key` — Opaque retry key (1–255 printable ASCII, no whitespace). The same stop sent again with the same key returns its outcome; the same key with a different close is 422; a key starting with "chan:" is 400.
- `since` — Return only rows whose seq is greater than this. Default 0. _(on `GET /api/v1/agent/bots/{id}/stream`)_
- `Last-Event-ID` — SSE resume cursor: the id (a non-negative integer seq) of the last frame received. It overrides ?since, and an SSE client sends it on reconnect. Another value is 400 bad_request. _(on `GET /api/v1/agent/bots/{id}/stream`)_
- `realm` — The realm. _(on `GET /api/v1/agent/bots/{realm}/{bot}`, `POST /api/v1/agent/bots/{realm}/{bot}`, `DELETE /api/v1/agent/bots/{realm}/{bot}` +3 more)_
- `bot` — The bot.
- `door` — The door.
- `takeover` — …/v1/realtime only: true takes over from the connection that controls the Bot's voice now. _(on `GET /api/v1/agent/bots/{realm}/{bot}/{door}`)_
- `Last-Event-ID` — …/events through a Bot URL only: the resume position (decimal digits, at most 16 of them, up to 2^53-1; 0 is the oldest row kept). Absent or blank, the stream starts at the 20 newest rows. _(on `GET /api/v1/agent/bots/{realm}/{bot}/{door}`)_
- `model` — The model. _(on `GET /api/v1/agent/compat/anthropic/v1/models/{model}`, `GET /api/v1/agent/compat/openai/v1/models/{model}`)_
- `model` — The Bot: bot:<realm>/<id>, or a Bot id of the request's realm. _(on `GET /api/v1/agent/compat/openai/v1/realtime`)_

**Body shapes:**

- `POST /api/v1/agent/bots/{id}/gate` body — `{ gate_id*: string, generation*: int, request_id: string, confirm: { approved*: bool, reason: string }, answer: { answer*: string } }` — The gate, and exactly one of confirm (an approval) or answer (a question).
  - `gate_id` — The gate: pending_gate.gate_id on GET /api/v1/agent/bots/{id}.
  - `generation` — pending_gate.generation on GET /api/v1/agent/bots/{id}. Required, at least 1.
  - `request_id` — Optional, approvals only: your own id for this decision, at most 64 characters from A-Z, a-z, 0-9, '.', '_' and '-'. When this decision is the one the gate used, a later 409 gate_already_resolved for the gate carries it as details.request_id.
  - `confirm` — The decision on an approval. Any member other than approved and reason is refused 400.
  - `answer` — The answer to a question. Any member other than answer is refused 400.
- `POST /api/v1/agent/bots/{id}/cancel` body — `{ turn_id*: string }` — The turn to stop.
  - `turn_id` — The Bot's running turn: turn_id on GET /api/v1/agent/bots/{id}. Required.
- `POST /api/v1/agent/bots` body — `{ id: string, name: string, role: string, instructions: string, model: string, guardrails: string, allowed_computers: string[], allowed_agents: string[], yolo: bool, guardrail_check: "strict" | "lenient" | "off", async: bool, wait_seconds: int, mcp_hints: bool, routing: { mode*: "off" | "suggest" | "auto", light: object, heavy: object }|null, worker_backend: "llm" | "acp"|null, worker_delegated_agent: string|null, allowed_worker_backends: string[]|null, worker_delegated_model: string|null, worker_delegated_effort: "" | "low" | "medium" | "high" | "xhigh" | "max"|null, worker_model: string|null, worker_thinking: "" | "off" | "on" | "low" | "medium" | "high" | "xhigh" | "max"|null, speech: { tts_model: string, stt_model: string, voice: string, language: string, speed: number, stt_prompt: string, speak_wakes: bool, speak_gates: bool, limits: object }|null }` — All fields are optional.
  - _(22 fields carry longer docs — see the spec shipped as `hoody-sdk/openapi.json` for full field semantics)_
- `PUT /api/v1/agent/bots/{id}/guardrails` body — `{ guardrails*: string }`
  - `guardrails` — The new limits; empty clears them. The Bot's name, role, instructions, guardrails and dispatch limits together must fit in 16 KiB; a write that would go past that is refused 400 bad_request with details.field naming a field.
- `POST /api/v1/agent/bots/{id}/delegates/{sid}/stop` body — `{ close: bool }` — Optional.
  - `close` — Also close the delegate's session for good. Default false.
- `PATCH /api/v1/agent/bots/{id}` body — `{ name: string, role: string, instructions: string, model: string, allowed_computers: string[], allowed_agents: string[], yolo: bool, guardrail_check: "strict" | "lenient" | "off", async: bool, wait_seconds: int, mcp_hints: bool, routing: { mode*: "off" | "suggest" | "auto", light: object, heavy: object }|null, worker_backend: "llm" | "acp"|null, worker_delegated_agent: string|null, allowed_worker_backends: string[]|null, worker_delegated_model: string|null, worker_delegated_effort: "" | "low" | "medium" | "high" | "xhigh" | "max"|null, worker_model: string|null, worker_thinking: "" | "off" | "on" | "low" | "medium" | "high" | "xhigh" | "max"|null, realtime_max_items: int, speech: { tts_model: string, stt_model: string, voice: string, language: string, speed: number, stt_prompt: string, speak_wakes: bool, speak_gates: bool, limits: object }|null }` — The fields to change; omitted fields are kept. id, uid, realm, created, created_at and created_by are fixed at creation: naming one is refused 400 field_immutable.
  - _(21 fields carry longer docs — see the spec shipped as `hoody-sdk/openapi.json` for full field semantics)_
- `POST /api/v1/agent/bots/{realm}/{bot}` body — `{ jsonrpc*: string, id: int | string, method*: string, params: object }` — An MCP JSON-RPC message: a POST of the Bot URL itself is its MCP door (Streamable HTTP; send Accept: application/json, text/event-stream).
  - `jsonrpc` — Always "2.0".
  - `id` — The request id. Absent on a notification.
  - `method` — The MCP method, for example initialize, tools/list, tools/call or ping.
  - `params` — The method's parameters.
- `POST /api/v1/agent/bots/{realm}/{bot}/{door}` body — `{ model: string, messages: { role*: string, content*: string | object[] }[], stream: bool, stream_options: { include_usage: bool }, max_tokens: int, max_completion_tokens: int, user: string, input: string | object[], instructions: string, max_output_tokens: int, system: string | object[], metadata: { user_id: string } }` — The request in the door's format, sent as JSON. …/v1/chat/completions takes an OpenAI chat completion, as in the example. …/v1/messages takes an Anthropic Messages request: {"max_tokens":1024,"messages":[{"role":"user","content":"What is the status of the release?"}]}. …/v1/responses takes an OpenAI Responses request: {"input":"What is the status of the release?"}. …/mcp takes an MCP JSON-RPC message. model may be omitted on every door: the URL names the Bot, and a model that is sent is ignored.
  - `model` — Ignored: the URL names the Bot.
  - `messages` — The conversation. Only the last message besides system and developer messages is posted, and it must be a user message.
  - `stream` — true answers with Server-Sent Events. Default false.
  - `stream_options` — Stream options.
  - `max_tokens` — Output budget. A positive integer; 64 or less marks a side request.
  - `max_completion_tokens` — Output budget; wins over max_tokens when both are sent.
  - `user` — Your id for the end user. It is part of what makes a request the same request sent again.
  - `input` — The message as a string, or a list of input items whose last message besides system and developer messages is a user message.
  - `instructions` — Counts as the system prompt.
  - `max_output_tokens` — Output budget. A positive integer; 64 or less marks a side request.
  - `system` — The system prompt, as a string or text blocks.
  - `metadata` — Request metadata.
- `POST /api/v1/agent/compat/anthropic/v1/messages` body — `{ model*: string, messages*: { role*: string, content*: string | object[] }[], system: string | object[], max_tokens: int, stream: bool, metadata: { user_id: string } }` — An Anthropic Messages request.
  - `model` — The Bot to talk to, as …/models lists it: bot:<realm>/<id>.
  - `messages` — The conversation. Only the last message is posted, and it must be a user message.
- `POST /api/v1/agent/compat/openai/v1/chat/completions` body — `{ model*: string, messages*: { role*: string, content*: string | object[] }[], stream: bool, stream_options: { include_usage: bool }, max_tokens: int, max_completion_tokens: int, user: string }` — An OpenAI chat completion request.
- `POST /api/v1/agent/compat/openai/v1/responses` body — `{ model*: string, input*: string | object[], instructions: string, stream: bool, max_output_tokens: int, user: string }` — An OpenAI Responses request.

### `bots.channels` (16) — A Bot's chat channels (Discord, Slack, Telegram)

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/bots/{id}/channels/{cid}/principals` | Pair a person with a channel by their user id in the chat app. | `H:X-Hoody-Realm` `?realm` `body*` |
| `DELETE /api/v1/agent/bots/{id}/channels/{cid}/pairing` | Cancel a channel's pairing code. | `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/bots/{id}/channels` | Connect a Bot to a chat app. | `H:Idempotency-Key` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/bots/{id}/channels/{cid}/pairing` | Make a pairing code for a channel. | `H:X-Hoody-Realm` `?realm` `body` |
| `DELETE /api/v1/agent/bots/{id}/channels/{cid}` | Delete one of a Bot's chat channels. | `H:X-Hoody-Realm` `?realm` |
| `DELETE /api/v1/agent/bots/{id}/channels/{cid}/chats/{chat}` | Forget a chat. | `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/bots/{id}/channels/{cid}` | Get one of a Bot's chat channels. | `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/bots/{id}/channel-settings` | Get a Bot's channel-wide settings. | `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/bots/{id}/channels/setup` | How to get the credentials of a chat app. | `?kind*` `?name` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/bots/{id}/channels` | List a Bot's chat channels. | `?page` `?limit` `H:X-Hoody-Realm` `?realm` |
| `DELETE /api/v1/agent/bots/{id}/channels/{cid}/principals/{pid}` | Unpair a person. | `H:X-Hoody-Realm` `?realm` |
| `PUT /api/v1/agent/bots/{id}/channels/{cid}/credentials` | Replace a channel's credentials. | `H:X-Hoody-Realm` `?realm` `body*` |
| `PATCH /api/v1/agent/bots/{id}/channels/{cid}` | Change one of a Bot's chat channels. | `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/bots/{id}/channels/{cid}/chats/{chat}` | Approve, mute or configure a chat. | `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/bots/{id}/channels/{cid}/principals/{pid}` | Change a paired person. | `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/bots/{id}/channel-settings` | Change a Bot's channel-wide settings. | `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `Idempotency-Key` — Opaque retry key (1–255 printable ASCII, no whitespace). The same create sent again with the same key returns its channel; the same key with a different body is 422.
- `chat` — The chat.
- `kind` — The chat app.
- `name` — Optional name of the bot account to be created, echoed back.
- `limit` — Maximum items per page, at most 8: 0 or omitted means 8, and a larger value is served as 8 (meta.limit echoes the value used).

**Body shapes:**

- `POST /api/v1/agent/bots/{id}/channels/{cid}/principals` body — `{ platform_user*: string, name: string, rights: ("chat" | "control" | "gates")[], owner: bool }` — The person.
  - `platform_user` — Their user id in the chat app.
  - `name` — Your name for them.
  - `rights` — chat, control, gates. Omitted: the channel's default_rights setting. An empty list is no rights.
  - `owner` — Make them the owner, with every right; the previous owner stops being one. Omit rights with owner true: a rights list, even an empty one, is 400 bad_request. Only once the channel has an owner: the first owner pairs with an owner code (409 owner_needs_pairing).
- `POST /api/v1/agent/bots/{id}/channels` body — `{ kind*: "discord" | "slack" | "telegram", label: string, token*: string, app_token: string, settings: { allowed_chats: string[]|null, blocked_chats: string[]|null, blocked_users: string[]|null, channel_lease: bool|null, chat_commands: ("status" | "stop" | "bind" | "unbind" | "help")[]|null, command_denied_reply: "hint" | "silent"|null, command_prefix: "!" | "." | ";" | "~" | "/"|null, connection_opens_per_hour: int|null, decide_in_groups: bool|null, default_rights: ("chat" | "control" | "gates")[]|null, delivery_expiry_hours: int|null, dm_policy: "owner" | "allowlist" | "pairing" | "open"|null, enabled: bool|null, format: "rich" | "plain"|null, gate_cards: "on" | "links" | "off"|null, gate_deciders: "none" | "owner" | "named" | "principals"|null, gate_detail: "summary" | "minimal"|null, gate_ttl_minutes: int|null, group_mode: "off" | "owner_approves" | "allowlist" | "open"|null, hide_secrets: bool|null, identify_per_day: int|null, identify_per_hour: int|null, lang: "en" | "de" | "fr" | "es" | "pt" | "it" | "ja" | "zh"|null, max_parts: int|null, max_principals: int|null, max_text_bytes: int|null, mention_only: bool|null, mirror_other_doors: bool|null, no_reply_notice: bool|null, outbound_rate: number|null, overflow_note: bool|null, pairing_code_burn_tries: int|null, pairing_rights: ("chat" | "control" | "gates")[]|null, pairing_ttl_minutes: int|null, pairing_user_burn_minutes: int|null, pairing_user_burn_tries: int|null, parse_mode: "html" | "plain"|null, part_chars: int|null, push_detail: "brief" | "full"|null, push_events: ("report" | "gate" | "gone" | "stop" | "waiter" | "limit" | "budget" | "error" | "provider" | "not_sent" | "reset")[]|null, rate_chat_per_min: int|null, rate_user_per_day: int|null, rate_user_per_hour: int|null, rate_user_per_min: int|null, reconnect_backoff_max_seconds: int|null, reply_style: "thread" | "reply" | "plain"|null, show_sender_name: bool|null, split_at: "paragraph" | "line" | "word"|null, typing: bool|null, unpaired_reply: "hint" | "silent"|null, wake_replies: bool|null }, delete_webhook: bool, enrolment: { make_home: bool } }` — The chat app and its credentials.
  - `label` — Your name for the channel.
  - `token` — The bot token.
  - `app_token` — Slack only, required there: the app-level token (xapp-).
  - `settings` — Settings for the new channel; the rest inherit. Unknown names are refused. home_chat is set later by an update, once the chat exists.
  - `delete_webhook` — Telegram only: remove the bot's webhook if one is set, also for a channel created off. Refused 409 channel_conflict (reason bot_paused) while the Bot's channels are paused. Default false.
  - `enrolment` — Options of the owner enrolment code.
- `POST /api/v1/agent/bots/{id}/channels/{cid}/pairing` body — `{ rights: ("chat" | "control" | "gates")[], make_home: bool, owner: bool }` — Optional.
  - `rights` — What the person may do: chat, control, gates. Omitted or empty: the channel's pairing_rights; when those are empty too, the code is refused 400 bad_request. With owner true, omit rights or send an empty list.
  - `make_home` — Make the person's direct message the channel's home chat.
  - `owner` — The owner's code (all rights).
- `PUT /api/v1/agent/bots/{id}/channels/{cid}/credentials` body — `{ token*: string, app_token: string }` — The new credentials.
  - `app_token` — Slack only: the new app-level token (xapp-). Omitted, the stored one is kept.
- `PATCH /api/v1/agent/bots/{id}/channels/{cid}` body — `{ label: string, enabled: bool, home_chat: string|null, delete_webhook: bool, settings: { allowed_chats: string[]|null, blocked_chats: string[]|null, blocked_users: string[]|null, channel_lease: bool|null, chat_commands: ("status" | "stop" | "bind" | "unbind" | "help")[]|null, command_denied_reply: "hint" | "silent"|null, command_prefix: "!" | "." | ";" | "~" | "/"|null, connection_opens_per_hour: int|null, decide_in_groups: bool|null, default_rights: ("chat" | "control" | "gates")[]|null, delivery_expiry_hours: int|null, dm_policy: "owner" | "allowlist" | "pairing" | "open"|null, format: "rich" | "plain"|null, gate_cards: "on" | "links" | "off"|null, gate_deciders: "none" | "owner" | "named" | "principals"|null, gate_detail: "summary" | "minimal"|null, gate_ttl_minutes: int|null, group_mode: "off" | "owner_approves" | "allowlist" | "open"|null, hide_secrets: bool|null, identify_per_day: int|null, identify_per_hour: int|null, lang: "en" | "de" | "fr" | "es" | "pt" | "it" | "ja" | "zh"|null, max_parts: int|null, max_principals: int|null, max_text_bytes: int|null, mention_only: bool|null, mirror_other_doors: bool|null, no_reply_notice: bool|null, outbound_rate: number|null, overflow_note: bool|null, pairing_code_burn_tries: int|null, pairing_rights: ("chat" | "control" | "gates")[]|null, pairing_ttl_minutes: int|null, pairing_user_burn_minutes: int|null, pairing_user_burn_tries: int|null, parse_mode: "html" | "plain"|null, part_chars: int|null, push_detail: "brief" | "full"|null, push_events: ("report" | "gate" | "gone" | "stop" | "waiter" | "limit" | "budget" | "error" | "provider" | "not_sent" | "reset")[]|null, rate_chat_per_min: int|null, rate_user_per_day: int|null, rate_user_per_hour: int|null, rate_user_per_min: int|null, reconnect_backoff_max_seconds: int|null, reply_style: "thread" | "reply" | "plain"|null, show_sender_name: bool|null, split_at: "paragraph" | "line" | "word"|null, typing: bool|null, unpaired_reply: "hint" | "silent"|null, wake_replies: bool|null }, unset: ("dm_policy" | "group_mode" | "mention_only" | "default_rights" | "blocked_users" | "blocked_chats" | "allowed_chats" | "unpaired_reply" | "command_denied_reply" | "pairing_ttl_minutes" | "pairing_rights" | "max_principals" | "pairing_user_burn_tries" | "pairing_user_burn_minutes" | "pairing_code_burn_tries" | "gate_cards" | "gate_deciders" | "decide_in_groups" | "gate_detail" | "gate_ttl_minutes" | "push_events" | "push_detail" | "wake_replies" | "mirror_other_doors" | "typing" | "reply_style" | "format" | "parse_mode" | "part_chars" | "split_at" | "max_parts" | "overflow_note" | "lang" | "show_sender_name" | "no_reply_notice" | "delivery_expiry_hours" | "max_text_bytes" | "rate_user_per_min" | "rate_user_per_hour" | "rate_user_per_day" | "rate_chat_per_min" | "outbound_rate" | "reconnect_backoff_max_seconds" | "identify_per_hour" | "identify_per_day" | "connection_opens_per_hour" | "command_prefix" | "chat_commands" | "hide_secrets" | "channel_lease")[] }` — The fields to change.
  - `enabled` — Turn the channel on or off. Only here: settings.enabled and unset enabled are refused 400.
  - `home_chat` — The chat id updates go to; null removes it. Only here: settings.home_chat and unset home_chat are refused 400.
  - `delete_webhook` — Telegram only, with enabled true: remove the bot's webhook. Refused 409 channel_conflict (reason bot_paused) while the Bot's channels are paused and the channel is not running.
  - `settings` — Settings to set; null removes one so it inherits. enabled and home_chat are not settable here (400, details.field names the key and details.top_level the member to use).
  - `unset` — Settings to remove so they inherit, like null in settings. enabled and home_chat are refused 400 (use the top-level members). A name both set and unset is 400.
- `PATCH /api/v1/agent/bots/{id}/channels/{cid}/chats/{chat}` body — `{ state: "approved" | "muted", acknowledge_group_readers: bool, settings: { format: "rich" | "plain"|null, mention_only: bool|null, rate_chat_per_min: int|null, rate_user_per_day: int|null, rate_user_per_hour: int|null, rate_user_per_min: int|null, reply_style: "thread" | "reply" | "plain"|null }, unset: ("mention_only" | "reply_style" | "format" | "rate_user_per_min" | "rate_user_per_hour" | "rate_user_per_day" | "rate_chat_per_min")[] }` — The fields to change.
  - `state` — approved: the Bot answers there. muted: it does not.
  - `acknowledge_group_readers` — Required to approve a group.
  - `settings` — Chat settings; null removes one so it inherits.
  - `unset` — Chat settings to remove so they inherit, like null in settings. A name both set and unset is 400.
- `PATCH /api/v1/agent/bots/{id}/channels/{cid}/principals/{pid}` body — `{ rights: ("chat" | "control" | "gates")[], lang: "en" | "de" | "fr" | "es" | "pt" | "it" | "ja" | "zh"|null, name: string, owner: bool }` — The fields to change.
  - `rights` — chat, control, gates.
  - `lang` — Their language; null removes it, so the lang setting applies to them. Omit it to leave it unchanged.
  - `owner` — Make them the owner (the previous owner stops being one). Only once the channel has an owner: the first owner comes from pairing (409 owner_needs_pairing).
- `PATCH /api/v1/agent/bots/{id}/channel-settings` body — `{ channels_paused: bool|null, hide_secrets: bool|null, lang: "en" | "de" | "fr" | "es" | "pt" | "it" | "ja" | "zh"|null, max_channels: int|null, rate_bot_per_day: int|null, shared_identity: "off"|null, unset: ("lang" | "rate_bot_per_day" | "hide_secrets" | "channels_paused" | "shared_identity" | "max_channels")[] }` — The settings to change; null removes one. A channel or chat setting named here is refused 422 setting_invalid.
  - `channels_paused` — Stop every chat app of the Bot at once; each keeps its own enabled value.
  - `hide_secrets` — Hide the chat app's stored credentials from the agent's tools and, where the sandbox supports masks, from shells it starts afterwards (a shell without that support can still read them). Not a boundary: it does not stop root or sudo.
  - `lang` — Language of the channel's fixed lines (en, de, fr, es, pt, it, ja, zh). The Bot's own answers are not translated.
  - `max_channels` — Most chat apps the Bot may have (1 to 8).
  - `rate_bot_per_day` — Messages all chat apps of the Bot together may deliver per day (0 = no limit, up to 3000).
  - `shared_identity` — Whether several Bots may share one chat app. Only off is available.
  - `unset` — Settings to put back to their defaults.

### `bots.messages` (3) — Messages posted to a Bot

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/bots/{id}/messages/by-key/{key}` | Read a Bot message by its idempotency key. | `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/bots/{id}/messages` | Post a message to a Bot. | `H:Idempotency-Key` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/bots/{id}/messages/audio` | Post a spoken message to a Bot. | `H:Idempotency-Key` `H:X-Hoody-Realm` `?realm` `body*:multipart/form-data` |

**Param notes:**

- `Idempotency-Key` — Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key and text returns the same message_id and the message's current state, and queues nothing again; the same key with a different text, or one used through another door of the Bot, is 422; a key starting with "compat:" or "chan:" is 400. A key is remembered while its message is queued and for at least 24 hours after it was accepted. _(on `POST /api/v1/agent/bots/{id}/messages`)_
- `Idempotency-Key` — Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key and audio returns the same message_id and queues nothing again; the same key with other audio, or one used through another door of the Bot, is 422; a key starting with "compat:" or "chan:" is 400. _(on `POST /api/v1/agent/bots/{id}/messages/audio`)_

**Body shapes:**

- `POST /api/v1/agent/bots/{id}/messages` body — `{ text*: string }`
  - `text` — The message (at most 64 KiB).

### `changes` (2) — Changes operations

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/changes` | Change tokens for the Work lists. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/changes/stream` | Stream the change tokens (SSE). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |

### `completions` (2) — One-shot model completions

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/completions` | Run one tool-free model completion. | `body*` |
| `POST /api/v1/agent/completions/stream` | Run one tool-free model completion, streamed over SSE. | `body*` |

**Body shapes:**

- `POST /api/v1/agent/completions` body — `{ model*: string, system: string, messages*: { role*: "user" | "assistant", content*: string }[], settings: { thinking: object, temperature: number, max_tokens: int, response_format: object }, timeout_ms: int, max_tokens: int }` — One tool-free model call. Unknown members are refused at every level (400 bad_request, details.field names the JSON path). For every optional member, null is the same as absent.
  - `model` — … The same policy as a session's model: the provider prefix must be catalogued, the model name after it need not be (an uncatalogued name is sent to the provider, which may reject it as upstream_error). An unknown provider or an empty model name is 422 model_unavailable (reason unknown_model); a fusion/ composite is 422 model_unavailable (reason fusion).
  - `system` — Optional system prompt.
  - `messages` — 1 to 1000 turns, oldest first; the last must be a user turn.
  - `settings` — Optional per-call model settings. A setting the model cannot honour is 400 unsupported_setting, never dropped.
  - `timeout_ms` — Deadline for the whole call, 1 to 600000 ms (default 120000). Reaching it is 504 timeout (an error frame once streaming).
  - `max_tokens` — Alias of settings.max_tokens (output-token cap, 1 to 1000000), accepted at the top level as most chat-completion APIs take it. Sending both with different values is 400 bad_request (details.field max_tokens).
- `POST /api/v1/agent/completions/stream` body — `{ model*: string, system: string, messages*: { role*: "user" | "assistant", content*: string }[], settings: { thinking: object, temperature: number, max_tokens: int, response_format: object }, timeout_ms: int, max_tokens: int }` — One tool-free model call. Unknown members are refused at every level (400 bad_request, details.field names the JSON path). For every optional member, null is the same as absent.

### `computers` (1) — Computers in a realm

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/computers` | List computers in a realm (for binding). | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |

### `definitions` (13) — Chat agent definitions

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/agents/{name}/copy` | Copy a chat agent. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/agents` | Create a chat-agent definition. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `DELETE /api/v1/agent/agents/{name}` | Delete a custom chat agent. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/agents/{name}/source` | Read a chat agent's source. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/agents` | List chat-agent definitions. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/agents/{name}/rename` | Rename a chat agent. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/agents/{name}/reset-to-shipped` | Reset an agent to its shipped default. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `PATCH /api/v1/agent/agents/{name}/effort` | Set an agent's reasoning effort. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `PATCH /api/v1/agent/agents/{name}/model` | Set an agent's model. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `PUT /api/v1/agent/agents/{name}/source` | Write a chat agent's source. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `PATCH /api/v1/agent/agents/{name}/tools` | Set an agent's tool allow-list. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `PATCH /api/v1/agent/agents/{name}/turns` | Set an agent's max-turns. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/agents/{name}/tools/{tool}/toggle` | Toggle a single tool for an agent. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `tool` — The tool.

**Body shapes:**

- `POST /api/v1/agent/agents/{name}/copy` body — `{ new_name*: string }` — Destination name (the source {name} comes from the path).
  - `new_name` — Name for the copied agent.
- `POST /api/v1/agent/agents` body — `{ name*: string, frontmatter: { description: string, model: string, tools: string[], effort: "adaptive" | "low" | "medium" | "high" | "xhigh" | "max", max_turns: int, max_steps_per_turn: int, labels: string[], strict_tools: bool, mcp_tools: string[], skills: string[], prompt_blocks: object, ask_timeout: string | int, thinking: "enabled" | "disabled", temperature: number, response_format: "json_object", compaction: "same_prefix", compaction_max_tokens: int }, system_prompt: string }` — Chat-agent definition.
  - `name` — Agent name (the definition file stem).
  - `frontmatter` — … Any other key is rejected. strict_tools is a boolean: true gives the agent EXACTLY its tools list (no skill or workflow tool is added, no MCP tool unless mcp_tools names it, and a call to any other tool is refused), and with no tools list it gets only ask_question_to_user, todo_read, todo_write …
  - `system_prompt` — The agent's system prompt body.
- `POST /api/v1/agent/agents/{name}/rename` body — `{ new_name*: string }` — New agent name (the current {name} comes from the path).
  - `new_name` — New agent name.
- `PATCH /api/v1/agent/agents/{name}/effort` body — `{ effort*: "" | "adaptive" | "low" | "medium" | "high" | "xhigh" | "max" }` — New reasoning effort (the {name} comes from the path).
  - `effort` — The reasoning level; "" removes the line (the model's default).
- `PATCH /api/v1/agent/agents/{name}/model` body — `{ model*: string }` — New model line (the {name} comes from the path).
  - `model` — Model spec (e.g. anthropic/claude-opus-4-8); "" removes the frontmatter model line.
- `PUT /api/v1/agent/agents/{name}/source` body — `{ content*: string, expected_revision: string }` — New agent source (the {name} comes from the path).
  - `content` — … Frontmatter is read as one `key: value` per line: a `tools:` line must be a comma-separated list on that same line, because a YAML block list underneath it parses to NOTHING and the agent is then granted every tool (only the benign special tools when `strict_tools` is on), the opposite of the restriction it looks like. The turn cap is spelled `max_turns`; a `turns` line is ignored.
  - `expected_revision` — … A save whose source changed since is refused 409 revision_conflict (details.current_revision) and writes nothing. … The revision is bound to the realm this request resolves to: on a gateway without a realm pin, a revision read while another realm was active is refused 409 revision_conflict (details.current_revision is this realm's), never written into the other realm.
- `PATCH /api/v1/agent/agents/{name}/tools` body — `{ tools*: string[], none: bool }` — New tool allow-list (the {name} comes from the path).
  - `tools` — Tool names allowed for the agent; an empty list removes the line (= all tools, or only the benign specials for a strict_tools agent).
  - `none` — Optional: true, with an empty tools list, writes `tools: none`, so the agent has no tools at all. With a non-empty list it is refused 400 bad_request and nothing is written. Omitted or false: tools as above.
- `PATCH /api/v1/agent/agents/{name}/turns` body — `{ turns*: int }` — New max-turns value (the {name} comes from the path).
  - `turns` — Max agent turns per dispatch, 0 to 1000; 0 restores the default of 20.
- `POST /api/v1/agent/agents/{name}/tools/{tool}/toggle` body — `object` — No body fields are read; the agent {name} and {tool} come from the path, and each call flips the tool.

### `files` (1) — Files that shape the agents

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/agent-files` | List the files that shape the agents. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |

### `fusions` (3) — Fusion composites

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/agent/settings/fusion/{slug}` | Delete a fusion composite. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `GET /api/v1/agent/settings/fusion` | List fusion composites. | `?include_invalid` `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `PUT /api/v1/agent/settings/fusion/{slug}` | Create or update a fusion composite. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `body*` |

**Param notes:**

- `slug` — The slug.
- `include_invalid` — When true, also return composites that failed validation as a top-level `invalid` array beside `items` (each with a reason + raw-file index) so a broken composite is diagnosable. An entry with no usable slug, or a duplicate slug, cannot be deleted through this API: see the operation description.

**Body shapes:**

- `PUT /api/v1/agent/settings/fusion/{slug}` body — `{ spec*: { name*: string, method*: "best_of_n" | "vote" | "synthesize" | "debate", members*: object[], params: object } }` — The fusion composite spec.
  - `spec` — The fusion composite.

### `gates` (4) — Question gates waiting for a human

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/sessions/{id}/answer` | Answer a parked question gate. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/sessions/{id}/confirm` | Answer a parked confirm gate (on an always-approval session also --gate-id, --generation and the approver lease). | `H:X-Hoody-Approver-Lease` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/gates` | List the gates waiting for a human. | `?include_system` `?realm` `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `POST /api/v1/agent/sessions/{id}/answer:assist` | Propose answers for a parked question (helper model). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `include_system` — When true, also list the gates of daemon-owned system/resident sessions (as GET /api/v1/agent/sessions does).
- `realm` — The realm to list: "global" (gates not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. _(on `GET /api/v1/agent/gates`)_
- `limit` — Maximum items per page, at most 100: 0 or omitted means 100, and a larger value is served as 100 (meta.limit echoes the value used).

**Body shapes:**

- `POST /api/v1/agent/sessions/{id}/answer` body — `{ gate_id: string, generation: int, answer: string, text: string, answers: { [key: string]: string } }` — Question-gate answer. … A body with no answer, no text and no answers is 400 bad_request: nothing is sent and the question stays parked. gate_id/generation are echoes of the parked gate (a mismatch is 409).
  - `gate_id` — Echo of the parked gate id, as published on the frame that parked it (gate.id), by GET /api/v1/agent/sessions/{id} (pending_gate.id) and in 409 details. Valid only for the session in the path. Optional for compatibility, but an answer without it applies to whatever gate is parked when it arrives: a client binding an answer to a gate the user saw must send it. Ids are unique per session incarnation, so an id from before a re-attach never matches (stale/mismatch → 409).
  - `generation` — Optional echo of the parked gate generation. It restarts when the session is re-attached, so it is not an identity on its own: send gate_id.
  - `answer` — Free-form answer text. … The tool keeps at most five entries per array and truncates each string to 400 Unicode code points. …
  - `text` — Answer text used when answer is absent or blank. For a workflow question with options, answer names the option and text is that option's input (has_user_input); otherwise text is ignored when answer is set.
  - `answers` — Structured per-field answers for a multi-field question.
- `POST /api/v1/agent/sessions/{id}/confirm` body — `{ gate_id: string, generation: int, approved*: bool, reason: string, persist_dirs: bool, remember: bool, superseded: bool, session_scope: bool, trust_computer: bool, request_id: string, lease_generation: int }` — … On a session that requires approval on every action, gate_id and generation are required as well as approved, and once the session's approver lease was minted every decision also carries it in X-Hoody-Approver-Lease. gate_id/generation are echoes of the parked gate (a mismatch is 409). request_id is optional. approved is always required: a confirm without a boolean approved is rejected 400 (approved_required) and the gate stays parked. … On a session that requires approval on every action they are required too: a confirm missing any of them is rejected 400 and the gate stays parked.
  - `gate_id` — Echo of the parked gate id, as published on the frame that parked it (gate.id), by GET /api/v1/agent/sessions/{id} (pending_gate.id) and in 409 details. Valid only for the session in the path. Optional for compatibility, but an answer without it applies to whatever gate is parked when it arrives: a client binding an answer to a gate the user saw must send it. Ids are unique per session incarnation, so an id from before a re-attach never matches (stale/mismatch → 409). Required on a session that requires approval on every action: a confirm without it is rejected 400.
  - `generation` — Echo of the parked gate generation. It restarts when the session is re-attached, so it is not an identity on its own: send gate_id. Optional on a default-policy session; required, and non-zero, on a session that requires approval on every action.
  - `approved` — Required: true to approve, false to deny. There is no default; a missing, null or non-boolean value is rejected 400.
  - `reason` — Optional, with approved false only: why the action is refused. The agent reads it in the refused call's result, flattened to one line, together with the instruction not to reach the same effect another way. At most 500 characters; sent with approved true, or longer, it is rejected 400 bad_request.
  - `persist_dirs` — Persist an approved directory grant to settings.json (WS↔REST parity).
  - `remember` — … Omitted or true, approving a file change also lets later changes to that file run without asking for the rest of the session, and persist_dirs is honoured; false asks again for the next change and saves nothing to settings.json (persist_dirs is ignored).
  - `superseded` — With approved false only, and no reason or session_scope: the call is declined because the user sent a new message instead of answering. … Sent with approved true, a reason or session_scope, it is rejected 400 bad_request.
  - `session_scope` — Remember this decision for the rest of the session (the Allow/Deny for session answer): with approved true the tool stops asking, with approved false it is refused without asking. Offer allow-for-session only when the gate's event.confirm_request carried offer_session_allow. Under a locked approval policy the wider grant is refused, but the one-shot decision still applies and the reply says so (session_scope_applied false, note).
  - `trust_computer` — With approved true, accept the gate's exec_trust offer (event.confirm_request): the call runs and exec cards on that computer in this realm stop until the grant is revoked (POST /api/v1/agent/hooks/rules exec_trust). Ignored when the gate carried no offer or the approval policy is locked.
  - `request_id` — Optional: the caller's own id for this decision, at most 64 characters from A-Z, a-z, 0-9, '.', '_' and '-' (anything else is 400 bad_request). When this decision is the one the gate consumed, a later 409 gate_already_resolved for the gate echoes it as details.request_id, so a caller that lost the 200 knows the recorded decision is its own.
  - `lease_generation` — … A decision carrying the lease capability (X-Hoody-Approver-Lease) is checked against the current lease whatever it sends; without one, a stale generation is refused. …
- `POST /api/v1/agent/sessions/{id}/answer:assist` body — `{ mode: string, model: string, gen: int }` — Helper-model suggestion request (all optional).
  - `mode` — Suggestion mode (default "suggest").
  - `model` — Helper model override; empty uses the configured helper.
  - `gen` — Generation counter to correlate the suggestion event (echoed as event.question_suggestion gen).

### `github` (8) — GitHub auth, repos, clone, status, commit, sync, PRs

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/github/issues` | Open an issue. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/github/diff` | Read the working-tree diff. | `?staged` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/github/status` | GitHub working-tree status. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/github/issues` | List issues. | `?owner*` `?repo*` `?state` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/github/stash/pop` | Restore the most recent stash entry. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/github/stash` | Stash the working tree. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/github/sync` | Sync (fetch → pull → push). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/github/auth/active` | Switch the active GitHub account. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `staged` — When true, return the STAGED (index) diff (what a commit would record) instead of the unstaged working-tree diff. Defaults to false. Accepts true/1/yes/on; every other value, including an empty one, is false.
- `owner` — Repository owner (user or org login). Required: not derived from the bound checkout; GET /api/v1/agent/github/identity returns it.
- `repo` — Repository name without the owner. Required, same source as `owner`.
- `state` — Which issues to return: open (the default when omitted), closed, or all.

**Body shapes:**

- `POST /api/v1/agent/github/issues` body — `{ title*: string, body: string }` — The issue to create (the repository comes from the cwd scope).
  - `title` — The issue title (required, non-empty: the daemon refuses an empty title).
  - `body` — The issue body. Optional; an omitted body creates the issue with an empty description.
- `POST /api/v1/agent/github/stash/pop` body — `object` — No fields. The pop always targets the most recent entry (stash@{0}): there is no index selector over HTTP. Send an empty object.
- `POST /api/v1/agent/github/stash` body — `object` — No fields. The stash saves tracked changes and untracked files of the bound repository; ignored files stay in the working tree. There is no path selector, no message and no keep-index option over HTTP. Send an empty object.
- `POST /api/v1/agent/github/sync` body — `{ direction: string, set_upstream: bool, force: bool }` — The sync request.
  - `direction` — Optional: "pull" (fetch+pull) or "push" (push only). Default is the full fetch→pull→push.
  - `set_upstream` — Optional, default false: PUBLISH the current branch: push it and make it track the same-named branch on its remote. … Refused (502 sync_step_failed, step code upstream_exists) when the branch already tracks a DIFFERENT remote branch; a no-op when it already tracks exactly that one. …
  - `force` — Optional, default false. … The lease only refuses when the remote moved since this repository last fetched it, and the full sync fetches first, so on a full sync it protects almost nothing. … Ignored by the fetch and pull legs. Must be a JSON boolean.
- `POST /api/v1/agent/github/auth/active` body — `{ key*: string }` — The account to activate.
  - `key` — Account handle from GET /api/v1/agent/github/auth/status accounts[].key, e.g. "github.com/octocat".

### `github.auth` (4) — GitHub sign-in

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/github/auth/status` | GitHub auth status. | `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/github/auth/login` | Start a GitHub device-flow login (or add a PAT). | `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/github/auth/logout` | Remove a linked GitHub account. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/github/auth/login/poll` | Poll a GitHub device-flow login to completion. | `H:X-Hoody-Realm` `?realm` `body*` |

**Body shapes:**

- `POST /api/v1/agent/github/auth/login` body — `{ token: string, host: string, activate: bool }` — Optional login options. Supply `token` to add a PAT directly; omit it to start a device flow. Supply `host` for GitHub Enterprise (GHES).
  - `token` — Optional PAT. When present the login validates + persists this token (no device flow); never returned.
  - `host` — GitHub host for GitHub Enterprise (GHES); defaults to github.com. On the device flow it must match the host on the subsequent poll call; a login with a `token` completes in this one call.
  - `activate` — Whether the linked account becomes the ACTIVE one. … A non-boolean value is rejected.
- `POST /api/v1/agent/github/auth/logout` body — `{ key*: string }` — The account to remove.
  - `key` — Account handle from GET /api/v1/agent/github/auth/status accounts[].key, e.g. "github.com/octocat".
- `POST /api/v1/agent/github/auth/login/poll` body — `{ host: string, device_code*: string, interval: int, expires_in: int, activate: bool }` — The device-flow handle the start reply returned.
  - `host` — The GitHub host (default github.com); must match the start call.
  - `device_code` — The device_code returned by POST /api/v1/agent/github/auth/login.
  - `interval` — The poll interval (seconds) the start reply returned.
  - `expires_in` — The device-code lifetime (seconds) the start reply returned.
  - `activate` — Whether the account this poll links becomes the ACTIVE one. Defaults to FALSE: the credential is stored without changing which account your next push authenticates as. This is where a DEVICE-flow login activates: the same flag on POST /api/v1/agent/github/auth/login applies only to its PAT branch. …

### `github.branches` (5) — GitHub branches

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/github/branch` | Create a branch. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/github/branch/delete` | Force-delete a local branch. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/github/remote-branch` | Read a branch's head on GitHub. | `?owner*` `?repo*` `?branch*` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/github/branches` | List GitHub branches. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/github/branch/switch` | Switch to an existing branch. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `owner` — Repository owner (user or org login), e.g. "octocat". Required: it is NOT derived from the bound checkout; GET /api/v1/agent/github/identity returns it.
- `repo` — Repository name without the owner, e.g. "Hello-World". Required, same source as `owner`.
- `branch` — Branch name without refs/heads/, e.g. "feature/login". Required; matched exactly, never as a prefix.

**Body shapes:**

- `POST /api/v1/agent/github/branch` body — `{ branch*: string }` — The branch to create (cwd-scoped).
  - `branch` — The new branch name (required). Validated as a safe ref name before it reaches git: a leading dash, a whitespace/control character, or a name git itself would reject is refused with a 400.
- `POST /api/v1/agent/github/branch/delete` body — `{ branch*: string }` — The branch to delete (the repository comes from the cwd scope).
  - `branch` — The local branch name (required), as GET /api/v1/agent/github/branches reports it. Passed after `--`, so it is never read as an option.
- `POST /api/v1/agent/github/branch/switch` body — `{ branch*: string }` — The branch to switch to (cwd-scoped).
  - `branch` — An existing branch name (required), as GET /api/v1/agent/github/branches reports it. Validated as a safe ref name; the switch fails rather than creating a branch that does not exist.

### `github.commits` (4) — GitHub commits

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/github/commit` | Stage all and commit. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/github/commit/push` | Stage all, commit and push. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/github/log` | Read recent commit history. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/github/commit/suggest-message` | Draft a commit message with a model. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |

**Body shapes:**

- `POST /api/v1/agent/github/commit` body — `{ message*: string }` — The commit request (cwd-scoped).
  - `message` — The commit message.
- `POST /api/v1/agent/github/commit/push` body — `{ message*: string, set_upstream: bool, force: bool }` — The commit message and push options (the repository comes from the cwd scope).
  - `message` — The commit message (required, non-blank).
  - `set_upstream` — Optional, default false: publish the current branch: push it and make it track the same-named branch on its remote. Refused with 409 upstream_exists (details.committed when a commit landed) when the branch already tracks a DIFFERENT remote branch.
  - `force` — Optional, default false. Force-pushes with `git push --force-with-lease`, OVERWRITING the remote branch's history: remote commits the local branch lacks are discarded. No confirmation round. Must be a JSON boolean.
- `POST /api/v1/agent/github/commit/suggest-message` body — `{ model*: string }` — The model to draft with (the repository comes from the cwd scope).
  - `model` — A concrete model spec, e.g. "anthropic/claude-sonnet-4-6" (required). A fusion/ composite cannot back a one-shot call and is refused.

### `github.prs` (4) — GitHub pull requests

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/github/pr/checkout` | Check out a pull request. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/github/pr` | Open a pull request. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/github/pr` | List pull requests. | `?owner*` `?repo*` `?state` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/github/pr/merge` | Merge a pull request. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `owner` — Repository owner (user or org login), e.g. "octocat". Required: it is NOT derived from the bound checkout; GET /api/v1/agent/github/identity returns it.
- `repo` — Repository name without the owner, e.g. "Hello-World". Required, same source as `owner`.
- `state` — Which pull requests to return: open (the default when omitted), closed, or all. An unrecognized value is passed through to GitHub, which rejects it.

**Body shapes:**

- `POST /api/v1/agent/github/pr/checkout` body — `{ number*: string | int }` — The pull request to check out (cwd-scoped).
  - `number` — The PR number (required): a positive decimal string such as "42", or the JSON integer GET /api/v1/agent/github/pr returns. An empty value, 0, a fraction, a negative or anything non-numeric is refused, so a branch name or URL can never be smuggled in as a target.
- `POST /api/v1/agent/github/pr` body — `{ title*: string, body: string, base: string }` — The pull-request request.
  - `title` — The PR title (required, non-empty).
  - `body` — The PR description.
  - `base` — Optional base branch (default the repo default).
- `POST /api/v1/agent/github/pr/merge` body — `{ number*: string | int, method: "merge" | "squash" | "rebase" }` — The pull request to merge (the repository comes from the cwd scope).
  - `number` — The PR number (required): a positive decimal string such as "42", or the JSON integer GET /api/v1/agent/github/pr returns. Anything else (0, a fraction, a branch name or URL) is refused, so the merge can never target a different PR.
  - `method` — Optional merge method, default merge (a merge commit). squash squashes the PR into one commit; rebase rebases its commits onto the base.

### `github.repos` (4) — GitHub repositories

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/github/clone` | Clone a GitHub repository. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `GET /api/v1/agent/github/repos` | List GitHub repos. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/github/identity` | Resolve the bound repository's owner/name. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/github/repo/reconnect` | Re-write a checkout's GitHub credential. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |

**Body shapes:**

- `POST /api/v1/agent/github/clone` body — `{ repo: string, dir: string, clone_root: string, full_name: string, clone_url: string, shallow: bool, flat: bool, persist_credentials: bool }` — The clone request. … At least one form is required; a request with NEITHER is rejected. …
  - `repo` — The repository to clone: "owner/name" or an https github URL (https://<host>/<owner>/<name>[.git]). Translated to full_name + clone_url against the active account host. Supply this OR the canonical full_name+clone_url; if both, the canonical fields win.
  - `dir` — Optional managed clone root override; the traversal-safe parent/dest are derived under it.
  - `clone_root` — Canonical form of `dir`; wins when both are sent.
  - `full_name` — Canonical "owner/name" (alternative to `repo`; used as-is when supplied, taking precedence over a derived value). Requires clone_url.
  - `clone_url` — Canonical https clone URL (alternative to `repo`; re-validated against the active account host; takes precedence over a derived value). Requires full_name.
  - `shallow` — Shallow clone (default true).
  - `flat` — Optional, default false. true clones to <root>/<name> instead of <root>/<owner>/<name>. An existing checkout at that path is reused only when its origin is the same repository; anything else there is refused. Must be a JSON boolean.
  - `persist_credentials` — … Must be a JSON boolean.
- `POST /api/v1/agent/github/repo/reconnect` body — `object` — No fields. The checkout is the one the X-Hoody-* scope headers select. Send an empty object.

### `github.worktrees` (3) — Linked worktrees

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/github/worktrees` | Add a linked worktree. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/github/worktrees/remove` | Remove a linked worktree. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/github/worktrees` | List linked worktrees. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |

**Body shapes:**

- `POST /api/v1/agent/github/worktrees` body — `{ path*: string, branch: string, start_ref: string }` — The worktree to add (the repository comes from the cwd scope).
  - `path` — Where to create the worktree (required). Lexically validated and checked against the session's deny list before git runs; a traversing or deny-listed path is refused with a 400. Must not already exist as a non-empty directory.
  - `branch` — Optional NEW branch to create for this worktree (git's -b). Validated as a safe ref name. …
  - `start_ref` — Optional ref the worktree starts from: a branch, tag or commit. Validated as a safe ref name. With `branch` it is the new branch's start point (default: the current HEAD); without `branch` it is the ref to check out.
- `POST /api/v1/agent/github/worktrees/remove` body — `{ path*: string, force: bool }` — The worktree to remove (the repository comes from the cwd scope).
  - `path` — The worktree's path (required), as GET /api/v1/agent/github/worktrees reports it. Must not be the main checkout.
  - `force` — Optional, default false. Removes the worktree EVEN WITH uncommitted or untracked changes (git worktree remove --force), DISCARDING them: they are not stashed and cannot be recovered. Must be a JSON boolean.

### `headless` (1) — One-shot headless agent runs

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/headless/runs` | Create a headless one-shot run. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |

**Body shapes:**

- `POST /api/v1/agent/headless/runs` body — `{ prompt: string, workflow: string, inputs: { [key: string]: string }, model: string, format: string, stream: bool, timeout_ms: int }` — The one-shot run request. SECURITY: write-permission is hard-wired OFF and dir-scope is home (no caller opt-in over this surface); but bash/exec are NOT write-gated, so reaching this surface grants RCE: access is decided by the computer's proxy permission policy.
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
| `POST /api/v1/agent/hooks/begin-write` | Begin a hook write (nonce). | `?session_id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `DELETE /api/v1/agent/hooks` | Delete a hook. | `?session_id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/hooks/toggle` | Toggle a hook. | `?session_id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/hooks/disable-all` | Disable all hooks. | `?session_id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/hooks/rules` | Get the tool-call rules. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/hooks` | List hooks. | `?session_id*` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/hooks/reload` | Reload hooks from disk. | `?session_id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/hooks/test` | Run a hook command now, or dry-run a shipped hook. | `?session_id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/hooks/rules` | Set the tool-call rules. | `?session_id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/hooks/trust/ack` | Acknowledge hook trust. | `?session_id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `PUT /api/v1/agent/hooks` | Upsert a hook. | `?session_id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `session_id` — Live session id, as an alternative to the body's `session_id`. When the body carries a non-empty `session_id`, that value is used and this parameter is ignored; otherwise this value, trimmed of surrounding spaces, is used. _(on `POST /api/v1/agent/hooks/begin-write`, `DELETE /api/v1/agent/hooks`, `POST /api/v1/agent/hooks/toggle` +6 more)_
- `session_id` — Live session id (hooks are session-scoped). Without one the call is refused. _(on `GET /api/v1/agent/hooks`)_

**Body shapes:**

- `POST /api/v1/agent/hooks/begin-write` body — `{ session_id: string, op*: "upsert" | "delete" | "toggle" | "set_disabled" | "rules_set", scope*: string }` — Write target: session, op, and scope the nonce binds to.
  - `session_id` — Live session id (hooks are session-scoped). Required, either here or as the `session_id` query parameter; a non-empty value here wins over the query.
  - `op` — The write the nonce authorizes: upsert (PUT /api/v1/agent/hooks), delete (DELETE /api/v1/agent/hooks), toggle (POST /api/v1/agent/hooks/toggle), set_disabled (POST /api/v1/agent/hooks/disable-all) or rules_set (POST /api/v1/agent/hooks/rules). The nonce is rejected by any other op.
  - `scope` — Scope of the settings file the write targets (e.g. project/user); the nonce binds to its resolved path.
- `DELETE /api/v1/agent/hooks` body — `{ session_id: string, nonce*: string, scope*: "user" | "project" | "local", event*: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", matcher: string, command: string, matcher_index: int, index: int }` — Hook identity + the begin-write nonce (op:delete).
  - `nonce` — The single-use write nonce from POST /api/v1/agent/hooks/begin-write minted for op:delete + this scope; the RPC fails closed without it.
  - `scope` — Scope of the settings file to write: user, project or local. It must match the nonce's scope.
  - `event` — Lifecycle event of the hook to remove; required: the daemon rejects any value outside the enum.
  - `matcher` — Matcher of the hook to remove, exactly as GET /api/v1/agent/hooks reports it. Omit it (or pass "*") to address the wildcard group.
  - `command` — Command text of the entry to remove (exact match). Omitting it removes EVERY command in the matched event+matcher group. With `index`, required: the command exactly as GET /api/v1/agent/hooks lists it, marks included.
  - `matcher_index` — With `index`: the place of the hook's matcher group in its settings file's list for `event`, as GET /api/v1/agent/hooks reports it on a hook disabled for hidden characters. Send both or neither.
  - `index` — With `matcher_index`: the place of the hook in its matcher group, as GET /api/v1/agent/hooks reports it on a hook disabled for hidden characters. Only such a hook is removed this way.
- `POST /api/v1/agent/hooks/toggle` body — `{ session_id: string, nonce*: string, scope: "user" | "project" | "local", shipped_id: string, enabled: bool, event: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", matcher: string, command: string, disabled: bool }` — The begin-write nonce (op:toggle) + the session/scope it binds to, plus the operation's own fields.
  - `nonce` — The single-use write nonce from POST /api/v1/agent/hooks/begin-write minted for op:toggle + this scope; the RPC fails closed without it.
  - `scope` — Scope of the settings file to write: user, project or local. It must match the nonce's scope. A shipped-hook toggle (shipped_id) does not need it: it always writes the first settings layer.
  - `shipped_id` — Id of a SHIPPED (catalogue) hook to toggle. Selects the shipped branch: pair it with `enabled` and send no event/matcher/command.
  - `enabled` — New state for the shipped hook named by `shipped_id` (true records it in the first settings layer; false removes the key, reverting to the catalogue default). Absent, or a value that is not a boolean, reads as false (disable). Ignored on the ordinary-hook branch: that branch uses `disabled`.
  - `event` — Lifecycle event of the ordinary hook to toggle; required on that branch (with matcher + command).
  - `matcher` — Matcher of the ordinary hook to toggle, exactly as GET /api/v1/agent/hooks reports it (omit, or "*", for the wildcard group).
  - `command` — Command text of the ordinary hook to toggle (exact match); required on that branch: a toggle must resolve to an existing entry.
  - `disabled` — New state for the ordinary hook: true disables the entry, false enables it. Absent, or a value that is not a boolean, reads as false (enable). Ignored on the shipped branch: that branch uses `enabled`.
- `POST /api/v1/agent/hooks/disable-all` body — `{ session_id: string, nonce*: string, scope*: "user" | "project" | "local", value*: bool }` — The begin-write nonce (op:set_disabled) + the session/scope it binds to, plus the operation's own fields.
  - `nonce` — The single-use write nonce from POST /api/v1/agent/hooks/begin-write minted for op:set_disabled + this scope; the RPC fails closed without it.
  - `value` — New kill-switch state: true disables all hooks in this scope, false clears the setting and re-enables them. Required: a missing or non-boolean value is refused with 400 bad_request and nothing is written.
- `POST /api/v1/agent/hooks/reload` body — `{ session_id: string }` — Optional session the reload reports on.
  - `session_id` — Optional: without it every live session in a realm the login serves reloads its own hooks, sessions counts those, and the reply has no summary; with it only that session reloads (it must be visible to the caller), sessions is 1, and the reply adds its summary.
- `POST /api/v1/agent/hooks/test` body — `{ session_id: string, shipped_id: string, event: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", match_value: string, command: string, timeout: int, exit_code: int, payload: object }` — Live session the op resolves against, plus the operation's own fields.
  - `shipped_id` — Id of a SHIPPED (catalogue) hook to DRY-RUN. Selects the predicate-only branch: nothing is executed and `event` is not consulted.
  - `event` — Lifecycle event to fire. Required on every branch except the shipped dry-run; the daemon rejects any value outside the enum.
  - `match_value` — Value the saved hooks' matchers are evaluated against (e.g. the tool name for PreToolUse). Ignored when `command` supplies an inline hook.
  - `command` — On the ordinary branch: an unsaved command to run INLINE now (this executes it) instead of the saved matching hooks. On the shipped branch: the sample command the trigger predicate is evaluated against (defaults to a representative failing invocation).
  - `timeout` — Timeout in whole seconds for an inline `command` (positive integers only; a fractional or non-positive value is ignored rather than truncated). Hard-capped at 60s per command: a larger value, an ignored one, and a saved hook's own longer timeout are all clamped to the 60s test ceiling. A call that fires several saved hooks runs them one after another and ends after at most 120 seconds.
  - `exit_code` — Exit code of the sample command on the shipped dry-run branch (default 2).
  - `payload` — Extra fields merged into the hook's stdin JSON. The daemon stamps session_id, cwd, hook_event_name and hook_test itself: values supplied here for those keys are overwritten.
- `POST /api/v1/agent/hooks/rules` body — `{ session_id: string, nonce*: string, scope*: "user" | "project" | "local", rules: { id*: string, text*: string, kind*: "limit" | "check_in" | "guidance" | "playbook", tools: string[], agents: string[], when: string[] }[], timeout_ms: int, exec_trust: { computer_id*: string, realm*: string, name: string, granted_at: string, source: "card" | "rules_panel" }[], expected_revision: string }` — The begin-write nonce (op:rules_set) + the session/scope it binds to, plus the operation's own fields.
  - `nonce` — The single-use write nonce from POST /api/v1/agent/hooks/begin-write minted for op:rules_set + this scope; the RPC fails closed without it.
  - `rules` — The complete rule list for the scope (at most 32 checked and 32 guidance/playbook rules; ids unique). An empty array removes the scope's rules.
  - `timeout_ms` — Optional: the scope's Jev budget for one rules check, 100 to 120000 ms; 0 removes it (back to the default 3000). Omit to leave it unchanged. This is the only way to write rules_timeout_ms.
  - `exec_trust` — Optional: the COMPLETE list of per-computer exec trust grants, replacing the scope's (at most 64 rows, each (computer_id, realm) once, validated all-or-nothing); [] revokes every grant. Accepted only for the user scope (the realm's profile, or the X-Hoody-Config-Dir override); any other scope is 400. …
  - `expected_revision` — … When it no longer matches the scope file (another tab, a hand edit, a timeout change), the write is refused with 409 revision_conflict, nothing is written, and details.current_revision carries the current value: re-read, re-apply the change, begin a new write (the refused call used up its nonce) and retry. … The revision is bound to the realm of the session it is read and written through, so a revision read through another realm's session is refused 409 revision_conflict, on a gateway with or without a realm pin.
- `POST /api/v1/agent/hooks/trust/ack` body — `{ session_id: string, hash*: string, high_risk: bool }` — Live session the op resolves against, plus the operation's own fields.
  - `hash` — The trust hash being acknowledged, from the GET /api/v1/agent/hooks `trust.hash`. Required and non-empty; a hash that no longer matches the live hook config is rejected (anti-TOCTOU).
  - `high_risk` — Acknowledge the elevated-risk grant rather than the ordinary one. The grant KIND is still derived server-side from the reviewed snapshot: this flag cannot widen it.
- `PUT /api/v1/agent/hooks` body — `{ session_id: string, nonce*: string, scope*: "user" | "project" | "local", event*: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", matcher: string, command*: string, timeout: int, name: string, description: string, when: string[] }` — Hook definition + the begin-write nonce (op:upsert).
  - `nonce` — The single-use write nonce from POST /api/v1/agent/hooks/begin-write minted for op:upsert + this scope; the RPC fails closed without it.
  - `event` — Lifecycle event the hook fires on; part of the hook's identity triple. Required: the daemon rejects any value outside the enum.
  - `matcher` — Matcher selecting when the hook fires (a tool name, a Claude Code alias such as Bash/Edit, or a regex); part of the identity triple. Omit it (or pass "*") for the wildcard group.
  - `command` — Command to run when the hook fires; part of the identity triple. Required and non-empty: a different command text addresses a DIFFERENT hook.
  - `timeout` — Per-fire timeout in whole seconds (optional; non-negative whole numbers only: a fractional or negative value is refused, and anything above 86400 (24h) is clamped to it). … Two ceilings override this value at fire time: SessionEnd is always capped at 60s so a hook cannot wedge daemon shutdown, and every fire through POST /api/v1/agent/hooks/test is capped at 60s.
  - `name` — … CONDITIONALLY required: a NEW hook (an identity triple event+matcher+command not yet in the settings) is refused 400 without it; on an UPDATE of an existing hook omit it to preserve the stored value. Not in the schema's required list only because of the update case. A character displays hide (a control, bidi or zero-width character, or a soft hyphen) is refused 400, as in command.
  - `description` — Short description of what the hook does. CONDITIONALLY required exactly like name: a NEW hook is refused 400 without it; omit on update to preserve. It may hold tabs and newlines; any other character displays hide is refused 400, as in command.
  - `when` — Optional condition; Stop and SubagentStop hooks only (a condition on any other event is refused 400 bad_request and nothing is written). Up to 8 atoms, checked left to right over the calls the acting agent made in its current turn: `+names` means such a call happened (after the previous `+` atom's match), `-names` means none happened since. names is a tool name, `a|b` (at most 8), or `*`; Claude Code aliases such as Bash are accepted and cover their whole set of tools. … An invalid condition is refused 400 bad_request and nothing is written. …

### `jev` (6) — Jev, the decision helper

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/jev/decide` | Ask Jev to decide. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `body*` |
| `POST /api/v1/agent/sessions/{id}/jev/decide` | Ask Jev to decide on behalf of a session. | `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/jev/settings` | Read the Jev settings. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/jev/models` | List the models Jev can use. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `POST /api/v1/agent/jev/test` | Test Jev with one tiny decision. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `body` |
| `PUT /api/v1/agent/jev/settings` | Change the Jev settings. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body` |

**Body shapes:**

- `POST /api/v1/agent/jev/decide` body — `{ state*: string | object | (string | number | bool | object | null)[], questions*: { [key: string]: object }, model: string, timeout_ms: int, provider: object, session_id: string, trace: object, user: string, x_session_id: string }` — A Jev decision request. `state` (required) is what the questions are about: a string, a JSON object or a JSON array.
  - `state` — What the questions are about: a string, a JSON object or a JSON array (never null, a number or a boolean). Passed to the provider as is. Array elements are not checked: the schema lists the scalar and object forms, and a nested array is accepted too.
  - `questions` — Question name → {type: noul|choice|score, instructions, criteria}. At least one.
  - `model` — Provider/model spec to use instead of the effective model. hoody/hoody-decide and hoody-decide (any case) mean hoody-ai/hoody-decide.
  - `timeout_ms` — Budget for this call in milliseconds (100 to 120000), the one retry included.
  - `provider` — Sent only when the model's provider forwards routing extras; on any other provider it is not sent and is named in the reply's `ignored_fields`. Provider routing preferences.
  - `session_id` — Sent only when the model's provider forwards routing extras; on any other provider it is not sent and is named in the reply's `ignored_fields`. Session grouping id (up to 256 characters).
  - `trace` — Sent only when the model's provider forwards routing extras; on any other provider it is not sent and is named in the reply's `ignored_fields`. Trace configuration.
  - `user` — Sent only when the model's provider forwards routing extras; on any other provider it is not sent and is named in the reply's `ignored_fields`. End-user id (up to 256 characters).
  - `x_session_id` — Sent only when the model's provider forwards routing extras; on any other provider it is not sent and is named in the reply's `ignored_fields`. Sent as the x-session-id header.
- `POST /api/v1/agent/sessions/{id}/jev/decide` body — `{ state*: string | object | (string | number | bool | object | null)[], questions*: { [key: string]: object }, model: string, timeout_ms: int, provider: object, session_id: string, trace: object, user: string, x_session_id: string }` — A Jev decision request. `state` (required) is what the questions are about: a string, a JSON object or a JSON array.
- `POST /api/v1/agent/jev/test` body — `{ model: string }` — Optional. An empty body tests the effective model.
  - `model` — A provider/model spec to test instead of the effective model. hoody/hoody-decide and hoody-decide (any case) mean hoody-ai/hoody-decide.
- `PUT /api/v1/agent/jev/settings` body — `{ enabled: bool, model: string, timeout_ms: int }` — The fields to change.
  - `enabled` — Whether Jev calls are allowed (default true). When false every decide/test call fails with jev_disabled.
  - `model` — Provider/model spec, e.g. hoody-ai/hoody-decide or typesafe/jev-latest. hoody/hoody-decide and hoody-decide (any case) are stored as hoody-ai/hoody-decide. "" returns to the derived default.
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
| `GET /api/v1/agent/version` | Agent API version and capabilities. |  |

### `logs` (6) — Structured log query and read

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/logs/export` | Export logs as a downloadable file. | `?source` `?min_level` `?comp` `?session_id` `?text` `?since` `?until` `?event` `?tool` `?model` `?status` `?method` `?min_status` `?max_status` `?errors_only` `?event_type` `?resource_type` `?computer` `?kind` `?host` `?since_seq` `?limit` `?format` `?filename` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `GET /api/v1/agent/logs/entries/{ref}` | Read a log entry. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `GET /api/v1/agent/logs/stats` | Log statistics. | `?source` `?level` `?run_id` `?bucket` `?min_level` `?comp` `?session_id` `?text` `?since` `?until` `?event` `?tool` `?model` `?status` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `GET /api/v1/agent/logs` | Query logs. | `?source` `?level` `?session_id` `?run_id` `?since` `?until` `?since_seq` `?before_seq` `?limit` `?min_level` `?comp` `?text` `?event` `?tool` `?model` `?status` `?method` `?min_status` `?max_status` `?errors_only` `?event_type` `?resource_type` `?computer` `?kind` `?host` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `GET /api/v1/agent/logs/sources` | Log sources. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `GET /api/v1/agent/logs/stream` | Stream the log tail (SSE). | `?source` `?level` `?session_id` `?run_id` `?since_seq` `?limit` `?min_level` `?comp` `?text` `?event` `?tool` `?model` `?status` `H:Last-Event-ID` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |

**Param notes:**

- `source` — Log source to export (see GET /api/v1/agent/logs/sources; one local source, one platform source, or omitted for all local sources). _(on `GET /api/v1/agent/logs/export`)_
- `min_level` — Minimum log level (debug|info|warn|error).
- `comp` — Component filter (daemon source).
- `session_id` — Session id filter. _(on `GET /api/v1/agent/logs/export`, `GET /api/v1/agent/logs/stats`)_
- `text` — Case-insensitive substring filter over message+attrs.
- `since` — Lower time bound (RFC3339 or relative like 1h/7d). _(on `GET /api/v1/agent/logs/export`, `GET /api/v1/agent/logs/stats`)_
- `until` — Upper time bound (RFC3339 or relative). _(on `GET /api/v1/agent/logs/export`, `GET /api/v1/agent/logs/stats`)_
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
- `computer` — Computer filter (proxy source; empty = all running realm computers). Maps to the daemon's computer_id filter.
- `kind` — Proxy row kind: request|response|event (proxy source).
- `host` — Proxy URL host filter (exact or dot-aligned suffix).
- `since_seq` — Exclusive lower seq bound for incremental exports (local sources). _(on `GET /api/v1/agent/logs/export`)_
- `limit` — TOTAL row cap across the export (local sources default: everything the snapshot matches). A platform source exports one query page: it asks for this many rows (2000 when omitted) and gets at most the source's own page maximum (activity 100, events 500); proxy with no computer merges the running computers' pages up to this cap. _(on `GET /api/v1/agent/logs/export`)_
- `format` — Export format: jsonl (default) or txt.
- `filename` — Download filename override (reduced to a safe basename).
- `ref` — The ref.
- `source` — Count one local source (daemon|tool|session|llm); omitted, every local source. A platform source is rejected 400. _(on `GET /api/v1/agent/logs/stats`)_
- `level` — Filter to a minimum log level (debug|info|warn|error); the same filter as min_level.
- `run_id` — Only entries correlated with this workflow/task run id. _(on `GET /api/v1/agent/logs/stats`, `GET /api/v1/agent/logs/stream`)_
- `bucket` — Histogram step: minute (the default) or hour.
- `source` — Filter to a log source/facet (see GET /api/v1/agent/logs/sources). One local source, or exactly ONE platform source (activity|events|proxy); mixing them is rejected. _(on `GET /api/v1/agent/logs`)_
- `session_id` — Only entries correlated with this session id (exact match on the entry's session_id). _(on `GET /api/v1/agent/logs`)_
- `run_id` — Only entries correlated with this workflow/task run id (exact match on the entry's run_id). _(on `GET /api/v1/agent/logs`)_
- `since` — Lower TIME bound: RFC3339, or a relative duration like "1h"/"30m"/"7d". This is NOT a cursor: a bare non-zero number is rejected 400 (use since_seq); 0, +0 and -0 mean now. Unparseable values are rejected the same way. _(on `GET /api/v1/agent/logs`)_
- `until` — Upper TIME bound, same forms as since. Paging BACKWARDS by repeatedly lowering until works, but it is coarse (rows sharing a timestamp repeat); before_seq is the exact backwards cursor. _(on `GET /api/v1/agent/logs`)_
- `since_seq` — Forward cursor: return only entries NEWER than this gateway seq. A page holds the NEWEST matches up to limit: when more than limit rows matched since the cursor, the older ones are not returned and latest_seq moves past them. To follow the log use GET /api/v1/agent/logs/stream (it resumes from since_seq, oldest first, and sends a `lagged` event with `replay_gap` when entries were evicted before it could read them: reconcile from the `min_seq` it carries); to read history, page backwards with before_seq. A non-numeric value is rejected 400. _(on `GET /api/v1/agent/logs`)_
- `before_seq` — Backward cursor: return only entries OLDER than this seq. Take it from the SEQ OF THE OLDEST ENTRY THIS PAGE RETURNED, not from oldest_seq, which is the oldest sequence still retained in the ring and is usually far older than the page you just read. Paging back from oldest_seq jumps past every entry in between and returns an empty page, which reads as "history exhausted" when it is not. A non-numeric value is rejected 400.
- `limit` — Caps this page. Local sources: omitted it is 200; ANY explicit value is clamped to the ring maximum of 500, and limit=0 means 500 rather than 200: a caller that needs more than 500 rows pages backwards with before_seq. activity takes at most 100 (default 50) and events at most 500 (default 100). A non-numeric value is rejected 400. _(on `GET /api/v1/agent/logs`)_
- `source` — Filter the tail to one local source (daemon|tool|session|llm). A platform source is rejected 400. _(on `GET /api/v1/agent/logs/stream`)_
- `session_id` — Only entries correlated with this session id. _(on `GET /api/v1/agent/logs/stream`)_
- `since_seq` — Initial resume cursor (the Last-Event-ID header overrides it). A non-numeric value is rejected 400. _(on `GET /api/v1/agent/logs/stream`)_
- `limit` — Caps each poll batch. A non-numeric value is rejected 400. _(on `GET /api/v1/agent/logs/stream`)_
- `Last-Event-ID` — SSE resume cursor: the gateway int64 seq to resume from; OVERRIDES the ?since_seq query param. Sent automatically by an SSE client on reconnect.

### `loops` (5) — Recurring self-paced agent loops

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/sessions/{id}/loops` | Create a loop. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `DELETE /api/v1/agent/sessions/{id}/loops/{loopId}` | Delete a loop. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body` |
| `GET /api/v1/agent/loops` | List loops across all sessions. | `?realm` `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `POST /api/v1/agent/sessions/{id}/loops/{loopId}/run-now` | Run a loop immediately. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/loops/{loopId}` | Update a loop. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `realm` — The realm to list: "global" (loops not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. _(on `GET /api/v1/agent/loops`)_

**Body shapes:**

- `POST /api/v1/agent/sessions/{id}/loops` body — `{ prompt*: string, interval*: string, max_runs: int, stop_when: { kind: "expression" | "toolCall" | "judgeRef" | "convergence", expr: string, tool: string, check: string, judge: string, args: object, threshold: number, min_iters: int, allow_network: bool }, max_cost_usd: number, max_wall_ms: int, expires_in: string, fire_now: bool }` — Loop definition (the session_id comes from the path).
  - `prompt` — The prompt fired each loop run.
  - `interval` — Run interval as a duration token, for example "30m". Required, with no default: a create without it is rejected. The minimum accepted interval is 60 seconds: a shorter one is refused rather than rounded up.
  - `max_runs` — Stop after this many runs. Omitted, 0 or negative applies the default ceiling of 50 runs; there are no unbounded loops.
  - `stop_when` — Optional stop predicate, evaluated after each run. Omit the field entirely when there is no predicate: a string value is rejected, and that includes the empty string.
  - `max_cost_usd` — Cost ceiling in USD, a number >= 0. 0 or absent means unlimited. … A value that is not a JSON number (a string such as "5", true or null) or is negative is refused with 400 bad_request.
  - `max_wall_ms` — Wall-clock ceiling, as a whole number of milliseconds from 0 up to (not including) 2^63. 0 or absent means unlimited. Any other value (a string such as "2h", a fraction, a negative number, true or null) is refused with 400 bad_request.
  - `expires_in` — … Without fire_now an expiry shorter than one interval is rejected, because the loop would never fire; with fire_now it must be at least 2 seconds, so the immediate first run can happen.
  - `fire_now` — Run the first fire on the next scheduler tick instead of one interval out; later fires keep the normal cadence. Default false.
- `DELETE /api/v1/agent/sessions/{id}/loops/{loopId}` body — `object` — JSON object of the operation's fields. Every `_`-prefixed key is ignored, and scope fields sent in the body (cwd, config_dir, computer, realm) are removed: a route that uses the request scope takes cwd and config_dir from the scope headers. …
- `POST /api/v1/agent/sessions/{id}/loops/{loopId}/run-now` body — `object` — No body fields are read; the session id and loop id come from the path.
- `PATCH /api/v1/agent/sessions/{id}/loops/{loopId}` body — `{ paused: bool, expires_in: string, max_cost_usd: number, max_wall_ms: int, if_state: string, if_max_cost_usd: number, if_max_wall_ms: int }` — Exactly one update intent: run state, expiry, or budget.
  - `paused` — Run-state intent (true pauses, false resumes).
  - `expires_in` — Expiry intent: a duration-from-now token, e.g. "2h"; "" or "never" clears it.
  - `max_cost_usd` — … A budget update sets both ceilings: sent without max_wall_ms, it also sets the wall-clock ceiling to 0 (unlimited). A value that is not a JSON number (a string such as "5", true or null) or is negative is refused with 400 bad_request, and nothing changes.
  - `max_wall_ms` — … Any other value (a string such as "2h", a fraction, a negative number, true or null) is refused with 400 bad_request, and nothing changes. A budget update sets both ceilings: sent without max_cost_usd, it also sets the cost ceiling to 0 (unlimited).
  - `if_state` — Precondition (any intent): the loop's state as listed (running, firing, paused, error, expired, stopped, ended). When the loop is not in it now, nothing changes and the answer is 409 loop_changed. if_state stopped with the budget fields starts a stopped loop again only if it is still stopped.
  - `if_max_cost_usd` — Precondition (any intent): the loop's cost ceiling as listed (0 = none). When it differs now, nothing changes and the answer is 409 loop_changed.
  - `if_max_wall_ms` — Precondition (any intent): the loop's wall-clock ceiling in ms as listed (0 = none). When it differs now, nothing changes and the answer is 409 loop_changed.

### `mcp` (9) — Mcp operations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/mcp/write-intents` | Begin an MCP config write. | `?session_id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `DELETE /api/v1/agent/mcp/servers` | Delete an MCP server. | `?session_id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/mcp/servers/enable` | Enable or disable an MCP server. | `?session_id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/mcp/import` | Import MCP servers from another tool's config. | `?session_id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/mcp/servers` | List configured MCP servers. | `?session_id*` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/mcp/parse` | Preview an MCP config import. | `?session_id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/mcp/reconnect` | Reload MCP config and reconnect. | `?session_id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/mcp/probe` | Probe an MCP server without saving it. | `?session_id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `PUT /api/v1/agent/mcp/servers` | Create or update an MCP server. | `?session_id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `session_id` — Live session id, as an alternative to the body's `session_id`. When the body carries a non-empty `session_id`, that value is used and this parameter is ignored; otherwise this value, trimmed of surrounding spaces, is used. _(on `POST /api/v1/agent/mcp/write-intents`, `DELETE /api/v1/agent/mcp/servers`, `POST /api/v1/agent/mcp/servers/enable` +5 more)_
- `session_id` — Live session id (MCP config is resolved against the session's settings layers). _(on `GET /api/v1/agent/mcp/servers`)_

**Body shapes:**

- `POST /api/v1/agent/mcp/write-intents` body — `{ session_id: string, op*: "upsert" | "delete" | "set_enabled" | "import", scope: "user" | "project" | "local" }` — Which write is intended, and in which settings layer.
  - `session_id` — Live session id (MCP config is resolved against the session's settings layers). Required, either here or as the `session_id` query parameter; a non-empty value here wins over the query.
  - `op` — Which write the nonce authorizes. The minted nonce is valid for this op alone.
  - `scope` — Settings layer to write. Defaults to user, or project when there is no user layer (which is the case under --config-dir).
- `DELETE /api/v1/agent/mcp/servers` body — `{ session_id: string, nonce*: string, scope: "user" | "project" | "local", name*: string, expect_hash*: string }` — Server name, the begin-write nonce (op:delete) and the expected content hash.
  - `session_id` — Live session id. Required, either here or as the `session_id` query parameter; a non-empty value here wins over the query.
  - `nonce` — Single-use nonce from POST /api/v1/agent/mcp/write-intents minted for op:delete and this scope.
  - `scope` — Settings layer to write. Must match the scope the nonce was minted for.
  - `name` — The server name to remove.
  - `expect_hash` — The mcp_servers hash you last read.
- `POST /api/v1/agent/mcp/servers/enable` body — `{ session_id: string, nonce*: string, scope: "user" | "project" | "local", name*: string, enabled*: bool, expect_hash*: string }` — Server name, desired state, the begin-write nonce (op:set_enabled) and the expected content hash.
  - `nonce` — Single-use nonce from POST /api/v1/agent/mcp/write-intents minted for op:set_enabled and this scope.
  - `name` — The server name.
  - `enabled` — true to enable, false to disable.
- `POST /api/v1/agent/mcp/import` body — `{ session_id: string, nonce*: string, scope: "user" | "project" | "local", document: string, servers: { name*: string, type: string, command: string, args: string[], url: string, env: object, headers: object, allowed_tools: string[], require_confirmation: bool, enabled: bool }[], replace: bool, expect_hash*: string }` — The document or server array, plus the begin-write nonce (op:import).
  - `nonce` — Single-use nonce from POST /api/v1/agent/mcp/write-intents minted for op:import and this scope.
  - `document` — A pasted config document in any supported dialect. Mutually exclusive with the servers field. The hoody dialect is accepted here, so anything expressible via servers can be passed as a document.
  - `servers` — Explicit server entries, in hoody's own shape (the PUT /api/v1/agent/mcp/servers server entry). Mutually exclusive with document. The CLI takes them from a file: --servers @servers.json.
  - `replace` — Overwrite entries whose name already exists. Without it, a collision aborts the whole import.
- `POST /api/v1/agent/mcp/parse` body — `{ session_id: string, document*: string }` — The document to parse.
  - `document` — A config document in any supported dialect.
- `POST /api/v1/agent/mcp/reconnect` body — `{ session_id: string }` — Which session to reconcile against.
- `POST /api/v1/agent/mcp/probe` body — `{ session_id: string, server*: { name*: string, type: string, command: string, args: string[], url: string, env: object, headers: object, allowed_tools: string[], require_confirmation: bool, enabled: bool } }` — The candidate server config.
  - `session_id` — Live session id (supplies the deny list and transport policy). Required, either here or as the `session_id` query parameter; a non-empty value here wins over the query.
  - `server` — The candidate entry, same shape as the PUT /api/v1/agent/mcp/servers server.
- `PUT /api/v1/agent/mcp/servers` body — `{ session_id: string, nonce*: string, scope: "user" | "project" | "local", expect_hash*: string, server*: { name*: string, type: string, command: string, args: string[], url: string, env: object, headers: object, allowed_tools: string[], require_confirmation: bool, enabled: bool } }` — The server entry, the begin-write nonce (op:upsert) and the expected content hash.
  - `nonce` — Single-use nonce from POST /api/v1/agent/mcp/write-intents minted for op:upsert and this scope; the RPC fails closed without it.
  - `expect_hash` — … REQUIRED: a mismatch returns a conflict instead of overwriting a concurrent edit, and a first write into a file that does not exist yet states its expectation with the empty-array hash rather than omitting this.
  - `server` — The server entry. A key set to JSON null inside env or headers deletes that one key.

### `memory` (11) — Long-term memory records (admin browse / CRUD)

| Method | Summary | Params |
|--------|---------|--------|
| `PUT /api/v1/agent/memory/datahost` | Assign this computer as the memory data host. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/memory/consolidate` | Trigger a memory consolidation pass. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/memory/write-intents` | Begin a guarded memory write (intent). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `DELETE /api/v1/agent/memory/projects/{project}` | Erase a memory project. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `PUT /api/v1/agent/memory/enabled` | Toggle memory capture. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/memory/flush` | Flush the memory store. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body` |
| `GET /api/v1/agent/memory/datahost` | Read the realm's memory data host. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/memory/graph` | Read a project's memory relation graph. | `?project` `?node_type` `?limit` `?offset` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/memory/status` | Read memory subsystem status. | `?project` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/memory/projects` | List memory projects. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/memory/search` | Search memory (hybrid recall). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `project` — The project. _(on `DELETE /api/v1/agent/memory/projects/{project}`)_
- `project` — Project key whose graph to read. _(on `GET /api/v1/agent/memory/graph`)_
- `node_type` — Optional node-type filter.
- `limit` — Maximum nodes/edges to return. _(on `GET /api/v1/agent/memory/graph`)_
- `offset` — Pagination offset into the graph.
- `project` — Project key to report per-project counts, embedding coverage and last-consolidation for. Omitted: only the whole-store totals are returned. _(on `GET /api/v1/agent/memory/status`)_

**Body shapes:**

- `PUT /api/v1/agent/memory/datahost` body — `{ use_self*: bool, expect_realm: string }` — The assignment, and the realm it is asserted against.
  - `use_self` — Assign THIS computer. Only true is implemented; false is refused 400 unsupported.
  - `expect_realm` — … Required unless X-Hoody-Realm or ?realm= names the realm; refused 400 when neither does (an empty value means the global realm to the daemon, never "unspecified"), and 400 bad_request when it names another realm than they do.
- `POST /api/v1/agent/memory/consolidate` body — `{ project*: string, nonce*: string, min_observations: int, expect_realm: string }` — The consolidation target and its write intent.
  - `project` — Project key to consolidate (required).
  - `nonce` — The single-use intent from POST /api/v1/agent/memory/write-intents, minted for op "consolidate" and this project.
  - `min_observations` — Optional minimum-observations threshold for a fact to be consolidated.
  - `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The request is refused when it does not name the realm the request acts in (the named realm, else the agent's active realm).
- `POST /api/v1/agent/memory/write-intents` body — `{ op*: "wipe_project" | "consolidate", project*: string, expect_realm: string }` — Which write the intent authorizes, and against which project.
  - `op` — The write this intent authorizes. The minted intent is valid for this op alone.
  - `project` — Project key the write will target. The intent is valid for this project alone.
- `DELETE /api/v1/agent/memory/projects/{project}` body — `{ nonce*: string, reason: string, expect_realm: string }` — The write intent, and optionally why the project was erased.
  - `nonce` — The single-use intent from POST /api/v1/agent/memory/write-intents, minted for op "wipe_project" and this project.
  - `reason` — Optional reason recorded on the audit row.
- `PUT /api/v1/agent/memory/enabled` body — `{ enabled*: bool }` — The desired enabled state.
  - `enabled` — Whether memory capture is enabled.
- `POST /api/v1/agent/memory/flush` body — `object` — … Every `_`-prefixed key is ignored, and scope fields sent in the body (cwd, config_dir, computer, realm) are removed: a route that uses the request scope takes cwd and config_dir from the scope headers. … No fields are required; the request scope (cwd/config_dir) is folded in automatically.
- `POST /api/v1/agent/memory/search` body — `{ project: string, query: string, limit: int, kinds: string[], skip_graph: bool }` — The recall query.
  - `project` — Project key to search within.
  - `query` — The natural-language recall query (privacy-Strip'd server-side).
  - `limit` — Maximum hits to return.
  - `kinds` — Optional document kinds to restrict the search to: obs (observations), memory (saved memories), summary (session summaries). Any other value is refused with 400.
  - `skip_graph` — Skip the graph-fusion component of recall.

### `memory.items` (5) — Memory items

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/memory/items` | Save a memory item. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `DELETE /api/v1/agent/memory/items` | Delete a memory item. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body` |
| `GET /api/v1/agent/memory/items/{id}` | Read a memory item. | `?project` `?kind` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/memory/items` | List memory items. | `?project` `?kind` `?type` `?query` `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `PATCH /api/v1/agent/memory/items/{id}` | Edit a memory item. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `project` — Project key the memory belongs to. _(on `GET /api/v1/agent/memory/items/{id}`)_
- `kind` — The store the record lives in: memory (the default), lesson, slot or observation. _(on `GET /api/v1/agent/memory/items/{id}`)_
- `project` — Project key to scope the listing to. _(on `GET /api/v1/agent/memory/items`)_
- `kind` — The store to list: memory (the default), lesson, slot or observation. Each answers its own row shape (see items). _(on `GET /api/v1/agent/memory/items`)_
- `type` — Memory type to filter by (e.g. workflow, fact). kind=memory ONLY: rejected 400 with a lesson/slot/observation kind.
- `query` — Free-text filter over the records. kind=memory ONLY: rejected 400 with a lesson/slot/observation kind.
- `page` — 1-based page number.
- `limit` — Items per page (1..200). 0 or omitted pages at the 200 ceiling; a value over 200 is clamped to 200. The effective page size is echoed in meta.limit. NOT "no pagination": the daemon never returns an unbounded set.

**Body shapes:**

- `POST /api/v1/agent/memory/items` body — `{ project*: string, content*: string, type: string, concepts: string[], files: string[], ttl_days: int, strength: int, expect_realm: string }` — The memory record.
  - `content` — The memory content.
  - `type` — Memory type: pattern, preference, architecture, bug, workflow or fact. Omitted or empty saves a fact; any other value is REFUSED, as on edit.
  - `concepts` — Concept tags to index the memory under.
  - `files` — File paths the memory is about.
  - `ttl_days` — … Must be a whole number between -2147483648 and 106751 (about 292 years: the longest expiry the store can represent); a value outside that range is REFUSED, never clamped and never treated as no expiry. A fractional value like 30.5 and a numeric string like "30" are both REFUSED too, never truncated or coerced: a silent coercion to 0 would store the memory with no expiry at all while reporting success.
  - `strength` — Initial ranking strength, a whole number from 1 (weakest) to 10 (strongest). Omitted or 0 takes the store's default of 7. Any other value (a negative number, anything above 10, a fractional value or a numeric string) is REFUSED, never coerced and never silently replaced with the default.
  - `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The write is refused when it does not name the realm the request acts in (the named realm, else the agent's active realm), so it cannot land in a realm the caller switched away from.
- `DELETE /api/v1/agent/memory/items` body — `{ ids: string[], id: string, name: string, project: string, kind: "memory" | "observation" | "lesson" | "slot", reason: string, expect_realm: string }` — Which memory records to delete. Address them by `ids` (one or many) or, for a slot, by `name` or `id`. A lone `id` is accepted and treated as a one-element `ids`; a native `ids` array wins when both are present.
  - `ids` — Record ids to delete. For kind memory/observation/lesson (the empty/default kind included) send `ids`, or a single `id` that is treated as a one-element `ids`. A `summary:<session_id>`-prefixed id deletes a summary.
  - `id` — A single record id: shorthand for a one-element `ids`. For kind=slot it is the slot NAME (an alias for `name`).
  - `name` — kind=slot: the slot to delete. Takes precedence over `id`.
  - `project` — Project key the records belong to.
  - `kind` — Which store the records live in. Omitted means memory.
  - `reason` — Optional reason recorded on the governance audit row.
  - `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The delete is refused when it does not name the realm the request acts in (the named realm, else the agent's active realm).
- `PATCH /api/v1/agent/memory/items/{id}` body — `{ project: string, kind: "memory" | "lesson" | "slot", content: string, type: string, concepts: string[], files: string[], strength: int, ttl_days: int, tier: string, context: string, confidence: number, expect_realm: string }` — Patch fields for the memory record (the {id} comes from the path). An absent field preserves the stored value; a present one overwrites it.
  - `project` — Project key the record belongs to.
  - `kind` — Which store the record lives in. Omitted means memory. It selects which of the fields below apply; observation is not editable.
  - `content` — Replacement content. Applies to every kind, and is REQUIRED for kind=slot (a slot edit with no content is refused; an empty or whitespace-only content deletes the slot, as the delete route does).
  - `type` — kind=memory: replacement memory type (e.g. workflow, fact).
  - `concepts` — kind=memory: replacement concept tags. The whole list is replaced, and a malformed array is rejected rather than silently truncated.
  - `files` — kind=memory: replacement file paths. The whole list is replaced, and a malformed array is rejected rather than silently truncated.
  - `strength` — kind=memory: replacement ranking strength, a whole number from 1 (weakest) to 10 (strongest). Any other value (0, a negative number, anything above 10, a fractional value or a numeric string) is REFUSED, never coerced, and the stored strength is left unchanged.
  - `ttl_days` — … Must be a whole number between -2147483648 and 106751 (about 292 years: the longest expiry the store can represent); a value outside that range is REFUSED, never clamped, and the stored expiry is left unchanged. A fractional value like 30.5 and a numeric string like "30" are both REFUSED too, never truncated or coerced.
  - `tier` — kind=memory: replacement storage tier.
  - `context` — kind=lesson: replacement context. Send it verbatim to preserve it: an absent value preserves the stored one, but the field is how the TUI resends it unchanged.
  - `confidence` — kind=lesson: replacement confidence.
  - `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The edit is refused when it does not name the realm the request acts in (the named realm, else the agent's active realm).

### `models` (2) — Catalogued models and fusion composites

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/models/{spec}` | Get a model by spec. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `GET /api/v1/agent/models` | List models. | `?ready` `?provider` `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |

**Param notes:**

- `spec` — The spec.
- `ready` — When true, list only the models that can run now: the provider is ready (see GET /api/v1/agent/providers status), an OpenAI model used through the ChatGPT sign-in is one that sign-in serves, and a fusion composite appears only when every member qualifies. Any value other than true or false returns 400 bad_request.
- `provider` — List only this provider's models (its id). fusion lists only the fusion composites. An id that matches no provider returns an empty list.

### `providers` (7) — LLM providers: custom providers, credentials, OAuth and account pools

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/providers` | Create a custom provider. | `H:Idempotency-Key` `body*` |
| `DELETE /api/v1/agent/providers/{id}` | Delete a custom provider. |  |
| `DELETE /api/v1/agent/providers/{id}/auth/api-key` | Delete a provider API key. |  |
| `GET /api/v1/agent/providers/{id}` | Get a provider. |  |
| `GET /api/v1/agent/providers` | List LLM providers. | `?page` `?limit` |
| `PUT /api/v1/agent/providers/{id}/auth/api-key` | Store a provider API key. | `body*` |
| `PATCH /api/v1/agent/providers/{id}` | Change a custom provider. | `body` |

**Param notes:**

- `Idempotency-Key` — Opaque retry key (1-255 printable ASCII, no whitespace). A retry with the same key and body answers 201 with the provider the first try created; the same key with another body is 422 idempotency_key_reused. Keys are remembered for 24 hours, until the agent restarts.

**Body shapes:**

- `POST /api/v1/agent/providers` body — `{ id*: string, model_prefix: string, display_name: string, wire_format: "chat_completions" | "responses" | "messages", base_url*: string, auth_scheme: "bearer" | "x-api-key", headers: { [key: string]: string }, models*: { model*: string, context_window: int, output_limit: int, reasoning: bool }[] }` — The provider definition. id, base_url and models are required.
  - `id` — The provider id: 1-40 lowercase letters, digits or inner hyphens. It cannot be changed later.
  - `model_prefix` — The prefix of the provider's model specs (acme for acme/<model>). It must equal the id; omitted, it is the id. No provider's id or prefix may already use it, and fusion is reserved.
  - `display_name` — Display name. Omitted on create, it is the id.
  - `wire_format` — The API the endpoint speaks: chat_completions (OpenAI-compatible Chat Completions, the default on create), responses (OpenAI Responses) or messages (Anthropic Messages).
  - `base_url` — The endpoint's base URL, the part before /chat/completions, /responses or /v1/messages (e.g. https://api.acme.example/v1). base_url must be an https URL with no user name, password, query or fragment, at a public address. Create, and update when it changes base_url, refuse with 422 provider_invalid a host written as an internal address, a name that does not resolve, a name with no IPv4 address, and a name that resolves to an internal IPv4 address. The address is checked again whenever a new connection to the provider is opened, so a name whose DNS later points inside is refused then.
  - `auth_scheme` — How the stored key is sent. It follows wire_format: bearer (Authorization: Bearer <key>) with chat_completions and responses, x-api-key with messages. Omitted, it is that value; any other pairing is refused 422 provider_invalid.
  - `headers` — Static request headers sent on every request, chat_completions only, at most 16. Credential and transport headers (Authorization, x-api-key, api-key, Cookie, Host, Content-Type, Content-Length, Connection and the other hop-by-hop headers) are refused. Values must not contain ${...}. …
  - `models` — The provider's models, 1 to 500, each selectable as <model_prefix>/<model>. On PATCH the list replaces the current one.
- `PUT /api/v1/agent/providers/{id}/auth/api-key` body — `{ api_key*: string, check: bool, if_definition_rev: string }` — The provider API key to store (never returned).
  - `api_key` — The provider API key. Stored in the agent's owner-only credential file; the reply echoes only a prefix and a fingerprint.
  - `check` — true tries the key against the provider before saving; a refused key is not saved (422 api_key_refused). Omitted or false saves without trying.
  - `if_definition_rev` — The provider's definition_rev as read from GET /api/v1/agent/providers/{id}. When it no longer matches, nothing is saved (409 definition_changed).
- `PATCH /api/v1/agent/providers/{id}` body — `{ display_name: string, wire_format: "chat_completions" | "responses" | "messages", base_url: string, auth_scheme: "bearer" | "x-api-key", headers: { [key: string]: string }, models: { model*: string, context_window: int, output_limit: int, reasoning: bool }[], model_prefix: string }` — The members to change; omitted members are kept.
  - `model_prefix` — Fixed at creation. Accepted only when equal to the current prefix; any other value is refused 400 provider_field_immutable.

### `providers.accounts` (4) — OAuth account pool of a provider

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/providers/{id}/auth/accounts` | Add an OAuth account to a provider's pool. | `H:Idempotency-Key` `body` |
| `GET /api/v1/agent/providers/{id}/auth/accounts` | List a provider's OAuth account pool. | `?page` `?limit` |
| `DELETE /api/v1/agent/providers/{id}/auth/accounts/{key}` | Remove a pooled OAuth account. |  |
| `PUT /api/v1/agent/providers/{id}/auth/accounts/{key}/active` | Make a pooled OAuth account active. | `body` |

**Param notes:**

- `Idempotency-Key` — Opaque retry key (1-255 printable ASCII, no whitespace), minted once per click. A retry with the same key answers the job the first try started, whatever its state, for as long as the agent keeps that job (15 minutes after its last activity, until the agent restarts).

**Body shapes:**

- `POST /api/v1/agent/providers/{id}/auth/accounts` body — `{ method: string }` — No fields are required; the login flow is started for the {id} provider.
  - `method` — The sign-in method: "browser" (the default) or "device_code" (a code entered on the provider's page, for a computer with no browser). Only the methods the provider offers are accepted (400 bad_request with details.field method otherwise).
- `PUT /api/v1/agent/providers/{id}/auth/accounts/{key}/active` body — `object` — No body fields are required; the account is identified by the {key} path value.

### `providers.auth` (3) — Provider authentication

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/providers/{id}/auth` | Get a provider's auth status. |  |
| `PUT /api/v1/agent/providers/{id}/auth/default` | Set a provider's default credential method. | `body*` |
| `POST /api/v1/agent/providers/{id}/auth/test` | Try a provider's stored API key. |  |

**Body shapes:**

- `PUT /api/v1/agent/providers/{id}/auth/default` body — `{ default*: string }` — The default credential method to set.
  - `default` — The default method: "api_key" or "oauth". Must be a method the provider supports AND has a stored credential for.

### `providers.oauth` (5) — Provider OAuth login

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/agent/providers/{id}/auth/oauth/{job}` | Cancel a provider OAuth login. |  |
| `DELETE /api/v1/agent/providers/{id}/auth/oauth` | Remove a provider's OAuth login. |  |
| `GET /api/v1/agent/providers/{id}/auth/oauth/{job}` | Poll a provider OAuth login. |  |
| `POST /api/v1/agent/providers/{id}/auth/oauth` | Start a provider OAuth login. | `H:Idempotency-Key` `body` |
| `POST /api/v1/agent/providers/{id}/auth/oauth/{job}/code` | Submit a provider OAuth authorization code. | `body*` |

**Param notes:**

- `job` — The job.
- `Idempotency-Key` — Opaque retry key (1-255 printable ASCII, no whitespace), minted once per click. A retry with the same key answers the job the first try started, whatever its state, for as long as the agent keeps that job (15 minutes after its last activity, until the agent restarts).

**Body shapes:**

- `POST /api/v1/agent/providers/{id}/auth/oauth` body — `{ add_account: bool, method: string }` — Optional OAuth start options.
  - `add_account` — When true, the login ADDS to the provider's OAuth account pool instead of replacing the primary login.
  - `method` — The sign-in method: "browser" (the default) or "device_code" (a code entered on the provider's page, for a computer with no browser). Only the methods the provider offers are accepted (400 bad_request with details.field method otherwise).
- `POST /api/v1/agent/providers/{id}/auth/oauth/{job}/code` body — `{ code*: string }` — The authorization code or full redirect URL the flow is waiting for.
  - `code` — The authorization code (or the full redirect URL) to complete the exchange.

### `realms` (2) — Realms the agent can bind to

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/realms` | List realms (for binding). | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `PUT /api/v1/agent/hoody/realm` | Switch the agent's active realm. | `body*` |

**Body shapes:**

- `PUT /api/v1/agent/hoody/realm` body — `{ realm_id*: string }` — The realm to select.
  - `realm_id` — A realm id of 24 lowercase hex characters, or an empty string for all realms.

### `scripts` (2) — Scripts operations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/script-instances/delete` | Delete a managed script. | `H:Idempotency-Key*` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/script-instances` | List a computer's managed scripts. | `?computer_id*` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |

**Param notes:**

- `Idempotency-Key` — Retry key, required. 1–255 printable ASCII, no whitespace. The same key with the same body returns the first answer with replayed true and does nothing again; the same key with another body is 422 idempotency_key_reused; while the first request still runs it is 409 in_progress. A key whose request was answered, or whose outcome is unknown, is remembered for 24 hours after its last answer or replay; a key whose request is still running is remembered until it ends. When many keys are held, the oldest answered keys are forgotten first; a key whose outcome is unknown is not. Every key is forgotten when the agent restarts. A retry of a remembered unknown outcome, and a request whose key is no longer remembered, are settled from the computer: the first answer comes back, with replayed true, only when the computer shows the request took effect. Otherwise the answer is 503 outcome_unknown, or a definite refusal such as 409 script_exists or path_reserved, because the computer now shows the path held by a script it cannot prove came from this request; that script may still be this request's own earlier effect. While too many keyed requests are unsettled, a new key is 429 idempotency_keys_exhausted and nothing is done.
- `computer_id` — The computer (24-hex computer id).

**Body shapes:**

- `POST /api/v1/agent/script-instances/delete` body — `{ computer_id*: string, path*: string, if_revision*: string, op_id*: string, keep_copy: bool }` — The script and the guard.
  - `path` — The script's path under the computer's scripts root.
  - `if_revision` — The revision the script must still have (opaque, as the computer reported it).
  - `op_id` — The operation id the computer records the delete under.
  - `keep_copy` — Optional: keep a copy of the file on the computer.

### `scripts.templates` (3) — Templates operations

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/script-templates/{name}` | Get one script template. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/script-templates/{name}/instantiate` | Make a script from a template. | `H:Idempotency-Key*` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/script-templates` | List script templates. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |

**Param notes:**

- `Idempotency-Key` — Retry key, required. 1–255 printable ASCII, no whitespace. The same key with the same body returns the first answer with replayed true and does nothing again; the same key with another body is 422 idempotency_key_reused; while the first request still runs it is 409 in_progress. A key whose request was answered, or whose outcome is unknown, is remembered for 24 hours after its last answer or replay; a key whose request is still running is remembered until it ends. When many keys are held, the oldest answered keys are forgotten first; a key whose outcome is unknown is not. Every key is forgotten when the agent restarts. A retry of a remembered unknown outcome, and a request whose key is no longer remembered, are settled from the computer: the first answer comes back, with replayed true, only when the computer shows the request took effect. Otherwise the answer is 503 outcome_unknown, or a definite refusal such as 409 script_exists or path_reserved, because the computer now shows the path held by a script it cannot prove came from this request; that script may still be this request's own earlier effect. While too many keyed requests are unsettled, a new key is 429 idempotency_keys_exhausted and nothing is done.

**Body shapes:**

- `POST /api/v1/agent/script-templates/{name}/instantiate` body — `{ computer_id*: string, script_path*: string, vars: object, caller_key: string }` — Where to write the script and the template's values.
  - `computer_id` — The computer (24-hex computer id).
  - `script_path` — The script's path under the computer's scripts root, for example default/1/notes.ts.
  - `vars` — The template's variables by name; every value is a string.
  - `caller_key` — Optional: exactly 43 base64url characters. Callers of the script must present it.

### `sessions` (30) — Create, drive, and tear down agent sessions

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/sessions/{id}/close` | Close the session (teardown). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/stream` | Attach to a session's event stream (WebSocket / SSE). | `?since` `?incarnation` `H:Last-Event-ID` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions` | Create, fork, or attach a session. | `H:Idempotency-Key` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `DELETE /api/v1/agent/sessions/{id}` | Close (and optionally hard-delete) a session. | `?hard` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `PATCH /api/v1/agent/sessions/{id}/hoody-env` | Toggle Hoody shell-env injection. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/yolo` | Turn Allow everything on or off for this chat. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/sessions/{id}` | Get a session summary. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/session-create-keys/{key}` | Read what a keyed session create became. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/images/{image_id}` | Read an image attached to a session message. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/state` | Read a session's recoverable state. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/transcript` | Read a session's transcript without attaching. | `?after_turn` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/usage` | Read a session's per-call LLM usage. | `?after_id` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions` | List sessions. | `?include_system` `?order` `?realm` `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `GET /api/v1/agent/sessions/{id}/rules/applies` | Which tool-call rules apply. | `?agent` `?tool` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/cwds` | List distinct session working directories. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/loops` | List a session's loops. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/bash-jobs` | List a session's background shells. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/slash-commands` | List the slash commands a session's chat offers. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `PATCH /api/v1/agent/sessions/{id}` | Rename a session. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/sessions/{id}/replay` | Replay a live session's buffered events. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/session-create-keys/{key}/retire` | Retire a session create key no read found. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `PUT /api/v1/agent/sessions/{id}/after-compaction` | Set the message re-added after every compaction. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `PATCH /api/v1/agent/sessions/{id}/agent` | Switch the chat agent. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/effort` | Set reasoning effort. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/model` | Switch the session model. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `PATCH /api/v1/agent/sessions/{id}/verbosity` | Set response verbosity. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/sessions/{id}/workflows/{name}/runs` | Run a workflow onto an existing session. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/sessions/{id}/bash-jobs/{job_id}/stop` | Stop one of a session's background shells. | `H:Idempotency-Key*` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions:events` | Watch up to 32 live sessions' events on one stream (SSE). | `?ids*` `?since` `?incarnation` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions/{id}/trim` | Trim session history to a turn index. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `since` — Resume from this gateway int64 seq (also accepted as the Last-Event-ID header). _(on `GET /api/v1/agent/sessions/{id}/stream`)_
- `incarnation` — The incarnation the since cursor belongs to (from a frame, replay_boundary, or GET /api/v1/agent/sessions/{id}). When it differs from the live session's, the cursor is treated as invalid: a replay_gap frame, then the full retained ring. _(on `GET /api/v1/agent/sessions/{id}/stream`)_
- `Last-Event-ID` — SSE resume cursor: the gateway int64 seq to resume from (the in:header alias of ?since); sent automatically by an SSE client on reconnect.
- `Idempotency-Key` — Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key after the first try started a session re-joins that session (replayed true); a first try that never started one answers 409 creation_interrupted and the key cannot create again, so use a new key. The same key with a different request body is 422. _(on `POST /api/v1/agent/sessions`)_
- `hard` — When true, also remove the persisted session record (not just the live connection).
- `after_turn` — Exclusive completed-turn skip cursor: return content strictly after completed turn N (0 = full transcript; values past the end clamp; negative/non-integer = 400).
- `after_id` — Exclusive cursor: return rows whose id is greater than this. Omit (or 0) to start from the session's first row. Negative or non-integer = 400.
- `limit` — Return at most this many rows (1 to 5000, default 500). Out of range or non-integer = 400. _(on `GET /api/v1/agent/sessions/{id}/usage`)_
- `include_system` — When true, also include daemon-owned system/resident sessions in the listing.
- `order` — started (newest started first) or last_active (most recently active first). Omitted: started when limit is given, else last_active. Another value is 400 bad_request.
- `realm` — The realm to list: "global" (sessions not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. _(on `GET /api/v1/agent/sessions`)_
- `agent` — Agent name to ask about (default: the session's own agent).
- `tool` — Tool name to ask about (default: any tool).
- `Idempotency-Key` — Retry key, 1-255 printable ASCII without whitespace, minted once per stop: a retry with the same key answers the first call's outcome. _(on `POST /api/v1/agent/sessions/{id}/bash-jobs/{job_id}/stop`)_
- `ids` — Comma list of 1 to 32 distinct session ids. Required.
- `since` — Comma list of <session id>:<seq>, the last gateway seq applied per session; ids not listed start from their whole retained ring. _(on `GET /api/v1/agent/sessions:events`)_
- `incarnation` — Comma list of <session id>:<incarnation>, the incarnation each since cursor belongs to; a session whose incarnation differs gets replay_gap and its full retained ring. _(on `GET /api/v1/agent/sessions:events`)_

**Body shapes:**

- `POST /api/v1/agent/sessions` body — `{ realm: string, computer: string, cwd: string, config_dir: string, model: string, agent: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", attach: string, fork: string, fork_turn_idx: int, backend: string, delegated_agent: string, follow_realm_backend: bool, headless: bool, approval: { mode: "" | "default" | "always", locked: bool }, expected_binding: { realm: string, computer: string, cwd: string, backend: "" | "llm" | "acp" }, prompt_blocks: { contract: bool, transcripts: bool, frequent_files: bool, hook_context: bool, memory: bool, project_instructions: bool, agent_instructions: bool, team_rules: bool, skills: bool, workflows: bool, verbosity: bool, hoody_platform: bool, hoody_exec: bool, fleet_notice: bool, environment: bool }, model_settings: { thinking: object, temperature: number, max_tokens: int, response_format: object }, helper_gates: bool, outcome_claims: bool, frame_tools: bool }` — Session start binding (all optional; header scope augments the body, body wins). backend:"acp" requires delegated_agent.
  - _(22 fields carry longer docs — see the spec shipped as `hoody-sdk/openapi.json` for full field semantics)_
- `PATCH /api/v1/agent/sessions/{id}/hoody-env` body — `{ enabled: bool }` — Enable/disable HOODY_* shell-env injection.
  - `enabled` — Whether to inject the HOODY_* shell-env contract.
- `PATCH /api/v1/agent/sessions/{id}/yolo` body — `{ enabled*: bool }` — YOLO state.
  - `enabled` — true to arm auto-approve, false to disarm.
- `PATCH /api/v1/agent/sessions/{id}` body — `{ name*: string }` — The new title.
  - `name` — The new title. An empty string clears it back to the automatic title and asks for a new one. Required: omitting it is a 400, not a clear.
- `PUT /api/v1/agent/sessions/{id}/after-compaction` body — `{ text*: string }` — The after-compaction message.
  - `text` — The message text, at most 16384 bytes in UTF-8. Empty or whitespace-only removes the message.
- `PATCH /api/v1/agent/sessions/{id}/agent` body — `{ agent: string }` — New chat agent.
  - `agent` — … The bot agent is refused 400 bad_request (details.field agent) on every session: it runs only inside a Bot (POST /api/v1/agent/bots). A Bot's own session keeps the bot agent: any switch of it is refused 400 bad_request. A switch to a tool-ceiling agent (script-writer, github-installer), or away from a session running one, is refused 400 bad_request (details.field agent): its tools are fixed at start.
- `PATCH /api/v1/agent/sessions/{id}/effort` body — `{ effort: "" | "low" | "medium" | "high" | "xhigh" | "max" }` — Reasoning effort.
  - `effort` — low|medium|high|xhigh|max, or "" for the model default. Any other value is 400 bad_request (details.field effort).
- `PATCH /api/v1/agent/sessions/{id}/model` body — `{ model*: string, scope: "agent" | "session" }` — New model.
  - `model` — Model spec to switch to (provider-prefixed, e.g. anthropic/claude-opus-4-8, or fusion/<slug>). Required: a blank value is rejected, never a silent no-op.
  - `scope` — What the switch changes: agent (the default) also makes the model the chat agent's default for later sessions; session changes only this session and leaves the agent's file alone.
- `PATCH /api/v1/agent/sessions/{id}/verbosity` body — `{ level: "normal" | "concise" | "terse" | "minimal" }` — Verbosity level.
  - `level` — normal|concise|terse|minimal; surrounding whitespace is trimmed, and omitted, empty or off selects normal. Any other value is 400 bad_request (details.field level); the applied level is echoed on the stream as event.verbosity.
- `POST /api/v1/agent/sessions/{id}/workflows/{name}/runs` body — `{ prompt: string, inputs: { [key: string]: string } }` — Optional workflow input prompt and declared input-parameter values.
  - `prompt` — Optional input text fed to the workflow run ($(workflow.prompt)).
  - `inputs` — Optional run-time values for the workflow's DECLARED input parameters (declared name → string value; resolves to $(input.<name>) in every step). A workflow with a REQUIRED declared parameter cannot run without these. Values must be strings; a non-string value is a 400.
- `POST /api/v1/agent/sessions/{id}/trim` body — `{ turn_idx: int }` — Trim target.
  - `turn_idx` — 0-based turn index to truncate history to (and including). An index past the last turn changes nothing.

### `sessions.approval` (4) — Session approval policy — get, update, rules

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/agent/sessions/{id}/approval/rules/{tool}` | Remove one session permission rule. | `H:If-Match` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/approval` | Read a session's approval policy. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `PUT /api/v1/agent/sessions/{id}/approval/rules/{tool}` | Set one session permission rule. | `H:If-Match` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `PUT /api/v1/agent/sessions/{id}/approval` | Set a session's approval mode and lock. | `H:If-Match` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `tool` — The tool.
- `If-Match` — Conditional-request precondition: the ETag from GET /api/v1/agent/sessions/{id}/approval (a quoted policy revision, e.g. "3") or *. A mismatch is 412 precondition_failed.

**Body shapes:**

- `PUT /api/v1/agent/sessions/{id}/approval/rules/{tool}` body — `{ decision*: "allow" | "deny" }` — One permission rule.
  - `decision` — allow | deny.
- `PUT /api/v1/agent/sessions/{id}/approval` body — `{ mode: "default" | "always", locked: bool }` — Approval policy change. Send If-Match (the ETag from GET) to make it conditional.
  - `mode` — "default" or "always". Omit to keep the current mode.
  - `locked` — Freeze the policy for the session's lifetime (monotonic; never unlocked). Omit to keep the current lock.

### `sessions.approverLease` (3) — Approver Lease operations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/sessions/{id}/approver-lease` | Acquire the right to answer this session's gates. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `DELETE /api/v1/agent/sessions/{id}/approver-lease` | Release the approver lease. | `H:X-Hoody-Approver-Lease` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `PATCH /api/v1/agent/sessions/{id}/approver-lease` | Renew the approver lease. | `H:X-Hoody-Approver-Lease` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |

**Body shapes:**

- `POST /api/v1/agent/sessions/{id}/approver-lease` body — `{ holder*: string, ttl_ms: int, replace: bool, lease: string }` — Lease request. holder is REQUIRED on acquire; renew/release need only the capability.
  - `holder` — REQUIRED on acquire: an opaque per-caller id (1–64 printable ASCII, no spaces) that identifies THIS client as the holder (reported as `holder` on the event.gate_resolved stream event). Never a credential; an empty holder is 400.
  - `ttl_ms` — Requested lifetime in milliseconds (the daemon clamps to its bounds). On renew it never shortens the lease: the expiry becomes the later of the current one and now + ttl_ms.
  - `replace` — Documentation only: a live lease is taken over ONLY by presenting its current capability as proof (X-Hoody-Approver-Lease or body.lease); replace:true without the proof is still 409 approver_lease_held. After expiry or release an acquire needs no proof.
  - `lease` — The capability: what renew/release act on, and the PROOF an acquire presents to take over a live lease (alternative to the X-Hoody-Approver-Lease header).
- `PATCH /api/v1/agent/sessions/{id}/approver-lease` body — `{ ttl_ms: int, lease: string }` — Lease request (renew/release): the capability via body.lease or the X-Hoody-Approver-Lease header; ttl_ms optional on renew.

### `sessions.attachments` (3) — Attachment leases that keep a live session alive — claim, renew, release

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/sessions/{id}/attachments` | Hold a live session (and its parked gate) alive. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `DELETE /api/v1/agent/sessions/{id}/attachments/{lease_id}` | Release an attachment lease. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `PATCH /api/v1/agent/sessions/{id}/attachments/{lease_id}` | Renew an attachment lease. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |

**Body shapes:**

- `POST /api/v1/agent/sessions/{id}/attachments` body — `{ ttl_ms: int }` — Lease request.
  - `ttl_ms` — Requested lifetime in milliseconds (default 15m, capped at 60m).
- `PATCH /api/v1/agent/sessions/{id}/attachments/{lease_id}` body — `{ ttl_ms: int }` — Renewal.
  - `ttl_ms` — New lifetime in milliseconds from now (default 15m, capped at 60m).

### `sessions.autoReply` (2) — Auto Reply operations

| Method | Summary | Params |
|--------|---------|--------|
| `PATCH /api/v1/agent/sessions/{id}/auto-reply/writes` | Flip the auto-reply write opt-in. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/auto-reply` | Arm/disarm the auto-reply loop. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |

**Body shapes:**

- `PATCH /api/v1/agent/sessions/{id}/auto-reply/writes` body — `{ allow_writes: bool }` — Write opt-in flip.
  - `allow_writes` — New write-class opt-in state.
- `PATCH /api/v1/agent/sessions/{id}/auto-reply` body — `{ armed: bool, rounds: int, model: string, allow_writes: bool }` — Auto-reply loop config.
  - `armed` — true to arm the auto-reply loop, false to disarm.
  - `rounds` — Number of auto-reply rounds budgeted.
  - `model` — Replier model override; a speech model is refused 422 model_unavailable (details.reason speech_model).
  - `allow_writes` — Opt in to write-class actions during auto-reply.

### `sessions.commands` (5) — Commands sent to a live session (message, interrupt, stop) and their receipts

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/sessions/{id}/commands/{command_id}` | Get a command's receipt. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/commands/by-key/{key}` | Read a command by its idempotency key. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions/{id}/commands/by-key/{key}/retire` | Retire a command key no read found. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions/{id}/commands` | Send a message, an interrupt or a stop to a session. | `H:Idempotency-Key*` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/sessions/{id}/commands/{command_id}/withdraw` | Take back a queued message. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |

**Param notes:**

- `Idempotency-Key` — Retry key, required on this route; the SDK and CLI send one automatically. 1–255 printable ASCII, no whitespace. A retry with the same key and command returns the stored receipt and admits nothing; the same key with a different command is 422. The key is remembered while the command waits and for 24 hours after it settled. Past 4096 remembered keys a new key is 429 idempotency_keys_exhausted; a stop is never refused because of the remembered-key limit.

**Body shapes:**

- `POST /api/v1/agent/sessions/{id}/commands` body — `{ kind*: "message" | "interrupt" | "stop", text: string, close: bool, on_gate: "deny" | "wait", order: int, from: { kind*: "user" | "bot" | "delegate" | "system", id: string }, trigger: "human" | "wake" | "clear" }` — The command.
  - `kind` — message, interrupt or stop.
  - `text` — The message (message and interrupt: required, non-empty, at most 32 KiB). Delivered verbatim. A stop takes none.
  - `close` — A stop only: close the session once its work is stopped.
  - `on_gate` — A message only: deny (default) declines a confirmation or question the session is waiting on so the message is read now; wait leaves it waiting. A Claude Code session reads the message when its turn ends; deny still declines its confirmations, so the turn ends. …
  - `order` — Optional, at least 0: a sequence number for your commands. A message or interrupt with a positive order lower than the highest stop order the session has recorded is superseded, whoever sent the stop. 0, or omitting it, skips this check.
  - `from` — Optional: who sends it. … Set it only when your client relays a message on someone's behalf (a Bot runtime, a session forwarding to another); a client sending a person's own message leaves it out, which reads as from the user.
  - `trigger` — Optional: what caused it, recorded on the receipt. With from kind bot, human introduces the message as the user's via their Bot and wake or clear as the Bot's own. Like from, it is the caller's claim, not verified, and grants nothing; leave it out unless your client relays messages.

### `sessions.tasks` (4) — Background task management

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/sessions/{id}/tasks/{tid}/cancel` | Cancel a background task. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions/{id}/tasks/cancel` | Cancel all background tasks. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/tasks/{tid}/transcript` | Read a background task's transcript. | `?after_seq` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/tasks` | List a session's background tasks. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |

**Param notes:**

- `after_seq` — Exclusive int64 upsert-poll cursor: entries with seq strictly greater than it, plus any still-OPEN entry regardless of its seq. Omit for the whole transcript (distinct from 0, which skips a closed seq-0 entry). Negative/non-integer = 400.

### `sessions.tools` (3) — Tool catalogue and gated tool execution

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/sessions/{id}/tools` | List a session's effective tool set. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/tools/mcp` | List a session's MCP tools. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions/{id}/tools/{name}/run` | Run a tool inside a live session (gated). | `?confirm` `?confirm_token` `H:X-Hoody-Approver-Lease` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `confirm` — Query alias of the body `confirm` field: re-issue a previously-parked confirmation (pair with confirm_token).
- `confirm_token` — Query alias of the body `confirm_token` field: the single-use token of the parked run (see the body field).

**Body shapes:**

- `POST /api/v1/agent/sessions/{id}/tools/{name}/run` body — `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }` — Tool parameters and an optional confirmation posture. Caller-supplied `confirmed`/`_`-prefixed control keys are ignored: they are never trusted from the wire.
  - `params` — The tool's input parameters (its JSON-Schema body).
  - `confirm` — … MUST be paired with the confirm_token of the parked run; a confirm:true with no valid token does NOT bypass the gate: the run is sent unconfirmed, so it parks again, except that a sessionless run of a non-read-only tool without allow_mutations is refused 400 tool_mutation_refused. …
  - `confirm_token` — The single-use token of the parked run: in the 409 tool_needs_confirmation details of POST /api/v1/agent/tools/{name}/run and POST /api/v1/agent/sessions/{id}/tools/{name}/run, in the polled job result of POST /api/v1/agent/tools/{name}/runAsync (whose own answer is a 202), and in the needs_confirmation frame of POST /api/v1/agent/tools/{name}/stream (whose own answer is a 200 stream). …
  - `allow_mutations` — Sessionless only: opt a non-read-only tool into running with every permission check applied (else a sessionless mutating run is refused 400 tool_mutation_refused). Set it on the first call; a confirm:true without a valid confirm_token does not stand in for it.

### `sessions.turns` (9) — Durable turn receipts

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/sessions/{id}/cancel` | Cancel the active turn (Esc), or one named turn. | `?turn_id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/sessions/{id}/turns` | Dispatch a turn (retry-safe). | `?policy` `H:X-Hoody-Gate-Policy` `H:Idempotency-Key` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/sessions/{id}/turns/{turn_id}` | Get a turn's durable receipt. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/turns/by-key/{key}` | Read a turn by its idempotency key. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/turns` | List a session's durable turn receipts. | `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions/{id}/turns/by-key/{key}/retire` | Retire a turn key no read found. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions/{id}/prompt:sync` | Dispatch a turn and block until it ends (no reply text: read it from the transcript) | `?policy` `H:X-Hoody-Gate-Policy` `H:Idempotency-Key` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/sessions/{id}/messages` | Dispatch a turn (fire-and-observe). | `H:Idempotency-Key` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/sessions/{id}/prompt:stream` | Dispatch a turn and stream the response. | `?policy` `H:X-Hoody-Gate-Policy` `H:Idempotency-Key` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `turn_id` — Cancel only this turn (alternative to the body field).
- `policy` — auto_approve auto-answers the admitted turn's confirm gates until it ends (alias of the X-Hoody-Gate-Policy header); off by default; the gateway asks for no separate credentials to use it; access is decided by the computer's proxy permission policy. _(on `POST /api/v1/agent/sessions/{id}/turns`)_
- `X-Hoody-Gate-Policy` — Confirm-gate posture: "auto_approve" adopts the headless auto-answer posture: it approves approval cards for their one call, and denies a card a tool-call rule raised and a destructive-shape card (static_stakes: a recursive force delete, curl piped to a shell, sudo, a force push...), as a headless run refuses those (off by default; the in:query alias is ?policy=). Any other value is rejected 400.
- `Idempotency-Key` — Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key returns the same receipt and never re-runs the turn; the same key with a different request body is 422. _(on `POST /api/v1/agent/sessions/{id}/turns`, `POST /api/v1/agent/sessions/{id}/messages`)_
- `limit` — Return at most this many receipts, newest first (1–1000). A cap, not a page size: there is no next page.
- `policy` — auto_approve adopts the headless auto-answer posture (alias of the X-Hoody-Gate-Policy header); off by default; the gateway asks for no separate credentials to use it; access is decided by the computer's proxy permission policy. _(on `POST /api/v1/agent/sessions/{id}/prompt:sync`)_
- `Idempotency-Key` — Opaque retry key (1–255 printable ASCII, no whitespace). The turn runs at most once per key: a retry answers 200 duplicate:true with the turn's outcome (or pending_turn while it still runs) and never re-runs it; the same key with a different request body is 422. _(on `POST /api/v1/agent/sessions/{id}/prompt:sync`)_
- `policy` — auto_approve auto-answers confirm gates for the life of the stream (alias of the X-Hoody-Gate-Policy header); off by default; the gateway asks for no separate credentials to use it; access is decided by the computer's proxy permission policy. _(on `POST /api/v1/agent/sessions/{id}/prompt:stream`)_
- `Idempotency-Key` — Opaque retry key (1–255 printable ASCII, no whitespace). The turn runs at most once per key: a retry is 409 replay_unavailable with the turn's receipt (details.turn), never a re-run and never a second stream; the same key with a different request body is 422. _(on `POST /api/v1/agent/sessions/{id}/prompt:stream`)_

**Body shapes:**

- `POST /api/v1/agent/sessions/{id}/cancel` body — `{ turn_id: string }` — Optional. Omit (or send {}) to cancel whatever is running.
  - `turn_id` — The turn to cancel, as returned when it was dispatched. Cancels only that turn.
- `POST /api/v1/agent/sessions/{id}/turns` body — `{ text*: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", attachments: { type*: "image", media_type*: string, data*: string, name: string }[] }` — Turn input: the user text, optional inline image attachments, plus the optional tool_mode / dir_scope the session's first turn fixes.
  - `text` — Required (may be empty only with attachments). The user message text for this turn: empty or whitespace-only text with no attachments is refused (400 empty_prompt) and no turn runs.
  - `tool_mode` — Optional tool mode: standard or orchestrator. … On a later turn, one queued before the first turn ran included, the same value is accepted and a different one is refused 400 invalid_tool_mode; any other value is refused 400 invalid_tool_mode too.
  - `dir_scope` — Optional directory-access scope: home or full. … On a later turn, one queued before the first turn ran included, the same value is accepted and a different one is refused 400 invalid_dir_scope; any other value is refused 400 invalid_dir_scope too.
  - `attachments` — … At most 4 per turn, each at most 4 MiB DECODED (~5.33 MiB of base64); the request body limit applies on top and is authoritative, so several individually-legal images can still exceed it. A violation is refused with 400 BEFORE the turn is accepted: nothing is silently dropped. `path` is not supported here: it would name a file on the CALLER's machine, so an attachment with a non-empty path refuses the whole request with 400 bad_request before a turn is accepted. If the active model cannot accept images the daemon reports that on the session stream.
- `POST /api/v1/agent/sessions/{id}/prompt:sync` body — `{ text*: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", attachments: { type*: "image", media_type*: string, data*: string, name: string }[] }` — Turn input: the user text, optional inline image attachments, plus the optional tool_mode / dir_scope the session's first turn fixes.
- `POST /api/v1/agent/sessions/{id}/messages` body — `{ text*: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", attachments: { type*: "image", media_type*: string, data*: string, name: string }[] }` — Turn input: the user text, optional inline image attachments, plus the optional tool_mode / dir_scope the session's first turn fixes.
- `POST /api/v1/agent/sessions/{id}/prompt:stream` body — `{ text*: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", attachments: { type*: "image", media_type*: string, data*: string, name: string }[] }` — Turn input: the user text, optional inline image attachments, plus the optional tool_mode / dir_scope the session's first turn fixes.

### `sessions.waiters` (4) — Waiters of a session: wait for an outcome in another session's work

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/agent/sessions/{id}/waiters/{waiter_id}` | Cancel a waiter. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions/{id}/waiters` | Wait for an outcome in another session's work. | `H:Idempotency-Key` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/sessions/{id}/waiters/{waiter_id}` | Get a waiter. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/waiters` | List a session's waiters. | `?state` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |

**Param notes:**

- `Idempotency-Key` — Optional retry key, 1–255 printable ASCII: the same key and body answers the waiter it created.
- `state` — Only waiters in this state.

**Body shapes:**

- `POST /api/v1/agent/sessions/{id}/waiters` body — `{ target*: string, outcomes*: { name*: string, when: string, match: object }[], max_s: int, from: string, max_checks: int, on_timeout: "continue" | "stop" | "ask", label: string }` — The waiter.
  - `target` — The session to watch: live, in the same realm, not the path session.
  - `outcomes` — 1 to 4 outcomes. The first found ends the waiter; outcomes found in the same check are listed in also_found.
  - `max_s` — Seconds until the deadline, 10 to 86400. Default 600.
  - `from` — A target turn id: read the target's events from that turn's start (also a turn sent but not started yet). Without it, only events after creation are read.
  - `max_checks` — The most model requests, 1 to 60, a retried request counting again. Default 20. When they are spent, only exact outcomes and the deadline are left.
  - `on_timeout` — Optional note for the creator on what to do at the deadline; kept on the waiter, not acted on.
  - `label` — Optional label, at most 80 characters.

### `settings` (9) — Process-wide settings (home settings.json)

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/settings` | Get settings. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `GET /api/v1/agent/settings/agent-instructions` | Get a realm's agent instructions. | `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/settings/spend-caps` | Read the spend caps. |  |
| `GET /api/v1/agent/settings/where-agents-work` | Read where agents may work. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/settings/features` | List the agent features. |  |
| `PUT /api/v1/agent/settings/agent-instructions` | Set a realm's agent instructions. | `H:X-Hoody-Realm` `?realm` `body*` |
| `PUT /api/v1/agent/settings/spend-caps` | Set the spend caps. | `body*` |
| `PATCH /api/v1/agent/settings` | Patch settings. | `body*` |
| `PATCH /api/v1/agent/settings/features` | Change agent features. | `body*` |

**Body shapes:**

- `PUT /api/v1/agent/settings/agent-instructions` body — `{ text*: string, enabled*: bool, expected_revision*: string }` — The new instructions.
  - `text` — The instructions (may be empty).
  - `enabled` — Whether agents get them.
  - `expected_revision` — The revision last read.
- `PUT /api/v1/agent/settings/spend-caps` body — `{ max_session_usd*: number, max_turn_usd*: number, action*: "stop" | "warn", expected_revision*: string }` — The new caps.
  - `max_session_usd` — The cap on one chat's whole spend in US dollars, 0 to 1000000; 0 is off.
  - `max_turn_usd` — The cap on one turn's model requests in US dollars, 0 to 1000000; 0 is off.
  - `action` — What a reached cap does.
  - `expected_revision` — The revision last read; empty when no file existed.
- `PATCH /api/v1/agent/settings` body — `{ patch*: object }` — The settings patch.
  - `patch` — Top-level keys to merge into the home settings.json (a null value deletes the key).
- `PATCH /api/v1/agent/settings/features` body — `{ features*: { [key: string]: bool } }` — The features to change.
  - `features` — Feature name → true or false, for at least one writable feature.

### `skills` (10) — Reusable agent skill definitions

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/skills` | Create a skill. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/skills/delete` | Delete a skill. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/skills/toggle` | Enable/disable a skill. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/skills/source` | Read a skill's source. | `?root_dir` `?rel_dir` `?root` `?rel` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/skills/import/apply` | Apply a skill import. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/skills` | List skills. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/skills/rename` | Rename a skill. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/skills/import/scan` | Scan for importable skills. | `?source*` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `PUT /api/v1/agent/skills/source` | Write a skill's source. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/skills/trust` | Set a skill's trust state. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `root_dir` — Skill root directory (identity; alias: root).
- `rel_dir` — Skill relative directory (identity; alias: rel).
- `root` — Friendly alias of root_dir (translated to root_dir server-side).
- `rel` — Friendly alias of rel_dir (translated to rel_dir server-side).
- `source` — Which tool's skills to scan.

**Body shapes:**

- `POST /api/v1/agent/skills` body — `{ name*: string }` — Name of the skill to scaffold. The description and body are NOT settable here: write them with PUT /api/v1/agent/skills/source afterwards.
  - `name` — Skill name (also the SKILL.md directory stem, and the frontmatter `name`). Must not collide with an existing skill in any root.
- `POST /api/v1/agent/skills/delete` body — `{ root_dir*: string, rel_dir*: string }` — Skill identity.
- `POST /api/v1/agent/skills/toggle` body — `{ name*: string, disabled: bool }` — Effective skill name + new disabled state.
  - `name` — Effective skill name (NOT root/rel; toggle is name-scoped).
  - `disabled` — true to disable the skill, false to enable it.
- `POST /api/v1/agent/skills/import/apply` body — `{ source*: "claude" | "codex", items*: { source: string, rel_dir*: string }[], overwrite: bool }` — The discovered skills to import: the import source and the selected entries returned by the import scan, plus an optional overwrite flag. A client-supplied filesystem path is not an input: every source location is re-derived from the source and the selected entry.
  - `source` — The import source the entries were scanned from.
  - `items` — The selected scan entries to import. At least one is required.
  - `overwrite` — Replace an already-installed skill at the same destination instead of refusing that entry. Defaults to false.
- `POST /api/v1/agent/skills/rename` body — `{ root_dir*: string, rel_dir*: string, new_name*: string }` — Skill identity + new name.
  - `new_name` — New skill directory name.
- `PUT /api/v1/agent/skills/source` body — `{ root_dir*: string, rel_dir*: string, content*: string, base_gen: int }` — Skill identity + new source body.
  - `content` — New SKILL.md body (alias: source).
  - `base_gen` — Optional: the `gen` returned by GET /api/v1/agent/skills/source (or a previous PUT /api/v1/agent/skills/source). A save whose SKILL.md changed since is refused 409 revision_conflict (details.current_gen) and writes nothing. Omit or pass 0 to save unconditionally.
- `POST /api/v1/agent/skills/trust` body — `{ root_dir*: string, rel_dir*: string, trusted*: bool }` — Skill identity + trust flag.
  - `trusted` — true to grant execution trust, false to revoke.

### `skills.hub` (5) — Skill hub

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/agent/skills/hub/cache` | Clear the skill hub cache. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `GET /api/v1/agent/skills/hub/cache` | Skill hub cache stats. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `POST /api/v1/agent/skills/hub/install` | Install a hub skill. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/skills/hub/preview` | Preview a hub skill. | `?provider*` `?source*` `?skill_id*` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `GET /api/v1/agent/skills/hub/search` | Search the skill hub. | `?query*` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |

**Param notes:**

- `provider` — Hub provider of the skill (a search result's ref.provider).
- `source` — Source of the skill on the hub, such as owner/repo (a search result's ref.source).
- `skill_id` — Hub skill id (a search result's ref.skill_id).
- `query` — Search text. Required and non-empty.

**Body shapes:**

- `POST /api/v1/agent/skills/hub/install` body — `{ package_digest*: string, overwrite: bool }` — The previewed package to install.
  - `package_digest` — The `package_digest` GET /api/v1/agent/skills/hub/preview returned. The install takes exactly that cached package, so preview first; a digest no longer in the cache is refused (preview again).
  - `overwrite` — Replace a skill already installed under the same name. Without it (default false) such an install is refused.

### `todos` (17) — Computer-aware task list management

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/todos/{id}/proposals/{pid}/approve` | Approve a todo proposal. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/todos/{id}/archive` | Archive a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/todos/{id}/cancel-run` | Cancel a todo's run. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/todos/{id}/claim` | Claim a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/todos` | File a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/todos/{id}/messages` | Comment on a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/todos/{id}/proposals/{pid}/deny` | Deny a todo proposal. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `GET /api/v1/agent/todos/{id}` | Read a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/todos/revision` | Get the todos store revision. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/todos` | List todos. | `?states` `?tags` `?query` `?open_only` `?all` `?sort` `?realm` `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `POST /api/v1/agent/todos/purge` | Purge archived todos. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/todos/{id}/release` | Release a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/todos/{id}/message` | Comment + run an orchestrator turn. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/todos/{id}/snooze` | Snooze a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/todos/{id}/run` | Run a todo's orchestrator. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/todos/triage` | Run an LLM triage pass. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/todos/{id}` | Update a todo (CAS). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `states` — Only todos in one of these states. Repeat the parameter for several (?states=ready&states=blocked).
- `tags` — Only todos carrying these tags. Repeat the parameter for several (?tags=a&tags=b).
- `query` — Free-text filter over title/body.
- `open_only` — When true, only open (non-terminal) todos.
- `all` — When true, include archived todos. Closed todos are listed without it.
- `sort` — List order. `default` (or omitted): open todos first, then priority, rank, number. `closed_at`: closed todos by `closed_at`, newest first; todos without a `closed_at` follow in the default order. Any other value is 400.
- `realm` — The realm to list: "global" (todos not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. _(on `GET /api/v1/agent/todos`)_

**Body shapes:**

- `POST /api/v1/agent/todos/{id}/proposals/{pid}/approve` body — `object` — No body fields are read; the todo {id} and proposal {pid} come from the path.
- `POST /api/v1/agent/todos/{id}/archive` body — `{ revision*: int }` — CAS guard (the {id} comes from the path).
  - `revision` — The TODO's own current `revision` (from GET /api/v1/agent/todos/{id}); required: a stale or absent value is rejected.
- `POST /api/v1/agent/todos/{id}/cancel-run` body — `{ expected_run: string }` — The todo {id} comes from the path; the body is optional.
  - `expected_run` — Cancel only this run (a `run_id`). When another run holds the todo, the cancel is refused with 409 run_changed and `details.run_id` and `details.session_id` name the current run. Omitted: cancel whichever run holds the todo.
- `POST /api/v1/agent/todos/{id}/claim` body — `{ session_id*: string, revision: int }` — Lease owner + CAS guard (the {id} comes from the path).
  - `session_id` — Identity that will OWN the lease. Required and non-empty. POST /api/v1/agent/todos/{id}/release must present the same value; while the lease is live another session_id cannot claim the todo.
  - `revision` — … CONDITIONALLY required: a FRESH claim (no live lease, or a lease held by another session_id) must carry it: omitting it is 400 bad_request, and a stale one is 409 todo_conflict. … It is not in the schema's required list only because of that second case.
- `POST /api/v1/agent/todos` body — `{ title*: string, body: string, priority: int, tags: string[], cwd: string }` — New todo (deterministic triage runs server-side). The todo's working directory is taken from the body `cwd` OR, if omitted, the X-Hoody-Cwd request-scope header; one of the two is required (an empty cwd is rejected).
  - `title` — Todo title. Longer input is not rejected: the title is cut to its first 200 Unicode code points before it is stored.
  - `body` — Todo body / description. Longer input is not rejected: the body is cut to its first 1,024 Unicode code points before it is stored.
  - `priority` — Optional priority band 0..4 (0 = P0 urgent … 4 = P4 someday); defaults to 2 when omitted. Must be a JSON integer in range: a string or out-of-range value is rejected.
  - `tags` — Optional tags. Each is trimmed of whitespace and a leading #, cut to 40 code points; empty and duplicate tags are dropped, and at most 12 are kept.
  - `cwd` — The todo's working directory (labels the record's computer/path). Defaults to the X-Hoody-Cwd request-scope header when omitted; one of the two must be set.
- `POST /api/v1/agent/todos/{id}/messages` body — `{ text*: string }` — Comment text (the {id} comes from the path).
  - `text` — The comment body to append to the todo timeline. Longer input is cut to its first 1,024 Unicode code points.
- `POST /api/v1/agent/todos/{id}/proposals/{pid}/deny` body — `object` — No body fields are read; the todo {id} and proposal {pid} come from the path.
- `POST /api/v1/agent/todos/purge` body — `object` — … Every `_`-prefixed key is ignored, and scope fields sent in the body (cwd, config_dir, computer, realm) are removed: a route that uses the request scope takes cwd and config_dir from the scope headers. … No body fields are read: the request's realm (X-Hoody-Realm or ?realm=) decides which archived todos are purged, and a realm in the body is ignored. …
- `POST /api/v1/agent/todos/{id}/release` body — `{ session_id*: string, outcome*: "done" | "blocked" | "failed" | "cancelled", summary: string, question_for_human: string }` — Lease owner + run outcome (the {id} comes from the path).
  - `session_id` — The session that owns the lease. Required, and must match the value POST /api/v1/agent/todos/{id}/claim leased under; a mismatch is refused.
  - `outcome` — How the run ended. done → review; blocked → blocked; failed → ready and increments the attempt counter; cancelled → ready without incrementing it. Required: any other value is rejected.
  - `summary` — Short account of what the run did, written to the timeline as the run_end entry (capped at 1024 characters).
  - `question_for_human` — A question to surface to the operator alongside the outcome: the field a blocked run uses to say what it needs (capped at 1024 characters).
- `POST /api/v1/agent/todos/{id}/message` body — `{ text*: string }` — Comment text that kicks an orchestrator turn (the {id} comes from the path). Returns {job_id}.
  - `text` — The message that both comments and prompts the orchestrator. Longer input is cut to its first 1,024 Unicode code points.
- `POST /api/v1/agent/todos/{id}/snooze` body — `{ wake_at*: string, revision*: int }` — Snooze target (the {id} comes from the path). The daemon reads `wake_at` + the CAS `revision`; there is no `until` field.
  - `wake_at` — Wake time, RFC3339 (e.g. 2026-07-04T09:00:00Z); an empty string clears the snooze.
  - `revision` — The TODO's own current `revision` (from GET /api/v1/agent/todos/{id}); a stale value is rejected.
- `POST /api/v1/agent/todos/{id}/run` body — `object` — JSON object of the operation's fields. Every `_`-prefixed key is ignored, and scope fields sent in the body (cwd, config_dir, computer, realm) are removed: a route that uses the request scope takes cwd and config_dir from the scope headers. …
- `POST /api/v1/agent/todos/triage` body — `object` — … Every `_`-prefixed key is ignored, and scope fields sent in the body (cwd, config_dir, computer, realm) are removed: a route that uses the request scope takes cwd and config_dir from the scope headers. … No body field filters the pass: each call triages at most the first 10 inbox todos in list order. …
- `PATCH /api/v1/agent/todos/{id}` body — `{ revision*: int, title: string, body: string, state: "inbox" | "ready" | "blocked" | "review" | "done" | "dropped", priority: int, rank: int, tags: string[], cwd: string, automation: "" | "inherit" | "manual" | "triage" | "full", suggested_agent: string, needs_human: bool, question_for_human: string, blocked_reason: string, wake_at: string, reason: string }` — CAS-guarded field patch / state transition (the {id} comes from the path). Only the keys present are patched.
  - `revision` — The TODO's own current `revision` (from GET /api/v1/agent/todos/{id}, NOT the store-wide revision); a stale value is rejected.
  - `title` — New title. Longer input is not rejected: the title is cut to its first 200 Unicode code points before it is stored.
  - `body` — New body. Longer input is not rejected: the body is cut to its first 1,024 Unicode code points before it is stored.
  - `state` — … Any other move is 400 bad_request ("invalid transition <from> → <to>"), and so is any update to an archived todo, whatever its revision. Otherwise the revision is checked first: a stale one is 409 todo_conflict whatever the state. …
  - `priority` — New priority.
  - `rank` — New ordering rank.
  - `tags` — New tag set. Each is trimmed of whitespace and a leading #, cut to 40 code points; empty and duplicate tags are dropped, and at most 12 are kept.
  - `cwd` — Retarget the todo's working directory.
  - `automation` — New automation level: inherit (follow the project or global setting), manual (never act on its own), triage (triage only, never run) or full (triage and run). An empty string leaves the level unchanged; any other string is 400 bad_request.
  - `suggested_agent` — The agent suggested to work on the todo. An empty string clears it.
  - `needs_human` — Whether the todo waits for a person. A move to done or dropped, or out of blocked, clears it unless the same request sets it.
  - `question_for_human` — The question the todo puts to a person. An empty string clears it. A move to done or dropped, or out of blocked, clears it unless the same request sets it.
  - `blocked_reason` — Why the todo is blocked. An empty string clears it.
  - `wake_at` — Snooze the todo until this RFC 3339 time, or send an empty string to clear the snooze. Any other text, or a value that is not a string (null included), is 400 bad_request. …
  - `reason` — Optional free text for the audit trail. When the request moves the todo to another state, it is recorded on that state change in the todo's timeline; otherwise it is not stored.

### `tools` (6) — Tool catalogue and gated tool execution

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/tools/{name}` | Get one tool schema. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `GET /api/v1/agent/tools` | List the tool catalogue. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `GET /api/v1/agent/tools/read-only` | List the read-only tool subset. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `POST /api/v1/agent/tools/{name}/run` | Run a tool (sessionless, gated). | `?confirm` `?confirm_token` `H:X-Hoody-Tool-Mode` `H:X-Hoody-Dir-Scope` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/tools/{name}/stream` | Run a tool with a streamed result (sessionless, gated). | `?confirm` `?confirm_token` `H:X-Hoody-Tool-Mode` `H:X-Hoody-Dir-Scope` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/tools/{name}/runAsync` | Run a tool asynchronously (sessionless, gated). | `?confirm` `?confirm_token` `H:X-Hoody-Tool-Mode` `H:X-Hoody-Dir-Scope` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `confirm` — Query alias of the body `confirm` field: re-issue a previously-parked confirmation (pair with confirm_token).
- `confirm_token` — Query alias of the body `confirm_token` field: the single-use token of the parked run (see the body field).
- `X-Hoody-Tool-Mode` — Sessionless tool-mode for the ephemeral session: `standard` (the default) or `orchestrator`. Any other value is refused 400 invalid_tool_mode. Ignored on the in-session run (it inherits the session's frozen tool-mode).
- `X-Hoody-Dir-Scope` — Sessionless directory-access scope for the ephemeral session: home (the default) or full. Any other value is refused 400 invalid_dir_scope. Ignored on the in-session run (it inherits the session's frozen dir-scope).

**Body shapes:**

- `POST /api/v1/agent/tools/{name}/run` body — `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }` — Tool parameters and an optional confirmation posture. Caller-supplied `confirmed`/`_`-prefixed control keys are ignored: they are never trusted from the wire.
  - `params` — The tool's input parameters (its JSON-Schema body).
  - `confirm` — … MUST be paired with the confirm_token of the parked run; a confirm:true with no valid token does NOT bypass the gate: the run is sent unconfirmed, so it parks again, except that a sessionless run of a non-read-only tool without allow_mutations is refused 400 tool_mutation_refused. …
  - `confirm_token` — The single-use token of the parked run: in the 409 tool_needs_confirmation details of POST /api/v1/agent/tools/{name}/run and POST /api/v1/agent/sessions/{id}/tools/{name}/run, in the polled job result of POST /api/v1/agent/tools/{name}/runAsync (whose own answer is a 202), and in the needs_confirmation frame of POST /api/v1/agent/tools/{name}/stream (whose own answer is a 200 stream). …
  - `allow_mutations` — Sessionless only: opt a non-read-only tool into running with every permission check applied (else a sessionless mutating run is refused 400 tool_mutation_refused). Set it on the first call; a confirm:true without a valid confirm_token does not stand in for it.
- `POST /api/v1/agent/tools/{name}/stream` body — `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }` — Tool parameters and an optional confirmation posture. Caller-supplied `confirmed`/`_`-prefixed control keys are ignored: they are never trusted from the wire.
- `POST /api/v1/agent/tools/{name}/runAsync` body — `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }` — Tool parameters and an optional confirmation posture. Caller-supplied `confirmed`/`_`-prefixed control keys are ignored: they are never trusted from the wire.

### `usage` (3) — Usage rollups

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/statistics` | Cross-session statistics. | `?scope` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/usage/by-account` | Usage rollup by account. | `?since` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |
| `GET /api/v1/agent/usage/by-model` | Usage rollup by model. | `?since` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` |

**Param notes:**

- `scope` — cwd (default) rolls up the current working directory; all rolls up the sessions of every working directory in the selected realm that the signed-in account can see.
- `since` — Unix-seconds lower bound; omit for all-time. A negative/non-numeric value is rejected 400.

### `workflows` (8) — Multi-step workflow definitions and runs

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/agent/workflows/{name}` | Delete a workflow definition. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/workflows/{name}` | Read one workflow definition. | `?include_revision` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/workflows/{name}/hide` | Hide or un-hide a workflow. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body` |
| `GET /api/v1/agent/workflows` | List workflow definitions. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions/{id}/workflow/messages` | Send a message to a running workflow. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |
| `PUT /api/v1/agent/workflows/{name}` | Create or replace a workflow definition. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `PUT /api/v1/agent/workflows/{name}/summary` | Set or clear a workflow's summary. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/workflows/{name}/runs` | Run a workflow in a new session. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Computer` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `include_revision` — If "true", the tool output's first line is `revision: <opaque>`: pass that value as the PUT /api/v1/agent/workflows/{name} expected_revision to guard against concurrent edits; the JSON below it is unchanged. Strictly parsed: exactly one value, "true" or "false"; anything else (empty, "TRUE", "1", repeated) is a 400 bad_request.

**Body shapes:**

- `POST /api/v1/agent/workflows/{name}/hide` body — `{ hidden: bool }` — Visibility flag (the {name} comes from the path). Defaults to hidden:true.
  - `hidden` — true (default, when omitted) to hide the workflow; false to un-hide it. A value that is not a boolean is refused 400 bad_request and nothing is written.
- `POST /api/v1/agent/sessions/{id}/workflow/messages` body — `{ text: string }` — Workflow input message.
  - `text` — Feedback/input text fed to the running workflow.
- `PUT /api/v1/agent/workflows/{name}` body — `{ definition*: object, expected_revision: string, expected_absent: bool }` — The workflow definition (forwarded as the upsert_workflow tool's `definition`; the {name} comes from the path), plus the optional optimistic-concurrency guards.
  - `definition` — The full workflow definition object (steps, entry_point, summary). Validated strictly by the agent before an atomic write.
  - `expected_revision` — … If the stored workflow changed since that read, the upsert is refused with [revision_conflict] and nothing is written. … The revision is bound to the realm this request resolves to: on a gateway without a realm pin, a revision read while another realm was active is refused [revision_conflict] (current_revision is this realm's), never written into the other realm.
  - `expected_absent` — Optional create-only guard: refuse with [already_exists] (writing nothing) if any workflow with this name already exists. Use when creating a new workflow that must not overwrite an existing one. Mutually exclusive with expected_revision.
- `PUT /api/v1/agent/workflows/{name}/summary` body — `{ summary*: string, expected_revision: string }` — The new summary (the {name} comes from the path), plus the optional optimistic-concurrency guard.
  - `summary` — The new summary. An empty string clears it. Required: omitting it is a 400, not a clear.
  - `expected_revision` — … If the workflow changed or was deleted since that read, the write is refused 409 revision_conflict and nothing is written. … The revision is bound to the realm this request resolves to: on a gateway without a realm pin, a revision read while another realm was active is refused 409 revision_conflict (details.current_revision is this realm's), never written into the other realm.
- `POST /api/v1/agent/workflows/{name}/runs` body — `{ prompt: string, inputs: { [key: string]: string }, realm: string, computer: string, cwd: string, config_dir: string, model: string, agent: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", headless: bool }` — Optional run input and the new session's binding (all optional; header scope augments the body, body wins).
  - `prompt` — Optional input text fed to the workflow run ($(workflow.prompt)).
  - `inputs` — Optional run-time values for the workflow's DECLARED input parameters (declared name → string value; resolves to $(input.<name>) in every step). A workflow with a REQUIRED declared parameter cannot run without these. Values must be strings; a non-string value is a 400.
  - `realm` — Realm selector for the new session (frozen at start). A pinned gateway always uses its pin.
  - `computer` — Computer id/selector to run tools on (frozen at start).
  - `cwd` — Working directory for the session (frozen at start); it also selects the project workflow layer.
  - `config_dir` — Config directory override.
  - `model` — Model for this session; overrides the chat agent's pinned model for this session only. An unknown model is refused 422 unknown_model; a speech model 422 model_unavailable (details.reason speech_model).
  - `agent` — Initial chat-agent name.
  - `tool_mode` — Initial tool mode (frozen at start): standard (the default) or orchestrator. Any other value is refused 400 invalid_tool_mode.
  - `dir_scope` — Initial directory-access scope (frozen at start): home or full. Any other value is refused 400 invalid_dir_scope.
  - `headless` — Start the session in headless posture.

### `workflows.runs` (4) — Workflow runs

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/workflows/runs/{run_id}/cancel` | Cancel a workflow run. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/workflows/runs/{run_id}` | Get one workflow run by id. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/workflows/runs` | Snapshot in-flight and recent workflow runs. | `?realm` `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` |
| `POST /api/v1/agent/workflows/runs/{run_id}/resume` | Resume a failed or cancelled workflow run. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `realm` — The realm to list: "global" (runs not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. _(on `GET /api/v1/agent/workflows/runs`)_

**Body shapes:**

- `POST /api/v1/agent/workflows/runs/{run_id}/resume` body — `{ session_id*: string }` — The live session that executes the resume.
  - `session_id` — A live session matching the run's realm, owner, working directory, and computer binding.

