// Vitest: editable Tabs, S-strip: a middle-click on an enabled tab calls edit.onMiddleClick
// (never on a disabled tab, off the tabs, with another button, or while a tab is being renamed), and its press is held
// off so the browser starts no autoscroll there. dropTargetId draws one tab as the place a page drag would land.
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';

const VIEWS = [
  { id: 'a', label: 'Overview' },
  { id: 'b', label: 'Builds' },
  { id: 'c', label: 'Logs', isDisabled: true },
];
const aux = (el: Element, button: number) => fireEvent(el, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button }));

describe('Tabs, middle-click and drop target (S-strip)', () => {
  it('a middle-click on an enabled tab calls onMiddleClick with its id; its press is held off', () => {
    const onMiddleClick = vi.fn();
    render(<Tabs label="Board" items={VIEWS} value="a" edit={{ onMiddleClick }} />);
    const down = createEvent.mouseDown(screen.getByText('Builds'), { button: 1 });
    fireEvent(screen.getByText('Builds'), down);
    expect(down.defaultPrevented).toBe(true);
    aux(screen.getByText('Builds'), 1);
    expect(onMiddleClick).toHaveBeenCalledWith('b');
    // On the tab's own box, around its label, too.
    aux(screen.getByRole('tab', { name: 'Overview' }), 1);
    expect(onMiddleClick).toHaveBeenLastCalledWith('a');
    expect(onMiddleClick).toHaveBeenCalledTimes(2);
  });

  it('nothing on a disabled tab, with the right button, or while a tab is renamed; a plain press is not held off', async () => {
    const onMiddleClick = vi.fn();
    render(<Tabs label="Board" items={VIEWS} value="a" edit={{ onMiddleClick, onRename: vi.fn() }} />);
    aux(screen.getByText('Logs'), 1);
    aux(screen.getByText('Builds'), 2);
    const down = createEvent.mouseDown(screen.getByText('Builds'), { button: 0 });
    fireEvent(screen.getByText('Builds'), down);
    expect(down.defaultPrevented).toBe(false);
    await userEvent.dblClick(screen.getByText('Overview'));
    expect(screen.getByRole('textbox', { name: /Rename Overview/ })).toBeInTheDocument();
    aux(screen.getByText('Builds'), 1);
    expect(onMiddleClick).not.toHaveBeenCalled();
  });

  it('without onMiddleClick a middle press is left to the browser', () => {
    render(<Tabs label="Board" items={VIEWS} value="a" edit={{ onRename: vi.fn() }} />);
    const down = createEvent.mouseDown(screen.getByText('Builds'), { button: 1 });
    fireEvent(screen.getByText('Builds'), down);
    expect(down.defaultPrevented).toBe(false);
  });

  it('dropTargetId marks that one tab; null marks none', () => {
    const { rerender } = render(<Tabs label="Board" items={VIEWS} value="a" edit={{}} dropTargetId="b" />);
    expect(screen.getByRole('tab', { name: 'Builds' })).toHaveAttribute('data-drop-target');
    expect(screen.getByRole('tab', { name: 'Overview' })).not.toHaveAttribute('data-drop-target');
    rerender(<Tabs label="Board" items={VIEWS} value="a" edit={{}} dropTargetId={null} />);
    expect(screen.queryAllByRole('tab').filter((x) => x.hasAttribute('data-drop-target'))).toHaveLength(0);
  });
});
