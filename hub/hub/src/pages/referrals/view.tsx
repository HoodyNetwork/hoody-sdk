// The Referrals page: one program read decides the state. An enrolled account
// sees one 12-column grid: Row A holds Your links (8) beside Referral credit (4), then Levels, People you invited and
// Monthly, in the order layout.ts gives. Earning paused and Removed keep credit and history under their band, with no
// invitation or earning promise anywhere on the page. The writes (Set C):
// Join… where the account can join, Release… on an active custom code and the custom-code form while earning; what
// they leave (core's held banners, a refusal's note) shows at the top of the page body.
import {
  Band,
  Button,
  DetailPage,
  ErrorState,
  LinkButton,
  NoAccessState,
  Skeleton,
  Stack,
  followPageLink,
  useGo,
  useErrorInfo,
  usePageLink,
  useStrings,
} from '@kit';
import { Fragment, type ReactNode } from 'react';
import { links as billing } from '../billing/links';
import { invalidateMe, useCreateCode, useJoin, useMe, useNote, useReleaseCode, type Say } from './data';
import { pageFaq } from './faq';
import { ROW_A, SECTIONS } from './layout';
import { RULES_URL, codeArea, invites, readState, type Me } from './logic';
import { CodeForm } from './parts/CodeForm';
import { Counts } from './parts/Counts';
import { CreditCard } from './parts/CreditCard';
import { FirstUse } from './parts/FirstUse';
import { HeldBanners, NoteBanner } from './parts/Held';
import { JoinAction } from './parts/JoinCard';
import { LevelTile, Levels } from './parts/LevelLadder';
import { LinkCard } from './parts/LinkCard';
import { Monthly } from './parts/Monthly';
import { ReleaseButton } from './parts/ReleaseConfirm';
import s from './parts/parts.module.css';
import type { T } from './parts/types';
import strings from './strings.en.json';

export default function ReferralsView() {
  const t = useStrings(strings);
  const read = useMe();
  const info = useErrorInfo(read.error);
  const state = readState({ account: read.account, isPending: read.isPending, info, me: read.me });
  // The questions show exactly where the page invites (where "How you earn" was): not eligible yet, joining paused,
  // can join, and an earning member. Earning paused, removed, token, error and loading show none.
  const { items } = pageFaq(t);
  const notice =
    state === 'earningPaused' ? <Band tone="neutral">{t('band.earningPaused')}</Band> : state === 'removed' ? (
      <Band
        tone="warn"
        // noDetails: a program state the answer reported (removed), not a rejection; nothing failed to show.
      >
        {t('band.removed')}
      </Band>
    ) : undefined;
  return (
    <DetailPage
      header={{
        title: t('title'),
        subtitle: t(invites(state) ? 'subtitle' : 'subtitle.plain'),
        actions: (
          <LinkButton href={RULES_URL} variant="ghost" iconEnd="external">
            {t('rules')}
          </LinkButton>
        ),
      }}
      notice={notice}
      faq={invites(state) ? { items } : undefined}
    >
      {state === 'token' ? <Body t={t} state={state} read={read} /> : <Writing t={t} state={state} read={read} />}
    </DetailPage>
  );
}

/** One instance of each write for the page: their held banners and the last note sit above whatever state shows. */
function Writing({ t, state, read }: { t: T; state: ReturnType<typeof readState>; read: ReturnType<typeof useMe> }) {
  const join = useJoin();
  const create = useCreateCode();
  const release = useReleaseCode();
  const [said, say] = useNote();
  const writes: Writes = { join, create, release, say };
  return (
    <Stack gap={6}>
      <HeldBanners t={t} join={join} create={create} release={release} />
      <NoteBanner t={t} said={said} onClose={() => say(null)} />
      <Body t={t} state={state} read={read} writes={writes} />
    </Stack>
  );
}

interface Writes {
  join: ReturnType<typeof useJoin>;
  create: ReturnType<typeof useCreateCode>;
  release: ReturnType<typeof useReleaseCode>;
  say: Say;
}

function Body({ t, state, read, writes }: { t: T; state: ReturnType<typeof readState>; read: ReturnType<typeof useMe>; writes?: Writes }): ReactNode {
  const go = useGo();
  const plans = usePageLink('billing');
  const { byId } = pageFaq(t);
  if (state === 'loading') return <Skeleton variant="detail" />;
  if (state === 'token') return <NoAccessState title={t('token.title')} body={t('token.body')} />;
  if (state === 'error' || !read.me) return <ErrorState title={t('error.title')} error={read.error} onRetry={read.refetch} retrying={read.isFetching} />;
  const me = read.me;
  const rate = me.ratePercent;
  // Before joining: the member grid with the Join card, what joining gives, and the level cards.
  if (state === 'notEligible' || state === 'paused' || state === 'canJoin') {
    const action =
      state === 'notEligible' ? (
        plans ? (
          <Button variant="primary" onPress={() => (plans.kind === 'hub' ? go(billing.plans) : followPageLink(plans, go))}>
            {t('first.seePlans')}
          </Button>
        ) : (
          <RulesButton t={t} />
        )
      ) : state === 'canJoin' ? (
        writes ? <JoinAction t={t} rate={rate} rateAnswer={byId.rate} join={writes.join} onNote={writes.say} /> : <RulesButton t={t} />
      ) : undefined;
    return <FirstUse t={t} me={me} state={state} action={action} />;
  }
  return <Enrolled t={t} me={me} state={state} onRefresh={read.refetch} writes={writes} />;
}

function RulesButton({ t }: { t: T }) {
  return (
    <LinkButton href={RULES_URL} iconEnd="external">
      {t('rules')}
    </LinkButton>
  );
}

function Enrolled({ t, me, state, onRefresh, writes }: { t: T; me: Me; state: ReturnType<typeof readState>; onRefresh: () => void; writes?: Writes }) {
  const area = codeArea(state, me);
  const w = writes;
  // The sections join the page's stack (Writing): the spacing between them is the kit's, never page CSS. Row A is
  // the 12-column grid; under 900 px its cards join the stack too.
  const cards: Record<(typeof ROW_A)[number], ReactNode> = {
    links: (
      <LinkCard
        t={t}
        me={me}
        copy={area.copy}
        noCustom={area.noCustom}
        release={w && area.release ? (code) => <ReleaseButton t={t} code={code} release={w.release} onNote={w.say} /> : undefined}
        form={w && area.form ? <CodeForm t={t} create={w.create} onNote={w.say} onGone={invalidateMe} /> : undefined}
      />
    ),
    credit: <CreditCard t={t} me={me} />,
  };
  // While earning, the levels are cards of their own; otherwise the plain tile (no cards, no encouragement).
  const sections: Record<(typeof SECTIONS)[number], ReactNode> = {
    levels: area.copy ? <Levels t={t} me={me} /> : <LevelTile t={t} me={me} />,
    people: <Counts t={t} me={me} />,
    monthly: <Monthly t={t} rows={me.monthly} onRefresh={onRefresh} />,
  };
  return (
    <>
      <div className={s.cols}>
        {ROW_A.map((k) => (
          <div key={k} className={k === 'links' ? s.span8 : s.span4}>
            {cards[k]}
          </div>
        ))}
      </div>
      {SECTIONS.map((k) => (
        <Fragment key={k}>{sections[k]}</Fragment>
      ))}
    </>
  );
}
