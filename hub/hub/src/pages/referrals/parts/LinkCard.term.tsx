// Your links in the terminal: the web card's codes, links, counter and rules (LinkCard.tsx), drawn with prims. A code row
// is the code with its kind (and Blocked), then its link box or the blocked note, then its action, wrapping as a whole when
// the pane is narrow. The link is the API's own, byte for byte; a blocked code has no link and no Copy.
import { AnatomySection, CopyButton, CopyField, ExtLink, RowNote, StatusPill, SubSection, Tag } from '@kit';
import { Box, Text } from '@term/prim';
import type { ReactNode } from 'react';
import { MEDIA_KIT_URL } from '../links';
import { CODE_RULES_URL, type Code } from '../logic';
import type * as Web from './LinkCard';
import type { T } from './types';

function CodeRow({ t, c, copy, main, action }: { t: T; c: Code; copy: boolean; main: boolean; action?: ReactNode }) {
  const blocked = c.state === 'blocked';
  return (
    <Box dir="row" wrap gap={2} shrink={0}>
      <Box dir="row" wrap gap={1} shrink={0}>
        <Text bold>{c.code}</Text>
        <Tag tip={t(main ? 'tip.code.main' : 'tip.code.custom')}>{t(main ? 'code.main' : 'code.custom')}</Tag>
        {blocked && <StatusPill tone="warn">{t('code.blocked')}</StatusPill>}
      </Box>
      {blocked ? (
        <RowNote>{t('code.blockedNote')}</RowNote>
      ) : (
        copy &&
        c.link && (
          <Box dir="row" grow={1} shrink={1} minWidth={0}>
            <CopyField value={c.link} copyName={t('link.copyCode', { code: c.code })} noCopy={main} />
          </Box>
        )
      )}
      {action && <Box dir="row" shrink={0}>{action}</Box>}
    </Box>
  );
}

export const LinkCard: typeof Web.LinkCard = ({ t, me, copy, noCustom, release, form }) => {
  const mains = me.codes.filter((c) => c.kind !== 'vanity');
  const customs = me.codes.filter((c) => c.kind === 'vanity');
  const active = customs.filter((c) => c.state === 'active').length;
  const now = active === 0 ? t('codes.noneActive') : t('codes.active', { count: active });
  const none = active >= 3 ? t('codes.unavailableFull', { active: now }) : t('codes.unavailable');
  const counter = !copy ? undefined : noCustom ? none : me.vanityLeft !== null && me.vanityLeft > 0 ? t('codes.counter', { active: now, count: me.vanityLeft }) : now;
  const mainCopy = (c: Code) =>
    copy && c.link && c.state !== 'blocked' ? <CopyButton variant="primary" text={c.link} label={t('link.copyMain')} /> : undefined;
  // Share material, as on the web: only while the account copies links and a code has one.
  const media = copy && me.codes.some((c) => c.link && c.state !== 'blocked');
  return (
    <AnatomySection
      id="referral-link"
      title={copy ? t('link.title') : t('link.codes')}
      description={copy ? t('link.share') : undefined}
      // Who becomes a referral is the card's note, after the codes (as on the web): at 80x24 the main link and Copy link
      // stay well inside the first screen (first-screen.term.test.tsx).
      note={copy ? t('link.intro') : undefined}
      state={{ kind: 'ready' }}
    >
      {/* No gap here: each SubSection already opens with its own blank row, so one blank row parts the groups. */}
      <Box dir="column" shrink={0}>
        {me.codes.length === 0 && <Text colour="muted">{t('code.none')}</Text>}
        {mains.length > 0 && (
          <SubSection id="referral-main" title={t('link.main')} description={copy ? t('link.mainNote') : undefined} state={{ kind: 'ready' }}>
            <Box dir="column" gap={1} shrink={0}>
              {mains.map((c) => (
                <CodeRow key={c.code} t={t} c={c} copy={copy} main action={mainCopy(c)} />
              ))}
            </Box>
          </SubSection>
        )}
        {(customs.length > 0 || form || noCustom) && (
          <SubSection id="referral-custom" title={t('link.custom')} description={counter} state={{ kind: 'ready' }}>
            {/* One blank row between the codes already made and the form that makes a new one. */}
            <Box dir="column" gap={1} shrink={0}>
              {customs.length > 0 && (
                <Box dir="column" gap={1} shrink={0}>
                  {customs.map((c) => (
                    <CodeRow key={c.code} t={t} c={c} copy={copy} main={false} action={release && c.state === 'active' ? release(c.code) : undefined} />
                  ))}
                </Box>
              )}
              {form}
            </Box>
            {copy && (
              <Box dir="row" wrap gap={1} shrink={0}>
                <Text colour="muted">{`${t('codes.rule.limits')} ${t('codes.rule.retired')} ${t('codes.rule.refused')}`}</Text>
                <ExtLink url={CODE_RULES_URL}>{t('codes.limits')}</ExtLink>
              </Box>
            )}
          </SubSection>
        )}
        {media && (
          <SubSection id="referral-media" title={t('media.title')} description={t('media.help')} state={{ kind: 'ready' }}>
            <ExtLink url={MEDIA_KIT_URL}>{t('media.link')}</ExtLink>
          </SubSection>
        )}
      </Box>
    </AnatomySection>
  );
};
