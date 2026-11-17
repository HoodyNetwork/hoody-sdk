// The CLI and curl lines a script's page shows (parts/runit.ts).
import { describe, expect, it } from 'vitest';
import { cliCommand, maskId } from '@kit';
import { KEY_PLACEHOLDER, execCommandName, runLines, typedOf } from './parts/runit';

const com = { root: 'hoody.com', api: 'api.hoody.com', install: 'install.hoody.com', sdk: 'sdk.hoody.com', hub: 'hub.hoody.com' };
const other = { root: 'example.test', api: 'api.example.test', install: 'install.example.test', sdk: 'sdk.example.test', hub: 'hub.example.test' };
const ID = 'cee2a1b2-42de-7af1-9c3d-2c4b00000000';
const origin = 'https://b7d4-exec-1.orbit.computers.hoody.com';
const rows = (...p: string[]) => p.map((path) => ({ path }));
const comp = (r = rows('default/1/address-web-form.ts', 'default/1/notes.md')) => ({ id: ID, origin, rows: r });
// A folder-2 page reads the exec-2 host (data.ts:293): a fixture pairs a folder's scripts with that folder's host.
const origin2 = 'https://b7d4-exec-2.orbit.computers.hoody.com';
const comp2 = (r = rows('default/2/address-web-form.ts')) => ({ id: ID, origin: origin2, rows: r });
const item = (o: Partial<{ path: string; route: string; keyed: boolean }> = {}) => ({ path: 'default/1/address-web-form.ts', route: '/address-web-form', keyed: false, ...o });

describe('execCommandName follows the CLI\'s naming', () => {
  it('names a route like hoody exec does', () => {
    expect(execCommandName('/address-web-form')).toBe('address-web-form');
    expect(execCommandName('/orders/[id]')).toBe('orders-id');
    expect(execCommandName('/Api/Hello_World')).toBe('api-hello-world');
    expect(execCommandName('/' + 'a'.repeat(70))).toBe('a'.repeat(64));
  });
  it('mounts no command for the root route or a reserved name', () => {
    expect(execCommandName('/')).toBeNull();
    for (const r of ['/logs', '/scripts', '/help', '/admin', '/sudo']) expect(execCommandName(r), r).toBeNull();
  });
});

describe('typedOf reads the schema companion', () => {
  it('true with a companion; never false: a listing can skip files it cannot read', () => {
    expect(typedOf('default/1/a.ts', rows('default/1/a.ts', 'default/1/a.openapi.json'))).toBe(true);
    expect(typedOf('default/1/a.ts', rows('default/1/a.ts', 'default/1/b.md'))).toBeNull();
    expect(typedOf('default/1/a.ts', rows('default/1/a.ts', 'default/1/b.ts'))).toBeNull();
  });
});

describe('runLines', () => {
  it('an open script in folder 1: the CLI command (id masked on screen, whole in the copy) and curl', () => {
    const r = runLines(item(), comp(), com);
    expect(r.note).toBeNull();
    expect(r.cli).toEqual({ code: cliCommand(`--computer ${maskId(ID)} exec address-web-form`, com), copy: `hoody --computer ${ID} exec address-web-form` });
    expect(r.curl).toEqual({ code: `curl -g '${origin}/address-web-form'`, copy: `curl -g '${origin}/address-web-form'` });
  });

  it('names the platform through cliCommand off the CLI\'s default API', () => {
    // Built through cliCommand, never written by hand (conformance.clibaseurl): off hoody.com the line names the platform's API.
    const copy = runLines(item(), comp(), other).cli!.copy;
    expect(copy).toBe(cliCommand(`--computer ${ID} exec address-web-form`, other));
    expect(copy).not.toBe(cliCommand(`--computer ${ID} exec address-web-form`, com));
    expect(copy).toContain('https://api.example.test ');
  });

  it('a keyed script carries a placeholder, never a key', () => {
    const r = runLines(item({ keyed: true }), comp(), com);
    expect(r.curl!.copy).toBe(`curl -g -H 'X-Token: ${KEY_PLACEHOLDER}' '${origin}/address-web-form'`);
  });

  it('a dynamic route takes its parts as arguments', () => {
    const r = runLines(item({ path: 'default/1/orders/[id].ts', route: '/orders/[id]' }), comp(rows('default/1/orders/[id].ts', 'x.md')), com);
    expect(r.cli!.copy).toBe(`hoody --computer ${ID} exec orders-id <id>`);
    expect(r.curl!.copy).toBe(`curl -g '${origin}/orders/<id>'`);
    expect(r).toMatchObject({ fill: true });
  });

  it('a variable part with a dot is one part, as the exec scanner reads it', () => {
    const r = runLines(item({ path: 'default/1/u/[user.id].ts', route: '/u/[user.id]' }), comp(rows('default/1/u/[user.id].ts')), com);
    expect(r.cli!.copy).toBe(`hoody --computer ${ID} exec u-user-id <user.id>`);
    expect(r.curl!.copy).toBe(`curl -g '${origin}/u/<user.id>'`);
  });

  it('a variable part with shell syntax gets no CLI line, its curl line stays quoted, and nothing runs', () => {
    const route = '/[x;touch PWN;#]';
    const r = runLines(item({ path: `default/1${route}.ts`, route }), comp(rows(`default/1${route}.ts`)), com);
    expect(r).toMatchObject({ cli: null, note: 'noName', fill: true });
    expect(r.curl!.copy).toBe(`curl -g '${origin}/<x;touch PWN;#>'`);
  });

  it('a name another folder-1 script also gets is withheld: the CLI could call that one', () => {
    const r = runLines(item({ path: 'default/1/a-b.ts', route: '/a-b' }), comp(rows('default/1/a/b.ts', 'default/1/a-b.ts')), com);
    expect(r).toMatchObject({ cli: null, note: 'clash' });
    // The same name in another folder is no clash: the CLI reaches folder 1 only.
    expect(runLines(item({ path: 'default/1/a-b.ts', route: '/a-b' }), comp(rows('default/2/a/b.ts', 'default/1/a-b.ts')), com).note).toBeNull();
  });

  it('only curl, with the reason: another folder, a typed script, a keyed script whose schema is unknown, no command name', () => {
    expect(runLines(item({ path: 'default/2/address-web-form.ts' }), comp2(), com)).toMatchObject({ cli: null, note: 'folder' });
    const typed = comp(rows('default/1/address-web-form.ts', 'default/1/address-web-form.openapi.json'));
    expect(runLines(item(), typed, com)).toMatchObject({ cli: null, note: 'typed' });
    expect(runLines(item({ keyed: true }), typed, com)).toMatchObject({ cli: null, note: 'typedKeyed' });
    expect(runLines(item({ keyed: true }), comp(rows('default/1/address-web-form.ts')), com)).toMatchObject({ cli: null, note: 'unknownKeyed' });
    expect(runLines(item({ keyed: true }), comp(), com)).toMatchObject({ cli: null, note: 'unknownKeyed' });
    expect(runLines(item({ path: 'default/1/index.ts', route: '/' }), comp(), com)).toMatchObject({ cli: null, note: 'noName' });
    expect(runLines(item({ path: 'default/1/logs.ts', route: '/logs' }), comp(), com)).toMatchObject({ cli: null, note: 'noName' });
    expect(runLines(item({ path: 'default/1/[...rest].ts', route: '/[...rest]' }), comp(), com)).toMatchObject({ cli: null, note: 'noName', fill: true });
  });

  it('an open script whose schema is unknown still gets the CLI line (it takes no key)', () => {
    expect(runLines(item(), comp(rows('default/1/address-web-form.ts')), com).note).toBeNull();
  });

  it('quotes a quote in the address for the shell', () => {
    // A quote can only come in through a variable part's name (the router serves no quote in an address).
    expect(runLines(item({ path: "default/1/[it's].ts", route: "/[it's]" }), comp(), com).curl!.copy).toBe(`curl -g '${origin}/<it'\\''s>'`);
    expect(runLines(item({ path: "default/1/it's.ts", route: "/it's" }), comp(), com).note).toBe('unroutable');
  });
});

// A typed route with several operations claims `<name>-<method>` before any untyped script, and
// the listing can leave out a script the CLI still mounts. So a name another script can claim with a method suffix is withheld
// (no line is ever typed into a terminal).
describe('method-suffix claims', () => {
  it('a name another script can claim with a method suffix is withheld, typed or not as far as the listing shows', () => {
    for (const other of [rows('default/1/foo.ts', 'default/1/foo.openapi.json', 'default/1/foo-get.ts'), rows('default/1/foo.ts', 'default/1/foo-get.ts')]) {
      for (const m of ['get', 'post', 'put', 'patch', 'delete']) {
        const r = runLines(item({ path: `default/1/foo-${m}.ts`, route: `/foo-${m}` }), comp([...other, { path: `default/1/foo-${m}.ts` }]), com);
        expect(r, m).toMatchObject({ cli: null, note: 'clash' });
      }
    }
  });

  it('a reserved name still claims its method names: /logs is typed as logs-get', () => {
    expect(runLines(item({ path: 'default/1/logs-get.ts', route: '/logs-get' }), comp(rows('default/1/logs.ts', 'default/1/logs-get.ts')), com)).toMatchObject({ cli: null, note: 'clash' });
  });

  it('a name that only starts like another one is no clash', () => {
    expect(runLines(item({ path: 'default/1/foo-gets.ts', route: '/foo-gets' }), comp(rows('default/1/foo.ts', 'default/1/foo-gets.ts')), com).note).toBeNull();
    expect(runLines(item({ path: 'default/1/foo-get.ts', route: '/foo-get' }), comp(rows('default/2/foo.ts', 'default/1/foo-get.ts')), com).note).toBeNull();
  });
});

// Catch-alls are values to fill in, and they claim CLI names. (No line is ever typed
// into a terminal.)
describe('the one rule', () => {
  it('a catch-all, required or optional, is a value to fill in: shown as <name>, nothing typed in', () => {
    for (const route of ['/files/[...rest]', '/files/[[...rest]]']) {
      const r = runLines(item({ path: `default/1${route}.ts`, route }), comp(rows(`default/1${route}.ts`)), com);
      expect(r, route).toMatchObject({ cli: null, fill: true });
      expect(r.curl!.copy, route).toBe(`curl -g '${origin}/files/<rest>'`);
    }
  });

  it('a visible catch-all claims its CLI name and its method names', () => {
    for (const ca of ['default/1/[...foo].ts', 'default/1/[[...foo]].ts']) {
      for (const n of ['foo', 'foo-get', 'foo-delete']) {
        const r = runLines(item({ path: `default/1/${n}.ts`, route: `/${n}` }), comp(rows(ca, `default/1/${n}.ts`)), com);
        expect(r, `${ca} ${n}`).toMatchObject({ cli: null, note: 'clash' });
      }
    }
  });

  it('a folder-2 script\'s curl line is on its own folder\'s host', () => {
    expect(runLines(item({ path: 'default/2/address-web-form.ts' }), comp2(), com).curl!.copy).toBe(`curl -g '${origin2}/address-web-form'`);
  });
});

// Nothing is ever typed into a terminal, so the lines carry no "run" at all. A name the exec
// router can't serve gets no line, and curl never reads the address as a glob.
describe('lines to copy only', () => {
  it('the lines carry nothing for a terminal to run', () => {
    for (const r of [runLines(item(), comp(), com), runLines(item({ keyed: true }), comp(), com), runLines(item({ path: 'default/2/address-web-form.ts' }), comp2(), com)]) {
      expect(Object.keys(r).sort()).toEqual(['cli', 'curl', 'fill', 'note']);
    }
  });

  it('curl never globs the address: -g on every line', () => {
    expect(runLines(item(), comp(), com).curl!.copy.startsWith('curl -g ')).toBe(true);
    expect(runLines(item({ keyed: true }), comp(), com).curl!.copy.startsWith('curl -g -H ')).toBe(true);
  });

  it('a file name the exec router can\'t serve gets no line, with the reason', () => {
    for (const n of ['foo#bar', 'foo?x', 'foo%41', 'foo bar', 'foo{a,b}', 'caf\u00e9']) {
      const r = runLines(item({ path: `default/1/${n}.ts`, route: `/${n}` }), comp(rows(`default/1/${n}.ts`)), com);
      expect(r, n).toEqual({ cli: null, curl: null, note: 'unroutable', fill: false });
    }
  });
});
