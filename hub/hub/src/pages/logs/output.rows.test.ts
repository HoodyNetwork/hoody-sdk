// @vitest-environment node
// Program output is one group: its controls, notes and output box sit the small step apart, and the box starts its
// first line right under its edge (block padding under the step that reads as an empty row). CSS text is the contract.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(path.join(__dirname, 'parts/Logs.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (sel: string) => new RegExp(`(?:^|})\\s*\\${sel}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

describe('program output rows', () => {
  it('the blocks of the group are the small step apart', () => {
    expect(rule('.prog')).toMatch(/gap:\s*var\(--sp-2\);/);
  });

  it('the output box pads its sides more than its top and bottom', () => {
    expect(rule('.out')).toMatch(/padding:\s*var\(--sp-2\) var\(--sp-3\);/);
  });
});
