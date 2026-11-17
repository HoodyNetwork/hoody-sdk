// Behaviour contract of the Logs list (web and terminal). Whatever it looks like:
// - a click on a row makes it the active row and opens it (onActive with its key, then onSelect);
// - Show older, Show newer and the "N new" pill call their callbacks;
// - terminal: the list is one focusable with the kit table's keys: ↓ moves the active row, Enter opens it.
// Layout rules (measured columns, What's cut, shedding at narrow widths, the virtual window) are in LogList.term.test.tsx
// and the web's list.*.test.tsx.
import type { Snapshot } from '../controller';
import { DEFAULT_VIEW, type DataItem } from '../logic';
import strings from '../strings.en.json';
import { scenarios, M } from '../../../kit/scenario-types';
import { LogList, type LogListProps } from './LogList';

const table = strings as Record<string, string>;
const t = ((k: string, o?: Record<string, unknown>) => (table[k] ?? (o && 'count' in o ? table[`${k}_other`] : undefined) ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(o?.[x] ?? ''))) as never;

const visit = (n: number): DataItem => ({
  kind: 'kit',
  k: `k${n}`,
  t: 1_700_000_000_000 - n * 1000,
  id: n,
  row: { id: n, serviceName: 'files', method: 'GET', url: `/files/r${n}.txt`, status: 200, durationMs: 12 },
} as DataItem);

const snap = (extra: Partial<Snapshot> = {}): Snapshot => ({
  v: { ...DEFAULT_VIEW, source: 'helper' },
  items: [visit(1), visit(2), visit(3)],
  loading: false,
  newCount: 0,
  moreOlder: false,
  moreNewer: false,
  liveOn: false,
  olderBusy: false,
  jump: 0,
  ...extra,
} as unknown as Snapshot);

const props = (s: { fn: (n: string) => () => void }, extra: Partial<Snapshot> = {}): LogListProps => ({
  t,
  snap: snap(extra),
  selected: undefined,
  active: undefined,
  onSelect: s.fn('onSelect'),
  onOlder: s.fn('onOlder'),
  onNewer: s.fn('onNewer'),
  onJump: s.fn('onJump'),
  onReading: s.fn('onReading'),
  onActive: s.fn('onActive'),
});

export default scenarios('LogList', LogList, {
  ignored: {},
  unsupported: {
    onReading: 'a report of scroll state (scrolled away from the top, or a row open) the page reads to hold Live rows; no role shows it. Web: list tests; terminal: LogList.term.tsx follows the window top',
  },
  cases: [
    {
      name: 'web: a click on a row makes it active and opens it',
      only: { platform: 'web', why: 'a web row is a button; the terminal row is a table row (case below)' },
      covers: ['onActive', 'onSelect'],
      props: (s) => props(s),
      steps: [{ click: { role: 'button', name: /r2\.txt/ } }],
      expect: { calls: { onActive: [['k2']], onSelect: [[M.partial({ k: 'k2' })]] } },
    },
    {
      name: 'terminal: a click on a row makes it active and opens it',
      only: { platform: 'term', why: 'the terminal row is a table row (role row), the web one a button (case above)' },
      covers: ['onActive', 'onSelect'],
      props: (s) => props(s),
      steps: [{ click: { role: 'row', name: /r2\.txt/ } }],
      expect: { calls: { onActive: [['k2']], onSelect: [[M.partial({ k: 'k2' })]] } },
    },
    {
      name: 'terminal: ↓ moves the active row and Enter opens it, as the kit table',
      only: { platform: 'term', why: 'the web moves focus between row buttons (list tests); here the list is one focusable with a cursor' },
      covers: ['onActive', 'onSelect'],
      props: (s) => props(s),
      steps: [{ key: 'down' }, { key: 'enter' }],
      expect: { calls: { onActive: [['k2']], onSelect: [[M.partial({ k: 'k1' })]] } },
    },
    {
      name: 'Show older asks for older rows',
      covers: ['onOlder'],
      props: (s) => props(s, { moreOlder: true }),
      steps: [{ press: { role: 'button', name: table['act.older']! } }],
      expect: { calls: { onOlder: 1 } },
    },
    {
      name: 'Show newer asks for newer rows when Live is off',
      covers: ['onNewer'],
      props: (s) => props(s, { moreNewer: true }),
      steps: [{ press: { role: 'button', name: table['act.newer']! } }],
      expect: { calls: { onNewer: 1 } },
    },
    {
      name: 'the new-rows pill jumps to the newest',
      covers: ['onJump'],
      props: (s) => props(s, { newCount: 3 }),
      steps: [{ press: { role: 'button', name: /Jump to newest/ } }],
      expect: { calls: { onJump: 1 } },
    },
  ],
});
