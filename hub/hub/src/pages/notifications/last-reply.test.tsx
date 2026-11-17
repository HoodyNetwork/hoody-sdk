// Vitest, the notice drawer: the reply that uses up the notice's last allowed reply is confirmed as sent; it is never
// answered with the limit sentence as if it had been refused.
// One reply left reads "1 more reply".
import { renderPage, screen, userEvent } from '@app/testing';
import { resetAttempts } from '@core/attempts';
import { resetChanges } from '@core/changes';
import { ATTEMPT_PREFIX, readChanges, writeChanges } from '@core/change-store';
import { beforeEach, expect, it } from 'vitest';
import { resetDraftsForTests } from './abuse';
import { REPLY_LIMIT } from './abuseLogic';
import { NOTICE_PLAIN, abuseReplies, fillOwnerRepliesForTests, resetAbuseFixtures } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const T = { timeout: 10000 };

beforeEach(() => {
  const kept = readChanges();
  if (kept) writeChanges(kept.filter((r) => !r.id.startsWith(ATTEMPT_PREFIX)));
  resetAttempts();
  resetChanges();
  resetDraftsForTests();
  resetAbuseFixtures();
});

it('the last allowed reply: "Reply sent", not the limit sentence', async () => {
  fillOwnerRepliesForTests(NOTICE_PLAIN, REPLY_LIMIT - 1);
  await renderPage(page, { path: `/notifications/notices?sel=${NOTICE_PLAIN}` });
  await userEvent.type(await screen.findByRole('textbox', { name: strings['an.reply.label'] }, T), 'Fixed.');
  await userEvent.click(screen.getByRole('button', { name: strings['an.reply.send'] }));
  expect(await screen.findByText(strings['an.sent'], undefined, T)).toBeInTheDocument();
  expect(screen.queryByText(strings['an.err.limit'])).toBeNull();
  expect(abuseReplies).toHaveLength(1);
});

it('one reply left: "1 more reply", never "1 more replies"', async () => {
  fillOwnerRepliesForTests(NOTICE_PLAIN, REPLY_LIMIT - 1);
  await renderPage(page, { path: `/notifications/notices?sel=${NOTICE_PLAIN}` });
  expect(await screen.findByText('0 of 4,000 characters. You can send 1 more reply on this notice.', undefined, T)).toBeInTheDocument();
});
