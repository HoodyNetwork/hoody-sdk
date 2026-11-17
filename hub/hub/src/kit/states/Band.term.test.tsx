// Band in the terminal (Band.term.tsx), narrow panes. Each case fails on the old drawing: one unwrapped
// row whose actions never shrank, so in a 46-column panel the mark was squeezed to nothing (the tone was gone) and the
// sentence stood one or two words to a line beside the buttons.
// The held case: a held band (kit HeldBand) drew its tone mark `!`, where the web marks it as the pending outcome.
// The Notice block case: a block notice drew no title and wrapped its body as one sentence.
import { expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { getByRole, semanticsOf } from '../../term/prim/semantics';
import { Button } from '../controls/Button';
import { Band, Notice } from './Band';
import { HeldBand } from './HeldBand';

async function draw(node: ReactNode, width: number, height = 12): Promise<string[]> {
  const t = await drawTest(<FocusRoot><Box width={width}>{node}</Box></FocusRoot>, { width, height });
  const frame = await t.settle();
  t.renderer.destroy();
  const rows = frame.split('\n').map((r) => r.trimEnd());
  while (rows.length && rows[rows.length - 1] === '') rows.pop();
  return rows;
}
const no = (): void => {};
const acts = <><Button size="sm" onPress={no}>Check again</Button><Button size="sm" onPress={no}>Stop tracking</Button></>;

test('a 46-column pane: the mark stays, the sentence keeps its measure and the actions go under it', async () => {
  const rows = await draw(<Band tone="warn" actions={acts} onDismiss={no}>The backup of atlas may have started.</Band>, 46);
  if (process.env.HUB_LOOK_PRINT) console.log(rows.join('\n'));
  expect(rows[0]).toBe('│ ! The backup of atlas may have started.');
  expect(rows.length).toBe(2);
  expect(rows[1]).toContain('Check again');
  expect(rows[1]).toContain('Stop tracking');
  expect(rows[1]).toContain('[Close]');
});

test('HeldBand in a 46-column pane shows its mark and its sentence in at most two lines', async () => {
  const rows = await draw(<HeldBand text="A change to the exit address may have gone through." readOnly={false} onCheck={no} onDismiss={no} overlayId="t.held" />, 46);
  if (process.env.HUB_LOOK_PRINT) console.log(rows.join('\n'));
  expect(rows[0]).toMatch(/^\S A change to the exit address may have gone/);
  expect(rows.join('\n')).toContain('Check again');
  expect(rows.length).toBeLessThanOrEqual(4);
});

test('actions wider than the pane wrap among themselves, none cut', async () => {
  const rows = await draw(<Band tone="danger" actions={acts}>Could not save.</Band>, 24);
  if (process.env.HUB_LOOK_PRINT) console.log(rows.join('\n'));
  expect(rows[0]).toBe('│ ✗ Could not save.');
  const rest = rows.slice(1).join('\n');
  expect(rest).toContain('Check again');
  expect(rest).toContain('Stop tracking');
});

test('with room, the band is one row as before: sentence, then the actions at the end', async () => {
  const rows = await draw(<Band tone="warn" actions={acts} onDismiss={no}>The backup of atlas may have started.</Band>, 100);
  if (process.env.HUB_LOOK_PRINT) console.log(rows.join('\n'));
  expect(rows.length).toBe(1);
  expect(rows[0]).toMatch(/^│ ! The backup of atlas may have started\. +\S.*Check again.*Stop tracking.*\[Close\]$/);
});

test('held: the band draws the pending mark in place of its tone mark, and HeldBand passes it', async () => {
  const words = 'A change to the exit address may have gone through.';
  expect((await draw(<Band tone="warn" size="table" held>{words}</Band>, 80))[0]).toBe(`◷ ${words}`);
  expect((await draw(<Band tone="warn" size="table">{words}</Band>, 80))[0]).toBe(`! ${words}`);
  const rows = await draw(<HeldBand text={words} readOnly={false} onCheck={no} onDismiss={no} overlayId="t.held" />, 100);
  expect(rows[0]).toStartWith(`◷ ${words}`);
}, 30_000);

test('Notice block: the title is a heading over the stacked body, the mark on its line, and the notice a group named by it', async () => {
  const t = await drawTest(
    <FocusRoot><Box width={60}><Notice level="warn" block title="Needs you"><Text>Add funds</Text><Text>Pick a plan</Text></Notice></Box></FocusRoot>,
    { width: 60, height: 6 },
  );
  const frame = await t.settle();
  const tree = semanticsOf({ root: (t.renderer as unknown as { root: never }).root });
  t.renderer.destroy();
  const rows = frame.split('\n').map((r) => r.trimEnd()).filter((r) => r !== '');
  expect(rows).toEqual(['! Needs you', '  Add funds', '  Pick a plan']);
  expect(getByRole(tree, 'group', { name: 'Needs you' })).toBeDefined();
  expect(getByRole(tree, 'heading', { name: 'Needs you' }).level).toBe(2);
}, 30_000);
