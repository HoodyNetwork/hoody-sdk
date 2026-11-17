// Vitest: code that must agree with a `@container content` rule finds that container by the
// CONTENT_CONTAINER attribute. This keeps the attribute on every element whose CSS makes it the `content` container: a
// new one fails here until it is listed and its element is marked.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTENT_CONTAINER } from './media';

const SRC = join(__dirname, '..');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
const rel = (p: string) => relative(SRC, p).split(sep).join('/');

/** Each CSS file that declares a `content` container, the component that draws that element, and the marker it writes
 *  there once: the shell's page region, and the kit's ContentRegion (a page's own region, such as the AI tab's). */
const KNOWN: Record<string, [tsx: string, marked: string]> = {
  'kit/layouts/ContentRegion.module.css': ['kit/layouts/ContentRegion.tsx', '{...{ [CONTENT_CONTAINER]: \'\' }}'],
  'shell/AppShell.module.css': ['shell/AppShell.tsx', `${CONTENT_CONTAINER}=""`],
};

/** Pages whose own region is a `content` container, and how many times each draws it as ContentRegion. */
const PAGES: Record<string, number> = { 'pages/ai/parts/Pane.tsx': 3 };

describe('the content containers carry CONTENT_CONTAINER', () => {
  it('every CSS `content` container is listed, and its component sets the attribute', () => {
    const declaring = files(SRC)
      .filter((p) => p.endsWith('.css'))
      .filter((p) => /container(-name)?\s*:\s*content\b/.test(readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')))
      .map(rel)
      .sort();
    expect(declaring).toEqual(Object.keys(KNOWN).sort());
    for (const [tsx, marked] of Object.values(KNOWN)) expect(readFileSync(join(SRC, tsx), 'utf8').split(marked).length - 1, tsx).toBe(1);
    for (const [tsx, n] of Object.entries(PAGES)) expect(readFileSync(join(SRC, tsx), 'utf8').split('<ContentRegion>').length - 1, tsx).toBe(n);
  });
});
