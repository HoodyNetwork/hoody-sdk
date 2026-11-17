// A chat app's Setup: one Verdict that answers "does it work?", then a
// kit Track of the steps (chatFlow setupSteps, the open one from nextStep). Each step that asks something of the person
// shows its how as a StepList grouped by where it happens, with what they type as CodeLines; a webhook that blocks and a
// refused token are open steps of their own. The page passes in the parts that hold state of their own (the owner code,
// the token fields): this file only lays the track out and sends nothing.
import { type ReactNode } from 'react';
import { CHAT_SLOTS, ChatNames, CodeLine, Facts, StepList, Tag, Track, TrackStep, Verdict, VerdictMark, Why, useStrings, type StepListGroup } from '@kit';
import { botAddress, groupMode, nextStep, pairingMinutes, setupSteps, type SetupStep, type SetupStepId } from '../chatFlow';
import type { Channel } from '../data';
import { pageFaq } from '../faq';
import strings from '../strings.en.json';
import { ownerName } from './chatOwner';
import { BOTFATHER_URL, BotFatherLink } from './botFather';

type T = ReturnType<typeof useStrings<typeof strings>>;

/** The sentence of the Verdict: the first thing that is wrong, its wrong part marked; nothing marked when all is well. The
 *  sentence is plain JSX around the mark (its start, the mark, its end), so the anatomy rule reads every word of it. */
/** The home chat as the person knows it: the title of the chat the setting names, else its name in the app; a chat
 *  that is not among the app's chats keeps the setting's own value. */
const homeChatName = (c: Channel, untitled: string): string => {
  const row = c.chatRows.find((x) => x.id === c.homeChat);
  return row ? row.title || row.platformChat || untitled : (c.homeChat ?? '');
};

function verdictLine(t: T, c: Channel, steps: readonly SetupStep[]): ReactNode {
  const has = (id: SetupStepId, seg: SetupStep['segment']) => steps.some((x) => x.id === id && x.segment === seg);
  const marked = (start: string, mark: string, tone: 'warn' | 'danger') => (
    <>
      {start} <VerdictMark tone={tone}>{mark}</VerdictMark>
      {t('setup.verdict.end')}
    </>
  );
  if (has('webhook', 'blocking')) return marked(t('setup.verdict.webhook'), t('setup.mark.webhook'), 'danger');
  if (c.state === 'auth_failed') return marked(t('setup.verdict.token'), t('setup.mark.token'), 'danger');
  // A paused app answers nothing, whatever else is done; only starting is "connecting"; any other state is named as it is.
  if (c.state === 'paused') return marked(t('setup.verdict.paused'), t('setup.mark.paused'), 'warn');
  if (has('token', 'todo')) return t('setup.verdict.connecting');
  if (has('token', 'unknown'))
    return (
      <>
        <VerdictMark tone="warn">{t('setup.mark.down')}</VerdictMark>
        {t('setup.verdict.down', { state: t(`chan.state.${c.state}`) })}
      </>
    );
  if (has('owner', 'blocking')) return marked(t('setup.verdict.owner'), t('setup.mark.owner'), 'warn');
  if (has('privacy', 'limited')) return marked(t('setup.verdict.privacy'), t('setup.mark.privacy'), 'warn');
  return t('setup.verdict.ok');
}

export interface SetupTrackProps {
  channel: Channel;
  /** The owner step's body: the owner code and its buttons (the drawer holds the code). */
  owner: ReactNode;
  /** The refused token's fields, shown in the open token step. */
  token: ReactNode;
  /** The token step's primary (Replace the token). */
  tokenPrimary: ReactNode;
  /** The webhook step's primary (Remove the webhook, behind its confirm). */
  webhookPrimary: ReactNode;
  /** The open step, owned by the drawer; undefined = nextStep's. */
  open: string | null | undefined;
  onOpen: (id: string) => void;
  /** Open Chats (a group, the home chat), as the drawer renders it. */
  chatsButton: ReactNode;
  /** Open Settings: the group step while groups are off. */
  settingsButton: ReactNode;
  /** The privacy step's "pause and resume" row: Restart and check, or Open Settings while the app is paused. */
  restartButton: ReactNode;
}

export function SetupTrack({ channel, owner, token, tokenPrimary, webhookPrimary, open, onOpen, chatsButton, settingsButton, restartButton }: SetupTrackProps) {
  const t = useStrings(strings);
  const { byId } = pageFaq(t);
  const steps = setupSteps(channel);
  const counted = steps.filter((x) => x.segment !== 'unknown');
  const done = counted.filter((x) => x.segment === 'done').length;
  const optLeft = steps.filter((x) => x.segment === 'optional').length;
  const next = nextStep(steps);
  const name = (x: SetupStep): string => (x.id === 'token' && x.state === 'now' ? t('chan.replaceToken') : t(`setup.step.${x.id}`));
  const nextName = next ? steps.find((x) => x.id === next) : undefined;
  // A paused app answers nothing until it is resumed: an optional step is not named as what comes next.
  const saysNext = nextName && !(channel.state === 'paused' && nextName.optional) ? nextName : undefined;
  const addr = botAddress(channel);
  const groups = channel.chatRows.filter((x) => x.kind === 'group' && x.state === 'approved').length;

  const privacyGroups: StepListGroup[] = [
    {
      where: t('flow.group.where.app'),
      open: { label: t('setup.privacy.open'), url: BOTFATHER_URL },
      items: [
        {
          id: 'setprivacy',
          // plain JSX around the commands, so the anatomy rule reads every word
          text: (
            <>
              {t('setup.privacy.send')} <CodeLine value="/setprivacy" /> {t('setup.privacy.sendTo')} <BotFatherLink /> {t('setup.privacy.choose', { button: t('flow.group.privacyButton') })}
            </>
          ),
        },
        {
          id: 'pick',
          text: addr ? (
            <>
              {t('setup.privacy.pick')} <CodeLine value={addr.at} />
            </>
          ) : (
            t('setup.privacy.pickAny')
          ),
        },
      ],
    },
    {
      where: t('flow.group.where.here'),
      items: [
        { id: 'readd', text: t('setup.privacy.readd') },
        { id: 'restart', text: t('setup.privacy.restart'), act: restartButton },
      ],
    },
  ];

  // Each step is written out whole, every prop explicit (no spread or read-back the anatomy rule cannot read).
  const step = (x: SetupStep) => {
    switch (x.id) {
      case 'webhook':
        return (
          <TrackStep key={x.id} id={x.id} state={x.state} tone={x.tone} optional={x.optional} name={name(x)} why={<ChatNames text={t('setup.why.webhook', CHAT_SLOTS)} />} foot={{ say: t('setup.say.webhook'), primary: webhookPrimary }} />
        );
      case 'token':
        if (x.state === 'done') return <TrackStep key={x.id} id={x.id} state={x.state} tone={x.tone} optional={x.optional} name={name(x)} result={t(`chan.state.${channel.state}`)} />;
        if (x.state === 'now')
          return (
            <TrackStep key={x.id} id={x.id} state={x.state} tone={x.tone} optional={x.optional} name={name(x)} why={t('setup.why.token')} foot={{ primary: tokenPrimary }}>
              {token}
            </TrackStep>
          );
        if (x.state === 'unknown')
          return <TrackStep key={x.id} id={x.id} state={x.state} tone={x.tone} optional={x.optional} name={name(x)} why={t('setup.why.down', { state: t(`chan.state.${channel.state}`) })} />;
        return <TrackStep key={x.id} id={x.id} state={x.state} tone={x.tone} optional={x.optional} name={name(x)} why={t('setup.why.connecting')} />;
      case 'owner':
        if (x.state === 'done') return <TrackStep key={x.id} id={x.id} state={x.state} tone={x.tone} optional={x.optional} name={name(x)} result={t('setup.result.owner', { name: ownerName(channel) })} />;
        return (
          <TrackStep key={x.id} id={x.id} state={x.state} tone={x.tone} optional={x.optional} name={name(x)} why={t('flow.owner.lede')}>
            {owner}
            {/* What the code does and what this page does, as facts (no long block in one step). */}
            <Facts
              label={t('flow.owner.facts')}
              layout="spec"
              columns={1}
              items={[
                { label: t('flow.owner.fact.code'), value: t('flow.owner.fact.codeValue', { min: pairingMinutes(channel) }) },
                { label: t('flow.owner.fact.page'), value: t('flow.owner.s4') },
              ]}
            />
            <Why question={t('setup.owner.why')} faq={{ item: byId.chatOwner, label: t('flow.owner.more') }}>
              {t('setup.owner.whyText')}
            </Why>
          </TrackStep>
        );
      case 'privacy':
        // an unknown step gets the kit's own Can't-tell tag
        return (
          <TrackStep
            key={x.id}
            id={x.id}
            state={x.state}
            tone={x.tone}
            optional={x.optional}
            name={name(x)}
            why={x.segment === 'limited' ? t('setup.why.privacy') : t('setup.why.privacyUnknown')}
            tags={x.segment === 'limited' ? <Tag tone="warn">{t('setup.tag.privacyOn')}</Tag> : undefined}
          >
            <StepList label={t('setup.privacy.steps')} groups={privacyGroups} />
            {/* What privacy changes, as facts beside the steps (no long block in one step). */}
            <Facts
              label={t('setup.privacy.facts')}
              layout="spec"
              columns={1}
              items={[
                { label: t('setup.fact.on'), value: t('setup.fact.onValue') },
                { label: t('setup.fact.off'), value: t('setup.fact.offValue') },
                { label: t('setup.fact.joins'), value: t('setup.fact.joinsValue') },
                { label: t('setup.fact.checked'), value: t('setup.fact.checkedValue') },
                { label: t('setup.fact.admin'), value: t('setup.fact.adminValue') },
              ]}
            />
            <Why question={t('setup.privacy.why')} faq={{ item: byId.telegramPrivacy, label: t('flow.privacy.more') }}>
              {t('setup.privacy.whyText')}
            </Why>
          </TrackStep>
        );
      case 'group':
        // The way a group joins depends on the group setting (Chats' GroupHowTo spells it out); groups off is a setting.
        if (x.state === 'done') return <TrackStep key={x.id} id={x.id} state={x.state} tone={x.tone} optional={x.optional} name={name(x)} result={t('setup.result.groups', { count: groups })} />;
        return groupMode(channel) === 'off' ? (
          <TrackStep key={x.id} id={x.id} state={x.state} tone={x.tone} optional={x.optional} name={name(x)} why={t('setup.why.groupOff')} foot={{ primary: settingsButton }} />
        ) : (
          <TrackStep key={x.id} id={x.id} state={x.state} tone={x.tone} optional={x.optional} name={name(x)} why={t('setup.why.group')} foot={{ primary: chatsButton }} />
        );
      case 'home':
        return x.state === 'done' ? (
          <TrackStep key={x.id} id={x.id} state={x.state} tone={x.tone} optional={x.optional} name={name(x)} result={t('setup.result.home', { chat: homeChatName(channel, t('chan.chat.noTitle')) })} />
        ) : (
          <TrackStep key={x.id} id={x.id} state={x.state} tone={x.tone} optional={x.optional} name={name(x)} why={t('setup.why.home')} foot={{ primary: chatsButton }} />
        );
    }
  };

  return (
    <>
      <Verdict
        label={t('setup.label')}
        segments={steps.map((x) => x.segment)}
        count={optLeft > 0 ? t('setup.countOptional', { done, total: counted.length, optional: optLeft }) : t('setup.count', { done, total: counted.length })}
        {...(saysNext ? { next: t('setup.next', { step: name(saysNext) }) } : {})}
      >
        {verdictLine(t, channel, steps)}
      </Verdict>
      <Track label={t('setup.label')} open={open === undefined ? next : open} onOpen={onOpen}>
        {steps.map((x) => step(x))}
      </Track>
    </>
  );
}
