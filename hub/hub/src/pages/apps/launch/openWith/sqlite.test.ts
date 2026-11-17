// Which names are SQLite databases, and the SQLite Studio address a database opens at.
import { portAddress } from '@core';
import { describe, expect, it } from 'vitest';
import { isSqliteName, sqliteStudioUrl, studioUrlFor } from './sqlite';

const target = { project: { id: 'a'.repeat(24) }, container: { id: 'b'.repeat(24), server_name: 'n1' } };

describe('SQLite names', () => {
  it('.db, .sqlite, .sqlite3 and .db3 in any case are databases; other names, hidden names and folders-like names are not', () => {
    for (const n of ['app.db', 'Data.SQLITE', 'x.sqlite3', 'old.DB3', 'a.b.db']) expect(isSqliteName(n)).toBe(true);
    for (const n of ['.db', 'db', 'notes.txt', 'app.db.bak', 'app.dbx', 'file.', '', undefined, 5]) expect(isSqliteName(n)).toBe(false);
  });
});

describe('the studio address', () => {
  it('is the computer\'s sqlite address (index 1) with ?db= the absolute path, encoded whole', () => {
    const base = portAddress(target.project, target.container, 1, 'sqlite');
    expect(base).toMatch(/^https:\/\/.+-sqlite-1\./);
    expect(sqliteStudioUrl(target, '/home/user/My Data & ü=%+.db')).toBe(`${base}/?db=${encodeURIComponent('/home/user/My Data & ü=%+.db')}`);
    expect(sqliteStudioUrl(target, '/home/user/My Data & ü=%+.db')).toBe(`${base}/?db=%2Fhome%2Fuser%2FMy%20Data%20%26%20%C3%BC%3D%25%2B.db`);
    // A valid surrogate pair (an emoji) is one character: encoded whole.
    expect(sqliteStudioUrl(target, '/srv/\u{1F600}.db')).toBe(`${base}/?db=%2Fsrv%2F%F0%9F%98%80.db`);
  });

  it('is empty for ? or # anywhere in the path (hoody-sqlite refuses both), file name or folder', () => {
    for (const p of ['/srv/a#b.db', '/srv/a?b.db', '/srv/x#/a.db', '/srv/x?/a.db', '/srv/a.db#', '/?/a.db']) expect(sqliteStudioUrl(target, p)).toBe('');
  });

  it('is empty, never a throw, for an unpaired surrogate (high or low)', () => {
    for (const p of ['/home/user/\uD800.db', '/home/user/\uDC00.db', '/home/user/a\uD83D', '/\uDE00\uD83D.db']) expect(sqliteStudioUrl(target, p)).toBe('');
  });

  it('is empty for a relative path, a NUL, or no computer: nothing to open', () => {
    expect(sqliteStudioUrl(target, 'app.db')).toBe('');
    expect(sqliteStudioUrl(target, '/a\0b.db')).toBe('');
    expect(sqliteStudioUrl(null, '/a.db')).toBe('');
  });
});

describe('which Files entries get the studio', () => {
  const at = (type: string | undefined, name = 'shop.db') => studioUrlFor(target, { ...(type ? { type } : {}), name, path: `/home/user/${name}` });
  it('a regular file with a database name only: not a symlink, a folder, another entry or an unknown kind', () => {
    expect(at('file')).toBe(sqliteStudioUrl(target, '/home/user/shop.db'));
    expect(at('file')).not.toBe('');
    for (const type of ['symlink', 'dir', 'other', undefined]) expect(at(type)).toBe('');
    expect(at('file', 'notes.txt')).toBe('');
    expect(studioUrlFor(target, { type: 'file', typeGuessed: true, name: 'shop.db', path: '/home/user/shop.db' })).toBe('');
    expect(at('file', 'a#b.db')).toBe('');
    expect(studioUrlFor(null, { type: 'file', name: 'shop.db', path: '/home/user/shop.db' })).toBe('');
  });
});
