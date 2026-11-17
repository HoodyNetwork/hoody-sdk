// Manifest of the Board page: a tiling grid of program frames, per realm.
// Discovered by glob. Status 'ready' (no hidden pages in this dev/test environment).
// sensitive: the Board holds program frames, so the shell's framed lock refuses it inside another page.
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'board',
  path: '/board',
  title: 'title',
  description: 'Board: programs of your computers side by side (split layouts, presets, focus mode), saved per account and realm on this browser.',
  nav: { group: 'main', order: 50, icon: 'hoody-canvas', label: 'nav' },
  navCount: { load: () => import('./navCount'), label: 'nav.count', tip: 'nav.countTip' },
  layout: 'canvas',
  load: () => import('./view'),
  status: 'ready',
  sensitive: true,
  strings,
  commands: [{ id: 'open', label: 'cmd.open' }],
});
