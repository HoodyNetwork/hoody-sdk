// Manifest of the __ID__ page (PageManifest, src/kit/page.ts). Discovered by glob: nothing
// else registers it. New pages land dark (status 'hidden'); `hub:dev --page __ID__` shows it.
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: '__ID__',
  path: '/__ID__',
  title: 'title',
  description: 'What this page is for (never shown).',
  nav: { group: 'main', order: 100, icon: 'apps', label: 'nav' },
  layout: 'list-detail',
  load: () => import('./view'),
  status: 'hidden',
  sensitive: false,
  strings,
  commands: [{ id: 'open', label: 'cmd.open' }],
});
