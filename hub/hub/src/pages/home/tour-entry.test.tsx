// Vitest: a session without the Welcome (an access key: no account capability) still has a way back to the tour,
// a "Take the tour" link in Home's header.
import { renderPage, screen, waitFor } from '@app/testing';
import { describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import './testWaits';
import page from './page';
import strings from './strings.en.json';

vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  return { ...real, useCan: (k: Parameters<typeof real.useCan>[0]) => (k === 'account' ? false : real.useCan(k)) };
});

describe('Home: the way back to the tour without the Welcome', () => {
  it('an access-key session sees "Take the tour" in the header, linked to the tour', async () => {
    await renderPage(page);
    await waitFor(() => expect(screen.getAllByRole('link', { name: strings['intro.tour'] }).length).toBeGreaterThan(0), { timeout: 8000 });
    for (const a of screen.getAllByRole('link', { name: strings['intro.tour'] })) expect(a.getAttribute('href')).toMatch(/onboarding/);
    expect(screen.queryByRole('button', { name: strings['intro.reopen'] })).toBeNull();
  }, 30000);
});
