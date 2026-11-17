// SubSection in the terminal is a region named by its heading, as the web's <section aria-labelledby>: an agent or a
// scenario can address "the By model section" on both sides. A heading with no region around it would not be addressable.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../../term/prim';
import { semanticsOf, semText } from '../../../term/prim/semantics';
import { SubSection } from './Section';

let term: TestTerm | null = null;
afterEach(() => { term?.renderer.destroy(); term = null; });

test('a SubSection is a region named by its title, holding its heading and body', async () => {
  term = await drawTest(<FocusRoot><Box dir="column" width={60}><SubSection title="By model"><Text>rows</Text></SubSection><SubSection title="By turn"><Text>turns</Text></SubSection></Box></FocusRoot>, { width: 60, height: 12 });
  await term.settle();
  const tree = semText(semanticsOf(term.renderer as never));
  expect(tree).toMatch(/region "By model"[^\n]*\n\s+heading\[\d\] "By model"/);
  expect(tree).toMatch(/region "By turn"/);
  // The drawing is unchanged: the title row, then the body.
  const rows = term.captureCharFrame().split('\n').map((l) => l.trimEnd()).filter((l) => l !== '');
  expect(rows).toEqual(['By model', 'rows', 'By turn', 'turns']);
}, 60_000);
