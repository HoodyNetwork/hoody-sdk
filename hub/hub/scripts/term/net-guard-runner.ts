// net-guard-runner.ts: the fence for gate runners and their Bun children (BUN_OPTIONS=--preload, set by child-env.ts
// via net-policy guardEnv), and the first module of every Bun Worker a fenced process starts. Mode from HUB_NET_FENCE:
// a Worker of a test process is fenced as a test; everything else as a runner (test-net-guard.ts).
import { installNetGuard } from './test-net-guard';

await installNetGuard({ mode: process.env.HUB_NET_FENCE === 'test' ? 'test' : 'runner' });
