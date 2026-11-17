// The summary line in the terminal: its parts (the counts sentence split back on the " · " the view joined it with, then
// the links) packed into lines of the measured width, with " · " only BETWEEN parts on one line: a line never ends or
// starts on a separator. A part wider than the line gets a line of its own and wraps inside it.
import { Box, Text, useBoxSize, cellWidth } from '@term/prim';
import type * as Web from './SummaryLine';

const SEP = ' · ';

export const SummaryLine: typeof Web.SummaryLine = ({ lead, after }) => {
  const [size, onSize] = useBoxSize();
  const width = Math.max(1, size?.width ?? 80);
  const units = [
    ...lead.split(SEP).filter(Boolean).map((p, i) => ({ key: `l${i}`, node: <Text>{p}</Text>, w: cellWidth(p) })),
    ...after.map((a) => ({ key: a.key, node: typeof a.node === 'string' ? <Text>{a.node}</Text> : a.node, w: cellWidth(a.text) })),
  ];
  const lines: (typeof units)[] = [];
  let used = 0;
  for (const u of units) {
    const cur = lines[lines.length - 1];
    if (cur && used + cellWidth(SEP) + u.w <= width) {
      cur.push(u);
      used += cellWidth(SEP) + u.w;
    } else {
      lines.push([u]);
      used = u.w;
    }
  }
  return (
    <Box dir="column" width="100%" onSize={onSize}>
      {lines.map((line) => (
        <Box key={line[0]!.key} dir="row">
          {line.map((u, i) => (
            <Box key={u.key} dir="row" shrink={i === 0 && line.length === 1 ? 1 : 0}>
              {i > 0 ? <Text colour="muted">{SEP}</Text> : null}
              {u.node}
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
};
