# Changelog

All notable changes to `hoody-sdk` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/).

## [1.0.0-beta.8] — 2026-07-27

### Added

- **`ramdisk_scope` on container create and update.** `container` (the default) keeps `/ramdisk` private to that container; `project` additionally mounts `/ramdisk/project`, shared with your other containers in the same project **on the same server** — a RAM disk is memory on one machine, so it cannot span servers. It is refused when the project has other members.
- **Ramdisk figures in container stats.** A new `ramdisk` block reports the sharing scope, the shared pool ceiling, whether any of that ceiling is held for you (`capacity_reserved`, always `false` — the pool is first-come, first-served, so it is not a denominator for a usage bar), and measured bytes per scope. The container **list** endpoint never measures, so its `usage` is `null` — that means "not measured", not "empty".
- **`invite_code` on GitHub and Google sign-in.** Both provider redirects now accept the invite code from a signup link, so a coupon captured by your own signup page survives the round trip to the provider and applies to the new account. Only a hash of the code travels in the OAuth state.

### Fixed

- **`hoody exec` wrote where the SDK does not read.** Commands in namespaces that take no explicit instance id resolved to service index `0`, while the SDK uses `1`. For `exec` that index *is* the namespace, so a script written through the CLI landed under `default/0/` and was invisible to the matching SDK call. Every namespace now defaults to `1`; an explicit `--…-id` still wins.
- **`hoody shell -- <command>` ran inside your interactive terminal.** One-shot commands now get a session of their own instead of executing in terminal 1 and inheriting its state.
- **`--terminal-id` was silently ignored.** The id was sent as a query parameter that the container gateway overwrites, so every session landed on terminal 1 regardless. It now travels where it takes effect: `--terminal-id 3` attaches to terminal 3. The same fix applies to the SDK's terminal helpers — SSH, local, desktop, and remote command execution — where a `terminal_id` option was dropped the same way, and to the connect URL returned after creating a session, which pointed at a fresh ephemeral terminal instead of the session just created.
- **Agent event streams resolved a different address than every other agent command** — index `0` instead of the singleton the rest of the CLI uses.

### Changed

- **`ramdisk` is now described accurately.** It read as a private allocation of up to half the host's memory that persisted across container reboots. In fact `/ramdisk` draws on a shared per-server pool — 512 MiB by default, never more than half the server's memory, shared with your other containers on that server — and its contents are **lost on a host reboot**, which is what makes it suitable for secrets and scratch data that must not reach disk. It counts against memory, not disk.
- Reference documentation regenerated for this release.

## [1.0.0-beta.7] — 2026-07-27

### Fixed

- **The incoming-shares example described a response the API never returns.** The receiver's view of a storage share leaves out the sharer's `alias`, `label`, `description` and `expiry_notified`, and the endpoint documents that — but its example response still listed all four. Anyone writing against that example was expecting four fields that never arrive. The example now matches the real payload, and the omitted field is described as the expiry-notification flag it actually is.

## [1.0.0-beta.6] — 2026-07-26

### Fixed

- **`isRetryableApiError` no longer breaks type narrowing.** The guard claimed to prove `ApiError`, so TypeScript read the negative branch as impossible and this ordinary check would not compile:

  ```ts
  if (isApiError(err) && !isRetryableApiError(err)) {
    console.log(err.status); // 'status' does not exist on type 'never'
  }
  ```

  It now narrows to `RetryableApiError`, so both branches type correctly — including when the value is a union such as `ApiError | null`.

### Added

- **`RetryableApiError` and `RetryableStatus` types**, exported from both the package root and the browser entry, so you can name what `isRetryableApiError` proves: an `ApiError` whose `status` is one of the retryable codes.

## [1.0.0-beta.5] — 2026-07-26

### Added

- **Device sign-in methods** — `oauthDeviceLogin` and `oauthDeviceDeny` round out the device authorization flow that backs "Continue in browser" sign-in. The confirmation page can now approve the waiting terminal with an email and password, or refuse it outright, so you can build your own confirmation screen instead of only the hosted one. The SDK is now 1077 typed methods, up from 1075.
- **`--no-allow-no-realm` and `--no-event-access`** on `hoody auth tokens create`. Both settings are on by default and the CLI previously had no way to turn either one off.
- **Clickable menus.** A left-click now picks a row in any `hoody` menu — the scroll wheel already moved the highlight — and the "Generate a strong password" button is a real click target. Terminals that don't report clicks behave exactly as before; the keyboard path is unchanged.

### Fixed

- **A mistyped password no longer ends `hoody signup`.** Resuming a pending signup used to drop you back to the shell with an account you could not finish creating. You now get another try, and pressing `r` sends a fresh verification link straight from that screen. An account that cannot succeed by retyping — locked out, or disabled — still stops immediately rather than asking three times.
- **Verification resends report what actually happened.** A resend that hits the hourly limit now says so, with the wait when one is supplied, instead of reporting that a link was on its way. The confirmation elsewhere reads "request accepted" rather than "sent", which is all the service will confirm.
- **`--version <value>` is no longer mistaken for a version request.** On the commands that take a `--version` value, a failure now reaches the built-in fixer normally; `help` used as a verb is recognized alongside `--help`.
- **A smaller `hoody` bundle.** The published CLI carried a copy of the repository's build-time metadata that nothing referenced at runtime — it only ever needed the version string. The bundle is about 8 KB lighter and now contains runtime code only.
- **Installers.** `install.sh` checks for `awk` up front, rejects version strings carrying whitespace or control characters, and parses checksum manifests unambiguously. `install.ps1` restores the caller's TLS setting on every exit path, and a failed upgrade now states whether the previous `hoody.exe` was put back — and where to find it if it was not.

### Changed

- Device-flow endpoint descriptions now spell out how the flow differs from RFC 8628 rather than referring to a note that was not part of the published docs.
- Reference documentation regenerated for this release.

## [1.0.0-beta.4] — 2026-07-23

### Changed

- **README overhaul.** Every code snippet, method shape, count, and behavioral claim was re-verified against the generated SDK and CLI, and the prose was tightened for clarity — shorter and easier to skim, with no change to the documented surface.
- **`AGENTS.md` reframed** around the three ways to build on Hoody: the SDK for scripting, and the CLI or plain HTTP/`curl` for terminal and agent use, with a task-by-task comparison of the same operation in each.

## [1.0.0-beta.3] — 2026-07-21

### Changed

- **Documentation overhaul.** A rewritten `AGENTS.md` build guide (now shipped in the package), a clearer README with a hands-on examples tour (spawn and drive a cloud browser, mount cloud storage and local drives both ways, drive the built-in agent, and serve any port over HTTPS), per-namespace descriptions in the [namespace index](./docs/reference/namespaces/_INDEX.md), and a plain-English `hoody chat` privacy guide.
- Licensing and ecosystem notes added to `LICENSE`.

### Fixed

- Reference documentation now renders generic type parameters correctly (e.g. `ApiResponse<unknown>`).

## [1.0.0-beta.2] — 2026-07-21

### Added

- **PKCE OAuth sign-in** — new authentication endpoints for building a browser-based sign-in flow against the Hoody API: `oauthAuthorize`, `oauthExchange`, and `getOAuthConfig`.
- **Identity claims** — `issueIdentityClaim` for issuing verifiable identity claims.

### Changed

- Refreshed the generated API reference under [`docs/reference/`](./docs/reference/) and the [README](./README.md) for clarity and accuracy.
- CLI: output, flag, and help-text consistency refinements across commands (no change to the command surface).

## [1.0.0-beta.1] — 2026-07-11

Initial public release of the Hoody SDK (`hoody-sdk`) and the bundled `hoody` CLI.

### Added

- Typed TypeScript client for the public Hoody API and the container **Kit** service layer — terminal, files, browser, display, code, agent, sqlite, cron, daemon, watch, notes, tunnels, and more. See the [README](./README.md) and the full [`docs/reference/`](./docs/reference/).
- The `hoody` CLI, shipped in the same package — run with zero install via `npx https://hoody.com`, or install globally with `npm install -g hoody-sdk`.
- Node.js ≥ 22.19.0 and Bun support; browser IIFE global (`window.HoodySDK`) and ESM bundles.

> Future releases are documented here automatically, generated from the public API surface between published versions.
