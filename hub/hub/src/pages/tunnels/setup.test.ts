// The Setup panel's pure command builder: inputs → checked values, CLI and SDK text, warnings.
import { describe, expect, it } from 'vitest';
import { RISKY_PORTS, buildSetup, checkSetup, kitUserErrorKey, placeKey, shq, type SetupInput } from './setup';
import strings from './strings.en.json';

const CID = '6a00c0a7e1f2a3b4c5d6e7f8';
const base: SetupInput = { mode: 'expose', host: '', port: '3000', computerPort: '', kitLogin: false, kitUser: '' };
const ok = (i: Partial<SetupInput>) => {
  const c = checkSetup({ ...base, ...i });
  if (!c.ok) throw new Error(`not ok: ${JSON.stringify(c.problems)}`);
  return buildSetup(c.value, CID);
};

describe('shq (shell quoting)', () => {
  it('leaves plain words alone and single-quotes the rest, escaping quotes inside', () => {
    expect(shq('localhost:3000')).toBe('localhost:3000');
    expect(shq('ops-user_1')).toBe('ops-user_1');
    expect(shq('a b')).toBe("'a b'");
    expect(shq("it's")).toBe("'it'\\''s'");
    expect(shq('$(rm -rf ~)')).toBe("'$(rm -rf ~)'");
    expect(shq('')).toBe("''");
  });
});

describe('buildSetup: the SDK example on the platform', () => {
  it('only the baseURL follows the platform; a host and user the person typed stay as typed', () => {
    const c = checkSetup({ ...base, host: 'api.hoody.com', kitLogin: true, kitUser: 'api.hoody.com' });
    if (!c.ok) throw new Error(`not ok: ${JSON.stringify(c.problems)}`);
    const other = buildSetup(c.value, CID, 'api.example.test');
    expect(other.sdk).toContain("baseURL: 'https://api.example.test'");
    expect(other.sdk).toContain("host: 'api.hoody.com'");
    expect(other.sdk).toContain("username: 'api.hoody.com'");
    expect(other.sdk.match(/api\.example\.test/g)).toHaveLength(1);
    expect(buildSetup(c.value, CID).sdk).toContain("baseURL: 'https://api.hoody.com'");
  });
});

describe('checkSetup', () => {
  it('needs a local port between 1 and 65535', () => {
    for (const port of ['', '0', '65536', '3.5', '-1', '80a']) {
      const c = checkSetup({ ...base, port });
      expect(c.ok, port).toBe(false);
      if (!c.ok) expect(c.problems.port).toBeDefined();
    }
  });
  it('takes an empty computer port as "pick one when it connects", and refuses ports below 80', () => {
    expect(checkSetup({ ...base, computerPort: '' }).ok).toBe(true);
    const low = checkSetup({ ...base, computerPort: '79' });
    expect(low.ok).toBe(false);
    if (!low.ok) expect(low.problems.computerPort).toBe('low');
    const junk = checkSetup({ ...base, computerPort: 'x' });
    if (!junk.ok) expect(junk.problems.computerPort).toBe('range');
  });
  it('refuses a host with spaces or shell characters', () => {
    for (const host of ['my host', 'a;b', '$(x)', "a'b", 'a\nb']) expect(checkSetup({ ...base, host }).ok, host).toBe(false);
    expect(checkSetup({ ...base, host: '10.0.0.5' }).ok).toBe(true);
    expect(checkSetup({ ...base, host: 'db.lan' }).ok).toBe(true);
  });
  it('refuses an IPv6 host with its own reason: Hoody networks use IPv4 only', () => {
    for (const host of ['::1', '[::1]', 'fe80::1', '2001:db8::5']) {
      const c = checkSetup({ ...base, host });
      expect(c.ok, host).toBe(false);
      if (!c.ok) expect(c.problems.host, host).toBe('v4only');
    }
    const junk = checkSetup({ ...base, host: 'a;b' });
    if (!junk.ok) expect(junk.problems.host).toBe('host');
  });
  it('needs a kit user name when a kit login is asked for', () => {
    const c = checkSetup({ ...base, kitLogin: true, kitUser: ' ' });
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.problems.kitUser).toBe('required');
  });
});

describe('buildSetup: CLI', () => {
  it('builds the expose command with the computer flag, and a bare port for localhost', () => {
    const s = ok({});
    expect(s.cli).toBe(`hoody --computer ${CID} tunnel expose 3000`);
  });
  it('adds --port for a fixed computer port, and host:port for another host', () => {
    expect(ok({ computerPort: '8080' }).cli).toBe(`hoody --computer ${CID} tunnel expose 3000 --port 8080`);
    expect(ok({ host: '10.0.0.5' }).cli).toBe(`hoody --computer ${CID} tunnel expose 10.0.0.5:3000`);
  });
  it('builds the pull command', () => {
    expect(ok({ mode: 'pull', port: '5432', computerPort: '5432' }).cli).toBe(`hoody --computer ${CID} tunnel pull 5432 --port 5432`);
  });
  it('asks for a kit login with flags only: the password is never in the command text', () => {
    const s = ok({ kitLogin: true, kitUser: 'ops user' });
    expect(s.cli).toBe(`hoody --computer ${CID} --kit-auth password --kit-user 'ops user' tunnel expose 3000`);
    expect(s.cli).not.toMatch(/HOODY_KIT_PASSWORD|password=/i);
    expect(s.sdk).toContain('process.env.HOODY_KIT_PASSWORD');
    expect(s.sdk).not.toMatch(/password: '[^']/);
  });
  it('SDK: the password is read into a checked string before use (the SDK takes string, not undefined)', () => {
    const s = ok({ kitLogin: true, kitUser: 'ops' });
    expect(s.sdk).toContain('const kitPassword = process.env.HOODY_KIT_PASSWORD;');
    expect(s.sdk).toMatch(/if \(!kitPassword\) throw /);
    expect(s.sdk).toContain("kitAuth: { type: 'password', username: 'ops', password: kitPassword }");
    expect(s.sdk.indexOf('const kitPassword')).toBeLessThan(s.sdk.indexOf('kitAuth'));
    expect(s.sdk).not.toMatch(/password: process\.env/);
    expect(ok({}).sdk).not.toContain('kitPassword');
  });
});

describe('buildSetup: SDK', () => {
  it('expose: computerPort 0 when none is fixed, the local target, and the address printed', () => {
    const s = ok({});
    expect(s.sdk).toContain(`await hoody.withComputer('${CID}')`);
    expect(s.sdk).toContain("box.tunnel.expose({ computerPort: 0, to: { host: 'localhost', port: 3000 } })");
    expect(s.sdk).toContain('process.env.HOODY_TOKEN');
  });
  it('pull: the fixed port and the host string escaped for JS', () => {
    const s = ok({ mode: 'pull', host: 'db.lan', port: '5432', computerPort: '6543' });
    expect(s.sdk).toContain("box.tunnel.pull({ computerPort: 6543, to: { host: 'db.lan', port: 5432 } })");
  });
});

describe('buildSetup: warnings', () => {
  it('warns on database and admin ports (local or computer port), and never on others', () => {
    for (const p of [5432, 3306, 6379, 27017, 9200, 2375, 2376, 5984, 11211, 22, 3389, 5900]) {
      expect(ok({ port: String(p) }).warnings, String(p)).toContain('risky');
      expect(ok({ mode: 'pull', port: String(p) }).warnings, `pull ${p}`).toContain('risky');
    }
    expect(ok({ port: '3000', computerPort: '5432' }).warnings).toContain('risky');
    expect(ok({ port: '3000' }).warnings).not.toContain('risky');
  });
  it('the web-admin ports warn in EXPOSE only', () => {
    for (const p of [8080, 9000, 15672, 8500]) {
      expect(ok({ port: String(p) }).warnings, String(p)).toContain('risky');
      expect(ok({ mode: 'pull', port: String(p) }).warnings, `pull ${p}`).not.toContain('risky');
    }
    expect(RISKY_PORTS.expose.length).toBeGreaterThan(RISKY_PORTS.both.length);
  });
  it('another host than this laptop warns that it puts another machine online', () => {
    expect(ok({ host: '10.0.0.5' }).warnings).toContain('otherHost');
    for (const host of ['', 'localhost', '127.0.0.1', 'LOCALHOST']) expect(ok({ host }).warnings, host).not.toContain('otherHost');
  });
  it('ports 80-1023 on the computer may be refused (the program needs a start flag for them)', () => {
    expect(ok({ computerPort: '443' }).warnings).toContain('privileged');
    expect(ok({ computerPort: '1024' }).warnings).not.toContain('privileged');
  });
});

describe('buildSetup: address preview', () => {
  it('expose with a fixed computer port previews that port; without one, none', () => {
    expect(ok({ computerPort: '8080' }).previewPort).toBe(8080);
    expect(ok({}).previewPort).toBeNull();
  });
  it('pull previews the place inside the computer when fixed', () => {
    expect(ok({ mode: 'pull', port: '5432', computerPort: '5432' }).inside).toBe('127.0.0.1:5432');
    expect(ok({ mode: 'pull', port: '5432' }).inside).toBeNull();
  });
});

describe('placeKey', () => {
  it('is the same for a place live and reconnecting (session + bind id), and per session for one sharing nothing', () => {
    expect(placeKey({ id: 'S-1~4', sessionId: 'S-1', bindId: 4 })).toBe('S-1~4');
    expect(placeKey({ id: 'r~S-1~4', sessionId: 'S-1', bindId: 4 })).toBe('S-1~4');
    expect(placeKey({ id: 'S-1~idle', sessionId: 'S-1', bindId: null })).toBe('S-1~idle');
    expect(placeKey({ id: 'S-1~4', sessionId: 'S-1', bindId: 4 })).not.toBe(placeKey({ id: 'S-2~4', sessionId: 'S-2', bindId: 4 }));
  });
  it('a listener of no known session keeps its own row id (two can share a bind id)', () => {
    const a = placeKey({ id: 'r~~pull~127.0.0.1~5432~1', sessionId: '', bindId: 1 });
    const b = placeKey({ id: 'r~~pull~127.0.0.2~5432~1', sessionId: '', bindId: 1 });
    expect(a).not.toBe(b);
  });
});

describe('the user name box', () => {
  it('asks for a name only when the box is empty; a refused name gets the rule', () => {
    const c = checkSetup({ ...base, kitLogin: true, kitUser: 'x'.repeat(65) });
    expect(c.ok).toBe(false);
    const p = !c.ok ? c.problems.kitUser : undefined;
    expect(p).toBe('user');
    expect(strings[kitUserErrorKey(p!)]).toMatch(/64 characters/);
    const e = checkSetup({ ...base, kitLogin: true, kitUser: '  ' });
    expect(!e.ok && kitUserErrorKey(e.problems.kitUser!)).toBe('setup.err.user');
  });
});
