// Vitest: every Home test that renders the page (in this folder or below it) imports ./testWaits, so none of them falls
// back to the shared 5 s wait and fails on host load instead of on what it checks.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { webBuilt } from '@app/conformance/termFiles';

const here = dirname(fileURLToPath(import.meta.url));
// Vitest tests only: a terminal test (`*.term.test.tsx`) runs under bun test with its own settle, never testWaits.
const web = webBuilt('home.testWaits', 'testWaits sets the vitest wait; a terminal test runs under bun test and settles the frame itself');
const tests = (readdirSync(here, { recursive: true }) as string[]).filter((f) => /\.test\.tsx?$/.test(f) && web('pages/home/' + f.split(sep).join(posix.sep)));
const renders = tests.filter((f) => /\brenderPage\(/.test(readFileSync(join(here, f), 'utf8')));

/** The import line a test at `f` (relative to this folder) needs: './testWaits' here, '../testWaits' one level down. */
function waitsImport(f: string): string {
  const up = relative(dirname(join(here, f)), join(here, 'testWaits')).split(sep).join(posix.sep);
  return `import '${up.startsWith('.') ? up : `./${up}`}';`;
}

describe('Home page tests wait for a busy host', () => {
  it('skips terminal tests, and only them', () => {
    expect(web('pages/home/fits-together.term.test.tsx')).toBe(false);
    expect(web('pages/home/page.test.tsx')).toBe(true);
  });

  it('finds the page tests, in this folder and below it', () => {
    expect(renders.length).toBeGreaterThan(10);
    expect(renders.some((f) => f.includes(sep))).toBe(true);
  });

  it('every test that renders the page imports testWaits', () => {
    const missing = renders.filter((f) => !readFileSync(join(here, f), 'utf8').split('\n').includes(waitsImport(f)));
    expect(missing).toEqual([]);
  });
});
