// Manifest of the home page (PageManifest, src/kit/page.ts). Discovered by glob: nothing
// else registers it. Status 'ready'.
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'home',
  path: '/home',
  title: 'title',
  description: 'Home: what needs you, your computer and its programs, your realms, shortcuts and widgets, and a quick ask for the agent. New accounts start with a welcome and first steps.',
  nav: { group: 'main', order: 0, icon: 'hoody-overview', label: 'nav' },
  layout: 'dashboard',
  load: () => import('./view'),
  status: 'ready',
  sensitive: false,
  strings,
  commands: [
    { id: 'open', label: 'cmd.open' },
    { id: 'customize', label: 'cmd.customize', to: '/home?customize=1', keywords: ['widgets', 'cards', 'dashboard'] },
    { id: 'intro', label: 'cmd.intro', to: '/home?intro=1', keywords: ['welcome', 'tour', 'start', 'help', 'realms'] },
  ],
});
