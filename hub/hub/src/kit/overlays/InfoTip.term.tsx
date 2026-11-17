// InfoTip in the terminal: the one "what is this" affordance.
//   Icon form: "ⓘ" after a label. Term form (children): the words are the trigger, underlined.
// Decided for the terminal (no hover intent, no pointer to rest):
//   - Focus on the trigger shows the tip (a glance: no keys taken, Tab goes on, the tip goes with the focus).
//   - Enter, Space, "?" or "i" on the trigger, or a press, pins it: a small popover with the text and the FAQ link,
//     keys inside (Tab reaches the link), Esc or a press outside closes it and the focus is back on the trigger. A second
//     press closes a pinned tip. The pointer resting on the trigger also shows it.
//   - Esc on a shown tip hides it until the focus leaves and comes back. One InfoTip shows at a time.
// Placement is the web's: at the end of the trigger when 35 columns fit there, else below; clamped inside the screen.
// Narrow terminals (the rule for every overlay; no phone sheet or tray): a Drawer goes full screen when it does not fit;
// a Popover, Menu, InfoTip or Tooltip stays anchored and is clamped inside the screen; a Dialog is clamped to the width.
import { focusInk } from '../../term/prim/FocusInk';
import { isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import type * as Web from './InfoTip';
import { FaqLink } from '../layouts/Faq';
import { useStrings } from '../strings';
import strings from './InfoTip.strings.en.json';
import { Box, Pressable, Text, type Focusable } from '../../term/prim';
import { Layer, useAnchor } from '../../term/prim/Overlay';

export type { InfoTipProps, InfoLineProps } from './InfoTip';

export const INFO_TIP_MAX = 200;
/** The tip's widest size in columns (the web's 280 px). */
const TIP_COLS = 35;

export const plainText: typeof Web.plainText = (node: ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(plainText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return plainText(node.props.children);
  return '';
};

type Mode = 'glance' | 'pinned';
/** The shown InfoTip, if any: showing another hides it. */
let current: { hide: () => void } | null = null;

export const InfoTip: typeof Web.InfoTip = ({ text, subject, faq, children }) => {
  const t = useStrings(strings);
  const [mode, setMode] = useState<Mode | null>(null);
  const [hover, setHover] = useState(false);
  const [muted, setMuted] = useState(false);
  const handle = useRef<Focusable | null>(null);
  const anchor = useAnchor();
  const self = useRef({ hide: () => { setMode(null); setHover(false); } });
  const term = children !== undefined && children !== null;
  const show = (m: Mode) => {
    if (current && current !== self.current) current.hide();
    current = self.current;
    setMode(m);
  };
  const hide = () => {
    if (current === self.current) current = null;
    setMode(null);
  };
  useEffect(() => () => { if (current === self.current) current = null; }, []);
  const shown = mode ?? (hover ? 'glance' : null);
  const width = Math.min(TIP_COLS, Math.max(text.length, faq ? faq.label.length : 0) + 4);
  const body = (
    <>
      <Text>{text}</Text>
      {faq ? <Box dir="row"><FaqLink item={faq.item}>{faq.label}</FaqLink></Box> : null}
    </>
  );
  return (
    <>
      <Box boxRef={anchor.ref} dir="row" shrink={0} raw={{ onMouseOver: () => setHover(true), onMouseOut: () => setHover(false) }}>
        <Pressable
          dir="row"
          shrink={0}
          handle={handle}
          sem={{ name: term ? (plainText(children) || subject || t('info.more')) : subject ? t('info.about', { subject }) : t('info.more'), expanded: shown !== null }}
          onPress={() => (mode === 'pinned' ? hide() : show('pinned'))}
          onFocusChange={(f) => {
            if (f && !muted && mode === null) show('glance');
            if (!f) { setMuted(false); if (mode === 'glance') hide(); }
          }}
          onKey={(k) => {
            if (k.sequence === '?' || k.name === 'i') { show('pinned'); return true; }
            if (k.name === 'escape' && mode === 'glance') { setMuted(true); hide(); return true; }
            return false;
          }}
        >
          {({ focused }) =>
            term ? (
              <Text underline {...focusInk(focused)}>{children}</Text>
            ) : (
              <Text colour={shown ? 'focus' : 'muted'} {...focusInk(focused)}>ⓘ</Text>
            )
          }
        </Pressable>
      </Box>
      <Layer
        open={shown !== null}
        kind={shown === 'pinned' ? 'popover' : 'tip'}
        place={{ at: 'anchor', anchor: anchor.rect, side: 'end', fallback: 'bottom', align: 'start', width }}
        frameTitle={term ? undefined : subject ? t('info.about', { subject }) : t('info.more')}
        padX={1}
        sem={{ role: shown === 'pinned' ? 'dialog' : 'tooltip', name: text }}
        initialFocus="none"
        onEscape={() => { setMuted(true); hide(); setHover(false); }}
        onOutside={() => { hide(); setHover(false); }}
      >
        {body}
      </Layer>
    </>
  );
};

export const InfoLine: typeof Web.InfoLine = ({ tip, subject, children }) => {
  if (!tip) return <>{children}</>;
  return (
    <Box dir="row" gap={1}>
      {typeof children === 'string' ? <Text>{children}</Text> : children}
      <InfoTip text={tip} subject={subject} />
    </Box>
  );
};
