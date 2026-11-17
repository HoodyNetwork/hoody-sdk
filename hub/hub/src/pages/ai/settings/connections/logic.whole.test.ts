// A lost GitHub log-out is proved only by a status list read whole: a row the parse drops (no login, no key, not an
// object) may be that very account, so such a list proves nothing gone. Presence proofs (a new login, the account in
// use) still read the rows that parsed.
import { describe, expect, it } from 'vitest';
import { activeProved, logoutProved, statusOf } from './logic';

const at = { computer: 'c1', realm: 'global' };
const a = (login: string, active = false) => ({ key: `github.com/${login}`, host: 'github.com', login, active });
const id = { computer: 'c1', realm: 'global', key: 'github.com/ada-work', login: 'ada-work' };

describe('a log-out is proved only by a list read whole', () => {
  it.each([
    ['a row with no login (the account itself, half read)', { key: 'github.com/ada-work', host: 'github.com', active: false }],
    ['a row with no key', { login: 'ada-work', host: 'github.com' }],
    ['a row that is not an object', null],
    ['a row that is a string', 'github.com/ada-work'],
  ])('%s: not proved', (_name, odd) => {
    const s = statusOf({ accounts: [a('ada', true), odd] }, at);
    expect(s.known).toBe(true);
    expect(s.whole).toBe(false);
    expect(logoutProved(id, [[s]])).toBeUndefined();
  });

  it('a whole list without the account proves it (control); presence proofs still read a partial list', () => {
    const s = statusOf({ accounts: [a('ada', true)] }, at);
    expect(s.whole).toBe(true);
    expect(logoutProved(id, [[s]])).toBe('applied');
    expect(statusOf({ accounts: [] }, at).whole).toBe(true);
    expect(statusOf({ accounts: null }, at).whole).toBe(false);
    const partial = statusOf({ accounts: [a('ada'), a('ada-work', true), null] }, at);
    expect(activeProved(id, [[partial]])).toBe('applied');
  });
});
