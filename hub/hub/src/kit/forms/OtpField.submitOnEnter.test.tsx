// OtpField `submitOnEnter` on the web: false while its form cannot send yet. Enter in the field is default-prevented,
// so the browser's implicit submission (Enter in a one-field form) never runs and never wipes the typed code. Default
// (true) and true: Enter is left to the browser, as before. The terminal twin: OtpField.submitOnEnter.term.test.tsx.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OtpField } from './OtpField';

/** fireEvent answers false when a listener called preventDefault. */
const enterPrevented = (input: HTMLElement): boolean => !fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

describe('OtpField submitOnEnter', () => {
  it('default and true: Enter is not prevented (the form submits as before)', () => {
    const { unmount } = render(<OtpField value="123456" onChange={() => undefined} />);
    expect(enterPrevented(screen.getByLabelText('Code'))).toBe(false);
    unmount();
    render(<OtpField value="123456" onChange={() => undefined} submitOnEnter />);
    expect(enterPrevented(screen.getByLabelText('Code'))).toBe(false);
  });

  it('false: Enter is prevented, other keys are not', () => {
    render(<OtpField value="123" onChange={() => undefined} submitOnEnter={false} />);
    const input = screen.getByLabelText('Code');
    expect(enterPrevented(input)).toBe(true);
    expect(!fireEvent.keyDown(input, { key: '4', code: 'Digit4' })).toBe(false);
  });
});
