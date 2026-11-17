// Compose: the chat editor's key rule (Enter sends, Alt+Enter / Ctrl+J add a line), keys typed in the same tick as a
// focus move are kept (never written over by the controlled value), and a paste is offered whole first.
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from './testing';
import { Box, FocusRoot, useKeys } from './index';
import { Compose, type ComposeHandle } from './Compose';

function harness(o: { onPaste?: (t: string) => boolean } = {}) {
  const log = { changes: [] as string[], submits: [] as string[] };
  let handle: ComposeHandle | null = null;
  let value = '';
  function H() {
    const [v, setV] = useState('');
    value = v;
    return (
      <Box width={40} height={6}>
        <Compose value={v} onChange={(x) => { log.changes.push(x); setV(x); }} onSubmit={() => log.submits.push(value)} onPaste={o.onPaste} handle={(h) => { handle = h; }} />
      </Box>
    );
  }
  return { log, el: <FocusRoot><H /></FocusRoot>, handle: () => handle!, value: () => value };
}

test('keys right after a focus move are kept', async () => {
  const h = harness();
  const t = await drawTest(h.el, { width: 40, height: 6 });
  await t.settle();
  h.handle().focus();
  t.mockInput.pressKey('h');
  t.mockInput.pressKey('i');
  await t.settle();
  expect(h.value()).toBe('hi');
  t.renderer.destroy();
});

test('Enter submits; Alt+Enter and Ctrl+J add a line', async () => {
  const h = harness();
  const t = await drawTest(h.el, { width: 40, height: 6 });
  await t.settle();
  h.handle().focus();
  await t.settle();
  await t.mockInput.typeText('a');
  t.mockInput.pressEnter({ meta: true });
  await t.mockInput.typeText('b');
  t.mockInput.pressKey('j', { ctrl: true });
  await t.mockInput.typeText('c');
  await t.settle();
  expect(h.value()).toBe('a\nb\nc');
  expect(h.log.submits).toEqual([]);
  t.mockInput.pressEnter();
  await t.settle();
  expect(h.log.submits).toEqual(['a\nb\nc']);
  t.renderer.destroy();
});

test('a paste is offered whole; taken means not inserted', async () => {
  const pastes: string[] = [];
  const h = harness({ onPaste: (x) => { pastes.push(x); return x.length > 5; } });
  const t = await drawTest(h.el, { width: 40, height: 6 });
  await t.settle();
  h.handle().focus();
  await t.settle();
  await t.mockInput.pasteBracketedText('short');
  await t.mockInput.pasteBracketedText('a much longer paste');
  await t.settle();
  expect(pastes).toEqual(['short', 'a much longer paste']);
  expect(h.value()).toBe('short');
  t.renderer.destroy();
});

test('Home and End pass to the host on an empty editor, and stay the editor\'s once it holds text', async () => {
  const seen: string[] = [];
  function H() {
    const [v, setV] = useState('');
    useKeys((k) => { if (k.name === 'end' || k.name === 'home') { seen.push(k.name); return true; } return false; });
    return <Box width={40} height={6}><Compose value={v} onChange={setV} onSubmit={() => {}} autoFocus sem={{ name: 'm' }} /></Box>;
  }
  const t = await drawTest(<FocusRoot><H /></FocusRoot>, { width: 40, height: 6 });
  await t.settle();
  t.mockInput.pressKey('\x1b[F' as never);
  await t.settle();
  expect(seen).toEqual(['end']);
  await t.mockInput.typeText('abc');
  await t.settle();
  t.mockInput.pressKey('\x1b[H' as never);
  await t.settle();
  expect(seen).toEqual(['end']);
  t.renderer.destroy();
});
