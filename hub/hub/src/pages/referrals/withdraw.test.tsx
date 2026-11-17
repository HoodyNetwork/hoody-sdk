// Vitest: Withdraw…: an explainer that sends nothing. It names who may ask (a
// Creator) and how (contact support), links the FAQ answer (opening it shows the answer), never says withdrawal is on,
// adds no paused rule (the API and the public docs have none: the level decides), and is never offered to a removed
// account. A Referrer gets no button: one line says withdrawal is for Creators, with the FAQ answer.
// Plus the code check's unmapped failure: words and Details, never silence.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const T = 8000;
const open = (state?: string) => renderPage(page, { path: '/referrals', ...(state ? { state } : {}) });
const user = () => userEvent.setup();
const withdrawButton = () => screen.queryByRole('button', { name: strings['withdraw.action'] });
async function openWithdraw(state?: string) {
  await open(state);
  await user().click(await screen.findByRole('button', { name: strings['withdraw.action'] }, { timeout: T }));
  const dialog = await screen.findByRole('dialog', { name: strings['withdraw.title'] }, { timeout: T });
  return { dialog };
}

describe('Withdraw Referral credit: an explainer that sends nothing', () => {
  it('a Referrer: no Withdraw… button, one line that says withdrawal is for Creators, and its FAQ answer opens in place', async () => {
    await open();
    const line = await screen.findByText(strings['withdraw.line'], { exact: false }, { timeout: T });
    expect(withdrawButton()).toBeNull();
    expect(line.textContent).not.toMatch(/withdrawals? (is|are) (on|enabled)|turned on for you|contact support/i);
    await user().click(within(line).getByText(strings['withdraw.more']));
    expect(await screen.findByText(strings['faq.withdraw.a'], undefined, { timeout: T })).toBeInTheDocument();
  });

  it('a Creator: "You\'re a Creator this month, so you can ask" and how to ask (contact support)', async () => {
    const { dialog } = await openWithdraw('creator');
    expect(within(dialog).getByText(strings['withdraw.creator'])).toBeInTheDocument();
    expect(strings['withdraw.creator']).toMatch(/contact support/);
  });

  it('no Creator number sent: the same line, no figure and no button', async () => {
    await open('noThreshold');
    const line = await screen.findByText(strings['withdraw.line'], { exact: false }, { timeout: T });
    expect(line.textContent).not.toMatch(/\d/);
    expect(withdrawButton()).toBeNull();
  });

  it('earning paused, a Referrer: the Referrer line as for any Referrer, no way to ask', async () => {
    await open('earningPaused');
    const line = await screen.findByText(strings['withdraw.line'], { exact: false }, { timeout: T });
    expect(line.textContent).not.toMatch(/contact support|paused/i);
    expect(withdrawButton()).toBeNull();
  });

  it('a Creator whose earning is paused: how a Creator asks, as for any Creator, and the FAQ answer adds no paused rule', async () => {
    const { dialog } = await openWithdraw('creatorPaused');
    const d = within(dialog);
    expect(d.getByText(strings['withdraw.creator'])).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(/paused/i);
    await user().click(d.getByText(strings['withdraw.more']));
    expect(await screen.findByText(strings['faq.withdraw.a'], undefined, { timeout: T })).toBeInTheDocument();
    expect(strings['faq.withdraw.a']).toMatch(/a Creator asks Hoody support about withdrawing their credit/);
    expect(strings['faq.withdraw.a']).not.toMatch(/paused/i);
  });

  it('a removed account is never offered Withdraw, nor the Referrer line', async () => {
    await open('removed');
    expect(await screen.findByText(strings['band.removed'], undefined, { timeout: T })).toBeInTheDocument();
    expect(withdrawButton()).toBeNull();
    expect(screen.queryByText(strings['withdraw.line'], { exact: false })).toBeNull();
  });

  it('every withdraw line stays one short sentence or two, and the page rules agree on who may withdraw', () => {
    for (const k of ['withdraw.referrer', 'withdraw.referrerN', 'withdraw.creator', 'withdraw.line'] as const) expect(strings[k].length).toBeLessThanOrEqual(150);
    expect(strings['join.creditOnly']).toMatch(/except that Creators can ask Hoody support about withdrawing their credit/);
    expect(strings['faq.spend.a']).toMatch(/except that Creators can ask Hoody support about withdrawing their credit/);
    // The API has no withdrawal switch; no string describes one
    expect(Object.values(strings).filter((v) => /turns? (withdrawals?|it) on/i.test(v))).toEqual([]);
  });
});

describe('the code check fails for another reason', () => {
  it('a 5xx says the check failed, with Details; Create stays allowed', async () => {
    await open('check500');
    await user().type(await screen.findByRole('textbox', { name: strings['create.label'] }, { timeout: T }), 'fresh-one');
    expect(await screen.findByText(strings['check.failed'], undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /details/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['create.action'] })).toBeEnabled();
  });
});
