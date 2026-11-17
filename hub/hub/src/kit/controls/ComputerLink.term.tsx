// ComputerLink in the terminal: the computer's name as a kit Link to that computer's page, under the web's rules: the
// target is the handle (name.last4, never the full id); a page this load does not serve, a computer the caller cannot
// name, or `plain` keeps the name as text. `cut` keeps the text form on one line, cut at the end.
import type * as Web from './ComputerLink';
import { computerHandle, computerHref } from '@core';
import { usePageLink } from '../../shell/pageLinks';
import { Text } from '../../term/prim';
import { Link } from './Link';

export type { ComputerLinkProps } from './ComputerLink';

export const ComputerLink: typeof Web.ComputerLink = ({ name, handle, id, variant = 'inline', plain = false, cut = false, underlined = false }) => {
  const link = usePageLink('computers');
  const h = handle || (id ? computerHandle({ id, name }) : '');
  if (plain || !h || !name || !link) return cut ? <Text truncate>{name}</Text> : <>{name}</>;
  return <Link href={computerHref(h)} variant={variant} underlined={underlined}>{name}</Link>;
};
