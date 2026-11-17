// Vitest: the Referrals page's questions. The builder is the one list the page's "Questions"
// section, the not-eligible line, the Join confirm and the Withdraw explainer read: ten questions in a fixed order (they
// include who may withdraw and how Creator is counted), each answered from its own strings, each short enough to stay a
// quick answer. The share is never a number here: the level card and the Join confirm show the API's rate_percent.
import { describe, expect, it } from 'vitest';
import { pageFaq } from './faq';
import strings from './strings.en.json';

const IDS = ['rate', 'notCounted', 'window', 'bareMetal', 'hold', 'spend', 'withdraw', 'creator', 'privacy', 'eligible'] as const;
const t = (k: keyof typeof strings) => strings[k] as string;

describe('referrals pageFaq', () => {
  const { items, byId } = pageFaq(t as never);

  it('lists the ten questions in order, each id once, each read from its own strings', () => {
    expect(items.map((i) => i.id)).toEqual([...IDS]);
    for (const i of items) {
      expect(i.id).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      expect(i.q).toBe(strings[`faq.${i.id}.q` as keyof typeof strings]);
      expect(i.a).toBe(strings[`faq.${i.id}.a` as keyof typeof strings]);
    }
  });

  it('byId names the same item objects the list holds', () => {
    for (const id of IDS) expect(byId[id]).toBe(items.find((i) => i.id === id));
  });

  it('every question is a short question and every answer a short plain paragraph with no number for the share', () => {
    for (const i of items) {
      expect(i.q.endsWith('?')).toBe(true);
      expect(i.q.length).toBeLessThanOrEqual(80);
      expect(i.a.length).toBeGreaterThan(30);
      expect(i.a.length).toBeLessThanOrEqual(600);
      expect(i.a).not.toMatch(/\n|<|\{\{|%/);
    }
  });

  it('the answers keep every limit the old "How you earn" list named, and the not-eligible rule word for word', () => {
    expect(byId.rate.a).toBe('You earn a share of what each person you invite pays for servers by card or crypto, without tax and after refunds: paid subservers (renewals too), and bare-metal rentals and reservations once delivered.');
    expect(byId.window.a).toMatch(/12 months/);
    expect(byId.window.a).toMatch(/90 days of their signup/);
    expect(byId.bareMetal.a).toMatch(/three calendar months from their first bare-metal service start/);
    expect(byId.bareMetal.a).toMatch(/Prepaid purchases earn only on the service/);
    expect(byId.hold.a).toMatch(/60 days from activation/);
    expect(byId.withdraw.a).toBe('Only accounts at the Creator level can ask to take Referral credit out as money: a Creator asks Hoody support about withdrawing their credit.');
    expect(byId.withdraw.a).not.toMatch(/turns? withdrawals? on|switch/i);
    // The level is fixed when the month's first qualifying purchase is processed (ensureTier), not at its start
    expect(byId.creator.a).toContain("set from this count when that month's first qualifying purchase is processed; until then it's a preview and can still change.");
    expect(byId.creator.a).not.toMatch(/at the start of that month/);
    expect(byId.eligible.a).toBe(
      "Any delivered server purchase counts, including a plan, bare-metal rental or fulfilled reservation, if some of what you paid by card or crypto remains unrefunded. Credits and promotions don't count toward that paid amount.",
    );
  });
});
