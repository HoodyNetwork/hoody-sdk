// Follow-ups to the stacked setting rows and the suffixed field:
// - a Switch or Checkbox in a stacked row is as wide as what it draws: a click on the blank rest of its line changes
//   nothing (the row's column stretched it, so its hit box spanned the line);
// - the row's actions keep one element path, so a focused Save keeps the focus when a resize stacks the row or brings
//   it back beside its label (it was mounted anew in another parent and lost the focus; on live at 56 cells);
// - an unfocused text field narrower than its value shows the value's START with one "…" (it showed the end, where
//   the caret was left); focused, the caret's end is in view again;
// - an error line that appears under a focused field is scrolled into view with it (80x24: the field stayed in view,
//   its error under the fold).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Stacked Switch: a click on the blank rest of its line does not toggle it; a click on its mark does | 'switch hit box' |
// | 2 | Stacked Checkbox: the same | 'checkbox hit box' |
// | 3 | A focused Save keeps the focus across the stack boundary, both ways, with the actions on the value's line | 'save across the stack (value line)' |
// | 4 | The same with the actions under the value (a narrow row) | 'save across the stack (under)' |
// | 5 | Unfocused, a too-narrow field shows its start and "…"; focused, its end | 'narrow field shows its start' |
// | 6 | An error line appearing under the focused field is scrolled into view | 'error line in view' |
import { afterEach, expect, test } from 'bun:test';
import { useState, type ReactNode } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';
import { Box, FocusRoot, Scroll, Text } from '../../term/prim';
import { Button } from '../controls/Button';
import { SettingGroup } from './SettingGroup';
import { SettingRow } from './SettingRow';
import { Checkbox, Switch, TextField } from './fields';

let term: TestTerm | null = null;
afterEach(() => { term?.renderer.destroy(); term = null; });

const focusedName = (): string | undefined => focusedNode(semanticsOf(term!.renderer as never))?.name;
async function tabTo(name: string): Promise<void> {
  for (let i = 0; i < 8 && focusedName() !== name; i++) { term!.mockInput.pressTab(); await term!.settle(); }
}
const linesOf = (frame: string): string[] => frame.split('\n').map((l) => l.trimEnd());

/** A 40-cell field group (stacked: under the narrow-row width) whose one row holds `value`. */
async function stackedRow(value: ReactNode): Promise<string[]> {
  term = await drawTest(
    <FocusRoot><Box dir="column" width={40}>
      <SettingGroup variant="field" label="Alerts">
        <SettingRow label="Mail me" help="When a computer stops.">{value}</SettingRow>
      </SettingGroup>
    </Box></FocusRoot>,
    { width: 42, height: 12 },
  );
  return linesOf(await term.settle());
}

test('switch hit box: a click on the blank rest of a stacked switch line changes nothing; on its mark it toggles', async () => {
  const seen: boolean[] = [];
  const lines = await stackedRow(<Switch aria-label="Mail me" label="On" onChange={(v) => seen.push(v)} />);
  // The switch's line: its mark "[□ off]", then its words "On".
  const y = lines.findIndex((l) => l.includes('[□ off]'));
  expect(y, lines.join('\n')).toBeGreaterThanOrEqual(0);
  // Blank cells after "On", inside the group's border.
  const end = lines[y]!.indexOf('On', lines[y]!.indexOf('[□ off]')) + 2;
  await term!.mockMouse.click(end + 8, y);
  await term!.settle();
  expect(seen, lines.join('\n')).toEqual([]);
  // Positive control: a cell of the switch's own mark toggles it (never the group's border before it).
  const x = lines[y]!.indexOf('[□ off]') + 1;
  await term!.mockMouse.click(x, y);
  await term!.settle();
  expect(seen).toEqual([true]);
}, 60_000);

test('checkbox hit box: a click on the blank rest of a stacked checkbox line changes nothing; on its box it ticks', async () => {
  const seen: boolean[] = [];
  const lines = await stackedRow(<Checkbox label="Also by text" onChange={(v) => seen.push(v)} />);
  const y = lines.findIndex((l) => l.includes('[ ]'));
  expect(y, lines.join('\n')).toBeGreaterThanOrEqual(0);
  const end = lines[y]!.indexOf('Also by text') + 'Also by text'.length;
  await term!.mockMouse.click(end + 4, y);
  await term!.settle();
  expect(seen, lines.join('\n')).toEqual([]);
  await term!.mockMouse.click(lines[y]!.indexOf('[ ]') + 1, y);
  await term!.settle();
  expect(seen).toEqual([true]);
}, 60_000);

/** A field group with a Name row and a Save action; resized across the stack boundary with Save focused. */
async function saveAcross(narrow: number): Promise<void> {
  term = await drawTest(
    <FocusRoot><Box dir="column">
      <SettingGroup variant="field" label="Bot">
        <SettingRow label="Name" actions={<Button size="sm">Save</Button>}>
          <TextField aria-label="Name" defaultValue="amber" />
        </SettingRow>
      </SettingGroup>
    </Box></FocusRoot>,
    { width: 100, height: 14 },
  );
  await term.settle();
  await tabTo('Save');
  expect(focusedName()).toBe('Save');
  const wide = linesOf(await term.settle());
  const label = wide.findIndex((l) => /\bName\b/.test(l));
  // Beside its label first (a positive control: the resize below really crosses the boundary).
  expect(wide[label], wide.join('\n')).toContain('Save');
  term.resize(narrow, 14);
  const stacked = linesOf(await term.settle());
  expect(stacked[stacked.findIndex((l) => /\bName\b/.test(l))], stacked.join('\n')).not.toContain('Save');
  expect(focusedName(), stacked.join('\n')).toBe('Save');
  term.resize(100, 14);
  const back = linesOf(await term.settle());
  expect(back[back.findIndex((l) => /\bName\b/.test(l))], back.join('\n')).toContain('Save');
  expect(focusedName(), back.join('\n')).toBe('Save');
}

test('save across the stack (value line): a focused Save keeps the focus, both ways', async () => {
  // 50 cells: under the narrow-row width, room for the value and Save on one line.
  await saveAcross(50);
}, 60_000);

test('save across the stack (under): a focused Save keeps the focus, both ways', async () => {
  // 22 cells: Save goes under the value.
  await saveAcross(22);
}, 60_000);

test('narrow field shows its start: unfocused the start and one "…", focused the end with the caret', async () => {
  const VALUE = 'Ops: triage, approvals and summaries';
  term = await drawTest(
    <FocusRoot><Box dir="column" width={24}>
      <TextField aria-label="Role" defaultValue={VALUE} />
      <Button size="sm">Next</Button>
    </Box></FocusRoot>,
    { width: 30, height: 8 },
  );
  const idle = (await term.settle()).split('\n').find((l) => l.includes('│') || l.includes('┃'))!;
  expect(idle, idle).toContain('Ops: triage');
  expect(idle).toContain('…');
  expect(idle).not.toContain('summaries');
  // Positive control: focused, the engine keeps the caret (the value's end) in view.
  await tabTo('Role');
  const editing = (await term.settle()).split('\n').find((l) => l.includes('┃'))!;
  expect(editing, editing).toContain('summaries');
  // Away again: the start once more.
  await tabTo('Next');
  const after = (await term.settle()).split('\n').find((l) => l.includes('Ops'));
  expect(after, after).toContain('…');
}, 60_000);

function Checked() {
  const [v, setV] = useState('amber');
  return (
    <FocusRoot>
      <Scroll followFocus height={6}>
        {Array.from({ length: 10 }, (_, i) => <Text key={i}>{`line ${i + 1}`}</Text>)}
        <TextField label="Name" value={v} onChange={setV} {...(v.length > 5 ? { errorMessage: 'At most 5 letters.' } : {})} />
        {Array.from({ length: 4 }, (_, i) => <Text key={`t${i}`}>{`tail ${i + 1}`}</Text>)}
      </Scroll>
    </FocusRoot>
  );
}

function AutoChecked() {
  const [v, setV] = useState('amber');
  return (
    <FocusRoot>
      <Scroll followFocus height={6}>
        {Array.from({ length: 4 }, (_, i) => <Text key={i}>{`line ${i + 1}`}</Text>)}
        <TextField label="Name" autoFocus value={v} onChange={setV} {...(v.length > 5 ? { errorMessage: 'At most 5 letters.' } : {})} />
        {Array.from({ length: 4 }, (_, i) => <Text key={`t${i}`}>{`tail ${i + 1}`}</Text>)}
      </Scroll>
    </FocusRoot>
  );
}

test('error line in view: an autofocused field brings its new error line into view too', async () => {
  term = await drawTest(<AutoChecked />, { width: 40, height: 8 });
  await term.settle();
  const before = await term.settle();
  expect(focusedName()).toBe('Name');
  expect(before, before).toContain('amber');
  expect(before).not.toContain('At most 5');
  await term.mockInput.typeText('x');
  await term.settle();
  const after = await term.settle();
  expect(after, after).toContain('amberx');
  expect(after, after).toContain('At most 5 letters.');
}, 60_000);

test('error line in view: an error appearing under the focused field is scrolled into view with it', async () => {
  term = await drawTest(<Checked />, { width: 40, height: 8 });
  await term.settle();
  await tabTo('Name');
  const before = await term.settle();
  // The focus scroll brought the field in (a positive control for the scroll itself).
  expect(before, before).toContain('amber');
  expect(before).not.toContain('At most 5');
  await term.mockInput.typeText('x');
  await term.settle();
  const after = await term.settle();
  expect(after, after).toContain('amberx');
  expect(after, after).toContain('At most 5 letters.');
}, 60_000);
