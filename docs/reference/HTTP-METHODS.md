# Hoody API — HTTP Endpoint Reference

**Version:** 1.0.0-beta.17
**Total endpoints:** 1039
**Namespaces:** 21

Every HTTP endpoint on the public Hoody API, paired with the typed SDK method
and the CLI command that call it — the CLI ⇄ SDK ⇄ HTTP map in one place.
Grouped by SDK namespace, sorted by path.

> One row per HTTP `method + path`. SDK pagination helpers (`listAll` /
> `listIterator`) share an endpoint with their base `list` method and are not
> repeated. A `—` in the CLI column means the endpoint has no first-class CLI
> command. See [SDK-METHODS.md](SDK-METHODS.md) for full SDK signatures and
> [CLI-COMMANDS.md](CLI-COMMANDS.md) for CLI flags.

---

## `agent` — 262 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/agent/acp/agents` | `agent.acp.getStatus` | `hoody agent acp status` | Get BYOA ACP backend status. |
| PUT | `/api/v1/agent/acp/agents/{agent}/enabled` | `agent.acp.enable` | `hoody agent acp enable` | Enable or disable a BYOA ACP backend. |
| PUT | `/api/v1/agent/acp/agents/{agent}/model` | `agent.acp.setModel` | `hoody agent acp model set` | Set a BYOA backend's default model and effort. |
| PUT | `/api/v1/agent/acp/agents/{agent}/secrets/{key}` | `agent.acp.setSecret` | `hoody agent acp secrets set` | Store an ACP per-agent secret value. |
| GET | `/api/v1/agent/agent-files` | `agent.files.list` | `hoody agent files list` | List the files that shape the agents. |
| GET | `/api/v1/agent/agents` | `agent.definitions.list` | `hoody agent definitions list` | List chat-agent definitions. |
| POST | `/api/v1/agent/agents` | `agent.definitions.create` | `hoody agent definitions create` | Create a chat-agent definition. |
| DELETE | `/api/v1/agent/agents/{name}` | `agent.definitions.delete` | `hoody agent definitions delete` | Delete a custom chat agent. |
| POST | `/api/v1/agent/agents/{name}/copy` | `agent.definitions.copy` | `hoody agent definitions copy` | Copy a chat agent. |
| PATCH | `/api/v1/agent/agents/{name}/model` | `agent.definitions.setModel` | `hoody agent definitions model set` | Set an agent's model. |
| POST | `/api/v1/agent/agents/{name}/rename` | `agent.definitions.rename` | `hoody agent definitions rename` | Rename a chat agent. |
| POST | `/api/v1/agent/agents/{name}/reset-to-shipped` | `agent.definitions.reset` | `hoody agent definitions reset` | Reset an agent to its shipped default. |
| GET | `/api/v1/agent/agents/{name}/source` | `agent.definitions.getSource` | `hoody agent definitions source get` | Read a chat agent's source. |
| PUT | `/api/v1/agent/agents/{name}/source` | `agent.definitions.setSource` | `hoody agent definitions source set` | Write a chat agent's source. |
| PATCH | `/api/v1/agent/agents/{name}/tools` | `agent.definitions.setTools` | `hoody agent definitions tools set` | Set an agent's tool allow-list. |
| POST | `/api/v1/agent/agents/{name}/tools/{tool}/toggle` | `agent.definitions.toggleTool` | `hoody agent definitions tools toggle` | Toggle a single tool for an agent. |
| PATCH | `/api/v1/agent/agents/{name}/turns` | `agent.definitions.setTurnLimit` | `hoody agent definitions turns limit set` | Set an agent's max-turns. |
| GET | `/api/v1/agent/bots` | `agent.bots.list` | `hoody agent bots list` | List the Bots. |
| POST | `/api/v1/agent/bots` | `agent.bots.create` | `hoody agent bots create` | Create a Bot. |
| DELETE | `/api/v1/agent/bots/{id}` | `agent.bots.delete` | `hoody agent bots delete` | Delete a Bot. |
| GET | `/api/v1/agent/bots/{id}` | `agent.bots.get` | `hoody agent bots get` | Get a Bot. |
| PATCH | `/api/v1/agent/bots/{id}` | `agent.bots.update` | `hoody agent bots update` | Change a Bot's settings. |
| GET | `/api/v1/agent/bots/{id}/archive` | `agent.bots.getArchive` | `hoody agent bots archive get` | Read a Bot's archive. |
| GET | `/api/v1/agent/bots/{id}/delegates` | `agent.bots.listDelegates` | `hoody agent bots delegates list` | List a Bot's delegates. |
| POST | `/api/v1/agent/bots/{id}/delegates/{sid}/stop` | `agent.bots.stopDelegate` | `hoody agent bots delegates stop` | Stop one of a Bot's delegates now. |
| POST | `/api/v1/agent/bots/{id}/forget` | `agent.bots.forget` | `hoody agent bots forget` | Make a Bot forget its conversation. |
| PUT | `/api/v1/agent/bots/{id}/guardrails` | `agent.bots.setGuardrails` | `hoody agent bots guardrails set` | Replace a Bot's guardrails. |
| GET | `/api/v1/agent/bots/{id}/log` | `agent.bots.getLog` | `hoody agent bots log get` | Read a Bot's log. |
| POST | `/api/v1/agent/bots/{id}/messages` | `agent.bots.sendMessage` | `hoody agent bots messages send` | Post a message to a Bot. |
| POST | `/api/v1/agent/bots/{id}/purge` | `agent.bots.purgeArchive` | `hoody agent bots archive purge` | Delete a Bot's archive. |
| POST | `/api/v1/agent/bots/{id}/reset` | `agent.bots.reset` | `hoody agent bots reset` | Give a Bot a new session. |
| GET | `/api/v1/agent/bots/{id}/stream` | `agent.bots.stream` | `hoody agent bots stream` | Follow a Bot's log (SSE). |
| GET | `/api/v1/agent/changes` | `agent.changes.get` | `hoody agent changes get` | Change tokens for the Work lists. |
| GET | `/api/v1/agent/changes/stream` | `agent.changes.stream` | — | Stream the change tokens (SSE). |
| POST | `/api/v1/agent/completions` | `agent.completions.create` | `hoody agent completions create` | Run one tool-free model completion. |
| GET | `/api/v1/agent/containers` | `agent.containers.list` | `hoody agent containers list` | List containers in a realm (for binding). |
| GET | `/api/v1/agent/gates` | `agent.gates.list` | `hoody agent gates list` | List the gates waiting for a human. |
| POST | `/api/v1/agent/github/auth/active` | `agent.github.useAccount` | `hoody agent github accounts use` | Switch the active GitHub account. |
| POST | `/api/v1/agent/github/auth/login` | `agent.github.login` | `hoody agent github auth login` | Start a GitHub device-flow login (or add a PAT). |
| POST | `/api/v1/agent/github/auth/login/poll` | `agent.github.pollLogin` | `hoody agent github auth poll` | Poll a GitHub device-flow login to completion. |
| POST | `/api/v1/agent/github/auth/logout` | `agent.github.logout` | `hoody agent github auth logout` | Remove a linked GitHub account. |
| GET | `/api/v1/agent/github/auth/status` | `agent.github.getAuth` | `hoody agent github auth status` | GitHub auth status. |
| POST | `/api/v1/agent/github/branch` | `agent.github.createBranch` | `hoody agent github branches create` | Create a branch. |
| POST | `/api/v1/agent/github/branch/delete` | `agent.github.deleteBranch` | `hoody agent github branches delete` | Force-delete a local branch. |
| POST | `/api/v1/agent/github/branch/switch` | `agent.github.useBranch` | `hoody agent github branches use` | Switch to an existing branch. |
| GET | `/api/v1/agent/github/branches` | `agent.github.listBranches` | `hoody agent github branches list` | List GitHub branches. |
| POST | `/api/v1/agent/github/clone` | `agent.github.clone` | `hoody agent github repos clone` | Clone a GitHub repository. |
| POST | `/api/v1/agent/github/commit` | `agent.github.createCommit` | `hoody agent github commits create` | Stage all and commit. |
| POST | `/api/v1/agent/github/commit/suggest-message` | `agent.github.suggestCommitMessage` | `hoody agent github commits message suggest` | Draft a commit message with a model. |
| GET | `/api/v1/agent/github/diff` | `agent.github.diff` | `hoody agent github diff` | Read the working-tree diff. |
| GET | `/api/v1/agent/github/identity` | `agent.github.resolveRepo` | `hoody agent github repos resolve` | Resolve the bound repository's owner/name. |
| GET | `/api/v1/agent/github/issues` | `agent.github.listIssues` | `hoody agent github issues list` | List issues. |
| POST | `/api/v1/agent/github/issues` | `agent.github.createIssue` | `hoody agent github issues create` | Open an issue. |
| GET | `/api/v1/agent/github/log` | `agent.github.listCommits` | `hoody agent github commits list` | Read recent commit history. |
| GET | `/api/v1/agent/github/pr` | `agent.github.listPrs` | `hoody agent github prs list` | List pull requests. |
| POST | `/api/v1/agent/github/pr` | `agent.github.createPr` | `hoody agent github prs create` | Open a pull request. |
| POST | `/api/v1/agent/github/pr/checkout` | `agent.github.checkoutPr` | `hoody agent github prs checkout` | Check out a pull request. |
| POST | `/api/v1/agent/github/pr/merge` | `agent.github.mergePr` | `hoody agent github prs merge` | Merge a pull request. |
| POST | `/api/v1/agent/github/repo/reconnect` | `agent.github.setRepoCredentials` | `hoody agent github repos credentials set` | Re-write a checkout's GitHub credential. |
| GET | `/api/v1/agent/github/repos` | `agent.github.listRepos` | `hoody agent github repos list` | List GitHub repos. |
| POST | `/api/v1/agent/github/stash` | `agent.github.pushStash` | `hoody agent github stash push` | Stash the working tree. |
| POST | `/api/v1/agent/github/stash/pop` | `agent.github.popStash` | `hoody agent github stash pop` | Restore the most recent stash entry. |
| GET | `/api/v1/agent/github/status` | `agent.github.getStatus` | `hoody agent github status` | GitHub working-tree status. |
| POST | `/api/v1/agent/github/sync` | `agent.github.sync` | `hoody agent github sync` | Sync (fetch → pull → push). |
| GET | `/api/v1/agent/github/worktrees` | `agent.github.listWorktrees` | `hoody agent github worktrees list` | List linked worktrees. |
| POST | `/api/v1/agent/github/worktrees` | `agent.github.createWorktree` | `hoody agent github worktrees create` | Add a linked worktree. |
| POST | `/api/v1/agent/github/worktrees/remove` | `agent.github.deleteWorktree` | `hoody agent github worktrees delete` | Remove a linked worktree. |
| POST | `/api/v1/agent/headless/runs` | `agent.headless.start` | — | Create a headless one-shot run. |
| GET | `/api/v1/agent/health` | `agent.kit.getHealth` | `hoody agent health` | Standardized health check. |
| POST | `/api/v1/agent/hoody/auth/bootstrap` | `agent.signIn` | — | Sign this container's agent in to the Hoody platform with a token of the box's owner. Until then the agent's shell and file tools answer "not logged in". |
| GET | `/api/v1/agent/hoody/auth/status` | `agent.whoami` | `hoody agent whoami` | Hoody platform identity and realm scope. |
| PUT | `/api/v1/agent/hoody/realm` | `agent.realms.use` | `hoody agent realms use` | Switch the agent's active realm. |
| DELETE | `/api/v1/agent/hooks` | `agent.hooks.delete` | `hoody agent hooks delete` | Delete a hook. |
| GET | `/api/v1/agent/hooks` | `agent.hooks.list` | `hoody agent hooks list` | List hooks. |
| PUT | `/api/v1/agent/hooks` | `agent.hooks.upsert` | `hoody agent hooks upsert` | Upsert a hook. |
| POST | `/api/v1/agent/hooks/begin-write` | `agent.hooks.createWriteIntent` | `hoody agent hooks intents create` | Begin a hook write (nonce). |
| POST | `/api/v1/agent/hooks/disable-all` | `agent.hooks.enableAll` | `hoody agent hooks enable` | Disable all hooks. |
| POST | `/api/v1/agent/hooks/reload` | `agent.hooks.reload` | `hoody agent hooks reload` | Reload hooks from disk. |
| GET | `/api/v1/agent/hooks/rules` | `agent.hooks.getRules` | `hoody agent hooks rules get` | Get the tool-call rules. |
| POST | `/api/v1/agent/hooks/rules` | `agent.hooks.setRules` | `hoody agent hooks rules set` | Set the tool-call rules. |
| POST | `/api/v1/agent/hooks/test` | `agent.hooks.run` | `hoody agent hooks run` | Test-fire a hook. |
| POST | `/api/v1/agent/hooks/toggle` | `agent.hooks.enable` | `hoody agent hooks enable` | Toggle a hook. |
| POST | `/api/v1/agent/hooks/trust/ack` | `agent.hooks.trust` | `hoody agent hooks trust` | Acknowledge hook trust. |
| POST | `/api/v1/agent/jev/decide` | `agent.jev.decide` | — | Ask Jev to decide. |
| GET | `/api/v1/agent/jev/models` | `agent.jev.listModels` | `hoody agent jev models list` | List the models Jev can use. |
| GET | `/api/v1/agent/jev/settings` | `agent.jev.getSettings` | `hoody agent jev settings get` | Read the Jev settings. |
| PUT | `/api/v1/agent/jev/settings` | `agent.jev.updateSettings` | `hoody agent jev settings update` | Change the Jev settings. |
| POST | `/api/v1/agent/jev/test` | `agent.jev.test` | `hoody agent jev test` | Test Jev with one tiny decision. |
| DELETE | `/api/v1/agent/jobs/{id}` | `agent.jobs.delete` | `hoody agent jobs delete` | Cancel a pending/running job, or delete a finished record. |
| GET | `/api/v1/agent/jobs/{id}` | `agent.jobs.get` | `hoody agent jobs get` | Get an async job's status. |
| GET | `/api/v1/agent/jobs/{id}/result` | `agent.jobs.getResult` | `hoody agent jobs result get` | Get an async job's result. |
| GET | `/api/v1/agent/logs` | `agent.logs.list` | `hoody agent logs list` | Query logs. |
| GET | `/api/v1/agent/logs/entries/{ref}` | `agent.logs.get` | `hoody agent logs get` | Read a log entry. |
| GET | `/api/v1/agent/logs/export` | `agent.logs.export` | `hoody agent logs export` | Export logs as a downloadable file. |
| GET | `/api/v1/agent/logs/sources` | `agent.logs.listSources` | `hoody agent logs sources list` | Log sources. |
| GET | `/api/v1/agent/logs/stats` | `agent.logs.getStats` | `hoody agent logs stats` | Log statistics. |
| GET | `/api/v1/agent/logs/stream` | `agent.logs.stream` | — | Stream the log tail (SSE). |
| GET | `/api/v1/agent/loops` | `agent.loops.list` | `hoody agent loops list` | List loops across all sessions. |
| POST | `/api/v1/agent/mcp/import` | `agent.mcp.importServers` | `hoody agent mcp import` | Import MCP servers from another tool's config. |
| POST | `/api/v1/agent/mcp/parse` | `agent.mcp.previewImport` | `hoody agent mcp preview` | Preview an MCP config import. |
| POST | `/api/v1/agent/mcp/probe` | `agent.mcp.testServer` | `hoody agent mcp test` | Probe an MCP server without saving it. |
| POST | `/api/v1/agent/mcp/reconnect` | `agent.mcp.reconnect` | `hoody agent mcp reconnect` | Reload MCP config and reconnect. |
| DELETE | `/api/v1/agent/mcp/servers` | `agent.mcp.deleteServer` | `hoody agent mcp delete` | Delete an MCP server. |
| GET | `/api/v1/agent/mcp/servers` | `agent.mcp.listServers` | `hoody agent mcp list` | List configured MCP servers. |
| PUT | `/api/v1/agent/mcp/servers` | `agent.mcp.upsertServer` | `hoody agent mcp upsert` | Create or update an MCP server. |
| POST | `/api/v1/agent/mcp/servers/enable` | `agent.mcp.enableServer` | `hoody agent mcp enable` | Enable or disable an MCP server. |
| POST | `/api/v1/agent/mcp/write-intents` | `agent.mcp.createWriteIntent` | `hoody agent mcp intents create` | Begin an MCP config write. |
| POST | `/api/v1/agent/memory/consolidate` | `agent.memory.consolidate` | `hoody agent memory consolidate` | Trigger a memory consolidation pass (human-only). |
| GET | `/api/v1/agent/memory/datahost` | `agent.memory.getDataHost` | `hoody agent memory datahost get` | Read the realm's memory data host. |
| PUT | `/api/v1/agent/memory/datahost` | `agent.memory.claimDataHost` | `hoody agent memory datahost claim` | Assign this computer as the memory data host. |
| PUT | `/api/v1/agent/memory/enabled` | `agent.memory.enable` | `hoody agent memory enable` | Toggle memory capture. |
| POST | `/api/v1/agent/memory/flush` | `agent.memory.flush` | `hoody agent memory flush` | Flush the memory store. |
| GET | `/api/v1/agent/memory/graph` | `agent.memory.getGraph` | `hoody agent memory graph get` | Read a project's memory relation graph. |
| DELETE | `/api/v1/agent/memory/items` | `agent.memory.deleteItem` | `hoody agent memory items delete` | Delete a memory item. |
| GET | `/api/v1/agent/memory/items` | `agent.memory.listItems` | `hoody agent memory items list` | List memory items. |
| POST | `/api/v1/agent/memory/items` | `agent.memory.createItem` | `hoody agent memory items create` | Save a memory item. |
| GET | `/api/v1/agent/memory/items/{id}` | `agent.memory.getItem` | `hoody agent memory items get` | Read a memory item. |
| PATCH | `/api/v1/agent/memory/items/{id}` | `agent.memory.updateItem` | `hoody agent memory items update` | Edit a memory item. |
| GET | `/api/v1/agent/memory/projects` | `agent.memory.listProjects` | `hoody agent memory projects list` | List memory projects. |
| DELETE | `/api/v1/agent/memory/projects/{project}` | `agent.memory.deleteProject` | `hoody agent memory projects delete` | Erase a memory project. |
| POST | `/api/v1/agent/memory/search` | `agent.memory.search` | `hoody agent memory search` | Search memory (hybrid recall). |
| GET | `/api/v1/agent/memory/status` | `agent.memory.getStatus` | `hoody agent memory status` | Read memory subsystem status. |
| POST | `/api/v1/agent/memory/write-intents` | `agent.memory.createWriteIntent` | `hoody agent memory intents create` | Begin a guarded memory write (intent). |
| GET | `/api/v1/agent/metrics` | `agent.kit.getMetrics` | `hoody agent metrics` | Prometheus metrics. |
| GET | `/api/v1/agent/models` | `agent.models.list` | `hoody agent models list` | List models. |
| GET | `/api/v1/agent/models/{spec}` | `agent.models.get` | `hoody agent models get` | Get a model by spec. |
| GET | `/api/v1/agent/providers` | `agent.providers.list` | `hoody agent providers list` | List LLM providers. |
| POST | `/api/v1/agent/providers` | `agent.providers.create` | `hoody agent providers create` | Create a custom provider. |
| DELETE | `/api/v1/agent/providers/{id}` | `agent.providers.delete` | `hoody agent providers delete` | Delete a custom provider. |
| GET | `/api/v1/agent/providers/{id}` | `agent.providers.get` | `hoody agent providers get` | Get a provider. |
| PATCH | `/api/v1/agent/providers/{id}` | `agent.providers.update` | `hoody agent providers update` | Change a custom provider. |
| GET | `/api/v1/agent/providers/{id}/auth` | `agent.providers.getAuth` | `hoody agent providers auth status` | Get a provider's auth status. |
| GET | `/api/v1/agent/providers/{id}/auth/accounts` | `agent.providers.listAccounts` | `hoody agent providers accounts list` | List a provider's OAuth account pool. |
| POST | `/api/v1/agent/providers/{id}/auth/accounts` | `agent.providers.addAccount` | `hoody agent providers accounts add` | Add an OAuth account to a provider's pool. |
| DELETE | `/api/v1/agent/providers/{id}/auth/accounts/{key}` | `agent.providers.removeAccount` | `hoody agent providers accounts remove` | Remove a pooled OAuth account. |
| PUT | `/api/v1/agent/providers/{id}/auth/accounts/{key}/active` | `agent.providers.useAccount` | `hoody agent providers accounts use` | Make a pooled OAuth account active. |
| DELETE | `/api/v1/agent/providers/{id}/auth/api-key` | `agent.providers.deleteApiKey` | `hoody agent providers keys delete` | Delete a provider API key. |
| PUT | `/api/v1/agent/providers/{id}/auth/api-key` | `agent.providers.setApiKey` | `hoody agent providers keys set` | Store a provider API key. |
| PUT | `/api/v1/agent/providers/{id}/auth/default` | `agent.providers.setDefaultAuth` | `hoody agent providers auth default set` | Set a provider's default credential method. |
| DELETE | `/api/v1/agent/providers/{id}/auth/oauth` | `agent.providers.logoutOauth` | `hoody agent providers oauth logout` | Remove a provider's OAuth login. |
| POST | `/api/v1/agent/providers/{id}/auth/oauth` | `agent.providers.startOauth` | `hoody agent providers oauth start` | Start a provider OAuth login. |
| GET | `/api/v1/agent/providers/{id}/auth/oauth/{job}` | `agent.providers.pollOauth` | `hoody agent providers oauth poll` | Poll a provider OAuth login. |
| POST | `/api/v1/agent/providers/{id}/auth/oauth/{job}/code` | `agent.providers.submitOauthCode` | `hoody agent providers oauth submit` | Submit a provider OAuth authorization code. |
| GET | `/api/v1/agent/realms` | `agent.realms.list` | `hoody agent realms list` | List realms (for binding). |
| GET | `/api/v1/agent/sessions` | `agent.sessions.list` | `hoody agent sessions list` | List sessions. |
| POST | `/api/v1/agent/sessions` | `agent.sessions.create` | `hoody agent sessions create` | Create, fork, or attach a session. |
| DELETE | `/api/v1/agent/sessions/{id}` | `agent.sessions.delete` | `hoody agent sessions delete` | Close (and optionally hard-delete) a session. |
| GET | `/api/v1/agent/sessions/{id}` | `agent.sessions.get` | `hoody agent sessions get` | Get a session summary. |
| PATCH | `/api/v1/agent/sessions/{id}` | `agent.sessions.rename` | `hoody agent sessions rename` | Rename a session. |
| PUT | `/api/v1/agent/sessions/{id}/after-compaction` | `agent.sessions.setAfterCompaction` | `hoody agent sessions aftercompaction set` | Set the message re-added after every compaction. |
| PATCH | `/api/v1/agent/sessions/{id}/agent` | `agent.sessions.setAgent` | `hoody agent sessions agent set` | Switch the chat agent. |
| POST | `/api/v1/agent/sessions/{id}/answer` | `agent.gates.answer` | `hoody agent gates answer` | Answer a parked question gate. |
| POST | `/api/v1/agent/sessions/{id}/answer:assist` | `agent.gates.suggest` | `hoody agent gates suggest` | Propose answers for a parked question (helper model). |
| GET | `/api/v1/agent/sessions/{id}/approval` | `agent.sessions.getApproval` | `hoody agent sessions approval get` | Read a session's approval policy. |
| PUT | `/api/v1/agent/sessions/{id}/approval` | `agent.sessions.updateApproval` | `hoody agent sessions approval update` | Set a session's approval mode and lock. |
| DELETE | `/api/v1/agent/sessions/{id}/approval/rules/{tool}` | `agent.sessions.deleteApprovalRule` | `hoody agent sessions approval rules delete` | Remove one session permission rule. |
| PUT | `/api/v1/agent/sessions/{id}/approval/rules/{tool}` | `agent.sessions.setApprovalRule` | `hoody agent sessions approval rules set` | Set one session permission rule. |
| DELETE | `/api/v1/agent/sessions/{id}/approver-lease` | `agent.sessions.releaseApproverLease` | `hoody agent sessions approver lease release` | Release the approver lease. |
| PATCH | `/api/v1/agent/sessions/{id}/approver-lease` | `agent.sessions.renewApproverLease` | `hoody agent sessions approver lease renew` | Renew the approver lease. |
| POST | `/api/v1/agent/sessions/{id}/approver-lease` | `agent.sessions.claimApproverLease` | `hoody agent sessions approver lease claim` | Acquire the right to answer this session's gates. |
| POST | `/api/v1/agent/sessions/{id}/attachments` | `agent.sessions.claimAttachment` | `hoody agent sessions attachments claim` | Hold a live session (and its parked gate) alive. |
| DELETE | `/api/v1/agent/sessions/{id}/attachments/{lease_id}` | `agent.sessions.releaseAttachment` | `hoody agent sessions attachments release` | Release an attachment lease. |
| PATCH | `/api/v1/agent/sessions/{id}/attachments/{lease_id}` | `agent.sessions.renewAttachment` | `hoody agent sessions attachments renew` | Renew an attachment lease. |
| PATCH | `/api/v1/agent/sessions/{id}/auto-reply` | `agent.sessions.setAutoReply` | `hoody agent sessions autoreply set` | Arm/disarm the auto-reply loop. |
| PATCH | `/api/v1/agent/sessions/{id}/auto-reply/writes` | `agent.sessions.setAutoReplyWrites` | `hoody agent sessions autoreply writes set` | Flip the auto-reply write opt-in. |
| POST | `/api/v1/agent/sessions/{id}/cancel` | `agent.sessions.turns.cancel` | `hoody agent sessions turns cancel` | Cancel the active turn (Esc), or one named turn. |
| POST | `/api/v1/agent/sessions/{id}/close` | `agent.sessions.close` | `hoody agent sessions close` | Close the session (teardown). |
| POST | `/api/v1/agent/sessions/{id}/commands` | `agent.sessions.commands.send` | `hoody agent sessions commands send` | Send a message, an interrupt or a stop to a session. |
| GET | `/api/v1/agent/sessions/{id}/commands/{command_id}` | `agent.sessions.commands.get` | `hoody agent sessions commands get` | Get a command's receipt. |
| POST | `/api/v1/agent/sessions/{id}/confirm` | `agent.gates.deny` | `hoody agent gates approve` | Answer a parked confirm gate (on an always-approval session also --gate-id, --generation and the approver lease). |
| PATCH | `/api/v1/agent/sessions/{id}/effort` | `agent.sessions.setEffort` | `hoody agent sessions effort set` | Set reasoning effort. |
| PATCH | `/api/v1/agent/sessions/{id}/hoody-env` | `agent.sessions.setHoodyEnv` | `hoody agent sessions env set` | Toggle Hoody shell-env injection. |
| POST | `/api/v1/agent/sessions/{id}/jev/decide` | `agent.jev.decideForSession` | — | Ask Jev to decide on behalf of a session. |
| GET | `/api/v1/agent/sessions/{id}/loops` | `agent.sessions.listLoops` | `hoody agent sessions loops list` | List a session's loops. |
| POST | `/api/v1/agent/sessions/{id}/loops` | `agent.loops.create` | `hoody agent loops create` | Create a loop. |
| DELETE | `/api/v1/agent/sessions/{id}/loops/{loopId}` | `agent.loops.delete` | `hoody agent loops delete` | Delete a loop. |
| PATCH | `/api/v1/agent/sessions/{id}/loops/{loopId}` | `agent.loops.update` | `hoody agent loops update` | Update a loop. |
| POST | `/api/v1/agent/sessions/{id}/loops/{loopId}/run-now` | `agent.loops.startRun` | `hoody agent loops runs start` | Run a loop immediately. |
| POST | `/api/v1/agent/sessions/{id}/messages` | `agent.sessions.startTurn` | — | Dispatch a turn (fire-and-observe). |
| PATCH | `/api/v1/agent/sessions/{id}/model` | `agent.sessions.setModel` | `hoody agent sessions model set` | Switch the session model. |
| POST | `/api/v1/agent/sessions/{id}/prompt:stream` | `agent.sessions.startTurnAndStream` | — | Dispatch a turn and stream the response. |
| POST | `/api/v1/agent/sessions/{id}/prompt:sync` | `agent.sessions.turns.run` | `hoody agent sessions turns run` | Dispatch a turn and block until it ends (no reply text: read it from the transcript) |
| GET | `/api/v1/agent/sessions/{id}/replay` | `agent.sessions.replay` | `hoody agent sessions replay` | Replay a live session's buffered events. |
| GET | `/api/v1/agent/sessions/{id}/rules/applies` | `agent.sessions.listApplicableRules` | `hoody agent sessions rules list` | Which tool-call rules apply. |
| GET | `/api/v1/agent/sessions/{id}/state` | `agent.sessions.getSnapshot` | `hoody agent sessions snapshot get` | Read a session's recoverable state. |
| GET | `/api/v1/agent/sessions/{id}/stream` | `agent.sessions.connect` | — | Attach to a session's event stream (WebSocket / SSE). |
| GET | `/api/v1/agent/sessions/{id}/tasks` | `agent.tasks.list` | `hoody agent tasks list` | List a session's background tasks. |
| POST | `/api/v1/agent/sessions/{id}/tasks/{tid}/cancel` | `agent.tasks.cancel` | `hoody agent tasks cancel` | Cancel a background task. |
| GET | `/api/v1/agent/sessions/{id}/tasks/{tid}/transcript` | `agent.tasks.getTranscript` | `hoody agent tasks transcript get` | Read a background task's transcript. |
| POST | `/api/v1/agent/sessions/{id}/tasks/cancel` | `agent.sessions.cancelTasks` | `hoody agent sessions tasks cancel` | Cancel all background tasks. |
| GET | `/api/v1/agent/sessions/{id}/tools` | `agent.sessions.listTools` | `hoody agent sessions tools list` | List a session's effective tool set. |
| POST | `/api/v1/agent/sessions/{id}/tools/{name}/run` | `agent.sessions.runTool` | `hoody agent sessions tools run` | Run a tool inside a live session (gated). |
| GET | `/api/v1/agent/sessions/{id}/tools/mcp` | `agent.sessions.listMcpTools` | `hoody agent sessions mcp tools list` | List a session's MCP tools. |
| GET | `/api/v1/agent/sessions/{id}/transcript` | `agent.sessions.getTranscript` | `hoody agent sessions transcript get` | Read a session's transcript without attaching. |
| POST | `/api/v1/agent/sessions/{id}/trim` | `agent.sessions.trim` | `hoody agent sessions trim` | Trim session history to a turn index. |
| GET | `/api/v1/agent/sessions/{id}/turns` | `agent.sessions.turns.list` | `hoody agent sessions turns list` | List a session's durable turn receipts. |
| POST | `/api/v1/agent/sessions/{id}/turns` | `agent.sessions.turns.create` | `hoody agent sessions turns create` | Dispatch a turn (retry-safe). |
| GET | `/api/v1/agent/sessions/{id}/turns/{turn_id}` | `agent.sessions.turns.get` | `hoody agent sessions turns get` | Get a turn's durable receipt. |
| GET | `/api/v1/agent/sessions/{id}/usage` | `agent.sessions.getUsage` | `hoody agent sessions usage get` | Read a session's per-call LLM usage. |
| PATCH | `/api/v1/agent/sessions/{id}/verbosity` | `agent.sessions.setVerbosity` | `hoody agent sessions verbosity set` | Set response verbosity. |
| POST | `/api/v1/agent/sessions/{id}/workflow/messages` | `agent.workflows.sendMessage` | `hoody agent workflows messages send` | Send a message to a running workflow. |
| POST | `/api/v1/agent/sessions/{id}/workflows/{name}/runs` | `agent.sessions.startWorkflow` | `hoody agent sessions workflows start` | Run a workflow onto an existing session. |
| PATCH | `/api/v1/agent/sessions/{id}/yolo` | `agent.sessions.setYolo` | `hoody agent sessions yolo set` | Arm or disarm YOLO auto-approve. |
| GET | `/api/v1/agent/sessions/cwds` | `agent.sessions.listDirectories` | `hoody agent sessions directories list` | List distinct session working directories. |
| GET | `/api/v1/agent/settings` | `agent.settings.get` | `hoody agent settings get` | Get settings. |
| PATCH | `/api/v1/agent/settings` | `agent.settings.update` | `hoody agent settings update` | Patch settings. |
| GET | `/api/v1/agent/settings/fusion` | `agent.fusions.list` | `hoody agent fusions list` | List fusion composites. |
| DELETE | `/api/v1/agent/settings/fusion/{slug}` | `agent.fusions.delete` | `hoody agent fusions delete` | Delete a fusion composite. |
| PUT | `/api/v1/agent/settings/fusion/{slug}` | `agent.fusions.set` | `hoody agent fusions set` | Create or update a fusion composite. |
| GET | `/api/v1/agent/skills` | `agent.skills.list` | `hoody agent skills list` | List skills. |
| POST | `/api/v1/agent/skills` | `agent.skills.create` | `hoody agent skills create` | Create a skill. |
| POST | `/api/v1/agent/skills/delete` | `agent.skills.delete` | `hoody agent skills delete` | Delete a skill. |
| DELETE | `/api/v1/agent/skills/hub/cache` | `agent.skills.hub.clearCache` | `hoody agent skills hub cache clear` | Clear the skill hub cache. |
| GET | `/api/v1/agent/skills/hub/cache` | `agent.skills.hub.getCacheStats` | `hoody agent skills hub cache stats` | Skill hub cache stats. |
| POST | `/api/v1/agent/skills/hub/install` | `agent.skills.hub.install` | `hoody agent skills hub install` | Install a hub skill. |
| GET | `/api/v1/agent/skills/hub/preview` | `agent.skills.hub.preview` | `hoody agent skills hub preview` | Preview a hub skill. |
| GET | `/api/v1/agent/skills/hub/search` | `agent.skills.hub.search` | `hoody agent skills hub search` | Search the skill hub. |
| POST | `/api/v1/agent/skills/import/apply` | `agent.skills.import` | `hoody agent skills import` | Apply a skill import. |
| GET | `/api/v1/agent/skills/import/scan` | `agent.skills.scan` | `hoody agent skills scan` | Scan for importable skills. |
| POST | `/api/v1/agent/skills/rename` | `agent.skills.rename` | `hoody agent skills rename` | Rename a skill. |
| GET | `/api/v1/agent/skills/source` | `agent.skills.getSource` | `hoody agent skills source get` | Read a skill's source. |
| PUT | `/api/v1/agent/skills/source` | `agent.skills.setSource` | `hoody agent skills source set` | Write a skill's source. |
| POST | `/api/v1/agent/skills/toggle` | `agent.skills.enable` | `hoody agent skills enable` | Enable/disable a skill. |
| POST | `/api/v1/agent/skills/trust` | `agent.skills.trust` | `hoody agent skills trust` | Set a skill's trust state. |
| GET | `/api/v1/agent/statistics` | `agent.stats.get` | `hoody agent stats` | Cross-session statistics. |
| POST | `/api/v1/agent/stop` | `agent.stopAllWork` | `hoody agent work stop` | Stop everything running in the realm. |
| GET | `/api/v1/agent/todos` | `agent.todos.list` | `hoody agent todos list` | List todos. |
| POST | `/api/v1/agent/todos` | `agent.todos.create` | `hoody agent todos create` | File a todo. |
| GET | `/api/v1/agent/todos/{id}` | `agent.todos.get` | `hoody agent todos get` | Read a todo. |
| PATCH | `/api/v1/agent/todos/{id}` | `agent.todos.update` | `hoody agent todos update` | Update a todo (CAS). |
| POST | `/api/v1/agent/todos/{id}/archive` | `agent.todos.archive` | `hoody agent todos archive` | Archive a todo. |
| POST | `/api/v1/agent/todos/{id}/cancel-run` | `agent.todos.cancel` | `hoody agent todos cancel` | Cancel a todo's run. |
| POST | `/api/v1/agent/todos/{id}/claim` | `agent.todos.claim` | `hoody agent todos claim` | Claim a todo. |
| POST | `/api/v1/agent/todos/{id}/message` | `agent.todos.sendMessage` | `hoody agent todos messages send` | Comment + run an orchestrator turn. |
| POST | `/api/v1/agent/todos/{id}/messages` | `agent.todos.createComment` | `hoody agent todos comments create` | Comment on a todo. |
| POST | `/api/v1/agent/todos/{id}/proposals/{pid}/approve` | `agent.todos.approveProposal` | `hoody agent todos proposals approve` | Approve a todo proposal. |
| POST | `/api/v1/agent/todos/{id}/proposals/{pid}/deny` | `agent.todos.denyProposal` | `hoody agent todos proposals deny` | Deny a todo proposal. |
| POST | `/api/v1/agent/todos/{id}/release` | `agent.todos.release` | `hoody agent todos release` | Release a todo. |
| POST | `/api/v1/agent/todos/{id}/run` | `agent.todos.start` | `hoody agent todos start` | Run a todo's orchestrator. |
| POST | `/api/v1/agent/todos/{id}/snooze` | `agent.todos.snooze` | `hoody agent todos snooze` | Snooze a todo. |
| POST | `/api/v1/agent/todos/purge` | `agent.todos.purgeArchived` | `hoody agent todos archived purge` | Purge archived todos. |
| GET | `/api/v1/agent/todos/revision` | `agent.todos.getRevision` | `hoody agent todos revision get` | Get the todos store revision. |
| POST | `/api/v1/agent/todos/triage` | `agent.todos.triage` | `hoody agent todos triage` | Run an LLM triage pass. |
| GET | `/api/v1/agent/tools` | `agent.tools.list` | `hoody agent tools list` | List the tool catalogue. |
| GET | `/api/v1/agent/tools/{name}` | `agent.tools.get` | `hoody agent tools get` | Get one tool schema. |
| POST | `/api/v1/agent/tools/{name}/run` | `agent.tools.run` | `hoody agent tools run` | Run a tool (sessionless, gated). |
| POST | `/api/v1/agent/tools/{name}/runAsync` | `agent.tools.start` | `hoody agent tools start` | Run a tool asynchronously (sessionless, gated). |
| GET | `/api/v1/agent/tools/read-only` | `agent.tools.listReadOnly` | `hoody agent tools readonly list` | List the read-only tool subset. |
| GET | `/api/v1/agent/usage/by-account` | `agent.usage.listByAccount` | `hoody agent usage accounts list` | Usage rollup by account. |
| GET | `/api/v1/agent/usage/by-model` | `agent.usage.listByModel` | `hoody agent usage models list` | Usage rollup by model. |
| GET | `/api/v1/agent/version` | `agent.kit.getVersion` | `hoody agent version` | Agent API version and capabilities. |
| GET | `/api/v1/agent/workflows` | `agent.workflows.list` | `hoody agent workflows list` | List workflow definitions. |
| DELETE | `/api/v1/agent/workflows/{name}` | `agent.workflows.delete` | `hoody agent workflows delete` | Delete a workflow definition. |
| GET | `/api/v1/agent/workflows/{name}` | `agent.workflows.get` | `hoody agent workflows get` | Read one workflow definition. |
| PUT | `/api/v1/agent/workflows/{name}` | `agent.workflows.set` | `hoody agent workflows set` | Create or replace a workflow definition. |
| POST | `/api/v1/agent/workflows/{name}/hide` | `agent.workflows.setHidden` | `hoody agent workflows hidden set` | Hide or un-hide a workflow. |
| POST | `/api/v1/agent/workflows/{name}/runs` | `agent.workflows.start` | `hoody agent workflows start` | Run a workflow in a new session. |
| PUT | `/api/v1/agent/workflows/{name}/summary` | `agent.workflows.setSummary` | `hoody agent workflows summary set` | Set or clear a workflow's summary. |
| GET | `/api/v1/agent/workflows/runs` | `agent.workflows.listRuns` | `hoody agent workflows runs list` | Snapshot in-flight and recent workflow runs. |
| GET | `/api/v1/agent/workflows/runs/{run_id}` | `agent.workflows.getRun` | `hoody agent workflows runs get` | Get one workflow run by id. |
| POST | `/api/v1/agent/workflows/runs/{run_id}/cancel` | `agent.workflows.cancelRun` | `hoody agent workflows runs cancel` | Cancel a workflow run. |
| POST | `/api/v1/agent/workflows/runs/{run_id}/resume` | `agent.workflows.resumeRun` | `hoody agent workflows runs resume` | Resume a failed or cancelled workflow run. |

---

## `api` — 238 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/ai/models` | `api.ai.listModels` | `hoody ai models list` | List available AI models (Hoody catalog) |
| POST | `/api/v1/auth/authorize` | `api.auth.oauth.authorize` | `hoody auth oauth authorize` | Begin a PKCE OAuth authorization |
| GET | `/api/v1/auth/available-regions` | `api.servers.listRegions` | `hoody servers regions list` | Get available server regions |
| GET | `/api/v1/auth/config` | `api.auth.getConfig` | `hoody auth config get` | Get the public sign-in configuration |
| POST | `/api/v1/auth/device/code` | `api.auth.device.start` | `hoody auth device start` | Start a device authorization flow (RFC-8628-inspired) |
| POST | `/api/v1/auth/device/deny` | `api.auth.device.deny` | — | Refuse the device ('Don't authorize') |
| POST | `/api/v1/auth/device/login` | `api.auth.device.login` | — | Password sign-in for the device authorize step (cookie + ticket gated) |
| POST | `/api/v1/auth/device/token` | `api.auth.device.poll` | `hoody auth device poll` | Poll for device-flow tokens (RFC-8628-inspired) |
| POST | `/api/v1/auth/device/verify_code` | `api.auth.device.verifyCode` | — | Confirm a device user_code (verification page) |
| POST | `/api/v1/auth/exchange` | `api.auth.oauth.exchange` | `hoody auth oauth exchange` | Exchange a PKCE authorization code for tokens |
| POST | `/api/v1/auth/forgot-password` | `api.auth.recoverPassword` | `hoody auth password recover` | Request password reset |
| POST | `/api/v1/auth/intent/cancel` | `api.auth.oauth.cancelIntent` | `hoody auth oauth intents cancel` | Cancel a pending OAuth intent or 2FA temp_token |
| POST | `/api/v1/auth/launch/initiate` | `api.auth.oauth.startLaunch` | — | Initiate OAuth popup-handoff launch |
| POST | `/api/v1/auth/resend-verification` | `api.auth.sendVerificationEmail` | `hoody auth email verification send` | Resend verification email |
| POST | `/api/v1/auth/reset-password` | `api.auth.resetPassword` | `hoody auth password reset` | Reset password |
| POST | `/api/v1/auth/signup` | `api.auth.signup` | — | Sign up with email and password |
| GET | `/api/v1/auth/tokens` | `api.auth.tokens.list` | `hoody auth tokens list` | List auth tokens |
| POST | `/api/v1/auth/tokens` | `api.auth.tokens.create` | `hoody auth tokens create` | Create a new auth token |
| DELETE | `/api/v1/auth/tokens/{id}` | `api.auth.tokens.delete` | `hoody auth tokens delete` | Delete auth token |
| GET | `/api/v1/auth/tokens/{id}` | `api.auth.tokens.get` | `hoody auth tokens get` | Get auth token by ID |
| PUT | `/api/v1/auth/tokens/{id}` | `api.auth.tokens.update` | `hoody auth tokens update` | Update auth token |
| POST | `/api/v1/auth/tokens/{id}/add-realm` | `api.auth.tokens.addRealm` | `hoody auth tokens realms add` | Add realm to auth token |
| POST | `/api/v1/auth/tokens/{id}/copy` | `api.auth.tokens.copy` | `hoody auth tokens copy` | Copy auth token |
| POST | `/api/v1/auth/tokens/{id}/remove-realm` | `api.auth.tokens.removeRealm` | `hoody auth tokens realms remove` | Remove realm from auth token |
| GET | `/api/v1/auth/tokens/me` | `api.auth.tokens.getCurrent` | `hoody auth tokens get` | Get current auth token details |
| PUT | `/api/v1/auth/tokens/me/public-profile` | `api.auth.tokens.updatePublicProfile` | `hoody auth tokens profiles update` | Update current auth token public profile |
| GET | `/api/v1/auth/tokens/public-profiles/{public_key}` | `api.auth.tokens.getPublicProfile` | `hoody auth tokens profiles get` | Get auth token public profile by public key |
| GET | `/api/v1/auth/tokens/templates` | `api.auth.tokens.listTemplates` | `hoody auth tokens templates list` | List permission templates |
| POST | `/api/v1/auth/verify-email` | `api.auth.verifyEmail` | `hoody auth email verify` | Verify email address |
| GET | `/api/v1/containers/` | `api.containers.list` | `hoody containers list` | Get all containers |
| DELETE | `/api/v1/containers/{id}` | `api.containers.delete` | `hoody containers delete` | Delete a container |
| GET | `/api/v1/containers/{id}` | `api.containers.get` | `hoody containers get` | Get a container by ID |
| PUT | `/api/v1/containers/{id}` | `api.containers.update` | `hoody containers update` | Update a container |
| POST | `/api/v1/containers/{id}/{operation}` | `api.containers.stop` | `hoody containers start` | Manage container |
| POST | `/api/v1/containers/{id}/authorize` | `api.containers.createClaim` | `hoody containers claims create` | Authorize Container Access |
| POST | `/api/v1/containers/{id}/copy` | `api.containers.copy` | `hoody containers copy` | Copy a container |
| GET | `/api/v1/containers/{id}/env` | `api.containers.env.list` | `hoody containers env list` | List container environment variables |
| PUT | `/api/v1/containers/{id}/env` | `api.containers.env.update` | `hoody containers env update` | Bulk set container environment variables |
| DELETE | `/api/v1/containers/{id}/env/{key}` | `api.containers.env.delete` | `hoody containers env delete` | Delete a single environment variable |
| PUT | `/api/v1/containers/{id}/env/{key}` | `api.containers.env.set` | `hoody containers env set` | Set a single environment variable |
| DELETE | `/api/v1/containers/{id}/firewall/egress` | `api.firewall.deleteEgressRule` | `hoody firewall egress delete` | Remove Egress Rule(s) |
| PATCH | `/api/v1/containers/{id}/firewall/egress` | `api.firewall.enableEgressRule` | `hoody firewall egress enable` | Toggle Egress Rule State |
| POST | `/api/v1/containers/{id}/firewall/egress` | `api.firewall.createEgressRule` | `hoody firewall egress create` | Add Egress Rule |
| DELETE | `/api/v1/containers/{id}/firewall/ingress` | `api.firewall.deleteIngressRule` | `hoody firewall ingress delete` | Remove Ingress Rule(s) |
| PATCH | `/api/v1/containers/{id}/firewall/ingress` | `api.firewall.enableIngressRule` | `hoody firewall ingress enable` | Toggle Ingress Rule State |
| POST | `/api/v1/containers/{id}/firewall/ingress` | `api.firewall.createIngressRule` | `hoody firewall ingress create` | Add Ingress Rule |
| POST | `/api/v1/containers/{id}/firewall/reset` | `api.firewall.reset` | `hoody firewall reset` | Reset container firewall |
| GET | `/api/v1/containers/{id}/firewall/rules` | `api.firewall.listRules` | `hoody firewall rules list` | List container firewall rules |
| PUT | `/api/v1/containers/{id}/kvm` | `api.containers.enableKvm` | `hoody containers kvm enable` | Enable or disable /dev/kvm (run VMs in the container) |
| DELETE | `/api/v1/containers/{id}/network` | `api.network.delete` | `hoody network delete` | Remove container network configuration |
| GET | `/api/v1/containers/{id}/network` | `api.network.get` | `hoody network get` | Get container network configuration |
| PUT | `/api/v1/containers/{id}/network` | `api.network.update` | `hoody network update` | Update container network configuration |
| POST | `/api/v1/containers/{id}/network/start` | `api.network.start` | `hoody network start` | Start container network proxy/blocking |
| POST | `/api/v1/containers/{id}/network/stop` | `api.network.stop` | `hoody network stop` | Stop container network proxy/blocking |
| GET | `/api/v1/containers/{id}/proxy-usage` | `api.containers.getProxyUsage` | `hoody containers proxy usage` | Get proxied-usage documents for a container |
| GET | `/api/v1/containers/{id}/proxy/groups` | `api.proxy.groups.list` | `hoody containers proxy groups list` | List container proxy groups |
| GET | `/api/v1/containers/{id}/proxy/hooks` | `api.proxy.hooks.list` | `hoody containers proxy hooks list` | List all proxy hooks for a container |
| DELETE | `/api/v1/containers/{id}/proxy/hooks/{service}` | `api.proxy.hooks.clear` | `hoody containers proxy services hooks clear` | Clear all hooks for a service |
| GET | `/api/v1/containers/{id}/proxy/hooks/{service}` | `api.proxy.hooks.listByService` | `hoody containers proxy services hooks list` | List hooks for a specific service |
| POST | `/api/v1/containers/{id}/proxy/hooks/{service}` | `api.proxy.hooks.create` | `hoody containers proxy hooks create` | Append or insert a new hook |
| DELETE | `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` | `api.proxy.hooks.delete` | `hoody containers proxy hooks delete` | Remove a hook |
| GET | `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` | `api.proxy.hooks.get` | `hoody containers proxy hooks get` | Get a single hook by id |
| PUT | `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` | `api.proxy.hooks.set` | `hoody containers proxy hooks set` | Replace a hook in place |
| PATCH | `/api/v1/containers/{id}/proxy/hooks/{service}/{hookId}/position` | `api.proxy.hooks.move` | `hoody containers proxy hooks move` | Move a hook to a new position |
| DELETE | `/api/v1/containers/{id}/proxy/permissions` | `api.proxy.containerPermissions.delete` | `hoody containers proxy permissions delete` | Delete container proxy permissions |
| GET | `/api/v1/containers/{id}/proxy/permissions` | `api.proxy.containerPermissions.get` | `hoody containers proxy permissions get` | Get container proxy permissions |
| PUT | `/api/v1/containers/{id}/proxy/permissions` | `api.proxy.containerPermissions.set` | `hoody containers proxy permissions set` | Replace container proxy permissions JSON |
| PATCH | `/api/v1/containers/{id}/proxy/permissions/default` | `api.proxy.containerPermissions.setDefault` | `hoody containers proxy default set` | Update container default proxy permission policy |
| DELETE | `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}` | `api.proxy.containerPermissions.deleteAuthGroup` | `hoody containers proxy groups delete` | Remove container authentication group |
| PUT | `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/ip` | `api.proxy.containerPermissions.setIpGroup` | `hoody containers proxy groups ip set` | Set IP authentication group (container) |
| PUT | `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/jwt` | `api.proxy.containerPermissions.setJwtGroup` | `hoody containers proxy groups jwt set` | Set JWT authentication group (container) |
| PUT | `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/password` | `api.proxy.containerPermissions.setPasswordGroup` | `hoody containers proxy groups password set` | Set password authentication group (container) |
| PUT | `/api/v1/containers/{id}/proxy/permissions/groups/{groupName}/token` | `api.proxy.containerPermissions.setTokenGroup` | `hoody containers proxy groups token set` | Set token authentication group (container) |
| DELETE | `/api/v1/containers/{id}/proxy/permissions/permissions/{groupName}` | `api.proxy.containerPermissions.clearGroupPermissions` | `hoody containers proxy groups permissions clear` | Remove all program permissions for a container group |
| PUT | `/api/v1/containers/{id}/proxy/permissions/permissions/{groupName}` | `api.proxy.containerPermissions.setGroupPermission` | `hoody containers proxy groups permissions set` | Set container group program permission |
| DELETE | `/api/v1/containers/{id}/proxy/permissions/permissions/{groupName}/{program}` | `api.proxy.containerPermissions.deleteGroupPermission` | `hoody containers proxy groups permissions delete` | Remove a single program permission for a container group |
| PATCH | `/api/v1/containers/{id}/proxy/permissions/state` | `api.proxy.containerPermissions.enable` | `hoody containers proxy enable` | Update container proxy enable state |
| GET | `/api/v1/containers/{id}/proxy/services` | `api.proxy.services.list` | `hoody containers proxy services list` | List services referenced in proxy config |
| GET | `/api/v1/containers/{id}/proxy/services/{service}` | `api.proxy.services.get` | `hoody containers proxy services get` | Get merged proxy view for a service |
| GET | `/api/v1/containers/{id}/proxy/settings` | `api.proxy.settings.get` | `hoody containers proxy settings get` | Get container proxy root settings |
| PUT | `/api/v1/containers/{id}/proxy/settings` | `api.proxy.settings.update` | `hoody containers proxy settings update` | Update container proxy root settings |
| GET | `/api/v1/containers/{id}/snapshots` | `api.snapshots.list` | `hoody snapshots list` | Get container snapshots |
| POST | `/api/v1/containers/{id}/snapshots` | `api.snapshots.create` | `hoody snapshots create` | Create container snapshot |
| DELETE | `/api/v1/containers/{id}/snapshots/{name}` | `api.snapshots.delete` | `hoody snapshots delete` | Delete container snapshot |
| PUT | `/api/v1/containers/{id}/snapshots/{name}` | `api.snapshots.restore` | `hoody snapshots restore` | Restore container from snapshot |
| PUT | `/api/v1/containers/{id}/snapshots/{name}/alias` | `api.snapshots.setAlias` | `hoody snapshots alias set` | Update snapshot alias |
| GET | `/api/v1/containers/{id}/stats` | `api.containers.getStats` | `hoody containers stats` | Get container resource statistics |
| GET | `/api/v1/containers/{id}/status-logs` | `api.containers.listStatusHistory` | `hoody containers status history list` | Get status logs for a container |
| GET | `/api/v1/containers/{id}/storage/incoming` | `api.storage.shares.listIncomingByContainer` | `hoody storage containers incoming list` | Get incoming shares |
| PATCH | `/api/v1/containers/{id}/storage/incoming/{shareId}/mount` | `api.storage.shares.mountIncoming` | `hoody storage incoming mount` | Toggle incoming share mount |
| GET | `/api/v1/containers/{id}/storage/shares` | `api.storage.shares.listByContainer` | `hoody storage containers shares list` | List storage shares |
| POST | `/api/v1/containers/{id}/storage/shares` | `api.storage.shares.create` | `hoody storage shares create` | Create storage share |
| GET | `/api/v1/containers/{id}/storage/shares/{shareId}` | `api.storage.shares.get` | `hoody storage shares get` | Get storage share |
| PATCH | `/api/v1/containers/{id}/storage/shares/{shareId}` | `api.storage.shares.update` | `hoody storage shares update` | Update storage share |
| POST | `/api/v1/containers/{id}/sync` | `api.containers.sync` | `hoody containers sync` | Sync a copied container with its source |
| DELETE | `/api/v1/events` | `api.events.clear` | `hoody events clear` | Bulk delete events |
| GET | `/api/v1/events` | `api.events.list` | `hoody events list` | List event history |
| DELETE | `/api/v1/events/{id}` | `api.events.delete` | `hoody events delete` | Delete a single event |
| GET | `/api/v1/events/{id}` | `api.events.get` | `hoody events get` | Get event details by ID |
| POST | `/api/v1/events/cleanup` | `api.events.purge` | `hoody events purge` | Cleanup old events |
| GET | `/api/v1/events/stats` | `api.events.getStats` | `hoody events stats` | Get event statistics |
| GET | `/api/v1/images/{id}/icon` | `api.images.getIcon` | `hoody images icon get` | Get image icon |
| POST | `/api/v1/images/import/{id}` | `api.images.import` | `hoody images import` | Import free image |
| GET | `/api/v1/images/public` | `api.images.listPublic` | `hoody images list` | List public images |
| GET | `/api/v1/images/public/{id}` | `api.images.getPublic` | `hoody images get` | Get public image details |
| POST | `/api/v1/images/purchase/{id}` | `api.images.buy` | `hoody images buy` | Purchase image |
| POST | `/api/v1/images/rate/{id}` | `api.images.rate` | `hoody images rate` | Rate image |
| GET | `/api/v1/images/user` | `api.images.list` | `hoody images list` | List user images |
| GET | `/api/v1/ip` | `api.ip.get` | `hoody ip get` | Get IP Information |
| GET | `/api/v1/meta/public-key` | `api.meta.getPublicKey` | `hoody meta key get` | Get Hoody API Signing Public Key |
| GET | `/api/v1/notifications/` | `api.inbox.list` | `hoody inbox list` | List notifications for the authenticated user |
| PUT | `/api/v1/notifications/{id}/read` | `api.inbox.markRead` | `hoody inbox mark read` | Mark a notification as read |
| GET | `/api/v1/notifications/public` | `api.inbox.listAnnouncements` | `hoody inbox announcements list` | Get all public notifications |
| PUT | `/api/v1/notifications/read-all` | `api.inbox.markAllRead` | `hoody inbox mark read` | Mark all notifications as read |
| GET | `/api/v1/notifications/summary` | `api.inbox.getSummary` | `hoody inbox summary` | Unread notification count and newest position |
| GET | `/api/v1/offers` | `api.servers.offers.list` | `hoody servers offers list` | Browse machines available to order |
| POST | `/api/v1/offers/{id}/reserve` | `api.servers.offers.reserve` | `hoody servers offers reserve` | Reserve an offer (charges immediately) |
| GET | `/api/v1/pools` | `api.pools.list` | `hoody pools list` | List user pools |
| POST | `/api/v1/pools` | `api.pools.create` | `hoody pools create` | Create pool |
| DELETE | `/api/v1/pools/{id}` | `api.pools.delete` | `hoody pools delete` | Delete pool |
| GET | `/api/v1/pools/{id}` | `api.pools.get` | `hoody pools get` | Get pool details |
| PUT | `/api/v1/pools/{id}` | `api.pools.update` | `hoody pools update` | Update pool |
| POST | `/api/v1/pools/{id}/accept` | `api.pools.invitations.accept` | `hoody pools invitations accept` | Accept invitation |
| POST | `/api/v1/pools/{id}/members` | `api.pools.members.invite` | `hoody pools members invite` | Invite member |
| DELETE | `/api/v1/pools/{id}/members/{userId}` | `api.pools.members.remove` | `hoody pools members remove` | Remove member |
| PUT | `/api/v1/pools/{id}/members/{userId}` | `api.pools.members.setRole` | `hoody pools members role set` | Update member role |
| POST | `/api/v1/pools/{id}/reject` | `api.pools.invitations.reject` | `hoody pools invitations reject` | Reject invitation |
| GET | `/api/v1/pools/invitations/pending` | `api.pools.invitations.list` | `hoody pools invitations list` | List pending invitations |
| GET | `/api/v1/projects/` | `api.projects.list` | `hoody projects list` | List all projects |
| POST | `/api/v1/projects/` | `api.projects.create` | `hoody projects create` | Create a new project |
| DELETE | `/api/v1/projects/{id}` | `api.projects.delete` | `hoody projects delete` | Delete project |
| GET | `/api/v1/projects/{id}` | `api.projects.get` | `hoody projects get` | Get project by ID |
| PUT | `/api/v1/projects/{id}` | `api.projects.update` | `hoody projects update` | Update project |
| GET | `/api/v1/projects/{id}/containers` | `api.containers.listByProject` | — | Get all containers for a project |
| POST | `/api/v1/projects/{id}/containers` | `api.containers.create` | `hoody containers create` | Create a new container |
| GET | `/api/v1/projects/{id}/permissions` | `api.projects.listPermissions` | `hoody projects permissions list` | List project permissions |
| POST | `/api/v1/projects/{id}/permissions` | `api.projects.createPermission` | `hoody projects permissions create` | Grant project access |
| DELETE | `/api/v1/projects/{id}/permissions/{permissionId}` | `api.projects.deletePermission` | `hoody projects permissions delete` | Revoke project access |
| PUT | `/api/v1/projects/{id}/permissions/{permissionId}` | `api.projects.updatePermission` | `hoody projects permissions update` | Update project permission |
| GET | `/api/v1/projects/{id}/proxy-usage` | `api.projects.getProxyUsage` | `hoody projects proxy usage` | Get proxied-usage documents for every container in a project |
| DELETE | `/api/v1/projects/{id}/proxy/permissions` | `api.proxy.projectPermissions.delete` | `hoody projects proxy permissions delete` | Delete project proxy permissions |
| GET | `/api/v1/projects/{id}/proxy/permissions` | `api.proxy.projectPermissions.get` | `hoody projects proxy permissions get` | Get project proxy permissions |
| PUT | `/api/v1/projects/{id}/proxy/permissions` | `api.proxy.projectPermissions.set` | `hoody projects proxy permissions set` | Replace project proxy permissions JSON |
| PATCH | `/api/v1/projects/{id}/proxy/permissions/default` | `api.proxy.projectPermissions.setDefault` | `hoody projects proxy default set` | Update project default proxy permission policy |
| DELETE | `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}` | `api.proxy.projectPermissions.deleteAuthGroup` | `hoody projects proxy groups delete` | Remove project authentication group |
| PUT | `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/ip` | `api.proxy.projectPermissions.setIpGroup` | `hoody projects proxy groups ip set` | Set IP authentication group (project) |
| PUT | `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/jwt` | `api.proxy.projectPermissions.setJwtGroup` | `hoody projects proxy groups jwt set` | Set JWT authentication group (project) |
| PUT | `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/password` | `api.proxy.projectPermissions.setPasswordGroup` | `hoody projects proxy groups password set` | Set password authentication group (project) |
| PUT | `/api/v1/projects/{id}/proxy/permissions/groups/{groupName}/token` | `api.proxy.projectPermissions.setTokenGroup` | `hoody projects proxy groups token set` | Set token authentication group (project) |
| DELETE | `/api/v1/projects/{id}/proxy/permissions/permissions/{groupName}` | `api.proxy.projectPermissions.clearGroupPermissions` | `hoody projects proxy groups permissions clear` | Remove all program permissions for a project group |
| PUT | `/api/v1/projects/{id}/proxy/permissions/permissions/{groupName}` | `api.proxy.projectPermissions.setGroupPermission` | `hoody projects proxy groups permissions set` | Set project group program permission |
| DELETE | `/api/v1/projects/{id}/proxy/permissions/permissions/{groupName}/{program}` | `api.proxy.projectPermissions.deleteGroupPermission` | `hoody projects proxy groups permissions delete` | Remove a single program permission for a project group |
| PATCH | `/api/v1/projects/{id}/proxy/permissions/state` | `api.proxy.projectPermissions.enable` | `hoody projects proxy enable` | Update project proxy enable state |
| GET | `/api/v1/projects/{id}/stats` | `api.projects.getStats` | `hoody projects stats` | Get statistics for all containers in a project |
| GET | `/api/v1/proxy/aliases` | `api.proxy.aliases.list` | `hoody proxy aliases list` | List proxy aliases |
| POST | `/api/v1/proxy/aliases` | `api.proxy.aliases.create` | `hoody proxy aliases create` | Create a new proxy alias |
| DELETE | `/api/v1/proxy/aliases/{id}` | `api.proxy.aliases.delete` | `hoody proxy aliases delete` | Delete proxy alias |
| GET | `/api/v1/proxy/aliases/{id}` | `api.proxy.aliases.get` | `hoody proxy aliases get` | Get proxy alias by ID |
| PATCH | `/api/v1/proxy/aliases/{id}` | `api.proxy.aliases.update` | `hoody proxy aliases update` | Update proxy alias |
| PATCH | `/api/v1/proxy/aliases/{id}/state` | `api.proxy.aliases.enable` | `hoody proxy aliases enable` | Enable or disable proxy alias |
| GET | `/api/v1/realms/` | `api.realms.list` | `hoody realms list` | List your realm IDs |
| GET | `/api/v1/rentals` | `api.servers.list` | `hoody servers list` | List user rentals |
| GET | `/api/v1/rentals/{id}` | `api.servers.get` | `hoody servers get` | Get rental details |
| POST | `/api/v1/rentals/{id}/extend` | `api.servers.extend` | `hoody servers extend` | Extend rental |
| GET | `/api/v1/rentals/{id}/runtime` | `api.servers.getStats` | `hoody servers stats` | Get live runtime info for a rented server or subserver |
| GET | `/api/v1/reservations` | `api.servers.reservations.list` | `hoody servers reservations list` | Your reservations |
| GET | `/api/v1/reservations/{id}` | `api.servers.reservations.get` | `hoody servers reservations get` | One of your reservations |
| POST | `/api/v1/servers/{id}/rent` | `api.servers.rent` | `hoody servers rent` | Rent server |
| GET | `/api/v1/servers/{serverId}/available-commands` | `api.servers.commands.list` | `hoody servers commands list` | Get available commands |
| POST | `/api/v1/servers/{serverId}/execute-command` | `api.servers.commands.run` | `hoody servers commands run` | Execute server command |
| GET | `/api/v1/servers/available` | `api.servers.listMarketplace` | `hoody servers marketplace list` | Browse rental marketplace |
| GET | `/api/v1/storage/incoming` | `api.storage.shares.listIncoming` | `hoody storage incoming list` | Get all incoming shares |
| GET | `/api/v1/storage/shares` | `api.storage.shares.list` | `hoody storage shares list` | List all your storage shares |
| DELETE | `/api/v1/storage/shares/{shareId}` | `api.storage.shares.delete` | `hoody storage shares delete` | Delete storage share |
| GET | `/api/v1/subserver-operations/{id}` | `api.servers.jobs.get` | `hoody servers jobs get` | Status of a paid subserver operation |
| GET | `/api/v1/subserver-plans` | `api.servers.plans.list` | `hoody servers plans list` | List subserver plans available to you |
| GET | `/api/v1/subserver-subscriptions` | `api.servers.subscriptions.list` | `hoody servers subscriptions list` | List your paid subserver subscriptions |
| POST | `/api/v1/subserver-subscriptions` | `api.servers.subscriptions.buy` | `hoody servers subscriptions buy` | Buy a paid subserver (charges immediately) |
| GET | `/api/v1/subserver-subscriptions/{id}` | `api.servers.subscriptions.get` | `hoody servers subscriptions get` | One of your paid subserver subscriptions |
| PUT | `/api/v1/subserver-subscriptions/{id}/auto-renew` | `api.servers.subscriptions.enableAutoRenew` | `hoody servers subscriptions autorenew enable` | Turn auto-renew on or off |
| POST | `/api/v1/subserver-subscriptions/{id}/cancel` | `api.servers.subscriptions.cancel` | `hoody servers subscriptions cancel` | Cancel a paid subserver subscription |
| POST | `/api/v1/subserver-subscriptions/{id}/pay` | `api.servers.subscriptions.pay` | `hoody servers subscriptions pay` | Pay a held subscription and resume it (charges one month) |
| GET | `/api/v1/subserver-subscriptions/{id}/quote` | `api.servers.subscriptions.quote` | `hoody servers subscriptions quote` | Quote an upgrade or a payment |
| POST | `/api/v1/subserver-subscriptions/{id}/upgrade` | `api.servers.subscriptions.upgrade` | `hoody servers subscriptions upgrade` | Upgrade a paid subserver (charges the difference) |
| GET | `/api/v1/subserver-subscriptions/quote` | `api.servers.plans.quote` | `hoody servers plans quote` | Quote a paid subserver purchase |
| GET | `/api/v1/users/{id}` | `api.users.get` | `hoody users get` | Get user by ID |
| PUT | `/api/v1/users/{id}` | `api.users.update` | `hoody users update` | Update user profile |
| DELETE | `/api/v1/users/auth/2fa` | `api.auth.twoFactor.disable` | `hoody auth 2fa disable` | Disable 2FA |
| POST | `/api/v1/users/auth/2fa/backup-codes/regenerate` | `api.auth.twoFactor.rotateBackupCodes` | `hoody auth 2fa backup codes rotate` | Regenerate Backup Codes |
| POST | `/api/v1/users/auth/2fa/setup` | `api.auth.twoFactor.startSetup` | `hoody auth 2fa setup start` | Initialize 2FA Setup |
| GET | `/api/v1/users/auth/2fa/status` | `api.auth.twoFactor.getStatus` | `hoody auth 2fa status` | Get 2FA Status |
| PUT | `/api/v1/users/auth/2fa/token-gate` | `api.auth.twoFactor.enableTokenGate` | `hoody auth 2fa gate enable` | Set 2FA token gate preference |
| POST | `/api/v1/users/auth/2fa/verify` | `api.auth.twoFactor.verify` | `hoody auth 2fa verify` | Verify 2FA Code During Login |
| POST | `/api/v1/users/auth/2fa/verify-setup` | `api.auth.twoFactor.confirmSetup` | `hoody auth 2fa setup confirm` | Complete 2FA Setup |
| GET | `/api/v1/users/auth/activity` | `api.activity.list` | `hoody activity list` | Get activity logs |
| GET | `/api/v1/users/auth/activity/stats` | `api.activity.getStats` | `hoody activity stats` | Get activity stats |
| POST | `/api/v1/users/auth/identity-claim` | `api.auth.createIdentityClaim` | `hoody auth claims create` | Issue a fresh audience-bound identity claim |
| POST | `/api/v1/users/auth/login` | `api.auth.login` | — | Login with username and password |
| POST | `/api/v1/users/auth/logout` | `api.auth.logoutAll` | — | Log out everywhere |
| GET | `/api/v1/users/auth/me` | `api.auth.whoami` | `hoody auth whoami` | Get current user profile |
| POST | `/api/v1/users/auth/refresh` | `api.auth.refresh` | `hoody auth refresh` | Refresh access token |
| GET | `/api/v1/users/me/free-tier-status` | `api.users.getFreeTierStatus` | `hoody users free tier status` | Get free-tier claim status |
| POST | `/api/v1/users/me/onboarding` | `api.users.completeOnboardingMilestone` | `hoody users onboarding milestones complete` | Mark an onboarding milestone as completed |
| POST | `/api/v1/users/me/redeem-invite` | `api.users.redeemInvite` | `hoody users invites redeem` | Redeem a beta invite code |
| POST | `/api/v1/users/me/retry-setup` | `api.users.retrySetup` | `hoody users setup retry` | Retry free-tier account setup |
| GET | `/api/v1/users/me/security-history` | `api.users.listSecurityHistory` | `hoody users security history list` | Get your account security history |
| DELETE | `/api/v1/vault` | `api.vault.clear` | `hoody vault clear` | Clear entire vault |
| GET | `/api/v1/vault/keys` | `api.vault.list` | `hoody vault list` | List vault keys |
| DELETE | `/api/v1/vault/keys/{key}` | `api.vault.delete` | `hoody vault delete` | Delete vault key |
| GET | `/api/v1/vault/keys/{key}` | `api.vault.get` | `hoody vault get` | Get vault key |
| PUT | `/api/v1/vault/keys/{key}` | `api.vault.set` | `hoody vault set` | Set vault key |
| GET | `/api/v1/vault/stats` | `api.vault.getStats` | `hoody vault stats` | Get vault statistics |
| GET | `/api/v1/wallet/ai-fee-history` | `api.wallet.listCreditFees` | `hoody wallet credits fees list` | Get AI credit fee history |
| GET | `/api/v1/wallet/balances` | `api.wallet.getBalances` | `hoody wallet balances get` | Get aggregate balances (general + AI) |
| GET | `/api/v1/wallet/balances/ai` | `api.wallet.getCredits` | `hoody wallet credits get` | Get AI balance (limit, usage, remaining) |
| GET | `/api/v1/wallet/balances/general` | `api.wallet.getBalance` | `hoody wallet balance get` | Get general balance only |
| GET | `/api/v1/wallet/github-bonus` | `api.wallet.getGithubBonus` | `hoody wallet github bonus status` | Get GitHub connection bonus status |
| POST | `/api/v1/wallet/github-bonus/claim` | `api.wallet.claimGithubBonus` | `hoody wallet github bonus claim` | Claim the GitHub connection bonus |
| GET | `/api/v1/wallet/invoices/` | `api.wallet.listInvoices` | `hoody wallet invoices list` | Get all invoices |
| GET | `/api/v1/wallet/invoices/{id}` | `api.wallet.getInvoice` | `hoody wallet invoices get` | Get invoice by ID |
| GET | `/api/v1/wallet/invoices/{id}/pdf` | `api.wallet.downloadInvoice` | `hoody wallet invoices download` | Download invoice PDF |
| POST | `/api/v1/wallet/invoices/generate/{id}` | `api.wallet.createInvoice` | `hoody wallet invoices create` | Generate invoice for transaction |
| GET | `/api/v1/wallet/payment-availability` | `api.wallet.getPaymentAvailability` | `hoody wallet payments availability get` | Get top-up payment availability (providers, bounds, AI transfer fee) |
| GET | `/api/v1/wallet/payment-methods/` | `api.wallet.listPaymentMethods` | `hoody wallet payments methods list` | Get all payment methods |
| POST | `/api/v1/wallet/payment-methods/` | `api.wallet.createPaymentMethod` | `hoody wallet payments methods create` | Add a new payment method |
| DELETE | `/api/v1/wallet/payment-methods/{id}` | `api.wallet.deletePaymentMethod` | `hoody wallet payments methods delete` | Delete a payment method |
| GET | `/api/v1/wallet/payment-methods/{id}` | `api.wallet.getPaymentMethod` | `hoody wallet payments methods get` | Get payment method by ID |
| PUT | `/api/v1/wallet/payment-methods/{id}` | `api.wallet.updatePaymentMethod` | `hoody wallet payments methods update` | Update a payment method |
| PUT | `/api/v1/wallet/payment-methods/{id}/default` | `api.wallet.setDefaultPaymentMethod` | `hoody wallet payments methods default set` | Set a payment method as default |
| GET | `/api/v1/wallet/payments/crypto/intents` | `api.wallet.listCryptoPaymentIntents` | `hoody wallet payments crypto intents list` | List crypto payment intents |
| GET | `/api/v1/wallet/payments/crypto/intents/{id}` | `api.wallet.getCryptoPaymentIntent` | `hoody wallet payments crypto intents get` | Get a crypto payment intent |
| POST | `/api/v1/wallet/payments/crypto/invoice` | `api.wallet.createCryptoInvoice` | `hoody wallet payments crypto invoices create` | Start a crypto payment (hosted invoice) |
| POST | `/api/v1/wallet/payments/stripe/checkout` | `api.wallet.createStripeCheckout` | `hoody wallet payments stripe checkout create` | Start a card payment (Stripe Checkout) |
| GET | `/api/v1/wallet/payments/stripe/intents` | `api.wallet.listStripePaymentIntents` | `hoody wallet payments stripe intents list` | List card payment intents |
| GET | `/api/v1/wallet/payments/stripe/intents/{id}` | `api.wallet.getStripePaymentIntent` | `hoody wallet payments stripe intents get` | Get a card payment intent |
| GET | `/api/v1/wallet/transactions` | `api.wallet.listTransactions` | `hoody wallet transactions list` | List transactions |
| GET | `/api/v1/wallet/transactions/{id}` | `api.wallet.getTransaction` | `hoody wallet transactions get` | Get transaction by ID |
| POST | `/api/v1/wallet/transfers` | `api.wallet.transferToCredits` | `hoody wallet credits transfer` | Transfer from general balance to AI credits |

---

## `bot` — 17 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/bot/health` | `bot.kit.getHealth` | `hoody bot health` | Nine-field kit health; unauthenticated by design. |
| POST | `/api/v1/bot/kit/keys/rotate` | `bot.kit.rotateKeys` | `hoody bot keys rotate` | Re-encrypt every sealed column under a new kit key. |
| GET | `/api/v1/bot/manifest` | `bot.kit.getManifest` | `hoody bot manifest get` | The chat manifest this build is pinned to, as it was baked. |
| GET | `/api/v1/bot/registrations` | `bot.registrations.list` | `hoody bot list` | List the registrations owned by the calling account. |
| POST | `/api/v1/bot/registrations` | `bot.registrations.create` | `hoody bot create` | Register a channel bot; the token arrives in the body and is stored encrypted. |
| DELETE | `/api/v1/bot/registrations/{registrationId}` | `bot.registrations.delete` | `hoody bot delete` | Delete a registration and its stored channel token. |
| GET | `/api/v1/bot/registrations/{registrationId}` | `bot.registrations.get` | `hoody bot get` | Read one registration. |
| POST | `/api/v1/bot/registrations/{registrationId}/commands/sync` | `bot.registrations.syncCommands` | `hoody bot commands sync` | Publish the registered commands to the channel and return the readback diff. |
| DELETE | `/api/v1/bot/registrations/{registrationId}/logs` | `bot.registrations.purgeLogs` | `hoody bot logs purge` | Delete audit rows older than a cutoff, never inside the retention window. |
| GET | `/api/v1/bot/registrations/{registrationId}/logs` | `bot.registrations.listLogs` | `hoody bot logs list` | Read the redacted audit log of a registration, newest first. |
| GET | `/api/v1/bot/registrations/{registrationId}/policy` | `bot.registrations.getPolicy` | `hoody bot policy get` | Read a registration’s mode and allowlists. |
| PUT | `/api/v1/bot/registrations/{registrationId}/policy` | `bot.registrations.updatePolicy` | `hoody bot policy update` | Set a registration’s mode and allowlists. |
| PUT | `/api/v1/bot/registrations/{registrationId}/profile` | `bot.registrations.updateProfile` | `hoody bot profile update` | Set the bot profile (name, descriptions, default admin rights) and publish it. |
| POST | `/api/v1/bot/registrations/{registrationId}/sessions/{channelUserId}/revoke` | `bot.registrations.revokeSession` | `hoody bot sessions revoke` | Revoke one chat user’s login: delete the leaf through the parent and forget it. |
| POST | `/api/v1/bot/registrations/{registrationId}/start` | `bot.registrations.start` | `hoody bot start` | Start long-polling for a registration. |
| POST | `/api/v1/bot/registrations/{registrationId}/stop` | `bot.registrations.stop` | `hoody bot stop` | Stop long-polling for a registration. |
| POST | `/api/v1/bot/registrations/{registrationId}/tokens/revoke-all` | `bot.registrations.revokeAllTokens` | `hoody bot tokens revoke` | Revoke every chat user’s lineage for this registration. |

---

## `browser` — 28 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| POST | `/api/v1/browser/action` | `browser.page.act` | `hoody browser act` | Perform a native element action |
| POST | `/api/v1/browser/browse` | `browser.page.navigate` | `hoody browser navigate` | Navigate to URL (POST) |
| GET | `/api/v1/browser/console` | `browser.logs.listConsole` | `hoody browser logs console list` | Get console logs |
| DELETE | `/api/v1/browser/cookies` | `browser.cookies.clear` | `hoody browser cookies clear` | Clear all cookies |
| GET | `/api/v1/browser/cookies` | `browser.cookies.list` | `hoody browser cookies list` | Get cookies |
| POST | `/api/v1/browser/cookies` | `browser.cookies.setMany` | `hoody browser cookies batch set` | Set cookies |
| GET | `/api/v1/browser/devtools-url` | `browser.instances.getDevtoolsUrls` | `hoody browser devtools urls get` | Get DevTools URLs |
| POST | `/api/v1/browser/eval` | `browser.page.evaluate` | `hoody browser evaluate` | Execute JavaScript (POST) |
| GET | `/api/v1/browser/health` | `browser.kit.getHealth` | `hoody browser health` | Health check |
| DELETE | `/api/v1/browser/history` | `browser.history.clear` | `hoody browser history clear` | Delete browsing history |
| GET | `/api/v1/browser/history` | `browser.history.list` | `hoody browser history list` | Query browsing history |
| GET | `/api/v1/browser/html` | `browser.page.getHtml` | `hoody browser html get` | Get page HTML |
| GET | `/api/v1/browser/metadata` | `browser.instances.get` | `hoody browser get` | Get instance metadata |
| GET | `/api/v1/browser/metrics` | `browser.kit.getStats` | `hoody browser stats` | Server metrics |
| GET | `/api/v1/browser/network` | `browser.logs.listNetwork` | `hoody browser logs network list` | Get network logs |
| GET | `/api/v1/browser/pdf` | `browser.page.exportPdf` | `hoody browser pdf export` | Export page as PDF |
| GET | `/api/v1/browser/restart` | `browser.instances.restart` | `hoody browser restart` | Restart browser instance |
| GET | `/api/v1/browser/screenshot` | `browser.page.captureScreenshot` | `hoody browser screenshots capture` | Capture browser screenshot |
| GET | `/api/v1/browser/shutdown` | `browser.instances.shutdown` | `hoody browser shutdown` | Shutdown browser instance |
| GET | `/api/v1/browser/snapshot` | `browser.page.getSnapshot` | `hoody browser snapshot get` | Accessibility snapshot of a tab with element refs |
| GET | `/api/v1/browser/start` | `browser.instances.start` | `hoody browser start` | Create or retrieve browser instance |
| GET | `/api/v1/browser/stop` | `browser.instances.stop` | `hoody browser stop` | Stop browser instance |
| POST | `/api/v1/browser/tab/close` | `browser.tabs.close` | `hoody browser tabs close` | Close a browser tab |
| GET | `/api/v1/browser/tabs` | `browser.tabs.list` | `hoody browser tabs list` | List browser tabs |
| GET | `/api/v1/browser/text` | `browser.page.getText` | `hoody browser text get` | Get page text |
| GET | `/api/v1/browser/viewport` | `browser.viewport.get` | `hoody browser viewport get` | Get the current viewport policy |
| POST | `/api/v1/browser/viewport` | `browser.viewport.set` | `hoody browser viewport set` | Change the viewport at runtime |
| POST | `/api/v1/browser/wait` | `browser.page.wait` | `hoody browser wait` | Wait for a condition in a tab |

---

## `code` — 10 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| DELETE | `/api/v1/code` | `code.stop` | `hoody code stop` | Stop an editor instance |
| POST | `/api/v1/code/extensions/install` | `code.extensions.install` | `hoody code extensions install` | Stage a VS Code extension from a URL |
| GET | `/api/v1/code/extensions/list` | `code.extensions.list` | `hoody code extensions list` | Staged extensions, and what the instance appears to have installed |
| GET | `/api/v1/code/health` | `code.kit.getHealth` | `hoody code health` | Service health check |
| GET | `/api/v1/code/manifest.json` | `code.ui.getManifest` | — | Web application manifest for installing the editor |
| GET | `/api/v1/code/version` | `code.kit.getVersion` | `hoody code version` | Versions of the running orchestrator and its packaged editor |
| GET | `/favicon.ico` | `code.ui.getFavicon` | — | Site icon |
| GET | `/robots.txt` | `code.ui.getRobots` | — | Crawler policy |
| GET | `/security.txt` | `code.ui.getSecurityPolicy` | — | Security contact information |
| GET | `/status` | `code.kit.getStatus` | `hoody code status` | Get orchestrator and instance status |

---

## `cron` — 9 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/cron/crontab` | `cron.crontabs.list` | `hoody cron crontabs list` | List All Crontabs |
| GET | `/api/v1/cron/health` | `cron.kit.getHealth` | `hoody cron health` | Health Check |
| GET | `/api/v1/cron/users/{user}/crontab` | `cron.crontabs.get` | `hoody cron crontabs get` | Get Crontab |
| PUT | `/api/v1/cron/users/{user}/crontab` | `cron.crontabs.set` | `hoody cron crontabs set` | Put Crontab |
| GET | `/api/v1/cron/users/{user}/entries` | `cron.entries.list` | `hoody cron entries list` | List Entries |
| POST | `/api/v1/cron/users/{user}/entries` | `cron.entries.create` | `hoody cron entries create` | Create Entry |
| DELETE | `/api/v1/cron/users/{user}/entries/{id}` | `cron.entries.delete` | `hoody cron entries delete` | Delete Entry |
| GET | `/api/v1/cron/users/{user}/entries/{id}` | `cron.entries.get` | `hoody cron entries get` | Get Entry |
| PATCH | `/api/v1/cron/users/{user}/entries/{id}` | `cron.entries.update` | `hoody cron entries update` | Update Entry |

---

## `curl` — 22 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/curl/channel` | `curl.channel.connect` | — | Execute cURL requests over a WebSocket channel |
| GET | `/api/v1/curl/health` | `curl.kit.getHealth` | `hoody curl health` | Service health check |
| GET | `/api/v1/curl/jobs` | `curl.jobs.list` | `hoody curl jobs list` | List all async jobs |
| DELETE | `/api/v1/curl/jobs/{id}` | `curl.jobs.cancel` | `hoody curl jobs cancel` | Cancel a pending or running job, or delete a finished one |
| GET | `/api/v1/curl/jobs/{id}` | `curl.jobs.get` | `hoody curl jobs get` | Get detailed job information |
| GET | `/api/v1/curl/jobs/{id}/result` | `curl.jobs.getResult` | `hoody curl jobs result get` | Get job response body |
| POST | `/api/v1/curl/request` | `curl.run` | `hoody curl run` | Execute HTTP request with full cURL capabilities |
| GET | `/api/v1/curl/schedule` | `curl.schedules.list` | `hoody curl schedules list` | List all scheduled jobs |
| POST | `/api/v1/curl/schedule` | `curl.schedules.create` | `hoody curl schedules create` | Create a recurring scheduled job |
| DELETE | `/api/v1/curl/schedule/{id}` | `curl.schedules.delete` | `hoody curl schedules delete` | Delete a schedule |
| GET | `/api/v1/curl/schedule/{id}` | `curl.schedules.get` | `hoody curl schedules get` | Get schedule details |
| PATCH | `/api/v1/curl/schedule/{id}` | `curl.schedules.update` | `hoody curl schedules update` | Update a schedule's cron expression, request or enabled state |
| GET | `/api/v1/curl/sessions` | `curl.sessions.list` | `hoody curl sessions list` | List all cookie sessions |
| DELETE | `/api/v1/curl/sessions/{id}` | `curl.sessions.delete` | `hoody curl sessions delete` | Delete a session |
| GET | `/api/v1/curl/sessions/{id}` | `curl.sessions.get` | `hoody curl sessions get` | Get session details |
| GET | `/api/v1/curl/sessions/{id}/cookies` | `curl.sessions.listCookies` | `hoody curl sessions cookies list` | Get session cookies only |
| GET | `/api/v1/curl/sse` | `curl.jobs.stream` | `hoody curl jobs stream` | Subscribe to job events over Server-Sent Events |
| GET | `/api/v1/curl/storage` | `curl.storage.list` | `hoody curl storage list` | List all saved downloads |
| DELETE | `/api/v1/curl/storage/{path}` | `curl.storage.delete` | `hoody curl storage delete` | Delete a saved file or directory |
| GET | `/api/v1/curl/storage/{path}` | `curl.storage.get` | `hoody curl storage get` | Download a saved file |
| GET | `/api/v1/curl/ws` | `curl.jobs.connect` | — | Subscribe to job events over WebSocket |
| GET | `/metrics` | `curl.kit.getMetrics` | `hoody curl metrics` | Prometheus metrics |

---

## `daemon` — 21 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/daemon/health` | `daemon.kit.getHealth` | `hoody daemon health` | Service health check |
| GET | `/api/v1/daemon/programs` | `daemon.programs.list` | `hoody daemon programs list` | List all programs |
| GET | `/api/v1/daemon/programs/{id}` | `daemon.programs.get` | `hoody daemon programs get` | Get a specific program |
| POST | `/api/v1/daemon/programs/{id}/disable` | `daemon.programs.disable` | `hoody daemon programs disable` | Disable a program |
| POST | `/api/v1/daemon/programs/{id}/enable` | `daemon.programs.enable` | `hoody daemon programs enable` | Enable a program |
| GET | `/api/v1/daemon/programs/{id}/logs` | `daemon.programs.getLogs` | `hoody daemon programs logs get` | Get program logs |
| GET | `/api/v1/daemon/programs/{id}/logs/stream` | `daemon.programs.streamLogs` | `hoody daemon programs logs stream` | Follow program logs (SSE) |
| GET | `/api/v1/daemon/programs/{id}/sandbox` | `daemon.programs.getSandbox` | `hoody daemon programs sandbox get` | Get sandbox status for a program |
| POST | `/api/v1/daemon/programs/{id}/start` | `daemon.programs.start` | `hoody daemon programs start` | Start a program or port instance |
| POST | `/api/v1/daemon/programs/{id}/stop` | `daemon.programs.stop` | `hoody daemon programs stop` | Stop a program or port instance |
| POST | `/api/v1/daemon/programs/add` | `daemon.programs.create` | `hoody daemon programs create` | Add a new CUSTOM program |
| POST | `/api/v1/daemon/programs/edit/{id}` | `daemon.programs.update` | `hoody daemon programs update` | Edit a program |
| POST | `/api/v1/daemon/programs/remove/{id}` | `daemon.programs.delete` | `hoody daemon programs delete` | Remove a program |
| POST | `/api/v1/daemon/programs/reset` | `daemon.programs.reset` | `hoody daemon programs reset` | Reset programs to default |
| GET | `/api/v1/daemon/quick-start` | `daemon.ephemeralPrograms.list` | `hoody daemon ephemeral programs list` | List all ephemeral programs |
| POST | `/api/v1/daemon/quick-start` | `daemon.ephemeralPrograms.start` | `hoody daemon ephemeral programs start` | Launch ephemeral CUSTOM program |
| GET | `/api/v1/daemon/quick-start/{id}/logs` | `daemon.ephemeralPrograms.getLogs` | `hoody daemon ephemeral programs logs get` | Get ephemeral program logs |
| GET | `/api/v1/daemon/quick-start/{id}/status` | `daemon.ephemeralPrograms.getStatus` | `hoody daemon ephemeral programs status` | Get ephemeral program status |
| POST | `/api/v1/daemon/quick-start/{id}/stop` | `daemon.ephemeralPrograms.stop` | `hoody daemon ephemeral programs stop` | Stop ephemeral program |
| GET | `/api/v1/daemon/status` | `daemon.programs.listStatus` | `hoody daemon programs status` | Get all program statuses |
| GET | `/api/v1/daemon/status/{id}` | `daemon.programs.getStatus` | `hoody daemon programs status` | Get specific program status |

---

## `display` — 46 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/display/clipboard` | `display.clipboard.get` | `hoody display clipboard get` | Read clipboard text |
| POST | `/api/v1/display/clipboard` | `display.clipboard.set` | `hoody display clipboard set` | Write clipboard text |
| GET | `/api/v1/display/health` | `display.kit.getHealth` | `hoody display health` | Service health check |
| GET | `/api/v1/display/info` | `display.get` | `hoody display get` | Get display information and screenshots |
| POST | `/api/v1/display/input/act` | `display.input.act` | `hoody display input act` | Execute one action with optional screenshot |
| POST | `/api/v1/display/input/batch` | `display.input.actMany` | `hoody display input batch act` | Execute a sequence of actions |
| POST | `/api/v1/display/input/click-at` | `display.input.click` | `hoody display input click` | Move cursor and click |
| GET | `/api/v1/display/input/display-geometry` | `display.getGeometry` | `hoody display geometry get` | Get display dimensions |
| POST | `/api/v1/display/input/drag` | `display.input.drag` | `hoody display input drag` | Drag from one position to another |
| POST | `/api/v1/display/input/reset` | `display.input.reset` | `hoody display input reset` | Emergency release all inputs |
| POST | `/api/v1/display/input/select` | `display.input.select` | `hoody display input select` | Select a range via click + shift-click |
| POST | `/api/v1/display/input/type-at` | `display.input.type` | `hoody display input type` | Move, click, and type in one operation |
| POST | `/api/v1/display/input/wait` | `display.input.wait` | `hoody display input wait` | Wait for a duration with optional screenshot |
| POST | `/api/v1/display/input/wait-until` | `display.windows.wait` | `hoody display windows wait` | Wait for a window to appear or disappear |
| POST | `/api/v1/display/keyboard/key` | `display.keyboard.press` | `hoody display keyboard press` | Press key combinations |
| POST | `/api/v1/display/keyboard/key-down` | `display.keyboard.down` | `hoody display keyboard down` | Hold a key down |
| POST | `/api/v1/display/keyboard/key-up` | `display.keyboard.up` | `hoody display keyboard up` | Release a held key |
| POST | `/api/v1/display/keyboard/type` | `display.keyboard.type` | `hoody display keyboard type` | Type a string of text |
| POST | `/api/v1/display/mouse/click` | `display.mouse.click` | `hoody display mouse click` | Click a mouse button |
| POST | `/api/v1/display/mouse/double-click` | `display.mouse.doubleClick` | `hoody display mouse click` | Double-click a mouse button |
| POST | `/api/v1/display/mouse/down` | `display.mouse.down` | `hoody display mouse down` | Press and hold a mouse button |
| GET | `/api/v1/display/mouse/location` | `display.mouse.getPosition` | `hoody display mouse position get` | Get cursor position |
| POST | `/api/v1/display/mouse/move` | `display.mouse.move` | `hoody display mouse move` | Move cursor to absolute position |
| POST | `/api/v1/display/mouse/move-relative` | `display.mouse.moveBy` | `hoody display mouse move` | Move cursor by offset |
| POST | `/api/v1/display/mouse/scroll` | `display.mouse.scroll` | `hoody display mouse scroll` | Scroll in a direction |
| POST | `/api/v1/display/mouse/up` | `display.mouse.up` | `hoody display mouse up` | Release a mouse button |
| GET | `/api/v1/display/screenshot` | `display.screenshots.capture` | `hoody display screenshots capture` | Capture a new screenshot |
| GET | `/api/v1/display/screenshot/{timestamp}` | `display.screenshots.get` | `hoody display screenshots get` | Retrieve a specific screenshot by timestamp |
| GET | `/api/v1/display/screenshot/last` | `display.screenshots.getLatest` | `hoody display screenshots latest get` | Retrieve the most recent screenshot |
| GET | `/api/v1/display/screenshots` | `display.screenshots.list` | `hoody display screenshots list` | List all available screenshots |
| GET | `/api/v1/display/thumbnail` | `display.thumbnails.capture` | `hoody display thumbnails capture` | Capture a new screenshot thumbnail |
| GET | `/api/v1/display/thumbnail/{timestamp}` | `display.thumbnails.get` | `hoody display thumbnails get` | Retrieve a specific thumbnail by timestamp |
| GET | `/api/v1/display/thumbnail/last` | `display.thumbnails.getLatest` | `hoody display thumbnails latest get` | Retrieve the most recent thumbnail |
| GET | `/api/v1/display/window/{windowId}/geometry` | `display.windows.getGeometry` | `hoody display windows geometry get` | Get window position and size |
| GET | `/api/v1/display/window/{windowId}/name` | `display.windows.getTitle` | `hoody display windows title get` | Get window title |
| GET | `/api/v1/display/window/{windowId}/properties` | `display.windows.get` | `hoody display windows get` | Get extended properties for a window |
| GET | `/api/v1/display/window/active` | `display.windows.getActive` | `hoody display windows active get` | Get the active window ID |
| POST | `/api/v1/display/window/close` | `display.windows.close` | `hoody display windows close` | Close a window |
| POST | `/api/v1/display/window/focus` | `display.windows.focus` | `hoody display windows focus` | Focus/activate a window |
| POST | `/api/v1/display/window/minimize` | `display.windows.minimize` | `hoody display windows minimize` | Minimize a window |
| POST | `/api/v1/display/window/move` | `display.windows.move` | `hoody display windows move` | Move a window |
| POST | `/api/v1/display/window/raise` | `display.windows.raise` | `hoody display windows raise` | Raise a window to the top |
| POST | `/api/v1/display/window/resize` | `display.windows.resize` | `hoody display windows resize` | Resize a window |
| POST | `/api/v1/display/window/restore` | `display.windows.restore` | `hoody display windows restore` | Restore (un-minimize) a window |
| POST | `/api/v1/display/window/search` | `display.windows.search` | `hoody display windows search` | Search for windows by pattern |
| GET | `/api/v1/display/windows` | `display.windows.list` | `hoody display windows list` | List windows on the current display |

---

## `egress` — 5 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/egress/health` | `egress.kit.getHealth` | `hoody egress health` | Service health check |
| DELETE | `/api/v1/egress/upstream` | `egress.upstream.disable` | `hoody egress upstream disable` | Disable upstream |
| GET | `/api/v1/egress/upstream` | `egress.upstream.get` | `hoody egress upstream get` | Get upstream status |
| PUT | `/api/v1/egress/upstream` | `egress.upstream.set` | `hoody egress upstream set` | Set upstream |
| POST | `/api/v1/egress/upstream/renew` | `egress.upstream.renewLease` | `hoody egress upstream renew` | Renew the upstream lease |

---

## `exec` — 68 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/{path}` | `exec.run` | — | Run a user script with any HTTP method (GET by default), a query, a body and headers |
| POST | `/api/v1/exec/cache/clear` | `exec.cache.clear` | `hoody exec cache clear` | Clear Cache |
| GET | `/api/v1/exec/dependencies/bundled` | `exec.modules.listBundled` | `hoody exec modules list` | List Bundled Dependencies |
| POST | `/api/v1/exec/dependencies/check` | `exec.modules.test` | `hoody exec modules test` | Check Dependencies |
| POST | `/api/v1/exec/dependencies/install` | `exec.modules.install` | `hoody exec modules install` | Install Dependencies |
| GET | `/api/v1/exec/health` | `exec.kit.getHealth` | `hoody exec health` | Health Check |
| GET | `/api/v1/exec/list` | `exec.namespaces.list` | `hoody exec namespaces list` | List All Exec Ids |
| DELETE | `/api/v1/exec/logs/clear` | `exec.logs.clear` | `hoody exec logs clear` | Clear Logs |
| GET | `/api/v1/exec/logs/list` | `exec.logs.list` | `hoody exec logs list` | List Logs |
| POST | `/api/v1/exec/logs/read` | `exec.logs.get` | `hoody exec logs get` | Read Log |
| POST | `/api/v1/exec/logs/search` | `exec.logs.search` | `hoody exec logs search` | Search Logs |
| GET | `/api/v1/exec/logs/stream` | `exec.logs.stream` | `hoody exec logs stream` | Stream Logs |
| POST | `/api/v1/exec/magic-comments/bulk-update` | `exec.magicComments.updateMany` | `hoody exec magic comments batch update` | Bulk Update Magic Comments |
| GET | `/api/v1/exec/magic-comments/read` | `exec.magicComments.get` | `hoody exec magic comments get` | Read Magic Comments |
| GET | `/api/v1/exec/magic-comments/schema` | `exec.magicComments.getSchema` | `hoody exec magic comments schema get` | Get Magic Comments Schema |
| PUT | `/api/v1/exec/magic-comments/update` | `exec.magicComments.update` | `hoody exec magic comments update` | Update Magic Comments Handler |
| GET | `/api/v1/exec/monitor/active-requests` | `exec.kit.listRequests` | `hoody exec requests list` | Get Active Requests |
| GET | `/api/v1/exec/monitor/metrics` | `exec.kit.getMetrics` | `hoody exec metrics` | Prometheus Export |
| POST | `/api/v1/exec/monitor/script-performance` | `exec.scripts.getStats` | `hoody exec scripts stats get` | Get Script Performance |
| GET | `/api/v1/exec/monitor/scripts` | `exec.scripts.listStats` | `hoody exec scripts stats list` | List Monitor Scripts |
| GET | `/api/v1/exec/monitor/stats` | `exec.kit.getStats` | `hoody exec stats` | Get Stats |
| POST | `/api/v1/exec/package/compare` | `exec.packages.compare` | `hoody exec packages compare` | Compare Packages |
| POST | `/api/v1/exec/package/init` | `exec.packages.createManifest` | `hoody exec packages manifest create` | Init package.json |
| POST | `/api/v1/exec/package/install` | `exec.packages.install` | `hoody exec packages install` | Install Packages |
| POST | `/api/v1/exec/package/pin` | `exec.packages.pin` | `hoody exec packages pin` | Pin Versions |
| GET | `/api/v1/exec/package/read` | `exec.packages.getManifest` | `hoody exec packages manifest get` | Read package.json |
| POST | `/api/v1/exec/package/update` | `exec.packages.updateManifest` | `hoody exec packages manifest update` | Update package.json |
| POST | `/api/v1/exec/route/discover` | `exec.routes.list` | `hoody exec routes list` | Discover Routes |
| POST | `/api/v1/exec/route/resolve` | `exec.routes.resolve` | `hoody exec routes resolve` | Resolve Route |
| POST | `/api/v1/exec/route/test` | `exec.routes.test` | `hoody exec routes test` | Test Route |
| GET | `/api/v1/exec/schedules/history` | `exec.schedules.listHistory` | `hoody exec schedules history list` | Schedule History |
| GET | `/api/v1/exec/schedules/list` | `exec.schedules.list` | `hoody exec schedules list` | List Schedules |
| POST | `/api/v1/exec/schedules/reload` | `exec.schedules.reload` | `hoody exec schedules reload` | Reload Schedules |
| POST | `/api/v1/exec/schedules/trigger` | `exec.schedules.run` | `hoody exec schedules run` | Trigger Schedule |
| DELETE | `/api/v1/exec/scripts/delete` | `exec.scripts.delete` | `hoody exec scripts delete` | Delete Script |
| GET | `/api/v1/exec/scripts/list` | `exec.scripts.list` | `hoody exec scripts list` | List Scripts |
| POST | `/api/v1/exec/scripts/move` | `exec.scripts.move` | `hoody exec scripts move` | Move Script |
| GET | `/api/v1/exec/scripts/read` | `exec.scripts.read` | `hoody exec scripts read` | Read Script |
| POST | `/api/v1/exec/scripts/tree` | `exec.scripts.getTree` | `hoody exec scripts tree get` | Get Script Tree |
| POST | `/api/v1/exec/scripts/write` | `exec.scripts.write` | `hoody exec scripts write` | Write Script |
| GET | `/api/v1/exec/sdk-types` | `exec.sdkTypes.list` | `hoody exec sdk types list` | Get Sdk Types |
| DELETE | `/api/v1/exec/sdk/{id}` | `exec.sdks.delete` | `hoody exec sdks delete` | Delete SDK |
| GET | `/api/v1/exec/sdk/{id}` | `exec.sdks.get` | `hoody exec sdks get` | Get SDK |
| POST | `/api/v1/exec/sdk/import` | `exec.sdks.import` | `hoody exec sdks import` | Import SDK |
| GET | `/api/v1/exec/sdk/list` | `exec.sdks.list` | `hoody exec sdks list` | List SDKs |
| POST | `/api/v1/exec/shared-state/clear` | `exec.store.clear` | `hoody exec store clear` | Clear Shared State |
| POST | `/api/v1/exec/shared-state/get` | `exec.store.get` | `hoody exec store get` | Get Shared State |
| POST | `/api/v1/exec/shared-state/set` | `exec.store.set` | `hoody exec store set` | Set Shared State |
| POST | `/api/v1/exec/system/restart` | `exec.kit.restart` | `hoody exec restart` | Restart Server |
| GET | `/api/v1/exec/system/restart-status` | `exec.kit.getStatus` | `hoody exec status` | Get Restart Status |
| POST | `/api/v1/exec/templates/create-custom` | `exec.templates.create` | `hoody exec templates create` | Create Custom Template |
| DELETE | `/api/v1/exec/templates/delete-custom/{name}` | `exec.templates.delete` | `hoody exec templates delete` | Delete Custom Template |
| POST | `/api/v1/exec/templates/generate` | `exec.templates.generate` | `hoody exec templates generate` | Generate From Template |
| GET | `/api/v1/exec/templates/list` | `exec.templates.list` | `hoody exec templates list` | List Templates |
| GET | `/api/v1/exec/templates/preview` | `exec.templates.preview` | `hoody exec templates preview` | Preview Template |
| PUT | `/api/v1/exec/templates/update-custom/{name}` | `exec.templates.update` | `hoody exec templates update` | Update Custom Template |
| POST | `/api/v1/exec/user-openapi/generate` | `exec.openapi.generate` | `hoody exec openapi generate` | Generate User OpenAPI |
| GET | `/api/v1/exec/user-openapi/list` | `exec.openapi.listScripts` | `hoody exec openapi scripts list` | List User Scripts |
| POST | `/api/v1/exec/user-openapi/merge` | `exec.openapi.merge` | `hoody exec openapi merge` | Merge OpenAPI Specs |
| GET | `/api/v1/exec/user-openapi/schema` | `exec.openapi.getSchema` | `hoody exec openapi schema get` | Serve Schema File |
| GET | `/api/v1/exec/user-openapi/spec` | `exec.openapi.get` | `hoody exec openapi get` | Serve Generated Spec |
| POST | `/api/v1/exec/user-openapi/validate` | `exec.openapi.validateSchema` | `hoody exec openapi schema validate` | Validate User Schema |
| POST | `/api/v1/exec/validate/dependencies` | `exec.scripts.validateDependencies` | `hoody exec scripts dependencies validate` | Validate Dependencies |
| POST | `/api/v1/exec/validate/magic-comments` | `exec.magicComments.validate` | `hoody exec magic comments validate` | Validate Magic Comments |
| POST | `/api/v1/exec/validate/return-type` | `exec.scripts.validateReturnType` | `hoody exec scripts returns validate` | Validate Return Type |
| POST | `/api/v1/exec/validate/script` | `exec.scripts.validate` | `hoody exec scripts validate` | Validate Script |
| POST | `/api/v1/exec/validate/syntax` | `exec.scripts.validateSyntax` | `hoody exec scripts syntax validate` | Validate Syntax |
| POST | `/api/v1/exec/validate/typescript` | `exec.scripts.validateTypes` | `hoody exec scripts types validate` | Validate TypeScript |

---

## `files` — 120 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/?download_history` | `files.downloads.listHistory` | `hoody files downloads history list` | Download history |
| GET | `/?extraction_history` | `files.extractions.listHistory` | `hoody files extractions history list` | Extraction history |
| GET | `/?extractions` | `files.extractions.listByDirectory` | — | List active extractions |
| GET | `/{archive}?extract` | `files.archives.extract` | `hoody files archives extract` | Extract archive |
| GET | `/{archive}?extract_file` | `files.archives.extractMember` | `hoody files archives members extract` | Extract file from archive |
| GET | `/{archive}?preview` | `files.archives.preview` | `hoody files archives preview` | Preview archive contents or read file |
| GET | `/{archive}?view_file` | `files.archives.readMember` | `hoody files archives members read` | View file from archive |
| GET | `/{directory}?download` | `files.downloads.create` | `hoody files downloads create` | Download file from remote URL |
| GET | `/{directory}?downloads` | `files.downloads.listByDirectory` | `hoody files downloads list` | List active downloads |
| GET | `/{directory}?q` | `files.search` | `hoody files search` | Search directory |
| GET | `/{directory}?zip` | `files.zip` | `hoody files zip` | Download directory as ZIP |
| GET | `/{image}?thumbnail` | `files.images.convert` | `hoody files images convert` | Process and convert images |
| CHECKAUTH | `/{path}` | `files.whoami` | `hoody files whoami` | Check authentication status |
| COPY | `/{path}` | `files.webdav.copy` | — | Copy a file |
| GET | `/{path}` | `files.ui.getPage` | — | List directory contents or download file |
| HEAD | `/{path}` | `files.exists` | `hoody files exists` | Get file metadata |
| LOCK | `/{path}` | `files.webdav.lock` | — | Lock file (WebDAV compatibility) |
| LOGOUT | `/{path}` | `files.logout` | — | Clear authentication |
| MOVE | `/{path}` | `files.webdav.move` | — | Move or rename file/directory |
| OPTIONS | `/{path}` | `files.webdav.getOptions` | — | Get allowed methods |
| PATCH | `/{path}` | `files.writeChunk` | `hoody files chunks write` | File operations |
| PROPFIND | `/{path}` | `files.webdav.getProperties` | — | Get WebDAV properties |
| PROPPATCH | `/{path}` | `files.webdav.updateProperties` | — | Update WebDAV properties |
| UNLOCK | `/{path}` | `files.webdav.unlock` | — | Unlock file (WebDAV compatibility) |
| PUT | `/{path}?touch` | `files.touch` | `hoody files touch` | Touch file (create or update mtime) |
| GET | `/{path}?type=ftp` | `files.ftp.get` | `hoody files ftp get` | Access file via FTP |
| GET | `/{path}?type=s3` | `files.s3.get` | `hoody files s3 get` | Access file from S3 |
| GET | `/{path}?type=ssh` | `files.ssh.get` | `hoody files ssh get` | Access file via SSH/SFTP |
| PUT | `/{path}?type=ssh` | `files.ssh.upload` | `hoody files ssh upload` | Upload file via SSH/SFTP |
| GET | `/{path}?type=webdav` | `files.webdav.get` | `hoody files webdav get` | Access file via WebDAV |
| GET | `/api/v1/backends` | `files.backends.list` | `hoody files backends list` | List all backends |
| DELETE | `/api/v1/backends/{id}` | `files.backends.delete` | `hoody files backends delete` | Disconnect backend |
| GET | `/api/v1/backends/{id}` | `files.backends.get` | `hoody files backends get` | Get backend details |
| PUT | `/api/v1/backends/{id}` | `files.backends.update` | `hoody files backends update` | Update backend credentials |
| GET | `/api/v1/backends/{id}/test` | `files.backends.test` | `hoody files backends test` | Test backend connection |
| POST | `/api/v1/backends/azureblob` | `files.backends.createAzureblob` | `hoody files backends azureblob create` | Connect to azureblob backend |
| POST | `/api/v1/backends/azurefiles` | `files.backends.createAzurefiles` | `hoody files backends azurefiles create` | Connect to azurefiles backend |
| POST | `/api/v1/backends/b2` | `files.backends.createB2` | `hoody files backends b2 create` | Connect to b2 backend |
| POST | `/api/v1/backends/box` | `files.backends.createBox` | `hoody files backends box create` | Connect to box backend |
| POST | `/api/v1/backends/cloudinary` | `files.backends.createCloudinary` | `hoody files backends cloudinary create` | Connect to cloudinary backend |
| POST | `/api/v1/backends/drive` | `files.backends.createDrive` | `hoody files backends drive create` | Connect to drive backend |
| POST | `/api/v1/backends/dropbox` | `files.backends.createDropbox` | `hoody files backends dropbox create` | Connect to dropbox backend |
| POST | `/api/v1/backends/fichier` | `files.backends.createFichier` | `hoody files backends fichier create` | Connect to fichier backend |
| POST | `/api/v1/backends/filefabric` | `files.backends.createFilefabric` | `hoody files backends filefabric create` | Connect to filefabric backend |
| POST | `/api/v1/backends/filescom` | `files.backends.createFilescom` | `hoody files backends filescom create` | Connect to filescom backend |
| POST | `/api/v1/backends/ftp` | `files.backends.createFtp` | `hoody files backends ftp create` | Connect to ftp backend |
| POST | `/api/v1/backends/gofile` | `files.backends.createGofile` | `hoody files backends gofile create` | Connect to gofile backend |
| POST | `/api/v1/backends/google-cloud-storage` | `files.backends.createGoogleCloudStorage` | `hoody files backends googlecloudstorage create` | Connect to google cloud storage backend |
| POST | `/api/v1/backends/google-photos` | `files.backends.createGooglePhotos` | `hoody files backends googlephotos create` | Connect to google photos backend |
| POST | `/api/v1/backends/hdfs` | `files.backends.createHdfs` | `hoody files backends hdfs create` | Connect to hdfs backend |
| POST | `/api/v1/backends/hidrive` | `files.backends.createHidrive` | `hoody files backends hidrive create` | Connect to hidrive backend |
| POST | `/api/v1/backends/http` | `files.backends.createHttp` | `hoody files backends http create` | Connect to http backend |
| POST | `/api/v1/backends/iclouddrive` | `files.backends.createIclouddrive` | `hoody files backends iclouddrive create` | Connect to iclouddrive backend |
| POST | `/api/v1/backends/imagekit` | `files.backends.createImagekit` | `hoody files backends imagekit create` | Connect to imagekit backend |
| POST | `/api/v1/backends/internetarchive` | `files.backends.createInternetarchive` | `hoody files backends internetarchive create` | Connect to internetarchive backend |
| POST | `/api/v1/backends/jottacloud` | `files.backends.createJottacloud` | `hoody files backends jottacloud create` | Connect to jottacloud backend |
| POST | `/api/v1/backends/koofr` | `files.backends.createKoofr` | `hoody files backends koofr create` | Connect to koofr backend |
| POST | `/api/v1/backends/linkbox` | `files.backends.createLinkbox` | `hoody files backends linkbox create` | Connect to linkbox backend |
| POST | `/api/v1/backends/mailru` | `files.backends.createMailru` | `hoody files backends mailru create` | Connect to mailru backend |
| POST | `/api/v1/backends/mega` | `files.backends.createMega` | `hoody files backends mega create` | Connect to mega backend |
| POST | `/api/v1/backends/netstorage` | `files.backends.createNetstorage` | `hoody files backends netstorage create` | Connect to netstorage backend |
| POST | `/api/v1/backends/onedrive` | `files.backends.createOnedrive` | `hoody files backends onedrive create` | Connect to onedrive backend |
| POST | `/api/v1/backends/opendrive` | `files.backends.createOpendrive` | `hoody files backends opendrive create` | Connect to opendrive backend |
| POST | `/api/v1/backends/oracleobjectstorage` | `files.backends.createOracleobjectstorage` | `hoody files backends oracleobjectstorage create` | Connect to oracleobjectstorage backend |
| POST | `/api/v1/backends/pcloud` | `files.backends.createPcloud` | `hoody files backends pcloud create` | Connect to pcloud backend |
| POST | `/api/v1/backends/pikpak` | `files.backends.createPikpak` | `hoody files backends pikpak create` | Connect to pikpak backend |
| POST | `/api/v1/backends/pixeldrain` | `files.backends.createPixeldrain` | `hoody files backends pixeldrain create` | Connect to pixeldrain backend |
| POST | `/api/v1/backends/premiumizeme` | `files.backends.createPremiumizeme` | `hoody files backends premiumizeme create` | Connect to premiumizeme backend |
| POST | `/api/v1/backends/protondrive` | `files.backends.createProtondrive` | `hoody files backends protondrive create` | Connect to protondrive backend |
| POST | `/api/v1/backends/putio` | `files.backends.createPutio` | `hoody files backends putio create` | Connect to putio backend |
| POST | `/api/v1/backends/qingstor` | `files.backends.createQingstor` | `hoody files backends qingstor create` | Connect to qingstor backend |
| POST | `/api/v1/backends/quatrix` | `files.backends.createQuatrix` | `hoody files backends quatrix create` | Connect to quatrix backend |
| POST | `/api/v1/backends/s3` | `files.backends.createS3` | `hoody files backends s3 create` | Connect to s3 backend |
| POST | `/api/v1/backends/seafile` | `files.backends.createSeafile` | `hoody files backends seafile create` | Connect to seafile backend |
| POST | `/api/v1/backends/sftp` | `files.backends.createSftp` | `hoody files backends sftp create` | Connect to sftp backend |
| POST | `/api/v1/backends/sharefile` | `files.backends.createSharefile` | `hoody files backends sharefile create` | Connect to sharefile backend |
| POST | `/api/v1/backends/sia` | `files.backends.createSia` | `hoody files backends sia create` | Connect to sia backend |
| POST | `/api/v1/backends/smb` | `files.backends.createSmb` | `hoody files backends smb create` | Connect to smb backend |
| POST | `/api/v1/backends/sugarsync` | `files.backends.createSugarsync` | `hoody files backends sugarsync create` | Connect to sugarsync backend |
| POST | `/api/v1/backends/swift` | `files.backends.createSwift` | `hoody files backends swift create` | Connect to swift backend |
| POST | `/api/v1/backends/ulozto` | `files.backends.createUlozto` | `hoody files backends ulozto create` | Connect to ulozto backend |
| POST | `/api/v1/backends/webdav` | `files.backends.createWebdav` | `hoody files backends webdav create` | Connect to webdav backend |
| POST | `/api/v1/backends/yandex` | `files.backends.createYandex` | `hoody files backends yandex create` | Connect to yandex backend |
| POST | `/api/v1/backends/zoho` | `files.backends.createZoho` | `hoody files backends zoho create` | Connect to zoho backend |
| GET | `/api/v1/downloads` | `files.downloads.list` | `hoody files downloads list` | List active downloads |
| DELETE | `/api/v1/downloads/{id}` | `files.downloads.cancel` | `hoody files downloads cancel` | Cancel a running download |
| GET | `/api/v1/extractions` | `files.extractions.list` | `hoody files extractions list` | List active extractions |
| DELETE | `/api/v1/extractions/{id}` | `files.extractions.cancel` | `hoody files extractions cancel` | Cancel a running extraction |
| DELETE | `/api/v1/files/{path}` | `files.delete` | `hoody files delete` | Delete file or directory |
| GET | `/api/v1/files/{path}` | `files.get` | `hoody files get` | List directory or download file |
| PATCH | `/api/v1/files/{path}` | `files.update` | `hoody files update` | Modify file properties or move/rename |
| POST | `/api/v1/files/{path}` | `files.mkdir` | `hoody files mkdir` | File operations (mkdir, extract, download, move, copy) |
| PUT | `/api/v1/files/{path}` | `files.upload` | `hoody files upload` | Upload or append file |
| PUT | `/api/v1/files/append/{path}` | `files.append` | `hoody files append` | Append data to file |
| PATCH | `/api/v1/files/chmod/{path}` | `files.chmod` | `hoody files chmod` | Change file permissions |
| PATCH | `/api/v1/files/chown/{path}` | `files.chown` | `hoody files chown` | Change file ownership |
| POST | `/api/v1/files/copy/{path}` | `files.copy` | `hoody files copy` | Copy file or directory |
| GET | `/api/v1/files/glob/{path}` | `files.glob` | `hoody files glob` | Find files by glob pattern |
| GET | `/api/v1/files/grep/{path}` | `files.grep` | `hoody files grep` | Search file contents (grep) |
| GET | `/api/v1/files/health` | `files.kit.getHealth` | `hoody files health` | Service health check |
| POST | `/api/v1/files/move/{path}` | `files.move` | `hoody files move` | Move file or directory |
| GET | `/api/v1/files/realpath/{path}` | `files.realpath` | `hoody files realpath` | Resolve canonical path (realpath) |
| GET | `/api/v1/files/stat/{path}` | `files.stat` | `hoody files stat` | Get file metadata (stat) |
| GET | `/api/v1/journal` | `files.journal.list` | `hoody files journal list` | Query journal entries |
| POST | `/api/v1/journal/flush` | `files.journal.flush` | `hoody files journal flush` | Flush journal to disk |
| GET | `/api/v1/journal/stats` | `files.journal.getStats` | `hoody files journal stats` | Get journal statistics |
| GET | `/api/v1/mounts` | `files.mounts.list` | `hoody files mounts list` | List all mounts |
| POST | `/api/v1/mounts` | `files.mounts.create` | `hoody files mounts create` | Create persistent FUSE mount |
| DELETE | `/api/v1/mounts/{id}` | `files.mounts.delete` | `hoody files mounts delete` | Unmount filesystem |
| GET | `/api/v1/mounts/{id}` | `files.mounts.get` | `hoody files mounts get` | Get mount details |
| PATCH | `/api/v1/mounts/{id}` | `files.mounts.update` | `hoody files mounts update` | Update mount VFS configuration |
| GET | `/api/v1/pending-uploads` | `files.uploads.list` | `hoody files uploads list` | List pending uploads |
| DELETE | `/api/v1/pending-uploads/{id}` | `files.uploads.delete` | `hoody files uploads delete` | Discard a pending upload |
| POST | `/api/v1/pending-uploads/{id}/deliver` | `files.uploads.deliver` | `hoody files uploads deliver` | Deliver a pending upload |
| GET | `/api/v1/pending-uploads/{id}/file` | `files.uploads.download` | `hoody files uploads download` | Download a held file |
| GET | `/api/v1/pending-uploads/{id}/files` | `files.uploads.listFiles` | `hoody files uploads files list` | List a pending upload's files |
| POST | `/api/v1/pending-uploads/{id}/stop` | `files.uploads.stop` | `hoody files uploads stop` | Stop a running upload |
| GET | `/api/v1/pending-uploads/unreadable` | `files.uploads.listUnreadable` | `hoody files uploads unreadable list` | List unreadable pending uploads |
| DELETE | `/api/v1/pending-uploads/unreadable/{id}` | `files.uploads.deleteUnreadable` | `hoody files uploads unreadable delete` | Delete an unreadable pending upload |
| GET | `/api/v1/version` | `files.kit.getVersion` | `hoody files version` | Get API version |

---

## `notes` — 60 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| POST | `/api/v1/notes/avatars` | `notes.avatars.upload` | `hoody notes avatars upload` | Upload an avatar image |
| GET | `/api/v1/notes/avatars/{avatarId}` | `notes.avatars.download` | `hoody notes avatars download` | Download an avatar image |
| GET | `/api/v1/notes/health` | `notes.kit.getHealth` | `hoody notes health` | Service health and runtime info |
| GET | `/api/v1/notes/me` | `notes.whoami` | `hoody notes whoami` | Get current identity |
| GET | `/api/v1/notes/notebooks` | `notes.notebooks.list` | `hoody notes notebooks list` | List notebooks |
| POST | `/api/v1/notes/notebooks` | `notes.notebooks.create` | `hoody notes notebooks create` | Create a notebook |
| DELETE | `/api/v1/notes/notebooks/{notebookId}` | `notes.notebooks.delete` | `hoody notes notebooks delete` | Delete a notebook |
| GET | `/api/v1/notes/notebooks/{notebookId}` | `notes.notebooks.get` | `hoody notes notebooks get` | Get notebook details |
| PATCH | `/api/v1/notes/notebooks/{notebookId}` | `notes.notebooks.update` | `hoody notes notebooks update` | Update notebook settings |
| GET | `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records` | `notes.records.list` | `hoody notes records list` | List database records |
| POST | `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records` | `notes.records.create` | `hoody notes records create` | Create a database record |
| DELETE | `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` | `notes.records.delete` | `hoody notes records delete` | Delete a database record |
| GET | `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` | `notes.records.get` | `hoody notes records get` | Get a database record |
| PATCH | `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` | `notes.records.update` | `hoody notes records update` | Update a database record |
| GET | `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/search` | `notes.records.search` | `hoody notes records search` | Search database records |
| GET | `/api/v1/notes/notebooks/{notebookId}/files` | `notes.files.list` | `hoody notes files list` | List all uploaded files |
| GET | `/api/v1/notes/notebooks/{notebookId}/files/{fileId}` | `notes.files.download` | `hoody notes files download` | Download a file |
| DELETE | `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | `notes.files.uploads.cancel` | — | Abort a TUS upload |
| HEAD | `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | `notes.files.uploads.getOffset` | — | Check a TUS upload's offset (for resuming) |
| PATCH | `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | `notes.files.uploads.writeChunk` | — | Upload a chunk to a TUS upload |
| POST | `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | `notes.files.uploads.create` | — | Create a resumable (TUS) upload |
| POST | `/api/v1/notes/notebooks/{notebookId}/mutations` | `notes.mutations.sync` | — | Sync client mutations |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes` | `notes.nodes.list` | `hoody notes nodes list` | List nodes |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes` | `notes.nodes.create` | `hoody notes nodes create` | Create a node |
| DELETE | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}` | `notes.nodes.delete` | `hoody notes nodes delete` | Delete a node |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}` | `notes.nodes.get` | `hoody notes nodes get` | Get a node |
| PATCH | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}` | `notes.nodes.update` | `hoody notes nodes update` | Update a node |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/blocks/{blockId}/svg` | `notes.document.exportBlock` | `hoody notes document blocks export` | Export drawing block as SVG |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/children` | `notes.nodes.listChildren` | `hoody notes nodes children list` | List child nodes |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators` | `notes.collaborators.list` | `hoody notes collaborators list` | List collaborators |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators` | `notes.collaborators.add` | `hoody notes collaborators add` | Add a collaborator |
| DELETE | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}` | `notes.collaborators.remove` | `hoody notes collaborators remove` | Remove a collaborator |
| PATCH | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}` | `notes.collaborators.setRole` | `hoody notes collaborators role set` | Update collaborator role |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors` | `notes.comments.listAnchors` | `hoody notes comments anchors list` | List comment anchors |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments` | `notes.comments.list` | `hoody notes comments list` | List comments |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments` | `notes.comments.create` | `hoody notes comments create` | Create a comment |
| DELETE | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}` | `notes.comments.delete` | `hoody notes comments delete` | Delete a comment |
| PATCH | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}` | `notes.comments.update` | `hoody notes comments update` | Edit a comment |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/reanchor` | `notes.comments.setAnchor` | `hoody notes comments anchor set` | Re-anchor a comment thread |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/resolve` | `notes.comments.resolve` | `hoody notes comments resolve` | Resolve a comment |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` | `notes.document.get` | `hoody notes document get` | Get document content |
| PATCH | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` | `notes.document.update` | `hoody notes document update` | Merge document content |
| PUT | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` | `notes.document.set` | `hoody notes document set` | Create or replace document |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` | `notes.document.append` | `hoody notes document append` | Append blocks to a document |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/export-ticket` | `notes.document.createExportTicket` | `hoody notes document tickets create` | Create secure HTML export ticket |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/opened` | `notes.nodes.markOpened` | `hoody notes nodes mark opened` | Mark node as opened |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/seen` | `notes.nodes.markSeen` | `hoody notes nodes mark seen` | Mark node as seen |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions` | `notes.reactions.list` | `hoody notes reactions list` | List reactions |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions` | `notes.reactions.add` | `hoody notes reactions add` | Add a reaction |
| DELETE | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions/{reaction}` | `notes.reactions.remove` | `hoody notes reactions remove` | Remove a reaction |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions` | `notes.versions.list` | `hoody notes versions list` | List document versions |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions` | `notes.versions.create` | `hoody notes versions create` | Create a document version snapshot |
| DELETE | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}` | `notes.versions.delete` | `hoody notes versions delete` | Delete a document version |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}` | `notes.versions.get` | `hoody notes versions get` | Get a specific document version |
| POST | `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}/restore` | `notes.versions.restore` | `hoody notes versions restore` | Restore a document version |
| GET | `/api/v1/notes/notebooks/{notebookId}/nodes/alias/{alias}` | `notes.nodes.resolve` | `hoody notes nodes resolve` | Resolve page by alias |
| POST | `/api/v1/notes/notebooks/{notebookId}/users` | `notes.members.invite` | `hoody notes members invite` | Invite users to notebook |
| PATCH | `/api/v1/notes/notebooks/{notebookId}/users/{userId}/role` | `notes.members.setRole` | `hoody notes members role set` | Update user role |
| POST | `/api/v1/notes/sockets` | `notes.sockets.create` | — | Initialize a WebSocket session |
| GET | `/api/v1/notes/sockets/{socketId}` | `notes.sockets.connect` | — | Open a WebSocket connection |

---

## `notifications` — 8 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/notifications/{display}` | `notifications.list` | `hoody notifications list` | Get notifications for specified display(s) |
| DELETE | `/api/v1/notifications/dismiss` | `notifications.restore` | `hoody notifications restore` | Clear dismissed notifications |
| POST | `/api/v1/notifications/dismiss` | `notifications.dismiss` | `hoody notifications dismiss` | Dismiss notifications |
| GET | `/api/v1/notifications/health` | `notifications.kit.getHealth` | `hoody notifications health` | Service health check |
| GET | `/api/v1/notifications/icons/{iconId}` | `notifications.icons.get` | `hoody notifications icons get` | Get notification icon |
| GET | `/api/v1/notifications/metrics` | `notifications.kit.getMetrics` | `hoody notifications metrics` | Prometheus-compatible metrics endpoint |
| POST | `/api/v1/notifications/notify` | `notifications.send` | `hoody notifications send` | Trigger a new desktop notification |
| GET | `/api/v1/notifications/stream` | `notifications.connect` | `hoody notifications stream` | Real-time notification stream (WebSocket or SSE) |

---

## `pipe` — 5 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/pipe/{path}` | `pipe.receive` | — | Receive data from a pipe |
| POST | `/api/v1/pipe/{path}` | `pipe.send` | — | Send data to a pipe |
| GET | `/api/v1/pipe/health` | `pipe.kit.getHealth` | — | Service health check |
| GET | `/api/v1/pipe/help` | `pipe.kit.getHelp` | — | Get help text with curl examples |
| GET | `/api/v1/pipe/metrics` | `pipe.kit.getMetrics` | — | Service metrics (Prometheus) |

---

## `proxyLogs` — 3 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/_logs` | `proxyLogs.list` | `hoody proxy logs list` | Query centralized logs |
| GET | `/_logs/stats` | `proxyLogs.getStats` | `hoody proxy logs stats` | Get log statistics |
| GET | `/_logs/stream` | `proxyLogs.stream` | `hoody proxy logs stream` | Live-tail logs over Server-Sent Events |

---

## `run` — 28 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| POST | `/api/v1/run/batch` | `run.resolveMany` | — | Execute a batch of search or run requests |
| GET | `/api/v1/run/config` | `run.config.get` | `hoody run config get` | Get full runtime configuration |
| GET | `/api/v1/run/jobs` | `run.jobs.list` | `hoody run jobs list` | List background jobs |
| GET | `/api/v1/run/jobs/{job_id}` | `run.jobs.get` | `hoody run jobs get` | Get job status |
| POST | `/api/v1/run/jobs/{job_id}/cancel` | `run.jobs.cancel` | `hoody run jobs cancel` | Cancel a search job |
| POST | `/api/v1/run/preflight` | `run.test` | `hoody run test` | Preflight a run request |
| GET | `/api/v1/run/profiles` | `run.profiles.list` | `hoody run profiles list` | List all profiles |
| POST | `/api/v1/run/profiles` | `run.profiles.create` | `hoody run profiles create` | Create a new profile |
| DELETE | `/api/v1/run/profiles/{profile}` | `run.profiles.delete` | `hoody run profiles delete` | Delete a profile |
| PATCH | `/api/v1/run/profiles/{profile}` | `run.profiles.update` | `hoody run profiles update` | Update a profile |
| POST | `/api/v1/run/profiles/{profile}/select` | `run.profiles.use` | `hoody run profiles use` | Select the active profile |
| GET | `/api/v1/run/recipes` | `run.recipes.list` | `hoody run recipes list` | List saved launch recipes |
| POST | `/api/v1/run/recipes` | `run.recipes.create` | `hoody run recipes create` | Create a saved recipe |
| DELETE | `/api/v1/run/recipes/{name}` | `run.recipes.delete` | `hoody run recipes delete` | Delete a saved recipe |
| GET | `/api/v1/run/recipes/{name}` | `run.recipes.get` | `hoody run recipes get` | Get a saved recipe |
| PATCH | `/api/v1/run/recipes/{name}` | `run.recipes.update` | `hoody run recipes update` | Update a saved recipe |
| POST | `/api/v1/run/recipes/{name}/run` | `run.recipes.resolve` | `hoody run recipes resolve` | Run using a saved recipe |
| POST | `/api/v1/run/recipes/{name}/search` | `run.recipes.search` | `hoody run recipes search` | Search using a saved recipe |
| POST | `/api/v1/run/resolve` | `run.resolve` | `hoody run resolve` | Resolve an application via JSON body |
| POST | `/api/v1/run/search/jobs` | `run.jobs.createSearch` | `hoody run jobs search create` | Start an async search job |
| POST | `/api/v1/run/search/paged` | `run.search` | `hoody run search` | Search for app candidates with cursor pagination |
| GET | `/api/v1/run/sources` | `run.sources.list` | `hoody run sources list` | List all package sources |
| POST | `/api/v1/run/sources` | `run.sources.create` | `hoody run sources create` | Create a new package source |
| DELETE | `/api/v1/run/sources/{source_id}` | `run.sources.delete` | `hoody run sources delete` | Delete a package source |
| PATCH | `/api/v1/run/sources/{source_id}` | `run.sources.update` | `hoody run sources update` | Update a package source |
| GET | `/api/v1/run/sources/{source_id}/diagnostics` | `run.sources.getDiagnostics` | `hoody run sources diagnostics get` | Get runtime diagnostics for a source |
| POST | `/api/v1/run/sources/{source_id}/sync` | `run.sources.sync` | `hoody run sources sync` | Sync a single source |
| POST | `/api/v1/run/sources/sync` | `run.sources.syncAll` | `hoody run sources sync` | Sync all sources |

---

## `sqlite` — 36 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/sqlite/changes` | `sqlite.kv.listChanges` | `hoody kv changes list` | List the changes of a KV table |
| GET | `/api/v1/sqlite/changes/stream` | `sqlite.kv.streamChanges` | `hoody kv changes stream` | Stream the changes of a KV table |
| DELETE | `/api/v1/sqlite/db` | `sqlite.databases.delete` | `hoody db delete` | Delete SQLite database |
| POST | `/api/v1/sqlite/db` | `sqlite.sql.runTransaction` | `hoody db transactions run` | Execute SQL transaction |
| POST | `/api/v1/sqlite/db/create` | `sqlite.databases.create` | `hoody db create` | Create new SQLite database |
| GET | `/api/v1/sqlite/db/list` | `sqlite.databases.list` | `hoody db list` | List databases in a directory |
| GET | `/api/v1/sqlite/health` | `sqlite.kit.getHealth` | `hoody db health` | Health check |
| GET | `/api/v1/sqlite/health/cache` | `sqlite.kit.getCacheStats` | `hoody db cache stats` | Cache health snapshot |
| DELETE | `/api/v1/sqlite/history` | `sqlite.history.clear` | `hoody db history clear` | Clear query history |
| GET | `/api/v1/sqlite/history` | `sqlite.history.list` | `hoody db history list` | Get query history |
| DELETE | `/api/v1/sqlite/history/{index}` | `sqlite.history.delete` | `hoody db history delete` | Delete history entry |
| GET | `/api/v1/sqlite/history/stats` | `sqlite.history.getStats` | `hoody db history stats` | Get history statistics |
| GET | `/api/v1/sqlite/kv` | `sqlite.kv.list` | `hoody kv list` | List keys |
| DELETE | `/api/v1/sqlite/kv/{key}` | `sqlite.kv.delete` | `hoody kv delete` | Delete key |
| GET | `/api/v1/sqlite/kv/{key}` | `sqlite.kv.get` | `hoody kv get` | Get value by key |
| HEAD | `/api/v1/sqlite/kv/{key}` | `sqlite.kv.exists` | `hoody kv exists` | Check if key exists |
| PUT | `/api/v1/sqlite/kv/{key}` | `sqlite.kv.set` | `hoody kv set` | Set value for key |
| POST | `/api/v1/sqlite/kv/{key}/decr` | `sqlite.kv.decrement` | `hoody kv decrement` | Atomic decrement |
| GET | `/api/v1/sqlite/kv/{key}/entry` | `sqlite.kv.getEntry` | `hoody kv entry get` | Get a key's entry |
| POST | `/api/v1/sqlite/kv/{key}/expire` | `sqlite.kv.setTtl` | `hoody kv ttl set` | Set a key's TTL |
| GET | `/api/v1/sqlite/kv/{key}/history` | `sqlite.kv.listHistory` | `hoody kv history list` | Get key operation history |
| POST | `/api/v1/sqlite/kv/{key}/incr` | `sqlite.kv.increment` | `hoody kv increment` | Atomic increment |
| POST | `/api/v1/sqlite/kv/{key}/persist` | `sqlite.kv.clearTtl` | `hoody kv ttl clear` | Remove a key's TTL |
| POST | `/api/v1/sqlite/kv/{key}/pop` | `sqlite.kv.pop` | `hoody kv arrays pop` | Remove from array end |
| POST | `/api/v1/sqlite/kv/{key}/push` | `sqlite.kv.push` | `hoody kv arrays push` | Append to array |
| POST | `/api/v1/sqlite/kv/{key}/remove` | `sqlite.kv.remove` | `hoody kv arrays remove` | Remove array element |
| POST | `/api/v1/sqlite/kv/{key}/rollback` | `sqlite.kv.rollback` | `hoody kv rollback` | Rollback key operations |
| GET | `/api/v1/sqlite/kv/{key}/snapshot` | `sqlite.kv.getSnapshot` | `hoody kv snapshots get` | Get key snapshot at operation |
| POST | `/api/v1/sqlite/kv/batch/delete` | `sqlite.kv.deleteMany` | `hoody kv batch delete` | Batch delete multiple keys |
| POST | `/api/v1/sqlite/kv/batch/get` | `sqlite.kv.getMany` | `hoody kv batch get` | Batch get multiple keys |
| POST | `/api/v1/sqlite/kv/batch/set` | `sqlite.kv.setMany` | `hoody kv batch set` | Batch set multiple keys |
| GET | `/api/v1/sqlite/kv/diff` | `sqlite.kv.compareTableSnapshots` | `hoody kv table snapshots compare` | Compare table snapshots |
| POST | `/api/v1/sqlite/kv/rollback` | `sqlite.kv.rollbackTable` | `hoody kv table rollback` | Rollback entire table |
| GET | `/api/v1/sqlite/kv/snapshot` | `sqlite.kv.getTableSnapshot` | `hoody kv table snapshots get` | Get table snapshot at timestamp |
| POST | `/api/v1/sqlite/maintenance` | `sqlite.databases.runMaintenance` | `hoody db maintenance run` | Run a database maintenance operation |
| GET | `/api/v1/sqlite/query` | `sqlite.sql.queryReadOnly` | `hoody db readonly query` | Execute shareable SQL query |

---

## `terminal` — 38 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/system/daemon` | `terminal.system.listDaemonPrograms` | `hoody terminal system daemon programs list` | Get daemon programs configuration |
| GET | `/api/v1/system/displays` | `terminal.system.listDisplays` | `hoody terminal system displays list` | Get display information |
| POST | `/api/v1/system/displays/{display}/stop` | `terminal.system.stopDisplay` | `hoody terminal system displays stop` | Stop a display |
| GET | `/api/v1/system/ports` | `terminal.system.listPorts` | `hoody terminal system ports list` | List all listening network ports |
| POST | `/api/v1/system/process/signal` | `terminal.processes.signal` | `hoody terminal processes signal` | Send signal to process(es) |
| GET | `/api/v1/system/processes` | `terminal.processes.list` | `hoody terminal processes list` | List all system processes |
| GET | `/api/v1/system/processes/{pid}` | `terminal.processes.get` | `hoody terminal processes get` | Get process details by PID |
| POST | `/api/v1/system/processes/freeze` | `terminal.processes.pause` | `hoody terminal processes pause` | Freeze (SIGSTOP) a process or process tree |
| POST | `/api/v1/system/processes/unfreeze` | `terminal.processes.resume` | `hoody terminal processes resume` | Unfreeze (SIGCONT) a process or process tree |
| POST | `/api/v1/system/reboot` | `terminal.system.reboot` | `hoody terminal system reboot` | Reboot the system |
| GET | `/api/v1/system/resources` | `terminal.system.getStats` | `hoody terminal system stats` | Get system resources and statistics |
| POST | `/api/v1/system/shutdown` | `terminal.system.shutdown` | `hoody terminal system shutdown` | Shutdown the system |
| DELETE | `/api/v1/terminal/{terminal_id}` | `terminal.sessions.delete` | `hoody terminal sessions delete` | Delete a terminal session |
| GET | `/api/v1/terminal/{terminal_id}/automation` | `terminal.sessions.getAutomationStatus` | `hoody terminal sessions automation status` | Get per-session automation state |
| GET | `/api/v1/terminal/automation/metrics` | `terminal.automation.getStats` | `hoody terminal automation stats` | Get terminal automation metrics |
| POST | `/api/v1/terminal/create` | `terminal.sessions.create` | `hoody terminal sessions create` | Create a terminal session |
| POST | `/api/v1/terminal/drop` | `terminal.drops.send` | — | One-shot drop (begin + stage + commit) |
| POST | `/api/v1/terminal/drop-begin` | `terminal.drops.create` | — | Begin a drag-and-drop staging transaction |
| POST | `/api/v1/terminal/drop-commit` | `terminal.drops.commit` | — | Finalize a drop and inject the OSC frame |
| POST | `/api/v1/terminal/execute` | `terminal.commands.run` | `hoody terminal commands run` | Execute command in terminal session |
| POST | `/api/v1/terminal/execute/{command_id}/abort` | `terminal.commands.cancel` | `hoody terminal commands cancel` | Abort a running command |
| GET | `/api/v1/terminal/find` | `terminal.sessions.search` | `hoody terminal sessions search` | Search terminal screen with regex |
| GET | `/api/v1/terminal/health` | `terminal.kit.getHealth` | `hoody terminal health` | Service health check |
| GET | `/api/v1/terminal/history/{terminal_id}` | `terminal.commands.list` | `hoody terminal commands list` | Get terminal command history |
| GET | `/api/v1/terminal/keys` | `terminal.keys.list` | `hoody terminal keys list` | List supported key names for /press endpoint |
| POST | `/api/v1/terminal/mouse` | `terminal.sessions.sendMouseEvents` | `hoody terminal sessions mouse send` | Send cell-based mouse events to terminal |
| POST | `/api/v1/terminal/paste` | `terminal.sessions.paste` | `hoody terminal sessions paste` | Paste text into terminal |
| POST | `/api/v1/terminal/press` | `terminal.sessions.pressKeys` | `hoody terminal sessions press` | Send named key presses to terminal |
| GET | `/api/v1/terminal/raw` | `terminal.sessions.read` | `hoody terminal sessions read` | Get raw terminal output |
| GET | `/api/v1/terminal/result/{command_id}` | `terminal.commands.get` | `hoody terminal commands get` | Get command result |
| GET | `/api/v1/terminal/screenshot` | `terminal.sessions.captureScreenshot` | `hoody terminal sessions screenshots capture` | Capture terminal screenshot |
| GET | `/api/v1/terminal/sessions` | `terminal.sessions.list` | `hoody terminal sessions list` | List all terminal sessions |
| GET | `/api/v1/terminal/snapshot` | `terminal.sessions.getSnapshot` | `hoody terminal sessions snapshot get` | Get rendered terminal snapshot |
| POST | `/api/v1/terminal/state` | `terminal.sessions.reportDiagnostics` | — | Client render/connection diagnostics beacon |
| POST | `/api/v1/terminal/upload` | `terminal.drops.writeChunk` | — | Upload a raw file slice into a drop |
| POST | `/api/v1/terminal/wait` | `terminal.sessions.wait` | `hoody terminal sessions wait` | Wait for terminal condition |
| POST | `/api/v1/terminal/write` | `terminal.sessions.write` | `hoody terminal sessions write` | Write input to terminal |
| GET | `/api/v1/terminal/ws` | `terminal.sessions.connect` | `hoody terminal sessions connect` | WebSocket terminal connection |

---

## `tunnel` — 6 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/tunnel/bindings` | `tunnel.bindings.list` | `hoody tunnel bindings list` | List active bindings across all sessions |
| GET | `/api/v1/tunnel/health` | `tunnel.kit.getHealth` | `hoody tunnel health` | Kit health |
| GET | `/api/v1/tunnel/metrics` | `tunnel.kit.getMetrics` | `hoody tunnel metrics` | Prometheus metrics |
| GET | `/api/v1/tunnel/sessions` | `tunnel.sessions.list` | `hoody tunnel sessions list` | List active tunnel sessions |
| DELETE | `/api/v1/tunnel/sessions/{session_id}` | `tunnel.sessions.close` | `hoody tunnel sessions close` | Terminate an active tunnel session |
| GET | `/api/v1/tunnel/tunnels` | `tunnel.list` | `hoody tunnel list` | List all active tunnels (combined sessions + bindings) |

---

## `watch` — 9 endpoints

| HTTP | Path | SDK Method | CLI Command | Summary |
|------|------|------------|-------------|---------|
| GET | `/api/v1/watch/health` | `watch.kit.getHealth` | `hoody watch health` | Health Check |
| GET | `/api/v1/watch/watchers` | `watch.watchers.list` | `hoody watch list` | List Watchers |
| POST | `/api/v1/watch/watchers` | `watch.watchers.create` | `hoody watch create` | Create Watcher |
| DELETE | `/api/v1/watch/watchers/{id}` | `watch.watchers.delete` | `hoody watch delete` | Delete Watcher |
| GET | `/api/v1/watch/watchers/{id}` | `watch.watchers.get` | `hoody watch get` | Get Watcher |
| PATCH | `/api/v1/watch/watchers/{id}` | `watch.watchers.update` | `hoody watch update` | Reconfigure a live watcher in place. Omitted fields keep their current values. The watcher keeps its id, replay history (so since_id / since_timestamp cursors stay valid) and its connected SSE/WebSocket clients; only the file-system backend is replaced. The new backend starts before the old one stops, and events the old backend had already queued are processed before the handoff completes. So a change under a path watched by both configurations is not lost across the swap (one landing inside that window may be reported twice), and a change under a path only the old configuration watched is delivered if the old backend saw it before stopping. The drain is bounded: if the old backend has not finished within 5 seconds (a backstop against a wedged backend), the handoff completes anyway and events still queued in the old backend at that point are dropped, with a warning in the service log. A request that fails leaves the watcher unchanged. A body with no field is refused with 400 `INVALID_REQUEST`; a body whose fields all equal the current values returns the watcher as it is, without replacing the backend. |
| GET | `/api/v1/watch/watchers/{id}/events` | `watch.events.list` | `hoody watch events list` | List Watcher Events |
| GET | `/api/v1/watch/watchers/{id}/events/sse` | `watch.events.stream` | `hoody watch events stream` | Stream Watcher Events Sse |
| GET | `/api/v1/watch/watchers/{id}/events/ws` | `watch.events.connect` | — | Stream Watcher Events Ws |

---

*Auto-generated by `generate-reference.ts`. Do not edit manually.*
