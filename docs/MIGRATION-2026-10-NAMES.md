# Migration: CLI and SDK names (2026-10)

Every CLI command and SDK method follows one vocabulary. Old names are gone: there are no aliases and no deprecation
shims. A script or program written against an old name fails until you replace it with the name in the tables below.
Three old names are the exception. They are still read, each as its `computer` name: the config key `container`,
`hoody local lock reveal --field container`, and the `HOODY_CONTAINER` and `HOODY_CONTAINER_ID` environment variables.

The names changed in three steps. Read the step you are coming from and every step after it:

- **[Naming freeze before the stable release](#naming-freeze-before-the-stable-release)** (in 1.0.1): the last pass over
  every public name, under the rules in [The rules, in short](#the-rules-in-short). CLI commands, group aliases and flags,
  SDK accessors, hand-written members, option keys and exported type names. After it no public name changes.
- **[1.0.1: computer naming](#101-computer-naming)**: every `container` you type or read became `computer`.
- **1.0.0-beta.15**: the vocabulary itself. The CLI table lists 612 old commands, 33 of them removed; the SDK table lists
  955 old accessors, 27 of them removed. Every other row gives the new name. Where a row gives several, the old name was
  split: pick the one that matches what you meant. Where two old commands
  became one, the replacement takes a flag that selects the old behaviour, and the row shows it (`commits create --push`,
  `display mouse click --double`). The tables from [CLI: group aliases](#cli-group-aliases) on are this step. Their **New**
  column already gives the final name, after the naming freeze, except that a `container` in them is the 1.0.0-beta.15
  spelling: read it as `computer` (see [1.0.1](#101-computer-naming)).

## Naming freeze before the stable release

Before the stable release every public name was checked against one set of rules ([The rules, in short](#the-rules-in-short)),
and every name that broke a rule changed. After the stable release no public name changes. As in the earlier steps there are
no aliases:

- An old CLI command, group alias or flag exits with code 2 and a message that names what to type instead.
- An old SDK option key is refused when the method is called. It is never ignored.
- An old SDK method, member or exported type no longer exists, so TypeScript reports it when you compile.
- A getter that became a method (`terminal.connected` is now `terminal.isConnected()`) is in no type, so TypeScript reports it too;
  read from JavaScript, it throws a `TypeError` that names the method.

The tables in this section start from the names that 1.0.0-beta.17 still accepted. If you are moving from an older release, the tables further down
already give the final names, so you do not need to apply two tables one after the other.

### CLI: old command to new command (naming freeze)

A row with two new commands was one command that took a flag to choose. It is now a pair: pick the one that matches what
the flag said. The old command's message names both. If the old line typed the flag (`--no-enabled`, `--enabled false`),
the message names only the command that does what that line did.

A row whose new command adds a word (`hoody support limits` is now `hoody support limits get`) turned a command into a
group. The old line exits with code 2 and names the new command, also when it is typed with no other argument.

| Old | New |
|---|---|
| `hoody abuse` | `hoody abusenotices` |
| `hoody abuse get` | `hoody abusenotices get` |
| `hoody abuse list` | `hoody abusenotices list` |
| `hoody abuse reply` | `hoody abusenotices reply` |
| `hoody agent acp credentials apply` | `hoody agent acp credentialimports apply` |
| `hoody agent acp credentials preview` | `hoody agent acp credentialimports preview` |
| `hoody agent acp sync apply` | `hoody agent acp filesyncs apply` |
| `hoody agent acp sync preview` | `hoody agent acp filesyncs preview` |
| `hoody agent bots archive purge` | `hoody agent bots archive clear` |
| `hoody agent bots channels chats forget` | `hoody agent bots channels chats delete` |
| `hoody agent bots channels setup` | `hoody agent bots channels setup get` |
| `hoody agent bots forget` | `hoody agent bots conversation clear` |
| `hoody agent bots log get` | `hoody agent bots logs get` |
| `hoody agent bots stream` | `hoody agent bots logs stream` |
| `hoody agent bots voice` | `hoody agent bots voice connect` |
| `hoody agent definitions turns limit set` | `hoody agent definitions turnlimit set` |
| `hoody agent github auth login` | `hoody agent github auth start` (device sign-in) / `hoody agent github auth login --github-token <token>` |
| `hoody agent github branches remote` | `hoody agent github branches remote get` |
| `hoody agent github diff` | `hoody agent github diff get` |
| `hoody agent headless stream` | `hoody agent headless start --stream` |
| `hoody agent hooks intents create` | `hoody agent hooks writeintents create` |
| `hoody agent mcp intents create` | `hoody agent mcp writeintents create` |
| `hoody agent mcp preview` | `hoody agent mcp import --preview` |
| `hoody agent memory intents create` | `hoody agent memory writeintents create` |
| `hoody agent pause get` | `hoody agent pausestate get` |
| `hoody agent pause set` | `hoody agent pause` / `hoody agent resume` |
| `hoody agent providers keys delete` | `hoody agent providers apikey delete` |
| `hoody agent providers keys set` | `hoody agent providers apikey set` |
| `hoody agent providers oauth submit` | `hoody agent providers oauth code submit` |
| `hoody agent sessions approver lease claim` | `hoody agent sessions approverlease claim` |
| `hoody agent sessions approver lease release` | `hoody agent sessions approverlease release` |
| `hoody agent sessions approver lease renew` | `hoody agent sessions approverlease renew` |
| `hoody agent sessions autoreply set` | `hoody agent sessions autoreply update` |
| `hoody agent sessions autoreply writes set` | `hoody agent sessions autoreply writes enable` / `hoody agent sessions autoreply writes disable` |
| `hoody agent sessions env set` | `hoody agent sessions hoodyenv enable` / `hoody agent sessions hoodyenv disable` |
| `hoody agent sessions mcp tools list` | `hoody agent sessions tools mcp list` |
| `hoody agent sessions rules list` | `hoody agent sessions rules applicable list` |
| `hoody agent sessions watch` | `hoody agent sessions batch stream` |
| `hoody agent sessions yolo set` | `hoody agent sessions yolo enable` / `hoody agent sessions yolo disable` |
| `hoody agent settings features get` | `hoody agent settings features list` |
| `hoody agent settings instructions update` | `hoody agent settings instructions set` |
| `hoody agent settings where get` | `hoody agent settings whereagentswork get` |
| `hoody agent skills trust --trusted` | `hoody agent skills trust` / `hoody agent skills untrust` |
| `hoody agent stats` | `hoody agent usage stats` |
| `hoody agent tasks cancel` | `hoody agent sessions tasks cancel` |
| `hoody agent tasks list` | `hoody agent sessions tasks list` |
| `hoody agent tasks transcript get` | `hoody agent sessions tasks transcript get` |
| `hoody agent tools stream` | `hoody agent tools run --stream` |
| `hoody agent work stop` | `hoody agent work stop --all` |
| `hoody agent workflows hidden set` | `hoody agent workflows hide` / `hoody agent workflows unhide` |
| `hoody ai usage` | `hoody ai freeusage get` |
| `hoody auth 2fa backup codes rotate` | `hoody auth 2fa backupcodes rotate` |
| `hoody auth 2fa gate disable` | `hoody auth 2fa tokengate disable` |
| `hoody auth 2fa gate enable` | `hoody auth 2fa tokengate enable` |
| `hoody auth 2fa undo` | `hoody auth 2fa enrollment undo` |
| `hoody auth claims create` | `hoody auth identityclaims create` |
| `hoody auth email change restore` | `hoody auth email change undo` |
| `hoody auth sessions others revoke` | `hoody auth sessions revoke --others` |
| `hoody auth token` | `hoody auth accesstoken get` |
| `hoody auth tokens profiles get` | `hoody auth tokens publicprofiles get` |
| `hoody auth tokens profiles update` | `hoody auth tokens publicprofiles update` |
| `hoody bot-urls` | `hoody boturls` |
| `hoody bot-urls answer` | `hoody boturls answer` |
| `hoody bot-urls ask` | `hoody boturls ask` |
| `hoody bot-urls chat` | `hoody boturls chat` |
| `hoody bot-urls create` | `hoody boturls create` |
| `hoody bot-urls delete` | `hoody boturls delete` |
| `hoody bot-urls events` | `hoody boturls events stream` |
| `hoody bot-urls get` | `hoody boturls get` |
| `hoody bot-urls keys create` | `hoody boturls keys create` |
| `hoody bot-urls keys purge` | `hoody boturls keys revoke --all` |
| `hoody bot-urls keys revoke-all` | `hoody boturls keys revoke --all` |
| `hoody bot-urls keys revoke` | `hoody boturls keys revoke` |
| `hoody bot-urls keys rotate` | `hoody boturls keys rotate` |
| `hoody bot-urls keys update` | `hoody boturls keys update` |
| `hoody bot-urls list` | `hoody boturls list` |
| `hoody bot-urls models` | `hoody boturls models list` |
| `hoody bot-urls panic` | `hoody boturls panic` |
| `hoody bot-urls repoint` | `hoody boturls repoint` |
| `hoody bot-urls status` | `hoody boturls status` |
| `hoody bot-urls suggest` | `hoody boturls label suggest` |
| `hoody bot-urls suggest-label` | `hoody boturls label suggest` |
| `hoody bot-urls update` | `hoody boturls update` |
| `hoody bot-urls updates` | `hoody boturls updates list` |
| `hoody boturls suggest` | `hoody boturls label suggest` |
| `hoody boturls suggest-label` | `hoody boturls label suggest` |
| `hoody browser devtools urls get` | `hoody browser devtoolsurls get` |
| `hoody computers proxy services hooks clear` | `hoody computers proxy hooks clear` |
| `hoody computers proxy services hooks list` | `hoody computers proxy hooks list` |
| `hoody computers proxy usage` | `hoody computers proxy usage get` |
| `hoody computers status history list` | `hoody computers statushistory list` |
| `hoody computers urls` | `hoody computers urls list` |
| `hoody config path` | `hoody config path get` |
| `hoody daemon ephemeral programs list` | `hoody daemon ephemeralprograms list` |
| `hoody daemon ephemeral programs logs get` | `hoody daemon ephemeralprograms logs get` |
| `hoody daemon ephemeral programs start` | `hoody daemon ephemeralprograms start` |
| `hoody daemon ephemeral programs status` | `hoody daemon ephemeralprograms status` |
| `hoody daemon ephemeral programs stop` | `hoody daemon ephemeralprograms stop` |
| `hoody daemon programs attach` | `hoody daemon programs terminal connect` |
| `hoody egress upstream renew` | `hoody egress upstream lease renew` |
| `hoody exec magic comments batch update` | `hoody exec magiccomments batch update` |
| `hoody exec magic comments get` | `hoody exec magiccomments get` |
| `hoody exec magic comments schema get` | `hoody exec magiccomments schema get` |
| `hoody exec magic comments update` | `hoody exec magiccomments update` |
| `hoody exec magic comments validate` | `hoody exec magiccomments validate` |
| `hoody exec modules list` | `hoody exec modules bundled list` |
| `hoody exec remote <target> attach` | `hoody exec remote connect <target>` |
| `hoody exec remote <target> call` | `hoody exec remote call <target> <fn>` |
| `hoody exec remote <target> capabilities` | `hoody exec remote capabilities get <target>` |
| `hoody exec remote <target> eval` | `hoody exec remote evaluate <target>` |
| `hoody exec remote <target> events` | `hoody exec remote events stream <target>` |
| `hoody exec remote <target> send` | `hoody exec remote send <target>` |
| `hoody exec scripts returns validate` | `hoody exec scripts returntype validate` |
| `hoody exec sdk types list` | `hoody exec sdktypes list` |
| `hoody inbox mark read` | `hoody inbox markread` |
| `hoody inbox summary` | `hoody inbox summary get` |
| `hoody local lock purge` | `hoody local lock delete` |
| `hoody meta key get` | `hoody meta publickey get` |
| `hoody notes comments anchor set` | `hoody notes comments anchors set` |
| `hoody notes document tickets create` | `hoody notes document exporttickets create` |
| `hoody notes nodes mark opened` | `hoody notes nodes markopened` |
| `hoody notes nodes mark seen` | `hoody notes nodes markseen` |
| `hoody notifications push key` | `hoody notifications push publickey get` |
| `hoody projects permissions create` | `hoody projects permissions add` |
| `hoody projects permissions delete` | `hoody projects permissions remove` |
| `hoody projects proxy usage` | `hoody projects proxy usage get --project <id>` |
| `hoody run jobs search create` | `hoody run jobs search start` |
| `hoody screenshot browser` | `hoody browser screenshots save` |
| `hoody screenshot display` | `hoody display screenshots save` |
| `hoody screenshot terminal` | `hoody terminal sessions screenshots save` |
| `hoody support changes` | `hoody support changes list` |
| `hoody support find message` | `hoody support messages keys get` |
| `hoody support find ticket` | `hoody support keys get` |
| `hoody support limits` | `hoody support limits get` |
| `hoody terminal sessions mouse send` | `hoody terminal sessions mouseevents send` |
| `hoody terminal sessions press` | `hoody terminal sessions keys press` |
| `hoody terminal system daemon programs list` | `hoody terminal system daemonprograms list` |
| `hoody users free tier status` | `hoody users freetier status` |
| `hoody users onboarding milestones complete` | `hoody users onboardingmilestones complete` |
| `hoody users security history list` | `hoody users securityhistory list` |
| `hoody vm agent get` | `hoody vm guestagent get` |
| `hoody vm agent inventory` | `hoody vm guestagent inventory get` |
| `hoody vm capabilities` | `hoody vm capabilities get` |
| `hoody vm display` | `hoody vm display get` |
| `hoody vm events all` | `hoody vm events stream` |
| `hoody vm force stop` | `hoody vm stop --force` |
| `hoody vm imports begin` | `hoody vm imports create` |
| `hoody vm isos begin` | `hoody vm isos create` |
| `hoody vm keys send` | `hoody vm keys press` |
| `hoody vm log` | `hoody vm logs get` |
| `hoody vm runs list` | `hoody vm unidentifiedruns list` |
| `hoody vm runs markdead` | `hoody vm unidentifiedruns force markdead` |
| `hoody wallet balance get` | `hoody wallet balances general get` |
| `hoody wallet github bonus claim` | `hoody wallet githubbonus claim` |
| `hoody wallet github bonus status` | `hoody wallet githubbonus status` |

The group `hoody bot-urls` is `hoody boturls`, and `hoody abuse` is `hoody abusenotices`, for every command in them.
The group `hoody screenshot` is gone: saving a screenshot is `hoody browser screenshots save`, `hoody display screenshots save`
or `hoody terminal sessions screenshots save`.

### CLI: group aliases removed (naming freeze)

The short group aliases that 1.0.0-beta.17 still accepted are removed. Type the group name. Each old alias exits with code 2 and
names the group.

| Removed alias | Use |
|---|---|
| `hoody br` | `hoody browser` |
| `hoody c` | `hoody computers` |
| `hoody d` | `hoody daemon` |
| `hoody sql` | `hoody db` |
| `hoody disp` | `hoody display` |
| `hoody ev` | `hoody events` |
| `hoody x` | `hoody exec` |
| `hoody f` | `hoody files` |
| `hoody fs` | `hoody files` |
| `hoody fw` | `hoody firewall` |
| `hoody img` | `hoody images` |
| `hoody m` | `hoody meta` |
| `hoody net` | `hoody network` |
| `hoody notif` | `hoody notifications` |
| `hoody p` | `hoody projects` |
| `hoody proj` | `hoody projects` |
| `hoody px` | `hoody proxy` |
| `hoody srv` | `hoody servers` |
| `hoody snap` | `hoody snapshots` |
| `hoody t` | `hoody terminal` |
| `hoody term` | `hoody terminal` |
| `hoody tun` | `hoody tunnel` |
| `hoody u` | `hoody users` |
| `hoody v` | `hoody vault` |

### CLI: flags (naming freeze)

A flag is named for the value it carries, never for the HTTP header that carries it. The header flags lost their
`--x-hoody-` prefix, a flag that takes an id ends in `-id`, and a flag that a global flag shadowed took a qualifying word.
These renames apply to every command that has the flag:

| Old | New | Commands |
|---|---|---|
| `--x-hoody-realm` | `--agent-realm` | every command that had it (257 commands) |
| `--x-hoody-config-dir` | `--config-dir` | every command that had it (234 commands) |
| `--x-hoody-cwd` | `--cwd` | every command that had it (232 commands) |
| `--x-hoody-computer` | `--tool-computer` | every command that had it (166 commands) |
| `--x-hoody-approver-lease` | `--approver-lease` | `agent gates approve`, `agent gates deny`, `agent sessions approverlease release`, `agent sessions approverlease renew`, `agent sessions tools run` |
| `--x-hoody-gate-policy` | `--gate-policy` | `agent sessions turns create`, `agent sessions turns run`, `agent sessions turns start` |
| `--x-expected-length` | `--expected-length` | `files append`, `files upload` |
| `--x-idempotency-key` | `--idempotency-key` | `notes document append`, `notes nodes create` |
| `--x-hoody-dir-scope` | `--dir-scope` | `agent tools run`, `agent tools start` |
| `--x-hoody-tool-mode` | `--tool-mode` | `agent tools run`, `agent tools start` |
| `--selector-template-<x>` (every template flag) | `--<x>`; the profile is `--run-profile`. The channel, variant and dry-run flags are removed (table below), and so is `--no-selector-template-dry-run`. `run recipes update --selector-template` (clears the block) stays | `run recipes create`, `run recipes update` |
| `--overrides-<x>` (every override flag) | `--<x>`; `--overrides-profile` is `--run-profile`. The channel, variant and dry-run flags are removed (table below), and so is `--no-overrides-dry-run` | `run recipes resolve`, `run recipes search` |
| `--selector-<x>` (every selector flag) | `--<x>`; `--selector-profile` is `--run-profile`. The channel, variant and dry-run flags are removed (table below), and so is `--no-selector-dry-run` | `run search` |

The `agent` commands that send the `X-Hoody-Computer` header now name it `--tool-computer`, because `--computer` is the global
flag that picks the computer the CLI talks to. In the same way the `X-Hoody-Realm` header is `--agent-realm`, not `--realm`.

Flags renamed, moved to a positional or removed on one command. "Positional" means the value is now typed after the
command words, without a flag:

| Command | Old flag | New |
|---|---|---|
| `hoody activity list` | `--realm-id` | `--realm` (the realm the command works in) |
| `hoody agent acp secrets set` | `--key` | `--secret` (the secret's name; the value stays `--value`) |
| `hoody agent bots channels chats delete` | `--chat` | `--chat-id` |
| `hoody agent bots channels chats delete` | `--cid` | `--channel-id` |
| `hoody agent bots channels chats update` | `--chat` | `--chat-id` |
| `hoody agent bots channels chats update` | `--cid` | `--channel-id` |
| `hoody agent bots channels create` | `--token` | `--bot-token` |
| `hoody agent bots channels credentials set` | `--cid` | `--channel-id` |
| `hoody agent bots channels credentials set` | `--token` | `--bot-token` |
| `hoody agent bots channels delete` | `--cid` | `--channel-id` |
| `hoody agent bots channels get` | `--cid` | `--channel-id` |
| `hoody agent bots channels pairing cancel` | `--cid` | `--channel-id` |
| `hoody agent bots channels pairing create` | `--cid` | `--channel-id` |
| `hoody agent bots channels principals add` | `--cid` | `--channel-id` |
| `hoody agent bots channels principals remove` | `--cid` | `--channel-id` |
| `hoody agent bots channels principals remove` | `--pid` | `--principal-id` |
| `hoody agent bots channels principals update` | `--cid` | `--channel-id` |
| `hoody agent bots channels principals update` | `--pid` | `--principal-id` |
| `hoody agent bots channels update` | `--cid` | `--channel-id` |
| `hoody agent bots delegates stop` | `--sid` | `--delegate-id` |
| `hoody agent bots logs stream` | `--last-event-id` | removed: resume with `--since` |
| `hoody agent bots messages keys get` | `--key` | `--idempotency-key` |
| `hoody agent completions create` | `--max-tokens` | removed: use `--settings-max-tokens` |
| `hoody agent gates answer` | `--id` | `--session-id` |
| `hoody agent gates approve` | `--id` | `--session-id` |
| `hoody agent gates deny` | `--id` | `--session-id` |
| `hoody agent gates suggest` | `--id` | `--session-id` |
| `hoody agent github auth login` | `--token` | `--github-token` (a GitHub personal access token) |
| `hoody agent github auth start` | `--token` | removed: to sign in with a token use `hoody agent github auth login --github-token <token>` |
| `hoody agent github repos clone` | `--dir` | `--clone-root` |
| `hoody agent logs list` | `--follow` | removed: follow the feed with `hoody agent logs stream` |
| `hoody agent logs list` | `-f` | removed: follow the feed with `hoody agent logs stream` |
| `hoody agent logs stream` | `--last-event-id` | removed: resume with `--since-seq` |
| `hoody agent loops create` | `--id` | `--session-id` |
| `hoody agent loops delete` | `--id` | `--session-id` |
| `hoody agent loops runs start` | `--id` | `--session-id` |
| `hoody agent loops update` | `--id` | `--session-id` |
| `hoody agent mcp test` | `--server-name` | `--name` |
| `hoody agent mcp upsert` | `--server-name` | `--name` |
| `hoody agent memory items delete` | `--name` | removed: use `--id` with `--kind slot` |
| `hoody agent pause` | `--paused` | removed: the command itself sets the value |
| `hoody agent providers accounts remove` | `--key` | `--account` |
| `hoody agent providers accounts use` | `--key` | `--account` |
| `hoody agent providers oauth code submit` | `--job` | `--job-id` |
| `hoody agent providers oauth poll` | `--job` | `--job-id` |
| `hoody agent realms use` | `--active-realm-id` | `--id` |
| `hoody agent resume` | `--paused` | removed: the command itself sets the value |
| `hoody agent sessions approverlease claim` | `--lease` | `--approver-lease` |
| `hoody agent sessions approverlease renew` | `--lease` | `--approver-lease` |
| `hoody agent sessions autoreply writes disable` | `--allow-writes` | removed: the command itself sets the value |
| `hoody agent sessions autoreply writes enable` | `--allow-writes` | removed: the command itself sets the value |
| `hoody agent sessions commands keys get` | `--key` | `--idempotency-key` |
| `hoody agent sessions commands keys retire` | `--key` | `--idempotency-key` |
| `hoody agent sessions create` | `--attach` | `--attach-session-id` |
| `hoody agent sessions create` | `--fork` | `--fork-session-id` (`--fork-turn-idx` stays) |
| `hoody agent sessions create` | `--x-hoody-computer` | removed: this command does not send the X-Hoody-Computer header |
| `hoody agent sessions create` | `--x-hoody-config-dir` | removed: this command does not send the X-Hoody-Config-Dir header |
| `hoody agent sessions create` | `--x-hoody-cwd` | removed: this command does not send the X-Hoody-Cwd header |
| `hoody agent sessions hoodyenv disable` | `--enabled` | removed: the command itself sets the value |
| `hoody agent sessions hoodyenv enable` | `--enabled` | removed: the command itself sets the value |
| `hoody agent sessions shells stop` | `--job-id` | `--shell-id` |
| `hoody agent sessions stream` | `--last-event-id` | removed: resume with `--since` |
| `hoody agent sessions tasks cancel` | `--tid` | `--task-id` |
| `hoody agent sessions tasks transcript get` | `--tid` | `--task-id` |
| `hoody agent sessions tools run` | `--name` | `--tool` |
| `hoody agent sessions turns create` | `--policy` | `--gate-policy` |
| `hoody agent sessions turns keys get` | `--key` | `--idempotency-key` |
| `hoody agent sessions turns keys retire` | `--key` | `--idempotency-key` |
| `hoody agent sessions turns run` | `--policy` | `--gate-policy` |
| `hoody agent sessions turns start` | `--policy` | `--gate-policy`, which this command takes with `--stream` |
| `hoody agent sessions waiters create` | `--from` | `--from-turn-id` |
| `hoody agent sessions waiters create` | `--target` | `--target-session-id` |
| `hoody agent sessions workflows start` | `--name` | `--workflow` |
| `hoody agent sessions yolo disable` | `--enabled` | removed: the command itself sets the value |
| `hoody agent sessions yolo enable` | `--enabled` | removed: the command itself sets the value |
| `hoody agent skills source get` | `--rel` | `--rel-dir` |
| `hoody agent skills source get` | `--root` | `--root-dir` |
| `hoody agent skills trust` | `--trusted` | removed: the command itself sets the value |
| `hoody agent skills untrust` | `--trusted` | removed: the command itself sets the value |
| `hoody agent todos create` | `--x-hoody-cwd` | removed: this command does not send the X-Hoody-Cwd header |
| `hoody agent todos proposals approve` | `--pid` | `--proposal-id` |
| `hoody agent todos proposals deny` | `--pid` | `--proposal-id` |
| `hoody agent todos update` | `--cwd` | `--todo-cwd` |
| `hoody agent todos update` | `--x-hoody-cwd` | removed: this command does not send the X-Hoody-Cwd header |
| `hoody agent workflows hide` | `--hidden` | removed: the command itself sets the value |
| `hoody agent workflows messages send` | `--id` | `--session-id` |
| `hoody agent workflows start` | `--x-hoody-computer` | removed: this command does not send the X-Hoody-Computer header |
| `hoody agent workflows start` | `--x-hoody-config-dir` | removed: this command does not send the X-Hoody-Config-Dir header |
| `hoody agent workflows start` | `--x-hoody-cwd` | removed: this command does not send the X-Hoody-Cwd header |
| `hoody agent workflows unhide` | `--hidden` | removed: the command itself sets the value |
| `hoody auth 2fa enrollment undo` | `--token` | `--link-token` |
| `hoody auth email change confirm` | `--token` | `--link-token` |
| `hoody auth email change undo` | `--token` | `--link-token` |
| `hoody auth email verify` | `--token` | `--link-token` |
| `hoody auth password reset` | `--token` | `--link-token` |
| `hoody auth tokens realms add` | `--realm-id` | positional: `hoody auth tokens realms add <realm-id>` |
| `hoody auth tokens realms remove` | `--realm-id` | positional: `hoody auth tokens realms remove <realm-id>` |
| `hoody browser restart` | `--no-viewport` | removed: use `--viewport null` |
| `hoody browser restart` | `--remote-debugging-port` | removed: the API ignores this value |
| `hoody browser screenshots capture` | `--quality` | `--jpeg-quality` |
| `hoody browser start` | `--no-viewport` | removed: use `--viewport null` |
| `hoody browser start` | `--remote-debugging-port` | removed: the API ignores this value |
| `hoody computers copy` | `--dev-kvm` | removed: use `--kvm` |
| `hoody computers copy` | `--target-project-id` | `--target-project` |
| `hoody computers create` | `--dev-kvm` | removed: use `--kvm` |
| `hoody computers create` | `--environment-vars` | `--env` |
| `hoody computers env delete` | `--key` | positional: `hoody computers env delete <key>` |
| `hoody computers env set` | `--key` | positional: `hoody computers env set <key>` |
| `hoody computers env update` | `--var KEY=VALUE` | `--env KEY=VALUE` (repeatable, or one JSON document) |
| `hoody computers list` | `--realm-id` | `--realm` (the realm the command works in) |
| `hoody computers proxy groups delete` | `--group-name` | positional: `hoody computers proxy groups delete <group-name>` |
| `hoody computers proxy groups ip set` | `--group-name` | positional: `hoody computers proxy groups ip set <group-name>` |
| `hoody computers proxy groups jwt set` | `--group-name` | positional: `hoody computers proxy groups jwt set <group-name>` |
| `hoody computers proxy groups password set` | `--group-name` | positional: `hoody computers proxy groups password set <group-name>` |
| `hoody computers proxy groups permissions clear` | `--group-name` | positional: `hoody computers proxy groups permissions clear <group-name>` |
| `hoody computers proxy groups permissions delete` | `--group-name` | positional: `hoody computers proxy groups permissions delete <group-name> <program>` |
| `hoody computers proxy groups permissions delete` | `--program` | positional: `hoody computers proxy groups permissions delete <group-name> <program>` |
| `hoody computers proxy groups permissions set` | `--group-name` | positional: `hoody computers proxy groups permissions set <group-name> <program>` |
| `hoody computers proxy groups permissions set` | `--program` | positional: `hoody computers proxy groups permissions set <group-name> <program>` |
| `hoody computers proxy groups token set` | `--group-name` | positional: `hoody computers proxy groups token set <group-name>` |
| `hoody computers update` | `--environment-vars` | `--env` |
| `hoody cron runs list` | `--key` | `--idempotency-key` |
| `hoody curl jobs stream` | `--last-event-id` | removed: resume with `--since` |
| `hoody daemon ephemeralprograms start` | `--directory` | `--cwd` |
| `hoody daemon ephemeralprograms start` | `--environment` | `--env` |
| `hoody daemon programs create` | `--directory` | `--cwd` |
| `hoody daemon programs create` | `--environment` | `--env` |
| `hoody daemon programs logs get` | `--follow` | removed: follow the feed with `hoody daemon programs logs stream` |
| `hoody daemon programs logs get` | `-f` | removed: follow the feed with `hoody daemon programs logs stream` |
| `hoody daemon programs logs stream` | `--id` | positional: `hoody daemon programs logs stream <id>` |
| `hoody daemon programs logs stream` | `--last-event-id` | removed: resume with `--offset` |
| `hoody daemon programs update` | `--directory` | `--cwd` |
| `hoody daemon programs update` | `--environment` | `--env` |
| `hoody db create` | `--path` | `--db` |
| `hoody db health` | `--verbose` | `--full` |
| `hoody display keyboard down` | `--window` | `--window-id` |
| `hoody display keyboard press` | `--window` | `--window-id` |
| `hoody display keyboard type` | `--window` | `--window-id` |
| `hoody display keyboard up` | `--window` | `--window-id` |
| `hoody display mouse click` | `--window` | `--window-id` |
| `hoody display mouse down` | `--window` | `--window-id` |
| `hoody display mouse move` | `--window` | `--window-id` |
| `hoody display mouse up` | `--window` | `--window-id` |
| `hoody display windows close` | `--window-id` | positional: `hoody display windows close <window-id>` |
| `hoody display windows focus` | `--window-id` | positional: `hoody display windows focus <window-id>` |
| `hoody display windows minimize` | `--window-id` | positional: `hoody display windows minimize <window-id>` |
| `hoody display windows move` | `--window-id` | positional: `hoody display windows move <window-id>` |
| `hoody display windows raise` | `--window-id` | positional: `hoody display windows raise <window-id>` |
| `hoody display windows resize` | `--window-id` | positional: `hoody display windows resize <window-id>` |
| `hoody display windows restore` | `--window-id` | positional: `hoody display windows restore <window-id>` |
| `hoody egress upstream lease renew` | `--lease-id` | positional: `hoody egress upstream lease renew <lease-id>` |
| `hoody events clear` | `--realm-id` | `--realm` (the realm the command works in) |
| `hoody events list` | `--realm-id` | `--realm` (the realm the command works in) |
| `hoody events stats` | `--realm-id` | `--realm` (the realm the command works in) |
| `hoody exec cache clear` | `--script-path` | removed: the API ignores this value |
| `hoody exec logs clear` | `--confirm true` | removed: the command asks before it deletes; pass `--yes` to skip the question |
| `hoody exec logs get` | `--follow` | removed: follow the feed with `hoody exec logs stream` |
| `hoody exec logs get` | `-f` | removed: follow the feed with `hoody exec logs stream` |
| `hoody exec logs get` | `--search` | `--query` |
| `hoody exec magiccomments batch update` | `--comments-tokens` | `--comments-token` (repeat it for each token) |
| `hoody exec magiccomments batch update` | `--directory` | `--dir` |
| `hoody exec magiccomments get` | `--path` | positional: `hoody exec magiccomments get <path>` |
| `hoody exec magiccomments update` | `--comments-tokens` | `--comments-token` (repeat it for each token) |
| `hoody exec magiccomments update` | `--path` | positional: `hoody exec magiccomments update <path>` |
| `hoody exec openapi generate` | `--directories` | removed: use `--dir`; for several directories, use `hoody exec openapi merge --dirs` |
| `hoody exec openapi generate` | `--directory` | `--dir` |
| `hoody exec openapi get` | `--directory` | removed: use `--dir` |
| `hoody exec openapi merge` | `--directories` | `--dirs` |
| `hoody exec openapi schema get` | `--path` | removed: use `--file` |
| `hoody exec openapi schema validate` | `--path` | removed: use `--file` |
| `hoody exec openapi scripts list` | `--directory` | removed: use `--dir` |
| `hoody exec routes list` | `--base-dir` | `--dir` |
| `hoody exec scripts delete` | `--confirm true` | removed: the command asks before it deletes; pass `--yes` to skip the question |
| `hoody exec scripts delete` | `--keep-copy true`, `--keep-copy false`, `--keep-copy=false` | `--keep-copy` for true, `--no-keep-copy` for false: where a script wrote `--keep-copy false`, write `--no-keep-copy`. The old value forms are not all refused by name: after the path, `--keep-copy false` fails with "too many arguments" (exit 1); `--keep-copy=false` is an unknown option (exit 1); with the path left out, it exits 1 with `error: --keep-copy takes no value (got "--keep-copy false"): pass --keep-copy for true or --no-keep-copy for false.` |
| `hoody exec scripts delete` | `--path` | positional: `hoody exec scripts delete <path>` |
| `hoody exec scripts read` | `--path` | positional: `hoody exec scripts read <path>` |
| `hoody exec scripts tree get` | `--base-dir` | `--dir` |
| `hoody exec scripts write` | `--path` | positional: `hoody exec scripts write <path>` |
| `hoody exec sdks delete` | `--id` | positional: `hoody exec sdks delete <id>` |
| `hoody exec sdks get` | `--id` | positional: `hoody exec sdks get <id>` |
| `hoody exec sdktypes list` | `--q` | `--query` |
| `hoody exec templates delete` | `--name` | positional: `hoody exec templates delete <name>` |
| `hoody exec templates generate` | `--name` | positional: `hoody exec templates generate <name>` |
| `hoody exec templates preview` | `--name` | positional: `hoody exec templates preview <name>` |
| `hoody exec templates update` | `--name` | positional: `hoody exec templates update <name>` |
| `hoody files archives extract` | `--extract` | `--member` |
| `hoody files archives members extract` | `--extract` | positional: `hoody files archives members extract <archive> [member]` |
| `hoody files archives members read` | `--preview` | positional: `hoody files archives members read <archive> <member>` |
| `hoody files archives preview` | `--contents` | removed: the command lists the archive; to read one member use `hoody files archives members read <archive> <member>` |
| `hoody files archives preview` | `--preview` | removed: to read one member use `hoody files archives members read <archive> <member>` |
| `hoody files backends box create` | `--token` | `--backend-token` |
| `hoody files backends drive create` | `--token` | `--backend-token` |
| `hoody files backends dropbox create` | `--token` | `--backend-token` |
| `hoody files backends filefabric create` | `--token` | `--backend-token` |
| `hoody files backends googlecloudstorage create` | `--token` | `--backend-token` |
| `hoody files backends googlephotos create` | `--proxy` | `--proxy-url` |
| `hoody files backends googlephotos create` | `--token` | `--backend-token` |
| `hoody files backends hidrive create` | `--token` | `--backend-token` |
| `hoody files backends jottacloud create` | `--token` | `--backend-token` |
| `hoody files backends linkbox create` | `--token` | `--backend-token` |
| `hoody files backends mailru create` | `--token` | `--backend-token` |
| `hoody files backends mega create` | `--master-key`, `--session-id` | removed: internal use only |
| `hoody files backends mega create` | `--password` | `--pass` |
| `hoody files backends onedrive create` | `--token` | `--backend-token` |
| `hoody files backends pcloud create` | `--token` | `--backend-token` |
| `hoody files backends premiumizeme create` | `--token` | `--backend-token` |
| `hoody files backends protondrive create` | `--client-access-token`, `--client-refresh-token`, `--client-salted-key-pass`, `--client-uid` | removed: internal use only |
| `hoody files backends putio create` | `--token` | `--backend-token` |
| `hoody files backends sftp create` | `--key` | `--key-pem` |
| `hoody files backends sftp create` | `--passphrase` | `--key-file-pass` |
| `hoody files backends sftp create` | `--password` | `--pass` |
| `hoody files backends sharefile create` | `--token` | `--backend-token` |
| `hoody files backends yandex create` | `--token` | `--backend-token` |
| `hoody files backends zoho create` | `--token` | `--backend-token` |
| `hoody files delete` | `--backend` | `--backend-id` |
| `hoody files ftp get` | `--type` | removed: the command already selects it; leave it out |
| `hoody files get` | `--backend` | `--backend-id` |
| `hoody files get` | `--contents` | removed: use `hoody files archives preview <archive>` |
| `hoody files get` | `--glob` | removed: use `hoody files glob <path> --pattern <pattern>` (or `hoody files grep --glob` as the file filter) |
| `hoody files get` | `--grep` | removed: use `hoody files grep <path> --pattern <pattern>` |
| `hoody files get` | `--preview` | removed: use `hoody files archives preview <archive>`, or `hoody files archives members read <archive> <member>` for one member |
| `hoody files get` | `--q` | removed: use `hoody files search <directory> --query <text>`; JPEG quality is `hoody files images convert --jpeg-quality` |
| `hoody files get` | `--sha256` | removed: use `--hash` |
| `hoody files get` | `--stat` | removed: use `hoody files stat <path>` |
| `hoody files get` | `--thumbnail` | removed: use `hoody files images convert <image>` |
| `hoody files get` | `--thumbnail-format` | removed: use `hoody files images convert <image> --format` |
| `hoody files get` | `--zip` | removed: use `hoody files zip <directory>` |
| `hoody files get` | `--ignore-case`, `--no-ignore-case`, `--fixed-string`, `--no-fixed-string`, `--context`, `--max-count`, `--max-matches`, `--max-filesize` | removed: they belong to grep; use `hoody files grep <path>` |
| `hoody files get` | `--max-depth`, `--timeout`, `--no-ignore`, `--hidden`, `--no-hidden` | removed: they belong to grep and glob; use `hoody files grep <path>` or `hoody files glob <path>` |
| `hoody files get` | `--max-results`, `--max-files-scanned`, `--sort`, `--order` | removed: they belong to glob; use `hoody files glob <path>` |
| `hoody files get` | `--size`, `--width`, `--height`, `--resize`, `--quality`, `--blur`, `--grayscale`, `--bg` | removed: they belong to the thumbnail; use `hoody files images convert <image>` |
| `hoody files images convert` | `--q` | `--jpeg-quality` |
| `hoody files mkdir` | `--backend` | `--backend-id` |
| `hoody files s3 get` | `--type` | removed: the command already selects it; leave it out |
| `hoody files search` | `--q` | `--query` |
| `hoody files ssh get` | `--type` | removed: the command already selects it; leave it out |
| `hoody files stat` | `--backend` | `--backend-id` |
| `hoody files upload` | `--backend` | `--backend-id` |
| `hoody files webdav get` | `--type` | removed: the command already selects it; leave it out |
| `hoody inbox list` | `--read-only` | `--read` |
| `hoody inbox list` | `--unread-only` | `--unread` |
| `hoody kv changes stream` | `--last-event-id` | removed: resume with `--since` |
| `hoody kv table rollback` | `--confirm yes` | removed: pass `--yes` to skip the question, or `--preview` to see the changes |
| `hoody kv table rollback` | `--dry-run` | removed: it was renamed to `--preview` |
| `hoody network update` | `--proxy` | `--proxy-url` |
| `hoody notes document exporttickets create` | `--file-name` | `--filename` |
| `hoody notes document get` | `--output` | `--format` |
| `hoody notes records search` | `--q` | `--query` |
| `hoody notifications send` | `--display` | `--display-id` |
| `hoody notifications stream` | `--displays` | `--display-ids` (a comma-separated list, or `all`) |
| `hoody pipe receive` | `--output` | `--out-file` |
| `hoody pipe status` | `--transfer` | `--transfer-id` |
| `hoody projects list` | `--realm-id` | `--realm` (the realm the command works in) |
| `hoody projects permissions remove` | `--permission-id` | positional: `hoody projects permissions remove <permission-id>` |
| `hoody projects permissions update` | `--permission-id` | positional: `hoody projects permissions update <permission-id>` |
| `hoody projects proxy groups delete` | `--group-name` | positional: `hoody projects proxy groups delete <group-name>` |
| `hoody projects proxy groups ip set` | `--group-name` | positional: `hoody projects proxy groups ip set <group-name>` |
| `hoody projects proxy groups jwt set` | `--group-name` | positional: `hoody projects proxy groups jwt set <group-name>` |
| `hoody projects proxy groups password set` | `--group-name` | positional: `hoody projects proxy groups password set <group-name>` |
| `hoody projects proxy groups permissions clear` | `--group-name` | positional: `hoody projects proxy groups permissions clear <group-name>` |
| `hoody projects proxy groups permissions delete` | `--group-name` | positional: `hoody projects proxy groups permissions delete <group-name> <program>` |
| `hoody projects proxy groups permissions delete` | `--program` | positional: `hoody projects proxy groups permissions delete <group-name> <program>` |
| `hoody projects proxy groups permissions set` | `--group-name` | positional: `hoody projects proxy groups permissions set <group-name> <program>` |
| `hoody projects proxy groups permissions set` | `--program` | positional: `hoody projects proxy groups permissions set <group-name> <program>` |
| `hoody projects proxy groups token set` | `--group-name` | positional: `hoody projects proxy groups token set <group-name>` |
| `hoody projects proxy usage get` | `--id` | `--project <id>` (the project is a scope flag on `projects proxy` commands) |
| `hoody proxy aliases list` | `--realm-id` | `--realm` (the realm the command works in) |
| `hoody proxy logs list` | `--computer-id` | removed: the API ignores it; the computer you select (`--computer` / `-c`) scopes the logs |
| `hoody proxy logs list` | `--follow` | removed: follow the feed with `hoody proxy logs stream` |
| `hoody proxy logs list` | `--project-id` | removed: the API ignores it; the computer you select (`--computer` / `-c`) scopes the logs |
| `hoody proxy logs list` | `-f` | removed: follow the feed with `hoody proxy logs stream` |
| `hoody proxy logs stream` | `--computer-id` | removed: the API ignores it; the computer you select (`--computer` / `-c`) scopes the logs |
| `hoody proxy logs stream` | `--last-event-id` | removed: the command resumes by itself after a dropped connection; `--after-id` limits the first batch of a new stream to entries after that row id |
| `hoody proxy logs stream` | `--project-id` | removed: the API ignores it; the computer you select (`--computer` / `-c`) scopes the logs |
| `hoody run jobs search start` | `--channel`, `--variant` | removed: hoody-run does not apply it yet |
| `hoody run jobs search start` | `--dry-run`, `--no-dry-run` | removed: hoody-run never executes; the output is always command-only |
| `hoody run jobs search start` | `--profile` | `--run-profile` |
| `hoody run recipes create` | `--channel`, `--variant` | removed: hoody-run does not apply it yet |
| `hoody run recipes create` | `--dry-run`, `--no-dry-run` | removed: hoody-run never executes; the output is always command-only |
| `hoody run recipes resolve` | `--channel`, `--variant` | removed: hoody-run does not apply it yet |
| `hoody run recipes resolve` | `--dry-run`, `--no-dry-run` | removed: hoody-run never executes; the output is always command-only |
| `hoody run recipes search` | `--channel`, `--variant` | removed: hoody-run does not apply it yet |
| `hoody run recipes search` | `--dry-run`, `--no-dry-run` | removed: hoody-run never executes; the output is always command-only |
| `hoody run recipes update` | `--channel`, `--variant` | removed: hoody-run does not apply it yet |
| `hoody run recipes update` | `--dry-run`, `--no-dry-run` | removed: hoody-run never executes; the output is always command-only |
| `hoody run resolve` | `--channel`, `--variant` | removed: hoody-run does not apply it yet |
| `hoody run resolve` | `--dry-run`, `--no-dry-run` | removed: hoody-run never executes; the output is always command-only |
| `hoody run resolve` | `--profile` | `--run-profile` |
| `hoody run search` | `--channel`, `--variant` | removed: hoody-run does not apply it yet |
| `hoody run search` | `--dry-run`, `--no-dry-run` | removed: hoody-run never executes; the output is always command-only |
| `hoody run test` | `--channel`, `--variant` | removed: hoody-run does not apply it yet |
| `hoody run test` | `--dry-run`, `--no-dry-run` | removed: hoody-run never executes; the output is always command-only |
| `hoody run test` | `--profile` | `--run-profile` |
| `hoody servers plans quote` | `--plan-id` | positional: `hoody servers plans quote <plan-id>` |
| `hoody snapshots alias set` | `--name` | positional: `hoody snapshots alias set <name>` |
| `hoody snapshots delete` | `--name` | positional: `hoody snapshots delete <name>` |
| `hoody snapshots restore` | `--name` | positional: `hoody snapshots restore <name>` |
| `hoody storage computers shares list` | `--realm-id` | `--realm` (the realm the command works in) |
| `hoody storage incoming list` | `--realm-id` | `--realm` (the realm the command works in) |
| `hoody storage incoming mount` | `--share-id` | positional: `hoody storage incoming mount <share-id>` |
| `hoody storage incoming unmount` | `--share-id` | positional: `hoody storage incoming unmount <share-id>` |
| `hoody storage shares create` | `--target-computer-id` | `--target-computer` |
| `hoody storage shares create` | `--target-project-id` | `--target-project` |
| `hoody storage shares get` | `--share-id` | positional: `hoody storage shares get <share-id>` |
| `hoody storage shares list` | `--realm-id` | `--realm` (the realm the command works in) |
| `hoody storage shares update` | `--share-id` | positional: `hoody storage shares update <share-id>` |
| `hoody terminal sessions connect` | `--display-id` | removed: use `--display` |
| `hoody terminal sessions connect` | `--env-inject`, `--no-env-inject` | `--inject-hoody-env`, `--no-inject-hoody-env` |
| `hoody terminal sessions connect` | `--readonly` | `--read-only` |
| `hoody terminal sessions connect` | `--terminal-id` | positional: `hoody terminal sessions connect <terminal-id>` |
| `hoody terminal sessions keys press` | `--terminal-id` | positional: `hoody terminal sessions keys press <terminal-id>` |
| `hoody terminal sessions list` | `--history-lines` | removed: use `--history-limit` |
| `hoody terminal sessions mouseevents send` | `--terminal-id` | positional: `hoody terminal sessions mouseevents send <terminal-id>` |
| `hoody terminal sessions paste` | `--terminal-id` | positional: `hoody terminal sessions paste <terminal-id>` |
| `hoody terminal sessions read` | `--terminal-id` | positional: `hoody terminal sessions read <terminal-id>` |
| `hoody terminal sessions screenshots capture` | `--fontsize` | `--font-size` |
| `hoody terminal sessions screenshots capture` | `--terminal-id` | positional: `hoody terminal sessions screenshots capture <terminal-id>` |
| `hoody terminal sessions search` | `--terminal-id` | positional: `hoody terminal sessions search <terminal-id>` |
| `hoody terminal sessions snapshot get` | `--terminal-id` | positional: `hoody terminal sessions snapshot get <terminal-id>` |
| `hoody terminal sessions wait` | `--terminal-id` | positional: `hoody terminal sessions wait <terminal-id>` |
| `hoody terminal sessions write` | `--terminal-id` | positional: `hoody terminal sessions write <terminal-id>` |
| `hoody vault clear` | `--realm-id` | `--realm` (the realm the command works in) |
| `hoody vault delete` | `--realm-id` | `--realm` (the realm the command works in) |
| `hoody vault get` | `--realm-id` | `--realm` (the realm the command works in) |
| `hoody vault list` | `--realm-id` | `--realm` (the realm the command works in) |
| `hoody vault set` | `--realm-id` | `--realm` (the realm the command works in) |
| `hoody vault stats` | `--realm-id` | `--realm` (the realm the command works in) |
| `hoody vm create` | `--display-id` | removed: use `--display` |
| `hoody vm events stream` | `--name` | positional: `hoody vm events stream <name>` |
| `hoody vm update` | `--display-id` | removed: use `--display` |
| `hoody watch delete` | `--id` | positional: `hoody watch delete <id>` |
| `hoody watch events list` | `--id` | positional: `hoody watch events list <id>` |
| `hoody watch events stream` | `--id` | positional: `hoody watch events stream <id>` |
| `hoody watch get` | `--id` | positional: `hoody watch get <id>` |
| `hoody watch update` | `--id` | positional: `hoody watch update <id>` |

Flags of the hand-written commands:

| Command | Old flag | New |
|---|---|---|
| `hoody agent prompt` | `-y, --yes` | `--gate-policy auto_approve` |
| `hoody agent prompt` | `--session <id>` | `--session-id <id>` |
| `hoody shell` | `--readonly` | `--read-only` |
| `hoody terminal open` | `--readonly` | `--read-only` |
| `hoody display open` | `--readonly` | `--read-only` |
| `hoody daemon programs terminal connect` | `--readonly` | `--read-only` |
| `hoody browser screenshots save` | `--path <path>` | `--out-file <path>` |
| `hoody display screenshots save` | `--path <path>` | `--out-file <path>` |
| `hoody terminal sessions screenshots save` | `--path <path>` | `--out-file <path>` |
| `hoody terminal sessions screenshots save` | `--fontsize` | `--font-size` |
| `hoody pipe receive` | `-o <file>` | `--out-file <file>` |
| `hoody events stream` | `--type` | `--event-type` |
| `hoody boturls answer` | `--gate <handle>` | `--gate-id <handle>` |
| `hoody mount` | `-v, --verbose` | `--full` (with `--list`: also show the kit URL, subpath and start time) |
| `hoody login` | `--oauth` | `--web` |
| `hoody tunnel expose` | `--to <target>` | positional: `hoody tunnel expose <target>` |
| `hoody tunnel expose` | `--url <url>` | positional: `hoody tunnel expose http://localhost:3000` (a target with `://` is read as a URL) |
| `hoody tunnel pull` | `--to <target>` | positional: `hoody tunnel pull <target>` |
| `hoody tunnel pull` | `--url <url>` | positional: `hoody tunnel pull http://localhost:5432` (a target with `://` is read as a URL) |
| `hoody pipe send` | `--inline` | removed: had no effect (use `--filename` to name the attachment) |
| `hoody pipe receive` | `--json` | removed: had no effect |
| `hoody pipe receive` | `--no-progress` | removed: had no effect |
| `hoody browser screenshots save` | `--quality` | `--jpeg-quality` |
| `hoody terminal sessions screenshots save` | `--terminal-id <id>` | positional: `hoody terminal sessions screenshots save [terminal-id]` (terminal 1 when you leave it out) |
| `hoody run` | `--env <name>` | `--local-env <name>` (the name of a variable in your local shell; repeatable) |
| `hoody exec remote send`, `call`, `connect` | `--json` (read the arguments as JSON) | `--json-args`. For JSON output use `-o json` |
| `hoody exec <script>` (a script with no schema) | `--query <key=value>` | `--query-param <key=value>` (repeatable) |

Flags of the `open` commands. They were spelled like the keys of the page's URL; they now follow the CLI's names. Apart
from the two noted below the table, the URL each command builds is the same:

| Command | Old flag | New |
|---|---|---|
| `hoody files open` | `--directory` | `--dir` |
| `hoody files open` | `--q` | `--query` (the search text) |
| `hoody pipe open` | `--n` | `--receivers` (or `-n`) |
| `hoody pipe open` | `--audio 1`, `--audio 0` | `--audio`, `--no-audio` |
| `hoody pipe open` | `--live 1` | `--live` |
| `hoody pipe open` | `--sha256 1` | `--sha256` |
| `hoody terminal open`, `hoody agent open`, `hoody display open` | `--parent-origin` | `--embedder-origin` |
| `hoody terminal open`, `hoody agent open` | `--panel-width-pct <n>` | `--panel-width <n>%` (it also takes pixels, such as `400px`) |
| `hoody terminal open`, `hoody agent open` | `--panel-height-pct <n>` | `--panel-height <n>%` (it also takes pixels, such as `400px`) |
| `hoody display open` | `--menu`, `--no-menu` | `--toolbar`, `--no-toolbar` |
| `hoody display open`, `hoody exec open` | `--query <key=value>` | `--query-param <key=value>` (repeatable) |
| `hoody desktop open` | `--env` | `--desktop-env` |
| `hoody open` | `--env` | `--desktop-env` |
| `hoody notifications open` | `--displays`, `--display` | `--display-ids` |

Each old flag exits with code 2, for example `error: --parent-origin is not an option of this command: it was renamed to
--embedder-origin.` A switch given a value (`--live 1`, `--sha256 1`, `--audio 0`) exits with code 1 and says the switch
takes no value. `--panel-width 40%` and `--toolbar` send other URL keys than the old flags did, with the same result on the
page.

Other flag spellings that are gone:

- **`--format`** is no longer a spelling of the global `--output` (`-o`). Use `-o json`, `-o yaml` or `-o table`. A command
  that has its own `--format` field (for example the six below, or `hoody browser screenshots capture --format`) uses
  it as that field. Any other command refuses `--format` (exit 2) and names `--output`.
- **On six commands `--format` is now the command's own field, and it is sent to the server.** These are
  `hoody run search`, `hoody run recipes create`, `hoody run recipes update`, `hoody run recipes resolve`,
  `hoody run recipes search` and `hoody notes document get`. Before, `--format` there meant the output format, and the
  field was `--selector-format`, `--selector-template-format`, `--overrides-format` or, on `notes document get`,
  `--output`. To choose the output format on these commands, use `-o` or `--output` (on `notes document get`, use `-o`).
  `hoody notes document get --output` is refused (exit 2) and says it was renamed to `--format`.
- **`--format` no longer chooses the output of `hoody config get`, `config validate`, `events stream` and
  `computers wait`.** Use the global `-o` (`--output`):

  | Old | New |
  |---|---|
  | `hoody config get --format json`, `yaml` or `table` | `-o json`, `-o yaml` or `-o table` (the whole file only; JSON is the default) |
  | `hoody config validate --format json` | `-o json` |
  | `hoody config validate --format text` | leave it out: text is the default |
  | `hoody events stream --format ndjson` | `-o ndjson` (or `-o json`), or leave it out |
  | `hoody computers wait --format json` | `-o json`, or leave it out |

  `--format` exits with code 2 and names the `-o` value, for example `error: --format is not an option of this command: use
  -o json, or leave it out: JSON is the only output.` (`computers wait`).
- **`--json` on the hand-written commands is replaced by the global `-o json`** (`--output json`). These commands take
  `-o json` and refuse `--json`: `hoody support create` and `reply`; `hoody boturls ask`, `chat`, `status`, `answer`,
  `models list`, `updates list` and `events stream`; `hoody mount` and `hoody unmount`; `hoody share list` and `stop`;
  `hoody local lock status` and `doctor`; `hoody pipe send`, `share`, `status` and `progress stream`; and `hoody run <app>`,
  `run close` and `run status`. `--json` exits with code 2: `error: --json is not an option of this command: it was replaced
  by the global -o json (--output json).` For JSON lines, `boturls events stream` and `pipe progress stream` take `-o ndjson`
  as well as `-o json`. `-o json` prints the JSON that `--json` printed. Type `-o json` on the command line: on most of these
  commands an output format saved in the config file does not switch them to JSON.
- **`--computer-id`** is no longer a spelling of the global `--computer`. Use `--computer` (or `-c`). A command that has its
  own `--computer-id` field keeps it as that field: `hoody events list`, `hoody events stream`, `hoody proxy aliases list`,
  `hoody proxy aliases create`, `hoody boturls list`, `hoody boturls create` and `hoody boturls repoint`. Any other command
  refuses `--computer-id` (exit 2) and names `--computer`.
- **`--realm-id`** is no longer a spelling of the global `--realm`. Use `--realm`. Every command refuses `--realm-id` (exit 2)
  and names `--realm`, except `hoody auth tokens realms add` and `remove`, which now take the realm as a positional. The
  commands that had a realm filter of that name lost it (table above), because `--realm` already picks the realm the
  command works in.
- **Casing variants of the global flags** are refused: `--computerId`, `--computerid`, `--computer_id`, `--realmId`,
  `--realm_id`, `--baseUrl`, `--baseurl`, `--base_url`, `--kitAuth`, `--kit_auth`, `--kitUser`, `--kit_user`, `--kitToken`,
  `--kit_token`, `--kitTokenHeader`, `--kit_token_header`, `--noColor`, `--nonInteractive` and `--refreshScripts`. Type the
  kebab-case flag (`--computer`, `--realm`, `--base-url`, `--kit-auth`, `--kit-user`, `--kit-token`, `--kit-token-header`,
  `--no-color`, `--non-interactive`, `--refresh-scripts`).
- **`--browser-id` spellings** `--instance`, `--instance-id`, `--instanceId`, `--instanceid`, `--instance_id`, `--browserId`,
  `--browserid` and `--browser_id` on the `browser` commands are refused. Use `--browser-id`.
- **`--preview` is gone from `hoody files archives preview`,** which lists the archive. To read one member, give it as
  the second argument: `hoody files archives members read <archive> <member>`.
- **Hidden flags that did nothing** on eight `files` commands are removed: `--mkdir`, `--json` (on `files search`), `--touch`,
  `--zip`, `--downloads`, `--download-history`, `--extraction-history` and `--thumbnail` (on `files convert`).
- **`hoody files get` only lists a directory or reads a file.** Its other modes are removed, and each old flag names
  the command that does that job: `hoody files stat`, `files archives preview`, `files archives members read`,
  `files grep`, `files glob`, `files search`, `files images convert` and `files zip`. The flags that only those modes
  read are removed with them (table above). In the SDK, `files.get()` refuses the same option keys and names the method
  to call (table below).
- **`-f` / `--follow` on a read** is removed. Follow a feed with its `stream` command: `hoody agent logs stream`,
  `hoody daemon programs logs stream <id>`, `hoody proxy logs stream`, `hoody exec logs stream`.
- **`--last-event-id`** is removed from the stream commands. Resume with the stream's own cursor (`--since`, `--since-seq`
  or `--offset`, shown in the table above). `hoody proxy logs stream` has no resume flag: it resumes by itself after a
  dropped connection, and its `--after-id` only limits the first batch of a new stream to entries after that row id.
- **The ids in `agent` and `notes` stay named flags.** Where `--id` meant the session on a command whose first resource is not
  the session, it is now `--session-id` (`agent gates approve|deny|answer|suggest`, `agent loops create|update|delete`,
  `agent loops runs start`, `agent workflows messages send`).
- **Deleting or stopping everything needs `--all`.** `hoody agent work stop` stops nothing by itself: it exits with code 2
  and names `hoody agent work stop --all`. `hoody agent sessions tasks cancel --all` cancels every task of the session, and
  `hoody boturls keys revoke <id> --all` revokes every key of the Bot URL.

### CLI: output that changed with the flags (naming freeze)

Four commands print differently now, on purpose:

- `hoody config get -o yaml` prints the config file as YAML. It printed JSON.
- `hoody config validate -o json` prints the result as JSON. It printed the text report.
- `hoody events stream`, `hoody computers wait`, `hoody config validate` and `hoody config get` (the whole file) refuse an
  `-o` value they do not print, with exit code 2. `events stream` takes `-o ndjson` or `-o json`, `computers wait` takes
  `-o json`, `config validate` takes `-o json` or `-o table` (the text), and `config get` takes `-o json`, `-o yaml` or
  `-o table`. For example: `error: events stream writes ndjson only: use -o ndjson (or -o json), or leave -o out (got -o
  table).`
- `hoody exec remote send`, `call` and `connect` with `--json-args` draw their output on a terminal as they do without it.
  The old `--json` also switched a terminal to the plain output. For JSON output, use `-o json`.

### CLI: a computer given twice (naming freeze)

`hoody shell <computer>` and bare `hoody agent <computer>` (which now opens `hoody hub`) refuse a second, different computer typed with `-c` or `--computer`:
they exit 2 before anything is sent, with `Error: two different computers given: "B" as the argument and "A" with
--computer. Pass one.` Before, the argument won and the flag was dropped. The same computer given both ways is used once:
`hoody -c A shell A` opens a shell on A, where it used to run a command called `A`. To run that command, write
`hoody -c A shell -- A`. Only a typed `-c` or `--computer` counts; `HOODY_COMPUTER` and the saved computer still give way
to the argument. In `hoody shell`, the first word is read as a computer only when it is a computer id or a `--` follows
it, so `hoody -c A shell ls` still runs `ls` on A.

### SDK: old accessor to new accessor (naming freeze)

Accessors are written from the client, as in the tables further down. Pagination helpers (`listAll`, `listIterator`) move with
their method. Request, response and event type names follow the final method name (`<Ns><Service><Method>Request`).

| Old | New |
|---|---|
| `client.agent.audio.streamSpeech` | `client.agent.audio.createSpeech(data, { stream: true })` |
| `client.agent.audio.streamTranscription` | `client.agent.audio.createTranscription(data, { stream: true })` |
| `client.agent.bots.channels.createPrincipal` | `client.agent.bots.channels.addPrincipal` |
| `client.agent.bots.channels.deletePrincipal` | `client.agent.bots.channels.removePrincipal` |
| `client.agent.bots.decideGate` | `client.agent.bots.answerGate` |
| `client.agent.bots.forget` | `client.agent.bots.clearConversation` |
| `client.agent.bots.getChannelSettings` | `client.agent.bots.channels.getSettings` |
| `client.agent.bots.getLog` | `client.agent.bots.getLogs` |
| `client.agent.bots.getMessageByKey` | `client.agent.bots.messages.getByKey` |
| `client.agent.bots.purgeArchive` | `client.agent.bots.clearArchive` |
| `client.agent.bots.resume` | `client.agent.bots.resumeAll` |
| `client.agent.bots.sendAudioMessage` | `client.agent.bots.messages.sendAudio` |
| `client.agent.bots.sendMessage` | `client.agent.bots.messages.send` |
| `client.agent.bots.stream` | `client.agent.bots.streamLogs` |
| `client.agent.bots.updateChannelSettings` | `client.agent.bots.channels.updateSettings` |
| `client.agent.github.checkoutPr` | `client.agent.github.prs.checkout` |
| `client.agent.github.clone` | `client.agent.github.repos.clone` |
| `client.agent.github.createBranch` | `client.agent.github.branches.create` |
| `client.agent.github.createCommit` | `client.agent.github.commits.create` |
| `client.agent.github.createPr` | `client.agent.github.prs.create` |
| `client.agent.github.createWorktree` | `client.agent.github.worktrees.create` |
| `client.agent.github.deleteBranch` | `client.agent.github.branches.delete` |
| `client.agent.github.deleteWorktree` | `client.agent.github.worktrees.delete` |
| `client.agent.github.diff` | `client.agent.github.getDiff` |
| `client.agent.github.getAuth` | `client.agent.github.auth.getStatus` |
| `client.agent.github.getRemoteBranch` | `client.agent.github.branches.getRemote` |
| `client.agent.github.listBranches` | `client.agent.github.branches.list` |
| `client.agent.github.listCommits` | `client.agent.github.commits.list` |
| `client.agent.github.listPrs` | `client.agent.github.prs.list` |
| `client.agent.github.listRepos` | `client.agent.github.repos.list` |
| `client.agent.github.listWorktrees` | `client.agent.github.worktrees.list` |
| `client.agent.github.login` | `client.agent.github.auth.start()` (device sign-in) / `client.agent.github.auth.login({ token })` |
| `client.agent.github.logout` | `client.agent.github.auth.logout` |
| `client.agent.github.mergePr` | `client.agent.github.prs.merge` |
| `client.agent.github.pollLogin` | `client.agent.github.auth.poll` |
| `client.agent.github.resolveRepo` | `client.agent.github.repos.resolve` |
| `client.agent.github.setRepoCredentials` | `client.agent.github.repos.setCredentials` |
| `client.agent.github.suggestCommitMessage` | `client.agent.github.commits.suggestMessage` |
| `client.agent.github.useBranch` | `client.agent.github.branches.use` |
| `client.agent.headless.stream` | `client.agent.headless.start(data, { stream: true })` |
| `client.agent.mcp.deleteServer` | `client.agent.mcp.delete` |
| `client.agent.mcp.disableServer` | `client.agent.mcp.disable` |
| `client.agent.mcp.enableServer` | `client.agent.mcp.enable` |
| `client.agent.mcp.importServers` | `client.agent.mcp.import` |
| `client.agent.mcp.listServers` | `client.agent.mcp.list` |
| `client.agent.mcp.testServer` | `client.agent.mcp.test` |
| `client.agent.mcp.upsertServer` | `client.agent.mcp.upsert` |
| `client.agent.memory.createItem` | `client.agent.memory.items.create` |
| `client.agent.memory.deleteItem` | `client.agent.memory.items.delete` |
| `client.agent.memory.getItem` | `client.agent.memory.items.get` |
| `client.agent.memory.listItems` | `client.agent.memory.items.list` |
| `client.agent.memory.updateItem` | `client.agent.memory.items.update` |
| `client.agent.pause.get` | `client.agent.getPauseState` |
| `client.agent.pause.set` | `client.agent.pause()` / `client.agent.resume()` |
| `client.agent.providers.addAccount` | `client.agent.providers.accounts.add` |
| `client.agent.providers.cancelOauth` | `client.agent.providers.oauth.cancel` |
| `client.agent.providers.getAuth` | `client.agent.providers.auth.getStatus` |
| `client.agent.providers.listAccounts` | `client.agent.providers.accounts.list` |
| `client.agent.providers.logoutOauth` | `client.agent.providers.oauth.logout` |
| `client.agent.providers.pollOauth` | `client.agent.providers.oauth.poll` |
| `client.agent.providers.removeAccount` | `client.agent.providers.accounts.remove` |
| `client.agent.providers.setDefaultAuth` | `client.agent.providers.auth.setDefault` |
| `client.agent.providers.startOauth` | `client.agent.providers.oauth.start` |
| `client.agent.providers.submitOauthCode` | `client.agent.providers.oauth.submitCode` |
| `client.agent.providers.testAuth` | `client.agent.providers.auth.test` |
| `client.agent.providers.useAccount` | `client.agent.providers.accounts.use` |
| `client.agent.scripts.instances.delete` | `client.agent.scripts.deleteInstance` |
| `client.agent.scripts.instances.list` | `client.agent.scripts.listInstances` |
| `client.agent.sessions.cancelTasks` | `client.agent.sessions.tasks.cancelAll` |
| `client.agent.sessions.claimApproverLease` | `client.agent.sessions.approverLease.claim` |
| `client.agent.sessions.claimAttachment` | `client.agent.sessions.attachments.claim` |
| `client.agent.sessions.createKeys.get` | `client.agent.sessions.getCreateKey` |
| `client.agent.sessions.createKeys.retire` | `client.agent.sessions.retireCreateKey` |
| `client.agent.sessions.deleteApprovalRule` | `client.agent.sessions.approval.deleteRule` |
| `client.agent.sessions.getApproval` | `client.agent.sessions.approval.get` |
| `client.agent.sessions.listMcpTools` | `client.agent.sessions.tools.listMcp` |
| `client.agent.sessions.listTools` | `client.agent.sessions.tools.list` |
| `client.agent.sessions.releaseApproverLease` | `client.agent.sessions.approverLease.release` |
| `client.agent.sessions.releaseAttachment` | `client.agent.sessions.attachments.release` |
| `client.agent.sessions.renewApproverLease` | `client.agent.sessions.approverLease.renew` |
| `client.agent.sessions.renewAttachment` | `client.agent.sessions.attachments.renew` |
| `client.agent.sessions.runTool` | `client.agent.sessions.tools.run` |
| `client.agent.sessions.setApprovalRule` | `client.agent.sessions.approval.setRule` |
| `client.agent.sessions.setAutoReply` | `client.agent.sessions.autoReply.update` |
| `client.agent.sessions.setAutoReplyWrites` | `client.agent.sessions.autoReply.enableWrites` / `client.agent.sessions.autoReply.disableWrites` |
| `client.agent.sessions.setHoodyEnv` | `client.agent.sessions.enableHoodyEnv` / `client.agent.sessions.disableHoodyEnv` |
| `client.agent.sessions.setYolo` | `client.agent.sessions.enableYolo` / `client.agent.sessions.disableYolo` |
| `client.agent.sessions.shells.list` | `client.agent.sessions.listShells` |
| `client.agent.sessions.shells.stop` | `client.agent.sessions.stopShell` |
| `client.agent.sessions.startTurn` | `client.agent.sessions.turns.start` |
| `client.agent.sessions.startTurnAndStream` | `client.agent.sessions.turns.start(..., { stream: true })` |
| `client.agent.sessions.updateApproval` | `client.agent.sessions.approval.update` |
| `client.agent.sessions.watch` | `client.agent.sessions.streamMany` |
| `client.agent.settings.getAgentInstructions` | `client.agent.settings.getInstructions` |
| `client.agent.settings.getFeatures` | `client.agent.settings.listFeatures` |
| `client.agent.settings.setAgentInstructions` | `client.agent.settings.setInstructions` |
| `client.agent.signIn` | `client.agent.login` |
| `client.agent.stats.get` | `client.agent.usage.getStats` |
| `client.agent.tasks.cancel` | `client.agent.sessions.tasks.cancel` |
| `client.agent.tasks.getTranscript` | `client.agent.sessions.tasks.getTranscript` |
| `client.agent.tasks.list` | `client.agent.sessions.tasks.list` |
| `client.agent.workflows.cancelRun` | `client.agent.workflows.runs.cancel` |
| `client.agent.workflows.getRun` | `client.agent.workflows.runs.get` |
| `client.agent.workflows.listRuns` | `client.agent.workflows.runs.list` |
| `client.agent.workflows.resumeRun` | `client.agent.workflows.runs.resume` |
| `client.agent.workflows.setHidden` | `client.agent.workflows.hide` / `client.agent.workflows.unhide` |
| `client.api.auth.confirmEmailChange` | `client.api.auth.email.confirmChange` |
| `client.api.auth.revertEmailChange` | `client.api.auth.email.undoChange` |
| `client.api.auth.sendVerificationEmail` | `client.api.auth.email.sendVerification` |
| `client.api.auth.verifyEmail` | `client.api.auth.email.verify` |
| `client.api.computers.getProxyUsage` | `client.api.computers.proxy.getUsage` |
| `client.api.firewall.createEgressRule` | `client.api.firewall.egress.create` |
| `client.api.firewall.createIngressRule` | `client.api.firewall.ingress.create` |
| `client.api.firewall.deleteEgressRule` | `client.api.firewall.egress.delete` |
| `client.api.firewall.deleteIngressRule` | `client.api.firewall.ingress.delete` |
| `client.api.firewall.disableEgressRule` | `client.api.firewall.egress.disable` |
| `client.api.firewall.disableIngressRule` | `client.api.firewall.ingress.disable` |
| `client.api.firewall.enableEgressRule` | `client.api.firewall.egress.enable` |
| `client.api.firewall.enableIngressRule` | `client.api.firewall.ingress.enable` |
| `client.api.images.list` | `client.api.images.listMine` |
| `client.api.projects.createPermission` | `client.api.projects.permissions.add` |
| `client.api.projects.deletePermission` | `client.api.projects.permissions.remove` |
| `client.api.projects.getProxyUsage` | `client.api.projects.proxy.getUsage` |
| `client.api.projects.listPermissions` | `client.api.projects.permissions.list` |
| `client.api.projects.updatePermission` | `client.api.projects.permissions.update` |
| `client.api.proxy.computerPermissions.clearGroupPermissions` | `client.api.computers.proxy.clearGroupPermissions` |
| `client.api.proxy.computerPermissions.delete` | `client.api.computers.proxy.deletePermissions` |
| `client.api.proxy.computerPermissions.deleteAuthGroup` | `client.api.computers.proxy.deleteGroup` |
| `client.api.proxy.computerPermissions.deleteGroupPermission` | `client.api.computers.proxy.deleteGroupPermission` |
| `client.api.proxy.computerPermissions.disable` | `client.api.computers.proxy.disable` |
| `client.api.proxy.computerPermissions.enable` | `client.api.computers.proxy.enable` |
| `client.api.proxy.computerPermissions.get` | `client.api.computers.proxy.getPermissions` |
| `client.api.proxy.computerPermissions.set` | `client.api.computers.proxy.setPermissions` |
| `client.api.proxy.computerPermissions.setDefault` | `client.api.computers.proxy.setDefault` |
| `client.api.proxy.computerPermissions.setGroupPermission` | `client.api.computers.proxy.setGroupPermission` |
| `client.api.proxy.computerPermissions.setIpGroup` | `client.api.computers.proxy.setIpGroup` |
| `client.api.proxy.computerPermissions.setJwtGroup` | `client.api.computers.proxy.setJwtGroup` |
| `client.api.proxy.computerPermissions.setPasswordGroup` | `client.api.computers.proxy.setPasswordGroup` |
| `client.api.proxy.computerPermissions.setTokenGroup` | `client.api.computers.proxy.setTokenGroup` |
| `client.api.proxy.groups.list` | `client.api.computers.proxy.listGroups` |
| `client.api.proxy.hooks.clear` | `client.api.computers.proxy.clearHooks` |
| `client.api.proxy.hooks.create` | `client.api.computers.proxy.createHook` |
| `client.api.proxy.hooks.delete` | `client.api.computers.proxy.deleteHook` |
| `client.api.proxy.hooks.get` | `client.api.computers.proxy.getHook` |
| `client.api.proxy.hooks.list` | `client.api.computers.proxy.listHooks` |
| `client.api.proxy.hooks.listByService` | `client.api.computers.proxy.listHooksByService` |
| `client.api.proxy.hooks.move` | `client.api.computers.proxy.moveHook` |
| `client.api.proxy.hooks.set` | `client.api.computers.proxy.setHook` |
| `client.api.proxy.projectPermissions.clearGroupPermissions` | `client.api.projects.proxy.clearGroupPermissions` |
| `client.api.proxy.projectPermissions.delete` | `client.api.projects.proxy.deletePermissions` |
| `client.api.proxy.projectPermissions.deleteAuthGroup` | `client.api.projects.proxy.deleteGroup` |
| `client.api.proxy.projectPermissions.deleteGroupPermission` | `client.api.projects.proxy.deleteGroupPermission` |
| `client.api.proxy.projectPermissions.disable` | `client.api.projects.proxy.disable` |
| `client.api.proxy.projectPermissions.enable` | `client.api.projects.proxy.enable` |
| `client.api.proxy.projectPermissions.get` | `client.api.projects.proxy.getPermissions` |
| `client.api.proxy.projectPermissions.set` | `client.api.projects.proxy.setPermissions` |
| `client.api.proxy.projectPermissions.setDefault` | `client.api.projects.proxy.setDefault` |
| `client.api.proxy.projectPermissions.setGroupPermission` | `client.api.projects.proxy.setGroupPermission` |
| `client.api.proxy.projectPermissions.setIpGroup` | `client.api.projects.proxy.setIpGroup` |
| `client.api.proxy.projectPermissions.setJwtGroup` | `client.api.projects.proxy.setJwtGroup` |
| `client.api.proxy.projectPermissions.setPasswordGroup` | `client.api.projects.proxy.setPasswordGroup` |
| `client.api.proxy.projectPermissions.setTokenGroup` | `client.api.projects.proxy.setTokenGroup` |
| `client.api.proxy.services.get` | `client.api.computers.proxy.getService` |
| `client.api.proxy.services.list` | `client.api.computers.proxy.listServices` |
| `client.api.proxy.settings.get` | `client.api.computers.proxy.getSettings` |
| `client.api.proxy.settings.update` | `client.api.computers.proxy.updateSettings` |
| `client.api.servers.commands.list` | `client.api.servers.listCommands` |
| `client.api.servers.commands.run` | `client.api.servers.runCommand` |
| `client.api.servers.jobs.get` | `client.api.servers.getJob` |
| `client.api.servers.offers.list` | `client.api.servers.listOffers` |
| `client.api.servers.offers.reserve` | `client.api.servers.reserveOffer` |
| `client.api.servers.reservations.get` | `client.api.servers.getReservation` |
| `client.api.servers.reservations.list` | `client.api.servers.listReservations` |
| `client.api.storage.shares.listIncoming` | `client.api.storage.incoming.list` |
| `client.api.storage.shares.listIncomingByComputer` | `client.api.storage.incoming.listByComputer` |
| `client.api.storage.shares.mountIncoming` | `client.api.storage.incoming.mount` |
| `client.api.storage.shares.unmountIncoming` | `client.api.storage.incoming.unmount` |
| `client.api.support.limits` | `client.api.support.getLimits` |
| `client.api.support.tickets.changes` | `client.api.support.tickets.listChanges` |
| `client.api.support.tickets.getReplyByKey` | `client.api.support.tickets.getMessageByKey` |
| `client.api.users.cancelEmailChange` | `client.api.auth.email.cancelChange` |
| `client.api.users.getFreeAiUsage` | `client.api.ai.getFreeUsage` |
| `client.api.users.requestEmailChange` | `client.api.auth.email.startChange` |
| `client.api.wallet.createCryptoInvoice` | `client.api.wallet.payments.createCryptoInvoice` |
| `client.api.wallet.createInvoice` | `client.api.wallet.invoices.create` |
| `client.api.wallet.createPaymentMethod` | `client.api.wallet.payments.createMethod` |
| `client.api.wallet.deletePaymentMethod` | `client.api.wallet.payments.deleteMethod` |
| `client.api.wallet.downloadInvoice` | `client.api.wallet.invoices.download` |
| `client.api.wallet.getBalance` | `client.api.wallet.getGeneralBalance` |
| `client.api.wallet.getCredits` | `client.api.wallet.credits.get` |
| `client.api.wallet.getCryptoPaymentIntent` | `client.api.wallet.payments.getCryptoIntent` |
| `client.api.wallet.getGithubBonus` | `client.api.wallet.getGithubBonusStatus` |
| `client.api.wallet.getInvoice` | `client.api.wallet.invoices.get` |
| `client.api.wallet.getPaymentAvailability` | `client.api.wallet.payments.getAvailability` |
| `client.api.wallet.getPaymentMethod` | `client.api.wallet.payments.getMethod` |
| `client.api.wallet.listCreditFees` | `client.api.wallet.credits.listFees` |
| `client.api.wallet.listCryptoPaymentIntents` | `client.api.wallet.payments.listCryptoIntents` |
| `client.api.wallet.listInvoices` | `client.api.wallet.invoices.list` |
| `client.api.wallet.listPaymentMethods` | `client.api.wallet.payments.listMethods` |
| `client.api.wallet.setDefaultPaymentMethod` | `client.api.wallet.payments.setDefaultMethod` |
| `client.api.wallet.transferToCredits` | `client.api.wallet.credits.transfer` |
| `client.api.wallet.updatePaymentMethod` | `client.api.wallet.payments.updateMethod` |
| `client.daemon.programs.listStatus` | `client.daemon.programs.listStatuses` |
| `client.daemon.programs.setBoot` | `client.daemon.programs.enableBoot` / `client.daemon.programs.disableBoot` |
| `client.exec.packages.createManifest` | `client.exec.packages.manifest.create` |
| `client.exec.packages.getManifest` | `client.exec.packages.manifest.get` |
| `client.exec.packages.updateManifest` | `client.exec.packages.manifest.update` |
| `client.notifications.push.sendTest` | `client.notifications.push.test` |
| `client.pipe.kit.getHelp` | `client.pipe.kit.getCheatsheet` |
| `client.run.config.get` | `client.run.kit.getConfig` |
| `client.run.jobs.createSearch` | `client.run.jobs.startSearch` |
| `client.sqlite.kv.compareTableSnapshots` | `client.sqlite.kv.table.compareSnapshots` |
| `client.sqlite.kv.getTableSnapshot` | `client.sqlite.kv.table.getSnapshot` |
| `client.sqlite.kv.pop` | `client.sqlite.kv.arrays.pop` |
| `client.sqlite.kv.push` | `client.sqlite.kv.arrays.push` |
| `client.sqlite.kv.remove` | `client.sqlite.kv.arrays.remove` |
| `client.sqlite.kv.rollbackTable` | `client.sqlite.kv.table.rollback` |
| `client.terminal.automation.getStats` | `client.terminal.kit.getAutomationStats` |
| `client.terminal.drops.commit` | `client.terminal.drops.finalize` |
| `client.vm.capabilities.get` | `client.vm.kit.getCapabilities` |
| `client.vm.downloads.delete` | `client.vm.isos.downloads.delete` |
| `client.vm.downloads.get` | `client.vm.isos.downloads.get` |
| `client.vm.downloads.list` | `client.vm.isos.downloads.list` |
| `client.vm.downloads.start` | `client.vm.isos.downloads.start` |
| `client.vm.imports.beginUpload` | `client.vm.imports.create` |
| `client.vm.isos.beginUpload` | `client.vm.isos.create` |
| `client.vm.serial.read` | `client.vm.console.read` |
| `client.vm.serial.write` | `client.vm.console.write` |
| `client.vm.snapshots.declareExport` | `client.vm.snapshots.export.create` |
| `client.vm.snapshots.dropExport` | `client.vm.snapshots.export.delete` |
| `client.vm.snapshots.getExportPart` | `client.vm.snapshots.export.getPart` |
| `client.vm.vms.getLog` | `client.vm.vms.getLogs` |
| `client.vm.vms.sendKeys` | `client.vm.vms.pressKeys` |
| `client.agent.platform.bootstrapToken` | removed |

Methods that took a boolean to switch something on or off are now a pair (`trust` / `untrust`, `enableBoot` / `disableBoot`,
`hide` / `unhide`): `client.agent.skills.trust(name, { trusted: false })` is `client.agent.skills.untrust(name)`.

### SDK: hand-written members (naming freeze)

| Old | New |
|---|---|
| `HoodyClient.getKitUrls()` | `HoodyClient.listKitUrls()` |
| `HoodyClient.checkIp()` | `HoodyClient.getIp()` |
| `client.run.status()` | `client.run.getStatus()` |
| `client.run.watch()` | `client.run.wait()` |
| `client.daemon.programs.attachTerminal()` | `client.daemon.programs.connectTerminal()` |
| `client.agent.bots.follow()` | `client.agent.bots.followLogs()` |
| `client.exec.connect(url, opts)` | `client.exec.remote(url, opts)` |
| `ExecRemoteConnection.capabilities()` | `ExecRemoteConnection.getCapabilities()` |
| `ExecRemoteConnection.events()` | `ExecRemoteConnection.streamEvents()` |
| `ExecRemoteConnection.attach()` | `ExecRemoteConnection.connect()` |
| `ExecRemoteConnection.eval(expression)` | `ExecRemoteConnection.evaluate(expression)` |
| `ExecRemoteSession.frames()` | `ExecRemoteSession.streamEvents()` |
| `BotUrlClient.status()` | `BotUrlClient.getStatus()` |
| `BotUrlClient.events()` | `BotUrlClient.streamEvents()` |
| `BotUrlClient.models()` | `BotUrlClient.listModels()` |
| `BotUrlClient.updates()` | `BotUrlClient.listUpdates()` |
| `BotUrlClient.newIdempotencyKey()` | `BotUrlClient.generateIdempotencyKey()` |
| `PipeStream.metrics()` | `PipeStream.getMetrics()` |
| `PipeStream.status(path)` | `PipeStream.getStatus(path)` |
| `PipeStream.subscribeProgress(path)` | `PipeStream.streamProgress(path)` |
| `ShareHandle.state()` | `ShareHandle.getState()` |
| `HoodyEmbeds.url()` | `HoodyEmbeds.getUrl()` |
| `HoodyEmbeds.catalog()` | `HoodyEmbeds.getCatalog()` |
| `HoodyEmbeds.views(kit)` | `HoodyEmbeds.listViews(kit)` |
| `CurlChannel.open(options)` | `CurlChannel.connect(options)` |
| `CurlChannelStream.body()` | `CurlChannelStream.readBytes()` |
| `EventsManager.whenReady()` | `EventsManager.ready()` |
| `LocalExitHandle.activeStreams()` | `LocalExitHandle.getActiveStreamCount()` |
| `TunnelSocks5Handle.activeStreams()` | `TunnelSocks5Handle.getActiveStreamCount()` |
| `NotificationDisplayClient.showManual(message)` | `NotificationDisplayClient.show(message)` |
| `discoverScripts()` | `listCallableScripts()` |
| `tunnelExpose` | `exposeTunnel` |
| `tunnelPull` | `pullTunnel` |
| `tunnelServe` | `serveTunnel` |
| `tunnelResumeExpose` | `resumeTunnelExpose` |
| `tunnelResumePull` | `resumeTunnelPull` |
| `tunnelSocks5` | `startTunnelSocks5` |
| `tunnelConnect` | removed: use `TunnelSession` |
| `EventsClient.disconnect()` | removed: call `EventsClient.close()` to end the connection |
| `EventsManager.addEventListener()` | removed: use `EventsManager.subscribe()` |
| `EventsManager.disconnect()` | removed: call `EventsManager.close()` to end the connection |
| `TerminalClient.state` | `TerminalClient.getState()` |
| `TerminalClient.connected` | `TerminalClient.isConnected()` |
| `TerminalClient.terminalId` | `TerminalClient.getTerminalId()` |
| `TerminalClient.shellType` | `TerminalClient.getShellType()` |
| `TerminalClient.windowTitle` | `TerminalClient.getWindowTitle()` |
| `TerminalClient.preferences` | `TerminalClient.getPreferences()` |
| `TerminalClient.cols` | `TerminalClient.getCols()` |
| `TerminalClient.rows` | `TerminalClient.getRows()` |
| `TerminalClient.url` | `TerminalClient.getUrl()` |
| `TerminalClient.lastActivityAt` | `TerminalClient.getLastActivityAt()` |
| `TerminalClient.sendsHeld` | `TerminalClient.isHoldingSends()` |
| `TerminalShell.connected` | `TerminalShell.isConnected()` |
| `TerminalShell.terminalId` | `TerminalShell.getTerminalId()` |
| `EventsClient.state` | `EventsClient.getLifecycleState()` (`idle`, `connecting`, `recovering`, `live`, `offline` or `closed`) |
| `EventsClient.getConnectionState()` | `EventsClient.getLifecycleState()`. The values change: `connected` is now `live` or `recovering`, `reconnecting` is `offline`, and a closed stream is `closed`, no longer `idle`. `getConnectionState()` now throws, naming it |
| `EventsManager.connectionState` | `EventsManager.getLifecycleState()` (`idle`, `connecting`, `recovering`, `live`, `offline` or `closed`) |
| `EventsManager.getState()` | `EventsManager.getLifecycleState()`. The values change: `connected` is now `live` or `recovering`, `reconnecting` is `offline`, and a closed stream is `closed`, no longer `idle`. `getState()` now throws, naming it |
| `EventsConnectionState` (type) | `EventsLifecycleState` |
| `EventsManager.addLifecycleListener(event, callback)` | `EventsManager.addConnectionListener(event, callback)`, the same events (`connecting`, `connected`, `reconnecting`, `reconnected`, `disconnected`, `error`; type `EventsConnectionEvent`). `addLifecycleListener()` now throws, naming it |
| `EventsClient.onLifecycle(handlers)` | `EventsClient.onConnection(handlers)`, the same handler keys. `onLifecycle()` now throws, naming it. The lifecycle states (`getLifecycleState()`) arrive through `onState()` |
| `EventsManager.cursors` | `EventsManager.getCursors()` |
| `EventsSession.generation` | `EventsSession.getGeneration()` |
| `EventIdLru.size` | `EventIdLru.getSize()` |
| `EventsRecovery.busy` | `EventsRecovery.isBusy()` |
| `NotificationPresenter.ready` | `NotificationPresenter.isReady()` (a presenter you pass to `NotificationDisplayClient` implements `isReady()`) |
| `NotificationDisplayClient.isActive` | `NotificationDisplayClient.isRunning()`. `isActive` now throws when read, so `isActive()` throws too, naming it |
| `TunnelSession.id` | `TunnelSession.getId()` |
| `TunnelSession.hello` | `TunnelSession.getHello()` |
| `TunnelSession.closeInfo` | `TunnelSession.getCloseInfo()` |
| `TunnelSession.generation` | `TunnelSession.getGeneration()` |
| `KeptTunnel.session` | `KeptTunnel.getSession()` |
| `MediaSession.active` | `MediaSession.isActive()` |
| `MediaSession.paused` | `MediaSession.isPaused()` |
| `ReceiveSession.active` | `ReceiveSession.isActive()` |
| `MediaStreamConversion.failure` | `MediaStreamConversion.getFailure()` |
| `BotUrlClient.url` | `BotUrlClient.getUrl()` |
| `BotUrlEventStream.cursor` | `BotUrlEventStream.getCursor()` |
| `BotUrlEventStream.mode` | `BotUrlEventStream.getMode()` |
| every generated WebSocket client (`TerminalSessionsConnectWebSocket`, `AgentSessionsConnectWebSocket`, ...): `url` | `getUrl()` |
| every generated WebSocket client: `connected` | `isConnected()` |
| every generated WebSocket client with a resume cursor: `cursor` | `getCursor()` (`setCursor()` is unchanged) |
| every generated WebSocket client: `readyState` | `getReadyState()` |
| every generated WebSocket client: `reconnecting` | `isReconnecting()` |
| every generated WebSocket client: `autoReconnect` | `isAutoReconnect()` (`setAutoReconnect()` is unchanged) |
| every generated WebSocket client with a resume cursor: `rawSocket` | `getRawSocket()` |
| every generated WebSocket client with a resume cursor: `incarnation` | `getIncarnation()` |

Called from JavaScript, an old method name of `HoodyClient`, `client.run`, `client.daemon.programs`, `client.agent.bots`,
`client.exec`, `ExecRemoteConnection`, `ExecRemoteSession`, `BotUrlClient`, `PipeStream`, `CurlChannel`,
`CurlChannelStream`, `EventsManager`, `EventsClient` or `NotificationDisplayClient` in this table throws a `TypeError` that
names the new method: `BotUrlClient.status() was retired. Call getStatus() instead.` TypeScript reports the old name when
you compile.

### SDK: option keys (naming freeze)

An option key the SDK invents is camelCase and named for what it does. The keys that carried an HTTP header lost the `X-` /
`X-Hoody-` prefix and the header spelling. A query or body field keeps the API spelling. An old key is refused when the
method is called; it is never ignored.

| Old key | New key | Where |
|---|---|---|
| `XHoodyCwd` | `cwd` | `agent` methods |
| `XHoodyConfigDir` | `configDir` | `agent` methods |
| `XHoodyComputer` | `toolComputer` | `agent` methods |
| `realm` | `agentRealm` | `agent` methods (the `X-Hoody-Realm` header), and `agent.bots.ask()` / `agent.bots.followLogs()` |
| `XHoodyApproverLease` | `approverLease` | `agent` approval methods |
| `XHoodyGatePolicy` | `gatePolicy` | `agent.sessions.turns.*` |
| `XHoodyToolMode` | `toolMode` | `agent.tools.*` |
| `XHoodyDirScope` | `dirScope` | `agent.tools.*` |
| `XHoodyPipeSenderKey` | `pipeSenderKey` | `pipe` |
| `XExpectedLength` | `expectedLength` | `files` uploads |
| `IdempotencyKey` | `idempotencyKey` | every method that takes one |
| `XIdempotencyKey` | `idempotencyKey` | `notes` |
| `IfMatch` | `ifMatch` | every method that takes one |
| `IfNoneMatch` | `ifNoneMatch` | every method that takes one |
| `LastEventID` | `lastEventId` on `proxyLogs.stream()`; removed elsewhere | `proxyLogs.stream()` resumes with it; the other streams that took it resume with their own query cursor (`since`, `since_seq` or `offset`) |
| `Depth`, `Destination`, `IfRange`, `IfUnmodifiedSince`, `Overwrite`, `Range` | `depth`, `destination`, `ifRange`, `ifUnmodifiedSince`, `overwrite`, `range` | `files` (WebDAV and ranged reads) |
| `IfModifiedSince` | `ifModifiedSince` | `notifications.icons.get()` |
| `Origin` | `origin` | `notifications.push.subscriptions.create()` |
| `TusResumable`, `UploadLength`, `UploadMetadata`, `UploadOffset` | `tusResumable`, `uploadLength`, `uploadMetadata`, `uploadOffset` | `notes.files.uploads.*` (resumable uploads) |
| `if_match` | `ifValue` | `sqlite.kv.set` (compares the stored value; CLI `--if-value`) |
| `exec_id` | `execId` | `exec` methods (the second spelling is removed) |
| `policy` | `gatePolicy` | `agent.sessions.turns.*` (the query twin is removed) and the hand-written agent prompt helper |
| `readonly` | `readOnly` | terminal client options and `daemon.programs.connectTerminal()` |
| `columns` | `cols` | `daemon.programs.connectTerminal()` |
| `fontsize` | `fontSize` | terminal screenshot options |
| `forceIPv4` | `forceIpv4` | `HoodyClient` and `HttpClient` config |
| `forceIPv4Cache` | `forceIpv4Cache` | `HoodyClient` and `HttpClient` config |
| `stat` | removed: call `files.stat(path)` | `files.get()` |
| `preview`, `contents` | removed: call `files.archives.preview(archive)`, or `files.archives.readMember(archive, { preview })` for one member | `files.get()` |
| `sha256` | removed: use `hash` | `files.get()` |
| `grep` | removed: call `files.grep(path, { pattern })` | `files.get()` |
| `glob` | removed: call `files.glob(path, { pattern })` (or `files.grep(path, { pattern, glob })` as the file filter) | `files.get()` |
| `q` | removed: call `files.search(directory, { q })`; JPEG quality is `q` of `files.images.convert()` | `files.get()` |
| `thumbnail` | removed: call `files.images.convert(image)` | `files.get()` |
| `zip` | removed: call `files.zip(directory)` | `files.get()` |
| `ignore_case`, `fixed_string`, `context`, `max_count`, `max_matches`, `max_filesize` | removed: they belong to grep; call `files.grep()` | `files.get()` |
| `max_depth`, `timeout`, `no_ignore`, `hidden` | removed: they belong to grep and glob; call `files.grep()` or `files.glob()` | `files.get()` |
| `max_results`, `max_files_scanned`, `sort`, `order` | removed: they belong to glob; call `files.glob()` | `files.get()` |
| `format`, `size`, `width`, `height`, `resize`, `quality`, `blur`, `grayscale`, `bg` | removed: they belong to the thumbnail; call `files.images.convert()` | `files.get()` |
| `token` | `kitAuth` | `exposeTunnel()`, `pullTunnel()`, `serveTunnel()`, `resumeTunnelExpose()`, `resumeTunnelPull()`, `startTunnelSocks5()` and `new TunnelSession()` |
| `serviceIndex` | `terminalId` | `shell()` and `terminal.run()`. Where you passed `serviceIndex: 0`, leave `terminalId` out for a fresh session |
| `paramTimeoutMs` | `operationTimeoutMs` | `browser.page.getSnapshot()` (the budget for the whole browser operation; `timeoutMs` stays the request timeout) |

Some options belong to only one form of a method. They were dropped without a word when the call took the other form, and
now throw a `ValidationError` that says what they need:

| Call | Error |
|---|---|
| `agent.sessions.turns.start({ gatePolicy })` without `stream: true` | `agent.sessions.turns.start: gatePolicy needs stream: true` |
| `agent.sessions.turns.start({ followSession })` without `stream: true` | `agent.sessions.turns.start: followSession needs stream: true` |
| `display.screenshots.capture({ metadata: true })` with `base64`, `region` or `cursor` | `display.screenshots.capture: base64 needs metadata left out or false` (and so on for each option) |
| `display.screenshots.getLatest({ metadata: true, base64 })` | `display.screenshots.getLatest: base64 needs metadata left out or false` |
| `pipe.getStatus(path, { headersOnly: true, transfer })` | `pipe.getStatus: transfer needs headersOnly left out or false` |

The old spellings `policy` and `XHoodyGatePolicy` on `agent.sessions.turns.start()` without `stream: true` throw
`RetiredOptionError`: `agent.sessions.turns.start: option "policy" was renamed to "gatePolicy". Pass gatePolicy instead.
gatePolicy needs stream: true.`

### SDK: exported type names (naming freeze)

Every type built for one operation is named `<Ns><Service><Method>` plus its kind (`Request`, `Response`, `ErrorCode`,
`Events`, `Frames`, `WebSocket`), taken from the public method. Types of operations that have no public method, numbered
schema names (`Error2`, `HealthResponse3`, `def_0`) and package-prefixed names (`main_KVEntry`) are no longer exported: a schema
type keeps its spec name without the prefix (`KVEntry`). The WebSocket types that changed:

| Old | New |
|---|---|
| `TerminalConnectTerminalWebSocketWebSocket`, `ITerminalConnectTerminalWebSocketWebSocket` | `TerminalSessionsConnectWebSocket`, `ITerminalSessionsConnectWebSocket` |
| `CronStreamEventsWsWebSocket`, `ICronStreamEventsWsWebSocket` | `CronEventsConnectWebSocket`, `ICronEventsConnectWebSocket` |
| `CurlWsJobEventsWebSocket`, `ICurlWsJobEventsWebSocket` | `CurlJobsConnectWebSocket`, `ICurlJobsConnectWebSocket` |
| `CurlWsRequestChannelWebSocket`, `ICurlWsRequestChannelWebSocket` | `CurlChannelConnectWebSocket`, `ICurlChannelConnectWebSocket` |
| `WatchStreamWatcherEventsWsWebSocket`, `IWatchStreamWatcherEventsWsWebSocket` | `WatchEventsConnectWebSocket`, `IWatchEventsConnectWebSocket` |
| `NotesOpenSocketWebSocket`, `INotesOpenSocketWebSocket` | `NotesSocketsConnectWebSocket`, `INotesSocketsConnectWebSocket` |
| `NotificationsConnectNotificationStreamWebSocket`, `INotificationsConnectNotificationStreamWebSocket` | `NotificationsConnectWebSocket`, `INotificationsConnectWebSocket` |
| `AgentStreamSessionWebSocket`, `IAgentStreamSessionWebSocket` | `AgentSessionsConnectWebSocket`, `IAgentSessionsConnectWebSocket` |
| `AgentGetBotRealtimeWebSocket`, `IAgentGetBotRealtimeWebSocket` | `AgentBotsConnectRealtimeWebSocket`, `IAgentBotsConnectRealtimeWebSocket` |
| `AgentGetBotVoiceWebSocket`, `IAgentGetBotVoiceWebSocket` | `AgentBotsConnectVoiceWebSocket`, `IAgentBotsConnectVoiceWebSocket` |
| `AgentStreamBotTwilioWebSocket`, `IAgentStreamBotTwilioWebSocket` | `AgentBotsConnectTwilioWebSocket`, `IAgentBotsConnectTwilioWebSocket` |
| `ApiConnecteventstreamWebSocket` | `EventsSocketTransport` |
| `TerminalWebSocketTyped`, `ITerminalWebSocketTyped` | removed: use `TerminalSessionsConnectWebSocket`, `ITerminalSessionsConnectWebSocket` |

A response type that several kits share used to keep the operation's name in all but one kit. It now follows the method too:

| Old | New |
|---|---|
| `DaemonHealthCheckResponse` | `DaemonKitGetHealthResponse` |
| `DisplayHealthCheckResponse` | `DisplayKitGetHealthResponse` |
| `ExecHealthCheckResponse` | `ExecKitGetHealthResponse` |
| `FilesHealthCheckResponse` | `FilesKitGetHealthResponse` |
| `NotificationsHealthCheckResponse` | `NotificationsKitGetHealthResponse` |
| `TerminalHealthCheckResponse` | `TerminalKitGetHealthResponse` |
| `ExecListSchedulesResponse` | `ExecSchedulesListResponse` |

A config type follows its key:

| Old | New |
|---|---|
| `IForceIPv4CacheConfig` | `IForceIpv4CacheConfig` |

Types of hand-written members follow the member:

| Old | New |
|---|---|
| `RunOpenWatchOptions` | `RunOpenWaitOptions` |
| `RunOpenWatchResult` | `RunOpenWaitResult` |
| `RunOpenStatusOptions` | `RunOpenGetStatusOptions` |
| `ProgramTerminalAttachOptions` | `ProgramTerminalConnectOptions` |
| `ProgramTerminalAttachment` | `ProgramTerminalConnection` |
| `DiscoverOptions` | `ListCallableScriptsOptions` |
| `DiscoveredScript` | `CallableScript` |
| `DiscoveredParam` | `CallableScriptParam` |
| `DiscoveryCache` | `CallableScriptsCache` |
| `clearDiscoveryCache` | `clearCallableScriptsCache` |
| `ExecRemoteEvalOptions` | `ExecRemoteEvaluateOptions` |
| `ExecRemoteEvalResult` | `ExecRemoteEvaluateResult` |
| `ExecRemoteEvalContext` | `ExecRemoteEvaluateContext` |
| `ExecRemoteEventsOptions` | `ExecRemoteStreamEventsOptions` |
| `ExecRemoteConnectOptions` | `ExecRemoteOptions` |
| `ExecRemoteConnect` | `ExecRemoteFactory` |
| `BotUrlEventsOptions` | `BotUrlStreamEventsOptions` |
| `BotFollowOptions` | `BotFollowLogsOptions` |
| `TunnelExposeOptions` | `ExposeTunnelOptions` |
| `TunnelPullOptions` | `PullTunnelOptions` |
| `TunnelServeOptions` | `ServeTunnelOptions` |
| `ResumeExposeOptions` | `ResumeTunnelExposeOptions` |
| `ResumePullOptions` | `ResumeTunnelPullOptions` |
| `TunnelSocks5Options` | `StartTunnelSocks5Options` |

Three package subpaths are no longer exported. They served the CLI only and were never documented, and there is no
replacement. Importing one fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`:

| Old | New |
|---|---|
| `import ... from 'hoody-sdk/chat'` | removed |
| `import ... from 'hoody-sdk/ai'` | removed |
| `import ... from 'hoody-sdk/update-check'` | removed |

## 1.0.1: computer naming

Version 1.0.1 of the SDK and the CLI renames every `container` you can type or read to `computer`. The tables further down are the 1.0.0-beta.15 migration and use the names of that release: read every `container` and `containers` in them as `computer` and `computers`.

**Update first.** Run `hoody update`, or `npm i -g hoody-sdk@1.0.1`. An older CLI or SDK that sends a retired name gets `400 UPGRADE_REQUIRED`; the message lists the names that changed. An older CLI is also refused on the routes whose names changed, with the same code. The Hoody Kits answer with `upgrade_required`.

| Where | Before | Now |
|---|---|---|
| CLI group | `hoody containers ...` | `hoody computers ...` (the short group `hoody c` was removed by the naming freeze) |
| CLI flags | `--container`, `--container-id`, `--max-containers`, `--allowed-containers` | `--computer`, `--computer-id`, `--max-computers`, `--allowed-computers`; `-c` still works |
| SDK | `client.api.containers`, `client.agent.containers`, `withContainer(id)` | `client.api.computers`, `client.agent.computers`, `withComputer(id)` |
| SDK types and methods | `Container*`, `listByContainer`, `proxy.containerPermissions` | `Computer*`, `listByComputer`, `computers.proxy` |
| Request and response fields | `containerId`, `container_id`, `containers`, `container` | `computerId`, `computer_id`, `computers`, `computer` |
| Permission names | `containers` | `computers` |
| Computer URLs | `https://{projectId}-{containerId}-{service}-{n}.{server}.containers.hoody.com` | `https://{projectId}-{computerId}-{service}-{n}.{server}.computers.hoody.com` |
| Claim header | `X-Hoody-Container-Claim` | `X-Hoody-Computer-Claim` |
| Events | `container.*` | `computer.*` |
| Error codes | `INVALID_CONTAINER_ID`, `CONTAINER_PROVISIONING` | `INVALID_COMPUTER_ID`, `COMPUTER_PROVISIONING` |
| Environment | `HOODY_CONTAINER`, `HOODY_CONTAINER_ID` | `HOODY_COMPUTER`, `HOODY_COMPUTER_ID` |
| Saved settings | `container` in `~/.hoody/config.json` and `hoody config` | `computer` |

**What still works.**

- Mount records, share records and cached script metadata written by an older version are still listed, unmounted and cleaned up.

**What stops working.** `--container` exits with code 2 and a message that names `--computer`. A request with a retired field, query parameter or permission name gets `400 UPGRADE_REQUIRED` and changes nothing.

**A script that only reads responses.** An old script that calls the old `/containers/` paths keeps reading the old field names (`containers`, `containerId`, `container_id`, `container`) for one release. Those responses carry a `Deprecation: true` header, and the old paths are removed in the next release. Streams, downloads and the values inside fields (error codes, event names) already use the new names. The new SDK and CLI use the new `/computers/` paths and the new field names (`computers`, `computerId`, `computer_id`, `computer`). Move a script to the new paths and names during this release.

## The rules, in short

One word means one thing, on both surfaces. CLI `agent sessions model set` is SDK `agent.sessions.setModel()`. These are the
rules every public name follows since the naming freeze:

1. **N1 Spelling.** CLI command words are lowercase with no hyphen. A name Hoody invents in the SDK is camelCase and writes an acronym as a word (`Mcp`, `Pr`, `Url`, `Kv`, `baseUrl`). Two spellings are kept as they are: the transport key `baseURL` of `HoodyClient` (and `getBaseURL()`, which reads it), and a schema type name, which keeps the spec spelling (N25: `KVEntry`).
2. **N2 Verb last.** A CLI command reads `hoody <group> <noun...> <verb>`, or ends in a report noun (N3). A group is named for its resource, never for a vague category.
3. **N3 Reads.** `list` returns a collection. `get` returns one item or one report. `read` returns the content of a file, console or terminal (bytes or text from an offset). A CLI command may end in a bare report noun only for `health`, `metrics`, `stats`, `status` and `version`; every other read is `<noun> get`. `whoami` is the one read named for its question (N16).
4. **N4 Writes.** `create` makes a record, `update` merges (omitted fields keep their value), `set` replaces or assigns, `delete` removes, `clear` empties, `purge` deletes past a cutoff, `add`/`remove` change membership, `write` writes content (file, console, terminal input) and `send` delivers a message, an event or input. `put`, `patch` and `edit` are not used. Another verb is used only where none of these says the action (`copy`, `answer`, `approve`, `deny`, `renew`, `apply`), and `upsert` only as N28 says.
5. **N5 Switches.** A boolean setter is a pinned pair of methods over one operation: `enable`/`disable`, or the domain pair `trust`/`untrust`, `hide`/`unhide`, `mount`/`unmount`, `pause`/`resume`. `toggle` survives only for `agent definitions tools toggle`, whose API flips the value with no target.
6. **N6 Running work.** `run` executes and answers the outcome where the API can wait, and is also the word for "run this now" where the API answers a run id at once (`cron.entries.run`). `start` either dispatches work that ends by itself and answers a handle, or starts a resource (`computers.start`, `vm.vms.start`) or a multi-step flow that a later call finishes (`api.auth.email.startChange`, `agent.github.auth.start`, `agent.providers.oauth.start`). `stop`, `restart`, `pause`, `resume`, `cancel` and `poll` act on what was started. `login` is only a call that ends signed in (`agent.github.auth.login({ token })`). Tie-break with N4/N7: work that ends by itself is `start` even when a record is kept (`run.jobs.startSearch`, `vm.isos.downloads.start`); a call whose record is the point and which is safe to retry is `create` (`agent.sessions.turns.create`, `vm.isos.create`).
7. **N7 Transfers.** A transfer in several calls opens with `create` (the call makes the entry that `get`, `list`, `delete` act on), sends numbered parts with `uploadPart` (CLI `upload --part`) or offset bytes with `writeChunk`, and closes with `finalize`. A numbered part is read back with `getPart` (CLI `get --part`).
8. **N8 Streams.** `stream` (method or command) is only a read of a feed, and `connect` attaches a socket. A call that can answer whole (or with a handle) or as it is produced is one method with `stream: true` (CLI `--stream`), and the literal fixes the return type: `stream: true` selects an event iterable. A raw byte body read unbuffered is `<verb>Stream` beside the buffered `<verb>` (`notes.notebooks.exportStream`). A hand-written `follow<X>` is the durable form of a generated `stream<X>` on the same service (reconnects, resumes, yields records: `agent.bots.followLogs`); a hand-written feed with no generated twin is `stream<X>` whatever its reconnect policy (`BotUrlClient.streamEvents`). On the CLI the follow form of a read is its sibling `stream` command, never a flag of the read.
9. **N9 Make current.** `use` makes an item the current one; a standing default is `set`.
10. **N10 Undo family.** `restore` brings back a state you point at, `rollback` reverses recorded history by a count or to a time, `undo` reverses one action with the token issued for it, `reset` returns to defaults or resets a machine (`vm.vms.reset`), and `revert` is not used.
11. **N11 Scope words.** A per-item action applied to every item is `<verb>All`, with `All` right after the verb word and any noun after it (`resumeAll`, `cancelAll`, `markAllRead`, `stopAllWork`), even with no one-item form. A collection-wide verb (`clear`, `purge`, `reload`, `reset`) takes no `All`. Several named items are `<verb>Many` (CLI `batch <verb>`) on a method with no folded noun; a method whose folded noun is plural takes several of the singular (`importLocalConfig` / `importLocalConfigs`).
12. **N12 One or all on the CLI.** A CLI read or stream covers everything when its selector is omitted, except a read whose omitted id means "the current one" (`auth tokens get` with no id is the token in use). A write that deletes, cancels, revokes or stops everything requires `--all` (or `--others`): `agent work stop --all`. Where the one-item and all-items routes share one command, `--all` selects the all-items route (`agent hooks enable --all`, `inbox markread --all`, `boturls keys revoke --all`). A harmless write on everything takes no flag (`run sources sync`, `agent bots resume`). `all` is never a command word.
13. **N13 Sibling spellings.** Two sibling nouns may differ by a plural `s` only when the plural is several of the singular, and a narrower read names what it narrows to. A noun and a verb that differ by a letter are not siblings (`boturls update`, `boturls updates list`).
14. **N14 Preview.** Bare `preview` shows one item of its service. The dry run of an action is `preview<Action>` beside the action in the SDK (`agent.mcp.previewImport`) and `--preview` on the action's command on the CLI (`agent mcp import --preview`), except where the CLI noun is the change itself, where `preview` stands beside `apply` (`agent acp credentialimports preview|apply`).
15. **N15 SDK nesting.** An SDK path is `ns.service.method` or `ns.service.child.method`. Below a service a noun is a child when it has three or more generated methods (table rows and composites, counting its qualifier subgroups, not pagination twins); hand-written methods do not count (`agent.bots.getLogs`, `streamLogs`, `followLogs`; `exec.scripts.listFiles`). Otherwise the noun is folded into `verbNoun` methods. A shipped form wins over the count: a folded noun that gains a third method stays folded, and a shipped noun never changes form. A report or state noun is a method of its owner.
16. **N16 Kit reads.** A read about the kit process as a whole (health, metrics, version, capabilities, info, configuration, cache and automation stats) is `<ns>.kit.get<Report>()`; `getMetrics` is Prometheus text and `getStats` JSON. A usage or aggregate read over the namespace's records is a method of the service that owns them (`agent.usage.getStats`). "Who am I" is `whoami`: on the namespace root of a kit, and `api.auth.whoami` for the account.
17. **N17 CLI path words.** Every CLI path word before the verb is the SDK service, child or folded noun of the operation (N27), or a qualifier after it (`tools readonly`, `rules applicable`, `kv batch`, `vm force`, `balances general`, `messages keys`). A two-word noun is one lowercase word, the SDK noun lowercased (`approverlease`, `tokengate`, `mouseevents`), unless its first word is itself a sibling resource: then the second word is a qualifier after it (`wallet balances general get` beside `wallet balances get`).
18. **N18 Groups and namespaces.** A kit namespace is a top-level CLI group of the same word, and an API service a top-level group of its service name lowercased and fused (`abusenotices`, `boturls`). A two-word name splits only when its first word is a group with other children (`proxy logs`).
19. **N19 Ids on the CLI.** The id of the thing a command acts on is a positional, parents first, whether the API takes it in the path, the query or the body; an optional one is `[id]`. The owning computer or project is a scope flag (`--computer`, `--project`). In `agent` and `notes` every id is a named flag instead (stated exception: many commands there take two or three ids of different kinds and optional defaults): each flag is named for its kind (`--session-id`, `--loop-id`, `--gate-id`, `--notebook-id`), and a bare `--id` is the id of the first resource after the group (`agent bots ... --id <bot>`). A positional has no flag twin.
20. **N20 Flags name the value.** A flag is named for the value it carries, never for the header: `X-`/`X-Hoody-` is dropped, a standard header keeps its name (`--if-match`), and a plain name taken by a routing global takes the qualifying word (`--tool-computer`, `--agent-realm`). Where a body field of the same command carries the same value as a header, the command has that one flag; where it carries another value under the same name, the body flag takes the qualifying word (`agent todos update --todo-cwd`).
21. **N21 Global spellings.** A global flag spelling means that global on every command and in every position, or is refused by name on a command that retired it (`retired_flags`, `curl run --proxy`). A command redeclares a global spelling only with the same meaning; a colliding field takes a qualified name in `cli-mappings.json`, and generation fails on a collision with no rename.
22. **N22 Flag spelling.** A flag is the kebab-case of its English words (`--read-only`, `--font-size`), and one value has one flag name across the CLI. A flag that takes a resource id ends in `-id` (`--backend-id`, `--window-id`), except the scope and target flags, which name their owner: `--computer`, `--project`, `--realm` and their qualified forms (`--tool-computer`, `--agent-realm`, `--target-computer`). A filter by an owner id is `--<owner>-id` (`events list --project-id`). A server is not an owner: its id is `--server-id` and `--target-server-id`. A directory is `dir` in a flag name (`--dir`, `--dirs`, `--config-dir`); `--cwd` is the working directory.
23. **N23 One spelling.** Every group, command and flag has exactly one spelling (a flag may add one single-letter short form). No alias is accepted, shown or hidden: no second flag for an API alias of one field, no flag the API ignores, no read flag that runs another command. A retired spelling may only fail with a message naming the current one.
24. **N24 SDK option keys.** A key the SDK invents is camelCase and named for what it does (transport and composite options, and every header-backed option: the header without `X-`/`X-Hoody-`). A query or body field keeps the API spelling. One options bag never holds two keys for one value: a resume cursor is the query cursor, and `Last-Event-ID` is not an option where one exists. A header option and its CLI flag are the same words (`gatePolicy` / `--gate-policy`). Hand-written option bags follow the same words (`readOnly`, `cols`, `fontSize`, `gatePolicy`, `agentRealm`). A retired key is refused, never ignored.
25. **N25 Exported names.** Every exported name built for one operation is `<Ns><Service><Method>` plus its kind (`Request`, `Response`, `ErrorCode`, `Events`, `Frames`, `WebSocket`), taken from the public method; an operation with no public method exports nothing. A schema type keeps the spec name, acronyms included (`KVEntry`); a name the merge invents (a number, a package prefix) is not public. A type of a hand-written member follows the member's words (`RunOpenWaitOptions` for `run.wait()`).
26. **N26 Hand-written members.** A hand-written public method follows the generated verb table (`get`, `list`, `stream`, `connect`, `signal`, `start`/`stop`) and keeps another word only for a platform protocol (`on`, `close`, `destroy`, `toJSON`, and `kill` of a `ChildProcess`-shaped stream: `TerminalShell.kill`), an HTTP method, the product verb the CLI uses for the same action (`ask`, `chat`, `expose`, `pull`, `mount`, `share`, `shell`), or a synchronous accessor named for what it returns (`exec.remote(url)`). A synchronous local read is a method: `get<X>()` for a value, `is<X>()` for a boolean (`ShareHandle.getState()`, `TerminalShell.isConnected()`). A method that replaces a getter never has the getter's name; a getter already spelled `isX`/`getX` takes the word of the class's own verb pair.
27. **N27 SDK = CLI.** The SDK path and the CLI command of one operation use the same nouns and verb, apart from these documented classes: the fused CLI spelling of an SDK compound; `2fa`/`twoFactor`; `db`/`kv` for `sqlite.sql`/`sqlite.kv` and `db` for `sqlite.databases`/`history`; the `<ns>.kit` service, which the CLI omits; a service noun the CLI group implies (`vm.vms`, `watch.watchers`, `browser.instances` and `page`, `support.tickets`); `By<Owner>` qualifiers (the CLI says the owner as a path noun, a prefix or a presence merge); default variants (`Public`) and variant flags (`--all`, `--others`, `--force`, `--stream`, `--push`, `--metadata`, `--double`, `--relative`, `--mine`, `--preview`) for SDK suffixes, options or sibling methods; presence merges; an omitted CLI id for SDK `All`; the SSE `stream` command of a socket `connect`; nouns folded by the depth cap; CLI-only commands for operations with no SDK method.
28. **N28 Exceptions that stay.** `db`/`kv` (D5), `upsert` for the two create-or-merge operations (D6), `proxyLogs`/`proxy logs`, the one `toggle` (N5), `whoami` (N16), `exportStream` (N8), `markAllRead` (N11), the all-flag ids of `agent` and `notes` (N19), `TerminalShell.kill` (N26).

## Decisions that shaped the tables

| Decision | Result |
|---|---|
| D1 | `use` is the verb for "make this item the current one". |
| D2 | The agent definitions group is `agent definitions` (CLI) and `agent.definitions` (SDK), not `agent agents`. |
| D3 | Pull requests are `prs` on the CLI and in the SDK (`agent github prs create`, `agent.github.prs.create()`, `agent.github.prs.merge()`). |
| D4 | `hoody logout` signs out this device only. `hoody logout --all` ends every session of the account, and the SDK spells that `api.auth.logoutAll()`. **Breaking since 1.0.0-beta.16:** `HoodyClient.logout()` matches the CLI: it ends this session only and makes no request. Call `HoodyClient.logoutAll()` to sign the account out everywhere. |
| D5 | `db` and `kv` stay as CLI groups (SDK: `sqlite.sql`, `sqlite.kv`). |
| D6 | `upsert` stays for `agent hooks` and `agent mcp`. |

Sign-in commands live at the top level only: `hoody login`, `hoody signup`, `hoody logout`. There is no `hoody auth login`.
The aliases `hoody ps`, `hoody ssh`, `hoody pty`, `hoody terminal sh`, `hoody check-update`, `hoody chatbot` and the `ls`-style operation aliases were removed; `hoody shell`, `hoody computers list` and `hoody update` replace them.

## CLI: group aliases

A group alias is a second name for a whole command group. These aliases were removed; use the group name. `hoody sqlite ...` is `hoody db ...`, `hoody notify ...` is `hoody notifications ...`.

| Removed alias | Use |
|---|---|
| `hoody token` | `hoody auth` |
| `hoody user` | `hoody users` |
| `hoody project` | `hoody projects` |
| `hoody container` | `hoody containers` |
| `hoody image` | `hoody images` |
| `hoody snapshot` | `hoody snapshots` |
| `hoody event` | `hoody events` |
| `hoody pool` | `hoody pools` |
| `hoody server` | `hoody servers` |
| `hoody realm` | `hoody realms` |
| `hoody file` | `hoody files` |
| `hoody note` | `hoody notes` |
| `hoody n` | `hoody notes` |
| `hoody watcher` | `hoody watch` |
| `hoody shares` | `hoody storage` |
| `hoody vscode` | `hoody code` |
| `hoody sqlite` | `hoody db` |
| `hoody kvstore` | `hoody kv` |
| `hoody crontab` | `hoody cron` |
| `hoody notify` | `hoody notifications` |

The short aliases this step kept (`u`, `v`, `p`, `proj`, `c`, `img`, `net`, `snap`, `fw`, `px`, `ev`, `notif`, `srv`, `term`, `t`, `br`, `d`, `disp`, `x`, `f`, `fs`, `sql`, `m`, `tun`) were removed by the naming freeze: see [CLI: group aliases removed](#cli-group-aliases-removed-naming-freeze). The per-command verb aliases (`ls`, `show`, `describe`, `new`, `edit`, `rm` and similar) are removed: type the verb itself (`list`, `get`, `create`, `update`, `delete`). `add`, `set` and `remove` are no longer aliases either; they are verbs of their own (N4).

## CLI: old command to new command

Sorted by the old command. A row with several new commands was split: choose the one that matches the intent.
A command not listed here kept its name.

### `hoody activity`

| Old | New | Note |
|---|---|---|
| `hoody activity logs` | `hoody activity list` |  |

### `hoody agent`

| Old | New | Note |
|---|---|---|
| `hoody agent agents copy` | `hoody agent definitions copy` |  |
| `hoody agent agents create` | `hoody agent definitions create` |  |
| `hoody agent agents delete` | `hoody agent definitions delete` |  |
| `hoody agent agents get-source` | `hoody agent definitions source get` |  |
| `hoody agent agents list` | `hoody agent definitions list` |  |
| `hoody agent agents list-files` | `hoody agent files list` |  |
| `hoody agent agents put-source` | `hoody agent definitions source set` |  |
| `hoody agent agents rename` | `hoody agent definitions rename` |  |
| `hoody agent agents reset-to-shipped` | `hoody agent definitions reset` |  |
| `hoody agent agents set-model` | `hoody agent definitions model set` |  |
| `hoody agent agents set-tools` | `hoody agent definitions tools set` |  |
| `hoody agent agents set-turns` | `hoody agent definitions turnlimit set` |  |
| `hoody agent agents toggle-tool` | `hoody agent definitions tools toggle` |  |
| `hoody agent discovery list-containers` | `hoody agent containers list` |  |
| `hoody agent discovery list-realms` | `hoody agent realms list` |  |
| `hoody agent discovery set-active-realm` | `hoody agent realms use` |  |
| `hoody agent github add-worktree` | `hoody agent github worktrees create` |  |
| `hoody agent github auth-status` | `hoody agent github auth status` |  |
| `hoody agent github branches` | `hoody agent github branches list` |  |
| `hoody agent github checkout-pr` | `hoody agent github prs checkout` |  |
| `hoody agent github clone` | `hoody agent github repos clone` |  |
| `hoody agent github commit` | `hoody agent github commits create` |  |
| `hoody agent github commit-push` | `hoody agent github commits create --push` | Without `--push` the command commits only. |
| `hoody agent github create-branch` | `hoody agent github branches create` |  |
| `hoody agent github create-issue` | `hoody agent github issues create` |  |
| `hoody agent github delete-branch` | `hoody agent github branches delete` |  |
| `hoody agent github identity` | `hoody agent github repos resolve` |  |
| `hoody agent github issues` | `hoody agent github issues list` |  |
| `hoody agent github log` | `hoody agent github commits list` |  |
| `hoody agent github login` | `hoody agent github auth start` (device sign-in) / `hoody agent github auth login --github-token <token>` |  |
| `hoody agent github login-poll` | `hoody agent github auth poll` |  |
| `hoody agent github logout` | `hoody agent github auth logout` |  |
| `hoody agent github merge-pr` | `hoody agent github prs merge` |  |
| `hoody agent github prs` | `hoody agent github prs list` |  |
| `hoody agent github pull-request` | `hoody agent github prs create` |  |
| `hoody agent github reconnect-repo` | `hoody agent github repos credentials set` |  |
| `hoody agent github remove-worktree` | `hoody agent github worktrees delete` |  |
| `hoody agent github repos` | `hoody agent github repos list` |  |
| `hoody agent github set-active-account` | `hoody agent github accounts use` |  |
| `hoody agent github stash` | `hoody agent github stash push` |  |
| `hoody agent github stash-pop` | `hoody agent github stash pop` |  |
| `hoody agent github suggest-commit-message` | `hoody agent github commits message suggest` |  |
| `hoody agent github switch-branch` | `hoody agent github branches use` |  |
| `hoody agent github worktrees` | `hoody agent github worktrees list` |  |
| `hoody agent headless create-run` | `hoody agent headless start` or `hoody agent headless start --stream` | Split: choose the command that matches what you meant. |
| `hoody agent hooks ack-trust` | `hoody agent hooks trust` |  |
| `hoody agent hooks begin-write` | `hoody agent hooks writeintents create` |  |
| `hoody agent hooks disable-all` | `hoody agent hooks enable --all` or `hoody agent hooks disable --all` | Split: choose the command that matches what you meant. `--all` applies it to every hook. |
| `hoody agent hooks get-rules` | `hoody agent hooks rules get` |  |
| `hoody agent hooks set-rules` | `hoody agent hooks rules set` |  |
| `hoody agent hooks test` | `hoody agent hooks run` or `hoody agent hooks test` | Split: choose the command that matches what you meant. |
| `hoody agent hooks toggle` | `hoody agent hooks enable` or `hoody agent hooks disable` | Split: choose the command that matches what you meant. |
| `hoody agent jobs get-result` | `hoody agent jobs result get` |  |
| `hoody agent logs logs-sources` | `hoody agent logs sources list` |  |
| `hoody agent logs logs-stats` | `hoody agent logs stats` |  |
| `hoody agent logs query-logs` | `hoody agent logs list` |  |
| `hoody agent logs read-log-entry` | `hoody agent logs get` |  |
| `hoody agent logs stream-logs` | `hoody agent logs stream` |  |
| `hoody agent loops list` | `hoody agent sessions loops list` |  |
| `hoody agent loops list-all` | `hoody agent loops list` |  |
| `hoody agent loops run-now` | `hoody agent loops runs start` |  |
| `hoody agent mcp begin-write` | `hoody agent mcp writeintents create` |  |
| `hoody agent mcp parse` | `hoody agent mcp import --preview` |  |
| `hoody agent mcp probe` | `hoody agent mcp test` |  |
| `hoody agent mcp set-enabled` | `hoody agent mcp enable` or `hoody agent mcp disable` | Split: choose the command that matches what you meant. |
| `hoody agent memory assign-datahost` | `hoody agent memory datahost claim` |  |
| `hoody agent memory begin-write` | `hoody agent memory writeintents create` |  |
| `hoody agent memory datahost` | `hoody agent memory datahost get` |  |
| `hoody agent memory delete-item` | `hoody agent memory items delete` |  |
| `hoody agent memory delete-project` | `hoody agent memory projects delete` |  |
| `hoody agent memory edit-item` | `hoody agent memory items update` |  |
| `hoody agent memory get-graph` | `hoody agent memory graph get` |  |
| `hoody agent memory get-item` | `hoody agent memory items get` |  |
| `hoody agent memory list-items` | `hoody agent memory items list` |  |
| `hoody agent memory list-projects` | `hoody agent memory projects list` |  |
| `hoody agent memory save-item` | `hoody agent memory items create` |  |
| `hoody agent memory set-enabled` | `hoody agent memory enable` or `hoody agent memory disable` | Split: choose the command that matches what you meant. |
| `hoody agent models add-provider-account` | `hoody agent providers accounts add` |  |
| `hoody agent models complete` | `hoody agent completions create` |  |
| `hoody agent models complete-stream` | `hoody agent completions create --stream` | Without `--stream` the reply is returned whole. |
| `hoody agent models delete-provider-api-key` | `hoody agent providers apikey delete` |  |
| `hoody agent models get-provider` | `hoody agent providers get` |  |
| `hoody agent models get-provider-auth` | `hoody agent providers auth status` |  |
| `hoody agent models jev get-settings` | `hoody agent jev settings get` |  |
| `hoody agent models jev list` | `hoody agent jev models list` |  |
| `hoody agent models jev test` | `hoody agent jev test` |  |
| `hoody agent models jev update-settings` | `hoody agent jev settings update` |  |
| `hoody agent models list-provider-accounts` | `hoody agent providers accounts list` |  |
| `hoody agent models list-providers` | `hoody agent providers list` |  |
| `hoody agent models logout-provider-o-auth` | `hoody agent providers oauth logout` |  |
| `hoody agent models poll-provider-o-auth` | `hoody agent providers oauth poll` |  |
| `hoody agent models remove-provider-account` | `hoody agent providers accounts remove` |  |
| `hoody agent models set-provider-account-active` | `hoody agent providers accounts use` |  |
| `hoody agent models set-provider-api-key` | `hoody agent providers apikey set` |  |
| `hoody agent models set-provider-default` | `hoody agent providers auth default set` |  |
| `hoody agent models start-provider-o-auth` | `hoody agent providers oauth start` |  |
| `hoody agent models submit-provider-o-auth-code` | `hoody agent providers oauth code submit` |  |
| `hoody agent sessions answer-assist` | `hoody agent gates suggest` |  |
| `hoody agent sessions answer-question` | `hoody agent gates answer` |  |
| `hoody agent sessions approval delete-rule` | `hoody agent sessions approval rules delete` |  |
| `hoody agent sessions approval set` | `hoody agent sessions approval update` |  |
| `hoody agent sessions approval set-rule` | `hoody agent sessions approval rules set` |  |
| `hoody agent sessions approver-lease acquire` | `hoody agent sessions approverlease claim` |  |
| `hoody agent sessions approver-lease release` | `hoody agent sessions approverlease release` |  |
| `hoody agent sessions approver-lease renew` | `hoody agent sessions approverlease renew` |  |
| `hoody agent sessions attachments acquire` | `hoody agent sessions attachments claim` |  |
| `hoody agent sessions cancel` | `hoody agent sessions turns cancel` |  |
| `hoody agent sessions confirm-gate` | `hoody agent gates approve` or `hoody agent gates deny` | Split: choose the command that matches what you meant. |
| `hoody agent sessions list-cwds` | `hoody agent sessions directories list` |  |
| `hoody agent sessions list-gates` | `hoody agent gates list` |  |
| `hoody agent sessions post-message` | `hoody agent sessions turns start` |  |
| `hoody agent sessions post-workflow-message` | `hoody agent workflows messages send` |  |
| `hoody agent sessions prompt-stream` | `hoody agent sessions turns start --stream` | `--stream` follows the session stream from the dispatch cursor; without it the command does not. |
| `hoody agent sessions prompt-sync` | `hoody agent sessions turns run` |  |
| `hoody agent sessions rules-applies` | `hoody agent sessions rules applicable list` |  |
| `hoody agent sessions set-auto-reply` | `hoody agent sessions autoreply update` |  |
| `hoody agent sessions set-auto-reply-writes` | `hoody agent sessions autoreply writes enable` / `hoody agent sessions autoreply writes disable` |  |
| `hoody agent sessions set-chat-agent` | `hoody agent sessions agent set` |  |
| `hoody agent sessions set-effort` | `hoody agent sessions effort set` |  |
| `hoody agent sessions set-hoody-env` | `hoody agent sessions hoodyenv enable` / `hoody agent sessions hoodyenv disable` |  |
| `hoody agent sessions set-model` | `hoody agent sessions model set` |  |
| `hoody agent sessions set-verbosity` | `hoody agent sessions verbosity set` |  |
| `hoody agent sessions set-yolo` | `hoody agent sessions yolo enable` / `hoody agent sessions yolo disable` |  |
| `hoody agent sessions state` | `hoody agent sessions snapshot get` |  |
| `hoody agent sessions stop-all` | `hoody agent work stop --all` |  |
| `hoody agent sessions transcript` | `hoody agent sessions transcript get` |  |
| `hoody agent settings delete-fusion` | `hoody agent fusions delete` |  |
| `hoody agent settings get-acp-status` | `hoody agent acp status` |  |
| `hoody agent settings list-fusion` | `hoody agent fusions list` |  |
| `hoody agent settings patch` | `hoody agent settings update` |  |
| `hoody agent settings set-acp-agent-model` | `hoody agent acp model set` |  |
| `hoody agent settings set-acp-enabled` | `hoody agent acp enable` or `hoody agent acp disable` | Split: choose the command that matches what you meant. |
| `hoody agent settings set-acp-secret` | `hoody agent acp secrets set` |  |
| `hoody agent settings upsert-fusion` | `hoody agent fusions set` |  |
| `hoody agent skills apply-import` | `hoody agent skills import` |  |
| `hoody agent skills clear-hub-cache` | `hoody agent skills hub cache clear` |  |
| `hoody agent skills get-hub-cache` | `hoody agent skills hub cache stats` |  |
| `hoody agent skills get-source` | `hoody agent skills source get` |  |
| `hoody agent skills install-hub` | `hoody agent skills hub install` |  |
| `hoody agent skills preview-hub` | `hoody agent skills hub preview` |  |
| `hoody agent skills put-source` | `hoody agent skills source set` |  |
| `hoody agent skills scan-import` | `hoody agent skills scan` |  |
| `hoody agent skills search-hub` | `hoody agent skills hub search` |  |
| `hoody agent skills toggle` | `hoody agent skills enable` or `hoody agent skills disable` | Split: choose the command that matches what you meant. |
| `hoody agent statistics get` | `hoody agent usage stats` |  |
| `hoody agent statistics usage-by-account` | `hoody agent usage accounts list` |  |
| `hoody agent statistics usage-by-model` | `hoody agent usage models list` |  |
| `hoody agent system health-check` | `hoody agent health` |  |
| `hoody agent system hoody-auth-status` | `hoody agent whoami` |  |
| `hoody agent system metrics` | `hoody agent metrics` |  |
| `hoody agent system version` | `hoody agent version` |  |
| `hoody agent tasks cancel-all` | `hoody agent sessions tasks cancel` |  |
| `hoody agent tasks transcript` | `hoody agent sessions tasks transcript get` |  |
| `hoody agent todos approve-proposal` | `hoody agent todos proposals approve` |  |
| `hoody agent todos cancel-run` | `hoody agent todos cancel` |  |
| `hoody agent todos deny-proposal` | `hoody agent todos proposals deny` |  |
| `hoody agent todos get-revision` | `hoody agent todos revision get` |  |
| `hoody agent todos message` | `hoody agent todos messages send` |  |
| `hoody agent todos post-comment` | `hoody agent todos comments create` |  |
| `hoody agent todos purge` | `hoody agent todos archived purge` |  |
| `hoody agent todos run` | `hoody agent todos start` |  |
| `hoody agent tools list-read-only` | `hoody agent tools readonly list` |  |
| `hoody agent tools list-session` | `hoody agent sessions tools list` |  |
| `hoody agent tools list-session-mcp` | `hoody agent sessions tools mcp list` |  |
| `hoody agent tools run-async` | `hoody agent tools start` |  |
| `hoody agent tools run-session` | `hoody agent sessions tools run` |  |
| `hoody agent tools stream` | `hoody agent tools run --stream` | The name is unchanged; the command stays hidden from `--help` and is still registered. `tools run` does not stream. |
| `hoody agent workflows cancel-run` | `hoody agent workflows runs cancel` |  |
| `hoody agent workflows get-run` | `hoody agent workflows runs get` |  |
| `hoody agent workflows hide` | `hoody agent workflows hide` / `hoody agent workflows unhide` |  |
| `hoody agent workflows list-runs` | `hoody agent workflows runs list` |  |
| `hoody agent workflows put` | `hoody agent workflows set` |  |
| `hoody agent workflows resume-run` | `hoody agent workflows runs resume` |  |
| `hoody agent workflows run` | `hoody agent workflows start` |  |
| `hoody agent workflows run-session` | `hoody agent sessions workflows start` |  |
| `hoody agent workflows set-summary` | `hoody agent workflows summary set` |  |

### `hoody ai`

| Old | New | Note |
|---|---|---|
| `hoody ai chat (alias chatbot)` | removed | Use `hoody chat`. |
| `hoody ai list` | `hoody ai models list` |  |

### `hoody auth`

| Old | New | Note |
|---|---|---|
| `hoody auth 2fa gate` | `hoody auth 2fa tokengate enable` or `hoody auth 2fa tokengate disable` | Split: choose the command that matches what you meant. |
| `hoody auth 2fa regenerate` | `hoody auth 2fa backupcodes rotate` |  |
| `hoody auth 2fa setup` | `hoody auth 2fa setup start` |  |
| `hoody auth 2fa verify-setup` | `hoody auth 2fa setup confirm` |  |
| `hoody auth copy` | `hoody auth tokens copy` |  |
| `hoody auth create` | `hoody auth tokens create` |  |
| `hoody auth delete` | `hoody auth tokens delete` |  |
| `hoody auth device code` | `hoody auth device start` |  |
| `hoody auth device token` | `hoody auth device poll` |  |
| `hoody auth email resend` | `hoody auth email verification send` |  |
| `hoody auth get` | `hoody auth tokens get` |  |
| `hoody auth get-current` | `hoody auth tokens get` |  |
| `hoody auth identity claim` | `hoody auth identityclaims create` |  |
| `hoody auth list` | `hoody auth tokens list` |  |
| `hoody auth login` | removed | Use `hoody login` (password, `--web`, `--token`). |
| `hoody auth logout` | removed | Use `hoody logout` for this device, `hoody logout --all` for every session of the account. |
| `hoody auth oauth cancel-intent` | `hoody auth oauth intents cancel` |  |
| `hoody auth oauth config` | `hoody auth config get` |  |
| `hoody auth oauth github callback` | removed | Use `hoody login --web`. |
| `hoody auth oauth github redirect` | removed | Use `hoody login --web`. |
| `hoody auth oauth google callback` | removed | Use `hoody login --web`. |
| `hoody auth oauth google redirect` | removed | Use `hoody login --web`. |
| `hoody auth password forgot` | `hoody auth password recover` |  |
| `hoody auth profile by-public-key` | `hoody auth tokens publicprofiles get` |  |
| `hoody auth profile current` | `hoody auth whoami` |  |
| `hoody auth profile update` | `hoody auth tokens publicprofiles update` |  |
| `hoody auth realms add` | `hoody auth tokens realms add` |  |
| `hoody auth realms remove` | `hoody auth tokens realms remove` |  |
| `hoody auth regions` | `hoody servers regions list` |  |
| `hoody auth signup` | removed | Use `hoody signup`. |
| `hoody auth templates list` | `hoody auth tokens templates list` |  |
| `hoody auth update` | `hoody auth tokens update` |  |
| `hoody auth waitlist enrich` | `hoody auth waitlist update` |  |

### `hoody browser`

| Old | New | Note |
|---|---|---|
| `hoody browser action` | `hoody browser act` |  |
| `hoody browser console` | `hoody browser logs console list` |  |
| `hoody browser cookies get` | `hoody browser cookies list` |  |
| `hoody browser cookies set` | `hoody browser cookies batch set` |  |
| `hoody browser devtools` | `hoody browser devtoolsurls get` |  |
| `hoody browser eval` | removed | Use `hoody browser evaluate`. |
| `hoody browser eval-post` | `hoody browser evaluate` |  |
| `hoody browser history delete` | `hoody browser history clear` |  |
| `hoody browser history query` | `hoody browser history list` |  |
| `hoody browser html` | `hoody browser html get` |  |
| `hoody browser info` | `hoody browser get` |  |
| `hoody browser metrics` | `hoody browser stats` |  |
| `hoody browser navigate` | removed | The name now belongs to the command that was `hoody browser navigate-post`. |
| `hoody browser navigate-post` | `hoody browser navigate` |  |
| `hoody browser network` | `hoody browser logs network list` |  |
| `hoody browser pdf` | `hoody browser pdf export` |  |
| `hoody browser screenshot` | `hoody browser screenshots capture` |  |
| `hoody browser snapshot` | `hoody browser snapshot get` |  |
| `hoody browser text` | `hoody browser text get` |  |

### `hoody chat`

| Old | New | Note |
|---|---|---|
| `hoody chat (alias chatbot)` | `hoody chat` |  |
| `hoody chat sessions delete (aliases rm, remove)` | `hoody chat sessions delete` |  |
| `hoody chat sessions list (alias ls)` | `hoody chat sessions list` |  |
| `hoody chat sessions show` | `hoody chat sessions get` |  |

### `hoody check-update`

| Old | New | Note |
|---|---|---|
| `hoody check-update` | removed | Use `hoody update`. |

### `hoody code`

| Old | New | Note |
|---|---|---|
| `hoody code assets favicon` | removed | No command: static assets are not exposed by the CLI. |
| `hoody code assets manifest` | removed | No command: static assets are not exposed by the CLI. |
| `hoody code assets robots` | removed | No command: static assets are not exposed by the CLI. |
| `hoody code assets security-policy` | removed | No command: static assets are not exposed by the CLI. |
| `hoody code vs` | removed | Use `hoody code open`. |

### `hoody config`

| Old | New | Note |
|---|---|---|
| `hoody config show` | `hoody config get` |  |
| `hoody config unset` | `hoody config clear` |  |

### `hoody containers`

| Old | New | Note |
|---|---|---|
| `hoody containers authorize` | `hoody computers claims create` |  |
| `hoody containers env bulk-set` | `hoody computers env update` |  |
| `hoody containers kvm` | `hoody computers kvm enable` or `hoody computers kvm disable` | Split: choose the command that matches what you meant. |
| `hoody containers manage` | `hoody computers start` or `hoody computers stop` or `hoody computers restart` or `hoody computers pause` or `hoody computers resume` | Split: choose the command that matches what you meant. The old `force-stop` is `hoody computers stop --force`. |
| `hoody containers proxy default` | `hoody computers proxy default set` |  |
| `hoody containers proxy discovery groups list` | `hoody computers proxy groups list` |  |
| `hoody containers proxy discovery services get` | `hoody computers proxy services get` |  |
| `hoody containers proxy discovery services list` | `hoody computers proxy services list` |  |
| `hoody containers proxy hooks clear-service` | `hoody computers proxy hooks clear` |  |
| `hoody containers proxy hooks list-service` | `hoody computers proxy hooks list` |  |
| `hoody containers proxy hooks update` | `hoody computers proxy hooks set` |  |
| `hoody containers proxy permissions replace` | `hoody computers proxy permissions set` |  |
| `hoody containers proxy state` | `hoody computers proxy enable` or `hoody computers proxy disable` | Split: choose the command that matches what you meant. |
| `hoody containers status-logs` | `hoody computers statushistory list` |  |

### `hoody cron`

| Old | New | Note |
|---|---|---|
| `hoody cron crontabs replace` | `hoody cron crontabs set` |  |

### `hoody curl`

| Old | New | Note |
|---|---|---|
| `hoody curl exec` | `hoody curl run` |  |
| `hoody curl get-url` | removed | Use `hoody curl run`. |
| `hoody curl jobs cancel` | `hoody curl jobs cancel` or `hoody curl jobs delete` | Split: choose the command that matches what you meant. |
| `hoody curl jobs result` | `hoody curl jobs result get` |  |
| `hoody curl schedules toggle` | removed | Use `hoody curl schedules update` with `--enabled` / `--no-enabled`. |
| `hoody curl sessions cookies` | `hoody curl sessions cookies list` |  |

### `hoody daemon`

| Old | New | Note |
|---|---|---|
| `hoody daemon attach` | `hoody daemon programs terminal connect` |  |
| `hoody daemon ephemeral list` | `hoody daemon ephemeralprograms list` |  |
| `hoody daemon ephemeral logs` | `hoody daemon ephemeralprograms logs get` |  |
| `hoody daemon ephemeral start` | `hoody daemon ephemeralprograms start` |  |
| `hoody daemon ephemeral status` | `hoody daemon ephemeralprograms status` |  |
| `hoody daemon ephemeral stop` | `hoody daemon ephemeralprograms stop` |  |
| `hoody daemon programs edit` | `hoody daemon programs update` |  |
| `hoody daemon programs logs` | `hoody daemon programs logs get` |  |
| `hoody daemon programs sandbox` | `hoody daemon programs sandbox get` |  |
| `hoody daemon programs statuses` | `hoody daemon programs status` |  |
| `hoody daemon programs stream-logs` | `hoody daemon programs logs stream` |  |

### `hoody db`

| Old | New | Note |
|---|---|---|
| `hoody db exec-shareable` | `hoody db readonly query` |  |
| `hoody db exec-transaction` | `hoody db transactions run` |  |
| `hoody db health-cache` | `hoody db cache stats` |  |
| `hoody db maintenance` | `hoody db maintenance run` |  |

### `hoody desktop`

| Old | New | Note |
|---|---|---|
| `hoody desktop list (alias ls)` | `hoody desktop list` |  |

### `hoody display`

| Old | New | Note |
|---|---|---|
| `hoody display access` | removed | Use `hoody display open`. |
| `hoody display info` | `hoody display get` |  |
| `hoody display input batch` | `hoody display input batch act` |  |
| `hoody display input click-at` | `hoody display input click` |  |
| `hoody display input geometry` | `hoody display geometry get` |  |
| `hoody display input type-at` | `hoody display input type` |  |
| `hoody display input wait-until` | `hoody display windows wait` |  |
| `hoody display keyboard key` | `hoody display keyboard press` |  |
| `hoody display keyboard key-down` | `hoody display keyboard down` |  |
| `hoody display keyboard key-up` | `hoody display keyboard up` |  |
| `hoody display mouse double-click` | `hoody display mouse click --double` |  |
| `hoody display mouse location` | `hoody display mouse position get` |  |
| `hoody display mouse move-relative` | `hoody display mouse move --relative` |  |
| `hoody display screenshots by-timestamp` | `hoody display screenshots get` |  |
| `hoody display screenshots capture-metadata` | `hoody display screenshots capture --metadata` | `--metadata` returns only the metadata. |
| `hoody display screenshots latest` | `hoody display screenshots latest get` |  |
| `hoody display screenshots latest-metadata` | `hoody display screenshots latest get --metadata` | `--metadata` returns only the metadata. |
| `hoody display thumbnails by-timestamp` | `hoody display thumbnails get` |  |
| `hoody display thumbnails latest` | `hoody display thumbnails latest get` |  |
| `hoody display windows active` | `hoody display windows active get` |  |
| `hoody display windows geometry` | `hoody display windows geometry get` |  |
| `hoody display windows name` | `hoody display windows title get` |  |
| `hoody display windows properties` | `hoody display windows get` |  |

### `hoody egress`

| Old | New | Note |
|---|---|---|
| `hoody egress local` | `hoody egress local start` |  |
| `hoody egress upstream clear` | `hoody egress upstream disable` |  |

### `hoody events`

| Old | New | Note |
|---|---|---|
| `hoody events bulk-delete` | `hoody events clear` |  |
| `hoody events cleanup` | `hoody events purge` |  |
| `hoody events watch` | `hoody events stream` |  |

### `hoody exec`

| Old | New | Note |
|---|---|---|
| `hoody exec logs read` | `hoody exec logs get` |  |
| `hoody exec magic-comments bulk-update` | `hoody exec magiccomments batch update` |  |
| `hoody exec magic-comments read` | `hoody exec magiccomments get` |  |
| `hoody exec magic-comments schema` | `hoody exec magiccomments schema get` |  |
| `hoody exec magic-comments update` | `hoody exec magiccomments update` |  |
| `hoody exec openapi serve` | `hoody exec openapi get` |  |
| `hoody exec openapi serve-schema` | `hoody exec openapi schema get` |  |
| `hoody exec packages add-modules` | `hoody exec modules install` |  |
| `hoody exec packages check` | `hoody exec modules test` |  |
| `hoody exec packages json init` | `hoody exec packages manifest create` |  |
| `hoody exec packages json read` | `hoody exec packages manifest get` |  |
| `hoody exec packages json update` | `hoody exec packages manifest update` |  |
| `hoody exec packages list` | `hoody exec modules bundled list` |  |
| `hoody exec routes discover` | `hoody exec routes list` |  |
| `hoody exec schedules history` | `hoody exec schedules history list` |  |
| `hoody exec schedules trigger` | `hoody exec schedules run` |  |
| `hoody exec scripts list-user` | `hoody exec openapi scripts list` |  |
| `hoody exec scripts monitor` | `hoody exec scripts stats list` |  |
| `hoody exec scripts performance` | `hoody exec scripts stats get` |  |
| `hoody exec scripts tree` | `hoody exec scripts tree get` |  |
| `hoody exec state clear` | `hoody exec store clear` |  |
| `hoody exec state get` | `hoody exec store get` |  |
| `hoody exec state set` | `hoody exec store set` |  |
| `hoody exec system active-requests` | `hoody exec requests list` |  |
| `hoody exec system cache-clear` | `hoody exec cache clear` |  |
| `hoody exec system prometheus` | `hoody exec metrics` |  |
| `hoody exec system restart` | `hoody exec restart` |  |
| `hoody exec system restart-status` | `hoody exec status` |  |
| `hoody exec system stats` | `hoody exec stats` |  |
| `hoody exec validate dependencies` | `hoody exec scripts dependencies validate` |  |
| `hoody exec validate magic-comments` | `hoody exec magiccomments validate` |  |
| `hoody exec validate return-type` | `hoody exec scripts returntype validate` |  |
| `hoody exec validate script` | `hoody exec scripts validate` |  |
| `hoody exec validate syntax` | `hoody exec scripts syntax validate` |  |
| `hoody exec validate types` | `hoody exec scripts types validate` |  |
| `hoody exec validate user-schema` | `hoody exec openapi schema validate` |  |

### `hoody files`

| Old | New | Note |
|---|---|---|
| `hoody files access ftp` | `hoody files ftp get` |  |
| `hoody files access s3` | `hoody files s3 get` |  |
| `hoody files access ssh` | `hoody files ssh get` |  |
| `hoody files access ssh-upload` | `hoody files ssh upload` |  |
| `hoody files access webdav` | `hoody files webdav get` |  |
| `hoody files archive preview` | `hoody files archives preview` |  |
| `hoody files archive view` | `hoody files archives members read` |  |
| `hoody files backends connect azureblob` | `hoody files backends azureblob create` |  |
| `hoody files backends connect azurefiles` | `hoody files backends azurefiles create` |  |
| `hoody files backends connect b2` | `hoody files backends b2 create` |  |
| `hoody files backends connect box` | `hoody files backends box create` |  |
| `hoody files backends connect cloudinary` | `hoody files backends cloudinary create` |  |
| `hoody files backends connect drive` | `hoody files backends drive create` |  |
| `hoody files backends connect dropbox` | `hoody files backends dropbox create` |  |
| `hoody files backends connect fichier` | `hoody files backends fichier create` |  |
| `hoody files backends connect filefabric` | `hoody files backends filefabric create` |  |
| `hoody files backends connect filescom` | `hoody files backends filescom create` |  |
| `hoody files backends connect ftp` | `hoody files backends ftp create` |  |
| `hoody files backends connect gofile` | `hoody files backends gofile create` |  |
| `hoody files backends connect google-cloud-storage` | `hoody files backends googlecloudstorage create` |  |
| `hoody files backends connect google-photos` | `hoody files backends googlephotos create` |  |
| `hoody files backends connect hdfs` | `hoody files backends hdfs create` |  |
| `hoody files backends connect hidrive` | `hoody files backends hidrive create` |  |
| `hoody files backends connect http` | `hoody files backends http create` |  |
| `hoody files backends connect iclouddrive` | `hoody files backends iclouddrive create` |  |
| `hoody files backends connect imagekit` | `hoody files backends imagekit create` |  |
| `hoody files backends connect internetarchive` | `hoody files backends internetarchive create` |  |
| `hoody files backends connect jottacloud` | `hoody files backends jottacloud create` |  |
| `hoody files backends connect koofr` | `hoody files backends koofr create` |  |
| `hoody files backends connect linkbox` | `hoody files backends linkbox create` |  |
| `hoody files backends connect mailru` | `hoody files backends mailru create` |  |
| `hoody files backends connect mega` | `hoody files backends mega create` |  |
| `hoody files backends connect netstorage` | `hoody files backends netstorage create` |  |
| `hoody files backends connect onedrive` | `hoody files backends onedrive create` |  |
| `hoody files backends connect opendrive` | `hoody files backends opendrive create` |  |
| `hoody files backends connect oracleobjectstorage` | `hoody files backends oracleobjectstorage create` |  |
| `hoody files backends connect pcloud` | `hoody files backends pcloud create` |  |
| `hoody files backends connect pikpak` | `hoody files backends pikpak create` |  |
| `hoody files backends connect pixeldrain` | `hoody files backends pixeldrain create` |  |
| `hoody files backends connect premiumizeme` | `hoody files backends premiumizeme create` |  |
| `hoody files backends connect protondrive` | `hoody files backends protondrive create` |  |
| `hoody files backends connect putio` | `hoody files backends putio create` |  |
| `hoody files backends connect qingstor` | `hoody files backends qingstor create` |  |
| `hoody files backends connect quatrix` | `hoody files backends quatrix create` |  |
| `hoody files backends connect s3` | `hoody files backends s3 create` |  |
| `hoody files backends connect seafile` | `hoody files backends seafile create` |  |
| `hoody files backends connect sftp` | `hoody files backends sftp create` |  |
| `hoody files backends connect sharefile` | `hoody files backends sharefile create` |  |
| `hoody files backends connect sia` | `hoody files backends sia create` |  |
| `hoody files backends connect smb` | `hoody files backends smb create` |  |
| `hoody files backends connect sugarsync` | `hoody files backends sugarsync create` |  |
| `hoody files backends connect swift` | `hoody files backends swift create` |  |
| `hoody files backends connect ulozto` | `hoody files backends ulozto create` |  |
| `hoody files backends connect webdav` | `hoody files backends webdav create` |  |
| `hoody files backends connect yandex` | `hoody files backends yandex create` |  |
| `hoody files backends connect zoho` | `hoody files backends zoho create` |  |
| `hoody files backends disconnect` | `hoody files backends delete` |  |
| `hoody files delete-recursive` | removed | Use `hoody files delete`. |
| `hoody files dir` | removed | Use `hoody files get` for a listing, or `hoody files open`. |
| `hoody files downloads active` | `hoody files downloads list` |  |
| `hoody files downloads all` | `hoody files downloads list` |  |
| `hoody files downloads history` | `hoody files downloads history list` |  |
| `hoody files downloads url` | `hoody files downloads create` |  |
| `hoody files downloads zip` | `hoody files zip` |  |
| `hoody files extractions active` | removed | Use `hoody files extractions list`. |
| `hoody files extractions all` | `hoody files extractions list` |  |
| `hoody files extractions create` | `hoody files archives extract` |  |
| `hoody files extractions extract-file` | `hoody files archives members extract` |  |
| `hoody files extractions history` | `hoody files extractions history list` |  |
| `hoody files journal query` | `hoody files journal list` |  |
| `hoody files metadata` | `hoody files exists` |  |
| `hoody files mkdir` | removed | `hoody files mkdir` still exists; it now always sends the POST form. |
| `hoody files modify-properties` | `hoody files update` |  |
| `hoody files mounts unmount` | `hoody files mounts delete` |  |
| `hoody files operation` | `hoody files mkdir` or `hoody files archives extract` or `hoody files downloads create` | Split: choose the command that matches what you meant. `--owner <owner>` on `extract` and `downloads create` sets the owner of the new files; it selects the old combined operation. |
| `hoody files options` | removed | Removed: HTTP OPTIONS introspection is not a command. |
| `hoody files patch` | `hoody files chunks write` |  |
| `hoody files pending-uploads deliver` | `hoody files uploads deliver` |  |
| `hoody files pending-uploads discard` | `hoody files uploads delete` |  |
| `hoody files pending-uploads download` | `hoody files uploads download` |  |
| `hoody files pending-uploads files` | `hoody files uploads files list` |  |
| `hoody files pending-uploads list` | `hoody files uploads list` |  |
| `hoody files pending-uploads stop` | `hoody files uploads stop` |  |
| `hoody files pending-uploads unreadable discard` | `hoody files uploads unreadable delete` |  |
| `hoody files pending-uploads unreadable list` | `hoody files uploads unreadable list` |  |
| `hoody files process-image` | `hoody files images convert` |  |
| `hoody files put` | `hoody files upload` |  |
| `hoody files upload` | removed | The name now belongs to the upload command that was `hoody files put`. |

### `hoody firewall`

| Old | New | Note |
|---|---|---|
| `hoody firewall egress toggle` | `hoody firewall egress enable` or `hoody firewall egress disable` | Split: choose the command that matches what you meant. |
| `hoody firewall ingress toggle` | `hoody firewall ingress enable` or `hoody firewall ingress disable` | Split: choose the command that matches what you meant. |
| `hoody firewall list` | `hoody firewall rules list` |  |

### `hoody images`

| Old | New | Note |
|---|---|---|
| `hoody images icon` | `hoody images icon get` |  |
| `hoody images import-free` | `hoody images import` |  |
| `hoody images mine` | `hoody images list --mine` | Without `--mine` the command lists public images. |
| `hoody images purchase` | `hoody images buy` |  |

### `hoody inbox`

| Old | New | Note |
|---|---|---|
| `hoody inbox list-public` | `hoody inbox announcements list` |  |
| `hoody inbox mark` | `hoody inbox markread` |  |
| `hoody inbox mark-all` | `hoody inbox markread --all` | Without `--all` the command marks one notification. |

### `hoody kits`

| Old | New | Note |
|---|---|---|
| `hoody kits (alias kit) list (alias ls)` | `hoody kits list` |  |

### `hoody kv`

| Old | New | Note |
|---|---|---|
| `hoody kv arrays delete` | `hoody kv arrays remove` |  |
| `hoody kv decr` | `hoody kv decrement` |  |
| `hoody kv history` | `hoody kv history list` |  |
| `hoody kv incr` | `hoody kv increment` |  |
| `hoody kv rollback-table` | `hoody kv table rollback` |  |
| `hoody kv snapshots compare-table` | `hoody kv table snapshots compare` |  |
| `hoody kv snapshots get-key` | `hoody kv snapshots get` |  |
| `hoody kv snapshots get-table` | `hoody kv table snapshots get` |  |

### `hoody local`

| Old | New | Note |
|---|---|---|
| `hoody local defaults show` | `hoody local defaults get` |  |
| `hoody local defaults unset` | `hoody local defaults clear` |  |
| `hoody local lock change` | `hoody local lock password set` |  |
| `hoody local lock enforce` | `hoody local lock ephemeral enable` or `hoody local lock ephemeral disable` | Split: choose the command that matches what you meant. |
| `hoody local lock remove` | `hoody local lock disable` |  |
| `hoody local lock setup` | `hoody local lock enable` |  |

### `hoody logout`

| Old | New | Note |
|---|---|---|
| `hoody logout` | `hoody logout` or `hoody logout --all` | Split: choose the command that matches what you meant. |

### `hoody meta`

| Old | New | Note |
|---|---|---|
| `hoody meta config` | `hoody meta config get` |  |
| `hoody meta config-get` | `hoody meta config values get` |  |
| `hoody meta get` | `hoody meta publickey get` |  |
| `hoody meta social-stats` | `hoody meta social stats` |  |

### `hoody notes`

| Old | New | Note |
|---|---|---|
| `hoody notes avatar download` | `hoody notes avatars download` |  |
| `hoody notes avatar upload` | `hoody notes avatars upload` |  |
| `hoody notes collab add` | `hoody notes collaborators add` |  |
| `hoody notes collab list` | `hoody notes collaborators list` |  |
| `hoody notes collab remove` | `hoody notes collaborators remove` |  |
| `hoody notes collab update` | `hoody notes collaborators role set` |  |
| `hoody notes comment anchors` | `hoody notes comments anchors list` |  |
| `hoody notes comment create` | `hoody notes comments create` |  |
| `hoody notes comment delete` | `hoody notes comments delete` |  |
| `hoody notes comment edit` | `hoody notes comments update` |  |
| `hoody notes comment list` | `hoody notes comments list` |  |
| `hoody notes comment reanchor` | `hoody notes comments anchors set` |  |
| `hoody notes comment resolve` | `hoody notes comments resolve` |  |
| `hoody notes db create` | `hoody notes records create` |  |
| `hoody notes db delete` | `hoody notes records delete` |  |
| `hoody notes db get` | `hoody notes records get` |  |
| `hoody notes db list` | `hoody notes records list` |  |
| `hoody notes db search` | `hoody notes records search` |  |
| `hoody notes db update` | `hoody notes records update` |  |
| `hoody notes doc append` | `hoody notes document append` |  |
| `hoody notes doc block-svg` | `hoody notes document blocks export` |  |
| `hoody notes doc export-ticket` | `hoody notes document exporttickets create` |  |
| `hoody notes doc get` | `hoody notes document get` |  |
| `hoody notes doc patch` | `hoody notes document update` |  |
| `hoody notes doc put` | `hoody notes document set` |  |
| `hoody notes file download` | `hoody notes files download` |  |
| `hoody notes file list` | `hoody notes files list` |  |
| `hoody notes node children` | `hoody notes nodes children list` |  |
| `hoody notes node create` | `hoody notes nodes create` |  |
| `hoody notes node delete` | `hoody notes nodes delete` |  |
| `hoody notes node get` | `hoody notes nodes get` |  |
| `hoody notes node get-by-alias` | `hoody notes nodes resolve` |  |
| `hoody notes node list` | `hoody notes nodes list` |  |
| `hoody notes node mark-opened` | `hoody notes nodes markopened` |  |
| `hoody notes node mark-seen` | `hoody notes nodes markseen` |  |
| `hoody notes node update` | `hoody notes nodes update` |  |
| `hoody notes notebook create` | `hoody notes notebooks create` |  |
| `hoody notes notebook delete` | `hoody notes notebooks delete` |  |
| `hoody notes notebook get` | `hoody notes notebooks get` |  |
| `hoody notes notebook list` | `hoody notes notebooks list` |  |
| `hoody notes notebook update` | `hoody notes notebooks update` |  |
| `hoody notes reaction add` | `hoody notes reactions add` |  |
| `hoody notes reaction list` | `hoody notes reactions list` |  |
| `hoody notes reaction remove` | `hoody notes reactions remove` |  |
| `hoody notes user invite` | `hoody notes members invite` |  |
| `hoody notes user set-role` | `hoody notes members role set` |  |
| `hoody notes version create` | `hoody notes versions create` |  |
| `hoody notes version delete` | `hoody notes versions delete` |  |
| `hoody notes version get` | `hoody notes versions get` |  |
| `hoody notes version list` | `hoody notes versions list` |  |
| `hoody notes version restore` | `hoody notes versions restore` |  |

### `hoody notifications`

| Old | New | Note |
|---|---|---|
| `hoody notifications clear-dismissed` | `hoody notifications restore` |  |
| `hoody notifications icon` | `hoody notifications icons get` |  |
| `hoody notifications trigger` | `hoody notifications send` |  |

### `hoody pipe`

| Old | New | Note |
|---|---|---|
| `hoody pipe forward-tcp` | `hoody pipe forward` |  |
| `hoody pipe help-cheatsheet` | `hoody pipe cheatsheet get` |  |
| `hoody pipe help-cheatsheet` | `hoody pipe cheatsheet get` |  |
| `hoody pipe progress (alias watch)` | `hoody pipe progress stream` |  |
| `hoody pipe receive (alias recv)` | `hoody pipe receive` |  |
| `hoody pipe url` | `hoody pipe url get` |  |

### `hoody pools`

| Old | New | Note |
|---|---|---|
| `hoody pools members delete` | `hoody pools members remove` |  |
| `hoody pools members update-role` | `hoody pools members role set` |  |

### `hoody projects`

| Old | New | Note |
|---|---|---|
| `hoody projects proxy default` | `hoody projects proxy default set` |  |
| `hoody projects proxy permissions replace` | `hoody projects proxy permissions set` |  |
| `hoody projects proxy state` | `hoody projects proxy enable` or `hoody projects proxy disable` | Split: choose the command that matches what you meant. |

### `hoody proxy`

| Old | New | Note |
|---|---|---|
| `hoody proxy create` | `hoody proxy aliases create` |  |
| `hoody proxy delete` | `hoody proxy aliases delete` |  |
| `hoody proxy get` | `hoody proxy aliases get` |  |
| `hoody proxy list` | `hoody proxy aliases list` |  |
| `hoody proxy set-state` | `hoody proxy aliases enable` or `hoody proxy aliases disable` | Split: choose the command that matches what you meant. |
| `hoody proxy update` | `hoody proxy aliases update` |  |

### `hoody ps`

| Old | New | Note |
|---|---|---|
| `hoody ps` | removed | Use `hoody computers list`. |

### `hoody pty`

| Old | New | Note |
|---|---|---|
| `hoody pty` | removed | Use `hoody shell`. |

### `hoody run`

| Old | New | Note |
|---|---|---|
| `hoody run config` | `hoody run config get` |  |
| `hoody run go` | `hoody run resolve` |  |
| `hoody run jobs search` | `hoody run jobs search start` |  |
| `hoody run preflight` | `hoody run test` |  |
| `hoody run profiles select` | `hoody run profiles use` |  |
| `hoody run recipes run` | `hoody run recipes resolve` |  |
| `hoody run search` | removed | The name now belongs to the paged search that was `hoody run search-paged`. |
| `hoody run search-paged` | `hoody run search` |  |
| `hoody run sources diagnostics` | `hoody run sources diagnostics get` |  |
| `hoody run sources sync-all` | `hoody run sources sync` |  |

### `hoody screenshot`

| Old | New | Note |
|---|---|---|
| `hoody screenshot (alias ss)` | `hoody browser screenshots save`, `hoody display screenshots save` or `hoody terminal sessions screenshots save` | The group was removed; pick the surface. |

### `hoody servers`

| Old | New | Note |
|---|---|---|
| `hoody servers commands` | `hoody servers commands list` |  |
| `hoody servers exec` | `hoody servers commands run` |  |
| `hoody servers get-rental` | removed | Use `hoody servers get`. |
| `hoody servers list-rentals` | removed | Use `hoody servers list`. |
| `hoody servers marketplace` | `hoody servers marketplace list` |  |
| `hoody servers runtime` | `hoody servers stats` |  |
| `hoody servers subscriptions auto-renew` | `hoody servers subscriptions autorenew enable` or `hoody servers subscriptions autorenew disable` | Split: choose the command that matches what you meant. |
| `hoody servers subscriptions operation` | `hoody servers jobs get` |  |
| `hoody servers subscriptions quote` | `hoody servers plans quote` |  |
| `hoody servers subscriptions quote-change` | `hoody servers subscriptions quote` |  |

### `hoody shell`

| Old | New | Note |
|---|---|---|
| `hoody shell (alias sh)` | `hoody shell` |  |

### `hoody snapshots`

| Old | New | Note |
|---|---|---|
| `hoody snapshots update-alias` | `hoody snapshots alias set` |  |

### `hoody ssh`

| Old | New | Note |
|---|---|---|
| `hoody ssh` | removed | Use `hoody shell` (`--ssh-host` still bridges to an SSH server). |

### `hoody storage`

| Old | New | Note |
|---|---|---|
| `hoody storage create` | `hoody storage shares create` |  |
| `hoody storage delete` | `hoody storage shares delete` |  |
| `hoody storage get` | `hoody storage shares get` |  |
| `hoody storage incoming list` | `hoody storage containers incoming list` |  |
| `hoody storage incoming list-all` | `hoody storage incoming list` |  |
| `hoody storage incoming toggle-mount` | `hoody storage incoming mount` or `hoody storage incoming unmount` | Split: choose the command that matches what you meant. |
| `hoody storage list` | `hoody storage containers shares list` |  |
| `hoody storage list-all` | `hoody storage shares list` |  |
| `hoody storage update` | `hoody storage shares update` |  |

### `hoody terminal`

| Old | New | Note |
|---|---|---|
| `hoody terminal automation keys` | `hoody terminal keys list` |  |
| `hoody terminal automation metrics` | `hoody terminal automation stats` |  |
| `hoody terminal processes freeze` | `hoody terminal processes pause` |  |
| `hoody terminal processes unfreeze` | `hoody terminal processes resume` |  |
| `hoody terminal sessions abort` | `hoody terminal commands cancel` |  |
| `hoody terminal sessions automation-state` | `hoody terminal sessions automation status` |  |
| `hoody terminal sessions command-result` | `hoody terminal commands get` |  |
| `hoody terminal sessions exec` | `hoody terminal commands run` |  |
| `hoody terminal sessions find` | `hoody terminal sessions search` |  |
| `hoody terminal sessions history` | `hoody terminal commands list` |  |
| `hoody terminal sessions mouse` | `hoody terminal sessions mouseevents send` |  |
| `hoody terminal sessions raw-output` | `hoody terminal sessions read` |  |
| `hoody terminal sessions screenshot` | `hoody terminal sessions screenshots capture` |  |
| `hoody terminal sessions snapshot` | `hoody terminal sessions snapshot get` |  |
| `hoody terminal sessions web` | removed | Use `hoody terminal open`. |
| `hoody terminal sh` | removed | Use `hoody shell`, or `hoody terminal sessions connect`. |
| `hoody terminal system daemon-config` | `hoody terminal system daemonprograms list` |  |
| `hoody terminal system display-info` | `hoody terminal system displays list` |  |
| `hoody terminal system ports` | `hoody terminal system ports list` |  |
| `hoody terminal system resources` | `hoody terminal system stats` |  |
| `hoody terminal system stop-display` | `hoody terminal system displays stop` |  |

### `hoody tunnel`

| Old | New | Note |
|---|---|---|
| `hoody tunnel sessions kill` | `hoody tunnel sessions close` |  |

### `hoody users`

| Old | New | Note |
|---|---|---|
| `hoody users free-tier-status` | `hoody users freetier status` |  |
| `hoody users mark-onboarding` | `hoody users onboardingmilestones complete` |  |
| `hoody users redeem-invite` | `hoody users invites redeem` |  |
| `hoody users retry-setup` | `hoody users setup retry` |  |
| `hoody users security-history` | `hoody users securityhistory list` |  |

### `hoody wallet`

| Old | New | Note |
|---|---|---|
| `hoody wallet balance ai` | `hoody wallet credits get` |  |
| `hoody wallet balance general` | `hoody wallet balances general get` |  |
| `hoody wallet balance get` | `hoody wallet balances get` |  |
| `hoody wallet github-bonus claim` | `hoody wallet githubbonus claim` |  |
| `hoody wallet github-bonus status` | `hoody wallet githubbonus status` |  |
| `hoody wallet invoices generate` | `hoody wallet invoices create` |  |
| `hoody wallet payment-methods create` | `hoody wallet payments methods create` |  |
| `hoody wallet payment-methods delete` | `hoody wallet payments methods delete` |  |
| `hoody wallet payment-methods get` | `hoody wallet payments methods get` |  |
| `hoody wallet payment-methods list` | `hoody wallet payments methods list` |  |
| `hoody wallet payment-methods set-default` | `hoody wallet payments methods default set` |  |
| `hoody wallet payment-methods update` | `hoody wallet payments methods update` |  |
| `hoody wallet payments availability` | `hoody wallet payments availability get` |  |
| `hoody wallet payments crypto invoice` | `hoody wallet payments crypto invoices create` |  |
| `hoody wallet transactions fees` | `hoody wallet credits fees list` |  |
| `hoody wallet transfer` | `hoody wallet credits transfer` |  |

## SDK: old accessor to new accessor

Accessors are written from the client (`client.api.auth.tokens.create` is `hoody.api.auth.tokens.create` on an account client and `box.<ns>...` on a container-scoped one).
Pagination helpers (`listAll`, `listIterator`) moved with their base method and have their own rows. Request and response type names follow the final method name (`DaemonProgramsAddRequest` is now `DaemonProgramsCreateRequest`).

### Client helpers (hand-written)

| Old | New | Note |
|---|---|---|
| `HoodyClient.authenticate()` | `HoodyClient.login()` |  |
| `client.attachProgramTerminal(container, program)` | `client.daemon.programs.connectTerminal(program)` |  |
| `client.createDesktopTerminal()` | `client.terminal.sessions.createDesktop()` |  |
| `client.createLocalTerminal()` | `client.terminal.sessions.createLocal()` |  |
| `client.createSshTerminal()` | `client.terminal.sessions.createSsh()` |  |
| `client.curlChannel()` | `client.curl.channel.connect()` |  |
| `client.execute(command)` | `client.terminal.run(command)` |  |
| `client.executeSshCommand()` | `client.terminal.commands.runSsh()` |  |
| `client.getDesktopEnvironments() / HoodyClient.getDesktopEnvironments()` | `client.listDesktopEnvironments() / HoodyClient.listDesktopEnvironments()` |  |
| `client.getKitCatalog() / HoodyClient.getKitCatalog()` | `client.listKits() / HoodyClient.listKits()` |  |
| `client.getProgramTerminalId(container, program)` | `client.daemon.programs.getTerminalId(program)` |  |
| `client.listAgentConfigTools()` | `client.agent.listLocalConfigTools()` |  |
| `client.saveBrowserScreenshot()` | `client.browser.page.saveScreenshot()` |  |
| `client.saveDisplayScreenshot()` | `client.display.screenshots.save()` |  |
| `client.saveTerminalScreenshot()` | `client.terminal.sessions.saveScreenshot()` |  |
| `client.syncAgentConfig(tool)` | `client.agent.importLocalConfig(tool)` |  |
| `client.syncAgentConfigs(tools)` | `client.agent.importLocalConfigs(tools)` |  |
| `getKitCatalogEntries()` | `listKits()` |  |
| `patchExecScriptsServicePrototype, patchHoodyClientMetrics, patch*Prototype (13 exports)` | `not exported` | Install-time plumbing, no longer exported. |

### `agent`

| Old | New | Note |
|---|---|---|
| `client.agent.agents.copyAgent` | `client.agent.definitions.copy` |  |
| `client.agent.agents.createAgent` | `client.agent.definitions.create` |  |
| `client.agent.agents.deleteAgent` | `client.agent.definitions.delete` |  |
| `client.agent.agents.getAgentSource` | `client.agent.definitions.getSource` |  |
| `client.agent.agents.listAgentFiles` | `client.agent.files.list` |  |
| `client.agent.agents.listAgentFilesAll` | `client.agent.files.listAll` |  |
| `client.agent.agents.listAgentFilesIterator` | `client.agent.files.listIterator` |  |
| `client.agent.agents.listAgents` | `client.agent.definitions.list` |  |
| `client.agent.agents.listAgentsAll` | `client.agent.definitions.listAll` |  |
| `client.agent.agents.listAgentsIterator` | `client.agent.definitions.listIterator` |  |
| `client.agent.agents.putAgentSource` | `client.agent.definitions.setSource` |  |
| `client.agent.agents.renameAgent` | `client.agent.definitions.rename` |  |
| `client.agent.agents.resetAgentToShipped` | `client.agent.definitions.reset` |  |
| `client.agent.agents.setAgentModel` | `client.agent.definitions.setModel` |  |
| `client.agent.agents.setAgentTools` | `client.agent.definitions.setTools` |  |
| `client.agent.agents.setAgentTurns` | `client.agent.definitions.setTurnLimit` |  |
| `client.agent.agents.toggleAgentTool` | `client.agent.definitions.toggleTool` |  |
| `client.agent.changes.getChanges` | `client.agent.changes.get` |  |
| `client.agent.changes.streamChanges` | `client.agent.changes.stream` |  |
| `client.agent.discovery.listContainers` | `client.agent.containers.list` |  |
| `client.agent.discovery.listContainersAll` | `client.agent.containers.listAll` |  |
| `client.agent.discovery.listContainersIterator` | `client.agent.containers.listIterator` |  |
| `client.agent.discovery.listRealms` | `client.agent.realms.list` |  |
| `client.agent.discovery.listRealmsAll` | `client.agent.realms.listAll` |  |
| `client.agent.discovery.listRealmsIterator` | `client.agent.realms.listIterator` |  |
| `client.agent.exportLogs` | `client.agent.logs.export` |  |
| `client.agent.github.githubAddWorktree` | `client.agent.github.worktrees.create` |  |
| `client.agent.github.githubAuthStatus` | `client.agent.github.auth.getStatus` |  |
| `client.agent.github.githubBranches` | `client.agent.github.branches.list` |  |
| `client.agent.github.githubCheckoutPR` | `client.agent.github.prs.checkout` |  |
| `client.agent.github.githubClone` | `client.agent.github.repos.clone` |  |
| `client.agent.github.githubCommit` | `client.agent.github.commits.create` |  |
| `client.agent.github.githubCommitPush` | `client.agent.github.commits.create` |  |
| `client.agent.github.githubCreateBranch` | `client.agent.github.branches.create` |  |
| `client.agent.github.githubCreateIssue` | `client.agent.github.createIssue` |  |
| `client.agent.github.githubDeleteBranch` | `client.agent.github.branches.delete` |  |
| `client.agent.github.githubDiff` | `client.agent.github.getDiff` |  |
| `client.agent.github.githubListIssues` | `client.agent.github.listIssues` |  |
| `client.agent.github.githubListPRs` | `client.agent.github.prs.list` |  |
| `client.agent.github.githubListWorktrees` | `client.agent.github.worktrees.list` |  |
| `client.agent.github.githubLog` | `client.agent.github.commits.list` |  |
| `client.agent.github.githubLogin` | `client.agent.github.auth.start()` (device sign-in) / `client.agent.github.auth.login({ token })` |  |
| `client.agent.github.githubLoginPoll` | `client.agent.github.auth.poll` |  |
| `client.agent.github.githubLogout` | `client.agent.github.auth.logout` |  |
| `client.agent.github.githubMergePR` | `client.agent.github.prs.merge` |  |
| `client.agent.github.githubPullRequest` | `client.agent.github.prs.create` |  |
| `client.agent.github.githubReconnectRepo` | `client.agent.github.repos.setCredentials` |  |
| `client.agent.github.githubRemoveWorktree` | `client.agent.github.worktrees.delete` |  |
| `client.agent.github.githubRepoIdentity` | `client.agent.github.repos.resolve` |  |
| `client.agent.github.githubRepos` | `client.agent.github.repos.list` |  |
| `client.agent.github.githubSetActiveAccount` | `client.agent.github.useAccount` |  |
| `client.agent.github.githubStash` | `client.agent.github.pushStash` |  |
| `client.agent.github.githubStashPop` | `client.agent.github.popStash` |  |
| `client.agent.github.githubStatus` | `client.agent.github.getStatus` |  |
| `client.agent.github.githubSuggestCommitMessage` | `client.agent.github.commits.suggestMessage` |  |
| `client.agent.github.githubSwitchBranch` | `client.agent.github.branches.use` |  |
| `client.agent.github.githubSync` | `client.agent.github.sync` |  |
| `client.agent.headless.createHeadlessRun` | `client.agent.headless.start` or `client.agent.headless.start(data, { stream: true })` | Split: choose the method that matches what you meant. |
| `client.agent.hoody.bootstrapHoodyToken` | `client.agent.login` | Pass `{ token }`. |
| `client.agent.hoody.getHoodyAuthStatus` | `client.agent.whoami` |  |
| `client.agent.hoody.setActiveRealm` | `client.agent.realms.use` |  |
| `client.agent.hooks.ackHookTrust` | `client.agent.hooks.trust` |  |
| `client.agent.hooks.beginHookWrite` | `client.agent.hooks.createWriteIntent` |  |
| `client.agent.hooks.deleteHook` | `client.agent.hooks.delete` |  |
| `client.agent.hooks.disableAllHooks` | `client.agent.hooks.enableAll` or `client.agent.hooks.disableAll` | Split: choose the method that matches what you meant. |
| `client.agent.hooks.getHookRules` | `client.agent.hooks.getRules` |  |
| `client.agent.hooks.listHooks` | `client.agent.hooks.list` |  |
| `client.agent.hooks.reloadHooks` | `client.agent.hooks.reload` |  |
| `client.agent.hooks.setHookRules` | `client.agent.hooks.setRules` |  |
| `client.agent.hooks.testHook` | `client.agent.hooks.run` or `client.agent.hooks.test` | Split: choose the method that matches what you meant. |
| `client.agent.hooks.toggleHook` | `client.agent.hooks.enable` or `client.agent.hooks.disable` | Split: choose the method that matches what you meant. |
| `client.agent.hooks.upsertHook` | `client.agent.hooks.upsert` |  |
| `client.agent.jobs.deleteJob` | `client.agent.jobs.delete` |  |
| `client.agent.jobs.getJob` | `client.agent.jobs.get` |  |
| `client.agent.jobs.getJobResult` | `client.agent.jobs.getResult` |  |
| `client.agent.logs.logsSources` | `client.agent.logs.listSources` |  |
| `client.agent.logs.logsStats` | `client.agent.logs.getStats` |  |
| `client.agent.logs.queryLogs` | `client.agent.logs.list` |  |
| `client.agent.logs.readLogEntry` | `client.agent.logs.get` |  |
| `client.agent.logs.streamLogs` | `client.agent.logs.stream` |  |
| `client.agent.loops.createLoop` | `client.agent.loops.create` |  |
| `client.agent.loops.deleteLoop` | `client.agent.loops.delete` |  |
| `client.agent.loops.listAllLoops` | `client.agent.loops.list` |  |
| `client.agent.loops.listAllLoopsAll` | `client.agent.loops.listAll` |  |
| `client.agent.loops.listAllLoopsIterator` | `client.agent.loops.listIterator` |  |
| `client.agent.loops.listLoops` | `client.agent.sessions.listLoops` |  |
| `client.agent.loops.listLoopsAll` | `client.agent.sessions.listLoopsAll` |  |
| `client.agent.loops.listLoopsIterator` | `client.agent.sessions.listLoopsIterator` |  |
| `client.agent.loops.runLoopNow` | `client.agent.loops.startRun` |  |
| `client.agent.loops.updateLoop` | `client.agent.loops.update` |  |
| `client.agent.mcp.beginMCPWrite` | `client.agent.mcp.createWriteIntent` |  |
| `client.agent.mcp.deleteMCPServer` | `client.agent.mcp.delete` |  |
| `client.agent.mcp.importMCPServers` | `client.agent.mcp.import` |  |
| `client.agent.mcp.listMCPServers` | `client.agent.mcp.list` |  |
| `client.agent.mcp.parseMCPImport` | `client.agent.mcp.previewImport` |  |
| `client.agent.mcp.probeMCPServer` | `client.agent.mcp.test` |  |
| `client.agent.mcp.reconnectMCP` | `client.agent.mcp.reconnect` |  |
| `client.agent.mcp.setMCPServerEnabled` | `client.agent.mcp.enable` or `client.agent.mcp.disable` | Split: choose the method that matches what you meant. |
| `client.agent.mcp.upsertMCPServer` | `client.agent.mcp.upsert` |  |
| `client.agent.memory.assignMemoryDataHost` | `client.agent.memory.claimDataHost` |  |
| `client.agent.memory.beginMemoryWrite` | `client.agent.memory.createWriteIntent` |  |
| `client.agent.memory.consolidateMemory` | `client.agent.memory.consolidate` |  |
| `client.agent.memory.deleteMemoryItem` | `client.agent.memory.items.delete` |  |
| `client.agent.memory.deleteMemoryProject` | `client.agent.memory.deleteProject` |  |
| `client.agent.memory.editMemoryItem` | `client.agent.memory.items.update` |  |
| `client.agent.memory.flushMemory` | `client.agent.memory.flush` |  |
| `client.agent.memory.getMemoryDataHost` | `client.agent.memory.getDataHost` |  |
| `client.agent.memory.getMemoryGraph` | `client.agent.memory.getGraph` |  |
| `client.agent.memory.getMemoryItem` | `client.agent.memory.items.get` |  |
| `client.agent.memory.getMemoryStatus` | `client.agent.memory.getStatus` |  |
| `client.agent.memory.listMemoryItems` | `client.agent.memory.items.list` |  |
| `client.agent.memory.listMemoryItemsAll` | `client.agent.memory.items.listAll` |  |
| `client.agent.memory.listMemoryItemsIterator` | `client.agent.memory.items.listIterator` |  |
| `client.agent.memory.listMemoryProjects` | `client.agent.memory.listProjects` |  |
| `client.agent.memory.listMemoryProjectsAll` | `client.agent.memory.listProjectsAll` |  |
| `client.agent.memory.listMemoryProjectsIterator` | `client.agent.memory.listProjectsIterator` |  |
| `client.agent.memory.saveMemoryItem` | `client.agent.memory.items.create` |  |
| `client.agent.memory.searchMemory` | `client.agent.memory.search` |  |
| `client.agent.memory.setMemoryEnabled` | `client.agent.memory.enable` or `client.agent.memory.disable` | Split: choose the method that matches what you meant. |
| `client.agent.models.addProviderAccount` | `client.agent.providers.accounts.add` |  |
| `client.agent.models.createCompletion` | `client.agent.completions.create` |  |
| `client.agent.models.decideJev` | `client.agent.jev.decide` |  |
| `client.agent.models.decideSessionJev` | `client.agent.jev.decideForSession` |  |
| `client.agent.models.deleteProviderAPIKey` | `client.agent.providers.deleteApiKey` |  |
| `client.agent.models.getJevSettings` | `client.agent.jev.getSettings` |  |
| `client.agent.models.getModel` | `client.agent.models.get` |  |
| `client.agent.models.getProvider` | `client.agent.providers.get` |  |
| `client.agent.models.getProviderAuth` | `client.agent.providers.auth.getStatus` |  |
| `client.agent.models.listJevModels` | `client.agent.jev.listModels` |  |
| `client.agent.models.listModels` | `client.agent.models.list` |  |
| `client.agent.models.listModelsAll` | `client.agent.models.listAll` |  |
| `client.agent.models.listModelsIterator` | `client.agent.models.listIterator` |  |
| `client.agent.models.listProviderAccounts` | `client.agent.providers.accounts.list` |  |
| `client.agent.models.listProviderAccountsAll` | `client.agent.providers.accounts.listAll` |  |
| `client.agent.models.listProviderAccountsIterator` | `client.agent.providers.accounts.listIterator` |  |
| `client.agent.models.listProviders` | `client.agent.providers.list` |  |
| `client.agent.models.listProvidersAll` | `client.agent.providers.listAll` |  |
| `client.agent.models.listProvidersIterator` | `client.agent.providers.listIterator` |  |
| `client.agent.models.logoutProviderOAuth` | `client.agent.providers.oauth.logout` |  |
| `client.agent.models.pollProviderOAuth` | `client.agent.providers.oauth.poll` |  |
| `client.agent.models.removeProviderAccount` | `client.agent.providers.accounts.remove` |  |
| `client.agent.models.setProviderAPIKey` | `client.agent.providers.setApiKey` |  |
| `client.agent.models.setProviderAccountActive` | `client.agent.providers.accounts.use` |  |
| `client.agent.models.setProviderDefault` | `client.agent.providers.auth.setDefault` |  |
| `client.agent.models.startProviderOAuth` | `client.agent.providers.oauth.start` |  |
| `client.agent.models.streamCompletion` | `client.agent.completions.create` |  |
| `client.agent.models.submitProviderOAuthCode` | `client.agent.providers.oauth.submitCode` |  |
| `client.agent.models.testJev` | `client.agent.jev.test` |  |
| `client.agent.models.updateJevSettings` | `client.agent.jev.updateSettings` |  |
| `client.agent.sessions.acquireApproverLease` | `client.agent.sessions.approverLease.claim` |  |
| `client.agent.sessions.acquireSessionAttachment` | `client.agent.sessions.attachments.claim` |  |
| `client.agent.sessions.answerAssist` | `client.agent.gates.suggest` |  |
| `client.agent.sessions.answerQuestion` | `client.agent.gates.answer` |  |
| `client.agent.sessions.cancelSession` | `client.agent.sessions.turns.cancel` |  |
| `client.agent.sessions.closeSession` | `client.agent.sessions.close` |  |
| `client.agent.sessions.confirmGate` | `client.agent.gates.approve` or `client.agent.gates.deny` | Split: choose the method that matches what you meant. |
| `client.agent.sessions.createSession` | `client.agent.sessions.create` |  |
| `client.agent.sessions.createSessionTurn` | `client.agent.sessions.turns.create` |  |
| `client.agent.sessions.deleteSession` | `client.agent.sessions.delete` |  |
| `client.agent.sessions.deleteSessionApprovalRule` | `client.agent.sessions.approval.deleteRule` |  |
| `client.agent.sessions.getSession` | `client.agent.sessions.get` |  |
| `client.agent.sessions.getSessionApproval` | `client.agent.sessions.approval.get` |  |
| `client.agent.sessions.getSessionRulesApplies` | `client.agent.sessions.listApplicableRules` |  |
| `client.agent.sessions.getSessionState` | `client.agent.sessions.getSnapshot` |  |
| `client.agent.sessions.getSessionTranscript` | `client.agent.sessions.getTranscript` |  |
| `client.agent.sessions.getSessionTurn` | `client.agent.sessions.turns.get` |  |
| `client.agent.sessions.listPendingGates` | `client.agent.gates.list` |  |
| `client.agent.sessions.listPendingGatesAll` | `client.agent.gates.listAll` |  |
| `client.agent.sessions.listPendingGatesIterator` | `client.agent.gates.listIterator` |  |
| `client.agent.sessions.listSessionCwds` | `client.agent.sessions.listDirectories` |  |
| `client.agent.sessions.listSessionTurns` | `client.agent.sessions.turns.list` |  |
| `client.agent.sessions.listSessions` | `client.agent.sessions.list` |  |
| `client.agent.sessions.listSessionsAll` | `client.agent.sessions.listAll` |  |
| `client.agent.sessions.listSessionsIterator` | `client.agent.sessions.listIterator` |  |
| `client.agent.sessions.postSessionMessage` | `client.agent.sessions.turns.start` |  |
| `client.agent.sessions.postWorkflowMessage` | `client.agent.workflows.sendMessage` |  |
| `client.agent.sessions.promptStream` | `client.agent.sessions.turns.start(..., { stream: true })` |  |
| `client.agent.sessions.promptSync` | `client.agent.sessions.turns.run` |  |
| `client.agent.sessions.releaseSessionAttachment` | `client.agent.sessions.attachments.release` |  |
| `client.agent.sessions.renameSession` | `client.agent.sessions.rename` |  |
| `client.agent.sessions.renewSessionAttachment` | `client.agent.sessions.attachments.renew` |  |
| `client.agent.sessions.replaySession` | `client.agent.sessions.replay` |  |
| `client.agent.sessions.setSessionAgent` | `client.agent.sessions.setAgent` |  |
| `client.agent.sessions.setSessionApproval` | `client.agent.sessions.approval.update` |  |
| `client.agent.sessions.setSessionApprovalRule` | `client.agent.sessions.approval.setRule` |  |
| `client.agent.sessions.setSessionAutoReply` | `client.agent.sessions.autoReply.update` |  |
| `client.agent.sessions.setSessionAutoReplyWrites` | `client.agent.sessions.autoReply.enableWrites` / `client.agent.sessions.autoReply.disableWrites` |  |
| `client.agent.sessions.setSessionEffort` | `client.agent.sessions.setEffort` |  |
| `client.agent.sessions.setSessionHoodyEnv` | `client.agent.sessions.enableHoodyEnv` / `client.agent.sessions.disableHoodyEnv` |  |
| `client.agent.sessions.setSessionModel` | `client.agent.sessions.setModel` |  |
| `client.agent.sessions.setSessionVerbosity` | `client.agent.sessions.setVerbosity` |  |
| `client.agent.sessions.setSessionYolo` | `client.agent.sessions.enableYolo` / `client.agent.sessions.disableYolo` |  |
| `client.agent.sessions.stopAll` | `client.agent.stopAllWork` |  |
| `client.agent.sessions.streamSession` | `client.agent.sessions.connect` |  |
| `client.agent.sessions.streamSessionEvents` | `client.agent.sessions.stream` |  |
| `client.agent.sessions.trimSession` | `client.agent.sessions.trim` |  |
| `client.agent.settings.deleteFusion` | `client.agent.fusions.delete` |  |
| `client.agent.settings.getACPStatus` | `client.agent.acp.getStatus` |  |
| `client.agent.settings.getSettings` | `client.agent.settings.get` |  |
| `client.agent.settings.listFusion` | `client.agent.fusions.list` |  |
| `client.agent.settings.listFusionAll` | `client.agent.fusions.listAll` |  |
| `client.agent.settings.listFusionIterator` | `client.agent.fusions.listIterator` |  |
| `client.agent.settings.patchSettings` | `client.agent.settings.update` |  |
| `client.agent.settings.setACPAgentModel` | `client.agent.acp.setModel` |  |
| `client.agent.settings.setACPEnabled` | `client.agent.acp.enable` or `client.agent.acp.disable` | Split: choose the method that matches what you meant. |
| `client.agent.settings.setACPSecret` | `client.agent.acp.setSecret` |  |
| `client.agent.settings.upsertFusion` | `client.agent.fusions.set` |  |
| `client.agent.skills.applySkillImport` | `client.agent.skills.import` |  |
| `client.agent.skills.clearSkillHubCache` | `client.agent.skills.hub.clearCache` |  |
| `client.agent.skills.createSkill` | `client.agent.skills.create` |  |
| `client.agent.skills.deleteSkill` | `client.agent.skills.delete` |  |
| `client.agent.skills.getSkillHubCache` | `client.agent.skills.hub.getCacheStats` |  |
| `client.agent.skills.getSkillSource` | `client.agent.skills.getSource` |  |
| `client.agent.skills.installSkillHub` | `client.agent.skills.hub.install` |  |
| `client.agent.skills.listSkills` | `client.agent.skills.list` |  |
| `client.agent.skills.listSkillsAll` | `client.agent.skills.listAll` |  |
| `client.agent.skills.listSkillsIterator` | `client.agent.skills.listIterator` |  |
| `client.agent.skills.previewSkillHub` | `client.agent.skills.hub.preview` |  |
| `client.agent.skills.putSkillSource` | `client.agent.skills.setSource` |  |
| `client.agent.skills.renameSkill` | `client.agent.skills.rename` |  |
| `client.agent.skills.scanSkillImport` | `client.agent.skills.scan` |  |
| `client.agent.skills.searchSkillHub` | `client.agent.skills.hub.search` |  |
| `client.agent.skills.toggleSkill` | `client.agent.skills.enable` or `client.agent.skills.disable` | Split: choose the method that matches what you meant. |
| `client.agent.skills.trustSkill` | `client.agent.skills.trust` / `client.agent.skills.untrust` |  |
| `client.agent.statistics.getStatistics` | `client.agent.usage.getStats` |  |
| `client.agent.statistics.usageByAccount` | `client.agent.usage.listByAccount` |  |
| `client.agent.statistics.usageByModel` | `client.agent.usage.listByModel` |  |
| `client.agent.system.getAgentVersion` | `client.agent.kit.getVersion` |  |
| `client.agent.system.healthCheck` | `client.agent.kit.getHealth` |  |
| `client.agent.system.metrics` | `client.agent.kit.getMetrics` |  |
| `client.agent.tasks.cancelAllTasks` | `client.agent.sessions.tasks.cancelAll` |  |
| `client.agent.tasks.cancelTask` | `client.agent.sessions.tasks.cancel` |  |
| `client.agent.tasks.getTaskTranscript` | `client.agent.sessions.tasks.getTranscript` |  |
| `client.agent.tasks.listTasks` | `client.agent.sessions.tasks.list` |  |
| `client.agent.todos.approveTodoProposal` | `client.agent.todos.approveProposal` |  |
| `client.agent.todos.archiveTodo` | `client.agent.todos.archive` |  |
| `client.agent.todos.cancelTodoRun` | `client.agent.todos.cancel` |  |
| `client.agent.todos.claimTodo` | `client.agent.todos.claim` |  |
| `client.agent.todos.createTodo` | `client.agent.todos.create` |  |
| `client.agent.todos.denyTodoProposal` | `client.agent.todos.denyProposal` |  |
| `client.agent.todos.getTodo` | `client.agent.todos.get` |  |
| `client.agent.todos.getTodosRevision` | `client.agent.todos.getRevision` |  |
| `client.agent.todos.listTodos` | `client.agent.todos.list` |  |
| `client.agent.todos.listTodosAll` | `client.agent.todos.listAll` |  |
| `client.agent.todos.listTodosIterator` | `client.agent.todos.listIterator` |  |
| `client.agent.todos.messageTodo` | `client.agent.todos.sendMessage` |  |
| `client.agent.todos.postTodoComment` | `client.agent.todos.createComment` |  |
| `client.agent.todos.purgeTodos` | `client.agent.todos.purgeArchived` |  |
| `client.agent.todos.releaseTodo` | `client.agent.todos.release` |  |
| `client.agent.todos.runTodo` | `client.agent.todos.start` |  |
| `client.agent.todos.snoozeTodo` | `client.agent.todos.snooze` |  |
| `client.agent.todos.triageTodos` | `client.agent.todos.triage` |  |
| `client.agent.todos.updateTodo` | `client.agent.todos.update` |  |
| `client.agent.tools.getTool` | `client.agent.tools.get` |  |
| `client.agent.tools.listReadOnlyTools` | `client.agent.tools.listReadOnly` |  |
| `client.agent.tools.listReadOnlyToolsAll` | `client.agent.tools.listReadOnlyAll` |  |
| `client.agent.tools.listReadOnlyToolsIterator` | `client.agent.tools.listReadOnlyIterator` |  |
| `client.agent.tools.listSessionMCPTools` | `client.agent.sessions.tools.listMcp` |  |
| `client.agent.tools.listSessionMCPToolsAll` | `client.agent.sessions.tools.listMcpAll` |  |
| `client.agent.tools.listSessionMCPToolsIterator` | `client.agent.sessions.tools.listMcpIterator` |  |
| `client.agent.tools.listSessionTools` | `client.agent.sessions.tools.list` |  |
| `client.agent.tools.listSessionToolsAll` | `client.agent.sessions.tools.listAll` |  |
| `client.agent.tools.listSessionToolsIterator` | `client.agent.sessions.tools.listIterator` |  |
| `client.agent.tools.listTools` | `client.agent.tools.list` |  |
| `client.agent.tools.listToolsAll` | `client.agent.tools.listAll` |  |
| `client.agent.tools.listToolsIterator` | `client.agent.tools.listIterator` |  |
| `client.agent.tools.runSessionTool` | `client.agent.sessions.tools.run` |  |
| `client.agent.tools.runTool` | `client.agent.tools.run` |  |
| `client.agent.tools.runToolAsync` | `client.agent.tools.start` |  |
| `client.agent.tools.streamTool` | `client.agent.tools.run` |  |
| `client.agent.workflows.cancelWorkflowRun` | `client.agent.workflows.runs.cancel` |  |
| `client.agent.workflows.deleteWorkflow` | `client.agent.workflows.delete` |  |
| `client.agent.workflows.getWorkflow` | `client.agent.workflows.get` |  |
| `client.agent.workflows.getWorkflowRun` | `client.agent.workflows.runs.get` |  |
| `client.agent.workflows.hideWorkflow` | `client.agent.workflows.hide` / `client.agent.workflows.unhide` |  |
| `client.agent.workflows.listWorkflowRuns` | `client.agent.workflows.runs.list` |  |
| `client.agent.workflows.listWorkflowRunsAll` | `client.agent.workflows.runs.listAll` |  |
| `client.agent.workflows.listWorkflowRunsIterator` | `client.agent.workflows.runs.listIterator` |  |
| `client.agent.workflows.listWorkflows` | `client.agent.workflows.list` |  |
| `client.agent.workflows.listWorkflowsAll` | `client.agent.workflows.listAll` |  |
| `client.agent.workflows.listWorkflowsIterator` | `client.agent.workflows.listIterator` |  |
| `client.agent.workflows.putWorkflow` | `client.agent.workflows.set` |  |
| `client.agent.workflows.resumeWorkflowRun` | `client.agent.workflows.runs.resume` |  |
| `client.agent.workflows.runSessionWorkflow` | `client.agent.sessions.startWorkflow` |  |
| `client.agent.workflows.runWorkflow` | `client.agent.workflows.start` |  |
| `client.agent.workflows.setWorkflowSummary` | `client.agent.workflows.setSummary` |  |

### `api`

| Old | New | Note |
|---|---|---|
| `client.api.authTokens.addRealm` | `client.api.auth.tokens.addRealm` |  |
| `client.api.authTokens.copy` | `client.api.auth.tokens.copy` |  |
| `client.api.authTokens.create` | `client.api.auth.tokens.create` |  |
| `client.api.authTokens.delete` | `client.api.auth.tokens.delete` |  |
| `client.api.authTokens.get` | `client.api.auth.tokens.get` |  |
| `client.api.authTokens.getCurrent` | `client.api.auth.tokens.getCurrent` |  |
| `client.api.authTokens.getPublicProfile` | `client.api.auth.tokens.getPublicProfile` |  |
| `client.api.authTokens.list` | `client.api.auth.tokens.list` |  |
| `client.api.authTokens.listAll` | `client.api.auth.tokens.listAll` |  |
| `client.api.authTokens.listAuthTokenPermissionTemplates` | `client.api.auth.tokens.listTemplates` |  |
| `client.api.authTokens.listIterator` | `client.api.auth.tokens.listIterator` |  |
| `client.api.authTokens.removeRealm` | `client.api.auth.tokens.removeRealm` |  |
| `client.api.authTokens.update` | `client.api.auth.tokens.update` |  |
| `client.api.authTokens.updatePublicProfile` | `client.api.auth.tokens.updatePublicProfile` |  |
| `client.api.authentication.api_issueIdentityClaim` | `client.api.auth.createIdentityClaim` |  |
| `client.api.authentication.forgotPassword` | `client.api.auth.recoverPassword` |  |
| `client.api.authentication.getAvailableRegions` | `client.api.servers.listRegions` |  |
| `client.api.authentication.getCurrentUser` | `client.api.auth.whoami` |  |
| `client.api.authentication.getCurrentUserAlias` | removed | Use `client.api.auth.whoami`. |
| `client.api.authentication.getOAuthConfig` | `client.api.auth.getConfig` |  |
| `client.api.authentication.login` | `client.api.auth.login` |  |
| `client.api.authentication.logout` | `client.api.auth.logoutAll` |  |
| `client.api.authentication.oauthAuthorize` | `client.api.auth.oauth.authorize` |  |
| `client.api.authentication.oauthCancelIntent` | `client.api.auth.oauth.cancelIntent` |  |
| `client.api.authentication.oauthDeviceCode` | `client.api.auth.device.start` |  |
| `client.api.authentication.oauthDeviceDeny` | `client.api.auth.device.deny` |  |
| `client.api.authentication.oauthDeviceLogin` | `client.api.auth.device.login` |  |
| `client.api.authentication.oauthDeviceToken` | `client.api.auth.device.poll` |  |
| `client.api.authentication.oauthDeviceVerifyCode` | `client.api.auth.device.verifyCode` |  |
| `client.api.authentication.oauthExchange` | `client.api.auth.oauth.exchange` |  |
| `client.api.authentication.oauthLaunchInitiate` | `client.api.auth.oauth.startLaunch` |  |
| `client.api.authentication.refreshToken` | `client.api.auth.refresh` |  |
| `client.api.authentication.resendVerification` | `client.api.auth.email.sendVerification` |  |
| `client.api.authentication.resetPassword` | `client.api.auth.resetPassword` |  |
| `client.api.authentication.signup` | `client.api.auth.signup` |  |
| `client.api.authentication.verifyEmail` | `client.api.auth.email.verify` |  |
| `client.api.containers.authorize` | `client.api.containers.createClaim` |  |
| `client.api.containers.createSnapshot` | `client.api.snapshots.create` |  |
| `client.api.containers.deleteSnapshot` | `client.api.snapshots.delete` |  |
| `client.api.containers.getContainerProxyUsage` | `client.api.computers.proxy.getUsage` |  |
| `client.api.containers.getNetworkConfig` | `client.api.network.get` |  |
| `client.api.containers.getStatusLogs` | `client.api.containers.listStatusHistory` |  |
| `client.api.containers.listSnapshots` | `client.api.snapshots.list` |  |
| `client.api.containers.listSnapshotsAll` | `client.api.snapshots.listAll` |  |
| `client.api.containers.listSnapshotsIterator` | `client.api.snapshots.listIterator` |  |
| `client.api.containers.manage` | `client.api.containers.start` or `client.api.containers.stop` or `client.api.containers.restart` or `client.api.containers.pause` or `client.api.containers.resume` | Split: choose the method that matches what you meant. |
| `client.api.containers.removeNetworkConfig` | `client.api.network.delete` |  |
| `client.api.containers.restoreSnapshot` | `client.api.snapshots.restore` |  |
| `client.api.containers.setContainerKvm` | `client.api.containers.enableKvm` or `client.api.containers.disableKvm` | Split: choose the method that matches what you meant. |
| `client.api.containers.startNetwork` | `client.api.network.start` |  |
| `client.api.containers.stopNetwork` | `client.api.network.stop` |  |
| `client.api.containers.updateNetworkConfig` | `client.api.network.update` |  |
| `client.api.containers.updateSnapshotAlias` | `client.api.snapshots.setAlias` |  |
| `client.api.env.bulkSet` | `client.api.containers.env.update` |  |
| `client.api.env.delete` | `client.api.containers.env.delete` |  |
| `client.api.env.list` | `client.api.containers.env.list` |  |
| `client.api.env.set` | `client.api.containers.env.set` |  |
| `client.api.events.bulkDelete` | `client.api.events.clear` |  |
| `client.api.events.cleanup` | `client.api.events.purge` |  |
| `client.api.firewall.addEgressRule` | `client.api.firewall.egress.create` |  |
| `client.api.firewall.addIngressRule` | `client.api.firewall.ingress.create` |  |
| `client.api.firewall.list` | `client.api.firewall.listRules` |  |
| `client.api.firewall.removeEgressRule` | `client.api.firewall.egress.delete` |  |
| `client.api.firewall.removeIngressRule` | `client.api.firewall.ingress.delete` |  |
| `client.api.firewall.toggleEgressRule` | `client.api.firewall.egress.enable` or `client.api.firewall.egress.disable` | Split: choose the method that matches what you meant. |
| `client.api.firewall.toggleIngressRule` | `client.api.firewall.ingress.enable` or `client.api.firewall.ingress.disable` | Split: choose the method that matches what you meant. |
| `client.api.images.getDetails` | `client.api.images.getPublic` |  |
| `client.api.images.importFree` | `client.api.images.import` |  |
| `client.api.images.purchase` | `client.api.images.buy` |  |
| `client.api.notifications.getUserNotificationSummary` | `client.api.inbox.getSummary` |  |
| `client.api.notifications.list` | `client.api.inbox.list` |  |
| `client.api.notifications.listAll` | `client.api.inbox.listAll` |  |
| `client.api.notifications.listIterator` | `client.api.inbox.listIterator` |  |
| `client.api.notifications.listPublic` | `client.api.inbox.listAnnouncements` |  |
| `client.api.notifications.listPublicAll` | `client.api.inbox.listAnnouncementsAll` |  |
| `client.api.notifications.listPublicIterator` | `client.api.inbox.listAnnouncementsIterator` |  |
| `client.api.notifications.markAllRead` | `client.api.inbox.markAllRead` |  |
| `client.api.notifications.markRead` | `client.api.inbox.markRead` |  |
| `client.api.poolInvitations.accept` | `client.api.pools.invitations.accept` |  |
| `client.api.poolInvitations.list` | `client.api.pools.invitations.list` |  |
| `client.api.poolInvitations.reject` | `client.api.pools.invitations.reject` |  |
| `client.api.poolMembers.invite` | `client.api.pools.members.invite` |  |
| `client.api.poolMembers.remove` | `client.api.pools.members.remove` |  |
| `client.api.poolMembers.updateRole` | `client.api.pools.members.setRole` |  |
| `client.api.projects.addPermission` | `client.api.projects.permissions.add` |  |
| `client.api.projects.getProjectProxyUsage` | `client.api.projects.proxy.getUsage` |  |
| `client.api.projects.removePermission` | `client.api.projects.permissions.remove` |  |
| `client.api.proxyAliases.create` | `client.api.proxy.aliases.create` |  |
| `client.api.proxyAliases.delete` | `client.api.proxy.aliases.delete` |  |
| `client.api.proxyAliases.get` | `client.api.proxy.aliases.get` |  |
| `client.api.proxyAliases.list` | `client.api.proxy.aliases.list` |  |
| `client.api.proxyAliases.listAll` | `client.api.proxy.aliases.listAll` |  |
| `client.api.proxyAliases.listIterator` | `client.api.proxy.aliases.listIterator` |  |
| `client.api.proxyAliases.setState` | `client.api.proxy.aliases.enable` or `client.api.proxy.aliases.disable` | Split: choose the method that matches what you meant. |
| `client.api.proxyAliases.update` | `client.api.proxy.aliases.update` |  |
| `client.api.proxyDiscovery.getContainerProxyService` | `client.api.computers.proxy.getService` |  |
| `client.api.proxyDiscovery.getContainerProxySettings` | `client.api.computers.proxy.getSettings` |  |
| `client.api.proxyDiscovery.listContainerProxyGroups` | `client.api.computers.proxy.listGroups` |  |
| `client.api.proxyDiscovery.listContainerProxyServices` | `client.api.computers.proxy.listServices` |  |
| `client.api.proxyDiscovery.updateContainerProxySettings` | `client.api.computers.proxy.updateSettings` |  |
| `client.api.proxyHooks.addContainerProxyHook` | `client.api.computers.proxy.createHook` |  |
| `client.api.proxyHooks.clearContainerProxyServiceHooks` | `client.api.computers.proxy.clearHooks` |  |
| `client.api.proxyHooks.getContainerProxyHook` | `client.api.computers.proxy.getHook` |  |
| `client.api.proxyHooks.listContainerProxyHooks` | `client.api.computers.proxy.listHooks` |  |
| `client.api.proxyHooks.listContainerProxyServiceHooks` | `client.api.computers.proxy.listHooksByService` |  |
| `client.api.proxyHooks.moveContainerProxyHook` | `client.api.computers.proxy.moveHook` |  |
| `client.api.proxyHooks.removeContainerProxyHook` | `client.api.computers.proxy.deleteHook` |  |
| `client.api.proxyHooks.updateContainerProxyHook` | `client.api.computers.proxy.setHook` |  |
| `client.api.proxyPermissionsContainer.delete` | `client.api.computers.proxy.deletePermissions` |  |
| `client.api.proxyPermissionsContainer.get` | `client.api.computers.proxy.getPermissions` |  |
| `client.api.proxyPermissionsContainer.removeAuthGroup` | `client.api.computers.proxy.deleteGroup` |  |
| `client.api.proxyPermissionsContainer.removeGroup` | `client.api.computers.proxy.clearGroupPermissions` |  |
| `client.api.proxyPermissionsContainer.removeProgram` | `client.api.computers.proxy.deleteGroupPermission` |  |
| `client.api.proxyPermissionsContainer.replace` | `client.api.computers.proxy.setPermissions` |  |
| `client.api.proxyPermissionsContainer.setGroup` | `client.api.computers.proxy.setGroupPermission` |  |
| `client.api.proxyPermissionsContainer.setIpGroup` | `client.api.computers.proxy.setIpGroup` |  |
| `client.api.proxyPermissionsContainer.setJwtGroup` | `client.api.computers.proxy.setJwtGroup` |  |
| `client.api.proxyPermissionsContainer.setPasswordGroup` | `client.api.computers.proxy.setPasswordGroup` |  |
| `client.api.proxyPermissionsContainer.setTokenGroup` | `client.api.computers.proxy.setTokenGroup` |  |
| `client.api.proxyPermissionsContainer.updateDefault` | `client.api.computers.proxy.setDefault` |  |
| `client.api.proxyPermissionsContainer.updateState` | `client.api.computers.proxy.enable` or `client.api.computers.proxy.disable` | Split: choose the method that matches what you meant. |
| `client.api.proxyPermissionsProject.delete` | `client.api.projects.proxy.deletePermissions` |  |
| `client.api.proxyPermissionsProject.get` | `client.api.projects.proxy.getPermissions` |  |
| `client.api.proxyPermissionsProject.removeAuthGroup` | `client.api.projects.proxy.deleteGroup` |  |
| `client.api.proxyPermissionsProject.removeGroup` | `client.api.projects.proxy.clearGroupPermissions` |  |
| `client.api.proxyPermissionsProject.removeProgram` | `client.api.projects.proxy.deleteGroupPermission` |  |
| `client.api.proxyPermissionsProject.replace` | `client.api.projects.proxy.setPermissions` |  |
| `client.api.proxyPermissionsProject.setGroup` | `client.api.projects.proxy.setGroupPermission` |  |
| `client.api.proxyPermissionsProject.setIpGroup` | `client.api.projects.proxy.setIpGroup` |  |
| `client.api.proxyPermissionsProject.setJwtGroup` | `client.api.projects.proxy.setJwtGroup` |  |
| `client.api.proxyPermissionsProject.setPasswordGroup` | `client.api.projects.proxy.setPasswordGroup` |  |
| `client.api.proxyPermissionsProject.setTokenGroup` | `client.api.projects.proxy.setTokenGroup` |  |
| `client.api.proxyPermissionsProject.updateDefault` | `client.api.projects.proxy.setDefault` |  |
| `client.api.proxyPermissionsProject.updateState` | `client.api.projects.proxy.enable` or `client.api.projects.proxy.disable` | Split: choose the method that matches what you meant. |
| `client.api.rentals.extend` | `client.api.servers.extend` |  |
| `client.api.rentals.get` | `client.api.servers.get` |  |
| `client.api.rentals.list` | `client.api.servers.list` |  |
| `client.api.rentals.listAll` | `client.api.servers.listAll` |  |
| `client.api.rentals.listIterator` | `client.api.servers.listIterator` |  |
| `client.api.serverCommands.execute` | `client.api.servers.runCommand` |  |
| `client.api.serverCommands.list` | `client.api.servers.listCommands` |  |
| `client.api.serverCommands.listAll` | `client.api.servers.listCommandsAll` |  |
| `client.api.serverCommands.listIterator` | `client.api.servers.listCommandsIterator` |  |
| `client.api.serverRental.browse` | `client.api.servers.listMarketplace` |  |
| `client.api.serverRental.browseAll` | `client.api.servers.listMarketplaceAll` |  |
| `client.api.serverRental.browseIterator` | `client.api.servers.listMarketplaceIterator` |  |
| `client.api.serverRental.get` | removed | Use `client.api.servers.get`. |
| `client.api.serverRental.getMyReservation` | `client.api.servers.getReservation` |  |
| `client.api.serverRental.getRentalRuntime` | `client.api.servers.getStats` |  |
| `client.api.serverRental.getServerRuntime` | removed | Use `client.api.servers.getStats`. |
| `client.api.serverRental.list` | removed | Use `client.api.servers.list` (and `listAll` / `listIterator`). |
| `client.api.serverRental.listAll` | removed | Use the matching helper of `client.api.servers`. |
| `client.api.serverRental.listIterator` | removed | Use the matching helper of `client.api.servers`. |
| `client.api.serverRental.listMyReservations` | `client.api.servers.listReservations` |  |
| `client.api.serverRental.listServerOffers` | `client.api.servers.listOffers` |  |
| `client.api.serverRental.rent` | `client.api.servers.rent` |  |
| `client.api.serverRental.reserveServerOffer` | `client.api.servers.reserveOffer` |  |
| `client.api.storageShares.create` | `client.api.storage.shares.create` |  |
| `client.api.storageShares.delete` | `client.api.storage.shares.delete` |  |
| `client.api.storageShares.get` | `client.api.storage.shares.get` |  |
| `client.api.storageShares.list` | `client.api.storage.shares.listByContainer` |  |
| `client.api.storageShares.listAll` | `client.api.storage.shares.listByContainerAll` |  |
| `client.api.storageShares.listGlobal` | `client.api.storage.shares.list` |  |
| `client.api.storageShares.listGlobalAll` | `client.api.storage.shares.listAll` |  |
| `client.api.storageShares.listGlobalIterator` | `client.api.storage.shares.listIterator` |  |
| `client.api.storageShares.listIncoming` | `client.api.storage.incoming.listByComputer` |  |
| `client.api.storageShares.listIncomingGlobal` | `client.api.storage.incoming.list` |  |
| `client.api.storageShares.listIncomingGlobalAll` | `client.api.storage.incoming.listAll` |  |
| `client.api.storageShares.listIncomingGlobalIterator` | `client.api.storage.incoming.listIterator` |  |
| `client.api.storageShares.listIterator` | `client.api.storage.shares.listByContainerIterator` |  |
| `client.api.storageShares.toggleIncomingMount` | `client.api.storage.incoming.mount` or `client.api.storage.incoming.unmount` | Split: choose the method that matches what you meant. |
| `client.api.storageShares.update` | `client.api.storage.shares.update` |  |
| `client.api.subserverPlans.listSubserverPlans` | `client.api.servers.plans.list` |  |
| `client.api.subserverSubscriptions.cancelSubserverSubscription` | `client.api.servers.subscriptions.cancel` |  |
| `client.api.subserverSubscriptions.getSubserverOperation` | `client.api.servers.getJob` |  |
| `client.api.subserverSubscriptions.getSubserverSubscription` | `client.api.servers.subscriptions.get` |  |
| `client.api.subserverSubscriptions.listSubserverSubscriptions` | `client.api.servers.subscriptions.list` |  |
| `client.api.subserverSubscriptions.paySubserverSubscription` | `client.api.servers.subscriptions.pay` |  |
| `client.api.subserverSubscriptions.purchaseSubserverSubscription` | `client.api.servers.subscriptions.buy` |  |
| `client.api.subserverSubscriptions.quoteSubserverPurchase` | `client.api.servers.plans.quote` |  |
| `client.api.subserverSubscriptions.quoteSubserverSubscriptionChange` | `client.api.servers.subscriptions.quote` |  |
| `client.api.subserverSubscriptions.setSubserverSubscriptionAutoRenew` | `client.api.servers.subscriptions.enableAutoRenew` or `client.api.servers.subscriptions.disableAutoRenew` | Split: choose the method that matches what you meant. |
| `client.api.subserverSubscriptions.upgradeSubserverSubscription` | `client.api.servers.subscriptions.upgrade` |  |
| `client.api.tfa.disable` | `client.api.auth.twoFactor.disable` |  |
| `client.api.tfa.getStatus` | `client.api.auth.twoFactor.getStatus` |  |
| `client.api.tfa.regenerateBackupCodes` | `client.api.auth.twoFactor.rotateBackupCodes` |  |
| `client.api.tfa.setTokenGate` | `client.api.auth.twoFactor.enableTokenGate` or `client.api.auth.twoFactor.disableTokenGate` | Split: choose the method that matches what you meant. |
| `client.api.tfa.setup` | `client.api.auth.twoFactor.startSetup` |  |
| `client.api.tfa.verify` | `client.api.auth.twoFactor.verify` |  |
| `client.api.tfa.verifySetup` | `client.api.auth.twoFactor.confirmSetup` |  |
| `client.api.users.getSecurityHistory` | `client.api.users.listSecurityHistory` |  |
| `client.api.users.getSecurityHistoryAll` | `client.api.users.listSecurityHistoryAll` |  |
| `client.api.users.getSecurityHistoryIterator` | `client.api.users.listSecurityHistoryIterator` |  |
| `client.api.users.markOnboardingMilestone` | `client.api.users.completeOnboardingMilestone` |  |
| `client.api.users.redeemInviteCode` | `client.api.users.redeemInvite` |  |
| `client.api.utilities.getIpInfo` | `client.api.ip.get` |  |
| `client.api.wallet.addPaymentMethod` | `client.api.wallet.payments.createMethod` |  |
| `client.api.wallet.downloadInvoicePdf` | `client.api.wallet.invoices.download` |  |
| `client.api.wallet.generateInvoice` | `client.api.wallet.invoices.create` |  |
| `client.api.wallet.getAggregateBalances` | `client.api.wallet.getBalances` |  |
| `client.api.wallet.getAiBalance` | `client.api.wallet.credits.get` |  |
| `client.api.wallet.getGeneralBalance` | `client.api.wallet.getGeneralBalance` |  |
| `client.api.wallet.listAiFeeHistory` | `client.api.wallet.credits.listFees` |  |
| `client.api.wallet.listAiFeeHistoryAll` | `client.api.wallet.credits.listFeesAll` |  |
| `client.api.wallet.listAiFeeHistoryIterator` | `client.api.wallet.credits.listFeesIterator` |  |
| `client.api.wallet.transferToAi` | `client.api.wallet.credits.transfer` |  |

### `browser`

| Old | New | Note |
|---|---|---|
| `client.browser.cookies.get` | `client.browser.cookies.list` |  |
| `client.browser.cookies.set` | `client.browser.cookies.setMany` |  |
| `client.browser.debugging.getConsoleLogs` | `client.browser.logs.listConsole` |  |
| `client.browser.debugging.getNetworkLogs` | `client.browser.logs.listNetwork` |  |
| `client.browser.health.check` | `client.browser.kit.getHealth` |  |
| `client.browser.health.getMetrics` | `client.browser.kit.getStats` |  |
| `client.browser.interaction.browse` | removed | Use `client.browser.page.navigate`. |
| `client.browser.interaction.browsePost` | `client.browser.page.navigate` |  |
| `client.browser.interaction.evalGet` | removed | Use `client.browser.page.evaluate`. |
| `client.browser.interaction.evalPost` | `client.browser.page.evaluate` |  |
| `client.browser.interaction.getSnapshot` | `client.browser.page.getSnapshot` |  |
| `client.browser.interaction.performAction` | `client.browser.page.act` |  |
| `client.browser.interaction.takeScreenshot` | `client.browser.page.captureScreenshot` |  |
| `client.browser.interaction.waitFor` | `client.browser.page.wait` |  |
| `client.browser.introspection.closeTab` | `client.browser.tabs.close` |  |
| `client.browser.introspection.getDevtoolsUrl` | `client.browser.instances.getDevtoolsUrls` |  |
| `client.browser.introspection.getMetadata` | `client.browser.instances.get` |  |
| `client.browser.introspection.getViewport` | `client.browser.viewport.get` |  |
| `client.browser.introspection.listTabs` | `client.browser.tabs.list` |  |
| `client.browser.introspection.setViewport` | `client.browser.viewport.set` |  |
| `client.browser.introspection.shutdown` | `client.browser.instances.shutdown` |  |

### `code`

| Old | New | Note |
|---|---|---|
| `client.code.health.check` | `client.code.kit.getHealth` |  |
| `client.code.health.getStatus` | `client.code.kit.getStatus` |  |
| `client.code.health.getVersion` | `client.code.kit.getVersion` |  |
| `client.code.static.getFavicon` | `client.code.ui.getFavicon` |  |
| `client.code.static.getRobots` | `client.code.ui.getRobots` |  |
| `client.code.static.getSecurityPolicy` | `client.code.ui.getSecurityPolicy` |  |
| `client.code.static.getWellKnownSecurityTxt` | removed | Use `client.code.ui.getSecurityPolicy()`. |
| `client.code.vscode.embedUrl()` | removed | Build the page URL with `client.embeds.code.editor()` (also `.root()`, `.extension()`). |
| `client.code.vscode.getManifest` | `client.code.ui.getManifest` |  |
| `client.code.vscode.getVSCode` | removed | Was `client.code.ui.getPage` until 1.0.0-beta.16. Build the page URL with `client.embeds.code.editor()` (also `.root()`, `.extension()`) and open or embed it. |

### `cron`

| Old | New | Note |
|---|---|---|
| `client.cron.crontab.get` | `client.cron.crontabs.get` |  |
| `client.cron.crontab.listGlobal` | `client.cron.crontabs.list` |  |
| `client.cron.crontab.listGlobalAll` | `client.cron.crontabs.listAll` |  |
| `client.cron.crontab.listGlobalIterator` | `client.cron.crontabs.listIterator` |  |
| `client.cron.crontab.put` | `client.cron.crontabs.set` |  |
| `client.cron.health.check` | `client.cron.kit.getHealth` |  |

### `curl`

| Old | New | Note |
|---|---|---|
| `client.curl.events.sseJobEvents` | `client.curl.jobs.stream` |  |
| `client.curl.events.streamWs` | `client.curl.jobs.connect` |  |
| `client.curl.events.wsRequestChannel` | `client.curl.channel.connect` |  |
| `client.curl.execute` | `client.curl.run` |  |
| `client.curl.executeCurlRequestGet` | removed | Use `client.curl.run`. |
| `client.curl.health.check` | `client.curl.kit.getHealth` |  |
| `client.curl.jobs.cancel` | `client.curl.jobs.cancel` or `client.curl.jobs.delete` | Split: choose the method that matches what you meant. |
| `client.curl.ops.metrics` | `client.curl.kit.getMetrics` |  |
| `client.curl.schedules.toggle` | removed | Use `client.curl.schedules.update(id, { enabled })`. |
| `client.curl.schedules.updateSchedule` | `client.curl.schedules.update` |  |
| `client.curl.sessions.getCookies` | `client.curl.sessions.listCookies` |  |
| `client.curl.storage.deleteFile` | `client.curl.storage.delete` |  |
| `client.curl.storage.getFile` | `client.curl.storage.get` |  |

### `daemon`

| Old | New | Note |
|---|---|---|
| `client.daemon.control.disable` | `client.daemon.programs.disable` |  |
| `client.daemon.control.enable` | `client.daemon.programs.enable` |  |
| `client.daemon.control.start` | `client.daemon.programs.start` |  |
| `client.daemon.control.stop` | `client.daemon.programs.stop` |  |
| `client.daemon.health.check` | `client.daemon.kit.getHealth` |  |
| `client.daemon.programs.add` | `client.daemon.programs.create` |  |
| `client.daemon.programs.edit` | `client.daemon.programs.update` |  |
| `client.daemon.programs.getProgramSandbox` | `client.daemon.programs.getSandbox` |  |
| `client.daemon.programs.remove` | `client.daemon.programs.delete` |  |
| `client.daemon.quickStart.getEphemeralLogs` | `client.daemon.ephemeralPrograms.getLogs` |  |
| `client.daemon.quickStart.getStatus` | `client.daemon.ephemeralPrograms.getStatus` |  |
| `client.daemon.quickStart.launch` | `client.daemon.ephemeralPrograms.start` |  |
| `client.daemon.quickStart.list` | `client.daemon.ephemeralPrograms.list` |  |
| `client.daemon.quickStart.stop` | `client.daemon.ephemeralPrograms.stop` |  |
| `client.daemon.status.get` | `client.daemon.programs.getStatus` |  |
| `client.daemon.status.getAll` | `client.daemon.programs.listStatuses` |  |
| `client.daemon.status.getLogs` | `client.daemon.programs.getLogs` |  |
| `client.daemon.status.streamProgramLogs` | `client.daemon.programs.streamLogs` |  |

### `display`

| Old | New | Note |
|---|---|---|
| `client.display.accessClient` | removed | Was `client.display.ui.getPage` until 1.0.0-beta.16. Build the page URL with `client.embeds.display.client()` and open or embed it. |
| `client.display.getClipboard` | `client.display.clipboard.get` |  |
| `client.display.getInformation` | `client.display.get` |  |
| `client.display.getWindowProperties` | `client.display.windows.get` |  |
| `client.display.health.check` | `client.display.kit.getHealth` |  |
| `client.display.input.batch` | `client.display.input.actMany` |  |
| `client.display.input.clickAt` | `client.display.input.click` |  |
| `client.display.input.geometry` | `client.display.getGeometry` |  |
| `client.display.input.keyboardKey` | `client.display.keyboard.press` |  |
| `client.display.input.keyboardKeyDown` | `client.display.keyboard.down` |  |
| `client.display.input.keyboardKeyUp` | `client.display.keyboard.up` |  |
| `client.display.input.keyboardType` | `client.display.keyboard.type` |  |
| `client.display.input.mouseClick` | `client.display.mouse.click` |  |
| `client.display.input.mouseDoubleClick` | `client.display.mouse.doubleClick` |  |
| `client.display.input.mouseDown` | `client.display.mouse.down` |  |
| `client.display.input.mouseLocation` | `client.display.mouse.getPosition` |  |
| `client.display.input.mouseMove` | `client.display.mouse.move` |  |
| `client.display.input.mouseMoveRelative` | `client.display.mouse.moveBy` |  |
| `client.display.input.mouseScroll` | `client.display.mouse.scroll` |  |
| `client.display.input.mouseUp` | `client.display.mouse.up` |  |
| `client.display.input.typeAt` | `client.display.input.type` |  |
| `client.display.input.waitUntil` | `client.display.windows.wait` |  |
| `client.display.input.windowActive` | `client.display.windows.getActive` |  |
| `client.display.input.windowClose` | `client.display.windows.close` |  |
| `client.display.input.windowFocus` | `client.display.windows.focus` |  |
| `client.display.input.windowGeometry` | `client.display.windows.getGeometry` |  |
| `client.display.input.windowMinimize` | `client.display.windows.minimize` |  |
| `client.display.input.windowMove` | `client.display.windows.move` |  |
| `client.display.input.windowName` | `client.display.windows.getTitle` |  |
| `client.display.input.windowRaise` | `client.display.windows.raise` |  |
| `client.display.input.windowResize` | `client.display.windows.resize` |  |
| `client.display.input.windowRestore` | `client.display.windows.restore` |  |
| `client.display.input.windowSearch` | `client.display.windows.search` |  |
| `client.display.listScreenshots` | `client.display.screenshots.list` |  |
| `client.display.listWindows` | `client.display.windows.list` |  |
| `client.display.screenshots.captureMetadata` | `client.display.screenshots.capture` |  |
| `client.display.screenshots.getByTimestamp` | `client.display.screenshots.get` |  |
| `client.display.screenshots.getLatestMetadata` | `client.display.screenshots.getLatest` |  |
| `client.display.setClipboard` | `client.display.clipboard.set` |  |
| `client.display.thumbnails.getByTimestamp` | `client.display.thumbnails.get` |  |

### `egress`

| Old | New | Note |
|---|---|---|
| `client.egress.disableUpstream` | `client.egress.upstream.disable` |  |
| `client.egress.getUpstream` | `client.egress.upstream.get` |  |
| `client.egress.healthCheck` | `client.egress.kit.getHealth` |  |
| `client.egress.setUpstream` | `client.egress.upstream.set` |  |
| `client.egress.setUpstreamPost` | removed | Use `client.egress.upstream.set`. |

### `exec`

| Old | New | Note |
|---|---|---|
| `client.exec.dependencies.check` | `client.exec.modules.test` |  |
| `client.exec.dependencies.install` | `client.exec.modules.install` |  |
| `client.exec.dependencies.listBundled` | `client.exec.modules.listBundled` |  |
| `client.exec.execution.callScript(name, args)` | `client.exec.call(name, args)` |  |
| `client.exec.execution.discoverScripts()` | `client.exec.listCallableScripts()` |  |
| `client.exec.execution.execute` | `client.exec.run` |  |
| `client.exec.execution.executeTypedGet() / executeTypedPost() / executeScript()` | `client.exec.run(path, { method, body, query })` |  |
| `client.exec.health.check` | `client.exec.kit.getHealth` |  |
| `client.exec.ids.list` | `client.exec.namespaces.list` |  |
| `client.exec.logs.read` | `client.exec.logs.get` |  |
| `client.exec.magic.bulkUpdate` | `client.exec.magicComments.updateMany` |  |
| `client.exec.magic.getSchema` | `client.exec.magicComments.getSchema` |  |
| `client.exec.magic.read` | `client.exec.magicComments.get` |  |
| `client.exec.magic.updateHandler` | `client.exec.magicComments.update` |  |
| `client.exec.monitor.getActiveRequests` | `client.exec.kit.listRequests` |  |
| `client.exec.monitor.getScriptPerformance` | `client.exec.scripts.getStats` |  |
| `client.exec.monitor.getStats` | `client.exec.kit.getStats` |  |
| `client.exec.monitor.listMonitorScripts` | `client.exec.scripts.listStats` |  |
| `client.exec.monitor.prometheusExport` | `client.exec.kit.getMetrics` |  |
| `client.exec.openapi.serve` | `client.exec.openapi.get` |  |
| `client.exec.openapi.serveSchema` | `client.exec.openapi.getSchema` |  |
| `client.exec.package.compare` | `client.exec.packages.compare` |  |
| `client.exec.package.initJson` | `client.exec.packages.manifest.create` |  |
| `client.exec.package.install` | `client.exec.packages.install` |  |
| `client.exec.package.pinVersions` | `client.exec.packages.pin` |  |
| `client.exec.package.readJson` | `client.exec.packages.manifest.get` |  |
| `client.exec.package.updateJson` | `client.exec.packages.manifest.update` |  |
| `client.exec.route.discover` | `client.exec.routes.list` |  |
| `client.exec.route.resolve` | `client.exec.routes.resolve` |  |
| `client.exec.route.test` | `client.exec.routes.test` |  |
| `client.exec.schedules.listSchedules` | `client.exec.schedules.list` |  |
| `client.exec.schedules.reloadSchedules` | `client.exec.schedules.reload` |  |
| `client.exec.schedules.scheduleHistory` | `client.exec.schedules.listHistory` |  |
| `client.exec.schedules.triggerSchedule` | `client.exec.schedules.run` |  |
| `client.exec.scripts.deleteFile / deleteMarkdown / deleteSchemaJson / deleteOpenApiJson` | `client.exec.scripts.deleteFile(path, { kind })` | `kind` is `'file'` (the default), `'markdown'`, `'schema'` or `'openapi'`. |
| `client.exec.scripts.listFiles / listMarkdown / listSchemaJson / listOpenApiJson` | `client.exec.scripts.listFiles({ kind })` | `kind` is `'file'` (the default), `'markdown'`, `'schema'` or `'openapi'`. |
| `client.exec.scripts.readFile / readMarkdown / readSchemaJson / readOpenApiJson` | `client.exec.scripts.readFile(path, { kind })` | `kind` is `'file'` (the default), `'markdown'`, `'schema'` or `'openapi'`. |
| `client.exec.scripts.writeFile / writeMarkdown / writeSchemaJson / writeOpenApiJson` | `client.exec.scripts.writeFile(path, data, { kind })` | `kind` is `'file'` (the default), `'markdown'`, `'schema'` or `'openapi'`. |
| `client.exec.sdk.delete` | `client.exec.sdks.delete` |  |
| `client.exec.sdk.get` | `client.exec.sdks.get` |  |
| `client.exec.sdk.importSDK` | `client.exec.sdks.import` |  |
| `client.exec.sdk.list` | `client.exec.sdks.list` |  |
| `client.exec.state.clear` | `client.exec.store.clear` |  |
| `client.exec.state.get` | `client.exec.store.get` |  |
| `client.exec.state.set` | `client.exec.store.set` |  |
| `client.exec.system.getRestartStatus` | `client.exec.kit.getStatus` |  |
| `client.exec.system.restartServer` | `client.exec.kit.restart` |  |
| `client.exec.templates.createCustom` | `client.exec.templates.create` |  |
| `client.exec.templates.deleteCustom` | `client.exec.templates.delete` |  |
| `client.exec.templates.updateCustom` | `client.exec.templates.update` |  |
| `client.exec.validate.validateDependencies` | `client.exec.scripts.validateDependencies` |  |
| `client.exec.validate.validateMagicComments` | `client.exec.magicComments.validate` |  |
| `client.exec.validate.validateReturnType` | `client.exec.scripts.validateReturnType` |  |
| `client.exec.validate.validateScript` | `client.exec.scripts.validate` |  |
| `client.exec.validate.validateSyntax` | `client.exec.scripts.validateSyntax` |  |
| `client.exec.validate.validateTypeScript` | `client.exec.scripts.validateTypes` |  |

### `files`

| Old | New | Note |
|---|---|---|
| `client.files.archives.downloadAsZip` | `client.files.zip` |  |
| `client.files.archives.extractFile` | `client.files.archives.extractMember` |  |
| `client.files.archives.getHistory` | `client.files.extractions.listHistory` |  |
| `client.files.archives.listActive` | `client.files.extractions.listByDirectory` |  |
| `client.files.archives.listGlobal` | `client.files.extractions.list` |  |
| `client.files.archives.viewFile` | `client.files.archives.readMember` |  |
| `client.files.authentication.checkAuth` | `client.files.whoami` |  |
| `client.files.authentication.logout` | `client.files.logout` |  |
| `client.files.backends.connectAzureblob` | `client.files.backends.createAzureblob` |  |
| `client.files.backends.connectAzurefiles` | `client.files.backends.createAzurefiles` |  |
| `client.files.backends.connectB2` | `client.files.backends.createB2` |  |
| `client.files.backends.connectBox` | `client.files.backends.createBox` |  |
| `client.files.backends.connectCloudinary` | `client.files.backends.createCloudinary` |  |
| `client.files.backends.connectDrive` | `client.files.backends.createDrive` |  |
| `client.files.backends.connectDropbox` | `client.files.backends.createDropbox` |  |
| `client.files.backends.connectFichier` | `client.files.backends.createFichier` |  |
| `client.files.backends.connectFilefabric` | `client.files.backends.createFilefabric` |  |
| `client.files.backends.connectFilescom` | `client.files.backends.createFilescom` |  |
| `client.files.backends.connectFtp` | `client.files.backends.createFtp` |  |
| `client.files.backends.connectGofile` | `client.files.backends.createGofile` |  |
| `client.files.backends.connectGoogleCloudStorage` | `client.files.backends.createGoogleCloudStorage` |  |
| `client.files.backends.connectGooglePhotos` | `client.files.backends.createGooglePhotos` |  |
| `client.files.backends.connectHdfs` | `client.files.backends.createHdfs` |  |
| `client.files.backends.connectHidrive` | `client.files.backends.createHidrive` |  |
| `client.files.backends.connectHttp` | `client.files.backends.createHttp` |  |
| `client.files.backends.connectIclouddrive` | `client.files.backends.createIclouddrive` |  |
| `client.files.backends.connectImagekit` | `client.files.backends.createImagekit` |  |
| `client.files.backends.connectInternetarchive` | `client.files.backends.createInternetarchive` |  |
| `client.files.backends.connectJottacloud` | `client.files.backends.createJottacloud` |  |
| `client.files.backends.connectKoofr` | `client.files.backends.createKoofr` |  |
| `client.files.backends.connectLinkbox` | `client.files.backends.createLinkbox` |  |
| `client.files.backends.connectMailru` | `client.files.backends.createMailru` |  |
| `client.files.backends.connectMega` | `client.files.backends.createMega` |  |
| `client.files.backends.connectNetstorage` | `client.files.backends.createNetstorage` |  |
| `client.files.backends.connectOnedrive` | `client.files.backends.createOnedrive` |  |
| `client.files.backends.connectOpendrive` | `client.files.backends.createOpendrive` |  |
| `client.files.backends.connectOracleobjectstorage` | `client.files.backends.createOracleobjectstorage` |  |
| `client.files.backends.connectPcloud` | `client.files.backends.createPcloud` |  |
| `client.files.backends.connectPikpak` | `client.files.backends.createPikpak` |  |
| `client.files.backends.connectPixeldrain` | `client.files.backends.createPixeldrain` |  |
| `client.files.backends.connectPremiumizeme` | `client.files.backends.createPremiumizeme` |  |
| `client.files.backends.connectProtondrive` | `client.files.backends.createProtondrive` |  |
| `client.files.backends.connectPutio` | `client.files.backends.createPutio` |  |
| `client.files.backends.connectQingstor` | `client.files.backends.createQingstor` |  |
| `client.files.backends.connectQuatrix` | `client.files.backends.createQuatrix` |  |
| `client.files.backends.connectS3` | `client.files.backends.createS3` |  |
| `client.files.backends.connectSeafile` | `client.files.backends.createSeafile` |  |
| `client.files.backends.connectSftp` | `client.files.backends.createSftp` |  |
| `client.files.backends.connectSharefile` | `client.files.backends.createSharefile` |  |
| `client.files.backends.connectSia` | `client.files.backends.createSia` |  |
| `client.files.backends.connectSmb` | `client.files.backends.createSmb` |  |
| `client.files.backends.connectStorj` | removed | Removed: the files service no longer offers this backend. |
| `client.files.backends.connectSugarsync` | `client.files.backends.createSugarsync` |  |
| `client.files.backends.connectSwift` | `client.files.backends.createSwift` |  |
| `client.files.backends.connectUlozto` | `client.files.backends.createUlozto` |  |
| `client.files.backends.connectUptobox` | removed | Removed: the files service no longer offers this backend. |
| `client.files.backends.connectWebdav` | `client.files.backends.createWebdav` |  |
| `client.files.backends.connectYandex` | `client.files.backends.createYandex` |  |
| `client.files.backends.connectZoho` | `client.files.backends.createZoho` |  |
| `client.files.backends.disconnect` | `client.files.backends.delete` |  |
| `client.files.backends.getDetails` | `client.files.backends.get` |  |
| `client.files.backends.testConnection` | `client.files.backends.test` |  |
| `client.files.classifyFile() / client.notes.files.classifyFile()` | `client.files.classify() / client.notes.files.classify()` |  |
| `client.files.deleteRecursive` | removed | Use `client.files.delete`. |
| `client.files.directories.create` | removed | Use `client.files.mkdir`. |
| `client.files.downloads.cancelDownload` | `client.files.downloads.cancel` |  |
| `client.files.downloads.fetch` | `client.files.downloads.create` |  |
| `client.files.downloads.getHistory` | `client.files.downloads.listHistory` |  |
| `client.files.downloads.listActive` | `client.files.downloads.listByDirectory` |  |
| `client.files.downloads.listGlobal` | `client.files.downloads.list` |  |
| `client.files.extractions.cancelExtraction` | `client.files.extractions.cancel` |  |
| `client.files.ftp.access` | `client.files.ftp.get` |  |
| `client.files.getDirectoryZipUrl()` | `client.files.getZipUrl()` |  |
| `client.files.getFileUrl()` | `client.files.getUrl()` |  |
| `client.files.getMetadata` | `client.files.exists` |  |
| `client.files.getThumbnailUrl()` | `client.files.images.getThumbnailUrl()` |  |
| `client.files.health.check` | `client.files.kit.getHealth` |  |
| `client.files.images.process` | `client.files.images.convert` |  |
| `client.files.journal.query` | `client.files.journal.list` |  |
| `client.files.listDirectory` | `client.files.ui.getPage` |  |
| `client.files.listDirectory()` | `client.files.list(path)` |  |
| `client.files.listRootDirectory` | removed | Use `client.files.list(path)`, or `client.files.ui.getPage` for the HTML page. |
| `client.files.mounts.deliverPendingUpload` | `client.files.uploads.deliver` |  |
| `client.files.mounts.discardPendingUpload` | `client.files.uploads.delete` |  |
| `client.files.mounts.discardUnreadablePendingUpload` | `client.files.uploads.deleteUnreadable` |  |
| `client.files.mounts.downloadPendingUploadFile` | `client.files.uploads.download` |  |
| `client.files.mounts.getDetails` | `client.files.mounts.get` |  |
| `client.files.mounts.listPendingUploadFiles` | `client.files.uploads.listFiles` |  |
| `client.files.mounts.listPendingUploads` | `client.files.uploads.list` |  |
| `client.files.mounts.listUnreadablePendingUploads` | `client.files.uploads.listUnreadable` |  |
| `client.files.mounts.stopPendingUpload` | `client.files.uploads.stop` |  |
| `client.files.mounts.unmount` | `client.files.mounts.delete` |  |
| `client.files.operate` | `client.files.mkdir` or `client.files.archives.extract` or `client.files.downloads.create` | Split: choose the method that matches what you meant. |
| `client.files.patch` | `client.files.writeChunk` |  |
| `client.files.patchApi` | `client.files.update` |  |
| `client.files.put` | `client.files.upload` |  |
| `client.files.s3.access` | `client.files.s3.get` |  |
| `client.files.ssh.access` | `client.files.ssh.get` |  |
| `client.files.system.getApiVersion` | `client.files.kit.getVersion` |  |
| `client.files.upload` | removed | The name now belongs to the method that was `client.files.put`. |
| `client.files.webdav.access` | `client.files.webdav.get` |  |
| `client.files.webdav.copyResource` | `client.files.webdav.copy` |  |
| `client.files.webdav.lockResource` | `client.files.webdav.lock` |  |
| `client.files.webdav.moveResource` | `client.files.webdav.move` |  |
| `client.files.webdav.propfindResource` | `client.files.webdav.getProperties` |  |
| `client.files.webdav.proppatchResource` | `client.files.webdav.updateProperties` |  |
| `client.files.webdav.unlockResource` | `client.files.webdav.unlock` |  |

### `notes`

| Old | New | Note |
|---|---|---|
| `client.notes.collaborators.update` | `client.notes.collaborators.setRole` |  |
| `client.notes.comments.edit` | `client.notes.comments.update` |  |
| `client.notes.comments.reanchor` | `client.notes.comments.setAnchor` |  |
| `client.notes.databases.create` | `client.notes.records.create` |  |
| `client.notes.databases.delete` | `client.notes.records.delete` |  |
| `client.notes.databases.get` | `client.notes.records.get` |  |
| `client.notes.databases.list` | `client.notes.records.list` |  |
| `client.notes.databases.listAll` | `client.notes.records.listAll` |  |
| `client.notes.databases.listIterator` | `client.notes.records.listIterator` |  |
| `client.notes.databases.search` | `client.notes.records.search` |  |
| `client.notes.databases.update` | `client.notes.records.update` |  |
| `client.notes.documents.appendDocument` | `client.notes.document.append` |  |
| `client.notes.documents.createExportTicket` | `client.notes.document.createExportTicket` |  |
| `client.notes.documents.exportBlockSvg` | `client.notes.document.exportBlock` |  |
| `client.notes.documents.get` | `client.notes.document.get` |  |
| `client.notes.documents.patch` | `client.notes.document.update` |  |
| `client.notes.documents.put` | `client.notes.document.set` |  |
| `client.notes.files.cancelUpload()` | `client.notes.files.uploads.cancel()` |  |
| `client.notes.files.tusAbortUpload` | `client.notes.files.uploads.cancel` |  |
| `client.notes.files.tusCheckUpload` | `client.notes.files.uploads.getOffset` |  |
| `client.notes.files.tusCreateUpload` | `client.notes.files.uploads.create` |  |
| `client.notes.files.tusUploadChunk` | `client.notes.files.uploads.writeChunk` |  |
| `client.notes.files.uploadFile()` | `client.notes.files.upload()` |  |
| `client.notes.files.uploadOffset()` | `client.notes.files.uploads.getOffset()` |  |
| `client.notes.health.check` | `client.notes.kit.getHealth` |  |
| `client.notes.identity.get` | `client.notes.whoami` |  |
| `client.notes.interactions.markOpened` | `client.notes.nodes.markOpened` |  |
| `client.notes.interactions.markSeen` | `client.notes.nodes.markSeen` |  |
| `client.notes.nodes.getByAlias` | `client.notes.nodes.resolve` |  |
| `client.notes.notebooks.listNotebooks` | `client.notes.notebooks.list` |  |
| `client.notes.sockets.init` | `client.notes.sockets.create` |  |
| `client.notes.sockets.open` | `client.notes.sockets.connect` |  |
| `client.notes.users.invite` | `client.notes.members.invite` |  |
| `client.notes.users.updateRole` | `client.notes.members.setRole` |  |

### `notifications`

| Old | New | Note |
|---|---|---|
| `client.notifications.clearDismissed` | `client.notifications.restore` |  |
| `client.notifications.connectStream` | `client.notifications.connect` |  |
| `client.notifications.health.check` | `client.notifications.kit.getHealth` |  |
| `client.notifications.health.getMetrics` | `client.notifications.kit.getMetrics` |  |
| `client.notifications.notify.trigger` | `client.notifications.send` |  |

### `pipe`

| Old | New | Note |
|---|---|---|
| `client.pipe.corsPreflight` | removed | Removed: CORS preflight is browser plumbing, not an API call. |
| `client.pipe.headPipeStatus` | `client.pipe.getStatus` |  |
| `client.pipe.health.check` | `client.pipe.kit.getHealth` |  |
| `client.pipe.info.getHelp` | `client.pipe.kit.getCheatsheet` |  |
| `client.pipe.info.getMetrics` | `client.pipe.kit.getMetrics` |  |
| `client.pipe.ui.getIndex` | removed | Was `client.pipe.ui.getPage` until 1.0.0-beta.16. Build the page URL with `client.embeds.pipe.send()` and open or embed it. |
| `client.pipe.ui.getNoScript` | removed | Was `client.pipe.ui.getNoScriptPage` until 1.0.0-beta.16. Build the page URL with `client.embeds.pipe.noscript()` and open or embed it. |

### `proxyLogs`

| Old | New | Note |
|---|---|---|
| `client.proxyLogs.logs.getStats` | `client.proxyLogs.getStats` |  |
| `client.proxyLogs.logs.list` | `client.proxyLogs.list` |  |
| `client.proxyLogs.logs.listAll` | `client.proxyLogs.listAll` |  |
| `client.proxyLogs.logs.listIterator` | `client.proxyLogs.listIterator` |  |
| `client.proxyLogs.logs.streamLogs` | `client.proxyLogs.stream` |  |

### `run`

| Old | New | Note |
|---|---|---|
| `client.run.configuration.getConfig` | `client.run.kit.getConfig` |  |
| `client.run.jobs.cancelJob` | `client.run.jobs.cancel` |  |
| `client.run.jobs.createSearchJob` | `client.run.jobs.startSearch` |  |
| `client.run.jobs.getJobStatus` | `client.run.jobs.get` |  |
| `client.run.jobs.listJobs` | `client.run.jobs.list` |  |
| `client.run.preflightRun` | `client.run.test` |  |
| `client.run.profiles.createProfile` | `client.run.profiles.create` |  |
| `client.run.profiles.deleteProfile` | `client.run.profiles.delete` |  |
| `client.run.profiles.listProfiles` | `client.run.profiles.list` |  |
| `client.run.profiles.selectProfile` | `client.run.profiles.use` |  |
| `client.run.profiles.updateProfile` | `client.run.profiles.update` |  |
| `client.run.recipes.createRecipe` | `client.run.recipes.create` |  |
| `client.run.recipes.deleteRecipe` | `client.run.recipes.delete` |  |
| `client.run.recipes.getRecipe` | `client.run.recipes.get` |  |
| `client.run.recipes.listRecipes` | `client.run.recipes.list` |  |
| `client.run.recipes.runRecipe` | `client.run.recipes.resolve` |  |
| `client.run.recipes.searchRecipe` | `client.run.recipes.search` |  |
| `client.run.recipes.updateRecipe` | `client.run.recipes.update` |  |
| `client.run.resolveGet` | removed | Use `client.run.resolve`. |
| `client.run.runBatch` | `client.run.resolveMany` |  |
| `client.run.searchCandidates` | removed | Use `client.run.search`. |
| `client.run.searchCandidatesPaged` | `client.run.search` |  |
| `client.run.searchCandidatesPagedAll` | `client.run.searchAll` |  |
| `client.run.searchCandidatesPagedIterator` | `client.run.searchIterator` |  |
| `client.run.sources.createSource` | `client.run.sources.create` |  |
| `client.run.sources.deleteSource` | `client.run.sources.delete` |  |
| `client.run.sources.getSourceDiagnostics` | `client.run.sources.getDiagnostics` |  |
| `client.run.sources.listSources` | `client.run.sources.list` |  |
| `client.run.sources.syncAllSources` | `client.run.sources.syncAll` |  |
| `client.run.sources.syncSource` | `client.run.sources.sync` |  |
| `client.run.sources.updateSource` | `client.run.sources.update` |  |

### `sqlite`

| Old | New | Note |
|---|---|---|
| `client.sqlite.database.create` | `client.sqlite.databases.create` |  |
| `client.sqlite.database.deleteDatabase` | `client.sqlite.databases.delete` |  |
| `client.sqlite.database.executeTransaction` | `client.sqlite.sql.runTransaction` |  |
| `client.sqlite.database.listDatabases` | `client.sqlite.databases.list` |  |
| `client.sqlite.health.getHealth` | `client.sqlite.kit.getHealth` |  |
| `client.sqlite.health.getHealthCache` | `client.sqlite.kit.getCacheStats` |  |
| `client.sqlite.history.deleteEntry` | `client.sqlite.history.delete` |  |
| `client.sqlite.kvStore.batchDelete` | `client.sqlite.kv.deleteMany` |  |
| `client.sqlite.kvStore.batchGet` | `client.sqlite.kv.getMany` |  |
| `client.sqlite.kvStore.batchSet` | `client.sqlite.kv.setMany` |  |
| `client.sqlite.kvStore.compareSnapshots` | `client.sqlite.kv.table.compareSnapshots` |  |
| `client.sqlite.kvStore.decr` | `client.sqlite.kv.decrement` |  |
| `client.sqlite.kvStore.delete` | `client.sqlite.kv.delete` |  |
| `client.sqlite.kvStore.exists` | `client.sqlite.kv.exists` |  |
| `client.sqlite.kvStore.expireKvKey` | `client.sqlite.kv.setTtl` |  |
| `client.sqlite.kvStore.get` | `client.sqlite.kv.get` |  |
| `client.sqlite.kvStore.get/set/delete/exists/rollback/getSnapshot/read` | `client.sqlite.kv.<same>` |  |
| `client.sqlite.kvStore.getHistory` | `client.sqlite.kv.listHistory` |  |
| `client.sqlite.kvStore.getHistory / removeElement (object form)` | `client.sqlite.kv.listHistory / client.sqlite.kv.arrays.remove` |  |
| `client.sqlite.kvStore.getKvEntry` | `client.sqlite.kv.getEntry` |  |
| `client.sqlite.kvStore.getSnapshot` | `client.sqlite.kv.getSnapshot` |  |
| `client.sqlite.kvStore.getTableSnapshot` | `client.sqlite.kv.table.getSnapshot` |  |
| `client.sqlite.kvStore.incr` | `client.sqlite.kv.increment` |  |
| `client.sqlite.kvStore.incr / decr (object form)` | `client.sqlite.kv.increment / decrement` |  |
| `client.sqlite.kvStore.list` | `client.sqlite.kv.list` |  |
| `client.sqlite.kvStore.listAll` | `client.sqlite.kv.listAll` |  |
| `client.sqlite.kvStore.listIterator` | `client.sqlite.kv.listIterator` |  |
| `client.sqlite.kvStore.listKvChanges` | `client.sqlite.kv.listChanges` |  |
| `client.sqlite.kvStore.listKvChangesAll` | `client.sqlite.kv.listChangesAll` |  |
| `client.sqlite.kvStore.listKvChangesIterator` | `client.sqlite.kv.listChangesIterator` |  |
| `client.sqlite.kvStore.persistKvKey` | `client.sqlite.kv.clearTtl` |  |
| `client.sqlite.kvStore.pop` | `client.sqlite.kv.arrays.pop` |  |
| `client.sqlite.kvStore.push` | `client.sqlite.kv.arrays.push` |  |
| `client.sqlite.kvStore.removeElement` | `client.sqlite.kv.arrays.remove` |  |
| `client.sqlite.kvStore.rollback` | `client.sqlite.kv.rollback` |  |
| `client.sqlite.kvStore.rollbackTable` | `client.sqlite.kv.table.rollback` |  |
| `client.sqlite.kvStore.set` | `client.sqlite.kv.set` |  |
| `client.sqlite.kvStore.streamKvChanges` | `client.sqlite.kv.streamChanges` |  |
| `client.sqlite.query.execute({db, sql, params})` | `client.sqlite.sql.query({db, sql, params})` |  |
| `client.sqlite.query.executeShareable` | `client.sqlite.sql.queryReadOnly` |  |
| `client.sqlite.query.run({db, sql, params})` | `client.sqlite.sql.run({db, sql, params})` |  |
| `client.sqlite.sql.runMaintenance` | `client.sqlite.databases.runMaintenance` |  |

### `terminal`

| Old | New | Note |
|---|---|---|
| `client.terminal.abort` | `client.terminal.commands.cancel` |  |
| `client.terminal.execution.execute` | `client.terminal.commands.run` |  |
| `client.terminal.execution.getResult` | `client.terminal.commands.get` |  |
| `client.terminal.health.check` | `client.terminal.kit.getHealth` |  |
| `client.terminal.sessions.connectWebSocket` | `client.terminal.sessions.connect` |  |
| `client.terminal.sessions.getRawOutput` | `client.terminal.sessions.read` |  |
| `client.terminal.sessions.listHistory` | `client.terminal.commands.list` |  |
| `client.terminal.system.freezeProcess` | `client.terminal.processes.pause` |  |
| `client.terminal.system.getDaemonConfig` | `client.terminal.system.listDaemonPrograms` |  |
| `client.terminal.system.getDisplayInfo` | `client.terminal.system.listDisplays` |  |
| `client.terminal.system.getProcess` | `client.terminal.processes.get` |  |
| `client.terminal.system.getResources` | `client.terminal.system.getStats` |  |
| `client.terminal.system.listProcesses` | `client.terminal.processes.list` |  |
| `client.terminal.system.sendSignal` | `client.terminal.processes.signal` |  |
| `client.terminal.system.unfreezeProcess` | `client.terminal.processes.resume` |  |
| `client.terminal.terminalAutomation.findInTerminal` | `client.terminal.sessions.search` |  |
| `client.terminal.terminalAutomation.getAutomationMetrics` | `client.terminal.kit.getAutomationStats` |  |
| `client.terminal.terminalAutomation.getSessionAutomationState` | `client.terminal.sessions.getAutomationStatus` |  |
| `client.terminal.terminalAutomation.getTerminalSnapshot` | `client.terminal.sessions.getSnapshot` |  |
| `client.terminal.terminalAutomation.listSupportedKeys` | `client.terminal.keys.list` |  |
| `client.terminal.terminalAutomation.pasteTerminalText` | `client.terminal.sessions.paste` |  |
| `client.terminal.terminalAutomation.pressTerminalKeys` | `client.terminal.sessions.pressKeys` |  |
| `client.terminal.terminalAutomation.sendTerminalMouseEvents` | `client.terminal.sessions.sendMouseEvents` |  |
| `client.terminal.terminalAutomation.waitForTerminal` | `client.terminal.sessions.wait` |  |
| `client.terminal.terminalDragAndDrop.beginTerminalDrop` | `client.terminal.drops.create` |  |
| `client.terminal.terminalDragAndDrop.commitTerminalDrop` | `client.terminal.drops.finalize` |  |
| `client.terminal.terminalDragAndDrop.oneShotTerminalDrop` | `client.terminal.drops.send` |  |
| `client.terminal.terminalDragAndDrop.uploadTerminalDropSlice` | `client.terminal.drops.writeChunk` |  |
| `client.terminal.terminalState.postTerminalState` | `client.terminal.sessions.reportDiagnostics` |  |
| `client.terminal.web.get` | removed | Was `client.terminal.ui.getPage` until 1.0.0-beta.16. Build the page URL with `client.embeds.terminal.session()` and open or embed it. |
| `client.terminal.write` | `client.terminal.sessions.write` |  |

### `tunnel`

| Old | New | Note |
|---|---|---|
| `client.tunnel.getMetrics` | `client.tunnel.kit.getMetrics` |  |
| `client.tunnel.health.check` | `client.tunnel.kit.getHealth` |  |
| `client.tunnel.killSession` | `client.tunnel.sessions.close` |  |
| `client.tunnel.listBindings` | `client.tunnel.bindings.list` |  |
| `client.tunnel.listSessions` | `client.tunnel.sessions.list` |  |
| `client.tunnel.listTunnels` | `client.tunnel.list` |  |

### `watch`

| Old | New | Note |
|---|---|---|
| `client.watch.health.check` | `client.watch.kit.getHealth` |  |
| `client.watch.streams.listEvents` | `client.watch.events.list` |  |
| `client.watch.streams.listEventsAll` | `client.watch.events.listAll` |  |
| `client.watch.streams.listEventsIterator` | `client.watch.events.listIterator` |  |
| `client.watch.streams.streamSse` | `client.watch.events.stream` |  |
| `client.watch.streams.streamWs` | `client.watch.events.connect` |  |
| `client.watch.watchers.updateWatcher` | `client.watch.watchers.update` |  |

## Finding a name you cannot place

Search this file for the old name (`grep -n "<old>" docs/MIGRATION-2026-10-NAMES.md`). For a method that is not listed, the
name did not change. The generated references ([SDK](./reference/SDK-METHODS.md), [CLI](./reference/CLI-COMMANDS.md))
list every current name, and `hoody --help` / `hoody <group> --help` show the live command tree.

