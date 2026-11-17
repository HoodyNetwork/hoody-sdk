// The census's own reading of a fault: which node it is about, and which shared component its cluster is named for.
import { expect, test } from 'bun:test';
import { chainOf, clusterKey, nodeOfFault, type LNode } from './layout-census';

class Box { id?: string; x = 0; y = 0; width = 0; height = 0; parent: LNode | null = null; kids: LNode[] = []; plainText?: string; virtualLineCount?: number; scrollTop?: number;
  constructor(id: string | undefined, g: [number, number, number, number], kids: Box[] = []) { this.id = id; [this.x, this.y, this.width, this.height] = g; this.kids = kids as unknown as LNode[]; for (const k of kids) k.parent = this as unknown as LNode; }
  getChildren(): LNode[] { return this.kids; } }
const n = (b: Box): LNode => b as unknown as LNode;

test('a cut fault is matched by its box and its parent box, not by its (shared) path', () => {
  const a = new Box('Toolbar<SchedulesPage@b3', [1, 5, 40, 1]);
  const b = new Box('Toolbar<LogsPage@b9', [1, 9, 90, 1]);
  const root = new Box('screen-root', [0, 0, 80, 24], [new Box('ListDetailPage<SchedulesPage@b1', [0, 4, 80, 3], [a]), new Box('ListDetailPage<LogsPage@b2', [0, 8, 80, 3], [b])]);
  const got = nodeOfFault(n(root), { kind: 'cut', path: 'screen-root > ListDetailPage > Toolbar', detail: '90x1 at 1,9 past its box 80x3 at 0,8' });
  expect(got).toBe(n(b));
  expect(chainOf(got!)).toEqual(['Toolbar<LogsPage', 'ListDetailPage<LogsPage', 'screen-root']);
});

test('text-cut, scrolled-open and overdraw are matched by what their detail says', () => {
  const t = new Box(undefined, [2, 2, 10, 1]); t.plainText = 'two lines  of text'; t.virtualLineCount = 2;
  const s = new Box('PageBody<DetailPage@b4', [0, 1, 80, 20]); s.scrollTop = 7;
  const o = new Box('Chip<Row@b5', [3, 3, 12, 1]);
  const root = new Box('screen-root', [0, 0, 80, 24], [t, s, o]);
  expect(nodeOfFault(n(root), { kind: 'text-cut', path: 'screen-root > Text', detail: '2 lines in 1 "two lines of text"' })).toBe(n(t));
  expect(nodeOfFault(n(root), { kind: 'scrolled-open', path: 'x', detail: 'opened scrolled to 7' })).toBe(n(s));
  expect(nodeOfFault(n(root), { kind: 'overdraw', path: 'screen-root > Chip ⨯ Box', detail: '12x1 / 30x1' })).toBe(n(o));
  expect(nodeOfFault(n(root), { kind: 'cut', path: 'x', detail: '1x1 at 9,9 past its box 2x2 at 0,0' })).toBeNull();
});

test('a cluster is named for the innermost kit component on the chain, never for a shell wrapper or a page', () => {
  expect(clusterKey({ kind: 'cut', path: 'p', detail: '', chain: ['div.row', 'SchedulesPage<PageContent', 'Toolbar<SchedulesPage', 'ListDetailPage<SchedulesPage', 'PageHost<DrawnPages', 'hub-shell-pane'] })).toBe('Toolbar');
  expect(clusterKey({ kind: 'cut', path: 'p', detail: '', chain: ['ol.flowSteps', 'hub-sec-bot-invite', 'div.tabBody'] })).toBe('ol.flowSteps');
  // No chain (the node was not found again): the check's own path, innermost name first.
  expect(clusterKey({ kind: 'overdraw', path: 'screen-root > hub-shell-pane > DataTableTerm ⨯ Text', detail: '' })).toBe('DataTableTerm');
});
