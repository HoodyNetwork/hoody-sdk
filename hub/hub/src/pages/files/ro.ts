// The Files page's read-only actions: pure helpers.
//
// Contract, in plain words:
//   - fileLink(c, path, kind) is a plain link to the computer's own files program, built from its ids and server
//     (core portAddress), never a server-given URL and never a token. The browser opens or saves it; the Hub holds
//     nothing and never claims a download finished (it cannot see that).
//       download: a file, `/api/v1/files/<path>?download=1` (Content-Disposition attachment);
//       zip: a folder as one .zip, `/api/v1/files/<path>?zip&download=1` (as Computers' Files as .zip); never the top
//       folder. download=1 too, so a file that replaced the folder since the listing is saved, never shown inline;
//       view / edit: the program's own read-only page or its editor (`/<path>?view`, `?edit`); the caller offers edit
//       only where changes are allowed.
//     '' means no link: no address yet, a name the Hub cannot pass back exactly (lossy), or a path the program would
//     read as something else (a WebDAV-style path under /api/v1/; a REST path whose first part is a program command).
//   - previewKind(name) picks how a file is previewed: an image by its name, everything else as text.
//   - imageDataUrl(bytes) is a data: URL only for bytes that start as PNG, JPEG, GIF or WebP (never SVG: a data: image
//     is the one image source the Hub's CSP allows besides itself, and it must stay inert). Anything else is null.
//   - textOf(bytes) is the text of a ?lines answer with controls and direction/invisible characters written as \xNN /
//     \uNNNN (tabs and line ends kept),
//     or null when it holds a NUL byte (not text).
//   - findQuery(raw) is the text sent as ?q=, or null when the program would refuse it (over 512 bytes of UTF-8, also
//     after lowercasing) or it would match everything (empty, or only slashes).
//   - foundOf(raw, base) reads a ?q answer: every entry under `base` with its full path. An answer for another folder,
//     or an entry that cannot be read, is not absolute, holds a `.` or `..` part or lies outside `base`, makes the
//     whole answer unreadable (null), never a shorter list. capped says the program's 1,000 limit was hit.
import { openOutside } from '@kit';
export { reservedWebdav, fileLink, THUMB_SIZE, THUMB_BYTES, TEXT_LINES, TEXT_BYTES, previewKind, imageDataUrl, escapeUnsafe, textOf, FIND_MAX_BYTES, FIND_CAP, findQuery, foundOf } from './ro.pure';
export type { LinkKind, LinkComputer, PreviewKind, Found } from './ro.pure';

/** Opens a program link in a new tab without the Hub as opener or referrer: a download saves and the tab closes; a
 *  refusal shows there, never in place of the Hub. */
export function openLink(url: string): void {
  if (url) openOutside(url);
}
