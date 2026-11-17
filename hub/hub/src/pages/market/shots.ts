// Named screenshot states of the old market route (`bun run hub:shots --page market`). The page is only the old link
// now: it lands on the Bare metal view of Plans & billing, whose shots show the servers (pages/billing/shots.ts, "servers-").
import type { Shots } from '@app/shots.types';

export default [{ name: 'redirect' }] satisfies Shots;
