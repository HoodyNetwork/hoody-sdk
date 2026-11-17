// The page's questions on a short page sit at the bottom of its scroll area, in flow (the web's
// `margin-block-start: auto` on `.faq` / `.listFaq`); on a long page they follow the content and scroll with it, and
// they never sit right under a short list in the middle of a tall screen.
import { afterEach, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Text } from '../../term/prim';
import { routed } from './termHarness';
import { __resetKeptScroll } from './termScroll';
import { DashboardPage, DetailPage, TablePage } from './Layouts';
import { ListDetailPage } from './ListDetailPage';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; __resetKeptScroll(); });
const lines = async (node: () => ReactNode, w: number, h: number): Promise<string[]> => {
  t = await drawTest(routed(node, '/page').element, { width: w, height: h });
  return (await t.settle()).split('\n').map((l) => l.trimEnd());
};
const faq = { items: [{ id: 'a', q: 'First question?', a: 'Yes.' }, { id: 'b', q: 'Last question?', a: 'No.' }] };
const body = (n: number): ReactNode => Array.from({ length: n }, (_, i) => <Text key={i}>{`line ${i + 1}`}</Text>);
const header = { title: 'Things' };
const pages: Record<string, (n: number) => ReactNode> = {
  table: (n) => <TablePage header={header} faq={faq}>{body(n)}</TablePage>,
  detail: (n) => <DetailPage header={header} faq={faq}>{body(n)}</DetailPage>,
  dashboard: (n) => <DashboardPage header={header} faq={faq}>{body(n)}</DashboardPage>,
  list: (n) => <ListDetailPage storageKey="ql" header={header} faq={faq} list={<>{body(n)}</>} detail={null} />,
};

for (const [w, h] of [[80, 24], [320, 90]] as const) {
  for (const [name, page] of Object.entries(pages)) {
    test(`${name} at ${w}x${h}, short: the questions end on the last row`, async () => {
      const f = await lines(() => page(3), w, h);
      expect(f.some((l) => l.includes('line 3'))).toBe(true);
      const last = f.findLastIndex((l) => l.trim() !== '');
      expect(f[last]).toContain('Last question?');
      // A dashboard's questions keep the row under them that its cards' row gap gives (wide only).
      const under = h - 1 - last;
      expect(under).toBe(name === 'dashboard' && w >= 160 ? 1 : 0);
      // The free rows sit between the content and the questions, not under them.
      expect(f.findIndex((l) => l.includes('Questions'))).toBe(last - 2);
    });
    test(`${name} at ${w}x${h}, long: the questions follow the content, off the first screen`, async () => {
      const f = await lines(() => page(h * 2), w, h);
      expect(f.some((l) => l.includes('line 1'))).toBe(true);
      expect(f.some((l) => l.includes('Questions'))).toBe(false);
      expect(f.some((l) => l.includes('Last question?'))).toBe(false);
    });
  }
}
