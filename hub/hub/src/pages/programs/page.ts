// Manifest of the programs page (PageManifest, src/kit/page.ts). Discovered by glob: nothing
// else registers it. Status 'ready'.
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'programs',
  path: '/programs',
  title: 'title',
  description: 'Programs on the selected computer: start, stop and restart them, read their logs, open or share each address with its QR code, and launch an app from the Apps tab.',
  nav: { group: 'build', order: 10, icon: 'hoody-services', label: 'nav' },
  layout: 'list-detail',
  load: () => import('./view'),
  searchHide: { load: () => import('./searchHide') },
  status: 'ready',
  sensitive: false,
  needs: { computer: 'required' },
  strings,
  commands: [{ id: 'open', label: 'cmd.open', keywords: ['background', 'services', 'processes', 'start', 'stop', 'restart'] }],
});
