// ClipRow: a line of its content below what its one-line box shows (a table cell's stacked block: a title over its
// "Waiting to: …" note, bots Work) is lost whole; the last shown line ends in one "…" right after its words, whatever
// the dropped line's width.
import { expect, test } from 'bun:test';
import { drawTest } from './testing';
import { Box, FocusRoot, Text } from './index';
import { ClipRow } from './TableClip';

const draw = async (node: React.ReactNode, width: number) => {
  const t = await drawTest(<FocusRoot><Box width={width} height={1} dir="row" clip>{node}</Box></FocusRoot>, { width: width + 4, height: 4 });
  let f = await t.settle();
  for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 20)); f = await t.settle(); }
  t.renderer.destroy();
  return f.split('\n').map((l) => l.slice(0, width).trimEnd());
};
const block = (title: string, note: string) => <ClipRow><Box dir="column"><Text>{title}</Text><Text>{note}</Text></Box></ClipRow>;

test('a stacked block in a one-line box: the title ends in "…", the note line is not drawn', async () => {
  for (const note of ['Waiting', 'Waiting to: Run a command that changes files in the shop repository']) {
    const f = await draw(block('Draft reply to a reader', note), 40);
    expect(f[0]).toBe('Draft reply to a reader…');
    expect(f[1]).toBe('');
  }
});

test('a title as wide as the box keeps one "…" in its last cell', async () => {
  const f = await draw(block('Draft reply to a reader', 'Waiting'), 23);
  expect(f[0]).toBe('Draft reply to a reade…');
});

test('one line that fits gets no mark', async () => {
  const f = await draw(<ClipRow><Box dir="column"><Text>Read deploy log</Text></Box></ClipRow>, 40);
  expect(f[0]).toBe('Read deploy log');
});

test('the dropped line stays in the semantics (agents, screen readers read it, as they read a sideways cut)', async () => {
  const { semanticsOf } = await import('./semantics');
  const t = await drawTest(<FocusRoot><Box width={40} height={1} dir="row" clip>{block('Draft reply to a reader', 'Waiting to: Run a command')}</Box></FocusRoot>, { width: 44, height: 4 });
  await t.settle();
  const sem = JSON.stringify(semanticsOf(t.renderer as never));
  t.renderer.destroy();
  expect(sem).toContain('Waiting to: Run a command');
});

// A line cut at the right edge right after a blank ("atlas stopped after …" in 15 cells) ends in "…" after its last
// word, as clipCells does ("atlas stopped…"), never "atlas stopped …"; the clipped letter stays hidden.
test('a right-edge cut after a blank: the "…" right after the words, the rest blank', async () => {
  const f = await draw(<ClipRow><Box dir="row"><Text shrink={0}>atlas stopped after running out of memory</Text></Box></ClipRow>, 15);
  expect(f[0]).toBe('atlas stopped…');
  const g = await draw(<ClipRow><Box dir="row"><Text shrink={0}>atlas stopped after running out of memory</Text></Box></ClipRow>, 16);
  expect(g[0]).toBe('atlas stopped a…');
});
