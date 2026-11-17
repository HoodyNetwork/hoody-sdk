// A link into another Hub page (named PageLinkTo because `PageLink` is the shell's link type): a router link when this
// load serves the page, nothing when it hides it, or the plain label when `plain` is set. Use `Link` instead when the
// target is not a Hub page. A page link is always a Hub link (`PageLink` in shell/pageLinks has the one kind).
import type { ReactNode } from 'react';
import { usePageLink } from '../../shell/pageLinks';
import { Link } from './Link';

export interface PageLinkToProps {
  /** The page's id (`computers`); default the first path segment of `href`. */
  page?: string;
  /** The place inside the Hub ('/computers?sel=x'). */
  href: string;
  children: ReactNode;
  variant?: 'inline' | 'plain' | 'nav';
  /** Keep the label as plain text when there is nowhere to go (default: render nothing). */
  plain?: boolean;
}

export function PageLinkTo({ page, href, children, variant = 'nav', plain = false }: PageLinkToProps) {
  const link = usePageLink(page ?? href.split(/[/?#]/)[1] ?? '');
  if (!link) return plain ? <>{children}</> : null;
  return <Link href={href} variant={variant}>{children}</Link>;
}
