// The picker forms' focus (formFocus.ts): the first control takes it when the form opens and when the control
// holding it goes away while the form stays open; a focus the person moved elsewhere is never taken back.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFormFocus } from './formFocus';

function Form({ check = true, busy = false, hostOff = false, n = 0 }: { check?: boolean; busy?: boolean; hostOff?: boolean; n?: number }) {
  const focus = useFormFocus();
  return (
    <>
      <button type="button">Back to Session</button>
      <form ref={focus.ref} onFocus={focus.onFocus} onBlur={focus.onBlur} data-n={n}>
        <input aria-label="Host" disabled={busy || hostOff} />
        <input aria-label="User" disabled={busy} />
        {check && <button type="button" disabled={busy}>Check again</button>}
      </form>
    </>
  );
}
const host = () => screen.getByRole('textbox', { name: 'Host' });
const again = () => screen.getByRole('button', { name: 'Check again' });

afterEach(() => { cleanup(); });

describe('useFormFocus', () => {
  it('the first control takes the focus when the form opens', () => {
    render(<Form />);
    expect(host()).toHaveFocus();
  });

  it('the control holding the focus goes away while the form stays: the first control takes it back', () => {
    const { rerender } = render(<Form />);
    act(() => { again().focus(); });
    rerender(<Form check={false} />);
    expect(host()).toHaveFocus();
  });

  it('a busy start disables the control holding the focus: it comes back to the first control once one is enabled', () => {
    const { rerender } = render(<Form />);
    act(() => { again().focus(); });
    rerender(<Form busy />);
    // A browser drops the focus of a control that turns disabled: the page has it, after a blur to nothing from the
    // control. jsdom keeps it on the disabled control, so the page is what document.activeElement answers until the
    // first control can take it.
    const page = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);
    fireEvent.focusOut(again());
    rerender(<Form busy n={1} />);
    expect(host()).not.toHaveFocus();
    rerender(<Form n={2} />);
    page.mockRestore();
    expect(host()).toHaveFocus();
  });

  it('the first control is disabled when the focus is given back: the first enabled one takes it', () => {
    const { rerender } = render(<Form hostOff />);
    expect(screen.getByRole('textbox', { name: 'User' })).toHaveFocus();
    act(() => { again().focus(); });
    rerender(<Form hostOff check={false} />);
    expect(screen.getByRole('textbox', { name: 'User' })).toHaveFocus();
  });

  it('a crumb the person focuses keeps the focus through later renders', () => {
    const { rerender } = render(<Form />);
    const crumb = screen.getByRole('button', { name: 'Back to Session' });
    act(() => { crumb.focus(); });
    rerender(<Form n={1} />);
    rerender(<Form check={false} n={2} />);
    expect(crumb).toHaveFocus();
  });

  it('the person leaves the form for the page (a blur to nothing from an enabled control): later renders leave it there', () => {
    const { rerender } = render(<Form />);
    expect(host()).toHaveFocus();
    act(() => { host().blur(); });
    rerender(<Form n={1} />);
    expect(document.body).toHaveFocus();
  });
});
