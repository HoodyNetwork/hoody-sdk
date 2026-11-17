// A titled fold: a title, one line saying what is inside, and a chevron. Use `Why` (layouts) instead for a question
// with a short answer and a FAQ link. Closed by default; the body is not rendered into the tab order while closed.
import { type ReactNode, type Ref, useLayoutEffect, useRef } from 'react';
import { Button as AriaButton, Disclosure as AriaDisclosure, DisclosurePanel, Heading } from 'react-aria-components';
import { Icon } from '../icons';
import { HeadingBelow } from '../layouts/anatomy/Heading';
import { cx } from './Button';
import s from './Disclosure.module.css';

export interface DisclosureProps {
  /** "More options", "Advanced details". */
  title: string;
  /** One muted line on what is inside ("Model, memory and the schedule"). */
  description?: ReactNode;
  children: ReactNode;
  defaultExpanded?: boolean;
  isExpanded?: boolean;
  onExpandedChange?: (open: boolean) => void;
  className?: string;
  /** The root element's id (a FAQ item is the anchor `faq-<id>`). */
  id?: string;
  /** Heading level of the trigger's heading, 2-6. Defaults to the heading level React Aria gives (3). */
  level?: 2 | 3 | 4 | 5 | 6;
  /** The trigger button: a FAQ landing focuses it. */
  triggerRef?: Ref<HTMLButtonElement>;
  /** `false`: a fold inside a list row (one per row of a long log). The same trigger and panel with no heading around
   *  the trigger, so a list of rows does not fill the page's heading outline; small type and no block padding. */
  heading?: boolean;
}

export function Disclosure({ title, description, children, defaultExpanded, isExpanded, onExpandedChange, className, id, level, triggerRef, heading = true }: DisclosureProps) {
  // React Aria takes `id` as the item's key in a DisclosureGroup and never writes it to the DOM, so the root's DOM id is
  // set on the element itself (a layout effect: before any landing effect of a parent reads it).
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || id === undefined) return;
    el.id = id;
    return () => {
      if (el.id === id) el.removeAttribute('id');
    };
  }, [id]);
  const trigger = (
    <AriaButton slot="trigger" className={s.trigger} ref={triggerRef}>
      <Icon name="chevron-right" size="sm" className={s.chevron} />
      <span className={s.text}>
        <span className={s.title}>{title}</span>
        {description && <span className={s.description}>{description}</span>}
      </span>
    </AriaButton>
  );
  return (
    <AriaDisclosure
      ref={root}
      className={cx(s.disclosure, !heading && s.rowFold, className)}
      data-row-fold={heading ? undefined : ''}
      defaultExpanded={defaultExpanded}
      isExpanded={isExpanded}
      onExpandedChange={onExpandedChange}
    >
      {heading ? (
        <Heading className={s.heading} level={level}>
          {trigger}
        </Heading>
      ) : (
        trigger
      )}
      {/* A kit Heading inside the body is one level below the trigger's heading (React Aria's default level is 3). */}
      {/* data-disclosure-panel: a SettingGroup in the fold judges its stack line on the width before the fold's inset. */}
      <DisclosurePanel className={s.panel} data-disclosure-panel="">
        <HeadingBelow level={level ?? 3}>{children}</HeadingBelow>
      </DisclosurePanel>
    </AriaDisclosure>
  );
}
