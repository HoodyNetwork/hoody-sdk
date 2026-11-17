// layoutcheck in a minified bundle (the ship build's artifact check refuses class NAME comparisons: minification
// renames classes): a scroll box is known by its own parts, whatever its class is called. Box's popup check ships
// clippedAbsolute, so a mark below the fold of a scroll must stay exempt there too.
import { expect, test } from 'bun:test';
import { clippedAbsolute, layoutFaults } from './layoutcheck';

class Qe { wrapper = {}; viewport = {}; content = {}; } // the engine's ScrollBoxRenderable after minification
class Xa {}
type N = Record<string, unknown>;
const mk = (C: new () => object, o: N, kids: N[] = []): N => {
  const n = Object.assign(new C() as N, o);
  for (const k of kids) k.parent = n;
  n.getChildren = () => kids;
  return n;
};

test('an absolute mark below the fold of a renamed scroll box is not a clipped popup', () => {
  const mark = mk(Xa, { id: 'mark', x: 4, y: 60, width: 3, height: 1, _positionType: 'absolute' });
  mk(Xa, { x: 0, y: 0, width: 80, height: 24 }, [mk(Qe, { id: 'page-scroll', x: 0, y: 0, width: 80, height: 24 }, [mk(Xa, { id: 'doc', x: 0, y: 0, width: 80, height: 90 }, [mark])])]);
  expect(clippedAbsolute(mark as never)).toBeNull();
});

test('a long document in a renamed scroll box is not an explosion', () => {
  const root = mk(Xa, { x: 0, y: 0, width: 80, height: 24 }, [mk(Qe, { id: 'page-scroll', x: 0, y: 0, width: 80, height: 24 }, [mk(Xa, { id: 'doc', x: 1, y: 4, width: 77, height: 557 })])]);
  expect(layoutFaults(root as never, { cols: 80, rows: 24 }).filter((f) => f.kind === 'explosion')).toEqual([]);
});

class Bo { _borderStyle = undefined; _border = false; _backgroundColor = { a: 0 }; } // the engine's BoxRenderable after minification

test('two empty, transparent boxes of a renamed class on the same cells paint nothing: no overdraw', () => {
  const root = mk(Xa, { x: 0, y: 0, width: 80, height: 24 }, [mk(Bo, { id: 'host', x: 0, y: 0, width: 80, height: 24 }, [mk(Bo, { id: 'a', x: 0, y: 0, width: 10, height: 2 }), mk(Bo, { id: 'b', x: 0, y: 0, width: 10, height: 2 })])]);
  expect(layoutFaults(root as never, { cols: 80, rows: 24 }).filter((f) => f.kind === 'overdraw')).toEqual([]);
});

test('a clipped popup message names the box by kind, never by a minified class name', () => {
  const pop = mk(Xa, { id: 'pop', x: 70, y: 2, width: 20, height: 1, _positionType: 'absolute' });
  mk(Xa, { x: 0, y: 0, width: 80, height: 24 }, [mk(Bo, { x: 0, y: 0, width: 75, height: 10 }, [pop])]);
  expect(clippedAbsolute(pop as never)).toBe('20x1 at 70,2 reaches past Box 75x10 at 0,0');
});
