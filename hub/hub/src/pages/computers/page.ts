// Manifest of the computers page (PageManifest, src/kit/page.ts). Discovered by glob: nothing
// else registers it. Status 'ready' (no hidden pages in this dev/test environment).
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'computers',
  path: '/computers',
  title: 'title',
  description: 'Your computers: start and stop them, open a terminal, run a command, see programs and ports, and manage SSH access.',
  nav: { group: 'main', order: 20, icon: 'hoody-virtual-server', label: 'nav' },
  layout: 'list-detail',
  load: () => import('./view'),
  status: 'ready',
  sensitive: false,
  strings,
  widgets: [{ id: 'your-computer', title: 'widget.title', size: 'm', order: 10, load: () => import('./widget') }],
  commands: [{ id: 'open', label: 'cmd.open' }],
});
