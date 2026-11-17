// Track in the terminal. The compat drawing put the open step's number alone on a row above its
// card, cut the primary button ("Check" for "Check again") at 80 columns, drew no frame round the one open step, and
// gave `wait`, `unknown` and a warning no mark of their own. Each case here fails on it.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { focusedNode, getByRole, queryByRole, semanticsOf } from '../../term/prim/semantics';
import { setStyleTable } from '../../term/jsx/style';
import { installStyleTable } from '../../../scripts/term/style-table';
import { Button } from '../controls/Button';
import { Tag } from './Display';
import { StepList } from './StepList';
import { Track, TrackStep } from './Track';

// The class styles a page has, so the same test judges the compat drawing fairly when the sibling is taken away.
beforeAll(() => installStyleTable(120));
afterAll(() => setStyleTable(null));

async function draw(node: ReactNode, width: number, height = 30) {
  const t = await drawTest(<FocusRoot><OverlayHost><Box dir="column" width={width}>{node}</Box></OverlayHost></FocusRoot>, { width, height });
  const rows = async () => (await t.settle()).split('\n').map((r) => r.trimEnd());
  return { t, rows };
}

const track = (onOpen?: (id: string) => void, onCheck: () => void = () => {}) => (
  <Track label="Get it working" {...(onOpen ? { onOpen } : {})}>
    <TrackStep id="connect" state="done" name="Connect Telegram" result="T Main" why="It reads the token." />
    <TrackStep id="privacy" state="now" tone="warn" optional name="Let it read groups" why="Telegram hides group messages from bots until privacy is turned off."
      tags={<Tag tone="warn">Privacy on</Tag>}
      foot={{ say: 'Done in Telegram? This step closes once the Hub sees it.', primary: <Button variant="primary" onPress={onCheck}>Check again</Button>, secondary: <Button variant="ghost">Not now</Button> }}>
      <StepList label="How" groups={[{ where: 'In Telegram', items: [{ text: 'Send the command to @BotFather' }] }]} />
    </TrackStep>
    <TrackStep id="home" state="later" optional name="Pick a home chat" why="Where it posts on its own." />
    <TrackStep id="reach" state="unknown" name="Reach it from outside" />
    <TrackStep id="answer" state="wait" name="Get its first answer" />
  </Track>
);

test('80 columns: the open step is one framed card beside its mark, and its foot holds both buttons whole', async () => {
  const { t, rows } = await draw(track(), 80);
  const f = await rows();
  const top = f.findIndex((r) => r.includes('┌'));
  expect(f[top]).toMatch(/^ ! {2}┌─+┐$/); // the warning's mark in the spine (where the number sits), then the card on the same row
  expect(f[top + 1]).toMatch(/^ {4}│ Let it read groups .*Optional .*Privacy on .*│$/);
  const foot = f.findIndex((r) => r.includes('Done in Telegram?'));
  expect(f[foot - 1]).toMatch(/^ {4}│ ─+ │$/); // a rule above the foot
  const footRows = f.slice(foot, f.findIndex((r) => r.includes('└'))).join('\n');
  expect(footRows).toContain('Not now');
  expect(footRows).toContain('Check again');
  expect(f.filter((r) => r.includes('┌')).length).toBe(1); // exactly one frame
  t.renderer.destroy();
}, 30_000);

test('every closed state has its own mark or word, without colour', async () => {
  const { t, rows } = await draw(track(), 80);
  const f = await rows();
  const row = (name: string) => f.find((r) => r.includes(name))!;
  expect(row('Connect Telegram')).toMatch(/^ ✓ {2}Connect Telegram +T Main$/);
  expect(row('Pick a home chat')).toMatch(/^ 3 {2}Pick a home chat +Optional$/);
  expect(row('Reach it from outside')).toMatch(/^ ░ {2}Reach it from outside +Can't tell$/);
  expect(row('Get its first answer')).toMatch(/^ 5 {2}Get its first answer +Waiting$/);
  // every tail ends at the same right edge
  expect(new Set(['Connect Telegram', 'Pick a home chat', 'Reach it from outside', 'Get its first answer'].map((n) => row(n).length)).size).toBe(1);
  t.renderer.destroy();
}, 30_000);

test('Enter on a closed row opens it, closes the other, and the focus is on the opened step\'s heading', async () => {
  const opened: string[] = [];
  const { t, rows } = await draw(track((id) => opened.push(id)), 80);
  // first Tab stop: the done row (it has a why, so it can open)
  t.mockInput.pressTab();
  await t.settle();
  const on = focusedNode(semanticsOf(t.renderer));
  expect(on?.role).toBe('button');
  expect(on?.name).toBe('Connect Telegram · Done');
  t.mockInput.pressEnter();
  const f = await rows();
  expect(opened).toEqual(['connect']);
  expect(f.join('\n')).toContain('It reads the token.');
  expect(f.join('\n')).not.toContain('Telegram hides group messages');
  expect(f.filter((r) => r.includes('┌')).length).toBe(1);
  const tree = semanticsOf(t.renderer);
  expect(getByRole(tree, 'region', { name: 'Connect Telegram · Done' })).toBeDefined();
  expect(queryByRole(tree, 'region', { name: 'Let it read groups · Needs you' })).toBeNull();
  const now = focusedNode(tree);
  expect(`${now?.role}:${now?.name}`).toBe('heading:Connect Telegram · Done');
  t.renderer.destroy();
}, 30_000);

test('under 75 columns the open step takes the full width: no mark, tags above the name, the foot stacked', async () => {
  const { t, rows } = await draw(track(), 50);
  const f = await rows();
  const top = f.findIndex((r) => r.includes('┌'));
  expect(f[top]).toMatch(/^┌─{48}┐$/);
  expect(f[top + 1]).toMatch(/Optional .*Privacy on/);
  expect(f[top + 2]).toMatch(/^│ Let it read groups +│$/);
  const say = f.findIndex((r) => r.includes('Done in Telegram?'));
  const buttons = f.findIndex((r) => r.includes('Check again'));
  expect(buttons).toBeGreaterThan(say);
  expect(f[buttons]).toContain('Not now');
  t.renderer.destroy();
}, 30_000);

test('flat: every step shows its body; only the open one is framed; no row is a button', async () => {
  const { t, rows } = await draw(
    <Track label="New script" flat defaultOpen="run">
      <TrackStep id="what" state="done" name="What it does" why="It backs up /data." />
      <TrackStep id="run" state="now" name="Run it once" why="A first run shows whether it works." foot={{ say: 'Runs on atlas now.', primary: <Button variant="primary">Run now</Button> }} />
    </Track>, 80);
  const f = await rows();
  expect(f[0]).toMatch(/^ ✓ {2}What it does$/);
  expect(f[1]).toBe('    It backs up /data.');
  expect(f.filter((r) => r.includes('┌')).length).toBe(1);
  expect(f.find((r) => r.includes('Run it once'))).toMatch(/│ Run it once +│$/);
  expect(queryByRole(semanticsOf(t.renderer), 'button', { name: 'What it does · Done' })).toBeNull();
  t.renderer.destroy();
}, 30_000);

test('on a wide screen the why and the foot\'s sentence keep a reading width of 64 cells', async () => {
  const long = 'Telegram hides group messages from bots until privacy is turned off, so the bot sees nothing that people write in a group until you change that one setting in the chat app.';
  const { t, rows } = await draw(
    <Track label="Get it working">
      <TrackStep id="privacy" state="now" name="Let it read groups" why={long} foot={{ say: long, primary: <Button variant="primary">Check again</Button> }} />
    </Track>, 200, 20);
  const f = await rows();
  const text = f.filter((r) => /Telegram hides|privacy is turned|chat app\./.test(r));
  expect(text.length).toBeGreaterThanOrEqual(4); // both sentences wrapped (2 rows at full width)
  // 5 cells of spine and gap, the frame and its pad, then at most 64 cells of words
  for (const r of f.filter((x) => x.includes('│') && !x.includes('Check again') && !x.includes('─'))) expect(r.replace(/[│ ]+$/, '').length).toBeLessThanOrEqual(5 + 2 + 64);
  expect(f.find((r) => r.includes('Check again'))).toMatch(/Check again\s*│$/); // the primary stays at the card's end
  t.renderer.destroy();
}, 30_000);

// HUB_FX_OUT=<dir>: also write the track's frames there (for a look; no assertion).
test.skipIf(!process.env.HUB_FX_OUT)('frames for a look', async () => {
  for (const [w, h] of [[80, 24], [120, 40], [200, 50], [240, 67]] as const) {
    const { t } = await draw(track(), w, h);
    await Bun.write(`${process.env.HUB_FX_OUT}/track.${w}.txt`, await t.settle());
    t.renderer.destroy();
  }
}, 60_000);
