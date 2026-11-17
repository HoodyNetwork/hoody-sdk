// StatusToggle, a StatusPill that is its own switch: one toggle button named by the pill's words, with on, off and "cannot
// tell" (mixed) states, a disabled state that refuses presses, and the plain pill unchanged when it is not pressable.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StatusPill, StatusToggle } from './Display';

describe('StatusToggle', () => {
  it('is a toggle button named by its words, and presses', () => {
    const onPress = vi.fn();
    render(
      <StatusToggle tone="warn" onPress={onPress} isPressed>
        Auto-approve on
      </StatusToggle>,
    );
    const b = screen.getByRole('button', { name: 'Auto-approve on' });
    expect(b.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(b);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('says mixed when the state cannot be told, and off when off', () => {
    render(
      <>
        <StatusToggle onPress={() => undefined} isPressed="mixed">
          Unknown
        </StatusToggle>
        <StatusToggle onPress={() => undefined} isPressed={false}>
          Off
        </StatusToggle>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Unknown' }).getAttribute('aria-pressed')).toBe('mixed');
    expect(screen.getByRole('button', { name: 'Off' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('refuses presses while disabled', () => {
    const onPress = vi.fn();
    render(
      <StatusToggle onPress={onPress} isPressed={false} isDisabled>
        Saving
      </StatusToggle>,
    );
    const b = screen.getByRole('button', { name: 'Saving' });
    expect(b.hasAttribute('disabled')).toBe(true);
    fireEvent.click(b);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('stays a plain pill, no button, without onPress', () => {
    const { container } = render(<StatusPill tone="ok">Running</StatusPill>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('[data-status-pill-press]')).toBeNull();
  });
});
