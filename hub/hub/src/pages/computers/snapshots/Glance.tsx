// Backups, "At a glance": four facts read from the one snapshots read the list below
// shows (same query key, so no second fetch): how many are kept of the most this computer can hold, the newest, the
// space they use, and when one was last used. A list not read whole (a row it could not take, or another computer's
// answer) says "Can't tell" for every fact, never a guess; a size missing from a row makes the space "At least".
import { AnatomySection, Facts, Meter, formatBytes, formatDateTime, useStrings, type Fact } from '@kit';
import type { SnapshotList } from './logic';
import strings from './strings.en.json';
import s from './snapshots.module.css';

/** `list`: the read's answer (undefined while reading); `failed`: the read failed and nothing usable is kept. */
export function SnapshotsGlance({ list, failed }: { list: SnapshotList | undefined; failed: boolean }) {
  const t = useStrings(strings);
  const items: Fact[] = [
    { label: t('glance.kept'), value: kept(list, failed, t) },
    { label: t('glance.newest'), value: newest(list, failed, t) },
    { label: t('glance.space'), value: space(list, failed, t) },
    { label: t('glance.used'), value: used(list, failed, t) },
  ];
  return (
    <AnatomySection id="snap-glance" title={t('glance.title')} state={{ kind: 'ready' }}>
      <Facts items={items} columns={2} label={t('glance.title')} />
    </AnatomySection>
  );
}

type T = ReturnType<typeof useStrings<typeof strings>>;
/** Undefined: the list was read whole for this computer; otherwise the words that stand in for every fact. */
function notRead(list: SnapshotList | undefined, failed: boolean, t: T): string | undefined {
  if (failed || (list && (!list.listed || !list.complete))) return t('glance.cantTell');
  return list ? undefined : t('glance.reading');
}

function kept(list: SnapshotList | undefined, failed: boolean, t: T) {
  const no = notRead(list, failed, t);
  if (no !== undefined || !list) return no;
  if (list.max === null || list.max <= 0) return t('glance.kept.noMax', { count: list.count });
  const words = t('glance.kept.max', { count: list.count, max: list.max });
  return (
    <span className={s.kept}>
      {words}
      <Meter value={(list.count / list.max) * 100} label={t('glance.kept.meter', { count: list.count, max: list.max })} />
    </span>
  );
}

function newest(list: SnapshotList | undefined, failed: boolean, t: T) {
  const no = notRead(list, failed, t);
  if (no !== undefined || !list) return no;
  if (list.items.length === 0) return t('glance.none');
  // Named only when every row says, as a real time, when it was taken: compared as times, not as text.
  const at = list.items.map((x) => Date.parse(x.createdAt));
  if (at.some((n) => Number.isNaN(n))) return t('glance.cantTell');
  const top = list.items[at.indexOf(Math.max(...at))]!;
  return t('glance.newest.value', { when: formatDateTime(top.createdAt), name: top.alias ?? top.name });
}

function space(list: SnapshotList | undefined, failed: boolean, t: T) {
  const no = notRead(list, failed, t);
  if (no !== undefined || !list) return no;
  const known = list.items.flatMap((x) => (x.size === null ? [] : [x.size]));
  const sum = known.reduce((a, b) => a + b, 0);
  // A row without a size leaves the sum a floor, said as one.
  if (known.length === list.items.length) return formatBytes(sum);
  return known.length ? t('glance.space.atLeast', { size: formatBytes(sum) }) : t('glance.cantTell');
}

function used(list: SnapshotList | undefined, failed: boolean, t: T) {
  const no = notRead(list, failed, t);
  if (no !== undefined || !list) return no;
  // Compared as times, not as text; a used time that is not a time leaves the fact unsaid.
  const seen = list.items.flatMap((x) => (x.lastUsedAt ? [{ at: Date.parse(x.lastUsedAt), raw: x.lastUsedAt, name: x.alias ?? x.name }] : []));
  if (seen.some((x) => Number.isNaN(x.at))) return t('glance.cantTell');
  const last = seen.reduce<(typeof seen)[number] | null>((m, x) => (!m || x.at > m.at ? x : m), null);
  if (last) return t('glance.used.value', { when: formatDateTime(last.raw), name: last.name });
  return t('glance.used.never');
}
