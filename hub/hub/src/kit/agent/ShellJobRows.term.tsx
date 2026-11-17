// ShellJobRows.term: a chat's shell jobs under Activity → Running now, in the terminal. Each job is a block the eye can
// find: a state mark and the command (bold, wrapped whole, never cut) with Stop at the end of its first row, then,
// indented under it, how long it has run, its last line behind a rule (one line, cut with an ellipsis: it is a glimpse
// of the output, the command above is what a Stop names), and what a Stop proved. An unknown Stop is a warn line with
// its mark and Check again beside it, then the hint. Which jobs show, every word and what a Stop may offer are the web's
// (ShellJobRows.pure, the stops store): nothing here sends anything by itself.
import { useSyncExternalStore } from 'react';
import type * as Web from './ShellJobRows';
import { Box, Text } from '@term/prim';
import { Pressable, type Colour } from '@term/kit';
import { TextButton } from '../controls/Link';
import { useStrings } from '../strings';
import { attemptWords, jobName, shownShellJobs, stateWords } from './ShellJobRows.pure';
import strings from './ShellJobRows.strings.en.json';

export type { ShellJobRowsProps, ShownJob } from './ShellJobRows';
export { shownShellJobs };

/** A job's mark by what is known of it: running, maybe running, ended, no longer listed. Read without colour. */
const MARK = { running: '●', unknown: '?', ended: '·', gone: '·' } as const;
const MARK_COLOUR: Record<keyof typeof MARK, Colour> = { running: 'blueText', unknown: 'warn', ended: 'muted', gone: 'muted' };

export const ShellJobRows: typeof Web.ShellJobRows = ({ stops, now }) => {
  const t = useStrings(strings);
  const snap = useSyncExternalStore(stops.subscribe, stops.snapshot, stops.snapshot);
  const shown = shownShellJobs(snap);
  if (shown.length === 0) return null;
  return (
    <Box dir="column" shrink={0} sem={{ role: 'list', name: t('sj.list') }}>
      {shown.map(({ row: r, listed }) => {
        const name = jobName(r, t);
        const a = snap.attempts.get(r.jobId);
        const can = stops.canStop(r.jobId);
        const gated = can.k === 'refused' && can.why === 'capability';
        const kind = !listed ? 'gone' : r.state === 'ended' ? 'ended' : r.state === 'unknown' ? 'unknown' : 'running';
        const unknown = a?.phase === 'unknown';
        const check = unknown && !a.checking;
        return (
          <Box key={r.jobId} dir="column" shrink={0} sem={{ role: 'listitem' }}>
            <Box dir="row" gap={1} shrink={0}>
              <Box shrink={0}><Text colour={MARK_COLOUR[kind]} bold>{MARK[kind]}</Text></Box>
              <Box grow={1} shrink={1}><Text bold>{name}</Text></Box>
              {can.k === 'ok' && (
                // Named for its job ("Stop npm run dev"), as the web's aria-label: several rows each have a Stop.
                <Pressable shrink={0} onPress={() => { void stops.stop(r.jobId); }} sem={{ role: 'button', name: t('sj.stopJob', { name }) }}>
                  <Text colour="blueText" underline>{t('sj.stop')}</Text>
                </Pressable>
              )}
            </Box>
            <Box dir="column" shrink={0} padX={2}>
              <Text colour="muted">{(listed ? stateWords(r, now, t) : t('sj.notListed')) + (listed && gated && !a ? ` · ${t('sj.stops')}` : '')}</Text>
              {listed && r.lastLine ? (
                <Box dir="row" shrink={0} border={['left']} borderColour="line" padX={1}><Box grow={1} shrink={1}><Text colour="muted" truncate>{r.lastLine}</Text></Box></Box>
              ) : null}
              {a && (
                <Box dir="row" gap={2} shrink={0}>
                  <Box shrink={1} sem={{ role: 'status' }}><Text colour={unknown ? 'warn' : 'muted'} bold={unknown}>{(unknown && !a.checking ? '! ' : '') + attemptWords(a, t)}</Text></Box>
                  {check && <Box shrink={0}><TextButton onPress={() => { void stops.check(r.jobId); }}>{t('sj.checkAgain')}</TextButton></Box>}
                </Box>
              )}
              {check && <Text colour="muted">{t('sj.checkHint')}</Text>}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};
