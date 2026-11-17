import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { ALLOWANCE_FILE, fillSibling, scanExports, synthesize } from './placeholder';
import { SRC, TwinValueImport, isSibling, resolveSpec, siblingOf, webOnlyReason } from './resolve';

const kit = (p: string): string => path.join(SRC, 'kit', p);
const page = path.join(SRC, 'pages/schedules/view.tsx');

describe('resolver', () => {
  test('a sibling replaces its web file, by relative path and by alias', () => {
    expect(resolveSpec('./Button', kit('controls/Link.tsx'))).toMatchObject({ kind: 'file', path: kit('controls/Button.term.tsx') });
    expect(resolveSpec('@kit/controls/Button', page)).toMatchObject({ kind: 'file', path: kit('controls/Button.term.tsx') });
    expect(siblingOf(kit('controls/Button.tsx'))).toBe(kit('controls/Button.term.tsx'));
  });
  test('a file without a sibling resolves to itself; the barrel stays the barrel', () => {
    expect(resolveSpec('./strings', kit('nav.ts'))).toMatchObject({ kind: 'file', path: kit('strings.ts') });
    expect(resolveSpec('@kit', page)).toMatchObject({ kind: 'file', path: kit('index.ts') });
  });
  test('a sibling may not import values from its own web file', () => {
    expect(() => resolveSpec('./Button', kit('controls/Button.term.tsx'))).toThrow(TwinValueImport);
  });
  test('the JSX runtime of shared code is the compat one; prim keeps the real one', () => {
    const r = resolveSpec('react/jsx-runtime', page);
    expect(r.kind === 'jsx' || (r.kind === 'file' && r.path.includes('term/jsx'))).toBe(true);
  });
  test('styles and assets: a CSS module is a class table, ?raw is text, other assets are nothing', () => {
    expect(resolveSpec('./Button.module.css', kit('controls/Button.tsx')).kind).toBe('cssModule');
    // F4: an asset whose file does not exist is missing (was a silent asset stand-in)
    expect(resolveSpec('./x.svg?url', page).kind).toBe('missing');
    expect(resolveSpec('../tokens.css', kit('controls/Button.tsx')).kind).toBe('asset');
  });
  test('web-only is decided by package, never by a stylesheet', () => {
    expect(webOnlyReason(['react', 'react-aria-components'])).toContain('react-aria-components');
    expect(webOnlyReason(['react-dom/client'])).not.toBeNull();
    expect(webOnlyReason(['react', './x.module.css', '@tanstack/react-table'])).toBeNull();
  });
  test('test files are not siblings', () => {
    expect(isSibling('/a/X.term.tsx')).toBe(true);
    expect(isSibling('/a/X.term.test.tsx')).toBe(false);
  });
});

describe('placeholders', () => {
  const code = `import { Button } from 'react-aria-components';
export interface P { a: string }
export type T = 'a';
export const LIMIT = 3;
export function Fancy(p: P) { return null; }
export function useThing() { return 1; }
export { Other, type OtherProps } from './other';
export default Fancy;`;
  test('scan finds value exports, default and re-exports; types are left out', () => {
    const s = scanExports('/x/Fancy.tsx', code);
    expect(s.names.sort()).toEqual(['Fancy', 'LIMIT', 'useThing']);
    expect(s.hasDefault).toBe(true);
    expect(s.reexportNames).toEqual([['Other']]);
  });
  test('F6: a web-only module becomes components under the same names; non-visual exports refuse when used', () => {
    const out = synthesize(path.join(SRC, 'kit/Fancy.tsx'), code, 'imports react-aria-components', { allow: new Set() });
    expect(out).toContain('export const Fancy = phComponent("Fancy"');
    expect(out).toContain('export const useThing = phUnsupported("useThing"');
    expect(out).toContain('export const LIMIT = phUnsupported("LIMIT"');
    expect(out).not.toContain('phHole("');
    expect(out).toContain("from './other'");
    expect(out).toContain('export default');
    expect(out).not.toContain("from 'react-aria-components'");
  });
  test('a partial sibling is completed with stand-ins for exactly what it lacks', () => {
    const fill = fillSibling(path.join(SRC, 'kit/Fancy.tsx'), code, `export const Fancy = () => null;\nexport const LIMIT = 3;`, { allow: new Set() });
    // F17: a missing re-export is completed from its source and listed; a missing default is listed
    expect(fill.missing.sort()).toEqual(['Other', 'default', 'useThing']);
    expect(fill.append).toContain('export const useThing = phUnsupported(');
    expect(fill.append).toContain('export { Other } from "./other"');
    expect(fill.append).not.toContain('export const Fancy');
  });
  test('F6: an allowance-listed name keeps the inert hole; the list is empty and closed', () => {
    const out = synthesize(path.join(SRC, 'kit/Fancy.tsx'), code, 'x', { allow: new Set(['src/kit/Fancy.tsx#LIMIT']) });
    expect(out).toContain('export const LIMIT = phHole("LIMIT"');
    expect(out).toContain('export const useThing = phUnsupported("useThing"');
    const list = JSON.parse(fs.readFileSync(ALLOWANCE_FILE, 'utf8')) as { max: number; entries: unknown[] };
    expect(list.entries.length).toBeLessThanOrEqual(list.max);
    expect(list.max).toBe(0); // only shrinks: raising it is a reviewed change to this line
  });
  test('F17: a default-only web module keeps its default under the placeholder', () => {
    const out = synthesize(path.join(SRC, 'kit/Only.tsx'), `import 'react-dom';\nexport default function Only() { return null; }`, 'x', { allow: new Set() });
    expect(out).toContain('export default phComponent("default"');
    const v = synthesize(path.join(SRC, 'kit/OnlyV.ts'), `import 'react-dom';\nexport default { a: 1 };`, 'x', { allow: new Set() });
    expect(v).toContain('export default phUnsupported("default"');
  });
  test('F6: an unsupported export throws TERM_UNSUPPORTED naming export, module and importer', async () => {
    const { phUnsupported, TermUnsupportedError, placeholderLedger } = await import('../../src/term/placeholder');
    const x = phUnsupported('CHAT_SLOTS', 'src/kit/widgets/ChatNames.tsx') as Record<string, unknown>;
    let err: unknown = null;
    try { void x.telegram; } catch (e) { err = e; }
    expect(err).toBeInstanceOf(TermUnsupportedError);
    const e = err as InstanceType<typeof TermUnsupportedError>;
    expect(e.code).toBe('TERM_UNSUPPORTED');
    expect(e.exportName).toBe('CHAT_SLOTS');
    expect(e.module).toBe('src/kit/widgets/ChatNames.tsx');
    expect(String(e.importer)).toContain('resolve.term.test');
    expect(placeholderLedger().unsupported.some((u: { name?: string; exportName?: string }) => (u.exportName ?? u.name) === 'CHAT_SLOTS')).toBe(true);
  });
  test('every sibling in the tree has a web file of the same name', () => {
    const lone = [...new Bun.Glob('**/*.term.{ts,tsx}').scanSync(SRC)].filter((f) => !['.tsx', '.ts'].some((e) => fs.existsSync(path.join(SRC, f.replace(/\.term\.tsx?$/, e)))));
    expect(lone).toEqual([]);
  });
});

describe('one engine, one React', () => {
  test('OpenTUI is named only in src/term/prim', () => {
    const bad = [...new Bun.Glob('**/*.{ts,tsx}').scanSync(SRC)].filter((f) => !f.startsWith('term/prim/') && /from '@opentui\//.test(fs.readFileSync(path.join(SRC, f), 'utf8')));
    expect(bad).toEqual([]);
  });
  test('the renderer and the Hub load the same react', () => {
    const fromHub = fs.realpathSync(Bun.resolveSync('react', SRC));
    const fromEngine = fs.realpathSync(Bun.resolveSync('react', path.dirname(Bun.resolveSync('@opentui/react', SRC))));
    expect(fromEngine).toBe(fromHub);
  });
});
