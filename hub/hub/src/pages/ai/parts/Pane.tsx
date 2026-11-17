// The AI tab's layout and pane. Every /ai route draws inside AiLayout:
//
// - The page measures its own width (#hub-main, not the window): at 890 px and wider the rail (kit RailPane, 340 px by default, resizable)
//   sits beside the main region; narrower, one screen at a time: the chat list on /ai, the main region elsewhere.
// - The pane: New chat, the switcher (Chats · Agents · Automations · Knowledge · Settings, the only sub-navigation at
//   m+), the chat list on the chat routes, a group's index on its routes (Knowledge: Skills · Instructions · Memory;
//   Automations: Workflows · Loops · TODOs; Settings: Models & keys · Connections & MCP · Rules & hooks, so hooks and MCP
//   are named where a person looks), and the foot: computer · realm, agent state, Pause and the gear menu
//   (the same three settings pages, then "Stop everything in realm X…").
// - The main region keeps the shell's page scroll (the settings screens scroll #hub-main): the pane stays put beside it
//   (sticky, as tall as the page region).
// - Below PANE_MIN_PAGE the pane is not beside the screen, so every screen but the chat list carries the switcher as a
//   strip on top (else Agents had no way to the other destinations), and a group's screens its index links under it
//   (tabs would suit phones, but kit Tabs is page-legacy, so the index list stands in).
// - One pause store per computer (the pause is process-wide), shared with what the main region draws through
//   useAiPause (the open conversation's band). One stop run per computer and realm; "Stop everything" needs one
//   realm (stopAll is realm-scoped), so with All realms the item says to pick one.
import { RAIL, PAGE_MIN, PANE_MIN_PAGE, PauseContext, SWITCH, GROUPS, screenOf, RE24, useRealmName, ChatsContext, whereLine } from './Pane.pure';
import type { Group } from './Pane.pure';
export { PANE_MIN_PAGE, useAiPause, knowledgeOf, autoOf, useRealmName, useAiChats } from './Pane.pure';
export type { AiDest, AiChats } from './Pane.pure';
import type { AiDest } from './Pane.pure';
import { agent, computerHandle, hostEnv } from '@core';
import {
  ActionMenu, ContentRegion, LinkButton, PaneSeparator, PauseControl, RailFoot, RailFrame, RailNav, RailPane, RailSubnav, StopAllConfirm, StopAllResult,
  createPauseStore, createStopRun, useContainerNarrow, usePauseToggle, useElementWidth, useGo, usePaneWidth, usePathname, useShellData, useStrings,
  type IconName, type PaneRange, type PauseStore,
  SIZE_BREAKS,
} from '@kit';
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { subscribePause } from '@ask/io';
import { links } from '../links';
import { ChatList } from './ChatList';
import { ForkList } from './ForkList';
import { useChats, useChatsAt, type ChatsAt } from './data';
import strings from './Pane.strings.en.json';
import s from './Pane.module.css';

/** A group's index: one link per screen, the shown one marked as the current page. Nested under its destination in the rail;
 *  above the screen where the rail is not beside it, the same links as a strip (Pane.module.css sets the strip's hooks). */
function GroupIndex({ group, strip }: { group: Group; strip?: boolean }) {
  const t = useStrings(strings);
  const current = screenOf(group, usePathname());
  const list: ReadonlyArray<{ id: string; href: string; icon: IconName }> = GROUPS[group];
  return (
    <RailSubnav
      label={t(`${group}.label`)}
      strip={strip === true}
      items={list.map((k) => ({ id: k.id, href: k.href, label: t(`${group}.${k.id}` as 'knowledge.skills'), current: k.id === current }))}
    />
  );
}

/** The index of the group `dest` is in, or nothing for a destination without one. */
function indexOf(dest: AiDest, strip?: boolean): ReactNode {
  return dest === 'knowledge' || dest === 'auto' || dest === 'settings' ? <GroupIndex group={dest} strip={strip === true} /> : null;
}

/** The switcher above the main region where the pane is not beside it: the pane's destinations as a strip, the shown one
 *  marked. */
function SwitchStrip({ dest }: { dest: AiDest }) {
  const t = useStrings(strings);
  return (
    <RailSubnav
      label={t('switch.label')}
      strip
      items={SWITCH.map((d) => ({ id: d.id, href: d.href, label: t(`switch.${d.id}` as 'switch.chats'), current: d.id === dest }))}
    />
  );
}

/** The page region's height, so the sticky pane is exactly as tall as what shows. */
function useRegionHeight(): number | null {
  const [h, setH] = useState<number | null>(null);
  useLayoutEffect(() => {
    // No document (the terminal build): the pane takes its height from the layout, nothing to measure.
    if (hostEnv().browserPage !== true) return;
    const el = document.getElementById('hub-main');
    if (!el) return;
    const measure = () => setH(el.clientHeight > 0 ? el.clientHeight : null);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return h;
}

export interface AiLayoutProps {
  dest: AiDest;
  /** The open chat's row key (`realm/sid`) on a conversation route. */
  openKey?: string;
  /** Below PANE_MIN_PAGE: true shows the pane (the chat list) as the screen; false shows the main region. */
  paneScreen?: boolean;
  /** The main region; or a function that takes the pane and places it itself (a conversation's frame, where Details takes
   *  the pane's place at m and l): then the layout draws no pane of its own. */
  children: ReactNode | ((pane: ReactNode) => ReactNode);
}

export function AiLayout({ dest, openKey, paneScreen = false, children }: AiLayoutProps) {
  const t = useStrings(strings);
  const placed = typeof children === 'function';
  // A conversation's frame keeps its rail beside the chat down to SplitLayout's own break, so its rail stays a rail that far.
  const narrow = useContainerNarrow(placed ? SIZE_BREAKS[1] : PANE_MIN_PAGE);
  const at = useChatsAt();
  const height = useRegionHeight();
  const shell = useShellData();
  const cid = at?.target.container.id ?? '';
  const pid = at?.target.project.id ?? '';
  const computerName = shell.computers.find((c) => c.id === cid)?.name ?? '';
  const target = at?.target ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one store per computer (the target object may be rebuilt)
  const pause = useMemo(() => (target ? createPauseStore({ api: agent.pauseApi(target) }) : null), [pid, cid]);
  // event.pause_state from this computer's open chats' streams (ask/pauseBus.ts) reaches the store the foot and the open chat's band share;
  // the store orders it by gen. The subscription goes with the store or the computer, and with the pane.
  useEffect(() => (pause && cid ? subscribePause(cid, (st) => pause.apply(st)) : undefined), [pause, cid]);
  const showPane = !narrow || paneScreen;
  const showMain = !narrow || !paneScreen;
  const layoutRef = useRef<HTMLDivElement>(null);
  const [railW, setRailW] = usePaneWidth('ai', 'list', RAIL);
  const layoutW = useElementWidth(layoutRef, !narrow);
  // What the grid draws (the main region keeps PAGE_MIN), which is what the handle works from: a stored width wider than the room never makes it lag.
  const railRange = useMemo<PaneRange>(() => {
    if (layoutW === undefined) return RAIL;
    const room = Math.max(RAIL.min, Math.min(RAIL.max, layoutW - PAGE_MIN));
    return { min: RAIL.min, max: room, def: Math.min(RAIL.def, room) };
  }, [layoutW]);
  const railShown = Math.min(railW, railRange.max);
  if (!at || !pause) {
    return (
      <RailFrame width={railShown} regionHeight={height} single>
        <ContentRegion>{placed ? children(null) : children}</ContentRegion>
      </RailFrame>
    );
  }
  const handle = narrow ? undefined : <PaneSeparator value={railShown} range={railRange} onChange={setRailW} dir={1} label={t('pane.resize')} />;
  const pane = <Pane dest={dest} strip={narrow} handle={handle} {...(openKey !== undefined ? { openKey } : {})} pause={pause} />;
  return (
    <PauseContext.Provider value={pause}>
      <Chats at={at} computerName={computerName}>
        <RailFrame ref={layoutRef} width={railShown} regionHeight={height} single={narrow || placed}>
          {/* Below PANE_MIN_PAGE the chat list is the whole screen: it names it, as every page has an h1 (the shell's
              route focus lands on it). Beside the page, the main region's own screen carries the heading. */}
          {narrow && paneScreen && (
            <h1 className={s.srOnly} data-hub-title="" tabIndex={-1}>
              {t('pane.label')}
            </h1>
          )}
          {placed ? <ContentRegion>{children(pane)}</ContentRegion> : (
            <>
              {showPane && pane}
              {showMain && <ContentRegion>{narrow && <SwitchStrip dest={dest} />}{narrow && indexOf(dest, true)}{children}</ContentRegion>}
            </>
          )}
        </RailFrame>
      </Chats>
    </PauseContext.Provider>
  );
}

function Chats({ at, computerName, children }: { at: ChatsAt; computerName: string; children: ReactNode }) {
  const chats = useChats(at);
  // No name yet (the shell's computer list is still loading): no handle, so no row links a wrong computer.
  const handle = computerName ? computerHandle({ id: at.target.container.id, name: computerName }) : '';
  return <ChatsContext.Provider value={{ at, chats, computerName, handle }}>{children}</ChatsContext.Provider>;
}

function Pane({ dest, openKey, pause, strip, handle }: { dest: AiDest; openKey?: string; pause: PauseStore; strip: boolean; handle: ReactNode }) {
  const t = useStrings(strings);
  const realmName = useRealmName();
  const { at, chats, computerName, handle: computer } = useContext(ChatsContext)!;
  const realm = realmName(at.realm);
  const needs = chats.needs;
  return (
    <RailPane
      label={t('pane.label')}
      strip={strip}
      // One accent per view: starting a chat is the main action on Chats only; every other destination's screen has its own.
      head={<LinkButton href={links.newChat} variant={dest === 'chats' ? 'primary' : 'secondary'} icon="plus">{t('pane.newChat')}</LinkButton>}
      nav={
        <RailNav
          label={t('switch.label')}
          items={SWITCH.map((d) => ({
            id: d.id,
            href: d.href,
            icon: d.icon,
            label: t(`switch.${d.id}` as 'switch.chats'),
            current: d.id === dest,
            mark: d.id === 'chats' && needs > 0,
            below: !strip && d.id === dest ? indexOf(d.id) : null,
          }))}
        />
      }
      foot={<Foot at={at} computerName={computerName} realm={realm} needs={needs} pause={pause} />}
      handle={handle}
    >
      {strip && indexOf(dest, true)}
      {dest === 'chats' && (
        <ChatList
          at={at}
          chats={chats}
          handle={computer}
          computerName={computerName}
          note={<ForkList at={at} handle={computer} computerName={computerName} />}
          {...(openKey !== undefined ? { openKey } : {})}
        />
      )}
    </RailPane>
  );
}

// The foot's Needs you line: the count only when successful reads found chats waiting; otherwise nothing. The foot never
// claims that nothing waits ("Agent ready"): a read can fail, be out or be paused, and the list says what it could not check.
function needsLine(t: (k: 'foot.needs' | 'foot.needsMany', v?: { count: number }) => string, needs: number): string {
  return needs > 0 ? t(needs === 1 ? 'foot.needs' : 'foot.needsMany', { count: needs }) : '';
}

function Foot({ at, computerName, realm, needs, pause }: { at: ChatsAt; computerName: string; realm: string; needs: number; pause: PauseStore }) {
  const t = useStrings(strings);
  const go = useGo();
  const one = at.realm === 'global' || RE24.test(at.realm);
  const pid = at.target.project.id;
  const cid = at.target.container.id;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one run per computer and realm
  const stopRun = useMemo(() => (one ? createStopRun({ api: agent.stopApi(at.target), realm: at.realm }) : null), [pid, cid, at.realm, one]);
  const [stopOpen, setStopOpen] = useState(false);
  // Pause is a gear item, not a top-level button; it runs the pause's one toggle (PauseControl's), so the gear,
  // Rules & hooks and the paused strip's Resume send the same change. While paused or unsure the foot keeps its strip;
  // before the first read answers the gear offers nothing (the computer may already be paused).
  const toggle = usePauseToggle(pause);
  return (
    <RailFoot
      icon="computer"
      title={whereLine(t, computerName, realm)}
      note={needsLine(t, needs)}
      action={<PauseControl store={pause} computer={computerName} rail quiet />}
      end={
        <ActionMenu
          label={t('gear.label')}
          icon="sliders"
          placement="top end"
          items={[
            { id: 'models', label: t('gear.models'), icon: 'hoody-ai', onAction: () => go(links.list) },
            { id: 'connections', label: t('gear.connections'), icon: 'link', onAction: () => go(links.connections) },
            { id: 'rules', label: t('gear.rules'), icon: 'lock', onAction: () => go(links.rules) },
            ...(toggle?.known
              ? [{
                  id: 'pause',
                  label: toggle.label,
                  icon: toggle.kind === 'pause' ? ('pause' as const) : ('play' as const),
                  ...(toggle.kind === 'pause' ? { description: t('gear.pauseNote', { computer: computerName }) } : {}),
                  isDisabled: toggle.isDisabled,
                  onAction: toggle.run,
                }]
              : []),
            '-',
            {
              id: 'stop',
              label: t('gear.stopAll', { realm }),
              tone: 'danger',
              opens: true,
              isDisabled: !stopRun,
              ...(stopRun ? {} : { disabledReason: t('gear.stopAllPickRealm') }),
              onAction: () => setStopOpen(true),
            },
          ]}
        />
      }
    >
      {stopRun && (
        <>
          <StopAllConfirm run={stopRun} realm={realm} computer={computerName} estimate={null} isOpen={stopOpen} onOpenChange={setStopOpen} />
          <div className={s.stopResult}>
            <StopAllResult run={stopRun} realm={realm} />
          </div>
        </>
      )}
    </RailFoot>
  );
}
