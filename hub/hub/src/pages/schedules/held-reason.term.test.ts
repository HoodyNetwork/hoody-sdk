// Drawing schedules must never log "ActionMenu: disabled item(s) without a reason: run, edit, pause,
// delete" (kit Menu.model: a disabled item needs a disabledReason). While a change to a row is still waiting (`held`),
// its Run now / Edit / Turn off / Delete are disabled; each now says why, in the row menu and the inspector's ⋯ menu.
import { expect, test } from 'bun:test';
import defaultFixtures from './fixtures';
import { model, type RawSchedules } from './logic';
import { headerParts, rowEntries } from './parts/RowActions';

const raw = (defaultFixtures.states.many.schedules as { data: RawSchedules }).data;
const t = ((k: string) => k) as Parameters<typeof rowEntries>[0];
const h = { onRun: () => {}, onPause: () => {}, onEdit: () => {}, onDelete: () => {} };
type Item = { id: string; isDisabled?: boolean; disabledReason?: string };
const items = (list: readonly unknown[]): Item[] => list.filter((e): e is Item => typeof e === 'object' && e !== null && 'id' in e);

test('every disabled schedule action says why (row menu and inspector menu)', () => {
  const rows = model(raw).rows;
  expect(rows.length).toBeGreaterThan(0);
  let disabled = 0;
  for (const row of rows) {
    for (const e of [...items(rowEntries(t, row, true, h)), ...items(headerParts(t, row, true, h).menu)]) {
      if (!e.isDisabled) continue;
      disabled++;
      expect({ id: e.id, reason: e.disabledReason }).toEqual({ id: e.id, reason: 'op.heldReason' });
    }
  }
  expect(disabled).toBeGreaterThan(0);
  // Not held: nothing is disabled, so no reason is set.
  for (const row of rows) for (const e of items(rowEntries(t, row, false, h))) expect(e.disabledReason).toBeUndefined();
});
