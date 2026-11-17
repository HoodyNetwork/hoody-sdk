// Manifest of the Tunnels page (PageManifest, src/kit/page.ts). Discovered by glob: nothing else registers it.
// What is connected to the selected computer right now, read from its tunnel
// program. Status 'ready': no hidden pages in this environment.
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'tunnels',
  path: '/tunnels',
  title: 'title',
  description: 'What is connected to the selected computer through its tunnel program: laptop apps put online (web addresses) and laptop services brought into the computer, grouped by session.',
  nav: { group: 'build', order: 45, icon: 'hoody-services', label: 'nav' },
  layout: 'list-detail',
  load: () => import('./view'),
  searchHide: { load: () => import('./searchHide') },
  status: 'ready',
  sensitive: false,
  needs: { computer: 'required' },
  strings,
  commands: [{ id: 'open', label: 'cmd.open', keywords: ['tunnel', 'expose', 'pull', 'laptop', 'localhost', 'port forward'] }],
});
