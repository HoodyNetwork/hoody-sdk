// A press on a disabled segment must not cost the next one (controls/disabledPress.ts): the group is disabled, a segment
// is clicked, the group is enabled with no press anywhere else, and the one click that follows chooses the segment.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './SegmentedControl';

const ITEMS = [
  { id: 'cards', label: 'Cards' },
  { id: 'list', label: 'List' },
] as const;

describe('SegmentedControl: a click while disabled, then one click once enabled', () => {
  it('the one click chooses the segment', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const draw = (off: boolean) => <SegmentedControl label="View" items={ITEMS} value="cards" onChange={onChange} isDisabled={off} />;
    const { rerender } = render(draw(true));
    const list = screen.getByRole('radio', { name: 'List' });
    expect(list).toBeDisabled();
    await user.click(list);
    expect(onChange).not.toHaveBeenCalled();
    rerender(draw(false));
    expect(list).toBeEnabled();
    await user.click(list);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('list');
  });
});
