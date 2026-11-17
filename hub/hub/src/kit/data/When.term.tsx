// When in the terminal: the same relative words ("3 minutes ago"), with the exact date and time as the semantics
// description (the web's `<time dateTime>` and hover title; a terminal has no hover). Differs from the web file only
// because a raw `<time>` element has no terminal drawing; inside running text it is the words alone (an inline span).
import type * as Web from './When';
import { Text, useInText } from '../../term/prim';
import { formatDateTime, formatRelative } from '../format';

export type { WhenProps } from './When';

export const When: typeof Web.When = ({ at, text }) => {
  const inText = useInText();
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return <>{text ?? ''}</>;
  const words = text ?? formatRelative(d);
  // The role and name carry the description: the semantics tree keeps no description on a node without a role.
  return inText ? <>{words}</> : <Text sem={{ role: 'text', name: words, description: formatDateTime(d) }}>{words}</Text>;
};
