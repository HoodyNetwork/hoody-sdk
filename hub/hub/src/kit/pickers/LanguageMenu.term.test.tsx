// The language list in a terminal: the menu's own button opens it (the terminal menu hands its trigger the opener as
// a press, which must reach the kit Button), every language is listed, a coming-soon one does nothing, Escape closes.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, Pressable, Text } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { LanguageMenu } from './LanguageMenu';

let term: TestTerm | null = null;
afterEach(() => { term?.renderer.destroy(); term = null; });

test('its own button opens the list; a coming-soon language is not chosen; Escape closes it', async () => {
  const picked: string[] = [];
  term = await drawTest(
    <FocusRoot><OverlayHost>
      <Pressable autoFocus onPress={() => {}}>{() => <Text>[Page]</Text>}</Pressable>
      <LanguageMenu available={['en']} current="en" onChange={(c) => picked.push(c)} />
    </OverlayHost></FocusRoot>,
    { width: 80, height: 24 },
  );
  let f = await term.settle();
  expect(f).toContain('English');
  expect(f).not.toContain('Deutsch');
  term.mockInput.pressTab();
  await term.settle();
  term.mockInput.pressEnter();
  f = await term.settle();
  expect(f).toContain('Deutsch');
  expect(f.replace(/[│█▀\s]+/g, ' ')).toContain('More languages are coming soon.');
  term.mockInput.pressArrow('down');
  await term.settle();
  term.mockInput.pressEnter();
  f = await term.settle();
  // Still open, nothing chosen.
  expect(f).toContain('Deutsch');
  expect(picked).toEqual([]);
  term.mockInput.pressEscape();
  f = await term.settle();
  expect(f).not.toContain('Deutsch');
  expect(f).toContain('English');
}, 60_000);
