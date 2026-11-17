// The Security summary when its reads fail: an unread status is never shown as a bad one (an unread profile is not
// "not verified"), and every unread row has its own Try again, so no failed read is left without a way on.
import { renderPage, screen, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const SLOW = { timeout: 8000 };

describe('account: the Security summary with failed reads', () => {
  it('says each status could not be read, with a Try again on each', async () => {
    await renderPage(page, { state: 'error' });
    const list = await screen.findByRole('list', { name: strings['sum.railTitle'] }, SLOW);
    expect(within(list).queryByText(strings['sum.emailNo'])).toBeNull();
    const rows = [strings['sum.emailUnknown'], strings['sum.twofaUnknown'], strings['sum.sessionsUnknown']].map((text) => within(list).getByText(text).closest('li') as HTMLElement);
    for (const row of rows) {
      expect(within(row).getByRole('button', { name: strings['sum.tryAgain'] })).toBeInTheDocument();
    }
  });
});
