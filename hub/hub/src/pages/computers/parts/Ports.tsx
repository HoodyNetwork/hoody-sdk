// Ports & addresses tab: At a glance first (who can
// open the web addresses, the ports, the aliases), then the open ports as a table, then the aliases as a table.
//
// Who can open a web address is the computer's own access rule (the proxy decides per computer and project, not per
// port), so it is said once, in the glance, with View access rules opening the read-only access drawer. The word says
// only whether rules exist, never who they let in. Ports that are not web (local only, or another protocol) have no web
// address and no access word: the proxy never serves them, which does not mean nothing else can reach them.
//
// The computer's settings (realms, SSH key, rename, make a copy, delete) are in the header's ⋯ menu and the list row's
// menu, the same five items; this tab does not repeat them. The SSH key's state shows on the Connect tab and in its
// drawer, and the realms on Overview.
//
// Narrow (list rows): line 1 is the port and its kind; line 2 the program and the address with its controls, and Create alias.
// A port's aliases are then read in the Aliases table below (each with its port): line 2 has no room for both.
import { aliasAtPort as toPort, useCan } from '@core';
import { AddressField, AnatomySection, Band, DataTable, EmptyState, Facts, InfoTip, PropagatingNote, Stack, Tag, createColumnHelper, useFresh, useStrings, type Fact, type RowActionEntry, type SectionState } from '@kit';
import { useMemo, useState } from 'react';
import { useAliases, useRuntime } from '../data';
import { access as accessOf, aliasHost, bucket } from '../logic';
import strings from '../strings.en.json';
import type { Alias, Computer, Listener } from '../types';
import { portUrl } from '../urls';
import { AccessDrawer } from './AccessDrawer';
import aliasEditStrings from './AliasEdit.strings.en.json';
import s from './parts.module.css';

export type PortsOverlay = 'realms' | 'ssh' | 'rename' | 'colour' | 'copy' | 'delete' | 'alias' | 'editAlias' | 'removeAlias' | 'domain';

const listenerCol = createColumnHelper<Listener>();

/** In the Aliases notices, while an alias is under a minute old: its name and the shared DNS note. A notice,
 *  not a row line: a narrow list row clips its lines to one, which would hide the note. */
function FreshAlias({ a }: { a: Alias }) {
  if (!useFresh(a.createdAt)) return null;
  return (
    <Band size="table">
      <strong>{a.name}</strong> <PropagatingNote createdAt={a.createdAt} />
    </Band>
  );
}
const aliasCol = createColumnHelper<Alias>();

export function Ports({ c, onOverlay }: { c: Computer; onOverlay: (o: PortsOverlay, extra?: { port?: number; alias?: string }) => void }) {
  const t = useStrings(strings);
  const running = bucket(c.status) === 'running';
  const runtime = useRuntime(c.id, running);
  const aliases = useAliases(c.id);
  const canAccess = useCan('resources.proxy_aliases');
  const te = useStrings(aliasEditStrings);
  const [accessOpen, setAccessOpen] = useState(false);
  const who = t(`access.word.${accessOf(c).state}`);
  const yours = runtime.data?.yours;
  const system = runtime.data?.system.length ?? 0;

  const listenerColumns = useMemo(
    () => [
      listenerCol.accessor('port', { header: t('ports.col.port'), meta: { pinned: true, size: 'fit', fitText: (l) => String(l.port), mono: true, list: 'primary', label: t('ports.col.port') } }),
      listenerCol.display({
        id: 'program',
        header: t('ports.col.program'),
        meta: { minWidth: 120, list: 'meta', label: t('ports.col.program') },
        // A Hoody kit program (kitProgram) is said so, with its plugin's name when the row gives one; its comm alone reads "/hoody/plugins/".
        cell: (x) => {
          const l = x.row.original;
          if (l.kit) return <><Tag>{t('ports.kit')}</Tag>{l.kit.name ? ` ${l.kit.name}` : null}</>;
          return l.program ?? <span className={s.faint}>{t('ports.noProgram')}</span>;
        },
      }),
      listenerCol.display({
        id: 'kind',
        header: t('ports.col.kind'),
        meta: { size: 'fit', fitText: (l) => t(`ports.kind.${l.kind}`), list: 'status', label: t('ports.col.kind') },
        cell: (x) => <Tag>{t(`ports.kind.${x.row.original.kind}`)}</Tag>,
      }),
      // minWidth: room for the address beside its own buttons; when the row cannot give it, Aliases drops, then the table turns to a list.
      listenerCol.display({
        id: 'url',
        header: t('ports.col.address'),
        meta: { priority: 1, minWidth: 280, list: 'meta', label: t('ports.col.address') },
        cell: (x) => {
          const l = x.row.original;
          if (l.kind === 'local') return <span className={s.faint}>{t('ports.localOnly', { name: c.name })}</span>;
          const u = l.kind === 'web' ? portUrl(c, l.port) : '';
          return u ? <AddressField url={u} label={t('ports.col.address')} resetKey={c.id} reach="port" /> : <span className={s.faint}>{t('ports.noAddress')}</span>;
        },
      }),
      listenerCol.display({
        id: 'aliases',
        header: t('ports.col.aliases'),
        meta: { priority: 3, list: false, label: t('ports.col.aliases') },
        cell: (x) => {
          const names = (aliases.data ?? []).filter((a) => toPort(a) && a.port === x.row.original.port).map((a) => a.name);
          return names.length ? names.join(', ') : <span className={s.faint}>—</span>;
        },
      }),
    ],
    [t, c, aliases.data],
  );
  const aliasColumns = useMemo(
    () => [
      aliasCol.accessor('name', { header: t('alias.col.name'), cell: (x) => <strong>{x.getValue()}</strong>, meta: { pinned: true, list: 'primary', label: t('alias.col.name') } }),
      aliasCol.display({ id: 'port', header: t('alias.col.to'), meta: { size: 'fit', fitText: (a) => String(toPort(a) ? a.port : a.program), mono: true, list: 'status', label: t('alias.col.to') }, cell: (x) => (toPort(x.row.original) ? x.row.original.port : x.row.original.program) }),
      aliasCol.display({ id: 'url', header: t('ports.col.address'), meta: { priority: 1, minWidth: 280, list: 'meta', label: t('ports.col.address') }, cell: (x) => <AddressField url={x.row.original.url} label={t('ports.col.address')} resetKey={c.id} reach="alias" /> }),
    ],
    [t, c.id],
  );

  // At a glance: "Reading…" until the first read answers, "Can't tell" when the last read failed (even over an earlier
  // answer still cached), never a guess. A background re-read in flight keeps the last answer shown (no flicker on each
  // poll); a failed one shows Can't tell here and the section's failed state with Try again.
  // useAliases maps a missing answer to [] (data.ts), so an alias read counts only once it has succeeded.
  const aliasesRead = aliases.dataUpdatedAt > 0;
  const portsWord = !running
    ? t('ports.glance.stopped')
    : runtime.isPending
      ? t('ports.glance.reading')
      : runtime.isError || !yours
        ? t('ports.glance.cantTell')
        : yours.length === 0
          ? t('ports.glance.none')
          : t('ports.glance.kinds', { web: yours.filter((l) => l.kind === 'web').length, other: yours.filter((l) => l.kind !== 'web').length });
  const aliasWord = aliases.isError ? t('ports.glance.cantTell') : !aliasesRead || !aliases.data ? t('ports.glance.reading') : String(aliases.data.length);
  const glance: Fact[] = [
    {
      label: t('ports.glance.who'),
      value: (
        <InfoTip text={t('ports.glance.who.tip', { name: c.name })} subject="">
          {who}
        </InfoTip>
      ),
    },
    {
      label: t('ports.glance.ports'),
      value: system && running && yours ? <InfoTip text={t('ports.system', { count: system })} subject="">{portsWord}</InfoTip> : portsWord,
    },
    { label: t('ports.glance.aliases'), value: aliasWord },
  ];

  // A stopped computer: the body says so (an EmptyState the anatomy rule reads), not a state object.
  const portsState: SectionState = !running
    ? { kind: 'ready' }
    : runtime.isPending
      ? { kind: 'loading', rows: 3, variant: 'table' }
      : runtime.isError
        ? { kind: 'failed', error: runtime.error, onRetry: () => void runtime.refetch(), busy: runtime.isFetching }
        : { kind: 'ready' };
  const aliasState: SectionState = aliases.isError
    ? { kind: 'failed', error: aliases.error, onRetry: () => void aliases.refetch(), busy: aliases.isFetching }
    : !aliasesRead
      ? { kind: 'loading', rows: 2, variant: 'table' }
      : { kind: 'ready' };

  return (
    <Stack gap={5}>
      <AnatomySection
        id="ports-glance"
        title={t('ports.glance.title')}
        actions={canAccess ? { secondary: [{ id: 'access', label: t('ports.whoChange'), opens: 'dialog', onPress: () => setAccessOpen(true) }] } : undefined}
        state={{ kind: 'ready' }}
      >
        <Facts items={glance} columns={2} label={t('ports.glance.title')} />
      </AnatomySection>

      <AnatomySection id="ports" title={t('ports.title')} description={t('ports.help')} state={portsState} flush>
        {!running ? (
          <EmptyState icon="stop" size="sm" title={t('ports.notRunning', { name: c.name })} body={t('ports.notRunningBody')} />
        ) : portsState.kind === 'ready' ? (
          <DataTable
            label={t('ports.title')}
            data={yours ?? []}
            columns={listenerColumns}
            getRowId={(l) => String(l.port)}
            fill={false}
            bare
            noViewMenu
            sortParam={false}
            onRowAction={false}
            countLabel={(n) => (system ? t('count.portsSystem', { ports: t('count.ports', { count: n }), system: t('ports.system', { count: system }) }) : t('count.ports', { count: n }))}
            empty={<EmptyState icon="globe" size="sm" title={t('ports.empty')} body={t('ports.emptyBody')} />}
            // A Hoody kit program's port gets no alias (AliasDrawer refuses one too).
            actions={(l): RowActionEntry[] => (l.kind === 'web' && !l.kit ? [{ id: 'alias', label: t('alias.make'), inline: true, opens: true, onAction: () => onOverlay('alias', { port: l.port }) }] : [])}
          />
        ) : null}
      </AnatomySection>

      <AnatomySection
        id="aliases"
        title={t('alias.title')}
        description={t('alias.help')}
        // An alias needs nothing running: this button is here whatever listens, and while the computer is stopped. The
        // drawer opens with no port and the person types one.
        actions={canAccess ? { secondary: [{ id: 'makeAlias', label: t('alias.make'), opens: 'dialog', onPress: () => onOverlay('alias') }] } : undefined}
        state={aliasState}
        notices={
          aliases.data?.length ? (
            <>
              {aliases.data.map((a) => (
                <FreshAlias key={a.id} a={a} />
              ))}
            </>
          ) : null
        }
        flush
      >
        {aliasState.kind === 'ready' ? (
          <DataTable
            label={t('alias.title')}
            data={aliases.data ?? []}
            columns={aliasColumns}
            getRowId={(a) => a.id}
            fill={false}
            bare
            noViewMenu
            sortParam={false}
            onRowAction={false}
            countLabel={(n) => t('count.aliases', { count: n })}
            empty={<EmptyState icon="link" size="sm" title={t('alias.empty')} body={t('alias.emptyBody')} />}
            actions={(a): RowActionEntry[] => [
              // Your own domain is the row's one button when the alias has a host; Edit and Remove are only in the menu, Remove last.
              ...(aliasHost(a.url) ? [{ id: 'domain', label: t('alias.domain'), inline: true, opens: true, onAction: () => onOverlay('domain', { alias: a.id }) }, '-' as const] : []),
              { id: 'editAlias', label: te('edit.menu'), opens: true, onAction: () => onOverlay('editAlias', { alias: a.id }) },
              { id: 'removeAlias', label: t('alias.remove'), tone: 'danger', opens: true, onAction: () => onOverlay('removeAlias', { alias: a.id }) },
            ]}
          />
        ) : null}
      </AnatomySection>
      {canAccess ? <AccessDrawer c={c} isOpen={accessOpen} onClose={() => setAccessOpen(false)} /> : null}
    </Stack>
  );
}
