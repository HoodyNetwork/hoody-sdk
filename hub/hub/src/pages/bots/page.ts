// Manifest of the bots page (PageManifest, src/kit/page.ts). Discovered by glob: nothing
// else registers it. Status 'ready' (no hidden pages in this dev/test environment).
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'bots',
  path: '/bots',
  title: 'title',
  description: 'Your Bots: see what each one is doing, answer the ones that wait for you, and manage their link, keys and chat apps.',
  nav: { group: 'main', order: 30, icon: 'hoody-bots', label: 'nav' },
  layout: 'list-detail',
  load: () => import('./view'),
  status: 'ready',
  sensitive: true,
  strings,
  widgets: [{ id: 'bots', title: 'widget.title', size: 's', order: 20, load: () => import('./widget') }],
  commands: [{ id: 'open', label: 'cmd.open' }],
  // A Bot in another page's tile (the Board's Bots section); the target is the Bot's row key.
  tileViews: [{ id: 'bot', title: 'tile.title', load: () => import('./tile') }],
});
