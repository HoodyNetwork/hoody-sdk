// Vitest: the account page's pure logic.
import { makeT } from '@kit/strings';
import { describe, expect, it } from 'vitest';
import type { Session } from './data';
import {
  OpLocks,
  endTargetOf,
  cleanLabel,
  errorKey,
  isAppCode,
  setupGate,
  isQrImage,
  openableSheet,
  twoStepRead,
  isLongPassword,
  isWeakPassword,
  otherActiveCount,
  parseDays,
  passwordChecks,
  passwordErrors,
  sessionRows,
} from './logic';
import strings from './strings.en.json';

const T = makeT(strings);

const session = (over: Partial<Session>): Session => ({
  id: 'a'.repeat(24),
  current: false,
  active: true,
  method: 'password',
  client: '',
  clientName: '',
  userAgent: '',
  createdAt: null,
  lastSeenAt: null,
  lastIp: null,
  lastCountry: null,
  endedAt: null,
  endReason: null,
  endedHere: false,
  keysMade: 0,
  ...over,
});

describe('password rules', () => {
  it('needs 12 characters and 3 of 4 classes', () => {
    expect(isWeakPassword('Short1!')).toBe(true);
    expect(isWeakPassword('alllowercaseletters')).toBe(true);
    expect(isWeakPassword('lowerUPPER1234')).toBe(false);
    expect(isWeakPassword('lower-symbols-ok1')).toBe(false);
  });
  it('reports each field problem', () => {
    expect(passwordErrors('', 'weak', 'x')).toEqual({ current: 'required', password: 'weak', again: 'mismatch' });
    expect(passwordErrors('Current-Pass-1', 'Current-Pass-1', 'Current-Pass-1')).toEqual({ password: 'same' });
    expect(passwordErrors('Current-Pass-1', 'Another-Pass-22', 'Another-Pass-22')).toBeNull();
  });
  it('a new password over the server\'s 72 UTF-8 bytes is named at the field before anything is sent', () => {
    const ok = `Aa1-${'x'.repeat(68)}`; // 72 bytes
    const long = `${ok}x`; // 73 bytes
    const accents = `Aa1-${'é'.repeat(35)}`; // 39 characters, 74 bytes
    expect(isLongPassword(ok)).toBe(false);
    expect(isLongPassword(long)).toBe(true);
    expect(isLongPassword(accents)).toBe(true);
    expect(passwordErrors('Current-Pass-1', ok, ok)).toBeNull();
    expect(passwordErrors('Current-Pass-1', long, long)).toEqual({ password: 'long' });
    expect(passwordErrors('Current-Pass-1', accents, accents)).toEqual({ password: 'long' });
    // The sentence exists and states the limit.
    expect(strings['pw.eLong']).toMatch(/72/);
  });
  it('drives the live checklist', () => {
    expect(passwordChecks('old', 'Another-Pass-22', 'Another-Pass-22')).toEqual({ length: true, classes: true, differs: true, matches: true });
    expect(passwordChecks('old', '', '')).toEqual({ length: false, classes: false, differs: false, matches: false });
  });
});

describe('codes and days', () => {
  it('an app code is exactly six digits', () => {
    expect(isAppCode(' 123456 ')).toBe(true);
    expect(isAppCode('12345')).toBe(false);
    expect(isAppCode('12345a')).toBe(false);
  });
  it('days are a whole number 1 to 365', () => {
    expect(parseDays('90')).toBe(90);
    expect(parseDays(' 365 ')).toBe(365);
    for (const bad of ['0', '366', '1.5', '30days', '1e2', '', null, undefined, '-1']) expect(parseDays(bad)).toBeNull();
    expect(parseDays(Number.NaN)).toBeNull();
  });
});

describe('the set-up gate', () => {
  it('names the first thing still missing: the saved tick, then the six digits', () => {
    expect(setupGate(false, '')).toBe('saved');
    expect(setupGate(false, '123456')).toBe('saved');
    expect(setupGate(true, '')).toBe('code');
    expect(setupGate(true, '12345')).toBe('code');
    expect(setupGate(true, '123456')).toBe(null);
  });
});

describe('sessions', () => {
  it('only an active session that is not this browser can be ended', () => {
    const rows = sessionRows([session({ current: true }), session({ id: 'b'.repeat(24) }), session({ id: 'c'.repeat(24), active: false })], T);
    expect(rows.map((r) => r.canEnd)).toEqual([false, true, false]);
  });
  it('counts other active sessions', () => {
    expect(otherActiveCount([session({ current: true }), session({}), session({ active: false })])).toBe(1);
  });
  it('names the device with deviceLabel and carries its tag', () => {
    const [r] = sessionRows([session({ clientName: 'Mac', client: 'cli', userAgent: 'hoody-cli/3' })], T);
    expect(r?.device).toBe('Mac');
    expect(r?.tag).toBe('Hoody CLI');
  });
  it('strips control and bidi characters from untrusted labels and cuts them', () => {
    expect(cleanLabel('a\u0000b‮c', 80)).toBe('a b c');
    expect(cleanLabel('x'.repeat(100), 10)).toBe(`${'x'.repeat(9)}…`);
  });
});

describe('ids and errors', () => {
  it('maps a refusal to a fixed sentence', () => {
    expect(errorKey({ code: 'INVALID_OTP_CODE' }, 'password')).toBe('err.code');
    expect(errorKey({ code: 'CURRENT_PASSWORD_INCORRECT' }, 'code')).toBe('err.password');
    expect(errorKey({ status: 401 }, 'password')).toBe('err.password');
    expect(errorKey({ status: 401 }, 'code')).toBe('err.code');
    expect(errorKey({ status: 401 }, 'none')).toBe('err.generic');
    expect(errorKey({ code: 'RATE_LIMITED' }, 'password')).toBe('err.tooMany');
    expect(errorKey({ status: 409 }, 'password')).toBe('err.changed');
    expect(errorKey(undefined, 'password')).toBe('err.generic');
  });
});

describe('the lock on a change with an unknown outcome', () => {
  it('stays locked as pending until cleared; a sure answer lifts it', () => {
    const locks = new OpLocks();
    locks.sent('setup');
    expect(locks.get('setup')).toBe('sent');
    locks.settle('setup', true);
    expect(locks.get('setup')).toBe('pending');
    expect(locks.snapshot().get('setup')).toBe('pending');
    locks.clear();
    expect(locks.get('setup')).toBeUndefined();
    locks.sent('off');
    locks.settle('off', false);
    expect(locks.get('off')).toBeUndefined();
  });
});

describe('isQrImage', () => {
  it('takes only a base64 png or svg data image', () => {
    expect(isQrImage('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isQrImage('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe(true);
  });
  it('refuses anything else as an img src', () => {
    expect(isQrImage('https://evil.example/x.png')).toBe(false);
    expect(isQrImage('javascript:alert(1)')).toBe(false);
    expect(isQrImage('data:text/html;base64,PGI+')).toBe(false);
    expect(isQrImage('')).toBe(false);
  });
});

describe('OpLocks.anyPending', () => {
  it('counts only the named ops: a pending password does not lock the 2FA section', () => {
    const l = new OpLocks();
    l.sent('password');
    l.settle('password', true);
    expect(l.anyPending(['setup', 'codes', 'off', 'gate'])).toBe(false);
    l.sent('off');
    l.settle('off', true);
    expect(l.anyPending(['setup', 'codes', 'off', 'gate'])).toBe(true);
  });
});

describe('openableSheet', () => {
  const fixture = { suspended: false, twoStep: 'off' as const };
  it('opens the known sheets', () => {
    expect(openableSheet('password', fixture)).toBe('password');
    expect(openableSheet('setup', fixture)).toBe('setup');
    expect(openableSheet('nope', fixture)).toBeUndefined();
    expect(openableSheet(undefined, fixture)).toBeUndefined();
  });
  it('opens no sheet for a suspended account', () => {
    expect(openableSheet('password', { suspended: true, twoStep: 'off' })).toBeUndefined();
  });
  // The server refuses a new set-up while two-step is on: the link and the command opened a password step that could
  // only fail ("This didn't go through"). Unknown (not read yet, failed, incomplete) opens nothing either.
  it('opens Set up only while two-step sign-in reads off', () => {
    expect(openableSheet('setup', { suspended: false, twoStep: 'on' })).toBeUndefined();
    expect(openableSheet('setup', { suspended: false, twoStep: 'unknown' })).toBeUndefined();
  });
  it('keeps an open Set up open when the status changes under it', () => {
    expect(openableSheet('setup', { suspended: false, twoStep: 'on', setupOpen: true })).toBe('setup');
    expect(openableSheet('setup', { suspended: false, twoStep: 'unknown', setupOpen: true })).toBe('setup');
    expect(openableSheet('setup', { suspended: true, twoStep: 'off', setupOpen: true })).toBeUndefined();
  });
  it('never withholds the way to turn two-step off, or any other sheet, for the status', () => {
    for (const twoStep of ['on', 'off', 'unknown'] as const) {
      for (const name of ['off', 'codes', 'gate-off', 'password'] as const) expect(openableSheet(name, { suspended: false, twoStep })).toBe(name);
    }
  });
});

describe('twoStepRead', () => {
  const on = { enabled: true, setupUnfinished: false, codesLeft: 8, gate: true };
  const off = { enabled: false, setupUnfinished: false, codesLeft: null, gate: false };
  it('off, unfinished and on as read; not read, failed or incomplete is unknown', () => {
    expect(twoStepRead({ isError: false, data: off })).toBe('off');
    expect(twoStepRead({ isError: false, data: { ...off, setupUnfinished: true, codesLeft: 10 } })).toBe('off');
    expect(twoStepRead({ isError: false, data: on })).toBe('on');
    expect(twoStepRead({ isError: false, data: undefined })).toBe('unknown');
    expect(twoStepRead({ isError: false, data: null })).toBe('unknown');
    // A failed refetch over an earlier answer proves nothing now.
    expect(twoStepRead({ isError: true, data: off })).toBe('unknown');
  });
});

describe('OpLocks epochs', () => {
  it('a settle from before a clear does not touch the new epoch', () => {
    const l = new OpLocks();
    const ep = l.sent('codes');
    l.clear();
    l.sent('codes');
    l.settle('codes', false, ep);
    expect(l.get('codes')).toBe('sent');
  });
});

describe('endTargetOf', () => {
  const row = (id: string, o: Partial<Session> = {}): Session => ({ id, current: false, active: true, ...o }) as Session;
  it('finds a row the person pressed End on even when it is not on the first page', () => {
    expect(endTargetOf('z', row('z'), [row('a')])).toMatchObject({ id: 'z' });
  });
  it('finds a row of the first page for a link opened cold', () => {
    expect(endTargetOf('a', null, [row('a')])).toMatchObject({ id: 'a' });
  });
  it('never offers this browser, an ended session or an unlisted id', () => {
    expect(endTargetOf('a', null, [row('a', { current: true })])).toBeUndefined();
    expect(endTargetOf('a', null, [row('a', { active: false })])).toBeUndefined();
    expect(endTargetOf('q', row('z'), [row('a')])).toBeUndefined();
  });
  it('keeps "others" and nothing', () => {
    expect(endTargetOf('others', null, undefined)).toBe('others');
    expect(endTargetOf(undefined, null, [])).toBeUndefined();
  });
});

describe('OpLocks versions', () => {
  it('a release for an older send does not free a newer one', () => {
    const l = new OpLocks();
    l.sent('gate');
    const v = l.version('gate');
    l.settle('gate', true);
    l.sent('gate');
    l.settle('gate', true);
    expect(l.release('gate', v)).toBe(false);
    expect(l.get('gate')).toBe('pending');
    expect(l.release('gate', l.version('gate'))).toBe(true);
    expect(l.get('gate')).toBeUndefined();
  });
});
