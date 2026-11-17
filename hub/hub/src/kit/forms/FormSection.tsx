// FormSection: one group of fields inside a form (a dialog, a drawer, a wizard step).
//
// A form with more than a handful of fields is cut into sections, and every section is this part, so a group always
// reads the same way:
//   - its title is a heading in the group type (--t-group), one step above the field labels under it, never a field
//     label itself;
//   - one description line sits directly under the title, before the fields it explains;
//   - the fields inside keep one gap (--form-field-gap);
//   - every section but the first draws a rule above itself and keeps the section gap on both sides of it. The gap
//     is the same whatever holds the sections: a Stack, a Form and a Dialog body publish their own gap
//     (--form-gap) and the section takes it off.
//   - `kind="summary"` is the closing block (limits, what the action will do, where it is saved): always the last
//     section, with a rule above it. In a Dialog or a Drawer, from 600 px wide, it stays whole above the footer while
//     the fields scroll under it; on a phone, and in a form on the page, it scrolls with the form.
//
// Put sections side by side as direct children of the form's column. A section holds fields and their notes, never
// another section. An untitled section is the leading group (a name, a kind); give it a `label`.
import { useId, type ReactNode } from 'react';
import { cx } from '../controls/Button';
import { Heading } from '../layouts/anatomy/Heading';
import s from './FormSection.module.css';

export interface FormSectionProps {
  /** The group's name: a heading one type step above the field labels. Leave it out only for the leading group. */
  title?: string;
  /** One line about the whole group, directly under the title (or first, without one). */
  description?: ReactNode;
  /** `group` (default): fields. `summary`: the form's closing block, kept whole above the footer. */
  kind?: 'group' | 'summary';
  /** The accessible name of an untitled section. */
  label?: string;
  className?: string;
  children: ReactNode;
}

export function FormSection({ title, description, kind = 'group', label, className, children }: FormSectionProps) {
  const titleId = useId();
  const descId = useId();
  const named = Boolean(title || label);
  return (
    <div
      className={cx(s.section, kind === 'summary' && s.summary, className)}
      data-form-section={kind}
      role={named ? 'group' : undefined}
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : label}
      aria-describedby={description ? descId : undefined}
    >
      {(title || description) && (
        <div className={s.head}>
          {title && <Heading id={titleId}>{title}</Heading>}
          {description && (
            <p id={descId} className={s.description}>
              {description}
            </p>
          )}
        </div>
      )}
      <div className={s.body}>{children}</div>
    </div>
  );
}
