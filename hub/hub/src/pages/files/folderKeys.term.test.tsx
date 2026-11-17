import { afterEach, expect, test } from 'bun:test';
import { useRef } from 'react';
import { pageShortcutSnapshot, runPageShortcut } from '../../shell/pageShortcuts.pure';
import { Text } from '../../term/prim';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { useFolderKeys } from './folderKeys';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

test('Backspace and Alt+Up go up a folder and Shift+N makes one, through the page shortcut store (no element listener)', async () => {
  const calls: string[] = [];
  function Pane() {
    const box = useRef(null);
    const up = useRef(() => { calls.push('up'); });
    const mk = useRef(() => { calls.push('new'); });
    useFolderKeys(box, up, mk);
    return <Text>pane</Text>;
  }
  t = await drawTest(<Pane />, { width: 10, height: 1 });
  await t.settle();
  const keys = pageShortcutSnapshot().map((s) => `${(s.mods ?? []).join('+')}${s.mods?.length ? '+' : ''}${s.key}:${s.label}`);
  expect(keys).toEqual(['Backspace:Up one folder', 'alt+ArrowUp:Up one folder', 'N:New folder']);
  runPageShortcut('Backspace');
  runPageShortcut('alt+ArrowUp');
  runPageShortcut('N');
  expect(calls).toEqual(['up', 'up', 'new']);
});
