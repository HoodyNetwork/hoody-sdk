// What an item is, for the Icons view's large icon: a folder, an image, code or text, an
// archive, or anything else. By name only (no read): the extension, the same kit-language table the preview colours
// with (lang.ts), and a few plain-text names. And a long name shortened in the middle for a tile, its end kept whole.
import type { IconName } from '@kit';
import { previewLang } from './lang';

export type FileKind = 'folder' | 'image' | 'text' | 'archive' | 'other';

const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif|heic|tiff?)$/i;
const ARCHIVE = /\.(zip|tar|tgz|tbz2?|txz|gz|bz2|xz|zst|7z|rar)$/i;
const TEXT = /\.(txt|md|markdown|log|csv|tsv|ini|conf|cfg|toml|xml|html?|css|scss|sql|go|rs|rb|java|kt|c|h|cpp|hpp|cs|php|lua|swift)$/i;

export function fileKind(e: { readonly name: string; readonly dir: boolean }): FileKind {
  if (e.dir) return 'folder';
  if (IMAGE.test(e.name)) return 'image';
  if (ARCHIVE.test(e.name)) return 'archive';
  if (TEXT.test(e.name) || previewLang(e.name, '') !== undefined) return 'text';
  return 'other';
}

/** The kit icon of each kind. */
export const KIND_ICON: Readonly<Record<FileKind, IconName>> = {
  folder: 'files',
  image: 'file-image',
  text: 'file-code',
  archive: 'file-archive',
  other: 'file',
};

/** `name` at most `max` characters: a longer one keeps its start and its end (the extension) with "…" between. */
export function middleName(name: string, max = 32): string {
  const chars = [...name];
  if (chars.length <= max) return name;
  const keep = max - 1;
  const tail = Math.min(Math.ceil(keep / 2), keep);
  return chars.slice(0, keep - tail).join('') + '…' + chars.slice(chars.length - tail).join('');
}
