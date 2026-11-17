// The computers detail header's line under the name: " · " between items, never at the start or end of a line, and the
// line starts at its box (the web's ::before lead + clip trick drew no dot here and started two cells early).
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../../term/prim/testing';
import { Box, Text } from '../../../term/prim';
import { HeadItem, HeadLine } from './HeadLine';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const draw = async (w: number): Promise<string[]> => {
  t = await drawTest(
    <Box dir="column" width={w}>
      <HeadLine>
        <HeadItem><Text>SG n12 · Singapore</Text></HeadItem>
        {null}
        <HeadItem>Home base</HeadItem>
        <HeadItem>Current computer<Text>[i]</Text></HeadItem>
      </HeadLine>
    </Box>, { width: 80, height: 6 });
  await t.settle();
  return (await t.settle()).split('\n').map((l) => l.trimEnd()).filter((l) => l !== '');
};

test('one line: a dot between items, the line starts at column 0', async () => {
  const lines = await draw(70);
  expect(lines).toEqual(['SG n12 · Singapore · Home base · Current computer [i]']);
});

test('wrapped: no line starts or ends with the dot', async () => {
  const lines = await draw(34);
  expect(lines).toEqual(['SG n12 · Singapore · Home base', 'Current computer [i]']);
  const narrow = await (async () => { t?.renderer.destroy(); t = null; return draw(20); })();
  expect(narrow).toEqual(['SG n12 · Singapore', 'Home base', 'Current computer [i]']);
});
