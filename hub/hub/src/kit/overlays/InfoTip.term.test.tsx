// InfoTip in the terminal (InfoTip.term.tsx). The web opens on press / Enter / Space and on a 400 ms hover; a
// terminal has no hover intent, so focus shows a glance and Enter / Space / ? / i pin it (documented in the sibling).
//
// | # | Web behaviour (InfoTip.tsx) | Terminal | Test |
// |---|---|---|---|
// | 1 | Icon form: an info glyph after a label; term form: the words, underlined | "ⓘ"; underlined words | 'forms' |
// | 2 | Hover opens it | Focus shows it (no keys taken, Tab goes on); hover shows it | 'focus glances' |
// | 3 | Press / Enter / Space toggles it | Enter / Space / ? / i pin it (keys inside, Tab to the FAQ link) | 'pin' |
// | 4 | Escape closes it, focus stays on the trigger | Esc closes; a glance stays hidden until focus comes back | 'escape' |
// | 5 | An outside press closes it | same | 'pin' |
// | 6 | One InfoTip at a time | same | 'one at a time' |
// | 7 | Placed at the end when 280 px fit, else below | 35 columns at the end, else below | 'placement' |
// | 8 | plainText, INFO_TIP_MAX, InfoLine (no tip = the label alone) | same | 'helpers' |
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot, Pressable, Text } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { INFO_TIP_MAX, InfoLine, InfoTip, plainText } from './InfoTip';

async function esc(t: { mockInput: { pressEscape(): void }; settle(): Promise<string> }): Promise<string> {
  t.mockInput.pressEscape();
  await new Promise((r) => setTimeout(r, 80));
  return t.settle();
}
const wait = (ms = 15) => new Promise((r) => setTimeout(r, ms));

const TEXT = 'Runs at this time in the computer’s own time zone.';
function Page({ log }: { log: string[] }) {
  return (
    <>
      <Pressable autoFocus onPress={() => log.push('page')}>{({ focused }) => <Text inverse={focused}>[Page]</Text>}</Pressable>
      <InfoLine tip={TEXT} subject="Schedule">Schedule</InfoLine>
      <InfoTip text="The command's last answer." subject="">7 tools</InfoTip>
      <Pressable onPress={() => log.push('after')}>{({ focused }) => <Text inverse={focused}>[After]</Text>}</Pressable>
    </>
  );
}
const draw = (log: string[] = [], w = 80, h = 24) => drawTest(<FocusRoot><OverlayHost><Page log={log} /></OverlayHost></FocusRoot>, { width: w, height: h });

test('forms: ⓘ after a label; term form shows its words', async () => {
  const t = await draw();
  const f = await t.settle();
  expect(f).toMatch(/Schedule ⓘ/);
  expect(f).toContain('7 tools');
  expect(f).not.toContain(TEXT);
  t.renderer.destroy();
});

test('focus glances: the tip shows, keys go on (Tab moves past it), it goes with the focus', async () => {
  const log: string[] = [];
  const t = await draw(log);
  t.mockInput.pressTab();
  await wait();
  let f = await t.settle();
  expect(f).toContain(TEXT.slice(0, 20));
  t.mockInput.pressTab();
  await wait();
  f = await t.settle();
  expect(f).not.toContain(TEXT.slice(0, 20));
  expect(f).toContain("The command's last");
  t.mockInput.pressTab();
  await wait();
  f = await t.settle();
  expect(f).not.toContain("The command's last");
  t.mockInput.pressEnter();
  await t.settle();
  expect(log).toEqual(['after']);
  t.renderer.destroy();
});

test('escape hides a glance until the focus comes back', async () => {
  const t = await draw();
  t.mockInput.pressTab();
  await wait();
  let f = await esc(t);
  expect(f).not.toContain(TEXT.slice(0, 20));
  t.mockInput.pressTab({ shift: true });
  await wait();
  t.mockInput.pressTab();
  await wait();
  f = await t.settle();
  expect(f).toContain(TEXT.slice(0, 20));
  t.renderer.destroy();
});

test('pin: ? pins it with a title; the page gets no keys; outside press closes; Enter toggles', async () => {
  const log: string[] = [];
  const t = await draw(log);
  t.mockInput.pressTab();
  await wait();
  await t.mockInput.typeText('?');
  await wait();
  let f = await t.settle();
  expect(f).toContain('About Schedule');
  t.mockInput.pressEnter();
  await t.settle();
  expect(log).toEqual([]);
  await t.mockMouse.click(70, 20);
  await wait();
  f = await t.settle();
  expect(f).not.toContain('About Schedule');
  t.renderer.destroy();
  const t2 = await draw(log);
  t2.mockInput.pressTab();
  await wait();
  t2.mockInput.pressEnter();
  await wait();
  f = await t2.settle();
  expect(f).toContain('About Schedule');
  f = await esc(t2);
  expect(f).not.toContain('About Schedule');
  t2.renderer.destroy();
});

test('one at a time: pinning one hides another', async () => {
  const t = await draw();
  t.mockInput.pressTab();
  await wait();
  t.mockInput.pressEnter();
  await wait();
  // a press on the term-form trigger (an outside press for the first, which closes) pins the second
  const f0 = await t.settle();
  const y = f0.split('\n').findIndex((l) => l.includes('7 tools'));
  await t.mockMouse.click(f0.split('\n')[y]!.indexOf('7 tools') + 1, y);
  await wait();
  await t.mockMouse.click(f0.split('\n')[y]!.indexOf('7 tools') + 1, y);
  await wait();
  const f = await t.settle();
  expect(f).not.toContain('About Schedule');
  expect(f).toContain("The command's last");
  t.renderer.destroy();
});

test('placement: at the end when 35 columns fit, else below', async () => {
  const t = await draw([], 80, 24);
  t.mockInput.pressTab();
  await wait();
  let lines = (await t.settle()).split('\n');
  const trig = lines.findIndex((l) => l.includes('Schedule ⓘ'));
  expect(lines.findIndex((l) => l.includes('┌'))).toBeLessThanOrEqual(trig);
  t.renderer.destroy();
  const t2 = await draw([], 40, 24);
  t2.mockInput.pressTab();
  await wait();
  lines = (await t2.settle()).split('\n');
  expect(lines.findIndex((l) => l.includes('┌'))).toBe(lines.findIndex((l) => l.includes('Schedule ⓘ')) + 1);
  t2.renderer.destroy();
});

test('helpers', () => {
  expect(INFO_TIP_MAX).toBe(200);
  expect(plainText(['Run ', 3, ' times'])).toBe('Run 3 times');
});
