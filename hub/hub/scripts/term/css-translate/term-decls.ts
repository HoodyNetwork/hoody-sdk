// Declarations the terminal reads in place of the stylesheet's own, one class and property at a time.
//
// For a pixel size the web tuned to what it draws there and that does not hold for what the terminal draws in the same
// place: the web's icon buttons are words here ("[Put Terminal on Board]"), so a tile "168px: wide enough for its whole
// actions row" is 21 cells and cuts that row. The web file stays as it is; the terminal value is stated here, with why.
//
// Rules: a row names the class (module path # class), the property, the stylesheet's value it replaces (`web`) and the
// terminal's (`term`). It applies to the class's own base rule only. When the stylesheet no longer says `web`, the row
// is stale: it is NOT applied, and the term-decls test fails until the row is reviewed against the new web value.
export interface TermDecl { cls: string; prop: string; web: string; term: string; why: string }

export const TERM_DECLS: readonly TermDecl[] = [
  {
    cls: 'pages/computers/parts/parts.module.css#useGrid',
    prop: 'grid-template-columns',
    web: 'repeat(auto-fit, minmax(min(168px, 100%), 1fr))',
    term: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))',
    why: 'a use tile holds its actions row whole: the row inset, "⧉ copy", "[QR]" and "[Put Terminal on Board]" are 40 cells; 168px (21 cells) fits the web\'s three icon buttons only',
  },
  {
    cls: 'pages/bots/parts/pane.module.css#runtimeText',
    prop: 'flex',
    web: '1 1 200px',
    term: '1 1 100%',
    why: 'an Activity event row\'s message takes the line under its label, at the row\'s width: beside a 40-cell "Task report · <task> · on atlas" label 200px (25 cells) wrapped a sentence over 4+ lines of one or two words, and at 40 cells a longer message still wrapped in half the row with its label centred against three lines',
  },
  {
    cls: 'pages/bots/parts/pane.module.css#log',
    prop: 'gap',
    web: 'var(--sp-2)',
    term: 'var(--sp-3)',
    why: 'one blank row between the turns of a Bot\'s Activity: a turn is several lines here (who, the words, the time), and 8px stacks as no row at all, so a reply, an event and the next message ran together as one block of text',
  },
  {
    cls: 'pages/scripts/parts/Building.module.css#row',
    prop: 'grid-template-columns',
    web: 'minmax(0, 1fr) fit-content(40rem) auto auto auto',
    term: 'minmax(128px, 1fr) fit-content(40rem) auto auto',
    why: 'a build row\'s description keeps 16 cells: the web\'s words are narrower than the terminal\'s "[Open] [Stop] [Discard]" (23 cells), so at 80 columns the buttons, the age and the step text ("Running a code check") took the whole row and a build drew with no description at all; the step text now gives way first',
  },
  {
    cls: 'pages/scripts/parts/Building.module.css#row',
    prop: 'gap',
    web: 'var(--sp-3)',
    term: '0 var(--sp-3)',
    why: 'no blank row between a build row\'s line and its buttons under it: 12px is a whole row here, so each build took three rows with an empty one in the middle',
  },
  {
    cls: 'pages/scripts/parts/Building.module.css#actions',
    prop: 'justify-content',
    web: 'flex-end',
    term: 'flex-start',
    why: 'a build row\'s buttons start under its description, as on the narrow layout: on their own line at the right edge they sat 60 cells away from the build they act on',
  },
  {
    cls: 'pages/guide/parts/guide.module.css#doors',
    prop: 'grid-template-columns',
    web: 'var(--plate-rail-w) minmax(0, 1fr)',
    term: 'max-content minmax(0, 1fr)',
    why: 'the ways rail is as wide as its names ("Chat apps") and the commands get the rest: 176px is 22 cells of a 62-cell card here, which left a command 17 cells and broke its words in the middle ("ANTHROPIC_BASE_U" / "RL=")',
  },
  {
    cls: 'pages/keys/parts/keys.module.css#frameHead',
    prop: 'padding',
    web: 'var(--sp-4) var(--pad-page) 0',
    term: '0 var(--pad-page) 0',
    why: 'the page title is the first row under the top bar, as on every other page: the web\'s 16px above the Keys header is a whole blank row here, one of the 22 a page has at 80x24',
  },
  {
    cls: 'pages/computers/parts/parts.module.css#outputPanel',
    prop: 'min-block-size',
    web: '240px',
    term: '0',
    why: 'the Run tab\'s output panel is as tall as what it holds: 240px is 10 rows here, blank until a command prints, and they pushed the run\'s status ("The command didn\'t go through", "Exit code 127") below the pane: 16 wheel notches away at 80x24, so a refused run looked like nothing happened',
  },
];

const norm = (v: string): string => v.replace(/\s+/g, ' ').trim();

/** The terminal's value for a base-rule declaration, or undefined (no row, or the row is stale: the web value moved). */
export function termDecl(cls: string, prop: string, webValue: string, rows: readonly TermDecl[] = TERM_DECLS): string | undefined {
  const row = rows.find((r) => r.cls === cls && r.prop === prop);
  return row && norm(row.web) === norm(webValue) ? row.term : undefined;
}
