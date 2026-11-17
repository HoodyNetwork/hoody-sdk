// StepTrail.term: a turn's activity ledger in a terminal, for the conversation (SessionView.term) and the AI column
// (ask/Column). The summary row is a button (▸ closed, ▾ open) with the trail's label and its outcome as a mark and a
// word; open, one row per step under it: outcome mark, kind (bold), what it worked on, how long, then why it failed (or
// that it may have run) and the pictures it made by name and size. A terminal has no clipped box to open, so a row
// shows its whole recorded summary and no row opens by itself.
import { useState, type ReactElement } from 'react';
import type * as Web from './StepTrail';
import { Box, Text } from '@term/prim';
import { Pressable, focusInk } from '@term/kit';
import { formatBytes } from '../format';
import { useStrings } from '../strings';
import type { StepView } from './source';
import strings from './SessionView.strings.en.json';

const MARK: Record<StepView['state'], string> = { running: '◌', ok: '✓', failed: '✗', unknown: '?' };
const MARK_COLOUR = { running: 'blueText', ok: 'ok', failed: 'danger', unknown: 'warn' } as const;
const STATE_WORD: Record<StepView['state'], 'sv.step.running' | 'sv.step.ok' | 'sv.step.failed' | 'sv.step.unknown'> = {
  running: 'sv.step.running', ok: 'sv.step.ok', failed: 'sv.step.failed', unknown: 'sv.step.unknown',
};

/** A step's outcome: its mark and its word, in the outcome's colour (a terminal reader gets the word as text). */
export const StepMark: typeof Web.StepMark = ({ state }) => {
  const t = useStrings(strings);
  return <Text colour={MARK_COLOUR[state]}>{MARK[state] + ' ' + t(STATE_WORD[state])}</Text>;
};

/** How a step's recorded text reads: a command is carried as `$ …`, one started in the background as `[bg] $ …` (the
 *  web module's rule). */
export const stepText: typeof Web.stepText = (summary) => {
  const raw = summary ?? '';
  const m = /^(\[bg\] )?\$ /.exec(raw);
  return { text: m ? raw.slice(m[0].length) : raw, command: !!m, background: !!m?.[1] };
};

export const StepTrail: typeof Web.StepTrail = ({ b }): ReactElement => {
  const t = useStrings(strings);
  const [open, setOpen] = useState(false);
  return (
    <Box dir="column" shrink={0}>
      <Pressable onPress={() => setOpen((v) => !v)} sem={{ role: 'button', name: `${b.label}, ${t(STATE_WORD[b.state])}`, expanded: open }}>
        {({ focused }) => (
          <Text colour="muted" {...focusInk(focused)}>
            {(open ? '▾ ' : '▸ ') + b.label + ' '}
            <StepMark state={b.state} />
          </Text>
        )}
      </Pressable>
      {open ? b.rows.map((r) => (
        <Box key={r.id} dir="column" pad={{ left: 2 }} shrink={0}>
          <Text>
            <Text colour={MARK_COLOUR[r.state]}>{MARK[r.state] + ' '}</Text>
            <Text bold>{r.verb}</Text>
            {r.summary ? <Text colour="acc">{' ' + r.summary}</Text> : null}
            {r.time ? <Text colour="faint">{' ' + r.time}</Text> : null}
          </Text>
          {r.note ? <Text colour={r.state === 'unknown' ? 'warn' : 'danger'}>{'  ' + r.note}</Text> : null}
          {(r.pictures ?? []).map((p) => <Text key={p.path} colour="faint">{'  ' + p.name + (p.size !== undefined ? ' · ' + formatBytes(p.size) : '')}</Text>)}
        </Box>
      )) : null}
    </Box>
  );
};
