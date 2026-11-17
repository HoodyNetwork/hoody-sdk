// Chat apps (the Backups/Storage pattern): an At a glance block (apps, what waits on the person,
// people, chats), then an Apps table with one row per Telegram, Slack or Discord connection: a row's fix inline when it has
// one, else Manage, and Remove in its menu. The Bot's own controls sit in the head (Add a chat app; Pause all; Settings for
// all chat apps in its menu). The 880 drawer adds or manages one app. Tokens live only in password inputs, are cleared before the send and never
// prefilled; owner and pairing codes come from the code holder (codes.ts) and are shown once through SecretField.
import {
  AnatomySection,
  Band,
  Button,
  CHAT_SLOTS,
  ChatNames,
  markChatApps,
  Checkbox,
  CodeBlock,
  ConfirmDialog,
  DataTable,
  Disclosure,
  EmptyState,
  Facts,
  Icon,
  OutcomeBanner,
  RadioGroup,
  ReasonButton,
  SecretInput,
  StepList,
  SettingGroup,
  SettingRow,
  StatusLine,
  StatusPill,
  SettingSwitch,
  TextField,
  Track,
  TrackStep,
  createColumnHelper,
  fitWidth,
  formatNumber,
  useSearchParam,
  useStrings,
  type ActionSpec,
  type Fact,
  type MenuList,
  type RowActionEntry,
  type StepListItem,
  type Tone,
} from '@kit';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { badgeCount, nextStep, setupSteps, waitingOf, type Waiting } from '../chatFlow';
import { adoptDemo, beginIssue, clearCode, settlePress, useCodeMayHaveChanged, useHeldCode } from '../codes';
import { NAME_MAX, effectiveOf, tooLong } from '../chatSettings';
import { freshOwnerIds, ownerCodeOff, ownerless, useChannelSetup } from '../data';
import type { BotView, Change, Channel, ChannelChange, ChannelKind, ChannelSettings, ChannelVars } from '../data';
import strings from '../strings.en.json';
import { dialogOutcome } from './Bits';
import { ChatsSection } from './ChatChats';
import { OwnerPaired, OwnerSteps } from './ChatFlow';
import { SetupTrack } from './ChatSetup';
import { AllAppsSettings, ChangeFailed, ChannelSettingsSection, PressRefused, draftDirty, emptyDraft, useSettingsSave, type RefusedPress } from './ChatSettings';
import { IssuedCodeField, PeopleSection, type CodeLine } from './ChatPeople';
import { RailDrawer } from './RailDrawer';
import { withBotFather } from './botFather';
import s from './pane.module.css';

const KINDS: readonly ChannelKind[] = ['telegram', 'slack', 'discord'];
const TONE: Record<Channel['state'], Tone> = {
  running: 'ok',
  starting: 'info',
  paused: 'neutral',
  auth_failed: 'danger',
  needs_owner: 'warn',
  degraded: 'warn',
  standby: 'neutral',
  conflict: 'danger',
  realm_unserved: 'neutral',
  stopping: 'neutral',
  stopped: 'neutral',
};

type Section = 'setup' | 'people' | 'chats' | 'settings';
type PauseT = Change<unknown, { paused: boolean }>;
type ChangeT = Change<ChannelChange, ChannelVars>;
type T = ReturnType<typeof useStrings<typeof strings>>;

const appCol = createColumnHelper<Channel>();

interface Props {
  bot: BotView;
  channels: readonly Channel[] | undefined;
  settings: ChannelSettings | undefined;
  loading: boolean;
  change: ChangeT;
  pause: PauseT;
}

/** One Bot's chat apps. Keyed by the Bot, so a drawer, a draft or a code of one Bot never carries over to the next one opened. */
export function ChatAppsTab(props: Props) {
  return <ChatAppsBody key={props.bot.key} {...props} />;
}

/** The four facts of the Bot's chat apps: how many, what waits on the person, and the people and chats they know. */
function AppsGlance({ rows, paused, t }: { rows: readonly Channel[]; paused: boolean; t: T }) {
  const waiting = badgeCount(rows, paused);
  const items: Fact[] = [
    { label: t('apps.glance.apps'), value: paused ? t('apps.glance.appsPaused', { count: rows.length }) : formatNumber(rows.length) },
    { label: t('apps.glance.waiting'), value: waiting === 0 ? t('apps.glance.waitingNone') : formatNumber(waiting) },
    { label: t('apps.glance.people'), value: formatNumber(rows.reduce((n, c) => n + c.people, 0)) },
    { label: t('apps.glance.chats'), value: formatNumber(rows.reduce((n, c) => n + c.chats, 0)) },
  ];
  return (
    <AnatomySection id="bot-apps-glance" title={t('apps.glance.title')} state={{ kind: 'ready' }}>
      <Facts items={items} columns={2} label={t('apps.glance.title')} />
    </AnatomySection>
  );
}

/** What one wait says in the Needs column and on its fix action. */
const needWord = (w: Waiting, t: T) => (w.kind === 'requested' ? t('apps.need.requested', { count: w.count }) : t(`apps.need.${w.kind}`));
const waitText = (w: Waiting, t: T) => (w.kind === 'requested' ? t('flow.wait.requested', { count: w.count }) : t(`flow.wait.${w.kind}`));

function ChatAppsBody({ bot, channels, settings, loading, change, pause }: Props) {
  const t = useStrings(strings);
  const [app, setApp] = useSearchParam('app');
  const rows = channels ?? [];
  // The app just made by the add flow: its drawer opens on it at once, from the create's own answer, until the list has it.
  const [made, setMade] = useState<Channel | null>(null);
  // Only until the list has it: then the list is the truth, and an app it later drops is gone (never the old answer).
  if (made !== null && rows.some((c) => c.id === made.id)) setMade(null);
  const current = app && app !== 'new' ? (rows.find((c) => c.id === app) ?? (made?.id === app ? made : undefined)) : undefined;
  const drawerOpen = app === 'new' || current !== undefined;
  // The section a row's fix opens the drawer on (Review opens Chats); Manage opens Setup.
  const [start, setStart] = useState<Section>('setup');
  // The Setup step the drawer opens on, for that app only: Owner, right after the add flow connected it.
  const [startAt, setStartAt] = useState<{ id: string; step: 'owner' } | null>(null);
  const openApp = (id: string, at: Section) => {
    setStart(at);
    setStartAt(null);
    setApp(id);
  };
  const openMade = (c: Channel) => {
    setMade(c);
    setStart('setup');
    setStartAt({ id: c.id, step: 'owner' });
    setApp(c.id);
  };
  const [allOpen, setAllOpen] = useState(false);
  const [removing, setRemoving] = useState<Channel | null>(null);
  const paused = settings?.paused === true;

  // No sorting: a Bot holds a few apps (max_channels), and the drawer's People and Chats stay the only buttons of those names.
  const columns = useMemo(() => {
    // A short word for the first wait (the row's inline fix) and how many more: list fields never wrap and table cells cut long
    // text, so the sentence is the row menu's: each wait is there as its fix, the sentence as its description.
    const needs = (c: Channel): string => {
      const waits = waitingOf(c, paused);
      if (waits.length === 0) return t('apps.needsNone');
      const first = needWord(waits[0] as Waiting, t);
      return waits.length === 1 ? first : t('apps.needsMore', { first, count: waits.length - 1 });
    };
    return [
      appCol.accessor('label', { id: 'app', enableSorting: false, header: t('apps.col.app'), meta: { pinned: true, size: 'fit' } }),
      // The app's own logo right before its name.
      appCol.accessor('kind', {
        id: 'kind',
        enableSorting: false,
        header: t('apps.col.kind'),
        meta: { size: 'fit', fitPad: 22, fitText: (c: Channel) => t(`chan.kind.${c.kind}`) },
        // Icon is a text-slot part (ChatNames is not): the mark, then the name, as ChatNames draws them.
        cell: (x) => (
          <>
            <Icon name={x.getValue()} size="sm" />
            {` ${t(`chan.kind.${x.getValue()}`)}`}
          </>
        ),
      }),
      appCol.accessor('state', {
        id: 'state',
        enableSorting: false,
        header: t('apps.col.state'),
        meta: { size: 'fit', priority: 2, fitPad: 28, fitText: (c: Channel) => t(`chan.state.${c.state}`) },
        cell: (x) => (
          <StatusPill tone={TONE[x.getValue()]} dot>
            {t(`chan.state.${x.getValue()}`)}
          </StatusPill>
        ),
      }),
      appCol.accessor('people', { id: 'people', enableSorting: false, header: t('apps.col.people'), meta: { size: 'fit', priority: 4, align: 'end', listLabel: true, fitText: (c: Channel) => formatNumber(c.people) }, cell: (x) => formatNumber(x.getValue()) }),
      appCol.accessor('chats', { id: 'chats', enableSorting: false, header: t('apps.col.chats'), meta: { size: 'fit', priority: 4, align: 'end', listLabel: true, fitText: (c: Channel) => formatNumber(c.chats) }, cell: (x) => formatNumber(x.getValue()) }),
      appCol.display({
        id: 'needs',
        enableSorting: false,
        header: t('apps.col.needs'),
        // What waits on the person is shed last (priority 1 beside the name: the state goes before it, the counts, which the glance
        // holds too, and the kind first). Sized to its words (fitText), and its floor is the longest of them (minWidth): the table
        // drops columns by floors and falls back to the list when the name and this column do not fit, so these words are never
        // cut and never dropped, at any width.
        meta: { size: 'fit', priority: 1, fitPad: 28, fitText: needs, minWidth: fitWidth((channels ?? []).map(needs), { extra: 28 }) },
        cell: (x) => needs(x.row.original),
      }),
    ];
  }, [t, paused, channels]);

  // A row's fix runs inline when it has one (the most urgent first); Manage then sits first in its menu. The inline buttons set the
  // actions column's width, so the longest fix (Get the owner code) shows its short words there; the label stays its name.
  const entries = (c: Channel): RowActionEntry[] => {
    const waits = waitingOf(c, paused);
    const manage: RowActionEntry = { id: 'manage', label: t('chan.manage'), icon: 'settings', opens: true, onAction: () => openApp(c.id, 'setup') };
    const fixes: RowActionEntry[] = waits.map((w, i) => ({ id: `fix-${w.kind}`, label: t(`flow.wait.go.${w.kind}`), ...(w.kind === 'owner' ? { short: t('apps.fix.ownerShort') } : {}), description: waitText(w, t), opens: true, ...(i === 0 ? { inline: true } : {}), onAction: () => openApp(c.id, w.section) }));
    return [...(fixes.length === 0 ? [{ ...manage, inline: true }] : [...fixes.slice(0, 1), manage, ...fixes.slice(1)]), '-', { id: 'remove', label: t('chan.remove'), icon: 'trash', tone: 'danger', opens: true, onAction: () => {
          // A new question starts clean: an earlier change's failure is not this removal's (a pending one stays held).
          change.reset();
          setRemoving(c);
        } }];
  };

  // The Bot's own controls sit in the head. A paused Bot with no apps listed still offers Resume all: the pause is the Bot's own setting, not the list's.
  const botControls = settings?.ok === true && (rows.length > 0 || settings.paused);
  const pauseAction: ActionSpec = {
    id: 'apps-pause',
    label: t(paused ? 'chan.resumeAll' : 'chan.pauseAll'),
    icon: paused ? 'play' : 'pause',
    busy: pause.running,
    ...(pause.outcome === 'pending' ? { disabledReason: t('chan.pause.maybeBody') } : {}),
    onPress: () => void pause.run({ paused: !paused }),
  };
  const busy = change.running || change.outcome === 'pending';
  const menu: MenuList = [{ id: 'apps-settings', label: t('set.bot.open'), icon: 'settings', opens: true, isDisabled: busy, onAction: () => setAllOpen(true) }];
  const add: ActionSpec = { id: 'apps-add', label: t('chan.add'), icon: 'plus', opens: 'dialog', onPress: () => setApp('new') };
  // Only the notices in force: an empty fragment would still open the section's notice band.
  const notices: ReactNode[] = [];
  if (paused) notices.push(<Band key="paused" size="table" /* noDetails: the Bot's own setting, not a rejection */>{t('chan.pausedAll')}</Band>);
  if (pause.outcome === 'pending') notices.push(<OutcomeBanner key="pause-maybe" kind="pending" title={t(paused ? 'chan.resume.maybe' : 'chan.pause.maybe')} body={t('chan.pause.maybeBody')} onCheck={() => pause.readBack()} onDismiss={() => pause.dismiss()} />);
  if (pause.outcome === 'failed') notices.push(<OutcomeBanner key="pause-failed" kind="failed" title={t('chan.failed')} />);
  // A change sent from a dialog (the Bot-wide settings, a row's Remove) is held here when no drawer is open: its Check again and warned Dismiss.
  if (!drawerOpen && removing === null && change.outcome === 'pending') notices.push(<OutcomeBanner key="change-maybe" kind="pending" title={t('chan.maybe')} body={t('chan.maybeBody')} onCheck={() => change.readBack()} onDismiss={() => change.dismiss()} />);

  return (
    <div className={s.tabBody}>
      {!loading && rows.length > 0 && <AppsGlance rows={rows} paused={paused} t={t} />}
      <AnatomySection
        id="bot-apps"
        title={t('chan.title')}
        description={t('apps.desc')}
        actions={{ ...(rows.length > 0 ? { primary: add } : {}), ...(botControls ? { secondary: [pauseAction] as const, menu } : {}) }}
        notices={notices.length ? <>{notices}</> : undefined}
        state={loading ? { kind: 'loading', variant: 'table' } : { kind: 'ready' }}
        flush={rows.length > 0}
      >
        {rows.length === 0 ? (
          <EmptyState
            size="sm"
            icon="bell"
            title={t('chan.empty')}
            body={
              <>
                {t('chan.emptyBody')}
                <span className={s.platforms}>
                  {KINDS.map((k) => (
                    <span key={k} className={s.platform}>
                      <Icon name={k} />
                      {t(`chan.kind.${k}`)}
                    </span>
                  ))}
                </span>
              </>
            }
            action={
              <Button variant="primary" icon="plus" onPress={() => setApp('new')}>
                {t('chan.add')}
              </Button>
            }
          />
        ) : (
          <DataTable bare fill={false} label={t('apps.table', { name: bot.name })} data={rows} columns={columns} getRowId={(c) => c.id} noViewMenu sortParam={false} onRowAction={false} actions={entries} />
        )}
      </AnatomySection>
      {allOpen && settings && <AllAppsSettings settings={settings} change={change} open onOpenChange={setAllOpen} />}
      <ConfirmDialog
        overlayId="bots-chat-apps-remove-row"
        isOpen={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t('chan.removeTitle', { name: removing?.label ?? '' })}
        body={t('chan.removeBody')}
        confirmLabel={t('chan.remove')}
        tone="danger"
        busy={change.running}
        outcome={dialogOutcome(change)}
        onCheck={() => change.readBack()}
        onConfirm={() => removing && void change.run({ channelId: removing.id, action: 'remove' }).then((r) => r.outcome === 'done' && setRemoving(null))}
      />
      {drawerOpen && <ChannelDrawer key={app} bot={bot} channel={current} channelCount={rows.length} start={start} startStep={startAt !== null && startAt.id === app ? startAt.step : undefined} onCreated={openMade} onClose={() => setApp(undefined)} change={change} botPaused={settings?.ok !== true || paused || pause.running || pause.outcome === 'pending'} />}
    </div>
  );
}

/** One code press: its number in the drawer, and how many owner changes the app had seen when it was made. */
interface PressStamp {
  id: number;
  at: number;
}

/** A chat app's name as a label, its own logo right before it. */
function KindName({ kind }: { kind: ChannelKind }) {
  const t = useStrings(strings);
  return (
    <span className={s.withMark}>
      <Icon name={kind} size="sm" />
      {t(`chan.kind.${kind}`)}
    </span>
  );
}

function ChannelDrawer({ bot, channel, channelCount, start, startStep, onCreated, onClose, change, botPaused }: { bot: BotView; channel: Channel | undefined; channelCount: number; start: Section; /** The Setup step to open first (Owner, after the add flow). */ startStep?: 'owner' | undefined; /** The add flow connected an app: the page opens it. */ onCreated: (c: Channel) => void; onClose: () => void; change: ChangeT; /** The Bot's own pause of every app is on, changing, or not read: a restart would not start the app. */ botPaused: boolean }) {
  const t = useStrings(strings);
  const adding = channel === undefined;
  const [section, setSection] = useState<Section>(channel === undefined ? 'setup' : start);
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<ChannelKind>('telegram');
  const [label, setLabel] = useState('');
  const [token, setToken] = useState('');
  const [appToken, setAppToken] = useState('');
  // The one code of this chat app (the holder keeps one per app): Setup shows it when it is the owner code, People when it is an invite.
  // It is cleared when the drawer closes, by Done, by a cancel and by its own expiry.
  const holder = useHeldCode(bot.uid, channel?.id);
  const code = holder?.kind === 'owner' ? holder : null;
  // An issue or a cancel was pressed and nothing has answered: the agent may have replaced or removed the code, so none is shown.
  const mayHaveChanged = useCodeMayHaveChanged(bot.uid, channel?.id);
  const channelId = channel?.id;
  useEffect(
    () => () => {
      if (channelId !== undefined) clearCode(bot.uid, channelId);
    },
    [bot.uid, channelId],
  );
  // A press that was dismissed (the person stopped watching it) is no longer waiting for an answer.
  const prevOutcome = useRef(change.outcome);
  useEffect(() => {
    if (prevOutcome.current === 'pending' && change.outcome !== 'pending' && channelId !== undefined) settlePress(bot.uid, channelId);
    prevOutcome.current = change.outcome;
  }, [change.outcome, bot.uid, channelId]);
  // An owner code is redeemed only under some direct-message policies: under the others Setup says so instead of issuing one.
  const codeOff = channel !== undefined && ownerCodeOff(effectiveOf(channel.view, 'dm_policy'));
  // The lines of a code press (refused, cancelled) are about the code of that time. Each press takes its own stamp: its number
  // and how many times the app had got or lost its owner. The owner list can change around a press's own answer (in the same
  // update or just after it), so the first change after a press keeps its line; a later one drops it, so a line never comes
  // back when the owner it was pressed under returns. An answer that arrives later than that, or after a newer press, shows nothing.
  const ownerChanges = useRef(0);
  const lastPress = useRef(0);
  const [cancelled, setCancelledAt] = useState<number | null>(null);
  const [refusedLine, setRefusedLine] = useState<{ line: RefusedPress; at: number } | null>(null);
  const beginPress = (): PressStamp => {
    lastPress.current += 1;
    setRefusedLine(null);
    return { id: lastPress.current, at: ownerChanges.current };
  };
  const counts = (p: PressStamp) => p.id === lastPress.current && p.at >= ownerChanges.current - 1;
  const refuseFor = (p: PressStamp) => (line: RefusedPress) => {
    if (counts(p)) setRefusedLine({ line, at: p.at });
  };
  const codeLine: CodeLine = { refused: refusedLine?.line ?? null, press: () => refuseFor(beginPress()), hide: () => setRefusedLine(null) };
  const waitsForOwner = channel !== undefined && ownerless(channel);
  const waitedForOwner = useRef(waitsForOwner);
  // The owner code is used while this drawer is open: Setup names the new owner, once.
  const [pairedNow, setPairedNow] = useState(false);
  useEffect(() => {
    if (waitedForOwner.current === waitsForOwner) return;
    setPairedNow(!waitsForOwner);
    waitedForOwner.current = waitsForOwner;
    ownerChanges.current += 1;
    const keepFrom = ownerChanges.current - 1;
    setRefusedLine((r) => (r !== null && r.at < keepFrom ? null : r));
    setCancelledAt((at) => (at !== null && at < keepFrom ? null : at));
  }, [waitsForOwner]);
  // A used owner code. The agent refuses an owner code while the app has an owner, and an app's first owner
  // comes only from an owner code (the agent's pairing rules; its refusal code is owner_needs_pairing).
  // So an owner who was not there when the held code was issued, listed by a read sent after it was issued, proves that code was
  // redeemed: it works once, and it is dropped. A list on screen proves nothing alone: a read sent before the issue can land after
  // it and show an owner removed before the agent took the issue (the code still valid). So an owner this drawer had not seen at
  // the press starts one read sent now (freshOwnerIds), and only an owner absent at the press in that answer drops the code, and
  // only while the same issue is held. An owner seen before the issue proves nothing, and neither does a read that failed or did
  // not answer: the code stays. The agent reports no code state of its own.
  const ownerIds = (channel?.principals ?? []).filter((p) => p.owner && p.id !== '').map((p) => p.id);
  const ownerIdsKey = [...ownerIds].sort().join(',');
  const ownersSeen = useRef(new Set<string>());
  const ownersAtIssue = useRef<ReadonlySet<string> | null>(null);
  const [codeUsed, setCodeUsed] = useState(false);
  // The press snapshot a confirming read is out for (one at a time), and whether the drawer is still open.
  const confirming = useRef<ReadonlySet<string> | null>(null);
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => { open.current = false; };
  }, []);
  useEffect(() => {
    const ids = ownerIdsKey === '' ? [] : ownerIdsKey.split(',');
    const at = ownersAtIssue.current;
    if (at !== null && code !== null && channelId !== undefined && confirming.current !== at && ids.some((id) => !at.has(id))) {
      confirming.current = at;
      void freshOwnerIds(bot.key, channelId).then((now) => {
        if (confirming.current === at) confirming.current = null;
        if (!open.current || ownersAtIssue.current !== at || now === undefined || !now.some((id) => !at.has(id))) return;
        ownersAtIssue.current = null;
        clearCode(bot.uid, channelId);
        setCodeUsed(true);
      });
    }
    for (const id of ids) ownersSeen.current.add(id);
  }, [ownerIdsKey, code, channelId, bot.uid, bot.key]);
  // Closing asks only for a code the person can see now: an owner code shows only while the app waits for its owner, so once it
  // has one closing asks nothing. A read that says "owned" alone does not clear the code: it may be older than the issue, and if
  // the app turns ownerless again the same code shows again, unless a new owner proved it used (above).
  const asksToClose = holder !== null && (holder.kind !== 'owner' || waitsForOwner);
  const [removing, setRemoving] = useState(false);
  const [webhookAsk, setWebhookAsk] = useState(false);
  // What the last Restart and check of an app answered, for its privacy step's status line (the app's id: never another app's).
  const [restarted, setRestarted] = useState<{ id: string; kind: 'done' | 'paused' | 'resumeUnknown' | 'pauseUnknown' } | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  // Save and Discard of the settings draft are the drawer's foot while the Settings section shows.
  const settingsFoot = useSettingsSave({ channel, change, draft, onDraft: setDraft, active: section === 'settings' });
  // The draft of a chat's own settings lives here too, so the drawer's guard (Back, Esc, the scrim) counts it.
  const [chatDraft, setChatDraft] = useState(emptyDraft);
  const [removeHook, setRemoveHook] = useState(false);
  // The add flow's Options fold (name and, for Telegram, the webhook choice): closed until the person opens it.
  const [optionsOpen, setOptionsOpen] = useState(false);
  // The name field starts from the saved name and is sent only when it differs.
  const [name, setName] = useState(channel?.label ?? '');
  // A create whose answer is unknown: the form stays as it is (a different label or token would be a second create)
  // until the new channel shows in the list, or the drawer is closed.
  const [createdFrom, setCreatedFrom] = useState<number | null>(null);
  useEffect(() => {
    if (createdFrom !== null && channelCount > createdFrom) setCreatedFrom(null);
  }, [channelCount, createdFrom]);
  const locked = createdFrom !== null;

  // Tokens and codes live in this component's state, which ends with the drawer.

  const effectiveKind = channel?.kind ?? kind;
  const needsApp = effectiveKind === 'slack';
  const credsOk = token !== '' && (!needsApp || appToken !== '') && !tooLong(label);
  const setupQ = useChannelSetup(bot.key, effectiveKind, adding && step === 1);

  const send = async (action: string, id: string) => {
    // The token leaves the fields as the request starts; the request carries its own copy.
    const sent = { token, appToken: appToken === '' ? undefined : appToken, label: label === '' ? undefined : label, deleteWebhook: kind === 'telegram' && removeHook };
    setToken('');
    setAppToken('');
    const r = await change.run({ channelId: id, action, ...sent });
    if (action.startsWith('create:') && r.outcome === 'pending') setCreatedFrom(channelCount);
    // An answer for a drawer the person already closed (or left for another app) moves nothing.
    if (!open.current) return r.outcome === 'done';
    // A connect lands on the new app's Setup with Owner open; an answer that names no usable app (a partial answer, which
    // channelChangeCall drops; the add route's own "new"; another kind than the one asked for) closes the drawer as before.
    const made = action.startsWith('create:') && r.outcome === 'done' ? r.data?.channel : undefined;
    if (made !== undefined && made.id !== '' && made.id !== 'new' && made.kind === kind) onCreated(made);
    else if (r.outcome === 'done') onClose();
    return r.outcome === 'done';
  };

  // The token fields, in the open token step when the app refused it, else in the token row's reveal editor (one copy each).
  // The step a person (or People's / Chats' button) opened holds only while the track's own next step is the one it was
  // opened under: when that changes (the owner code used, a token refused, a webhook set) the track opens its new next step,
  // and the hand-opened step is dropped for good, so a next step that later returns to the old one never revives it.
  const setupNext = channel ? nextStep(setupSteps(channel)) : null;
  const [opened, setOpened] = useState<{ id: string | null; under: string | null } | undefined>(() => (startStep ? { id: startStep, under: setupNext } : undefined));
  if (opened && opened.under !== setupNext) setOpened(undefined);
  const openStep = opened && opened.under === setupNext ? opened.id : undefined;
  const setOpenStep = (id: string | null) => setOpened({ id, under: setupNext });
  // People's owner button and Chats' privacy band open Setup on their own step (the Track's open one), not wherever it was.
  const openSetupOn = (step: 'owner' | 'privacy') => {
    setOpenStep(step);
    setSection('setup');
  };
  // Replacing the token of an app that takes two (the Bot token and the app token): with only one pasted the replace stays
  // off, so the empty field says it is needed too (the add flow says the same at its Connect).
  const pairNeed = !adding && needsApp ? (token !== '' && appToken === '' ? 'app' : appToken !== '' && token === '' ? 'bot' : null) : null;
  const tokenFields = (
    <>
      <SecretInput label={t('chan.token')} promises={[t('chan.secretPromise.here'), t('chan.secretPromise.kept')]} value={token} onChange={setToken} errorMessage={pairNeed === 'bot' ? t('chan.replace.needToken') : undefined} />
      {needsApp && <SecretInput label={t('chan.appToken')} promises={[t('chan.secretPromise.here'), t('chan.secretPromise.kept')]} value={appToken} onChange={setAppToken} errorMessage={pairNeed === 'app' ? t('chan.replace.needAppToken') : undefined} />}
    </>
  );
  // A replacement is pressable only with the fields filled and no change running or of unknown outcome: the change's hold
  // would refuse the send, and the press would still empty a token typed meanwhile.
  const replaceOff = !credsOk || change.running || change.outcome === 'pending';
  const replaceButton = (
    <Button variant="primary" busy={change.running} isDisabled={replaceOff} onPress={() => void send('credentials', channel?.id ?? '')}>
      {t('chan.replaceGo')}
    </Button>
  );

  // The add flow's how: the agent's own steps in the app, the manifest (Slack) under the step that names it (the
  // first step when none does), then the paste here; the fields follow the list, under its Back here row.
  const agentSteps = setupQ.setup?.steps ?? [];
  const manifest = setupQ.setup?.manifest ?? '';
  const manifestAt = manifest === '' ? -1 : Math.max(0, agentSteps.findIndex((x) => /manifest/i.test(x)));
  const inApp: StepListItem[] = agentSteps.map((x, i) => ({ id: `agent-${i}`, text: withBotFather(markChatApps(x), (p) => <ChatNames text={p} />) }));
  if (manifestAt >= 0 && inApp.length === 0) inApp.push({ id: 'manifest', text: t('chan.setup.manifest') });
  const manifestRow = inApp[manifestAt];
  if (manifestRow)
    inApp[manifestAt] = {
      ...manifestRow,
      note: (
        <>
          <span>
            <ChatNames text={t('chan.setup.manifestHelp', CHAT_SLOTS)} />
          </span>
          <CodeBlock label={t('chan.setup.manifest')} code={manifest} lang="json" />
        </>
      ),
    };

  const connectReason = token === '' ? t('chan.addFlow.needToken') : needsApp && appToken === '' ? t('chan.addFlow.needAppToken') : tooLong(label) ? t('chan.addFlow.nameLong') : null;
  // Each screen's press sits in its open step's foot; the drawer mirrors it in its sticky footer while the body is
  // narrow (Drawer primaryOnPhone). A Connect held off by the fields says why in the footer's reason line, at every
  // width (a pending create says so in its banner).
  // Next removes the step it sits in: focus moves to the connect step's heading, as the track's own step opener does.
  const addTrack = useRef<HTMLElement>(null);
  const focusConnect = useRef(false);
  useEffect(() => {
    if (step !== 1 || !focusConnect.current) return;
    focusConnect.current = false;
    addTrack.current?.querySelector<HTMLElement>('[data-step="connect"] [role="region"] [tabindex="-1"]')?.focus();
  }, [step]);
  const nextPress = (
    <Button
      variant="primary"
      onPress={() => {
        focusConnect.current = true;
        setStep(1);
      }}
    >
      {t('ui.next')}
    </Button>
  );
  const connectPress = connectReason ? (
    <ReasonButton variant="primary" reason={connectReason}>
      {t('chan.connect')}
    </ReasonButton>
  ) : (
    <Button variant="primary" busy={change.running} isDisabled={change.outcome === 'pending' || locked} onPress={() => void send(`create:${kind}`, 'new')}>
      {t('chan.connect')}
    </Button>
  );

  return (
    <RailDrawer overlayId="bots-chat-apps-drawer" resizeKey="bots-chat-apps"
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={adding ? t('chan.addTitle', { name: bot.name }) : t('chan.manageTitle', { name: channel.label })}
      subtitle={adding ? t('chan.addDesc') : <KindName kind={channel.kind} />}
      dirty={asksToClose || draftDirty(draft) || draftDirty(chatDraft) || (adding ? token !== '' || label !== '' : name.trim() !== channel.label)}
      discardText={asksToClose ? t('secret.closeAsk') : undefined}
      discardLabel={asksToClose ? t('secret.closeNow') : undefined}
      sections={[
        { id: 'setup', label: t('chan.rail.setup') },
        { id: 'people', label: t('chan.rail.people'), isDisabled: adding },
        { id: 'chats', label: t('chan.rail.chats'), isDisabled: adding },
        { id: 'settings', label: t('chan.rail.settings'), isDisabled: adding },
      ]}
      active={section}
      onSelect={setSection}
      railLabel={t('chan.rail')}
      {...(adding
        ? { primaryOnPhone: step === 0 ? nextPress : connectPress, reason: step === 0 ? undefined : (connectReason ?? undefined) }
        : section === 'settings'
          ? { primary: settingsFoot.primary, secondary: settingsFoot.secondary, reason: settingsFoot.reason, cancel: false }
          : {})}
    >
      <div className={s.settingsBody}>
        {change.outcome === 'pending' && <OutcomeBanner kind="pending" title={t('chan.maybe')} body={t('chan.maybeBody')} onCheck={() => change.readBack()} onDismiss={() => change.dismiss()} />}
        <ChangeFailed change={change} />
        {section === 'setup' && adding && (
          <section ref={addTrack} className={s.settingsSection} aria-label={t('chan.rail.setup')}>
            <Track label={t('chan.addFlow.steps')} open={step === 0 ? 'kind' : 'connect'} onOpen={(id) => !locked && setStep(id === 'kind' ? 0 : 1)}>
              <TrackStep id="kind" state={step === 0 ? 'now' : 'done'} name={t('chan.addFlow.step.kind')} result={<ChatNames text={CHAT_SLOTS[kind]} />} foot={{ primary: nextPress }}>
                {/* A create whose answer is unknown keeps its app: the step cannot be opened again. */}
                {step === 0 || !locked ? (
                  <RadioGroup
                    label={t('chan.kind')}
                    value={kind}
                    onChange={setKind}
                    options={KINDS.map((k) => ({ value: k, label: t(`chan.kind.${k}`), description: t(`chan.kind.${k}.help`), icon: k }))}
                  />
                ) : null}
              </TrackStep>
              <TrackStep id="connect" state={step === 0 ? 'later' : 'now'} name={t('chan.addFlow.step.connect')} why={t('chan.addFlow.why')} foot={{ say: t('chan.addFlow.say'), primary: connectPress }}>
                {setupQ.setup && !setupQ.setup.available && (
                  <Band size="table">
                    <ChatNames text={t('chan.setup.unavailable', { app: CHAT_SLOTS[kind] })} />
                  </Band>
                )}
                <StepList
                  label={t('chan.setup.title', { app: t(`chan.kind.${kind}`) })}
                  groups={[
                    { where: t('flow.group.where.app'), items: inApp },
                    { where: t('flow.group.where.here'), items: [{ id: 'paste', text: t('chan.addFlow.pasteRow') }] },
                  ].filter((g) => g.items.length > 0)}
                />
                {tokenFields}
                {/* The optional parts of a connect sit in a fold; a refused name keeps it open so its error stays in view. */}
                <Disclosure
                  title={t('chan.addFlow.options')}
                  description={t(kind === 'telegram' ? 'chan.addFlow.optionsWhat.telegram' : 'chan.addFlow.optionsWhat')}
                  isExpanded={optionsOpen || tooLong(label)}
                  onExpandedChange={setOptionsOpen}
                >
                  <TextField label={t('chan.label')} description={t('chan.name.help')} value={label} onChange={setLabel} isDisabled={locked} errorMessage={tooLong(label) ? t('chan.nameTooLong', { max: NAME_MAX }) : undefined} />
                  {kind === 'telegram' && <Checkbox label={t('chan.webhook.create')} description={<ChatNames text={t('chan.webhook.createHelp', CHAT_SLOTS)} />} isSelected={removeHook} onChange={setRemoveHook} isDisabled={locked} />}
                </Disclosure>
              </TrackStep>
              <TrackStep id="owner" state="later" name={t('chan.addFlow.step.owner')} />
            </Track>
          </section>
        )}

        {section === 'setup' && channel && (
          <section className={s.settingsSection} aria-label={t('chan.rail.setup')}>
            {pairedNow && !waitsForOwner && <OwnerPaired channel={channel} />}
            <SetupTrack
              channel={channel}
              open={openStep}
              onOpen={setOpenStep}
              webhookPrimary={
                <Button variant="primary" isDisabled={change.running || change.outcome === 'pending'} onPress={() => setWebhookAsk(true)}>
                  {t('chan.webhook.go')}
                </Button>
              }
              token={tokenFields}
              tokenPrimary={replaceButton}
              chatsButton={
                <Button variant="secondary" onPress={() => setSection('chats')}>
                  {t('setup.openChats')}
                </Button>
              }
              settingsButton={
                <Button size="sm" variant="ghost" onPress={() => setSection('settings')}>
                  {t('setup.openSettings')}
                </Button>
              }
              restartButton={
                <>
                  {/* A paused app keeps Open Settings: a restart ends with a resume, which would undo the person's pause. The Bot's own
                      pause of every app (on, changing or unread) holds it too: the app would not start. */}
                  {channel.enabled && channel.state !== 'paused' && !botPaused ? (
                    <Button
                      size="sm"
                      busy={change.running}
                      isDisabled={change.outcome === 'pending'}
                      onPress={() => {
                        setRestarted(null);
                        void change.run({ channelId: channel.id, action: 'restart' }).then((r) => {
                          const kind = r.outcome === 'done' ? (r.data?.restart === 'paused' ? 'paused' : 'done') : r.outcome === 'pending' ? (r.code === 'restart_resume_unknown' ? 'resumeUnknown' : 'pauseUnknown') : null;
                          if (kind) setRestarted({ id: channel.id, kind });
                        });
                      }}
                    >
                      {t('setup.privacy.restartGo')}
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onPress={() => setSection('settings')}>
                      {t('setup.openSettings')}
                    </Button>
                  )}
                  {/* Mounted whatever the app's state, so its words are heard when they come (kit StatusLine). */}
                  <StatusLine>{restarted?.id === channel.id ? t(`setup.privacy.restarted.${restarted.kind}`) : null}</StatusLine>
                </>
              }
              owner={
          <div className={s.ownerCode}>
            {/* The code, once issued, sits under the steps' first row (its SecretField); until then that row's control makes one. */}
            <OwnerSteps
              channel={channel}
              code={code ? <IssuedCodeField issued={code} label={t('chan.codeTitle')} note={t('chan.codeNote')} /> : undefined}
              get={
                <Button
                  size="sm"
                  isDisabled={change.running || change.outcome === 'pending' || codeOff}
                  onPress={() => {
                    // The request number is taken as the button is pressed: the shown code drops now and a send admitted after the drawer closed writes nothing.
                    const ticket = beginIssue(bot.uid, channel.id);
                    const press = beginPress();
                    ownersAtIssue.current = new Set(ownersSeen.current);
                    setCodeUsed(false);
                    void change.run({ channelId: channel.id, action: 'ownerCode', ticket }).then((r) => {
                      if (r.outcome !== 'done' && r.outcome !== 'pending') settlePress(bot.uid, channel.id);
                      if (r.outcome === 'not_sent') refuseFor(press)({ kind: 'issue', code: r.code });
                      if (r.outcome !== 'done') return;
                      adoptDemo(bot.uid, channel.id, 'owner', r.data, ticket);
                      // A new code: "the code no longer works" is out of date whichever press it came from.
                      setCancelledAt(null);
                    });
                  }}
                >
                  {t('chan.ownerCode')}
                </Button>
              }
            />
            {/* What happened to the code and what blocks one are notices (kit Bands), not paragraphs in the step. */}
            {!code && mayHaveChanged && (change.running || change.outcome === 'pending') && <Band size="table">{t('chan.code.mayHaveChanged')}</Band>}
            {!code && codeUsed && !mayHaveChanged && <Band size="table">{t('chan.code.used')}</Band>}
            {!code && codeOff && (
              <Band
                tone="warn"
                size="table" /* noDetails: a setting of the app holds the code back, nothing was refused */
                actions={
                  <Button size="sm" variant="secondary" onPress={() => setSection('settings')}>
                    {t('chan.invite.openSettings')}
                  </Button>
                }
              >
                {t('chan.ownerCode.needsPolicy')}
              </Band>
            )}
            <div>
              <Button
                size="sm"
                isDisabled={change.running || change.outcome === 'pending'}
                onPress={() => {
                  beginIssue(bot.uid, channel.id);
                  const press = beginPress();
                  ownersAtIssue.current = null;
                  setCodeUsed(false);
                  void change.run({ channelId: channel.id, action: 'cancelCode' }).then((r) => {
                    if (r.outcome !== 'done' && r.outcome !== 'pending') settlePress(bot.uid, channel.id);
                    if (r.outcome === 'not_sent') refuseFor(press)({ kind: 'cancel', code: r.code });
                    if (r.outcome !== 'done') return;
                    clearCode(bot.uid, channel.id);
                    if (counts(press)) setCancelledAt(press.at);
                  });
                }}
              >
                {t('chan.cancelCode')}
              </Button>
            </div>
            {cancelled !== null && <Band size="table">{t('chan.codeCancelled')}</Band>}
            <PressRefused refused={codeLine.refused} onHide={codeLine.hide} />
          </div>
              }
            />
            {/* The token is upkeep: a reveal row (the kit moves focus into the editor and back to Replace). A refused token is
                the track's open step instead, with the same fields. */}
            {channel.state !== 'auth_failed' && (
              <SettingGroup label={t('setup.token.row')}>
                <SettingRow
                  label={t('setup.token.row')}
                  help={t('setup.token.help')}
                  reveal={{
                    label: t('setup.token.replace'),
                    editor: tokenFields,
                    saveLabel: t('chan.replaceGo'),
                    canSave: !replaceOff,
                    // The editor stays open (its fields emptied at the send) unless the token was replaced.
                    onSave: () => send('credentials', channel.id).then((done) => (done ? undefined : Promise.reject(new Error('token not replaced')))),
                    onCancel: () => {
                      setToken('');
                      setAppToken('');
                    },
                  }}
                />
              </SettingGroup>
            )}
          </section>
        )}

        {section === 'people' && channel && <PeopleSection channel={channel} change={change} botUid={bot.uid} onSettings={() => setSection('settings')} onSetup={() => openSetupOn('owner')} codeLine={codeLine} />}

        {section === 'chats' && channel && <ChatsSection channel={channel} change={change} draft={chatDraft} onDraft={setChatDraft} onSetup={() => openSetupOn('privacy')} onSettings={() => setSection('settings')} />}

        {section === 'settings' && channel && (
          <section className={s.settingsSection} aria-label={t('chan.rail.settings')}>
            {/* The same section as Main settings under it: one look for the tab's groups. */}
            <AnatomySection id="bot-chat-app" title={t('chan.set.app')} state={{ kind: 'ready' }}>
              <SettingGroup variant="field" label={t('chan.set.app')}>
                <SettingRow
                  label={t('chan.name.label')}
                  help={t('chan.name.help')}
                  actions={
                    <Button
                      size="sm"
                      isDisabled={change.running || change.outcome === 'pending' || name.trim() === '' || name.trim() === channel.label || tooLong(name.trim())}
                      onPress={() => void change.run({ channelId: channel.id, action: 'rename', label: name.trim() })}
                    >
                      {t('chan.name.save')}
                    </Button>
                  }
                >
                  {(ids) => (
                    <TextField aria-labelledby={ids.nameId} aria-describedby={ids.helpId} value={name} onChange={setName} isDisabled={change.running || change.outcome === 'pending'} errorMessage={tooLong(name.trim()) ? t('chan.nameTooLong', { max: NAME_MAX }) : undefined} />
                  )}
                </SettingRow>
                <SettingSwitch
                  label={t('chan.enabled', { name: channel.label })}
                  isSelected={channel.enabled}
                  isDisabled={change.running}
                  onChange={(v) => void change.run({ channelId: channel.id, action: v ? 'enable' : 'disable' })}
                />
              </SettingGroup>
            </AnatomySection>
            <ChannelSettingsSection channel={channel} change={change} draft={draft} onDraft={settingsFoot.onDraft} />
            <SettingGroup tone="danger" title={t('chan.set.remove')}>
              <SettingRow
                label={t('chan.remove')}
                help={t('chan.removeBody')}
                tone="danger"
                actions={
                  <Button tone="danger" onPress={() => setRemoving(true)}>
                    {t('chan.remove')}
                  </Button>
                }
              />
            </SettingGroup>
          </section>
        )}
      </div>
      <ConfirmDialog
        overlayId="bots-chat-apps-webhook"
        isOpen={webhookAsk}
        onOpenChange={setWebhookAsk}
        title={t('chan.webhook.confirmTitle')}
        body={<ChatNames text={t('chan.webhook.confirmBody', CHAT_SLOTS)} />}
        confirmLabel={t('chan.webhook.go')}
        busy={change.running}
        outcome={dialogOutcome(change)}
        onCheck={() => change.readBack()}
        onConfirm={() => channel && void change.run({ channelId: channel.id, action: 'webhookRemove' }).then((r) => r.outcome === 'done' && setWebhookAsk(false))}
      />
      <ConfirmDialog
        overlayId="bots-chat-apps-remove"
        isOpen={removing}
        onOpenChange={setRemoving}
        title={t('chan.removeTitle', { name: channel?.label ?? '' })}
        body={t('chan.removeBody')}
        confirmLabel={t('chan.remove')}
        tone="danger"
        busy={change.running}
        outcome={dialogOutcome(change)}
        onCheck={() => change.readBack()}
        onConfirm={() => channel && void send('remove', channel.id)}
      />
    </RailDrawer>
  );
}
