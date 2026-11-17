// @vitest-environment node
// CSS-module class names in a dev build. Many pages have a parts/parts.module.css, and several of them
// use the same class (.actions, .hint, .nameCell, ...). A dev name of only [name]__[local] gave all of them the one
// name parts-module__actions, so a dev server that had loaded two pages applied one page's rule to the other.
// Vitest itself uses non-scoped names, so this test asks vite for the dev and build names through the Hub's own config.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { preprocessCSS, resolveConfig } from 'vite';
import { describe, expect, it } from 'vitest';

const configFile = fileURLToPath(new URL('../../vite.config.mts', import.meta.url));
const file = (rel: string) => fileURLToPath(new URL(`../${rel}`, import.meta.url));

/** The scoped name vite gives `local` in `rel` (a CSS module under src/) for this command. */
async function scoped(command: 'serve' | 'build', rel: string, local: string): Promise<string> {
  const mode = command === 'build' ? 'production' : 'development';
  const config = await resolveConfig({ configFile, mode, logLevel: 'silent' }, command, mode, mode);
  const { modules } = await preprocessCSS(readFileSync(file(rel), 'utf8'), file(rel), config);
  const name = modules?.[local];
  if (!name) throw new Error(`${rel} has no .${local}`);
  return name;
}

// Two pages' parts.module.css that both define .actions (checked below, so the test fails loudly if one drops it).
const A = 'pages/apps/parts/parts.module.css';
const B = 'pages/scripts/parts/parts.module.css';

describe('CSS-module class names', () => {
  it('in a dev build, the same class in two pages gets two names', async () => {
    const [a, b] = await Promise.all([scoped('serve', A, 'actions'), scoped('serve', B, 'actions')]);
    expect(a).not.toBe(b);
  });

  it('a dev name still starts with <file>-module__<class>, the prefix the specs select with [class*=...]', async () => {
    expect(await scoped('serve', A, 'actions')).toMatch(/^parts-module__actions(?![A-Za-z0-9])/);
    expect(await scoped('serve', 'kit/controls/Button.module.css', 'button')).toMatch(/^Button-module__button(?![A-Za-z0-9])/);
  });

  it('a production build keeps its naming pattern exactly, and so its short hashed names', async () => {
    const config = await resolveConfig({ configFile, mode: 'production', logLevel: 'silent' }, 'build', 'production', 'production');
    expect(config.css.modules && config.css.modules.generateScopedName).toBe('h[hash:base64:6]');
    expect(await scoped('build', A, 'actions')).toMatch(/^h[\w-]{6}$/);
  });
});
