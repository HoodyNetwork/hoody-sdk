// Vitest: the vault page's questions. The builder is the one list the list pane, the entry panel and the New/Replace
// drawer read: seven questions in a fixed order, each answered from its own strings. One answer depends on the host: Export
// saves a file to the device, so where there is no browser page (the terminal) its answer says where Export is.
import { afterAll, describe, expect, it } from 'vitest';
import { installHostEnv, resetHostEnvForTests, webHostEnv, type HostEnv } from '@core/host-env';
import { pageFaq } from './faq';
import { KEY_MAX } from './logic';
import strings from './strings.en.json';

const IDS = ['vaultFor', 'scope', 'showValue', 'encrypt', 'valueInput', 'metadata', 'export'] as const;
const t = (k: keyof typeof strings) => strings[k] as string;
/** This file runs without a window, where the web env says "no browser page": each suite names its host. */
const onHost = (browserPage: boolean): void => {
  resetHostEnvForTests({ unresolved: true });
  installHostEnv(Object.create(webHostEnv, { browserPage: { value: browserPage } }) as HostEnv);
};
afterAll(() => resetHostEnvForTests());

describe('vault pageFaq', () => {
  onHost(true);
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

  it('the name rule in the answer is the one the field checks (logic.ts KEY_MAX)', () => {
    expect(byId.valueInput.a).toContain(`up to ${KEY_MAX} characters`);
    expect(byId.metadata.a).toContain('"encrypted" and "write_id"');
  });

  it('the export answer says what the export does to existing encrypted values and to entries it cannot read (exportVault.ts)', () => {
    expect(byId.export.a).toMatch(/already encrypted keeps its own password/);
    expect(byId.export.a).toMatch(/could not be read or was removed is left out/);
  });

  it('the value is read on the eye or Copy in the entry panel, and the list does not show values', () => {
    expect(byId.vaultFor.a).toContain('The list does not show values.');
    expect(byId.vaultFor.a).toContain('In an entry, the value is read only when you press the eye or Copy');
    expect(byId.showValue.a).toContain('The value is read only then. Hiding it or closing the entry removes it from this page');
    expect(byId.showValue.a).toContain('Copy always copies the exact text, not the formatted view; for an encrypted entry that is the decrypted value.');
    expect(byId.showValue.a).not.toMatch(/Forget value|press Show value/);
  });

  it('the answers keep what the shortened field lines gave up: line breaks kept, tools need the password, the metadata fields', () => {
    expect(byId.valueInput.a).toMatch(/Line breaks are kept/);
    expect(byId.encrypt.a).toMatch(/tools need the password/);
    expect(byId.metadata.a).toMatch(/Change metadata/);
  });
});

describe('vault pageFaq where there is no browser page (the terminal)', () => {
  onHost(false);
  const { items, byId } = pageFaq(t as never);

  it('keeps all seven questions, Export included: no question is filtered by host', () => {
    expect(items.map((i) => i.id)).toEqual([...IDS]);
    expect(byId.export).toBe(items[6]);
    expect(byId.export.q).toBe(strings['faq.export.q']);
  });

  it('answers Export with where it is, not with what the web export does', () => {
    expect(byId.export.a).toBe(strings['faq.export.a.terminal']);
    expect(byId.export.a).toMatch(/only in the web Hub/);
    expect(byId.export.a).not.toMatch(/already encrypted keeps its own password/);
    for (const i of items.slice(0, 6)) expect(i.a).toBe(strings[`faq.${i.id}.a` as keyof typeof strings]);
  });
});
