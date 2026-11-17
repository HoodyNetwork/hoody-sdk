// The API's 2FA lockout (429 TWOFACTOR_RATE_LIMIT) on a key mint or rotation is named to the person.
// A secret route passes only its declared codes: both mints declare this one and nothing else.
import { describe, expect, it } from 'vitest';
import { ROUTES } from './data';
import { MINT_LOCKED, lockNote } from './logic';
import strings from './strings.en.json';

describe('Bots: the 2FA lockout on a key mint', () => {
  it('is a declared code of key create (beside its name refusal) and the one declared code of key rotate', () => {
    expect(MINT_LOCKED).toBe('TWOFACTOR_RATE_LIMIT');
    expect(ROUTES.keyCreate.codes).toEqual([MINT_LOCKED, 'BOT_KEY_NAME_TAKEN']);
    expect(ROUTES.keyRotate.codes).toEqual([MINT_LOCKED]);
    expect(ROUTES.keyCreate.secret).toBe(true);
    expect(ROUTES.keyRotate.secret).toBe(true);
  });
  it('has words', () => {
    expect(typeof (strings as Record<string, string>)['keyForm.locked']).toBe('string');
  });
  it('puts the words on a failed lockout only', () => {
    expect(lockNote({ kind: 'failed', code: MINT_LOCKED }, 'locked')).toEqual({ kind: 'failed', code: MINT_LOCKED, message: 'locked' });
    const other = { kind: 'failed', code: 'BOT_KEY_LIMIT' };
    expect(lockNote(other, 'locked')).toBe(other);
    const pending = { kind: 'pending', code: MINT_LOCKED };
    expect(lockNote(pending, 'locked')).toBe(pending);
    expect(lockNote(undefined, 'locked')).toBeUndefined();
  });
});
