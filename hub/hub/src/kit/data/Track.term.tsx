// Track in the terminal: the steps of a guided setup, one row each, on one spine of marks. Exactly one step is open,
// as on the web, and it is the one framed card: its name and tags, its why, its body, then a rule and its foot (what a
// press does, the quiet button, the one primary, never cut). A closed step is one line: its mark, its name and what it
// ends with. A row that can open is a button (Enter or a click); opening it moves the focus to the opened step's
// heading, as the web does.
// Every state reads without colour: done `✓`, unknown `░` with its "Can't tell" tag, now and later their number (now
// bold), wait its number and the word "Waiting" at the row's end. A warning or danger on a step puts `!` or `✗` in the
// mark's place. A closed row's tail (result, Optional, Can't tell, Waiting) is plain words, all ending at one edge. `flat`: every step shows its body unframed; only the open one is framed. Under 75 cells of the track's own
// width (the web's 600 px) the open step drops its mark and takes the full width, its tags go above its name and its
// foot stacks. On a wide screen the why and the foot's sentence keep the web's reading width (64 cells).
import { Children, createContext, isValidElement, useContext, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type * as Web from './Track';
import { Box, Text, useBoxSize } from '@term/prim';
import { Pressable, type Colour, type Focusable } from '@term/kit';
import { say } from '../layouts/termParts';
import { useStrings } from '../strings';
import { Tag } from './Display';
import { Flow } from './termFlow';
import { firstNowStep } from './Track.pure';
import strings from './Track.strings.en.json';

export type { TrackState, TrackStepFoot, TrackStepProps, TrackProps } from './Track';
export { firstNowStep } from './Track.pure';

/** The web's container rule (`width < 600px`) in cells. */
const NARROW_BELOW = 75;
/** The web's reading width for a step's why and its foot's sentence (`max-width: 64ch`). */
const READ_MAX = 64;
/** The spine: the step's mark (two cells for 10 and over), a blank. */
const SPINE = 3;

interface StepCtx {
  n: number;
  open: boolean;
  flat: boolean;
  level: 2 | 3 | 4 | 5 | 6;
  narrow: boolean;
  /** The person opened this step just now: its heading takes the focus, as the row they pressed is gone. */
  focus: boolean;
  onOpen: () => void;
}

const Ctx = createContext<StepCtx | null>(null);

const TONE_MARK = { warn: '!', danger: '✗' } as const;

function Mark({ state, n, tone, optional }: { state: Web.TrackState; n: number; tone?: 'warn' | 'danger'; optional?: boolean }): ReactElement {
  // A tone takes the mark's place, as the web fills the node with it.
  const mark = tone ? TONE_MARK[tone] : state === 'done' ? '✓' : state === 'unknown' ? '░' : String(n);
  const colour: Colour = tone ?? (state === 'done' ? 'ok' : state === 'now' ? 'ink' : optional || state !== 'later' ? 'faint' : 'muted');
  return (
    <Box dir="row" width={SPINE} shrink={0} sem={{ hidden: true }}>
      <Text colour={colour} bold={state === 'now' || tone !== undefined}>{mark.padStart(2, ' ')}</Text>
    </Box>
  );
}

export const TrackStep: typeof Web.TrackStep = ({ id, state, tone, optional, name, result, why, tags, foot, children }) => {
  const ctx = useContext(Ctx);
  const t = useStrings(strings);
  const heading = useRef<Focusable | null>(null);
  const focus = ctx?.focus ?? false;
  useEffect(() => {
    if (focus) heading.current?.focus();
  }, [focus]);
  if (!ctx) return null;
  const { n, open, flat, level, narrow, onOpen } = ctx;
  const stateWord = t(`track.state.${state}`);
  const said = `${name}${t('track.state.sr', { state: stateWord })}`;
  const unknownTag = state === 'unknown' ? <Tag>{t('track.state.unknown')}</Tag> : null;
  const optionalTag = optional ? <Tag>{t('track.optional')}</Tag> : null;
  const shown = open || flat;
  const canOpen = !flat && !open && (children != null || why != null || foot != null);
  if (!shown) {
    const muted = state === 'later' || state === 'wait';
    const row = (focused: boolean): ReactNode => (
      <>
        <Mark state={state} n={n} tone={tone} optional={optional} />
        <Box dir="row" grow={1} shrink={1}>
          <Text colour={focused ? 'focus' : muted ? 'muted' : 'ink'} bold={state === 'now'} underline={focused} truncate>{name}</Text>
        </Box>
        <Box dir="row" gap={1} shrink={0}>
          {state === 'unknown' && <Text colour="muted">{stateWord}</Text>}
          {optional && <Text colour="faint">{t('track.optional')}</Text>}
          {state === 'wait' && <Text colour="muted">{stateWord}</Text>}
          {state === 'done' && result != null && say(result, { colour: 'muted' })}
        </Box>
      </>
    );
    return canOpen ? (
      <Pressable dir="row" gap={1} shrink={0} onPress={onOpen} sem={{ role: 'button', name: said, expanded: false }}>
        {({ focused }) => row(focused)}
      </Pressable>
    ) : (
      <Box dir="row" gap={1} shrink={0} sem={{ role: 'listitem', name: said }}>{row(false)}</Box>
    );
  }
  const anyTag = tags != null || unknownTag !== null || optionalTag !== null;
  const tagRow = anyTag && <Box dir="row" gap={1} shrink={0}>{optionalTag}{unknownTag}{tags}</Box>;
  const title = (
    <Pressable dir="row" grow={1} shrink={1} tabStop={false} focusPaint={false} handle={heading} sem={{ role: 'heading', level, name: said }}>
      <Text colour="ink" bold>{name}</Text>
    </Pressable>
  );
  const hasFoot = foot != null && (foot.say != null || foot.primary != null || foot.secondary != null);
  const actions = foot != null && (foot.primary != null || foot.secondary != null) && (
    <Box dir="row" gap={1} shrink={0}>{foot.secondary}{foot.primary}</Box>
  );
  const inner = (
    <>
      {narrow && open ? <Box dir="column" shrink={0}>{tagRow}{title}</Box> : <Box dir="row" gap={2} shrink={0}>{title}{tagRow}</Box>}
      {why != null && <Box dir="column" shrink={1} maxWidth={READ_MAX}><Flow colour="muted">{why}</Flow></Box>}
      {children != null && <Box dir="column" shrink={0} pad={{ top: 1 }}>{children}</Box>}
      {hasFoot && (
        <Box dir={narrow ? 'column' : 'row'} gap={narrow ? 0 : 2} shrink={0} border={open ? ['top'] : false} borderColour="line" pad={open ? undefined : { top: 1 }}>
          <Box dir="column" grow={1} shrink={1}>{foot.say != null && <Box dir="column" shrink={1} maxWidth={READ_MAX}><Flow colour="muted">{foot.say}</Flow></Box>}</Box>
          {actions}
        </Box>
      )}
    </>
  );
  const frame: Colour = tone ?? 'lineStrong';
  return (
    <Box dir="row" gap={1} shrink={0} sem={{ role: 'listitem' }}>
      {!(narrow && open) && <Mark state={state} n={n} tone={tone} optional={optional} />}
      {open ? (
        <Box dir="column" grow={1} shrink={1} border borderColour={frame} padX={1} sem={{ role: 'region', name: said }}>{inner}</Box>
      ) : (
        <Box dir="column" grow={1} shrink={1} pad={{ bottom: 1 }}>{inner}</Box>
      )}
    </Box>
  );
};

function stepsOf(children: ReactNode): ReactElement<Web.TrackStepProps>[] {
  return Children.toArray(children).filter((c): c is ReactElement<Web.TrackStepProps> => isValidElement(c) && c.type === TrackStep);
}

export const Track: typeof Web.Track = ({ label, open, onOpen, defaultOpen, flat = false, level = 3, children }) => {
  const steps = stepsOf(children);
  const [own, setOwn] = useState<string | null>(() => (defaultOpen !== undefined ? defaultOpen : firstNowStep(steps.map((c) => c.props))));
  const [moved, setMoved] = useState<string | null>(null);
  const [size, onSize] = useBoxSize();
  const narrow = size !== null && size.width < NARROW_BELOW;
  const current = open !== undefined ? open : own;
  // A focus request lives for the one render that follows the press (the web's rule): the step it opened takes the
  // focus in that render's effects; a request the page declined is dropped.
  useEffect(() => {
    if (moved !== null) setMoved(null);
  }, [moved]);
  return (
    <Box dir="column" shrink={0} onSize={onSize} sem={{ role: 'list', name: label }}>
      {steps.map((c, i) => {
        const id = c.props.id;
        const ctx: StepCtx = {
          n: i + 1,
          open: current === id,
          flat,
          level,
          narrow,
          focus: moved === id && current === id,
          onOpen: () => {
            setMoved(id);
            if (open === undefined) setOwn(id);
            onOpen?.(id);
          },
        };
        return <Ctx.Provider key={id} value={ctx}>{c}</Ctx.Provider>;
      })}
    </Box>
  );
};
