// Vitest: a rent hold the browser would not store (core keeps it in this tab's memory only) says so on its band, in
// the page banner over the Bare metal view. Core's own path there needs storage that refuses writes, so its read is
// stood in for here; the page reads unknown purchases from core, as a live page does.
import { describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import { renderPage, screen } from '@app/testing';
import page from '../page';
import billingStrings from '../strings.en.json';

vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  const held = { server_id: 'l01', name: 'Frankfurt L', days: '30', at: 1, dismissed: false, sending: false, persisted: false };
  return { ...real, commerce: { ...real.commerce, rentPendingFor: () => [held] } };
});
vi.mock('../data', async (orig) => {
  const a: Record<string, unknown> = await orig();
  return { ...a, useUnknownCheckouts: a.useUnknownCheckoutsLive };
});

describe('a rent hold kept only in this tab', () => {
  it('says that only this tab remembers it', async () => {
    await renderPage(page, { path: '/billing?view=servers' });
    expect(await screen.findByText(billingStrings['band.unknownTitle'].replace('{{title}}', 'Frankfurt L'))).toBeInTheDocument();
    expect(screen.getByText(billingStrings['band.notSaved'], { exact: false })).toBeInTheDocument();
    expect(screen.getByText(billingStrings['band.unknownBody'])).toBeInTheDocument();
  });
});
