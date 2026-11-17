// Plans: each column's "Next" hint, the Bare metal band under the columns
// (its own section: real ranges and a "from" over the market's 30-day rentals, never a guessed price) and the line of what every plan
// includes.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import page from './page';
import { bareFacts } from './plans-next';
import { listings } from './servers/fixtures';
import { money } from './servers/logic';
import strings from './strings.en.json';

const band = () => screen.findByRole('group', { name: strings['plans.bareMetal'] }, { timeout: 15_000 }); // the first test loads the lazy page
const ready = () => screen.findByRole('group', { name: strings['plans.free'] }, { timeout: 15_000 });
const column = (name: string) => screen.getByRole('group', { name });
const from = money(bareFacts({ listings, failed: [] })?.fromCents ?? null);

describe('the Bare metal band', () => {
  it('names the cheapest 30-day rental and the machines\' ranges, and its one button opens the Bare metal view', async () => {
    const { router } = await renderPage(page, { state: 'plans-live', path: '/billing' });
    const b = await band();
    expect(from).not.toBe('');
    await waitFor(() => expect(within(b).getByText(strings['plans.bareFrom'].replace('{{amount}}', from))).toBeVisible());
    for (const k of ['plans.bareFromLabel', 'plans.bareCores', 'plans.bareRam', 'plans.bareDisk', 'plans.bareCountries'] as const) expect(within(b).getByText(strings[k])).toBeVisible();
    // The band is the tab's one way to the market: the section's own "Browse the market" is gone.
    expect(screen.queryByRole('button', { name: strings['servers.browseMarket'] })).toBeNull();
    await userEvent.click(within(b).getByRole('button', { name: strings['plans.browseMachines'] }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ view: 'servers' }));
  });
  for (const state of ['servers-one-failed', 'servers-both-failed', 'servers-loading', 'servers-empty'])
    it(`${state}: no price and no ranges, only what bare metal is and the way to it`, { timeout: 40_000 }, async () => {
      await renderPage(page, { state, path: '/billing' });
      const b = await band();
      await ready();
      expect(within(b).queryByText(strings['plans.bareFromLabel'])).toBeNull();
      expect(within(b).queryByText(strings['plans.bareCores'])).toBeNull();
      expect(within(b).getByText(strings['plans.bareMetalBody'])).toBeVisible();
      expect(within(b).getByRole('button', { name: strings['plans.browseMachines'] })).toBeEnabled();
    });
});

describe('every plan includes', () => {
  it('is one line under the band', async () => {
    await renderPage(page, { state: 'plans-live', path: '/billing' });
    const b = await band();
    const line = screen.getByText(strings['plans.includes']);
    expect(line).toBeVisible();
    // After the band in the document.
    expect(b.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('the Next hints', () => {
  it('Free points to the first plan, a plan to the next with what gets tight, the last to bare metal', async () => {
    await renderPage(page, { state: 'plans-live', path: '/billing' });
    await screen.findByRole('group', { name: 'Pro' }, { timeout: 15_000 });
    await band();
    expect(within(column(strings['plans.free'])).getByText(/Next: Plus\./)).toBeVisible();
    expect(within(column('Plus')).getByText(/Next: Pro\. When .+ get tight\./)).toBeVisible();
    expect(within(column('Pro')).getByText(strings['plans.nextBare'])).toBeVisible();
  });
  it('none while the catalogue is on its way', async () => {
    await renderPage(page, { state: 'plans-pending', path: '/billing' });
    await band();
    expect(within(column(strings['plans.free'])).queryByText(/Next:/)).toBeNull();
  });
  it('none while the plans are for a picked server: the note says what each column means for it', async () => {
    await renderPage(page, { path: '/billing?sub=a1b2c3d4e5f60718293a4b01' });
    await screen.findByRole('group', { name: 'Medium' }, { timeout: 15_000 });
    await waitFor(() => expect(screen.getAllByText(/in place\./).length).toBeGreaterThan(0));
    expect(screen.queryByText(/Next:/)).toBeNull();
  });
});
