// A computer's name as a link to that computer's page: use it wherever a line names a computer, instead of plain text.
// The target is the computer's handle (name.last4, never the full id). A page this load does not serve, or a computer
// the caller cannot name (a deleted one), keeps the name as plain text; inside a button or another link the caller
// passes `plain` (no nested interactive element). `cut` clips in the link itself: a clipping wrapper would cut its focus ring.
import { computerHandle, computerHref } from '@core';
import { usePageLink } from '../../shell/pageLinks';
import { Link } from './Link';
import s from './ComputerLink.module.css';

export interface ComputerLinkProps {
  /** The computer's display name: the label, shown as given. */
  name: string;
  /** The computer's handle (`name.last4`), when the caller has it. */
  handle?: string;
  /** The computer's full id, when the caller has no handle; the handle is made from it and the id is never shown. */
  id?: string;
  /** `inline` (default) inside a sentence; `nav` for a name standing on its own (a table cell, a fact). */
  variant?: 'inline' | 'nav';
  /** Keep the name as text: the caller is inside a button or a link. */
  plain?: boolean;
  /** One line, cut at the end with an ellipsis (a table cell); the text form cuts the same way. */
  cut?: boolean;
  /** Underlined at rest (Link `underlined`): the name inside a line of muted text. */
  underlined?: boolean;
}

export function ComputerLink({ name, handle, id, variant = 'inline', plain = false, cut = false, underlined = false }: ComputerLinkProps) {
  const link = usePageLink('computers');
  const h = handle || (id ? computerHandle({ id, name }) : '');
  if (plain || !h || !name || !link) return cut ? <span className={s.cut}>{name}</span> : <>{name}</>;
  return (
    <Link href={computerHref(h)} variant={variant} underlined={underlined} {...(cut ? { className: s.cut } : {})}>
      {name}
    </Link>
  );
}
