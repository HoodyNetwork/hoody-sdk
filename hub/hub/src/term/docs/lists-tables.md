# Lists and tables

## Use the kit table

`DataTable` has a sibling: `src/kit/data/DataTable.term.tsx`. A page that renders `<DataTable>` with its column
definitions works in the terminal unchanged.

What the terminal table does:

- **Columns.** The web's column planner runs in cells (`src/kit/data/DataTableTermLayout.ts`). `fit` columns measure
  their words. Columns drop by priority. The pinned column never drops.
- **List rows.** When the name, the status and one more column no longer fit, rows become two-line list rows, as on
  the web. The web's card and icon views are drawn as list rows too.
- **Virtual rows.** Only the lines in view are drawn. 5,000 rows cost what 30 do.
- **Row marks.** A row the page marks (`rowMark`: an unread notice, the browser in use) shows `•` in the cell after
  the cursor bar, in its tone's colour (`ink`, `accText`). The cursor never covers it. The mark only draws: the row's
  own words, shown or read aloud, say why it is marked.
- **Clean copies.** Values are separated by spaces, never by box-drawing characters. The cursor bar, row marks,
  checkboxes and scrollbar are `TableMark`s, which a mouse selection leaves out.

Keys on the focused table:

| Key | Does |
|---|---|
| `j` / `k`, Down / Up | Move the cursor |
| Home, End, PageUp, PageDown | Jump |
| Enter, `o` | Open the row |
| Space, `x` | Select the row. Shift + arrows extend. |
| Esc | Clear the selection |
| `.` | Open the row menu |
| Left, Right | Fold or unfold an expandable row |
| A row action's own key | Runs that action |

First focus: when a page opens, the table takes the focus by itself only when it is the page's own list, so Down
moves its row cursor at once. That is one of three cases:

- it fills its pane;
- it is the list of a `ListDetailPage`;
- it is inside a `TableHome` (`src/term/prim/TableHome.ts`), the mark for a page-wide table with more page under it.

A table inside a section (the sign-in sessions on Account) never takes the first focus: Down would move rows the
reader may not see. This first focus never scrolls the page. The kit `TablePage` sets
`TableHome` around its table.

Mouse: a click puts the cursor on a row. A click on the cursor row, or a double click, opens it. The wheel scrolls.

Other data siblings in `src/kit/data`: `Address`, `ComputerMark`, `Display`, `FilterChips`, `Ids`, `IpInfo`,
`Ledger`, `cells`, `drag`.

### Row spacing

Rule: **rails are always compact.**

| Where the list rows are | Blank line between rows |
|---|---|
| A rail: a `ListPane` with `rail` or `flush` (a narrow list beside the page, or `RailPane` as the whole stacked screen) | Never, at any terminal height. The selection and focus marks carry the separation. |
| A full-width list, normal density, terminal taller than 30 rows | One. |
| A full-width list, normal density, 30 rows or fewer | None. |
| Any list in compact density | None. |

Table rows (one line each, in columns) never have a blank line between them.

Code: `listGap` in `src/kit/data/DataTable.term.tsx`. Test: "list rows: a rail (beside the page or flush) is always
compact, at every height" in `src/kit/data/DataTable.term.test.tsx`, at 24, 40 and 60 rows. A page
does not set this; it follows from the pane the table is in.

## Cell text

A cell must never overflow. Choose how each value gives way (`CellCut`):

| `cut` | For | Result |
|---|---|---|
| `'end'` | Names, sentences | `backup-nightl…` |
| `'start'` | Ids whose tail matters | `…a91f3c` |
| `'path'` | File and URL paths | `…/share/ada` |
| `'never'` | Status words, verbs | Not cut. The planner gives the column its widest value. |

- `ClipText` is a one-line component that measures its own box and cuts by kind. Use it for a row whose width is
  known only after layout.
- `cutCells(text, width, cut)` is the pure function.
- `<Text truncate>` cuts at the end only.
- Width is counted in cells with `cellWidth`: wide CJK characters and emoji are 2.
- `oneLine(text)` folds tabs and line breaks before a value goes into a row.

## A long list of your own

Use `useListWindow` when the kit table does not fit (a log view, a picker).

```tsx
import { useState } from 'react';
import { Box, useBoxSize, useKeys } from '../../term/prim';
import { useListWindow, ScrollThumb } from '../../term/prim/ListWindow';
import { ClipText } from '../../term/prim/TableClip';

function Lines({ rows }: { rows: readonly string[] }) {
  const [cursor, setCursor] = useState(0);
  const [size, onSize] = useBoxSize();
  const heights = rows.map(() => 1);                       // lines per item; memoise for a large list
  const w = useListWindow({ heights, cursor, view: size?.height ?? 5 });
  useKeys((k) => {
    if (k.name === 'down') { setCursor((c) => Math.min(rows.length - 1, c + 1)); return true; }
    if (k.name === 'up') { setCursor((c) => Math.max(0, c - 1)); return true; }
    return false;
  });
  return (
    <Box dir="row" grow={1} onSize={onSize} onWheel={(e) => w.scroll(e.scroll?.direction === 'up' ? -3 : 3)}>
      <Box dir="column" grow={1}>
        {rows.slice(w.from, w.to).map((r, i) => (
          <ClipText key={w.from + i} text={`${w.from + i === cursor ? '▌' : ' '} ${r}`} />
        ))}
      </Box>
      <ScrollThumb bar={w.bar} view={w.view} />
    </Box>
  );
}
```

- `heights[i]` is the number of lines item `i` takes.
- `view` is the number of lines the list has. Measure it with `useBoxSize`.
- The window follows the cursor when the cursor moves. The wheel moves the window alone (`w.scroll`).
- Draw only `rows.slice(w.from, w.to)`.
- With items taller than one line, the first drawn item may start above the window: see `lineOf` and `offsets` on
  `ListWindow`.
- In real code the keys belong to a focusable (`useFocusable({ onKey })`), so they act only while the list has the
  focus. `useKeys` here keeps the example short.

## Scrolling a page region

For content that is not a list of rows, use `Scroll`:

```tsx
<Scroll followFocus grow={1} shrink={1}>{children}</Scroll>
```

- `followFocus` brings the focused control into view on Tab.
- `stickBottom` keeps the view at the end while content is appended. A log tail.
- A scroll box must open at its top. The page gate reports `scrolled-open` otherwise.
- Page layouts decide which region owns the scroll (`src/kit/layouts/termScroll.tsx`). A sibling inside a page
  layout does not add a second `Scroll` around itself.

## Empty, loading and error states

Use the kit state components. Their siblings are in `src/kit/states`: `Band.term.tsx`, `ErrorDetails.term.tsx`,
`Handoff.term.tsx`, `Spinner.term.tsx`, `Toast.term.tsx` and `States.term.tsx` (the empty, loading and error
states). A table passes its states through `DataTable` props as on the web.

A fixture state that loads forever never settles. The page gate reports such a case as `unsettled`. See
[gates.md](gates.md).
