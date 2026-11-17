// Manifest of the vault page (PageManifest, src/kit/page.ts). Security tier: a secrets page.
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'vault',
  path: '/vault',
  title: 'title',
  description: 'Values your tools and agents read by name, per realm or global: shown only on request, encrypted with a password if you want.',
  nav: { group: 'main', order: 110, icon: 'lock', label: 'nav' },
  layout: 'list-detail',
  load: () => import('./view'),
  status: 'ready',
  sensitive: true,
  strings,
  commands: [
    { id: 'open', label: 'cmd.open' },
    // Opens the New entry form, not just the list.
    { id: 'new', label: 'cmd.new', to: '/vault?edit=new', icon: 'plus' },
  ],
});
