// netns-roots.ts: prints the named roots of netns-read.list, one `<name>\t<path>` per line for every name of
// scripts/lib.ts READ_ROOT_NAMES, the path empty when the host file (READ_ROOTS_FILE) names none, for netns.sh. netns.sh
// runs it with an empty environment, from /, before it builds the boundary's file view; a bad host file exits non-zero.
import { READ_ROOT_NAMES, readRoots } from '../lib';

const roots = readRoots();
for (const name of READ_ROOT_NAMES) process.stdout.write(`${name}\t${roots[name] ?? ''}\n`);
