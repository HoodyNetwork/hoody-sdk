// Vitest, the held reply's Check again in the notice drawer: what the check found is its own status line (read aloud),
// and the line saying what Check again does stays, with its warning that a message of the same text may be an earlier one.
import { renderPage, screen, userEvent, within } from '@app/testing';
import { resetAttempts } from '@core/attempts';
import { resetChanges } from '@core/changes';
import { ATTEMPT_PREFIX, readChanges, writeChanges } from '@core/change-store';
import kit from '@kit/strings.en.json';
import { beforeEach, expect, it } from 'vitest';
import { resetDraftsForTests } from './abuse';
import { NOTICE_PLAIN, resetAbuseFixtures } from './fixtures';
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

it('Check again: the result is announced in a status line and the check line with its warning stays', async () => {
  await renderPage(page, { state: 'notice-reply-unknown', path: `/notifications/notices?sel=${NOTICE_PLAIN}` });
  await userEvent.type(await screen.findByRole('textbox', { name: strings['an.reply.label'] }, T), 'Fixed.');
  await userEvent.click(screen.getByRole('button', { name: strings['an.reply.send'] }));
  expect(await screen.findByText(strings['an.held.known'], undefined, T)).toBeInTheDocument();
  expect(screen.getByText(strings['an.held.checkLine'])).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: kit['outcome.pending.check'] }));
  const checked = await screen.findByText(/^Checked at /, undefined, T);
  expect(checked.closest('[role="status"]')).not.toBeNull();
  expect(within(checked.closest('[role="status"]') as HTMLElement).getByText(/^Checked at /)).toBe(checked);
  expect(screen.getByText(strings['an.held.checkLine'])).toBeInTheDocument();
});
