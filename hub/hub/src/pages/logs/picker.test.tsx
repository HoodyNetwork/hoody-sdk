// Vitest: the page's pickers are the kit's: the computer and program pickers are the kit ComputerPicker and
// ProgramPicker, the model picker the kit ModelChooser; never a
// page-local Combobox or Select in their place.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('pickers', () => {
  it('the computer and program pickers are the kit pickers, the model picker the kit ModelChooser', () => {
    const src = (f: string) => readFileSync(join(import.meta.dirname, f), 'utf8');
    expect(src('parts/ComputerPick.tsx')).toMatch(/<ComputerPicker\b/);
    expect(src('parts/ProgramOutput.tsx')).toMatch(/<ProgramPicker\b/);
    for (const f of ['parts/ComputerPick.tsx', 'parts/ProgramOutput.tsx']) expect(src(f)).not.toMatch(/<Select\b|Combobox/);
    expect(src('parts/ExplainDrawer.tsx')).toMatch(/<ModelChooser\b/);
    expect(src('parts/ExplainDrawer.tsx')).not.toMatch(/<Select\b|Combobox/);
  });
});
