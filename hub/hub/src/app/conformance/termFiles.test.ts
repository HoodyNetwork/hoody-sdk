// termFiles.ts: the one exclusion of terminal files from web-drawing checks.
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isScenarioFile, isTerminalFile, SCENARIO_SUPPORT, TERMINAL_ONLY_MODULES, webBuilt, webDrawn } from './termFiles';

const SRC = join(import.meta.dirname, '..', '..');
const ALL = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).map((f) => f.split(sep).join('/'));

describe('terminal files', () => {
  it('a .term file or test is terminal; its web base, a .pure/.web file and a name merely containing "term" are not', () => {
    for (const f of ['kit/qr/Qr.term.tsx', 'kit/agent/Reply.term.tsx', 'pages/billing/data.web.term.ts', 'kit/controls/Button.term.test.tsx', 'kit/qr/termQrDialog.tsx', 'term/shell/TermShell.tsx']) expect(isTerminalFile(f), f).toBe(true);
    for (const f of ['kit/qr/Qr.tsx', 'kit/agent/Reply.tsx', 'pages/billing/data.web.ts', 'pages/x/terminal.tsx', 'pages/x/term/C.tsx', 'pages/x/Determine.tsx', 'kit/qr/termQrDialog.ts.bak']) expect(isTerminalFile(f), f).toBe(false);
  });
  it('webDrawn keeps every web file (a web file is still caught) and drops the terminal ones; it needs a reason', () => {
    const keep = webDrawn('termFiles.test', 'the test of the helper');
    expect(['kit/qr/Qr.tsx', 'kit/overlays/Dialog.tsx', 'shell/RenameRealms.tsx'].every(keep)).toBe(true);
    expect(['kit/qr/Qr.term.tsx', 'kit/qr/termQrDialog.tsx'].some(keep)).toBe(false);
    expect(() => webDrawn('x', ' ')).toThrow('reason');
  });
  it('a terminal-only module without the marker is imported only by terminal files', () => {
    for (const mod of Object.keys(TERMINAL_ONLY_MODULES)) {
      const stem = mod.slice(mod.lastIndexOf('/') + 1).replace(/\.tsx?$/, '');
      const importers = ALL.filter((f) => /\.tsx?$/.test(f) && f !== mod && new RegExp(`from ['"][^'"]*/${stem}['"]`).test(readFileSync(join(SRC, f), 'utf8')));
      expect(importers.length, mod).toBeGreaterThan(0);
      expect(importers.filter((f) => !isTerminalFile(f)), mod).toEqual([]);
    }
  });
  it('the web typecheck leaves out exactly the terminal-only modules: tsconfig.json names each one, and names no other file', () => {
    // The test above ('imported only by terminal files') is what makes the exclusion real: a web importer would pull
    // an excluded module back into the web program.
    const tsconfig = readFileSync(join(SRC, '..', 'tsconfig.json'), 'utf8');
    const list = /"exclude"\s*:\s*\[([\s\S]*?)\]/.exec(tsconfig)?.[1] ?? '';
    const named = [...list.replace(/^\s*\/\/.*$/gm, '').matchAll(/"([^"]+)"/g)].map((m) => m[1]!).filter((p) => !p.includes('*'));
    const modules = Object.keys(TERMINAL_ONLY_MODULES).map((mod) => `src/${mod}`);
    expect(modules.filter((p) => !named.includes(p)), 'add these to the exclude of tsconfig.json').toEqual([]);
    expect(named.filter((p) => !modules.includes(p)), 'the exclude may name terminal-only modules only: list the file in TERMINAL_ONLY_MODULES or remove it').toEqual([]);
    for (const mod of Object.keys(TERMINAL_ONLY_MODULES)) expect(ALL.includes(mod), mod).toBe(true);
  });
  it('webBuilt keeps every web module (a web file is still caught) and drops terminal and scenario files', () => {
    const keep = webBuilt('termFiles.test.built', 'the test of the helper');
    expect(['kit/controls/Button.tsx', 'kit/controls/Button.pure.ts', 'kit/overlays/Dialog.tsx', 'kit/data/scenarioName.ts'].every(keep)).toBe(true);
    expect(['kit/controls/Button.term.tsx', 'kit/controls/Button.term.bench.tsx', 'kit/controls/Button.scenario.ts', 'kit/qr/termQrDialog.tsx', 'kit/agent/hostile.fixture.ts', 'kit/layouts/scenarioRoute.tsx'].some(keep)).toBe(false);
    expect(isScenarioFile('kit/controls/Button.scenario.tsx')).toBe(false);
    expect(() => webBuilt('x', '')).toThrow('reason');
  });
  it('no app module imports test input (only tests, other test input and terminal files do): the webBuilt skip holds only while this is true', () => {
    const app = ALL.filter((f) => /\.tsx?$/.test(f) && !/\.(test|spec)\.tsx?$/.test(f) && !isScenarioFile(f) && !isTerminalFile(f));
    const support = Object.keys(SCENARIO_SUPPORT).map((m) => m.slice(m.lastIndexOf('/') + 1).replace(/\.tsx?$/, ''));
    const pattern = new RegExp(`from ['"][^'"]*(\\.scenario|\\.fixture|/(?:${support.join('|')}))['"]`);
    expect(app.filter((f) => pattern.test(readFileSync(join(SRC, f), 'utf8')))).toEqual([]);
    // A SCENARIO_SUPPORT entry is still used (by scenario files).
    for (const s of support) expect(ALL.some((f) => isScenarioFile(f) && new RegExp(`/${s}['"]`).test(readFileSync(join(SRC, f), 'utf8'))), s).toBe(true);
  });
  it('the terminal Button draws no chip (the chip-on-Cancel skip holds only while this is true)', () => {
    // The chip is the web Button's pixel icon (G6, Button.tsx PxIcon / PX_FROM_ICON). The terminal Button draws its label
    // only; it re-exports chipFor for type parity but never calls it or draws a pixel icon.
    const text = readFileSync(join(SRC, 'kit/controls/Button.term.tsx'), 'utf8');
    expect(text).not.toMatch(/PxIcon|PX_FROM_ICON|chipFor\(/);
  });
  it('the terminal buttons never change a label\'s case (the "pass literal" skip holds only while this is true)', () => {
    // The theme uppercases web Button/TextButton/LinkButton labels (Button.module.css text-transform: var(--case-caps)).
    // The terminal ones draw the label through the Text prim with no class (the CSS table never reaches it) and no case
    // change of their own. If that changes, the "pass literal" check must read .term files again.
    for (const f of ['kit/controls/Button.term.tsx', 'kit/controls/Link.term.tsx']) {
      const text = readFileSync(join(SRC, f), 'utf8');
      expect(text, f).not.toMatch(/toUpperCase|toLocaleUpperCase|text-?[tT]ransform|case-caps|className=/);
    }
  });
});
