import { formatDateTime, formatRelative } from '../format';

export interface WhenProps {
  /** The moment: a Date, an ISO text or epoch milliseconds. */
  at: Date | string | number;
  /** The words to show in place of the relative time ("ends in 3 hours"), for a page that words the moment itself. */
  text?: string;
}

/**
 * A moment in a cell, a fact or a line: the relative time ("3 minutes ago"), with the exact date and time on hover
 * and for assistive technology (`<time dateTime>`). Every "when" a page shows is this part, so the two formats never
 * differ from page to page. A value that is not a date shows the words alone (nothing when there are none).
 */
export function When({ at, text }: WhenProps) {
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return <>{text ?? ''}</>;
  return (
    <time dateTime={d.toISOString()} title={formatDateTime(d)}>
      {text ?? formatRelative(d)}
    </time>
  );
}
