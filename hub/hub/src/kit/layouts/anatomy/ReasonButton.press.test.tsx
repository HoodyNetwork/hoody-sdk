// ReasonButton `onPress`: a page may react to a press on the disabled action (scroll the failing fact into view). The
// button still never acts: it stays aria-disabled, shows its reason, and submits nothing.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReasonButton } from './ReasonButton';

describe('ReasonButton onPress', () => {
  it('tells the page about a press, shows the reason, and stays disabled', async () => {
    const onPress = vi.fn();
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <ReasonButton reason="Add funds first" onPress={onPress}>
          Confirm
        </ReasonButton>
      </form>,
    );
    const btn = screen.getByRole('button', { name: 'Confirm' });
    await userEvent.click(btn);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(document.querySelector('[data-hub-reason]')).toHaveTextContent('Add funds first');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('a keyboard press tells the page too', () => {
    const onPress = vi.fn();
    render(<ReasonButton reason="Add funds first" onPress={onPress}>Confirm</ReasonButton>);
    const btn = screen.getByRole('button', { name: 'Confirm' });
    btn.focus();
    fireEvent.keyDown(btn, { key: 'Enter' });
    fireEvent.keyUp(btn, { key: 'Enter' });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('without onPress a press only shows the reason', async () => {
    render(<ReasonButton reason="Add funds first">Confirm</ReasonButton>);
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(document.querySelector('[data-hub-reason]')).toHaveTextContent('Add funds first');
  });
});
