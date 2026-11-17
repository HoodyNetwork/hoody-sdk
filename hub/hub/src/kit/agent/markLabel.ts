// markLabel: the words of a marked link in a reply (`atlas · port 3000`, `atlas · port 3000 (off)`, `Another computer ·
// ab12…`). One rule for every place that names a mark: the web's LinkMark and ResultRow, the terminal's reply text and
// ResultRow. Pure: the caller binds the strings (LinkMark.strings.en.json).
import type { useStrings } from '../strings';
import type { Mark } from './linkHost';
import type strings from './LinkMark.strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;

const PROGRAMS = ['agent', 'terminal', 'display', 'files', 'browser', 'code', 'sqlite', 'notes'];
const KITS = ['cron', 'logs', 'tunnel', 'notifications'];

/** The words of a mark: the computer's name and the thing on it, then its state when it is not running. */
export function markLabel(m: Mark, t: T): string {
  const w = m.what;
  const name = m.name;
  const label =
    w.k === 'program' ? t('mark.program', { name, program: PROGRAMS.includes(w.program) ? t(`program.${w.program}` as 'program.agent') : w.program, n: w.n })
    : w.k === 'place' ? t('mark.place', { name, place: w.place })
    : w.k === 'port' ? t('mark.port', { name, n: w.n })
    : w.k === 'path' ? t('mark.path', { name, path: w.path })
    : w.k === 'kit' ? t('mark.kit', { name, kit: KITS.includes(w.kit) ? t(`kit.${w.kit}` as 'kit.cron') : w.kit })
    : w.k === 'hub' ? t('mark.hub', { path: m.open?.k === 'hub' ? m.open.path : '/' })
    : w.k === 'written' ? t('mark.local', { written: m.written ?? '' })
    : t('mark.other', { host: w.host });
  const o = m.owner;
  if (o?.k === 'gone') return t('mark.state.gone', { label });
  if (o?.k === 'reading') return t('mark.reading', { label });
  if (o?.k === 'own' && o.state !== 'running') return t(`mark.state.${o.state}` as 'mark.state.stopped', { label });
  return label;
}
