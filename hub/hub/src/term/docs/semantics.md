# The semantics tree

The semantics tree says what each thing on screen is: its role, its name, its state and what can be done to it. It
is the terminal's stand-in for the browser's accessibility tree.

Three things read it:

- scenarios, to find a control "by role and name" as web tests do;
- agents, which read the page as text instead of reading the frame;
- the secret gate, which searches it for leaked values.

Code: `src/term/prim/semantics.ts` and `src/term/prim/semdom.ts`.

## Where nodes come from

| Source | Node |
|---|---|
| `Pressable` | `button` |
| `TextInput`, `FieldInput` | `textbox`. With `mask`: a secret. |
| `Box`, `Text`, `Scroll` | A node only when they carry a `sem` prop. |
| Raw HTML drawn by the compat runtime | From `role`, `aria-*`, `alt`, `title`, `<label>` and the tag's implicit role (`semOfDom`). |
| `SemOnly` | A meaning that draws nothing: an `<img alt>`, screen-reader-only text. |

A sibling refines what the prim knows:

```tsx
<Pressable onPress={toggle} sem={{ role: 'switch', name: label, checked: on }}>
  <Text>{on ? '[■ on ]' : '[ □ off]'}</Text>
</Pressable>
```

## A node

`ref`, `role`, `name`, `id`, `description`, `value`, `level`, `states`, `actions`, `controls`, `popup`, `box`
(position in cells), `children`.

States: `disabled`, `readonly`, `required`, `invalid`, `busy`, `focused`, `checked`, `selected`, `expanded`,
`pressed`, `current`, `modal`, `multiline`, `secret`.

Actions: `focus`, `press`, `click`, `type`, `setValue`, `clear`, `scroll`, `dismiss`.

## Rules

- **Name.** `sem.name` wins. Else a label (`labelledBy` or a `<label>`). Else, for buttons, links, checkboxes, tabs,
  cells and headings, the text inside.
- **Decoration is not part of the name.** If you draw `[Save]`, the name must be `Save`. Pass
  `sem={{ name: textOf(children) }}`, or draw the decoration in a node with `sem={{ hidden: true }}`.
- **Secrets.** A `secret` node never carries its value. No text under it is collected. Its value prints as
  `=<secret>` or `=<empty secret>`.
- **Focus and disabled.** `focus` is offered when the focus system accepts the node. `press` is offered only when
  the node is not disabled. A button that is disabled with a reason offers `focus` and not `press`.
- **Actions use the real input path.** `act(node, 'press')` focuses the node as a click would, then writes Enter
  (Space for a checkbox, switch or radio) to the renderer's input. `click` is a mouse down and up at the node's
  middle. `type` is one keystroke per character. An action the node does not offer is refused unless forced.

## Text form

`semText(tree, { actions: true })` prints one line per node, two spaces of indent per level:

```
<role>[<level>] "<name>" [#id | ~n] [=<value> | =<secret> | =<empty secret>] [states...] [controls=#id] [popup=x] [(<description>)] [{actions}]
text "<a run of text>"
```

- States print as words: `disabled readonly required invalid busy focused checked|unchecked|checked=mixed selected
  expanded|collapsed pressed current[=page] modal multiline`.
- Plain text appears as `text` lines. Text that names a control is not repeated.

Real output of the two-field example in [prims.md](prims.md):

```
textbox "Name" ="atlas" {focus,type,setValue,clear}
textbox "Password" =<secret> focused {focus,type,setValue,clear}
```

An illustration of a page (format only, not captured from a run):

```
navigation "Hub"
  link "Schedules" current=page {focus,press,click}
main "Schedules"
  heading[1] "Schedules"
  button "New schedule" {focus,press,click}
  searchbox "Search schedules" ="" {focus,type,setValue,clear}
  table "Schedules"
    row "nightly-backup" selected {focus,press,click}
      cell "nightly-backup"
      cell "Every day at 02:00"
  region "nightly-backup"
    switch "Enabled" checked {focus,press,click}
    button "Delete" disabled (Stop the schedule first.) {focus}
```

## Addressing a node

- By `#id` when it has one.
- Else by `role "name"`, with `~n` for the n-th node of the same role and name: `getByRef(tree, 'button "Open"~2')`.

A ref is stable across renders while role, name and order are.

## Queries

```ts
import { semanticsOf, getByRole, act, semText } from '../../term/prim/semantics';

const tree = semanticsOf(t.renderer);
const add = getByRole(tree, 'button', { name: 'Add' });
act(add, 'press');
```

| Query | Returns |
|---|---|
| `getByRole(tree, role, { name, ... })` | Exactly one node. Throws `SemQueryError` otherwise. |
| `queryByRole` | One node or null. |
| `getAllByRole`, `queryAllByRole` | Lists. |
| `getByText`, `queryAllByText` | By text. |
| `getByRef` | By `#id` or `role "name"~n`. |
| `within(node)` | A subtree to query in. |
| `focusedNode(tree)` | The node with the focus, or null. |

`semJson(tree)` gives the tree as JSON.

## See the tree of a page

```
bun scripts/term/render.ts --page schedules --sem
bun scripts/term/render.ts --page schedules --sem-only
```

`--sem` prints the tree after the frame. `--sem-only` prints the tree alone.

## Checklist for a sibling

- [ ] Every control has a role and a name a person would say.
- [ ] Names hold no brackets, marks or state words.
- [ ] State is in `sem` (`checked`, `expanded`, `selected`, `invalid`, `disabled`), not only drawn.
- [ ] A disabled reason is the node's `description`.
- [ ] A group that the web gives a role (`dialog`, `table`, `radiogroup`, `status`, `alert`) has it here too.
