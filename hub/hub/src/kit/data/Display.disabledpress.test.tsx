// A press on a disabled StatusToggle must not cost the next one (controls/disabledPress.ts): it is disabled while its
// change is sent, clicked, enabled with no press anywhere else, and the one click that follows presses it.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StatusToggle } from './Display';

describe('StatusToggle: a click while disabled, then one click once enabled', () => {
  it('the one click presses once', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    const draw = (off: boolean) => <StatusToggle isPressed={false} isDisabled={off} onPress={onPress}>Off</StatusToggle>;
    const { rerender } = render(draw(true));
    const toggle = screen.getByRole('button', { name: 'Off' });
    expect(toggle).toBeDisabled();
    await user.click(toggle);
    expect(onPress).not.toHaveBeenCalled();
    rerender(draw(false));
    expect(toggle).toBeEnabled();
    await user.click(toggle);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
