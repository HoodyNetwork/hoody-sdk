// PickerPanel footer: a separate "Picker actions" group after the options and the create slot,
// outside the radiogroup/group. Arrows stay in the options (ArrowDown from the last row goes to the create slot, never the
// footer); Tab from the list reaches the primary, Shift+Tab comes back. In a picker popover, Escape and a footer action
// that closes both return focus to the trigger.
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../controls/Button';
import { PickerPanel, type PickerItem, type PickerPanelProps } from './PickerPanel';
import { PickerPopover, PickerTrigger } from './ComputerPicker';

const ITEMS: PickerItem[] = [
  { id: 'a', label: 'Atlas' },
  { id: 'b', label: 'Borealis' },
  { id: 'c', label: 'Cygnus' },
];

function Panel(props: Partial<PickerPanelProps>) {
  const [v, setV] = useState<string[]>([]);
  return <PickerPanel label="Realms" items={ITEMS} mode="single" value={v} onChange={setV} footer={[{ id: 'use', label: 'Use this realm', onPress: () => undefined }, { id: 'cancel', label: 'Cancel', onPress: () => undefined }]} {...props} />;
}
const options = () => screen.getByRole('radiogroup', { name: 'Realms' });
const footer = () => screen.getByRole('group', { name: 'Picker actions' });

describe('PickerPanel footer', () => {
  it.each(['single', 'multi'] as const)('%s: the footer is a group after the options, outside them, the primary first', (mode) => {
    render(<Panel mode={mode} />);
    const list = mode === 'single' ? options() : screen.getByRole('group', { name: 'Realms' });
    const f = footer();
    expect(list.contains(f)).toBe(false);
    expect(list.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect([...f.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Use this realm', 'Cancel']);
  });

  it('comes after the create slot, which stays the last arrow stop', async () => {
    const user = userEvent.setup();
    render(<Panel renderCreate={() => <Button>New realm</Button>} />);
    const create = screen.getByRole('button', { name: 'New realm' });
    expect(create.compareDocumentPosition(footer()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.tab();
    expect(document.activeElement?.textContent).toBe('Atlas');
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(document.activeElement).toBe(create);
  });

  it('arrows never reach the footer: ArrowDown on the last row stays in the options', async () => {
    const user = userEvent.setup();
    render(<Panel />);
    await user.tab();
    await user.keyboard('{End}{ArrowDown}{ArrowDown}');
    expect(document.activeElement?.textContent).toBe('Cygnus');
    expect(footer().contains(document.activeElement)).toBe(false);
  });

  it('Tab from the list lands on the primary, Tab again on the second, Shift+Tab back to the row', async () => {
    const user = userEvent.setup();
    render(<Panel />);
    await user.tab();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toBe('Borealis');
    await user.tab();
    expect(document.activeElement?.textContent).toBe('Use this realm');
    await user.tab();
    expect(document.activeElement?.textContent).toBe('Cancel');
    await user.tab({ shift: true });
    await user.tab({ shift: true });
    expect(document.activeElement?.textContent).toBe('Borealis');
  });

  it('while loading (no items yet) the footer is still drawn, both actions', () => {
    render(<Panel items={undefined} />);
    expect([...footer().querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Use this realm', 'Cancel']);
  });

  it('on an empty list the footer follows the empty state', () => {
    render(<Panel items={[]} emptyText="No realms yet" />);
    const empty = screen.getByText('No realms yet');
    expect(empty.compareDocumentPosition(footer()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('on an error the footer follows the error, its retry and Details, and Tab goes from retry through Details to the primary', async () => {
    const user = userEvent.setup();
    render(<Panel items={undefined} status={{ error: new Error('boom'), title: 'Realms failed to load', onRetry: () => undefined }} />);
    const err = screen.getByText('Realms failed to load');
    expect(err.compareDocumentPosition(footer()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const retry = screen.getByRole('button', { name: /retry|try again/i });
    await act(async () => { retry.focus(); });
    // The error carries its rejection's Details button right after Try again, then the footer.
    await user.tab();
    expect(document.activeElement?.textContent).toBe('Details');
    await user.tab();
    expect(document.activeElement?.textContent).toBe('Use this realm');
  });

  it('no footer prop draws no "Picker actions" group', () => {
    render(<Panel footer={undefined} />);
    expect(screen.queryByRole('group', { name: 'Picker actions' })).toBeNull();
  });

  it('in a picker popover, a footer action that closes and Escape both return focus to the trigger', async () => {
    const user = userEvent.setup();
    const used = vi.fn();
    function Host() {
      const [v, setV] = useState<string[]>([]);
      return (
        <PickerPopover trigger={<PickerTrigger label="Realm" text="Choose" placeholder />} label="Realm">
          {(close) => (
            <PickerPanel label="Realms" items={ITEMS} mode="single" value={v} onChange={setV}
              footer={[{ id: 'use', label: 'Use this realm', onPress: () => { used(); close(); } }]} />
          )}
        </PickerPopover>
      );
    }
    render(<Host />);
    const trigger = screen.getByRole('button', { name: /Realm/ });
    await user.click(trigger);
    await screen.findByRole('radiogroup', { name: 'Realms' });
    await user.click(screen.getByRole('button', { name: 'Use this realm' }));
    expect(used).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('radiogroup')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));

    await user.click(trigger);
    await screen.findByRole('radiogroup', { name: 'Realms' });
    await act(async () => { screen.getByRole('button', { name: 'Use this realm' }).focus(); });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('radiogroup')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
