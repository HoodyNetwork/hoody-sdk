// Manifest of the Files page. Discovered by glob: nothing else registers it.
// Status 'ready' (no hidden pages).
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'files',
  path: '/files',
  title: 'title',
  description: 'Files: the folders of every computer of the realm in two panes (browse, change, upload, copy, download from a link), and Transfers: what moves on each computer.',
  nav: { group: 'main', order: 25, icon: 'files', label: 'nav' },
  layout: 'table',
  load: () => import('./view'),
  searchHide: { load: () => import('./searchHide') },
  status: 'ready',
  sensitive: false,
  strings,
  commands: [{ id: 'open', label: 'cmd.open' }],
});
