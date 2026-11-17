// StaticTable in the terminal (StaticTable.term.tsx). StaticTable.scenario.ts holds the table's name and every cell's
// words. These hold the terminal's own drawing of it, one block per row:
//   - the row header in bold on its own line, then "Label  value" for each other column, the labels in one column as
//     wide as the longest, so every value starts in one column
//   - a value longer than the room wraps under its own first character: never cut, never under the label
//   - the rows are a blank line apart
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { StaticTable } from './StaticTable';

const COLUMNS = [{ id: 'agent', label: 'Agent' }, { id: 'project', label: 'Project' }, { id: 'global', label: 'Everywhere' }];
const ROWS = [
  { id: 'codex', cells: ['codex', '.codex/skills', '~/.codex/skills'] },
  { id: 'claude', cells: ['claude', '.claude/skills/shared/tools/and/more/folders/than/fit', '~/.claude/skills'] },
];

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const lines = (f: string) => f.split('\n');
const rowOf = (f: string, s: string) => lines(f).findIndex((l) => l.includes(s));

// Catches the label column (lines 19, 33-34: as wide as the longest label, two cells after it) and the value column
// (lines 36-37: its own column, so a long value wraps under itself and is never cut).
test('labels in one column, values in the next; a long value wraps under itself, whole; rows a blank line apart', async () => {
  t = await drawTest(<FocusRoot><StaticTable label="Where each agent keeps skills" columns={COLUMNS} rows={ROWS} /></FocusRoot>, { width: 40, height: 16 });
  const f = await t.settle();
  const codex = rowOf(f, 'codex');
  expect(lines(f)[codex]!.trim()).toBe('codex');
  const project = lines(f)[codex + 1]!;
  const everywhere = lines(f)[codex + 2]!;
  expect(project).toMatch(/^Project +\.codex\/skills/);
  expect(everywhere).toMatch(/^Everywhere +~\/\.codex\/skills/);
  const valueAt = 'Everywhere'.length + 2;
  expect(project.indexOf('.codex')).toBe(valueAt);
  expect(everywhere.indexOf('~/')).toBe(valueAt);
  // A blank line, then the next row's header.
  expect(lines(f)[codex + 3]!.trim()).toBe('');
  const claude = rowOf(f, 'claude');
  expect(claude).toBe(codex + 4);
  // The long path: begun on the Project line, continued under its own first character, ending whole.
  const long = lines(f)[claude + 1]!;
  expect(long).toMatch(/^Project +\.claude\//);
  expect(long.indexOf('.claude')).toBe(valueAt);
  expect(lines(f)[claude + 2]!.search(/\S/)).toBe(valueAt);
  const joined = lines(f).slice(claude + 1, claude + 5).map((l) => l.slice(valueAt).trim()).join('');
  expect(joined).toContain('.claude/skills/shared/tools/and/more/folders/than/fit');
  expect(f).not.toContain('…');
});
