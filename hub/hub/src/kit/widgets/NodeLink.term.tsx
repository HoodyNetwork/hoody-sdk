// NodeLink in the terminal: one entity and its links as a short tree instead of a ring (a ring of labels does not fit
// cells). The selected entity is the first row with its count of links; each linked entity is a branch that says the
// relation and its direction in words and an arrow (`runs →` from the centre, `← lives on` toward it), then the
// entity's name. The same rules as the web drawing (nodeLink.layout.ts): at most 12 links drawn, 8 under 500 px of the
// part's own width (62 cells), the rest counted in a line that always shows; an entity not in the read draws nothing.
// Keys as on the web: one Tab stop (the entity last reached, else the centre); arrows move between entities, Home goes
// to the centre, End to the last; Enter, Space or a click on a linked entity asks the caller to select it, and the
// focus stays on it once it is the centre. Under the tree, one line says the focused link as a sentence, else the
// centre's count. The web file reads `document` and draws an svg: neither exists here.
import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Web from './NodeLink';
import { Box, Text, cellWidth, useBoxSize } from '@term/prim';
import { Pressable, type Focusable, type Key } from '@term/kit';
import { formatNumber } from '../format';
import { useStrings } from '../strings';
import { nodeLinkLayout, type NodeLinkRelation } from './nodeLink.layout';
import strings from './NodeLink.strings.en.json';

export type { NodeLinkNode, NodeLinkEdge, NodeLinkProps } from './NodeLink';

/** A cell as the layout's pixels (8 px a cell), so its narrow rule and its limits are the web's. */
const CELL_PX = 8;
/** The part's width before it is measured (the web's own fallback, 640 px). */
const UNMEASURED = 80;

/** "a uses b; b reads a": who did what, from the words the graph holds (the web's sentence). */
function sentences(center: string, other: string, relations: readonly NodeLinkRelation[]): string {
  return relations.map((r) => (r.outgoing ? `${center} ${r.relation} ${other}` : `${other} ${r.relation} ${center}`)).join('; ');
}

/** A branch's words: every relation with its direction, seen from the centre. */
function relationWords(relations: readonly NodeLinkRelation[]): string {
  return relations.map((r) => (r.outgoing ? `${r.relation} →` : `← ${r.relation}`)).join(', ');
}

export const NodeLink: typeof Web.NodeLink = ({ nodes, edges, selected, onSelect, label }) => {
  const t = useStrings(strings);
  const [size, onSize] = useBoxSize();
  const cells = size?.width ?? UNMEASURED;
  const at = useMemo(() => nodeLinkLayout(nodes, edges, selected, cells * CELL_PX, (text) => cellWidth(text) * CELL_PX), [nodes, edges, selected, cells]);

  // One keyboard stop: the entity last reached, else the centre.
  const [stop, setStop] = useState(selected);
  const [focused, setFocused] = useState<string | null>(null);
  const order = at ? [at.center.node.id, ...at.spokes.map((x) => x.node.id)] : [];
  const current = order.includes(stop) ? stop : selected;
  const handles = useRef(new Map<string, { current: Focusable | null }>());
  const handleOf = (id: string): { current: Focusable | null } => {
    let h = handles.current.get(id);
    if (!h) { h = { current: null }; handles.current.set(id, h); }
    return h;
  };
  // A move this part asked for keeps the focus on the entity moved to, now the centre, once the caller accepts it.
  const moved = useRef<string | null>(null);
  useEffect(() => {
    const asked = moved.current;
    moved.current = null;
    if (asked !== selected) return;
    setStop(selected);
    handles.current.get(selected)?.current?.focus();
  }, [selected]);
  // A drawn entity can leave (a new read, a narrower part): the stop never waits for it to come back.
  const orderKey = order.join('\n');
  useEffect(() => {
    for (const id of [...handles.current.keys()]) if (!order.includes(id)) handles.current.delete(id);
    if (focused !== null && !order.includes(focused)) setFocused(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a change of what is drawn
  }, [orderKey]);
  if (!at) return <Box onSize={onSize} />;

  const press = (id: string) => {
    setStop(id);
    if (id === selected) return;
    moved.current = id;
    onSelect(id);
  };
  const go = (id: string) => {
    setStop(id);
    handles.current.get(id)?.current?.focus();
  };
  const onKey = (k: Key, id: string): boolean => {
    if (k.ctrl || k.meta) return false;
    const i = order.indexOf(id);
    const ring = order.length - 1;
    let to: string | undefined;
    if (k.name === 'right' || k.name === 'down') to = i === 0 ? order[ring > 0 ? 1 : 0] : order[(i % ring) + 1];
    else if (k.name === 'left' || k.name === 'up') to = i === 0 ? order[ring] : order[((i - 2 + ring) % ring) + 1];
    else if (k.name === 'home') to = order[0];
    else if (k.name === 'end') to = order[ring];
    else return false;
    if (to !== undefined) go(to);
    return true;
  };

  const spokeOf = (id: string) => at.spokes.find((x) => x.node.id === id);
  const about = (id: string | null): string => {
    const spoke = id === null ? undefined : spokeOf(id);
    if (spoke) return sentences(at.center.node.label, spoke.node.label, spoke.relations);
    const n = formatNumber(at.links);
    const links = at.links === 0 ? t('none') : at.links === 1 ? t('one') : t('many', { n });
    return `${at.center.node.label}: ${links}`;
  };
  const stopProps = (id: string) => ({
    tabStop: id === current,
    handle: handleOf(id),
    onKey: (k: Key) => onKey(k, id),
    onFocusChange: (on: boolean) => { if (on) { setStop(id); setFocused(id); } else setFocused((f) => (f === id ? null : f)); },
  });

  return (
    <Box dir="column" shrink={0} onSize={onSize}>
      <Box dir="column" shrink={0} sem={{ role: 'group', name: label }}>
        <Pressable dir="row" gap={1} shrink={0} {...stopProps(at.center.node.id)} onPress={() => press(at.center.node.id)}
          sem={{ role: 'button', name: about(null), current: true }}>
          {({ focused: on }) => (
            <>
              <Text colour={on ? 'focus' : 'acc'} bold shrink={0}>◉</Text>
              <Text colour={on ? 'focus' : 'ink'} bold underline={on} truncate>{at.center.node.label}</Text>
            </>
          )}
        </Pressable>
        {at.spokes.map((x, i) => (
          <Pressable key={x.node.id} dir="row" gap={1} shrink={0} {...stopProps(x.node.id)} onPress={() => press(x.node.id)}
            sem={{ role: 'button', name: `${x.node.label}, ${about(x.node.id)}` }}>
            {({ focused: on }) => (
              <>
                <Text colour="lineStrong" shrink={0}>{i === at.spokes.length - 1 ? '└─' : '├─'}</Text>
                <Text colour="muted" shrink={0}>{relationWords(x.relations)}</Text>
                <Text colour={on ? 'focus' : 'faint'} shrink={0}>○</Text>
                <Text colour={on ? 'focus' : 'ink'} underline={on} truncate>{x.node.label}</Text>
              </>
            )}
          </Pressable>
        ))}
      </Box>
      <Text colour="muted">{about(focused)}</Text>
      {at.more > 0 ? <Text colour="muted">{at.more === 1 ? t('moreOne') : t('moreMany', { n: formatNumber(at.more) })}</Text> : null}
    </Box>
  );
};
