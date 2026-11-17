// Vitest: Remove all local data while a payment made in this browser is not settled. The banner that keeps the confirm
// off says what to do in its title. Nothing was tried yet, so the kit's failed title ("This didn't go through") would
// contradict a body that says the payment has no final answer.
import { bootFixtureCore } from '@core';
import { renderPage, waitFor, within } from '@app/testing';
import { beforeEach, expect, it } from 'vitest';
import { locks } from './parts/locks';
import page from './page';
import strings from './strings.en.json';
import kitStrings from '@kit/strings.en.json';

beforeEach(() => {
  bootFixtureCore();
  locks.clear();
});

it('the payments banner has its own title, not the kit\'s failed title', async () => {
  await renderPage(page, { state: 'wipe-payments', path: '/account?sheet=wipe' });
  const d = await waitFor(() => {
    const el = document.querySelector<HTMLElement>('[role="alertdialog"], [role="dialog"]');
    if (!el) throw new Error('no open dialog');
    return el;
  });
  expect(await within(d).findByText(strings['w.payHeld'], { exact: false })).toBeInTheDocument();
  expect(within(d).getByText(strings['w.payTitle'])).toBeInTheDocument();
  expect(within(d).queryByText(kitStrings['outcome.failed.title'])).toBeNull();
});
