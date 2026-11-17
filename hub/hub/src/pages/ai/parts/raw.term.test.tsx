// raw.tsx in the terminal: a list draws one bullet line per point, a group is named by its label, and a code leaf and a
// bidi text draw their words. A code leaf keeps to one line; a block is the padded cell of a card strip.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../../term/prim/testing';
import { Box } from '../../../term/prim';
import { getAllByRole, semanticsOf, type SemRoot } from '../../../term/prim/semantics';
import { Bidi, Block, CodeLeaf, FormBlock, GroupBox, Point, Points } from './raw';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

test('points are bullet lines; a group carries its label; leaves draw their text', async () => {
  t = await drawTest(
    <Block>
      <Points><Point>Bots use it</Point><Point>Helpers keep theirs</Point></Points>
      <GroupBox label="Model"><CodeLeaf>openai/gpt-5</CodeLeaf></GroupBox>
      <FormBlock><Bidi>water the plants</Bidi></FormBlock>
    </Block>, { width: 60, height: 12 });
  const f = await t.settle();
  expect(f).toContain('• Bots use it');
  expect(f).toContain('• Helpers keep theirs');
  expect(f).toContain('openai/gpt-5');
  expect(f).toContain('water the plants');
  expect(getAllByRole(semanticsOf(t.renderer as unknown as SemRoot), 'group', { name: 'Model' })).toHaveLength(1);
});

test('a code leaf that does not fit is cut on its one line; a block pads its cell', async () => {
  t = await drawTest(<Box dir="column" width={16}><Block><CodeLeaf>openrouter/some-long-model-id</CodeLeaf></Block></Box>, { width: 40, height: 6 });
  const rows = (await t.settle()).split('\n');
  // Padding: one empty row above, two columns before; the id ends in one ellipsis inside the 12 columns left.
  expect(rows[0]!.trim()).toBe('');
  expect(rows[1]!.trimEnd()).toBe('  openrouter/…');
  expect(rows[2]!.trim()).toBe('');
});
