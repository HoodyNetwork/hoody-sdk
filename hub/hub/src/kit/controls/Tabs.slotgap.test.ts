// Vitest: the before and after slots keep the strip's control
// gap from the tabs as padding (a fitting strip sums the slots' offsetWidth, which counts padding, not margin).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Tabs.module.css'), 'utf8');
const rule = (sel: string) => new RegExp(String.raw`${sel.replace(/[.[\]]/g, '\\$&')}\s*\{([^}]*)\}`).exec(css)?.[1] ?? '';

describe('Tabs row slots', () => {
  it('before: a gap on its end side, as padding', () => {
    expect(rule('.tabMenu[data-tabs-before]')).toMatch(/padding-inline-end:\s*var\(--sp-2\)/);
  });
  it('after: a gap on its start side, as padding', () => {
    expect(rule('.tabMenu[data-tabs-after]')).toMatch(/padding-inline-start:\s*var\(--sp-2\)/);
  });
});
