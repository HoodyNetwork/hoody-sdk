# Changing the Hub

This page holds the rules for changing the Hub's source in `hub/`: where things live, the page contract, the checks and the commands. Paths are relative to `hub/src` unless they start with `hub/`. Run commands from the Hub package root: the repository's `hub/` folder, which holds the Hub's `package.json` and `bun.lock` (one level above this file). The full rules are [AGENTS.md](AGENTS.md) and [HUB-GUIDE.md](HUB-GUIDE.md); this page is the short version.

## Where things live

The import aliases are `@kit`, `@core`, `@app/*`, `@shell/*` and `@ask/io` (`hub/tsconfig.json`).

| Path | Holds |
|---|---|
| `pages/<id>/` | One page, found by its `page.ts` manifest |
| `kit/` | The only UI library pages use: layouts, overlays, forms, data (`DataTable`, `useDataView`), states, tokens (`tokens.css`), icons. Public surface: `kit/index.ts` |
| `core/` | Everything that talks to the world: routes, queries, mutations, sign-in, storage, streams. Public surface: `core/index.ts` |
| `shell/` | The app frame: sidebar, top bar, command palette, Ask dock, lock screen. Never imports a page |
| `app/` | Router, page discovery, fixtures runtime, test helpers and the `conformance*.test.ts` checks |
| `ask/` | The Ask engine and its journal. Pages reach it only through `@ask/io` |
| `standalone/` | The one-file Hub: entry, sign-in card, file memory guard |
| `term/` | The terminal Hub. Start at `src/term/README.md` |
| `hub/scripts/` | The build, dev, check and scaffold commands, and the lint rules (`scripts/lint/`) |
| `hub/templates/` | One scaffold per layout |

## Boundaries

These are enforced by ESLint (`hub/eslint.config.js`), Stylelint (`hub/stylelint.config.mjs`) and the conformance tests.

- A page imports its own folder, the `@kit` and `@core` barrels, `@ask/io`, and another page's `links.ts`. No page imports `react-aria*`, `@tanstack/*` or another UI or data library.
- Pages never call `fetch`, `localStorage`, `sessionStorage`, `indexedDB`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `BroadcastChannel` or `document.cookie`. Data goes through `@core` (`defineQuery`, `defineMutation`).
- Every user-visible string is a key in a `strings.en.json`. An ellipsis lives in the string value ("Saving…").
- Colours, spacing, radius and z-index come from `kit/tokens.css`. Use logical properties (`margin-inline-start`, never `left`). No dashed borders.
- No viewport `@media` or `matchMedia` in pages: size from the frame with `@container`.
- Every `Drawer` has a unique literal `resizeKey`, such as `computers-create`.
- A file a lint rule cannot fit gets an entry in `app/conformance/exceptions.ts` with its reason. An inline disable of a `hub/` rule fails. Any other `eslint-disable` needs a `-- reason`.

## Rules every page follows

- **C9, unknown outcome.** Code comments and test titles call this rule C9. When a change was sent and no answer proves what happened, show "This may have gone through", one sentence, and **Check again**. Check again only reads. Never resend on its own, and never show an unknown outcome as failed.
- **Attempts bind to their target.** Capture the target's id when the change is sent, and keep the attempt outside the dialog and the render. A confirm dialog closes when its target or selection changes.
- **Parse at the boundary.** Every answer the Hub classifies goes through one parser per wire shape, which checks every field it reads and returns a typed value or unknown.
- **Secrets and ids.** A secret shows only in `SecretField`. A full 24-character id never shows: use `IdChip` or `maskId`.
- **Sign-out** goes through `core/lifecycle.ts` only.
- **Errors.** Every error a person sees uses the kit `error=` prop or `showErrorToast`. Raw API text never appears as UI text.
- **Fixtures.** Sample names come from `fixtureWorld` (atlas, Ada, Personal, Acme client).
- **Chat platforms** show their mark from `kit/icons.tsx`; strings use the `{{telegram}}`, `{{slack}}` and `{{discord}}` slots.
- **Public text** names no internal host or request header. The default AI model is `hoody-ai/hoody-free`. The Hub has no telemetry.
- **Use the kit.** A gap in the kit is fixed in the kit, not copied into a page.

## The page contract

```sh
bun run hub:new-page <id> --layout list-detail --title "Title"
bun run dev --page <id>        # fixtures dev server; prints its PID and URL
```

Layouts, one template each with every state wired: `list-detail`, `table`, `detail`, `settings`, `dashboard`, `wizard`. A new page starts with `status: 'hidden'`. The statuses are `hidden`, `preview` and `ready`; `ready` needs a `page.test.ts(x)`.

| File | Holds |
|---|---|
| `page.ts` | Manifest: id, path, nav, layout, `screens`, `load: () => import('./view')`, strings, commands |
| `data.ts` | Every query and mutation of the page, through `@core` |
| `fixtures.ts` | `defineFixtures({ default, states })`, built from `fixtureWorld` |
| `logic.ts` | Pure functions, unit-tested |
| `view.tsx` and `parts/` | The UI, kit components only |
| `strings.en.json` | Every user-visible string |
| `links.ts` | The only file other pages may import from yours |
| `shots.ts` | Named states for screenshots |
| `page.test.ts`, `page.spec.ts` | Vitest and Playwright tests, in the page folder |
| `conformance.allow.ts` | Debt rows for conformance rules. They only shrink |

`page.ts`, `view.tsx`, `fixtures.ts`, `shots.ts` and `strings.en.json` are required.

Every manifest names its screens: the page path and each sub-path (`''`, `'new'`, `':id'`). The view reads the sub-path only through `matchScreen`. State in the query (`?sel=`, `?new=1`) is not a screen.

## List pages

Search, filter chips, sort, paging, selection and reload come from one kit hook, `useDataView`, shown by `DataTable`. All of it lives in the URL (`q`, one key per filter, `sort`, `page`, `sel`), so Back, links and reload restore it. Never filter or sort rows by hand.

A `list-detail` or `table` page keeps six tagged Playwright tests in `page.spec.ts`: `@search`, `@filter`, `@sort`, `@page`, `@reload` and `@no-match`. Copy them from `hub/templates/page-list-detail/page.spec.ts`.

## Design rules

- One accent (primary) button per screen. An open drawer or dialog counts as its own screen.
- Blue is only for links, focus, the selected-item bar and the blue Button variant. An action is a `TextButton` in ink.
- Sentence case, verbs on buttons, and every error says what to do next.
- Compact states (one line and one action) inside widgets and sections; the page `EmptyState` only for whole pages.

## Shots

`shots.ts` lists named states. `bun run hub:shots --page <id>` renders each one at several widths in light and dark. A state named pending, unknown or failed must perform its action (`act`) and end with the kit Outcome line visible. A shot fails when it stays loading, is blank, matches another state pixel for pixel, or shows a raw string key.

## Terminal Hub

The same pages run in a terminal. A sibling `X.term.tsx` replaces `X.tsx` in the terminal build. Non-view files (`logic.ts`, `data.ts`) import helpers from `@kit/pure` and hooks from `@kit/hooks`, never from `@kit`. The terminal traps browser globals such as `document` and `localStorage`; core reaches storage only through `hostEnv()` (`core/host-env.ts`). Each page has golden frames at 80x24 and 120x40. Details: `src/term/README.md` and `src/term/docs/gates.md`.

## The one-file Hub

`bun run build-single` writes `dist/hub-single/hoody-hub.html`: every script, style, font and icon inline, with a hash per inline block in its CSP. The file signs in to the Hoody set in `public/auth/shared.js` (`STANDALONE_ORIGIN`). Opened from disk it keeps nothing on disk, so a reload signs out. Payments open the web Hub. A new bundled library or font needs its row in `THIRD-PARTY-NOTICES.md` beside `hub/`.

## Commands

```sh
bun run check --page <id>                 # anatomy, tsc, eslint, stylelint, vitest, Playwright for one page
bun run hub:vitest hub/src/<path>.test.ts # one test file
bun run lint                              # eslint and stylelint
bun run typecheck                         # web, then terminal types
bun run test:term                         # terminal tests
```

- Run ESLint from the app folder `hub/` inside the package (`cd hub && bunx eslint src/...`). From elsewhere the path-based rules do not match.
- A whole-Hub `tsc` needs `NODE_OPTIONS=--max-old-space-size=6144`.
- One terminal test file, from `hub/`: `NODE_ENV=test bun test --preload ./scripts/term/test-preload.ts src/<path>.term.test.tsx`. The preload installs the terminal loader; without it the file does not load.
- Start Vitest through `hub:vitest` or `test`: both pass `--wasm-max-mem-pages=4096`, without which Vitest reserves about 6 GiB of address space.
- `bun run check` needs a Playwright browser: `bunx playwright install chromium`.
- `check`, `typecheck`, `test:term` and `term:build` run terminal Hub steps, which need Linux with unprivileged user namespaces. Anywhere else, `bun run check --page <id> --skip term` checks the web side only.
