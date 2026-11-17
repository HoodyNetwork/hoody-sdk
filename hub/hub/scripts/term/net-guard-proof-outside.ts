// net-guard-proof-outside.ts: the FIRST import of net-guard-proof.ts (netns.term.test.ts 'every entry'), in place of
// netns-first. The boundary's own proof has to start OUTSIDE the boundary to show that each entry enters it. This part
// runs only fixed boundary entries (netns.sh, gate-slot.sh, vitest-narrow.sh, bun scripts/term/<entry>.ts), each of which
// confines itself, with probes that stay on this host; then it re-runs net-guard-proof.ts inside the boundary (the
// fence probes, unchanged) and exits with both results. Already inside (a gate child, or the re-run): returns at once.
//
// The probes, each with a control that sees the planted thing from outside (so a pass is not vacuous):
//   #1  a direct entry (secrets.ts, scenarios.ts, render.ts, goldens.ts, check.ts) with user namespaces unavailable
//       refuses with TERM_NETNS_UNAVAILABLE before any of its own code (exit 3, no other output)
//   #2  BASH_ENV (a startup file that writes a marker) never runs: not in netns.sh, gate-slot.sh, vitest-narrow.sh, nor
//       in the re-run of a direct bun entry; a shell entry started without -p refuses (TERM_NETNS_NOT_PRIVILEGED_SHELL)
//   #3  a pathname socket the caller listens on (/dev/shm, outside the checkout) and an abstract one are unreachable inside;
//       a descriptor the caller passes as fd 3 is not open inside; the caller's HOME (a credentials file) is not there
//   #4  HOODY_TOKEN and the other credential keys of the caller's environment are not in the environment inside
//   #5  a `bun` planted in a checkout directory on the caller's PATH never runs (netns.sh looks the runtime up without them)
//   #6  a pty another session holds open is not there inside (minimal /dev, a devpts instance of its own)
//   #7  a node_modules link beside hub that leads to another repository, /run, /proc, HOME or a node_modules under /dev
//       stops netns.sh (TERM_NETNS_NODE_MODULES_REFUSED, exit 3) before anything runs; a link to a real node_modules
//       elsewhere still binds, read-only (run from a copy of the boundary in a scratch working copy)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { confine, confined, ownCommand, NETNS_SH } from './netns';

if (!confined()) process.exit(outsideThenInside());

function outsideThenInside(): number {
  const here = path.dirname(NETNS_SH);
  const hub = path.resolve(here, '..', '..');
  const bun = process.execPath;
  const tag = `hub-term-proof-${process.pid}`;
  // Planted OUTSIDE the checkout (the checkout is read-write inside, a stated residual): socket and caller HOME under /dev/shm.
  const shm = path.join('/dev/shm', tag);
  const scratch = path.join(hub, '.term-cache', 'tmp', tag);
  fs.mkdirSync(shm, { recursive: true, mode: 0o700 });
  fs.mkdirSync(scratch, { recursive: true });
  const cleanup = (): void => { fs.rmSync(shm, { recursive: true, force: true }); fs.rmSync(scratch, { recursive: true, force: true }); };
  let failed = 0;
  try {
    const SENT = 'SENTINEL-not-a-credential';
    const home = path.join(shm, 'home');
    fs.mkdirSync(path.join(home, '.hoody'), { recursive: true });
    fs.writeFileSync(path.join(home, '.hoody', 'credentials'), SENT);
    const marker = path.join(scratch, 'bash-env-ran');
    const rc = path.join(scratch, 'bash-env-rc');
    fs.writeFileSync(rc, `: > ${JSON.stringify(marker)}\n`);
    const sockPath = path.join(shm, 's.sock');
    const sockAbs = `\0${tag}`;
    const lp = Bun.listen({ unix: sockPath, socket: { data() {} } });
    const la = Bun.listen({ unix: sockAbs, socket: { data() {} } });
    const held = fs.openSync(path.join(home, '.hoody', 'credentials'), 'r');
    const st = fs.fstatSync(held);
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: home, BASH_ENV: rc, ENV: rc, NODE_ENV: 'test',
      HOODY_TOKEN: `hdy_${SENT}`, HOODY_API_KEY: SENT, GITHUB_TOKEN: SENT, OPENROUTER_API_KEY: SENT, HUB_GATE_SLOT_HELD: '1',
      TMPDIR: scratch, HUB_WORK_DIR: scratch, HUB_CACHE_DIR: path.join(scratch, 'cache'),
    };
    // Reports what the process it runs in can reach; plain ESM, the same under Bun and Node.
    const probe = [
      `const net = await import('node:net'); const fs = await import('node:fs'); const os = await import('node:os');`,
      `for (const [k, p] of [['sock-path', ${JSON.stringify(sockPath)}], ['sock-abstract', ${JSON.stringify(sockAbs)}]]) await new Promise((r) => { let c; try { c = net.connect(p); } catch (e) { console.log(k + ': FENCED ' + String(e?.message ?? e).split(':')[0]); return r(0); } const t = setTimeout(() => { console.log(k + ': TIMEOUT'); r(0); }, 3000); c.on('connect', () => { clearTimeout(t); console.log(k + ': CONNECTED'); c.destroy(); r(0); }); c.on('error', (e) => { clearTimeout(t); console.log(k + ': ' + e.code); r(0); }); });`,
      `let fd = 'closed'; for (const f of fs.readdirSync('/proc/self/fd')) { try { const s = fs.fstatSync(Number(f)); if (s.ino === ${st.ino} && s.dev === ${st.dev}) fd = 'OPEN ' + f; } catch {} } console.log('held-fd: ' + fd);`,
      `const env = JSON.stringify(process.env); console.log('env: ' + (env.includes(${JSON.stringify(SENT)}) ? 'LEAK' : 'clean'));`,
      `let h = 'absent'; try { h = fs.readFileSync(${JSON.stringify(path.join(home, '.hoody', 'credentials'))}, 'utf8').includes(${JSON.stringify(SENT)}) ? 'READABLE' : 'other'; } catch {} console.log('caller-home: ' + h);`,
      `process.exit(0);`,
    ].join('\n');
    const report = (name: string, ok: boolean, out: string): void => {
      process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     output: ${out.trim().split('\n').slice(-8).join('\n             ')}`}\n`);
      if (!ok) failed++;
    };
    const go = (cmd: string[], extra: Record<string, string> = {}): { out: string; status: number | null } => {
      const p = spawnSync(cmd[0]!, cmd.slice(1), { cwd: hub, env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe', held], timeout: 120_000 });
      return { out: String(p.stdout) + String(p.stderr), status: p.status };
    };
    // The kernel's answers (netns.sh, gate-slot.sh); under vitest-narrow.sh the node fence may refuse the connect first,
    // so there only "never connected" is required (its kernel view is the same netns.sh boundary).
    const inside = ['held-fd: closed', 'env: clean', 'caller-home: absent'];
    const kernel = ['sock-path: ENOENT', 'sock-abstract: ECONNREFUSED'];
    const sawInside = (out: string, exact: boolean): boolean => inside.every((w) => out.includes(w)) && (exact ? kernel.every((w) => out.includes(w)) : out.includes('sock-path: ') && out.includes('sock-abstract: ')) && !out.includes('CONNECTED');

    // Control: the same probe from outside sees all of it (the planted things are real).
    {
      fs.rmSync(marker, { force: true });
      const r = go(['/bin/bash', '-c', `exec ${JSON.stringify(bun)} -e "$0"`, probe]);
      report('control (outside): socket, abstract socket, fd 3, credentials env, caller HOME and BASH_ENV all reachable', ['sock-path: CONNECTED', 'sock-abstract: CONNECTED', 'held-fd: OPEN', 'env: LEAK', 'caller-home: READABLE'].every((w) => r.out.includes(w)) && fs.existsSync(marker), r.out);
    }
    const entries: [string, string[], boolean][] = [
      ['netns.sh', ['/bin/bash', '-p', NETNS_SH, bun, '-e', probe], true],
      ['gate-slot.sh', ['/bin/bash', '-p', path.join(here, 'gate-slot.sh'), bun, '-e', probe], true],
      ['vitest-narrow.sh (node)', ['/bin/bash', '-p', path.join(here, 'vitest-narrow.sh'), '--fence-probe', probe], false],
    ];
    for (const [name, cmd, exact] of entries) {
      fs.rmSync(marker, { force: true });
      const r = go(cmd);
      report(`${name}: nothing planted by the caller reaches inside, BASH_ENV not run`, sawInside(r.out, exact) && !fs.existsSync(marker), r.out + (fs.existsSync(marker) ? '\nBASH_ENV RAN' : ''));
    }
    // #2: a shell entry started without -p refuses before anything (its own startup file is the caller's choice).
    for (const f of ['netns.sh', 'gate-slot.sh', 'vitest-narrow.sh']) {
      const r = go(['/bin/bash', path.join(here, f), '/bin/true'], { BASH_ENV: '' });
      report(`${f} without -p refuses`, r.status === 3 && r.out.includes('TERM_NETNS_NOT_PRIVILEGED_SHELL'), r.out);
    }
    // #5: a `bun` planted in a checkout directory on the caller's PATH (node_modules/.bin under `bun run`) is never the runtime
    // netns.sh runs before its chroot. Control: the caller's own lookup finds it.
    {
      const bin = path.join(scratch, 'bin');
      fs.mkdirSync(bin, { recursive: true });
      const planted = path.join(scratch, 'planted-bun-ran');
      fs.writeFileSync(path.join(bin, 'bun'), `#!/bin/sh\n: > '${planted}'\nexit 1\n`, { mode: 0o755 });
      const plantedPath = `${bin}:${env.PATH}`;
      go(['/bin/bash', '-c', 'bun'], { PATH: plantedPath });
      const control = fs.existsSync(planted);
      fs.rmSync(planted, { force: true });
      const r = go(['/bin/bash', '-p', NETNS_SH, '/bin/echo', 'RAN-INSIDE'], { PATH: plantedPath });
      report('#5 netns.sh: a bun planted in a checkout directory on PATH never runs (control: the caller finds it)', control && r.status === 0 && r.out.includes('RAN-INSIDE') && !fs.existsSync(planted), r.out + (control ? '' : '\nCONTROL: planted bun not found') + (fs.existsSync(planted) ? '\nPLANTED BUN RAN' : ''));
    }
    // #6: a terminal of another session (a pty the caller holds open) is not there inside. Control: opened from outside.
    {
      const holder = Bun.spawn(['/usr/bin/script', '-qfc', '/bin/sleep 60', '/dev/null'], { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' });
      let pty = '';
      for (let i = 0; i < 100 && !pty; i++) {
        Bun.sleepSync(20);
        try { for (const f of fs.readdirSync(`/proc/${holder.pid}/fd`)) { const t = fs.readlinkSync(`/proc/${holder.pid}/fd/${f}`); if (/^\/dev\/pts\/\d+$/.test(t)) pty = t; } } catch { /* not started yet */ }
      }
      try {
        let control = 'none';
        if (pty) { try { fs.closeSync(fs.openSync(pty, 'r+')); control = 'opened'; } catch (e) { control = String((e as NodeJS.ErrnoException).code); } }
        const r = go(['/bin/bash', '-p', NETNS_SH, bun, '-e', `try { require('node:fs').openSync(${JSON.stringify(pty)}, 'r+'); console.log('pty: OPENED'); } catch (e) { console.log('pty: ' + e.code); }`]);
        report('#6 netns.sh: another session\'s pty is not there inside (control: opened outside)', control === 'opened' && r.out.includes('pty: ENOENT'), `${pty} control=${control}\n${r.out}`);
      } finally { holder.kill(); }
    }
    // #1 + #2: direct entries with user namespaces unavailable refuse first, and the re-run's shell reads no BASH_ENV.
    const noUserns = (cmd: string): string[] => ['/usr/bin/unshare', '-rU', '/bin/bash', '-p', '-c', `echo 0 > /proc/sys/user/max_user_namespaces && ${cmd}; echo "exit=$?"`];
    const q = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;
    for (const f of ['secrets.ts', 'scenarios.ts', 'render.ts', 'goldens.ts', 'check.ts']) {
      fs.rmSync(marker, { force: true });
      const r = go(noUserns(`${q(bun)} ${q(path.join(here, f))} --help`));
      const lines = r.out.trim().split('\n').filter(Boolean);
      report(`direct ${f}: refuses before its own code when the boundary cannot be made`, r.out.includes('netns: refused: TERM_NETNS_UNAVAILABLE') && r.out.includes('exit=3') && lines.length === 2 && !fs.existsSync(marker), r.out);
    }
    for (const [name, cmd] of [
      ['gate-slot.sh', `/bin/bash -p ${q(path.join(here, 'gate-slot.sh'))} /bin/echo RAN-OUTSIDE`],
      ['vitest-narrow.sh', `/bin/bash -p ${q(path.join(here, 'vitest-narrow.sh'))} --fence-probe "console.log('RAN-OUTSIDE')"`],
      ['bun test preload', `cd ${q(hub)} && ${q(bun)} test --preload ./scripts/term/test-preload.ts scripts/term/netns.term.test.ts`],
    ] as const) {
      const r = go(noUserns(cmd));
      report(`netns: ${name} refuses when the boundary cannot be made`, r.out.includes('netns: refused: TERM_NETNS_UNAVAILABLE') && r.out.includes('exit=3') && !r.out.includes('RAN-OUTSIDE'), r.out);
    }
    // #7: netns.sh binds, read-only, what a node_modules in hub or any directory above it leads to; only a real
    // node_modules outside the boundary's fresh and hidden places may be bound. A link planted in this checkout would
    // reach every run beside this one, so the boundary runs from a copy (netns.sh and GUARDED, what it runs before its
    // chroot) in a scratch working copy, with the link planted beside the copy's hub. Control: the planted .env is
    // readable from here, and a link to a real node_modules still binds, read-only.
    {
      const fakeTree = path.join(scratch, 'nm', 'tree');
      const fakeHub = path.join(fakeTree, 'b', 'hub');
      const guarded = /^GUARDED=\(([^)]*)\)/m.exec(fs.readFileSync(NETNS_SH, 'utf8'))?.[1]?.split(/\s+/).filter(Boolean) ?? [];
      for (const f of guarded) { fs.mkdirSync(path.dirname(path.join(fakeHub, f)), { recursive: true }); fs.copyFileSync(path.join(hub, f), path.join(fakeHub, f)); }
      const work = path.join(fakeTree, 'work');
      const api = path.join(scratch, 'nm', 'api');
      const pkgs = path.join(scratch, 'nm', 'pkgs', 'node_modules');
      const devNm = path.join(shm, 'node_modules');
      for (const d of [work, api, pkgs, devNm]) fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(api, '.env'), SENT);
      fs.writeFileSync(path.join(pkgs, 'marker'), 'PKG');
      const link = path.join(fakeHub, 'node_modules');
      const look = [
        `const fs = require('node:fs'); let a = 'absent', m = 'absent', w = 'WRITABLE';`,
        `try { a = fs.readFileSync(${JSON.stringify(path.join(api, '.env'))}, 'utf8') ? 'READABLE' : 'empty'; } catch {}`,
        `try { m = fs.readFileSync(${JSON.stringify(path.join(pkgs, 'marker'))}, 'utf8'); } catch {}`,
        `try { fs.writeFileSync(${JSON.stringify(path.join(pkgs, 'w'))}, 'x'); } catch (e) { w = e.code; }`,
        `console.log('seen api=' + a + ' marker=' + m + ' write=' + w);`,
      ].join(' ');
      const runs: string[] = [];
      let ok = guarded.length > 0 && fs.readFileSync(path.join(api, '.env'), 'utf8') === SENT;
      for (const [name, to] of [['api', api], ['run', '/run'], ['proc', '/proc'], ['home', home], ['dev-nm', devNm], ['control', pkgs]] as const) {
        try { fs.unlinkSync(link); } catch { /* first case */ }
        fs.symlinkSync(to, link);
        const p = spawnSync('/bin/bash', ['-p', path.join(fakeHub, 'scripts', 'term', 'netns.sh'), bun, '-e', look], { cwd: fakeHub, env: { ...env, TMPDIR: work, HUB_WORK_DIR: work, HUB_CACHE_DIR: path.join(work, 'cache') }, encoding: 'utf8', timeout: 60_000 });
        const out = String(p.stdout) + String(p.stderr);
        const refused = out.includes(`netns: refused: TERM_NETNS_NODE_MODULES_REFUSED ${link}`);
        const pass = name === 'control' ? p.status === 0 && !refused && out.includes('seen api=absent marker=PKG write=EROFS') : p.status === 3 && refused && !out.includes('seen ');
        if (!pass) ok = false;
        runs.push(`${name} -> ${to}: exit=${p.status} ${out.trim().split('\n').slice(-2).join(' | ')}`);
      }
      try { fs.unlinkSync(link); } catch { /* not made */ }
      report('#7 netns.sh: a node_modules link to another repository, /run, /proc, HOME or a node_modules under /dev refuses (control: the planted .env is readable outside, a real node_modules binds read-only)', ok, runs.join('\n'));
    }
    lp.stop(true); la.stop(true); fs.closeSync(held);
  } finally { cleanup(); }

  // The fence probes, inside the boundary (this same file, re-run; netns.sh rebuilds the environment).
  const [file, ...args] = confine(ownCommand());
  const r = spawnSync(file!, args, { cwd: process.cwd(), env: { ...process.env }, stdio: 'inherit' });
  return failed || r.status !== 0 ? 1 : 0;
}
