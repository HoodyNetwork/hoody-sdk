// Reviewed exceptions to the Hub's design rules. Plain data, no imports: the lint configs
// read it through hub/scripts/lint/exceptions.cjs, and app/conformance.std.test.ts checks it. Every entry is added in a
// reviewed change. A why that names a missing
// kit feature is a kit request, not an exception. Stale entries fail. Never an inline disable of a hub/ rule.
export type LintException = {
  /** hub/src-relative file; a folder only when it ends in '/'. */
  readonly path: string;
  /** 'hub/<rule>', 'std.<rule>' or 'ui.<rule>', from EXCEPTABLE in hub/scripts/lint/exceptions.cjs. */
  readonly rules: readonly string[];
  /** Why no kit part or token can do it: data shown as data, a third-party mark, a dev tool, a decided look. */
  readonly why: string;
  /** Who granted the exception, and when. */
  readonly by: string;
  /** The id of the change that removes the entry, when it is temporary debt rather than a permanent exception. */
  readonly until?: string;
  /**
   * ui.* entries only: the functions the excepted hits sit in (the enclosing component, else the nearest named function, else
   * '<module>'). The entry then covers only those; a renamed or emptied site is stale on purpose.
   */
  readonly sites?: readonly string[];
};

export const EXCEPTIONS: readonly LintException[] = [
  {
    path: 'core/world.ts',
    rules: ['hub/no-raw-color'],
    why: 'computer colours in the fixture world are API data, not Hub colours',
    by: 'maintainers',
  },
  {
    path: 'kit/agent/Conversation.module.css',
    rules: ['hub/no-raw-line-height', 'hub/no-raw-duration'],
    why: 'the agent surface type, which has no type role: inline and block code at 12.5px/20px and the composer at 14px/22px (no role has 12.5px or 14px text, so no --lh-box role fits); the composer flash fades over 600ms, and no --dur token holds that time',
    by: 'maintainers',
  },
  {
    path: 'kit/agent/SessionView.module.css',
    rules: ['hub/no-raw-line-height'],
    why: 'the agent transcript prose at 14px/22px, a type the agent surface sets for itself; no role has 14px text, so no --lh-box role fits',
    by: 'maintainers',
  },
  {
    path: 'kit/base.css',
    rules: ['hub/no-raw-duration'],
    why: "performance mode's own end-at-once rule (0.001ms), which perf.conformance requires",
    by: 'maintainers',
  },
  {
    path: 'kit/data/DataTable.module.css',
    rules: ['hub/no-raw-duration'],
    why: 'the refresh bar sweep (1100ms linear, one 30% bar crossing the table top) has no motion role with its rhythm; reduced motion already shows a still bar (animation: none)',
    by: 'maintainers',
  },
  {
    path: 'kit/data/Ids.module.css',
    rules: ['hub/no-raw-line-height'],
    why: 'the placeholder chip in a code line: an 18px box plus its two 1px borders fills the 20px code line exactly, so the chip never grows the line; no --lh-box role has 18px',
    by: 'maintainers',
  },
  {
    path: 'kit/forms/ColorPicker.module.css',
    rules: ['hub/no-raw-shadow'],
    why: "the swatch's outer 4px ring, two --bw-2 outside the inner one; no 4px length token",
    by: 'maintainers',
  },
  {
    path: 'kit/forms/ColorPicker.pure.ts',
    rules: ['hub/no-raw-color'],
    why: 'the colours a person picks and the API stores (the API palette), shared by the web and terminal pickers',
    by: 'maintainers',
  },
  {
    path: 'kit/forms/ColorPicker.tsx',
    rules: ['hub/no-raw-color'],
    why: "the colours a person picks and the API stores, and the input's own empty value",
    by: 'maintainers',
  },
  {
    path: 'kit/gallery/computerPicker.tsx',
    rules: ['hub/no-raw-color'],
    why: 'sample computer colours in the gallery are API data, not Hub colours',
    by: 'maintainers',
  },
  {
    path: 'kit/gallery/kit3.tsx',
    rules: ['hub/no-raw-color'],
    why: 'ComputerMark samples: an ordinary colour, white, near-black and the surface grey, the data the mark draws',
    by: 'maintainers',
  },
  {
    path: 'kit/gallery/overlays.tsx',
    rules: ['hub/no-raw-color'],
    why: "a computer's colour is API data the gallery shows, not a Hub colour",
    by: 'maintainers',
  },
  {
    path: 'kit/gallery/view.tsx',
    rules: ['hub/no-raw-color'],
    why: "a computer's colour is API data the gallery shows, not a Hub colour",
    by: 'maintainers',
  },
  {
    path: 'kit/overlays/Drawer.module.css',
    rules: ['hub/no-raw-duration', 'hub/no-raw-shadow'],
    why: 'the one-shot attention flash (1.6s) and its 4px peak ring, and the 3px reduced-motion still ring; no duration or length token fits',
    by: 'maintainers',
  },
  {
    path: 'kit/pickers/ModelChooser.module.css',
    rules: ['hub/no-raw-shadow'],
    why: "the selected option's 3px bar, drawn as an inset shadow; no 3px length token",
    by: 'maintainers',
  },
  {
    path: 'kit/qr/Qr.module.css',
    rules: ['hub/no-raw-letter-spacing'],
    why: 'the 0.08em spacing of the hidden address mask (the bullet runs of qr.mask, aria-hidden): it spaces placeholder dots so they do not read as one bar, which is glyph spacing, not a type role',
    by: 'maintainers',
  },
  {
    path: 'kit/qr/Qr.tsx',
    rules: ['hub/no-raw-color'],
    why: 'scanner contrast: QR modules are black on white; qr.logo.test.tsx decodes the fill attributes',
    by: 'maintainers',
  },
  {
    path: 'kit/states/States.module.css',
    rules: ['hub/no-raw-line-height', 'hub/no-raw-duration'],
    why: 'the small empty title (15px text on a 20px line box; no type role has 15px text, so no --lh-box role fits) and the shimmer cycle (1400ms); no motion role has that rhythm',
    by: 'maintainers',
  },
  {
    path: 'kit/states/Toast.module.css',
    rules: ['hub/no-raw-line-height'],
    why: 'the toast title line (13px medium text on an 18px box, between the body 20px and small 16px role boxes; no --lh-box role has 18px)',
    by: 'maintainers',
  },
  {
    path: 'kit/tokenLayers.ts',
    rules: ['hub/no-raw-color'],
    why: 'the layer map files every token name in tokens.css as data, the blue family included; it sets no colour',
    by: 'maintainers',
  },
  {
    path: 'kit/widgets/PlanCard.module.css',
    rules: ['hub/blue-only-link-focus'],
    why: 'the PlanCard design: the accent tone on the edge only (--hx-plan-frame), no tint; checks are neutral, and PlanCard.test pins that',
    by: 'design review',
  },
  {
    path: 'kit/widgets/Widgets.module.css',
    rules: ['hub/no-raw-duration'],
    why: 'the busy meter slide cycle (1.6s); no motion role has that rhythm',
    by: 'maintainers',
  },
  {
    path: 'pages/board/fixtures.ts',
    rules: ['hub/no-raw-color'],
    why: 'computer colours are API data the Board shows, not Hub colours',
    by: 'maintainers',
  },
  {
    path: 'pages/board/options/themes.ts',
    rules: ['hub/no-raw-color'],
    why: 'terminal palettes are option values written into the theme JSON, not Hub colours',
    by: 'maintainers',
  },
  {
    path: 'pages/board/parts/Picker.tsx',
    rules: ['ui.computerList'],
    why: "the Board's mixed add-a-program picker chooses one item (a computer or a program) from a menu; a menu pick of one item is exempt from ComputerPicker/ContainerTable",
    by: 'design review',
    sites: ['Picker'],
  },
  {
    path: 'pages/board/parts/board.module.css',
    rules: ['hub/hover-parity'],
    why: 'the option remove button shows on hover only, with no keyboard or touch path yet',
    by: 'maintainers',
    until: 'board-option-keys',
  },
  {
    path: 'pages/bots/parts/WorkTab.tsx',
    rules: ['ui.computerList'],
    why: "bot work tables with a column named 'computer' (where a bot runs); the rows are bots and runs, not computers",
    by: 'design review',
    sites: ['WorkTab'],
  },
  {
    path: 'pages/bots/view.tsx',
    rules: ['ui.computerList'],
    why: "the bots list and table carry a column named 'computer' (where a bot runs); the rows are bots, not computers",
    by: 'design review',
    sites: ['BotsPage'],
  },
  {
    path: 'pages/computers/fixtures.ts',
    rules: ['hub/no-raw-color'],
    why: 'computer and project colours are API data the page shows, not Hub colours',
    by: 'maintainers',
  },
  {
    path: 'pages/files/Extract.tsx',
    rules: ['ui.folderField'],
    why: "'New folder' names a folder to create inside the chosen destination, not a folder path to browse to",
    by: 'design review',
    sites: ['ExtractDialog'],
  },
  {
    path: 'shell/BottomNav.module.css',
    rules: ['hub/no-raw-line-height'],
    why: 'two line boxes on 11px text: the tab label 14px (the label line under the tab icon) and the count badge 16px, equal to the badge height so its number sits centred; no --lh-box role is for 11px text (no label box token, by design)',
    by: 'maintainers',
  },
  {
    path: 'shell/Sidebar.module.css',
    rules: ['hub/no-raw-shadow'],
    why: 'the 4px ink ring inside the inset focus ring on the current row, which keeps focus visible over the accent fill (no 4px length token, the same class as the kit Drawer and ColorPicker rings)',
    by: 'maintainers',
  },
  {
    path: 'shell/Switchers.tsx',
    rules: ['ui.computerList'],
    why: 'the top-bar computer switcher and its phone sheet choose one computer from a menu; a menu pick of one computer is exempt from ComputerPicker/ContainerTable',
    by: 'design review',
    sites: ['ComputerSwitcher', 'PhoneContext'],
  },
  {
    path: 'shell/pageHost.module.css',
    rules: ['hub/no-raw-duration'],
    why: 'the navigation pending bar grows from 10% to 90% over 2400ms, after its 150ms delay: a progress estimate for a slow page, not a UI transition; no motion role has that length, and reduced motion already shows a still bar (pending-show 0ms, transform none)',
    by: 'maintainers',
  },
  {
    path: 'term/prim/tokens.ts',
    rules: ['hub/no-raw-color'],
    why: 'the terminal token table: the one file that defines the terminal colour values (dark, light, 16-colour), as tokens.css does for the web; pages and prims read them by role',
    by: 'maintainers',
  },
];

/** Barrel exports that draw nothing (providers, contexts), so the gallery cannot show them (UI-G fills it). */
export const NON_VISUAL_KIT_EXPORTS: readonly string[] = [
  'SrOnly', // words for a screen reader, with no space on the screen; it draws nothing
  'ToolbarScope', // a plain div that sets the 32 toolbar tokens for what it wraps; it draws nothing of its own
  'SendQueue', // a class (Talk's capture frame queue, lazy chunk); it draws nothing
  'TurnRun', // runs one typed "/" ask through the chat's turn menu items once; it draws nothing
  'Handoff', // on the web it is the part it wraps (its children); its own drawing is the terminal stand-in (states/Handoff.term.tsx)
  'PageBlock', // on the web it is its children (the page's CSS sets the gap); the terminal adds one blank row under them (layouts/PageBlock.term.tsx)
  'GateAllowAll', // a context: the host's "allow everything" ask that GateCard offers when set; it draws nothing
  'DropArea', // a plain div that takes drops for what it wraps (data/drag.tsx); it draws only the drag's outline and hint
];
