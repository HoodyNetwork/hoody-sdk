// TextButton in the terminal is named by its aria-label when it has one, as on the web: one of several "Stop" buttons
// is "Stop npm run dev" to an agent or a scenario. Its words alone would not tell them apart.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { semanticsOf, semText } from '../../term/prim/semantics';
import { TextButton } from './Link';

let term: TestTerm | null = null;
afterEach(() => { term?.renderer.destroy(); term = null; });

test('aria-label names the button; without one its words do; the drawing is the words either way', async () => {
  term = await drawTest(<FocusRoot><Box dir="column" width={40}><TextButton aria-label="Stop npm run dev">Stop</TextButton><TextButton>Check again</TextButton></Box></FocusRoot>, { width: 40, height: 6 });
  await term.settle();
  const tree = semText(semanticsOf(term.renderer as never));
  expect(tree).toContain('button "Stop npm run dev"');
  expect(tree).toContain('button "Check again"');
  expect(tree).not.toContain('button "Stop"');
  expect(term.captureCharFrame().split('\n').map((l) => l.trimEnd()).filter((l) => l !== '')).toEqual(['Stop', 'Check again']);
}, 60_000);
