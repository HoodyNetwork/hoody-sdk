// StaticTable: a small table written into the page, whole and never loading (which agent keeps its files where). A real
// <table>: column headers (scope col) and a row-header first column (scope row), named by `label`. Text only, no
// sorting, no toolbar, no actions: a list the person reads. A text cell breaks at spaces and after a path separator
// (`/`, `\`, `:`, `_`, `=`, `&`, `?`, `,`: a soft break the part writes), so columns share the width by their content
// and a path never splits inside a word; only a run of more than LONG_RUN characters with no such break may break
// anywhere (the last resort that keeps the page from widening). A non-text cell wraps as its own content does.
// Use DataTable for records the API returns, Facts for label/value pairs, Ledger for amounts, ShortcutTable for keys.
import type { ReactNode } from 'react';
import { cx } from '../controls/Button';
import s from './StaticTable.module.css';

/** A run longer than this with no space or separator (a hash, a token) may break anywhere. */
const LONG_RUN = 24;
const SEP = /([/\\:_=&?,])/;

/** A text cell with a soft break after each separator; an overlong run marked to break anywhere. */
function breakable(text: string): ReactNode {
  const out: ReactNode[] = [];
  let k = 0;
  for (const word of text.split(/(\s+)/)) {
    if (/^\s+$/.test(word) || word === '') {
      out.push(word);
      continue;
    }
    for (const p of word.split(SEP)) {
      if (p === '') continue;
      if (p.length === 1 && SEP.test(p)) {
        out.push(p, <wbr key={`w${k++}`} />);
      } else if (p.length > LONG_RUN) {
        out.push(
          <span key={`r${k++}`} className={s.longRun}>
            {p}
          </span>,
        );
      } else out.push(p);
    }
  }
  return out;
}

const cell = (v: ReactNode) => (typeof v === 'string' ? breakable(v) : v);

export interface StaticTableColumn {
  id: string;
  /** The column header; the first column's header names the row headers ("Agent"). */
  label: string;
}

export interface StaticTableRow {
  id: string;
  /** One cell per column, in column order; the first is the row's header. */
  cells: readonly ReactNode[];
}

export interface StaticTableProps {
  /** The table's accessible name (what it lists). */
  label: string;
  columns: readonly StaticTableColumn[];
  rows: readonly StaticTableRow[];
  /** Every cell in the mono face (paths, names as typed); the column headers stay in the text face. */
  mono?: boolean;
}

export function StaticTable({ label, columns, rows, mono }: StaticTableProps) {
  return (
    <table className={cx(s.table, mono && s.mono)} aria-label={label} data-static-table="">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.id} scope="col">
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            {columns.map((c, i) =>
              i === 0 ? (
                <th key={c.id} scope="row">
                  {cell(r.cells[0])}
                </th>
              ) : (
                <td key={c.id}>{cell(r.cells[i])}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
