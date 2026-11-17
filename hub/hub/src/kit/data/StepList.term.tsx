// StepList in the terminal: the same groups of numbered one-line actions. A group's place is caps with a rule that runs
// to the place's link; a row is its number, the action with its muted note under it, and its control at the row's end.
// Under 75 cells of the list's own width (the web's 600 px, 8 px a cell) the control drops under the text, in the
// text's column, so a control is never cut. Numbers run on across groups; groups are one blank row apart.
import { Fragment, isValidElement } from 'react';
import type * as Web from './StepList';
import { Box, Text, useBoxSize } from '@term/prim';
import { ExtLink } from '../controls/Link';
import { Flow } from './termFlow';
import { stepNumber, useStepTextWarning } from './StepList.pure';

export type { StepListItem, StepListGroup, StepListProps } from './StepList';
export { readableText, stepNumber, STEP_TEXT_MAX } from './StepList.pure';

/** The web's container rule (`width < 600px`) in cells. */
const ACT_UNDER_BELOW = 75;

export const StepList: typeof Web.StepList = ({ label, groups }) => {
  useStepTextWarning(label, groups);
  const [size, onSize] = useBoxSize();
  // Before the first layout the control sits under its text: the form that fits any width.
  const under = size === null || size.width < ACT_UNDER_BELOW;
  let n = 0;
  return (
    <Box dir="column" gap={1} shrink={0} onSize={onSize} sem={{ role: 'group', name: label }}>
      {groups.map((g, gi) => {
        const first = n + 1;
        n += g.items.length;
        return (
          <Box key={g.where ?? gi} dir="column" shrink={0}>
            {(g.where || g.open) && (
              <Box dir="row" gap={1} shrink={0}>
                {g.where && <Text colour="muted" bold shrink={0}>{g.where.toUpperCase()}</Text>}
                <Box grow={1} shrink={1} minWidth={2} height={1} border={['top']} borderColour="line" sem={{ hidden: true }} />
                {g.open && <Box dir="row" shrink={1}><ExtLink url={g.open.url}>{g.open.label}</ExtLink></Box>}
              </Box>
            )}
            <Box dir="column" shrink={0} sem={{ role: 'list', ...(g.where ? { name: g.where } : {}) }}>
              {g.items.map((it, i) => {
                const act = it.act != null && <Box dir="row" shrink={0}>{it.act}</Box>;
                return (
                  <Box key={it.id ?? i} dir="row" gap={2} shrink={0} sem={{ role: 'listitem' }}>
                    <Text colour="faint" shrink={0}>{stepNumber(first + i)}</Text>
                    <Box dir="column" grow={1} shrink={1}>
                      <Flow colour="ink">{it.text}</Flow>
                      {/* A note that is one element, not a fragment (Bots People: the issued invite code, a
                          SecretField) takes the column's width and wraps inside it. In the word flow (a wrapping
                          row) it kept its natural width and ran one cell past the column at 80x24. Words, and a
                          sentence holding a control (a fragment), still flow. */}
                      {it.note != null && (isValidElement(it.note) && it.note.type !== Fragment
                        ? <Box dir="column" shrink={1} minWidth={0}>{it.note}</Box>
                        : <Flow colour="muted">{it.note}</Flow>)}
                      {under && act}
                    </Box>
                    {!under && act}
                  </Box>
                );
              })}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};
