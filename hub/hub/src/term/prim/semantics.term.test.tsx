import { expect, test } from 'bun:test';
import { useState, type ReactNode } from 'react';
import { drawTest } from './testing';
import { Box } from './Box';
import { Text } from './Text';
import { FocusRoot, useFocusable, isPressKey } from './focus';
import { act, focusedNode, getByRole, getByText, mergeRefs, queryByRole, semanticsOf, semText, useSem, within, type Sem } from './semantics';
import { SemOnly, semOfDom } from './semdom';

// Local stand-ins with the exact wiring requested of the prims, so the tree is tested
// independent of when that lands.
function Btn({ sem, disabled, onPress, children }: { sem?: Sem; disabled?: boolean; onPress?: () => void; children: ReactNode }) {
  const f = useFocusable({ disabled, onKey: (k) => { if (isPressKey(k)) { onPress?.(); return true; } return false; } });
  const ref = useSem(sem, { role: 'button', disabled, focus: f });
  // Decoration ([ ]) sits in its own hidden node, so the name is the label alone.
  return <Box dir="row" boxRef={mergeRefs(f.ref, ref) as never} onPress={disabled ? undefined : () => { f.focus(); onPress?.(); }}><Deco>[</Deco><Text inverse={f.focused}>{children}</Text><Deco>]</Deco></Box>;
}
function Deco({ children }: { children: string }) {
  const ref = useSem({ hidden: true }, {});
  return <Box boxRef={ref as never}><Text>{children}</Text></Box>;
}
function Field({ value, secret, label }: { value: string; secret?: boolean; label: string }) {
  const f = useFocusable({});
  const ref = useSem({ name: label }, { role: 'textbox', focus: f, value, secret });
  return <Box boxRef={mergeRefs(f.ref, ref) as never}><Text>{secret ? '•'.repeat(value.length) : value}</Text></Box>;
}
function Region({ sem, children }: { sem: Sem; children: ReactNode }) {
  const ref = useSem(sem, {});
  return <Box boxRef={ref as never}>{children}</Box>;
}

test('roles, names from content, states, secret redaction, text runs', async () => {
  let n = 0;
  const t = await drawTest(
    <FocusRoot>
      <Region sem={{ role: 'region', name: 'Schedules' }}>
        <Region sem={{ role: 'heading', level: 1 }}><Text>Schedules</Text></Region>
        <Text>3 schedules</Text>
        <Btn onPress={() => n++}>New schedule</Btn>
        <Btn disabled sem={{ disabledReason: 'Pick one first' }}>Delete</Btn>
        <Field label="Password" value="hunter2-secret" secret />
        <SemOnly sem={{ name: 'Online' }} />
      </Region>
    </FocusRoot>, { width: 40, height: 10 });
  const tree = semanticsOf(t.renderer);
  const text = semText(tree, { actions: true });
  expect(text).toBe([
    'region "Schedules"',
    '  heading[1] "Schedules"',
    '  text "3 schedules"',
    '  button "New schedule" {focus,press,click}',
    '  button "Delete" disabled (Pick one first)',
    '  textbox "Password" =<secret> {focus,type,setValue,clear}',
    '  text "Online"',
  ].join('\n'));
  expect(JSON.stringify(tree)).not.toContain('hunter2');
  expect(getByRole(tree, 'button', { name: 'Delete' }).states.disabled).toBe(true);
  expect(within(getByRole(tree, 'region')).length).toBe(6);
  // press goes through the real key path
  act(getByRole(tree, 'button', { name: 'New schedule' }), 'press');
  await t.settle();
  expect(n).toBe(1);
  expect(focusedNode(semanticsOf(t.renderer))?.name).toBe('New schedule');
  // click goes through the mouse path
  act(getByRole(semanticsOf(t.renderer), 'button', { name: 'New schedule' }), 'click');
  await t.settle();
  expect(n).toBe(2);
  // a disabled node refuses unless forced, and forced input is inert
  expect(() => act(getByRole(tree, 'button', { name: 'Delete' }), 'press')).toThrow(/disabled/);
  t.renderer.destroy();
});

test('ambiguous queries fail with the tree; refs disambiguate', async () => {
  const t = await drawTest(<FocusRoot><Btn>Open</Btn><Btn>Open</Btn></FocusRoot>, { width: 20, height: 4 });
  const tree = semanticsOf(t.renderer);
  expect(() => getByRole(tree, 'button', { name: 'Open' })).toThrow(/2 nodes .*expected one/s);
  expect(tree.map((x) => x.ref)).toEqual(['button "Open"', 'button "Open"~2']);
  expect(queryByRole(tree, 'link')).toBeNull();
  expect(() => getByText(tree, 'Open', true)).toThrow(/2 nodes/);
  t.renderer.destroy();
});

test('typing goes to the focused editor through the input stream', async () => {
  function Live() {
    const [v, setV] = useState('ab');
    const f = useFocusable({ onKey: (k) => { if (k.name === 'backspace') { setV((x) => x.slice(0, -1)); return true; } if (k.sequence && k.sequence.length === 1 && k.sequence >= ' ') { setV((x) => x + k.sequence); return true; } return false; } });
    const ref = useSem({ name: 'Name' }, { role: 'textbox', focus: f, value: v });
    return <Box boxRef={mergeRefs(f.ref, ref) as never}><Text>{v || ' '}</Text></Box>;
  }
  const t = await drawTest(<FocusRoot><Live /></FocusRoot>, { width: 20, height: 3 });
  act(getByRole(semanticsOf(t.renderer), 'textbox', { name: 'Name' }), 'setValue', 'xyz');
  await t.settle();
  expect(getByRole(semanticsOf(t.renderer), 'textbox').value).toBe('xyz');
  t.renderer.destroy();
});

test('semOfDom maps tags, aria and labels', () => {
  expect(semOfDom('button', { 'aria-label': 'Close', 'aria-expanded': 'false' })).toEqual({ role: 'button', name: 'Close', expanded: false });
  expect(semOfDom('input', { type: 'password', id: 'pw' })).toEqual({ role: 'textbox', id: 'pw', secret: true });
  expect(semOfDom('input', { type: 'checkbox', checked: true, disabled: true })).toEqual({ role: 'checkbox', checked: true, disabled: true });
  expect(semOfDom('h3', {})).toEqual({ role: 'heading', level: 3 });
  expect(semOfDom('img', { alt: 'Online' })).toEqual({ role: 'img', name: 'Online' });
  expect(semOfDom('label', { htmlFor: 'pw' })).toEqual({ labelFor: 'pw' });
  expect(semOfDom('div', { className: 'x' })).toBeUndefined();
  expect(semOfDom('section', {})).toBeUndefined();
  expect(semOfDom('section', { 'aria-label': 'Usage' })).toEqual({ role: 'region', name: 'Usage' });
  expect(semOfDom('span', { 'aria-hidden': 'true' })).toEqual({ hidden: true });
});

test('a <label for> names its control; describedBy adds a description', async () => {
  const t = await drawTest(
    <FocusRoot>
      <Region sem={{ labelFor: 'n' }}><Text>Server name</Text></Region>
      <Region sem={{ role: 'textbox', id: 'n', describedBy: 'h', value: 'web-1' }}><Text>web-1</Text></Region>
      <Region sem={{ id: 'h', role: 'note' }}><Text>Lower case only</Text></Region>
    </FocusRoot>, { width: 30, height: 5 });
  const tree = semanticsOf(t.renderer);
  const box = getByRole(tree, 'textbox', { name: 'Server name' });
  expect(box.value).toBe('web-1');
  expect(box.description).toBe('Lower case only');
  expect(semText(tree)).not.toContain('text "Server name"');
  t.renderer.destroy();
});

test('labelledBy / describedBy resolve a roleless element by id (a raw <span id>)', async () => {
  expect(semOfDom('span', { id: 'x' })).toEqual({ id: 'x' });
  const t = await drawTest(
    <FocusRoot>
      <Region sem={{ id: 'lbl' }}><Text>Email me</Text></Region>
      <Region sem={{ id: 'hint' }}><Text>Weekly at most</Text></Region>
      <Region sem={{ role: 'switch', labelledBy: 'lbl', describedBy: 'hint', checked: false }}><Text>[off]</Text></Region>
    </FocusRoot>, { width: 30, height: 5 });
  const tree = semanticsOf(t.renderer);
  const sw = getByRole(tree, 'switch', { name: 'Email me' });
  expect(sw.description).toBe('Weekly at most');
  t.renderer.destroy();
});
