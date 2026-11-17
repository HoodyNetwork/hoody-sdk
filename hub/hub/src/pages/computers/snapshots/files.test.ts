import { describe, expect, it } from 'vitest';
import { ZIP_FILE_LIMIT, countOf, rootSubfoldersOf, subfoldersOf } from './files';

describe('files-program answers', () => {
  it('a listing gives its subfolders, sorted; anything else is not a listing', () => {
    expect(subfoldersOf({ path: '/home', count: 3, entries: [{ name: 'zed', is_dir: true, size: 0 }, { name: 'a.txt', is_dir: false, size: 3 }, { name: 'amy', is_dir: true, size: 0 }] })).toEqual(['amy', 'zed']);
    expect(subfoldersOf({ entries: [{ name: 'a/b', is_dir: true }] })).toEqual([]);
    expect(subfoldersOf({})).toBeNull();
    expect(subfoldersOf(null)).toBeNull();
  });
  it('the root listing (listRootDirectory, paths[] with path_type) gives its folders and folder links, sorted', () => {
    expect(rootSubfoldersOf({ breadcrumb: '', paths: [
      { path_type: 'Dir', name: 'zed', mtime: 0, size: 0 }, { path_type: 'File', name: 'a.txt', mtime: 0, size: 3 },
      { path_type: 'SymlinkDir', name: 'amy', mtime: 0, size: 0 }, { path_type: 'SymlinkFile', name: 'b', mtime: 0, size: 0 },
      { path_type: 'Dir', name: 'x/y' }, { path_type: 'dir', name: 'lower' },
    ] })).toEqual(['amy', 'zed']);
    expect(rootSubfoldersOf({ entries: [{ name: 'home', is_dir: true }] })).toBeNull();
    expect(rootSubfoldersOf(null)).toBeNull();
  });
  it('a whole walk within the limit fits; a walk stopped past the limit is over; anything else is unknown', () => {
    expect(countOf({ total_scanned: 12, truncated: false })).toBe('under');
    expect(countOf({ total_scanned: ZIP_FILE_LIMIT, truncated: false })).toBe('under');
    expect(countOf({ total_scanned: ZIP_FILE_LIMIT + 1, truncated: true })).toBe('over');
    expect(countOf({ total_scanned: 50, truncated: true })).toBe('unknown');
    expect(countOf({ total_scanned: ZIP_FILE_LIMIT + 5, truncated: false })).toBe('unknown');
    expect(countOf({ truncated: false })).toBe('unknown');
    expect(countOf('x')).toBe('unknown');
  });
});
