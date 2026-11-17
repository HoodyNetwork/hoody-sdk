// Vitest: the billing page's questions. The builder is the one list the page's Questions section and the single-answer
// links (wallet lines, AI usage, subscriptions, Add funds, upgrade) read: eight questions in a fixed order, each answered from its own
// strings. The answers carry the one-line rules the decision text shares, so a change to a rule is made in both places or fails here.
import { describe, expect, it } from 'vitest';
import { pageFaq } from './faq';
import strings from './strings.en.json';

const IDS = ['addFunds', 'stopTracking', 'autoRenew', 'retrySafe', 'upgrade', 'freeServer', 'aiAllowance', 'walletCredit'] as const;
const t = (k: keyof typeof strings) => strings[k] as string;

describe('billing pageFaq', () => {
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

  it('the answers keep the risk the decision text states: trying again may apply a change twice, an upgrade cannot be undone', () => {
    expect(byId.stopTracking.a).toMatch(/could apply it a second time/);
    expect(byId.stopTracking.a).toMatch(/for a payment it sends nothing/);
    expect(byId.upgrade.a).toMatch(/can't be undone/);
    expect(byId.autoRenew.a).toMatch(/permanently deleted/);
  });

  it('retrySafe does not promise the same-request guarantee for a rental: renewing a rental anyway can charge twice (mkt.rentAgainBody)', () => {
    expect(byId.retrySafe.a).toMatch(/A rental is different/);
    expect(byId.retrySafe.a).toMatch(/Check again on an unconfirmed rental only reads it back/);
    expect(byId.retrySafe.a).toMatch(/two servers and two charges/);
    expect(byId.retrySafe.a).not.toMatch(/restart/);
  });

  it('retrySafe scopes the same-request guarantee to Send the same request again, and names Start a new purchase on a reservation as a second charge', () => {
    expect(byId.retrySafe.a).toMatch(/Send the same request again repeats that request, so it is never charged twice/);
    expect(byId.retrySafe.a).toMatch(/Start a new purchase on an unconfirmed reservation can charge twice too/);
    expect(byId.retrySafe.a).toMatch(/confirm both first/);
  });

  it('the retention days are shown only when known, and the answer says so', () => {
    expect(byId.autoRenew.a).toContain('when it is known');
  });

  it('the day count of the hold is not written into the answer (it is data)', () => {
    expect(byId.autoRenew.a).not.toMatch(/\d+ days/);
  });
});
