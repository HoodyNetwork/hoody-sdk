# Changelog

All notable changes to `hoody-sdk` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/).

## [1.0.0-beta.1] — 2026-07-11

Initial public release of the Hoody SDK (`hoody-sdk`) and the bundled `hoody` CLI.

### Added

- Typed TypeScript client for the public Hoody API and the container **Kit** service layer — terminal, files, browser, display, code, agent, sqlite, cron, daemon, watch, notes, tunnels, and more. See the [README](./README.md) and the full [`docs/reference/`](./docs/reference/).
- The `hoody` CLI, shipped in the same package — run with zero install via `npx https://hoody.com`, or install globally with `npm install -g hoody-sdk`.
- Node.js ≥ 22.19.0 and Bun support; browser IIFE global (`window.HoodySDK`) and ESM bundles.

> Future releases are documented here automatically, generated from the public API surface between published versions.
