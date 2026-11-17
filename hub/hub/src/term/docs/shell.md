# The terminal shell

The shell is everything around a page: the top bar, the sidebar, the key hint line, and the surfaces that open over
the page. It is `src/term/shell/TermShell.tsx`, the terminal form of the web's `AppShell`.

A port of a page or a kit component does not touch the shell. Read this page to know what your page sits in.

## The frame

| Region | What |
|---|---|
| Top bar (row 0) | The brand cell (the Hoody mark, HOODY, and HUB where the sidebar shows), the page title (only on a page that draws no page header of its own, `shell/headerShown.ts`), the realm switcher, the computer switcher, the account, a key hint. |
| Sidebar | The navigation groups. Shown from 100 columns, 24 columns wide. Below that, `[` opens the page list as a menu. |
| Page | The page host, in the content pane (a `PaneSize`). |
| Status line (last row) | One line: a realm switch in progress, a short note, a pending `g`, else the main keys. |

Over the frame, all on the overlay layer: the palette (Ctrl+K), the key sheet (`?`), the menus, the quit and lock
prompts, the leave and sign-out confirms, the one-time-code dialog, and the toasts.

The page's `FocusRoot` is inactive while any layer is open.

Not in the terminal shell, though the web has them: core notices, browser alerts, the sidebar resize handle, the
Theme and Performance menus.

Keys are in [focus-keys.md](focus-keys.md).

## A terminal too small

`src/term/shell/TooSmall.tsx`. The frame needs 80 columns and 24 rows (`MIN_COLS`, `MIN_ROWS`). In a smaller
terminal it is not squeezed in. A full-screen layer says how large the terminal is and how large it must be.

- The page stays mounted under it. Typed text, an open palette or drawer, and the focus are there again once the
  terminal is large enough. A scroll position can move, because the page is laid out at the small size meanwhile.
- It takes every key, paste and click. `q` leaves, as everywhere, except while the Hub is locked. Ctrl+C and Ctrl+Z
  keep their rules. The Ctrl+C note is drawn on the last row, above it.
- A layer opened after it, such as the quit question, is drawn above it.
- Tests: `src/term/shell/too-small.term.test.tsx`. Every other test that draws the shell uses 80x24 or larger.

## The Ask dock

`src/term/shell/AskDock.tsx`.

- **Where it draws.** From 120 columns (`ASK_PANE_MIN_COLS`) it is a pane on the right of the page. The page
  shrinks and never unmounts. The page always keeps at least 48 columns (`ASK_PAGE_MIN_COLS`). Below 120 columns it
  is a full-screen sheet on the overlay layer.
- **Open state.** The kit's `useAskDock()`: the same store as the web.
- **The key.** Alt+J opens and closes it. The web's Ctrl+J is a line feed in a terminal. The chord is in the `?`
  sheet and in the palette ("Open or close Agent").
- **Focus.** The dock is its own `FocusRoot`. Opening moves the focus in: to where it was left, else to the first
  tab stop. In the pane, Esc goes back to the page and the dock stays open. A click in the pane goes back in.
  Alt+J closes. In the sheet, Esc closes.
- **Width.** Stored under the pane-width key `hub.v3.pane.shell.ask` in web px, between `DOCK_MIN` and `DOCK_MAX`.
  The rule on its left is a pane separator.
- **Content.** The `AskPanel` of `src/ask`, loaded lazily. `loadAsk()` imports it once at shell start, after the
  host environment. A panel that throws shows "Agent could not load here". A test supplies its own content with
  `provideAskDock(render)`.
- **Inside the dock**, `useAskDockFrame()` returns `{ mode: 'pane' | 'sheet', entered, leave() }`.
- **Tests.** `src/term/app/askdock.term.test.tsx`.


## Leaving

- `q` asks first when work is running or something is unsaved. It does nothing while a text field has the focus.
- Ctrl+C asks the same. A second Ctrl+C soon after leaves without asking.
- Ctrl+Z suspends.
