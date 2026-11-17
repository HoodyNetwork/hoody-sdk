// PickerField in the terminal (PickerField.term.tsx): the kit field frame around one picker, and the words it hands the
// picker's trigger (pickerFieldWords.ts; read by PickerTrigger in ComputerPicker.term.tsx):
//   - the visible label above, the description under; an error replaces the description, marked ✗
//   - the trigger is named by what it shows, then the field's label (not its own `label`), described by the error, else
//     the description; an error marks it invalid
//   - showLabel={false}: no drawn label, the trigger still carries the field's label in its name
import { afterEach, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { semanticsOf, semText } from '../../term/prim/semantics';
import { PickerTrigger } from './ComputerPicker';
import { PickerField } from './PickerField';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const draw = async (node: ReactNode): Promise<string> => {
  t = await drawTest(<FocusRoot>{node}</FocusRoot>, { width: 70, height: 8 });
  return t.settle();
};
const tree = () => semText(semanticsOf(t!.renderer as never));
// The trigger sits in a row, as every picker's trigger does (Popover.term anchors it in a row box): its flex basis is
// its width there. Straight in the field's column the basis would be its height, and the lines under it pushed down.
const trigger = <Box dir="row"><PickerTrigger label="Computer in the left pane" text="atlas" /></Box>;

// Catches FieldFrame's label / description (line 24) and the words provider (line 22).
test('label above, description under; the trigger is named by its words and the field label, described by the help', async () => {
  const f = await draw(<PickerField label="Computer" description="Where the program runs.">{trigger}</PickerField>);
  const lines = f.split('\n');
  const at = (s: string) => lines.findIndex((l) => l.includes(s));
  expect(at('Computer')).toBeGreaterThanOrEqual(0);
  expect(at('atlas')).toBeGreaterThan(at('Computer'));
  expect(at('Where the program runs.')).toBeGreaterThan(at('atlas'));
  expect(tree()).toMatch(/button "atlas Computer".*\(Where the program runs\.\)/);
  expect(tree()).not.toContain('left pane');
});

// Catches `invalid` (line 19) and the error taking the description's place (lines 22, 24).
test('an error replaces the description, marked ✗; the trigger is invalid and described by the error', async () => {
  const f = await draw(<PickerField label="Computer" description="Where the program runs." errorMessage="Pick a running computer.">{trigger}</PickerField>);
  expect(f).toContain('✗ Pick a running computer.');
  expect(f).not.toContain('Where the program runs.');
  expect(tree()).toMatch(/button "atlas Computer".*invalid.*\(Pick a running computer\.\)/);
});

// Catches the showLabel branch (lines 23-27): the label is not drawn, the name still carries it.
test('showLabel={false}: no drawn label; the trigger is still named by the field label', async () => {
  const f = await draw(<PickerField label="Computer" showLabel={false}>{trigger}</PickerField>);
  expect(f).not.toContain('Computer');
  expect(f).toContain('atlas');
  expect(tree()).toContain('button "atlas Computer"');
});
