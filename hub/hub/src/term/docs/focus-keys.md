# Focus and keys

A terminal has no DOM event path and no browser focus. The prims in `src/term/prim/focus.ts` supply both.

## The model

- A **focus scope** is a `FocusRoot`. The app has one for the page. Each trapping layer has its own.
- A **focusable** registers with the nearest scope: every `Pressable`, `TextInput`, `FieldInput`, `SecretInput`
  and `Compose`, and anything built with `useFocusable`.
- At most one focusable in a scope has the focus. It may be none.
- **Tab order is by region, then drawn position.** A scope can hold regions (`<FocusRegion order={n}>`). Tab goes
  through the regions in their `order`, lowest first, and inside a region by drawn position: top to bottom, then
  left to right. Shift+Tab is the exact reverse. Anything outside every region comes after all regions. A scope with
  no regions orders everything by drawn position. There is no `tabIndex` order.
- `FocusRegion` draws nothing and lays nothing out: it only marks what is inside it. A `FocusRoot` inside a region
  starts with no region, so layers, menus and the Ask dock keep their own order.
- The shell marks three regions (`REGION` in `src/term/shell/TermShell.tsx`): sidebar 0, top bar 1, page 2. That is
  the web's DOM order (`shell/AppShell.tsx`: Sidebar, TopBar, main). Below 100 columns there is no sidebar: top bar,
  then page.

## Where a key goes

In this order. The first to take the key ends it.

1. An open trapping layer (modal or popover). The top one gets every key. The page gets none. See
   [overlays.md](overlays.md).
2. The shell keymap, capture phase: Ctrl+C, Ctrl+Z, the lock, Ctrl chords, Alt chords, page chords.
3. Tab and Shift+Tab move the focus in the scope. F6 and Shift+F6 move it to the first tab stop of the next or
   previous region, wrapping; with nothing focused, F6 enters the last region (the page) and Shift+F6 the first. No
   handler sees these keys, so they work from inside a text field. A scope with fewer than two regions ignores F6
   and Shift+F6, and the key passes on to the handlers below. F6 is the terminal's form of the web's "Skip to
   content" link.
4. The focused thing's own handler (`onKey` of a `Pressable` or a field). A text field takes every printable key.
5. Shortcut handlers registered with `useKeys`, newest first.
6. The shell keymap, bubble phase: the `g` jumps, `/`, `?`, `[`, `q`, then the page's single keys.

A handler takes a key by returning `true`. Returning `false` or nothing passes it on.

Because a focused text field takes printable keys at step 4, single-key shortcuts do not fire while typing. `q` in
a search field types a q.

## Making something pressable

```tsx
<Pressable onPress={() => open(row)} sem={{ name: row.name }}>
  <Text>{row.name}</Text>
</Pressable>
```

- Enter and Space press it. A mouse click presses it and gives it the focus.
- `onPress` receives `{ x, y }` for a mouse press and nothing for a key press.
- While focused, a `Pressable` with plain children paints its box and its `Text`s in the focus colours. In mono it
  is bold and underlined instead.
- `children` may be a function `({ focused }) => node`. Then the `Pressable` paints nothing and you draw the focus.
  `focusPaint={false}` also turns the default paint off.
- `disabled` makes it inert: no focus, no press. A press on it is still consumed, so a clickable row around it does
  not fire. Becoming disabled while focused gives the focus up.
- `tabStop={false}` is the web's `tabIndex={-1}`: reachable by a click or `focus()`, skipped by Tab.
- `autoFocus` takes the focus when nothing has it. An auto focus never scrolls a `Scroll`.
- `onKey` handles keys beyond Enter and Space while it is focused.

A control that is disabled but must say why stays focusable and shows its reason while focused. Kit buttons do this
through `SoftPress` in `src/kit/controls/termPress.tsx`. Use the kit `Button`, not a bare `Pressable`, when you need
it.

## The mouse press rule

One rule for every `Pressable`, every `Box onPress` and every clickable raw HTML element:

- Only the primary button.
- Mouse down on a pressable arms it and is consumed. Enclosing pressables never arm.
- Mouse up on the same box fires the press. Released elsewhere, the press is cancelled.

So a button inside a clickable row never also fires the row.

## Shortcuts in a component

```tsx
useKeys((k) => {
  if (k.name === 'r' && !k.ctrl) { reload(); return true; }
  return false;
});
```

- `useKeys` must be called under a `FocusRoot`. Outside one it registers nothing and reports nothing.
- `k.name` is the engine's key name: `'return'`, `'escape'`, `'space'`, `'tab'`, `'up'`, `'down'`, `'left'`,
  `'right'`, `'home'`, `'end'`, `'pageup'`, `'pagedown'`, `'backspace'`, `'delete'`, or the character. Modifiers are
  `k.ctrl`, `k.shift`, `k.meta` (Alt).
- A page declares its keys with the shared `usePageShortcuts` (`src/shell/pageShortcuts.ts`). The same list drives the
  web and the terminal. Use `useKeys` only for keys that belong to one terminal component.

## Moving and restoring focus

`useFocusControl()` returns:

| Method | Does |
|---|---|
| `current()` | The focused thing's id, or null. |
| `restore(id)` | Gives the focus back to that id. Does nothing when it is gone or disabled. |
| `moveFocus(1 \| -1)` | One Tab or Shift+Tab step. |
| `moveRegion(1 \| -1)` | One F6 or Shift+F6 step. False when the scope has fewer than two regions. |
| `focusFirst(within?)` | Focuses the first tab stop in reading order, inside a box when given. False when there is none. |
| `containsFocus(box)` | True when the focused thing is drawn inside the box. |
| `blur()` | Nothing has the focus afterwards. |
| `inField()` | True when the focused thing is a text editor. |

Pattern for a pane that opens and closes inside the page:

```tsx
const focus = useFocusControl();
const opener = useRef<FocusId | null>(null);
const open = () => { opener.current = focus.current(); setOpen(true); };
const close = () => { setOpen(false); focus.restore(opener.current); };
```

A layer does not need this. The page's scope sees no key while a layer is open, so the opener still has the focus
when the layer closes.

Other hooks: `useFocusWithin(ref, cb)` tells you when the focus enters or leaves a box. `useFocusChange(focused, cb)`
calls back when a flag flips.

## Focus and scrolling

- `<Scroll followFocus>` scrolls the focused thing into view when the focus moves by Tab, a click or `focus()`.
- A sticky header or footer inside the page's scroll never covers the focused thing: after it comes into view, the
  page scroll (`src/kit/layouts/termScroll.tsx`) moves it clear of the sticky boxes, as little as possible. A thing
  taller than the room left shows its top. This is the web's `scroll-padding`. Code: `stickyPadding` and
  `clearOfSticky` in `src/term/jsx/sticky.ts`. Test: `src/kit/layouts/termScroll.term.test.tsx`.
- Tab skips a focusable that is fully outside a `Scroll` that does not follow focus. It would land somewhere
  nobody can see.
- Tab skips anything under an invisible ancestor.

## Text fields and keys

- Esc in a text field first goes to the field (a search field clears its text). A second Esc leaves the field:
  focus returns to the last control that was not a field.
- The focus moves in the scope at once but in the engine only when React commits. `FieldInput` handles keys typed
  in between. Do not build a field on the raw engine input: use `FieldInput`.
- `useTerminalBlur(cb)` fires when the terminal window loses focus. A revealed secret masks itself then.

## The shell keymap

The terminal binds the same declarations the web binds: the shortcut table in `src/shell/shortcuts.pure.ts`, the
jumps in `src/shell/keys.pure.ts` and each page's `usePageShortcuts` list. The binding is in
`src/term/shell/keymap.ts`. `Mod` is Ctrl. The capture phase is a key listener mounted before the app's `FocusRoot`.
The bubble phase is a `useKeys` handler of that root.

| Key | Does |
|---|---|
| Ctrl+K | Command palette |
| `/` | Search |
| `?` | Key sheet |
| `[` | Sidebar |
| Alt+J | Ask dock. The web's Ctrl+J is a line feed in a terminal, so the terminal binds Alt+J (`TERM_CHORDS`). |
| Alt+R | Realm switcher |
| Alt+C | Computer switcher |
| `g` then `h` `c` `b` `a` `p` `s` `l` `n` `t` | Go to Home, Computers, Bots, Apps, Programs, Schedules, Logs, Notifications, Scripts. The second key must follow within 1 second. |
| Tab, Shift+Tab | Move the focus |
| F6, Shift+F6 | Jump to the next or previous area (sidebar, top bar, page). Listed on the `?` sheet (`TERMINAL_ROWS`, `keys.region`). |
| Enter, Space | Press |
| Esc | Close the top layer, or leave a text field |
| `q` | Quit, unless a text field has the focus. Never bind `q` in a component: its hint would invite a press that quits when the focus is elsewhere. |
| Ctrl+C | Asks first when something is at stake. A second press leaves. |
| Ctrl+Z | Suspend |

### What a terminal cannot tell apart

These arrive as the same bytes unless the terminal speaks the Kitty keyboard protocol:

| Pressed | Arrives as |
|---|---|
| Ctrl+M | Enter |
| Ctrl+I | Tab |
| Ctrl+[ | Esc |
| Ctrl+H | Backspace, on many terminals |
| Shift+Enter | Enter, on most terminals |
| Ctrl+Shift+letter | Ctrl+letter |
| Ctrl+S, Ctrl+Q | May be held by the terminal's flow control |

Do not bind a page key to any of them. A page shortcut on such a chord can still be run from the palette. The `?`
sheet lists the conflicts (`TERMINAL_ROWS` in `src/term/shell/keymap.ts`).

## Checks

- A scenario step `{ key: 'tab' }` followed by `expect: { focused: { role: 'button', name: 'Close' } }` proves Tab
  order. See [scenarios.md](scenarios.md).
- `src/term/test/focus-scope.term.test.tsx` and `src/term/test/focus-active.term.test.tsx` hold the scope rules.
- `src/term/test/focus-region.term.test.tsx` holds the region order, F6 and the hidden-focus hand-off inside a
  region; `src/term/app/tab-regions.term.test.tsx` checks it on Notes and AI in the real shell.
