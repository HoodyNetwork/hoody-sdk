import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { Combobox, type Option } from './more';

// One report per pick: a parent that does not store the pick (its value stays as it was) hears the pick on Enter
// and not again when focus leaves the box (the box's blur commit selects the same row a second time).
beforeEach(() => {
  boot();
});

const OPTIONS: Option[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'c', label: 'Charlie' },
  { value: 'd', label: 'Delta' },
];

describe('Combobox reports a pick once', () => {
  it('controlled without a parent update: Enter reports the pick, leaving the box does not report it again', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <div>
        <Combobox label="Letter" options={OPTIONS} value={undefined} onChange={onChange} />
        <button type="button">After</button>
      </div>,
    );
    const box = screen.getByRole('combobox', { name: 'Letter' });
    await user.click(box);
    await user.keyboard('char');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('c');
    await user.tab();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('picking the same row again in a later visit is a new pick, reported again', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <div>
        <Combobox label="Letter" options={OPTIONS} value={undefined} onChange={onChange} />
        <button type="button">After</button>
      </div>,
    );
    const box = screen.getByRole('combobox', { name: 'Letter' });
    await user.click(box);
    await user.keyboard('char{ArrowDown}{Enter}');
    await user.tab();
    expect(onChange).toHaveBeenCalledTimes(1);
    await user.click(box);
    await user.keyboard('{Control>}a{/Control}char{ArrowDown}{Enter}');
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(['c', 'c']);
    await user.tab();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('a later different pick is still reported', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Combobox label="Letter" options={OPTIONS} value={undefined} onChange={onChange} />);
    const box = screen.getByRole('combobox', { name: 'Letter' });
    await user.click(box);
    await user.keyboard('char{ArrowDown}{Enter}');
    await user.click(box);
    await user.keyboard('{Control>}a{/Control}delt{ArrowDown}{Enter}');
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(['c', 'd']);
  });
});
