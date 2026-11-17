// Computers > Projects: each project row shows the project's own colour. The web's dot is an empty span coloured by an
// inline custom property; the terminal reads no inline style, so the row would draw blank cells there.
// ProjectDot.term.tsx draws one swatch cell in the project's hex instead.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { drawTest } from '../../term/prim/testing';
import { Box, Text, setColourTier } from '../../term/prim';
import { ProjectDot } from './parts/ProjectDot.term';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; setColourTier('truecolor'); });

async function cells(color: string | undefined): Promise<Array<{ ch: string; fg: number[] }>> {
  const t = await drawTest(<Box dir="row"><ProjectDot color={color} /><Text>name</Text></Box>, { width: 20, height: 1 });
  await t.settle();
  const out: Array<{ ch: string; fg: number[] }> = [];
  for (const sp of t.captureSpans().lines[0]!.spans) for (const ch of [...sp.text]) out.push({ ch, fg: sp.fg.toInts().slice(0, 3) });
  t.renderer.destroy();
  return out;
}

test('the dot is one cell in the project hex; no colour or mono draws nothing', async () => {
  setColourTier('truecolor');
  const drawn = await cells('#3B82F6');
  expect(drawn[0]).toEqual({ ch: '█', fg: [0x3b, 0x82, 0xf6] });
  expect(drawn.slice(1, 5).map((c) => c.ch).join('')).toBe('name');
  expect((await cells(undefined)).slice(0, 4).map((c) => c.ch).join('')).toBe('name');
  expect((await cells('not a colour')).slice(0, 4).map((c) => c.ch).join('')).toBe('name');
  setColourTier('mono');
  expect((await cells('#3B82F6')).slice(0, 4).map((c) => c.ch).join('')).toBe('name');
});

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: every project row starts with its colour swatch`, async () => {
    s = await renderPage({ page: 'computers', path: '/computers/projects', cols, rows });
    const lines = (await s.settle()).split('\n');
    for (const name of ['Acme storefront', 'Experiments', 'Home base']) {
      const row = lines.find((l) => l.includes(name) && !l.includes('computers ›')) ?? '';
      expect(row).toMatch(new RegExp(`█\\s{1,2}${name}`));
    }
    expect(s.failures).toEqual([]);
  }, 180_000);
}
