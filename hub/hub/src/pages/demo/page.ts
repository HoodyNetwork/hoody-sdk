// Manifest of the demo page (PageManifest, src/kit/page.ts). Discovered by glob: nothing
// else registers it. New pages land dark (status 'hidden'); `hub:dev --page demo` shows it.
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'demo',
  path: '/demo',
  title: 'title',
  description: 'Demo: a list/detail page showing the page layout with fixture data.',
  nav: { group: 'main', order: 100, icon: 'apps', label: 'nav' },
  layout: 'list-detail',
  load: () => import('./view'),
  status: 'hidden',
  sensitive: false,
  strings,
  commands: [{ id: 'open', label: 'cmd.open' }],
});
