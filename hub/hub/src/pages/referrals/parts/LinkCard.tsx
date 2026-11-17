// Your links: every row has the same three columns, [code + kind] [link] [action], so each link box, the new-code
// field and the action column start and end at one x (page.spec.ts measures it). The main link comes first with the
// page's one primary button, Copy link; custom codes follow, each with its Copy inside the box and Retire… in the
// action column, then the create row. The counter reads in plain words from the code list and vanity_codes_left. The
// card says what a code is and who becomes a referral; custom codes are "Your own codes" with "{n} of 3
// active"; the rule line gives the 3 and 10 limits, that a retired code still counts, and what is refused. The page
// never says "release". Share material (the media kit link) closes the card, only while there is a link to share.
// The card says what a code is in one line under its title; who becomes a referral (the long rule paragraph) is its
// note, after the codes, so the main link and Copy link come first (above them, at 80x24 the paragraph would fill the
// first screen and leave the link on its last row). The link is the API's own, shown byte for byte; a blocked code has no link and no Copy. While
// the account does not earn (Earning paused, Removed) the codes are listed alone: no box, Copy, Retire or form.
// The card says what a code is in one line under its title; who becomes a referral (the long rule paragraph) is its
// note, after the codes, so the main link and Copy link come first (above them, at 80x24 the paragraph would fill the
// first screen and leave the link on its last row).
import { AnatomySection, CopyButton, CopyField, ExtLink, RowNote, StatusPill, SubSection, Tag } from '@kit';
import type { ReactNode } from 'react';
import { MEDIA_KIT_URL } from '../links';
import { CODE_RULES_URL, type Code, type Me } from '../logic';
import s from './parts.module.css';
import type { T } from './types';

function CodeRow({ t, c, copy, main, action }: { t: T; c: Code; copy: boolean; main: boolean; action?: ReactNode }) {
  const blocked = c.state === 'blocked';
  return (
    <li className={s.row}>
      <span className={s.code}>
        <code className={s.codeText} translate="no">
          {c.code}
        </code>
        <Tag tip={t(main ? 'tip.code.main' : 'tip.code.custom')}>{t(main ? 'code.main' : 'code.custom')}</Tag>
        {blocked && <StatusPill tone="warn">{t('code.blocked')}</StatusPill>}
      </span>
      {blocked ? (
        <span className={s.link}>
          <RowNote>{t('code.blockedNote')}</RowNote>
        </span>
      ) : (
        copy && c.link && (
          <span className={s.link}>
            <CopyField value={c.link} copyName={t('link.copyCode', { code: c.code })} noCopy={main} />
          </span>
        )
      )}
      {action && <span className={s.actions}>{action}</span>}
    </li>
  );
}

export function LinkCard({ t, me, copy, noCustom, release, form }: { t: T; me: Me; copy: boolean; noCustom: boolean; release?: (code: string) => ReactNode; form?: ReactNode }) {
  const mains = me.codes.filter((c) => c.kind !== 'vanity');
  const customs = me.codes.filter((c) => c.kind === 'vanity');
  const active = customs.filter((c) => c.state === 'active').length;
  const now = active === 0 ? t('codes.noneActive') : t('codes.active', { count: active });
  // The Custom codes line: none left → the unavailable words, after "3 of 3 active" when all 3 are active (the active cap;
  // the listing can't show the lifetime count, so no "retire one" promise); else how many are active and how many more.
  const none = active >= 3 ? t('codes.unavailableFull', { active: now }) : t('codes.unavailable');
  const counter = !copy ? undefined : noCustom ? none : me.vanityLeft !== null && me.vanityLeft > 0 ? t('codes.counter', { active: now, count: me.vanityLeft }) : now;
  const mainCopy = (c: Code) =>
    copy && c.link && c.state !== 'blocked' ? <CopyButton variant="primary" text={c.link} label={t('link.copyMain')} /> : undefined;
  // Share material (the media kit) shows only with something to share: the account copies links and a code has one.
  const media = copy && me.codes.some((c) => c.link && c.state !== 'blocked');
  return (
    <AnatomySection
      id="referral-link"
      title={copy ? t('link.title') : t('link.codes')}
      description={copy ? t('link.share') : undefined}
      note={copy ? t('link.intro') : undefined}
      state={{ kind: 'ready' }}
    >
      <div className={s.links}>
        {me.codes.length === 0 && <p className={`${s.p} ${s.muted}`}>{t('code.none')}</p>}
        {mains.length > 0 && (
          <SubSection id="referral-main" title={t('link.main')} description={copy ? t('link.mainNote') : undefined} state={{ kind: 'ready' }}>
            <ul className={s.codes} aria-label={t('link.main')}>
              {mains.map((c) => (
                <CodeRow key={c.code} t={t} c={c} copy={copy} main action={mainCopy(c)} />
              ))}
            </ul>
          </SubSection>
        )}
        {(customs.length > 0 || form || noCustom) && (
          <SubSection id="referral-custom" title={t('link.custom')} description={counter} state={{ kind: 'ready' }}>
            {customs.length > 0 && (
              <ul className={s.codes} aria-label={t('link.custom')}>
                {customs.map((c) => (
                  <CodeRow key={c.code} t={t} c={c} copy={copy} main={false} action={release && c.state === 'active' ? release(c.code) : undefined} />
                ))}
              </ul>
            )}
            {form && <div className={s.create}>{form}</div>}
            {copy && (
              <p className={`${s.p} ${s.muted} ${s.small}`}>
                {t('codes.rule.limits')} {t('codes.rule.retired')} {t('codes.rule.refused')} <ExtLink url={CODE_RULES_URL}>{t('codes.limits')}</ExtLink>
              </p>
            )}
          </SubSection>
        )}
        {media && (
          <SubSection id="referral-media" title={t('media.title')} description={t('media.help')} state={{ kind: 'ready' }}>
            <ExtLink url={MEDIA_KIT_URL}>{t('media.link')}</ExtLink>
          </SubSection>
        )}
      </div>
    </AnatomySection>
  );
}
