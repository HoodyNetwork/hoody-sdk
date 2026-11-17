// The page's questions in the terminal: a "Questions" section with one fold per item (▸ question / ▾ question, the
// answer and its link under it). A location naming an item (#faq-<id>) opens it and brings it into view (the web's
// landing); #faq brings the section. FaqLink: a link-look button; when the question is on the page and in sight it
// lands there (pushes the anchor), otherwise (in an overlay, in a pane hidden at this size, on another page) it unfolds
// the answer in place (the web's peek).
import { useEffect, useState, type ReactNode } from 'react';
import type * as Web from './Faq';
import { Link } from '../controls/Link';
import { useFaqPush, useLocationEntry, useLocationHash } from '../nav';
import { useStrings } from '../strings';
import strings from '../strings.en.json';
import { Box, Text, useFocusable, useFocusControl } from '../../term/prim';
import { useFocusSem } from './termParts';
import { isFaqHash as isHash, targetOf, validate } from './faq.pure';
import { revealAnchor } from './termScroll';
import { useLayer } from '../../term/prim/Overlay';
import { focusInk } from '@term/kit';

export type { FaqItem, FaqSpec, FaqProps, FaqLinkProps } from './Faq';
export const isFaqHash: typeof Web.isFaqHash = isHash;

const anchorId = (id: string): string => `faq-${id}`;
/** Items open now, by id, per page section (a re-render keeps them; a landing opens one). */
/** Reading widths, as the web's (Faq.module.css: an answer 62ch, a peeked answer 56ch): an answer never runs the
 *  width of a big terminal. */
const ANSWER_COLS = 62;
const PEEK_COLS = 56;


function Item({ item, open, onToggle }: { item: Web.FaqItem; open: boolean; onToggle: () => void }): ReactNode {
  const f = useFocusable({ domId: anchorId(item.id), onKey: (k) => (k.name === 'return' || k.name === 'space' ? (onToggle(), true) : false) });
  // The web's Disclosure: a button named by the question, expanded while its answer shows.
  const ref = useFocusSem(f, { role: 'button', name: item.q, expanded: open });
  return (
    <Box dir="column" shrink={0} raw={{ id: anchorId(item.id) }}>
      <Box dir="row" boxRef={ref} onPress={() => { f.focus(); onToggle(); }}>
        <Text colour="ink" {...focusInk(f.focused)}>{open ? '▾ ' : '▸ '}{item.q}</Text>
      </Box>
      {open && (
        <Box dir="column" pad={{ left: 2 }} maxWidth={ANSWER_COLS + 2}>
          <Text colour="muted">{item.a}</Text>
          {item.action && <Box dir="row"><Link href={item.action.href}>{`${item.action.label} ›`}</Link></Box>}
        </Box>
      )}
    </Box>
  );
}

export const Faq: typeof Web.Faq = ({ faq, titleLevel = 2 }) => {
  const t = useStrings(strings);
  if (import.meta.env.DEV) validate(faq.items);
  const hash = useLocationHash();
  const entry = useLocationEntry();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const focus = useFocusControl();
  // Landing: each new history entry naming the questions opens its item and reveals it (or the section). The focus
  // moves there too (the web's fragment navigation sets the sequential-focus start): the item's question, or the
  // first question for the section, so the link that led here is not left focused off screen.
  useEffect(() => {
    const target = targetOf(hash);
    if (!target) return;
    const item = target.kind === 'item' && faq.items.some((x) => x.id === target.id) ? target.id : null;
    if (item) setOpen((s) => new Set(s).add(item));
    const id = setTimeout(() => {
      revealAnchor(target.kind === 'item' ? anchorId(target.id) : 'faq');
      const to = target.kind === 'item' ? item : faq.items[0]?.id;
      if (to) focus.focusDomId(anchorId(to));
    }, 0);
    return () => clearTimeout(id);
  }, [hash, entry, faq.items, focus]);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <Box dir="column" shrink={0} pad={{ top: 1 }} raw={{ id: 'faq' }} sem={{ role: 'region', name: t('faq.title') }}>
      <Text bold colour="ink" sem={{ role: 'heading', level: titleLevel, name: t('faq.title') }}>{t('faq.title')}</Text>
      {faq.items.map((x) => <Item key={x.id} item={x} open={open.has(x.id)} onToggle={() => toggle(x.id)} />)}
    </Box>
  );
};

export const FaqLink: typeof Web.FaqLink = ({ item, children }) => {
  const push = useFaqPush();
  const [peek, setPeek] = useState(false);
  // Inside an overlay (a drawer, a dialog) the page lies under it: a landing there opens the answer where nobody sees
  // it, so the link peeks, as the web's does inside an overlay.
  const layer = useLayer();
  const f = useFocusable({ onKey: (k) => (k.name === 'return' || k.name === 'space' ? (press(), true) : false) });
  function press(): void {
    // On the page and in sight: land on it. Not reachable (an overlay, another pane, a pane hidden at this size):
    // unfold the answer here.
    if (!peek && layer === null && revealAnchor(anchorId(item.id), 'nearest')) push(item.id);
    else setPeek((p) => !p);
  }
  const ref = useFocusSem(f, { role: 'link', ...(typeof children === 'string' ? { name: children } : {}) });
  return (
    <Box dir="column" shrink={0}>
      <Box dir="row" boxRef={ref} onPress={() => { f.focus(); press(); }}>
        <Text colour="blueText" underline {...focusInk(f.focused)}>{children}</Text>
      </Box>
      {peek && (
        <Box dir="column" border={['left']} borderColour="line" pad={{ left: 1 }} maxWidth={PEEK_COLS + 2}>
          <Text colour="muted">{item.a}</Text>
          {item.action && <Box dir="row"><Link href={item.action.href}>{`${item.action.label} ›`}</Link></Box>}
        </Box>
      )}
    </Box>
  );
};
