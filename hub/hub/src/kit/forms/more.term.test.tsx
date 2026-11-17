// more.term: the web component's observable behaviours, each held here.
// Select: closed shows the picked label or the placeholder with ▾; Enter/Space/↓ open an anchored list; ↑/↓ skip
//   disabled options; Enter picks and calls onChange(value) once (never for the picked one again); Esc closes; the
//   focus is back on the trigger; above 7 options a search box narrows the list, Esc clears it first; a typed letter
//   on the closed trigger picks the next option starting with it (typeahead); a required empty Select refuses a submit.
// Combobox: typing filters (label, description, group); ↓ moves, Enter picks; leaving resets the text to the pick.
// Both lists on a short screen: windowed to the room the panel can get; the highlighted row is always drawn.
// RadioGroup: one Tab stop; arrows move and select, skipping disabled; (•) marks the pick (mono).
// NumberField: ↑/↓ step, bounds clamp, typed text commits on leaving (snapped to the step); [−]/[+] at bounds faint;
//   in a Form, Enter right after typing submits the typed number (the Form's onSubmit sees it).
// TimeField: '930' becomes 09:30 on leaving; ↑ steps 15 minutes; a non-time shows the error.
// Form + FormFooter: Save disabled until dirty; "● Unsaved changes"; Save submits through the Form; busy shows
//   "Saving…" and locks the fields; pending shows "◷ May have gone through" with Check again only (no Save).
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { Combobox, Form, FormFooter, NumberField, RadioGroup, Select, TimeField } from './more';
import { TextField } from './fields';
import type { Option } from './more.pure';

const esc = async (t: TestTerm) => { t.mockInput.pressEscape(); await new Promise((r) => setTimeout(r, 120)); return t.settle(); };
const opts: Option[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo', isDisabled: true },
  { value: 'c', label: 'Charlie', description: 'third' },
];

function Sel({ got, options = opts, initial }: { got: string[]; options?: Option[]; initial?: string }) {
  const [v, setV] = useState<string | undefined>(initial);
  return (
    <FocusRoot>
      <Select label="Region" options={options} value={v} onChange={(x) => { got.push(x); setV(x); }} />
    </FocusRoot>
  );
}

test('Select: placeholder, open, skip disabled, pick, close, focus back', async () => {
  const got: string[] = [];
  const t = await drawTest(<Sel got={got} />, { width: 60, height: 20 });
  expect(t.captureCharFrame()).toContain('Choose…');
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  let f = await t.settle();
  expect(f).toContain('Alpha');
  expect(f).toContain('Charlie third');
  t.mockInput.pressArrow('down');
  await t.settle();
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(got).toEqual(['c']);
  expect(f).not.toContain('Alpha');
  expect(f).toMatch(/Charlie\s+▾/);
  // Picking the picked one again is no change.
  t.mockInput.pressEnter();
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(got).toEqual(['c']);
  t.renderer.destroy();
});

test('Select: Esc closes without a change; typeahead on the closed trigger', async () => {
  const got: string[] = [];
  const t = await drawTest(<Sel got={got} initial="a" />, { width: 60, height: 20 });
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  expect(await t.settle()).toContain('✓ Alpha');
  const f = await esc(t);
  expect(f).not.toContain('Charlie');
  expect(got).toEqual([]);
  await t.mockInput.typeText('c');
  expect(await t.settle()).toMatch(/Charlie\s+▾/);
  expect(got).toEqual(['c']);
  t.renderer.destroy();
});

test('Select: more than 7 options get a search box; typing narrows; Esc clears the search first', async () => {
  const many: Option[] = Array.from({ length: 12 }, (_, i) => ({ value: `v${i}`, label: `Zone ${String.fromCharCode(65 + i)}`, group: i < 6 ? 'Europe' : 'Asia' }));
  const got: string[] = [];
  const t = await drawTest(<Sel got={got} options={many} />, { width: 60, height: 24 });
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  let f = await t.settle();
  expect(f).toContain('Search…');
  expect(f).toContain('Europe');
  await t.mockInput.typeText('zone k');
  f = await t.settle();
  expect(f).toContain('Zone K');
  expect(f).not.toContain('Zone A');
  f = await esc(t);
  expect(f).toContain('Zone A');
  t.mockInput.pressEnter();
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(got.length).toBe(1);
  t.renderer.destroy();
});

test('Combobox: typing filters, ↓ Enter picks, leaving resets the text', async () => {
  const got: string[] = [];
  function P() {
    const [v, setV] = useState<string | undefined>();
    return <FocusRoot><Combobox label="Pick" options={opts} value={v} onChange={(x) => { got.push(x); setV(x); }} /><TextField label="Next" value="" onChange={() => {}} /></FocusRoot>;
  }
  const t = await drawTest(<P />, { width: 60, height: 20 });
  t.mockInput.pressTab();
  await t.mockInput.typeText('char');
  let f = await t.settle();
  expect(f).toContain('Charlie');
  expect(f).not.toContain('Alpha');
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(got).toEqual(['c']);
  await t.mockInput.typeText('zz');
  t.mockInput.pressTab();
  f = await t.settle();
  expect(f).toMatch(/│ Charlie/);
  t.renderer.destroy();
});

test('RadioGroup: arrows move and select (skipping disabled), (•) marks', async () => {
  const got: string[] = [];
  function P() {
    const [v, setV] = useState<string | undefined>('a');
    return <FocusRoot><RadioGroup label="Size" options={opts} value={v} onChange={(x) => { got.push(x); setV(x); }} /></FocusRoot>;
  }
  const t = await drawTest(<P />, { width: 60, height: 12 });
  expect(t.captureCharFrame()).toContain('(•) Alpha');
  t.mockInput.pressTab();
  t.mockInput.pressArrow('down');
  const f = await t.settle();
  expect(got).toEqual(['c']);
  expect(f).toContain('(•) Charlie');
  expect(f).toContain('( ) Bravo (unavailable)');
  t.renderer.destroy();
});

test('NumberField: steps, clamps, commits typed text on leaving', async () => {
  const got: number[] = [];
  function P() {
    const [v, setV] = useState(4);
    return <FocusRoot><NumberField label="CPUs" value={v} minValue={1} maxValue={8} step={1} onChange={(n) => { got.push(n); setV(n); }} /><TextField label="x" value="" onChange={() => {}} /></FocusRoot>;
  }
  const t = await drawTest(<P />, { width: 60, height: 12 });
  t.mockInput.pressTab();
  t.mockInput.pressArrow('up');
  await t.settle();
  expect(got).toEqual([5]);
  t.mockInput.pressKey('u', { ctrl: true });
  await t.mockInput.typeText('42');
  t.mockInput.pressTab();
  const f = await t.settle();
  expect(got).toEqual([5, 8]);
  expect(f).toContain('8');
  expect(f).toContain('[+]');
  t.renderer.destroy();
});

test('NumberField in a Form: typing a minute and pressing Enter submits that minute, not the one before', async () => {
  const sent: number[] = [];
  function P() {
    const [minute, setMinute] = useState(5);
    return (
      <FocusRoot>
        <Form onSubmit={() => sent.push(minute)}>
          <NumberField label="Minute" value={minute} minValue={0} maxValue={59} onChange={setMinute} autoFocus />
        </Form>
      </FocusRoot>
    );
  }
  const t = await drawTest(<P />, { width: 60, height: 10 });
  t.mockInput.pressKey('u', { ctrl: true });
  await t.mockInput.typeText('42');
  t.mockInput.pressEnter();
  await t.settle();
  expect(sent).toEqual([42]);
  t.mockInput.pressEnter();
  await t.settle();
  expect(sent).toEqual([42, 42]);
  t.renderer.destroy();
});

test('TimeField: normalizes on leaving, ↑ steps, a non-time shows the error', async () => {
  const got: string[] = [];
  function P() {
    const [v, setV] = useState('');
    return <FocusRoot><TimeField label="At" value={v} onChange={(x) => { got.push(x); setV(x); }} /><TextField label="x" value="" onChange={() => {}} /></FocusRoot>;
  }
  const t = await drawTest(<P />, { width: 60, height: 12 });
  t.mockInput.pressTab();
  await t.mockInput.typeText('930');
  t.mockInput.pressTab();
  let f = await t.settle();
  expect(f).toContain('09:30');
  t.mockInput.pressTab();
  t.mockInput.pressArrow('up');
  f = await t.settle();
  expect(f).toContain('09:45');
  t.mockInput.pressKey('u', { ctrl: true });
  await t.mockInput.typeText('99');
  f = await t.settle();
  expect(f).toContain('✗ Use a 24-hour time such as 09:30.');
  t.renderer.destroy();
});

test('Form + FormFooter: dirty, submit, busy lock, pending', async () => {
  const sent: string[] = [];
  let setOutcome: (o: 'pending' | undefined) => void = () => {};
  let setBusy: (b: boolean) => void = () => {};
  function P() {
    const [name, setName] = useState('ada');
    const [busy, b] = useState(false);
    const [outcome, o] = useState<'pending' | undefined>();
    setOutcome = o;
    setBusy = b;
    return (
      <FocusRoot>
        <Form onSubmit={() => sent.push(name)} busy={busy} outcome={outcome} onCheck={() => {}}>
          <TextField label="Name" value={name} onChange={setName} autoFocus />
          <FormFooter dirty={name !== 'ada'} />
        </Form>
      </FocusRoot>
    );
  }
  const t = await drawTest(<P />, { width: 70, height: 12 });
  let f = t.captureCharFrame();
  expect(f).toContain('Save');
  expect(f).not.toContain('Unsaved');
  await t.mockInput.typeText('!');
  f = await t.settle();
  expect(f).toContain('● Unsaved changes');
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  await t.settle();
  expect(sent).toEqual(['ada!']);
  setBusy(true);
  f = await t.settle();
  expect(f).toContain('Saving…');
  expect(f).toContain('Name (unavailable)');
  setBusy(false);
  setOutcome('pending');
  f = await t.settle();
  expect(f).toContain('◷ May have gone through');
  expect(f).toContain('Check again');
  expect(f).not.toContain('Save');
  t.renderer.destroy();
});

// A Select's trigger is a button as wide as its text (the web's too): it has no text input's minimum width. In less room
// than its label needs it cuts the label with "…" and keeps its ▾. With the unsized-field minimum (FIELD_MIN, 22 cells)
// on its frame it stayed 22 wide in a 16-cell box and the ▾ was drawn outside it (SegmentedControl's narrow fallback
// lost its ▾: SegmentedControl.room.term.test.tsx).
test('Select in less room than its label: the label is cut, the ▾ stays inside the box', async () => {
  const wide: Option[] = [{ value: 'here', label: 'This computer here' }, { value: 'all', label: 'All computers' }];
  const t = await drawTest(
    <FocusRoot>
      <Box dir="row" width={40}>
        <Box dir="column" width={16}><Select aria-label="Where" options={wide} value="here" onChange={() => {}} /></Box>
        <Box width={1} shrink={0} />
      </Box>
    </FocusRoot>,
    { width: 40, height: 3 },
  );
  const row = (await t.settle()).split('\n')[0]!;
  expect(row.slice(0, 16), row).toMatch(/^│ This.*… ▾ *$/);
  expect(row.slice(16).trim(), row).toBe('');
  t.renderer.destroy();
});

test('a short screen: Select and Combobox lists window to the room; the highlighted row is always drawn', async () => {
  // Six options (no search box); 9 rows: the list's panel has 6 rows below the trigger, frame and hint included.
  const six: Option[] = Array.from({ length: 6 }, (_, i) => ({ value: `v${i}`, label: `Zone ${String.fromCharCode(65 + i)}` }));
  const got: string[] = [];
  const t = await drawTest(<Sel got={got} options={six} />, { width: 40, height: 9 });
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  let f = await t.settle();
  expect(f).toContain('›  Zone A');
  for (let i = 1; i < 6; i++) {
    t.mockInput.pressArrow('down');
    f = await t.settle();
    expect(f).toContain(`›  Zone ${String.fromCharCode(65 + i)}`);
  }
  t.mockInput.pressEnter();
  await t.settle();
  expect(got).toEqual(['v5']);
  t.renderer.destroy();

  const got2: string[] = [];
  function P() {
    const [v, setV] = useState<string | undefined>();
    return <FocusRoot><Combobox label="Pick" options={six} value={v} onChange={(x) => { got2.push(x); setV(x); }} /></FocusRoot>;
  }
  const t2 = await drawTest(<P />, { width: 40, height: 8 });
  t2.mockInput.pressTab();
  await t2.mockInput.typeText('zone');
  f = await t2.settle();
  for (let i = 1; i < 6; i++) {
    t2.mockInput.pressArrow('down');
    f = await t2.settle();
    expect(f).toContain(`›  Zone ${String.fromCharCode(65 + i)}`);
  }
  t2.mockInput.pressEnter();
  await t2.settle();
  expect(got2).toEqual(['v5']);
  t2.renderer.destroy();
}, 30_000);

// Catches the Select's own validation (more.term.tsx Select: `useValidation({ isRequired, focus: () => trig.focus() })`):
// Select.scenario.ts names this file for `isRequired` (its web side is the hidden select's native validity).
test('Select: a required Select with no pick refuses the Form submit, says why and takes the focus; a pick lets it through', async () => {
  const sent: string[] = [];
  function P() {
    const [name, setName] = useState('');
    const [region, setRegion] = useState<string | undefined>();
    return (
      <FocusRoot>
        <Form onSubmit={() => sent.push(`${name}/${region ?? ''}`)}>
          <TextField label="Name" value={name} onChange={setName} autoFocus />
          <Select label="Region" isRequired options={opts} value={region} onChange={setRegion} />
        </Form>
      </FocusRoot>
    );
  }
  const t = await drawTest(<P />, { width: 60, height: 20 });
  expect(t.captureCharFrame()).not.toContain('Fill in this field.');
  await t.mockInput.typeText('ada');
  t.mockInput.pressEnter();
  let f = await t.settle();
  expect(sent).toEqual([]);
  expect(f).toContain('✗ Fill in this field.');
  // The refused submit put the focus on the Select: Enter opens its list there, and Enter picks the first option.
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(f).toContain('Charlie third');
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(f).toMatch(/Alpha\s+▾/);
  expect(f).not.toContain('Fill in this field.');
  t.mockInput.pressTab({ shift: true });
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(sent).toEqual(['ada/a']);
  t.renderer.destroy();
});
