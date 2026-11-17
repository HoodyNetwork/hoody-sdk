// paths.ts: the Linux paths a reply writes, found so a person can act on one (PathMark's menu). A
// miss costs nothing (the text stays text) and a false find puts a menu on words that are no path, so every rule leans to text:
//
//   - absolute (`/etc/nginx`) or under the home folder (`~/.bashrc`), with at least two parts (`~` counts as one): a bare `/`
//     and one part (`/tmp`) stay text;
//   - starts the text or follows a space or an opening bracket or quote, so a `/` inside a word (`and/or`, `1/2`, `km/h`), a
//     URL (`https://h/a/b`, `file:///etc/x`) or an address (`me@h.com/x`) is never one;
//   - parts of letters, digits and `._-+@%=,~`, none empty (`//`), none `.` or `..`, and one part at least holds a letter
//     (`/10/2024` is a date);
//   - ends the text or meets a space, punctuation or a closing bracket or quote: a character no path part takes (`/home/ada/文書`,
//     `/a/b#x`) leaves the whole of it text, never a shorter path;
//   - trailing punctuation (`.,;:!?`) is not part of it; a `:line` or `:line:col` right after it is, in the target
//     (`/src/app.ts:12:5`); a suffix that is not one whole (`/a/b:12:345678`) leaves the whole of it text;
//   - at most PATH_MAX_BYTES long.
//
// Fenced code blocks are not handled: the code block renderer has no token hook. Pure: no page, no read.

export interface FoundPath {
  /** The index just past the target in the text read. */
  readonly end: number;
  /** As written, with a `:line` / `:line:col` suffix when there is one. */
  readonly target: string;
  /** The path alone. */
  readonly path: string;
  readonly line?: number;
  readonly col?: number;
}

/** At most this many distinct paths in one reply are actionable (the reply's link marks have the same budget, MARKS_MAX). */
export const PATHS_MAX = 8;
export const PATH_MAX_BYTES = 1024;

const PART = /[A-Za-z0-9._\-+@%=,~]/;
const BEFORE = /[\s([{"'<]/;
const TRAIL = /[.,;:!?]+$/;
const SUFFIX = /^:(\d{1,7})(?::(\d{1,5}))?(?![\w/]|:\d)/;
/** What may follow a path, and its :line[:col]: a space, punctuation, or a closing bracket or quote. Never a markdown mark:
 *  `/a/b**c**` shows `/a/bc`, so it is no path; an emphasis that closes right after one is read from outside (`around`). */
const AFTER = /[\s.,;:!?)\]}>"']/;
const LETTER = /[A-Za-z]/;

/** The path that starts at `i` in `s` (at a `/` or a `~/`), or null. `around`: when `s` is a piece of a longer text (the inside
 *  of an emphasis), `before` the character just before it and `after` all the text after it, read where `s` itself has none
 *  (an emphasis glued to an address has the address's last letter before its `/`; an emphasis holding `/a/b:12` followed by
 *  `:345678` shows a longer suffix than its inside holds). */
export function pathAt(s: string, i: number, around: { before?: string; after?: string } = {}): FoundPath | null {
  const home = s[i] === '~';
  if (!(s[i] === '/' || (home && s[i + 1] === '/'))) return null;
  const before = i > 0 ? s[i - 1] : around.before;
  if (before && !BEFORE.test(before)) return null;
  let j = home ? i + 1 : i;
  while (j < s.length && (s[j] === '/' || PART.test(s[j] as string))) j++;
  const next = j < s.length ? s[j] : around.after?.[0];
  if (next && !AFTER.test(next)) return null;
  let raw = s.slice(i, j);
  const suffix = SUFFIX.exec(s.slice(j));
  // A colon and a digit that make no whole :line[:col] (too long, or a column cut off): the whole is text.
  if (!suffix && /^:\d/.test(s.slice(j))) return null;
  if (!suffix) raw = raw.replace(TRAIL, '');
  if (!valid(raw)) return null;
  const end = i + raw.length + (suffix ? suffix[0].length : 0);
  // What the reader sees right after the target: the same boundary rule, so `/a/b:12文` or `/a/b:12-x` is no `/a/b:12`.
  const rest = end < s.length ? s.slice(end) : (around.after ?? '');
  if (rest && (!AFTER.test(rest[0] as string) || /^:\d/.test(rest))) return null;
  const target = s.slice(i, end);
  if (new TextEncoder().encode(target).length > PATH_MAX_BYTES) return null;
  return {
    end,
    target,
    path: raw,
    ...(suffix ? { line: Number(suffix[1]) } : {}),
    ...(suffix?.[2] ? { col: Number(suffix[2]) } : {}),
  };
}

/** `s` when the whole of it is one path (an inline code span), else null. */
export function wholePath(s: string): FoundPath | null {
  const p = pathAt(s, 0);
  return p && p.end === s.length ? p : null;
}

function valid(raw: string): boolean {
  const body = raw.startsWith('~') ? raw.slice(1) : raw;
  // A folder may end in one `/`; the rest are separators between non-empty parts.
  const parts = body.replace(/\/$/, '').split('/').slice(1);
  const count = parts.length + (raw.startsWith('~') ? 1 : 0);
  if (count < 2) return false;
  if (parts.some((p) => p === '' || p === '.' || p === '..')) return false;
  return parts.some((p) => LETTER.test(p));
}
