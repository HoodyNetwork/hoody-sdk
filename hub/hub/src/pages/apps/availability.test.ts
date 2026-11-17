// Vitest: every launcher row says in one word what getting it takes. A starter is ready or
// not available here; the system source is installed; every other source downloads it first; a row whose source is not
// known says nothing. Each word but the last has its badge text and tip.
import { describe, expect, it } from 'vitest';
import { availability, FIND_SOURCES, type Availability, type Item } from './logic';
import strings from './strings.en.json';

const words = strings as Record<string, string>;
type Row = Pick<Item, 'type' | 'provider' | 'ready'>;

describe('availability', () => {
  const table: [string, Row, Availability][] = [
    ['a starter this computer can open', { type: 'starter', provider: null, ready: true }, 'ready'],
    ['a starter this computer cannot open', { type: 'starter', provider: null, ready: false }, 'unavailable'],
    ['a program on this computer', { type: 'row', provider: 'system', ready: true }, 'installed'],
    ['a program on this computer that is not runnable', { type: 'row', provider: 'system', ready: false }, 'installed'],
    ['a program index entry', { type: 'row', provider: 'registry', ready: false }, 'downloads'],
    ['a Nix package', { type: 'row', provider: 'nix', ready: false }, 'downloads'],
    ['a pkgx package', { type: 'row', provider: 'pkgx', ready: false }, 'downloads'],
    ['an AppImage', { type: 'row', provider: 'appimage', ready: false }, 'downloads'],
    ['a Docker image', { type: 'row', provider: 'oci', ready: false }, 'downloads'],
    ['a row from a source this Hub does not name', { type: 'row', provider: 'other', ready: false }, 'unknown'],
    ['a row with no source', { type: 'row', provider: null, ready: false }, 'unknown'],
  ];
  it.each(table)('%s', (_, row, word) => {
    expect(availability(row)).toBe(word);
  });

  it('every search source has a word that is not unknown (a new source must be placed)', () => {
    for (const p of FIND_SOURCES) expect(availability({ type: 'row', provider: p, ready: false }), p).not.toBe('unknown');
  });

  it('every word but unknown has its badge and its tip; Not available here is the existing row word', () => {
    expect(words['avail.installed']).toBe('Installed');
    expect(words['avail.ready']).toBe('Ready to open');
    expect(words['avail.downloads']).toBe('Downloads when opened');
    expect(words['row.unavailable']).toBe('Not available here');
    for (const w of ['installed', 'ready', 'unavailable', 'downloads']) expect(words[`avail.${w}.tip`], w).toBeTruthy();
  });
});
