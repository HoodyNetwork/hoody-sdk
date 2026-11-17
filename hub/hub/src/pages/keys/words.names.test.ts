// Names on the keys page: every right the full template can hold has words, a failed delete of a key made without a
// secret says the delete failed, and the share flow calls its tab and its result by one name each.
import { describe, expect, it } from 'vitest';
import strings from './strings.en.json';
import { deleteMadeText, outcomeText, rightName, stopScope, type T } from './parts/words';

const t: T = (key, vars) =>
  String((strings as Record<string, string>)[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, v: string) => String(vars?.[v] ?? `{{${v}}}`));

describe('keys page names', () => {
  it('names the support right instead of showing its path', () => {
    expect(rightName(t, 'resources.support')).toBe('Support tickets');
  });

  it('says a delete failed, not that the key was not made, after "Delete it and make another"', () => {
    expect(deleteMadeText(t, { outcome: 'failed' }, 'ci-deploy')).toBe(t('ns.deleteFailed', { what: 'ci-deploy' }));
    expect(deleteMadeText(t, { outcome: 'failed' }, 'ci-deploy')).not.toMatch(/not made/);
    // Codes with words of their own and the other outcomes keep the shared words.
    expect(deleteMadeText(t, { outcome: 'failed', code: 'TOKEN_NOT_FOUND' }, 'ci-deploy')).toBe(t('out.err.TOKEN_NOT_FOUND'));
    expect(deleteMadeText(t, { outcome: 'pending' }, 'ci-deploy')).toBe(outcomeText(t, { outcome: 'pending' }, 'ci-deploy', false));
  });

  it('calls the tab Shared access and the result a share wherever the share flow points at it', () => {
    const shareTexts = Object.entries(strings as Record<string, string>).filter(([k]) => k.startsWith('share.') || k === 'dismiss.bodyShare');
    for (const [k, v] of shareTexts) {
      expect(v.replace(/Shared access/g, ''), k).not.toMatch(/\bShared\b(?! now| with)/);
      expect(v, k).not.toMatch(/\btoken (may have been|was|from that try)\b|\bno token was made\b|Couldn't make the token/);
    }
  });

  it('a failed delete after "Delete it and make another" claims nothing about the key', () => {
    expect(t('ns.deleteFailed')).toBe('The delete request failed. Check API keys before trying again.');
  });

  const ID = 'a1b2c3d4e5f60718293a4b5c';
  const OTHER = 'ffffeeeeddddccccbbbbaaaa';
  // The confirm's title, as SharedTab draws it from stopScope.
  const title = (sc: { wide: boolean; alias: string | null }): string =>
    sc.wide ? t('share.stopTitleWide') : sc.alias ? t('share.stopTitle', { realm: sc.alias }) : t('share.stopTitleNoName');
  it('names a one-realm share in the Stop confirm only by a real realm alias', () => {
    const one = { realm: ID, raw: { realm_ids: [ID] } };
    expect(title(stopScope([{ id: ID, name: 'Acme client', named: true }], one))).toBe('Stop sharing Acme client?');
    // An unnamed realm's short id, a blank alias or an unknown realm never reaches the title.
    expect(title(stopScope([{ id: ID, name: 'a1b2…4b5c', named: false }], one))).toBe('Stop this share?');
    expect(title(stopScope([{ id: ID, name: '  ', named: true }], one))).toBe('Stop this share?');
    expect(title(stopScope(undefined, one))).toBe('Stop this share?');
    expect(t('share.stopConfirm')).not.toMatch(/at once/);
    expect(t('share.stopConfirm')).toMatch(/no new requests\. Open requests and connections may take time to end\./);
    // A confirm's body is one explanation region: both bodies stay within the 150-character budget.
    for (const k of ['share.stopConfirm', 'share.stopConfirmWide'] as const) expect(t(k).length, k).toBeLessThanOrEqual(150);
  });

  it('a share reaching several realms, or every realm, says the stop applies everywhere', () => {
    const realms = [{ id: ID, name: 'Acme client', named: true }, { id: OTHER, name: 'Beta', named: true }];
    for (const raw of [{ realm_ids: [ID, OTHER] }, { realm_ids: [] }, {}]) {
      const sc = stopScope(realms, { realm: ID, raw });
      expect(sc).toEqual({ wide: true, alias: null });
      expect(title(sc)).toBe('Stop this share in all its realms?');
    }
    expect(t('share.stopConfirmWide')).toMatch(/^This stops the share everywhere it works\. /);
  });
});
