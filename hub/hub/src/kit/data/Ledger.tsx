// Lists of label and value pairs that are not facts: Ledger, money rows with one end-aligned amount column and a
// total after a rule (wallet, credit, a checkout's sum), and ShortcutTable, keys and what they do with the labels
// lined up (Home shortcuts, Guide keys). Use Facts instead for pairs that are neither amounts nor keys.
// Both are dl lists; a row holds text only (an action goes in the section's actions, or in Ledger's attached strip).
import { Fragment, type ReactNode, useId } from 'react';
import { cx } from '../controls/Button';
import { Kbd } from '../controls/Kbd';
import { Icon } from '../icons';
import { Heading } from '../layouts/anatomy/Heading';
import { useStrings } from '../strings';
import { SrOnly } from './Display';
import strings from './Ledger.strings.en.json';
import s from './Ledger.module.css';

export interface LedgerRow {
  id: string;
  label: string;
  /** The amount as the page formats it ("$12.00"): end-aligned, tabular numbers, never wrapped. */
  amount: ReactNode;
  /** One line under the row (when it is released, why it is held): full width. */
  note?: ReactNode;
  /** `muted`: a zero or not-yet amount reads quieter. `warn`: a shortfall ("Short by $6.80"), in the warning colour
   *  with a warning mark; its words say it too, so colour is never the only sign. */
  tone?: 'muted' | 'warn';
}

/** The strip attached under the list for a shortfall (a `warn` row, "Short by $6.80"): the page's own sentence and
 *  its one button (Add funds), never a second free-standing box. */
export interface LedgerAttach {
  /** The page's existing sentence about the warn row (what is short and what to do). */
  text: ReactNode;
  /** The one button that resolves it (Add funds). */
  action?: ReactNode;
}

export interface LedgerProps {
  /** The list's accessible name (the section title, or what the amounts are). */
  label: string;
  rows: readonly LedgerRow[];
  /** The sum, after a rule, strong. */
  total?: { label: string; amount: ReactNode };
  /** A strip joined under the list, in the warning look, about its warn row: one sentence and one button. */
  attach?: LedgerAttach;
}

/** Money rows: a label and one end-aligned amount each, an optional total after a rule, and a strip for a shortfall.
 * Use Facts instead when the pairs are not amounts that add up, StatStrip for a few headline numbers. */
export function Ledger({ label, rows, total, attach }: LedgerProps) {
  const stripId = useId();
  const list = (
    <dl className={s.ledger} aria-label={label} aria-describedby={attach ? stripId : undefined}>
      {rows.map((r) => (
        <div key={r.id} className={cx(s.row, r.tone === 'muted' && s.muted, r.tone === 'warn' && s.warn)} data-ledger-tone={r.tone}>
          <dt className={s.label}>
            {r.tone === 'warn' && <Icon name="warn" size="sm" className={s.mark} />}
            {r.label}
          </dt>
          <dd className={s.amount}>{r.amount}</dd>
          {r.note !== undefined && <dd className={s.note}>{r.note}</dd>}
        </div>
      ))}
      {total && (
        <div className={cx(s.row, s.total)} data-ledger-total="">
          <dt className={s.label}>{total.label}</dt>
          <dd className={s.amount}>{total.amount}</dd>
        </div>
      )}
    </dl>
  );
  if (!attach) return list;
  return (
    <div className={s.attached} data-ledger-attached="">
      {list}
      <div id={stripId} className={s.strip} data-ledger-strip="">
        <span className={s.stripText}>{attach.text}</span>
        {attach.action && <span className={s.stripAction}>{attach.action}</span>}
      </div>
    </div>
  );
}

export interface ShortcutTableRow {
  /** Each entry is one chord, its keys separated by spaces ("Ctrl K"), shown as one Kbd per key; the space bar is
   * written "Space" (an entry of only spaces reads Space too). Several entries are alternatives ("j", "k": either one,
   * as the kit Shortcut's array), unless `then` says they are pressed in order. */
  keys: readonly string[];
  /** The entries are pressed one after another ("g", then "h"), not either one. The shell's useShortcuts rows do not
   * say which, so a page passing them sets this on its g-jump rows. */
  then?: boolean;
  label: string;
}

/** The shape of a shell useShortcuts() group (the title is optional here); its rows need `then: true` on the g-jump
 * sequences, which the shell does not mark. */
export interface ShortcutTableGroup {
  id: string;
  /** Shown above the group as a kit Heading, one level below the section it sits in. */
  title?: string;
  rows: readonly ShortcutTableRow[];
}

export interface ShortcutTableProps {
  /** The name of a group without a title. */
  label: string;
  groups: readonly ShortcutTableGroup[];
}

/** One chord's keys: "Ctrl K" -> Ctrl, K; a bare space -> Space. */
function chordKeys(chord: string, space: string): string[] {
  const keys = chord.split(' ').filter((k) => k.length > 0);
  return keys.length > 0 ? keys : [space];
}

/** Keyboard shortcuts as a list, in optional titled groups: the keys in one column, what they do beside them. */
export function ShortcutTable({ label, groups }: ShortcutTableProps) {
  const t = useStrings(strings);
  return (
    <div className={s.shortcuts}>
      {groups.map((g) => (
        <Fragment key={g.id}>
          {g.title && <Heading>{g.title}</Heading>}
          <dl className={s.keyTable} aria-label={g.title ?? label}>
            {g.rows.map((r) => (
              <div key={r.label} className={s.keyRow} data-shortcut-row="">
                <dt className={s.keys}>
                  {/* Text between the chips, so the term reads "Ctrl K" and "g, then h" and not "CtrlK" or "gh": a space
                      between the keys of one chord, and (for a screen reader only) ", then" between chords pressed in
                      order or ", or" between alternatives. */}
                  {r.keys.map((chord, i) => (
                    <Fragment key={`${i}-${chord}`}>
                      {i > 0 && <SrOnly>{t(r.then ? 'keys.then' : 'keys.or')} </SrOnly>}
                      {chordKeys(chord, t('keys.space')).map((k, j) => (
                        <Fragment key={`${j}-${k}`}>
                          {j > 0 && ' '}
                          <Kbd>{k}</Kbd>
                        </Fragment>
                      ))}
                    </Fragment>
                  ))}
                </dt>
                <dd className={s.keyLabel}>{r.label}</dd>
              </div>
            ))}
          </dl>
        </Fragment>
      ))}
    </div>
  );
}
