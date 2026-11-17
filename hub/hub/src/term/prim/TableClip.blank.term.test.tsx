// ClipRow's cut after a blank ("atlas stopped…" with a clipped letter at the box edge): the cells after the "…" are
// plain spaces on the row's own background, never U+00A0 (selectable text is a core goal: a selection, the
// semantics text and the terminal's own copy of the screen give plain characters).
import { expect, test } from 'bun:test';
import { drawTest } from './testing';
import { Box, FocusRoot, Text } from './index';
import { ClipRow } from './TableClip';
import { SecretField } from '../../kit/forms/Secret';

const LINE = 'atlas stopped after running out of memory';
const render = async (bg?: 'card' | 'selected') => {
  const t = await drawTest(
    <FocusRoot><Box width={20} height={1} dir="row" bg={bg}><Box width={15} height={1} dir="row" clip><ClipRow><Box dir="row"><Text shrink={0}>{LINE}</Text></Box></ClipRow></Box></Box></FocusRoot>,
    { width: 22, height: 3 },
  );
  let f = await t.settle();
  for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 20)); f = await t.settle(); }
  return { t, f };
};

test('the cells after the mark are plain spaces in the drawn frame (no U+00A0)', async () => {
  const { t, f } = await render();
  const line = f.split('\n')[0]!;
  expect(line.slice(0, 15)).toBe('atlas stopped… ');
  expect(f).not.toContain(' ');
  t.renderer.destroy();
});

test('the blank cells keep the row background under them (a selected row stays filled)', async () => {
  for (const bg of ['card', 'selected'] as const) {
    const { t } = await render(bg);
    const spans = (t as unknown as { captureSpans(): { lines: { spans: { text: string; bg: { toInts(): number[] } }[] }[] } }).captureSpans();
    const cells: number[][] = [];
    for (const s of spans.lines[0]!.spans) for (const _ of s.text) cells.push(s.bg.toInts());
    expect(spans.lines[0]!.spans.map((s) => s.text).join('')).not.toContain(' ');
    // cell 14 (the clipped letter's cell, now blank) has the same background as the words before it
    expect(cells[14]).toEqual(cells[0]);
    expect(cells[14]![3]).toBe(255);
    t.renderer.destroy();
  }
});

const selectRow = async (t: Awaited<ReturnType<typeof drawTest>>, x1: number): Promise<string> => {
  const m = (t as unknown as { mockMouse: { drag(x0: number, y0: number, x1: number, y1: number): Promise<void> } }).mockMouse;
  await m.drag(0, 0, x1, 0);
  await t.settle();
  return (t.renderer as unknown as { getSelection(): { getSelectedText(): string } | null }).getSelection()?.getSelectedText() ?? '';
};

// Copying a cut cell gives the full underlying value (a person copying a cut id or name wants all of
// it), never the drawn "…" mark, and no U+00A0.
test('a mouse selection across the cut copies the whole value, without the "…" mark or U+00A0', async () => {
  const { t } = await render();
  const text = await selectRow(t, 19);
  expect(text).toContain('atlas stopped after');
  expect(text).not.toContain('\u2026');
  expect(text).not.toContain('\u00a0');
  t.renderer.destroy();
});

// A masked secret in a cut cell copies its mask (the bullets drawn), never the value behind it.
test('a masked secret in a cut cell copies the mask, never the value', async () => {
  const KEY = 'hk_3f9a_SUPERSECRETVALUE42';
  const t = await drawTest(
    <FocusRoot><Box width={20} height={1} dir="row"><ClipRow><Box dir="row"><SecretField label="Key" value={KEY} /></Box></ClipRow></Box></FocusRoot>,
    { width: 40, height: 6 },
  );
  for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 20)); await t.settle(); }
  const text = await selectRow(t, 39);
  expect(text).not.toContain('SUPERSECRET');
  expect(text).not.toContain(KEY.slice(4));
  expect(text).not.toContain('\u2026');
  t.renderer.destroy();
});
