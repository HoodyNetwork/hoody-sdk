// One setting: a 220 px label column (label + help) beside the control (max 480).
// The row is its own container, so it stacks only when the row itself is too narrow for both
// (a form column of about 570 px on a 1440 screen must still show the two columns). An
// instant-apply control shows its settle Outcome right of the control and is locked while unknown.
// Inside a SettingGroup the row takes the group's grid instead (GroupRow, SettingGroup.tsx); `wide` is ignored there.
import { type ReactNode, useId } from 'react';
import { cx } from '../controls/Button';
import { type OutcomeInput, isUnknown } from '../outcome';
import { FormStateProvider, useFormState } from './lock';
import { type CheckFn, Outcome, useDoneFlash, useOutcome, useOutcomeFacts, usePendingToast } from './Outcome';
import { useStrings } from '../strings';
import type { ErrorWordsOptions } from '../states/errorWords';
import strings from './forms.strings.en.json';
import { InfoLine, plainText } from '../overlays/InfoTip';
import { dataAttrs, GroupRow, SettingGroup, type SettingIds, type SettingReset, type SettingReveal, useSettingGroup } from './SettingGroup';
import s from './SettingRow.module.css';

export interface SettingRowProps {
  label: ReactNode;
  /** Muted help under the label. */
  help?: ReactNode;
  /**
   * The setting as it is written where it lives: a directive, a flag, a config key (`@schedule-timeout`). One line in the
   * mono face under the help, the same on every row, so the help keeps to plain words. It is text of the row, read once
   * in reading order; the control's description stays the help.
   */
  code?: string;
  /** An explanation behind an icon-form InfoTip after the label (jargon: realm, exec id, cwd). In a group too. */
  info?: string;
  /**
   * The control(s): a field, a switch, a value with its actions. In a SettingGroup this is the row's value (a field
   * group: the control); a function gets the row's name and help ids for aria-labelledby / aria-describedby.
   */
  children?: ReactNode | ((ids: SettingIds) => ReactNode);
  /** The control spans the whole control column (tables, value clusters) instead of max 480. Ignored in a group. */
  wide?: boolean;
  /** `start`: in a SettingGroup, the label sits at the top of the row, for a tall control (a list, a multi-line field). */
  align?: 'start';
  /** The id of the control the label names (a native input); kit fields carry their own label. */
  htmlFor?: string;
  /** The settle outcome of this setting's last change (instant-apply controls). */
  outcome?: OutcomeInput;
  /** The rejection of the last change: its mapped words and Details on the outcome line. */
  error?: unknown;
  /** The outcome line's sentence in the page's own words: it takes the place of the error's mapped sentence, and the
   *  error's Details still show (Outcome `detail`). */
  detail?: ReactNode;
  /** How the error's mapped sentence is worded (Outcome `errorWords`). */
  errorWords?: ErrorWordsOptions;
  /** Read this setting back after an unknown outcome. */
  onCheck?: CheckFn;
  /** Stop tracking a `pending` outcome: "Stop tracking" after Check again on the outcome line. The page asks first in
   *  its own words; the kit adds no warning. Absent = no button. */
  onStop?: () => void;
  /** Actions at the end of the control column (Change…, Turn off…). */
  actions?: ReactNode;
  /** Danger styling for the label (delete rows in a danger zone). */
  tone?: 'default' | 'danger';
  className?: string;
  /** A rare edit opened in place under the row (SettingGroup `reveal`). In a group only: outside
   *  one the row renders as a one-row group. */
  reveal?: SettingReveal;
  /** Reset to default at the end of the row (SettingGroup `reset`); like `reveal`, a one-row group outside a group. */
  reset?: SettingReset;
  /** `data-*` attributes go on the row element (a page finds and focuses a row by one). */
  [data: `data-${string}`]: string | undefined;
}

export function SettingRow(props: SettingRowProps) {
  const group = useSettingGroup();
  const { wide: _wide, ...row } = props;
  if (group) return <GroupRow {...row} />;
  // A reveal row needs the group's grid (its editor spans the row under it).
  if (props.reveal || props.reset) return <SettingGroup><GroupRow {...row} /></SettingGroup>;
  return <LegacyRow {...props} />;
}

function LegacyRow({ label, help, code, info, children, wide, htmlFor, outcome, error, detail, errorWords, onCheck, onStop, actions, tone = 'default', className, ...rest }: SettingRowProps) {
  const parent = useFormState();
  const o = useOutcome(outcome);
  const doneShown = useDoneFlash(o);
  // The row locks on the kind its line shows (as OutcomeSlot): pending facts under another kind (a failed outcome whose
  // error says the change may have gone through) lock the control and hide the actions, so nothing can be sent again.
  const { info: facts, kind: shown } = useOutcomeFacts(o, error);
  const pending = shown === 'pending';
  // A row that goes away while its change is unknown leaves the sticky Check again toast, with the facts' Details.
  usePendingToast(o, onCheck, true, facts);
  const t = useStrings(strings);
  const locked = parent.locked || isUnknown(o) || pending;
  const nameId = useId();
  const helpId = useId();
  // Ids go on the name and help only for a caller that wires them (a function child); other rows render as before.
  const wired = typeof children === 'function';
  const value = wired ? children({ nameId, helpId: help ? helpId : undefined }) : children;
  const body = (
    <div className={cx(s.ctl, wide && s.wide)}>
      {value !== undefined && value !== null && <div className={s.value}>{value}</div>}
      {o && (o.kind !== 'done' || doneShown) && <Outcome outcome={o} onCheck={onCheck} onStop={onStop} doneText={t('form.saved')} error={error} detail={detail} errorWords={errorWords} className={s.outcome} />}
      {actions && !pending && <div className={s.actions}>{actions}</div>}
    </div>
  );
  return (
    <div {...dataAttrs(rest)} className={cx(s.row, className)}>
      <div className={s.grid}>
        <div className={s.label}>
          <InfoLine tip={info} subject={plainText(label)}>
            {htmlFor ? (
              <label id={wired ? nameId : undefined} className={cx(s.name, tone === 'danger' && s.danger)} htmlFor={htmlFor}>
                {label}
              </label>
            ) : (
              <span id={wired ? nameId : undefined} className={cx(s.name, tone === 'danger' && s.danger)}>
                {label}
              </span>
            )}
          </InfoLine>
          {help && (
            <span id={wired ? helpId : undefined} className={s.help}>
              {help}
            </span>
          )}
          {code && (
            <code className={s.code} data-sg-code="">
              {code}
            </code>
          )}
        </div>
        <FormStateProvider value={locked === parent.locked ? parent : { ...parent, locked }}>{body}</FormStateProvider>
      </div>
    </div>
  );
}
