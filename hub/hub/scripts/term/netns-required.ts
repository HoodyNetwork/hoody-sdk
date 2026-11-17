// netns-required.ts: the first import of an entry that must not re-run itself (build/measure.ts and build/ship-run.ts:
// measure.ts is also compiled into the --compile proof binary, where netns.sh is not beside it). Outside the OS boundary
// (netns.ts confined(): loopback-only network AND the boundary's root) it refuses at once, exit 3, before anything else
// of the entry is evaluated. Its runners (ship-gate.ts, the proofs) run inside the boundary already.
import { confined } from './netns';

if (!confined()) {
  process.stderr.write('netns: refused: TERM_NETNS_NOT_CONFINED (run it from a confined runner: build/ship-gate.ts)\n');
  process.exit(3);
}
