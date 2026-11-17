// ProblemList in the terminal: a code check's diagnostics, one row each: the tone's mark (so it reads without colour),
// the line number in a column as wide as the longest and the message, wrapping in its own column. With `onJump` a row
// that has a line is one press (Enter, Space or a click) that moves the editor there; a row without one is text.
// `firstRef` focuses the first row's press for a page that moves the focus to the problems when a check finds them; a
// list whose first row has no press has nothing the terminal can focus, so the focus stays where it is.
import { useImperativeHandle, useRef, type Ref } from 'react';
import type * as Web from './ProblemList';
import { Box, Pressable, Text, TONE_MARK, type Focusable } from '../../term/prim';
import { useStrings } from '../strings';
import strings from './ProblemList.strings.en.json';
import { Flow } from './termFlow';

export type { Problem, ProblemListProps } from './ProblemList';

export const ProblemList: typeof Web.ProblemList = ({ label, problems, onJump, firstRef }) => {
  const t = useStrings(strings);
  const first = useRef<Focusable | null>(null);
  useImperativeHandle(firstRef as Ref<HTMLLIElement> | undefined, () => ({ focus: () => first.current?.focus() }) as unknown as HTMLLIElement, []); // contract-any: an element-shaped handle; a terminal has no DOM element, only focus
  if (problems.length === 0) return null;
  const col = Math.max(0, ...problems.map((p) => (typeof p.line === 'number' ? String(p.line).length : 0)));
  return (
    <Box dir="column" shrink={0} sem={{ role: 'list', name: label }}>
      {problems.map((p, i) => {
        const tone = p.tone ?? 'danger';
        const line = typeof p.line === 'number' ? p.line : null;
        const lineWords = line === null ? '' : `${t('problem.line', { line: String(line) })} `;
        const body = (
          <>
            <Text colour={tone} shrink={0}>{TONE_MARK[tone]}</Text>
            {col > 0 && <Text colour="faint" shrink={0} sem={{ hidden: true }}>{(line === null ? '' : String(line)).padStart(col)}</Text>}
            <Box dir="column" grow={1} shrink={1}>
              <Flow>{p.message}</Flow>
            </Box>
          </>
        );
        return (
          <Box key={p.id ?? `${line ?? ''}:${p.message}:${i}`} dir="column" shrink={0} sem={{ role: 'listitem' }}>
            {onJump && line !== null ? (
              <Pressable dir="row" gap={1} shrink={0} onPress={() => onJump(line)} handle={i === 0 ? first : undefined} sem={{ name: `${lineWords}${p.message}` }}>
                {body}
              </Pressable>
            ) : (
              <Box dir="row" gap={1} shrink={0}>
                {body}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
};
