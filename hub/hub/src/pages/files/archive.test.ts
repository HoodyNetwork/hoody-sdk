// Vitest: archive.ts, the rules behind Look inside and Extract. Each rule has the case
// that fails it when the rule is loosened: the format gate, the folder name, the parsers and how a name is shown.
import { describe, expect, it } from 'vitest';
import { LIST_MAX, doneFor, entryLabel, extractFolderName, openableArchive, parseArchiveList, parseExtractDone, parseExtractFailed } from './archive';

describe('openableArchive: only what the files program opens', () => {
  it.each(['a.zip', 'a.ZIP', 'a.tar', 'a.tar.gz', 'a.TAR.GZ', 'a.tgz', 'a.tar.bz2', 'a.tbz', 'a.tbz2', 'a.tar.xz', 'a.txz', 'v1.2.tar.gz'])('opens %s', (n) => {
    expect(openableArchive(n)).toBe(true);
  });
  it.each(['notes.txt.gz', 'a.gz', 'a.bz2', 'a.xz', 'a.zst', 'a.tar.zst', 'a.7z', 'a.rar', 'zip', 'a.zip.txt', 'a.tar.gz.part'])('refuses %s', (n) => {
    expect(openableArchive(n)).toBe(false);
  });
});

describe('extractFolderName: a new folder, never one the listing shows', () => {
  it('strips the archive extension, the longest first', () => {
    expect(extractFolderName('site.tar.gz', [], '/home/ada')).toBe('site');
    expect(extractFolderName('site.tgz', [], '/home/ada')).toBe('site');
    expect(extractFolderName('Photos.ZIP', [], '/home/ada')).toBe('Photos');
    expect(extractFolderName('v1.2.tar.xz', [], '/home/ada')).toBe('v1.2');
  });
  it('takes the next free number when the name is taken', () => {
    expect(extractFolderName('site.zip', ['site'], '/x')).toBe('site (2)');
    expect(extractFolderName('site.zip', ['site', 'site (2)'], '/x')).toBe('site (3)');
  });
  it('gives up when none is free, or the name is one the program refuses', () => {
    const taken = ['site', ...Array.from({ length: 98 }, (_, i) => `site (${i + 2})`)];
    expect(extractFolderName('site.zip', taken, '/x')).toBeNull();
    expect(extractFolderName('a%b.zip', [], '/x')).toBeNull();
  });
});

const entry = (path: string, extra: Record<string, unknown> = {}) => ({ path, is_dir: path.endsWith('/'), entry_type: path.endsWith('/') ? 'directory' : 'file', size: 3, modified_time: 1700000000, ...extra });
describe('parseArchiveList', () => {
  const body = { format: 'zip', total_files: 3, total_size: 6, total_compressed_size: 4, entries: [entry('a/'), entry('a/b.txt'), entry('c.txt')] };
  it('reads a listing, times in ms, links and special files marked', () => {
    const l = parseArchiveList({ ...body, entries: [...body.entries, entry('l', { entry_type: 'symlink' }), entry('h', { entry_type: 'hardlink' }), entry('p', { entry_type: 'Fifo' })], total_files: 6 })!;
    expect(l.entries).toHaveLength(6);
    expect(l.entries[1]).toEqual({ path: 'a/b.txt', dir: false, link: false, special: false, size: 3, modified: 1700000000000 });
    expect(l.entries[3]).toMatchObject({ link: true, special: false });
    expect(l.entries[4]).toMatchObject({ link: true, special: false });
    expect(l.entries[5]).toMatchObject({ link: false, special: true });
  });
  it('takes a tar folder by its header, not its name, and counts the top folder without listing it', () => {
    const tar = { format: 'tar.gz', total_files: 3, total_size: 3, entries: [entry('', { is_dir: true, entry_type: 'directory' }), entry('dir', { is_dir: true, entry_type: 'directory' }), entry('dir/x')] };
    const l = parseArchiveList(tar)!;
    expect(l.entries.map((e) => [e.path, e.dir])).toEqual([['dir', true], ['dir/x', false]]);
    expect(parseArchiveList({ ...tar, total_files: 2 })).toBeNull();
  });
  it('refuses a malformed row, one field at a time', () => {
    const one = (e: Record<string, unknown>) => parseArchiveList({ ...body, entries: [e], total_files: 1 });
    expect(one(entry('x'))).not.toBeNull();
    expect(one({ ...entry('x'), path: 3 })).toBeNull();
    expect(one({ ...entry('x'), is_dir: 'no' })).toBeNull();
    expect(one({ ...entry('x'), size: -1 })).toBeNull();
    expect(one({ ...entry('x'), size: 1.5 })).toBeNull();
    expect(one({ ...entry('x'), entry_type: undefined })).toBeNull();
    expect(one({ ...entry('x'), entry_type: '' })).toBeNull();
    expect(one({ ...entry('x'), modified_time: 'then' })).toBeNull();
    expect(one(null as unknown as Record<string, unknown>)).toBeNull();
  });
  it('refuses a contradiction: entry_type and is_dir disagreeing, a file with no path, more entries than total_files', () => {
    expect(parseArchiveList({ ...body, entries: [{ ...entry('a/'), is_dir: false }] })).toBeNull();
    expect(parseArchiveList({ ...body, entries: [entry('dir', { is_dir: true })] })).toBeNull();
    expect(parseArchiveList({ ...body, entries: [entry('')] })).toBeNull();
    expect(parseArchiveList({ ...body, total_files: 2 })).toBeNull();
  });
  it('refuses a malformed body', () => {
    expect(parseArchiveList({ ...body, format: '7z' })).toBeNull();
    expect(parseArchiveList({ ...body, total_files: -1 })).toBeNull();
    expect(parseArchiveList({ ...body, total_size: '6' })).toBeNull();
    expect(parseArchiveList({ entries: [] })).toBeNull();
  });
});

describe('entryLabel: a name inside an archive cannot pass for another', () => {
  it('writes out direction controls and invisible characters, and controls as displayName does', () => {
    expect(entryLabel('report\u202Efdp.exe')).toBe('report\\u202efdp.exe');
    expect(entryLabel('a\u2066b\u2069\u200Bc\uFEFF\u00AD')).toBe('a\\u2066b\\u2069\\u200bc\\ufeff\\u00ad');
    expect(entryLabel('a\u061Cb\u200Fc\u200Ed')).toBe('a\\u061cb\\u200fc\\u200ed');
    expect(entryLabel('line\nbreak')).toBe('line\\x0abreak');
    expect(entryLabel('plain/naïve 文件.txt')).toBe('plain/naïve 文件.txt');
  });
  it('writes out every default-ignorable character, beyond the BMP too, by code point', () => {
    expect(entryLabel('report\u034F.pdf')).toBe('report\\u034f.pdf');
    expect(entryLabel('a\u{E0041}b')).toBe('a\\u{e0041}b');
    expect(entryLabel('x\uFE0Fy\u3164z')).toBe('x\\ufe0fy\\u3164z');
    expect(entryLabel('report\u034F.pdf')).not.toBe(entryLabel('report.pdf'));
  });
});

const done = { success: true, extracted_files: 3, extracted_bytes: 9, destination: '/home/ada/site', extraction_id: 'u1', skipped: [], skipped_count: 0, replaced: [], replaced_count: 0 };
const names = (n: number) => Array.from({ length: n }, (_, i) => `f${i}`);
const skips = (n: number) => names(n).map((path) => ({ path, reason: 'duplicate path in the archive' }));
describe('parseExtractDone', () => {
  it('reads the counts, replaced included; whole unless the answer says selective', () => {
    expect(parseExtractDone(done)).toEqual({ files: 3, bytes: 9, destination: '/home/ada/site', id: 'u1', skipped: 0, replaced: 0, whole: true });
    expect(parseExtractDone({ ...done, replaced: ['a', 'b'], replaced_count: 2 })!.replaced).toBe(2);
    expect(parseExtractDone({ ...done, extracted_files: 1_500, replaced: names(LIST_MAX), replaced_count: 1_200 })!.replaced).toBe(1_200);
    expect(parseExtractDone({ ...done, selective: true, selective_path: 'docs/' })!.whole).toBe(false);
  });
  it('accepts lists the program caps: below, at and above LIST_MAX, the counts kept whole', () => {
    expect(parseExtractDone({ ...done, extracted_files: 999, replaced: names(999), replaced_count: 999, skipped: skips(999), skipped_count: 999 })).toMatchObject({ replaced: 999, skipped: 999 });
    expect(parseExtractDone({ ...done, extracted_files: 2_000, replaced: names(LIST_MAX), replaced_count: LIST_MAX, skipped: skips(LIST_MAX), skipped_count: LIST_MAX })).toMatchObject({ replaced: LIST_MAX, skipped: LIST_MAX });
    expect(parseExtractDone({ ...done, extracted_files: 2_000, replaced: names(LIST_MAX), replaced_count: 1_200, skipped: skips(LIST_MAX), skipped_count: 1_500 })).toMatchObject({ replaced: 1_200, skipped: 1_500 });
  });
  it('refuses lists that disagree with their counts: shorter below the cap, other than the cap above it, longer', () => {
    expect(parseExtractDone({ ...done, replaced: ['a'], replaced_count: 0 })).toBeNull();
    expect(parseExtractDone({ ...done, replaced: names(998), replaced_count: 999 })).toBeNull();
    expect(parseExtractDone({ ...done, replaced: names(999), replaced_count: 1_200 })).toBeNull();
    expect(parseExtractDone({ ...done, replaced: names(LIST_MAX + 1), replaced_count: 1_200 })).toBeNull();
    expect(parseExtractDone({ ...done, skipped: skips(1), skipped_count: 0 })).toBeNull();
    expect(parseExtractDone({ ...done, skipped: skips(LIST_MAX - 1), skipped_count: 1_500 })).toBeNull();
  });
  it('refuses a malformed field, one at a time, and an item of the wrong shape', () => {
    expect(parseExtractDone({ ...done, success: 'yes' })).toBeNull();
    expect(parseExtractDone({ ...done, extracted_files: -1 })).toBeNull();
    expect(parseExtractDone({ ...done, extracted_bytes: 1.5 })).toBeNull();
    expect(parseExtractDone({ ...done, destination: undefined })).toBeNull();
    expect(parseExtractDone({ ...done, destination: '' })).toBeNull();
    expect(parseExtractDone({ ...done, extraction_id: undefined })).toBeNull();
    expect(parseExtractDone({ ...done, extraction_id: 7 })).toBeNull();
    expect(parseExtractDone({ ...done, replaced: undefined })).toBeNull();
    expect(parseExtractDone({ ...done, replaced_count: '0' })).toBeNull();
    expect(parseExtractDone({ ...done, skipped: undefined })).toBeNull();
    expect(parseExtractDone({ ...done, skipped_count: null })).toBeNull();
    expect(parseExtractDone({ ...done, replaced: [3], replaced_count: 1 })).toBeNull();
    expect(parseExtractDone({ ...done, skipped: [{ path: 'l' }], skipped_count: 1 })).toBeNull();
    expect(parseExtractDone({ ...done, skipped: ['l'], skipped_count: 1 })).toBeNull();
  });
  it('refuses more replaced than extracted: each replaced file was extracted', () => {
    expect(parseExtractDone({ ...done, extracted_files: 1, replaced: ['a', 'b'], replaced_count: 2 })).toBeNull();
    expect(parseExtractDone({ ...done, extracted_files: 0, replaced: ['a'], replaced_count: 1 })).toBeNull();
    expect(parseExtractDone({ ...done, extracted_files: 2, replaced: ['a', 'b'], replaced_count: 2 })).not.toBeNull();
  });
  it('refuses a scope that contradicts itself', () => {
    expect(parseExtractDone({ ...done, selective: true })).toBeNull();
    expect(parseExtractDone({ ...done, selective: true, selective_path: '' })).toBeNull();
    expect(parseExtractDone({ ...done, selective: false, selective_path: 'docs/' })).toBeNull();
    expect(parseExtractDone({ ...done, selective_path: 'docs/' })).toBeNull();
    expect(parseExtractDone({ ...done, selective: 'yes', selective_path: 'docs/' })).toBeNull();
  });
});

describe('doneFor: only an answer of the whole archive into this very folder proves it done', () => {
  it('takes a whole answer naming the folder', () => {
    expect(doneFor(done, '/home/ada/site')).toMatchObject({ id: 'u1', whole: true });
  });
  it('refuses one that does not read, names another folder (a prefix, a trailing slash), or is selective', () => {
    expect(doneFor({ ...done, extraction_id: undefined }, '/home/ada/site')).toBeNull();
    expect(doneFor(done, '/home/ada/site (2)')).toBeNull();
    expect(doneFor({ ...done, destination: '/home/ada/site/' }, '/home/ada/site')).toBeNull();
    expect(doneFor({ ...done, destination: '/home/ada/sit' }, '/home/ada/site')).toBeNull();
    expect(doneFor({ ...done, selective: true, selective_path: 'site/index.html' }, '/home/ada/site')).toBeNull();
  });
});

const failed = { success: false, error: 'Corrupted archive', extraction_id: 'u1', skipped: [], skipped_count: 0, replaced: ['a'], replaced_count: 1, created: ['b', 'c'], created_count: 2 };
describe('parseExtractFailed: what a failed run says it left in the folder', () => {
  it('reads the counts, capped lists included; none only for a refusal before any run', () => {
    expect(parseExtractFailed(failed)).toEqual({ replaced: 1, created: 2 });
    expect(parseExtractFailed({ ...failed, created: names(LIST_MAX), created_count: 1_500 })).toEqual({ replaced: 1, created: 1_500 });
    expect(parseExtractFailed({ error: 'not found' })).toBe('none');
    expect(parseExtractFailed({ code: 'NOT_FOUND', message: 'no such archive' })).toBe('none');
    expect(parseExtractFailed({ success: false, error: 'not found' })).toBe('none');
    expect(parseExtractFailed({ error: 'not found', code: 'NOT_FOUND' })).toBe('none');
  });
  it('is unknown (null) for a refusal whose shape contradicts or does not read: success true or malformed, an error or code that is there but not a word', () => {
    expect(parseExtractFailed({ success: true, error: 'not found' })).toBeNull();
    expect(parseExtractFailed({ success: 'no', error: 'not found' })).toBeNull();
    expect(parseExtractFailed({ success: null, code: 'NOT_FOUND' })).toBeNull();
    expect(parseExtractFailed({ error: 3, code: 'NOT_FOUND' })).toBeNull();
    expect(parseExtractFailed({ error: 'not found', code: '' })).toBeNull();
    expect(parseExtractFailed({ error: 'not found', code: {} })).toBeNull();
    expect(parseExtractFailed({ code: 'NOT_FOUND', error: '' })).toBeNull();
  });
  it('is unknown (null) for a run whose failure does not read: no lists at all, no id, no error, a success flag, an empty body', () => {
    const without = (...ks: string[]) => Object.fromEntries(Object.entries(failed).filter(([k]) => !ks.includes(k)));
    expect(parseExtractFailed(without('replaced', 'replaced_count', 'created', 'created_count'))).toBeNull();
    expect(parseExtractFailed(without('extraction_id'))).toBeNull();
    expect(parseExtractFailed({ ...failed, extraction_id: '' })).toBeNull();
    expect(parseExtractFailed(without('error'))).toBeNull();
    expect(parseExtractFailed({ ...failed, success: true })).toBeNull();
    expect(parseExtractFailed(without('success'))).toBeNull();
    expect(parseExtractFailed({ ...failed, skipped: [3], skipped_count: 1 })).toBeNull();
    expect(parseExtractFailed({})).toBeNull();
    expect(parseExtractFailed({ error: '' })).toBeNull();
  });
  it('is unknown (null) for lists that do not read: one missing, a count that disagrees, an item of the wrong shape, no body', () => {
    const without = (...ks: string[]) => Object.fromEntries(Object.entries(failed).filter(([k]) => !ks.includes(k)));
    expect(parseExtractFailed(without('created'))).toBeNull();
    expect(parseExtractFailed(without('created', 'created_count'))).toBeNull();
    expect(parseExtractFailed(without('replaced_count'))).toBeNull();
    expect(parseExtractFailed({ ...failed, created: undefined })).toBeNull();
    expect(parseExtractFailed({ ...failed, created_count: undefined })).toBeNull();
    expect(parseExtractFailed({ ...failed, replaced: undefined, replaced_count: undefined })).toBeNull();
    expect(parseExtractFailed({ ...failed, replaced_count: 2 })).toBeNull();
    expect(parseExtractFailed({ ...failed, created: [1, 2] })).toBeNull();
    expect(parseExtractFailed(null)).toBeNull();
  });
});
