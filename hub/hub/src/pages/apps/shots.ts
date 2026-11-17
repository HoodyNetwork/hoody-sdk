// Named screenshot states of the apps page (`bun run hub:shots --page apps`). The page is only the old link now:
// it lands on the Apps tab of Programs, whose shots show the launcher (pages/programs/shots.ts, "apps-" shots).
import type { Shots } from '@app/shots.types';

export default [{ name: 'redirect' }] satisfies Shots;
