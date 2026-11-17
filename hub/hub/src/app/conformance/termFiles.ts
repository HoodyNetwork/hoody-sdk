// The terminal Hub's own source files, for conformance checks about how the WEB draws.
//
// A check about web drawing (dialog sizes, the theme's uppercase button labels, the Button chip)
// reads its files through `webDrawn(reason)`, which leaves out:
//   - every `*.term.*` file (a terminal sibling or a terminal test: the terminal draws its own way), and
//   - TERMINAL_ONLY_MODULES: terminal files without the `.term` marker, each with why (termFiles.test.ts proves only
//     terminal files import them).
// A check about the web BUILD's modules (kitPure: what vite marks side-effect free) uses `webBuilt(reason)`, which also
// leaves out `*.scenario.ts` (test input of both sides, loaded only by the scenario runners).
// A check about SHARED truth still reads `.term` files and must not use this: user strings, the storage/secrets
// registry, link targets (hubHref), page boundaries, one flag source, CodeBlock languages (the terminal CodeBlock
// colours by the same highlighter), the public-name rule.
//
// Each caller passes its reason; WEB_DRAWING_CHECKS lists them (termFiles.test.ts pins the list, so a new caller says
// why in one place).

/** Terminal-only modules that carry no `.term` marker (a `.term` file needs a web base): path -> why.
 *  Every terminal helper without a `.term` name is listed. The web typecheck leaves each one out by name (tsconfig.json
 *  `exclude`; termFiles.test.ts holds the two lists equal); the terminal typecheck reads them through their importers. */
// Also read (as text) by scripts/lint/term-imports.cjs: these files are terminal files for the import boundary too
// (they may import '@term/prim', and '@term/kit' under src/kit). Keep one `'path': 'why',` entry per line.
export const TERMINAL_ONLY_MODULES: Readonly<Record<string, string>> = Object.freeze({
  'kit/agent/sessionWindow.ts': 'the terminal SessionView\'s row window (cell widths), imported only by SessionView.term.tsx and its test',
  'kit/agent/tableWidths.ts': 'the terminal Reply\'s table column widths (cell widths), imported only by Reply.term.tsx and its test',
  'kit/agent/termKeyLine.tsx': 'the terminal composer\'s key-hint line (Box/Text), imported only by Composer.term.tsx and its test',
  'kit/data/DataTableTermLayout.ts': 'the terminal DataTable\'s column layout, imported only by DataTable.term.tsx and its test',
  'kit/data/termFlow.tsx': 'a sentence holding controls that wraps at any word (Box/Text), imported only by .term files and their tests',
  'kit/data/termIcons.ts': 'icon glyphs for terminal text, imported only by .term files',
  'kit/icons.glyphs.ts': 'the terminal icon glyph table, imported only by .term files and termIcons.ts',
  'kit/controls/termPress.tsx': 'the terminal soft-disabled pressable (SoftPress), imported only by .term files',
  'kit/forms/termField.tsx': 'the terminal field frame, control row and form context, imported only by .term files',
  'kit/layouts/scrollOwner.tsx': 'the terminal scroll owner\'s contexts and OwnScroll (React only), imported only by termScroll.tsx and .term files',
  'kit/layouts/termHarness.tsx': 'the terminal kit test harness, imported only by .term tests',
  'kit/layouts/termScroll.tsx': 'terminal scroll memory, imported only by .term files and the terminal app (src/term)',
  'kit/qr/termQrDialog.tsx': 'the terminal side of the kit QR surfaces, imported only by Qr.term.tsx and Handoff.term.tsx',
  'kit/layouts/termParts.tsx': 'terminal parts the layout siblings share (say, Inline, pieces), imported only by .term files and terminal-only modules',
  'kit/layouts/termTabs.tsx': 'the terminal row of tabs or views, imported only by Layouts.term.tsx',
  'kit/layouts/anatomy/termSection.tsx': 'the strict section\'s card in the terminal, imported only by Section.term.tsx, Layouts.term.tsx and their tests',
  'kit/data/termCopyText.ts': 'copyText bound to the calling mount (terminal clipboard), imported only by .term files and their tests',
  'kit/data/listRow.ts': 'where a two-line list row\'s name text starts (terminal DataTable), imported only by DataTable.term.tsx and cells.term.tsx',
  'kit/pickers/termStop.tsx': 'the terminal side of the pickers, imported only by PickerPanel.term.tsx and ModelListbox.term.tsx',
  'kit/states/termCopy.ts': 'copy to the terminal clipboard with a short-lived result, imported only by .term files and their tests',
});

/** A file path under hub/src ("kit/x/Y.term.tsx") that belongs to the terminal Hub only: a `.term` file, a file of
 *  the terminal app (src/term/**), or a TERMINAL_ONLY_MODULES entry. */
export function isTerminalFile(f: string): boolean {
  const base = f.slice(f.lastIndexOf('/') + 1);
  return /\.term(\.[A-Za-z0-9]+)+$/.test(base) || f.startsWith('term/') || Object.hasOwn(TERMINAL_ONLY_MODULES, f);
}

const checks = new Map<string, string>();
/** The checks that skip terminal files, and why (filled as each check calls webDrawn). */
export const WEB_DRAWING_CHECKS: ReadonlyMap<string, string> = checks;

/** A file filter for a check about web drawing: keeps everything but terminal files. `check` names it, `reason` says why. */
export function webDrawn(check: string, reason: string): (f: string) => boolean {
  if (!reason.trim()) throw new Error(`webDrawn(${check}): give the reason the terminal is exempt`);
  checks.set(check, reason);
  return (f) => !isTerminalFile(f);
}

/** Scenario support modules without a marker: path -> why (termFiles.test.ts proves who imports them). */
export const SCENARIO_SUPPORT: Readonly<Record<string, string>> = Object.freeze({
  'kit/layouts/scenarioRoute.tsx': 'mounts a scenario under a router; imported only by *.scenario.ts files and tests',
});

/** Test input, never imported by app code (termFiles.test.ts proves it): a shared behaviour scenario (`*.scenario.ts`,
 *  globbed by src/term/scenario/scenarios.web.test.ts and scripts/term/scenarios.ts), a `*.fixture.ts`, or a
 *  SCENARIO_SUPPORT entry. */
export function isScenarioFile(f: string): boolean {
  return /\.(scenario|fixture)\.ts$/.test(f) || Object.hasOwn(SCENARIO_SUPPORT, f);
}

/**
 * A file filter for a check about the WEB BUILD's modules (what vite bundles into the Hub): keeps everything but
 * terminal files (never in the web graph) and scenario files (loaded only by the two scenario runners). Same `check` /
 * `reason` bookkeeping as webDrawn.
 */
export function webBuilt(check: string, reason: string): (f: string) => boolean {
  if (!reason.trim()) throw new Error(`webBuilt(${check}): give the reason terminal and scenario files are exempt`);
  checks.set(check, reason);
  return (f) => !isTerminalFile(f) && !isScenarioFile(f);
}
