// The read-only actions' pure rules (ro.ts) and requests (ro.routes.ts).
import { describe, expect, it } from 'vitest';
import { fixtureWorld } from '@core';
import { FIND_CAP, fileLink, findQuery, foundOf, imageDataUrl, previewKind, textOf } from './ro';
import * as roRoutes from './ro.routes';
import { previewProblem } from './ro.data';

const W = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const C = { id: W.id, project_id: W.project_id, server_name: W.server?.name ?? W.server_name ?? '' };

describe('fileLink', () => {
  it('builds plain links to the computer\'s own files program, without a token', () => {
    const d = fileLink(C, '/home/ada/notes.txt', 'download');
    expect(d).toMatch(/^https:\/\/[^?#]+\/api\/v1\/files\/home\/ada\/notes\.txt\?download=1$/);
    expect(d).not.toMatch(/token|key=|auth/i);
    expect(fileLink(C, '/home/ada/notes.txt', 'view')).toMatch(/\/home\/ada\/notes\.txt\?view$/);
    expect(fileLink(C, '/home/ada/notes.txt', 'edit')).toMatch(/\/home\/ada\/notes\.txt\?edit$/);
    // download=1 as well: a file that replaced the folder since the listing is saved, never served inline.
    expect(fileLink(C, '/srv/app', 'zip')).toMatch(/\/api\/v1\/files\/srv\/app\?zip&download=1$/);
  });
  it('encodes each part, so a name cannot add a query or a path', () => {
    expect(fileLink(C, '/home/a b/x?y#z&q=1', 'download')).toMatch(/\/api\/v1\/files\/home\/a%20b\/x%3Fy%23z%26q%3D1\?download=1$/);
  });
  it('refuses what core cannot send and the program\'s own first parts, but no depth limit', () => {
    expect(fileLink(C, '/home/50%off.txt', 'download')).toBe('');
    expect(fileLink(C, '/home/a\\b', 'view')).toBe('');
    expect(fileLink(C, '/home/bell\u0007.txt', 'view')).toBe('');
    expect(fileLink(C, '/__hoody' + '-files__/openapi.json', 'view')).toBe('');
    expect(fileLink(C, '/hoody-files-assets_v1.2.3/index.js', 'edit')).toBe('');
    expect(fileLink(C, '/srv/a/b/c/d/e/f/g/h/i.txt', 'download')).not.toBe('');
  });
  it('gives no link where the program would read something else, or the name is not exact', () => {
    expect(fileLink(C, '/', 'zip')).toBe('');
    expect(fileLink(C, '/', 'download')).toBe('');
    expect(fileLink(C, '/stat/x', 'zip')).toBe('');
    expect(fileLink(C, '/stat/x', 'download')).toBe('');
    expect(fileLink(C, '/stat/x', 'view')).not.toBe('');
    expect(fileLink(C, '/api/v1/files', 'view')).toBe('');
    expect(fileLink(C, '/api/v1/files', 'download')).not.toBe('');
    expect(fileLink(C, '/home/caf�', 'download')).toBe('');
    expect(fileLink({ ...C, server_name: '' }, '/home/ada/notes.txt', 'download')).toBe('');
  });
});

describe('previews', () => {
  it('picks images by name and everything else as text', () => {
    expect(previewKind('photo-001.JPG')).toBe('image');
    expect(previewKind('a.webp')).toBe('image');
    expect(previewKind('logo.svg')).toBe('text');
    expect(previewKind('.png')).toBe('text');
    expect(previewKind('README.md')).toBe('text');
  });
  it('shows only PNG, JPEG, GIF and WebP bytes as a data: image', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    expect(imageDataUrl(png)).toMatch(/^data:image\/png;base64,/);
    expect(imageDataUrl(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toMatch(/^data:image\/jpeg;base64,/);
    expect(imageDataUrl(new Uint8Array([...'GIF89a'].map((c) => c.charCodeAt(0))))).toMatch(/^data:image\/gif;/);
    expect(imageDataUrl(new Uint8Array([...'RIFF\0\0\0\0WEBPVP8 '].map((c) => c.charCodeAt(0))))).toMatch(/^data:image\/webp;/);
    expect(imageDataUrl(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(imageDataUrl(new TextEncoder().encode('{"error":"x"}'))).toBeNull();
    expect(imageDataUrl(new Uint8Array([...'RIFF\0\0\0\0WAVE'].map((c) => c.charCodeAt(0))))).toBeNull();
  });
  it('round-trips a large image through base64', () => {
    const big = new Uint8Array(100_000).map((_, i) => i % 251);
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const url = imageDataUrl(big)!;
    expect(atob(url.split(',')[1]!).length).toBe(big.length);
  });
  it('writes control characters escaped, keeps tabs and line ends, and refuses NUL as not text', () => {
    expect(textOf(new TextEncoder().encode('a\tb\r\nc\u001b[31md\u0007'))).toBe('a\tb\nc\\x1B[31md\\x07');
    expect(textOf(new Uint8Array([0x61, 0x00, 0x62]))).toBeNull();
    expect(textOf(new TextEncoder().encode('\u0085x'))).toBe('\\x85x');
    expect(textOf(new TextEncoder().encode('a\u202eb\u200bc\ufeff\u061c'))).toBe('a\\u202Eb\\u200Bc\\uFEFF\\u061C');
    // A leading BOM is written out too, not dropped by the decoder.
    expect(textOf(new TextEncoder().encode('\ufeffhello'))).toBe('\\uFEFFhello');
  });
  it('reads a failed preview as one plain state', () => {
    expect(previewProblem({ kind: 'too_large', status: 200 }, false).kind).toBe('big');
    expect(previewProblem({ kind: 'refused', status: 404 }, true).kind).toBe('gone');
    expect(previewProblem({ kind: 'private', status: 403 }, true).kind).toBe('off');
    // A 403 on text is no "thumbnails off": the cause is not named.
    expect(previewProblem({ kind: 'private', status: 403 }, false).kind).toBe('failed');
    expect(previewProblem({ kind: 'unavailable', status: 502 }, true).kind).toBe('failed');
  });
});

describe('find', () => {
  it('sends what the program accepts, trimmed', () => {
    expect(findQuery('  notes ')).toBe('notes');
    expect(findQuery('')).toBeNull();
    expect(findQuery(' / ')).toBeNull();
    expect(findQuery('\\')).toBeNull();
    expect(findQuery('a'.repeat(512))).toBe('a'.repeat(512));
    expect(findQuery('a'.repeat(513))).toBeNull();
    // U+023E is 2 bytes and lowercases to 3: 256 of them pass raw (512) but not lowercased (768).
    expect(findQuery('Ⱦ'.repeat(256))).toBeNull();
  });
  it('reads matches below the folder with their full paths', () => {
    const got = foundOf({ path: '/home', count: 2, entries: [
      { name: '/home/ada/notes.txt', is_dir: false, size: 12, modified: 10 },
      { name: '/home/ada/projects', is_dir: true, size: 0, modified: null },
    ] }, '/home')!;
    expect(got.capped).toBe(false);
    expect(got.items).toEqual([
      { path: '/home/ada/notes.txt', name: 'ada/notes.txt', dir: false, size: 12, modified: 10_000, lossy: false },
      { path: '/home/ada/projects', name: 'ada/projects', dir: true, size: null, modified: null, lossy: false },
    ]);
  });
  it('makes the whole answer unreadable for one bad or out-of-folder entry, never a shorter list', () => {
    const at = (entries: unknown[]) => ({ path: '/home', entries });
    expect(foundOf(at([{ name: '/home/a', is_dir: 'no', size: 1 }]), '/home')).toBeNull();
    expect(foundOf(at([{ name: '/etc/passwd', is_dir: false, size: 1 }]), '/home')).toBeNull();
    expect(foundOf(at([{ name: '/homeless/x', is_dir: false, size: 1 }]), '/home')).toBeNull();
    expect(foundOf(at([{ name: '/home', is_dir: true, size: 0 }]), '/home')).toBeNull();
    // A path that leaves the folder by `..`, a `.` part, or a relative name is no answer to this search.
    expect(foundOf(at([{ name: '/home/../etc/passwd', is_dir: false, size: 1 }]), '/home')).toBeNull();
    expect(foundOf(at([{ name: '/home/./a', is_dir: false, size: 1 }]), '/home')).toBeNull();
    expect(foundOf(at([{ name: 'home/a', is_dir: false, size: 1 }]), '/home')).toBeNull();
    // Another folder's answer, even an empty one, and an answer naming no folder.
    expect(foundOf({ path: '/elsewhere', entries: [] }, '/home')).toBeNull();
    expect(foundOf({ entries: [] }, '/home')).toBeNull();
    expect(foundOf({ path: '/home/', entries: [] }, '/home')).toEqual({ items: [], capped: false });
    expect(foundOf({ path: '/home' }, '/home')).toBeNull();
    expect(foundOf(null, '/home')).toBeNull();
  });
  it('says when the program stopped at its limit, and marks inexact names', () => {
    const entries = Array.from({ length: FIND_CAP }, (_, i) => ({ name: `/srv/f${i}`, is_dir: false, size: 1 }));
    expect(foundOf({ path: '/srv', entries }, '/srv')!.capped).toBe(true);
    expect(foundOf({ path: '/srv', entries: [{ name: '/srv/caf�', is_dir: false, size: 1 }] }, '/srv')!.items[0]!.lossy).toBe(true);
  });
});

// The files program's openapi.json: getFile on /api/v1/files/{path} documents ?thumbnail (+size), ?lines and ?q.
describe('read-only routes', () => {
  type R = { method: string; path: string; query: readonly string[]; maxBytes?: number };
  const all = Object.values(roRoutes).flatMap((v): unknown[] => (Array.isArray(v) ? v : [v])).filter((v): v is R => typeof v === 'object' && v !== null && 'path' in v);
  it('declares only documented reads of getFile, one part deep or more', () => {
    expect(all.length).toBe(3 * 8);
    for (const r of all) {
      expect(r.method).toBe('GET');
      expect(r.path).toMatch(/^\/api\/v1\/files(\/:p\d+)+$/);
      expect([['thumbnail', 'size'], ['lines'], ['q']]).toContainEqual([...r.query]);
    }
  });
  it('bounds a search answer', () => {
    for (const r of roRoutes.findRoutes) expect(r.maxBytes).toBe(roRoutes.FIND_BYTES);
  });
});
