# SDK guide

This guide covers the `hoody-sdk` TypeScript SDK area by area. The [README](../../../README.md) explains what Hoody is and has the quick start; the [namespace pages](../namespaces/_INDEX.md) list every method. The examples assume the quick start's names: `hoody` is the account client, `box = await hoody.withComputer(computer)` the computer client, and `computer` the computer it serves.

## Install and runtimes

```bash
npm install hoody-sdk
# or
bun add hoody-sdk
```

The package is ESM only.

- **Node.js** 20.19 or later; 22.19 or later is recommended. Node.js 20 is end-of-life, and releases before 22.19 have the limits in the next point. Bun works too.
- Before Node.js 22.19 the SDK sends HTTP requests through Node's built-in `fetch`, which stops waiting after 300 seconds for response headers. On Node.js 20.19 to 22.18 npm prints an engine warning for `undici`, which the SDK does not load there; installs with `engine-strict=true` need Node.js 22.19 or later. On those releases the `hoody` CLI refuses a configured proxy (`PROXY_UNSUPPORTED`) instead of ignoring it; the standalone CLI binary has no such limit.
- On Node.js releases whose built-in WebSocket is affected by CVE-2026-12151 (before 22.23.0, all of 23 and 25, 24 before 24.17.0, 26 before 26.3.1) the SDK opens its WebSockets with the `ws` package instead. A `webSocketFactory` or socket.io transport you supply, and a global `WebSocket` your application replaces, are yours to keep current.
- **Browser.** The IIFE build exposes `window.HoodySDK`; the ESM build is imported directly:

  ```html
  <script src="https://cdn.jsdelivr.net/npm/hoody-sdk@1.0.1/dist/hoody-sdk.browser.min.js"></script>
  <script type="module">
    import { HoodyClient } from 'https://cdn.jsdelivr.net/npm/hoody-sdk@1.0.1/dist/hoody-sdk.browser.esm.js';
  </script>
  ```

  Generated methods and `box.terminal.run` work in every runtime. Hand-written helpers that need Node built-ins (`agent.importLocalConfig`, `importLocalConfigs` and `listLocalConfigTools`, the screenshot-to-disk helper, `box.shell()`, and the `tunnel*` and `mount` helpers) are left out of the browser build, where calling one throws a `TypeError`.

## Clients, scopes and conventions

The SDK has two scopes:

- **Account** (`hoody.api.*`): computers, projects, servers, realms, tokens, proxy permissions, billing and the rest of the account. Needs a sign-in or a token.
- **Computer** (`box.terminal.*`, `box.files.*`, `box.agent.*`, ...): the Kit services of one computer, reached through the proxy on its server. `hoody.withComputer(computerOrId)` returns this client.

```typescript
const hoody = await HoodyClient.login('https://api.hoody.com', { email, password });
const first = (await hoody.api.computers.list()).data?.computers?.[0];
if (!first?.id || !first.project_id) throw new Error('No computers yet');
const computer = { ...first, id: first.id, project_id: first.project_id };
const box = await hoody.withComputer(computer);
```

- `withComputer()` takes a computer object or an ID. An object with its `id`, `project_id` and server routes without a request; an ID is looked up through the account API.
- Open computers need no Kit credential. For a gated one, pass `kitAuth` in `withComputer()`'s options, and `onKitAuthExpired` to refresh it and replay the request once on a 401. When the permission rule reads its token from a query parameter, name it: `{ type: 'token', value, param: 'access_token' }` sends the token in the URL, on WebSocket upgrades too, which is the only way a browser socket can carry one.
- `getKitUrl(service, computer, index?)` builds a service URL; `getKitUrl('http', computer, { port: 8080 })` builds `http-8080`. `egress` drops the index suffix at index 1 and keeps a higher one, which selects a permission scope on the same process.
- A client whose `baseURL` is the account API refuses Kit calls until you `withComputer()`, instead of sending them to the API host. A client treats `baseURL` as the account API when it is a Hoody API host or a realm host under it, when you pass `credentials`, or when you pass no `baseURL`; any other host is used as a Kit reached directly. Set `target: 'account'` or `target: 'kit'` when the host does not tell.

Conventions every method follows:

- **Response envelope.** A request method resolves to a typed `{ statusCode, message, data }`; the payload is `response.data`, and any other top-level field the operation documents (`propagation`, `pagination`, `total`) sits beside it. Streaming, WebSocket and iterator helpers return their own types. `rawResponse: true` skips the envelope and returns the parsed body, which you cast.
- **Options object.** Most methods take a trailing options bag that mixes query parameters with per-request overrides (`retries`, `timeoutMs`, `responseType`, `signal`, ...).
- **Pagination.** A list that pages has three forms: `list()` (one page), `listAll()` (every page) and `listIterator()` (an async iterator). They follow the page, offset or cursor parameter the operation takes, starting from the one you pass. A walk that stops advancing throws instead of returning a partial list, and so does one that needs more than 1000 requests.
  - A page or offset walk is a new query per page, so rows deleted or added meanwhile can be skipped or repeated. Where an operation takes a stable position, walk with that: `afterId` or a fixed `untilMs` on `proxyLogs.list`, `after_id` on `watch.events.list`, `after` on `sqlite.kv.list`, `cursor` on `notifications.list`.
  - `notifications.list` with none of `since`, `after_id` or `cursor` returns the newest page only; `since: 0` walks the whole history.
- **64-bit integers.** `box.sqlite` returns an integer above 2^53 - 1 as a `bigint`, and a `bigint` you pass is sent as a plain integer.

A few calls on the `box` above:

```typescript
const hostname = await box.files.readText('/etc/hostname');              // the string itself
const shot = await box.browser.page.captureScreenshot({ browser_id: '1' });
await box.cron.entries.create('user', { schedule: '0 * * * *', command: 'backup.sh' });
const rows = await box.sqlite.sql.queryReadOnly({ db: 'app', sql: 'select count(*) from users' });
```

## Sign-in, sessions and two-factor

The login endpoint has separate `email` and `username` fields. A username matches `^[a-zA-Z0-9_-]+$`, so an email address signs in only through `email`.

```typescript
// One call: sign in and get a ready client. Credentials are kept in memory for re-login on expiry.
const hoody = await HoodyClient.login('https://api.hoody.com', { email, password });

// Lazy: sign in on the first request
const lazy = new HoodyClient({ baseURL: 'https://api.hoody.com', credentials: { username: 'alice', password } });

// Explicit: call the endpoint and adopt the token
const client = new HoodyClient({ baseURL: 'https://api.hoody.com' });
const { data: auth } = await client.api.auth.login({ email, password });
if (!auth || !('token' in auth)) throw new Error('Second factor required');
client.setToken(auth.token);

// Sign up (region is optional and chosen by GeoIP when omitted)
await client.api.auth.signup({ email: 'you@example.com', password, region: 'eu-west' });
```

- **Two-factor accounts.** `api.auth.login` resolves with a `temp_token` and no access token; `await hoody.completeTwoFactorLogin(temp_token, code)` verifies the code and adopts the session. `HoodyClient.login()` rejects with a `TwoFactorRequiredError` instead, and `await err.complete(code)` resolves to the signed-in client.
- **Token-only clients.** Pass `token:` with an `onTokenExpired` callback (see [Errors, retries, middleware and token refresh](#errors-retries-middleware-and-token-refresh)). `hoody login --print-token` signs in and prints the access token.
- **Sessions.** A client and every client derived from it with `withComputer()` or `withRealm()` share one session. `setToken(token)` changes one client, which leaves the shared session; `setSessionToken(token)` changes them all. `adoptSession(tokens)` adopts tokens issued outside `login()`, such as the result of `api.auth.twoFactor.verify()` or `api.auth.oauth.exchange()`. `logout()` drops this session's tokens, credentials and `kitAuth` without a request; the dropped access token stays valid on the server until it expires. `logoutAll()` signs the account out everywhere and then clears this session.
- **`onSession`** in the client config is called each time the SDK obtains a token pair (`reason` is `'login'`, `'refresh'` or `'relogin'`). A refresh spends the previous refresh token, so a long-running service saves each new pair and starts its next run with `adoptSession()`. The callback is not awaited and what it throws is discarded.
- **Browser tokens.** A token in page storage is a bearer credential. Never put account credentials or an account-wide token in a static page; give browser apps a short-lived, realm-scoped token minted by your own backend.

## Create, copy and delete computers

```typescript
const servers = (await hoody.api.servers.list()).data ?? [];
const active = servers.find((s) => s.status === 'active' && s.server_id);
if (!active) throw new Error('No active server yet: a free-tier server can take a moment to provision');

const project = await hoody.api.projects.create({ alias: 'my-first-project' });
const { data: created } = await hoody.api.computers.create(project.data!.id, {
  server_id: active.server_id!,
  name: 'dev-box',
  hoody_kit: true,   // install the Kit
});
```

- The computer is yours at once; poll `hoody.api.computers.get(id)` until `status` is `'running'`, then pass it to `withComputer()`. Its services finish starting about 10 seconds later. A read (`GET`) waits for them on its own, up to `kitStartingWaitMs` (default 20000; 0 turns it off), and then fails with code `KIT_NOT_READY`; before a write, wait for a read such as `box.files.kit.getHealth()`.
- **Limits.** A server or a project can carry a computer limit, and a create over it is refused with `SERVER_COMPUTER_LIMIT` or `PROJECT_COMPUTER_LIMIT`.
- **Copy.** `hoody.api.computers.copy(id, { target_project_id, name })` copies a computer into another project (and optionally another server) with its own URLs. It provisions asynchronously: poll `computers.get(copy.data.id)` until it runs.
- **Delete.** `hoody.api.computers.delete(id)` removes the computer and every URL it answered on.
- **Snapshots.** `hoody.api.snapshots.create(...)` records the computer's filesystem; take one before an agent changes anything.
- **Durability.** The optional RAM-backed mount at `/ramdisk` (on by default; `ramdisk: false` at creation turns it off) survives computer restarts but is wiped if the physical host reboots. Keep durable state on the regular disk.

## Servers and the bare-metal marketplace

Marketplace servers are physical machines rented to you alone at a flat rate; the free-tier server shares a host. The proxy that serves your URLs runs on that server, so traffic resolves straight to it; `api.hoody.com` handles management operations only. A rented server runs for the period you paid and can be renewed; if a rental lapses, the server is held first, and its computers stop only when the hold ends.

```typescript
const offers = await hoody.api.servers.listMarketplace({ min_ram_gb: 64, country: 'DE', available_durations: [30] });

// Every paid rental confirms a ceiling on the total debit, or it is refused with
// 409 CHARGE_CONFIRMATION_REQUIRED (SETUP_FEE_CONFIRMATION_REQUIRED with a one-time fee).
const offer = offers.data?.[0];
const tier = (offer?.pricing?.price_tiers as Record<string, { total_first_payment: string }> | undefined)?.['30'];
if (!offer || !tier) throw new Error('No 30-day offer matches');
const rented = await hoody.api.servers.rent(offer.id, {
  rental_days: 30,
  max_charge_cents: Math.round(Number(tier.total_first_payment) * 100),
});
console.log(rented.data!.rental!.server_id);   // fill it with computers
```

- `unlimited_traffic_only: true` in `listMarketplace()` leaves out offers with a monthly traffic allowance.
- `hoody.api.servers.extend(rentalId, { expected_rental_end, additional_days })` renews a rental without touching what runs on it. `expected_rental_end` is the rental's current `rental_end` exactly as the API returned it, so a retried request is refused instead of charging twice. When the rental has no frozen renewal price, the extension is priced live and also needs `max_charge_cents`, a total you confirmed with the user; without it the API answers `409 CHARGE_CONFIRMATION_REQUIRED`, and it refuses any extension that would cost more. Extend before `rental_end`.

## Realms and tokens for your own users

Give each customer, or each AI agent, a realm and a token minted for it. They get a typed Hoody API that holds only their resources.

```typescript
const realmId = '507f1f77bcf86cd799439011';   // any 24-hex string you pick

// 1. A project in the realm (the external_customer template cannot create projects)
const project = await hoody.api.projects.create({ alias: 'acme', realm_ids: [realmId] });

// 2. Optionally, computers in it. Anything the customer should see carries the realm.
const { data: acmeBox } = await hoody.api.computers.create(project.data!.id, {
  server_id: process.env.SERVER_ID!,
  name: 'acme-box-1',
  hoody_kit: true,
  realm_ids: [realmId],
});

// 3. A realm-scoped token. The token value is returned once, at creation.
const created = await hoody.api.auth.tokens.create({
  alias: 'Customer Acme',            // letters, digits, spaces, underscore and hyphen
  permission_template: 'external_customer',
  realm_ids: [realmId],
  allow_no_realm: false,             // usable only on the realm's API host
  // ip_whitelist: ['<customer CIDR>'],   // optional: only these source addresses may use it
  expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),   // 30 days
});
const customerToken = created.data!.token;
```

The customer's client is two lines:

```typescript
const acme = new HoodyClient({ baseURL: 'https://api.hoody.com', token: customerToken })
  .withRealm('507f1f77bcf86cd799439011');   // requests go to https://507f1f77bcf86cd799439011.api.hoody.com
```

- Templates: `external_customer`, `dev_team`, `read_only`, `finance_team`, `full_access`, or custom permissions. A token can mint sub-tokens only with the `resources.create_tokens` permission.
- `/api/v1/auth/tokens/me` tells a token holder its realm and permissions. `public_storage` attaches display metadata to a token; it needs a `public_key` (Ed25519).
- `withRealm('all')` (or `'default'`, `'*'`) clears the realm, and so does an empty or blank value, so check a required realm ID before passing it. Any other value that is not 24 hex characters throws `ValidationError`. One call can choose its own realm with the `_realm` option.
- When a call needs a realm host, or names a realm the token does not allow, the 403 is an `ApiError` with `code: 'REALM_SCOPE_ERROR'` and a `hint`; test it with `isRealmScopeError(err)`. A 403 for a resource outside the realm is a plain `ApiError`. With `realmErrorIntrospection: true` the client makes one extra request to list the realms the token allows and attaches them as `allowedRealms`.

## Aliases, custom domains and embed URLs

An alias is a label of 3 to 61 characters mapped to one service of one computer. Its URL carries no IDs. Leave `alias` out for a generated 48-character hex label.

```typescript
const a = await hoody.api.proxy.aliases.create({
  alias: 'team-dashboard',
  computer_id: computer.id!,
  program: 'exec', index: 1,
  target_path: '/report',          // what a request to "/" serves
  allow_path_override: false,      // serve only "/" and target_path; other paths are a 404
  expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
});
console.log(a.data!.url);          // https://team-dashboard.{server}.computers.hoody.com
```

| Field | Effect |
|---|---|
| `alias` | Label of `a-z`, `0-9` and `-`, 3 to 61 characters, or a generated 48-character hex label |
| `program` + `index` | The Kit service the alias serves, and its instance (default 1) |
| `port` | The port your server listens on when `program` is `http` or `https`; required then |
| `target_path` | What a request to `/` serves, with its own query |
| `allow_path_override` | `false` serves only `/` and `target_path` (other paths answer 404 `ALIAS_PATH_PINNED`); `true`, the default, forwards paths as sent |
| `expires_at` | When the alias switches itself off |
| `enabled` | Switch it off without deleting it |

An alias is a label, not a lock: permission rules follow the computer. Publish aliases only for services you would make public anyway (an `http-{port}` app, an `exec` endpoint, a `pipe`, a `tunnel`), and add permission rules before aliasing `terminal`, `files`, `sqlite`, `display` or `browser`.

**Custom domains.** Point a `CNAME` at the alias hostname:

```text
CNAME  app.example.com  ->  team-dashboard.{server}.computers.hoody.com
```

The proxy issues a certificate on the first request (which can answer `503` with `Retry-After` while issuance runs). Any number of domains can point in. Your app receives each visitor's real IP as the connection's peer address (`remoteAddress` in Node.js, `REMOTE_ADDR` in PHP); an `exec` script reads it as `metadata.clientIp`. A custom domain gets its own certificate, so its hostname appears in public Certificate Transparency logs.

**Embed URLs.** `hoody.embeds` builds the URL of one page of a Kit service's browser UI, such as the file editor, a terminal session, the cron manager or the SQLite studio, ready to open or frame:

```typescript
hoody.embeds.files.editor(computer, { params: { path: '/etc/hosts' } });
// https://{projectId}-{computerId}-files-1.{server}.computers.hoody.com/etc/hosts?edit=
box.embeds.cron.manager();
hoody.embeds.desktop.session(computer, { params: { desktop_env: 'xfce' } });
```

A parameter that writes or runs something, a value the proxy sets from the hostname, or an index out of range throws `EmbedValidationError` with a `code` (`PARAM_EXCLUDED`, `PARAM_FORCED`, `INDEX_OUT_OF_RANGE`, ...). `buildEmbedUrl`, `listEmbedViews` and `getEmbedCatalog` work without a client, and `hoody files open --view editor --path /etc/hosts --url` prints the same URL. Every view is listed in the [embed URLs guide](https://docs.hoody.com/guides/embed-urls/). An iframe `src` carries the computer's URL, so embedding it shares it.

## Terminals, displays and Linux tools

```typescript
// One-shot: run, wait, return the output
const out = await box.terminal.run('npm test');
console.log(out.exitCode, out.stdout);

// A shell tool for any model: two lines in your tool handler
const res = await box.terminal.run(args.cmd);
return { stdout: res.stdout, exit_code: res.exitCode };

// Convert a document with LibreOffice
await box.files.upload('/tmp/in.docx', docxBytes);
await box.terminal.run('libreoffice --headless --convert-to pdf --outdir /tmp /tmp/in.docx');
const pdf = await box.files.readBytes('/tmp/in.pdf');   // Uint8Array
```

- `box.shell({ reconnect: true })` is an interactive shell that comes back to the same session after a drop. Input typed during the drop is held and sent in order once the session is confirmed, and the latest terminal size is restored; a <kbd>Ctrl</kbd>+<kbd>C</kbd> sent while disconnected is dropped, and any other signal ends the shell. If the session is gone, the shell ends with a "session was lost" error.
- `box.terminal.sessions.*` drives interactive programs: `wait` (for a regex or for output to settle), `getSnapshot`, `search`, `pressKeys`, `paste`, `sendMouseEvents`. `box.terminal.processes.*` and `box.terminal.system.*` (`listPorts`, `getStats`) show what those commands started.
- `box.display.input` has `click`, `type`, `drag`, `select`, `actMany` (a sequence in one request) and `reset`; `box.display.mouse`, `box.display.keyboard`, `box.display.windows` (`search`, `focus`, `move`, `resize`, `close`) and `box.display.clipboard` cover the rest.
- A request to the terminal page URL with `redirect=display` starts the program, waits for the display and redirects to it:

  ```typescript
  const url = hoody.getKitUrl('terminal', computer)
    + `?terminal_id=1&display=1&cmd=${btoa('firefox https://hoody.com')}&redirect=display`;
  ```

- The computer is Debian: install pandoc, ffmpeg, ImageMagick, Postgres, Playwright or anything else with `apt-get`, `pip` or `cargo`.

## Agent sessions, turns and streaming

```typescript
const created = await box.agent.sessions.create();
const sessionId = created.data!.session_id;
if (!sessionId) throw new Error('No session_id');

// Waits until the turn ends (at most 290 s), or returns a pending_gate when it waits on a confirmation or a question
const turn = await box.agent.sessions.turns.run(
  sessionId,
  { text: 'Run the test suite and fix the first failure you find.' },
  { timeoutMs: 300_000 },   // the SDK's default 30 s is shorter than the turn's 290 s
);
```

- A turn still running after 290 seconds answers `503` with `details.turn_id` and `details.turn_running: true`. The turn keeps running: follow it with `box.agent.sessions.turns.get(sessionId, turnId)` or the stream, and never send the prompt again.
- A waiting turn is settled with `box.agent.gates.approve()` or `deny()`, or `box.agent.gates.answer()` for a question.
- For unattended runs add `gatePolicy: 'auto_approve'` to the options of `turns.run()` (`{ timeoutMs: 300_000, gatePolicy: 'auto_approve' }`). Ordinary confirmations are then approved for that turn and confirmations raised by tool-call rules are denied. A gate marked human-only is never answered automatically and comes back as `pending_gate`, and questions and plan gates still wait for an explicit answer, so an unattended caller still handles pending gates. The auto-reply loop (`sessions.autoReply.update`) answers only the questions its own rounds raise.
- Provider credentials and defaults are configured in the computer through `box.agent.providers.*` (`setApiKey`, `oauth.start`, `auth.setDefault`); `box.agent.models.list()` lists the models they unlock. Pass `model` to `sessions.create()` to choose one for that session only. Each Bot can have its own model (`box.agent.bots.update(id, { model })`); its running session keeps the old one until you reset the Bot with `box.agent.bots.reset(id)`. Signing in with a subscription is a short job: start it, show the user the link and code, poll until it settles, and pass back a code when the provider asks for one.

  ```typescript
  import { createInterface } from 'node:readline/promises';

  const provider = '<provider id from box.agent.providers.list()>';
  const { data: job } = await box.agent.providers.oauth.start(provider);
  if (!job?.job_id) throw new Error('Sign-in did not start');

  // The link and code can come with the start or with a later poll: show each new one once
  let shown = '';
  const show = (uri?: string, code?: string) => {
    const line = [uri, code].filter(Boolean).join('  code: ');
    if (line && line !== shown) console.log('Open', (shown = line));
  };
  show(job.verification_uri, job.user_code);

  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    const { data: s } = await box.agent.providers.oauth.poll(provider, job.job_id);
    show(s?.verification_uri, s?.user_code);
    if (s?.state === 'complete') break;
    // A failed or cancelled sign-in is a 200 with that state, never an HTTP error
    if (s?.state === 'error') throw new Error(`Sign-in failed: ${s.error}`);
    if (s?.state === 'cancelled') throw new Error('Sign-in cancelled');
    if (s?.needs_code) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const code = await rl.question('Paste the code or the redirect URL: ');
      rl.close();
      await box.agent.providers.oauth.submitCode(provider, job.job_id, { code });
    }
  }
  ```

  A poll answers `state: 'pending'` until the sign-in settles, then `complete`, `error` or `cancelled`. `{ add_account: true }` on `oauth.start` adds an account to the pool instead of replacing the first one. A provider with no sign-in flow answers `422 oauth_unsupported`.
- **Streaming.** `streamAgentPrompt` posts the turn, parses the stream and returns text deltas, a turn-event stream and a `done` promise. It sends the client's `kitAuth`, never the account token.

  ```typescript
  import { streamAgentPrompt } from 'hoody-sdk';

  const run = await streamAgentPrompt(hoody, { computer, sessionId, text: 'Summarize what changed.', gatePolicy: 'auto_approve' });
  for await (const delta of run.text) process.stdout.write(delta);
  const result = await run.done;   // { terminal, text, data }
  ```

  `box.agent.sessions.turns.start(sessionId, data, { stream: true })` returns the lazy event stream without the parsing. It ends after the turn's own `agent_done` and closes the connection; pass `followSession: true` to keep reading the session.
- **Command-line agents in a computer.** Start any agent CLI that is on the computer's `PATH` as a supervised program, then read its logs over HTTP:

  ```typescript
  const { data: launched } = await box.daemon.ephemeralPrograms.start({
    user: 'user',
    command: 'aider --message "review the diff"',
  });
  if (launched?.temporary_id) {
    console.log((await box.daemon.ephemeralPrograms.getLogs(launched.temporary_id)).data.logs);
  }
  ```

  `user` is the computer's default Linux account (uid 1000). `box.daemon.programs.create(...)` makes it a persistent program with its own `autorestart` policy and an optional sandbox; `box.agent.importLocalConfig(tool, { only: 'credentials' })` (Node.js or Bun) copies a local agent CLI's configuration into the computer.
- Beyond turns, the namespace covers headless runs (`box.agent.headless.start`), loops with budgets, memory with search and a relation graph, todos, workflows, a tool catalogue with sessionless `tools.run`, GitHub sign-in, clone, commit and pull requests, skills, hooks and usage statistics. Full listing: [`agent.md`](../namespaces/agent.md).

## Bots and Bot URLs

```typescript
// Ask and wait. Where the Kit supports it (res.keyed is true), asking again with the same key does not send twice.
const res = await box.agent.bots.ask('chief', 'Deploy the staging branch and report back.', {
  idempotencyKey: 'deploy-staging-1',
  onRow: (row) => console.log(row),          // every log row after the message, as it arrives
});
console.log(res.reply?.text, res.turnState);

// Post without waiting, and follow the Bot's log yourself
await box.agent.bots.messages.send('chief', { text: 'Also check the backups.' });
```

- `ask()` resolves with the reply row, or with `reply: null` and a `turnState` when the turn ended without a reply. It rejects with a `code` of `BOT_RECEIPT_UNAVAILABLE`, `BOT_MESSAGE_REQUEUED`, `BOT_STREAM_ENDED` or `BOT_REPLY_BACKLOG`; a blank `idempotencyKey` is `INVALID_IDEMPOTENCY_KEY`, and kit errors are `ApiError`. `followLogs()` follows the log and reconnects on its own.
- `box.agent.bots.*` also creates and configures Bots, their channels (Telegram, Slack, Discord), guardrails and delegates. A Bot lives in one realm, `global` or a realm ID; the `agentRealm` option chooses it.
- On the computer's agent URL, `/api/v1/agent/bots/{realm}/{bot}` is the Bot's base URL: OpenAI-compatible clients add `/v1`, Anthropic-compatible ones use it as is, MCP clients add `/mcp`.
- **Bot URLs** are managed on the account API, `hoody.api.botUrls.*`:

  ```typescript
  const { data, propagation } = await hoody.api.botUrls.create({
    computer_id: COMPUTER_ID,
    bot: { realm: 'global', id: 'chief', uid: BOT_UID },   // uid: the top-level uid from GET /api/v1/agent/bots/{id}
    label: 'acme-helper',                                     // optional; generated when left out
  });
  ```

  Keys are `hoody.api.botUrls.keys.*`; `repoint` and `panic` are there too. From the CLI: `hoody boturls create`, `hoody boturls keys create`, and `hoody boturls ask <url> "<text>"` or `hoody boturls chat <url> "<text>"` for callers, who set `HOODY_BOT_KEY`.
- `BotUrlClient` is the caller's side: `chat()` streams by default, and retries cold starts, brief outages and short `429` waits for about two minutes before it throws a `BotUrlError` (test it with `isBotUrlError`). `ask()`, `listUpdates()`, `answer()` and `getStatus()` use the Bot URL's MCP tools.
- Callers pay nothing and need no account; every call runs on your Bot with your models and credits. Request limits apply per key and per Bot.

## Tunnels

Publish a local HTTP or WebSocket service on a computer port (expose), or bind a local TCP service onto the computer's loopback so code in the computer can reach it (pull). Node.js or Bun:

```typescript
// Expose your local :3000 on a computer port; computerPort 0 picks a free unprivileged one
const handle = await box.tunnel.expose({ computerPort: 3000, to: { host: '127.0.0.1', port: 3000 } });
console.log(hoody.getKitUrl('http', computer, { port: handle.bind.computerPort }));
await handle.close();

// Pull: in-computer code reaches your local Postgres at 127.0.0.1:8080 (no public URL)
const pulled = await box.tunnel.pull({ computerPort: 8080, to: { host: '127.0.0.1', port: 5432 } });
await pulled.close();
```

- `keepTunnelAlive(handle, { mode, computer, to })` keeps a tunnel up across drops. Here `computer` is the tunnel Kit's hostname or URL, such as `hoody.getKitUrl('tunnel', computer)`, not a computer. The Kit holds a dropped session's binds for 60 seconds by default and the helper resumes inside that window. Its `ended` promise settles with `{ deliberate, reason, code? }`; `RESUME_EXPIRED` means the hold ran out.
- `box.tunnel.serve()` (Bun only) takes a `Bun.serve`-style `fetch` handler. The package-root `exposeTunnel`, `pullTunnel` and `serveTunnel` take an explicit URL, and `TunnelSession` has the low-level primitives.
- A tunnel gated by a permission rule takes the credential as `kitAuth`; the account token is never sent. The CLI form is `hoody tunnel expose 3000`.

## Exec scripts and request hooks

A script written with `box.exec.scripts.write` is an endpoint. `req`, `res` and `metadata` are in scope with no import.

```typescript
await box.exec.scripts.write({
  path: 'api/build.ts',
  content: 'const { branch } = metadata.query;\nreturn { ok: true, branch };',
});
```

The script `api/build.ts`, served at `/api/build`:

```typescript
const { branch } = metadata.query;
return { ok: true, branch };
```

| Caller | How it reaches the script `api/build.ts` |
|---|---|
| CLI | `hoody -c <computerId> exec api-build --method POST --query-param branch=main` (schema-less scripts default to `GET`; `--refresh-scripts` finds a new script) |
| SDK | `await fetch(hoody.getKitUrl('exec', computer) + '/api/build', { method: 'POST' })` |
| HTTP | `POST https://{projectId}-{computerId}-exec-1.{server}.computers.hoody.com/api/build` |
| The agent | The endpoint appears in its discovered tool catalogue |
| Cron | Add `// @schedule 0 * * * *` (UTC). A write through `scripts.write` registers it, so there is nothing to reload; `box.exec.schedules.reload()` re-scans the directory if a file changed by other means |

**Hooks.** Every request to a computer URL passes through the proxy. A hook runs an exec script before matching requests reach the service, and can inspect, rewrite, redirect or block them:

```typescript
await box.exec.scripts.write({ path: 'hooks/fresh-check.ts', content: src });
const svc = await hoody.api.computers.proxy.listHooksByService(computer.id, 'files');
await hoody.api.computers.proxy.createHook(
  computer.id,
  'files',
  { match: { method: 'GET', path: '/docs/spec.md' }, script: { path: 'hooks/fresh-check.ts' }, timeout: 5000 },
  { ifMatch: svc.data!.etag! },   // optimistic concurrency
);
```

First match wins, with up to 8 hooks per service and a 30-second budget each. Hooks run only on requests that go through the proxy. A hook script can read and rewrite the service's reply with `metadata.hook.fetchUpstream()`; `box.proxyLogs.*` queries the proxy's logs. The full `exec` surface is in [`exec.md`](../namespaces/exec.md).

## Real-time events

`hoody.events` delivers account changes as they happen: a computer starting, an alias created, a payment clearing. `hoody.api.events.*` is the REST history.

```typescript
const off = await hoody.events.on('computer.*', (event) => {
  console.log(event.type, event.resource_id, event.data);
}, { filter: { projectId } });

// The action runs once the stream has caught up, so its event cannot be missed
const running = await hoody.events.waitFor(
  'computer.running',
  { resourceId: computerId },
  () => hoody.api.computers.start(computerId),
  { timeoutMs: 120_000 },
);
```

- Event names are checked against the catalog: a misspelt type is a compile error and a runtime `TypeError`. `event.data` is typed per event type. `isReservedEventType(name)` tells which declared names are never emitted.
- The socket stays open while a handler, a `stream()`, a pending wait or a `bootstrap()` needs it. After a disconnect the SDK reconnects (backoff from 1 to 30 seconds), reads what it missed from history and delivers it with `replayed: true`. Delivery is at least once for persisted events up to 90 days old; `activity.logged` is live only and never replayed.
- When continuity cannot be restored, `onState` reports `{ kind: 'gap', reason }`: re-read with GET whatever you keep in sync. `bootstrap(readFn)` runs your GET calls once the stream has caught up and returns the resources touched meanwhile.
- `stream()` is the same feed as an async iterator. Save each event's `resume_after` after you handle it and pass it back as `after` to continue; de-duplicate by `id`.
- Computer operations and server commands report their outcome as `computer.operation.completed` / `.failed` and `server.command.*`, with the same `operation_id`.
- A realm-scoped client sees only that realm's events, and a token restricted to realms must use `withRealm()`. A refused or revoked stream raises `EventsAuthError`.

## Errors, retries, middleware and token refresh

```typescript
import { ApiError, ValidationError, isApiError, isRetryableApiError } from 'hoody-sdk';

try {
  await box.files.get('/nonexistent');
} catch (err) {
  if (isApiError(err)) {
    console.error(err.status);    // HTTP status, or 0 for a transport, timeout or parse failure
    console.error(err.code);      // server code, or 'ABORTED', 'ETIMEDOUT', 'PARSE_ERROR' from the client
    console.error(err.request);   // { method, url, headers, body, query } with recognized credentials redacted
    if (isRetryableApiError(err)) { /* 408, 425, 429, 500, 502, 503, 504, and 409 FILE_PATH_BUSY / PATH_BUSY */ }
  }
}
```

- `ApiError` is the same class in the browser, Node.js and the CLI. On an HTTP error its `code` comes from the body, else from the `X-Hoody-Error-Code` header. `ValidationError` is client-side input validation. `VaultCryptoError` comes from the vault `decrypt` and `parseEnvelope` helpers, with a `.kind` and the backend error as `.cause`.
- **Redaction.** `err.request` and `err.url` have `Authorization`, `Cookie`, `Proxy-Authorization`, `x-*-token`, `x-*-key`, secret query parameters, URL userinfo and secret body fields replaced by `[REDACTED]`. Redaction is pattern-based, and `err.response` and `err.message` hold the server's reply verbatim. The URL's host is kept, and an open computer can be reached with its address alone (see [Security model](#security-model)), so keep logs that hold one private.
- **Per-request overrides:**

  ```typescript
  await box.files.get('/bigfile', {
    retries: 5,
    retryDelayMs: 500,                 // exponential backoff base, capped at 30 s
    retryOnStatuses: [502, 503, 504],
    responseType: 'arrayBuffer',       // 'auto' | 'json' | 'text' | 'arrayBuffer' | 'blob'
    timeoutMs: 60_000,
    signal: AbortSignal.timeout(120_000),
  });
  ```

  `timeoutMs` bounds the wait for response headers and each idle gap between body chunks (reset as data arrives); it is not a total download deadline. A `Retry-After` header (seconds or HTTP date, clamped to 30 s) wins over local backoff. Streaming bodies are never replayed. GET responses are cached only when you turn caching on.
- **Retry only the statuses you name.** `retryOnStatuses` replaces the default list for that call, so `retryOnStatuses: [502, 503, 504]` makes a 429 final: the call rejects with the 429 `ApiError`, whose `retryAfterMs` holds the server's Retry-After in milliseconds. A keyed write retries a 429 by default, because the server did not run it.
- **Middleware** (`IHttpClientMiddleware`) has `onRequest`, `onResponse` and `onError`, and runs on every retry. A generated call still reaches the realm it was made for; a request a middleware sends outside the API goes without the client's credentials. `captureRawBody: true` exposes the exact response bytes for `verifyHoodySignatureFromContext`.
- **Authorize each send, or refuse it.** `onRequest` runs before every attempt, including a retry, so a middleware can read a credential from your own store each time. If it throws, the call ends at once with an `ApiError` of status 0, code `REQUEST_REFUSED`, `outcome: 'not_sent'` and the thrown value as `cause`. The request is not sent again, the middleware is not asked a second time, and `onError` cannot replay it. An `ApiError` that the middleware throws is the answer as it is. `authRetry: false` on a call turns off the 401 replay for it.

  ```typescript
  const hoody = new HoodyClient({
    baseURL: 'https://api.hoody.com',
    middlewares: [{
      onRequest(ctx) {
        const token = readSessionToken();
        if (!token) throw new Error('signed out');
        return { ...ctx, headers: { ...ctx.headers, Authorization: `Bearer ${token}` } };
      },
    }],
  });
  ```
- **Two-factor step-up.** `onStepUp: async (error) => code` runs when a call fails with 400 `OTP_REQUIRED` and its operation has an `otp_code` body field (the generated method says so; the body is never searched). Return the code, or `null` to give up and let the error through. The client sends the request once more with the code in `otp_code`. It asks at most once per call, keeps an `otp_code` you already set, and skips a call that cannot be sent again (a stream body). The resend's answer, whatever it is, is the call's answer: no token refresh, retry or `onError` replay sends the code again. If the hook throws, the original error is thrown, and the console gets a fixed line with the error's name, never its message.
- **Size limits.** `maxResponseBytes` (a client option and a per-call option) refuses a successful buffered response over the limit with code `RESPONSE_TOO_LARGE` (status 0, never retried). A `Content-Length` over the limit is refused before any byte is read; without one, reading stops at the limit. An error answer (not 2xx) is never refused for its size: it keeps its status, so the 401 refresh and the 429 retry still work, and its body is cut at the limit. A JSON body cut part-way does not parse, so that error has the status but no `code` or body message. `maxStreamBytes` (a client option and a `streamEvents` option) ends an event stream with code `STREAM_TOO_LARGE` once the bytes read pass the budget; the budget is checked per chunk before its frames are parsed, so frames in the chunk that crosses it are not delivered and frames in earlier chunks are. Neither is set by default. A value that is set but is not a whole number above 0 (`0`, a negative, a fraction, `NaN`, `Infinity`, a string, `null`) throws a `ValidationError` from the client constructor or the call.
- **`fetch` modes.** `fetchCredentials` sets `credentials` on `fetch`: `'omit'`, `'same-origin'` or `'include'`, or an object to choose per namespace: one entry per kit namespace (`agent`, `terminal`, ...) or `api`, and `'*'` for every namespace not listed, for example `{ agent: 'include', '*': 'omit' }`. A request sent with `'include'` counts as credentialed and is never followed through a redirect to another origin. `fetchCache` sets `cache` (`'default'`, `'no-store'`, `'reload'`, `'no-cache'` or `'force-cache'`). The names differ on purpose: `HoodyClient`'s `credentials` is the login and its `cache` is the SDK's response cache. Neither is set by default. A mode other than `'default'` makes a browser add `Cache-Control` and `Pragma` request headers, which turns a cross-origin write into a preflighted request. Node's `fetch` acts on `fetchCache` too, and Node's `fetch` ignores the credentials mode itself, but `fetchCredentials: 'include'` makes the Node client follow redirects by hand (a credentialed request never follows one to another origin).
- **A browser WebSocket cannot send headers.** When a call gives a socket its own credential (`middlewareContext: { kitAuth }`, or a `Cookie`, `Proxy-Authorization`, `X-Hoody-Token` or `X-Hoody-Computer-Claim` header on the call), `connect()` rejects with a `WebSocketCredentialNotSentError` (code `WS_CREDENTIAL_NOT_SENT`, `headers` names what was not sent; check with `isWebSocketCredentialNotSentError`) and no socket opens. Use a proxy token group that reads a query parameter, or a cookie on the kit host. A `kitAuth` set on the client keeps the old behaviour: one console warning, and the socket opens. Only the headers that per-call credential would use are checked, whatever their name: a `kitAuth` with `header: 'X-Access-Pass'` is refused for that header, a token with a query `param` names none and connects, and an unrelated inherited header does not cause a refusal. A custom-named credential header passed in the call's own `headers` is not recognised (only `Authorization`, `Cookie`, `Proxy-Authorization`, `X-Hoody-Token` and `X-Hoody-Computer-Claim` are). A static `webSocketImpl` takes a URL and protocols only, so it refuses the same credentials on every runtime. Outside a browser, with the default socket, the headers are sent and nothing changes.
- **Token refresh.** With `token:` and no credentials, `onTokenExpired: async (error) => newToken` runs once per 401 and the request is replayed; concurrent 401s share one refresh. Return `undefined` to let the 401 surface.
- **Where the account token goes.** The account bearer is sent only to your `baseURL` origin (scheme, host and port) under its path, and to its realm hosts (exactly one 24-hex label in front of the base host, same scheme and port). Every other host, other subdomains included, gets no account token, also after a redirect. Kit requests carry only the `kitAuth` credential you configured, which may itself be an `Authorization` header (Basic or Bearer).

## Types and helpers

- Every method has typed parameters and an inferred response type. Some response payloads are loose (`unknown` or `Record<string, unknown>`), mostly in `box.agent.*`, which returns the daemon's replies verbatim; expect a presence check or a cast there. Every generated request and response type is importable: `import type { DaemonProgramsCreateRequest } from 'hoody-sdk'`.
- **Mount a computer's files on your machine** with `import { mount } from 'hoody-sdk/mount'` or `hoody mount <computerId>:/data ./data` (needs `rclone` with FUSE, or WinFsp on Windows). A changed file is uploaded once it has been closed and idle for about a second; if the computer changed it meanwhile, the files service keeps that version as a conflict copy beside it.
- `box.curl.channel.connect()` with `createCurlFetch` gives a `fetch()`-compatible function that multiplexes requests over one WebSocket.
- `encrypt`, `decrypt`, `isEncrypted` and `parseEnvelope` are client-side crypto for `hoody.api.vault.*`.
- `getHoodySignatureHeader` and `parseHoodySignatureHeader` read the `X-Hoody-Signature` header; `verifyHoodySignatureHeader` and `verifyHoodySignatureFromContext` check its Ed25519 signature, which signing-enabled deployments put on non-empty, non-stream API replies.
- `box.notes.files.upload` uploads a notebook file over TUS, with `resumeUpload`, `uploads.getOffset` and `uploads.cancel`.
- `pipeTransportFromClient(client)` sends pipe traffic through the client's own transport; `withTokenQueryParam(url, auth)` puts a Kit token in the query parameter its `param` names.
- `TwoFactorRequiredError`, `isRealmScopeError` and the `HttpClient` transport class are package-root exports.

## Security model

A call between zones carries either a scoped bearer token or, on an open computer, the computer URL itself; a gated computer adds the credential its permission rule expects. Ambient identity authorizes nothing.

| Zone | Trusts | Does not trust |
|---|---|---|
| Your machine (laptop, server, CI) | The API it points `baseURL` at | Anything served by a computer |
| The account API | A bearer token | Anything inside a computer |
| Your computer | The code you put in it | The account: no identity flows back from it |
| A user's browser tab | The token you gave the page | Other origins; the SDK sends the account token only to your `baseURL` origin and its realm hosts |
| Another computer | Nothing about yours | Everything about yours |

The `hoody` CLI inside a computer has no credentials. It is on every user's `PATH` and talks to the same API, but its first authenticated call needs a token or a sign-in you supply: there is no automatic login as the computer's owner, so a dependency or script in the computer cannot act on your other computers, billing or realms. Give it the narrowest token that works:

```bash
hoody login                                       # interactive
export HOODY_TOKEN=<a-realm-scoped-token>         # scripts and CI
export HOODY_REALM=<realmId>                      # a realm-scoped token works only on its realm's host
```

Where each layer is enforced: bearer tokens and realm scoping at the API; computer URLs, permission rules, aliases and custom domains at the proxy; the local lock on your own machine; redaction and optional response-signature checks in the SDK.

See [Security](https://docs.hoody.com/concepts/security/) and [Proxy permissions](https://docs.hoody.com/foundation/proxy/permissions/) in the docs.

## CLI details

```bash
hoody login --web                            # browser sign-in (GitHub, Google or an existing session)
hoody login --email you@example.com -p       # prompt for the password without echoing it
hoody login --token hdy_... --realm <realmId>
hoody signup
hoody logout                                 # this device; --all ends every session
```

- `hoody login` saves the session to `~/.hoody/config.json` (mode `0600`). `--print-token` prints only the access token, and `--no-save` writes nothing.
- `--web` uses a device flow with PKCE: the CLI prints a short code and URL, opens a browser when it can, and finishes once you approve.
- **Script commands.** Eligible exec scripts become `hoody exec <name>` (`api/reports.ts` is `hoody exec api-reports`). A declared schema gives typed flags for top-level fields; schema-less scripts accept `--method`, repeated `--query-param k=v` and `--body @file.json`.
- **Lock mode.** `hoody local lock` encrypts the CLI's stored credentials with XChaCha20-Poly1305, using a key derived from your password with argon2id. While locked, `config.json` holds sentinels in place of the access token, refresh token, Kit token and routing defaults (computer, project, realm), and the account password is never stored.

  ```bash
  hoody local lock enable
  hoody local lock status
  HOODY_LOCAL_PASSWORD=... hoody computers list    # unlocks for this command only
  hoody local lock disable                          # deletes the stored tokens unless --write-plaintext
  ```

- **The documentation assistant.** `hoody chat` answers questions about Hoody from the documentation, with citations. It needs no API key, model choice or account, runs nothing and cannot reach your computers; for that, use `hoody agent prompt`. It allows 30 questions an hour and 2000 characters per question. See the [chat guide](./chat.md) and [chat privacy](./chat-privacy.md).

  ```bash
  hoody chat "how do I list computers on a specific server?"   # one answer, streamed to stdout
  hoody chat                                                    # a conversation
  hoody chat --persist                                          # keep the transcript
  hoody chat --private "what is a realm?"                       # keep nothing on disk
  ```

- **From a GitHub clone.** The repository ships the prebuilt CLI and SDK (`cli/dist`, `dist-ts` and the browser bundles):

  ```bash
  git clone https://github.com/HoodyNetwork/hoody-sdk.git && cd hoody-sdk
  npm install            # runtime dependencies only
  npm link               # puts `hoody` on your PATH from this checkout
  ```

  Without a global command, `node cli/dist/index.js <args>` runs the same tree.
