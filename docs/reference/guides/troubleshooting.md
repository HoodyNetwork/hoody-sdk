# Troubleshooting

This page lists messages that the `hoody` CLI and the SDK print most often, what each one means, and what to do. The Hub has its own list in the [Hub guide](./hub.md#troubleshooting).

## Sign-in

| You see | What it means | What to do |
|---|---|---|
| `Not authenticated` or `Not signed in` | The CLI has no saved sign-in and no access key in its environment. | Run `hoody login`, or set `HOODY_TOKEN`. |
| `2FA is enabled on this account. Auto-login cannot complete the 2FA challenge.` | You gave a user name and password (`--username` and `--password`, or `HOODY_USERNAME` and `HOODY_PASSWORD`) for an account with two-factor authentication. That automatic sign-in cannot ask for the code. | Run `hoody login`, which asks for the code, or use an access key (`--token` or `HOODY_TOKEN`). |

[CLI authentication](../../../cli/CLI_AUTHENTICATION.md) covers every way to sign in.

## Node.js, npm and proxies

| You see | What it means | What to do |
|---|---|---|
| `A proxy is configured (...), but ... The request was not sent.` (code `PROXY_UNSUPPORTED`) | A proxy is set (`--proxy`, `ALL_PROXY`, `HTTPS_PROXY`, `HTTP_PROXY` or the config file), and this Node.js is older than 22.19, which cannot send through it. | Use Node.js 22.19 or later, or the standalone `hoody` binary, or unset the proxy. `NO_PROXY=<host>` skips the proxy for one host. |
| An npm engine warning for `undici` during install | On Node.js 20.19 to 22.18 the SDK does not load `undici`, so the warning changes nothing. | Nothing, or move to Node.js 22.19 or later. With `engine-strict=true`, npm refuses the install below 22.19. |

The [SDK guide](./sdk.md#install-and-runtimes) explains what changes below Node.js 22.19.

## `hoody chat`

| You see | What it means | What to do |
|---|---|---|
| `Endpoint not accepted: ...` (exit code 2) | `HOODY_CHAT_URL` points at an origin you have not accepted. | Run again with `--accept-endpoint <origin>`, or set `HOODY_CHAT_ACCEPT_ENDPOINT=<origin>`. In a terminal, `hoody chat` asks you instead. |
| `Rate limit reached. Try again in ~N minute(s).` | The CLI sends at most 30 questions an hour (`HOODY_CHAT_RATE_LIMIT`), the same limit the service applies to each address. | Wait for the time it names. |

The [chat guide](./chat.md) lists every flag, limit and exit code.

## Opening kits

| You see | What it means | What to do |
|---|---|---|
| `Unknown service: <name>` from `hoody open` | The name is not a kit. | `hoody kits list` shows the kit names. For a port inside the computer, use `http-<port>` or `https-<port>`. |
