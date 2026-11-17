// What a file is, for choosing its programs: by name only, pure, no request. The kinds are
// templates.ts's FileKind (the template table decides which kinds exist): a name it has no kind for (archives,
// audio, video, binaries) reads 'unknown', whose programs only show text. A Preview that already decoded the file as
// text upgrades 'unknown' to 'text'. `execHint` reads the listing's x bit; it is a hint, the exec decides.
import type { FileKind } from './templates';

const rows = (kind: FileKind, exts: string): [string, FileKind][] => exts.split(' ').map((e) => [e, kind]);

/** Extension (lower case, without the dot) → kind. */
export const EXTENSIONS: ReadonlyMap<string, FileKind> = new Map<string, FileKind>([
  ...rows('text', 'txt text log out err ini cfg conf config properties list lst diff patch po pot srt vtt nfo asc rst adoc tex bib'),
  ...rows('code', 'sh bash zsh fish ksh py pyw pyi rb pl pm php lua tcl r jl js mjs cjs jsx ts mts cts tsx go rs c h cc cpp cxx hpp hh hxx m mm java kt kts scala groovy gradle swift dart cs fs vb sql css scss sass less vue svelte el clj ex exs erl hs ml nim zig v asm s cmake mk awk sed ps1 bat'),
  ...rows('data', 'json jsonl ndjson json5 yaml yml toml xml plist env lock'),
  ...rows('markdown', 'md markdown mdown mkd'),
  ...rows('html', 'html htm xhtml'),
  ...rows('svg', 'svg'),
  ...rows('image', 'png jpg jpeg jpe gif webp bmp ico tif tiff avif heic heif xpm pnm ppm pgm pbm tga'),
  ...rows('pdf', 'pdf'),
  ...rows('office-doc', 'doc docx odt rtf ott dot dotx'),
  ...rows('office-sheet', 'xls xlsx ods ots xlsm'),
  ...rows('office-slides', 'ppt pptx odp otp pps ppsx'),
  ...rows('csv', 'csv tsv'),
]);

/** Whole names (lower case) with no telling extension. */
export const NAMES: ReadonlyMap<string, FileKind> = new Map<string, FileKind>([
  ...rows('text', 'readme license licence copying authors changelog news todo notice hosts'),
  ...rows('code', 'makefile gnumakefile dockerfile containerfile vagrantfile gemfile rakefile procfile justfile .bashrc .bash_profile .profile .zshrc .zprofile'),
  ...rows('data', '.gitignore .gitattributes .editorconfig .npmrc .gitconfig .env'),
]);

/** Kind from the name's extension; a Preview that decoded text upgrades 'unknown' to 'text'. Folders: 'folder'. */
export function kindOf(name: string, o: { dir?: boolean; decodedText?: boolean } = {}): FileKind {
  if (o.dir) return 'folder';
  const base = (typeof name === 'string' ? name : '').toLowerCase();
  const byName = NAMES.get(base);
  const dot = base.lastIndexOf('.');
  // A leading dot alone is a hidden name, not an extension ('.profile' is matched whole above).
  const kind = byName ?? (dot > 0 && dot < base.length - 1 ? EXTENSIONS.get(base.slice(dot + 1)) : undefined) ?? 'unknown';
  return kind === 'unknown' && o.decodedText ? 'text' : kind;
}

/** The listing's x bit: true when a regular file's octal mode has any execute bit, null when the mode (the kit's octal `mode & 0o7777`, 1 to 4 digits) is missing or
 *  unreadable (the root listing carries none). A symlink is never offered Run in v1, so it reads false. */
export function execHint(type: unknown, mode: unknown): boolean | null {
  if (typeof mode !== 'string' || !/^[0-7]{1,4}$/.test(mode)) return null;
  if (type !== 'file') return false;
  return (parseInt(mode, 8) & 0o111) !== 0;
}
