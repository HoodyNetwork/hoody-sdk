// @vitest-environment node
// One glyph rule (chipGlyph): Button draws it and the floating action button decides from it whether its glyph alone
// can stand for the action. Neither keeps a copy of its own.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { chipGlyph } from './chipGlyph';

const read = (p: string) => readFileSync(path.resolve(__dirname, p), 'utf8');

describe('chipGlyph', () => {
  it('own glyph first, then the plus for a "New …" label, then the end icon, else the arrow', () => {
    expect(chipGlyph('dollar', undefined, 'New key')).toBe('dollar');
    expect(chipGlyph(undefined, undefined, '  new note')).toBe('plus');
    expect(chipGlyph(undefined, undefined, 'Newsletter')).toBe('arrow');
    expect(chipGlyph(undefined, undefined, 'Share this realm')).toBe('arrow');
  });

  it('is the one rule: Button and the floating button import it and keep no copy', () => {
    for (const f of ['./Button.tsx', '../layouts/PageHeader.tsx']) {
      const src = read(f);
      expect(src, f).toMatch(/import \{ chipGlyph \} from '[./]+(controls\/)?chipGlyph';/);
      expect(src, f).not.toMatch(/function chipGlyph\b|\/\^new\\b\/i/);
    }
  });
});
