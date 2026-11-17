// The launcher's "Opened recently on {computer}" section: the newest RECENT_MAX rows of the
// launcher's own list (useApps rows: this computer only), each with its state and its main action (RowPrimary, through
// useApps' act). Hidden when there is none. "See all" goes to Programs > Apps, where every row has its whole menu.
import { AnatomySection, CardGrid, DataTable, PickCard, StatusPill, createColumnHelper, matchesSearch, openOutside, useGo, usePageLink, useStrings } from '@kit';
import type { LauncherCards } from './AppLauncher';
import { LINK_ACTIONS, cellActionOf, hrefFor } from './RowPrimary';
import { useMemo } from 'react';
import { links } from '../links';
import type { OpenApp } from '../logic';
import strings from '../strings.en.json';
import { ACTION_KEY, TONE, launchOf, opensWord, shortState } from '../parts/words';
import { RowPrimary } from './RowPrimary';
import type { Apps } from './useApps';

/** The rows the section shows at most. */
export const RECENT_MAX = 5;

const col = createColumnHelper<OpenApp>();

export function RecentSection({ a, computer, cards, q = '' }: { a: Apps; computer: string; cards?: LauncherCards | undefined; q?: string }) {
  const { rows } = a;
  const t = useStrings(strings);
  const go = useGo();
  const programs = usePageLink('programs');
  const recent = useMemo(() => [...rows].sort((x, y) => y.startedAt - x.startedAt).slice(0, RECENT_MAX), [rows]);
  const columns = useMemo(
    () => [
      col.accessor((r) => r.name, {
        id: 'name',
        header: t('col.name'),
        meta: { pinned: true, list: 'primary' },
      }),
      col.accessor((r) => r.opensIn, { id: 'opens', header: t('col.opens'), meta: { width: '110px', priority: 2 }, cell: (c) => opensWord(t, c.row.original.opensIn) }),
      col.accessor((r) => r.state, {
        id: 'state',
        header: t('col.state'),
        meta: { width: '160px', list: 'status' },
        cell: (c) => {
          const v = launchOf(c.row.original, rows);
          return (
            <StatusPill tone={TONE[v.tone]} dot>
              {shortState(t, v.key)}
            </StatusPill>
          );
        },
      }),
      col.display({ id: 'action', header: t('col.action'), meta: { width: '140px', align: 'end' }, cell: (c) => <RowPrimary a={a} r={c.row.original} /> }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- actions go through a.latest
    [t, rows, a.snap.patches],
  );
  if (cards) {
    const items = [...rows].sort((x, y) => y.startedAt - x.startedAt).filter((r) => matchesSearch([r.name], q)).slice(0, cards.show === 'recent' ? 12 : RECENT_MAX);
    if (items.length === 0) return null;
    const title = t('launch.recent', { computer });
    const press = (k: string) => {
      const r = items.find((x) => x.key === k);
      if (!r) return;
      const act = cellActionOf(r, launchOf(r, rows));
      if (!act) return;
      const href = LINK_ACTIONS.has(act) ? hrefFor(r, act) : undefined;
      if (href) openOutside(href);
      else a.latest.current.act(r, act);
    };
    return (
      <AnatomySection id="launch-recent" title={t('cards.count', { title, count: items.length })}>
        <CardGrid
          className={cards.grid}
          label={title}
          items={items}
          keyOf={(r) => r.key}
          textOf={(r) => r.name}
          onPick={press}
          renderCard={(r) => {
            const v = launchOf(r, rows);
            const act = cellActionOf(r, v);
            return (
              <PickCard
                title={r.name}
                mark={cards.letter(r.name)}
                end={<StatusPill tone={TONE[v.tone]} dot>{shortState(t, v.key)}</StatusPill>}
                note={act ? t('cards.recent.next', { opens: opensWord(t, r.opensIn), action: a.t(ACTION_KEY[act] as 'act.open') }) : opensWord(t, r.opensIn)}
              />
            );
          }}
        />
      </AnatomySection>
    );
  }
  if (recent.length === 0) return null;
  return (
    <AnatomySection
      id="launch-recent"
      title={t('launch.recent', { computer })}
      state={{ kind: 'ready' }}
      {...(programs?.kind === 'hub' ? { actions: { secondary: [{ id: 'launch-recent-all', label: t('launch.recent.all'), onPress: () => go(links.list) }] as const } } : {})}
    >
      <DataTable label={t('launch.recent', { computer })} data={recent} columns={columns} getRowId={(r) => r.key} bare fill={false} presentation="list" onRowAction={false} />
    </AnatomySection>
  );
}
