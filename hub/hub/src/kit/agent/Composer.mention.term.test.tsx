// Composer.term: the "@" file menu by keys. The web's MentionMenu.test.tsx covers the pure rules of mention.ts and the
// web menu. Composer.term.tsx draws its own menu (InlineMenu) and places the caret itself, and no terminal test had typed
// an "@" before this file. Picking a folder goes one level down and keeps the menu open. Picking a file writes its path
// with a space and closes the menu, and the caret lands after the path even when text follows it. Enter picks and never
// sends while the menu lists something. Esc closes the menu and keeps the draft. "@../" reads nothing.
import { afterEach, expect, test } from 'bun:test';
import { useCallback, useRef, useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { queryAllByRole, semanticsOf } from '../../term/prim/semantics';
import { Composer } from './Composer';
import type { ComposerMention, MentionEntry } from './mention';
import strings from './Conversation.strings.en.json';

const d = (name: string): MentionEntry => ({ name, dir: true });
const f = (name: string): MentionEntry => ({ name, dir: false });
const TREE: Record<string, MentionEntry[]> = {
  '': [d('src'), d('my docs'), f('README.md'), f('.env'), d('.git'), f('notes.txt')],
  'src/': [d('kit'), f('main.ts'), f('mail.ts')],
};

interface Log { sent: string[]; drafts: string[]; asked: Array<string | null> }
let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

function Host({ log }: { log: Log }) {
  const [draft, setDraft] = useState('');
  const [dir, setDir] = useState<string | null>(null);
  const want = useCallback((x: string | null) => { log.asked.push(x); setDir(x); }, [log]);
  const mention: ComposerMention = { entries: dir !== null ? (TREE[dir] ?? []) : [], dir, want };
  const ref = useRef<HTMLTextAreaElement | null>(null);
  return (
    <Box dir="column" width={80} height={24} justify="end">
      <Composer
        draft={draft} setDraft={(v) => { log.drafts.push(v); setDraft(v); }} inputRef={ref} placeholder="Message your agent" max={8000}
        canSend={draft.trim() !== ''} onSend={() => { log.sent.push(draft); setDraft(''); }}
        notes={[]} attachments={[]} onRemoveAttachment={() => {}} flash={false} onTyping={() => {}} mention={mention}
      />
    </Box>
  );
}
async function draw(): Promise<Log> {
  const log: Log = { sent: [], drafts: [], asked: [] };
  t = await drawTest(<FocusRoot><Host log={log} /></FocusRoot>, { width: 80, height: 24 });
  await t.settle();
  t.mockInput.pressTab(); // to the box (first Tab stop)
  await t.settle();
  return log;
}
const tree = () => semanticsOf(t!.renderer as never);
const menuOpen = () => queryAllByRole(tree(), 'listbox', { name: strings['agent.mentionList'] }).length === 1;
const options = () => queryAllByRole(tree(), 'option').map((o) => o.name);
const active = () => queryAllByRole(tree(), 'option', { selected: true }).map((o) => o.name);

// Line numbers refer to Composer.term.tsx as this test was written. Catches Enter picking while the menu lists
// something (line 299), ↓ (lines 295-297), the picks (pickMention, lines 182-195: a folder keeps the menu open, a file
// closes it with one space, and the word after the caret stays), and the caret placed after the pick (lines 197-202).
// The "@" is typed in the middle of a draft, so a caret left anywhere else (at the end, or where the "@" was) writes the
// next words in the wrong place.
test('"@" mid-draft: folders first, no dotfiles; Enter goes into a folder, then writes the file; typing goes on after the path', async () => {
  const log = await draw();
  await t!.mockInput.typeText('read  now');
  await t!.settle();
  for (let i = 0; i < 4; i++) t!.mockInput.pressArrow('left'); // between the two spaces
  await t!.settle();
  await t!.mockInput.typeText('@');
  await t!.settle();
  expect(log.drafts.at(-1)).toBe('read @ now');
  expect(menuOpen()).toBe(true);
  expect(options()).toEqual(['src/', 'my docs/', 'README.md', 'notes.txt']);
  expect(active()).toEqual(['src/']);
  t!.mockInput.pressEnter();
  await t!.settle();
  expect(log.drafts.at(-1)).toBe('read @src/ now');
  expect(menuOpen()).toBe(true);
  expect(options()).toEqual(['kit/', 'main.ts', 'mail.ts']);
  t!.mockInput.pressArrow('down');
  await t!.settle();
  expect(active()).toEqual(['main.ts']);
  t!.mockInput.pressEnter();
  await t!.settle();
  expect(log.drafts.at(-1)).toBe('read @src/main.ts now');
  expect(menuOpen()).toBe(false);
  expect(log.sent).toEqual([]);
  await t!.mockInput.typeText('right ');
  await t!.settle();
  expect(log.drafts.at(-1)).toBe('read @src/main.ts right now');
  t!.mockInput.pressEnter();
  await t!.settle();
  expect(log.sent).toEqual(['read @src/main.ts right now']);
});

// Catches Esc on the open menu (line 294, `setMentionShut`): the menu closes, the draft stays, and the next Enter sends
// the draft as typed instead of picking.
test('Esc closes the menu and keeps the draft; Enter then sends it as typed', async () => {
  const log = await draw();
  await t!.mockInput.typeText('@READ');
  await t!.settle();
  expect(options()).toEqual(['README.md']);
  t!.mockInput.pressEscape();
  await t!.settle();
  expect(menuOpen()).toBe(false);
  expect(log.drafts.at(-1)).toBe('@READ');
  t!.mockInput.pressEnter();
  await t!.settle();
  expect(log.sent).toEqual(['@READ']);
});

// Catches the guard before any read (lines 166-170: a token that may leave the chat's folder asks the host for
// nothing) and the note shown for it (line 176).
test('"@../" says only files in this folder, lists nothing and asks the host to read nothing out of it', async () => {
  const log = await draw();
  await t!.mockInput.typeText('@../');
  const fr = await t!.settle();
  expect(fr).toContain(strings['agent.mentionOutside']);
  expect(options()).toEqual([]);
  expect(log.asked.filter((x) => x !== null && x.includes('..'))).toEqual([]);
});
