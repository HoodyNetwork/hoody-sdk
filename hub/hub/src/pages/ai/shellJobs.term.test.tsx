// The AI chat's shell job rows, drawn from a fixture store (fixture mode has no bash-jobs rule: a rule there would change
// fixture behaviour on every ask page, so the rows are drawn here). Three jobs as a chat shows them: one
// running with output, one just started, one whose Stop is unknown. With HUB_FX_OUT set, each width's frame is
// also written as truecolor ANSI for a PNG (termshot `cat`).
import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, setColourTier } from '../../term/prim';
import { ShellJobRows } from '../../kit/agent/ShellJobRows';
import type { JobRow } from '../../kit/agent/jobStop';
import type { ShellJobStops } from '../../kit/agent/shellJobStop';

const NOW = 1_761_800_000_000;
const job = (jobId: string, command: string, o: Partial<JobRow> = {}): JobRow => ({ jobId, command, startedMs: NOW - 7 * 60_000, state: 'running', lastLine: '', remote: false, ...o });
function store(): ShellJobStops {
  const rows = [
    job('j1', 'npm run dev', { lastLine: 'ready in 412 ms · http://localhost:5173' }),
    job('j2', 'pytest -x tests/api', { startedMs: NOW - 20_000 }),
    job('j3', 'rsync -az /srv/www/ backup@atlas:/var/backups/www/', { state: 'unknown' }),
  ];
  const attempts = new Map([['j3', { phase: 'unknown' as const, checking: false }]]);
  const snap = { rows, listUnreadable: false, attempts, attemptRows: new Map([['j3', rows[2]!]]) };
  return {
    snapshot: () => snap, subscribe: () => () => {}, refresh: async () => {},
    canStop: (id) => (id === 'j3' ? { k: 'refused', why: 'busy' } : { k: 'ok' }),
    stop: async () => ({ k: 'refused', why: 'busy' }), check: async () => {},
  } as ShellJobStops;
}

let term: TestTerm | null = null;
afterEach(() => { term?.renderer.destroy(); term = null; setColourTier('truecolor'); });

function ansi(t: TestTerm): string {
  const out: string[] = [];
  for (const line of t.captureSpans().lines) {
    let s = '';
    for (const sp of line.spans) {
      const [fr, fg, fb] = sp.fg.toInts(); const [br, bg, bb, ba] = sp.bg.toInts();
      s += `\x1b[38;2;${fr};${fg};${fb}m` + (ba ? `\x1b[48;2;${br};${bg};${bb}m` : '\x1b[49m') + sp.text;
    }
    out.push(s + '\x1b[0m');
  }
  return out.join('\r\n');
}

for (const width of [120, 80]) {
  test(`a chat's shell jobs at ${width} cells: each job a block, Stop beside the running ones, Check again on the unknown one`, async () => {
    term = await drawTest(<FocusRoot><Box dir="column" width={width}><ShellJobRows stops={store()} now={NOW} /></Box></FocusRoot>, { width, height: 16 });
    const f = await term.settle();
    const rows = f.split('\n').map((l) => l.trimEnd()).filter((l) => l !== '');
    expect(rows[0]).toMatch(/^● npm run dev +Stop$/);
    expect(rows).toContain('  │ ready in 412 ms · http://localhost:5173');
    expect(rows.some((r) => /^● pytest -x tests\/api +Stop$/.test(r))).toBe(true);
    const unk = rows.findIndex((r) => r.includes('rsync -az'));
    expect(unk).toBeGreaterThan(0);
    expect(rows[unk]).not.toMatch(/Stop$/);
    expect(rows.slice(unk).join('\n')).toContain('Check again');
    const dir = process.env.HUB_FX_OUT;
    if (dir) { mkdirSync(dir, { recursive: true }); writeFileSync(`${dir}/shelljobs.${width}.ansi`, ansi(term)); }
  }, 60_000);
}
