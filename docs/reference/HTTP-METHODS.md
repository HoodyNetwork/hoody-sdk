# Hoody API — HTTP Endpoint Reference

**Version:** 1.0.0-beta.1
**Total endpoints:** 927
**Namespaces:** 19

Every HTTP endpoint on the public Hoody API, paired with the typed SDK method
and the CLI command that call it — the CLI ⇄ SDK ⇄ HTTP map in one place.
Grouped by SDK namespace, sorted by path.

> One row per HTTP `method + path`. SDK pagination helpers (`listAll` /
> `listIterator`) share an endpoint with their base `list` method and are not
> repeated. A `—` in the CLI column means the endpoint has no first-class CLI
> command. See [SDK-METHODS.md](SDK-METHODS.md) for full SDK signatures and
> [CLI-COMMANDS.md](CLI-COMMANDS.md) for CLI flags.

---

## `agent` — 170 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/agent/acp/agents` | `agent.settings.getACPStatus` | `hoody agent settings get-acp-status` | Get BYOA ACP backend status. |
| PUT | `/api/v1/agent/acp/agents/{agent}/secrets/{key}` | `agent.settings.setACPSecret` | `hoody agent settings set-acp-secret` | Store an ACP per-agent secret value. |
| GET | `/api/v1/agent/agents` | `agent.agents.listAgents` | `hoody agent agents list` | List chat-agent definitions. |
| POST | `/api/v1/agent/agents` | `agent.agents.createAgent` | `hoody agent agents create` | Create a chat-agent definition. |
| DELETE | `/api/v1/agent/agents/{name}` | `agent.agents.deleteAgent` | `hoody agent agents delete` | Delete a custom chat agent. |
| POST | `/api/v1/agent/agents/{name}/copy` | `agent.agents.copyAgent` | `hoody agent agents copy` | Copy a chat agent. |
| PATCH | `/api/v1/agent/agents/{name}/model` | `agent.agents.setAgentModel` | `hoody agent agents set-model` | Set an agent's model. |
| POST | `/api/v1/agent/agents/{name}/rename` | `agent.agents.renameAgent` | `hoody agent agents rename` | Rename a chat agent. |
| POST | `/api/v1/agent/agents/{name}/reset-to-shipped` | `agent.agents.resetAgentToShipped` | `hoody agent agents reset-to-shipped` | Reset an agent to its shipped default. |
| GET | `/api/v1/agent/agents/{name}/source` | `agent.agents.getAgentSource` | `hoody agent agents get-source` | Read a chat agent's source. |
| PUT | `/api/v1/agent/agents/{name}/source` | `agent.agents.putAgentSource` | `hoody agent agents put-source` | Write a chat agent's source. |
| PATCH | `/api/v1/agent/agents/{name}/tools` | `agent.agents.setAgentTools` | `hoody agent agents set-tools` | Set an agent's tool allow-list. |
| POST | `/api/v1/agent/agents/{name}/tools/{tool}/toggle` | `agent.agents.toggleAgentTool` | `hoody agent agents toggle-tool` | Toggle a single tool for an agent. |
| PATCH | `/api/v1/agent/agents/{name}/turns` | `agent.agents.setAgentTurns` | `hoody agent agents set-turns` | Set an agent's max-turns. |
| GET | `/api/v1/agent/containers` | `agent.discovery.listContainers` | `hoody agent discovery list-containers` | List containers in a realm (for binding). |
| GET | `/api/v1/agent/docs` | `agent.system.docs` | `hoody agent system docs` | API documentation UI. |
| POST | `/api/v1/agent/github/auth/login` | `agent.github.githubLogin` | `hoody agent github login` | Start a GitHub device-flow login (or add a PAT). |
| POST | `/api/v1/agent/github/auth/login/poll` | `agent.github.githubLoginPoll` | `hoody agent github login-poll` | Poll a GitHub device-flow login to completion. |
| GET | `/api/v1/agent/github/auth/status` | `agent.github.githubAuthStatus` | `hoody agent github auth-status` | GitHub auth status. |
| GET | `/api/v1/agent/github/branches` | `agent.github.githubBranches` | `hoody agent github branches` | List GitHub branches. |
| POST | `/api/v1/agent/github/clone` | `agent.github.githubClone` | `hoody agent github clone` | Clone a GitHub repository. |
| POST | `/api/v1/agent/github/commit` | `agent.github.githubCommit` | `hoody agent github commit` | Stage all and commit. |
| POST | `/api/v1/agent/github/pr` | `agent.github.githubPullRequest` | `hoody agent github pull-request` | Open a pull request. |
| GET | `/api/v1/agent/github/repos` | `agent.github.githubRepos` | `hoody agent github repos` | List GitHub repos. |
| GET | `/api/v1/agent/github/status` | `agent.github.githubStatus` | `hoody agent github status` | GitHub working-tree status. |
| POST | `/api/v1/agent/github/sync` | `agent.github.githubSync` | `hoody agent github sync` | Sync (fetch → pull → push). |
| POST | `/api/v1/agent/headless/runs` | `agent.headless.createHeadlessRun` | — | Create a headless one-shot run. |
| GET | `/api/v1/agent/health` | `agent.system.healthCheck` | `hoody agent system health-check` | Standardized health check. |
| DELETE | `/api/v1/agent/hooks` | `agent.hooks.deleteHook` | `hoody agent hooks delete` | Delete a hook. |
| GET | `/api/v1/agent/hooks` | `agent.hooks.listHooks` | `hoody agent hooks list` | List hooks. |
| PUT | `/api/v1/agent/hooks` | `agent.hooks.upsertHook` | `hoody agent hooks upsert` | Upsert a hook. |
| POST | `/api/v1/agent/hooks/begin-write` | `agent.hooks.beginHookWrite` | `hoody agent hooks begin-write` | Begin a hook write (nonce). |
| POST | `/api/v1/agent/hooks/disable-all` | `agent.hooks.disableAllHooks` | `hoody agent hooks disable-all` | Disable all hooks. |
| POST | `/api/v1/agent/hooks/reload` | `agent.hooks.reloadHooks` | `hoody agent hooks reload` | Reload hooks from disk. |
| POST | `/api/v1/agent/hooks/test` | `agent.hooks.testHook` | `hoody agent hooks test` | Test-fire a hook. |
| POST | `/api/v1/agent/hooks/toggle` | `agent.hooks.toggleHook` | `hoody agent hooks toggle` | Toggle a hook. |
| POST | `/api/v1/agent/hooks/trust/ack` | `agent.hooks.ackHookTrust` | `hoody agent hooks ack-trust` | Acknowledge hook trust. |
| DELETE | `/api/v1/agent/jobs/{id}` | `agent.jobs.deleteJob` | `hoody agent jobs delete` | Cancel a pending/running job, or delete a finished record. |
| GET | `/api/v1/agent/jobs/{id}` | `agent.jobs.getJob` | `hoody agent jobs get` | Get an async job's status. |
| GET | `/api/v1/agent/jobs/{id}/result` | `agent.jobs.getJobResult` | `hoody agent jobs get-result` | Get an async job's result. |
| GET | `/api/v1/agent/logs` | `agent.logs.queryLogs` | `hoody agent logs query-logs` | Query logs. |
| GET | `/api/v1/agent/logs/entries/{ref}` | `agent.logs.readLogEntry` | `hoody agent logs read-log-entry` | Read a log entry. |
| GET | `/api/v1/agent/logs/export` | `agent.exportLogs` | — | Export logs as a downloadable file. |
| GET | `/api/v1/agent/logs/sources` | `agent.logs.logsSources` | `hoody agent logs logs-sources` | Log sources. |
| GET | `/api/v1/agent/logs/stats` | `agent.logs.logsStats` | `hoody agent logs logs-stats` | Log statistics. |
| GET | `/api/v1/agent/logs/stream` | `agent.logs.streamLogs` | — | Stream the log tail (SSE). |
| POST | `/api/v1/agent/memory/consolidate` | `agent.memory.consolidateMemory` | `hoody agent memory consolidate` | Trigger a memory consolidation pass (human-only). |
| PUT | `/api/v1/agent/memory/enabled` | `agent.memory.setMemoryEnabled` | `hoody agent memory set-enabled` | Toggle memory capture. |
| POST | `/api/v1/agent/memory/flush` | `agent.memory.flushMemory` | `hoody agent memory flush` | Flush the memory store. |
| GET | `/api/v1/agent/memory/graph` | `agent.memory.getMemoryGraph` | `hoody agent memory get-graph` | Read a project's memory relation graph. |
| DELETE | `/api/v1/agent/memory/items` | `agent.memory.deleteMemoryItem` | `hoody agent memory delete-item` | Delete a memory item. |
| GET | `/api/v1/agent/memory/items` | `agent.memory.listMemoryItems` | `hoody agent memory list-items` | List memory items. |
| POST | `/api/v1/agent/memory/items` | `agent.memory.saveMemoryItem` | `hoody agent memory save-item` | Save a memory item. |
| GET | `/api/v1/agent/memory/items/{id}` | `agent.memory.getMemoryItem` | `hoody agent memory get-item` | Read a memory item. |
| PATCH | `/api/v1/agent/memory/items/{id}` | `agent.memory.editMemoryItem` | `hoody agent memory edit-item` | Edit a memory item. |
| GET | `/api/v1/agent/memory/projects` | `agent.memory.listMemoryProjects` | `hoody agent memory list-projects` | List memory projects. |
| POST | `/api/v1/agent/memory/search` | `agent.memory.searchMemory` | `hoody agent memory search` | Search memory (hybrid recall). |
| GET | `/api/v1/agent/metrics` | `agent.system.metrics` | `hoody agent system metrics` | Prometheus metrics. |
| GET | `/api/v1/agent/models` | `agent.models.listModels` | `hoody agent models list` | List models. |
| GET | `/api/v1/agent/models/{spec}` | `agent.models.getModel` | `hoody agent models get` | Get a model by spec. |
| GET | `/api/v1/agent/openapi.json` | `agent.system.openapiJSON` | `hoody agent system openapi-json` | OpenAPI spec (JSON). |
| GET | `/api/v1/agent/openapi.yaml` | `agent.system.openapiYAML` | `hoody agent system openapi-yaml` | OpenAPI spec (YAML). |
| GET | `/api/v1/agent/providers` | `agent.models.listProviders` | `hoody agent models list-providers` | List LLM providers. |
| GET | `/api/v1/agent/providers/{id}` | `agent.models.getProvider` | `hoody agent models get-provider` | Get a provider. |
| GET | `/api/v1/agent/providers/{id}/auth` | `agent.models.getProviderAuth` | `hoody agent models get-provider-auth` | Get a provider's auth status. |
| GET | `/api/v1/agent/providers/{id}/auth/accounts` | `agent.models.listProviderAccounts` | `hoody agent models list-provider-accounts` | List a provider's OAuth account pool. |
| POST | `/api/v1/agent/providers/{id}/auth/accounts` | `agent.models.addProviderAccount` | `hoody agent models add-provider-account` | Add an OAuth account to a provider's pool. |
| DELETE | `/api/v1/agent/providers/{id}/auth/accounts/{key}` | `agent.models.removeProviderAccount` | `hoody agent models remove-provider-account` | Remove a pooled OAuth account. |
| PUT | `/api/v1/agent/providers/{id}/auth/accounts/{key}/active` | `agent.models.setProviderAccountActive` | `hoody agent models set-provider-account-active` | Make a pooled OAuth account active. |
| DELETE | `/api/v1/agent/providers/{id}/auth/api-key` | `agent.models.deleteProviderAPIKey` | `hoody agent models delete-provider-api-key` | Delete a provider API key. |
| PUT | `/api/v1/agent/providers/{id}/auth/api-key` | `agent.models.setProviderAPIKey` | `hoody agent models set-provider-api-key` | Store a provider API key. |
| PUT | `/api/v1/agent/providers/{id}/auth/default` | `agent.models.setProviderDefault` | `hoody agent models set-provider-default` | Set a provider's default credential method. |
| DELETE | `/api/v1/agent/providers/{id}/auth/oauth` | `agent.models.logoutProviderOAuth` | `hoody agent models logout-provider-o-auth` | Remove a provider's OAuth login. |
| POST | `/api/v1/agent/providers/{id}/auth/oauth` | `agent.models.startProviderOAuth` | `hoody agent models start-provider-o-auth` | Start a provider OAuth login. |
| GET | `/api/v1/agent/providers/{id}/auth/oauth/{job}` | `agent.models.pollProviderOAuth` | `hoody agent models poll-provider-o-auth` | Poll a provider OAuth login. |
| POST | `/api/v1/agent/providers/{id}/auth/oauth/{job}/code` | `agent.models.submitProviderOAuthCode` | `hoody agent models submit-provider-o-auth-code` | Submit a provider OAuth authorization code. |
| GET | `/api/v1/agent/realms` | `agent.discovery.listRealms` | `hoody agent discovery list-realms` | List realms (for binding). |
| GET | `/api/v1/agent/sessions` | `agent.sessions.listSessions` | `hoody agent sessions list` | List sessions. |
| POST | `/api/v1/agent/sessions` | `agent.sessions.createSession` | `hoody agent sessions create` | Create, fork, or attach a session. |
| DELETE | `/api/v1/agent/sessions/{id}` | `agent.sessions.deleteSession` | `hoody agent sessions delete` | Close (and optionally hard-delete) a session. |
| GET | `/api/v1/agent/sessions/{id}` | `agent.sessions.getSession` | `hoody agent sessions get` | Get a session summary. |
| PATCH | `/api/v1/agent/sessions/{id}/agent` | `agent.sessions.setSessionAgent` | `hoody agent sessions set-chat-agent` | Switch the chat agent. |
| POST | `/api/v1/agent/sessions/{id}/answer` | `agent.sessions.answerQuestion` | `hoody agent sessions answer-question` | Answer a parked question gate. |
| POST | `/api/v1/agent/sessions/{id}/answer:assist` | `agent.sessions.answerAssist` | `hoody agent sessions answer-assist` | Propose answers for a parked question (helper model). |
| PATCH | `/api/v1/agent/sessions/{id}/auto-reply` | `agent.sessions.setSessionAutoReply` | `hoody agent sessions set-auto-reply` | Arm/disarm the auto-reply loop. |
| PATCH | `/api/v1/agent/sessions/{id}/auto-reply/writes` | `agent.sessions.setSessionAutoReplyWrites` | `hoody agent sessions set-auto-reply-writes` | Flip the auto-reply write opt-in. |
| POST | `/api/v1/agent/sessions/{id}/cancel` | `agent.sessions.cancelSession` | `hoody agent sessions cancel` | Cancel the active turn (Esc). |
| POST | `/api/v1/agent/sessions/{id}/close` | `agent.sessions.closeSession` | `hoody agent sessions close` | Close the session (teardown). |
| POST | `/api/v1/agent/sessions/{id}/confirm` | `agent.sessions.confirmGate` | `hoody agent sessions confirm-gate` | Answer a parked confirm gate. |
| PATCH | `/api/v1/agent/sessions/{id}/effort` | `agent.sessions.setSessionEffort` | `hoody agent sessions set-effort` | Set reasoning effort. |
| PATCH | `/api/v1/agent/sessions/{id}/hoody-env` | `agent.sessions.setSessionHoodyEnv` | `hoody agent sessions set-hoody-env` | Toggle Hoody shell-env injection. |
| GET | `/api/v1/agent/sessions/{id}/loops` | `agent.loops.listLoops` | `hoody agent loops list` | List a session's loops. |
| POST | `/api/v1/agent/sessions/{id}/loops` | `agent.loops.createLoop` | `hoody agent loops create` | Create a loop. |
| DELETE | `/api/v1/agent/sessions/{id}/loops/{loopId}` | `agent.loops.deleteLoop` | `hoody agent loops delete` | Delete a loop. |
| PATCH | `/api/v1/agent/sessions/{id}/loops/{loopId}` | `agent.loops.updateLoop` | `hoody agent loops update` | Update a loop. |
| POST | `/api/v1/agent/sessions/{id}/loops/{loopId}/run-now` | `agent.loops.runLoopNow` | `hoody agent loops run-now` | Run a loop immediately. |
| POST | `/api/v1/agent/sessions/{id}/messages` | `agent.sessions.postSessionMessage` | — | Dispatch a turn (fire-and-observe). |
| PATCH | `/api/v1/agent/sessions/{id}/model` | `agent.sessions.setSessionModel` | `hoody agent sessions set-model` | Switch the session model. |
| POST | `/api/v1/agent/sessions/{id}/prompt:stream` | `agent.sessions.promptStream` | — | Dispatch a turn and stream the response. |
| POST | `/api/v1/agent/sessions/{id}/prompt:sync` | `agent.sessions.promptSync` | `hoody agent sessions prompt-sync` | Dispatch a turn and block to completion. |
| GET | `/api/v1/agent/sessions/{id}/replay` | `agent.sessions.replaySession` | `hoody agent sessions replay` | Replay a live session's buffered events. |
| GET | `/api/v1/agent/sessions/{id}/stream` | `agent.sessions.streamSession` | — | Attach to a session's event stream (WebSocket / SSE). |
| GET | `/api/v1/agent/sessions/{id}/tasks` | `agent.tasks.listTasks` | `hoody agent tasks list` | Request the session's task snapshot. |
| POST | `/api/v1/agent/sessions/{id}/tasks/{tid}/cancel` | `agent.tasks.cancelTask` | `hoody agent tasks cancel` | Cancel a background task. |
| GET | `/api/v1/agent/sessions/{id}/tasks/{tid}/transcript` | `agent.tasks.requestTaskTranscript` | `hoody agent tasks request-transcript` | Request a task's transcript (upsert-poll). |
| POST | `/api/v1/agent/sessions/{id}/tasks/cancel` | `agent.tasks.cancelAllTasks` | `hoody agent tasks cancel-all` | Cancel all background tasks. |
| GET | `/api/v1/agent/sessions/{id}/tools` | `agent.tools.listSessionTools` | `hoody agent tools list-session` | List a session's effective tool set. |
| POST | `/api/v1/agent/sessions/{id}/tools/{name}/run` | `agent.tools.runSessionTool` | `hoody agent tools run-session` | Run a tool inside a live session (gated). |
| GET | `/api/v1/agent/sessions/{id}/tools/mcp` | `agent.tools.listSessionMCPTools` | `hoody agent tools list-session-mcp` | List a session's MCP tools. |
| GET | `/api/v1/agent/sessions/{id}/transcript` | `agent.sessions.getSessionTranscript` | — | Read a session's transcript without attaching. |
| POST | `/api/v1/agent/sessions/{id}/trim` | `agent.sessions.trimSession` | `hoody agent sessions trim` | Trim session history to a turn index. |
| PATCH | `/api/v1/agent/sessions/{id}/verbosity` | `agent.sessions.setSessionVerbosity` | `hoody agent sessions set-verbosity` | Set response verbosity. |
| POST | `/api/v1/agent/sessions/{id}/workflow/messages` | `agent.sessions.postWorkflowMessage` | `hoody agent sessions post-workflow-message` | Send a message to a running workflow. |
| POST | `/api/v1/agent/sessions/{id}/workflows/{name}/runs` | `agent.workflows.runSessionWorkflow` | `hoody agent workflows run-session` | Run a workflow onto an existing session. |
| GET | `/api/v1/agent/sessions/cwds` | `agent.sessions.listSessionCwds` | `hoody agent sessions list-cwds` | List distinct session working directories. |
| GET | `/api/v1/agent/settings` | `agent.settings.getSettings` | `hoody agent settings get` | Get settings. |
| PATCH | `/api/v1/agent/settings` | `agent.settings.patchSettings` | `hoody agent settings patch` | Patch settings. |
| GET | `/api/v1/agent/settings/fusion` | `agent.settings.listFusion` | `hoody agent settings list-fusion` | List fusion composites. |
| DELETE | `/api/v1/agent/settings/fusion/{slug}` | `agent.settings.deleteFusion` | `hoody agent settings delete-fusion` | Delete a fusion composite. |
| PUT | `/api/v1/agent/settings/fusion/{slug}` | `agent.settings.upsertFusion` | `hoody agent settings upsert-fusion` | Create or update a fusion composite. |
| GET | `/api/v1/agent/skills` | `agent.skills.listSkills` | `hoody agent skills list` | List skills. |
| POST | `/api/v1/agent/skills` | `agent.skills.createSkill` | `hoody agent skills create` | Create a skill. |
| POST | `/api/v1/agent/skills/delete` | `agent.skills.deleteSkill` | `hoody agent skills delete` | Delete a skill. |
| DELETE | `/api/v1/agent/skills/hub/cache` | `agent.skills.clearSkillHubCache` | `hoody agent skills clear-hub-cache` | Clear the skill hub cache. |
| GET | `/api/v1/agent/skills/hub/cache` | `agent.skills.getSkillHubCache` | `hoody agent skills get-hub-cache` | Skill hub cache stats. |
| POST | `/api/v1/agent/skills/hub/install` | `agent.skills.installSkillHub` | `hoody agent skills install-hub` | Install a hub skill. |
| GET | `/api/v1/agent/skills/hub/preview` | `agent.skills.previewSkillHub` | `hoody agent skills preview-hub` | Preview a hub skill. |
| GET | `/api/v1/agent/skills/hub/search` | `agent.skills.searchSkillHub` | `hoody agent skills search-hub` | Search the skill hub. |
| POST | `/api/v1/agent/skills/import/apply` | `agent.skills.applySkillImport` | `hoody agent skills apply-import` | Apply a skill import. |
| GET | `/api/v1/agent/skills/import/scan` | `agent.skills.scanSkillImport` | `hoody agent skills scan-import` | Scan for importable skills. |
| POST | `/api/v1/agent/skills/rename` | `agent.skills.renameSkill` | `hoody agent skills rename` | Rename a skill. |
| GET | `/api/v1/agent/skills/source` | `agent.skills.getSkillSource` | `hoody agent skills get-source` | Read a skill's source. |
| PUT | `/api/v1/agent/skills/source` | `agent.skills.putSkillSource` | `hoody agent skills put-source` | Write a skill's source. |
| POST | `/api/v1/agent/skills/toggle` | `agent.skills.toggleSkill` | `hoody agent skills toggle` | Enable/disable a skill. |
| POST | `/api/v1/agent/skills/trust` | `agent.skills.trustSkill` | `hoody agent skills trust` | Set a skill's trust state. |
| GET | `/api/v1/agent/statistics` | `agent.statistics.getStatistics` | `hoody agent statistics get` | Cross-session statistics. |
| GET | `/api/v1/agent/todos` | `agent.todos.listTodos` | `hoody agent todos list` | List todos. |
| POST | `/api/v1/agent/todos` | `agent.todos.createTodo` | `hoody agent todos create` | File a todo. |
| GET | `/api/v1/agent/todos/{id}` | `agent.todos.getTodo` | `hoody agent todos get` | Read a todo. |
| PATCH | `/api/v1/agent/todos/{id}` | `agent.todos.updateTodo` | `hoody agent todos update` | Update a todo (CAS). |
| POST | `/api/v1/agent/todos/{id}/archive` | `agent.todos.archiveTodo` | `hoody agent todos archive` | Archive a todo. |
| POST | `/api/v1/agent/todos/{id}/cancel-run` | `agent.todos.cancelTodoRun` | `hoody agent todos cancel-run` | Cancel a todo's run. |
| POST | `/api/v1/agent/todos/{id}/claim` | `agent.todos.claimTodo` | `hoody agent todos claim` | Claim a todo. |
| POST | `/api/v1/agent/todos/{id}/message` | `agent.todos.messageTodo` | `hoody agent todos message` | Comment + run an orchestrator turn. |
| POST | `/api/v1/agent/todos/{id}/messages` | `agent.todos.postTodoComment` | `hoody agent todos post-comment` | Comment on a todo. |
| POST | `/api/v1/agent/todos/{id}/proposals/{pid}/approve` | `agent.todos.approveTodoProposal` | `hoody agent todos approve-proposal` | Approve a todo proposal. |
| POST | `/api/v1/agent/todos/{id}/proposals/{pid}/deny` | `agent.todos.denyTodoProposal` | `hoody agent todos deny-proposal` | Deny a todo proposal. |
| POST | `/api/v1/agent/todos/{id}/release` | `agent.todos.releaseTodo` | `hoody agent todos release` | Release a todo. |
| POST | `/api/v1/agent/todos/{id}/run` | `agent.todos.runTodo` | `hoody agent todos run` | Run a todo's orchestrator. |
| POST | `/api/v1/agent/todos/{id}/snooze` | `agent.todos.snoozeTodo` | `hoody agent todos snooze` | Snooze a todo. |
| POST | `/api/v1/agent/todos/purge` | `agent.todos.purgeTodos` | `hoody agent todos purge` | Purge archived todos. |
| GET | `/api/v1/agent/todos/revision` | `agent.todos.getTodosRevision` | `hoody agent todos get-revision` | Get the todos store revision. |
| POST | `/api/v1/agent/todos/triage` | `agent.todos.triageTodos` | `hoody agent todos triage` | Run an LLM triage pass. |
| GET | `/api/v1/agent/tools` | `agent.tools.listTools` | `hoody agent tools list` | List the tool catalogue. |
| GET | `/api/v1/agent/tools/{name}` | `agent.tools.getTool` | `hoody agent tools get` | Get one tool schema. |
| POST | `/api/v1/agent/tools/{name}/run` | `agent.tools.runTool` | `hoody agent tools run` | Run a tool (sessionless, gated). |
| POST | `/api/v1/agent/tools/{name}/runAsync` | `agent.tools.runToolAsync` | `hoody agent tools run-async` | Run a tool asynchronously (sessionless, gated). |
| POST | `/api/v1/agent/tools/{name}/stream` | `agent.tools.streamTool` | — | Run a tool with a streamed result (sessionless, gated). |
| GET | `/api/v1/agent/tools/read-only` | `agent.tools.listReadOnlyTools` | `hoody agent tools list-read-only` | List the read-only tool subset. |
| GET | `/api/v1/agent/usage/by-account` | `agent.statistics.usageByAccount` | `hoody agent statistics usage-by-account` | Usage rollup by account. |
| GET | `/api/v1/agent/usage/by-model` | `agent.statistics.usageByModel` | `hoody agent statistics usage-by-model` | Usage rollup by model. |
| GET | `/api/v1/agent/workflows` | `agent.workflows.listWorkflows` | `hoody agent workflows list` | List workflow definitions. |
| DELETE | `/api/v1/agent/workflows/{name}` | `agent.workflows.deleteWorkflow` | `hoody agent workflows delete` | Delete a workflow definition. |
| GET | `/api/v1/agent/workflows/{name}` | `agent.workflows.getWorkflow` | `hoody agent workflows get` | Read one workflow definition. |
| PUT | `/api/v1/agent/workflows/{name}` | `agent.workflows.putWorkflow` | `hoody agent workflows put` | Create or replace a workflow definition. |
| POST | `/api/v1/agent/workflows/{name}/hide` | `agent.workflows.hideWorkflow` | `hoody agent workflows hide` | Hide or un-hide a workflow. |
| GET | `/api/v1/agent/workflows/runs` | `agent.workflows.listWorkflowRuns` | `hoody agent workflows list-runs` | Snapshot in-flight and recent workflow runs. |
| GET | `/api/v1/agent/workflows/runs/{run_id}` | `agent.workflows.getWorkflowRun` | `hoody agent workflows get-run` | Get one workflow run by id. |
| POST | `/api/v1/agent/workflows/runs/{run_id}/cancel` | `agent.workflows.cancelWorkflowRun` | `hoody agent workflows cancel-run` | Cancel a workflow run. |
| POST | `/api/v1/agent/workflows/runs/{run_id}/resume` | `agent.workflows.resumeWorkflowRun` | — | Resume a failed or cancelled workflow run. |

---

## `api` — 219 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/ai/models` | `api.ai.listModels` | `hoody ai list` | List available AI models (Hoody catalog) |
| GET | `/api/v1/auth/available-regions` | `api.authentication.getAvailableRegions` | `hoody auth regions` | Get available server regions |
| GET | `/api/v1/auth/device/authorize` | `api.authentication.oauthDeviceAuthorize` | — | Start the device-leg OAuth (cookie + ticket gated) |
| POST | `/api/v1/auth/device/code` | `api.authentication.oauthDeviceCode` | — | Start an RFC 8628 device authorization flow |
| POST | `/api/v1/auth/device/token` | `api.authentication.oauthDeviceToken` | — | Poll for device-flow tokens (RFC 8628 §3.5) |
| POST | `/api/v1/auth/device/verify_code` | `api.authentication.oauthDeviceVerifyCode` | — | Confirm a device user_code (verification page) |
| POST | `/api/v1/auth/forgot-password` | `api.authentication.forgotPassword` | `hoody auth password forgot` | Request password reset |
| GET | `/api/v1/auth/github` | `api.authentication.githubOAuthRedirect` | `hoody auth oauth github redirect` | Redirect to GitHub OAuth |
| GET | `/api/v1/auth/github/callback` | `api.authentication.githubOAuthCallback` | `hoody auth oauth github callback` | GitHub OAuth callback |
| GET | `/api/v1/auth/google` | `api.authentication.googleOAuthRedirect` | `hoody auth oauth google redirect` | Redirect to Google OAuth |
| GET | `/api/v1/auth/google/callback` | `api.authentication.googleOAuthCallback` | `hoody auth oauth google callback` | Google OAuth callback |
| POST | `/api/v1/auth/intent/cancel` | `api.authentication.oauthCancelIntent` | — | Cancel a pending OAuth AuthIntent or 2FA temp_token |
| POST | `/api/v1/auth/launch/initiate` | `api.authentication.oauthLaunchInitiate` | — | Initiate OAuth popup-handoff launch |
| GET | `/api/v1/auth/launch/start` | `api.authentication.oauthLaunchStart` | — | Start OAuth popup-handoff via single-use ticket |
| POST | `/api/v1/auth/resend-verification` | `api.authentication.resendVerification` | `hoody auth email resend` | Resend verification email |
| POST | `/api/v1/auth/reset-password` | `api.authentication.resetPassword` | `hoody auth password reset` | Reset password |
| POST | `/api/v1/auth/signup` | `api.authentication.signup` | `hoody auth signup` | Sign up with email and password |
| GET | `/api/v1/auth/tokens` | `api.authTokens.list` | `hoody auth list` | List auth tokens |
| POST | `/api/v1/auth/tokens` | `api.authTokens.create` | `hoody auth create` | Create a new auth token |
| DELETE | `/api/v1/auth/tokens/{id}` | `api.authTokens.delete` | `hoody auth delete` | Delete auth token |
| GET | `/api/v1/auth/tokens/{id}` | `api.authTokens.get` | `hoody auth get` | Get auth token by ID |
| PUT | `/api/v1/auth/tokens/{id}` | `api.authTokens.update` | `hoody auth update` | Update auth token |
| POST | `/api/v1/auth/tokens/{id}/add-realm` | `api.authTokens.addRealm` | `hoody auth realms add` | Add realm to auth token |
| POST | `/api/v1/auth/tokens/{id}/copy` | `api.authTokens.copy` | `hoody auth copy` | Copy auth token |
| POST | `/api/v1/auth/tokens/{id}/remove-realm` | `api.authTokens.removeRealm` | `hoody auth realms remove` | Remove realm from auth token |
| GET | `/api/v1/auth/tokens/me` | `api.authTokens.getCurrent` | `hoody auth get-current` | Get current auth token details |
| PUT | `/api/v1/auth/tokens/me/public-profile` | `api.authTokens.updatePublicProfile` | `hoody auth profile update` | Update current auth token public profile |
| GET | `/api/v1/auth/tokens/public-profiles/{public_key}` | `api.authTokens.getPublicProfile` | `hoody auth profile by-public-key` | Get auth token public profile by public key |
| GET | `/api/v1/auth/tokens/templates` | `api.authTokens.listAuthTokenPermissionTemplates` | — | List permission templates |
| POST | `/api/v1/auth/verify-email` | `api.authentication.verifyEmail` | `hoody auth email verify` | Verify email address |
| GET | `/api/v1/containers/` | `api.containers.list` | `hoody containers list` | Get all containers |
| DELETE | `/api/v1/containers/{id}` | `api.containers.delete` | `hoody containers delete` | Delete a container |
| GET | `/api/v1/containers/{id}` | `api.containers.get` | `hoody containers get` | Get a container by ID |
| PUT | `/api/v1/containers/{id}` | `api.containers.update` | `hoody containers update` | Update a container |
| POST | `/api/v1/containers/{id}/{operation}` | `api.containers.manage` | `hoody containers manage` | Manage container |
| POST | `/api/v1/containers/{id}/authorize` | `api.containers.authorize` | `hoody containers authorize` | Authorize Container Access |
| POST | `/api/v1/containers/{id}/copy` | `api.containers.copy` | `hoody containers copy` | Copy a container |
| GET | `/api/v1/containers/{id}/env` | `api.env.list` | `hoody containers env list` | List container environment variables |
| PUT | `/api/v1/containers/{id}/env` | `api.env.bulkSet` | `hoody containers env bulk-set` | Bulk set container environment variables |
| DELETE | `/api/v1/containers/{id}/env/{key}` | `api.env.delete` | `hoody containers env delete` | Delete a single environment variable |
| PUT | `/api/v1/containers/{id}/env/{key}` | `api.env.set` | `hoody containers env set` | Set a single environment variable |
| DELETE | `/api/v1/containers/{id}/firewall/egress` | `api.firewall.removeEgressRule` | `hoody firewall egress delete` | Remove Egress Rule(s) |
| PATCH | `/api/v1/containers/{id}/firewall/egress` | `api.firewall.toggleEgressRule` | `hoody firewall egress toggle` | Toggle Egress Rule State |
| POST | `/api/v1/containers/{id}/firewall/egress` | `api.firewall.addEgressRule` | `hoody firewall egress create` | Add Egress Rule |
| DELETE | `/api/v1/containers/{id}/firewall/ingress` | `api.firewall.removeIngressRule` | `hoody firewall ingress delete` | Remove Ingress Rule(s) |
| PATCH | `/api/v1/containers/{id}/firewall/ingress` | `api.firewall.toggleIngressRule` | `hoody firewall ingress toggle` | Toggle Ingress Rule State |
| POST | `/api/v1/containers/{id}/firewall/ingress` | `api.firewall.addIngressRule` | `hoody firewall ingress create` | Add Ingress Rule |
| POST | `/api/v1/containers/{id}/firewall/reset` | `api.firewall.reset` | `hoody firewall reset` | Reset container firewall |
| GET | `/api/v1/containers/{id}/firewall/rules` | `api.firewall.list` | `hoody firewall list` | List container firewall rules |
| DELETE | `/api/v1/containers/{id}/network` | `api.containers.removeNetworkConfig` | `hoody network delete` | Remove container network configuration |
| GET | `/api/v1/containers/{id}/network` | `api.containers.getNetworkConfig` | `hoody network get` | Get container network configuration |
| PUT | `/api/v1/containers/{id}/network` | `api.containers.updateNetworkConfig` | `hoody network update` | Update container network configuration |
| POST | `/api/v1/containers/{id}/network/start` | `api.containers.startNetwork` | `hoody network start` | Start container network proxy/blocking |
| POST | `/api/v1/containers/{id}/network/stop` | `api.containers.stopNetwork` | `hoody network stop` | Stop container network proxy/blocking |
| GET | `/api/v1/containers/{id}/proxy/groups` | `api.proxyDiscovery.listContainerProxyGroups` | `hoody containers proxy discovery groups list` | List container proxy groups |
| GET | `/api/v1/containers/{id}/proxy/hooks` | `api.proxyHooks.listContainerProxyHooks` | `hoody containers proxy hooks list` | List all proxy hooks for a container |
| DELETE | `/api/v1/containers/{id}/proxy/hooks/{service}` | `api.proxyHooks.clearContainerProxyServiceHooks` | `hoody containers proxy hooks clear-service` | Clear all hooks for a service |
| GET | `/api/v1/containers/{id}/proxy/hooks/{service}` | `api.proxyHooks.listContainerProxyServiceHooks` | `hoody containers proxy hooks list-service` | List hooks for a specific service |
| POST | `/api/v1/containers/{id}/proxy/hooks/{service}` | `api.proxyHooks.addContainerProxyHook` | `hoody containers proxy hooks create` | Append or insert a new hook |
| DELETE | `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` | `api.proxyHooks.removeContainerProxyHook` | `hoody containers proxy hooks delete` | Remove a hook |
| GET | `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` | `api.proxyHooks.getContainerProxyHook` | `hoody containers proxy hooks get` | Get a single hook by id |
| PUT | `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` | `api.proxyHooks.updateContainerProxyHook` | `hoody containers proxy hooks update` | Replace a hook in place |
| PATCH | `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}/position` | `api.proxyHooks.moveContainerProxyHook` | `hoody containers proxy hooks move` | Move a hook to a new position |
| DELETE | `/api/v1/containers/{id}/proxy/permissions` | `api.proxyPermissionsContainer.delete` | `hoody containers proxy permissions delete` | Delete container proxy permissions |
| GET | `/api/v1/containers/{id}/proxy/permissions` | `api.proxyPermissionsContainer.get` | `hoody containers proxy permissions get` | Get container proxy permissions |
| PUT | `/api/v1/containers/{id}/proxy/permissions` | `api.proxyPermissionsContainer.replace` | `hoody containers proxy permissions replace` | Replace container proxy permissions JSON |
| PATCH | `/api/v1/containers/{id}/proxy/permissions/default` | `api.proxyPermissionsContainer.updateDefault` | `hoody containers proxy default` | Update container default proxy permission policy |
| DELETE | `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}` | `api.proxyPermissionsContainer.removeAuthGroup` | `hoody containers proxy groups delete` | Remove container authentication group |
| PUT | `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/ip` | `api.proxyPermissionsContainer.setIpGroup` | `hoody containers proxy groups ip set` | Set IP authentication group (container) |
| PUT | `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/jwt` | `api.proxyPermissionsContainer.setJwtGroup` | `hoody containers proxy groups jwt set` | Set JWT authentication group (container) |
| PUT | `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/password` | `api.proxyPermissionsContainer.setPasswordGroup` | `hoody containers proxy groups password set` | Set password authentication group (container) |
| PUT | `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/token` | `api.proxyPermissionsContainer.setTokenGroup` | `hoody containers proxy groups token set` | Set token authentication group (container) |
| DELETE | `/api/v1/containers/{id}/proxy/permissions/permissions/{groupName}` | `api.proxyPermissionsContainer.removeGroup` | `hoody containers proxy groups permissions clear` | Remove all program permissions for a container group |
| PUT | `/api/v1/containers/{id}/proxy/permissions/permissions/{groupName}` | `api.proxyPermissionsContainer.setGroup` | `hoody containers proxy groups permissions set` | Set container group program permission |
| DELETE | `/api/v1/containers/{id}/proxy/permissions/permissions/{groupName}/{program}` | `api.proxyPermissionsContainer.removeProgram` | `hoody containers proxy groups permissions delete` | Remove a single program permission for a container group |
| PATCH | `/api/v1/containers/{id}/proxy/permissions/state` | `api.proxyPermissionsContainer.updateState` | `hoody containers proxy state` | Update container proxy enable state |
| GET | `/api/v1/containers/{id}/proxy/services` | `api.proxyDiscovery.listContainerProxyServices` | `hoody containers proxy discovery services list` | List services referenced in proxy config |
| GET | `/api/v1/containers/{id}/proxy/services/{service}` | `api.proxyDiscovery.getContainerProxyService` | `hoody containers proxy discovery services get` | Get merged proxy view for a service |
| GET | `/api/v1/containers/{id}/proxy/settings` | `api.proxyDiscovery.getContainerProxySettings` | `hoody containers proxy settings get` | Get container proxy root settings |
| PUT | `/api/v1/containers/{id}/proxy/settings` | `api.proxyDiscovery.updateContainerProxySettings` | `hoody containers proxy settings update` | Update container proxy root settings |
| GET | `/api/v1/containers/{id}/snapshots` | `api.containers.listSnapshots` | `hoody snapshots list` | Get container snapshots |
| POST | `/api/v1/containers/{id}/snapshots` | `api.containers.createSnapshot` | `hoody snapshots create` | Create container snapshot |
| DELETE | `/api/v1/containers/{id}/snapshots/{name}` | `api.containers.deleteSnapshot` | `hoody snapshots delete` | Delete container snapshot |
| PUT | `/api/v1/containers/{id}/snapshots/{name}` | `api.containers.restoreSnapshot` | `hoody snapshots restore` | Restore container from snapshot |
| PUT | `/api/v1/containers/{id}/snapshots/{name}/alias` | `api.containers.updateSnapshotAlias` | `hoody snapshots update-alias` | Update snapshot alias |
| GET | `/api/v1/containers/{id}/stats` | `api.containers.getStats` | `hoody containers stats` | Get container resource statistics |
| GET | `/api/v1/containers/{id}/status-logs` | `api.containers.getStatusLogs` | `hoody containers status-logs` | Get status logs for a container |
| GET | `/api/v1/containers/{id}/storage/incoming` | `api.storageShares.listIncoming` | `hoody storage incoming list` | Get incoming shares |
| PATCH | `/api/v1/containers/{id}/storage/incoming/{shareId}/mount` | `api.storageShares.toggleIncomingMount` | `hoody storage incoming toggle-mount` | Toggle incoming share mount |
| GET | `/api/v1/containers/{id}/storage/shares` | `api.storageShares.list` | `hoody storage list` | List storage shares |
| POST | `/api/v1/containers/{id}/storage/shares` | `api.storageShares.create` | `hoody storage create` | Create storage share |
| GET | `/api/v1/containers/{id}/storage/shares/{shareId}` | `api.storageShares.get` | `hoody storage get` | Get storage share |
| PATCH | `/api/v1/containers/{id}/storage/shares/{shareId}` | `api.storageShares.update` | `hoody storage update` | Update storage share |
| POST | `/api/v1/containers/{id}/sync` | `api.containers.sync` | `hoody containers sync` | Sync a copied container with its source |
| DELETE | `/api/v1/events` | `api.events.bulkDelete` | `hoody events bulk-delete` | Bulk delete events |
| GET | `/api/v1/events` | `api.events.list` | `hoody events list` | List event history |
| DELETE | `/api/v1/events/{id}` | `api.events.delete` | `hoody events delete` | Delete a single event |
| GET | `/api/v1/events/{id}` | `api.events.get` | `hoody events get` | Get event details by ID |
| POST | `/api/v1/events/cleanup` | `api.events.cleanup` | `hoody events cleanup` | Cleanup old events |
| GET | `/api/v1/events/stats` | `api.events.getStats` | `hoody events stats` | Get event statistics |
| GET | `/api/v1/images/{id}/icon` | `api.images.getIcon` | `hoody images icon` | Get image icon |
| POST | `/api/v1/images/import/{id}` | `api.images.importFree` | `hoody images import-free` | Import free image |
| GET | `/api/v1/images/public` | `api.images.listPublic` | `hoody images list` | List public images |
| GET | `/api/v1/images/public/{id}` | `api.images.getDetails` | `hoody images get` | Get public image details |
| POST | `/api/v1/images/purchase/{id}` | `api.images.purchase` | `hoody images purchase` | Purchase image |
| POST | `/api/v1/images/rate/{id}` | `api.images.rate` | `hoody images rate` | Rate image |
| GET | `/api/v1/images/user` | `api.images.list` | `hoody images mine` | List user images |
| GET | `/api/v1/ip` | `api.utilities.getIpInfo` | `hoody ip get` | Get IP Information |
| GET | `/api/v1/meta/public-key` | `api.meta.getPublicKey` | `hoody meta get` | Get Hoody API Signing Public Key |
| GET | `/api/v1/meta/social-stats` | `api.meta.getSocialStats` | — | Get Hoody Social Counters |
| GET | `/api/v1/notifications/` | `api.notifications.list` | `hoody inbox list` | Get all notifications for the authenticated user |
| PUT | `/api/v1/notifications/{id}/read` | `api.notifications.markRead` | `hoody inbox mark` | Mark a notification as read |
| GET | `/api/v1/notifications/public` | `api.notifications.listPublic` | `hoody inbox list-public` | Get all public notifications |
| PUT | `/api/v1/notifications/read-all` | `api.notifications.markAllRead` | `hoody inbox mark-all` | Mark all notifications as read |
| GET | `/api/v1/pools` | `api.pools.list` | `hoody pools list` | List user pools |
| POST | `/api/v1/pools` | `api.pools.create` | `hoody pools create` | Create pool |
| DELETE | `/api/v1/pools/{id}` | `api.pools.delete` | `hoody pools delete` | Delete pool |
| GET | `/api/v1/pools/{id}` | `api.pools.get` | `hoody pools get` | Get pool details |
| PUT | `/api/v1/pools/{id}` | `api.pools.update` | `hoody pools update` | Update pool |
| POST | `/api/v1/pools/{id}/accept` | `api.poolInvitations.accept` | `hoody pools invitations accept` | Accept invitation |
| POST | `/api/v1/pools/{id}/members` | `api.poolMembers.invite` | `hoody pools members invite` | Invite member |
| DELETE | `/api/v1/pools/{id}/members/{userId}` | `api.poolMembers.remove` | `hoody pools members delete` | Remove member |
| PUT | `/api/v1/pools/{id}/members/{userId}` | `api.poolMembers.updateRole` | `hoody pools members update-role` | Update member role |
| POST | `/api/v1/pools/{id}/reject` | `api.poolInvitations.reject` | `hoody pools invitations reject` | Reject invitation |
| GET | `/api/v1/pools/invitations/pending` | `api.poolInvitations.list` | `hoody pools invitations list` | List pending invitations |
| GET | `/api/v1/projects/` | `api.projects.list` | `hoody projects list` | List all projects |
| POST | `/api/v1/projects/` | `api.projects.create` | `hoody projects create` | Create a new project |
| DELETE | `/api/v1/projects/{id}` | `api.projects.delete` | `hoody projects delete` | Delete project |
| GET | `/api/v1/projects/{id}` | `api.projects.get` | `hoody projects get` | Get project by ID |
| PUT | `/api/v1/projects/{id}` | `api.projects.update` | `hoody projects update` | Update project |
| GET | `/api/v1/projects/{id}/containers` | `api.containers.listByProject` | — | Get all containers for a project |
| POST | `/api/v1/projects/{id}/containers` | `api.containers.create` | `hoody containers create` | Create a new container |
| GET | `/api/v1/projects/{id}/permissions` | `api.projects.listPermissions` | `hoody projects permissions list` | List project permissions |
| POST | `/api/v1/projects/{id}/permissions` | `api.projects.addPermission` | `hoody projects permissions create` | Grant project access |
| DELETE | `/api/v1/projects/{id}/permissions/{permissionId}` | `api.projects.removePermission` | `hoody projects permissions delete` | Revoke project access |
| PUT | `/api/v1/projects/{id}/permissions/{permissionId}` | `api.projects.updatePermission` | `hoody projects permissions update` | Update project permission |
| DELETE | `/api/v1/projects/{id}/proxy/permissions` | `api.proxyPermissionsProject.delete` | `hoody projects proxy permissions delete` | Delete project proxy permissions |
| GET | `/api/v1/projects/{id}/proxy/permissions` | `api.proxyPermissionsProject.get` | `hoody projects proxy permissions get` | Get project proxy permissions |
| PUT | `/api/v1/projects/{id}/proxy/permissions` | `api.proxyPermissionsProject.replace` | `hoody projects proxy permissions replace` | Replace project proxy permissions JSON |
| PATCH | `/api/v1/projects/{id}/proxy/permissions/default` | `api.proxyPermissionsProject.updateDefault` | `hoody projects proxy default` | Update project default proxy permission policy |
| DELETE | `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}` | `api.proxyPermissionsProject.removeAuthGroup` | `hoody projects proxy groups delete` | Remove project authentication group |
| PUT | `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/ip` | `api.proxyPermissionsProject.setIpGroup` | `hoody projects proxy groups ip set` | Set IP authentication group (project) |
| PUT | `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/jwt` | `api.proxyPermissionsProject.setJwtGroup` | `hoody projects proxy groups jwt set` | Set JWT authentication group (project) |
| PUT | `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/password` | `api.proxyPermissionsProject.setPasswordGroup` | `hoody projects proxy groups password set` | Set password authentication group (project) |
| PUT | `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/token` | `api.proxyPermissionsProject.setTokenGroup` | `hoody projects proxy groups token set` | Set token authentication group (project) |
| DELETE | `/api/v1/projects/{id}/proxy/permissions/permissions/{groupName}` | `api.proxyPermissionsProject.removeGroup` | `hoody projects proxy groups permissions clear` | Remove all program permissions for a project group |
| PUT | `/api/v1/projects/{id}/proxy/permissions/permissions/{groupName}` | `api.proxyPermissionsProject.setGroup` | `hoody projects proxy groups permissions set` | Set project group program permission |
| DELETE | `/api/v1/projects/{id}/proxy/permissions/permissions/{groupName}/{program}` | `api.proxyPermissionsProject.removeProgram` | `hoody projects proxy groups permissions delete` | Remove a single program permission for a project group |
| PATCH | `/api/v1/projects/{id}/proxy/permissions/state` | `api.proxyPermissionsProject.updateState` | `hoody projects proxy state` | Update project proxy enable state |
| GET | `/api/v1/projects/{id}/stats` | `api.projects.getStats` | `hoody projects stats` | Get statistics for all containers in a project |
| GET | `/api/v1/proxy/aliases` | `api.proxyAliases.list` | `hoody proxy list` | List proxy aliases |
| POST | `/api/v1/proxy/aliases` | `api.proxyAliases.create` | `hoody proxy create` | Create a new proxy alias |
| DELETE | `/api/v1/proxy/aliases/{id}` | `api.proxyAliases.delete` | `hoody proxy delete` | Delete proxy alias |
| GET | `/api/v1/proxy/aliases/{id}` | `api.proxyAliases.get` | `hoody proxy get` | Get proxy alias by ID |
| PATCH | `/api/v1/proxy/aliases/{id}` | `api.proxyAliases.update` | `hoody proxy update` | Update proxy alias |
| PATCH | `/api/v1/proxy/aliases/{id}/state` | `api.proxyAliases.setState` | `hoody proxy set-state` | Enable or disable proxy alias |
| GET | `/api/v1/realms/` | `api.realms.list` | `hoody realms list` | List your realm IDs |
| GET | `/api/v1/rentals` | `api.rentals.list` | — | List user rentals |
| GET | `/api/v1/rentals/{id}` | `api.rentals.get` | — | Get rental details |
| POST | `/api/v1/rentals/{id}/extend` | `api.rentals.extend` | `hoody servers extend` | Extend rental |
| GET | `/api/v1/servers` | `api.serverRental.list` | `hoody servers list` | List user servers (alias for /rentals) |
| GET | `/api/v1/servers/{id}` | `api.serverRental.get` | `hoody servers get` | Get server details (alias for /rentals/:id) |
| POST | `/api/v1/servers/{id}/rent` | `api.serverRental.rent` | `hoody servers rent` | Rent server |
| GET | `/api/v1/servers/{serverId}/available-commands` | `api.serverCommands.list` | `hoody servers commands` | Get available commands |
| POST | `/api/v1/servers/{serverId}/execute-command` | `api.serverCommands.execute` | `hoody servers exec` | Execute server command |
| GET | `/api/v1/servers/available` | `api.serverRental.browse` | `hoody servers marketplace` | Browse rental marketplace |
| GET | `/api/v1/storage/incoming` | `api.storageShares.listIncomingGlobal` | `hoody storage incoming list-all` | Get all incoming shares |
| GET | `/api/v1/storage/shares` | `api.storageShares.listGlobal` | `hoody storage list-all` | List all your storage shares |
| DELETE | `/api/v1/storage/shares/{shareId}` | `api.storageShares.delete` | `hoody storage delete` | Delete storage share |
| GET | `/api/v1/users/{id}` | `api.users.get` | `hoody users get` | Get user by ID |
| PUT | `/api/v1/users/{id}` | `api.users.update` | `hoody users update` | Update user profile |
| DELETE | `/api/v1/users/auth/2fa` | `api.tfa.disable` | `hoody auth 2fa disable` | Disable 2FA |
| POST | `/api/v1/users/auth/2fa/backup-codes/regenerate` | `api.tfa.regenerateBackupCodes` | `hoody auth 2fa regenerate` | Regenerate Backup Codes |
| POST | `/api/v1/users/auth/2fa/setup` | `api.tfa.setup` | `hoody auth 2fa setup` | Initialize 2FA Setup |
| GET | `/api/v1/users/auth/2fa/status` | `api.tfa.getStatus` | `hoody auth 2fa status` | Get 2FA Status |
| PUT | `/api/v1/users/auth/2fa/token-gate` | `api.tfa.setTokenGate` | `hoody auth 2fa gate` | Set 2FA token gate preference |
| POST | `/api/v1/users/auth/2fa/verify` | `api.tfa.verify` | `hoody auth 2fa verify` | Verify 2FA Code During Login |
| POST | `/api/v1/users/auth/2fa/verify-setup` | `api.tfa.verifySetup` | `hoody auth 2fa verify-setup` | Complete 2FA Setup |
| GET | `/api/v1/users/auth/activity` | `api.activity.list` | `hoody activity logs` | Get activity logs |
| GET | `/api/v1/users/auth/activity/stats` | `api.activity.getStats` | `hoody activity stats` | Get activity stats |
| POST | `/api/v1/users/auth/login` | `api.authentication.login` | `hoody auth login` | Login with username and password |
| POST | `/api/v1/users/auth/logout` | `api.authentication.logout` | `hoody auth logout` | Logout |
| GET | `/api/v1/users/auth/me` | `api.authentication.getCurrentUser` | `hoody auth profile current` | Get current user profile |
| POST | `/api/v1/users/auth/refresh` | `api.authentication.refreshToken` | `hoody auth refresh` | Refresh access token |
| GET | `/api/v1/users/me` | `api.authentication.getCurrentUserAlias` | — | Get current user profile (alias of /users/auth/me) |
| GET | `/api/v1/users/me/free-tier-status` | `api.users.getFreeTierStatus` | — | Get free-tier claim status |
| POST | `/api/v1/users/me/onboarding` | `api.users.markOnboardingMilestone` | — | Mark an onboarding milestone as completed |
| POST | `/api/v1/users/me/redeem-invite` | `api.users.redeemInviteCode` | `hoody users redeem-invite` | Redeem a beta invite code |
| POST | `/api/v1/users/me/retry-setup` | `api.users.retrySetup` | `hoody users retry-setup` | Retry free-tier account setup |
| DELETE | `/api/v1/vault` | `api.vault.clear` | `hoody vault clear` | Clear entire vault |
| GET | `/api/v1/vault/keys` | `api.vault.list` | `hoody vault list` | List vault keys |
| DELETE | `/api/v1/vault/keys/{key}` | `api.vault.delete` | `hoody vault delete` | Delete vault key |
| GET | `/api/v1/vault/keys/{key}` | `api.vault.get` | `hoody vault get` | Get vault key |
| PUT | `/api/v1/vault/keys/{key}` | `api.vault.set` | `hoody vault set` | Set vault key |
| GET | `/api/v1/vault/stats` | `api.vault.getStats` | `hoody vault stats` | Get vault statistics |
| PATCH | `/api/v1/waitlist` | `api.waitlist.waitlistEnrich` | — | Enrich an existing waitlist signup |
| POST | `/api/v1/waitlist` | `api.waitlist.waitlistJoin` | — | Join the Hoody waitlist |
| GET | `/api/v1/wallet/ai-fee-history` | `api.wallet.listAiFeeHistory` | `hoody wallet transactions fees` | Get AI credit fee history |
| GET | `/api/v1/wallet/balances` | `api.wallet.getAggregateBalances` | `hoody wallet balance get` | Get aggregate balances (general + AI) |
| GET | `/api/v1/wallet/balances/ai` | `api.wallet.getAiBalance` | `hoody wallet balance ai` | Get AI balance (limit, usage, remaining) |
| GET | `/api/v1/wallet/balances/general` | `api.wallet.getGeneralBalance` | `hoody wallet balance general` | Get general balance only |
| GET | `/api/v1/wallet/invoices/` | `api.wallet.listInvoices` | `hoody wallet invoices list` | Get all invoices |
| GET | `/api/v1/wallet/invoices/{id}` | `api.wallet.getInvoice` | `hoody wallet invoices get` | Get invoice by ID |
| GET | `/api/v1/wallet/invoices/{id}/pdf` | `api.wallet.downloadInvoicePdf` | `hoody wallet invoices download` | Download invoice PDF |
| POST | `/api/v1/wallet/invoices/generate/{id}` | `api.wallet.generateInvoice` | `hoody wallet invoices generate` | Generate invoice for transaction |
| GET | `/api/v1/wallet/payment-methods/` | `api.wallet.listPaymentMethods` | `hoody wallet payment-methods list` | Get all payment methods |
| POST | `/api/v1/wallet/payment-methods/` | `api.wallet.addPaymentMethod` | `hoody wallet payment-methods create` | Add a new payment method |
| DELETE | `/api/v1/wallet/payment-methods/{id}` | `api.wallet.deletePaymentMethod` | `hoody wallet payment-methods delete` | Delete a payment method |
| GET | `/api/v1/wallet/payment-methods/{id}` | `api.wallet.getPaymentMethod` | `hoody wallet payment-methods get` | Get payment method by ID |
| PUT | `/api/v1/wallet/payment-methods/{id}` | `api.wallet.updatePaymentMethod` | `hoody wallet payment-methods update` | Update a payment method |
| PUT | `/api/v1/wallet/payment-methods/{id}/default` | `api.wallet.setDefaultPaymentMethod` | `hoody wallet payment-methods set-default` | Set a payment method as default |
| POST | `/api/v1/wallet/payments/` | `api.wallet.processPayment` | `hoody wallet payments create` | Process a payment |
| GET | `/api/v1/wallet/payments/{id}` | `api.wallet.getPaymentStatus` | `hoody wallet payments status` | Get payment status |
| POST | `/api/v1/wallet/payments/stripe/checkout` | `api.wallet.createStripeCheckout` | — | Start a card payment (Stripe Checkout) |
| GET | `/api/v1/wallet/payments/stripe/intents` | `api.wallet.listStripePaymentIntents` | — | List card payment intents |
| GET | `/api/v1/wallet/payments/stripe/intents/{id}` | `api.wallet.getStripePaymentIntent` | — | Get a card payment intent |
| GET | `/api/v1/wallet/transactions` | `api.wallet.listTransactions` | `hoody wallet transactions list` | List transactions |
| GET | `/api/v1/wallet/transactions/{id}` | `api.wallet.getTransaction` | `hoody wallet transactions get` | Get transaction by ID |
| POST | `/api/v1/wallet/transfers` | `api.wallet.transferToAi` | `hoody wallet transfer` | Transfer from general balance to AI credits |

---

## `app` — 33 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| POST | `/api/v1/run/batch` | `app.execution.runBatch` | — | Execute a batch of search or run requests |
| GET | `/api/v1/run/config` | `app.configuration.get` | — | Get full runtime configuration |
| GET | `/api/v1/run/go/{rest}` | `app.execution.runPathBased` | — | Path-based resolve (positional or key-value) |
| GET | `/api/v1/run/health` | `app.health.check` | — | Service health check |
| GET | `/api/v1/run/jobs/{job_id}` | `app.jobs.getStatus` | — | Get job status |
| GET | `/api/v1/run/openapi.json` | `app.docs.getJson` | — | OpenAPI specification (JSON) |
| GET | `/api/v1/run/openapi.yaml` | `app.docs.getYaml` | — | OpenAPI specification (YAML) |
| POST | `/api/v1/run/preflight` | `app.execution.preflight` | — | Preflight a run request |
| GET | `/api/v1/run/profiles` | `app.profiles.list` | — | List all profiles |
| POST | `/api/v1/run/profiles` | `app.profiles.create` | — | Create a new profile |
| DELETE | `/api/v1/run/profiles/{profile}` | `app.profiles.delete` | — | Delete a profile |
| PATCH | `/api/v1/run/profiles/{profile}` | `app.profiles.update` | — | Update a profile |
| POST | `/api/v1/run/profiles/{profile}/select` | `app.profiles.select` | — | Select the active profile |
| GET | `/api/v1/run/recipes` | `app.recipes.list` | — | List saved launch recipes |
| POST | `/api/v1/run/recipes` | `app.recipes.create` | — | Create a saved recipe |
| DELETE | `/api/v1/run/recipes/{name}` | `app.recipes.delete` | — | Delete a saved recipe |
| GET | `/api/v1/run/recipes/{name}` | `app.recipes.get` | — | Get a saved recipe |
| PATCH | `/api/v1/run/recipes/{name}` | `app.recipes.update` | — | Update a saved recipe |
| POST | `/api/v1/run/recipes/{name}/run` | `app.recipes.run` | — | Run using a saved recipe |
| POST | `/api/v1/run/recipes/{name}/search` | `app.recipes.search` | — | Search using a saved recipe |
| GET | `/api/v1/run/run` | `app.execution.runAppGet` | — | Resolve an application and return exact shell command |
| POST | `/api/v1/run/run` | `app.execution.runAppPost` | — | Resolve an application via JSON body |
| GET | `/api/v1/run/search` | `app.execution.searchCandidates` | — | Search for app candidates |
| POST | `/api/v1/run/search/jobs` | `app.jobs.createSearch` | — | Start an async search job |
| POST | `/api/v1/run/search/paged` | `app.execution.searchCandidatesPaged` | — | Search for app candidates with cursor pagination |
| GET | `/api/v1/run/sources` | `app.sources.list` | — | List all package sources |
| POST | `/api/v1/run/sources` | `app.sources.create` | — | Create a new package source |
| DELETE | `/api/v1/run/sources/{source_id}` | `app.sources.delete` | — | Delete a package source |
| PATCH | `/api/v1/run/sources/{source_id}` | `app.sources.update` | — | Update a package source |
| GET | `/api/v1/run/sources/{source_id}/diagnostics` | `app.sources.getDiagnostics` | — | Get runtime diagnostics for a source |
| POST | `/api/v1/run/sources/{source_id}/sync` | `app.sources.sync` | — | Sync a single source |
| POST | `/api/v1/run/sources/sync` | `app.sources.syncAll` | — | Sync all sources |
| GET | `/api/v1/run/t/{terminal_id}/go/{rest}` | `app.execution.runTerminalAnchored` | — | Terminal-anchored path-based resolve |

---

## `browser` — 27 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/browser/health` | `browser.health.check` | `hoody browser health` | Health check |
| GET | `/browse` | `browser.interaction.browse` | `hoody browser navigate` | Navigate to URL |
| POST | `/browse` | `browser.interaction.browsePost` | `hoody browser navigate-post` | Navigate to URL (POST) |
| GET | `/console` | `browser.debugging.getConsoleLogs` | `hoody browser console` | Get console logs |
| DELETE | `/cookies` | `browser.cookies.clear` | `hoody browser cookies clear` | Clear all cookies |
| GET | `/cookies` | `browser.cookies.get` | `hoody browser cookies get` | Get cookies |
| POST | `/cookies` | `browser.cookies.set` | `hoody browser cookies set` | Set cookies |
| GET | `/devtools-url` | `browser.introspection.getDevtoolsUrl` | `hoody browser devtools` | Get DevTools URLs |
| GET | `/eval` | `browser.interaction.evalGet` | `hoody browser eval` | Execute JavaScript |
| POST | `/eval` | `browser.interaction.evalPost` | `hoody browser eval-post` | Execute JavaScript (POST) |
| DELETE | `/history` | `browser.history.clear` | `hoody browser history delete` | Delete browsing history |
| GET | `/history` | `browser.history.list` | `hoody browser history query` | Query browsing history |
| GET | `/html` | `browser.page.getHtml` | `hoody browser html` | Get page HTML |
| GET | `/metadata` | `browser.introspection.getMetadata` | `hoody browser info` | Get instance metadata |
| GET | `/metrics` | `browser.health.getMetrics` | `hoody browser metrics` | Server metrics |
| GET | `/network` | `browser.debugging.getNetworkLogs` | `hoody browser network` | Get network logs |
| GET | `/openapi.json` | `browser.health.getOpenApiJson` | — | Get OpenAPI specification (JSON) |
| GET | `/openapi.yaml` | `browser.health.getOpenApiYaml` | — | Get OpenAPI specification (YAML) |
| GET | `/pdf` | `browser.page.exportPdf` | `hoody browser pdf` | Export page as PDF |
| GET | `/restart` | `browser.instances.restart` | `hoody browser restart` | Restart browser instance |
| GET | `/screenshot` | `browser.interaction.takeScreenshot` | `hoody browser screenshot` | Capture browser screenshot |
| GET | `/shutdown` | `browser.introspection.shutdown` | `hoody browser shutdown` | Shutdown browser instance |
| GET | `/start` | `browser.instances.start` | `hoody browser start` | Create or retrieve browser instance |
| GET | `/stop` | `browser.instances.stop` | `hoody browser stop` | Stop browser instance |
| POST | `/tab/close` | `browser.introspection.closeTab` | `hoody browser tabs close` | Close a browser tab |
| GET | `/tabs` | `browser.introspection.listTabs` | `hoody browser tabs list` | List browser tabs |
| GET | `/text` | `browser.page.getText` | `hoody browser text` | Get page text |

---

## `code` — 17 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/_static/{path}` | `code.static.get` | — | Get static asset |
| GET | `/api/v1/code` | `code.vscode.getVSCode` | — | Get VS Code web interface |
| GET | `/api/v1/code/absproxy/{port}/{path}` | `code.proxy.resolveAbsolute` | — | Proxy to local port (absolute path) |
| POST | `/api/v1/code/extensions/install` | `code.extensions.install` | `hoody code extensions install` | Install VS Code extension from URL |
| GET | `/api/v1/code/extensions/list` | `code.extensions.list` | `hoody code extensions list` | List installed extensions |
| GET | `/api/v1/code/health` | `code.health.check` | `hoody code health` | Service health check |
| GET | `/api/v1/code/login` | `code.auth.getLoginPage` | — | Get login page |
| POST | `/api/v1/code/login` | `code.auth.login` | — | Submit login credentials |
| GET | `/api/v1/code/logout` | `code.auth.logout` | — | Logout |
| GET | `/api/v1/code/manifest.json` | `code.vscode.getManifest` | — | Get PWA manifest |
| POST | `/api/v1/code/mint-key` | `code.vscode.mintKey` | `hoody code auth mint-key` | Generate server web key |
| GET | `/api/v1/code/proxy/{port}/{path}` | `code.proxy.resolve` | — | Proxy to local port (path-based) |
| GET | `/api/v1/code/update/check` | `code.health.checkUpdate` | `hoody code check-update` | Check for updates |
| GET | `/hoody-code/injected/{script}` | `code.static.getInjectedScript` | — | Get Hoody Code injected script |
| GET | `/openapi.yaml` | `code.static.getOpenAPI` | — | Get OpenAPI specification |
| GET | `/robots.txt` | `code.static.getRobots` | — | Get robots.txt |
| GET | `/security.txt` | `code.static.getSecurityPolicy` | — | Get security policy |

---

## `cron` — 11 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/crontab` | `cron.crontab.listGlobal` | `hoody cron crontabs list` | List All Crontabs |
| GET | `/health` | `cron.health.check` | `hoody cron health` | Health Check |
| GET | `/openapi.json` | `cron.system.getOpenApiJson` | — | Get Open Api Json |
| GET | `/openapi.yaml` | `cron.system.getOpenApiYaml` | — | Get Open Api Yaml |
| GET | `/users/{user}/crontab` | `cron.crontab.get` | `hoody cron crontabs get` | Get Crontab |
| PUT | `/users/{user}/crontab` | `cron.crontab.put` | `hoody cron crontabs replace` | Put Crontab |
| GET | `/users/{user}/entries` | `cron.entries.list` | `hoody cron entries list` | List Entries |
| POST | `/users/{user}/entries` | `cron.entries.create` | `hoody cron entries create` | Create Entry |
| DELETE | `/users/{user}/entries/{id}` | `cron.entries.delete` | `hoody cron entries delete` | Delete Entry |
| GET | `/users/{user}/entries/{id}` | `cron.entries.get` | `hoody cron entries get` | Get Entry |
| PATCH | `/users/{user}/entries/{id}` | `cron.entries.update` | `hoody cron entries update` | Update Entry |

---

## `curl` — 23 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/curl/channel` | `curl.events.wsRequestChannel` | — | Execute cURL requests over a WebSocket channel |
| GET | `/api/v1/curl/health` | `curl.health.check` | `hoody curl health` | Service health check |
| GET | `/api/v1/curl/jobs` | `curl.jobs.list` | `hoody curl jobs list` | List all async jobs |
| DELETE | `/api/v1/curl/jobs/{id}` | `curl.jobs.cancel` | `hoody curl jobs cancel` | Cancel a pending or running job |
| GET | `/api/v1/curl/jobs/{id}` | `curl.jobs.get` | `hoody curl jobs get` | Get detailed job information |
| GET | `/api/v1/curl/jobs/{id}/result` | `curl.jobs.getResult` | `hoody curl jobs result` | Get job response body |
| GET | `/api/v1/curl/request` | `curl.executeCurlRequestGet` | `hoody curl get-url` | Execute simple HTTP request via query parameters |
| POST | `/api/v1/curl/request` | `curl.execute` | `hoody curl exec` | Execute HTTP request with full cURL capabilities |
| GET | `/api/v1/curl/schedule` | `curl.schedules.list` | `hoody curl schedules list` | List all scheduled jobs |
| POST | `/api/v1/curl/schedule` | `curl.schedules.create` | `hoody curl schedules create` | Create a recurring scheduled job |
| DELETE | `/api/v1/curl/schedule/{id}` | `curl.schedules.delete` | `hoody curl schedules delete` | Delete a schedule |
| GET | `/api/v1/curl/schedule/{id}` | `curl.schedules.get` | `hoody curl schedules get` | Get schedule details |
| PATCH | `/api/v1/curl/schedule/{id}/toggle` | `curl.schedules.toggle` | `hoody curl schedules toggle` | Enable or disable a schedule |
| GET | `/api/v1/curl/sessions` | `curl.sessions.list` | `hoody curl sessions list` | List all cookie sessions |
| DELETE | `/api/v1/curl/sessions/{id}` | `curl.sessions.delete` | `hoody curl sessions delete` | Delete a session |
| GET | `/api/v1/curl/sessions/{id}` | `curl.sessions.get` | `hoody curl sessions get` | Get session details |
| GET | `/api/v1/curl/sessions/{id}/cookies` | `curl.sessions.getCookies` | `hoody curl sessions cookies` | Get session cookies only |
| GET | `/api/v1/curl/sse` | `curl.events.sseJobEvents` | — | Subscribe to job events over Server-Sent Events |
| GET | `/api/v1/curl/storage` | `curl.storage.list` | `hoody curl storage list` | List all saved downloads |
| DELETE | `/api/v1/curl/storage/{path}` | `curl.storage.deleteFile` | `hoody curl storage delete` | Delete a saved file |
| GET | `/api/v1/curl/storage/{path}` | `curl.storage.getFile` | `hoody curl storage get` | Download a saved file |
| GET | `/api/v1/curl/ws` | `curl.events.streamWs` | `hoody curl jobs events` | Subscribe to job events over WebSocket |
| GET | `/metrics` | `curl.ops.metrics` | `hoody curl metrics` | Prometheus metrics |

---

## `daemon` — 19 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/daemon/health` | `daemon.health.check` | `hoody daemon health` | Service health check |
| GET | `/api/v1/daemon/programs` | `daemon.programs.list` | `hoody daemon programs list` | List all programs |
| GET | `/api/v1/daemon/programs/{id}` | `daemon.programs.get` | `hoody daemon programs get` | Get a specific program |
| POST | `/api/v1/daemon/programs/{id}/disable` | `daemon.control.disable` | `hoody daemon programs disable` | Disable a program |
| POST | `/api/v1/daemon/programs/{id}/enable` | `daemon.control.enable` | `hoody daemon programs enable` | Enable a program |
| GET | `/api/v1/daemon/programs/{id}/logs` | `daemon.status.getLogs` | `hoody daemon programs logs` | Get program logs |
| POST | `/api/v1/daemon/programs/{id}/start` | `daemon.control.start` | `hoody daemon programs start` | Start a program or port instance |
| POST | `/api/v1/daemon/programs/{id}/stop` | `daemon.control.stop` | `hoody daemon programs stop` | Stop a program or port instance |
| POST | `/api/v1/daemon/programs/add` | `daemon.programs.add` | `hoody daemon programs create` | Add a new CUSTOM program |
| POST | `/api/v1/daemon/programs/edit/{id}` | `daemon.programs.edit` | `hoody daemon programs edit` | Edit a program |
| POST | `/api/v1/daemon/programs/remove/{id}` | `daemon.programs.remove` | `hoody daemon programs delete` | Remove a program |
| POST | `/api/v1/daemon/programs/reset` | `daemon.programs.reset` | `hoody daemon programs reset` | Reset programs to default |
| GET | `/api/v1/daemon/quick-start` | `daemon.quickStart.list` | `hoody daemon ephemeral list` | List all ephemeral programs |
| POST | `/api/v1/daemon/quick-start` | `daemon.quickStart.launch` | `hoody daemon ephemeral start` | Launch ephemeral CUSTOM program |
| GET | `/api/v1/daemon/quick-start/{id}/logs` | `daemon.quickStart.getEphemeralLogs` | `hoody daemon ephemeral logs` | Get ephemeral program logs |
| GET | `/api/v1/daemon/quick-start/{id}/status` | `daemon.quickStart.getStatus` | `hoody daemon ephemeral status` | Get ephemeral program status |
| POST | `/api/v1/daemon/quick-start/{id}/stop` | `daemon.quickStart.stop` | `hoody daemon ephemeral stop` | Stop ephemeral program |
| GET | `/api/v1/daemon/status` | `daemon.status.getAll` | `hoody daemon programs statuses` | Get all program statuses |
| GET | `/api/v1/daemon/status/{id}` | `daemon.status.get` | `hoody daemon programs status` | Get specific program status |

---

## `display` — 47 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/display/` | `display.accessClient` | `hoody display access` | Access the HTML5 Display client interface |
| GET | `/api/v1/display/clipboard` | `display.getClipboard` | `hoody display clipboard get` | Read clipboard text |
| POST | `/api/v1/display/clipboard` | `display.setClipboard` | `hoody display clipboard set` | Write clipboard text |
| GET | `/api/v1/display/health` | `display.health.check` | `hoody display health` | Service health check |
| GET | `/api/v1/display/info` | `display.getInformation` | `hoody display info` | Get display information and screenshots |
| POST | `/api/v1/display/input/act` | `display.input.act` | `hoody display input act` | Execute one action with optional screenshot |
| POST | `/api/v1/display/input/batch` | `display.input.batch` | `hoody display input batch` | Execute a sequence of actions |
| POST | `/api/v1/display/input/click-at` | `display.input.clickAt` | `hoody display input click-at` | Move cursor and click |
| GET | `/api/v1/display/input/display-geometry` | `display.input.geometry` | `hoody display input geometry` | Get display dimensions |
| POST | `/api/v1/display/input/drag` | `display.input.drag` | `hoody display input drag` | Drag from one position to another |
| POST | `/api/v1/display/input/reset` | `display.input.reset` | `hoody display input reset` | Emergency release all inputs |
| POST | `/api/v1/display/input/select` | `display.input.select` | `hoody display input select` | Select a range via click + shift-click |
| POST | `/api/v1/display/input/type-at` | `display.input.typeAt` | `hoody display input type-at` | Move, click, and type in one operation |
| POST | `/api/v1/display/input/wait` | `display.input.wait` | `hoody display input wait` | Wait for a duration with optional screenshot |
| POST | `/api/v1/display/keyboard/key` | `display.input.keyboardKey` | `hoody display keyboard key` | Press key combinations |
| POST | `/api/v1/display/keyboard/key-down` | `display.input.keyboardKeyDown` | `hoody display keyboard key-down` | Hold a key down |
| POST | `/api/v1/display/keyboard/key-up` | `display.input.keyboardKeyUp` | `hoody display keyboard key-up` | Release a held key |
| POST | `/api/v1/display/keyboard/type` | `display.input.keyboardType` | `hoody display keyboard type` | Type a string of text |
| POST | `/api/v1/display/mouse/click` | `display.input.mouseClick` | `hoody display mouse click` | Click a mouse button |
| POST | `/api/v1/display/mouse/double-click` | `display.input.mouseDoubleClick` | `hoody display mouse double-click` | Double-click a mouse button |
| POST | `/api/v1/display/mouse/down` | `display.input.mouseDown` | `hoody display mouse down` | Press and hold a mouse button |
| GET | `/api/v1/display/mouse/location` | `display.input.mouseLocation` | `hoody display mouse location` | Get cursor position |
| POST | `/api/v1/display/mouse/move` | `display.input.mouseMove` | `hoody display mouse move` | Move cursor to absolute position |
| POST | `/api/v1/display/mouse/move-relative` | `display.input.mouseMoveRelative` | `hoody display mouse move-relative` | Move cursor by offset |
| POST | `/api/v1/display/mouse/scroll` | `display.input.mouseScroll` | `hoody display mouse scroll` | Scroll in a direction |
| POST | `/api/v1/display/mouse/up` | `display.input.mouseUp` | `hoody display mouse up` | Release a mouse button |
| GET | `/api/v1/display/screenshot` | `display.screenshots.capture` | `hoody display screenshots capture` | Capture a new screenshot |
| GET | `/api/v1/display/screenshot/{timestamp}` | `display.screenshots.getByTimestamp` | `hoody display screenshots by-timestamp` | Retrieve a specific screenshot by timestamp |
| GET | `/api/v1/display/screenshot/info` | `display.screenshots.captureMetadata` | `hoody display screenshots capture-metadata` | Capture screenshot and return metadata only |
| GET | `/api/v1/display/screenshot/last` | `display.screenshots.getLatest` | `hoody display screenshots latest` | Retrieve the most recent screenshot |
| GET | `/api/v1/display/screenshot/last/info` | `display.screenshots.getLatestMetadata` | `hoody display screenshots latest-metadata` | Get metadata for the most recent screenshot |
| GET | `/api/v1/display/screenshots` | `display.listScreenshots` | `hoody display screenshots list` | List all available screenshots |
| GET | `/api/v1/display/thumbnail` | `display.thumbnails.capture` | `hoody display thumbnails capture` | Capture a new screenshot thumbnail |
| GET | `/api/v1/display/thumbnail/{timestamp}` | `display.thumbnails.getByTimestamp` | `hoody display thumbnails by-timestamp` | Retrieve a specific thumbnail by timestamp |
| GET | `/api/v1/display/thumbnail/last` | `display.thumbnails.getLatest` | `hoody display thumbnails latest` | Retrieve the most recent thumbnail |
| GET | `/api/v1/display/window/{windowId}/geometry` | `display.input.windowGeometry` | `hoody display windows geometry` | Get window position and size |
| GET | `/api/v1/display/window/{windowId}/name` | `display.input.windowName` | `hoody display windows name` | Get window title |
| GET | `/api/v1/display/window/{windowId}/properties` | `display.getWindowProperties` | `hoody display windows properties` | Get extended properties for a window |
| GET | `/api/v1/display/window/active` | `display.input.windowActive` | `hoody display windows active` | Get the active window ID |
| POST | `/api/v1/display/window/close` | `display.input.windowClose` | `hoody display windows close` | Close a window |
| POST | `/api/v1/display/window/focus` | `display.input.windowFocus` | `hoody display windows focus` | Focus/activate a window |
| POST | `/api/v1/display/window/minimize` | `display.input.windowMinimize` | `hoody display windows minimize` | Minimize a window |
| POST | `/api/v1/display/window/move` | `display.input.windowMove` | `hoody display windows move` | Move a window |
| POST | `/api/v1/display/window/raise` | `display.input.windowRaise` | `hoody display windows raise` | Raise a window to the top |
| POST | `/api/v1/display/window/resize` | `display.input.windowResize` | `hoody display windows resize` | Resize a window |
| POST | `/api/v1/display/window/search` | `display.input.windowSearch` | `hoody display windows search` | Search for windows by pattern |
| GET | `/api/v1/display/windows` | `display.listWindows` | `hoody display windows list` | List windows on the current display |

---

## `exec` — 69 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/{path}` | `exec.execution.execute` | — | Execute Script (GET) |
| POST | `/api/v1/exec/cache/clear` | `exec.cache.clear` | `hoody exec system cache-clear` | Clear Cache |
| GET | `/api/v1/exec/dependencies/bundled` | `exec.dependencies.listBundled` | `hoody exec packages list` | List Bundled Dependencies |
| POST | `/api/v1/exec/dependencies/check` | `exec.dependencies.check` | `hoody exec packages check` | Check Dependencies |
| POST | `/api/v1/exec/dependencies/install` | `exec.dependencies.install` | `hoody exec packages add-modules` | Install Dependencies |
| GET | `/api/v1/exec/health` | `exec.health.check` | `hoody exec health` | Health Check |
| GET | `/api/v1/exec/list` | `exec.ids.list` | `hoody exec namespaces list` | List All Exec Ids |
| DELETE | `/api/v1/exec/logs/clear` | `exec.logs.clear` | `hoody exec logs clear` | Clear Logs |
| GET | `/api/v1/exec/logs/list` | `exec.logs.list` | `hoody exec logs list` | List Logs |
| POST | `/api/v1/exec/logs/read` | `exec.logs.read` | `hoody exec logs read` | Read Log |
| POST | `/api/v1/exec/logs/search` | `exec.logs.search` | `hoody exec logs search` | Search Logs |
| GET | `/api/v1/exec/logs/stream` | `exec.logs.stream` | `hoody exec logs stream` | Stream Logs |
| POST | `/api/v1/exec/magic-comments/bulk-update` | `exec.magic.bulkUpdate` | `hoody exec magic-comments bulk-update` | Bulk Update Magic Comments |
| GET | `/api/v1/exec/magic-comments/read` | `exec.magic.read` | `hoody exec magic-comments read` | Read Magic Comments |
| GET | `/api/v1/exec/magic-comments/schema` | `exec.magic.getSchema` | `hoody exec magic-comments schema` | Get Magic Comments Schema |
| PUT | `/api/v1/exec/magic-comments/update` | `exec.magic.updateHandler` | `hoody exec magic-comments update` | Update Magic Comments Handler |
| GET | `/api/v1/exec/monitor/active-requests` | `exec.monitor.getActiveRequests` | `hoody exec system active-requests` | Get Active Requests |
| GET | `/api/v1/exec/monitor/metrics` | `exec.monitor.prometheusExport` | `hoody exec system prometheus` | Prometheus Export |
| POST | `/api/v1/exec/monitor/script-performance` | `exec.monitor.getScriptPerformance` | `hoody exec scripts performance` | Get Script Performance |
| GET | `/api/v1/exec/monitor/scripts` | `exec.monitor.listMonitorScripts` | — | List Monitor Scripts |
| GET | `/api/v1/exec/monitor/stats` | `exec.monitor.getStats` | `hoody exec system stats` | Get Stats |
| POST | `/api/v1/exec/package/compare` | `exec.package.compare` | `hoody exec packages compare` | Compare Packages |
| POST | `/api/v1/exec/package/init` | `exec.package.initJson` | `hoody exec packages json init` | Init package.json |
| POST | `/api/v1/exec/package/install` | `exec.package.install` | `hoody exec packages install` | Install Packages |
| POST | `/api/v1/exec/package/pin` | `exec.package.pinVersions` | `hoody exec packages pin` | Pin Versions |
| GET | `/api/v1/exec/package/read` | `exec.package.readJson` | `hoody exec packages json read` | Read package.json |
| POST | `/api/v1/exec/package/update` | `exec.package.updateJson` | `hoody exec packages json update` | Update package.json |
| POST | `/api/v1/exec/route/discover` | `exec.route.discover` | `hoody exec routes discover` | Discover Routes |
| POST | `/api/v1/exec/route/resolve` | `exec.route.resolve` | `hoody exec routes resolve` | Resolve Route |
| POST | `/api/v1/exec/route/test` | `exec.route.test` | `hoody exec routes test` | Test Route |
| GET | `/api/v1/exec/schedules/history` | `exec.schedules.scheduleHistory` | `hoody exec schedules history` | Schedule History |
| GET | `/api/v1/exec/schedules/list` | `exec.schedules.listSchedules` | `hoody exec schedules list` | List Schedules |
| POST | `/api/v1/exec/schedules/reload` | `exec.schedules.reloadSchedules` | `hoody exec schedules reload` | Reload Schedules |
| POST | `/api/v1/exec/schedules/trigger` | `exec.schedules.triggerSchedule` | `hoody exec schedules trigger` | Trigger Schedule |
| DELETE | `/api/v1/exec/scripts/delete` | `exec.scripts.delete` | `hoody exec scripts delete` | Delete Script |
| GET | `/api/v1/exec/scripts/list` | `exec.scripts.list` | `hoody exec scripts list` | List Scripts |
| POST | `/api/v1/exec/scripts/move` | `exec.scripts.move` | `hoody exec scripts move` | Move Script |
| GET | `/api/v1/exec/scripts/read` | `exec.scripts.read` | `hoody exec scripts read` | Read Script |
| POST | `/api/v1/exec/scripts/tree` | `exec.scripts.getTree` | `hoody exec scripts tree` | Get Script Tree |
| POST | `/api/v1/exec/scripts/write` | `exec.scripts.write` | `hoody exec scripts write` | Write Script |
| DELETE | `/api/v1/exec/sdk/:id` | `exec.sdk.delete` | `hoody exec sdks delete` | Delete SDK |
| GET | `/api/v1/exec/sdk/:id` | `exec.sdk.get` | `hoody exec sdks get` | Get SDK |
| POST | `/api/v1/exec/sdk/import` | `exec.sdk.importSDK` | `hoody exec sdks import` | Import SDK |
| GET | `/api/v1/exec/sdk/list` | `exec.sdk.list` | `hoody exec sdks list` | List SDKs |
| POST | `/api/v1/exec/shared-state/clear` | `exec.state.clear` | `hoody exec state clear` | Clear Shared State |
| POST | `/api/v1/exec/shared-state/get` | `exec.state.get` | `hoody exec state get` | Get Shared State |
| POST | `/api/v1/exec/shared-state/set` | `exec.state.set` | `hoody exec state set` | Set Shared State |
| POST | `/api/v1/exec/system/restart` | `exec.system.restartServer` | `hoody exec system restart` | Restart Server |
| GET | `/api/v1/exec/system/restart-status` | `exec.system.getRestartStatus` | `hoody exec system restart-status` | Get Restart Status |
| POST | `/api/v1/exec/templates/create-custom` | `exec.templates.createCustom` | `hoody exec templates create` | Create Custom Template |
| DELETE | `/api/v1/exec/templates/delete-custom/:name` | `exec.templates.deleteCustom` | `hoody exec templates delete` | Delete Custom Template |
| POST | `/api/v1/exec/templates/generate` | `exec.templates.generate` | `hoody exec templates generate` | Generate From Template |
| GET | `/api/v1/exec/templates/list` | `exec.templates.list` | `hoody exec templates list` | List Templates |
| GET | `/api/v1/exec/templates/preview` | `exec.templates.preview` | `hoody exec templates preview` | Preview Template |
| PUT | `/api/v1/exec/templates/update-custom/:name` | `exec.templates.updateCustom` | `hoody exec templates update` | Update Custom Template |
| POST | `/api/v1/exec/user-openapi/generate` | `exec.openapi.generate` | `hoody exec openapi generate` | Generate User OpenAPI |
| GET | `/api/v1/exec/user-openapi/list` | `exec.openapi.listScripts` | `hoody exec scripts list-user` | List User Scripts |
| POST | `/api/v1/exec/user-openapi/merge` | `exec.openapi.merge` | `hoody exec openapi merge` | Merge OpenAPI Specs |
| GET | `/api/v1/exec/user-openapi/schema` | `exec.openapi.serveSchema` | `hoody exec openapi serve-schema` | Serve Schema File |
| GET | `/api/v1/exec/user-openapi/spec` | `exec.openapi.serve` | `hoody exec openapi serve` | Serve Generated Spec |
| POST | `/api/v1/exec/user-openapi/validate` | `exec.openapi.validateSchema` | `hoody exec validate user-schema` | Validate User Schema |
| POST | `/api/v1/exec/validate/dependencies` | `exec.validate.validateDependencies` | `hoody exec validate dependencies` | Validate Dependencies |
| POST | `/api/v1/exec/validate/magic-comments` | `exec.validate.validateMagicComments` | `hoody exec validate magic-comments` | Validate Magic Comments |
| POST | `/api/v1/exec/validate/return-type` | `exec.validate.validateReturnType` | `hoody exec validate return-type` | Validate Return Type |
| POST | `/api/v1/exec/validate/script` | `exec.validate.validateScript` | `hoody exec validate script` | Validate Script |
| POST | `/api/v1/exec/validate/syntax` | `exec.validate.validateSyntax` | `hoody exec validate syntax` | Validate Syntax |
| POST | `/api/v1/exec/validate/typescript` | `exec.validate.validateTypeScript` | `hoody exec validate types` | Validate TypeScript |
| GET | `/openapi.json` | `exec.system.getOpenApiJson` | — | Get OpenAPI Specification (JSON) |
| GET | `/openapi.yaml` | `exec.system.getOpenApiYaml` | — | Get OpenAPI Specification (YAML) |

---

## `files` — 127 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/?download_history` | `files.downloads.getHistory` | `hoody files downloads history` | Download history |
| GET | `/?extraction_history` | `files.archives.getHistory` | `hoody files extractions history` | Extraction history |
| GET | `/?extractions` | `files.archives.listActive` | `hoody files extractions active` | List active extractions |
| GET | `/{archive}?extract` | `files.archives.extract` | `hoody files extractions create` | Extract archive |
| GET | `/{archive}?extract_file` | `files.archives.extractFile` | `hoody files extractions extract-file` | Extract file from archive |
| GET | `/{archive}?preview` | `files.archives.preview` | `hoody files archive preview` | Preview archive contents or read file |
| GET | `/{archive}?view_file` | `files.archives.viewFile` | `hoody files archive view` | View file from archive |
| GET | `/{directory}?download` | `files.downloads.fetch` | `hoody files downloads url` | Download file from remote URL |
| GET | `/{directory}?downloads` | `files.downloads.listActive` | `hoody files downloads active` | List active downloads |
| GET | `/{directory}?q` | `files.search` | `hoody files search` | Search directory |
| GET | `/{directory}?zip` | `files.archives.downloadAsZip` | `hoody files downloads zip` | Download directory as ZIP |
| GET | `/{image}?thumbnail` | `files.images.process` | `hoody files process-image` | Process and convert images |
| CHECKAUTH | `/{path}` | `files.authentication.checkAuth` | — | Check authentication status |
| COPY | `/{path}` | `files.webdav.copyResource` | — | Copy file or directory |
| DELETE | `/{path}` | `files.deleteRecursive` | `hoody files delete-recursive` | Delete file or directory |
| GET | `/{path}` | `files.listDirectory` | `hoody files dir` | List directory contents or download file |
| HEAD | `/{path}` | `files.getMetadata` | `hoody files metadata` | Get file metadata |
| LOCK | `/{path}` | `files.webdav.lockResource` | — | Lock file (WebDAV compatibility) |
| LOGOUT | `/{path}` | `files.authentication.logout` | — | Clear authentication |
| MKCOL | `/{path}` | `files.directories.create` | — | Create directory |
| MOVE | `/{path}` | `files.webdav.moveResource` | — | Move or rename file/directory |
| OPTIONS | `/{path}` | `files.webdav.getOptions` | `hoody files options` | Get allowed methods |
| PATCH | `/{path}` | `files.patch` | `hoody files patch` | File operations |
| PROPFIND | `/{path}` | `files.webdav.propfindResource` | — | Get WebDAV properties |
| PROPPATCH | `/{path}` | `files.webdav.proppatchResource` | — | Update WebDAV properties |
| PUT | `/{path}` | `files.upload` | `hoody files upload` | Upload file |
| UNLOCK | `/{path}` | `files.webdav.unlockResource` | — | Unlock file (WebDAV compatibility) |
| PUT | `/{path}?touch` | `files.touch` | `hoody files touch` | Touch file (create or update mtime) |
| GET | `/{path}?type=ftp` | `files.ftp.access` | `hoody files access ftp` | Access file via FTP |
| GET | `/{path}?type=git` | `files.git.fetch` | `hoody files fetch-from-git` | Fetch file from Git repository |
| GET | `/{path}?type=s3` | `files.s3.access` | `hoody files access s3` | Access file from S3 |
| GET | `/{path}?type=ssh` | `files.ssh.access` | `hoody files access ssh` | Access file via SSH/SFTP |
| PUT | `/{path}?type=ssh` | `files.ssh.upload` | `hoody files access ssh-upload` | Upload file via SSH/SFTP |
| GET | `/{path}?type=webdav` | `files.webdav.access` | `hoody files access webdav` | Access file via WebDAV |
| GET | `/api/v1/backends` | `files.backends.list` | `hoody files backends list` | List all backends |
| DELETE | `/api/v1/backends/{id}` | `files.backends.disconnect` | `hoody files backends disconnect` | Disconnect backend |
| GET | `/api/v1/backends/{id}` | `files.backends.getDetails` | `hoody files backends get` | Get backend details |
| PUT | `/api/v1/backends/{id}` | `files.backends.update` | `hoody files backends update` | Update backend credentials |
| GET | `/api/v1/backends/{id}/test` | `files.backends.testConnection` | `hoody files backends test` | Test backend connection |
| POST | `/api/v1/backends/alias` | `files.backends.connectAlias` | `hoody files backends connect alias` | Connect to alias backend |
| POST | `/api/v1/backends/azureblob` | `files.backends.connectAzureblob` | `hoody files backends connect azureblob` | Connect to azureblob backend |
| POST | `/api/v1/backends/azurefiles` | `files.backends.connectAzurefiles` | `hoody files backends connect azurefiles` | Connect to azurefiles backend |
| POST | `/api/v1/backends/b2` | `files.backends.connectB2` | `hoody files backends connect b2` | Connect to b2 backend |
| POST | `/api/v1/backends/box` | `files.backends.connectBox` | `hoody files backends connect box` | Connect to box backend |
| POST | `/api/v1/backends/cache` | `files.backends.connectCache` | `hoody files backends connect cache` | Connect to cache backend |
| POST | `/api/v1/backends/chunker` | `files.backends.connectChunker` | `hoody files backends connect chunker` | Connect to chunker backend |
| POST | `/api/v1/backends/cloudinary` | `files.backends.connectCloudinary` | `hoody files backends connect cloudinary` | Connect to cloudinary backend |
| POST | `/api/v1/backends/combine` | `files.backends.connectCombine` | `hoody files backends connect combine` | Connect to combine backend |
| POST | `/api/v1/backends/compress` | `files.backends.connectCompress` | `hoody files backends connect compress` | Connect to compress backend |
| POST | `/api/v1/backends/crypt` | `files.backends.connectCrypt` | `hoody files backends connect crypt` | Connect to crypt backend |
| POST | `/api/v1/backends/drive` | `files.backends.connectDrive` | `hoody files backends connect drive` | Connect to drive backend |
| POST | `/api/v1/backends/dropbox` | `files.backends.connectDropbox` | `hoody files backends connect dropbox` | Connect to dropbox backend |
| POST | `/api/v1/backends/fichier` | `files.backends.connectFichier` | `hoody files backends connect fichier` | Connect to fichier backend |
| POST | `/api/v1/backends/filefabric` | `files.backends.connectFilefabric` | `hoody files backends connect filefabric` | Connect to filefabric backend |
| POST | `/api/v1/backends/filescom` | `files.backends.connectFilescom` | `hoody files backends connect filescom` | Connect to filescom backend |
| POST | `/api/v1/backends/ftp` | `files.backends.connectFtp` | `hoody files backends connect ftp` | Connect to ftp backend |
| POST | `/api/v1/backends/gofile` | `files.backends.connectGofile` | `hoody files backends connect gofile` | Connect to gofile backend |
| POST | `/api/v1/backends/google-cloud-storage` | `files.backends.connectGoogleCloudStorage` | `hoody files backends connect google-cloud-storage` | Connect to google cloud storage backend |
| POST | `/api/v1/backends/google-photos` | `files.backends.connectGooglePhotos` | `hoody files backends connect google-photos` | Connect to google photos backend |
| POST | `/api/v1/backends/hasher` | `files.backends.connectHasher` | `hoody files backends connect hasher` | Connect to hasher backend |
| POST | `/api/v1/backends/hdfs` | `files.backends.connectHdfs` | `hoody files backends connect hdfs` | Connect to hdfs backend |
| POST | `/api/v1/backends/hidrive` | `files.backends.connectHidrive` | `hoody files backends connect hidrive` | Connect to hidrive backend |
| POST | `/api/v1/backends/http` | `files.backends.connectHttp` | `hoody files backends connect http` | Connect to http backend |
| POST | `/api/v1/backends/iclouddrive` | `files.backends.connectIclouddrive` | `hoody files backends connect iclouddrive` | Connect to iclouddrive backend |
| POST | `/api/v1/backends/imagekit` | `files.backends.connectImagekit` | `hoody files backends connect imagekit` | Connect to imagekit backend |
| POST | `/api/v1/backends/internetarchive` | `files.backends.connectInternetarchive` | `hoody files backends connect internetarchive` | Connect to internetarchive backend |
| POST | `/api/v1/backends/jottacloud` | `files.backends.connectJottacloud` | `hoody files backends connect jottacloud` | Connect to jottacloud backend |
| POST | `/api/v1/backends/koofr` | `files.backends.connectKoofr` | `hoody files backends connect koofr` | Connect to koofr backend |
| POST | `/api/v1/backends/linkbox` | `files.backends.connectLinkbox` | `hoody files backends connect linkbox` | Connect to linkbox backend |
| POST | `/api/v1/backends/local` | `files.backends.connectLocal` | `hoody files backends connect local` | Connect to local backend |
| POST | `/api/v1/backends/mailru` | `files.backends.connectMailru` | `hoody files backends connect mailru` | Connect to mailru backend |
| POST | `/api/v1/backends/mega` | `files.backends.connectMega` | `hoody files backends connect mega` | Connect to mega backend |
| POST | `/api/v1/backends/memory` | `files.backends.connectMemory` | `hoody files backends connect memory` | Connect to memory backend |
| POST | `/api/v1/backends/netstorage` | `files.backends.connectNetstorage` | `hoody files backends connect netstorage` | Connect to netstorage backend |
| POST | `/api/v1/backends/onedrive` | `files.backends.connectOnedrive` | `hoody files backends connect onedrive` | Connect to onedrive backend |
| POST | `/api/v1/backends/opendrive` | `files.backends.connectOpendrive` | `hoody files backends connect opendrive` | Connect to opendrive backend |
| POST | `/api/v1/backends/oracleobjectstorage` | `files.backends.connectOracleobjectstorage` | `hoody files backends connect oracleobjectstorage` | Connect to oracleobjectstorage backend |
| POST | `/api/v1/backends/pcloud` | `files.backends.connectPcloud` | `hoody files backends connect pcloud` | Connect to pcloud backend |
| POST | `/api/v1/backends/pikpak` | `files.backends.connectPikpak` | `hoody files backends connect pikpak` | Connect to pikpak backend |
| POST | `/api/v1/backends/pixeldrain` | `files.backends.connectPixeldrain` | `hoody files backends connect pixeldrain` | Connect to pixeldrain backend |
| POST | `/api/v1/backends/premiumizeme` | `files.backends.connectPremiumizeme` | `hoody files backends connect premiumizeme` | Connect to premiumizeme backend |
| POST | `/api/v1/backends/protondrive` | `files.backends.connectProtondrive` | `hoody files backends connect protondrive` | Connect to protondrive backend |
| POST | `/api/v1/backends/putio` | `files.backends.connectPutio` | `hoody files backends connect putio` | Connect to putio backend |
| POST | `/api/v1/backends/qingstor` | `files.backends.connectQingstor` | `hoody files backends connect qingstor` | Connect to qingstor backend |
| POST | `/api/v1/backends/quatrix` | `files.backends.connectQuatrix` | `hoody files backends connect quatrix` | Connect to quatrix backend |
| POST | `/api/v1/backends/s3` | `files.backends.connectS3` | `hoody files backends connect s3` | Connect to s3 backend |
| POST | `/api/v1/backends/seafile` | `files.backends.connectSeafile` | `hoody files backends connect seafile` | Connect to seafile backend |
| POST | `/api/v1/backends/sftp` | `files.backends.connectSftp` | `hoody files backends connect sftp` | Connect to sftp backend |
| POST | `/api/v1/backends/sharefile` | `files.backends.connectSharefile` | `hoody files backends connect sharefile` | Connect to sharefile backend |
| POST | `/api/v1/backends/sia` | `files.backends.connectSia` | `hoody files backends connect sia` | Connect to sia backend |
| POST | `/api/v1/backends/smb` | `files.backends.connectSmb` | `hoody files backends connect smb` | Connect to smb backend |
| POST | `/api/v1/backends/storj` | `files.backends.connectStorj` | `hoody files backends connect storj` | Connect to storj backend |
| POST | `/api/v1/backends/sugarsync` | `files.backends.connectSugarsync` | `hoody files backends connect sugarsync` | Connect to sugarsync backend |
| POST | `/api/v1/backends/swift` | `files.backends.connectSwift` | `hoody files backends connect swift` | Connect to swift backend |
| POST | `/api/v1/backends/tardigrade` | `files.backends.connectTardigrade` | `hoody files backends connect tardigrade` | Connect to tardigrade backend |
| POST | `/api/v1/backends/ulozto` | `files.backends.connectUlozto` | `hoody files backends connect ulozto` | Connect to ulozto backend |
| POST | `/api/v1/backends/union` | `files.backends.connectUnion` | `hoody files backends connect union` | Connect to union backend |
| POST | `/api/v1/backends/uptobox` | `files.backends.connectUptobox` | `hoody files backends connect uptobox` | Connect to uptobox backend |
| POST | `/api/v1/backends/webdav` | `files.backends.connectWebdav` | `hoody files backends connect webdav` | Connect to webdav backend |
| POST | `/api/v1/backends/yandex` | `files.backends.connectYandex` | `hoody files backends connect yandex` | Connect to yandex backend |
| POST | `/api/v1/backends/zoho` | `files.backends.connectZoho` | `hoody files backends connect zoho` | Connect to zoho backend |
| GET | `/api/v1/downloads` | `files.downloads.listGlobal` | `hoody files downloads all` | List active downloads |
| GET | `/api/v1/extractions` | `files.archives.listGlobal` | `hoody files extractions all` | List active extractions |
| DELETE | `/api/v1/files/{path}` | `files.delete` | `hoody files delete` | Delete file or directory |
| GET | `/api/v1/files/{path}` | `files.get` | `hoody files get` | List directory or download file |
| PATCH | `/api/v1/files/{path}` | `files.patchApi` | — | Modify file properties or move/rename |
| POST | `/api/v1/files/{path}` | `files.operate` | — | File operations (mkdir, extract, download, move, copy) |
| PUT | `/api/v1/files/{path}` | `files.put` | `hoody files put` | Upload or append file |
| PUT | `/api/v1/files/append/{path}` | `files.append` | `hoody files append` | Append data to file |
| PATCH | `/api/v1/files/chmod/{path}` | `files.chmod` | `hoody files chmod` | Change file permissions |
| PATCH | `/api/v1/files/chown/{path}` | `files.chown` | `hoody files chown` | Change file ownership |
| POST | `/api/v1/files/copy/{path}` | `files.copy` | `hoody files copy` | Copy file or directory |
| GET | `/api/v1/files/glob/{path}` | `files.glob` | `hoody files glob` | Find files by glob pattern |
| GET | `/api/v1/files/grep/{path}` | `files.grep` | `hoody files grep` | Search file contents (grep) |
| GET | `/api/v1/files/health` | `files.health.check` | `hoody files health` | Service health check |
| POST | `/api/v1/files/move/{path}` | `files.move` | `hoody files move` | Move file or directory |
| GET | `/api/v1/files/realpath/{path}` | `files.realpath` | `hoody files realpath` | Resolve canonical path (realpath) |
| GET | `/api/v1/files/stat/{path}` | `files.stat` | `hoody files stat` | Get file metadata (stat) |
| GET | `/api/v1/journal` | `files.journal.query` | `hoody files journal query` | Query journal entries |
| POST | `/api/v1/journal/flush` | `files.journal.flush` | `hoody files journal flush` | Flush journal to disk |
| GET | `/api/v1/journal/stats` | `files.journal.getStats` | `hoody files journal stats` | Get journal statistics |
| GET | `/api/v1/mounts` | `files.mounts.list` | `hoody files mounts list` | List all mounts |
| POST | `/api/v1/mounts` | `files.mounts.create` | `hoody files mounts create` | Create persistent FUSE mount |
| DELETE | `/api/v1/mounts/{id}` | `files.mounts.unmount` | `hoody files mounts unmount` | Unmount filesystem |
| GET | `/api/v1/mounts/{id}` | `files.mounts.getDetails` | `hoody files mounts get` | Get mount details |
| PATCH | `/api/v1/mounts/{id}` | `files.mounts.update` | `hoody files mounts update` | Update mount VFS configuration |
| GET | `/api/v1/version` | `files.system.getApiVersion` | `hoody files version` | Get API version |

---

## `notes` — 60 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| POST | `/api/v1/notes/avatars` | `notes.avatars.upload` | — | Upload an avatar image |
| GET | `/api/v1/notes/avatars/{avatarId}` | `notes.avatars.download` | — | Download an avatar image |
| GET | `/api/v1/notes/health` | `notes.health.check` | — | Service health and runtime info |
| GET | `/api/v1/notes/me` | `notes.identity.get` | `hoody notes whoami` | Get current identity |
| GET | `/api/v1/notes/notebooks` | `notes.notebooks.listNotebooks` | `hoody notes notebook list` | List notebooks |
| POST | `/api/v1/notes/notebooks` | `notes.notebooks.create` | `hoody notes notebook create` | Create a notebook |
| DELETE | `/api/v1/notes/notebooks/{notebookId}` | `notes.notebooks.delete` | `hoody notes notebook delete` | Delete a notebook |
| GET | `/api/v1/notes/notebooks/{notebookId}` | `notes.notebooks.get` | `hoody notes notebook get` | Get notebook details |
| PATCH | `/api/v1/notes/notebooks/{notebookId}` | `notes.notebooks.update` | `hoody notes notebook update` | Update notebook settings |
| GET | `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records` | `notes.databases.list` | `hoody notes db list` | List database records |
| POST | `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records` | `notes.databases.create` | `hoody notes db create` | Create a database record |
| DELETE | `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` | `notes.databases.delete` | `hoody notes db delete` | Delete a database record |
| GET | `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` | `notes.databases.get` | `hoody notes db get` | Get a database record |
| PATCH | `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` | `notes.databases.update` | `hoody notes db update` | Update a database record |
| GET | `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/search` | `notes.databases.search` | `hoody notes db search` | Search database records |
| GET | `/api/v1/notes/notebooks/{notebookId}/files` | `notes.files.list` | `hoody notes file list` | List all uploaded files |
| GET | `/api/v1/notes/notebooks/{notebookId}/files/{fileId}` | `notes.files.download` | `hoody notes file download` | Download a file |
| DELETE | `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | `notes.files.tusAbortUpload` | — | Abort a TUS upload |
| HEAD | `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | `notes.files.tusCheckUpload` | — | Check a TUS upload's offset (for resuming) |
| PATCH | `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | `notes.files.tusUploadChunk` | — | Upload a chunk to a TUS upload |
| POST | `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | `notes.files.tusCreateUpload` | — | Create a resumable (TUS) upload |
| POST | `/api/v1/notes/notebooks/{notebookId}/mutations` | `notes.mutations.sync` | — | Sync client mutations |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes` | `notes.nodes.list` | `hoody notes node list` | List nodes |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes` | `notes.nodes.create` | `hoody notes node create` | Create a node |
| DELETE | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}` | `notes.nodes.delete` | `hoody notes node delete` | Delete a node |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}` | `notes.nodes.get` | `hoody notes node get` | Get a node |
| PATCH | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}` | `notes.nodes.update` | `hoody notes node update` | Update a node |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/blocks/{blockId}/svg` | `notes.documents.exportBlockSvg` | — | Export drawing block as SVG |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/children` | `notes.nodes.listChildren` | `hoody notes node children` | List child nodes |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators` | `notes.collaborators.list` | `hoody notes collab list` | List collaborators |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators` | `notes.collaborators.add` | `hoody notes collab add` | Add a collaborator |
| DELETE | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}` | `notes.collaborators.remove` | `hoody notes collab remove` | Remove a collaborator |
| PATCH | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}` | `notes.collaborators.update` | `hoody notes collab update` | Update collaborator role |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors` | `notes.comments.listAnchors` | `hoody notes comment anchors` | List comment anchors |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments` | `notes.comments.list` | `hoody notes comment list` | List comments |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments` | `notes.comments.create` | `hoody notes comment create` | Create a comment |
| DELETE | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}` | `notes.comments.delete` | `hoody notes comment delete` | Delete a comment |
| PATCH | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}` | `notes.comments.edit` | `hoody notes comment edit` | Edit a comment |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/reanchor` | `notes.comments.reanchor` | — | Re-anchor a comment thread |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/resolve` | `notes.comments.resolve` | `hoody notes comment resolve` | Resolve a comment |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` | `notes.documents.get` | `hoody notes doc get` | Get document content |
| PATCH | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` | `notes.documents.patch` | `hoody notes doc patch` | Merge document content |
| PUT | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` | `notes.documents.put` | `hoody notes doc put` | Create or replace document |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` | `notes.documents.appendDocument` | — | Append blocks to a document |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/export-ticket` | `notes.documents.createExportTicket` | — | Create secure HTML export ticket |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/opened` | `notes.interactions.markOpened` | — | Mark node as opened |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/seen` | `notes.interactions.markSeen` | — | Mark node as seen |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions` | `notes.reactions.list` | `hoody notes reaction list` | List reactions |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions` | `notes.reactions.add` | `hoody notes reaction add` | Add a reaction |
| DELETE | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions/{reaction}` | `notes.reactions.remove` | `hoody notes reaction remove` | Remove a reaction |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions` | `notes.versions.list` | `hoody notes version list` | List document versions |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions` | `notes.versions.create` | `hoody notes version create` | Create a document version snapshot |
| DELETE | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}` | `notes.versions.delete` | `hoody notes version delete` | Delete a document version |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}` | `notes.versions.get` | `hoody notes version get` | Get a specific document version |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}/restore` | `notes.versions.restore` | `hoody notes version restore` | Restore a document version |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes/alias/{alias}` | `notes.nodes.getByAlias` | `hoody notes node get-by-alias` | Resolve page by alias |
| POST | `/api/v1/notes/notebooks/{notebookId}/users` | `notes.users.invite` | — | Invite users to notebook |
| PATCH | `/api/v1/notes/notebooks/{notebookId}/users/{userId}/role` | `notes.users.updateRole` | `hoody notes user set-role` | Update user role |
| POST | `/api/v1/notes/sockets` | `notes.sockets.init` | — | Initialize a WebSocket session |
| GET | `/api/v1/notes/sockets/{socketId}` | `notes.sockets.open` | — | Open a WebSocket connection |

---

## `notifications` — 8 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/notifications/{display}` | `notifications.list` | `hoody notifications list` | Get notifications for specified display(s) |
| DELETE | `/api/v1/notifications/dismiss` | `notifications.clearDismissed` | `hoody notifications clear-dismissed` | Clear dismissed notifications |
| POST | `/api/v1/notifications/dismiss` | `notifications.dismiss` | `hoody notifications dismiss` | Dismiss notifications |
| GET | `/api/v1/notifications/health` | `notifications.health.check` | `hoody notifications health` | Service health check |
| GET | `/api/v1/notifications/icons/{iconId}` | `notifications.icons.get` | `hoody notifications icon` | Get notification icon |
| GET | `/api/v1/notifications/metrics` | `notifications.health.getMetrics` | `hoody notifications metrics` | Prometheus-compatible metrics endpoint |
| POST | `/api/v1/notifications/notify` | `notifications.notify.trigger` | `hoody notifications trigger` | Trigger a new desktop notification |
| GET | `/api/v1/notifications/stream` | `notifications.connectStream` | `hoody notifications stream` | Real-time notification stream via WebSocket |

---

## `pipe` — 7 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/pipe` | `pipe.ui.getIndex` | — | Index page (web UI) |
| GET | `/api/v1/pipe/{path}` | `pipe.receive` | — | Receive data from a pipe |
| OPTIONS | `/api/v1/pipe/{path}` | `pipe.corsPreflight` | — | CORS preflight |
| POST | `/api/v1/pipe/{path}` | `pipe.send` | — | Send data to a pipe |
| GET | `/api/v1/pipe/health` | `pipe.health.check` | — | Service health check |
| GET | `/api/v1/pipe/help` | `pipe.info.getHelp` | — | Get help text with curl examples |
| GET | `/api/v1/pipe/noscript` | `pipe.ui.getNoScript` | — | No-JavaScript upload page |

---

## `proxyLogs` — 3 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/_logs` | `proxyLogs.logs.list` | `hoody proxy logs list` | Query centralized logs |
| GET | `/_logs/stats` | `proxyLogs.logs.getStats` | `hoody proxy logs stats` | Get log statistics |
| GET | `/_logs/stream` | `proxyLogs.logs.streamLogs` | `hoody proxy logs stream` | Live-tail logs over Server-Sent Events (v8 SSE contract) |

---

## `sqlite` — 31 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| POST | `/api/v1/sqlite/db` | `sqlite.database.executeTransaction` | `hoody db exec-transaction` | Execute SQL transaction |
| POST | `/api/v1/sqlite/db/create` | `sqlite.database.create` | `hoody db create` | Create new SQLite database |
| GET | `/api/v1/sqlite/health` | `sqlite.health.getHealth` | — | Health check |
| GET | `/api/v1/sqlite/health/cache` | `sqlite.health.getHealthCache` | — | Cache health snapshot |
| DELETE | `/api/v1/sqlite/history` | `sqlite.history.clear` | `hoody db history clear` | Clear query history |
| GET | `/api/v1/sqlite/history` | `sqlite.history.list` | `hoody db history list` | Get query history |
| DELETE | `/api/v1/sqlite/history/{index}` | `sqlite.history.deleteEntry` | `hoody db history delete` | Delete history entry |
| GET | `/api/v1/sqlite/history/stats` | `sqlite.history.getStats` | `hoody db history stats` | Get history statistics |
| GET | `/api/v1/sqlite/kv` | `sqlite.kvStore.list` | `hoody kv list` | List keys |
| DELETE | `/api/v1/sqlite/kv/{key}` | `sqlite.kvStore.delete` | `hoody kv delete` | Delete key |
| GET | `/api/v1/sqlite/kv/{key}` | `sqlite.kvStore.get` | `hoody kv get` | Get value by key |
| HEAD | `/api/v1/sqlite/kv/{key}` | `sqlite.kvStore.exists` | `hoody kv exists` | Check if key exists |
| PUT | `/api/v1/sqlite/kv/{key}` | `sqlite.kvStore.set` | `hoody kv set` | Set value for key |
| POST | `/api/v1/sqlite/kv/{key}/decr` | `sqlite.kvStore.decr` | `hoody kv decr` | Atomic decrement |
| GET | `/api/v1/sqlite/kv/{key}/history` | `sqlite.kvStore.getHistory` | `hoody kv history` | Get key operation history |
| POST | `/api/v1/sqlite/kv/{key}/incr` | `sqlite.kvStore.incr` | `hoody kv incr` | Atomic increment |
| POST | `/api/v1/sqlite/kv/{key}/pop` | `sqlite.kvStore.pop` | `hoody kv arrays pop` | Remove from array end |
| POST | `/api/v1/sqlite/kv/{key}/push` | `sqlite.kvStore.push` | `hoody kv arrays push` | Append to array |
| POST | `/api/v1/sqlite/kv/{key}/remove` | `sqlite.kvStore.removeElement` | `hoody kv arrays delete` | Remove array element |
| POST | `/api/v1/sqlite/kv/{key}/rollback` | `sqlite.kvStore.rollback` | `hoody kv rollback` | Rollback key operations |
| GET | `/api/v1/sqlite/kv/{key}/snapshot` | `sqlite.kvStore.getSnapshot` | `hoody kv snapshots get-key` | Get key snapshot at operation |
| POST | `/api/v1/sqlite/kv/batch/delete` | `sqlite.kvStore.batchDelete` | `hoody kv batch delete` | Batch delete multiple keys |
| POST | `/api/v1/sqlite/kv/batch/get` | `sqlite.kvStore.batchGet` | `hoody kv batch get` | Batch get multiple keys |
| POST | `/api/v1/sqlite/kv/batch/set` | `sqlite.kvStore.batchSet` | `hoody kv batch set` | Batch set multiple keys |
| GET | `/api/v1/sqlite/kv/diff` | `sqlite.kvStore.compareSnapshots` | `hoody kv snapshots compare-table` | Compare table snapshots |
| POST | `/api/v1/sqlite/kv/rollback` | `sqlite.kvStore.rollbackTable` | `hoody kv rollback-table` | Rollback entire table |
| GET | `/api/v1/sqlite/kv/snapshot` | `sqlite.kvStore.getTableSnapshot` | `hoody kv snapshots get-table` | Get table snapshot at timestamp |
| POST | `/api/v1/sqlite/maintenance` | `sqlite.sql.runMaintenance` | — | Run a database maintenance operation |
| GET | `/api/v1/sqlite/openapi.json` | `sqlite.docs.getJson` | — | Get OpenAPI specification (JSON redirect) |
| GET | `/api/v1/sqlite/openapi.yaml` | `sqlite.docs.getYaml` | — | Get OpenAPI specification (YAML) |
| GET | `/api/v1/sqlite/query` | `sqlite.query.executeShareable` | `hoody db exec-shareable` | Execute shareable SQL query |

---

## `terminal` — 39 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/` | `terminal.web.get` | `hoody terminal sessions web` | Get web terminal interface |
| GET | `/api/v1/system/daemon` | `terminal.system.getDaemonConfig` | `hoody terminal system daemon-config` | Get daemon programs configuration |
| GET | `/api/v1/system/displays` | `terminal.system.getDisplayInfo` | `hoody terminal system display-info` | Get display information |
| GET | `/api/v1/system/ports` | `terminal.system.listPorts` | `hoody terminal system ports` | List all listening network ports |
| POST | `/api/v1/system/process/signal` | `terminal.system.sendSignal` | `hoody terminal processes signal` | Send signal to process(es) |
| GET | `/api/v1/system/processes` | `terminal.system.listProcesses` | `hoody terminal processes list` | List all system processes |
| GET | `/api/v1/system/processes/{pid}` | `terminal.system.getProcess` | `hoody terminal processes get` | Get process details by PID |
| POST | `/api/v1/system/processes/freeze` | `terminal.system.freezeProcess` | — | Freeze (SIGSTOP) a process or process tree |
| POST | `/api/v1/system/processes/unfreeze` | `terminal.system.unfreezeProcess` | — | Unfreeze (SIGCONT) a process or process tree |
| POST | `/api/v1/system/reboot` | `terminal.system.reboot` | `hoody terminal system reboot` | Reboot the system |
| GET | `/api/v1/system/resources` | `terminal.system.getResources` | `hoody terminal system resources` | Get system resources and statistics |
| POST | `/api/v1/system/shutdown` | `terminal.system.shutdown` | `hoody terminal system shutdown` | Shutdown the system |
| DELETE | `/api/v1/terminal/{terminal_id}` | `terminal.sessions.delete` | `hoody terminal sessions delete` | Delete a terminal session |
| GET | `/api/v1/terminal/{terminal_id}/automation` | `terminal.terminalAutomation.getSessionAutomationState` | `hoody terminal sessions automation-state` | Get per-session automation state |
| GET | `/api/v1/terminal/automation/metrics` | `terminal.terminalAutomation.getAutomationMetrics` | `hoody terminal automation metrics` | Get terminal automation metrics |
| POST | `/api/v1/terminal/create` | `terminal.sessions.create` | `hoody terminal sessions create` | Create a terminal session |
| POST | `/api/v1/terminal/drop` | `terminal.terminalDragAndDrop.oneShotTerminalDrop` | — | One-shot drop (begin + stage + commit) |
| POST | `/api/v1/terminal/drop-begin` | `terminal.terminalDragAndDrop.beginTerminalDrop` | — | Begin a drag-and-drop staging transaction |
| POST | `/api/v1/terminal/drop-commit` | `terminal.terminalDragAndDrop.commitTerminalDrop` | — | Finalize a drop and inject the OSC frame |
| POST | `/api/v1/terminal/execute` | `terminal.execution.execute` | `hoody terminal sessions exec` | Execute command in terminal session |
| POST | `/api/v1/terminal/execute/{command_id}/abort` | `terminal.abort` | `hoody terminal sessions abort` | Abort a running command |
| GET | `/api/v1/terminal/find` | `terminal.terminalAutomation.findInTerminal` | `hoody terminal sessions find` | Search terminal screen with regex |
| GET | `/api/v1/terminal/health` | `terminal.health.check` | `hoody terminal health` | Service health check |
| GET | `/api/v1/terminal/history/{terminal_id}` | `terminal.sessions.listHistory` | `hoody terminal sessions history` | Get terminal command history |
| GET | `/api/v1/terminal/keys` | `terminal.terminalAutomation.listSupportedKeys` | `hoody terminal automation keys` | List supported key names for /press endpoint |
| POST | `/api/v1/terminal/mouse` | `terminal.terminalAutomation.sendTerminalMouseEvents` | — | Send cell-based mouse events to terminal |
| GET | `/api/v1/terminal/openapi.json` | `terminal.docs.getJson` | — | Get OpenAPI specification in JSON format |
| GET | `/api/v1/terminal/openapi.yaml` | `terminal.docs.getYaml` | — | Get OpenAPI specification in YAML format |
| POST | `/api/v1/terminal/paste` | `terminal.terminalAutomation.pasteTerminalText` | `hoody terminal sessions paste` | Paste text into terminal |
| POST | `/api/v1/terminal/press` | `terminal.terminalAutomation.pressTerminalKeys` | `hoody terminal sessions press` | Send named key presses to terminal |
| GET | `/api/v1/terminal/raw` | `terminal.sessions.getRawOutput` | `hoody terminal sessions raw-output` | Get raw terminal output |
| GET | `/api/v1/terminal/result/{command_id}` | `terminal.execution.getResult` | `hoody terminal sessions command-result` | Get command result |
| GET | `/api/v1/terminal/screenshot` | `terminal.sessions.captureScreenshot` | `hoody terminal sessions screenshot` | Capture terminal screenshot |
| GET | `/api/v1/terminal/sessions` | `terminal.sessions.list` | `hoody terminal sessions list` | List all terminal sessions |
| GET | `/api/v1/terminal/snapshot` | `terminal.terminalAutomation.getTerminalSnapshot` | `hoody terminal sessions snapshot` | Get rendered terminal snapshot |
| POST | `/api/v1/terminal/upload` | `terminal.terminalDragAndDrop.uploadTerminalDropSlice` | — | Upload a raw file slice into a drop |
| POST | `/api/v1/terminal/wait` | `terminal.terminalAutomation.waitForTerminal` | `hoody terminal sessions wait` | Wait for terminal condition |
| POST | `/api/v1/terminal/write` | `terminal.write` | `hoody terminal sessions write` | Write input to terminal |
| GET | `/api/v1/terminal/ws` | `terminal.sessions.connectWebSocket` | `hoody terminal sessions connect` | WebSocket terminal connection |

---

## `tunnel` — 7 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/tunnel/bindings` | `tunnel.listBindings` | `hoody tunnel bindings list` | List active bindings across all sessions |
| GET | `/api/v1/tunnel/connect` | `tunnel.tunnelConnect` | — | Tunnel WebSocket control plane |
| GET | `/api/v1/tunnel/health` | `tunnel.health.check` | `hoody tunnel health` | Kit health |
| GET | `/api/v1/tunnel/metrics` | `tunnel.getMetrics` | `hoody tunnel metrics` | Prometheus metrics |
| GET | `/api/v1/tunnel/sessions` | `tunnel.listSessions` | `hoody tunnel sessions list` | List active tunnel sessions |
| DELETE | `/api/v1/tunnel/sessions/{session_id}` | `tunnel.killSession` | `hoody tunnel sessions kill` | Terminate an active tunnel session |
| GET | `/api/v1/tunnel/tunnels` | `tunnel.listTunnels` | `hoody tunnel list` | List all active tunnels (combined sessions + bindings) |

---

## `watch` — 10 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/watch/health` | `watch.health.check` | `hoody watch health` | Health Check |
| GET | `/openapi.json` | `watch.system.getOpenApiJson` | — | Get Open Api Json |
| GET | `/openapi.yaml` | `watch.system.getOpenApiYaml` | — | Get Open Api Yaml |
| GET | `/watchers` | `watch.watchers.list` | `hoody watch list` | List Watchers |
| POST | `/watchers` | `watch.watchers.create` | `hoody watch create` | Create Watcher |
| DELETE | `/watchers/{id}` | `watch.watchers.delete` | `hoody watch delete` | Delete Watcher |
| GET | `/watchers/{id}` | `watch.watchers.get` | `hoody watch get` | Get Watcher |
| GET | `/watchers/{id}/events` | `watch.streams.listEvents` | `hoody watch events list` | List Watcher Events |
| GET | `/watchers/{id}/events/sse` | `watch.streams.streamSse` | `hoody watch events stream` | Stream Watcher Events Sse |
| GET | `/watchers/{id}/events/ws` | `watch.streams.streamWs` | — | Stream Watcher Events Ws |

---

*Auto-generated by `generate-reference.ts`. Do not edit manually.*
