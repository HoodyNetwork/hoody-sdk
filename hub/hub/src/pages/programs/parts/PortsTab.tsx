// The Ports & aliases tab (?tab=ports): every port the computer listens on, then its aliases, each with its address. The page is a list with nothing to open (ListDetailPage, no detail), like the Running tab. Reads only: the computer's listeners (core
// computerRuntime, the read Computers' Ports tab uses) and the page's alias read (core aliasList). Nothing is written
// here: Create alias opens Computers' alias drawer for that port, and Manage on Computers opens that computer's Ports
// tab, where an alias is removed, so each change keeps its one sender and lock.
// An alias needs nothing running: the aliases section has its own Create alias, shown whatever listens. It opens the
// same drawer with no port, where the person types one. A port row's Create alias is the shortcut for a port that listens now.
//
// A token session without the alias permission reads no aliases: the section says so, and no port offers an alias.
// Own domain: a CNAME record from a name under the person's domain to the alias's address (its host name) is all it takes;
// the record is followed to the alias, HTTPS is set up on the first visit, and nothing is registered with the API. So
// the alias's address is the one value the person needs: its cell shows the host name whole (it wraps, never cut) and the
// row's Copy copies exactly that. The Hub never reads DNS, so it cannot list or check the domains connected to an alias:
// the section ends with a short Why, inset like the section's other text, whose link opens the steps (faq.ts ownDomain).
// Under the two tables the tab lists the page's questions (faq.ts; the last eight are about ports and aliases), as the
// Running tab does: this file is the page's second FAQ root, a tab never shown with the first.
import { aliasAtPort, portAddress, useCan, type AliasRow, type Listener, type Target } from '@core';
import {
  AnatomySection, CellLines, DataTable, EmptyState, Link, ListDetailPage, Stack, Tag, Why, createColumnHelper, useStrings, webAddress,
  type PageHeaderProps, type PageViews, type RowActionEntry, type SectionState,
} from '@kit';
import { useCallback, useMemo, type ReactNode } from 'react';
import { scriptOfLink } from '../../scripts/links';
import { useAliases, useFolderScripts, useRuntime } from '../data';
import { pageFaq } from '../faq';
import { aliasHost, aliasNamesAt } from '../logic';
import strings from '../strings.en.json';

/** The page's tabs (?tab=…; running is the page itself). */
export type ProgramsTab = 'running' | 'apps' | 'ports';

const portCol = createColumnHelper<Listener>();
/** An alias's address only when it is an absolute http(s) URL (kit webAddress); anything else is no address: no link, no copy. */
const aliasUrl = (a: AliasRow): string => webAddress(a.url);
const aliasCol = createColumnHelper<AliasRow>();
/** The Hoody programs an alias can open (its program, by the slug in its address), named as the Computers page names them;
 *  any other program shows as the API gives it. */
const PROGRAMS = ['agent', 'terminal', 'display', 'files', 'browser', 'code', 'notes', 'workspaces', 'sqlite', 'pipe', 'cron', 'notifications', 'exec', 'curl', 'watch'] as const;
type AliasProgram = (typeof PROGRAMS)[number];
const isKnownProgram = (p: string): p is AliasProgram => (PROGRAMS as readonly string[]).includes(p);

export interface PortsTabProps {
  header: Omit<PageHeaderProps, 'context'>;
  /** The page's three tabs as the kit view bar, this one open. */
  views: PageViews<ProgramsTab>;
  /** The computer shown: its name for the words, its target for the port addresses. */
  name: string;
  target: Target | null;
  /** Create alias (Computers' alias drawer): for one port, or with no port, where the person types any port; absent: not
   *  offered (no handle yet, Computers hidden). */
  onAlias?: (port?: number) => void;
  /** That computer's Ports tab on Computers (an alias is removed there); absent: not offered. */
  onManage?: () => void;
  /** The Hub path of one of this computer's scripts on the Scripts page (its root-relative path), or null when it cannot
   *  select it; absent: no Scripts page to link to (or no handle yet). */
  scriptHref?: (rootRel: string) => string | null;
  /** The Hub path of this computer's Desktop tab on Computers; absent: not offered. */
  desktopHref?: string;
}

export function PortsTab({ header, views, name, target, onAlias, onManage, scriptHref, desktopHref }: PortsTabProps) {
  const t = useStrings(strings);
  const { byId } = pageFaq(t);
  const runtime = useRuntime(true);
  const canAliases = useCan('resources.proxy_aliases');
  const aliases = useAliases(canAliases);
  const yours = runtime.data?.yours;
  const system = runtime.data?.system.length ?? 0;
  const aliasRows = aliases.data;

  // A web port's address on the computer shown (core builds it as Computers does); '' for any other port.
  const portUrl = useCallback((l: Listener) => (l.kind === 'web' && target ? portAddress(target.project, target.container, l.port) : ''), [target]);
  const portColumns = useMemo(
    () => [
      portCol.accessor('port', { header: t('pa.ports.col.port'), meta: { pinned: true, size: 'fit', fitText: (l) => String(l.port), mono: true, list: 'primary', label: t('pa.ports.col.port') } }),
      portCol.display({
        id: 'program',
        header: t('pa.ports.col.program'),
        // A Hoody kit program: its name, with the Hoody kit tag as the cell's sub-line (kit CellLines, never a tag run into
        // the name). The column fits its longest name, so a name is not cut while Address has room.
        meta: {
          minWidth: 120,
          size: 'fit',
          fitText: (l) => (l.kit ? (l.kit.name ?? '') : (l.program ?? t('pa.ports.noProgram'))),
          list: 'meta',
          label: t('pa.ports.col.program'),
        },
        cell: (x) => {
          const l = x.row.original;
          if (l.kit) return <CellLines>{l.kit.name || null}<Tag>{t('pa.ports.kit')}</Tag></CellLines>;
          return l.program ?? t('pa.ports.noProgram');
        },
      }),
      portCol.display({
        id: 'kind',
        header: t('pa.ports.col.kind'),
        meta: { size: 'fit', fitText: (l) => t(`pa.ports.kind.${l.kind}`), list: 'status', label: t('pa.ports.col.kind') },
        cell: (x) => <Tag>{t(`pa.ports.kind.${x.row.original.kind}`)}</Tag>,
      }),
      portCol.display({
        id: 'address',
        header: t('pa.ports.col.address'),
        meta: { priority: 1, minWidth: 280, list: 'meta', label: t('pa.ports.col.address') },
        cell: (x) => {
          const l = x.row.original;
          if (l.kind === 'local') return t('pa.ports.localOnly', { name });
          const u = portUrl(l);
          return u ? <Link href={u} variant="nav">{t('pa.ports.open', { port: l.port })}</Link> : t('pa.ports.noAddress');
        },
      }),
      portCol.display({
        id: 'aliases',
        header: t('pa.ports.col.aliases'),
        meta: { priority: 3, list: false, label: t('pa.ports.col.aliases') },
        cell: (x) => {
          const names = aliasNamesAt(aliasRows ?? [], x.row.original.port);
          return names.length ? names.join(', ') : '—';
        },
      }),
    ],
    [t, name, portUrl, aliasRows],
  );

  const aliasColumns = useMemo(
    () => [
      aliasCol.accessor('name', { header: t('pa.aliases.col.name'), meta: { pinned: true, wraps: true, listWraps: true, list: 'primary', label: t('pa.aliases.col.name') } }),
      aliasCol.display({
        id: 'to',
        header: t('pa.aliases.col.to'),
        meta: { minWidth: 160, wraps: true, listWraps: true, list: 'status', label: t('pa.aliases.col.to') },
        cell: (x) => <GoesTo a={x.row.original} {...(scriptHref ? { scriptHref } : {})} {...(desktopHref ? { desktopHref } : {})} />,
      }),
      // The address: its host name whole, as the link that opens it (the cell wraps it, never cuts it). The row's Copy copies
      // the host name: the value a domain's CNAME record points at, and an address a browser opens too.
      aliasCol.display({
        id: 'address',
        header: t('pa.aliases.col.address'),
        meta: { priority: 1, minWidth: 280, wraps: true, listWraps: true, list: 'meta', label: t('pa.aliases.col.address') },
        cell: (x) => {
          const a = x.row.original;
          const u = aliasUrl(a);
          if (!u) return t('none');
          return <Link href={u} variant="nav">{aliasHost(u) ?? u}</Link>;
        },
      }),
    ],
    [t, scriptHref, desktopHref],
  );

  const portsState: SectionState = runtime.isPending
    ? { kind: 'loading', rows: 3, variant: 'table' }
    : runtime.isError
      ? { kind: 'failed', error: runtime.error, onRetry: () => void runtime.refetch(), busy: runtime.isFetching }
      : { kind: 'ready' };
  // Without the alias permission nothing is read: the section says so in its one line, with no body.
  const aliasState: SectionState = aliases.error
      ? { kind: 'failed', error: aliases.error, onRetry: aliases.retry }
      : !aliasRows
        ? { kind: 'loading', rows: 2, variant: 'table' }
        : { kind: 'ready' };

  // A web port of the person's own program offers an alias; a Hoody kit program's port never does (Computers' drawer
  // refuses one too), nor does any port while this key cannot read aliases.
  const portActions = (l: Listener): RowActionEntry[] => {
    const url = portUrl(l);
    return [
      ...(onAlias && canAliases && l.kind === 'web' && !l.kit
        ? [{ id: 'alias', label: t('pa.ports.aliasName', { port: l.port }), short: t('pa.ports.alias'), icon: 'link' as const, inline: true, opens: true, onAction: () => onAlias(l.port) }]
        : []),
      ...(url ? [{ id: 'copy', label: t('pa.ports.copyName', { port: l.port }), short: t('pa.ports.copy'), icon: 'copy' as const, copy: url, onAction: () => undefined }] : []),
    ];
  };
  // Copy: the address's host name (the CNAME target), shown on row hover and in the menu.
  const aliasActions = (a: AliasRow): RowActionEntry[] => {
    const u = aliasUrl(a);
    const host = u ? (aliasHost(u) ?? u) : null;
    return [
      ...(host ? [{ id: 'copy', label: t('pa.aliases.copyName', { name: a.name }), icon: 'copy' as const, hover: true, copy: host, onAction: () => undefined }] : []),
      ...(onManage ? [{ id: 'manage', label: t('pa.aliases.manageName', { name: a.name }), short: t('pa.aliases.manage'), icon: 'computer' as const, onAction: onManage }] : []),
    ];
  };

  return (
    // The page's tab bar is the kit view bar, under the header at the place the other two tabs draw theirs.
    <ListDetailPage
      header={header}
      views={views}
      faq={pageFaq(t)}
      detail={null}
      list={
        <>
          <AnatomySection id="ports" title={t('pa.ports.title')} description={t('pa.ports.help')} state={portsState} {...(system > 0 && portsState.kind === 'ready' ? { note: t('pa.ports.system', { count: system }) } : {})} flush>
            {portsState.kind === 'ready' ? (
              <DataTable
                label={t('pa.ports.title')}
                data={yours ?? []}
                columns={portColumns}
                getRowId={(l) => String(l.port)}
                fill={false}
                bare
                noViewMenu
                sortParam={false}
                onRowAction={false}
                empty={<EmptyState icon="globe" size="sm" title={t('pa.ports.empty')} body={t('pa.ports.emptyBody')} />}
                actions={portActions}
              />
            ) : null}
          </AnatomySection>
          {canAliases ? (
          <AnatomySection id="aliases" title={t('pa.aliases.title')} description={t('pa.aliases.help')} actions={onAlias ? { secondary: [{ id: 'createAlias', label: t('pa.ports.alias'), icon: 'link', opens: 'dialog', onPress: () => onAlias() }] } : undefined} state={aliasState} flush>
            {aliasState.kind === 'ready' ? (
              <DataTable
                label={t('pa.aliases.title')}
                data={aliasRows ?? []}
                columns={aliasColumns}
                getRowId={(a) => a.id}
                fill={false}
                bare
                noViewMenu
                sortParam={false}
                onRowAction={false}
                empty={<EmptyState icon="link" size="sm" title={t('pa.aliases.empty')} body={t('pa.aliases.emptyBody')} />}
                actions={aliasActions}
              />
            ) : null}
            {/* Inset like the section's other text, so the chevron lines up with the table's first column. */}
            <Stack padding="md">
              <Why question={t('pa.why.q')} faq={{ item: byId.ownDomain, label: t('pa.why.more') }}>{t('pa.why.a')}</Why>
            </Stack>
          </AnatomySection>
          ) : (
            <AnatomySection id="aliases" title={t('pa.aliases.title')} description={t('pa.aliases.lacks')} />
          )}
        </>
      }
    />
  );
}

/** A script link's path as people write it: the query dropped, an empty path is the folder's home address. */
const pathOf = (target: string | undefined): string => (target ?? '').split('?')[0] || '/';

/**
 * Exactly what an alias goes to. A port alias: its port. A program alias: the program by name and its instance (the number
 * in its address), Desktop linking to the computer's Desktop tab. A script's public link (program exec): the script it
 * opens, named and linked as the Scripts page lists it, found in its folder's script list (read once per folder, shared
 * by every row of that folder); while that list is out, or when it can't be read, the link's path with what is known; a
 * path no listed script answers is a script that no longer exists. A program the Hub doesn't know is said to be one.
 */
function GoesTo({ a, scriptHref, desktopHref }: { a: AliasRow; scriptHref?: (rootRel: string) => string | null; desktopHref?: string }): ReactNode {
  const t = useStrings(strings);
  const script = a.program === 'exec';
  const folder = useFolderScripts(a.port, script && !a.anyPath);
  if (aliasAtPort(a)) return t('pa.aliases.port', { port: a.port });
  if (!a.program || !isKnownProgram(a.program)) return t('pa.to.unknown');
  if (!script) {
    const text = t('pa.to.instance', { name: t(`pa.aliases.program.${a.program}`), n: a.port });
    return a.program === 'display' && desktopHref ? <Link href={desktopHref} variant="nav">{text}</Link> : text;
  }
  if (a.anyPath) return t('pa.to.scriptAny');
  const path = a.port === 1 ? pathOf(a.target) : t('pa.to.inFolder', { path: pathOf(a.target), n: a.port });
  if (folder.failed) return t('pa.to.scriptUnchecked', { path });
  if (!folder.data) return t('pa.to.scriptReading', { path });
  const found = scriptOfLink(folder.data, { index: a.port, target: a.target ?? '' });
  if (!found) return t('pa.to.scriptGone', { path });
  const text = t('pa.to.script', { name: found.name, path });
  const href = scriptHref?.(found.rootRel);
  return href ? <Link href={href} variant="nav">{text}</Link> : text;
}
