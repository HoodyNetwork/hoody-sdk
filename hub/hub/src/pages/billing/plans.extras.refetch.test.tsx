// The Bare metal band shows a price and ranges only from a market read that both rails answered
// clean in one read cycle and are not reading again (usePairedListings paired). During a refetch the cached answer of one
// rail can sit beside the new answer of the other: then the band says only what bare metal is. The read cycle itself, with
// rails read again independently through the real queries: plans.band-cycle.live.test.tsx.
import { renderPage, screen, within } from '@app/testing';
import { describe, expect, it, vi } from 'vitest';
import page from './page';
import type * as Data from './servers/data';
import { listings } from './servers/fixtures';
import strings from './strings.en.json';

const fx = vi.hoisted(() => ({ paired: false }));

vi.mock('./servers/data', async (importOriginal) => {
  const actual = await importOriginal<typeof Data>();
  return {
    ...actual,
    usePairedListings: () => ({ ...actual.usePairedListings(), data: { listings, failed: [] }, paired: fx.paired }),
  };
});

const band = () => screen.findByRole('group', { name: strings['plans.bareMetal'] }, { timeout: 15_000 });

describe('the Bare metal band during a market read', () => {
  it('a read still going (not paired) with whole cached data: no price and no ranges', async () => {
    fx.paired = false;
    await renderPage(page, { state: 'plans-live', path: '/billing' });
    const b = await band();
    expect(within(b).queryByText(strings['plans.bareFromLabel'])).toBeNull();
    expect(within(b).queryByText(strings['plans.bareCores'])).toBeNull();
    expect(within(b).getByRole('button', { name: strings['plans.browseMachines'] })).toBeEnabled();
  });
  it('the same data once both rails answered clean in one cycle: the price and ranges show', async () => {
    fx.paired = true;
    await renderPage(page, { state: 'plans-live', path: '/billing' });
    const b = await band();
    expect(await within(b).findByText(strings['plans.bareFromLabel'])).toBeVisible();
    expect(within(b).getByText(strings['plans.bareCores'])).toBeVisible();
  });
});
