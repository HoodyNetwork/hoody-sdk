// Plans: with no way to the market (the Bare metal page hidden: usePlace('market') is null), no band is drawn and no
// column points to it.
import { renderPage, screen, within } from '@app/testing';
import { describe, expect, it, vi } from 'vitest';
import page from './page';
import type * as Links from './pagelinks';
import strings from './strings.en.json';

vi.mock('./pagelinks', async (importOriginal) => {
  const actual = await importOriginal<typeof Links>();
  return { ...actual, usePlace: (id: Parameters<typeof actual.usePlace>[0]) => (id === 'market' ? null : actual.usePlace(id)) };
});

describe('no market link', () => {
  it('no Bare metal band, and the last plan has no Next hint', async () => {
    await renderPage(page, { state: 'plans-live', path: '/billing' });
    const pro = await screen.findByRole('group', { name: 'Pro' }, { timeout: 15_000 });
    expect(within(screen.getByRole('group', { name: 'Plus' })).getByText(/Next: Pro\./)).toBeVisible();
    expect(within(pro).queryByText(/Next:/)).toBeNull();
    expect(screen.queryByRole('group', { name: strings['plans.bareMetal'] })).toBeNull();
    expect(document.querySelector('[data-kit="plan-card"][data-wide]')).toBeNull();
    expect(screen.queryByRole('button', { name: strings['plans.browseMachines'] })).toBeNull();
  });
});
