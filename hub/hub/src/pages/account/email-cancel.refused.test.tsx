// Vitest: what the page says after a Cancel of a waiting email change that did not succeed. A cancel the API refused
// is said as a refusal, never in the page's done banner. A check that proves nothing says nothing there either: the
// cancel's own row keeps saying the outcome is unknown, with Check again (C9).
import { bootFixtureCore } from '@core';
import { renderPage, screen, userEvent } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({ refuse: false }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof dataModule>();
  return {
    ...real,
    // The cancel as core answers a definite refusal: sent, refused, nothing held.
    useEmailCancel: () => {
      const c = real.useEmailCancel();
      return world.refuse ? { ...c, run: async () => ({ outcome: 'failed', status: 400 }) } : c;
    },
  };
});

import type * as dataModule from './data';
import { locks } from './parts/locks';
import page from './page';
import strings from './strings.en.json';

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

beforeEach(() => {
  bootFixtureCore();
  locks.clear();
  world.refuse = false;
});

describe('a cancel of the waiting email change that did not succeed', () => {
  it('a refused cancel is said as a refusal, not in a done banner, and Cancel can be pressed again', async () => {
    world.refuse = true;
    await renderPage(page, { state: 'email-waiting' });
    await userEvent.click(await screen.findByRole('button', { name: strings['e.cancel'] }, { timeout: 8000 }));
    const said = await screen.findByText(strings['e.cancelFailed']);
    expect(said.closest('[data-outcome]')?.getAttribute('data-outcome')).toBe('failed');
    expect(document.querySelector('[data-outcome="done"]')).toBeNull();
    expect(screen.getByRole('button', { name: strings['e.cancel'] })).toBeInTheDocument();
  });

  it('a check that proves nothing shows no done banner: the row says the outcome is unknown', async () => {
    await renderPage(page, { state: 'email-cancel-pending' });
    await userEvent.click(await screen.findByRole('button', { name: strings['e.cancel'] }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('button', { name: strings['check.again'] }));
    expect(await screen.findByText(new RegExp(esc(strings['check.dismissWarn'].slice(0, 30))))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(esc(strings['e.cancelUnknown'])))).toBeInTheDocument();
    expect(document.querySelector('[data-outcome="done"]')).toBeNull();
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
  });
});
