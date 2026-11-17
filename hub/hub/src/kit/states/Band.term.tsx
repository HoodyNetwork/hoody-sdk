// Band and Notice in the terminal. Band: the tone's mark (its icon glyph: i ! ✗, the pending ◷), the sentence, the
// actions and Details, then the close; `page` size has a tone-coloured start rule, `table` is one plain line, `flush`
// a row inside a table's frame with a hairline under it. The same C9 rules as the web: facts saying pending turn the
// band warn with the pending mark, swap the actions for `pendingActions` and drop the close; `held` (a held change,
// kit HeldBand; the web's data-outcome="pending") gives the band the pending mark alone. `attach`: the field,
// then the band under it in the `table` look; with nothing to say (no sentence, action, rejection or close) the field
// alone, in the same wrap so it never remounts while the person types (the web's quiet attach). Every tone reads without
// colour (the mark carries it). `over` (the web lays the band over a frame's top edge) is drawn in flow where it is
// placed: see Band.scenario.ts. Notice: the mark, then the sentence; `block` stacks structured content under an
// optional `title` heading.
import type * as Web from './Band';
import { IconButton } from '../controls/Button';
import { Icon, type IconName } from '../icons';
import { ICON_GLYPHS } from '../icons.glyphs';
import { OUTCOME_ICON } from '../outcome';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import { Box, Text, type Colour } from '../../term/prim';
import { ErrorDetails } from './ErrorDetails';
import { errorSentence, pendingFacts, useErrorInfo } from './errorDetails.pure';
import { Inline } from '../layouts/termParts';
import stateStrings from './strings.en.json';
import { FlushHostCtx } from './flushHost';
import { useHeadingLevel } from '../layouts/anatomy/Heading';
import { useContext, useEffect } from 'react';

export type { BandProps, BandTone, NoticeLevel, NoticeProps } from './Band';

const ICON: Record<Web.BandTone, IconName> = { neutral: 'info', accent: 'info', warn: 'warn', danger: 'error' };
const COLOUR: Record<Web.BandTone, Colour> = { neutral: 'blueText', accent: 'blueText', warn: 'warn', danger: 'danger' };

/** The mark's icon: the caller's when the terminal has a sign for it, else the tone's own. An icon that draws nothing
 *  here (a page or object mark: database, key) would leave only its accessible label, and the label is the tone's
 *  name: AI Memory's place band read "neutral Realm Personal · …". */
const markIcon = (given: IconName | undefined, own: IconName): IconName => (given && ICON_GLYPHS[given]?.kind !== 'none' ? given : own);

export const Band: typeof Web.Band = ({ tone: given = 'neutral', size: givenSize = 'page', icon, children, actions: givenActions, onDismiss, error, errorWords, pendingActions, flush, attach, held = false }) => {
  const t = useStrings(kitStrings);
  const ts = useStrings(stateStrings);
  // A flush Band frames itself: it tells the container it sits in (a DataTable group note) to draw no frame around it.
  const flushHost = useContext(FlushHostCtx);
  useEffect(() => {
    if (!flush || !flushHost) return undefined;
    flushHost(1);
    return () => flushHost(-1);
  }, [flush, flushHost]);
  const info = useErrorInfo(error);
  const pending = pendingFacts(info);
  const tone: Web.BandTone = pending ? 'warn' : given;
  const size = attach ? 'table' : givenSize;
  const text = (pending ? undefined : children) ?? (info ? errorSentence(info, errorWords, ts) : null);
  const actions = pending ? pendingActions : givenActions;
  const band = (
    <Box dir="row" gap={1} shrink={0} padX={size === 'page' && !flush ? 1 : 0} sem={{ role: attach || tone === 'neutral' || tone === 'accent' ? 'status' : 'alert' }}
      border={flush ? ['bottom'] : size === 'page' ? ['left'] : false} borderColour={flush ? 'line' : COLOUR[tone]}>
      {/* The mark never shrinks: in a narrow pane a squeezed mark vanished and the tone went with it. */}
      <Text colour={COLOUR[tone]} bold shrink={0}><Icon name={pending || held ? OUTCOME_ICON.pending : markIcon(icon, ICON[tone])} label={tone} /></Text>
      {/* The web's wrap (Band.module.css): the sentence keeps a readable measure (flex 1 1 240px, 160px when flush);
          actions that do not fit beside it go under it as a group, then wrap among themselves. */}
      <Box dir="row" wrap gapX={1} grow={1} shrink={1}>
        <Box dir="column" grow={1} shrink={1} basis={flush ? 20 : 30}>{text !== null && text !== undefined && <Inline colour="ink">{text}</Inline>}</Box>
        {(actions || info) && <Box dir="row" wrap gapX={2} shrink={1}>{actions}{info && <ErrorDetails error={info} mode="button" />}</Box>}
        {onDismiss && !pending && <IconButton size="sm" icon="x" onPress={onDismiss} label={t('action.close')} />}
      </Box>
    </Box>
  );
  if (!attach) return band;
  const quiet = text == null && actions == null && !info && !(onDismiss && !pending);
  return <Box dir="column" shrink={0}>{attach}{quiet ? null : band}</Box>;
};

export const Notice: typeof Web.Notice = ({ level = 'calm', icon, inline = false, width, block = false, title, children }) => {
  const headingLevel = Math.min(6, useHeadingLevel() + 1);
  const name = icon === null ? null : markIcon(icon, level === 'warn' ? 'warn' : 'info');
  const mark = name ? <Text colour={level === 'warn' ? 'warn' : 'muted'} bold><Icon name={name} label={level} /></Text> : null;
  if (inline) return <Box dir="row" gap={1}>{mark}<Inline colour={level === 'warn' ? 'warn' : 'muted'}>{children}</Inline></Box>;
  if (block) {
    // Structured content (a heading, a list, paragraphs) stacked beside the mark, which stays on the first line. A
    // title is the body's heading, one level below its context, and names the notice as a group (never a live region).
    return (
      <Box dir="row" gap={1} shrink={0} maxWidth={width === 'measure' ? 72 : undefined} {...(title ? { sem: { role: 'group' as const, name: title } } : {})}>
        {mark}
        <Box dir="column" grow={1} shrink={1}>
          {title ? <Text bold colour="ink" sem={{ role: 'heading', level: headingLevel, name: title }}>{title}</Text> : null}
          {typeof children === 'string' ? <Inline colour="ink">{children}</Inline> : children}
        </Box>
      </Box>
    );
  }
  return (
    // `measure`: no wider than a line of reading text (72 columns).
    <Box dir="row" gap={1} shrink={0} maxWidth={width === 'measure' ? 72 : undefined}>
      {mark}
      <Box dir="column" grow={1} shrink={1}><Inline colour="ink">{children}</Inline></Box>
    </Box>
  );
};
