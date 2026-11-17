// Form in the terminal: Enter in a field is the browser's implicit submission. It submits nothing while the form's
// default submit button (FormFooter's Save) is off, as on the web: Save turned off by the page (submitDisabled), or an
// unchanged form (Save needs a change). Once Save is on, Enter submits as Save does. That holds in the commit that makes
// the Form a new host (a page's inline fieldErrors) or mounts Save afresh too, and a field that clears itself after a
// submit (OtpField) keeps its code when Enter submitted nothing (Save off, or a field invalid), in a kit Form and in a
// raw form alike.
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { Form, FormFooter, NumberField } from './more';
import { TextField } from './fields';
import { OtpField } from './OtpField';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

let setOff: (off: boolean) => void = () => {};
function P({ sent, start }: { sent: string[]; start: boolean }) {
  const [name, setName] = useState('ada');
  const [off, o] = useState(start);
  setOff = o;
  return (
    <FocusRoot>
      <Form onSubmit={() => sent.push(name)}>
        <TextField label="Name" value={name} onChange={setName} autoFocus />
        <FormFooter dirty={name !== 'ada'} submitDisabled={off} />
      </Form>
    </FocusRoot>
  );
}

// Catches a kit Form's field getting the explicit submit on Enter: it went past a Save the page had turned off.
test('Enter in a field submits nothing while the page turns Save off; once Save is on, Enter submits', async () => {
  const sent: string[] = [];
  t = await drawTest(<P sent={sent} start />, { width: 70, height: 12 });
  await t.settle();
  await t.mockInput.typeText('!');
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(sent).toEqual([]);
  setOff(false);
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(sent).toEqual(['ada!']);
});

// The other way Save is off: nothing changed yet (FormFooter's requireDirty, the default).
test('Enter in an unchanged form submits nothing; after a change it submits', async () => {
  const sent: string[] = [];
  t = await drawTest(<P sent={sent} start={false} />, { width: 70, height: 12 });
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(sent).toEqual([]);
  await t.mockInput.typeText('!');
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(sent).toEqual(['ada!']);
});

// NumberField submits in an effect of the commit that holds the typed number. That commit may also make the Form a new
// host (`host`: a new fieldErrors object on every render) or mount Save afresh (`remount`: the footer keyed on the
// number): Save must be the form's default button when that effect runs.
let setNumOff: (off: boolean) => void = () => {};
function N({ sent, mode }: { sent: number[]; mode: 'host' | 'remount' }) {
  const [minute, setMinute] = useState(5);
  const [off, o] = useState(true);
  setNumOff = o;
  return (
    <FocusRoot>
      <Form onSubmit={() => sent.push(minute)} {...(mode === 'host' ? { fieldErrors: {} } : {})}>
        <NumberField label="Minute" value={minute} minValue={0} maxValue={59} onChange={setMinute} autoFocus />
        <FormFooter key={mode === 'remount' ? minute : 'footer'} dirty submitDisabled={off} />
      </Form>
    </FocusRoot>
  );
}

// Catches the submit button missing from the Form when NumberField's effect runs: taken out in the commit of a new host,
// or not yet in after a remount. Enter then found no default button and submitted past a Save that was off.
for (const mode of ['host', 'remount'] as const) {
  test(`NumberField Enter in the commit that ${mode === 'host' ? 'makes a new host' : 'remounts Save'}: nothing while Save is off; once on, the number`, async () => {
    const sent: number[] = [];
    t = await drawTest(<N sent={sent} mode={mode} />, { width: 70, height: 12 });
    await t.settle();
    t.mockInput.pressKey('u', { ctrl: true });
    await t.settle();
    await t.mockInput.typeText('42');
    await t.settle();
    t.mockInput.pressEnter();
    expect(await t.settle()).toContain('42');
    expect(sent).toEqual([]);
    setNumOff(false);
    await t.settle();
    t.mockInput.pressEnter();
    await t.settle();
    expect(sent).toEqual([42]);
  });
}

/** Enter, then the field's wipe task (a 0 ms timer) and a frame. */
async function enter(): Promise<string> {
  t!.mockInput.pressEnter();
  await t!.settle();
  await new Promise((r) => setTimeout(r, 30));
  return t!.settle();
}

let setOtpOff: (off: boolean) => void = () => {};
/** The code field in a kit Form (FormFooter's Save) or in a raw form (a raw submit button); `got` hears every value. */
function O({ raw, got, sent }: { raw: boolean; got: string[]; sent: string[] }) {
  const [code, setCode] = useState('');
  const [off, o] = useState(true);
  setOtpOff = o;
  const field = <OtpField value={code} onChange={(x) => { got.push(x); setCode(x); }} autoFocus />;
  return (
    <FocusRoot>
      {raw ? (
        <form onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); sent.push(code); }}>
          {field}
          <button type="submit" disabled={off}>Send</button>
        </form>
      ) : (
        <Form onSubmit={() => sent.push(code)}>
          {field}
          <FormFooter dirty submitDisabled={off} />
        </Form>
      )}
    </FocusRoot>
  );
}

// Catches the code field wiping itself after an Enter that submitted nothing (the web wipes on a submit event only).
for (const raw of [false, true]) {
  test(`OtpField in a ${raw ? 'raw form' : 'kit Form'}: Enter with the submit button off keeps the code; once on, submits and wipes`, async () => {
    const got: string[] = [];
    const sent: string[] = [];
    t = await drawTest(<O raw={raw} got={got} sent={sent} />, { width: 70, height: 12 });
    await t.settle();
    await t.mockInput.typeText('123456');
    expect(await t.settle()).toContain('[1][2][3][4][5][6]');
    let f = await enter();
    expect(sent).toEqual([]);
    expect(got.at(-1)).toBe('123456');
    expect(f).toContain('[1][2][3][4][5][6]');
    setOtpOff(false);
    await t.settle();
    f = await enter();
    expect(sent).toEqual(['123456']);
    expect(got.at(-1)).toBe('');
    expect(f).toContain('[_][_][_][_][_][_]');
  });
}

// The other way Enter submits nothing: a field of the form is invalid (a required name left empty). The code stays.
function V({ got, sent }: { got: string[]; sent: string[] }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  return (
    <FocusRoot>
      <Form onSubmit={() => sent.push(`${name}:${code}`)}>
        <TextField label="Name" value={name} onChange={setName} isRequired />
        <OtpField value={code} onChange={(x) => { got.push(x); setCode(x); }} autoFocus />
        <FormFooter dirty />
      </Form>
    </FocusRoot>
  );
}

// Catches the code field wiping itself after an Enter the form's validation refused (nothing was submitted).
test('OtpField: Enter refused by an invalid field keeps the code; the name filled, Enter submits it', async () => {
  const got: string[] = [];
  const sent: string[] = [];
  t = await drawTest(<V got={got} sent={sent} />, { width: 70, height: 14 });
  await t.settle();
  await t.mockInput.typeText('123456');
  expect(await t.settle()).toContain('[1][2][3][4][5][6]');
  const f = await enter();
  expect(sent).toEqual([]);
  expect(got.at(-1)).toBe('123456');
  expect(f).toContain('[1][2][3][4][5][6]');
  // The refusal put the focus on the empty name: fill it and press Enter there.
  await t.mockInput.typeText('ada');
  await t.settle();
  await enter();
  expect(sent).toEqual(['ada:123456']);
});
