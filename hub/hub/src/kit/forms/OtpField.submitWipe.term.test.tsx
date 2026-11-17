// OtpField in the terminal is wiped after its form submits, whatever sent the submit, as the web field is (it listens
// for the form's submit event): Enter in it, the form's Save or another submit button, the form's requestSubmit. A
// one-time code does not stay on screen once it went out. Wiped a task later, so the page reads it first. A submit the
// form's validation refused sends nothing and wipes nothing.
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { act, getAllByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { Button } from '../controls/Button';
import { TextField } from './fields';
import { Form, FormFooter, NumberField } from './more';
import { OtpField } from './OtpField';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

const tree = () => semanticsOf(t!.renderer as unknown as SemRoot);
/** The press, the submit, then the wipe's own task (a 0 ms timer) and a frame. */
async function after(fn: () => void): Promise<string> {
  fn();
  await t!.settle();
  await new Promise((r) => setTimeout(r, 30));
  return t!.settle();
}
async function typeCode(): Promise<void> {
  await t!.settle();
  await t!.mockInput.typeText('123456');
  expect(await t!.settle()).toContain('[1][2][3][4][5][6]');
}

let form: HTMLFormElement | null = null;
/** A kit Form: the code field and FormFooter's Save (on: the form is dirty). */
function K({ got, sent }: { got: string[]; sent: string[] }) {
  const [code, setCode] = useState('');
  return (
    <FocusRoot>
      <Form ref={(f) => { form = f; }} onSubmit={() => sent.push(code)}>
        <OtpField value={code} onChange={(x) => { got.push(x); setCode(x); }} autoFocus />
        <FormFooter dirty />
      </Form>
    </FocusRoot>
  );
}

// Catches the wipe running only from the field's own Enter: Save pressed sent the code and left it on screen.
test('kit Form: pressing Save submits the code, then the field is wiped', async () => {
  const got: string[] = [];
  const sent: string[] = [];
  t = await drawTest(<K got={got} sent={sent} />, { width: 70, height: 12 });
  await typeCode();
  const f = await after(() => act(getAllByRole(tree(), 'button', { name: 'Save' })[0]!, 'press'));
  expect(sent).toEqual(['123456']);
  expect(got.at(-1)).toBe('');
  expect(f).toContain('[_][_][_][_][_][_]');
});

// The same for the Form's own handle (a page's ref.requestSubmit()).
test("kit Form: the form's requestSubmit submits the code, then the field is wiped", async () => {
  const got: string[] = [];
  const sent: string[] = [];
  t = await drawTest(<K got={got} sent={sent} />, { width: 70, height: 12 });
  await typeCode();
  const f = await after(() => form!.requestSubmit());
  expect(sent).toEqual(['123456']);
  expect(got.at(-1)).toBe('');
  expect(f).toContain('[_][_][_][_][_][_]');
});

/** A raw form with the submit button outside it, naming it (the account code sheets' shape). */
function R({ got, sent }: { got: string[]; sent: string[] }) {
  const [code, setCode] = useState('');
  return (
    <FocusRoot>
      <Box dir="column">
        <form id="code-form" onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); sent.push(code); }}>
          <OtpField value={code} onChange={(x) => { got.push(x); setCode(x); }} autoFocus />
        </form>
        <Button type="submit" form="code-form">Turn off</Button>
      </Box>
    </FocusRoot>
  );
}

// Catches the same in a raw form: the button outside the form submitted it and the code stayed.
test('raw form: a submit button naming the form submits the code, then the field is wiped', async () => {
  const got: string[] = [];
  const sent: string[] = [];
  t = await drawTest(<R got={got} sent={sent} />, { width: 70, height: 12 });
  await typeCode();
  const f = await after(() => act(getAllByRole(tree(), 'button', { name: 'Turn off' })[0]!, 'press'));
  expect(sent).toEqual(['123456']);
  expect(got.at(-1)).toBe('');
  expect(f).toContain('[_][_][_][_][_][_]');
});

/** A page that makes a new form host on every render (an inline fieldErrors), a required field drawn after the number. */
function H({ got, sent }: { got: string[]; sent: string[] }) {
  const [minute, setMinute] = useState(5);
  const [name, setName] = useState('');
  const [code, setCode] = useState('123456');
  return (
    <FocusRoot>
      <Form onSubmit={() => sent.push(`${name}:${minute}:${code}`)} fieldErrors={{}}>
        <NumberField label="Minute" value={minute} minValue={0} maxValue={59} onChange={setMinute} autoFocus />
        <TextField label="Name" value={name} onChange={setName} isRequired />
        <OtpField value={code} onChange={(x) => { got.push(x); setCode(x); }} />
        <FormFooter dirty />
      </Form>
    </FocusRoot>
  );
}

// Catches a field's check missing from the form when NumberField's submit runs. The new host of that commit had every
// field re-register in a passive effect, and the name's came after the number's submit: the form submitted with the
// name empty, and the code was wiped.
test("a new host in the commit of NumberField's Enter: a required field after it still refuses the submit; the code stays", async () => {
  const got: string[] = [];
  const sent: string[] = [];
  t = await drawTest(<H got={got} sent={sent} />, { width: 70, height: 16 });
  await t.settle();
  t.mockInput.pressKey('u', { ctrl: true });
  await t.settle();
  await t.mockInput.typeText('42');
  await t.settle();
  const f = await after(() => t!.mockInput.pressEnter());
  expect(sent).toEqual([]);
  expect(got).toEqual([]);
  expect(f).toContain('[1][2][3][4][5][6]');
  // The refusal put the focus on the empty name: filled, Enter submits, then the code is wiped.
  await t.mockInput.typeText('ada');
  await t.settle();
  await after(() => t!.mockInput.pressEnter());
  expect(sent).toEqual(['ada:42:123456']);
  expect(got.at(-1)).toBe('');
});

let setSendOff: (off: boolean) => void = () => {};
/** A raw form: the number, the code, then the form's submit button, off at first. */
function RN({ got, sent }: { got: string[]; sent: string[] }) {
  const [minute, setMinute] = useState(5);
  const [code, setCode] = useState('123456');
  const [off, o] = useState(true);
  setSendOff = o;
  return (
    <FocusRoot>
      <form onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); sent.push(`${minute}:${code}`); }}>
        <NumberField label="Minute" value={minute} minValue={0} maxValue={59} onChange={setMinute} autoFocus />
        <OtpField value={code} onChange={(x) => { got.push(x); setCode(x); }} />
        <button type="submit" disabled={off}>Send</button>
      </form>
    </FocusRoot>
  );
}

// Catches the raw form's submit button missing when NumberField's submit runs: drawn again in that commit, it
// re-registered in a passive effect after the number's submit, so Enter found no default button, submitted past the
// off button, and the code was wiped.
test("raw form: NumberField's Enter in the commit that redraws the off submit button sends nothing; the code stays", async () => {
  const got: string[] = [];
  const sent: string[] = [];
  t = await drawTest(<RN got={got} sent={sent} />, { width: 70, height: 12 });
  await t.settle();
  t.mockInput.pressKey('u', { ctrl: true });
  await t.settle();
  await t.mockInput.typeText('42');
  await t.settle();
  let f = await after(() => t!.mockInput.pressEnter());
  expect(f).toContain('42');
  expect(sent).toEqual([]);
  expect(got).toEqual([]);
  expect(f).toContain('[1][2][3][4][5][6]');
  // The button on: the same Enter sends the number and the code, then the code is wiped.
  setSendOff(false);
  await t.settle();
  f = await after(() => t!.mockInput.pressEnter());
  expect(sent).toEqual(['42:123456']);
  expect(got.at(-1)).toBe('');
  expect(f).toContain('[_][_][_][_][_][_]');
});
