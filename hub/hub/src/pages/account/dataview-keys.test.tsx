// Vitest (a regression once seen): the account page draws three data views (sign-in sessions, SSH keys,
// security history). Each needs its own URL keys, or the three tables share one ?q and the page holds three
// searchboxes under one data-dataview key.
import { bootFixtureCore } from '@core';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { locks } from './parts/locks';
import page from './page';
import strings from './strings.en.json';

beforeEach(() => {
  bootFixtureCore();
  locks.clear();
});

describe('account data views keep their own URL keys', () => {
  it('sessions, SSH keys and history each carry a distinct data-dataview key', async () => {
    await renderPage(page);
    await screen.findByRole('table', { name: strings['k.title'] }, { timeout: 8000 });
    await screen.findByRole('table', { name: strings['h.title'] }, { timeout: 8000 });
    const keys = [...document.querySelectorAll('[data-dataview]')].map((e) => e.getAttribute('data-dataview'));
    expect(keys.length).toBeGreaterThanOrEqual(3);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('searching the SSH keys keeps to its own view: the sessions search stays empty, and no key holds the text', async () => {
    const { router } = await renderPage(page);
    const table = await screen.findByRole('table', { name: strings['k.title'] }, { timeout: 8000 });
    const view = table.closest('[data-dataview]') as HTMLElement;
    const key = view.getAttribute('data-dataview')!;
    expect(key).not.toBe('q');
    await userEvent.type(within(view).getByRole('searchbox'), 'atlas');
    expect(within(view).getByRole('searchbox')).toHaveValue('atlas');
    // Every other view's box (the sessions search among them) stays empty.
    const others = screen.getAllByRole('searchbox').filter((b) => !view.contains(b));
    expect(others.length).toBeGreaterThan(0);
    for (const b of others) expect(b).toHaveValue('');
    // The typed text is in no URL key, its own view's included.
    const search = router.state.location.search as Record<string, unknown>;
    expect(Object.values(search).filter((v) => String(v).includes('atlas'))).toEqual([]);
    expect(search.q).toBeUndefined();
  });
});
