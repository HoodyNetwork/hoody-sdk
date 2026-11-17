// Behaviour contract of a chat's shell job rows (web and terminal). The safety rules both builds keep:
// a Stop is offered only where the store allows it and is named for its job; a press calls the store's stop once for that
// job and nothing else; an unknown Stop offers Check again, which only reads; a job that ended and has no Stop is not shown.
import { scenarios } from '../scenario-types';
import { ShellJobRows, type ShellJobRowsProps } from './ShellJobRows';
import type { JobRow } from './jobStop';
import type { JobAttemptView, ShellJobStops } from './shellJobStop';
import strings from './ShellJobRows.strings.en.json';

const NOW = 1_761_800_000_000;
const job = (jobId: string, command: string, o: Partial<JobRow> = {}): JobRow => ({ jobId, command, startedMs: NOW - 7 * 60_000, state: 'running', lastLine: '', remote: false, ...o });
type Can = ReturnType<ShellJobStops['canStop']>;
interface Fake { rows: JobRow[]; attempts?: [string, JobAttemptView][]; gone?: JobRow[]; can?: Record<string, Can> }
function stops(s: { fn(n: string): (...a: unknown[]) => void }, f: Fake): ShellJobStops {
  const attempts = new Map(f.attempts ?? []);
  const attemptRows = new Map([...f.rows, ...(f.gone ?? [])].filter((r) => attempts.has(r.jobId)).map((r) => [r.jobId, r] as const));
  const snap = { rows: f.rows, listUnreadable: false, attempts, attemptRows };
  const stop = s.fn('stop');
  const check = s.fn('check');
  return {
    snapshot: () => snap, subscribe: () => () => {}, refresh: async () => {},
    canStop: (id) => f.can?.[id] ?? { k: 'ok' },
    stop: async (id) => { stop(id); return { k: 'refused', why: 'busy' }; },
    check: async (id) => { check(id); },
  };
}
const LIST = { role: 'list', name: strings['sj.list'] };
const STOP_DEV = { role: 'button', name: 'Stop npm run dev' };

export default scenarios<ShellJobRowsProps>('ShellJobRows', ShellJobRows, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'a running job shows its command, how long it has run, its last line and a Stop named for it',
      covers: ['stops', 'now'],
      props: (s) => ({ now: NOW, stops: stops(s, { rows: [job('j1', 'npm run dev', { lastLine: 'ready in 412 ms' })] }) }),
      steps: [],
      expect: { nodes: [{ target: LIST }, { target: { text: 'Running for 7 minutes' } }, { target: { text: 'ready in 412 ms' } }, { target: STOP_DEV }], calls: { stop: 0, check: 0 } },
    },
    {
      name: 'Stop calls the store once, for that job only',
      covers: ['stops'],
      props: (s) => ({ now: NOW, stops: stops(s, { rows: [job('j1', 'npm run dev'), job('j2', 'pytest -x')] }) }),
      steps: [{ press: STOP_DEV }],
      expect: { calls: { stop: [['j1']], check: 0 } },
    },
    {
      name: 'a click on the second Stop stops the second job',
      covers: ['stops'],
      props: (s) => ({ now: NOW, stops: stops(s, { rows: [job('j1', 'npm run dev'), job('j2', 'pytest -x')] }) }),
      steps: [{ click: { role: 'button', name: 'Stop pytest -x' } }],
      expect: { calls: { stop: [['j2']] } },
    },
    {
      name: 'a job started under a minute ago says so',
      covers: ['now'],
      props: (s) => ({ now: NOW, stops: stops(s, { rows: [job('j1', 'npm run dev', { startedMs: NOW - 20_000 })] }) }),
      steps: [],
      expect: { nodes: [{ target: { text: strings['sj.startedNow'] } }] },
    },
    {
      name: 'without the gate there is no Stop: the row says it stops with the chat',
      covers: ['stops'],
      props: (s) => ({ now: NOW, stops: stops(s, { rows: [job('j1', 'npm run dev')], can: { j1: { k: 'refused', why: 'capability' } } }) }),
      steps: [],
      expect: { nodes: [{ target: STOP_DEV, absent: true }, { target: { text: new RegExp(strings['sj.stops']) } }] },
    },
    {
      name: 'an unknown Stop: its words are a status, Check again only reads, and no Stop is offered',
      covers: ['stops'],
      props: (s) => ({ now: NOW, stops: stops(s, { rows: [job('j1', 'npm run dev', { state: 'unknown' })], attempts: [['j1', { phase: 'unknown', checking: false }]], can: { j1: { k: 'refused', why: 'busy' } } }) }),
      steps: [{ press: { role: 'button', name: strings['sj.checkAgain'] } }],
      expect: { nodes: [{ target: { role: 'status' } }, { target: { text: new RegExp(strings['sj.unknown'].replace('.', '\\.')) } }, { target: { text: strings['sj.checkHint'] } }, { target: STOP_DEV, absent: true }], calls: { check: [['j1']], stop: 0 } },
    },
    {
      name: 'while a check runs it says Checking and offers nothing',
      covers: ['stops'],
      props: (s) => ({ now: NOW, stops: stops(s, { rows: [job('j1', 'npm run dev', { state: 'unknown' })], attempts: [['j1', { phase: 'unknown', checking: true }]], can: { j1: { k: 'refused', why: 'busy' } } }) }),
      steps: [],
      expect: { nodes: [{ target: { text: strings['sj.checking'] } }, { target: { role: 'button', name: strings['sj.checkAgain'] }, absent: true }, { target: STOP_DEV, absent: true }] },
    },
    {
      name: 'a settled Stop says only what its answer proved',
      covers: ['stops'],
      props: (s) => ({ now: NOW, stops: stops(s, { rows: [job('j1', 'npm run dev', { state: 'ended' })], attempts: [['j1', { phase: 'settled', evidence: 'not_running' }]], can: { j1: { k: 'refused', why: 'not_running' } } }) }),
      steps: [],
      expect: { nodes: [{ target: { text: strings['sj.ended'] } }, { target: { text: strings['sj.notRunning'] } }], neverShown: [strings['sj.stopped']] },
    },
    {
      name: 'a job the list no longer names keeps its row while its Stop is open, without a Stop',
      covers: ['stops'],
      props: (s) => ({ now: NOW, stops: stops(s, { rows: [], gone: [job('j9', 'tail -f app.log')], attempts: [['j9', { phase: 'sending' }]], can: { j9: { k: 'refused', why: 'not_listed' } } }) }),
      steps: [],
      expect: { nodes: [{ target: { text: 'tail -f app.log' } }, { target: { text: strings['sj.notListed'] } }, { target: { text: strings['sj.stopping'] } }, { target: { role: 'button', name: 'Stop tail -f app.log' }, absent: true }] },
    },
    {
      name: 'ended jobs with no Stop of this page are left out; with none to show there is no list',
      props: (s) => ({ now: NOW, stops: stops(s, { rows: [job('j1', 'npm run dev', { state: 'ended' })] }) }),
      steps: [],
      expect: { nodes: [{ target: LIST, absent: true }], neverShown: ['npm run dev'] },
    },
  ],
});
