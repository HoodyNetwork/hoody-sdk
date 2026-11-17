// layoutcheck and sticky boxes: a sticky box (jsx/sticky.ts marks it `__hxSticky`, offsets it with
// translateY) stuck at its place over the content it scrolls over is not an overdraw (the web draws it so: Bots' chat
// dock over the log while the reader is up the thread). Still faults: two sticky boxes on each other, a sticky box over
// a sticky one at rest, boxes that overlap in their natural layout, and an offset box outside any scroll.
import { expect, test } from 'bun:test';
import { layoutFaults } from './layoutcheck';

class RootRenderable {}
class BoxRenderable { _borderStyle = undefined; }
class TextRenderable {}
class ScrollBoxRenderable { wrapper = {}; viewport = {}; content = {}; } // the three parts layoutcheck knows a scroll box by
type N = Record<string, unknown>;
const mk = (C: new () => object, o: N, kids: N[] = []): N => {
  const n = Object.assign(new C() as N, o);
  for (const k of kids) k.parent = n;
  n.getChildren = () => kids;
  return n;
};
const txt = (y: number, h: number, s: string) => mk(TextRenderable, { x: 0, y, width: 40, height: h, plainText: s });
// The log: rows 0-29. The dock: natural rows 30-34; offset by translateY.
const log = () => mk(BoxRenderable, { id: 'div.logCol@1', x: 0, y: 0, width: 40, height: 30 }, [txt(0, 30, 'the thread')]);
const dock = (off: number, sticky = true, natural = 30) => mk(BoxRenderable, { id: 'div.sayDock@2', x: 0, y: natural + off, width: 40, height: 5, translateY: off, ...(sticky ? { __hxSticky: true } : {}) }, [txt(natural + off, 5, 'Message the Bot')]);
const inScroll = (a: N, b: N) => mk(RootRenderable, { x: 0, y: 0, width: 40, height: 24 }, [mk(ScrollBoxRenderable, { id: 'page-scroll', x: 0, y: 0, width: 40, height: 24 }, [mk(BoxRenderable, { id: 'div.activity@3', x: 0, y: 0, width: 40, height: 35 }, [a, b])])]);
const kinds = (root: N) => layoutFaults(root as never, { cols: 40, rows: 24 }).filter((f) => f.kind === 'overdraw').map((f) => f.path);

test('a sticky box stuck over the content it scrolls over: no overdraw', () => {
  expect(kinds(inScroll(log(), dock(-11)))).toEqual([]);
});
test('two sticky boxes on each other: overdraw', () => {
  const a = mk(BoxRenderable, { id: 'div.bar@4', x: 0, y: 20, width: 40, height: 3, translateY: -5, __hxSticky: true }, [txt(20, 3, 'bar')]);
  expect(kinds(inScroll(a, dock(-11)))).toHaveLength(1);
});
test('a sticky box over a sticky one at rest: overdraw', () => {
  const rest = mk(BoxRenderable, { id: 'div.rest@5', x: 0, y: 20, width: 40, height: 3, translateY: 0, __hxSticky: true }, [txt(20, 3, 'rest')]);
  expect(kinds(inScroll(rest, dock(-11)))).toHaveLength(1);
});
test('boxes that overlap in their natural layout: overdraw, offset or not', () => {
  expect(kinds(inScroll(log(), dock(-3, true, 26)))).toHaveLength(1);
});
test('an offset box that is not sticky, or not in a scroll: overdraw', () => {
  expect(kinds(inScroll(log(), dock(-11, false)))).toHaveLength(1);
  const bare = mk(RootRenderable, { x: 0, y: 0, width: 40, height: 24 }, [mk(BoxRenderable, { id: 'div.activity@3', x: 0, y: 0, width: 40, height: 35 }, [log(), dock(-11)])]);
  expect(kinds(bare)).toHaveLength(1);
});
