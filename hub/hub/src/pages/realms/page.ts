// Manifest of New realm (PageManifest, src/kit/page.ts). Discovered by glob: nothing else
// registers it. No nav entry: the realm switcher's "New realm…" links here (shell, links.ts); served (ready) so the
// switcher offers it.
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'realms',
  path: '/realms/new',
  title: 'title',
  description: 'Make a new realm (a name and a colour; computers optional, an empty realm is allowed).',
  layout: 'wizard',
  // One screen; the wizard's step is a query parameter (?step=), not a sub-path.
  screens: [{ id: 'new', path: '' }],
  load: () => import('./view'),
  status: 'ready',
  sensitive: false,
  strings,
  // Jump to finds New realm by what it is for, not only by its title.
  commands: [{ id: 'new', label: 'cmd.new', keywords: ['create', 'add', 'realm', 'separate', 'space', 'share'] }],
});
