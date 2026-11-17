// Named screenshot states of the onboarding page (`bun run hub:shots --page onboarding`).
import type { Shots } from '@app/shots.types';

export default [
  { name: 'ready', extra: ['390-dark'] },
  { name: 'making', state: 'making' },
  { name: 'reserved', state: 'reserved', realm: 'all' },
  { name: 'looking', state: 'looking', realm: 'all' },
  { name: 'needs-invite', state: 'invite', realm: 'all' },
  { name: 'stopped', state: 'stopped' },
  { name: 'did-not-start', state: 'failed' },
  { name: 'loading', state: 'loading' },
  { name: 'error', state: 'error' },
  { name: 'asking', state: 'asking', extra: ['390-dark'] },
  { name: 'asking-last', state: 'askingLast' },
  { name: 'asking-ready', state: 'askingReady' },
] satisfies Shots;
