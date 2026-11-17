// Named screenshot states of the schedules page (`bun run hub:shots --page schedules`).
import type { Shot } from '@app/shots.types';

// `act`: the steps the runner performs after load (the shape of app/shots.types ActStep).
type Step = { click: string } | { hover: string } | { fill: string; text: string } | { press: string } | { waitFor: string };
type Spec = Shot & { act?: readonly Step[] };

const A1 = '?sel=cron%3Auser%2Fa1';
// Changes the schedule, then presses Save in the drawer.
const SAVE = [{ click: 'css=[role=dialog] >> role=button[name=/Runs/]' }, { click: 'role=option[name="Weekdays"]' }, { click: 'css=[role=dialog] >> role=button[name="Save"]' }] as const;
// Presses Run now in the inspector's footer (the table has hover buttons of the same name).
const RUN = [{ click: 'role=button[name="Run now"] >> nth=-1' }] as const;
const shots = [
  { name: 'many' },
  { name: 'many-hover', act: [{ hover: 'role=row >> nth=2' }] },
  { name: 'detail-command', path: A1 },
  { name: 'detail-run-error', path: '?sel=cron%3Auser%2Fa3' },
  { name: 'detail-advanced', path: A1, act: [{ click: 'Show the command' }, { waitFor: 'restic backup' }] },
  { name: 'detail-timer', path: '?sel=timer%3Auser%2Fa6' },
  { name: 'detail-script', path: '?sel=exec%3Adefault%2F1%2Fqueue-drain.ts' },
  { name: 'detail-web', path: '?sel=curl%3Ac1' },
  { name: 'detail-loop', path: '?sel=loop%3Asess_02%2Floop_5e6f7a8b' },
  { name: 'detail-raw', path: '?sel=raw%3Auser%2Fraw12' },
  { name: 'filter-attention', path: '?status=attention' },
  { name: 'filter-paused', path: '?status=paused' },
  { name: 'filter-kind', path: '?kind=web' },
  { name: 'no-match', path: '?q=zzzz' },
  { name: 'small', state: 'small' },
  { name: 'empty', state: 'empty' },
  { name: 'loading', state: 'loading' },
  { name: 'error', state: 'error' },
  { name: 'private', state: 'private' },
  { name: 'partial', state: 'partial' },
  { name: 'computer-stopped', state: 'stopped' },
  { name: 'no-computer', state: 'no-computer' },
  { name: 'history-empty', state: 'history-empty', path: A1 },
  { name: 'history-error', state: 'history-error', path: A1, act: [{ hover: 'role=button[name="Try again"]' }] },
  { name: 'new-chooser', path: '?edit=new' },
  { name: 'new-form', path: '?edit=new', act: [{ click: 'css=[role=dialog] button:has-text("Run a command")' }, { waitFor: 'Next runs' }] },
  { name: 'edit', path: '?edit=cron%3Auser%2Fa1', waitForText: 'Next runs' },
  { name: 'edit-weekly', path: '?edit=cron%3Auser%2Fa2', waitForText: 'Next runs' },
  { name: 'edit-preview-error', state: 'preview-error', path: '?edit=cron%3Auser%2Fa8', waitForText: 'Hour must be 0 to 23.' },
  { name: 'edit-web', path: '?edit=curl%3Ac1' },
  { name: 'save-pending', state: 'save-pending', path: '?edit=cron%3Auser%2Fa1', waitForText: 'Next runs', act: SAVE },
  { name: 'save-failed', state: 'save-failed', path: '?edit=cron%3Auser%2Fa1', waitForText: 'Next runs', act: SAVE },
  { name: 'op-pending', state: 'act-pending', path: '?sel=cron%3Auser%2Fa3', act: RUN },
  { name: 'op-failed', state: 'act-failed', path: '?sel=cron%3Auser%2Fa3', act: RUN },
  { name: 'op-working', state: 'act-slow', path: '?sel=cron%3Auser%2Fa3', act: RUN },
] satisfies readonly Spec[];

export default shots;
