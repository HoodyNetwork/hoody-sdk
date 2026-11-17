// A reply's paragraph in a shrink-to-fit box (a Bots Activity bubble: start-aligned, at most 80 % of the log) is as wide
// as its text, up to the box's most. Its lines are broken at the width it gets; before this test the broken lines were
// the only thing sizing the bubble, so after a narrow window (80 columns) the bubble kept the narrow width and the narrow
// wrap when the window grew back ("I opened a task to read the / deploy log…" at 120 columns).
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { Prose } from './Reply';

const LINE = 'I opened a task to read the deploy log. It is working on it now.';
const bubble = (
  <FocusRoot>
    <Box dir="column" grow={1}>
      <Box dir="column" alignSelf="start" maxWidth="80%"><Prose text={LINE} /></Box>
    </Box>
  </FocusRoot>
);

test('narrow, then wide again: the paragraph is drawn as before the narrow window', async () => {
  const t = await drawTest(bubble, { width: 100, height: 10 });
  const before = await t.settle();
  expect(before).toContain(LINE);
  t.resize(40, 10); await t.settle(); await t.settle();
  expect(await t.settle()).not.toContain(LINE);
  t.resize(100, 10); await t.settle(); await t.settle();
  const after = await t.settle();
  t.renderer.destroy();
  expect(after).toBe(before);
});

test('a short paragraph keeps its bubble as narrow as its text', async () => {
  const t = await drawTest(
    <FocusRoot><Box dir="column" grow={1}><Box dir="row"><Box dir="column" alignSelf="start" maxWidth="80%"><Prose text="Hi there." /></Box><Box>|</Box></Box></Box></FocusRoot>,
    { width: 100, height: 6 },
  );
  const f = await t.settle();
  t.renderer.destroy();
  expect(f.split('\n')[0]!.startsWith('Hi there.|')).toBe(true);
});
