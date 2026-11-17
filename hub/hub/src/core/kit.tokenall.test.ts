// A token session's agent calls (kit.ts agentRealm). A key pinned to ONE realm acts there whatever the caller names.
// A key that opens the whole account ("Everything": pinned to 'all') is the All realms view of an account session: a
// call that names its realm (open a Bot, say something to it, a chat) goes to that realm, and a call that names none
// lists every realm. In a live run, with the pin always winning, every one-realm call was planned with realm=all and
// refused before it was sent.
import { afterEach, describe, expect, it } from 'vitest';
import { initCore, resetCore, type Ctx } from './ctx';
import { agentRealm } from './kit';
import type { Route } from './routes';

const REALM = 'a'.repeat(24);
const OTHER = 'b'.repeat(24);
// The context of a page showing All realms (the only view a token session has).
const CTX = { realm: 'all' } as unknown as Ctx;
const route = (realm: string) => ({ id: 'test.agent', scope: 'agent', realm }) as unknown as Route;
const token = (pin: string) => initCore({ page: Object.freeze({ kind: 'token', uid: 'u'.repeat(24), sid: 's1' }) as never, tokenRealm: pin });

afterEach(() => resetCore());

describe('agentRealm in a token session', () => {
  it('a key that opens everything: the realm the call names is the realm it acts in', () => {
    token('all');
    expect(agentRealm(route('bot'), REALM, CTX)).toBe(REALM);
    expect(agentRealm(route('realm'), REALM, CTX)).toBe(REALM);
    // A Global Bot's own calls name 'global', as they do from an account session in All realms.
    expect(agentRealm(route('bot'), 'global', CTX)).toBe('global');
  });
  it('a key that opens everything: a call that names no realm lists every realm', () => {
    token('all');
    expect(agentRealm(route('list'), undefined, CTX)).toBe('all');
  });
  it('a key pinned to one realm acts there whatever the call names', () => {
    token(REALM);
    expect(agentRealm(route('bot'), OTHER, CTX)).toBe(REALM);
    expect(agentRealm(route('list'), undefined, CTX)).toBe(REALM);
  });
  it('a route that carries no realm carries none', () => {
    token('all');
    expect(agentRealm(route('none'), REALM, CTX)).toBeUndefined();
  });
});
