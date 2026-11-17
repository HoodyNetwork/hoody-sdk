// A wrapping kit Row takes its line gap from the same token as its column gap, on the row scale: fields in a
// `gap={3}` row that wrap keep one line between them (a field's label never sits right under the hint of the field
// above it); chips and buttons in a `gap={2}` row wrap onto the very next line.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, Text } from '@term/prim';
import { Row } from './Stack.term';

const draw = async (gap: 2 | 3): Promise<string[]> => {
  const t = await drawTest(
    <Box width={20} dir="column" shrink={0}>
      <Row gap={gap} wrap align="start">
        <Text shrink={0}>first-item-12</Text>
        <Text shrink={0}>second-item</Text>
      </Row>
    </Box>,
    { width: 30, height: 8 },
  );
  const f = (await t.settle()).split('\n').map((l) => l.trimEnd());
  t.renderer.destroy();
  return f;
};

test('a wrapping Row at sp-3 keeps one line between its wrapped lines', async () => {
  const f = await draw(3);
  expect(f.slice(0, 3)).toEqual(['first-item-12', '', 'second-item']);
});

test('a wrapping Row at sp-2 wraps onto the very next line', async () => {
  const f = await draw(2);
  expect(f.slice(0, 2)).toEqual(['first-item-12', 'second-item']);
});
