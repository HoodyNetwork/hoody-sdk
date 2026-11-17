// The access rules reader: it keeps no credential, and only the two exact documents the drawer writes count as
// its choices; anything else (or any rule on the project) is shown read-only.
import { describe, expect, it } from 'vitest';
import { MY_IP_GROUP, modeOf, projectRulesOf, rulesFrom } from './parts/access.logic';

const doc = (data: Record<string, unknown>) => ({ data: { project: 'p', computer: 'c', file_version: 3, ...data } });
const open = doc({ groups: {}, permissions: {}, default: 'allow' });
const mine = doc({ groups: { [MY_IP_GROUP]: { type: 'ip', range: '198.51.100.4/32' } }, permissions: { [MY_IP_GROUP]: { '*': true, logs: true } }, default: 'deny' });

describe('computers: access rules', () => {
  it('reads the version, the groups without their credentials, the grants, the default, the proxy switch and hooks', () => {
    const r = rulesFrom(doc({
      groups: { team: { type: 'password', password: 'p4ss' }, ci: { type: 'token', token: 'tok' }, both: [{ type: 'ip', range: '1.2.3.0/24' }] },
      permissions: { team: { terminal: [1], files: true, exec: false } },
      default: 'deny',
      enable_proxy: false,
      hooks: { terminal: [{ url: 'https://x' }, { url: 'https://y' }] },
    }));
    expect(r).toEqual({
      version: 3,
      project: null,
      groups: [{ name: 'team', kind: 'password' }, { name: 'ci', kind: 'token' }, { name: 'both', kind: 'mixed' }],
      grants: [{ group: 'team', programs: [{ program: 'terminal', rule: 'some', spec: '1' }, { program: 'files', rule: 'all' }, { program: 'exec', rule: 'none' }] }],
      allowByDefault: false,
      proxyOff: true,
      proxy: false,
      hooks: 2,
    });
    expect(JSON.stringify(r)).not.toMatch(/p4ss|tok"|https/);
  });

  it('every grant form the API takes: all, some (numbers, lists, port ranges), none, and unknown for anything else', () => {
    const r = rulesFrom(doc({ groups: {}, permissions: { g: { a: true, b: '*', c: 3, d: [1, 2], e: '8000-8100', f: false, h: [], i: 'x', j: 1.5 } } }));
    expect(r?.grants[0]?.programs.map((p) => p.rule)).toEqual(['all', 'all', 'some', 'some', 'some', 'none', 'none', 'unknown', 'unknown']);
    // Which instances: numbers only, as written; a list with anything else keeps no detail.
    expect(r?.grants[0]?.programs.map((p) => p.spec)).toEqual([undefined, undefined, '3', '1, 2', '8000-8100', undefined, undefined, undefined, undefined]);
    expect(rulesFrom(doc({ permissions: { g: { k: ['x', 1] } } }))?.grants[0]?.programs[0]).toEqual({ program: 'k', rule: 'some' });
  });

  it('no document, or no version, reads as null', () => {
    expect(rulesFrom(null)).toBeNull();
    expect(rulesFrom({ data: { groups: {} } })).toBeNull();
  });

  it('the open default is Anyone; the drawer’s own document is Only my IP with its address', () => {
    expect(modeOf(rulesFrom(open)!, 'no')).toEqual({ kind: 'anyone' });
    expect(modeOf(rulesFrom(mine)!, 'no')).toEqual({ kind: 'myIp', ip: '198.51.100.4' });
  });

  it('anything else is advanced, with every reason', () => {
    // A range the Hub would not write itself (host bits set): never one of its choices. (A whole range under this
    // name reads as Only these IPs: access.ips.logic.test.ts.)
    const wide = doc({ groups: { [MY_IP_GROUP]: { type: 'ip', range: '198.51.100.7/24' } }, permissions: { [MY_IP_GROUP]: { '*': true, logs: true } }, default: 'deny' });
    expect(modeOf(rulesFrom(wide)!, 'no')).toEqual({ kind: 'advanced', why: ['rules'] });
    const range = doc({ groups: { [MY_IP_GROUP]: { type: 'ip', range: '198.51.100.0/24' } }, permissions: { [MY_IP_GROUP]: { '*': true, logs: true } }, default: 'deny' });
    expect(modeOf(rulesFrom(range)!, 'no')).toEqual({ kind: 'ips', entries: [{ group: MY_IP_GROUP, range: '198.51.100.0/24' }] });
    const noLogs = doc({ groups: { [MY_IP_GROUP]: { type: 'ip', range: '198.51.100.4/32' } }, permissions: { [MY_IP_GROUP]: { '*': true } }, default: 'deny' });
    expect(modeOf(rulesFrom(noLogs)!, 'no').kind).toBe('advanced');
    const denyOne = doc({ groups: {}, permissions: { g: { files: true } }, default: 'deny' });
    expect(modeOf(rulesFrom(denyOne)!, 'no')).toEqual({ kind: 'advanced', why: ['rules'] });
    const off = doc({ groups: {}, permissions: {}, default: 'allow', enable_proxy: false, hooks: { files: [{}] } });
    expect(modeOf(rulesFrom(off)!, 'no')).toEqual({ kind: 'advanced', why: ['proxyOff', 'hooks'] });
  });

  it('nobody by address: no group, no grant, default deny is Private; with the proxy off or hooks it is advanced', () => {
    const shut = doc({ groups: {}, permissions: {}, default: 'deny' });
    expect(modeOf(rulesFrom(shut)!, 'no')).toEqual({ kind: 'private' });
    expect(modeOf(rulesFrom(shut)!, 'yes')).toEqual({ kind: 'advanced', why: ['project'] });
    expect(modeOf(rulesFrom(doc({ groups: {}, permissions: {}, default: 'deny', hooks: { files: [{}] } }))!, 'no')).toEqual({ kind: 'advanced', why: ['hooks'] });
    // A missing default is not deny: the drawer never guesses.
    expect(modeOf(rulesFrom(doc({ groups: {}, permissions: {} }))!, 'no')).toEqual({ kind: 'advanced', why: ['rules'] });
    // inherit is the project's: open when the project has no rules, not stated under project rules.
    const inherit = doc({ groups: {}, permissions: {}, default: 'inherit' });
    expect(modeOf(rulesFrom(inherit)!, 'no')).toEqual({ kind: 'anyone' });
    expect(modeOf(rulesFrom(inherit)!, 'yes')).toEqual({ kind: 'advanced', why: ['project', 'rules'] });
    expect(modeOf(rulesFrom(inherit)!, 'unknown')).toEqual({ kind: 'advanced', why: ['projectUnknown', 'rules'] });
  });

  it('a Hoody sign-in group reads as its own kind, keeping none of its settings', () => {
    const r = rulesFrom(doc({ groups: { staff: { type: 'hoody-identity', audience: 'aud-secret-ish', users: ['u1'] } }, permissions: {} }));
    expect(r?.groups).toEqual([{ name: 'staff', kind: 'identity' }]);
    expect(JSON.stringify(r)).not.toMatch(/aud-secret-ish|u1/);
  });

  it('a rule on the project, or not knowing, makes even the open document read-only', () => {
    expect(modeOf(rulesFrom(open)!, 'yes')).toEqual({ kind: 'advanced', why: ['project'] });
    expect(modeOf(rulesFrom(mine)!, 'unknown')).toEqual({ kind: 'advanced', why: ['projectUnknown'] });
    expect([projectRulesOf('both'), projectRulesOf('project'), projectRulesOf('computer'), projectRulesOf('none'), projectRulesOf(undefined)]).toEqual(['yes', 'yes', 'no', 'no', 'unknown']);
  });
});
