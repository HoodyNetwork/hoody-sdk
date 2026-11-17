// @vitest-environment node
// The security history names every event in the page's own words. The API serves the two sign-in events plus its list
// of security events; a name the page does not know is shown as the raw event word, so this fails as soon as the API's
// list gains one. The API file is read from the monorepo this Hub sits in (HUB_API_AUDITLOG names another file);
// outside it that one check is skipped and the pinned list below still holds.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { monorepoPath } from '@core/test/monorepo';
import { KNOWN_EVENTS, historyEventKey } from './logic';
import strings from './strings.en.json';

const words = strings as Record<string, string>;
// The API's list, plus login and login_failed (ActionType.LOGIN, LOGIN_FAILED).
const PINNED = [
  'login', 'login_failed', 'logout', 'otp_setup_initiated', 'otp_enabled', 'otp_disabled', 'otp_verify_success', 'otp_verify_failed',
  'otp_backup_code_used', 'otp_backup_codes_regenerated', 'token_gate_enabled', 'token_gate_disabled', 'session_refreshed', 'session_revoked',
  'password_reset', 'password_changed', 'auth_token_created', 'auth_token_revoked', 'oauth_linked', 'email_change_requested',
  'email_change_cancelled', 'email_changed', 'email_change_reverted', 'two_factor_undone',
];
const AUDIT_AT = monorepoPath(process.env.HUB_API_AUDITLOG, 'hoody-api', 'src', 'db', 'models', 'AuditLog.ts');

describe('security history events', () => {
  it('every pinned event has its own words', () => {
    for (const e of PINNED) {
      const key = historyEventKey(e);
      expect([e, key]).toEqual([e, `h.e.${e}`]);
      expect([e, typeof words[key!]]).toEqual([e, 'string']);
    }
    expect([...KNOWN_EVENTS].sort()).toEqual([...PINNED].sort());
  });

  it('the words name no mechanism: no OAuth, token, OTP or raw event name', () => {
    for (const e of KNOWN_EVENTS) {
      const text = words[`h.e.${e}`]!;
      expect([e, /oauth|token|otp|_/i.test(text)]).toEqual([e, false]);
      expect([e, text.length > 0 && text.length <= 60]).toEqual([e, true]);
    }
  });

  it('an event the page does not know has no key (the row shows its cleaned name)', () => {
    expect(historyEventKey('something_new')).toBeNull();
    expect(historyEventKey('')).toBeNull();
    expect(historyEventKey('toString')).toBeNull();
  });

  it.skipIf(AUDIT_AT === null)("the API's list holds no event the page lacks", () => {
    const src = readFileSync(AUDIT_AT!, 'utf8');
    const body = /export const SECURITY_HISTORY_ACTIONS = \[([\s\S]*?)\] as const;/.exec(src)?.[1];
    expect(body).toBeDefined();
    const served = [...body!.replace(/\/\/.*$/gm, '').matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]!);
    expect(served.length).toBeGreaterThanOrEqual(22);
    expect(served.filter((e) => historyEventKey(e) === null)).toEqual([]);
  });
});
