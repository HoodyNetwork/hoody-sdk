// The Overview's Realms fact on one line: a few realm chips, then "+N more" (or "Show
// ids") opening a searchable list of every realm with its id and a copy button, and Manage for the Realms drawer. A realm
// with no alias is named by its short id, shown once (never as name and id chip both).
import { Button, EmptyState, IdChip, cx, maskId, matchesSearch, Popover, SearchField, TextButton, useContainerNarrow, useIsPhone, useStrings } from '@kit';
import { useMemo, useState, type ReactElement } from 'react';
import strings from '../strings.en.json';
import type { Realm } from '../types';
import { NoRealmNote, RealmButton, RealmDot } from './Bits';
import s from './parts.module.css';

/** Chips shown on the line before "+N more": three, or one when the main area is phone-narrow. */
const CHIPS_WIDE = 3;
const CHIPS_NARROW = 1;
/** The list gets a search field above this many realms. */
const SEARCH_FROM = 7;

interface Entry {
  id: string;
  /** The alias, or null when the realm has none (or is not in the realms list). */
  alias: string | null;
  color: string | undefined;
}

/** The computer's realms in reading order: the realm the top bar shows first, then aliased ones A-Z, then the rest by id. */
export function realmEntries(ids: readonly string[], realms: readonly Realm[] | undefined, shown: string): Entry[] {
  const all = ids.map((id): Entry => {
    const r = realms?.find((x) => x.id === id);
    return { id, alias: r && r.named !== false && r.name ? r.name : null, color: r?.color };
  });
  const rank = (e: Entry) => (e.id === shown ? 0 : e.alias !== null ? 1 : 2);
  return all.sort((a, b) => rank(a) - rank(b) || (a.alias ?? a.id).localeCompare(b.alias ?? b.id, 'en', { sensitivity: 'base' }));
}

export function RealmsLine({ ids, realms, shown, name, onManage }: { ids: readonly string[]; realms: readonly Realm[] | undefined; shown: string; name: string; onManage?: () => void }) {
  const t = useStrings(strings);
  const narrow = useContainerNarrow(600);
  const entries = useMemo(() => realmEntries(ids, realms, shown), [ids, realms, shown]);
  // Manage keeps its separator beside it, so a wrapped line never leaves a stray "·" behind.
  const manage = onManage ? (
    <span className={s.realmManage}>
      <span aria-hidden="true">·</span>
      <TextButton className={s.touch} onPress={onManage}>
        {t('realm.manage')}
      </TextButton>
    </span>
  ) : null;

  if (entries.length === 0) {
    return (
      <span className={s.realmLine}>
        <NoRealmNote name={name} />
        <span>{t('realm.noneHere')}</span>
        {onManage ? (
          <span className={s.realmManage}>
            <span aria-hidden="true">·</span>
            <TextButton className={s.touch} onPress={onManage}>{t('realm.add')}</TextButton>
          </span>
        ) : null}
      </span>
    );
  }

  // One realm: everything fits on the line (name and id, or the id alone), so there is no list to open.
  if (entries.length === 1) {
    const e = entries[0]!;
    return (
      <span className={s.realmLine}>
        <span className={s.realmItem}>
          {e.alias !== null && onManage ? (
            // The name is pressable where Manage is: it opens the same Realms drawer.
            <RealmButton color={e.color} label={e.alias} aria={t('realm.open', { realm: e.alias, name })} onPress={onManage} />
          ) : (
            <>
              <RealmDot color={e.color} />
              {e.alias !== null ? <span className={s.realmItemName}>{e.alias}</span> : null}
            </>
          )}
          <IdChip id={e.id} />
        </span>
        {manage}
      </span>
    );
  }

  const max = narrow ? CHIPS_NARROW : CHIPS_WIDE;
  const chips = entries.slice(0, max);
  const more = entries.length - chips.length;
  const count = entries.length;
  // The "+N more" / "Show ids" button (and, where the realms may not be changed, each chip) opens the same list,
  // anchored to (and returning focus to) the button that opened it. Accessible names start with the visible words.
  const list = (key: string, trigger: ReactElement) => (
    <Popover key={key} label={t('realm.listTitle', { name, count })} title={t('realm.listTitle', { name, count })} width="picker" phone="sheet" trigger={trigger}>
      {(close) => (
        <RealmList
          entries={entries}
          onManage={
            onManage
              ? () => {
                  close();
                  onManage();
                }
              : undefined
          }
        />
      )}
    </Popover>
  );
  return (
    <span className={s.realmLine}>
      {chips.map((e) => {
        const label = e.alias ?? maskId(e.id);
        // Where the realms may be changed a chip opens the Realms drawer (as Manage does); the list with every id stays
        // behind "+N more" / "Show ids". Where they may not, a chip opens that list, as before.
        if (onManage) return <RealmButton key={e.id} color={e.color} label={label} mono={e.alias === null} aria={t('realm.open', { realm: label, name })} onPress={onManage} />;
        return list(
          e.id,
          <TextButton className={cx(s.realmItem, s.touch)} aria-label={t('realm.chipOpen', { realm: label, count, name })}>
            <RealmDot color={e.color} />
            <span className={e.alias !== null ? s.realmItemName : s.realmItemId}>{label}</span>
          </TextButton>,
        );
      })}
      {list(
        'more',
        <TextButton className={s.touch} aria-label={t('realm.listOpen', { label: more > 0 ? t('realm.more', { count: more }) : t('realm.ids'), count, name })}>
          {more > 0 ? t('realm.more', { count: more }) : t('realm.ids')}
        </TextButton>,
      )}
      {manage}
    </span>
  );
}

/** Every realm of the computer: dot, alias (or "No alias"), the id with its copy button; Manage realms at the end. */
function RealmList({ entries, onManage }: { entries: Entry[]; onManage: (() => void) | undefined }) {
  const t = useStrings(strings);
  const [q, setQ] = useState('');
  const sheet = useIsPhone();
  // A short read-only list inside a popover, not a list page: the kit's matcher over alias and whole id.
  const rows = q.trim() ? entries.filter((e) => matchesSearch([e.alias ?? '', e.id], q)) : entries;
  return (
    <div className={s.realmList}>
      {entries.length >= SEARCH_FROM ? <SearchField label={t('realm.search')} placeholder={t('realm.search')} value={q} onChange={setQ} /> : null}
      {rows.length === 0 ? (
        <EmptyState size="sm" icon="search" title={t('realm.searchNone')} />
      ) : (
        <ul className={cx(s.realmRows, sheet && s.realmRowsSheet)}>
          {rows.map((e) => (
            <li key={e.id} className={s.realmRow}>
              <RealmDot color={e.color} />
              {e.alias !== null ? <span className={s.realmRowName}>{e.alias}</span> : <span className={s.faint}>{t('realm.noAlias')}</span>}
              <IdChip id={e.id} />
            </li>
          ))}
        </ul>
      )}
      {onManage ? (
        <div className={s.realmListFoot}>
          <Button size="sm" onPress={onManage}>
            {t('realm.manageAll')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
