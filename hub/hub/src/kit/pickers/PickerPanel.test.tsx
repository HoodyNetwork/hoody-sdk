// PickerPanel: folded search, picked-first order that does not jump, multi and single rows, the minimum rule,
// the create slot as the last keyboard stop (never searched), and every state.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLayoutEffect, useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormStateProvider } from '../forms/lock';
import { PickerPanel, type PickerItem, type PickerPanelProps } from './PickerPanel';

const REALMS: PickerItem[] = [
  { id: 'r1', label: 'Atlas', facts: '3 computers' },
  { id: 'r2', label: 'Café', description: 'Paris' },
  { id: 'r3', label: 'Delta' },
];
const MANY: PickerItem[] = Array.from({ length: 9 }, (_, n) => ({ id: `m${n}`, label: `Realm ${n}`, description: n === 4 ? 'Zürich' : undefined }));

type Host = Partial<PickerPanelProps> & { start?: string[]; seen?: string[][] };
function Panel({ start = [], seen, ...rest }: Host) {
  const [v, setV] = useState<string[]>(start);
  return (
    <PickerPanel
      label="Realms"
      items={REALMS}
      mode="multi"
      value={v}
      onChange={(n) => {
        seen?.push(n);
        setV(n);
      }}
      {...rest}
    />
  );
}
const rowNames = () => [...document.querySelectorAll('[role=checkbox],[role=radio]')].map((r) => r.textContent ?? '');

afterEach(() => vi.restoreAllMocks());

describe('visible label', () => {
  it('shows no heading by default: the label is only the group name', () => {
    render(<Panel />);
    expect(screen.queryByText('Realms')).toBeNull();
    expect(screen.getByRole('group', { name: 'Realms' })).toBeInTheDocument();
  });

  it('showLabel draws the label above the panel and names the group by it', () => {
    render(<Panel showLabel />);
    const text = screen.getByText('Realms');
    expect(text).toBeVisible();
    const group = screen.getByRole('group', { name: 'Realms' });
    expect(group).toHaveAttribute('aria-labelledby', text.id);
    expect(group).not.toHaveAttribute('aria-label');
  });

  it('showLabel keeps the label while loading and when the list is empty', () => {
    const { rerender } = render(<PickerPanel label="Realms" showLabel items={undefined} mode="multi" value={[]} onChange={() => undefined} />);
    expect(screen.getByText('Realms')).toBeInTheDocument();
    rerender(<PickerPanel label="Realms" showLabel items={[]} mode="multi" value={[]} onChange={() => undefined} />);
    expect(screen.getByText('Realms')).toBeInTheDocument();
  });

  it('single mode too: the radiogroup is named by the visible label', () => {
    render(<Panel mode="single" showLabel />);
    expect(screen.getByRole('radiogroup', { name: 'Realms' })).toHaveAttribute('aria-labelledby', screen.getByText('Realms').id);
  });
});

describe('rows', () => {
  it('shows a group named after the label with one checkbox per item and the count', () => {
    render(<Panel start={['r2']} />);
    const g = screen.getByRole('group', { name: 'Realms' });
    expect(within(g).getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getByRole('checkbox', { name: /Café/ })).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('1 selected');
  });
  it('ticks and unticks by click and reports the new list', async () => {
    const seen: string[][] = [];
    render(<Panel seen={seen} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /Atlas/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Delta/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Atlas/ }));
    expect(seen).toEqual([['r1'], ['r1', 'r3'], ['r3']]);
    expect(screen.getByRole('status')).toHaveTextContent('1 selected');
  });
  it('puts the rows picked at the start first and does not move a row when it is ticked', async () => {
    render(<Panel start={['r3']} />);
    expect(rowNames()[0]).toMatch(/Delta/);
    await userEvent.click(screen.getByRole('checkbox', { name: /Atlas/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Delta/ }));
    expect(rowNames().map((x) => /^(Delta|Atlas|Café)/.exec(x)?.[1])).toEqual(['Delta', 'Atlas', 'Café']);
  });
  it('a lead mark is drawn before the label, replaces the icon, and leaves the row name as its text', () => {
    render(<Panel items={[{ id: 'l1', label: 'Atlas', icon: 'search', lead: <span data-testid="lead" aria-hidden="true" /> }, { id: 'l2', label: 'Delta', icon: 'search' }]} />);
    const first = screen.getByRole('checkbox', { name: 'Atlas' });
    const lead = within(first).getByTestId('lead');
    expect(lead.nextSibling?.textContent).toBe('Atlas');
    expect(first.querySelector('svg')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Delta' }).querySelector('svg')).not.toBeNull();
  });

  it('shows facts and descriptions in the row name', () => {
    render(<Panel />);
    expect(screen.getByRole('checkbox', { name: /Atlas.*3 computers/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Café.*Paris/ })).toBeInTheDocument();
  });
  it('a disabled row cannot be picked and shows its reason; arrow keys land on it, so the reason is read', async () => {
    const seen: string[][] = [];
    render(<Panel seen={seen} items={[REALMS[0]!, { id: 'x', label: 'Locked', isDisabled: true, disabledReason: 'Held elsewhere' }, REALMS[2]!]} />);
    const locked = screen.getByRole('checkbox', { name: /Locked/ });
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    expect(locked).toHaveTextContent('Held elsewhere');
    await userEvent.click(locked);
    expect(seen).toEqual([]);
    screen.getByRole('checkbox', { name: /Atlas/ }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(locked).toHaveFocus();
    // Space and Enter on it pick nothing.
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{Enter}');
    expect(seen).toEqual([]);
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('checkbox', { name: /Delta/ })).toHaveFocus();
  });
  it('lays groups under their headings', () => {
    render(<Panel items={[{ id: 'a', label: 'One', group: 'Shared' }, { id: 'b', label: 'Two' }]} />);
    expect(screen.getByRole('group', { name: 'Shared' })).toHaveTextContent('One');
  });
});

describe('single mode', () => {
  it('is a radio group; Space picks and the pick is the one id', async () => {
    const seen: string[][] = [];
    render(<Panel mode="single" seen={seen} />);
    expect(screen.getByRole('radiogroup', { name: 'Realms' })).toBeInTheDocument();
    screen.getByRole('radio', { name: /Atlas/ }).focus();
    await userEvent.keyboard('{ArrowDown} ');
    expect(seen).toEqual([['r2']]);
    expect(screen.getByRole('radio', { name: /Café/ })).toBeChecked();
    expect(screen.queryByText(/selected/)).toBeNull();
  });
  it('Enter picks', async () => {
    const seen: string[][] = [];
    render(<Panel mode="single" seen={seen} />);
    screen.getByRole('radio', { name: /Delta/ }).focus();
    await userEvent.keyboard('{Enter}');
    expect(seen).toEqual([['r3']]);
  });
});

describe('minimum', () => {
  it('refuses the last untick and says why', async () => {
    const seen: string[][] = [];
    render(<Panel start={['r1']} minPicked={1} seen={seen} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /Atlas/ }));
    expect(seen).toEqual([]);
    expect(screen.getByRole('checkbox', { name: /Atlas/ })).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('Keep at least 1 selected.');
  });
  it('allows an untick while above the minimum', async () => {
    const seen: string[][] = [];
    render(<Panel start={['r1', 'r2']} minPicked={1} seen={seen} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /Atlas/ }));
    expect(seen).toEqual([['r2']]);
  });
});

describe('search', () => {
  it('shows only above seven rows, or when asked', () => {
    const { rerender } = render(<Panel />);
    expect(screen.queryByRole('searchbox')).toBeNull();
    rerender(<Panel items={MANY} />);
    expect(screen.getByRole('searchbox', { name: 'Search' })).toBeInTheDocument();
    rerender(<Panel items={MANY} searchable={false} />);
    expect(screen.queryByRole('searchbox')).toBeNull();
    rerender(<Panel searchable />);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });
  it('matches folded and says how many show', async () => {
    render(<Panel items={MANY} />);
    await userEvent.type(screen.getByRole('searchbox'), 'zurich');
    expect(rowNames()).toEqual(['Realm 4Zürich']);
    expect(screen.getByRole('status')).toHaveTextContent('1 of 9 shown');
  });
  it('says no match and clears', async () => {
    render(<Panel items={MANY} />);
    await userEvent.type(screen.getByRole('searchbox'), 'nothing');
    expect(screen.getByText('No match for "nothing".')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(9);
  });
  it('typing a letter on a row goes to the search box', async () => {
    render(<Panel items={MANY} />);
    screen.getAllByRole('checkbox')[0]?.focus();
    await userEvent.keyboard('z');
    expect(screen.getByRole('searchbox')).toHaveFocus();
    expect(screen.getByRole('searchbox')).toHaveValue('z');
  });
  it('ArrowDown from the box enters the list, ArrowUp from the first row returns', async () => {
    render(<Panel items={MANY} />);
    screen.getByRole('searchbox').focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('checkbox')[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByRole('searchbox')).toHaveFocus();
  });
});

describe('keyboard', () => {
  it('has one tab stop: the first picked row, else the first row', () => {
    const { unmount } = render(<Panel start={['r3']} />);
    expect(screen.getAllByRole('checkbox').filter((r) => r.tabIndex === 0).map((r) => r.textContent)).toEqual(['Delta']);
    unmount();
    render(<Panel />);
    expect(screen.getAllByRole('checkbox').filter((r) => r.tabIndex === 0).map((r) => r.textContent?.slice(0, 5))).toEqual(['Atlas']);
  });
  it('Home, End, arrows and Space', async () => {
    const seen: string[][] = [];
    render(<Panel seen={seen} />);
    screen.getByRole('checkbox', { name: /Atlas/ }).focus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('checkbox', { name: /Delta/ })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp} ');
    expect(seen).toEqual([['r2']]);
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('checkbox', { name: /Atlas/ })).toHaveFocus();
  });
  it('Enter in multi mode calls onConfirm and ticks nothing', async () => {
    const onConfirm = vi.fn();
    const seen: string[][] = [];
    render(<Panel seen={seen} onConfirm={onConfirm} />);
    screen.getByRole('checkbox', { name: /Atlas/ }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(seen).toEqual([]);
  });
});

describe('create slot', () => {
  const create = () => <button type="button">Create a new realm</button>;
  it('shows after the rows and is not searched', async () => {
    render(<Panel items={MANY} renderCreate={create} />);
    await userEvent.type(screen.getByRole('searchbox'), 'nothing');
    expect(screen.getByRole('button', { name: 'Create a new realm' })).toBeInTheDocument();
  });
  it('is the last keyboard stop: ArrowDown from the last row, ArrowUp from the button back', async () => {
    render(<Panel renderCreate={create} />);
    screen.getByRole('checkbox', { name: /Delta/ }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Create a new realm' })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByRole('checkbox', { name: /Delta/ })).toHaveFocus();
  });
  it('shows with an empty list, with an error, and not while loading', () => {
    const { rerender } = render(<Panel items={[]} renderCreate={create} />);
    expect(screen.getByRole('button', { name: 'Create a new realm' })).toBeInTheDocument();
    rerender(<Panel items={undefined} status={{ error: new Error('x') }} renderCreate={create} />);
    expect(screen.getByRole('button', { name: 'Create a new realm' })).toBeInTheDocument();
    rerender(<Panel items={undefined} renderCreate={create} />);
    expect(screen.queryByRole('button', { name: 'Create a new realm' })).toBeNull();
  });
});

describe('states', () => {
  it('loading shows a skeleton and no rows', () => {
    render(<Panel items={undefined} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
  it('empty says so, with the caller\'s own words when given', () => {
    const { rerender } = render(<Panel items={[]} />);
    expect(screen.getByText('Nothing to choose from.')).toBeInTheDocument();
    rerender(<Panel items={[]} emptyText="No other realms yet." />);
    expect(screen.getByText('No other realms yet.')).toBeInTheDocument();
  });
  it('an error shows its line, retry and details; rows already loaded stay', async () => {
    const onRetry = vi.fn();
    render(<Panel status={{ error: new Error('x'), onRetry, details: <p>Details here</p> }} />);
    expect(screen.getByRole('alert')).toHaveTextContent("The choices didn't load.");
    expect(screen.getByText('Details here')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: /try again|retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
  it('an error with no rows yet shows no skeleton', () => {
    render(<Panel items={undefined} status={{ error: true, title: 'Realms did not load.' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Realms did not load.');
    expect(screen.queryByText('Loading…')).toBeNull();
  });
  it('a custom summary replaces the count', () => {
    render(<Panel start={['r1', 'r2']} summary={(n) => `Shows in ${n} realms`} />);
    expect(screen.getByRole('status')).toHaveTextContent('Shows in 2 realms');
  });
});

describe('phone', () => {
  it('marks itself narrow under 480px of room', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(360);
    const { container } = render(<Panel />);
    expect(container.firstElementChild).toHaveAttribute('data-narrow');
  });
  it('is not narrow with room', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900);
    const { container } = render(<Panel />);
    expect(container.firstElementChild).not.toHaveAttribute('data-narrow');
  });
});

describe('disabled', () => {
  it('ticks nothing and disables search', async () => {
    const seen: string[][] = [];
    render(<Panel items={MANY} isDisabled seen={seen} />);
    await userEvent.click(screen.getAllByRole('checkbox')[0]!);
    expect(seen).toEqual([]);
    expect(screen.getByRole('searchbox')).toBeDisabled();
  });
});

describe('review fixes', () => {
  const GROUPED: PickerItem[] = [
    { id: 'a', label: 'Alpha', group: 'X' },
    { id: 'b', label: 'Beta', group: 'Y' },
    { id: 'c', label: 'Gamma', group: 'X' },
  ];
  const tabStops = () => [...document.querySelectorAll<HTMLElement>('[role=checkbox],[role=radio]')].filter((r) => r.tabIndex === 0).map((r) => r.textContent);

  it('arrows, Home and End follow the order drawn, groups included', async () => {
    render(<Panel items={GROUPED} />);
    expect(rowNames().map((x) => x.slice(0, 5))).toEqual(['Alpha', 'Gamma', 'Beta']);
    screen.getByRole('checkbox', { name: /Alpha/ }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('checkbox', { name: /Gamma/ })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('checkbox', { name: /Beta/ })).toHaveFocus();
  });
  it('ArrowDown from the last drawn row reaches the create slot', async () => {
    render(<Panel items={GROUPED} renderCreate={() => <button type="button">Create</button>} />);
    screen.getByRole('checkbox', { name: /Beta/ }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Create' })).toHaveFocus();
  });
  it('the tab stop follows the focused row after navigation', async () => {
    render(<Panel />);
    screen.getByRole('checkbox', { name: /Atlas/ }).focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(tabStops()).toEqual(['Delta']);
  });
  it('a surviving row keeps its element and focus when its group goes away', () => {
    const { rerender } = render(<Panel items={GROUPED} />);
    const beta = screen.getByRole('checkbox', { name: /Beta/ });
    beta.focus();
    rerender(<Panel items={GROUPED.slice(1, 2)} />);
    expect(screen.getByRole('checkbox', { name: /Beta/ })).toBe(beta);
    expect(beta).toHaveFocus();
  });
  it('when the focused row is removed, focus moves to the nearest row', () => {
    const { rerender } = render(<Panel />);
    screen.getByRole('checkbox', { name: /Café/ }).focus();
    rerender(<Panel items={[REALMS[0]!, REALMS[2]!]} />);
    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getByRole('checkbox', { name: /Delta/ })).toHaveFocus();
  });
  it('picked rows lead in single mode too', () => {
    render(<Panel mode="single" start={['r3']} />);
    expect(rowNames()[0]).toMatch(/Delta/);
  });
  it('a picked grouped row is drawn before an unpicked ungrouped one', () => {
    render(<Panel start={['b']} items={[{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta', group: 'Y' }]} />);
    expect(rowNames().map((x) => x.slice(0, 4))).toEqual(['Beta', 'Alph']);
  });
  it('picks that were taken before items arrived still lead, but an empty list does not freeze the order', () => {
    const { rerender } = render(<Panel items={[]} start={['r3']} />);
    rerender(<Panel items={REALMS} start={['r3']} />);
    expect(rowNames()[0]).toMatch(/Delta/);
  });
  it('the minimum refusal is spoken in the live region and tied to the row', async () => {
    render(<Panel start={['r1']} minPicked={1} />);
    const atlas = screen.getByRole('checkbox', { name: /Atlas/ });
    atlas.focus();
    await userEvent.keyboard(' ');
    expect(screen.getByRole('status')).toHaveTextContent('Keep at least 1 selected.');
    const hint = document.getElementById(atlas.getAttribute('aria-describedby') ?? 'none');
    expect(hint).toHaveTextContent('Keep at least 1 selected.');
  });
  it('Enter does not confirm while the panel is disabled', async () => {
    const onConfirm = vi.fn();
    const { rerender } = render(<Panel onConfirm={onConfirm} />);
    screen.getByRole('checkbox', { name: /Atlas/ }).focus();
    rerender(<Panel onConfirm={onConfirm} isDisabled />);
    await userEvent.keyboard('{Enter}');
    expect(onConfirm).not.toHaveBeenCalled();
  });
  it('a locked kit form disables the picker', async () => {
    const seen: string[][] = [];
    render(
      <FormStateProvider value={{ locked: true, busy: false, outcome: null }}>
        <Panel seen={seen} />
      </FormStateProvider>,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /Atlas/ }));
    expect(seen).toEqual([]);
  });
  it('the create slot hand-off lands on the first usable control, skipping disabled ones', async () => {
    render(
      <Panel
        renderCreate={() => (
          <>
            <button type="button" disabled>Unavailable</button>
            <button type="button">Create</button>
          </>
        )}
      />,
    );
    screen.getByRole('checkbox', { name: /Delta/ }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Create' })).toHaveFocus();
  });
  it('the create slot hand-off finds a link or an input, not only buttons', async () => {
    render(<Panel renderCreate={() => <input aria-label="New realm name" />} />);
    screen.getByRole('checkbox', { name: /Delta/ }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('textbox', { name: 'New realm name' })).toHaveFocus();
  });
});

describe('review fixes', () => {
  const create = (label = 'Create') => () => <button type="button">{label}</button>;
  const six: PickerItem[] = ['A', 'B', 'C', 'D', 'E', 'F'].map((l) => ({ id: l.toLowerCase(), label: `Row ${l}` }));

  it('when the last row goes, focus moves to the create control', () => {
    const { rerender } = render(<Panel items={[REALMS[0]!]} renderCreate={create()} />);
    screen.getByRole('checkbox', { name: /Atlas/ }).focus();
    rerender(<Panel items={[]} renderCreate={create()} />);
    expect(screen.getByRole('button', { name: 'Create' })).toHaveFocus();
  });
  it('when the last row goes and there is a search box, focus moves to it', () => {
    const { rerender } = render(<Panel items={MANY} searchable />);
    screen.getByRole('checkbox', { name: /Realm 3/ }).focus();
    rerender(<Panel items={[]} searchable />);
    expect(screen.getByRole('searchbox')).toHaveFocus();
  });
  it('a row that is redrawn under another group keeps the keyboard', () => {
    const inX = [{ id: 'a', label: 'Alpha', group: 'X' }, { id: 'b', label: 'Beta', group: 'X' }];
    const { rerender } = render(<Panel items={inX} />);
    screen.getByRole('checkbox', { name: /Beta/ }).focus();
    rerender(<Panel items={[inX[0]!, { id: 'b', label: 'Beta', group: 'Y' }]} />);
    expect(screen.getByRole('checkbox', { name: /Beta/ })).toHaveFocus();
  });
  it('with several rows gone at once, focus lands on the next surviving row after the held one', () => {
    const { rerender } = render(<Panel items={six} />);
    screen.getByRole('checkbox', { name: /Row D/ }).focus();
    rerender(<Panel items={six.filter((r) => !['a', 'b', 'd'].includes(r.id))} />);
    expect(screen.getByRole('checkbox', { name: /Row E/ })).toHaveFocus();
  });
  it('does not take focus back after the user left the list', async () => {
    const { rerender } = render(
      <>
        <button type="button">Elsewhere</button>
        <Panel />
      </>,
    );
    screen.getByRole('checkbox', { name: /Café/ }).focus();
    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }));
    rerender(
      <>
        <button type="button">Elsewhere</button>
        <Panel items={[REALMS[0]!, REALMS[2]!]} />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();
  });
  it('does not take focus back after a plain blur to the page', () => {
    const { rerender } = render(<Panel />);
    const cafe = screen.getByRole('checkbox', { name: /Café/ });
    cafe.focus();
    cafe.blur();
    rerender(<Panel items={[REALMS[0]!, REALMS[2]!]} />);
    expect(document.activeElement).toBe(document.body);
  });

  it('Enter does not confirm on a row that is itself disabled', async () => {
    const onConfirm = vi.fn();
    const items = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }];
    const { rerender } = render(<Panel items={items} onConfirm={onConfirm} />);
    screen.getByRole('checkbox', { name: /Beta/ }).focus();
    rerender(<Panel items={[items[0]!, { id: 'b', label: 'Beta', isDisabled: true }]} onConfirm={onConfirm} />);
    await userEvent.keyboard('{Enter}');
    expect(onConfirm).not.toHaveBeenCalled();
  });
  it('picks that arrive after an empty list still lead (the first empty list is not the snapshot)', () => {
    const none: string[] = [];
    const { rerender } = render(<PickerPanel label="Realms" items={[]} mode="multi" value={none} onChange={() => {}} />);
    rerender(<PickerPanel label="Realms" items={REALMS} mode="multi" value={['r3']} onChange={() => {}} />);
    expect(rowNames()[0]).toMatch(/Delta/);
  });
  it('Left and Right arrows move like Up and Down', async () => {
    render(<Panel />);
    screen.getByRole('checkbox', { name: /Atlas/ }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('checkbox', { name: /Café/ })).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('checkbox', { name: /Atlas/ })).toHaveFocus();
  });
  it('the create hand-off reaches a link-only slot', async () => {
    render(<Panel renderCreate={() => <a href="/new-realm">New realm</a>} />);
    screen.getByRole('checkbox', { name: /Delta/ }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('link', { name: 'New realm' })).toHaveFocus();
  });
  it('the create hand-off skips aria-disabled, inert, hidden and negative-tabindex controls', async () => {
    render(
      <Panel
        renderCreate={() => (
          <>
            <button type="button" aria-disabled="true">Busy</button>
            <div inert><button type="button">Inside inert</button></div>
            <button type="button" tabIndex={-2}>Out of order</button>
            <input type="hidden" />
            <div hidden><button type="button">Hidden one</button></div>
            <button type="button">Create</button>
          </>
        )}
      />,
    );
    screen.getByRole('checkbox', { name: /Delta/ }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Create' })).toHaveFocus();
  });
  it('a refusal hint that is gone leaves no dangling description on the row', async () => {
    const { rerender } = render(<Panel start={['r1']} minPicked={1} />);
    const atlas = screen.getByRole('checkbox', { name: /Atlas/ });
    atlas.focus();
    await userEvent.keyboard(' ');
    expect(atlas).toHaveAttribute('aria-describedby');
    rerender(<Panel start={['r1']} minPicked={0} />);
    expect(screen.getByRole('checkbox', { name: /Atlas/ })).not.toHaveAttribute('aria-describedby');
  });
});

describe('review fixes', () => {
  const abc: PickerItem[] = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }, { id: 'c', label: 'Gamma' }];

  function Away({ items, away, summary }: { items: PickerItem[]; away: boolean; summary?: (n: number) => string }) {
    const out = useRef<HTMLButtonElement>(null);
    useLayoutEffect(() => {
      if (away) out.current?.focus();
    }, [away]);
    return (
      <>
        <button type="button" ref={out}>Elsewhere</button>
        <Panel items={items} summary={summary} />
      </>
    );
  }

  it('a hold released by a parent moving focus is never taken back later', () => {
    const { rerender } = render(<Away items={abc} away={false} />);
    screen.getByRole('checkbox', { name: /Beta/ }).focus();
    rerender(<Away items={[abc[0]!, abc[2]!]} away />);
    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();
    screen.getByRole('button', { name: 'Elsewhere' }).blur();
    rerender(<Away items={[abc[0]!, abc[2]!]} away summary={(n) => `${n} chosen`} />);
    expect(document.activeElement).toBe(document.body);
  });
  it('when the search box cannot take focus, focus goes to the create control', () => {
    const create = () => <button type="button">Create</button>;
    const { rerender } = render(<Panel items={[REALMS[0]!]} searchable renderCreate={create} />);
    screen.getByRole('checkbox', { name: /Atlas/ }).focus();
    rerender(<Panel items={[]} searchable isDisabled renderCreate={create} />);
    expect(screen.getByRole('button', { name: 'Create' })).toHaveFocus();
  });
  it('with both a usable search box and a create control, search takes the focus', () => {
    const create = () => <button type="button">Create</button>;
    const { rerender } = render(<Panel items={[REALMS[0]!]} searchable renderCreate={create} />);
    screen.getByRole('checkbox', { name: /Atlas/ }).focus();
    rerender(<Panel items={[]} searchable renderCreate={create} />);
    expect(screen.getByRole('searchbox')).toHaveFocus();
  });
  it('a surviving row that only became enabled still takes the focus', () => {
    const { rerender } = render(<Panel items={[{ id: 'a', label: 'Alpha', isDisabled: true }, { id: 'b', label: 'Beta' }]} />);
    screen.getByRole('checkbox', { name: /Beta/ }).focus();
    rerender(<Panel items={[{ id: 'a', label: 'Alpha' }]} />);
    expect(screen.getByRole('checkbox', { name: /Alpha/ })).toHaveFocus();
  });
  it('removing the last row of the list moves focus to the row just before it', () => {
    const { rerender } = render(<Panel items={abc} />);
    screen.getByRole('checkbox', { name: /Gamma/ }).focus();
    rerender(<Panel items={abc.slice(0, 2)} />);
    expect(screen.getByRole('checkbox', { name: /Beta/ })).toHaveFocus();
  });
  it('the create hand-off reaches a custom control with tabindex 0', async () => {
    render(<Panel renderCreate={() => <div role="button" tabIndex={0}>Custom create</div>} />);
    screen.getByRole('checkbox', { name: /Delta/ }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Custom create' })).toHaveFocus();
  });
  it('switching to single mode drops the description of a minimum hint that is gone', async () => {
    const { rerender } = render(<Panel start={['r1']} minPicked={1} />);
    const atlas = screen.getByRole('checkbox', { name: /Atlas/ });
    atlas.focus();
    await userEvent.keyboard(' ');
    expect(atlas).toHaveAttribute('aria-describedby');
    rerender(<Panel start={['r1']} minPicked={1} mode="single" />);
    expect(screen.getByRole('radio', { name: /Atlas/ })).not.toHaveAttribute('aria-describedby');
  });
});
