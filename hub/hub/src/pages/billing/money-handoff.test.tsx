// Vitest: the live terminal's money hand-off (parts/moneyHandoff.term.tsx) never reaches the web. On the web no live
// gate is installed, parts/moneyHandoff.tsx answers "not handed off" and draws nothing, and a checkout's review and the
// Add funds drawer keep their footers exactly as before: Confirm purchase and Continue to payment, no hand-off words.
// The web side does not read the gate at all, so even a gate set by mistake changes nothing here.
import { afterEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { liveGateInstalled, setLiveGate, type LiveGate } from '@core/live-gate';
import { resetUnknownCheckouts } from './data';
import page from './page';
import { MoneyHandoff, moneyInWebHub } from './parts/moneyHandoff';
import strings from './strings.en.json';

const GATE: LiveGate = { direct: () => Promise.reject(Object.assign(new Error('not sent'), { kind: 'not_sent', notSent: true })) };
const TERM_WORDS = 'made in the web Hub';

afterEach(() => setLiveGate(null));

async function openDialog(path: string, ready: (d: HTMLElement) => Promise<unknown>) {
  resetUnknownCheckouts();
  await renderPage(page, { path });
  const dialog = await screen.findByRole('dialog', undefined, { timeout: 20000 });
  await ready(dialog);
  return dialog;
}

describe('web: no money hand-off', () => {
  it('no live gate on the web; the web side hands nothing off and draws nothing', () => {
    expect(liveGateInstalled()).toBe(false);
    expect(moneyInWebHub()).toBe(false);
    const { container } = render(<MoneyHandoff />);
    expect(container.innerHTML).toBe('');
  });

  it.each([false, true])('a checkout review keeps its Confirm footer (gate set by mistake: %s)', async (gated) => {
    if (gated) setLiveGate(GATE);
    const dialog = await openDialog('/billing?checkout=buy&plan=fam-plus', (d) => within(d).findByRole('checkbox', undefined, { timeout: 20000 }));
    // As checkout-standalone.test.tsx's served case: the terms ticked, Confirm is there and can act.
    await userEvent.click(within(dialog).getByRole('checkbox'));
    expect(within(dialog).getByRole('button', { name: strings['buy.confirm'] })).toBeEnabled();
    expect(dialog.textContent).not.toContain(TERM_WORDS);
  });

  it.each([false, true])('Add funds keeps "Continue to payment" (gate set by mistake: %s)', async (gated) => {
    if (gated) setLiveGate(GATE);
    const dialog = await openDialog('/billing?sheet=funds', (d) =>
      waitFor(() => expect(d.querySelector('dl[aria-label="Wallet"]')).not.toBeNull(), { timeout: 20000 }));
    expect(await within(dialog).findByRole('button', { name: strings['top.go'] })).toBeInTheDocument();
    expect(dialog.textContent).not.toContain(TERM_WORDS);
  });
});
