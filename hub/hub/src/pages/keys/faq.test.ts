// Vitest: the keys page's questions. The builder is the one list every tab, the key drawers and the made-share
// panel read: eight questions in a fixed order, each answered from its own strings, the answers tied to the rules they state.
import { describe, expect, it } from 'vitest';
import { pageFaq } from './faq';
import { fullHelpKey } from './logic';
import { checkSshKey } from './ssh-logic';
import strings from './strings.en.json';

const IDS = ['secretOnce', 'whatIsKey', 'realms', 'rights', 'endsAndAddresses', 'sshKey', 'shareRealm', 'shareMessage'] as const;
const t = (k: keyof typeof strings) => strings[k] as string;

describe('keys pageFaq', () => {
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

  it('the rights answer covers both texts Full can show (logic.ts fullHelpKey): billing in when granted or unknown, out otherwise', () => {
    expect(fullHelpKey(null)).toBe('nk.fullBilling');
    expect(fullHelpKey({ rights: [], full: {}, billing: true, templates: [] } as never)).toBe('nk.fullBilling');
    expect(fullHelpKey({ rights: [], full: {}, billing: false, templates: [] } as never)).toBe('nk.fullH');
    // Full is the full_access template with its defaults (logic.ts: vault off); the two lines are help text, not every
    // grant; an unread list is unknown, never "billing included".
    expect(byId.rights.a).toMatch(/Full uses the server's full access set with its defaults, so vault access stays off/);
    expect(byId.rights.a).toMatch(/The help text under Full is a summary, not a list of every right: one version leaves out billing and sign-in settings, the other says billing and payments are included/);
    expect(byId.rights.a).toMatch(/When the list of rights can't be read, what Full covers is unknown, and the help text shows the billing version\./);
    expect(byId.rights.a).not.toMatch(/billing and payments are included when|Full does everything|full set of rights/);
  });

  it('the secret and share wording claims only what this page does (shown once here; prompt and QR code when available)', () => {
    expect(byId.secretOnce.a).toMatch(/the secret is gone and can't be shown again from this panel/);
    expect(byId.secretOnce.a).not.toMatch(/nobody at Hoody|can't be shown again\./);
    expect(t('share.withTokenH')).toBe('Off: the prompt and QR code, when available, leave the token out; the QR code opens this Hub. On: they can hold the token, so keep them as safe as the message.');
    expect(t('share.promptHelp')).toBe('For an agent. With the token off, it holds a placeholder.');
    expect(byId.shareMessage.a).toMatch(/the QR code, when available, opens this Hub/);
    expect(byId.shareMessage.a).toMatch(/the agent prompt, when available, has a placeholder where the token goes/);
    expect(byId.shareMessage.a).toMatch(/On, the QR code can hold the token too, so keep it as safe as the message\./);
    expect(byId.shareMessage.a).not.toMatch(/the QR code opens this Hub|the agent prompt has a placeholder|the QR code holds the token/);
  });

  it('the answers keep what the shortened drawer lines gave up', () => {
    // nk.onlyMore, nk.pickNote (KeyFields), nk.fromH (RightsPicker) and the long forms of share.promptHelp / share.withTokenH (ShareShown).
    expect(byId.realms.a).toMatch(/to make one for several realms or all of them, switch to All realms first/);
    expect(byId.realms.a).toMatch(/the key works only on those realms' addresses/);
    expect(byId.rights.a).toMatch(/Start from ticks the rights of a ready-made set, and you can change them before you make the key/);
    expect(byId.shareMessage.a).toMatch(/pasting into an agent, such as Claude Code or Codex, so it can work in this realm/);
    expect(byId.shareMessage.a).toMatch(/With Include the token off, the QR code, when available, opens this Hub and they paste your message there/);
  });

  it('the SSH answer names the key starts the field accepts, and a private key is refused (ssh-logic checkSshKey)', () => {
    expect(byId.sshKey.a).toContain('ssh-ed25519, ssh-rsa or ecdsa-sha2-');
    expect(checkSshKey('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIG9 me')).toMatchObject({ ok: true });
    expect(checkSshKey(['-----BEGIN', 'OPENSSH PRIVATE KEY-----'].join(' '))).toMatchObject({ ok: false, code: 'private' });
  });
});
