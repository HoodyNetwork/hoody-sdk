// The per-file classification: by name only, every program kind reachable, unknown upgraded only by decoded text,
// and the listing's x bit read as a hint.
import { describe, expect, it } from 'vitest';
import { DEFAULT_ORDER, type FileKind } from './templates';
import { EXTENSIONS, NAMES, execHint, kindOf } from './types';

describe('kindOf', () => {
  it('reads the last extension, in any case', () => {
    const cases: [string, FileKind][] = [
      ['notes.txt', 'text'], ['NOTES.TXT', 'text'], ['run.sh', 'code'], ['main.go', 'code'], ['conf.yaml', 'data'],
      ['README.md', 'markdown'], ['index.html', 'html'], ['logo.svg', 'svg'], ['pic.PNG', 'image'], ['a b.pdf', 'pdf'],
      ['letter.docx', 'office-doc'], ['sheet.ods', 'office-sheet'], ['deck.pptx', 'office-slides'], ['rows.csv', 'csv'],
      ['site.tar.gz', 'unknown'], ['song.mp3', 'unknown'], ['film.mkv', 'unknown'], ['program', 'unknown'],
    ];
    for (const [name, kind] of cases) expect(kindOf(name), name).toBe(kind);
  });

  it('reads whole names with no telling extension, and never a leading dot or a trailing one as an extension', () => {
    expect(kindOf('Makefile')).toBe('code');
    expect(kindOf('LICENSE')).toBe('text');
    expect(kindOf('.bashrc')).toBe('code');
    expect(kindOf('.md')).toBe('unknown');
    expect(kindOf('notes.')).toBe('unknown');
    expect(kindOf('')).toBe('unknown');
  });

  it('gives a folder its own kind whatever its name', () => {
    expect(kindOf('photos.png', { dir: true })).toBe('folder');
    expect(kindOf('src', { dir: true })).toBe('folder');
  });

  it('lets decoded text upgrade only an unknown kind', () => {
    expect(kindOf('program', { decodedText: true })).toBe('text');
    expect(kindOf('pic.png', { decodedText: true })).toBe('image');
    expect(kindOf('main.go', { decodedText: true })).toBe('code');
  });

  it('reaches every kind that has programs, and maps only to kinds the template table knows', () => {
    const kinds = new Set<FileKind>([...EXTENSIONS.values(), ...NAMES.values()]);
    for (const k of Object.keys(DEFAULT_ORDER) as FileKind[]) if (k !== 'folder' && k !== 'unknown') expect(kinds.has(k), k).toBe(true);
    for (const k of kinds) expect(Object.keys(DEFAULT_ORDER)).toContain(k);
    expect(EXTENSIONS.size).toBeGreaterThanOrEqual(120);
    for (const e of EXTENSIONS.keys()) expect(e).toMatch(/^[a-z0-9]+$/);
  });
});

describe('execHint', () => {
  it('reads any execute bit of a regular file, as the kit writes the mode', () => {
    expect(execHint('file', '755')).toBe(true);
    expect(execHint('file', '700')).toBe(true);
    expect(execHint('file', '4755')).toBe(true);
    expect(execHint('file', '001')).toBe(true);
    expect(execHint('file', '1')).toBe(true);
    expect(execHint('file', '644')).toBe(false);
    expect(execHint('file', '0')).toBe(false);
  });

  it('is false for anything but a regular file, and null for a missing or unreadable mode', () => {
    expect(execHint('symlink', '777')).toBe(false);
    expect(execHint('dir', '755')).toBe(false);
    expect(execHint('file', undefined)).toBeNull();
    expect(execHint('file', 755)).toBeNull();
    expect(execHint('file', '0o755')).toBeNull();
    expect(execHint('file', '855')).toBeNull();
    expect(execHint('file', '17777')).toBeNull();
  });
});
