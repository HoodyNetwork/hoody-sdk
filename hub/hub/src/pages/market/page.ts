// Manifest of the old market route (PageManifest, src/kit/page.ts). Discovered by glob: nothing else registers
// it. The Market is the Bare metal view of Plans & billing; this route only redirects old /market links there (the
// sign-in view name and usePageLink('market') callers keep working), so it has no nav entry and one screen.
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'market',
  path: '/market',
  title: 'title',
  description: 'Bare metal: the old /market address. It opens the Bare metal view of Plans & Billing with the listing, reservations and filters the link named.',
  layout: 'detail',
  screens: [{ id: 'moved', path: '' }],
  load: () => import('./view'),
  status: 'ready', // the redirect is on (no nav entry, so nothing new shows in the menu)
  sensitive: false,
  strings,
});
