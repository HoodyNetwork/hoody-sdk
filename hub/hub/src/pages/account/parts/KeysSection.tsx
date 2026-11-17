// SSH keys, read only: each computer in view and the one key it accepts (GET /computers). The Hoody API has no
// account-level SSH keys yet, so a key is added, replaced or removed on the computer itself: each row opens that
// computer's Connect tab (through the Computers page's links.ts and the shell's link; a load that does not serve
// Computers opens nothing). The row itself is the way there (no button repeated on every row):
// a row click and Enter on the focused row open it, and a touch screen shows the kit's row chevron, named for the
// computer ("Open SSH settings for atlas", or "Add key in SSH settings for borealis" for one with no key). The key is
// shown summed up, never whole: type and last characters, then the comment on a muted second line: kept whole in the
// text (up to 256 characters, cleaned), cut with an ellipsis by CSS only, so the table's tooltip and a screen reader get
// all of it.
// The list is the selected realm's only when the read goes to that realm's host: a realm selected on a page that names
// no realm domain reads the base API (core hubApiBase), so the plain words stay. With one realm's list the words say
// so, and point at the realm menu only when this session can switch to All realms and there is more than one realm.
import { realmDomain, useRealms } from '@core';
import { DataTable, EmptyState, RowNote, StatusPill, createColumnHelper, followPageLink, useDataView, useGo, usePageLink, useStrings } from '@kit';
import { useMemo } from 'react';
import { links as computers } from '../../computers/links';
import { type ComputerKey, useComputerKeys } from '../data';
import { cleanLabel, keySummary } from '../logic';
import strings from '../strings.en.json';
import m from './Mono.module.css';

const col = createColumnHelper<ComputerKey>();

/** Which words the section uses: every realm's computers, one realm's, or one realm's with a way to the rest. */
function useKeysScope(): 'all' | 'realm' | 'realmSwitch' {
  const r = useRealms();
  if (r.selected === 'all' || !realmDomain()) return 'all';
  return r.pinned === null && (r.rows?.length ?? 0) > 1 ? 'realmSwitch' : 'realm';
}

export function KeysSection() {
  const t = useStrings(strings);
  const go = useGo();
  const link = usePageLink('computers');
  const q = useComputerKeys();
  const scope = useKeysScope();
  const one = scope !== 'all';
  // Inside the Hub the exact place (the computer's Connect tab); a classic fallback opens the page itself.
  const open = link ? (r: ComputerKey) => (link.kind === 'hub' ? go(computers.connect(r.handle)) : followPageLink(link, go)) : null;

  const columns = useMemo(
    () => [
      col.accessor((r) => r.name, {
        id: 'computer',
        header: t('k.col.computer'),
        meta: { pinned: true },
        cell: (c) => <bdi>{cleanLabel(c.getValue(), 40)}</bdi>,
      }),
      col.accessor((r) => (r.key ? 1 : 0), {
        id: 'key',
        header: t('k.col.key'),
        meta: { mono: true },
        cell: (c) => {
          const k = keySummary(c.row.original.key);
          if (!k) return <StatusPill tone="neutral">{t('k.none')}</StatusPill>;
          if (!k.type) return t('k.unknownType');
          return (
            // data-meta-wraps: on the phone list the kit field takes the lines it needs, so line 2 is never clipped.
            <span className={m.keyCell} data-meta-wraps="">
              <span className={m.keyTop}>
                <span>{k.type}</span>
                <span>{t('k.tail', { tail: k.tail })}</span>
              </span>
              {k.comment && (
                <RowNote cut>
                  <bdi>{cleanLabel(k.comment, 256)}</bdi>
                </RowNote>
              )}
            </span>
          );
        },
      }),
    ],
    [t],
  );

  const view = useDataView<ComputerKey>({
    rows: q.data?.rows,
    columns,
    getRowId: (r) => r.id,
    search: (r) => [r.name, keySummary(r.key)?.comment ?? ''],
    param: 'keys',
    sort: 'computer',
    pageSize: 50,
    isLoading: q.isPending,
    error: q.error,
  });

  return (
    <>
      <DataTable
        label={t('k.title')}
        view={view}
        columns={columns}
        onRetry={() => void q.refetch()}
        onRefresh={() => void q.refetch()}
        // Without Computers nothing opens: false keeps the table's default (the view's own open) off.
        {...(open ? {} : { onRowAction: false as const })}
        actions={(r) => {
          if (!open) return [];
          // The row's own open (never a drawn button or a ⋯ item); its label names the chevron on a touch screen.
          const name = cleanLabel(r.name, 40);
          const add = !keySummary(r.key);
          return [{ id: 'ssh', label: t(add ? 'k.add' : 'k.open', { name }), rowOpen: true, onAction: () => open(r) }];
        }}
        countLabel={(n) => t('count.computers', { count: n })}
        fill={false}
        noViewMenu
        empty={<EmptyState icon="terminal" size="sm" title={t(one ? 'k.emptyRealm' : 'k.empty')} />}
      />
      {q.data && !q.data.whole && <p className={m.help}>{t(one ? 'k.partialRealm' : 'k.partial')}</p>}
      {q.data && q.data.whole && q.data.rows.length > 0 && one && <p className={m.help}>{t(scope === 'realm' ? 'k.realmNote' : 'k.realmNoteSwitch')}</p>}
    </>
  );
}
