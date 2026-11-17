// Named screenshot states of the __ID__ page (`bun run hub:shots --page __ID__`). Every state must
// render its own case (identical PNGs fail). A state named *loading* shows skeletons; every other
// waits for data. A state named *pending*/*unknown*/*failed* performs the action with `act` and
// must end with that Outcome line visible. A read that failed is *error*, not *failed*.
import type { Shots } from '@app/shots.types';

const rename = [{ click: 'Edit' }, { fill: 'Name', text: 'atlas-2' }, { click: 'Save' }];

export default [
  { name: 'default' },
  { name: 'activity', path: '?tab=activity' },
  { name: 'edit', path: '?edit=1' },
  { name: 'empty', state: 'empty', path: '?tab=activity' },
  { name: 'error', state: 'error' },
  { name: 'loading', state: 'loading' },
  { name: 'save-unknown', state: 'save-unknown', act: rename },
  { name: 'save-failed', state: 'save-failed', act: rename },
] satisfies Shots;
