// StepList in the terminal. The compat drawing cut a row's control to `[C…` at every width, drew no
// rule between a place and its link, and put the control at column 0 under the number. Each case here fails on it.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { focusedNode, getByRole, semanticsOf } from '../../term/prim/semantics';
import { setStyleTable } from '../../term/jsx/style';
import { installStyleTable } from '../../../scripts/term/style-table';
import { Button } from '../controls/Button';
import { CodeLine } from './Ids';
import { StepList, type StepListGroup } from './StepList';

// The class styles a page has, so the same test judges the compat drawing fairly when the sibling is taken away.
beforeAll(() => installStyleTable(120));
afterAll(() => setStyleTable(null));

async function draw(node: ReactNode, width: number, height = 16) {
  const t = await drawTest(<FocusRoot><OverlayHost><Box dir="column" width={width}>{node}</Box></OverlayHost></FocusRoot>, { width, height });
  const rows = (await t.settle()).split('\n').map((r) => r.trimEnd());
  return { t, rows };
}

const groups = (onCheck: () => void = () => {}): StepListGroup[] => [
  { where: 'In Telegram', open: { label: 'Open @BotFather', url: 'https://t.me/BotFather' }, items: [
    { text: <>Send <CodeLine value="/setprivacy" /> to @BotFather</>, note: 'Your bot then reads every message in groups' },
    { text: 'Choose your bot, then press Disable' },
  ] },
  { where: 'Back here', items: [
    { text: 'Remove the bot from the group and add it again' },
    { text: 'Check that the bot reads the group', act: <Button onPress={onCheck}>Check now</Button> },
  ] },
];

test('80 columns: a row\'s control is whole, at the end of its own row', async () => {
  const { t, rows } = await draw(<StepList label="How to turn privacy off" groups={groups()} />, 80);
  const row = rows.find((r) => r.includes('Check that the bot reads the group'));
  expect(row).toBeDefined();
  expect(row!.startsWith('04  Check that the bot reads the group')).toBe(true);
  expect(row!.endsWith('[Check now]')).toBe(true);
  expect(rows.join('\n')).not.toContain('…');
  t.renderer.destroy();
}, 30_000);

test('a place is caps, a rule runs from it to its link, and places are a blank row apart', async () => {
  const { t, rows } = await draw(<StepList label="How to turn privacy off" groups={groups()} />, 80);
  expect(rows[0]).toMatch(/^IN TELEGRAM ─{20,} Open @BotFather/);
  const back = rows.findIndex((r) => r.startsWith('BACK HERE '));
  expect(rows[back]).toMatch(/^BACK HERE ─{60,}$/);
  expect(rows[back - 1]).toBe('');
  // numbers run on across places; a note sits under its action, in the text's column
  expect(rows[1]).toMatch(/^01 {2}Send .*\/setprivacy.* to @BotFather$/);
  expect(rows[2]).toBe('    Your bot then reads every message in groups');
  expect(rows[back + 1]!.startsWith('03  Remove the bot')).toBe(true);
  t.renderer.destroy();
}, 30_000);

test('under 75 columns the control drops under its text, in the text\'s column, still whole', async () => {
  const { t, rows } = await draw(<StepList label="How to turn privacy off" groups={groups()} />, 50);
  const at = rows.findIndex((r) => r.startsWith('04  Check that the bot reads the group'));
  expect(at).toBeGreaterThan(0);
  expect(rows[at]).toBe('04  Check that the bot reads the group');
  expect(rows[at + 1]).toBe('    [Check now]');
  t.renderer.destroy();
}, 30_000);

test('Tab order is the drawn order (the code line, then the control) and Enter presses the control', async () => {
  let pressed = 0;
  const { t } = await draw(<StepList label="How to turn privacy off" groups={groups(() => { pressed += 1; })} />, 80);
  const seen: string[] = [];
  for (let i = 0; i < 6; i++) {
    t.mockInput.pressTab();
    await t.settle();
    const f = focusedNode(semanticsOf(t.renderer));
    if (!f) continue;
    seen.push(`${f.role}:${f.name ?? ''}`);
    if (f.role === 'button' && f.name === 'Check now') break;
  }
  expect(seen[0]).toBe('button:Copy this line'); // the place's link is a terminal hyperlink (kit ExtLink), not a Tab stop
  expect(seen[seen.length - 1]).toBe('button:Check now');
  t.mockInput.pressEnter();
  await t.settle();
  expect(pressed).toBe(1);
  const tree = semanticsOf(t.renderer);
  expect(getByRole(tree, 'group', { name: 'How to turn privacy off' })).toBeDefined();
  expect(getByRole(tree, 'list', { name: 'Back here' })).toBeDefined();
  t.renderer.destroy();
}, 30_000);

test('a sentence holding a control wraps at a word, never leaving the words after the control alone on a row', async () => {
  const g: StepListGroup[] = [{ items: [{ text: 'Add your bot to the group', note: <>Its name is <CodeLine value="@atlas_support_bot" />. In the group’s info, choose Add members.</> }] }];
  const { t, rows } = await draw(<StepList label="Steps" groups={g} />, 50);
  expect(rows[1]).toMatch(/^ {4}Its name is .*@atlas_support_bot.*\. In the$/);
  expect(rows[2]).toBe('    group’s info, choose Add members.');
  t.renderer.destroy();
}, 30_000);
