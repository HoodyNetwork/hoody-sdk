// Time budgets for the conformance tests that run a real linter (ESLint or stylelint with the Hub config). Their cost
// is CPU: config and plugin load, then the lint. A budget is written as the time on a free core and stretched by how
// loaded the host is (run queue per core, 1x on a quiet host, 10x at most), so a busy host does not turn a slow start
// into a red, and a hang still ends the test. Test-only.
import { availableParallelism, loadavg } from 'node:os';

/** The stretch for the host's load now: the one-minute run queue per core, between 1 and 10. */
export const loadFactor = (load = loadavg()[0] ?? 0, cores = availableParallelism()): number => Math.min(10, Math.max(1, load / Math.max(1, cores)));

/** `ms` on a free core as a timeout on this host now. */
export const lintMs = (ms: number): number => Math.round(ms * loadFactor());
