// @vitest-environment node
// Page structure ratchet: a page, the shell and Ask build their screens from kit parts, so nothing here restyles a kit
// control, card or heading from a page class, reaches out of its CSS module, keeps a button recipe of its own, writes a
// raw radio or checkbox, or drops a loose hint paragraph (the rules and what fixes each: conformance/structureScan.ts).
// Today's offenders are counted per file in conformance/structure.allow.json; a file may not gain a hit and no new file
// may join. Related ratchets with rows in the page allow files: ui.kitClass, ui.pageLook and ui.rawControl (every class
// or look a page hands a kit part), layout.bandsPerSection (stacked Bands), layout.text (text outside a kit place).
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { judge, lowerOnDisk, readTable, strict } from './conformance/ratchet';
import { STRUCT_FIX, STRUCT_RULES, structureCounts, structureScan, type StructRule } from './conformance/structureScan';

const SRC = join(import.meta.dirname, '..');
const TABLE = join(import.meta.dirname, 'conformance', 'structure.allow.json');
const tree = (): Record<string, string> =>
  Object.fromEntries(
    readdirSync(SRC, { recursive: true, encoding: 'utf8' })
      .map((f) => f.split(sep).join('/'))
      .filter((f) => /^(?:pages|shell|ask)\//.test(f) && /\.(?:tsx|css)$/.test(f))
      .map((f) => [f, read(f)]),
  );
/** A file another process removed between the listing and the read reads as empty. */
function read(f: string): string {
  try {
    return readFileSync(join(SRC, f), 'utf8');
  } catch {
    return '';
  }
}

describe('page structure ratchet', () => {
  const hits = structureScan(tree());
  const counts = structureCounts(hits);
  const rows = readTable(TABLE);
  const where = (rule: string, file: string) =>
    '\n' + hits.filter((h) => h.rule === rule && h.file === file).slice(0, 6).map((h) => `      hub/src/${h.file}:${h.line}  ${h.what}`).join('\n') + `\n      fix: ${STRUCT_FIX[rule as StructRule]}`;
  const verdict = judge(counts, rows, where);

  it('no file gained a hand-built piece (each line names the kit part that replaces it)', () => {
    expect(verdict.grew, 'new page-private structure. Fix the site with the kit part named under it; rows in hub/src/app/conformance/structure.allow.json never rise (when the kit lacks the part, the kit gets it first)').toEqual([]);
  });

  it('the table names only known rules and files that exist', () => {
    expect(Object.keys(rows).filter((r) => !(STRUCT_RULES as readonly string[]).includes(r))).toEqual([]);
    const all = tree();
    expect(Object.values(rows).flatMap((r) => Object.keys(r)).filter((f) => !(f in all)), 'rows of files that are gone: delete them (HUB_RATCHET_LOWER=1 does it)').toEqual([]);
  });

  it.runIf(strict() || process.env.HUB_RATCHET_LOWER === '1')('no row is stale (integration gate): a fixed site lowers its row', () => {
    if (lowerOnDisk(TABLE, counts, rows)) return;
    expect(verdict.stale, 'rows above what is left: run this test once with HUB_RATCHET_LOWER=1 (it only lowers)').toEqual([]);
  });
});

// The rules against fixtures: each mutant hits, each control stays clean.
describe('structure rules (fixtures)', () => {
  const kit = "import { Button, Tag, Stack } from '@kit';\nimport s from './x.module.css';\n";
  const scan = (tsx: string, css: string) => structureScan({ 'pages/x/view.tsx': kit + tsx, 'pages/x/x.module.css': css }).map((h) => h.rule);

  it('kitRestyle: a class on a kit control that sets its look is a hit; layout, a size floor, a layout part and a page element are not', () => {
    const page = 'export const V = () => <Button className={s.go}>go</Button>;';
    expect(scan(page, '.go { background: var(--hx-acc); }')).toEqual(['struct.kitRestyle']);
    expect(scan(page, '.go[data-hovered] { color: var(--hx-ink); }')).toEqual(['struct.kitRestyle']);
    expect(scan(page, '.wrap .go { --btn-h: 20px; }')).toEqual(['struct.kitRestyle']);
    expect(scan('export const V = () => <Tag className={on ? s.go : undefined}>x</Tag>;', '.go { text-transform: none; }')).toEqual(['struct.kitRestyle']);
    expect(scan(page, '.go { margin-inline-start: auto; flex: none; min-block-size: 44px; }')).toEqual([]);
    expect(scan('export const V = () => <Stack className={s.go}>x</Stack>;', '.go { background: var(--hx-acc); }')).toEqual([]);
    expect(scan('export const V = () => <div className={s.go} />;', '.go { background: var(--hx-acc); }')).toEqual([]);
    // a class of the same name on another element of the rule (not the last compound) styles something else
    expect(scan(page, '.go > span { color: var(--hx-ink); }')).toEqual([]);
  });

  it('globalReach: :global() naming anything but a theme scope is a hit', () => {
    const page = 'export const V = () => <div className={s.a} />;';
    expect(scan(page, ":global(*):has(> .a) :global([role='dialog']) { padding: 0; }")).toEqual(['struct.globalReach']);
    expect(scan(page, ":global(.kitThing) .a { margin: 0; }")).toEqual(['struct.globalReach']);
    expect(scan(page, ":global(:root[data-hx-theme='dark']) .a { margin: 0; }")).toEqual([]);
  });

  it('pressable: pointer cursor with a fill and a border is a button recipe; any two of the three are not', () => {
    const page = 'export const V = () => <div className={s.a} />;';
    expect(scan(page, '.a { cursor: pointer; background: var(--hx-raised); border: var(--bw) solid var(--hx-line); }')).toEqual(['struct.pressable']);
    expect(scan(page, '.a { cursor: pointer; background: var(--hx-raised); border: 0; }')).toEqual([]);
    expect(scan(page, '.a { cursor: pointer; background: transparent; border: var(--bw) solid var(--hx-line); }')).toEqual([]);
    expect(scan(page, '.a { background: var(--hx-raised); border: var(--bw) solid var(--hx-line); }')).toEqual([]);
  });

  it('rawChoice: a hand-written radio or checkbox input is a hit; another input type is not this rule', () => {
    expect(scan('export const V = () => <input type="radio" name="n" />;', '')).toEqual(['struct.rawChoice']);
    expect(scan("export const V = () => <input type={'checkbox'} />;", '')).toEqual(['struct.rawChoice']);
    expect(scan('export const V = () => <input type="file" />;', '')).toEqual([]);
  });

  it('looseHint: a <p> with a hint-named module class is a hit; another class or element is not', () => {
    expect(scan('export const V = () => <p className={s.hint}>x</p>;', '')).toEqual(['struct.looseHint']);
    expect(scan('export const V = () => <p className={cx(s.helpText, s.b)}>x</p>;', '')).toEqual(['struct.looseHint']);
    expect(scan('export const V = () => <p className={s.notes}>x</p>;', '')).toEqual([]);
    expect(scan('export const V = () => <span className={s.hint}>x</span>;', '')).toEqual([]);
  });
});
