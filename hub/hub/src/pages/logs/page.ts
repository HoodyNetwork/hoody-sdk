// Manifest of the logs page (PageManifest, src/kit/page.ts). Discovered by glob: nothing
// else registers it. Status 'ready'.
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'logs',
  path: '/logs',
  title: 'title',
  description: 'Logs: read what happened on a computer (visits, Bots, changes, scripts, programs), see what failed, watch live, explain a problem with the AI helper (nothing sent until Ask), and export it with secrets removed.',
  nav: { group: 'build', order: 40, icon: 'hoody-logs', label: 'nav' },
  layout: 'list-detail',
  load: () => import('./view'),
  status: 'ready',
  sensitive: true,
  needs: { computer: 'required' },
  strings,
  commands: [{ id: 'open', label: 'cmd.open', keywords: ['activity', 'errors', 'failed', 'visits', 'history', 'export'] }],
});
