// The Tab order of stops inside a scroll that follows focus, with stops under the scroll (a drawer's body and its
// Cancel / Save). The order is by drawn row; a stop scrolled out of the body is laid out past the body's edge, on the
// rows of whatever stands under it, so by its own row it came after those (New program at 80x24: Name, Command, Cancel,
// Add program, then "Run as"). A hidden stop now takes its scroll's edge row (focus.ts orderY).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | No stop hidden: body stops in order, then the stops under the body. Unchanged: passes on the base file too | 'nothing hidden: unchanged' |
// | 2 | Stops below the fold come after the visible ones, in their own order, before the stops under the body | 'hidden below' |
// | 3 | Shift+Tab walks the same list backwards, hidden or not | 'backwards' |
// | 4 | After Tab scrolled the body down, the stops now above the fold still come first, in their own order | 'hidden above' |
// | 5 | Two stops on one row keep left-to-right order, and a row under the body keeps its own | 'same row' |
import { expect, test } from 'bun:test';
import { drawTest } from './testing';
import { Box } from './Box';
import { Text } from './Text';
import { Scroll } from './Scroll';
import { FocusRoot, useFocusable } from './focus';
import { focusedNode, mergeRefs, semanticsOf, useSem } from './semantics';

/** `tall`: two rows (a field with its description). With the blank row between fields, the next hidden one is laid out
 *  below the row that stands under the body, as a real form's is. */
function Stop({ name, tall = false }: { name: string; tall?: boolean }) {
  const f = useFocusable({});
  const ref = useSem({ name }, { role: 'button', focus: f });
  return <Box dir="column" shrink={0} height={tall ? 2 : 1} boxRef={mergeRefs(f.ref, ref) as never}><Text inverse={f.focused}>{name}</Text></Box>;
}
const names = (n: number): string[] => Array.from({ length: n }, (_, i) => `field ${i + 1}`);
/** A body of `n` two-row stops, a blank row between them, in a scroll `rows` high that follows focus, then Cancel and Save on one row under it. */
function Form({ n, rows }: { n: number; rows: number }) {
  return (
    <FocusRoot>
      <Box dir="column">
        <Scroll followFocus height={rows} gap={1}>{names(n).map((x) => <Stop key={x} name={x} tall />)}</Scroll>
        <Box dir="row" gap={2} shrink={0}><Stop name="Cancel" /><Stop name="Save" /></Box>
      </Box>
    </FocusRoot>
  );
}
type T = Awaited<ReturnType<typeof drawTest>>;
const focused = (t: T): string => { const r = t.renderer as unknown as { root: never; stdin: never }; return focusedNode(semanticsOf({ root: r.root, stdin: r.stdin }))?.name ?? ''; };
/** One full round: the name after each press, until the first name comes round again. */
async function round(t: T, back = false): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < 60; i++) {
    if (back) t.mockInput.pressTab({ shift: true }); else t.mockInput.pressTab();
    await t.settle();
    const f = focused(t);
    if (seen[0] === f) break;
    seen.push(f);
  }
  return seen;
}

test('nothing hidden: unchanged', async () => {
  const t = await drawTest(<Form n={4} rows={11} />, { width: 40, height: 16 });
  await t.settle();
  expect(await round(t)).toEqual([...names(4), 'Cancel', 'Save']);
  t.renderer.destroy();
});

test('hidden below', async () => {
  const t = await drawTest(<Form n={9} rows={5} />, { width: 40, height: 16 });
  await t.settle();
  expect(await round(t)).toEqual([...names(9), 'Cancel', 'Save']);
  t.renderer.destroy();
});

test('backwards', async () => {
  for (const [n, rows] of [[4, 11], [9, 5]] as const) {
    const t = await drawTest(<Form n={n} rows={rows} />, { width: 40, height: 16 });
    await t.settle();
    const fwd = await round(t);
    // the round ends on the first stop; from there backwards is the same ring the other way
    expect(focused(t)).toBe(fwd[0]!);
    expect(await round(t, true)).toEqual([...fwd].reverse());
    t.renderer.destroy();
  }
});

test('hidden above', async () => {
  const t = await drawTest(<Form n={9} rows={5} />, { width: 40, height: 16 });
  await t.settle();
  // walk to the last field: the body has scrolled, fields 1..7 are above the fold
  for (let i = 0; i < 9; i++) { t.mockInput.pressTab(); await t.settle(); }
  expect(focused(t)).toBe('field 9');
  const frame = await t.settle();
  expect(frame).not.toContain('field 1 ');
  expect(await round(t)).toEqual(['Cancel', 'Save', ...names(9)]);
  t.renderer.destroy();
});

test('same row', async () => {
  const t = await drawTest(<Form n={2} rows={5} />, { width: 40, height: 16 });
  await t.settle();
  const r = await round(t);
  expect(r.indexOf('Save')).toBe(r.indexOf('Cancel') + 1);
  t.renderer.destroy();
});
