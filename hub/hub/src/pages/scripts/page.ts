// Manifest of the scripts page (PageManifest, src/kit/page.ts). Discovered by glob: nothing
// else registers it. Status 'ready': no hidden pages in this dev/test environment.
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'scripts',
  path: '/scripts',
  title: 'title',
  description: 'Your scripts: small programs that answer an address or run on a schedule. See how each one is doing, change it with a check before it goes live, test it, share it, protect it with a key, and delete it.',
  nav: { group: 'build', order: 30, icon: 'hoody-code', label: 'nav' },
  layout: 'list-detail',
  load: () => import('./view'),
  status: 'ready',
  sensitive: true,
  strings,
  commands: [
    { id: 'open', label: 'cmd.open' },
    { id: 'new', label: 'cmd.new' },
  ],
});
