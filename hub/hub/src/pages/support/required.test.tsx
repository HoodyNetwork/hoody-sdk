// Vitest: the New ticket form names the required field that is still empty. The API requires category, subject and
// body (support.schemas.ts); Send ticket is off without them, and the footer's reason line says which one is missing,
// in the form's order, so a form that lacks only that never looks dead.
// The reply box's Send says the same when it is off only because nothing is written yet.
import { act, renderPage, screen, userEvent } from '@app/testing';
import { resetAttempts } from '@core/attempts';
import { resetChanges } from '@core/changes';
import { ATTEMPT_PREFIX, readChanges, writeChanges } from '@core/change-store';
import { beforeEach, describe, expect, it } from 'vitest';
import { T_OPEN, requestLog } from './fixtures';
import { putPrefill, resetPrefillForTests, type Prefill } from './links';
import page from './page';
import strings from './strings.en.json';

const SLOW = { timeout: 15000 };

beforeEach(() => {
  const kept = readChanges();
  if (kept) writeChanges(kept.filter((r) => !r.id.startsWith(ATTEMPT_PREFIX)));
  resetAttempts();
  resetChanges();
  resetPrefillForTests();
  requestLog.length = 0;
});

async function openWith(prefill: Prefill | null) {
  const r = await renderPage(page, { path: '/support' });
  if (prefill) putPrefill(prefill);
  await act(async () => {
    await r.router.navigate({ href: '/support?new=1' } as never);
  });
  await screen.findByRole('textbox', { name: strings['new.subject'] }, SLOW);
  const send = screen.getByRole('button', { name: strings['action.sendTicket'] });
  const reason = () => document.querySelector('[data-drawer-reason]')?.textContent ?? null;
  return { send, reason };
}
const off = (el: HTMLElement) => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';

describe('New ticket: the missing required field is named', () => {
  it('an empty form: Send ticket is off and the footer asks for the category', { timeout: 60000 }, async () => {
    const { send, reason } = await openWith(null);
    expect(off(send)).toBe(true);
    expect(reason()).toBe(strings['new.need.category']);
  });

  it('a category only: the footer asks for the subject', { timeout: 60000 }, async () => {
    const { send, reason } = await openWith({ category: 'billing' });
    expect(off(send)).toBe(true);
    expect(reason()).toBe(strings['new.need.subject']);
  });

  it('category and subject: the footer asks for the message; spaces alone are not a message', { timeout: 60000 }, async () => {
    const { send, reason } = await openWith({ category: 'billing', subject: 'Invoice shows the wrong country', body: '   ' });
    expect(off(send)).toBe(true);
    expect(reason()).toBe(strings['new.need.message']);
  });

  it('all three filled: no reason line and Send ticket is on', { timeout: 60000 }, async () => {
    const { send, reason } = await openWith({ category: 'billing', subject: 'Invoice shows the wrong country', body: 'The country on my invoice is wrong.' });
    expect(reason()).toBeNull();
    expect(off(send)).toBe(false);
  });

  it('subject and message carry the required mark, like the category', { timeout: 60000 }, async () => {
    await openWith(null);
    expect(screen.getByRole('textbox', { name: strings['new.subject'] })).toBeRequired();
    expect(screen.getByRole('textbox', { name: strings['new.message'] })).toBeRequired();
  });
});

describe('Reply: Send says why it is off', () => {
  it('an empty reply: Send is off and says to write the message; once written, no reason', { timeout: 60000 }, async () => {
    await renderPage(page, { path: `/support?sel=${String(T_OPEN.id)}` });
    const box = await screen.findByRole('textbox', { name: strings['reply.label'] }, SLOW);
    const send = () => screen.getByRole('button', { name: strings['action.send'] });
    expect(off(send())).toBe(true);
    expect(send()).toHaveAccessibleDescription(strings['new.need.message']);
    await userEvent.type(box, 'Any news on the invoice?');
    expect(off(send())).toBe(false);
    expect(send()).not.toHaveAccessibleDescription();
  });
});
