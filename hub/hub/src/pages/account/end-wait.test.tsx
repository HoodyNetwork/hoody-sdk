// Vitest: a refused end of a session says the wait when the answer named one, as every other refusal on the page.
import { renderPage, userEvent, waitFor, within } from '@app/testing';
import { bootFixtureCore } from '@core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Data from './data';
import page from './page';
import { locks } from './parts/locks';
import strings from './strings.en.json';

const A = '5e55c0ffee00000000000002';
const core = vi.hoisted(() => ({ answer: {} as { outcome: string; status?: number; code?: string; retryAfter?: number } }));
const useFake = () => ({
  run: async () => core.answer,
  running: false,
  pending: false,
  holds: [],
  readBack: async () => false,
  heldNow: () => [],
  dismissRows: async () => true,
});
vi.mock('./data', async (orig) => {
  const data = await orig<typeof Data>();
  return { ...data, useEndSession: useFake, useEndOthers: useFake };
});
beforeEach(() => {
  bootFixtureCore();
  locks.clear();
});

const dialogIn = (): Promise<HTMLElement> =>
  waitFor(
    () => {
      const d = document.querySelector<HTMLElement>('[role="alertdialog"]');
      if (!d) throw new Error('no dialog');
      return d;
    },
    { timeout: 8000 },
  );

describe('ending a session, too many tries', () => {
  it('a wait named by the answer is said in minutes', async () => {
    core.answer = { outcome: 'failed', status: 429, code: 'RATE_LIMIT_EXCEEDED', retryAfter: 900 };
    await renderPage(page, { path: `/account?end=${A}` });
    const d = await dialogIn();
    await userEvent.click(within(d).getByRole('button', { name: strings['s.end'] }));
    expect(await within(d).findByText(strings['err.tooManyWait_other'].replace('{{count}}', '15'))).toBeInTheDocument();
  });
  it('no wait named: the sentence that promises no time', async () => {
    core.answer = { outcome: 'failed', status: 429, code: 'RATE_LIMIT_EXCEEDED' };
    await renderPage(page, { path: `/account?end=${A}` });
    const d = await dialogIn();
    await userEvent.click(within(d).getByRole('button', { name: strings['s.end'] }));
    expect(await within(d).findByText(strings['err.tooMany'])).toBeInTheDocument();
  });
});
