// The strict Section in the terminal: the shared card (termSection.tsx) with the group's collapse rule (a section of a
// group in first use keeps only its notices and promise). focusSection brings the section to the top of its page's
// scroll owner and starts the next Tab in it, as the web scrolls to its heading and focuses it (termScroll landAnchor).
import { Children, useId } from 'react';
import type * as Web from './Section';
import { Box, Text } from '../../../term/prim';
import { Heading, HeadingLevel } from './Heading';
import { useGroupMember } from './SectionGroup';
import { StateBody } from './StateBody';
import { ActionBar } from './ActionBar';
import { TermSection } from './termSection';
import { landAnchor } from '../termScroll';
import { Inline, useTermSize } from '../termParts';
import { SHORT_ROWS } from '../termBreaks';
import { headPrimary as hp, primaryMoved as pm } from './section.pure';

export const headPrimary: typeof Web.headPrimary = hp;
export const primaryMoved: typeof Web.primaryMoved = pm;

export const focusSection: typeof Web.focusSection = (id) => {
  return landAnchor(id);
};

export const AnatomySection: typeof Web.AnatomySection = ({ id, title, count, description, promise, info, actions, notices, state, empty, note, tone = 'default', flush, children }) => {
  const member = useGroupMember(id, state, actions?.primary);
  if (member.collapsed) {
    return (notices || promise ? (
      <Box dir="column">{notices}{promise && <Text colour="muted" italic>{promise}</Text>}</Box>
    ) : <></>);
  }
  return (
    <TermSection anchor={id} title={title} count={count} info={info} description={description} actions={actions}
      notices={notices} promise={promise} state={state} empty={empty} note={note} tone={tone} flush={flush}>
      {children}
    </TermSection>
  );
};

export const SubSection: typeof Web.SubSection = ({ id, title, description, actions, state, empty, children }) => {
  const titleId = useId();
  // A tall terminal keeps one blank row between the description and the body it introduces, as under the page header
  // (SHORT_ROWS). A sub-section with no body (a title and a sentence over the sub-sections that follow it) keeps none:
  // the next one brings its own row above its heading, and a second blank row there would read as a gap in the page.
  const hasBody = Children.toArray(children).length > 0 || (state !== undefined && state.kind !== 'ready');
  const gapRow = useTermSize().height >= SHORT_ROWS && hasBody;
  return (
    // A region named by its heading, as the web's <section aria-labelledby>.
    <Box dir="column" shrink={0} pad={{ top: 1 }} raw={id ? { id } : undefined} sem={{ role: 'region', labelledBy: titleId }}>
      <Box dir="row" wrap gapX={2} justify="between">
        <Heading id={titleId}>{title}</Heading>
        {actions && <ActionBar label={title} size="sm" {...actions} />}
      </Box>
      {description !== undefined && description !== null && <Inline>{description}</Inline>}
      {description !== undefined && description !== null && gapRow && <Box height={1} shrink={0} />}
      <HeadingLevel><StateBody state={state} empty={empty} primary={undefined}>{children}</StateBody></HeadingLevel>
    </Box>
  );
};
