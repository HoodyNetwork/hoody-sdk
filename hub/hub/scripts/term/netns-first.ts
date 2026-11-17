// netns-first.ts: the FIRST import of every test entry (test-preload.ts and each runnable script under scripts/term:
// netns.term.test.ts 'every entry'). Re-runs the process inside the OS boundary (netns.ts / netns.sh)
// unless it is already there; synchronous, so no later import of the entry evaluates outside it.
import { ensureConfined } from './netns';

ensureConfined();
