// Vitest: the account page's questions. One builder feeds the page's Questions section and the links on the
// passcode row, the passcode sheet, the email sheet, the two-step row and the Remove all local data dialog.
import { FRAME_GRACE_MS } from '@core/applock';
import { describe, expect, it } from 'vitest';
import { pageFaq } from './faq';
import { parseDays } from './logic';
import strings from './strings.en.json';

const IDS = ['lockProtects', 'lockScope', 'removeLocal', 'emailChange', 'endSession', 'twoStep', 'checkAgain', 'agentDays'] as const;
const t = (k: keyof typeof strings) => strings[k] as string;

describe('account pageFaq', () => {
  const { items, byId } = pageFaq(t as never);

  it('lists the eight questions in order, each id once, each read from its own strings', () => {
    expect(items.map((i) => i.id)).toEqual([...IDS]);
    for (const i of items) {
      expect(i.q).toBe(strings[`faq.${i.id}.q` as keyof typeof strings]);
      expect(i.a).toBe(strings[`faq.${i.id}.a` as keyof typeof strings]);
    }
  });

  it('byId names the same item objects the list holds', () => {
    for (const id of IDS) expect(byId[id]).toBe(items.find((i) => i.id === id));
  });

  it('every question is a question and every answer is a short plain paragraph', () => {
    for (const i of items) {
      expect(i.q.endsWith('?')).toBe(true);
      expect(i.a.length).toBeGreaterThan(40);
      expect(i.a.length).toBeLessThanOrEqual(600);
      expect(i.a).not.toMatch(/\n|<|\{\{/);
    }
  });

  it('the Board program wait is the lock code’s grace (applock.ts FRAME_GRACE_MS)', () => {
    expect(byId.lockProtects.a).toContain(`up to ${FRAME_GRACE_MS / 60_000} minutes longer`);
  });

  it('the agent days range is the one the field accepts (logic.ts parseDays)', () => {
    expect(byId.agentDays.a).toContain('from 1 to 365');
    expect([parseDays('1'), parseDays('365'), parseDays('0'), parseDays('366')]).toEqual([1, 365, null, null]);
  });

  it('the email answer keeps the link and undo windows the server sets (24 hours, 7 days)', () => {
    expect(byId.emailChange.a).toContain('It works for 24 hours at most');
    expect(byId.emailChange.a).toContain('no link is sent');
    expect(byId.emailChange.a).toContain('a link to undo it for 7 days');
  });

  it('the email answer says the mails are tried, not promised, and when the old link dies', () => {
    const a = byId.emailChange.a;
    expect(a.startsWith('The Hub tries to send a confirm link to the new address.')).toBe(true);
    expect(a).toContain('The Hub also tries to send your current address a notice');
    expect(a).not.toMatch(/\bsends a confirm link\b/);
    expect(a).not.toMatch(/Your current address gets a notice/);
    // the old link stops working when a newer request replaces it or an account change cancels it
    expect(a).toContain('a newer request replaces it, some account changes cancel it');
  });

  it('the two-step gate is worded the same in the row help and the answer: creating a key, changing its access settings, a code from the authenticator app', () => {
    expect(strings['2fa.gateHelp']).toBe('Creating an API key, or changing its access settings, then needs a code from your authenticator app.');
    expect(byId.twoStep.a).toContain('a separate switch also asks for a code when you create an API key or change its access settings');
  });

  it('answers say what the server does: a key delete asks no code, a new email request replaces the waiting one, a session end keeps its keys', () => {
    expect(byId.twoStep.a).toContain('when you create an API key or change its access settings');
    expect(byId.twoStep.a).toContain('even to narrow them');
    expect(byId.twoStep.a).not.toMatch(/delete/);
    expect(strings['2fa.gateHelp']).not.toMatch(/delet/);
    expect(byId.emailChange.a).toContain('a newer request replaces it');
    expect(byId.endSession.a).toContain("doesn't delete the API keys made there");
    expect(byId.removeLocal.a.startsWith("The Hub signs you out: it tries to end this browser's session and its agent sign-in on the server, and always clears the sign-in on this device.")).toBe(true);
  });

  it('the row keeps the lock’s one limit, and the answer says it whole', () => {
    expect(byId.lockProtects.a).toContain("It doesn't encrypt your sign-in");
    expect(strings['lock.limit']).toMatch(/^The lock doesn't encrypt your sign-in/);
  });

  it('Check again and Stop tracking never call an unknown outcome done or failed (C9)', () => {
    const a = byId.checkAgain.a;
    expect(a).toContain('instead of calling it done or failed');
    expect(a).toContain("It doesn't undo the change or mark it as failed");
    expect(a).not.toMatch(/\b(it|the change) (failed|went through|is done|succeeded)\b/i);
  });
});
