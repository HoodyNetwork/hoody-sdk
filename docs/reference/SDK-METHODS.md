# Hoody SDK — Complete Method Reference

**Version:** 1.0.0-beta.9
**Total methods:** 1081
**Namespaces:** 19

---

## `agent` (209 methods)

### `client.agent`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `exportLogs` | GET | `/api/v1/agent/logs/export` | Export logs as a downloadable file. |

### `client.agent.agents`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `copyAgent` | POST | `/api/v1/agent/agents/{name}/copy` | Copy a chat agent. |
| `createAgent` | POST | `/api/v1/agent/agents` | Create a chat-agent definition. |
| `deleteAgent` | DELETE | `/api/v1/agent/agents/{name}` | Delete a custom chat agent. |
| `getAgentSource` | GET | `/api/v1/agent/agents/{name}/source` | Read a chat agent's source. |
| `listAgents` | GET | `/api/v1/agent/agents` | List chat-agent definitions. |
| `listAgentsAll` | GET | `/api/v1/agent/agents` | List chat-agent definitions. (collect all pages) |
| `listAgentsIterator` | GET | `/api/v1/agent/agents` | List chat-agent definitions. (async iterator) |
| `putAgentSource` | PUT | `/api/v1/agent/agents/{name}/source` | Write a chat agent's source. |
| `renameAgent` | POST | `/api/v1/agent/agents/{name}/rename` | Rename a chat agent. |
| `resetAgentToShipped` | POST | `/api/v1/agent/agents/{name}/reset-to-shipped` | Reset an agent to its shipped default. |
| `setAgentModel` | PATCH | `/api/v1/agent/agents/{name}/model` | Set an agent's model. |
| `setAgentTools` | PATCH | `/api/v1/agent/agents/{name}/tools` | Set an agent's tool allow-list. |
| `setAgentTurns` | PATCH | `/api/v1/agent/agents/{name}/turns` | Set an agent's max-turns. |
| `toggleAgentTool` | POST | `/api/v1/agent/agents/{name}/tools/{tool}/toggle` | Toggle a single tool for an agent. |

### `client.agent.discovery`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `listContainers` | GET | `/api/v1/agent/containers` | List containers in a realm (for binding). |
| `listContainersAll` | GET | `/api/v1/agent/containers` | List containers in a realm (for binding). (collect all pages) |
| `listContainersIterator` | GET | `/api/v1/agent/containers` | List containers in a realm (for binding). (async iterator) |
| `listRealms` | GET | `/api/v1/agent/realms` | List realms (for binding). |
| `listRealmsAll` | GET | `/api/v1/agent/realms` | List realms (for binding). (collect all pages) |
| `listRealmsIterator` | GET | `/api/v1/agent/realms` | List realms (for binding). (async iterator) |

### `client.agent.github`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `githubAuthStatus` | GET | `/api/v1/agent/github/auth/status` | GitHub auth status. |
| `githubBranches` | GET | `/api/v1/agent/github/branches` | List GitHub branches. |
| `githubClone` | POST | `/api/v1/agent/github/clone` | Clone a GitHub repository. |
| `githubCommit` | POST | `/api/v1/agent/github/commit` | Stage all and commit. |
| `githubLogin` | POST | `/api/v1/agent/github/auth/login` | Start a GitHub device-flow login (or add a PAT). |
| `githubLoginPoll` | POST | `/api/v1/agent/github/auth/login/poll` | Poll a GitHub device-flow login to completion. |
| `githubPullRequest` | POST | `/api/v1/agent/github/pr` | Open a pull request. |
| `githubRepos` | GET | `/api/v1/agent/github/repos` | List GitHub repos. |
| `githubStatus` | GET | `/api/v1/agent/github/status` | GitHub working-tree status. |
| `githubSync` | POST | `/api/v1/agent/github/sync` | Sync (fetch → pull → push). |

### `client.agent.headless`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `createHeadlessRun` | POST | `/api/v1/agent/headless/runs` | Create a headless one-shot run. |

### `client.agent.hoody`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `bootstrapHoodyToken` | POST | `/api/v1/agent/hoody/auth/bootstrap` | Bootstrap the Hoody platform credential (install-if-absent). |

### `client.agent.hooks`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `ackHookTrust` | POST | `/api/v1/agent/hooks/trust/ack` | Acknowledge hook trust. |
| `beginHookWrite` | POST | `/api/v1/agent/hooks/begin-write` | Begin a hook write (nonce). |
| `deleteHook` | DELETE | `/api/v1/agent/hooks` | Delete a hook. |
| `disableAllHooks` | POST | `/api/v1/agent/hooks/disable-all` | Disable all hooks. |
| `listHooks` | GET | `/api/v1/agent/hooks` | List hooks. |
| `reloadHooks` | POST | `/api/v1/agent/hooks/reload` | Reload hooks from disk. |
| `testHook` | POST | `/api/v1/agent/hooks/test` | Test-fire a hook. |
| `toggleHook` | POST | `/api/v1/agent/hooks/toggle` | Toggle a hook. |
| `upsertHook` | PUT | `/api/v1/agent/hooks` | Upsert a hook. |

### `client.agent.jobs`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `deleteJob` | DELETE | `/api/v1/agent/jobs/{id}` | Cancel a pending/running job, or delete a finished record. |
| `getJob` | GET | `/api/v1/agent/jobs/{id}` | Get an async job's status. |
| `getJobResult` | GET | `/api/v1/agent/jobs/{id}/result` | Get an async job's result. |

### `client.agent.logs`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `logsSources` | GET | `/api/v1/agent/logs/sources` | Log sources. |
| `logsStats` | GET | `/api/v1/agent/logs/stats` | Log statistics. |
| `queryLogs` | GET | `/api/v1/agent/logs` | Query logs. |
| `readLogEntry` | GET | `/api/v1/agent/logs/entries/{ref}` | Read a log entry. |
| `streamLogs` | GET | `/api/v1/agent/logs/stream` | Stream the log tail (SSE). |

### `client.agent.loops`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `createLoop` | POST | `/api/v1/agent/sessions/{id}/loops` | Create a loop. |
| `deleteLoop` | DELETE | `/api/v1/agent/sessions/{id}/loops/{loopId}` | Delete a loop. |
| `listLoops` | GET | `/api/v1/agent/sessions/{id}/loops` | List a session's loops. |
| `listLoopsAll` | GET | `/api/v1/agent/sessions/{id}/loops` | List a session's loops. (collect all pages) |
| `listLoopsIterator` | GET | `/api/v1/agent/sessions/{id}/loops` | List a session's loops. (async iterator) |
| `runLoopNow` | POST | `/api/v1/agent/sessions/{id}/loops/{loopId}/run-now` | Run a loop immediately. |
| `updateLoop` | PATCH | `/api/v1/agent/sessions/{id}/loops/{loopId}` | Update a loop. |

### `client.agent.memory`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `consolidateMemory` | POST | `/api/v1/agent/memory/consolidate` | Trigger a memory consolidation pass (human-only). |
| `deleteMemoryItem` | DELETE | `/api/v1/agent/memory/items` | Delete a memory item. |
| `editMemoryItem` | PATCH | `/api/v1/agent/memory/items/{id}` | Edit a memory item. |
| `flushMemory` | POST | `/api/v1/agent/memory/flush` | Flush the memory store. |
| `getMemoryGraph` | GET | `/api/v1/agent/memory/graph` | Read a project's memory relation graph. |
| `getMemoryItem` | GET | `/api/v1/agent/memory/items/{id}` | Read a memory item. |
| `listMemoryItems` | GET | `/api/v1/agent/memory/items` | List memory items. |
| `listMemoryItemsAll` | GET | `/api/v1/agent/memory/items` | List memory items. (collect all pages) |
| `listMemoryItemsIterator` | GET | `/api/v1/agent/memory/items` | List memory items. (async iterator) |
| `listMemoryProjects` | GET | `/api/v1/agent/memory/projects` | List memory projects. |
| `listMemoryProjectsAll` | GET | `/api/v1/agent/memory/projects` | List memory projects. (collect all pages) |
| `listMemoryProjectsIterator` | GET | `/api/v1/agent/memory/projects` | List memory projects. (async iterator) |
| `saveMemoryItem` | POST | `/api/v1/agent/memory/items` | Save a memory item. |
| `searchMemory` | POST | `/api/v1/agent/memory/search` | Search memory (hybrid recall). |
| `setMemoryEnabled` | PUT | `/api/v1/agent/memory/enabled` | Toggle memory capture. |

### `client.agent.models`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `addProviderAccount` | POST | `/api/v1/agent/providers/{id}/auth/accounts` | Add an OAuth account to a provider's pool. |
| `deleteProviderAPIKey` | DELETE | `/api/v1/agent/providers/{id}/auth/api-key` | Delete a provider API key. |
| `getModel` | GET | `/api/v1/agent/models/{spec}` | Get a model by spec. |
| `getProvider` | GET | `/api/v1/agent/providers/{id}` | Get a provider. |
| `getProviderAuth` | GET | `/api/v1/agent/providers/{id}/auth` | Get a provider's auth status. |
| `listModels` | GET | `/api/v1/agent/models` | List models. |
| `listModelsAll` | GET | `/api/v1/agent/models` | List models. (collect all pages) |
| `listModelsIterator` | GET | `/api/v1/agent/models` | List models. (async iterator) |
| `listProviderAccounts` | GET | `/api/v1/agent/providers/{id}/auth/accounts` | List a provider's OAuth account pool. |
| `listProviderAccountsAll` | GET | `/api/v1/agent/providers/{id}/auth/accounts` | List a provider's OAuth account pool. (collect all pages) |
| `listProviderAccountsIterator` | GET | `/api/v1/agent/providers/{id}/auth/accounts` | List a provider's OAuth account pool. (async iterator) |
| `listProviders` | GET | `/api/v1/agent/providers` | List LLM providers. |
| `listProvidersAll` | GET | `/api/v1/agent/providers` | List LLM providers. (collect all pages) |
| `listProvidersIterator` | GET | `/api/v1/agent/providers` | List LLM providers. (async iterator) |
| `logoutProviderOAuth` | DELETE | `/api/v1/agent/providers/{id}/auth/oauth` | Remove a provider's OAuth login. |
| `pollProviderOAuth` | GET | `/api/v1/agent/providers/{id}/auth/oauth/{job}` | Poll a provider OAuth login. |
| `removeProviderAccount` | DELETE | `/api/v1/agent/providers/{id}/auth/accounts/{key}` | Remove a pooled OAuth account. |
| `setProviderAccountActive` | PUT | `/api/v1/agent/providers/{id}/auth/accounts/{key}/active` | Make a pooled OAuth account active. |
| `setProviderAPIKey` | PUT | `/api/v1/agent/providers/{id}/auth/api-key` | Store a provider API key. |
| `setProviderDefault` | PUT | `/api/v1/agent/providers/{id}/auth/default` | Set a provider's default credential method. |
| `startProviderOAuth` | POST | `/api/v1/agent/providers/{id}/auth/oauth` | Start a provider OAuth login. |
| `submitProviderOAuthCode` | POST | `/api/v1/agent/providers/{id}/auth/oauth/{job}/code` | Submit a provider OAuth authorization code. |

### `client.agent.sessions`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `answerAssist` | POST | `/api/v1/agent/sessions/{id}/answer:assist` | Propose answers for a parked question (helper model). |
| `answerQuestion` | POST | `/api/v1/agent/sessions/{id}/answer` | Answer a parked question gate. |
| `cancelSession` | POST | `/api/v1/agent/sessions/{id}/cancel` | Cancel the active turn (Esc). |
| `closeSession` | POST | `/api/v1/agent/sessions/{id}/close` | Close the session (teardown). |
| `confirmGate` | POST | `/api/v1/agent/sessions/{id}/confirm` | Answer a parked confirm gate. |
| `createSession` | POST | `/api/v1/agent/sessions` | Create, fork, or attach a session. |
| `deleteSession` | DELETE | `/api/v1/agent/sessions/{id}` | Close (and optionally hard-delete) a session. |
| `getSession` | GET | `/api/v1/agent/sessions/{id}` | Get a session summary. |
| `getSessionTranscript` | GET | `/api/v1/agent/sessions/{id}/transcript` | Read a session's transcript without attaching. |
| `listSessionCwds` | GET | `/api/v1/agent/sessions/cwds` | List distinct session working directories. |
| `listSessions` | GET | `/api/v1/agent/sessions` | List sessions. |
| `listSessionsAll` | GET | `/api/v1/agent/sessions` | List sessions. (collect all pages) |
| `listSessionsIterator` | GET | `/api/v1/agent/sessions` | List sessions. (async iterator) |
| `postSessionMessage` | POST | `/api/v1/agent/sessions/{id}/messages` | Dispatch a turn (fire-and-observe). |
| `postWorkflowMessage` | POST | `/api/v1/agent/sessions/{id}/workflow/messages` | Send a message to a running workflow. |
| `promptStream` | POST | `/api/v1/agent/sessions/{id}/prompt:stream` | Dispatch a turn and stream the response. |
| `promptSync` | POST | `/api/v1/agent/sessions/{id}/prompt:sync` | Dispatch a turn and block to completion. |
| `replaySession` | GET | `/api/v1/agent/sessions/{id}/replay` | Replay a live session's buffered events. |
| `setSessionAgent` | PATCH | `/api/v1/agent/sessions/{id}/agent` | Switch the chat agent. |
| `setSessionAutoReply` | PATCH | `/api/v1/agent/sessions/{id}/auto-reply` | Arm/disarm the auto-reply loop. |
| `setSessionAutoReplyWrites` | PATCH | `/api/v1/agent/sessions/{id}/auto-reply/writes` | Flip the auto-reply write opt-in. |
| `setSessionEffort` | PATCH | `/api/v1/agent/sessions/{id}/effort` | Set reasoning effort. |
| `setSessionHoodyEnv` | PATCH | `/api/v1/agent/sessions/{id}/hoody-env` | Toggle Hoody shell-env injection. |
| `setSessionModel` | PATCH | `/api/v1/agent/sessions/{id}/model` | Switch the session model. |
| `setSessionVerbosity` | PATCH | `/api/v1/agent/sessions/{id}/verbosity` | Set response verbosity. |
| `streamSession` | GET | `/api/v1/agent/sessions/{id}/stream` | Attach to a session's event stream (WebSocket / SSE). |
| `trimSession` | POST | `/api/v1/agent/sessions/{id}/trim` | Trim session history to a turn index. |

### `client.agent.settings`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `deleteFusion` | DELETE | `/api/v1/agent/settings/fusion/{slug}` | Delete a fusion composite. |
| `getACPStatus` | GET | `/api/v1/agent/acp/agents` | Get BYOA ACP backend status. |
| `getSettings` | GET | `/api/v1/agent/settings` | Get settings. |
| `listFusion` | GET | `/api/v1/agent/settings/fusion` | List fusion composites. |
| `listFusionAll` | GET | `/api/v1/agent/settings/fusion` | List fusion composites. (collect all pages) |
| `listFusionIterator` | GET | `/api/v1/agent/settings/fusion` | List fusion composites. (async iterator) |
| `patchSettings` | PATCH | `/api/v1/agent/settings` | Patch settings. |
| `setACPSecret` | PUT | `/api/v1/agent/acp/agents/{agent}/secrets/{key}` | Store an ACP per-agent secret value. |
| `upsertFusion` | PUT | `/api/v1/agent/settings/fusion/{slug}` | Create or update a fusion composite. |

### `client.agent.skills`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `applySkillImport` | POST | `/api/v1/agent/skills/import/apply` | Apply a skill import. |
| `clearSkillHubCache` | DELETE | `/api/v1/agent/skills/hub/cache` | Clear the skill hub cache. |
| `createSkill` | POST | `/api/v1/agent/skills` | Create a skill. |
| `deleteSkill` | POST | `/api/v1/agent/skills/delete` | Delete a skill. |
| `getSkillHubCache` | GET | `/api/v1/agent/skills/hub/cache` | Skill hub cache stats. |
| `getSkillSource` | GET | `/api/v1/agent/skills/source` | Read a skill's source. |
| `installSkillHub` | POST | `/api/v1/agent/skills/hub/install` | Install a hub skill. |
| `listSkills` | GET | `/api/v1/agent/skills` | List skills. |
| `listSkillsAll` | GET | `/api/v1/agent/skills` | List skills. (collect all pages) |
| `listSkillsIterator` | GET | `/api/v1/agent/skills` | List skills. (async iterator) |
| `previewSkillHub` | GET | `/api/v1/agent/skills/hub/preview` | Preview a hub skill. |
| `putSkillSource` | PUT | `/api/v1/agent/skills/source` | Write a skill's source. |
| `renameSkill` | POST | `/api/v1/agent/skills/rename` | Rename a skill. |
| `scanSkillImport` | GET | `/api/v1/agent/skills/import/scan` | Scan for importable skills. |
| `searchSkillHub` | GET | `/api/v1/agent/skills/hub/search` | Search the skill hub. |
| `toggleSkill` | POST | `/api/v1/agent/skills/toggle` | Enable/disable a skill. |
| `trustSkill` | POST | `/api/v1/agent/skills/trust` | Set a skill's trust state. |

### `client.agent.statistics`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getStatistics` | GET | `/api/v1/agent/statistics` | Cross-session statistics. |
| `usageByAccount` | GET | `/api/v1/agent/usage/by-account` | Usage rollup by account. |
| `usageByModel` | GET | `/api/v1/agent/usage/by-model` | Usage rollup by model. |

### `client.agent.system`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `docs` | GET | `/api/v1/agent/docs` | API documentation UI. |
| `healthCheck` | GET | `/api/v1/agent/health` | Standardized health check. |
| `metrics` | GET | `/api/v1/agent/metrics` | Prometheus metrics. |
| `openapiJSON` | GET | `/api/v1/agent/openapi.json` | OpenAPI spec (JSON). |
| `openapiYAML` | GET | `/api/v1/agent/openapi.yaml` | OpenAPI spec (YAML). |

### `client.agent.tasks`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `cancelAllTasks` | POST | `/api/v1/agent/sessions/{id}/tasks/cancel` | Cancel all background tasks. |
| `cancelTask` | POST | `/api/v1/agent/sessions/{id}/tasks/{tid}/cancel` | Cancel a background task. |
| `listTasks` | GET | `/api/v1/agent/sessions/{id}/tasks` | Request the session's task snapshot. |
| `requestTaskTranscript` | GET | `/api/v1/agent/sessions/{id}/tasks/{tid}/transcript` | Request a task's transcript (upsert-poll). |

### `client.agent.todos`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `approveTodoProposal` | POST | `/api/v1/agent/todos/{id}/proposals/{pid}/approve` | Approve a todo proposal. |
| `archiveTodo` | POST | `/api/v1/agent/todos/{id}/archive` | Archive a todo. |
| `cancelTodoRun` | POST | `/api/v1/agent/todos/{id}/cancel-run` | Cancel a todo's run. |
| `claimTodo` | POST | `/api/v1/agent/todos/{id}/claim` | Claim a todo. |
| `createTodo` | POST | `/api/v1/agent/todos` | File a todo. |
| `denyTodoProposal` | POST | `/api/v1/agent/todos/{id}/proposals/{pid}/deny` | Deny a todo proposal. |
| `getTodo` | GET | `/api/v1/agent/todos/{id}` | Read a todo. |
| `getTodosRevision` | GET | `/api/v1/agent/todos/revision` | Get the todos store revision. |
| `listTodos` | GET | `/api/v1/agent/todos` | List todos. |
| `listTodosAll` | GET | `/api/v1/agent/todos` | List todos. (collect all pages) |
| `listTodosIterator` | GET | `/api/v1/agent/todos` | List todos. (async iterator) |
| `messageTodo` | POST | `/api/v1/agent/todos/{id}/message` | Comment + run an orchestrator turn. |
| `postTodoComment` | POST | `/api/v1/agent/todos/{id}/messages` | Comment on a todo. |
| `purgeTodos` | POST | `/api/v1/agent/todos/purge` | Purge archived todos. |
| `releaseTodo` | POST | `/api/v1/agent/todos/{id}/release` | Release a todo. |
| `runTodo` | POST | `/api/v1/agent/todos/{id}/run` | Run a todo's orchestrator. |
| `snoozeTodo` | POST | `/api/v1/agent/todos/{id}/snooze` | Snooze a todo. |
| `triageTodos` | POST | `/api/v1/agent/todos/triage` | Run an LLM triage pass. |
| `updateTodo` | PATCH | `/api/v1/agent/todos/{id}` | Update a todo (CAS). |

### `client.agent.tools`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getTool` | GET | `/api/v1/agent/tools/{name}` | Get one tool schema. |
| `listReadOnlyTools` | GET | `/api/v1/agent/tools/read-only` | List the read-only tool subset. |
| `listReadOnlyToolsAll` | GET | `/api/v1/agent/tools/read-only` | List the read-only tool subset. (collect all pages) |
| `listReadOnlyToolsIterator` | GET | `/api/v1/agent/tools/read-only` | List the read-only tool subset. (async iterator) |
| `listSessionMCPTools` | GET | `/api/v1/agent/sessions/{id}/tools/mcp` | List a session's MCP tools. |
| `listSessionMCPToolsAll` | GET | `/api/v1/agent/sessions/{id}/tools/mcp` | List a session's MCP tools. (collect all pages) |
| `listSessionMCPToolsIterator` | GET | `/api/v1/agent/sessions/{id}/tools/mcp` | List a session's MCP tools. (async iterator) |
| `listSessionTools` | GET | `/api/v1/agent/sessions/{id}/tools` | List a session's effective tool set. |
| `listSessionToolsAll` | GET | `/api/v1/agent/sessions/{id}/tools` | List a session's effective tool set. (collect all pages) |
| `listSessionToolsIterator` | GET | `/api/v1/agent/sessions/{id}/tools` | List a session's effective tool set. (async iterator) |
| `listTools` | GET | `/api/v1/agent/tools` | List the tool catalogue. |
| `listToolsAll` | GET | `/api/v1/agent/tools` | List the tool catalogue. (collect all pages) |
| `listToolsIterator` | GET | `/api/v1/agent/tools` | List the tool catalogue. (async iterator) |
| `runSessionTool` | POST | `/api/v1/agent/sessions/{id}/tools/{name}/run` | Run a tool inside a live session (gated). |
| `runTool` | POST | `/api/v1/agent/tools/{name}/run` | Run a tool (sessionless, gated). |
| `runToolAsync` | POST | `/api/v1/agent/tools/{name}/runAsync` | Run a tool asynchronously (sessionless, gated). |
| `streamTool` | POST | `/api/v1/agent/tools/{name}/stream` | Run a tool with a streamed result (sessionless, gated). |

### `client.agent.workflows`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `cancelWorkflowRun` | POST | `/api/v1/agent/workflows/runs/{run_id}/cancel` | Cancel a workflow run. |
| `deleteWorkflow` | DELETE | `/api/v1/agent/workflows/{name}` | Delete a workflow definition. |
| `getWorkflow` | GET | `/api/v1/agent/workflows/{name}` | Read one workflow definition. |
| `getWorkflowRun` | GET | `/api/v1/agent/workflows/runs/{run_id}` | Get one workflow run by id. |
| `hideWorkflow` | POST | `/api/v1/agent/workflows/{name}/hide` | Hide or un-hide a workflow. |
| `listWorkflowRuns` | GET | `/api/v1/agent/workflows/runs` | Snapshot in-flight and recent workflow runs. |
| `listWorkflowRunsAll` | GET | `/api/v1/agent/workflows/runs` | Snapshot in-flight and recent workflow runs. (collect all pages) |
| `listWorkflowRunsIterator` | GET | `/api/v1/agent/workflows/runs` | Snapshot in-flight and recent workflow runs. (async iterator) |
| `listWorkflows` | GET | `/api/v1/agent/workflows` | List workflow definitions. |
| `listWorkflowsAll` | GET | `/api/v1/agent/workflows` | List workflow definitions. (collect all pages) |
| `listWorkflowsIterator` | GET | `/api/v1/agent/workflows` | List workflow definitions. (async iterator) |
| `putWorkflow` | PUT | `/api/v1/agent/workflows/{name}` | Create or replace a workflow definition. |
| `resumeWorkflowRun` | POST | `/api/v1/agent/workflows/runs/{run_id}/resume` | Resume a failed or cancelled workflow run. |
| `runSessionWorkflow` | POST | `/api/v1/agent/sessions/{id}/workflows/{name}/runs` | Run a workflow onto an existing session. |

## `api` (289 methods)

### `client.api.activity`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getStats` | GET | `/api/v1/users/auth/activity/stats` | Get activity stats |
| `list` | GET | `/api/v1/users/auth/activity` | Get activity logs |
| `listAll` | GET | `/api/v1/users/auth/activity` | Get activity logs (collect all pages) |
| `listIterator` | GET | `/api/v1/users/auth/activity` | Get activity logs (async iterator) |

### `client.api.ai`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `listModels` | GET | `/api/v1/ai/models` | List available AI models (Hoody catalog) |

### `client.api.authTokens`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `addRealm` | POST | `/api/v1/auth/tokens/{id}/add-realm` | Add realm to auth token |
| `copy` | POST | `/api/v1/auth/tokens/{id}/copy` | Copy auth token |
| `create` | POST | `/api/v1/auth/tokens` | Create a new auth token |
| `delete` | DELETE | `/api/v1/auth/tokens/{id}` | Delete auth token |
| `get` | GET | `/api/v1/auth/tokens/{id}` | Get auth token by ID |
| `getCurrent` | GET | `/api/v1/auth/tokens/me` | Get current auth token details |
| `getPublicProfile` | GET | `/api/v1/auth/tokens/public-profiles/{public_key}` | Get auth token public profile by public key |
| `list` | GET | `/api/v1/auth/tokens` | List auth tokens |
| `listAll` | GET | `/api/v1/auth/tokens` | List auth tokens (collect all pages) |
| `listAuthTokenPermissionTemplates` | GET | `/api/v1/auth/tokens/templates` | List permission templates |
| `listIterator` | GET | `/api/v1/auth/tokens` | List auth tokens (async iterator) |
| `removeRealm` | POST | `/api/v1/auth/tokens/{id}/remove-realm` | Remove realm from auth token |
| `update` | PUT | `/api/v1/auth/tokens/{id}` | Update auth token |
| `updatePublicProfile` | PUT | `/api/v1/auth/tokens/me/public-profile` | Update current auth token public profile |

### `client.api.authentication`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `api_issueIdentityClaim` | POST | `/api/v1/users/auth/identity-claim` | Issue a fresh audience-bound identity claim |
| `forgotPassword` | POST | `/api/v1/auth/forgot-password` | Request password reset |
| `getAvailableRegions` | GET | `/api/v1/auth/available-regions` | Get available server regions |
| `getCurrentUser` | GET | `/api/v1/users/auth/me` | Get current user profile |
| `getCurrentUserAlias` | GET | `/api/v1/users/me` | Get current user profile (alias of /users/auth/me) |
| `getOAuthConfig` | GET | `/api/v1/auth/config` | Get the public sign-in configuration |
| `githubOAuthCallback` | GET | `/api/v1/auth/github/callback` | GitHub OAuth callback |
| `githubOAuthRedirect` | GET | `/api/v1/auth/github` | Redirect to GitHub OAuth |
| `googleOAuthCallback` | GET | `/api/v1/auth/google/callback` | Google OAuth callback |
| `googleOAuthRedirect` | GET | `/api/v1/auth/google` | Redirect to Google OAuth |
| `login` | POST | `/api/v1/users/auth/login` | Login with username and password |
| `logout` | POST | `/api/v1/users/auth/logout` | Logout |
| `oauthAuthorize` | POST | `/api/v1/auth/authorize` | Begin a PKCE OAuth authorization |
| `oauthCancelIntent` | POST | `/api/v1/auth/intent/cancel` | Cancel a pending OAuth AuthIntent or 2FA temp_token |
| `oauthDeviceAuthorize` | GET | `/api/v1/auth/device/authorize` | Start the device-leg OAuth (cookie + ticket gated) |
| `oauthDeviceCode` | POST | `/api/v1/auth/device/code` | Start a device authorization flow (RFC-8628-inspired) |
| `oauthDeviceDeny` | POST | `/api/v1/auth/device/deny` | Refuse the device ('Don't authorize') |
| `oauthDeviceLogin` | POST | `/api/v1/auth/device/login` | Password sign-in for the device authorize step (cookie + ticket gated) |
| `oauthDeviceToken` | POST | `/api/v1/auth/device/token` | Poll for device-flow tokens (RFC-8628-inspired) |
| `oauthDeviceVerifyCode` | POST | `/api/v1/auth/device/verify_code` | Confirm a device user_code (verification page) |
| `oauthExchange` | POST | `/api/v1/auth/exchange` | Exchange a PKCE authorization code for tokens |
| `oauthLaunchInitiate` | POST | `/api/v1/auth/launch/initiate` | Initiate OAuth popup-handoff launch |
| `oauthLaunchStart` | GET | `/api/v1/auth/launch/start` | Start OAuth popup-handoff via single-use ticket |
| `refreshToken` | POST | `/api/v1/users/auth/refresh` | Refresh access token |
| `resendVerification` | POST | `/api/v1/auth/resend-verification` | Resend verification email |
| `resetPassword` | POST | `/api/v1/auth/reset-password` | Reset password |
| `signup` | POST | `/api/v1/auth/signup` | Sign up with email and password |
| `verifyEmail` | POST | `/api/v1/auth/verify-email` | Verify email address |

### `client.api.containers`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `authorize` | POST | `/api/v1/containers/{id}/authorize` | Authorize Container Access |
| `copy` | POST | `/api/v1/containers/{id}/copy` | Copy a container |
| `create` | POST | `/api/v1/projects/{id}/containers` | Create a new container |
| `createSnapshot` | POST | `/api/v1/containers/{id}/snapshots` | Create container snapshot |
| `delete` | DELETE | `/api/v1/containers/{id}` | Delete a container |
| `deleteSnapshot` | DELETE | `/api/v1/containers/{id}/snapshots/{name}` | Delete container snapshot |
| `get` | GET | `/api/v1/containers/{id}` | Get a container by ID |
| `getNetworkConfig` | GET | `/api/v1/containers/{id}/network` | Get container network configuration |
| `getStats` | GET | `/api/v1/containers/{id}/stats` | Get container resource statistics |
| `getStatusLogs` | GET | `/api/v1/containers/{id}/status-logs` | Get status logs for a container |
| `list` | GET | `/api/v1/containers/` | Get all containers |
| `listAll` | GET | `/api/v1/containers/` | Get all containers (collect all pages) |
| `listByProject` | GET | `/api/v1/projects/{id}/containers` | Get all containers for a project |
| `listByProjectAll` | GET | `/api/v1/projects/{id}/containers` | Get all containers for a project (collect all pages) |
| `listByProjectIterator` | GET | `/api/v1/projects/{id}/containers` | Get all containers for a project (async iterator) |
| `listIterator` | GET | `/api/v1/containers/` | Get all containers (async iterator) |
| `listSnapshots` | GET | `/api/v1/containers/{id}/snapshots` | Get container snapshots |
| `listSnapshotsAll` | GET | `/api/v1/containers/{id}/snapshots` | Get container snapshots (collect all pages) |
| `listSnapshotsIterator` | GET | `/api/v1/containers/{id}/snapshots` | Get container snapshots (async iterator) |
| `manage` | POST | `/api/v1/containers/{id}/{operation}` | Manage container |
| `removeNetworkConfig` | DELETE | `/api/v1/containers/{id}/network` | Remove container network configuration |
| `restoreSnapshot` | PUT | `/api/v1/containers/{id}/snapshots/{name}` | Restore container from snapshot |
| `startNetwork` | POST | `/api/v1/containers/{id}/network/start` | Start container network proxy/blocking |
| `stopNetwork` | POST | `/api/v1/containers/{id}/network/stop` | Stop container network proxy/blocking |
| `sync` | POST | `/api/v1/containers/{id}/sync` | Sync a copied container with its source |
| `update` | PUT | `/api/v1/containers/{id}` | Update a container |
| `updateNetworkConfig` | PUT | `/api/v1/containers/{id}/network` | Update container network configuration |
| `updateSnapshotAlias` | PUT | `/api/v1/containers/{id}/snapshots/{name}/alias` | Update snapshot alias |

### `client.api.env`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `bulkSet` | PUT | `/api/v1/containers/{id}/env` | Bulk set container environment variables |
| `delete` | DELETE | `/api/v1/containers/{id}/env/{key}` | Delete a single environment variable |
| `list` | GET | `/api/v1/containers/{id}/env` | List container environment variables |
| `set` | PUT | `/api/v1/containers/{id}/env/{key}` | Set a single environment variable |

### `client.api.events`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `bulkDelete` | DELETE | `/api/v1/events` | Bulk delete events |
| `cleanup` | POST | `/api/v1/events/cleanup` | Cleanup old events |
| `delete` | DELETE | `/api/v1/events/{id}` | Delete a single event |
| `get` | GET | `/api/v1/events/{id}` | Get event details by ID |
| `getStats` | GET | `/api/v1/events/stats` | Get event statistics |
| `list` | GET | `/api/v1/events` | List event history |
| `listAll` | GET | `/api/v1/events` | List event history (collect all pages) |
| `listIterator` | GET | `/api/v1/events` | List event history (async iterator) |

### `client.api.firewall`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `addEgressRule` | POST | `/api/v1/containers/{id}/firewall/egress` | Add Egress Rule |
| `addIngressRule` | POST | `/api/v1/containers/{id}/firewall/ingress` | Add Ingress Rule |
| `list` | GET | `/api/v1/containers/{id}/firewall/rules` | List container firewall rules |
| `listAll` | GET | `/api/v1/containers/{id}/firewall/rules` | List container firewall rules (collect all pages) |
| `listIterator` | GET | `/api/v1/containers/{id}/firewall/rules` | List container firewall rules (async iterator) |
| `removeEgressRule` | DELETE | `/api/v1/containers/{id}/firewall/egress` | Remove Egress Rule(s) |
| `removeIngressRule` | DELETE | `/api/v1/containers/{id}/firewall/ingress` | Remove Ingress Rule(s) |
| `reset` | POST | `/api/v1/containers/{id}/firewall/reset` | Reset container firewall |
| `toggleEgressRule` | PATCH | `/api/v1/containers/{id}/firewall/egress` | Toggle Egress Rule State |
| `toggleIngressRule` | PATCH | `/api/v1/containers/{id}/firewall/ingress` | Toggle Ingress Rule State |

### `client.api.images`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getDetails` | GET | `/api/v1/images/public/{id}` | Get public image details |
| `getIcon` | GET | `/api/v1/images/{id}/icon` | Get image icon |
| `importFree` | POST | `/api/v1/images/import/{id}` | Import free image |
| `list` | GET | `/api/v1/images/user` | List user images |
| `listAll` | GET | `/api/v1/images/user` | List user images (collect all pages) |
| `listIterator` | GET | `/api/v1/images/user` | List user images (async iterator) |
| `listPublic` | GET | `/api/v1/images/public` | List public images |
| `listPublicAll` | GET | `/api/v1/images/public` | List public images (collect all pages) |
| `listPublicIterator` | GET | `/api/v1/images/public` | List public images (async iterator) |
| `purchase` | POST | `/api/v1/images/purchase/{id}` | Purchase image |
| `rate` | POST | `/api/v1/images/rate/{id}` | Rate image |

### `client.api.meta`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getPublicKey` | GET | `/api/v1/meta/public-key` | Get Hoody API Signing Public Key |
| `getSocialStats` | GET | `/api/v1/meta/social-stats` | Get Hoody Social Counters |

### `client.api.notifications`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `list` | GET | `/api/v1/notifications/` | Get all notifications for the authenticated user |
| `listAll` | GET | `/api/v1/notifications/` | Get all notifications for the authenticated user (collect all pages) |
| `listIterator` | GET | `/api/v1/notifications/` | Get all notifications for the authenticated user (async iterator) |
| `listPublic` | GET | `/api/v1/notifications/public` | Get all public notifications |
| `listPublicAll` | GET | `/api/v1/notifications/public` | Get all public notifications (collect all pages) |
| `listPublicIterator` | GET | `/api/v1/notifications/public` | Get all public notifications (async iterator) |
| `markAllRead` | PUT | `/api/v1/notifications/read-all` | Mark all notifications as read |
| `markRead` | PUT | `/api/v1/notifications/{id}/read` | Mark a notification as read |

### `client.api.poolInvitations`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `accept` | POST | `/api/v1/pools/{id}/accept` | Accept invitation |
| `list` | GET | `/api/v1/pools/invitations/pending` | List pending invitations |
| `reject` | POST | `/api/v1/pools/{id}/reject` | Reject invitation |

### `client.api.poolMembers`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `invite` | POST | `/api/v1/pools/{id}/members` | Invite member |
| `remove` | DELETE | `/api/v1/pools/{id}/members/{userId}` | Remove member |
| `updateRole` | PUT | `/api/v1/pools/{id}/members/{userId}` | Update member role |

### `client.api.pools`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/pools` | Create pool |
| `delete` | DELETE | `/api/v1/pools/{id}` | Delete pool |
| `get` | GET | `/api/v1/pools/{id}` | Get pool details |
| `list` | GET | `/api/v1/pools` | List user pools |
| `listAll` | GET | `/api/v1/pools` | List user pools (collect all pages) |
| `listIterator` | GET | `/api/v1/pools` | List user pools (async iterator) |
| `update` | PUT | `/api/v1/pools/{id}` | Update pool |

### `client.api.projects`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `addPermission` | POST | `/api/v1/projects/{id}/permissions` | Grant project access |
| `create` | POST | `/api/v1/projects/` | Create a new project |
| `delete` | DELETE | `/api/v1/projects/{id}` | Delete project |
| `get` | GET | `/api/v1/projects/{id}` | Get project by ID |
| `getStats` | GET | `/api/v1/projects/{id}/stats` | Get statistics for all containers in a project |
| `list` | GET | `/api/v1/projects/` | List all projects |
| `listAll` | GET | `/api/v1/projects/` | List all projects (collect all pages) |
| `listIterator` | GET | `/api/v1/projects/` | List all projects (async iterator) |
| `listPermissions` | GET | `/api/v1/projects/{id}/permissions` | List project permissions |
| `listPermissionsAll` | GET | `/api/v1/projects/{id}/permissions` | List project permissions (collect all pages) |
| `listPermissionsIterator` | GET | `/api/v1/projects/{id}/permissions` | List project permissions (async iterator) |
| `removePermission` | DELETE | `/api/v1/projects/{id}/permissions/{permissionId}` | Revoke project access |
| `update` | PUT | `/api/v1/projects/{id}` | Update project |
| `updatePermission` | PUT | `/api/v1/projects/{id}/permissions/{permissionId}` | Update project permission |

### `client.api.proxyAliases`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/proxy/aliases` | Create a new proxy alias |
| `delete` | DELETE | `/api/v1/proxy/aliases/{id}` | Delete proxy alias |
| `get` | GET | `/api/v1/proxy/aliases/{id}` | Get proxy alias by ID |
| `list` | GET | `/api/v1/proxy/aliases` | List proxy aliases |
| `listAll` | GET | `/api/v1/proxy/aliases` | List proxy aliases (collect all pages) |
| `listIterator` | GET | `/api/v1/proxy/aliases` | List proxy aliases (async iterator) |
| `setState` | PATCH | `/api/v1/proxy/aliases/{id}/state` | Enable or disable proxy alias |
| `update` | PATCH | `/api/v1/proxy/aliases/{id}` | Update proxy alias |

### `client.api.proxyDiscovery`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getContainerProxyService` | GET | `/api/v1/containers/{id}/proxy/services/{service}` | Get merged proxy view for a service |
| `getContainerProxySettings` | GET | `/api/v1/containers/{id}/proxy/settings` | Get container proxy root settings |
| `listContainerProxyGroups` | GET | `/api/v1/containers/{id}/proxy/groups` | List container proxy groups |
| `listContainerProxyServices` | GET | `/api/v1/containers/{id}/proxy/services` | List services referenced in proxy config |
| `updateContainerProxySettings` | PUT | `/api/v1/containers/{id}/proxy/settings` | Update container proxy root settings |

### `client.api.proxyHooks`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `addContainerProxyHook` | POST | `/api/v1/containers/{id}/proxy/hooks/{service}` | Append or insert a new hook |
| `clearContainerProxyServiceHooks` | DELETE | `/api/v1/containers/{id}/proxy/hooks/{service}` | Clear all hooks for a service |
| `getContainerProxyHook` | GET | `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` | Get a single hook by id |
| `listContainerProxyHooks` | GET | `/api/v1/containers/{id}/proxy/hooks` | List all proxy hooks for a container |
| `listContainerProxyServiceHooks` | GET | `/api/v1/containers/{id}/proxy/hooks/{service}` | List hooks for a specific service |
| `moveContainerProxyHook` | PATCH | `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}/position` | Move a hook to a new position |
| `removeContainerProxyHook` | DELETE | `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` | Remove a hook |
| `updateContainerProxyHook` | PUT | `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` | Replace a hook in place |

### `client.api.proxyPermissionsContainer`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `delete` | DELETE | `/api/v1/containers/{id}/proxy/permissions` | Delete container proxy permissions |
| `get` | GET | `/api/v1/containers/{id}/proxy/permissions` | Get container proxy permissions |
| `removeAuthGroup` | DELETE | `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}` | Remove container authentication group |
| `removeGroup` | DELETE | `/api/v1/containers/{id}/proxy/permissions/permissions/{groupName}` | Remove all program permissions for a container group |
| `removeProgram` | DELETE | `/api/v1/containers/{id}/proxy/permissions/permissions/{groupName}/{program}` | Remove a single program permission for a container group |
| `replace` | PUT | `/api/v1/containers/{id}/proxy/permissions` | Replace container proxy permissions JSON |
| `setGroup` | PUT | `/api/v1/containers/{id}/proxy/permissions/permissions/{groupName}` | Set container group program permission |
| `setIpGroup` | PUT | `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/ip` | Set IP authentication group (container) |
| `setJwtGroup` | PUT | `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/jwt` | Set JWT authentication group (container) |
| `setPasswordGroup` | PUT | `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/password` | Set password authentication group (container) |
| `setTokenGroup` | PUT | `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/token` | Set token authentication group (container) |
| `updateDefault` | PATCH | `/api/v1/containers/{id}/proxy/permissions/default` | Update container default proxy permission policy |
| `updateState` | PATCH | `/api/v1/containers/{id}/proxy/permissions/state` | Update container proxy enable state |

### `client.api.proxyPermissionsProject`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `delete` | DELETE | `/api/v1/projects/{id}/proxy/permissions` | Delete project proxy permissions |
| `get` | GET | `/api/v1/projects/{id}/proxy/permissions` | Get project proxy permissions |
| `removeAuthGroup` | DELETE | `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}` | Remove project authentication group |
| `removeGroup` | DELETE | `/api/v1/projects/{id}/proxy/permissions/permissions/{groupName}` | Remove all program permissions for a project group |
| `removeProgram` | DELETE | `/api/v1/projects/{id}/proxy/permissions/permissions/{groupName}/{program}` | Remove a single program permission for a project group |
| `replace` | PUT | `/api/v1/projects/{id}/proxy/permissions` | Replace project proxy permissions JSON |
| `setGroup` | PUT | `/api/v1/projects/{id}/proxy/permissions/permissions/{groupName}` | Set project group program permission |
| `setIpGroup` | PUT | `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/ip` | Set IP authentication group (project) |
| `setJwtGroup` | PUT | `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/jwt` | Set JWT authentication group (project) |
| `setPasswordGroup` | PUT | `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/password` | Set password authentication group (project) |
| `setTokenGroup` | PUT | `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/token` | Set token authentication group (project) |
| `updateDefault` | PATCH | `/api/v1/projects/{id}/proxy/permissions/default` | Update project default proxy permission policy |
| `updateState` | PATCH | `/api/v1/projects/{id}/proxy/permissions/state` | Update project proxy enable state |

### `client.api.realms`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `list` | GET | `/api/v1/realms/` | List your realm IDs |

### `client.api.rentals`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `extend` | POST | `/api/v1/rentals/{id}/extend` | Extend rental |
| `get` | GET | `/api/v1/rentals/{id}` | Get rental details |
| `list` | GET | `/api/v1/rentals` | List user rentals |
| `listAll` | GET | `/api/v1/rentals` | List user rentals (collect all pages) |
| `listIterator` | GET | `/api/v1/rentals` | List user rentals (async iterator) |

### `client.api.serverCommands`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `execute` | POST | `/api/v1/servers/{serverId}/execute-command` | Execute server command |
| `list` | GET | `/api/v1/servers/{serverId}/available-commands` | Get available commands |
| `listAll` | GET | `/api/v1/servers/{serverId}/available-commands` | Get available commands (collect all pages) |
| `listIterator` | GET | `/api/v1/servers/{serverId}/available-commands` | Get available commands (async iterator) |

### `client.api.serverRental`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `browse` | GET | `/api/v1/servers/available` | Browse rental marketplace |
| `browseAll` | GET | `/api/v1/servers/available` | Browse rental marketplace (collect all pages) |
| `browseIterator` | GET | `/api/v1/servers/available` | Browse rental marketplace (async iterator) |
| `get` | GET | `/api/v1/servers/{id}` | Get server details (alias for /rentals/:id) |
| `getMyReservation` | GET | `/api/v1/reservations/{id}` | One of your reservations |
| `getRentalRuntime` | GET | `/api/v1/rentals/{id}/runtime` | Get live runtime info for a rented server or subserver |
| `getServerRuntime` | GET | `/api/v1/servers/{id}/runtime` | Get live runtime info (alias for /rentals/:id/runtime) |
| `list` | GET | `/api/v1/servers` | List user servers (alias for /rentals) |
| `listAll` | GET | `/api/v1/servers` | List user servers (alias for /rentals) (collect all pages) |
| `listIterator` | GET | `/api/v1/servers` | List user servers (alias for /rentals) (async iterator) |
| `listMyReservations` | GET | `/api/v1/reservations` | Your reservations |
| `listServerOffers` | GET | `/api/v1/offers` | Browse machines available to order |
| `rent` | POST | `/api/v1/servers/{id}/rent` | Rent server |
| `reserveServerOffer` | POST | `/api/v1/offers/{id}/reserve` | Reserve an offer (charges immediately) |

### `client.api.storageShares`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/containers/{id}/storage/shares` | Create storage share |
| `delete` | DELETE | `/api/v1/storage/shares/{shareId}` | Delete storage share |
| `get` | GET | `/api/v1/containers/{id}/storage/shares/{shareId}` | Get storage share |
| `list` | GET | `/api/v1/containers/{id}/storage/shares` | List storage shares |
| `listAll` | GET | `/api/v1/containers/{id}/storage/shares` | List storage shares (collect all pages) |
| `listGlobal` | GET | `/api/v1/storage/shares` | List all your storage shares |
| `listGlobalAll` | GET | `/api/v1/storage/shares` | List all your storage shares (collect all pages) |
| `listGlobalIterator` | GET | `/api/v1/storage/shares` | List all your storage shares (async iterator) |
| `listIncoming` | GET | `/api/v1/containers/{id}/storage/incoming` | Get incoming shares |
| `listIncomingGlobal` | GET | `/api/v1/storage/incoming` | Get all incoming shares |
| `listIncomingGlobalAll` | GET | `/api/v1/storage/incoming` | Get all incoming shares (collect all pages) |
| `listIncomingGlobalIterator` | GET | `/api/v1/storage/incoming` | Get all incoming shares (async iterator) |
| `listIterator` | GET | `/api/v1/containers/{id}/storage/shares` | List storage shares (async iterator) |
| `toggleIncomingMount` | PATCH | `/api/v1/containers/{id}/storage/incoming/{shareId}/mount` | Toggle incoming share mount |
| `update` | PATCH | `/api/v1/containers/{id}/storage/shares/{shareId}` | Update storage share |

### `client.api.tfa`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `disable` | DELETE | `/api/v1/users/auth/2fa` | Disable 2FA |
| `getStatus` | GET | `/api/v1/users/auth/2fa/status` | Get 2FA Status |
| `regenerateBackupCodes` | POST | `/api/v1/users/auth/2fa/backup-codes/regenerate` | Regenerate Backup Codes |
| `setTokenGate` | PUT | `/api/v1/users/auth/2fa/token-gate` | Set 2FA token gate preference |
| `setup` | POST | `/api/v1/users/auth/2fa/setup` | Initialize 2FA Setup |
| `verify` | POST | `/api/v1/users/auth/2fa/verify` | Verify 2FA Code During Login |
| `verifySetup` | POST | `/api/v1/users/auth/2fa/verify-setup` | Complete 2FA Setup |

### `client.api.users`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/users/{id}` | Get user by ID |
| `getFreeTierStatus` | GET | `/api/v1/users/me/free-tier-status` | Get free-tier claim status |
| `markOnboardingMilestone` | POST | `/api/v1/users/me/onboarding` | Mark an onboarding milestone as completed |
| `redeemInviteCode` | POST | `/api/v1/users/me/redeem-invite` | Redeem a beta invite code |
| `retrySetup` | POST | `/api/v1/users/me/retry-setup` | Retry free-tier account setup |
| `update` | PUT | `/api/v1/users/{id}` | Update user profile |

### `client.api.utilities`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getIpInfo` | GET | `/api/v1/ip` | Get IP Information |

### `client.api.vault`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `clear` | DELETE | `/api/v1/vault` | Clear entire vault |
| `delete` | DELETE | `/api/v1/vault/keys/{key}` | Delete vault key |
| `get` | GET | `/api/v1/vault/keys/{key}` | Get vault key |
| `getStats` | GET | `/api/v1/vault/stats` | Get vault statistics |
| `list` | GET | `/api/v1/vault/keys` | List vault keys |
| `listAll` | GET | `/api/v1/vault/keys` | List vault keys (collect all pages) |
| `listIterator` | GET | `/api/v1/vault/keys` | List vault keys (async iterator) |
| `set` | PUT | `/api/v1/vault/keys/{key}` | Set vault key |

### `client.api.waitlist`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `waitlistEnrich` | PATCH | `/api/v1/waitlist` | Enrich an existing waitlist signup |
| `waitlistJoin` | POST | `/api/v1/waitlist` | Join the Hoody waitlist |

### `client.api.wallet`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `addPaymentMethod` | POST | `/api/v1/wallet/payment-methods/` | Add a new payment method |
| `claimGithubBonus` | POST | `/api/v1/wallet/github-bonus/claim` | Claim the GitHub connection bonus |
| `createCryptoInvoice` | POST | `/api/v1/wallet/payments/crypto/invoice` | Start a crypto payment (hosted invoice) |
| `createStripeCheckout` | POST | `/api/v1/wallet/payments/stripe/checkout` | Start a card payment (Stripe Checkout) |
| `deletePaymentMethod` | DELETE | `/api/v1/wallet/payment-methods/{id}` | Delete a payment method |
| `downloadInvoicePdf` | GET | `/api/v1/wallet/invoices/{id}/pdf` | Download invoice PDF |
| `generateInvoice` | POST | `/api/v1/wallet/invoices/generate/{id}` | Generate invoice for transaction |
| `getAggregateBalances` | GET | `/api/v1/wallet/balances` | Get aggregate balances (general + AI) |
| `getAiBalance` | GET | `/api/v1/wallet/balances/ai` | Get AI balance (limit, usage, remaining) |
| `getCryptoPaymentIntent` | GET | `/api/v1/wallet/payments/crypto/intents/{id}` | Get a crypto payment intent |
| `getGeneralBalance` | GET | `/api/v1/wallet/balances/general` | Get general balance only |
| `getGithubBonus` | GET | `/api/v1/wallet/github-bonus` | Get GitHub connection bonus status |
| `getInvoice` | GET | `/api/v1/wallet/invoices/{id}` | Get invoice by ID |
| `getPaymentAvailability` | GET | `/api/v1/wallet/payment-availability` | Get top-up payment availability (providers, bounds, AI transfer fee) |
| `getPaymentMethod` | GET | `/api/v1/wallet/payment-methods/{id}` | Get payment method by ID |
| `getStripePaymentIntent` | GET | `/api/v1/wallet/payments/stripe/intents/{id}` | Get a card payment intent |
| `getTransaction` | GET | `/api/v1/wallet/transactions/{id}` | Get transaction by ID |
| `listAiFeeHistory` | GET | `/api/v1/wallet/ai-fee-history` | Get AI credit fee history |
| `listAiFeeHistoryAll` | GET | `/api/v1/wallet/ai-fee-history` | Get AI credit fee history (collect all pages) |
| `listAiFeeHistoryIterator` | GET | `/api/v1/wallet/ai-fee-history` | Get AI credit fee history (async iterator) |
| `listCryptoPaymentIntents` | GET | `/api/v1/wallet/payments/crypto/intents` | List crypto payment intents |
| `listInvoices` | GET | `/api/v1/wallet/invoices/` | Get all invoices |
| `listInvoicesAll` | GET | `/api/v1/wallet/invoices/` | Get all invoices (collect all pages) |
| `listInvoicesIterator` | GET | `/api/v1/wallet/invoices/` | Get all invoices (async iterator) |
| `listPaymentMethods` | GET | `/api/v1/wallet/payment-methods/` | Get all payment methods |
| `listPaymentMethodsAll` | GET | `/api/v1/wallet/payment-methods/` | Get all payment methods (collect all pages) |
| `listPaymentMethodsIterator` | GET | `/api/v1/wallet/payment-methods/` | Get all payment methods (async iterator) |
| `listStripePaymentIntents` | GET | `/api/v1/wallet/payments/stripe/intents` | List card payment intents |
| `listTransactions` | GET | `/api/v1/wallet/transactions` | List transactions |
| `listTransactionsAll` | GET | `/api/v1/wallet/transactions` | List transactions (collect all pages) |
| `listTransactionsIterator` | GET | `/api/v1/wallet/transactions` | List transactions (async iterator) |
| `setDefaultPaymentMethod` | PUT | `/api/v1/wallet/payment-methods/{id}/default` | Set a payment method as default |
| `transferToAi` | POST | `/api/v1/wallet/transfers` | Transfer from general balance to AI credits |
| `updatePaymentMethod` | PUT | `/api/v1/wallet/payment-methods/{id}` | Update a payment method |

## `app` (35 methods)

### `client.app.configuration`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/run/config` | Get full runtime configuration |

### `client.app.docs`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getJson` | GET | `/api/v1/run/openapi.json` | OpenAPI specification (JSON) |
| `getYaml` | GET | `/api/v1/run/openapi.yaml` | OpenAPI specification (YAML) |

### `client.app.execution`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `preflight` | POST | `/api/v1/run/preflight` | Preflight a run request |
| `runAppGet` | GET | `/api/v1/run/run` | Resolve an application and return exact shell command |
| `runAppPost` | POST | `/api/v1/run/run` | Resolve an application via JSON body |
| `runBatch` | POST | `/api/v1/run/batch` | Execute a batch of search or run requests |
| `runPathBased` | GET | `/api/v1/run/go/{rest}` | Path-based resolve (positional or key-value) |
| `runTerminalAnchored` | GET | `/api/v1/run/t/{terminal_id}/go/{rest}` | Terminal-anchored path-based resolve |
| `searchCandidates` | GET | `/api/v1/run/search` | Search for app candidates |
| `searchCandidatesPaged` | POST | `/api/v1/run/search/paged` | Search for app candidates with cursor pagination |
| `searchCandidatesPagedAll` | POST | `/api/v1/run/search/paged` | Search for app candidates with cursor pagination (collect all pages) |
| `searchCandidatesPagedIterator` | POST | `/api/v1/run/search/paged` | Search for app candidates with cursor pagination (async iterator) |

### `client.app.health`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `check` | GET | `/api/v1/run/health` | Service health check |

### `client.app.jobs`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `createSearch` | POST | `/api/v1/run/search/jobs` | Start an async search job |
| `getStatus` | GET | `/api/v1/run/jobs/{job_id}` | Get job status |

### `client.app.profiles`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/run/profiles` | Create a new profile |
| `delete` | DELETE | `/api/v1/run/profiles/{profile}` | Delete a profile |
| `list` | GET | `/api/v1/run/profiles` | List all profiles |
| `select` | POST | `/api/v1/run/profiles/{profile}/select` | Select the active profile |
| `update` | PATCH | `/api/v1/run/profiles/{profile}` | Update a profile |

### `client.app.recipes`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/run/recipes` | Create a saved recipe |
| `delete` | DELETE | `/api/v1/run/recipes/{name}` | Delete a saved recipe |
| `get` | GET | `/api/v1/run/recipes/{name}` | Get a saved recipe |
| `list` | GET | `/api/v1/run/recipes` | List saved launch recipes |
| `run` | POST | `/api/v1/run/recipes/{name}/run` | Run using a saved recipe |
| `search` | POST | `/api/v1/run/recipes/{name}/search` | Search using a saved recipe |
| `update` | PATCH | `/api/v1/run/recipes/{name}` | Update a saved recipe |

### `client.app.sources`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/run/sources` | Create a new package source |
| `delete` | DELETE | `/api/v1/run/sources/{source_id}` | Delete a package source |
| `getDiagnostics` | GET | `/api/v1/run/sources/{source_id}/diagnostics` | Get runtime diagnostics for a source |
| `list` | GET | `/api/v1/run/sources` | List all package sources |
| `sync` | POST | `/api/v1/run/sources/{source_id}/sync` | Sync a single source |
| `syncAll` | POST | `/api/v1/run/sources/sync` | Sync all sources |
| `update` | PATCH | `/api/v1/run/sources/{source_id}` | Update a package source |

## `browser` (29 methods)

### `client.browser.cookies`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `clear` | DELETE | `/cookies` | Clear all cookies |
| `get` | GET | `/cookies` | Get cookies |
| `set` | POST | `/cookies` | Set cookies |

### `client.browser.debugging`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getConsoleLogs` | GET | `/console` | Get console logs |
| `getNetworkLogs` | GET | `/network` | Get network logs |

### `client.browser.health`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `check` | GET | `/api/v1/browser/health` | Health check |
| `getMetrics` | GET | `/metrics` | Server metrics |
| `getOpenApiJson` | GET | `/openapi.json` | Get OpenAPI specification (JSON) |
| `getOpenApiYaml` | GET | `/openapi.yaml` | Get OpenAPI specification (YAML) |

### `client.browser.history`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `clear` | DELETE | `/history` | Delete browsing history |
| `list` | GET | `/history` | Query browsing history |

### `client.browser.instances`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `restart` | GET | `/restart` | Restart browser instance |
| `start` | GET | `/start` | Create or retrieve browser instance |
| `stop` | GET | `/stop` | Stop browser instance |

### `client.browser.interaction`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `browse` | GET | `/browse` | Navigate to URL |
| `browsePost` | POST | `/browse` | Navigate to URL (POST) |
| `evalGet` | GET | `/eval` | Execute JavaScript |
| `evalPost` | POST | `/eval` | Execute JavaScript (POST) |
| `takeScreenshot` | GET | `/screenshot` | Capture browser screenshot |

### `client.browser.introspection`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `closeTab` | POST | `/tab/close` | Close a browser tab |
| `getDevtoolsUrl` | GET | `/devtools-url` | Get DevTools URLs |
| `getMetadata` | GET | `/metadata` | Get instance metadata |
| `getViewport` | GET | `/viewport` | Get the current viewport policy |
| `listTabs` | GET | `/tabs` | List browser tabs |
| `setViewport` | POST | `/viewport` | Change the viewport at runtime |
| `shutdown` | GET | `/shutdown` | Shutdown browser instance |

### `client.browser.page`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `exportPdf` | GET | `/pdf` | Export page as PDF |
| `getHtml` | GET | `/html` | Get page HTML |
| `getText` | GET | `/text` | Get page text |

## `code` (19 methods)

### `client.code.auth`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getLoginPage` | GET | `/api/v1/code/login` | Get login page |
| `login` | POST | `/api/v1/code/login` | Submit login credentials |
| `logout` | GET | `/api/v1/code/logout` | Logout |

### `client.code.extensions`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `install` | POST | `/api/v1/code/extensions/install` | Install VS Code extension from URL |
| `list` | GET | `/api/v1/code/extensions/list` | List installed extensions |
| `listAll` | GET | `/api/v1/code/extensions/list` | List installed extensions (collect all pages) |
| `listIterator` | GET | `/api/v1/code/extensions/list` | List installed extensions (async iterator) |

### `client.code.health`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `check` | GET | `/api/v1/code/health` | Service health check |
| `checkUpdate` | GET | `/api/v1/code/update/check` | Check for updates |

### `client.code.proxy`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `resolve` | GET | `/api/v1/code/proxy/{port}/{path}` | Proxy to local port (path-based) |
| `resolveAbsolute` | GET | `/api/v1/code/absproxy/{port}/{path}` | Proxy to local port (absolute path) |

### `client.code.static`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/_static/{path}` | Get static asset |
| `getInjectedScript` | GET | `/hoody-code/injected/{script}` | Get Hoody Code injected script |
| `getOpenAPI` | GET | `/openapi.yaml` | Get OpenAPI specification |
| `getRobots` | GET | `/robots.txt` | Get robots.txt |
| `getSecurityPolicy` | GET | `/security.txt` | Get security policy |

### `client.code.vscode`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getManifest` | GET | `/api/v1/code/manifest.json` | Get PWA manifest |
| `getVSCode` | GET | `/api/v1/code` | Get VS Code web interface |
| `mintKey` | POST | `/api/v1/code/mint-key` | Generate server web key |

## `cron` (15 methods)

### `client.cron.crontab`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/users/{user}/crontab` | Get Crontab |
| `listGlobal` | GET | `/crontab` | List All Crontabs |
| `listGlobalAll` | GET | `/crontab` | List All Crontabs (collect all pages) |
| `listGlobalIterator` | GET | `/crontab` | List All Crontabs (async iterator) |
| `put` | PUT | `/users/{user}/crontab` | Put Crontab |

### `client.cron.entries`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/users/{user}/entries` | Create Entry |
| `delete` | DELETE | `/users/{user}/entries/{id}` | Delete Entry |
| `get` | GET | `/users/{user}/entries/{id}` | Get Entry |
| `list` | GET | `/users/{user}/entries` | List Entries |
| `listAll` | GET | `/users/{user}/entries` | List Entries (collect all pages) |
| `listIterator` | GET | `/users/{user}/entries` | List Entries (async iterator) |
| `update` | PATCH | `/users/{user}/entries/{id}` | Update Entry |

### `client.cron.health`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `check` | GET | `/health` | Health Check |

### `client.cron.system`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getOpenApiJson` | GET | `/openapi.json` | Get Open Api Json |
| `getOpenApiYaml` | GET | `/openapi.yaml` | Get Open Api Yaml |

## `curl` (31 methods)

### `client.curl`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `execute` | POST | `/api/v1/curl/request` | Execute HTTP request with full cURL capabilities |
| `executeCurlRequestGet` | GET | `/api/v1/curl/request` | Execute simple HTTP request via query parameters |

### `client.curl.events`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `sseJobEvents` | GET | `/api/v1/curl/sse` | Subscribe to job events over Server-Sent Events |
| `streamWs` | GET | `/api/v1/curl/ws` | Subscribe to job events over WebSocket |
| `wsRequestChannel` | GET | `/api/v1/curl/channel` | Execute cURL requests over a WebSocket channel |

### `client.curl.health`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `check` | GET | `/api/v1/curl/health` | Service health check |

### `client.curl.jobs`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `cancel` | DELETE | `/api/v1/curl/jobs/{id}` | Cancel a pending or running job |
| `get` | GET | `/api/v1/curl/jobs/{id}` | Get detailed job information |
| `getResult` | GET | `/api/v1/curl/jobs/{id}/result` | Get job response body |
| `list` | GET | `/api/v1/curl/jobs` | List all async jobs |
| `listAll` | GET | `/api/v1/curl/jobs` | List all async jobs (collect all pages) |
| `listIterator` | GET | `/api/v1/curl/jobs` | List all async jobs (async iterator) |

### `client.curl.ops`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `metrics` | GET | `/metrics` | Prometheus metrics |

### `client.curl.schedules`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/curl/schedule` | Create a recurring scheduled job |
| `delete` | DELETE | `/api/v1/curl/schedule/{id}` | Delete a schedule |
| `get` | GET | `/api/v1/curl/schedule/{id}` | Get schedule details |
| `list` | GET | `/api/v1/curl/schedule` | List all scheduled jobs |
| `listAll` | GET | `/api/v1/curl/schedule` | List all scheduled jobs (collect all pages) |
| `listIterator` | GET | `/api/v1/curl/schedule` | List all scheduled jobs (async iterator) |
| `toggle` | PATCH | `/api/v1/curl/schedule/{id}/toggle` | Enable or disable a schedule |

### `client.curl.sessions`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `delete` | DELETE | `/api/v1/curl/sessions/{id}` | Delete a session |
| `get` | GET | `/api/v1/curl/sessions/{id}` | Get session details |
| `getCookies` | GET | `/api/v1/curl/sessions/{id}/cookies` | Get session cookies only |
| `list` | GET | `/api/v1/curl/sessions` | List all cookie sessions |
| `listAll` | GET | `/api/v1/curl/sessions` | List all cookie sessions (collect all pages) |
| `listIterator` | GET | `/api/v1/curl/sessions` | List all cookie sessions (async iterator) |

### `client.curl.storage`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `deleteFile` | DELETE | `/api/v1/curl/storage/{path}` | Delete a saved file |
| `getFile` | GET | `/api/v1/curl/storage/{path}` | Download a saved file |
| `list` | GET | `/api/v1/curl/storage` | List all saved downloads |
| `listAll` | GET | `/api/v1/curl/storage` | List all saved downloads (collect all pages) |
| `listIterator` | GET | `/api/v1/curl/storage` | List all saved downloads (async iterator) |

## `daemon` (23 methods)

### `client.daemon.control`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `disable` | POST | `/api/v1/daemon/programs/{id}/disable` | Disable a program |
| `enable` | POST | `/api/v1/daemon/programs/{id}/enable` | Enable a program |
| `start` | POST | `/api/v1/daemon/programs/{id}/start` | Start a program or port instance |
| `stop` | POST | `/api/v1/daemon/programs/{id}/stop` | Stop a program or port instance |

### `client.daemon.health`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `check` | GET | `/api/v1/daemon/health` | Service health check |

### `client.daemon.programs`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `add` | POST | `/api/v1/daemon/programs/add` | Add a new CUSTOM program |
| `edit` | POST | `/api/v1/daemon/programs/edit/{id}` | Edit a program |
| `get` | GET | `/api/v1/daemon/programs/{id}` | Get a specific program |
| `list` | GET | `/api/v1/daemon/programs` | List all programs |
| `listAll` | GET | `/api/v1/daemon/programs` | List all programs (collect all pages) |
| `listIterator` | GET | `/api/v1/daemon/programs` | List all programs (async iterator) |
| `remove` | POST | `/api/v1/daemon/programs/remove/{id}` | Remove a program |
| `reset` | POST | `/api/v1/daemon/programs/reset` | Reset programs to default |

### `client.daemon.quickStart`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getEphemeralLogs` | GET | `/api/v1/daemon/quick-start/{id}/logs` | Get ephemeral program logs |
| `getStatus` | GET | `/api/v1/daemon/quick-start/{id}/status` | Get ephemeral program status |
| `launch` | POST | `/api/v1/daemon/quick-start` | Launch ephemeral CUSTOM program |
| `list` | GET | `/api/v1/daemon/quick-start` | List all ephemeral programs |
| `listAll` | GET | `/api/v1/daemon/quick-start` | List all ephemeral programs (collect all pages) |
| `listIterator` | GET | `/api/v1/daemon/quick-start` | List all ephemeral programs (async iterator) |
| `stop` | POST | `/api/v1/daemon/quick-start/{id}/stop` | Stop ephemeral program |

### `client.daemon.status`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/daemon/status/{id}` | Get specific program status |
| `getAll` | GET | `/api/v1/daemon/status` | Get all program statuses |
| `getLogs` | GET | `/api/v1/daemon/programs/{id}/logs` | Get program logs |

## `display` (47 methods)

### `client.display`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `accessClient` | GET | `/api/v1/display/` | Access the HTML5 Display client interface |
| `getClipboard` | GET | `/api/v1/display/clipboard` | Read clipboard text |
| `getInformation` | GET | `/api/v1/display/info` | Get display information and screenshots |
| `getWindowProperties` | GET | `/api/v1/display/window/{windowId}/properties` | Get extended properties for a window |
| `listScreenshots` | GET | `/api/v1/display/screenshots` | List all available screenshots |
| `listWindows` | GET | `/api/v1/display/windows` | List windows on the current display |
| `setClipboard` | POST | `/api/v1/display/clipboard` | Write clipboard text |

### `client.display.health`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `check` | GET | `/api/v1/display/health` | Service health check |

### `client.display.input`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `act` | POST | `/api/v1/display/input/act` | Execute one action with optional screenshot |
| `batch` | POST | `/api/v1/display/input/batch` | Execute a sequence of actions |
| `clickAt` | POST | `/api/v1/display/input/click-at` | Move cursor and click |
| `drag` | POST | `/api/v1/display/input/drag` | Drag from one position to another |
| `geometry` | GET | `/api/v1/display/input/display-geometry` | Get display dimensions |
| `keyboardKey` | POST | `/api/v1/display/keyboard/key` | Press key combinations |
| `keyboardKeyDown` | POST | `/api/v1/display/keyboard/key-down` | Hold a key down |
| `keyboardKeyUp` | POST | `/api/v1/display/keyboard/key-up` | Release a held key |
| `keyboardType` | POST | `/api/v1/display/keyboard/type` | Type a string of text |
| `mouseClick` | POST | `/api/v1/display/mouse/click` | Click a mouse button |
| `mouseDoubleClick` | POST | `/api/v1/display/mouse/double-click` | Double-click a mouse button |
| `mouseDown` | POST | `/api/v1/display/mouse/down` | Press and hold a mouse button |
| `mouseLocation` | GET | `/api/v1/display/mouse/location` | Get cursor position |
| `mouseMove` | POST | `/api/v1/display/mouse/move` | Move cursor to absolute position |
| `mouseMoveRelative` | POST | `/api/v1/display/mouse/move-relative` | Move cursor by offset |
| `mouseScroll` | POST | `/api/v1/display/mouse/scroll` | Scroll in a direction |
| `mouseUp` | POST | `/api/v1/display/mouse/up` | Release a mouse button |
| `reset` | POST | `/api/v1/display/input/reset` | Emergency release all inputs |
| `select` | POST | `/api/v1/display/input/select` | Select a range via click + shift-click |
| `typeAt` | POST | `/api/v1/display/input/type-at` | Move, click, and type in one operation |
| `wait` | POST | `/api/v1/display/input/wait` | Wait for a duration with optional screenshot |
| `windowActive` | GET | `/api/v1/display/window/active` | Get the active window ID |
| `windowClose` | POST | `/api/v1/display/window/close` | Close a window |
| `windowFocus` | POST | `/api/v1/display/window/focus` | Focus/activate a window |
| `windowGeometry` | GET | `/api/v1/display/window/{windowId}/geometry` | Get window position and size |
| `windowMinimize` | POST | `/api/v1/display/window/minimize` | Minimize a window |
| `windowMove` | POST | `/api/v1/display/window/move` | Move a window |
| `windowName` | GET | `/api/v1/display/window/{windowId}/name` | Get window title |
| `windowRaise` | POST | `/api/v1/display/window/raise` | Raise a window to the top |
| `windowResize` | POST | `/api/v1/display/window/resize` | Resize a window |
| `windowSearch` | POST | `/api/v1/display/window/search` | Search for windows by pattern |

### `client.display.screenshots`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `capture` | GET | `/api/v1/display/screenshot` | Capture a new screenshot |
| `captureMetadata` | GET | `/api/v1/display/screenshot/info` | Capture screenshot and return metadata only |
| `getByTimestamp` | GET | `/api/v1/display/screenshot/{timestamp}` | Retrieve a specific screenshot by timestamp |
| `getLatest` | GET | `/api/v1/display/screenshot/last` | Retrieve the most recent screenshot |
| `getLatestMetadata` | GET | `/api/v1/display/screenshot/last/info` | Get metadata for the most recent screenshot |

### `client.display.thumbnails`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `capture` | GET | `/api/v1/display/thumbnail` | Capture a new screenshot thumbnail |
| `getByTimestamp` | GET | `/api/v1/display/thumbnail/{timestamp}` | Retrieve a specific thumbnail by timestamp |
| `getLatest` | GET | `/api/v1/display/thumbnail/last` | Retrieve the most recent thumbnail |

## `exec` (69 methods)

### `client.exec.cache`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `clear` | POST | `/api/v1/exec/cache/clear` | Clear Cache |

### `client.exec.dependencies`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `check` | POST | `/api/v1/exec/dependencies/check` | Check Dependencies |
| `install` | POST | `/api/v1/exec/dependencies/install` | Install Dependencies |
| `listBundled` | GET | `/api/v1/exec/dependencies/bundled` | List Bundled Dependencies |

### `client.exec.execution`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `execute` | GET | `/{path}` | Execute Script (GET) |

### `client.exec.health`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `check` | GET | `/api/v1/exec/health` | Health Check |

### `client.exec.ids`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `list` | GET | `/api/v1/exec/list` | List All Exec Ids |

### `client.exec.logs`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `clear` | DELETE | `/api/v1/exec/logs/clear` | Clear Logs |
| `list` | GET | `/api/v1/exec/logs/list` | List Logs |
| `read` | POST | `/api/v1/exec/logs/read` | Read Log |
| `search` | POST | `/api/v1/exec/logs/search` | Search Logs |
| `stream` | GET | `/api/v1/exec/logs/stream` | Stream Logs |

### `client.exec.magic`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `bulkUpdate` | POST | `/api/v1/exec/magic-comments/bulk-update` | Bulk Update Magic Comments |
| `getSchema` | GET | `/api/v1/exec/magic-comments/schema` | Get Magic Comments Schema |
| `read` | GET | `/api/v1/exec/magic-comments/read` | Read Magic Comments |
| `updateHandler` | PUT | `/api/v1/exec/magic-comments/update` | Update Magic Comments Handler |

### `client.exec.monitor`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getActiveRequests` | GET | `/api/v1/exec/monitor/active-requests` | Get Active Requests |
| `getScriptPerformance` | POST | `/api/v1/exec/monitor/script-performance` | Get Script Performance |
| `getStats` | GET | `/api/v1/exec/monitor/stats` | Get Stats |
| `listMonitorScripts` | GET | `/api/v1/exec/monitor/scripts` | List Monitor Scripts |
| `prometheusExport` | GET | `/api/v1/exec/monitor/metrics` | Prometheus Export |

### `client.exec.openapi`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `generate` | POST | `/api/v1/exec/user-openapi/generate` | Generate User OpenAPI |
| `listScripts` | GET | `/api/v1/exec/user-openapi/list` | List User Scripts |
| `merge` | POST | `/api/v1/exec/user-openapi/merge` | Merge OpenAPI Specs |
| `serve` | GET | `/api/v1/exec/user-openapi/spec` | Serve Generated Spec |
| `serveSchema` | GET | `/api/v1/exec/user-openapi/schema` | Serve Schema File |
| `validateSchema` | POST | `/api/v1/exec/user-openapi/validate` | Validate User Schema |

### `client.exec.package`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `compare` | POST | `/api/v1/exec/package/compare` | Compare Packages |
| `initJson` | POST | `/api/v1/exec/package/init` | Init package.json |
| `install` | POST | `/api/v1/exec/package/install` | Install Packages |
| `pinVersions` | POST | `/api/v1/exec/package/pin` | Pin Versions |
| `readJson` | GET | `/api/v1/exec/package/read` | Read package.json |
| `updateJson` | POST | `/api/v1/exec/package/update` | Update package.json |

### `client.exec.route`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `discover` | POST | `/api/v1/exec/route/discover` | Discover Routes |
| `resolve` | POST | `/api/v1/exec/route/resolve` | Resolve Route |
| `test` | POST | `/api/v1/exec/route/test` | Test Route |

### `client.exec.schedules`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `listSchedules` | GET | `/api/v1/exec/schedules/list` | List Schedules |
| `reloadSchedules` | POST | `/api/v1/exec/schedules/reload` | Reload Schedules |
| `scheduleHistory` | GET | `/api/v1/exec/schedules/history` | Schedule History |
| `triggerSchedule` | POST | `/api/v1/exec/schedules/trigger` | Trigger Schedule |

### `client.exec.scripts`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `delete` | DELETE | `/api/v1/exec/scripts/delete` | Delete Script |
| `getTree` | POST | `/api/v1/exec/scripts/tree` | Get Script Tree |
| `list` | GET | `/api/v1/exec/scripts/list` | List Scripts |
| `move` | POST | `/api/v1/exec/scripts/move` | Move Script |
| `read` | GET | `/api/v1/exec/scripts/read` | Read Script |
| `write` | POST | `/api/v1/exec/scripts/write` | Write Script |

### `client.exec.sdk`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `delete` | DELETE | `/api/v1/exec/sdk/:id` | Delete SDK |
| `get` | GET | `/api/v1/exec/sdk/:id` | Get SDK |
| `importSDK` | POST | `/api/v1/exec/sdk/import` | Import SDK |
| `list` | GET | `/api/v1/exec/sdk/list` | List SDKs |

### `client.exec.state`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `clear` | POST | `/api/v1/exec/shared-state/clear` | Clear Shared State |
| `get` | POST | `/api/v1/exec/shared-state/get` | Get Shared State |
| `set` | POST | `/api/v1/exec/shared-state/set` | Set Shared State |

### `client.exec.system`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getOpenApiJson` | GET | `/openapi.json` | Get OpenAPI Specification (JSON) |
| `getOpenApiYaml` | GET | `/openapi.yaml` | Get OpenAPI Specification (YAML) |
| `getRestartStatus` | GET | `/api/v1/exec/system/restart-status` | Get Restart Status |
| `restartServer` | POST | `/api/v1/exec/system/restart` | Restart Server |

### `client.exec.templates`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `createCustom` | POST | `/api/v1/exec/templates/create-custom` | Create Custom Template |
| `deleteCustom` | DELETE | `/api/v1/exec/templates/delete-custom/:name` | Delete Custom Template |
| `generate` | POST | `/api/v1/exec/templates/generate` | Generate From Template |
| `list` | GET | `/api/v1/exec/templates/list` | List Templates |
| `preview` | GET | `/api/v1/exec/templates/preview` | Preview Template |
| `updateCustom` | PUT | `/api/v1/exec/templates/update-custom/:name` | Update Custom Template |

### `client.exec.validate`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `validateDependencies` | POST | `/api/v1/exec/validate/dependencies` | Validate Dependencies |
| `validateMagicComments` | POST | `/api/v1/exec/validate/magic-comments` | Validate Magic Comments |
| `validateReturnType` | POST | `/api/v1/exec/validate/return-type` | Validate Return Type |
| `validateScript` | POST | `/api/v1/exec/validate/script` | Validate Script |
| `validateSyntax` | POST | `/api/v1/exec/validate/syntax` | Validate Syntax |
| `validateTypeScript` | POST | `/api/v1/exec/validate/typescript` | Validate TypeScript |

## `files` (127 methods)

### `client.files.archives`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `downloadAsZip` | GET | `/{directory}?zip` | Download directory as ZIP |
| `extract` | GET | `/{archive}?extract` | Extract archive |
| `extractFile` | GET | `/{archive}?extract_file` | Extract file from archive |
| `getHistory` | GET | `/?extraction_history` | Extraction history |
| `listActive` | GET | `/?extractions` | List active extractions |
| `listGlobal` | GET | `/api/v1/extractions` | List active extractions |
| `preview` | GET | `/{archive}?preview` | Preview archive contents or read file |
| `viewFile` | GET | `/{archive}?view_file` | View file from archive |

### `client.files.authentication`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `checkAuth` | CHECKAUTH | `/{path}` | Check authentication status |
| `logout` | LOGOUT | `/{path}` | Clear authentication |

### `client.files.backends`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `connectAlias` | POST | `/api/v1/backends/alias` | Connect to alias backend |
| `connectAzureblob` | POST | `/api/v1/backends/azureblob` | Connect to azureblob backend |
| `connectAzurefiles` | POST | `/api/v1/backends/azurefiles` | Connect to azurefiles backend |
| `connectB2` | POST | `/api/v1/backends/b2` | Connect to b2 backend |
| `connectBox` | POST | `/api/v1/backends/box` | Connect to box backend |
| `connectCache` | POST | `/api/v1/backends/cache` | Connect to cache backend |
| `connectChunker` | POST | `/api/v1/backends/chunker` | Connect to chunker backend |
| `connectCloudinary` | POST | `/api/v1/backends/cloudinary` | Connect to cloudinary backend |
| `connectCombine` | POST | `/api/v1/backends/combine` | Connect to combine backend |
| `connectCompress` | POST | `/api/v1/backends/compress` | Connect to compress backend |
| `connectCrypt` | POST | `/api/v1/backends/crypt` | Connect to crypt backend |
| `connectDrive` | POST | `/api/v1/backends/drive` | Connect to drive backend |
| `connectDropbox` | POST | `/api/v1/backends/dropbox` | Connect to dropbox backend |
| `connectFichier` | POST | `/api/v1/backends/fichier` | Connect to fichier backend |
| `connectFilefabric` | POST | `/api/v1/backends/filefabric` | Connect to filefabric backend |
| `connectFilescom` | POST | `/api/v1/backends/filescom` | Connect to filescom backend |
| `connectFtp` | POST | `/api/v1/backends/ftp` | Connect to ftp backend |
| `connectGofile` | POST | `/api/v1/backends/gofile` | Connect to gofile backend |
| `connectGoogleCloudStorage` | POST | `/api/v1/backends/google-cloud-storage` | Connect to google cloud storage backend |
| `connectGooglePhotos` | POST | `/api/v1/backends/google-photos` | Connect to google photos backend |
| `connectHasher` | POST | `/api/v1/backends/hasher` | Connect to hasher backend |
| `connectHdfs` | POST | `/api/v1/backends/hdfs` | Connect to hdfs backend |
| `connectHidrive` | POST | `/api/v1/backends/hidrive` | Connect to hidrive backend |
| `connectHttp` | POST | `/api/v1/backends/http` | Connect to http backend |
| `connectIclouddrive` | POST | `/api/v1/backends/iclouddrive` | Connect to iclouddrive backend |
| `connectImagekit` | POST | `/api/v1/backends/imagekit` | Connect to imagekit backend |
| `connectInternetarchive` | POST | `/api/v1/backends/internetarchive` | Connect to internetarchive backend |
| `connectJottacloud` | POST | `/api/v1/backends/jottacloud` | Connect to jottacloud backend |
| `connectKoofr` | POST | `/api/v1/backends/koofr` | Connect to koofr backend |
| `connectLinkbox` | POST | `/api/v1/backends/linkbox` | Connect to linkbox backend |
| `connectLocal` | POST | `/api/v1/backends/local` | Connect to local backend |
| `connectMailru` | POST | `/api/v1/backends/mailru` | Connect to mailru backend |
| `connectMega` | POST | `/api/v1/backends/mega` | Connect to mega backend |
| `connectMemory` | POST | `/api/v1/backends/memory` | Connect to memory backend |
| `connectNetstorage` | POST | `/api/v1/backends/netstorage` | Connect to netstorage backend |
| `connectOnedrive` | POST | `/api/v1/backends/onedrive` | Connect to onedrive backend |
| `connectOpendrive` | POST | `/api/v1/backends/opendrive` | Connect to opendrive backend |
| `connectOracleobjectstorage` | POST | `/api/v1/backends/oracleobjectstorage` | Connect to oracleobjectstorage backend |
| `connectPcloud` | POST | `/api/v1/backends/pcloud` | Connect to pcloud backend |
| `connectPikpak` | POST | `/api/v1/backends/pikpak` | Connect to pikpak backend |
| `connectPixeldrain` | POST | `/api/v1/backends/pixeldrain` | Connect to pixeldrain backend |
| `connectPremiumizeme` | POST | `/api/v1/backends/premiumizeme` | Connect to premiumizeme backend |
| `connectProtondrive` | POST | `/api/v1/backends/protondrive` | Connect to protondrive backend |
| `connectPutio` | POST | `/api/v1/backends/putio` | Connect to putio backend |
| `connectQingstor` | POST | `/api/v1/backends/qingstor` | Connect to qingstor backend |
| `connectQuatrix` | POST | `/api/v1/backends/quatrix` | Connect to quatrix backend |
| `connectS3` | POST | `/api/v1/backends/s3` | Connect to s3 backend |
| `connectSeafile` | POST | `/api/v1/backends/seafile` | Connect to seafile backend |
| `connectSftp` | POST | `/api/v1/backends/sftp` | Connect to sftp backend |
| `connectSharefile` | POST | `/api/v1/backends/sharefile` | Connect to sharefile backend |
| `connectSia` | POST | `/api/v1/backends/sia` | Connect to sia backend |
| `connectSmb` | POST | `/api/v1/backends/smb` | Connect to smb backend |
| `connectStorj` | POST | `/api/v1/backends/storj` | Connect to storj backend |
| `connectSugarsync` | POST | `/api/v1/backends/sugarsync` | Connect to sugarsync backend |
| `connectSwift` | POST | `/api/v1/backends/swift` | Connect to swift backend |
| `connectTardigrade` | POST | `/api/v1/backends/tardigrade` | Connect to tardigrade backend |
| `connectUlozto` | POST | `/api/v1/backends/ulozto` | Connect to ulozto backend |
| `connectUnion` | POST | `/api/v1/backends/union` | Connect to union backend |
| `connectUptobox` | POST | `/api/v1/backends/uptobox` | Connect to uptobox backend |
| `connectWebdav` | POST | `/api/v1/backends/webdav` | Connect to webdav backend |
| `connectYandex` | POST | `/api/v1/backends/yandex` | Connect to yandex backend |
| `connectZoho` | POST | `/api/v1/backends/zoho` | Connect to zoho backend |
| `disconnect` | DELETE | `/api/v1/backends/{id}` | Disconnect backend |
| `getDetails` | GET | `/api/v1/backends/{id}` | Get backend details |
| `list` | GET | `/api/v1/backends` | List all backends |
| `testConnection` | GET | `/api/v1/backends/{id}/test` | Test backend connection |
| `update` | PUT | `/api/v1/backends/{id}` | Update backend credentials |

### `client.files.directories`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | MKCOL | `/{path}` | Create directory |

### `client.files.downloads`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `fetch` | GET | `/{directory}?download` | Download file from remote URL |
| `getHistory` | GET | `/?download_history` | Download history |
| `listActive` | GET | `/{directory}?downloads` | List active downloads |
| `listGlobal` | GET | `/api/v1/downloads` | List active downloads |

### `client.files`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `append` | PUT | `/api/v1/files/append/{path}` | Append data to file |
| `chmod` | PATCH | `/api/v1/files/chmod/{path}` | Change file permissions |
| `chown` | PATCH | `/api/v1/files/chown/{path}` | Change file ownership |
| `copy` | POST | `/api/v1/files/copy/{path}` | Copy file or directory |
| `delete` | DELETE | `/api/v1/files/{path}` | Delete file or directory |
| `deleteRecursive` | DELETE | `/{path}` | Delete file or directory |
| `get` | GET | `/api/v1/files/{path}` | List directory or download file |
| `getMetadata` | HEAD | `/{path}` | Get file metadata |
| `glob` | GET | `/api/v1/files/glob/{path}` | Find files by glob pattern |
| `grep` | GET | `/api/v1/files/grep/{path}` | Search file contents (grep) |
| `listDirectory` | GET | `/{path}` | List directory contents or download file |
| `move` | POST | `/api/v1/files/move/{path}` | Move file or directory |
| `operate` | POST | `/api/v1/files/{path}` | File operations (mkdir, extract, download, move, copy) |
| `patch` | PATCH | `/{path}` | File operations |
| `patchApi` | PATCH | `/api/v1/files/{path}` | Modify file properties or move/rename |
| `put` | PUT | `/api/v1/files/{path}` | Upload or append file |
| `realpath` | GET | `/api/v1/files/realpath/{path}` | Resolve canonical path (realpath) |
| `search` | GET | `/{directory}?q` | Search directory |
| `stat` | GET | `/api/v1/files/stat/{path}` | Get file metadata (stat) |
| `touch` | PUT | `/{path}?touch` | Touch file (create or update mtime) |
| `upload` | PUT | `/{path}` | Upload file |

### `client.files.ftp`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `access` | GET | `/{path}?type=ftp` | Access file via FTP |

### `client.files.git`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `fetch` | GET | `/{path}?type=git` | Fetch file from Git repository |

### `client.files.health`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `check` | GET | `/api/v1/files/health` | Service health check |

### `client.files.images`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `process` | GET | `/{image}?thumbnail` | Process and convert images |

### `client.files.journal`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `flush` | POST | `/api/v1/journal/flush` | Flush journal to disk |
| `getStats` | GET | `/api/v1/journal/stats` | Get journal statistics |
| `query` | GET | `/api/v1/journal` | Query journal entries |

### `client.files.mounts`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/mounts` | Create persistent FUSE mount |
| `getDetails` | GET | `/api/v1/mounts/{id}` | Get mount details |
| `list` | GET | `/api/v1/mounts` | List all mounts |
| `unmount` | DELETE | `/api/v1/mounts/{id}` | Unmount filesystem |
| `update` | PATCH | `/api/v1/mounts/{id}` | Update mount VFS configuration |

### `client.files.s3`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `access` | GET | `/{path}?type=s3` | Access file from S3 |

### `client.files.ssh`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `access` | GET | `/{path}?type=ssh` | Access file via SSH/SFTP |
| `upload` | PUT | `/{path}?type=ssh` | Upload file via SSH/SFTP |

### `client.files.system`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getApiVersion` | GET | `/api/v1/version` | Get API version |

### `client.files.webdav`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `access` | GET | `/{path}?type=webdav` | Access file via WebDAV |
| `copyResource` | COPY | `/{path}` | Copy file or directory |
| `getOptions` | OPTIONS | `/{path}` | Get allowed methods |
| `lockResource` | LOCK | `/{path}` | Lock file (WebDAV compatibility) |
| `moveResource` | MOVE | `/{path}` | Move or rename file/directory |
| `propfindResource` | PROPFIND | `/{path}` | Get WebDAV properties |
| `proppatchResource` | PROPPATCH | `/{path}` | Update WebDAV properties |
| `unlockResource` | UNLOCK | `/{path}` | Unlock file (WebDAV compatibility) |

## `notes` (64 methods)

### `client.notes.avatars`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `download` | GET | `/api/v1/notes/avatars/{avatarId}` | Download an avatar image |
| `upload` | POST | `/api/v1/notes/avatars` | Upload an avatar image |

### `client.notes.collaborators`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `add` | POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators` | Add a collaborator |
| `list` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators` | List collaborators |
| `remove` | DELETE | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}` | Remove a collaborator |
| `update` | PATCH | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}` | Update collaborator role |

### `client.notes.comments`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments` | Create a comment |
| `delete` | DELETE | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}` | Delete a comment |
| `edit` | PATCH | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}` | Edit a comment |
| `list` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments` | List comments |
| `listAnchors` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors` | List comment anchors |
| `reanchor` | POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/reanchor` | Re-anchor a comment thread |
| `resolve` | POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/resolve` | Resolve a comment |

### `client.notes.databases`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records` | Create a database record |
| `delete` | DELETE | `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` | Delete a database record |
| `get` | GET | `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` | Get a database record |
| `list` | GET | `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records` | List database records |
| `listAll` | GET | `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records` | List database records (collect all pages) |
| `listIterator` | GET | `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records` | List database records (async iterator) |
| `search` | GET | `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/search` | Search database records |
| `update` | PATCH | `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` | Update a database record |

### `client.notes.documents`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `appendDocument` | POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` | Append blocks to a document |
| `createExportTicket` | POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/export-ticket` | Create secure HTML export ticket |
| `exportBlockSvg` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/blocks/{blockId}/svg` | Export drawing block as SVG |
| `get` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` | Get document content |
| `patch` | PATCH | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` | Merge document content |
| `put` | PUT | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` | Create or replace document |

### `client.notes.files`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `download` | GET | `/api/v1/notes/notebooks/{notebookId}/files/{fileId}` | Download a file |
| `list` | GET | `/api/v1/notes/notebooks/{notebookId}/files` | List all uploaded files |
| `listAll` | GET | `/api/v1/notes/notebooks/{notebookId}/files` | List all uploaded files (collect all pages) |
| `listIterator` | GET | `/api/v1/notes/notebooks/{notebookId}/files` | List all uploaded files (async iterator) |
| `tusAbortUpload` | DELETE | `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | Abort a TUS upload |
| `tusCheckUpload` | HEAD | `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | Check a TUS upload's offset (for resuming) |
| `tusCreateUpload` | POST | `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | Create a resumable (TUS) upload |
| `tusUploadChunk` | PATCH | `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | Upload a chunk to a TUS upload |

### `client.notes.health`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `check` | GET | `/api/v1/notes/health` | Service health and runtime info |

### `client.notes.identity`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/notes/me` | Get current identity |

### `client.notes.interactions`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `markOpened` | POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/opened` | Mark node as opened |
| `markSeen` | POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/seen` | Mark node as seen |

### `client.notes.mutations`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `sync` | POST | `/api/v1/notes/notebooks/{notebookId}/mutations` | Sync client mutations |

### `client.notes.nodes`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/notes/notebooks/{notebookId}/nodes` | Create a node |
| `delete` | DELETE | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}` | Delete a node |
| `get` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}` | Get a node |
| `getByAlias` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/alias/{alias}` | Resolve page by alias |
| `list` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes` | List nodes |
| `listChildren` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/children` | List child nodes |
| `update` | PATCH | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}` | Update a node |

### `client.notes.notebooks`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/notes/notebooks` | Create a notebook |
| `delete` | DELETE | `/api/v1/notes/notebooks/{notebookId}` | Delete a notebook |
| `get` | GET | `/api/v1/notes/notebooks/{notebookId}` | Get notebook details |
| `listNotebooks` | GET | `/api/v1/notes/notebooks` | List notebooks |
| `update` | PATCH | `/api/v1/notes/notebooks/{notebookId}` | Update notebook settings |

### `client.notes.reactions`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `add` | POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions` | Add a reaction |
| `list` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions` | List reactions |
| `remove` | DELETE | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions/{reaction}` | Remove a reaction |

### `client.notes.sockets`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `init` | POST | `/api/v1/notes/sockets` | Initialize a WebSocket session |
| `open` | GET | `/api/v1/notes/sockets/{socketId}` | Open a WebSocket connection |

### `client.notes.users`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `invite` | POST | `/api/v1/notes/notebooks/{notebookId}/users` | Invite users to notebook |
| `updateRole` | PATCH | `/api/v1/notes/notebooks/{notebookId}/users/{userId}/role` | Update user role |

### `client.notes.versions`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions` | Create a document version snapshot |
| `delete` | DELETE | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}` | Delete a document version |
| `get` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}` | Get a specific document version |
| `list` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions` | List document versions |
| `restore` | POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}/restore` | Restore a document version |

## `notifications` (10 methods)

### `client.notifications.health`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `check` | GET | `/api/v1/notifications/health` | Service health check |
| `getMetrics` | GET | `/api/v1/notifications/metrics` | Prometheus-compatible metrics endpoint |

### `client.notifications.icons`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/notifications/icons/{iconId}` | Get notification icon |

### `client.notifications`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `clearDismissed` | DELETE | `/api/v1/notifications/dismiss` | Clear dismissed notifications |
| `connectStream` | GET | `/api/v1/notifications/stream` | Real-time notification stream via WebSocket |
| `dismiss` | POST | `/api/v1/notifications/dismiss` | Dismiss notifications |
| `list` | GET | `/api/v1/notifications/{display}` | Get notifications for specified display(s) |
| `listAll` | GET | `/api/v1/notifications/{display}` | Get notifications for specified display(s) (collect all pages) |
| `listIterator` | GET | `/api/v1/notifications/{display}` | Get notifications for specified display(s) (async iterator) |

### `client.notifications.notify`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `trigger` | POST | `/api/v1/notifications/notify` | Trigger a new desktop notification |

## `pipe` (7 methods)

### `client.pipe.health`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `check` | GET | `/api/v1/pipe/health` | Service health check |

### `client.pipe.info`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getHelp` | GET | `/api/v1/pipe/help` | Get help text with curl examples |

### `client.pipe`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `corsPreflight` | OPTIONS | `/api/v1/pipe/{path}` | CORS preflight |
| `receive` | GET | `/api/v1/pipe/{path}` | Receive data from a pipe |
| `send` | POST | `/api/v1/pipe/{path}` | Send data to a pipe |

### `client.pipe.ui`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getIndex` | GET | `/api/v1/pipe` | Index page (web UI) |
| `getNoScript` | GET | `/api/v1/pipe/noscript` | No-JavaScript upload page |

## `proxyLogs` (5 methods)

### `client.proxyLogs.logs`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getStats` | GET | `/_logs/stats` | Get log statistics |
| `list` | GET | `/_logs` | Query centralized logs |
| `listAll` | GET | `/_logs` | Query centralized logs (collect all pages) |
| `listIterator` | GET | `/_logs` | Query centralized logs (async iterator) |
| `streamLogs` | GET | `/_logs/stream` | Live-tail logs over Server-Sent Events (v8 SSE contract) |

## `sqlite` (33 methods)

### `client.sqlite.database`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/sqlite/db/create` | Create new SQLite database |
| `executeTransaction` | POST | `/api/v1/sqlite/db` | Execute SQL transaction |

### `client.sqlite.docs`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getJson` | GET | `/api/v1/sqlite/openapi.json` | Get OpenAPI specification (JSON redirect) |
| `getYaml` | GET | `/api/v1/sqlite/openapi.yaml` | Get OpenAPI specification (YAML) |

### `client.sqlite.health`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getHealth` | GET | `/api/v1/sqlite/health` | Health check |
| `getHealthCache` | GET | `/api/v1/sqlite/health/cache` | Cache health snapshot |

### `client.sqlite.history`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `clear` | DELETE | `/api/v1/sqlite/history` | Clear query history |
| `deleteEntry` | DELETE | `/api/v1/sqlite/history/{index}` | Delete history entry |
| `getStats` | GET | `/api/v1/sqlite/history/stats` | Get history statistics |
| `list` | GET | `/api/v1/sqlite/history` | Get query history |

### `client.sqlite.kvStore`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `batchDelete` | POST | `/api/v1/sqlite/kv/batch/delete` | Batch delete multiple keys |
| `batchGet` | POST | `/api/v1/sqlite/kv/batch/get` | Batch get multiple keys |
| `batchSet` | POST | `/api/v1/sqlite/kv/batch/set` | Batch set multiple keys |
| `compareSnapshots` | GET | `/api/v1/sqlite/kv/diff` | Compare table snapshots |
| `decr` | POST | `/api/v1/sqlite/kv/{key}/decr` | Atomic decrement |
| `delete` | DELETE | `/api/v1/sqlite/kv/{key}` | Delete key |
| `exists` | HEAD | `/api/v1/sqlite/kv/{key}` | Check if key exists |
| `get` | GET | `/api/v1/sqlite/kv/{key}` | Get value by key |
| `getHistory` | GET | `/api/v1/sqlite/kv/{key}/history` | Get key operation history |
| `getSnapshot` | GET | `/api/v1/sqlite/kv/{key}/snapshot` | Get key snapshot at operation |
| `getTableSnapshot` | GET | `/api/v1/sqlite/kv/snapshot` | Get table snapshot at timestamp |
| `incr` | POST | `/api/v1/sqlite/kv/{key}/incr` | Atomic increment |
| `list` | GET | `/api/v1/sqlite/kv` | List keys |
| `listAll` | GET | `/api/v1/sqlite/kv` | List keys (collect all pages) |
| `listIterator` | GET | `/api/v1/sqlite/kv` | List keys (async iterator) |
| `pop` | POST | `/api/v1/sqlite/kv/{key}/pop` | Remove from array end |
| `push` | POST | `/api/v1/sqlite/kv/{key}/push` | Append to array |
| `removeElement` | POST | `/api/v1/sqlite/kv/{key}/remove` | Remove array element |
| `rollback` | POST | `/api/v1/sqlite/kv/{key}/rollback` | Rollback key operations |
| `rollbackTable` | POST | `/api/v1/sqlite/kv/rollback` | Rollback entire table |
| `set` | PUT | `/api/v1/sqlite/kv/{key}` | Set value for key |

### `client.sqlite.query`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `executeShareable` | GET | `/api/v1/sqlite/query` | Execute shareable SQL query |

### `client.sqlite.sql`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `runMaintenance` | POST | `/api/v1/sqlite/maintenance` | Run a database maintenance operation |

## `terminal` (48 methods)

### `client.terminal.docs`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getJson` | GET | `/api/v1/terminal/openapi.json` | Get OpenAPI specification in JSON format |
| `getYaml` | GET | `/api/v1/terminal/openapi.yaml` | Get OpenAPI specification in YAML format |

### `client.terminal.execution`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `execute` | POST | `/api/v1/terminal/execute` | Execute command in terminal session |
| `getResult` | GET | `/api/v1/terminal/result/{command_id}` | Get command result |

### `client.terminal.health`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `check` | GET | `/api/v1/terminal/health` | Service health check |

### `client.terminal.sessions`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `captureScreenshot` | GET | `/api/v1/terminal/screenshot` | Capture terminal screenshot |
| `connectWebSocket` | GET | `/api/v1/terminal/ws` | WebSocket terminal connection |
| `create` | POST | `/api/v1/terminal/create` | Create a terminal session |
| `delete` | DELETE | `/api/v1/terminal/{terminal_id}` | Delete a terminal session |
| `getRawOutput` | GET | `/api/v1/terminal/raw` | Get raw terminal output |
| `list` | GET | `/api/v1/terminal/sessions` | List all terminal sessions |
| `listAll` | GET | `/api/v1/terminal/sessions` | List all terminal sessions (collect all pages) |
| `listHistory` | GET | `/api/v1/terminal/history/{terminal_id}` | Get terminal command history |
| `listHistoryAll` | GET | `/api/v1/terminal/history/{terminal_id}` | Get terminal command history (collect all pages) |
| `listHistoryIterator` | GET | `/api/v1/terminal/history/{terminal_id}` | Get terminal command history (async iterator) |
| `listIterator` | GET | `/api/v1/terminal/sessions` | List all terminal sessions (async iterator) |

### `client.terminal.system`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `freezeProcess` | POST | `/api/v1/system/processes/freeze` | Freeze (SIGSTOP) a process or process tree |
| `getDaemonConfig` | GET | `/api/v1/system/daemon` | Get daemon programs configuration |
| `getDisplayInfo` | GET | `/api/v1/system/displays` | Get display information |
| `getProcess` | GET | `/api/v1/system/processes/{pid}` | Get process details by PID |
| `getResources` | GET | `/api/v1/system/resources` | Get system resources and statistics |
| `listPorts` | GET | `/api/v1/system/ports` | List all listening network ports |
| `listPortsAll` | GET | `/api/v1/system/ports` | List all listening network ports (collect all pages) |
| `listPortsIterator` | GET | `/api/v1/system/ports` | List all listening network ports (async iterator) |
| `listProcesses` | GET | `/api/v1/system/processes` | List all system processes |
| `listProcessesAll` | GET | `/api/v1/system/processes` | List all system processes (collect all pages) |
| `listProcessesIterator` | GET | `/api/v1/system/processes` | List all system processes (async iterator) |
| `reboot` | POST | `/api/v1/system/reboot` | Reboot the system |
| `sendSignal` | POST | `/api/v1/system/process/signal` | Send signal to process(es) |
| `shutdown` | POST | `/api/v1/system/shutdown` | Shutdown the system |
| `unfreezeProcess` | POST | `/api/v1/system/processes/unfreeze` | Unfreeze (SIGCONT) a process or process tree |

### `client.terminal`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `abort` | POST | `/api/v1/terminal/execute/{command_id}/abort` | Abort a running command |
| `write` | POST | `/api/v1/terminal/write` | Write input to terminal |

### `client.terminal.terminalAutomation`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `findInTerminal` | GET | `/api/v1/terminal/find` | Search terminal screen with regex |
| `getAutomationMetrics` | GET | `/api/v1/terminal/automation/metrics` | Get terminal automation metrics |
| `getSessionAutomationState` | GET | `/api/v1/terminal/{terminal_id}/automation` | Get per-session automation state |
| `getTerminalSnapshot` | GET | `/api/v1/terminal/snapshot` | Get rendered terminal snapshot |
| `listSupportedKeys` | GET | `/api/v1/terminal/keys` | List supported key names for /press endpoint |
| `pasteTerminalText` | POST | `/api/v1/terminal/paste` | Paste text into terminal |
| `pressTerminalKeys` | POST | `/api/v1/terminal/press` | Send named key presses to terminal |
| `sendTerminalMouseEvents` | POST | `/api/v1/terminal/mouse` | Send cell-based mouse events to terminal |
| `waitForTerminal` | POST | `/api/v1/terminal/wait` | Wait for terminal condition |

### `client.terminal.terminalDragAndDrop`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `beginTerminalDrop` | POST | `/api/v1/terminal/drop-begin` | Begin a drag-and-drop staging transaction |
| `commitTerminalDrop` | POST | `/api/v1/terminal/drop-commit` | Finalize a drop and inject the OSC frame |
| `oneShotTerminalDrop` | POST | `/api/v1/terminal/drop` | One-shot drop (begin + stage + commit) |
| `uploadTerminalDropSlice` | POST | `/api/v1/terminal/upload` | Upload a raw file slice into a drop |

### `client.terminal.terminalState`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `postTerminalState` | POST | `/api/v1/terminal/state` | Client render/connection diagnostics beacon |

### `client.terminal.web`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/` | Get web terminal interface |

## `tunnel` (7 methods)

### `client.tunnel.health`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `check` | GET | `/api/v1/tunnel/health` | Kit health |

### `client.tunnel`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getMetrics` | GET | `/api/v1/tunnel/metrics` | Prometheus metrics |
| `killSession` | DELETE | `/api/v1/tunnel/sessions/{session_id}` | Terminate an active tunnel session |
| `listBindings` | GET | `/api/v1/tunnel/bindings` | List active bindings across all sessions |
| `listSessions` | GET | `/api/v1/tunnel/sessions` | List active tunnel sessions |
| `listTunnels` | GET | `/api/v1/tunnel/tunnels` | List all active tunnels (combined sessions + bindings) |
| `tunnelConnect` | GET | `/api/v1/tunnel/connect` | Tunnel WebSocket control plane |

## `watch` (14 methods)

### `client.watch.health`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `check` | GET | `/api/v1/watch/health` | Health Check |

### `client.watch.streams`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `listEvents` | GET | `/watchers/{id}/events` | List Watcher Events |
| `listEventsAll` | GET | `/watchers/{id}/events` | List Watcher Events (collect all pages) |
| `listEventsIterator` | GET | `/watchers/{id}/events` | List Watcher Events (async iterator) |
| `streamSse` | GET | `/watchers/{id}/events/sse` | Stream Watcher Events Sse |
| `streamWs` | GET | `/watchers/{id}/events/ws` | Stream Watcher Events Ws |

### `client.watch.system`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getOpenApiJson` | GET | `/openapi.json` | Get Open Api Json |
| `getOpenApiYaml` | GET | `/openapi.yaml` | Get Open Api Yaml |

### `client.watch.watchers`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/watchers` | Create Watcher |
| `delete` | DELETE | `/watchers/{id}` | Delete Watcher |
| `get` | GET | `/watchers/{id}` | Get Watcher |
| `list` | GET | `/watchers` | List Watchers |
| `listAll` | GET | `/watchers` | List Watchers (collect all pages) |
| `listIterator` | GET | `/watchers` | List Watchers (async iterator) |

## Hand-written client helpers

These methods live on `HoodyClient` directly (not under a namespace).
They exist because they wrap auth flows, build kit URLs, or expose
static catalog data that has no OpenAPI operation.

| Method | Kind | Summary |
|--------|------|---------|
| `HoodyClient.authenticate(baseURL, credentials)` | static | Login helper: logs in with credentials and returns an authenticated HoodyClient. Does not complete a 2FA challenge — use `client.api.tfa.verify()` when one is returned. |
| `HoodyClient.getKitCatalog(options?)` | static | Static catalog of all Hoody kit services (terminal, files, code, …) with metadata. |
| `HoodyClient.getDesktopEnvironments()` | static | List of known desktop environment identifiers acceptable to getDesktopUrl(). |
| `client.getKitCatalog(options?)` | instance | Instance form of HoodyClient.getKitCatalog — convenience accessor. |
| `client.getDesktopEnvironments()` | instance | Instance form of HoodyClient.getDesktopEnvironments. |
| `client.getDesktopUrl(container, options?)` | instance | Build a desktop-{N} URL for a container; the public alias 302s to display once X is ready. |
| `client.withContainer(containerOrId, options?)` | instance | Scope a client to a specific container (applies templateVars + kit routing). |
| `client.withRealm(realmId?)` | instance | Scope a client to a specific realm subdomain. |


---

*Auto-generated by `generate-reference.ts`. Do not edit manually.*
