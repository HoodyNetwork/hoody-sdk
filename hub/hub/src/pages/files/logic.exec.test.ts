// Vitest: what a listing says an entry is, for Open with: its type and a regular file's
// execute bit (apps execHint: a hint, the exec decides). The root listing and an older files program give no mode.
import { describe, expect, it } from 'vitest';
import { listingOf } from './logic';

const e = (x: Record<string, unknown>) => ({ name: 'n', is_dir: false, size: 1, modified: 1, ...x });

describe('listingOf: type and exec', () => {
  it('a regular file with an execute bit is exec; without one it is not', () => {
    const l = listingOf({ entries: [e({ name: 'run.sh', type: 'file', mode: '755' }), e({ name: 'a.txt', type: 'file', mode: '644' }), e({ name: 'u.sh', type: 'file', mode: '4700' })] })!;
    expect(l.map((x) => [x.name, x.type, x.exec])).toEqual([['run.sh', 'file', true], ['a.txt', 'file', false], ['u.sh', 'file', true]]);
  });
  it('a link, a folder or a fifo is never exec; an unknown type reads other', () => {
    const l = listingOf({ entries: [e({ name: 'l', type: 'symlink', mode: '777' }), e({ name: 'd', is_dir: true, type: 'dir', mode: '755' }), e({ name: 'f', type: 'fifo', mode: '777' })] })!;
    expect(l.map((x) => [x.type, x.exec])).toEqual([['symlink', false], ['dir', false], ['other', false]]);
  });
  it('no mode, or one that does not read: no exec (unknown), and the old shape stays exactly as before', () => {
    const l = listingOf({ entries: [e({ name: 'a', type: 'file' }), e({ name: 'b', type: 'file', mode: '9z' }), e({ name: 'c' })] })!;
    expect(l.map((x) => 'exec' in x)).toEqual([false, false, false]);
    expect(l[2]).toEqual({ name: 'c', dir: false, size: 1, modified: 1000, lossy: false });
  });
});
