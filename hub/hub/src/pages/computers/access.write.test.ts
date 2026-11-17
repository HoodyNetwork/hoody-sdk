// The access write's safety rules: it writes only over a document the drawer reads whole (never one with
// groups, grants, hooks or the proxy set elsewhere, or under project rules), it carries no credential, and only a
// fresh read proves it (If-Match: it applies at most once, over the version it was made against).
import { describe, expect, it } from 'vitest';
import { bodyFor, MY_IP_GROUP, modeOf, rulesFrom, writeVerdict, type AccessRules } from './parts/access.logic';

const CID = '64b7f0c2a1e3d4f5a6b7c8d9';
const PID = '74b7f0c2a1e3d4f5a6b7c8d0';
const read = (data: Record<string, unknown>, v = 3) => rulesFrom({ data: { project: PID, computer: CID, file_version: v, ...data } })!;
const open = read({ groups: {}, permissions: {}, default: 'allow' });
const shut = read({ groups: {}, permissions: {}, default: 'deny' });
const mine = read({ groups: { [MY_IP_GROUP]: { type: 'ip', range: '198.51.100.4/32' } }, permissions: { [MY_IP_GROUP]: { '*': true, logs: true } }, default: 'deny' });
const body = (r: AccessRules, want: Parameters<typeof bodyFor>[2], project: 'yes' | 'no' | 'unknown' = 'no') => bodyFor(r, modeOf(r, project), want, CID);

describe('computers: the access write', () => {
  it('writes the exact documents the drawer reads back as its choices', () => {
    for (const [want, kind] of [[{ kind: 'anyone' }, 'anyone'], [{ kind: 'private' }, 'private'], [{ kind: 'myIp', ip: '203.0.113.9' }, 'myIp']] as const) {
      const b = body(open, want)!;
      expect(b).toMatchObject({ project: PID, computer: CID });
      const back = rulesFrom({ data: { ...b, file_version: 4 } })!;
      expect(modeOf(back, 'no').kind).toBe(kind);
    }
    expect(body(open, { kind: 'myIp', ip: '203.0.113.9' })).toEqual({
      project: PID, computer: CID, groups: { [MY_IP_GROUP]: { type: 'ip', range: '203.0.113.9/32' } }, permissions: { [MY_IP_GROUP]: { '*': true, logs: true } }, default: 'deny',
    });
    expect(body(mine, { kind: 'anyone' })).toEqual({ project: PID, computer: CID, groups: {}, permissions: {}, default: 'allow' });
    expect(body(open, { kind: 'private' })?.default).toBe('deny');
  });

  it('never writes over rules set elsewhere, under project rules, or with the proxy off or hooks', () => {
    const others = [
      read({ groups: { team: { type: 'password', password: 'x' } }, permissions: { team: { files: true } }, default: 'deny' }),
      read({ groups: {}, permissions: { g: { files: true } }, default: 'deny' }),
      read({ groups: {}, permissions: {}, default: 'allow', hooks: { files: [{}] } }),
      read({ groups: {}, permissions: {}, default: 'allow', enable_proxy: false }),
      read({ groups: {}, permissions: {} }),
      read({ groups: { [MY_IP_GROUP]: { type: 'ip', range: '198.51.100.7/24' } }, permissions: { [MY_IP_GROUP]: { '*': true, logs: true } }, default: 'deny' }),
    ];
    for (const r of others) expect(body(r, { kind: 'anyone' })).toBeNull();
    expect(body(open, { kind: 'private' }, 'yes')).toBeNull();
    expect(body(open, { kind: 'private' }, 'unknown')).toBeNull();
    // default inherit: open when the project has no rules, so the drawer may write it; never under project rules.
    const inherit = read({ groups: {}, permissions: {}, default: 'inherit' }, 0);
    expect(body(inherit, { kind: 'private' })?.default).toBe('deny');
    expect(body(inherit, { kind: 'private' }, 'yes')).toBeNull();
  });

  it('refuses a missing project, a bad container id and anything but one IPv4 address', () => {
    expect(bodyFor(rulesFrom({ data: { file_version: 1, groups: {}, permissions: {}, default: 'allow' } })!, { kind: 'anyone' }, { kind: 'private' }, CID)).toBeNull();
    expect(bodyFor(open, modeOf(open, 'no'), { kind: 'private' }, 'nope')).toBeNull();
    for (const ip of ['2001:db8::7', '203.0.113.0/24', '256.1.1.1', '', '1.2.3.4 ']) expect(body(open, { kind: 'myIp', ip })).toBeNull();
  });

  it('keeps an explicit proxy switch on, and leaves an unset one unset', () => {
    expect(body(read({ groups: {}, permissions: {}, default: 'allow', enable_proxy: true }), { kind: 'private' })).toHaveProperty('enable_proxy', true);
    expect(body(open, { kind: 'private' })).not.toHaveProperty('enable_proxy');
  });

  it('only a fresh read proves it: same version = still unknown (a lost PUT may land later), newer and asked = applied, newer and other = changed elsewhere', () => {
    const id = { computer: CID, want: 'private', from: 3 };
    const ans = (r: AccessRules | null) => [[{ [CID]: r }]];
    expect(writeVerdict(id, ans(open))).toBeUndefined();
    expect(writeVerdict(id, ans(read({ groups: {}, permissions: {}, default: 'deny' }, 4)))).toBe('applied');
    expect(writeVerdict(id, ans(read({ groups: {}, permissions: {}, default: 'allow' }, 4)))).toBe('not_applied');
    expect(writeVerdict({ computer: CID, want: 'myIp', ip: '198.51.100.4', from: 3 }, ans(read({ groups: { [MY_IP_GROUP]: { type: 'ip', range: '198.51.100.4/32' } }, permissions: { [MY_IP_GROUP]: { '*': true, logs: true } }, default: 'deny' }, 4)))).toBe('applied');
    expect(writeVerdict({ computer: CID, want: 'myIp', ip: '198.51.100.5', from: 3 }, ans(read({ groups: { [MY_IP_GROUP]: { type: 'ip', range: '198.51.100.4/32' } }, permissions: { [MY_IP_GROUP]: { '*': true, logs: true } }, default: 'deny' }, 4)))).toBe('not_applied');
    // Nothing proves it: no answer, a null answer, another computer's, an older version.
    expect(writeVerdict(id, [[]])).toBeUndefined();
    expect(writeVerdict(id, ans(null))).toBeUndefined();
    expect(writeVerdict(id, [[{ other: shut }]])).toBeUndefined();
    expect(writeVerdict(id, ans(read({ groups: {}, permissions: {}, default: 'deny' }, 2)))).toBeUndefined();
    expect(writeVerdict(null, ans(shut))).toBeUndefined();
  });
});
