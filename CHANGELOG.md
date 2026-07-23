# Changelog

All notable changes to `hoody-sdk` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/).

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
