// SrOnly inside a text run. A text button draws its children inside one Text, and an Ask trail's button holds a step
// mark followed by SrOnly (the mark's outcome in words: ask/Column.tsx Mark). SrOnly's carrier is a box, and a box is
// no child of a text run: inside one, SrOnly draws nothing and adds nothing, and the button still mounts and draws.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { semText, semanticsOf } from '../../term/prim/semantics';
import { TextButton } from '../controls/Link';
import { Spinner } from '../states/States';
import { Icon } from '../icons';
import { SrOnly } from './Display';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const tree = (): string => semText(semanticsOf(t!.renderer as never));

/** The Ask trail's button, as ask/Column.tsx Trail writes it: a label, then the mark with its outcome for a reader. */
const trail = (label: string, running: boolean, said: string) => (
  <TextButton literal icon="chevron-right" onPress={() => {}}>
    <span>{label}</span>
    <span>{running ? <Spinner /> : <Icon name="check" size="sm" />}<SrOnly>{said}</SrOnly></span>
  </TextButton>
);

for (const [width, height] of [[80, 24], [120, 40]] as const) {
  test(`a trail button with a done step and one with a running step mount and draw at ${width}x${height}`, async () => {
    t = await drawTest(
      <FocusRoot><Box dir="column">{trail('3 steps', false, 'Done')}{trail('Reading notes.txt', true, 'Running')}</Box></FocusRoot>,
      { width, height },
    );
    const frame = await t.settle();
    expect(frame).toContain('3 steps');
    expect(frame).toContain('Reading notes.txt');
  });
}

test('inside a Text SrOnly is nothing; beside one its words stay in the semantics tree', async () => {
  t = await drawTest(<Box dir="row" gapX={1}><Text>one<SrOnly>in a run</SrOnly></Text><SrOnly>heard only</SrOnly><Text>two</Text></Box>, { width: 30, height: 3 });
  expect(await t.settle()).toContain('one two');
  expect(tree()).toContain('heard only');
});
