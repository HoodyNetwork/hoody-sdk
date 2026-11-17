// The CSS contracts SettingGroup rests on, judged on the real files, each judge with mutants and controls.
// - --pane-inset is always a length: SettingGroup rows compute their inset with it, and a bare `0` would make that
//   whole declaration invalid (rows with no inset at all).
// - Every surface publisher sets the four --sg-* properties; a flush body gives the rows back --pad-card; the detail
//   pane's phone rule (frameless) resets the frame properties, so a group there is framed again.
// - The subgrid fallback gives each row the group's own template.
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cssRules } from '../../app/conformance/cssScan';

type Files = Readonly<Record<string, string>>;
const SRC = join(import.meta.dirname, '..', '..');
const REAL: Files = Object.fromEntries(
  readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .map((f) => f.split(sep).join('/'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => [f, readFileSync(join(SRC, f), 'utf8')]),
);

const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '');

/** Each --pane-inset declaration whose value is not a length or a var(). */
export function paneInsetProblems(files: Files): string[] {
  const out: string[] = [];
  for (const [f, text] of Object.entries(files)) {
    for (const m of stripComments(text).matchAll(/--pane-inset\s*:\s*([^;}]+)/g)) {
      const v = (m[1] ?? '').trim();
      if (/^var\(/.test(v) || /^-?\d*\.?\d+(px|rem|em)$/.test(v) || /^(calc|max|min|clamp)\(/.test(v)) continue;
      out.push(`${f}: --pane-inset: ${v}`);
    }
  }
  return out;
}

const SG = ['--sg-bw', '--sg-fill', '--sg-pad', '--sg-pane'];

/** A publisher: the file, the selector (exactly as written), and the --sg-pad it must set. */
const PUBLISHERS: ReadonlyArray<readonly [string, string, string]> = [
  ['kit/layouts/Layouts.module.css', '.settingsSection', '0px'],
  ['kit/layouts/Layouts.module.css', '.panelBody', '0px'],
  ['kit/layouts/ListDetailPage.module.css', '.detail', 'var(--pad-card)'],
  ['kit/overlays/Drawer.module.css', '.body', '0px'],
  ['kit/overlays/Dialog.module.css', '.modal', '0px'],
];

const declsOf = (files: Files, file: string, sel: string, inAt?: RegExp) => {
  const text = files[file] ?? '';
  const scoped = inAt ? [...stripComments(text).matchAll(inAt)].map((m) => m[0]).join('\n') : stripComments(text).replace(/@(container|media|supports)[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  return cssRules(scoped)
    .filter((r) => r.sel.replace(/\s+/g, ' ').trim() === sel)
    .flatMap((r) => r.decls);
};

export function publisherProblems(files: Files): string[] {
  const out: string[] = [];
  for (const [file, sel, pad] of PUBLISHERS) {
    const decls = declsOf(files, file, sel);
    for (const p of SG) if (!decls.some((d) => d.prop === p)) out.push(`${file} ${sel}: no ${p}`);
    const bw = decls.find((d) => d.prop === '--sg-bw')?.value.trim();
    if (bw !== undefined && bw !== '0px') out.push(`${file} ${sel}: --sg-bw ${bw}`);
    const fill = decls.find((d) => d.prop === '--sg-fill')?.value.trim();
    if (fill !== undefined && fill !== 'transparent') out.push(`${file} ${sel}: --sg-fill ${fill}`);
    const got = decls.find((d) => d.prop === '--sg-pad')?.value.trim();
    if (got !== undefined && got !== pad) out.push(`${file} ${sel}: --sg-pad ${got}, wants ${pad}`);
  }
  const flush = declsOf(files, 'kit/layouts/Layouts.module.css', '.flush').find((d) => d.prop === '--sg-pad')?.value.trim();
  if (flush !== 'var(--pad-card)') out.push(`.flush: --sg-pad ${flush ?? 'missing'}`);
  // The pane's phone rule (frameless below 600 px of content) frames a group again.
  const phone = declsOf(files, 'kit/layouts/ListDetailPage.module.css', '.detail', /@container content \(width < 600px\)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g);
  for (const p of ['--sg-bw', '--sg-fill']) if (phone.find((d) => d.prop === p)?.value.trim() !== 'initial') out.push(`.detail phone: ${p} not reset`);
  return out;
}

/** The fallback's row templates must be the group's own. */
export function fallbackProblems(files: Files): string[] {
  const text = stripComments(files['kit/forms/SettingGroup.module.css'] ?? '');
  const group = (sel: string) => cssRules(text.replace(/@(container|supports)[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')).find((r) => r.sel.trim() === sel)?.decls.find((d) => d.prop === 'grid-template-columns')?.value.trim();
  const block = text.match(/@supports not \(grid-template-columns: subgrid\)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/)?.[0];
  if (!block) return ['no @supports not (grid-template-columns: subgrid) block'];
  const fb = (sel: string) => cssRules(block).find((r) => r.sel.trim() === sel)?.decls.find((d) => d.prop === 'grid-template-columns')?.value.trim();
  const out: string[] = [];
  if (fb('.row') !== group('.group')) out.push(`.row fallback ${fb('.row')} != .group ${group('.group')}`);
  if (fb('.field > .row') !== group('.field')) out.push(`.field > .row fallback ${fb('.field > .row')} != .field ${group('.field')}`);
  return out;
}

/** A field row's actions sit at the row start, centred on the first control line, never mid-way down a tall control
    (a RadioGroup or a list); the dropped placement (actions on their own line) adds no height. */
export function fieldActionProblems(files: Files): string[] {
  const text = stripComments(files['kit/forms/SettingGroup.module.css'] ?? '');
  const top = cssRules(text.replace(/@(container|media|supports)[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, ''));
  const decl = (sel: string, prop: string) =>
    top.filter((r) => r.sel.replace(/\s+/g, ' ').trim() === sel).flatMap((r) => r.decls).find((d) => d.prop === prop)?.value.trim();
  const row = '.field > .row:not(.switchRow, .noValue) > .action';
  const out: string[] = [];
  if (decl(row, 'align-self') !== 'start') out.push(`${row}: align-self ${decl(row, 'align-self') ?? 'missing'}`);
  if (decl(row, 'min-block-size') !== 'var(--ctl-h)') out.push(`${row}: min-block-size ${decl(row, 'min-block-size') ?? 'missing'}`);
  const drop = '.fieldWrap > .field > .row[data-sg-drop]:not(.switchRow, .noValue) > .action';
  if (decl(drop, 'min-block-size') !== '0') out.push(`${drop}: min-block-size ${decl(drop, 'min-block-size') ?? 'missing'}`);
  return out;
}

describe('SettingGroup CSS contracts', () => {
  it('a field row aligns its actions to the row start', () => {
    expect(fieldActionProblems(REAL)).toEqual([]);
  });

  it('every --pane-inset is a length', () => {
    expect(paneInsetProblems(REAL)).toEqual([]);
  });

  it('every surface publishes the group frame and inset', () => {
    expect(publisherProblems(REAL)).toEqual([]);
  });

  it('the subgrid fallback uses the group templates', () => {
    expect(fallbackProblems(REAL)).toEqual([]);
  });

  describe('mutants and controls', () => {
    const swap = (file: string, from: string | RegExp, to: string): Files => {
      const text = REAL[file] ?? '';
      const next = text.replace(from, to);
      if (next === text) throw new Error(`mutant did not apply in ${file}`);
      return { ...REAL, [file]: next };
    };

    it('a bare 0 pane inset is caught; 0px, var() and rem are fine', () => {
      expect(paneInsetProblems({ 'a.css': '.x { --pane-inset: 0; }' })).toHaveLength(1);
      expect(paneInsetProblems({ 'a.css': '.x { --pane-inset: 20; }' })).toHaveLength(1);
      expect(paneInsetProblems(swap('kit/controls/Tabs.module.css', '--pane-inset: 0px;', '--pane-inset: 0;'))).toHaveLength(1);
      expect(paneInsetProblems({ 'a.css': '.x { --pane-inset: 0px; } .y { --pane-inset: var(--sp-5); } .z { --pane-inset: 1rem; }' })).toEqual([]);
      // A commented-out bare 0 is not a declaration.
      expect(paneInsetProblems({ 'a.css': '/* --pane-inset: 0; */ .x { --pane-inset: 0px; }' })).toEqual([]);
    });

    it('a publisher that drops a property or frames, or a flush body that keeps 0, is caught', () => {
      expect(publisherProblems(swap('kit/layouts/Layouts.module.css', /\.panelBody \{\n  --sg-bw: 0px;\n/, '.panelBody {\n'))).toEqual(['kit/layouts/Layouts.module.css .panelBody: no --sg-bw']);
      expect(publisherProblems(swap('kit/overlays/Drawer.module.css', '--sg-fill: transparent;', '--sg-fill: var(--card-body);'))).toHaveLength(1);
      expect(publisherProblems(swap('kit/layouts/Layouts.module.css', /\.flush \{\n  --sg-pad: var\(--pad-card\);/, '.flush {\n  --sg-pad: 0px;'))).toEqual(['.flush: --sg-pad 0px']);
      expect(publisherProblems(swap('kit/layouts/ListDetailPage.module.css', '--sg-bw: initial;', '--sg-bw: 0px;'))).toEqual(['.detail phone: --sg-bw not reset']);
      expect(publisherProblems(swap('kit/layouts/ListDetailPage.module.css', '--sg-pad: var(--pad-card);', '--sg-pad: 0px;'))).toHaveLength(1);
      // A publisher that leaves out --sg-pane.
      expect(publisherProblems(swap('kit/overlays/Dialog.module.css', /\.modal \{([^}]*?)--sg-pane: 0px;\n/, '.modal {$1'))).toEqual(['kit/overlays/Dialog.module.css .modal: no --sg-pane']);
    });

    it('a field row whose actions centre on the whole row, or a dropped row that keeps the line height, is caught', () => {
      const f = 'kit/forms/SettingGroup.module.css';
      expect(fieldActionProblems(swap(f, /(\.field > \.row:not\(\.switchRow, \.noValue\) > \.action \{[^}]*?)align-self: start;/, '$1align-self: center;'))).toHaveLength(1);
      expect(fieldActionProblems(swap(f, /(\.field > \.row:not\(\.switchRow, \.noValue\) > \.action \{[^}]*?)min-block-size: var\(--ctl-h\);/, '$1'))).toHaveLength(1);
      expect(fieldActionProblems(swap(f, /(\[data-sg-drop\]:not\(\.switchRow, \.noValue\) > \.action \{[^}]*?)min-block-size: 0;/, '$1'))).toHaveLength(1);
    });

    it('a fallback that drifts from the group template, or goes, is caught', () => {
      const f = 'kit/forms/SettingGroup.module.css';
      const text = REAL[f] ?? '';
      const at = text.indexOf('@supports not');
      const drift = text.slice(0, at) + text.slice(at).replace('minmax(0, var(--setting-value-w)) auto;', 'minmax(0, 200px) auto;');
      expect(fallbackProblems({ ...REAL, [f]: drift })).toHaveLength(1);
      expect(fallbackProblems({ ...REAL, [f]: text.replace('@supports not (grid-template-columns: subgrid)', '@supports (display: grid)') })).toEqual(['no @supports not (grid-template-columns: subgrid) block']);
    });
  });
});
