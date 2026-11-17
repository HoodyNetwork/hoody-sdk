// Deep path params and the one files-path helper: names kept exactly, the alias names
// written as folders on every method, the 4,096-byte bound, direct links, lossy names and protected subtrees.
import { describe, expect, it } from 'vitest';
import { api } from './api';
import { encodePathParts, FILES_ALIASES, filesUrl, lossyName, MAX_PATH_BYTES, partsOfPath, pathPartsProblem, protectedPath } from './files-path';
import { pathOk } from './kit';
import { build, defineRoute } from './routes';
import { routeLabel } from './trace-id';
import { boot, calls, PROXY, R1 } from './test/env';

const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
// The server's alias table, written out here (never read from FILES_ALIASES): a name dropped from the helper's list
// fails its rows instead of taking them away.
const ALIAS_METHOD: Record<string, string> = { stat: 'GET', grep: 'GET', glob: 'GET', realpath: 'GET', append: 'PUT', move: 'POST', copy: 'POST', chmod: 'PATCH', chown: 'PATCH' };
const ALIASES = Object.keys(ALIAS_METHOD);

/** hoody-files as it reads /api/v1/files/<raw> (its router: HEAD answered as GET, files/health the health check on
 *  GET and no file on any other method; then its alias split and URI decoding): the alias or health
 *  check it runs, 'none' (no file is reached), or the decoded path it names. */
function server(method: string, raw: string): { alias: string } | { none: true } | { path: string } {
  if (raw === 'health') return method === 'GET' || method === 'HEAD' ? { alias: 'health' } : { none: true };
  for (const a of ALIASES) {
    if (ALIAS_METHOD[a] !== (method === 'HEAD' ? 'GET' : method)) continue;
    if (raw === a || raw.startsWith(a + '/')) return { alias: a };
  }
  return { path: raw.split('/').map(decodeURIComponent).join('/') };
}

describe('the alias list is the server\'s nine names', () => {
  it('FILES_ALIASES holds exactly the nine', () => {
    expect([...FILES_ALIASES].sort()).toEqual([...ALIASES].sort());
  });
});

describe('pathPartsProblem: only what the files program cannot address is refused', () => {
  it.each([
    [['home', 'me'], null],
    [[], null],
    [['100%', 'a\\b', 'tab\there', 'nl\nx', 'del\u007f', 'ünï cödé ✓', ' lead and trail '], null],
    [['a\\b'], null],
    [['x', '\\x'], null],
    [['\\x'], 'leading_backslash'],
    [['a', ''], 'empty_part'],
    [['a', '.'], 'dot_part'],
    [['..'], 'dot_part'],
    [['a/b'], 'slash_in_part'],
    [['a\u0000b'], 'nul_in_part'],
    ['/home', 'not_list'],
    [[1 as unknown as string], 'empty_part'],
  ] as const)('%j → %s', (parts, want) => {
    expect(pathPartsProblem(parts)).toBe(want);
  });

  it('the bound is 4,096 bytes of UTF-8, parts joined by "/"', () => {
    const at = ['a'.repeat(2047), 'b'.repeat(2048)];
    expect(at.join('/').length).toBe(MAX_PATH_BYTES);
    expect(pathPartsProblem(at)).toBeNull();
    expect(pathPartsProblem(['a'.repeat(2048), 'b'.repeat(2048)])).toBe('too_long');
    // é is 2 bytes: 2,048 of them are 4,096 bytes; one more letter is over.
    expect(pathPartsProblem(['é'.repeat(2048)])).toBeNull();
    expect(pathPartsProblem(['é'.repeat(2048) + 'x'])).toBe('too_long');
  });
});

describe('encodePathParts: each part one segment, names exactly as the computer has them', () => {
  it('encodes %, backslash, control characters, spaces and unicode, and the program decodes them back', () => {
    const parts = ['100%', 'a\\b', 'tab\tx', 'ünï ✓', '?#&='];
    const enc = encodePathParts('GET', parts, true)!;
    expect(enc).toBe('100%25/a%5Cb/tab%09x/%C3%BCn%C3%AF%20%E2%9C%93/%3F%23%26%3D');
    expect(server('GET', enc)).toEqual({ path: parts.join('/') });
  });

  for (const name of ALIASES) {
    for (const m of METHODS) {
      it(`a top folder named ${name} is a folder on ${m}, at the files root only`, () => {
        const enc = encodePathParts(m, [name, 'x'], true)!;
        expect(enc).toBe('%' + name.charCodeAt(0).toString(16).toUpperCase() + name.slice(1) + '/x');
        expect(server(m, enc)).toEqual({ path: name + '/x' });
        expect(server(m, encodePathParts(m, [name], true)!)).toEqual({ path: name });
        // Deeper, and on a route where the parts do not follow /api/v1/files, nothing changes.
        expect(encodePathParts(m, ['a', name], true)).toBe('a/' + name);
        expect(encodePathParts(m, [name], false)).toBe(name);
      });
    }
  }

  it('a top folder named health is a folder on every method (the bare name is the health check or no file)', () => {
    for (const m of METHODS) {
      expect(server(m, 'health')).not.toEqual({ path: 'health' });
      const enc = encodePathParts(m, ['health'], true)!;
      expect(enc).toBe('%68ealth');
      expect(server(m, enc)).toEqual({ path: 'health' });
      expect(encodePathParts(m, ['health', 'x'], true)).toBe('%68ealth/x');
    }
  });

  it('near names are left as they are', () => {
    for (const n of ['stats', 'Stat', 'STAT', 'copy2', 'healthy', 'Health', 'stat ']) expect(encodePathParts('GET', [n], true)).toBe(encodeURIComponent(n));
  });

  it('the list is read once: a getter or an overridden method cannot answer the check one thing and the send another', () => {
    let reads = 0;
    const tricky: string[] = [];
    Object.defineProperty(tricky, 0, { get: () => (reads++ === 0 ? 'safe' : '..'), enumerable: true });
    expect(encodePathParts('GET', tricky, true)).toBe('safe');
    expect(reads).toBe(1);
    const mapped = ['safe'];
    (mapped as unknown as { map: () => string[] }).map = () => ['stat', 'victim'];
    (mapped as unknown as { join: () => string }).join = () => 'stat/victim';
    expect(encodePathParts('GET', mapped, true)).toBe('safe');
    const top = defineRoute({ method: 'GET', path: '/api/v1/files/*path', scope: 'kit', kit: 'files', index: 1 });
    expect(build(top, { params: { path: mapped } })).toMatchObject({ url: '/api/v1/files/safe' });
    let r2 = 0;
    const t2: string[] = [];
    Object.defineProperty(t2, 0, { get: () => (r2++ === 0 ? 'safe' : '..'), enumerable: true });
    expect(filesUrl('https://files.example', t2)).toBe('https://files.example/api/v1/files/safe');
  });

  it('a list longer than the bound is refused before it is read', () => {
    let reads = 0;
    const huge = new Proxy(['a'], { get: (t, k) => (k === 'length' ? MAX_PATH_BYTES + 1 : (reads++, Reflect.get(t, k))) });
    expect(pathPartsProblem(huge)).toBe('too_long');
    expect(reads).toBe(0);
  });

  it('refused parts give null', () => {
    expect(encodePathParts('GET', ['a', '..'], true)).toBeNull();
    expect(encodePathParts('GET', ['\\x'], true)).toBeNull();
  });
});

describe('deep routes (*path)', () => {
  it('declares only as the last segment of a kit route, labelled {name+}', () => {
    expect(() => defineRoute({ method: 'GET', path: '/api/v1/files/*path/x', scope: 'kit', kit: 'files', index: 1 })).toThrow();
    expect(() => defineRoute({ method: 'GET', path: '/x/*path', scope: 'agent' })).toThrow();
    expect(() => defineRoute({ method: 'GET', path: '/x/*p/*q', scope: 'kit', kit: 'files', index: 1 })).toThrow();
    // A bare /*path would build '/' for no parts, which its pattern cannot match: a fixed prefix is required.
    expect(() => defineRoute({ method: 'GET', path: '/*path', scope: 'kit', kit: 'files', index: 1 })).toThrow();
    const r = defineRoute({ method: 'GET', path: '/api/v1/files/*path', scope: 'kit', kit: 'files', index: 1 });
    expect(r.params).toEqual(['path']);
    expect(r.deep).toBe('path');
    expect(routeLabel(r.method, r.path)).toBe('GET /api/v1/files/{path+}');
    expect(r.pattern.test('/api/v1/files')).toBe(true);
    expect(r.pattern.test('/api/v1/files/a/b/c')).toBe(true);
  });

  it('builds any depth, escapes an alias name only right after /api/v1/files, and refuses what cannot be addressed', () => {
    const top = defineRoute({ method: 'DELETE', path: '/api/v1/files/*path', scope: 'kit', kit: 'files', index: 1 });
    const glob = defineRoute({ method: 'GET', path: '/api/v1/files/glob/*path', scope: 'kit', kit: 'files', index: 1, query: ['pattern'] });
    const deep = Array.from({ length: 60 }, (_, i) => 'd' + i);
    expect(build(top, { params: { path: deep } })).toMatchObject({ url: '/api/v1/files/' + deep.join('/') });
    expect(build(top, { params: { path: ['move', '50%'] } })).toMatchObject({ url: '/api/v1/files/%6Dove/50%25' });
    expect(build(glob, { params: { path: ['stat'] }, query: { pattern: '*' } })).toMatchObject({ url: '/api/v1/files/glob/stat?pattern=*' });
    expect(build(top, { params: { path: [] } })).toMatchObject({ url: '/api/v1/files' });
    for (const bad of [['a', '..'], ['\\a'], ['a/b'], [''], 'a/b', undefined]) expect(build(top, { params: bad === undefined ? {} : { path: bad as string[] } })).toEqual({ refused: 'ROUTE_PARAMS' });
    expect(build(top, { params: { path: ['x'.repeat(MAX_PATH_BYTES + 1)] } })).toEqual({ refused: 'ROUTE_PARAMS' });
  });

  it('a name holding % or a backslash passes the kit path check on a deep route only', () => {
    expect(pathOk('/api/v1/files/50%25/a%5Cb', true)).toBe(true);
    expect(pathOk('/api/v1/files/50%25', false)).toBe(false);
    expect(pathOk('/api/v1/files/a%2Fb', true)).toBe(false);
    expect(pathOk('/api/v1/files/%2e%2e/x', true)).toBe(false);
    expect(pathOk('/api/v1/files//x', true)).toBe(false);
  });

  it('end to end: the request leaves for the files program with the encoded path', async () => {
    boot({ realm: R1 });
    const r = defineRoute({ method: 'GET', path: '/api/v1/files/*path', scope: 'kit', kit: 'files', index: 1 });
    await api(r, { params: { path: ['grep', '100% done', 'a\\b'] } });
    expect(calls.map((c) => c.url)).toEqual([`https://p1-c1-files-1.sv1.${PROXY}/api/v1/files/%67rep/100%25%20done/a%5Cb`]);
  });
});

describe('filesUrl, partsOfPath, lossyName', () => {
  it('builds a direct link under an https base only, with the same encoding', () => {
    expect(filesUrl('https://files.example/', ['glob', 'a b'], { zip: '' })).toBe('https://files.example/api/v1/files/%67lob/a%20b?zip=');
    expect(filesUrl('https://files.example', ['x'], 'zip')).toBe('https://files.example/api/v1/files/x?zip');
    expect(filesUrl('https://files.example', [])).toBe('https://files.example/api/v1/files');
    expect(filesUrl('http://files.example', ['x'])).toBe('');
    expect(filesUrl('https://files.example', ['..'])).toBe('');
  });
  it('splits an absolute path into parts', () => {
    expect(partsOfPath('/home//me/')).toEqual(['home', 'me']);
    expect(partsOfPath('/')).toEqual([]);
    expect(partsOfPath('home')).toBeNull();
  });
  it('a name holding U+FFFD is lossy (actions off)', () => {
    expect(lossyName('caf�')).toBe(true);
    expect(lossyName('café')).toBe(false);
  });
});

describe('protectedPath: judged on the resolved path', () => {
  it.each([
    ['/', true],
    ['/etc', true],
    ['/etc/nginx/nginx.conf', true],
    ['/lib', true],
    ['/lib64/x', true],
    ['/libx32', true],
    ['/usr/local/bin', true],
    ['/var/lib/x', true],
    ['/hoody', true],
    ['/hoody/storage/x', true],
    ['/run/user', true],
    ['/home/me', false],
    ['/root/project', false],
    ['/etcetera', false],
    ['/opt/app', false],
    ['/tmp/x', false],
    ['relative/etc', true],
    ['/home/../etc', true],
    ['/home//me', true],
    ['/home/me/', true],
    ['/home/./me', true],
    ['/home/a\u0000b', true],
    ['/etc\u0000/passwd', true],
    ['', true],
  ])('%s → %s', (p, want) => {
    expect(protectedPath(p)).toBe(want);
  });
  it('the contents of a listed mount are exempt; the mountpoint itself is not', () => {
    const mounts = ['/run/hoody-files/vfs/s3-photos', '/hoody/mounts/permanent/pc-docs/'];
    expect(protectedPath('/run/hoody-files/vfs/s3-photos/2024/a.jpg', mounts)).toBe(false);
    expect(protectedPath('/hoody/mounts/permanent/pc-docs/notes.txt', mounts)).toBe(false);
    expect(protectedPath('/run/hoody-files/vfs/s3-photos', mounts)).toBe(true);
    expect(protectedPath('/run/hoody-files/vfs/other/a', mounts)).toBe(true);
    expect(protectedPath('/run/hoody-files/vfs/s3-photos-2/a', mounts)).toBe(true);
  });
  it('an unclean path inside a listed mount is still protected; an unclean mount exempts nothing', () => {
    expect(protectedPath('/etc//passwd', ['/etc'])).toBe(true);
    expect(protectedPath('/run/m//x', ['/run/m'])).toBe(true);
    expect(protectedPath('/run/m/a\u0000b', ['/run/m'])).toBe(true);
    expect(protectedPath('/run/m/x/', ['/run/m'])).toBe(true);
    expect(protectedPath('/run/m/x', ['/run/m/'])).toBe(false);
    expect(protectedPath('/run/m/x', ['/run//m'])).toBe(true);
    expect(protectedPath('/run/m/x', ['/run/./m'])).toBe(true);
    expect(protectedPath('/etc/x', ['/run/../etc'])).toBe(true);
  });
  it('a mount listed as the root (or a spelling of it) exempts nothing', () => {
    for (const root of ['/', '//', '/./']) {
      expect(protectedPath('/etc/passwd', [root])).toBe(true);
      expect(protectedPath('/usr/bin/env', [root])).toBe(true);
    }
  });
});
