// The notifications page: the Inbox (/notifications), the Notices about your servers (/notifications/notices) and the
// Get notified guide (/notifications/learn).
import { useSubPath } from '@kit';
import { Inbox } from './parts/Inbox';
import { Learn } from './parts/Learn';
import { Notices } from './parts/Notices';

export default function NotificationsPage() {
  const [sub] = useSubPath('/notifications');
  return sub === 'learn' ? <Learn /> : sub === 'notices' ? <Notices /> : <Inbox />;
}
