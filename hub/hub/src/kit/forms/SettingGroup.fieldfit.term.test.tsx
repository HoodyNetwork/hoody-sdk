// A field group's row stacks only when its value does not fit beside the label at the value's own width: a field with
// a worded suffix that needs more than the room the 30-cell label column leaves goes under its label and help, whole,
// instead of being squeezed or cut by the card's edge (New Bot and Get a computer at 80 columns: "[Sugges"); a value
// that fits stays beside its label at the same width (billing's "Plans for" and its choices at 80x24, pinned by
// pages/billing/plans-dense.term.test.tsx); with room, the suffixed field is beside its label too.
// The row may start to stack while someone types (an error line widens the value) or when the terminal is resized:
// the field is laid out again, never mounted anew, so it keeps the focus and what was typed.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | A suffixed field that does not fit goes under the label and help, its suffix whole | 'does not fit' |
// | 2 | A field that fits stays beside its label | 'fits' |
// | 3 | With room, the suffixed field is beside its label | 'with room' |
// | 4 | Typing until an error line makes the row stack: the field keeps the focus, the next key lands | 'typing across the stack' |
// | 5 | A resize that stacks the row: the focused field keeps the focus and what was typed (uncontrolled) | 'resize across the stack' |
// | 6 | Stacked with its actions on the value's line, a tall value keeps them by its first line | 'tall value' |
// | 7 | Stacked, a field fills its line: its suffix at the row's end, as with an error line | 'fills its line' |
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';
import { Box, FocusRoot, Text } from '../../term/prim';
import { Button, IconButton } from '../controls/Button';
import { SettingGroup } from './SettingGroup';
import { SettingRow } from './SettingRow';
import { TextField } from './fields';

let term: TestTerm | null = null;
afterEach(() => { term?.renderer.destroy(); term = null; });

const HELP = 'Suggested for you. Keep it or type your own.';
const TOO_LONG = 'Use at most 5 letters, digits or hyphens, starting with a letter.';

/** The lines of a frame, the Name label's line and the first line holding `text`. */
function where(frame: string, text: string): { lines: string[]; label: number; value: number; help: number } {
  const lines = frame.split('\n').map((l) => l.trimEnd());
  return { lines, label: lines.findIndex((l) => /\bName\b/.test(l)), value: lines.findIndex((l) => l.includes(text)), help: lines.findIndex((l) => l.includes('Suggested for you')) };
}

const focusedName = (): string | undefined => focusedNode(semanticsOf(term!.renderer as never))?.name;
/** Tab until the Name field has the focus (it is the first stop; a few presses at most). */
async function tabToName(): Promise<void> {
  for (let i = 0; i < 4 && focusedName() !== 'Name'; i++) { term!.mockInput.pressTab(); await term!.settle(); }
}

/** One field group `width` cells wide (its border included) holding a Name row, its field with or without a worded suffix. */
async function rowOf(width: number, suffix: boolean): Promise<{ lines: string[]; label: number; value: number }> {
  term = await drawTest(
    <FocusRoot><Box dir="column" width={width}>
      <SettingGroup variant="field" label="Bot">
        <SettingRow label="Name" help={HELP}>
          <TextField aria-label="Name" value="amber-badger" onChange={() => {}}
            {...(suffix ? { suffix: <IconButton icon="reload" size="sm" label="Suggest another name" onPress={() => {}} /> } : {})} />
        </SettingRow>
      </SettingGroup>
    </Box></FocusRoot>,
    { width: width + 2, height: 14 },
  );
  return where(await term.settle(), 'amber-badger');
}

test('does not fit: the field goes under the label and help, its suffix whole', async () => {
  // 70 cells: 34 beside the label column; the field and "[Suggest another name]" need more.
  const r = await rowOf(70, true);
  expect(r.label).toBeGreaterThanOrEqual(0);
  expect(r.value).toBeGreaterThan(r.label);
  const help = r.lines.findIndex((l) => l.includes('Suggested for you'));
  expect(r.value).toBeGreaterThan(help);
  const line = r.lines.find((l) => l.includes('Suggest another'))!;
  expect(line).toContain('[Suggest another name]');
  expect(line.length).toBeLessThanOrEqual(70);
}, 60_000);

test('fits: a field that fits beside its label stays beside it', async () => {
  const r = await rowOf(70, false);
  expect(r.label).toBeGreaterThanOrEqual(0);
  expect(r.value).toBe(r.label);
}, 60_000);

test('with room: the field and its suffix sit beside the label', async () => {
  const r = await rowOf(110, true);
  expect(r.label).toBeGreaterThanOrEqual(0);
  expect(r.value).toBe(r.label);
  expect(r.lines[r.label]).toContain('[Suggest another name]');
}, 60_000);

/** A controlled Name field that shows an error line once its value is longer than 5. */
function Typed() {
  const [v, setV] = useState('amber');
  return (
    <FocusRoot><Box dir="column" width={70}>
      <SettingGroup variant="field" label="Bot">
        <SettingRow label="Name" help={HELP}>
          <TextField aria-label="Name" value={v} onChange={setV} {...(v.length > 5 ? { errorMessage: TOO_LONG } : {})} />
        </SettingRow>
      </SettingGroup>
    </Box></FocusRoot>
  );
}

test('typing across the stack: the error line stacks the row, the field keeps the focus and the next key lands', async () => {
  term = await drawTest(<Typed />, { width: 72, height: 16 });
  // Focused by Tab, not autoFocus: a field mounted anew would take an autoFocus again and hide the remount.
  await term.settle();
  await tabToName();
  const before = where(await term.settle(), 'amber');
  // Beside its label while the value fits (the error line is not there yet), and focused.
  expect(before.value, before.lines.join('\n')).toBe(before.label);
  expect(focusedName()).toBe('Name');
  await term.mockInput.typeText('x');
  const stacked = where(await term.settle(), 'amberx');
  // The error line (wider than the room beside the label) is shown, and the row went under the label and help.
  expect(stacked.lines.join('\n')).toContain('Use at most 5 letters');
  expect(stacked.value, stacked.lines.join('\n')).toBeGreaterThan(stacked.help);
  // The same field: still focused, and the next key reaches it.
  expect(focusedName()).toBe('Name');
  await term.mockInput.typeText('y');
  const after = where(await term.settle(), 'amberxy');
  expect(after.value, after.lines.join('\n')).toBeGreaterThan(after.help);
}, 60_000);

test('resize across the stack: the focused field keeps the focus and what was typed', async () => {
  term = await drawTest(
    <FocusRoot><Box dir="column">
      <SettingGroup variant="field" label="Bot">
        <SettingRow label="Name" help={HELP}>
          <TextField aria-label="Name" defaultValue="amber"
            suffix={<IconButton icon="reload" size="sm" label="Suggest another name" onPress={() => {}} />} />
        </SettingRow>
      </SettingGroup>
    </Box></FocusRoot>,
    { width: 112, height: 16 },
  );
  await term.settle();
  await tabToName();
  expect(focusedName()).toBe('Name');
  await term.mockInput.typeText('x');
  const wide = where(await term.settle(), 'amberx');
  expect(wide.value, wide.lines.join('\n')).toBe(wide.label);
  expect(focusedName()).toBe('Name');
  // 64 columns: a 60-cell row (not under the narrow-row width, so only the value's width can stack it) leaves 28 cells
  // beside the label; the field and its suffix need more.
  term.resize(64, 16);
  const narrow = where(await term.settle(), 'amberx');
  // Stacked now, with what was typed.
  expect(narrow.value, narrow.lines.join('\n')).toBeGreaterThan(narrow.help);
  expect(focusedName()).toBe('Name');
  await term.mockInput.typeText('y');
  const after = where(await term.settle(), 'amberxy');
  expect(after.value, after.lines.join('\n')).toBeGreaterThan(after.help);
}, 60_000);

test('tall value: stacked with its actions on the value\'s line, a field row keeps them by the value\'s first line', async () => {
  // Three lines held at 41 cells: more than a 70-cell group leaves beside the label column and the action (about 26),
  // so the row stacks, and the action shares the value's line. The value holds its width as a control does: lines that
  // wrap fit beside the label by wrapping, and such a row stays beside it. Red before: centred on the value, "[Save]"
  // sat on its second line (Get a computer's project rules at 120x40: Save halfway down a radio group's descriptions).
  term = await drawTest(
    <FocusRoot><Box dir="column" width={70}>
      <SettingGroup variant="field" label="Rules">
        <SettingRow label="Project rules" actions={<Button size="sm">Save</Button>}>
          <Box dir="column" width={41}>
            <Text>( ) No project rules</Text>
            <Text>Each computer decides with its own rules.</Text>
            <Text>(•) Only my IP</Text>
          </Box>
        </SettingRow>
      </SettingGroup>
    </Box></FocusRoot>,
    { width: 72, height: 14 },
  );
  const lines = (await term.settle()).split('\n').map((l) => l.trimEnd());
  const at = (text: string) => lines.findIndex((l) => l.includes(text));
  const label = at('Project rules');
  const first = at('No project rules');
  const save = at('Save');
  expect(label, lines.join('\n')).toBeGreaterThanOrEqual(0);
  // Stacked: the value is under its label, its lines whole.
  expect(first, lines.join('\n')).toBeGreaterThan(label);
  expect(at('Each computer decides with its own rules.'), lines.join('\n')).toBe(first + 1);
  // The action is on the value's first line, not further down.
  expect(save, lines.join('\n')).toBe(first);
  expect(at('Only my IP')).toBeGreaterThan(save);
}, 60_000);

test('fills its line: a stacked field reaches the row\'s end, its suffix there', async () => {
  // Red before: the stacked field kept its value's width, so its suffix sat right after the value and the rest of the
  // line was empty (with an error line under it, the field did reach the end: two looks for one row).
  const r = await rowOf(70, true);
  const line = r.lines.find((l) => l.includes('Suggest another'))!;
  expect(r.value).toBeGreaterThan(r.label);
  // The suffix ends the field, then the group's inset and border: no more than the inset's blank between them.
  expect(line, r.lines.join('\n')).toMatch(/\[Suggest another name\] {1,2}│$/);
}, 60_000);
