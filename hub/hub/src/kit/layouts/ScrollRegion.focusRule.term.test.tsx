// An unframed ScrollRegion draws one rule at its start edge. Its focus was that rule's colour and nothing else, so with
// colour off (the mono tier) Tab landed on the region with no mark on screen. While it has the focus the rule is the
// heavy one (┃), as a field's control row is; at rest it is the light one (│). A framed region is unchanged: it
// names itself on its frame while focused.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, Text, setColourTier } from '../../term/prim';
import { Button } from '../controls/Button';
import { ScrollRegion } from './ScrollRegion';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; setColourTier('truecolor'); });

const rows = Array.from({ length: 12 }, (_, i) => <Text key={i}>{`row ${i}`}</Text>);
const draw = async (framed: boolean): Promise<string> => {
  t = await drawTest(
    <FocusRoot>
      <Box dir="column" grow={1}>
        <ScrollRegion label="Plans" framed={framed}>{rows}</ScrollRegion>
        <Button onPress={() => undefined}>After</Button>
      </Box>
    </FocusRoot>,
    { width: 30, height: 8 },
  );
  return t.settle();
};
const tab = async (): Promise<string> => { t!.mockInput.pressTab(); return t!.settle(); };
/** The first cell of the line that shows `text`. */
const edge = (frame: string, text: string): string => [...(frame.split('\n').find((l) => l.includes(text)) ?? '')][0] ?? '';

for (const tier of ['mono', 'truecolor'] as const) {
  test(`${tier}: the unframed region's rule is heavy while it has the focus and light when it does not`, async () => {
    setColourTier(tier);
    let f = await draw(false);
    expect({ at: 'rest', edge: edge(f, 'row 0') }).toEqual({ at: 'rest', edge: '│' });
    f = await tab(); // the region
    expect({ at: 'focused', edge: edge(f, 'row 0') }).toEqual({ at: 'focused', edge: '┃' });
    expect(f).not.toContain('│');
    f = await tab(); // the button after it
    expect({ at: 'left', edge: edge(f, 'row 0') }).toEqual({ at: 'left', edge: '│' });
    expect(f).not.toContain('┃');
  });
}

test('a framed region keeps its light frame and shows its name while focused', async () => {
  setColourTier('mono');
  let f = await draw(true);
  expect(f).not.toContain('Plans');
  f = await tab();
  expect(f).toContain(' Plans ');
  expect(f).not.toContain('┃');
});
