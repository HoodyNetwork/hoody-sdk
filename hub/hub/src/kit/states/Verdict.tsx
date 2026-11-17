// Verdict: the top plate of a side panel. One sentence that answers "does it work /
// what will I get?" before "how far along?"; at most one coloured phrase, the part that is wrong (<VerdictMark>); one
// muted line naming the next action; one segment per step, with a mono count that says the same in words, so colour is
// never the only signal. A plate may hold the thing itself (`slot`: the proxy address, the domain route) and its facts.
// Two tones: `calm`, the light plate, is the default and the only tone for forms and money; `state`, the ink
// plate in a CutFrame (--hx-verdict-* tokens, light and dark), only for a panel that reports a live health state.
// A state plate holds no `slot` or `facts`: kit parts read the page's own text tokens, which a dark plate cannot carry.
// Its sentence and next line hold text, one VerdictMark and inline links (drawn in the plate's ink, underlined), nothing else.
import { createContext, useContext, useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { cx } from '../controls/Button';
import { CutFrame } from '../layouts/CutFrame';
import s from './Verdict.module.css';

/** done, limited (warn), blocking (danger), optional (hatched), todo (empty), unknown (hatched: never done). */
export type VerdictSegment = 'done' | 'limited' | 'blocking' | 'optional' | 'todo' | 'unknown';

export interface VerdictMarkProps {
  /** warn: limited; danger: broken; good: a named good outcome. */
  tone: 'warn' | 'danger' | 'good';
  children: ReactNode;
}

/** The marks mounted inside one verdict, counted as each mounts (through any component that renders one, whenever it
 *  mounts), so the dev assert sees what is drawn, not only what the caller wrote inline. */
interface MarkCounter {
  n: number;
  label: string;
  told: boolean;
}
const MarkCount = createContext<MarkCounter | null>(null);

/** Rule 2's dev assert: at most one coloured phrase. Names the verdict, never its text; once per verdict. */
function assertOneMark(c: MarkCounter) {
  if (!import.meta.env.DEV || c.n <= 1 || c.told) return;
  c.told = true;
  console.error(`hub Verdict "${c.label}": ${c.n} VerdictMark phrases; a verdict colours at most one`);
}

/** The one coloured phrase of a verdict: the part that is wrong (or the named good outcome). At most one per verdict. */
function VerdictMark({ tone, children }: VerdictMarkProps) {
  const count = useContext(MarkCount);
  useLayoutEffect(() => {
    if (!count) return;
    count.n += 1;
    assertOneMark(count);
    return () => {
      count.n -= 1;
    };
  }, [count]);
  return (
    <strong className={cx(s.mark, s[`mark_${tone}`])} data-verdict-mark={tone}>
      {children}
    </strong>
  );
}

type Progress =
  | {
      /** One segment per step, in the track's order. */
      segments: readonly VerdictSegment[];
      /** The same in words, in mono caps ("3 of 5 · 2 optional left"): required with segments, so colour is never the only signal. */
      count: string;
    }
  | { segments?: never; count?: string };

type Tone =
  | {
      /** calm (default): the light plate, for forms, money and what you will get. */
      tone?: 'calm';
      /** The thing itself, when the plate holds it (an address with copy, a route). */
      slot?: ReactNode;
      /** Its facts (a kit Facts). */
      facts?: ReactNode;
    }
  | {
      /** state: the ink plate in a CutFrame, only for a panel that reports a live health state (setup tabs, inspectors). */
      tone: 'state';
      slot?: never;
      facts?: never;
    };

export type VerdictProps = Progress & Tone & {
  /** The plate's label in mono caps ("Get it working", "What you get"). */
  label: string;
  /** The sentence: what is true now. Wrap the one wrong phrase in <VerdictMark>. */
  children: ReactNode;
  /** The next action, one muted line ("Next: turn privacy off in @BotFather"). Leave it out when nothing is left. */
  next?: ReactNode;
  className?: string;
};

function VerdictRoot({ tone = 'calm', label, children, next, segments, count, slot, facts, className }: VerdictProps) {
  const labelId = useId();
  const marks = useRef<MarkCounter>({ n: 0, label, told: false }).current;
  marks.label = label;
  const plate = (
    <>
      <div className={s.top}>
        <span id={labelId} className={s.label}>
          {label}
        </span>
        {count != null && <span className={s.count}>{count}</span>}
      </div>
      <p className={s.sentence}>{children}</p>
      {next != null && <p className={s.next}>{next}</p>}
      {slot != null && <div className={s.slot}>{slot}</div>}
      {facts != null && <div className={s.facts}>{facts}</div>}
      {segments && segments.length > 0 && (
        <div className={s.segments} aria-hidden="true">
          {segments.map((g, i) => (
            <i key={i} className={cx(s.seg, s[`seg_${g}`])} data-segment={g} />
          ))}
        </div>
      )}
    </>
  );
  return (
    <MarkCount.Provider value={marks}>
      {tone === 'state' ? (
        <CutFrame className={cx(s.stateFrame, className)} innerClassName={cx(s.verdict, s.tone_state)} role="group" aria-labelledby={labelId}>
          {plate}
        </CutFrame>
      ) : (
        <div className={cx(s.verdict, s.tone_calm, className)} role="group" aria-labelledby={labelId}>
          {plate}
        </div>
      )}
    </MarkCount.Provider>
  );
}

/** The top plate of a side panel: `<Verdict label count segments next>sentence <VerdictMark tone>…</VerdictMark></Verdict>`.
 *  The mark is its own export, not `VerdictMark`: a static member is an assignment at load (kitpure). */
export { VerdictRoot as Verdict, VerdictMark };
