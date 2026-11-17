// The kit gallery (/_kit): every kit component in every state. Its shots are the kit's
// acceptance test. Shown in fixtures mode only (dev, shots, specs); never in the sidebar or the production build.
import { definePage } from '../page';
import strings from './strings.en.json';

export default definePage({
  id: 'kit-gallery',
  path: '/_kit',
  title: 'title',
  layout: 'custom',
  load: () => import('./view'),
  status: 'hidden',
  sensitive: false,
  strings,
});
