// StepTrail: a turn's activity ledger in the conversation column and in the side dock. A summary row (how many steps, how long,
// the outcome; closed, also the step that matters now: the first that failed or has no result, else the newest), then one row
// per step on one grid: outcome mark, kind, what it worked on (two lines at most), how long. The agent's own words between
// steps (kind `note`) are a line of prose, not a step. A row opens only when there is more than it shows: text the two
// lines cut, more than one line, or a text that was shortened before it got here (said so, and then never offered to copy).
// It draws what the block carries and nothing else: the agent records a summary of each call, not the call or its output.
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { cx } from '../controls/Button';
import { TextButton } from '../controls/Link';
import { SR_ONLY } from '../controls/SrOnly';
import { CodeBlock } from '../data/Ids';
import { Icon } from '../icons';
import { Spinner } from '../states/States';
import { useStrings } from '../strings';
import type { ConvBlock, StepView } from './source';
import { StepPictures } from './StepPictures';
import strings from './SessionView.strings.en.json';
import s from './StepTrail.module.css';

const STATE_WORD: Record<StepView['state'], 'sv.step.running' | 'sv.step.ok' | 'sv.step.failed' | 'sv.step.unknown'> = {
  running: 'sv.step.running', ok: 'sv.step.ok', failed: 'sv.step.failed', unknown: 'sv.step.unknown',
};

/** A step's mark, with its outcome as text for a screen reader (the icon and the dots are hidden). */
export function StepMark({ state }: { state: StepView['state'] }) {
  const t = useStrings(strings);
  const mark = state === 'running' ? <Spinner />
    : state === 'unknown' ? <Icon name="info" size="sm" className={s.infoMark} />
      : <Icon name={state === 'ok' ? 'check' : 'x'} size="sm" className={state === 'ok' ? s.ok : s.bad} />;
  return <>{mark}<span className={SR_ONLY}>{t(STATE_WORD[state])}</span></>;
}

/** How a step's recorded text reads: a command is carried as `$ …`, one started in the background as `[bg] $ …`. */
export function stepText(summary: string | undefined): { text: string; command: boolean; background: boolean } {
  const raw = summary ?? '';
  const m = /^(\[bg\] )?\$ /.exec(raw);
  return { text: m ? raw.slice(m[0].length) : raw, command: !!m, background: !!m?.[1] };
}

/** One step: its row and, when the row cannot show all of its text, a button over the row that opens the whole text. */
function StepRow({ r }: { r: StepView }) {
  const t = useStrings(strings);
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);
  const sum = useRef<HTMLSpanElement>(null);
  const panel = useId();
  const x = stepText(r.summary);
  // The whole text as recorded (line breaks kept) when the host carries it, else the row's own line.
  const whole = stepText(r.text ?? r.summary).text;
  const cut = !!r.cut;
  // Whether the two lines cut the text is a fact of the layout: read from the box, again whenever its size changes.
  useLayoutEffect(() => {
    const el = sum.current;
    if (!el) return undefined;
    const read = () => setClipped(el.scrollHeight > el.clientHeight + 1);
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [r.summary]);
  // A step that made pictures always opens: its pictures are in the detail.
  // The detail repeats the text only when the row cannot show all of it (clipped, cut, or more than one line).
  const textMore = !!x.text && (clipped || cut || whole.includes('\n'));
  const more = !!r.pictures?.length || textMore;
  const shown = open && more;
  const cells = (
    <>
      <span className={s.stepMark}><StepMark state={r.state} /></span>
      <span className={s.stepTool}>{r.verb}</span>
      <span className={s.stepMain}>
        {x.text && <span ref={sum} className={s.stepSum} translate="no">{x.command ? `$ ${x.text}` : x.text}</span>}
        {x.background && <span className={s.stepHint}>{t('sv.step.background')}</span>}
        {/* Why it failed (or that it may have run) is in the row, whole: a failure is never behind a click. */}
        {r.note && <span className={cx(s.stepErr, r.state === 'unknown' && s.stepUnknown)}>{r.note}</span>}
      </span>
      <span className={s.stepTime}>{r.time}</span>
    </>
  );
  return (
    <li className={s.step} data-step={r.state} data-open={shown ? '' : undefined}>
      {more ? (
        <AriaButton className={s.stepRow} aria-expanded={shown} aria-controls={shown ? panel : undefined} onPress={() => setOpen((v) => !v)}>
          {cells}
          <Icon name={shown ? 'chevron-down' : 'chevron-right'} size="sm" className={s.stepChevron} />
        </AriaButton>
      ) : <div className={cx(s.stepRow, s.stepFlat)}>{cells}</div>}
      {shown && (
        <div id={panel} className={s.stepDetail} data-step-detail="">
          {/* A whole command is drawn with the block's own prompt (never copied) and can be copied. A shortened text is named
              as that and has no Copy: it is not what ran. Anything else is what the step worked on, never called its input. */}
          {textMore && <CodeBlock
            code={whole}
            label={t(x.command ? (cut ? 'sv.step.commandStart' : 'sv.step.command') : (cut ? 'sv.step.textStart' : 'sv.step.text'), { step: r.verb })}
            wrap
            prompt={x.command}
            noCopy={cut}
            lang={x.command ? 'shell' : 'plain'} // reason: a path, a pattern or a query is in no one language
          />}
          {textMore && cut && <p className={s.detailLine}>{t(x.command ? 'sv.step.cutCommand' : 'sv.step.cutText')}</p>}
          {r.pictures && r.pictures.length > 0 && <StepPictures items={r.pictures} />}
        </div>
      )}
    </li>
  );
}

export function StepTrail({ b }: { b: Extract<ConvBlock, { k: 'steps' }> }) {
  const [open, setOpen] = useState(false);
  // Closed, the row previews one step (its tool and what it worked on), so a closed trail still says what ran: the first
  // that failed or whose result never came back, else the newest. A step still running is previewed by its kind alone: the
  // working bar under the transcript already shows its command. The agent's own words between steps are not a step.
  const steps = b.rows.filter((r) => r.kind !== 'note');
  const peek = open ? undefined : (steps.find((r) => r.state === 'failed' || r.state === 'unknown') ?? steps[steps.length - 1]);
  const peekText = peek ? stepText(peek.summary) : null;
  return (
    <div className={s.trail}>
      <div className={s.trailHead}>
        {/* Named by what it shows (WCAG 2.5.3): how many steps and how long (`count`; a host that gives none is read by its
            label) and the outcome; aria-expanded says open or closed. The preview beside it is text, outside the button's name. */}
        <TextButton literal icon={open ? 'chevron-down' : 'chevron-right'} aria-expanded={open} onPress={() => setOpen((v) => !v)} className={s.trailRow}>
          <span className={s.trailText}>{b.count ?? b.label}</span>
          <span className={s.trailMark}><StepMark state={b.state} /></span>
        </TextButton>
        {peek && (
          <span className={s.trailPeek} data-trail-peek="">
            <span className={s.peekTool}>{peek.verb}</span>
            {peekText?.text && peek.state !== 'running' && <span className={s.peekSum} translate="no">{peekText.command ? `$ ${peekText.text}` : peekText.text}</span>}
          </span>
        )}
      </div>
      {open && (
        <ol className={s.steps}>
          {b.rows.map((r) => (r.kind === 'note'
            ? <li key={r.id} className={s.note} data-step="note">{r.summary}</li>
            : <StepRow key={r.id} r={r} />))}
        </ol>
      )}
    </div>
  );
}
