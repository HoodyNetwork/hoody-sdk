// The path detector, as a table of what is a path (with its target) and what stays text. False
// finds are worse than misses: every negative here is text people write.
import { describe, expect, it } from 'vitest';
import { inline, parseMd, plain, type Inline } from './md';
import { pathAt, wholePath } from './paths';

/** The targets inline() finds in one line of prose. */
const found = (s: string): string[] => {
  const out: string[] = [];
  const walk = (c: readonly Inline[]): void => {
    for (const x of c) {
      if (x.k === 'path') out.push(x.target);
      else if (x.k === 'b' || x.k === 'i' || x.k === 'a' || x.k === 'blocked') walk(x.c);
    }
  };
  walk(inline(s));
  return out;
};

const POSITIVE: ReadonlyArray<readonly [string, string]> = [
  ['see /etc/nginx/nginx.conf for it', '/etc/nginx/nginx.conf'],
  ['/home/ada/app', '/home/ada/app'],
  ['the folder /srv/www/ is empty', '/srv/www/'],
  ['edit ~/.bashrc and reload', '~/.bashrc'],
  ['under ~/projects/shop.', '~/projects/shop'],
  ['It failed at /app/src/main.ts:42.', '/app/src/main.ts:42'],
  ['look at /app/src/main.ts:42:7, then', '/app/src/main.ts:42:7'],
  ['(in /var/log/syslog)', '/var/log/syslog'],
  ['"/opt/tool/bin"', '/opt/tool/bin'],
  ['logs: /var/log/app-1.log; done', '/var/log/app-1.log'],
  ['run /usr/local/bin/node_v20+x?', '/usr/local/bin/node_v20+x'],
  ['two: /a/one and /b/two', '/a/one'],
];

const NEGATIVE: readonly string[] = [
  'just /',
  'single /tmp only',
  'and/or',
  'half is 1/2 of it',
  'speed in km/h',
  'on /10/2024 we shipped',
  'https://example.com/a/b',
  'file:///etc/passwd',
  'mail me@example.com/x',
  'www.example.com/a/b',
  'a//b',
  '/a//b',
  '/a/../etc',
  '/./a/b',
  '~/',
  '~',
  'x~/a/b',
  'path:/etc/hosts',
  'see the a/b/c test',
  // A character no part takes, a cut:line:col, and emphasis glued to a word or address.
  '/home/ada/文書',
  '/a/b#frag',
  'at /a/b:12:345678 now',
  'at /a/b:12345678 now',
  'me@example.com**/a/b**',
  'word*/a/b*',
  '**/a/b**tail',
  // Text glued after a:line suffix, and a markdown mark glued to a path.
  'at /a/b:12文 now',
  'at /a/b:12-foo now',
  'see /a/b**c** now',
  'see **/a/b:12**:345678 now',
];

describe('pathAt / inline: a table of paths', () => {
  for (const [text, target] of POSITIVE) {
    it(`finds ${target} in ${JSON.stringify(text)}`, () => {
      expect(found(text)[0]).toBe(target);
    });
  }
  it('emphasis around a path set apart by spaces keeps it a path', () => {
    expect(found('see **/etc/hosts** now')).toEqual(['/etc/hosts']);
    expect(found('see */etc/hosts*.')).toEqual(['/etc/hosts']);
  });
  it('finds every path in a line', () => {
    expect(found('two: /a/one and /b/two')).toEqual(['/a/one', '/b/two']);
  });
  for (const text of NEGATIVE) {
    it(`finds nothing in ${JSON.stringify(text)}`, () => {
      expect(found(text)).toEqual([]);
    });
  }
});

describe('the target', () => {
  it('keeps :line and :line:col, and splits them out', () => {
    expect(pathAt('/a/b.ts:12:5', 0)).toMatchObject({ target: '/a/b.ts:12:5', path: '/a/b.ts', line: 12, col: 5 });
    expect(pathAt('/a/b.ts:12', 0)).toMatchObject({ target: '/a/b.ts:12', path: '/a/b.ts', line: 12 });
    expect(pathAt('/a/b.ts:12', 0)?.col).toBeUndefined();
  });
  it('a colon not followed by a line number is not part of it', () => {
    expect(pathAt('/a/b.ts:x', 0)?.target).toBe('/a/b.ts');
  });
  it('a colon and digits that make no whole :line[:col] leave the whole text (no partial target)', () => {
    expect(pathAt('/a/b:12abc', 0)).toBeNull();
    expect(pathAt('/a/b:12:345678', 0)).toBeNull();
    expect(pathAt('/a/b:12:', 0)?.target).toBe('/a/b:12');
    expect(pathAt('/a/b.c:12: error', 0)?.target).toBe('/a/b.c:12');
  });
  it('a character no part takes, right after it, leaves the whole text (no partial prefix)', () => {
    expect(pathAt('/home/ada/文書', 0)).toBeNull();
    expect(pathAt('/a/b|grep', 0)).toBeNull();
  });
  it('inside emphasis, the characters around the emphasis count', () => {
    expect(pathAt('/a/b', 0, { before: 'm' })).toBeNull();
    expect(pathAt('/a/b', 0, { after: 't' })).toBeNull();
    expect(pathAt('/a/b', 0, { before: ' ', after: '.' })?.target).toBe('/a/b');
    expect(pathAt('/a/b:12', 0, { before: ' ', after: ':345678' })).toBeNull();
    expect(pathAt('/a/b:12', 0, { before: ' ', after: ' now' })?.target).toBe('/a/b:12');
  });
  it('a path longer than its bound is text', () => {
    expect(pathAt('/a/' + 'b'.repeat(1100), 0)).toBeNull();
  });
});

describe('inline code', () => {
  it('a code span that is wholly one path is a path, drawn as code', () => {
    const c = inline('open `/etc/hosts` now');
    expect(c.find((x) => x.k === 'path')).toMatchObject({ k: 'path', target: '/etc/hosts', code: true });
    expect(wholePath('/etc/hosts:3')?.line).toBe(3);
  });
  it('a code span that holds more than a path stays code (v1)', () => {
    expect(inline('`cat /etc/hosts`').map((x) => x.k)).toEqual(['code']);
  });
});

describe('where paths are not', () => {
  it('a fenced block keeps its text (out of v1)', () => {
    const b = parseMd('```\n/etc/hosts here\n```');
    expect(b.map((x) => x.k)).toEqual(['code']);
    expect(JSON.stringify(b)).not.toContain('"k":"path"');
  });
  it('a link label never holds one: the link is the one action', () => {
    const c = inline('[see /etc/hosts](https://example.com/x)');
    expect(c[0]?.k).toBe('a');
    expect(JSON.stringify(c)).not.toContain('"k":"path"');
    expect(plain(c)).toBe('see /etc/hosts');
  });
  it('plain text keeps the path as written', () => {
    expect(plain(inline('at /a/b.ts:3.'))).toBe('at /a/b.ts:3.');
  });
});
