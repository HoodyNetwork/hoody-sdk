// Named screenshot states of the __ID__ page (`bun run hub:shots --page __ID__`). Every state must
// render its own case (identical PNGs fail). A state named *loading* shows skeletons; every other
// waits for data. A state named *pending*/*unknown*/*failed* performs the action with `act` and
// must end with that Outcome line visible. A read that failed is *error*, not *failed*.
import type { Shots } from '@app/shots.types';

const restart = [{ click: 'Restart failed' }];

export default [
  { name: 'many', extra: ['1024-light'] },
  { name: 'empty', state: 'empty' },
  { name: 'error', state: 'error' },
  { name: 'loading', state: 'loading' },
  { name: 'save-unknown', state: 'save-unknown', act: restart },
  { name: 'save-failed', state: 'save-failed', act: restart },
] satisfies Shots;
