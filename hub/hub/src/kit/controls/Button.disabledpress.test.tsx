// A click on a disabled button must not cost the next one. Browsers send pointerdown and pointerup (no click) to a disabled
// <button>; React Aria would keep that press open and drop the first click after the button enables.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button, IconButton } from './Button';
import { TextButton } from './Link';

// Enabled from outside, as a read that comes back does: a pointer press anywhere else would end the open press by itself.
let enable: () => void = () => undefined;
function Later({ children }: { children: (off: boolean) => ReactNode }) {
  const [off, setOff] = useState(true);
  enable = () => setOff(false);
  return <>{children(off)}</>;
}

describe('a click on a disabled button, then one click once it is enabled', () => {
  const cases: [string, (off: boolean, onPress: () => void) => ReactNode][] = [
    ['Button', (off, onPress) => <Button isDisabled={off} onPress={onPress}>Save</Button>],
    ['IconButton', (off, onPress) => <IconButton icon="pen" label="Save" isDisabled={off} onPress={onPress} />],
    ['TextButton', (off, onPress) => <TextButton isDisabled={off} onPress={onPress}>Save</TextButton>],
  ];
  it.each(cases)('%s: the one click presses once', async (_name, draw) => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(<Later>{(off) => draw(off, onPress)}</Later>);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await user.click(save);
    expect(onPress).not.toHaveBeenCalled();
    act(() => enable());
    expect(save).toBeEnabled();
    await user.click(save);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a button soft-disabled with a reason stays focusable and still does not press', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(<Later>{(off) => <Button isDisabled={off} disabledReason="Nothing to save yet" onPress={onPress}>Save</Button>}</Later>);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).not.toBeDisabled();
    expect(save.getAttribute('aria-disabled')).toBe('true');
    await user.click(save);
    expect(onPress).not.toHaveBeenCalled();
    act(() => enable());
    await user.click(save);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
