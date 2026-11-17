// A focus scroll brings a field's label with its control: Shift+Tab back to a field above the fold scrolled only the
// control to the top edge, its label one row above stayed off (New realm "Name" at 80x24).
import { expect, test } from 'bun:test';
import { drawTest } from '../prim/testing';
import { Box, FocusRoot, Pressable, Scroll, Text } from '../prim';
import { revealTarget } from '../prim/Scroll';
import { FieldFrame } from '../../kit/forms/termField';

const form = (rows: number) => (
  <FocusRoot>
    <Scroll followFocus height={rows}>
      <Box dir="column">
        <FieldFrame label="Name"><Pressable focusPaint={false}>{({ focused }) => <Text>{focused ? 'FIRST*' : 'first'}</Text>}</Pressable></FieldFrame>
        {Array.from({ length: 10 }, (_, i) => <Text key={i}>{`line ${i}`}</Text>)}
        <Pressable focusPaint={false}>{({ focused }) => <Text>{focused ? 'LAST*' : 'last'}</Text>}</Pressable>
      </Box>
    </Scroll>
  </FocusRoot>
);

test('Shift+Tab back to a field above the fold shows its label above it', async () => {
  const t = await drawTest(form(4), { width: 20, height: 4 });
  try {
    await t.settle();
    t.mockInput.pressTab(); await t.settle();
    t.mockInput.pressTab(); await t.settle();
    expect(t.captureCharFrame()).toContain('LAST*');
    expect(t.captureCharFrame()).not.toContain('Name');
    t.mockInput.pressTab({ shift: true }); await t.settle();
    const lines = t.captureCharFrame().split('\n').map((l) => l.trim());
    const at = lines.findIndex((l) => l.startsWith('FIRST*'));
    expect(at).toBeGreaterThan(0);
    expect(lines[at - 1]).toMatch(/^Name(\s|$)/); // a scrollbar cell may follow
  } finally { t.renderer.destroy(); }
});

test('a frame taller than the viewport is not the target: the focused node is', () => {
  const box = { viewport: { height: 3 } };
  const frame: Record<string, unknown> = { parent: box, height: 5, hxRevealFrame: true };
  const node = { parent: frame, height: 1 };
  expect(revealTarget(node, box) as unknown).toBe(node);
  frame.height = 3;
  expect(revealTarget(node, box) as unknown).toBe(frame);
  expect(revealTarget({ parent: box }, box)).toEqual({ parent: box });
});
