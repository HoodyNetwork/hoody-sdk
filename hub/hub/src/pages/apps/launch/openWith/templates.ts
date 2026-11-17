// The reviewed programs Open with offers. Each row was reviewed for how its program
// treats a file name: the file is always the last word and an absolute path, so never an option, a `+LINE` or a URL
// scheme. A program that hands the name to a preprocessor or interpreter is configured not to (`less -L`), or refuses
// the names it would misread (`refuses`). A new row must meet the same rules; the table test fails on a shell,
// `env`, a `-c`/`-e`/`--eval` style flag or a relative program path.

/** What a file is, for choosing programs (openWith/types.ts classifies; `folder` is a directory). */
export type FileKind =
  | 'text' | 'code' | 'data' | 'markdown' | 'html' | 'svg' | 'image' | 'pdf'
  | 'office-doc' | 'office-sheet' | 'office-slides' | 'csv' | 'folder' | 'unknown';

export type TemplateId =
  | 'nano' | 'vim' | 'nvim' | 'micro' | 'emacs' | 'less' | 'mc'
  | 'mousepad' | 'pluma' | 'ristretto' | 'eom' | 'imdisplay' | 'atril' | 'firefox' | 'libreoffice' | 'thunar' | 'caja';

export interface Template {
  id: TemplateId;
  name: string;
  /** Where the program shows: its terminal, or the computer's screen. */
  opens: 'terminal' | 'screen';
  for: readonly FileKind[];
  /** Absolute paths to check, first hit wins; what was checked is what runs (no PATH lookup). */
  probe: readonly string[];
  /** Fixed words placed before the file. */
  flags: readonly string[];
  /** A name this program would read as something other than a file name: refused for this row. */
  refuses?: (path: string) => boolean;
}

const EDIT: readonly FileKind[] = ['text', 'code', 'data', 'markdown'];
/** ImageMagick reads `[…]`, `*`, `?`, `{}`, `%` and `@` in a file name itself. */
const MAGICK = /[[\]*?{}%@]/;

export const TEMPLATES: readonly Template[] = [
  { id: 'nano', name: 'Nano', opens: 'terminal', for: EDIT, probe: ['/usr/bin/nano', '/bin/nano'], flags: [] },
  { id: 'vim', name: 'Vim', opens: 'terminal', for: EDIT, probe: ['/usr/bin/vim', '/usr/bin/vim.basic'], flags: [] },
  { id: 'nvim', name: 'Neovim', opens: 'terminal', for: EDIT, probe: ['/usr/bin/nvim', '/usr/local/bin/nvim'], flags: [] },
  { id: 'micro', name: 'Micro', opens: 'terminal', for: EDIT, probe: ['/usr/bin/micro', '/usr/local/bin/micro'], flags: [] },
  { id: 'emacs', name: 'Emacs (terminal)', opens: 'terminal', for: EDIT, probe: ['/usr/bin/emacs'], flags: ['-nw'] },
  // -L: LESSOPEN is ignored, so the name never reaches lesspipe.
  { id: 'less', name: 'Less (read only)', opens: 'terminal', for: ['text', 'unknown'], probe: ['/usr/bin/less'], flags: ['-L'] },
  { id: 'mc', name: 'Midnight Commander', opens: 'terminal', for: ['folder'], probe: ['/usr/bin/mc'], flags: [] },
  { id: 'mousepad', name: 'Mousepad', opens: 'screen', for: EDIT, probe: ['/usr/bin/mousepad'], flags: [] },
  { id: 'pluma', name: 'Pluma', opens: 'screen', for: EDIT, probe: ['/usr/bin/pluma'], flags: [] },
  { id: 'ristretto', name: 'Ristretto', opens: 'screen', for: ['image'], probe: ['/usr/bin/ristretto'], flags: [] },
  { id: 'eom', name: 'Eye of MATE', opens: 'screen', for: ['image'], probe: ['/usr/bin/eom'], flags: [] },
  { id: 'imdisplay', name: 'ImageMagick Display', opens: 'screen', for: ['image'], probe: ['/usr/bin/display'], flags: [], refuses: (p) => MAGICK.test(p) },
  { id: 'atril', name: 'Atril', opens: 'screen', for: ['pdf'], probe: ['/usr/bin/atril'], flags: [] },
  { id: 'firefox', name: 'Firefox', opens: 'screen', for: ['html', 'svg', 'pdf', 'image'], probe: ['/usr/bin/firefox-esr', '/usr/bin/firefox'], flags: [] },
  { id: 'libreoffice', name: 'LibreOffice', opens: 'screen', for: ['office-doc', 'office-sheet', 'office-slides', 'csv'], probe: ['/usr/bin/libreoffice'], flags: [] },
  { id: 'thunar', name: 'Thunar', opens: 'screen', for: ['folder'], probe: ['/usr/bin/thunar'], flags: [] },
  { id: 'caja', name: 'Caja', opens: 'screen', for: ['folder'], probe: ['/usr/bin/caja'], flags: [] },
];

const BY_ID = new Map<string, Template>(TEMPLATES.map((t) => [t.id, t]));
export const templateById = (id: string): Template | undefined => BY_ID.get(id);
/** A template for folders takes a folder; every other one a file. */
export const forFolders = (t: Template): boolean => t.for.includes('folder');

/** The default order per kind (the remembered choice goes first, before these). At most 6 show, then "More programs". */
export const DEFAULT_ORDER: Readonly<Record<FileKind, readonly TemplateId[]>> = {
  text: ['nano', 'mousepad', 'vim', 'nvim', 'micro', 'pluma', 'emacs', 'less'],
  code: ['nano', 'mousepad', 'vim', 'nvim', 'micro', 'pluma', 'emacs', 'less'],
  data: ['nano', 'mousepad', 'vim', 'nvim', 'micro', 'pluma', 'emacs', 'less'],
  markdown: ['nano', 'mousepad', 'vim', 'nvim', 'micro', 'pluma', 'emacs', 'less'],
  image: ['ristretto', 'eom', 'imdisplay', 'firefox'],
  pdf: ['atril', 'firefox'],
  html: ['firefox', 'mousepad', 'nano'],
  svg: ['firefox', 'mousepad', 'nano'],
  'office-doc': ['libreoffice'],
  'office-sheet': ['libreoffice'],
  'office-slides': ['libreoffice'],
  csv: ['libreoffice'],
  folder: ['thunar', 'caja', 'mc'],
  unknown: ['less', 'nano', 'mousepad'],
};
