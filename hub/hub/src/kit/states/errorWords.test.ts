import { describe, expect, it } from 'vitest';
import { errorInfo, type ErrorInfo } from '@core';
import { ERROR_WORD_KEYS, errorWords } from './errorWords';
import strings from './strings.en.json';

const at = new Date('2026-10-24T14:00:00Z');
const info = (e: Record<string, unknown>): ErrorInfo => errorInfo(e, { page: 'keys', now: at });
const key = (e: Record<string, unknown>, o?: Parameters<typeof errorWords>[1]) => errorWords(info(e), o).key;

describe('a realm mismatch (the API sends no code of its own yet)', () => {
  it('reads as the general 403: core keeps no API message, so the words never read it', () => {
    const realm = 'Project is not in requested realm 0123456789abcdef01234567';
    expect(info({ status: 403, code: 'INSUFFICIENT_PERMISSIONS', message: realm }).message).toBeNull();
    expect(key({ status: 403, code: 'INSUFFICIENT_PERMISSIONS', message: realm })).toBe('err.forbidden');
    expect(key({ status: 403, message: realm })).toBe('err.forbidden');
    expect(ERROR_WORD_KEYS).not.toContain('err.realm' as never);
  });
});

describe('errorWords', () => {
  it('maps the API codes', () => {
    expect(key({ status: 401, code: 'INVALID_TOKEN' })).toBe('err.signedOut');
    expect(key({ status: 404, code: 'NOT_FOUND' })).toBe('err.notFound');
    expect(key({ status: 409, code: 'CONFLICT' })).toBe('err.conflict');
    expect(key({ status: 400, code: 'VALIDATION_ERROR' })).toBe('err.invalid');
    expect(key({ status: 403, code: 'ACCOUNT_BANNED' })).toBe('err.banned');
    expect(key({ status: 500, code: 'INTERNAL_SERVER_ERROR' })).toBe('err.server');
  });
  // host_reinstalled: a start/stop of a computer whose server ended or was reinstalled (409 COMPUTER_EXPIRED)
  // says it can only be deleted, not "it changed in the meantime"; a pending outcome still wins.
  it('an expired computer says it can no longer be used and can be deleted', () => {
    expect(info({ status: 409, code: 'COMPUTER_EXPIRED' }).code).toBe('COMPUTER_EXPIRED');
    expect(key({ status: 409, code: 'COMPUTER_EXPIRED' })).toBe('err.computerExpired');
    expect(strings['err.computerExpired']).toMatch(/reinstalled/);
    expect(strings['err.computerExpired']).toMatch(/delete it/);
    expect(key({ pending: true, status: 409, code: 'COMPUTER_EXPIRED' })).toBe('err.pending');
  });
  it('says how long to wait when the API said so', () => {
    expect(errorWords(info({ status: 429, code: 'RATE_LIMITED', retryAfter: 12 }))).toEqual({ key: 'err.rateLimitedIn', vars: { seconds: 12 } });
    expect(errorWords(info({ status: 429, code: 'TOO_MANY_REQUESTS', retryAfterMs: 1500 }))).toEqual({ key: 'err.rateLimitedIn', vars: { seconds: 2 } });
    expect(key({ status: 429 })).toBe('err.rateLimited');
  });
  it('reads a gateway answer as "still starting" only on a program URL', () => {
    expect(key({ status: 502, code: 'BAD_GATEWAY' }, { program: true })).toBe('err.starting');
    expect(key({ status: 502, code: 'BAD_GATEWAY' })).toBe('err.server');
    expect(key({ status: 502 }, { program: true })).toBe('err.starting');
  });
  it('falls back to the status class, then no answer, then the generic line', () => {
    expect(key({ status: 404, code: 'SOMETHING_NEW' })).toBe('err.notFound');
    expect(key({ status: 418 })).toBe('err.invalid');
    expect(key({ status: 503 })).toBe('err.server');
    expect(key({ status: 504 })).toBe('err.slow');
    expect(key({ code: 'X' })).toBe('err.noAnswer');
    expect(key({ status: 302 })).toBe('err.generic');
  });
  it('C9: a pending outcome gets the pending words whatever its code or status', () => {
    for (const e of [
      { pending: true, status: 500, code: 'INTERNAL_SERVER_ERROR' },
      { kind: 'pending', status: 403, code: 'INSUFFICIENT_PERMISSIONS' },
      { kind: 'pending' },
      { pending: true, status: 429, code: 'RATE_LIMITED' },
    ]) expect(key(e)).toBe('err.pending');
  });
  it('stale, cancelled and not_sent carry their own words; not_sent names only the Hub\'s own refusals', () => {
    expect(key({ kind: 'stale', stale: true, status: 500 })).toBe('err.stale');
    expect(key({ cancelled: true })).toBe('err.cancelled');
    expect(key({ kind: 'not_sent', notSent: true, code: 'TOKEN_SESSION_REFUSED' })).toBe('err.tokenSession');
    expect(key({ kind: 'not_sent', notSent: true, code: 'FRAMED_ACTION_REFUSED' })).toBe('err.framed');
    expect(key({ kind: 'not_sent', notSent: true, code: 'NOT_FOUND' })).toBe('err.notSent');
  });
  it('the terminal demo\'s refusal of a change says it is the demo, never that something failed', () => {
    // demo-client.ts refuses every change unsent with this code; core keeps it (CORE_CODES).
    const refused = { status: 0, notSent: true, code: 'DEMO_READ_ONLY' };
    expect(info(refused)).toMatchObject({ outcome: 'not_sent', code: 'DEMO_READ_ONLY' });
    expect(key(refused)).toBe('err.demoReadOnly');
    expect(ERROR_WORD_KEYS).toContain('err.demoReadOnly');
    const table = strings as Record<string, string>;
    expect(table['err.demoReadOnly']).toBe('This is the demo: nothing is changed.');
    expect(table['err.demoReadOnly']).not.toMatch(/fail|error|couldn't|could not|refused/i);
    // Answered, the same code is not the Hub's own refusal: it gets no demo words.
    expect(key({ status: 403, code: 'DEMO_READ_ONLY' })).toBe('err.forbidden');
  });
  it('a page override replaces one code, never an outcome\'s words', () => {
    const words = { NOT_FOUND: 'err.conflict' } as const;
    expect(key({ status: 404, code: 'NOT_FOUND' }, { words })).toBe('err.conflict');
    expect(key({ status: 403, code: 'INSUFFICIENT_PERMISSIONS' }, { words })).toBe('err.forbidden');
    expect(key({ pending: true, status: 404, code: 'NOT_FOUND' }, { words })).toBe('err.pending');
  });
  it('every key the map can answer has a sentence, and no pending word says it failed', () => {
    const table = strings as Record<string, string>;
    for (const k of ERROR_WORD_KEYS) expect(table[k], k).toBeTruthy();
    expect(table['err.pending']).not.toMatch(/fail|error|didn't|did not|wasn't|couldn't/i);
    expect(table['err.o.pending']).not.toMatch(/fail|error/i);
  });
});

describe('kit terminal refusals', () => {
  it('keeps the terminal kit codes: both are published fixed codes', () => {
    expect(info({ status: 403, code: 'CWD_PERMISSION_DENIED' }).code).toBe('CWD_PERMISSION_DENIED');
    expect(info({ status: 409, code: 'SHELL_UNSUPPORTED' }).code).toBe('SHELL_UNSUPPORTED');
  });
  it('a folder that cannot be entered says to pick another folder, not the realm permission line', () => {
    expect(key({ status: 403, code: 'CWD_PERMISSION_DENIED' })).toBe('err.folderRefused');
    expect(strings['err.folderRefused']).toMatch(/another folder/);
  });
  it('a shell that cannot run commands says which shells work, not "it changed in the meantime"', () => {
    expect(key({ status: 409, code: 'SHELL_UNSUPPORTED' })).toBe('err.shellUnsupported');
    expect(strings['err.shellUnsupported']).toMatch(/bash or zsh/);
  });
  it('C9 still wins over both codes', () => {
    expect(key({ pending: true, status: 409, code: 'SHELL_UNSUPPORTED' })).toBe('err.pending');
    expect(key({ kind: 'not_sent', notSent: true, code: 'CWD_PERMISSION_DENIED' })).toBe('err.notSent');
  });
  // Every code x outcome pair: the outcome's words, whatever the code, even when the page gives
  // that code words of its own. The code really reaches the words (info keeps it), so the outcome is what decides.
  // Each outcome as core is told it: a decided outcome, except cancelled, which is the rejection's own flag (core/errors.ts).
  const C9 = [
    ['pending', { outcome: 'pending' }, 'err.pending'],
    ['stale', { outcome: 'stale' }, 'err.stale'],
    ['not_sent', { outcome: 'not_sent' }, 'err.notSent'],
    ['cancelled', { cancelled: true }, 'err.cancelled'],
  ] as const;
  const TERMINAL = { CWD_PERMISSION_DENIED: 403, SHELL_UNSUPPORTED: 409 } as const;
  for (const [code, status] of Object.entries(TERMINAL)) {
    for (const [outcome, told, word] of C9) {
      it(`${outcome} beats ${code}`, () => {
        const e = { status, code, ...told };
        expect(info(e).outcome).toBe(outcome);
        expect(info(e).code).toBe(code);
        expect(key(e)).toBe(word);
        expect(key(e, { words: { [code]: 'err.conflict' } })).toBe(word);
        expect(key(e, { program: true })).toBe(word);
      });
    }
  }
  // On a program URL a gateway answer reads "still starting" (the code, or a bare 502 by its status): C9 beats that too.
  for (const [name, gw] of [['BAD_GATEWAY', { status: 502, code: 'BAD_GATEWAY' }], ['a bare 502', { status: 502 }]] as const) {
    for (const [outcome, told, word] of C9) {
      it(`${outcome} beats ${name} on a program URL`, () => {
        const e = { ...gw, ...told };
        expect(info(e).outcome).toBe(outcome);
        expect(info(e).status).toBe(502);
        expect(key({ ...gw }, { program: true })).toBe('err.starting');
        expect(key(e, { program: true })).toBe(word);
      });
    }
  }
});
