// The 2FA dialog host over core's prompt: opens on ask, Enter/Confirm answers the trimmed code and
// shows Checking until the change settles, a retry says the code didn't work, Cancel/Escape answer
// null (also while checking), and the code never survives a close or a new prompt.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { otpPrompt, otpState, resetOtp } from '@core/otp';
import { OtpDialog } from './OtpDialog';

afterEach(() => {
  act(() => resetOtp());
});

// Returns the answer promise boxed: an async function returning a promise would await the answer.
async function ask(retry = false): Promise<{ answer: Promise<string | null> }> {
  let answer!: Promise<string | null>;
  await act(async () => {
    answer = otpPrompt.ask(retry ? { retry: true } : undefined);
  });
  return { answer };
}

const field = () => screen.getByRole('textbox', { name: 'Code' });
const typeCode = (v: string) => fireEvent.change(field(), { target: { value: v } });
const confirm = () => screen.getByRole('button', { name: 'Confirm' });

describe('OtpDialog', () => {
  it('shows nothing until core asks', () => {
    render(<OtpDialog />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('opens on ask with the code field focused and Confirm disabled while blank', async () => {
    render(<OtpDialog />);
    await ask();
    expect(screen.getByRole('alertdialog', { name: 'Enter your two-step code' })).toBeInTheDocument();
    await waitFor(() => expect(field()).toHaveFocus());
    // The dialog takes six digits only: it says a backup code is no use here before one is tried.
    expect(screen.getByText("Use the newest code your app shows. A backup code doesn't work here.")).toBeInTheDocument();
    expect(field()).toHaveAttribute('autocomplete', 'one-time-code');
    expect(field()).toHaveAttribute('inputmode', 'numeric');
    expect(confirm()).toBeDisabled();
  });

  it('Enter answers the trimmed code and clears the field', async () => {
    render(<OtpDialog />);
    const { answer } = await ask();
    typeCode(' 123456 ');
    await act(async () => {
      fireEvent.keyDown(field(), { key: 'Enter' });
    });
    expect(await answer).toBe('123456');
    expect(screen.queryByDisplayValue(/123456/)).toBeNull();
  });

  it('Confirm answers the code; Checking shows until the change settles, then it closes', async () => {
    render(<OtpDialog />);
    const { answer } = await ask();
    typeCode('654321');
    await act(async () => {
      fireEvent.click(confirm());
    });
    expect(await answer).toBe('654321');
    expect(screen.getByText('Checking the code…')).toBeInTheDocument();
    expect(field()).toBeDisabled();
    expect(confirm()).toBeDisabled();
    await act(async () => {
      otpPrompt.settle?.();
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('a retry says the code did not work, with an empty, usable field', async () => {
    render(<OtpDialog />);
    const { answer } = await ask();
    typeCode('111111');
    await act(async () => {
      fireEvent.click(confirm());
    });
    await answer;
    await ask(true);
    // A code is also refused when it was already used, and the newest code is then the refused one: the line says to wait.
    expect(screen.getByText("That code didn't work or was already used. Wait for the next code.")).toBeInTheDocument();
    expect(field()).toHaveValue('');
    expect(field()).toBeEnabled();
  });

  it('Cancel answers null and drops what was typed', async () => {
    render(<OtpDialog />);
    const { answer } = await ask();
    typeCode('99');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(await answer).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await ask();
    expect(field()).toHaveValue('');
    expect(screen.queryByText(/didn't work/)).toBeNull();
  });

  it('Cancel while checking closes the dialog', async () => {
    render(<OtpDialog />);
    const { answer } = await ask();
    typeCode('222222');
    await act(async () => {
      fireEvent.click(confirm());
    });
    await answer;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(otpState().open).toBe(false);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('Escape cancels', async () => {
    render(<OtpDialog />);
    const { answer } = await ask();
    await act(async () => {
      fireEvent.keyDown(field(), { key: 'Escape' });
    });
    expect(await answer).toBeNull();
  });

  it('a prompt closed by core (realm switch) closes the dialog and forgets the code', async () => {
    render(<OtpDialog />);
    const { answer } = await ask();
    typeCode('42');
    await act(async () => {
      otpPrompt.cancel();
    });
    expect(await answer).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await ask();
    expect(field()).toHaveValue('');
  });

  it('a context that ends while the dialog stays open (here: page hide) wipes the typed code', async () => {
    render(<OtpDialog />);
    await ask();
    typeCode('123');
    expect(field()).toHaveValue('123');
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(field()).toHaveValue('');
    expect(confirm()).toBeDisabled();
  });

  it('the kit code field: digits only, and Confirm and Enter wait for all six', async () => {
    render(<OtpDialog />);
    const { answer } = await ask();
    let answered = false;
    void answer.then(() => (answered = true));
    typeCode('12a-34');
    expect(field()).toHaveValue('1234');
    expect(confirm()).toBeDisabled();
    await act(async () => {
      fireEvent.keyDown(field(), { key: 'Enter' });
    });
    expect(answered).toBe(false);
    typeCode('123456');
    expect(confirm()).toBeEnabled();
  });
});
