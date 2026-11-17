// CodeEditor focus, read from source: the frame never gets fainter on focus, the textarea and the find input draw the
// kit focus ring (with a forced-colours outline, since a box-shadow is not painted there), and a problem row is a
// pressable with a ring and a coarse-pointer floor. The browser reads the computed result in d6fields.spec.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(join(import.meta.dirname, 'CodeEditor.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const FORCED = CSS.slice(CSS.indexOf('@media (forced-colors: active)'));

/** The body of the first top-level rule whose selector list holds exactly `sel`. */
function rule(css: string, sel: string): string {
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1]!.split(',').some((x) => x.trim() === sel)) return m[2]!;
  }
  throw new Error(`no rule ${sel}`);
}

describe('CodeEditor focus', () => {
  it('the frame does not change its border on focus (a fainter line read as "less focused" in light)', () => {
    expect(CSS).not.toMatch(/\.editor:focus-within\s*\{[^}]*border-color/);
    expect(CSS).not.toContain('--hx-line-2');
  });

  it('the frame draws the kit ring while the textarea has keyboard focus, and only then', () => {
    expect(rule(CSS, '.editor:has(.text:focus-visible)')).toMatch(/box-shadow:\s*var\(--focus-ring\)/);
  });

  it('the find input draws the kit ring', () => {
    expect(rule(CSS, '.findInput:focus-visible')).toMatch(/box-shadow:\s*var\(--focus-ring\)/);
    expect(rule(CSS, '.findInput:focus-visible')).not.toMatch(/border-color/);
  });

  it('a problem row draws the kit ring and keeps the touch floor', () => {
    expect(rule(CSS, '.problem:focus-visible')).toMatch(/box-shadow:\s*var\(--focus-ring-inset\)/);
    expect(rule(CSS, '.problem')).toMatch(/min-height:\s*var\(--touch-min\)/);
  });

  it('forced colours get a solid outline for all three', () => {
    expect(CSS).toContain('@media (forced-colors: active)');
    for (const sel of ['.editor:has(.text:focus-visible)', '.findInput:focus-visible', '.problem:focus-visible']) {
      expect(rule(FORCED, sel)).toMatch(/outline:\s*var\(--bw-2\) solid Highlight/);
    }
  });

  it('the find input is a field: it takes the field height token, not the button one', () => {
    expect(rule(CSS, '.findInput')).toMatch(/height:\s*var\(--ctl-h-md\)/);
    expect(rule(CSS, '.findInput')).toMatch(/max-width:\s*var\(--search-max-w\)/);
  });
});
