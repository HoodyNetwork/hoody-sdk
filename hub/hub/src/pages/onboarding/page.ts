// Manifest of the onboarding page (PageManifest, src/kit/page.ts). Discovered by glob: nothing else registers it.
// A loading screen for a new account: the real steps of its first computer, and cards that say what Hoody does.
// No nav entry: Home sends a new account here once, and "Take the tour" (a command, Home's Welcome) opens it again.
import { definePage } from '@kit';
import { SCREENS } from './screens';
import strings from './strings.en.json';

export default definePage({
  id: 'onboarding',
  path: '/onboarding',
  title: 'title',
  description: 'Welcome: an animated first-run page with the Hoody logo, your first computer\'s real setup steps, and what you can do with Hoody.',
  layout: 'canvas',
  screens: SCREENS,
  load: () => import('./view'),
  status: 'ready',
  sensitive: false,
  strings,
  // The terminal Hub draws this page's title and this hand-off in place of the view.
  handoff: { reason: 'term.reason', what: 'term.what' },
  commands: [{ id: 'open', label: 'cmd.open', keywords: ['welcome', 'tour', 'onboarding', 'start', 'intro', 'help', 'first'] }],
});
