// The pure layout of NodeLink: one entity in the centre, the entities linked to it on a ring.
// Sizes are real pixels at the box's own width, so a label is the same size at 390 px as on a desktop, and a label is
// cut by its measured advance, never by a character count. Two relations with one neighbour share its spoke. The order
// is the caller's edge order, so the caller ranks what is drawn; the rest are counted, never dropped silently.
import type { NodeLinkEdge, NodeLinkNode } from './NodeLink';

/** Below this box width the ring holds fewer links and the relation names leave the drawing. */
export const NODE_LINK_NARROW = 500;
export const NODE_LINK_MAX = 12;
export const NODE_LINK_MAX_NARROW = 8;
const HEIGHT = 460;
const HEIGHT_NARROW = 380;
/** Room kept from the box's edge. */
const EDGE = 8;
/** From a node's centre to its label. */
const LABEL_GAP = 12;
/** Two relation names closer than this in y share a line. */
const RELATION_LINE = 14;
const RELATION_GAP = 8;
/** A label over its dot sits by its baseline, so its descenders need this to clear the focus mark round the dot. */
const LABEL_ABOVE = 16;
/** A ring node closer than this to the vertical takes its label above or below it. */
const VERTICAL = 0.1;
const ELLIPSIS = '…';

export type Measure = (text: string) => number;
/** Which of the part's texts, each with its own face. */
export type NodeLinkText = 'name' | 'center' | 'relation';
export type NodeLinkMeasure = (text: string, kind: NodeLinkText) => number;

export interface NodeLinkRelation { edgeId: string; relation: string; outgoing: boolean }

export interface NodeLinkSpoke {
  node: NodeLinkNode;
  relations: NodeLinkRelation[];
  x: number;
  y: number;
  labelX: number;
  labelY: number;
  anchor: 'start' | 'middle' | 'end';
  /** The label as drawn: whole, or cut to the room it has. */
  shown: string;
  /** Where the relation name sits; null at phone width. */
  mid: { x: number; y: number; shown: string } | null;
}

export interface NodeLinkLayout {
  width: number;
  height: number;
  narrow: boolean;
  center: { node: NodeLinkNode; x: number; y: number; shown: string };
  spokes: NodeLinkSpoke[];
  /** Every link of the centre whose other end is known, drawn or not. */
  links: number;
  /** Those links not drawn. */
  more: number;
}

function graphemes(text: string): string[] {
  return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (g) => g.segment);
}

/** `text` whole if it fits in `room` px, else the longest run of whole graphemes that fits with an ellipsis. */
export function fitLabel(text: string, room: number, measure: Measure): string {
  if (measure(text) <= room) return text;
  const g = graphemes(text);
  let lo = 0;
  let hi = g.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(g.slice(0, mid).join('') + ELLIPSIS) <= room) lo = mid;
    else hi = mid - 1;
  }
  if (lo > 0) return g.slice(0, lo).join('') + ELLIPSIS;
  return measure(ELLIPSIS) <= room ? ELLIPSIS : '';
}

/** The layout around `selected`, or null when `selected` is not among `nodes`. */
export function nodeLinkLayout(nodes: readonly NodeLinkNode[], edges: readonly NodeLinkEdge[], selected: string, width: number, measure: NodeLinkMeasure): NodeLinkLayout | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const node = byId.get(selected);
  if (!node) return null;
  const around = new Map<string, NodeLinkRelation[]>();
  let links = 0;
  for (const e of edges) {
    if (e.source === e.target) continue;
    const outgoing = e.source === selected;
    if (!outgoing && e.target !== selected) continue;
    const other = outgoing ? e.target : e.source;
    if (!byId.has(other)) continue;
    links += 1;
    const row = { edgeId: e.id, relation: e.relation, outgoing };
    const had = around.get(other);
    if (had) had.push(row);
    else around.set(other, [row]);
  }
  const narrow = width < NODE_LINK_NARROW;
  const height = narrow ? HEIGHT_NARROW : HEIGHT;
  const cx = width / 2;
  const cy = height / 2;
  const drawn = [...around].slice(0, narrow ? NODE_LINK_MAX_NARROW : NODE_LINK_MAX);
  const rx = cx - Math.min(width * 0.28, 150);
  const ry = cy - 44;
  const spokes = drawn.map(([id, relations], i): NodeLinkSpoke => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / drawn.length;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const x = cx + rx * c;
    const y = cy + ry * sn;
    const vertical = Math.abs(c) < VERTICAL;
    const right = c >= 0;
    const room = vertical ? width - 2 * EDGE : right ? width - EDGE - (x + LABEL_GAP) : x - LABEL_GAP - EDGE;
    const first = relations[0]!;
    const words = relations.length > 1 ? `${first.relation} +${relations.length - 1}` : first.relation;
    return {
      node: byId.get(id)!,
      relations,
      x,
      y,
      labelX: vertical ? x : right ? x + LABEL_GAP : x - LABEL_GAP,
      labelY: vertical ? y + (sn < 0 ? -LABEL_ABOVE : 2 * LABEL_GAP) : y + 4,
      anchor: vertical ? 'middle' : right ? 'start' : 'end',
      shown: fitLabel(byId.get(id)!.label, room, (t) => measure(t, 'name')),
      mid: narrow ? null : { x: (cx + x) / 2, y: (cy + y) / 2 - 4, shown: words },
    };
  });
  // A relation's room stops short of the next relation on its line: both are cut to it, so two can never touch. One with
  // no room left is not drawn; the readout still names it.
  for (const spoke of spokes) {
    const mid = spoke.mid;
    if (!mid) continue;
    let room = rx * 0.6;
    for (const other of spokes) {
      if (other === spoke || !other.mid || Math.abs(other.mid.y - mid.y) >= RELATION_LINE) continue;
      room = Math.min(room, Math.abs(other.mid.x - mid.x) - RELATION_GAP);
    }
    const shown = fitLabel(mid.shown, room, (t) => measure(t, 'relation'));
    spoke.mid = shown === '' ? null : { ...mid, shown };
  }
  return {
    width,
    height,
    narrow,
    center: { node, x: cx, y: cy, shown: fitLabel(node.label, Math.min(width - 2 * EDGE, 2 * rx), (t) => measure(t, 'center')) },
    spokes,
    links,
    more: links - spokes.reduce((n, s) => n + s.relations.length, 0),
  };
}
