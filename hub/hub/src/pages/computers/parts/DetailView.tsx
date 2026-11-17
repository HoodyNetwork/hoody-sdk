// The detail of one computer: header (name, state, server, project, realms; primary action),
// then the tabs Overview, Connect, Permissions, Ports & addresses, Desktop, Network, Run, Programs, Backups and Storage. The tab is kept in the URL
// (an old ?tab=advanced opens Ports & addresses).
import { Button, ComputerMark, DetailPage, Link, LinkButton, OutcomeBanner, StatusPill, Tag, Tooltip, useSearchParam, useStrings, type MenuEntry, useContainerNarrow } from '@kit';
import { computerColor } from '@core';
import { useEffect } from 'react';
import { type Caps, allowedOps, allows, bucket, serverLabel } from '../logic';
import strings from '../strings.en.json';
import type { Computer, Project, Realm } from '../types';
import { programUrl } from '../urls';
import { useUsage } from '../data';
import { links } from '../links';
import { Connect } from './Connect';
import { Desktop } from './Desktop';
import { Network } from './Network';
import networkStrings from './Network.strings.en.json';
import { Overview } from './Overview';
import { Permissions } from './Permissions';
import { Ports, type PortsOverlay } from './Ports';
import { Programs } from './Programs';
import type { useProgramOps } from './programOps';
import { Run } from './Run';
import { SnapshotsTab } from '../snapshots';
import { SharesSection, StorageTab, sharesUiOn } from '../../files/links';
import { ColourButton, RealmChips, ServerLabel, StatePill } from './Bits';
import type { ComputerAction } from './menu';
import { computerMenu } from './menu';
import { useOut } from './useOut';
import type { OpState } from './ops';
import { Held } from './Held';
import { HeadItem, HeadLine } from './HeadLine';
import s from './parts.module.css';

export function DetailView({
  c,
  projects,
  realms,
  caps,
  current,
  op,
  usageOn,
  onUsageOn,
  onAction,
  onOverlay,
  onCheck,
  onDismiss,
  onForget,
  programOps,
}: {
  c: Computer;
  projects: Project[] | undefined;
  realms: Realm[] | undefined;
  caps: Caps;
  current: boolean;
  op: OpState | undefined;
  usageOn: boolean;
  onUsageOn: (on: boolean) => void;
  onAction: (c: Computer, a: ComputerAction) => void;
  onOverlay: (o: PortsOverlay, extra?: { port?: number; alias?: string }) => void;
  onCheck: () => void;
  onDismiss: () => void;
  /** Closes a definite refusal's banner (failed, not sent): local only, never core's warned Dismiss. */
  onForget: () => void;
  programOps: ReturnType<typeof useProgramOps>;
}) {
  const t = useStrings(strings);
  const tn = useStrings(networkStrings);
  const narrow = useContainerNarrow(600);
  const out = useOut();
  const [tab, setTab] = useSearchParam('tab');
  useEffect(() => {
    if (tab === 'advanced') setTab('ports', { replace: true });
  }, [tab, setTab]);
  const b = bucket(c.status);
  const ops = allowedOps(c, caps);
  const primary = b === 'stopped' ? ops.find((o) => o === 'start') : b === 'paused' ? ops.find((o) => o === 'resume') : b === 'failed' ? ops.find((o) => o === 'restart') : undefined;
  const canStart = primary === 'start' || primary === 'resume';
  // At phone width Open terminal and Make current leave the head for the menu; wider, the head holds them.
  const items: MenuEntry[] = computerMenu(c, caps, current, t, onAction, { terminal: narrow && b === 'running', logs: out.has.logs }).filter((e) => e === '-' || (narrow || (e.id !== 'openTerminal' && e.id !== 'makeCurrent')));

  const projectName = projects?.find((p) => p.id === c.project_id)?.name;
  // The colour opens its dialog from here and from the Colour row in Where it runs, where it may be changed.
  const colour = computerColor(c);
  const onColour = colour && allows(caps, 'colour') ? () => onOverlay('colour') : undefined;
  const mark = <ComputerMark color={c.color} size="md" />;
  // The title line: the colour mark before the name (it opens the colour dialog when the colour may change), then
  // the state pill.
  const leading = colour && onColour ? <ColourButton c={c} colour={colour} onPress={onColour}>{mark}</ColourButton> : mark;
  const state = op?.kind === 'busy' ? <StatusPill tone="info" dot>{t(`op.busy.${op.op}`)}</StatusPill> : <StatePill status={c.status} />;
  // "Current computer" is a calm label, its meaning in the label's own tip (never a loose ⓘ).
  const currentTag = current ? <Tag tip={t('default.help')}>{t('current.label')}</Tag> : null;
  const sv = serverLabel(c);
  const ids = c.realm_ids ?? [];
  // One meta row, every item behind the same "·": server (flag for its country, a link to its panel), the project,
  // the realms, then Current. The city is in Where it runs: the row stays short enough for the actions to stay beside
  // the title at a 720 px pane. At phone width the row holds only the state and Current (the rest is in Where it runs).
  const meta = narrow ? (
    <HeadLine>
      <HeadItem>{state}</HeadItem>
      {currentTag ? <HeadItem>{currentTag}</HeadItem> : null}
    </HeadLine>
  ) : (
    <HeadLine>
      {sv.name ? (
        <HeadItem>
          <Link variant="nav" href={links.server(sv.name)}>
            <ServerLabel computer={c} place={false} />
          </Link>
        </HeadItem>
      ) : null}
      {projectName ? <HeadItem>{projectName}</HeadItem> : null}
      {ids.length ? (
        <HeadItem>
          <RealmChips ids={ids} realms={realms} max={2} {...(allows(caps, 'realms') ? { open: { name: c.name, onPress: () => onOverlay('realms') } } : {})} />
        </HeadItem>
      ) : null}
      {currentTag ? <HeadItem>{currentTag}</HeadItem> : null}
    </HeadLine>
  );

  const banner =
    op?.kind === 'pending' ? (
      <Held kind="lifecycle" name={c.name} dismissOnly={op.op === 'restart'} elsewhere={op.elsewhere} onCheck={onCheck} onDismiss={onDismiss} />
    ) : op?.kind === 'failed' || op?.kind === 'not_sent' ? (
      <OutcomeBanner kind={op.kind} title={t('op.failedTitle', { name: c.name })} error={{ outcome: op.kind, ...(op.code ? { code: op.code } : {}), ...op.facts }} onDismiss={onForget} />
    ) : undefined;

  return (
    <DetailPage
      header={{
        size: narrow ? 'md' : 'sm',
        title: c.name,
        breadcrumbs: [
          { label: t('title'), href: '/computers' },
          { label: c.name },
        ],
        // Title line: colour mark, name, state. Under it one meta row. On the end side one cluster, every control the
        // kit's default size: the way in (Open terminal while it runs, else Start, Resume or Restart; an expired computer
        // links to its server instead), Make current; the kit adds the list control, then the computer's menu last.
        // Pinning the terminal to a board is on the Terminal tile of Open on, so the head does not repeat it.
        leading,
        ...(narrow ? {} : { meta: state }),
        subtitle: meta,
        actions: (
          <>
            {c.server_expired ? (
              // Expired: no lifecycle call works (409 COMPUTER_EXPIRED), so the one way forward is the server it ran on.
              sv.name ? (
                <LinkButton literal href={links.server(sv.name)} iconEnd="arrow-right">
                  {t('head.toServer', { server: sv.name })}
                </LinkButton>
              ) : null
            ) : primary ? (
              <Button variant="primary" icon={primary === 'restart' ? 'reload' : 'play'} busy={op?.kind === 'busy'} onPress={() => onAction(c, primary)}>
                {t(`menu.${primary}`)}
              </Button>
            ) : b === 'running' && !narrow ? (
              <Button variant="secondary" icon="terminal" iconEnd="external" onPress={() => onAction(c, 'openTerminal')} isDisabled={!programUrl(c, 'terminal')} disabledReason={t('menu.noTerminal')}>
                {t('menu.openTerminal')}
              </Button>
            ) : null}
            {current || narrow ? null : (
              <Tooltip content={t('menu.makeCurrent.tip')}>
                <Button onPress={() => onAction(c, 'makeCurrent')}>{t('menu.makeCurrent')}</Button>
              </Tooltip>
            )}
          </>
        ),
      }}
      // The computer's menu is the kit's: last in the end cluster, after the list control.
      menu={items}
      menuLabel={t('menu.actions', { name: c.name })}
      notice={banner}
      accent={c.color}
      tabs={[
        {
          id: 'overview',
          label: t('tab.overview'),
          content: (
            <div className={s.overview}>
              <Overview c={c} projects={projects} realms={realms} usageOn={usageOn} onUsageOn={onUsageOn} canStart={canStart} onStart={() => primary && onAction(c, primary)} onRealms={allows(caps, 'realms') ? () => onOverlay('realms') : undefined} onColour={onColour} current={current} />
            </div>
          ),
        },
        { id: 'connect', label: t('tab.connect'), content: <Connect c={c} canSshKey={caps === 'all' || caps.has('account')} onSshKey={() => onOverlay('ssh')} /> },
        { id: 'permissions', label: t('tab.permissions'), content: <Permissions c={c} projects={projects} onRealms={allows(caps, 'realms') ? () => onOverlay('realms') : undefined} /> },
        { id: 'ports', label: t('tab.ports'), content: <Ports c={c} onOverlay={onOverlay} /> },
        { id: 'desktop', label: t('tab.desktop'), content: <Desktop key={c.id} c={c} canStart={canStart} onStart={() => primary && onAction(c, primary)} /> },
        { id: 'network', label: tn('network.tab'), content: <Network c={c} canWrite={caps === 'all' || caps.has('account')} /> },
        { id: 'run', label: t('tab.run'), content: <Run key={c.id} c={c} canStart={canStart} onStart={() => primary && onAction(c, primary)} onCheck={onCheck} /> },
        { id: 'programs', label: t('tab.programs'), content: <Programs c={c} ops={programOps} /> },
        { id: 'backups', label: t('tab.backups'), content: <SnapshotsTab key={c.id} computer={c} canWrite={caps === 'all' || caps.has('account')} /> },
        { id: 'storage', label: t('tab.storage'), content: <StorageHost c={c} canWrite={caps === 'all' || caps.has('account')} usageOn={usageOn} onStart={canStart ? () => primary && onAction(c, primary) : undefined} /> },
      ]}
    />
  );
}

/** The Storage tab with what only this page knows: the computer's own disk (the Overview's usage read, same query,
 *  only while usage is on and the computer runs) and Start for a stopped computer. Files shows the tab without them.
 *  Under it, the computer's shared folders, as Files shows them without its every-computer switch. */
function StorageHost({ c, canWrite, usageOn, onStart }: { c: Computer; canWrite: boolean; usageOn: boolean; onStart: (() => void) | undefined }) {
  const on = usageOn && c.status === 'running';
  const usage = useUsage(c.id, on);
  const disk = !on ? undefined : usage.isPending ? ('reading' as const) : usage.isError ? null : (usage.data?.diskBytes ?? null);
  return (
    <>
      <StorageTab computer={c} canWrite={canWrite} {...(disk === undefined ? {} : { disk })} {...(onStart ? { onStart } : {})} />
      {/* This computer's shared folders, read only: mounted (and read) only while the Shared folders switch is on. */}
      {sharesUiOn() ? <SharesSection key={c.id} computer={c} /> : null}
    </>
  );
}
