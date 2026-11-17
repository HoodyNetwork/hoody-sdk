// Behaviour contract of NavPending (src/term/scenario). The web draws a thin delayed line, hidden
// from assistive tech, while the next page loads; the terminal draws nothing for it (the nav marks the new page at
// once and ShownPageWait in src/term/shell/TermShell.tsx says when a page is slow to come). Both share: never a
// control, never announced.
import { scenarios } from '../kit/scenario-types';
import { NavPending } from './pageHost';

export default scenarios('NavPending', NavPending, {
  ignored: { on: 'decoration only on the web (aria-hidden line); the terminal shows a slow page through ShownPageWait instead' },
  cases: [
    {
      name: 'the pending mark is nothing to press or read',
      props: { on: true },
      steps: [],
      expect: { nodes: [{ target: { role: 'button' }, absent: true }, { target: { role: 'status' }, absent: true }] },
    },
  ],
});
