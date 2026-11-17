// NeedsBar.term: the pinned "Waiting for you" row in the terminal. One row in the column's flow: the accent edge and mark,
// the label, what waits (cut with an ellipsis so the row stays one line), how many more, then Show, which is never cut. On
// a pane too narrow for the words beside the label (under STACK cells) what waits takes its own lines below, as the web
// lets it wrap on a phone. It decides nothing: Show only calls the host. The words are the web's (NeedsBar.pure).
import type * as Web from './NeedsBar';
import { Box, Text, useBoxSize } from '@term/prim';
import { Button } from '../controls/Button';
import { useStrings } from '../strings';
import { needsWhat } from './NeedsBar.pure';
import strings from './NeedsBar.strings.en.json';

export type { NeedsBarProps } from './NeedsBar';
export { needsWhat };

/** Below this many cells the row stacks: the web bar wraps what waits under 600 px (75 cells of 8 px). */
const STACK = 75;
/** The web bar is at most 760 px wide and centred in its column: 95 cells. */
const MAX = 95;
/** The accent mark: needs-you is the accent everywhere (the status pill's mark); it reads without colour. */
const MARK = '◆';

export const NeedsBar: typeof Web.NeedsBar = ({ gates, onShow, end }) => {
  const t = useStrings(strings);
  const [size, onSize] = useBoxSize();
  const first = gates[0];
  if (!first) return null;
  const more = gates.length - 1;
  const what = needsWhat(first, t);
  const stacked = size !== null && size.width < STACK;
  const label = <Text colour="acc" bold truncate={false}>{`${MARK} ${t('needs.label')}`}</Text>;
  const count = more > 0 ? <Text colour="muted" truncate={false}>{t('needs.more', { n: more })}</Text> : null;
  // Show, then the host's own control (the running turn's Stop).
  const show = <Box dir="row" gap={1} shrink={0}><Button size="sm" variant="secondary" onPress={onShow}>{t('needs.show')}</Button>{end}</Box>;
  return (
    <Box dir="column" shrink={0} width="100%" maxWidth={MAX} alignSelf="center" bg="card" border={['left']} borderColour="acc" padX={1} onSize={onSize} sem={{ role: 'region', name: t('needs.aria') }}>
      {stacked ? (
        <>
          <Box dir="row" gap={1} shrink={0}>
            <Box shrink={0}>{label}</Box>
            <Box grow={1} shrink={1}>{count}</Box>
            <Box shrink={0}>{show}</Box>
          </Box>
          <Text>{what}</Text>
        </>
      ) : (
        <Box dir="row" gap={1} shrink={0}>
          <Box shrink={0}>{label}</Box>
          <Box grow={1} shrink={1}><Text truncate>{what}</Text></Box>
          {count && <Box shrink={0}>{count}</Box>}
          <Box shrink={0}>{show}</Box>
        </Box>
      )}
    </Box>
  );
};
