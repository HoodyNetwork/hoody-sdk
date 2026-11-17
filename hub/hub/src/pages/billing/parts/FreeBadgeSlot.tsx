// The Free badge as a top-bar slot (the shell lazy-loads this default export before the account menu; manifest field
// topBar in billing/page.ts). The badge renders nothing unless the whole account is known to hold only free servers.
import { FreeBadge } from './FreeBadge';

export default function FreeBadgeSlot() {
  return <FreeBadge />;
}
