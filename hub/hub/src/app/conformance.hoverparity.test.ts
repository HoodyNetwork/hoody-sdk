// @vitest-environment node
// Hover parity: what a stylesheet shows on :hover it also shows on keyboard focus and on
// touch, in the same file. hub/hover-parity runs alone for the fixtures (no anatomy scan), and through the Hub's real config for
// its severity and the listed entries (app/conformance/exceptions.ts).
import { createRequire } from 'node:module';
import path from 'node:path';
import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';
import { lintMs } from './conformance/budget';

const HUB = path.resolve(__dirname, '..', '..');
const SRC = path.join(HUB, 'src');
const RULE = 'hub/hover-parity';
const X = createRequire(import.meta.url)('../../scripts/lint/exceptions.cjs') as {
  STYLELINT: string[];
  forStylelint(entries?: unknown): Array<{ files: string[]; rules: Record<string, unknown> }>;
};
const FILE = path.join(SRC, 'kit', 'data', 'plant.module.css');

const plugins = async () => (await import(path.join(HUB, 'scripts', 'lint', 'stylelint-hub.mjs'))).default;
const realConfig = async () => (await import(path.join(HUB, 'stylelint.config.mjs'))).default as { rules: Record<string, unknown>; overrides: object[] };
/** The rule's warnings for a stylesheet, the rule alone (or through `config`). */
async function hits(code: string, file = FILE, config?: object) {
  const cfg = config ?? { plugins: await plugins(), rules: { [RULE]: true } };
  const { results } = await stylelint.lint({ code, codeFilename: file, config: cfg });
  return (results[0]?.warnings ?? []).filter((w) => w.rule === RULE);
}

const REVEAL = '.row:hover .go { opacity: 1; }\n';
const FOCUS = '.row:focus-within .go { opacity: 1; }\n';
const TOUCH = '@media (hover: none) { .go { opacity: 1; } }\n';

describe('hub/hover-parity finds a hover-only reveal', () => {
  it('a reveal without twins, with a focus twin only, or a touch twin only, is one hit', async () => {
    expect(await hits(REVEAL)).toHaveLength(1);
    expect(await hits(REVEAL + FOCUS)).toHaveLength(1);
    expect(await hits(REVEAL + TOUCH)).toHaveLength(1);
  });
  it('both twins in the same file clear it, in any order, and the reveal list may hold the focus twin', async () => {
    expect(await hits(REVEAL + FOCUS + TOUCH)).toHaveLength(0);
    expect(await hits(TOUCH + FOCUS + REVEAL)).toHaveLength(0);
    expect(await hits('.row:hover .go,\n.row:focus-visible .go { opacity: 1; }\n' + TOUCH)).toHaveLength(0);
    expect(await hits('.row:hover .go, .row[data-focus-visible] .go { opacity: 1; }\n' + TOUCH)).toHaveLength(0);
  });
  it('every reveal property counts: opacity, visibility, display, pointer-events', async () => {
    for (const d of ['opacity: 1', 'visibility: visible', 'display: flex', 'pointer-events: auto', 'Opacity: 1'])
      expect(await hits(`.row:hover .go { ${d}; }\n`), d).toHaveLength(1);
  });
  it('every combinator after :hover counts: descendant, child, next and later sibling', async () => {
    for (const s of ['.row:hover .go', '.row:hover > .go', '.row:hover + .go', '.row:hover ~ .go', '.list .row:hover  >  .go', '.row:hover>.go', '.row:hover~.go'])
      expect(await hits(`${s} { opacity: 1; }\n`), s).toHaveLength(1);
  });
  it('every no-hover media form is a touch twin', async () => {
    for (const q of ['(hover: none)', '(pointer: coarse)', '(any-hover: none)', '(hover:none)', 'screen and (pointer: coarse)'])
      expect(await hits(`${REVEAL}${FOCUS}@media ${q} { .go { opacity: 1; } }\n`), q).toHaveLength(0);
  });
  it('a touch rule that hides the target and replaces it counts (DataTable row actions)', async () => {
    expect(await hits(`${REVEAL}${FOCUS}@media (pointer: coarse) { .go { display: none; } }\n`)).toHaveLength(0);
  });
  it('the message names the fix', async () => {
    const [w] = await hits(REVEAL);
    expect(w?.text).toContain('shown on hover only: reveal it on keyboard focus and on touch (no hover) too');
  });
});

describe('hub/hover-parity leaves the rest alone', () => {
  it('a selector list that also holds the selector without :hover is a reset, not a reveal (DataTable cards)', async () => {
    expect(await hits('.cards .tr > td,\n.cards .tr:hover > td { display: block; }\n')).toHaveLength(0);
  });
  it(':hover on the element itself, or with nothing revealed, or a reveal property elsewhere is no hit', async () => {
    expect(await hits('.row:hover { opacity: 1; }\n')).toHaveLength(0);
    expect(await hits('.row:hover .go { color: var(--hx-ink); }\n')).toHaveLength(0);
    expect(await hits('.row .go { opacity: 1; }\n')).toHaveLength(0);
    expect(await hits('.row:not(:hover) .go { opacity: 0; }\n')).toHaveLength(0);
  });
  it('a twin must name the same target, and a touch twin must sit in a no-hover block', async () => {
    expect(await hits(`${REVEAL}.row:focus-within .goal { opacity: 1; }\n${TOUCH}`)).toHaveLength(1);
    expect(await hits(`${REVEAL}${FOCUS}@media (hover: none) { .gone { opacity: 1; } }\n`)).toHaveLength(1);
    expect(await hits(`${REVEAL}${FOCUS}@media (hover: hover) { .go { opacity: 1; } }\n`)).toHaveLength(1);
    expect(await hits(`${REVEAL}${FOCUS}.go { opacity: 1; }\n`)).toHaveLength(1);
  });
});

describe('hub/hover-parity', () => {
  it('(a) one tokenizer: quotes, brackets and hex escapes never make or hide a combinator or a :hover', async () => {
    expect(await hits('.row:hover.\\67 o { opacity: 1; }\n'), 'hex escape then space: self-hover on .row.go').toHaveLength(0);
    expect(await hits('.row[data-label="("]:hover .go { opacity: 1; }\n'), 'quoted paren').toHaveLength(1);
    expect(await hits('.row[data-label="]:hover"] .go { opacity: 1; }\n'), ':hover inside a string').toHaveLength(0);
    expect(await hits(".row[data-x='a > b ~ c'] .go:hover { opacity: 1; }\n"), 'combinators inside a string').toHaveLength(0);
  });
  it('(b) a positive :is()/:where()/:has() hover is a reveal; only :not(:hover) is ignored', async () => {
    expect(await hits('.row:is(:hover) .go { opacity: 1; }\n')).toHaveLength(1);
    expect(await hits(':where(.row:hover) .go { opacity: 1; }\n')).toHaveLength(1);
    expect(await hits('.row:has(.tip:hover) .go { opacity: 1; }\n')).toHaveLength(1);
    expect(await hits('.row:not(:hover) .go { opacity: 0; }\n')).toHaveLength(0);
    expect(await hits(`.row:is(:hover) .go { opacity: 1; }\n${FOCUS}${TOUCH}`), ':is(:hover) is .row hovered: the .row twins clear it').toHaveLength(0);
  });
  it('(c) a twin counts only if it reveals: same property, positive focus, a touch query that is not negated', async () => {
    expect(await hits(`${REVEAL}.row:focus-within .go { color: inherit; }\n${TOUCH}`), 'focus twin sets no reveal property').toHaveLength(1);
    expect(await hits(`${REVEAL}.row:focus-within .go { visibility: visible; }\n${TOUCH}`), 'focus twin sets another property').toHaveLength(1);
    expect(await hits(`${REVEAL}${FOCUS}@media (hover: none) { .go { color: inherit; } }\n`), 'touch twin sets no reveal property').toHaveLength(1);
    expect(await hits(`${REVEAL}${FOCUS}@media (hover: none) { .go { display: block; } }\n`), 'touch display other than none is neither the property nor a hide').toHaveLength(1);
    expect(await hits(`${REVEAL}.row:not(:focus-within) .go { opacity: 1; }\n${TOUCH}`), 'negated focus').toHaveLength(1);
    expect(await hits(`${REVEAL}.row:hover:focus-within .go { opacity: 1; }\n${TOUCH}`), 'a focus twin that still needs hover is no twin, and is itself a hover reveal').toHaveLength(2);
    expect(await hits(`${REVEAL}${FOCUS}@media not all and (hover: none) { .go { opacity: 1; } }\n`), 'negated media').toHaveLength(1);
    expect(await hits(`${REVEAL}${FOCUS}@media (not (hover: none)) { .go { opacity: 1; } }\n`), 'negated feature').toHaveLength(1);
    expect(await hits(`${REVEAL}${FOCUS}@media print, (pointer: coarse) { .go { opacity: 1; } }\n`), 'one positive query of a list').toHaveLength(0);
    expect(await hits(`${REVEAL}.row:focus-within .go, .x { opacity: 1; }\n${TOUCH}`), 'twin in a list').toHaveLength(0);
  });
  it('(d) the target is the compound with its states stripped, and the hovered ancestor must match', async () => {
    expect(await hits(`${REVEAL}.go:focus-visible { opacity: 1; }\n${TOUCH}`), 'self focus twin').toHaveLength(0);
    expect(await hits(`${REVEAL}.go[data-focus-visible] { opacity: 1; }\n${TOUCH}`), 'self data-focus-visible twin').toHaveLength(0);
    expect(await hits(`${REVEAL}.toolbar:focus-within .go { opacity: 1; }\n${TOUCH}`), 'another ancestor').toHaveLength(1);
    expect(await hits(`${REVEAL}.row:focus-within > .go { opacity: 1; }\n${TOUCH}`), 'another combinator').toHaveLength(1);
    expect(await hits(`${REVEAL}${FOCUS}@media (hover: none) { .row .go { opacity: 1; } }\n`), 'touch twin with the same ancestor').toHaveLength(0);
    expect(await hits(`${REVEAL}${FOCUS}@media (hover: none) { .list .go { opacity: 1; } }\n`), 'touch twin with another ancestor').toHaveLength(1);
  });
});

describe('hub/hover-parity in the Hub config', () => {
  it('is an error with no warning severity, and an entry may name it', async () => {
    const { rules } = await realConfig();
    expect(rules[RULE]).toBe(true);
    expect(X.STYLELINT).toContain(RULE);
  });
  it('the board entry switches off its own file and leaves its siblings on; the Ask panel has no entry left', async () => {
    const config = await realConfig();
    // The Ask panel has no entry: its message time sits in the author row, never on hover only, so the rule is on there.
    expect(await hits(REVEAL, path.join(SRC, 'ask', 'Ask.module.css'), config)).toHaveLength(1);
    expect(await hits(REVEAL, path.join(SRC, 'ask', 'AskPlant.module.css'), config)).toHaveLength(1);
    expect(await hits(REVEAL, path.join(SRC, 'pages', 'board', 'parts', 'board.module.css'), config)).toHaveLength(0);
    expect(await hits(REVEAL, path.join(SRC, 'pages', 'board', 'parts', 'plant.module.css'), config)).toHaveLength(1);
  }, lintMs(300_000));
  it('the tree has no hover-only reveal outside the listed entries (the DataTable sort icon has its touch look)', async () => {
    const config = { plugins: await plugins(), rules: { [RULE]: true }, overrides: X.forStylelint() };
    const { results } = await stylelint.lint({ files: path.join(SRC, '**', '*.css'), config });
    const left = results.flatMap((r) => r.warnings.filter((w) => w.rule === RULE).map((w) => `${path.relative(SRC, r.source ?? '')}:${w.line}`));
    expect(left).toEqual([]);
  }, lintMs(300_000));
});
