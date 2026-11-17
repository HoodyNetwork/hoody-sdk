// Vitest: the route reader against hoody-exec's own rules (dynamic directory index, required
// and optional catch-all index, static index, dotted segments) and the words built from it.
import { describe, expect, it } from 'vitest';
import { describeFile, fileMatcher, parseFile } from './routePattern';
import { aliasesFor, friendlyName, routeTip, routeWords, toItems } from './logic';
import type { Alias } from './types';

const hit = (rel: string, url: string) => fileMatcher(rel)(url);
const info = (rel: string) => describeFile(rel) as NonNullable<ReturnType<typeof describeFile>>;

describe('parseFile', () => {
  it('reads each kind of part by prefix and suffix, as exec does, and sets the index file name aside', () => {
    expect(parseFile('a/[id]/[...rest]/[[...opt]].js')?.segs.map((s) => [s.kind, s.text])).toEqual([
      ['static', 'a'],
      ['param', 'id'],
      ['catchAll', 'rest'],
      ['optionalCatchAll', 'opt'],
    ]);
    expect(parseFile('users/[id]/index.ts')).toMatchObject({ index: true, served: true });
    expect(parseFile('users/[id].ts')).toMatchObject({ index: false, served: true });
    expect(parseFile('index.ts')).toMatchObject({ index: true, segs: [] });
  });
  it('is null for anything that is not a script file path', () => {
    for (const v of [undefined, '', 'a/b', 'a//b.ts', 'notes.md', 7]) expect(parseFile(v)).toBeNull();
  });
  it('reads a file named only by its extension as its folder (exec drops the empty part)', () => {
    expect(parseFile('docs/.ts')).toMatchObject({ segs: [{ kind: 'static', text: 'docs' }], index: false, served: true });
    expect(parseFile('a/b/.js')?.segs.map((s) => s.text)).toEqual(['a', 'b']);
    // A folder named index above the empty file name is a folder: exec only descends into it for /docs/index.
    expect(parseFile('docs/index/.ts')).toMatchObject({ index: false, served: true, segs: [{ kind: 'static', text: 'docs' }, { kind: 'static', text: 'index' }] });
    expect(parseFile('users/[id]/.ts')?.segs.map((s) => s.kind)).toEqual(['static', 'param']);
    expect(parseFile('a//.ts')).toBeNull();
    expect(parseFile('.ts')).toMatchObject({ segs: [], index: false, served: true });
    expect(parseFile('.js')).toMatchObject({ segs: [], served: true });
  });
  it('reads pre and post from the file name only: pre/.ts is a route of the folder pre', () => {
    expect(parseFile('pre/.ts')).toMatchObject({ served: true, segs: [{ kind: 'static', text: 'pre' }] });
    expect(parseFile('docs/post/.js')).toMatchObject({ served: true });
    expect(parseFile('pre/post.ts')).toMatchObject({ served: false, why: 'middleware' });
  });
  it('keeps empty names as exec does: [] is a part, [...] and [[...]] are catch-alls', () => {
    expect(parseFile('[].ts')?.segs).toEqual([{ kind: 'param', text: '' }]);
    expect(parseFile('[...].ts')?.segs).toEqual([{ kind: 'catchAll', text: '' }]);
    expect(parseFile('[[...]].ts')?.segs).toEqual([{ kind: 'optionalCatchAll', text: '' }]);
  });
  it('does not serve a catch-all that is not last, or a pre/post file', () => {
    expect(parseFile('solo/[...slug]/edit.ts')).toMatchObject({ served: false, why: 'catchAll' });
    expect(parseFile('a/[[...x]]/b/c.ts')).toMatchObject({ served: false, why: 'catchAll' });
    expect(parseFile('docs/[...slug]/index.ts')).toMatchObject({ served: true });
    expect(parseFile('api/pre.ts')).toMatchObject({ served: false, why: 'middleware' });
    expect(parseFile('post.js')).toMatchObject({ served: false, why: 'middleware' });
  });
});

describe('describeFile', () => {
  it.each([
    ['index.ts', 'static', '/'],
    ['users/index.ts', 'static', '/users'],
    ['lib.js/api.ts', 'static', '/lib.js/api'],
    ['docs/.ts', 'static', '/docs'],
    ['users/[id]/.js', 'param', '/users/:id'],
    ['users/[id].ts', 'param', '/users/:id'],
    ['users/[id]/index.ts', 'param', '/users/:id'],
    ['users/[id]/edit.ts', 'param', '/users/:id/edit'],
    ['docs/[...slug]/index.ts', 'catchAll', '/docs/*'],
    ['cat/[...slug].ts', 'catchAll', '/cat/*'],
    ['opt/[[...slug]]/index.ts', 'optionalCatchAll', '/opt/*'],
    ['[[...path]].ts', 'optionalCatchAll', '/*'],
    ['[...path].ts', 'catchAll', '/*'],
    ['[].ts', 'param', '/:part'],
    ['[...].ts', 'catchAll', '/*'],
    ['[[...]].ts', 'optionalCatchAll', '/*'],
    ['org/[org]/[...rest].ts', 'catchAll', '/org/:org/*'],
  ])('%s is %s, shown as %s', (rel, kind, pattern) => {
    expect(info(rel)).toMatchObject({ kind, pattern });
  });
  it('says a file exec never routes to is not served, with no pattern', () => {
    expect(info('solo/[...slug]/edit.ts')).toMatchObject({ kind: 'unserved', pattern: '' });
    expect(info('pre.ts')).toMatchObject({ kind: 'unserved', pattern: '' });
  });
});

describe('fileMatcher agrees with hoody-exec', () => {
  it('dynamic directory index: /users/123 and /users/123/index answer users/[id]/index.ts', () => {
    expect(hit('users/[id]/index.ts', '/users/123')).toBe(true);
    expect(hit('users/[id]/index.ts', '/users/123/index')).toBe(true);
    expect(hit('users/[id]/index.ts', '/users')).toBe(false);
    expect(hit('users/[id]/index.ts', '/users/1/2')).toBe(false);
  });
  it('/index is the index file only: an ordinary file answers its own address and nothing with /index after it', () => {
    expect(hit('users/[id].ts', '/users/7')).toBe(true);
    expect(hit('users/[id].ts', '/users/7/index')).toBe(false);
    expect(hit('hello.ts', '/hello/index')).toBe(false);
    expect(hit('hello.ts', '/hello')).toBe(true);
  });
  it('static directory index: /static and /static/index', () => {
    expect(hit('static/index.ts', '/static')).toBe(true);
    expect(hit('static/index.ts', '/static/index')).toBe(true);
    expect(hit('static/index.ts', '/static/x')).toBe(false);
    expect(hit('index.ts', '/')).toBe(true);
    expect(hit('index.ts', '/index')).toBe(true);
  });
  it('required catch-all: zero parts do not match, one and many do', () => {
    expect(hit('docs/[...slug]/index.ts', '/docs')).toBe(false);
    expect(hit('docs/[...slug]/index.ts', '/docs/a')).toBe(true);
    expect(hit('docs/[...slug]/index.ts', '/docs/a/b')).toBe(true);
    expect(hit('cat/[...slug].ts', '/cat')).toBe(false);
    expect(hit('cat/[...slug].ts', '/cat/a/b/c')).toBe(true);
  });
  it('optional catch-all: zero, one and many parts', () => {
    expect(hit('opt/[[...slug]]/index.ts', '/opt')).toBe(true);
    expect(hit('opt/[[...slug]]/index.ts', '/opt/a')).toBe(true);
    expect(hit('opt/[[...slug]]/index.ts', '/opt/a/b')).toBe(true);
    expect(hit('opt/[[...slug]]/index.ts', '/other')).toBe(false);
  });
  it('a root optional catch-all answers / and everything else; a root required one answers everything but /', () => {
    expect(hit('[[...path]].ts', '/')).toBe(true);
    expect(hit('[[...path]].ts', '/a/b')).toBe(true);
    expect(hit('[...path].ts', '/')).toBe(false);
    expect(hit('[...path].ts', '/a')).toBe(true);
  });
  it('dotted segments are names, not extensions: lib.js/api.ts answers /lib.js/api only', () => {
    expect(hit('lib.js/api.ts', '/lib.js/api')).toBe(true);
    expect(hit('lib.js/api.ts', '/lib/api')).toBe(false);
    expect(hit('lib.js/api.ts', '/libXjs/api')).toBe(false);
  });
  it('normalizes the address the way exec does: slashes, dot parts, a final .js or .ts, a query, encoded characters', () => {
    expect(hit('docs/[[...x]].ts', '/docs//a')).toBe(true);
    expect(hit('users/[id]/edit.ts', '/users/7/edit.ts')).toBe(true);
    expect(hit('users/[id]/edit.ts', '/users/7/edit.js')).toBe(true);
    expect(hit('users/[id]/edit.ts', '/users/7/x/../edit')).toBe(true);
    expect(hit('users/[id]/edit.ts', '/users/./7/edit/')).toBe(true);
    expect(hit('users/[id].ts', '/users/7?x=1')).toBe(true);
    expect(hit('users/[id].ts', '/users/7#top')).toBe(true);
    expect(hit('users/[id].ts', '/users/%37')).toBe(true);
    expect(hit('a.b/c.ts', '/aXb/c')).toBe(false);
  });
  it('refuses what exec answers 400 to: a character outside its list, a bad escape', () => {
    expect(hit('[id].ts', '/a b')).toBe(false);
    expect(hit('[id].ts', '/a%20b')).toBe(false);
    expect(hit('[id].ts', '/a%2')).toBe(false);
    expect(hit('[id].ts', '/a%3Fb')).toBe(false);
    expect(hit('[[...p]].ts', '/a:b')).toBe(false);
  });
  it('matches exec for empty names: [] is one part, [...] needs one, [[...]] needs none', () => {
    expect(hit('[].ts', '/abc')).toBe(true);
    expect(hit('[].ts', '/')).toBe(false);
    expect(hit('[...].ts', '/a/b')).toBe(true);
    expect(hit('[...].ts', '/')).toBe(false);
    expect(hit('[[...]].ts', '/')).toBe(true);
  });
  it('a .ts file in a folder answers the folder, with or without a trailing slash', () => {
    expect(hit('docs/.ts', '/docs/')).toBe(true);
    expect(hit('docs/.ts', '/docs')).toBe(true);
    expect(hit('docs/.ts', '/docs/x')).toBe(false);
    expect(hit('docs/.ts', '/docs/index')).toBe(false);
    expect(hit('docs/index/.ts', '/docs/index')).toBe(true);
    expect(hit('docs/index/.ts', '/docs')).toBe(false);
    expect(hit('docs/index/.ts', '/docs/')).toBe(false);
    expect(hit('docs/index/.ts', '/docs/index/index')).toBe(false);
    expect(hit('docs/index.ts', '/docs')).toBe(true);
    expect(hit('.ts', '/')).toBe(true);
    expect(hit('.ts', '/index')).toBe(false);
    expect(hit('.ts', '/a')).toBe(false);
    expect(hit('pre/.ts', '/pre')).toBe(true);
  });
  it('matches nothing for a file exec does not route to', () => {
    expect(hit('solo/[...slug]/edit.ts', '/solo/a/edit')).toBe(false);
    expect(hit('pre.ts', '/pre')).toBe(false);
  });
});

const alias = (target_path: string): Alias => ({ id: target_path, target_path, program: 'exec', index: 1 }) as unknown as Alias;
const R = (rel: string) => `default/1/${rel}`;

describe('aliasesFor: a link belongs to the file exec answers it with', () => {
  it('users/[id].ts does not own a link to /users/7/index (that is users/[id]/index.ts)', () => {
    const rows = [alias('/users/7/index'), alias('/users/7')];
    expect(aliasesFor(rows, R('users/[id].ts')).map((a) => a.target_path)).toEqual(['/users/7']);
    expect(aliasesFor(rows, R('users/[id]/index.ts')).map((a) => a.target_path).sort()).toEqual(['/users/7', '/users/7/index']);
  });
  it('a double slash or a final .ts still belongs to its file, as before', () => {
    expect(aliasesFor([alias('/docs//a')], R('docs/[[...x]].ts')).length).toBe(1);
    expect(aliasesFor([alias('/users/7/edit.ts')], R('users/[id]/edit.ts')).length).toBe(1);
    expect(aliasesFor([alias('/hello.ts?x=1')], R('hello.ts')).length).toBe(1);
  });
  it('docs/index/.ts owns the link to /docs/index and not to /docs', () => {
    expect(aliasesFor([alias('/docs'), alias('/docs/'), alias('/docs/index')], R('docs/index/.ts')).map((a) => a.target_path)).toEqual(['/docs/index']);
  });
  it('an extension-only file owns the link to its folder', () => {
    expect(aliasesFor([alias('/docs/'), alias('/docs'), alias('/other')], R('docs/.ts')).map((a) => a.target_path)).toEqual(['/docs/', '/docs']);
    expect(aliasesFor([alias('/docs/')], R('docs/.js')).length).toBe(1);
  });
  it('keeps a static file to its own address, a root catch-all to everything and an unserved file to nothing', () => {
    expect(aliasesFor([alias('/hello'), alias('/other')], R('hello.ts')).map((a) => a.target_path)).toEqual(['/hello']);
    expect(aliasesFor([alias('/'), alias('/a/b')], R('[[...path]].ts')).length).toBe(2);
    expect(aliasesFor([alias('/solo/a/edit')], R('solo/[...slug]/edit.ts')).length).toBe(0);
  });
});

describe('the words for a route file', () => {
  const name = (rel: string) => friendlyName({ path: R(rel) });
  it.each([
    ['[[...path]].ts', 'Every other address'],
    ['[...path].ts', 'Every address except the home address'],
    ['shop/[[...rest]].ts', 'Every address under /shop'],
    ['docs/[...slug]/index.ts', 'Every address below /docs (one or more parts)'],
    ['users/[id].ts', 'Users by id'],
    ['users/[id]/index.ts', 'Users by id'],
    ['[sku].ts', 'Any one-part address (sku)'],
    ['[].ts', 'Any one-part address (part)'],
    ['org/[org]/[id].ts', 'Address /org/:org/:id'],
    ['users/[id]/edit.ts', 'Address /users/:id/edit'],
    ['org/[org]/[...rest].ts', 'Every address below /org/:org (one or more parts)'],
  ])('%s is called %s', (rel, said) => {
    expect(name(rel)).toBe(said);
  });
  it('tells files with the same parent apart (the suffix is kept)', () => {
    expect(name('users/[id].ts')).not.toBe(name('users/[id]/edit.ts'));
  });
  it('leaves static files and labelled ones as they were; a file exec does not serve is named by its file', () => {
    expect(name('daily-digest.ts')).toBe('Daily digest');
    expect(name('webhooks/stripe.ts')).toBe('Stripe');
    expect(friendlyName({ path: R('[[...path]].ts'), magicComments: { label: 'Fallback' } })).toBe('Fallback');
    expect(name('solo/[...slug]/edit.ts')).toBe('Edit');
    expect(name('docs/.ts')).toBe('Docs');
    expect(name('.ts')).toBe('Home address');
    expect(name('.js')).toBe('Home address');
    expect(name('docs/index/.ts')).toBe('Docs');
    expect(name('index.ts')).toBe('Index');
    expect(name('docs/index.ts')).toBe('Docs');
  });
  it('words the tooltip for every special part, and says why a file is not served', () => {
    expect(routeTip(info('org/[org]/[...rest].ts'), R('org/[org]/[...rest].ts'))).toBe(
      'From the file org/[org]/[...rest].ts. org stands for one part of the address. rest stands for one or more parts of the address.',
    );
    expect(routeTip(info('hello.ts'), R('hello.ts'))).toBe('From the file hello.ts.');
    expect(routeTip(info('[].ts'), R('[].ts'))).toContain('This part stands for one part');
    expect(routeTip(info('solo/[...slug]/edit.ts'), R('solo/[...slug]/edit.ts'))).toContain('Not served');
    expect(routeTip(info('api/pre.ts'), R('api/pre.ts'))).toContain('runs around another script');
  });
  it('routeWords is null where the file name already says it', () => {
    expect(routeWords(info('hello.ts'))).toBeNull();
    expect(routeWords(info('pre.ts'))).toBeNull();
  });
});

describe('toItems for files with no address', () => {
  const comp = (rows: unknown[]) => [{ id: 'c1', name: 'atlas', handle: 'a.1', state: 'on', err: null, caps: null, summary: {}, instances: {}, rows } as never];
  const one = (path: string) => toItems(comp([{ path: R(path), isDirectory: false }]))[0];
  it('shows an extension-only file as its folder, and at the root as the home address', () => {
    expect(one('docs/.ts')).toMatchObject({ served: true, pattern: '/docs', dynamic: false });
    expect(one('.ts')).toMatchObject({ served: true, pattern: '/', dynamic: false, name: 'Home address' });
    expect(one('docs/index/.ts')).toMatchObject({ served: true, pattern: '/docs/index' });
  });
  it('a row that is not a script file never becomes an item', () => {
    const it0 = toItems(comp([{ path: 'default/1/notes.md', isDirectory: false }]));
    expect(it0.length).toBe(0);
  });
  it('flags a [part] as dynamic and nothing else', () => {
    expect(one('users/[id].ts')).toMatchObject({ served: true, dynamic: true });
    expect(one('hello.ts')).toMatchObject({ served: true, dynamic: false });
    expect(one('solo/[...slug]/edit.ts')).toMatchObject({ served: false, dynamic: false });
  });
});
