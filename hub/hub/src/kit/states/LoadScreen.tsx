// LoadScreen: a whole region that waits. One card holds its title with the state word, the Hoody mark beside the
// count of finished steps, a block bar with one block per REAL step, the steps, one status line, the page's buttons
// and, under them, a question for the person when the page has one. Beside it (under it on a narrow screen) one card
// at a time says what the product can do.
//
// What moves is decoration only. The bar, its count and the step list are the page's `stages` as given: a block lights
// when its step is `done`, the `now` block shows a hatch with a sheen passing over it, and nothing here counts time or
// guesses an amount. The mark works only while a stage is `now` (or the page says it is `waiting` on a read): done,
// stuck or with nothing under way, the screen is still. Still (reduced motion, Performance mode) nothing moves and nothing rotates: the cards are drawn all
// at once as a list, so the screen teaches the same things without motion.
//
// Cards rotate on their own only while nobody uses them: hover, focus inside the card, Previous / Next and the Pause
// button all stop it (Previous / Next and Pause for good, until Play). While they rotate the card is not announced;
// once a person steps through them each card is read out (aria-live polite).
import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties, type FocusEvent, type ReactNode } from 'react';
import { IconButton, cx } from '../controls/Button';
import { SR_ONLY } from '../controls/SrOnly';
import { Icon, type IconName } from '../icons';
import { Heading, HeadingBelow } from '../layouts/anatomy/Heading';
import { CutFrame } from '../layouts/CutFrame';
import { PERF_ATTR, motionOff } from '../perf';
import { useStrings } from '../strings';
import { HOODY_MARK, HOODY_PARTS } from './HoodyLoader';
import strings from './LoadScreen.strings.en.json';
import s from './LoadScreen.module.css';

/** done: finished. now: under way (one at most reads well). next: not started. stuck: it cannot go on by itself. */
export type LoadStageState = 'done' | 'now' | 'next' | 'stuck';

export interface LoadStage {
  id: string;
  /** The step in the page's words ("Server reserved"). */
  label: string;
  state: LoadStageState;
}

export interface LoadCard {
  id: string;
  icon: IconName;
  /** The card's name ("Computers"). */
  title: string;
  /** One or two short sentences. */
  body: ReactNode;
}

/** A question asked while the person waits: one at a time, never in the way of the page's buttons. */
export interface LoadAsk {
  /** The question block's accessible name ("A few questions"). */
  label: string;
  /** Where the person is ("Question 1 of 4"), or the block's own caption. */
  place: string;
  /** The same place drawn as small segments at the end of that line: `total` of them, the first `at` marked. */
  steps?: { at: number; total: number };
  /** The question, as the block's heading. */
  title: string;
  /** One short line under the question (how many may be picked). */
  hint?: string;
  /** The choices: one kit choice control (RadioGroup, CheckboxGroup), named by the heading's id and described by the
   *  hint's (aria-labelledby, aria-describedby). */
  children?: (ids: { title: string; hint: string | undefined }) => ReactNode;
  /** The block's buttons (Next, Skip). */
  actions?: ReactNode;
  /** One quiet line under the buttons (what happens to the answers). */
  note?: ReactNode;
}

export interface LoadScreenProps {
  /** The screen's visible heading, one level below the page's own (a kit Heading). */
  title: string;
  /** One line above the cards, in the page's words (a greeting). */
  intro?: string;
  /** What is going on now, in one short line. A live region that stays mounted: a change is read out politely. */
  status: string;
  /** The real steps, in order. One block of the bar per stage. */
  stages: readonly LoadStage[];
  /** The stage list's accessible name ("Setup steps"). */
  stagesLabel: string;
  /** The cards shown one at a time under the plate (all at once when still). */
  items?: readonly LoadCard[];
  /** The cards' accessible name ("What you can do with Hoody"). Needed with `items`. */
  itemsLabel?: string;
  /** One notice between the plate and the cards (a Band: setup needs the person). */
  notice?: ReactNode;
  /** The page's buttons under the cards (Skip; Open when ready). */
  actions?: ReactNode;
  /** What to do once the wait is over, under `nextTitle` (an ItemList of links): the cards' last step (Next on the last
   *  card leads there, the rotation stops there, nothing wraps); when still, a block after the page's buttons. The cards
   *  start at the first one; they go to it by themselves only when it arrives after a stage reached `now` (the wait is over). */
  next?: ReactNode;
  /** The heading of `next`, one level below the title. */
  nextTitle?: string;
  /** Said in the cards' last step while `next` is not there yet (the wait is not over): the tour still ends there. */
  nextPending?: string;
  /** A question for the person, in its own block last in the column: under the page's buttons, so it never moves them. */
  ask?: LoadAsk;
  /** The page is waiting on a read although no stage is under way (its first read): the mark keeps working. Without it
   *  a screen with no `now` stage is still. */
  waiting?: boolean;
  className?: string;
}

/** How long a card stays while the cards rotate: 6 × --dur-loop, the time its pip takes to fill (LoadScreen.module.css). */
export const LOAD_CARD_MS = 7200;

const REDUCE = '(prefers-reduced-motion: reduce)';

function subscribeStill(notify: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const mq = typeof window.matchMedia === 'function' ? window.matchMedia(REDUCE) : null;
  mq?.addEventListener?.('change', notify);
  // Performance mode is one root attribute (kit/perf.ts): follow it without a second store.
  const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(notify);
  mo?.observe(document.documentElement, { attributes: true, attributeFilter: [PERF_ATTR] });
  return () => {
    mq?.removeEventListener?.('change', notify);
    mo?.disconnect();
  };
}

const notStill = (): boolean => false;

/** True while nothing may move by itself: the system's reduced motion, or Performance mode. */
function useStill(): boolean {
  return useSyncExternalStore(subscribeStill, motionOff, notStill);
}

export function LoadScreen({ title, intro, status, stages, stagesLabel, items, itemsLabel, notice, actions, next, nextTitle, nextPending, ask, waiting = false, className }: LoadScreenProps) {
  const t = useStrings(strings);
  const still = useStill();
  const nextId = useId();
  const total = stages.length;
  const done = stages.filter((x) => x.state === 'done').length;
  const stuck = stages.some((x) => x.state === 'stuck');
  const complete = total > 0 && done === total;
  // "Step n" names the stage that is under way; with none under way the caption only counts what is done.
  const nowAt = stages.findIndex((x) => x.state === 'now');
  const caption = complete ? t('ready') : stuck ? t('stuck') : nowAt >= 0 ? t('progress', { now: nowAt + 1, total }) : t('partial', { done, total });
  const idle = !complete && !stuck && nowAt < 0 && !waiting;
  const cols = { '--load-steps': String(Math.max(1, total)) } as CSSProperties;

  return (
    <div className={cx(s.screen, complete && s.complete, stuck && s.stuck, idle && s.idle, className)} data-load-screen={complete ? 'done' : stuck ? 'stuck' : idle ? 'idle' : 'busy'}>
      <div className={s.grid} aria-hidden="true" />
      <div className={s.scroll}>
        <div className={s.column}>
          {/* The page's line is first; then the card (a phone shows it before the cards); wide, the card sits at the end side. */}
          {intro && <p className={s.intro}>{intro}</p>}
          <div className={s.side}>
            <CutFrame className={s.plateFrame} innerClassName={s.plate} cut={24}>
              <div className={s.head}>
                <div className={s.title}>
                  <Heading>{title}</Heading>
                </div>
                <span className={s.caption}>{caption}</span>
              </div>
              <div className={s.tally} aria-hidden="true">
                <span className={s.markWrap}>
                  <svg className={s.mark} viewBox="0 0 24 24" focusable="false">
                    <path fillRule="evenodd" d={HOODY_MARK} />
                    {HOODY_PARTS.map((d) => (
                      <path key={d} className={s.part} d={d} />
                    ))}
                  </svg>
                </span>
                <span className={s.count}>{t('count', { done, total })}</span>
              </div>
              <div className={s.progress} style={cols}>
                <div className={s.bar} role="progressbar" aria-label={stagesLabel} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-valuetext={caption}>
                  {stages.map((step) => (
                    <span key={step.id} className={cx(s.seg, s[`seg_${step.state}`])} />
                  ))}
                </div>
                <ol className={s.steps} aria-label={stagesLabel}>
                  {stages.map((step) => (
                    <li key={step.id} className={cx(s.step, s[`step_${step.state}`])} data-step={step.id} data-state={step.state}>
                      <span className={s.stepMark} aria-hidden="true">
                        {step.state === 'done' && <Icon name="check" size="sm" />}
                        {step.state === 'stuck' && <Icon name="warn" size="sm" />}
                        {step.state === 'now' && <span className={s.caret} />}
                        {step.state === 'next' && <span className={s.hollow} />}
                      </span>
                      <span>
                        {step.label}
                        <span className={SR_ONLY}> ({t(`state.${step.state}`)})</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              <p className={s.summary} role="status" aria-live="polite" aria-atomic="true">
                {status}
              </p>
              {notice && <div className={s.notice}>{notice}</div>}
              {actions && <div className={s.actions}>{actions}</div>}
              {ask && (
                <HeadingBelow level={2}>
                  <AskBlock ask={ask} />
                </HeadingBelow>
              )}
            </CutFrame>
          </div>
          <div className={s.main}>
            {/* The cards sit under the screen's heading: a card's name is one level below it. */}
            {items && items.length > 0 && (
              <HeadingBelow level={2}>
                {still ? <AllCards items={items} label={itemsLabel} /> : <Cards
                    items={items}
                    label={itemsLabel}
                    endReady={!!next}
                    waitShown={!next && nowAt >= 0}
                    end={next || nextPending ? <NextBlock title={nextTitle}>{next ?? <p className={s.nextWait}>{nextPending}</p>}</NextBlock> : undefined}
                  />}
              </HeadingBelow>
            )}
            {next && (still || !items || items.length === 0) && (
              <HeadingBelow level={2}>
                <div className={s.next} role="group" data-load-next="" aria-labelledby={nextTitle ? nextId : undefined}>
                  {nextTitle && <Heading id={nextId}>{nextTitle}</Heading>}
                  <HeadingBelow level={3}>{next}</HeadingBelow>
                </div>
              </HeadingBelow>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The question block, inside the card past a rule: its place line, the question as its heading with its hint under it, the
 *  choices, then (past a rule) its buttons and its note. */
function AskBlock({ ask }: { ask: LoadAsk }) {
  const id = useId();
  const hintId = useId();
  return (
    <div className={s.ask} role="group" aria-label={ask.label} data-load-ask="">
      <div className={s.cardsHead}>
        <span className={s.place}>{ask.place}</span>
        {ask.steps && (
          <span className={s.askSteps} aria-hidden="true">
            {Array.from({ length: ask.steps.total }, (_, i) => (
              <span key={i} className={cx(s.askStep, i < (ask.steps?.at ?? 0) && s.askStepAt)} />
            ))}
          </span>
        )}
      </div>
      <div className={s.askHead}>
        <div className={s.cardTitle}>
          <Heading id={id}>{ask.title}</Heading>
        </div>
        {ask.hint && (
          <p id={hintId} className={s.askHint}>
            {ask.hint}
          </p>
        )}
      </div>
      {ask.children && <div className={s.askBody}>{ask.children({ title: id, hint: ask.hint ? hintId : undefined })}</div>}
      {ask.actions && <div className={s.askActions}>{ask.actions}</div>}
      {ask.note && <p className={s.askNote}>{ask.note}</p>}
    </div>
  );
}

function CardBody({ card, headingId }: { card: LoadCard; headingId?: string }) {
  return (
    <>
      <span className={s.cardIcon} aria-hidden="true">
        <Icon name={card.icon} className={s.cardGlyph} />
      </span>
      <div className={s.cardText}>
        <div className={s.cardTitle}>
          <Heading id={headingId}>{card.title}</Heading>
        </div>
        <p className={s.cardLine}>{card.body}</p>
      </div>
    </>
  );
}

/** Still: every card at once, a plain list. */
function AllCards({ items, label }: { items: readonly LoadCard[]; label?: string }) {
  return (
    <ul className={s.all} aria-label={label} data-load-cards="all">
      {items.map((card) => (
        <li key={card.id} className={s.allCard} data-card={card.id}>
          <CardBody card={card} />
        </li>
      ))}
    </ul>
  );
}

/** The end step's content: what to do next, under its own heading. */
function NextBlock({ title, children }: { title?: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className={s.nextEnd} role="group" data-load-next="" aria-labelledby={title ? id : undefined}>
      {title && <Heading id={id}>{title}</Heading>}
      <HeadingBelow level={3}>{children}</HeadingBelow>
    </div>
  );
}

/** One card at a time, rotating while nobody uses them. With an `end` step the cards lead to it and stop there. */
function Cards({ items, label, end, endReady = false, waitShown = false }: { items: readonly LoadCard[]; label?: string; end?: ReactNode; endReady?: boolean; waitShown?: boolean }) {
  const t = useStrings(strings);
  const cardCount = items.length;
  // Whether there is an end step, as a flag: `end` is a new element on every render of the page (a poll every 5 s), and
  // the rotation timer must not restart with it.
  const hasEnd = !!end;
  const n = cardCount + (hasEnd ? 1 : 0);
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  // The pointer over the cards and the focus inside them each hold them; one ending never lets go of the other.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const held = hovered || focused;
  const index = Math.min(at, n - 1);
  const atEnd = hasEnd && index === cardCount;
  // With an end step nothing wraps, so Previous is off on the first card (without one it wraps, as before).
  const atStart = hasEnd && index === 0;
  const card = atEnd ? null : (items[index] as LoadCard);
  const many = n > 1;
  const rotating = many && !paused && !held && !atEnd;

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setTimeout(() => setAt((i) => (hasEnd ? Math.min(i + 1, n - 1) : (i + 1) % n)), LOAD_CARD_MS);
    return () => window.clearTimeout(timer);
  }, [rotating, index, n, hasEnd]);

  // When what comes next arrives after a step was under way (the wait is over), the cards go to it; Previous still goes
  // back through them. A screen that opens with it there, or gets it from a first read, starts at the first card.
  const waited = useRef(false);
  useEffect(() => {
    if (waitShown) waited.current = true;
    else if (endReady && waited.current) {
      waited.current = false;
      setAt(cardCount);
    }
  }, [waitShown, endReady, cardCount]);

  // With an end step nothing wraps: Next stops there, Previous stops at the first card.
  const step = (delta: 1 | -1) => {
    setPaused(true);
    setAt((i) => (hasEnd ? Math.max(0, Math.min(n - 1, i + delta)) : (((i % n) + delta) % n + n) % n));
  };
  // Play means play: the cards go on at once, although the pointer or the focus that pressed it is still inside.
  const togglePause = () => {
    if (paused) {
      setHovered(false);
      setFocused(false);
    }
    setPaused(!paused);
  };
  const onBlur = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
  };
  const place = t('cards.place', { n: index + 1, total: n });

  return (
    <CutFrame
      className={s.cards}
      role="group"
      innerClassName={s.cardsInner}
      aria-roledescription={t('cards.role')}
      aria-label={label}
      data-load-cards={rotating ? 'rotating' : 'held'}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
    >
      <div className={s.cardsHead}>
        <span className={s.place}>{place}</span>
        {many && (
          <span className={s.cardsControls} role="group" aria-label={t('cards.controls')}>
            {/* Off at an end, each says why: a soft-disabled button keeps the focus that a disabled one would drop. */}
            <IconButton icon="chevron-left" size="sm" label={t('cards.prev')} onPress={() => step(-1)} isDisabled={atStart} disabledReason={atStart ? t('cards.atStart') : undefined} />
            <IconButton icon={paused ? 'play' : 'pause'} size="sm" label={paused ? t('cards.play') : t('cards.pause')} onPress={togglePause} isDisabled={atEnd} disabledReason={atEnd ? t('cards.stopped') : undefined} />
            <IconButton icon="chevron-right" size="sm" label={t('cards.next')} onPress={() => step(1)} isDisabled={atEnd} disabledReason={atEnd ? t('cards.atEnd') : undefined} />
          </span>
        )}
      </div>
      {/* The live region stays mounted (a region that is replaced is not read out); the card inside is keyed, so the
          next one mounts fresh and its entrance plays again. */}
      <div role="group" aria-roledescription={t('cards.slide')} aria-label={place} aria-live={paused ? 'polite' : 'off'} aria-atomic="true">
        {card ? (
          <div key={card.id} className={s.card} data-card={card.id}>
            <CardBody card={card} />
          </div>
        ) : (
          <div key="end" className={s.card} data-card="end">
            {end}
          </div>
        )}
      </div>
      {many && (
        <div className={s.pips} aria-hidden="true">
          {[...items.map((x) => x.id), ...(hasEnd ? ['end'] : [])].map((id, i) => (
            <span key={id} className={cx(s.pip, i < index && s.pipSeen, i === index && s.pipNow, i === index && rotating && s.pipFilling)} />
          ))}
        </div>
      )}
    </CutFrame>
  );
}
