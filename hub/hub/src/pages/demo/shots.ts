// Named screenshot states of the demo page (`bun run hub:shots --page demo`). Every state must
// render its own case (identical PNGs fail). A state named *loading* shows skeletons; every other
// waits for data. A state named *pending*/*unknown*/*failed* performs the action with `act` and
// must end with that Outcome line visible. A read that failed is *error*, not *failed*.
import type { Shots } from '@app/shots.types';

export default [
  { name: 'many', extra: ['1024-light', '1440-dock'] },
  { name: 'detail', path: '?sel=item-02', extra: ['1024-light', '1440-dock'] },
  { name: 'detail-hidden', path: '?sel=item-02', keys: ['Backslash'] },
  { name: 'side', path: '?mode=side&sel=item-02', extra: ['1440-dock'] },
  { name: 'palette', keys: ['Control+k'] },
  { name: 'shortcuts', keys: ['Shift+Slash'] },
  { name: 'filtered', path: '?status=failed' },
  { name: 'no-match', path: '?q=zzzz' },
  { name: 'empty', state: 'empty' },
  { name: 'error', state: 'error' },
  { name: 'loading', state: 'loading' },
  { name: 'save-unknown', state: 'save-unknown', path: '?sel=item-02', act: [{ click: 'Edit' }, { fill: 'Name', text: 'atlas-2' }, { click: 'Save' }] },
  { name: 'save-failed', state: 'save-failed', path: '?sel=item-02', act: [{ click: 'Edit' }, { fill: 'Name', text: 'atlas-2' }, { click: 'Save' }] },
] satisfies Shots;
