> _**SDK skill · `agent` namespace** · ~99,661 tokens · hoody-sdk v1.0.1_

# `agent` — In-computer AI coding agent over HTTP

## Purpose

The `agent` kit exposes the in-computer AI agent as a typed namespace: create a chat session, send a prompt, stream the turn (tool calls, gates, output), then confirm/answer/cancel as the agent works. services — `sessions` (with `sessions.turns`), `bots`, `definitions`, `models`, `providers`, `skills` (with `skills.hub`), `memory`, `github`, `workflows`, `tools`, `hooks`, `mcp`, `settings`, `loops`, `logs` (with `logs.export`), `jobs`, `gates`, `changes`, `headless`, `todos`, `usage` (usage statistics), plus the namespace's own calls (`whoami`, the `login` token bootstrap, `pause` and `resume`). Session tasks live under `sessions.tasks`.

## When to use

- **Drive the agent programmatically** — create a session, prompt it, and consume the turn: `client.agent.sessions.create` → stream the turn for live tool/gate/output events (per surface — see the streaming note under Quirks), or `sessions.turns.run` for one blocking call → resolve gates with `gates.approve` / `gates.deny` / `gates.answer` → `sessions.turns.cancel` to interrupt.
- **Inspect or configure the agent** — list `models` (`agent.models.list` / `agent.models.get`; the Jev decision-model catalogue is the separate `agent.jev.listModels`) and `providers.list` (configure providers via `providers.auth.setDefault` / `providers.setApiKey` / `providers.oauth.start`); switch a session's active model with `sessions.setModel`, browse/install `skills`, read/edit `memory`, manage `workflows`, `hooks`, `definitions` (named agent profiles), and `tools` — both the sessionless catalogue/registry (`tools.list` / `tools.listReadOnly` / `tools.get`, and `agent.tools.run` (blocks, returns the result; with `stream: true` it returns the one-shot result over SSE frames instead, not a per-token stream) / `agent.tools.start` (returns `{ job_id }`, poll `jobs`) to invoke a tool with no session — read-only by default, a mutating tool needs `allow_mutations: true` or a confirmed re-issue) and the per-session surface (`sessions.tools.list` for a session's *effective* tool set, `sessions.tools.listMcp`, and `sessions.tools.run`). Unlike the sessionless `agent.tools.run`, a per-session run executes against the session's *frozen* realm/computer/cwd/tool-mode and claims the session's single serial turn slot — so it returns 409 `turn_in_flight` while a turn is running, 409 `gate_parked` while a gate is open, and 404 `tool_not_found` if the tool is not in that session's effective list; whether a mutating tool may run is decided by the live session's own tool mode and confirmation settings (the `allow_mutations` escape hatch is sessionless-only).
- **One-shot non-interactive runs** — `client.agent.headless.start` (an async job, or an SSE stream with `{ stream: true }`) runs the full agent loop once over a throwaway session (see workflow 7 for the per-surface form: an async job or an SSE stream).
- **GitHub from inside the agent** — first establish an account with `github.auth.start` (a GitHub device flow → poll `github.auth.poll`) or `github.auth.login({ token })` (a PAT, persisted directly), then `github.auth.getStatus` to confirm; once an account is active, `github.repos.clone` / `github.commits.create` (and `github.getStatus` / `github.branches.list` / `github.repos.list` / `github.prs.create` / `github.sync`) for repo operations the agent performs in-computer.

## When NOT to use

- Want an interactive UI, not the API? The agent's own TUI opens at its `agent-1` URL or a terminal link with `agent=true`; in a terminal, `hoody hub` opens the Hub. This namespace is the HTTP control surface beside them.
- Raw shell / command exec → `terminal` (PTY) or `exec` (one-shot). File I/O → `files`. The agent runs these as tools internally; call them directly when you don't need the LLM.
- Account-level resources (computers, billing, realms) → `api`.

## Prerequisites

- Computer with the `agent` kit running; capability URL.
- At least one usable model provider before prompting: one with a stored API key, a stored OAuth login, or passwordless access (the shipped default agent is pinned to a passwordless model). `client.agent.providers.list` and `client.agent.models.list` list the CATALOGUE, which is populated whether or not anything is configured; `client.agent.providers.auth.getStatus` reports whether a provider is actually usable (`ready`, with `api_key_stored`, `oauth_stored` and `no_auth_ready` behind it).
- A session id from `sessions.create` for every prompt/gate/cancel call.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Prompt a session and stream the turn

`client.agent.sessions.create` (returns a session id) → stream the turn with `{ text }` to receive live events (tool calls, gates, output deltas) — see the streaming note under Quirks for the supported per-surface method (SDK helper / HTTP SSE route / CLI command) → resolve any gate as it arrives → turn ends.

### 2. One-shot synchronous prompt

`client.agent.sessions.create` → `client.agent.sessions.turns.run` with `{ text }` — waits for the turn to end, a gate that needs a person, or the server deadline (290 seconds by default). A clean turn returns `{status:"done", session_id, turn_id}` with no reply text; check `status`, because a failed, cancelled or quit turn answers `error` (with the error `event`), `canceled` or `quit`. A turn that parks on a gate returns `{pending_gate, turn_id}`. In the SDK these fields are under `.data` (`r.data.status`, `r.data.turn_id`, `r.data.pending_gate`). The SDK's own request timeout is 30 seconds by default, shorter than the server deadline: pass `{ timeoutMs: 300000 }` as the third argument of `turns.run`, or the call throws a timeout error at 30 seconds while the turn keeps running (find it with `turns.list`, then follow it with `turns.get`; do not prompt again). When the deadline passes first the answer is `503 service_unavailable` with `details.turn_id` and `details.turn_running: true`: the turn is NOT cancelled, so follow it with `client.agent.sessions.turns.get` (or the stream) instead of prompting again. Read the reply with `client.agent.sessions.getTranscript`. Best for short, non-interactive prompts where you don't need streamed events.

### 3. Resolve gates mid-turn

While a prompt streams, the agent may pause for human input: a confirmation gate → `client.agent.gates.approve` / `client.agent.gates.deny`; an open question → `client.agent.gates.answer` (to get a helper model to DRAFT an answer for a parked question call `client.agent.gates.suggest` — it does NOT answer the gate and needs a parked lead question gate (otherwise `409 no_pending_gate`; a helper's gate does not count): it dispatches an async job (HTTP 202) whose suggestion arrives via `client.agent.jobs.getResult` and an `event.question_suggestion` on the session stream — only one assist may be in flight per session — and the real answer still goes through `gates.answer`; for unattended runs arm `client.agent.sessions.autoReply.update` (a self-driving auto-user loop that answers questions only during its own rounds, so arming it does not resolve a question an ordinary prompt already parked: answer that with `gates.answer`; it also withholds write-class actions unless you opt in with `allow_writes: true`, either on the arm call or later via `sessions.autoReply.enableWrites`)). The gate identity to echo is the ENVELOPE-level `gate {id, generation, type}` that the stream frame parking the gate carries beside `seq` / `incarnation` / `event`. The `event.confirm_request` payload also has a numeric `gate_id`, but that is the daemon's id space and is never the value to echo. The answer body for a question gate: the envelope's gate id as `gate_id` (optionally its `generation`), then **answer** (or **text**, used when **answer** is blank) for a single question; for a batch (`event.user_question` carrying `questions[]`), `answers` maps each `questions[].id` to its answer text, for example `{"gate_id":"<gate.id>","answers":{"<questions[].id>":"yes"}}`. A body with no `answer`, no `text` and no `answers` is `400 bad_request` and the question stays parked. The `question_id` on `event.user_question` is a diagnostic number, not a body field. Echoing a wrong/stale `gate_id`/`generation`, or answering when nothing is parked, returns 409 (`no_pending_gate` / `stale_gate` / `gate_already_answered` / `gate_type_mismatch`). A retry of a question answer that names the gate just resolved with the same answer (a lost 200) gets `200` with `replayed: true` and the original acknowledgement, while another answer to that gate is `409 gate_already_answered`. For `gates.approve` / `gates.deny`, a decision naming a gate that already ended is `409 gate_already_resolved` (with its recorded outcome), and one naming a gate whose decision is still being applied is `409 gate_decision_pending`: retry naming the gate to learn the outcome. On a session whose approval policy is `always` and whose approver lease was ever minted (`client.agent.sessions.approverLease.claim`, or the lease handed back by a create or attach that asserted `always`), EVERY decision — `gates.approve` / `gates.deny`, and the confirmed re-issue of a gated `sessions.tools.run` — must carry the current lease capability in the `X-Hoody-Approver-Lease` request header. (SDK: the `approverLease` option.) Without it the decision is refused `409 approver_lease_required`, a capability that does not verify is `409 approver_lease_invalid`, and an expired one is `approver_lease_expired` until a holder acquires again. Interrupt a running turn with `client.agent.sessions.turns.cancel`. Tear the session down: `client.agent.sessions.close` removes it from the live map; `sessions.delete(id)` always erases the persisted record as well (the SDK method has no keep-the-record form); to keep the record, use `sessions.close` and re-attach later with `sessions.create({ attach: id })`. To roll a session back without tearing it down, `client.agent.sessions.trim` with `{ turn_idx }` truncates conversation history to (and including) that turn index.

### 4. Pick a model / provider

`client.agent.providers.list` to list the catalogued providers (and `client.agent.providers.auth.getStatus` to check that one is `ready`: a stored credential or passwordless access), `client.agent.models.list` to list the catalogued models, then `client.agent.sessions.setModel` to bind a model to a session before prompting — SYNCHRONOUS: the response reports the actual outcome ({status:'ok', model, persisted} on success; structured 409/422 errors while busy or for an unconstructable spec). For a native session, the default `scope: "agent"` switches the session and TRIES to rewrite the `model:` line of the chat agent's highest-precedence on-disk file (project before home; an embedded-only agent in a scoped realm gets a new copy in that realm's profile layer). That pin applies to later sessions resolving that file: it is per profile layer, not global. That save is best-effort, so only `persisted: true` confirms the repin — `persisted: false` means the session switched but future sessions keep the old pin. With `scope: "session"`, the switch affects only this session and leaves the agent file alone; `persisted` then says whether the session record was saved. A Claude Code (delegated) session's switch is always session-scoped, takes a Claude alias or model id, and applies from its next turn; it does not rewrite an agent file. PRECEDENCE: the agent's frontmatter `model` is the DEFAULT for a session that does not request one; an explicit model on create (`sessions.create({ model })`), or this live `sessions.setModel`, OVERRIDES that pin for the session — create is session-scoped and does not rewrite the agent, for a native session, this live switch repins the agent file it resolves with the default scope (see above). The shipped default agent ships pinned, so its pin is the out-of-the-box default until an explicit model is chosen (an explicit model together with `attach` is rejected 400, because a resumed session keeps its model; with `backend: "acp"` the model is the Claude Code model: a Claude alias such as `opus`, `sonnet` or `haiku`, or a Claude model id. Any other model is `422 model_unavailable` with `details.reason: not_claude`). Each session has further per-session knobs (all session-scoped PATCHes; while a gate is parked, `sessions.setEffort` and `sessions.setAgent` answer 200 with `deferred: true`, and the change is dropped, not queued: send it again once the turn has ended): `sessions.setEffort` (`{ effort }` — `low|medium|high|xhigh|max`, or `""` for the model default), `sessions.setVerbosity` (`{ level }` — `normal|concise|terse|minimal`), `sessions.enableHoodyEnv` / `sessions.disableHoodyEnv` (turn injection of the `HOODY_*` shell-env contract for the bash tool on or off), and `sessions.setAgent` (`{ agent }` — bind a named profile from `definitions` (`definitions.list`); `bot`, `script-writer` and `github-installer` are refused `400 bad_request` (a Bot runs `bot`, and the other two are fixed at session start: a session started on one cannot switch away)).

To use a model from an endpoint that is not in the catalogue (anything that speaks the OpenAI Chat Completions, OpenAI Responses or Anthropic Messages API from a public HTTPS address, such as a model server you run yourself or a company gateway), add it as a **custom provider** first. `client.agent.providers.create` takes `id`, `base_url` and `models`, then `client.agent.providers.setApiKey` stores its key (a key never goes in the create body), and its models are `<model_prefix>/<model>` wherever a model is chosen: `sessions.create({ model })`, `sessions.setModel` or `definitions.setModel`. `providers.update` changes it and `providers.delete` removes it, and its stored key too when the key is the one this API stored for it (the result's `api_key_removed` says whether it did). The change applies at once, with no restart: new sessions, model switches and Jev see it, and an open session on one of its models picks it up before its next turn. `id` is 1-40 lowercase letters, digits or inner hyphens and cannot change later; `model_prefix` is the `id` unless given, and must equal it; `wire_format` is `chat_completions` (default), `responses` or `messages`, and `auth_scheme` follows it (`bearer`, or `x-api-key` for `messages`). Built-in providers refuse update and delete (`409 provider_builtin`), as does a provider defined in a project's providers file (`409 provider_not_managed`). See Examples for the full run.

### 5. Skills, memory, todos, workflows, agents

- **Skills** — `client.agent.skills.list` (each carries an enabled + trust state), `skills.hub.install` / `skills.hub.search` / `skills.hub.preview` to find and install from the hub. A newly installed/imported skill must be trusted before its code runs — `client.agent.skills.trust` is the gate (identify the skill by `root_dir`+`rel_dir`; `skills.untrust` takes the trust back); `skills.enable` / `skills.disable` enable or disable by `name` (call `skills.enable({ name })` / `skills.disable({ name })` and do not pass `disabled`: each method sets it itself and refuses a caller value). Both `skills.trust` (which grants arbitrary code-execution trust) and `skills.hub.install` (which writes arbitrary skill code to disk) take effect immediately over this namespace: there is no confirmation step, and no privilege beyond ordinary access to the kit is required, so an autonomous caller can silently trust and install skill code. Add your own confirmation before exposing these to one.
- **Memory** — `client.agent.memory.search` for hybrid recall (BM25 + vector + graph) and `memory.items.list` to enumerate by `project`; `memory.items.create` / `memory.items.update` / `memory.items.delete` to write; `memory.getGraph` for the relation graph (or `memory.items.get` to read one record by `id`). `memory.enable` / `memory.disable` are the memory capture/privacy switch — they persist `features.memory` and flip the live store — and `memory.flush` forces the store's durability barrier; none of the three is admin-gated. Memory is project-scoped (pass `project`). Memory reads and item writes accept `X-Hoody-Realm` or `?realm=` to select `global` or a realm id (in the SDK, pass `agentRealm` in the method's options); omitted, the agent's current realm is used. A realm this login does not serve returns `404 not_found`; an agent pinned to one realm refuses another with `400 realm_scope_unsupported`. If the selected realm's memory is not connected, the request returns `503 service_unavailable` with `Retry-After` and does not connect it. `memory.consolidate` is a guarded write: it needs a single-use intent from `memory.createWriteIntent`; see Common errors. `memory.search` / `memory.getGraph` also return `503 store_unavailable` while the store is still warming — retry rather than treating it as an empty result.
- **Todos** — `client.agent.todos.list` / `todos.create` to file; then `todos.triage` (LLM inbox pass), `todos.claim` / `todos.release`, `todos.start` (dispatch a background orchestrator — returns `{job_id, session_id}`), `todos.cancel` to abort an in-flight run, and `todos.approveProposal` / `todos.denyProposal` to resolve a proposed run — approve is NOT inert: it spawns a background worker session equivalent to `todos.start` (a J-class autonomous run that spends model budget), while `todos.denyProposal` spawns nothing — plus `todos.snooze` / `todos.archive`. To move a todo between states (`inbox`, `ready`, `blocked`, `review`, `done`, `dropped`) or edit its fields, `todos.update` applies a CAS-guarded patch / `state` transition (`in_progress` is entered only by `todos.claim` / `todos.start`; `todos.update` refuses it, and an unknown state is rejected) — read the todo's OWN `revision` with `todos.get` and pass it back (`todos.getRevision` is a change cursor filtered by realm and account visibility, NOT the per-todo CAS token; a stale value → `409 todo_conflict`); a stale revision is rejected (409). `todos.archive` is not terminal — `todos.purgeArchived` permanently and irreversibly deletes archived todos of the selected realm that were archived more than 90 days ago (and those with a missing or invalid archive time); a read-only todo from before the computer rename is kept; no confirmation gate, treat as destructive. Mind the comment split: `todos.createComment` (`/messages`, plural) only appends a comment, whereas `todos.sendMessage` (`/message`, singular) ALSO kicks an orchestrator turn — a budget-spending LLM run that returns `{job_id}` — so use the plural form for a plain note. The `job_id` returned by `todos.start`, `todos.sendMessage` and `todos.triage` completes as `succeeded` the moment the dispatch is accepted; it records the dispatch only, not the worker's outcome. Follow the todo itself (`todos.get`, its state and timeline) rather than polling that job. Note `todos.start` / `todos.triage` / `todos.approveProposal` are J-class autonomous runs with NO confirmation gate on the RPC (reaching the RPC is itself treated as the human approval; that denial lives only on the model-facing `run_todo` *tool*), so calling them from automation silently dispatches a real LLM run — gate them in your own caller.
- **Workflows** — `workflows.list` / `workflows.get` / `workflows.set` / `workflows.delete` / `workflows.hide` / `workflows.unhide` manage saved definitions; `sessions.startWorkflow` dispatches one onto a live session and returns a JOB, not a run (optionally seed the run with a `{ prompt }` body — input text fed to the workflow). `workflows.set` takes the whole definition as `definition`; a small definition that saves is `{"entry_point":{"id":"check"},"steps":{"check":{"type":"bash","command":"echo hello"}}}` (`steps` is a non-empty object keyed by step id; this example uses a `bash` step with a `command` and ends after that step because it has no `next_steps`) — poll `client.agent.jobs.get`, checking both `status` and `run_id`: once `run_id` populates (null during the brief dispatch window), track the run via `workflows.runs.list` / `workflows.runs.get` and stop it with `workflows.runs.cancel`; a dispatch the agent refuses (a missing required input, a blocking hook, no configured model) ends the job as failed with `run_id` still null, so read its result and the session stream: no run exists to track or cancel; feed a running workflow with `client.agent.workflows.sendMessage` (`{ text }`). Run events flow on the owning session's stream, not a per-run bus.
- **Bots** — `client.agent.bots.create` opens a long-lived assistant that delegates work to sessions on computers; post to it with `bots.messages.send` (HTTP 202; a busy Bot queues the message) rather than prompting its session, and see Examples for the full create, message, follow, forget, delete run. Replace its limits with `bots.setGuardrails(id, { guardrails })` (empty clears them): the Bot reads them before its next message and delegates opened afterwards receive them in their first prompt, while delegates already open keep theirs. `allowed_computers` and `allowed_agents` restrict the delegates it opens next (empty means any) and `yolo: true` (default false) asks delegates to approve tool calls automatically. Check `yolo_unapplied` in `bots.get`: `pending` means a delegate has not confirmed the change yet and it is sent again; `refused` means that delegate's approval policy does not allow YOLO, so it keeps asking for approvals and the change is not sent again until `yolo` changes. `bots.streamLogs` and `bots.getLogs` carry finished rows only; for live reply text, thinking and tool calls follow the Bot's `session_id` (from `bots.get`, it changes after `bots.reset`) with `sessions.stream`, and do not answer questions on that session whose `frame_request.kind` starts with `bot.`, because the Bot runtime answers them. To stop only the Bot's running turn, call `client.agent.bots.cancelTurn(id, { turn_id })`, naming the `turn_id` that `bots.get` shows while `turn_running` is true.
- **Share a Bot through a public URL** — a Bot URL, `https://<label>.hoody.bot`, lets a person with no Hoody account talk to one of your Bots with a named key (`hbk_…`) you hand out. It belongs to your account, not to the agent kit: `client.api.botUrls` (and `client.api.botUrls.keys`) creates and manages it, and `new BotUrlClient({ url, key })` from `hoody-sdk` is the caller side. You name the Bot by the `realm`, `id` and `uid` that `bots.get` returns. A Bot has one Bot URL at most, a deleted and recreated Bot has a new `uid` that the URL does not follow (`repoint` it), and everyone holding a key shares one conversation with the Bot. Example 4 runs the whole flow (create, key, call, rotate, panic); the `## Bot URLs` section of the appendix is the reference for the doors, the caller client and the errors.
- **Audio / voice** — the kit speaks and listens through the speech models it lists. `client.agent.audio.listModels({ capability: 'tts' | 'stt' })` lists the text-to-speech and speech-to-text models with their formats, rates, languages and whether their provider has a key; `audio.listVoices({ model })` lists a model's voices (omit `model` for the voices of every available model except the Hoody AI relay ones, which are listed only when named). `audio.createSpeech({ input, model?, voice?, instructions?, response_format?, speed? })` speaks `input` (at most 4096 characters) and resolves to the whole audio as an `ArrayBuffer` in `data`; `audio.createSpeech(body, { stream: true })` is the same call as SSE (`speech.audio.delta` frames carrying base64 audio, then `speech.audio.done` with `usage`), for models that stream; its `response_format` is `pcm` or `mp3` (default `pcm` when the model streams PCM, otherwise `mp3`), and `wav` is refused `400`. `audio.createTranscription(form)` takes a `FormData` with one recording under `file` (wav or mp3, at most 16 MiB and 600 seconds; `model`, `language`, `prompt` and `response_format` as further fields) and resolves to `{ text }` in `data` with the default `response_format` `json` (`text`: the plain transcript; `verbose_json`: `text` plus `language`, `duration` and `segments` when the model gives them); `audio.createTranscription(form, { stream: true })` is the SSE form (`transcript.text.delta`, then `transcript.text.done` with the whole `text`), wav and mp3 only, for models with partial results. A capability the model lacks (a format, `instructions`, a `speed`) is refused `400` before any paid call; `response_format` is `mp3`, `wav` or `pcm` (16-bit little-endian mono, no header; omitted: `wav`, or `mp3` when the model gives no wav, and on a stream `pcm`, else `mp3`). Some transcription models also take webm, ogg, m4a or flac on the non-streaming call (the model's `opaque_formats`): Hoody passes those on undecoded, does not verify their duration, and bills the provider's reported duration or the model's maximum when none is reported. Every speech call is billed, a stream included, so do not replay a stream automatically; a failure before the first frame is an ordinary JSON error with its status, after it an `error` frame, and a `: ping` comment arrives every 25 s. `X-Hoody-Realm` (or `?realm=`, `agentRealm` in the options) names the realm the call is billed to; omitted, the agent's current realm. The cwd, config-dir and computer headers are refused `400 realm_scope_unsupported`.
- **Spoken messages to a Bot** — `client.agent.bots.messages.sendAudio(id, form)` (a `FormData` with the recording under `file` and an optional `language`) transcribes one recording (wav or mp3, at most 16 MiB and 600 seconds) and queues the transcript as a message to the Bot exactly like `bots.messages.send`: `202 { message_id, state: 'posted' | 'queued' | 'dropped', turn_id?, transcript }`. `dropped` means the Bot dropped the message before posting it and never will post it (`reason` says why); that key keeps answering `dropped`, so send the recording again under a new key. Audio with no speech in it is answered `200 { no_speech: true }` and nothing is queued or billed. Send an `Idempotency-Key` (the `idempotencyKey` option) on anything you may retry: once the message is admitted, the same key with the same audio, the same `language` and the Bot's same `speech.stt_model` and `speech.stt_prompt` returns the same `message_id` without transcribing again (a replay of a finished one has no `transcript`; a retry that waited on one still running gets it), and the same key with any of those changed is `422`, even for the same recording. A transcription that failed or was refused stores nothing, so a retry with that key transcribes again; a recording with no speech in it is answered `no_speech` each time, without a transcription. At most 4 recordings per Bot are transcribed at once (`503 speech_busy` past it); a request repeating the key of one still running waits for it (`429 speech_busy` when too many wait); `409 bot_deleted` or `bot_reset` means the Bot was deleted or reset before the recording was admitted. The Bot's `speech` settings (`tts_model`, `stt_model`, `voice`, `language`, `speed`, `speak_wakes`, `speak_gates`) choose the models and voice used for its spoken messages and replies.
- **Talk to a Bot by voice (WebSocket)** — `GET /api/v1/agent/bots/{id}/voice` upgrades to a WebSocket (request it with `Sec-WebSocket-Protocol: hoody.voice.v1`) that carries the user's speech to the Bot and the Bot's spoken replies back (`client.agent.bots.connectVoice(id, { in_rate?, out_rate?, in_format?, mode?, voice?, language?, speak?, require?, speak_wakes?, takeover? }, undefined, { reconnect?, connectTimeoutMs?, transport? })`, which offers the subprotocol itself; the last argument, `wsOptions`, sets reconnecting (default on), the connect timeout (default 30000 ms) and `transport: 'ws'`, which reads a refused upgrade's status and body (the built-in WebSocket of Node and Bun cannot): `connect()` then rejects with a `WebSocketUpgradeRefusedError` (4xx except 408/425/429; permanent) or a `WebSocketUpgradeFailedError` (other statuses), both with `status`, `code`, `serverMessage`, `details` and `retryAfterSecs` when the agent sent them, and both importable with their `is…` guards from `hoody-sdk`; `client.agent.bots.getVoiceCheck(id, { speak? })` is the readiness check and returns no socket; the socket `connectVoice` returns is NOT connected yet: register its handlers, then `await socket.connect()`; on it, `sendInputAudio(seq, audio)` sends an input frame from the PCM bytes or typed array you pass, `onOutputAudio(({ out, offset, pcm }) => …)` receives each output frame decoded, and the JSON frames have their own methods such as `pttDown()` and `onReplyFinal(…)`). `getVoiceCheck` answers 200 either way with `{ ready, speak, stt, tts, max_utterance_secs, diag_id? }`: `stt` and `tts` (`null` with `speak=false`) each carry `ok` and `model` (plus `language` or `voice`), and when `ok` is false also `code`, `reason`, `message`, `retryable` and, when known, `retry_after_secs` and `diag_id`. It follows the inference path (the Bot's own model, else the agent's `audio.stt_model` and `audio.tts_model` settings, else the Hoody AI voice relay when the audio setting `relay_default` is on; then capability, voice and language, then key), runs no inference, bills nothing and takes at most 6 s; `ready` is not a promise that the provider will answer. `require=stt`, `require=tts` or `require=stt,tts` on the voice URL runs the same check before the upgrade and refuses it `400 bad_request` when every failure is a voice or language the model does not offer, else `503 speech_unavailable`, with the check's result in `details` (messages may be shortened and the echoed model, voice and language values removed to fit the error's size limit; `details` is omitted if the reduced result still does not fit); a refused check takes nothing over; omitted, nothing is checked; `require=tts` with `speak=false` is `400`. `speak=false` gives text-only replies: no speech is made, every `reply.final` has `spoken: false`, nothing is billed for synthesis (speech-to-text still is), and the `session` frame shows `speak: false`. An agent supports `require`, `speak` and the check when `GET /api/v1/agent/version` lists the capability `bot_voice_check` with `supported` and `available` true. `mode` is fixed for the connection (default `vad`); in `ptt` mode only audio between `ptt.down` and `ptt.up` counts and other audio is dropped. One utterance is at most 60 seconds, or the speech-to-text model's limit when lower. Binary frames from the client are input audio: one byte `0x00`, a big-endian unsigned 32-bit sequence number, then 20 to 200 ms of audio in `in_format` (`pcm16` default, `pcmu`, `pcma`) at `in_rate` (8000, 16000 default, 24000 or 48000); binary frames from the agent are output audio: one byte `0x01`, a big-endian unsigned 32-bit output number, a big-endian unsigned 32-bit sample offset, then 16-bit little-endian PCM at `out_rate` (default 24000). Text frames are JSON objects with a `type`: the client sends `input.commit`, `ptt.down` / `ptt.up` (`mode=ptt`; the default `vad` lets the agent hear when the user starts and stops), `output.cancel`, `playback.mark` (with `play_lead=true`, at least every 500 ms while playing), `own_gate.decide` / `own_gate.answer`, `text` and `ping`; the agent sends `session` first, then `vad.start` / `vad.end`, `transcript.partial` / `transcript.final`, `reply.provisional` / `reply.invalidate` / `reply.final` / `reply.diverged`, `output.start` / `output.end` / `output.stop`, `cancel.result`, `gate.announced`, `own_gate.pending` / `own_gate.resolved`, `busy`, `error`, `takeover` and `pong`. A spoken message counts once the Bot's log shows it; only replies to this connection's own messages are spoken (plus the Bot's own replies with `speak_wakes`), and every reply's final text still arrives in `reply.final` (at most 64 KiB: a longer text is cut and `truncated` is true; the whole text is in the Bot's log). Voice never answers a delegate's approval or question: answer it on screen or by typing. One connection controls a Bot's voice at a time, over this route, the Realtime route or a phone call: a second is refused `409 voice_busy` unless it asks `takeover=true`, which closes the first (it receives `takeover`, close 1000). `reply.final` carries `own: true` when its turn answers a message sent on this connection, `false` when it does not, and no `own` when the connection cannot tell; `own` is about this connection only: a new connection starts at the next event, so a reconnect that misses the turn start gets no `own` on that reply (not `own: false`), and when it is absent match the reply's `turn_id` and your `message_id` in the Bot's log. A speech failure carries `error { code, reason?, message, diag_id?, retryable, retry_after_secs? }`: on `transcript.final` when it `failed` or was `rejected` `stt_suspect` (the outer `failed` value is unchanged; branch on `error.code` when present), on `reply.final` when `reason` is `tts_failed` or `tts_incomplete`, and on an `error` frame with code `service_unavailable` when the speech service failed while a gate announcement was spoken (at most once per code and reason per connection; the connection stays open; an announcement stopped for the daily speech limit, or silenced because speech output is off, sends no error frame). `message` says what happened and what to do next; `diag_id` names the failure in the agent's log. A `pcm16` frame of an odd byte length, a sequence gap, or audio faster than 1.5 times real time over 2 s counts as lost: the open utterance ends `rejected: frame_loss` and the connection stays open. The connection closes 1000 when the client closes it, after 10 minutes without a frame from the client (the Bot's output does not count; send `ping`), on takeover or when the Bot is deleted or suspended; 1001 when the Bot is stopped (as when the agent shuts down); 1002 without the subprotocol; 1008 for a malformed frame, text frames faster than 50 a second once the burst of 100 (the bucket starts full) is used up, an input frame outside 20 to 200 ms or a `playback.mark` past the audio sent; 1009 for a frame over 64 KiB; 1011 when a write fails, the agent runs out of voice memory, or on an internal error (a client that does not read gets no close frame; the connection just ends). The Bot's own approvals and questions (`own_gate.decide` / `own_gate.answer`) report their outcome in `own_gate.resolved` (`applied`, `resolved`, `stale`, `unavailable`, `not_offered`, `no_pending_gate`, `stale_gate`, `gate_cancelled` or `decision_unconfirmed`), never as an HTTP status.
- **Talk to a Bot with an OpenAI Realtime client (WebSocket)** — `GET /api/v1/agent/bots/{id}/realtime` upgrades to a WebSocket that speaks the OpenAI Realtime protocol (GA event names), so an off-the-shelf Realtime client library talks to the Bot (`client.agent.bots.connectRealtime(id, { takeover? })`, which returns a socket that is NOT connected yet: register its handlers, then `await socket.connect()`; each client event's method takes the event's fields, as in `input_audio_bufferAppend({ audio })` with base64 audio). The client sends `session.update`, `input_audio_buffer.append` / `.commit` / `.clear`, `conversation.item.create` / `.delete` / `.retrieve` / `.truncate`, `response.create` and `response.cancel`; the agent answers with the matching server events (`session.created` first). Input audio is `audio/pcm` (24000 Hz, 16-bit little-endian, the default), `audio/pcmu` or `audio/pcma` (8000 Hz); output audio follows the session's output format. With `server_vad` the agent hears when the user starts and stops speaking and answers on its own; without turn detection the client commits and asks with `response.create`. A user item reaches the Bot once, by its id, and the Bot never forgets an id it has seen, so a client replaying its history on reconnect does not resend an old item; at the Bot's limit (`realtime_items` on the Bot) a new item is refused and the connection closed. An event that would change an item already sent (deleting, truncating or editing a user item waiting for a response) closes the connection with 1008; so do a binary or non-JSON frame, a frame over 1 MiB, control events faster than 50 a second once the burst of 100 (the bucket starts full) is used up, and input audio faster than 1.5 times real time. The same one-controller rule applies: `409 voice_busy` unless `takeover=true`. A WebSocket upgrade of the Bot's own OpenAI base URL plus `/realtime` (`…/api/v1/agent/bots/<realm>/<bot>/v1/realtime`, the `urls.openai` of `bots.get` plus `/realtime`) opens the same connection for a Realtime client that only takes a base URL, with the same `?takeover=true`.
- **A phone call as the Bot's voice** — `GET /api/v1/agent/bots/{id}/twilio` is the WebSocket URL for Twilio's `<Connect><Stream>` instruction: one Twilio Media Stream becomes the Bot's voice controller (`client.agent.bots.connectTwilio(id, { takeover? })` returns a socket client for a relay you write, NOT connected yet: register its handlers, then `await socket.connect()`; the Media Streams frames are Twilio's, named by `event`, and each send method takes the frame's fields, as in `media({ streamSid, media: { payload } })`, so it is for a relay you write yourself). Audio is μ-law at 8000 Hz, mono; Twilio's `connected`, `start`, `media`, `mark`, `stop` and `dtmf` events are taken as Twilio documents them. What the caller says is cut into utterances by voice activity detection, each transcribed in order and posted to the Bot as the user's message; the reply comes back as 20 ms media frames with one `mark` per spoken segment, and a caller speaking over the reply stops its playback (a `clear` is sent). A `stop` event, or the call ending, drops the utterance still being spoken (never transcribed or posted); complete ones are still posted. DTMF digits are ignored, and gates are never announced or answered by voice. A second controller is refused and its stream closed with code `1008` unless the `start` event's custom parameter `takeover=true` (or `?takeover=true` on the URL) asks to take over from the open one. Access to this URL is controlled by the agent's proxy permission rules; configure one before pointing a Twilio number at it. Live Twilio accounts are not supported in this release: the route is tested against a Twilio Media Streams simulator.
- **Agent profiles** — `client.agent.definitions.list` to enumerate named profiles; `definitions.create` / `definitions.copy` / `definitions.rename` / `definitions.delete`; `definitions.getSource` → edit → `definitions.setSource` (pass the read's `revision` as `expected_revision`: a stale one is refused `409 revision_conflict` and nothing is written; without it the save is unconditional); `definitions.setModel` / `definitions.setTools` / `definitions.toggleTool` / `definitions.setTurnLimit` / `definitions.reset`. The product-owned `bot` profile (the one a Bot runs) allows only a model pin through `definitions.setModel` (an empty model clears it); `definitions.setSource`, `definitions.setTools`, `definitions.toggleTool` and `definitions.setTurnLimit` are refused for it with `400 bad_request`, as are creating over it and renaming it, and a Bot's own `model` overrides the pin. To make a session use a profile, `client.agent.sessions.setAgent` (`{ agent }`; not `bot`, `script-writer` or `github-installer`, see step 4) — that selects, it does NOT edit the profile. Two daemon guard rails: `definitions.delete` refuses the configured default chat agent, and a shipped-default profile that has no removable override of its own (`is_error:true` — use `definitions.reset` or `definitions.setSource` instead); in a realm that holds its own saved override of a shipped profile, deleting it removes the override and the shipped version shows through again, and `definitions.reset` refuses a profile that has no shipped default (`is_error:true`).

### 6. Fire-and-observe, recurring prompts, and re-attach

- **Fire-and-observe** — `client.agent.sessions.turns.start` with `{ text }` dispatches a turn and returns `{ job_id, session_id, turn_id }` immediately (HTTP 202) without streaming or blocking; watch completion via the `agent_done` on the session event stream (a connected `client.agent.sessions.connect` socket, or `client.agent.sessions.stream`) whose `turn_id` matches (another client's turn on the same session ends with its own `agent_done`). A cancel scoped with that `turn_id` stops only this turn. Refuses with 409 `turn_in_flight` if a turn is running, or 409 `gate_parked` if a gate is open.
- **Observe / re-attach** — `client.agent.sessions.connect` attaches to a live session's full `event.*` stream over WebSocket, and `client.agent.sessions.stream` is the SSE form of the same route; neither falls back to the other on its own. `const socket = await client.agent.sessions.connect(id)` gives a socket client that is NOT connected yet: register handlers (`onEnvelope`, `onEnd`, `onError`), then `await socket.connect()`. Iterate the SSE form with `for await (const ev of await client.agent.sessions.stream(id))`. Either way, pass `since` (gateway int64 seq, or the `Last-Event-ID` header) to resume from the 1024-event replay ring after a disconnect (a gap past eviction yields `event: lagged {code:replay_gap}`). Each frame is `{seq, incarnation, event}`, and a session re-attached under the same id starts a new incarnation whose `seq` restarts at 1, so send `incarnation` (the one you last saw) together with `since`: a mismatch answers `replay_gap` plus the full retained ring instead of silently resuming into a different history. Over SSE the `event:` line drops the `event.` prefix (`event.agent_done` arrives as `event: agent_done`) while the JSON `data:` keeps the full name, so match ordinary event frames on the parsed payload's `event.type` (for example `event.agent_done`); control frames (`lagged`, `end`, `replay_boundary`) have no `event` key. WebSocket frames are delivered unchanged. `client.agent.sessions.replay` returns the buffered event tail of a *live* session (with `min_seq`/`max_seq`) for a one-shot catch-up (only a *live* session has this ring). `sessions.connect` does not revive a session either: on a persisted but non-live session it answers `404 not_found`, so re-attach it first (`sessions.create({ attach: id })`), then open the stream.
- **Recurring prompts (loops)** — `client.agent.loops.create(sessionId, { prompt, interval })` (plus optional `max_runs` / `stop_when` / `max_cost_usd` / `max_wall_ms` caps) schedules a prompt to re-fire on a live session; `sessions.listLoops` / `loops.update` (pause via `{ paused: true }`) / `loops.delete` to manage, `loops.startRun` to fire one immediately. Loops are entirely session-scoped. Three rules refuse a request rather than adjusting it: `interval` has a floor of 60 seconds; at most 8 loops can be active (not paused, not ended) per daemon, so the 9th create is rejected; and each `loops.update` carries at most ONE intent (`paused`, or `expires_in`, or the budget fields `max_cost_usd` / `max_wall_ms`), so a request mixing two is rejected 400 (a body with none of them is treated as a budget update).

- **Stop the realm's work** — `client.agent.stopAllWork` acts on at most 256 items per call: when the answer has `complete: false`, send its `next_cursor` back as `after`; a `complete: false` answer with no `next_cursor` (work started during the call, or items behind the cursor) is answered by calling again without `after`. Synchronous and streaming tool and headless requests end when their HTTP request closes and are not covered.

### 7. Headless one-shot run

The run's shape is chosen by the request BODY, not by a header: the default (`format` `text` or `json`) is an async job — HTTP 202 `{ job_id }`, then poll `client.agent.jobs.get` and fetch the output with `client.agent.jobs.getResult` — while `format: "stream-json"` (or `stream: true`) streams the run over SSE (`start` → `result` or `error` → `end`). A failure after the acknowledgement (a timeout, `admin_unauthorized`) arrives later, in the job result or as the `error` frame, never as the HTTP status. A headless run approves every plan and every ordinary confirm, denies a `human_only` confirm and one carrying a `helper_id` (the tool call then fails), and answers every question itself (the first rich-option title, else the first plain option, else an empty answer), so treat it as arbitrary code execution. SDK: `client.agent.headless.start` without the `stream` option sends `stream: false` and accepts `format` `text` or `json` only (`stream-json` selects SSE, so `start` refuses it before anything is sent); it resolves to the 202 `{ job_id }`. With `{ stream: true }` as its second argument it sends `stream: true` and returns a Promise of an async iterable of SSE events; it sends nothing until you start iterating. Consume it with `for await (const ev of await client.agent.headless.start({ prompt }, { stream: true }))`; the `await` inside the loop head is required, because without it the loop tries to iterate the Promise itself and fails before anything is sent. If the kit answers the 202 job acknowledgement instead of a stream, the first iteration throws an `ApiError` with code `NOT_AN_EVENT_STREAM` and status 202. That error holds only the code, a fixed sentence and the status: the `{ job_id }` body reaches only the client's diagnostic callback, `onStreamDiagnostic` in the client config (`headless.start` takes no per-call callback), which receives the original error with the body on its `response` — take the id from there and poll the job.

### 8. Configure MCP servers for a session

Reads first: `client.agent.mcp.list` (`{ session_id }`) returns the EFFECTIVE merged `mcp_servers` config, the per-layer settings files behind it, and each server's LIVE runtime state (connected, negotiated protocol revision, tool count, pid, revocation reason, recent stderr). Every write is TWO steps: `client.agent.mcp.createWriteIntent` (`{ session_id, op, scope }`, op ∈ the strings "upsert", "delete", "set_enabled" and "import", scope ∈ `user`|`project`|`local`; an omitted scope means `user`, or `project` when the session has no user layer, which is the usual case for a computer session — read the returned target path to confirm where the write lands) mints a single-use nonce bound to {session, op, resolved settings path} and returns the target path plus the current `mcp_servers` hash — then present that `nonce` plus the hash as `expect_hash` on the matching `client.agent.mcp.upsert` / `mcp.delete` / `mcp.enable` / `mcp.disable` / `mcp.import`. BOTH are required on every write: skipping step one fails closed, a nonce minted for a different op or scope fails closed, and `expect_hash` has no omit-it default — a first write into a settings file that does not exist yet states that expectation with the empty-array hash rather than leaving the field out. To adopt someone else's config, preview it with `client.agent.mcp.previewImport` (`{ session_id, document }` — writes nothing, needs no nonce, strips credential values) and then `mcp.import` with a fresh `op: "import"` nonce; imported servers land DISABLED, so enable each one with `mcp.enable`. After editing a settings file by hand, or to recover a server that died, `client.agent.mcp.reconnect` (`{ session_id }`) re-reads the layers and reconciles every live session's pool — a healthy unchanged server is not restarted. `client.agent.mcp.test` trials a candidate config without saving it, but it is human-only (see Common errors).

## Quirks & gotchas

- **Settings take a JSON patch, and its JSON types matter.** `client.agent.settings.update({ patch })` merges the top-level keys of `patch` into the home `settings.json`, one level deep: a key set to `null` is deleted, while the string `"null"` is stored as text, and a nested object replaces the whole stored value of its key (a dotted key such as `"a.b"` is one top-level key, not a path). Guardrail keys cannot be changed this way and answer `403 settings_key_protected`: `deny_list`, `deny_urls`, `features`, `allowed_directories`, `hooks`, `disableAllHooks`, `mcp_servers`, `tools`, `rules`, `rules_timeout_ms`, `shipped_hooks`, `exec_trust` and `audio` (so `audio.tts_model` / `audio.stt_model` are set in settings.json on the computer, not over this API). A non-null top-level `model` is refused 400: pin a model with `definitions.setModel` or `sessions.setModel`, while `{"model":null}` still deletes an old value.
- **A chat nobody has named gets its title from the agent.** After the chat's first finished exchange, a model writes a short title into the session's `name`; `event.session_renamed` carries the new name. A name set with `client.agent.sessions.rename(id, { name })` is never replaced, and an empty name asks for a new title (at once on a live chat, after its next finished turn on a closed one). Turn titles off with the `session_titles` feature (`client.agent.settings.updateFeatures({ features: { session_titles: false } })`). The home settings key `session_title_model` (a `provider/model`) picks the model; absent, each chat uses its own (a Claude Code session uses Hoody's helper model, and a fusion chat gets no title). Daemon-managed sessions and a Bot's own sessions are not titled.
- Bare `hoody agent` (no subcommand) is `hoody hub`: it opens the Hub, on the page the last run ended on (else Home); a computer given (an id or a name, as the argument or with `-c`) is checked first, but the Hub does not open on it. It is separate from this HTTP namespace, the typed control surface. The CLI does not attach the agent's own TUI: it opens at the computer's `agent-1` URL, or in a terminal session started with `agent=true`.
- Source of truth is the agent kit's own OpenAPI document. Its `GET /api/v1/agent/openapi.{json,yaml}` routes are not reachable through the kit URL (the proxy refuses them), so use the agent reference bundled with this skill for request paths and schemas; every route lives under the single `/api/v1/agent` prefix. The kit checks no credential of its own and asks for no bearer header; access is decided by the computer's proxy permission policy. 403 `forbidden` — Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only.
- The proxy service slug is `agent` and the kit URL host carries the index segment (`-agent-{index}`). Resolve it with `client.getKitUrl('agent', computer)` rather than hand-building it.
- `sessions.turns.run` waits for the turn to end (or returns `{pending_gate}` the moment a turn parks on a confirm/question), but at most until the server deadline (290 seconds by default): a turn still running then answers `503 service_unavailable` with `details.turn_running: true` and keeps running (the SDK call itself times out after 30 seconds unless you pass `{ timeoutMs }`; the turn keeps running then too); prefer streamed prompting for anything non-trivial so you can observe progress and resolve gates as they arrive. (SDK note: `sessions.turns.start(id, { text }, { stream: true })` POSTs `prompt:stream` and returns a Promise of an async iterable of SSE events, so iterate `for await (const ev of await client.agent.sessions.turns.start(id, { text }, { stream: true }))`. Nothing is sent until you start iterating or read `stream.response`. The iteration ends by itself after this turn's `agent_done` or `turn_discarded`, or when the session ends; another client's `agent_done` does not end it. `const stream = await client.agent.sessions.turns.start(id, { text }, { stream: true }); const { documented } = await stream.response;` gives the turn id as `documented.XHoodyTurnId` (the `X-Hoody-Turn-Id` header; a browser sees it only if the kit exposes it over CORS). The SDK identifies the turn from that header, or from the `replay_boundary` frame's `turn_id` if the header cannot be read; if neither names a turn, it stops at the first `agent_done` after replay. Pass `followSession: true` in the options to keep reading later session events. If you stop that stream manually at your turn's end, use `documented.XHoodyTurnId`, or the `replay_boundary` payload's `turn_id` when the header is unavailable. In the latter case, buffered frames arrive BEFORE `replay_boundary`, so retain `agent_done` and `turn_discarded` frames seen before the boundary and compare them when it arrives; otherwise stop when a later one names your turn. A frame names its turn in `event.data.turn_id` or the envelope's `turn_id` (`JSON.parse(ev.raw)`). The higher-level `streamAgentPrompt` helper exported from the SDK wraps the same route and exposes `events` / `text` / `done` plus a cancel() method that aborts the turn.) For non-interactive turns where you cannot resolve gates by hand, enable the `auto_approve` gate policy to answer the lead's confirm gates (off by default; a gate raised by a helper agent waits for a person). On the blocking form (`sessions.turns.run`, route `prompt:sync`) it stays on for the dispatched turn even after the request ends (for at most 24 hours), unless its watcher falls behind and is dropped, after which later gates of that turn need a person. On the streamed form (route `prompt:stream`) it is tied to the connection, not the turn: disconnecting before the turn ends stops it, and while the stream stays open it also answers confirm gates of LATER turns on the same session, so close the stream at your turn's `agent_done`. With either form, an ordinary confirm gate is approved, a gate raised by a tool-call rule and a destructive-shape gate (cause `static_stakes`: a recursive force delete, curl piped to a shell, `sudo`, a force push) are DENIED, a `human_only` confirm gate is never answered: it waits for a person (on `prompt:sync` it comes back as `{pending_gate}` with `human_only: true`), and a session whose approval policy is `always` refuses the policy with `409 approval_policy_active` before the turn starts. SDK: `gatePolicy: 'auto_approve'` in the `sessions.turns.start` (with `stream: true`) / `sessions.turns.run` options. This only answers **confirm** gates, never questions.
- **The agent's shell has the computer user's own sudo.** The agent runs as the computer's `user`, and its bash tool can use sudo exactly as that user can without a password: with the default passwordless sudo it can `sudo apt-get install`, `sudo systemctl enable --now` a unit and so on. When `user` has no passwordless sudo (the drop-in removed, a password required), the agent's shell has none either, because there is no terminal to type a password into; a policy that allows only some commands without a password allows the same commands to the agent (with sudo's default `listpw`). While the agent's shell can sudo, a session's `dir_scope` (`home`) no longer confines its bash commands: the file tools still keep to the scope, but the shell can reach the whole computer, like the terminal kit. To take sudo away from the agent, take passwordless sudo away from `user` (`SKILL-SDK.md` § Default user); the agent keeps everything else `user` has, such as Docker through the `docker` group.
- Every prompt/gate/cancel call is **session-scoped** — you must hold a session id from `sessions.create` first; there is no implicit default session. Hook writes are session-scoped too (the guarded writes — `hooks.upsert` / `hooks.delete` / `hooks.enable` / `hooks.disable` / `hooks.enableAll` / `hooks.disableAll` — plus `hooks.createWriteIntent`, and the side-effecting `hooks.run` / `hooks.trust`, all require a live `session_id` — `hooks.trust` clears the per-session hook-trust prompt (the execution-trust probe `hooks.list` reports), the gate that must be acknowledged before a saved hook command is allowed to fire, mirroring `skills.trust` for skills; `hooks.reload` with a `session_id` reloads only that session and returns its summary, and without one reloads every live session in the realms the caller is served) AND the config writes are nonce-guarded (`hooks.run`, `hooks.trust` and `hooks.createWriteIntent` itself need a live `session_id` but no nonce, and each call still needs its own fields): call `client.agent.hooks.createWriteIntent` (`{ session_id, op, scope }`, op ∈ upsert|delete|toggle|set_disabled|rules_set; `rules_set` is for `hooks.setRules` and needs its own matching nonce) to mint a single-use nonce, then pass that `nonce` on the matching `hooks.upsert` / `hooks.delete` / `hooks.enable` / `hooks.disable` / `hooks.enableAll` / `hooks.disableAll` — the nonce binds to that session+op+scope tuple and the write fails closed without it. Note hooks are an arbitrary-command surface: `hooks.upsert` persists a command that fires on lifecycle events, and `hooks.run` on a command hook runs a command at once: running saved hooks goes through the session's hook-trust gate, while a run that supplies an unsaved inline `command` runs it without that saved-hook trust check. Every command-hook run is refused (`approval_policy_unsatisfiable`) while the session's approval policy is `always`, and `hooks.test` of a shipped hook only evaluates its trigger without running anything. These calls carry no confirmation step of their own — the same access that authorizes any agent-kit call authorizes these too, with nothing extra — so add your own confirmation before exposing this surface to an autonomous caller.
- **`env` and `headers` VALUES are never returned by the MCP surface; every other field comes back verbatim.** `mcp.list` reports `env_keys` / `header_keys` — key NAMES only — because a redacted value invites a client to write the placeholder back as the real secret; a write whose body carries the redaction placeholder for a credential is REFUSED rather than stored. Other fields, including `url`, `command` and `args`, are echoed verbatim in a listing (only the import preview differs: it shows each entry as it would be stored, with a missing `type` becoming `http` when `url` is set, `${env:VAR}` references translated in `env` and `headers` only (others stay as written, with a warning), an env-file setting dropped with a warning and `enabled` false, and `env` and `headers` replaced by `env_keys` and `header_keys` name lists), so a credential embedded in one of them (a token in a URL, a key on a command line) is NOT redacted: keep secrets in `env` / `headers`, and treat the rest of a listing as sensitive. To change a secret you must supply its real value; to leave one alone, omit the field — `mcp.upsert` merges FIELD BY FIELD over the existing entry of the same name, so omitted fields keep their stored value (including fields this build does not model), and `env` / `headers` merge per key (a key set to `null` is deleted, `{}` clears the map). A genuine re-point (a changed `type`, `command`, `args` or `url`) clears `env` and `headers` unless the same request re-supplies them, so send the credentials the new target needs in that write; restating the identity you read back is not a re-point. `mcp.enable` / `mcp.disable` flip only the `enabled` flag so credentials and options survive a disable. A deleted, disabled, or re-pointed server is REVOKED in every live session before the response returns, including mid-turn (a stdio child is reaped when its last holder releases). Reconnecting is awaited only for the session named in the request: check `servers[].connected`, because a failed connection still answers 200. Other live sessions reconnect in the background, best effort, and a session mid-turn adopts added tools at its next turn boundary. Import is WHOLE-BATCH — one bad entry aborts everything — it understands the hoody (`mcp_servers` list), Claude/Cursor (`mcpServers` map) and VS Code (`servers` map) dialects, and REFUSES a document carrying more than one of them rather than guessing.
- `client.agent.login` (token bootstrap) is enabled by default; a deployment can turn it off, and then every call answers 404. Browser clients may call it; the `Content-Type` media type must be `application/json` (parameters such as `charset=utf-8` are accepted). Where the deployment requires a capability, the body must carry the matching `capability` (a mismatch is also 404). The token must belong to this box's owner and carry the full login grant (otherwise 403). On a box with no credential it installs (201 `installed`) and adopts any local sessions or todos that have no owner; on a box logged in to the SAME account it replaces the stored token whether or not it expired (200 `renewed`). A token for a different account is refused `409 agent_login_conflict`, and a credential supplied through the environment is never replaced (`409 credential_present`).
- A Bot URL is bound to a Bot by its `uid`, not its id: if the Bot is deleted and created again, the Bot URL refuses keyed calls with `bot_disabled` (403) until the owner points it at the new Bot with `repoint`. The agent serves a Bot URL's doors but does not create, list or manage Bot URLs; they are an `api` resource that only the project owner (or an administrator) can manage.
- **A keyed request whose answer was lost is recovered by its key, never by sending it again under a new one.** Read the key first: `sessions.getCreateKey`, `sessions.turns.getByKey`, `sessions.commands.getByKey`, `bots.messages.getByKey`. A hit is what the key admitted. A miss proves nothing: the request may still be on its way. For a create, turn or command, retire the key (`sessions.retireCreateKey`, `sessions.turns.retireKey`, `sessions.commands.retireKey`): `admitted: "false"` means nothing ran and nothing ever will (the late request is refused `409 create_key_retired`, `turn_key_retired` or `command_key_retired`), so a new key is safe; `"true"` returns what the key admitted; `"unknown"`, or a `503`, means it may have run: check before sending again. A create sent with a config dir keeps its key in that install: read and retire it with the same `X-Hoody-Config-Dir`. A Bot message has no retire: read the Bot's log.

## Common errors

- A model rate limit can end the turn: `event.error.code` is `quota_wait_too_long` or `rate_limit`, and `agent_done.error_code` carries the same code. For `quota_wait_too_long`, read `retry_after_secs` from the error payload, wait that many seconds, then send the message again: the turn ended instead of waiting. `retry_after_secs` is always present for `quota_wait_too_long` and may also appear on another failed model request when the provider named a wait (a rate limit or a busy provider); honor it when present, but do not assume it exists for `rate_limit`.
- A gate or question left unresolved stalls the turn — a streamed prompt that emitted an `event.confirm_request` (confirm gate) or `event.user_question` (question gate) will not complete until you answer it: `gates.approve` / `gates.deny` for a confirm, `gates.answer` for a question. For unattended runs, arm `sessions.autoReply.update` (a self-driving auto-user loop; it answers questions only during its own rounds, so arming it does not resolve a question an ordinary prompt already parked), or pass the `auto_approve` gate policy on the prompt — but `auto_approve` only answers **confirm** gates (approving ordinary ones, denying rule-raised and destructive-shape (`static_stakes`) ones; refused with `409 approval_policy_active` on an `always` session), never questions or a `human_only` confirm gate; either still stalls: a question until `gates.answer` answers it (the auto-reply loop answers only the questions its own rounds raise), a `human_only` gate until a person answers it.
- `sessions.tasks.list` and `sessions.tasks.getTranscript` return their data INLINE and need no live session and no attached stream. `sessions.tasks.list` is the UNION of the live task registry and the session's PERSISTED task store (keyed by task id, live winning) — the live registry evicts completed tasks when a new one spawns, so a finished task can leave memory while its transcript is still durable, and a live-only list would hide it. `sessions.tasks.getTranscript` reads a task that reached a terminal state even for a closed session and after a daemon restart; a task still running when the daemon stops orderly is cancelled; if it does not stop within about 5 seconds shutdown tries to save its partial transcript as `cancelled` with `complete: false` (`source: "store"`); a saved row survives restarts, and one it could not save in time reads 404. A task running when the daemon is killed without that shutdown (crash, SIGKILL) leaves nothing and reads 404. Tasks never resume after a restart. Its `source` field is `"live"` or `"store"`, and `complete` reports whether the response reflects a terminal projection DURABLY COMMITTED to that store. `after_seq` is EXCLUSIVE (entries strictly after it, plus any still-open entry); OMITTING it returns the whole transcript, which is distinct from `after_seq=0`. `sessions.tasks.cancel` / `sessions.tasks.cancelAll` still act on a LIVE session and stop background tasks mid-turn (server-layer; tasks survive `sessions.turns.cancel` but are not restartable).
- `memory.consolidate` (`POST /api/v1/agent/memory/consolidate`) is a **guarded write**: first `memory.createWriteIntent` with `{ op: "consolidate", project }`, then pass the returned `nonce` with the same `project` to `memory.consolidate`. The intent is single use, expires after a few minutes, and is bound to the store, the realm it was minted in, the op and the project, so a `wipe_project` intent or one for another project is refused. Without a valid intent the call returns `409 write_intent_invalid` and nothing is enqueued; every attempt that reaches the consolidate handler spends the intent, so such a retry needs a fresh one (a request refused earlier, such as a failed admin authorization or a 429, does not spend it). A `200` means the pass was enqueued and runs in the background, not that it finished. `503 consolidate_unavailable` means the maintenance queue is full or memory is disabled: retry shortly with a new intent. Consolidation spends model budget, so ask the user before running it.
- `mcp.test` (`POST /api/v1/agent/mcp/probe`) is **human-only and ALWAYS fails over this namespace** — probing STARTS A PROCESS (stdio) or makes an outbound request to a caller-chosen URL (http/sse), so a machine caller may not self-approve it: with a valid session it receives `403 human_only` on every HTTP/SDK/CLI call (a missing session id is refused `400` and an unknown or closed session `404` before that check). The surface still exposes it for completeness, it simply always refuses. The deny list is still enforced on the candidate config before anything is started. Use `mcp.previewImport` for a write-free preview instead; there is no programmatic substitute for the live trial.
- An MCP write needs BOTH a `nonce` and an `expect_hash` — neither is optional, and a stale hash is a CONFLICT rather than a silent overwrite. `mcp.upsert` / `mcp.delete` / `mcp.enable` / `mcp.disable` / `mcp.import` each require a fresh single-use `nonce` from `mcp.createWriteIntent` minted for that exact op and scope (one minted for a different op or scope fails closed) AND the `mcp_servers` hash you last read, from either `mcp.createWriteIntent` or `mcp.list`. A mismatch means someone else edited the layer since you read it — re-read, re-mint, retry; each nonce is good for exactly one write, so a retry always needs a new one. There is no "omit it for the first write" shortcut: writing into a settings file that does not exist yet means passing the empty-array hash.
- `workflows.delete` removes **user** workflows and saved customizations. A built-in/**system** workflow that you never customized is refused (`is_error:true`) and re-seeds on every boot; `workflows.hide` is the only way to remove it from view. Deleting your saved customization of a system workflow succeeds and brings the shipped version back: at once in a scoped realm, at the next daemon restart otherwise.
- Empty values on agent-profile edits mean *inherit / unrestrict*, not *clear to nothing*: `definitions.setModel` with `model: ""` removes the model line (falls back to the default model), and `definitions.setTools` with `tools: []` removes the allow-list line, which means **all tools are allowed** (NOT zero). Pass a non-empty `tools` array to set the base allow-list. `definitions.setTools` takes only `tools` and `none`; to enforce the listed tools exactly, set `strict_tools: true` in the profile's frontmatter: read it with `definitions.getSource`, add the key and write it back with `definitions.setSource`. To give the profile no tools at all, pass `tools: []` with `none: true` (writes `tools: none`); `none: true` with a non-empty list returns `400 bad_request`. A profile with `strict_tools: true` is the exception: there an empty list grants only the benign special tools, never the full set.
- Prompting with no usable model/provider configured fails the turn. `client.agent.providers.list` lists every catalogued provider whether or not it is set up, so check the one you intend to use with `client.agent.providers.auth.getStatus` before you prompt (blocking or streamed): `ready` is true for a stored API key, a stored OAuth login, or a passwordless provider (`no_auth_ready`).
- A custom provider's `base_url` must be an `https` URL with no user name, password, query or fragment, at a public address. Create, and updates that change `base_url`, refuse one that is not (an internal address, or a name that resolves inside a network) with `422 provider_invalid` and `details.field` `base_url`. The destination is checked again when the agent connects, and a later refusal (a name that now resolves to an internal address) fails the model request instead, for example with `502 upstream_error` on a non-streaming completion. Create is not idempotent by itself: repeating a create that went through answers `409 provider_exists`, so send an `Idempotency-Key` to retry safely (the same key with another body is `422 idempotency_key_reused`). Deleting a provider (the result's `api_key_removed` says whether its stored key went too) leaves an open session on one of its models unconfigured: its next prompt fails with `session_unconfigured` until you switch it to another model, and agents and Jev settings that name one of its models fail the same way until changed.
- Speech calls answer `413 audio_too_long` for a wav or mp3 over 600 seconds (`413` too for a file over 16 MiB), `415` on a transcription for audio the model does not take, `422` when the model is unavailable or the input is refused, `502` / `504` for a provider failure or timeout, and `503` when speech is unavailable (`speech_unavailable`: speech is unavailable for this request; read `details.reason` when present: `no_credentials` means the selected model's provider has no key stored, `relay_*` means the voice relay could not serve it, and another speech model may still work) or busy (`speech_busy`: too many speech calls running on the agent, or, for a spoken Bot message, 4 recordings already being transcribed for that Bot) — honor `Retry-After`; resend a spoken Bot message with the same `Idempotency-Key` (an admitted message is not queued twice, but a failed transcription stored nothing, so the retry transcribes again; other speech calls do not deduplicate it: each retry is a new, billed call). A `429` is `rate_limited` (the per-client request rate; each non-streaming speech call also takes one of the client IP's completion slots and each open stream one of its stream slots), `speech_quota_exceeded` (the realm's, Bot's or agent's speech budget is spent for now) or, on a spoken Bot message, `idempotency_keys_exhausted` or `speech_busy` (too many requests waiting): read the code.
- Calling prompt/gate/cancel against a session whose live connection was torn down (`sessions.close`) returns not-found. If the record survives, re-attach with `sessions.create({ attach: id })`; otherwise start a fresh session (the same create call without `attach`). After a *hard* delete (`sessions.delete`, which always erases the record) the record is gone and only a fresh session works.

## Related namespaces

`terminal`, `exec`, `files`, `notes`, `api` (its `botUrls` service gives a Bot a public URL).

## Examples

A **Bot** here is the agent's long-lived assistant (`client.agent.bots`). It opens delegate sessions on computers, follows them and reports back. Chat apps reach it as its channels; there is no separate `bot` namespace. Set `P`, `C`, `N` from `computers.get` (`client.api.computers.get(computerId)`) first. The Bot's id below is `release-bot`; omit `id` on create to have one generated, and take it from the response.

### 1. Create a Bot, message it, follow its replies, forget, delete

**Goal:** run a Bot end to end. `guardrails` are limits on the work (they apply to the Bot and every delegate it opens), not instructions. A Bot lives in one realm: pick one with `X-Hoody-Realm` (`agentRealm` in the options), otherwise the agent's current realm is used. The Bot's own session opens when the first message is posted, or earlier on a spoken-message attempt (even one whose transcription then fails), so `session_id` is empty until then. A reset starts a new session at once, so read `session_id` again after one. This Bot has guardrails, so its default `guardrail_check` (`strict`) needs the guardrail checker (Jev), which needs the credential of the provider of `jev.model` when that provider is key-backed (`hoody-ai/hoody-decide` needs none). Hoody Decide is used only when `jev.model` names it; when `jev.model` is unset, Jev uses the default of a key-backed provider whose key is set. Without the key, every dispatch and delegate message is refused and the Bot says which key is missing; `lenient` still checks and refuses work that may break a guardrail, and lets the work go ahead unchecked only when the check cannot be made; `off` skips the check.

**Step 1 — create.** Send `id` to make a retry safe: a second create with the same id answers `409 bot_exists`.

```typescript
const bot = await client.agent.bots.create({
  id: 'release-bot',
  name: 'Release bot',
  role: 'Ships the weekly release.',
  guardrails: 'Never push to main.',
});
```

**Step 2 — message it.** The answer is `202` with `{message_id, state}`: `posted` (with `turn_id`) once dispatch is confirmed, `queued` when the message is accepted but dispatch is not yet confirmed. A busy Bot answers `queued` at once and the message goes out when its turn ends; a free Bot can also answer `queued` after a 3 second dispatch wait. Add an `Idempotency-Key` to retry safely.

```typescript
const sent = await client.agent.bots.messages.send('release-bot', {
  text: 'Check the staging build and tell me if it is green.',
});
```

**Step 3 — follow the replies.** The stream carries finished log rows only: first a `state` frame (the Bot), then `row` frames, plus `lagged`, `archived` and `end`. The reply is one `bot` row written when its turn ends, and a turn with no reply text writes none. Resume with `since` (or `Last-Event-ID`). For live text, thinking and tool calls, follow the Bot's own `session_id` with `sessions.stream` instead. To read without streaming, page the log: pass `next_since` back as `since` while `has_more` is true.

```typescript
for await (const frame of await client.agent.bots.streamLogs('release-bot')) {
  if (frame.declared && frame.event === 'row' && frame.data.role === 'bot') console.log(frame.data.text);
}
```

**Step 4 — forget or reset.** `bots.clearConversation` moves the log to the archive and clears the conversation; the Bot keeps its settings and delegates. `reset` also archives the log but starts a new session with the Bot's current model, which is how a changed `model` takes effect. The old session is not closed. Neither deletes the archive; `bots.clearArchive` does.

```typescript
await client.agent.bots.clearConversation('release-bot');
await client.agent.bots.reset('release-bot');
```

**Step 5 — delete.** Removes the Bot with its log and archive, after a best-effort stop of its working delegates. Its session and delegates are not closed: they stay listed under the sessions. Delegate sessions can be continued directly; to continue the former Bot session, fork it, because the Bot's own responder is removed with the Bot. To stop the Bot's running turn, call `client.agent.bots.cancelTurn(id, { turn_id })`, naming the `turn_id` that `bots.get` shows while `turn_running` is true. Only that turn stops: a late stop never stops a newer one, and delegates keep running (stop one with `bots.stopDelegate`).

```typescript
await client.agent.bots.delete('release-bot');
```

### 2. Add a custom provider, store its key, use its model

**Goal:** connect an OpenAI-compatible endpoint and run a session on one of its models. The provider id below is `acme`; its model is selected as `acme/llama-3.3-70b`. Replace `https://api.acme.example/v1` (and `https://eu.api.acme.example/v1` in Step 4) with your provider's real https base URL: create resolves the host and refuses one that does not resolve (`422 provider_invalid`).

**Step 1 — create it.** `id`, `base_url` and `models` are required. Add an `Idempotency-Key` so a retry answers with the provider the first try created instead of `409 provider_exists`. The reply carries the provider, with each model's `spec`.

```typescript
const { data: { provider } } = await client.agent.providers.create(
  {
    id: 'acme',
    base_url: 'https://api.acme.example/v1',
    models: [{ model: 'llama-3.3-70b', context_window: 131072 }],
  },
  { idempotencyKey: 'acme-create-1' },
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

**Step 4 — change or remove it.** Update names only what changes (`models` and `headers` replace the current list and map; `id` and `model_prefix` are fixed). Delete asks for confirmation on the CLI and removes the stored key too when it is the one stored for this provider; `api_key_removed` in the result says whether it did.

```typescript
await client.agent.providers.update('acme', { base_url: 'https://eu.api.acme.example/v1' });
await client.agent.providers.delete('acme');
```

### 3. Speak a sentence, transcribe a recording, post a spoken message to a Bot

**Goal:** turn text into an mp3, turn a wav recording into text, then send that recording to the Bot from Example 1 as a spoken message (run step 4 before Example 1's step 5 deletes the Bot, or create it again with Example 1, step 1). Pick models from the list first: a text-to-speech model whose `formats` include `mp3` and a speech-to-text one, each with a provider key in place, and pass each as `model` (steps 2 and 3). A call without `model` uses settings `audio.tts_model` / `audio.stt_model`, and with neither set (and the Hoody AI relay default off) it is `422 speech_not_configured`; listing a model does not select it.

**Step 1 — list the speech models and one model's voices.**

```typescript
const { data: tts } = await client.agent.audio.listModels({ capability: 'tts' });  // items: { id, capabilities, formats?, rates?, languages?, available }
const model = tts.items.find((m) => m.available && m.formats?.includes('mp3'));  // the first model that can be used and gives mp3
if (!model) throw new Error('no available text-to-speech model gives mp3');
const { data: voices } = await client.agent.audio.listVoices({ model: model.id });  // items: { id, model, languages? }
```

**Step 2 — speak a sentence.** The whole audio comes back in one answer; `response_format: 'mp3'` asks for mp3, and a model whose resolved formats lack `mp3` is refused `400`. Models served through the Hoody AI relay list an empty `formats` (it is resolved when the call is made). The `formats` filter above therefore skips them: it is a conservative pick, and a relay model can still be tried without it.

```typescript
import * as fs from 'node:fs';

// data is the audio itself (an ArrayBuffer), not JSON.
const { data: audio } = await client.agent.audio.createSpeech({ model: '<tts-model-spec>', input: 'The staging build is green.', response_format: 'mp3' });
await fs.promises.writeFile('hello.mp3', Buffer.from(audio));
```

**Step 3 — transcribe a recording.** One wav or mp3 file, at most 16 MiB and 600 seconds; `language` helps when you know it.

```typescript
const form = new FormData();
form.append('file', new Blob([await fs.promises.readFile('question.wav')], { type: 'audio/wav' }), 'question.wav');
form.append('language', 'en');
const request = new FormData();  // the same fields plus the model
request.append('file', form.get('file')!);
request.append('language', 'en');
request.append('model', '<stt-model-spec>');
const { data: heard } = await client.agent.audio.createTranscription(request);
console.log(heard.text);
```

**Step 3b — give the Bot a speech-to-text model (once; skip it when settings `audio.stt_model` is set).** The Bot's `speech` object replaces its speech settings whole (`null` removes them), so send every field you want to keep. A model that is unknown, lacks speech-to-text (`details.reason: "not_stt"`) or is not available is refused `422 model_unavailable`; nothing changes.

```typescript
await client.agent.bots.update('release-bot', { speech: { stt_model: '<stt-model-spec>' } });
```

**Step 4 — post the recording to the Bot as a spoken message.** Same queueing as a text message (`202` with `state` `posted`, `queued` or `dropped`); a recording with no speech in it is answered `200 { no_speech: true }` and nothing is queued; an `Idempotency-Key` makes a retry safe. The form takes `file` and `language` only (another field is `400`): the Bot transcribes with its own `speech.stt_model`, else settings `audio.stt_model`, and with neither (and the Hoody AI relay default off) the call is `422 speech_not_configured`. Follow the reply as in Example 1, step 3.

```typescript
const { data: spoken } = await client.agent.bots.messages.sendAudio('release-bot', form, { idempotencyKey: 'q-2026-10-12-1' });  // step 3's `form`: file and language, no model
// 'no_speech' in spoken (200): nothing was heard, nothing queued or billed.
// otherwise (202): spoken.message_id, spoken.state ('posted' | 'queued' | 'dropped': a dropped message is never posted, send it again under a new key); spoken.transcript is absent on a replay of a finished request; a retry that waited for one still running gets it
```


### 4. Give a Bot a public URL, hand out a key, call it, rotate, panic

**Goal:** let someone without a Hoody account talk to the Bot from Example 1 (run its step 1 first, or use any Bot of yours). A **Bot URL** is the Bot's public address, `https://<label>.hoody.bot`, plus named keys (`hbk_…`) you hand out; the URL belongs to your account, so you manage it with the `api` namespace and a Hoody login, while the person you share it with needs only the URL and a key. A Bot has at most one Bot URL, and everyone holding a key shares one conversation with the Bot (each caller appears to the Bot under its key's name). The work callers start is your Bot's work, at your cost. The project owner or an administrator can manage Bot URLs; a project member gets `403 BOT_URL_OWNER_ONLY`. Set `C` to the id of the computer whose agent runs the Bot. The reference for the doors a caller can use (chat, Responses, Anthropic messages, MCP), the SDK caller client and the error codes is the `## Bot URLs` section of the appendix.

**Step 1 — read the Bot's reference.** The URL is bound to the Bot by the `realm`, `id` and `uid` the agent reports for it. A deleted and recreated Bot has a new `uid`, so a Bot URL never follows it: point it at the new Bot with `repoint`.

```typescript
const { data: ref } = await client.agent.bots.get('release-bot');   // ref.realm, ref.id, ref.uid
```

**Step 2 — create the Bot URL.** Omit `label` to get a generated one (`client.api.botUrls.suggestLabel` shows a free one without reserving it). A label is 8 to 48 characters of `a-z`, `0-9` and single hyphens, starting with a letter and ending with a letter or digit; every label ever used stays taken, even after its Bot URL is deleted. `bot.realm` must be `global` or a realm the computer belongs to. The URL starts with no keys, so nobody can call it yet; `cors` (default true) lets browsers call it. The answer carries `data.id` (`bu_…`) and `data.url`; `url` is `null` while the platform has no usable Bot zone, and create is refused then.

```typescript
const created = await client.api.botUrls.create({
  computer_id: computerId,
  bot: { realm: ref.realm, id: ref.id, uid: ref.uid },
  label: 'release-bot-team',
});
const id = created.data!.id!;
const publicUrl = created.data!.url;   // https://release-bot-team.hoody.bot, or null (no Bot zone)
```

**Step 3 — wait until the change is applied.** Every write returns `propagation`; callers see a change about 11 seconds after `propagation.state` is `applied`, so poll `get` before you hand anything out, and again after you mint a key and after a rotate, revoke or panic (a new key does not work for its holder until then). `applied` covers publication only: a newly created or re-pointed Bot URL can take a little longer before its address resolves for callers, so after minting the first key check that `caller.listModels()` answers with that key before you hand it out, and retry if the name does not resolve yet. Deleting a Bot URL is the exception to polling: its reply is the only snapshot, and a later `get` answers 404 `BOT_URL_NOT_FOUND` at once, which does not mean the removal is applied. Poll only while the state is `pending`, with a bound: `failed` means publication encountered a failure; inspect `propagation.failed_count` and investigate rather than waiting indefinitely. The count can be zero when the intent has an error.

```typescript
let current = await client.api.botUrls.get(id);
for (let i = 0; current.propagation?.state === 'pending' && i < 60; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  current = await client.api.botUrls.get(id);
}
if (current.propagation?.state !== 'applied') throw new Error(`Bot URL not applied: ${current.propagation?.state}`);
console.log(current.data!.status);   // current URL status
```

**Step 4 — mint a key for one person.** A key has a name (1 to 32 characters; unique on the Bot URL, and the Bot sees it as the caller's name), and optionally an expiry, an IPv4 allowlist and owner-only notes. The secret is in this answer only and cannot be read again: pass it to its holder over a private channel, never into a chat log or an issue. A Bot URL holds at most 20 live keys. A caller signed in with a login session, on an account that has 2FA with its API-key requirement on (the default), must also send a current 2FA code on key create and rotate (and on `repoint`, and on an `update` that turns the URL on, allows browser calls or frames, or changes its limits), else `400 OTP_REQUIRED`: add `otp_code` to the body (for `rotate`: `keys.rotate(id, keyId, { otp_code })`), or give the client an `onStepUp` hook that returns the code; the hook is asked only when the call has a body object, so pass one (`keys.rotate(id, keyId, {})`). A code works once. A caller with an `hdy_` auth token needs no code.

```typescript
const minted = await client.api.botUrls.keys.create(id, { name: 'Dana', expires_at: '2026-12-31T23:59:59Z' });
const keyId = minted.data!.key!.id!;
const secret = minted.data!.secret!;   // shown once
```

**Step 5 — call it as the person you shared it with.** No Hoody login. Send the key as a bearer token (`Authorization: Bearer`). Over HTTP, a call with a key goes to `/v1/chat/completions` (any model name works; use the label), `/v1/responses`, `/v1/messages` or `/mcp`; `GET /` and `GET /SKILL.md` on the URL need no key and describe the doors. A long answer can take a while: the CLI and SDK `ask` wait for it, and the MCP `ask` over HTTP returns a `ref` to ask again with.

```typescript
import { BotUrlClient } from 'hoody-sdk';

const caller = new BotUrlClient({ url: 'https://release-bot-team.hoody.bot', key: secret });
const answer = await caller.ask('Is the staging build green?');   // check answer.status: answered | working | waiting_on_gate | reset
console.log(answer.status, answer.text);
```

**Step 6 — rotate, revoke, panic, delete.** `rotate` keeps the key's id and settings and returns a new secret; the old one stops working for callers about 11 seconds after the change is `applied`; it needs the 2FA code under the same condition as key create (Step 4). `revoke` ends one key for good (a revoked key is gone, not paused; to pause a key use `update` with `enabled` false). `panic` is the emergency stop: in one step the URL is turned off and every key is revoked, while work the Bot already started keeps running (stop it in the agent). To reopen a panicked URL, turn it on with `update` (`enabled` true) and mint new keys. `delete` removes the URL; its label stays taken for ever. Deleting the computer detaches the URL (label and keys are kept, callers are refused) until you `repoint` it at a Bot in another computer.

```typescript
const rotated = await client.api.botUrls.keys.rotate(id, keyId, {});   // rotated.data!.secret is the new secret; the {} lets an onStepUp hook add the 2FA code
await client.api.botUrls.keys.revoke(id, keyId);
await client.api.botUrls.panic(id);
```

## Reference

**Accessor:** `client.agent`  |  **Import:** `import * as agent from 'hoody-sdk/agent'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, computerId?, serviceIndex?, serverName? }` (`server` is the older spelling of `serverName`, which wins when both are set), which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are set by the client and are refused with a `TypeError` before the call is sent: configure the token on the client, a kit credential as `kitAuth` on `withComputer()` or the client config (`middlewareContext.kitAuth` replaces the client's `kitAuth` for one call), and use another client for another identity), `cache` (ignored here: only an `api` GET is cached, never a GET to a kit host), `responseIsFinal` (`true`: never sent again once it may have reached the server), `keyedInProgressWait` (`false`: a 409 IDEMPOTENCY_REQUEST_IN_PROGRESS is the answer, not asked again), `redactBodyKeys` (body keys whose values an ApiError shows as [REDACTED]) and `maxResponseBytes` (a response body over this many bytes is refused with code RESPONSE_TOO_LARGE, and reading stops) (no `_realm`: that one is control-plane only). When the signature shows an options object (`options?: object` is one that takes the transport options only), the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself keeps the argument order it displays. A `wsOptions` argument (WebSocket methods only) accepts just `reconnect`, `connectTimeoutMs` and `transport`; the other transport options (`timeoutMs`, `signal`, …) stay in the request options the signature shows, never in `wsOptions`.

**Reading a method.** A method that shows no **Returns:** returns the response type named after it, the words after `client.` joined in PascalCase plus `Response`: `client.agent.acp.applyCredentialImport()` returns `Promise<AgentAcpApplyCredentialImportResponse>`. `data` is the request body; it has a row only where the row says more than the signature. `Item<R>` in a pagination helper's Returns is shorthand on this page, not an exported type: the element type of the item array the helper reads from response `R`, at the path the same line names. A pagination helper written `xAll(/* the arguments of x */)` takes exactly the arguments of `x`, described under `x`.

**Services** (the ones the notes and examples above call most come first):

- `client.agent.bots`: answerGate, cancelTurn, clearArchive, clearConversation, connectRealtime, connectTwilio, connectVoice, create, delete, get, getArchive, getArchiveAll, getArchiveIterator, getLogs, getLogsAll, getLogsIterator, getVoiceCheck, list, listAll, listDelegates, listDelegatesAll, listDelegatesIterator, listIterator, reset, resumeAll, setGuardrails, stopDelegate, streamLogs, update, ask, followLogs
- `client.agent.sessions`: close, connect, create, delete, disableHoodyEnv, disableYolo, enableHoodyEnv, enableYolo, get, getCreateKey, getImage, getSnapshot, getTranscript, getUsage, getUsageAll, getUsageIterator, list, listAll, listApplicableRules, listDirectories, listIterator, listLoops, listLoopsAll, listLoopsIterator, listShells, listSlashCommands, listSlashCommandsAll, listSlashCommandsIterator, rename, replay, retireCreateKey, setAfterCompaction, setAgent, setEffort, setModel, setVerbosity, startWorkflow, stopShell, streamMany, trim
- `client.agent.providers`: create, delete, deleteApiKey, get, list, listAll, listIterator, setApiKey, update
- `client.agent.mcp`: createWriteIntent, delete, disable, enable, import, list, previewImport, reconnect, test, upsert
- `client.agent.sessions.turns`: cancel, create, get, getByKey, list, retireKey, run, start
- `client.agent.audio`: createSpeech, createTranscription, listModels, listVoices
- `client.agent.gates`: answer, approve, deny, list, listAll, listIterator, suggest
- `client.agent.jobs`: delete, get, getResult
- `client.agent.models`: get, list, listAll, listIterator
- `client.agent.bots.messages`: getByKey, send, sendAudio
- `client.agent.headless`: start
- `client.agent.providers.auth`: getStatus, setDefault, test
- `client.agent.tools`: get, list, listAll, listIterator, listReadOnly, listReadOnlyAll, listReadOnlyIterator, run, start
- `client.agent`: getPauseState, login, pause, resume, stopAllWork, whoami, importLocalConfig, importLocalConfigs, listLocalConfigTools
- `client.agent.settings`: get, getInstructions, getSpendCaps, getWhereAgentsWork, listFeatures, setInstructions, setSpendCaps, update, updateFeatures
- `client.agent.skills`: create, delete, disable, enable, getSource, import, list, listAll, listIterator, rename, scan, setSource, trust, untrust
- `client.agent.definitions`: copy, create, delete, getSource, list, listAll, listIterator, rename, reset, setEffort, setModel, setSource, setTools, setTurnLimit, toggleTool
- `client.agent.hooks`: createWriteIntent, delete, disable, disableAll, enable, enableAll, getRules, list, reload, run, setRules, test, trust, upsert
- `client.agent.jev`: decide, decideForSession, getSettings, listModels, test, updateSettings
- `client.agent.loops`: create, delete, list, listAll, listIterator, startRun, update
- `client.agent.memory`: claimDataHost, consolidate, createWriteIntent, deleteProject, disable, enable, flush, getDataHost, getGraph, getStatus, listProjects, listProjectsAll, listProjectsIterator, search
- `client.agent.sessions.approverLease`: claim, release, renew
- `client.agent.sessions.autoReply`: disableWrites, enableWrites, update
- `client.agent.todos`: approveProposal, archive, cancel, claim, create, createComment, denyProposal, get, getRevision, list, listAll, listIterator, purgeArchived, release, sendMessage, snooze, start, triage, update
- `client.agent.workflows`: delete, get, hide, list, listAll, listIterator, sendMessage, set, setSummary, start, unhide
- `client.agent.acp`: applyCredentialImport, applyFileSync, disable, enable, getDefault, getStatus, previewCredentialImport, previewFileSync, setDefault, setModel, setSecret
- `client.agent.bots.channels`: addPrincipal, cancelPairing, create, createPairing, delete, deleteChat, get, getSettings, getSetup, list, listAll, listIterator, removePrincipal, setCredentials, update, updateChat, updatePrincipal, updateSettings
- `client.agent.changes`: get, stream
- `client.agent.completions`: create
- `client.agent.computers`: list, listAll, listIterator
- `client.agent.files`: list, listAll, listIterator
- `client.agent.fusions`: delete, list, listAll, listIterator, set
- `client.agent.github`: createIssue, getDiff, getStatus, listIssues, popStash, pushStash, sync, useAccount
- `client.agent.github.auth`: getStatus, login, logout, poll, start
- `client.agent.github.branches`: create, delete, getRemote, list, use
- `client.agent.github.commits`: create, list, suggestMessage
- `client.agent.github.prs`: checkout, create, list, merge
- `client.agent.github.repos`: clone, list, resolve, setCredentials
- `client.agent.github.worktrees`: create, delete, list
- `client.agent.kit`: getHealth, getMetrics, getVersion
- `client.agent.logs`: export, get, getStats, list, listSources, stream
- `client.agent.memory.items`: create, delete, get, list, listAll, listIterator, update
- `client.agent.providers.accounts`: add, list, listAll, listIterator, remove, use
- `client.agent.providers.oauth`: cancel, logout, poll, start, submitCode
- `client.agent.realms`: list, listAll, listIterator, use
- `client.agent.scripts`: deleteInstance, listInstances
- `client.agent.scripts.templates`: get, instantiate, list
- `client.agent.sessions.approval`: deleteRule, get, setRule, update
- `client.agent.sessions.attachments`: claim, release, renew
- `client.agent.sessions.commands`: get, getByKey, retireKey, send, withdraw
- `client.agent.sessions.tasks`: cancel, cancelAll, getTranscript, list
- `client.agent.sessions.tools`: list, listAll, listIterator, listMcp, listMcpAll, listMcpIterator, run
- `client.agent.sessions.waiters`: cancel, create, get, list
- `client.agent.skills.hub`: clearCache, getCacheStats, install, preview, search
- `client.agent.usage`: getStats, listByAccount, listByModel
- `client.agent.workflows.runs`: cancel, get, list, listAll, listIterator, resume

**Shared parameters.** A parameter row that repeats is printed once. When a signature shows a parameter that the method's own table does not list, its row is in the "Shared parameters" table of the method's service section when the name is there, else in the table below: same type, wire location, required mark and description. A row in a method's own table always describes that method. An SDK helper (marked as one) has no table and takes nothing from these lists.

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The session id. |
| `agentRealm` | `"global" \| (string & {})` | header `X-Hoody-Realm` | No | Per-request realm selector: "global" (not tied to a realm) or a 24-hex realm id (also accepted as ?realm=). On a session route it names the realm the session is looked up in: a session in another realm, or in a realm this login does not serve, is 404 not_found. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes, and for any other realm on an agent pinned to one realm. |
| `page` | `number` | query | No | 1-based page number for pagination. |
| `limit` | `number` | query | No | Maximum items per page (0 = no pagination). |
| `cwd` | `string` | header `X-Hoody-Cwd` | No | Per-request working-directory scope: the .hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /api/v1/agent/todos, which also accepts a body cwd). The value must be UTF-8: other bytes (a non-ASCII path sent as Latin-1) are refused 400 bad_request. |
| `configDir` | `string` | header `X-Hoody-Config-Dir` | No | Per-request --config-dir override selecting which on-disk .hoody install a stateless read/write resolves against. The value must be UTF-8: other bytes are refused 400 bad_request. |
| `toolComputer` | `string` | header `X-Hoody-Computer` | No | Per-request bound remote computer (omitted = local). Rejected (400) on routes with no computer dimension. |
| `key` | `string` | path | Yes | The key. |
| `name` | `string` | path | Yes | The name. |
| `approverLease` | `string` | header `X-Hoody-Approver-Lease` | No | The approver-lease capability returned by POST /api/v1/agent/sessions/{id}/approver-lease. Required on every decision (/api/v1/agent/sessions/{id}/confirm, or the confirmed re-issue of a gated tool run) on an "always" session whose lease was minted; the daemon verifies it at decision consumption. On renew/release it names the lease to act on. |

### `client.agent.bots` (29) — Bots operations

**Shared parameters of `client.agent.bots`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The bot id. |
| `expect_uid` | `string` | query | No | The uid of the Bot you read. When the id now names another Bot (the one you read was deleted and a new one created under the id), the request is refused 412 bot_changed and nothing changes. A Bot that is gone answers 404 not_found, as without it, and a request carrying it never creates chief. Omitted: no check. |

#### `answerGate` — Answer the approval or question the Bot itself waits on.

```typescript
client.agent.bots.answerGate(id: string, data: AgentBotsAnswerGateRequest, options?: { agentRealm?: "global" | (string & {}) })
```

**Body:** `{ gate_id*: string, generation*: int, request_id: string, confirm: { approved*: bool, reason: string }, answer: { answer*: string } }`

- `generation` — pending_gate.generation on GET /api/v1/agent/bots/{id}. Required, at least 1.
- `request_id` — Optional, approvals only: your own id for this decision, at most 64 characters from A-Z, a-z, 0-9, '.', '_' and '-'. When this decision is the one the gate used, a later 409 gate_already_resolved for the gate carries it as details.request_id.
- `confirm` — The decision on an approval. Any member other than approved and reason is refused 400.
- `answer` — The answer to a question. Any member other than answer is refused 400.

**HTTP:** `POST /api/v1/agent/bots/{id}/gate`

---

#### `cancelTurn` — Stop the Bot's running turn, and only that turn.

```typescript
client.agent.bots.cancelTurn(id: string, data: AgentBotsCancelTurnRequest, options?: { agentRealm?: "global" | (string & {}) })
```

**Body:** `{ turn_id*: string }`

- `turn_id` — The Bot's running turn: turn_id on GET /api/v1/agent/bots/{id}. Required.

**HTTP:** `POST /api/v1/agent/bots/{id}/cancel`

---

#### `clearArchive` — Delete a Bot's archive.

```typescript
client.agent.bots.clearArchive(id: string, options?: { expect_uid?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `POST /api/v1/agent/bots/{id}/purge`
**CLI:** `hoody agent bots archive clear --id <id>`

---

#### `clearConversation` — Make a Bot forget its conversation.

```typescript
client.agent.bots.clearConversation(id: string, options?: { expect_uid?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `POST /api/v1/agent/bots/{id}/forget`
**CLI:** `hoody agent bots conversation clear --id <id>`

---

#### `connectRealtime` — Talk to a Bot with an OpenAI Realtime client (WebSocket).

```typescript
client.agent.bots.connectRealtime(id: string, options?: { takeover?: boolean; agentRealm?: "global" | (string & {}) }, _templateVars?: { projectId?: string; computerId?: string; serviceIndex?: string | number; serverName?: string; server?: string }, wsOptions?: { reconnect?: boolean; connectTimeoutMs?: number; transport?: 'auto' | 'ws' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `takeover` | `boolean` | query | No | true: take over from the connection that controls the Bot's voice now. |

**Returns:** `Promise<AgentBotsConnectRealtimeWebSocket>` — an unconnected wrapper: register handlers, then `await ws.connect()`  |  **HTTP:** `GET /api/v1/agent/bots/{id}/realtime`

---

#### `connectTwilio` — Connect a Twilio Media Stream to a Bot (WebSocket).

```typescript
client.agent.bots.connectTwilio(id: string, options?: { takeover?: boolean; agentRealm?: "global" | (string & {}) }, _templateVars?: { projectId?: string; computerId?: string; serviceIndex?: string | number; serverName?: string; server?: string }, wsOptions?: { reconnect?: boolean; connectTimeoutMs?: number; transport?: 'auto' | 'ws' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `takeover` | `boolean` | query | No | true: take over from the Bot's open voice controller. |

**Returns:** `Promise<AgentBotsConnectTwilioWebSocket>` — an unconnected wrapper: register handlers, then `await ws.connect()`  |  **HTTP:** `GET /api/v1/agent/bots/{id}/twilio`

---

#### `connectVoice` — Talk to a Bot by voice (WebSocket).

```typescript
client.agent.bots.connectVoice(id: string, options?: { in_rate?: 8000 | 16000 | 24000 | 48000; out_rate?: 8000 | 16000 | 24000 | 48000; in_format?: "pcm16" | "pcmu" | "pcma"; mode?: "vad" | "ptt"; voice?: string; language?: string; speak_wakes?: boolean; takeover?: boolean; speak?: boolean; refuse?: "frame"; play_lead?: boolean; require?: string; agentRealm?: "global" | (string & {}) }, _templateVars?: { projectId?: string; computerId?: string; serviceIndex?: string | number; serverName?: string; server?: string }, wsOptions?: { reconnect?: boolean; connectTimeoutMs?: number; transport?: 'auto' | 'ws' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `in_rate` | `8000 \| 16000 \| 24000 \| 48000` | query | No | Input sample rate: 8000, 16000 (default), 24000 or 48000. |
| `out_rate` | `8000 \| 16000 \| 24000 \| 48000` | query | No | Output sample rate: 8000, 16000, 24000 (default) or 48000. |
| `in_format` | `"pcm16" \| "pcmu" \| "pcma"` | query | No | Input encoding: pcm16 (16-bit little-endian, default), pcmu or pcma. |
| `mode` | `"vad" \| "ptt"` | query | No | vad (default): the agent detects when the user starts and stops speaking. ptt (push to talk): the client sends ptt.down and ptt.up. |
| `voice` | `string` | query | No | The voice to speak in; omitted, the Bot's own. |
| `language` | `string` | query | No | The language the user speaks; omitted, the Bot's own. |
| `speak_wakes` | `boolean` | query | No | true: also speak replies the Bot gives on its own; omitted, the Bot's setting. |
| `takeover` | `boolean` | query | No | true: take over from the connection that controls the Bot's voice now. |
| `speak` | `boolean` | query | No | false: replies arrive as text only (reply.final); no speech is made and nothing is billed for speech synthesis. Speech-to-text still runs. Default true. |
| `refuse` | `"frame"` | query | No | frame: when the agent refuses the connection, accept the upgrade, send one refused frame with the code, message, details and retry_after_secs of the refusal, then close with 4000 plus its HTTP status (4400, 4404, 4409, 4500 or 4503), so a client that cannot read an HTTP refusal of a WebSocket, such as a browser, learns why. Omitted: refusals are HTTP answers. |
| `play_lead` | `boolean` | query | No | true: the agent keeps at most 8 seconds of reply audio ahead of what playback.mark says was played, and a reply whose audio waits 5 seconds with no mark moving on stops speaking (output.stop and reply.final reason no_marks, spoken unknown, or partial when whole segments were heard; the turn goes on). Send playback.mark at least every 500 ms while playing. Omitted or false: reply audio is sent as fast as the connection takes it. |
| `require` | `string` | query | No | stt, tts or stt,tts: check those speech settings before the upgrade and refuse it when they are not ready (400 bad_request for a voice or language the model does not offer, else 503 speech_unavailable). tts needs speak=true. Omitted: no check. |

**Returns:** `Promise<AgentBotsConnectVoiceWebSocket>` — an unconnected wrapper: register handlers, then `await ws.connect()`  |  **HTTP:** `GET /api/v1/agent/bots/{id}/voice`

---

#### `create` — Create a Bot.

```typescript
client.agent.bots.create(data?: AgentBotsCreateRequest, options?: { agentRealm?: "global" | (string & {}) })
```

**Body:** `{ id: string, name: string, role: string, instructions: string, model: string, guardrails: string, allowed_computers: string[], allowed_agents: string[], yolo: bool, guardrail_check: "strict" | "lenient" | "off", async: bool, wait_seconds: int, mcp_hints: bool, routing: { mode*: "off" | "suggest" | "auto", light: object, heavy: object }|null, worker_backend: "llm" | "acp"|null, worker_delegated_agent: string|null, allowed_worker_backends: string[]|null, worker_delegated_model: string|null, worker_delegated_effort: "" | "low" | "medium" | "high" | "xhigh" | "max"|null, worker_model: string|null, worker_thinking: "" | "off" | "on" | "low" | "medium" | "high" | "xhigh" | "max"|null, speech: { tts_model: string, stt_model: string, voice: string, language: string, speed: number, stt_prompt: string, speak_wakes: bool, speak_gates: bool, limits: object }|null }`

**HTTP:** `POST /api/v1/agent/bots`
**CLI:** `hoody agent bots create`

---

#### `delete` — Delete a Bot.

```typescript
client.agent.bots.delete(id: string, options?: { expect_uid?: string; agentRealm?: "global" | (string & {}) })
```

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/agent/bots/{id}`
**CLI:** `hoody agent bots delete --id <id>`

---

#### `get` — Get a Bot.

```typescript
client.agent.bots.get(id: string, options?: { agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/bots/{id}`
**CLI:** `hoody agent bots get --id <id>`

---

#### `getArchive` — Read a Bot's archive.

```typescript
client.agent.bots.getArchive(id: string, options?: { since?: number; limit?: number; before?: number; tail?: boolean; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `since` | `number` | query | No | Return only rows whose seq is greater than this: the next_since of the previous page. Default 0. |
| `limit` | `number` | query | No | At most this many rows: 100 when omitted or 0, at most 500 (a larger value reads 500). Negative or non-integer = 400. These routes page by since, not by page number: ?page is 400. |
| `before` | `number` | query | No | Read back from the end: the newest rows whose seq is less than this, oldest first. Pass the answer's before back to read the page older than it. Not with since or tail. |
| `tail` | `boolean` | query | No | true: the newest rows of the log, oldest first, as before would give them for the next seq the log writes. The log only (on the archive, 400). Not with since or before. |

**HTTP:** `GET /api/v1/agent/bots/{id}/archive`
**CLI:** `hoody agent bots archive get --id <id>`

---

#### `getArchiveAll` — Read a Bot's archive. (collect all pages)

```typescript
client.agent.bots.getArchiveAll(/* the arguments of getArchive */)
```

**Returns:** `Promise<Item<AgentBotsGetArchiveResponse>[]>` — every item of `data.items`, pages collected from the cursor you pass, or from where `getArchive()` starts without one (`getArchive()` fetches one page). `getArchiveIterator()` streams the same items instead of collecting them. Pages forward with `since` only: pass neither `before` nor `tail` (the helper adds `since` from the second page on, and the service refuses both together with `since` with 400). To read backward, call `getArchive()` and pass the response's `before` into the next request.  |  **HTTP:** `GET /api/v1/agent/bots/{id}/archive`
**CLI:** `hoody agent bots archive get --id <id>`

---

#### `getArchiveIterator` — Read a Bot's archive. (async iterator)

```typescript
client.agent.bots.getArchiveIterator(/* the arguments of getArchive */)
```

**Returns:** `AsyncGenerator<Item<AgentBotsGetArchiveResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the cursor you pass, or from where `getArchive()` starts without one (`getArchive()` fetches one page). Pages forward with `since` only: pass neither `before` nor `tail` (the helper adds `since` from the second page on, and the service refuses both together with `since` with 400). To read backward, call `getArchive()` and pass the response's `before` into the next request.  |  **HTTP:** `GET /api/v1/agent/bots/{id}/archive`
**CLI:** `hoody agent bots archive get --id <id>`

---

#### `getLogs` — Read a Bot's log.

```typescript
client.agent.bots.getLogs(id: string, options?: { since?: number; limit?: number; before?: number; tail?: boolean; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `since` | `number` | query | No | Return only rows whose seq is greater than this: the next_since of the previous page. Default 0. |
| `limit` | `number` | query | No | At most this many rows: 100 when omitted or 0, at most 500 (a larger value reads 500). Negative or non-integer = 400. These routes page by since, not by page number: ?page is 400. |
| `before` | `number` | query | No | Read back from the end: the newest rows whose seq is less than this, oldest first. Pass the answer's before back to read the page older than it. Not with since or tail. |
| `tail` | `boolean` | query | No | true: the newest rows of the log, oldest first, as before would give them for the next seq the log writes. The log only (on the archive, 400). Not with since or before. |

**HTTP:** `GET /api/v1/agent/bots/{id}/log`
**CLI:** `hoody agent bots logs get --id <id>`

---

#### `getLogsAll` — Read a Bot's log. (collect all pages)

```typescript
client.agent.bots.getLogsAll(/* the arguments of getLogs */)
```

**Returns:** `Promise<Item<AgentBotsGetLogsResponse>[]>` — every item of `data.items`, pages collected from the cursor you pass, or from where `getLogs()` starts without one (`getLogs()` fetches one page). `getLogsIterator()` streams the same items instead of collecting them. Pages forward with `since` only: pass neither `before` nor `tail` (the helper adds `since` from the second page on, and the service refuses both together with `since` with 400). To read backward, call `getLogs()` and pass the response's `before` into the next request.  |  **HTTP:** `GET /api/v1/agent/bots/{id}/log`
**CLI:** `hoody agent bots logs get --id <id>`

---

#### `getLogsIterator` — Read a Bot's log. (async iterator)

```typescript
client.agent.bots.getLogsIterator(/* the arguments of getLogs */)
```

**Returns:** `AsyncGenerator<Item<AgentBotsGetLogsResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the cursor you pass, or from where `getLogs()` starts without one (`getLogs()` fetches one page). Pages forward with `since` only: pass neither `before` nor `tail` (the helper adds `since` from the second page on, and the service refuses both together with `since` with 400). To read backward, call `getLogs()` and pass the response's `before` into the next request.  |  **HTTP:** `GET /api/v1/agent/bots/{id}/log`
**CLI:** `hoody agent bots logs get --id <id>`

---

#### `getVoiceCheck` — Check that a Bot can talk by voice.

```typescript
client.agent.bots.getVoiceCheck(id: string, options?: { in_rate?: 8000 | 16000 | 24000 | 48000; out_rate?: 8000 | 16000 | 24000 | 48000; in_format?: "pcm16" | "pcmu" | "pcma"; mode?: "vad" | "ptt"; voice?: string; language?: string; speak?: boolean; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `in_rate` | `8000 \| 16000 \| 24000 \| 48000` | query | No | Input sample rate: 8000, 16000 (default), 24000 or 48000. Checked for a valid value only (else 400 bad_request); it does not change the result. |
| `out_rate` | `8000 \| 16000 \| 24000 \| 48000` | query | No | Output sample rate: 8000, 16000, 24000 (default) or 48000. Checked for a valid value only (else 400 bad_request); it does not change the result. |
| `in_format` | `"pcm16" \| "pcmu" \| "pcma"` | query | No | Input encoding: pcm16 (16-bit little-endian, default), pcmu or pcma. Checked for a valid value only (else 400 bad_request); it does not change the result. |
| `mode` | `"vad" \| "ptt"` | query | No | vad (default): the agent detects when the user starts and stops speaking. ptt (push to talk): the client sends ptt.down and ptt.up. Checked for a valid value only (else 400 bad_request); it does not change the result. |
| `voice` | `string` | query | No | The voice to speak in; omitted, the Bot's own. |
| `language` | `string` | query | No | The language the user speaks; omitted, the Bot's own. |
| `speak` | `boolean` | query | No | false: check speech-to-text only, as for a voice connection opened with speak=false. Default true. |

**HTTP:** `GET /api/v1/agent/bots/{id}/voice/check`

---

#### `list` — List the Bots.

```typescript
client.agent.bots.list(options?: { agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `agentRealm` | `"global" \| "all" \| (string & {})` | query `realm` | No | The realm to list: "global" (Bots not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves, global included. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |

**HTTP:** `GET /api/v1/agent/bots`
**CLI:** `hoody agent bots list`

---

#### `listAll` — List the Bots. (collect all pages)

```typescript
client.agent.bots.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<AgentBotsListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/bots`
**CLI:** `hoody agent bots list`

---

#### `listDelegates` — List a Bot's delegates.

```typescript
client.agent.bots.listDelegates(id: string, options?: { state?: "open" | "closed"; page?: number; limit?: number; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `state` | `"open" \| "closed"` | query | No | open or closed: list only the delegates in that state. Omitted: both. |

**HTTP:** `GET /api/v1/agent/bots/{id}/delegates`
**CLI:** `hoody agent bots delegates list --id <id>`

---

#### `listDelegatesAll` — List a Bot's delegates. (collect all pages)

```typescript
client.agent.bots.listDelegatesAll(/* the arguments of listDelegates */)
```

**Returns:** `Promise<Item<AgentBotsListDelegatesResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`listDelegates()` fetches one page). `listDelegatesIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/bots/{id}/delegates`
**CLI:** `hoody agent bots delegates list --id <id>`

---

#### `listDelegatesIterator` — List a Bot's delegates. (async iterator)

```typescript
client.agent.bots.listDelegatesIterator(/* the arguments of listDelegates */)
```

**Returns:** `AsyncGenerator<Item<AgentBotsListDelegatesResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`listDelegates()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/bots/{id}/delegates`
**CLI:** `hoody agent bots delegates list --id <id>`

---

#### `listIterator` — List the Bots. (async iterator)

```typescript
client.agent.bots.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<AgentBotsListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/bots`
**CLI:** `hoody agent bots list`

---

#### `reset` — Give a Bot a new session.

```typescript
client.agent.bots.reset(id: string, options?: { expect_uid?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `POST /api/v1/agent/bots/{id}/reset`
**CLI:** `hoody agent bots reset --id <id>`

---

#### `resumeAll` — Resume suspended Bots.

```typescript
client.agent.bots.resumeAll(options?: { agentRealm?: "global" | "all" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `agentRealm` | `"global" \| "all" \| (string & {})` | query `realm` | No | The realm whose Bots to resume: "global" (Bots not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves, global included. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |

**HTTP:** `POST /api/v1/agent/bots/resume`
**CLI:** `hoody agent bots resume`

---

#### `setGuardrails` — Replace a Bot's guardrails.

```typescript
client.agent.bots.setGuardrails(id: string, data: AgentBotsSetGuardrailsRequest, options?: { expect_uid?: string; expect_revision?: number; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `expect_revision` | `number` | query | No | The revision of the Bot you read. When the Bot's settings or guardrails were written since, the request is refused 412 revision_mismatch and nothing changes. Omitted: no check. |

**Body:** `{ guardrails*: string }`

- `guardrails` — The new limits; empty clears them. The Bot's name, role, instructions, guardrails and dispatch limits together must fit in 16 KiB; a write that would go past that is refused 400 bad_request with details.field naming a field.

**HTTP:** `PUT /api/v1/agent/bots/{id}/guardrails`
**CLI:** `hoody agent bots guardrails set --id <id> --guardrails <guardrails>`

---

#### `stopDelegate` — Stop one of a Bot's delegates now.

```typescript
client.agent.bots.stopDelegate(id: string, sid: string, data?: AgentBotsStopDelegateRequest, options?: { idempotencyKey?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `sid` | `string` | path | Yes | The delegate id. |
| `idempotencyKey` | `string` | header `Idempotency-Key` | No | Opaque retry key (1–255 printable ASCII, no whitespace). The same stop sent again with the same key returns its outcome; the same key with a different close is 422; a key starting with "chan:" is 400. |

**Body:** `{ close: bool }`

**HTTP:** `POST /api/v1/agent/bots/{id}/delegates/{sid}/stop`
**CLI:** `hoody agent bots delegates stop --id <id> --delegate-id <delegate-id>`

---

#### `streamLogs` — Follow a Bot's log (SSE).

```typescript
client.agent.bots.streamLogs(id: string, options?: { since?: number; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `since` | `number` | query | No | Return only rows whose seq is greater than this. Default 0. |

**Returns:** `Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentBotsStreamLogsFrames>>>`  |  **HTTP:** `GET /api/v1/agent/bots/{id}/stream`
**CLI:** `hoody agent bots logs stream --id <id>`

---

#### `update` — Change a Bot's settings.

```typescript
client.agent.bots.update(id: string, data?: AgentBotsUpdateRequest, options?: { expect_uid?: string; expect_revision?: number; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `expect_revision` | `number` | query | No | The revision of the Bot you read. When the Bot's settings or guardrails were written since, the request is refused 412 revision_mismatch and nothing changes. Omitted: no check. |

**Body:** `{ name: string, role: string, instructions: string, model: string, allowed_computers: string[], allowed_agents: string[], yolo: bool, guardrail_check: "strict" | "lenient" | "off", async: bool, wait_seconds: int, mcp_hints: bool, routing: { mode*: "off" | "suggest" | "auto", light: object, heavy: object }|null, worker_backend: "llm" | "acp"|null, worker_delegated_agent: string|null, allowed_worker_backends: string[]|null, worker_delegated_model: string|null, worker_delegated_effort: "" | "low" | "medium" | "high" | "xhigh" | "max"|null, worker_model: string|null, worker_thinking: "" | "off" | "on" | "low" | "medium" | "high" | "xhigh" | "max"|null, realtime_max_items: int, speech: { tts_model: string, stt_model: string, voice: string, language: string, speed: number, stt_prompt: string, speak_wakes: bool, speak_gates: bool, limits: object }|null }`

**HTTP:** `PATCH /api/v1/agent/bots/{id}`
**CLI:** `hoody agent bots update --id <id>`

---

#### `ask` — Send `text` to the Bot under an Idempotency-Key and wait for its reply.

```typescript
client.agent.bots.ask(id: string, text: string, options?: BotAskOptions, templateVars?: TemplateVars)
```

**Returns:** `Promise<BotAskResult>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `followLogs` — The Bot's log rows, live: the rows after `since`, then each new row as it is written.

```typescript
client.agent.bots.followLogs(id: string, options?: BotFollowLogsOptions, templateVars?: TemplateVars)
```

**Returns:** `AsyncIterableIterator<BotLogRow>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

### `client.agent.sessions` (40) — Create, drive, and tear down agent sessions

#### `close` — Close the session (teardown).

```typescript
client.agent.sessions.close(id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `POST /api/v1/agent/sessions/{id}/close`
**CLI:** `hoody agent sessions close --id <id>`

---

#### `connect` — Attach to a session's event stream (WebSocket / SSE).

```typescript
client.agent.sessions.connect(id: string, options?: { since?: number; incarnation?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) }, _templateVars?: { projectId?: string; computerId?: string; serviceIndex?: string | number; serverName?: string; server?: string }, wsOptions?: { reconnect?: boolean; connectTimeoutMs?: number; transport?: 'auto' | 'ws' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `since` | `number` | query | No | Resume from this gateway int64 seq (also accepted as the Last-Event-ID header). |
| `incarnation` | `string` | query | No | The incarnation the since cursor belongs to (from a frame, replay_boundary, or GET /api/v1/agent/sessions/{id}). When it differs from the live session's, the cursor is treated as invalid: a replay_gap frame, then the full retained ring. |

**Returns:** `Promise<AgentSessionsConnectWebSocket>` — an unconnected wrapper: register handlers, then `await ws.connect()`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/stream`
**CLI:** `hoody agent sessions stream --id <id>`
**SSE form:** `client.agent.sessions.stream` reads the same route as Server-Sent Events. It takes the same arguments without `wsOptions` and resolves to an `IEventStream`: iterate it with `for await`.

---

#### `create` — Create, fork, or attach a session.

```typescript
client.agent.sessions.create(data?: AgentSessionsCreateRequest, options?: { idempotencyKey?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `idempotencyKey` | `string` | header `Idempotency-Key` | No | Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key after the first try started a session re-joins that session (replayed true); a first try that never started one answers 409 creation_interrupted and the key cannot create again, so use a new key. The same key with a different request body is 422. |

**Body:** `{ realm: string, computer: string, cwd: string, config_dir: string, model: string, agent: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", attach: string, fork: string, fork_turn_idx: int, backend: string, delegated_agent: string, follow_realm_backend: bool, headless: bool, approval: { mode: "" | "default" | "always", locked: bool }, expected_binding: { realm: string, computer: string, cwd: string, backend: "" | "llm" | "acp" }, prompt_blocks: { contract: bool, transcripts: bool, frequent_files: bool, hook_context: bool, memory: bool, project_instructions: bool, agent_instructions: bool, team_rules: bool, skills: bool, workflows: bool, verbosity: bool, hoody_platform: bool, hoody_exec: bool, fleet_notice: bool, environment: bool }, model_settings: { thinking: object, temperature: number, max_tokens: int, response_format: object }, helper_gates: bool, outcome_claims: bool, frame_tools: bool }`

**HTTP:** `POST /api/v1/agent/sessions`
**CLI:** `hoody agent sessions create`

---

#### `delete` — Close a session and hard-delete it: the persisted record is removed too, not only the live connection.

```typescript
client.agent.sessions.delete(id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `DELETE /api/v1/agent/sessions/{id}?hard=true`
**CLI:** `hoody agent sessions delete --id <id>`

---

#### `disableHoodyEnv` — Toggle Hoody shell-env injection.

```typescript
client.agent.sessions.disableHoodyEnv(id: string, data?: Omit<AgentSessionsDisableHoodyEnvRequest, "enabled">, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Fixed by the method:** the method sets `enabled: false`; do not pass `enabled`.

**HTTP:** `PATCH /api/v1/agent/sessions/{id}/hoody-env`
**CLI:** `hoody agent sessions hoodyenv disable --id <id>`

---

#### `disableYolo` — Turn Allow everything on or off for this chat.

```typescript
client.agent.sessions.disableYolo(id: string, data?: Omit<AgentSessionsDisableYoloRequest, "enabled">, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Fixed by the method:** the method sets `enabled: false`; do not pass `enabled`.

**HTTP:** `PATCH /api/v1/agent/sessions/{id}/yolo`
**CLI:** `hoody agent sessions yolo disable --id <id>`

---

#### `enableHoodyEnv` — Toggle Hoody shell-env injection.

```typescript
client.agent.sessions.enableHoodyEnv(id: string, data?: Omit<AgentSessionsEnableHoodyEnvRequest, "enabled">, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Fixed by the method:** the method sets `enabled: true`; do not pass `enabled`.

**HTTP:** `PATCH /api/v1/agent/sessions/{id}/hoody-env`
**CLI:** `hoody agent sessions hoodyenv enable --id <id>`

---

#### `enableYolo` — Turn Allow everything on or off for this chat.

```typescript
client.agent.sessions.enableYolo(id: string, data?: Omit<AgentSessionsEnableYoloRequest, "enabled">, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Fixed by the method:** the method sets `enabled: true`; do not pass `enabled`.

**HTTP:** `PATCH /api/v1/agent/sessions/{id}/yolo`
**CLI:** `hoody agent sessions yolo enable --id <id>`

---

#### `get` — Get a session summary.

```typescript
client.agent.sessions.get(id: string, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/sessions/{id}`
**CLI:** `hoody agent sessions get --id <id>`

---

#### `getCreateKey` — Read what a keyed session create became.

```typescript
client.agent.sessions.getCreateKey(key: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/session-create-keys/{key}`
**CLI:** `hoody agent sessions createkeys get --key <key>`

---

#### `getImage` — Read an image attached to a session message.

```typescript
client.agent.sessions.getImage(id: string, image_id: string, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `image_id` | `string` | path | Yes | The image id. |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/images/{image_id}`
**CLI:** `hoody agent sessions images get --id <id> --image-id <image-id>`

---

#### `getSnapshot` — Read a session's recoverable state.

```typescript
client.agent.sessions.getSnapshot(id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/sessions/{id}/state`
**CLI:** `hoody agent sessions snapshot get --id <id>`

---

#### `getTranscript` — Read a session's transcript without attaching.

```typescript
client.agent.sessions.getTranscript(id: string, options?: { after_turn?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `after_turn` | `number` | query | No | Exclusive completed-turn skip cursor: return content strictly after completed turn N (0 = full transcript; values past the end clamp; negative/non-integer = 400). |

**HTTP:** `GET /api/v1/agent/sessions/{id}/transcript`
**CLI:** `hoody agent sessions transcript get --id <id>`

---

#### `getUsage` — Read a session's per-call LLM usage.

```typescript
client.agent.sessions.getUsage(id: string, options?: { after_id?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `after_id` | `number` | query | No | Exclusive cursor: return rows whose id is greater than this. Omit (or 0) to start from the session's first row. Negative or non-integer = 400. |
| `limit` | `number` | query | No | Return at most this many rows (1 to 5000, default 500). Out of range or non-integer = 400. |

**HTTP:** `GET /api/v1/agent/sessions/{id}/usage`
**CLI:** `hoody agent sessions usage get --id <id>`

---

#### `getUsageAll` — Read a session's per-call LLM usage. (collect all pages)

```typescript
client.agent.sessions.getUsageAll(/* the arguments of getUsage */)
```

**Returns:** `Promise<Item<AgentSessionsGetUsageResponse>[]>` — every item of `data.items`, pages collected from the cursor you pass, or from where `getUsage()` starts without one (`getUsage()` fetches one page). `getUsageIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/usage`
**CLI:** `hoody agent sessions usage get --id <id>`

---

#### `getUsageIterator` — Read a session's per-call LLM usage. (async iterator)

```typescript
client.agent.sessions.getUsageIterator(/* the arguments of getUsage */)
```

**Returns:** `AsyncGenerator<Item<AgentSessionsGetUsageResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the cursor you pass, or from where `getUsage()` starts without one (`getUsage()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/usage`
**CLI:** `hoody agent sessions usage get --id <id>`

---

#### `list` — List sessions.

```typescript
client.agent.sessions.list(options?: { include_system?: boolean; order?: "started" | "last_active"; agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number; cwd?: string; configDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_system` | `boolean` | query | No | When true, also include daemon-owned system/resident sessions in the listing. |
| `order` | `"started" \| "last_active"` | query | No | started (newest started first) or last_active (most recently active first). Omitted: started when limit is given, else last_active. Another value is 400 bad_request. |
| `agentRealm` | `"global" \| "all" \| (string & {})` | query `realm` | No | The realm to list: "global" (sessions not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |

**HTTP:** `GET /api/v1/agent/sessions`
**CLI:** `hoody agent sessions list`

---

#### `listAll` — List sessions. (collect all pages)

```typescript
client.agent.sessions.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<AgentSessionsListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/sessions`
**CLI:** `hoody agent sessions list`

---

#### `listApplicableRules` — Which tool-call rules apply.

```typescript
client.agent.sessions.listApplicableRules(id: string, options?: { agent?: string; tool?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `agent` | `string` | query | No | Agent name to ask about (default: the session's own agent). |
| `tool` | `string` | query | No | Tool name to ask about (default: any tool). |

**HTTP:** `GET /api/v1/agent/sessions/{id}/rules/applies`
**CLI:** `hoody agent sessions rules applicable list --id <id>`

---

#### `listDirectories` — List distinct session working directories.

```typescript
client.agent.sessions.listDirectories(options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/sessions/cwds`
**CLI:** `hoody agent sessions directories list`

---

#### `listIterator` — List sessions. (async iterator)

```typescript
client.agent.sessions.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<AgentSessionsListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/sessions`
**CLI:** `hoody agent sessions list`

---

#### `listLoops` — List a session's loops.

```typescript
client.agent.sessions.listLoops(id: string, options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/sessions/{id}/loops`
**CLI:** `hoody agent sessions loops list --id <id>`

---

#### `listLoopsAll` — List a session's loops. (collect all pages)

```typescript
client.agent.sessions.listLoopsAll(/* the arguments of listLoops */)
```

**Returns:** `Promise<Item<AgentSessionsListLoopsResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`listLoops()` fetches one page). `listLoopsIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/loops`
**CLI:** `hoody agent sessions loops list --id <id>`

---

#### `listLoopsIterator` — List a session's loops. (async iterator)

```typescript
client.agent.sessions.listLoopsIterator(/* the arguments of listLoops */)
```

**Returns:** `AsyncGenerator<Item<AgentSessionsListLoopsResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`listLoops()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/loops`
**CLI:** `hoody agent sessions loops list --id <id>`

---

#### `listShells` — List a session's background shells.

```typescript
client.agent.sessions.listShells(id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/sessions/{id}/bash-jobs`
**CLI:** `hoody agent sessions shells list --id <id>`

---

#### `listSlashCommands` — List the slash commands a session's chat offers.

```typescript
client.agent.sessions.listSlashCommands(id: string, options?: { page?: number; limit?: number; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/sessions/{id}/slash-commands`
**CLI:** `hoody agent sessions slashcommands list --id <id>`

---

#### `listSlashCommandsAll` — List the slash commands a session's chat offers. (collect all pages)

```typescript
client.agent.sessions.listSlashCommandsAll(/* the arguments of listSlashCommands */)
```

**Returns:** `Promise<Item<AgentSessionsListSlashCommandsResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`listSlashCommands()` fetches one page). `listSlashCommandsIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/slash-commands`
**CLI:** `hoody agent sessions slashcommands list --id <id>`

---

#### `listSlashCommandsIterator` — List the slash commands a session's chat offers. (async iterator)

```typescript
client.agent.sessions.listSlashCommandsIterator(/* the arguments of listSlashCommands */)
```

**Returns:** `AsyncGenerator<Item<AgentSessionsListSlashCommandsResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`listSlashCommands()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/slash-commands`
**CLI:** `hoody agent sessions slashcommands list --id <id>`

---

#### `rename` — Rename a session.

```typescript
client.agent.sessions.rename(id: string, data: AgentSessionsRenameRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ name*: string }`

- `name` — The new title. An empty string clears it back to the automatic title and asks for a new one. Required: omitting it is a 400, not a clear.

**HTTP:** `PATCH /api/v1/agent/sessions/{id}`
**CLI:** `hoody agent sessions rename --id <id> --name <name>`

---

#### `replay` — Replay a live session's buffered events.

```typescript
client.agent.sessions.replay(id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/sessions/{id}/replay`
**CLI:** `hoody agent sessions replay --id <id>`

---

#### `retireCreateKey` — Retire a session create key no read found.

```typescript
client.agent.sessions.retireCreateKey(key: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `POST /api/v1/agent/session-create-keys/{key}/retire`
**CLI:** `hoody agent sessions createkeys retire --key <key>`

---

#### `setAfterCompaction` — Set the message re-added after every compaction.

```typescript
client.agent.sessions.setAfterCompaction(id: string, data: AgentSessionsSetAfterCompactionRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ text*: string }`

- `text` — The message text, at most 16384 bytes in UTF-8. Empty or whitespace-only removes the message.

**HTTP:** `PUT /api/v1/agent/sessions/{id}/after-compaction`
**CLI:** `hoody agent sessions aftercompaction set --id <id> --text <text>`

---

#### `setAgent` — Switch the chat agent.

```typescript
client.agent.sessions.setAgent(id: string, data?: AgentSessionsSetAgentRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ agent: string }`

- `agent` — … The bot agent is refused 400 bad_request (details.field agent) on every session: it runs only inside a Bot (POST /api/v1/agent/bots). A Bot's own session keeps the bot agent: any switch of it is refused 400 bad_request. A switch to a tool-ceiling agent (script-writer, github-installer), or away from a session running one, is refused 400 bad_request (details.field agent): its tools are fixed at start.

**HTTP:** `PATCH /api/v1/agent/sessions/{id}/agent`
**CLI:** `hoody agent sessions agent set --id <id>`

---

#### `setEffort` — Set reasoning effort.

```typescript
client.agent.sessions.setEffort(id: string, data?: AgentSessionsSetEffortRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ effort: "" | "low" | "medium" | "high" | "xhigh" | "max" }`

- `effort` — low|medium|high|xhigh|max, or "" for the model default. Any other value is 400 bad_request (details.field effort).

**HTTP:** `PATCH /api/v1/agent/sessions/{id}/effort`
**CLI:** `hoody agent sessions effort set --id <id>`

---

#### `setModel` — Switch the session model.

```typescript
client.agent.sessions.setModel(id: string, data: AgentSessionsSetModelRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ model*: string, scope: "agent" | "session" }`

- `model` — Model spec to switch to (provider-prefixed, e.g. anthropic/claude-opus-4-8, or fusion/<slug>). Required: a blank value is rejected, never a silent no-op.

**HTTP:** `PATCH /api/v1/agent/sessions/{id}/model`
**CLI:** `hoody agent sessions model set --id <id> --model <model>`

---

#### `setVerbosity` — Set response verbosity.

```typescript
client.agent.sessions.setVerbosity(id: string, data?: AgentSessionsSetVerbosityRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ level: "normal" | "concise" | "terse" | "minimal" }`

- `level` — normal|concise|terse|minimal; surrounding whitespace is trimmed, and omitted, empty or off selects normal. Any other value is 400 bad_request (details.field level); the applied level is echoed on the stream as event.verbosity.

**HTTP:** `PATCH /api/v1/agent/sessions/{id}/verbosity`
**CLI:** `hoody agent sessions verbosity set --id <id>`

---

#### `startWorkflow` — Run a workflow onto an existing session.

```typescript
client.agent.sessions.startWorkflow(id: string, name: string, data?: AgentSessionsStartWorkflowRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ prompt: string, inputs: { [key: string]: string } }`

- `inputs` — Optional run-time values for the workflow's DECLARED input parameters (declared name → string value; resolves to $(input.<name>) in every step). A workflow with a REQUIRED declared parameter cannot run without these. Values must be strings; a non-string value is a 400.

**HTTP:** `POST /api/v1/agent/sessions/{id}/workflows/{name}/runs`
**CLI:** `hoody agent sessions workflows start --id <id> --workflow <workflow>`

---

#### `stopShell` — Stop one of a session's background shells.

```typescript
client.agent.sessions.stopShell(id: string, job_id: string, options?: { idempotencyKey?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `job_id` | `string` | path | Yes | The job id. |
| `idempotencyKey` | `string` | header `Idempotency-Key` | No | Retry key, 1-255 printable ASCII without whitespace, minted once per stop: a retry with the same key answers the first call's outcome. |

**HTTP:** `POST /api/v1/agent/sessions/{id}/bash-jobs/{job_id}/stop`
**CLI:** `hoody agent sessions shells stop --id <id> --shell-id <shell-id>`

---

#### `streamMany` — Watch up to 32 live sessions' events on one stream (SSE).

```typescript
client.agent.sessions.streamMany(options: { ids: string; since?: string; incarnation?: string; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `ids` | `string` | query | Yes | Comma list of 1 to 32 distinct session ids. Required. |
| `since` | `string` | query | No | Comma list of <session id>:<seq>, the last gateway seq applied per session; ids not listed start from their whole retained ring. |
| `incarnation` | `string` | query | No | Comma list of <session id>:<incarnation>, the incarnation each since cursor belongs to; a session whose incarnation differs gets replay_gap and its full retained ring. |

**Returns:** `Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentSessionsStreamManyFrames>>>`  |  **HTTP:** `GET /api/v1/agent/sessions:events`
**CLI:** `hoody agent sessions batch stream --ids <ids>`

---

#### `trim` — Trim session history to a turn index.

```typescript
client.agent.sessions.trim(id: string, data?: AgentSessionsTrimRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ turn_idx: int }`

**HTTP:** `POST /api/v1/agent/sessions/{id}/trim`
**CLI:** `hoody agent sessions trim --id <id>`

---

### `client.agent.providers` (9) — LLM providers: custom providers, credentials, OAuth and account pools

**Shared parameters of `client.agent.providers`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The provider id. |

#### `create` — Create a custom provider.

```typescript
client.agent.providers.create(data: AgentProvidersCreateRequest, options?: { idempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `idempotencyKey` | `string` | header `Idempotency-Key` | No | Opaque retry key (1-255 printable ASCII, no whitespace). A retry with the same key and body answers 201 with the provider the first try created; the same key with another body is 422 idempotency_key_reused. Keys are remembered for 24 hours, until the agent restarts. |

**Body:** `{ id*: string, model_prefix: string, display_name: string, wire_format: "chat_completions" | "responses" | "messages", base_url*: string, auth_scheme: "bearer" | "x-api-key", headers: { [key: string]: string }, models*: { model*: string, context_window: int, output_limit: int, reasoning: bool }[] }`

- `id` — The provider id: 1-40 lowercase letters, digits or inner hyphens. It cannot be changed later.
- `model_prefix` — The prefix of the provider's model specs (acme for acme/<model>). It must equal the id; omitted, it is the id. No provider's id or prefix may already use it, and fusion is reserved.
- `base_url` — The endpoint's base URL, the part before /chat/completions, /responses or /v1/messages (e.g. https://api.acme.example/v1). base_url must be an https URL with no user name, password, query or fragment, at a public address. Create, and update when it changes base_url, refuse with 422 provider_invalid a host written as an internal address, a name that does not resolve, a name with no IPv4 address, and a name that resolves to an internal IPv4 address. The address is checked again whenever a new connection to the provider is opened, so a name whose DNS later points inside is refused then.
- `auth_scheme` — How the stored key is sent. It follows wire_format: bearer (Authorization: Bearer <key>) with chat_completions and responses, x-api-key with messages. Omitted, it is that value; any other pairing is refused 422 provider_invalid.
- `headers` — Static request headers sent on every request, chat_completions only, at most 16. Credential and transport headers (Authorization, x-api-key, api-key, Cookie, Host, Content-Type, Content-Length, Connection and the other hop-by-hop headers) are refused. Values must not contain ${...}. …

**HTTP:** `POST /api/v1/agent/providers`
**CLI:** `hoody agent providers create --id <id> --endpoint <endpoint> --models <models>`

---

#### `delete` — Delete a custom provider.

```typescript
client.agent.providers.delete(id: string)
```

**HTTP:** `DELETE /api/v1/agent/providers/{id}`
**CLI:** `hoody agent providers delete --id <id>`

---

#### `deleteApiKey` — Delete a provider API key.

```typescript
client.agent.providers.deleteApiKey(id: string)
```

**HTTP:** `DELETE /api/v1/agent/providers/{id}/auth/api-key`
**CLI:** `hoody agent providers apikey delete --id <id>`

---

#### `get` — Get a provider.

```typescript
client.agent.providers.get(id: string)
```

**HTTP:** `GET /api/v1/agent/providers/{id}`
**CLI:** `hoody agent providers get --id <id>`

---

#### `list` — List LLM providers.

```typescript
client.agent.providers.list(options?: { page?: number; limit?: number })
```

**HTTP:** `GET /api/v1/agent/providers`
**CLI:** `hoody agent providers list`

---

#### `listAll` — List LLM providers. (collect all pages)

```typescript
client.agent.providers.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<AgentProvidersListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/providers`
**CLI:** `hoody agent providers list`

---

#### `listIterator` — List LLM providers. (async iterator)

```typescript
client.agent.providers.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<AgentProvidersListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/providers`
**CLI:** `hoody agent providers list`

---

#### `setApiKey` — Store a provider API key.

```typescript
client.agent.providers.setApiKey(id: string, data: AgentProvidersSetApiKeyRequest)
```

**Body:** `{ api_key*: string, check: bool, if_definition_rev: string }`

- `check` — true tries the key against the provider before saving; a refused key is not saved (422 api_key_refused). Omitted or false saves without trying.
- `if_definition_rev` — The provider's definition_rev as read from GET /api/v1/agent/providers/{id}. When it no longer matches, nothing is saved (409 definition_changed).

**HTTP:** `PUT /api/v1/agent/providers/{id}/auth/api-key`
**CLI:** `hoody agent providers apikey set --id <id> --api-key <api-key>`

---

#### `update` — Change a custom provider.

```typescript
client.agent.providers.update(id: string, data?: AgentProvidersUpdateRequest)
```

**Body:** `{ display_name: string, wire_format: "chat_completions" | "responses" | "messages", base_url: string, auth_scheme: "bearer" | "x-api-key", headers: { [key: string]: string }, models: { model*: string, context_window: int, output_limit: int, reasoning: bool }[], model_prefix: string }`

- `base_url` — The endpoint's base URL, the part before /chat/completions, /responses or /v1/messages (e.g. https://api.acme.example/v1). base_url must be an https URL with no user name, password, query or fragment, at a public address. Create, and update when it changes base_url, refuse with 422 provider_invalid a host written as an internal address, a name that does not resolve, a name with no IPv4 address, and a name that resolves to an internal IPv4 address. The address is checked again whenever a new connection to the provider is opened, so a name whose DNS later points inside is refused then.
- `auth_scheme` — How the stored key is sent. It follows wire_format: bearer (Authorization: Bearer <key>) with chat_completions and responses, x-api-key with messages. Omitted, it is that value; any other pairing is refused 422 provider_invalid.
- `headers` — Static request headers sent on every request, chat_completions only, at most 16. Credential and transport headers (Authorization, x-api-key, api-key, Cookie, Host, Content-Type, Content-Length, Connection and the other hop-by-hop headers) are refused. Values must not contain ${...}. …
- `model_prefix` — Fixed at creation. Accepted only when equal to the current prefix; any other value is refused 400 provider_field_immutable.

**HTTP:** `PATCH /api/v1/agent/providers/{id}`
**CLI:** `hoody agent providers update --id <id>`

---

### `client.agent.mcp` (10) — Mcp operations

#### `createWriteIntent` — Begin an MCP config write.

```typescript
client.agent.mcp.createWriteIntent(data: AgentMcpCreateWriteIntentRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ session_id*: string, op*: "upsert" | "delete" | "set_enabled" | "import", scope: "user" | "project" | "local" }`

- `session_id` — Live session id (MCP config is resolved against the session's settings layers). Required here: the method has no `session_id` query option.

**HTTP:** `POST /api/v1/agent/mcp/write-intents`
**CLI:** `hoody agent mcp writeintents create --op <op> --session-id <session-id>`

---

#### `delete` — Delete an MCP server.

```typescript
client.agent.mcp.delete(data: AgentMcpDeleteRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", name*: string, expect_hash*: string }`

- `session_id` — Live session id. Required here: the method has no `session_id` query option.
- `scope` — Settings layer to write. Must match the scope the nonce was minted for.

**HTTP:** `DELETE /api/v1/agent/mcp/servers`
**CLI:** `hoody agent mcp delete --nonce <nonce> --expect-hash <expect-hash> --name <name> --session-id <session-id>`

---

#### `disable` — Enable or disable an MCP server.

```typescript
client.agent.mcp.disable(data: Omit<AgentMcpDisableRequest, "enabled">, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", name*: string, expect_hash*: string }`

- `session_id` — Live session id. Required here: the method has no `session_id` query option.
- `scope` — Settings layer to write. Must match the scope the nonce was minted for.

**Fixed by the method:** the method sets `enabled: false`; do not pass `enabled`.

**HTTP:** `POST /api/v1/agent/mcp/servers/enable`
**CLI:** `hoody agent mcp disable --nonce <nonce> --expect-hash <expect-hash> --name <name> --session-id <session-id>`

---

#### `enable` — Enable or disable an MCP server.

```typescript
client.agent.mcp.enable(data: Omit<AgentMcpEnableRequest, "enabled">, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", name*: string, expect_hash*: string }`

- `session_id` — Live session id. Required here: the method has no `session_id` query option.
- `scope` — Settings layer to write. Must match the scope the nonce was minted for.

**Fixed by the method:** the method sets `enabled: true`; do not pass `enabled`.

**HTTP:** `POST /api/v1/agent/mcp/servers/enable`
**CLI:** `hoody agent mcp enable --nonce <nonce> --expect-hash <expect-hash> --name <name> --session-id <session-id>`

---

#### `import` — Import MCP servers from another tool's config.

```typescript
client.agent.mcp.import(data: AgentMcpImportRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", document: string, servers: { name*: string, type: string, command: string, args: string[], url: string, env: object, headers: object, allowed_tools: string[], require_confirmation: bool, enabled: bool }[], replace: bool, expect_hash*: string }`

- `session_id` — Live session id. Required here: the method has no `session_id` query option.
- `scope` — Settings layer to write. Must match the scope the nonce was minted for.
- `document` — A pasted config document in any supported dialect. Mutually exclusive with the servers field. The hoody dialect is accepted here, so anything expressible via servers can be passed as a document.
- `servers` — Explicit server entries, in hoody's own shape (the PUT /api/v1/agent/mcp/servers server entry). Mutually exclusive with document. The CLI takes them from a file: --servers @servers.json.

**HTTP:** `POST /api/v1/agent/mcp/import`
**CLI:** `hoody agent mcp import --nonce <nonce> --expect-hash <expect-hash>`

---

#### `list` — List configured MCP servers.

```typescript
client.agent.mcp.list(options: { session_id: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `session_id` | `string` | query | Yes | Live session id (MCP config is resolved against the session's settings layers). |

**HTTP:** `GET /api/v1/agent/mcp/servers`
**CLI:** `hoody agent mcp list --session-id <session-id>`

---

#### `previewImport` — Preview an MCP config import.

```typescript
client.agent.mcp.previewImport(data: AgentMcpPreviewImportRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ session_id*: string, document*: string }`

- `session_id` — Live session id. Required here: the method has no `session_id` query option.

**HTTP:** `POST /api/v1/agent/mcp/parse`
**CLI:** `hoody agent mcp import --preview --document <document>`

---

#### `reconnect` — Reload MCP config and reconnect.

```typescript
client.agent.mcp.reconnect(data: AgentMcpReconnectRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ session_id*: string }`

- `session_id` — Live session id. Required here: the method has no `session_id` query option.

**HTTP:** `POST /api/v1/agent/mcp/reconnect`
**CLI:** `hoody agent mcp reconnect --session-id <session-id>`

---

#### `test` — Probe an MCP server without saving it.

```typescript
client.agent.mcp.test(data: AgentMcpTestRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ session_id*: string, server*: { name*: string, type: string, command: string, args: string[], url: string, env: object, headers: object, allowed_tools: string[], require_confirmation: bool, enabled: bool } }`

- `session_id` — Live session id (supplies the deny list and transport policy). Required here: the method has no `session_id` query option.

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `POST /api/v1/agent/mcp/probe`
**CLI:** `hoody agent mcp test --session-id <session-id> --name <name>`

---

#### `upsert` — Create or update an MCP server.

```typescript
client.agent.mcp.upsert(data: AgentMcpUpsertRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", expect_hash*: string, server*: { name*: string, type: string, command: string, args: string[], url: string, env: object, headers: object, allowed_tools: string[], require_confirmation: bool, enabled: bool } }`

- `session_id` — Live session id. Required here: the method has no `session_id` query option.
- `scope` — Settings layer to write. Must match the scope the nonce was minted for.
- `expect_hash` — … REQUIRED: a mismatch returns a conflict instead of overwriting a concurrent edit, and a first write into a file that does not exist yet states its expectation with the empty-array hash rather than omitting this.

**HTTP:** `PUT /api/v1/agent/mcp/servers`
**CLI:** `hoody agent mcp upsert --nonce <nonce> --expect-hash <expect-hash> --session-id <session-id> --name <name>`

---

### `client.agent.sessions.turns` (8) — Durable turn receipts

**Shared parameters of `client.agent.sessions.turns`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `gatePolicy` | `string` | header `X-Hoody-Gate-Policy` | No | Confirm-gate posture: "auto_approve" adopts the headless auto-answer posture: it approves approval cards for their one call, and denies a card a tool-call rule raised and a destructive-shape card (static_stakes: a recursive force delete, curl piped to a shell, sudo, a force push...), as a headless run refuses those (off by default; the in:query alias is ?policy=). Any other value is rejected 400. |

#### `cancel` — Cancel the active turn (Esc), or one named turn.

```typescript
client.agent.sessions.turns.cancel(id: string, data?: AgentSessionsTurnsCancelRequest, options?: { turn_id?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `turn_id` | `string` | query | No | Cancel only this turn (alternative to the body field). |

**Body:** `{ turn_id: string }`

**HTTP:** `POST /api/v1/agent/sessions/{id}/cancel`
**CLI:** `hoody agent sessions turns cancel --id <id>`

---

#### `create` — Dispatch a turn (retry-safe).

```typescript
client.agent.sessions.turns.create(id: string, data: AgentSessionsTurnsCreateRequest, options?: { gatePolicy?: string; idempotencyKey?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `idempotencyKey` | `string` | header `Idempotency-Key` | No | Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key returns the same receipt and never re-runs the turn; the same key with a different request body is 422. |

**Body:** `{ text*: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", attachments: { type*: "image", media_type*: string, data*: string, name: string }[] }`

- `text` — Required (may be empty only with attachments). The user message text for this turn: empty or whitespace-only text with no attachments is refused (400 empty_prompt) and no turn runs.
- `tool_mode` — Optional tool mode: standard or orchestrator. … On a later turn, one queued before the first turn ran included, the same value is accepted and a different one is refused 400 invalid_tool_mode; any other value is refused 400 invalid_tool_mode too.
- `dir_scope` — Optional directory-access scope: home or full. … On a later turn, one queued before the first turn ran included, the same value is accepted and a different one is refused 400 invalid_dir_scope; any other value is refused 400 invalid_dir_scope too.
- `attachments` — … At most 4 per turn, each at most 4 MiB DECODED (~5.33 MiB of base64); the request body limit applies on top and is authoritative, so several individually-legal images can still exceed it. A violation is refused with 400 BEFORE the turn is accepted: nothing is silently dropped. `path` is not supported here: it would name a file on the CALLER's machine, so an attachment with a non-empty path refuses the whole request with 400 bad_request before a turn is accepted. If the active model cannot accept images the daemon reports that on the session stream.

**HTTP:** `POST /api/v1/agent/sessions/{id}/turns`
**CLI:** `hoody agent sessions turns create --id <id> --text <text>`

---

#### `get` — Get a turn's durable receipt.

```typescript
client.agent.sessions.turns.get(id: string, turn_id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `turn_id` | `string` | path | Yes | The turn id. |

**HTTP:** `GET /api/v1/agent/sessions/{id}/turns/{turn_id}`
**CLI:** `hoody agent sessions turns get --id <id> --turn-id <turn-id>`

---

#### `getByKey` — Read a turn by its idempotency key.

```typescript
client.agent.sessions.turns.getByKey(id: string, key: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/sessions/{id}/turns/by-key/{key}`
**CLI:** `hoody agent sessions turns keys get --id <id> --idempotency-key <idempotency-key>`

---

#### `list` — List a session's durable turn receipts.

```typescript
client.agent.sessions.turns.list(id: string, options?: { limit?: number; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No | Return at most this many receipts, newest first (1–1000). A cap, not a page size: there is no next page. |

**HTTP:** `GET /api/v1/agent/sessions/{id}/turns`
**CLI:** `hoody agent sessions turns list --id <id>`

---

#### `retireKey` — Retire a turn key no read found.

```typescript
client.agent.sessions.turns.retireKey(id: string, key: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `POST /api/v1/agent/sessions/{id}/turns/by-key/{key}/retire`
**CLI:** `hoody agent sessions turns keys retire --id <id> --idempotency-key <idempotency-key>`

---

#### `run` — Dispatch a turn and block until it ends (no reply text: read it from the transcript)

```typescript
client.agent.sessions.turns.run(id: string, data: AgentSessionsTurnsRunRequest, options?: { gatePolicy?: string; idempotencyKey?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `idempotencyKey` | `string` | header `Idempotency-Key` | No | Opaque retry key (1–255 printable ASCII, no whitespace). The turn runs at most once per key: a retry answers 200 duplicate:true with the turn's outcome (or pending_turn while it still runs) and never re-runs it; the same key with a different request body is 422. |

**Body:** `{ text*: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", attachments: { type*: "image", media_type*: string, data*: string, name: string }[] }`

- `text` — Required (may be empty only with attachments). The user message text for this turn: empty or whitespace-only text with no attachments is refused (400 empty_prompt) and no turn runs.
- `tool_mode` — Optional tool mode: standard or orchestrator. … On a later turn, one queued before the first turn ran included, the same value is accepted and a different one is refused 400 invalid_tool_mode; any other value is refused 400 invalid_tool_mode too.
- `dir_scope` — Optional directory-access scope: home or full. … On a later turn, one queued before the first turn ran included, the same value is accepted and a different one is refused 400 invalid_dir_scope; any other value is refused 400 invalid_dir_scope too.
- `attachments` — … At most 4 per turn, each at most 4 MiB DECODED (~5.33 MiB of base64); the request body limit applies on top and is authoritative, so several individually-legal images can still exceed it. A violation is refused with 400 BEFORE the turn is accepted: nothing is silently dropped. `path` is not supported here: it would name a file on the CALLER's machine, so an attachment with a non-empty path refuses the whole request with 400 bad_request before a turn is accepted. If the active model cannot accept images the daemon reports that on the session stream.

**HTTP:** `POST /api/v1/agent/sessions/{id}/prompt:sync`
**CLI:** `hoody agent sessions turns run --id <id> --text <text>`

---

#### `start` — Dispatch a turn (fire-and-observe).

```typescript
client.agent.sessions.turns.start(id: string, data: AgentSessionsTurnsStartRequest, options: { gatePolicy?: string; idempotencyKey?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}); followSession?: boolean; stream: true })  // → Promise<IEventStream<{ XHoodyTurnId?: string; }, ITypedStreamEvent<AgentSessionsTurnsStartFrames>>>
client.agent.sessions.turns.start(id: string, data: AgentSessionsTurnsStartRequest, options?: { idempotencyKey?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}); stream?: false })  // → Promise<AgentSessionsTurnsStartResponse>
client.agent.sessions.turns.start(id: string, data: AgentSessionsTurnsStartRequest, options?: { idempotencyKey?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}); stream?: boolean })  // → Promise<IEventStream<{ XHoodyTurnId?: string; }, ITypedStreamEvent<AgentSessionsTurnsStartFrames>>> | Promise<AgentSessionsTurnsStartResponse>
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `idempotencyKey` | `string` | header `Idempotency-Key` | No | Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key returns the same receipt and never re-runs the turn; the same key with a different request body is 422. |
| `data` | `AgentSessionsTurnsStartRequest` | body | Yes |  |
| `stream` | `boolean` | option | No | Stream the turn as server-sent events instead of answering its handle. |

**Body:** `{ text*: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", attachments: { type*: "image", media_type*: string, data*: string, name: string }[] }`

- `text` — Required (may be empty only with attachments). The user message text for this turn: empty or whitespace-only text with no attachments is refused (400 empty_prompt) and no turn runs.
- `tool_mode` — Optional tool mode: standard or orchestrator. … On a later turn, one queued before the first turn ran included, the same value is accepted and a different one is refused 400 invalid_tool_mode; any other value is refused 400 invalid_tool_mode too.
- `dir_scope` — Optional directory-access scope: home or full. … On a later turn, one queued before the first turn ran included, the same value is accepted and a different one is refused 400 invalid_dir_scope; any other value is refused 400 invalid_dir_scope too.
- `attachments` — … At most 4 per turn, each at most 4 MiB DECODED (~5.33 MiB of base64); the request body limit applies on top and is authoritative, so several individually-legal images can still exceed it. A violation is refused with 400 BEFORE the turn is accepted: nothing is silently dropped. `path` is not supported here: it would name a file on the CALLER's machine, so an attachment with a non-empty path refuses the whole request with 400 bad_request before a turn is accepted. If the active model cannot accept images the daemon reports that on the session stream.

**Returns:** see each form above  |  **HTTP:** `POST /api/v1/agent/sessions/{id}/messages` (with `stream: true`: `POST /api/v1/agent/sessions/{id}/prompt:stream`)
**CLI:** `hoody agent sessions turns start --id <id> --text <text>`

---

### `client.agent.audio` (4) — Audio operations

#### `createSpeech` — Turn text into speech.

```typescript
client.agent.audio.createSpeech(data: AgentAudioCreateSpeechRequest, options: { agentRealm?: "global" | (string & {}); stream: true })  // → Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentAudioCreateSpeechFrames>>>
client.agent.audio.createSpeech(data: { model?: string; input: string; voice?: string; instructions?: string; response_format?: "mp3" | "wav" | "pcm"; speed?: number; stream_format?: "" }, options?: { agentRealm?: "global" | (string & {}); stream?: false })  // → Promise<ApiResponse<ArrayBuffer>>
client.agent.audio.createSpeech(data: { model?: string; input: string; voice?: string; instructions?: string; response_format?: "mp3" | "wav" | "pcm"; speed?: number; stream_format?: "" }, options?: { agentRealm?: "global" | (string & {}); stream?: boolean })  // → Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentAudioCreateSpeechFrames>>> | Promise<ApiResponse<ArrayBuffer>>
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `AgentAudioCreateSpeechRequest` | body | Yes |  |
| `stream` | `boolean` | option | No | Stream the audio as it is produced. |

**Body:** `{ model: string, input*: string, voice: string, instructions: string, response_format: "mp3" | "wav" | "pcm", speed: number, stream_format: "" }`

- `model` — A speech model spec (GET /api/v1/agent/audio/models?capability=tts). Omitted: settings audio.tts_model, else the Hoody AI relay model (hoody-ai/hoody-tts) unless settings audio.relay_default is false; with that off and no model set the call is 422 speech_not_configured.
- `input` — The text to speak (at most 4096 characters; less for some models).
- `instructions` — How to speak (tone, pace), for models that take it; a model that does not is 400.
- `stream_format` — Not read here. Only an empty string is accepted; any other value is 400 bad_request (details.field stream_format). For a stream, use POST /api/v1/agent/audio/speech/stream.

**Returns:** see each form above  |  **HTTP:** `POST /api/v1/agent/audio/speech` (with `stream: true`: `POST /api/v1/agent/audio/speech/stream`)
**CLI:** `hoody agent audio speech create --input <input>`

---

#### `createTranscription` — Turn speech into text.

```typescript
client.agent.audio.createTranscription(data: NonNullable<FormData>, options: { agentRealm?: "global" | (string & {}); stream: true })  // → Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentAudioCreateTranscriptionFrames>>>
client.agent.audio.createTranscription(data: NonNullable<FormData>, options?: { agentRealm?: "global" | (string & {}); stream?: false })  // → Promise<AgentAudioCreateTranscriptionResponse>
client.agent.audio.createTranscription(data: NonNullable<FormData>, options?: { agentRealm?: "global" | (string & {}); stream?: boolean })  // → Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentAudioCreateTranscriptionFrames>>> | Promise<AgentAudioCreateTranscriptionResponse>
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `NonNullable<FormData>` | body | Yes |  |
| `stream` | `boolean` | option | No | Stream the transcript as it is produced. |

**Returns:** see each form above  |  **HTTP:** `POST /api/v1/agent/audio/transcriptions` (with `stream: true`: `POST /api/v1/agent/audio/transcriptions/stream`)

---

#### `listModels` — List the speech models.

```typescript
client.agent.audio.listModels(options?: { capability?: "tts" | "stt"; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `capability` | `"tts" \| "stt"` | query | No | Only models with this capability. |

**HTTP:** `GET /api/v1/agent/audio/models`
**CLI:** `hoody agent audio models list`

---

#### `listVoices` — List the voices of the speech models.

```typescript
client.agent.audio.listVoices(options?: { model?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `model` | `string` | query | No | A speech model spec. Omitted, every available text-to-speech model except the Hoody AI relay models. |

**HTTP:** `GET /api/v1/agent/audio/voices`
**CLI:** `hoody agent audio voices list`

---

### `client.agent.gates` (7) — Question gates waiting for a human

#### `answer` — Answer a parked question gate.

```typescript
client.agent.gates.answer(id: string, data?: AgentGatesAnswerRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ gate_id: string, generation: int, answer: string, text: string, answers: { [key: string]: string } }`

- `gate_id` — Echo of the parked gate id, as published on the frame that parked it (gate.id), by GET /api/v1/agent/sessions/{id} (pending_gate.id) and in 409 details. Valid only for the session in the path. Optional for compatibility, but an answer without it applies to whatever gate is parked when it arrives: a client binding an answer to a gate the user saw must send it. Ids are unique per session incarnation, so an id from before a re-attach never matches (stale/mismatch → 409).
- `answer` — Free-form answer text. … The tool keeps at most five entries per array and truncates each string to 400 Unicode code points. …

**HTTP:** `POST /api/v1/agent/sessions/{id}/answer`
**CLI:** `hoody agent gates answer --session-id <session-id>`

---

#### `approve` — Answer a parked confirm gate (on an always-approval session also --gate-id, --generation and the approver lease).

```typescript
client.agent.gates.approve(id: string, data?: Omit<AgentGatesApproveRequest, "approved">, options?: { approverLease?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ gate_id: string, generation: int, reason: string, persist_dirs: bool, remember: bool, superseded: bool, session_scope: bool, trust_computer: bool, request_id: string, lease_generation: int }`

- `gate_id` — Echo of the parked gate id, as published on the frame that parked it (gate.id), by GET /api/v1/agent/sessions/{id} (pending_gate.id) and in 409 details. Valid only for the session in the path. Optional for compatibility, but an answer without it applies to whatever gate is parked when it arrives: a client binding an answer to a gate the user saw must send it. Ids are unique per session incarnation, so an id from before a re-attach never matches (stale/mismatch → 409). Required on a session that requires approval on every action: a confirm without it is rejected 400.
- `generation` — Echo of the parked gate generation. It restarts when the session is re-attached, so it is not an identity on its own: send gate_id. Optional on a default-policy session; required, and non-zero, on a session that requires approval on every action.
- `reason` — Optional, with approved false only: why the action is refused. The agent reads it in the refused call's result, flattened to one line, together with the instruction not to reach the same effect another way. At most 500 characters; sent with approved true, or longer, it is rejected 400 bad_request.
- `superseded` — With approved false only, and no reason or session_scope: the call is declined because the user sent a new message instead of answering. … Sent with approved true, a reason or session_scope, it is rejected 400 bad_request.
- `session_scope` — Remember this decision for the rest of the session (the Allow/Deny for session answer): with approved true the tool stops asking, with approved false it is refused without asking. Offer allow-for-session only when the gate's event.confirm_request carried offer_session_allow. Under a locked approval policy the wider grant is refused, but the one-shot decision still applies and the reply says so (session_scope_applied false, note).
- `request_id` — Optional: the caller's own id for this decision, at most 64 characters from A-Z, a-z, 0-9, '.', '_' and '-' (anything else is 400 bad_request). When this decision is the one the gate consumed, a later 409 gate_already_resolved for the gate echoes it as details.request_id, so a caller that lost the 200 knows the recorded decision is its own.
- `lease_generation` — … A decision carrying the lease capability (X-Hoody-Approver-Lease) is checked against the current lease whatever it sends; without one, a stale generation is refused. …

**Fixed by the method:** the method sets `approved: true`; do not pass `approved`.

**HTTP:** `POST /api/v1/agent/sessions/{id}/confirm`
**CLI:** `hoody agent gates approve --session-id <session-id>`

---

#### `deny` — Answer a parked confirm gate (on an always-approval session also --gate-id, --generation and the approver lease).

```typescript
client.agent.gates.deny(id: string, data?: Omit<AgentGatesDenyRequest, "approved">, options?: { approverLease?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ gate_id: string, generation: int, reason: string, persist_dirs: bool, remember: bool, superseded: bool, session_scope: bool, trust_computer: bool, request_id: string, lease_generation: int }`

- `gate_id` — Echo of the parked gate id, as published on the frame that parked it (gate.id), by GET /api/v1/agent/sessions/{id} (pending_gate.id) and in 409 details. Valid only for the session in the path. Optional for compatibility, but an answer without it applies to whatever gate is parked when it arrives: a client binding an answer to a gate the user saw must send it. Ids are unique per session incarnation, so an id from before a re-attach never matches (stale/mismatch → 409). Required on a session that requires approval on every action: a confirm without it is rejected 400.
- `generation` — Echo of the parked gate generation. It restarts when the session is re-attached, so it is not an identity on its own: send gate_id. Optional on a default-policy session; required, and non-zero, on a session that requires approval on every action.
- `reason` — Optional, with approved false only: why the action is refused. The agent reads it in the refused call's result, flattened to one line, together with the instruction not to reach the same effect another way. At most 500 characters; sent with approved true, or longer, it is rejected 400 bad_request.
- `superseded` — With approved false only, and no reason or session_scope: the call is declined because the user sent a new message instead of answering. … Sent with approved true, a reason or session_scope, it is rejected 400 bad_request.
- `session_scope` — Remember this decision for the rest of the session (the Allow/Deny for session answer): with approved true the tool stops asking, with approved false it is refused without asking. Offer allow-for-session only when the gate's event.confirm_request carried offer_session_allow. Under a locked approval policy the wider grant is refused, but the one-shot decision still applies and the reply says so (session_scope_applied false, note).
- `request_id` — Optional: the caller's own id for this decision, at most 64 characters from A-Z, a-z, 0-9, '.', '_' and '-' (anything else is 400 bad_request). When this decision is the one the gate consumed, a later 409 gate_already_resolved for the gate echoes it as details.request_id, so a caller that lost the 200 knows the recorded decision is its own.
- `lease_generation` — … A decision carrying the lease capability (X-Hoody-Approver-Lease) is checked against the current lease whatever it sends; without one, a stale generation is refused. …

**Fixed by the method:** the method sets `approved: false`; do not pass `approved`.

**HTTP:** `POST /api/v1/agent/sessions/{id}/confirm`
**CLI:** `hoody agent gates deny --session-id <session-id>`

---

#### `list` — List the gates waiting for a human.

```typescript
client.agent.gates.list(options?: { include_system?: boolean; agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number; cwd?: string; configDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_system` | `boolean` | query | No | When true, also list the gates of daemon-owned system/resident sessions (as GET /api/v1/agent/sessions does). |
| `agentRealm` | `"global" \| "all" \| (string & {})` | query `realm` | No | The realm to list: "global" (gates not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |
| `limit` | `number` | query | No | Maximum items per page, at most 100: 0 or omitted means 100, and a larger value is served as 100 (meta.limit echoes the value used). |

**HTTP:** `GET /api/v1/agent/gates`
**CLI:** `hoody agent gates list`

---

#### `listAll` — List the gates waiting for a human. (collect all pages)

```typescript
client.agent.gates.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<AgentGatesListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/gates`
**CLI:** `hoody agent gates list`

---

#### `listIterator` — List the gates waiting for a human. (async iterator)

```typescript
client.agent.gates.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<AgentGatesListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/gates`
**CLI:** `hoody agent gates list`

---

#### `suggest` — Propose answers for a parked question (helper model).

```typescript
client.agent.gates.suggest(id: string, data?: AgentGatesSuggestRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ mode: string, model: string, gen: int }`

**HTTP:** `POST /api/v1/agent/sessions/{id}/answer:assist`
**CLI:** `hoody agent gates suggest --session-id <session-id>`

---

### `client.agent.jobs` (3) — Async job lifecycle (observe / result / cancel)

**Shared parameters of `client.agent.jobs`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The job id. |

#### `delete` — Cancel a pending/running job, or delete a finished record.

```typescript
client.agent.jobs.delete(id: string)
```

**HTTP:** `DELETE /api/v1/agent/jobs/{id}`
**CLI:** `hoody agent jobs delete --id <id>`

---

#### `get` — Get an async job's status.

```typescript
client.agent.jobs.get(id: string)
```

**HTTP:** `GET /api/v1/agent/jobs/{id}`
**CLI:** `hoody agent jobs get --id <id>`

---

#### `getResult` — Get an async job's result.

```typescript
client.agent.jobs.getResult(id: string)
```

**HTTP:** `GET /api/v1/agent/jobs/{id}/result`
**CLI:** `hoody agent jobs result get --id <id>`

---

### `client.agent.models` (4) — Catalogued models and fusion composites

#### `get` — Get a model by spec.

```typescript
client.agent.models.get(spec: string, options?: { cwd?: string; configDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `spec` | `string` | path | Yes | The spec. |

**HTTP:** `GET /api/v1/agent/models/{spec}`
**CLI:** `hoody agent models get --spec <spec>`

---

#### `list` — List models.

```typescript
client.agent.models.list(options?: { ready?: boolean; provider?: string; page?: number; limit?: number; cwd?: string; configDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `ready` | `boolean` | query | No | When true, list only the models that can run now: the provider is ready (see GET /api/v1/agent/providers status), an OpenAI model used through the ChatGPT sign-in is one that sign-in serves, and a fusion composite appears only when every member qualifies. Any value other than true or false returns 400 bad_request. |
| `provider` | `string` | query | No | List only this provider's models (its id). fusion lists only the fusion composites. An id that matches no provider returns an empty list. |

**HTTP:** `GET /api/v1/agent/models`
**CLI:** `hoody agent models list`

---

#### `listAll` — List models. (collect all pages)

```typescript
client.agent.models.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<AgentModelsListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/models`
**CLI:** `hoody agent models list`

---

#### `listIterator` — List models. (async iterator)

```typescript
client.agent.models.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<AgentModelsListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/models`
**CLI:** `hoody agent models list`

---

### `client.agent.bots.messages` (3) — Messages posted to a Bot

**Shared parameters of `client.agent.bots.messages`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The bot id. |

#### `getByKey` — Read a Bot message by its idempotency key.

```typescript
client.agent.bots.messages.getByKey(id: string, key: string, options?: { agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/bots/{id}/messages/by-key/{key}`
**CLI:** `hoody agent bots messages keys get --id <id> --idempotency-key <idempotency-key>`

---

#### `send` — Post a message to a Bot.

```typescript
client.agent.bots.messages.send(id: string, data: AgentBotsMessagesSendRequest, options?: { idempotencyKey?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `idempotencyKey` | `string` | header `Idempotency-Key` | No | Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key and text returns the same message_id and the message's current state, and queues nothing again; the same key with a different text, or one used through another door of the Bot, is 422; a key starting with "compat:" or "chan:" is 400. A key is remembered while its message is queued and for at least 24 hours after it was accepted. |

**Body:** `{ text*: string }`

- `text` — The message (at most 64 KiB).

**HTTP:** `POST /api/v1/agent/bots/{id}/messages`
**CLI:** `hoody agent bots messages send --id <id> --text <text>`

---

#### `sendAudio` — Post a spoken message to a Bot.

```typescript
client.agent.bots.messages.sendAudio(id: string, data: FormData, options?: { idempotencyKey?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `idempotencyKey` | `string` | header `Idempotency-Key` | No | Opaque retry key (1–255 printable ASCII, no whitespace). A retry with the same key and audio returns the same message_id and queues nothing again; the same key with other audio, or one used through another door of the Bot, is 422; a key starting with "compat:" or "chan:" is 400. |

**HTTP:** `POST /api/v1/agent/bots/{id}/messages/audio`

---

### `client.agent.headless` (1) — One-shot headless agent runs

#### `start` — Create a headless one-shot run.

```typescript
client.agent.headless.start(data: Omit<AgentHeadlessStartRequest, "stream"> | undefined, options: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}); stream: true })  // → Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentHeadlessStartFrames>>>
client.agent.headless.start(data?: Omit<AgentHeadlessStartRequest, "stream" | "format"> & { format?: "text" | "json" }, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}); stream?: false })  // → FacadeJson<Promise<ApiResponse<unknown>>>
client.agent.headless.start(data?: Omit<AgentHeadlessStartRequest, "stream" | "format"> & { format?: "text" | "json" }, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}); stream?: boolean })  // → Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentHeadlessStartFrames>>> | FacadeJson<Promise<ApiResponse<unknown>>>
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `Omit<AgentHeadlessStartRequest, "stream"> \| undefined` | body | No |  |
| `stream` | `boolean` | option | No | Stream the run as server-sent events instead of answering its handle (202). |

**Body:** `{ prompt: string, workflow: string, inputs: { [key: string]: string }, model: string, format: string, timeout_ms: int }`

- `prompt` — The prompt to drive the ephemeral session. Required unless workflow is set; with a workflow it is the optional $(workflow.prompt) text.
- `inputs` — Optional run-time values for the workflow's DECLARED input parameters (declared name → string value; resolves to $(input.<name>) in every step). Only accepted with workflow. A workflow with a REQUIRED declared parameter cannot run without these. Values must be strings; a non-string value is a 400.
- `timeout_ms` — Optional run timeout in milliseconds (clamped to the hard ceiling).

**Fixed by the method**, by the form of the call:

- With the `stream` option: the method sets `stream: true`; do not pass `stream`.
- Otherwise: the method sets `stream: false`; do not pass `stream`.

**Returns:** see each form above  |  **HTTP:** `POST /api/v1/agent/headless/runs`
**CLI:** `hoody agent headless start`

---

### `client.agent.providers.auth` (3) — Provider authentication

**Shared parameters of `client.agent.providers.auth`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The provider id. |

#### `getStatus` — Get a provider's auth status.

```typescript
client.agent.providers.auth.getStatus(id: string)
```

**HTTP:** `GET /api/v1/agent/providers/{id}/auth`
**CLI:** `hoody agent providers auth status --id <id>`

---

#### `setDefault` — Set a provider's default credential method.

```typescript
client.agent.providers.auth.setDefault(id: string, data: AgentProvidersAuthSetDefaultRequest)
```

**Body:** `{ default*: string }`

- `default` — The default method: "api_key" or "oauth". Must be a method the provider supports AND has a stored credential for.

**HTTP:** `PUT /api/v1/agent/providers/{id}/auth/default`
**CLI:** `hoody agent providers auth default set --id <id> --default <default>`

---

#### `test` — Try a provider's stored API key.

```typescript
client.agent.providers.auth.test(id: string)
```

**HTTP:** `POST /api/v1/agent/providers/{id}/auth/test`

---

### `client.agent.tools` (9) — Tool catalogue and gated tool execution

#### `get` — Get one tool schema.

```typescript
client.agent.tools.get(name: string, options?: { cwd?: string; configDir?: string })
```

**HTTP:** `GET /api/v1/agent/tools/{name}`
**CLI:** `hoody agent tools get --name <name>`

---

#### `list` — List the tool catalogue.

```typescript
client.agent.tools.list(options?: { page?: number; limit?: number; cwd?: string; configDir?: string })
```

**HTTP:** `GET /api/v1/agent/tools`
**CLI:** `hoody agent tools list`

---

#### `listAll` — List the tool catalogue. (collect all pages)

```typescript
client.agent.tools.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<AgentToolsListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/tools`
**CLI:** `hoody agent tools list`

---

#### `listIterator` — List the tool catalogue. (async iterator)

```typescript
client.agent.tools.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<AgentToolsListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/tools`
**CLI:** `hoody agent tools list`

---

#### `listReadOnly` — List the read-only tool subset.

```typescript
client.agent.tools.listReadOnly(options?: { page?: number; limit?: number; cwd?: string; configDir?: string })
```

**HTTP:** `GET /api/v1/agent/tools/read-only`
**CLI:** `hoody agent tools readonly list`

---

#### `listReadOnlyAll` — List the read-only tool subset. (collect all pages)

```typescript
client.agent.tools.listReadOnlyAll(/* the arguments of listReadOnly */)
```

**Returns:** `Promise<Item<AgentToolsListReadOnlyResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`listReadOnly()` fetches one page). `listReadOnlyIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/tools/read-only`
**CLI:** `hoody agent tools readonly list`

---

#### `listReadOnlyIterator` — List the read-only tool subset. (async iterator)

```typescript
client.agent.tools.listReadOnlyIterator(/* the arguments of listReadOnly */)
```

**Returns:** `AsyncGenerator<Item<AgentToolsListReadOnlyResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`listReadOnly()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/tools/read-only`
**CLI:** `hoody agent tools readonly list`

---

#### `run` — Run a tool (sessionless, gated).

```typescript
client.agent.tools.run(name: string, data: AgentToolsRunRequest | undefined, options: { confirm?: boolean; confirm_token?: string; toolMode?: string; dirScope?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}); stream: true })  // → Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentToolsRunFrames>>>
client.agent.tools.run(name: string, data?: AgentToolsRunRequest, options?: { confirm?: boolean; confirm_token?: string; toolMode?: string; dirScope?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}); stream?: false })  // → Promise<AgentToolsRunResponse>
client.agent.tools.run(name: string, data?: AgentToolsRunRequest, options?: { confirm?: boolean; confirm_token?: string; toolMode?: string; dirScope?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}); stream?: boolean })  // → Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentToolsRunFrames>>> | Promise<AgentToolsRunResponse>
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `confirm` | `boolean` | query | No | Query alias of the body `confirm` field: re-issue a previously-parked confirmation (pair with confirm_token). |
| `confirm_token` | `string` | query | No | Query alias of the body `confirm_token` field: the single-use token of the parked run (see the body field). |
| `toolMode` | `string` | header `X-Hoody-Tool-Mode` | No | Sessionless tool-mode for the ephemeral session: `standard` (the default) or `orchestrator`. Any other value is refused 400 invalid_tool_mode. Ignored on the in-session run (it inherits the session's frozen tool-mode). |
| `dirScope` | `string` | header `X-Hoody-Dir-Scope` | No | Sessionless directory-access scope for the ephemeral session: home (the default) or full. Any other value is refused 400 invalid_dir_scope. Ignored on the in-session run (it inherits the session's frozen dir-scope). |
| `data` | `AgentToolsRunRequest \| undefined` | body | No |  |
| `stream` | `boolean` | option | No | Stream the tool output as server-sent events. |

**Body:** `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }`

- `confirm` — … MUST be paired with the confirm_token of the parked run; a confirm:true with no valid token does NOT bypass the gate: the run is sent unconfirmed, so it parks again, except that a sessionless run of a non-read-only tool without allow_mutations is refused 400 tool_mutation_refused. …
- `confirm_token` — The single-use token of the parked run: in the 409 tool_needs_confirmation details of POST /api/v1/agent/tools/{name}/run and POST /api/v1/agent/sessions/{id}/tools/{name}/run, in the polled job result of POST /api/v1/agent/tools/{name}/runAsync (whose own answer is a 202), and in the needs_confirmation frame of POST /api/v1/agent/tools/{name}/stream (whose own answer is a 200 stream). …
- `allow_mutations` — Sessionless only: opt a non-read-only tool into running with every permission check applied (else a sessionless mutating run is refused 400 tool_mutation_refused). Set it on the first call; a confirm:true without a valid confirm_token does not stand in for it.

**Returns:** see each form above  |  **HTTP:** `POST /api/v1/agent/tools/{name}/run` (with `stream: true`: `POST /api/v1/agent/tools/{name}/stream`)
**CLI:** `hoody agent tools run --name <name>`

---

#### `start` — Run a tool asynchronously (sessionless, gated).

```typescript
client.agent.tools.start(name: string, data?: AgentToolsStartRequest, options?: { confirm?: boolean; confirm_token?: string; toolMode?: string; dirScope?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `confirm` | `boolean` | query | No | Query alias of the body `confirm` field: re-issue a previously-parked confirmation (pair with confirm_token). |
| `confirm_token` | `string` | query | No | Query alias of the body `confirm_token` field: the single-use token of the parked run (see the body field). |
| `toolMode` | `string` | header `X-Hoody-Tool-Mode` | No | Sessionless tool-mode for the ephemeral session: `standard` (the default) or `orchestrator`. Any other value is refused 400 invalid_tool_mode. Ignored on the in-session run (it inherits the session's frozen tool-mode). |
| `dirScope` | `string` | header `X-Hoody-Dir-Scope` | No | Sessionless directory-access scope for the ephemeral session: home (the default) or full. Any other value is refused 400 invalid_dir_scope. Ignored on the in-session run (it inherits the session's frozen dir-scope). |

**Body:** `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }`

- `confirm` — … MUST be paired with the confirm_token of the parked run; a confirm:true with no valid token does NOT bypass the gate: the run is sent unconfirmed, so it parks again, except that a sessionless run of a non-read-only tool without allow_mutations is refused 400 tool_mutation_refused. …
- `confirm_token` — The single-use token of the parked run: in the 409 tool_needs_confirmation details of POST /api/v1/agent/tools/{name}/run and POST /api/v1/agent/sessions/{id}/tools/{name}/run, in the polled job result of POST /api/v1/agent/tools/{name}/runAsync (whose own answer is a 202), and in the needs_confirmation frame of POST /api/v1/agent/tools/{name}/stream (whose own answer is a 200 stream). …
- `allow_mutations` — Sessionless only: opt a non-read-only tool into running with every permission check applied (else a sessionless mutating run is refused 400 tool_mutation_refused). Set it on the first call; a confirm:true without a valid confirm_token does not stand in for it.

**HTTP:** `POST /api/v1/agent/tools/{name}/runAsync`
**CLI:** `hoody agent tools start --name <name>`

---

### `client.agent` (6) — AI agent — sessions, prompting, models, skills, memory, todos, workflows

#### `getPauseState` — Get the pause state.

```typescript
client.agent.getPauseState()
```

**HTTP:** `GET /api/v1/agent/pause`
**CLI:** `hoody agent pausestate get`

---

#### `login` — Sign this computer's agent in to the Hoody platform with a token of the box's owner. Until then the agent's shell and file tools answer "not logged in".

```typescript
client.agent.login(data: AgentLoginRequest & Required<Pick<AgentLoginRequest, "token">>, options?: object)
```

**Body:** `{ token*: string, capability: string }`

- `capability` — The operator bootstrap capability, required only on deployments configured with one; a mismatch is answered 404.

**HTTP:** `POST /api/v1/agent/hoody/auth/bootstrap`

---

#### `pause` — Pause or resume the agent.

```typescript
client.agent.pause(data?: Omit<AgentPauseRequest, "paused">, options?: object)
```

**Fixed by the method:** the method sets `paused: true`; do not pass `paused`.

**HTTP:** `PUT /api/v1/agent/pause`
**CLI:** `hoody agent pause`

---

#### `resume` — Pause or resume the agent.

```typescript
client.agent.resume(data?: Omit<AgentResumeRequest, "paused">, options?: object)
```

**Fixed by the method:** the method sets `paused: false`; do not pass `paused`.

**HTTP:** `PUT /api/v1/agent/pause`
**CLI:** `hoody agent resume`

---

#### `stopAllWork` — Stop the work running in the realm that the caller may see (at most 256 items per call; next_cursor continues).

```typescript
client.agent.stopAllWork(data?: AgentStopAllWorkRequest, options?: { agentRealm?: "global" | (string & {}) })
```

**Body:** `{ after: string }`

- `after` — A next_cursor from an earlier call, unchanged (the cursor is opaque): act only on the items after it. Any other value is 400 bad_request.

**HTTP:** `POST /api/v1/agent/stop`
**CLI:** `hoody agent work stop`

---

#### `whoami` — Hoody platform identity and realm scope.

```typescript
client.agent.whoami()
```

**HTTP:** `GET /api/v1/agent/hoody/auth/status`
**CLI:** `hoody agent whoami`

---

#### `importLocalConfig` — Push a local agent CLI's config/credentials into the computer.

```typescript
client.agent.importLocalConfig(tool: string, options?: AgentConfigSyncOptions)
```

**Returns:** `Promise<AgentConfigSyncResult>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.
**Needs a computer-scoped client:** call it on `await client.withComputer(computer)`; on a client that is not computer-scoped it throws.

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

### `client.agent.settings` (9) — Process-wide settings (home settings.json)

#### `get` — Get settings.

```typescript
client.agent.settings.get(options?: { cwd?: string; configDir?: string })
```

**HTTP:** `GET /api/v1/agent/settings`
**CLI:** `hoody agent settings get`

---

#### `getInstructions` — Get a realm's agent instructions.

```typescript
client.agent.settings.getInstructions(options?: { agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/settings/agent-instructions`
**CLI:** `hoody agent settings instructions get`

---

#### `getSpendCaps` — Read the spend caps.

```typescript
client.agent.settings.getSpendCaps()
```

**HTTP:** `GET /api/v1/agent/settings/spend-caps`
**CLI:** `hoody agent settings spendcaps get`

---

#### `getWhereAgentsWork` — Read where agents may work.

```typescript
client.agent.settings.getWhereAgentsWork(options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/settings/where-agents-work`
**CLI:** `hoody agent settings whereagentswork get`

---

#### `listFeatures` — List the agent features.

```typescript
client.agent.settings.listFeatures()
```

**HTTP:** `GET /api/v1/agent/settings/features`
**CLI:** `hoody agent settings features list`

---

#### `setInstructions` — Set a realm's agent instructions.

```typescript
client.agent.settings.setInstructions(data: AgentSettingsSetInstructionsRequest, options?: { agentRealm?: "global" | (string & {}) })
```

**Body:** `{ text*: string, enabled*: bool, expected_revision*: string }`

**HTTP:** `PUT /api/v1/agent/settings/agent-instructions`
**CLI:** `hoody agent settings instructions set --text <text> --enabled --expected-revision <expected-revision>`

---

#### `setSpendCaps` — Set the spend caps.

```typescript
client.agent.settings.setSpendCaps(data: AgentSettingsSetSpendCapsRequest)
```

**Body:** `{ max_session_usd*: number, max_turn_usd*: number, action*: "stop" | "warn", expected_revision*: string }`

**HTTP:** `PUT /api/v1/agent/settings/spend-caps`
**CLI:** `hoody agent settings spendcaps set --max-session-usd <max-session-usd> --max-turn-usd <max-turn-usd> --action <action> --expected-revision <expected-revision>`

---

#### `update` — Patch settings.

```typescript
client.agent.settings.update(data: AgentSettingsUpdateRequest)
```

**Body:** `{ patch*: object }`

**HTTP:** `PATCH /api/v1/agent/settings`
**CLI:** `hoody agent settings update --patch <patch>`

---

#### `updateFeatures` — Change agent features.

```typescript
client.agent.settings.updateFeatures(data: AgentSettingsUpdateFeaturesRequest)
```

**Body:** `{ features*: { [key: string]: bool } }`

**HTTP:** `PATCH /api/v1/agent/settings/features`
**CLI:** `hoody agent settings features update --features <features>`

---

### `client.agent.skills` (14) — Reusable agent skill definitions

#### `create` — Create a skill.

```typescript
client.agent.skills.create(data: AgentSkillsCreateRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ name*: string }`

- `name` — Skill name (also the SKILL.md directory stem, and the frontmatter `name`). Must not collide with an existing skill in any root.

**HTTP:** `POST /api/v1/agent/skills`
**CLI:** `hoody agent skills create --name <name>`

---

#### `delete` — Delete a skill.

```typescript
client.agent.skills.delete(data: AgentSkillsDeleteRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ root_dir*: string, rel_dir*: string }`

**HTTP:** `POST /api/v1/agent/skills/delete`
**CLI:** `hoody agent skills delete --root-dir <root-dir> --rel-dir <rel-dir>`

---

#### `disable` — Enable/disable a skill.

```typescript
client.agent.skills.disable(data: Omit<AgentSkillsDisableRequest, "disabled">, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ name*: string }`

**Fixed by the method:** the method sets `disabled: true`; do not pass `disabled`.

**HTTP:** `POST /api/v1/agent/skills/toggle`
**CLI:** `hoody agent skills disable --name <name>`

---

#### `enable` — Enable/disable a skill.

```typescript
client.agent.skills.enable(data: Omit<AgentSkillsEnableRequest, "disabled">, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ name*: string }`

**Fixed by the method:** the method sets `disabled: false`; do not pass `disabled`.

**HTTP:** `POST /api/v1/agent/skills/toggle`
**CLI:** `hoody agent skills enable --name <name>`

---

#### `getSource` — Read a skill's source.

```typescript
client.agent.skills.getSource(options?: { root_dir?: string; rel_dir?: string; root?: string; rel?: string; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `root_dir` | `string` | query | No | Skill root directory (identity; alias: root). |
| `rel_dir` | `string` | query | No | Skill relative directory (identity; alias: rel). |
| `root` | `string` | query | No | Friendly alias of root_dir (translated to root_dir server-side). |
| `rel` | `string` | query | No | Friendly alias of rel_dir (translated to rel_dir server-side). |

**HTTP:** `GET /api/v1/agent/skills/source`
**CLI:** `hoody agent skills source get`

---

#### `import` — Apply a skill import.

```typescript
client.agent.skills.import(data: AgentSkillsImportRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ source*: "claude" | "codex", items*: { source: string, rel_dir*: string }[], overwrite: bool }`

- `items` — The selected scan entries to import. At least one is required.

**HTTP:** `POST /api/v1/agent/skills/import/apply`
**CLI:** `hoody agent skills import --source <source> --items <items>`

---

#### `list` — List skills.

```typescript
client.agent.skills.list(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/skills`
**CLI:** `hoody agent skills list`

---

#### `listAll` — List skills. (collect all pages)

```typescript
client.agent.skills.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<AgentSkillsListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/skills`
**CLI:** `hoody agent skills list`

---

#### `listIterator` — List skills. (async iterator)

```typescript
client.agent.skills.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<AgentSkillsListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/skills`
**CLI:** `hoody agent skills list`

---

#### `rename` — Rename a skill.

```typescript
client.agent.skills.rename(data: AgentSkillsRenameRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ root_dir*: string, rel_dir*: string, new_name*: string }`

**HTTP:** `POST /api/v1/agent/skills/rename`
**CLI:** `hoody agent skills rename --root-dir <root-dir> --rel-dir <rel-dir> --new-name <new-name>`

---

#### `scan` — Scan for importable skills.

```typescript
client.agent.skills.scan(options: { source: "claude" | "codex"; cwd?: string; configDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source` | `"claude" \| "codex"` | query | Yes | Which tool's skills to scan. |

**HTTP:** `GET /api/v1/agent/skills/import/scan`
**CLI:** `hoody agent skills scan --source <source>`

---

#### `setSource` — Write a skill's source.

```typescript
client.agent.skills.setSource(data: AgentSkillsSetSourceRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ root_dir*: string, rel_dir*: string, content*: string, base_gen: int }`

- `base_gen` — Optional: the `gen` returned by GET /api/v1/agent/skills/source (or a previous PUT /api/v1/agent/skills/source). A save whose SKILL.md changed since is refused 409 revision_conflict (details.current_gen) and writes nothing. Omit or pass 0 to save unconditionally.

**HTTP:** `PUT /api/v1/agent/skills/source`
**CLI:** `hoody agent skills source set --root-dir <root-dir> --rel-dir <rel-dir> --content <content>`

---

#### `trust` — Set a skill's trust state.

```typescript
client.agent.skills.trust(data: Omit<AgentSkillsTrustRequest, "trusted">, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ root_dir*: string, rel_dir*: string }`

**Fixed by the method:** the method sets `trusted: true`; do not pass `trusted`.

**HTTP:** `POST /api/v1/agent/skills/trust`
**CLI:** `hoody agent skills trust --root-dir <root-dir> --rel-dir <rel-dir>`

---

#### `untrust` — Set a skill's trust state.

```typescript
client.agent.skills.untrust(data: Omit<AgentSkillsUntrustRequest, "trusted">, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ root_dir*: string, rel_dir*: string }`

**Fixed by the method:** the method sets `trusted: false`; do not pass `trusted`.

**HTTP:** `POST /api/v1/agent/skills/trust`
**CLI:** `hoody agent skills untrust --root-dir <root-dir> --rel-dir <rel-dir>`

---

### `client.agent.definitions` (15) — Chat agent definitions

#### `copy` — Copy a chat agent.

```typescript
client.agent.definitions.copy(name: string, data: AgentDefinitionsCopyRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ new_name*: string }`

**HTTP:** `POST /api/v1/agent/agents/{name}/copy`
**CLI:** `hoody agent definitions copy --name <name> --new-name <new-name>`

---

#### `create` — Create a chat-agent definition.

```typescript
client.agent.definitions.create(data: AgentDefinitionsCreateRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ name*: string, frontmatter: { description: string, model: string, tools: string[], effort: "adaptive" | "low" | "medium" | "high" | "xhigh" | "max", max_turns: int, max_steps_per_turn: int, labels: string[], strict_tools: bool, mcp_tools: string[], skills: string[], prompt_blocks: object, ask_timeout: string | int, thinking: "enabled" | "disabled", temperature: number, response_format: "json_object", compaction: "same_prefix", compaction_max_tokens: int }, system_prompt: string }`

- `frontmatter` — … Any other key is rejected. strict_tools is a boolean: true gives the agent EXACTLY its tools list (no skill or workflow tool is added, no MCP tool unless mcp_tools names it, and a call to any other tool is refused), and with no tools list it gets only ask_question_to_user, todo_read, todo_write …

**HTTP:** `POST /api/v1/agent/agents`
**CLI:** `hoody agent definitions create --name <name>`

---

#### `delete` — Delete a custom chat agent.

```typescript
client.agent.definitions.delete(name: string, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `DELETE /api/v1/agent/agents/{name}`
**CLI:** `hoody agent definitions delete --name <name>`

---

#### `getSource` — Read a chat agent's source.

```typescript
client.agent.definitions.getSource(name: string, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/agents/{name}/source`
**CLI:** `hoody agent definitions source get --name <name>`

---

#### `list` — List chat-agent definitions.

```typescript
client.agent.definitions.list(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/agents`
**CLI:** `hoody agent definitions list`

---

#### `listAll` — List chat-agent definitions. (collect all pages)

```typescript
client.agent.definitions.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<AgentDefinitionsListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/agents`
**CLI:** `hoody agent definitions list`

---

#### `listIterator` — List chat-agent definitions. (async iterator)

```typescript
client.agent.definitions.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<AgentDefinitionsListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/agents`
**CLI:** `hoody agent definitions list`

---

#### `rename` — Rename a chat agent.

```typescript
client.agent.definitions.rename(name: string, data: AgentDefinitionsRenameRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ new_name*: string }`

**HTTP:** `POST /api/v1/agent/agents/{name}/rename`
**CLI:** `hoody agent definitions rename --name <name> --new-name <new-name>`

---

#### `reset` — Reset an agent to its shipped default.

```typescript
client.agent.definitions.reset(name: string, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `POST /api/v1/agent/agents/{name}/reset-to-shipped`
**CLI:** `hoody agent definitions reset --name <name>`

---

#### `setEffort` — Set an agent's reasoning effort.

```typescript
client.agent.definitions.setEffort(name: string, data: AgentDefinitionsSetEffortRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ effort*: "" | "adaptive" | "low" | "medium" | "high" | "xhigh" | "max" }`

**HTTP:** `PATCH /api/v1/agent/agents/{name}/effort`
**CLI:** `hoody agent definitions effort set --name <name> --effort <effort>`

---

#### `setModel` — Set an agent's model.

```typescript
client.agent.definitions.setModel(name: string, data: AgentDefinitionsSetModelRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ model*: string }`

**HTTP:** `PATCH /api/v1/agent/agents/{name}/model`
**CLI:** `hoody agent definitions model set --name <name> --model <model>`

---

#### `setSource` — Write a chat agent's source.

```typescript
client.agent.definitions.setSource(name: string, data: AgentDefinitionsSetSourceRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ content*: string, expected_revision: string }`

- `content` — … Frontmatter is read as one `key: value` per line: a `tools:` line must be a comma-separated list on that same line, because a YAML block list underneath it parses to NOTHING and the agent is then granted every tool (only the benign special tools when `strict_tools` is on), the opposite of the restriction it looks like. The turn cap is spelled `max_turns`; a `turns` line is ignored.
- `expected_revision` — … A save whose source changed since is refused 409 revision_conflict (details.current_revision) and writes nothing. … The revision is bound to the realm this request resolves to: on a gateway without a realm pin, a revision read while another realm was active is refused 409 revision_conflict (details.current_revision is this realm's), never written into the other realm.

**HTTP:** `PUT /api/v1/agent/agents/{name}/source`
**CLI:** `hoody agent definitions source set --name <name> --content <content>`

---

#### `setTools` — Set an agent's tool allow-list.

```typescript
client.agent.definitions.setTools(name: string, data: AgentDefinitionsSetToolsRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ tools*: string[], none: bool }`

- `none` — Optional: true, with an empty tools list, writes `tools: none`, so the agent has no tools at all. With a non-empty list it is refused 400 bad_request and nothing is written. Omitted or false: tools as above.

**HTTP:** `PATCH /api/v1/agent/agents/{name}/tools`
**CLI:** `hoody agent definitions tools set --name <name> --tools <tools>`

---

#### `setTurnLimit` — Set an agent's max-turns.

```typescript
client.agent.definitions.setTurnLimit(name: string, data: AgentDefinitionsSetTurnLimitRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ turns*: int }`

**HTTP:** `PATCH /api/v1/agent/agents/{name}/turns`
**CLI:** `hoody agent definitions turnlimit set --name <name> --turns <turns>`

---

#### `toggleTool` — Toggle a single tool for an agent.

```typescript
client.agent.definitions.toggleTool(name: string, tool: string, data?: AgentDefinitionsToggleToolRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `tool` | `string` | path | Yes | The tool. |

**HTTP:** `POST /api/v1/agent/agents/{name}/tools/{tool}/toggle`
**CLI:** `hoody agent definitions tools toggle --name <name> --tool <tool>`

---

### `client.agent.hooks` (14) — Lifecycle hook configuration

#### `createWriteIntent` — Begin a hook write (nonce).

```typescript
client.agent.hooks.createWriteIntent(data: AgentHooksCreateWriteIntentRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ session_id*: string, op*: "upsert" | "delete" | "toggle" | "set_disabled" | "rules_set", scope*: string }`

- `session_id` — Live session id (hooks are session-scoped). Required here: the method has no `session_id` query option.
- `op` — The write the nonce authorizes: upsert (PUT /api/v1/agent/hooks), delete (DELETE /api/v1/agent/hooks), toggle (POST /api/v1/agent/hooks/toggle), set_disabled (POST /api/v1/agent/hooks/disable-all) or rules_set (POST /api/v1/agent/hooks/rules). The nonce is rejected by any other op.

**HTTP:** `POST /api/v1/agent/hooks/begin-write`
**CLI:** `hoody agent hooks writeintents create --op <op> --scope <scope> --session-id <session-id>`

---

#### `delete` — Delete a hook.

```typescript
client.agent.hooks.delete(data: AgentHooksDeleteRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ session_id*: string, nonce*: string, scope*: "user" | "project" | "local", event*: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", matcher: string, command: string, matcher_index: int, index: int }`

- `session_id` — Live session id (hooks are session-scoped). Required here: the method has no `session_id` query option.
- `scope` — Scope of the settings file to write: user, project or local. It must match the nonce's scope.
- `event` — Lifecycle event of the hook to remove; required: the daemon rejects any value outside the enum.
- `command` — Command text of the entry to remove (exact match). Omitting it removes EVERY command in the matched event+matcher group. With `index`, required: the command exactly as GET /api/v1/agent/hooks lists it, marks included.

**HTTP:** `DELETE /api/v1/agent/hooks`
**CLI:** `hoody agent hooks delete --nonce <nonce> --scope <scope> --event <event> --session-id <session-id>`

---

#### `disable` — Toggle a hook.

```typescript
client.agent.hooks.disable(data: Omit<AgentHooksDisableRequest, "enabled" | "event" | "matcher" | "command" | "disabled"> & Required<Pick<AgentHooksDisableRequest, "shipped_id">>, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
client.agent.hooks.disable(data: Omit<AgentHooksDisableRequest, "disabled" | "shipped_id" | "enabled"> & Required<Pick<AgentHooksDisableRequest, "event" | "command">>, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `Omit<AgentHooksDisableRequest, "enabled" \| "event" \| "matcher" \| "command" \| "disabled"> & Required<Pick<AgentHooksDisableRequest, "shipped_id">>` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", shipped_id: string, event: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", matcher: string, command: string }`

- `session_id` — Live session id (hooks are session-scoped). Required here: the method has no `session_id` query option.
- `scope` — Scope of the settings file to write: user, project or local. It must match the nonce's scope. A shipped-hook toggle (shipped_id) does not need it: it always writes the first settings layer.
- `event` — Lifecycle event of the ordinary hook to toggle; required on that branch (with matcher + command).
- `command` — Command text of the ordinary hook to toggle (exact match); required on that branch: a toggle must resolve to an existing entry.

**Fixed by the method**, by the form of the call:

- With `shipped_id` in the body: the method sets `enabled: false`; do not pass `enabled`, `event`, `matcher`, `command`, `disabled`.
- Otherwise: the method sets `disabled: true`; `event`, `command` are required; do not pass `disabled`, `shipped_id`, `enabled`.

**HTTP:** `POST /api/v1/agent/hooks/toggle`
**CLI:** `hoody agent hooks disable --nonce <nonce>`

---

#### `disableAll` — Disable all hooks.

```typescript
client.agent.hooks.disableAll(data: Omit<AgentHooksDisableAllRequest, "value">, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ session_id*: string, nonce*: string, scope*: "user" | "project" | "local" }`

- `session_id` — Live session id (hooks are session-scoped). Required here: the method has no `session_id` query option.
- `scope` — Scope of the settings file to write: user, project or local. It must match the nonce's scope. A shipped-hook toggle (shipped_id) does not need it: it always writes the first settings layer.

**Fixed by the method:** the method sets `value: true`; do not pass `value`.

**HTTP:** `POST /api/v1/agent/hooks/disable-all`
**CLI:** `hoody agent hooks disable --all --nonce <nonce> --scope <scope>`

---

#### `enable` — Toggle a hook.

```typescript
client.agent.hooks.enable(data: Omit<AgentHooksEnableRequest, "enabled" | "event" | "matcher" | "command" | "disabled"> & Required<Pick<AgentHooksEnableRequest, "shipped_id">>, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
client.agent.hooks.enable(data: Omit<AgentHooksEnableRequest, "disabled" | "shipped_id" | "enabled"> & Required<Pick<AgentHooksEnableRequest, "event" | "command">>, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `Omit<AgentHooksEnableRequest, "enabled" \| "event" \| "matcher" \| "command" \| "disabled"> & Required<Pick<AgentHooksEnableRequest, "shipped_id">>` | body | Yes |  |

**Body:** `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", shipped_id: string, event: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", matcher: string, command: string }`

- `session_id` — Live session id (hooks are session-scoped). Required here: the method has no `session_id` query option.
- `scope` — Scope of the settings file to write: user, project or local. It must match the nonce's scope. A shipped-hook toggle (shipped_id) does not need it: it always writes the first settings layer.
- `event` — Lifecycle event of the ordinary hook to toggle; required on that branch (with matcher + command).
- `command` — Command text of the ordinary hook to toggle (exact match); required on that branch: a toggle must resolve to an existing entry.

**Fixed by the method**, by the form of the call:

- With `shipped_id` in the body: the method sets `enabled: true`; do not pass `enabled`, `event`, `matcher`, `command`, `disabled`.
- Otherwise: the method sets `disabled: false`; `event`, `command` are required; do not pass `disabled`, `shipped_id`, `enabled`.

**HTTP:** `POST /api/v1/agent/hooks/toggle`
**CLI:** `hoody agent hooks enable --nonce <nonce>`

---

#### `enableAll` — Resume hooks: clear the hook suspension in the selected scope. Hooks stay suspended when another settings layer still sets it.

```typescript
client.agent.hooks.enableAll(data: Omit<AgentHooksEnableAllRequest, "value">, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ session_id*: string, nonce*: string, scope*: "user" | "project" | "local" }`

- `session_id` — Live session id (hooks are session-scoped). Required here: the method has no `session_id` query option.
- `scope` — Scope of the settings file to write: user, project or local. It must match the nonce's scope. A shipped-hook toggle (shipped_id) does not need it: it always writes the first settings layer.

**Fixed by the method:** the method sets `value: false`; do not pass `value`.

**HTTP:** `POST /api/v1/agent/hooks/disable-all`
**CLI:** `hoody agent hooks enable --all --nonce <nonce> --scope <scope>`

---

#### `getRules` — Get the tool-call rules.

```typescript
client.agent.hooks.getRules(options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/hooks/rules`
**CLI:** `hoody agent hooks rules get`

---

#### `list` — List hooks.

```typescript
client.agent.hooks.list(options: { session_id: string; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `session_id` | `string` | query | Yes | Live session id (hooks are session-scoped). Without one the call is refused. |

**HTTP:** `GET /api/v1/agent/hooks`
**CLI:** `hoody agent hooks list --session-id <session-id>`

---

#### `reload` — Reload hooks from disk.

```typescript
client.agent.hooks.reload(data?: AgentHooksReloadRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ session_id: string }`

- `session_id` — Optional: without it every live session in a realm the login serves reloads its own hooks, sessions counts those, and the reply has no summary; with it only that session reloads (it must be visible to the caller), sessions is 1, and the reply adds its summary. Sent only here: the method has no `session_id` query option.

**HTTP:** `POST /api/v1/agent/hooks/reload`
**CLI:** `hoody agent hooks reload`

---

#### `run` — Run hooks now. With `command` it executes that unsaved command inline; without it, it executes the saved hooks matching `event` and `match_value`. This executes commands; use `hooks.test` to dry-run a shipped hook.

```typescript
client.agent.hooks.run(data: Omit<AgentHooksRunRequest, "shipped_id"> & Required<Pick<AgentHooksRunRequest, "event">>, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ session_id*: string, event*: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", match_value: string, command: string, timeout: int, exit_code: int, payload: object }`

- `session_id` — Live session id (hooks are session-scoped). Required here: the method has no `session_id` query option.
- `event` — Lifecycle event to fire. Required on every branch except the shipped dry-run; the daemon rejects any value outside the enum.
- `timeout` — Timeout in whole seconds for an inline `command` (positive integers only; a fractional or non-positive value is ignored rather than truncated). Hard-capped at 60s per command: a larger value, an ignored one, and a saved hook's own longer timeout are all clamped to the 60s test ceiling. A call that fires several saved hooks runs them one after another and ends after at most 120 seconds.

**Fixed by the method:** do not pass `shipped_id`.

**HTTP:** `POST /api/v1/agent/hooks/test`
**CLI:** `hoody agent hooks run --session-id <session-id>`

---

#### `setRules` — Set the tool-call rules.

```typescript
client.agent.hooks.setRules(data: AgentHooksSetRulesRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ session_id*: string, nonce*: string, scope*: "user" | "project" | "local", rules: { id*: string, text*: string, kind*: "limit" | "check_in" | "guidance" | "playbook", tools: string[], agents: string[], when: string[] }[], timeout_ms: int, exec_trust: { computer_id*: string, realm*: string, name: string, granted_at: string, source: "card" | "rules_panel" }[], expected_revision: string }`

- `session_id` — Live session id (hooks are session-scoped). Required here: the method has no `session_id` query option.
- `scope` — Scope of the settings file to write: user, project or local. It must match the nonce's scope. A shipped-hook toggle (shipped_id) does not need it: it always writes the first settings layer.
- `rules` — The complete rule list for the scope (at most 32 checked and 32 guidance/playbook rules; ids unique). An empty array removes the scope's rules.
- `exec_trust` — Optional: the COMPLETE list of per-computer exec trust grants, replacing the scope's (at most 64 rows, each (computer_id, realm) once, validated all-or-nothing); [] revokes every grant. Accepted only for the user scope (the realm's profile, or the X-Hoody-Config-Dir override); any other scope is 400. …
- `expected_revision` — … When it no longer matches the scope file (another tab, a hand edit, a timeout change), the write is refused with 409 revision_conflict, nothing is written, and details.current_revision carries the current value: re-read, re-apply the change, begin a new write (the refused call used up its nonce) and retry. … The revision is bound to the realm of the session it is read and written through, so a revision read through another realm's session is refused 409 revision_conflict, on a gateway with or without a realm pin.

**HTTP:** `POST /api/v1/agent/hooks/rules`
**CLI:** `hoody agent hooks rules set --nonce <nonce> --scope <scope> --session-id <session-id>`

---

#### `test` — Dry-run a shipped hook, chosen by `shipped_id`. Nothing is executed.

```typescript
client.agent.hooks.test(data: AgentHooksTestRequest & Required<Pick<AgentHooksTestRequest, "shipped_id">>, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ session_id*: string, shipped_id*: string, event: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", match_value: string, command: string, timeout: int, exit_code: int, payload: object }`

- `session_id` — Live session id (hooks are session-scoped). Required here: the method has no `session_id` query option.
- `event` — Lifecycle event to fire. Required on every branch except the shipped dry-run; the daemon rejects any value outside the enum.
- `timeout` — Timeout in whole seconds for an inline `command` (positive integers only; a fractional or non-positive value is ignored rather than truncated). Hard-capped at 60s per command: a larger value, an ignored one, and a saved hook's own longer timeout are all clamped to the 60s test ceiling. A call that fires several saved hooks runs them one after another and ends after at most 120 seconds.

**HTTP:** `POST /api/v1/agent/hooks/test`
**CLI:** `hoody agent hooks test --session-id <session-id> --shipped-id <shipped-id>`

---

#### `trust` — Acknowledge hook trust.

```typescript
client.agent.hooks.trust(data: AgentHooksTrustRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ session_id*: string, hash*: string, high_risk: bool }`

- `session_id` — Live session id (hooks are session-scoped). Required here: the method has no `session_id` query option.
- `hash` — The trust hash being acknowledged, from the GET /api/v1/agent/hooks `trust.hash`. Required and non-empty; a hash that no longer matches the live hook config is rejected (anti-TOCTOU).
- `high_risk` — Acknowledge the elevated-risk grant rather than the ordinary one. The grant KIND is still derived server-side from the reviewed snapshot: this flag cannot widen it.

**HTTP:** `POST /api/v1/agent/hooks/trust/ack`
**CLI:** `hoody agent hooks trust --hash <hash> --session-id <session-id>`

---

#### `upsert` — Upsert a hook.

```typescript
client.agent.hooks.upsert(data: AgentHooksUpsertRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ session_id*: string, nonce*: string, scope*: "user" | "project" | "local", event*: "Notification" | "PostToolUse" | "PreCompact" | "PreToolUse" | "SessionEnd" | "SessionStart" | "Stop" | "SubagentStart" | "SubagentStop" | "UserPromptSubmit", matcher: string, command*: string, timeout: int, name: string, description: string, when: string[] }`

- `session_id` — Live session id (hooks are session-scoped). Required here: the method has no `session_id` query option.
- `scope` — Scope of the settings file to write: user, project or local. It must match the nonce's scope.
- `event` — Lifecycle event the hook fires on; part of the hook's identity triple. Required: the daemon rejects any value outside the enum.
- `command` — Command to run when the hook fires; part of the identity triple. Required and non-empty: a different command text addresses a DIFFERENT hook.
- `timeout` — Per-fire timeout in whole seconds (optional; non-negative whole numbers only: a fractional or negative value is refused, and anything above 86400 (24h) is clamped to it). … Two ceilings override this value at fire time: SessionEnd is always capped at 60s so a hook cannot wedge daemon shutdown, and every fire through POST /api/v1/agent/hooks/test is capped at 60s.
- `name` — … CONDITIONALLY required: a NEW hook (an identity triple event+matcher+command not yet in the settings) is refused 400 without it; on an UPDATE of an existing hook omit it to preserve the stored value. Not in the schema's required list only because of the update case. A character displays hide (a control, bidi or zero-width character, or a soft hyphen) is refused 400, as in command.
- `description` — Short description of what the hook does. CONDITIONALLY required exactly like name: a NEW hook is refused 400 without it; omit on update to preserve. It may hold tabs and newlines; any other character displays hide is refused 400, as in command.
- `when` — Optional condition; Stop and SubagentStop hooks only (a condition on any other event is refused 400 bad_request and nothing is written). Up to 8 atoms, checked left to right over the calls the acting agent made in its current turn: `+names` means such a call happened (after the previous `+` atom's match), `-names` means none happened since. names is a tool name, `a|b` (at most 8), or `*`; Claude Code aliases such as Bash are accepted and cover their whole set of tools. … An invalid condition is refused 400 bad_request and nothing is written. …

**HTTP:** `PUT /api/v1/agent/hooks`
**CLI:** `hoody agent hooks upsert --nonce <nonce> --scope <scope> --event <event> --command <command> --session-id <session-id>`

---

### `client.agent.jev` (6) — Jev, the decision helper

#### `decide` — Ask Jev to decide.

```typescript
client.agent.jev.decide(data: AgentJevDecideRequest, options?: { cwd?: string; configDir?: string })
```

**Body:** `{ state*: string | object | (string | number | bool | object | null)[], questions*: { [key: string]: object }, model: string, timeout_ms: int, provider: object, session_id: string, trace: object, user: string, x_session_id: string }`

- `provider` — Sent only when the model's provider forwards routing extras; on any other provider it is not sent and is named in the reply's `ignored_fields`. Provider routing preferences.
- `session_id` — Sent only when the model's provider forwards routing extras; on any other provider it is not sent and is named in the reply's `ignored_fields`. Session grouping id (up to 256 characters).
- `trace` — Sent only when the model's provider forwards routing extras; on any other provider it is not sent and is named in the reply's `ignored_fields`. Trace configuration.
- `user` — Sent only when the model's provider forwards routing extras; on any other provider it is not sent and is named in the reply's `ignored_fields`. End-user id (up to 256 characters).
- `x_session_id` — Sent only when the model's provider forwards routing extras; on any other provider it is not sent and is named in the reply's `ignored_fields`. Sent as the x-session-id header.

**HTTP:** `POST /api/v1/agent/jev/decide`

---

#### `decideForSession` — Ask Jev to decide on behalf of a session.

```typescript
client.agent.jev.decideForSession(id: string, data: AgentJevDecideForSessionRequest, options?: { agentRealm?: "global" | (string & {}) })
```

**Body:** `{ state*: string | object | (string | number | bool | object | null)[], questions*: { [key: string]: object }, model: string, timeout_ms: int, provider: object, session_id: string, trace: object, user: string, x_session_id: string }`

- `provider` — Sent only when the model's provider forwards routing extras; on any other provider it is not sent and is named in the reply's `ignored_fields`. Provider routing preferences.
- `session_id` — Sent only when the model's provider forwards routing extras; on any other provider it is not sent and is named in the reply's `ignored_fields`. Session grouping id (up to 256 characters).
- `trace` — Sent only when the model's provider forwards routing extras; on any other provider it is not sent and is named in the reply's `ignored_fields`. Trace configuration.
- `user` — Sent only when the model's provider forwards routing extras; on any other provider it is not sent and is named in the reply's `ignored_fields`. End-user id (up to 256 characters).
- `x_session_id` — Sent only when the model's provider forwards routing extras; on any other provider it is not sent and is named in the reply's `ignored_fields`. Sent as the x-session-id header.

**HTTP:** `POST /api/v1/agent/sessions/{id}/jev/decide`

---

#### `getSettings` — Read the Jev settings.

```typescript
client.agent.jev.getSettings(options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/jev/settings`
**CLI:** `hoody agent jev settings get`

---

#### `listModels` — List the models Jev can use.

```typescript
client.agent.jev.listModels(options?: { cwd?: string; configDir?: string })
```

**HTTP:** `GET /api/v1/agent/jev/models`
**CLI:** `hoody agent jev models list`

---

#### `test` — Test Jev with one tiny decision.

```typescript
client.agent.jev.test(data?: AgentJevTestRequest, options?: { cwd?: string; configDir?: string })
```

**Body:** `{ model: string }`

**HTTP:** `POST /api/v1/agent/jev/test`
**CLI:** `hoody agent jev test`

---

#### `updateSettings` — Change the Jev settings.

```typescript
client.agent.jev.updateSettings(data?: AgentJevUpdateSettingsRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ enabled: bool, model: string, timeout_ms: int }`

**HTTP:** `PUT /api/v1/agent/jev/settings`
**CLI:** `hoody agent jev settings update`

---

### `client.agent.loops` (7) — Recurring self-paced agent loops

**Shared parameters of `client.agent.loops`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `loopId` | `string` | path | Yes | The loop id. |

#### `create` — Create a loop.

```typescript
client.agent.loops.create(id: string, data: AgentLoopsCreateRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ prompt*: string, interval*: string, max_runs: int, stop_when: { kind: "expression" | "toolCall" | "judgeRef" | "convergence", expr: string, tool: string, check: string, judge: string, args: object, threshold: number, min_iters: int, allow_network: bool }, max_cost_usd: number, max_wall_ms: int, expires_in: string, fire_now: bool }`

- `interval` — Run interval as a duration token, for example "30m". Required, with no default: a create without it is rejected. The minimum accepted interval is 60 seconds: a shorter one is refused rather than rounded up.
- `stop_when` — Optional stop predicate, evaluated after each run. Omit the field entirely when there is no predicate: a string value is rejected, and that includes the empty string.
- `max_cost_usd` — Cost ceiling in USD, a number >= 0. 0 or absent means unlimited. … A value that is not a JSON number (a string such as "5", true or null) or is negative is refused with 400 bad_request.
- `max_wall_ms` — Wall-clock ceiling, as a whole number of milliseconds from 0 up to (not including) 2^63. 0 or absent means unlimited. Any other value (a string such as "2h", a fraction, a negative number, true or null) is refused with 400 bad_request.
- `expires_in` — … Without fire_now an expiry shorter than one interval is rejected, because the loop would never fire; with fire_now it must be at least 2 seconds, so the immediate first run can happen.

**HTTP:** `POST /api/v1/agent/sessions/{id}/loops`
**CLI:** `hoody agent loops create --session-id <session-id> --prompt <prompt> --interval <interval>`

---

#### `delete` — Delete a loop.

```typescript
client.agent.loops.delete(id: string, loopId: string, data?: AgentLoopsDeleteRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `DELETE /api/v1/agent/sessions/{id}/loops/{loopId}`
**CLI:** `hoody agent loops delete --session-id <session-id> --loop-id <loop-id>`

---

#### `list` — List loops across all sessions.

```typescript
client.agent.loops.list(options?: { agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number; cwd?: string; configDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `agentRealm` | `"global" \| "all" \| (string & {})` | query `realm` | No | The realm to list: "global" (loops not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |

**HTTP:** `GET /api/v1/agent/loops`
**CLI:** `hoody agent loops list`

---

#### `listAll` — List loops across all sessions. (collect all pages)

```typescript
client.agent.loops.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<AgentLoopsListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/loops`
**CLI:** `hoody agent loops list`

---

#### `listIterator` — List loops across all sessions. (async iterator)

```typescript
client.agent.loops.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<AgentLoopsListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/loops`
**CLI:** `hoody agent loops list`

---

#### `startRun` — Run a loop immediately.

```typescript
client.agent.loops.startRun(id: string, loopId: string, data?: AgentLoopsStartRunRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `POST /api/v1/agent/sessions/{id}/loops/{loopId}/run-now`
**CLI:** `hoody agent loops runs start --session-id <session-id> --loop-id <loop-id>`

---

#### `update` — Update a loop.

```typescript
client.agent.loops.update(id: string, loopId: string, data?: AgentLoopsUpdateRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ paused: bool, expires_in: string, max_cost_usd: number, max_wall_ms: int, if_state: string, if_max_cost_usd: number, if_max_wall_ms: int }`

- `max_cost_usd` — … A budget update sets both ceilings: sent without max_wall_ms, it also sets the wall-clock ceiling to 0 (unlimited). A value that is not a JSON number (a string such as "5", true or null) or is negative is refused with 400 bad_request, and nothing changes.
- `max_wall_ms` — … Any other value (a string such as "2h", a fraction, a negative number, true or null) is refused with 400 bad_request, and nothing changes. A budget update sets both ceilings: sent without max_cost_usd, it also sets the cost ceiling to 0 (unlimited).
- `if_state` — Precondition (any intent): the loop's state as listed (running, firing, paused, error, expired, stopped, ended). When the loop is not in it now, nothing changes and the answer is 409 loop_changed. if_state stopped with the budget fields starts a stopped loop again only if it is still stopped.
- `if_max_cost_usd` — Precondition (any intent): the loop's cost ceiling as listed (0 = none). When it differs now, nothing changes and the answer is 409 loop_changed.
- `if_max_wall_ms` — Precondition (any intent): the loop's wall-clock ceiling in ms as listed (0 = none). When it differs now, nothing changes and the answer is 409 loop_changed.

**HTTP:** `PATCH /api/v1/agent/sessions/{id}/loops/{loopId}`
**CLI:** `hoody agent loops update --session-id <session-id> --loop-id <loop-id>`

---

### `client.agent.memory` (14) — Long-term memory records (admin browse / CRUD)

#### `claimDataHost` — Assign this computer as the memory data host.

```typescript
client.agent.memory.claimDataHost(data: AgentMemoryClaimDataHostRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ use_self*: bool, expect_realm: string }`

- `use_self` — Assign THIS computer. Only true is implemented; false is refused 400 unsupported.
- `expect_realm` — … Required unless X-Hoody-Realm or ?realm= names the realm; refused 400 when neither does (an empty value means the global realm to the daemon, never "unspecified"), and 400 bad_request when it names another realm than they do.

**HTTP:** `PUT /api/v1/agent/memory/datahost`
**CLI:** `hoody agent memory datahost claim --use-self`

---

#### `consolidate` — Trigger a memory consolidation pass.

```typescript
client.agent.memory.consolidate(data: AgentMemoryConsolidateRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ project*: string, nonce*: string, min_observations: int, expect_realm: string }`

- `project` — Project key to consolidate (required).
- `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The request is refused when it does not name the realm the request acts in (the named realm, else the agent's active realm).

**HTTP:** `POST /api/v1/agent/memory/consolidate`
**CLI:** `hoody agent memory consolidate --project <project> --nonce <nonce>`

---

#### `createWriteIntent` — Begin a guarded memory write (intent).

```typescript
client.agent.memory.createWriteIntent(data: AgentMemoryCreateWriteIntentRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ op*: "wipe_project" | "consolidate", project*: string, expect_realm: string }`

- `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The request is refused when it does not name the realm the request acts in (the named realm, else the agent's active realm).

**HTTP:** `POST /api/v1/agent/memory/write-intents`
**CLI:** `hoody agent memory writeintents create --op <op> --project <project>`

---

#### `deleteProject` — Erase a memory project.

```typescript
client.agent.memory.deleteProject(project: string, data: AgentMemoryDeleteProjectRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `project` | `string` | path | Yes | The project. |

**Body:** `{ nonce*: string, reason: string, expect_realm: string }`

- `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The request is refused when it does not name the realm the request acts in (the named realm, else the agent's active realm).

**HTTP:** `DELETE /api/v1/agent/memory/projects/{project}`
**CLI:** `hoody agent memory projects delete --project <project> --nonce <nonce>`

---

#### `disable` — Toggle memory capture.

```typescript
client.agent.memory.disable(data?: Omit<AgentMemoryDisableRequest, "enabled">, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Fixed by the method:** the method sets `enabled: false`; do not pass `enabled`.

**HTTP:** `PUT /api/v1/agent/memory/enabled`
**CLI:** `hoody agent memory disable`

---

#### `enable` — Toggle memory capture.

```typescript
client.agent.memory.enable(data?: Omit<AgentMemoryEnableRequest, "enabled">, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Fixed by the method:** the method sets `enabled: true`; do not pass `enabled`.

**HTTP:** `PUT /api/v1/agent/memory/enabled`
**CLI:** `hoody agent memory enable`

---

#### `flush` — Flush the memory store.

```typescript
client.agent.memory.flush(data?: AgentMemoryFlushRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `POST /api/v1/agent/memory/flush`
**CLI:** `hoody agent memory flush`

---

#### `getDataHost` — Read the realm's memory data host.

```typescript
client.agent.memory.getDataHost(options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/memory/datahost`
**CLI:** `hoody agent memory datahost get`

---

#### `getGraph` — Read a project's memory relation graph.

```typescript
client.agent.memory.getGraph(options?: { project?: string; node_type?: string; limit?: number; offset?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `project` | `string` | query | No | Project key whose graph to read. |
| `node_type` | `string` | query | No | Optional node-type filter. |
| `limit` | `number` | query | No | Maximum nodes/edges to return. |
| `offset` | `number` | query | No | Pagination offset into the graph. |

**HTTP:** `GET /api/v1/agent/memory/graph`
**CLI:** `hoody agent memory graph get`

---

#### `getStatus` — Read memory subsystem status.

```typescript
client.agent.memory.getStatus(options?: { project?: string; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `project` | `string` | query | No | Project key to report per-project counts, embedding coverage and last-consolidation for. Omitted: only the whole-store totals are returned. |

**HTTP:** `GET /api/v1/agent/memory/status`
**CLI:** `hoody agent memory status`

---

#### `listProjects` — List memory projects.

```typescript
client.agent.memory.listProjects(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/memory/projects`
**CLI:** `hoody agent memory projects list`

---

#### `listProjectsAll` — List memory projects. (collect all pages)

```typescript
client.agent.memory.listProjectsAll(/* the arguments of listProjects */)
```

**Returns:** `Promise<Item<AgentMemoryListProjectsResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`listProjects()` fetches one page). Each item is `{ key*: string, root*: string, computer: string, memories*: int, observations*: int, sessions*: int, lessons*: int, slots*: int, updated_at: string }`. `listProjectsIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/memory/projects`
**CLI:** `hoody agent memory projects list`

---

#### `listProjectsIterator` — List memory projects. (async iterator)

```typescript
client.agent.memory.listProjectsIterator(/* the arguments of listProjects */)
```

**Returns:** `AsyncGenerator<Item<AgentMemoryListProjectsResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`listProjects()` fetches one page). Each item is `{ key*: string, root*: string, computer: string, memories*: int, observations*: int, sessions*: int, lessons*: int, slots*: int, updated_at: string }`.  |  **HTTP:** `GET /api/v1/agent/memory/projects`
**CLI:** `hoody agent memory projects list`

---

#### `search` — Search memory (hybrid recall).

```typescript
client.agent.memory.search(data?: AgentMemorySearchRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ project: string, query: string, limit: int, kinds: string[], skip_graph: bool }`

- `kinds` — Optional document kinds to restrict the search to: obs (observations), memory (saved memories), summary (session summaries). Any other value is refused with 400.

**HTTP:** `POST /api/v1/agent/memory/search`
**CLI:** `hoody agent memory search`

---

### `client.agent.sessions.approverLease` (3) — Approver Lease operations

#### `claim` — Acquire the right to answer this session's gates.

```typescript
client.agent.sessions.approverLease.claim(id: string, data: AgentSessionsApproverLeaseClaimRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ holder*: string, ttl_ms: int, replace: bool, lease: string }`

- `holder` — REQUIRED on acquire: an opaque per-caller id (1–64 printable ASCII, no spaces) that identifies THIS client as the holder (reported as `holder` on the event.gate_resolved stream event). Never a credential; an empty holder is 400.
- `replace` — Documentation only: a live lease is taken over ONLY by presenting its current capability as proof (X-Hoody-Approver-Lease or body.lease); replace:true without the proof is still 409 approver_lease_held. After expiry or release an acquire needs no proof.

**HTTP:** `POST /api/v1/agent/sessions/{id}/approver-lease`
**CLI:** `hoody agent sessions approverlease claim --id <id> --holder <holder>`

---

#### `release` — Release the approver lease.

```typescript
client.agent.sessions.approverLease.release(id: string, options?: { approverLease?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `DELETE /api/v1/agent/sessions/{id}/approver-lease`
**CLI:** `hoody agent sessions approverlease release --id <id>`

---

#### `renew` — Renew the approver lease.

```typescript
client.agent.sessions.approverLease.renew(id: string, data?: AgentSessionsApproverLeaseRenewRequest, options?: { approverLease?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ ttl_ms: int, lease: string }`

**HTTP:** `PATCH /api/v1/agent/sessions/{id}/approver-lease`
**CLI:** `hoody agent sessions approverlease renew --id <id>`

---

### `client.agent.sessions.autoReply` (3) — Auto Reply operations

#### `disableWrites` — Flip the auto-reply write opt-in.

```typescript
client.agent.sessions.autoReply.disableWrites(id: string, data?: Omit<AgentSessionsAutoReplyDisableWritesRequest, "allow_writes">, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Fixed by the method:** the method sets `allow_writes: false`; do not pass `allow_writes`.

**HTTP:** `PATCH /api/v1/agent/sessions/{id}/auto-reply/writes`
**CLI:** `hoody agent sessions autoreply writes disable --id <id>`

---

#### `enableWrites` — Flip the auto-reply write opt-in.

```typescript
client.agent.sessions.autoReply.enableWrites(id: string, data?: Omit<AgentSessionsAutoReplyEnableWritesRequest, "allow_writes">, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Fixed by the method:** the method sets `allow_writes: true`; do not pass `allow_writes`.

**HTTP:** `PATCH /api/v1/agent/sessions/{id}/auto-reply/writes`
**CLI:** `hoody agent sessions autoreply writes enable --id <id>`

---

#### `update` — Arm/disarm the auto-reply loop.

```typescript
client.agent.sessions.autoReply.update(id: string, data?: AgentSessionsAutoReplyUpdateRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ armed: bool, rounds: int, model: string, allow_writes: bool }`

- `model` — Replier model override; a speech model is refused 422 model_unavailable (details.reason speech_model).

**HTTP:** `PATCH /api/v1/agent/sessions/{id}/auto-reply`
**CLI:** `hoody agent sessions autoreply update --id <id>`

---

### `client.agent.todos` (19) — Computer-aware task list management

**Shared parameters of `client.agent.todos`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The todo id. |

#### `approveProposal` — Approve a todo proposal.

```typescript
client.agent.todos.approveProposal(id: string, pid: string, data?: AgentTodosApproveProposalRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `pid` | `string` | path | Yes | The proposal id. |

**HTTP:** `POST /api/v1/agent/todos/{id}/proposals/{pid}/approve`
**CLI:** `hoody agent todos proposals approve --id <id> --proposal-id <proposal-id>`

---

#### `archive` — Archive a todo.

```typescript
client.agent.todos.archive(id: string, data: AgentTodosArchiveRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ revision*: int }`

- `revision` — The TODO's own current `revision` (from GET /api/v1/agent/todos/{id}); required: a stale or absent value is rejected.

**HTTP:** `POST /api/v1/agent/todos/{id}/archive`
**CLI:** `hoody agent todos archive --id <id> --revision <revision>`

---

#### `cancel` — Cancel a todo's run.

```typescript
client.agent.todos.cancel(id: string, data?: AgentTodosCancelRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ expected_run: string }`

- `expected_run` — Cancel only this run (a `run_id`). When another run holds the todo, the cancel is refused with 409 run_changed and `details.run_id` and `details.session_id` name the current run. Omitted: cancel whichever run holds the todo.

**HTTP:** `POST /api/v1/agent/todos/{id}/cancel-run`
**CLI:** `hoody agent todos cancel --id <id>`

---

#### `claim` — Claim a todo.

```typescript
client.agent.todos.claim(id: string, data: AgentTodosClaimRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ session_id*: string, revision: int }`

- `session_id` — Identity that will OWN the lease. Required and non-empty. POST /api/v1/agent/todos/{id}/release must present the same value; while the lease is live another session_id cannot claim the todo.
- `revision` — … CONDITIONALLY required: a FRESH claim (no live lease, or a lease held by another session_id) must carry it: omitting it is 400 bad_request, and a stale one is 409 todo_conflict. … It is not in the schema's required list only because of that second case.

**HTTP:** `POST /api/v1/agent/todos/{id}/claim`
**CLI:** `hoody agent todos claim --id <id> --session-id <session-id>`

---

#### `create` — File a todo.

```typescript
client.agent.todos.create(data: AgentTodosCreateRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ title*: string, body: string, priority: int, tags: string[], cwd: string }`

- `title` — Todo title. Longer input is not rejected: the title is cut to its first 200 Unicode code points before it is stored.
- `body` — Todo body / description. Longer input is not rejected: the body is cut to its first 1,024 Unicode code points before it is stored.
- `priority` — Optional priority band 0..4 (0 = P0 urgent … 4 = P4 someday); defaults to 2 when omitted. Must be a JSON integer in range: a string or out-of-range value is rejected.
- `tags` — Optional tags. Each is trimmed of whitespace and a leading #, cut to 40 code points; empty and duplicate tags are dropped, and at most 12 are kept.
- `cwd` — The todo's working directory (labels the record's computer/path). Defaults to the X-Hoody-Cwd request-scope header when omitted; one of the two must be set.

**HTTP:** `POST /api/v1/agent/todos`
**CLI:** `hoody agent todos create --title <title>`

---

#### `createComment` — Comment on a todo.

```typescript
client.agent.todos.createComment(id: string, data: AgentTodosCreateCommentRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ text*: string }`

**HTTP:** `POST /api/v1/agent/todos/{id}/messages`
**CLI:** `hoody agent todos comments create --id <id> --text <text>`

---

#### `denyProposal` — Deny a todo proposal.

```typescript
client.agent.todos.denyProposal(id: string, pid: string, data?: AgentTodosDenyProposalRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `pid` | `string` | path | Yes | The proposal id. |

**HTTP:** `POST /api/v1/agent/todos/{id}/proposals/{pid}/deny`
**CLI:** `hoody agent todos proposals deny --id <id> --proposal-id <proposal-id>`

---

#### `get` — Read a todo.

```typescript
client.agent.todos.get(id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/todos/{id}`
**CLI:** `hoody agent todos get --id <id>`

---

#### `getRevision` — Get the todos store revision.

```typescript
client.agent.todos.getRevision(options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/todos/revision`
**CLI:** `hoody agent todos revision get`

---

#### `list` — List todos.

```typescript
client.agent.todos.list(options?: { states?: ("inbox" | "ready" | "blocked" | "in_progress" | "review" | "done" | "dropped")[]; tags?: string[]; query?: string; open_only?: boolean; all?: boolean; sort?: "default" | "closed_at"; agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number; cwd?: string; configDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `states` | `("inbox" \| "ready" \| "blocked" \| "in_progress" \| "review" \| "done" \| "dropped")[]` | query | No | Only todos in one of these states. Repeat the parameter for several (?states=ready&states=blocked). |
| `tags` | `string[]` | query | No | Only todos carrying these tags. Repeat the parameter for several (?tags=a&tags=b). |
| `query` | `string` | query | No | Free-text filter over title/body. |
| `open_only` | `boolean` | query | No | When true, only open (non-terminal) todos. |
| `all` | `boolean` | query | No | When true, include archived todos. Closed todos are listed without it. |
| `sort` | `"default" \| "closed_at"` | query | No | List order. `default` (or omitted): open todos first, then priority, rank, number. `closed_at`: closed todos by `closed_at`, newest first; todos without a `closed_at` follow in the default order. Any other value is 400. |
| `agentRealm` | `"global" \| "all" \| (string & {})` | query `realm` | No | The realm to list: "global" (todos not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |

**HTTP:** `GET /api/v1/agent/todos`
**CLI:** `hoody agent todos list`

---

#### `listAll` — List todos. (collect all pages)

```typescript
client.agent.todos.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<AgentTodosListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/todos`
**CLI:** `hoody agent todos list`

---

#### `listIterator` — List todos. (async iterator)

```typescript
client.agent.todos.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<AgentTodosListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/todos`
**CLI:** `hoody agent todos list`

---

#### `purgeArchived` — Purge archived todos.

```typescript
client.agent.todos.purgeArchived(data?: AgentTodosPurgeArchivedRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `POST /api/v1/agent/todos/purge`
**CLI:** `hoody agent todos archived purge`

---

#### `release` — Release a todo.

```typescript
client.agent.todos.release(id: string, data: AgentTodosReleaseRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ session_id*: string, outcome*: "done" | "blocked" | "failed" | "cancelled", summary: string, question_for_human: string }`

- `session_id` — The session that owns the lease. Required, and must match the value POST /api/v1/agent/todos/{id}/claim leased under; a mismatch is refused.
- `outcome` — How the run ended. done → review; blocked → blocked; failed → ready and increments the attempt counter; cancelled → ready without incrementing it. Required: any other value is rejected.
- `summary` — Short account of what the run did, written to the timeline as the run_end entry (capped at 1024 characters).
- `question_for_human` — A question to surface to the operator alongside the outcome: the field a blocked run uses to say what it needs (capped at 1024 characters).

**HTTP:** `POST /api/v1/agent/todos/{id}/release`
**CLI:** `hoody agent todos release --id <id> --session-id <session-id> --outcome <outcome>`

---

#### `sendMessage` — Comment + run an orchestrator turn.

```typescript
client.agent.todos.sendMessage(id: string, data: AgentTodosSendMessageRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ text*: string }`

**HTTP:** `POST /api/v1/agent/todos/{id}/message`
**CLI:** `hoody agent todos messages send --id <id> --text <text>`

---

#### `snooze` — Snooze a todo.

```typescript
client.agent.todos.snooze(id: string, data: AgentTodosSnoozeRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ wake_at*: string, revision*: int }`

- `revision` — The TODO's own current `revision` (from GET /api/v1/agent/todos/{id}); a stale value is rejected.

**HTTP:** `POST /api/v1/agent/todos/{id}/snooze`
**CLI:** `hoody agent todos snooze --id <id> --wake-at <wake-at> --revision <revision>`

---

#### `start` — Run a todo's orchestrator.

```typescript
client.agent.todos.start(id: string, data?: AgentTodosStartRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `POST /api/v1/agent/todos/{id}/run`
**CLI:** `hoody agent todos start --id <id>`

---

#### `triage` — Run an LLM triage pass.

```typescript
client.agent.todos.triage(data?: AgentTodosTriageRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `POST /api/v1/agent/todos/triage`
**CLI:** `hoody agent todos triage`

---

#### `update` — Update a todo (CAS).

```typescript
client.agent.todos.update(id: string, data: AgentTodosUpdateRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ revision*: int, title: string, body: string, state: "inbox" | "ready" | "blocked" | "review" | "done" | "dropped", priority: int, rank: int, tags: string[], cwd: string, automation: "" | "inherit" | "manual" | "triage" | "full", suggested_agent: string, needs_human: bool, question_for_human: string, blocked_reason: string, wake_at: string, reason: string }`

- `revision` — The TODO's own current `revision` (from GET /api/v1/agent/todos/{id}, NOT the store-wide revision); a stale value is rejected.
- `title` — New title. Longer input is not rejected: the title is cut to its first 200 Unicode code points before it is stored.
- `body` — New body. Longer input is not rejected: the body is cut to its first 1,024 Unicode code points before it is stored.
- `state` — … Any other move is 400 bad_request ("invalid transition <from> → <to>"), and so is any update to an archived todo, whatever its revision. Otherwise the revision is checked first: a stale one is 409 todo_conflict whatever the state. …
- `tags` — New tag set. Each is trimmed of whitespace and a leading #, cut to 40 code points; empty and duplicate tags are dropped, and at most 12 are kept.
- `automation` — New automation level: inherit (follow the project or global setting), manual (never act on its own), triage (triage only, never run) or full (triage and run). An empty string leaves the level unchanged; any other string is 400 bad_request.
- `wake_at` — Snooze the todo until this RFC 3339 time, or send an empty string to clear the snooze. Any other text, or a value that is not a string (null included), is 400 bad_request. …

**HTTP:** `PATCH /api/v1/agent/todos/{id}`
**CLI:** `hoody agent todos update --id <id> --revision <revision>`

---

### `client.agent.workflows` (11) — Multi-step workflow definitions and runs

#### `delete` — Delete a workflow definition.

```typescript
client.agent.workflows.delete(name: string, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `DELETE /api/v1/agent/workflows/{name}`
**CLI:** `hoody agent workflows delete --name <name>`

---

#### `get` — Read one workflow definition.

```typescript
client.agent.workflows.get(name: string, options?: { include_revision?: boolean; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_revision` | `boolean` | query | No | If "true", the tool output's first line is `revision: <opaque>`: pass that value as the PUT /api/v1/agent/workflows/{name} expected_revision to guard against concurrent edits; the JSON below it is unchanged. Strictly parsed: exactly one value, "true" or "false"; anything else (empty, "TRUE", "1", repeated) is a 400 bad_request. |

**HTTP:** `GET /api/v1/agent/workflows/{name}`
**CLI:** `hoody agent workflows get --name <name>`

---

#### `hide` — Hide or un-hide a workflow.

```typescript
client.agent.workflows.hide(name: string, data?: Omit<AgentWorkflowsHideRequest, "hidden">, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Fixed by the method:** the method sets `hidden: true`; do not pass `hidden`.

**HTTP:** `POST /api/v1/agent/workflows/{name}/hide`
**CLI:** `hoody agent workflows hide --name <name>`

---

#### `list` — List workflow definitions.

```typescript
client.agent.workflows.list(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/workflows`
**CLI:** `hoody agent workflows list`

---

#### `listAll` — List workflow definitions. (collect all pages)

```typescript
client.agent.workflows.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<AgentWorkflowsListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/workflows`
**CLI:** `hoody agent workflows list`

---

#### `listIterator` — List workflow definitions. (async iterator)

```typescript
client.agent.workflows.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<AgentWorkflowsListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/workflows`
**CLI:** `hoody agent workflows list`

---

#### `sendMessage` — Send a message to a running workflow.

```typescript
client.agent.workflows.sendMessage(id: string, data?: AgentWorkflowsSendMessageRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ text: string }`

**HTTP:** `POST /api/v1/agent/sessions/{id}/workflow/messages`
**CLI:** `hoody agent workflows messages send --session-id <session-id>`

---

#### `set` — Create or replace a workflow definition.

```typescript
client.agent.workflows.set(name: string, data: AgentWorkflowsSetRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ definition*: object, expected_revision: string, expected_absent: bool }`

- `expected_revision` — … If the stored workflow changed since that read, the upsert is refused with [revision_conflict] and nothing is written. … The revision is bound to the realm this request resolves to: on a gateway without a realm pin, a revision read while another realm was active is refused [revision_conflict] (current_revision is this realm's), never written into the other realm.
- `expected_absent` — Optional create-only guard: refuse with [already_exists] (writing nothing) if any workflow with this name already exists. Use when creating a new workflow that must not overwrite an existing one. Mutually exclusive with expected_revision.

**HTTP:** `PUT /api/v1/agent/workflows/{name}`
**CLI:** `hoody agent workflows set --name <name> --definition <definition>`

---

#### `setSummary` — Set or clear a workflow's summary.

```typescript
client.agent.workflows.setSummary(name: string, data: AgentWorkflowsSetSummaryRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ summary*: string, expected_revision: string }`

- `summary` — The new summary. An empty string clears it. Required: omitting it is a 400, not a clear.
- `expected_revision` — … If the workflow changed or was deleted since that read, the write is refused 409 revision_conflict and nothing is written. … The revision is bound to the realm this request resolves to: on a gateway without a realm pin, a revision read while another realm was active is refused 409 revision_conflict (details.current_revision is this realm's), never written into the other realm.

**HTTP:** `PUT /api/v1/agent/workflows/{name}/summary`
**CLI:** `hoody agent workflows summary set --name <name> --summary <summary>`

---

#### `start` — Run a workflow in a new session.

```typescript
client.agent.workflows.start(name: string, data?: AgentWorkflowsStartRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ prompt: string, inputs: { [key: string]: string }, realm: string, computer: string, cwd: string, config_dir: string, model: string, agent: string, tool_mode: "standard" | "orchestrator", dir_scope: "home" | "full", headless: bool }`

- `inputs` — Optional run-time values for the workflow's DECLARED input parameters (declared name → string value; resolves to $(input.<name>) in every step). A workflow with a REQUIRED declared parameter cannot run without these. Values must be strings; a non-string value is a 400.
- `model` — Model for this session; overrides the chat agent's pinned model for this session only. An unknown model is refused 422 unknown_model; a speech model 422 model_unavailable (details.reason speech_model).
- `tool_mode` — Initial tool mode (frozen at start): standard (the default) or orchestrator. Any other value is refused 400 invalid_tool_mode.
- `dir_scope` — Initial directory-access scope (frozen at start): home or full. Any other value is refused 400 invalid_dir_scope.

**HTTP:** `POST /api/v1/agent/workflows/{name}/runs`
**CLI:** `hoody agent workflows start --name <name>`

---

#### `unhide` — Hide or un-hide a workflow.

```typescript
client.agent.workflows.unhide(name: string, data?: Omit<AgentWorkflowsUnhideRequest, "hidden">, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Fixed by the method:** the method sets `hidden: false`; do not pass `hidden`.

**HTTP:** `POST /api/v1/agent/workflows/{name}/hide`
**CLI:** `hoody agent workflows unhide --name <name>`

---

### `client.agent.acp` (11) — Delegated ACP agent backend

**Shared parameters of `client.agent.acp`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `agent` | `string` | path | Yes | The agent. |

#### `applyCredentialImport` — Copy Claude Code's login to another computer, as previewed.

```typescript
client.agent.acp.applyCredentialImport(agent: string, data: AgentAcpApplyCredentialImportRequest, options?: { agentRealm?: "global" | (string & {}) })
```

**Body:** `{ preview_token*: string, overwrite: bool }`

**HTTP:** `POST /api/v1/agent/acp/agents/{agent}/credential-imports/apply`
**CLI:** `hoody agent acp credentialimports apply --agent <agent> --preview-token <preview-token>`

---

#### `applyFileSync` — Copy Claude Code files to another computer, as previewed.

```typescript
client.agent.acp.applyFileSync(agent: string, data: AgentAcpApplyFileSyncRequest, options?: { agentRealm?: "global" | (string & {}) })
```

**Body:** `{ preview_token*: string, overwrite: string[] }`

**HTTP:** `POST /api/v1/agent/acp/agents/{agent}/file-syncs/apply`
**CLI:** `hoody agent acp filesyncs apply --agent <agent> --preview-token <preview-token>`

---

#### `disable` — Enable or disable a BYOA ACP backend.

```typescript
client.agent.acp.disable(agent: string, data?: Omit<AgentAcpDisableRequest, "enabled">, options?: { agentRealm?: "global" | (string & {}) })
```

**Fixed by the method:** the method sets `enabled: false`; do not pass `enabled`.

**HTTP:** `PUT /api/v1/agent/acp/agents/{agent}/enabled`
**CLI:** `hoody agent acp disable --agent <agent>`

---

#### `enable` — Enable or disable a BYOA ACP backend.

```typescript
client.agent.acp.enable(agent: string, data?: Omit<AgentAcpEnableRequest, "enabled">, options?: { agentRealm?: "global" | (string & {}) })
```

**Fixed by the method:** the method sets `enabled: true`; do not pass `enabled`.

**HTTP:** `PUT /api/v1/agent/acp/agents/{agent}/enabled`
**CLI:** `hoody agent acp enable --agent <agent>`

---

#### `getDefault` — Get the realm's default delegated agent.

```typescript
client.agent.acp.getDefault(options?: { agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/acp/default`

---

#### `getStatus` — Get BYOA ACP backend status.

```typescript
client.agent.acp.getStatus(options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/acp/agents`
**CLI:** `hoody agent acp status`

---

#### `previewCredentialImport` — Preview copying Claude Code's login to another computer.

```typescript
client.agent.acp.previewCredentialImport(agent: string, data: AgentAcpPreviewCredentialImportRequest, options?: { agentRealm?: "global" | (string & {}) })
```

**Body:** `{ source: { kind: "host" | "computer", computer: string }, target_computer*: string }`

- `target_computer` — The id of the computer the files are written to. It must be another computer than the one this agent runs on.

**HTTP:** `POST /api/v1/agent/acp/agents/{agent}/credential-imports`
**CLI:** `hoody agent acp credentialimports preview --agent <agent> --target-computer <target-computer>`

---

#### `previewFileSync` — Preview copying Claude Code files to another computer.

```typescript
client.agent.acp.previewFileSync(agent: string, data: AgentAcpPreviewFileSyncRequest, options?: { agentRealm?: "global" | (string & {}) })
```

**Body:** `{ mode*: "file" | "dir", path*: string, exclude_creds: bool, source: { kind: "host" | "computer", computer: string }, target_computer*: string }`

- `target_computer` — The id of the computer the files are written to. It must be another computer than the one this agent runs on.

**HTTP:** `POST /api/v1/agent/acp/agents/{agent}/file-syncs`
**CLI:** `hoody agent acp filesyncs preview --agent <agent> --mode <mode> --path <path> --target-computer <target-computer>`

---

#### `setDefault` — Set the realm's default delegated agent.

```typescript
client.agent.acp.setDefault(data: AgentAcpSetDefaultRequest, options?: { agentRealm?: "global" | (string & {}) })
```

**Body:** `{ delegated_agent*: "" | "claude" }`

**HTTP:** `PUT /api/v1/agent/acp/default`

---

#### `setModel` — Set a BYOA backend's default model and effort.

```typescript
client.agent.acp.setModel(agent: string, data?: AgentAcpSetModelRequest, options?: { agentRealm?: "global" | (string & {}) })
```

**Body:** `{ model: string, effort: string }`

**HTTP:** `PUT /api/v1/agent/acp/agents/{agent}/model`
**CLI:** `hoody agent acp model set --agent <agent>`

---

#### `setSecret` — Store an ACP per-agent secret value.

```typescript
client.agent.acp.setSecret(agent: string, key: string, data?: AgentAcpSetSecretRequest)
```

**Body:** `{ value: string }`

**HTTP:** `PUT /api/v1/agent/acp/agents/{agent}/secrets/{key}`
**CLI:** `hoody agent acp secrets set --agent <agent> --secret <secret>`

---

### `client.agent.bots.channels` (18) — A Bot's chat channels (Discord, Slack, Telegram)

**Shared parameters of `client.agent.bots.channels`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The bot id. |
| `cid` | `string` | path | Yes | The channel id. |

#### `addPrincipal` — Pair a person with a channel by their user id in the chat app.

```typescript
client.agent.bots.channels.addPrincipal(id: string, cid: string, data: AgentBotsChannelsAddPrincipalRequest, options?: { agentRealm?: "global" | (string & {}) })
```

**Body:** `{ platform_user*: string, name: string, rights: ("chat" | "control" | "gates")[], owner: bool }`

- `owner` — Make them the owner, with every right; the previous owner stops being one. Omit rights with owner true: a rights list, even an empty one, is 400 bad_request. Only once the channel has an owner: the first owner pairs with an owner code (409 owner_needs_pairing).

**HTTP:** `POST /api/v1/agent/bots/{id}/channels/{cid}/principals`
**CLI:** `hoody agent bots channels principals add --id <id> --channel-id <channel-id> --platform-user <platform-user>`

---

#### `cancelPairing` — Cancel a channel's pairing code.

```typescript
client.agent.bots.channels.cancelPairing(id: string, cid: string, options?: { agentRealm?: "global" | (string & {}) })
```

**HTTP:** `DELETE /api/v1/agent/bots/{id}/channels/{cid}/pairing`
**CLI:** `hoody agent bots channels pairing cancel --id <id> --channel-id <channel-id>`

---

#### `create` — Connect a Bot to a chat app.

```typescript
client.agent.bots.channels.create(id: string, data: AgentBotsChannelsCreateRequest, options?: { idempotencyKey?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `idempotencyKey` | `string` | header `Idempotency-Key` | No | Opaque retry key (1–255 printable ASCII, no whitespace). The same create sent again with the same key returns its channel; the same key with a different body is 422. |

**Body:** `{ kind*: "discord" | "slack" | "telegram", label: string, token*: string, app_token: string, settings: { allowed_chats: string[]|null, blocked_chats: string[]|null, blocked_users: string[]|null, channel_lease: bool|null, chat_commands: ("status" | "stop" | "bind" | "unbind" | "help")[]|null, command_denied_reply: "hint" | "silent"|null, command_prefix: "!" | "." | ";" | "~" | "/"|null, connection_opens_per_hour: int|null, decide_in_groups: bool|null, default_rights: ("chat" | "control" | "gates")[]|null, delivery_expiry_hours: int|null, dm_policy: "owner" | "allowlist" | "pairing" | "open"|null, enabled: bool|null, format: "rich" | "plain"|null, gate_cards: "on" | "links" | "off"|null, gate_deciders: "none" | "owner" | "named" | "principals"|null, gate_detail: "summary" | "minimal"|null, gate_ttl_minutes: int|null, group_mode: "off" | "owner_approves" | "allowlist" | "open"|null, hide_secrets: bool|null, identify_per_day: int|null, identify_per_hour: int|null, lang: "en" | "de" | "fr" | "es" | "pt" | "it" | "ja" | "zh"|null, max_parts: int|null, max_principals: int|null, max_text_bytes: int|null, mention_only: bool|null, mirror_other_doors: bool|null, no_reply_notice: bool|null, outbound_rate: number|null, overflow_note: bool|null, pairing_code_burn_tries: int|null, pairing_rights: ("chat" | "control" | "gates")[]|null, pairing_ttl_minutes: int|null, pairing_user_burn_minutes: int|null, pairing_user_burn_tries: int|null, parse_mode: "html" | "plain"|null, part_chars: int|null, push_detail: "brief" | "full"|null, push_events: ("report" | "gate" | "gone" | "stop" | "waiter" | "limit" | "budget" | "error" | "provider" | "not_sent" | "reset")[]|null, rate_chat_per_min: int|null, rate_user_per_day: int|null, rate_user_per_hour: int|null, rate_user_per_min: int|null, reconnect_backoff_max_seconds: int|null, reply_style: "thread" | "reply" | "plain"|null, show_sender_name: bool|null, split_at: "paragraph" | "line" | "word"|null, typing: bool|null, unpaired_reply: "hint" | "silent"|null, wake_replies: bool|null }, delete_webhook: bool, enrolment: { make_home: bool } }`

- `app_token` — Slack only, required there: the app-level token (xapp-).
- `settings` — Settings for the new channel; the rest inherit. Unknown names are refused. home_chat is set later by an update, once the chat exists.
- `delete_webhook` — Telegram only: remove the bot's webhook if one is set, also for a channel created off. Refused 409 channel_conflict (reason bot_paused) while the Bot's channels are paused. Default false.

**HTTP:** `POST /api/v1/agent/bots/{id}/channels`
**CLI:** `hoody agent bots channels create --id <id> --kind <kind> --bot-token <bot-token>`

---

#### `createPairing` — Make a pairing code for a channel.

```typescript
client.agent.bots.channels.createPairing(id: string, cid: string, data?: AgentBotsChannelsCreatePairingRequest, options?: { agentRealm?: "global" | (string & {}) })
```

**Body:** `{ rights: ("chat" | "control" | "gates")[], make_home: bool, owner: bool }`

- `rights` — What the person may do: chat, control, gates. Omitted or empty: the channel's pairing_rights; when those are empty too, the code is refused 400 bad_request. With owner true, omit rights or send an empty list.

**HTTP:** `POST /api/v1/agent/bots/{id}/channels/{cid}/pairing`
**CLI:** `hoody agent bots channels pairing create --id <id> --channel-id <channel-id>`

---

#### `delete` — Delete one of a Bot's chat channels.

```typescript
client.agent.bots.channels.delete(id: string, cid: string, options?: { agentRealm?: "global" | (string & {}) })
```

**HTTP:** `DELETE /api/v1/agent/bots/{id}/channels/{cid}`
**CLI:** `hoody agent bots channels delete --id <id> --channel-id <channel-id>`

---

#### `deleteChat` — Forget a chat.

```typescript
client.agent.bots.channels.deleteChat(id: string, cid: string, chat: string, options?: { agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `chat` | `string` | path | Yes | The chat. |

**HTTP:** `DELETE /api/v1/agent/bots/{id}/channels/{cid}/chats/{chat}`
**CLI:** `hoody agent bots channels chats delete --id <id> --channel-id <channel-id> --chat-id <chat-id>`

---

#### `get` — Get one of a Bot's chat channels.

```typescript
client.agent.bots.channels.get(id: string, cid: string, options?: { agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/bots/{id}/channels/{cid}`
**CLI:** `hoody agent bots channels get --id <id> --channel-id <channel-id>`

---

#### `getSettings` — Get a Bot's channel-wide settings.

```typescript
client.agent.bots.channels.getSettings(id: string, options?: { agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/bots/{id}/channel-settings`
**CLI:** `hoody agent bots channels settings get --id <id>`

---

#### `getSetup` — How to get the credentials of a chat app.

```typescript
client.agent.bots.channels.getSetup(id: string, options: { kind: "discord" | "slack" | "telegram"; name?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `kind` | `"discord" \| "slack" \| "telegram"` | query | Yes | The chat app. |
| `name` | `string` | query | No | Optional name of the bot account to be created, echoed back. |

**HTTP:** `GET /api/v1/agent/bots/{id}/channels/setup`
**CLI:** `hoody agent bots channels setup get --id <id> --kind <kind>`

---

#### `list` — List a Bot's chat channels.

```typescript
client.agent.bots.channels.list(id: string, options?: { page?: number; limit?: number; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No | Maximum items per page, at most 8: 0 or omitted means 8, and a larger value is served as 8 (meta.limit echoes the value used). |

**HTTP:** `GET /api/v1/agent/bots/{id}/channels`
**CLI:** `hoody agent bots channels list --id <id>`

---

#### `listAll` — List a Bot's chat channels. (collect all pages)

```typescript
client.agent.bots.channels.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<AgentBotsChannelsListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/bots/{id}/channels`
**CLI:** `hoody agent bots channels list --id <id>`

---

#### `listIterator` — List a Bot's chat channels. (async iterator)

```typescript
client.agent.bots.channels.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<AgentBotsChannelsListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/bots/{id}/channels`
**CLI:** `hoody agent bots channels list --id <id>`

---

#### `removePrincipal` — Unpair a person.

```typescript
client.agent.bots.channels.removePrincipal(id: string, cid: string, pid: string, options?: { agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `pid` | `string` | path | Yes | The principal id. |

**HTTP:** `DELETE /api/v1/agent/bots/{id}/channels/{cid}/principals/{pid}`
**CLI:** `hoody agent bots channels principals remove --id <id> --channel-id <channel-id> --principal-id <principal-id>`

---

#### `setCredentials` — Replace a channel's credentials.

```typescript
client.agent.bots.channels.setCredentials(id: string, cid: string, data: AgentBotsChannelsSetCredentialsRequest, options?: { agentRealm?: "global" | (string & {}) })
```

**Body:** `{ token*: string, app_token: string }`

**HTTP:** `PUT /api/v1/agent/bots/{id}/channels/{cid}/credentials`
**CLI:** `hoody agent bots channels credentials set --id <id> --channel-id <channel-id> --bot-token <bot-token>`

---

#### `update` — Change one of a Bot's chat channels.

```typescript
client.agent.bots.channels.update(id: string, cid: string, data?: AgentBotsChannelsUpdateRequest, options?: { agentRealm?: "global" | (string & {}) })
```

**Body:** `{ label: string, enabled: bool, home_chat: string|null, delete_webhook: bool, settings: { allowed_chats: string[]|null, blocked_chats: string[]|null, blocked_users: string[]|null, channel_lease: bool|null, chat_commands: ("status" | "stop" | "bind" | "unbind" | "help")[]|null, command_denied_reply: "hint" | "silent"|null, command_prefix: "!" | "." | ";" | "~" | "/"|null, connection_opens_per_hour: int|null, decide_in_groups: bool|null, default_rights: ("chat" | "control" | "gates")[]|null, delivery_expiry_hours: int|null, dm_policy: "owner" | "allowlist" | "pairing" | "open"|null, format: "rich" | "plain"|null, gate_cards: "on" | "links" | "off"|null, gate_deciders: "none" | "owner" | "named" | "principals"|null, gate_detail: "summary" | "minimal"|null, gate_ttl_minutes: int|null, group_mode: "off" | "owner_approves" | "allowlist" | "open"|null, hide_secrets: bool|null, identify_per_day: int|null, identify_per_hour: int|null, lang: "en" | "de" | "fr" | "es" | "pt" | "it" | "ja" | "zh"|null, max_parts: int|null, max_principals: int|null, max_text_bytes: int|null, mention_only: bool|null, mirror_other_doors: bool|null, no_reply_notice: bool|null, outbound_rate: number|null, overflow_note: bool|null, pairing_code_burn_tries: int|null, pairing_rights: ("chat" | "control" | "gates")[]|null, pairing_ttl_minutes: int|null, pairing_user_burn_minutes: int|null, pairing_user_burn_tries: int|null, parse_mode: "html" | "plain"|null, part_chars: int|null, push_detail: "brief" | "full"|null, push_events: ("report" | "gate" | "gone" | "stop" | "waiter" | "limit" | "budget" | "error" | "provider" | "not_sent" | "reset")[]|null, rate_chat_per_min: int|null, rate_user_per_day: int|null, rate_user_per_hour: int|null, rate_user_per_min: int|null, reconnect_backoff_max_seconds: int|null, reply_style: "thread" | "reply" | "plain"|null, show_sender_name: bool|null, split_at: "paragraph" | "line" | "word"|null, typing: bool|null, unpaired_reply: "hint" | "silent"|null, wake_replies: bool|null }, unset: ("dm_policy" | "group_mode" | "mention_only" | "default_rights" | "blocked_users" | "blocked_chats" | "allowed_chats" | "unpaired_reply" | "command_denied_reply" | "pairing_ttl_minutes" | "pairing_rights" | "max_principals" | "pairing_user_burn_tries" | "pairing_user_burn_minutes" | "pairing_code_burn_tries" | "gate_cards" | "gate_deciders" | "decide_in_groups" | "gate_detail" | "gate_ttl_minutes" | "push_events" | "push_detail" | "wake_replies" | "mirror_other_doors" | "typing" | "reply_style" | "format" | "parse_mode" | "part_chars" | "split_at" | "max_parts" | "overflow_note" | "lang" | "show_sender_name" | "no_reply_notice" | "delivery_expiry_hours" | "max_text_bytes" | "rate_user_per_min" | "rate_user_per_hour" | "rate_user_per_day" | "rate_chat_per_min" | "outbound_rate" | "reconnect_backoff_max_seconds" | "identify_per_hour" | "identify_per_day" | "connection_opens_per_hour" | "command_prefix" | "chat_commands" | "hide_secrets" | "channel_lease")[] }`

- `enabled` — Turn the channel on or off. Only here: settings.enabled and unset enabled are refused 400.
- `home_chat` — The chat id updates go to; null removes it. Only here: settings.home_chat and unset home_chat are refused 400.
- `delete_webhook` — Telegram only, with enabled true: remove the bot's webhook. Refused 409 channel_conflict (reason bot_paused) while the Bot's channels are paused and the channel is not running.
- `settings` — Settings to set; null removes one so it inherits. enabled and home_chat are not settable here (400, details.field names the key and details.top_level the member to use).
- `unset` — Settings to remove so they inherit, like null in settings. enabled and home_chat are refused 400 (use the top-level members). A name both set and unset is 400.

**HTTP:** `PATCH /api/v1/agent/bots/{id}/channels/{cid}`
**CLI:** `hoody agent bots channels update --id <id> --channel-id <channel-id>`

---

#### `updateChat` — Approve, mute or configure a chat.

```typescript
client.agent.bots.channels.updateChat(id: string, cid: string, chat: string, data?: AgentBotsChannelsUpdateChatRequest, options?: { agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `chat` | `string` | path | Yes | The chat. |

**Body:** `{ state: "approved" | "muted", acknowledge_group_readers: bool, settings: { format: "rich" | "plain"|null, mention_only: bool|null, rate_chat_per_min: int|null, rate_user_per_day: int|null, rate_user_per_hour: int|null, rate_user_per_min: int|null, reply_style: "thread" | "reply" | "plain"|null }, unset: ("mention_only" | "reply_style" | "format" | "rate_user_per_min" | "rate_user_per_hour" | "rate_user_per_day" | "rate_chat_per_min")[] }`

- `acknowledge_group_readers` — Required to approve a group.
- `unset` — Chat settings to remove so they inherit, like null in settings. A name both set and unset is 400.

**HTTP:** `PATCH /api/v1/agent/bots/{id}/channels/{cid}/chats/{chat}`
**CLI:** `hoody agent bots channels chats update --id <id> --channel-id <channel-id> --chat-id <chat-id>`

---

#### `updatePrincipal` — Change a paired person.

```typescript
client.agent.bots.channels.updatePrincipal(id: string, cid: string, pid: string, data?: AgentBotsChannelsUpdatePrincipalRequest, options?: { agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `pid` | `string` | path | Yes | The principal id. |

**Body:** `{ rights: ("chat" | "control" | "gates")[], lang: "en" | "de" | "fr" | "es" | "pt" | "it" | "ja" | "zh"|null, name: string, owner: bool }`

- `owner` — Make them the owner (the previous owner stops being one). Only once the channel has an owner: the first owner comes from pairing (409 owner_needs_pairing).

**HTTP:** `PATCH /api/v1/agent/bots/{id}/channels/{cid}/principals/{pid}`
**CLI:** `hoody agent bots channels principals update --id <id> --channel-id <channel-id> --principal-id <principal-id>`

---

#### `updateSettings` — Change a Bot's channel-wide settings.

```typescript
client.agent.bots.channels.updateSettings(id: string, data?: AgentBotsChannelsUpdateSettingsRequest, options?: { agentRealm?: "global" | (string & {}) })
```

**Body:** `{ channels_paused: bool|null, hide_secrets: bool|null, lang: "en" | "de" | "fr" | "es" | "pt" | "it" | "ja" | "zh"|null, max_channels: int|null, rate_bot_per_day: int|null, shared_identity: "off"|null, unset: ("lang" | "rate_bot_per_day" | "hide_secrets" | "channels_paused" | "shared_identity" | "max_channels")[] }`

- `rate_bot_per_day` — Messages all chat apps of the Bot together may deliver per day (0 = no limit, up to 3000).

**HTTP:** `PATCH /api/v1/agent/bots/{id}/channel-settings`
**CLI:** `hoody agent bots channels settings update --id <id>`

---

### `client.agent.changes` (2) — Changes operations

#### `get` — Change tokens for the Work lists.

```typescript
client.agent.changes.get(options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/changes`
**CLI:** `hoody agent changes get`

---

#### `stream` — Stream the change tokens (SSE).

```typescript
client.agent.changes.stream(options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Returns:** `Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentChangesStreamFrames>>>`  |  **HTTP:** `GET /api/v1/agent/changes/stream`
**CLI:** `hoody agent changes stream`

---

### `client.agent.completions` (1) — One-shot model completions

#### `create` — Run one tool-free model completion.

```typescript
client.agent.completions.create(data: AgentCompletionsCreateRequest, options: { stream: true })  // → Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentCompletionsCreateFrames>>>
client.agent.completions.create(data: AgentCompletionsCreateRequest, options?: { stream?: false })  // → Promise<AgentCompletionsCreateResponse>
client.agent.completions.create(data: AgentCompletionsCreateRequest, options?: { stream?: boolean })  // → Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentCompletionsCreateFrames>>> | Promise<AgentCompletionsCreateResponse>
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `AgentCompletionsCreateRequest` | body | Yes |  |
| `stream` | `boolean` | option | No | Stream the completion as server-sent events. |

**Body:** `{ model*: string, system: string, messages*: { role*: "user" | "assistant", content*: string }[], settings: { thinking: object, temperature: number, max_tokens: int, response_format: object }, timeout_ms: int, max_tokens: int }`

- `model` — … The same policy as a session's model: the provider prefix must be catalogued, the model name after it need not be (an uncatalogued name is sent to the provider, which may reject it as upstream_error). An unknown provider or an empty model name is 422 model_unavailable (reason unknown_model); a fusion/ composite is 422 model_unavailable (reason fusion).
- `messages` — 1 to 1000 turns, oldest first; the last must be a user turn.
- `settings` — Optional per-call model settings. A setting the model cannot honour is 400 unsupported_setting, never dropped.
- `max_tokens` — Alias of settings.max_tokens (output-token cap, 1 to 1000000), accepted at the top level as most chat-completion APIs take it. Sending both with different values is 400 bad_request (details.field max_tokens).

**Returns:** see each form above  |  **HTTP:** `POST /api/v1/agent/completions` (with `stream: true`: `POST /api/v1/agent/completions/stream`)
**CLI:** `hoody agent completions create --model <model> --messages <messages>`

---

### `client.agent.computers` (3) — Computers in a realm

#### `list` — List computers in a realm (for binding).

```typescript
client.agent.computers.list(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/computers`
**CLI:** `hoody agent computers list`

---

#### `listAll` — List computers in a realm (for binding). (collect all pages)

```typescript
client.agent.computers.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<AgentComputersListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). Each item is `{ id: string, name: string, status: string }`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/computers`
**CLI:** `hoody agent computers list`

---

#### `listIterator` — List computers in a realm (for binding). (async iterator)

```typescript
client.agent.computers.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<AgentComputersListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page). Each item is `{ id: string, name: string, status: string }`.  |  **HTTP:** `GET /api/v1/agent/computers`
**CLI:** `hoody agent computers list`

---

### `client.agent.files` (3) — Files that shape the agents

#### `list` — List the files that shape the agents.

```typescript
client.agent.files.list(options?: { page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/agent-files`
**CLI:** `hoody agent files list`

---

#### `listAll` — List the files that shape the agents. (collect all pages)

```typescript
client.agent.files.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<AgentFilesListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/agent-files`
**CLI:** `hoody agent files list`

---

#### `listIterator` — List the files that shape the agents. (async iterator)

```typescript
client.agent.files.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<AgentFilesListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/agent-files`
**CLI:** `hoody agent files list`

---

### `client.agent.fusions` (5) — Fusion composites

#### `delete` — Delete a fusion composite.

```typescript
client.agent.fusions.delete(slug: string, options?: { cwd?: string; configDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `slug` | `string` | path | Yes | The slug. |

**HTTP:** `DELETE /api/v1/agent/settings/fusion/{slug}`
**CLI:** `hoody agent fusions delete --slug <slug>`

---

#### `list` — List fusion composites.

```typescript
client.agent.fusions.list(options?: { include_invalid?: boolean; page?: number; limit?: number; cwd?: string; configDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_invalid` | `boolean` | query | No | When true, also return composites that failed validation as a top-level `invalid` array beside `items` (each with a reason + raw-file index) so a broken composite is diagnosable. An entry with no usable slug, or a duplicate slug, cannot be deleted through this API: see the operation description. |

**HTTP:** `GET /api/v1/agent/settings/fusion`
**CLI:** `hoody agent fusions list`

---

#### `listAll` — List fusion composites. (collect all pages)

```typescript
client.agent.fusions.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<AgentFusionsListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/settings/fusion`
**CLI:** `hoody agent fusions list`

---

#### `listIterator` — List fusion composites. (async iterator)

```typescript
client.agent.fusions.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<AgentFusionsListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/settings/fusion`
**CLI:** `hoody agent fusions list`

---

#### `set` — Create or update a fusion composite.

```typescript
client.agent.fusions.set(slug: string, data: AgentFusionsSetRequest, options?: { cwd?: string; configDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `slug` | `string` | path | Yes | The slug. |

**Body:** `{ spec*: { name*: string, method*: "best_of_n" | "vote" | "synthesize" | "debate", members*: object[], params: object } }`

**HTTP:** `PUT /api/v1/agent/settings/fusion/{slug}`
**CLI:** `hoody agent fusions set --slug <slug> --spec-name <spec-name> --spec-method <spec-method> --spec-members <spec-members>`

---

### `client.agent.github` (8) — GitHub auth, repos, clone, status, commit, sync, PRs

#### `createIssue` — Open an issue.

```typescript
client.agent.github.createIssue(data: AgentGithubCreateIssueRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ title*: string, body: string }`

- `title` — The issue title (required, non-empty: the daemon refuses an empty title).

**HTTP:** `POST /api/v1/agent/github/issues`
**CLI:** `hoody agent github issues create --title <title>`

---

#### `getDiff` — Read the working-tree diff.

```typescript
client.agent.github.getDiff(options?: { staged?: boolean; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `staged` | `boolean` | query | No | When true, return the STAGED (index) diff (what a commit would record) instead of the unstaged working-tree diff. Defaults to false. Accepts true/1/yes/on; every other value, including an empty one, is false. |

**HTTP:** `GET /api/v1/agent/github/diff`
**CLI:** `hoody agent github diff get`

---

#### `getStatus` — GitHub working-tree status.

```typescript
client.agent.github.getStatus(options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/github/status`
**CLI:** `hoody agent github status`

---

#### `listIssues` — List issues.

```typescript
client.agent.github.listIssues(options: { owner: string; repo: string; state?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `owner` | `string` | query | Yes | Repository owner (user or org login). Required: not derived from the bound checkout; GET /api/v1/agent/github/identity returns it. |
| `repo` | `string` | query | Yes | Repository name without the owner. Required, same source as `owner`. |
| `state` | `string` | query | No | Which issues to return: open (the default when omitted), closed, or all. |

**HTTP:** `GET /api/v1/agent/github/issues`
**CLI:** `hoody agent github issues list --owner <owner> --repo <repo>`

---

#### `popStash` — Restore the most recent stash entry.

```typescript
client.agent.github.popStash(data?: AgentGithubPopStashRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `POST /api/v1/agent/github/stash/pop`
**CLI:** `hoody agent github stash pop`

---

#### `pushStash` — Stash the working tree.

```typescript
client.agent.github.pushStash(data?: AgentGithubPushStashRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `POST /api/v1/agent/github/stash`
**CLI:** `hoody agent github stash push`

---

#### `sync` — Sync (fetch → pull → push).

```typescript
client.agent.github.sync(data?: AgentGithubSyncRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ direction: string, set_upstream: bool, force: bool }`

- `set_upstream` — Optional, default false: PUBLISH the current branch: push it and make it track the same-named branch on its remote. … Refused (502 sync_step_failed, step code upstream_exists) when the branch already tracks a DIFFERENT remote branch; a no-op when it already tracks exactly that one. …
- `force` — Optional, default false. … The lease only refuses when the remote moved since this repository last fetched it, and the full sync fetches first, so on a full sync it protects almost nothing. … Ignored by the fetch and pull legs. Must be a JSON boolean.

**HTTP:** `POST /api/v1/agent/github/sync`
**CLI:** `hoody agent github sync`

---

#### `useAccount` — Switch the active GitHub account.

```typescript
client.agent.github.useAccount(data: AgentGithubUseAccountRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ key*: string }`

**HTTP:** `POST /api/v1/agent/github/auth/active`
**CLI:** `hoody agent github accounts use --key <key>`

---

### `client.agent.github.auth` (5) — GitHub sign-in

#### `getStatus` — GitHub auth status.

```typescript
client.agent.github.auth.getStatus(options?: { agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/github/auth/status`
**CLI:** `hoody agent github auth status`

---

#### `login` — Sign in to GitHub with a personal access token (body token, required); the call ends signed in.

```typescript
client.agent.github.auth.login(data: AgentGithubAuthLoginRequest & Required<Pick<AgentGithubAuthLoginRequest, "token">>, options?: { agentRealm?: "global" | (string & {}) })
```

**Body:** `{ token*: string, host: string, activate: bool }`

- `host` — GitHub host for GitHub Enterprise (GHES); defaults to github.com. On the device flow it must match the host on the subsequent poll call; a login with a `token` completes in this one call.
- `activate` — Whether the linked account becomes the ACTIVE one. … A non-boolean value is rejected.

**HTTP:** `POST /api/v1/agent/github/auth/login`
**CLI:** `hoody agent github auth login --github-token <github-token>`

---

#### `logout` — Remove a linked GitHub account.

```typescript
client.agent.github.auth.logout(data: AgentGithubAuthLogoutRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ key*: string }`

**HTTP:** `POST /api/v1/agent/github/auth/logout`
**CLI:** `hoody agent github auth logout --key <key>`

---

#### `poll` — Poll a GitHub device-flow login to completion.

```typescript
client.agent.github.auth.poll(data: AgentGithubAuthPollRequest, options?: { agentRealm?: "global" | (string & {}) })
```

**Body:** `{ host: string, device_code*: string, interval: int, expires_in: int, activate: bool }`

- `host` — The GitHub host (default github.com); must match the start call.

**HTTP:** `POST /api/v1/agent/github/auth/login/poll`
**CLI:** `hoody agent github auth poll --device-code <device-code>`

---

#### `start` — Start a GitHub device-flow login: answers the user code and verification URL; finish with auth.poll().

```typescript
client.agent.github.auth.start(data?: Omit<AgentGithubAuthStartRequest, "token">, options?: { agentRealm?: "global" | (string & {}) })
```

**Body:** `{ host: string, activate: bool }`

- `host` — GitHub host for GitHub Enterprise (GHES); defaults to github.com. On the device flow it must match the host on the subsequent poll call; a login with a `token` completes in this one call.
- `activate` — Whether the linked account becomes the ACTIVE one. … A non-boolean value is rejected.

**Fixed by the method:** do not pass `token`.

**HTTP:** `POST /api/v1/agent/github/auth/login`
**CLI:** `hoody agent github auth start`

---

### `client.agent.github.branches` (5) — GitHub branches

#### `create` — Create a branch.

```typescript
client.agent.github.branches.create(data: AgentGithubBranchesCreateRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ branch*: string }`

- `branch` — The new branch name (required). Validated as a safe ref name before it reaches git: a leading dash, a whitespace/control character, or a name git itself would reject is refused with a 400.

**HTTP:** `POST /api/v1/agent/github/branch`
**CLI:** `hoody agent github branches create --branch <branch>`

---

#### `delete` — Force-delete a local branch.

```typescript
client.agent.github.branches.delete(data: AgentGithubBranchesDeleteRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ branch*: string }`

- `branch` — The local branch name (required), as GET /api/v1/agent/github/branches reports it. Passed after `--`, so it is never read as an option.

**HTTP:** `POST /api/v1/agent/github/branch/delete`
**CLI:** `hoody agent github branches delete --branch <branch>`

---

#### `getRemote` — Read a branch's head on GitHub.

```typescript
client.agent.github.branches.getRemote(options: { owner: string; repo: string; branch: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `owner` | `string` | query | Yes | Repository owner (user or org login), e.g. "octocat". Required: it is NOT derived from the bound checkout; GET /api/v1/agent/github/identity returns it. |
| `repo` | `string` | query | Yes | Repository name without the owner, e.g. "Hello-World". Required, same source as `owner`. |
| `branch` | `string` | query | Yes | Branch name without refs/heads/, e.g. "feature/login". Required; matched exactly, never as a prefix. |

**HTTP:** `GET /api/v1/agent/github/remote-branch`
**CLI:** `hoody agent github branches remote get --owner <owner> --repo <repo> --branch <branch>`

---

#### `list` — List GitHub branches.

```typescript
client.agent.github.branches.list(options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/github/branches`
**CLI:** `hoody agent github branches list`

---

#### `use` — Switch to an existing branch.

```typescript
client.agent.github.branches.use(data: AgentGithubBranchesUseRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ branch*: string }`

- `branch` — An existing branch name (required), as GET /api/v1/agent/github/branches reports it. Validated as a safe ref name; the switch fails rather than creating a branch that does not exist.

**HTTP:** `POST /api/v1/agent/github/branch/switch`
**CLI:** `hoody agent github branches use --branch <branch>`

---

### `client.agent.github.commits` (3) — GitHub commits

#### `create` — Stage all and commit.

```typescript
client.agent.github.commits.create(data: AgentGithubCommitsCreateRequest, options: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}); push: true })  // → Promise<AgentGithubCommitsCreateResponse>
client.agent.github.commits.create(data: { message: string }, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}); push?: false })  // → Promise<{ statusCode: number; message: string; data: Record<string, unknown> }>
client.agent.github.commits.create(data: { message: string }, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}); push?: boolean })  // → Promise<AgentGithubCommitsCreateResponse> | Promise<{ statusCode: number; message: string; data: Record<string, unknown> }>
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `AgentGithubCommitsCreateRequest` | body | Yes |  |
| `push` | `boolean` | option | No | Stage, commit and push in one call. |

**Body:** `{ message*: string }`

**Returns:** see each form above  |  **HTTP:** `POST /api/v1/agent/github/commit` (with `push: true`: `POST /api/v1/agent/github/commit/push`)
**CLI:** `hoody agent github commits create --message <message>`

---

#### `list` — Read recent commit history.

```typescript
client.agent.github.commits.list(options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/github/log`
**CLI:** `hoody agent github commits list`

---

#### `suggestMessage` — Draft a commit message with a model.

```typescript
client.agent.github.commits.suggestMessage(data: AgentGithubCommitsSuggestMessageRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ model*: string }`

- `model` — A concrete model spec, e.g. "anthropic/claude-sonnet-4-6" (required). A fusion/ composite cannot back a one-shot call and is refused.

**HTTP:** `POST /api/v1/agent/github/commit/suggest-message`
**CLI:** `hoody agent github commits message suggest --model <model>`

---

### `client.agent.github.prs` (4) — GitHub pull requests

#### `checkout` — Check out a pull request.

```typescript
client.agent.github.prs.checkout(data: AgentGithubPrsCheckoutRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ number*: string | int }`

- `number` — The PR number (required): a positive decimal string such as "42", or the JSON integer GET /api/v1/agent/github/pr returns. An empty value, 0, a fraction, a negative or anything non-numeric is refused, so a branch name or URL can never be smuggled in as a target.

**HTTP:** `POST /api/v1/agent/github/pr/checkout`
**CLI:** `hoody agent github prs checkout --number <number>`

---

#### `create` — Open a pull request.

```typescript
client.agent.github.prs.create(data: AgentGithubPrsCreateRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ title*: string, body: string, base: string }`

- `title` — The PR title (required, non-empty).

**HTTP:** `POST /api/v1/agent/github/pr`
**CLI:** `hoody agent github prs create --title <title>`

---

#### `list` — List pull requests.

```typescript
client.agent.github.prs.list(options: { owner: string; repo: string; state?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `owner` | `string` | query | Yes | Repository owner (user or org login), e.g. "octocat". Required: it is NOT derived from the bound checkout; GET /api/v1/agent/github/identity returns it. |
| `repo` | `string` | query | Yes | Repository name without the owner, e.g. "Hello-World". Required, same source as `owner`. |
| `state` | `string` | query | No | Which pull requests to return: open (the default when omitted), closed, or all. An unrecognized value is passed through to GitHub, which rejects it. |

**HTTP:** `GET /api/v1/agent/github/pr`
**CLI:** `hoody agent github prs list --owner <owner> --repo <repo>`

---

#### `merge` — Merge a pull request.

```typescript
client.agent.github.prs.merge(data: AgentGithubPrsMergeRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ number*: string | int, method: "merge" | "squash" | "rebase" }`

- `number` — The PR number (required): a positive decimal string such as "42", or the JSON integer GET /api/v1/agent/github/pr returns. Anything else (0, a fraction, a branch name or URL) is refused, so the merge can never target a different PR.

**HTTP:** `POST /api/v1/agent/github/pr/merge`
**CLI:** `hoody agent github prs merge --number <number>`

---

### `client.agent.github.repos` (4) — GitHub repositories

#### `clone` — Clone a GitHub repository.

```typescript
client.agent.github.repos.clone(data?: AgentGithubReposCloneRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ repo: string, dir: string, clone_root: string, full_name: string, clone_url: string, shallow: bool, flat: bool, persist_credentials: bool }`

- `full_name` — Canonical "owner/name" (alternative to `repo`; used as-is when supplied, taking precedence over a derived value). Requires clone_url.
- `clone_url` — Canonical https clone URL (alternative to `repo`; re-validated against the active account host; takes precedence over a derived value). Requires full_name.
- `flat` — Optional, default false. true clones to <root>/<name> instead of <root>/<owner>/<name>. An existing checkout at that path is reused only when its origin is the same repository; anything else there is refused. Must be a JSON boolean.
- `persist_credentials` — … Must be a JSON boolean.

**HTTP:** `POST /api/v1/agent/github/clone`
**CLI:** `hoody agent github repos clone`

---

#### `list` — List GitHub repos.

```typescript
client.agent.github.repos.list(options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/github/repos`
**CLI:** `hoody agent github repos list`

---

#### `resolve` — Resolve the bound repository's owner/name.

```typescript
client.agent.github.repos.resolve(options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/github/identity`
**CLI:** `hoody agent github repos resolve`

---

#### `setCredentials` — Re-write a checkout's GitHub credential.

```typescript
client.agent.github.repos.setCredentials(data?: AgentGithubReposSetCredentialsRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `POST /api/v1/agent/github/repo/reconnect`
**CLI:** `hoody agent github repos credentials set`

---

### `client.agent.github.worktrees` (3) — Linked worktrees

#### `create` — Add a linked worktree.

```typescript
client.agent.github.worktrees.create(data: AgentGithubWorktreesCreateRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ path*: string, branch: string, start_ref: string }`

- `path` — Where to create the worktree (required). Lexically validated and checked against the session's deny list before git runs; a traversing or deny-listed path is refused with a 400. Must not already exist as a non-empty directory.

**HTTP:** `POST /api/v1/agent/github/worktrees`
**CLI:** `hoody agent github worktrees create --path <path>`

---

#### `delete` — Remove a linked worktree.

```typescript
client.agent.github.worktrees.delete(data: AgentGithubWorktreesDeleteRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ path*: string, force: bool }`

- `path` — The worktree's path (required), as GET /api/v1/agent/github/worktrees reports it. Must not be the main checkout.
- `force` — Optional, default false. Removes the worktree EVEN WITH uncommitted or untracked changes (git worktree remove --force), DISCARDING them: they are not stashed and cannot be recovered. Must be a JSON boolean.

**HTTP:** `POST /api/v1/agent/github/worktrees/remove`
**CLI:** `hoody agent github worktrees delete --path <path>`

---

#### `list` — List linked worktrees.

```typescript
client.agent.github.worktrees.list(options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/github/worktrees`
**CLI:** `hoody agent github worktrees list`

---

### `client.agent.kit` (3) — Health, metrics, and operational endpoints

#### `getHealth` — Standardized health check.

```typescript
client.agent.kit.getHealth()
```

**HTTP:** `GET /api/v1/agent/health`
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
client.agent.kit.getVersion()
```

**HTTP:** `GET /api/v1/agent/version`
**CLI:** `hoody agent version`

---

### `client.agent.logs` (6) — Structured log query and read

**Shared parameters of `client.agent.logs`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `min_level` | `string` | query | No | Minimum log level (debug\|info\|warn\|error). |
| `comp` | `string` | query | No | Component filter (daemon source). |
| `text` | `string` | query | No | Case-insensitive substring filter over message+attrs. |
| `event` | `string` | query | No | Session lifecycle event filter (session source). |
| `tool` | `string` | query | No | Tool name filter (tool source). |
| `model` | `string` | query | No | Model filter (llm source). |
| `status` | `string` | query | No | Tool outcome filter: ok\|error\|cancelled (tool source). |
| `level` | `string` | query | No | Filter to a minimum log level (debug\|info\|warn\|error); the same filter as min_level. |

#### `export` — Export logs as a downloadable file.

```typescript
client.agent.logs.export(options?: { source?: string; min_level?: string; comp?: string; session_id?: string; text?: string; since?: string; until?: string; event?: string; tool?: string; model?: string; status?: string; method?: string; min_status?: number; max_status?: number; errors_only?: boolean; event_type?: string; resource_type?: string; computer?: string; kind?: string; host?: string; since_seq?: number; limit?: number; format?: string; filename?: string; cwd?: string; configDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source` | `string` | query | No | Log source to export (see GET /api/v1/agent/logs/sources; one local source, one platform source, or omitted for all local sources). |
| `session_id` | `string` | query | No | Session id filter. |
| `since` | `string` | query | No | Lower time bound (RFC3339 or relative like 1h/7d). |
| `until` | `string` | query | No | Upper time bound (RFC3339 or relative). |
| `method` | `string` | query | No | HTTP method filter (activity source). |
| `min_status` | `number` | query | No | Minimum HTTP status (activity source). |
| `max_status` | `number` | query | No | Maximum HTTP status (activity source). |
| `errors_only` | `boolean` | query | No | Only error rows (activity source; true/false). |
| `event_type` | `string` | query | No | Event type filter (events source). |
| `resource_type` | `string` | query | No | Resource type filter (events source). |
| `computer` | `string` | query | No | Computer filter (proxy source; empty = all running realm computers). Maps to the daemon's computer_id filter. |
| `kind` | `string` | query | No | Proxy row kind: request\|response\|event (proxy source). |
| `host` | `string` | query | No | Proxy URL host filter (exact or dot-aligned suffix). |
| `since_seq` | `number` | query | No | Exclusive lower seq bound for incremental exports (local sources). |
| `limit` | `number` | query | No | TOTAL row cap across the export (local sources default: everything the snapshot matches). A platform source exports one query page: it asks for this many rows (2000 when omitted) and gets at most the source's own page maximum (activity 100, events 500); proxy with no computer merges the running computers' pages up to this cap. |
| `format` | `string` | query | No | Export format: jsonl (default) or txt. |
| `filename` | `string` | query | No | Download filename override (reduced to a safe basename). |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `GET /api/v1/agent/logs/export`
**CLI:** `hoody agent logs export`

---

#### `get` — Read a log entry.

```typescript
client.agent.logs.get(ref: string, options?: { cwd?: string; configDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `ref` | `string` | path | Yes | The ref. |

**HTTP:** `GET /api/v1/agent/logs/entries/{ref}`
**CLI:** `hoody agent logs get --ref <ref>`

---

#### `getStats` — Log statistics.

```typescript
client.agent.logs.getStats(options?: { source?: string; level?: string; run_id?: string; bucket?: string; min_level?: string; comp?: string; session_id?: string; text?: string; since?: string; until?: string; event?: string; tool?: string; model?: string; status?: string; cwd?: string; configDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source` | `string` | query | No | Count one local source (daemon\|tool\|session\|llm); omitted, every local source. A platform source is rejected 400. |
| `run_id` | `string` | query | No | Only entries correlated with this workflow/task run id. |
| `bucket` | `string` | query | No | Histogram step: minute (the default) or hour. |
| `session_id` | `string` | query | No | Session id filter. |
| `since` | `string` | query | No | Lower time bound (RFC3339 or relative like 1h/7d). |
| `until` | `string` | query | No | Upper time bound (RFC3339 or relative). |

**HTTP:** `GET /api/v1/agent/logs/stats`
**CLI:** `hoody agent logs stats`

---

#### `list` — Query logs.

```typescript
client.agent.logs.list(options?: { source?: string; level?: string; session_id?: string; run_id?: string; since?: string; until?: string; since_seq?: number; before_seq?: number; limit?: number; min_level?: string; comp?: string; text?: string; event?: string; tool?: string; model?: string; status?: string; method?: string; min_status?: number; max_status?: number; errors_only?: boolean; event_type?: string; resource_type?: string; computer?: string; kind?: string; host?: string; cwd?: string; configDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source` | `string` | query | No | Filter to a log source/facet (see GET /api/v1/agent/logs/sources). One local source, or exactly ONE platform source (activity\|events\|proxy); mixing them is rejected. |
| `session_id` | `string` | query | No | Only entries correlated with this session id (exact match on the entry's session_id). |
| `run_id` | `string` | query | No | Only entries correlated with this workflow/task run id (exact match on the entry's run_id). |
| `since` | `string` | query | No | Lower TIME bound: RFC3339, or a relative duration like "1h"/"30m"/"7d". This is NOT a cursor: a bare non-zero number is rejected 400 (use since_seq); 0, +0 and -0 mean now. Unparseable values are rejected the same way. |
| `until` | `string` | query | No | Upper TIME bound, same forms as since. Paging BACKWARDS by repeatedly lowering until works, but it is coarse (rows sharing a timestamp repeat); before_seq is the exact backwards cursor. |
| `since_seq` | `number` | query | No | Forward cursor: return only entries NEWER than this gateway seq. A page holds the NEWEST matches up to limit: when more than limit rows matched since the cursor, the older ones are not returned and latest_seq moves past them. To follow the log use GET /api/v1/agent/logs/stream (it resumes from since_seq, oldest first, and sends a `lagged` event with `replay_gap` when entries were evicted before it could read them: reconcile from the `min_seq` it carries); to read history, page backwards with before_seq. A non-numeric value is rejected 400. |
| `before_seq` | `number` | query | No | Backward cursor: return only entries OLDER than this seq. Take it from the SEQ OF THE OLDEST ENTRY THIS PAGE RETURNED, not from oldest_seq, which is the oldest sequence still retained in the ring and is usually far older than the page you just read. Paging back from oldest_seq jumps past every entry in between and returns an empty page, which reads as "history exhausted" when it is not. A non-numeric value is rejected 400. |
| `limit` | `number` | query | No | Caps this page. Local sources: omitted it is 200; ANY explicit value is clamped to the ring maximum of 500, and limit=0 means 500 rather than 200: a caller that needs more than 500 rows pages backwards with before_seq. activity takes at most 100 (default 50) and events at most 500 (default 100). A non-numeric value is rejected 400. |
| `method` | `string` | query | No | HTTP method filter (activity source). |
| `min_status` | `number` | query | No | Minimum HTTP status (activity source). |
| `max_status` | `number` | query | No | Maximum HTTP status (activity source). |
| `errors_only` | `boolean` | query | No | Only error rows (activity source; true/false). |
| `event_type` | `string` | query | No | Event type filter (events source). |
| `resource_type` | `string` | query | No | Resource type filter (events source). |
| `computer` | `string` | query | No | Computer filter (proxy source; empty = all running realm computers). Maps to the daemon's computer_id filter. |
| `kind` | `string` | query | No | Proxy row kind: request\|response\|event (proxy source). |
| `host` | `string` | query | No | Proxy URL host filter (exact or dot-aligned suffix). |

**HTTP:** `GET /api/v1/agent/logs`
**CLI:** `hoody agent logs list`

---

#### `listSources` — Log sources.

```typescript
client.agent.logs.listSources(options?: { cwd?: string; configDir?: string })
```

**HTTP:** `GET /api/v1/agent/logs/sources`
**CLI:** `hoody agent logs sources list`

---

#### `stream` — Stream the log tail (SSE).

```typescript
client.agent.logs.stream(options?: { source?: string; level?: string; session_id?: string; run_id?: string; since_seq?: number; limit?: number; min_level?: string; comp?: string; text?: string; event?: string; tool?: string; model?: string; status?: string; cwd?: string; configDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source` | `string` | query | No | Filter the tail to one local source (daemon\|tool\|session\|llm). A platform source is rejected 400. |
| `session_id` | `string` | query | No | Only entries correlated with this session id. |
| `run_id` | `string` | query | No | Only entries correlated with this workflow/task run id. |
| `since_seq` | `number` | query | No | Initial resume cursor (the Last-Event-ID header overrides it). A non-numeric value is rejected 400. |
| `limit` | `number` | query | No | Caps each poll batch. A non-numeric value is rejected 400. |

**Returns:** `Promise<IEventStream<Record<never, string>, ITypedStreamEvent<AgentLogsStreamFrames>>>`  |  **HTTP:** `GET /api/v1/agent/logs/stream`
**CLI:** `hoody agent logs stream`

---

### `client.agent.memory.items` (7) — Memory items

#### `create` — Save a memory item.

```typescript
client.agent.memory.items.create(data: AgentMemoryItemsCreateRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ project*: string, content*: string, type: string, concepts: string[], files: string[], ttl_days: int, strength: int, expect_realm: string }`

- `type` — Memory type: pattern, preference, architecture, bug, workflow or fact. Omitted or empty saves a fact; any other value is REFUSED, as on edit.
- `ttl_days` — … Must be a whole number between -2147483648 and 106751 (about 292 years: the longest expiry the store can represent); a value outside that range is REFUSED, never clamped and never treated as no expiry. A fractional value like 30.5 and a numeric string like "30" are both REFUSED too, never truncated or coerced: a silent coercion to 0 would store the memory with no expiry at all while reporting success.
- `strength` — Initial ranking strength, a whole number from 1 (weakest) to 10 (strongest). Omitted or 0 takes the store's default of 7. Any other value (a negative number, anything above 10, a fractional value or a numeric string) is REFUSED, never coerced and never silently replaced with the default.
- `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The write is refused when it does not name the realm the request acts in (the named realm, else the agent's active realm), so it cannot land in a realm the caller switched away from.

**HTTP:** `POST /api/v1/agent/memory/items`
**CLI:** `hoody agent memory items create --project <project> --content <content>`

---

#### `delete` — Delete a memory item.

```typescript
client.agent.memory.items.delete(data?: AgentMemoryItemsDeleteRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ ids: string[], id: string, name: string, project: string, kind: "memory" | "observation" | "lesson" | "slot", reason: string, expect_realm: string }`

- `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The delete is refused when it does not name the realm the request acts in (the named realm, else the agent's active realm).

**HTTP:** `DELETE /api/v1/agent/memory/items`
**CLI:** `hoody agent memory items delete --id <id>` (or `--ids <ids>` instead of `--id`: one of them is required)

---

#### `get` — Read a memory item.

```typescript
client.agent.memory.items.get(id: string, options?: { project?: string; kind?: "memory" | "lesson" | "slot" | "observation"; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The item id. |
| `project` | `string` | query | No | Project key the memory belongs to. |
| `kind` | `"memory" \| "lesson" \| "slot" \| "observation"` | query | No | The store the record lives in: memory (the default), lesson, slot or observation. |

**HTTP:** `GET /api/v1/agent/memory/items/{id}`
**CLI:** `hoody agent memory items get --id <id>`

---

#### `list` — List memory items.

```typescript
client.agent.memory.items.list(options?: { project?: string; kind?: "memory" | "lesson" | "slot" | "observation"; type?: string; query?: string; page?: number; limit?: number; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `project` | `string` | query | No | Project key to scope the listing to. |
| `kind` | `"memory" \| "lesson" \| "slot" \| "observation"` | query | No | The store to list: memory (the default), lesson, slot or observation. Each answers its own row shape (see items). |
| `type` | `string` | query | No | Memory type to filter by (e.g. workflow, fact). kind=memory ONLY: rejected 400 with a lesson/slot/observation kind. |
| `query` | `string` | query | No | Free-text filter over the records. kind=memory ONLY: rejected 400 with a lesson/slot/observation kind. |
| `page` | `number` | query | No | 1-based page number. |
| `limit` | `number` | query | No | Items per page (1..200). 0 or omitted pages at the 200 ceiling; a value over 200 is clamped to 200. The effective page size is echoed in meta.limit. NOT "no pagination": the daemon never returns an unbounded set. |

**HTTP:** `GET /api/v1/agent/memory/items`
**CLI:** `hoody agent memory items list`

---

#### `listAll` — List memory items. (collect all pages)

```typescript
client.agent.memory.items.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<AgentMemoryItemsListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/memory/items`
**CLI:** `hoody agent memory items list`

---

#### `listIterator` — List memory items. (async iterator)

```typescript
client.agent.memory.items.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<AgentMemoryItemsListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/memory/items`
**CLI:** `hoody agent memory items list`

---

#### `update` — Edit a memory item.

```typescript
client.agent.memory.items.update(id: string, data?: AgentMemoryItemsUpdateRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The item id. |

**Body:** `{ project: string, kind: "memory" | "lesson" | "slot", content: string, type: string, concepts: string[], files: string[], strength: int, ttl_days: int, tier: string, context: string, confidence: number, expect_realm: string }`

- `content` — Replacement content. Applies to every kind, and is REQUIRED for kind=slot (a slot edit with no content is refused; an empty or whitespace-only content deletes the slot, as the delete route does).
- `concepts` — kind=memory: replacement concept tags. The whole list is replaced, and a malformed array is rejected rather than silently truncated.
- `files` — kind=memory: replacement file paths. The whole list is replaced, and a malformed array is rejected rather than silently truncated.
- `strength` — kind=memory: replacement ranking strength, a whole number from 1 (weakest) to 10 (strongest). Any other value (0, a negative number, anything above 10, a fractional value or a numeric string) is REFUSED, never coerced, and the stored strength is left unchanged.
- `ttl_days` — … Must be a whole number between -2147483648 and 106751 (about 292 years: the longest expiry the store can represent); a value outside that range is REFUSED, never clamped, and the stored expiry is left unchanged. A fractional value like 30.5 and a numeric string like "30" are both REFUSED too, never truncated or coerced.
- `expect_realm` — Optional realm assertion: "global" or a 24-hex realm id. The edit is refused when it does not name the realm the request acts in (the named realm, else the agent's active realm).

**HTTP:** `PATCH /api/v1/agent/memory/items/{id}`
**CLI:** `hoody agent memory items update --id <id>`

---

### `client.agent.providers.accounts` (6) — OAuth account pool of a provider

**Shared parameters of `client.agent.providers.accounts`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The provider id. |

#### `add` — Add an OAuth account to a provider's pool.

```typescript
client.agent.providers.accounts.add(id: string, data?: AgentProvidersAccountsAddRequest, options?: { idempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `idempotencyKey` | `string` | header `Idempotency-Key` | No | Opaque retry key (1-255 printable ASCII, no whitespace), minted once per click. A retry with the same key answers the job the first try started, whatever its state, for as long as the agent keeps that job (15 minutes after its last activity, until the agent restarts). |

**Body:** `{ method: string }`

- `method` — The sign-in method: "browser" (the default) or "device_code" (a code entered on the provider's page, for a computer with no browser). Only the methods the provider offers are accepted (400 bad_request with details.field method otherwise).

**HTTP:** `POST /api/v1/agent/providers/{id}/auth/accounts`
**CLI:** `hoody agent providers accounts add --id <id>`

---

#### `list` — List a provider's OAuth account pool.

```typescript
client.agent.providers.accounts.list(id: string, options?: { page?: number; limit?: number })
```

**HTTP:** `GET /api/v1/agent/providers/{id}/auth/accounts`
**CLI:** `hoody agent providers accounts list --id <id>`

---

#### `listAll` — List a provider's OAuth account pool. (collect all pages)

```typescript
client.agent.providers.accounts.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<AgentProvidersAccountsListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). Each item is `{ key*: string, id*: string, label*: string, active*: bool, added_unix_ms*: int, cooldown_until*: int }`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/providers/{id}/auth/accounts`
**CLI:** `hoody agent providers accounts list --id <id>`

---

#### `listIterator` — List a provider's OAuth account pool. (async iterator)

```typescript
client.agent.providers.accounts.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<AgentProvidersAccountsListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page). Each item is `{ key*: string, id*: string, label*: string, active*: bool, added_unix_ms*: int, cooldown_until*: int }`.  |  **HTTP:** `GET /api/v1/agent/providers/{id}/auth/accounts`
**CLI:** `hoody agent providers accounts list --id <id>`

---

#### `remove` — Remove a pooled OAuth account.

```typescript
client.agent.providers.accounts.remove(id: string, key: string)
```

**HTTP:** `DELETE /api/v1/agent/providers/{id}/auth/accounts/{key}`
**CLI:** `hoody agent providers accounts remove --id <id> --account <account>`

---

#### `use` — Make a pooled OAuth account active.

```typescript
client.agent.providers.accounts.use(id: string, key: string, data?: AgentProvidersAccountsUseRequest)
```

**HTTP:** `PUT /api/v1/agent/providers/{id}/auth/accounts/{key}/active`
**CLI:** `hoody agent providers accounts use --id <id> --account <account>`

---

### `client.agent.providers.oauth` (5) — Provider OAuth login

**Shared parameters of `client.agent.providers.oauth`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The provider id. |
| `job` | `string` | path | Yes | The job. |

#### `cancel` — Cancel a provider OAuth login.

```typescript
client.agent.providers.oauth.cancel(id: string, job: string)
```

**HTTP:** `DELETE /api/v1/agent/providers/{id}/auth/oauth/{job}`

---

#### `logout` — Remove a provider's OAuth login.

```typescript
client.agent.providers.oauth.logout(id: string)
```

**HTTP:** `DELETE /api/v1/agent/providers/{id}/auth/oauth`
**CLI:** `hoody agent providers oauth logout --id <id>`

---

#### `poll` — Poll a provider OAuth login.

```typescript
client.agent.providers.oauth.poll(id: string, job: string)
```

**HTTP:** `GET /api/v1/agent/providers/{id}/auth/oauth/{job}`
**CLI:** `hoody agent providers oauth poll --id <id> --job-id <job-id>`

---

#### `start` — Start a provider OAuth login.

```typescript
client.agent.providers.oauth.start(id: string, data?: AgentProvidersOauthStartRequest, options?: { idempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `idempotencyKey` | `string` | header `Idempotency-Key` | No | Opaque retry key (1-255 printable ASCII, no whitespace), minted once per click. A retry with the same key answers the job the first try started, whatever its state, for as long as the agent keeps that job (15 minutes after its last activity, until the agent restarts). |

**Body:** `{ add_account: bool, method: string }`

- `method` — The sign-in method: "browser" (the default) or "device_code" (a code entered on the provider's page, for a computer with no browser). Only the methods the provider offers are accepted (400 bad_request with details.field method otherwise).

**HTTP:** `POST /api/v1/agent/providers/{id}/auth/oauth`
**CLI:** `hoody agent providers oauth start --id <id>`

---

#### `submitCode` — Submit a provider OAuth authorization code.

```typescript
client.agent.providers.oauth.submitCode(id: string, job: string, data: AgentProvidersOauthSubmitCodeRequest)
```

**Body:** `{ code*: string }`

**HTTP:** `POST /api/v1/agent/providers/{id}/auth/oauth/{job}/code`
**CLI:** `hoody agent providers oauth code submit --id <id> --job-id <job-id> --code <code>`

---

### `client.agent.realms` (4) — Realms the agent can bind to

#### `list` — List realms (for binding).

```typescript
client.agent.realms.list(options?: { page?: number; limit?: number; cwd?: string; configDir?: string })
```

**HTTP:** `GET /api/v1/agent/realms`
**CLI:** `hoody agent realms list`

---

#### `listAll` — List realms (for binding). (collect all pages)

```typescript
client.agent.realms.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<AgentRealmsListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). Each item is `string`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/realms`
**CLI:** `hoody agent realms list`

---

#### `listIterator` — List realms (for binding). (async iterator)

```typescript
client.agent.realms.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<AgentRealmsListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page). Each item is `string`.  |  **HTTP:** `GET /api/v1/agent/realms`
**CLI:** `hoody agent realms list`

---

#### `use` — Switch the agent's active realm.

```typescript
client.agent.realms.use(data: AgentRealmsUseRequest)
```

**Body:** `{ realm_id*: string }`

**HTTP:** `PUT /api/v1/agent/hoody/realm`
**CLI:** `hoody agent realms use --id <id>`

---

### `client.agent.scripts` (2) — Scripts operations

#### `deleteInstance` — Delete a managed script.

```typescript
client.agent.scripts.deleteInstance(data: AgentScriptsDeleteInstanceRequest, options?: { idempotencyKey?: string; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `idempotencyKey` | `string` | header `Idempotency-Key` | No | Retry key, required. 1–255 printable ASCII, no whitespace. The same key with the same body returns the first answer with replayed true and does nothing again; the same key with another body is 422 idempotency_key_reused; while the first request still runs it is 409 in_progress. A key whose request was answered, or whose outcome is unknown, is remembered for 24 hours after its last answer or replay; a key whose request is still running is remembered until it ends. When many keys are held, the oldest answered keys are forgotten first; a key whose outcome is unknown is not. Every key is forgotten when the agent restarts. A retry of a remembered unknown outcome, and a request whose key is no longer remembered, are settled from the computer: the first answer comes back, with replayed true, only when the computer shows the request took effect. Otherwise the answer is 503 outcome_unknown, or a definite refusal such as 409 script_exists or path_reserved, because the computer now shows the path held by a script it cannot prove came from this request; that script may still be this request's own earlier effect. While too many keyed requests are unsettled, a new key is 429 idempotency_keys_exhausted and nothing is done. |

**Body:** `{ computer_id*: string, path*: string, if_revision*: string, op_id*: string, keep_copy: bool }`

- `if_revision` — The revision the script must still have (opaque, as the computer reported it).

**HTTP:** `POST /api/v1/agent/script-instances/delete`

---

#### `listInstances` — List a computer's managed scripts.

```typescript
client.agent.scripts.listInstances(options: { computer_id: string; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `computer_id` | `string` | query | Yes | The computer (24-hex computer id). |

**HTTP:** `GET /api/v1/agent/script-instances`

---

### `client.agent.scripts.templates` (3) — Templates operations

#### `get` — Get one script template.

```typescript
client.agent.scripts.templates.get(name: string, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/script-templates/{name}`

---

#### `instantiate` — Make a script from a template.

```typescript
client.agent.scripts.templates.instantiate(name: string, data: AgentScriptsTemplatesInstantiateRequest, options?: { idempotencyKey?: string; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `idempotencyKey` | `string` | header `Idempotency-Key` | No | Retry key, required. 1–255 printable ASCII, no whitespace. The same key with the same body returns the first answer with replayed true and does nothing again; the same key with another body is 422 idempotency_key_reused; while the first request still runs it is 409 in_progress. A key whose request was answered, or whose outcome is unknown, is remembered for 24 hours after its last answer or replay; a key whose request is still running is remembered until it ends. When many keys are held, the oldest answered keys are forgotten first; a key whose outcome is unknown is not. Every key is forgotten when the agent restarts. A retry of a remembered unknown outcome, and a request whose key is no longer remembered, are settled from the computer: the first answer comes back, with replayed true, only when the computer shows the request took effect. Otherwise the answer is 503 outcome_unknown, or a definite refusal such as 409 script_exists or path_reserved, because the computer now shows the path held by a script it cannot prove came from this request; that script may still be this request's own earlier effect. While too many keyed requests are unsettled, a new key is 429 idempotency_keys_exhausted and nothing is done. |

**Body:** `{ computer_id*: string, script_path*: string, vars: object, caller_key: string }`

- `caller_key` — Optional: exactly 43 base64url characters. Callers of the script must present it.

**HTTP:** `POST /api/v1/agent/script-templates/{name}/instantiate`

---

#### `list` — List script templates.

```typescript
client.agent.scripts.templates.list(options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/script-templates`

---

### `client.agent.sessions.approval` (4) — Session approval policy — get, update, rules

**Shared parameters of `client.agent.sessions.approval`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `ifMatch` | `string` | header `If-Match` | No | Conditional-request precondition: the ETag from GET /api/v1/agent/sessions/{id}/approval (a quoted policy revision, e.g. "3") or *. A mismatch is 412 precondition_failed. |

#### `deleteRule` — Remove one session permission rule.

```typescript
client.agent.sessions.approval.deleteRule(id: string, tool: string, options?: { ifMatch?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `tool` | `string` | path | Yes | The tool. |

**HTTP:** `DELETE /api/v1/agent/sessions/{id}/approval/rules/{tool}`
**CLI:** `hoody agent sessions approval rules delete --id <id> --tool <tool>`

---

#### `get` — Read a session's approval policy.

```typescript
client.agent.sessions.approval.get(id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/sessions/{id}/approval`
**CLI:** `hoody agent sessions approval get --id <id>`

---

#### `setRule` — Set one session permission rule.

```typescript
client.agent.sessions.approval.setRule(id: string, tool: string, data: AgentSessionsApprovalSetRuleRequest, options?: { ifMatch?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `tool` | `string` | path | Yes | The tool. |

**Body:** `{ decision*: "allow" | "deny" }`

**HTTP:** `PUT /api/v1/agent/sessions/{id}/approval/rules/{tool}`
**CLI:** `hoody agent sessions approval rules set --id <id> --tool <tool> --decision <decision>`

---

#### `update` — Set a session's approval mode and lock.

```typescript
client.agent.sessions.approval.update(id: string, data?: AgentSessionsApprovalUpdateRequest, options?: { ifMatch?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ mode: "default" | "always", locked: bool }`

**HTTP:** `PUT /api/v1/agent/sessions/{id}/approval`
**CLI:** `hoody agent sessions approval update --id <id>`

---

### `client.agent.sessions.attachments` (3) — Attachment leases that keep a live session alive — claim, renew, release

#### `claim` — Hold a live session (and its parked gate) alive.

```typescript
client.agent.sessions.attachments.claim(id: string, data?: AgentSessionsAttachmentsClaimRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ ttl_ms: int }`

- `ttl_ms` — Requested lifetime in milliseconds (default 15m, capped at 60m).

**HTTP:** `POST /api/v1/agent/sessions/{id}/attachments`
**CLI:** `hoody agent sessions attachments claim --id <id>`

---

#### `release` — Release an attachment lease.

```typescript
client.agent.sessions.attachments.release(id: string, lease_id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `lease_id` | `string` | path | Yes | The lease id. |

**HTTP:** `DELETE /api/v1/agent/sessions/{id}/attachments/{lease_id}`
**CLI:** `hoody agent sessions attachments release --id <id> --lease-id <lease-id>`

---

#### `renew` — Renew an attachment lease.

```typescript
client.agent.sessions.attachments.renew(id: string, lease_id: string, data?: AgentSessionsAttachmentsRenewRequest, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `lease_id` | `string` | path | Yes | The lease id. |

**Body:** `{ ttl_ms: int }`

- `ttl_ms` — New lifetime in milliseconds from now (default 15m, capped at 60m).

**HTTP:** `PATCH /api/v1/agent/sessions/{id}/attachments/{lease_id}`
**CLI:** `hoody agent sessions attachments renew --id <id> --lease-id <lease-id>`

---

### `client.agent.sessions.commands` (5) — Commands sent to a live session (message, interrupt, stop) and their receipts

#### `get` — Get a command's receipt.

```typescript
client.agent.sessions.commands.get(id: string, command_id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `command_id` | `string` | path | Yes | The command id. |

**HTTP:** `GET /api/v1/agent/sessions/{id}/commands/{command_id}`
**CLI:** `hoody agent sessions commands get --id <id> --command-id <command-id>`

---

#### `getByKey` — Read a command by its idempotency key.

```typescript
client.agent.sessions.commands.getByKey(id: string, key: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/sessions/{id}/commands/by-key/{key}`
**CLI:** `hoody agent sessions commands keys get --id <id> --idempotency-key <idempotency-key>`

---

#### `retireKey` — Retire a command key no read found.

```typescript
client.agent.sessions.commands.retireKey(id: string, key: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `POST /api/v1/agent/sessions/{id}/commands/by-key/{key}/retire`
**CLI:** `hoody agent sessions commands keys retire --id <id> --idempotency-key <idempotency-key>`

---

#### `send` — Send a message, an interrupt or a stop to a session.

```typescript
client.agent.sessions.commands.send(id: string, data: AgentSessionsCommandsSendRequest, options?: { idempotencyKey?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `idempotencyKey` | `string` | header `Idempotency-Key` | No | Retry key, required on this route; the SDK and CLI send one automatically. 1–255 printable ASCII, no whitespace. A retry with the same key and command returns the stored receipt and admits nothing; the same key with a different command is 422. The key is remembered while the command waits and for 24 hours after it settled. Past 4096 remembered keys a new key is 429 idempotency_keys_exhausted; a stop is never refused because of the remembered-key limit. |

**Body:** `{ kind*: "message" | "interrupt" | "stop", text: string, close: bool, on_gate: "deny" | "wait", order: int, from: { kind*: "user" | "bot" | "delegate" | "system", id: string }, trigger: "human" | "wake" | "clear" }`

- `text` — The message (message and interrupt: required, non-empty, at most 32 KiB). Delivered verbatim. A stop takes none.
- `order` — Optional, at least 0: a sequence number for your commands. A message or interrupt with a positive order lower than the highest stop order the session has recorded is superseded, whoever sent the stop. 0, or omitting it, skips this check.
- `from` — Optional: who sends it. … Set it only when your client relays a message on someone's behalf (a Bot runtime, a session forwarding to another); a client sending a person's own message leaves it out, which reads as from the user.

**HTTP:** `POST /api/v1/agent/sessions/{id}/commands`
**CLI:** `hoody agent sessions commands send --id <id> --kind <kind>`

---

#### `withdraw` — Take back a queued message.

```typescript
client.agent.sessions.commands.withdraw(id: string, command_id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `command_id` | `string` | path | Yes | The command id. |

**HTTP:** `POST /api/v1/agent/sessions/{id}/commands/{command_id}/withdraw`
**CLI:** `hoody agent sessions commands withdraw --id <id> --command-id <command-id>`

---

### `client.agent.sessions.tasks` (4) — Background task management

#### `cancel` — Cancel a background task.

```typescript
client.agent.sessions.tasks.cancel(id: string, tid: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `tid` | `string` | path | Yes | The task id. |

**HTTP:** `POST /api/v1/agent/sessions/{id}/tasks/{tid}/cancel`
**CLI:** `hoody agent sessions tasks cancel --id <id> --task-id <task-id>`

---

#### `cancelAll` — Cancel all background tasks.

```typescript
client.agent.sessions.tasks.cancelAll(id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `POST /api/v1/agent/sessions/{id}/tasks/cancel`
**CLI:** `hoody agent sessions tasks cancel --all --id <id>`

---

#### `getTranscript` — Read a background task's transcript.

```typescript
client.agent.sessions.tasks.getTranscript(id: string, tid: string, options?: { after_seq?: number; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `tid` | `string` | path | Yes | The task id. |
| `after_seq` | `number` | query | No | Exclusive int64 upsert-poll cursor: entries with seq strictly greater than it, plus any still-OPEN entry regardless of its seq. Omit for the whole transcript (distinct from 0, which skips a closed seq-0 entry). Negative/non-integer = 400. |

**HTTP:** `GET /api/v1/agent/sessions/{id}/tasks/{tid}/transcript`
**CLI:** `hoody agent sessions tasks transcript get --id <id> --task-id <task-id>`

---

#### `list` — List a session's background tasks.

```typescript
client.agent.sessions.tasks.list(id: string, options?: { cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/sessions/{id}/tasks`
**CLI:** `hoody agent sessions tasks list --id <id>`

---

### `client.agent.sessions.tools` (7) — Tool catalogue and gated tool execution

#### `list` — List a session's effective tool set.

```typescript
client.agent.sessions.tools.list(id: string, options?: { page?: number; limit?: number; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/sessions/{id}/tools`
**CLI:** `hoody agent sessions tools list --id <id>`

---

#### `listAll` — List a session's effective tool set. (collect all pages)

```typescript
client.agent.sessions.tools.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<AgentSessionsToolsListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tools`
**CLI:** `hoody agent sessions tools list --id <id>`

---

#### `listIterator` — List a session's effective tool set. (async iterator)

```typescript
client.agent.sessions.tools.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<AgentSessionsToolsListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tools`
**CLI:** `hoody agent sessions tools list --id <id>`

---

#### `listMcp` — List a session's MCP tools.

```typescript
client.agent.sessions.tools.listMcp(id: string, options?: { page?: number; limit?: number; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/sessions/{id}/tools/mcp`
**CLI:** `hoody agent sessions tools mcp list --id <id>`

---

#### `listMcpAll` — List a session's MCP tools. (collect all pages)

```typescript
client.agent.sessions.tools.listMcpAll(/* the arguments of listMcp */)
```

**Returns:** `Promise<Item<AgentSessionsToolsListMcpResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`listMcp()` fetches one page). `listMcpIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tools/mcp`
**CLI:** `hoody agent sessions tools mcp list --id <id>`

---

#### `listMcpIterator` — List a session's MCP tools. (async iterator)

```typescript
client.agent.sessions.tools.listMcpIterator(/* the arguments of listMcp */)
```

**Returns:** `AsyncGenerator<Item<AgentSessionsToolsListMcpResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`listMcp()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/sessions/{id}/tools/mcp`
**CLI:** `hoody agent sessions tools mcp list --id <id>`

---

#### `run` — Run a tool inside a live session (gated).

```typescript
client.agent.sessions.tools.run(id: string, name: string, data?: AgentSessionsToolsRunRequest, options?: { confirm?: boolean; confirm_token?: string; approverLease?: string; cwd?: string; configDir?: string; toolComputer?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `confirm` | `boolean` | query | No | Query alias of the body `confirm` field: re-issue a previously-parked confirmation (pair with confirm_token). |
| `confirm_token` | `string` | query | No | Query alias of the body `confirm_token` field: the single-use token of the parked run (see the body field). |

**Body:** `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }`

- `confirm` — … MUST be paired with the confirm_token of the parked run; a confirm:true with no valid token does NOT bypass the gate: the run is sent unconfirmed, so it parks again, except that a sessionless run of a non-read-only tool without allow_mutations is refused 400 tool_mutation_refused. …
- `confirm_token` — The single-use token of the parked run: in the 409 tool_needs_confirmation details of POST /api/v1/agent/tools/{name}/run and POST /api/v1/agent/sessions/{id}/tools/{name}/run, in the polled job result of POST /api/v1/agent/tools/{name}/runAsync (whose own answer is a 202), and in the needs_confirmation frame of POST /api/v1/agent/tools/{name}/stream (whose own answer is a 200 stream). …
- `allow_mutations` — Sessionless only: opt a non-read-only tool into running with every permission check applied (else a sessionless mutating run is refused 400 tool_mutation_refused). Set it on the first call; a confirm:true without a valid confirm_token does not stand in for it.

**HTTP:** `POST /api/v1/agent/sessions/{id}/tools/{name}/run`
**CLI:** `hoody agent sessions tools run --id <id> --tool <tool>`

---

### `client.agent.sessions.waiters` (4) — Waiters of a session: wait for an outcome in another session's work

#### `cancel` — Cancel a waiter.

```typescript
client.agent.sessions.waiters.cancel(id: string, waiter_id: string, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `waiter_id` | `string` | path | Yes | The waiter id. |

**HTTP:** `DELETE /api/v1/agent/sessions/{id}/waiters/{waiter_id}`
**CLI:** `hoody agent sessions waiters cancel --id <id> --waiter-id <waiter-id>`

---

#### `create` — Wait for an outcome in another session's work.

```typescript
client.agent.sessions.waiters.create(id: string, data: AgentSessionsWaitersCreateRequest, options?: { idempotencyKey?: string; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `idempotencyKey` | `string` | header `Idempotency-Key` | No | Optional retry key, 1–255 printable ASCII: the same key and body answers the waiter it created. |

**Body:** `{ target*: string, outcomes*: { name*: string, when: string, match: object }[], max_s: int, from: string, max_checks: int, on_timeout: "continue" | "stop" | "ask", label: string }`

- `label` — Optional label, at most 80 characters.

**HTTP:** `POST /api/v1/agent/sessions/{id}/waiters`
**CLI:** `hoody agent sessions waiters create --id <id> --target-session-id <target-session-id> --outcomes <outcomes>`

---

#### `get` — Get a waiter.

```typescript
client.agent.sessions.waiters.get(id: string, waiter_id: string, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `waiter_id` | `string` | path | Yes | The waiter id. |

**HTTP:** `GET /api/v1/agent/sessions/{id}/waiters/{waiter_id}`
**CLI:** `hoody agent sessions waiters get --id <id> --waiter-id <waiter-id>`

---

#### `list` — List a session's waiters.

```typescript
client.agent.sessions.waiters.list(id: string, options?: { state?: "waiting" | "done"; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `state` | `"waiting" \| "done"` | query | No | Only waiters in this state. |

**HTTP:** `GET /api/v1/agent/sessions/{id}/waiters`
**CLI:** `hoody agent sessions waiters list --id <id>`

---

### `client.agent.skills.hub` (5) — Skill hub

#### `clearCache` — Clear the skill hub cache.

```typescript
client.agent.skills.hub.clearCache(options?: { cwd?: string; configDir?: string })
```

**HTTP:** `DELETE /api/v1/agent/skills/hub/cache`
**CLI:** `hoody agent skills hub cache clear`

---

#### `getCacheStats` — Skill hub cache stats.

```typescript
client.agent.skills.hub.getCacheStats(options?: { cwd?: string; configDir?: string })
```

**HTTP:** `GET /api/v1/agent/skills/hub/cache`
**CLI:** `hoody agent skills hub cache stats`

---

#### `install` — Install a hub skill.

```typescript
client.agent.skills.hub.install(data: AgentSkillsHubInstallRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ package_digest*: string, overwrite: bool }`

- `package_digest` — The `package_digest` GET /api/v1/agent/skills/hub/preview returned. The install takes exactly that cached package, so preview first; a digest no longer in the cache is refused (preview again).
- `overwrite` — Replace a skill already installed under the same name. Without it (default false) such an install is refused.

**HTTP:** `POST /api/v1/agent/skills/hub/install`
**CLI:** `hoody agent skills hub install --package-digest <package-digest>`

---

#### `preview` — Preview a hub skill.

```typescript
client.agent.skills.hub.preview(options: { provider: string; source: string; skill_id: string; cwd?: string; configDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `provider` | `string` | query | Yes | Hub provider of the skill (a search result's ref.provider). |
| `source` | `string` | query | Yes | Source of the skill on the hub, such as owner/repo (a search result's ref.source). |
| `skill_id` | `string` | query | Yes | Hub skill id (a search result's ref.skill_id). |

**HTTP:** `GET /api/v1/agent/skills/hub/preview`
**CLI:** `hoody agent skills hub preview --provider <provider> --source <source> --skill-id <skill-id>`

---

#### `search` — Search the skill hub.

```typescript
client.agent.skills.hub.search(options: { query: string; cwd?: string; configDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `query` | `string` | query | Yes | Search text. Required and non-empty. |

**HTTP:** `GET /api/v1/agent/skills/hub/search`
**CLI:** `hoody agent skills hub search --query <query>`

---

### `client.agent.usage` (3) — Usage rollups

#### `getStats` — Cross-session statistics.

```typescript
client.agent.usage.getStats(options?: { scope?: string; cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `scope` | `string` | query | No | cwd (default) rolls up the current working directory; all rolls up the sessions of every working directory in the selected realm that the signed-in account can see. |

**HTTP:** `GET /api/v1/agent/statistics`
**CLI:** `hoody agent usage stats`

---

#### `listByAccount` — Usage rollup by account.

```typescript
client.agent.usage.listByAccount(options?: { since?: number; cwd?: string; configDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `since` | `number` | query | No | Unix-seconds lower bound; omit for all-time. A negative/non-numeric value is rejected 400. |

**HTTP:** `GET /api/v1/agent/usage/by-account`
**CLI:** `hoody agent usage accounts list`

---

#### `listByModel` — Usage rollup by model.

```typescript
client.agent.usage.listByModel(options?: { since?: number; cwd?: string; configDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `since` | `number` | query | No | Unix-seconds lower bound; omit for all-time. A negative/non-numeric value is rejected 400. |

**HTTP:** `GET /api/v1/agent/usage/by-model`
**CLI:** `hoody agent usage models list`

---

### `client.agent.workflows.runs` (6) — Workflow runs

**Shared parameters of `client.agent.workflows.runs`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `run_id` | `string` | path | Yes | The run id. |

#### `cancel` — Cancel a workflow run.

```typescript
client.agent.workflows.runs.cancel(run_id: string, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `POST /api/v1/agent/workflows/runs/{run_id}/cancel`
**CLI:** `hoody agent workflows runs cancel --run-id <run-id>`

---

#### `get` — Get one workflow run by id.

```typescript
client.agent.workflows.runs.get(run_id: string, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**HTTP:** `GET /api/v1/agent/workflows/runs/{run_id}`
**CLI:** `hoody agent workflows runs get --run-id <run-id>`

---

#### `list` — Snapshot in-flight and recent workflow runs.

```typescript
client.agent.workflows.runs.list(options?: { agentRealm?: "global" | "all" | (string & {}); page?: number; limit?: number; cwd?: string; configDir?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `agentRealm` | `"global" \| "all" \| (string & {})` | query `realm` | No | The realm to list: "global" (runs not tied to a realm), a 24-hex realm id, or "all" for every realm this login serves. Also accepted as the X-Hoody-Realm header, except "all". Omitted, the agent's current realm. |

**HTTP:** `GET /api/v1/agent/workflows/runs`
**CLI:** `hoody agent workflows runs list`

---

#### `listAll` — Snapshot in-flight and recent workflow runs. (collect all pages)

```typescript
client.agent.workflows.runs.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<AgentWorkflowsRunsListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/agent/workflows/runs`
**CLI:** `hoody agent workflows runs list`

---

#### `listIterator` — Snapshot in-flight and recent workflow runs. (async iterator)

```typescript
client.agent.workflows.runs.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<AgentWorkflowsRunsListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/agent/workflows/runs`
**CLI:** `hoody agent workflows runs list`

---

#### `resume` — Resume a failed or cancelled workflow run.

```typescript
client.agent.workflows.runs.resume(run_id: string, data: AgentWorkflowsRunsResumeRequest, options?: { cwd?: string; configDir?: string; agentRealm?: "global" | (string & {}) })
```

**Body:** `{ session_id*: string }`

**HTTP:** `POST /api/v1/agent/workflows/runs/{run_id}/resume`
**CLI:** `hoody agent workflows runs resume --run-id <run-id> --session-id <session-id>`

