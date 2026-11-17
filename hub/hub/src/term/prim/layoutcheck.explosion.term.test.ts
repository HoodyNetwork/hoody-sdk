// layoutcheck's explosion rule: a box over 20 screens is a blown-up layout, except the height of what a scroll holds,
// where a long document is a real page (the Guide at 80x24 is 557 rows) and only 200 screens is a blow-up.
import { expect, test } from 'bun:test';
import { layoutFaults } from './layoutcheck';

class RootRenderable {}
class BoxRenderable { _borderStyle = undefined; }
class ScrollBoxRenderable { wrapper = {}; viewport = {}; content = {}; } // the three parts layoutcheck knows a scroll box by
type N = Record<string, unknown>;
const mk = (C: new () => object, o: N, kids: N[] = []): N => {
  const n = Object.assign(new C() as N, o);
  for (const k of kids) k.parent = n;
  n.getChildren = () => kids;
  return n;
};
const TERM = { cols: 80, rows: 24 };
const page = (h: number, w = 77) => mk(BoxRenderable, { id: 'div.grid@1', x: 1, y: 4, width: w, height: h });
const scrolled = (doc: N) => mk(RootRenderable, { x: 0, y: 0, width: 80, height: 24 }, [mk(ScrollBoxRenderable, { id: 'page-scroll', x: 0, y: 0, width: 80, height: 24 }, [doc])]);
const plain = (doc: N) => mk(RootRenderable, { x: 0, y: 0, width: 80, height: 24 }, [mk(BoxRenderable, { id: 'pane', x: 0, y: 0, width: 80, height: 24 }, [doc])]);
const explosions = (root: N) => layoutFaults(root as never, TERM).filter((f) => f.kind === 'explosion').map((f) => f.detail);

test('a long document in a scroll (557 rows at 80x24) is not an explosion', () => {
  expect(explosions(scrolled(page(557)))).toEqual([]);
});
test('over 200 screens tall in a scroll is one', () => {
  expect(explosions(scrolled(page(200 * 24 + 1)))).toHaveLength(1);
});
test('over 20 screens tall outside a scroll is one', () => {
  expect(explosions(plain(page(557)))).toHaveLength(1);
});
test('over 20 screens wide is one, in a scroll too', () => {
  expect(explosions(scrolled(page(10, 20 * 80 + 1)))).toHaveLength(1);
});
