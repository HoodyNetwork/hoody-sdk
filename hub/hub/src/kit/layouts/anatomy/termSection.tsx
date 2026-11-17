// The strict section's card in the terminal, shared by AnatomySection (Section.term.tsx) and SettingsPage's sections
// (Layouts.term.tsx), as the web shares its head and body rules: title + whole count + About, the ActionBar (the
// primary held off while nothing is read, moved into the empty state when empty), description, notices, promise, the
// state's body (StateBody), note. A danger tone colours the frame and puts '!' before the title (reads in mono).
// `anchor` is the engine id a scroll owner reveals (SettingsPage's jump, focusSection).
import { useRef, type ReactNode } from 'react';
import type { BoxRenderable } from '../../../term/prim/otui';
import { InfoTip } from '../../overlays/InfoTip';
import { useStrings } from '../../strings';
import { Box, Text } from '../../../term/prim';
import { useTermAnchorId } from '../../../term/jsx/dom';
import type { NodeLike } from '../../../term/jsx/element';
import { Inline } from '../termParts';
import { ActionBar } from './ActionBar';
import { useHeadingLevel, HeadingLevel, StrictScope } from './Heading';
import { headPrimary, primaryMoved } from './section.pure';
import { StateBody } from './StateBody';
import type { EmptySpec, SectionActions, SectionState, WholeCount } from './types';
import strings from './strings.en.json';

export interface TermSectionProps {
  anchor?: string;
  title: string;
  count?: WholeCount;
  info?: string;
  description?: ReactNode;
  actions?: SectionActions;
  notices?: ReactNode;
  promise?: string;
  state?: SectionState;
  empty?: EmptySpec;
  note?: string;
  tone?: 'default' | 'danger';
  flush?: boolean;
  /** The current section of a settings menu: its title carries the '▌' mark. */
  current?: boolean;
  /** A plain head (no frame): SettingsPage sections without slots. */
  frame?: boolean;
  children?: ReactNode;
}

export function TermSection({ anchor, title, count, info, description, actions, notices, promise, state, empty, note, tone = 'default', flush, current, frame = true, children }: TermSectionProps): ReactNode {
  const ts = useStrings(strings);
  const moved = primaryMoved(state, empty);
  const primary = headPrimary(actions?.primary, state, { loading: ts('stillReading'), notRead: ts('notRead') });
  const showCount = count !== undefined && count.total > 0 && (state === undefined || state.kind === 'ready');
  const danger = tone === 'danger';
  const level = Math.min(6, useHeadingLevel() + 1);
  // The web's `flush` takes the padding off the BODY only (lay.flush on .panelBody): the head keeps its padding and the
  // promise and note get it back (s.inset). So a flush card pads those rows itself and leaves the body edge to edge.
  const inset = frame && flush ? 1 : 0;
  // A state the kit draws in words (empty, nothing matches, failed, not here) keeps that inset too: on the web it is the
  // sm state's own padding; here it would sit against the border ("│! This didn't load", "│[Try again]"). A table's
  // states stay edge to edge with the table: the loading rows, and the warn bands over its rows (partial, stale, unknown).
  const worded = inset > 0 && (state?.kind === 'empty' || state?.kind === 'noMatch' || state?.kind === 'failed' || state?.kind === 'notHere');
  const body = <StateBody state={state} empty={empty} primary={actions?.primary}>{children}</StateBody>;
  // `anchor` also answers a #hash jump (the router's HashAnchor), as the web section's DOM id does.
  const box = useRef<BoxRenderable | null>(null);
  useTermAnchorId(anchor, () => box.current as unknown as NodeLike | null);
  return (
    <Box dir="column" shrink={0} sem={{ role: 'region', name: title }} border={frame} borderColour={danger ? 'danger' : current ? 'lineStrong' : 'line'} padX={frame && !flush ? 1 : 0}
      raw={anchor ? { id: anchor } : undefined} boxRef={box}>
      <Box dir="row" wrap gapX={2} justify="between" padX={inset}>
        <Box dir="row" gap={1} shrink={1}>
          {danger && <Text colour="danger" bold>!</Text>}
          <Text bold colour="ink" sem={{ role: 'heading', level, name: title }}>{title}</Text>
          {showCount && <Text colour="muted">{String(count!.total)}</Text>}
          {info && <InfoTip text={info} subject={title} />}
        </Box>
        {actions && <ActionBar label={title} {...actions} primary={primary} withoutPrimary={moved} />}
      </Box>
      {description !== undefined && description !== null && description !== false && <Box dir="column" padX={inset}><Inline>{description}</Inline></Box>}
      {notices}
      {promise && <Box dir="column" padX={inset}><Text colour="muted" italic>{promise}</Text></Box>}
      <HeadingLevel>
        <StrictScope>
          {worded ? <Box dir="column" padX={inset}>{body}</Box> : body}
        </StrictScope>
      </HeadingLevel>
      {note && <Box dir="column" padX={inset}><Text colour="faint">{note}</Text></Box>}
    </Box>
  );
}
