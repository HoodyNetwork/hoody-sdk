// Vitest: a page that sends no payment has no Confirm, so it offers no Location choice either: a choice made there
// could not be carried to the web Hub's checkout, and the place of a server is permanent. The one-file Hub's Buy a plan
// says, in one line, that the location is chosen at checkout in the web Hub; no list is read, no "will be in" line is
// shown, and the attempt names no region. The served Hub keeps its choice.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import { resetUnknownCheckouts } from './data';
import page from './page';
import strings from './strings.en.json';

const fx = vi.hoisted(() => ({ standalone: false, regionsFor: [] as Array<string | null> }));

vi.mock('@core', async (orig) => {
  const a: Record<string, unknown> = await orig();
  return { ...a, isStandalone: () => fx.standalone, servedHubUrl: (route = '') => 'https://hoody.example/auth/home' + (route ? '#' + route : '') };
});
vi.mock('./data', async (orig) => {
  const a: Record<string, any> = await orig();
  return { ...a, usePlanRegions: (planId: string | null) => { fx.regionsFor.push(planId); return a.usePlanRegions(planId); } };
});

afterEach(() => { fx.standalone = false; fx.regionsFor.length = 0; });

async function openBuy() {
  resetUnknownCheckouts();
  await renderPage(page, { path: '/billing?checkout=buy&plan=fam-plus' });
  const dialog = await screen.findByRole('dialog', undefined, { timeout: 20000 });
  await within(dialog).findByRole('checkbox', undefined, { timeout: 20000 });
  return dialog;
}
const AUTO_NOW = new RegExp(strings['loc.autoNow'].split('{{place}}')[0]!.trim());
const CHOSEN = new RegExp(strings['loc.chosen'].split('{{place}}')[0]!.trim());

describe('Buy a plan on a page with no Confirm', () => {
  it('the one-file Hub: no Location choice, no place named, one line that it is chosen at checkout in the web Hub', async () => {
    fx.standalone = true;
    const dialog = await openBuy();
    expect(within(dialog).queryByRole('radiogroup', { name: strings['loc.label'] })).toBeNull();
    expect(within(dialog).getAllByText(strings['loc.atCheckout'])).toHaveLength(1);
    expect(dialog).not.toHaveTextContent(AUTO_NOW);
    expect(dialog).not.toHaveTextContent(CHOSEN);
    expect(dialog).not.toHaveTextContent(strings['loc.autoHelp']);
    // No list is read for a choice that is not offered.
    expect(fx.regionsFor.length).toBeGreaterThan(0);
    expect(fx.regionsFor.every((p) => p === null)).toBe(true);
    // The link to the web Hub carries no location.
    for (const a of Array.from(dialog.querySelectorAll('a'))) expect(a.getAttribute('href') ?? '').not.toMatch(/region|de-fra|fi-hel/);
    expect(within(dialog).queryByRole('button', { name: strings['buy.confirm'] })).toBeNull();
  });

  it('the served Hub keeps the choice and does not say the hand-off line', async () => {
    const dialog = await openBuy();
    expect(within(dialog).getByRole('radiogroup', { name: strings['loc.label'] })).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['loc.atCheckout'])).toBeNull();
    expect(fx.regionsFor.some((p) => p !== null)).toBe(true);
  });

  it('an upgrade or a payment says nothing about choosing a location', async () => {
    fx.standalone = true;
    resetUnknownCheckouts();
    await renderPage(page, { path: '/billing?checkout=pay&sub=a1b2c3d4e5f60718293a4b02' });
    const dialog = await screen.findByRole('dialog', undefined, { timeout: 20000 });
    await within(dialog).findByRole('checkbox', undefined, { timeout: 20000 });
    expect(within(dialog).queryByText(strings['loc.atCheckout'])).toBeNull();
  });
});
