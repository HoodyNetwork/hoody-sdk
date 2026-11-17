// "Held on <page>": the link from a held change to the page that sent it, shared by every page that shows
// another page's hold read-only. It exists only while this load serves that page (useServedPageLink): a
// hidden page gets no link, and `fallback` (default nothing) shows instead.
import type { ReactNode } from 'react';
import { Link } from '@kit/controls/Link';
import { placeUnder, useServedPageLink } from './pageLinks';

export interface HeldFromLinkProps {
  /** The sender page's id (a hold's `from.page`); empty names no page. */
  page: string;
  /** A place under that page (e.g. '/keys/abc'); anything not plainly under it (placeUnder) goes to the page. */
  path?: string;
  /** Shown instead when the page is not served. */
  fallback?: ReactNode;
  children: ReactNode;
}

export function HeldFromLink({ page, path, fallback = null, children }: HeldFromLinkProps) {
  const link = useServedPageLink(page);
  if (!page || !link) return <>{fallback}</>;
  const href = path ? placeUnder(link, path) : link.href;
  return (
    <Link href={href} variant="inline">
      {children}
    </Link>
  );
}
