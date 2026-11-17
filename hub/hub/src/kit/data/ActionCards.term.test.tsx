// ActionCards in the terminal (ActionCards.term.tsx; no terminal test or scenario before). One block per card, a blank
// line apart: the title (a heading one level below its section), the muted line under it, then the card's actions in one
// row, each its own Tab stop, in the cards' order.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { getByRole, semanticsOf } from '../../term/prim/semantics';
import { Button } from '../controls/Button';
import { ActionCards } from './ActionCards';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const lines = (f: string) => f.split('\n');
const rowOf = (f: string, s: string) => lines(f).findIndex((l) => l.includes(s));

// Catches the card's block (lines 63-69: title, line, then actions, in that order), the blank line between cards
// (line 61, gap 1), the heading node (line 66) and each action as its own stop.
test('title, its line, its actions; a blank line between cards; Tab goes through the actions in card order', async () => {
  const log: string[] = [];
  t = await drawTest(
    <FocusRoot>
      <ActionCards label="Next steps" cards={[
        { id: 'a', title: 'Add a computer', body: 'A new computer in this project.', actions: <><Button size="sm" onPress={() => log.push('add')}>Add</Button><Button size="sm" onPress={() => log.push('import')}>Import</Button></> },
        { id: 'b', title: 'Invite a person', body: 'They get their own sign-in.', actions: <Button size="sm" onPress={() => log.push('invite')}>Invite</Button> },
      ]} />
    </FocusRoot>,
    { width: 60, height: 12 },
  );
  const f = await t.settle();
  const a = rowOf(f, 'Add a computer');
  expect(rowOf(f, 'A new computer in this project.')).toBe(a + 1);
  expect(rowOf(f, '[Add]')).toBe(a + 2);
  expect(lines(f)[a + 2]).toContain('[Import]');
  expect(lines(f)[a + 3]!.trim()).toBe('');
  expect(rowOf(f, 'Invite a person')).toBe(a + 4);
  expect(rowOf(f, '[Invite]')).toBe(a + 6);
  const tree = semanticsOf(t.renderer as never);
  // getByRole throws unless exactly one node matches. One level below the context (none here: 2, as Notice's title).
  expect(getByRole(tree, 'heading', { name: 'Invite a person' }).level).toBe(2);
  getByRole(tree, 'list', { name: 'Next steps' });
  for (let i = 0; i < 3; i++) {
    t.mockInput.pressTab();
    await t.settle();
    t.mockInput.pressEnter();
    await t.settle();
  }
  expect(log).toEqual(['add', 'import', 'invite']);
});
