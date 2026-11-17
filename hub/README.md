# Hoody Hub (source)

This folder is the source of the Hoody Hub, the app for your Hoody account: computers, Bots, files, billing and settings.
The same code is the web Hub at `/auth/home` on a Hoody, the one-file Hub `hoody-hub.html`, and the terminal Hub that `hoody hub` opens on Linux (x86-64 and arm64), in the standalone CLI binary or in the npm package with Node.js 26 or later.
The [Hub guide](../docs/reference/guides/hub.md) covers using all three.

## Build it

Needs Bun 1.4 or later and Node.js 22.12 or later (`engines` in `package.json`).

```sh
bun install
bun run build-single     # writes dist/hub-single/hoody-hub.html
bun run build            # the served Hub, into dist/
bun run dev              # dev server with fixtures, no Hoody needed
```

Run these from this folder. Keep it inside the repository: `build-single` reads `../THIRD-PARTY-NOTICES.md`.

Checks: `bun run typecheck`, `bun run test`, `bun run lint`. The terminal Hub has its own build and tests: `bun run term:build`, `bun run test:term`. These two, and the second half of `typecheck`, need Linux with unprivileged user namespaces, because each one runs inside its own network namespace. To check the web Hub's types alone: `NODE_OPTIONS=--max-old-space-size=6144 bunx tsc -p hub/tsconfig.json --noEmit`.

`bun run check` runs the page checks in a browser. Install one first: `bunx playwright install chromium`. It also runs the terminal Hub's checks, with the same Linux need; `bun run check --skip term` leaves them out and checks the web Hub only.

`bun run hub:new-page` starts a new page from `hub/templates/`.

`bun run build` uses `flock` (util-linux) so that only one build writes `dist/` at a time. Without it (macOS), the build runs unlocked: run one build at a time.

Rules for changing the Hub: read [hub/AGENTS.md](hub/AGENTS.md) first (boundaries, standing rules, commands), then [hub/HUB-GUIDE.md](hub/HUB-GUIDE.md) (the page recipe and its checks). They are written for people and for coding agents. [hub/CONTRIBUTING.md](hub/CONTRIBUTING.md) is the short version.

## Layout

- `hub/`: the app (`hub/src`), its build scripts and configs.
- `hub/vendor/opentui/`: the patched terminal engine the terminal Hub runs, as npm tarballs (MIT).
- `public/auth/`: the session library (`shared.js`), boot scripts, fonts and icons the Hub loads.
- `src/utils/auth-static.ts`: a small helper the build imports.

## The one-file Hub

Each hoody-sdk release builds `hoody-hub.html` from this source and ships it at the package root, with its sha256 in `hoody-hub.html.sha256`.
Open the file from any https origin, from localhost or straight from disk.

The one-file Hub (`bun run build-single`) signs in to one Hoody, set when the file is built: a release build signs in to `https://api.hoody.com` only. Nobody types an address, and a link cannot choose another one.

In your own build, the Hoody is `STANDALONE_ORIGIN` in `public/auth/shared.js`; for one Hoody only, set `STANDALONE_ALT_ORIGIN` to the same value. Signing in needs an account on that Hoody; the dev server and the tests need none. To also allow one alternative, and this machine over http (`localhost` or `127.0.0.1`), set `STANDALONE_ALT_ORIGIN` there to a different origin. A link can then choose between them; `standaloneChoice` in the same file holds the accepted values. Keep both as plain literals.

`bun run build` makes the served Hub: `dist/hub/index.html` is a template that a Hoody API server fills in, and `dist/public/auth/hub/` holds its assets. It does not run on its own. To run your own build, use `bun run build-single`.

## License

Apache-2.0, see `LICENSE`. Fonts: SIL Open Font License, see `public/auth/fonts/LICENSES/`.
