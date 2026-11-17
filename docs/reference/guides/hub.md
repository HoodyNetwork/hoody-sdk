# Hub guide

The Hub is the app for your Hoody account. It shows your computers, Bots, apps, programs, files, schedules, logs, billing and settings. It comes in three forms that draw the same pages: in a browser, as one HTML file, and in a terminal.

The [README](../../../README.md) has the quick start. This page covers how to get each form, how to sign in, the terminal keys, and what to do when the Hub does not open.

## The three forms

| Form | How to open it | Runs on |
|---|---|---|
| **Web Hub** | [hub.hoody.com](https://hub.hoody.com), or `/auth/home` on your API host (`https://api.hoody.com/auth/home`) | Any current browser |
| **One-file Hub** | Open `hoody-hub.html` from this package | Any browser, from disk, from `localhost` or from an `https` address |
| **Terminal Hub** | `hoody hub` | Linux on x86-64 and arm64: the standalone `hoody` binary, or the npm package with Node.js 26 or later |

All three use the same account API. A change you make in one shows in the others.

## Web Hub

Open [hub.hoody.com](https://hub.hoody.com) and sign in. You can also open `/auth/home` on the API host you use. There is nothing to install.

## One-file Hub

`hoody-hub.html` is the whole Hub in one file. It has no server of its own: it talks to your Hoody's API from wherever you open it.

### File and checksum

- **From this package.** It is at the package root, with its checksum in `hoody-hub.html.sha256`. After `npm install hoody-sdk` it is at `node_modules/hoody-sdk/hoody-hub.html`.
- **From your Hoody.** The web Hub offers the file for download. It is served at `/auth/hoody-hub.html` on the API host.

Check the file before you open it:

```bash
sha256sum -c hoody-hub.html.sha256
```

### Sign-in

The file knows its Hoody, so you never type an address. The copy in this package signs in to hoody.com. A copy downloaded from a Hoody's web Hub signs in to that Hoody.

When the page opens, it shows "Connecting to Hoody…" while it reads the Hoody's public settings. No credential is sent for that. Then the sign-in card offers three ways:

- **Email or user name and password.** When your account has two-factor authentication, a "Two-step check" asks for the code from your authenticator app, or a backup code.
- **Sign in on the Hoody's site.** Under "Other ways to sign in", the button names your Hoody's site. You finish the sign-in in a new tab, which also covers Google and GitHub accounts. Check that the tab shows the same code as the card before you approve.
- **Access key.** Under "Other ways to sign in", choose "Use an access key" and paste a key that starts with `hdy_`. The card shows the account and what the key opens, then asks "Open the Hub with this key?".

"Forgot password?" and "Create an account" work from the file too. Each sends you an email with a link; after that, you come back and sign in.

### Limits

- **Opened from disk, it keeps nothing.** A page opened as a `file://` file keeps your sign-in in memory only. Closing or reloading the page signs you out.
- **Payments open the web Hub.** Top-ups and other payments are not made from the file. The Hub links you to the web Hub for them.
- **An old file stops at the first screen.** When your Hoody needs a newer file, the page says "This Hub is out of date" and offers no sign-in. "Download the current Hub" gets the new file from the same Hoody; open that one instead.
- **It needs a secure page.** Sign-in works from `https`, from `localhost` and from a file on your computer. Anywhere else the page says "Open this page securely".
- **It must be opened on its own.** Shown inside another page, it offers no sign-in and says "Open this page on its own", with a link that opens it in a new tab.

## Terminal Hub

`hoody hub` draws the Hub full screen in your terminal, with the same pages as the web Hub.

### Installation

The terminal Hub runs on Linux on x86-64 and arm64. It is part of the standalone `hoody` binary. Install it with:

```bash
curl -fsSL https://install.hoody.com | sh
```

The installer checks the binary's signature and checksum before it installs it.

The npm package (`npm install -g hoody-sdk`) has the terminal Hub too, on the same two Linux platforms, with Node.js 26 or later. There, with an older Node.js or with Bun, `hoody hub` says it needs Node.js 26 or later, or the standalone binary, and shows the installer.

The binaries for macOS, Windows and Linux musl have no terminal Hub, and the npm package has none on other systems or on musl. There, `hoody hub` says so and gives the web Hub's address.

### Commands

```bash
hoody login          # once: the Hub uses the CLI's saved sign-in
hoody hub            # open your account
hoody hub --demo     # a sample account, kept in memory; nothing is sent
```

- **Realm.** `hoody hub --realm <id or name>` starts in that realm. Without it, the Hub uses `HOODY_REALM`, then `HOODY_REALM_ID`, then your profile's realm, then the realm your last run ended in.
- **Access keys.** An access key that is limited to realms starts in one of them: the first it lists, unless you name another with `--realm`.
- **Where it opens.** The Hub opens on the page your last run ended on.
- **Leaving** the Hub never signs the CLI out.

### Keys

Press `?` in the Hub for the full list, including the keys of the page you are on. `Ctrl+K` finds any page or action.

**Everywhere**

| Key | Does |
|---|---|
| `Ctrl+K` | Search or jump to anything |
| `/` | Search this page's list |
| `?` | Show the key list |
| `[` | Expand or collapse the sidebar (on a narrow terminal: open the page list) |
| `Alt+J` | Open or close Agent |
| `Alt+R` | Switch realm |
| `Alt+C` | Switch computer |

**Go to** (press `g`, then the letter)

| Keys | Page |
|---|---|
| `g` `h` | Home |
| `g` `c` | Computers |
| `g` `b` | Bots |
| `g` `a` | Apps |
| `g` `p` | Programs |
| `g` `s` | Schedules |
| `g` `l` | Logs |
| `g` `n` | Notifications |
| `g` `t` | Scripts |

**Lists and tables**

| Key | Does |
|---|---|
| `j` / `k` | Move down or up |
| `Enter` | Open the row |
| `Space` | Select the row |
| `.` | Open the row's menu |
| `\` | Hide or show the list beside a detail |
| `Esc` | Close the detail or overlay |

**Leaving**

| Key | Does |
|---|---|
| `q` | Leave the Hub. It asks first when work is running or something is unsaved. It does nothing while you type in a field. |
| `Ctrl+C` | Asks the same as `q`. A second `Ctrl+C` soon after leaves without asking. |
| `Ctrl+Z` | Suspends the Hub to your shell. |

`Alt+J` replaces the web Hub's `Ctrl+J`, which a terminal sends as a line feed.

### Terminal size

Every page is laid out for 80 columns by 24 rows and up. From 100 columns it shows the sidebar; below that, `[` opens the page list as a menu. From 120 columns Agent opens as a pane beside the page; below that it covers the page.

This is the Home page at 80 by 24, with sample data:

```text
 ≡  ▐━▌ HOODY  Home                        ◆ Personal ▾  ● atlas ▾  [A]  ^K · ?
 Good morning, Ada                               [i What is Hoody?] [Customize]
 ■ Personal · ✓ atlas (Running) · SG n12

 ┌───────────────────────────────────────────────────────────────────────────┐█
 │ │ Ask atlas to…                                                      Ask  │█
 │                                                                           │█
 │ [Install the popular coding agents] [Keep my app running after restarts]  │█
 │ [What is running on atlas?] [Back up my files daily] [Create a bot that…] │█
 └───────────────────────────────────────────────────────────────────────────┘█
 ┌────────────────────────────────────┐ ┌────────────────────────────────────┐█
 │ Start something                    │ │ Your realms                        │█
 │                                    │ │ Each realm is a separate space.    │█
 │ New Bot           Open the Board   │ │ Pick one to see only its           │█
 │ Assistants that   Programs,        │ │ computers.                         │▀
 │ work on your      terminals and    │ │    All realms                      │
 │ computers         displays side by │ │  █ Personal   Showing 3 computers  │
 │                   side             │ │  █ Acme client        3 computers  │
 │                                    │ │  █ Lab                2 computers  │
 │ New script        New schedule     │ │                                    │
 │ Saved commands    Run something    │ │                                    │
 │ you can run       every hour, day  │ │                                    │
 │ again             or week          │ │                                    │
 Tab move · Enter open · Ctrl+K commands · ? keys · q quit
```

The top row holds the page title, the realm and computer switchers, your account and a key hint. The last row lists the main keys.

## Troubleshooting

| You see | What it means | What to do |
|---|---|---|
| `The terminal Hub needs Node 26 or later, or the standalone hoody binary.` | You ran `hoody hub` from the npm package on Linux x86-64 or arm64 with an older Node.js, or with Bun. | Run it with Node.js 26 or later, or install the binary with the command the message shows. The web Hub works too. |
| `The terminal Hub is not available on this platform yet.` | This `hoody` has no terminal Hub for your system (for example macOS, Windows or Linux musl). | Use the web Hub or the one-file Hub. |
| `The terminal Hub needs an interactive terminal.` | `hoody hub` ran in a pipe, a script or CI. | Run it in a terminal window. |
| `The sample account has its own realms: --realm does not apply to --demo.` | `--demo` and `--realm` were given together. | Drop `--realm`. |
| A message asking you to run `hoody login` | There is no saved sign-in, or it cannot be renewed. | Run `hoody login`, then `hoody hub` again. |
| The one-file Hub signs you out when you reload it | It was opened from disk, so it keeps nothing. | Open it from `localhost` or an `https` address to stay signed in. |
| `This Hub is out of date` | Your Hoody needs a newer one-file Hub. | Press "Download the current Hub", then open the new file. |
| `Can't reach Hoody` | The one-file Hub got no answer from your Hoody. | Check your connection, then press "Try again". |
| `Hoody can't open this Hub right now` | Your Hoody answered, but not with its Hub settings. | Wait a moment, then press "Try again". |
| `Open this page securely` | The one-file Hub was opened from a plain `http` address. | Open it from an `https` address, from `localhost`, or as a file. |
| `Open this page on its own` | The one-file Hub is shown inside another page, where sign-in is off. | Press "Open in a new tab". |
