// Named screenshot states of the __ID__ page (`bun run hub:shots --page __ID__`). Every state must
// render its own case (identical PNGs fail). A state named *loading* shows skeletons; every other
// waits for data. A state named *pending*/*unknown*/*failed* performs the action with `act` and
// must end with that Outcome line visible. A read that failed is *error*, not *failed*.
import type { Shots } from '@app/shots.types';

// Walk the three steps: the step lives in the URL, but the typed name does not.
const create = [{ fill: 'Name', text: 'atlas' }, { click: 'Next' }, { click: 'Next' }, { click: 'Create' }];

export default [
  { name: 'default' },
  { name: 'plan', act: [{ fill: 'Name', text: 'atlas' }, { click: 'Next' }] },
  { name: 'review', act: [{ fill: 'Name', text: 'atlas' }, { click: 'Next' }, { click: 'Next' }] },
  { name: 'empty', state: 'empty', act: [{ fill: 'Name', text: 'atlas' }, { click: 'Next' }] },
  { name: 'error', state: 'error' },
  { name: 'loading', state: 'loading' },
  { name: 'save-unknown', state: 'save-unknown', act: create },
  { name: 'save-failed', state: 'save-failed', act: create },
] satisfies Shots;
