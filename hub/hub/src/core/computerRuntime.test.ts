// Vitest: core's listener read classifies a computer's listeners for the Computers page, and portListening says what one port is there.
import { describe, expect, it } from 'vitest';
import { classifyRuntime, kitProgram, portListening } from './computerRuntime';

const svc = (port: unknown, ip = '0.0.0.0', program = 'node', protocol = 'tcp') => ({ port, ip, program, protocol });
// Hoody's terminal as the collector reports it: its name and its exe path (a name alone is not Hoody's).
const ttyd = (port: number) => ({ ...svc(port, '0.0.0.0', 'ttyd'), path: '/usr/bin/ttyd' });

describe('classifyRuntime', () => {
  it('web, loopback-only and other ports; Hoody\'s own counted apart; bad ports dropped', () => {
    const r = classifyRuntime({
      network_services: [svc(3000), svc(5173, '127.0.0.1'), svc(4000, '::1'), svc(5432), ttyd(7681), svc(53, '0.0.0.0', 'dns', 'udp'), svc(0), svc(70000), svc('80')],
      terminals: [1, 2],
      displays: [1],
    });
    expect(r.yours).toEqual([
      { port: 53, program: 'dns', kind: 'other' },
      { port: 3000, program: 'node', kind: 'web' },
      { port: 4000, program: 'node', kind: 'local' },
      { port: 5173, program: 'node', kind: 'local' },
      { port: 5432, program: 'node', kind: 'other' },
    ]);
    expect(r.system).toEqual([7681]);
    expect(r.terminals).toBe(2);
    expect(r.displays).toBe(1);
  });
  it('a web listener wins over a loopback one on the same port, whichever comes first', () => {
    expect(classifyRuntime({ network_services: [svc(3000, '127.0.0.1'), svc(3000)] }).yours).toEqual([{ port: 3000, program: 'node', kind: 'web' }]);
    expect(classifyRuntime({ network_services: [svc(3000), svc(3000, '127.0.0.1')] }).yours).toEqual([{ port: 3000, program: 'node', kind: 'web' }]);
  });
  it('nothing read: no listeners', () => {
    expect(classifyRuntime(null)).toEqual({ yours: [], system: [], terminals: 0, displays: 0 });
  });
});

describe('Hoody\'s own needs evidence, never a name alone', () => {
  const row = (port: number, program: string, more: { path?: string; args?: string } = {}) => ({ ...svc(port, '0.0.0.0', program), ...more });
  it('a person\'s own agent or code-server (a home path, or no path) is theirs', () => {
    const r = classifyRuntime({ network_services: [
      row(3000, 'agent', { path: '/home/me/bin/agent' }),
      row(3001, 'code-server', { path: '/root/.local/bin/code-server' }),
      row(3002, 'agent'),
      row(3003, 'sshd', { path: '/opt/sshd', args: 'sshd -D' }),
    ] });
    expect(r.yours.map((l) => [l.port, l.program, l.kind])).toEqual([[3000, 'agent', 'web'], [3001, 'code-server', 'web'], [3002, 'agent', 'web'], [3003, 'sshd', 'web']]);
    expect(r.system).toEqual([]);
    expect(portListening(r, 3000)).toBe('web');
  });
  it('the same names at a system or Hoody path (exe, or argv0) are Hoody\'s', () => {
    const r = classifyRuntime({ network_services: [
      row(22, 'sshd', { path: '/usr/sbin/sshd' }),
      row(8443, 'code-server', { path: '/usr/lib/code-server/lib/node' }),
      row(15000, 'agent', { path: '/hoody/bin/agent' }),
      row(15001, 'agent', { args: '/hoody/bin/agent --serve' }),
      row(7681, 'ttyd', { path: '/usr/bin/ttyd' }),
    ] });
    expect(r.yours).toEqual([]);
    expect(r.system).toEqual([22, 7681, 8443, 15000, 15001]);
  });
  it('a hoody-* name with a user path is the person\'s; with a Hoody path it is Hoody\'s; a path that climbs out is no evidence', () => {
    const r = classifyRuntime({ network_services: [
      row(4000, 'hoody-clone', { path: '/home/me/hoody-clone' }),
      row(4001, 'hoody-egress', { path: '/hoody/bin/hoody-egress' }),
      row(4002, 'agent', { path: '/usr/bin/../../home/me/agent' }),
      row(4003, 'agent', { path: 'usr/bin/agent' }),
    ] });
    expect(r.yours.map((l) => l.port)).toEqual([4000, 4002, 4003]);
    expect(r.system).toEqual([4001]);
  });
  it('the system\'s avahi-daemon (network discovery) is counted with Hoody\'s own, on every port it holds; a person\'s own is theirs', () => {
    // As the collector reports it: comm, the exe path, and the command line avahi rewrites ("avahi-daemon: running [name.local]").
    const avahi = (port: number) => ({ port, ip: '0.0.0.0', protocol: 'udp', program: 'avahi-daemon', path: '/usr/sbin/avahi-daemon', args: 'avahi-daemon: running [box.local]' });
    const r = classifyRuntime({ network_services: [avahi(5353), avahi(34135), avahi(39180), svc(3000)] });
    expect(r.yours).toEqual([{ port: 3000, program: 'node', kind: 'web' }]);
    expect(r.system).toEqual([5353, 34135, 39180]);
    expect(portListening(r, 5353)).toBe('system');
    // A name alone is no evidence: a home path, or no path at all, stays the person's.
    const own = classifyRuntime({ network_services: [
      { ...avahi(5353), path: '/home/me/bin/avahi-daemon' },
      { port: 5354, ip: '0.0.0.0', protocol: 'udp', program: 'avahi-daemon' },
    ] });
    expect(own.yours.map((l) => [l.port, l.program, l.kind])).toEqual([[5353, 'avahi-daemon', 'other'], [5354, 'avahi-daemon', 'other']]);
    expect(own.system).toEqual([]);
  });
  it('systemd and xpra keep their path-like rules', () => {
    const r = classifyRuntime({ network_services: [row(5355, 'systemd-resolve'), row(14500, '/usr/bin/xpra')] });
    expect(r.system).toEqual([5355, 14500]);
  });
});

describe('portListening', () => {
  const r = classifyRuntime({ network_services: [svc(3000), svc(5173, '127.0.0.1'), svc(5432), ttyd(7681)] });
  it('says what a port is', () => {
    expect(portListening(r, 3000)).toBe('web');
    expect(portListening(r, 5173)).toBe('local');
    expect(portListening(r, 5432)).toBe('other');
    expect(portListening(r, 7681)).toBe('system');
    expect(portListening(r, 8080)).toBe('none');
  });
});

// A Hoody kit program is told by where it runs from (/hoody/plugins/, which the person cannot write), as
// the computer reports it: path (the exe), program (comm, cut at 15 characters), args (the command line).
describe('kitProgram', () => {
  it('comm "/hoody/plugins/" alone: a kit program with no name (comm is cut, so it never names one)', () => {
    expect(kitProgram({ program: '/hoody/plugins/' })).toEqual({ name: null });
    expect(kitProgram({ program: '/hoody/plugins/h' }), 'a cut comm names nothing').toEqual({ name: null });
  });
  it('the exe path alone tells it, and names the plugin', () => {
    expect(kitProgram({ program: 'server', path: '/hoody/plugins/hoody-exec/bin/server', args: '' })).toEqual({ name: 'hoody-exec' });
  });
  it('argv0, or an interpreter\'s script, names the plugin when comm cannot', () => {
    expect(kitProgram({ program: '/hoody/plugins/', path: '/usr/bin/bun', args: '/hoody/plugins/hoody-files/files --port 5601' })).toEqual({ name: 'hoody-files' });
    expect(kitProgram({ program: 'main.js', path: '/hoody/plugins/node/bin/node', args: 'node --max-old-space-size=64 /hoody/plugins/hoody-browser/main.js' }), 'the script, not the kit\'s node').toEqual({ name: 'hoody-browser' });
    expect(kitProgram({ program: 'main.js', path: '/usr/bin/node', args: 'node --inspect /hoody/plugins/hoody-browser/main.js' })).toEqual({ name: 'hoody-browser' });
    // Options with values before the script: any kit-path argument of an interpreter counts.
    expect(kitProgram({ program: 'main.js', path: '/usr/bin/node', args: 'node --require preload.js /hoody/plugins/hoody-browser/main.js' })).toEqual({ name: 'hoody-browser' });
    expect(kitProgram({ program: 'srv.rb', path: '/usr/bin/ruby', args: '/usr/bin/ruby -I lib /hoody/plugins/hoody-x/srv.rb' })).toEqual({ name: 'hoody-x' });
    expect(kitProgram({ program: 'main.py', path: '/usr/bin/python3.12', args: 'python3.12 -m http.server --directory /hoody/plugins/hoody-files/www' })).toEqual({ name: 'hoody-files' });
  });
  it('look-alikes are not kit programs', () => {
    for (const p of ['/hoody/pluginsX/a', '/hoody/plugins', 'hoody/plugins/x', './hoody/plugins/x', '/hoody/plugins/../usr/bin/node', '/hoody/plugins/./x',
      '/hoody/plugins//x', '/home/me/hoody/plugins/x', '/opt/hoody/plugins/x']) {
      expect(kitProgram({ program: p }), `program ${p}`).toBeNull();
      expect(kitProgram({ path: p }), `path ${p}`).toBeNull();
      expect(kitProgram({ args: `${p} --serve` }), `argv0 ${p}`).toBeNull();
    }
    // A kit path as an argument of a program that is not an interpreter does not make that program a kit one.
    expect(kitProgram({ program: 'myserver', path: '/usr/local/bin/myserver', args: 'myserver /hoody/plugins/hoody-exec/x' })).toBeNull();
    expect(kitProgram({ program: 'node', path: '/usr/bin/node', args: 'node server.js' })).toBeNull();
    expect(kitProgram({ program: 42, path: null, args: {} })).toBeNull();
  });
  it('args arrive flattened: a path holding a space is read in parts, which can only drop a name, never mark a program elsewhere', () => {
    expect(kitProgram({ program: 'app', path: '/home/me/my app/app', args: '/home/me/my app/app --port 3000' })).toBeNull();
    expect(kitProgram({ program: 'app', path: '/opt/x y/hoody/plugins/z', args: '/opt/x y/hoody/plugins/z' })).toBeNull();
  });
  it('a plugin folder name that is not a plain name is not taken as one', () => {
    expect(kitProgram({ path: '/hoody/plugins/a b/x' })).toEqual({ name: null });
    expect(kitProgram({ path: `/hoody/plugins/${'x'.repeat(41)}/y` })).toEqual({ name: null });
  });
  it('classifyRuntime marks kit listeners, keeps their kind, and leaves others unmarked', () => {
    const r = classifyRuntime({ network_services: [
      { port: 5601, ip: '0.0.0.0', protocol: 'tcp', program: '/hoody/plugins/', path: '/usr/bin/bun', args: '' },
      { port: 12002, ip: '0.0.0.0', protocol: 'tcp', program: '/hoody/plugins/', path: '/hoody/plugins/hoody-dom/hd', args: '' },
      { port: 3000, ip: '0.0.0.0', protocol: 'tcp', program: 'node', path: '/usr/bin/node', args: 'node server.js' },
    ] });
    expect(r.yours).toEqual([
      { port: 3000, program: 'node', kind: 'web' },
      { port: 5601, program: '/hoody/plugins/', kind: 'web', kit: { name: null } },
      { port: 12002, program: '/hoody/plugins/', kind: 'web', kit: { name: 'hoody-dom' } },
    ]);
  });
  it('a web listener that wins a port keeps the kit mark another listener on it had', () => {
    const r = classifyRuntime({ network_services: [
      { port: 5601, ip: '127.0.0.1', protocol: 'tcp', program: '/hoody/plugins/', path: '/hoody/plugins/hoody-files/f' },
      { port: 5601, ip: '0.0.0.0', protocol: 'tcp', program: '/hoody/plugins/' },
    ] });
    expect(r.yours).toEqual([{ port: 5601, program: '/hoody/plugins/', kind: 'web', kit: { name: 'hoody-files' } }]);    const back = classifyRuntime({ network_services: [
      { port: 5601, ip: '0.0.0.0', protocol: 'tcp', program: '/hoody/plugins/' },
      { port: 5601, ip: '127.0.0.1', protocol: 'tcp', program: '/hoody/plugins/', path: '/hoody/plugins/hoody-files/f' },
    ] });
    expect(back.yours, 'in either order').toEqual([{ port: 5601, program: '/hoody/plugins/', kind: 'web', kit: { name: 'hoody-files' } }]);
  });
});
