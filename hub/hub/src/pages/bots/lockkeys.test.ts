// Vitest: every Bots change that carries typed text or a credential has a lockKey of ids and field names only, so the
// stored hold identity (and anything core derives from it) never contains a name, instruction, rule, token or note.
import { describe, expect, it } from 'vitest';
import { LOCK_KEYS } from './data';

const SECRETS = ['tok-123456789', 'app-tok-987654321', 'Be kind to everyone', 'only-from-the-office', 'rule one text', 'a private note'];
const leak = (id: unknown) => SECRETS.filter((s) => JSON.stringify(id).includes(s));

describe('Bots lockKeys name no typed text', () => {
  it('channelChange keeps the token and the app token out', () => {
    const id = LOCK_KEYS.channelChange!({ botKey: 'b', action: 'credentials', channelId: 'c', token: SECRETS[0], appToken: SECRETS[1] });
    expect(leak(id)).toEqual([]);
    expect(id).toEqual({ botKey: 'b', action: 'credentials', channelId: 'c', target: '' });
  });

  it('saveSettings keeps instructions and rules out, and tells a section from another by its field names', () => {
    const settings = LOCK_KEYS.saveSettings!({ botKey: 'b', patch: { instructions: SECRETS[2], role: 'x' } });
    const guard = LOCK_KEYS.saveSettings!({ botKey: 'b', patch: { allowed_agents: [] }, rules: [SECRETS[4]] });
    expect(leak(settings)).toEqual([]);
    expect(leak(guard)).toEqual([]);
    expect(settings).not.toEqual(guard);
    expect(LOCK_KEYS.saveSettings!({ botKey: 'b', patch: { role: 'other', instructions: 'other' } })).toEqual(settings);
  });

  it('keyChange keeps the allowlist and notes out and keeps pause, resume, revoke and edit apart', () => {
    const edit = LOCK_KEYS.keyChange!({ linkId: 'l', keyId: 'k', action: 'edit', fields: { name: 'n', allowlist: [SECRETS[3]], expiresAt: null, notes: SECRETS[5] } });
    expect(leak(edit)).toEqual([]);
    expect(LOCK_KEYS.keyChange!({ linkId: 'l', keyId: 'k', action: 'revoke' })).not.toEqual(edit);
  });

  it('rotateKey names the link and key only', () => {
    expect(LOCK_KEYS.rotateKey!({ linkId: 'l', keyId: 'k', extra: SECRETS[0] })).toEqual({ linkId: 'l', keyId: 'k' });
  });
});
