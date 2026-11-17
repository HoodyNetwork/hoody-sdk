// Disclosure.term: the web component's observable behaviours, each held here.
// - closed by default: "▸ Title  description"; the body is not rendered (nothing in it takes the focus)
// - Enter and Space toggle; open reads "▾ Title" and shows the body below
// - uncontrolled (defaultExpanded) keeps its own state and reports onExpandedChange(next)
// - controlled (isExpanded) shows what the caller says; a toggle only asks (onExpandedChange), the caller decides
// - triggerRef.focus() puts the focus on the header (a FAQ landing)
import { expect, test } from 'bun:test';
import { useRef, useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot, Text } from '../../term/prim';
import { Disclosure } from './Disclosure';
import { Button } from './Button';

test('closed by default: ▸, description, no body; Enter opens (▾, body), Space closes', async () => {
  const got: boolean[] = [];
  const pressed: string[] = [];
  const t = await drawTest(
    <FocusRoot>
      <Disclosure title="More options" description="Model and schedule" onExpandedChange={(o) => got.push(o)}>
        <Button onPress={() => pressed.push('inner')}>Inner</Button>
      </Disclosure>
    </FocusRoot>,
    { width: 60, height: 6 },
  );
  let f = t.captureCharFrame();
  expect(f).toContain('▸ More options  Model and schedule');
  expect(f).not.toContain('Inner');
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(f).toContain('▾ More options');
  expect(f).toContain('[Inner]');
  // The body is in the Tab order once open.
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  await t.settle();
  expect(pressed).toEqual(['inner']);
  t.mockInput.pressTab({ shift: true });
  t.mockInput.pressKey(' ');
  f = await t.settle();
  expect(f).toContain('▸ More options');
  expect(got).toEqual([true, false]);
  t.renderer.destroy();
});

test('defaultExpanded starts open', async () => {
  const t = await drawTest(<FocusRoot><Disclosure title="Details" defaultExpanded><Text>inside</Text></Disclosure></FocusRoot>, { width: 40, height: 4 });
  const f = t.captureCharFrame();
  expect(f).toContain('▾ Details');
  expect(f).toContain('inside');
  t.renderer.destroy();
});

test('controlled: the caller decides; triggerRef focuses the header', async () => {
  const asks: boolean[] = [];
  let focusIt: () => void = () => {};
  function P() {
    const [open, setOpen] = useState(false);
    const [allow, setAllow] = useState(false);
    const ref = useRef<HTMLButtonElement>(null);
    focusIt = () => ref.current?.focus();
    return (
      <FocusRoot>
        <Button onPress={() => setAllow(true)} autoFocus>Allow</Button>
        <Disclosure title="Held" isExpanded={open} triggerRef={ref} onExpandedChange={(o) => { asks.push(o); if (allow) setOpen(o); }}>
          <Text>held body</Text>
        </Disclosure>
      </FocusRoot>
    );
  }
  const t = await drawTest(<P />, { width: 40, height: 5 });
  focusIt();
  await t.settle();
  t.mockInput.pressEnter();
  let f = await t.settle();
  expect(asks).toEqual([true]);
  expect(f).not.toContain('held body');
  t.mockInput.pressTab({ shift: true });
  t.mockInput.pressEnter();
  await t.settle();
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(asks).toEqual([true, true]);
  expect(f).toContain('held body');
  t.renderer.destroy();
});
