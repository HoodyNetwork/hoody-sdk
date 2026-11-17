// How each kit icon reads in a terminal (icons.term.tsx). Pure, no React: a test and any platform may read it.
// Three kinds:
//   glyph  a single-width symbol from fonts every terminal has (no Nerd Font, no emoji): status, direction, a menu mark.
//          Never an emoji-capable code point (\p{Emoji}: ↗ ↕ ↔ ▶ ✔ ⚠ ℹ …): terminals may draw it as a wide colour emoji.
//          icons.term.test.tsx refuses one.
//   label  no symbol says it; a short word stands in.
//   none   decorative (page and brand marks, icons always beside their own words): draws nothing.
// The table is typed Record<IconName, ...>, so a new icon in icons.tsx fails typecheck until it is classified here, and
// icons.term.test.tsx fails until it is in the same order as ICON_NAMES.
import type { IconName, PxIconName } from './icons';

export type IconGlyph = { kind: 'glyph'; glyph: string } | { kind: 'label'; label: string } | { kind: 'none' };

const g = (glyph: string): IconGlyph => ({ kind: 'glyph', glyph });
const w = (label: string): IconGlyph => ({ kind: 'label', label });
const none: IconGlyph = { kind: 'none' };

/** Every icon, in ICON_NAMES order. */
export const ICON_GLYPHS: Readonly<Record<IconName, IconGlyph>> = {
  // Page and object marks: always beside their names.
  home: none, board: none, computer: none, server: none, database: none, bot: none, agent: none, terminal: none,
  slash: g('/'), display: none, camera: none, files: none, browser: none, key: none, wallet: none, market: none, account: none,
  bell: none, mail: none, scripts: none, logs: none, ai: none, apps: none, notes: none, file: none, 'file-image': none,
  'file-code': none, 'file-archive': none, schedules: none, programs: none, guide: none, settings: none, qr: w('QR'),
  video: none, share: none, globe: none, realm: none, search: none,
  // Actions and directions.
  plus: g('+'), minus: g('−'), maximize: none, minimize: none, check: g('✓'), x: g('×'), external: g('⇗'),
  'chevron-right': g('›'), 'chevron-left': g('‹'), 'chevron-down': g('▾'), 'chevron-up': g('▴'), 'chevrons-up-down': g('⇕'),
  'arrow-up': g('↑'), 'arrow-down': g('↓'), 'arrow-left': g('←'), 'arrow-right': g('→'), pen: g('✎'), dots: g('…'),
  'dots-vertical': g('⋮'), copy: none, reload: g('↻'), filter: none, sliders: none, columns: none,
  // Status: never colour alone (the same marks as prim TONE_MARK).
  warn: g('!'), info: g('i'), error: g('✗'), 'check-circle': g('✓'), clock: g('◷'), calendar: none, eye: none,
  'eye-off': none, lock: w('lock'), trash: none, sun: g('☼'), moon: g('☾'), menu: g('≡'), 'sidebar-left': none,
  'panel-right': none, 'pane-single': none, 'pane-split': none, command: g('⌘'), logout: none, play: g('▷'), stop: g('■'), pause: g('‖'), download: g('↓'),
  upload: g('↑'), link: none, ip: none, flag: none, dock: none, sparkle: g('✦'), sprout: none, grip: g('⋮'),
  // Brand, chat, distribution and agent marks: always beside their names.
  logo: none, 'hoody-ai-agent': none, 'hoody-virtual-server': none, 'hoody-services': none, 'hoody-canvas': none,
  'hoody-private-key': none, 'hoody-ai': none, 'hoody-notes': none, 'hoody-code': none, 'hoody-cron': none,
  'hoody-logs': none, 'hoody-balance': none, 'hoody-account': none, 'hoody-overview': none, 'hoody-docs': none,
  'hoody-notifications': none, 'hoody-marketplace': none, 'hoody-kit': none, github: none, 'hoody-bots': none, google: none, telegram: none, slack: none,
  discord: none, debian: none, ubuntu: none, alpine: none, fedora: none, rocky: none, alma: none, arch: none,
  centos: none, linux: none, claude: none, openai: none, gemini: none, opencode: none,
};

/** The button chip's pixel icons (PxIcon). */
export const PX_GLYPHS: Readonly<Record<PxIconName, IconGlyph>> = {
  arrow: g('→'), external: g('⇗'), down: g('▾'), plus: g('+'), mic: none, check: g('✓'), dollar: g('$'),
};

/** What an icon draws: its glyph, its word, else (a decorative icon) the caller's label when it gave one, else ''. */
export function iconText(c: IconGlyph, label?: string): string {
  return c.kind === 'glyph' ? c.glyph : c.kind === 'label' ? c.label : (label ?? '');
}
