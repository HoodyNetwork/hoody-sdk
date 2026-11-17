// Vitest: the pure rules behind four account gaps. The password classes are the server's (its symbol list, not "anything
// that is not a letter or digit"); a plain 400 on a password change reads as the password rule only when nothing else
// can be behind it; an unverified address has its own refusal sentence; the profile's has_password and
// support_reply_email are read as booleans or not at all; a mail ask with no answer is unsure, never failed.
import { describe, expect, it } from 'vitest';
import { mailAskFrom, profileOf, supportMailAfterSave, supportMailProves, type Profile } from './data';
import { emailErrorKey, isWeakPassword, mailRefusalWords, maskEmail, nameRefusal, passwordChecks, passwordClasses, passwordErrors, weakPasswordRefusal } from './logic';

// The server's symbol class, written out: every character in it counts, and no other does.
const SERVER_SYMBOLS = '!@#$%^&*()_+-=[]{};\':"\\|,.<>/?';

describe('password classes as the server counts them', () => {
  it('every symbol of the server list is a class of its own', () => {
    for (const c of SERVER_SYMBOLS) expect([c, passwordClasses(`a${c}`)]).toEqual([c, 2]);
  });

  it('no other printable ASCII character, space included, counts as a symbol', () => {
    for (let code = 0x20; code < 0x7f; code++) {
      const c = String.fromCharCode(code);
      if (/[a-zA-Z0-9]/.test(c) || SERVER_SYMBOLS.includes(c)) continue;
      expect([c, passwordClasses(`a${c}`)]).toEqual([c, 1]);
    }
  });

  it('an accented letter or an emoji is none of the four', () => {
    expect(passwordClasses('aé')).toBe(1);
    expect(passwordClasses('a😀')).toBe(1);
    expect(passwordClasses('aA1!')).toBe(4);
  });

  it('a password the server refuses is weak here too: spaces, tildes, backticks and accents are not its symbols', () => {
    for (const pw of ['lower UPPER words', 'lowerUPPER~~~~~~', 'lowerUPPER``````', 'lowerUPPERééééééé', 'lower 12345 words']) expect([pw, isWeakPassword(pw)]).toEqual([pw, true]);
    for (const pw of ['lowerUPPER1234', 'lower-symbols-ok1', 'lowerUPPER!!!!!!']) expect([pw, isWeakPassword(pw)]).toEqual([pw, false]);
    expect(passwordErrors('current-pw', 'lower UPPER words', 'lower UPPER words')).toEqual({ password: 'weak' });
  });

  it('the checklist ticks "3 of 4" only for the server classes', () => {
    expect(passwordChecks('old', 'lower UPPER words', '').classes).toBe(false);
    expect(passwordChecks('old', 'lowerUPPER~~~~~~', '').classes).toBe(false);
    expect(passwordChecks('old', 'lower-UPPER', '').classes).toBe(true);
  });
});

describe('a plain 400 on a password change', () => {
  const plain = { outcome: 'failed', status: 400 };
  const sent = { current: 'current-pw', next: 'lowerUPPER1234', hasPassword: true as boolean | undefined };
  it('is the password rule when the account has a password and both fields were within the request bounds', () => {
    expect(weakPasswordRefusal(plain, sent)).toBe(true);
    expect(weakPasswordRefusal({ ...plain, code: 'Bad Request' }, sent)).toBe(true);
  });
  it('is not, when the profile did not say the account has a password (an API whose no-password refusal has no code)', () => {
    expect(weakPasswordRefusal(plain, { ...sent, hasPassword: undefined })).toBe(false);
    expect(weakPasswordRefusal(plain, { ...sent, hasPassword: false })).toBe(false);
  });
  it('is not, when a field was outside the bounds the request check takes', () => {
    expect(weakPasswordRefusal(plain, { ...sent, current: 'short' })).toBe(false);
    expect(weakPasswordRefusal(plain, { ...sent, current: 'x'.repeat(129) })).toBe(false);
    expect(weakPasswordRefusal(plain, { ...sent, next: '😀😀😀😀😀😀' })).toBe(false);
  });
  it('is not, for any refusal with a code or another status', () => {
    expect(weakPasswordRefusal({ ...plain, code: 'PASSWORD_NOT_SET' }, sent)).toBe(false);
    expect(weakPasswordRefusal({ outcome: 'failed', status: 409 }, sent)).toBe(false);
    expect(weakPasswordRefusal({ outcome: 'pending', status: 400 }, sent)).toBe(false);
  });
});

describe('an email change refused as not allowed', () => {
  const e = { code: 'EMAIL_CHANGE_NOT_ALLOWED', status: 403 };
  it('says to verify first only while the profile reads not verified', () => {
    expect(emailErrorKey(e, false)).toBe('e.verifyFirst');
    expect(emailErrorKey(e, true)).toBe('e.notAllowed');
    expect(emailErrorKey(e)).toBe('e.notAllowed');
    expect(emailErrorKey(e, undefined)).toBe('e.notAllowed');
  });
});

describe('the profile fields', () => {
  it('has_password and support_reply_email are read only as booleans', () => {
    expect(profileOf({ has_password: false, support_reply_email: false })).toMatchObject({ hasPassword: false, supportMail: false });
    expect(profileOf({ has_password: true, support_reply_email: true })).toMatchObject({ hasPassword: true, supportMail: true });
  });
  it.each([undefined, null, 0, 1, 'false', 'true', {}])('%j is not known, never "no password" or "off"', (v) => {
    const p = profileOf({ has_password: v, support_reply_email: v });
    expect('hasPassword' in p).toBe(false);
    expect('supportMail' in p).toBe(false);
  });
  it('a support-mail change is proved only by a profile showing the asked value', () => {
    expect(supportMailProves({ on: false }, [[{ supportMail: false }]])).toBe('applied');
    expect(supportMailProves({ on: true }, [[{ supportMail: true }]])).toBe('applied');
    expect(supportMailProves({ on: false }, [[{ supportMail: true }]])).toBeUndefined();
    expect(supportMailProves({ on: false }, [[{}]])).toBeUndefined();
    expect(supportMailProves({ on: false }, [[undefined]])).toBeUndefined();
    expect(supportMailProves({ on: false }, [])).toBeUndefined();
    expect(supportMailProves({}, [[{ supportMail: false }]])).toBeUndefined();
    expect(supportMailProves(undefined, [[{ supportMail: undefined }]])).toBeUndefined();
  });
  it('a saved change whose read-back failed is not known, never refused; another value read back is', () => {
    const read = (supportMail: boolean | undefined, isError = false) => ({ isError, data: isError ? undefined : ({ supportMail } as Profile) });
    expect(supportMailAfterSave(read(false), false, false)).toBe('proved');
    expect(supportMailAfterSave(read(true), false, false)).toBe('other');
    expect(supportMailAfterSave(read(undefined), true, false)).toBe('other');
    expect(supportMailAfterSave(read(undefined, true), false, false)).toBe('unknown');
    expect(supportMailAfterSave({ isError: true, data: { supportMail: false } as Profile }, false, false)).toBe('unknown');
    // The fixture transport's profile never moves: a saved answer stands there.
    expect(supportMailAfterSave(read(true), false, true)).toBe('proved');
  });
});

describe('asking for a mail', () => {
  it('core’s answers become the page’s states; no answer is unsure, never failed', () => {
    expect(mailAskFrom({ kind: 'sent' }, 'ada@example.com')).toEqual({ state: 'sent', to: 'ada@example.com' });
    expect(mailAskFrom({ kind: 'refused', why: 'retry', retryAfter: 1800 }, 'a@b.co')).toEqual({ state: 'wait', retryAfter: 1800 });
    expect(mailAskFrom({ kind: 'refused', why: 'retry' }, 'a@b.co')).toEqual({ state: 'wait' });
    expect(mailAskFrom({ kind: 'refused', why: 'network' }, 'a@b.co')).toEqual({ state: 'unsure' });
    // Refused unsent by a read-only Hub: its own state and sentence, never "may be on its way".
    expect(mailAskFrom({ kind: 'refused', why: 'read-only' }, 'a@b.co')).toEqual({ state: 'readonly' });
    expect(mailRefusalWords({ state: 'readonly' })).toEqual({ key: 'err.readOnly' });
    expect(mailAskFrom({ kind: 'refused', why: 'framed' }, 'a@b.co')).toEqual({ state: 'framed' });
    // A fault answered on the way can come back after the mail went out.
    expect(mailAskFrom({ kind: 'refused', why: 'unavailable' }, 'a@b.co')).toEqual({ state: 'unsure' });
    for (const why of ['address', 'no-api'] as const) expect(mailAskFrom({ kind: 'refused', why }, 'a@b.co')).toEqual({ state: 'failed' });
  });
  it('a refusal says its wait in minutes when one was named', () => {
    expect(mailRefusalWords({ state: 'wait', retryAfter: 1800 })).toEqual({ key: 'err.tooManyWait', vars: { count: 30 } });
    expect(mailRefusalWords({ state: 'wait', retryAfter: 86_400 })).toEqual({ key: 'err.tooMany' });
    expect(mailRefusalWords({ state: 'wait' })).toEqual({ key: 'err.tooMany' });
    expect(mailRefusalWords({ state: 'failed' })).toEqual({ key: 'err.generic' });
    expect(mailRefusalWords({ state: 'framed' })).toEqual({ key: 'err.framed' });
    for (const state of ['sending', 'sent', 'unsure']) expect(mailRefusalWords({ state })).toBeNull();
    expect(mailRefusalWords(undefined)).toBeNull();
  });
  it('the sentence names the address by its first character and its domain', () => {
    expect(maskEmail('ada@example.com')).toBe('a•••@example.com');
    expect(maskEmail(' a@b.co ')).toBe('a•••@b.co');
    expect(maskEmail('not-an-address')).toBe('');
    expect(maskEmail('@example.com')).toBe('');
  });
});

describe('a refused display name', () => {
  it('a plain 400 is about the name: the change sends nothing else', () => {
    expect(nameRefusal({ outcome: 'failed', status: 400 })).toBe(true);
    expect(nameRefusal({ outcome: 'failed', status: 400, code: 'Bad Request' })).toBe(true);
    expect(nameRefusal({ outcome: 'failed', status: 400, code: 'RESERVED_IDENTITY' })).toBe(true);
    expect(nameRefusal({ outcome: 'failed', status: 400, code: 'ALIAS_RESERVED' })).toBe(true);
    expect(nameRefusal({ outcome: 'failed', status: 400, code: 'ALIAS_INVALID_CHARS' })).toBe(true);
  });
  it('any other refusal, and anything not definite, is not', () => {
    expect(nameRefusal({ outcome: 'failed', status: 400, code: 'VALIDATION_ERROR' })).toBe(false);
    expect(nameRefusal({ outcome: 'failed', status: 429, code: 'RATE_LIMITED' })).toBe(false);
    expect(nameRefusal({ outcome: 'failed', status: 500 })).toBe(false);
    expect(nameRefusal({ outcome: 'failed', status: 401 })).toBe(false);
    expect(nameRefusal({ outcome: 'pending', status: 400 })).toBe(false);
    expect(nameRefusal({ outcome: 'not_sent', code: 'ALIAS_RESERVED' })).toBe(false);
  });
});
