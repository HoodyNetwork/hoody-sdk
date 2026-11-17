# Hoody CLI authentication

The CLI signs in to the Hoody API with a saved `hoody login`, an access key, a user name and password, or a profile in the config file. When more than one is set, the order in [Precedence](#precedence) decides.

## `hoody login`

`hoody login` asks how you want to sign in, then saves the sign-in to the config file. Later commands use it with no flag.

```bash
hoody login            # pick a method, then answer the prompts
hoody login --web      # sign in in your browser
hoody signup           # create an account
```

Passwords are hidden as you type. Signup asks for the password twice. When your account has two-factor authentication, `hoody login` asks for the code.

`hoody login --web` uses the device flow. You sign in in the browser with GitHub, Google or a session you already have, and you type no password in the terminal. `--no-browser` prints the address instead of opening it.

For scripts:

```bash
hoody login --email you@example.com --password-stdin < password.txt
hoody login --token hdy_…                # an access key, all realms
hoody login --token hdy_… --realm <id>   # an access key, one realm
```

`--realm` takes a 24-hex realm ID, or `global` for all realms. Leaving it out also means all realms.

`--print-token` prints only the access token after the sign-in. `--no-save` signs in without writing the config file.

## Access key

Pass an access key with any command:

```bash
hoody --token <TOKEN> servers list
```

Or set it in the environment:

```bash
export HOODY_TOKEN=<TOKEN>
hoody servers list
```

`HOODY_API_TOKEN` is read too. A key given this way overrides the saved sign-in.

## User name and password

With a user name and password, the CLI signs in for you before the command runs, using `/api/v1/users/auth/login`:

```bash
hoody --username alice --password s3cret servers list
```

Or with environment variables:

```bash
export HOODY_USERNAME=alice
export HOODY_PASSWORD=s3cret
hoody servers list
```

This automatic sign-in cannot answer a two-factor challenge. On an account with two-factor authentication, use `hoody login` or an access key.

## `hoody logout`

`hoody logout` removes the saved sign-in from the config file: the token and, when one is saved, the password. The user name stays. The session itself is not ended on the API. The command does send requests to the API for one thing: it revokes the agent sign-in keys the terminal Hub made for the account, and says so when it cannot. `--all` ends every session of the account.

```bash
hoody logout                   # sign out of this device
hoody logout --all             # also end every session of the account, on every device
hoody --profile work logout    # sign out of one profile
```

`--no-save` signs out the running process only, leaves the config file as it is and revokes no key.

An access key in `HOODY_TOKEN` or `HOODY_API_TOKEN` is not part of the saved sign-in. While one is set, later commands still send it, and `hoody login` and `hoody logout` say so. Run `unset HOODY_TOKEN HOODY_API_TOKEN` to use the saved sign-in, or to sign out completely.

## Session token

`hoody auth accesstoken get` prints the access token of the current session. It never signs in.

```bash
export HOODY_TOKEN=$(hoody auth accesstoken get)   # hand the session token to curl or a script
hoody auth accesstoken get -o json                 # the token with its expiry
```

A saved token that has expired, or expires within a minute, is renewed first, and the new one is saved. A token given with `--token` or in the environment is printed as given. With no sign-in, the command exits 1 and says to run `hoody login`.

## Config file

The CLI reads `~/.hoody/config.json`. Use `--config <path>` for another file.

```json
{
  "profiles": {
    "default": {
      "token": "<TOKEN>",
      "baseUrl": "https://api.hoody.com"
    },
    "work": {
      "username": "alice",
      "password": "s3cret",
      "baseUrl": "https://custom.example.com"
    }
  }
}
```

Choose a profile with `--profile` or `HOODY_PROFILE`:

```bash
hoody --profile work servers list
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `HOODY_TOKEN` / `HOODY_API_TOKEN` | Access key, sent as a bearer token |
| `HOODY_USERNAME` | User name for the automatic sign-in |
| `HOODY_PASSWORD` | Password for the automatic sign-in |
| `HOODY_BASE_URL` / `HOODY_API_URL` | API base URL |
| `HOODY_COMPUTER` / `HOODY_COMPUTER_ID` | Default computer ID |
| `HOODY_REALM` / `HOODY_REALM_ID` | Realm ID for realm-scoped API requests |
| `HOODY_PROFILE` | Config file profile name |
| `HOODY_KIT_AUTH` | How the CLI signs in to kit services: `jwt`, `password` or `token` |
| `HOODY_KIT_USER` | Kit user name |
| `HOODY_KIT_TOKEN` | Kit token or JWT |
| `HOODY_KIT_PASSWORD` | Kit password for `--kit-auth password` (Basic auth) |
| `HOODY_KIT_TOKEN_HEADER` | Header that carries the kit token (default: `Authorization`) |
| `ALL_PROXY` / `HTTPS_PROXY` / `HTTP_PROXY` | Proxy URL (the lowercase names work too) |

`hoody chat` and the AI typo corrector have their own variables, below.

## Precedence

```
CLI flags  >  Environment variables  >  Config file (~/.hoody/config.json)
```

A flag you do not pass overrides nothing.

## Config commands

The `config` command group manages the config file:

```bash
hoody config path get          # Print config file path
hoody config get               # Show config (secrets masked)
hoody config get --resolved    # Show merged config (file + env vars)
hoody config validate          # Validate config and report issues
hoody config reset --yes       # Reset config to defaults
hoody config set <key> <value> # Set a config value
hoody config get <key>         # Get a config value
hoody config clear <key>       # Remove a config key
```

Profile-scoped operations:

```bash
hoody config set --for-profile work baseUrl https://custom.example.com
hoody config get --for-profile work baseUrl
```

`hoody config set token <value>` puts the token on the command line, where your shell history may keep it. For secrets, use an environment variable (`HOODY_TOKEN`, `HOODY_PASSWORD`) or edit the config file.

## `hoody chat`

`hoody chat` needs no key and no account. It sends your question to Hoody's documentation assistant on the platform your CLI is set up for, and prints the answer.

To send questions to another address, set `HOODY_CHAT_URL`. An address that is not your platform's assistant and not local (localhost or a private network address) must be accepted first: pass `--accept-endpoint <origin>`, set `HOODY_CHAT_ACCEPT_ENDPOINT`, or answer the prompt in a terminal. Accepted origins are saved in `~/.hoody/chats/chat-accept.json`, except in private mode.

The [chat guide](../docs/reference/guides/chat.md) lists every flag and environment variable. [Chat privacy](../docs/reference/guides/chat-privacy.md) says what is sent and what is kept.

## AI typo corrector

Off unless you turn it on. It helps with an unknown command word or an unknown
option, and only on an interactive terminal: a pipe, CI, agent mode,
`--non-interactive` and `-o json|yaml|ndjson|raw` get the plain error and exit code.
`suggest` prints the corrected command; `auto` runs it: your own command line
with only the mistyped command word or option name replaced, and only when the
replacement is a typo of what you typed. Your options, values and arguments stay as
typed. Anything else is printed, not run. The exit code is the one of the command
that ran.

What is sent to the provider: the shape of the command line (command words and
option names, every value and argument replaced by a placeholder, anything after
`--` left out; a word the CLI does not know only when it is close to one of its
commands), the error, and the help of each command level.

```bash
export HOODY_CLI_AI_FIX=suggest              # auto | suggest | off (default: off)
export HOODY_CLI_AI_MAX_TOKENS=2048          # output + reasoning cap (max 16000)
export HOODY_CLI_AI_REASONING_EFFORT=low     # minimal|low|medium|high; unset by default
```

Inside a Hoody computer the corrector is set up for you: the mode is `auto` and
the provider is the Hoody AI gateway, with the computer's own settings. Anywhere
else that gateway cannot be reached, so name an OpenAI-compatible provider of
your own:

```bash
export HOODY_CLI_AI_URL=https://…/v1    # base URL (default: the Hoody AI gateway of your platform)
export HOODY_CLI_AI_KEY=…
export HOODY_CLI_AI_MODEL=…             # default: hoody-ai/hoody-free
```

Without them the corrector says the gateway cannot be reached (within about
3 seconds when no proxy is configured).

A suggestion is shown or run only when the command tree resolves it: every
command word names a real command and a suggested option is one the command
declares. Otherwise you get the plain error and "no suggestion available".
