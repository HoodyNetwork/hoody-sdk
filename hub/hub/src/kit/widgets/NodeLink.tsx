// One entity and its links, drawn: the selected entity in the centre, the entities linked to it on a ring; pressing a
// neighbour asks the caller to select it. A graph too big to draw stays whole in the caller's table (also the
// screen-reader form): links over the limit are counted in a line that always shows. Every drawn entity is a keyboard
// stop (arrows round the ring, Home to the centre, End to the last, Enter or Space to move there). Nothing animates.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { measure as measureText } from '../data/DataTableLayout';
import { formatNumber } from '../format';
import { useStrings } from '../strings';
import { nodeLinkLayout, type NodeLinkRelation, type NodeLinkText } from './nodeLink.layout';
import strings from './NodeLink.strings.en.json';
import s from './NodeLink.module.css';

export interface NodeLinkNode { id: string; label: string }
export interface NodeLinkEdge { id: string; source: string; target: string; relation: string }

export interface NodeLinkProps {
  nodes: readonly NodeLinkNode[];
  edges: readonly NodeLinkEdge[];
  /** The entity in the centre. Not among `nodes`: nothing draws. */
  selected: string;
  onSelect: (id: string) => void;
  /** What the drawing is, read by assistive technology. */
  label: string;
}

const RING_GAP = 3;
/** Each text's face in NodeLink.module.css (--t-small, the same at --fw-semibold, --t-label). Without a canvas the
 *  shared measure falls back to a width per character. */
const FONT: Record<NodeLinkText, string> = {
  name: '400 12px "Geist", system-ui, sans-serif',
  center: '600 12px "Geist", system-ui, sans-serif',
  relation: '400 11px "Geist Mono", ui-monospace, monospace',
};
const LABEL_GLYPH = 7.2;
/** The box's width before it can be measured (a test without layout). */
const UNMEASURED = 640;
const CENTER_R = 13;
const NODE_R = 7;
/** Press target: 44 px across. */
const HIT_R = 22;

const measureLabel = (text: string, kind: NodeLinkText) => measureText(text, FONT[kind], LABEL_GLYPH);

/** "a uses b; b reads a": who did what, from the words the graph holds. */
function sentences(center: string, other: string, relations: readonly NodeLinkRelation[]): string {
  return relations.map((r) => (r.outgoing ? `${center} ${r.relation} ${other}` : `${other} ${r.relation} ${center}`)).join('; ');
}

/** The drawing of one entity and its links (layout in nodeLink.layout.ts). Its data types are the kit's own; the
 *  caller keeps the whole graph in a table beside it. */
export function NodeLink({ nodes, edges, selected, onSelect, label }: NodeLinkProps) {
  const t = useStrings(strings);
  // The box comes and goes with the entity: an entity not in the read draws nothing, so the measure follows the box itself.
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!box) return;
    const read = () => setWidth(box.clientWidth);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(box);
    return () => ro.disconnect();
  }, [box]);
  // A label cut before its font arrived was cut by another face's widths.
  const [fontsIn, setFontsIn] = useState(0);
  useEffect(() => {
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    if (!fonts) return;
    const bump = () => setFontsIn((n) => n + 1);
    fonts.addEventListener?.('loadingdone', bump);
    return () => fonts.removeEventListener?.('loadingdone', bump);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fontsIn is why the same text measures differently now
  const at = useMemo(() => nodeLinkLayout(nodes, edges, selected, width || UNMEASURED, measureLabel), [nodes, edges, selected, width, fontsIn]);

  // One keyboard stop: the entity last reached, else the centre.
  const [stop, setStop] = useState(selected);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const order = at ? [at.center.node.id, ...at.spokes.map((x) => x.node.id)] : [];
  const current = order.includes(stop) ? stop : selected;
  // A move this part asked for keeps the focus on the entity moved to, now the centre, once the caller accepts that very
  // move, and only while the focus has not gone to something else outside the part.
  const moved = useRef<string | null>(null);
  const refs = useRef(new Map<string, SVGGElement>());
  useLayoutEffect(() => {
    const asked = moved.current;
    moved.current = null;
    if (asked !== selected) return;
    setStop(selected);
    const on = document.activeElement;
    if (on && on !== document.body && !box?.contains(on)) return;
    refs.current.get(selected)?.focus();
  }, [selected, box]);
  // Focus taken anywhere outside the part also ends a pending move, even where a press never focused the entity pressed.
  useEffect(() => {
    if (!box) return;
    const away = (e: Event) => {
      if (e.target instanceof Node && !box.contains(e.target)) moved.current = null;
    };
    document.addEventListener('focusin', away, true);
    return () => document.removeEventListener('focusin', away, true);
  }, [box]);
  // The element in the part that holds the focus, kept by focus events so the commit reads what the focus did, not what a
  // render saw. A blur to somewhere else, or to nothing while the element stays drawn, gives the focus up; a removal does not.
  const owner = useRef<Element | null>(null);
  const onBoxFocus = (e: FocusEvent) => {
    owner.current = e.target;
  };
  const onBoxBlur = (e: FocusEvent) => {
    const to = e.relatedTarget;
    if (to instanceof Node && box?.contains(to)) return;
    // The focus left the part, so a move the part asked for no longer decides where the focus goes. A blur to nothing is
    // judged after the commit: a node removed by that commit still hands the focus on.
    if (to !== null) {
      owner.current = null;
      moved.current = null;
      return;
    }
    const from = e.target;
    queueMicrotask(() => {
      if (!from.isConnected) return;
      if (owner.current === from) owner.current = null;
      moved.current = null;
    });
  };
  // A drawn entity can leave (a new read, a narrower box). The stop never waits for it to come back, and focus that was in
  // the part stays in the part.
  const orderKey = order.join('\n');
  useLayoutEffect(() => {
    if (!order.includes(stop)) setStop(selected);
    if (focused !== null && !order.includes(focused)) setFocused(null);
    if (hovered !== null && !order.includes(hovered)) setHovered(null);
    const had = owner.current;
    if (!had || had.isConnected || !box) return;
    owner.current = null;
    const on = document.activeElement;
    if (on && on !== document.body) return;
    refs.current.get(selected)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a change of what is drawn
  }, [orderKey]);
  if (!at) return null;

  const press = (id: string) => {
    if (id === selected) return;
    moved.current = id;
    onSelect(id);
  };
  const go = (id: string) => {
    setStop(id);
    refs.current.get(id)?.focus();
  };
  const onKey = (e: KeyboardEvent, id: string) => {
    const i = order.indexOf(id);
    const ring = order.length - 1;
    let to: string | undefined;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = i === 0 ? order[ring > 0 ? 1 : 0] : order[(i % ring) + 1];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = i === 0 ? order[ring] : order[((i - 2 + ring) % ring) + 1];
    else if (e.key === 'Home') to = order[0];
    else if (e.key === 'End') to = order[ring];
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      press(id);
      return;
    } else return;
    e.preventDefault();
    if (to !== undefined) go(to);
  };

  const spokeOf = (id: string) => at.spokes.find((x) => x.node.id === id);
  const about = (id: string | null): string => {
    const spoke = id === null ? undefined : spokeOf(id);
    if (spoke) return sentences(at.center.node.label, spoke.node.label, spoke.relations);
    const n = formatNumber(at.links);
    const links = at.links === 0 ? t('none') : at.links === 1 ? t('one') : t('many', { n });
    return `${at.center.node.label}: ${links}`;
  };

  return (
    <div ref={setBox} className={s.box} data-kit="node-link" onFocus={onBoxFocus} onBlur={onBoxBlur}>
      <svg className={s.draw} width={at.width} height={at.height} viewBox={`0 0 ${at.width} ${at.height}`} role="group" aria-label={label}>
        {at.spokes.map((x) => (
          <line key={x.node.id} className={s.spoke} x1={at.center.x} y1={at.center.y} x2={x.x} y2={x.y} />
        ))}
        {at.spokes.map((x) => (x.mid ? (
          <text key={x.node.id} className={s.relation} x={x.mid.x} y={x.mid.y} textAnchor="middle">{x.mid.shown}</text>
        ) : null))}
        {[at.center, ...at.spokes].map((x, i) => {
          const id = x.node.id;
          const spoke = i > 0 ? (x as (typeof at.spokes)[number]) : null;
          return (
            <g
              key={id}
              ref={(el) => { if (el) refs.current.set(id, el); else refs.current.delete(id); }}
              className={spoke ? s.node : `${s.node} ${s.center}`}
              data-part={spoke ? 'neighbour' : 'center'}
              role="button"
              tabIndex={id === current ? 0 : -1}
              aria-current={spoke ? undefined : 'true'}
              aria-label={spoke ? `${spoke.node.label}, ${about(id)}` : about(null)}
              onClick={() => { setStop(id); press(id); }}
              onKeyDown={(e) => onKey(e, id)}
              onFocus={() => { setStop(id); setFocused(id); }}
              onBlur={() => setFocused(null)}
              onPointerEnter={() => setHovered(id)}
              onPointerLeave={() => setHovered(null)}
            >
              <circle className={s.hit} cx={x.x} cy={x.y} r={HIT_R} />
              <circle className={s.ring} cx={x.x} cy={x.y} r={(spoke ? NODE_R : CENTER_R) + RING_GAP} />
              <circle className={spoke ? s.dot : s.centerDot} cx={x.x} cy={x.y} r={spoke ? NODE_R : CENTER_R} />
              <text
                className={spoke ? s.label : s.centerLabel}
                x={spoke ? spoke.labelX : x.x}
                y={spoke ? spoke.labelY : x.y + 2 * CENTER_R + 4}
                textAnchor={spoke ? spoke.anchor : 'middle'}
              >
                {x.shown}
              </text>
            </g>
          );
        })}
      </svg>
      <p className={s.about} data-part="about">{about(hovered ?? focused)}</p>
      {at.more > 0 ? (
        <p className={s.more} data-part="more">{at.more === 1 ? t('moreOne') : t('moreMany', { n: formatNumber(at.more) })}</p>
      ) : null}
    </div>
  );
}
