// Onboarding: a new account's loading screen. The kit LoadScreen draws it; this view only says what the reads proved
// (logic.ts stageOf / stepsOf) and offers the way out. It never traps: Skip is always there, and when the computer runs
// the one accent button opens it. It sends nothing; a state that needs the person hands over to Home, which holds the
// action.
import { useCan } from '@core';
import { Band, CanvasPage, CHAT_SLOTS, ChatNames, ItemList, LinkButton, LoadScreen, TextButton, usePageLink, useStrings, type IconName, type ItemProps, type LoadCard, type LoadStage, type PageLink } from '@kit';
import { useEffect, useMemo, useState } from 'react';
import { useAsking } from './ask';
import { useAskBlock } from './askCard';
import { links as bots } from '../bots/links';
import { links as computers } from '../computers/links';
import { links as guide } from '../guide/links';
import { links as home } from '../home/links';
import { links as keys } from '../keys/links';
import { links as programs } from '../programs/links';
import { links as support } from '../support/links';
import { useOnboarding } from './data';
import { CARDS, endLine, nextActions, pollDelay, shownSteps, stageOf, waitNote, type CardId, type NextId, type Stage } from './logic';
import strings from './strings.en.json';

const CARD_ICON: Readonly<Record<CardId, IconName>> = {
  computers: 'computer',
  programs: 'link',
  files: 'files',
  agent: 'hoody-ai-agent',
  bots: 'bot',
  scripts: 'schedules',
  realms: 'realm',
  keys: 'key',
};

const NEXT_ICON: Readonly<Record<NextId, IconName>> = {
  program: 'hoody-services',
  bot: 'bot',
  chat: 'hoody-bots',
  terminal: 'computer',
  key: 'key',
  guide: 'hoody-docs',
};

export default function OnboardingPage() {
  const t = useStrings(strings);
  const { reads, name, error, stale, staleError, reread } = useOnboarding();
  const stage = stageOf(reads);
  const [polls, setPolls] = useState(0);
  // The count is of reads that changed nothing: a stage that moved starts its own wait (5 s reads again, no "slow" note).
  const [counted, setCounted] = useState(stage.kind);
  if (counted !== stage.kind) {
    setCounted(stage.kind);
    setPolls(0);
  }

  // While a later read can still move the stage, read again: every 5 s at first, then every 30 s, then not at all.
  const delay = pollDelay(stage, polls);
  useEffect(() => {
    if (delay === null) return;
    const timer = setTimeout(() => {
      setPolls((n) => n + 1);
      reread();
    }, delay);
    return () => clearTimeout(timer);
  }, [delay, polls, reread]);

  const computersLink = usePageLink('computers');
  const homeLink = usePageLink('home');
  const guideLink = usePageLink('guide');
  const supportLink = usePageLink('support');
  // A page this load does not serve gets no button.
  const to = (link: PageLink | null, hubPath: string): string | null => (link ? hubPath : null);

  const stages: LoadStage[] = shownSteps(stage, polls).map((x) => ({ id: x.id, state: x.state, label: t(`step.${x.id}`) }));
  const items = useMemo<LoadCard[]>(
    () => CARDS.map((id) => ({ id, icon: CARD_ICON[id], title: t(`card.${id}`), body: id === 'bots' ? <ChatNames text={t('card.bots.body', CHAT_SLOTS)} /> : t(`card.${id}.body`) })),
    [t],
  );

  // The last screen: what to do next, each a link into the page that holds it. The tour itself sends nothing.
  const links: Readonly<Record<string, PageLink | null>> = { computers: computersLink, guide: guideLink, bots: usePageLink('bots'), programs: usePageLink('programs'), keys: usePageLink('keys') };
  const account = useCan('account');
  const nextIds = nextActions({ stage, served: (p) => !!links[p], account });
  const nextHref: Readonly<Record<NextId, string>> = {
    program: programs.list,
    bot: bots.newBot(),
    chat: bots.list,
    terminal: stage.kind === 'ready' ? computers.item(stage.computer.handle) : computers.list,
    key: keys.create,
    guide: guide.guide,
  };
  const nextItems: ItemProps[] = nextIds.map((id) => ({ id, leading: NEXT_ICON[id], title: t(`next.${id}`), href: nextHref[id] }));

  // The optional questions: last in the card, under the buttons, so they never move or hold the way out.
  const asking = useAsking();
  const ask = useAskBlock(asking, { accent: !((stage.kind === 'ready' || stage.kind === 'failed') && computersLink), aiServed: !!usePageLink('ai') });

  const note = waitNote(stage, polls);
  const line = endLine(stage);
  const helpHref = to(supportLink, support.list);
  const again = () => {
    setPolls(0);
    reread();
  };
  const notice =
    stage.kind === 'unread' ? (
      // No sentence of its own: the band says what the rejection was (the kit's mapped sentence) and holds its details.
      <Band tone="warn" error={error} actions={<TextButton onPress={reread}>{t('note.retry')}</TextButton>} />
    ) : stale ? (
      // A read again failed over a kept answer: say so, and offer a read-only Check again.
      <Band tone="warn" error={staleError} actions={<TextButton onPress={again}>{t('note.again')}</TextButton>}>
        {t('note.stale')}
      </Band>
    ) : note ? (
      <Band
        tone="warn"
        // noDetails: a wait that runs long is no rejection; the band says what the page read and offers Check again.
        actions={
          <>
            {note === 'paused' ? <TextButton onPress={again}>{t('note.again')}</TextButton> : null}
            {helpHref !== null ? (
              <LinkButton variant="ghost" size="sm" href={helpHref}>
                {t('note.help')}
              </LinkButton>
            ) : null}
          </>
        }
      >
        {t(`note.${note}`)}
      </Band>
    ) : undefined;

  return (
    <CanvasPage title={t('title')}>
      <LoadScreen
        title={t('started')}
        intro={name ? t('head.named', { name }) : t('head')}
        status={statusOf(stage, t)}
        stages={stages}
        stagesLabel={t('steps.label')}
        waiting={stage.kind === 'loading'}
        items={items}
        itemsLabel={t('cards.label')}
        notice={notice}
        nextTitle={t('next.title')}
        next={nextItems.length > 0 ? <ItemList label={t('next.label')} items={nextItems} /> : undefined}
        nextPending={line === 'pending' ? t('next.pending') : line === 'below' ? t('next.below') : undefined}
        ask={ask}
        // Once What next lists the Guide, the button row leaves it out (one link per place).
        actions={<Actions stage={stage} computersHref={to(computersLink, stage.kind === 'ready' || stage.kind === 'stopped' || stage.kind === 'failed' || stage.kind === 'unknown' ? computers.item(stage.computer.handle) : computers.list)} homeHref={to(homeLink, home.home)} guideHref={nextIds.includes('guide') ? null : to(guideLink, guide.guide)} />}
      />
    </CanvasPage>
  );
}

function statusOf(stage: Stage, t: ReturnType<typeof useStrings<typeof strings>>): string {
  switch (stage.kind) {
    case 'making':
    case 'ready':
    case 'stopped':
    case 'failed':
    case 'unknown':
      return t(`now.${stage.kind}`, { name: stage.computer.name });
    case 'blocked':
      return t(`now.blocked.${stage.why}`);
    default:
      return t(`now.${stage.kind}`);
  }
}

/** The way out. One accent at most: Open, once the computer runs, or Computers when it did not start. A state Home must settle makes Home the main button. */
function Actions({ stage, computersHref, homeHref, guideHref }: { stage: Stage; computersHref: string | null; homeHref: string | null; guideHref: string | null }) {
  const t = useStrings(strings);
  const settled = stage.kind === 'ready';
  const toHome = stage.kind === 'blocked' || stage.kind === 'shared';
  const toComputers = stage.kind === 'stopped' || stage.kind === 'failed' || stage.kind === 'unknown' || stage.kind === 'elsewhere' || stage.kind === 'reserved';
  return (
    <>
      {settled && computersHref !== null ? (
        <LinkButton variant="primary" icon="computer" href={computersHref}>
          {t('action.open')}
        </LinkButton>
      ) : null}
      {toComputers && computersHref !== null ? (
        <LinkButton variant={stage.kind === 'failed' ? 'primary' : 'secondary'} icon="computer" href={computersHref}>
          {t('action.computers')}
        </LinkButton>
      ) : null}
      {homeHref !== null ? (
        <LinkButton variant={toHome ? 'secondary' : 'ghost'} iconEnd="arrow-right" href={homeHref}>
          {settled || toHome || toComputers ? t('action.home') : t('action.skip')}
        </LinkButton>
      ) : null}
      {guideHref !== null ? (
        <LinkButton variant="ghost" icon="guide" href={guideHref}>
          {t('action.guide')}
        </LinkButton>
      ) : null}
    </>
  );
}
