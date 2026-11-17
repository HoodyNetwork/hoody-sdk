// The agent's GitHub status → rows and health, the device start → code and link, and what a fresh status read proves.
import { describe, expect, it } from 'vitest';
import { activeProved, deviceOf, githubLink, loginProved, logoutProved, statusOf, type GhStatus } from './logic';

const at = { computer: 'c1', realm: 'global' };
const a = (login: string, active = false) => ({ key: `github.com/${login}`, host: 'github.com', login, active });

describe('status', () => {
  it('health is the active account’s: working, token gone, refused, or not checked (unknown is never broken)', () => {
    expect(statusOf({ linked: true, valid: true, accounts: [a('ada', true)] }, at).health).toBe('ok');
    expect(statusOf({ linked: true, valid: false, needs_reauth: true, accounts: [a('ada', true)] }, at).health).toBe('invalid');
    expect(statusOf({ linked: true, code: 'token_forbidden', accounts: [a('ada', true)] }, at).health).toBe('forbidden');
    expect(statusOf({ linked: true, reachable: false, accounts: [a('ada', true)] }, at).health).toBe('unchecked');
    expect(statusOf({ linked: false, accounts: [a('ada')] }, at).health).toBe('none');
  });

  it('an answer without an account list proves nothing (an unreadable store is not "no accounts")', () => {
    expect(statusOf({ linked: false, accounts: null }, at).known).toBe(false);
    expect(statusOf({ linked: false, accounts: [] }, at).known).toBe(true);
    expect(statusOf({ accounts: [{ key: 'x' }, a('ada', true)] }, at).accounts).toHaveLength(1);
  });

  it('push access is said only when the agent says it', () => {
    expect(statusOf({ linked: true, valid: true, has_repo_scope: false, accounts: [a('ada', true)] }, at).repoScope).toBe(false);
    expect(statusOf({ linked: true, accounts: [a('ada', true)] }, at).repoScope).toBeNull();
  });
});

describe('device start', () => {
  it('takes GitHub’s code and only GitHub’s own device page as a link', () => {
    const d = deviceOf({ device_code: 'dc', user_code: 'wdjb-mjht', verification_uri: 'https://github.com/login/device', interval: 5, expires_in: 900 })!;
    expect(d).toMatchObject({ userCode: 'WDJB-MJHT', link: 'https://github.com/login/device', interval: 5, expiresIn: 900 });
    expect(githubLink('https://evil.example/login/device')).toBeNull();
    expect(githubLink('http://github.com/login/device')).toBeNull();
    expect(githubLink('https://github.com/login/device?user_code=WDJB-MJHT')).toBeNull();
    expect(githubLink('https://github.com.evil.example/login/device')).toBeNull();
    expect(githubLink('https://user@github.com/login/device')).toBeNull();
  });

  it('a start without a usable code or handle is no start', () => {
    expect(deviceOf({ user_code: 'WDJB-MJHT' })).toBeNull();
    expect(deviceOf({ device_code: 'dc', user_code: '<b>x</b>' })).toBeNull();
    expect(deviceOf({ device_code: 'dc', user_code: 'WDJB-MJHT', expires_in: 99999 })!.expiresIn).toBe(900);
  });
});

describe('proofs (only "applied", only from the same computer and realm)', () => {
  const st = (accounts: unknown[], where = at): GhStatus => statusOf({ accounts }, where);
  it('a lost login is proved by a new account of that host, not by one that was there before', () => {
    const id = { computer: 'c1', realm: 'global', host: 'github.com', before: ['github.com/ada'] };
    expect(loginProved(id, [[st([a('ada', true), a('ada-lab')])]])).toBe('applied');
    expect(loginProved(id, [[st([a('ada', true)])]])).toBeUndefined();
    expect(loginProved(id, [[st([a('ada', true), a('ada-lab')], { computer: 'c2', realm: 'global' })]])).toBeUndefined();
    expect(loginProved(id, [[st([a('ada', true), a('ada-lab')], { computer: 'c1', realm: 'b'.repeat(24) })]])).toBeUndefined();
    expect(loginProved(id, [[statusOf({ accounts: null }, at)]])).toBeUndefined();
  });

  it('a lost switch is proved when that account is in use; a lost log-out when it is gone from a readable list', () => {
    const id = { computer: 'c1', realm: 'global', key: 'github.com/ada-work', login: 'ada-work' };
    expect(activeProved(id, [[st([a('ada'), a('ada-work', true)])]])).toBe('applied');
    expect(activeProved(id, [[st([a('ada', true), a('ada-work')])]])).toBeUndefined();
    expect(logoutProved(id, [[st([a('ada', true)])]])).toBe('applied');
    expect(logoutProved(id, [[st([a('ada', true), a('ada-work')])]])).toBeUndefined();
    expect(logoutProved(id, [[statusOf({ accounts: null }, at)]])).toBeUndefined();
    expect(logoutProved(id, [[st([a('ada', true)], { computer: 'c2', realm: 'global' })]])).toBeUndefined();
  });
});
