// Programs tab: the background programs of this computer, attention first, then running, then
// stopped; Hoody's own programs sit in one collapsed "System programs" group row of the same table. One press is one request;
// an answer that may have gone through stays marked until the list is read again.
import { chooseComputer, reachOf, useCurrentComputer } from '@core';
import { ActionBar, Button, ConfirmDialog, DataTable, EmptyState, Stack, StatusPill, UnreachableState, TextButton, useDataView, Link, createColumnHelper, statusPillMetrics, followPageLink, useGo, usePageLink, usePageVisible, useStrings, type RowActionEntry, type Tone } from '@kit';
import { useMemo, useState } from 'react';
import { links as appsLinks } from '../../apps/links';
import { logsLinkFor } from '../../logs/links';
import { links as programsLinks } from '../../programs/links';
import { subjectOf, usePrograms } from '../data';
import type { useProgramOps, ProgramAct } from './programOps';
import { PROGRAM_ATTENTION, bucket, handleOf, programCan, uptimeParts } from '../logic';
import strings from '../strings.en.json';
import type { Computer, Program, ProgramState } from '../types';
import s from './parts.module.css';

const col = createColumnHelper<Program>();

const GROUPS = ['attention', 'running', 'stopped'] as const;
const groupOf = (p: Program) => (p.system ? 'system' : PROGRAM_ATTENTION.has(p.state) ? 'attention' : p.state === 'running' ? 'running' : 'stopped');
const TONE: Record<string, Tone> = { running: 'ok', starting: 'info', stopped: 'neutral', idle: 'neutral', restarting: 'warn', failed: 'danger', unknown: 'warn' };

function Uptime({ seconds }: { seconds: number | null }) {
  const t = useStrings(strings);
  if (seconds === null) return <span className={s.faint}>—</span>;
  const u = uptimeParts(seconds);
  return <span className={s.mono}>{u.d ? t('prog.up.dh', { d: u.d, h: u.h }) : u.h ? t('prog.up.hm', { h: u.h, m: u.m }) : u.m ? t('prog.up.m', { m: u.m }) : t('prog.up.s', { s: u.s })}</span>;
}

export function Programs({ c, ops }: { c: Computer; ops: ReturnType<typeof useProgramOps> }) {
  const t = useStrings(strings);
  const go = useGo();
  // A restart the Programs page sent (no receipt key here) is checked there, only while this load serves that
  // page: null when it is hidden (a hidden sender gets no link at all; usePageLink is null for it too, and
  // the visibility check stays as the rule's own statement).
  const programsServed = usePageVisible('programs');
  const programsPageLink = usePageLink('programs');
  const programsLink = programsServed ? programsPageLink : null;
  // The Programs page shows the current computer: make the held one current first, so the link lands on it.
  const openPrograms = () => {
    if (!programsLink) return;
    chooseComputer(c);
    followPageLink(programsLink, go);
  };
  // Launch an app and New program live on the Programs page, which acts on the current computer:
  // this one is made current first when it is not, so the launcher or the form opens on it.
  const current = useCurrentComputer();
  const toPrograms = (href: string) => {
    if (!programsLink) return;
    if (current?.container.id !== c.id) chooseComputer(c);
    go(href);
  };
  const running = bucket(c.status) === 'running';
  const list = usePrograms(c, running);
  const [askRaw, setAsk] = useState<{ cid: string; p: Program; act: 'stop' | 'restart' } | null>(null);
  // A confirmation belongs to the computer it was opened on: after a switch it is closed.
  const ask = askRaw && askRaw.cid === c.id ? askRaw : null;
  // The warned Dismiss of a held action this tab sent (C9): asked first, on the computer it was opened on.
  const [dropRaw, setDrop] = useState<{ cid: string; p: Program; hold: string | undefined } | null>(null);
  const drop = dropRaw && dropRaw.cid === c.id ? dropRaw : null;
  const busy = useMemo(() => {
    const mine: Record<string, 'busy' | 'pending' | 'failed'> = {};
    for (const [k, v] of Object.entries(ops.busy)) if (k.startsWith(`${c.id}:`)) mine[k.slice(c.id.length + 1)] = v;
    return mine;
  }, [ops.busy, c.id]);
  const press = (p: Program, a: ProgramAct) => ops.press(c, p, a, () => void list.refetch());

  const request = (p: Program, a: 'start' | 'stop' | 'restart') => (p.system && a !== 'start' ? setAsk({ cid: c.id, p, act: a }) : void press(p, a));

  // Logs through the shell's page link and the Logs page's own logsLinkFor: this program on this computer inside
  // the Hub; no Logs control when this load hides Logs (there is no classic page to fall back to).
  const logsLink = usePageLink('logs');
  const logsHref = (p: Program) => logsLinkFor({ computer: handleOf(c), program: p.id });
  const openLogs = (p: Program) => {
    if (!logsLink) return;
    if (logsLink.kind === 'hub') go(logsHref(p));
    else followPageLink(logsLink, go);
  };
  const system = (list.data ?? []).filter((p) => p.system);
  const systemProblems = system.filter((p) => PROGRAM_ATTENTION.has(p.state)).length;
  const groups = [
    ...GROUPS.map((id) => ({ id, label: t(`prog.group.${id}`) })),
    {
      id: 'system',
      label: t('prog.systemTitle'),
      defaultCollapsed: true,
      ...(systemProblems ? { extra: <StatusPill tone="warn" dot>{t('prog.systemProblems', { count: systemProblems })}</StatusPill> } : {}),
    },
  ];

  const columns = useMemo(
    () => [
      col.accessor('name', { header: t('prog.col.name'), meta: { pinned: true, label: t('prog.col.name') }, cell: (x) => <strong>{x.getValue()}</strong> }),
      col.accessor('state', {
        header: t('prog.col.state'),
        // As wide as the longest pill shown (its words, not a fixed 150 px), so Up for keeps its place on a small screen.
        meta: {
          size: 'fit',
          fitMetrics: statusPillMetrics(true),
          fitText: (r: Program) => {
            const b = busy[r.id];
            return t(b === 'busy' ? 'op.busy.prog' : b === 'pending' ? 'op.pill.pending' : b === 'failed' ? 'op.pill.failed' : `prog.state.${r.state}`);
          },
          label: t('prog.col.state'),
        },
        cell: (x) => {
          const b = busy[x.row.original.id];
          if (b === 'busy') return <StatusPill tone="info" dot>{t('op.busy.prog')}</StatusPill>;
          // Short pill words; the full sentence is the pill's tooltip (the cell is too narrow for it).
          const k = `${c.id}:${x.row.original.id}`;
          if (b === 'pending')
            return (
              <span title={t(ops.elsewhere[k] || ops.foreign[k] ? 'op.pendingElsewhere' : 'op.pending')}>
                <StatusPill tone="warn" dot>{t('op.pill.pending')}</StatusPill>
              </span>
            );
          if (b === 'failed')
            return (
              <span title={t('op.failed')}>
                <StatusPill tone="danger" dot>{t('op.pill.failed')}</StatusPill>
              </span>
            );
          return <StatusPill tone={TONE[x.getValue()] ?? 'neutral'} dot>{t(`prog.state.${x.getValue() as ProgramState}`)}</StatusPill>;
        },
      }),
      ...(logsLink
        ? [
            col.display({
              id: 'logs',
              header: t('prog.logs'),
              meta: { width: '80px', priority: 2, label: t('prog.logs') },
              cell: (x) =>
                logsLink.kind === 'hub' ? (
                  <Link variant="nav" href={logsHref(x.row.original)}>
                    {t('prog.logs')} {t('nav.more')}
                  </Link>
                ) : (
                  <TextButton onPress={() => followPageLink(logsLink, go)}>
                    {t('prog.logs')} {t('nav.more')}
                  </TextButton>
                ),
            }),
          ]
        : []),
      col.display({
        id: 'up',
        header: t('prog.col.up'),
        meta: { width: '64px', priority: 2, label: t('prog.col.up') },
        cell: (x) => <Uptime seconds={x.row.original.uptimeSeconds} />,
      }),
      col.display({
        id: 'ports',
        header: t('prog.col.ports'),
        meta: { width: '120px', priority: 3, label: t('prog.col.ports') },
        cell: (x) => <span className={s.mono}>{x.row.original.ports.join(', ') || '—'}</span>,
      }),
      col.display({
        id: 'boot',
        header: t('prog.col.boot'),
        meta: { width: '90px', priority: 4, label: t('prog.col.boot') },
        cell: (x) => (x.row.original.boot === null ? <span className={s.faint}>—</span> : <span>{x.row.original.boot ? t('prog.boot.on') : t('prog.boot.off')}</span>),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, busy, go, list, c.id, ops, programsLink, logsLink],
  );

  const view = useDataView<Program>({
    rows: list.isPending ? undefined : (list.data ?? []),
    columns,
    getRowId: (p) => p.id,
    isLoading: list.isPending,
    error: list.error,
    search: ['name'],
    sort: 'name',
    param: 'p',
  });

  if (!running) return <EmptyState icon="stop" size="sm" title={t('prog.notRunning', { name: c.name })} />;
  // With no known server the programs read has no target and never runs: say why, never an empty list or an error.
  if (!subjectOf(c).server) return <EmptyState icon="info" size="sm" title={t('prog.noServer')} body={t('prog.noServer.body')} />;
  // Nothing read and the computer did not answer at all (core reachOf): the shared not-reachable state.
  if (list.error && !list.data && reachOf(list.error) === 'unreachable') {
    return <UnreachableState size="sm" computer={c.name} lastSeen={list.dataUpdatedAt || undefined} onRetry={() => void list.refetch()} retrying={list.isFetching} error={list.error} />;
  }

  // Every action of a row, declared once (kit actions): the row's fix, when it has one, is its one inline button (a
  // failed program's Restart, Check for a lost answer, Check on Programs for a change sent from there), and the rest
  // are in its ⋯ menu (no Actions column of fix buttons).
  const rowActions = (p: Program): RowActionEntry[] => {
    const can = programCan(p.state, !!p.range);
    const held = busy[p.id] === 'busy' || busy[p.id] === 'pending';
    const k = `${c.id}:${p.id}`;
    const pending = busy[p.id] === 'pending';
    const away = pending && (ops.elsewhere[k] || ops.foreign[k]);
    // A failed port-range program restarts per port only (programCan): no whole-program Restart then.
    const restartFix = p.state === 'failed' && !busy[p.id] && can.restart;
    const out: RowActionEntry[] = [];
    if (away && programsLink) out.push({ id: 'programs', label: t('op.checkOnPrograms'), icon: 'programs', inline: true, onAction: openPrograms });
    if (pending && !away) {
      out.push({ id: 'check', label: t('outcome.check'), inline: true, onAction: () => { void list.refetch().then((r) => { if (!r.isError) void ops.settled(c.id, p.id, c); }); } });
    }
    if (can.start) out.push({ id: 'start', label: t('prog.start'), icon: 'play', isDisabled: held, onAction: () => request(p, 'start') });
    if (can.restart) out.push({ id: 'restart', label: t('prog.restart'), icon: 'reload', isDisabled: held, ...(restartFix ? { inline: true } : {}), onAction: () => request(p, 'restart') });
    if (can.stop) out.push({ id: 'stop', label: t('prog.stop'), icon: 'stop', isDisabled: held, onAction: () => request(p, 'stop') });
    if (pending && !ops.elsewhere[k] && !ops.foreign[k] && ops.canDismiss) {
      out.push({ id: 'dismiss', label: t('held.dismiss'), icon: 'x', onAction: () => setDrop({ cid: c.id, p, hold: ops.holdShown(c.id, p.id) }) });
    }
    if (logsLink) out.push({ id: 'logs', label: t('prog.logs'), icon: 'logs', onAction: () => openLogs(p) });
    return out;
  };

  // Shown once, in the bar or (for a list read whole and empty) in the empty state, never both.
  const launch = { id: 'launch-app', label: t('prog.launchApp'), icon: 'plus' as const, onPress: () => toPrograms(appsLinks.launch) };
  const add = { id: 'new-program', label: t('prog.newProgram'), icon: 'plus' as const, onPress: () => toPrograms(programsLinks.newProgram) };
  const listEmpty = !list.isPending && !list.error && (list.data ?? []).length === 0;
  const emptyLaunch = programsLink ? (
    <Button variant="primary" icon={launch.icon} onPress={launch.onPress}>
      {t('prog.launchApp')}
    </Button>
  ) : undefined;
  const emptyAdd = programsLink ? (
    <Button variant="secondary" icon={add.icon} onPress={add.onPress}>
      {t('prog.newProgram')}
    </Button>
  ) : undefined;

  return (
    <Stack gap={3}>
      <p className={s.help}>{t('prog.lede', { name: c.name })}</p>
      {programsLink && !listEmpty && <ActionBar label={t('prog.actions')} size="sm" primary={launch} secondary={[add]} />}
      <DataTable
        label={t('prog.title')}
        countLabel={(n) => t('count.programs', { count: n })}
        view={view}
        columns={columns}
        onRowAction={false}
        onRetry={() => void list.refetch()}
        onRefresh={() => void list.refetch()}
        search={t('prog.search')}
        actions={rowActions}
        fill={false}
        groupBy={groupOf}
        groups={groups}
        empty={<EmptyState icon="programs" size="sm" title={t('prog.empty')} body={t('prog.emptyBody')} action={emptyLaunch} secondary={emptyAdd} />}
        noViewMenu
      />
      <ConfirmDialog overlayId="computers-programs-confirm-dialog"
        isOpen={ask !== null}
        onOpenChange={(o) => !o && setAsk(null)}
        title={ask ? t(`prog.ask.${ask.act}`, { name: ask.p.name }) : ''}
        body={t('prog.ask.body')}
        confirmLabel={ask ? t(`prog.${ask.act}`) : ''}
        // Stop and restart are plain confirms with the accent action: nothing is deleted.
        onConfirm={() => {
          const a = ask;
          setAsk(null);
          if (a) void press(a.p, a.act);
        }}
      />
      <ConfirmDialog overlayId="computers-programs-held-dismiss"
        isOpen={drop !== null}
        onOpenChange={(o) => !o && setDrop(null)}
        title={t('held.dismissTitle')}
        body={t('held.dismissBodyChange')}
        confirmLabel={t('held.dismissGo')}
        onConfirm={() => {
          const d = drop;
          setDrop(null);
          if (d) void ops.dismiss(c.id, d.p.id, c, d.hold ?? '');
        }}
      />
    </Stack>
  );
}
