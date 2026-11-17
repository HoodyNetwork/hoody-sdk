// child-group-proof.ts: the live proof that a signal to a gate runner stops its whole child tree (child-group.ts).
//   NODE_ENV=test bun scripts/term/child-group-proof.ts        exit 0 = proven, 1 = a process survived
// A fixture runner (this file with --runner) installs the reaper and starts, through spawnGroup, one child that
// IGNORES SIGTERM and starts a grandchild (both sleep). The proof sends SIGTERM to the runner only, then checks:
// the runner exits 143; child and grandchild are gone within GRACE + 2 s (the ignored TERM is followed by SIGKILL of
// the group). A second case: the runner leaves by an uncaught exception; its children are killed on exit.
// Not a *.term.test.ts: the test fence (test-net-guard.ts) refuses subprocesses inside tests.
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import fs from 'node:fs';
import { installGroupReaper, spawnGroup } from './child-group';

const GRACE = 1500;
const alivePid = (pid: number): boolean => { try { process.kill(pid, 0); return !fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1]!.startsWith('Z'); } catch { return false; } };

if (process.argv[2] === '--runner') {
  installGroupReaper(GRACE);
  // Child: ignores TERM, starts a grandchild in its own (inherited) group, prints both pids.
  const c = spawnGroup(['bash', '-c', 'trap "" TERM; sleep 600 & echo "$$ $!"; wait'], { stdout: 'pipe', stderr: 'inherit' });
  const line = (await new Response(c.stdout).text().catch(() => '')) || '';
  void line;
  await new Promise(() => {});
} else if (process.argv[2] === '--throw') {
  installGroupReaper(GRACE);
  const c = spawnGroup(['bash', '-c', 'sleep 600 & echo "$$ $!"; wait'], { stdout: 'pipe' });
  const reader = c.stdout.getReader();
  const { value } = await reader.read();
  process.stdout.write(new TextDecoder().decode(value));
  throw new Error('runner fails');
} else {
  let failed = 0;
  const pidsOf = async (p: ReturnType<typeof Bun.spawn>): Promise<number[]> => {
    // The runner's child prints "<child> <grandchild>"; read it from the child's /proc (its stdout is the runner's pipe).
    for (let i = 0; i < 100; i++) {
      await Bun.sleep(50);
      const kids = fs.readFileSync(`/proc/${p.pid}/task/${p.pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean).map(Number);
      const grand = kids.flatMap((k) => { try { return fs.readFileSync(`/proc/${k}/task/${k}/children`, 'utf8').trim().split(/\s+/).filter(Boolean).map(Number); } catch { return []; } });
      if (kids.length && grand.length) return [...kids, ...grand];
    }
    return [];
  };
  {
    const r = Bun.spawn(['bun', import.meta.path, '--runner'], { stdout: 'ignore', stderr: 'pipe' });
    const pids = await pidsOf(r);
    if (pids.length < 2) { process.stdout.write('FAIL: the fixture runner did not start its child tree\n'); process.exit(1); }
    process.kill(r.pid, 'SIGTERM');
    const code = await r.exited;
    await Bun.sleep(300);
    const left = pids.filter(alivePid);
    process.stdout.write(`SIGTERM to runner: exit ${code}; child tree ${pids.join(',')}; still alive: ${left.join(',') || 'none'}\n`);
    if (code !== 143 || left.length) failed++;
    for (const p of left) try { process.kill(p, 'SIGKILL'); } catch { /* gone */ }
  }
  {
    const r = Bun.spawn(['bun', import.meta.path, '--throw'], { stdout: 'pipe', stderr: 'ignore' });
    const out = await new Response(r.stdout).text();
    const code = await r.exited;
    await Bun.sleep(300);
    const pids = out.trim().split(/\s+/).filter(Boolean).map(Number);
    const left = pids.filter(alivePid);
    process.stdout.write(`runner threw: exit ${code}; child tree ${pids.join(',')}; still alive: ${left.join(',') || 'none'}\n`);
    if (code === 0 || pids.length < 2 || left.length) failed++;
    for (const p of left) try { process.kill(p, 'SIGKILL'); } catch { /* gone */ }
  }
  process.stdout.write(failed ? `FAIL: ${failed} case(s)\n` : 'ok: every child group stopped with its runner\n');
  process.exit(failed ? 1 : 0);
}
