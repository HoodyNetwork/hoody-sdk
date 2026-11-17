// The composer's menu: rows drawn above the draft box. The draft box keeps focus
// and the keys (Composer.tsx): arrows move the active row (aria-activedescendant), Enter or Tab picks it, Escape closes. A row
// picks on a click too (a screen reader's included), or on Enter or Space when an assistive tool focused it; pressing it never
// takes focus from the box. Picking only writes into the draft: nothing sends itself. One menu for both, never two popovers.
// Groups: rows that carry a group are drawn under its header, one ARIA group per header (role="group" named by the
// header); headers are no options, so the arrows, the active row and the row ids count only the rows, as before.
import { Fragment, useEffect, useId, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import s from './SlashMenu.module.css';
import { hostEnv } from '@core';

/** One row: its label as shown, an optional mark beside it ("Not trusted") and an optional line under it. */
export interface ComposerMenuRow {
  /** Stable among the rows (a command or entry name). */
  key: string;
  label: string;
  mark?: string | null;
  description?: string;
  /** Shown after the label, quieter: what may follow it ("<turn>"). */
  hint?: string;
  /** Shown at the row's end: what the row opens ("Opens the TODO form"). */
  opens?: string;
  /** The header the row is listed under; consecutive rows of one group share it. */
  group?: string;
}

export interface ComposerMenuProps {
  /** The listbox's id (the draft box's aria-controls); each row's id is `${id}-${index}`. */
  id: string;
  /** The listbox's name ("Commands", "Files"). */
  label: string;
  rows: readonly ComposerMenuRow[];
  active: number;
  /** A line under the rows (reading, could not be read, nothing matches); null for none. */
  note: string | null;
  onPick: (i: number) => void;
  onActive: (i: number) => void;
}

export const slashRowId = (id: string, i: number): string => `${id}-${i}`;

/** The rows cut into runs of one group (undefined: rows with no group), in order; `from` is the run's first row index. */
function runsOf(rows: readonly ComposerMenuRow[]): { group: string | undefined; from: number; rows: ComposerMenuRow[] }[] {
  const out: { group: string | undefined; from: number; rows: ComposerMenuRow[] }[] = [];
  rows.forEach((r, i) => {
    const last = out[out.length - 1];
    const group = r.group || undefined;
    if (last && last.group === group) last.rows.push(r);
    else out.push({ group, from: i, rows: [r] });
  });
  return out;
}

/** One group: its header (not an option) and its rows, named by the header for assistive tools. */
function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <li role="group" aria-labelledby={id} className={s.group}>
      <span id={id} className={s.header} aria-hidden="true">{label}</span>
      <ul role="none" className={s.rows}>{children}</ul>
    </li>
  );
}

export function SlashMenu(p: ComposerMenuProps) {
  // A press keeps focus in the draft box.
  const keep = (e: MouseEvent) => { e.preventDefault(); };
  // The list scrolls (at most eight rows): the row the arrows chose is brought into view, so Enter never picks an unseen row.
  // Keyed on the chosen row itself (index and key), never on the rows array the host rebuilds each render: an unrelated render
  // must not pull a list the wheel has scrolled back to the chosen row.
  const activeKey = p.rows[p.active]?.key ?? null;
  useEffect(() => {
    if (activeKey === null || hostEnv().browserPage !== true) return;
    document.getElementById(slashRowId(p.id, p.active))?.scrollIntoView?.({ block: 'nearest' });
  }, [p.id, p.active, activeKey]);
  const row = (r: ComposerMenuRow, i: number) => (
    <li
      key={r.key}
      id={slashRowId(p.id, i)}
      role="option"
      aria-selected={i === p.active}
      className={s.item}
      data-focused={i === p.active ? '' : undefined}
      tabIndex={-1}
      onMouseDown={keep}
      onClick={() => p.onPick(i)}
      onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onPick(i); } }}
      onPointerMove={() => { if (i !== p.active) p.onActive(i); }}
    >
      <span className={s.head}>
        <span className={s.name}>{r.label}</span>
        {r.hint && <span className={s.hint}>{r.hint}</span>}
        {r.mark && <span className={s.mark}>{r.mark}</span>}
        {r.opens && <span className={s.opens}>{r.opens}</span>}
      </span>
      {r.description && <span className={s.desc}>{r.description}</span>}
    </li>
  );
  return (
    <div className={s.menu} data-slash-menu="">
      {p.rows.length > 0 && (
        <ul id={p.id} role="listbox" aria-label={p.label} className={s.list}>
          {runsOf(p.rows).map((run) => (run.group === undefined
            ? <Fragment key={'r' + run.from}>{run.rows.map((r, j) => row(r, run.from + j))}</Fragment>
            : <MenuGroup key={'g' + run.from} label={run.group}>{run.rows.map((r, j) => row(r, run.from + j))}</MenuGroup>))}
        </ul>
      )}
      {p.note && <p className={s.note} role="status">{p.note}</p>}
    </div>
  );
}
