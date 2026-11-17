import { describe, expect, it } from 'vitest';
import { PORTS_MAX, portsOf, scriptRoute, scriptsOf, SCRIPTS_MAX } from './extras';

describe('picker extras: ports', () => {
  it('lists your own programs\' ports, one per port of a range, sorted; system kits and portless programs are left out', () => {
    const ov = {
      programs: [
        { id: 2, name: 'api', status: 'running', port_range: { start: 8080, end: 8081 }, instances: [{ port: 8081, status: 'running' }, { port: 8080, status: 'running' }] },
        { id: 1, name: 'shop', status: 'running', instances: [{ port: 3000, status: 'running' }] },
        { id: 3, name: 'hoody-terminal', hoody_kit: true, status: 'running', instances: [{ port: 7681, status: 'running' }] },
        { id: 4, name: 'worker', status: 'running', instances: [{ status: 'running' }] },
      ],
    };
    expect(portsOf(ov)).toEqual([{ name: 'shop', port: 3000 }, { name: 'api', port: 8080 }, { name: 'api', port: 8081 }]);
  });
  it('a body that is not the overview gives nothing; a long list stops at the cap', () => {
    expect(portsOf({ nope: 1 })).toEqual([]);
    expect(portsOf(null)).toEqual([]);
    const many = { programs: Array.from({ length: PORTS_MAX + 5 }, (_, i) => ({ id: i + 1, name: 'p' + i, status: 'running', instances: [{ port: 2000 + i, status: 'running' }] })) };
    expect(portsOf(many)).toHaveLength(PORTS_MAX);
  });
});

describe('picker extras: scripts', () => {
  it('a script file answers its route; index is its folder; dynamic, unserved and non-script files have none', () => {
    expect(scriptRoute('default/1/index.ts')).toBe('/');
    expect(scriptRoute('default/1/orders/index.js')).toBe('/orders');
    expect(scriptRoute('default/1/orders/list.ts')).toBe('/orders/list');
    expect(scriptRoute('orders/list.ts')).toBe('/orders/list');
    expect(scriptRoute('default/1/orders/[id].ts')).toBeNull();
    expect(scriptRoute('default/1/_hoody/x.ts')).toBeNull();
    expect(scriptRoute('default/1/node_modules/a.js')).toBeNull();
    expect(scriptRoute('default/1/readme.md')).toBeNull();
    expect(scriptRoute('default/1/../x.ts')).toBeNull();
    // Another Exec root is not this one's route; middleware files are not routes (a folder named pre is).
    expect(scriptRoute('default/2/private.ts')).toBeNull();
    expect(scriptRoute('/default/2/private.ts')).toBeNull();
    expect(scriptRoute('default/1/pre.ts')).toBeNull();
    expect(scriptRoute('default/1/orders/post.js')).toBeNull();
    expect(scriptRoute('default/1/pre/index.ts')).toBe('/pre');
    // A route too long for storage and links is not offered.
    expect(scriptRoute('default/1/' + 'a'.repeat(199) + '.ts')).toBe('/' + 'a'.repeat(199));
    expect(scriptRoute('default/1/' + 'a'.repeat(200) + '.ts')).toBeNull();
  });
  it('the list keeps files only, without repeats, sorted, at most the cap', () => {
    const list = { scripts: [{ path: 'default/1/b.ts' }, { path: 'default/1/a.ts' }, { path: 'default/1/a.js' }, { path: 'default/1/dir', isDirectory: true }, { path: 'default/1/c.ts', type: 'dir' }, { nope: 1 }] };
    expect(scriptsOf(list)).toEqual(['/a', '/b']);
    expect(scriptsOf({ files: [{ path: 'default/1/x.ts' }] })).toEqual(['/x']);
    expect(scriptsOf('nope')).toEqual([]);
    const many = { scripts: Array.from({ length: SCRIPTS_MAX + 5 }, (_, i) => ({ path: `default/1/s${String(i).padStart(3, '0')}.ts` })) };
    expect(scriptsOf(many)).toHaveLength(SCRIPTS_MAX);
  });
});
