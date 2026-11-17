// StaticTable in the terminal: the same small written table, as one block per row: the row's header in bold, then each
// other column as "Label  value" with the labels in one column (as Facts), so a long path wraps under its value and is
// never cut. The semantics tree keeps the table: rows, a row header and cells named by their column.
import type { ReactNode } from 'react';
import type * as Web from './StaticTable';
import { Box, Text } from '../../term/prim';
import { cellWidth, cleanText, padCells } from '../../term/prim/TableCells';
import { Flow } from './termFlow';

export type { StaticTableColumn, StaticTableRow, StaticTableProps } from './StaticTable';

/** The label column's widest (cells); a longer column label wraps in its own column. */
const LABEL_MAX = 22;

const asText = (n: ReactNode): string | null => (typeof n === 'string' || typeof n === 'number' ? String(n) : null);

export const StaticTable: typeof Web.StaticTable = ({ label, columns, rows }) => {
  const rest = columns.slice(1);
  const labelW = Math.min(LABEL_MAX, Math.max(0, ...rest.map((c) => cellWidth(cleanText(c.label)))));
  return (
    <Box dir="column" gap={1} shrink={0} sem={{ role: 'table', name: label }}>
      {rows.map((r) => {
        const head = asText(r.cells[0]);
        return (
          <Box key={r.id} dir="column" shrink={0} sem={{ role: 'row' }}>
            <Box dir="row" shrink={0} sem={{ role: 'rowheader', ...(columns[0] ? { description: columns[0].label } : {}) }}>
              {head !== null ? <Text bold>{head}</Text> : <Flow>{r.cells[0]}</Flow>}
            </Box>
            {rest.map((c, i) => {
              const l = cleanText(c.label);
              return (
                <Box key={c.id} dir="row" shrink={0} sem={{ role: 'cell', description: c.label }}>
                  <Box dir="row" width={labelW + 2} shrink={0}>
                    <Text colour="muted" width={labelW}>{cellWidth(l) <= labelW ? padCells(l, labelW) : l}</Text>
                  </Box>
                  <Box dir="column" grow={1} shrink={1} minWidth={0}>
                    <Flow>{r.cells[i + 1]}</Flow>
                  </Box>
                </Box>
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
};
