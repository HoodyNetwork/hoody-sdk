// Vitest on the assistant's caps for a signed-out agent: the row offers the sign-in ('offer'), or says it
// again ('renew') when the agent's login was rejected (a Hub sign-out revokes its key). The projection is core's agentLoginOf.
import { describe, expect, it } from 'vitest';
import { agentCapsOf, writerState } from './writer';

const R = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const v = { api_version: '1', session_protocol_version: 3, capabilities: [{ name: 'computer_binding', supported: true, available: true }, { name: 'script_writer', supported: true, available: true }, { name: 'script_templates', supported: true, available: true }] };
const READY = { account_id: 'u1', auth_active: true, owner_fingerprint: 'fp1', restriction: 'none' };
const caps = (status: unknown, account: unknown = 'u1') => agentCapsOf({ version: v, status, loading: false, account, realm: R, guardedDelete: true });

describe('a signed-out agent', () => {
  it('signed out: the press may sign it in', () => {
    expect(caps({ auth_active: false })).toEqual({ templates: true, writer: false, writerWhy: 'login', signIn: 'offer', guardedDelete: true });
  });
  it('its login rejected: signed out again', () => {
    expect(caps({ ...READY, last_error: { credential_rejected: true } })).toEqual({ templates: true, writer: false, writerWhy: 'login', signIn: 'renew', guardedDelete: true });
  });
  it('another account, or no identity yet: no sign-in offered', () => {
    expect(caps({ ...READY, account_id: 'u2' })).toEqual({ templates: true, writer: false, writerWhy: 'account', guardedDelete: true });
    expect(caps({ ...READY, owner_fingerprint: '' })).toEqual({ templates: true, writer: false, writerWhy: 'identity', guardedDelete: true });
    expect(caps(READY, '')).toEqual({ templates: true, writer: false, writerWhy: 'identity', guardedDelete: true });
  });
  it('ready reads the same as before', () => {
    expect(writerState(v, READY, 'u1')).toEqual({ state: 'ready', owner: 'fp1' });
    expect(caps(READY)).toEqual({ templates: true, writer: true, writerOwner: 'fp1', guardedDelete: true });
  });
});
