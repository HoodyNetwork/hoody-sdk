import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { Combobox, type Option, SELECT_MAX_ROWS, SELECT_SEARCH_ABOVE, Select, selectSections } from './more';

// The kit Select: a button that opens a picker. Search above SELECT_SEARCH_ABOVE rows, groups with headings, a no-match line,
// a render cap, and the keyboard (arrows, Home/End, Enter, Escape, typing anywhere starts the search).
beforeEach(() => {
  boot();
});

const many = (n: number, group?: (i: number) => string | undefined): Option[] =>
  Array.from({ length: n }, (_, i) => ({ value: `v${i}`, label: `Item ${i}`, group: group?.(i) }));

function Host({ options, initial, onPick }: { options: Option[]; initial?: string; onPick?: (v: string) => void }) {
  const [v, setV] = useState<string | undefined>(initial);
  return (
    <Select
      label="Pick"
      options={options}
      value={v}
      onChange={(x) => {
        setV(x);
        onPick?.(x);
      }}
    />
  );
}

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /Pick/ }));
  return screen.findByRole('listbox');
};

describe('selectSections', () => {
  it('groups in order of first appearance, ungrouped first, and filters on label, description, group and value', () => {
    const o: Option[] = [
      { value: 'a', label: 'Alpha', group: 'North' },
      { value: 'b', label: 'Bravo' },
      { value: 'c', label: 'Charlie', group: 'South', description: 'near the lake' },
      { value: 'd', label: 'Delta', group: 'North' },
    ];
    const all = selectSections(o, '', undefined);
    expect(all.sections.map((g) => [g.title, g.rows.map((r) => r.value)])).toEqual([[null, ['b']], ['North', ['a', 'd']], ['South', ['c']]]);
    expect(selectSections(o, 'lake', undefined).sections.flatMap((g) => g.rows.map((r) => r.value))).toEqual(['c']);
    expect(selectSections(o, 'north', undefined).sections.flatMap((g) => g.rows.map((r) => r.value))).toEqual(['a', 'd']);
    expect(selectSections(o, 'b', undefined).sections.flatMap((g) => g.rows.map((r) => r.value))).toEqual(['b']);
  });

  it('caps the rows, counts what is left, and keeps the picked row inside the cap', () => {
    const o = many(SELECT_MAX_ROWS + 30);
    const plain = selectSections(o, '', undefined);
    expect([plain.shown, plain.total]).toEqual([SELECT_MAX_ROWS, SELECT_MAX_ROWS + 30]);
    const last = `v${SELECT_MAX_ROWS + 29}`;
    const kept = selectSections(o, '', last);
    expect(kept.shown).toBe(SELECT_MAX_ROWS);
    expect(kept.sections.flatMap((g) => g.rows.map((r) => r.value))).toContain(last);
    expect(selectSections(o, 'Item 12', undefined).total).toBeLessThan(SELECT_MAX_ROWS);
  });

  it('an empty or blank group name is no group', () => {
    const o: Option[] = [{ value: 'a', label: 'A', group: '' }, { value: 'b', label: 'B', group: '  ' }, { value: 'c', label: 'C', group: 'Real' }];
    expect(selectSections(o, '', undefined).sections.map((g) => [g.title, g.rows.map((r) => r.value)])).toEqual([[null, ['a', 'b']], ['Real', ['c']]]);
  });
});

describe('Select search', () => {
  it('shows no search box up to the limit and one above it', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Host options={many(SELECT_SEARCH_ABOVE)} />);
    await open(user);
    expect(screen.queryByRole('textbox', { name: 'Search…' })).toBeNull();
    unmount();
    render(<Host options={many(SELECT_SEARCH_ABOVE + 1)} />);
    await open(user);
    expect(screen.getByRole('textbox', { name: 'Search…' })).toBeInTheDocument();
  });

  it('typing narrows the list; every word must match; no match says so; closing clears the query', async () => {
    const user = userEvent.setup();
    render(<Host options={many(12)} />);
    await open(user);
    const box = screen.getByRole('textbox', { name: 'Search…' });
    await user.type(box, 'item 1');
    const names = screen.getAllByRole('option').map((x) => x.textContent);
    expect(names).toEqual(['Item 1', 'Item 10', 'Item 11']);
    await user.clear(box);
    await user.type(box, 'zzz');
    expect(screen.queryAllByRole('option').map((x) => x.textContent)).toEqual(['No matches']);
    await user.keyboard('{Escape}');
    // Escape clears the query first, the next one closes
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(12);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    await open(user);
    expect((screen.getByRole('textbox', { name: 'Search…' }) as HTMLInputElement).value).toBe('');
  });

  it('keeps the chosen label on the button while the search hides it', async () => {
    const user = userEvent.setup();
    render(<Host options={many(12)} initial="v3" />);
    const btn = screen.getByRole('button', { name: /Pick/ });
    expect(btn).toHaveTextContent('Item 3');
    await open(user);
    await user.type(screen.getByRole('textbox', { name: 'Search…' }), 'Item 9');
    expect(btn).toHaveTextContent('Item 3');
    expect(screen.queryByRole('option', { name: /Item 3/ })).toBeNull();
  });

  it('draws at most the cap and says how many more match, with the picked row always there', async () => {
    const user = userEvent.setup();
    const n = SELECT_MAX_ROWS + 25;
    render(<Host options={many(n)} initial={`v${n - 1}`} />);
    await open(user);
    expect(screen.getAllByRole('option')).toHaveLength(SELECT_MAX_ROWS);
    expect(screen.getByRole('status')).toHaveTextContent('25 more match');
    await user.type(screen.getByRole('textbox', { name: 'Search…' }), 'Item 7');
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('Select groups', () => {
  it('draws one heading per group with its rows under it, named for assistive tech', async () => {
    const user = userEvent.setup();
    render(<Host options={many(9, (i) => (i < 4 ? 'Europe' : 'Asia'))} />);
    await open(user);
    const groups = screen.getAllByRole('group');
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.getAttribute('aria-labelledby') !== null)).toEqual([true, true]);
    expect(screen.getByRole('group', { name: 'Europe' })).toBe(groups[0]);
    expect(screen.getByRole('group', { name: 'Asia' })).toBe(groups[1]);
    expect(within(groups[0] as HTMLElement).getByText('Europe')).toBeInTheDocument();
    expect(within(groups[0] as HTMLElement).getAllByRole('option')).toHaveLength(4);
    expect(within(groups[1] as HTMLElement).getAllByRole('option')).toHaveLength(5);
  });

  it('a group name is searched like a label: typing it keeps that group only', async () => {
    const user = userEvent.setup();
    render(<Host options={many(9, (i) => (i < 4 ? 'Europe' : 'Asia'))} />);
    await open(user);
    await user.type(screen.getByRole('textbox', { name: 'Search…' }), 'europe');
    expect(screen.getAllByRole('option')).toHaveLength(4);
    expect(screen.getAllByRole('group')).toHaveLength(1);
  });

  it('a blank group name draws no heading', async () => {
    const user = userEvent.setup();
    render(<Host options={many(9, () => '')} />);
    await open(user);
    expect(screen.queryAllByRole('group')).toHaveLength(0);
    expect(screen.getAllByRole('option')).toHaveLength(9);
  });

  it('a search that empties one group drops its heading', async () => {
    const user = userEvent.setup();
    render(<Host options={many(9, (i) => (i < 4 ? 'Europe' : 'Asia'))} />);
    await open(user);
    await user.type(screen.getByRole('textbox', { name: 'Search…' }), 'Item 7');
    expect(screen.getAllByRole('group')).toHaveLength(1);
    expect(screen.queryByText('Europe')).toBeNull();
  });
});

describe('Select keyboard and pointer', () => {
  it('ArrowDown from the search enters the list, arrows move, Enter picks and closes', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Host options={many(12)} onPick={onPick} />);
    await open(user);
    await user.type(screen.getByRole('textbox', { name: 'Search…' }), 'item 1');
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toHaveAttribute('data-key', 'v1');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onPick).toHaveBeenCalledWith('v10');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('button', { name: /Pick/ })).toHaveTextContent('Item 10');
  });

  it('typing in the list moves to the search; Home and End reach the first and last row', async () => {
    const user = userEvent.setup();
    render(<Host options={many(12)} />);
    await open(user);
    const box = screen.getByRole('textbox', { name: 'Search…' });
    // (jsdom leaves focus on the popover after a pointer open; a browser puts it on the list)
    screen.getByRole('listbox').focus();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{End}');
    expect(document.activeElement).toHaveAttribute('data-key', 'v11');
    await user.keyboard('{Home}');
    expect(document.activeElement).toHaveAttribute('data-key', 'v0');
    await user.keyboard('9');
    expect(box).toHaveFocus();
    expect((box as HTMLInputElement).value).toBe('9');
  });

  it('a click picks; a disabled row cannot be picked', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const o = many(10);
    o[2] = { ...o[2]!, isDisabled: true };
    render(<Host options={o} onPick={onPick} />);
    await open(user);
    await user.click(screen.getByRole('option', { name: 'Item 2' }));
    expect(onPick).not.toHaveBeenCalled();
    await user.click(screen.getByRole('option', { name: 'Item 4' }));
    expect(onPick).toHaveBeenCalledWith('v4');
  });

  it('a short list opens without a search box and still works from the keyboard', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Host options={many(3)} onPick={onPick} />);
    const btn = screen.getByRole('button', { name: /Pick/ });
    await user.click(btn);
    (await screen.findByRole('listbox')).focus();
    expect(screen.queryByRole('textbox', { name: 'Search…' })).toBeNull();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onPick).toHaveBeenCalledTimes(1);
  });
});

describe('Select search edge cases', () => {
  it('an input method keeps its keys: Enter, ArrowDown and Escape while composing do not move focus, clear or close', async () => {
    const user = userEvent.setup();
    render(<Host options={many(12)} />);
    await open(user);
    const box = screen.getByRole('textbox', { name: 'Search…' });
    await user.type(box, 'It');
    for (const key of ['Enter', 'ArrowDown', 'Escape']) fireEvent.keyDown(box, { key, keyCode: 229, isComposing: true });
    expect(box).toHaveFocus();
    expect((box as HTMLInputElement).value).toBe('It');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('the first Escape clears the search from the list too; the second closes', async () => {
    const user = userEvent.setup();
    render(<Host options={many(12)} />);
    await open(user);
    await user.type(screen.getByRole('textbox', { name: 'Search…' }), 'item 1');
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toHaveAttribute('role', 'option');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(12);
    expect((screen.getByRole('textbox', { name: 'Search…' }) as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('textbox', { name: 'Search…' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('options that drop to the plain list mid-search take the filter with them', async () => {
    const user = userEvent.setup();
    const view = render(<Host options={many(12)} />);
    await open(user);
    await user.type(screen.getByRole('textbox', { name: 'Search…' }), 'item 11');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    view.rerender(<Host options={many(5)} />);
    expect(screen.queryByRole('textbox', { name: 'Search…' })).toBeNull();
    expect(screen.getAllByRole('option')).toHaveLength(5);
    // The search box that had focus is gone: the keys must still reach the list, not <body>.
    await vi.waitFor(() => expect(screen.getByRole('listbox').contains(document.activeElement) || screen.getByRole('listbox') === document.activeElement).toBe(true));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toHaveAttribute('role', 'option');
  });

  it('an input method keeps its keys in the list too, whichever signal says it is composing', async () => {
    const user = userEvent.setup();
    render(<Host options={many(12)} />);
    await open(user);
    await user.type(screen.getByRole('textbox', { name: 'Search…' }), 'item');
    await user.keyboard('{ArrowDown}');
    const row = document.activeElement as HTMLElement;
    expect(row).toHaveAttribute('role', 'option');
    for (const sig of [{ keyCode: 229 }, { isComposing: true }]) {
      fireEvent.keyDown(row, { key: 'ArrowDown', ...sig });
      expect(document.activeElement).toBe(row);
      fireEvent.keyDown(row, { key: 'Escape', ...sig });
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    }
  });

  it('the picked value keeps its ink while the search filters it out', async () => {
    const user = userEvent.setup();
    render(<Host options={many(12)} initial="v3" />);
    const btn = screen.getByRole('button', { name: /Pick/ });
    await user.click(btn);
    await user.type(screen.getByRole('textbox', { name: 'Search…' }), 'item 9');
    expect(btn).toHaveTextContent('Item 3');
    expect(btn.querySelector('[class*="pickedVal"]')).not.toBeNull();
  });
});

describe('Combobox groups', () => {
  it('draws headings for grouped options and finds an option by its group name', async () => {
    const user = userEvent.setup();
    render(<Combobox label="Where" value={undefined} onChange={() => undefined} options={many(6, (i) => (i < 3 ? 'Europe' : 'Asia'))} />);
    const box = screen.getByRole('combobox', { name: 'Where' });
    await user.click(box);
    expect(screen.getAllByRole('group')).toHaveLength(2);
    await user.type(box, 'asia');
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.getAllByRole('group')).toHaveLength(1);
  });
});

describe('Combobox duplicate labels', () => {
  it('a label two options share still matches on the group of each option, never on the other group', async () => {
    const user = userEvent.setup();
    const o: Option[] = [
      { value: 'p1', label: 'Paris', group: 'Europe' },
      { value: 'p2', label: 'Paris', group: 'North America' },
      { value: 'b1', label: 'Berlin', group: 'Europe' },
    ];
    render(<Combobox label="Where" value={undefined} onChange={() => undefined} options={o} />);
    const box = screen.getByRole('combobox', { name: 'Where' });
    await user.click(box);
    await user.type(box, 'europe');
    expect(screen.getAllByRole('option').map((x) => x.textContent)).toEqual(['Paris', 'Berlin']);
    await user.clear(box);
    await user.type(box, 'north');
    expect(screen.getAllByRole('option').map((x) => x.textContent)).toEqual(['Paris']);
  });
});
