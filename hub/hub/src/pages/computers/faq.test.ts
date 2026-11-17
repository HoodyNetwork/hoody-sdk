// Vitest: the computers page's questions. The builder is the one list every view and every drawer link reads:
// eight questions in a fixed order, each answered from its own strings, short and plain.
import { describe, expect, it } from 'vitest';
import { pageFaq } from './faq';
import strings from './strings.en.json';

const IDS = ['whatYouGet', 'realmsAndProjects', 'whoCanOpen', 'firewall', 'proxyAndExit', 'ownDomain', 'sshAndTerminal', 'snapshotsAndBackups'] as const;
const t = (k: keyof typeof strings) => strings[k] as string;

describe('computers pageFaq', () => {
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

  it('the firewall answer keeps who can change the rules, and the order rules apply in', () => {
    expect(byId.firewall.a).toContain("programs and root inside can't change it directly");
    expect(byId.firewall.a).toContain("a key allowed to manage firewalls, including the agent's key, can");
    expect(byId.firewall.a).toContain('Block and Refuse rules apply before allow rules whatever their order');
  });

  it('the shell answer keeps the key rule and the temporary terminal lifetime', () => {
    expect(byId.sshAndTerminal.a).toContain('A key can be on one computer only.');
    expect(byId.sshAndTerminal.a).toContain('closes about a minute after you close its window');
    expect(byId.sshAndTerminal.a).toContain('Programs you started in the background keep running');
  });

  it('the domain answer keeps the DNS limits: no bare domain, proxy or CNAME flattening off, HTTPS on first visit', () => {
    expect(byId.ownDomain.a).toContain("Most DNS companies don't allow this kind of record on the bare domain");
    expect(byId.ownDomain.a).toContain('turn it off for this record');
    expect(byId.ownDomain.a).toContain('HTTPS is set up for you the first time someone opens the address');
  });

  it('the access answer names all four choices and that the project may add rules', () => {
    for (const c of ['Anyone with the address', 'Only my IP', 'Only people or keys I pick', 'Private']) expect(byId.whoCanOpen.a).toContain(c);
    expect(byId.whoCanOpen.a).toContain('The project has access rules too');
  });
});
