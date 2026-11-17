// fields.term: the web component's observable behaviours, each held here.
// TextField
//  - label, description, required mark (* + "required"), read-only and unavailable words; error replaces description (✗)
//  - controlled and uncontrolled (defaultValue); onChange(value)
//  - type=password: never drawn, bullets only
//  - native validation: a required field shows "Fill in this field." only after a submit attempt (Enter), and the
//    submit is refused with the focus put in the first invalid field; a page errorMessage shows at once, never blocks
//  - Form fieldErrors by name show until the value changes
//  - isDisabled / Form lock: no edits, faint, "(unavailable)"
//  - focusOnError: the field takes the focus when its error appears
//  - onKeyDown receives DOM-shaped keys (key 'ArrowUp'); preventDefault takes the key
// SearchField: `/` focuses it; Escape clears a field with text; onSubmit(value) on Enter
// Switch: [□ off] / [■ on ] (reads in mono), Space and Enter toggle, onChange(next)
// Checkbox: [ ] / [x] / [-], onChange(next)
// RuleChecklist: ○ unmet, ✓ met
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { Row } from '../layouts/Stack';
import { renderPage } from '../../../scripts/term/render';
import { Checkbox, RuleChecklist, SearchField, Switch, TextField } from './fields';
import { Form } from './more';

const W = { width: 60, height: 12 };

test('frame: label, required mark, description; read-only and unavailable words', async () => {
  const t = await drawTest(
    <FocusRoot>
      <TextField label="Name" isRequired description="What people see." value="ada" onChange={() => {}} />
      <TextField label="Id" isReadOnly value="x1" onChange={() => {}} />
      <TextField label="Off" isDisabled value="" onChange={() => {}} />
    </FocusRoot>, W);
  const f = t.captureCharFrame();
  expect(f).toContain('Name * (required)');
  expect(f).toContain('What people see.');
  expect(f).toContain('Id (read only)');
  expect(f).toContain('Off (unavailable)');
  expect(f).toMatch(/│ ada/);
  t.renderer.destroy();
});

function Signup({ sent, errors }: { sent: string[]; errors?: Record<string, string> }) {
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  return (
    <FocusRoot>
      <Form onSubmit={() => sent.push(name)} fieldErrors={errors}>
        <TextField label="Name" name="name" isRequired value={name} onChange={setName} autoFocus />
        <TextField label="Password" type="password" value={pw} onChange={setPw} />
      </Form>
    </FocusRoot>
  );
}

test('required: no error before a submit; Enter refuses an empty submit and shows it; typing fixes it', async () => {
  const sent: string[] = [];
  const t = await drawTest(<Signup sent={sent} />, W);
  expect(t.captureCharFrame()).not.toContain('Fill in this field.');
  t.mockInput.pressEnter();
  let f = await t.settle();
  expect(sent).toEqual([]);
  expect(f).toContain('✗ Fill in this field.');
  await t.mockInput.typeText('ada');
  f = await t.settle();
  expect(f).not.toContain('Fill in this field.');
  t.mockInput.pressEnter();
  await t.settle();
  expect(sent).toEqual(['ada']);
  t.renderer.destroy();
});

test('password: typed text is never drawn', async () => {
  const t = await drawTest(<Signup sent={[]} />, W);
  t.mockInput.pressTab();
  await t.mockInput.typeText('hunter2');
  const f = await t.settle();
  expect(f).not.toContain('hunter2');
  expect(f).toContain('•••••••');
  t.renderer.destroy();
});

test('server error by name shows until the value changes', async () => {
  const t = await drawTest(<Signup sent={[]} errors={{ name: 'Taken.' }} />, W);
  expect(await t.settle()).toContain('✗ Taken.');
  await t.mockInput.typeText('b');
  expect(await t.settle()).not.toContain('Taken.');
  t.renderer.destroy();
});

test('page errorMessage shows at once; focusOnError takes the focus; onKeyDown sees ArrowUp', async () => {
  const keys: string[] = [];
  function P() {
    const [err, setErr] = useState<string | undefined>();
    const [v, setV] = useState('');
    return (
      <FocusRoot>
        <TextField label="A" value="" onChange={() => {}} autoFocus />
        <TextField label="B" value={v} onChange={(x) => { setV(x); if (x === 'bad') setErr('No.'); }} errorMessage={err} focusOnError
          onKeyDown={(e) => { keys.push(e.key); if (e.key === 'ArrowUp') e.preventDefault(); }} />
      </FocusRoot>
    );
  }
  const t = await drawTest(<P />, W);
  t.mockInput.pressTab();
  await t.mockInput.typeText('bad');
  t.mockInput.pressArrow('up');
  const f = await t.settle();
  expect(f).toContain('✗ No.');
  expect(keys).toContain('ArrowUp');
  expect(keys).toContain('b');
  t.renderer.destroy();
});

test('uncontrolled defaultValue edits; disabled does not', async () => {
  const seen: string[] = [];
  const t = await drawTest(<FocusRoot><TextField label="X" defaultValue="ab" onChange={(v) => seen.push(v)} autoFocus /><TextField label="Y" isDisabled defaultValue="zz" /></FocusRoot>, W);
  await t.mockInput.typeText('c');
  const f = await t.settle();
  expect(f).toContain('abc');
  expect(seen).toEqual(['abc']);
  t.renderer.destroy();
});

test('SearchField: / focuses, Escape clears, Enter submits', async () => {
  const submitted: string[] = [];
  function P() {
    const [q, setQ] = useState('');
    return <FocusRoot><SearchField value={q} onChange={setQ} onSubmit={(v) => submitted.push(v)} /></FocusRoot>;
  }
  const t = await drawTest(<P />, W);
  await t.mockInput.typeText('/');
  await t.settle();
  await t.mockInput.typeText('logs');
  expect(await t.settle()).toContain('logs');
  t.mockInput.pressEnter();
  await t.settle();
  expect(submitted).toEqual(['logs']);
  t.mockInput.pressEscape();
  // A lone ESC byte is told from an escape sequence by a short timeout.
  await new Promise((r) => setTimeout(r, 120));
  expect(await t.settle()).not.toContain('logs');
  t.renderer.destroy();
});

test('Switch and Checkbox: marks read in mono, Space toggles, onChange(next)', async () => {
  const got: Array<[string, boolean]> = [];
  function P() {
    const [a, setA] = useState(false);
    const [b, setB] = useState(true);
    return (
      <FocusRoot>
        <Switch label="Live" isSelected={a} onChange={(v) => { got.push(['sw', v]); setA(v); }} />
        <Checkbox label="Agree" isSelected={b} onChange={(v) => { got.push(['cb', v]); setB(v); }} />
        <Checkbox label="Some" isIndeterminate />
      </FocusRoot>
    );
  }
  const t = await drawTest(<P />, W);
  let f = t.captureCharFrame();
  expect(f).toContain('[□ off] Live');
  expect(f).toContain('[x] Agree');
  expect(f).toContain('[-] Some');
  t.mockInput.pressTab();
  t.mockInput.pressKey(' ');
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(got).toEqual([['sw', true], ['cb', false]]);
  expect(f).toContain('[■ on ] Live');
  expect(f).toContain('[ ] Agree');
  t.renderer.destroy();
});

test('RuleChecklist marks', async () => {
  const t = await drawTest(<RuleChecklist rules={[{ id: 'a', label: '12 characters', met: true }, { id: 'b', label: 'A digit', met: false }]} />, W);
  const f = t.captureCharFrame();
  expect(f).toContain('✓ 12 characters');
  expect(f).toContain('○ A digit');
  t.renderer.destroy();
});

// maxLength reaches the field (typed text and a paste both stop at the limit; masked fields too).
test('maxLength: typing and pasting stop at the limit (text, password, search)', async () => {
  const got: Record<string, string> = {};
  function P() {
    const [a, setA] = useState('');
    const [b, setB] = useState('');
    const [c, setC] = useState('');
    got.a = a; got.b = b; got.c = c;
    return (
      <FocusRoot>
        <TextField label="Name" maxLength={3} value={a} onChange={setA} autoFocus />
        <TextField label="Pin" type="password" maxLength={4} value={b} onChange={setB} />
        <SearchField label="Find" maxLength={2} value={c} onChange={setC} />
      </FocusRoot>
    );
  }
  const t = await drawTest(<P />, { width: 60, height: 16 });
  await t.mockInput.typeText('webby');
  await t.settle();
  expect(got.a).toBe('web');
  t.mockInput.pressTab();
  await t.settle();
  await t.mockInput.typeText('123456');
  await t.settle();
  expect(got.b).toBe('1234');
  t.mockInput.pressTab();
  await t.settle();
  await t.mockInput.pasteBracketedText('abcdef');
  await t.settle();
  expect(got.c).toBe('ab');
  t.renderer.destroy();
});

// A multi-line field is no keyboard trap: Tab and Shift+Tab leave it, as they leave a web textarea (no tab is typed).
test('multiline: Tab and Shift+Tab leave the field; no tab is typed', async () => {
  const got: string[] = [];
  function P() {
    const [v, setV] = useState('');
    got[0] = v;
    return (
      <FocusRoot>
        <TextField label="Before" value="" onChange={() => {}} />
        <TextField label="Notes" multiline rows={4} value={v} onChange={setV} autoFocus />
        <TextField label="After" value="" onChange={() => {}} />
      </FocusRoot>
    );
  }
  const t = await drawTest(<P />, { width: 60, height: 20 });
  await t.settle();
  await t.mockInput.typeText('ab');
  t.mockInput.pressTab();
  let f = await t.settle();
  expect(got[0]).toBe('ab');
  expect(f).toMatch(/After *\n┃/);
  t.mockInput.pressTab({ shift: true });
  t.mockInput.pressTab({ shift: true });
  f = await t.settle();
  expect(f).toMatch(/Before *\n┃/);
  expect(got[0]).toBe('ab');
  t.renderer.destroy();
});

// An unsized field in a wrapping row (tunnels Setup: Host and Port side by side) was drawn at its
// label's width, so Port's 3000 read "│ 00". The web's input keeps its intrinsic width (size=20); an unsized field here
// is at least FIELD_MIN cells wide, so its value shows whole.
test('an unsized field in a wrapping row keeps room for its value (never its label\'s width)', async () => {
  const t = await drawTest(
    <FocusRoot>
      <Box dir="column" width={100}>
        <Row gap={4} wrap align="start">
          <TextField label="Host" description="The address the tunnel reaches" value="10.0.0.5" onChange={() => {}} mono />
          <TextField label="Port" value="3000" onChange={() => {}} mono />
        </Row>
      </Box>
    </FocusRoot>,
    { width: 100, height: 6 },
  );
  const f = await t.settle();
  expect(f, f).toContain('3000');
  t.renderer.destroy();
});

test('tunnels Setup: Port shows its whole value at 120x40 and 200x50', async () => {
  for (const [cols, rows] of [[120, 40], [200, 50]] as const) {
    const s = await renderPage({ page: 'tunnels', path: '/tunnels?setup=new', cols, rows });
    await s.settle();
    expect(s.frame, s.frame).toMatch(/[│┃] 3000/);
    s.close();
  }
}, 240_000);

test('a field whose page class grows it (flex: 1) fills its row, as the web (Home Ask: the button sits at the row end)', async () => {
  const { setStyleTable } = await import('../../term/jsx/style');
  setStyleTable((el) => (el.classes.includes('t#fill') ? { box: { raw: { flexGrow: 1, flexShrink: 1, minWidth: 0 } } } : undefined));
  try {
    const t = await drawTest(
      <FocusRoot>
        <Box dir="row" width={60} gap={2}>
          <TextField className="t#fill" aria-label="Ask" placeholder="Ask atlas to…" value="" onChange={() => {}} />
          <Box shrink={0}><Text>[Ask]</Text></Box>
        </Box>
      </FocusRoot>,
      { width: 70, height: 4 },
    );
    const f = await t.settle();
    const row = f.split('\n').find((l) => l.includes('[Ask]')) ?? '';
    expect(row.indexOf('[Ask]'), f).toBe(55);
    t.renderer.destroy();
  } finally {
    setStyleTable(null);
  }
});

test('SearchField read-only: no × is drawn and a click where it would be clears nothing', async () => {
  const changes: string[] = [];
  function P({ ro }: { ro: boolean }) {
    const [q, setQ] = useState('logs');
    return <FocusRoot><SearchField value={q} onChange={(v) => { changes.push(v); setQ(v); }} isReadOnly={ro} /></FocusRoot>;
  }
  // Where the × is: found on the editable field, then the same cell is clicked on the read-only one.
  const a = await drawTest(<P ro={false} />, W);
  const rowsA = (await a.settle()).split('\n');
  const y = rowsA.findIndex((l) => l.includes('×'));
  expect(y).toBeGreaterThanOrEqual(0);
  const x = rowsA[y]!.indexOf('×');
  a.renderer.destroy();
  const t = await drawTest(<P ro />, W);
  const f = await t.settle();
  expect(f).toContain('logs');
  expect(f).not.toContain('×');
  await t.mockMouse.click(x, y);
  expect(await t.settle()).toContain('logs');
  expect(changes).toEqual([]);
  t.renderer.destroy();
});
