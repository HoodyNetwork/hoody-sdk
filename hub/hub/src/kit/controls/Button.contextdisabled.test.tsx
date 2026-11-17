// A kit button disabled through a React Aria context, not its own prop (a SearchField's clear button, a Calendar's
// previous and next), keeps the same guard (controls/disabledPress.ts reads the element's disabled state at the press):
// clicked while disabled, enabled with no press anywhere else, and the one click that follows presses once.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ButtonContext } from 'react-aria-components';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from './Button';

describe('a kit button disabled by its context: a click while disabled, then one click once enabled', () => {
  it('the one click presses once', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    const draw = (off: boolean) => (
      <ButtonContext.Provider value={{ isDisabled: off }}>
        <IconButton icon="x" label="Clear" onPress={onPress} />
      </ButtonContext.Provider>
    );
    const { rerender } = render(draw(true));
    const clear = screen.getByRole('button', { name: 'Clear' });
    expect(clear).toBeDisabled();
    await user.click(clear);
    expect(onPress).not.toHaveBeenCalled();
    rerender(draw(false));
    expect(clear).toBeEnabled();
    await user.click(clear);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
