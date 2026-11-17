// Computers detail, the line under the name: its items are joined by " · " and the line starts at its box. The web
// draws the dot with ::before and clips a line's first one; before parts/HeadLine.term.tsx the terminal drew no dot
// ("Singapore   Home base") and started the line two cells early (layoutcheck: cut span.headLine).
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';
import { layoutFaults } from '../../term/prim/layoutcheck';

let close: (() => void) | null = null;
afterEach(() => { close?.(); close = null; });

test('detail header line: dots between server, project, realm and Current computer; nothing cut', async () => {
  const s = await renderPage({ page: 'computers', path: '/computers?sel=atlas.00a1', cols: 120, rows: 40 });
  close = () => s.close();
  const frame = await s.settle();
  // The line holds the server (its place is in Where it runs), the project, the realm chip and Current computer.
  expect(frame).toMatch(/SG n12 · Home base · +█ +Personal +· +Current computer/);
  const cut = layoutFaults(s.renderer.root as never, { cols: 120, rows: 40 }).filter((f) => f.path.includes('DetailHeader'));
  expect(cut).toEqual([]);
}, 120_000);
