// Keys > Shared, a share made without its text: the drawer's Check again of an unconfirmed stop says what its read
// found when the read fails or the list comes back cut (as the Shared tab's own Check does), instead of nothing.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { resetAttempts } from '@core/attempts';
import { resetChanges } from '@core/changes';
import { ATTEMPT_PREFIX, readChanges, writeChanges } from '@core/change-store';
import page from './page';
import strings from './strings.en.json';
import { shareLostReads } from './fixtures';
import { resetLedgers } from './share-logic';

// Each case starts clean (as share-edit.test.tsx does): no change, attempt or share ledger left by the one before.
beforeEach(() => {
  const kept = readChanges();
  if (kept) writeChanges(kept.filter((r) => !r.id.startsWith(ATTEMPT_PREFIX)));
  resetAttempts();
  resetChanges();
  resetLedgers();
});
afterEach(() => {
  shareLostReads.mode = 'live';
});

async function unconfirmedStop() {
  await renderPage(page, { state: 'shareTextLost', path: '/keys/shared' });
  await userEvent.click(await screen.findByRole('button', { name: strings['action.share'] }, { timeout: 8000 }));
  const drawer = await screen.findByRole('dialog');
  await userEvent.click(within(drawer).getByRole('button', { name: strings['share.review'] }));
  await userEvent.click(await within(drawer).findByRole('button', { name: strings['share.create'] }));
  await within(drawer).findByText(strings['share.lostSecret'], undefined, { timeout: 8000 });
  await userEvent.click(within(drawer).getByRole('button', { name: strings['share.stopIt'] }));
  const check = await within(drawer).findByRole('button', { name: strings['action.checkAgain'] }, { timeout: 8000 });
  return { drawer, check };
}

describe('keys: the share drawer Check again of an unconfirmed stop', () => {
  it('says the read failed when the list cannot be read', async () => {
    const { drawer, check } = await unconfirmedStop();
    shareLostReads.mode = 'fail';
    await userEvent.click(check);
    expect(await within(drawer).findByText(strings['share.stopReadFailed'], undefined, { timeout: 8000 })).toBeInTheDocument();
  }, 40000);

  it('says the list was cut when it comes back cut without the share', async () => {
    const { drawer, check } = await unconfirmedStop();
    shareLostReads.mode = 'cut';
    await userEvent.click(check);
    expect(await within(drawer).findByText(strings['share.stopCut'], undefined, { timeout: 8000 })).toBeInTheDocument();
  }, 40000);
});
