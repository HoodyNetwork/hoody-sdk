// @vitest-environment node
// Vitest: a pressable pill (StatusToggle) meets the touch floor both ways on a coarse pointer: a short label ("Off") is
// narrower than --touch-min, so the press box takes the floor's width too and centres the pill in it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'Display.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('pressable pill touch floor', () => {
  it('coarse pointer: min block and inline size are --touch-min, the pill centred', () => {
    const m = /@media \(pointer: coarse\)\s*\{\s*\.pillPress\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(m).toMatch(/min-block-size:\s*var\(--touch-min\)/);
    expect(m).toMatch(/min-inline-size:\s*var\(--touch-min\)/);
    expect(m).toMatch(/justify-content:\s*center/);
  });
});
