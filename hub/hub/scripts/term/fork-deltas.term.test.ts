// Load-time deltas edit dependency code by syntax (F5), and refuse a changed shape instead of doing nothing.
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import { editSpecifiers, historyBlockers, libDomJsx } from './fork-deltas';

const RT = '/hub/src/term/jsx/jsx-runtime.ts';
describe('fork deltas', () => {
  test('lib-dom-jsx replaces only import specifiers, never look-alike text', () => {
    const src = `import { jsx } from "react/jsx-runtime";\nimport { jsxDEV } from 'react/jsx-dev-runtime';\nconst s = "from 'react/jsx-runtime'";\nexport { x } from "react/jsx-runtime";\n`;
    const out = libDomJsx(src, RT);
    expect(out).toContain(`import { jsx } from "${RT}"`);
    expect(out).toContain(`from "/hub/src/term/jsx/jsx-dev-runtime.ts"`);
    expect(out).toContain(`const s = "from 'react/jsx-runtime'"`);
    expect(out).toContain(`export { x } from "${RT}"`);
  });
  test('history-blockers: tryNavigation runs blockers without a DOM; the rest of the file is untouched', () => {
    const real = fs.readFileSync(Bun.resolveSync('@tanstack/history', import.meta.dir).replace(/index\.(c?js)$/, 'index.js').replace('/cjs/', '/esm/'), 'utf8');
    const out = historyBlockers(real);
    expect(out).not.toMatch(/tryNavigation[\s\S]{0,300}typeof document !== "undefined" && blockers/);
    expect(out).toMatch(/if \(true && blockers\?\.length/);
    expect(out.length).toBe(real.length - 'typeof document !== "undefined"'.length + 'true'.length);
  });
  test('history-blockers refuses a changed shape (no silent no-op)', () => {
    expect(() => historyBlockers('const tryNavigation = async () => { if (blockers?.length) {} };')).toThrow(/TERM_FORK_DELTA/);
    expect(() => historyBlockers('if (typeof document !== "undefined") {}')).toThrow(/TERM_FORK_DELTA/);
  });
  test('editSpecifiers covers import(), leaves comments and strings', () => {
    expect(editSpecifiers(`// import "a"\nconst p = import("a");\nconst q = "a";`, (s) => (s === 'a' ? 'b' : null))).toBe(`// import "a"\nconst p = import("b");\nconst q = "a";`);
  });
});
