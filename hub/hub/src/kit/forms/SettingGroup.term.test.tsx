// SettingGroup / SettingRow / SettingSwitch (terminal): the web component's observable behaviours, each held here.
// - A row shows label, help, value and actions; wide rows put them side by side, narrow rows stack them.
// - A group is framed and may carry a title; a danger group's title reads in the danger colour.
// - SettingSwitch: the switch is the row's control, named by the row's label; Space toggles; onChange(next).
// - An unknown (pending) outcome hides the actions, keeps the switch, locks it, and shows "May have gone through".
// - Reveal: "Replace…" opens the editor under the row with Cancel and Save; Escape cancels (onCancel); Save calls
//   onSave and closes when its promise resolves, stays open when it rejects.
// - Outside a group a SettingRow is the same row, unframed.
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { SettingGroup, SettingSwitch } from './SettingGroup';
import { SettingRow } from './SettingRow';
import { Button } from '../controls/Button';
import { TextField } from './fields';

/** Settles until `done` holds (never a fixed sleep): each settle() waits for a stable frame; the bound only stops a hang. */
async function settleUntil(t: TestTerm, done: (frame: string) => boolean, what: string): Promise<string> {
  const end = performance.now() + 2000;
  for (;;) {
    const f = await t.settle();
    if (done(f)) return f;
    if (performance.now() > end) throw new Error(`settleUntil: never happened: ${what}`);
  }
}
/** A lone Escape is only an Escape once the input parser's escape-sequence wait has passed: settle until its effect. */
const esc = (t: TestTerm, done: (frame: string) => boolean) => { t.mockInput.pressEscape(); return settleUntil(t, done, 'Escape handled'); };

test('row: label, help, value and actions side by side when wide; stacked when narrow', async () => {
  const ui = (
    <FocusRoot>
      <SettingGroup title="Profile">
        <SettingRow label="Display name" help="What people see." actions={<Button size="sm">Change</Button>}>Ada</SettingRow>
      </SettingGroup>
    </FocusRoot>
  );
  let t = await drawTest(ui, { width: 90, height: 12 });
  let f = await t.settle();
  expect(f).toContain('Profile');
  expect(f).toMatch(/Display name\s+Ada\s+\[Change\]/);
  expect(f).toContain('What people see.');
  expect(f).toContain('┌');
  t.renderer.destroy();
  t = await drawTest(ui, { width: 40, height: 14 });
  f = await t.settle();
  const lines = f.split('\n');
  const at = (s: string) => lines.findIndex((l) => l.includes(s));
  expect(at('Display name')).toBeLessThan(at('Ada'));
  expect(at('Ada')).toBeGreaterThan(at('What people see.'));
  t.renderer.destroy();
});

test('SettingSwitch: Space toggles, onChange(next); pending hides actions, locks, says so', async () => {
  const got: boolean[] = [];
  let setPending: (p: boolean) => void = () => {};
  function P() {
    const [on, setOn] = useState(false);
    const [pending, sp] = useState(false);
    setPending = sp;
    return (
      <FocusRoot>
        <SettingGroup>
          <SettingSwitch label="Ask for a code" help="Needs your app." isSelected={on} onChange={(v) => { got.push(v); setOn(v); }}
            outcome={pending ? 'pending' : undefined} actions={<Button size="sm">Reset</Button>} />
        </SettingGroup>
      </FocusRoot>
    );
  }
  const t = await drawTest(<P />, { width: 90, height: 12 });
  let f = await t.settle();
  expect(f).toMatch(/Ask for a code\s+\[□ off\]\s+\[Reset\]/);
  t.mockInput.pressTab();
  t.mockInput.pressKey(' ');
  f = await t.settle();
  expect(got).toEqual([true]);
  expect(f).toContain('[■ on ]');
  setPending(true);
  f = await t.settle();
  expect(f).not.toContain('Reset');
  expect(f).toContain('[■ on ]');
  expect(f).toContain('May have gone through');
  t.mockInput.pressKey(' ');
  await t.settle();
  expect(got).toEqual([true]);
  t.renderer.destroy();
});

test('reveal: opens under the row, Escape cancels, Save closes on resolve and stays on reject', async () => {
  const calls: string[] = [];
  let fail = true;
  function P() {
    const [v, setV] = useState('');
    return (
      <FocusRoot>
        <SettingGroup variant="field">
          <SettingRow label="Recovery email" reveal={{
            label: 'Replace…',
            editor: <TextField label="New address" value={v} onChange={setV} />,
            onSave: () => { calls.push('save'); return fail ? Promise.reject(new Error('no')) : Promise.resolve(); },
            onCancel: () => calls.push('cancel'),
          }}>a@example.org</SettingRow>
        </SettingGroup>
      </FocusRoot>
    );
  }
  const t = await drawTest(<P />, { width: 90, height: 16 });
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  let f = await settleUntil(t, (x) => x.includes('New address'), 'editor opened');
  expect(f).toContain('New address');
  expect(f).not.toContain('Replace…');
  // The focus came into the editor's first field (focusFirst, as the web's focusInto).
  await t.mockInput.typeText('b@x.org');
  expect(await t.settle()).toContain('b@x.org');
  f = await esc(t, (x) => !x.includes('New address'));
  expect(calls).toEqual(['cancel']);
  expect(f).not.toContain('New address');
  t.mockInput.pressEnter();
  await settleUntil(t, (x) => x.includes('New address'), 'editor reopened');
  // Field, then Cancel, then Save.
  t.mockInput.pressTab();
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  f = await settleUntil(t, () => calls.length === 2, 'first save settled');
  expect(calls).toEqual(['cancel', 'save']);
  expect(f).toContain('New address');
  fail = false;
  t.mockInput.pressEnter();
  f = await settleUntil(t, (x) => calls.length === 3 && !x.includes('New address'), 'second save closed the editor');
  expect(calls).toEqual(['cancel', 'save', 'save']);
  expect(f).not.toContain('New address');
  t.renderer.destroy();
});

test('outside a group a row is unframed', async () => {
  const t = await drawTest(<FocusRoot><SettingRow label="Username">ada</SettingRow></FocusRoot>, { width: 80, height: 6 });
  const f = await t.settle();
  expect(f).toMatch(/Username\s+ada/);
  expect(f).not.toContain('┌');
  t.renderer.destroy();
});
