# HUB-GUIDE: the one recipe for a Hub v3 page

This file is public. Read [AGENTS.md](AGENTS.md) first (boundaries, standing rules, commands). Binding companions: the page contract below and the kit (`hub/src/kit`) for layout.

Every rule below that can be checked is checked by `hub:check` or `hub:shots`. They fail before review, and each message names the kit piece that fixes it. If a rule slows you down, raise it; never silence a check.

## Before you start

In this file a path that starts with `hub/` is relative to the Hub package root: the `hub/` folder of the repository, which holds `package.json` and `bun.lock`. This file sits one level below it. Run every command from the package root.

- **Tools:** Bun 1.4 or later and Node.js 22.12 or later (`engines` in `package.json`). Run `bun install` once.
- **A browser for the checks:** `hub:check` and `hub:shots` drive a Playwright browser. Install it once: `bunx playwright install chromium`.
- **The terminal step needs Linux.** `hub:check` (with or without `--page`), `bun run typecheck`, `bun run test:term` and `bun run term:build` run terminal Hub steps, and each of those runs inside its own network namespace, so it needs Linux with unprivileged user namespaces. Anywhere else, add `--skip term` to `hub:check`, and check the web Hub's types with `NODE_OPTIONS=--max-old-space-size=6144 bunx tsc -p hub/tsconfig.json --noEmit`.
- **No Hoody is needed to work on a page.** The dev server, the tests and the shots run on sample data (fixtures); nothing is sent anywhere.
- **Trying your build on a real account:** `bun run build-single` writes the one-file Hub, which signs in to the Hoody named by `STANDALONE_ORIGIN` in `public/auth/shared.js`. To also allow one alternative, and this machine over http, set `STANDALONE_ALT_ORIGIN` there to a different origin ([AGENTS.md](AGENTS.md), "Standalone Hub").
- **In your own fork** you are the reviewer. Where this file says "review", it means the check a person makes after the automatic ones pass.

## The page contract

```sh
bun run hub:new-page <id> --layout list-detail --title "Title"
HUB_AGENT=<name> bun run hub:dev --page <id>        # fixtures dev server; prints its PID and URL
```

Layouts (one template each, every state pre-wired: many, empty, error, loading, save-unknown, save-failed):
- `list-detail`: list + detail pane (`fill` for a rich object, `side` for a light record);
- `table`: a whole-width table with a stat strip and an edit drawer;
- `detail`: one object with tabs and a facts rail;
- `settings`: sections of setting rows with a save bar shown while dirty;
- `dashboard`: widgets, each with its own compact loading/empty/error state;
- `wizard`: steps in the URL, a summary rail, and the final action's C9 outcome.

A new page starts dark (`status: 'hidden'`). Allowed statuses are `hidden`, `preview` and `ready`; `ready` needs a `page.test.ts(x)`; set it only after the gate below passes and the page has been reviewed. `bun hub/scripts/check-templates.ts` keeps every template compiling as the kit moves. When you change `templates/` or `app/e2e-search.ts`, run it with `--run` in a copy of the tree, never in a checkout others build from: it fills each template in as a page under `src/pages/zz<layout>/`, runs its specs, checks the templates' search proof rows against that run, and removes the pages.

The page folder, which you own entirely. `page.ts`, `view.tsx`, `fixtures.ts`, `shots.ts` and `strings.en.json` are required (conformance test).

| File | What it holds |
|---|---|
| `page.ts` | manifest: id, path, nav, layout, `screens`, `load: () => import('./view')`, strings, commands, widgets |
| `data.ts` | every query and mutation of the page (through `@core`; the template's `fixtureSource` is a bridge) |
| `fixtures.ts` | `defineFixtures({ default, states })`, built from core's `fixtureWorld` |
| `logic.ts` | pure functions (no React, no I/O), unit-tested |
| `view.tsx` + `parts/` | the UI: kit components only |
| `strings.en.json` | every user-visible string |
| `links.ts` | the only file other pages may import from yours |
| `shots.ts` | named states for `hub:shots` |
| `page.test.ts` / `page.spec.ts` | Vitest (logic, states) / Playwright (flows, the functional e2e); more specs sit beside it as `<name>.spec.ts`, directly in the page folder (a subfolder is unmatched and the conformance test fails) |
| `conformance.allow.ts` | debt rows for conformance rules; they only shrink |

**Screens.** Every manifest names its screens: the page path and each sub-path below it (`''`, `'new'`, `':id'`, `':id/ports'`; `:name` is one whole segment, any other segment matches as written). A screen whose layout is not the page's own names it in `subLayouts`, written inline as literals (the anatomy rule reads them). The view reads the sub-path only through `matchScreen`:

```ts
// screens.ts: one list, read by the manifest and the view (a view never imports page.ts)
export const SCREENS = [{ id: 'list', path: '' }, { id: 'new', path: 'new' }, { id: 'item', path: ':id' }] as const satisfies readonly PageScreen[];
// page.ts
screens: SCREENS,
subLayouts: { item: 'detail' },
// view.tsx
const screen = matchScreen(useSubPath('/computers'), SCREENS); // { id, params } | null
```

A literal segment wins over a parameter in the same place (`new` beats `:id`, whatever the order of the list); a sub-path no screen matches is `null`, never the nearest screen. State that rides the query (`?sel=`, `?new=1`) is not a screen: a page with no sub-paths declares the one screen `{ id: '<name>', path: '' }`.

## The gate, in order

Run these before you call a page done or ask for a review. Each one takes the page id.

1. `bun run hub:check --page <id>` runs the anatomy ratchet, then tsc (app, kit, shell, core and your page), eslint, stylelint, Vitest (your page and the conformance tests) and Playwright (every `*.spec.ts` in your page folder).
   - Errors in another page never block you. An error tsc reports in app, kit, shell or core is fixed there, in its own change; never work around it in the page.
   - Playwright uses 2 workers. Vitest, tsc and eslint on their own are light.
   - A new page fails the terminal step (no golden, no allowance) until its terminal frames are recorded: from the app folder (`cd hub`), `NODE_ENV=test bun scripts/term/check.ts --page <id> --update`, then read the frames it wrote. What each failure means: `src/term/docs/gates.md`.
2. `bun run hub:shots --page <id>` renders every state (see Shots). It writes `<id>/index.html` and `index.json` in the shots folder (`HUB_SHOTS_DIR`) with each PNG's time and problems. It fails a blank frame, and it moves PNGs that the current shot list no longer produces into `<id>/.old/`.

## Design rules you will be reviewed on

Each is enforced where it says. Failing: eslint `hub/one-accent`, `hub/no-text-literal`, `hub/no-raw-color`, `hub/retired-syntax`, `hub/use-data-view`; stylelint `hub/blue-only-link-focus`, `hub/no-dashed`, `hub/token-use`; raw string keys / `{{var}}`, blank or identical shots, still-loading shots, outcome shots without their Outcome line, sample names from outside `fixtureWorld`, the functional e2e tags. Report-only: eslint `hub/anatomy` and stylelint `hub/page-anatomy-css` (they repeat the anatomy ratchet, which fails), and the `warn:` lines of hub:shots (output and `index.html`); fix them anyway.

| Rule | Where it is checked |
|---|---|
| **One accent (primary) button per screen.** An open drawer or dialog is its own region. The header primary hides while an EmptyState shows its own primary, or while a detail with its own primary is open. | eslint `hub/one-accent` (heuristic); hub:shots counts visible accent-filled controls per region |
| **Blue is only for links, for focus, for the selected-item bar and for the blue Button variant** (`variant="blue"`; no other control is filled blue). A link that goes somewhere is blue: links in prose, the nav variant ("View all ›", facts values, summary links, table cells that open a page) and web addresses, underlined on hover. An action is a `<TextButton>` in ink, never blue. Status info is neutral; selection is `--hx-selected` + the 2 px blue bar `--hx-selected-bar`. | stylelint `hub/blue-only-link-focus`: only `--hx-link*` (text colour), `--hx-focus` / `--focus-ring*` and `--hx-selected-bar`; plus `.blue` rules in kit/controls/Button.module.css |
| No raw colours: tokens from `kit/tokens.css` only | stylelint `color-no-hex` etc.; eslint `hub/no-raw-color` in TS/TSX |
| Spacing, radius and z-index come from tokens (0 and `calc()` of tokens are fine); logical properties only (`margin-inline-start`, `inset-inline-end`, never `left`/`right`) | stylelint |
| **No dashed borders** (empty tiles, chips, missing facts). The one allowance is the side nav's item line (--hx-nav-line-item) | stylelint `hub/no-dashed` |
| No muted-grey link variant: `<Link>` for prose, the nav variant for chrome, `<TextButton>` for actions | eslint `hub/retired-syntax` (`variant="subtle"` is refused) |
| Every string is a key in `strings.en.json`: JSX text, labelling props, and text in object literals (column headers, menu items, chips) | eslint `react/jsx-no-literals`, `no-restricted-syntax`, `hub/no-text-literal` |
| An ellipsis lives in the string value ("Rename…", "Saving…"), never as JSX text | eslint `hub/retired-syntax` |
| No raw string key on screen (NAV.GROUP.BUILDON) and no unfilled `{{var}}` | hub:shots scans every state, the shell included |
| Table headers never clip; priority-1 cells never clip (lower priorities drop first) | hub:shots |
| Sample names only from `fixtureWorld` (atlas, Ada, Personal, Acme client; never an invented machine name) | review |
| Compact states inside widgets and sections (one line + one action); the page EmptyState only for pages | review |
| C9 wording: "This may have gone through" + one sentence + **Check again** (reads only, never resends), shown where the action was. Never "reload the page". | hub:shots outcome check; review |
| Telegram, Slack and Discord show with their logo: strings use the ChatNames slot (`{{telegram}}`, `{{slack}}`, `{{discord}}`), never the bare name | conformance `std.chatName` |
| No internal request headers in any strings value | conformance `std.publicText` |

**Exceptions.** A rule that cannot fit a file (data shown as data, a third-party mark, a dev tool) gets an entry in `app/conformance/exceptions.ts` (path, rules, why, by), with the reason in your change. An inline `eslint-disable` or `stylelint-disable` of a `hub/` rule fails `std.inlineDisable`.

## List pages (FUNCTIONAL RULE)

A list page works, not just looks right. Search, filter chips, sort, paging, selection, bulk actions, the open row and reload come from **one** kit hook:

```tsx
const view = useDataView<Item>({
  rows: items.data, columns, getRowId: (r) => r.id,
  search: ['name', 'owner'],                       // or (row) => [texts]
  filters: [{ id: 'status', label: t('filter.status'), value: (r) => r.status, options }],
  sort: 'status', pageSize: 50,
  isLoading: items.isPending, error: items.error,
});
<DataTable label={t('title')} columns={columns} view={view} actions={rowActions} noMatch={t('noMatch')} empty={<EmptyState … />} onRefresh={reload}
  countLabel={(n) => t('count', { count: n })} />
```

- All of it lives in the URL (`q`, one key per filter, `sort`, `page`, `sel`), so Back, deep links and reload restore it. The no-match state with **Clear filters** comes with it.
- A main list (a `DataTable` with `view=`) offers the toolbar Reload through `onRefresh=`, and every non-bare `DataTable` names its count with `countLabel=` (the toolbar says "8 computers", not "8 rows"). The legacy table search (`searchParam=`, `searchText=`, `search=` without a view) and other deprecated DataTable props are refused (`conformance.datatable`, `conformance.std`).
- Server-paged lists pass `server: { total, hasMore, isLoading, error }` and key their fetch on `view.query`.
- **Never hand-roll it.** No `.filter()` with lowercase/includes over rows, no `filterX`/`sortX`/`applyFilters` helpers (defined or imported), no own `SearchField`. eslint `hub/use-data-view` and the conformance test refuse them. An ordering the layout asks for (attention first) is the default `sort` of a column, not a helper.
- **The functional e2e is required** for every page whose manifest layout is `list-detail` or `table`. Your `page.spec.ts` keeps six tagged tests (copy them from `hub/templates/page-list-detail/page.spec.ts`). The conformance test fails without any of the tags, and fails a tagged test that does not prove its state in the URL with a positive `expect(page).toHaveURL(...)`:
  - `@search`: the box narrows the rows and keeps `?q`;
  - `@filter`: a chip filters the rows, shows its value with ×, and keeps its key (`?status=…`);
  - `@sort`: a header sorts and keeps `?sort`;
  - `@page`: Next page (or Show more) keeps `?page=2`, and Back drops it. Give the default fixture state more rows than one page;
  - `@reload`: opens a URL with `q=`, a filter, `sort=` and `page=` (and `?sel`), reloads, and checks each one survived;
  - `@no-match`: no result shows the no-match state, and Clear filters restores the rows.
  Only a listed exception applies (Logs: a cursor stream, so no `@sort` and a cursor key in place of `page=`).
- Every row action is declared once in `actions` (the ⋯ menu, inline button, hover icons, keys). Inline actions are labelled secondary buttons ("Start"), never bare icons.

## Shots: every state renders its own case

```ts
export default [
  { name: 'many' },
  { name: 'detail', path: '?sel=item-02' },
  { name: 'no-match', path: '?q=zzzz' },
  { name: 'loading', state: 'loading' },
  { name: 'error', state: 'error' },
  { name: 'save-unknown', state: 'save-unknown', path: '?sel=item-02',
    act: [{ click: 'Edit' }, { fill: 'Name', text: 'atlas-2' }, { click: 'Save' }] },
] satisfies Shots;
```

- Every state is rendered at 1440 light, 1920 light, 1440 dark, 1100 light, 768 light and 390 light. `extra: [...]` adds variants (for example `'768-dark'` for tablet dark; the list is in `app/shots.types.ts`).
- **Naming:** *loading* means skeletons; *error* means a read that failed; *pending* / *unknown* / *failed* mean the outcome of an action.
- A shot's `state` must be a state of the page's `fixtures.ts`: an unknown state silently renders the default one, and the conformance test refuses it.
- **`act`** steps run after load: `{ click }`, `{ hover }`, `{ fill, text }`, `{ press }`, `{ waitFor }`. Targets are an accessible name or a Playwright selector (`role=…`, `text=…`, `css=…`). A state named *pending*/*unknown*/*failed* must perform its action and end with the kit Outcome line visible (`[data-outcome="pending"]`, or `failed` / `not_sent`). The conformance test refuses such a shot without `act` (or `click`/`keys`). `noOutcome: '<why>'` is the reviewed exception.
- **What fails a shot:** a non-*loading* state still showing skeletons or aria-busy after 10 s; a blank `#hub-main`; two states with pixel-identical PNGs (the pair is listed); a raw string key or `{{var}}`. Reported only (`warn:` lines, never a failure): more than one accent per region, a clipped header.
- `hub:shots --shot <name>` re-takes one state. Before asking for a review, re-take them **all**, so every PNG matches the current code.

## Page anatomy

`scripts/lint/anatomy.cjs` counts layout debt as (rule, file, scope) with a syntactic scan, through eslint `hub/anatomy`, stylelint `hub/page-anatomy-css` and the ratchet `app/conformance.anatomy.test.ts` (which `hub:check` runs first). A page composes the kit's archetype pages (`TablePage`, `ListDetailPage`, `DetailPage`, `SettingsPage`, `DashboardPage`, `WizardPage`, `CanvasPage`) and does not rebuild their chrome. Start from the template of your layout. The detector's `EXPLAIN` table is the list of what it flags (`layout.<rule>`):
- `heading`, `landmark`, `text`: raw h1-h6, raw landmarks (`section`, `header`, `footer`, `aside`, `nav`, `article`, `hr`), and text written directly in a `p`/`div`/`span`/`li`/`strong`/`em`/`small`/`label`.
- `state`, `stateMissing`: `EmptyState`/`ErrorState`/`Skeleton` outside a `Widget` or a Section state; a strict Section that holds a data leaf without a state.
- `actionRow`, `localChrome`, `marker`, `slot`, `visual`: a hand-written wrapper around kit action components, a page component that renders kit-like chrome, a `data-hub-*` attribute written by page code, caller content the kit slot table does not allow, a `Visual` child that is not a graphic element.
- `legacy`, `manifest`, `screens`, `prose`, `overlayId`: the legacy `Panel`/`Section`/`PageFrame`/`Tabs`/`padding="page"` API (being removed), `layout: 'custom'` or a root that does not match the manifest, sub-path parsing outside `matchScreen` or a manifest without `screens`, `Prose`/`Steps` outside the Guide, a kit overlay without a literal `overlayId`.
- `cssMargin`, `cssType`, `cssReach`, `inlineSpacing`: a non-zero margin, a heading font token, or a selector that reaches into a kit component in page CSS; inline-style spacing.

Debt rows (`layout.*` in `pages/<id>/conformance.allow.ts`) only shrink: a new offender fails, and a fixed site lowers its row in the same change.

### Forms in a dialog or a drawer

A form with five or more fields is cut into `FormSection`s (`kit/forms/FormSection.tsx`), placed side by side as direct children of the form's column (the Dialog body, a `Stack gap={0}`, a `Form`):
- `title` is the group's name, drawn as a heading one type step above the field labels. Leave it out for the leading group (a name, a kind), and for a group whose one field label already says it: a group is never named as its first field. A group's name is never a field label, a `<legend>` or a page class.
- `description` is one line about the whole group, directly under the title. Help about one field stays that field's `description`, under its control.
- The section sets the gaps: fields inside are one gap apart, and every section but the first draws a rule with the section gap above itself. Do not wrap sections or their fields in a `Stack` with a gap of your own.
- `kind="summary"` is the closing block (limits, where it is saved, what the action will do). It is the last section. In a dialog or a drawer, from 600 px wide, it stays whole above the footer while the fields scroll under it; on a phone, and in a form on the page, it is the plain last section and scrolls with the form. Facts in a summary use `layout="spec"` (one line per fact, no frame), so the pinned block stays short.
- A dialog that holds sections grows with its form up to 85vh (the space above it shrinks from 20vh to 7.5vh), so a form that fits the window does not scroll. Phones keep 20vh and 70vh.

The ratchet `app/conformance.formsection.test.ts` counts, per file and overlay, a column of five or more kit fields outside a `FormSection` or `SettingGroup` (`form.flat`) and a hand-made group (`form.handGroup`: a `<fieldset>`, or an element with a page class named like a label). Its rows are in `app/conformance/formSection.debt.ts` and only shrink.

## Kit first (app/conformance.std.test.ts and its siblings)

Where a rule has an allow-list, it only shrinks.
- Every `Drawer` takes a literal `resizeKey="<page>-<panel>"` (for example `computers-create`): starting with a lowercase letter, then lowercase letters, digits and dashes, 3 to 49 characters in all, unique across the Hub. A wrapper's own file may forward its caller's key.
- Page keys go through `usePageShortcuts`, never a window or document keydown listener. Size from the frame (`@container`, kit layout props), never viewport `@media` or `matchMedia`. Every `var(--x)` is defined. Import the `@core` / `@kit` barrels only; the named exceptions are `@kit/pure`, `@kit/hooks` and `@core/pure` for files that are not views (see Terminal below).
- Navigation to another page goes through `usePageLink` (follow it with `followPageLink`), never a literal route, a raw `href` on a router Link, or a path built from another page's `links.ts` on its own: `links.ts` helpers build destination paths (Logs: `logsLinkFor`) and are used with the page registry. A control is hidden only by a null page link (`!link`), never by a link kind.
- Copy buttons and toasts, loading/alert/status states, meters, tags and tiles, and code or JSON blocks (`CodeBlock` with a `lang`; a lang-less JSON block shows plain and is refused) come from the kit; flags come from `countryFlag`; a multi-line field is the kit `TextField multiline`.
- A `Button`, `TextButton` or `LinkButton` whose label shows data passes `literal`, and page CSS never sets `text-transform` or `letter-spacing` on a button.
- Every error a person sees takes the kit `error=` prop (mapped words plus Details), or goes through `showErrorToast`, or says why not in a `noDetails: <why>` comment inside the tag or call. Raw API text is never UI text.
- A page imports core's route instead of defining a second one for the same endpoint. No raw U+2028 or U+2029 in a source file.
- A Playwright locator is unique. A `.first()` / `.nth()` on a role, text or label locator keeps a specific `// reason` on the same line, and one reason text excuses at most 2 such lines per file.

## Data, security, words

- Data only through `@core` (queries, mutations, C9 outcomes). Pages never call `fetch`, storage or cookies (eslint).
- A secret shows only in `SecretField`. Never show a full 24-hex id: use `IdChip` / `maskId`. Sign-out purges through `clearAuthTokens` and nothing else, and only through `core/lifecycle.ts` (see [AGENTS.md](AGENTS.md)).
- A control, confirm or dialog title that lets a may-have-gone-through change go says "Stop tracking"; a new one is added to `TRACKING_CONTROLS` in `pages/tracking-words.test.ts`. Panel text uses plain words (`pages/plainwords.test.ts`).
- Default model text: `hoody-ai/hoody-free`. No internal host names in UI text. No telemetry.
- Plain words, sentence case, verbs on buttons, and every error says what to do next with that button.

## Terminal

The Hub also runs in a terminal: `hub/src/term/` (hub-term) renders the same core (`@core`) and the same kit API
(`@kit`) as text cells on OpenTUI, driven by the CLI through `mountTerminalHub`. A sibling `X.term.tsx` replaces
`X.tsx` in the terminal build and draws with the prims in `src/term/prim`. Start at `src/term/README.md`.

- **Decisions.** A change to a page, the kit, the shell or core says what the terminal Hub does with it: draws it
  natively (a `.term` sibling or a shared component), hands the person off to the web Hub (the CLI opens the
  route), or nothing a terminal shows changes. How to port a screen, the gates and the commands:
  `src/term/README.md`; a feature the terminal cannot do: `src/term/docs/handoff.md`.
- **Imports in logic and data.** `logic.ts`, `data.ts` and other non-view files import kit helpers from `@kit/pure`
  (strings, formatters) and hooks from `@kit/hooks`, never values from `@kit`: their closures are free of CSS, React
  Aria, react-dom, the router and browser globals (`kit/entries.closure.test.ts` holds the members).
- **Browser globals.** The terminal process traps the DOM globals (`STRICT_GLOBALS` in `src/term/env/strict-globals.ts`:
  `document`, `localStorage`, `window.addEventListener`, `matchMedia`, `location`, ...): a read throws `TERM_GLOBAL`.
  A `typeof window !== 'undefined'` guard passes and then throws, so it is no protection. Core reaches storage,
  storage events, locks and visibility only through `hostEnv()` (`core/host-env.ts`: `local`, `session`, `vault`,
  `locks`, `onExternalChange`, `visible`).
- **Routes, not URLs.** The terminal hands the CLI a `HubRoute` (`{ page, path }`) to open, never an origin or a whole
  URL.
- **Keys.** The shell and its keys (frame, Ask dock, leaving): `src/term/docs/shell.md`. How focus and screen keys
  work: `src/term/docs/focus-keys.md`. Screens add their own keys.
- **Colour tiers.** `truecolor`, `ansi16` and `mono` (`NO_COLOR` or `TERM=dumb`; `HUB_TERM_COLOUR` picks one,
  `src/term/prim/tokens.ts`); a screen must still read in mono (no meaning carried by colour alone).
- **Running it.** `bun run hub:term-build` (the bundle), `bun run hub:term-dev` (a page on fixtures, in your terminal),
  `bun run hub:term-test` (the term tests only) and `bun run hub:term-check` (every terminal gate: graph rules, sibling
  contract, typecheck, tests, page goldens). One page or one file, and every flag: `src/term/README.md` and
  `src/term/docs/gates.md`. `hub:check` runs the terminal step too: whole-Hub, every gate plus the ship gate (build and
  mount of the built bundle); with `--page`, the gates that page can break. `--skip term` leaves it out.
- **Goldens and debt.** Each page has golden frames at 80x24 and 120x40 and a debt file that only shrinks
  (`src/term/docs/goldens-shots.md`). The build fails an asset over its size budget (`scripts/term/build/verify.ts`).

## Asking for things

- Kit gaps and layout questions: raise them with the page and what it needs. A gap in the kit is fixed in the kit, never copied into a page.
- A check that looks wrong: report it with the file and line. Rules are fixed at the source. A `hub/` rule is never disabled inline (an exception is an entry in `app/conformance/exceptions.ts`); any other `eslint-disable` keeps a `-- reason`.
