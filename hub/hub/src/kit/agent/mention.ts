// The composer's "@" file picker, its pure part: where an "@" token is, which folder it names, which entries match,
// and what a pick writes. Paths are relative to the chat's folder and never leave it: a leading "/" or a ".."
// segment is refused, and nothing is read for it. The host reads the folder (the kit knows no computer). The path rules are
// kit/forms/pathPick.ts, shared with PathField.
import { PATH_MAX, pathMatches, pathSplit, type PathEntry, type PathReads } from '../forms/pathPick';

/** One entry of a folder the "@" menu offers, and what the host knows of the folder the token names (the shared PathReads;
 *  `dir` is the folder relative to the chat's folder, '' for the folder itself). */
export type MentionEntry = PathEntry;
export type ComposerMention = PathReads;

/** The "@" token the caret is in: from an "@" at the draft start or after whitespace, up to the caret, with no whitespace in it.
 *  An "@" inside a word (an email, a@b) or a path (x/@y) is plain text. */
export interface MentionToken {
  /** Index of the "@" in the plain draft. */
  start: number;
  /** The text after the "@", up to the caret. */
  query: string;
}

export function mentionAt(plain: string, caret: number): MentionToken | null {
  if (caret < 1 || caret > plain.length) return null;
  const before = plain.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  const query = before.slice(at + 1);
  if (/\s/u.test(query)) return null;
  if (at > 0 && !/\s/u.test(before[at - 1] as string)) return null;
  return { start: at, query };
}

/** The folder part and the name being typed, 'outside' for a token that may leave the chat's folder (pathSplit). */
export const mentionSplit = pathSplit;
/** Most rows the menu draws. */
export const MENTION_MAX = PATH_MAX;
/** The entries for `name` (pathMatches: dotfiles only after a typed ".", folders first, starts-with then contains). */
export const mentionMatches = pathMatches;

/** What a pick writes in place of the token, and whether the menu stays open (a folder whose path has no whitespace: one level
 *  down). A path with whitespace is written quoted ("@\"my file.txt\" ") and closes the menu. */
export function mentionInsert(dir: string, e: MentionEntry): { text: string; open: boolean } {
  const path = dir + e.name + (e.dir ? '/' : '');
  if (/\s|"/u.test(path)) return { text: `@"${path.replace(/["\\]/gu, (c) => '\\' + c)}" `, open: false };
  return e.dir ? { text: `@${path}`, open: true } : { text: `@${path} `, open: false };
}
