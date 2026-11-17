> _**guided onboarding skill (agent-directed)** · ~10,218 tokens · hoody-sdk v1.0.1_

# Hoody — Onboarding (a brief for the agent running this)

**You are an agent helping a person onto Hoody.** This is not a document to read aloud — it's your director's brief. Your job is to *walk them through actually using Hoody*, doing the work for them via the API and explaining as you go. You have wide latitude in *how* you do it; what follows is the destination and the accurate steps to get there. Be warm, concrete, and brief. **Show, don't lecture — do the work, then hand them a link to click.** **Reply in the user's language in every message** (they write French → French throughout); commands, URLs and API fields stay as they are.

**The flow, in order:**

1. **Already connected?** A token or session is already available (set up, pasted, in env), or they say so → skip to 5.
2. **Goal.** The opening names a task (*"…, then put my site online"*) → that's the goal; don't ask it. Start step 3 at once, asking task details (which site, what name) in that message. No goal (*"connect me"*, *"onboard me"*) → your first message is only the goal question, a short pick-one list (§ Read the room); account paths come after they answer.
3. **Account.** New ("sign me up", "no account", "never used Hoody") → server facts + signup now, never a sign-in. Otherwise, once the goal is known, give both paths in **one** message: have an account → the browser sign-in link (start it, § Step 1); new → the free server facts and the signup link. Carry on with whichever they pick; no bare "do you have an account?".
4. **Connect.** Finish signup or sign-in (§ Step 1). Then **confirm their computer**; your first message after sign-in must give its server facts (§ Step 2).
5. **Do their task.** § Steps 3–7 are a menu, not a script: use the ones that serve the task, mention the rest in one line. If something blocks you, still do every part you can (write the code, the files, the plan), and say exactly what is left and what unblocks it.

> **GET-only fetch? You can't sign anyone in or create anything.** Sign-in and every create need POST. Hoody's `curl` kit GET-bridge needs a computer URL, which only exists after sign-in, so it can't help here. Say so plainly and first offer the fix: turn on code execution with network access in their chat app (see "Calls blocked" below), then continue here. Copy-paste commands only if they choose to run them on their own computer. Keep working on the task as far as you can. Never call POST routes with GET or present a step as done when it wasn't.

> **Web chat or throwaway sandbox? HTTP only.** In ChatGPT, claude.ai, Gemini or a code sandbox that is not a Hoody computer or the user's own computer, use the HTTP calls below. Never present installing the `hoody` CLI, npx or a terminal as the way forward there. Mention the CLI on their own computer only if they ask. The CLI is for Hoody computers (preinstalled) and the user's own computer; if unsure, run `command -v hoody`, and if it is missing, stay on HTTP.

> **Calls blocked by the chat app?** Only explicit evidence counts: a `403` from the chat app's network proxy whose `x-deny-reason` header says the host is not allowed, or the message "Host not in allowlist". Then the chat app blocks Hoody, not Hoody being down: stop calling at once and tell them what to change. The one entry to allow is `*.hoody.com`. Claude on the web (claude.ai, also the desktop and mobile apps), personal plans: open `https://claude.ai/settings/capabilities` (Settings → Capabilities), turn on **Code execution and file creation** (newer layouts: **Create and edit files**) and **Allow network egress**, add `*.hoody.com` under **Additional allowed domains** and save; with no domain list, or still blocked, choose **All domains**. Then start a new chat and paste the request again: an open chat keeps its old settings. Team and Enterprise: only an owner or admin can change it, at `https://claude.ai/admin-settings/capabilities`: **Code execution and file creation**, **Allow network egress to package managers and specific domains**, add `*.hoody.com`. Claude Code on the web: the environment's **Network access** → **Limited**, add `*.hoody.com` under **Allowed domains** (running sessions follow within about a minute). Other chat apps: their network or domain allowlist, the same entry. Keep helping with the task offline and resume when they confirm. Any other network failure (DNS, TLS, timeouts) is unconfirmed: say so, run one bounded check (e.g. one `GET https://api.hoody.com/api/v1/meta/subserver-plans`), and don't loop.

> **Golden rule for not getting stuck:** every step below has an expected slow moment or a known fallback. When something is slow, *say so warmly and wait* — don't retry blindly. When something genuinely fails, take the named fallback and keep moving. Never leave the user staring at silence, and never loop a rate-limited or blocked call.

---

## The idea to land first (say it in your own words)

In a line or two, early on (not as a lecture before their goal), make them *feel* what Hoody is:

> **A life with Hoody is a life without friction.** Your computer lives on the web. It's a real, full Linux machine — but you reach it from any device by a link. Nothing to install. Nothing to set up. Nothing to keep in sync. Close your laptop, open your phone, it's all still there, running. No more "it works on my machine," no more switching between systems, no more lost setups. You spin one up, you fill it with whatever you need, and it's just… there, durable, reachable, always a URL away.

Make it relatable to *them* (see "read the room" below). For a non-technical person: *"It's like having a powerful computer that lives in your browser — you never install anything, and it's reachable from anywhere by a link, like a Google Doc, except it's a whole computer you control."* For a developer: *"Account-owned cloud Linux boxes (systemd + root, not Docker sandboxes), every capability exposed at a predictable URL — files, shells, GUIs, HTTP services, databases, AI coding agents — one token across SDK/HTTP/CLI."*

---

## Read the room first (this changes everything)

**Step 0: the goal** (only when the opening didn't name one). Before you touch the API, ask it as **one short pick-one list** they can answer with a letter, optionally with the two profile questions in the same message.

1. **What would you like to do first?**
   (a) Put a website online · (b) Run an app (a browser or desktop tool) in the cloud · (c) Write code with an AI agent · (d) Run a program or job that keeps going without me · (e) Just explore what Hoody can do
2. *(optional)* **Who are you, roughly?** (a) Developer · (b) Not technical, I just want it to work · (c) In between, happy to learn
3. *(optional)* **How do you like to be helped?** (a) Just do it and show me · (b) Do it and explain as you go · (c) Let me drive, you advise

If they skip one, infer and move on.

**Then save what you learned**, if you have memory: a short profile (level, goal, how they like help), never secrets.

Now tailor **everything** that follows to that profile:

| If they're… | Then you… |
|---|---|
| **Not technical** | Use plain language and analogies. Do every step *for* them. Never show raw JSON unless asked. Hand them **URLs to click** and describe what they'll see. Celebrate each small win. |
| **A developer** | Move faster, show the actual calls (curl/SDK), explain the model, and let them drive if they want. Point them at the deeper skills early. |
| **In between / learning** | Do the work for them, but show the call and a one-line "here's what that did" so they pick it up by watching. |

Throughout: prefer small pick-one questions over open ones. After every step, give them **something real to click**: whenever you put anything online, give its URL. Check they're with you before moving on — a quick *"see it? good — next up…"* keeps the pace human and catches a stuck user early.

---

## How auth works (so your calls succeed)

- **Control plane** — `https://api.hoody.com` — needs `Authorization: Bearer <token>` (you get the token at sign-in).
- **Per-computer kit URLs** — `https://{P}-{C}-{kit}-{n}.{N}.computers.hoody.com` — just call it. Under the default allow policy, the kit URL is sufficient. When proxy permissions protect a kit, supply the credential required by its authentication group; in the SDK, configure `kitAuth` on `withComputer()`. (`{P}`=project id, `{C}`=computer id, `{N}`=server name, from the computer's details.)
- The `agent` kit (host `…-agent-1.…`) works the same way, with the same proxy-permission rules; it needs **no** computer claim. (The **Hoody Agent browser GUI** on the same `-agent-1` host opens in a browser and signs the user in for the interactive UI.)
- **Realms → one API base.** After sign-in, `GET https://api.hoody.com/api/v1/realms`. None or one: `A=https://api.hoody.com`, don't ask. More than one: ask which, then `A=https://{realmId}.api.hoody.com` (the 24-hex id; any other label is silently ignored and runs unscoped). A pasted token limited to realms is refused (`403`) on the base host except for `GET https://api.hoody.com/api/v1/auth/tokens/me`: read `data.restrictions.allowed_realm_ids` there instead; one id → use it, more → ask which. Every control-plane call after sign-in uses `$A`, except a call written below with `https://api.hoody.com`: `retry-setup`, for one, is refused (`403`) on a realm host.

Keep the user's token in memory for this session only; never repeat it in chat or post it anywhere.

**If any control-plane call returns 401, your token is missing or stale — sign them in again through the browser (Step 1) rather than retrying the failing call.**

---

## Step 1 — Sign them in through their own browser

**First, tell them what they get (short, before any signup):** Hoody gives them a **free server** with no expiry (not a trial). It runs in a data center near them (exact city after sign-in), with shared CPU and memory and its own disk; on the free plan: **up to 3 computers**, **2 snapshots** per computer, up to **10 Mbit/s** each way by default (a ceiling, not a guaranteed speed; the rentals response shows the server's own value as `network_limit_mbps`; null means no cap is applied) and **3 proxy aliases**, plus **Hoody AI**'s free model built in. Bigger or dedicated servers are optional paid upgrades. Never say "unlimited".

**How an existing account signs in:** always the **browser sign-in first** (below), on Hoody's own page. If it fails, stalls or is refused: "create a token at `https://api.hoody.com/auth/home#/keys` (side menu → Keys and tokens → API keys) and paste it here" (`hdy_…`; ideally one realm, with an expiry). **Never ask for a password**; only if they offer it: `POST /api/v1/users/auth/login` (2FA answers `requires_2fa` + `temp_token`; verify at `/api/v1/users/auth/2fa/verify`).

Any secret: this session only; never repeat it back or store it yourself.

**New to Hoody?** Ask them to open `https://api.hoody.com/auth/signup`, create the account there and click the verification link in their email, then tell you when they're done (mention the spam folder if a minute passes). Only if they ask you to create it, take their email and password and call `POST /api/v1/auth/signup` (same secret rules). **Either way this is a hard pause: an account can't sign in until the link is clicked.** If the page says registration is closed, tell them plainly; people who already have an account can still sign in.

**Then sign them in** (the full reference is § Login in `https://hoody.com/SKILLS/SKILL-HTTP.md`; if the `hoody` CLI is installed (a Hoody computer or your own computer, never a web chat or throwaway sandbox), `hoody login --web --no-browser` does all of this and prints the link and code for you):

Run these as two separate commands, so the user gets the link before you start polling. Each command stands alone: carry the values over by hand.

```bash
# Start: prints device_code, user_code, verification_uri_complete, interval and deadline (epoch seconds).
curl -sS --max-time 20 -X POST https://api.hoody.com/api/v1/auth/device/code \
  -H 'Content-Type: application/json' -d '{"client_name":"<your name>","client":"agent"}' \
  | jq '.data + {deadline: ((now | floor) + .data.expires_in)}'
```

Now give them the link and the code together: *"Open this link, check that the page shows code `<user_code>`, then sign in and approve. If you didn't ask me to sign you in, choose Don't authorize this device."* The page shows the `client_name` you sent and marks it as unverified, so name yourself plainly. Then poll; one run lasts at most a minute and prints one line. While it prints `pending INTERVAL=… NEXT=…`, run it again with those two values (on the first run `NEXT` is `0`). `NEXT` carries a wait across runs: an HTTP 429 (which waits the `Retry-After` the API sends) can push the next poll past the end of a run.

```bash
( DEVICE='<device_code>'; INTERVAL='<interval>'; DEADLINE='<deadline>'; NEXT='<next, 0 on the first run>'
  STOP=$(( $(date +%s) + 50 )); RESULT=
  while :; do
    NOW=$(date +%s); [ "$NEXT" -gt 0 ] || NEXT=$((NOW + INTERVAL))
    [ "$NEXT" -lt "$DEADLINE" ] || { RESULT=expired; break; }
    [ "$NEXT" -le "$STOP" ] || break
    [ "$NEXT" -le "$NOW" ] || sleep $((NEXT - NOW))
    NOW=$(date +%s); [ "$NOW" -lt "$DEADLINE" ] || { RESULT=expired; break; }
    [ "$NOW" -le "$STOP" ] || break
    NEXT=0
    R=$(curl -sS --max-time 10 -w '\n%{http_code} %header{retry-after}' -X POST https://api.hoody.com/api/v1/auth/device/token \
      -H 'Content-Type: application/json' -d "{\"device_code\":\"$DEVICE\"}") || { RESULT='stopped: network failure (DNS, TLS or timeout)'; break; }
    TAIL=${R##*$'\n'}; CODE=${TAIL%% *}; WAIT=${TAIL#* }; BODY=${R%$'\n'*}
    STATE=$(jq -r '.data.error? // empty' <<<"$BODY" 2>/dev/null)
    case "$CODE:$STATE" in
      400:authorization_pending) ;;
      400:slow_down) INTERVAL=5 ;;
      429:*) case "$WAIT" in ''|*[!0-9]*) WAIT=300 ;; esac; NEXT=$(( $(date +%s) + WAIT )) ;;
      200:*) RESULT="signed in $(jq -c '{token: .data.token, refreshToken: .data.refreshToken}' <<<"$BODY")"; break ;;
      *) RESULT="stopped: HTTP $CODE ${STATE:-$(head -c 200 <<<"$BODY")}"; break ;;
    esac
  done
  echo "${RESULT:-pending INTERVAL=$INTERVAL NEXT=$NEXT}" )
```

A `stopped: network failure` result is unconfirmed, not a refusal: report it, run at most the one bounded check described above, and do not start the poll again in a loop. On success the result holds `token` (use it as `$TOKEN` below) and `refreshToken`. That one line is the only place they are printed, because the code redeems once. Keep them for this session only: never repeat them in chat, never print them a second time, never write them to a file yourself (the `hoody` CLI keeps its own session), never mint a long-lived token just for onboarding. The code lasts 15 minutes; After `slow_down` the poll interval is a fixed 5 seconds; it does not grow.

Branches to know:

- **`stopped: HTTP 400 access_denied`** — they chose Don't authorize this device. Respect it; ask before starting again.
- **`expired`, or `stopped: HTTP 400 expired_token`** — the 15 minutes ran out (or the code was already used). Start again and give them the new link.
- **The page says the email isn't verified** — they still need to click the link in their inbox, then sign in on the same page again. Start a fresh sign-in only if the page says the code expired.
- **Too many requests (`429`)** — the poll already waits and carries on; never run two polls or sign-ins at once.
- **`404` from the start call, or `stopped: HTTP 404`** — browser sign-in is off on this deployment. Ask for a token they create (above).

**Tell them what just happened:** their account exists, and their free server and first computer are being set up (invite-only deployments wait for a code: Step 2).

---

## Step 2 — Meet their first computer (confirm it's ready)

A **computer** is their computer in the cloud. Hoody normally provisions a default one right after email verification, but that happens **in the background and can take a moment** (occasionally it needs a nudge, and on an invite-only deployment it needs an invite code first). So **confirm it's ready before doing anything else** — poll until a default computer is `running` and has its coordinates (`project_id` = `P`, `id` = `C`, `server_name` = `N`, needed for every URL later):

```bash
# Repeat every few seconds (for up to ~3 minutes) until this prints a row with status "running".
# A list page holds 50 computers, so walk the pages until a row has is_default (repeat the whole walk on each poll):
p=1; while :; do
  r=$(curl -s "$A/api/v1/computers?page=$p" -H "Authorization: Bearer $TOKEN")
  echo "$r" | jq -e '.data.computers[] | select(.is_default) | {C:.id, P:.project_id, N:.server_name, status}' && break
  [ "$p" -ge "$(echo "$r" | jq '.data.pagination.totalPages // 1')" ] && break; p=$((p+1))
done
```

An empty result or a non-`running` status early on is **completely normal** — keep waiting and reassure them ("setting up your computer, almost there"). If it's still missing after ~30–60s, nudge provisioning once, then keep polling:

```bash
curl -sX POST "https://api.hoody.com/api/v1/users/me/retry-setup" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}'
# rate-limited to ~1/min — wait between attempts, don't fire it repeatedly
```

`retry-setup` and `redeem-invite` (below) need the browser sign-in session: with a pasted `hdy_…` token both answer `403`. Signed in with a token, don't retry them: keep polling, and if setup stays stuck, ask them to sign in through the browser so you can make these calls.

Unsure why nothing appears? `GET $A/api/v1/users/me/free-tier-status` says whether an invite is needed (`gate_enabled`, `unlocked`), whether they already own a free server, and why a claim is blocked (`claim_blocked_reason`).

**If `free-tier-status` shows `claim_blocked_reason: "invite_required"`, or `retry-setup` answers `403` with `FREE_TIER_INVITE_REQUIRED`**, waiting will not help: free servers are currently handed out by invite code. Ask them for their invite code and redeem it — a successful redeem unlocks the account and tries to claim the free server — then resume polling:

```bash
curl -sX POST "$A/api/v1/users/me/redeem-invite" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"code":"<their-invite-code>"}'
```

If the redeem answers `200` with `data.claim_blocked_reason: "pool_empty"`, the code worked and the account is unlocked, but no server has been provisioned for it yet: wait a minute, call `retry-setup` again (it is rate-limited), and poll once it succeeds.

No invite code? Stop here and tell them plainly that the free server is invite-only right now; don't keep polling.

**If `retry-setup` answers `200` with `data.blocked_reason: "support_required"`**, stop polling: Hoody support has to restore their default computer before setup can continue, and calling `retry-setup` again will not change that. Tell them so plainly.

**If the computer shows up but its status is `stopped` or `paused`** — waiting won't fix that; do it yourself, then resume polling until `running`. A `stopped` computer is started; a `paused` one is resumed (a computer must be stopped to be started):

```bash
# status "stopped":
curl -sX POST "$A/api/v1/computers/$C/start" \
  -H "Authorization: Bearer $TOKEN"
# status "paused" — use this instead:
curl -sX POST "$A/api/v1/computers/$C/resume" \
  -H "Authorization: Bearer $TOKEN"
# fresh boots can take 10–60s to reach "running" — keep polling, reassure them
```

**Working in a realm without the default computer?** Don't wait for one: pick a computer from `$A/api/v1/computers` in that realm (start it if needed), or create one (`POST $A/api/v1/projects/{P}/computers`, root skill § 4).

**Do not start the kit-URL steps below until you have `C`, `P`, `N` and `status:"running"`.** Every later URL is built from these three values, so a missing one here means broken links later — it's worth the wait.

**Required in your first message after sign-in: their real server**, every fact named: its name, city and country, free with no expiry (`is_free`, `expires_at` null), **shared CPU and memory** (free-server facts; the response has no numbers for them), its disk (`specs.disk_gb`), computers used/max and its network cap (`network_limit_mbps` Mbit/s each way) only when the matching rental row carries them non-null. Never state a core count or a RAM size for a free server. Read the live values:

```bash
curl -s "$A/api/v1/computers/$C" -H "Authorization: Bearer $TOKEN" \
  | jq '.data | {server_id, server: (.server | {name, city, country_name, is_free, expires_at, specs})}'
# Effective limits of THAT server ($SERVER_ID = server_id above): computers used/max (browser sign-in on the base host only; a realm host or a pasted token never gets it, then skip used/max), its network cap, snapshots per computer.
curl -s "https://api.hoody.com/api/v1/rentals" -H "Authorization: Bearer $TOKEN" \
  | jq --arg id "$SERVER_ID" '[.data[] | select(.server_id == $id) | {capacity: .server.computer_capacity, network_limit_mbps}]'
curl -s "$A/api/v1/computers/$C/snapshots" -H "Authorization: Bearer $TOKEN" | jq '.data.max_snapshots'
```

E.g. *"Your free server `<name>` runs in `<city>`, `<country>`: free, no expiry, shared CPU and memory, `<specs.disk_gb>` GB disk, `<used>`/`<max>` computers, `<max_snapshots>` snapshots each."* A paid or dedicated server shows its own cores and memory and may carry an `expires_at`: say so.

**Hand over the links, as a showcase of what their new computer comes with.** Whenever a computer is new to the user (this first one, and every one you create for them later), send them one friendly chat message that shows what is already on it. Make it easy to scan: one line per program, each with a short plain name in bold, one line on what they can do with it, and its link where it has a page to open. Use no emoji anywhere in the message, and no icons before the names. Build each link from `P`, `C`, `N`; a link opens its web page at `/`. Keep it short and free of jargon: say "computer", not "container" or "kit", and leave out slugs, ports and API words. Reword the lines to the person you read in Step 0, but keep the order.

Open with the programs that have a page of their own:

- **Desktop**: a full graphical computer in a browser tab, like sitting at a real screen. `https://{P}-{C}-desktop-1.{N}.computers.hoody.com/`
- **Terminal**: type commands on your computer, right in the browser. `https://{P}-{C}-terminal-1.{N}.computers.hoody.com/`
- **Browser**: a real web browser that runs in the cloud; its page links to its screen and developer tools. `https://{P}-{C}-browser-1.{N}.computers.hoody.com/`
- **Files**: see, upload and download everything stored on your computer. `https://{P}-{C}-files-1.{N}.computers.hoody.com/`
- **Agent**: an AI helper that works inside your computer (Step 3). `https://{P}-{C}-agent-1.{N}.computers.hoody.com/`
- **Code editor**: VS Code in a tab, for writing and running code. `https://{P}-{C}-code-1.{N}.computers.hoody.com/api/v1/code`
- **Notes**: notebooks and pages for your thoughts and plans. `https://{P}-{C}-notes-1.{N}.computers.hoody.com/`
- **Scheduled jobs**: have your computer do something every hour, every day or every Monday on its own, set up from a simple page. `https://{P}-{C}-cron-1.{N}.computers.hoody.com/`
- **Databases**: SQLite databases ready for your apps and data, with a page to look at tables and run queries. `https://{P}-{C}-sqlite-1.{N}.computers.hoody.com/`
- **Notifications**: recent and live alerts from your computer. `https://{P}-{C}-n-1.{N}.computers.hoody.com/` (the slug is `n`, not `notifications`)

Then the ones that work in the background, without a page to open (no link; say you or the Agent can set them up on request):

- **Scripts as web endpoints**: save a script and it becomes a web address that anyone you share it with can call.
- **Public links**: put a website or app you run on it online at its own web address.
- **Built-in AI**: a free AI model that the apps on your computer can use, with no key and no sign-up.
- **Your own computer, connected** (only when it fits their goal; keep just the part that fits): see this computer's files as a drive on your own computer, put a program from your own computer online at a Hoody link, or let this computer use your home internet connection. Setup when they choose it: the `files` skill (mount), the `tunnel` skill (put a program online) and the `egress` skill (`hoody egress local start`, home connection).

Close with one line that invites them to open the Desktop or the Agent first, or, if they came with a task, one line saying you're starting on it now.

Remind them each link is also their access, so they should keep the links private. If the `hoody` CLI is installed (a Hoody computer or your own computer), `hoody open <terminal|notifications|desktop|browser|files|agent> --url` prints one for the selected computer; with the SDK, `hoody.getKitUrl('<kit>', computer)` builds it.

**Explain it simply:** *"This is your machine. It's a full Linux computer — it has a file system, can run programs and websites, and it stays on. Everything we do next happens inside it, and you reach each part by a link."*

---

## Step 3 — Hoody Agent (browser GUI): the best place to begin

This is the single best on-ramp, so make it prominent. **The Hoody Agent page is the AI agent's interactive interface in a browser terminal** (opening it starts the agent if needed), and it's the friendliest way for a human to hand work to their Hoody. Hand them the URL (fill in `P`/`C`/`N`):

```
https://{P}-{C}-agent-1.{N}.computers.hoody.com
```

Tell them: *"Open this in your browser and log in with the account you just made. This is your AI agent — from here you can hand tasks to an agent that works right inside your machine. To browse files, use the Files link; to edit code, use the Code editor link from the list above. It'll ask you to log in — keep this link private (don't post it publicly)."* They don't deal with tokens or setup — logging in wires everything up automatically. **If it asks them to log in and seems to "do nothing" after, have them wait a beat or refresh the page once.**

(For a developer, add: the computer's primitives — terminal, files, exec, browser, etc. — are all fully programmatic via the SDK/HTTP kits; the GUI is just one client of those same APIs.)

---

## Step 4 — Ship something live in under a minute (a website + a friendly link)

This is the "wow." **Anything you run on a port inside the computer is instantly public at a URL** — no deploy, no config, no proxy setup. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers. `python3 -m http.server` below binds `0.0.0.0` by default. Start a tiny web server and hand them the link:

```bash
# Start a simple site on port 8080 inside their computer (the terminal kit URL is itself the credential).
# Write to /tmp (world-writable) so it works whether the session runs as root or 'user'.
# The backgrounded server survives the ephemeral session — the kit keeps '&' jobs alive. Its PID is recorded in /tmp/web.pid for the clean-up at the end.
# terminal-0 is the "fresh session" host: the host index picks the session, and terminal-1 is the user's own shell.
curl -sX POST "https://{P}-{C}-terminal-0.{N}.computers.hoody.com/api/v1/terminal/execute?ephemeral=true" \
  -H 'Content-Type: application/json' \
  -d '{"command":"mkdir -p /tmp/site && echo \"<h1>Hello from my Hoody computer</h1>\" > /tmp/site/index.html && { nohup python3 -m http.server 8080 --directory /tmp/site >/tmp/web.log 2>&1 & echo $! > /tmp/web.pid; }","wait":false}'
```

It's now live at:

```
https://{P}-{C}-http-8080.{N}.computers.hoody.com
```

Have them click it. Let that land: *"You just put a website on the internet in one step. No hosting account, no deploy — you ran it, and it got a URL."* (If the page doesn't load on the very first click, give it a couple of seconds for the server to come up, then refresh — it's just warming up. Still down after ~10s? Read the server's log yourself — `curl https://{P}-{C}-files-1.{N}.computers.hoody.com/api/v1/files/tmp/web.log` — and fix what it names (port already in use → pick another port; `python3` missing → install it or serve with another one-liner), then re-run the command. Don't leave them staring at a broken link.)

**Then brand it (optional, great for non-devs to see):** turn the long auto-URL into a friendly name with a proxy alias. The alias must be lowercase letters/digits/hyphens, 3–61 chars, no leading/trailing hyphen (omit it and you'd get a random hex name, not a friendly one):

```bash
curl -sX POST "$A/api/v1/proxy/aliases" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"computer_id":"'"$C"'","program":"http","index":8080,"alias":"their-slug","allow_path_override":true}'
# → the response's .data.url is the friendly link, e.g. https://their-slug.{N}.computers.hoody.com
```

Hand over `.data.url`.

---

## Step 5 — Teach Hoody Exec (a file *is* a URL)

Now show the magic trick developers love and newcomers find delightful: **with Hoody Exec, you write a little script and it instantly becomes a live web endpoint** — no server to run, no framework. Write a handler:

```bash
curl -sX POST "https://{P}-{C}-exec-1.{N}.computers.hoody.com/api/v1/exec/scripts/write" \
  -H 'Content-Type: application/json' \
  -d '{"path":"hello.js","content":"module.exports = (req, res) => res.json({ message: \"This file is a live URL!\", time: Date.now() });\n"}'
```

It's immediately callable at its own URL — **the filename (minus extension) becomes the URL path** (note this is a path on the exec kit, `.../exec-1.../hello`, not a separate subdomain):

```
https://{P}-{C}-exec-1.{N}.computers.hoody.com/hello
```

Explain it: *"You just wrote a few lines and they became a working web API — the file itself is the endpoint. That's Hoody Exec: instant little backends, webhooks, and tools, with nothing to deploy."* (For non-devs, frame it as "you can make small online tools just by writing a snippet, and I can do that for you whenever you need one.")

**If you turn this into an AI demo, leave the model alone or set it to `hoody-ai/hoody-free`.** By default the `exec` runtime gives every script `ai` / `model` / `generateText` bindings (names in the script's own scope, not globals); `ai` and `model` already point at that free model, so a script with no `// @ai-model` line works on a credit-less brand-new account. Naming a paid model here is the single easiest way to make onboarding look broken — see Step 7.

**Bonus, if it fits — call your own endpoint to prove it.** Hoody's GET-bridge (the computer's `curl` kit: `https://{P}-{C}-curl-1.{N}.computers.hoody.com/api/v1/curl/request?url=<urlencoded-target>`) lets you exercise an endpoint that wants a body: you can attach one via `data=`, `json=`, or `data_base64=` on a GET, add repeatable `header=` pairs, and **a body automatically upgrades the GET to a POST**. Handy for a quick live demo without leaving curl — just point it at the `/hello` URL above.

---

## Step 6 — Run a real desktop app in the cloud (Firefox), and explain *why*

Finish with something visceral: **a real graphical app running on their cloud computer, viewable in their browser.** Use Firefox. The key teaching point is the *pairing* — and it must be a **persistent** session (never ephemeral).

Do it in this order:

1. **Create a persistent terminal pinned to a display.** Use the number **100** for both, on purpose (more on why below):

```bash
curl -sX POST "https://{P}-{C}-terminal-100.{N}.computers.hoody.com/api/v1/terminal/create" \
  -H 'Content-Type: application/json' \
  -d '{"terminal_id":"100","display":":100","shell":"bash","user":"user"}'
```

This call can take **~20–30s** while the screen (a virtual X server) boots — **that's expected, not a hang. Wait it out.** **Do not retry-create** on a slow or timeout-looking response (re-creating an existing `terminal_id` answers success for the existing session and keeps the configuration it was created with; it does not apply the `display` you send); instead, when it returns, check both the HTTP status (add `-w '%{http_code}'`) and the JSON body. Continue only when the response is 2xx, `status` is `"ok"`, and `display_ready` is `true`. Most failures are a non-2xx status with a `{"error":"<message>","code":"<CODE>"}` body, but a display-readiness timeout returns HTTP 200 with `"status":"error"` and `"code":"timeout"`; do not treat that response as success. Pinning `display:":100"` requests readiness waiting when the display can start; a successful response can still have `display_ready: false`, so check that field before launching Firefox. Use 100 only if that ID is unused: if it is taken, pick another unused ID from 1–1600 and use that number consistently in the create body, the terminal host, the `display` value and the display link; do not delete an existing session to reuse its number.

2. **Launch Firefox inside that session** — call the `terminal-100` host: the host index IS the session (the proxy overwrites any `?terminal_id=` from it, so a `terminal-1` URL would run Firefox in session 1). Background it with `&` so the shell stays free. First confirm Firefox is installed — if `which firefox` is empty, install it (`sudo apt-get update && sudo apt-get install -y firefox-esr`):

```bash
curl -sX POST "https://{P}-{C}-terminal-100.{N}.computers.hoody.com/api/v1/terminal/execute" \
  -H 'Content-Type: application/json' \
  -d '{"command":"firefox &","wait":false}'
```

3. **Hand them two links, and explain each:**
   - **The shell, live in the browser** — *"this is the actual terminal you just used, watch it run"* (the session id is in the address — session 100 → `terminal-100`):
     ```
     https://{P}-{C}-terminal-100.{N}.computers.hoody.com
     ```
   - **The app itself** — *"this is Firefox, running on your cloud computer, on screen 100":*
     ```
     https://{P}-{C}-display-100.{N}.computers.hoody.com
     ```
   Before you tell them "it's running," open the `display-100` URL yourself (or screenshot it) to confirm Firefox actually drew. **If it's blank, don't declare victory and don't panic — give it a few seconds (graphical apps take a moment to paint), then re-check `which firefox` and re-run the launch if needed.** Only hand the link over once you've seen it draw.

**Now explain the *why* (this is the lesson, keep it simple):**

> A graphical app needs a *screen* to draw on, and a *shell* to launch it from. Hoody pairs them by the number you choose, so we used **100** for both. So we made terminal **100**, told it to use screen **`:100`**, started Firefox there, and watched it on the **`display-100`** link. terminal 100 → screen :100 → display-100 URL: one number, all the way through. We picked **100** because it's a clean, memorable slot of our own (the low screens 0–3 are often already in use), and seeing the same number everywhere makes the connection obvious.

> **Why not a throwaway command?** A one-off (ephemeral) command has no screen attached at all — graphical apps would silently fail to appear. That's why we created a *persistent* session with the screen set explicitly. The screen has a life of its own: it keeps running after the session is deleted, for other sessions and for the display link.

(For a developer, name it precisely: `terminal_id N ↔ DISPLAY=:N ↔ display-N` URL; ephemeral sessions strip `DISPLAY` unconditionally; pick `terminal_id` in 1–1600 (a new session takes 1–9999, but with the default bands 1601–4500 back desktops, 4501–5000 back agents and are refused on a `terminal-N` host, 5001–7999 is the ephemeral auto-ID pool and 8001–9999 is used by Hoody Run and the Hub); and the pairing is never automatic — always pass `display` explicitly on create, as we did.)

---

## Step 7 — Three things that make Hoody *yours* (mention, don't belabor)

Briefly plant these so they know Hoody works *for* them even when they're away:

- **Hoody can reach you, anywhere.** You (the agent) can send them a notification that pops up on their phone, desktop, or smartwatch — they just open one page once and leave it in the background. Great for "your task is done." (See the `notifications` skill.)
- **You can hand work to an agent in the cloud.** They can delegate a whole coding task to an AI agent running inside their computer and come back to the result. (See the `agent` skill.)
- **AI is built in — no keys to manage.** Anything running inside their computer can call `https://ai.hoody.com/api/v1` (OpenAI-compatible) without a real API key: send `Authorization: Bearer computer-<anything>` (e.g. `computer-demo`). A bearer is required; one starting `computer-` (or the legacy `container-`) uses Hoody's key, any other value is used as their own provider key. Want their own ChatGPT-style UI? Set up OpenWebUI in their computer pointed at that URL and it just works. (Scripts get it even easier — see the `exec` skill's built-in `ai` helpers.)

> **If you demo AI, the model is `hoody-ai/hoody-free`. Nothing else.** A brand-new account has **zero AI credit** — `GET https://api.hoody.com/api/v1/wallet/balances/ai` returns `ai_limit: "0.00"`, `ai_remaining: "0.00"`. That is the normal starting state, not something they did wrong. Every **paid** model — everything listed by `GET /api/v1/ai/models`, e.g. `deepseek/…` — is refused until they top the wallet up, and the refusal reads like a broken product. `hoody-ai/hoody-free` needs no credit, no key and no top-up: it is the computer's built-in free tier, and it's already the default for `exec` scripts, so a script with **no** `// @ai-model` line is free by construction. Only pick a paid model if you have actually read `ai_remaining` and it is non-zero and `ai_usage_status` is `live` (`unavailable` means the amount is unknown, not spendable) — or, when your token is limited to realms and the balance read answers `403 REALM_TOKEN_ACCOUNT_MONEY` (credit unknown, not zero), only if the user asked for that model; if the AI service then refuses it for lack of credit, they add credit from a signed-in session. Do not retry the balance read. If they ask about the paid catalogue, present it as an optional upgrade — never as something they must buy to finish onboarding.

Offer to set either up if it fits what they told you in Step 0 — but don't push; these are seeds, not steps.

---

## Step 8 — Leave them able to go deeper on their own

- **Ask Hoody anything, anytime:** the docs assistant answers any "how do I…" over a single HTTP call — no login:
  ```bash
  curl -s https://chatbot.hoody.com/mcp -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_hoody_docs","arguments":{"question":"How do I expose a port?"}}}'
  ```
  (Pipeline failures come back as HTTP-200 with `isError: true` — that's a *result field*, not an HTTP error, so check for it rather than trusting the 200; if MCP is unavailable, `POST https://chatbot.hoody.com/api/chat` is the SSE fallback.) Tell them they (or any agent they use) can always ask this.
- **The full skill set** lives at `https://hoody.com/SKILLS/` — start with `SKILL.lite.md`, then `INDEX.md` to find the right namespace.

---

## Close the loop

Recap only what you verified, in their language, with each URL: their computer, plus whatever you actually built or ran (their task's result first). Then say what's left of their task and what unblocks it. Never claim steps you skipped. If they'd rather tidy up the demo bits, offer it: delete the alias (`DELETE $A/api/v1/proxy/aliases/<alias-id>` with the bearer token), drop the demo session (`DELETE https://{P}-{C}-terminal-{ID}.{N}.computers.hoody.com/api/v1/terminal/{ID}`, with the session ID the demo used in both the host and the path — takes Firefox down with it), and stop the toy site only by the PID recorded when it was started (`kill -- "$(cat /tmp/web.pid)"` via an ephemeral command; if no PID was recorded, leave it running rather than killing by name). Everything else costs them nothing while idle.

Then go back to their task if they gave one (or say what's left of it and what unblocks it); otherwise ask what they'd like to do next as a short pick-one list.

**Your north star throughout:** every step ends with the user *clicking something real* and understanding *why it matters to them*. If at any point they seem lost, slow down, drop the jargon, and do the next step for them. And whenever something's slow or stalls, **name the expected wait or take the named fallback — keep momentum, never leave them in silence.**