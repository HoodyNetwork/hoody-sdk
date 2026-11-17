// Named screenshot states of the __ID__ page (`bun run hub:shots --page __ID__`). Every state must
// render its own case (identical PNGs fail). A state named *loading* shows skeletons; every other
// waits for data. A state named *pending*/*unknown*/*failed* performs the action with `act` and
// must end with that Outcome line visible. A read that failed is *error*, not *failed*.
import type { Shots } from '@app/shots.types';

const rename = [{ fill: 'Name', text: 'atlas-team' }, { click: 'Save changes' }];

export default [
  { name: 'default' },
  { name: 'section', path: '?section=notifications' },
  { name: 'dirty', act: [{ fill: 'Name', text: 'atlas-team' }] },
  { name: 'empty', state: 'empty', path: '?section=notifications' },
  { name: 'error', state: 'error' },
  { name: 'loading', state: 'loading' },
  { name: 'save-unknown', state: 'save-unknown', act: rename },
  { name: 'save-failed', state: 'save-failed', act: rename },
] satisfies Shots;
