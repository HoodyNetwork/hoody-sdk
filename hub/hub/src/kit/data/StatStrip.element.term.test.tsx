// A stat whose caption is an element (the computers page's "Get more room" link under "7 of 8") counts toward the
// strip's width: when the row does not fit, the strip goes to pairs and the caption is drawn whole, never cut at the
// strip's edge (census, computers slotsNear at 60x20: "[ Running" cut after 9 cells).
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { Button } from '../controls/Button';
import { StatStrip } from './Display';

const items = (caption: string) => [
  { label: 'Computers', value: 8, detail: '4 running · 2 stopped · 1 failed' },
  { label: 'Servers', value: 3 },
  { label: 'Slots', value: '7 of 8', detail: <Button variant="ghost" size="sm" onPress={() => {}}>{caption}</Button> },
];

for (const narrow of ['pairs', 'rows'] as const) {
  test(`StatStrip (${narrow}): an element caption too wide for the row sends the strip narrow and is drawn whole`, async () => {
    const t = await drawTest(<FocusRoot><Box dir="column" width={57}><StatStrip items={items('Running low: Get more room')} narrow={narrow} /></Box></FocusRoot>, { width: 60, height: 12 });
    const lines = (await t.settle()).split('\n');
    const cap = lines.find((l) => l.includes('Running low'))!;
    expect(cap).toContain('Running low: Get more room');
    // Not one row any more: Slots is no longer on the Computers line.
    expect(lines.find((l) => l.includes('Computers'))).not.toContain('Slots');
    t.renderer.destroy();
  });
}

test('StatStrip: an element caption that fits keeps the one row', async () => {
  const t = await drawTest(<FocusRoot><Box dir="column" width={57}><StatStrip items={items('More')} /></Box></FocusRoot>, { width: 60, height: 12 });
  const lines = (await t.settle()).split('\n');
  expect(lines.find((l) => l.includes('Computers'))).toContain('Slots');
  expect(lines.join('\n')).toContain('More');
  t.renderer.destroy();
});

test('StatStrip (pairs): a caption wider than half the strip is drawn whole, its neighbour still beside it', async () => {
  const t = await drawTest(<FocusRoot><Box dir="column" width={57}><StatStrip items={items('Running low: Get more room')} /></Box></FocusRoot>, { width: 60, height: 12 });
  const lines = (await t.settle()).split('\n');
  expect(lines.join('\n')).toContain('4 running · 2 stopped · 1 failed');
  expect(lines.find((l) => l.includes('Computers'))).toContain('Servers');
  t.renderer.destroy();
});

test('StatStrip (pairs): two stats that cannot share a line stack, both whole', async () => {
  const two = [{ label: 'Computers', value: 8, detail: '4 running · 2 stopped · 1 failed' }, { label: 'Slots', value: '7 of 8', detail: 'Running low on room here' }];
  const t = await drawTest(<FocusRoot><Box dir="column" width={40}><StatStrip items={two} /></Box></FocusRoot>, { width: 44, height: 12 });
  const f = await t.settle();
  expect(f).toContain('4 running · 2 stopped · 1 failed');
  expect(f).toContain('Running low on room here');
  expect(f.split('\n').find((l) => l.includes('Computers'))).not.toContain('Slots');
  t.renderer.destroy();
});

// AI agent tools at 60x20: one stat, "Now" / 4 / a sentence wider than the strip. The label was squeezed to one letter
// a line ("N", "o", "w") and the sentence ran over it and past the strip's edge.
for (const narrow of ['pairs', 'rows'] as const) {
  test(`StatStrip (${narrow}): a caption in words wider than the strip wraps; the label keeps its cells`, async () => {
    const one = [{ label: 'Now', value: 4, detail: 'Reads and edits files, runs commands and starts helpers on atlas, as you.' }];
    const t = await drawTest(<FocusRoot><Box dir="column" width={57}><StatStrip items={one} narrow={narrow} /></Box></FocusRoot>, { width: 60, height: 12 });
    const lines = (await t.settle()).split('\n');
    expect(lines.some((l) => /(^|\s)Now(\s|$)/.test(l))).toBe(true);
    const words = lines.join(' ').replace(/\s+/g, ' ');
    expect(words).toContain('starts helpers on atlas, as you.');
    expect(words).toContain('Reads and edits files');
    for (const l of lines) expect(l.trimEnd().length).toBeLessThanOrEqual(57);
    t.renderer.destroy();
  });
}
