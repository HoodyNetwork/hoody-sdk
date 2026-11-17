// Manifest of the notes page (PageManifest, src/kit/page.ts). Discovered by glob: nothing
// else registers it. Status 'ready': the page is never hidden.
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'notes',
  path: '/notes',
  title: 'title',
  description: 'The recent notes on your computers, each opened right here or in its own tab, a Markdown download, a New note, and a link to open Notes itself.',
  nav: { group: 'build', order: 30, icon: 'hoody-notes', label: 'nav' },
  layout: 'list-detail',
  load: () => import('./view'),
  status: 'ready',
  sensitive: false,
  strings,
  commands: [
    { id: 'open', label: 'cmd.open', keywords: ['notes', 'markdown'] },
    { id: 'new', label: 'action.new', to: '/notes?new=1', icon: 'plus', keywords: ['note', 'add', 'write'] },
  ],
});
