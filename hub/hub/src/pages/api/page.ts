// Manifest of the API page: an index of every endpoint
// of the Hoody API, how to call it (with your computer's address for a program on it), and its docs page. Discovered by
// glob. The catalog is its own chunk, loaded when the page opens (catalog.ts loadCatalog).
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'api',
  path: '/api',
  title: 'title',
  description: 'The API: every endpoint of the platform, ready-to-run snippets for your computer, and links to the docs.',
  // In the sidebar right after Keys, outside the Help foot; shell/nav.ts NAV_PLACE places it (this matches it).
  nav: { group: 'account', order: 35, icon: 'hoody-code', label: 'nav' },
  layout: 'list-detail',
  // One screen: the endpoint list, its open endpoint in ?op (ListDetailPage); no sub-path.
  screens: [{ id: 'endpoints', path: '' }],
  load: () => import('./view'),
  status: 'ready',
  sensitive: false,
  strings,
  commands: [{ id: 'open', label: 'cmd.open', keywords: ['api', 'endpoint', 'rest', 'http', 'curl', 'sdk', 'reference'] }],
});
