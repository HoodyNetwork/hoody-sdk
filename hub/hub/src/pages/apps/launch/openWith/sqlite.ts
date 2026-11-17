// An SQLite database opens in the computer's SQLite Studio (hoody-sqlite, on every computer) by default. The
// studio serves on the computer's `sqlite` address (the Board's sqlite tile, index 1) and opens the database named by
// `?db=<absolute path>` on mount, checking it itself. No exec and no launcher: it works where Files can't start
// programs. The text programs stay below it for a .db that is not SQLite (the studio then says so).
import { portAddress, type Target } from '@core';

/** Extensions (lower case, without the dot) of SQLite database files. */
export const SQLITE_EXTENSIONS: ReadonlySet<string> = new Set(['db', 'sqlite', 'sqlite3', 'db3']);

/** True when the name's extension says SQLite database (case-insensitive; a leading dot alone is a hidden name). */
export function isSqliteName(name: unknown): boolean {
  const base = (typeof name === 'string' ? name : '').toLowerCase();
  const dot = base.lastIndexOf('.');
  return dot > 0 && dot < base.length - 1 && SQLITE_EXTENSIONS.has(base.slice(dot + 1));
}

/** A UTF-16 surrogate without its pair (encodeURIComponent throws on one). */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** The studio's address with this database, or '' when the computer's address is not known yet or the path is not an
 *  absolute path the studio can take: no NUL, no unpaired surrogate, and no `?` or `#` anywhere (hoody-sqlite refuses
 *  either in a database path, so offering it would open a dead page). The path is sent whole and encoded, never split. */
export function sqliteStudioUrl(target: Target | null | undefined, path: string): string {
  if (!target || typeof path !== 'string' || !path.startsWith('/') || /[\0?#]/.test(path) || LONE_SURROGATE.test(path)) return '';
  const base = portAddress(target.project, target.container, 1, 'sqlite');
  return base ? `${base}/?db=${encodeURIComponent(path)}` : '';
}

/** The studio's address for a Files entry, or '' when it is not offered there: only a known regular file (the studio
 *  refuses a symlink or any other entry; a kind Files only guessed is not known) with a database name and a path it takes. One decision for every surface: where it is
 *  '' the programs are offered instead. */
export function studioUrlFor(target: Target | null | undefined, file: { readonly type?: string; readonly typeGuessed?: boolean; readonly name: string; readonly path: string }): string {
  return file.type === 'file' && file.typeGuessed !== true && isSqliteName(file.name) ? sqliteStudioUrl(target, file.path) : '';
}
