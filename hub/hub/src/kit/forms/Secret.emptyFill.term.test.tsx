// SecretInput (single line) shows its extent while empty, as TextField does: unfocused, empty and with no placeholder,
// the box holds a faint rule ("_" repeated), never a bare gutter "│" under its label (Account > Password at 80x24:
// "New password" and "New password again" read as no field at all). Focused, typed or with a placeholder: no rule.
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { SecretInput } from './Secret';

let term: TestTerm | null = null;
afterEach(() => { term?.renderer.destroy(); term = null; });

function Form() {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [c, setC] = useState('');
  return (
    <FocusRoot><Box dir="column" width={60}>
      <SecretInput label="Current password" reveal={false} value={a} onChange={setA} autoFocus />
      <SecretInput label="New password" reveal={false} value={b} onChange={setB} />
      <SecretInput label="Recovery key" reveal={false} value={c} onChange={setC} placeholder="Paste it" />
    </Box></FocusRoot>
  );
}

/** The line drawn under the label `label` (the field's own row). */
function fieldLine(frame: string, label: string): string {
  const lines = frame.split('\n').map((l) => l.trimEnd());
  const at = lines.findIndex((l) => l.trim() === label);
  expect(at).toBeGreaterThanOrEqual(0);
  return lines[at + 1] ?? '';
}

test('an empty unfocused secret field shows a faint rule; focused, typed or with a placeholder it does not', async () => {
  term = await drawTest(<Form />, { width: 62, height: 16 });
  let f = await term.settle();
  // Focused (autoFocus) and empty: the caret, no rule.
  expect(fieldLine(f, 'Current password')).not.toContain('_');
  // Unfocused and empty: the rule across the box.
  expect(fieldLine(f, 'New password')).toMatch(/_{8,}/);
  // A placeholder is drawn instead of the rule.
  const ph = fieldLine(f, 'Recovery key');
  expect(ph).toContain('Paste it');
  expect(ph).not.toContain('_');

  // Into New password and type: bullets, no rule; Current password, now unfocused and empty, gets the rule.
  term.mockInput.pressTab();
  await term.mockInput.typeText('abc');
  f = await term.settle();
  const typed = fieldLine(f, 'New password');
  expect(typed).toContain('•••');
  expect(typed).not.toContain('_');
  expect(typed).not.toContain('abc');
  expect(fieldLine(f, 'Current password')).toMatch(/_{8,}/);
}, 60_000);
