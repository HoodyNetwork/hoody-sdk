// Vitest: a message with too many lines says so. Both boxes turn Send off over 200 lines (BODY_MAX_LINES) and
// say it is too many lines, never "This is longer than 4,000 characters." for a short many-line message.
import { act, renderPage, screen, userEvent } from '@app/testing';
import { resetAttempts } from '@core/attempts';
import { resetChanges } from '@core/changes';
import { ATTEMPT_PREFIX, readChanges, writeChanges } from '@core/change-store';
import { beforeEach, describe, expect, it } from 'vitest';
import { T_OPEN, requestLog } from './fixtures';
import { putPrefill, resetPrefillForTests } from './links';
import { BODY_MAX_LINES } from './logic';
import page from './page';
import strings from './strings.en.json';

const SLOW = { timeout: 15000 };
const MANY = Array.from({ length: BODY_MAX_LINES + 1 }, (_, i) => `line ${i + 1}`).join('\n');
const tooLong = /^This is longer than /;

beforeEach(() => {
  const kept = readChanges();
  if (kept) writeChanges(kept.filter((r) => !r.id.startsWith(ATTEMPT_PREFIX)));
  resetAttempts();
  resetChanges();
  resetPrefillForTests();
  requestLog.length = 0;
});

describe('Support: too many lines is said as too many lines', () => {
  it('the reply box', { timeout: 60000 }, async () => {
    await renderPage(page, { path: `/support?sel=${String(T_OPEN.id)}` });
    const box = await screen.findByRole('textbox', { name: strings['reply.label'] }, SLOW);
    await userEvent.click(box);
    await userEvent.paste(MANY);
    expect(await screen.findByText(strings['text.tooManyLines'], undefined, SLOW)).toBeInTheDocument();
    expect(screen.queryByText(tooLong)).toBeNull();
  });

  it('the New ticket message', { timeout: 60000 }, async () => {
    const r = await renderPage(page, { path: '/support' });
    putPrefill({ category: 'billing', subject: 'Many lines', body: MANY });
    await act(async () => {
      await r.router.navigate({ href: '/support?new=1' } as never);
    });
    await screen.findByRole('textbox', { name: strings['new.subject'] }, SLOW);
    expect(await screen.findByText(strings['text.tooManyLines'], undefined, SLOW)).toBeInTheDocument();
    expect(screen.queryByText(tooLong)).toBeNull();
  });
});
