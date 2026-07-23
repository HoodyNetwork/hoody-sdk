# Hoody CLI — Complete Command Reference

**Version:** 1.0.0-beta.3
**Total commands:** 825
**Command groups:** 37
**Top-level utility commands:** 24

> **Note:** the streaming `hoody pipe` group (`send`, `receive`, `progress`,
> `url`, `forward-tcp`, `health`, `help-cheatsheet`) is hand-written and not
> represented in this auto-generated list — see the [`pipe` namespace](namespaces/pipe.md).

---

## Top-level utility commands (24)

These are top-level `hoody` commands (a few, like `ai chat` and `desktop
open`, nest one level under a top-level group), implemented hand-written in
the CLI runtime rather than generated from the OpenAPI spec. They are the
entrypoints to chat, account management, shells, and update flow.

| Command | Summary | Example |
|---------|---------|---------|
| `hoody chat` | Interactive AI chatbot REPL (local, no agentic tools). | `hoody chat [prompt…]` |
| `hoody check-update` | Alias for `hoody update` — check for a newer release. | `hoody check-update` |
| `hoody completion` | Generate shell completion scripts (bash/zsh/fish). | `hoody completion bash` |
| `hoody config` | Manage the CLI configuration file (~/.hoody/config.json). | `hoody config set baseUrl https://api.hoody.com` |
| `hoody local` | Local-only client tooling — defaults, password-protected lock. | `hoody local defaults set container <id>` |
| `hoody login` | Log in with username/email + password (if 2FA is enabled, a follow-up `hoody auth 2fa verify` step is prompted). | `hoody login --username u@example.com` |
| `hoody logout` | Log out and clear the stored session. | `hoody logout` |
| `hoody open` | Open (or print) a kit service web UI for a container. Takes a SERVICE SLUG (`terminal`, `files`, `code`, `http-8080`, …), not a container id. | `hoody open files` |
| `hoody ps` | List containers (alias of `hoody containers ls`). | `hoody ps` |
| `hoody pty` | Open an interactive terminal in a container (alias of `hoody shell`). | `hoody pty <container-id>` |
| `hoody run` | Execute a one-shot command in a container (alias of `hoody shell … -- &lt;cmd&gt;`). | `hoody run <container-id> -- uname -a` |
| `hoody screenshot` | Capture + save a screenshot from display/browser/terminal kits. | `hoody screenshot display --path /tmp/s.png` |
| `hoody signup` | Create a new Hoody account (interactive or via flags). | `hoody signup --email u@example.com` |
| `hoody ssh` | Open an interactive terminal in a container — not an SSH client by default (alias of `hoody shell`); use `--ssh-host`/`--ssh-user` to bridge to a remote SSH server. | `hoody ssh <container-id>` |
| `hoody update` | Check for a newer Hoody release (minisign-verified); prints install options when one is available. | `hoody update` |
| `hoody shell` | Open an interactive shell in a container, or run a one-shot command (alias `sh`). | `hoody shell -c <container-id>` |
| `hoody mount` | Mount a remote Hoody container filesystem locally via rclone + WebDAV. | `hoody mount <containerId>:/data ./data` |
| `hoody unmount` | Unmount a Hoody mount and remove its state. | `hoody unmount <idOrPath>` |
| `hoody ai chat` | Bridge alias for `hoody chat` — shares the chatbot surface via the ai namespace. | `hoody ai chat [prompt…]` |
| `hoody desktop` | Desktop environment launcher (public desktop-{N} alias). | `hoody desktop open --env xfce` |
| `hoody desktop open` | Open a desktop (xfce/mate) in the browser via the public desktop-{N} alias. | `hoody desktop open [index] --env xfce` |
| `hoody desktop list` | List known desktop environment identifiers. | `hoody desktop list` |
| `hoody kits` | Hoody Kit slug catalog — URL patterns and descriptions for every kit service. | `hoody kits list` |
| `hoody kits list` | List available Hoody Kit slugs with URL samples and descriptions. | `hoody kits list --named-only` |

---

## `hoody activity` — 2 commands

HTTP activity logs and access statistics

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody activity logs` |  | read | Get activity logs | `api.activity.listIterator` | `hoody activity logs --page 1 --limit 50 --start-date <start_date> --end-date <end_date> --min-status 10 --max-status 10 --method GET --realm-id abc-123` |
| `hoody activity stats` |  | read | Get activity stats | `api.activity.getStats` | `hoody activity stats` |

## `hoody agent` — 162 commands

AI agent — sessions, prompting, models, skills, memory, todos, workflows

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody agent open` |  | action | Open the Agent kit service in your browser |  | `hoody agent open [index] [--url]` |
| `hoody agent agents copy` |  | write | Copy a chat agent | `agent.agents.copyAgent` | `hoody agent agents copy --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --new-name <new_name>` |
| `hoody agent agents create` |  | write | Create a chat-agent definition | `agent.agents.createAgent` | `hoody agent agents create --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --name my-resource --frontmatter <frontmatter> --system-prompt <system_prompt>` |
| `hoody agent agents delete` |  | write | Delete a custom chat agent | `agent.agents.deleteAgent` | `hoody agent agents delete --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent agents get-source` |  | read | Read a chat agent's source | `agent.agents.getAgentSource` | `hoody agent agents get-source --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent agents list` |  | read | List chat-agent definitions | `agent.agents.listAgentsIterator` | `hoody agent agents list --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent agents put-source` |  | write | Write a chat agent's source | `agent.agents.putAgentSource` | `hoody agent agents put-source --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --content "Hello" --base-gen 10` |
| `hoody agent agents rename` |  | write | Rename a chat agent | `agent.agents.renameAgent` | `hoody agent agents rename --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --new-name <new_name>` |
| `hoody agent agents reset-to-shipped` |  | write | Reset an agent to its shipped default | `agent.agents.resetAgentToShipped` | `hoody agent agents reset-to-shipped --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent agents set-model` |  | write | Set an agent's model | `agent.agents.setAgentModel` | `hoody agent agents set-model --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --model openai/gpt-5.4-nano` |
| `hoody agent agents set-tools` |  | write | Set an agent's tool allow-list | `agent.agents.setAgentTools` | `hoody agent agents set-tools --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --tools <tools>` |
| `hoody agent agents set-turns` |  | write | Set an agent's max-turns | `agent.agents.setAgentTurns` | `hoody agent agents set-turns --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --turns 10` |
| `hoody agent agents toggle-tool` |  | write | Toggle a single tool for an agent | `agent.agents.toggleAgentTool` | `hoody agent agents toggle-tool --name my-resource --tool abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent discovery list-containers` |  | read | List containers in a realm (for binding) | `agent.discovery.listContainersIterator` | `hoody agent discovery list-containers --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent discovery list-realms` |  | read | List realms (for binding) | `agent.discovery.listRealmsIterator` | `hoody agent discovery list-realms --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent github auth-status` |  | read | GitHub auth status | `agent.github.githubAuthStatus` | `hoody agent github auth-status --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent github branches` |  | read | List GitHub branches | `agent.github.githubBranches` | `hoody agent github branches --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent github clone` |  | write | Clone a GitHub repository | `agent.github.githubClone` | `hoody agent github clone --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --repo my-repo --dir <dir> --full-name <full_name> --clone-url https://example.com --shallow` |
| `hoody agent github commit` |  | write | Stage all and commit | `agent.github.githubCommit` | `hoody agent github commit --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --message "Hello"` |
| `hoody agent github login` |  | write | Start a GitHub device-flow login (or add a PAT) | `agent.github.githubLogin` | `hoody agent github login --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --token <token> --host example.com` |
| `hoody agent github login-poll` |  | write | Poll a GitHub device-flow login to completion | `agent.github.githubLoginPoll` | `hoody agent github login-poll --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --host example.com --device-code <device_code> --interval 10 --expires-in 10` |
| `hoody agent github pull-request` |  | write | Open a pull request | `agent.github.githubPullRequest` | `hoody agent github pull-request --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --title "My Title" --body '{}' --base <base>` |
| `hoody agent github repos` |  | read | List GitHub repos | `agent.github.githubRepos` | `hoody agent github repos --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent github status` |  | read | GitHub working-tree status | `agent.github.githubStatus` | `hoody agent github status --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent github sync` |  | write | Sync (fetch → pull → push) | `agent.github.githubSync` | `hoody agent github sync --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --direction <direction>` |
| `hoody agent hooks ack-trust` |  | write | Acknowledge hook trust | `agent.hooks.ackHookTrust` | `hoody agent hooks ack-trust --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent hooks begin-write` |  | write | Begin a hook write (nonce) | `agent.hooks.beginHookWrite` | `hoody agent hooks begin-write --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --session-id abc-123 --op <op> --scope workspace` |
| `hoody agent hooks delete` |  | write | Delete a hook | `agent.hooks.deleteHook` | `hoody agent hooks delete --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --session-id abc-123 --nonce <nonce> --scope workspace` |
| `hoody agent hooks disable-all` |  | write | Disable all hooks | `agent.hooks.disableAllHooks` | `hoody agent hooks disable-all --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --session-id abc-123 --nonce <nonce> --scope workspace` |
| `hoody agent hooks list` |  | read | List hooks | `agent.hooks.listHooks` | `hoody agent hooks list --session-id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent hooks reload` |  | write | Reload hooks from disk | `agent.hooks.reloadHooks` | `hoody agent hooks reload --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent hooks test` |  | write | Test-fire a hook | `agent.hooks.testHook` | `hoody agent hooks test --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent hooks toggle` |  | write | Toggle a hook | `agent.hooks.toggleHook` | `hoody agent hooks toggle --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --session-id abc-123 --nonce <nonce> --scope workspace` |
| `hoody agent hooks upsert` |  | write | Upsert a hook | `agent.hooks.upsertHook` | `hoody agent hooks upsert --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --session-id abc-123 --nonce <nonce> --scope workspace --event <event> --matcher <matcher> --command "ls -la" --timeout 10 --name my-resource --description "My description"` |
| `hoody agent jobs delete` |  | write | Cancel a pending/running job, or delete a finished record | `agent.jobs.deleteJob` | `hoody agent jobs delete --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent jobs get` |  | read | Get an async job's status | `agent.jobs.getJob` | `hoody agent jobs get --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent jobs get-result` |  | read | Get an async job's result | `agent.jobs.getJobResult` | `hoody agent jobs get-result --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent logs logs-sources` |  | read | Log sources | `agent.logs.logsSources` | `hoody agent logs logs-sources --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent logs logs-stats` |  | read | Log statistics | `agent.logs.logsStats` | `hoody agent logs logs-stats --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent logs query-logs` |  | read | Query logs | `agent.logs.queryLogs` | `hoody agent logs query-logs --source nix --level <level> --host example.com --since 2026-01-01T00:00:00Z --until 2026-01-01T00:00:00Z --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent logs read-log-entry` |  | read | Read a log entry | `agent.logs.readLogEntry` | `hoody agent logs read-log-entry --ref abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent loops create` |  | write | Create a loop | `agent.loops.createLoop` | `hoody agent loops create --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --prompt <prompt> --interval <interval> --max-runs 10 --stop-when <stop_when> --max-cost-usd 10 --max-wall-ms 100` |
| `hoody agent loops delete` |  | write | Delete a loop | `agent.loops.deleteLoop` | `hoody agent loops delete --id abc-123 --loop-id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent loops list` |  | read | List a session's loops | `agent.loops.listLoopsIterator` | `hoody agent loops list --id abc-123 --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent loops run-now` |  | write | Run a loop immediately | `agent.loops.runLoopNow` | `hoody agent loops run-now --id abc-123 --loop-id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent loops update` |  | write | Update a loop | `agent.loops.updateLoop` | `hoody agent loops update --id abc-123 --loop-id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --paused --expires-in <expires_in> --max-cost-usd 10 --max-wall-ms 100` |
| `hoody agent memory consolidate` |  | write | Trigger a memory consolidation pass (human-only) | `agent.memory.consolidateMemory` | `hoody agent memory consolidate --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --project proj-abc --min-observations 10` |
| `hoody agent memory delete-item` |  | write | Delete a memory item | `agent.memory.deleteMemoryItem` | `hoody agent memory delete-item --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --id abc-123 --project proj-abc --kind create` |
| `hoody agent memory edit-item` |  | write | Edit a memory item | `agent.memory.editMemoryItem` | `hoody agent memory edit-item --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --project proj-abc --kind create --content "Hello"` |
| `hoody agent memory flush` |  | write | Flush the memory store | `agent.memory.flushMemory` | `hoody agent memory flush --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent memory get-graph` |  | read | Read a project's memory relation graph | `agent.memory.getMemoryGraph` | `hoody agent memory get-graph --project proj-abc --node-type <node_type> --limit 10 --offset 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent memory get-item` |  | read | Read a memory item | `agent.memory.getMemoryItem` | `hoody agent memory get-item --id abc-123 --project proj-abc --kind create --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent memory list-items` |  | read | List memory items | `agent.memory.listMemoryItemsIterator` | `hoody agent memory list-items --project proj-abc --kind create --type default --query "my search" --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent memory list-projects` |  | read | List memory projects | `agent.memory.listMemoryProjectsIterator` | `hoody agent memory list-projects --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent memory save-item` |  | write | Save a memory item | `agent.memory.saveMemoryItem` | `hoody agent memory save-item --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --project proj-abc --content "Hello" --type default` |
| `hoody agent memory search` |  | write | Search memory (hybrid recall) | `agent.memory.searchMemory` | `hoody agent memory search --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --project proj-abc --query "my search" --limit 10 --kinds create --skip-graph` |
| `hoody agent memory set-enabled` |  | write | Toggle memory capture | `agent.memory.setMemoryEnabled` | `hoody agent memory set-enabled --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --enabled` |
| `hoody agent models add-provider-account` |  | write | Add an OAuth account to a provider's pool | `agent.models.addProviderAccount` | `hoody agent models add-provider-account --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent models delete-provider-api-key` |  | write | Delete a provider API key | `agent.models.deleteProviderAPIKey` | `hoody agent models delete-provider-api-key --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent models get` |  | read | Get a model by spec | `agent.models.getModel` | `hoody agent models get --spec abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent models get-provider` |  | read | Get a provider | `agent.models.getProvider` | `hoody agent models get-provider --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent models get-provider-auth` |  | read | Get a provider's auth status | `agent.models.getProviderAuth` | `hoody agent models get-provider-auth --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent models list` |  | read | List models | `agent.models.listModelsIterator` | `hoody agent models list --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent models list-provider-accounts` |  | read | List a provider's OAuth account pool | `agent.models.listProviderAccountsIterator` | `hoody agent models list-provider-accounts --id abc-123 --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent models list-providers` |  | read | List LLM providers | `agent.models.listProvidersIterator` | `hoody agent models list-providers --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent models logout-provider-o-auth` |  | write | Remove a provider's OAuth login | `agent.models.logoutProviderOAuth` | `hoody agent models logout-provider-o-auth --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent models poll-provider-o-auth` |  | read | Poll a provider OAuth login | `agent.models.pollProviderOAuth` | `hoody agent models poll-provider-o-auth --id abc-123 --job abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent models remove-provider-account` |  | write | Remove a pooled OAuth account | `agent.models.removeProviderAccount` | `hoody agent models remove-provider-account --id abc-123 --key <key> --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent models set-provider-account-active` |  | write | Make a pooled OAuth account active | `agent.models.setProviderAccountActive` | `hoody agent models set-provider-account-active --id abc-123 --key <key> --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent models set-provider-api-key` |  | write | Store a provider API key | `agent.models.setProviderAPIKey` | `hoody agent models set-provider-api-key --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --api-key <api_key>` |
| `hoody agent models set-provider-default` |  | write | Set a provider's default credential method | `agent.models.setProviderDefault` | `hoody agent models set-provider-default --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --default <default>` |
| `hoody agent models start-provider-o-auth` |  | write | Start a provider OAuth login | `agent.models.startProviderOAuth` | `hoody agent models start-provider-o-auth --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --add-account` |
| `hoody agent models submit-provider-o-auth-code` |  | write | Submit a provider OAuth authorization code | `agent.models.submitProviderOAuthCode` | `hoody agent models submit-provider-o-auth-code --id abc-123 --job abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --code <code>` |
| `hoody agent sessions answer-assist` |  | write | Propose answers for a parked question (helper model) | `agent.sessions.answerAssist` | `hoody agent sessions answer-assist --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --mode stable --model openai/gpt-5.4-nano --gen 10` |
| `hoody agent sessions answer-question` |  | write | Answer a parked question gate | `agent.sessions.answerQuestion` | `hoody agent sessions answer-question --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --gate-id abc-123 --generation 10 --answer <answer> --text "Hello" --answers <answers>` |
| `hoody agent sessions cancel` |  | write | Cancel the active turn (Esc) | `agent.sessions.cancelSession` | `hoody agent sessions cancel --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent sessions close` |  | write | Close the session (teardown) | `agent.sessions.closeSession` | `hoody agent sessions close --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent sessions confirm-gate` |  | write | Answer a parked confirm gate | `agent.sessions.confirmGate` | `hoody agent sessions confirm-gate --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --gate-id abc-123 --generation 10 --approved --persist-dirs` |
| `hoody agent sessions create` |  | write | Create, fork, or attach a session | `agent.sessions.createSession` | `hoody --container ctr-abc agent sessions create --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --cwd <cwd> --config-dir <config_dir> --model openai/gpt-5.4-nano --agent my-agent --tool-mode <tool_mode> --dir-scope <dir_scope> --attach <attach> --fork <fork> --fork-turn-idx 10 --backend <backend> --delegated-agent <delegated_agent> --headless` |
| `hoody agent sessions delete` |  | write | Close (and optionally hard-delete) a session | `agent.sessions.deleteSession` | `hoody agent sessions delete --id abc-123 --hard --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent sessions get` |  | read | Get a session summary | `agent.sessions.getSession` | `hoody agent sessions get --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent sessions list` |  | read | List sessions | `agent.sessions.listSessionsIterator` | `hoody agent sessions list --include-system --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent sessions list-cwds` |  | read | List distinct session working directories | `agent.sessions.listSessionCwds` | `hoody agent sessions list-cwds --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent sessions post-workflow-message` |  | write | Send a message to a running workflow | `agent.sessions.postWorkflowMessage` | `hoody agent sessions post-workflow-message --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --text "Hello"` |
| `hoody agent sessions prompt-sync` |  | write | Dispatch a turn and block to completion | `agent.sessions.promptSync` | `hoody agent sessions prompt-sync --id abc-123 --policy <policy> --x-hoody-gate-policy <x_hoody_gate_policy> --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --text "Hello" --tool-mode <tool_mode> --dir-scope <dir_scope>` |
| `hoody agent sessions replay` |  | read | Replay a live session's buffered events | `agent.sessions.replaySession` | `hoody agent sessions replay --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent sessions set-auto-reply` |  | write | Arm/disarm the auto-reply loop | `agent.sessions.setSessionAutoReply` | `hoody agent sessions set-auto-reply --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --armed --rounds 10 --model openai/gpt-5.4-nano --allow-writes` |
| `hoody agent sessions set-auto-reply-writes` |  | write | Flip the auto-reply write opt-in | `agent.sessions.setSessionAutoReplyWrites` | `hoody agent sessions set-auto-reply-writes --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --allow-writes` |
| `hoody agent sessions set-chat-agent` |  | write | Switch the chat agent | `agent.sessions.setSessionAgent` | `hoody agent sessions set-chat-agent --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --agent my-agent` |
| `hoody agent sessions set-effort` |  | write | Set reasoning effort | `agent.sessions.setSessionEffort` | `hoody agent sessions set-effort --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --effort <effort>` |
| `hoody agent sessions set-hoody-env` |  | write | Toggle Hoody shell-env injection | `agent.sessions.setSessionHoodyEnv` | `hoody agent sessions set-hoody-env --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --enabled` |
| `hoody agent sessions set-model` |  | write | Switch the session model | `agent.sessions.setSessionModel` | `hoody agent sessions set-model --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --model openai/gpt-5.4-nano` |
| `hoody agent sessions set-verbosity` |  | write | Set response verbosity | `agent.sessions.setSessionVerbosity` | `hoody agent sessions set-verbosity --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --level <level>` |
| `hoody agent sessions trim` |  | write | Trim session history to a turn index | `agent.sessions.trimSession` | `hoody agent sessions trim --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --turn-idx 10` |
| `hoody agent settings delete-fusion` |  | write | Delete a fusion composite | `agent.settings.deleteFusion` | `hoody agent settings delete-fusion --slug abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent settings get` |  | read | Get settings | `agent.settings.getSettings` | `hoody agent settings get --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent settings get-acp-status` |  | read | Get BYOA ACP backend status | `agent.settings.getACPStatus` | `hoody agent settings get-acp-status --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent settings list-fusion` |  | read | List fusion composites | `agent.settings.listFusionIterator` | `hoody agent settings list-fusion --include-invalid --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent settings patch` |  | write | Patch settings | `agent.settings.patchSettings` | `hoody agent settings patch --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --patch <patch>` |
| `hoody agent settings set-acp-secret` |  | write | Store an ACP per-agent secret value | `agent.settings.setACPSecret` | `hoody agent settings set-acp-secret --agent my-agent --key <key> --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --value "hello"` |
| `hoody agent settings upsert-fusion` |  | write | Create or update a fusion composite | `agent.settings.upsertFusion` | `hoody agent settings upsert-fusion --slug abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --spec <spec>` |
| `hoody agent skills apply-import` |  | write | Apply a skill import | `agent.skills.applySkillImport` | `hoody agent skills apply-import --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent skills clear-hub-cache` |  | write | Clear the skill hub cache | `agent.skills.clearSkillHubCache` | `hoody agent skills clear-hub-cache --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent skills create` |  | write | Create a skill | `agent.skills.createSkill` | `hoody agent skills create --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --name my-resource --description "My description" --content "Hello"` |
| `hoody agent skills delete` |  | write | Delete a skill | `agent.skills.deleteSkill` | `hoody agent skills delete --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --root-dir <root_dir> --rel-dir <rel_dir>` |
| `hoody agent skills get-hub-cache` |  | read | Skill hub cache stats | `agent.skills.getSkillHubCache` | `hoody agent skills get-hub-cache --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent skills get-source` |  | read | Read a skill's source | `agent.skills.getSkillSource` | `hoody agent skills get-source --root-dir <root_dir> --rel-dir <rel_dir> --root <root> --rel <rel> --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent skills install-hub` |  | write | Install a hub skill | `agent.skills.installSkillHub` | `hoody agent skills install-hub --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --id abc-123` |
| `hoody agent skills list` |  | read | List skills | `agent.skills.listSkillsIterator` | `hoody agent skills list --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent skills preview-hub` |  | read | Preview a hub skill | `agent.skills.previewSkillHub` | `hoody agent skills preview-hub --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent skills put-source` |  | write | Write a skill's source | `agent.skills.putSkillSource` | `hoody agent skills put-source --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --root-dir <root_dir> --rel-dir <rel_dir> --content "Hello" --base-gen 10` |
| `hoody agent skills rename` |  | write | Rename a skill | `agent.skills.renameSkill` | `hoody agent skills rename --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --root-dir <root_dir> --rel-dir <rel_dir> --new-name <new_name>` |
| `hoody agent skills scan-import` |  | read | Scan for importable skills | `agent.skills.scanSkillImport` | `hoody agent skills scan-import --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent skills search-hub` |  | read | Search the skill hub | `agent.skills.searchSkillHub` | `hoody agent skills search-hub --q <q> --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent skills toggle` |  | write | Enable/disable a skill | `agent.skills.toggleSkill` | `hoody agent skills toggle --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --name my-resource --disabled` |
| `hoody agent skills trust` |  | write | Set a skill's trust state | `agent.skills.trustSkill` | `hoody agent skills trust --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --root-dir <root_dir> --rel-dir <rel_dir> --trusted` |
| `hoody agent statistics get` |  | read | Cross-session statistics | `agent.statistics.getStatistics` | `hoody agent statistics get --scope cwd --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent statistics usage-by-account` |  | read | Usage rollup by account | `agent.statistics.usageByAccount` | `hoody agent statistics usage-by-account --since 1750000000 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent statistics usage-by-model` |  | read | Usage rollup by model | `agent.statistics.usageByModel` | `hoody agent statistics usage-by-model --since 1750000000 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent system docs` |  | read | API documentation UI | `agent.system.docs` | `hoody agent system docs` |
| `hoody agent system health-check` |  | read | Standardized health check | `agent.system.healthCheck` | `hoody agent system health-check` |
| `hoody agent system metrics` |  | read | Prometheus metrics | `agent.system.metrics` | `hoody agent system metrics` |
| `hoody agent system openapi-json` |  | read | OpenAPI spec (JSON) | `agent.system.openapiJSON` | `hoody agent system openapi-json` |
| `hoody agent system openapi-yaml` |  | read | OpenAPI spec (YAML) | `agent.system.openapiYAML` | `hoody agent system openapi-yaml` |
| `hoody agent tasks cancel` |  | write | Cancel a background task | `agent.tasks.cancelTask` | `hoody agent tasks cancel --id abc-123 --tid abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent tasks cancel-all` |  | write | Cancel all background tasks | `agent.tasks.cancelAllTasks` | `hoody agent tasks cancel-all --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent tasks list` |  | read | Request the session's task snapshot | `agent.tasks.listTasks` | `hoody agent tasks list --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent tasks request-transcript` |  | read | Request a task's transcript (upsert-poll) | `agent.tasks.requestTaskTranscript` | `hoody agent tasks request-transcript --id abc-123 --tid abc-123 --after-seq 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent todos approve-proposal` |  | write | Approve a todo proposal | `agent.todos.approveTodoProposal` | `hoody agent todos approve-proposal --id abc-123 --pid 1234 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent todos archive` |  | write | Archive a todo | `agent.todos.archiveTodo` | `hoody agent todos archive --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --revision 10` |
| `hoody agent todos cancel-run` |  | write | Cancel a todo's run | `agent.todos.cancelTodoRun` | `hoody agent todos cancel-run --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent todos claim` |  | write | Claim a todo | `agent.todos.claimTodo` | `hoody agent todos claim --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --revision 10` |
| `hoody agent todos create` |  | write | File a todo | `agent.todos.createTodo` | `hoody agent todos create --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --title "My Title" --body '{}' --priority 10 --tags "tag1,tag2" --cwd <cwd>` |
| `hoody agent todos deny-proposal` |  | write | Deny a todo proposal | `agent.todos.denyTodoProposal` | `hoody agent todos deny-proposal --id abc-123 --pid 1234 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent todos get` |  | read | Read a todo | `agent.todos.getTodo` | `hoody agent todos get --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent todos get-revision` |  | read | Get the todos store revision | `agent.todos.getTodosRevision` | `hoody agent todos get-revision --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent todos list` |  | read | List todos | `agent.todos.listTodosIterator` | `hoody agent todos list --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --states <states> --tags "tag1,tag2" --query "my search" --open-only --all` |
| `hoody agent todos message` |  | write | Comment + run an orchestrator turn | `agent.todos.messageTodo` | `hoody agent todos message --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --text "Hello"` |
| `hoody agent todos post-comment` |  | write | Comment on a todo | `agent.todos.postTodoComment` | `hoody agent todos post-comment --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --text "Hello"` |
| `hoody agent todos purge` |  | write | Purge archived todos | `agent.todos.purgeTodos` | `hoody agent todos purge --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent todos release` |  | write | Release a todo | `agent.todos.releaseTodo` | `hoody agent todos release --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent todos run` |  | write | Run a todo's orchestrator | `agent.todos.runTodo` | `hoody agent todos run --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent todos snooze` |  | write | Snooze a todo | `agent.todos.snoozeTodo` | `hoody agent todos snooze --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --wake-at <wake_at> --revision 10` |
| `hoody agent todos triage` |  | write | Run an LLM triage pass | `agent.todos.triageTodos` | `hoody agent todos triage --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent todos update` |  | write | Update a todo (CAS) | `agent.todos.updateTodo` | `hoody agent todos update --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --revision 10 --title "My Title" --body '{}' --state active --priority 10 --rank 10 --tags "tag1,tag2" --cwd <cwd>` |
| `hoody agent tools get` |  | read | Get one tool schema | `agent.tools.getTool` | `hoody agent tools get --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent tools list` |  | read | List the tool catalogue | `agent.tools.listToolsIterator` | `hoody agent tools list --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent tools list-read-only` |  | read | List the read-only tool subset | `agent.tools.listReadOnlyToolsIterator` | `hoody agent tools list-read-only --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent tools list-session` |  | read | List a session's effective tool set | `agent.tools.listSessionToolsIterator` | `hoody agent tools list-session --id abc-123 --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent tools list-session-mcp` |  | read | List a session's MCP tools | `agent.tools.listSessionMCPToolsIterator` | `hoody agent tools list-session-mcp --id abc-123 --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent tools run` |  | write | Run a tool (sessionless, gated) | `agent.tools.runTool` | `hoody agent tools run --name my-resource --confirm --confirm-token <confirm_token> --x-hoody-tool-mode <x_hoody_tool_mode> --x-hoody-dir-scope <x_hoody_dir_scope> --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --params <params> --allow-mutations` |
| `hoody agent tools run-async` |  | write | Run a tool asynchronously (sessionless, gated) | `agent.tools.runToolAsync` | `hoody agent tools run-async --name my-resource --confirm --confirm-token <confirm_token> --x-hoody-tool-mode <x_hoody_tool_mode> --x-hoody-dir-scope <x_hoody_dir_scope> --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --params <params> --allow-mutations` |
| `hoody agent tools run-session` |  | write | Run a tool inside a live session (gated) | `agent.tools.runSessionTool` | `hoody agent tools run-session --id abc-123 --name my-resource --confirm --confirm-token <confirm_token> --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --params <params> --allow-mutations` |
| `hoody agent workflows cancel-run` |  | write | Cancel a workflow run | `agent.workflows.cancelWorkflowRun` | `hoody agent workflows cancel-run --run-id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent workflows delete` |  | write | Delete a workflow definition | `agent.workflows.deleteWorkflow` | `hoody agent workflows delete --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent workflows get` |  | read | Read one workflow definition | `agent.workflows.getWorkflow` | `hoody agent workflows get --name my-resource --include-revision --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent workflows get-run` |  | read | Get one workflow run by id | `agent.workflows.getWorkflowRun` | `hoody agent workflows get-run --run-id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent workflows hide` |  | write | Hide or un-hide a workflow | `agent.workflows.hideWorkflow` | `hoody agent workflows hide --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --hidden` |
| `hoody agent workflows list` |  | read | List workflow definitions | `agent.workflows.listWorkflowsIterator` | `hoody agent workflows list --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent workflows list-runs` |  | read | Snapshot in-flight and recent workflow runs | `agent.workflows.listWorkflowRunsIterator` | `hoody agent workflows list-runs --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent workflows put` |  | write | Create or replace a workflow definition | `agent.workflows.putWorkflow` | `hoody agent workflows put --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --definition <definition> --expected-revision <expected_revision> --expected-absent` |
| `hoody agent workflows run-session` |  | write | Run a workflow onto an existing session | `agent.workflows.runSessionWorkflow` | `hoody agent workflows run-session --id abc-123 --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --prompt <prompt> --inputs <inputs>` |

## `hoody ai` — 1 command

Hoody AI catalog and models

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody ai list` |  | read | List available AI models (Hoody catalog) | `api.ai.listModels` | `hoody ai list` |

## `hoody auth` (alias: token) — 32 commands

Authentication, tokens, and 2FA

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody auth 2fa disable` |  | destructive | Disable 2FA | `api.tfa.disable` | `hoody auth 2fa disable --password <password> --code <code>` |
| `hoody auth 2fa gate` |  | write | Set 2FA token gate preference | `api.tfa.setTokenGate` | `hoody auth 2fa gate --enabled --password <password> --otp-code <code>` |
| `hoody auth 2fa regenerate` |  | action | Regenerate Backup Codes | `api.tfa.regenerateBackupCodes` | `hoody auth 2fa regenerate --password <password> --code <code>` |
| `hoody auth 2fa setup` |  | action | Initialize 2FA Setup | `api.tfa.setup` | `hoody auth 2fa setup --password <password>` |
| `hoody auth 2fa status` |  | read | Get 2FA Status | `api.tfa.getStatus` | `hoody auth 2fa status` |
| `hoody auth 2fa verify` |  | action | Verify 2FA Code During Login | `api.tfa.verify` | `hoody auth 2fa verify --temp-token <temp_token> --code <code> --response-mode intent --print-token` |
| `hoody auth 2fa verify-setup` |  | action | Complete 2FA Setup | `api.tfa.verifySetup` | `hoody auth 2fa verify-setup --code <code>` |
| `hoody auth copy` |  | write | Copy auth token | `api.authTokens.copy` | `hoody auth copy abc-123 --alias my-resource --expires-at today --otp-code <code>` |
| `hoody auth create` | new, add | write | Create a new auth token | `api.authTokens.create` | `hoody auth create --alias my-resource --public-key pk_abc123 --public-storage '{}' --ip-whitelist <ip_whitelist> --permission-template <permission_template> --permissions-containers-create --permissions-containers-read --permissions-containers-update --permissions-containers-delete --permissions-containers-actions-start --permissions-containers-actions-stop --permissions-containers-actions-restart --permissions-containers-actions-exec --permissions-containers-actions-logs --permissions-containers-features-ai --permissions-containers-features-hoody-kit --permissions-containers-features-snapshots --permissions-containers-features-networking --permissions-projects-create --permissions-projects-read --permissions-projects-update --permissions-projects-delete --permissions-projects-members-invite --permissions-projects-members-remove --permissions-projects-members-change-roles --permissions-financial-wallet-read --permissions-financial-wallet-transfer --permissions-financial-wallet-withdraw --permissions-financial-billing-read --permissions-financial-billing-manage-payment-methods --permissions-financial-billing-download-invoices --permissions-financial-server-rental-view-marketplace --permissions-financial-server-rental-rent-servers --permissions-financial-server-rental-extend-rentals --permissions-financial-server-rental-terminate-rentals --permissions-resources-vault --permissions-resources-events --permissions-resources-ssh-keys --permissions-resources-storage-shares --permissions-resources-proxy-aliases --permissions-resources-firewalls --permissions-resources-realms --permissions-resources-auth-token-public-profile --permissions-resources-create-tokens --permissions-resources-read-account --permissions-admin-users --permissions-admin-servers --permissions-admin-system --permissions-admin-billing --permissions-admin-monitoring --realm-ids "realm-1" --allow-no-realm --vault-access --event-access --deny-reauthorization --expires-at today --otp-code <code>` |
| `hoody auth delete` | rm, remove | destructive | Delete auth token | `api.authTokens.delete` | `hoody auth delete abc-123` |
| `hoody auth email resend` |  | write | Resend verification email | `api.authentication.resendVerification` | `hoody auth email resend --email user@example.com` |
| `hoody auth email verify` |  | write | Verify email address | `api.authentication.verifyEmail` | `hoody auth email verify --token <token> --response-mode intent --code-challenge <code> --print-token` |
| `hoody auth get` | show, describe | read | Get auth token by ID | `api.authTokens.get` | `hoody auth get abc-123` |
| `hoody auth get-current` |  | read | Get current auth token details | `api.authTokens.getCurrent` | `hoody auth get-current` |
| `hoody auth list` | ls | read | List auth tokens | `api.authTokens.listIterator` | `hoody auth list` |
| `hoody auth login` |  | action | Login with username and password | `api.authentication.login` | `hoody auth login --username alice --email user@example.com --password <password> --response-mode intent --code-challenge <code> --print-token` |
| `hoody auth logout` |  | action | Logout | `api.authentication.logout` | `hoody auth logout` |
| `hoody auth oauth github callback` |  | read | GitHub OAuth callback | `api.authentication.githubOAuthCallback` | `hoody auth oauth github callback --code <code> --state active` |
| `hoody auth oauth github redirect` |  | read | Redirect to GitHub OAuth | `api.authentication.githubOAuthRedirect` | `hoody auth oauth github redirect --intent login --redirect-uri <redirect_uri> --code-challenge <code>` |
| `hoody auth oauth google callback` |  | read | Google OAuth callback | `api.authentication.googleOAuthCallback` | `hoody auth oauth google callback --code <code> --state active` |
| `hoody auth oauth google redirect` |  | read | Redirect to Google OAuth | `api.authentication.googleOAuthRedirect` | `hoody auth oauth google redirect --redirect-uri <redirect_uri> --code-challenge <code>` |
| `hoody auth password forgot` |  | write | Request password reset | `api.authentication.forgotPassword` | `hoody auth password forgot --email user@example.com` |
| `hoody auth password reset` |  | write | Reset password | `api.authentication.resetPassword` | `hoody auth password reset --token <token> --password <password>` |
| `hoody auth profile by-public-key` |  | read | Get auth token public profile by public key | `api.authTokens.getPublicProfile` | `hoody auth profile by-public-key pk_abc123` |
| `hoody auth profile current` |  | read | Get current user profile | `api.authentication.getCurrentUser` | `hoody auth profile current` |
| `hoody auth profile update` |  | write | Update current auth token public profile | `api.authTokens.updatePublicProfile` | `hoody auth profile update --public-key pk_abc123 --public-storage '{}'` |
| `hoody auth realms add` |  | write | Add realm to auth token | `api.authTokens.addRealm` | `hoody auth realms add abc-123 --realm-id abc-123 --otp-code <code>` |
| `hoody auth realms remove` |  | destructive | Remove realm from auth token | `api.authTokens.removeRealm` | `hoody auth realms remove abc-123 --realm-id abc-123 --otp-code <code>` |
| `hoody auth refresh` |  | action | Refresh access token | `api.authentication.refreshToken` | `hoody auth refresh --refresh-token <refresh_token> --print-token` |
| `hoody auth regions` |  | read | Get available server regions | `api.authentication.getAvailableRegions` | `hoody auth regions` |
| `hoody auth signup` |  | write | Sign up with email and password | `api.authentication.signup` | `hoody auth signup --email user@example.com --password <password> --region eu-west-1 --invite-code <invite_code>` |
| `hoody auth update` | edit | write | Update auth token | `api.authTokens.update` | `hoody auth update abc-123 --alias my-resource --public-key pk_abc123 --public-storage '{}' --ip-whitelist <ip_whitelist> --permissions-containers-create --permissions-containers-read --permissions-containers-update --permissions-containers-delete --permissions-containers-actions-start --permissions-containers-actions-stop --permissions-containers-actions-restart --permissions-containers-actions-exec --permissions-containers-actions-logs --permissions-containers-features-ai --permissions-containers-features-hoody-kit --permissions-containers-features-snapshots --permissions-containers-features-networking --permissions-projects-create --permissions-projects-read --permissions-projects-update --permissions-projects-delete --permissions-projects-members-invite --permissions-projects-members-remove --permissions-projects-members-change-roles --permissions-financial-wallet-read --permissions-financial-wallet-transfer --permissions-financial-wallet-withdraw --permissions-financial-billing-read --permissions-financial-billing-manage-payment-methods --permissions-financial-billing-download-invoices --permissions-financial-server-rental-view-marketplace --permissions-financial-server-rental-rent-servers --permissions-financial-server-rental-extend-rentals --permissions-financial-server-rental-terminate-rentals --permissions-resources-vault --permissions-resources-events --permissions-resources-ssh-keys --permissions-resources-storage-shares --permissions-resources-proxy-aliases --permissions-resources-firewalls --permissions-resources-realms --permissions-resources-auth-token-public-profile --permissions-resources-create-tokens --permissions-resources-read-account --permissions-admin-users --permissions-admin-servers --permissions-admin-system --permissions-admin-billing --permissions-admin-monitoring --realm-ids "realm-1" --allow-no-realm --vault-access --event-access --expires-at today --is-enabled --otp-code <code>` |

## `hoody browser` (alias: br) — 26 commands

Browser automation and control

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody browser open` |  | action | Open the Browser kit service (browser automation UI) in your browser |  | `hoody browser open [index] [--url]` |
| `hoody browser console` |  | read | Get console logs (use `--clear` to also clear) | `browser.debugging.getConsoleLogs` | `hoody browser console --browser-id 1 --tab-id 10 --start --type default --since 2026-01-01T00:00:00Z --clear` |
| `hoody browser cookies clear` |  | destructive | Clear all cookies | `browser.cookies.clear` | `hoody browser cookies clear --browser-id 1 --start` |
| `hoody browser cookies get` |  | read | Get cookies | `browser.cookies.get` | `hoody browser cookies get --browser-id 1 --start --url https://example.com` |
| `hoody browser cookies set` |  | write | Set cookies | `browser.cookies.set` | `hoody browser cookies set --browser-id 1 --start` |
| `hoody browser devtools` |  | read | Get DevTools URLs | `browser.introspection.getDevtoolsUrl` | `hoody browser devtools --browser-id 1 --start` |
| `hoody browser eval` |  | action | Execute JavaScript | `browser.interaction.evalGet` | `hoody browser eval --browser-id 1 --start --script <script>` |
| `hoody browser eval-post` |  | action | Execute JavaScript (POST) | `browser.interaction.evalPost` | `hoody browser eval-post --browser-id 1 --start --script <script>` |
| `hoody browser health` |  | read | Health check | `browser.health.check` | `hoody browser health` |
| `hoody browser history delete` | rm, remove | destructive | Delete browsing history | `browser.history.clear` | `hoody browser history delete --before <before> --browser-id 1` |
| `hoody browser history query` |  | read | Query browsing history | `browser.history.list` | `hoody browser history query --since 2026-01-01T00:00:00Z --browser-id 1 --limit 50 --offset 0` |
| `hoody browser html` |  | read | Get page HTML | `browser.page.getHtml` | `hoody browser html --browser-id 1 --tab-id 10 --start` |
| `hoody browser info` | metadata | read | Get instance metadata | `browser.introspection.getMetadata` | `hoody browser info --browser-id 1 --start` |
| `hoody browser metrics` |  | read | Server metrics | `browser.health.getMetrics` | `hoody browser metrics` |
| `hoody browser navigate` |  | action | Navigate to URL | `browser.interaction.browse` | `hoody browser navigate --browser-id 1 --start --url https://example.com --tab-id 10 --active --only-if-not-exists --ignore-get-parameters` |
| `hoody browser navigate-post` |  | action | Navigate to URL (POST) | `browser.interaction.browsePost` | `hoody browser navigate-post --browser-id 1 --start --url https://example.com --tab-id 10 --active --only-if-not-exists --ignore-get-parameters` |
| `hoody browser network` |  | read | Get network logs (use `--clear` to also clear) | `browser.debugging.getNetworkLogs` | `hoody browser network --browser-id 1 --tab-id 10 --start --since 2026-01-01T00:00:00Z --clear` |
| `hoody browser pdf` |  | read | Export page as PDF | `browser.page.exportPdf` | `hoody browser pdf --browser-id 1 --tab-id 10 --start --url https://example.com --format Letter --landscape --print-background --margin <margin>` |
| `hoody browser restart` |  | action | Restart browser instance | `browser.instances.restart` | `hoody browser restart --browser-id 1 --chromium-version <chromium_version> --fingerprint-id abc-123 --use-remote-debugging-port --remote-debugging-port 10 --remote-debugging-address <remote_debugging_address> --extensions <extensions> --extensions-dir <extensions_dir> --extensions-store-ids <extensions_store_ids> --proxy-server <proxy_server> --proxy-username <proxy_username> --proxy-password <proxy_password> --proxy-bypass <proxy_bypass> --enable-quic --enable-dns-over-https --dns-over-https-url https://cloudflare-dns.com/dns-query --display 10 --show-browser --session-name <session_name> --timezone-id abc-123 --locale <locale> --user-agent "Mozilla/5.0" --viewport <viewport> --geolocation <geolocation> --launch-arguments <launch_arguments> --browser chromium --firefox-version <firefox_version> --firefox-executable-path /home/user/file.txt --show-devtools --stealth --iframe --iframe-url https://example.com --maximize-new-windows` |
| `hoody browser screenshot` | shot | read | Capture browser screenshot | `browser.interaction.takeScreenshot` | `hoody browser screenshot --browser-id 1 --start --url https://example.com --tab-id 10 --only-if-not-exists --ignore-get-parameters --format png --quality 10 --full-page` |
| `hoody browser shutdown` |  | destructive | Shutdown browser instance | `browser.introspection.shutdown` | `hoody browser shutdown --browser-id 1` |
| `hoody browser start` | up | action | Create or retrieve browser instance | `browser.instances.start` | `hoody browser start --browser-id 1 --chromium-version <chromium_version> --fingerprint-id abc-123 --use-remote-debugging-port --remote-debugging-port 10 --remote-debugging-address <remote_debugging_address> --extensions <extensions> --extensions-dir <extensions_dir> --extensions-store-ids <extensions_store_ids> --proxy-server <proxy_server> --proxy-username <proxy_username> --proxy-password <proxy_password> --proxy-bypass <proxy_bypass> --enable-quic --enable-dns-over-https --dns-over-https-url https://cloudflare-dns.com/dns-query --display 10 --show-browser --session-name <session_name> --timezone-id abc-123 --locale <locale> --user-agent "Mozilla/5.0" --viewport <viewport> --geolocation <geolocation> --stealth --iframe --iframe-url https://example.com --maximize-new-windows` |
| `hoody browser stop` | kill, down | action | Stop browser instance | `browser.instances.stop` | `hoody browser stop --browser-id 1` |
| `hoody browser tabs close` |  | write | Close a browser tab | `browser.introspection.closeTab` | `hoody browser tabs close --browser-id 1 --start --tab-id 10` |
| `hoody browser tabs list` |  | read | List browser tabs | `browser.introspection.listTabs` | `hoody browser tabs list --browser-id 1 --start` |
| `hoody browser text` |  | read | Get page text | `browser.page.getText` | `hoody browser text --browser-id 1 --tab-id 10 --start` |

## `hoody code` (alias: vscode) — 7 commands

VS Code server

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody code embed` |  | read | Build an iframeable URL for a VS Code extension (extension-only mode) | `client.code.vscode.embedUrl` | `hoody code embed rooveterinaryinc.roo-cline` |
| `hoody code open` |  | action | Open the Code kit service in your browser |  | `hoody code open [index] [--url] [--folder PATH]` |
| `hoody code auth mint-key` |  | write | Generate server web key | `code.vscode.mintKey` | `hoody code auth mint-key` |
| `hoody code check-update` |  | read | Check for updates | `code.health.checkUpdate` | `hoody code check-update` |
| `hoody code extensions install` |  | write | Install VS Code extension from URL | `code.extensions.install` | `hoody code extensions install --url https://example.com --as-builtin` |
| `hoody code extensions list` | ls | read | List installed extensions | `code.extensions.listIterator` | `hoody code extensions list` |
| `hoody code health` |  | read | Service health check | `code.health.check` | `hoody code health` |

## `hoody containers` (aliases: container, c) — 41 commands

Container lifecycle, stats, and proxy permissions. Proxy subcommands (`hoody containers proxy ...`) cover per-container hooks, permissions, groups, settings, and service discovery. For global proxy routing/aliases/logs, see `hoody proxy`.

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody containers authorize` |  | write | Authorize Container Access | `api.containers.authorize` | `hoody containers authorize abc-123` |
| `hoody containers copy` |  | write | Copy a container | `api.containers.copy` | `hoody containers copy abc-123 --target-project-id abc-123 --target-server-id abc-123 --name my-resource --ssh-public-key <ssh_public_key> --source-snapshot <source_snapshot> --copy-firewall-rules --copy-network-rules` |
| `hoody containers create` |  | write | Create a new container | `api.containers.create` | `hoody containers create --project abc-123 --server-id abc-123 --name my-resource --color "#ff0000" --container-image <container_image> --ai --environment-vars <key=value> --ssh-public-key <ssh_public_key> --comment "Hello" --hoody-kit --dev-kit --autostart --ramdisk --cache --cache-image --prespawn --bypass-prespawn --realm-ids "realm-1"` |
| `hoody containers delete` | rm, remove | destructive | Delete a container | `api.containers.delete` | `hoody containers delete abc-123` |
| `hoody containers env bulk-set` |  | write | Bulk set container environment variables | `api.env.bulkSet` | `hoody containers env bulk-set --body '{}'` |
| `hoody containers env delete` | rm, remove | destructive | Delete a single environment variable | `api.env.delete` | `hoody containers env delete --key <key>` |
| `hoody containers env list` | ls | read | List container environment variables | `api.env.list` | `hoody --container ctr-abc containers env list` |
| `hoody containers env set` |  | write | Set a single environment variable | `api.env.set` | `hoody containers env set --key <key> --value "hello"` |
| `hoody containers get` | show, describe | read | Get a container by ID | `api.containers.get` | `hoody containers get abc-123 --runtime <runtime> --include-proxy-domains true --include-proxy-permissions true` |
| `hoody containers list` | ls | read | Get all containers | `api.containers.listIterator` | `hoody containers list --page 1 --limit 50 --sort-by id --sort-order asc --realm-id abc-123 --runtime <runtime>` |
| `hoody containers manage` |  | action | Manage container | `api.containers.manage` | `hoody containers manage abc-123 <operation>` |
| `hoody containers proxy default` |  | write | Update container default proxy permission policy | `api.proxyPermissionsContainer.updateDefault` | `hoody containers proxy default --if-match <if_match> --default allow` |
| `hoody containers proxy discovery groups list` | ls | read | List container proxy groups | `api.proxyDiscovery.listContainerProxyGroups` | `hoody containers proxy discovery groups list abc-123` |
| `hoody containers proxy discovery services get` |  | read | Get merged proxy view for a service | `api.proxyDiscovery.getContainerProxyService` | `hoody containers proxy discovery services get abc-123 <service>` |
| `hoody containers proxy discovery services list` | ls | read | List services referenced in proxy config | `api.proxyDiscovery.listContainerProxyServices` | `hoody containers proxy discovery services list abc-123` |
| `hoody containers proxy groups delete` |  | destructive | Remove container authentication group | `api.proxyPermissionsContainer.removeAuthGroup` | `hoody containers proxy groups delete --group-name <group_name> --if-match <if_match>` |
| `hoody containers proxy groups ip set` |  | write | Set IP authentication group (container) | `api.proxyPermissionsContainer.setIpGroup` | `hoody containers proxy groups ip set --group-name <group_name> --if-match <if_match> --range <range>` |
| `hoody containers proxy groups jwt set` |  | write | Set JWT authentication group (container) | `api.proxyPermissionsContainer.setJwtGroup` | `hoody containers proxy groups jwt set --group-name <group_name> --if-match <if_match> --secret <secret> --algorithm HS256 --sources nix --claims <key=value>` |
| `hoody containers proxy groups password set` |  | write | Set password authentication group (container) | `api.proxyPermissionsContainer.setPasswordGroup` | `hoody containers proxy groups password set --group-name <group_name> --if-match <if_match> --auth-username alice --auth-password <password> --algorithm sha256 --salt <salt>` |
| `hoody containers proxy groups permissions clear` | rm | destructive | Remove all program permissions for a container group | `api.proxyPermissionsContainer.removeGroup` | `hoody containers proxy groups permissions clear --group-name <group_name> --if-match <if_match>` |
| `hoody containers proxy groups permissions delete` |  | destructive | Remove a single program permission for a container group | `api.proxyPermissionsContainer.removeProgram` | `hoody containers proxy groups permissions delete --group-name <group_name> --program <program> --if-match <if_match>` |
| `hoody containers proxy groups permissions set` |  | write | Set container group program permission | `api.proxyPermissionsContainer.setGroup` | `hoody containers proxy groups permissions set --group-name <group_name> --if-match <if_match> --program <program> --access *` |
| `hoody containers proxy groups token set` |  | write | Set token authentication group (container) | `api.proxyPermissionsContainer.setTokenGroup` | `hoody containers proxy groups token set --group-name <group_name> --if-match <if_match> --body '{}'` |
| `hoody containers proxy hooks clear-service` |  | destructive | Clear all hooks for a service | `api.proxyHooks.clearContainerProxyServiceHooks` | `hoody containers proxy hooks clear-service abc-123 <service> --if-match <if_match>` |
| `hoody containers proxy hooks create` | new, add | write | Append or insert a new hook | `api.proxyHooks.addContainerProxyHook` | `hoody containers proxy hooks create abc-123 <service> --if-match <if_match> --match-method <match.method> --match-path <match.path> --match-headers <key=value> --script-subdomain <script.subdomain> --script-exec-id abc-123 --script-path <script.path> --timeout 10 --applies-to-groups <applies_to.groups> --position 10` |
| `hoody containers proxy hooks delete` | rm, remove | destructive | Remove a hook | `api.proxyHooks.removeContainerProxyHook` | `hoody containers proxy hooks delete abc-123 <service> abc-123 --if-match <if_match>` |
| `hoody containers proxy hooks get` |  | read | Get a single hook by id | `api.proxyHooks.getContainerProxyHook` | `hoody containers proxy hooks get abc-123 <service> abc-123` |
| `hoody containers proxy hooks list` | ls | read | List all proxy hooks for a container | `api.proxyHooks.listContainerProxyHooks` | `hoody containers proxy hooks list abc-123` |
| `hoody containers proxy hooks list-service` |  | read | List hooks for a specific service | `api.proxyHooks.listContainerProxyServiceHooks` | `hoody containers proxy hooks list-service abc-123 <service>` |
| `hoody containers proxy hooks move` |  | write | Move a hook to a new position | `api.proxyHooks.moveContainerProxyHook` | `hoody containers proxy hooks move abc-123 <service> abc-123 --if-match <if_match> --position 10` |
| `hoody containers proxy hooks update` | edit | write | Replace a hook in place | `api.proxyHooks.updateContainerProxyHook` | `hoody containers proxy hooks update abc-123 <service> abc-123 --if-match <if_match> --match-method <match.method> --match-path <match.path> --match-headers <key=value> --script-subdomain <script.subdomain> --script-exec-id abc-123 --script-path <script.path> --timeout 10 --applies-to-groups <applies_to.groups> --position 10` |
| `hoody containers proxy permissions delete` | rm | destructive | Delete container proxy permissions | `api.proxyPermissionsContainer.delete` | `hoody containers proxy permissions delete --if-match <if_match>` |
| `hoody containers proxy permissions get` |  | read | Get container proxy permissions | `api.proxyPermissionsContainer.get` | `hoody --container ctr-abc containers proxy permissions get` |
| `hoody containers proxy permissions replace` |  | write | Replace container proxy permissions JSON | `api.proxyPermissionsContainer.replace` | `hoody containers proxy permissions replace --if-match <if_match> --project proj-abc --groups <key=value> --permissions <key=value> --default allow --enable-proxy --hooks <key=value>` |
| `hoody containers proxy settings get` |  | read | Get container proxy root settings | `api.proxyDiscovery.getContainerProxySettings` | `hoody containers proxy settings get abc-123` |
| `hoody containers proxy settings update` | edit | write | Update container proxy root settings | `api.proxyDiscovery.updateContainerProxySettings` | `hoody containers proxy settings update abc-123 --if-match <if_match> --enable-proxy --default allow` |
| `hoody containers proxy state` |  | write | Update container proxy enable state | `api.proxyPermissionsContainer.updateState` | `hoody containers proxy state --if-match <if_match> --enable-proxy` |
| `hoody containers stats` |  | read | Get container resource statistics | `api.containers.getStats` | `hoody containers stats abc-123` |
| `hoody containers status-logs` |  | read | Get status logs for a container | `api.containers.getStatusLogs` | `hoody containers status-logs abc-123 --page 1 --limit 10 --sort-by transition_time --sort-order asc` |
| `hoody containers sync` |  | action | Sync a copied container with its source | `api.containers.sync` | `hoody containers sync abc-123` |
| `hoody containers update` | edit | write | Update a container | `api.containers.update` | `hoody containers update abc-123 --name my-resource --color "#ff0000" --ai --autostart --ramdisk --environment-vars <key=value> --ssh-public-key <ssh_public_key> --comment "Hello" --realm-ids "realm-1"` |

## `hoody cron` (alias: crontab) — 9 commands

Cron scheduling

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody cron crontabs get` |  | read | get crontab | `cron.crontab.get` | `hoody cron crontabs get alice` |
| `hoody cron crontabs list` |  | read | list all crontabs | `cron.crontab.listGlobalIterator` | `hoody cron crontabs list --page 10 --limit 10` |
| `hoody cron crontabs replace` |  | write | put crontab | `cron.crontab.put` | `hoody cron crontabs replace alice --crontab <crontab>` |
| `hoody cron entries create` | new, add | write | create entry | `cron.entries.create` | `hoody cron entries create alice --command "ls -la" --comment "Hello" --enabled --expires-at 2026-12-31T23:59:59Z --name my-resource --schedule "0 * * * *"` |
| `hoody cron entries delete` | rm, remove | destructive | delete entry | `cron.entries.delete` | `hoody cron entries delete alice abc-123` |
| `hoody cron entries get` |  | read | get entry | `cron.entries.get` | `hoody cron entries get alice abc-123` |
| `hoody cron entries list` |  | read | list entries | `cron.entries.listIterator` | `hoody cron entries list alice --page 10 --limit 10` |
| `hoody cron entries update` | edit | write | update entry | `cron.entries.update` | `hoody cron entries update alice abc-123 --clear-expiration --command "ls -la" --comment "Hello" --enabled --expires-at 2026-12-31T23:59:59Z --name my-resource --schedule "0 * * * *"` |
| `hoody cron health` |  | read | health check | `cron.health.check` | `hoody cron health` |

## `hoody curl` — 21 commands

cURL jobs and schedules

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody curl exec` | run | action | Execute HTTP request with full cURL capabilities | `curl.execute` | `hoody --proxy <proxy> curl exec --auth-method <auth_method> --auth-password <auth_password> --auth-user <auth_user> --bearer-token <bearer_token> --cacert <cacert> --cert <cert> --cert-type <cert_type> --compressed --connect-timeout 10 --cookie <cookie> --data <data> --follow-redirects --insecure --job-name <job_name> --json '{}' --keepalive --keepalive-time 10 --key <key> --max-filesize 100 --max-redirects 10 --method GET --mode sync --proxy-password <proxy_password> --proxy-user <proxy_user> --range <range> --referer <referer> --response transparent --retry-count 100 --retry-delay 10 --save --save-path /home/user/file.txt --schedule "0 * * * *" --session-id abc-123 --speed-limit 10 --speed-time 10 --tcp-nodelay --timeout 10 --url https://example.com --user-agent "Mozilla/5.0"` |
| `hoody curl get-url` |  | action | Execute simple HTTP request via query parameters | `curl.executeCurlRequestGet` | `hoody curl get-url --url https://example.com --method GET --response <response> --mode stable --session-id abc-123 --follow-redirects --timeout 10 --user-agent "Mozilla/5.0" --referer <referer> --bearer-token <bearer_token> --save --save-path /home/user/file.txt --insecure --compressed --job-name <job_name> --data <data> --json '{}' --header <header> --data-base64 <data_base64>` |
| `hoody curl health` |  | read | Service health check | `curl.health.check` | `hoody curl health` |
| `hoody curl jobs cancel` |  | destructive | Cancel a pending or running job | `curl.jobs.cancel` | `hoody curl jobs cancel abc-123` |
| `hoody curl jobs events` |  | read | Subscribe to job events over WebSocket | `curl.events.streamWs` | `hoody curl jobs events --job-id abc-123` |
| `hoody curl jobs get` |  | read | Get detailed job information | `curl.jobs.get` | `hoody curl jobs get abc-123` |
| `hoody curl jobs list` |  | read | List all async jobs | `curl.jobs.listIterator` | `hoody curl jobs list --page 10 --limit 10` |
| `hoody curl jobs result` |  | read | Get job response body | `curl.jobs.getResult` | `hoody curl jobs result abc-123` |
| `hoody curl metrics` |  | read | Prometheus metrics | `curl.ops.metrics` | `hoody curl metrics` |
| `hoody curl schedules create` | new, add | write | Create a recurring scheduled job | `curl.schedules.create` | `hoody curl schedules create --cron "0 * * * *" --request-auth-method <request.auth_method> --request-auth-password <request.auth_password> --request-auth-user <request.auth_user> --request-bearer-token <request.bearer_token> --request-cacert <request.cacert> --request-cert <request.cert> --request-cert-type <request.cert_type> --request-compressed --request-connect-timeout <request.connect_timeout> --request-cookie <request.cookie> --request-data <request.data> --request-follow-redirects --request-form <request.form> --request-headers <request.headers> --request-insecure --request-job-name <request.job_name> --request-json <request.json> --request-keepalive --request-keepalive-time <request.keepalive_time> --request-key <request.key> --request-max-filesize <request.max_filesize> --request-max-redirects <request.max_redirects> --request-method <request.method> --request-mode <request.mode> --request-proxy <request.proxy> --request-proxy-password <request.proxy_password> --request-proxy-user <request.proxy_user> --request-range <request.range> --request-referer <request.referer> --request-response <request.response> --request-retry-count 100 --request-retry-delay <request.retry_delay> --request-save --request-save-path /home/user/file.txt --request-schedule <request.schedule> --request-session-id abc-123 --request-speed-limit <request.speed_limit> --request-speed-time <request.speed_time> --request-tcp-nodelay --request-timeout <request.timeout> --request-url <request.url> --request-user-agent <request.user_agent>` |
| `hoody curl schedules delete` |  | destructive | Delete a schedule | `curl.schedules.delete` | `hoody curl schedules delete abc-123` |
| `hoody curl schedules get` |  | read | Get schedule details | `curl.schedules.get` | `hoody curl schedules get abc-123` |
| `hoody curl schedules list` |  | read | List all scheduled jobs | `curl.schedules.listIterator` | `hoody curl schedules list --page 10 --limit 10` |
| `hoody curl schedules toggle` |  | action | Enable or disable a schedule | `curl.schedules.toggle` | `hoody curl schedules toggle abc-123 --body '{}'` |
| `hoody curl sessions cookies` |  | read | Get session cookies only | `curl.sessions.getCookies` | `hoody curl sessions cookies abc-123` |
| `hoody curl sessions delete` |  | destructive | Delete a session | `curl.sessions.delete` | `hoody curl sessions delete abc-123` |
| `hoody curl sessions get` |  | read | Get session details | `curl.sessions.get` | `hoody curl sessions get abc-123` |
| `hoody curl sessions list` |  | read | List all cookie sessions | `curl.sessions.listIterator` | `hoody curl sessions list --page 10 --limit 10` |
| `hoody curl storage delete` |  | destructive | Delete a saved file | `curl.storage.deleteFile` | `hoody curl storage delete /home/user/file.txt` |
| `hoody curl storage get` |  | read | Download a saved file | `curl.storage.getFile` | `hoody curl storage get /home/user/file.txt` |
| `hoody curl storage list` |  | read | List all saved downloads | `curl.storage.listIterator` | `hoody curl storage list --page 10 --limit 10` |

## `hoody daemon` (alias: d) — 19 commands

Daemon and ephemeral programs

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody daemon ephemeral list` |  | read | List all ephemeral programs | `daemon.quickStart.listIterator` | `hoody daemon ephemeral list` |
| `hoody daemon ephemeral logs` |  | read | Get ephemeral program logs | `daemon.quickStart.getEphemeralLogs` | `hoody daemon ephemeral logs abc-123 --type stdout --lines 100` |
| `hoody daemon ephemeral start` |  | write | Launch ephemeral CUSTOM program | `daemon.quickStart.launch` | `hoody daemon ephemeral start --command "ls -la" --user alice --name my-resource --autorestart true --directory /home/user/src --environment <key=value> --priority 999 --delay-seconds 0 --stdout-logfile <stdout_logfile> --stderr-logfile <stderr_logfile> --logs-enabled --log-max-bytes 5242880 --log-backups 2 --ttl 10 --wait --timeout 30 --display :0 --terminal-id 10 --terminal-shell bash --terminal-interactive` |
| `hoody daemon ephemeral status` |  | read | Get ephemeral program status | `daemon.quickStart.getStatus` | `hoody daemon ephemeral status abc-123` |
| `hoody daemon ephemeral stop` |  | write | Stop ephemeral program | `daemon.quickStart.stop` | `hoody daemon ephemeral stop abc-123` |
| `hoody daemon health` |  | read | Service health check | `daemon.health.check` | `hoody daemon health` |
| `hoody daemon programs create` |  | write | Add a new CUSTOM program | `daemon.programs.add` | `hoody daemon programs create --id 10 --name my-resource --description "My description" --command "ls -la" --user alice --enabled --boot --delay-seconds 0 --autorestart true --directory /home/user/src --priority 999 --stdout-logfile <stdout_logfile> --stderr-logfile <stderr_logfile> --logs-enabled --log-max-bytes 5242880 --log-backups 2 --environment <key=value> --hoody-kit --port-range-start <port_range.start> --port-range-end <port_range.end> --port-param=--port --lazy-load --display :0 --terminal-id 10 --terminal-shell bash --terminal-interactive --webhooks-enabled --webhooks-urls <webhooks.urls> --webhooks-events <webhooks.events> --webhooks-headers <key=value> --webhooks-timeout <webhooks.timeout> --webhooks-retry <webhooks.retry>` |
| `hoody daemon programs delete` | rm, remove | destructive | Remove a program | `daemon.programs.remove` | `hoody daemon programs delete abc-123` |
| `hoody daemon programs disable` |  | write | Disable a program | `daemon.control.disable` | `hoody daemon programs disable abc-123` |
| `hoody daemon programs edit` |  | write | Edit a program | `daemon.programs.edit` | `hoody daemon programs edit abc-123 --name my-resource --description "My description" --command "ls -la" --user alice --enabled --boot --delay-seconds 0 --autorestart true --directory /home/user/src --priority 999 --stdout-logfile <stdout_logfile> --stderr-logfile <stderr_logfile> --logs-enabled --log-max-bytes 5242880 --log-backups 2 --environment <key=value> --hoody-kit --port-range-start <port_range.start> --port-range-end <port_range.end> --port-param=--port --lazy-load --display :0 --terminal-id 10 --terminal-shell bash --terminal-interactive --webhooks-enabled --webhooks-urls <webhooks.urls> --webhooks-events <webhooks.events> --webhooks-headers <key=value> --webhooks-timeout <webhooks.timeout> --webhooks-retry <webhooks.retry>` |
| `hoody daemon programs enable` |  | write | Enable a program | `daemon.control.enable` | `hoody daemon programs enable abc-123` |
| `hoody daemon programs get` |  | read | Get a specific program | `daemon.programs.get` | `hoody daemon programs get abc-123` |
| `hoody daemon programs list` |  | read | List all programs | `daemon.programs.listIterator` | `hoody daemon programs list --port 8080 --port-from 10 --port-to 10` |
| `hoody daemon programs logs` |  | read | Get program logs | `daemon.status.getLogs` | `hoody daemon programs logs abc-123 --type stdout --lines 100 --port 8080` |
| `hoody daemon programs reset` |  | write | Reset programs to default | `daemon.programs.reset` | `hoody daemon programs reset` |
| `hoody daemon programs start` |  | write | Start a program or port instance | `daemon.control.start` | `hoody daemon programs start abc-123 --port 8080 --wait --timeout 30 --if-not-running` |
| `hoody daemon programs status` |  | read | Get specific program status | `daemon.status.get` | `hoody daemon programs status abc-123 --port 8080 --include-stats true` |
| `hoody daemon programs statuses` |  | read | Get all program statuses | `daemon.status.getAll` | `hoody daemon programs statuses` |
| `hoody daemon programs stop` |  | write | Stop a program or port instance | `daemon.control.stop` | `hoody daemon programs stop abc-123 --port 8080 --all` |

## `hoody db` (aliases: sql, sqlite) — 8 commands

SQLite database operations

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody db open` |  | action | Open the SQLite kit service (DB UI) in your browser |  | `hoody db open [index] [--url]` |
| `hoody db create` | new, add | write | Create new SQLite database | `sqlite.database.create` | `hoody db create --path /home/user/file.txt --init-kv --kv-table kv_store` |
| `hoody db exec-shareable` |  | action | Execute shareable SQL query | `sqlite.query.executeShareable` | `hoody db exec-shareable --db <db> --sql <sql>` |
| `hoody db exec-transaction` |  | action | Execute SQL transaction | `sqlite.database.executeTransaction` | `hoody db exec-transaction --db <db> --create-db-if-missing --result-format <result_format> --transaction <transaction>` |
| `hoody db history clear` |  | destructive | Clear query history | `sqlite.history.clear` | `hoody db history clear --db <db>` |
| `hoody db history delete` | rm, remove | destructive | Delete history entry | `sqlite.history.deleteEntry` | `hoody db history delete <index> --db <db>` |
| `hoody db history list` |  | read | Get query history | `sqlite.history.list` | `hoody db history list --db <db> --limit 100` |
| `hoody db history stats` |  | read | Get history statistics | `sqlite.history.getStats` | `hoody db history stats --db <db>` |

## `hoody display` (alias: disp) — 48 commands

Display control — screenshots, input, windows, clipboard

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody display open` | browse | action | Open the Display kit service in your browser |  | `hoody display open [index] [--decorations]` |
| `hoody display access` |  | read | Access the HTML5 Display client interface | `display.accessClient` | `hoody display access --display-id 10 --decorations --toolbar --menu --maximize-new-windows --readonly --dark-mode --node node-abc --project-id abc-123 --container-id abc-123 --url-display-id abc-123 --ssl --webtransport --path / --action connect --display :0 --encoding auto --offscreen --bandwidth-limit 0 --override-width auto --override-height auto --vrefresh=-1 --suspend-inactive-tab --sound --audio-codec <audio_codec> --keyboard --keyboard-layout us --swap-keys --clipboard --clipboard-preferred-format text/plain --clipboard-poll --printing --file-transfer --video --mediasource-video --open-url --notification-server-url https://example.com --web-notifications --display-notifications --notification-connection-type websocket --sharing --steal --reconnect --floating-menu --clock --scroll-reverse-y auto --scroll-reverse-x --title-show-hoody --title-show-display-id --app firefox --remote-logging --insecure --debug-main --debug-keyboard --debug-geometry --debug-mouse --debug-clipboard --debug-draw --debug-audio --debug-network --debug-file` |
| `hoody display clipboard get` |  | read | Read clipboard text | `display.getClipboard` | `hoody display clipboard get --display-id 10 --selection clipboard` |
| `hoody display clipboard set` |  | write | Write clipboard text | `display.setClipboard` | `hoody display clipboard set --display-id 10 --text "Hello" --selection clipboard` |
| `hoody display health` |  | read | Service health check | `display.health.check` | `hoody display health` |
| `hoody display info` |  | read | Get display information and screenshots | `display.getInformation` | `hoody display info --display-id 10` |
| `hoody display input act` |  | write | Execute one action with optional screenshot | `display.input.act` | `hoody display input act --display-id 10 --action <action> --params <key=value> --screenshot --screenshot-delay 100 --screenshot-region <screenshot_region>` |
| `hoody display input batch` |  | write | Execute a sequence of actions | `display.input.batch` | `hoody display input batch --display-id 10` |
| `hoody display input click-at` |  | write | Move cursor and click | `display.input.clickAt` | `hoody display input click-at --display-id 10 --x 10 --y 10 --button 1` |
| `hoody display input drag` |  | write | Drag from one position to another | `display.input.drag` | `hoody display input drag --display-id 10 --start-x 10 --start-y 10 --end-x 10 --end-y 10 --button 1 --steps 10` |
| `hoody display input geometry` |  | read | Get display dimensions | `display.input.geometry` | `hoody display input geometry --display-id 10` |
| `hoody display input reset` |  | write | Emergency release all inputs | `display.input.reset` | `hoody display input reset --display-id 10` |
| `hoody display input select` |  | write | Select a range via click + shift-click | `display.input.select` | `hoody display input select --display-id 10 --x 10 --y 10 --end-x 10 --end-y 10` |
| `hoody display input type-at` |  | write | Move, click, and type in one operation | `display.input.typeAt` | `hoody display input type-at --display-id 10 --x 10 --y 10 --text "Hello" --delay 10` |
| `hoody display input wait` |  | write | Wait for a duration with optional screenshot | `display.input.wait` | `hoody display input wait --display-id 10 --ms 100 --screenshot` |
| `hoody display keyboard key` |  | write | Press key combinations | `display.input.keyboardKey` | `hoody display keyboard key --display-id 10 --keys <keys> --window 100 --delay 10 --clear-modifiers` |
| `hoody display keyboard key-down` |  | write | Hold a key down | `display.input.keyboardKeyDown` | `hoody display keyboard key-down --display-id 10 --key <key> --window 100 --hold-ms 100` |
| `hoody display keyboard key-up` |  | write | Release a held key | `display.input.keyboardKeyUp` | `hoody display keyboard key-up --display-id 10 --key <key> --window 100` |
| `hoody display keyboard type` |  | write | Type a string of text | `display.input.keyboardType` | `hoody display keyboard type --display-id 10 --text "Hello" --window 100 --delay 10 --clear-modifiers` |
| `hoody display mouse click` |  | write | Click a mouse button | `display.input.mouseClick` | `hoody display mouse click --display-id 10 --button 1 --repeat 1 --delay 10 --window 100` |
| `hoody display mouse double-click` |  | write | Double-click a mouse button | `display.input.mouseDoubleClick` | `hoody display mouse double-click --display-id 10 --button 1 --window 100` |
| `hoody display mouse down` |  | write | Press and hold a mouse button | `display.input.mouseDown` | `hoody display mouse down --display-id 10 --button 1 --window 100 --hold-ms 100` |
| `hoody display mouse location` |  | read | Get cursor position | `display.input.mouseLocation` | `hoody display mouse location --display-id 10` |
| `hoody display mouse move` |  | write | Move cursor to absolute position | `display.input.mouseMove` | `hoody display mouse move --display-id 10 --x 10 --y 10 --window 100 --screen 10 --sync` |
| `hoody display mouse move-relative` |  | write | Move cursor by offset | `display.input.mouseMoveRelative` | `hoody display mouse move-relative --display-id 10 --x 10 --y 10 --sync` |
| `hoody display mouse scroll` |  | write | Scroll in a direction | `display.input.mouseScroll` | `hoody display mouse scroll --display-id 10 --direction up --clicks 5` |
| `hoody display mouse up` |  | write | Release a mouse button | `display.input.mouseUp` | `hoody display mouse up --display-id 10 --button 1 --window 100` |
| `hoody display screenshots by-timestamp` |  | read | Retrieve a specific screenshot by timestamp | `display.screenshots.getByTimestamp` | `hoody display screenshots by-timestamp 1750000000 --base64 --display-id 10` |
| `hoody display screenshots capture` |  | read | Capture a new screenshot | `display.screenshots.capture` | `hoody display screenshots capture --base64 --display-id 10` |
| `hoody display screenshots capture-metadata` |  | read | Capture screenshot and return metadata only | `display.screenshots.captureMetadata` | `hoody display screenshots capture-metadata --display-id 10` |
| `hoody display screenshots latest` |  | read | Retrieve the most recent screenshot | `display.screenshots.getLatest` | `hoody display screenshots latest --base64 --display-id 10` |
| `hoody display screenshots latest-metadata` |  | read | Get metadata for the most recent screenshot | `display.screenshots.getLatestMetadata` | `hoody display screenshots latest-metadata --display-id 10` |
| `hoody display screenshots list` |  | read | List all available screenshots | `display.listScreenshots` | `hoody display screenshots list --display-id 10` |
| `hoody display thumbnails by-timestamp` |  | read | Retrieve a specific thumbnail by timestamp | `display.thumbnails.getByTimestamp` | `hoody display thumbnails by-timestamp 1750000000 --base64 --display-id 10` |
| `hoody display thumbnails capture` |  | read | Capture a new screenshot thumbnail | `display.thumbnails.capture` | `hoody display thumbnails capture --base64 --display-id 10` |
| `hoody display thumbnails latest` |  | read | Retrieve the most recent thumbnail | `display.thumbnails.getLatest` | `hoody display thumbnails latest --base64 --display-id 10` |
| `hoody display windows active` |  | read | Get the active window ID | `display.input.windowActive` | `hoody display windows active --display-id 10` |
| `hoody display windows close` |  | write | Close a window | `display.input.windowClose` | `hoody display windows close --display-id 10 --window-id 100` |
| `hoody display windows focus` |  | write | Focus/activate a window | `display.input.windowFocus` | `hoody display windows focus --display-id 10 --window-id 100` |
| `hoody display windows geometry` |  | read | Get window position and size | `display.input.windowGeometry` | `hoody display windows geometry 1 --display-id 10` |
| `hoody display windows list` |  | read | List windows on the current display | `display.listWindows` | `hoody display windows list --display-id 10 --only-visible` |
| `hoody display windows minimize` |  | write | Minimize a window | `display.input.windowMinimize` | `hoody display windows minimize --display-id 10 --window-id 100` |
| `hoody display windows move` |  | write | Move a window | `display.input.windowMove` | `hoody display windows move --display-id 10 --window-id 100 --x 10 --y 10 --sync --relative` |
| `hoody display windows name` |  | read | Get window title | `display.input.windowName` | `hoody display windows name 1 --display-id 10` |
| `hoody display windows properties` |  | read | Get extended properties for a window | `display.getWindowProperties` | `hoody display windows properties 1 --display-id 10` |
| `hoody display windows raise` |  | write | Raise a window to the top | `display.input.windowRaise` | `hoody display windows raise --display-id 10 --window-id 100` |
| `hoody display windows resize` |  | write | Resize a window | `display.input.windowResize` | `hoody display windows resize --display-id 10 --window-id 100 --width 10 --height 10 --sync --use-hints` |
| `hoody display windows search` |  | write | Search for windows by pattern | `display.input.windowSearch` | `hoody display windows search --display-id 10 --pattern "TODO" --name --class --classname --only-visible` |

## `hoody events` (aliases: event, ev) — 6 commands

Events and activity logs

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody events bulk-delete` |  | destructive | Bulk delete events | `api.events.bulkDelete` | `hoody events bulk-delete --event-type container.creating --resource-type container --resource-id abc-123 --before-date <before_date> --realm-id abc-123` |
| `hoody events cleanup` | prune | destructive | Cleanup old events | `api.events.cleanup` | `hoody events cleanup --retention-days 10` |
| `hoody events delete` | rm, remove | destructive | Delete a single event | `api.events.delete` | `hoody events delete abc-123` |
| `hoody events get` | show, describe | read | Get event details by ID | `api.events.get` | `hoody events get abc-123` |
| `hoody events list` | ls | read | List event history | `api.events.listIterator` | `hoody events list --limit 100 --offset 0 --sort-by created_at --sort-order asc --event-type container.creating --resource-type container --resource-id abc-123 --project-id abc-123 --container-id abc-123 --start-date <start_date> --end-date <end_date> --realm-id abc-123` |
| `hoody events stats` |  | read | Get event statistics | `api.events.getStats` | `hoody events stats --start-date <start_date> --end-date <end_date> --realm-id abc-123` |

## `hoody exec` (alias: x) — 66 commands

Script execution and templates

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody exec open` |  | action | Open the Exec kit service (script runner UI) in your browser |  | `hoody exec open [index] [--url]` |
| `hoody exec health` |  | read | Health Check | `exec.health.check` | `hoody exec health` |
| `hoody exec logs clear` |  | destructive | Clear Logs | `exec.logs.clear` | `hoody exec logs clear --file /home/user/file.txt --type default --older-than-days <older_than_days> --confirm <confirm>` |
| `hoody exec logs list` |  | read | List Logs | `exec.logs.list` | `hoody exec logs list --type default --limit 10` |
| `hoody exec logs read` |  | read | Read Log | `exec.logs.read` | `hoody exec logs read --file /home/user/file.txt --execution-id abc-123 --lines 100 --tail --search "my search"` |
| `hoody exec logs search` |  | read | Search Logs | `exec.logs.search` | `hoody exec logs search --query "my search" --regex <regex> --files <files> --limit 1000 --case-sensitive` |
| `hoody exec logs stream` |  | read | Stream Logs | `exec.logs.stream` | `hoody exec logs stream --file /home/user/file.txt --follow <follow>` |
| `hoody exec magic-comments bulk-update` |  | write | Bulk Update Magic Comments | `exec.magic.bulkUpdate` | `hoody exec magic-comments bulk-update --directory /home/user/src --exec-id abc-123 --comments <comments> --extension .ts --recursive --dry-run` |
| `hoody exec magic-comments read` |  | read | Read Magic Comments | `exec.magic.read` | `hoody exec magic-comments read --path /home/user/file.txt` |
| `hoody exec magic-comments schema` |  | read | Get Magic Comments Schema | `exec.magic.getSchema` | `hoody exec magic-comments schema` |
| `hoody exec magic-comments update` |  | write | Update Magic Comments Handler | `exec.magic.updateHandler` | `hoody exec magic-comments update --path /home/user/file.txt --comments <comments> --dry-run` |
| `hoody exec namespaces list` |  | read | List All Exec Ids | `exec.ids.list` | `hoody exec namespaces list` |
| `hoody exec openapi generate` |  | action | Generate User OpenAPI | `exec.openapi.generate` | `hoody exec openapi generate --body '{}'` |
| `hoody exec openapi merge` |  | write | Merge OpenAPI Specs | `exec.openapi.merge` | `hoody exec openapi merge --body '{}'` |
| `hoody exec openapi serve` |  | read | Serve Generated Spec | `exec.openapi.serve` | `hoody exec openapi serve --dir scripts --directory /home/user/src --format json --subdomain my-app --exec-id abc-123` |
| `hoody exec openapi serve-schema` |  | read | Serve Schema File | `exec.openapi.serveSchema` | `hoody exec openapi serve-schema --file /home/user/file.txt --path /home/user/file.txt` |
| `hoody exec packages add-modules` |  | write | Install Dependencies | `exec.dependencies.install` | `hoody exec packages add-modules --modules <modules> --force` |
| `hoody exec packages check` |  | read | Check Dependencies | `exec.dependencies.check` | `hoody exec packages check --code <code> --modules <modules>` |
| `hoody exec packages compare` |  | read | Compare Packages | `exec.package.compare` | `hoody exec packages compare --body '{}'` |
| `hoody exec packages install` |  | write | Install Packages | `exec.package.install` | `hoody exec packages install --packages <packages> --dev --save --force` |
| `hoody exec packages json init` |  | write | Init package.json | `exec.package.initJson` | `hoody exec packages json init --name hoody-exec-project --version 1.0.0 --description "Hoody Exec project" --force` |
| `hoody exec packages json read` |  | read | Read package.json | `exec.package.readJson` | `hoody exec packages json read` |
| `hoody exec packages json update` |  | write | Update package.json | `exec.package.updateJson` | `hoody exec packages json update --dependencies <dependencies> --scripts <scripts> --remove <remove>` |
| `hoody exec packages list` |  | read | List Bundled Dependencies | `exec.dependencies.listBundled` | `hoody exec packages list` |
| `hoody exec packages pin` |  | write | Pin Versions | `exec.package.pinVersions` | `hoody exec packages pin --packages <packages>` |
| `hoody exec routes discover` |  | read | Discover Routes | `exec.route.discover` | `hoody exec routes discover --base-dir <base_dir> --include-metadata` |
| `hoody exec routes resolve` |  | read | Resolve Route | `exec.route.resolve` | `hoody exec routes resolve --body '{}'` |
| `hoody exec routes test` |  | read | Test Route | `exec.route.test` | `hoody exec routes test --body '{}'` |
| `hoody exec schedules history` |  | read | Schedule History | `exec.schedules.scheduleHistory` | `hoody exec schedules history --script-path /home/user/file.txt --since 2026-01-01T00:00:00Z --limit 100 --include-rotated` |
| `hoody exec schedules list` |  | read | List Schedules | `exec.schedules.listSchedules` | `hoody exec schedules list` |
| `hoody exec schedules reload` |  | action | Reload Schedules | `exec.schedules.reloadSchedules` | `hoody exec schedules reload --dry-run` |
| `hoody exec schedules trigger` |  | action | Trigger Schedule | `exec.schedules.triggerSchedule` | `hoody exec schedules trigger --script-path /home/user/file.txt --force` |
| `hoody exec scripts delete` |  | destructive | Delete Script | `exec.scripts.delete` | `hoody exec scripts delete --path /home/user/file.txt --confirm <confirm> --exec-id abc-123 --subdomain my-app` |
| `hoody exec scripts list` |  | read | List Scripts (system scripts only — see `scripts list-user` for user scripts) | `exec.scripts.list` | `hoody exec scripts list --dir <dir> --filter <filter> --metadata '{}' --label my-label --tags "tag1,tag2" --mode stable --enabled true --websocket <websocket> --recursive true --include-comments <include_comments> --exec-id abc-123 --subdomain my-app` |
| `hoody exec scripts list-user` |  | read | List User Scripts | `exec.openapi.listScripts` | `hoody exec scripts list-user --directory scripts --dir <dir> --subdomain my-app --exec-id abc-123` |
| `hoody exec scripts move` |  | write | Move Script | `exec.scripts.move` | `hoody exec scripts move --exec-id abc-123 --subdomain my-app --from <from> --to <to> --overwrite` |
| `hoody exec scripts performance` |  | read | Get Script Performance | `exec.monitor.getScriptPerformance` | `hoody exec scripts performance --body '{}'` |
| `hoody exec scripts read` |  | read | Read Script | `exec.scripts.read` | `hoody exec scripts read --path /home/user/file.txt --exec-id abc-123 --subdomain my-app` |
| `hoody exec scripts tree` |  | read | Get Script Tree | `exec.scripts.getTree` | `hoody exec scripts tree --exec-id abc-123 --subdomain my-app --base-dir <base_dir> --max-depth 10 --include-metadata` |
| `hoody exec scripts write` |  | write | Write Script | `exec.scripts.write` | `hoody exec scripts write --exec-id abc-123 --subdomain my-app --path /home/user/file.txt --content "Hello" --create-dirs --validate` |
| `hoody exec sdks delete` |  | destructive | Delete SDK | `exec.sdk.delete` | `hoody exec sdks delete --id abc-123` |
| `hoody exec sdks get` |  | read | Get SDK | `exec.sdk.get` | `hoody exec sdks get --id abc-123` |
| `hoody exec sdks import` |  | write | Import SDK | `exec.sdk.importSDK` | `hoody exec sdks import --exec-id abc-123 --source-url https://example.com --source-auth <source_auth> --middleware <middleware> --magic-comments <magic_comments> --force` |
| `hoody exec sdks list` |  | read | List SDKs | `exec.sdk.list` | `hoody exec sdks list` |
| `hoody exec state clear` |  | destructive | Clear Shared State | `exec.state.clear` | `hoody exec state clear --hostname example.com --path /home/user/file.txt --clear-all` |
| `hoody exec state get` |  | read | Get Shared State | `exec.state.get` | `hoody exec state get --hostname example.com --path /home/user/file.txt` |
| `hoody exec state set` |  | write | Set Shared State | `exec.state.set` | `hoody exec state set --hostname example.com --path /home/user/file.txt --value "hello" --merge` |
| `hoody exec system active-requests` |  | read | Get Active Requests | `exec.monitor.getActiveRequests` | `hoody exec system active-requests` |
| `hoody exec system cache-clear` |  | destructive | Clear Cache | `exec.cache.clear` | `hoody exec system cache-clear --hostname example.com --script-path /home/user/file.txt --clear-vm --clear-state --clear-all` |
| `hoody exec system prometheus` |  | read | Prometheus Export | `exec.monitor.prometheusExport` | `hoody exec system prometheus` |
| `hoody exec system restart` |  | destructive | Restart Server | `exec.system.restartServer` | `hoody exec system restart --graceful --drain-timeout-ms 5000 --reason "API restart request"` |
| `hoody exec system restart-status` |  | read | Get Restart Status | `exec.system.getRestartStatus` | `hoody exec system restart-status` |
| `hoody exec system stats` |  | read | Get Stats | `exec.monitor.getStats` | `hoody exec system stats` |
| `hoody exec templates create` | new, add | write | Create Custom Template | `exec.templates.createCustom` | `hoody exec templates create --body '{}'` |
| `hoody exec templates delete` |  | destructive | Delete Custom Template | `exec.templates.deleteCustom` | `hoody exec templates delete --name my-resource` |
| `hoody exec templates generate` |  | action | Generate From Template | `exec.templates.generate` | `hoody exec templates generate --name my-resource --variables <variables> --output-path /home/user/file.txt --save-file` |
| `hoody exec templates list` |  | read | List Templates | `exec.templates.list` | `hoody exec templates list --category general --include-builtin --include-custom` |
| `hoody exec templates preview` |  | read | Preview Template | `exec.templates.preview` | `hoody exec templates preview --name my-resource --variables <variables>` |
| `hoody exec templates update` |  | write | Update Custom Template | `exec.templates.updateCustom` | `hoody exec templates update --name my-resource --code <code>` |
| `hoody exec validate dependencies` |  | read | Validate Dependencies | `exec.validate.validateDependencies` | `hoody exec validate dependencies --code <code>` |
| `hoody exec validate magic-comments` |  | read | Validate Magic Comments | `exec.validate.validateMagicComments` | `hoody exec validate magic-comments --code <code>` |
| `hoody exec validate return-type` |  | read | Validate Return Type | `exec.validate.validateReturnType` | `hoody exec validate return-type --type-definition <type_definition> --value "hello"` |
| `hoody exec validate script` |  | read | Validate Script | `exec.validate.validateScript` | `hoody exec validate script --code <code>` |
| `hoody exec validate syntax` |  | read | Validate Syntax | `exec.validate.validateSyntax` | `hoody exec validate syntax --code <code>` |
| `hoody exec validate types` |  | read | Validate TypeScript | `exec.validate.validateTypeScript` | `hoody exec validate types --code <code>` |
| `hoody exec validate user-schema` |  | read | Validate User Schema | `exec.openapi.validateSchema` | `hoody exec validate user-schema --body '{}'` |

## `hoody files` (aliases: file, f, fs) — 117 commands

File operations and remote backends

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody files open` |  | action | Open the Files kit service (file explorer) in your browser |  | `hoody files open [index] [--url]` |
| `hoody files access ftp` |  | read | Access file via FTP | `files.ftp.access` | `hoody files access ftp /home/user/file.txt --type ftp --server srv-abc --user anonymous --pass <pass> --ftp-secure --ftp-passive` |
| `hoody files access s3` |  | read | Access file from S3 | `files.s3.access` | `hoody files access s3 /home/user/file.txt --type s3 --server srv-abc --s3-bucket <s3_bucket> --s3-region <s3_region> --user alice --pass <pass> --s3-endpoint <s3_endpoint>` |
| `hoody files access ssh` |  | read | Access file via SSH/SFTP | `files.ssh.access` | `hoody files access ssh /home/user/file.txt --type ssh --server srv-abc --user alice --pass <pass> --key <key> --passphrase <passphrase>` |
| `hoody files access ssh-upload` |  | write | Upload file via SSH/SFTP | `files.ssh.upload` | `hoody files access ssh-upload /home/user/file.txt --server srv-abc --user alice --pass <pass> --key <key> --passphrase <passphrase> --input <input>` |
| `hoody files access webdav` |  | read | Access file via WebDAV | `files.webdav.access` | `hoody files access webdav /home/user/file.txt --type webdav --server srv-abc --user alice --pass <pass> --webdav-path /` |
| `hoody files append` |  | write | Append data to file | `files.append` | `hoody files append /home/user/file.txt --owner <owner> --input <input>` |
| `hoody files archive preview` |  | read | Preview archive contents or read file | `files.archives.preview` | `hoody files archive preview /home/user/archive.zip --preview <preview> --contents <contents>` |
| `hoody files archive view` |  | read | View file from archive | `files.archives.viewFile` | `hoody files archive view /home/user/archive.zip --preview <preview>` |
| `hoody files backends connect alias` |  | write | Connect to alias backend | `files.backends.connectAlias` | `hoody files backends connect alias --description "My description" --remote origin` |
| `hoody files backends connect azureblob` |  | write | Connect to azureblob backend | `files.backends.connectAzureblob` | `hoody files backends connect azureblob --access-tier <access_tier> --account acc-abc --archive-tier-delete --chunk-size 4194304 --client-certificate-password <client_certificate_password> --client-certificate-path /home/user/file.txt --client-id abc-123 --client-secret <client_secret> --client-send-certificate-chain --delete-snapshots include --description "My description" --directory-markers --disable-checksum --disable-instance-discovery --encoding 21078018 --endpoint https://example.com --env-auth --key <key> --list-chunk 5000 --memory-pool-flush-time 60 --memory-pool-use-mmap --msi-client-id abc-123 --msi-mi-res-id abc-123 --msi-object-id abc-123 --password <password> --public-access blob --sas-url https://example.com --service-principal-file <service_principal_file> --tenant tenant-abc --upload-concurrency 16 --upload-cutoff 1048576 --use-az --use-emulator --use-msi --username alice` |
| `hoody files backends connect azurefiles` |  | write | Connect to azurefiles backend | `files.backends.connectAzurefiles` | `hoody files backends connect azurefiles --account acc-abc --chunk-size 4194304 --client-certificate-password <client_certificate_password> --client-certificate-path /home/user/file.txt --client-id abc-123 --client-secret <client_secret> --client-send-certificate-chain --connection-string <connection_string> --description "My description" --encoding 54634382 --endpoint https://example.com --env-auth --key <key> --max-stream-size 10737418240 --msi-client-id abc-123 --msi-mi-res-id abc-123 --msi-object-id abc-123 --password <password> --sas-url https://example.com --service-principal-file <service_principal_file> --share-name <share_name> --tenant tenant-abc --upload-concurrency 16 --use-msi --username alice` |
| `hoody files backends connect b2` |  | write | Connect to b2 backend | `files.backends.connectB2` | `hoody files backends connect b2 --account acc-abc --chunk-size 100663296 --copy-cutoff 4294967296 --description "My description" --disable-checksum --download-auth-duration 604800 --download-url https://example.com --encoding 50438146 --endpoint https://example.com --hard-delete --key <key> --lifecycle 0 --memory-pool-flush-time 60 --memory-pool-use-mmap --test-mode <test_mode> --upload-concurrency 4 --upload-cutoff 209715200 --version-at 0001-01-01T00:00:00Z --versions` |
| `hoody files backends connect box` |  | write | Connect to box backend | `files.backends.connectBox` | `hoody files backends connect box --access-token <access_token> --auth-url https://example.com/auth --box-config-file <box_config_file> --box-sub-type user --client-credentials --client-id abc-123 --client-secret <client_secret> --commit-retries 100 --description "My description" --encoding 52535298 --impersonate abc-123 --list-chunk 1000 --owned-by <owned_by> --root-folder-id 0 --token <token> --token-url https://example.com/token --upload-cutoff 52428800` |
| `hoody files backends connect cache` |  | write | Connect to cache backend | `files.backends.connectCache` | `hoody files backends connect cache --chunk-clean-interval 60 --chunk-no-memory --chunk-path /home/user/.cache/hoody-vfs/cache-backend --chunk-size 1M --chunk-total-size 500M --db-path /home/user/.cache/hoody-vfs/cache-backend --db-purge --db-wait-time 1 --description "My description" --info-age 1h --plex-insecure <plex_insecure> --plex-password <plex_password> --plex-token <plex_token> --plex-url https://example.com --plex-username <plex_username> --read-retries 10 --remote origin --rps=-1 --tmp-upload-path /home/user/file.txt --tmp-wait-time 15 --workers 4 --writes` |
| `hoody files backends connect chunker` |  | write | Connect to chunker backend | `files.backends.connectChunker` | `hoody files backends connect chunker --chunk-size 2147483648 --description "My description" --fail-hard --hash-type none --meta-format none --name-format *.hoody-vfs_chunk.### --remote origin --start-from 1 --transactions rename` |
| `hoody files backends connect cloudinary` |  | write | Connect to cloudinary backend | `files.backends.connectCloudinary` | `hoody files backends connect cloudinary --api-key <api_key> --api-secret <api_secret> --cloud-name <cloud_name> --description "My description" --encoding 52543246 --eventually-consistent-delay 0 --upload-prefix <upload_prefix> --upload-preset <upload_preset>` |
| `hoody files backends connect combine` |  | write | Connect to combine backend | `files.backends.connectCombine` | `hoody files backends connect combine --description "My description" --upstreams <upstreams>` |
| `hoody files backends connect compress` |  | write | Connect to compress backend | `files.backends.connectCompress` | `hoody files backends connect compress --description "My description" --level=-1 --mode gzip --ram-cache-limit 20971520 --remote origin` |
| `hoody files backends connect crypt` |  | write | Connect to crypt backend | `files.backends.connectCrypt` | `hoody files backends connect crypt --description "My description" --directory-name-encryption --filename-encoding base32 --filename-encryption standard --pass-bad-blocks --password <password> --password2 <password2> --remote origin --server-side-across-configs --show-mapping --strict-names --suffix .bin` |
| `hoody files backends connect drive` |  | write | Connect to drive backend | `files.backends.connectDrive` | `hoody files backends connect drive --acknowledge-abuse --allow-import-name-change --alternate-export --auth-owner-only --auth-url https://example.com/auth --chunk-size 8388608 --client-credentials --client-id abc-123 --client-secret <client_secret> --copy-shortcut-content --description "My description" --disable-http2 --encoding 16777216 --env-auth --export-formats docx,xlsx,pptx,svg --fast-list-bug-fix --formats <formats> --impersonate <impersonate> --import-formats <import_formats> --keep-revision-forever --list-chunk 1000 --metadata-labels off --metadata-owner off --metadata-permissions off --pacer-burst 100 --pacer-min-sleep 0 --resource-key <resource_key> --root-folder-id abc-123 --scope drive --server-side-across-configs --service-account-credentials <service_account_credentials> --service-account-file <service_account_file> --shared-with-me --show-all-gdocs --size-as-quota --skip-checksum-gphotos --skip-dangling-shortcuts --skip-gdocs --skip-shortcuts --starred-only --stop-on-download-limit --stop-on-upload-limit --team-drive <team_drive> --token <token> --token-url https://example.com/token --trashed-only --upload-cutoff 8388608 --use-created-date --use-shared-date --use-trash --v2-download-min-size=-1` |
| `hoody files backends connect dropbox` |  | write | Connect to dropbox backend | `files.backends.connectDropbox` | `hoody files backends connect dropbox --auth-url https://example.com/auth --batch-commit-timeout 600 --batch-mode sync --batch-size 0 --batch-timeout 0 --chunk-size 50331648 --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 52469762 --impersonate <impersonate> --pacer-min-sleep 0 --root-namespace <root_namespace> --shared-files --shared-folders --token <token> --token-url https://example.com/token` |
| `hoody files backends connect fichier` |  | write | Connect to fichier backend | `files.backends.connectFichier` | `hoody files backends connect fichier --api-key <api_key> --cdn --description "My description" --encoding 52666494 --file-password <file_password> --folder-password <folder_password> --shared-folder <shared_folder>` |
| `hoody files backends connect filefabric` |  | write | Connect to filefabric backend | `files.backends.connectFilefabric` | `hoody files backends connect filefabric --description "My description" --encoding 50429954 --permanent-token <permanent_token> --root-folder-id abc-123 --token <token> --token-expiry <token_expiry> --url https://storagemadeeasy.com --version 1.0.0` |
| `hoody files backends connect filescom` |  | write | Connect to filescom backend | `files.backends.connectFilescom` | `hoody files backends connect filescom --api-key <api_key> --description "My description" --encoding 60923906 --password <password> --site <site> --username alice` |
| `hoody files backends connect ftp` |  | write | Connect to ftp backend | `files.backends.connectFtp` | `hoody files backends connect ftp --ask-password --close-timeout 60 --concurrency 0 --description "My description" --disable-epsv --disable-mlsd --disable-tls13 --disable-utf8 --encoding Asterisk,Ctl,Dot,Slash --explicit-tls --force-list-hidden --host example.com --idle-timeout 60 --pass <pass> --port 21 --shut-timeout 60 --socks-proxy <socks_proxy> --tls --tls-cache-size 32 --user user --writing-mdtm` |
| `hoody files backends connect gofile` |  | write | Connect to gofile backend | `files.backends.connectGofile` | `hoody files backends connect gofile --access-token <access_token> --account-id abc-123 --description "My description" --encoding 323331982 --list-chunk 1000 --root-folder-id abc-123` |
| `hoody files backends connect google-cloud-storage` |  | write | Connect to google cloud storage backend | `files.backends.connectGoogleCloudStorage` | `hoody files backends connect google-cloud-storage --access-token <access_token> --anonymous --auth-url https://example.com/auth --bucket-acl authenticatedRead --bucket-policy-only --client-credentials --client-id abc-123 --client-secret <client_secret> --decompress --description "My description" --directory-markers --encoding 50348034 --endpoint https://example.com --env-auth --location asia --object-acl authenticatedRead --project-number <project_number> --service-account-credentials <service_account_credentials> --service-account-file <service_account_file> --storage-class MULTI_REGIONAL --token <token> --token-url https://example.com/token --user-project <user_project>` |
| `hoody files backends connect google-photos` |  | write | Connect to google photos backend | `files.backends.connectGooglePhotos` | `hoody --proxy <proxy> files backends connect google-photos --auth-url https://example.com/auth --batch-commit-timeout 600 --batch-mode sync --batch-size 0 --batch-timeout 0 --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 50348034 --include-archived --read-only --read-size --start-year 2000 --token <token> --token-url https://example.com/token` |
| `hoody files backends connect hasher` |  | write | Connect to hasher backend | `files.backends.connectHasher` | `hoody files backends connect hasher --auto-size 0 --description "My description" --hashes <hashes> --max-age 0 --remote origin` |
| `hoody files backends connect hdfs` |  | write | Connect to hdfs backend | `files.backends.connectHdfs` | `hoody files backends connect hdfs --data-transfer-protection privacy --description "My description" --encoding 50430082 --namenode <namenode> --service-principal-name <service_principal_name> --username root` |
| `hoody files backends connect hidrive` |  | write | Connect to hidrive backend | `files.backends.connectHidrive` | `hoody files backends connect hidrive --auth-url https://example.com/auth --chunk-size 50331648 --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --disable-fetching-member-count --encoding 33554434 --endpoint https://api.hidrive.strato.com/2.1 --root-prefix / --scope-access rw --scope-role user --token <token> --token-url https://example.com/token --upload-concurrency 4 --upload-cutoff 100663296` |
| `hoody files backends connect http` |  | write | Connect to http backend | `files.backends.connectHttp` | `hoody files backends connect http --description "My description" --headers '{}' --url https://example.com` |
| `hoody files backends connect iclouddrive` |  | write | Connect to iclouddrive backend | `files.backends.connectIclouddrive` | `hoody files backends connect iclouddrive --apple-id abc-123 --client-id d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d --cookies <cookies> --description "My description" --encoding 50438146 --password <password> --trust-token <trust_token>` |
| `hoody files backends connect imagekit` |  | write | Connect to imagekit backend | `files.backends.connectImagekit` | `hoody files backends connect imagekit --description "My description" --encoding 117553486 --endpoint https://example.com --only-signed --private-key <private_key> --public-key pk_abc123 --upload-tags <upload_tags> --versions` |
| `hoody files backends connect internetarchive` |  | write | Connect to internetarchive backend | `files.backends.connectInternetarchive` | `hoody files backends connect internetarchive --access-key-id abc-123 --description "My description" --disable-checksum --encoding 50446342 --endpoint https://s3.us.archive.org --front-endpoint https://archive.org --secret-access-key <secret_access_key> --wait-archive 0` |
| `hoody files backends connect jottacloud` |  | write | Connect to jottacloud backend | `files.backends.connectJottacloud` | `hoody files backends connect jottacloud --auth-url https://example.com/auth --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 50431886 --hard-delete --md5-memory-limit 10485760 --token <token> --token-url https://example.com/token --trashed-only --upload-resume-limit 10485760` |
| `hoody files backends connect koofr` |  | write | Connect to koofr backend | `files.backends.connectKoofr` | `hoody files backends connect koofr --description "My description" --encoding 50438146 --endpoint https://example.com --mountid <mountid> --password <password> --provider koofr --setmtime --user alice` |
| `hoody files backends connect linkbox` |  | write | Connect to linkbox backend | `files.backends.connectLinkbox` | `hoody files backends connect linkbox --description "My description" --token <token>` |
| `hoody files backends connect local` |  | write | Connect to local backend | `files.backends.connectLocal` | `hoody files backends connect local --case-insensitive --case-sensitive --copy-links --description "My description" --encoding 33554434 --links --nounc --one-file-system --skip-links --time-type mtime --unicode-normalization --zero-size-links` |
| `hoody files backends connect mailru` |  | write | Connect to mailru backend | `files.backends.connectMailru` | `hoody files backends connect mailru --auth-url https://example.com/auth --check-hash --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 50440078 --pass <pass> --quirks <quirks> --speedup-enable --speedup-file-patterns * --speedup-max-disk 0 --speedup-max-memory 0 --token <token> --token-url https://example.com/token --user alice --user-agent "Mozilla/5.0"` |
| `hoody files backends connect mega` |  | write | Connect to mega backend | `files.backends.connectMega` | `hoody files backends connect mega --debug --description "My description" --encoding 50331650 --hard-delete --pass <pass> --use-https --user alice` |
| `hoody files backends connect memory` |  | write | Connect to memory backend | `files.backends.connectMemory` | `hoody files backends connect memory --description "My description"` |
| `hoody files backends connect netstorage` |  | write | Connect to netstorage backend | `files.backends.connectNetstorage` | `hoody files backends connect netstorage --account acc-abc --description "My description" --host example.com --protocol http --secret <secret>` |
| `hoody files backends connect onedrive` |  | write | Connect to onedrive backend | `files.backends.connectOnedrive` | `hoody files backends connect onedrive --access-scopes "Files.Read Files.ReadWrite Files.Read.All Files.ReadWrite.All Sites.Read.All offline_access" --auth-url https://example.com/auth --av-override --chunk-size 10485760 --client-credentials --client-id abc-123 --client-secret <client_secret> --delta --description "My description" --disable-site-permission --drive-id abc-123 --drive-type <drive_type> --encoding 57386894 --expose-onenote-files --hard-delete --hash-type auto --link-password <link_password> --link-scope anonymous --link-type view --list-chunk 1000 --metadata-permissions off --region global --root-folder-id abc-123 --server-side-across-configs --tenant tenant-abc --token <token> --token-url https://example.com/token` |
| `hoody files backends connect opendrive` |  | write | Connect to opendrive backend | `files.backends.connectOpendrive` | `hoody files backends connect opendrive --chunk-size 10485760 --description "My description" --encoding 62007182 --password <password> --username alice` |
| `hoody files backends connect oracleobjectstorage` |  | write | Connect to oracleobjectstorage backend | `files.backends.connectOracleobjectstorage` | `hoody files backends connect oracleobjectstorage --attempt-resume-upload --chunk-size 5242880 --compartment <compartment> --config-file ~/.oci/config --config-profile Default --copy-cutoff 4999610368 --copy-timeout 60 --description "My description" --disable-checksum --encoding 50331650 --endpoint https://example.com --leave-parts-on-error --max-upload-parts 10000 --namespace <namespace> --provider env_auth --region eu-west-1 --sse-customer-algorithm AES256 --sse-customer-key <sse_customer_key> --sse-customer-key-file <sse_customer_key_file> --sse-customer-key-sha256 <sse_customer_key_sha256> --sse-kms-key-id abc-123 --storage-tier Standard --upload-concurrency 10 --upload-cutoff 209715200` |
| `hoody files backends connect pcloud` |  | write | Connect to pcloud backend | `files.backends.connectPcloud` | `hoody files backends connect pcloud --auth-url https://example.com/auth --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 50438146 --hostname api.pcloud.com --password <password> --root-folder-id d0 --token <token> --token-url https://example.com/token --username alice` |
| `hoody files backends connect pikpak` |  | write | Connect to pikpak backend | `files.backends.connectPikpak` | `hoody files backends connect pikpak --chunk-size 5242880 --description "My description" --device-id abc-123 --encoding 56829838 --hash-memory-limit 10485760 --pass <pass> --root-folder-id abc-123 --trashed-only --upload-concurrency 5 --use-trash --user alice --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0"` |
| `hoody files backends connect pixeldrain` |  | write | Connect to pixeldrain backend | `files.backends.connectPixeldrain` | `hoody files backends connect pixeldrain --api-key <api_key> --api-url https://pixeldrain.com/api --description "My description" --root-folder-id me` |
| `hoody files backends connect premiumizeme` |  | write | Connect to premiumizeme backend | `files.backends.connectPremiumizeme` | `hoody files backends connect premiumizeme --api-key <api_key> --auth-url https://example.com/auth --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 50438154 --token <token> --token-url https://example.com/token` |
| `hoody files backends connect protondrive` |  | write | Connect to protondrive backend | `files.backends.connectProtondrive` | `hoody files backends connect protondrive --2fa <2fa> --app-version macos-drive@1.0.0-alpha.1+hoody-vfs --client-access-token <client_access_token> --client-refresh-token <client_refresh_token> --client-salted-key-pass <client_salted_key_pass> --client-uid <client_uid> --description "My description" --enable-caching --encoding 52559874 --mailbox-password <mailbox_password> --original-file-size --password <password> --replace-existing-draft --username alice` |
| `hoody files backends connect putio` |  | write | Connect to putio backend | `files.backends.connectPutio` | `hoody files backends connect putio --auth-url https://example.com/auth --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 50438146 --token <token> --token-url https://example.com/token` |
| `hoody files backends connect qingstor` |  | write | Connect to qingstor backend | `files.backends.connectQingstor` | `hoody files backends connect qingstor --access-key-id abc-123 --chunk-size 4194304 --connection-retries 3 --description "My description" --encoding 16842754 --endpoint https://example.com --env-auth --secret-access-key <secret_access_key> --upload-concurrency 1 --upload-cutoff 209715200 --zone pek3a` |
| `hoody files backends connect quatrix` |  | write | Connect to quatrix backend | `files.backends.connectQuatrix` | `hoody files backends connect quatrix --api-key <api_key> --description "My description" --effective-upload-time 4s --encoding 50438146 --hard-delete --host example.com --maximal-summary-chunk-size 100000000 --minimal-chunk-size 10000000 --skip-project-folders` |
| `hoody files backends connect s3` |  | write | Connect to s3 backend | `files.backends.connectS3` | `hoody --profile default files backends connect s3 --access-key-id abc-123 --acl default --bucket-acl private --chunk-size 5242880 --copy-cutoff 4999610368 --decompress --description "My description" --directory-bucket --directory-markers --disable-checksum --disable-http2 --download-url https://example.com --encoding 50331650 --endpoint objects-us-east-1.dream.io --env-auth --force-path-style --leave-parts-on-error --list-chunk 1000 --list-url-encode <list_url_encode> --list-version 0 --location-constraint <location_constraint> --max-upload-parts 10000 --memory-pool-flush-time 60 --memory-pool-use-mmap --might-gzip <might_gzip> --provider AWS --region other-v2-signature --requester-pays --sdk-log-mode 0 --secret-access-key <secret_access_key> --server-side-encryption AES256 --session-token <session_token> --shared-credentials-file <shared_credentials_file> --sse-customer-algorithm AES256 --sse-customer-key <sse_customer_key> --sse-customer-key-base64 <sse_customer_key_base64> --sse-customer-key-md5 <sse_customer_key_md5> --sse-kms-key-id arn:aws:kms:us-east-1:* --storage-class STANDARD --sts-endpoint <sts_endpoint> --upload-concurrency 4 --upload-cutoff 209715200 --use-accelerate-endpoint --use-accept-encoding-gzip <use_accept_encoding_gzip> --use-already-exists <use_already_exists> --use-dual-stack --use-multipart-etag <use_multipart_etag> --use-multipart-uploads <use_multipart_uploads> --use-presigned-request --use-unsigned-payload <use_unsigned_payload> --v2-auth --version-at 0001-01-01T00:00:00Z --version-deleted --versions` |
| `hoody files backends connect seafile` |  | write | Connect to seafile backend | `files.backends.connectSeafile` | `hoody files backends connect seafile --2fa --auth-token <auth_token> --create-library --description "My description" --encoding 16850954 --library <library> --library-key <library_key> --pass <pass> --url https://cloud.seafile.com/ --user alice` |
| `hoody files backends connect sftp` |  | write | Connect to sftp backend | `files.backends.connectSftp` | `hoody files backends connect sftp --ask-password --chunk-size 32768 --ciphers <ciphers> --concurrency 64 --connections 0 --copy-is-hardlink --description "My description" --disable-concurrent-reads --disable-concurrent-writes --disable-hashcheck --host example.com --host-key-algorithms <host_key_algorithms> --idle-timeout 60 --key-exchange <key_exchange> --key-file <key_file> --key-file-pass <key_file_pass> --key-pem <key_pem> --key-use-agent --known-hosts-file ~/.ssh/known_hosts --macs <macs> --md5sum-command <md5sum_command> --pass <pass> --path-override <path_override> --port 22 --pubkey <pubkey> --pubkey-file <pubkey_file> --server-command <server_command> --set-env <set_env> --set-modtime --sha1sum-command <sha1sum_command> --shell-type none --skip-links --socks-proxy <socks_proxy> --ssh <ssh> --subsystem sftp --use-fstat --use-insecure-cipher --user user` |
| `hoody files backends connect sharefile` |  | write | Connect to sharefile backend | `files.backends.connectSharefile` | `hoody files backends connect sharefile --auth-url https://example.com/auth --chunk-size 67108864 --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 57091982 --endpoint https://example.com --root-folder-id favorites --token <token> --token-url https://example.com/token --upload-cutoff 134217728` |
| `hoody files backends connect sia` |  | write | Connect to sia backend | `files.backends.connectSia` | `hoody files backends connect sia --api-password <api_password> --api-url http://127.0.0.1:9980 --description "My description" --encoding 50436354 --user-agent Sia-Agent` |
| `hoody files backends connect smb` |  | write | Connect to smb backend | `files.backends.connectSmb` | `hoody files backends connect smb --case-insensitive --description "My description" --domain WORKGROUP --encoding 56698766 --hide-special-share --host example.com --idle-timeout 60 --pass <pass> --port 445 --spn <spn> --user user` |
| `hoody files backends connect storj` |  | write | Connect to storj backend | `files.backends.connectStorj` | `hoody files backends connect storj --access-grant <access_grant> --api-key <api_key> --description "My description" --passphrase <passphrase> --provider existing --satellite-address us1.storj.io` |
| `hoody files backends connect sugarsync` |  | write | Connect to sugarsync backend | `files.backends.connectSugarsync` | `hoody files backends connect sugarsync --access-key-id abc-123 --app-id abc-123 --authorization <authorization> --authorization-expiry <authorization_expiry> --deleted-id abc-123 --description "My description" --encoding 50397186 --hard-delete --private-access-key <private_access_key> --refresh-token <refresh_token> --root-id abc-123 --user alice` |
| `hoody files backends connect swift` |  | write | Connect to swift backend | `files.backends.connectSwift` | `hoody files backends connect swift --application-credential-id abc-123 --application-credential-name <application_credential_name> --application-credential-secret <application_credential_secret> --auth https://auth.api.rackspacecloud.com/v1.0 --auth-token <auth_token> --auth-version 0 --chunk-size 5368709120 --description "My description" --domain example.com --encoding 16777218 --endpoint-type public --env-auth --fetch-until-empty-page --key <key> --leave-parts-on-error --partial-page-fetch-threshold 0 --region eu-west-1 --storage-policy pcs --storage-url https://example.com --tenant tenant-abc --tenant-domain <tenant_domain> --tenant-id abc-123 --use-segments-container <use_segments_container> --user alice --user-id abc-123` |
| `hoody files backends connect tardigrade` |  | write | Connect to tardigrade backend | `files.backends.connectTardigrade` | `hoody files backends connect tardigrade --access-grant <access_grant> --api-key <api_key> --description "My description" --passphrase <passphrase> --provider existing --satellite-address us1.storj.io` |
| `hoody files backends connect ulozto` |  | write | Connect to ulozto backend | `files.backends.connectUlozto` | `hoody files backends connect ulozto --app-token <app_token> --description "My description" --encoding 50438146 --list-page-size 500 --password <password> --root-folder-slug <root_folder_slug> --username alice` |
| `hoody files backends connect union` |  | write | Connect to union backend | `files.backends.connectUnion` | `hoody files backends connect union --action-policy epall --cache-time 120 --create-policy epmfs --description "My description" --min-free-space 1073741824 --search-policy ff --upstreams <upstreams>` |
| `hoody files backends connect uptobox` |  | write | Connect to uptobox backend | `files.backends.connectUptobox` | `hoody files backends connect uptobox --access-token <access_token> --description "My description" --encoding 50561070 --private` |
| `hoody files backends connect webdav` |  | write | Connect to webdav backend | `files.backends.connectWebdav` | `hoody files backends connect webdav --auth-redirect --bearer-token <bearer_token> --bearer-token-command <bearer_token_command> --description "My description" --encoding utf-8 --headers '{}' --nextcloud-chunk-size 10485760 --owncloud-exclude-mounts --owncloud-exclude-shares --pacer-min-sleep 0 --pass <pass> --unix-socket <unix_socket> --url https://example.com --user alice --vendor fastmail` |
| `hoody files backends connect yandex` |  | write | Connect to yandex backend | `files.backends.connectYandex` | `hoody files backends connect yandex --auth-url https://example.com/auth --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 50429954 --hard-delete --spoof-ua --token <token> --token-url https://example.com/token` |
| `hoody files backends connect zoho` |  | write | Connect to zoho backend | `files.backends.connectZoho` | `hoody files backends connect zoho --auth-url https://example.com/auth --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 16875520 --region com --token <token> --token-url https://example.com/token --upload-cutoff 10485760` |
| `hoody files backends disconnect` |  | destructive | Disconnect backend | `files.backends.disconnect` | `hoody files backends disconnect abc-123` |
| `hoody files backends get` |  | read | Get backend details | `files.backends.getDetails` | `hoody files backends get abc-123` |
| `hoody files backends list` |  | read | List all backends | `files.backends.list` | `hoody files backends list` |
| `hoody files backends test` |  | read | Test backend connection | `files.backends.testConnection` | `hoody files backends test abc-123` |
| `hoody files backends update` |  | write | Update backend credentials | `files.backends.update` | `hoody files backends update abc-123 --body '{}'` |
| `hoody files chmod` |  | write | Change file permissions | `files.chmod` | `hoody files chmod /home/user/file.txt --chmod <chmod>` |
| `hoody files chown` |  | write | Change file ownership | `files.chown` | `hoody files chown /home/user/file.txt --chown <chown>` |
| `hoody files copy` |  | write | Copy file or directory | `files.copy` | `hoody files copy /home/user/file.txt --copy-to <copy_to> --overwrite true --owner <owner>` |
| `hoody files delete` | rm, remove | destructive | Delete file or directory | `files.delete` | `hoody files delete /home/user/file.txt --backend <backend>` |
| `hoody files delete-recursive` |  | destructive | Delete file or directory | `files.deleteRecursive` | `hoody files delete-recursive /home/user/file.txt` |
| `hoody files dir` |  | read | List directory contents or download file | `files.listDirectory` | `hoody files dir /home/user/file.txt --json --simple --sort name --order asc --hash --sha256 --base64 --edit --view --download 1 --content-type <content_type> --history --at <at> --revision 10 --diff --from-seq 10 --from-ts <from_ts> --to-seq 10 --to-ts <to_ts> --after-id 10 --limit 100` |
| `hoody files downloads active` |  | read | List active downloads | `files.downloads.listActive` | `hoody files downloads active /home/user/src --downloads` |
| `hoody files downloads all` |  | read | List active downloads | `files.downloads.listGlobal` | `hoody files downloads all` |
| `hoody files downloads history` |  | read | Download history | `files.downloads.getHistory` | `hoody files downloads history --download-history` |
| `hoody files downloads url` |  | read | Download file from remote URL | `files.downloads.fetch` | `hoody files downloads url /home/user/src --download <download> --filename <filename> --timeout 300` |
| `hoody files downloads zip` |  | read | Download directory as ZIP | `files.archives.downloadAsZip` | `hoody files downloads zip /home/user/src --zip` |
| `hoody files extractions active` |  | read | List active extractions | `files.archives.listActive` | `hoody files extractions active --extractions` |
| `hoody files extractions all` |  | read | List active extractions | `files.archives.listGlobal` | `hoody files extractions all` |
| `hoody files extractions create` |  | read | Extract archive | `files.archives.extract` | `hoody files extractions create /home/user/archive.zip --extract <extract> --dest <dest>` |
| `hoody files extractions extract-file` |  | read | Extract file from archive | `files.archives.extractFile` | `hoody files extractions extract-file /home/user/archive.zip --extract <extract> --dest <dest>` |
| `hoody files extractions history` |  | read | Extraction history | `files.archives.getHistory` | `hoody files extractions history --extraction-history` |
| `hoody files fetch-from-git` |  | read | Fetch file from Git repository | `files.git.fetch` | `hoody files fetch-from-git /home/user/file.txt --type git --url https://example.com --ref <ref> --pass <pass>` |
| `hoody files get` |  | read | List directory or download file | `files.get` | `hoody files get /home/user/file.txt --backend <backend> --hash --sha256 --base64 --preview --contents --stat --thumbnail <thumbnail> --grep ".*" --ignore-case --fixed-string --glob "*.ts" --context 0 --max-count 50 --max-matches 500 --max-depth 50 --max-filesize 10485760 --timeout 30 --max-results 1000 --max-files-scanned 100000 --sort mtime --order asc --lines 100 --history --at <at> --revision 10 --diff --from-seq 10 --from-ts <from_ts> --to-seq 10 --to-ts <to_ts> --after-id 10 --limit 100 --zip` |
| `hoody files glob` |  | read | Find files by glob pattern | `files.glob` | `hoody files glob /home/user/file.txt --pattern "*.ts" --max-results 1000 --max-depth 50 --max-files-scanned 100000 --timeout 30 --sort mtime --order asc` |
| `hoody files grep` |  | read | Search file contents (grep) | `files.grep` | `hoody files grep /home/user/file.txt --pattern "TODO" --ignore-case --fixed-string --glob "*.ts" --context 0 --max-count 50 --max-matches 500 --max-depth 50 --max-filesize 10485760 --timeout 30` |
| `hoody files health` |  | read | Service health check | `files.health.check` | `hoody files health` |
| `hoody files journal flush` |  | write | Flush journal to disk | `files.journal.flush` | `hoody files journal flush` |
| `hoody files journal query` |  | read | Query journal entries | `files.journal.query` | `hoody files journal query --path /home/user/file.txt --op <op> --since 2026-01-01T00:00:00Z --limit 100 --after-id 0` |
| `hoody files journal stats` |  | read | Get journal statistics | `files.journal.getStats` | `hoody files journal stats` |
| `hoody files metadata` |  | read | Get file metadata | `files.getMetadata` | `hoody files metadata /home/user/file.txt --history --at <at> --revision 10 --diff --from-seq 10 --from-ts <from_ts> --to-seq 10 --to-ts <to_ts> --after-id 10 --limit 100` |
| `hoody files mounts create` | new, add | write | Create persistent FUSE mount | `files.mounts.create` | `hoody files mounts create --backend-id abc-123 --label my-label --mount-path /home/user/file.txt --vfs-config-cache-max-age <vfs_config.cache_max_age> --vfs-config-cache-max-size 100 --vfs-config-cache-mode <vfs_config.cache_mode> --vfs-config-dir-cache-time <vfs_config.dir_cache_time>` |
| `hoody files mounts get` |  | read | Get mount details | `files.mounts.getDetails` | `hoody files mounts get abc-123` |
| `hoody files mounts list` |  | read | List all mounts | `files.mounts.list` | `hoody files mounts list --label my-label` |
| `hoody files mounts unmount` |  | destructive | Unmount filesystem | `files.mounts.unmount` | `hoody files mounts unmount abc-123` |
| `hoody files mounts update` |  | write | Update mount VFS configuration | `files.mounts.update` | `hoody files mounts update abc-123` |
| `hoody files move` |  | write | Move file or directory | `files.move` | `hoody files move /home/user/file.txt --move-to <move_to> --owner <owner>` |
| `hoody files options` |  | read | Get allowed methods | `files.webdav.getOptions` | `hoody files options /home/user/file.txt` |
| `hoody files patch` |  | write | File operations | `files.patch` | `hoody files patch /home/user/file.txt --x-update-range append --body '{}'` |
| `hoody files process-image` |  | read | Process and convert images | `files.images.process` | `hoody files process-image img-abc --thumbnail --format jpeg --size <size> --width 10 --height 10 --resize fit --quality low --q 85 --blur 10 --grayscale --bg <bg>` |
| `hoody files put` |  | write | Upload or append file | `files.put` | `hoody files put /home/user/file.txt --backend <backend> --append --owner <owner> --input <input>` |
| `hoody files realpath` |  | read | Resolve canonical path (realpath) | `files.realpath` | `hoody files realpath /home/user/file.txt` |
| `hoody files search` |  | read | Search directory | `files.search` | `hoody files search /home/user/src --q <q> --json` |
| `hoody files stat` |  | read | Get file metadata (stat) | `files.stat` | `hoody files stat /home/user/file.txt` |
| `hoody files touch` |  | write | Touch file (create or update mtime) | `files.touch` | `hoody files touch /home/user/file.txt --touch` |
| `hoody files upload` |  | write | Upload file | `files.upload` | `hoody files upload /home/user/file.txt --input <input>` |
| `hoody files version` |  | read | Get API version | `files.system.getApiVersion` | `hoody files version` |

## `hoody firewall` (alias: fw) — 8 commands

Container firewall rules — ingress (inbound) and egress (outbound)

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody firewall egress create` |  | write | Add Egress Rule | `api.firewall.addEgressRule` | `hoody firewall egress create --action allow --protocol tcp --description "My description" --destination-port <destination_port> --destination <destination> --source-port <source_port> --state enabled --icmp-type <icmp_type> --icmp-code <icmp_code>` |
| `hoody firewall egress delete` |  | destructive | Remove Egress Rule(s) | `api.firewall.removeEgressRule` | `hoody firewall egress delete --all --action allow --protocol tcp --destination-port <destination_port> --destination <destination> --source-port <source_port> --description "My description" --state enabled --icmp-type <icmp_type> --icmp-code <icmp_code>` |
| `hoody firewall egress toggle` |  | action | Toggle Egress Rule State | `api.firewall.toggleEgressRule` | `hoody firewall egress toggle --state enabled --action allow --protocol tcp --destination-port <destination_port> --source-port <source_port> --destination <destination> --description "My description" --icmp-type <icmp_type> --icmp-code <icmp_code>` |
| `hoody firewall ingress create` |  | write | Add Ingress Rule | `api.firewall.addIngressRule` | `hoody firewall ingress create --action allow --protocol tcp --description "My description" --destination-port <destination_port> --source nix --source-port <source_port> --state enabled --icmp-type <icmp_type> --icmp-code <icmp_code>` |
| `hoody firewall ingress delete` |  | destructive | Remove Ingress Rule(s) | `api.firewall.removeIngressRule` | `hoody firewall ingress delete --all --action allow --protocol tcp --destination-port <destination_port> --source nix --source-port <source_port> --description "My description" --state enabled --icmp-type <icmp_type> --icmp-code <icmp_code>` |
| `hoody firewall ingress toggle` |  | action | Toggle Ingress Rule State | `api.firewall.toggleIngressRule` | `hoody firewall ingress toggle --state enabled --action allow --protocol tcp --destination-port <destination_port> --source-port <source_port> --source nix --description "My description" --icmp-type <icmp_type> --icmp-code <icmp_code>` |
| `hoody firewall list` | ls | read | List container firewall rules | `api.firewall.listIterator` | `hoody --container ctr-abc firewall list` |
| `hoody firewall reset` |  | destructive | Reset container firewall | `api.firewall.reset` | `hoody --container ctr-abc firewall reset` |

## `hoody images` (aliases: image, img) — 7 commands

Container image marketplace (browse, purchase, rate, import, icons)

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody images get` | show, describe | read | Get public image details | `api.images.getDetails` | `hoody images get abc-123` |
| `hoody images icon` |  | read | Get image icon | `api.images.getIcon` | `hoody images icon abc-123` |
| `hoody images import-free` |  | write | Import free image | `api.images.importFree` | `hoody images import-free abc-123` |
| `hoody images list` |  | read | List public images | `api.images.listPublicIterator` | `hoody images list --os linux --architecture <architecture> --min-price 10 --max-price 10 --min-rating 10 --max-rating 10 --search "my search" --page 1 --limit 20 --sort-by alias --sort-order asc` |
| `hoody images mine` |  | read | List images you own | `api.images.listIterator` | `hoody images mine --page 1 --limit 20 --sort-by created_at --sort-order asc` |
| `hoody images purchase` | buy | write | Purchase image | `api.images.purchase` | `hoody images purchase abc-123` |
| `hoody images rate` |  | write | Rate image | `api.images.rate` | `hoody images rate abc-123 --rating 10` |

## `hoody inbox` — 4 commands

Platform account notification inbox

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody inbox list` |  | read | Get all notifications for the authenticated user | `api.notifications.listIterator` | `hoody inbox list` |
| `hoody inbox list-public` |  | read | Get all public notifications | `api.notifications.listPublicIterator` | `hoody inbox list-public` |
| `hoody inbox mark` |  | write | Mark a notification as read | `api.notifications.markRead` | `hoody inbox mark abc-123` |
| `hoody inbox mark-all` |  | write | Mark all notifications as read | `api.notifications.markAllRead` | `hoody inbox mark-all` |

## `hoody ip` — 1 command

IP address management

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody ip get` |  | read | Get IP Information | `api.utilities.getIpInfo` | `hoody ip get` |

## `hoody kv` (alias: kvstore) — 20 commands

Key-value store

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody kv open` |  | action | Open the SQLite kit service (KV UI) in your browser |  | `hoody kv open [index] [--url]` |
| `hoody kv arrays delete` |  | destructive | Remove array element | `sqlite.kvStore.removeElement` | `hoody kv arrays delete <key> --db <db> --table kv_store --path /home/user/file.txt --index 10 --history --body '{}'` |
| `hoody kv arrays pop` |  | write | Remove from array end | `sqlite.kvStore.pop` | `hoody kv arrays pop <key> --db <db> --table kv_store --path /home/user/file.txt --history` |
| `hoody kv arrays push` |  | write | Append to array | `sqlite.kvStore.push` | `hoody kv arrays push <key> --db <db> --table kv_store --path /home/user/file.txt --history --body '{}'` |
| `hoody kv batch delete` |  | write | Batch delete multiple keys | `sqlite.kvStore.batchDelete` | `hoody kv batch delete --db <db> --table kv_store --body '{}'` |
| `hoody kv batch get` |  | write | Batch get multiple keys | `sqlite.kvStore.batchGet` | `hoody kv batch get --db <db> --table kv_store --body '{}'` |
| `hoody kv batch set` |  | write | Batch set multiple keys | `sqlite.kvStore.batchSet` | `hoody kv batch set --db <db> --table kv_store --body '{}'` |
| `hoody kv decr` |  | write | Atomic decrement | `sqlite.kvStore.decr` | `hoody kv decr <key> --db <db> --table kv_store --delta 1 --path /home/user/file.txt --history` |
| `hoody kv delete` |  | destructive | Delete key | `sqlite.kvStore.delete` | `hoody kv delete <key> --db <db> --table kv_store --history` |
| `hoody kv exists` |  | read | Check if key exists | `sqlite.kvStore.exists` | `hoody kv exists <key> --db <db> --table kv_store` |
| `hoody kv get` |  | read | Get value by key | `sqlite.kvStore.get` | `hoody kv get <key> --db <db> --table kv_store --path /home/user/file.txt --at-timestamp 10 --rebuild` |
| `hoody kv history` |  | read | Get key operation history | `sqlite.kvStore.getHistory` | `hoody kv history <key> --db <db> --table kv_store --limit 50` |
| `hoody kv incr` |  | write | Atomic increment | `sqlite.kvStore.incr` | `hoody kv incr <key> --db <db> --table kv_store --delta 1 --path /home/user/file.txt --history` |
| `hoody kv list` | ls | read | List keys | `sqlite.kvStore.listIterator` | `hoody kv list --db <db> --table kv_store --prefix <prefix> --limit 100 --offset 0 --at-timestamp 10` |
| `hoody kv rollback` |  | write | Rollback key operations | `sqlite.kvStore.rollback` | `hoody kv rollback <key> --db <db> --table kv_store --steps 1` |
| `hoody kv rollback-table` |  | write | Rollback entire table | `sqlite.kvStore.rollbackTable` | `hoody kv rollback-table --db <db> --table kv_store --to-timestamp 10 --dry-run --confirm <confirm> --body '{}'` |
| `hoody kv set` |  | write | Set value for key | `sqlite.kvStore.set` | `hoody kv set <key> --db <db> --table kv_store --path /home/user/file.txt --ttl 10 --if-match <if_match> --history --create-db-if-missing --body '{}'` |
| `hoody kv snapshots compare-table` |  | read | Compare table snapshots | `sqlite.kvStore.compareSnapshots` | `hoody kv snapshots compare-table --db <db> --table kv_store --from 10 --to 10 --keys <keys>` |
| `hoody kv snapshots get-key` |  | read | Get key snapshot at operation | `sqlite.kvStore.getSnapshot` | `hoody kv snapshots get-key <key> --db <db> --table kv_store --op-number 10` |
| `hoody kv snapshots get-table` |  | read | Get table snapshot at timestamp | `sqlite.kvStore.getTableSnapshot` | `hoody kv snapshots get-table --db <db> --table kv_store --timestamp 1750000000000 --limit 100 --prefix <prefix>` |

## `hoody meta` (alias: m) — 1 command

API metadata and signing keys

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody meta get` |  | read | Get Hoody API Signing Public Key | `api.meta.getPublicKey` | `hoody meta get` |

## `hoody network` (alias: net) — 5 commands

Container network configuration

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody network delete` | rm, remove | destructive | Remove container network configuration | `api.containers.removeNetworkConfig` | `hoody --container ctr-abc network delete` |
| `hoody network get` |  | read | Get container network configuration | `api.containers.getNetworkConfig` | `hoody --container ctr-abc network get` |
| `hoody network start` |  | action | Start container network proxy/blocking | `api.containers.startNetwork` | `hoody --container ctr-abc network start` |
| `hoody network stop` |  | action | Stop container network proxy/blocking | `api.containers.stopNetwork` | `hoody --container ctr-abc network stop` |
| `hoody network update` | edit | write | Update container network configuration | `api.containers.updateNetworkConfig` | `hoody --proxy <proxy> network update --type socks5 --country <country> --city <city> --region eu-west-1 --comment "Hello" --dns-servers <dns_servers>` |

## `hoody notes` (aliases: note, n) — 43 commands

Hoody Notes — notebooks, nodes, documents, comments, versions, and databases

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody notes collab add` |  | write | Add a collaborator to a node | `notes.collaborators.add` | `hoody notes collab add --notebook-id abc-123 --node-id 1 --collaborator-id abc-123 --role admin` |
| `hoody notes collab list` |  | read | List collaborators on a node | `notes.collaborators.list` | `hoody notes collab list --notebook-id abc-123 --node-id 1` |
| `hoody notes collab remove` |  | destructive | Remove a collaborator from a node | `notes.collaborators.remove` | `hoody notes collab remove --notebook-id abc-123 --node-id 1 --collaborator-id abc-123` |
| `hoody notes collab update` |  | write | Update a collaborator's role on a node | `notes.collaborators.update` | `hoody notes collab update --notebook-id abc-123 --node-id 1 --collaborator-id abc-123 --role admin` |
| `hoody notes comment anchors` |  | read | List comment anchors (the inline document positions threads are pinned to) | `notes.comments.listAnchors` | `hoody notes comment anchors --limit 500 --offset 0 --cursor <cursor> --notebook-id abc-123 --node-id 1` |
| `hoody notes comment create` |  | write | Create a new comment (optionally anchored to a document location) | `notes.comments.create` | `hoody notes comment create --notebook-id abc-123 --node-id 1 --content "Hello" --parent-id abc-123 --anchor-block-id abc-123 --anchor <anchor>` |
| `hoody notes comment delete` |  | destructive | Delete a comment | `notes.comments.delete` | `hoody notes comment delete --expected-version 10 --notebook-id abc-123 --node-id 1 --comment-id abc-123` |
| `hoody notes comment edit` |  | write | Edit a comment's body | `notes.comments.edit` | `hoody notes comment edit --notebook-id abc-123 --node-id 1 --comment-id abc-123 --content "Hello" --expected-version 10` |
| `hoody notes comment list` |  | read | List comments on a node | `notes.comments.list` | `hoody notes comment list --limit 100 --offset 0 --cursor <cursor> --notebook-id abc-123 --node-id 1` |
| `hoody notes comment resolve` |  | action | Mark a comment thread resolved | `notes.comments.resolve` | `hoody notes comment resolve --notebook-id abc-123 --node-id 1 --comment-id abc-123 --expected-version 10` |
| `hoody notes db create` |  | write | Create a new record in a database node | `notes.databases.create` | `hoody notes db create --notebook-id abc-123 --database-id abc-123 --id abc-123 --name Untitled --avatar https://example.com/avatar.png --fields <key=value>` |
| `hoody notes db delete` |  | destructive | Delete a database record | `notes.databases.delete` | `hoody notes db delete --notebook-id abc-123 --database-id abc-123 --record-id abc-123` |
| `hoody notes db get` |  | read | Get a database record by id | `notes.databases.get` | `hoody notes db get --notebook-id abc-123 --database-id abc-123 --record-id abc-123` |
| `hoody notes db list` |  | read | List records in a database node | `notes.databases.listIterator` | `hoody notes db list --filters <filters> --sorts <sorts> --page 1 --count 50 --notebook-id abc-123 --database-id abc-123` |
| `hoody notes db search` |  | read | Search records in a database node | `notes.databases.search` | `hoody notes db search --q <q> --exclude "*.ts" --notebook-id abc-123 --database-id abc-123` |
| `hoody notes db update` |  | write | Update a database record's fields | `notes.databases.update` | `hoody notes db update --notebook-id abc-123 --database-id abc-123 --record-id abc-123 --name my-resource --avatar https://example.com/avatar.png --fields <key=value>` |
| `hoody notes doc get` |  | read | Get document content for a node (rich-text body) | `notes.documents.get` | `hoody notes doc get --block-ids <block_ids> --lines 100 --include-comments none --ticket <ticket> --notebook-id abc-123 --node-id 1` |
| `hoody notes doc patch` |  | write | Merge changes into a node's document content | `notes.documents.patch` | `hoody notes doc patch --notebook-id abc-123 --node-id 1 --content <key=value>` |
| `hoody notes doc put` |  | write | Create or replace a node's document content (full overwrite) | `notes.documents.put` | `hoody notes doc put --notebook-id abc-123 --node-id 1 --content <key=value>` |
| `hoody notes file download` |  | read | Download a file attachment by id | `notes.files.download` | `hoody notes file download --file-id abc-123 --notebook-id abc-123` |
| `hoody notes file list` |  | read | List file attachments in a notebook | `notes.files.listIterator` | `hoody notes file list --limit 50 --offset 0 --notebook-id abc-123` |
| `hoody notes node children` |  | read | List immediate child nodes of a node | `notes.nodes.listChildren` | `hoody notes node children --limit 50 --offset 0 --notebook-id abc-123 --node-id 1` |
| `hoody notes node create` |  | write | Create a node inside a notebook (type: page/folder/database/etc.) | `notes.nodes.create` | `hoody notes node create --notebook-id abc-123 --id abc-123 --type default --parent-id abc-123 --attributes <key=value>` |
| `hoody notes node delete` |  | destructive | Delete a node and its descendants | `notes.nodes.delete` | `hoody notes node delete --notebook-id abc-123 --node-id 1` |
| `hoody notes node get` |  | read | Get a node by id | `notes.nodes.get` | `hoody notes node get --notebook-id abc-123 --node-id 1` |
| `hoody notes node get-by-alias` |  | read | Resolve a page-style node by its URL alias (slug) | `notes.nodes.getByAlias` | `hoody notes node get-by-alias --notebook-id abc-123 --alias my-resource` |
| `hoody notes node list` |  | read | List nodes in a notebook (pages, folders, databases) | `notes.nodes.list` | `hoody notes node list --type default --parent-id abc-123 --root-id abc-123 --limit 50 --offset 0 --notebook-id abc-123` |
| `hoody notes node update` |  | write | Update a node (rename, move, change attributes) | `notes.nodes.update` | `hoody notes node update --notebook-id abc-123 --node-id 1 --attributes <key=value>` |
| `hoody notes notebook create` |  | write | Create a new notebook (top-level workspace) | `notes.notebooks.create` | `hoody notes notebook create --name my-resource --description "My description" --avatar https://example.com/avatar.png` |
| `hoody notes notebook delete` |  | destructive | Delete a notebook (irreversible — deletes all nodes/documents/comments inside) | `notes.notebooks.delete` | `hoody notes notebook delete --notebook-id abc-123` |
| `hoody notes notebook get` |  | read | Get notebook details | `notes.notebooks.get` | `hoody notes notebook get --notebook-id abc-123` |
| `hoody notes notebook list` |  | read | List notebooks the current user has access to | `notes.notebooks.listNotebooks` | `hoody notes notebook list` |
| `hoody notes notebook update` |  | write | Update notebook settings (name, description, avatar) | `notes.notebooks.update` | `hoody notes notebook update --notebook-id abc-123 --name my-resource --description "My description" --avatar https://example.com/avatar.png` |
| `hoody notes reaction add` |  | write | Add an emoji reaction to a node | `notes.reactions.add` | `hoody notes reaction add --notebook-id abc-123 --node-id 1 --reaction <reaction>` |
| `hoody notes reaction list` |  | read | List reactions on a node | `notes.reactions.list` | `hoody notes reaction list --notebook-id abc-123 --node-id 1` |
| `hoody notes reaction remove` |  | destructive | Remove an emoji reaction from a node | `notes.reactions.remove` | `hoody notes reaction remove --notebook-id abc-123 --node-id 1 --reaction <reaction>` |
| `hoody notes user set-role` |  | write | Update a user's role on a notebook (owner/admin/collaborator/guest/none) | `notes.users.updateRole` | `hoody notes user set-role --notebook-id abc-123 --user-id abc-123 --role owner` |
| `hoody notes version create` |  | write | Create a new document version snapshot (point-in-time backup) | `notes.versions.create` | `hoody notes version create --notebook-id abc-123 --node-id 1` |
| `hoody notes version delete` |  | destructive | Delete a document version snapshot | `notes.versions.delete` | `hoody notes version delete --notebook-id abc-123 --node-id 1 --version-id abc-123` |
| `hoody notes version get` |  | read | Get a specific document version's content | `notes.versions.get` | `hoody notes version get --notebook-id abc-123 --node-id 1 --version-id abc-123` |
| `hoody notes version list` |  | read | List document version snapshots for a node | `notes.versions.list` | `hoody notes version list --limit 20 --offset 0 --notebook-id abc-123 --node-id 1` |
| `hoody notes version restore` |  | action | Restore a document to a previous version (replaces current content) | `notes.versions.restore` | `hoody notes version restore --notebook-id abc-123 --node-id 1 --version-id abc-123` |
| `hoody notes whoami` |  | read | Get current Notes identity (user id, username, role, default notebook id) | `notes.identity.get` | `hoody notes whoami` |

## `hoody notifications` (aliases: notif, notify) — 9 commands

Notifications

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody notifications open` |  | action | Open the Notifications kit service in your browser |  | `hoody notifications open [index] [--url]` |
| `hoody notifications clear-dismissed` |  | destructive | Clear dismissed notifications | `notifications.clearDismissed` | `hoody notifications clear-dismissed --display-id 1` |
| `hoody notifications dismiss` |  | write | Dismiss notifications | `notifications.dismiss` | `hoody notifications dismiss --display-id 1 --notification-ids <notification_ids>` |
| `hoody notifications health` |  | read | Service health check | `notifications.health.check` | `hoody notifications health` |
| `hoody notifications icon` |  | read | Get notification icon | `notifications.icons.get` | `hoody notifications icon abc-123` |
| `hoody notifications list` |  | read | Get notifications for specified display(s) | `notifications.listIterator` | `hoody notifications list :0 --limit 100 --since 1750000000000 --session sess-abc` |
| `hoody notifications metrics` |  | read | Prometheus-compatible metrics endpoint | `notifications.health.getMetrics` | `hoody notifications metrics` |
| `hoody notifications stream` |  | read | Real-time notification stream via WebSocket | `notifications.connectStream` | `hoody notifications stream --displays <displays>` |
| `hoody notifications trigger` |  | write | Trigger a new desktop notification | `notifications.notify.trigger` | `hoody notifications trigger --body '{}' --category general --display :0 --expire-time 10 --icon <icon> --summary <summary> --urgency low` |

## `hoody pools` (alias: pool) — 11 commands

Pool management and invitations

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody pools create` | new, add | write | Create pool | `api.pools.create` | `hoody pools create --name my-resource --description "My description" --settings <key=value>` |
| `hoody pools delete` | rm, remove | destructive | Delete pool | `api.pools.delete` | `hoody pools delete abc-123` |
| `hoody pools get` | show, describe | read | Get pool details | `api.pools.get` | `hoody pools get abc-123` |
| `hoody pools invitations accept` |  | action | Accept invitation | `api.poolInvitations.accept` | `hoody pools invitations accept abc-123` |
| `hoody pools invitations list` |  | read | List pending invitations | `api.poolInvitations.list` | `hoody pools invitations list` |
| `hoody pools invitations reject` |  | action | Reject invitation | `api.poolInvitations.reject` | `hoody pools invitations reject abc-123` |
| `hoody pools list` |  | read | List user pools | `api.pools.listIterator` | `hoody pools list` |
| `hoody pools members delete` |  | destructive | Remove member | `api.poolMembers.remove` | `hoody pools members delete abc-123 abc-123` |
| `hoody pools members invite` |  | write | Invite member | `api.poolMembers.invite` | `hoody pools members invite abc-123 --username alice --role admin` |
| `hoody pools members update-role` |  | write | Update member role | `api.poolMembers.updateRole` | `hoody pools members update-role abc-123 abc-123 --role admin` |
| `hoody pools update` | edit | write | Update pool | `api.pools.update` | `hoody pools update abc-123 --description "My description"` |

## `hoody projects` (aliases: project, p, proj) — 23 commands

Manage projects

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody projects create` | new, add | write | Create a new project | `api.projects.create` | `hoody projects create --alias my-resource --color "#ff0000" --max-containers 10 --realm-ids "realm-1"` |
| `hoody projects delete` | rm, remove | destructive | Delete project | `api.projects.delete` | `hoody projects delete abc-123 --include-deleted-items` |
| `hoody projects get` | show, describe | read | Get project by ID | `api.projects.get` | `hoody projects get abc-123 --include-permissions` |
| `hoody projects list` | ls | read | List all projects | `api.projects.listIterator` | `hoody projects list --page 1 --limit 10 --sort-by id --sort-order asc --realm-id abc-123` |
| `hoody projects permissions create` |  | write | Grant project access | `api.projects.addPermission` | `hoody projects permissions create --project abc-123 --user-id abc-123 --permission-level read` |
| `hoody projects permissions delete` |  | destructive | Revoke project access | `api.projects.removePermission` | `hoody projects permissions delete --project abc-123 --permission-id abc-123` |
| `hoody projects permissions list` |  | read | List project permissions | `api.projects.listPermissionsIterator` | `hoody projects permissions list --page 10 --limit 10 --sort-by id --sort-order asc --project abc-123` |
| `hoody projects permissions update` |  | write | Update project permission | `api.projects.updatePermission` | `hoody projects permissions update --project abc-123 --permission-id abc-123 --permission-level read` |
| `hoody projects proxy default` |  | write | Update project default proxy permission policy | `api.proxyPermissionsProject.updateDefault` | `hoody projects proxy default --project abc-123 --if-match <if_match> --default allow` |
| `hoody projects proxy groups delete` |  | destructive | Remove project authentication group | `api.proxyPermissionsProject.removeAuthGroup` | `hoody projects proxy groups delete --project abc-123 --group-name <group_name> --if-match <if_match>` |
| `hoody projects proxy groups ip set` |  | write | Set IP authentication group (project) | `api.proxyPermissionsProject.setIpGroup` | `hoody projects proxy groups ip set --project abc-123 --group-name <group_name> --if-match <if_match> --range <range>` |
| `hoody projects proxy groups jwt set` |  | write | Set JWT authentication group (project) | `api.proxyPermissionsProject.setJwtGroup` | `hoody projects proxy groups jwt set --project abc-123 --group-name <group_name> --if-match <if_match> --secret <secret> --algorithm HS256 --sources nix --claims <key=value>` |
| `hoody projects proxy groups password set` |  | write | Set password authentication group (project) | `api.proxyPermissionsProject.setPasswordGroup` | `hoody projects proxy groups password set --project abc-123 --group-name <group_name> --if-match <if_match> --auth-username alice --auth-password <password> --algorithm sha256 --salt <salt>` |
| `hoody projects proxy groups permissions clear` | rm | destructive | Remove all program permissions for a project group | `api.proxyPermissionsProject.removeGroup` | `hoody projects proxy groups permissions clear --project abc-123 --group-name <group_name> --if-match <if_match>` |
| `hoody projects proxy groups permissions delete` |  | destructive | Remove a single program permission for a project group | `api.proxyPermissionsProject.removeProgram` | `hoody projects proxy groups permissions delete --project abc-123 --group-name <group_name> --program <program> --if-match <if_match>` |
| `hoody projects proxy groups permissions set` |  | write | Set project group program permission | `api.proxyPermissionsProject.setGroup` | `hoody projects proxy groups permissions set --project abc-123 --group-name <group_name> --if-match <if_match> --program <program> --access *` |
| `hoody projects proxy groups token set` |  | write | Set token authentication group (project) | `api.proxyPermissionsProject.setTokenGroup` | `hoody projects proxy groups token set --project abc-123 --group-name <group_name> --if-match <if_match> --body '{}'` |
| `hoody projects proxy permissions delete` | rm | destructive | Delete project proxy permissions | `api.proxyPermissionsProject.delete` | `hoody projects proxy permissions delete --project abc-123 --if-match <if_match>` |
| `hoody projects proxy permissions get` |  | read | Get project proxy permissions | `api.proxyPermissionsProject.get` | `hoody projects proxy permissions get --project abc-123` |
| `hoody projects proxy permissions replace` |  | write | Replace project proxy permissions JSON | `api.proxyPermissionsProject.replace` | `hoody projects proxy permissions replace --project abc-123 --if-match <if_match> --groups <key=value> --permissions <key=value> --default allow --enable-proxy` |
| `hoody projects proxy state` |  | write | Update project proxy enable state | `api.proxyPermissionsProject.updateState` | `hoody projects proxy state --project abc-123 --if-match <if_match> --enable-proxy` |
| `hoody projects stats` |  | read | Get statistics for all containers in a project | `api.projects.getStats` | `hoody projects stats abc-123` |
| `hoody projects update` | edit | write | Update project | `api.projects.update` | `hoody projects update abc-123 --alias my-resource --color "#ff0000" --max-containers 10 --realm-ids "realm-1"` |

## `hoody proxy` (alias: px) — 9 commands

Global proxy routing, aliases, and logs. For per-container request hooks, permissions, and authentication groups, see `hoody containers proxy`.

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody proxy create` | new, add | write | Create a new proxy alias | `api.proxyAliases.create` | `hoody proxy create --container-id abc-123 --alias my-resource --program <program> --port 8080 --index 10 --target-path /home/user/file.txt --allow-path-override --expires-at 2026-12-31T23:59:59Z --enabled` |
| `hoody proxy delete` | rm, remove | destructive | Delete proxy alias | `api.proxyAliases.delete` | `hoody proxy delete abc-123` |
| `hoody proxy get` | show, describe | read | Get proxy alias by ID | `api.proxyAliases.get` | `hoody proxy get abc-123` |
| `hoody proxy list` | ls | read | List proxy aliases | `api.proxyAliases.listIterator` | `hoody proxy list --project-id abc-123 --container-id abc-123 --realm-id abc-123` |
| `hoody proxy logs list` | ls | read | Query centralized logs | `proxyLogs.logs.listIterator` | `hoody proxy logs list --limit 200 --offset 0 --project-id abc-123 --container-id abc-123 --service-name <service_name> --level <level> --include-request-body --include-response-body --last 10 --after-id 10 --cursor <cursor> --kind request --method GET --source backend` |
| `hoody proxy logs stats` |  | read | Get log statistics | `proxyLogs.logs.getStats` | `hoody proxy logs stats` |
| `hoody proxy logs stream` |  | read | Live-tail logs over Server-Sent Events | `proxyLogs.logs.streamLogs` | `hoody proxy logs stream --project-id abc-123 --container-id abc-123 --kind request --level debug --last-event-id abc-123` |
| `hoody proxy set-state` |  | write | Enable or disable proxy alias | `api.proxyAliases.setState` | `hoody proxy set-state abc-123 --enabled` |
| `hoody proxy update` | edit | write | Update proxy alias | `api.proxyAliases.update` | `hoody proxy update abc-123 --alias my-resource --program <program> --port 8080 --index 10 --target-path /home/user/file.txt --allow-path-override --expires-at 2026-12-31T23:59:59Z --enabled` |

## `hoody realms` (alias: realm) — 1 command

Platform realms

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody realms list` | ls | read | List your realm IDs | `api.realms.list` | `hoody realms list --include-usage` |

## `hoody servers` (aliases: server, srv) — 7 commands

Server rental marketplace, rentals, and remote commands

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody servers commands` |  | read | Get available commands | `api.serverCommands.listIterator` | `hoody servers commands abc-123 --category general --risk-level low` |
| `hoody servers exec` | run | action | Execute server command | `api.serverCommands.execute` | `hoody servers exec abc-123 --command-id abc-123 --command-slug <command_slug> --parameters <parameters> --wait --timeout 10 --confirmation-token <confirmation_token>` |
| `hoody servers extend` |  | write | Extend rental | `api.rentals.extend` | `hoody servers extend abc-123 --additional-days 10` |
| `hoody servers get` | show, describe | read | Get server details (alias for /rentals/:id) | `api.serverRental.get` | `hoody servers get abc-123` |
| `hoody servers list` | ls | read | List user servers (alias for /rentals) | `api.serverRental.listIterator` | `hoody servers list` |
| `hoody servers marketplace` | browse | read | Browse rental marketplace | `api.serverRental.browseIterator` | `hoody servers marketplace --country <country> --region eu-west-1 --max-price-per-day 10 --available-durations <available_durations> --min-cpu-cores 10 --min-cpu-score 10 --cpu-score-type passmark --min-ram-gb 10 --ram-types DDR3 --min-total-storage-gb 10 --disk-types HDD --min-bandwidth-mbps 10 --min-traffic-tb 10 --unlimited-traffic-only --category compute --featured-only` |
| `hoody servers rent` |  | write | Rent server | `api.serverRental.rent` | `hoody servers rent abc-123 --pool-id abc-123 --rental-days 10` |

## `hoody snapshots` (aliases: snapshot, snap) — 5 commands

Container snapshots

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody snapshots create` |  | write | Create container snapshot | `api.containers.createSnapshot` | `hoody snapshots create --alias my-resource --expiry 10` |
| `hoody snapshots delete` | rm, remove | destructive | Delete container snapshot | `api.containers.deleteSnapshot` | `hoody snapshots delete --name my-resource` |
| `hoody snapshots list` | ls | read | Get container snapshots | `api.containers.listSnapshotsIterator` | `hoody --container ctr-abc snapshots list` |
| `hoody snapshots restore` |  | action | Restore container from snapshot | `api.containers.restoreSnapshot` | `hoody snapshots restore --name my-resource` |
| `hoody snapshots update-alias` |  | write | Update snapshot alias | `api.containers.updateSnapshotAlias` | `hoody snapshots update-alias --name my-resource --alias my-resource` |

## `hoody storage` (alias: shares) — 9 commands

Storage shares

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody storage create` | new | write | Create storage share | `api.storageShares.create` | `hoody storage create --source-path /home/user/file.txt --target-container-id abc-123 --target-project-id abc-123 --mode readonly --alias my-resource --label my-label --description "My description" --enabled --expires-at 1750000000` |
| `hoody storage delete` | rm, remove | destructive | Delete storage share | `api.storageShares.delete` | `hoody storage delete abc-123` |
| `hoody storage get` | show, describe | read | Get storage share | `api.storageShares.get` | `hoody storage get --share-id abc-123` |
| `hoody storage incoming list` |  | read | Get incoming shares | `api.storageShares.listIncoming` | `hoody --container ctr-abc storage incoming list` |
| `hoody storage incoming list-all` |  | read | Get all incoming shares | `api.storageShares.listIncomingGlobalIterator` | `hoody storage incoming list-all --realm-id abc-123` |
| `hoody storage incoming toggle-mount` |  | action | Toggle incoming share mount | `api.storageShares.toggleIncomingMount` | `hoody storage incoming toggle-mount --share-id abc-123 --mount` |
| `hoody storage list` | ls | read | List storage shares | `api.storageShares.listIterator` | `hoody storage list --target-type container --label my-label --status active --realm-id abc-123` |
| `hoody storage list-all` |  | read | List storage shares across all realms (privileged scope) | `api.storageShares.listGlobalIterator` | `hoody storage list-all --realm-id abc-123` |
| `hoody storage update` | edit | write | Update storage share | `api.storageShares.update` | `hoody storage update --share-id abc-123 --mode readonly --alias my-resource --label my-label --description "My description" --enabled --expires-at 1750000000` |

## `hoody terminal` (aliases: term, t) — 31 commands

Terminal sessions and execution

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody terminal open` |  | action | Open the Terminal kit service (web terminal) in your browser |  | `hoody terminal open [index] [--url]` |
| `hoody terminal automation keys` |  | read | List supported key names for /press endpoint | `terminal.terminalAutomation.listSupportedKeys` | `hoody terminal automation keys` |
| `hoody terminal automation metrics` |  | read | Get terminal automation metrics | `terminal.terminalAutomation.getAutomationMetrics` | `hoody terminal automation metrics` |
| `hoody terminal health` |  | read | Service health check | `terminal.health.check` | `hoody terminal health` |
| `hoody terminal processes get` | show, describe | read | Get process details by PID | `terminal.system.getProcess` | `hoody terminal processes get 1234` |
| `hoody terminal processes list` |  | read | List all system processes | `terminal.system.listProcessesIterator` | `hoody terminal processes list --sort cpu --limit 10 --filter <filter>` |
| `hoody terminal processes signal` |  | write | Send signal to process(es) | `terminal.system.sendSignal` | `hoody terminal processes signal --pid 1234 --name my-resource --signal SIGTERM --force` |
| `hoody terminal sessions abort` |  | write | Abort a running command | `terminal.abort` | `hoody terminal sessions abort abc-123 --force` |
| `hoody terminal sessions automation-state` |  | read | Get per-session automation state | `terminal.terminalAutomation.getSessionAutomationState` | `hoody terminal sessions automation-state 1` |
| `hoody terminal sessions command-result` |  | read | Get command result | `terminal.execution.getResult` | `hoody terminal sessions command-result abc-123` |
| `hoody terminal sessions connect` |  | read | WebSocket terminal connection | `terminal.sessions.connectWebSocket` | `hoody terminal sessions connect --terminal-id 1 --readonly --cwd <cwd> --cwd-auto-create --shell <shell> --user alice --cmd "ls -la" --env <env> --display :0 --pid 1234 --ssh-host <ssh_host> --ssh-user <ssh_user> --ssh-port <ssh_port> --ssh-password <ssh_password> --socks5-host <socks5_host> --socks5-port <socks5_port>` |
| `hoody terminal sessions create` | new, add | write | Create a terminal session | `terminal.sessions.create` | `hoody terminal sessions create --terminal-id 1 --ephemeral --display :0 --shell <shell> --user alice --cwd <cwd> --startup-script <startup_script> --welcome --debug --desktop --desktop-env <desktop_env> --cols 10 --rows 10 --wait-until-display --wait-timeout 10 --ssh-host <ssh_host> --ssh-user <ssh_user> --ssh-port <ssh_port> --ssh-password <ssh_password> --ssh-key <ssh_key> --socks5-host <socks5_host> --socks5-port <socks5_port> --socks5-user <socks5_user> --socks5-pass <socks5_pass>` |
| `hoody terminal sessions delete` | rm, remove | destructive | Delete a terminal session | `terminal.sessions.delete` | `hoody terminal sessions delete 1` |
| `hoody terminal sessions exec` | run | action | Execute command in terminal session | `terminal.execution.execute` | `hoody terminal sessions exec --terminal-id 1 --ephemeral --defer-pid 10 --defer-start-time-ticks 0 --defer-timeout-ms 100 --defer-poll-ms 100 --reset --cwd <cwd> --cwd-auto-create --shell <shell> --user alice --cmd "ls -la" --env <env> --skip-display-wait --display-wait-timeout 10 --display :0 --ssh-host <ssh_host> --ssh-user <ssh_user> --ssh-port <ssh_port> --ssh-password <ssh_password> --socks5-host <socks5_host> --socks5-port <socks5_port> --socks5-user <socks5_user> --ssh-key <ssh_key> --socks5-pass <socks5_pass> --command "ls -la" --id abc-123 --timeout 10 --wait` |
| `hoody terminal sessions find` |  | read | Search terminal screen with regex | `terminal.terminalAutomation.findInTerminal` | `hoody terminal sessions find --terminal-id 1 --pattern "TODO" --scope screen --limit 10 --case-insensitive --scroll-offset 10` |
| `hoody terminal sessions history` |  | read | Get terminal command history | `terminal.sessions.listHistoryIterator` | `hoody terminal sessions history 1` |
| `hoody terminal sessions list` |  | read | List all terminal sessions | `terminal.sessions.listIterator` | `hoody terminal sessions list --history-limit 10 --history-lines 10` |
| `hoody terminal sessions paste` |  | write | Paste text into terminal | `terminal.terminalAutomation.pasteTerminalText` | `hoody terminal sessions paste --terminal-id 1 --text "Hello" --bracketed` |
| `hoody terminal sessions press` |  | write | Send named key presses to terminal | `terminal.terminalAutomation.pressTerminalKeys` | `hoody terminal sessions press --terminal-id 1 --keys <keys> --key <key>` |
| `hoody terminal sessions raw-output` |  | read | Get raw terminal output | `terminal.sessions.getRawOutput` | `hoody terminal sessions raw-output --terminal-id 1 --format download --tail 10` |
| `hoody terminal sessions screenshot` |  | read | Capture terminal screenshot | `terminal.sessions.captureScreenshot` | `hoody terminal sessions screenshot --terminal-id 1 --format png --foreground <foreground> --background <background> --fontsize 100 --save` |
| `hoody terminal sessions snapshot` |  | read | Get rendered terminal snapshot | `terminal.terminalAutomation.getTerminalSnapshot` | `hoody terminal sessions snapshot --terminal-id 1 --include-colors --include-highlights --scroll-offset 10` |
| `hoody terminal sessions wait` |  | write | Wait for terminal condition | `terminal.terminalAutomation.waitForTerminal` | `hoody terminal sessions wait --terminal-id 1 --mode stable --debounce-ms 100 --pattern "TODO" --timeout-ms 100 --search-scope <search_scope> --include-colors --include-highlights` |
| `hoody terminal sessions web` |  | read | Get web terminal interface | `terminal.web.get` | `hoody terminal sessions web --terminal-id 1 --cwd <cwd> --cwd-auto-create --shell <shell> --user alice --cmd "ls -la" --readonly --title "My Title" --font-size 100 --background-color <background_color> --panel <panel> --panel-visible --panel-position <panel_position> --panel-width <panel_width> --panel-resizable --hide-toolbar --ssh-host <ssh_host> --ssh-user <ssh_user> --ssh-port <ssh_port> --ssh-password <ssh_password> --socks5-host <socks5_host> --socks5-port <socks5_port> --socks5-user <socks5_user> --socks5-pass <socks5_pass> --desktop --desktop-env <desktop_env> --redirect <redirect> --redirect-delay 10 --arg <arg> --welcome --debug --reset --pid 1234 --env <env> --display :0 --env-inject --startup-script <startup_script> --ssh-key <ssh_key> --panel-height <panel_height>` |
| `hoody terminal sessions write` |  | write | Write input to terminal | `terminal.write` | `hoody terminal sessions write --terminal-id 1 --input <input> --enter` |
| `hoody terminal system daemon-config` |  | read | Get daemon programs configuration | `terminal.system.getDaemonConfig` | `hoody terminal system daemon-config` |
| `hoody terminal system display-info` |  | read | Get display information | `terminal.system.getDisplayInfo` | `hoody terminal system display-info` |
| `hoody terminal system ports` |  | read | List all listening network ports | `terminal.system.listPortsIterator` | `hoody terminal system ports --protocol <protocol> --user alice --port 8080 --ip <ip> --skip-program <skip_program> --http-only --hoody-only` |
| `hoody terminal system reboot` |  | write | Reboot the system | `terminal.system.reboot` | `hoody terminal system reboot --delay 10` |
| `hoody terminal system resources` |  | read | Get system resources and statistics | `terminal.system.getResources` | `hoody terminal system resources` |
| `hoody terminal system shutdown` |  | write | Shutdown the system | `terminal.system.shutdown` | `hoody terminal system shutdown --delay 10` |

## `hoody tunnel` (alias: tun) — 8 commands

Reverse tunnels — expose HTTP/WS/TCP services online via container relay

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody tunnel expose` |  | action | Expose a local service to the internet through the container (long-running, Ctrl+C to stop) |  | `hoody tunnel expose 3000` |
| `hoody tunnel pull` |  | action | Pull a TCP service from local machine into the container loopback (long-running, Ctrl+C to stop) |  | `hoody tunnel pull 5432 --port 5432` |
| `hoody tunnel bindings list` |  | read | List active bindings across all sessions | `tunnel.listBindings` | `hoody tunnel bindings list` |
| `hoody tunnel health` |  | read | Tunnel kit health | `tunnel.health.check` | `hoody tunnel health` |
| `hoody tunnel list` | ls | read | List all active tunnels (combined sessions + bindings) | `tunnel.listTunnels` | `hoody tunnel list` |
| `hoody tunnel metrics` |  | read | Prometheus metrics for the tunnel kit | `tunnel.getMetrics` | `hoody tunnel metrics` |
| `hoody tunnel sessions kill` | stop, terminate | destructive | Terminate an active tunnel session | `tunnel.killSession` | `hoody tunnel sessions kill abc-123 --grace-ms 100` |
| `hoody tunnel sessions list` |  | read | List active tunnel sessions | `tunnel.listSessions` | `hoody tunnel sessions list` |

## `hoody users` (aliases: user, u) — 4 commands

User management

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody users get` | show, describe | read | Get user by ID | `api.users.get` | `hoody users get abc-123` |
| `hoody users redeem-invite` |  | write | Redeem a free-tier invite code to claim your free server | `api.users.redeemInviteCode` | `hoody users redeem-invite --code <code>` |
| `hoody users retry-setup` |  | write | Retry free-tier account setup | `api.users.retrySetup` | `hoody users retry-setup --region eu-west-1` |
| `hoody users update` | edit | write | Update user profile | `api.users.update` | `hoody users update abc-123 --alias my-resource --public-key pk_abc123 --metadata <key=value> --password <password> --current-password <current_password> --is-admin --is-banned` |

## `hoody vault` (alias: v) — 6 commands

Secure key-value vault

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody vault clear` |  | destructive | Clear entire vault | `api.vault.clear` | `hoody vault clear --realm-id abc-123` |
| `hoody vault delete` |  | destructive | Delete vault key | `api.vault.delete` | `hoody vault delete <key> --realm-id abc-123` |
| `hoody vault get` |  | read | Get vault key | `api.vault.get` | `hoody vault get <key> --realm-id abc-123` |
| `hoody vault list` |  | read | List vault keys | `api.vault.listIterator` | `hoody vault list --realm-id abc-123` |
| `hoody vault set` |  | write | Set vault key | `api.vault.set` | `hoody vault set <key> --realm-id abc-123 --value "hello"` |
| `hoody vault stats` |  | read | Get vault statistics | `api.vault.getStats` | `hoody vault stats --realm-id abc-123` |

## `hoody wallet` — 17 commands

Balances, transactions, payments, and invoices

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody wallet balance ai` |  | read | Get AI balance (limit, usage, remaining) | `api.wallet.getAiBalance` | `hoody wallet balance ai` |
| `hoody wallet balance general` |  | read | Get general balance only | `api.wallet.getGeneralBalance` | `hoody wallet balance general` |
| `hoody wallet balance get` |  | read | Get aggregate balances (general + AI) | `api.wallet.getAggregateBalances` | `hoody wallet balance get` |
| `hoody wallet invoices download` |  | read | Download invoice PDF | `api.wallet.downloadInvoicePdf` | `hoody wallet invoices download abc-123` |
| `hoody wallet invoices generate` |  | action | Generate invoice for transaction | `api.wallet.generateInvoice` | `hoody wallet invoices generate abc-123` |
| `hoody wallet invoices get` |  | read | Get invoice by ID | `api.wallet.getInvoice` | `hoody wallet invoices get abc-123` |
| `hoody wallet invoices list` | ls | read | Get all invoices | `api.wallet.listInvoicesIterator` | `hoody wallet invoices list --limit 20 --sort-by created_at --sort-order asc` |
| `hoody wallet payment-methods create` |  | write | Add a new payment method | `api.wallet.addPaymentMethod` | `hoody wallet payment-methods create --name my-resource --details <details> --is-default` |
| `hoody wallet payment-methods delete` | rm | destructive | Delete a payment method | `api.wallet.deletePaymentMethod` | `hoody wallet payment-methods delete abc-123` |
| `hoody wallet payment-methods get` |  | read | Get payment method by ID | `api.wallet.getPaymentMethod` | `hoody wallet payment-methods get abc-123` |
| `hoody wallet payment-methods list` | ls | read | Get all payment methods | `api.wallet.listPaymentMethodsIterator` | `hoody wallet payment-methods list` |
| `hoody wallet payment-methods set-default` |  | write | Set a payment method as default | `api.wallet.setDefaultPaymentMethod` | `hoody wallet payment-methods set-default abc-123` |
| `hoody wallet payment-methods update` |  | write | Update a payment method | `api.wallet.updatePaymentMethod` | `hoody wallet payment-methods update abc-123 --details <details> --status active --is-default` |
| `hoody wallet transactions fees` |  | read | List AI credit fee history (platform fees charged on AI transfers) | `api.wallet.listAiFeeHistoryIterator` | `hoody wallet transactions fees --page 1 --limit 20 --sort-by created_at --sort-order asc` |
| `hoody wallet transactions get` | show | read | Get transaction by ID | `api.wallet.getTransaction` | `hoody wallet transactions get abc-123` |
| `hoody wallet transactions list` | ls | read | List transactions | `api.wallet.listTransactionsIterator` | `hoody wallet transactions list --limit 20 --sort-by id --sort-order asc` |
| `hoody wallet transfer` |  | write | Transfer from general balance to AI credits | `api.wallet.transferToAi` | `hoody wallet transfer --amount <amount> --idempotency-key <idempotency_key> --expected-fee-bps 10` |

## `hoody watch` (alias: watcher) — 7 commands

File system watchers — observe file changes and tail live events

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody watch create` |  | write | Create a new file system watcher. `--paths` is repeatable; `--include`/`--exclude`/`--ignore-dirs`/`--kinds` are optional repeatable filters. | `watch.watchers.create` | `hoody watch create --coalesce-ms 100 --exclude "*.ts" --history-size 100 --ignore-dirs <ignore_dirs> --include "*.ts" --kinds created --paths /home/user/src --recursive --skip-hidden` |
| `hoody watch delete` |  | write | Delete a watcher and tear down its inotify subscriptions | `watch.watchers.delete` | `hoody watch delete --id abc-123` |
| `hoody watch events list` |  | read | List historical events for a watcher (paged). Supports cursor resume via `--since-id` or `--since-timestamp`. | `watch.streams.listEventsIterator` | `hoody watch events list --id abc-123 --since-id 10 --since-timestamp 1750000000 --page 10 --limit 10` |
| `hoody watch events stream` |  | read | Live-tail watcher events over Server-Sent Events. Resumes from `--since-id` on reconnect. | `watch.streams.streamSse` | `hoody watch events stream --id abc-123 --since-id 10 --since-timestamp 1750000000` |
| `hoody watch get` |  | read | Get a single watcher by id, including its config and stats | `watch.watchers.get` | `hoody watch get --id abc-123` |
| `hoody watch health` |  | read | Health check for the watch service (liveness, memory usage, watcher count) | `watch.health.check` | `hoody watch health` |
| `hoody watch list` |  | read | List all file system watchers (paged) | `watch.watchers.listIterator` | `hoody watch list --page 10 --limit 10` |


---

*Auto-generated by `generate-reference.ts`. Do not edit manually.*
