// scripts/lint/term-imports.cjs: '@term/prim' for every terminal file, '@term/kit' for kit
// terminal files only; terminal-only modules (termFiles.ts TERMINAL_ONLY_MODULES, read from that file) count as
// terminal files; a web file imports nothing from the terminal.
import { expect, test } from 'bun:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const HUB = path.resolve(import.meta.dir, '..', '..');
const ti = createRequire(import.meta.url)('../lint/term-imports.cjs') as {
  termImport(file: string, spec: string): { ok: boolean; messageId?: string } | null;
  terminalOnlyModules(text?: string): string[];
  isTermFile(file: string): boolean;
  termImportJudged(file: string, spec: string): { ok: boolean; messageId?: string; debt?: unknown } | null;
};
type DebtRow = { file: string; spec: string; fixBy: string };
const debt = createRequire(import.meta.url)('../lint/term-imports.debt.cjs') as { FIX_BY: Record<string, string>; ROWS: DebtRow[] };
const at = (rel: string): string => path.join(HUB, 'src', rel);
const v = (rel: string, spec: string) => ti.termImport(at(rel), spec);

test('a page terminal file may import @term/prim only; @term/kit is refused there', () => {
  expect(v('pages/keys/parts/KeyRow.term.tsx', '@term/prim')).toEqual({ ok: true });
  expect(v('pages/keys/parts/KeyRow.term.tsx', '@term/kit')).toEqual({ ok: false, messageId: 'termKitOutside' });
  expect(v('shell/RenameRealms.term.tsx', '@term/kit')).toEqual({ ok: false, messageId: 'termKitOutside' });
});

test('a kit terminal file may import both; deep paths, other aliases and relative prim paths stay refused', () => {
  for (const s of ['@term/prim', '@term/kit']) expect(v('kit/agent/Composer.term.tsx', s)).toEqual({ ok: true });
  for (const s of ['@term/kit/Pressable', '@term/prim/Box', '@term', '@term/engine']) expect(v('kit/agent/Composer.term.tsx', s)).toEqual({ ok: false, messageId: 'termAliasDeep' });
  expect(v('kit/agent/Composer.term.tsx', '../../term/prim')).toEqual({ ok: false, messageId: 'termRelative' });
});

test('terminal-only modules (termFiles.ts list) are terminal files; web files and scenario files are not', () => {
  for (const f of ['kit/agent/termKeyLine.tsx', 'kit/agent/sessionWindow.ts', 'kit/agent/tableWidths.ts', 'kit/layouts/termScroll.tsx']) {
    expect(ti.isTermFile(at(f)), f).toBe(true);
    expect(v(f, '@term/kit'), f).toEqual({ ok: true });
  }
  for (const f of ['kit/agent/Composer.tsx', 'kit/agent/Reply.scenario.ts', 'pages/keys/parts/KeyRow.tsx']) {
    expect(ti.isTermFile(at(f)), f).toBe(false);
    for (const s of ['@term/prim', '@term/kit']) expect(v(f, s), `${f} ${s}`).toEqual({ ok: false, messageId: 'termAliasWeb' });
  }
});

test('the list is read from termFiles.ts and equals its TERMINAL_ONLY_MODULES; an unreadable list throws', async () => {
  const { TERMINAL_ONLY_MODULES } = await import('../../src/app/conformance/termFiles');
  expect(ti.terminalOnlyModules().sort()).toEqual(Object.keys(TERMINAL_ONLY_MODULES).sort());
  expect(() => ti.terminalOnlyModules('export const X = 1;')).toThrow('TERMINAL_ONLY_MODULES not found');
});

test('@term/kit is an exact alias to src/term/prim/kit.ts, which exports no engine value', async () => {
  const { TermResolver } = await import('./resolve');
  const r = new TermResolver({ hub: HUB, fixtures: true });
  const from = at('kit/agent/Composer.term.tsx');
  const a = r.resolve('@term/kit', from);
  expect(a.kind === 'file' && path.relative(HUB, a.path)).toBe('src/term/prim/kit.ts');
  expect(r.resolve('@term/kit/Pressable', from).kind).not.toBe('file');
  const names = Object.keys(await import('../../src/term/prim/kit')).sort();
  expect(names).toEqual(['Compose', 'PaneSize', 'Pressable', 'Scroll', 'colourTier', 'focusInk', 'isPressKey', 'mergeRefs', 'safeText', 'useFocusControl', 'useFocusable', 'useFocusedNode', 'useHoverFill', 'useKeys', 'usePaneSize', 'useSem', 'wrapCells']);
  const page = Object.keys(await import('../../src/term/prim/page'));
  expect(names.filter((n) => page.includes(n))).toEqual([]);
});

// The debt (scripts/lint/term-imports.debt.cjs) only shrinks: every row is a refusal that still
// happens. A fixed import leaves a stale row here (delete it); a new refusal is an eslint error, never a row.
test('term-import debt: every row is a live refusal, once, with a known fixBy', () => {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const r of debt.ROWS) {
    const k = `${r.file} ${r.spec}`;
    if (seen.has(k)) problems.push(`duplicate: ${k}`);
    seen.add(k);
    if (!debt.FIX_BY[r.fixBy]) problems.push(`unknown fixBy: ${k} (${r.fixBy})`);
    const f = at(r.file);
    if (!fs.existsSync(f)) { problems.push(`file gone (delete the row): ${k}`); continue; }
    const esc = r.spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`(?:from|import)\\s*\\(?\\s*['"]${esc}['"]`).test(fs.readFileSync(f, 'utf8'))) problems.push(`import gone (delete the row): ${k}`);
    const raw = ti.termImport(f, r.spec);
    if (!raw || raw.ok) problems.push(`no longer refused (delete the row): ${k}`);
  }
  expect(problems).toEqual([]);
});

test('term-import debt: a recorded refusal passes eslint\'s judgement, an unrecorded one does not', () => {
  const r = debt.ROWS[0]!;
  expect(ti.termImportJudged(at(r.file), r.spec)?.ok).toBe(true);
  expect(ti.termImportJudged(at(r.file), '../../term/prim/not-a-debt-row')).toEqual({ ok: false, messageId: 'termRelative' });
  expect(ti.termImportJudged(at('kit/agent/AgentSettings.tsx'), '@term/prim')).toEqual({ ok: false, messageId: 'termAliasWeb' });
});

test('eslint applies hub/term-imports to every kit file (error) through the same judgement as pages', () => {
  const cfg = fs.readFileSync(path.join(HUB, 'eslint.config.js'), 'utf8');
  expect(cfg).toContain("{ files: ['src/kit/**/*.{ts,tsx,mts}'], rules: { 'hub/term-imports': 'error' } },");
  expect(cfg).not.toMatch(/[^d]termImport\(/);
  expect(cfg.match(/termImportJudged\(file, spec\)/g)?.length).toBe(2);
});

test('a plain scenario file imports the scenario API from src/kit/scenario-types, never the term path', () => {
  // The rule: the term path is a relative import into src/term, refused for any non-terminal file.
  expect(v('kit/controls/Button.scenario.ts', '../../term/scenario/types')).toEqual({ ok: false, messageId: 'termRelative' });
  expect(v('pages/logs/parts/LogView.scenario.ts', '../../../term/scenario/types')).toEqual({ ok: false, messageId: 'termRelative' });
  expect(v('kit/controls/Button.scenario.ts', '../scenario-types')).toBeNull();
  // The tree: no scenario file outside the terminal names the term path (so the eslint debt for it stays empty).
  const bad: string[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (p !== path.join(HUB, 'src', 'term')) walk(p); continue; }
      if (/\.scenario\.tsx?$/.test(e.name) && /from '(?:\.\.\/)+term\/scenario\/types'/.test(fs.readFileSync(p, 'utf8'))) bad.push(path.relative(HUB, p));
    }
  };
  walk(path.join(HUB, 'src'));
  expect(bad).toEqual([]);
});
