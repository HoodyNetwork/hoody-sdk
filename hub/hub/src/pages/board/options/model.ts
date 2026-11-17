// The option panels, one per tile program.
//
// Contract, in plain words:
//   - PANELS holds each program's hand-designed panel: the views the "Opens" control offers (files, browser, code),
//     the fixed Opens block (the chosen view's own fields, never in a collapsed section) and the accordion
//     sections in order, Advanced last. A row names the catalogue ids it writes; labels, help and choices are
//     strings keys, never catalogue text.
//   - Every user option of a program (embed programOptions) is named by exactly one row (model.test.ts), so the
//     panel equals the placement (placementOf feeds embed/placement.ts).
//   - Values are checked by the catalogue only (draft.ts uses checkOption); a row adds no bound of its own.
//   - A row shows only when the tile's view takes its option; `when` hides it further (Bar width only for the bar
//     cursor); `needs` disables it until another option has a value (the side panel needs a page).
import type { Scalar, TileProgram } from '../embed/catalog';
import type { EmbedValue } from '../embed/build';
import { FILES_THEME_SWATCH } from './themes';

export type Params = Readonly<Record<string, EmbedValue>>;

/** A choice of a segmented or select row. value null = the option unset (Default, System, Automatic). */
export interface Choice {
  readonly value: Scalar | null;
  readonly key: string;
  /** Colours drawn before the label in a select (a theme's background, text and accent). */
  readonly swatch?: readonly string[];
}

interface RowBase {
  /** The catalogue id this row writes. */
  readonly id: string;
  /** Strings prefix: `${key}.label`, `${key}.help` (help is optional). */
  readonly key: string;
  /** Shown only while this holds (the row's option keeps its draft value while hidden; Save drops it). */
  readonly when?: (p: Params) => boolean;
  /** Disabled until this option has a value (help: "Add a page first"). */
  readonly needs?: string;
  /** The error key for a value the catalogue pattern refuses (else the generic texts of draft.ts). */
  readonly patternErr?: string;
  /** Applies when the program starts: the help line says so. */
  readonly start?: boolean;
}

export type Row =
  | (RowBase & { readonly kind: 'text'; readonly mono?: boolean; readonly placeholder?: string })
  | (RowBase & { readonly kind: 'int'; readonly unit?: string; readonly quick?: readonly number[]; readonly placeholder?: string })
  /** Boolean with an unknown default: Default · On · Off. */
  | (RowBase & { readonly kind: 'tri' })
  /** Boolean with a known default (or an off-only / hide flag): a switch showing defaultOn when unset; the other
   *  state writes `write`, and going back to the default unsets. */
  | (RowBase & { readonly kind: 'switch'; readonly defaultOn: boolean; readonly write: Scalar })
  | (RowBase & { readonly kind: 'seg'; readonly choices: readonly Choice[] })
  | (RowBase & { readonly kind: 'select'; readonly choices: readonly Choice[] })
  /** A colour, set in the kit colour picker (the catalogue's string: a hex, #RRGGBBAA or a CSS colour name). The picker
   *  flags other text; the Board's save does not check it. */
  | (RowBase & { readonly kind: 'colour' })
  /** Terminal theme: presets plus Custom… (JSON in the kit code editor). */
  | (RowBase & { readonly kind: 'termTheme' })
  /** Terminal font: a list plus Custom… (a CSS font list). */
  | (RowBase & { readonly kind: 'termFont' })
  /** Display quality: 4 preset cards and Fine-tune (encoding, video, bandwidth_limit, quality_mode, quality). */
  | { readonly kind: 'quality'; readonly id: 'encoding'; readonly ids: readonly string[]; readonly key: string }
  /** Display desktop size: Fit the tile · Fixed (override_width, written as a string; the viewer scales it to fit). */
  | { readonly kind: 'size'; readonly id: 'override_width'; readonly ids: readonly string[]; readonly key: string }
  /** Files page parts: Minimal switch + one checkbox per part. */
  | { readonly kind: 'parts'; readonly id: 'chromeless'; readonly ids: readonly string[]; readonly key: string };

export type RowKind = Row['kind'];

export interface Section {
  /** The placement id (embed/placement.ts section key). */
  readonly id: string;
  readonly rows: readonly Row[];
}

export interface OpensView {
  /** The view name ('root', 'folder', …). */
  readonly view: string;
  readonly key: string;
}

/** The fixed Opens block field of a view: required for that view, or optional (code folder on One extension). */
export interface OpensField {
  readonly id: string;
  /** Strings prefix per view: `${key}.label` / `.help` / `.required`. */
  readonly key: string;
  readonly patternErr?: string;
  readonly start?: boolean;
}

export interface Panel {
  /** The Opens control (files, browser, code), in order; the first is the start view of a new tile. */
  readonly opens?: readonly OpensView[];
  /** The Opens block's fields per view name. */
  readonly opensFields?: Readonly<Record<string, readonly OpensField[]>>;
  /** Terminal and agent: the live preview under the header. */
  readonly preview?: boolean;
  readonly sections: readonly Section[];
}

/** Every catalogue id a row writes. */
export function rowIds(r: Row): readonly string[] {
  return 'ids' in r ? r.ids : [r.id];
}

const DEF: Choice = { value: null, key: 'choice.default' };
const ch = (value: Scalar | null, key: string): Choice => ({ value, key });
const WEIGHTS: readonly Choice[] = [DEF, ...['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'].map((w) => ch(w, 'weight.' + w))];
const has = (p: Params, id: string) => p[id] !== undefined;
const sideways = (p: Params) => !has(p, 'panel-position') || p['panel-position'] === 'left' || p['panel-position'] === 'right';
const upright = (p: Params) => !has(p, 'panel-position') || p['panel-position'] === 'top' || p['panel-position'] === 'bottom';

/** Terminal sections, shared by agent (agent drops Session and the toolbar row). */
function terminalSections(agent: boolean): Section[] {
  const side = (row: Row): Row => (row.id === 'panel' ? row : ({ ...row, needs: 'panel' } as Row));
  return [
    ...(agent
      ? []
      : [{ id: 'session', rows: [
          { kind: 'text', id: 'cwd', key: 'term.cwd', mono: true, start: true, placeholder: 'term.cwd.placeholder' },
          { kind: 'tri', id: 'readonly', key: 'term.readonly' },
        ] satisfies Row[] }]),
    { id: 'window', rows: [
      { kind: 'text', id: 'title', key: 'term.title' },
      ...(agent ? [] : [{ kind: 'switch', id: 'hide-toolbar', key: 'term.toolbar', defaultOn: false, write: false } satisfies Row]),
    ] },
    { id: 'text', rows: [
      { kind: 'int', id: 'fontSize', key: 'term.fontSize', unit: 'unit.px' },
      { kind: 'termFont', id: 'fontFamily', key: 'term.fontFamily' },
      { kind: 'int', id: 'lineHeight', key: 'term.lineHeight' },
      { kind: 'int', id: 'letterSpacing', key: 'term.letterSpacing', unit: 'unit.px' },
    ] },
    { id: 'colours', rows: [
      { kind: 'termTheme', id: 'theme', key: 'term.theme' },
      { kind: 'colour', id: 'backgroundColor', key: 'term.background' },
      { kind: 'tri', id: 'drawBoldTextInBrightColors', key: 'term.bright' },
    ] },
    { id: 'cursor', rows: [
      { kind: 'seg', id: 'cursorStyle', key: 'term.cursorStyle', choices: [DEF, ch('block', 'cursor.block'), ch('underline', 'cursor.underline'), ch('bar', 'cursor.bar')] },
      { kind: 'tri', id: 'cursorBlink', key: 'term.cursorBlink' },
      { kind: 'int', id: 'cursorWidth', key: 'term.cursorWidth', unit: 'unit.px', when: (p) => p.cursorStyle === 'bar' },
      { kind: 'select', id: 'cursorInactiveStyle', key: 'term.cursorInactive', choices: [DEF, ch('outline', 'cursor.outline'), ch('block', 'cursor.block'), ch('bar', 'cursor.bar'), ch('underline', 'cursor.underline'), ch('none', 'cursor.none')] },
    ] },
    { id: 'sidepanel', rows: ([
      { kind: 'text', id: 'panel', key: 'term.panel', mono: true, placeholder: 'term.panel.placeholder' },
      { kind: 'tri', id: 'panel-visible', key: 'term.panelVisible' },
      { kind: 'seg', id: 'panel-position', key: 'term.panelPosition', choices: [DEF, ch('left', 'side.left'), ch('right', 'side.right'), ch('top', 'side.top'), ch('bottom', 'side.bottom')] },
      { kind: 'int', id: 'panel-width-pct', key: 'term.panelWidthPct', unit: 'unit.pct', when: sideways },
      { kind: 'int', id: 'panel-height-pct', key: 'term.panelHeightPct', unit: 'unit.pct', when: upright },
      { kind: 'tri', id: 'panel-resizable', key: 'term.panelResizable' },
    ] satisfies Row[]).map(side) },
    { id: 'scrolling', rows: [
      { kind: 'int', id: 'scrollback', key: 'term.scrollback', quick: [1000, 10000, 100000] },
      { kind: 'int', id: 'scrollSensitivity', key: 'term.scrollSpeed' },
      { kind: 'int', id: 'fastScrollSensitivity', key: 'term.fastScroll' },
      { kind: 'int', id: 'smoothScrollDuration', key: 'term.smooth', unit: 'unit.ms' },
    ] },
    { id: 'accessibility', rows: [
      { kind: 'tri', id: 'screenReaderMode', key: 'term.screenReader' },
      { kind: 'int', id: 'minimumContrastRatio', key: 'term.contrast' },
    ] },
    { id: 'advanced', rows: [
      { kind: 'select', id: 'fontWeight', key: 'term.fontWeight', choices: WEIGHTS },
      { kind: 'select', id: 'fontWeightBold', key: 'term.fontWeightBold', choices: WEIGHTS },
      { kind: 'text', id: 'panel-width', key: 'term.panelWidth', mono: true, placeholder: 'term.panelWidth.placeholder', needs: 'panel', when: sideways },
      { kind: 'text', id: 'panel-height', key: 'term.panelHeight', mono: true, placeholder: 'term.panelHeight.placeholder', needs: 'panel', when: upright },
      { kind: 'switch', id: 'disableResizeOverlay', key: 'term.resizeBadge', defaultOn: true, write: true },
      { kind: 'seg', id: 'unicodeVersion', key: 'term.unicode', choices: [ch(null, 'unicode.graphemes'), ch('11', 'unicode.11')] },
      { kind: 'seg', id: 'rendererType', key: 'term.renderer', choices: [ch(null, 'renderer.auto'), ch('webgl', 'renderer.webgl'), ch('canvas', 'renderer.canvas'), ch('dom', 'renderer.dom')] },
    ] },
  ];
}

const tri = (id: string, key: string): Row => ({ kind: 'tri', id, key });

export const PANELS: Readonly<Record<TileProgram, Panel>> = {
  terminal: { preview: true, sections: terminalSections(false) },
  agent: { preview: true, sections: terminalSections(true) },
  display: {
    sections: [
      { id: 'quality', rows: [{ kind: 'quality', id: 'encoding', ids: ['encoding', 'video', 'bandwidth_limit', 'quality_mode', 'quality'], key: 'display.quality' }] },
      { id: 'desktop', rows: [
        { kind: 'size', id: 'override_width', ids: ['override_width'], key: 'display.size' },
        tri('maximize_new_windows', 'display.maximize'),
        tri('decorations', 'display.decorations'),
        tri('dark_mode', 'display.dark'),
      ] },
      { id: 'look', rows: [
        { kind: 'seg', id: 'colorScheme', key: 'display.scheme', choices: [DEF, ch('light', 'scheme.light'), ch('dark', 'scheme.dark'), ch('system', 'scheme.system')] },
        { kind: 'select', id: 'theme', key: 'display.theme', choices: [DEF, ...['oc-1', 'aura', 'ayu', 'carbonfox', 'catppuccin', 'dracula', 'gruvbox', 'monokai', 'nightowl', 'nord', 'onedarkpro', 'shadesofpurple', 'solarized', 'tokyonight', 'vesper'].map((v) => ({ ...ch(v, 'ftheme.' + v), swatch: FILES_THEME_SWATCH[v] }))] },
        { kind: 'text', id: 'font', key: 'display.font', placeholder: 'display.font.placeholder', patternErr: 'err.fontName' },
      ] },
      { id: 'input', rows: [
        tri('readonly', 'display.readonly'),
        tri('keyboard', 'display.keyboard'),
        tri('swap_keys', 'display.swapKeys'),
        { kind: 'seg', id: 'scroll_reverse_y', key: 'display.reverseY', choices: [DEF, ch('auto', 'choice.auto'), ch('true', 'choice.on'), ch('false', 'choice.off')] },
        tri('scroll_reverse_x', 'display.reverseX'),
        { kind: 'int', id: 'scroll_speed', key: 'display.scrollSpeed', placeholder: 'display.scrollSpeed.placeholder' },
        { kind: 'int', id: 'touchpad_scroll_scale', key: 'display.touchpadScroll', placeholder: 'display.touchpadScroll.placeholder' },
      ] },
      { id: 'sharing', rows: [
        { kind: 'switch', id: 'clipboard', key: 'display.clipboard', defaultOn: true, write: false },
        { kind: 'switch', id: 'file_transfer', key: 'display.fileTransfer', defaultOn: true, write: false },
        { kind: 'switch', id: 'printing', key: 'display.printing', defaultOn: true, write: false },
        tri('sound', 'display.sound'),
      ] },
      { id: 'viewer', rows: [
        { kind: 'switch', id: 'toolbar', key: 'display.toolbar', defaultOn: true, write: false },
        tri('floating_menu', 'display.floatingMenu'),
        tri('clock', 'display.clock'),
        tri('display_notifications', 'display.notifications'),
        tri('reconnect', 'display.reconnect'),
        tri('title_show_hoody', 'display.titleHoody'),
        tri('title_show_display_id', 'display.titleId'),
      ] },
      { id: 'advanced', rows: [
        { kind: 'int', id: 'vrefresh', key: 'display.vrefresh', unit: 'unit.hz', placeholder: 'display.vrefresh.placeholder' },
        { kind: 'switch', id: 'offscreen', key: 'display.offscreen', defaultOn: true, write: false },
        tri('suspend_inactive_tab', 'display.suspend'),
        { kind: 'select', id: 'clipboard_preferred_format', key: 'display.clipFormat', choices: [DEF, ch('text/plain', 'clip.plain'), ch('text/html', 'clip.html'), ch('UTF8_STRING', 'clip.utf8')] },
        { kind: 'text', id: 'audio_codec', key: 'display.audioCodec', mono: true },
        { kind: 'switch', id: 'menu', key: 'display.menu', defaultOn: true, write: false },
        { kind: 'seg', id: 'clipboard_poll', key: 'display.clipPoll', choices: [DEF, ch(false, 'choice.off')] },
        tri('scroll', 'display.scroll'),
      ] },
    ],
  },
  files: {
    opens: [
      { view: 'root', key: 'files.view.root' },
      { view: 'folder', key: 'files.view.folder' },
      { view: 'editor', key: 'files.view.editor' },
      { view: 'search', key: 'files.view.search' },
    ],
    opensFields: {
      root: [],
      folder: [{ id: 'path', key: 'files.path.folder' }],
      editor: [{ id: 'path', key: 'files.path.file' }],
      search: [{ id: 'directory', key: 'files.directory' }, { id: 'q', key: 'files.q' }],
    },
    sections: [
      { id: 'listing', rows: [
        { kind: 'seg', id: 'sort', key: 'files.sort', choices: [DEF, ch('name', 'sort.name'), ch('mtime', 'sort.mtime'), ch('size', 'sort.size')] },
        { kind: 'seg', id: 'order', key: 'files.order', choices: [ch(null, 'order.asc'), ch('desc', 'order.desc')] },
      ] },
      { id: 'look', rows: [
        { kind: 'select', id: 'theme', key: 'files.theme', choices: [DEF, ...['oc-1', 'aura', 'ayu', 'carbonfox', 'catppuccin', 'dracula', 'gruvbox', 'monokai', 'nightowl', 'nord', 'onedarkpro', 'shadesofpurple', 'solarized', 'tokyonight', 'vesper'].map((v) => ({ ...ch(v, 'ftheme.' + v), swatch: FILES_THEME_SWATCH[v] }))] },
        { kind: 'seg', id: 'colorScheme', key: 'files.scheme', choices: [ch(null, 'scheme.system'), ch('light', 'scheme.light'), ch('dark', 'scheme.dark')] },
        { kind: 'select', id: 'font', key: 'files.font', choices: [DEF, ...['ibm-plex-mono', 'cascadia-code', 'fira-code', 'hack', 'inconsolata', 'intel-one-mono', 'iosevka', 'jetbrains-mono', 'meslo-lgs', 'roboto-mono', 'source-code-pro', 'ubuntu-mono'].map((v) => ch(v, 'ffont.' + v))] },
        { kind: 'int', id: 'fontSize', key: 'files.fontSize', unit: 'unit.px' },
      ] },
      { id: 'parts', rows: [{ kind: 'parts', id: 'chromeless', ids: ['chromeless', 'hideHeader', 'hideSidebar', 'hidePreview', 'hideFooter', 'borderless'], key: 'files.parts' }] },
      { id: 'advanced', rows: [{ kind: 'switch', id: 'embedBg', key: 'files.embedBg', defaultOn: false, write: 'transparent' }] },
    ],
  },
  browser: {
    opens: [
      { view: 'status', key: 'browser.view.status' },
      { view: 'display', key: 'browser.view.display' },
    ],
    sections: [
      { id: 'display', rows: [{ kind: 'switch', id: 'maximize_new_windows', key: 'browser.maximize', defaultOn: true, write: false }] },
      { id: 'advanced', rows: [{ kind: 'text', id: 'iframe_url', key: 'browser.iframe', mono: true, placeholder: 'browser.iframe.placeholder' }] },
    ],
  },
  code: {
    opens: [
      { view: 'root', key: 'code.view.root' },
      { view: 'editor', key: 'code.view.editor' },
      { view: 'extension', key: 'code.view.extension' },
    ],
    opensFields: {
      root: [],
      editor: [{ id: 'folder', key: 'code.folder', patternErr: 'err.slash', start: true }],
      extension: [{ id: 'extension', key: 'code.extension', patternErr: 'err.extension' }, { id: 'folder', key: 'code.folderOptional', patternErr: 'err.slash', start: true }],
    },
    sections: [
      { id: 'startup', rows: [
        { kind: 'text', id: 'locale', key: 'code.locale', mono: true, patternErr: 'err.locale', start: true, placeholder: 'code.locale.placeholder' },
        { kind: 'switch', id: 'disable-walkthroughs', key: 'code.walkthroughs', defaultOn: true, write: true, start: true },
        { kind: 'tri', id: 'page-loader', key: 'code.pageLoader', start: true },
      ] },
      { id: 'advanced', rows: [{ kind: 'tri', id: 'hoody-code', key: 'code.hoodyCode', start: true }] },
    ],
  },
  sqlite: {
    opens: [
      { view: 'overview', key: 'sqlite.view.overview' },
      { view: 'tables', key: 'sqlite.view.tables' },
      { view: 'query', key: 'sqlite.view.query' },
      { view: 'kvStore', key: 'sqlite.view.kvStore' },
      { view: 'history', key: 'sqlite.view.history' },
      { view: 'pragmas', key: 'sqlite.view.pragmas' },
    ],
    opensFields: {
      overview: [],
      tables: [{ id: 'table', key: 'sqlite.table' }],
      query: [],
      kvStore: [{ id: 'table', key: 'sqlite.kvTable' }],
      history: [],
      pragmas: [],
    },
    sections: [
      { id: 'database', rows: [{ kind: 'text', id: 'db', key: 'sqlite.db', mono: true, placeholder: 'sqlite.db.placeholder' }] },
      { id: 'look', rows: [{ kind: 'seg', id: 'colorScheme', key: 'sqlite.scheme', choices: [ch(null, 'scheme.system'), ch('light', 'scheme.light'), ch('dark', 'scheme.dark')] }] },
      { id: 'advanced', rows: [{ kind: 'tri', id: 'embed', key: 'sqlite.embed' }] },
    ],
  },
  // Notes: the ids are typed here until the page picker can list notebooks and pages.
  notes: {
    opens: [
      { view: 'home', key: 'notes.view.home' },
      { view: 'create', key: 'notes.view.create' },
      { view: 'notebook', key: 'notes.view.notebook' },
      { view: 'node', key: 'notes.view.node' },
      { view: 'alias', key: 'notes.view.alias' },
      { view: 'modal', key: 'notes.view.modal' },
    ],
    opensFields: {
      home: [],
      create: [],
      notebook: [{ id: 'userId', key: 'notes.userId', patternErr: 'err.notesId' }],
      node: [{ id: 'userId', key: 'notes.userId', patternErr: 'err.notesId' }, { id: 'nodeId', key: 'notes.nodeId', patternErr: 'err.notesId' }],
      alias: [{ id: 'userId', key: 'notes.userId', patternErr: 'err.notesId' }, { id: 'alias', key: 'notes.alias', patternErr: 'err.notesAlias' }],
      modal: [{ id: 'userId', key: 'notes.userId', patternErr: 'err.notesId' }, { id: 'nodeId', key: 'notes.nodeId', patternErr: 'err.notesId' }, { id: 'modalNodeId', key: 'notes.modalNodeId', patternErr: 'err.notesId' }],
    },
    sections: [
      { id: 'look', rows: [
        { kind: 'select', id: 'theme', key: 'notes.theme', choices: [DEF, ...['oc-1', 'hc-black', 'aura', 'ayu', 'carbonfox', 'catppuccin', 'dracula', 'gruvbox', 'monokai', 'nightowl', 'nord', 'onedarkpro', 'shadesofpurple', 'solarized', 'tokyonight', 'vesper'].map((v) => ch(v, 'ftheme.' + v))] },
        { kind: 'seg', id: 'colorScheme', key: 'notes.scheme', choices: [ch(null, 'scheme.system'), ch('light', 'scheme.light'), ch('dark', 'scheme.dark')] },
        { kind: 'select', id: 'font', key: 'notes.font', choices: [DEF, ...['ibm-plex-mono', 'cascadia-code', 'fira-code', 'hack', 'inconsolata', 'intel-one-mono', 'iosevka', 'jetbrains-mono', 'meslo-lgs', 'roboto-mono', 'source-code-pro', 'ubuntu-mono'].map((v) => ch(v, 'ffont.' + v))] },
      ] },
      { id: 'parts', rows: [
        { kind: 'switch', id: 'sidebar', key: 'notes.sidebar', defaultOn: true, write: 'hidden' },
        { kind: 'seg', id: 'mode', key: 'notes.mode', choices: [ch(null, 'notes.mode.app'), ch('readonly', 'notes.mode.readonly'), ch('readwrite', 'notes.mode.readwrite')] },
      ] },
    ],
  },
};

/** The ids of a view's Opens block (required unless the field says optional; see draft.ts). */
export function opensIds(panel: Panel): string[] {
  const out = new Set<string>();
  for (const fields of Object.values(panel.opensFields ?? {})) for (const f of fields) out.add(f.id);
  return [...out];
}

/** The panel as a placement (embed/placement.ts shape): Opens as the 'opens' group, Advanced apart. */
export function placementOf(program: TileProgram): { sections: Record<string, string[]>; advanced: string[]; pendingDesign: string[] } {
  const panel = PANELS[program];
  const sections: Record<string, string[]> = {};
  const opens = opensIds(panel);
  if (opens.length) sections.opens = opens;
  let advanced: string[] = [];
  for (const sec of panel.sections) {
    const ids = sec.rows.flatMap((r) => [...rowIds(r)]);
    if (sec.id === 'advanced') advanced = ids;
    else sections[sec.id] = ids;
  }
  return { sections, advanced, pendingDesign: [] };
}

/** The view a new tile and Reset all write: the first Opens view (files, code: 'root'; browser: the default). */
export function startView(program: TileProgram): string | undefined {
  return PANELS[program].opens?.[0]?.view;
}
