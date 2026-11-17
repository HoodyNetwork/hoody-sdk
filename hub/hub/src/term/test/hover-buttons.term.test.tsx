// Hover on buttons (kit Button through SoftPress): a button a press would act on stands on the `hover` ground under the
// pointer, its words unchanged. A solid button keeps its own fill. A button that is off, soft off (it only shows its
// reason) or busy takes none: hover says "a press here does something".
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../prim/testing';
import { Box, FocusRoot } from '../prim';
import { __resetHover } from '../prim/Hover';
import { TRUECOLOR } from '../prim/tokens';
import { Button } from '../../kit/controls/Button';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; __resetHover(); });

const dark = TRUECOLOR.dark;
const hex = (c: { toInts(): number[] }): string => '#' + c.toInts().slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
function bgAt(x: number, y: number): string {
  let c = 0;
  for (const sp of t!.captureSpans().lines[y]!.spans) {
    const w = (sp as { width?: number }).width ?? [...sp.text].length;
    if (x < c + w) return hex(sp.bg);
    c += w;
  }
  throw new Error(`no cell at ${x},${y}`);
}
/** Moves the pointer onto a word; says what its first letter stands on before and after. The text must not change. */
async function over(word: string): Promise<{ rest: string; hover: string }> {
  const frame = await t!.settle();
  const lines = frame.split('\n');
  const y = lines.findIndex((l) => l.includes(word));
  expect(y, frame).toBeGreaterThanOrEqual(0);
  const x = lines[y]!.indexOf(word);
  const rest = bgAt(x, y);
  await t!.mockMouse.moveTo(x + 1, y);
  expect(await t!.settle()).toBe(frame);
  return { rest, hover: bgAt(x, y) };
}

test('a button stands on the hover ground under the pointer; a solid one keeps its fill; off, soft off and busy take none', async () => {
  t = await drawTest(
    <FocusRoot><Box dir="column">
      <Button onPress={() => {}}>Rename</Button>
      <Button variant="primary" onPress={() => {}}>Create</Button>
      <Button isDisabled onPress={() => {}}>Archive</Button>
      <Button isDisabled disabledReason="Stop the computer first." onPress={() => {}}>Delete</Button>
      <Button busy onPress={() => {}}>Saving</Button>
    </Box></FocusRoot>,
    { width: 40, height: 8 },
  );
  const plain = await over('Rename');
  expect(plain.hover).toBe(dark.hover);
  expect(plain.rest).not.toBe(dark.hover);
  const solid = await over('Create');
  expect(solid.rest).toBe(dark.acc);
  expect(solid.hover).toBe(dark.acc);
  for (const word of ['Archive', 'Delete', 'Saving']) {
    const b = await over(word);
    expect(b.hover, word).toBe(b.rest);
  }
  // One at a time: the first button gave its ground back.
  const again = await t.settle();
  const y = again.split('\n').findIndex((l) => l.includes('Rename'));
  expect(bgAt(again.split('\n')[y]!.indexOf('Rename'), y)).toBe(plain.rest);
});

test('the focused button keeps its focus plate under the pointer', async () => {
  t = await drawTest(<FocusRoot><Button onPress={() => {}}>Rename</Button></FocusRoot>, { width: 40, height: 3 });
  t.mockInput.pressTab();
  const b = await over('Rename');
  expect(b.rest).toBe(dark.focus);
  expect(b.hover).toBe(dark.focus);
});
