// How a Files launch reaches the computer: one launcher (bash from the system source)
// runs one of the fixed scripts below with `-c`, and the path rides only as a staged value (HUB_OPEN_FILE or
// HUB_OPEN_DIR, in execute's secret env). The path is never in the resolve body, the command text, the computer's
// shell history or Details. Each script copies the value to a shell variable and unsets it before `exec`, so the
// program never inherits it. No script is ever built from data; Other command text goes after a fixed preamble.
import { utf8Bytes } from '@core/pure';

export { utf8Bytes };

export const FILE_VAR = 'HUB_OPEN_FILE';
export const DIR_VAR = 'HUB_OPEN_DIR';
/** `$0` of every script. */
export const ARG0 = 'open-with';

/** A program on a file: the program's words, then the file. */
export const SCRIPT_FILE = 'f=$HUB_OPEN_FILE; unset HUB_OPEN_FILE\ncd -- "${f%/*}/" || exit 125\nexec -- "$@" "$f"';
/** A program on a folder. */
export const SCRIPT_DIR = 'f=$HUB_OPEN_DIR; unset HUB_OPEN_DIR\ncd -- "$f/" || exit 125\nexec -- "$@" "$f"';
/** Run in a terminal: the file itself (the kernel honours its #!; the Hub never picks an interpreter). */
export const SCRIPT_RUN = 'f=$HUB_OPEN_FILE; unset HUB_OPEN_FILE\ncd -- "${f%/*}/" || exit 125\nexec -- "$f"';
/** Other command on a file: their own Bash follows, `$1` the file, `$0` open-with. */
export const PRE_CMD_FILE = 'f=$HUB_OPEN_FILE; unset HUB_OPEN_FILE\ncd -- "${f%/*}/" || exit 125\nset -- "$f"; unset f\n';
/** Other command on a folder. */
export const PRE_CMD_DIR = 'f=$HUB_OPEN_DIR; unset HUB_OPEN_DIR\ncd -- "$f/" || exit 125\nset -- "$f"; unset f\n';
/** Open terminal here: the person's login shell in that folder (the session shell is the pinned bash). */
export const SCRIPT_HERE = 'd=$HUB_OPEN_DIR; unset HUB_OPEN_DIR\ncd -- "$d/" || exit 125\ns=$(getent passwd "$(id -un)" | cut -d: -f7)\nexec "${s:-/bin/bash}" -i';

/** The whole scripts: the only ones a Files launch may send (live.ts dispatch guard). */
export const SCRIPTS: readonly string[] = [SCRIPT_FILE, SCRIPT_DIR, SCRIPT_RUN, SCRIPT_HERE];
/** Other command text: at most this many bytes. */
export const CMD_MAX_BYTES = 1024;


/** Why a path cannot be launched (each failure its own reason), or null. */
export type PathReason = 'not_absolute' | 'dot_part' | 'too_long' | 'control' | 'lossy' | 'backslash';

/** The launchable-path predicate: absolute, no empty, `.` or `..` part, UTF-8 ≤ 4,096 bytes, no C0/C1/DEL
 *  (newline and tab included), no U+FFFD (a lossy name), no backslash. `/` itself is a folder. */
export function launchablePath(p: string): PathReason | null {
  if (!p.startsWith('/')) return 'not_absolute';
  if (utf8Bytes(p) > 4096) return 'too_long';
  // The control characters (C0, DEL, C1) are what is refused.
  if (/[\u0000-\u001f\u007f-\u009f]/.test(p)) return 'control';
  if (p.includes('\ufffd')) return 'lossy';
  if (p.includes('\\')) return 'backslash';
  if (p === '/') return null;
  const parts = p.slice(1).split('/');
  if (parts.some((x) => x === '' || x === '.' || x === '..')) return 'dot_part';
  return null;
}

/** A folder's staged value: `<dir>/.`, which no command text contains (so it never collides). */
export const dirValue = (dir: string): string => (dir === '/' ? '/.' : `${dir}/.`);

// The core's rule (run-open-core.js containsSecret, SHELL_QUOTING): a caller value of 8 or more characters found in
// the command text, as is or with ' " \ folded out, is refused (staging_unavailable). Mirrored exactly, so the Hub
// refuses first with its own reason.
const SHELL_QUOTING = /['"\\]/g;
function containsValue(text: string, value: string): boolean {
  if (!value) return false;
  if (text.includes(value)) return true;
  const folded = value.replace(SHELL_QUOTING, '');
  return folded.length > 0 && text.replace(SHELL_QUOTING, '').includes(folded);
}
/** Whether the staged value would be refused by the core: it is part of the launch's own command words (the
 *  launcher's path and every argument). */
export function collides(value: string, words: readonly string[]): boolean {
  return value.length >= 8 && containsValue(words.join(' '), value);
}
