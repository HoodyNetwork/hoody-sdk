// Vitest: a disabled row action says why. The inline verb, the hover icons and the coarse-pointer
// open chevron take RowAction.disabledReason like a menu item: the control is soft-disabled (focusable, aria-disabled,
// no press), the reason is its accessible description and its tip, and no press, key or the row's own shortcut runs it
// or opens the row. A `short` inline word keeps its whole label as the name, and its tip starts with it ("Name. Reason",
// as an icon button's).
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createColumnHelper } from '@tanstack/react-table';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTable, type RowActionEntry } from './DataTable';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
}
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary' } })];
const DATA: Row[] = [{ id: 'a', name: 'alpha' }];
const rowOf = () => screen.getByText('alpha').closest('tr') as HTMLTableRowElement;
const REASON = 'Wait until the change on its way is done';
const noop = () => undefined;

/** Pointer media for useMedia: a phone (coarse, no hover) or a mouse. */
function setCoarse(on: boolean) {
  const hit = (q: string) => on && (q.includes('coarse') || q.includes('hover: none'));
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({ matches: hit(q), media: q, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop, onchange: null, dispatchEvent: () => false })),
  );
}
afterEach(() => vi.unstubAllGlobals());

function table(actions: readonly RowActionEntry[], presentation: 'table' | 'list' | 'cards' = 'table', onRowAction = vi.fn(), data: Row[] = DATA) {
  render(<DataTable label="Rules" presentation={presentation} data={data} columns={COLUMNS} getRowId={(r) => r.id} onRowAction={onRowAction} actions={() => actions} />);
  return onRowAction;
}

/** Every way a person could try it: a click, Enter and Space on it, and the row's own single-key shortcut. */
function tryAll(b: HTMLElement, key?: string) {
  fireEvent.click(b);
  fireEvent.keyDown(b, { key: 'Enter' });
  fireEvent.keyUp(b, { key: 'Enter' });
  fireEvent.keyDown(b, { key: ' ' });
  fireEvent.keyUp(b, { key: ' ' });
  const row = b.closest('tr');
  if (key && row) fireEvent.keyDown(row, { key });
}

describe('DataTable: a disabled inline row action says why', () => {
  for (const presentation of ['table', 'list', 'cards'] as const) {
    it(`${presentation}, short label: soft-disabled, focusable, "Name. Reason" described, nothing runs or opens`, () => {
      setCoarse(false);
      const edit = vi.fn();
      const open = table([{ id: 'edit', label: 'Edit rule', short: 'Edit', inline: true, key: 'e', isDisabled: true, disabledReason: REASON, onAction: edit }], presentation);
      const b = screen.getByRole('button', { name: 'Edit rule' });
      expect(b).toHaveTextContent('Edit');
      expect(b).toHaveAttribute('aria-disabled', 'true');
      expect(b).not.toBeDisabled();
      expect(b).toHaveAccessibleDescription(`Edit rule. ${REASON}`);
      act(() => b.focus());
      expect(b).toHaveFocus();
      tryAll(b, 'e');
      expect(edit).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
    });
  }

  it('a pointer over the disabled short word shows one tip, with the whole label and the reason', async () => {
    setCoarse(false);
    table([{ id: 'edit', label: 'Edit rule', short: 'Edit', inline: true, isDisabled: true, disabledReason: REASON, onAction: noop }]);
    await userEvent.hover(within(rowOf()).getByRole('button', { name: 'Edit rule' }));
    const tips = await screen.findAllByRole('tooltip', {}, { timeout: 3000 });
    expect(tips).toHaveLength(1);
    expect(tips[0]).toHaveTextContent(`Edit rule. ${REASON}`);
  });

  it('without a short label: the label is the name, the reason alone its description', () => {
    setCoarse(false);
    table([{ id: 'edit', label: 'Edit', inline: true, isDisabled: true, disabledReason: REASON, onAction: noop }]);
    expect(within(rowOf()).getByRole('button', { name: 'Edit' })).toHaveAccessibleDescription(REASON);
  });

  it('enabled, the reason is not read: a plain button that acts', () => {
    setCoarse(false);
    const edit = vi.fn();
    table([{ id: 'edit', label: 'Edit', inline: true, disabledReason: REASON, onAction: edit }]);
    const b = within(rowOf()).getByRole('button', { name: 'Edit' });
    expect(b).not.toHaveAttribute('aria-disabled');
    expect(b).not.toHaveAccessibleDescription(REASON);
    fireEvent.click(b);
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it('disabled without a reason: plainly disabled, as before', () => {
    setCoarse(false);
    table([{ id: 'edit', label: 'Edit', inline: true, isDisabled: true, onAction: noop }]);
    expect(within(rowOf()).getByRole('button', { name: 'Edit' })).toBeDisabled();
  });
});

describe('DataTable: rows still move past a soft-disabled action', () => {
  const THREE: Row[] = [{ id: 'a', name: 'alpha' }, { id: 'b', name: 'beta' }, { id: 'c', name: 'gamma' }];
  const rowNamed = (n: string) => screen.getByText(n).closest('tr') as HTMLTableRowElement;
  for (const presentation of ['table', 'list', 'cards'] as const) {
    it(`${presentation}: the row keys move the one tab stop, Tab reaches the action, a row key on it moves nothing`, async () => {
      setCoarse(false);
      const user = userEvent.setup();
      const edit = vi.fn();
      const open = table([{ id: 'edit', label: 'Edit rule', short: 'Edit', inline: true, key: 'e', isDisabled: true, disabledReason: REASON, onAction: edit }], presentation, vi.fn(), THREE);
      const a = rowNamed('alpha'), b = rowNamed('beta'), c = rowNamed('gamma');
      // Roving tab stop: one row in the tab order.
      expect([a, b, c].map((r) => r.tabIndex)).toEqual([0, -1, -1]);
      act(() => a.focus());
      await user.keyboard('{ArrowDown}');
      expect(b).toHaveFocus();
      expect([a, b, c].map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
      await user.keyboard('j');
      expect(c).toHaveFocus();
      await user.keyboard('{Home}');
      expect(a).toHaveFocus();
      await user.keyboard('{End}');
      expect(c).toHaveFocus();
      await user.keyboard('{ArrowUp}');
      expect(b).toHaveFocus();
      // The soft-disabled action is focusable: Tab from its row lands on it (the row's only control).
      await user.tab();
      const action = within(b).getByRole('button', { name: 'Edit rule' });
      expect(action).toHaveFocus();
      // Row keys belong to the row: pressed on the action they neither move the tab stop nor run it.
      await user.keyboard('{ArrowDown}e');
      expect(action).toHaveFocus();
      expect([a, b, c].map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
      expect(edit).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
    });
  }
});

describe('DataTable: disabled hover icons and the open chevron say why too', () => {
  it('table, fine pointer: a disabled hover icon is soft-disabled with its reason and never runs', () => {
    setCoarse(false);
    const term = vi.fn();
    const open = table([
      { id: 'edit', label: 'Edit', inline: true, onAction: noop },
      { id: 'term', label: 'Open terminal', icon: 'terminal', hover: true, key: 't', isDisabled: true, disabledReason: REASON, onAction: term },
    ]);
    const b = within(rowOf()).getByRole('button', { name: 'Open terminal' });
    expect(b).toHaveAttribute('aria-disabled', 'true');
    expect(b).toHaveAccessibleDescription(REASON);
    tryAll(b, 't');
    expect(term).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('table, coarse pointer: a disabled open chevron is soft-disabled with its reason and opens nothing', () => {
    setCoarse(true);
    const go = vi.fn();
    render(
      <DataTable
        label="Rules"
        presentation="table"
        data={DATA}
        columns={COLUMNS}
        getRowId={(r) => r.id}
        actions={() => [{ id: 'open', label: 'Open rule', rowOpen: true, isDisabled: true, disabledReason: REASON, onAction: go }]}
      />,
    );
    const b = within(rowOf()).getByRole('button', { name: 'Open rule' });
    expect(b).toHaveAttribute('aria-disabled', 'true');
    expect(b).toHaveAccessibleDescription(REASON);
    tryAll(b);
    expect(go).not.toHaveBeenCalled();
  });
});
