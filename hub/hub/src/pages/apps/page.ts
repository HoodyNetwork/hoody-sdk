// Manifest of the old apps route (PageManifest, src/kit/page.ts). Discovered by glob: nothing else registers
// it. The launcher lives in the Apps tab of Programs (launch/); this route only redirects
// old /apps links there, so it has no nav entry and no commands.
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'apps',
  path: '/apps',
  title: 'title',
  description: 'An old address: the app launcher lives in Programs (Apps tab) and on the Board (Add a program > Launch an app); /apps opens it there.',
  layout: 'custom',
  load: () => import('./view'),
  status: 'ready', // the redirect is on (no nav entry, so nothing new shows in the menu)
  sensitive: false,
  needs: { computer: 'required' },
  strings,
});
