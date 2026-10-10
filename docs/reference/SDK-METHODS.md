# Hoody SDK — Complete Method Reference

**Version:** 1.0.0-beta.17
**Total methods:** 1212
**Namespaces:** 21

---

## `agent` (326 methods)

### `client.agent.acp`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `disable` | PUT | `/api/v1/agent/acp/agents/{agent}/enabled` | Enable or disable a BYOA ACP backend. |
| `enable` | PUT | `/api/v1/agent/acp/agents/{agent}/enabled` | Enable or disable a BYOA ACP backend. |
| `getStatus` | GET | `/api/v1/agent/acp/agents` | Get BYOA ACP backend status. |
| `setModel` | PUT | `/api/v1/agent/acp/agents/{agent}/model` | Set a BYOA backend's default model and effort. |
| `setSecret` | PUT | `/api/v1/agent/acp/agents/{agent}/secrets/{key}` | Store an ACP per-agent secret value. |

### `client.agent`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `signIn` | POST | `/api/v1/agent/hoody/auth/bootstrap` | Sign this container's agent in to the Hoody platform with a token of the box's owner. Until then the agent's shell and file tools answer "not logged in". |
| `stopAllWork` | POST | `/api/v1/agent/stop` | Stop everything running in the realm. |
| `whoami` | GET | `/api/v1/agent/hoody/auth/status` | Hoody platform identity and realm scope. |

### `client.agent.bots`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/agent/bots` | Create a Bot. |
| `delete` | DELETE | `/api/v1/agent/bots/{id}` | Delete a Bot. |
| `forget` | POST | `/api/v1/agent/bots/{id}/forget` | Make a Bot forget its conversation. |
| `get` | GET | `/api/v1/agent/bots/{id}` | Get a Bot. |
| `getArchive` | GET | `/api/v1/agent/bots/{id}/archive` | Read a Bot's archive. |
| `getArchiveAll` | GET | `/api/v1/agent/bots/{id}/archive` | Read a Bot's archive. (collect all pages) |
| `getArchiveIterator` | GET | `/api/v1/agent/bots/{id}/archive` | Read a Bot's archive. (async iterator) |
| `getLog` | GET | `/api/v1/agent/bots/{id}/log` | Read a Bot's log. |
| `getLogAll` | GET | `/api/v1/agent/bots/{id}/log` | Read a Bot's log. (collect all pages) |
| `getLogIterator` | GET | `/api/v1/agent/bots/{id}/log` | Read a Bot's log. (async iterator) |
| `list` | GET | `/api/v1/agent/bots` | List the Bots. |
| `listAll` | GET | `/api/v1/agent/bots` | List the Bots. (collect all pages) |
| `listDelegates` | GET | `/api/v1/agent/bots/{id}/delegates` | List a Bot's delegates. |
| `listDelegatesAll` | GET | `/api/v1/agent/bots/{id}/delegates` | List a Bot's delegates. (collect all pages) |
| `listDelegatesIterator` | GET | `/api/v1/agent/bots/{id}/delegates` | List a Bot's delegates. (async iterator) |
| `listIterator` | GET | `/api/v1/agent/bots` | List the Bots. (async iterator) |
| `purgeArchive` | POST | `/api/v1/agent/bots/{id}/purge` | Delete a Bot's archive. |
| `reset` | POST | `/api/v1/agent/bots/{id}/reset` | Give a Bot a new session. |
| `sendMessage` | POST | `/api/v1/agent/bots/{id}/messages` | Post a message to a Bot. |
| `setGuardrails` | PUT | `/api/v1/agent/bots/{id}/guardrails` | Replace a Bot's guardrails. |
| `stopDelegate` | POST | `/api/v1/agent/bots/{id}/delegates/{sid}/stop` | Stop one of a Bot's delegates now. |
| `stream` | GET | `/api/v1/agent/bots/{id}/stream` | Follow a Bot's log (SSE). |
| `update` | PATCH | `/api/v1/agent/bots/{id}` | Change a Bot's settings. |

### `client.agent.changes`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/agent/changes` | Change tokens for the Work lists. |
| `stream` | GET | `/api/v1/agent/changes/stream` | Stream the change tokens (SSE). |

### `client.agent.completions`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/agent/completions` | Run one tool-free model completion. |

### `client.agent.containers`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `list` | GET | `/api/v1/agent/containers` | List containers in a realm (for binding). |
| `listAll` | GET | `/api/v1/agent/containers` | List containers in a realm (for binding). (collect all pages) |
| `listIterator` | GET | `/api/v1/agent/containers` | List containers in a realm (for binding). (async iterator) |

### `client.agent.definitions`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `copy` | POST | `/api/v1/agent/agents/{name}/copy` | Copy a chat agent. |
| `create` | POST | `/api/v1/agent/agents` | Create a chat-agent definition. |
| `delete` | DELETE | `/api/v1/agent/agents/{name}` | Delete a custom chat agent. |
| `getSource` | GET | `/api/v1/agent/agents/{name}/source` | Read a chat agent's source. |
| `list` | GET | `/api/v1/agent/agents` | List chat-agent definitions. |
| `listAll` | GET | `/api/v1/agent/agents` | List chat-agent definitions. (collect all pages) |
| `listIterator` | GET | `/api/v1/agent/agents` | List chat-agent definitions. (async iterator) |
| `rename` | POST | `/api/v1/agent/agents/{name}/rename` | Rename a chat agent. |
| `reset` | POST | `/api/v1/agent/agents/{name}/reset-to-shipped` | Reset an agent to its shipped default. |
| `setModel` | PATCH | `/api/v1/agent/agents/{name}/model` | Set an agent's model. |
| `setSource` | PUT | `/api/v1/agent/agents/{name}/source` | Write a chat agent's source. |
| `setTools` | PATCH | `/api/v1/agent/agents/{name}/tools` | Set an agent's tool allow-list. |
| `setTurnLimit` | PATCH | `/api/v1/agent/agents/{name}/turns` | Set an agent's max-turns. |
| `toggleTool` | POST | `/api/v1/agent/agents/{name}/tools/{tool}/toggle` | Toggle a single tool for an agent. |

### `client.agent.files`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `list` | GET | `/api/v1/agent/agent-files` | List the files that shape the agents. |
| `listAll` | GET | `/api/v1/agent/agent-files` | List the files that shape the agents. (collect all pages) |
| `listIterator` | GET | `/api/v1/agent/agent-files` | List the files that shape the agents. (async iterator) |

### `client.agent.fusions`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `delete` | DELETE | `/api/v1/agent/settings/fusion/{slug}` | Delete a fusion composite. |
| `list` | GET | `/api/v1/agent/settings/fusion` | List fusion composites. |
| `listAll` | GET | `/api/v1/agent/settings/fusion` | List fusion composites. (collect all pages) |
| `listIterator` | GET | `/api/v1/agent/settings/fusion` | List fusion composites. (async iterator) |
| `set` | PUT | `/api/v1/agent/settings/fusion/{slug}` | Create or update a fusion composite. |

### `client.agent.gates`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `answer` | POST | `/api/v1/agent/sessions/{id}/answer` | Answer a parked question gate. |
| `approve` | POST | `/api/v1/agent/sessions/{id}/confirm` | Answer a parked confirm gate (on an always-approval session also --gate-id, --generation and the approver lease). |
| `deny` | POST | `/api/v1/agent/sessions/{id}/confirm` | Answer a parked confirm gate (on an always-approval session also --gate-id, --generation and the approver lease). |
| `list` | GET | `/api/v1/agent/gates` | List the gates waiting for a human. |
| `listAll` | GET | `/api/v1/agent/gates` | List the gates waiting for a human. (collect all pages) |
| `listIterator` | GET | `/api/v1/agent/gates` | List the gates waiting for a human. (async iterator) |
| `suggest` | POST | `/api/v1/agent/sessions/{id}/answer:assist` | Propose answers for a parked question (helper model). |

### `client.agent.github`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `checkoutPr` | POST | `/api/v1/agent/github/pr/checkout` | Check out a pull request. |
| `clone` | POST | `/api/v1/agent/github/clone` | Clone a GitHub repository. |
| `createBranch` | POST | `/api/v1/agent/github/branch` | Create a branch. |
| `createCommit` | POST | `/api/v1/agent/github/commit` | Stage all and commit. |
| `createIssue` | POST | `/api/v1/agent/github/issues` | Open an issue. |
| `createPr` | POST | `/api/v1/agent/github/pr` | Open a pull request. |
| `createWorktree` | POST | `/api/v1/agent/github/worktrees` | Add a linked worktree. |
| `deleteBranch` | POST | `/api/v1/agent/github/branch/delete` | Force-delete a local branch. |
| `deleteWorktree` | POST | `/api/v1/agent/github/worktrees/remove` | Remove a linked worktree. |
| `diff` | GET | `/api/v1/agent/github/diff` | Read the working-tree diff. |
| `getAuth` | GET | `/api/v1/agent/github/auth/status` | GitHub auth status. |
| `getStatus` | GET | `/api/v1/agent/github/status` | GitHub working-tree status. |
| `listBranches` | GET | `/api/v1/agent/github/branches` | List GitHub branches. |
| `listCommits` | GET | `/api/v1/agent/github/log` | Read recent commit history. |
| `listIssues` | GET | `/api/v1/agent/github/issues` | List issues. |
| `listPrs` | GET | `/api/v1/agent/github/pr` | List pull requests. |
| `listRepos` | GET | `/api/v1/agent/github/repos` | List GitHub repos. |
| `listWorktrees` | GET | `/api/v1/agent/github/worktrees` | List linked worktrees. |
| `login` | POST | `/api/v1/agent/github/auth/login` | Start a GitHub device-flow login (or add a PAT). |
| `logout` | POST | `/api/v1/agent/github/auth/logout` | Remove a linked GitHub account. |
| `mergePr` | POST | `/api/v1/agent/github/pr/merge` | Merge a pull request. |
| `pollLogin` | POST | `/api/v1/agent/github/auth/login/poll` | Poll a GitHub device-flow login to completion. |
| `popStash` | POST | `/api/v1/agent/github/stash/pop` | Restore the most recent stash entry. |
| `pushStash` | POST | `/api/v1/agent/github/stash` | Stash the working tree. |
| `resolveRepo` | GET | `/api/v1/agent/github/identity` | Resolve the bound repository's owner/name. |
| `setRepoCredentials` | POST | `/api/v1/agent/github/repo/reconnect` | Re-write a checkout's GitHub credential. |
| `suggestCommitMessage` | POST | `/api/v1/agent/github/commit/suggest-message` | Draft a commit message with a model. |
| `sync` | POST | `/api/v1/agent/github/sync` | Sync (fetch → pull → push). |
| `useAccount` | POST | `/api/v1/agent/github/auth/active` | Switch the active GitHub account. |
| `useBranch` | POST | `/api/v1/agent/github/branch/switch` | Switch to an existing branch. |

### `client.agent.headless`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `start` | POST | `/api/v1/agent/headless/runs` | Create a headless one-shot run. |
| `stream` | POST | `/api/v1/agent/headless/runs` | Create a headless one-shot run. |

### `client.agent.hooks`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `createWriteIntent` | POST | `/api/v1/agent/hooks/begin-write` | Begin a hook write (nonce). |
| `delete` | DELETE | `/api/v1/agent/hooks` | Delete a hook. |
| `disable` | POST | `/api/v1/agent/hooks/toggle` | Toggle a hook. |
| `disableAll` | POST | `/api/v1/agent/hooks/disable-all` | Disable all hooks. |
| `enable` | POST | `/api/v1/agent/hooks/toggle` | Toggle a hook. |
| `enableAll` | POST | `/api/v1/agent/hooks/disable-all` | Disable all hooks. |
| `getRules` | GET | `/api/v1/agent/hooks/rules` | Get the tool-call rules. |
| `list` | GET | `/api/v1/agent/hooks` | List hooks. |
| `reload` | POST | `/api/v1/agent/hooks/reload` | Reload hooks from disk. |
| `run` | POST | `/api/v1/agent/hooks/test` | Test-fire a hook. |
| `setRules` | POST | `/api/v1/agent/hooks/rules` | Set the tool-call rules. |
| `test` | POST | `/api/v1/agent/hooks/test` | Test-fire a hook. |
| `trust` | POST | `/api/v1/agent/hooks/trust/ack` | Acknowledge hook trust. |
| `upsert` | PUT | `/api/v1/agent/hooks` | Upsert a hook. |

### `client.agent.jev`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `decide` | POST | `/api/v1/agent/jev/decide` | Ask Jev to decide. |
| `decideForSession` | POST | `/api/v1/agent/sessions/{id}/jev/decide` | Ask Jev to decide on behalf of a session. |
| `getSettings` | GET | `/api/v1/agent/jev/settings` | Read the Jev settings. |
| `listModels` | GET | `/api/v1/agent/jev/models` | List the models Jev can use. |
| `test` | POST | `/api/v1/agent/jev/test` | Test Jev with one tiny decision. |
| `updateSettings` | PUT | `/api/v1/agent/jev/settings` | Change the Jev settings. |

### `client.agent.jobs`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `delete` | DELETE | `/api/v1/agent/jobs/{id}` | Cancel a pending/running job, or delete a finished record. |
| `get` | GET | `/api/v1/agent/jobs/{id}` | Get an async job's status. |
| `getResult` | GET | `/api/v1/agent/jobs/{id}/result` | Get an async job's result. |

### `client.agent.kit`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getHealth` | GET | `/api/v1/agent/health` | Standardized health check. |
| `getMetrics` | GET | `/api/v1/agent/metrics` | Prometheus metrics. |
| `getVersion` | GET | `/api/v1/agent/version` | Agent API version and capabilities. |

### `client.agent.logs`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `export` | GET | `/api/v1/agent/logs/export` | Export logs as a downloadable file. |
| `get` | GET | `/api/v1/agent/logs/entries/{ref}` | Read a log entry. |
| `getStats` | GET | `/api/v1/agent/logs/stats` | Log statistics. |
| `list` | GET | `/api/v1/agent/logs` | Query logs. |
| `listSources` | GET | `/api/v1/agent/logs/sources` | Log sources. |
| `stream` | GET | `/api/v1/agent/logs/stream` | Stream the log tail (SSE). |

### `client.agent.loops`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/agent/sessions/{id}/loops` | Create a loop. |
| `delete` | DELETE | `/api/v1/agent/sessions/{id}/loops/{loopId}` | Delete a loop. |
| `list` | GET | `/api/v1/agent/loops` | List loops across all sessions. |
| `listAll` | GET | `/api/v1/agent/loops` | List loops across all sessions. (collect all pages) |
| `listIterator` | GET | `/api/v1/agent/loops` | List loops across all sessions. (async iterator) |
| `startRun` | POST | `/api/v1/agent/sessions/{id}/loops/{loopId}/run-now` | Run a loop immediately. |
| `update` | PATCH | `/api/v1/agent/sessions/{id}/loops/{loopId}` | Update a loop. |

### `client.agent.mcp`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `createWriteIntent` | POST | `/api/v1/agent/mcp/write-intents` | Begin an MCP config write. |
| `deleteServer` | DELETE | `/api/v1/agent/mcp/servers` | Delete an MCP server. |
| `disableServer` | POST | `/api/v1/agent/mcp/servers/enable` | Enable or disable an MCP server. |
| `enableServer` | POST | `/api/v1/agent/mcp/servers/enable` | Enable or disable an MCP server. |
| `importServers` | POST | `/api/v1/agent/mcp/import` | Import MCP servers from another tool's config. |
| `listServers` | GET | `/api/v1/agent/mcp/servers` | List configured MCP servers. |
| `previewImport` | POST | `/api/v1/agent/mcp/parse` | Preview an MCP config import. |
| `reconnect` | POST | `/api/v1/agent/mcp/reconnect` | Reload MCP config and reconnect. |
| `testServer` | POST | `/api/v1/agent/mcp/probe` | Probe an MCP server without saving it. |
| `upsertServer` | PUT | `/api/v1/agent/mcp/servers` | Create or update an MCP server. |

### `client.agent.memory`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `claimDataHost` | PUT | `/api/v1/agent/memory/datahost` | Assign this computer as the memory data host. |
| `consolidate` | POST | `/api/v1/agent/memory/consolidate` | Trigger a memory consolidation pass (human-only). |
| `createItem` | POST | `/api/v1/agent/memory/items` | Save a memory item. |
| `createWriteIntent` | POST | `/api/v1/agent/memory/write-intents` | Begin a guarded memory write (intent). |
| `deleteItem` | DELETE | `/api/v1/agent/memory/items` | Delete a memory item. |
| `deleteProject` | DELETE | `/api/v1/agent/memory/projects/{project}` | Erase a memory project. |
| `disable` | PUT | `/api/v1/agent/memory/enabled` | Toggle memory capture. |
| `enable` | PUT | `/api/v1/agent/memory/enabled` | Toggle memory capture. |
| `flush` | POST | `/api/v1/agent/memory/flush` | Flush the memory store. |
| `getDataHost` | GET | `/api/v1/agent/memory/datahost` | Read the realm's memory data host. |
| `getGraph` | GET | `/api/v1/agent/memory/graph` | Read a project's memory relation graph. |
| `getItem` | GET | `/api/v1/agent/memory/items/{id}` | Read a memory item. |
| `getStatus` | GET | `/api/v1/agent/memory/status` | Read memory subsystem status. |
| `listItems` | GET | `/api/v1/agent/memory/items` | List memory items. |
| `listItemsAll` | GET | `/api/v1/agent/memory/items` | List memory items. (collect all pages) |
| `listItemsIterator` | GET | `/api/v1/agent/memory/items` | List memory items. (async iterator) |
| `listProjects` | GET | `/api/v1/agent/memory/projects` | List memory projects. |
| `listProjectsAll` | GET | `/api/v1/agent/memory/projects` | List memory projects. (collect all pages) |
| `listProjectsIterator` | GET | `/api/v1/agent/memory/projects` | List memory projects. (async iterator) |
| `search` | POST | `/api/v1/agent/memory/search` | Search memory (hybrid recall). |
| `updateItem` | PATCH | `/api/v1/agent/memory/items/{id}` | Edit a memory item. |

### `client.agent.models`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/agent/models/{spec}` | Get a model by spec. |
| `list` | GET | `/api/v1/agent/models` | List models. |
| `listAll` | GET | `/api/v1/agent/models` | List models. (collect all pages) |
| `listIterator` | GET | `/api/v1/agent/models` | List models. (async iterator) |

### `client.agent.platform`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `bootstrapToken` | POST | `/api/v1/agent/hoody/auth/bootstrap` | Bootstrap the Hoody platform credential (install-if-absent). |

### `client.agent.providers`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `addAccount` | POST | `/api/v1/agent/providers/{id}/auth/accounts` | Add an OAuth account to a provider's pool. |
| `create` | POST | `/api/v1/agent/providers` | Create a custom provider. |
| `delete` | DELETE | `/api/v1/agent/providers/{id}` | Delete a custom provider. |
| `deleteApiKey` | DELETE | `/api/v1/agent/providers/{id}/auth/api-key` | Delete a provider API key. |
| `get` | GET | `/api/v1/agent/providers/{id}` | Get a provider. |
| `getAuth` | GET | `/api/v1/agent/providers/{id}/auth` | Get a provider's auth status. |
| `list` | GET | `/api/v1/agent/providers` | List LLM providers. |
| `listAccounts` | GET | `/api/v1/agent/providers/{id}/auth/accounts` | List a provider's OAuth account pool. |
| `listAccountsAll` | GET | `/api/v1/agent/providers/{id}/auth/accounts` | List a provider's OAuth account pool. (collect all pages) |
| `listAccountsIterator` | GET | `/api/v1/agent/providers/{id}/auth/accounts` | List a provider's OAuth account pool. (async iterator) |
| `listAll` | GET | `/api/v1/agent/providers` | List LLM providers. (collect all pages) |
| `listIterator` | GET | `/api/v1/agent/providers` | List LLM providers. (async iterator) |
| `logoutOauth` | DELETE | `/api/v1/agent/providers/{id}/auth/oauth` | Remove a provider's OAuth login. |
| `pollOauth` | GET | `/api/v1/agent/providers/{id}/auth/oauth/{job}` | Poll a provider OAuth login. |
| `removeAccount` | DELETE | `/api/v1/agent/providers/{id}/auth/accounts/{key}` | Remove a pooled OAuth account. |
| `setApiKey` | PUT | `/api/v1/agent/providers/{id}/auth/api-key` | Store a provider API key. |
| `setDefaultAuth` | PUT | `/api/v1/agent/providers/{id}/auth/default` | Set a provider's default credential method. |
| `startOauth` | POST | `/api/v1/agent/providers/{id}/auth/oauth` | Start a provider OAuth login. |
| `submitOauthCode` | POST | `/api/v1/agent/providers/{id}/auth/oauth/{job}/code` | Submit a provider OAuth authorization code. |
| `update` | PATCH | `/api/v1/agent/providers/{id}` | Change a custom provider. |
| `useAccount` | PUT | `/api/v1/agent/providers/{id}/auth/accounts/{key}/active` | Make a pooled OAuth account active. |

### `client.agent.realms`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `list` | GET | `/api/v1/agent/realms` | List realms (for binding). |
| `listAll` | GET | `/api/v1/agent/realms` | List realms (for binding). (collect all pages) |
| `listIterator` | GET | `/api/v1/agent/realms` | List realms (for binding). (async iterator) |
| `use` | PUT | `/api/v1/agent/hoody/realm` | Switch the agent's active realm. |

### `client.agent.sessions`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `cancelTasks` | POST | `/api/v1/agent/sessions/{id}/tasks/cancel` | Cancel all background tasks. |
| `claimApproverLease` | POST | `/api/v1/agent/sessions/{id}/approver-lease` | Acquire the right to answer this session's gates. |
| `claimAttachment` | POST | `/api/v1/agent/sessions/{id}/attachments` | Hold a live session (and its parked gate) alive. |
| `close` | POST | `/api/v1/agent/sessions/{id}/close` | Close the session (teardown). |
| `connect` | GET | `/api/v1/agent/sessions/{id}/stream` | Attach to a session's event stream (WebSocket / SSE). |
| `create` | POST | `/api/v1/agent/sessions` | Create, fork, or attach a session. |
| `delete` | DELETE | `/api/v1/agent/sessions/{id}` | Close (and optionally hard-delete) a session. |
| `deleteApprovalRule` | DELETE | `/api/v1/agent/sessions/{id}/approval/rules/{tool}` | Remove one session permission rule. |
| `get` | GET | `/api/v1/agent/sessions/{id}` | Get a session summary. |
| `getApproval` | GET | `/api/v1/agent/sessions/{id}/approval` | Read a session's approval policy. |
| `getSnapshot` | GET | `/api/v1/agent/sessions/{id}/state` | Read a session's recoverable state. |
| `getTranscript` | GET | `/api/v1/agent/sessions/{id}/transcript` | Read a session's transcript without attaching. |
| `getUsage` | GET | `/api/v1/agent/sessions/{id}/usage` | Read a session's per-call LLM usage. |
| `getUsageAll` | GET | `/api/v1/agent/sessions/{id}/usage` | Read a session's per-call LLM usage. (collect all pages) |
| `getUsageIterator` | GET | `/api/v1/agent/sessions/{id}/usage` | Read a session's per-call LLM usage. (async iterator) |
| `list` | GET | `/api/v1/agent/sessions` | List sessions. |
| `listAll` | GET | `/api/v1/agent/sessions` | List sessions. (collect all pages) |
| `listApplicableRules` | GET | `/api/v1/agent/sessions/{id}/rules/applies` | Which tool-call rules apply. |
| `listDirectories` | GET | `/api/v1/agent/sessions/cwds` | List distinct session working directories. |
| `listIterator` | GET | `/api/v1/agent/sessions` | List sessions. (async iterator) |
| `listLoops` | GET | `/api/v1/agent/sessions/{id}/loops` | List a session's loops. |
| `listLoopsAll` | GET | `/api/v1/agent/sessions/{id}/loops` | List a session's loops. (collect all pages) |
| `listLoopsIterator` | GET | `/api/v1/agent/sessions/{id}/loops` | List a session's loops. (async iterator) |
| `listMcpTools` | GET | `/api/v1/agent/sessions/{id}/tools/mcp` | List a session's MCP tools. |
| `listMcpToolsAll` | GET | `/api/v1/agent/sessions/{id}/tools/mcp` | List a session's MCP tools. (collect all pages) |
| `listMcpToolsIterator` | GET | `/api/v1/agent/sessions/{id}/tools/mcp` | List a session's MCP tools. (async iterator) |
| `listTools` | GET | `/api/v1/agent/sessions/{id}/tools` | List a session's effective tool set. |
| `listToolsAll` | GET | `/api/v1/agent/sessions/{id}/tools` | List a session's effective tool set. (collect all pages) |
| `listToolsIterator` | GET | `/api/v1/agent/sessions/{id}/tools` | List a session's effective tool set. (async iterator) |
| `releaseApproverLease` | DELETE | `/api/v1/agent/sessions/{id}/approver-lease` | Release the approver lease. |
| `releaseAttachment` | DELETE | `/api/v1/agent/sessions/{id}/attachments/{lease_id}` | Release an attachment lease. |
| `rename` | PATCH | `/api/v1/agent/sessions/{id}` | Rename a session. |
| `renewApproverLease` | PATCH | `/api/v1/agent/sessions/{id}/approver-lease` | Renew the approver lease. |
| `renewAttachment` | PATCH | `/api/v1/agent/sessions/{id}/attachments/{lease_id}` | Renew an attachment lease. |
| `replay` | GET | `/api/v1/agent/sessions/{id}/replay` | Replay a live session's buffered events. |
| `runTool` | POST | `/api/v1/agent/sessions/{id}/tools/{name}/run` | Run a tool inside a live session (gated). |
| `setAfterCompaction` | PUT | `/api/v1/agent/sessions/{id}/after-compaction` | Set the message re-added after every compaction. |
| `setAgent` | PATCH | `/api/v1/agent/sessions/{id}/agent` | Switch the chat agent. |
| `setApprovalRule` | PUT | `/api/v1/agent/sessions/{id}/approval/rules/{tool}` | Set one session permission rule. |
| `setAutoReply` | PATCH | `/api/v1/agent/sessions/{id}/auto-reply` | Arm/disarm the auto-reply loop. |
| `setAutoReplyWrites` | PATCH | `/api/v1/agent/sessions/{id}/auto-reply/writes` | Flip the auto-reply write opt-in. |
| `setEffort` | PATCH | `/api/v1/agent/sessions/{id}/effort` | Set reasoning effort. |
| `setHoodyEnv` | PATCH | `/api/v1/agent/sessions/{id}/hoody-env` | Toggle Hoody shell-env injection. |
| `setModel` | PATCH | `/api/v1/agent/sessions/{id}/model` | Switch the session model. |
| `setVerbosity` | PATCH | `/api/v1/agent/sessions/{id}/verbosity` | Set response verbosity. |
| `setYolo` | PATCH | `/api/v1/agent/sessions/{id}/yolo` | Arm or disarm YOLO auto-approve. |
| `startTurn` | POST | `/api/v1/agent/sessions/{id}/messages` | Dispatch a turn (fire-and-observe). |
| `startTurnAndStream` | POST | `/api/v1/agent/sessions/{id}/prompt:stream` | Dispatch a turn and stream the response. |
| `startWorkflow` | POST | `/api/v1/agent/sessions/{id}/workflows/{name}/runs` | Run a workflow onto an existing session. |
| `trim` | POST | `/api/v1/agent/sessions/{id}/trim` | Trim session history to a turn index. |
| `updateApproval` | PUT | `/api/v1/agent/sessions/{id}/approval` | Set a session's approval mode and lock. |

### `client.agent.sessions.commands`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/agent/sessions/{id}/commands/{command_id}` | Get a command's receipt. |
| `send` | POST | `/api/v1/agent/sessions/{id}/commands` | Send a message, an interrupt or a stop to a session. |

### `client.agent.sessions.turns`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `cancel` | POST | `/api/v1/agent/sessions/{id}/cancel` | Cancel the active turn (Esc), or one named turn. |
| `create` | POST | `/api/v1/agent/sessions/{id}/turns` | Dispatch a turn (retry-safe). |
| `get` | GET | `/api/v1/agent/sessions/{id}/turns/{turn_id}` | Get a turn's durable receipt. |
| `list` | GET | `/api/v1/agent/sessions/{id}/turns` | List a session's durable turn receipts. |
| `run` | POST | `/api/v1/agent/sessions/{id}/prompt:sync` | Dispatch a turn and block until it ends (no reply text: read it from the transcript) |

### `client.agent.settings`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/agent/settings` | Get settings. |
| `update` | PATCH | `/api/v1/agent/settings` | Patch settings. |

### `client.agent.skills`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/agent/skills` | Create a skill. |
| `delete` | POST | `/api/v1/agent/skills/delete` | Delete a skill. |
| `disable` | POST | `/api/v1/agent/skills/toggle` | Enable/disable a skill. |
| `enable` | POST | `/api/v1/agent/skills/toggle` | Enable/disable a skill. |
| `getSource` | GET | `/api/v1/agent/skills/source` | Read a skill's source. |
| `import` | POST | `/api/v1/agent/skills/import/apply` | Apply a skill import. |
| `list` | GET | `/api/v1/agent/skills` | List skills. |
| `listAll` | GET | `/api/v1/agent/skills` | List skills. (collect all pages) |
| `listIterator` | GET | `/api/v1/agent/skills` | List skills. (async iterator) |
| `rename` | POST | `/api/v1/agent/skills/rename` | Rename a skill. |
| `scan` | GET | `/api/v1/agent/skills/import/scan` | Scan for importable skills. |
| `setSource` | PUT | `/api/v1/agent/skills/source` | Write a skill's source. |
| `trust` | POST | `/api/v1/agent/skills/trust` | Set a skill's trust state. |

### `client.agent.skills.hub`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `clearCache` | DELETE | `/api/v1/agent/skills/hub/cache` | Clear the skill hub cache. |
| `getCacheStats` | GET | `/api/v1/agent/skills/hub/cache` | Skill hub cache stats. |
| `install` | POST | `/api/v1/agent/skills/hub/install` | Install a hub skill. |
| `preview` | GET | `/api/v1/agent/skills/hub/preview` | Preview a hub skill. |
| `search` | GET | `/api/v1/agent/skills/hub/search` | Search the skill hub. |

### `client.agent.stats`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/agent/statistics` | Cross-session statistics. |

### `client.agent.tasks`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `cancel` | POST | `/api/v1/agent/sessions/{id}/tasks/{tid}/cancel` | Cancel a background task. |
| `getTranscript` | GET | `/api/v1/agent/sessions/{id}/tasks/{tid}/transcript` | Read a background task's transcript. |
| `list` | GET | `/api/v1/agent/sessions/{id}/tasks` | List a session's background tasks. |

### `client.agent.todos`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `approveProposal` | POST | `/api/v1/agent/todos/{id}/proposals/{pid}/approve` | Approve a todo proposal. |
| `archive` | POST | `/api/v1/agent/todos/{id}/archive` | Archive a todo. |
| `cancel` | POST | `/api/v1/agent/todos/{id}/cancel-run` | Cancel a todo's run. |
| `claim` | POST | `/api/v1/agent/todos/{id}/claim` | Claim a todo. |
| `create` | POST | `/api/v1/agent/todos` | File a todo. |
| `createComment` | POST | `/api/v1/agent/todos/{id}/messages` | Comment on a todo. |
| `denyProposal` | POST | `/api/v1/agent/todos/{id}/proposals/{pid}/deny` | Deny a todo proposal. |
| `get` | GET | `/api/v1/agent/todos/{id}` | Read a todo. |
| `getRevision` | GET | `/api/v1/agent/todos/revision` | Get the todos store revision. |
| `list` | GET | `/api/v1/agent/todos` | List todos. |
| `listAll` | GET | `/api/v1/agent/todos` | List todos. (collect all pages) |
| `listIterator` | GET | `/api/v1/agent/todos` | List todos. (async iterator) |
| `purgeArchived` | POST | `/api/v1/agent/todos/purge` | Purge archived todos. |
| `release` | POST | `/api/v1/agent/todos/{id}/release` | Release a todo. |
| `sendMessage` | POST | `/api/v1/agent/todos/{id}/message` | Comment + run an orchestrator turn. |
| `snooze` | POST | `/api/v1/agent/todos/{id}/snooze` | Snooze a todo. |
| `start` | POST | `/api/v1/agent/todos/{id}/run` | Run a todo's orchestrator. |
| `triage` | POST | `/api/v1/agent/todos/triage` | Run an LLM triage pass. |
| `update` | PATCH | `/api/v1/agent/todos/{id}` | Update a todo (CAS). |

### `client.agent.tools`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/agent/tools/{name}` | Get one tool schema. |
| `list` | GET | `/api/v1/agent/tools` | List the tool catalogue. |
| `listAll` | GET | `/api/v1/agent/tools` | List the tool catalogue. (collect all pages) |
| `listIterator` | GET | `/api/v1/agent/tools` | List the tool catalogue. (async iterator) |
| `listReadOnly` | GET | `/api/v1/agent/tools/read-only` | List the read-only tool subset. |
| `listReadOnlyAll` | GET | `/api/v1/agent/tools/read-only` | List the read-only tool subset. (collect all pages) |
| `listReadOnlyIterator` | GET | `/api/v1/agent/tools/read-only` | List the read-only tool subset. (async iterator) |
| `run` | POST | `/api/v1/agent/tools/{name}/run` | Run a tool (sessionless, gated). |
| `start` | POST | `/api/v1/agent/tools/{name}/runAsync` | Run a tool asynchronously (sessionless, gated). |

### `client.agent.usage`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `listByAccount` | GET | `/api/v1/agent/usage/by-account` | Usage rollup by account. |
| `listByModel` | GET | `/api/v1/agent/usage/by-model` | Usage rollup by model. |

### `client.agent.workflows`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `cancelRun` | POST | `/api/v1/agent/workflows/runs/{run_id}/cancel` | Cancel a workflow run. |
| `delete` | DELETE | `/api/v1/agent/workflows/{name}` | Delete a workflow definition. |
| `get` | GET | `/api/v1/agent/workflows/{name}` | Read one workflow definition. |
| `getRun` | GET | `/api/v1/agent/workflows/runs/{run_id}` | Get one workflow run by id. |
| `list` | GET | `/api/v1/agent/workflows` | List workflow definitions. |
| `listAll` | GET | `/api/v1/agent/workflows` | List workflow definitions. (collect all pages) |
| `listIterator` | GET | `/api/v1/agent/workflows` | List workflow definitions. (async iterator) |
| `listRuns` | GET | `/api/v1/agent/workflows/runs` | Snapshot in-flight and recent workflow runs. |
| `listRunsAll` | GET | `/api/v1/agent/workflows/runs` | Snapshot in-flight and recent workflow runs. (collect all pages) |
| `listRunsIterator` | GET | `/api/v1/agent/workflows/runs` | Snapshot in-flight and recent workflow runs. (async iterator) |
| `resumeRun` | POST | `/api/v1/agent/workflows/runs/{run_id}/resume` | Resume a failed or cancelled workflow run. |
| `sendMessage` | POST | `/api/v1/agent/sessions/{id}/workflow/messages` | Send a message to a running workflow. |
| `set` | PUT | `/api/v1/agent/workflows/{name}` | Create or replace a workflow definition. |
| `setHidden` | POST | `/api/v1/agent/workflows/{name}/hide` | Hide or un-hide a workflow. |
| `setSummary` | PUT | `/api/v1/agent/workflows/{name}/summary` | Set or clear a workflow's summary. |
| `start` | POST | `/api/v1/agent/workflows/{name}/runs` | Run a workflow in a new session. |

## `api` (303 methods)

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

### `client.api.auth`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `createIdentityClaim` | POST | `/api/v1/users/auth/identity-claim` | Issue a fresh audience-bound identity claim |
| `getConfig` | GET | `/api/v1/auth/config` | Get the public sign-in configuration |
| `login` | POST | `/api/v1/users/auth/login` | Login with username and password |
| `logoutAll` | POST | `/api/v1/users/auth/logout` | Log out everywhere |
| `recoverPassword` | POST | `/api/v1/auth/forgot-password` | Request password reset |
| `refresh` | POST | `/api/v1/users/auth/refresh` | Refresh access token |
| `resetPassword` | POST | `/api/v1/auth/reset-password` | Reset password |
| `sendVerificationEmail` | POST | `/api/v1/auth/resend-verification` | Resend verification email |
| `signup` | POST | `/api/v1/auth/signup` | Sign up with email and password |
| `verifyEmail` | POST | `/api/v1/auth/verify-email` | Verify email address |
| `whoami` | GET | `/api/v1/users/auth/me` | Get current user profile |

### `client.api.auth.device`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `deny` | POST | `/api/v1/auth/device/deny` | Refuse the device ('Don't authorize') |
| `login` | POST | `/api/v1/auth/device/login` | Password sign-in for the device authorize step (cookie + ticket gated) |
| `poll` | POST | `/api/v1/auth/device/token` | Poll for device-flow tokens (RFC-8628-inspired) |
| `start` | POST | `/api/v1/auth/device/code` | Start a device authorization flow (RFC-8628-inspired) |
| `verifyCode` | POST | `/api/v1/auth/device/verify_code` | Confirm a device user_code (verification page) |

### `client.api.auth.oauth`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `authorize` | POST | `/api/v1/auth/authorize` | Begin a PKCE OAuth authorization |
| `cancelIntent` | POST | `/api/v1/auth/intent/cancel` | Cancel a pending OAuth intent or 2FA temp_token |
| `exchange` | POST | `/api/v1/auth/exchange` | Exchange a PKCE authorization code for tokens |
| `startLaunch` | POST | `/api/v1/auth/launch/initiate` | Initiate OAuth popup-handoff launch |

### `client.api.auth.tokens`

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
| `listIterator` | GET | `/api/v1/auth/tokens` | List auth tokens (async iterator) |
| `listTemplates` | GET | `/api/v1/auth/tokens/templates` | List permission templates |
| `removeRealm` | POST | `/api/v1/auth/tokens/{id}/remove-realm` | Remove realm from auth token |
| `update` | PUT | `/api/v1/auth/tokens/{id}` | Update auth token |
| `updatePublicProfile` | PUT | `/api/v1/auth/tokens/me/public-profile` | Update current auth token public profile |

### `client.api.auth.twoFactor`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `confirmSetup` | POST | `/api/v1/users/auth/2fa/verify-setup` | Complete 2FA Setup |
| `disable` | DELETE | `/api/v1/users/auth/2fa` | Disable 2FA |
| `disableTokenGate` | PUT | `/api/v1/users/auth/2fa/token-gate` | Set 2FA token gate preference |
| `enableTokenGate` | PUT | `/api/v1/users/auth/2fa/token-gate` | Set 2FA token gate preference |
| `getStatus` | GET | `/api/v1/users/auth/2fa/status` | Get 2FA Status |
| `rotateBackupCodes` | POST | `/api/v1/users/auth/2fa/backup-codes/regenerate` | Regenerate Backup Codes |
| `startSetup` | POST | `/api/v1/users/auth/2fa/setup` | Initialize 2FA Setup |
| `verify` | POST | `/api/v1/users/auth/2fa/verify` | Verify 2FA Code During Login |

### `client.api.containers`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `copy` | POST | `/api/v1/containers/{id}/copy` | Copy a container |
| `create` | POST | `/api/v1/projects/{id}/containers` | Create a new container |
| `createClaim` | POST | `/api/v1/containers/{id}/authorize` | Authorize Container Access |
| `delete` | DELETE | `/api/v1/containers/{id}` | Delete a container |
| `disableKvm` | PUT | `/api/v1/containers/{id}/kvm` | Enable or disable /dev/kvm (run VMs in the container) |
| `enableKvm` | PUT | `/api/v1/containers/{id}/kvm` | Enable or disable /dev/kvm (run VMs in the container) |
| `get` | GET | `/api/v1/containers/{id}` | Get a container by ID |
| `getProxyUsage` | GET | `/api/v1/containers/{id}/proxy-usage` | Get proxied-usage documents for a container |
| `getStats` | GET | `/api/v1/containers/{id}/stats` | Get container resource statistics |
| `list` | GET | `/api/v1/containers/` | Get all containers |
| `listAll` | GET | `/api/v1/containers/` | Get all containers (collect all pages) |
| `listByProject` | GET | `/api/v1/projects/{id}/containers` | Get all containers for a project |
| `listByProjectAll` | GET | `/api/v1/projects/{id}/containers` | Get all containers for a project (collect all pages) |
| `listByProjectIterator` | GET | `/api/v1/projects/{id}/containers` | Get all containers for a project (async iterator) |
| `listIterator` | GET | `/api/v1/containers/` | Get all containers (async iterator) |
| `listStatusHistory` | GET | `/api/v1/containers/{id}/status-logs` | Get status logs for a container |
| `pause` | POST | `/api/v1/containers/{id}/{operation}` | Manage container |
| `restart` | POST | `/api/v1/containers/{id}/{operation}` | Manage container |
| `resume` | POST | `/api/v1/containers/{id}/{operation}` | Manage container |
| `start` | POST | `/api/v1/containers/{id}/{operation}` | Manage container |
| `stop` | POST | `/api/v1/containers/{id}/{operation}` | Manage container |
| `sync` | POST | `/api/v1/containers/{id}/sync` | Sync a copied container with its source |
| `update` | PUT | `/api/v1/containers/{id}` | Update a container |

### `client.api.containers.env`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `delete` | DELETE | `/api/v1/containers/{id}/env/{key}` | Delete a single environment variable |
| `list` | GET | `/api/v1/containers/{id}/env` | List container environment variables |
| `set` | PUT | `/api/v1/containers/{id}/env/{key}` | Set a single environment variable |
| `update` | PUT | `/api/v1/containers/{id}/env` | Bulk set container environment variables |

### `client.api.events`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `clear` | DELETE | `/api/v1/events` | Bulk delete events |
| `delete` | DELETE | `/api/v1/events/{id}` | Delete a single event |
| `get` | GET | `/api/v1/events/{id}` | Get event details by ID |
| `getStats` | GET | `/api/v1/events/stats` | Get event statistics |
| `list` | GET | `/api/v1/events` | List event history |
| `listAll` | GET | `/api/v1/events` | List event history (collect all pages) |
| `listIterator` | GET | `/api/v1/events` | List event history (async iterator) |
| `purge` | POST | `/api/v1/events/cleanup` | Cleanup old events |

### `client.api.firewall`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `createEgressRule` | POST | `/api/v1/containers/{id}/firewall/egress` | Add Egress Rule |
| `createIngressRule` | POST | `/api/v1/containers/{id}/firewall/ingress` | Add Ingress Rule |
| `deleteEgressRule` | DELETE | `/api/v1/containers/{id}/firewall/egress` | Remove Egress Rule(s) |
| `deleteIngressRule` | DELETE | `/api/v1/containers/{id}/firewall/ingress` | Remove Ingress Rule(s) |
| `disableEgressRule` | PATCH | `/api/v1/containers/{id}/firewall/egress` | Toggle Egress Rule State |
| `disableIngressRule` | PATCH | `/api/v1/containers/{id}/firewall/ingress` | Toggle Ingress Rule State |
| `enableEgressRule` | PATCH | `/api/v1/containers/{id}/firewall/egress` | Toggle Egress Rule State |
| `enableIngressRule` | PATCH | `/api/v1/containers/{id}/firewall/ingress` | Toggle Ingress Rule State |
| `listRules` | GET | `/api/v1/containers/{id}/firewall/rules` | List container firewall rules |
| `reset` | POST | `/api/v1/containers/{id}/firewall/reset` | Reset container firewall |

### `client.api.images`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `buy` | POST | `/api/v1/images/purchase/{id}` | Purchase image |
| `getIcon` | GET | `/api/v1/images/{id}/icon` | Get image icon |
| `getPublic` | GET | `/api/v1/images/public/{id}` | Get public image details |
| `import` | POST | `/api/v1/images/import/{id}` | Import free image |
| `list` | GET | `/api/v1/images/user` | List user images |
| `listAll` | GET | `/api/v1/images/user` | List user images (collect all pages) |
| `listIterator` | GET | `/api/v1/images/user` | List user images (async iterator) |
| `listPublic` | GET | `/api/v1/images/public` | List public images |
| `listPublicAll` | GET | `/api/v1/images/public` | List public images (collect all pages) |
| `listPublicIterator` | GET | `/api/v1/images/public` | List public images (async iterator) |
| `rate` | POST | `/api/v1/images/rate/{id}` | Rate image |

### `client.api.inbox`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getSummary` | GET | `/api/v1/notifications/summary` | Unread notification count and newest position |
| `list` | GET | `/api/v1/notifications/` | List notifications for the authenticated user |
| `listAll` | GET | `/api/v1/notifications/` | List notifications for the authenticated user (collect all pages) |
| `listAnnouncements` | GET | `/api/v1/notifications/public` | Get all public notifications |
| `listAnnouncementsAll` | GET | `/api/v1/notifications/public` | Get all public notifications (collect all pages) |
| `listAnnouncementsIterator` | GET | `/api/v1/notifications/public` | Get all public notifications (async iterator) |
| `listIterator` | GET | `/api/v1/notifications/` | List notifications for the authenticated user (async iterator) |
| `markAllRead` | PUT | `/api/v1/notifications/read-all` | Mark all notifications as read |
| `markRead` | PUT | `/api/v1/notifications/{id}/read` | Mark a notification as read |

### `client.api.ip`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/ip` | Get IP Information |

### `client.api.meta`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getPublicKey` | GET | `/api/v1/meta/public-key` | Get Hoody API Signing Public Key |

### `client.api.network`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `delete` | DELETE | `/api/v1/containers/{id}/network` | Remove container network configuration |
| `get` | GET | `/api/v1/containers/{id}/network` | Get container network configuration |
| `start` | POST | `/api/v1/containers/{id}/network/start` | Start container network proxy/blocking |
| `stop` | POST | `/api/v1/containers/{id}/network/stop` | Stop container network proxy/blocking |
| `update` | PUT | `/api/v1/containers/{id}/network` | Update container network configuration |

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

### `client.api.pools.invitations`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `accept` | POST | `/api/v1/pools/{id}/accept` | Accept invitation |
| `list` | GET | `/api/v1/pools/invitations/pending` | List pending invitations |
| `reject` | POST | `/api/v1/pools/{id}/reject` | Reject invitation |

### `client.api.pools.members`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `invite` | POST | `/api/v1/pools/{id}/members` | Invite member |
| `remove` | DELETE | `/api/v1/pools/{id}/members/{userId}` | Remove member |
| `setRole` | PUT | `/api/v1/pools/{id}/members/{userId}` | Update member role |

### `client.api.projects`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/projects/` | Create a new project |
| `createPermission` | POST | `/api/v1/projects/{id}/permissions` | Grant project access |
| `delete` | DELETE | `/api/v1/projects/{id}` | Delete project |
| `deletePermission` | DELETE | `/api/v1/projects/{id}/permissions/{permissionId}` | Revoke project access |
| `get` | GET | `/api/v1/projects/{id}` | Get project by ID |
| `getProxyUsage` | GET | `/api/v1/projects/{id}/proxy-usage` | Get proxied-usage documents for every container in a project |
| `getStats` | GET | `/api/v1/projects/{id}/stats` | Get statistics for all containers in a project |
| `list` | GET | `/api/v1/projects/` | List all projects |
| `listAll` | GET | `/api/v1/projects/` | List all projects (collect all pages) |
| `listIterator` | GET | `/api/v1/projects/` | List all projects (async iterator) |
| `listPermissions` | GET | `/api/v1/projects/{id}/permissions` | List project permissions |
| `listPermissionsAll` | GET | `/api/v1/projects/{id}/permissions` | List project permissions (collect all pages) |
| `listPermissionsIterator` | GET | `/api/v1/projects/{id}/permissions` | List project permissions (async iterator) |
| `update` | PUT | `/api/v1/projects/{id}` | Update project |
| `updatePermission` | PUT | `/api/v1/projects/{id}/permissions/{permissionId}` | Update project permission |

### `client.api.proxy.aliases`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/proxy/aliases` | Create a new proxy alias |
| `delete` | DELETE | `/api/v1/proxy/aliases/{id}` | Delete proxy alias |
| `disable` | PATCH | `/api/v1/proxy/aliases/{id}/state` | Enable or disable proxy alias |
| `enable` | PATCH | `/api/v1/proxy/aliases/{id}/state` | Enable or disable proxy alias |
| `get` | GET | `/api/v1/proxy/aliases/{id}` | Get proxy alias by ID |
| `list` | GET | `/api/v1/proxy/aliases` | List proxy aliases |
| `listAll` | GET | `/api/v1/proxy/aliases` | List proxy aliases (collect all pages) |
| `listIterator` | GET | `/api/v1/proxy/aliases` | List proxy aliases (async iterator) |
| `update` | PATCH | `/api/v1/proxy/aliases/{id}` | Update proxy alias |

### `client.api.proxy.containerPermissions`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `clearGroupPermissions` | DELETE | `/api/v1/containers/{id}/proxy/permissions/permissions/{groupName}` | Remove all program permissions for a container group |
| `delete` | DELETE | `/api/v1/containers/{id}/proxy/permissions` | Delete container proxy permissions |
| `deleteAuthGroup` | DELETE | `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}` | Remove container authentication group |
| `deleteGroupPermission` | DELETE | `/api/v1/containers/{id}/proxy/permissions/permissions/{groupName}/{program}` | Remove a single program permission for a container group |
| `disable` | PATCH | `/api/v1/containers/{id}/proxy/permissions/state` | Update container proxy enable state |
| `enable` | PATCH | `/api/v1/containers/{id}/proxy/permissions/state` | Update container proxy enable state |
| `get` | GET | `/api/v1/containers/{id}/proxy/permissions` | Get container proxy permissions |
| `set` | PUT | `/api/v1/containers/{id}/proxy/permissions` | Replace container proxy permissions JSON |
| `setDefault` | PATCH | `/api/v1/containers/{id}/proxy/permissions/default` | Update container default proxy permission policy |
| `setGroupPermission` | PUT | `/api/v1/containers/{id}/proxy/permissions/permissions/{groupName}` | Set container group program permission |
| `setIpGroup` | PUT | `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/ip` | Set IP authentication group (container) |
| `setJwtGroup` | PUT | `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/jwt` | Set JWT authentication group (container) |
| `setPasswordGroup` | PUT | `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/password` | Set password authentication group (container) |
| `setTokenGroup` | PUT | `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/token` | Set token authentication group (container) |

### `client.api.proxy.groups`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `list` | GET | `/api/v1/containers/{id}/proxy/groups` | List container proxy groups |

### `client.api.proxy.hooks`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `clear` | DELETE | `/api/v1/containers/{id}/proxy/hooks/{service}` | Clear all hooks for a service |
| `create` | POST | `/api/v1/containers/{id}/proxy/hooks/{service}` | Append or insert a new hook |
| `delete` | DELETE | `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` | Remove a hook |
| `get` | GET | `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` | Get a single hook by id |
| `list` | GET | `/api/v1/containers/{id}/proxy/hooks` | List all proxy hooks for a container |
| `listByService` | GET | `/api/v1/containers/{id}/proxy/hooks/{service}` | List hooks for a specific service |
| `move` | PATCH | `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}/position` | Move a hook to a new position |
| `set` | PUT | `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` | Replace a hook in place |

### `client.api.proxy.projectPermissions`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `clearGroupPermissions` | DELETE | `/api/v1/projects/{id}/proxy/permissions/permissions/{groupName}` | Remove all program permissions for a project group |
| `delete` | DELETE | `/api/v1/projects/{id}/proxy/permissions` | Delete project proxy permissions |
| `deleteAuthGroup` | DELETE | `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}` | Remove project authentication group |
| `deleteGroupPermission` | DELETE | `/api/v1/projects/{id}/proxy/permissions/permissions/{groupName}/{program}` | Remove a single program permission for a project group |
| `disable` | PATCH | `/api/v1/projects/{id}/proxy/permissions/state` | Update project proxy enable state |
| `enable` | PATCH | `/api/v1/projects/{id}/proxy/permissions/state` | Update project proxy enable state |
| `get` | GET | `/api/v1/projects/{id}/proxy/permissions` | Get project proxy permissions |
| `set` | PUT | `/api/v1/projects/{id}/proxy/permissions` | Replace project proxy permissions JSON |
| `setDefault` | PATCH | `/api/v1/projects/{id}/proxy/permissions/default` | Update project default proxy permission policy |
| `setGroupPermission` | PUT | `/api/v1/projects/{id}/proxy/permissions/permissions/{groupName}` | Set project group program permission |
| `setIpGroup` | PUT | `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/ip` | Set IP authentication group (project) |
| `setJwtGroup` | PUT | `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/jwt` | Set JWT authentication group (project) |
| `setPasswordGroup` | PUT | `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/password` | Set password authentication group (project) |
| `setTokenGroup` | PUT | `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/token` | Set token authentication group (project) |

### `client.api.proxy.services`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/containers/{id}/proxy/services/{service}` | Get merged proxy view for a service |
| `list` | GET | `/api/v1/containers/{id}/proxy/services` | List services referenced in proxy config |

### `client.api.proxy.settings`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/containers/{id}/proxy/settings` | Get container proxy root settings |
| `update` | PUT | `/api/v1/containers/{id}/proxy/settings` | Update container proxy root settings |

### `client.api.realms`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `list` | GET | `/api/v1/realms/` | List your realm IDs |

### `client.api.servers`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `extend` | POST | `/api/v1/rentals/{id}/extend` | Extend rental |
| `get` | GET | `/api/v1/rentals/{id}` | Get rental details |
| `getStats` | GET | `/api/v1/rentals/{id}/runtime` | Get live runtime info for a rented server or subserver |
| `list` | GET | `/api/v1/rentals` | List user rentals |
| `listAll` | GET | `/api/v1/rentals` | List user rentals (collect all pages) |
| `listIterator` | GET | `/api/v1/rentals` | List user rentals (async iterator) |
| `listMarketplace` | GET | `/api/v1/servers/available` | Browse rental marketplace |
| `listMarketplaceAll` | GET | `/api/v1/servers/available` | Browse rental marketplace (collect all pages) |
| `listMarketplaceIterator` | GET | `/api/v1/servers/available` | Browse rental marketplace (async iterator) |
| `listRegions` | GET | `/api/v1/auth/available-regions` | Get available server regions |
| `rent` | POST | `/api/v1/servers/{id}/rent` | Rent server |

### `client.api.servers.commands`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `list` | GET | `/api/v1/servers/{serverId}/available-commands` | Get available commands |
| `listAll` | GET | `/api/v1/servers/{serverId}/available-commands` | Get available commands (collect all pages) |
| `listIterator` | GET | `/api/v1/servers/{serverId}/available-commands` | Get available commands (async iterator) |
| `run` | POST | `/api/v1/servers/{serverId}/execute-command` | Execute server command |

### `client.api.servers.jobs`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/subserver-operations/{id}` | Status of a paid subserver operation |

### `client.api.servers.offers`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `list` | GET | `/api/v1/offers` | Browse machines available to order |
| `reserve` | POST | `/api/v1/offers/{id}/reserve` | Reserve an offer (charges immediately) |

### `client.api.servers.plans`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `list` | GET | `/api/v1/subserver-plans` | List subserver plans available to you |
| `quote` | GET | `/api/v1/subserver-subscriptions/quote` | Quote a paid subserver purchase |

### `client.api.servers.reservations`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/reservations/{id}` | One of your reservations |
| `list` | GET | `/api/v1/reservations` | Your reservations |

### `client.api.servers.subscriptions`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `buy` | POST | `/api/v1/subserver-subscriptions` | Buy a paid subserver (charges immediately) |
| `cancel` | POST | `/api/v1/subserver-subscriptions/{id}/cancel` | Cancel a paid subserver subscription |
| `disableAutoRenew` | PUT | `/api/v1/subserver-subscriptions/{id}/auto-renew` | Turn auto-renew on or off |
| `enableAutoRenew` | PUT | `/api/v1/subserver-subscriptions/{id}/auto-renew` | Turn auto-renew on or off |
| `get` | GET | `/api/v1/subserver-subscriptions/{id}` | One of your paid subserver subscriptions |
| `list` | GET | `/api/v1/subserver-subscriptions` | List your paid subserver subscriptions |
| `pay` | POST | `/api/v1/subserver-subscriptions/{id}/pay` | Pay a held subscription and resume it (charges one month) |
| `quote` | GET | `/api/v1/subserver-subscriptions/{id}/quote` | Quote an upgrade or a payment |
| `upgrade` | POST | `/api/v1/subserver-subscriptions/{id}/upgrade` | Upgrade a paid subserver (charges the difference) |

### `client.api.snapshots`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/containers/{id}/snapshots` | Create container snapshot |
| `delete` | DELETE | `/api/v1/containers/{id}/snapshots/{name}` | Delete container snapshot |
| `list` | GET | `/api/v1/containers/{id}/snapshots` | Get container snapshots |
| `listAll` | GET | `/api/v1/containers/{id}/snapshots` | Get container snapshots (collect all pages) |
| `listIterator` | GET | `/api/v1/containers/{id}/snapshots` | Get container snapshots (async iterator) |
| `restore` | PUT | `/api/v1/containers/{id}/snapshots/{name}` | Restore container from snapshot |
| `setAlias` | PUT | `/api/v1/containers/{id}/snapshots/{name}/alias` | Update snapshot alias |

### `client.api.storage.shares`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/containers/{id}/storage/shares` | Create storage share |
| `delete` | DELETE | `/api/v1/storage/shares/{shareId}` | Delete storage share |
| `get` | GET | `/api/v1/containers/{id}/storage/shares/{shareId}` | Get storage share |
| `list` | GET | `/api/v1/storage/shares` | List all your storage shares |
| `listAll` | GET | `/api/v1/storage/shares` | List all your storage shares (collect all pages) |
| `listByContainer` | GET | `/api/v1/containers/{id}/storage/shares` | List storage shares |
| `listByContainerAll` | GET | `/api/v1/containers/{id}/storage/shares` | List storage shares (collect all pages) |
| `listByContainerIterator` | GET | `/api/v1/containers/{id}/storage/shares` | List storage shares (async iterator) |
| `listIncoming` | GET | `/api/v1/storage/incoming` | Get all incoming shares |
| `listIncomingAll` | GET | `/api/v1/storage/incoming` | Get all incoming shares (collect all pages) |
| `listIncomingByContainer` | GET | `/api/v1/containers/{id}/storage/incoming` | Get incoming shares |
| `listIncomingIterator` | GET | `/api/v1/storage/incoming` | Get all incoming shares (async iterator) |
| `listIterator` | GET | `/api/v1/storage/shares` | List all your storage shares (async iterator) |
| `mountIncoming` | PATCH | `/api/v1/containers/{id}/storage/incoming/{shareId}/mount` | Toggle incoming share mount |
| `unmountIncoming` | PATCH | `/api/v1/containers/{id}/storage/incoming/{shareId}/mount` | Toggle incoming share mount |
| `update` | PATCH | `/api/v1/containers/{id}/storage/shares/{shareId}` | Update storage share |

### `client.api.users`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `completeOnboardingMilestone` | POST | `/api/v1/users/me/onboarding` | Mark an onboarding milestone as completed |
| `get` | GET | `/api/v1/users/{id}` | Get user by ID |
| `getFreeTierStatus` | GET | `/api/v1/users/me/free-tier-status` | Get free-tier claim status |
| `listSecurityHistory` | GET | `/api/v1/users/me/security-history` | Get your account security history |
| `listSecurityHistoryAll` | GET | `/api/v1/users/me/security-history` | Get your account security history (collect all pages) |
| `listSecurityHistoryIterator` | GET | `/api/v1/users/me/security-history` | Get your account security history (async iterator) |
| `redeemInvite` | POST | `/api/v1/users/me/redeem-invite` | Redeem a beta invite code |
| `retrySetup` | POST | `/api/v1/users/me/retry-setup` | Retry free-tier account setup |
| `update` | PUT | `/api/v1/users/{id}` | Update user profile |

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

### `client.api.wallet`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `claimGithubBonus` | POST | `/api/v1/wallet/github-bonus/claim` | Claim the GitHub connection bonus |
| `createCryptoInvoice` | POST | `/api/v1/wallet/payments/crypto/invoice` | Start a crypto payment (hosted invoice) |
| `createInvoice` | POST | `/api/v1/wallet/invoices/generate/{id}` | Generate invoice for transaction |
| `createPaymentMethod` | POST | `/api/v1/wallet/payment-methods/` | Add a new payment method |
| `createStripeCheckout` | POST | `/api/v1/wallet/payments/stripe/checkout` | Start a card payment (Stripe Checkout) |
| `deletePaymentMethod` | DELETE | `/api/v1/wallet/payment-methods/{id}` | Delete a payment method |
| `downloadInvoice` | GET | `/api/v1/wallet/invoices/{id}/pdf` | Download invoice PDF |
| `getBalance` | GET | `/api/v1/wallet/balances/general` | Get general balance only |
| `getBalances` | GET | `/api/v1/wallet/balances` | Get aggregate balances (general + AI) |
| `getCredits` | GET | `/api/v1/wallet/balances/ai` | Get AI balance (limit, usage, remaining) |
| `getCryptoPaymentIntent` | GET | `/api/v1/wallet/payments/crypto/intents/{id}` | Get a crypto payment intent |
| `getGithubBonus` | GET | `/api/v1/wallet/github-bonus` | Get GitHub connection bonus status |
| `getInvoice` | GET | `/api/v1/wallet/invoices/{id}` | Get invoice by ID |
| `getPaymentAvailability` | GET | `/api/v1/wallet/payment-availability` | Get top-up payment availability (providers, bounds, AI transfer fee) |
| `getPaymentMethod` | GET | `/api/v1/wallet/payment-methods/{id}` | Get payment method by ID |
| `getStripePaymentIntent` | GET | `/api/v1/wallet/payments/stripe/intents/{id}` | Get a card payment intent |
| `getTransaction` | GET | `/api/v1/wallet/transactions/{id}` | Get transaction by ID |
| `listCreditFees` | GET | `/api/v1/wallet/ai-fee-history` | Get AI credit fee history |
| `listCreditFeesAll` | GET | `/api/v1/wallet/ai-fee-history` | Get AI credit fee history (collect all pages) |
| `listCreditFeesIterator` | GET | `/api/v1/wallet/ai-fee-history` | Get AI credit fee history (async iterator) |
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
| `transferToCredits` | POST | `/api/v1/wallet/transfers` | Transfer from general balance to AI credits |
| `updatePaymentMethod` | PUT | `/api/v1/wallet/payment-methods/{id}` | Update a payment method |

## `bot` (17 methods)

### `client.bot.kit`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getHealth` | GET | `/api/v1/bot/health` | Nine-field kit health; unauthenticated by design. |
| `getManifest` | GET | `/api/v1/bot/manifest` | The chat manifest this build is pinned to, as it was baked. |
| `rotateKeys` | POST | `/api/v1/bot/kit/keys/rotate` | Re-encrypt every sealed column under a new kit key. |

### `client.bot.registrations`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/bot/registrations` | Register a channel bot; the token arrives in the body and is stored encrypted. |
| `delete` | DELETE | `/api/v1/bot/registrations/{registrationId}` | Delete a registration and its stored channel token. |
| `get` | GET | `/api/v1/bot/registrations/{registrationId}` | Read one registration. |
| `getPolicy` | GET | `/api/v1/bot/registrations/{registrationId}/policy` | Read a registration’s mode and allowlists. |
| `list` | GET | `/api/v1/bot/registrations` | List the registrations owned by the calling account. |
| `listLogs` | GET | `/api/v1/bot/registrations/{registrationId}/logs` | Read the redacted audit log of a registration, newest first. |
| `purgeLogs` | DELETE | `/api/v1/bot/registrations/{registrationId}/logs` | Delete audit rows older than a cutoff, never inside the retention window. |
| `revokeAllTokens` | POST | `/api/v1/bot/registrations/{registrationId}/tokens/revoke-all` | Revoke every chat user’s lineage for this registration. |
| `revokeSession` | POST | `/api/v1/bot/registrations/{registrationId}/sessions/{channelUserId}/revoke` | Revoke one chat user’s login: delete the leaf through the parent and forget it. |
| `start` | POST | `/api/v1/bot/registrations/{registrationId}/start` | Start long-polling for a registration. |
| `stop` | POST | `/api/v1/bot/registrations/{registrationId}/stop` | Stop long-polling for a registration. |
| `syncCommands` | POST | `/api/v1/bot/registrations/{registrationId}/commands/sync` | Publish the registered commands to the channel and return the readback diff. |
| `updatePolicy` | PUT | `/api/v1/bot/registrations/{registrationId}/policy` | Set a registration’s mode and allowlists. |
| `updateProfile` | PUT | `/api/v1/bot/registrations/{registrationId}/profile` | Set the bot profile (name, descriptions, default admin rights) and publish it. |

## `browser` (28 methods)

### `client.browser.cookies`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `clear` | DELETE | `/api/v1/browser/cookies` | Clear all cookies |
| `list` | GET | `/api/v1/browser/cookies` | Get cookies |
| `setMany` | POST | `/api/v1/browser/cookies` | Set cookies |

### `client.browser.history`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `clear` | DELETE | `/api/v1/browser/history` | Delete browsing history |
| `list` | GET | `/api/v1/browser/history` | Query browsing history |

### `client.browser.instances`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/browser/metadata` | Get instance metadata |
| `getDevtoolsUrls` | GET | `/api/v1/browser/devtools-url` | Get DevTools URLs |
| `restart` | GET | `/api/v1/browser/restart` | Restart browser instance |
| `shutdown` | GET | `/api/v1/browser/shutdown` | Shutdown browser instance |
| `start` | GET | `/api/v1/browser/start` | Create or retrieve browser instance |
| `stop` | GET | `/api/v1/browser/stop` | Stop browser instance |

### `client.browser.kit`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getHealth` | GET | `/api/v1/browser/health` | Health check |
| `getStats` | GET | `/api/v1/browser/metrics` | Server metrics |

### `client.browser.logs`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `listConsole` | GET | `/api/v1/browser/console` | Get console logs |
| `listNetwork` | GET | `/api/v1/browser/network` | Get network logs |

### `client.browser.page`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `act` | POST | `/api/v1/browser/action` | Perform a native element action |
| `captureScreenshot` | GET | `/api/v1/browser/screenshot` | Capture browser screenshot |
| `evaluate` | POST | `/api/v1/browser/eval` | Execute JavaScript (POST) |
| `exportPdf` | GET | `/api/v1/browser/pdf` | Export page as PDF |
| `getHtml` | GET | `/api/v1/browser/html` | Get page HTML |
| `getSnapshot` | GET | `/api/v1/browser/snapshot` | Accessibility snapshot of a tab with element refs |
| `getText` | GET | `/api/v1/browser/text` | Get page text |
| `navigate` | POST | `/api/v1/browser/browse` | Navigate to URL (POST) |
| `wait` | POST | `/api/v1/browser/wait` | Wait for a condition in a tab |

### `client.browser.tabs`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `close` | POST | `/api/v1/browser/tab/close` | Close a browser tab |
| `list` | GET | `/api/v1/browser/tabs` | List browser tabs |

### `client.browser.viewport`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/browser/viewport` | Get the current viewport policy |
| `set` | POST | `/api/v1/browser/viewport` | Change the viewport at runtime |

## `code` (10 methods)

### `client.code`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `stop` | DELETE | `/api/v1/code` | Stop an editor instance |

### `client.code.extensions`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `install` | POST | `/api/v1/code/extensions/install` | Stage a VS Code extension from a URL |
| `list` | GET | `/api/v1/code/extensions/list` | Staged extensions, and what the instance appears to have installed |

### `client.code.kit`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getHealth` | GET | `/api/v1/code/health` | Service health check |
| `getStatus` | GET | `/status` | Get orchestrator and instance status |
| `getVersion` | GET | `/api/v1/code/version` | Versions of the running orchestrator and its packaged editor |

### `client.code.ui`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getFavicon` | GET | `/favicon.ico` | Site icon |
| `getManifest` | GET | `/api/v1/code/manifest.json` | Web application manifest for installing the editor |
| `getRobots` | GET | `/robots.txt` | Crawler policy |
| `getSecurityPolicy` | GET | `/security.txt` | Security contact information |

## `cron` (13 methods)

### `client.cron.crontabs`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/cron/users/{user}/crontab` | Get Crontab |
| `list` | GET | `/api/v1/cron/crontab` | List All Crontabs |
| `listAll` | GET | `/api/v1/cron/crontab` | List All Crontabs (collect all pages) |
| `listIterator` | GET | `/api/v1/cron/crontab` | List All Crontabs (async iterator) |
| `set` | PUT | `/api/v1/cron/users/{user}/crontab` | Put Crontab |

### `client.cron.entries`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/cron/users/{user}/entries` | Create Entry |
| `delete` | DELETE | `/api/v1/cron/users/{user}/entries/{id}` | Delete Entry |
| `get` | GET | `/api/v1/cron/users/{user}/entries/{id}` | Get Entry |
| `list` | GET | `/api/v1/cron/users/{user}/entries` | List Entries |
| `listAll` | GET | `/api/v1/cron/users/{user}/entries` | List Entries (collect all pages) |
| `listIterator` | GET | `/api/v1/cron/users/{user}/entries` | List Entries (async iterator) |
| `update` | PATCH | `/api/v1/cron/users/{user}/entries/{id}` | Update Entry |

### `client.cron.kit`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getHealth` | GET | `/api/v1/cron/health` | Health Check |

## `curl` (31 methods)

### `client.curl.channel`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `connect` | GET | `/api/v1/curl/channel` | Execute cURL requests over a WebSocket channel |

### `client.curl`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `run` | POST | `/api/v1/curl/request` | Execute HTTP request with full cURL capabilities |

### `client.curl.jobs`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `cancel` | DELETE | `/api/v1/curl/jobs/{id}` | Cancel a pending or running job, or delete a finished one |
| `connect` | GET | `/api/v1/curl/ws` | Subscribe to job events over WebSocket |
| `delete` | DELETE | `/api/v1/curl/jobs/{id}` | Cancel a pending or running job, or delete a finished one |
| `get` | GET | `/api/v1/curl/jobs/{id}` | Get detailed job information |
| `getResult` | GET | `/api/v1/curl/jobs/{id}/result` | Get job response body |
| `list` | GET | `/api/v1/curl/jobs` | List all async jobs |
| `listAll` | GET | `/api/v1/curl/jobs` | List all async jobs (collect all pages) |
| `listIterator` | GET | `/api/v1/curl/jobs` | List all async jobs (async iterator) |
| `stream` | GET | `/api/v1/curl/sse` | Subscribe to job events over Server-Sent Events |

### `client.curl.kit`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getHealth` | GET | `/api/v1/curl/health` | Service health check |
| `getMetrics` | GET | `/metrics` | Prometheus metrics |

### `client.curl.schedules`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/curl/schedule` | Create a recurring scheduled job |
| `delete` | DELETE | `/api/v1/curl/schedule/{id}` | Delete a schedule |
| `get` | GET | `/api/v1/curl/schedule/{id}` | Get schedule details |
| `list` | GET | `/api/v1/curl/schedule` | List all scheduled jobs |
| `listAll` | GET | `/api/v1/curl/schedule` | List all scheduled jobs (collect all pages) |
| `listIterator` | GET | `/api/v1/curl/schedule` | List all scheduled jobs (async iterator) |
| `update` | PATCH | `/api/v1/curl/schedule/{id}` | Update a schedule's cron expression, request or enabled state |

### `client.curl.sessions`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `delete` | DELETE | `/api/v1/curl/sessions/{id}` | Delete a session |
| `get` | GET | `/api/v1/curl/sessions/{id}` | Get session details |
| `list` | GET | `/api/v1/curl/sessions` | List all cookie sessions |
| `listAll` | GET | `/api/v1/curl/sessions` | List all cookie sessions (collect all pages) |
| `listCookies` | GET | `/api/v1/curl/sessions/{id}/cookies` | Get session cookies only |
| `listIterator` | GET | `/api/v1/curl/sessions` | List all cookie sessions (async iterator) |

### `client.curl.storage`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `delete` | DELETE | `/api/v1/curl/storage/{path}` | Delete a saved file or directory |
| `get` | GET | `/api/v1/curl/storage/{path}` | Download a saved file |
| `list` | GET | `/api/v1/curl/storage` | List all saved downloads |
| `listAll` | GET | `/api/v1/curl/storage` | List all saved downloads (collect all pages) |
| `listIterator` | GET | `/api/v1/curl/storage` | List all saved downloads (async iterator) |

## `daemon` (21 methods)

### `client.daemon.ephemeralPrograms`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getLogs` | GET | `/api/v1/daemon/quick-start/{id}/logs` | Get ephemeral program logs |
| `getStatus` | GET | `/api/v1/daemon/quick-start/{id}/status` | Get ephemeral program status |
| `list` | GET | `/api/v1/daemon/quick-start` | List all ephemeral programs |
| `start` | POST | `/api/v1/daemon/quick-start` | Launch ephemeral CUSTOM program |
| `stop` | POST | `/api/v1/daemon/quick-start/{id}/stop` | Stop ephemeral program |

### `client.daemon.kit`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getHealth` | GET | `/api/v1/daemon/health` | Service health check |

### `client.daemon.programs`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/daemon/programs/add` | Add a new CUSTOM program |
| `delete` | POST | `/api/v1/daemon/programs/remove/{id}` | Remove a program |
| `disable` | POST | `/api/v1/daemon/programs/{id}/disable` | Disable a program |
| `enable` | POST | `/api/v1/daemon/programs/{id}/enable` | Enable a program |
| `get` | GET | `/api/v1/daemon/programs/{id}` | Get a specific program |
| `getLogs` | GET | `/api/v1/daemon/programs/{id}/logs` | Get program logs |
| `getSandbox` | GET | `/api/v1/daemon/programs/{id}/sandbox` | Get sandbox status for a program |
| `getStatus` | GET | `/api/v1/daemon/status/{id}` | Get specific program status |
| `list` | GET | `/api/v1/daemon/programs` | List all programs |
| `listStatus` | GET | `/api/v1/daemon/status` | Get all program statuses |
| `reset` | POST | `/api/v1/daemon/programs/reset` | Reset programs to default |
| `start` | POST | `/api/v1/daemon/programs/{id}/start` | Start a program or port instance |
| `stop` | POST | `/api/v1/daemon/programs/{id}/stop` | Stop a program or port instance |
| `streamLogs` | GET | `/api/v1/daemon/programs/{id}/logs/stream` | Follow program logs (SSE) |
| `update` | POST | `/api/v1/daemon/programs/edit/{id}` | Edit a program |

## `display` (46 methods)

### `client.display.clipboard`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/display/clipboard` | Read clipboard text |
| `set` | POST | `/api/v1/display/clipboard` | Write clipboard text |

### `client.display`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/display/info` | Get display information and screenshots |
| `getGeometry` | GET | `/api/v1/display/input/display-geometry` | Get display dimensions |

### `client.display.input`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `act` | POST | `/api/v1/display/input/act` | Execute one action with optional screenshot |
| `actMany` | POST | `/api/v1/display/input/batch` | Execute a sequence of actions |
| `click` | POST | `/api/v1/display/input/click-at` | Move cursor and click |
| `drag` | POST | `/api/v1/display/input/drag` | Drag from one position to another |
| `reset` | POST | `/api/v1/display/input/reset` | Emergency release all inputs |
| `select` | POST | `/api/v1/display/input/select` | Select a range via click + shift-click |
| `type` | POST | `/api/v1/display/input/type-at` | Move, click, and type in one operation |
| `wait` | POST | `/api/v1/display/input/wait` | Wait for a duration with optional screenshot |

### `client.display.keyboard`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `down` | POST | `/api/v1/display/keyboard/key-down` | Hold a key down |
| `press` | POST | `/api/v1/display/keyboard/key` | Press key combinations |
| `type` | POST | `/api/v1/display/keyboard/type` | Type a string of text |
| `up` | POST | `/api/v1/display/keyboard/key-up` | Release a held key |

### `client.display.kit`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getHealth` | GET | `/api/v1/display/health` | Service health check |

### `client.display.mouse`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `click` | POST | `/api/v1/display/mouse/click` | Click a mouse button |
| `doubleClick` | POST | `/api/v1/display/mouse/double-click` | Double-click a mouse button |
| `down` | POST | `/api/v1/display/mouse/down` | Press and hold a mouse button |
| `getPosition` | GET | `/api/v1/display/mouse/location` | Get cursor position |
| `move` | POST | `/api/v1/display/mouse/move` | Move cursor to absolute position |
| `moveBy` | POST | `/api/v1/display/mouse/move-relative` | Move cursor by offset |
| `scroll` | POST | `/api/v1/display/mouse/scroll` | Scroll in a direction |
| `up` | POST | `/api/v1/display/mouse/up` | Release a mouse button |

### `client.display.screenshots`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `capture` | GET | `/api/v1/display/screenshot` | Capture a new screenshot |
| `get` | GET | `/api/v1/display/screenshot/{timestamp}` | Retrieve a specific screenshot by timestamp |
| `getLatest` | GET | `/api/v1/display/screenshot/last` | Retrieve the most recent screenshot |
| `list` | GET | `/api/v1/display/screenshots` | List all available screenshots |

### `client.display.thumbnails`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `capture` | GET | `/api/v1/display/thumbnail` | Capture a new screenshot thumbnail |
| `get` | GET | `/api/v1/display/thumbnail/{timestamp}` | Retrieve a specific thumbnail by timestamp |
| `getLatest` | GET | `/api/v1/display/thumbnail/last` | Retrieve the most recent thumbnail |

### `client.display.windows`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `close` | POST | `/api/v1/display/window/close` | Close a window |
| `focus` | POST | `/api/v1/display/window/focus` | Focus/activate a window |
| `get` | GET | `/api/v1/display/window/{windowId}/properties` | Get extended properties for a window |
| `getActive` | GET | `/api/v1/display/window/active` | Get the active window ID |
| `getGeometry` | GET | `/api/v1/display/window/{windowId}/geometry` | Get window position and size |
| `getTitle` | GET | `/api/v1/display/window/{windowId}/name` | Get window title |
| `list` | GET | `/api/v1/display/windows` | List windows on the current display |
| `minimize` | POST | `/api/v1/display/window/minimize` | Minimize a window |
| `move` | POST | `/api/v1/display/window/move` | Move a window |
| `raise` | POST | `/api/v1/display/window/raise` | Raise a window to the top |
| `resize` | POST | `/api/v1/display/window/resize` | Resize a window |
| `restore` | POST | `/api/v1/display/window/restore` | Restore (un-minimize) a window |
| `search` | POST | `/api/v1/display/window/search` | Search for windows by pattern |
| `wait` | POST | `/api/v1/display/input/wait-until` | Wait for a window to appear or disappear |

## `egress` (5 methods)

### `client.egress.kit`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getHealth` | GET | `/api/v1/egress/health` | Service health check |

### `client.egress.upstream`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `disable` | DELETE | `/api/v1/egress/upstream` | Disable upstream |
| `get` | GET | `/api/v1/egress/upstream` | Get upstream status |
| `renewLease` | POST | `/api/v1/egress/upstream/renew` | Renew the upstream lease |
| `set` | PUT | `/api/v1/egress/upstream` | Set upstream |

## `exec` (68 methods)

### `client.exec.cache`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `clear` | POST | `/api/v1/exec/cache/clear` | Clear Cache |

### `client.exec`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `run` | GET | `/{path}` | Run a user script with any HTTP method (GET by default), a query, a body and headers |

### `client.exec.kit`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getHealth` | GET | `/api/v1/exec/health` | Health Check |
| `getMetrics` | GET | `/api/v1/exec/monitor/metrics` | Prometheus Export |
| `getStats` | GET | `/api/v1/exec/monitor/stats` | Get Stats |
| `getStatus` | GET | `/api/v1/exec/system/restart-status` | Get Restart Status |
| `listRequests` | GET | `/api/v1/exec/monitor/active-requests` | Get Active Requests |
| `restart` | POST | `/api/v1/exec/system/restart` | Restart Server |

### `client.exec.logs`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `clear` | DELETE | `/api/v1/exec/logs/clear` | Clear Logs |
| `get` | POST | `/api/v1/exec/logs/read` | Read Log |
| `list` | GET | `/api/v1/exec/logs/list` | List Logs |
| `search` | POST | `/api/v1/exec/logs/search` | Search Logs |
| `stream` | GET | `/api/v1/exec/logs/stream` | Stream Logs |

### `client.exec.magicComments`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/exec/magic-comments/read` | Read Magic Comments |
| `getSchema` | GET | `/api/v1/exec/magic-comments/schema` | Get Magic Comments Schema |
| `update` | PUT | `/api/v1/exec/magic-comments/update` | Update Magic Comments Handler |
| `updateMany` | POST | `/api/v1/exec/magic-comments/bulk-update` | Bulk Update Magic Comments |
| `validate` | POST | `/api/v1/exec/validate/magic-comments` | Validate Magic Comments |

### `client.exec.modules`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `install` | POST | `/api/v1/exec/dependencies/install` | Install Dependencies |
| `listBundled` | GET | `/api/v1/exec/dependencies/bundled` | List Bundled Dependencies |
| `test` | POST | `/api/v1/exec/dependencies/check` | Check Dependencies |

### `client.exec.namespaces`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `list` | GET | `/api/v1/exec/list` | List All Exec Ids |

### `client.exec.openapi`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `generate` | POST | `/api/v1/exec/user-openapi/generate` | Generate User OpenAPI |
| `get` | GET | `/api/v1/exec/user-openapi/spec` | Serve Generated Spec |
| `getSchema` | GET | `/api/v1/exec/user-openapi/schema` | Serve Schema File |
| `listScripts` | GET | `/api/v1/exec/user-openapi/list` | List User Scripts |
| `merge` | POST | `/api/v1/exec/user-openapi/merge` | Merge OpenAPI Specs |
| `validateSchema` | POST | `/api/v1/exec/user-openapi/validate` | Validate User Schema |

### `client.exec.packages`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `compare` | POST | `/api/v1/exec/package/compare` | Compare Packages |
| `createManifest` | POST | `/api/v1/exec/package/init` | Init package.json |
| `getManifest` | GET | `/api/v1/exec/package/read` | Read package.json |
| `install` | POST | `/api/v1/exec/package/install` | Install Packages |
| `pin` | POST | `/api/v1/exec/package/pin` | Pin Versions |
| `updateManifest` | POST | `/api/v1/exec/package/update` | Update package.json |

### `client.exec.routes`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `list` | POST | `/api/v1/exec/route/discover` | Discover Routes |
| `resolve` | POST | `/api/v1/exec/route/resolve` | Resolve Route |
| `test` | POST | `/api/v1/exec/route/test` | Test Route |

### `client.exec.schedules`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `list` | GET | `/api/v1/exec/schedules/list` | List Schedules |
| `listHistory` | GET | `/api/v1/exec/schedules/history` | Schedule History |
| `reload` | POST | `/api/v1/exec/schedules/reload` | Reload Schedules |
| `run` | POST | `/api/v1/exec/schedules/trigger` | Trigger Schedule |

### `client.exec.scripts`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `delete` | DELETE | `/api/v1/exec/scripts/delete` | Delete Script |
| `getStats` | POST | `/api/v1/exec/monitor/script-performance` | Get Script Performance |
| `getTree` | POST | `/api/v1/exec/scripts/tree` | Get Script Tree |
| `list` | GET | `/api/v1/exec/scripts/list` | List Scripts |
| `listStats` | GET | `/api/v1/exec/monitor/scripts` | List Monitor Scripts |
| `move` | POST | `/api/v1/exec/scripts/move` | Move Script |
| `read` | GET | `/api/v1/exec/scripts/read` | Read Script |
| `validate` | POST | `/api/v1/exec/validate/script` | Validate Script |
| `validateDependencies` | POST | `/api/v1/exec/validate/dependencies` | Validate Dependencies |
| `validateReturnType` | POST | `/api/v1/exec/validate/return-type` | Validate Return Type |
| `validateSyntax` | POST | `/api/v1/exec/validate/syntax` | Validate Syntax |
| `validateTypes` | POST | `/api/v1/exec/validate/typescript` | Validate TypeScript |
| `write` | POST | `/api/v1/exec/scripts/write` | Write Script |

### `client.exec.sdkTypes`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `list` | GET | `/api/v1/exec/sdk-types` | Get Sdk Types |

### `client.exec.sdks`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `delete` | DELETE | `/api/v1/exec/sdk/{id}` | Delete SDK |
| `get` | GET | `/api/v1/exec/sdk/{id}` | Get SDK |
| `import` | POST | `/api/v1/exec/sdk/import` | Import SDK |
| `list` | GET | `/api/v1/exec/sdk/list` | List SDKs |

### `client.exec.store`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `clear` | POST | `/api/v1/exec/shared-state/clear` | Clear Shared State |
| `get` | POST | `/api/v1/exec/shared-state/get` | Get Shared State |
| `set` | POST | `/api/v1/exec/shared-state/set` | Set Shared State |

### `client.exec.templates`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/exec/templates/create-custom` | Create Custom Template |
| `delete` | DELETE | `/api/v1/exec/templates/delete-custom/{name}` | Delete Custom Template |
| `generate` | POST | `/api/v1/exec/templates/generate` | Generate From Template |
| `list` | GET | `/api/v1/exec/templates/list` | List Templates |
| `preview` | GET | `/api/v1/exec/templates/preview` | Preview Template |
| `update` | PUT | `/api/v1/exec/templates/update-custom/{name}` | Update Custom Template |

## `files` (120 methods)

### `client.files.archives`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `extract` | GET | `/{archive}?extract` | Extract archive |
| `extractMember` | GET | `/{archive}?extract_file` | Extract file from archive |
| `preview` | GET | `/{archive}?preview` | Preview archive contents or read file |
| `readMember` | GET | `/{archive}?view_file` | View file from archive |

### `client.files.backends`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `createAzureblob` | POST | `/api/v1/backends/azureblob` | Connect to azureblob backend |
| `createAzurefiles` | POST | `/api/v1/backends/azurefiles` | Connect to azurefiles backend |
| `createB2` | POST | `/api/v1/backends/b2` | Connect to b2 backend |
| `createBox` | POST | `/api/v1/backends/box` | Connect to box backend |
| `createCloudinary` | POST | `/api/v1/backends/cloudinary` | Connect to cloudinary backend |
| `createDrive` | POST | `/api/v1/backends/drive` | Connect to drive backend |
| `createDropbox` | POST | `/api/v1/backends/dropbox` | Connect to dropbox backend |
| `createFichier` | POST | `/api/v1/backends/fichier` | Connect to fichier backend |
| `createFilefabric` | POST | `/api/v1/backends/filefabric` | Connect to filefabric backend |
| `createFilescom` | POST | `/api/v1/backends/filescom` | Connect to filescom backend |
| `createFtp` | POST | `/api/v1/backends/ftp` | Connect to ftp backend |
| `createGofile` | POST | `/api/v1/backends/gofile` | Connect to gofile backend |
| `createGoogleCloudStorage` | POST | `/api/v1/backends/google-cloud-storage` | Connect to google cloud storage backend |
| `createGooglePhotos` | POST | `/api/v1/backends/google-photos` | Connect to google photos backend |
| `createHdfs` | POST | `/api/v1/backends/hdfs` | Connect to hdfs backend |
| `createHidrive` | POST | `/api/v1/backends/hidrive` | Connect to hidrive backend |
| `createHttp` | POST | `/api/v1/backends/http` | Connect to http backend |
| `createIclouddrive` | POST | `/api/v1/backends/iclouddrive` | Connect to iclouddrive backend |
| `createImagekit` | POST | `/api/v1/backends/imagekit` | Connect to imagekit backend |
| `createInternetarchive` | POST | `/api/v1/backends/internetarchive` | Connect to internetarchive backend |
| `createJottacloud` | POST | `/api/v1/backends/jottacloud` | Connect to jottacloud backend |
| `createKoofr` | POST | `/api/v1/backends/koofr` | Connect to koofr backend |
| `createLinkbox` | POST | `/api/v1/backends/linkbox` | Connect to linkbox backend |
| `createMailru` | POST | `/api/v1/backends/mailru` | Connect to mailru backend |
| `createMega` | POST | `/api/v1/backends/mega` | Connect to mega backend |
| `createNetstorage` | POST | `/api/v1/backends/netstorage` | Connect to netstorage backend |
| `createOnedrive` | POST | `/api/v1/backends/onedrive` | Connect to onedrive backend |
| `createOpendrive` | POST | `/api/v1/backends/opendrive` | Connect to opendrive backend |
| `createOracleobjectstorage` | POST | `/api/v1/backends/oracleobjectstorage` | Connect to oracleobjectstorage backend |
| `createPcloud` | POST | `/api/v1/backends/pcloud` | Connect to pcloud backend |
| `createPikpak` | POST | `/api/v1/backends/pikpak` | Connect to pikpak backend |
| `createPixeldrain` | POST | `/api/v1/backends/pixeldrain` | Connect to pixeldrain backend |
| `createPremiumizeme` | POST | `/api/v1/backends/premiumizeme` | Connect to premiumizeme backend |
| `createProtondrive` | POST | `/api/v1/backends/protondrive` | Connect to protondrive backend |
| `createPutio` | POST | `/api/v1/backends/putio` | Connect to putio backend |
| `createQingstor` | POST | `/api/v1/backends/qingstor` | Connect to qingstor backend |
| `createQuatrix` | POST | `/api/v1/backends/quatrix` | Connect to quatrix backend |
| `createS3` | POST | `/api/v1/backends/s3` | Connect to s3 backend |
| `createSeafile` | POST | `/api/v1/backends/seafile` | Connect to seafile backend |
| `createSftp` | POST | `/api/v1/backends/sftp` | Connect to sftp backend |
| `createSharefile` | POST | `/api/v1/backends/sharefile` | Connect to sharefile backend |
| `createSia` | POST | `/api/v1/backends/sia` | Connect to sia backend |
| `createSmb` | POST | `/api/v1/backends/smb` | Connect to smb backend |
| `createSugarsync` | POST | `/api/v1/backends/sugarsync` | Connect to sugarsync backend |
| `createSwift` | POST | `/api/v1/backends/swift` | Connect to swift backend |
| `createUlozto` | POST | `/api/v1/backends/ulozto` | Connect to ulozto backend |
| `createWebdav` | POST | `/api/v1/backends/webdav` | Connect to webdav backend |
| `createYandex` | POST | `/api/v1/backends/yandex` | Connect to yandex backend |
| `createZoho` | POST | `/api/v1/backends/zoho` | Connect to zoho backend |
| `delete` | DELETE | `/api/v1/backends/{id}` | Disconnect backend |
| `get` | GET | `/api/v1/backends/{id}` | Get backend details |
| `list` | GET | `/api/v1/backends` | List all backends |
| `test` | GET | `/api/v1/backends/{id}/test` | Test backend connection |
| `update` | PUT | `/api/v1/backends/{id}` | Update backend credentials |

### `client.files.downloads`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `cancel` | DELETE | `/api/v1/downloads/{id}` | Cancel a running download |
| `create` | GET | `/{directory}?download` | Download file from remote URL |
| `list` | GET | `/api/v1/downloads` | List active downloads |
| `listByDirectory` | GET | `/{directory}?downloads` | List active downloads |
| `listHistory` | GET | `/?download_history` | Download history |

### `client.files.extractions`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `cancel` | DELETE | `/api/v1/extractions/{id}` | Cancel a running extraction |
| `list` | GET | `/api/v1/extractions` | List active extractions |
| `listByDirectory` | GET | `/?extractions` | List active extractions |
| `listHistory` | GET | `/?extraction_history` | Extraction history |

### `client.files`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `append` | PUT | `/api/v1/files/append/{path}` | Append data to file |
| `chmod` | PATCH | `/api/v1/files/chmod/{path}` | Change file permissions |
| `chown` | PATCH | `/api/v1/files/chown/{path}` | Change file ownership |
| `copy` | POST | `/api/v1/files/copy/{path}` | Copy file or directory |
| `delete` | DELETE | `/api/v1/files/{path}` | Delete file or directory |
| `exists` | HEAD | `/{path}` | Get file metadata |
| `get` | GET | `/api/v1/files/{path}` | List directory or download file |
| `glob` | GET | `/api/v1/files/glob/{path}` | Find files by glob pattern |
| `grep` | GET | `/api/v1/files/grep/{path}` | Search file contents (grep) |
| `logout` | LOGOUT | `/{path}` | Clear authentication |
| `mkdir` | POST | `/api/v1/files/{path}` | File operations (mkdir, extract, download, move, copy) |
| `move` | POST | `/api/v1/files/move/{path}` | Move file or directory |
| `realpath` | GET | `/api/v1/files/realpath/{path}` | Resolve canonical path (realpath) |
| `search` | GET | `/{directory}?q` | Search directory |
| `stat` | GET | `/api/v1/files/stat/{path}` | Get file metadata (stat) |
| `touch` | PUT | `/{path}?touch` | Touch file (create or update mtime) |
| `update` | PATCH | `/api/v1/files/{path}` | Modify file properties or move/rename |
| `upload` | PUT | `/api/v1/files/{path}` | Upload or append file |
| `whoami` | CHECKAUTH | `/{path}` | Check authentication status |
| `writeChunk` | PATCH | `/{path}` | File operations |
| `zip` | GET | `/{directory}?zip` | Download directory as ZIP |

### `client.files.ftp`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/{path}?type=ftp` | Access file via FTP |

### `client.files.images`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `convert` | GET | `/{image}?thumbnail` | Process and convert images |

### `client.files.journal`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `flush` | POST | `/api/v1/journal/flush` | Flush journal to disk |
| `getStats` | GET | `/api/v1/journal/stats` | Get journal statistics |
| `list` | GET | `/api/v1/journal` | Query journal entries |

### `client.files.kit`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getHealth` | GET | `/api/v1/files/health` | Service health check |
| `getVersion` | GET | `/api/v1/version` | Get API version |

### `client.files.mounts`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/mounts` | Create persistent FUSE mount |
| `delete` | DELETE | `/api/v1/mounts/{id}` | Unmount filesystem |
| `get` | GET | `/api/v1/mounts/{id}` | Get mount details |
| `list` | GET | `/api/v1/mounts` | List all mounts |
| `update` | PATCH | `/api/v1/mounts/{id}` | Update mount VFS configuration |

### `client.files.s3`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/{path}?type=s3` | Access file from S3 |

### `client.files.ssh`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/{path}?type=ssh` | Access file via SSH/SFTP |
| `upload` | PUT | `/{path}?type=ssh` | Upload file via SSH/SFTP |

### `client.files.ui`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getPage` | GET | `/{path}` | List directory contents or download file |

### `client.files.uploads`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `delete` | DELETE | `/api/v1/pending-uploads/{id}` | Discard a pending upload |
| `deleteUnreadable` | DELETE | `/api/v1/pending-uploads/unreadable/{id}` | Delete an unreadable pending upload |
| `deliver` | POST | `/api/v1/pending-uploads/{id}/deliver` | Deliver a pending upload |
| `download` | GET | `/api/v1/pending-uploads/{id}/file` | Download a held file |
| `list` | GET | `/api/v1/pending-uploads` | List pending uploads |
| `listFiles` | GET | `/api/v1/pending-uploads/{id}/files` | List a pending upload's files |
| `listUnreadable` | GET | `/api/v1/pending-uploads/unreadable` | List unreadable pending uploads |
| `stop` | POST | `/api/v1/pending-uploads/{id}/stop` | Stop a running upload |

### `client.files.webdav`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `copy` | COPY | `/{path}` | Copy a file |
| `get` | GET | `/{path}?type=webdav` | Access file via WebDAV |
| `getOptions` | OPTIONS | `/{path}` | Get allowed methods |
| `getProperties` | PROPFIND | `/{path}` | Get WebDAV properties |
| `lock` | LOCK | `/{path}` | Lock file (WebDAV compatibility) |
| `move` | MOVE | `/{path}` | Move or rename file/directory |
| `unlock` | UNLOCK | `/{path}` | Unlock file (WebDAV compatibility) |
| `updateProperties` | PROPPATCH | `/{path}` | Update WebDAV properties |

## `notes` (74 methods)

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
| `setRole` | PATCH | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}` | Update collaborator role |

### `client.notes.comments`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments` | Create a comment |
| `delete` | DELETE | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}` | Delete a comment |
| `list` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments` | List comments |
| `listAll` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments` | List comments (collect all pages) |
| `listAnchors` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors` | List comment anchors |
| `listAnchorsAll` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors` | List comment anchors (collect all pages) |
| `listAnchorsIterator` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors` | List comment anchors (async iterator) |
| `listIterator` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments` | List comments (async iterator) |
| `resolve` | POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/resolve` | Resolve a comment |
| `setAnchor` | POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/reanchor` | Re-anchor a comment thread |
| `update` | PATCH | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}` | Edit a comment |

### `client.notes.document`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `append` | POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` | Append blocks to a document |
| `createExportTicket` | POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/export-ticket` | Create secure HTML export ticket |
| `exportBlock` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/blocks/{blockId}/svg` | Export drawing block as SVG |
| `get` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` | Get document content |
| `set` | PUT | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` | Create or replace document |
| `update` | PATCH | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` | Merge document content |

### `client.notes.files`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `download` | GET | `/api/v1/notes/notebooks/{notebookId}/files/{fileId}` | Download a file |
| `list` | GET | `/api/v1/notes/notebooks/{notebookId}/files` | List all uploaded files |
| `listAll` | GET | `/api/v1/notes/notebooks/{notebookId}/files` | List all uploaded files (collect all pages) |
| `listIterator` | GET | `/api/v1/notes/notebooks/{notebookId}/files` | List all uploaded files (async iterator) |

### `client.notes.files.uploads`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `cancel` | DELETE | `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | Abort a TUS upload |
| `create` | POST | `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | Create a resumable (TUS) upload |
| `getOffset` | HEAD | `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | Check a TUS upload's offset (for resuming) |
| `writeChunk` | PATCH | `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | Upload a chunk to a TUS upload |

### `client.notes.kit`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getHealth` | GET | `/api/v1/notes/health` | Service health and runtime info |

### `client.notes.members`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `invite` | POST | `/api/v1/notes/notebooks/{notebookId}/users` | Invite users to notebook |
| `setRole` | PATCH | `/api/v1/notes/notebooks/{notebookId}/users/{userId}/role` | Update user role |

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
| `list` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes` | List nodes |
| `listAll` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes` | List nodes (collect all pages) |
| `listChildren` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/children` | List child nodes |
| `listChildrenAll` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/children` | List child nodes (collect all pages) |
| `listChildrenIterator` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/children` | List child nodes (async iterator) |
| `listIterator` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes` | List nodes (async iterator) |
| `markOpened` | POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/opened` | Mark node as opened |
| `markSeen` | POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/seen` | Mark node as seen |
| `resolve` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/alias/{alias}` | Resolve page by alias |
| `update` | PATCH | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}` | Update a node |

### `client.notes.notebooks`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/notes/notebooks` | Create a notebook |
| `delete` | DELETE | `/api/v1/notes/notebooks/{notebookId}` | Delete a notebook |
| `get` | GET | `/api/v1/notes/notebooks/{notebookId}` | Get notebook details |
| `list` | GET | `/api/v1/notes/notebooks` | List notebooks |
| `update` | PATCH | `/api/v1/notes/notebooks/{notebookId}` | Update notebook settings |

### `client.notes`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `whoami` | GET | `/api/v1/notes/me` | Get current identity |

### `client.notes.reactions`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `add` | POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions` | Add a reaction |
| `list` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions` | List reactions |
| `remove` | DELETE | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions/{reaction}` | Remove a reaction |

### `client.notes.records`

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

### `client.notes.sockets`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `connect` | GET | `/api/v1/notes/sockets/{socketId}` | Open a WebSocket connection |
| `create` | POST | `/api/v1/notes/sockets` | Initialize a WebSocket session |

### `client.notes.versions`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions` | Create a document version snapshot |
| `delete` | DELETE | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}` | Delete a document version |
| `get` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}` | Get a specific document version |
| `list` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions` | List document versions |
| `listAll` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions` | List document versions (collect all pages) |
| `listIterator` | GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions` | List document versions (async iterator) |
| `restore` | POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}/restore` | Restore a document version |

## `notifications` (10 methods)

### `client.notifications.icons`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/notifications/icons/{iconId}` | Get notification icon |

### `client.notifications.kit`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getHealth` | GET | `/api/v1/notifications/health` | Service health check |
| `getMetrics` | GET | `/api/v1/notifications/metrics` | Prometheus-compatible metrics endpoint |

### `client.notifications`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `connect` | GET | `/api/v1/notifications/stream` | Real-time notification stream (WebSocket or SSE) |
| `dismiss` | POST | `/api/v1/notifications/dismiss` | Dismiss notifications |
| `list` | GET | `/api/v1/notifications/{display}` | Get notifications for specified display(s) |
| `listAll` | GET | `/api/v1/notifications/{display}` | Get notifications for specified display(s) (collect all pages) |
| `listIterator` | GET | `/api/v1/notifications/{display}` | Get notifications for specified display(s) (async iterator) |
| `restore` | DELETE | `/api/v1/notifications/dismiss` | Clear dismissed notifications |
| `send` | POST | `/api/v1/notifications/notify` | Trigger a new desktop notification |

## `pipe` (6 methods)

### `client.pipe.kit`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getHealth` | GET | `/api/v1/pipe/health` | Service health check |
| `getHelp` | GET | `/api/v1/pipe/help` | Get help text with curl examples |
| `getMetrics` | GET | `/api/v1/pipe/metrics` | Service metrics (Prometheus) |

### `client.pipe`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getStatus` | GET | `/api/v1/pipe/{path}` | One snapshot of a pipe name (GET ?status): state, sender, receivers, bytes. Takes no receiver slot. |
| `receive` | GET | `/api/v1/pipe/{path}` | Receive data from a pipe |
| `send` | POST | `/api/v1/pipe/{path}` | Send data to a pipe |

## `proxyLogs` (5 methods)

### `client.proxyLogs`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getStats` | GET | `/_logs/stats` | Get log statistics |
| `list` | GET | `/_logs` | Query centralized logs |
| `listAll` | GET | `/_logs` | Query centralized logs (collect all pages) |
| `listIterator` | GET | `/_logs` | Query centralized logs (async iterator) |
| `stream` | GET | `/_logs/stream` | Live-tail logs over Server-Sent Events |

## `run` (30 methods)

### `client.run.config`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/run/config` | Get full runtime configuration |

### `client.run.jobs`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `cancel` | POST | `/api/v1/run/jobs/{job_id}/cancel` | Cancel a search job |
| `createSearch` | POST | `/api/v1/run/search/jobs` | Start an async search job |
| `get` | GET | `/api/v1/run/jobs/{job_id}` | Get job status |
| `list` | GET | `/api/v1/run/jobs` | List background jobs |

### `client.run.profiles`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/run/profiles` | Create a new profile |
| `delete` | DELETE | `/api/v1/run/profiles/{profile}` | Delete a profile |
| `list` | GET | `/api/v1/run/profiles` | List all profiles |
| `update` | PATCH | `/api/v1/run/profiles/{profile}` | Update a profile |
| `use` | POST | `/api/v1/run/profiles/{profile}/select` | Select the active profile |

### `client.run.recipes`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/run/recipes` | Create a saved recipe |
| `delete` | DELETE | `/api/v1/run/recipes/{name}` | Delete a saved recipe |
| `get` | GET | `/api/v1/run/recipes/{name}` | Get a saved recipe |
| `list` | GET | `/api/v1/run/recipes` | List saved launch recipes |
| `resolve` | POST | `/api/v1/run/recipes/{name}/run` | Run using a saved recipe |
| `search` | POST | `/api/v1/run/recipes/{name}/search` | Search using a saved recipe |
| `update` | PATCH | `/api/v1/run/recipes/{name}` | Update a saved recipe |

### `client.run`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `resolve` | POST | `/api/v1/run/resolve` | Resolve an application via JSON body |
| `resolveMany` | POST | `/api/v1/run/batch` | Execute a batch of search or run requests |
| `search` | POST | `/api/v1/run/search/paged` | Search for app candidates with cursor pagination |
| `searchAll` | POST | `/api/v1/run/search/paged` | Search for app candidates with cursor pagination (collect all pages) |
| `searchIterator` | POST | `/api/v1/run/search/paged` | Search for app candidates with cursor pagination (async iterator) |
| `test` | POST | `/api/v1/run/preflight` | Preflight a run request |

### `client.run.sources`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/run/sources` | Create a new package source |
| `delete` | DELETE | `/api/v1/run/sources/{source_id}` | Delete a package source |
| `getDiagnostics` | GET | `/api/v1/run/sources/{source_id}/diagnostics` | Get runtime diagnostics for a source |
| `list` | GET | `/api/v1/run/sources` | List all package sources |
| `sync` | POST | `/api/v1/run/sources/{source_id}/sync` | Sync a single source |
| `syncAll` | POST | `/api/v1/run/sources/sync` | Sync all sources |
| `update` | PATCH | `/api/v1/run/sources/{source_id}` | Update a package source |

## `sqlite` (42 methods)

### `client.sqlite.databases`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/sqlite/db/create` | Create new SQLite database |
| `delete` | DELETE | `/api/v1/sqlite/db` | Delete SQLite database |
| `list` | GET | `/api/v1/sqlite/db/list` | List databases in a directory |
| `runMaintenance` | POST | `/api/v1/sqlite/maintenance` | Run a database maintenance operation |

### `client.sqlite.history`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `clear` | DELETE | `/api/v1/sqlite/history` | Clear query history |
| `delete` | DELETE | `/api/v1/sqlite/history/{index}` | Delete history entry |
| `getStats` | GET | `/api/v1/sqlite/history/stats` | Get history statistics |
| `list` | GET | `/api/v1/sqlite/history` | Get query history |
| `listAll` | GET | `/api/v1/sqlite/history` | Get query history (collect all pages) |
| `listIterator` | GET | `/api/v1/sqlite/history` | Get query history (async iterator) |

### `client.sqlite.kit`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getCacheStats` | GET | `/api/v1/sqlite/health/cache` | Cache health snapshot |
| `getHealth` | GET | `/api/v1/sqlite/health` | Health check |

### `client.sqlite.kv`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `clearTtl` | POST | `/api/v1/sqlite/kv/{key}/persist` | Remove a key's TTL |
| `compareTableSnapshots` | GET | `/api/v1/sqlite/kv/diff` | Compare table snapshots |
| `decrement` | POST | `/api/v1/sqlite/kv/{key}/decr` | Atomic decrement |
| `delete` | DELETE | `/api/v1/sqlite/kv/{key}` | Delete key |
| `deleteMany` | POST | `/api/v1/sqlite/kv/batch/delete` | Batch delete multiple keys |
| `exists` | HEAD | `/api/v1/sqlite/kv/{key}` | Check if key exists |
| `get` | GET | `/api/v1/sqlite/kv/{key}` | Get value by key |
| `getEntry` | GET | `/api/v1/sqlite/kv/{key}/entry` | Get a key's entry |
| `getMany` | POST | `/api/v1/sqlite/kv/batch/get` | Batch get multiple keys |
| `getSnapshot` | GET | `/api/v1/sqlite/kv/{key}/snapshot` | Get key snapshot at operation |
| `getTableSnapshot` | GET | `/api/v1/sqlite/kv/snapshot` | Get table snapshot at timestamp |
| `increment` | POST | `/api/v1/sqlite/kv/{key}/incr` | Atomic increment |
| `list` | GET | `/api/v1/sqlite/kv` | List keys |
| `listAll` | GET | `/api/v1/sqlite/kv` | List keys (collect all pages) |
| `listChanges` | GET | `/api/v1/sqlite/changes` | List the changes of a KV table |
| `listChangesAll` | GET | `/api/v1/sqlite/changes` | List the changes of a KV table (collect all pages) |
| `listChangesIterator` | GET | `/api/v1/sqlite/changes` | List the changes of a KV table (async iterator) |
| `listHistory` | GET | `/api/v1/sqlite/kv/{key}/history` | Get key operation history |
| `listIterator` | GET | `/api/v1/sqlite/kv` | List keys (async iterator) |
| `pop` | POST | `/api/v1/sqlite/kv/{key}/pop` | Remove from array end |
| `push` | POST | `/api/v1/sqlite/kv/{key}/push` | Append to array |
| `remove` | POST | `/api/v1/sqlite/kv/{key}/remove` | Remove array element |
| `rollback` | POST | `/api/v1/sqlite/kv/{key}/rollback` | Rollback key operations |
| `rollbackTable` | POST | `/api/v1/sqlite/kv/rollback` | Rollback entire table |
| `set` | PUT | `/api/v1/sqlite/kv/{key}` | Set value for key |
| `setMany` | POST | `/api/v1/sqlite/kv/batch/set` | Batch set multiple keys |
| `setTtl` | POST | `/api/v1/sqlite/kv/{key}/expire` | Set a key's TTL |
| `streamChanges` | GET | `/api/v1/sqlite/changes/stream` | Stream the changes of a KV table |

### `client.sqlite.sql`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `queryReadOnly` | GET | `/api/v1/sqlite/query` | Execute shareable SQL query |
| `runTransaction` | POST | `/api/v1/sqlite/db` | Execute SQL transaction |

## `terminal` (38 methods)

### `client.terminal.automation`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getStats` | GET | `/api/v1/terminal/automation/metrics` | Get terminal automation metrics |

### `client.terminal.commands`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `cancel` | POST | `/api/v1/terminal/execute/{command_id}/abort` | Abort a running command |
| `get` | GET | `/api/v1/terminal/result/{command_id}` | Get command result |
| `list` | GET | `/api/v1/terminal/history/{terminal_id}` | Get terminal command history |
| `run` | POST | `/api/v1/terminal/execute` | Execute command in terminal session |

### `client.terminal.drops`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `commit` | POST | `/api/v1/terminal/drop-commit` | Finalize a drop and inject the OSC frame |
| `create` | POST | `/api/v1/terminal/drop-begin` | Begin a drag-and-drop staging transaction |
| `send` | POST | `/api/v1/terminal/drop` | One-shot drop (begin + stage + commit) |
| `writeChunk` | POST | `/api/v1/terminal/upload` | Upload a raw file slice into a drop |

### `client.terminal.keys`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `list` | GET | `/api/v1/terminal/keys` | List supported key names for /press endpoint |

### `client.terminal.kit`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getHealth` | GET | `/api/v1/terminal/health` | Service health check |

### `client.terminal.processes`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `get` | GET | `/api/v1/system/processes/{pid}` | Get process details by PID |
| `list` | GET | `/api/v1/system/processes` | List all system processes |
| `pause` | POST | `/api/v1/system/processes/freeze` | Freeze (SIGSTOP) a process or process tree |
| `resume` | POST | `/api/v1/system/processes/unfreeze` | Unfreeze (SIGCONT) a process or process tree |
| `signal` | POST | `/api/v1/system/process/signal` | Send signal to process(es) |

### `client.terminal.sessions`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `captureScreenshot` | GET | `/api/v1/terminal/screenshot` | Capture terminal screenshot |
| `connect` | GET | `/api/v1/terminal/ws` | WebSocket terminal connection |
| `create` | POST | `/api/v1/terminal/create` | Create a terminal session |
| `delete` | DELETE | `/api/v1/terminal/{terminal_id}` | Delete a terminal session |
| `getAutomationStatus` | GET | `/api/v1/terminal/{terminal_id}/automation` | Get per-session automation state |
| `getSnapshot` | GET | `/api/v1/terminal/snapshot` | Get rendered terminal snapshot |
| `list` | GET | `/api/v1/terminal/sessions` | List all terminal sessions |
| `paste` | POST | `/api/v1/terminal/paste` | Paste text into terminal |
| `pressKeys` | POST | `/api/v1/terminal/press` | Send named key presses to terminal |
| `read` | GET | `/api/v1/terminal/raw` | Get raw terminal output |
| `reportDiagnostics` | POST | `/api/v1/terminal/state` | Client render/connection diagnostics beacon |
| `search` | GET | `/api/v1/terminal/find` | Search terminal screen with regex |
| `sendMouseEvents` | POST | `/api/v1/terminal/mouse` | Send cell-based mouse events to terminal |
| `wait` | POST | `/api/v1/terminal/wait` | Wait for terminal condition |
| `write` | POST | `/api/v1/terminal/write` | Write input to terminal |

### `client.terminal.system`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getStats` | GET | `/api/v1/system/resources` | Get system resources and statistics |
| `listDaemonPrograms` | GET | `/api/v1/system/daemon` | Get daemon programs configuration |
| `listDisplays` | GET | `/api/v1/system/displays` | Get display information |
| `listPorts` | GET | `/api/v1/system/ports` | List all listening network ports |
| `reboot` | POST | `/api/v1/system/reboot` | Reboot the system |
| `shutdown` | POST | `/api/v1/system/shutdown` | Shutdown the system |
| `stopDisplay` | POST | `/api/v1/system/displays/{display}/stop` | Stop a display |

## `tunnel` (6 methods)

### `client.tunnel.bindings`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `list` | GET | `/api/v1/tunnel/bindings` | List active bindings across all sessions |

### `client.tunnel.kit`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getHealth` | GET | `/api/v1/tunnel/health` | Kit health |
| `getMetrics` | GET | `/api/v1/tunnel/metrics` | Prometheus metrics |

### `client.tunnel.sessions`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `close` | DELETE | `/api/v1/tunnel/sessions/{session_id}` | Terminate an active tunnel session |
| `list` | GET | `/api/v1/tunnel/sessions` | List active tunnel sessions |

### `client.tunnel`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `list` | GET | `/api/v1/tunnel/tunnels` | List all active tunnels (combined sessions + bindings) |

## `watch` (13 methods)

### `client.watch.events`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `connect` | GET | `/api/v1/watch/watchers/{id}/events/ws` | Stream Watcher Events Ws |
| `list` | GET | `/api/v1/watch/watchers/{id}/events` | List Watcher Events |
| `listAll` | GET | `/api/v1/watch/watchers/{id}/events` | List Watcher Events (collect all pages) |
| `listIterator` | GET | `/api/v1/watch/watchers/{id}/events` | List Watcher Events (async iterator) |
| `stream` | GET | `/api/v1/watch/watchers/{id}/events/sse` | Stream Watcher Events Sse |

### `client.watch.kit`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `getHealth` | GET | `/api/v1/watch/health` | Health Check |

### `client.watch.watchers`

| Method | HTTP | Path | Summary |
|--------|------|------|---------|
| `create` | POST | `/api/v1/watch/watchers` | Create Watcher |
| `delete` | DELETE | `/api/v1/watch/watchers/{id}` | Delete Watcher |
| `get` | GET | `/api/v1/watch/watchers/{id}` | Get Watcher |
| `list` | GET | `/api/v1/watch/watchers` | List Watchers |
| `listAll` | GET | `/api/v1/watch/watchers` | List Watchers (collect all pages) |
| `listIterator` | GET | `/api/v1/watch/watchers` | List Watchers (async iterator) |
| `update` | PATCH | `/api/v1/watch/watchers/{id}` | Reconfigure a live watcher in place. Omitted fields keep their current values. The watcher keeps its id, replay history (so since_id / since_timestamp cursors stay valid) and its connected SSE/WebSocket clients; only the file-system backend is replaced. The new backend starts before the old one stops, and events the old backend had already queued are processed before the handoff completes. So a change under a path watched by both configurations is not lost across the swap (one landing inside that window may be reported twice), and a change under a path only the old configuration watched is delivered if the old backend saw it before stopping. The drain is bounded: if the old backend has not finished within 5 seconds (a backstop against a wedged backend), the handoff completes anyway and events still queued in the old backend at that point are dropped, with a warning in the service log. A request that fails leaves the watcher unchanged. A body with no field is refused with 400 `INVALID_REQUEST`; a body whose fields all equal the current values returns the watcher as it is, without replacing the backend. |

## Hand-written client helpers

These methods live on `HoodyClient` directly (not under a namespace).
They exist because they wrap auth flows, build kit URLs, or expose
static catalog data that has no OpenAPI operation.

| Method | Kind | Summary |
|--------|------|---------|
| `HoodyClient.login(baseURL, credentials)` | static | Login helper: logs in with credentials and returns an authenticated HoodyClient. An account with 2FA rejects with `TwoFactorRequiredError`: `await error.complete(code)` finishes the login (the underlying call is `client.api.auth.twoFactor.verify()`). |
| `HoodyClient.listKits(options?)` | static | Static catalog of all Hoody kit services (terminal, files, code, …) with metadata. |
| `HoodyClient.listDesktopEnvironments()` | static | List of known desktop environment identifiers acceptable to getDesktopUrl(). |
| `client.listKits(options?)` | instance | Instance form of HoodyClient.listKits — convenience accessor. |
| `client.listDesktopEnvironments()` | instance | Instance form of HoodyClient.listDesktopEnvironments. |
| `client.getDesktopUrl(container, options?)` | instance | Build a desktop-{N} URL for a container; the public alias 302s to display once X is ready. |
| `client.withContainer(containerOrId, options?)` | instance | Scope a client to a specific container (applies templateVars + kit routing). |
| `client.withRealm(realmId?)` | instance | Scope a client to a specific realm subdomain. |


---

*Auto-generated by `generate-reference.ts`. Do not edit manually.*
