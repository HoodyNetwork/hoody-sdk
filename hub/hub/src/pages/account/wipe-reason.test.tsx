// Vitest: the Remove all local data confirm's reason line. A live page reads the warning
// synchronously, so the dialog can open with the reason already known; the line must exist before its text arrives, or
// a screen reader may never announce it.
import { bootFixtureCore } from '@core';
import { renderPage, waitFor, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Data from './data';
import { locks } from './parts/locks';
import page from './page';
import strings from './strings.en.json';

vi.mock('./data', async (orig) => {
  const data = await orig<typeof Data>();
  const warning = { account: 'acct', holds: [{ ref: { id: 'acct\u0001computers:start:c1', token: '1#a' }, page: 'computers' }], asks: [], payments: 'settled' };
  return { ...data, useLocalWipe: () => ({ warning, run: async () => ({ kind: 'failed' as const }), reread: () => undefined }) };
});

beforeEach(() => {
  bootFixtureCore();
  locks.clear();
});

describe('a reason known when the dialog opens', () => {
  it('reaches the polite line after the line is in the page, so it is announced', async () => {
    const late: string[] = [];
    const seen = new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target instanceof Element ? r.target : r.target.parentElement;
        if (el?.getAttribute('role') === 'status' && el.textContent === strings['w.reason.tick']) late.push(r.type);
      }
    });
    seen.observe(document.body, { childList: true, subtree: true, characterData: true });
    await renderPage(page, { path: '/account?sheet=wipe' });
    const d = await waitFor(() => {
      const x = document.querySelector<HTMLElement>('[role="alertdialog"]');
      if (!x) throw new Error('no dialog');
      return x;
    });
    expect(await within(d).findByText(strings['w.reason.tick'])).toBeInTheDocument();
    await waitFor(() => expect(late.length).toBeGreaterThan(0));
    seen.disconnect();
  });
});
