// PickCard in the terminal, standalone (PickCard.term.tsx: one Pressable; inside a CardGrid the grid owns the keys, see
// CardGrid.term.test.tsx). PickCard.scenario.ts holds its names and presses on both platforms; these hold the keys, the
// mouse and what the terminal draws:
//   - one Tab stop; the focused card's title carries ›; Enter, Space and a click press it once each
//   - a card that cannot be picked stays a Tab stop, does nothing on Enter, Space or a click, and its reason ends the
//     mono line in place of the "you were here" words
//   - "you were here" adds its words to the mono line (alone they make the line)
//   - the note shows two lines at most, and the mono line after it is still drawn
//   - the page's ref focuses the card
import { afterEach, expect, test } from 'bun:test';
import { useRef, type ReactNode } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';
import { Button } from '../controls/Button';
import { PickCard } from './PickCard';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

const draw = async (node: ReactNode, width = 70, height = 14): Promise<string> => {
  t = await drawTest(<FocusRoot><Box dir="column">{node}</Box></FocusRoot>, { width, height });
  return t.settle();
};
const step = async (fn: () => void): Promise<string> => { fn(); return t!.settle(); };
/** A click on the title's words (the row they are drawn on, two cells in). */
const clickTitle = async (frame: string): Promise<string> => {
  const rows = frame.split('\n');
  const y = rows.findIndex((l) => l.includes('Uptime Kuma'));
  expect(y).toBeGreaterThanOrEqual(0);
  await t!.mockMouse.click((rows[y] ?? '').indexOf('Uptime Kuma') + 2, y);
  return t!.settle();
};

// Catches the standalone press (line 50: Pressable onPress) and the › cursor of the focused card (line 24).
test('one Tab stop: › before the focused title; Enter and Space press it once each', async () => {
  let presses = 0;
  let f = await draw(
    <PickCard title="Uptime Kuma" end="Web page" line="Uptime monitor" note="Watch your sites" meta="louislam/uptime-kuma" onPress={() => { presses += 1; }} />,
  );
  for (const words of ['Uptime Kuma', 'Web page', 'Uptime monitor', 'Watch your sites', 'louislam/uptime-kuma']) expect(f).toContain(words);
  expect(f).not.toContain('› Uptime Kuma');
  f = await step(() => t!.mockInput.pressTab());
  expect(f).toContain('› Uptime Kuma');
  expect(focusedNode(semanticsOf(t!.renderer as never))?.name).toMatch(/^Uptime Kuma/);
  await step(() => t!.mockInput.pressEnter());
  expect(presses).toBe(1);
  await step(() => t!.mockInput.pressKey(' '));
  expect(presses).toBe(2);
});

// Catches the mouse press (Pressable's Box onPress: focus, then the press) on a card that does not have the focus.
test('a click on a card that does not have the focus focuses it and presses it once', async () => {
  let presses = 0;
  let f = await draw(<>
    <Button autoFocus onPress={() => undefined}>Before</Button>
    <PickCard title="Uptime Kuma" line="Uptime monitor" onPress={() => { presses += 1; }} />
  </>);
  expect(f).not.toContain('› Uptime Kuma');
  f = await clickTitle(f);
  expect(presses).toBe(1);
  expect(f).toContain('› Uptime Kuma');
});

// Catches the card that cannot be picked (line 50: `if (!isDisabled) onPress?.()`, still a Tab stop) and its reason on
// the mono line (line 19: the reason takes the place of `here`).
test('a card that cannot be picked: still a Tab stop (›); Enter, Space and a click do nothing; the reason ends the mono line', async () => {
  let presses = 0;
  let f = await draw(
    <PickCard title="Uptime Kuma" line="Uptime monitor" meta="louislam/uptime-kuma" here="You were here" isDisabled disabledReason="Start the computer first" onPress={() => { presses += 1; }} />,
  );
  expect(f).toContain('louislam/uptime-kuma · Start the computer first');
  expect(f).not.toContain('You were here');
  f = await step(() => t!.mockInput.pressTab());
  expect(f).toContain('› Uptime Kuma');
  await step(() => t!.mockInput.pressEnter());
  await step(() => t!.mockInput.pressKey(' '));
  await clickTitle(f);
  expect(presses).toBe(0);
  expect(focusedNode(semanticsOf(t!.renderer as never))?.name).toMatch(/^Uptime Kuma/);
});

// Catches the "you were here" words (line 19): the frame alone never says it.
test('"you were here" adds its words to the mono line; with no meta they make the line', async () => {
  let f = await draw(<PickCard title="Uptime Kuma" meta="louislam/uptime-kuma" here="You were here" onPress={() => undefined} />);
  expect(f).toContain('louislam/uptime-kuma · You were here');
  t!.renderer.destroy();
  f = await draw(<PickCard title="Uptime Kuma" here="You were here" onPress={() => undefined} />);
  expect(f).toContain('You were here');
  const line = f.split('\n').find((l) => l.includes('You were here')) ?? '';
  expect(line).not.toContain('Uptime Kuma');
  expect(line).not.toContain('·');
});

// Catches the note's two-line cap (line 28: maxHeight 2, clipped) with the mono line still drawn under it.
test('the note shows two lines at most; the mono line after it is drawn', async () => {
  const note = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa';
  const f = await draw(<PickCard title="Uptime Kuma" note={note} meta="louislam/uptime-kuma" onPress={() => undefined} />, 30, 14);
  // At 26 cells the note wraps "alpha … delta" / "echo … hotel" / "india … lima" / "mike … papa": the second line is
  // drawn, the third is not (a cap of three would show "india").
  expect(f).toContain('alpha');
  expect(f).toContain('echo');
  expect(f).not.toContain('india');
  expect(f).not.toContain('oscar');
  expect(f).not.toContain('papa');
  expect(f).toContain('louislam/uptime-kuma');
});

// Catches the page's ref (lines 44-46: focus() returns the focus to the standalone card).
test('the page\'s ref focuses the card', async () => {
  let focusIt: () => void = () => {};
  function Page() {
    const ref = useRef<HTMLButtonElement>(null);
    focusIt = () => ref.current?.focus();
    return <>
      <Button autoFocus onPress={() => undefined}>Before</Button>
      <PickCard ref={ref} title="Uptime Kuma" onPress={() => undefined} />
    </>;
  }
  let f = await draw(<Page />);
  expect(f).not.toContain('› Uptime Kuma');
  f = await step(() => focusIt());
  expect(f).toContain('› Uptime Kuma');
  expect(focusedNode(semanticsOf(t!.renderer as never))?.name).toMatch(/^Uptime Kuma/);
});
