# What is not built yet

Each item says what is missing and what you meet because of it.

## Missing

### A real session from this folder

- **What exists**: `mountTerminalHub` in `src/term/entry.live.ts`, the lifecycle, the session scope, and the contract
  `src/term/host-types.ts`.
- **Where the host program is**: the `hoody` CLI. `hoody hub` signs in and mounts the terminal Hub on Linux. The CLI
  ships compiled, so the host side (sign-in, credential storage, the event socket) is not in this folder.
- **You meet it as**: every runner in this folder works on fixtures only.

### A script that rebuilds the engine

- The patch series is in `hub/vendor/opentui/patches/` and the built engine beside it; [fork.md](fork.md) gives the
  build steps. No script in this repository runs them: a new engine build is done by hand.

### A released ship build

- `scripts/term/build.ts` exists and checks its own output.
- No size budget is enforced for the Hub bundle. The terminal bundle's assets have per-class budgets in the ship build
  (`scripts/term/build/verify.ts` `ASSET_BUDGETS`); its JavaScript size has none.

### Ports

- **Kit exports still drawn as stand-ins** (`scripts/term/kit-classes.json`): `CHAT_SLOTS`, `ChatNames`, `IpInfo`,
  `markChatApps`.
- **Kit exports handed off to the web** (derived from the code by `scripts/term/graph/handoffs.ts`: a sibling whose
  own declaration draws `<Handoff>`; 9 names): `FileButton`,
  `MicButton`, `PathField`, `QrButton`, `QrCode`, `QrImage`, `QrPanel`, `SshKeyHelp`, `TalkBar`. Several hand off only a part (the
  QR family when there is no room, `PathField`'s browse). `AttachThumb` has no sibling: it is needs-sibling work.
- **Pages.** `scripts/term/render.ts` draws every page at every fixture state. Most draw. Failing: some `bots` shots (a voice hook is a stand-in), some `programs` shots ("run-open core is not loaded").
  Stand-ins it listed on pages: `ReasonButton` (computers), `ComputerPicker` (files, logs),
  `PickerPopover` (logs). This is a snapshot: run `render.ts` for the current list.
- **Strict mode.** Several pages read a DOM global when drawn with globals trapped: `window.history` in
  `src/kit/data/DataTableView.ts`, `localStorage` and `location` in `src/kit/widgets/agentHints.ts`,
  `ResizeObserver` in `src/kit/layouts/CutFrame.tsx`, `document` in `src/kit/data/fontsReady.ts`. A page with such
  a read lists `strict` under `crashes` in its allowance.

### Features the web has and the terminal lacks

- No theme choice. The terminal draws the dark tokens only.
- No motion.
- No hover states in class styles (a `:hover` rule is dropped). Hover is drawn only by terminal parts that ask for it through `useHover` (`src/term/prim/Hover.ts`): the `hover` ground under the part the pointer is on, truecolor only. Today: the sidebar's rows, the rows of a section menu and of a rail's switcher, the tabs (`Tabs`, the page tab strip, the side tabs) a wizard's done steps, and the kit's buttons that have no fill of their own (never one that is off, shows a reason instead of acting, or is busy). Not yet: table and list rows, menus and pick lists.
- No images. An `img` keeps only its `alt` in the semantics tree.
- No in-app text selection. The terminal's own selection is used.
- No drag and drop.

## Gates and tools with gaps

| Gap | You meet it as |
|---|---|
| No page and no page template declares its loading state. | The marker exists (`loadingStates` in `fixtures.ts`), but nothing uses it yet: every `loading` case is still `unsettled` until its page declares it. |
| A full-screen layer covers the top bar. | `layout-offscreen` on shots that open a drawer at 80x24. |
| The `mutants` gate runs only in a scoped run (`--page`, `--changed`, `--only mutants`); a whole run skips it with a line. | A sibling that ignores a safety prop is found only when its page or file is checked on its own. |
| `shots.ts` needs a tool that is not in this repository (`termshot`), and its `--web` default is not usable here. | It does not run from the working copy alone. |
| The page gate takes about 3 minutes for one page with 42 cases. | Slow feedback. `--affected` and `--jobs` help. |
| `scripts/term/secrets.allow.json` does not exist. | Nothing, until the first reviewed exception. |
| `dev.ts` does not use `tierFromEnv`. | `HUB_TERM_COLOUR` and `TERM` are ignored by the dev runner. |
| On stock OpenTUI the ansi16 tier writes RGB values. | 16-colour terminals get approximated colours in dev and test runs. Fixed in the patched engine. |

## Open questions

- Navigation blockers are solved twice: the wrapper in `src/term/app/history.ts` and the loader delta
  `history-blockers`. Which stays?
- A strict sweep reports `document` read from `src/core/chat-attention.web.ts` on four pages, although
  `src/core/chat-attention.web.term.ts` exists and should replace it. Cause not found.
- `src/term/kit/` and `src/term/manifest.json` are kept only because the graph tool reads them. When do they go?
- The flavour name `'dev'` is still passed by some scripts for `fixture`.




<!-- docs-check: absent scripts/term/secrets.allow.json -->
