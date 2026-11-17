// Chat apps, the flow in plain steps: the Chats list's
// Telegram privacy warning, and the owner code, invite and group steps with the words each platform accepts.
// Everything is read from the channel list the Bot pane already fetches (every 15 s); nothing here sends.
import { Fragment, type ReactNode } from 'react';
import { Band, Button, CHAT_SLOTS, ChatNames, CodeLine, Disclosure, Facts, Icon, RowNote, StepList, Why, useStrings, type StepListGroup, type StepListItem } from '@kit';
import { botAddress, commandText, groupMode, mentionOnly, pairingMinutes, privacyOn, type GroupMode } from '../chatFlow';
import type { Channel } from '../data';
import { pageFaq } from '../faq';
import strings from '../strings.en.json';
import s from './pane.module.css';
import { withBotFather } from './botFather';
import { ownerName } from './chatOwner';

type T = ReturnType<typeof useStrings<typeof strings>>;

/** While the Telegram bot's privacy mode is on: the Chats list's standing warning, with a button to the Setup step that
 *  turns it off when `onSteps` is given (the steps themselves are Setup's privacy step, ChatSetup.tsx). */
export function PrivacyBand({ channel, onSteps }: { channel: Channel; steps?: false; onSteps?: () => void }) {
  const t = useStrings(strings);
  if (!privacyOn(channel)) return null;
  return (
    <div className={s.flowWarn} data-privacy="on">
      <Band
        // noDetails: a note the agent attaches to the app's settings (Telegram privacy on), not a rejection: there is nothing to show.
        tone="warn"
        size="table"
        actions={
          onSteps && (
            <Button size="sm" variant="ghost" onPress={onSteps}>
              {t('flow.privacy.fix')}
            </Button>
          )
        }
      >
        {t('flow.privacy.title')}
      </Band>
    </div>
  );
}

/** Step 2 of the owner code and of an invite: where the private chat with the Bot is, per platform. */
function privateChatLine(t: T, c: Channel): string {
  const addr = botAddress(c);
  if (c.kind === 'telegram') return addr ? t('flow.owner.s2.telegram', { ...CHAT_SLOTS, at: addr.at }) : t('flow.owner.s2.telegramNoName', CHAT_SLOTS);
  return t(`flow.owner.s2.${c.kind}`, CHAT_SLOTS);
}

/** The owner code as a StepList: make the code here, then send it from the private chat with the Bot there. The
 *  Setup track's owner step carries the name, the one-line why and the foot that says the page updates by itself, so this
 *  is the steps alone. `get` is the first row's control (the Owner code button) while no code is shown; `code` is the code
 *  itself (IssuedCodeField, a SecretField), under the first row once issued. */
export function OwnerSteps({ channel, get, code }: { channel: Channel; get?: ReactNode; code?: ReactNode }) {
  const t = useStrings(strings);
  const addr = botAddress(channel);
  const groups: StepListGroup[] = [
    {
      where: t('flow.group.where.here'),
      items: [{ id: 'get', text: code != null ? t('flow.owner.row.copy') : t('flow.owner.row.get'), note: code, act: code != null ? undefined : get }],
    },
    {
      where: t('flow.group.where.app'),
      ...(addr?.link ? { open: { label: t('flow.owner.openChat'), url: addr.link } } : {}),
      items: [
        { id: 'chat', text: <ChatNames text={privateChatLine(t, channel)} /> },
        { id: 'send', text: t('flow.owner.row.send') },
      ],
    },
  ];
  return <StepList label={t('flow.owner.steps')} groups={groups} />;
}

/** The line that shows once, in the open drawer, when the owner code was used while it watched. */
export function OwnerPaired({ channel }: { channel: Channel }) {
  const t = useStrings(strings);
  const name = ownerName(channel);
  if (name === '') return null;
  return (
    <p className={s.flowDone} role="status" /* reason: a one-line confirmation that the code was used, read once */>
      <Icon name="check-circle" size="sm" className={s.checkIcon} />
      {t('flow.owner.paired', { name })}
    </p>
  );
}

/** An invite code as a StepList (People): create it here, send it to the person, and they send it to the Bot.
 *  `code` is the issued code (IssuedCodeField, a SecretField), under the second row. */
export function InviteSteps({ channel, code }: { channel: Channel; code?: ReactNode }) {
  const t = useStrings(strings);
  const addr = botAddress(channel);
  const groups: StepListGroup[] = [
    {
      where: t('flow.group.where.here'),
      items: [
        { id: 'make', text: t('flow.invite.s1') },
        { id: 'send', text: t('flow.invite.s2'), note: code },
      ],
    },
    {
      where: t('flow.invite.where.them'),
      items: [{ id: 'use', text: <ChatNames text={channel.kind === 'telegram' && addr ? t('flow.invite.s3.telegram', { ...CHAT_SLOTS, at: addr.at }) : t('flow.invite.s3.any')} /> }],
    },
  ];
  // Each row is one short line; what holds for the code whatever the step is a fact beside the steps.
  return (
    <>
      <StepList label={t('flow.invite.steps')} groups={groups} />
      <Facts
        label={t('flow.invite.facts')}
        layout="spec"
        columns={1}
        items={[
          { label: t('flow.invite.fact.code'), value: t('flow.invite.s4', { min: pairingMinutes(channel) }) },
          { label: t('flow.invite.fact.send'), value: t('flow.invite.fact.sendValue') },
          { label: t('flow.invite.fact.after'), value: t('flow.invite.fact.afterValue') },
        ]}
      />
    </>
  );
}

/** The words that name the group access setting and its value, as Settings shows them. */
const modeWords = (t: T, m: GroupMode) => ({ setting: t('set.n.group_mode'), value: t(`set.v.group_mode.${m}`), allowed: t('set.n.allowed_chats') });

/** A sentence whose {{slots}} are elements (a CodeLine, a bold button name): the words around them stay one string. */
export function withParts(text: string, parts: Record<string, ReactNode>): ReactNode[] {
  return text.split(/(\{\{\w+\}\})/).map((piece, i) => {
    const m = /^\{\{(\w+)\}\}$/.exec(piece);
    return m && m[1]! in parts ? <Fragment key={i}>{parts[m[1]!]}</Fragment> : <Fragment key={i}>{withBotFather(piece)}</Fragment>;
  });
}

/** What keeps a group from joining now, first one only (one Band per section): the app's group access
 *  off or limited to listed groups, a value this page does not know, or the bind command turned off. */
function groupBlock(t: T, mode: GroupMode | null, bind: string | null): { tone: 'warn' | 'neutral'; text: string } | null {
  if (mode === 'off') return { tone: 'warn', text: t('flow.group.modeOff', modeWords(t, 'off')) };
  if (mode === 'allowlist') return { tone: 'warn', text: t('flow.group.modeAllowlist', modeWords(t, 'allowlist')) };
  // A value this page does not know: no promise that bind asks or that approval admits (the agent refuses what it does not know).
  if (mode === null) return { tone: 'neutral', text: t('flow.group.modeUnknown', { setting: t('set.n.group_mode') }) };
  if (!bind) return { tone: 'warn', text: t('flow.group.bindOff') };
  return null;
}

/** How a group joins: what blocks it as one Band with Open Settings, the steps as a StepList
 *  (in the app, then back here) with the command as a CodeLine, and what mentions only means there in one closed Why. */
export function GroupHowTo({ channel, onSettings }: { channel: Channel; onSettings?: (() => void) | undefined }) {
  const t = useStrings(strings);
  const { byId } = pageFaq(t);
  const addr = botAddress(channel);
  const cmd = commandText(channel, 'bind');
  // Slack (and Discord without message content) pass the Bot only group messages that mention it: the command carries the mention.
  const bind = cmd && channel.kind !== 'telegram' ? `${cmd} ${addr?.at ?? t('flow.group.atBot')}` : cmd;
  const mode = groupMode(channel);
  const tg = channel.kind === 'telegram';
  const mention = !mentionOnly(channel)
    ? privacyOn(channel)
      ? t('flow.group.mentionOffPrivacy', CHAT_SLOTS)
      : t('flow.group.mentionOff', { app: CHAT_SLOTS[channel.kind] })
    : privacyOn(channel)
      ? t('flow.group.mentionOnPrivacy', CHAT_SLOTS)
      : tg
        ? t('flow.group.mentionOn')
        : t('flow.group.mentionOnAddressed', { app: CHAT_SLOTS[channel.kind] });
  const block = groupBlock(t, mode, bind);
  const inApp: StepListItem[] = [];
  if (tg)
    inApp.push({
      id: 'privacy',
      text: withParts(t('flow.group.privacyRow', { cmd: '{{cmd}}', button: '{{button}}' }), { cmd: <CodeLine value="/setprivacy" />, button: <strong>{t('flow.group.privacyButton')}</strong> }),
      note: t('flow.group.privacyNote'),
    });
  // Telegram: the row stays one short line whatever the bot's name (a username may be 64 characters); the name is a
  // CodeLine in its note, the text the person types to find the bot.
  inApp.push(
    tg
      ? {
          id: 'add',
          text: t('flow.group.addRow.telegram'),
          note: addr ? withParts(t('flow.group.addNote.telegram', { at: '{{at}}' }), { at: <CodeLine value={addr.at} /> }) : t('flow.group.addNote.telegramNoName'),
        }
      : { id: 'add', text: t(`flow.group.add.${channel.kind as 'slack' | 'discord'}`) },
  );
  // No bind row while nothing can ask to join (a value this page does not know, or the command off): the Band says why.
  if (mode !== null && bind)
    inApp.push({
      id: 'bind',
      text: withParts(t('flow.group.bindRow', { cmd: '{{cmd}}' }), { cmd: <CodeLine value={bind} /> }),
      note: tg ? (
        t('flow.group.bindWho')
      ) : (
        <>
          {t('flow.group.bindWho')} <ChatNames text={t('flow.group.bindPlain', { app: CHAT_SLOTS[channel.kind] })} />
        </>
      ),
    });
  const groups: StepListGroup[] = [
    {
      // The app's own name needs its mark (ChatNames), which a place label cannot carry: the place is named by kind.
      where: t('flow.group.where.app'),
      ...(channel.kind === 'discord' && channel.identity?.inviteUrl ? { open: { label: t('flow.group.invite'), url: channel.identity.inviteUrl } } : {}),
      items: inApp,
    },
  ];
  // Under open group access the Bot reads the group as soon as it asks: approval is no step there.
  if (mode !== null)
    groups.push({
      where: t('flow.group.where.here'),
      items: [
        mode === 'open'
          ? { id: 'open', text: t('flow.group.openRow'), note: t('flow.group.openNote', modeWords(t, 'open')) }
          : { id: 'approve', text: t('flow.group.approveRow'), note: t('flow.group.approveNote') },
      ],
    });
  // Open while the app has no group yet; afterwards one click away above the list.
  const firstGroup = !channel.chatRows.some((x) => x.kind === 'group');
  return (
    <Disclosure title={t('flow.group.title')} defaultExpanded={firstGroup} className={s.flowBox}>
      <div className={s.formStack}>
        {block && (
          <Band
            // noDetails: the app's own group access setting read back, not a rejection: there is nothing to show.
            tone={block.tone}
            size="table"
            actions={
              onSettings ? (
                <Button size="sm" variant="ghost" onPress={onSettings}>
                  {t('flow.group.settings')}
                </Button>
              ) : undefined
            }
          >
            {block.text}
          </Band>
        )}
        <StepList label={t('flow.group.steps')} groups={groups} />
        <Why question={t('flow.group.why')} faq={{ item: byId.groupChats, label: t('flow.group.whyMore') }}>
          <ChatNames text={mention} />
        </Why>
      </div>
    </Disclosure>
  );
}

/** What a requested group's row says about whether the Bot reads it, by the app's group access. */
function requestedLine(t: T, mode: GroupMode | null): string {
  if (mode === null) return t('flow.chat.requestedLineUnknown', { setting: t('set.n.group_mode') });
  return mode === 'open' ? t('flow.chat.requestedLineOpen', modeWords(t, 'open')) : t('flow.chat.requestedLine');
}

/** A requested group's row line: a note under the chat's name in its table cell (a CellLines line; nothing for other chats). Under open group access the Bot reads the group
 *  already, so approval is no boundary there. Its own component: each note is one short region of text (the layout rules measure a region). */
export function RequestedLine({ channel, kind, state }: { channel: Channel; kind: 'dm' | 'group'; state: string }) {
  const t = useStrings(strings);
  return kind === 'group' && state === 'requested' ? <RowNote>{requestedLine(t, groupMode(channel))}</RowNote> : null;
}

/** A group's read line while Telegram privacy is on, under the chat's name in its table cell. canRead is the agent's word for this one
 *  group (Telegram, can_read): false says the Bot cannot read it, true drops the privacy line (privacy is off, or the Bot is an admin
 *  there); absent keeps the general line while privacy is on. */
export function ReadLine({ channel, kind, canRead }: { channel: Channel; kind: 'dm' | 'group'; canRead?: boolean | undefined }) {
  const t = useStrings(strings);
  return kind === 'group' && (canRead === false || (privacyOn(channel) && canRead !== true)) ? (
    <RowNote>
      <Icon name="eye-off" size="sm" className={s.waitIcon} />
      {t(canRead === false ? 'chan.chat.cantRead' : 'flow.chat.privacyLine')}
    </RowNote>
  ) : null;
}
