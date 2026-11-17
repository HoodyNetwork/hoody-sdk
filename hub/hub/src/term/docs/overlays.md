# Overlays

A layer is a panel drawn above the page: a dialog, a drawer, a popover, a menu, a tip, the toast stack. The prim is
`Layer` in `src/term/prim/Overlay.ts`. It is not in the prim barrel: import it from the file.

Most ports never use `Layer` directly. The kit overlays already have siblings. Use those first.

## Use the kit overlay when one fits

| Kit component | File | Terminal form |
|---|---|---|
| `Dialog` and its confirm forms | `src/kit/overlays/Dialog.term.tsx` | Centred modal. Widths: `sm` 60, `lg` 70, `xl` 100 columns. |
| `Drawer` | `src/kit/overlays/Drawer.term.tsx` | Right side sheet. Widths: `sm` 60, `md` 80, `lg` 110. Full screen when it would leave the page under 20 columns. |
| `Popover` | `src/kit/overlays/Popover.term.tsx` | Anchored panel. Widths: `sm` 35, `md` 40, `lg` 45, `picker` 55, `wide` 80, `bell` 50. |
| `Sheet` | same file | Full-screen panel. |
| `Tooltip` | same file | A tip. Does not trap keys. |
| `ActionMenu` | `src/kit/overlays/Menu.term.tsx` | Anchored menu. |
| `InfoTip`, `InfoLine` | `src/kit/overlays/InfoTip.term.tsx` | A tip with help text. |

Shared code that renders `<Dialog>` or `<Drawer>` works in the terminal unchanged.

The shell has its own modal for its own surfaces (palette, key sheet, switchers): `Modal` in
`src/term/shell/layer.tsx`. Pages do not use it.

## The three kinds

| `kind` | Keys | Outside press | Under it |
|---|---|---|---|
| `modal` | Trapped. Tab cycles inside. The page gets no key. | Lands on a scrim, calls `onOutside`. | Dimmed in colour tiers. Hidden in mono. |
| `popover` | Trapped, the same way. | Lands on an invisible catcher, calls `onOutside`. | Unchanged. |
| `tip` | Not trapped. Keys go to what is under it. Esc closes the top tip first. | Passes to the page. | Unchanged. |

Esc closes the top layer only, through its `onEscape`.

In the mono tier the modal scrim cannot dim, so it covers everything beneath, a lower layer included. A confirm
over a drawer hides the drawer. This is a rule, pinned by
`src/term/prim/Overlay.opaque.term.test.tsx`.

## A layer of your own

```tsx
import { useState } from 'react';
import { Box, Text, Pressable } from '../../term/prim';
import { Layer, useAnchor } from '../../term/prim/Overlay';

function Pick() {
  const [open, setOpen] = useState(false);
  const anchor = useAnchor();
  return (
    <Box dir="column">
      <Box boxRef={anchor.ref} alignSelf="flex-start">
        <Pressable autoFocus onPress={() => setOpen(true)} sem={{ name: 'Realm' }}><Text>Realm ▾</Text></Pressable>
      </Box>
      <Layer open={open} kind="popover"
        place={{ at: 'anchor', anchor: anchor.rect, side: 'bottom', align: 'start', width: 24 }}
        onEscape={() => setOpen(false)} onOutside={() => setOpen(false)} sem={{ role: 'dialog', name: 'Realms' }}>
        <Pressable onPress={() => setOpen(false)} sem={{ name: 'Production' }}><Text>Production</Text></Pressable>
        <Pressable onPress={() => setOpen(false)} sem={{ name: 'Staging' }}><Text>Staging</Text></Pressable>
      </Layer>
    </Box>
  );
}
```

- `useAnchor()` gives `{ ref, rect }`. `ref` goes on the `Box` around the trigger. `rect` is read when the layer
  renders, so a resize re-places the panel.
- `Layer` renders nothing while `open` is false. State inside it starts fresh on each open.
- The first tab stop inside gets the focus on open (`initialFocus="first"`, the default). Pass `"none"` to leave
  the focus unset.
- When the layer closes, the trigger still has the focus. You write no code for that.

## Placement

| `place` | Where |
|---|---|
| `{ at: 'center', width, top? }` | Centred. `top: 'fifth'` starts 20 % down, `'tenth'` 7.5 % down. |
| `{ at: 'right', width, minPage? }` | Right side, full height. Full screen when the page would keep fewer than `minPage` columns (default 20). |
| `{ at: 'full' }` | The whole screen. |
| `{ at: 'anchor', anchor, side?, align?, width, gap?, fallback? }` | Against a rectangle. `side` is `bottom`, `top`, `start` or `end`. It flips when it does not fit. `fallback: 'bottom'` puts a beside placement below instead. |
| `{ at: 'corner', corner, width, margin? }` | A screen corner. The toast stack uses it. |

Placement is the pure function `placeLayer`. It runs on every render and clamps the panel to the screen. An
anchored panel is measured off screen on its first frame, then placed, so it never shows at a guessed position.

## Other `Layer` props

| Prop | Meaning |
|---|---|
| `frame` | `'single'`, `'double'` or `'none'`. Default: single for every kind (a modal is told apart by its scrim). |
| `frameTitle`, `frameColour` | Title in the top border and the border's colour. |
| `bg` | Panel colour. Default `card`. The panel is opaque in every tier. |
| `padX` | Columns of padding inside the frame. |
| `onKeyFirst` | A key handler that runs before the layer's own focus handling. |
| `sem` | Role and name of the panel. A modal's node also gets `modal: true`. |

Inside a layer, `useLayer()` returns `{ settled, width, height, tab }`. `settled` turns true after the first focus
was placed. `tab(back?)` moves the focus inside the layer.

## Rules

1. **A popup is always a `Layer`.** An absolutely placed `Box` inside the page is cut by the first enclosing box.
   The layout gate reports it as `popup-clipped`.
2. **Do not manage focus return.** The page's scope sees no key while a trapping layer is open.
3. **Do not add your own Esc handler inside a layer** for closing. Pass `onEscape`.
4. **Wrap a layer's scrolling body in `PaneSize` and `Scroll followFocus`** when it can be taller than the screen.
   `Dialog` and `Drawer` do this. Width questions inside then get the panel's width, not the terminal's.
5. **A layer keeps the React context of the component that declares it.** A form in a drawer still sees its query
   client and router.
6. **`OverlayHost` is mounted once by the app.** Tests that open a layer wrap the tree in `<OverlayHost>` inside
   their `FocusRoot`.

## Other exports you may meet

- `useLayerCount()`: how many layers are open. The shell uses it to make the page's `FocusRoot` inactive.
- `useGlobalKey(handler)`: a key handler ahead of every layer. For the shell only.
- `useEnteredKeys`: for a surface that is always drawn but takes keys only after it was entered. The toast stack.
- `Above` and `TOP_Z`: a portal for something above every layer that is not a layer.

## Checks

- A scenario for an overlay opens it with a `press` step and checks `{ focused: ... }`, then `{ key: 'escape' }`
  and checks the trigger is focused again.
- The page gate draws `shot-<name>` cases that open drawers and dialogs at 80x24 and 120x40.
