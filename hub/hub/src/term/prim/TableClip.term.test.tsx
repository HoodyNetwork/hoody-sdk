// ClipRow marks what ITS edge cuts with one "…", and nothing else: content that fits gets no mark (not even when it
// fits exactly), one cell over gets one, and a part clipped inside it (a tag that gives way whole) is not its cut.
import { expect, test } from 'bun:test';
import { drawTest } from './testing';
import { Box, FocusRoot, Text } from './index';
import { ClipRow } from './TableClip';
import { MarkCell } from '../../kit/data/cells';
import { Tag } from '../../kit/data/Display';

const draw = async (node: React.ReactNode, width: number) => {
  const t = await drawTest(<FocusRoot><Box width={width} height={1} dir="row">{node}</Box></FocusRoot>, { width: width + 4, height: 3 });
  let f = await t.settle();
  for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 20)); f = await t.settle(); }
  t.renderer.destroy();
  return f.split('\n')[0]!.slice(0, width);
};
const span = (s: string) => <ClipRow><Box dir="row"><Text shrink={0}>{s}</Text></Box></ClipRow>;

test('content that fits exactly gets no mark; one cell over gets one "…" in the last cell', async () => {
  expect(await draw(span('POST hooks.example.org'), 22)).toBe('POST hooks.example.org');
  expect(await draw(span('POST hooks.example.org'), 30)).toBe('POST hooks.example.org        ');
  // One over: cut at the END of the line with exactly one "…", never at a word break ("POST hooks.example.…").
  expect(await draw(span('POST hooks.example.org'), 21)).toBe('POST hooks.example.o…');
});

test('a tag that gives way inside it is not its cut: no stray "…", never part of the tag', async () => {
  const cell = <ClipRow><MarkCell mark={<Text>!</Text>} after={<Tag>curl</Tag>}>POST hooks.example.org</MarkCell></ClipRow>;
  const wide = await draw(cell, 40);
  expect(wide).toContain('POST hooks.example.org');
  expect(wide).toContain('curl');
  // Room for the name only: the tag is gone whole, and nothing marks a cut the name did not have.
  // (28: four cells left, so a tag cut to its first cells would show " c" and a mark for it would show "…".)
  const narrow = await draw(cell, 28);
  expect(narrow).toBe('! POST hooks.example.org    ');
  // Narrower than the name: the name is cut with its own "…" (ClipText), once.
  const cut = await draw(cell, 14);
  expect(cut).toBe('! POST hooks.…');
});

test('a part that clips itself inside it (its own narrower box) is that part\'s cut, not marked again at the edge', async () => {
  expect(await draw(<ClipRow><Box width={3} height={1} shrink={0}><Text shrink={0}>abcdef</Text></Box></ClipRow>, 4)).toBe('abc ');
});

// One line (OneLine clip): a cell's words never wrap at a break and lose their tail unmarked or marked mid-line.
test('element content wider than the cell: one line, cut at its end with one "…", never a word break', async () => {
  // A plain Text (it would wrap by word): "Can't open…" was the old cut, the second line lost.
  expect(await draw(<ClipRow><Text>Can't open here yet</Text></ClipRow>, 13)).toBe("Can't open h…");
  // Several parts (a name and a dim note): the whole line is cut once at the cell's edge, not each part.
  expect(await draw(<ClipRow><Text>queue-drain</Text><Text dim> nightly at 02:00</Text></ClipRow>, 18)).toBe('queue-drain night…');
  // Fits: no mark.
  expect(await draw(<ClipRow><Text>short</Text><Text dim> note</Text></ClipRow>, 12)).toBe('short note  ');
});

test('its Texts keep their natural width (measurable) while the cell cuts them', async () => {
  let row: { getChildren?(): unknown[] } | null = null;
  const t = await drawTest(<FocusRoot><Box width={8} height={1} dir="row" boxRef={(n: unknown) => { row = n as typeof row; }}><ClipRow><Box><Text>twenty cells of text</Text></Box></ClipRow></Box></FocusRoot>, { width: 12, height: 3 });
  let f = await t.settle();
  for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 20)); f = await t.settle(); }
  const texts: number[] = [];
  const walk = (n: unknown): void => { const x = n as { plainText?: string; width: number; getChildren?(): unknown[] }; if (typeof x.plainText === 'string') { if (x.plainText.trim() && !x.plainText.startsWith('\u2026')) texts.push(x.width); } else for (const k of x.getChildren?.() ?? []) walk(k); };
  walk(row);
  t.renderer.destroy();
  expect(texts).toEqual([20]);
  // The cut falls after a blank: the mark sits right after the words, the clipped letter hidden.
  expect(f.split('\n')[0]!.slice(0, 8).trimEnd()).toBe('twenty…');
});
