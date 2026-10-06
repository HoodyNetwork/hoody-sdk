> _**HTTP skill · `bot` namespace** · ~4,591 tokens · hoody-sdk v1.0.0-beta.15_

# `bot` — chat-app control of a container, Telegram first

## Purpose

This namespace puts the command surface the SDK publishes under chat control. An operator registers a channel bot against one container, starts its long-poll loop, and from then on a chat user who logs in through that bot runs those commands from the chat app. The kit adds no identity of its own: a chat user logs in as themselves, and every command runs with that user's own credential (the token their login minted, or an existing token they pasted), inside a risk gate that decides per command whether it needs a tapped or a typed confirmation first.

Two surfaces share the name. The seventeen operations documented here are the operator's side, and every one of them answers on the container's own bot kit URL. The chat side is not an API: it is the published command list a chat user reaches by typing a slash command, tapping a menu entry, or opening a webview.

Telegram is the channel `POST /api/v1/bot/registrations` accepts today. The channel layer is written to take others, so treat the vocabulary as chat-app neutral and the current enum as the one implemented channel.

## When to use

- Register a channel bot against a container, then start or stop its poll loop.
- Bound who the bot answers: mode plus the user and chat allowlists, read and written as one policy document.
- Publish the command lists and the bot profile to the channel, and read back what the channel actually stored.
- Audit what chat users did, and cut one user off or revoke every lineage the registration minted.
- Operate the stored credentials: rotate the kit key, or read the chat manifest this build is pinned to.

## When NOT to use

- To ask a question about Hoody at a terminal → `hoody chat` is a documentation assistant with its own provider auth. It shares nothing with this namespace.
- To drive the AI agent from code → see `agent`. The bot hands a chat user the agent; it is not the agent's API.
- To push a one-way message at a person → see `notifications`.
- To run one command from a script or a cron job → call the namespace that owns it. Routing it through a chat app adds an audit row and, for any command whose risk calls for one, a confirmation step, and nothing else.

## Prerequisites

- A container running the bot kit. The binary refuses to start outside a Hoody container, so a local process is never the thing you are talking to.
- A channel bot token issued by the chat platform. It is sent once in the `POST /api/v1/bot/registrations` body over HTTPS, validated against the channel before anything is stored, encrypted at rest, and never returned by any later read.
- No credential for the management routes. The kit checks no bearer token and no container ownership: an `Authorization` header is ignored, not refused, and whoever the proxy lets reach the bot URL can register, start, stop and delete bots. The container's proxy permission rules are the access control, so set one before exposing the URL.
- Nothing for `GET /api/v1/bot/health` either. It answers nine fields.

## Capability URL

`https://{projectId}-{containerId}-bot-{n}.{node}.containers.hoody.com` → see `SKILL-HTTP.md § Proxy URLs` for the full methodology. As with most kits, the kit itself authenticates no caller: what the proxy admits to this URL can use every management operation, and management operations address every registration stored on this kit.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Register a bot and bring it up

Create the bot in the chat app first and keep its token. `POST /api/v1/bot/registrations` takes the channel name, that token, and an optional label; it verifies the token with the channel, stores it sealed, and answers with a registration id. `POST /api/v1/bot/registrations/{registrationId}/start` records the intent to poll and starts the worker: 200 means a poller is running, while 202 means the intent was stored but this build wired no poller, so nothing is polling (the answer is marked `polling: "unavailable"` and health reports `polling.active: 0`). Check which one you got before relying on the bot. `POST /api/v1/bot/registrations/{registrationId}/stop` ends polling. `GET /api/v1/bot/registrations` and `GET /api/v1/bot/registrations/{registrationId}` report what exists and each registration's stored `state` (the running or stopped intent, not proof of a worker); health's `polling.active` is the count of pollers actually running.

### 2. Decide who the bot serves

`PUT /api/v1/bot/registrations/{registrationId}/policy` writes the mode and the two allowlists; `GET /api/v1/bot/registrations/{registrationId}/policy` reads them back as the gate enforces them. Read the null cases carefully, because they are not symmetrical: a null user list admits every user, while a null chat list means direct messages only, so a group is served only once the chat list names it. An empty array is an allowlist that admits nobody. A non-empty chat list is exhaustive and covers direct messages too, whose chat id is the user's own id.

### 3. Publish the command list and the profile

`POST /api/v1/bot/registrations/{registrationId}/commands/sync` runs the one publication reconciliation and answers with what changed, not with the stored contents: the scope keys it wrote, left unchanged and deleted, the entries it trimmed or rejected, and whether the menu button and the stored profile were republished (`menu_button_changed`, `profile_changed`). It is idempotent, so a second run reports no change. `PUT /api/v1/bot/registrations/{registrationId}/profile` sets the bot's name, its two descriptions, the language tag they belong to, and the default administrator rights, then publishes them the same way.

### 4. Audit, then cut someone off

`GET /api/v1/bot/registrations/{registrationId}/logs` pages the redacted per-actor log newest first; the cursor is the previous page's `next_before_id`, and the actor filter matches the stored `actor` value exactly, which carries the channel prefix: for Telegram `telegram:<user id>`, not the bare id. `POST /api/v1/bot/registrations/{registrationId}/sessions/{channelUserId}/revoke` logs one chat user out: it clears their stored login and sessions and tries to delete the working token minted for them. It does not remove everything that user holds, so read the answer: `leaf_deleted` says whether the working token went, and `manual_deletes` lists the token ids the kit cannot remove itself (the parent token of a minted login, a pasted token, and a working token whose deletion failed), which must be deleted through the account's token management (see `api`). It takes the channel's own user id WITHOUT the prefix, so strip `telegram:` from an actor value copied out of the audit log (and add it back to filter the log by a user id). `POST /api/v1/bot/registrations/{registrationId}/tokens/revoke-all` does the same for every chat user of the registration, listing the users whose teardown failed in `failed` and every leftover token id in `manual_deletes`. `DELETE /api/v1/bot/registrations/{registrationId}/logs` deletes the entries at or below a cutoff: `older_than` is an absolute epoch-millisecond timestamp, not an age, and defaults to the 90-day retention boundary. With `all=true` and no `older_than` the cutoff is the current time, so the registration's whole audit log is deleted.

### 5. Rotate the kit key

`POST /api/v1/bot/kit/keys/rotate` re-encrypts every sealed column under a new key. The new key is published beside the old one, the re-encryption and the generation marker commit together, and only then is the new key promoted, so an interrupted rotation is finished or rolled back at the next start instead of losing every stored credential.

### 6. Confirm what the build is pinned to

`GET /api/v1/bot/manifest` serves the chat manifest this build was packaged against, and `GET /api/v1/bot/health` reports its hash among the nine fields. The CLI's own verify flag recomputes the digest from the served bytes and compares it with both the pin baked into the CLI and the hash health reports.

## Quirks & gotchas

- The operation commands a chat user can send come from the published command manifest, which mirrors the CLI, so an operation that does not exist in the CLI cannot be typed in chat either. Chat adds its own built-ins on top: menu, search, recent, call, help, plain, and the subscription commands.
- Confirmation is a property of the command, not of the user. Each manifest command carries a risk class and its own confirmation requirement, and the gate takes the stronger of the two; anything that runs a script, a shell, SQL, or an outbound call is typed-confirmation at minimum regardless of class. A confirmation is bound to the arguments it was shown for.
- Voice turns refuse the destructive end of the table outright, because a typed confirmation cannot be collected from a voice note. A voice turn is refused when either the command's own flag or its risk class's rule says so.
- The kit holds no token of its own; every working token belongs to a chat user. A login typed into the chat form lives for at most two minutes, while a token a user pastes is kept, encrypted, and used for that user's later commands. The bot tries to delete each chat message that carried a credential, and when the channel refuses the delete it tells the user to delete it themselves. Deleting a registration therefore does not revoke what its users still hold; that is what the revoke operations are for.
- The channel token is write-only. Registration posts it once, the kit validates it with the channel before storing it, encrypts it, and no read ever returns it. A registration whose token was rotated in the chat app has to be deleted and registered again with the new token: registering the same bot while the old registration exists is refused `409 registration_duplicate` (and deleting a registration does not revoke the credentials its users hold).
- Health is unauthenticated by design and reports exactly nine fields. `open_by_default` stays null until the self-probe resolves and is never reported as safe by default, so treat null as unknown rather than as protected.
- The port refuses private, loopback, link-local and CGNAT peers, so a curl from inside the same container or a sibling on the same bridge fails where a request arriving through the proxy succeeds.
- Bare `/health` is 404. The management API and health live under the versioned prefix; the only route outside it is the management UI page at the root.
- Errors do not use the account-plane envelope. Management refusals answer `{ error: { code, message } }` with an enumerated code, and the message never carries a credential or an upstream error string, though a validation message may name a query parameter or body field you sent. An unknown path (404) or method (405) answers a bare string instead, `{ error: "not_found" }` or `{ error: "method_not_allowed" }`.
- A repeated query parameter is refused rather than resolved on every management route. Sending the same control twice makes the request say two things at once, and no handler answers it. The manifest route (which parses no query string) and the unauthenticated health route are outside that rule.

## Common errors

- `channel_token_rejected` and `channel_unavailable` — the two register-time channel failures: the channel said no, or it could not be asked. Neither carries the token or the channel's own error text.
- `channel_sync_failed` — publishing to the channel failed, on either the command sync or the profile set: the channel refused it (nothing was published), the call threw an unclassified error, or the channel accepted it but the readback disagrees. It does NOT mean the change landed; read the response message to tell the cases apart.
- `keys_rotate_refused` — a poller is alive and force was not set (stop the registration or repeat with the flag), or an earlier rotation left a key generation that no key on disk opens, which must be restored first. `keys_rotate_failed` does not always mean nothing changed: read its message, because it is also answered after the re-encryption committed (the next start finishes the rotation) or after the new key was already promoted (the rotation stands). Do not retry a rotation without reading it.
- `logs_purge_refused` — the cutoff falls inside the 90-day retention window and the waiver was not passed. The request is refused rather than quietly clamped to the boundary.
- `session_not_found` — the registration exists, but that chat user is unknown to it. Take the user from the audit log's actor column rather than guessing it, and drop its channel prefix (`telegram:<user id>` becomes `<user id>`): a prefixed value is not accepted here.
- `invalid_policy`, `invalid_profile`, `invalid_query` — the mode was not one of the two, an allowlist was not an array of channel ids, a profile field was unknown, of the wrong type, or too long for the channel (a field you leave out keeps its stored value; a missing body is `invalid_body`), or a query value was not the number or flag it must be.
- `manifest_unavailable` — 503 from the manifest route: no manifest is baked into this build, the baked one was refused at boot, or redaction would alter the verified bytes. The kit serves the verified document or nothing.

## Related namespaces

- `agent` — what a chat user most often drives through the bot: streaming prompts, approvals as buttons, one-tap webviews into the agent UI.
- `api` — mints the account tokens a chat user's login creates, and owns the account token management where the token ids a revoke reports in `manual_deletes` are deleted.
- `notifications` — one-way delivery to a person, with no command surface and no confirmation step.
- `daemon` — whether the bot program is registered and running on the container at all.

## Reference

### `kit` (3) — system

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/bot/health` | Nine-field kit health; unauthenticated by design. |  |
| `GET /api/v1/bot/manifest` | The chat manifest this build is pinned to, as it was baked. |  |
| `POST /api/v1/bot/kit/keys/rotate` | Re-encrypt every sealed column under a new kit key. | `?force` |

**Param notes:**

- `force` — Rotate even though a poller is running. Without it an active poller refuses the rotation.

### `registrations` (14) — registrations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/bot/registrations` | Register a channel bot; the token arrives in the body and is stored encrypted. | `body*:bot_RegisterRequest` |
| `DELETE /api/v1/bot/registrations/{registrationId}` | Delete a registration and its stored channel token. |  |
| `GET /api/v1/bot/registrations/{registrationId}` | Read one registration. |  |
| `GET /api/v1/bot/registrations/{registrationId}/policy` | Read a registration’s mode and allowlists. |  |
| `GET /api/v1/bot/registrations` | List the registrations owned by the calling account. |  |
| `GET /api/v1/bot/registrations/{registrationId}/logs` | Read the redacted audit log of a registration, newest first. | `?actor` `?since` `?limit` `?before_id` |
| `DELETE /api/v1/bot/registrations/{registrationId}/logs` | Delete audit rows older than a cutoff, never inside the retention window. | `?older_than` `?all` |
| `POST /api/v1/bot/registrations/{registrationId}/tokens/revoke-all` | Revoke every chat user’s lineage for this registration. |  |
| `POST /api/v1/bot/registrations/{registrationId}/sessions/{channelUserId}/revoke` | Revoke one chat user’s login: delete the leaf through the parent and forget it. |  |
| `POST /api/v1/bot/registrations/{registrationId}/start` | Start long-polling for a registration. |  |
| `POST /api/v1/bot/registrations/{registrationId}/stop` | Stop long-polling for a registration. |  |
| `POST /api/v1/bot/registrations/{registrationId}/commands/sync` | Publish the registered commands to the channel and return the readback diff. |  |
| `PUT /api/v1/bot/registrations/{registrationId}/policy` | Set a registration’s mode and allowlists. | `body*:bot_RegistrationPolicyRequest` |
| `PUT /api/v1/bot/registrations/{registrationId}/profile` | Set the bot profile (name, descriptions, default admin rights) and publish it. | `body*:bot_BotProfileRequest` |

**Param notes:**

- `actor` — Narrow the page to one chat user. Matched exactly against the stored `actor` value, which carries the channel prefix — for Telegram `telegram:<user id>`, not the bare id the revoke path takes.
- `since` — Drop entries older than this epoch-millisecond timestamp. A filter on the page, not a cursor: paging continues past it.
- `limit` — Page size; capped by the store at 500. The answer reports the size actually used.
- `before_id` — The cursor: the `next_before_id` of the previous page. Omit for the newest page.
- `older_than` — Delete entries at or below this epoch-millisecond timestamp. Defaults to the 90-day retention boundary.
- `all` — Waive the 90-day retention floor. Without it a cutoff inside the retention window is refused, never clamped.
- `channelUserId` — The channel's own id for the chat user (the Telegram user id), without a channel prefix. The audit log's `actor` column spells the same user differently — `telegram:<user id>` — so a value copied from there is not accepted here.


### Body schemas

- `bot_RegisterRequest` — `{ channel*: "telegram", token*: string, label: string|null }`
- `bot_RegistrationPolicyRequest` — `{ mode*: "single" | "multi", allowlists: { users: string[]|null, chats: string[]|null }|null }`
  - An absent allowlist key leaves the stored list alone; an explicit null takes it out of force; an empty array admits nobody. `mode` is required.
- `bot_BotProfileRequest` — `{ name: string|null, description: string|null, short_description: string|null, language_code: string|null, administrator_rights: { groups: object|null, channels: object|null }|null }`
