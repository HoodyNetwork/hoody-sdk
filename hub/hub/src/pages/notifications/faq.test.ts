// Vitest: the notifications page's questions. The builder is the one list the Get notified page, the Inbox's empty state and the
// browser card read: seven questions in a fixed order, each answered from its own strings, each short enough to stay a quick answer.
import { describe, expect, it } from 'vitest';
import { pageFaq } from './faq';
import strings from './strings.en.json';

const IDS = ['kinds', 'bellInbox', 'timing', 'browser', 'email', 'iphone', 'android'] as const;
const t = (k: keyof typeof strings) => strings[k] as string;

describe('notifications pageFaq', () => {
  const { items, byId } = pageFaq(t as never);

  it('lists the seven questions in order, each id once, each read from its own strings', () => {
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

  it('no answer promises a poll period or a delivery time: the server sets the period and failures slow it (core/notifications.ts), so the words say "from time to time"', () => {
    expect(byId.timing.a).toMatch(/from time to time/);
    expect(byId.bellInbox.a).toMatch(/from time to time/);
    expect(items.map((i) => i.a).join(' ')).not.toMatch(/few minutes|five minutes|5 minutes|right away/i);
  });

  it('the browser answer says an alert shows only when you are not looking, never the notice message (shell/notify/engine.ts)', () => {
    expect(byId.browser.a).toMatch(/not looking/);
    expect(byId.browser.a).toMatch(/never the notice's message/);
  });
});
