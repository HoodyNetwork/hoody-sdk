// Vitest: the tunnels page's questions. The builder is the one list the list pane, the Setup drawer, the reconnecting
// note and a web address's "Not loading?" link read: eight questions in a fixed order, each answered from its own strings. The risky-ports answer names the same ports the
// warning checks, so the two cannot disagree.
import { describe, expect, it } from 'vitest';
import { pageFaq } from './faq';
import { RISKY_PORTS } from './setup';
import strings from './strings.en.json';

const IDS = ['what', 'twoWays', 'ports', 'riskyPorts', 'password', 'fails', 'notLoading', 'reconnecting'] as const;
const t = (k: keyof typeof strings) => strings[k] as string;

describe('tunnels pageFaq', () => {
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

  it('the risky-ports answer lists exactly the ports the warning checks: the shared ones, then the web-address ones', () => {
    const [shared, extra] = byId.riskyPorts.a.split('When you put an app online');
    const numbers = (text: string) => [...text.matchAll(/\b\d{2,5}\b/g)].map((m) => Number(m[0]));
    expect(numbers(shared!)).toEqual([...RISKY_PORTS.both]);
    expect(RISKY_PORTS.expose.filter((p) => !(RISKY_PORTS.both as readonly number[]).includes(p))).toEqual(numbers(extra!));
  });

  it('the fails answer keeps the four refusals the drawer can meet', () => {
    for (const lead of ['Port in use', 'Port held by another session', 'Port refused', 'Too many ports in one session']) expect(byId.fails.a).toContain(lead);
  });
});
