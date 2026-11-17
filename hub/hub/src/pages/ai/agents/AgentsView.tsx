// The AI tab's Agents destination: the agents table (full width until one is chosen) beside the chosen agent's overview
// (its model changes there), its tools (AgentTools: ticks and one Save), its file-only settings (AgentFileSettings) and the
// agent's file below them (AgentSource: edit, Reset to shipped, Delete). The detail's header offers "New chat
// with this agent" (New chat's `?agent=`) for every agent New chat may start, never a product-owned one. The parent may
// own the chosen agent (URL state); without it the view keeps its own.
import { useEffect, useRef, useState } from 'react';
import { Band, DetailPage, ErrorState, LeaveGuard, LinkButton, ListDetailPage, Skeleton, Tag, TextButton, useGo, useShellData, useStrings } from '@kit';
import { isRealmOrGlobal, registerSwitchGuard, useCurrentComputer } from '@core';
import { useAiRealm } from '../aiRealm';
import { agentsSource, useAgents } from './data';
import type { AgentRow } from './logic';
import { links } from '../links';
import { AgentList, useAgentListView } from './List';
import { AgentFileSettings } from './FileSettings';
import { AgentOverview } from './Overview';
import { provenanceWord } from './words';
import { AgentSource } from './Source';
import { AgentTools } from './Tools';
import s from './agents.module.css';
import strings from './strings.en.json';

export interface AgentsViewProps {
  selected?: string | null;
  onSelect?: (name: string) => void;
  /** The computer's agents are paused (the host's per-computer pause store). Unknown = false: Reset and Delete are then
   *  offered, and a paused agent still refuses them with daemon_paused, which the editor says. */
  paused?: boolean;
  /** The chosen agent was deleted (a host that owns the choice goes back to the list). Without it the view goes back to
   *  its own empty choice; a choice the host owns shows the list's pick note until the host's choice changes. */
  onDeleted?: () => void;
}

export function AgentsView(p: AgentsViewProps) {
  const t = useStrings(strings);
  const computer = useCurrentComputer();
  // The realm the agents are read and changed in (aiRealm.ts): the one at the top, or under All realms the computer's own
  // (Global for a computer in no realm). Agents belong to one realm: with no one realm to tell (a computer in several realms
  // under All realms) the list read would be refused before it is sent (AGENT_REALM_REQUIRED), so the page asks for a realm
  // and reads nothing, as Skills does. While the computer's realms are read, the page is loading (no question yet).
  const { realm, deciding } = useAiRealm();
  const header = { title: t('title'), subtitle: t('subtitleBare') };
  if (computer && deciding) return <ListDetailPage header={header} state={{ kind: 'loading' }} list={null} detail={null} />;
  if (computer && !isRealmOrGlobal(realm)) {
    return <ListDetailPage header={header} state={{ kind: 'notHere', icon: 'realm', title: t('allRealms.title'), body: t('allRealms.body') }} list={null} detail={null} />;
  }
  return <AgentsIn p={p} realm={isRealmOrGlobal(realm) ? realm : undefined} />;
}

/** `realm`: the one realm every read and change here names (undefined only with no computer, when nothing is read). */
function AgentsIn({ p, realm }: { p: AgentsViewProps; realm: string | undefined }) {
  const t = useStrings(strings);
  const computer = useCurrentComputer();
  const shell = useShellData();
  const read = useAgents(!!computer, realm);
  // The list read's whole identity (account, realm, generation, computer, the realm it names): what is kept from a read, and
  // the editors, belong to it alone.
  const readKey = agentsSource.useQueryHash('list', realm);
  const [ownSel, setOwnSel] = useState<string | null>(null);
  // The host's choice that was just deleted, while the host has not moved off it (it gave no onDeleted).
  const [deleted, setDeleted] = useState<string | null>(null);
  // Bumped by each delete: a shipped agent that takes the deleted one's place under the same name gets a fresh editor.
  const [gen, setGen] = useState(0);
  // The editors' leave checks. The view owns the one route guard for both (a path change asks once) and asks them itself,
  // also for a choice it keeps itself, which changes no path.
  const sourceLeave = useRef<((go: () => void, stay?: () => void) => void) | null>(null);
  const toolsLeave = useRef<((go: () => void, stay?: () => void) => void) | null>(null);
  const fileRef = useRef<HTMLDivElement>(null);
  // The last list read as a list, of this read only (another computer, realm, account or generation never shows it; a new
  // read with nothing yet clears it). An answer that is not a list fails the read with no rows; the rows it replaced stay
  // on screen under the warning, as for any failed re-read.
  const lastRows = useRef<{ key: string; rows: AgentRow[] } | null>(null);
  // Whether either editor holds what its leave check asks about (each says so; false when it closes), and the last row of the
  // chosen agent in this read: an agent that leaves the list while an editor holds something stays open on that row.
  const [toolsHeld, setToolsHeld] = useState(false);
  // The tools editor's save bar sits in the page's sticky footer, which shows only while the editor has a bar.
  const [toolsBar, setToolsBar] = useState(false);
  const [footerEl, setFooterEl] = useState<HTMLDivElement | null>(null);
  const [sourceHeld, setSourceHeld] = useState(false);
  // The agent's file has two editors here: the settings rows (FileSettings) and the file editor (Source). `fileHeld`: a
  // row holds a typed value, or its save is out or unconfirmed. `fileGen` remounts the editor after a row saved, `rowsGen` the rows after the editor
  // let go of what it held (it may have saved), so each shows the file the other wrote.
  const [fileHeld, setFileHeld] = useState(false);
  const [fileGen, setFileGen] = useState(0);
  const [rowsGen, setRowsGen] = useState(0);
  const sourceWasHeld = useRef(false);
  const onSourceHeld = (h: boolean) => {
    if (sourceWasHeld.current && !h) setRowsGen((g) => g + 1);
    sourceWasHeld.current = h;
    setSourceHeld(h);
  };
  const lastAgent = useRef<{ key: string; row: AgentRow } | null>(null);
  // While either editor holds something, a realm switch or sign-out names it (core's leave question): the editors belong to
  // one realm, so the switch closes them and what they hold is lost.
  const heldName = useRef('');
  const words = useRef(t);
  words.current = t;
  const held = toolsHeld || sourceHeld;
  useEffect(() => {
    if (!held) return undefined;
    return registerSwitchGuard(() => (heldName.current ? words.current('held.loss', { name: heldName.current }) : null));
  }, [held]);
  const controlled = p.selected !== undefined;
  // Once the host's choice moves off the deleted name, that name is an ordinary choice again (a link back to it later).
  if (deleted !== null && p.selected !== deleted) setDeleted(null);
  const selected = controlled ? (p.selected === deleted ? null : p.selected) : ownSel;
  const select = (name: string) => {
    setDeleted(null);
    if (p.onSelect) p.onSelect(name);
    else if (name !== ownSel) askLeave(() => setOwnSel(name));
  };
  // One question at most: the file editor is asked first. When it holds something, its dialog is the only one (it names the
  // unsaved ticks too, alsoLost) and Leave drops both; when it holds nothing it runs `go` at once, and only then are the tools
  // asked. Stay keeps both and calls `stay` (the route guard's reset: the held navigation is let go).
  const askLeave = (go: () => void, stay?: () => void) => {
    const tools = toolsLeave.current;
    let atOnce = true;
    const afterFile = () => (atOnce && tools ? tools(go, stay) : go());
    if (sourceLeave.current) sourceLeave.current(afterFile, stay);
    else afterFile();
    atOnce = false;
  };
  // The changed-chat note's Reset to shipped: the agent's file, where Reset is.
  const showFile = () => {
    fileRef.current?.scrollIntoView?.({ block: 'start' });
    fileRef.current?.focus();
  };

  if (read.rows !== undefined) lastRows.current = { key: readKey, rows: read.rows };
  else if (!read.failed || lastRows.current?.key !== readKey) lastRows.current = null;
  const rows = read.rows ?? (read.failed ? lastRows.current?.rows : undefined);
  // A failed read with no rows, or over an earlier empty answer, is an error: an old empty list never reads as "no agents"
  // (C9). A failed re-read over rows (an error, or an answer that is not a list) keeps them under a warning that says they
  // are the last list read, so the editors beside them stay mounted and unsaved ticks or a file draft are never dropped
  // by a refresh.
  const stale = read.failed && rows !== undefined && rows.length > 0;
  const failed = read.failed && !stale;
  const listView = useAgentListView({
    rows: failed ? undefined : rows,
    loading: !failed && rows === undefined,
  });
  const go = useGo();
  const listed = selected && rows ? rows.find((r) => r.name === selected) : undefined;
  if (listed) lastAgent.current = { key: readKey, row: listed };
  const last = lastAgent.current;
  // Gone from a list read after the editors took something in: they stay open on its last row until the person leaves
  // (their leave checks ask then). Holding nothing, the view says it is gone, as before.
  const kept = !listed && selected && held && last && last.key === readKey && last.row.name === selected ? last.row : undefined;
  const agent = listed ?? kept;
  heldName.current = agent?.name ?? '';
  // One editor per list read identity (account, realm, generation, computer), agent and delete: ticks, a draft, a held save
  // or an unknown delete never carry to another (an old draft is never offered for saving in another account or realm).
  const editorKey = `${readKey}\u0000${agent?.name ?? ''}\u0000${gen}`;
  const computerName = shell.computers.find((c) => c.id === computer?.container.id)?.name ?? '';
  // Closing the detail (its ×, Back on a phone, Escape). A host that owns the choice moves its route, and that change
  // alone is the leave: the route guard above asks once, so asking here as well would ask twice (a confirmed leave does
  // not clear what the editors hold until they unmount). Without a host the view clears its own choice behind its check.
  const close = () => (p.onSelect ? go(links.agents) : askLeave(() => setOwnSel(null)));
  return (
    <>
      <LeaveGuard active={held} onBlock={(proceed, reset) => askLeave(proceed, reset)} />
      <ListDetailPage
        mode="fill"
        storageKey="ai-agents"
        banner={
          stale || kept ? (
            <>
              {stale && (
                <Band tone="warn" size="table" error={read.error} actions={<TextButton onPress={read.retry} isDisabled={read.retrying}>{t('state.retry')}</TextButton>}>
                  {t('state.stale')}
                </Band>
              )}
              {kept && (
                <Band tone="warn" size="table" /* noDetails: nothing failed; a list read left the agent out */>
                  {t('state.goneKept')}
                </Band>
              )}
            </>
          ) : undefined
        }
        header={{ title: t('title'), subtitle: computerName ? t('subtitle', { computer: computerName }) : t('subtitleBare') }}
        selected={selected ?? undefined}
        onClose={close}
        list={
          // Nothing to show and the read failed: the page's own error (its words and details), never "no agents" (C9).
          failed ? (
            <ErrorState title={t('state.failed')} error={read.error} onRetry={read.retry} retrying={read.retrying} />
          ) : (
            <AgentList
              view={listView.view}
              columns={listView.columns}
              rows={rows ?? []}
              selected={listed ? listed.name : null}
              onSelect={select}
              onRetry={read.retry}
              onRefresh={read.retry}
            />
          )
        }
        detail={
          agent ? (
            <DetailPage
              header={{
                title: agent.name,
                meta: <Tag>{provenanceWord(t, agent)}</Tag>,
                subtitle: agent.description || t('ov.noDescription'),
                // Product-owned agents (bot, script-writer) are Hoody's to start: New chat never offers them.
                actions: agent.productOwned ? undefined : <LinkButton href={links.newChatWith(agent.name)} size="sm">{t('detail.newChat')}</LinkButton>,
              }}
              footer={toolsBar ? <div ref={setFooterEl} className={s.footer} /> : undefined}
            >
              <div className={s.detail}>
                {/* Keyed like the other editors: a model change's chooser, busy send or pending outcome never carries to another agent.
                    Siblings need keys of their own: two children on one key leave React's old overview mounted on a switch. */}
                <AgentOverview key={`ov\u0000${editorKey}`} agent={agent} onModelSaved={read.retry} />
                <AgentTools
                  key={`tools\u0000${editorKey}`}
                  name={agent.name}
                  computer={computerName}
                  onShowSource={showFile}
                  leaveRef={toolsLeave}
                  hostGuard
                  staleShown={stale}
                  onHeldChange={setToolsHeld}
                  footerEl={toolsBar ? footerEl : null}
                  onBarChange={setToolsBar}
                />
                {/* One writer of the agent's file at a time: the rows wait while the editor below holds a draft or an
                    unconfirmed save, and the editor waits while a row holds a typed value or a save out or unconfirmed. */}
                <AgentFileSettings
                  key={`file\u0000${editorKey}\u0000${rowsGen}`}
                  name={agent.name}
                  realm={realm}
                  productOwned={agent.productOwned}
                  blocked={sourceHeld}
                  onHeldChange={setFileHeld}
                  onSaved={() => { setFileGen((g) => g + 1); read.retry(); }}
                />
                <div ref={fileRef} tabIndex={-1} className={s.file}>
                  <AgentSource
                    key={`${editorKey}\u0000${fileGen}`}
                    peerBusy={fileHeld}
                    folded
                    name={agent.name}
                    realm={realm}
                    productOwned={agent.productOwned}
                    computer={computerName}
                    paused={p.paused === true}
                    leaveRef={sourceLeave}
                    hostGuard
                    alsoLost={toolsHeld ? t('leave.alsoTicks', { name: agent.name }) : undefined}
                    onHeldChange={onSourceHeld}
                    onDeleted={() => {
                      setGen((g) => g + 1);
                      if (p.onDeleted) p.onDeleted();
                      else if (controlled) setDeleted(agent.name);
                      else setOwnSel(null);
                      read.retry();
                    }}
                    onReset={read.retry}
                  />
                </div>
              </div>
            </DetailPage>
          ) : selected && rows !== undefined && !failed ? (
            <p className={s.note}>{t('state.gone', { name: selected })}</p>
          ) : selected && !failed ? (
            <Skeleton variant="detail" />
          ) : null
        }
      />
    </>
  );
}
