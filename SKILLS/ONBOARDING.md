> _**guided onboarding skill (agent-directed)** · ~8,521 tokens · hoody-sdk v1.0.0-beta.17_

# Hoody — Onboarding (a brief for the agent running this)

**You are an agent. A person just asked you to onboard them onto Hoody.** This is not a document to read aloud — it's your director's brief. Your job is to *walk them through actually using Hoody*, doing the work for them via the API and explaining as you go. You have wide latitude in *how* you do it; what follows is the destination and the accurate steps to get there. Be warm, concrete, and brief. **Show, don't lecture — do the work, then hand them a link to click.**

> **Can you make HTTP POST requests?** You'll need them at almost every step. If your only tool is GET-only fetch, stop and tell the user: *"To set this up for real I need a shell with `curl` or the Hoody SDK — want me to give you copy-paste commands instead?"* Don't fake your way through with GET-only calls; offer the copy-paste path and keep going from there.

> **Online? Use HTTP.** In a web chat (ChatGPT, claude.ai, …) or a throwaway code sandbox that is not a Hoody container or the user's own computer, use the HTTP calls in every step below, never the `hoody` CLI: it isn't installed there, a login made there does not last, and it isn't the user's machine. Don't install it with npx or the install script either. The CLI is for Hoody containers (preinstalled) and the user's own computer; if unsure, run `command -v hoody`, and if it is missing, stay on HTTP.

> **Golden rule for not getting stuck:** every step below has an expected slow moment or a known fallback. When something is slow, *say so warmly and wait* — don't retry blindly. When something genuinely fails, take the named fallback and keep moving. Never leave the user staring at silence, and never loop a rate-limited call.

---

## The idea to land first (say it in your own words)

Before any steps, make them *feel* what Hoody is:

> **A life with Hoody is a life without friction.** Your computer lives on the web. It's a real, full Linux machine — but you reach it from any device by a link. Nothing to install. Nothing to set up. Nothing to keep in sync. Close your laptop, open your phone, it's all still there, running. No more "it works on my machine," no more switching between systems, no more lost setups. You spin one up, you fill it with whatever you need, and it's just… there, durable, reachable, forever a URL away.

Make it relatable to *them* (see "read the room" below). For a non-technical person: *"It's like having a powerful computer that lives in your browser — you never install anything, and it's reachable from anywhere by a link, like a Google Doc, except it's a whole computer you control."* For a developer: *"Account-owned cloud Linux boxes (systemd + root, not Docker sandboxes), every capability exposed at a predictable URL — files, shells, GUIs, HTTP services, databases, AI coding agents — one token across SDK/HTTP/CLI."*

---

## Read the room first (this changes everything)

**Step 0, always:** before you touch the API, get a quick read on who you're helping — and make it *effortless* for them. Don't open with essay questions; ask **a few quick multiple-choice questions** they can answer just by picking an option. Keep it to one small, friendly batch (never a wall), and tell them up front it's so you can tailor everything to them. "A bit of each" or "you pick" is always a fine answer.

Ask roughly these (phrase them warmly, in your own words, and *show the options* so they only have to choose):

1. **Who are you, roughly?**
   (a) A developer / technical · (b) Not technical — I just want it to work · (c) Somewhere in between, happy to learn
2. **What would you love to do first?**
   (a) Put a website online · (b) Run an app — a browser or desktop tool — in the cloud · (c) Write code with an AI agent · (d) Just explore and see what Hoody can do
3. **How do you like to be helped?**
   (a) Just do it for me and show me the result · (b) Do it, but explain each step as you go · (c) Let me drive — you advise
4. **How much have you worked with servers or the cloud before?**
   (a) A lot · (b) A little · (c) None, and that's fine

If they skip one or say "you choose," infer sensibly and move on — this is a 20-second read of the person, not an intake form.

**Then save what you learned — don't skip this.** If you have any persistent memory or notes capability, write a short **user profile** right now: their technical level, what they want to do, how they like to be helped, their server/cloud experience, and anything else they reveal (their name, timezone, the project on their mind, their tone). Keep updating it as the session goes. This is what makes onboarding feel personal instead of scripted — and if you're an agent that remembers across sessions, it means next time you already *know them* and can skip straight to what matters. (The Hoody agent has a built-in memory for exactly this — use it.)

Now tailor **everything** that follows to that profile:

| If they're… | Then you… |
|---|---|
| **Not technical** | Use plain language and analogies. Do every step *for* them. Never show raw JSON unless asked. Hand them **URLs to click** and describe what they'll see. Celebrate each small win. |
| **A developer** | Move faster, show the actual calls (curl/SDK), explain the model, and let them drive if they want. Point them at the deeper skills early. |
| **In between / learning** | Do the work for them, but show the call and a one-line "here's what that did" so they pick it up by watching. |

Throughout: **keep asking in small batches, and prefer pick-one options over open questions** wherever you can — it's lower effort for them and easier for you to act on. After every step, give them **something real to click**. Check they're with you before moving on — a quick *"see it? good — next up…"* keeps the pace human and catches a stuck user early.

---

## How auth works (so your calls succeed)

- **Control plane** — `https://api.hoody.com` — needs `Authorization: Bearer <token>` (you get the token at sign-in).
- **Per-container kit URLs** — `https://{P}-{C}-{kit}-{n}.{N}.containers.hoody.com` — the **URL itself is the credential**; just call it. (`{P}`=project id, `{C}`=container id, `{N}`=server name, from the container's details.)
- The `agent` kit (host `…-agent-1.…`) works the same way — the kit URL is the credential; it needs **no** container claim or extra auth headers. (The **Hoody Agent browser GUI** on the same `-agent-1` host opens in a browser and signs the user in for the interactive UI; the HTTP API needs nothing beyond the kit URL.) The `bot` kit's management routes need no account token either, so gate its URL with proxy permissions.

Keep the user's token in memory for the session; don't paste it into chat or anywhere public. **If any control-plane call returns 401, your token is missing or stale — sign them in again through the browser (Step 1) rather than retrying the failing call.**

---

## Step 1 — Sign them in through their own browser

**Never ask for their password, a two-factor code or a token in chat.** They sign up and sign in on Hoody's own pages; you receive the session straight from the API.

**New to Hoody?** Ask them to open `https://api.hoody.com/auth/signup`, create the account there and click the verification link in their email, then tell you when they're done (mention the spam folder if a minute passes). **This is a hard pause: an account can't sign in until the link is clicked.** If the page says registration is closed, tell them plainly; people who already have an account can still sign in. (`https://hoody.com/signup` only joins a waitlist; it does not create an account.)

**Then sign them in** (the full reference is § Login in `https://hoody.com/SKILLS/SKILL-HTTP.md`; if the `hoody` CLI is installed (a Hoody container or your own computer, never a web chat or throwaway sandbox), `hoody login --web --no-browser` does all of this and prints the link and code for you):

Run these as two separate commands, so the user gets the link before you start polling. Each command stands alone: carry the values over by hand.

```bash
# Start: prints device_code, user_code, verification_uri_complete, interval and deadline (epoch seconds).
curl -sS --max-time 20 -X POST https://api.hoody.com/api/v1/auth/device/code \
  -H 'Content-Type: application/json' -d '{"client_name":"<your name>","client":"agent"}' \
  | jq '.data + {deadline: ((now | floor) + .data.expires_in)}'
```

Now give them the link and the code together: *"Open this link, check that the page shows code `<user_code>`, then sign in and approve. If you didn't ask me to sign you in, choose Don't authorize."* The page shows the `client_name` you sent and marks it as unverified, so name yourself plainly. Then poll; one run lasts at most a minute and prints one line. While it prints `pending INTERVAL=… NEXT=…`, run it again with those two values (on the first run `NEXT` is `0`). `NEXT` carries a wait across runs: an HTTP 429 (which waits the `Retry-After` the API sends) can push the next poll past the end of a run.

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
      -H 'Content-Type: application/json' -d "{\"device_code\":\"$DEVICE\"}") || continue
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

On success the result holds `token` (use it as `$TOKEN` below) and `refreshToken`. Keep them for this session only: never repeat them in chat, never write them to a file yourself (the `hoody` CLI keeps its own session), never mint a long-lived token just for onboarding. The code lasts 15 minutes; After `slow_down` the poll interval is a fixed 5 seconds; it does not grow.

Branches to know:

- **`stopped: HTTP 400 access_denied`** — they chose Don't authorize. Respect it; ask before starting again.
- **`expired`, or `stopped: HTTP 400 expired_token`** — the 15 minutes ran out (or the code was already used). Start again and give them the new link.
- **The page says the email isn't verified** — they still need to click the link in their inbox, then sign in on the same page again. Start a fresh sign-in only if the page says the code expired.
- **Too many requests (`429`)** — the poll already waits and carries on; never run two polls or sign-ins at once.
- **`404` from the start call, or `stopped: HTTP 404`** — browser sign-in is off on this deployment. Only then, and only if they choose it, fall back to a password login they run themselves: in their own terminal, `hoody login --password` prompts for their email or username and then their password without echoing it, and keeps the session in that machine's CLI config. If you can't use their terminal, tell them sign-in can't finish from chat. Never collect the password in chat or ask them to paste a token.

**Tell them what just happened:** they now own a Hoody account, and Hoody is normally provisioning a free server + first container for them in the background, at no cost — no "rent a server" step. On a deployment that requires an invite code for the free server, that step waits for the code (Step 2 covers it). We'll confirm it's ready in the next step. That's the no-friction promise in action.

---

## Step 2 — Meet their first container (confirm it's ready)

A **container** is their computer in the cloud. Hoody normally provisions a default one right after email verification, but that happens **in the background and can take a moment** (occasionally it needs a nudge, and on an invite-only deployment it needs an invite code first). So **confirm it's ready before doing anything else** — poll until a default container is `running` and has its coordinates (`project_id` = `P`, `id` = `C`, `server_name` = `N`, needed for every URL later):

```bash
# Repeat every few seconds until this prints a row with status "running":
curl -s "https://api.hoody.com/api/v1/containers" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data.containers[] | select(.is_default) | {C:.id, P:.project_id, N:.server_name, status}'
```

An empty result or a non-`running` status early on is **completely normal** — keep waiting and reassure them ("setting up your computer, almost there"). Don't treat the empty result as a failure; it usually means provisioning is still in flight. If it's still missing after ~30–60s, nudge provisioning once, then keep polling:

```bash
curl -sX POST "https://api.hoody.com/api/v1/users/me/retry-setup" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}'
# rate-limited to ~1/min — wait between attempts, don't fire it repeatedly
```

**If that call answers `403` with `FREE_TIER_INVITE_REQUIRED`**, waiting will not help: free servers are currently handed out by invite code. Ask them for their invite code and redeem it — a successful redeem unlocks the account and tries to claim the free server — then resume polling:

```bash
curl -sX POST "https://api.hoody.com/api/v1/users/me/redeem-invite" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"code":"<their-invite-code>"}'
```

If the redeem answers `200` with `data.claim_blocked_reason: "pool_empty"`, the code worked but no server was free: wait a minute, call `retry-setup` again (it is rate-limited), and poll once it succeeds.

No invite code? Stop here and tell them plainly that the free server is invite-only right now; don't keep polling.

**If `retry-setup` answers `200` with `data.blocked_reason: "support_required"`**, stop polling: Hoody support has to restore their default container before setup can continue, and calling `retry-setup` again will not change that. Tell them so plainly.

**If the container shows up but its status is `stopped` or `paused`** — waiting won't fix that; do it yourself, then resume polling until `running`. A `stopped` container is started; a `paused` one is resumed (a container must be stopped to be started):

```bash
# status "stopped":
curl -sX POST "https://api.hoody.com/api/v1/containers/$C/start" \
  -H "Authorization: Bearer $TOKEN"
# status "paused" — use this instead:
curl -sX POST "https://api.hoody.com/api/v1/containers/$C/resume" \
  -H "Authorization: Bearer $TOKEN"
# fresh boots can take 10–60s to reach "running" — keep polling, reassure them
```

**Do not start the kit-URL steps below until you have `C`, `P`, `N` and `status:"running"`.** Every later URL is built from these three values, so a missing one here means broken links later — it's worth the wait.

**Hand over the links, as a showcase of what their new computer comes with.** Whenever a container is new to the user (this first one, and every one you create for them later), send them one friendly chat message that shows what is already on it. Make it easy to scan: one line per program, each with an emoji icon, a short plain name, one line on what they can do with it, and its link where it has a page to open. Build each link from `P`, `C`, `N`; a link opens its web page at `/`. Keep it short and free of jargon: say "computer", not "container" or "kit", and leave out slugs, ports and API words. Reword the lines to the person you read in Step 0, but keep the icons and the order.

Open with the programs that have a page of their own:

- 🖥️ **Desktop**: a full graphical computer in a browser tab, like sitting at a real screen. `https://{P}-{C}-desktop-1.{N}.containers.hoody.com/` (`display-1` is the plain viewer of one display)
- ⌨️ **Terminal**: type commands on your computer, right in the browser. `https://{P}-{C}-terminal-1.{N}.containers.hoody.com/`
- 🌐 **Browser**: a real web browser that runs in the cloud; its page links to its screen and developer tools. `https://{P}-{C}-browser-1.{N}.containers.hoody.com/`
- 📁 **Files**: see, upload and download everything stored on your computer. `https://{P}-{C}-files-1.{N}.containers.hoody.com/`
- 🤖 **Agent**: an AI helper that works inside your computer (Step 3). `https://{P}-{C}-agent-1.{N}.containers.hoody.com/`
- 💻 **Code editor**: VS Code in a tab, for writing and running code. `https://{P}-{C}-code-1.{N}.containers.hoody.com/api/v1/code`
- 📝 **Notes**: notebooks and pages for your thoughts and plans. `https://{P}-{C}-notes-1.{N}.containers.hoody.com/`
- ⏰ **Scheduled jobs**: have your computer do something every hour, every day or every Monday on its own, set up from a simple page. `https://{P}-{C}-cron-1.{N}.containers.hoody.com/`
- 🗄️ **Databases**: SQLite databases ready for your apps and data, with a page to look at tables and run queries. `https://{P}-{C}-sqlite-1.{N}.containers.hoody.com/`
- 🔔 **Notifications**: recent and live alerts from your computer. `https://{P}-{C}-n-1.{N}.containers.hoody.com/` (the slug is `n`, not `notifications`)

Then the ones that work in the background, without a page to open (no link; say you or the Agent can set them up on request):

- ⚡ **Scripts as web endpoints**: save a script and it becomes a web address that anyone you share it with can call.
- 🔗 **Public links**: put a website or app you run on it online at its own web address.
- ✨ **Built-in AI**: a free AI model that the apps on your computer can use, with no key and no sign-up.

Close with one line that invites them to open the Desktop or the Agent first.

Remind them each link is also their access, so they should keep the links private. If the `hoody` CLI is installed (a Hoody container or your own computer), `hoody open <terminal|notifications|desktop|browser|files|agent> --url` prints one for the selected container; with the SDK, `hoody.getKitUrl('<kit>', container)` builds it.

**Explain it simply:** *"This is your machine. It's a full Linux computer — it has a file system, can run programs and websites, and it stays on. Everything we do next happens inside it, and you reach each part by a link."*

**Optional, and a lovely "aha" — put their files right on their own computer.** Don't wait to be asked — *proactively propose it*: e.g. *"Want me to make your container's files show up as a regular drive on your own computer, like a USB stick?"* The files kit speaks **WebDAV** at `https://{P}-{C}-files-1.{N}.containers.hoody.com/` — **Windows:** Map network drive (built-in WebClient service; ~50 MB per-file limit); **macOS:** Finder → Go → Connect to Server; **Linux:** `davfs2`; **any OS / scripted, on their own computer:** `hoody mount "https://{P}-{C}-files-1.{N}.containers.hoody.com/" "<localDir>"` (needs the `hoody` CLI — `curl -fsSL https://install.hoody.com | sh` — plus `rclone` on PATH; passing the Files URL needs no account lookup and no extra CLI login; optional flags: `--read-only`, and on Linux/macOS `--background`; on Windows keep the mount running in a foreground terminal, and the CLI prints what to install if the filesystem driver is missing). On most setups the URL alone works; **if the mount prompts for credentials or 401s**, the proxy is gating it — use `hoody mount … --auth-token-file <file>` or just use the Files page from Step 2. Offer it, keep it optional, and move on rather than troubleshooting at length. (Full prerequisites/auth live in the `files` skill.)

---

## Step 3 — Hoody Agent (browser GUI): the best place to begin

This is the single best on-ramp, so make it prominent. **The Hoody Agent page is the AI agent's interactive interface in a browser terminal** (opening it starts the agent if needed), and it's the friendliest way for a human to hand work to their Hoody. Hand them the URL (fill in `P`/`C`/`N`):

```
https://{P}-{C}-agent-1.{N}.containers.hoody.com
```

Tell them: *"Open this in your browser and log in with the account you just made. This is your AI agent — from here you can hand tasks to an agent that works right inside your machine. To browse files, use the Files link; to edit code, use the Code editor link from the list above. It'll ask you to log in — keep this link private (don't post it publicly)."* They don't deal with tokens or setup — logging in wires everything up automatically. **If it asks them to log in and seems to "do nothing" after, have them wait a beat or refresh the page once.**

(For a developer, add: the container's primitives — terminal, files, exec, browser, etc. — are all fully programmatic via the SDK/HTTP kits; the GUI is just one client of those same APIs.)

---

## Step 4 — Ship something live in under a minute (a website + a friendly link)

This is the "wow." **Anything you run on a port inside the container is instantly public at a URL** — no deploy, no config, no proxy setup. It must listen on `0.0.0.0` (not only `127.0.0.1`); `python3 -m http.server` below does by default. Start a tiny web server and hand them the link:

```bash
# Start a simple site on port 8080 inside their container (the terminal kit URL is itself the credential).
# Write to /tmp (world-writable) so it works whether the session runs as root or 'user'.
# The backgrounded server survives the ephemeral session — the kit keeps '&' jobs alive.
# terminal-0 is the "fresh session" host: the host index picks the session, and terminal-1 is the user's own shell.
curl -sX POST "https://{P}-{C}-terminal-0.{N}.containers.hoody.com/api/v1/terminal/execute?ephemeral=true" \
  -H 'Content-Type: application/json' \
  -d '{"command":"mkdir -p /tmp/site && echo \"<h1>Hello from my Hoody computer 🚀</h1>\" > /tmp/site/index.html && nohup python3 -m http.server 8080 --directory /tmp/site >/tmp/web.log 2>&1 &","wait":false}'
```

It's now live at:

```
https://{P}-{C}-http-8080.{N}.containers.hoody.com
```

Have them click it. Let that land: *"You just put a website on the internet in one step. No hosting account, no deploy — you ran it, and it got a URL."* (If the page doesn't load on the very first click, give it a couple of seconds for the server to come up, then refresh — it's just warming up. Still down after ~10s? Read the server's log yourself — `curl https://{P}-{C}-files-1.{N}.containers.hoody.com/api/v1/files/tmp/web.log` — and fix what it names (port already in use → pick another port; `python3` missing → install it or serve with another one-liner), then re-run the command. Don't leave them staring at a broken link.)

**Then brand it (optional, great for non-devs to see):** turn the long auto-URL into a friendly name with a proxy alias. The alias must be lowercase letters/digits/hyphens, 3–61 chars, no leading/trailing hyphen (omit it and you'd get a random hex name, not a friendly one):

```bash
curl -sX POST "https://api.hoody.com/api/v1/proxy/aliases" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"container_id":"'"$C"'","program":"http","index":8080,"alias":"their-slug","allow_path_override":true}'
# → the response's .data.url is the friendly link, e.g. https://their-slug.{N}.containers.hoody.com
```

Hand over `.data.url`.

---

## Step 5 — Teach Hoody Exec (a file *is* a URL)

Now show the magic trick developers love and newcomers find delightful: **with Hoody Exec, you write a little script and it instantly becomes a live web endpoint** — no server to run, no framework. Write a handler:

```bash
curl -sX POST "https://{P}-{C}-exec-1.{N}.containers.hoody.com/api/v1/exec/scripts/write" \
  -H 'Content-Type: application/json' \
  -d '{"path":"hello.js","content":"module.exports = (req, res) => res.json({ message: \"This file is a live URL!\", time: Date.now() });\n"}'
```

It's immediately callable at its own URL — **the filename (minus extension) becomes the URL path** (note this is a path on the exec kit, `.../exec-1.../hello`, not a separate subdomain):

```
https://{P}-{C}-exec-1.{N}.containers.hoody.com/hello
```

Explain it: *"You just wrote a few lines and they became a working web API — the file itself is the endpoint. That's Hoody Exec: instant little backends, webhooks, and tools, with nothing to deploy."* (For non-devs, frame it as "you can make small online tools just by writing a snippet, and I can do that for you whenever you need one.")

**If you turn this into an AI demo, leave the model alone or set it to `hoody-ai/hoody-free`.** The `exec` runtime pre-injects `ai` / `generateText` globals already pointed at that free model, so a script with no `// @ai-model` line works on a credit-less brand-new account. Naming a paid model here is the single easiest way to make onboarding look broken — see Step 7.

**Bonus, if it fits — call your own endpoint to prove it.** Hoody's GET-bridge (the container's `curl` kit: `https://{P}-{C}-curl-1.{N}.containers.hoody.com/api/v1/curl/request?url=<urlencoded-target>`) lets you exercise an endpoint that wants a body: you can attach one via `data=`, `json=`, or `data_base64=` on a GET, add repeatable `header=` pairs, and **a body automatically upgrades the GET to a POST**. Handy for a quick live demo without leaving curl — just point it at the `/hello` URL above.

---

## Step 6 — Run a real desktop app in the cloud (Firefox), and explain *why*

Finish with something visceral: **a real graphical app running on their cloud computer, viewable in their browser.** Use Firefox. The key teaching point is the *pairing* — and it must be a **persistent** session (never ephemeral).

Do it in this order:

1. **Create a persistent terminal pinned to a display.** Use the number **100** for both, on purpose (more on why below):

```bash
curl -sX POST "https://{P}-{C}-terminal-100.{N}.containers.hoody.com/api/v1/terminal/create" \
  -H 'Content-Type: application/json' \
  -d '{"terminal_id":"100","display":":100","shell":"bash","user":"user"}'
```

This call can take **~20–30s** while the screen (a virtual X server) boots — **that's expected, not a hang. Wait it out.** **Do not retry-create** on a slow or timeout-looking response (re-creating an existing `terminal_id` just returns success, but a second call will block again while the screen boots); instead, when it returns, check both the HTTP status (add `-w '%{http_code}'`) and the JSON body. Continue only when the response is 2xx, `status` is `"ok"`, and `display_ready` is `true`. Most failures are a non-2xx status with a `{"error":"<message>","code":"<CODE>"}` body, but a display-readiness timeout returns HTTP 200 with `"status":"error"` and `"code":"timeout"`; do not treat that response as success. Because we pinned `display:":100"`, a successful create returns only once the screen is ready, so Firefox will have something to draw on.

2. **Launch Firefox inside that session** — call the `terminal-100` host: the host index IS the session (the proxy overwrites any `?terminal_id=` from it, so a `terminal-1` URL would run Firefox in session 1). Background it with `&` so the shell stays free. First confirm Firefox is installed — if `which firefox` is empty, install it (`apt-get install -y firefox-esr`):

```bash
curl -sX POST "https://{P}-{C}-terminal-100.{N}.containers.hoody.com/api/v1/terminal/execute" \
  -H 'Content-Type: application/json' \
  -d '{"command":"firefox &","wait":false}'
```

3. **Hand them two links, and explain each:**
   - **The shell, live in the browser** — *"this is the actual terminal you just used, watch it run"* (the session id is in the address — session 100 → `terminal-100`):
     ```
     https://{P}-{C}-terminal-100.{N}.containers.hoody.com
     ```
   - **The app itself** — *"this is Firefox, running on your cloud computer, on screen 100":*
     ```
     https://{P}-{C}-display-100.{N}.containers.hoody.com
     ```
   Before you tell them "it's running," open the `display-100` URL yourself (or screenshot it) to confirm Firefox actually drew. **If it's blank, don't declare victory and don't panic — give it a few seconds (graphical apps take a moment to paint), then re-check `which firefox` and re-run the launch if needed.** Only hand the link over once you've seen it draw.

**Now explain the *why* (this is the lesson, keep it simple):**

> A graphical app needs a *screen* to draw on, and a *shell* to launch it from. Hoody pairs them by the number you choose, so we used **100** for both. So we made terminal **100**, told it to use screen **`:100`**, started Firefox there, and watched it on the **`display-100`** link. terminal 100 → screen :100 → display-100 URL: one number, all the way through. We picked **100** because it's a clean, memorable slot of our own (the low screens 0–3 are often already in use), and seeing the same number everywhere makes the connection obvious.

> **Why not a throwaway command?** A one-off (ephemeral) command has no screen attached at all — graphical apps would silently fail to appear. That's why we created a *persistent* session: the screen only exists because the session pinned it.

(For a developer, name it precisely: `terminal_id N ↔ DISPLAY=:N ↔ display-N` URL; ephemeral sessions strip `DISPLAY` unconditionally; pick `terminal_id` in 1–39999 (40000–65535 is reserved as the ephemeral auto-ID pool); and the pairing is never automatic — always pass `display` explicitly on create, as we did.)

---

## Step 7 — Three things that make Hoody *yours* (mention, don't belabor)

Briefly plant these so they know Hoody works *for* them even when they're away:

- **Hoody can reach you, anywhere.** You (the agent) can send them a notification that pops up on their phone, desktop, or smartwatch — they just open one page once and leave it in the background. Great for "your task is done." (See the `notifications` skill.)
- **You can hand work to an agent in the cloud.** They can delegate a whole coding task to an AI agent running inside their container and come back to the result. (See the `agent` skill.)
- **AI is built in — no keys to manage.** Anything running inside their container can call `https://ai.hoody.com/api/v1` (OpenAI-compatible) with no API key — the key field is just a tag like `container-demo`. Want their own ChatGPT-style UI? Set up OpenWebUI in their container pointed at that URL and it just works. (Scripts get it even easier — see the `exec` skill's built-in `ai` globals.)

> **If you demo AI, the model is `hoody-ai/hoody-free`. Nothing else.** A brand-new account has **zero AI credit** — `GET https://api.hoody.com/api/v1/wallet/balances/ai` returns `ai_limit: "0.00"`, `ai_remaining: "0.00"`. That is the normal starting state, not something they did wrong. Every **paid** model — everything listed by `GET /api/v1/ai/models`, e.g. `deepseek/…`, `openai/…`, `anthropic/…` — is refused until they top the wallet up, and the refusal reads like a broken product. `hoody-ai/hoody-free` needs no credit, no key and no top-up: it is the container's built-in free tier, and it's already the default for `exec` scripts, so a script with **no** `// @ai-model` line is free by construction. Only pick a paid model if you have actually read `ai_remaining` and it is non-zero. If they ask about the paid catalogue, present it as an optional upgrade — never as something they must buy to finish onboarding.

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

Recap what they now have, in their language: *"In a few minutes you went from nothing to: your own cloud computer, a website live on the internet, a little web tool you wrote, and a real browser running in the cloud — all reachable by a link, all still there when you come back. That's the whole idea — a setup that follows you everywhere with zero friction."* If they'd rather tidy up the demo bits, offer it: delete the alias (`DELETE https://api.hoody.com/api/v1/proxy/aliases/<alias-id>` with the bearer token), drop the demo session (`DELETE .../api/v1/terminal/100` on the terminal kit — takes Firefox down with it), and stop the toy site (`pkill -f "http.server 8080"` via an ephemeral command). Everything else costs them nothing while idle.

Then ask what they'd like to do next and keep going from there.

**Your north star throughout:** every step ends with the user *clicking something real* and understanding *why it matters to them*. If at any point they seem lost, slow down, drop the jargon, and do the next step for them. And whenever something's slow or stalls, **name the expected wait or take the named fallback — keep momentum, never leave them in silence.**