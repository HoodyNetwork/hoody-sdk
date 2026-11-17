// A press on a disabled stepper must not cost the next one (controls/disabledPress.ts): Decrease is disabled at the
// minimum, clicked, enabled by a new value with no press anywhere else, and the one click that follows steps once.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NumberField } from './more';
import strings from '../strings.en.json';

describe('NumberField: a click on a stepper at its limit, then one click once it can step', () => {
  it('the one click steps once', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const draw = (value: number) => <NumberField label="Count" minValue={0} value={value} onChange={onChange} />;
    const { rerender } = render(draw(0));
    // React Aria names a stepper by its own label and the field's ("Decrease Count").
    const down = screen.getByRole('button', { name: new RegExp(strings['field.decrement']) });
    expect(down).toBeDisabled();
    await user.click(down);
    expect(onChange).not.toHaveBeenCalled();
    rerender(draw(5));
    expect(down).toBeEnabled();
    await user.click(down);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(4);
  });
});
