// PickerPanel collapsible groups and one-line rows: a `collapsible` group starts folded under a toggle naming it and
// its count (open when it holds a picked row), the toggle is a stop in the arrow order, a search match opens it, and a
// row with a note or an aside keeps them on its label's line, searchable through `keywords`. Without these the panel
// draws as before.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PickerPanel, type PickerItem } from './PickerPanel';

const ITEMS: PickerItem[] = [
  { id: 'a', label: 'alpha', note: 'Stopped', aside: <span>Oslo · no-1</span>, keywords: ['Oslo · no-1'] },
  { id: 'b', label: 'bravo', group: 'Later' },
  { id: 'c', label: 'charlie', group: 'Later' },
];

function panel(props: Partial<Parameters<typeof PickerPanel>[0]> = {}) {
  return render(<PickerPanel label="Things" items={ITEMS} mode="single" value={[]} onChange={() => undefined} searchable collapsible={['Later']} {...props} />);
}

describe('PickerPanel collapsible groups', () => {
  it('starts a collapsible group folded under a toggle with its count, and opens it on press', async () => {
    panel();
    const toggle = screen.getByRole('button', { name: 'Later (2)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('bravo')).toBeNull();
    await userEvent.click(toggle);
    expect(screen.getAllByRole('radio').map((r) => r.textContent?.split(' ')[0])).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('starts it open when it holds a picked row', () => {
    panel({ value: ['c'] });
    expect(screen.getByRole('button', { name: 'Later (2)' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens a folded group a search matches, and leaves the toggle working after', async () => {
    panel();
    await userEvent.type(screen.getByRole('searchbox'), 'char');
    const toggle = screen.getByRole('button', { name: 'Later (1)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('charlie')).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.queryByText('charlie')).toBeNull();
  });

  it('keeps one tab stop for the list: the toggle is reached with the arrows, never with Tab', async () => {
    panel();
    const row = screen.getByRole('radio', { name: /alpha/ });
    expect(row).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('button', { name: 'Later (2)' })).toHaveAttribute('tabindex', '-1');
    row.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Later (2)' })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(row).toHaveFocus();
  });

  it('draws a note and an aside on the label line and searches the aside through keywords', async () => {
    panel();
    const row = screen.getByRole('radio', { name: /alpha/ });
    expect(row).toHaveTextContent('alpha Stopped Oslo · no-1');
    await userEvent.type(screen.getByRole('searchbox'), 'oslo');
    expect(screen.getAllByRole('radio')).toHaveLength(1);
  });

  it('keepOrder keeps the caller\'s order; by default a picked row and its group still come first', () => {
    const order = () => screen.getAllByRole('radio').map((r) => r.textContent?.split(' ')[0]);
    const { unmount } = panel({ collapsible: undefined, value: ['c'] });
    expect(order()).toEqual(['charlie', 'bravo', 'alpha']);
    unmount();
    panel({ collapsible: undefined, value: ['c'], keepOrder: true });
    expect(order()).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('folds by the group identity and shows its groupLabel, so two groups sharing a heading stay apart', () => {
    render(
      <PickerPanel
        label="Things"
        mode="single"
        value={[]}
        onChange={() => undefined}
        collapsible={['parked']}
        items={[
          { id: 'a', label: 'alpha', group: 'realm:Later', groupLabel: 'Later' },
          { id: 'b', label: 'bravo', group: 'parked', groupLabel: 'Later' },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: /alpha/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /bravo/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Later (1)' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Later', 'Later']);
  });

  it('draws a group as a plain heading when it is not collapsible', () => {
    panel({ collapsible: undefined });
    expect(screen.queryByRole('button', { name: /Later/ })).toBeNull();
    const group = screen.getByRole('group', { name: 'Later' });
    expect(within(group).getAllByRole('radio')).toHaveLength(2);
  });

  // A search shows the folded group open; the focused row's item moves into it (its state changed
  // under the search). The keyboard stays on that row, now drawn in the group, and the list keeps its one tab stop.
  it('keeps the focus on a row that moves into the searched-open group', async () => {
    const before: PickerItem[] = [
      { id: 'a', label: 'alpha' },
      { id: 'd', label: 'delta' },
      { id: 'b', label: 'bravo', group: 'Later' },
    ];
    const { rerender } = render(<PickerPanel label="Things" items={before} mode="single" value={[]} onChange={() => undefined} searchable collapsible={['Later']} />);
    await userEvent.type(screen.getByRole('searchbox'), 'ta');
    screen.getByRole('radio', { name: /delta/ }).focus();
    const after = before.map((i) => (i.id === 'd' ? { ...i, group: 'Later' } : i));
    rerender(<PickerPanel label="Things" items={after} mode="single" value={[]} onChange={() => undefined} searchable collapsible={['Later']} />);
    const moved = within(screen.getByRole('group', { name: 'Later' })).getByRole('radio', { name: /delta/ });
    expect(moved).toHaveFocus();
    expect(screen.getAllByRole('radio').filter((r) => r.getAttribute('tabindex') === '0')).toEqual([moved]);
  });

  // A search opens every group it matches; clearing it brings back the folds from before the search,
  // so a group folded before stays folded and a group the person opened before stays open.
  it('brings back the folds from before the search once it is cleared', async () => {
    const items: PickerItem[] = [
      { id: 'a', label: 'alpha' },
      { id: 'b', label: 'bravo', group: 'Later' },
      { id: 'o', label: 'oscar', group: 'Old' },
    ];
    render(<PickerPanel label="Things" items={items} mode="single" value={[]} onChange={() => undefined} searchable collapsible={['Later', 'Old']} />);
    await userEvent.click(screen.getByRole('button', { name: 'Old (1)' }));
    expect(screen.getByRole('button', { name: 'Later (1)' })).toHaveAttribute('aria-expanded', 'false');
    const box = screen.getByRole('searchbox');
    await userEvent.type(box, 'r');
    expect(screen.getByRole('button', { name: 'Later (1)' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Old (1)' })).toHaveAttribute('aria-expanded', 'true');
    await userEvent.clear(box);
    expect(screen.getByRole('button', { name: 'Later (1)' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('radio', { name: /bravo/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Old (1)' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('radio', { name: /oscar/ })).toBeInTheDocument();
  });
});
