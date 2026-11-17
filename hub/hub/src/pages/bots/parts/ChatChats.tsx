// Chat apps, Chats: the chats the Bot is in on one app. Approve or mute a chat, choose where the Bot's updates go (the home chat),
// and forget a chat. Every send is a held change (C9). Approving a group says first that everyone in it can read the Bot's replies.
import { AnatomySection, Band, CellLines, ConfirmDialog, DataTable, Dialog, EmptyState, StatusPill, Tag, createColumnHelper, useStrings, type RowActionEntry } from '@kit';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Change, Channel, ChannelChange, ChannelVars, ChatRow } from '../data';
import strings from '../strings.en.json';
import { homeChatOptions, settingRows } from '../chatSettings';
import { dialogOutcome } from './Bits';
import { GroupHowTo, PrivacyBand, ReadLine, RequestedLine } from './ChatFlow';
import { DiscardAsk, SettingsForm, draftAfterSave, draftDirty, draftSendable, emptyDraft, refusalDetail, useRefusal, withRefusal, type SettingsDraft } from './ChatSettings';
import s from './pane.module.css';

const colC = createColumnHelper<ChatRow>();
type T = ReturnType<typeof useStrings<typeof strings>>;
const chatName = (c: ChatRow, t: T) => c.title || c.platformChat || t('chan.chat.noTitle');
const stateWord = (st: string, t: T) => (st === 'approved' ? t('chan.chat.approved') : st === 'muted' ? t('chan.chat.muted') : st === 'requested' ? t('chan.chat.requested') : st);
type ChangeT = Change<ChannelChange, ChannelVars>;
// The settings dialog keeps only the chat's id: what it shows is resolved from the current list, so a save that refreshes the chat is seen.
type Dlg = { kind: 'approve'; chat: ChatRow } | { kind: 'forget'; chat: ChatRow } | { kind: 'settings'; id: string } | null;

/** The app's home chat is marked under its name, in the pinned cell (a CellLines line), so no width of the table or the list
 *  drops the mark. Nothing for any other chat. */
function HomeMark({ home }: { home: boolean }) {
  const t = useStrings(strings);
  return home ? <Tag>{t('chan.chat.home')}</Tag> : null;
}

/** `draft` is the draft of the open chat's settings, kept by the drawer so its guard counts it. */
export function ChatsSection({ channel, change, draft, onDraft, onSetup, onSettings }: { channel: Channel; change: ChangeT; draft: SettingsDraft; onDraft: (d: SettingsDraft) => void; onSetup?: () => void; onSettings?: () => void }) {
  const t = useStrings(strings);
  const [dlg, setDlg] = useState<Dlg>(null);
  // Which change the shared hook last ran: a dialog shows its own outcome, never another action's.
  const [last, setLast] = useState('');
  const [asking, setAsking] = useState(false);
  const refusal = useRefusal();
  const busy = change.running || change.outcome === 'pending';
  const nameOf = (c: ChatRow) => chatName(c, t);
  const run = (vars: Omit<ChannelVars, 'channelId'>) => {
    setLast(`${vars.action}:${vars.target ?? ''}`);
    return change.run({ ...vars, channelId: channel.id });
  };
  const own = (action: string, target: string) => (last === `${action}:${target}` ? dialogOutcome(change) : undefined);
  const done = (r: { outcome: string }) => {
    if (r.outcome === 'done') setDlg(null);
  };
  // Closing the settings of a chat drops its draft with it; with changes typed in, it asks first.
  // Each settings dialog is one generation: a Save answered after its dialog closed, or its chat went away, writes no draft.
  const gen = useRef(0);
  useEffect(
    () => () => {
      gen.current += 1;
    },
    [],
  );
  const leaveSettings = () => {
    gen.current += 1;
    onDraft(emptyDraft);
    setDlg(null);
  };
  const closeSettings = (o: boolean) => {
    if (o) return;
    if (draftDirty(draft)) setAsking(true);
    else leaveSettings();
  };
  const settingsChat = dlg?.kind === 'settings' ? channel.chatRows.find((c) => c.id === dlg.id) : undefined;
  // A refresh that takes the open chat away ends its dialog; its draft goes with it, so no hidden draft keeps the drawer dirty.
  const settingsGone = dlg?.kind === 'settings' && settingsChat === undefined;
  useEffect(() => {
    if (!settingsGone) return;
    gen.current += 1;
    setAsking(false);
    onDraft(emptyDraft);
    setDlg(null);
  }, [settingsGone, onDraft]);
  // Approve and Forget are bound to their chat: once no send is running, a refresh that takes the chat away (or, for
  // Approve, shows it approved already) closes the dialog, so Confirm never sends for a chat that is gone or settled.
  const askChat = dlg?.kind === 'approve' || dlg?.kind === 'forget' ? channel.chatRows.find((c) => c.id === dlg.chat.id) : undefined;
  const askGone = (dlg?.kind === 'approve' || dlg?.kind === 'forget') && (askChat === undefined || (dlg.kind === 'approve' && askChat.state === 'approved'));
  useEffect(() => {
    if (askGone && !change.running) setDlg(null);
  }, [askGone, change.running]);
  const approve = (c: ChatRow) => {
    if (c.kind === 'group') {
      setLast('');
      setDlg({ kind: 'approve', chat: c });
    } else void run({ action: 'chatApprove', target: c.id });
  };

  // Groups that ask to be approved come first: they are what the person came for.
  const rows = useMemo(() => [...channel.chatRows].sort((a, b) => Number(b.state === 'requested') - Number(a.state === 'requested')), [channel.chatRows]);
  const columns = useMemo(
    () => [
      // The chat's name, then what its row says about it (a group asking to join, a group the Bot cannot read): notes wrap in the cell.
      colC.accessor((c) => chatName(c, t), {
        id: 'chat',
        enableSorting: false,
        header: t('chats.col.chat'),
        meta: { pinned: true, list: 'primary', label: t('chats.col.chat') },
        // The name, then each mark or note that applies on its own line (kit CellLines: no line break written in the cell).
        cell: (x) => (
          <CellLines>
            {chatName(x.row.original, t)}
            <HomeMark home={channel.homeChat === x.row.original.id} />
            <RequestedLine channel={channel} kind={x.row.original.kind} state={x.row.original.state} />
            <ReadLine channel={channel} kind={x.row.original.kind} canRead={x.row.original.canRead} />
          </CellLines>
        ),
      }),
      colC.accessor('kind', { id: 'kind', enableSorting: false, header: t('chats.col.kind'), meta: { size: 'fit', priority: 1, fitPad: 4, listLabel: true, fitText: (c: ChatRow) => t(c.kind === 'group' ? 'chan.chat.group' : 'chan.chat.dm') }, cell: (x) => t(x.getValue() === 'group' ? 'chan.chat.group' : 'chan.chat.dm') }),
      colC.accessor('state', {
        id: 'state',
        enableSorting: false,
        header: t('chats.col.state'),
        meta: { size: 'fit', priority: 1, fitPad: 28, list: 'status', fitText: (c: ChatRow) => stateWord(c.state, t) },
        cell: (x) => (
          <StatusPill tone={x.getValue() === 'approved' ? 'ok' : x.getValue() === 'requested' ? 'warn' : 'neutral'} dot>
            {stateWord(x.getValue(), t)}
          </StatusPill>
        ),
      }),
    ],
    [t, channel],
  );
  const entries = (c: ChatRow): RowActionEntry[] => {
    const settings: RowActionEntry = { id: 'settings', label: t('set.chat.open'), opens: true, isDisabled: busy, onAction: () => { setLast(''); gen.current += 1; onDraft(emptyDraft); setDlg({ kind: 'settings', id: c.id }); } };
    const toggle: RowActionEntry =
      c.state === 'approved'
        ? { id: 'mute', label: t('chan.chat.mute'), isDisabled: busy, onAction: () => void run({ action: 'chatMute', target: c.id }) }
        : { id: 'approve', label: t('chan.chat.approve'), opens: c.kind === 'group', isDisabled: busy, onAction: () => approve(c) };
    const home: RowActionEntry =
      channel.homeChat === c.id
        ? { id: 'home', label: t('chan.chat.clearHome'), isDisabled: busy, onAction: () => void run({ action: 'homeClear' }) }
        : { id: 'home', label: t('chan.chat.makeHome'), isDisabled: busy || homeChatOptions([c]).length === 0, ...(homeChatOptions([c]).length === 0 ? { disabledReason: t('chan.chat.homeNeedsApproval') } : {}), onAction: () => void run({ action: 'homeSet', target: c.id }) };
    const forget: RowActionEntry = { id: 'forget', label: t('chan.chat.forget'), icon: 'trash', tone: 'danger', opens: true, isDisabled: busy, onAction: () => { setLast(''); setDlg({ kind: 'forget', chat: c }); } };
    // Approve is the fix while a chat asks to join; otherwise its settings are the one thing to do inline.
    return c.state === 'requested' ? [{ ...toggle, inline: true }, settings, home, '-', forget] : [{ ...settings, inline: true }, toggle, home, '-', forget];
  };

  return (
    <div className={s.tabBody}>
      <PrivacyBand channel={channel} steps={false} onSteps={onSetup} />
      <GroupHowTo channel={channel} onSettings={onSettings} />
      <AnatomySection id="bot-chats" title={t('chan.rail.chats')} description={t('chan.chatsHelp')} state={{ kind: 'ready' }} flush={rows.length > 0}>
        <DataTable bare fill={false} label={t('chan.chats.list', { name: channel.label })} data={rows} columns={columns} getRowId={(c) => c.id} noViewMenu sortParam={false} onRowAction={false} actions={entries} empty={<EmptyState size="sm" icon="mail" title={t('chan.chats.empty')} />} />
      </AnatomySection>

      {settingsChat && (
        <Dialog
          overlayId="bots-chats-settings"
          isOpen
          onOpenChange={closeSettings}
          title={t('set.chat.title', { name: nameOf(settingsChat) })}
          body={t('set.chat.help')}
          size="lg"
          primaryLabel={t('set.save')}
          primaryDisabled={!draftSendable(draft)}
          busy={change.running}
          outcome={withRefusal(own('chatSettings', settingsChat.id), refusal(change.details))}
          outcomeDetail={refusalDetail(own('chatSettings', settingsChat.id), refusal(change.details))}
          onCheck={() => change.readBack()}
          onPrimary={() => {
            const g = gen.current;
            void run({ action: 'chatSettings', target: settingsChat.id, settings: draft.edits }).then((r) => {
              if (r.outcome !== 'done' || gen.current !== g) return;
              if (draft.bad.length > 0) onDraft(draftAfterSave(draft));
              else leaveSettings();
            });
          }}
        >
          {draft.bad.length > 0 && <Band tone="warn" size="table" /* noDetails: typed values the form holds back; no request was refused */>{t('set.skipsBad')}</Band>}
          <SettingsForm scope="chat" kind={channel.kind} view={settingsChat.view} rows={settingRows('chat', channel.kind)} notes={settingsChat.notes} draft={draft} onDraft={onDraft} disabled={busy} />
        </Dialog>
      )}
      <DiscardAsk
        isOpen={asking}
        onOpenChange={setAsking}
        onDiscard={() => {
          setAsking(false);
          leaveSettings();
        }}
      />
      {dlg?.kind === 'approve' && (
        <ConfirmDialog
          overlayId="bots-chats-approve"
          isOpen
          onOpenChange={(o) => !o && setDlg(null)}
          title={t('chan.chat.approveTitle', { name: nameOf(dlg.chat) })}
          body={t('chan.chat.approveBody')}
          confirmLabel={t('chan.chat.approveGo')}
          busy={change.running}
          outcome={own('chatApprove', dlg.chat.id)}
          onCheck={() => change.readBack()}
          onConfirm={() => void run({ action: 'chatApprove', target: dlg.chat.id, acknowledgeGroup: true }).then(done)}
        />
      )}
      {dlg?.kind === 'forget' && (
        <ConfirmDialog
          overlayId="bots-chats-forget"
          isOpen
          onOpenChange={(o) => !o && setDlg(null)}
          title={t('chan.chat.forgetTitle', { name: nameOf(dlg.chat) })}
          body={t('chan.chat.forgetBody')}
          confirmLabel={t('chan.chat.forgetGo')}
          tone="danger"
          busy={change.running}
          outcome={own('chatForget', dlg.chat.id)}
          onCheck={() => change.readBack()}
          onConfirm={() => void run({ action: 'chatForget', target: dlg.chat.id }).then(done)}
        />
      )}
    </div>
  );
}
