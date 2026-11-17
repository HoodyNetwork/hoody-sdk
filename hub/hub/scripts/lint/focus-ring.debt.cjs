// hub/focus-ring-token debt: every kit outline in a focus colour, outside forced-colors, that the rule
// leaves. It only shrinks: a change that fixes a row deletes it here and in FROZEN (app/conformance.focusring.test.ts), which
// fails a row that hits nothing, an unlisted hit and any row FROZEN does not hold. A row covers one declaration. fixBy names
// the change that removes the row; keep marks an outline that is no focus ring (a drop target's mark), with its reason in why.
// Keyed as control-size.debt.cjs: file (after hub/src/), at-rules (`at`, outermost first, absent when none), selector,
// property and value. base.css draws the global default ring and is not linted by the rule (stylelint.config.mjs).
module.exports = {
  ROWS: [
    {
      file: 'kit/data/DataTable.module.css',
      selector: '.cards .tr:focus-visible',
      prop: 'outline',
      value: 'var(--bw-2) solid var(--hx-focus)',
      fixBy: 'focus-ring token',
      why: 'a card row rings outside its clipped frame and a cut card draws its own ring (CardEdge cutRingPath); the focus-ring token change moves both to --focus-ring together',
    },
    {
      file: 'kit/data/DataTable.module.css',
      selector: '.icons .tr:focus-visible',
      prop: 'outline',
      value: 'var(--bw-2) solid var(--hx-focus)',
      fixBy: 'focus-ring token',
      why: 'an icon tile rings as a card does (the same outline shape); the focus-ring token change moves it to --focus-ring with the cards',
    },
    {
      file: 'kit/data/DataTable.module.css',
      selector: '.wrap[data-drop-over], .nothing[data-drop-over]',
      prop: 'outline',
      value: 'var(--bw-2) solid var(--hx-focus)',
      fixBy: 'keep',
      why: 'drop target mark: the table body a drag lands in, drawn in the focus colour; not a focus ring',
    },
    {
      file: 'kit/data/DataTable.module.css',
      selector: '.tr[data-drop-over]',
      prop: 'outline',
      value: 'var(--bw-2) solid var(--hx-focus)',
      fixBy: 'keep',
      why: 'drop target mark: the row a drag drops into, drawn in the focus colour; not a focus ring',
    },
  ],
};
