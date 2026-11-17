// A wrapping row's `gap` is the space between items along the line, not between wrapped lines: a row of actions that
// wraps at a narrow width keeps its lines together (a `gap={2}` row used to leave two blank rows between them, as in a
// code row whose action wrapped under its link). `gapY` still sets a gap between wrapped lines when one is wanted.
import { expect, test } from 'bun:test';
import { drawTest } from './testing';
import { Box, FocusRoot, Text } from './index';

const draw = async (props: { gap?: number; gapY?: number; dir?: 'row' | 'column'; wrap?: boolean }): Promise<string[]> => {
  const t = await drawTest(
    <FocusRoot>
      <Box width={20} dir={props.dir ?? 'row'} wrap={props.wrap ?? true} {...(props.gap !== undefined ? { gap: props.gap } : {})} {...(props.gapY !== undefined ? { gapY: props.gapY } : {})} shrink={0}>
        <Text shrink={0}>first-item-12</Text>
        <Text shrink={0}>second-item</Text>
      </Box>
    </FocusRoot>,
    { width: 30, height: 8 },
  );
  const f = (await t.settle()).split('\n').map((l) => l.trimEnd());
  t.renderer.destroy();
  return f;
};

test('a wrapping row with gap 2 puts its second line right under the first', async () => {
  const f = await draw({ gap: 2 });
  expect(f[0]).toBe('first-item-12');
  expect(f[1]).toBe('second-item');
});

test('the same on one line keeps gap 2 between the items', async () => {
  const t = await drawTest(
    <FocusRoot><Box width={28} dir="row" wrap gap={2} shrink={0}><Text shrink={0}>abc</Text><Text shrink={0}>def</Text></Box></FocusRoot>,
    { width: 30, height: 3 },
  );
  expect((await t.settle()).split('\n')[0]!.trimEnd()).toBe('abc  def');
  t.renderer.destroy();
});

test('gapY still sets a gap between wrapped lines', async () => {
  const f = await draw({ gap: 2, gapY: 1 });
  expect(f[0]).toBe('first-item-12');
  expect(f[1]).toBe('');
  expect(f[2]).toBe('second-item');
});

test('a column keeps gap between its items', async () => {
  const f = await draw({ gap: 1, dir: 'column', wrap: false });
  expect(f[0]).toBe('first-item-12');
  expect(f[1]).toBe('');
  expect(f[2]).toBe('second-item');
});
