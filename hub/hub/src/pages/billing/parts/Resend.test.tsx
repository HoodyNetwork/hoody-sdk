// The confirmed resend states the charge of the very request it sends: the dialog's sentence
// comes from the snapshot read when it opens, which is also what its confirm hands on, never from a separate read
// made at render (a kept record that changed between the render and the press must not show one amount and send another).
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import strings from '../strings.en.json';
import { Resend } from './Resend';

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
});

const hint = (max: string) => strings['co.resendHint'].replace('{{max}}', max);

describe('Resend: the dialog states the charge of the snapshot it sends', () => {
  it('a kept ceiling that changed after the render: the dialog shows the one read at open, and confirm sends that same snapshot', async () => {
    let kept = { key: 'k1', maxCents: 500 };
    const onSend = vi.fn();
    render(<Resend overlayId="billing-resend-test" prepare={() => kept} chargeOf={(sh) => ({ maxCents: sh.maxCents })} onSend={onSend} />);
    kept = { key: 'k1', maxCents: 900 }; // the record changed after the render, before the press
    await userEvent.click(screen.getByRole('button', { name: strings['co.resend'] }));
    const ask = await screen.findByRole('alertdialog', { name: strings['co.resendTitle'] });
    expect(within(ask).getByText(hint('$9.00'))).toBeInTheDocument();
    expect(within(ask).queryByText(hint('$5.00'))).toBeNull();
    kept = { key: 'k1', maxCents: 1200 }; // and again while the dialog is open: the dialog keeps what it stated
    await userEvent.click(within(ask).getByRole('button', { name: strings['co.resendConfirm'] }));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith({ key: 'k1', maxCents: 900 });
  });

  it('a top-up states the amount of the snapshot it sends', async () => {
    const onSend = vi.fn();
    render(<Resend overlayId="billing-resend-test" prepare={() => ({ key: 't1', amount: '25.00' })} chargeOf={(sh) => ({ topUpAmount: sh.amount })} onSend={onSend} />);
    await userEvent.click(screen.getByRole('button', { name: strings['co.resend'] }));
    const ask = await screen.findByRole('alertdialog', { name: strings['co.resendTitle'] });
    expect(within(ask).getByText(strings['co.resendTopUpHint'].replace('{{amount}}', '$25.00'))).toBeInTheDocument();
    await userEvent.click(within(ask).getByRole('button', { name: strings['co.resendConfirm'] }));
    expect(onSend).toHaveBeenCalledWith({ key: 't1', amount: '25.00' });
  });
});
