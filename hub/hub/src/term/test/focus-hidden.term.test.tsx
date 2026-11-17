// Hidden-ancestor focus guard (prim/focus.ts). Web behaviours this file holds the terminal to:
// | # | Web behaviour | Test |
// | 1 | An element inside a display: none / visibility: hidden subtree is not focusable: autoFocus does nothing there and the next autoFocus on screen takes the focus (/ai: a hidden New-chat composer never holds the focus at start) | 'autoFocus under a hidden ancestor never takes the focus' |
// | 2 | Tab skips controls under a hidden ancestor | 'Tab skips a hidden subtree' |
// | 3 | Programmatic focus() on such a control does nothing | 'focus() on a hidden control does nothing' |
// | 4 | A container laid out at zero width or height hides what is inside it the same way | 'a collapsed container counts as hidden' |
// | 6 | A control revealed by a state change can be focused at once (focus() / focusInto right after the reveal, before the next layout) | 'just revealed: focusFirst finds it before layout' |
// | 5 | The focused control's ancestor becoming hidden takes the focus from it; it goes to the nearest visible control in reading order | 'hidden while focused: the focus moves to the nearest visible one' |
import { expect, test } from 'bun:test';
import { useEffect, useState } from 'react';
import { drawTest } from '../prim/testing';
import { Box, FocusRoot, Pressable, Text, TextInput, useFocusControl, type FocusControl } from '../prim';
import type { Focusable } from '../prim/focus';
import type { BoxRenderable } from '../prim/otui';

function Btn({ label, log, auto }: { label: string; log: string[]; auto?: boolean }) {
  return <Pressable autoFocus={auto} onPress={() => log.push(label)}><Text>[{label}]</Text></Pressable>;
}

test('autoFocus under a hidden ancestor never takes the focus', async () => {
  const log: string[] = [];
  let typed = '';
  // The /ai shape: a New-chat composer kept mounted but hidden, and the chat list that should hold the first focus.
  const t = await drawTest(<FocusRoot>
    <Box hidden><TextInput value="" onChange={(v) => { typed = v; }} autoFocus /></Box>
    <Btn label="Chat list" log={log} auto />
  </FocusRoot>, { width: 30, height: 4 });
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(log).toEqual(['Chat list']);
  expect(typed).toBe('');
  t.renderer.destroy();
});

test('Tab skips a hidden subtree', async () => {
  const log: string[] = [];
  const t = await drawTest(<FocusRoot>
    <Btn label="A" log={log} />
    <Box hidden><Btn label="Hidden" log={log} /></Box>
    <Btn label="B" log={log} />
  </FocusRoot>, { width: 30, height: 5 });
  await t.settle();
  for (let i = 0; i < 4; i++) { t.mockInput.pressTab(); await t.settle(); t.mockInput.pressEnter(); await t.settle(); }
  expect(log).toEqual(['A', 'B', 'A', 'B']);
  t.renderer.destroy();
});

test('focus() on a hidden control does nothing', async () => {
  const log: string[] = [];
  let ctl!: FocusControl;
  const handle: { current: Focusable | null } = { current: null };
  function Hidden() {
    ctl = useFocusControl();
    return <Pressable handle={handle} onPress={() => log.push('Hidden')}><Text>[Hidden]</Text></Pressable>;
  }
  const t = await drawTest(<FocusRoot>
    <Btn label="A" log={log} auto />
    <Box hidden><Hidden /></Box>
  </FocusRoot>, { width: 30, height: 4 });
  await t.settle();
  const before = ctl.current();
  expect(handle.current).not.toBeNull();
  handle.current!.focus();
  await t.settle();
  expect(ctl.current()).toBe(before);
  t.mockInput.pressEnter();
  await t.settle();
  expect(log).toEqual(['A']);
  t.renderer.destroy();
});

test('a collapsed container counts as hidden', async () => {
  const log: string[] = [];
  const t = await drawTest(<FocusRoot>
    <Btn label="A" log={log} />
    <Box height={0} clip><Btn label="Collapsed" log={log} /></Box>
    <Btn label="B" log={log} />
  </FocusRoot>, { width: 30, height: 5 });
  await t.settle();
  for (let i = 0; i < 3; i++) { t.mockInput.pressTab(); await t.settle(); t.mockInput.pressEnter(); await t.settle(); }
  expect(log).toEqual(['A', 'B', 'A']);
  t.renderer.destroy();
});

test('hidden while focused: the focus moves to the nearest visible one', async () => {
  const log: string[] = [];
  let hide: (b: boolean) => void = () => {};
  function App() {
    const [h, set] = useState(false);
    hide = set;
    return <FocusRoot>
      <Btn label="Top" log={log} />
      <Box hidden={h}><Btn label="Middle" log={log} /></Box>
      <Btn label="Below" log={log} />
    </FocusRoot>;
  }
  const t = await drawTest(<App />, { width: 30, height: 5 });
  await t.settle();
  t.mockInput.pressTab(); await t.settle();
  t.mockInput.pressTab(); await t.settle();
  t.mockInput.pressEnter(); await t.settle();
  expect(log).toEqual(['Middle']);
  hide(true);
  await t.settle();
  await t.settle();
  t.mockInput.pressEnter(); await t.settle();
  // Nearest in reading order: the first visible control at or after where it was.
  expect(log).toEqual(['Middle', 'Below']);
  t.renderer.destroy();
});

test('just revealed: focusFirst finds it before layout', async () => {
  const log: string[] = [];
  let ctl!: FocusControl;
  let reveal: () => void = () => {};
  const box: { current: BoxRenderable | null } = { current: null };
  function App() {
    const [open, set] = useState(false);
    ctl = useFocusControl();
    reveal = () => set(true);
    // As a reveal does it: once committed, one focusFirst on the next tick (before the engine lays the new rows out).
    useEffect(() => { if (open) { const id = setTimeout(() => ctl.focusFirst(box.current), 0); return () => clearTimeout(id); } }, [open]);
    // The reveal slot exists before it opens (an empty box, laid out 0 rows tall last frame), as SettingRow's is.
    return <>
      <Box boxRef={box} dir="column">{open && <Box dir="column" border pad={{ left: 1, right: 1 }}><Text>Editor</Text><Box dir="row" gap={1}><TextInput value="" onChange={() => {}} /><Btn label="Revealed" log={log} /></Box></Box>}</Box>
      <Btn label="After" log={log} />
    </>;
  }
  const t = await drawTest(<FocusRoot><App /></FocusRoot>, { width: 30, height: 4 });
  await t.settle();
  reveal();
  // No frame between the reveal and the focus request: React commits, the effect's setTimeout(0) runs focusFirst while
  // the new boxes have never been laid out (hidden, and focused nothing).
  await new Promise((r) => setTimeout(r, 30));
  await t.settle();
  // The editor's field took the focus: typing reaches it, Tab then Enter presses the button beside it.
  expect(ctl.current()).not.toBeNull();
  t.mockInput.pressTab(); await t.settle();
  t.mockInput.pressEnter(); await t.settle();
  expect(log).toEqual(['Revealed']);
  t.renderer.destroy();
});
