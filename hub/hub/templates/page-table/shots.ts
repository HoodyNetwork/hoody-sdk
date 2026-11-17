// Named screenshot states of the __ID__ page (`bun run hub:shots --page __ID__`). Every state must
// render its own case (identical PNGs fail). A state named *loading* shows skeletons; every other
// waits for data. A state named *pending*/*unknown*/*failed* performs the action with `act` and
// must end with that Outcome line visible. A read that failed is *error*, not *failed*.
import type { Shots } from '@app/shots.types';

export default [
  { name: 'many' },
  { name: 'filtered', path: '?status=failed' },
  { name: 'sorted', path: '?sort=-size' },
  { name: 'no-match', path: '?q=zzzz' },
  { name: 'edit', path: '?edit=item-02' },
  { name: 'empty', state: 'empty' },
  { name: 'error', state: 'error' },
  { name: 'loading', state: 'loading' },
  { name: 'save-unknown', state: 'save-unknown', path: '?edit=item-02', act: [{ fill: 'Name', text: 'atlas-2' }, { click: 'Save' }] },
  { name: 'save-failed', state: 'save-failed', path: '?edit=item-02', act: [{ fill: 'Name', text: 'atlas-2' }, { click: 'Save' }] },
] satisfies Shots;
