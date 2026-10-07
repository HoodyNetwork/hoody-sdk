# Hoody CLI — Complete Command Reference

**Version:** 1.0.0-beta.16
**Total commands:** 1023
**Command groups:** 40
**Top-level utility commands:** 20

> **Note:** the streaming `hoody pipe` group (`send`, `receive`, `progress stream`,
> `url get`, `forward`, `health`, `cheatsheet get`) is hand-written and not
> represented in this auto-generated list — see the [`pipe` namespace](namespaces/pipe.md).

---

## Top-level utility commands (20)

These are top-level `hoody` commands (a few, like `ai chat` and `desktop
open`, nest one level under a top-level group), implemented hand-written in
the CLI runtime rather than generated from the OpenAPI spec. They are the
entrypoints to chat, account management, shells, and update flow.

| Command | Summary | Example |
|---------|---------|---------|
| `hoody chat` | Interactive AI chatbot REPL (local, no agentic tools). | `hoody chat` |
| `hoody completion` | Generate shell completion scripts (bash/zsh/fish). | `hoody completion bash` |
| `hoody config` | Manage the CLI configuration file (~/.hoody/config.json). | `hoody config set baseUrl https://api.hoody.com` |
| `hoody local` | Local-only client tooling — defaults, password-protected lock. | `hoody local defaults set container <id>` |
| `hoody login` | Log in with username/email + password (if 2FA is enabled, a follow-up `hoody auth 2fa verify` step is prompted). | `hoody login --email u@example.com` |
| `hoody logout` | Log out and clear the stored session. | `hoody logout` |
| `hoody open` | Open (or print) a kit service web UI for a container. Takes a SERVICE SLUG (`terminal`, `files`, `code`, `http-8080`, …), not a container id. | `hoody open files` |
| `hoody run` | Resolve an app to its exact shell command (Hoody Run). | `hoody run firefox -c <container-id>` |
| `hoody screenshot` | Capture + save a screenshot from display/browser/terminal kits. | `hoody screenshot display --path /tmp/s.png` |
| `hoody signup` | Create a new Hoody account (interactive or via flags). | `hoody signup --email u@example.com` |
| `hoody update` | Check for a newer Hoody release (minisign-verified); prints install options when one is available. | `hoody update` |
| `hoody shell` | Open an interactive shell in a container, or run a one-shot command; use `--ssh-host`/`--ssh-user` to bridge to a remote SSH server. | `hoody shell -c <container-id>` |
| `hoody mount` | Mount a remote Hoody container filesystem locally via rclone + WebDAV. | `hoody mount <containerId>:/data ./data` |
| `hoody unmount` | Unmount a Hoody mount and remove its state. | `hoody unmount <idOrPath>` |
| `hoody ai chat` | Bridge alias for `hoody chat` — shares the chatbot surface via the ai namespace. | `hoody ai chat` |
| `hoody desktop` | Desktop environment launcher (public desktop-{N} alias). | `hoody desktop open --env xfce` |
| `hoody desktop open` | Open a desktop (xfce/mate) in the browser via the public desktop-{N} alias. | `hoody desktop open --env xfce` |
| `hoody desktop list` | List known desktop environment identifiers. | `hoody desktop list` |
| `hoody kits` | Hoody Kit slug catalog — URL patterns and descriptions for every kit service. | `hoody kits list` |
| `hoody kits list` | List available Hoody Kit slugs with URL samples and descriptions. | `hoody kits list --named-only` |

---

## `hoody activity` — 2 commands

HTTP activity logs and access statistics

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody activity list` |  | read | Get activity logs | `api.activity.list` | `hoody activity list --page 1 --limit 50` |
| `hoody activity stats` |  | read | Get activity stats | `api.activity.getStats` | `hoody activity stats` |

## `hoody agent` — 239 commands

AI agent — sessions, prompting, models, skills, memory, todos, workflows

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody agent login` |  | write | Sign the container's agent in to Hoody with an API token read from stdin | `client.agent.signIn` | `hoody agent login -c CONTAINER_ID < token.txt` |
| `hoody agent open` |  | action | Open the Hoody Agent kit in your browser |  | `hoody agent open` |
| `hoody agent acp disable` |  | write | Disable a delegated ACP agent | `agent.acp.disable` | `hoody agent acp disable --agent my-agent` |
| `hoody agent acp enable` |  | write | Enable a delegated ACP agent | `agent.acp.enable` | `hoody agent acp enable --agent my-agent` |
| `hoody agent acp model set` |  | write | Set the delegated ACP agent's model | `agent.acp.setModel` | `hoody agent acp model set --agent my-agent --model openai/gpt-5.4-nano` |
| `hoody agent acp secrets set` |  | write | Store an ACP per-agent secret value | `agent.acp.setSecret` | `hoody agent acp secrets set --agent my-agent --key <key> --value hello` |
| `hoody agent acp status` |  | read | Get BYOA ACP backend status | `agent.acp.getStatus` | `hoody agent acp status` |
| `hoody agent changes get` |  | read | Change tokens for the Work lists | `agent.changes.get` | `hoody agent changes get` |
| `hoody agent completions create` |  | write | Run one tool-free model completion; Stream the completion as it is produced | `agent.completions.create` | `hoody agent completions create --stream --model xiaomi-token-plan-sgp/mimo-v2.5 --system linux --messages role=user,content=Hello` |
| `hoody agent containers list` |  | read | List containers in a realm (for binding) | `agent.containers.list` | `hoody agent containers list --page 10 --limit 10` |
| `hoody agent definitions copy` |  | write | Copy a chat agent | `agent.definitions.copy` | `hoody agent definitions copy --name my-resource --new-name <new_name>` |
| `hoody agent definitions create` |  | write | Create a chat-agent definition | `agent.definitions.create` | `hoody agent definitions create --name my-resource --frontmatter-description 'My description' --frontmatter-model openai/gpt-5.4-nano` |
| `hoody agent definitions delete` |  | write | Delete a custom chat agent | `agent.definitions.delete` | `hoody agent definitions delete --name my-resource` |
| `hoody agent definitions list` |  | read | List chat-agent definitions | `agent.definitions.list` | `hoody agent definitions list --page 10 --limit 10` |
| `hoody agent definitions model set` |  | write | Set an agent's model | `agent.definitions.setModel` | `hoody agent definitions model set --name my-resource --model anthropic/claude-opus-4-8` |
| `hoody agent definitions rename` |  | write | Rename a chat agent | `agent.definitions.rename` | `hoody agent definitions rename --name my-resource --new-name <new_name>` |
| `hoody agent definitions reset` |  | write | Reset an agent to its shipped default | `agent.definitions.reset` | `hoody agent definitions reset --name my-resource` |
| `hoody agent definitions source get` |  | read | Read a chat agent's source | `agent.definitions.getSource` | `hoody agent definitions source get --name my-resource` |
| `hoody agent definitions source set` |  | write | Write a chat agent's source | `agent.definitions.setSource` | `hoody agent definitions source set --name my-resource --content Hello` |
| `hoody agent definitions tools set` |  | write | Set an agent's tool allow-list | `agent.definitions.setTools` | `hoody agent definitions tools set --name my-resource --tools <tools>` |
| `hoody agent definitions tools toggle` |  | write | Toggle a single tool for an agent | `agent.definitions.toggleTool` | `hoody agent definitions tools toggle --name my-resource --tool <tool>` |
| `hoody agent definitions turns limit set` |  | write | Set an agent's max-turns | `agent.definitions.setTurnLimit` | `hoody agent definitions turns limit set --name my-resource --turns 10` |
| `hoody agent files list` |  | read | List the files that shape the agents (paths to open in an editor) | `agent.files.list` | `hoody agent files list --page 10 --limit 10` |
| `hoody agent fusions delete` |  | write | Delete a fusion composite | `agent.fusions.delete` | `hoody agent fusions delete --slug <slug>` |
| `hoody agent fusions list` |  | read | List fusion composites | `agent.fusions.list` | `hoody agent fusions list --include-invalid --page 10` |
| `hoody agent fusions set` |  | write | Create or update a fusion composite | `agent.fusions.set` | `hoody agent fusions set --slug <slug> --spec '{}'` |
| `hoody agent gates answer` |  | write | Answer a parked question gate | `agent.gates.answer` | `hoody agent gates answer --id abc-123 --generation 10 --answer <answer> --text Hello` |
| `hoody agent gates approve` |  | write | Approve a pending gate | `agent.gates.approve` | `hoody agent gates approve --id abc-123 --generation 10 --persist-dirs` |
| `hoody agent gates deny` |  | write | Deny a pending gate | `agent.gates.deny` | `hoody agent gates deny --id abc-123 --generation 10 --persist-dirs` |
| `hoody agent gates list` |  | read | List the gates waiting for a human | `agent.gates.list` | `hoody agent gates list --include-system --page 10` |
| `hoody agent gates suggest` |  | write | Propose answers for a parked question (helper model) | `agent.gates.suggest` | `hoody agent gates suggest --id abc-123 --mode suggest --model openai/gpt-5.4-nano` |
| `hoody agent github accounts use` |  | write | Select the active GitHub account | `agent.github.useAccount` | `hoody agent github accounts use --key github.com/octocat` |
| `hoody agent github auth login` |  | write | Start a GitHub device-flow login (or add a PAT) | `agent.github.login` | `hoody agent github auth login --host github.com --activate` |
| `hoody agent github auth logout` |  | write | Log out of GitHub | `agent.github.logout` | `hoody agent github auth logout --key github.com/octocat` |
| `hoody agent github auth poll` |  | write | Poll a GitHub device-flow login to completion | `agent.github.pollLogin` | `hoody agent github auth poll --host github.com --device-code <device_code> --interval 10` |
| `hoody agent github auth status` |  | read | GitHub auth status | `agent.github.getAuth` | `hoody agent github auth status` |
| `hoody agent github branches create` |  | write | Create a branch at HEAD and switch to it | `agent.github.createBranch` | `hoody agent github branches create --branch <branch>` |
| `hoody agent github branches delete` |  | destructive | Force-delete a local branch | `agent.github.deleteBranch` | `hoody agent github branches delete --branch <branch> -y` |
| `hoody agent github branches list` |  | read | List GitHub branches | `agent.github.listBranches` | `hoody agent github branches list` |
| `hoody agent github branches use` |  | write | Switch to an existing branch | `agent.github.useBranch` | `hoody agent github branches use --branch <branch>` |
| `hoody agent github commits create` |  | write | Stage all and commit; Stage all, commit, and push (on a clean tree it pushes without a new commit) | `agent.github.createCommit` | `hoody agent github commits create --push --message Hello --set-upstream` |
| `hoody agent github commits list` |  | read | Read the 100 most recent commits | `agent.github.listCommits` | `hoody agent github commits list` |
| `hoody agent github commits message suggest` |  | write | Draft a commit message with a model | `agent.github.suggestCommitMessage` | `hoody agent github commits message suggest --model anthropic/claude-sonnet-4-6` |
| `hoody agent github diff` |  | read | Read the working-tree or staged diff | `agent.github.diff` | `hoody agent github diff --staged` |
| `hoody agent github issues create` |  | write | Open an issue on the bound repository | `agent.github.createIssue` | `hoody agent github issues create --title 'My Title' --body 'Details go here'` |
| `hoody agent github issues list` |  | read | List issues of a repository | `agent.github.listIssues` | `hoody agent github issues list --owner <owner> --repo my-repo --state open` |
| `hoody agent github prs checkout` |  | write | Check out a pull request's head (detached) | `agent.github.checkoutPr` | `hoody agent github prs checkout --number <number>` |
| `hoody agent github prs create` |  | write | Open a pull request | `agent.github.createPr` | `hoody agent github prs create --title 'My Title' --body 'Details go here'` |
| `hoody agent github prs list` |  | read | List pull requests of a repository | `agent.github.listPrs` | `hoody agent github prs list --owner octocat --repo Hello-World --state open` |
| `hoody agent github prs merge` |  | destructive | Merge a pull request on GitHub | `agent.github.mergePr` | `hoody agent github prs merge --number <number> --method merge -y` |
| `hoody agent github repos clone` |  | write | Clone a GitHub repository | `agent.github.clone` | `hoody agent github repos clone --repo octocat/Hello-World --shallow` |
| `hoody agent github repos credentials set` |  | write | Re-write a checkout's GitHub credential | `agent.github.setRepoCredentials` | `hoody agent github repos credentials set` |
| `hoody agent github repos list` |  | read | List GitHub repos | `agent.github.listRepos` | `hoody agent github repos list` |
| `hoody agent github repos resolve` |  | read | Resolve the checkout's GitHub owner and repository | `agent.github.resolveRepo` | `hoody agent github repos resolve` |
| `hoody agent github stash pop` |  | write | Apply and drop the most recent stash entry | `agent.github.popStash` | `hoody agent github stash pop` |
| `hoody agent github stash push` |  | write | Stash the working tree, untracked files included | `agent.github.pushStash` | `hoody agent github stash push` |
| `hoody agent github status` |  | read | GitHub working-tree status | `agent.github.getStatus` | `hoody agent github status` |
| `hoody agent github sync` |  | write | Sync (fetch → pull → push) | `agent.github.sync` | `hoody agent github sync --set-upstream --force` |
| `hoody agent github worktrees create` |  | write | Add a linked worktree | `agent.github.createWorktree` | `hoody agent github worktrees create --path /home/user/file.txt` |
| `hoody agent github worktrees delete` |  | destructive | Remove a linked worktree | `agent.github.deleteWorktree` | `hoody agent github worktrees delete --path /home/user/file.txt --force -y` |
| `hoody agent github worktrees list` |  | read | List linked worktrees | `agent.github.listWorktrees` | `hoody agent github worktrees list` |
| `hoody agent health` |  | read | Standardized health check | `agent.kit.getHealth` | `hoody agent health` |
| `hoody agent hooks delete` |  | write | Delete a hook | `agent.hooks.delete` | `hoody agent hooks delete --session-id abc-123 --nonce <nonce> --scope project --event Notification --command 'ls -la'` |
| `hoody agent hooks disable` |  | write | Suspend every hook of the session; Disable a hook (a shipped hook by --shipped-id, an ordinary hook by event, matcher and command) | `agent.hooks.disableAll`, `agent.hooks.disable` | `hoody agent hooks disable --all --session-id abc-123 --nonce <nonce> --scope project` |
| `hoody agent hooks enable` |  | write | Resume every hook (clears the suspension of all hooks); Enable a hook (a shipped hook by --shipped-id, an ordinary hook by event, matcher and command) | `agent.hooks.enableAll`, `agent.hooks.enable` | `hoody agent hooks enable --all --session-id abc-123 --nonce <nonce> --scope project` |
| `hoody agent hooks intents create` |  | write | Begin a hook write (nonce) | `agent.hooks.createWriteIntent` | `hoody agent hooks intents create --session-id abc-123 --op upsert --scope project` |
| `hoody agent hooks list` |  | read | List hooks | `agent.hooks.list` | `hoody agent hooks list` |
| `hoody agent hooks reload` |  | write | Reload hooks from disk | `agent.hooks.reload` | `hoody agent hooks reload` |
| `hoody agent hooks rules get` |  | read | Get the tool-call rules of the settings scopes | `agent.hooks.getRules` | `hoody agent hooks rules get` |
| `hoody agent hooks rules set` |  | write | Set the tool-call rules of a settings scope | `agent.hooks.setRules` | `hoody agent hooks rules set --session-id abc-123 --nonce <nonce> --scope project --rules @path.json` |
| `hoody agent hooks run` |  | write | Run a hook command now (this EXECUTES the command; use `agent hooks test` for the shipped-hook dry run) | `agent.hooks.run` | `hoody agent hooks run --session-id abc-123 --event Notification --command 'ls -la'` |
| `hoody agent hooks test` |  | write | Dry-run a shipped hook against a sample command (nothing is executed) | `agent.hooks.test` | `hoody agent hooks test --session-id abc-123 --shipped-id abc-123 --event Notification --command 'ls -la'` |
| `hoody agent hooks trust` |  | write | Acknowledge hook trust | `agent.hooks.trust` | `hoody agent hooks trust --session-id abc-123 --hash <hash> --high-risk` |
| `hoody agent hooks upsert` |  | write | Upsert a hook | `agent.hooks.upsert` | `hoody agent hooks upsert --session-id abc-123 --nonce <nonce> --scope project --event Notification --command 'ls -la' --name my-resource` |
| `hoody agent jev models list` |  | read | List the models Jev can use | `agent.jev.listModels` | `hoody agent jev models list` |
| `hoody agent jev settings get` |  | read | Read the Jev settings and usage | `agent.jev.getSettings` | `hoody agent jev settings get` |
| `hoody agent jev settings update` |  | write | Change the Jev settings | `agent.jev.updateSettings` | `hoody agent jev settings update --enabled --model typesafe/jev-latest` |
| `hoody agent jev test` |  | write | Test Jev with one tiny decision | `agent.jev.test` | `hoody agent jev test --model openai/gpt-5.4-nano` |
| `hoody agent jobs delete` |  | write | Cancel a pending/running job, or delete a finished record | `agent.jobs.delete` | `hoody agent jobs delete --id abc-123` |
| `hoody agent jobs get` |  | read | Get an async job's status | `agent.jobs.get` | `hoody agent jobs get --id abc-123` |
| `hoody agent jobs result get` |  | read | Get an async job's result | `agent.jobs.getResult` | `hoody agent jobs result get --id abc-123` |
| `hoody agent logs export` |  | read | Export logs to a file | `agent.logs.export` | `hoody agent logs export --min-level debug --text Hello` |
| `hoody agent logs get` |  | read | Read a log entry | `agent.logs.get` | `hoody agent logs get --ref <ref>` |
| `hoody agent logs list` |  | read | Query logs | `agent.logs.list` | `hoody agent logs list --source activity --host example.com` |
| `hoody agent logs sources list` |  | read | Log sources | `agent.logs.listSources` | `hoody agent logs sources list` |
| `hoody agent logs stats` |  | read | Log statistics | `agent.logs.getStats` | `hoody agent logs stats` |
| `hoody agent loops create` |  | write | Create a loop | `agent.loops.create` | `hoody agent loops create --id abc-123 --prompt <prompt> --interval <interval> --max-runs 10 --stop-when-kind expression` |
| `hoody agent loops delete` |  | write | Delete a loop | `agent.loops.delete` | `hoody agent loops delete --id abc-123 --loop-id abc-123` |
| `hoody agent loops list` |  | read | List loops across all sessions | `agent.loops.list` | `hoody agent loops list --page 10 --limit 10` |
| `hoody agent loops runs start` |  | write | Run a loop immediately | `agent.loops.startRun` | `hoody agent loops runs start --id abc-123 --loop-id abc-123` |
| `hoody agent loops update` |  | write | Update a loop | `agent.loops.update` | `hoody agent loops update --id abc-123 --loop-id abc-123 --paused --expires-in 2h` |
| `hoody agent mcp delete` |  | write | Delete an MCP server (needs a begin-write nonce + expect-hash) | `agent.mcp.deleteServer` | `hoody agent mcp delete --session-id abc-123 --nonce <nonce> --scope user --name my-resource --expect-hash <expect_hash>` |
| `hoody agent mcp disable` |  | write | Disable an MCP server | `agent.mcp.disableServer` | `hoody agent mcp disable --session-id abc-123 --nonce <nonce> --scope user --name my-resource --expect-hash <expect_hash>` |
| `hoody agent mcp enable` |  | write | Enable an MCP server | `agent.mcp.enableServer` | `hoody agent mcp enable --session-id abc-123 --nonce <nonce> --scope user --name my-resource --expect-hash <expect_hash>` |
| `hoody agent mcp import` |  | write | Import MCP servers from a Claude/Cursor/VS Code config (needs a begin-write nonce + expect-hash) | `agent.mcp.importServers` | `hoody agent mcp import --session-id abc-123 --nonce <nonce> --scope user --servers @path.json --expect-hash <expect_hash>` |
| `hoody agent mcp intents create` |  | write | Mint the single-use nonce every MCP write requires | `agent.mcp.createWriteIntent` | `hoody agent mcp intents create --session-id abc-123 --op upsert --scope user` |
| `hoody agent mcp list` |  | read | List configured MCP servers with live connection state | `agent.mcp.listServers` | `hoody agent mcp list --session-id abc-123` |
| `hoody agent mcp preview` |  | read | Preview what a config document would import (writes nothing) | `agent.mcp.previewImport` | `hoody agent mcp preview --session-id abc-123 --document <document>` |
| `hoody agent mcp reconnect` |  | write | Reload MCP config from disk and reconnect live sessions | `agent.mcp.reconnect` | `hoody agent mcp reconnect --session-id abc-123` |
| `hoody agent mcp test` |  | write | Try a candidate MCP server config without saving it (human-only) | `agent.mcp.testServer` | `hoody agent mcp test --session-id abc-123 --server-name my-resource --server-command 'ls -la'` |
| `hoody agent mcp upsert` |  | write | Create or update an MCP server (needs a begin-write nonce + expect-hash) | `agent.mcp.upsertServer` | `hoody agent mcp upsert --session-id abc-123 --nonce <nonce> --scope user --expect-hash <expect_hash> --server-name my-resource` |
| `hoody agent memory consolidate` |  | write | Trigger a memory consolidation pass (human-only) | `agent.memory.consolidate` | `hoody agent memory consolidate --project proj-abc --min-observations 10` |
| `hoody agent memory datahost claim` |  | write | Assign this computer as the memory data host | `agent.memory.claimDataHost` | `hoody agent memory datahost claim --use-self --expect-realm <expect_realm>` |
| `hoody agent memory datahost get` |  | read | Read the realm's memory data host | `agent.memory.getDataHost` | `hoody agent memory datahost get` |
| `hoody agent memory disable` |  | write | Disable agent memory | `agent.memory.disable` | `hoody agent memory disable` |
| `hoody agent memory enable` |  | write | Enable agent memory | `agent.memory.enable` | `hoody agent memory enable` |
| `hoody agent memory flush` |  | write | Flush the memory store | `agent.memory.flush` | `hoody agent memory flush` |
| `hoody agent memory graph get` |  | read | Read a project's memory relation graph | `agent.memory.getGraph` | `hoody agent memory graph get --limit 10 --offset 10` |
| `hoody agent memory intents create` |  | write | Mint the single-use intent a guarded memory write requires | `agent.memory.createWriteIntent` | `hoody agent memory intents create --op wipe_project --project proj-abc` |
| `hoody agent memory items create` |  | write | Save a memory item | `agent.memory.createItem` | `hoody agent memory items create --project proj-abc --content Hello --type workflow --ttl-days 10` |
| `hoody agent memory items delete` |  | write | Delete a memory item | `agent.memory.deleteItem` | `hoody agent memory items delete --name my-resource` |
| `hoody agent memory items get` |  | read | Read a memory item | `agent.memory.getItem` | `hoody agent memory items get --id abc-123 --kind create` |
| `hoody agent memory items list` |  | read | List memory items | `agent.memory.listItems` | `hoody agent memory items list --kind create --page 10` |
| `hoody agent memory items update` |  | write | Edit a memory item | `agent.memory.updateItem` | `hoody agent memory items update --id abc-123 --kind memory --content Hello` |
| `hoody agent memory projects delete` |  | destructive | Erase a memory project and everything it owns | `agent.memory.deleteProject` | `hoody agent memory projects delete --project proj-abc --nonce <nonce> -y` |
| `hoody agent memory projects list` |  | read | List memory projects | `agent.memory.listProjects` | `hoody agent memory projects list --page 10 --limit 10` |
| `hoody agent memory search` |  | write | Search memory (hybrid recall) | `agent.memory.search` | `hoody agent memory search --query 'my search' --limit 10` |
| `hoody agent memory status` |  | read | Read memory subsystem status | `agent.memory.getStatus` | `hoody agent memory status` |
| `hoody agent metrics` |  | read | Prometheus metrics | `agent.kit.getMetrics` | `hoody agent metrics` |
| `hoody agent models get` |  | read | Get a model by spec | `agent.models.get` | `hoody agent models get --spec <spec>` |
| `hoody agent models list` |  | read | List models | `agent.models.list` | `hoody agent models list --page 10 --limit 10` |
| `hoody agent providers accounts add` |  | write | Add an OAuth account to a provider's pool | `agent.providers.addAccount` | `hoody agent providers accounts add --id abc-123` |
| `hoody agent providers accounts list` |  | read | List a provider's OAuth account pool | `agent.providers.listAccounts` | `hoody agent providers accounts list --id abc-123 --page 10 --limit 10` |
| `hoody agent providers accounts remove` |  | write | Remove a pooled OAuth account | `agent.providers.removeAccount` | `hoody agent providers accounts remove --id abc-123 --key <key>` |
| `hoody agent providers accounts use` |  | write | Make a pooled OAuth account active | `agent.providers.useAccount` | `hoody agent providers accounts use --id abc-123 --key <key>` |
| `hoody agent providers auth default set` |  | write | Set a provider's default credential method | `agent.providers.setDefaultAuth` | `hoody agent providers auth default set --id abc-123 --default <default>` |
| `hoody agent providers auth status` |  | read | Get a provider's auth status | `agent.providers.getAuth` | `hoody agent providers auth status --id abc-123` |
| `hoody agent providers get` |  | read | Get a provider | `agent.providers.get` | `hoody agent providers get --id abc-123` |
| `hoody agent providers keys delete` |  | write | Delete a provider API key | `agent.providers.deleteApiKey` | `hoody agent providers keys delete --id abc-123` |
| `hoody agent providers keys set` |  | write | Store a provider API key | `agent.providers.setApiKey` | `hoody agent providers keys set --id abc-123 --api-key <api_key>` |
| `hoody agent providers list` |  | read | List LLM providers | `agent.providers.list` | `hoody agent providers list --page 10 --limit 10` |
| `hoody agent providers oauth logout` |  | write | Remove a provider's OAuth login | `agent.providers.logoutOauth` | `hoody agent providers oauth logout --id abc-123` |
| `hoody agent providers oauth poll` |  | read | Poll a provider OAuth login | `agent.providers.pollOauth` | `hoody agent providers oauth poll --id abc-123 --job <job>` |
| `hoody agent providers oauth start` |  | write | Start a provider OAuth login | `agent.providers.startOauth` | `hoody agent providers oauth start --id abc-123 --add-account` |
| `hoody agent providers oauth submit` |  | write | Submit a provider OAuth authorization code | `agent.providers.submitOauthCode` | `hoody agent providers oauth submit --id abc-123 --job <job> --code <code>` |
| `hoody agent realms list` |  | read | List realms (for binding) | `agent.realms.list` | `hoody agent realms list --page 10 --limit 10` |
| `hoody agent realms use` |  | write | Switch the agent's active realm | `agent.realms.use` | `hoody agent realms use --active-realm-id abc-123` |
| `hoody agent sessions agent set` |  | write | Switch the chat agent | `agent.sessions.setAgent` | `hoody agent sessions agent set --id abc-123 --agent my-agent` |
| `hoody agent sessions approval get` |  | read | Read a session's approval policy | `agent.sessions.getApproval` | `hoody agent sessions approval get --id abc-123` |
| `hoody agent sessions approval rules delete` |  | write | Remove one session permission rule | `agent.sessions.deleteApprovalRule` | `hoody agent sessions approval rules delete --id abc-123 --tool <tool>` |
| `hoody agent sessions approval rules set` |  | write | Set one session permission rule | `agent.sessions.setApprovalRule` | `hoody agent sessions approval rules set --id abc-123 --tool <tool> --decision allow` |
| `hoody agent sessions approval update` |  | write | Set a session's approval mode and lock | `agent.sessions.updateApproval` | `hoody agent sessions approval update --id abc-123 --mode default --locked` |
| `hoody agent sessions approver lease claim` |  | write | Acquire the right to answer this session's gates | `agent.sessions.claimApproverLease` | `hoody agent sessions approver lease claim --id abc-123 --holder <holder> --ttl-ms 100 --replace` |
| `hoody agent sessions approver lease release` |  | write | Release the approver lease | `agent.sessions.releaseApproverLease` | `hoody agent sessions approver lease release --id abc-123` |
| `hoody agent sessions approver lease renew` |  | write | Renew the approver lease | `agent.sessions.renewApproverLease` | `hoody agent sessions approver lease renew --id abc-123 --ttl-ms 100` |
| `hoody agent sessions attachments claim` |  | write | Hold a live session and its parked gate alive | `agent.sessions.claimAttachment` | `hoody agent sessions attachments claim --id abc-123 --ttl-ms 100` |
| `hoody agent sessions attachments release` |  | write | Release an attachment lease | `agent.sessions.releaseAttachment` | `hoody agent sessions attachments release --id abc-123 --lease-id abc-123` |
| `hoody agent sessions attachments renew` |  | write | Renew an attachment lease | `agent.sessions.renewAttachment` | `hoody agent sessions attachments renew --id abc-123 --lease-id abc-123 --ttl-ms 100` |
| `hoody agent sessions autoreply set` |  | write | Arm/disarm the auto-reply loop | `agent.sessions.setAutoReply` | `hoody agent sessions autoreply set --id abc-123 --armed --rounds 10` |
| `hoody agent sessions autoreply writes set` |  | write | Flip the auto-reply write opt-in | `agent.sessions.setAutoReplyWrites` | `hoody agent sessions autoreply writes set --id abc-123 --allow-writes` |
| `hoody agent sessions close` |  | write | Close the session (teardown) | `agent.sessions.close` | `hoody agent sessions close --id abc-123` |
| `hoody agent sessions create` |  | write | Create, fork, or attach a session | `agent.sessions.create` | `hoody agent sessions create --model openai/gpt-5.4-nano --tool-mode standard` |
| `hoody agent sessions delete` |  | write | Delete a session and its stored record (`agent sessions close` only tears the live session down) | `agent.sessions.delete` | `hoody agent sessions delete --id abc-123` |
| `hoody agent sessions directories list` |  | read | List distinct session working directories | `agent.sessions.listDirectories` | `hoody agent sessions directories list` |
| `hoody agent sessions effort set` |  | write | Set reasoning effort | `agent.sessions.setEffort` | `hoody agent sessions effort set --id abc-123 --effort low` |
| `hoody agent sessions env set` |  | write | Toggle Hoody shell-env injection | `agent.sessions.setHoodyEnv` | `hoody agent sessions env set --id abc-123 --enabled` |
| `hoody agent sessions get` |  | read | Get a session summary | `agent.sessions.get` | `hoody agent sessions get --id abc-123` |
| `hoody agent sessions list` |  | read | List sessions | `agent.sessions.list` | `hoody agent sessions list --include-system --page 10` |
| `hoody agent sessions loops list` |  | read | List a session's loops | `agent.sessions.listLoops` | `hoody agent sessions loops list --id abc-123 --page 10 --limit 10` |
| `hoody agent sessions mcp tools list` |  | read | List a session's MCP tools | `agent.sessions.listMcpTools` | `hoody agent sessions mcp tools list --id abc-123 --page 10 --limit 10` |
| `hoody agent sessions model set` |  | write | Switch the session model | `agent.sessions.setModel` | `hoody agent sessions model set --id abc-123 --model anthropic/claude-opus-4-8` |
| `hoody agent sessions rename` |  | write | Rename a session | `agent.sessions.rename` | `hoody agent sessions rename --id abc-123 --name my-resource` |
| `hoody agent sessions replay` |  | read | Replay a live session's buffered events | `agent.sessions.replay` | `hoody agent sessions replay --id abc-123` |
| `hoody agent sessions rules list` |  | read | Show which tool-call rules apply to a session's calls | `agent.sessions.listApplicableRules` | `hoody agent sessions rules list --id abc-123 --agent my-agent` |
| `hoody agent sessions snapshot get` |  | read | Read a session's recoverable state | `agent.sessions.getSnapshot` | `hoody agent sessions snapshot get --id abc-123` |
| `hoody agent sessions tasks cancel` |  | write | Cancel all background tasks | `agent.sessions.cancelTasks` | `hoody agent sessions tasks cancel --id abc-123` |
| `hoody agent sessions tools list` |  | read | List a session's effective tool set | `agent.sessions.listTools` | `hoody agent sessions tools list --id abc-123 --page 10 --limit 10` |
| `hoody agent sessions tools run` |  | write | Run a tool inside a live session (gated) | `agent.sessions.runTool` | `hoody agent sessions tools run --id abc-123 --name my-resource --confirm --allow-mutations` |
| `hoody agent sessions transcript get` |  | read | Read a session's transcript without attaching | `agent.sessions.getTranscript` | `hoody agent sessions transcript get --id abc-123 --after-turn 10` |
| `hoody agent sessions trim` |  | write | Trim session history to a turn index | `agent.sessions.trim` | `hoody agent sessions trim --id abc-123 --turn-idx 10` |
| `hoody agent sessions turns cancel` |  | write | Cancel the active turn (Esc) | `agent.sessions.turns.cancel` | `hoody agent sessions turns cancel --id abc-123` |
| `hoody agent sessions turns create` |  | write | Dispatch a turn (retry-safe with an idempotency key) | `agent.sessions.turns.create` | `hoody agent sessions turns create --id abc-123 --text Hello --tool-mode standard --dir-scope home` |
| `hoody agent sessions turns get` |  | read | Get a turn's durable receipt | `agent.sessions.turns.get` | `hoody agent sessions turns get --id abc-123 --turn-id abc-123` |
| `hoody agent sessions turns list` |  | read | List a session's durable turn receipts | `agent.sessions.turns.list` | `hoody agent sessions turns list --id abc-123 --limit 10` |
| `hoody agent sessions turns run` |  | write | Dispatch a turn and block to completion | `agent.sessions.turns.run` | `hoody agent sessions turns run --id abc-123 --text Hello --tool-mode standard --dir-scope home` |
| `hoody agent sessions verbosity set` |  | write | Set response verbosity | `agent.sessions.setVerbosity` | `hoody agent sessions verbosity set --id abc-123 --level normal` |
| `hoody agent sessions workflows start` |  | write | Run a workflow onto an existing session | `agent.sessions.startWorkflow` | `hoody agent sessions workflows start --id abc-123 --name my-resource` |
| `hoody agent sessions yolo set` |  | write | Arm or disarm YOLO auto-approve | `agent.sessions.setYolo` | `hoody agent sessions yolo set --id abc-123 --enabled` |
| `hoody agent settings get` |  | read | Get settings | `agent.settings.get` | `hoody agent settings get` |
| `hoody agent settings update` |  | write | Patch settings | `agent.settings.update` | `hoody agent settings update --patch '{}'` |
| `hoody agent skills create` |  | write | Create a skill | `agent.skills.create` | `hoody agent skills create --name my-resource` |
| `hoody agent skills delete` |  | write | Delete a skill | `agent.skills.delete` | `hoody agent skills delete --root-dir <root_dir> --rel-dir <rel_dir>` |
| `hoody agent skills disable` |  | write | Disable a skill | `agent.skills.disable` | `hoody agent skills disable --name my-resource` |
| `hoody agent skills enable` |  | write | Enable a skill | `agent.skills.enable` | `hoody agent skills enable --name my-resource` |
| `hoody agent skills hub cache clear` |  | write | Clear the skill hub cache | `agent.skills.hub.clearCache` | `hoody agent skills hub cache clear` |
| `hoody agent skills hub cache stats` |  | read | Skill hub cache stats | `agent.skills.hub.getCacheStats` | `hoody agent skills hub cache stats` |
| `hoody agent skills hub install` |  | write | Install a hub skill | `agent.skills.hub.install` | `hoody agent skills hub install --package-digest <package_digest> --overwrite` |
| `hoody agent skills hub preview` |  | read | Preview a hub skill | `agent.skills.hub.preview` | `hoody agent skills hub preview --provider <provider> --source <source> --skill-id abc-123` |
| `hoody agent skills hub search` |  | read | Search the skill hub | `agent.skills.hub.search` | `hoody agent skills hub search --query 'my search'` |
| `hoody agent skills import` |  | write | Apply a skill import | `agent.skills.import` | `hoody agent skills import --source claude --items 'source=<source>' --overwrite` |
| `hoody agent skills list` |  | read | List skills | `agent.skills.list` | `hoody agent skills list --page 10 --limit 10` |
| `hoody agent skills rename` |  | write | Rename a skill | `agent.skills.rename` | `hoody agent skills rename --root-dir <root_dir> --rel-dir <rel_dir> --new-name <new_name>` |
| `hoody agent skills scan` |  | read | Scan for importable skills | `agent.skills.scan` | `hoody agent skills scan --source claude` |
| `hoody agent skills source get` |  | read | Read a skill's source | `agent.skills.getSource` | `hoody agent skills source get` |
| `hoody agent skills source set` |  | write | Write a skill's source | `agent.skills.setSource` | `hoody agent skills source set --root-dir <root_dir> --rel-dir <rel_dir> --content Hello --base-gen 10` |
| `hoody agent skills trust` |  | write | Set a skill's trust state | `agent.skills.trust` | `hoody agent skills trust --root-dir <root_dir> --rel-dir <rel_dir> --trusted` |
| `hoody agent stats` |  | read | Cross-session statistics | `agent.stats.get` | `hoody agent stats --scope cwd` |
| `hoody agent tasks cancel` |  | write | Cancel a background task | `agent.tasks.cancel` | `hoody agent tasks cancel --id abc-123 --tid <tid>` |
| `hoody agent tasks list` |  | read | List a session's background tasks | `agent.tasks.list` | `hoody agent tasks list --id abc-123` |
| `hoody agent tasks transcript get` |  | read | Read a background task's transcript | `agent.tasks.getTranscript` | `hoody agent tasks transcript get --id abc-123 --tid <tid> --after-seq 10` |
| `hoody agent todos archive` |  | write | Archive a todo | `agent.todos.archive` | `hoody agent todos archive --id abc-123 --revision 10` |
| `hoody agent todos archived purge` |  | write | Purge archived todos | `agent.todos.purgeArchived` | `hoody agent todos archived purge` |
| `hoody agent todos cancel` |  | write | Cancel a todo's run | `agent.todos.cancel` | `hoody agent todos cancel --id abc-123` |
| `hoody agent todos claim` |  | write | Claim a todo | `agent.todos.claim` | `hoody agent todos claim --id abc-123 --session-id abc-123 --revision 10` |
| `hoody agent todos comments create` |  | write | Comment on a todo | `agent.todos.createComment` | `hoody agent todos comments create --id abc-123 --text Hello` |
| `hoody agent todos create` |  | write | File a todo | `agent.todos.create` | `hoody agent todos create --title 'My Title' --body 'Details go here' --priority 2` |
| `hoody agent todos get` |  | read | Read a todo | `agent.todos.get` | `hoody agent todos get --id abc-123` |
| `hoody agent todos list` |  | read | List todos | `agent.todos.list` | `hoody agent todos list --states inbox --tags tag1,tag2` |
| `hoody agent todos messages send` |  | write | Comment + run an orchestrator turn | `agent.todos.sendMessage` | `hoody agent todos messages send --id abc-123 --text Hello` |
| `hoody agent todos proposals approve` |  | write | Approve a todo proposal | `agent.todos.approveProposal` | `hoody agent todos proposals approve --id abc-123 --pid 1234` |
| `hoody agent todos proposals deny` |  | write | Deny a todo proposal | `agent.todos.denyProposal` | `hoody agent todos proposals deny --id abc-123 --pid 1234` |
| `hoody agent todos release` |  | write | Release a todo | `agent.todos.release` | `hoody agent todos release --id abc-123 --session-id abc-123 --outcome done` |
| `hoody agent todos revision get` |  | read | Get the todos store revision | `agent.todos.getRevision` | `hoody agent todos revision get` |
| `hoody agent todos snooze` |  | write | Snooze a todo | `agent.todos.snooze` | `hoody agent todos snooze --id abc-123 --wake-at 2026-07-04T09:00:00Z --revision 10` |
| `hoody agent todos start` |  | write | Run a todo's orchestrator | `agent.todos.start` | `hoody agent todos start --id abc-123` |
| `hoody agent todos triage` |  | write | Run an LLM triage pass | `agent.todos.triage` | `hoody agent todos triage` |
| `hoody agent todos update` |  | write | Update a todo (CAS) | `agent.todos.update` | `hoody agent todos update --id abc-123 --revision 10 --title 'My Title' --body 'Details go here'` |
| `hoody agent tools get` |  | read | Get one tool schema | `agent.tools.get` | `hoody agent tools get --name my-resource` |
| `hoody agent tools list` |  | read | List the tool catalogue | `agent.tools.list` | `hoody agent tools list --page 10 --limit 10` |
| `hoody agent tools readonly list` |  | read | List the read-only tool subset | `agent.tools.listReadOnly` | `hoody agent tools readonly list --page 10 --limit 10` |
| `hoody agent tools run` |  | write | Run a tool (sessionless, gated) | `agent.tools.run` | `hoody agent tools run --name my-resource --confirm --allow-mutations` |
| `hoody agent tools start` |  | write | Run a tool asynchronously (sessionless, gated) | `agent.tools.start` | `hoody agent tools start --name my-resource --confirm --allow-mutations` |
| `hoody agent usage accounts list` |  | read | Usage rollup by account | `agent.usage.listByAccount` | `hoody agent usage accounts list --since 1750000000` |
| `hoody agent usage models list` |  | read | Usage rollup by model | `agent.usage.listByModel` | `hoody agent usage models list --since 1750000000` |
| `hoody agent version` |  | read | Agent API version and capabilities | `agent.kit.getVersion` | `hoody agent version` |
| `hoody agent whoami` |  | read | Hoody platform identity and realm scope | `agent.whoami` | `hoody agent whoami` |
| `hoody agent work stop` |  | write | Stop everything running in the realm (loops are paused) | `agent.stopAllWork` | `hoody agent work stop` |
| `hoody agent workflows delete` |  | write | Delete a workflow definition | `agent.workflows.delete` | `hoody agent workflows delete --name my-resource` |
| `hoody agent workflows get` |  | read | Read one workflow definition | `agent.workflows.get` | `hoody agent workflows get --name my-resource --include-revision` |
| `hoody agent workflows hidden set` |  | write | Hide or un-hide a workflow | `agent.workflows.setHidden` | `hoody agent workflows hidden set --name my-resource --hidden` |
| `hoody agent workflows list` |  | read | List workflow definitions | `agent.workflows.list` | `hoody agent workflows list --page 10 --limit 10` |
| `hoody agent workflows messages send` |  | write | Send a message to a running workflow | `agent.workflows.sendMessage` | `hoody agent workflows messages send --id abc-123 --text Hello` |
| `hoody agent workflows runs cancel` |  | write | Cancel a workflow run | `agent.workflows.cancelRun` | `hoody agent workflows runs cancel --run-id abc-123` |
| `hoody agent workflows runs get` |  | read | Get one workflow run by id | `agent.workflows.getRun` | `hoody agent workflows runs get --run-id abc-123` |
| `hoody agent workflows runs list` |  | read | Snapshot in-flight and recent workflow runs | `agent.workflows.listRuns` | `hoody agent workflows runs list --page 10 --limit 10` |
| `hoody agent workflows runs resume` |  | write | Resume a paused workflow run | `agent.workflows.resumeRun` | `hoody agent workflows runs resume --run-id abc-123 --session-id abc-123` |
| `hoody agent workflows set` |  | write | Create or replace a workflow definition | `agent.workflows.set` | `hoody agent workflows set --name my-resource --definition '{}'` |
| `hoody agent workflows start` |  | write | Run a workflow in a new session | `agent.workflows.start` | `hoody agent workflows start --name my-resource --model openai/gpt-5.4-nano --agent my-agent` |
| `hoody agent workflows summary set` |  | write | Set or clear a workflow's summary | `agent.workflows.setSummary` | `hoody agent workflows summary set --name my-resource --summary <summary>` |

## `hoody ai` — 1 command

Hoody AI catalog and models

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody ai models list` |  | read | List available AI models (Hoody catalog) | `api.ai.listModels` | `hoody ai models list` |

## `hoody auth` — 34 commands

Authentication, tokens, and 2FA

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody auth 2fa backup codes rotate` |  | action | Regenerate Backup Codes | `api.auth.twoFactor.rotateBackupCodes` | `hoody auth 2fa backup codes rotate --password <password> --code <code> -y` |
| `hoody auth 2fa disable` |  | destructive | Disable 2FA | `api.auth.twoFactor.disable` | `hoody auth 2fa disable --password <password> --code <code> -y` |
| `hoody auth 2fa gate disable` |  | write | Stop requiring two-factor verification to create auth tokens | `api.auth.twoFactor.disableTokenGate` | `hoody auth 2fa gate disable` |
| `hoody auth 2fa gate enable` |  | write | Require two-factor verification to create auth tokens | `api.auth.twoFactor.enableTokenGate` | `hoody auth 2fa gate enable` |
| `hoody auth 2fa setup confirm` |  | action | Complete 2FA Setup | `api.auth.twoFactor.confirmSetup` | `hoody auth 2fa setup confirm --code <code>` |
| `hoody auth 2fa setup start` |  | action | Initialize 2FA Setup | `api.auth.twoFactor.startSetup` | `hoody auth 2fa setup start --password <password>` |
| `hoody auth 2fa status` |  | read | Get 2FA Status | `api.auth.twoFactor.getStatus` | `hoody auth 2fa status` |
| `hoody auth 2fa verify` |  | action | Verify 2FA Code During Login | `api.auth.twoFactor.verify` | `hoody auth 2fa verify --code <code> --response-mode intent --print-token` |
| `hoody auth claims create` |  | action | Issue a signed identity claim bound to an audience | `api.auth.createIdentityClaim` | `hoody auth claims create --audience myapp.example.com --expires-in 3600` |
| `hoody auth config get` |  | read | Show the public sign-in configuration | `api.auth.getConfig` | `hoody auth config get` |
| `hoody auth device poll` |  | action | Poll for device sign-in tokens and save the session | `api.auth.device.poll` | `hoody auth device poll --device-code <device_code> --print-token` |
| `hoody auth device start` |  | action | Start a device sign-in and print the code to enter in a browser | `api.auth.device.start` | `hoody auth device start` |
| `hoody auth email verification send` |  | write | Resend verification email | `api.auth.sendVerificationEmail` | `hoody auth email verification send --email user@example.com` |
| `hoody auth email verify` |  | write | Verify email address | `api.auth.verifyEmail` | `hoody auth email verify --token <token> --response-mode intent --print-token` |
| `hoody auth oauth authorize` |  | action | Begin a PKCE authorization with a sign-in intent token | `api.auth.oauth.authorize` | `hoody auth oauth authorize --code-challenge <code_challenge> --redirect-uri <redirect_uri>` |
| `hoody auth oauth exchange` |  | action | Exchange a PKCE authorization code for a session | `api.auth.oauth.exchange` | `hoody auth oauth exchange --code <code> --code-verifier <code_verifier> --redirect-uri <redirect_uri> --print-token` |
| `hoody auth oauth intents cancel` |  | action | Cancel a pending sign-in intent or 2FA temporary token | `api.auth.oauth.cancelIntent` | `hoody auth oauth intents cancel` |
| `hoody auth password recover` |  | write | Request password reset | `api.auth.recoverPassword` | `hoody auth password recover --email user@example.com` |
| `hoody auth password reset` |  | write | Reset password | `api.auth.resetPassword` | `hoody auth password reset --token <token> --password <password>` |
| `hoody auth refresh` |  | action | Refresh access token | `api.auth.refresh` | `hoody auth refresh --refresh-token <refresh_token> --print-token` |
| `hoody auth tokens copy` |  | write | Copy auth token | `api.auth.tokens.copy` | `hoody auth tokens copy 64f1a2b3c4d5e6f7a8b9c0d1 --alias my-resource --expires-at today` |
| `hoody auth tokens create` |  | write | Create a new auth token | `api.auth.tokens.create` | `hoody auth tokens create --alias clever-dolphin --public-key 4a1f8c2d3e5b6079a1c2d3e4f50617283940a1b2c3d4e5f60718293a4b5c6d7e` |
| `hoody auth tokens delete` |  | destructive | Delete auth token | `api.auth.tokens.delete` | `hoody auth tokens delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody auth tokens get` |  | read | Get the calling auth token (no id) or an auth token by id; Get auth token by id | `api.auth.tokens.getCurrent`, `api.auth.tokens.get` | `hoody auth tokens get` |
| `hoody auth tokens list` |  | read | List auth tokens | `api.auth.tokens.list` | `hoody auth tokens list` |
| `hoody auth tokens profiles get` |  | read | Get auth token public profile by public key | `api.auth.tokens.getPublicProfile` | `hoody auth tokens profiles get 4a1f8c2d3e5b6079a1c2d3e4f50617283940a1b2c3d4e5f60718293a4b5c6d7e` |
| `hoody auth tokens profiles update` |  | write | Update current auth token public profile | `api.auth.tokens.updatePublicProfile` | `hoody auth tokens profiles update --public-key 4a1f8c2d3e5b6079a1c2d3e4f50617283940a1b2c3d4e5f60718293a4b5c6d7e` |
| `hoody auth tokens realms add` |  | write | Add realm to auth token | `api.auth.tokens.addRealm` | `hoody --realm-id 64f1a2b3c4d5e6f7a8b9c0d1 auth tokens realms add 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody auth tokens realms remove` |  | destructive | Remove realm from auth token | `api.auth.tokens.removeRealm` | `hoody --realm-id 64f1a2b3c4d5e6f7a8b9c0d1 auth tokens realms remove 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody auth tokens templates list` |  | read | List auth token permission templates | `api.auth.tokens.listTemplates` | `hoody auth tokens templates list` |
| `hoody auth tokens update` |  | write | Update auth token | `api.auth.tokens.update` | `hoody auth tokens update 64f1a2b3c4d5e6f7a8b9c0d1 --alias my-resource --public-key 4a1f8c2d3e5b6079a1c2d3e4f50617283940a1b2c3d4e5f60718293a4b5c6d7e` |
| `hoody auth waitlist join` |  | write | Join the Hoody waitlist |  | `hoody auth waitlist join --email user@example.com` |
| `hoody auth waitlist update` |  | write | Add interest and role answers to an existing waitlist signup |  | `hoody auth waitlist update --email user@example.com --interest dev --context individual` |
| `hoody auth whoami` |  | read | Get current user profile | `api.auth.whoami` | `hoody auth whoami` |

## `hoody bot` — 18 commands

Channel bots — register a chat bot and run its long-poll loop

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody bot open` |  | action | Open the Bot kit registrations page in your browser |  | `hoody bot open` |
| `hoody bot commands sync` |  | write | Push the registered command lists and menu button to the channel and read them back | `bot.registrations.syncCommands` | `hoody bot commands sync abc-123` |
| `hoody bot create` |  | write | Register a channel bot. The token is sent over HTTPS, verified with the channel, stored encrypted and never echoed back | `bot.registrations.create` | `hoody bot create --channel telegram --token <token> --label my-label` |
| `hoody bot delete` |  | destructive | Delete a bot registration and its stored channel token | `bot.registrations.delete` | `hoody bot delete abc-123 -y` |
| `hoody bot get` |  | read | Read one bot registration | `bot.registrations.get` | `hoody bot get abc-123` |
| `hoody bot health` |  | read | Health check for the bot kit (nine fields; unauthenticated by design) | `bot.kit.getHealth` | `hoody bot health` |
| `hoody bot keys rotate` |  | destructive | Rotate kit.key and re-encrypt every sealed column (refused while a poller is active unless --force) | `bot.kit.rotateKeys` | `hoody bot keys rotate --force true -y` |
| `hoody bot list` |  | read | List the bot registrations owned by the calling account | `bot.registrations.list` | `hoody bot list` |
| `hoody bot logs list` |  | read | Read the redacted per-actor audit log of a registration (paged) | `bot.registrations.listLogs` | `hoody bot logs list abc-123 --since 1750000000000 --limit 10` |
| `hoody bot logs purge` |  | destructive | Purge audit rows at or before an epoch-millisecond cutoff (--older-than). Without --all true the cutoff defaults to the 90-day retention boundary and a cutoff inside that window is refused; with --all true and no --older-than, every row up to now is deleted | `bot.registrations.purgeLogs` | `hoody bot logs purge abc-123 --older-than 1750000000000 --all true -y` |
| `hoody bot manifest get` |  | read | The chat manifest this build is pinned to, as it was baked (503 manifest_unavailable when none is in force) | `bot.kit.getManifest` | `hoody bot manifest get --verify` |
| `hoody bot policy get` |  | read | Read a registration policy: mode (single\|multi) and allowlists | `bot.registrations.getPolicy` | `hoody bot policy get abc-123` |
| `hoody bot policy update` |  | write | Set a registration policy: mode (single\|multi) and allowlists | `bot.registrations.updatePolicy` | `hoody bot policy update abc-123 --mode single` |
| `hoody bot profile update` |  | write | Set the bot profile (name, descriptions, default admin rights) and sync it to the channel | `bot.registrations.updateProfile` | `hoody bot profile update abc-123 --name my-resource --description 'My description'` |
| `hoody bot sessions revoke` |  | write | Log one chat user out of a registration and revoke their token lineage | `bot.registrations.revokeSession` | `hoody bot sessions revoke abc-123 abc-123 -y` |
| `hoody bot start` |  | action | Start long-polling for a registration | `bot.registrations.start` | `hoody bot start abc-123` |
| `hoody bot stop` |  | action | Stop long-polling for a registration | `bot.registrations.stop` | `hoody bot stop abc-123` |
| `hoody bot tokens revoke` |  | destructive | Revoke every chat user lineage of a registration (parent ids whose deletion failed are listed) | `bot.registrations.revokeAllTokens` | `hoody bot tokens revoke abc-123 --all -y` |

## `hoody browser` (alias: br) — 29 commands

Browser automation and control

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody browser open` |  | action | Open the Browser kit service (browser automation UI) in your browser |  | `hoody browser open` |
| `hoody browser act` |  | action | Perform a native element action (click, fill, type, press, select, check, hover) | `browser.page.act` | `hoody browser act --browser-id 1 --tab-id 10 --action click --target-selector '#submit'` |
| `hoody browser cookies batch set` |  | write | Set cookies | `browser.cookies.setMany` | `hoody browser cookies batch set --browser-id 1 --start --cookies name=my-resource,value=hello` |
| `hoody browser cookies clear` |  | destructive | Clear all cookies | `browser.cookies.clear` | `hoody browser cookies clear --browser-id 1 --start` |
| `hoody browser cookies list` |  | read | Get cookies | `browser.cookies.list` | `hoody browser cookies list --browser-id 1 --start` |
| `hoody browser devtools urls get` |  | read | Get DevTools URLs | `browser.instances.getDevtoolsUrls` | `hoody browser devtools urls get --browser-id 1 --start` |
| `hoody browser evaluate` |  | action | Execute JavaScript (POST) | `browser.page.evaluate` | `hoody browser evaluate --browser-id 1 --start --script document.title` |
| `hoody browser get` |  | read | Get instance metadata | `browser.instances.get` | `hoody browser get --browser-id 1 --start` |
| `hoody browser health` |  | read | Health check | `browser.kit.getHealth` | `hoody browser health` |
| `hoody browser history clear` |  | destructive | Delete browsing history | `browser.history.clear` | `hoody browser history clear --before 2026-01-01T00:00:00Z --browser-id 1 -y` |
| `hoody browser history list` |  | read | Query browsing history | `browser.history.list` | `hoody browser history list --since 2026-01-01T00:00:00Z --domain example.com` |
| `hoody browser html get` |  | read | Get page HTML | `browser.page.getHtml` | `hoody browser html get --browser-id 1 --tab-id 10` |
| `hoody browser logs console list` |  | read | Get console logs (use `--clear` to also clear) | `browser.logs.listConsole` | `hoody browser logs console list --browser-id 1 --tab-id 10` |
| `hoody browser logs network list` |  | read | Get network logs (use `--clear` to also clear) | `browser.logs.listNetwork` | `hoody browser logs network list --browser-id 1 --tab-id 10` |
| `hoody browser navigate` |  | action | Navigate to URL (POST) | `browser.page.navigate` | `hoody browser navigate --browser-id 1 --start --url https://example.com` |
| `hoody browser pdf export` |  | read | Export page as PDF | `browser.page.exportPdf` | `hoody browser pdf export --browser-id 1 --tab-id 10` |
| `hoody browser restart` |  | action | Restart browser instance | `browser.instances.restart` | `hoody browser restart --browser-id 1 --start` |
| `hoody browser screenshots capture` |  | read | Capture browser screenshot | `browser.page.captureScreenshot` | `hoody browser screenshots capture --browser-id 1 --start` |
| `hoody browser shutdown` |  | destructive | Shutdown browser instance | `browser.instances.shutdown` | `hoody browser shutdown --browser-id 1` |
| `hoody browser snapshot get` |  | read | Accessibility snapshot of a tab with element refs | `browser.page.getSnapshot` | `hoody browser snapshot get --browser-id 1 --tab-id 10` |
| `hoody browser start` |  | action | Create or retrieve browser instance | `browser.instances.start` | `hoody browser start --browser-id 1 --fingerprint-id default` |
| `hoody browser stats` |  | read | Server metrics | `browser.kit.getStats` | `hoody browser stats` |
| `hoody browser stop` |  | action | Stop browser instance | `browser.instances.stop` | `hoody browser stop --browser-id 1` |
| `hoody browser tabs close` |  | write | Close a browser tab | `browser.tabs.close` | `hoody browser tabs close --browser-id 1 --start` |
| `hoody browser tabs list` |  | read | List browser tabs | `browser.tabs.list` | `hoody browser tabs list --browser-id 1 --start` |
| `hoody browser text get` |  | read | Get page text | `browser.page.getText` | `hoody browser text get --browser-id 1 --tab-id 10` |
| `hoody browser viewport get` |  | read | Show the instance's current viewport policy | `browser.viewport.get` | `hoody browser viewport get --browser-id 1` |
| `hoody browser viewport set` |  | write | Change the viewport of a running instance | `browser.viewport.set` | `hoody browser viewport set --viewport-width 10 --viewport-height 10 --browser-id 1` |
| `hoody browser wait` |  | action | Wait for a condition in a tab | `browser.page.wait` | `hoody browser wait --browser-id 1 --tab-id 10 --condition-kind target --condition-target-selector '#submit' --condition-state attached` |

## `hoody code` — 8 commands

VS Code server

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody code embed` |  | read | Build an iframeable URL for a VS Code extension (extension-only mode) | `client.embeds.code.extension` | `hoody code embed rooveterinaryinc.roo-cline --folder /home/user/project` |
| `hoody code open` |  | action | Open the Code kit editor on a folder in your browser |  | `hoody code open --folder /home/user/project` |
| `hoody code extensions install` |  | write | Stage a VS Code extension (.vsix) from a URL; it is installed at the instance's next start | `code.extensions.install` | `hoody code extensions install --url https://example.com/publisher.name-1.2.3.vsix --allow-downgrade` |
| `hoody code extensions list` |  | read | List staged extensions and the extensions the instance reports as installed | `code.extensions.list` | `hoody code extensions list` |
| `hoody code health` |  | read | Service health check | `code.kit.getHealth` | `hoody code health` |
| `hoody code status` |  | read | Orchestrator configuration and running editor instances | `code.kit.getStatus` | `hoody code status` |
| `hoody code stop` |  | action | Stop an editor instance; its settings, extensions and workspace state are kept | `code.stop` | `hoody code stop 1` |
| `hoody code version` |  | read | Versions of the running orchestrator and its packaged editor | `code.kit.getVersion` | `hoody code version` |

## `hoody containers` (alias: c) — 50 commands

Container lifecycle, stats, and proxy permissions. Proxy subcommands (`hoody containers proxy ...`) cover per-container hooks, permissions, groups, settings, service discovery, and proxied-usage reporting. For global proxy routing/aliases/logs, see `hoody proxy`.

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody containers wait` |  | read | Wait until a container reaches a runtime state (running, stopped, paused, failed); prints the result as JSON |  | `hoody containers wait CONTAINER_ID --state running --timeout 120s` |
| `hoody containers claims create` |  | write | Authorize Container Access | `api.containers.createClaim` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 containers claims create` |
| `hoody containers copy` |  | write | Copy a container | `api.containers.copy` | `hoody containers copy 64f1a2b3c4d5e6f7a8b9c0d1 --target-project-id 64f1a2b3c4d5e6f7a8b9c0d1 --target-server-id 64f1a2b3c4d5e6f7a8b9c0d1 --name my-resource` |
| `hoody containers create` |  | write | Create a new container | `api.containers.create` | `hoody containers create --project abc-123 --server-id abc-123 --name my-resource --color '#ff0000'` |
| `hoody containers delete` |  | destructive | Delete a container | `api.containers.delete` | `hoody containers delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody containers env delete` |  | destructive | Delete a single environment variable | `api.containers.env.delete` | `hoody containers env delete --key <key> -y` |
| `hoody containers env list` |  | read | List container environment variables | `api.containers.env.list` | `hoody --container abc-123 containers env list` |
| `hoody containers env set` |  | write | Set a single environment variable | `api.containers.env.set` | `hoody containers env set --key <key> --value hello` |
| `hoody containers env update` |  | write | Bulk set container environment variables | `api.containers.env.update` | `hoody containers env update --body '{"APP_MODE":"hello"}'` |
| `hoody containers get` |  | read | Get a container by ID | `api.containers.get` | `hoody containers get 64f1a2b3c4d5e6f7a8b9c0d1 --include-proxy-domains` |
| `hoody containers kvm disable` |  | write | Disable /dev/kvm passthrough. Rented/dedicated servers only; the container must be stopped. | `api.containers.disableKvm` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 containers kvm disable` |
| `hoody containers kvm enable` |  | write | Enable /dev/kvm passthrough (run full VMs inside the container). Rented/dedicated servers only; the container must be stopped. | `api.containers.enableKvm` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 containers kvm enable` |
| `hoody containers list` |  | read | Get all containers | `api.containers.list` | `hoody containers list --page 1 --limit 50` |
| `hoody containers pause` |  | action | Pause a container | `api.containers.pause` | `hoody containers pause 64f1a2b3c4d5e6f7a8b9c0d1 --timeout 120` |
| `hoody containers proxy default set` |  | write | Update container default proxy permission policy | `api.proxy.containerPermissions.setDefault` | `hoody containers proxy default set --if-match file:v42 --default allow` |
| `hoody containers proxy disable` |  | write | Disable the proxy permissions of a container | `api.proxy.containerPermissions.disable` | `hoody containers proxy disable --if-match file:v42` |
| `hoody containers proxy enable` |  | write | Enable the proxy permissions of a container | `api.proxy.containerPermissions.enable` | `hoody containers proxy enable --if-match file:v42` |
| `hoody containers proxy groups delete` |  | destructive | Remove container authentication group | `api.proxy.containerPermissions.deleteAuthGroup` | `hoody containers proxy groups delete --group-name <group_name> --if-match file:v42 -y` |
| `hoody containers proxy groups ip set` |  | write | Set IP authentication group (container) | `api.proxy.containerPermissions.setIpGroup` | `hoody containers proxy groups ip set --group-name <group_name> --if-match file:v42 --range 192.0.2.0/24` |
| `hoody containers proxy groups jwt set` |  | write | Set JWT authentication group (container) | `api.proxy.containerPermissions.setJwtGroup` | `hoody containers proxy groups jwt set --group-name <group_name> --if-match file:v42 --secret <secret> --algorithm HS256 --sources header:Authorization --claims key=hello` |
| `hoody containers proxy groups list` |  | read | List container proxy groups | `api.proxy.groups.list` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 containers proxy groups list` |
| `hoody containers proxy groups password set` |  | write | Set password authentication group (container) | `api.proxy.containerPermissions.setPasswordGroup` | `hoody containers proxy groups password set --group-name <group_name> --if-match file:v42 --auth-username alice --auth-password <password> --algorithm sha256 --salt <salt>` |
| `hoody containers proxy groups permissions clear` |  | destructive | Remove all program permissions for a container group | `api.proxy.containerPermissions.clearGroupPermissions` | `hoody containers proxy groups permissions clear --group-name <group_name> --if-match file:v42 -y` |
| `hoody containers proxy groups permissions delete` |  | destructive | Remove a single program permission for a container group | `api.proxy.containerPermissions.deleteGroupPermission` | `hoody containers proxy groups permissions delete --group-name <group_name> --program http --if-match file:v42 -y` |
| `hoody containers proxy groups permissions set` |  | write | Set container group program permission | `api.proxy.containerPermissions.setGroupPermission` | `hoody containers proxy groups permissions set --group-name <group_name> --if-match file:v42 --program http --access true` |
| `hoody containers proxy groups token set` |  | write | Set token authentication group (container) | `api.proxy.containerPermissions.setTokenGroup` | `hoody containers proxy groups token set --group-name <group_name> --if-match file:v42 --body '{"header":"X-Api-Key","value":"<token>"}'` |
| `hoody containers proxy hooks create` |  | write | Append or insert a new hook | `api.proxy.hooks.create` | `hoody containers proxy hooks create <service> --if-match file:v42 --match-path /home/user/file.txt --match-headers key=hello --script-path /home/user/file.txt` |
| `hoody containers proxy hooks delete` |  | destructive | Remove a hook | `api.proxy.hooks.delete` | `hoody containers proxy hooks delete <service> <hook_id> --if-match file:v42 -y` |
| `hoody containers proxy hooks get` |  | read | Get a single hook by id | `api.proxy.hooks.get` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 containers proxy hooks get <service> <hook_id>` |
| `hoody containers proxy hooks list` |  | read | List all proxy hooks for a container | `api.proxy.hooks.list` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 containers proxy hooks list` |
| `hoody containers proxy hooks move` |  | write | Move a hook to a new position | `api.proxy.hooks.move` | `hoody containers proxy hooks move <service> <hook_id> --if-match file:v42 --position 10` |
| `hoody containers proxy hooks set` |  | write | Replace a hook in place | `api.proxy.hooks.set` | `hoody containers proxy hooks set <service> <hook_id> --if-match file:v42 --match-path /home/user/file.txt --match-headers key=hello --script-path /home/user/file.txt` |
| `hoody containers proxy permissions delete` |  | destructive | Delete container proxy permissions | `api.proxy.containerPermissions.delete` | `hoody containers proxy permissions delete --if-match file:v42 -y` |
| `hoody containers proxy permissions get` |  | read | Get container proxy permissions | `api.proxy.containerPermissions.get` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 containers proxy permissions get` |
| `hoody containers proxy permissions set` |  | write | Replace container proxy permissions JSON | `api.proxy.containerPermissions.set` | `hoody containers proxy permissions set --if-match file:v42 --project 64f1a2b3c4d5e6f7a8b9c0d1 --groups 'key={"type":"ip","range":"192.0.2.0/24"}' --permissions 'key={}' --default allow --enable-proxy` |
| `hoody containers proxy services get` |  | read | Get merged proxy view for a service | `api.proxy.services.get` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 containers proxy services get <service>` |
| `hoody containers proxy services hooks clear` |  | destructive | Clear all hooks for a service | `api.proxy.hooks.clear` | `hoody containers proxy services hooks clear <service> --if-match file:v42 -y` |
| `hoody containers proxy services hooks list` |  | read | List hooks for a specific service | `api.proxy.hooks.listByService` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 containers proxy services hooks list <service>` |
| `hoody containers proxy services list` |  | read | List services referenced in proxy config | `api.proxy.services.list` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 containers proxy services list` |
| `hoody containers proxy settings get` |  | read | Get container proxy root settings | `api.proxy.settings.get` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 containers proxy settings get` |
| `hoody containers proxy settings update` |  | write | Update container proxy root settings | `api.proxy.settings.update` | `hoody containers proxy settings update --if-match file:v42 --enable-proxy --default allow` |
| `hoody containers proxy usage` |  | read | Get proxied-usage documents for a container | `api.containers.getProxyUsage` | `hoody containers proxy usage --from <from> --to <to>` |
| `hoody containers restart` |  | action | Restart a container | `api.containers.restart` | `hoody containers restart 64f1a2b3c4d5e6f7a8b9c0d1 --timeout 120` |
| `hoody containers resume` |  | action | Resume a container | `api.containers.resume` | `hoody containers resume 64f1a2b3c4d5e6f7a8b9c0d1 --timeout 120` |
| `hoody containers start` |  | action | Start a container | `api.containers.start` | `hoody containers start 64f1a2b3c4d5e6f7a8b9c0d1 --timeout 120` |
| `hoody containers stats` |  | read | Get container resource statistics | `api.containers.getStats` | `hoody containers stats 507f1f77bcf86cd799439011` |
| `hoody containers status history list` |  | read | Get status logs for a container | `api.containers.listStatusHistory` | `hoody containers status history list --page 1 --limit 10` |
| `hoody containers stop` |  | action | Stop a container; Force-stop a container immediately, without waiting for a clean shutdown | `api.containers.stop` | `hoody containers stop 64f1a2b3c4d5e6f7a8b9c0d1 --force --timeout 120` |
| `hoody containers sync` |  | action | Sync a copied container with its source | `api.containers.sync` | `hoody containers sync 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody containers update` |  | write | Update a container | `api.containers.update` | `hoody containers update 64f1a2b3c4d5e6f7a8b9c0d1 --name my-resource --color '#ff0000'` |

## `hoody cron` — 10 commands

Cron scheduling

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody cron open` |  | action | Open the Cron kit job manager in your browser |  | `hoody cron open` |
| `hoody cron crontabs get` |  | read | get crontab | `cron.crontabs.get` | `hoody cron crontabs get alice` |
| `hoody cron crontabs list` |  | read | list all crontabs | `cron.crontabs.list` | `hoody cron crontabs list --page 10 --limit 50` |
| `hoody cron crontabs set` |  | write | put crontab | `cron.crontabs.set` | `hoody cron crontabs set alice --crontab <crontab>` |
| `hoody cron entries create` |  | write | create entry | `cron.entries.create` | `hoody cron entries create alice --command 'ls -la' --comment Hello --enabled --schedule '0 * * * *'` |
| `hoody cron entries delete` |  | destructive | delete entry | `cron.entries.delete` | `hoody cron entries delete alice 3fa85f64-5717-4562-b3fc-2c963f66afa6 -y` |
| `hoody cron entries get` |  | read | get entry | `cron.entries.get` | `hoody cron entries get alice 3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| `hoody cron entries list` |  | read | list entries | `cron.entries.list` | `hoody cron entries list alice --page 10 --limit 50` |
| `hoody cron entries update` |  | write | update entry | `cron.entries.update` | `hoody cron entries update alice 3fa85f64-5717-4562-b3fc-2c963f66afa6 --clear-expiration --command 'ls -la'` |
| `hoody cron health` |  | read | health check | `cron.kit.getHealth` | `hoody cron health` |

## `hoody curl` — 21 commands

cURL jobs and schedules

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody curl health` |  | read | Service health check | `curl.kit.getHealth` | `hoody curl health` |
| `hoody curl jobs cancel` |  | destructive | Cancel a pending or running job; the record stays | `curl.jobs.cancel` | `hoody curl jobs cancel 550e8400-e29b-41d4-a716-446655440000` |
| `hoody curl jobs delete` |  | destructive | Permanently delete a finished job's record and its saved downloads (a running job must be cancelled first) | `curl.jobs.delete` | `hoody curl jobs delete 550e8400-e29b-41d4-a716-446655440000` |
| `hoody curl jobs get` |  | read | Get detailed job information | `curl.jobs.get` | `hoody curl jobs get 550e8400-e29b-41d4-a716-446655440000` |
| `hoody curl jobs list` |  | read | List all async jobs | `curl.jobs.list` | `hoody curl jobs list --page 1 --limit 50` |
| `hoody curl jobs result get` |  | read | Get job response body | `curl.jobs.getResult` | `hoody curl jobs result get 550e8400-e29b-41d4-a716-446655440000` |
| `hoody curl jobs stream` |  | read | Stream job lifecycle events live | `curl.jobs.stream` | `hoody curl jobs stream --job-id 550e8400-e29b-41d4-a716-446655440000 --since 0` |
| `hoody curl metrics` |  | read | Prometheus metrics | `curl.kit.getMetrics` | `hoody curl metrics` |
| `hoody curl run` |  | action | Execute HTTP request with full cURL capabilities | `curl.run` | `hoody curl run --compressed --connect-timeout 10 --url https://example.com` |
| `hoody curl schedules create` |  | write | Create a recurring scheduled job | `curl.schedules.create` | `hoody curl schedules create --cron '0 0 * * * *' --request-compressed --request-connect-timeout 10 --request-url https://example.com` |
| `hoody curl schedules delete` |  | destructive | Delete a schedule | `curl.schedules.delete` | `hoody curl schedules delete 770e8400-e29b-41d4-a716-446655440000 -y` |
| `hoody curl schedules get` |  | read | Get schedule details | `curl.schedules.get` | `hoody curl schedules get 770e8400-e29b-41d4-a716-446655440000` |
| `hoody curl schedules list` |  | read | List all scheduled jobs | `curl.schedules.list` | `hoody curl schedules list --page 1 --limit 50` |
| `hoody curl schedules update` |  | write | Change a schedule's cron expression, enabled state or request. Omitted fields keep their stored value; passing any request flag, such as --request-url, replaces the whole stored request | `curl.schedules.update` | `hoody curl schedules update 770e8400-e29b-41d4-a716-446655440000 --cron '0 */5 * * * *' --enabled` |
| `hoody curl sessions cookies list` |  | read | Get session cookies only | `curl.sessions.listCookies` | `hoody curl sessions cookies list user-session-123` |
| `hoody curl sessions delete` |  | destructive | Delete a session | `curl.sessions.delete` | `hoody curl sessions delete user-session-123 -y` |
| `hoody curl sessions get` |  | read | Get session details | `curl.sessions.get` | `hoody curl sessions get user-session-123` |
| `hoody curl sessions list` |  | read | List all cookie sessions | `curl.sessions.list` | `hoody curl sessions list --page 1 --limit 50` |
| `hoody curl storage delete` |  | destructive | Delete a saved file | `curl.storage.delete` | `hoody curl storage delete by-job/550e8400-e29b-41d4-a716-446655440000/report.pdf --recursive -y` |
| `hoody curl storage get` |  | read | Download a saved file | `curl.storage.get` | `hoody curl storage get by-job/550e8400-e29b-41d4-a716-446655440000/report.pdf` |
| `hoody curl storage list` |  | read | List all saved downloads | `curl.storage.list` | `hoody curl storage list --page 1 --limit 50` |

## `hoody daemon` (alias: d) — 20 commands

Daemon and ephemeral programs

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody daemon ephemeral programs list` |  | read | List all ephemeral programs | `daemon.ephemeralPrograms.list` | `hoody daemon ephemeral programs list` |
| `hoody daemon ephemeral programs logs get` |  | read | Get ephemeral program logs | `daemon.ephemeralPrograms.getLogs` | `hoody daemon ephemeral programs logs get <id> --type stdout --lines 100` |
| `hoody daemon ephemeral programs start` |  | write | Launch ephemeral CUSTOM program | `daemon.ephemeralPrograms.start` | `hoody daemon ephemeral programs start --command 'python my_batch_job.py' --user worker --directory /opt/app --inject-container-env` |
| `hoody daemon ephemeral programs status` |  | read | Get ephemeral program status | `daemon.ephemeralPrograms.getStatus` | `hoody daemon ephemeral programs status quick_1731605123456_0` |
| `hoody daemon ephemeral programs stop` |  | write | Stop ephemeral program | `daemon.ephemeralPrograms.stop` | `hoody daemon ephemeral programs stop quick_1731605123456_0` |
| `hoody daemon health` |  | read | Service health check | `daemon.kit.getHealth` | `hoody daemon health` |
| `hoody daemon programs create` |  | write | Add a new CUSTOM program | `daemon.programs.create` | `hoody daemon programs create --id 10 --name my-app --description 'My Node.js application' --command 'node app.js' --user nodejs` |
| `hoody daemon programs delete` |  | destructive | Remove a program | `daemon.programs.delete` | `hoody daemon programs delete 1 -y` |
| `hoody daemon programs disable` |  | write | Disable a program | `daemon.programs.disable` | `hoody daemon programs disable 1` |
| `hoody daemon programs enable` |  | write | Enable a program | `daemon.programs.enable` | `hoody daemon programs enable 1` |
| `hoody daemon programs get` |  | read | Get a specific program | `daemon.programs.get` | `hoody daemon programs get 1` |
| `hoody daemon programs list` |  | read | List all programs | `daemon.programs.list` | `hoody daemon programs list --hoody-kit true --lazy-load true` |
| `hoody daemon programs logs get` |  | read | Get program logs | `daemon.programs.getLogs` | `hoody daemon programs logs get 10 --type stdout --lines 100` |
| `hoody daemon programs logs stream` |  | read | Follow a program's log live: replays the last --lines lines, then prints every new line. A reconnect resumes after the last line received | `daemon.programs.streamLogs` | `hoody daemon programs logs stream --id 10 --type stdout --port 8080` |
| `hoody daemon programs reset` |  | write | Reset programs to default | `daemon.programs.reset` | `hoody daemon programs reset -y` |
| `hoody daemon programs sandbox get` |  | read | Show a program's sandbox: the stored block, the policy revision, what it resolves to, and what the firewall is holding | `daemon.programs.getSandbox` | `hoody daemon programs sandbox get 1` |
| `hoody daemon programs start` |  | write | Start a program or port instance | `daemon.programs.start` | `hoody daemon programs start 1 --port 8042 --wait` |
| `hoody daemon programs status` |  | read | Get the status of every program (no id); Get the status of one program | `daemon.programs.listStatus`, `daemon.programs.getStatus` | `hoody daemon programs status --port 8080` |
| `hoody daemon programs stop` |  | write | Stop a program or port instance | `daemon.programs.stop` | `hoody daemon programs stop 1 --port 8042` |
| `hoody daemon programs update` |  | write | Edit a program | `daemon.programs.update` | `hoody daemon programs update 1 --name my-app --description 'My Node.js application'` |

## `hoody db` (alias: sql) — 13 commands

SQLite database operations

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody db open` |  | action | Open the SQLite kit studio in your browser |  | `hoody db open` |
| `hoody db cache stats` |  | read | Database connection cache snapshot | `sqlite.kit.getCacheStats` | `hoody db cache stats` |
| `hoody db create` |  | write | Create new SQLite database | `sqlite.databases.create` | `hoody db create --path /hoody/databases/app.db --init-kv --kv-table kv_store` |
| `hoody db delete` |  | destructive | Permanently delete a SQLite database and its -wal, -shm and -journal files | `sqlite.databases.delete` | `hoody db delete --db /hoody/databases/app.db --timeout 30 -y` |
| `hoody db health` |  | read | Service health check | `sqlite.kit.getHealth` | `hoody db health --verbose` |
| `hoody db history clear` |  | destructive | Clear query history | `sqlite.history.clear` | `hoody db history clear --db <db> --timeout 30` |
| `hoody db history delete` |  | destructive | Delete history entry | `sqlite.history.delete` | `hoody db history delete 10 --db <db> --timeout 30 -y` |
| `hoody db history list` |  | read | Get query history | `sqlite.history.list` | `hoody db history list --db <db> --limit 100 --offset 0` |
| `hoody db history stats` |  | read | Get history statistics | `sqlite.history.getStats` | `hoody db history stats --db <db> --timeout 30` |
| `hoody db list` |  | read | List the databases in a directory | `sqlite.databases.list` | `hoody db list --dir /hoody/databases --timeout 30` |
| `hoody db maintenance run` |  | write | Run a maintenance operation on a database | `sqlite.databases.runMaintenance` | `hoody db maintenance run --db /hoody/databases/app.db --timeout 30 --dest-path /hoody/databases/backup.db --op wal_checkpoint_truncate` |
| `hoody db readonly query` |  | action | Execute shareable SQL query | `sqlite.sql.queryReadOnly` | `hoody db readonly query --db <db> --sql 'SELECT 1' --timeout 30` |
| `hoody db transactions run` |  | action | Execute SQL transaction | `sqlite.sql.runTransaction` | `hoody db transactions run --db /hoody/databases/app.db --create-db-if-missing --timeout 30 --transaction '[{"statement":"CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY)"}]'` |

## `hoody display` (alias: disp) — 45 commands

Display control — screenshots, input, windows, clipboard

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody display open` |  | action | Open the Display kit service in your browser |  | `hoody display open` |
| `hoody display clipboard get` |  | read | Read clipboard text | `display.clipboard.get` | `hoody display clipboard get --display-id 10 --selection clipboard` |
| `hoody display clipboard set` |  | write | Write clipboard text | `display.clipboard.set` | `hoody display clipboard set --display-id 10 --text Hello --selection clipboard` |
| `hoody display geometry get` |  | read | Get display dimensions | `display.getGeometry` | `hoody display geometry get --display-id 10` |
| `hoody display get` |  | read | Get display information and screenshots | `display.get` | `hoody display get --display-id 10` |
| `hoody display health` |  | read | Service health check | `display.kit.getHealth` | `hoody display health` |
| `hoody display input act` |  | write | Execute one action with optional screenshot | `display.input.act` | `hoody display input act --display-id 10 --action mouse/click --screenshot` |
| `hoody display input batch act` |  | write | Execute a sequence of actions | `display.input.actMany` | `hoody display input batch act --display-id 10 --actions @path.json` |
| `hoody display input click` |  | write | Move cursor and click | `display.input.click` | `hoody display input click --display-id 10 --x 10 --y 10 --button 1` |
| `hoody display input drag` |  | write | Drag from one position to another | `display.input.drag` | `hoody display input drag --display-id 10 --start-x 10 --start-y 10 --end-x 10 --end-y 10 --button 1` |
| `hoody display input reset` |  | write | Emergency release all inputs | `display.input.reset` | `hoody display input reset --display-id 10` |
| `hoody display input select` |  | write | Select a range via click + shift-click | `display.input.select` | `hoody display input select --display-id 10 --x 10 --y 10 --end-x 10 --end-y 10` |
| `hoody display input type` |  | write | Move, click, and type in one operation | `display.input.type` | `hoody display input type --display-id 10 --x 10 --y 10 --text Hello --delay 10` |
| `hoody display input wait` |  | write | Wait for a duration with optional screenshot | `display.input.wait` | `hoody display input wait --display-id 10 --ms 100 --screenshot` |
| `hoody display keyboard down` |  | write | Hold a key down | `display.keyboard.down` | `hoody display keyboard down --display-id 10 --key Shift_L --window 100` |
| `hoody display keyboard press` |  | write | Press key combinations | `display.keyboard.press` | `hoody display keyboard press --display-id 10 --keys <keys> --window 100` |
| `hoody display keyboard type` |  | write | Type a string of text | `display.keyboard.type` | `hoody display keyboard type --display-id 10 --text Hello --window 100` |
| `hoody display keyboard up` |  | write | Release a held key | `display.keyboard.up` | `hoody display keyboard up --display-id 10 --key <key> --window 100` |
| `hoody display mouse click` |  | write | Click a mouse button; Double-click a mouse button | `display.mouse.click`, `display.mouse.doubleClick` | `hoody display mouse click --double --display-id 10` |
| `hoody display mouse down` |  | write | Press and hold a mouse button | `display.mouse.down` | `hoody display mouse down --display-id 10 --button 1` |
| `hoody display mouse move` |  | write | Move the cursor to an absolute position; Move the cursor by an offset from its current position | `display.mouse.move`, `display.mouse.moveBy` | `hoody display mouse move --relative --display-id 10 --x 10 --y 10` |
| `hoody display mouse position get` |  | read | Get cursor position | `display.mouse.getPosition` | `hoody display mouse position get --display-id 10` |
| `hoody display mouse scroll` |  | write | Scroll in a direction | `display.mouse.scroll` | `hoody display mouse scroll --display-id 10 --direction up --clicks 5` |
| `hoody display mouse up` |  | write | Release a mouse button | `display.mouse.up` | `hoody display mouse up --display-id 10 --button 1` |
| `hoody display screenshots capture` |  | read | Capture a new screenshot; Capture a screenshot and return only its metadata | `display.screenshots.capture` | `hoody display screenshots capture --metadata --base64` |
| `hoody display screenshots get` |  | read | Retrieve a specific screenshot by timestamp | `display.screenshots.get` | `hoody display screenshots get 1749541160 --base64 --display-id 10` |
| `hoody display screenshots latest get` |  | read | Retrieve the most recent screenshot; Get only the metadata of the most recent screenshot | `display.screenshots.getLatest` | `hoody display screenshots latest get --metadata --base64` |
| `hoody display screenshots list` |  | read | List all available screenshots | `display.screenshots.list` | `hoody display screenshots list --display-id 10` |
| `hoody display thumbnails capture` |  | read | Capture a new screenshot thumbnail | `display.thumbnails.capture` | `hoody display thumbnails capture --base64 --display-id 10` |
| `hoody display thumbnails get` |  | read | Retrieve a specific thumbnail by timestamp | `display.thumbnails.get` | `hoody display thumbnails get 1749541160 --base64 --display-id 10` |
| `hoody display thumbnails latest get` |  | read | Retrieve the most recent thumbnail | `display.thumbnails.getLatest` | `hoody display thumbnails latest get --base64 --display-id 10` |
| `hoody display windows active get` |  | read | Get the active window ID | `display.windows.getActive` | `hoody display windows active get --display-id 10` |
| `hoody display windows close` |  | write | Close a window | `display.windows.close` | `hoody display windows close --display-id 10 --window-id 100` |
| `hoody display windows focus` |  | write | Focus/activate a window | `display.windows.focus` | `hoody display windows focus --display-id 10 --window-id 100 --sync` |
| `hoody display windows geometry get` |  | read | Get window position and size | `display.windows.getGeometry` | `hoody display windows geometry get 1 --display-id 10` |
| `hoody display windows get` |  | read | Get extended properties for a window | `display.windows.get` | `hoody display windows get 1 --display-id 10` |
| `hoody display windows list` |  | read | List windows on the current display | `display.windows.list` | `hoody display windows list --display-id 10 --only-visible` |
| `hoody display windows minimize` |  | write | Minimize a window | `display.windows.minimize` | `hoody display windows minimize --display-id 10 --window-id 100 --sync` |
| `hoody display windows move` |  | write | Move a window | `display.windows.move` | `hoody display windows move --display-id 10 --window-id 100 --x 10 --y 10 --sync` |
| `hoody display windows raise` |  | write | Raise a window to the top | `display.windows.raise` | `hoody display windows raise --display-id 10 --window-id 100` |
| `hoody display windows resize` |  | write | Resize a window | `display.windows.resize` | `hoody display windows resize --display-id 10 --window-id 100 --width 10 --height 10 --sync` |
| `hoody display windows restore` |  | write | Restore (un-minimize) a window | `display.windows.restore` | `hoody display windows restore --display-id 10 --window-id 100 --sync` |
| `hoody display windows search` |  | read | Search for windows by pattern | `display.windows.search` | `hoody display windows search --display-id 10 --pattern TODO --name` |
| `hoody display windows title get` |  | read | Get window title | `display.windows.getTitle` | `hoody display windows title get 1 --display-id 10` |
| `hoody display windows wait` |  | read | Wait for a window to appear or disappear | `display.windows.wait` | `hoody display windows wait --display-id 10 --condition window-present --pattern Firefox` |

## `hoody egress` — 6 commands

Container egress proxy — outbound HTTP/CONNECT with an optional upstream

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody egress local start` |  | action | Publish this machine's IP as the container's HTTPS proxy exit (long-running, Ctrl+C to stop) |  | `hoody egress local start` |
| `hoody egress health` |  | read | Egress service health | `egress.kit.getHealth` | `hoody egress health` |
| `hoody egress upstream disable` |  | destructive | Stop chaining through an upstream; egress goes direct | `egress.upstream.disable` | `hoody egress upstream disable` |
| `hoody egress upstream get` |  | read | Show the upstream proxy the container chains through | `egress.upstream.get` | `hoody egress upstream get` |
| `hoody egress upstream renew` |  | action | Renew the upstream lease, pushing its deadline out by its ttl from now | `egress.upstream.renewLease` | `hoody egress upstream renew --lease-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody egress upstream set` |  | action | Route the container's egress through an upstream proxy | `egress.upstream.set` | `hoody egress upstream set socks5h://user:pass@host:1080 --lease 10` |

## `hoody events` (alias: ev) — 7 commands

Events and activity logs

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody events stream` |  | read | Stream events as NDJSON, one event per line, until interrupted (--once exits after the first match) | `client.events.stream` | `hoody events stream --type 'container.*' --project-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody events clear` |  | destructive | Bulk delete events | `api.events.clear` | `hoody events clear --event-type container.creating --resource-type container -y` |
| `hoody events delete` |  | destructive | Delete a single event | `api.events.delete` | `hoody events delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody events get` |  | read | Get event details by ID | `api.events.get` | `hoody events get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody events list` |  | read | List event history | `api.events.list` | `hoody events list --limit 100 --offset 0` |
| `hoody events purge` |  | destructive | Cleanup old events | `api.events.purge` | `hoody events purge --retention-days 30 -y` |
| `hoody events stats` |  | read | Get event statistics | `api.events.getStats` | `hoody events stats --start-date 2026-01-01T00:00:00Z --end-date 2026-01-01T00:00:00Z` |

## `hoody exec` (alias: x) — 67 commands

Script execution and templates

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody exec open` |  | action | Open the page a script serves (runs the script) in your browser |  | `hoody exec open --path /my-script` |
| `hoody exec cache clear` |  | destructive | Clear Cache | `exec.cache.clear` | `hoody exec cache clear --hostname example.com --clear-vm` |
| `hoody exec health` |  | read | Health Check | `exec.kit.getHealth` | `hoody exec health` |
| `hoody exec logs clear` |  | destructive | Clear Logs | `exec.logs.clear` | `hoody exec logs clear --file /home/user/file.txt --confirm true` |
| `hoody exec logs get` |  | read | Read Log | `exec.logs.get` | `hoody exec logs get --file execution.log --lines 100 --tail` |
| `hoody exec logs list` |  | read | List Logs | `exec.logs.list` | `hoody exec logs list --limit 10` |
| `hoody exec logs search` |  | read | Search Logs | `exec.logs.search` | `hoody exec logs search --query 'my search' --limit 1000` |
| `hoody exec logs stream` |  | read | Stream Logs | `exec.logs.stream` | `hoody exec logs stream --file /home/user/file.txt --follow` |
| `hoody exec magic comments batch update` |  | write | Bulk Update Magic Comments | `exec.magicComments.updateMany` | `hoody exec magic comments batch update --directory /home/user/src --exec-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody exec magic comments get` |  | read | Read Magic Comments | `exec.magicComments.get` | `hoody exec magic comments get --path reports/report.pdf --exec-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody exec magic comments schema get` |  | read | Get Magic Comments Schema | `exec.magicComments.getSchema` | `hoody exec magic comments schema get` |
| `hoody exec magic comments update` |  | write | Update Magic Comments Handler | `exec.magicComments.update` | `hoody exec magic comments update --exec-id 64f1a2b3c4d5e6f7a8b9c0d1 --path reports/report.pdf --comments-enabled` |
| `hoody exec magic comments validate` |  | read | Validate Magic Comments | `exec.magicComments.validate` | `hoody exec magic comments validate --code <code>` |
| `hoody exec metrics` |  | read | Prometheus Export | `exec.kit.getMetrics` | `hoody exec metrics` |
| `hoody exec modules install` |  | write | Install Dependencies | `exec.modules.install` | `hoody exec modules install --modules <modules>` |
| `hoody exec modules list` |  | read | List Bundled Dependencies | `exec.modules.listBundled` | `hoody exec modules list` |
| `hoody exec modules test` |  | read | Check Dependencies | `exec.modules.test` | `hoody exec modules test --code <code>` |
| `hoody exec namespaces list` |  | read | List All Exec Ids | `exec.namespaces.list` | `hoody exec namespaces list` |
| `hoody exec openapi generate` |  | action | Generate User OpenAPI | `exec.openapi.generate` | `hoody exec openapi generate --directory scripts --subdomain my-app` |
| `hoody exec openapi get` |  | read | Serve Generated Spec | `exec.openapi.get` | `hoody exec openapi get --dir scripts --format json` |
| `hoody exec openapi merge` |  | write | Merge OpenAPI Specs | `exec.openapi.merge` | `hoody exec openapi merge --directories /home/user/src --specs @path.json` |
| `hoody exec openapi schema get` |  | read | Serve Schema File | `exec.openapi.getSchema` | `hoody exec openapi schema get --file reports/report.pdf --subdomain my-app` |
| `hoody exec openapi schema validate` |  | read | Validate User Schema | `exec.openapi.validateSchema` | `hoody exec openapi schema validate --file reports/report.pdf --subdomain my-app --exec-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody exec openapi scripts list` |  | read | List User Scripts | `exec.openapi.listScripts` | `hoody exec openapi scripts list --directory scripts --subdomain my-app` |
| `hoody exec packages compare` |  | read | Compare Packages | `exec.packages.compare` | `hoody exec packages compare` |
| `hoody exec packages install` |  | write | Install Packages | `exec.packages.install` | `hoody exec packages install --packages axios --dev` |
| `hoody exec packages manifest create` |  | write | Init package.json | `exec.packages.createManifest` | `hoody exec packages manifest create --name hoody-exec-project --version 1.0.0` |
| `hoody exec packages manifest get` |  | read | Read package.json | `exec.packages.getManifest` | `hoody exec packages manifest get` |
| `hoody exec packages manifest update` |  | write | Update package.json | `exec.packages.updateManifest` | `hoody exec packages manifest update --dependencies key=hello --scripts key=hello` |
| `hoody exec packages pin` |  | write | Pin Versions | `exec.packages.pin` | `hoody exec packages pin --packages axios` |
| `hoody exec requests list` |  | read | Get Active Requests | `exec.kit.listRequests` | `hoody exec requests list` |
| `hoody exec restart` |  | destructive | Restart Server | `exec.kit.restart` | `hoody exec restart --graceful --drain-timeout-ms 5000 -y` |
| `hoody exec routes list` |  | read | Discover Routes | `exec.routes.list` | `hoody exec routes list --include-metadata --hostname example.com` |
| `hoody exec routes resolve` |  | read | Resolve Route | `exec.routes.resolve` | `hoody exec routes resolve --path /home/user/file.txt --hostname default` |
| `hoody exec routes test` |  | read | Test Route | `exec.routes.test` | `hoody exec routes test --paths /home/user/src --hostname default` |
| `hoody exec schedules history list` |  | read | Schedule History | `exec.schedules.listHistory` | `hoody exec schedules history list --script-path reports/report.pdf --since 2026-01-01T00:00:00Z` |
| `hoody exec schedules list` |  | read | List Schedules | `exec.schedules.list` | `hoody exec schedules list` |
| `hoody exec schedules reload` |  | action | Reload Schedules | `exec.schedules.reload` | `hoody exec schedules reload --dry-run` |
| `hoody exec schedules run` |  | action | Trigger Schedule | `exec.schedules.run` | `hoody exec schedules run --script-path reports/report.pdf --force` |
| `hoody exec scripts delete` |  | destructive | Delete Script | `exec.scripts.delete` | `hoody exec scripts delete --path /home/user/file.txt --confirm true --exec-id 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody exec scripts dependencies validate` |  | read | Validate Dependencies | `exec.scripts.validateDependencies` | `hoody exec scripts dependencies validate --code <code>` |
| `hoody exec scripts list` |  | read | List scripts in the caller's scripts directory (one level; --recursive true descends) | `exec.scripts.list` | `hoody exec scripts list --metadata '{}' --label my-label` |
| `hoody exec scripts move` |  | write | Move Script | `exec.scripts.move` | `hoody exec scripts move --exec-id 64f1a2b3c4d5e6f7a8b9c0d1 --from <from> --to <to> --overwrite` |
| `hoody exec scripts read` |  | read | Read Script | `exec.scripts.read` | `hoody exec scripts read --path /home/user/file.txt --exec-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody exec scripts returns validate` |  | read | Validate Return Type | `exec.scripts.validateReturnType` | `hoody exec scripts returns validate --type-definition <type_definition> --value @path.json` |
| `hoody exec scripts stats get` |  | read | Get Script Performance | `exec.scripts.getStats` | `hoody exec scripts stats get --script-path reports/report.pdf` |
| `hoody exec scripts stats list` |  | read | List tracked scripts with their request, error and latency counters | `exec.scripts.listStats` | `hoody exec scripts stats list --limit 100 --sort lastActivity` |
| `hoody exec scripts syntax validate` |  | read | Validate Syntax | `exec.scripts.validateSyntax` | `hoody exec scripts syntax validate --code <code>` |
| `hoody exec scripts tree get` |  | read | Get Script Tree | `exec.scripts.getTree` | `hoody exec scripts tree get --exec-id 64f1a2b3c4d5e6f7a8b9c0d1 --max-depth 10` |
| `hoody exec scripts types validate` |  | read | Validate TypeScript | `exec.scripts.validateTypes` | `hoody exec scripts types validate --code <code>` |
| `hoody exec scripts validate` |  | read | Validate Script | `exec.scripts.validate` | `hoody exec scripts validate --code <code>` |
| `hoody exec scripts write` |  | write | Write Script | `exec.scripts.write` | `hoody exec scripts write --exec-id 64f1a2b3c4d5e6f7a8b9c0d1 --path /home/user/file.txt --content Hello --create-dirs` |
| `hoody exec sdks delete` |  | destructive | Delete SDK | `exec.sdks.delete` | `hoody exec sdks delete --id abc-123 -y` |
| `hoody exec sdks get` |  | read | Get SDK | `exec.sdks.get` | `hoody exec sdks get --id abc-123` |
| `hoody exec sdks import` |  | write | Import SDK | `exec.sdks.import` | `hoody exec sdks import --exec-id 64f1a2b3c4d5e6f7a8b9c0d1 --source-url https://example.com/openapi.json --source-auth-type bearer --source-auth-token <source_auth.token>` |
| `hoody exec sdks list` |  | read | List SDKs | `exec.sdks.list` | `hoody exec sdks list` |
| `hoody exec stats` |  | read | Get Stats | `exec.kit.getStats` | `hoody exec stats` |
| `hoody exec status` |  | read | Get Restart Status | `exec.kit.getStatus` | `hoody exec status` |
| `hoody exec store clear` |  | destructive | Clear Shared State | `exec.store.clear` | `hoody exec store clear --hostname example.com --path /home/user/file.txt -y` |
| `hoody exec store get` |  | read | Get Shared State | `exec.store.get` | `hoody exec store get --hostname example.com --path /home/user/file.txt` |
| `hoody exec store set` |  | write | Set Shared State | `exec.store.set` | `hoody exec store set --hostname example.com --path /home/user/file.txt --value @path.json --merge` |
| `hoody exec templates create` |  | write | Create Custom Template | `exec.templates.create` | `hoody exec templates create --name my-resource --code <code> --metadata-category custom --metadata-tags tag1,tag2` |
| `hoody exec templates delete` |  | destructive | Delete Custom Template | `exec.templates.delete` | `hoody exec templates delete --name my-resource -y` |
| `hoody exec templates generate` |  | action | Generate From Template | `exec.templates.generate` | `hoody exec templates generate --exec-id 64f1a2b3c4d5e6f7a8b9c0d1 --name my-resource --save-file` |
| `hoody exec templates list` |  | read | List Templates | `exec.templates.list` | `hoody exec templates list --category api --include-builtin` |
| `hoody exec templates preview` |  | read | Preview Template | `exec.templates.preview` | `hoody exec templates preview --name my-resource` |
| `hoody exec templates update` |  | write | Update Custom Template | `exec.templates.update` | `hoody exec templates update --name my-resource` |

## `hoody files` (aliases: f, fs) — 110 commands

File operations and remote backends

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody files open` |  | action | Open the Files kit file explorer at a folder in your browser |  | `hoody files open --path /home/user` |
| `hoody files append` |  | write | Append data to file | `files.append` | `hoody files append /home/user/file.txt --input ./local-file` |
| `hoody files archives extract` |  | write | Extract an archive (--owner sets the owner of the extracted files; the reply is then shorter); Extract an archive with an owner for the new files (answers success and message only) | `files.archives.extract`, `files.mkdir` | `hoody files archives extract /home/user/archive.zip --extract src/main.rs --owner <owner>` |
| `hoody files archives members extract` |  | write | Extract file from archive | `files.archives.extractMember` | `hoody files archives members extract /home/user/archive.zip --extract src/main.rs` |
| `hoody files archives members read` |  | read | View file from archive | `files.archives.readMember` | `hoody files archives members read /home/user/archive.zip --preview src/main.rs` |
| `hoody files archives preview` |  | read | Preview archive contents or read file | `files.archives.preview` | `hoody files archives preview /home/user/archive.zip` |
| `hoody files backends azureblob create` |  | write | Connect to azureblob backend | `files.backends.createAzureblob` | `hoody files backends azureblob create --archive-tier-delete --chunk-size 4194304` |
| `hoody files backends azurefiles create` |  | write | Connect to azurefiles backend | `files.backends.createAzurefiles` | `hoody files backends azurefiles create --chunk-size 4194304 --client-send-certificate-chain` |
| `hoody files backends b2 create` |  | write | Connect to b2 backend | `files.backends.createB2` | `hoody files backends b2 create --account acc-abc --chunk-size 100663296 --copy-cutoff 4294967296 --key <key>` |
| `hoody files backends box create` |  | write | Connect to box backend | `files.backends.createBox` | `hoody files backends box create --auth-url https://example.com/auth --box-sub-type user` |
| `hoody files backends cloudinary create` |  | write | Connect to cloudinary backend | `files.backends.createCloudinary` | `hoody files backends cloudinary create --adjust-media-files-extensions --api-key <api_key> --api-secret <api_secret> --cloud-name <cloud_name> --description 'My description'` |
| `hoody files backends delete` |  | destructive | Disconnect backend | `files.backends.delete` | `hoody files backends delete abc-123 --uploads keep` |
| `hoody files backends drive create` |  | write | Connect to drive backend | `files.backends.createDrive` | `hoody files backends drive create --acknowledge-abuse --allow-import-name-change` |
| `hoody files backends dropbox create` |  | write | Connect to dropbox backend | `files.backends.createDropbox` | `hoody files backends dropbox create --auth-url https://example.com/auth --batch-commit-timeout 600` |
| `hoody files backends fichier create` |  | write | Connect to fichier backend | `files.backends.createFichier` | `hoody files backends fichier create --cdn --description 'My description'` |
| `hoody files backends filefabric create` |  | write | Connect to filefabric backend | `files.backends.createFilefabric` | `hoody files backends filefabric create --description 'My description' --encoding 50429954 --url https://storagemadeeasy.com` |
| `hoody files backends filescom create` |  | write | Connect to filescom backend | `files.backends.createFilescom` | `hoody files backends filescom create --description 'My description' --encoding 60923906` |
| `hoody files backends ftp create` |  | write | Connect to ftp backend | `files.backends.createFtp` | `hoody files backends ftp create --allow-insecure-tls-ciphers --ask-password --host ftp.example.com` |
| `hoody files backends get` |  | read | Get backend details | `files.backends.get` | `hoody files backends get abc-123` |
| `hoody files backends gofile create` |  | write | Connect to gofile backend | `files.backends.createGofile` | `hoody files backends gofile create --description 'My description' --encoding 323331982` |
| `hoody files backends googlecloudstorage create` |  | write | Connect to google cloud storage backend | `files.backends.createGoogleCloudStorage` | `hoody files backends googlecloudstorage create --anonymous --auth-url https://example.com/auth` |
| `hoody files backends googlephotos create` |  | write | Connect to google photos backend | `files.backends.createGooglePhotos` | `hoody files backends googlephotos create --auth-url https://example.com/auth --batch-commit-timeout 600` |
| `hoody files backends hdfs create` |  | write | Connect to hdfs backend | `files.backends.createHdfs` | `hoody files backends hdfs create --description 'My description' --encoding 50430082 --namenode namenode-1:8020,namenode-2:8020` |
| `hoody files backends hidrive create` |  | write | Connect to hidrive backend | `files.backends.createHidrive` | `hoody files backends hidrive create --auth-url https://example.com/auth --chunk-size 50331648` |
| `hoody files backends http create` |  | write | Connect to http backend | `files.backends.createHttp` | `hoody files backends http create --description 'My description' --headers '{}' --url https://example.com` |
| `hoody files backends iclouddrive create` |  | write | Connect to iclouddrive backend | `files.backends.createIclouddrive` | `hoody files backends iclouddrive create --apple-id abc-123 --client-id d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d --description 'My description' --password <password>` |
| `hoody files backends imagekit create` |  | write | Connect to imagekit backend | `files.backends.createImagekit` | `hoody files backends imagekit create --description 'My description' --encoding 117553486 --endpoint https://example.com --private-key <private_key> --public-key pk_abc123` |
| `hoody files backends internetarchive create` |  | write | Connect to internetarchive backend | `files.backends.createInternetarchive` | `hoody files backends internetarchive create --description 'My description' --disable-checksum` |
| `hoody files backends jottacloud create` |  | write | Connect to jottacloud backend | `files.backends.createJottacloud` | `hoody files backends jottacloud create --auth-url https://example.com/auth --client-credentials` |
| `hoody files backends koofr create` |  | write | Connect to koofr backend | `files.backends.createKoofr` | `hoody files backends koofr create --description 'My description' --encoding 50438146 --endpoint https://example.com --password <password> --user alice` |
| `hoody files backends linkbox create` |  | write | Connect to linkbox backend | `files.backends.createLinkbox` | `hoody files backends linkbox create --description 'My description' --email user@example.com --password <password> --token <token>` |
| `hoody files backends list` |  | read | List all backends | `files.backends.list` | `hoody files backends list` |
| `hoody files backends mailru create` |  | write | Connect to mailru backend | `files.backends.createMailru` | `hoody files backends mailru create --auth-url https://example.com/auth --check-hash --pass <pass> --user alice` |
| `hoody files backends mega create` |  | write | Connect to mega backend | `files.backends.createMega` | `hoody files backends mega create --debug --description 'My description' --pass <pass> --user alice` |
| `hoody files backends netstorage create` |  | write | Connect to netstorage backend | `files.backends.createNetstorage` | `hoody files backends netstorage create --account acc-abc --description 'My description' --host example.com --protocol http --secret <secret>` |
| `hoody files backends onedrive create` |  | write | Connect to onedrive backend | `files.backends.createOnedrive` | `hoody files backends onedrive create --access-scopes 'Files.Read Files.ReadWrite Files.Read.All Files.ReadWrite.All Sites.Read.All offline_access' --auth-url https://example.com/auth` |
| `hoody files backends opendrive create` |  | write | Connect to opendrive backend | `files.backends.createOpendrive` | `hoody files backends opendrive create --access private --chunk-size 10485760 --password <password> --username alice` |
| `hoody files backends oracleobjectstorage create` |  | write | Connect to oracleobjectstorage backend | `files.backends.createOracleobjectstorage` | `hoody files backends oracleobjectstorage create --attempt-resume-upload --chunk-size 5242880 --namespace <namespace> --provider no_auth --region eu-west-1` |
| `hoody files backends pcloud create` |  | write | Connect to pcloud backend | `files.backends.createPcloud` | `hoody files backends pcloud create --auth-url https://example.com/auth --client-credentials` |
| `hoody files backends pikpak create` |  | write | Connect to pikpak backend | `files.backends.createPikpak` | `hoody files backends pikpak create --chunk-size 5242880 --description 'My description'` |
| `hoody files backends pixeldrain create` |  | write | Connect to pixeldrain backend | `files.backends.createPixeldrain` | `hoody files backends pixeldrain create --api-url https://pixeldrain.com/api --description 'My description'` |
| `hoody files backends premiumizeme create` |  | write | Connect to premiumizeme backend | `files.backends.createPremiumizeme` | `hoody files backends premiumizeme create --auth-url https://example.com/auth --client-credentials` |
| `hoody files backends protondrive create` |  | write | Connect to protondrive backend | `files.backends.createProtondrive` | `hoody files backends protondrive create --description 'My description' --enable-caching` |
| `hoody files backends putio create` |  | write | Connect to putio backend | `files.backends.createPutio` | `hoody files backends putio create --auth-url https://example.com/auth --client-credentials` |
| `hoody files backends qingstor create` |  | write | Connect to qingstor backend | `files.backends.createQingstor` | `hoody files backends qingstor create --chunk-size 4194304 --connection-retries 3` |
| `hoody files backends quatrix create` |  | write | Connect to quatrix backend | `files.backends.createQuatrix` | `hoody files backends quatrix create --api-key <api_key> --description 'My description' --effective-upload-time 4s --host example.com` |
| `hoody files backends s3 create` |  | write | Connect to s3 backend | `files.backends.createS3` | `hoody files backends s3 create --bucket-object-lock-enabled --bypass-governance-retention` |
| `hoody files backends seafile create` |  | write | Connect to seafile backend | `files.backends.createSeafile` | `hoody files backends seafile create --2fa --create-library --url https://cloud.seafile.com/` |
| `hoody files backends sftp create` |  | write | Connect to sftp backend | `files.backends.createSftp` | `hoody files backends sftp create --ask-password --chunk-size 32768 --host example.com --user user` |
| `hoody files backends sharefile create` |  | write | Connect to sharefile backend | `files.backends.createSharefile` | `hoody files backends sharefile create --auth-url https://example.com/auth --chunk-size 67108864` |
| `hoody files backends sia create` |  | write | Connect to sia backend | `files.backends.createSia` | `hoody files backends sia create --api-url https://example.com --description 'My description' --encoding 50436354` |
| `hoody files backends smb create` |  | write | Connect to smb backend | `files.backends.createSmb` | `hoody files backends smb create --case-insensitive --description 'My description' --host example.com` |
| `hoody files backends sugarsync create` |  | write | Connect to sugarsync backend | `files.backends.createSugarsync` | `hoody files backends sugarsync create --description 'My description' --encoding 50397186` |
| `hoody files backends swift create` |  | write | Connect to swift backend | `files.backends.createSwift` | `hoody files backends swift create --auth https://auth.api.rackspacecloud.com/v1.0 --auth-version 0` |
| `hoody files backends test` |  | read | Test backend connection | `files.backends.test` | `hoody files backends test abc-123` |
| `hoody files backends ulozto create` |  | write | Connect to ulozto backend | `files.backends.createUlozto` | `hoody files backends ulozto create --description 'My description' --encoding 50438146` |
| `hoody files backends update` |  | write | Update backend credentials | `files.backends.update` | `hoody files backends update abc-123 --body '{}'` |
| `hoody files backends webdav create` |  | write | Connect to webdav backend | `files.backends.createWebdav` | `hoody files backends webdav create --auth-redirect --description 'My description' --url https://example.com` |
| `hoody files backends yandex create` |  | write | Connect to yandex backend | `files.backends.createYandex` | `hoody files backends yandex create --auth-url https://example.com/auth --client-credentials` |
| `hoody files backends zoho create` |  | write | Connect to zoho backend | `files.backends.createZoho` | `hoody files backends zoho create --auth-url https://example.com/auth --client-credentials` |
| `hoody files chmod` |  | write | Change file permissions | `files.chmod` | `hoody files chmod /home/user/file.txt --chmod 755` |
| `hoody files chown` |  | write | Change file ownership | `files.chown` | `hoody files chown /home/user/file.txt --chown user:group` |
| `hoody files chunks write` |  | write | Append bytes to an existing file (no creation, no offsets); `files upload --append` creates a missing file | `files.writeChunk` | `hoody files chunks write /home/user/file.txt --input ./local-file` |
| `hoody files copy` |  | write | Copy file or directory | `files.copy` | `hoody files copy /home/user/file.txt --copy-to <copy_to> --overwrite true` |
| `hoody files delete` |  | destructive | Delete file or directory | `files.delete` | `hoody files delete /home/user/file.txt -y` |
| `hoody files downloads cancel` |  | action | Cancel a running download | `files.downloads.cancel` | `hoody files downloads cancel 3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| `hoody files downloads create` |  | write | Download a file from a URL into a directory (--owner sets the owner of the new file; the reply is then shorter); Download a file from a URL with an owner for the new file (answers success and message only) | `files.downloads.create`, `files.mkdir` | `hoody files downloads create /home/user/src --download <download_from> --timeout 10 --owner <owner>` |
| `hoody files downloads history list` |  | read | Download history | `files.downloads.listHistory` | `hoody files downloads history list` |
| `hoody files downloads list` |  | read | List all active downloads; List active downloads of a directory | `files.downloads.list`, `files.downloads.listByDirectory` | `hoody files downloads list` |
| `hoody files exists` |  | read | Get file metadata | `files.exists` | `hoody files exists /home/user/file.txt --history` |
| `hoody files extractions cancel` |  | action | Cancel a running extraction | `files.extractions.cancel` | `hoody files extractions cancel 3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| `hoody files extractions history list` |  | read | Extraction history | `files.extractions.listHistory` | `hoody files extractions history list` |
| `hoody files extractions list` |  | read | List active extractions | `files.extractions.list` | `hoody files extractions list` |
| `hoody files ftp get` |  | read | Access file via FTP | `files.ftp.get` | `hoody files ftp get /home/user/file.txt --type ftp --server ftp.example.com:21 --user anonymous --ftp-secure` |
| `hoody files get` |  | read | List directory or download file | `files.get` | `hoody files get /home/user/file.txt --hash --size 800x600` |
| `hoody files glob` |  | read | Find files by glob pattern | `files.glob` | `hoody files glob /home/user/src --pattern '*.ts' --max-results 1000 --max-depth 50` |
| `hoody files grep` |  | read | Search file contents (grep) | `files.grep` | `hoody files grep /home/user/file.txt --pattern TODO --ignore-case --fixed-string` |
| `hoody files health` |  | read | Service health check | `files.kit.getHealth` | `hoody files health` |
| `hoody files images convert` |  | read | Process and convert images | `files.images.convert` | `hoody files images convert img-abc --format jpeg --size 800x600` |
| `hoody files journal flush` |  | write | Flush journal to disk | `files.journal.flush` | `hoody files journal flush` |
| `hoody files journal list` |  | read | Query journal entries | `files.journal.list` | `hoody files journal list --path /home/user/file.txt --op write,delete` |
| `hoody files journal stats` |  | read | Get journal statistics | `files.journal.getStats` | `hoody files journal stats` |
| `hoody files mkdir` |  | write | Create a directory (--backend creates it on a remote backend, --owner sets its owner) | `files.mkdir` | `hoody files mkdir /home/user/file.txt` |
| `hoody files mounts create` |  | write | Create persistent FUSE mount | `files.mounts.create` | `hoody files mounts create --auto-deliver --backend-id abc-123 --label my-label` |
| `hoody files mounts delete` |  | destructive | Unmount filesystem | `files.mounts.delete` | `hoody files mounts delete abc-123 --uploads keep --wait-seconds 120` |
| `hoody files mounts get` |  | read | Get mount details | `files.mounts.get` | `hoody files mounts get abc-123` |
| `hoody files mounts list` |  | read | List all mounts | `files.mounts.list` | `hoody files mounts list --label my-label` |
| `hoody files mounts update` |  | write | Change a mount's VFS settings or its saved auto-deliver flag (currently has no effect) | `files.mounts.update` | `hoody files mounts update abc-123 --switch wait --auto-deliver` |
| `hoody files move` |  | write | Move file or directory | `files.move` | `hoody files move /home/user/file.txt --move-to <move_to>` |
| `hoody files realpath` |  | read | Resolve canonical path (realpath) | `files.realpath` | `hoody files realpath /home/user/file.txt` |
| `hoody files s3 get` |  | read | Access file from S3 | `files.s3.get` | `hoody files s3 get /home/user/file.txt --type s3 --server s3.amazonaws.com --s3-bucket <s3_bucket> --s3-region us-east-1 --user alice` |
| `hoody files search` |  | read | Search directory | `files.search` | `hoody files search /home/user/src --q <q> --json --theme oc-1` |
| `hoody files ssh get` |  | read | Access file via SSH/SFTP | `files.ssh.get` | `hoody files ssh get /home/user/file.txt --type ssh --server nas.local:22 --user alice` |
| `hoody files ssh upload` |  | write | Upload file via SSH/SFTP | `files.ssh.upload` | `hoody files ssh upload /home/user/file.txt --server nas.local:22 --user alice --input ./local-file` |
| `hoody files stat` |  | read | Get file metadata (stat) | `files.stat` | `hoody files stat /home/user/file.txt` |
| `hoody files touch` |  | write | Touch file (create or update mtime) | `files.touch` | `hoody files touch /home/user/file.txt` |
| `hoody files update` |  | write | Modify file properties or move/rename | `files.update` | `hoody files update /home/user/file.txt --body '{"move_to":"/new/dir/file.txt"}'` |
| `hoody files upload` |  | write | Upload or append file | `files.upload` | `hoody files upload /home/user/file.txt --append --input ./local-file` |
| `hoody files uploads delete` |  | destructive | Delete every held file of a pending upload. They are the only copy of those changes; the backend is not touched | `files.uploads.delete` | `hoody files uploads delete abc-123 -y` |
| `hoody files uploads deliver` |  | write | Upload held files of a pending upload to a backend, overwriting newer versions there. Without --paths or --paths-b64, every complete file is delivered | `files.uploads.deliver` | `hoody files uploads deliver abc-123 --paths /home/user/src -y` |
| `hoody files uploads download` |  | read | Write the held copy of one file of a pending upload, byte for byte; save it with --out-file &lt;path&gt;. Name it with exactly one of --path or --path-b64, as listed | `files.uploads.download` | `hoody files uploads download abc-123 --path /home/user/file.txt` |
| `hoody files uploads files list` |  | read | List the files of a pending upload, one page at a time. When more follow, -o json shows next_cursor; pass it to --cursor | `files.uploads.listFiles` | `hoody files uploads files list abc-123 --limit 1000` |
| `hoody files uploads list` |  | read | List pending uploads: unsent upload data held after a crash or stop, or still uploading | `files.uploads.list` | `hoody files uploads list` |
| `hoody files uploads stop` |  | action | Stop the uploads or the delivery of a pending upload and keep its unsent files. Nothing is lost | `files.uploads.stop` | `hoody files uploads stop abc-123` |
| `hoody files uploads unreadable delete` |  | destructive | Delete an unreadable pending-upload record and every file it kept on the server. What it held cannot be known; the backend is not touched | `files.uploads.deleteUnreadable` | `hoody files uploads unreadable delete abc-123 -y` |
| `hoody files uploads unreadable list` |  | read | List the stored records of unsent files that cannot be read. While one exists, a mount or backend delete cannot confirm that nothing was left unsent | `files.uploads.listUnreadable` | `hoody files uploads unreadable list` |
| `hoody files version` |  | read | Get API version | `files.kit.getVersion` | `hoody files version` |
| `hoody files webdav get` |  | read | Access file via WebDAV | `files.webdav.get` | `hoody files webdav get /home/user/file.txt --type webdav --server cloud.nextcloud.com --user alice --webdav-path /` |
| `hoody files whoami` |  | read | Show the user your credentials authenticate as | `files.whoami` | `hoody files whoami /home/user/file.txt` |
| `hoody files zip` |  | read | Download directory as ZIP | `files.zip` | `hoody files zip /home/user/src` |

## `hoody firewall` (alias: fw) — 10 commands

Container firewall rules — ingress (inbound) and egress (outbound)

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody firewall egress create` |  | write | Add Egress Rule | `api.firewall.createEgressRule` | `hoody firewall egress create --action allow --protocol tcp --description 'My description' --destination 192.0.2.0/24 --state enabled` |
| `hoody firewall egress delete` |  | destructive | Remove Egress Rule(s) | `api.firewall.deleteEgressRule` | `hoody firewall egress delete --all --action allow -y` |
| `hoody firewall egress disable` |  | action | Disable an egress firewall rule | `api.firewall.disableEgressRule` | `hoody firewall egress disable --action allow --protocol tcp` |
| `hoody firewall egress enable` |  | action | Enable an egress firewall rule | `api.firewall.enableEgressRule` | `hoody firewall egress enable --action allow --protocol tcp` |
| `hoody firewall ingress create` |  | write | Add Ingress Rule | `api.firewall.createIngressRule` | `hoody firewall ingress create --action allow --protocol tcp --description 'My description' --source 192.0.2.0/24 --state enabled` |
| `hoody firewall ingress delete` |  | destructive | Remove Ingress Rule(s) | `api.firewall.deleteIngressRule` | `hoody firewall ingress delete --all --action allow -y` |
| `hoody firewall ingress disable` |  | action | Disable an ingress firewall rule | `api.firewall.disableIngressRule` | `hoody firewall ingress disable --action allow --protocol tcp` |
| `hoody firewall ingress enable` |  | action | Enable an ingress firewall rule | `api.firewall.enableIngressRule` | `hoody firewall ingress enable --action allow --protocol tcp` |
| `hoody firewall reset` |  | destructive | Reset container firewall | `api.firewall.reset` | `hoody --container abc-123 firewall reset -y` |
| `hoody firewall rules list` |  | read | List container firewall rules | `api.firewall.listRules` | `hoody --container abc-123 firewall rules list` |

## `hoody images` (alias: img) — 6 commands

Container image marketplace (browse, purchase, rate, import, icons)

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody images buy` |  | write | Purchase image | `api.images.buy` | `hoody images buy 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody images get` |  | read | Get public image details | `api.images.getPublic` | `hoody images get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody images icon get` |  | read | Get image icon | `api.images.getIcon` | `hoody images icon get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody images import` |  | write | Import free image | `api.images.import` | `hoody images import 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody images list` |  | read | List public images; List your own images | `api.images.listPublic`, `api.images.list` | `hoody images list --mine --os debian` |
| `hoody images rate` |  | write | Rate image | `api.images.rate` | `hoody images rate 64f1a2b3c4d5e6f7a8b9c0d1 --rating 5` |

## `hoody inbox` — 4 commands

Platform account notification inbox

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody inbox announcements list` |  | read | Get all public notifications | `api.inbox.listAnnouncements` | `hoody inbox announcements list` |
| `hoody inbox list` |  | read | Get all notifications for the authenticated user | `api.inbox.list` | `hoody inbox list --limit 20 --unread-only` |
| `hoody inbox mark read` |  | write | Mark a notification as read; Mark every notification as read | `api.inbox.markRead`, `api.inbox.markAllRead` | `hoody inbox mark read 64f1a2b3c4d5e6f7a8b9c0d1 --all` |
| `hoody inbox summary` |  | read | Show the unread notification count and newest position | `api.inbox.getSummary` | `hoody inbox summary` |

## `hoody ip` — 1 command

IP address management

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody ip get` |  | read | Get IP Information | `api.ip.get` | `hoody ip get` |

## `hoody kv` — 25 commands

Key-value store

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody kv open` |  | action | Open the SQLite kit studio in your browser (key-value store: --view kvStore) |  | `hoody kv open` |
| `hoody kv arrays pop` |  | write | Remove from array end | `sqlite.kv.pop` | `hoody kv arrays pop <key> --db <db> --table kv_store --path .items` |
| `hoody kv arrays push` |  | write | Append to array | `sqlite.kv.push` | `hoody kv arrays push tags --db /hoody/databases/app.db --table kv_store --path .user.achievements --body '{}'` |
| `hoody kv arrays remove` |  | destructive | Remove array element | `sqlite.kv.remove` | `hoody kv arrays remove <key> --db <db> --table kv_store --path .items -y` |
| `hoody kv batch delete` |  | write | Batch delete multiple keys | `sqlite.kv.deleteMany` | `hoody kv batch delete --db <db> --table kv_store --history --keys <keys>` |
| `hoody kv batch get` |  | read | Batch get multiple keys | `sqlite.kv.getMany` | `hoody kv batch get --db /hoody/databases/app.db --table kv_store --timeout 30 --keys <keys>` |
| `hoody kv batch set` |  | write | Batch set multiple keys | `sqlite.kv.setMany` | `hoody kv batch set --db <db> --table kv_store --history --items '[{"key":"<key>"}]'` |
| `hoody kv changes list` |  | read | List the changes made to a KV table | `sqlite.kv.listChanges` | `hoody kv changes list --db <db> --table kv_store --since 2026-01-01T00:00:00Z` |
| `hoody kv changes stream` |  | read | Stream the changes made to a KV table live | `sqlite.kv.streamChanges` | `hoody kv changes stream --db <db> --table kv_store --since 2026-01-01T00:00:00Z` |
| `hoody kv decrement` |  | write | Atomic decrement | `sqlite.kv.decrement` | `hoody kv decrement <key> --db <db> --table kv_store --delta 1` |
| `hoody kv delete` |  | destructive | Delete key | `sqlite.kv.delete` | `hoody kv delete <key> --db <db> --table kv_store --history -y` |
| `hoody kv entry get` |  | read | Show a key's value with its metadata (content type, ETag, timestamps, expiry) | `sqlite.kv.getEntry` | `hoody kv entry get user:123 --db /hoody/databases/app.db --table kv_store --timeout 30` |
| `hoody kv exists` |  | read | Check if key exists | `sqlite.kv.exists` | `hoody kv exists <key> --db <db> --table kv_store --timeout 30` |
| `hoody kv get` |  | read | Get value by key | `sqlite.kv.get` | `hoody kv get user:123 --db /hoody/databases/app.db --table kv_store --at-timestamp 1698765432` |
| `hoody kv history list` |  | read | Get key operation history | `sqlite.kv.listHistory` | `hoody kv history list <key> --db <db> --table kv_store --limit 50` |
| `hoody kv increment` |  | write | Atomic increment | `sqlite.kv.increment` | `hoody kv increment counter --db /hoody/databases/app.db --table kv_store --delta 1` |
| `hoody kv list` |  | read | List keys | `sqlite.kv.list` | `hoody kv list --db /hoody/databases/app.db --table kv_store --prefix user:` |
| `hoody kv rollback` |  | write | Rollback key operations | `sqlite.kv.rollback` | `hoody kv rollback <key> --db <db> --table kv_store --steps 1` |
| `hoody kv set` |  | write | Set value for key | `sqlite.kv.set` | `hoody kv set user:123 --db /hoody/databases/app.db --table kv_store --path .profile.theme --body '{}'` |
| `hoody kv snapshots get` |  | read | Get key snapshot at operation | `sqlite.kv.getSnapshot` | `hoody kv snapshots get <key> --db <db> --table kv_store --op-number 10 --timeout 30` |
| `hoody kv table rollback` |  | write | Rollback entire table | `sqlite.kv.rollbackTable` | `hoody kv table rollback --db <db> --table kv_store --to-timestamp 1750000000 --dry-run` |
| `hoody kv table snapshots compare` |  | read | Compare table snapshots | `sqlite.kv.compareTableSnapshots` | `hoody kv table snapshots compare --db <db> --table kv_store --from 1750000000 --to 1750000000 --timeout 30` |
| `hoody kv table snapshots get` |  | read | Get table snapshot at timestamp | `sqlite.kv.getTableSnapshot` | `hoody kv table snapshots get --db <db> --table kv_store --timestamp 1750000000 --limit 100` |
| `hoody kv ttl clear` |  | write | Remove a key's time to live so it never expires | `sqlite.kv.clearTtl` | `hoody kv ttl clear session:abc --db /hoody/databases/app.db --table kv_store --history` |
| `hoody kv ttl set` |  | write | Set a key's time to live | `sqlite.kv.setTtl` | `hoody kv ttl set session:abc --db /hoody/databases/app.db --table kv_store --ttl 3600 --history` |

## `hoody meta` (alias: m) — 4 commands

API metadata and signing keys

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody meta config get` |  | read | Get the Hoody public configuration map |  | `hoody meta config get` |
| `hoody meta config values get` |  | read | Get one public configuration value |  | `hoody meta config values get <key>` |
| `hoody meta key get` |  | read | Get Hoody API Signing Public Key | `api.meta.getPublicKey` | `hoody meta key get` |
| `hoody meta social stats` |  | read | Show public Hoody social channel counters |  | `hoody meta social stats` |

## `hoody network` (alias: net) — 5 commands

Container network configuration

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody network delete` |  | destructive | Remove container network configuration | `api.network.delete` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 network delete -y` |
| `hoody network get` |  | read | Get container network configuration | `api.network.get` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 network get` |
| `hoody network start` |  | action | Start container network proxy/blocking | `api.network.start` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 network start` |
| `hoody network stop` |  | action | Stop container network proxy/blocking | `api.network.stop` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 network stop -y` |
| `hoody network update` |  | write | Update container network configuration | `api.network.update` | `hoody network update --type socks5 --proxy socks5://proxy.example.com:1080 --region eu-west-1` |

## `hoody notes` — 54 commands

Hoody Notes — notebooks, nodes, documents, comments, versions, and databases

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody notes open` |  | action | Open the Notes kit in your browser |  | `hoody notes open` |
| `hoody notes avatars download` |  | read | Download an avatar image by id | `notes.avatars.download` | `hoody notes avatars download --avatar-id abc-123` |
| `hoody notes avatars upload` |  | write | Upload an avatar image and get its id (JPEG, PNG or WebP; resized to 500x500) | `notes.avatars.upload` | `hoody notes avatars upload --input ./local-file` |
| `hoody notes collaborators add` |  | write | Add a collaborator to a node | `notes.collaborators.add` | `hoody notes collaborators add --notebook-id abc-123 --node-id 1 --collaborator-id abc-123 --role admin` |
| `hoody notes collaborators list` |  | read | List collaborators on a node | `notes.collaborators.list` | `hoody notes collaborators list --notebook-id abc-123 --node-id 1` |
| `hoody notes collaborators remove` |  | destructive | Remove a collaborator from a node | `notes.collaborators.remove` | `hoody notes collaborators remove --notebook-id abc-123 --node-id 1 --collaborator-id abc-123` |
| `hoody notes collaborators role set` |  | write | Update a collaborator's role on a node | `notes.collaborators.setRole` | `hoody notes collaborators role set --notebook-id abc-123 --node-id 1 --collaborator-id abc-123 --role admin` |
| `hoody notes comments anchor set` |  | write | Move a comment thread to a new anchor in the document | `notes.comments.setAnchor` | `hoody notes comments anchor set --notebook-id abc-123 --node-id 1 --comment-id abc-123 --anchor-type document --expected-version 10` |
| `hoody notes comments anchors list` |  | read | List comment anchors (the inline document positions threads are pinned to) | `notes.comments.listAnchors` | `hoody notes comments anchors list --limit 500 --offset 0 --notebook-id abc-123 --node-id 1` |
| `hoody notes comments create` |  | write | Create a new comment (optionally anchored to a document location) | `notes.comments.create` | `hoody notes comments create --notebook-id abc-123 --node-id 1 --content Hello` |
| `hoody notes comments delete` |  | destructive | Delete a comment | `notes.comments.delete` | `hoody notes comments delete --expected-version 10 --notebook-id abc-123 --node-id 1 --comment-id abc-123` |
| `hoody notes comments list` |  | read | List comments on a node | `notes.comments.list` | `hoody notes comments list --limit 100 --offset 0 --notebook-id abc-123 --node-id 1` |
| `hoody notes comments resolve` |  | action | Mark a comment thread resolved | `notes.comments.resolve` | `hoody notes comments resolve --notebook-id abc-123 --node-id 1 --comment-id abc-123 --expected-version 10` |
| `hoody notes comments update` |  | write | Edit a comment's body | `notes.comments.update` | `hoody notes comments update --notebook-id abc-123 --node-id 1 --comment-id abc-123 --content Hello --expected-version 10` |
| `hoody notes document append` |  | write | Append blocks to the end of a node's document (creates the document if absent) | `notes.document.append` | `hoody notes document append --notebook-id abc-123 --node-id 1 --body '{"text":"Hello"}'` |
| `hoody notes document blocks export` |  | read | Render a drawing block from a node's document as SVG | `notes.document.exportBlock` | `hoody notes document blocks export --scale 10 --notebook-id abc-123 --node-id 1 --block-id abc-123` |
| `hoody notes document get` |  | read | Get document content for a node (rich-text body) | `notes.document.get` | `hoody notes document get --lines 100 --output json --notebook-id abc-123 --node-id 1` |
| `hoody notes document set` |  | write | Create or replace a node's document content (full overwrite) | `notes.document.set` | `hoody notes document set --notebook-id abc-123 --node-id 1 --content key=hello` |
| `hoody notes document tickets create` |  | action | Mint a single-use ticket for an HTML export of a node's document | `notes.document.createExportTicket` | `hoody notes document tickets create --notebook-id abc-123 --node-id 1 --include-comments none --include-background` |
| `hoody notes document update` |  | write | Merge changes into a node's document content | `notes.document.update` | `hoody notes document update --notebook-id abc-123 --node-id 1 --content key=hello` |
| `hoody notes files download` |  | read | Download a file attachment by id | `notes.files.download` | `hoody notes files download --notebook-id abc-123 --file-id abc-123` |
| `hoody notes files list` |  | read | List file attachments in a notebook | `notes.files.list` | `hoody notes files list --limit 50 --offset 0 --notebook-id abc-123` |
| `hoody notes health` |  | read | Show Notes service health and runtime info | `notes.kit.getHealth` | `hoody notes health` |
| `hoody notes members invite` |  | write | Invite users to a notebook by username and assign their role | `notes.members.invite` | `hoody notes members invite --notebook-id abc-123 --users username=alice,role=owner` |
| `hoody notes members role set` |  | write | Update a user's role on a notebook (owner/admin/collaborator/guest/none) | `notes.members.setRole` | `hoody notes members role set --notebook-id abc-123 --user-id abc-123 --role owner` |
| `hoody notes nodes children list` |  | read | List immediate child nodes of a node | `notes.nodes.listChildren` | `hoody notes nodes children list --limit 50 --offset 0 --notebook-id abc-123 --node-id 1` |
| `hoody notes nodes create` |  | write | Create a node inside a notebook (type: page/folder/database/etc.) | `notes.nodes.create` | `hoody notes nodes create --notebook-id abc-123 --type <type> --attributes key=hello` |
| `hoody notes nodes delete` |  | destructive | Delete a node and its descendants | `notes.nodes.delete` | `hoody notes nodes delete --notebook-id abc-123 --node-id 1` |
| `hoody notes nodes get` |  | read | Get a node by id | `notes.nodes.get` | `hoody notes nodes get --notebook-id abc-123 --node-id 1` |
| `hoody notes nodes list` |  | read | List nodes in a notebook (pages, folders, databases) | `notes.nodes.list` | `hoody notes nodes list --limit 50 --offset 0 --notebook-id abc-123` |
| `hoody notes nodes mark opened` |  | action | Record that the current user has opened a node | `notes.nodes.markOpened` | `hoody notes nodes mark opened --notebook-id abc-123 --node-id 1` |
| `hoody notes nodes mark seen` |  | action | Record that the current user has seen a node | `notes.nodes.markSeen` | `hoody notes nodes mark seen --notebook-id abc-123 --node-id 1` |
| `hoody notes nodes resolve` |  | read | Resolve a page-style node by its URL alias (slug) | `notes.nodes.resolve` | `hoody notes nodes resolve --notebook-id abc-123 --alias my-resource` |
| `hoody notes nodes update` |  | write | Update a node (rename, move, change attributes) | `notes.nodes.update` | `hoody notes nodes update --notebook-id abc-123 --node-id 1 --attributes key=hello` |
| `hoody notes notebooks create` |  | write | Create a new notebook (top-level workspace) | `notes.notebooks.create` | `hoody notes notebooks create --name my-resource --description 'My description' --avatar https://example.com/avatar.png` |
| `hoody notes notebooks delete` |  | destructive | Delete a notebook (irreversible — deletes all nodes/documents/comments inside) | `notes.notebooks.delete` | `hoody notes notebooks delete --notebook-id abc-123` |
| `hoody notes notebooks get` |  | read | Get notebook details | `notes.notebooks.get` | `hoody notes notebooks get --notebook-id abc-123` |
| `hoody notes notebooks list` |  | read | List notebooks the current user has access to | `notes.notebooks.list` | `hoody notes notebooks list` |
| `hoody notes notebooks update` |  | write | Update notebook settings (name, description, avatar) | `notes.notebooks.update` | `hoody notes notebooks update --notebook-id abc-123 --name my-resource --description 'My description' --avatar https://example.com/avatar.png` |
| `hoody notes reactions add` |  | write | Add an emoji reaction to a node | `notes.reactions.add` | `hoody notes reactions add --notebook-id abc-123 --node-id 1 --reaction <reaction>` |
| `hoody notes reactions list` |  | read | List reactions on a node | `notes.reactions.list` | `hoody notes reactions list --notebook-id abc-123 --node-id 1` |
| `hoody notes reactions remove` |  | destructive | Remove an emoji reaction from a node | `notes.reactions.remove` | `hoody notes reactions remove --notebook-id abc-123 --node-id 1 --reaction <reaction>` |
| `hoody notes records create` |  | write | Create a new record in a database node | `notes.records.create` | `hoody notes records create --notebook-id abc-123 --database-id abc-123 --name Untitled --avatar https://example.com/avatar.png` |
| `hoody notes records delete` |  | destructive | Delete a database record | `notes.records.delete` | `hoody notes records delete --notebook-id abc-123 --database-id abc-123 --record-id abc-123` |
| `hoody notes records get` |  | read | Get a database record by id | `notes.records.get` | `hoody notes records get --notebook-id abc-123 --database-id abc-123 --record-id abc-123` |
| `hoody notes records list` |  | read | List records in a database node | `notes.records.list` | `hoody notes records list --page 1 --count 50 --notebook-id abc-123 --database-id abc-123` |
| `hoody notes records search` |  | read | Search records in a database node | `notes.records.search` | `hoody notes records search --exclude '*.ts' --notebook-id abc-123 --database-id abc-123` |
| `hoody notes records update` |  | write | Update a database record's fields | `notes.records.update` | `hoody notes records update --notebook-id abc-123 --database-id abc-123 --record-id abc-123 --name my-resource --avatar https://example.com/avatar.png` |
| `hoody notes versions create` |  | write | Create a new document version snapshot (point-in-time backup) | `notes.versions.create` | `hoody notes versions create --notebook-id abc-123 --node-id 1` |
| `hoody notes versions delete` |  | destructive | Delete a document version snapshot | `notes.versions.delete` | `hoody notes versions delete --notebook-id abc-123 --node-id 1 --version-id abc-123 -y` |
| `hoody notes versions get` |  | read | Get a specific document version's content | `notes.versions.get` | `hoody notes versions get --notebook-id abc-123 --node-id 1 --version-id abc-123` |
| `hoody notes versions list` |  | read | List document version snapshots for a node | `notes.versions.list` | `hoody notes versions list --limit 20 --offset 0 --notebook-id abc-123 --node-id 1` |
| `hoody notes versions restore` |  | action | Restore a document to a previous version (replaces current content) | `notes.versions.restore` | `hoody notes versions restore --notebook-id abc-123 --node-id 1 --version-id abc-123` |
| `hoody notes whoami` |  | read | Get current Notes identity (user id, username, role, default notebook id) | `notes.whoami` | `hoody notes whoami` |

## `hoody notifications` (alias: notif) — 9 commands

Notifications

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody notifications open` |  | action | Open the Notifications kit service in your browser |  | `hoody notifications open` |
| `hoody notifications dismiss` |  | write | Dismiss notifications | `notifications.dismiss` | `hoody notifications dismiss --display-id 1 --notification-ids 10` |
| `hoody notifications health` |  | read | Service health check | `notifications.kit.getHealth` | `hoody notifications health` |
| `hoody notifications icons get` |  | read | Get notification icon | `notifications.icons.get` | `hoody notifications icons get 6_10_1749024932903.png --if-none-match 'W/"1a2b-5f3c"'` |
| `hoody notifications list` |  | read | Get notifications for specified display(s) | `notifications.list` | `hoody notifications list 1 --limit 100 --since 1672531200000` |
| `hoody notifications metrics` |  | read | Prometheus-compatible metrics endpoint | `notifications.kit.getMetrics` | `hoody notifications metrics` |
| `hoody notifications restore` |  | destructive | Clear dismissed notifications | `notifications.restore` | `hoody notifications restore --display-id 1` |
| `hoody notifications send` |  | write | Trigger a new desktop notification | `notifications.send` | `hoody notifications send --body 'This is a test message from the API.' --category test-api --display 1 --summary 'Test Notification'` |
| `hoody notifications stream` |  | read | Follow new notifications as they arrive (Server-Sent Events) | `notifications.connect` | `hoody notifications stream --displays all` |

## `hoody pools` — 11 commands

Pool management and invitations

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody pools create` |  | write | Create pool | `api.pools.create` | `hoody pools create --name my-resource --description 'My description' --settings key=hello` |
| `hoody pools delete` |  | destructive | Delete pool | `api.pools.delete` | `hoody pools delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody pools get` |  | read | Get pool details | `api.pools.get` | `hoody pools get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody pools invitations accept` |  | action | Accept invitation | `api.pools.invitations.accept` | `hoody pools invitations accept 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody pools invitations list` |  | read | List pending invitations | `api.pools.invitations.list` | `hoody pools invitations list` |
| `hoody pools invitations reject` |  | action | Reject invitation | `api.pools.invitations.reject` | `hoody pools invitations reject 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody pools list` |  | read | List user pools | `api.pools.list` | `hoody pools list` |
| `hoody pools members invite` |  | write | Invite member | `api.pools.members.invite` | `hoody pools members invite 64f1a2b3c4d5e6f7a8b9c0d1 --username alice --role admin` |
| `hoody pools members remove` |  | destructive | Remove member | `api.pools.members.remove` | `hoody pools members remove 64f1a2b3c4d5e6f7a8b9c0d1 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody pools members role set` |  | write | Update member role | `api.pools.members.setRole` | `hoody pools members role set 64f1a2b3c4d5e6f7a8b9c0d1 64f1a2b3c4d5e6f7a8b9c0d1 --role admin` |
| `hoody pools update` |  | write | Update pool | `api.pools.update` | `hoody pools update 64f1a2b3c4d5e6f7a8b9c0d1 --description 'My description'` |

## `hoody projects` (aliases: p, proj) — 25 commands

Manage projects

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody projects create` |  | write | Create a new project | `api.projects.create` | `hoody projects create --alias Production --color '#ff0000' --max-containers 10` |
| `hoody projects delete` |  | destructive | Delete project | `api.projects.delete` | `hoody projects delete 64f1a2b3c4d5e6f7a8b9c0d1 --include-deleted-items -y` |
| `hoody projects get` |  | read | Get project by ID | `api.projects.get` | `hoody projects get 64f1a2b3c4d5e6f7a8b9c0d1 --include-permissions` |
| `hoody projects list` |  | read | List all projects | `api.projects.list` | `hoody projects list --page 1 --limit 10` |
| `hoody projects permissions create` |  | write | Grant project access | `api.projects.createPermission` | `hoody projects permissions create --project 64f1a2b3c4d5e6f7a8b9c0d1 --user-id 64f1a2b3c4d5e6f7a8b9c0d1 --permission-level read` |
| `hoody projects permissions delete` |  | destructive | Revoke project access | `api.projects.deletePermission` | `hoody projects permissions delete --project 64f1a2b3c4d5e6f7a8b9c0d1 --permission-id 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody projects permissions list` |  | read | List project permissions | `api.projects.listPermissions` | `hoody projects permissions list --page 10 --limit 10 --project 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody projects permissions update` |  | write | Update project permission | `api.projects.updatePermission` | `hoody projects permissions update --project 64f1a2b3c4d5e6f7a8b9c0d1 --permission-id 64f1a2b3c4d5e6f7a8b9c0d1 --permission-level read` |
| `hoody projects proxy default set` |  | write | Update project default proxy permission policy | `api.proxy.projectPermissions.setDefault` | `hoody projects proxy default set --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42 --default allow` |
| `hoody projects proxy disable` |  | write | Disable the proxy permissions of a project | `api.proxy.projectPermissions.disable` | `hoody projects proxy disable --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42` |
| `hoody projects proxy enable` |  | write | Enable the proxy permissions of a project | `api.proxy.projectPermissions.enable` | `hoody projects proxy enable --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42` |
| `hoody projects proxy groups delete` |  | destructive | Remove project authentication group | `api.proxy.projectPermissions.deleteAuthGroup` | `hoody projects proxy groups delete --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --if-match file:v42 -y` |
| `hoody projects proxy groups ip set` |  | write | Set IP authentication group (project) | `api.proxy.projectPermissions.setIpGroup` | `hoody projects proxy groups ip set --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --if-match file:v42 --range 192.0.2.0/24` |
| `hoody projects proxy groups jwt set` |  | write | Set JWT authentication group (project) | `api.proxy.projectPermissions.setJwtGroup` | `hoody projects proxy groups jwt set --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --if-match file:v42 --secret <secret> --algorithm HS256 --sources header:Authorization --claims key=hello` |
| `hoody projects proxy groups password set` |  | write | Set password authentication group (project) | `api.proxy.projectPermissions.setPasswordGroup` | `hoody projects proxy groups password set --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --if-match file:v42 --auth-username alice --auth-password <password> --algorithm sha256 --salt <salt>` |
| `hoody projects proxy groups permissions clear` |  | destructive | Remove all program permissions for a project group | `api.proxy.projectPermissions.clearGroupPermissions` | `hoody projects proxy groups permissions clear --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --if-match file:v42 -y` |
| `hoody projects proxy groups permissions delete` |  | destructive | Remove a single program permission for a project group | `api.proxy.projectPermissions.deleteGroupPermission` | `hoody projects proxy groups permissions delete --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --program http --if-match file:v42 -y` |
| `hoody projects proxy groups permissions set` |  | write | Set project group program permission | `api.proxy.projectPermissions.setGroupPermission` | `hoody projects proxy groups permissions set --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --if-match file:v42 --program http --access true` |
| `hoody projects proxy groups token set` |  | write | Set token authentication group (project) | `api.proxy.projectPermissions.setTokenGroup` | `hoody projects proxy groups token set --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --if-match file:v42 --body '{"header":"X-Api-Key","value":"<token>"}'` |
| `hoody projects proxy permissions delete` |  | destructive | Delete project proxy permissions | `api.proxy.projectPermissions.delete` | `hoody projects proxy permissions delete --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42 -y` |
| `hoody projects proxy permissions get` |  | read | Get project proxy permissions | `api.proxy.projectPermissions.get` | `hoody projects proxy permissions get --project 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody projects proxy permissions set` |  | write | Replace project proxy permissions JSON | `api.proxy.projectPermissions.set` | `hoody projects proxy permissions set --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42 --groups 'key={"type":"ip","range":"192.0.2.0/24"}' --permissions 'key={}' --default allow --enable-proxy` |
| `hoody projects proxy usage` |  | read | Get proxied-usage documents for every container in a project | `api.projects.getProxyUsage` | `hoody projects proxy usage 64f1a2b3c4d5e6f7a8b9c0d1 --from <from> --to <to>` |
| `hoody projects stats` |  | read | Get statistics for all containers in a project | `api.projects.getStats` | `hoody projects stats 507f1f77bcf86cd799439033` |
| `hoody projects update` |  | write | Update project | `api.projects.update` | `hoody projects update 64f1a2b3c4d5e6f7a8b9c0d1 --alias my-resource --color '#ff0000' --max-containers 10` |

## `hoody proxy` (alias: px) — 10 commands

Global proxy routing, aliases, and logs. For per-container request hooks, permissions, and authentication groups, see `hoody containers proxy`.

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody proxy aliases create` |  | write | Create a new proxy alias | `api.proxy.aliases.create` | `hoody --container-id 64f1a2b3c4d5e6f7a8b9c0d1 proxy aliases create --program <program> --target-path /home/user/file.txt --expires-at 2026-01-01T00:00:00Z` |
| `hoody proxy aliases delete` |  | destructive | Delete proxy alias | `api.proxy.aliases.delete` | `hoody proxy aliases delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody proxy aliases disable` |  | write | Disable a proxy alias | `api.proxy.aliases.disable` | `hoody proxy aliases disable 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody proxy aliases enable` |  | write | Enable a proxy alias | `api.proxy.aliases.enable` | `hoody proxy aliases enable 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody proxy aliases get` |  | read | Get proxy alias by ID | `api.proxy.aliases.get` | `hoody proxy aliases get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody proxy aliases list` |  | read | List proxy aliases | `api.proxy.aliases.list` | `hoody proxy aliases list --project-id 64f1a2b3c4d5e6f7a8b9c0d1 --enabled` |
| `hoody proxy aliases update` |  | write | Update proxy alias | `api.proxy.aliases.update` | `hoody proxy aliases update 64f1a2b3c4d5e6f7a8b9c0d1 --alias my-resource --index 10` |
| `hoody proxy logs list` |  | read | Query centralized logs | `proxyLogs.list` | `hoody proxy logs list --limit 200 --include-request-body` |
| `hoody proxy logs stats` |  | read | Get log statistics | `proxyLogs.getStats` | `hoody proxy logs stats` |
| `hoody proxy logs stream` |  | read | Live-tail logs over Server-Sent Events | `proxyLogs.stream` | `hoody proxy logs stream --service-name tunnel --kind request` |

## `hoody realms` — 1 command

Platform realms

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody realms list` |  | read | List your realm IDs | `api.realms.list` | `hoody realms list --include-usage` |

## `hoody run` — 28 commands

Application resolution across multiple package sources (Hoody Run)

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody run open` |  | action | Open the Run kit results page for an app in your browser |  | `hoody run open --app APP` |
| `hoody run config get` |  | read | Show the stored configuration: sources, profiles and the active profile | `run.config.get` | `hoody run config get` |
| `hoody run health` |  | read | Check hoody-run service health |  | `hoody run health` |
| `hoody run jobs cancel` |  | action | Cancel a queued or running search job | `run.jobs.cancel` | `hoody run jobs cancel abc-123` |
| `hoody run jobs get` |  | read | Get the status of a job | `run.jobs.get` | `hoody run jobs get abc-123 --wait done --timeout-ms 0` |
| `hoody run jobs list` |  | read | List the background jobs the service still holds, newest first | `run.jobs.list` | `hoody run jobs list --kind search-resolve --status queued` |
| `hoody run jobs search create` |  | action | Start a background search job and return its handle | `run.jobs.createSearch` | `hoody run jobs search create --app firefox --os linux --kind gui` |
| `hoody run profiles create` |  | write | Create a profile | `run.profiles.create` | `hoody run profiles create --name default --description 'Default profile (inherits global sources)' --defaults-os linux` |
| `hoody run profiles delete` |  | destructive | Delete a profile | `run.profiles.delete` | `hoody run profiles delete default -y` |
| `hoody run profiles list` |  | read | List profiles | `run.profiles.list` | `hoody run profiles list` |
| `hoody run profiles update` |  | write | Update a profile | `run.profiles.update` | `hoody run profiles update default --description 'Default profile (inherits global sources)' --defaults-os linux` |
| `hoody run profiles use` |  | write | Make a profile the active one | `run.profiles.use` | `hoody run profiles use default` |
| `hoody run recipes create` |  | write | Save a launch recipe | `run.recipes.create` | `hoody run recipes create --name my-resource --description 'My description' --selector-template-app firefox` |
| `hoody run recipes delete` |  | destructive | Delete a saved recipe | `run.recipes.delete` | `hoody run recipes delete my-resource -y` |
| `hoody run recipes get` |  | read | Show a saved recipe | `run.recipes.get` | `hoody run recipes get my-resource` |
| `hoody run recipes list` |  | read | List saved launch recipes | `run.recipes.list` | `hoody run recipes list` |
| `hoody run recipes resolve` |  | action | Resolve a saved recipe to a shell command | `run.recipes.resolve` | `hoody run recipes resolve my-resource --overrides-app firefox --overrides-os linux` |
| `hoody run recipes search` |  | read | Search candidates using a saved recipe | `run.recipes.search` | `hoody run recipes search my-resource --overrides-app firefox --overrides-os linux` |
| `hoody run recipes update` |  | write | Update a saved recipe | `run.recipes.update` | `hoody run recipes update my-resource --description 'My description' --selector-template-app firefox` |
| `hoody run resolve` |  | action | Resolve an app to an exact shell command; Resolve an app by path to an exact shell command | `run.resolve` | `hoody run resolve --app firefox --os linux --kind gui` |
| `hoody run search` |  | read | Search candidates page by page with a cursor | `run.search` | `hoody run search --app firefox --selector-os linux --selector-kind gui` |
| `hoody run sources create` |  | write | Add a package source | `run.sources.create` | `hoody run sources create --source-id nixpkgs --enabled --priority 100 --provider nix --source-type nix-pkgs --pin-url https://github.com/numtide/llm-agents.nix --source-config flake=nixpkgs` |
| `hoody run sources delete` |  | destructive | Remove a package source | `run.sources.delete` | `hoody run sources delete abc-123 -y` |
| `hoody run sources diagnostics get` |  | read | Show runtime health for a source: last error, last search latency, last sync job | `run.sources.getDiagnostics` | `hoody run sources diagnostics get abc-123` |
| `hoody run sources list` |  | read | List configured package sources | `run.sources.list` | `hoody run sources list` |
| `hoody run sources sync` |  | action | Sync one source and return the job; Sync every source and return the job | `run.sources.sync`, `run.sources.syncAll` | `hoody run sources sync abc-123` |
| `hoody run sources update` |  | write | Update a package source | `run.sources.update` | `hoody run sources update abc-123 --enabled --priority 100` |
| `hoody run test` |  | read | Plan a run and show the command, missing requirements and effective policy | `run.test` | `hoody run test --app firefox --os linux --kind gui` |

## `hoody servers` (alias: srv) — 25 commands

Server rental marketplace, rentals, and remote commands

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody servers commands list` |  | read | Get available commands | `api.servers.commands.list` | `hoody servers commands list 64f1a2b3c4d5e6f7a8b9c0d1 --category general --risk-level low` |
| `hoody servers commands run` |  | action | Execute server command | `api.servers.commands.run` | `hoody servers commands run 64f1a2b3c4d5e6f7a8b9c0d1 --command-id 64f1a2b3c4d5e6f7a8b9c0d1 --wait --timeout 10` |
| `hoody servers extend` |  | write | Extend rental | `api.servers.extend` | `hoody servers extend 64f1a2b3c4d5e6f7a8b9c0d1 --expected-rental-end <expected_rental_end> --additional-days 10 -y` |
| `hoody servers get` |  | read | Get server details | `api.servers.get` | `hoody servers get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody servers jobs get` |  | read | Show the status of a paid subserver operation | `api.servers.jobs.get` | `hoody servers jobs get abc-123` |
| `hoody servers list` |  | read | List user servers | `api.servers.list` | `hoody servers list` |
| `hoody servers marketplace list` |  | read | Browse rental marketplace | `api.servers.listMarketplace` | `hoody servers marketplace list --country US --region us-east` |
| `hoody servers offers list` |  | read | List machines available to order | `api.servers.offers.list` | `hoody servers offers list` |
| `hoody servers offers reserve` |  | write | Reserve an offer and charge your wallet immediately | `api.servers.offers.reserve` | `hoody servers offers reserve abc-123 --days 10 --max-charge-cents 10 --idempotency-key <idempotency_key> -y` |
| `hoody servers plans list` |  | read | List the paid subserver plans you can buy | `api.servers.plans.list` | `hoody servers plans list` |
| `hoody servers plans quote` |  | read | Quote the price of a paid subserver plan | `api.servers.plans.quote` | `hoody servers plans quote --plan-id abc-123` |
| `hoody servers regions list` |  | read | Get available server regions | `api.servers.listRegions` | `hoody servers regions list` |
| `hoody servers rent` |  | write | Rent server | `api.servers.rent` | `hoody servers rent 64f1a2b3c4d5e6f7a8b9c0d1 --pool-id 64f1a2b3c4d5e6f7a8b9c0d1 --rental-days 10 -y` |
| `hoody servers reservations get` |  | read | Show one of your reservations | `api.servers.reservations.get` | `hoody servers reservations get abc-123` |
| `hoody servers reservations list` |  | read | List your reservations | `api.servers.reservations.list` | `hoody servers reservations list --limit 50 --offset 0` |
| `hoody servers stats` |  | read | Live CPU, memory and disk usage of a rental | `api.servers.getStats` | `hoody servers stats 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody servers subscriptions autorenew disable` |  | destructive | Turn off auto-renew for a server subscription | `api.servers.subscriptions.disableAutoRenew` | `hoody servers subscriptions autorenew disable abc-123 -y` |
| `hoody servers subscriptions autorenew enable` |  | destructive | Turn on auto-renew for a server subscription | `api.servers.subscriptions.enableAutoRenew` | `hoody servers subscriptions autorenew enable abc-123 -y` |
| `hoody servers subscriptions buy` |  | write | Buy a paid subserver and charge your wallet immediately | `api.servers.subscriptions.buy` | `hoody servers subscriptions buy --plan-id abc-123 --idempotency-key <idempotency_key> --max-charge-cents 10 -y` |
| `hoody servers subscriptions cancel` |  | destructive | Cancel a paid subserver subscription (no refund; held after the paid period) | `api.servers.subscriptions.cancel` | `hoody servers subscriptions cancel abc-123 -y` |
| `hoody servers subscriptions get` |  | read | Show one of your paid subserver subscriptions | `api.servers.subscriptions.get` | `hoody servers subscriptions get abc-123` |
| `hoody servers subscriptions list` |  | read | List your paid subserver subscriptions | `api.servers.subscriptions.list` | `hoody servers subscriptions list --limit 50 --offset 0` |
| `hoody servers subscriptions pay` |  | write | Pay a held subscription and resume it (charges one month) | `api.servers.subscriptions.pay` | `hoody servers subscriptions pay abc-123 --idempotency-key <idempotency_key> --max-charge-cents 10 -y` |
| `hoody servers subscriptions quote` |  | read | Quote an upgrade of, or a payment for, a subscription | `api.servers.subscriptions.quote` | `hoody servers subscriptions quote abc-123 --action upgrade` |
| `hoody servers subscriptions upgrade` |  | write | Upgrade a paid subserver and charge the difference | `api.servers.subscriptions.upgrade` | `hoody servers subscriptions upgrade abc-123 --plan-id abc-123 --idempotency-key <idempotency_key> --max-charge-cents 10 -y` |

## `hoody snapshots` (alias: snap) — 5 commands

Container snapshots

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody snapshots alias set` |  | write | Update snapshot alias | `api.snapshots.setAlias` | `hoody snapshots alias set --name my-resource --alias my-resource` |
| `hoody snapshots create` |  | write | Create container snapshot | `api.snapshots.create` | `hoody snapshots create --alias my-resource --expiry 10` |
| `hoody snapshots delete` |  | destructive | Delete container snapshot | `api.snapshots.delete` | `hoody snapshots delete --name my-resource -y` |
| `hoody snapshots list` |  | read | Get container snapshots | `api.snapshots.list` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 snapshots list` |
| `hoody snapshots restore` |  | action | Restore container from snapshot | `api.snapshots.restore` | `hoody snapshots restore --name my-resource -y` |

## `hoody storage` — 10 commands

Storage shares

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody storage containers incoming list` |  | read | Get incoming shares | `api.storage.shares.listIncomingByContainer` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 storage containers incoming list` |
| `hoody storage containers shares list` |  | read | List storage shares | `api.storage.shares.listByContainer` | `hoody storage containers shares list --target-type container --label my-label` |
| `hoody storage incoming list` |  | read | Get all incoming shares | `api.storage.shares.listIncoming` | `hoody storage incoming list` |
| `hoody storage incoming mount` |  | action | Mount an incoming share into the container | `api.storage.shares.mountIncoming` | `hoody storage incoming mount --share-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody storage incoming unmount` |  | action | Unmount an incoming share from the container | `api.storage.shares.unmountIncoming` | `hoody storage incoming unmount --share-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody storage shares create` |  | write | Create storage share | `api.storage.shares.create` | `hoody storage shares create --source-path /home/user/file.txt --target-container-id 64f1a2b3c4d5e6f7a8b9c0d1 --mode readonly --alias my-resource` |
| `hoody storage shares delete` |  | destructive | Delete storage share | `api.storage.shares.delete` | `hoody storage shares delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody storage shares get` |  | read | Get storage share | `api.storage.shares.get` | `hoody storage shares get --share-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody storage shares list` |  | read | List all storage shares you have created, across all your containers | `api.storage.shares.list` | `hoody storage shares list` |
| `hoody storage shares update` |  | write | Update storage share | `api.storage.shares.update` | `hoody storage shares update --share-id 64f1a2b3c4d5e6f7a8b9c0d1 --mode readonly --alias my-resource` |

## `hoody terminal` (aliases: term, t) — 34 commands

Terminal sessions and execution

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody terminal open` |  | action | Open the Terminal kit service (web terminal) in your browser |  | `hoody terminal open` |
| `hoody terminal automation stats` |  | read | Get terminal automation metrics | `terminal.automation.getStats` | `hoody terminal automation stats` |
| `hoody terminal commands cancel` |  | write | Abort a running command | `terminal.commands.cancel` | `hoody terminal commands cancel abc-123 --force` |
| `hoody terminal commands get` |  | read | Get command result | `terminal.commands.get` | `hoody terminal commands get 45678` |
| `hoody terminal commands list` |  | read | Get terminal command history | `terminal.commands.list` | `hoody terminal commands list 12345` |
| `hoody terminal commands run` |  | action | Execute command in terminal session | `terminal.commands.run` | `hoody terminal commands run --ephemeral --defer-pid 4242 --command 'ls -la'` |
| `hoody terminal health` |  | read | Service health check | `terminal.kit.getHealth` | `hoody terminal health` |
| `hoody terminal keys list` |  | read | List supported key names for /press endpoint | `terminal.keys.list` | `hoody terminal keys list` |
| `hoody terminal processes get` |  | read | Get process details by PID | `terminal.processes.get` | `hoody terminal processes get 1234` |
| `hoody terminal processes list` |  | read | List all system processes | `terminal.processes.list` | `hoody terminal processes list --sort cpu --limit 10` |
| `hoody terminal processes pause` |  | write | Suspend a process or process tree (SIGSTOP) | `terminal.processes.pause` | `hoody terminal processes pause --pid 1234 --include-descendants` |
| `hoody terminal processes resume` |  | write | Resume a suspended process or process tree (SIGCONT) | `terminal.processes.resume` | `hoody terminal processes resume --pid 1234 --include-descendants` |
| `hoody terminal processes signal` |  | write | Send signal to process(es) | `terminal.processes.signal` | `hoody terminal processes signal --pid 1234 --force` |
| `hoody terminal sessions automation status` |  | read | Get per-session automation state | `terminal.sessions.getAutomationStatus` | `hoody terminal sessions automation status 1` |
| `hoody terminal sessions connect` |  | read | WebSocket terminal connection | `terminal.sessions.connect` | `hoody terminal sessions connect --terminal-id 12345 --readonly` |
| `hoody terminal sessions create` |  | write | Create a terminal session | `terminal.sessions.create` | `hoody terminal sessions create --ephemeral --display 5` |
| `hoody terminal sessions delete` |  | destructive | Delete a terminal session | `terminal.sessions.delete` | `hoody terminal sessions delete 12345 -y` |
| `hoody terminal sessions list` |  | read | List all terminal sessions | `terminal.sessions.list` | `hoody terminal sessions list --history-limit 50` |
| `hoody terminal sessions mouse send` |  | write | Send a cell-based mouse event to a terminal session | `terminal.sessions.sendMouseEvents` | `hoody terminal sessions mouse send --terminal-id 1 --event-type move --event-row 10 --event-col 10 --event-button 1` |
| `hoody terminal sessions paste` |  | write | Paste text into terminal | `terminal.sessions.paste` | `hoody terminal sessions paste --terminal-id 1 --text Hello --bracketed` |
| `hoody terminal sessions press` |  | write | Send named key presses to terminal | `terminal.sessions.pressKeys` | `hoody terminal sessions press --terminal-id 1 --keys ctrl+c` |
| `hoody terminal sessions read` |  | read | Get raw terminal output | `terminal.sessions.read` | `hoody terminal sessions read --terminal-id 12345 --format download` |
| `hoody terminal sessions screenshots capture` |  | read | Capture terminal screenshot | `terminal.sessions.captureScreenshot` | `hoody terminal sessions screenshots capture --terminal-id 12345 --format png --foreground white` |
| `hoody terminal sessions search` |  | read | Search terminal screen with regex | `terminal.sessions.search` | `hoody terminal sessions search --terminal-id 1 --pattern TODO --scope screen --limit 100` |
| `hoody terminal sessions snapshot get` |  | read | Get rendered terminal snapshot | `terminal.sessions.getSnapshot` | `hoody terminal sessions snapshot get --terminal-id 1 --include-colors --include-highlights` |
| `hoody terminal sessions wait` |  | write | Wait for terminal condition | `terminal.sessions.wait` | `hoody terminal sessions wait --terminal-id 1 --mode stable --debounce-ms 100` |
| `hoody terminal sessions write` |  | write | Write input to terminal | `terminal.sessions.write` | `hoody terminal sessions write --terminal-id 40001 --input <input> --enter` |
| `hoody terminal system daemon programs list` |  | read | Get daemon programs configuration | `terminal.system.listDaemonPrograms` | `hoody terminal system daemon programs list` |
| `hoody terminal system displays list` |  | read | Get display information | `terminal.system.listDisplays` | `hoody terminal system displays list` |
| `hoody terminal system displays stop` |  | destructive | Stop an X display and everything drawing on it, including a display a deleted terminal session left running | `terminal.system.stopDisplay` | `hoody terminal system displays stop 1 -y` |
| `hoody terminal system ports list` |  | read | List all listening network ports | `terminal.system.listPorts` | `hoody terminal system ports list --protocol tcp --user root` |
| `hoody terminal system reboot` |  | write | Reboot the system | `terminal.system.reboot` | `hoody terminal system reboot --delay 60 -y` |
| `hoody terminal system shutdown` |  | write | Shutdown the system | `terminal.system.shutdown` | `hoody terminal system shutdown --delay 60 -y` |
| `hoody terminal system stats` |  | read | Get system resources and statistics | `terminal.system.getStats` | `hoody terminal system stats` |

## `hoody tunnel` (alias: tun) — 8 commands

Reverse tunnels — expose HTTP/WS/TCP services online via container relay

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody tunnel expose` |  | action | Expose a local service to the internet through the container (long-running, Ctrl+C to stop) |  | `hoody tunnel expose 3000` |
| `hoody tunnel pull` |  | action | Pull a TCP service from local machine into the container loopback (long-running, Ctrl+C to stop) |  | `hoody tunnel pull 5432 --port 5432` |
| `hoody tunnel bindings list` |  | read | List active bindings across all sessions | `tunnel.bindings.list` | `hoody tunnel bindings list` |
| `hoody tunnel health` |  | read | Tunnel kit health | `tunnel.kit.getHealth` | `hoody tunnel health` |
| `hoody tunnel list` |  | read | List all active tunnels (combined sessions + bindings) | `tunnel.list` | `hoody tunnel list` |
| `hoody tunnel metrics` |  | read | Prometheus metrics for the tunnel kit | `tunnel.kit.getMetrics` | `hoody tunnel metrics` |
| `hoody tunnel sessions close` |  | destructive | Terminate an active tunnel session | `tunnel.sessions.close` | `hoody tunnel sessions close abc-123 --grace-ms 100 -y` |
| `hoody tunnel sessions list` |  | read | List active tunnel sessions | `tunnel.sessions.list` | `hoody tunnel sessions list` |

## `hoody users` (alias: u) — 7 commands

User management

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody users free tier status` |  | read | Show whether this account can claim a free server | `api.users.getFreeTierStatus` | `hoody users free tier status` |
| `hoody users get` |  | read | Get user by ID | `api.users.get` | `hoody users get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody users invites redeem` |  | write | Redeem a free-tier invite code to claim your free server | `api.users.redeemInvite` | `hoody users invites redeem --code HOODY-7Q4K-9F2M-3B8T-XR5W-2HKD-1` |
| `hoody users onboarding milestones complete` |  | write | Mark an onboarding milestone as completed | `api.users.completeOnboardingMilestone` | `hoody users onboarding milestones complete --milestone hub_tour_v1` |
| `hoody users security history list` |  | read | List your account sign-ins and security events | `api.users.listSecurityHistory` | `hoody users security history list --page 1 --limit 50` |
| `hoody users setup retry` |  | write | Retry free-tier account setup | `api.users.retrySetup` | `hoody users setup retry --region eu-west-1` |
| `hoody users update` |  | write | Update user profile | `api.users.update` | `hoody users update 64f1a2b3c4d5e6f7a8b9c0d1 --alias my-resource --public-key 4a1f8c2d3e5b6079a1c2d3e4f50617283940a1b2c3d4e5f60718293a4b5c6d7e` |

## `hoody vault` (alias: v) — 6 commands

Secure key-value vault

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody vault clear` |  | destructive | Clear entire vault | `api.vault.clear` | `hoody vault clear -y` |
| `hoody vault delete` |  | destructive | Delete vault key | `api.vault.delete` | `hoody vault delete <key> -y` |
| `hoody vault get` |  | read | Get vault key | `api.vault.get` | `hoody vault get <key>` |
| `hoody vault list` |  | read | List vault keys | `api.vault.list` | `hoody vault list` |
| `hoody vault set` |  | write | Set vault key | `api.vault.set` | `hoody vault set <key> --value '{"api_key": "sk_test_123456", "encrypted": true}'` |
| `hoody vault stats` |  | read | Get vault statistics | `api.vault.getStats` | `hoody vault stats` |

## `hoody wallet` — 26 commands

Balances, transactions, payments, and invoices

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody wallet balance get` |  | read | Get general balance only | `api.wallet.getBalance` | `hoody wallet balance get` |
| `hoody wallet balances get` |  | read | Get aggregate balances (general + AI) | `api.wallet.getBalances` | `hoody wallet balances get` |
| `hoody wallet credits fees list` |  | read | List AI credit fee history (platform fees charged on AI transfers) | `api.wallet.listCreditFees` | `hoody wallet credits fees list --page 1 --limit 20` |
| `hoody wallet credits get` |  | read | Get AI balance (limit, usage, remaining) | `api.wallet.getCredits` | `hoody wallet credits get` |
| `hoody wallet credits transfer` |  | write | Transfer from general balance to AI credits | `api.wallet.transferToCredits` | `hoody wallet credits transfer --amount 10.00 --expected-fee-bps 10 -y` |
| `hoody wallet github bonus claim` |  | action | Claim the one-time GitHub connection bonus | `api.wallet.claimGithubBonus` | `hoody wallet github bonus claim` |
| `hoody wallet github bonus status` |  | read | Show the status of the GitHub connection bonus | `api.wallet.getGithubBonus` | `hoody wallet github bonus status` |
| `hoody wallet invoices create` |  | action | Generate invoice for transaction | `api.wallet.createInvoice` | `hoody wallet invoices create 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet invoices download` |  | read | Download invoice PDF | `api.wallet.downloadInvoice` | `hoody wallet invoices download 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet invoices get` |  | read | Get invoice by ID | `api.wallet.getInvoice` | `hoody wallet invoices get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet invoices list` |  | read | Get all invoices | `api.wallet.listInvoices` | `hoody wallet invoices list --page 1 --limit 20` |
| `hoody wallet payments availability get` |  | read | Which payment rails are available to this account right now | `api.wallet.getPaymentAvailability` | `hoody wallet payments availability get` |
| `hoody wallet payments crypto intents get` |  | read | Get one crypto payment intent | `api.wallet.getCryptoPaymentIntent` | `hoody wallet payments crypto intents get 665f1f77bcf86cd799439012` |
| `hoody wallet payments crypto intents list` |  | read | List your crypto payment intents | `api.wallet.listCryptoPaymentIntents` | `hoody wallet payments crypto intents list --limit 20 --offset 0` |
| `hoody wallet payments crypto invoices create` |  | write | Create a crypto payment invoice to add funds | `api.wallet.createCryptoInvoice` | `hoody wallet payments crypto invoices create --amount 25.00 -y` |
| `hoody wallet payments methods create` |  | write | Add a new payment method | `api.wallet.createPaymentMethod` | `hoody wallet payments methods create --type credit_card --name my-resource --is-default` |
| `hoody wallet payments methods default set` |  | write | Set a payment method as default | `api.wallet.setDefaultPaymentMethod` | `hoody wallet payments methods default set 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet payments methods delete` |  | destructive | Delete a payment method | `api.wallet.deletePaymentMethod` | `hoody wallet payments methods delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody wallet payments methods get` |  | read | Get payment method by ID | `api.wallet.getPaymentMethod` | `hoody wallet payments methods get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet payments methods list` |  | read | Get all payment methods | `api.wallet.listPaymentMethods` | `hoody wallet payments methods list --page 1 --limit 100` |
| `hoody wallet payments methods update` |  | write | Update a payment method | `api.wallet.updatePaymentMethod` | `hoody wallet payments methods update 64f1a2b3c4d5e6f7a8b9c0d1 --name my-resource --status active` |
| `hoody wallet payments stripe checkout create` |  | write | Start a Stripe checkout to add funds (returns the checkout URL) | `api.wallet.createStripeCheckout` | `hoody wallet payments stripe checkout create --amount 25.00 -y` |
| `hoody wallet payments stripe intents get` |  | read | Get one Stripe payment intent | `api.wallet.getStripePaymentIntent` | `hoody wallet payments stripe intents get 665f1f77bcf86cd799439011` |
| `hoody wallet payments stripe intents list` |  | read | List your Stripe payment intents | `api.wallet.listStripePaymentIntents` | `hoody wallet payments stripe intents list --limit 20 --offset 0` |
| `hoody wallet transactions get` |  | read | Get transaction by ID | `api.wallet.getTransaction` | `hoody wallet transactions get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet transactions list` |  | read | List transactions | `api.wallet.listTransactions` | `hoody wallet transactions list --page 1 --limit 20` |

## `hoody watch` — 9 commands

File system watchers — observe file changes and tail live events

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody watch open` |  | action | Open the Watch kit info page in your browser |  | `hoody watch open` |
| `hoody watch create` |  | write | Create a new file system watcher. `--paths` is repeatable; `--include`/`--exclude`/`--ignore-dirs`/`--kinds` are optional repeatable filters. | `watch.watchers.create` | `hoody watch create --coalesce-ms 100 --exclude '*.ts' --paths /home/user/src` |
| `hoody watch delete` |  | write | Delete a watcher and tear down its inotify subscriptions | `watch.watchers.delete` | `hoody watch delete --id 3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| `hoody watch events list` |  | read | List historical events for a watcher (paged). Supports cursor resume via `--since-id` or `--since-timestamp`. | `watch.events.list` | `hoody watch events list --id 3fa85f64-5717-4562-b3fc-2c963f66afa6 --since-id 10 --limit 10` |
| `hoody watch events stream` |  | read | Live-tail watcher events over Server-Sent Events. Resumes from `--since-id` on reconnect. | `watch.events.stream` | `hoody watch events stream --id 3fa85f64-5717-4562-b3fc-2c963f66afa6 --since-id 10` |
| `hoody watch get` |  | read | Get a single watcher by id, including its config and stats | `watch.watchers.get` | `hoody watch get --id 3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| `hoody watch health` |  | read | Health check for the watch service (status, build, start time, memory, open file descriptors, pid) | `watch.kit.getHealth` | `hoody watch health` |
| `hoody watch list` |  | read | List all file system watchers (paged) | `watch.watchers.list` | `hoody watch list --page 10 --limit 10` |
| `hoody watch update` |  | write | Reconfigure a watcher in place. Omitted fields keep their current value; a repeatable filter flag replaces that whole list. The watcher keeps its id, history and connected clients | `watch.watchers.update` | `hoody watch update --id 3fa85f64-5717-4562-b3fc-2c963f66afa6 --coalesce-ms 100 --exclude '*.ts'` |


---

*Auto-generated by `generate-reference.ts`. Do not edit manually.*
