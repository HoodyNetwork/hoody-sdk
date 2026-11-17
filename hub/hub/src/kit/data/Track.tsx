// Track: the steps of a guided setup on one spine, each with a state, at most one of them open. Use StepList instead
// for the numbered how-to rows inside one step (no state, no spine), SystemSteps when one step differs per system.
// A Drawer with primaryOnPhone mirrors the open step's primary in its sticky foot and marks its body
// [data-foot-primary]; Track.module.css then hides the step's own primary, so a panel shows one accent.
import { Children, createContext, isValidElement, useContext, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { cx } from '../controls/Button';
import { Icon } from '../icons';
import { useStrings } from '../strings';
import { SrOnly, Tag } from './Display';
import s from './Track.module.css';
import { firstNowStep, type TrackState } from './Track.pure';
import strings from './Track.strings.en.json';

export type { TrackState } from './Track.pure';
export { firstNowStep } from './Track.pure';

export interface TrackStepFoot {
  /** What happens when you press, or what the person does elsewhere ("Done in Telegram? This step closes once…"). */
  say?: ReactNode;
  /** The one primary button of the panel. */
  primary?: ReactNode;
  /** A quiet button beside it ("Not now" on an optional step). */
  secondary?: ReactNode;
}

export interface TrackStepProps {
  /** A stable id: the open step is named by it. */
  id: string;
  state: TrackState;
  /** A standing condition on the step (rule: a warning about a step is its state, never a Band). */
  tone?: 'warn' | 'danger';
  /** A step the person may skip: a lighter node and an "Optional" tag. */
  optional?: boolean;
  /** The step's name, a few words ("Let it read groups"). */
  name: string;
  /** A done row's result at its end ("T Main", "1 group"). */
  result?: ReactNode;
  /** The open step's one why sentence, 110 characters at most. */
  why?: ReactNode;
  /** Tags at the end of the open step's head (kit Tag). */
  tags?: ReactNode;
  foot?: TrackStepFoot;
  /** The open step's body: a StepList, at most one Why, the field it needs. */
  children?: ReactNode;
}

export interface TrackProps {
  /** The track's accessible name ("Get it working"). */
  label: string;
  /** The open step's id, when the page owns it (a `nextStep(steps)` in its flow file); null opens none. */
  open?: string | null;
  /** Called with a step's id when the person opens it. */
  onOpen?: (id: string) => void;
  /** Uncontrolled: the step open at first. Left out, it is the first step in state `now`. */
  defaultOpen?: string | null;
  /** The form variant: every step shows its body unframed; only the open step is framed. */
  flat?: boolean;
  /** Heading level of a step's name, 2-6 (3 by default). */
  level?: 2 | 3 | 4 | 5 | 6;
  children: ReactNode;
  className?: string;
}

interface StepCtx {
  n: number;
  open: boolean;
  flat: boolean;
  level: 2 | 3 | 4 | 5 | 6;
  /** The person opened this step just now: its heading takes focus, as the row they pressed is gone. */
  focus: boolean;
  onOpen: () => void;
}

const Ctx = createContext<StepCtx | null>(null);

function stepsOf(children: ReactNode): ReactElement<TrackStepProps>[] {
  return Children.toArray(children).filter((c): c is ReactElement<TrackStepProps> => isValidElement(c) && c.type === TrackStep);
}

function TrackRoot({ label, open, onOpen, defaultOpen, flat = false, level = 3, children, className }: TrackProps) {
  const steps = stepsOf(children);
  const [own, setOwn] = useState<string | null>(() => (defaultOpen !== undefined ? defaultOpen : firstNowStep(steps.map((c) => c.props))));
  const [moved, setMoved] = useState<string | null>(null);
  const current = open !== undefined ? open : own;
  // A focus request lives for the one render that follows the press: the step it opened takes focus in that render's
  // effects; a request the page declined (or met later) is dropped, so a later programmatic open never steals focus.
  useEffect(() => {
    if (moved !== null) setMoved(null);
  }, [moved]);
  return (
    <ol className={cx(s.track, flat && s.flat, className)} aria-label={label}>
      {steps.map((c, i) => {
        const id = c.props.id;
        const ctx: StepCtx = {
          n: i + 1,
          open: current === id,
          flat,
          level,
          focus: moved === id && current === id,
          onOpen: () => {
            setMoved(id);
            if (open === undefined) setOwn(id);
            onOpen?.(id);
          },
        };
        return (
          <Ctx.Provider key={id} value={ctx}>
            {c}
          </Ctx.Provider>
        );
      })}
    </ol>
  );
}

function Node({ state, n, optional }: { state: TrackState; n: number; optional?: boolean }) {
  return (
    <span className={cx(s.node, optional && s.nodeOptional)} aria-hidden="true">
      {state === 'done' ? <Icon name="check" size="sm" /> : state === 'unknown' ? null : n}
    </span>
  );
}

// One step. Open, it is the one framed card and holds everything about itself: its head (name, one why sentence,
// tags), its body (a StepList, at most one Why, a field) and its foot (what happens when you press, then the one
// primary). Closed, it is one row: a done row ends in its result; a later row shows its number, on a lighter node
// when optional; a wait row names an outcome the Hub has not seen yet; an unknown row is never drawn as done or as a
// warning (a hatched node and "Can't tell"). A closed row with something to show is a button: Enter or a click opens
// it, which closes the open one. Under `flat` every step shows its body with no frame and no row button.
// Under 600 px of the track's own width the open step drops its node and takes the full width, its tags move above
// its name, and its foot stacks.
function TrackStep({ id, state, tone, optional, name, result, why, tags, foot, children }: TrackStepProps) {
  const ctx = useContext(Ctx);
  const t = useStrings(strings);
  const headId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const focus = ctx?.focus ?? false;
  useEffect(() => {
    if (focus) heading.current?.focus();
  }, [focus]);
  if (!ctx) return null;
  const { n, open, flat, level, onOpen } = ctx;
  const H = `h${level}` as 'h3';
  const stateWord = t(`track.state.${state}`);
  const unknownTag = state === 'unknown' ? <Tag>{t('track.state.unknown')}</Tag> : null;
  const optionalTag = optional ? <Tag>{t('track.optional')}</Tag> : null;
  const shown = open || flat;
  const canOpen = !flat && !open && (children != null || why != null || foot != null);
  const li = cx(s.step, s[`state_${state}`], tone && s[`tone_${tone}`], open && s.open, flat && !open && s.unframed);
  if (!shown) {
    const row = (
      <>
        <Node state={state} n={n} optional={optional} />
        <span className={s.rowName}>
          {name}
          <SrOnly>{t('track.state.sr', { state: stateWord })}</SrOnly>
        </span>
        <span className={s.rowEnd}>
          {unknownTag}
          {optionalTag}
          {state === 'done' && result != null && <span className={s.result}>{result}</span>}
        </span>
      </>
    );
    return (
      <li className={li} data-step={id} data-state={state}>
        {canOpen ? (
          <button type="button" className={s.row} aria-expanded={false} onClick={onOpen}>
            {row}
          </button>
        ) : (
          <div className={s.row}>{row}</div>
        )}
      </li>
    );
  }
  const head = (
    <div className={s.head}>
      <div className={s.headLine}>
        <H id={headId} ref={heading} tabIndex={open ? -1 : undefined} className={s.name}>
          {name}
          <SrOnly>{t('track.state.sr', { state: stateWord })}</SrOnly>
        </H>
        {(tags != null || unknownTag || optionalTag) && (
          <span className={s.tags}>
            {optionalTag}
            {unknownTag}
            {tags}
          </span>
        )}
      </div>
      {why != null && <p className={s.why}>{why}</p>}
    </div>
  );
  const inner = (
    <>
      {head}
      {children != null && <div className={s.body}>{children}</div>}
      {foot && (foot.say != null || foot.primary != null || foot.secondary != null) && (
        <div className={s.foot}>
          {foot.say != null && <div className={s.say}>{foot.say}</div>}
          {(foot.primary != null || foot.secondary != null) && (
            <div className={s.actions}>
              {foot.secondary}
              {foot.primary != null && (
                <span className={s.primary} data-track-primary="">
                  {foot.primary}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
  return (
    <li className={li} data-step={id} data-state={state}>
      <Node state={state} n={n} optional={optional} />
      {open ? (
        <div className={s.card} role="region" aria-labelledby={headId}>
          {inner}
        </div>
      ) : (
        <div className={s.flatBody}>{inner}</div>
      )}
    </li>
  );
}

/** A guided setup's steps, each with a state (done, now, later, wait, unknown), on one spine with one step open:
 *  `<Track label><TrackStep id state name …/></Track>`. Use StepList instead for the numbered how-to rows of one step,
 *  SystemSteps for one step that differs per system. The step is the separate export `TrackStep`; `Track.Step` is not
 *  provided: a static member is an assignment at load, and kit modules do nothing at load (kitpure). */
export { TrackRoot as Track, TrackStep };
