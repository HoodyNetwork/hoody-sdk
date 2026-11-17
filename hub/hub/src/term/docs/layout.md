# Layout and breakpoints

## Units

Everything is measured in cells. One cell is one character position.

When shared code asks a pixel question, one cell answers as 8 px wide and 16 px tall. So "narrower than 600 px"
means "narrower than 75 columns".

Spacing comes from the web's `--sp-n` scale through `cols(n)` and `rows(n)` (table in [prims.md](prims.md)). Small
vertical spacing is zero rows on purpose: 4 px and 8 px between stacked lines would put a blank row between every
two list rows.

So the blocks of a page are parted by the kit, not by a page's gap: one blank row under the page header, under a view
strip's rule (`PageBlock` in `src/kit/layouts/termParts.tsx`, and a tab strip above its own panel), under a
`TablePage`'s stat line, under a `ListDetailPage` toolbar block, and between a data table's toolbar and its column
head. Each is dropped below `SHORT_ROWS`, where the content needs the row. Inside a block (a toolbar's note and its
`StatStrip`, say) the page's own gap parts the lines; a kit rule there would double it.

## The screen

- The app mounts one `ScreenRoot`. It is exactly the terminal's size and it clips. The frame is never taller or
  wider than the terminal.
- Row 0 is the top bar. The last row is the key hint line.
- The shell shows the sidebar from 100 columns (`SIDEBAR_MIN_COLS` in `src/term/shell/TermShell.tsx`). It is 24
  columns wide. Below 100 columns `[` opens it.
- The page is drawn in the content pane, a `PaneSize`. Its width is what a page should measure against, not the
  terminal's.
- The smallest terminal the frame is drawn in is 80x24 (`MIN_COLS`, `MIN_ROWS` in `src/term/shell/TooSmall.tsx`).
  Below it the shell shows a "Terminal too small" screen instead ([shell.md](shell.md)). A narrower pane still
  happens: the sidebar from 100 columns and the Ask dock from 120 columns take columns from it, down to 48.

Content width by terminal width, from the shell's own layout:

| Terminal columns | Sidebar | Content columns, about |
|---|---|---|
| 80 | hidden | 80 |
| 100 | shown | 76 |
| 120 | shown | 96 |
| 160 | shown | 136 |
| 200 | shown | 176 |

## Every box clips

A `Box` cuts its children at its edge. A child laid out past its box is not painted over a neighbour. It is lost.

Four ways to deal with content that may not fit:

| You want | Write |
|---|---|
| The text to give way with an ellipsis | `<Text truncate>` or `ClipText` |
| The row to wrap onto more lines | `<Box dir="row" wrap>` (its `gap` spaces the items along a line; the lines sit together, `gapY={1}` for a blank line between them) |
| The content to scroll | `Scroll` |
| To drop what does not fit, on purpose | `<Box drops>` |

`drops` is a declaration to the layout gate: "this box cuts its children and that is intended". Use it for a
one-line chip row or a table cell. Without it the gate reports the cut.

`clip={false}` lets a child out of one box. It is rarely right: the next enclosing box still clips. Something that
must float above the page goes on a `Layer` ([overlays.md](overlays.md)).

## Rows that hold at 80 columns

The usual row has one part that gives way and parts that never do:

```tsx
<Box dir="row" gap={2}>
  <Box grow={1} shrink={1}><Text truncate>{title}</Text></Box>
  <Box shrink={0}><Text colour="muted">{count}</Text></Box>
  <Box shrink={0}>{actions}</Box>
</Box>
```

- `shrink` is 0 by default. A box with `grow` gets `shrink` 1 unless you say otherwise.
- A `Text` with `truncate` inside a shrinking box cuts at the end with `…`.
- Mixed text and controls that should flow as one wrapping line use `Inline` from
  `src/kit/layouts/termParts.tsx`.

## Asking "how wide am I"

| Question | Use | Answers with |
|---|---|---|
| How wide is the room this page or pane has? | `usePaneSize()` | The nearest `PaneSize`, else the terminal. |
| How wide was this one box laid out? | `useBoxSize()` | The box you pass `onSize` to. Null before the first layout. |
| How wide is the terminal? | `useTerminalSize()` | The terminal. Only the shell and overlays need it. |

Shared code keeps its web hooks. `src/kit/media.term.ts` answers them in the terminal:

| Shared hook | Terminal answer |
|---|---|
| `useMedia(query)` | The query is evaluated against the terminal width × 8 px. Only width features can match. A query about hover, pointer, colour scheme, reduced motion or height is false. |
| `useContainerNarrow(px)` | True when the nearest pane is narrower than `px` / 8 columns. |
| `useContentNarrow(px)` | The same. The ref it returns does nothing. |
| `useRowFit`, `titledRowNeed`, `rowContentSig` | Constant answers. The engine lays rows out. Nothing folds by measurement. |

`useMedia` understands `min-width`, `max-width`, the range forms (`width < 600px`, `600px <= width < 900px`),
`and`, `,`, `not`, `only`, and `px`, `em`, `rem`.

A pane wraps its content in `PaneSize` so that questions inside it get the pane's width: the shell's content pane,
a drawer or dialog body, each side of a split. Before its first layout a pane answers its parent's size, so there
is no flash of a narrower layout.

## Breakpoints

The constants are in `src/kit/layouts/termBreaks.ts`. They are columns of the box a layout is drawn in.

| Constant | Value | Meaning |
|---|---|---|
| `NARROW_COLS` | 75 | Below this the web is "phone": breadcrumbs fold to "‹ Parent". 80x24 is not a phone. |
| `SHORT_ROWS` | 30 | Below this many rows a layout drops blank spacer rows. |
| `BOTH_PANES_COLS` | 96 | A list and its detail sit side by side from here. |
| `LIST_MIN_COLS` | 35 | The list's least width beside a detail. |
| `DETAIL_MIN_COLS` | 60 | The detail's least width. |
| `SETTINGS_RAIL_COLS` | 100 | A settings page shows its section menu beside the sections from here. |
| `SETTINGS_RAIL_W` | 24 | Width of that menu. |
| `ASIDE_COLS` | 138 | A summary or facts rail sits beside the main column from here. |
| `ASIDE_W` | 44 | Width of that rail. |
| `WIZARD_STEPS_COLS` | 100 | A wizard's step list sits beside its body from here. |
| `DASH_CARD_MIN` | 38 | A dashboard card's least width. `dashTracks(cols)` gives the number of tracks. |
| `DASH_TRACKS_MAX` | 4 | Most dashboard tracks. |

What that gives per terminal width:

| Terminal | Header crumbs | List and detail | Settings menu | Aside | Wizard steps | Dashboard tracks |
|---|---|---|---|---|---|---|
| 60 cols | "‹ Parent" | one pane | strip | above | row | 1 |
| 80 | full from 75 | one pane | strip | above | row | 1-2 |
| 100 | full | one pane | strip | above | row | 2 |
| 120 | full | both | strip | above | row | 2 |
| 160 | full | both | rail | beside | beside | 3 |
| 200 | full | both | rail | beside | beside | 4 |

The values differ from the web's px thresholds divided by 8 where a terminal column carries more than 8 px of web
layout. `termBreaks.ts` notes the web value beside each one.

## Layout faults

The page gate checks every case at both sizes. `render.ts --layout` checks one render. A fault is never allowed
and is never removed by `--update`.

| Fault | Meaning | Fix |
|---|---|---|
| `overdraw` | Two siblings in the normal flow share cells. | Let the row wrap, let one side shrink with a truncating `Text`, or drop one. |
| `cut` | A child is laid out past its box. | Make room (wrap, scroll), or declare `drops`. |
| `text-cut` | Wrapped text is taller than its box. | Give it room, or `truncate` / `maxLines`. |
| `offscreen` | The frame is not exactly cols × rows, or row 0 is not the top bar. | The root must be the terminal. See the note below. |
| `popup-clipped` | An absolutely placed box is cut by an enclosing box. | Put it on a `Layer`. |
| `scrolled-open` | A scroll box is not at its top on the first frame. | An auto focus must not scroll. A shot that opens scrolled on purpose declares `scrolled: true`. |
| `explosion` | A box is more than 20 screens wide or tall: a percent size resolved against an undefined size. | Give the parent a definite size, or do not use a percent there. |

Not checked: absolutely placed nodes, the content of a scroll box, invisible and zero-size nodes.

A fault path names the nodes from the root down. Raw HTML drawn by the compat runtime is named `tag.class`
(`div.choices > button.choice`). A prim box is named by the components that own it (`Toolbar<SchedulesPage`), in
test mode only.

Note on `offscreen`: a full-screen layer (a drawer at 80 columns, a `Sheet`) covers the top bar. The gate then
reports "row 0 is not the top bar" for a shot that opens one (for example `schedules` case `shot-new-chooser` at
80x24). This is a known limit of the gate.

## Borders and frames

- `border` draws a one-cell frame. `border={['left']}` draws one side.
- A frame costs two columns and two rows. On an 80-column screen prefer a left rule or a blank row to a full frame.
- Layers draw their own frame. Do not wrap a layer's content in another border.

## Checklist for a layout

- [ ] Drawn at 80x24 and 120x40 with `render.ts --layout`: no fault.
- [ ] One part of every row can shrink. Nothing fixed is wider than 80 columns less the shell.
- [ ] Width decisions read `usePaneSize()` or `useBoxSize()`, not the terminal.
- [ ] Fewer than 30 rows: no blank spacer rows.
- [ ] Every cut is a `truncate`, a `ClipText` or a declared `drops`.
