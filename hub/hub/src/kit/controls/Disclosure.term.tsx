// Disclosure in the terminal: a header line "▸ Title" (closed) or "▾ Title" (open) with its muted description, one Tab
// stop; Enter or Space toggles, and so does a click. Closed by default; the body is not rendered while closed (so nothing
// in it is in the Tab order), as on the web. Controlled (isExpanded + onExpandedChange) and uncontrolled
// (defaultExpanded) both work; a heading inside the body is one level below the trigger's (HeadingBelow).
import { useImperativeHandle, useRef } from 'react';
import { useDisclosureState } from 'react-stately/useDisclosureState';
import type * as Web from './Disclosure';
import { Box, Pressable, Text, type Focusable } from '../../term/prim';
import { HeadingBelow } from '../layouts/anatomy/Heading';
import { focusInk } from '../../term/prim/FocusInk';

export type { DisclosureProps } from './Disclosure';

export const Disclosure: typeof Web.Disclosure = ({ title, description, children, defaultExpanded, isExpanded, onExpandedChange, level, triggerRef, heading = true }) => {
  // Open state from React Stately (the web Disclosure's own state hook): controlled and uncontrolled alike.
  const state = useDisclosureState({ isExpanded, defaultExpanded: defaultExpanded === true, onExpandedChange });
  const open = state.isExpanded;
  const handle = useRef<Focusable | null>(null);
  // A caller's trigger ref (a FAQ landing focuses it) gets an element-shaped handle whose focus() works.
  useImperativeHandle(triggerRef, () => ({ focus: () => handle.current?.focus(), blur: () => {} }) as unknown as HTMLButtonElement); // contract-any: an element-shaped handle; a terminal has no DOM element, only focus
  const toggle = (): void => state.toggle();
  return (
    <Box dir="column" shrink={0}>
      <Pressable dir="row" shrink={0} handle={handle} onPress={toggle}
        sem={{ name: typeof description === 'string' ? `${title} ${description}` : title, expanded: open }}>
        {({ focused }) => (
          // The mark, then the title and its description as one wrapping row: side by side while both fit, else the
          // description goes under the title and wraps there (on the web it is always its own line under the title).
          <Box dir="row" grow={1} shrink={1} minWidth={0}>
            <Text colour="muted" {...focusInk(focused)}>{open ? '▾ ' : '▸ '}</Text>
            {/* The two cells between them belong to the title, so the focus fill is one run on a shared line. */}
            <Box dir="row" wrap gapX={0} gapY={0} grow={1} shrink={1} minWidth={0}>
              {/* A row fold (heading false) is one of many in a list: its title is not bold. */}
              <Text bold={heading} {...focusInk(focused)}>{title}{description ? '  ' : ''}</Text>
              {description ? <Text colour="muted" {...focusInk(focused)}>{description}</Text> : null}
            </Box>
          </Box>
        )}
      </Pressable>
      {open ? (
        <Box dir="column" pad={{ left: 2 }}>
          <HeadingBelow level={level ?? 3}>{children}</HeadingBelow>
        </Box>
      ) : null}
    </Box>
  );
};
