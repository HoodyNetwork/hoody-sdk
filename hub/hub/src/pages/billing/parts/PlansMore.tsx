// The lower sections of the Plans view, under the Compare plans table: what every plan includes, what Free gives, who
// runs the hardware and who to write to. Each is one kit section card (its title in the card's head, its facts inside),
// so the tab ends in the same framed blocks it starts with. The words are the website's pricing page, as facts in the Hub's own sections.
// Nothing here is a price or a limit copied from the website: the plan names, their prices and the free server's
// computers are the page's own reads, and where a read has no value the sentence goes without the number. Nothing
// here buys or sends anything: the plan cards and the Bare metal band above hold the actions. The website's code
// examples (developer calls) are not shown.
import { AnatomySection, Disclosure, type Fact, Facts, Link, Row, Stack } from '@kit';
import { useMemo } from 'react';
import { useFreeServer, usePlans } from '../data';
import { comparison, priceShort } from '../logic';
import { DOCS, SITE, planPrices } from '../plans-compare-logic';
import type { T } from './Bits';

export function PlansMore({ t }: { t: T }) {
  const plans = usePlans();
  const free = useFreeServer();
  // A failed read names no plan and no price, even one an earlier read had (as the cards above).
  const cmp = useMemo(() => (plans.data && !plans.isError ? comparison(plans.data) : null), [plans.data, plans.isError]);
  const freeMax = free.data?.max ?? null;

  const names = [t('plans.free'), ...(cmp?.plans ?? []).map((p) => p.title).filter(Boolean), t('plans.bareMetal')];
  const all: Fact[] = [
    { label: t('plans.more.all.plans'), value: names.join(' · ') },
    { label: t('plans.more.all.tools'), value: t('plans.more.all.toolsBody') },
    { label: t('plans.more.all.vms'), value: t('plans.more.all.vmsBody') },
    { label: t('plans.more.all.sites'), value: t('plans.more.all.sitesBody') },
  ];
  const bot: Fact[] = [
    { label: t('plans.more.bot.people'), value: t('plans.more.bot.peopleBody') },
    { label: t('plans.more.bot.agents'), value: t('plans.more.bot.agentsBody') },
    { label: t('plans.more.bot.with'), value: t('plans.more.bot.withBody') },
    { label: t('plans.more.bot.why'), value: t('plans.more.bot.whyBody') },
  ];
  const ssh: Fact[] = [
    { label: t('plans.more.ssh.key'), value: t('plans.more.ssh.keyBody') },
    { label: t('plans.more.ssh.browser'), value: t('plans.more.ssh.browserBody') },
    { label: t('plans.more.ssh.cli'), value: t('plans.more.ssh.cliBody') },
    { label: t('plans.more.ssh.none'), value: t('plans.more.ssh.noneBody') },
  ];

  // The plans' own prices from the catalogue; with none read the sentence is only the one about paid AI.
  const prices = planPrices(cmp).map((p) => t('plans.more.free.growPlan', p));
  const grow = prices.length > 0 ? `${prices.join('; ')}. ${t('plans.more.free.growAi')}` : t('plans.more.free.growAi');
  // The sections' opening lines are their first facts: the page keeps one line of explanation above the fold (what
  // every plan includes), the rest reads as label and value.
  const freeFacts: Fact[] = [
    { label: t('plans.free'), value: t('plans.more.free.lede'), wide: true },
    // The free server's own count when the Hub read it, else the row without a number.
    { label: freeMax !== null && freeMax > 0 ? t('plans.more.free.computers', { count: freeMax }) : t('buy.resComputers'), value: t('plans.more.free.computersBody') },
    { label: t('plans.more.free.shared'), value: t('plans.more.free.sharedBody') },
    { label: t('plans.more.free.versions'), value: t('plans.more.free.versionsBody') },
    { label: t('plans.more.free.ai'), value: t('plans.more.free.aiBody') },
    { label: t('col.price'), value: t('plans.more.free.priceBody', { price: priceShort(0) }) },
    { label: t('plans.more.free.grow'), value: grow },
    { label: t('plans.more.free.yours'), value: t('plans.more.free.yoursBody'), wide: true },
  ];
  const howFree: Fact[] = [
    { label: t('plans.more.free.who'), value: t('plans.more.free.whoBody') },
    { label: t('plans.more.free.hardware'), value: t('plans.more.free.hardwareBody') },
    { label: t('plans.more.free.limits'), value: t('plans.more.free.limitsBody') },
    { label: t('plans.more.free.processes'), value: t('plans.more.free.processesBody') },
    { label: t('plans.more.free.email'), value: t('plans.more.free.emailBody') },
    { label: t('plans.more.free.backups'), value: t('plans.more.free.backupsBody') },
    { label: t('plans.more.free.idle'), value: t('plans.more.free.idleBody') },
    { label: t('plans.more.free.zip'), value: t('plans.more.free.zipBody') },
    { label: t('plans.more.free.closure'), value: t('plans.more.free.closureBody') },
    {
      label: t('plans.more.readMore'),
      wide: true,
      value: (
        <Row gap={3} wrap>
          <Link href={DOCS.servers} variant="nav">
            {t('plans.more.link.docsServers')}
          </Link>
          <Link href={DOCS.files} variant="nav">
            {t('plans.more.link.docsFiles')}
          </Link>
          <Link href={SITE.terms} variant="nav">
            {t('plans.more.link.freeTerms')}
          </Link>
        </Row>
      ),
    },
  ];

  const infra: Fact[] = [
    { label: t('plans.hardware'), value: t('plans.more.infra.lede'), wide: true },
    { label: t('buy.resComputers'), value: t('plans.more.infra.computersBody') },
    { label: t('plans.more.infra.sites'), value: t('plans.more.infra.sitesBody') },
    { label: t('plans.more.infra.storage'), value: t('plans.more.infra.storageBody') },
    { label: t('plans.more.infra.kit'), value: t('plans.more.infra.kitBody') },
    { label: t('plans.more.infra.heavier'), value: t('plans.more.infra.heavierBody') },
    { label: t('plans.more.infra.payment'), value: t('plans.more.infra.paymentBody') },
    {
      label: t('plans.more.readMore'),
      wide: true,
      value: (
        <Row gap={3} wrap>
          <Link href={SITE.infrastructure} variant="nav">
            {t('plans.more.link.infrastructure')}
          </Link>
          <Link href={DOCS.computers} variant="nav">
            {t('plans.more.link.docsComputers')}
          </Link>
          <Link href={DOCS.domains} variant="nav">
            {t('plans.more.link.docsDomains')}
          </Link>
          <Link href={DOCS.storage} variant="nav">
            {t('plans.more.link.docsStorage')}
          </Link>
          <Link href={DOCS.kit} variant="nav">
            {t('plans.more.link.docsKit')}
          </Link>
          <Link href={DOCS.billing} variant="nav">
            {t('plans.more.link.docsBilling')}
          </Link>
        </Row>
      ),
    },
  ];

  const trust: Fact[] = [
    { label: t('plans.more.trust.managed'), value: t('plans.more.trust.managedBody'), wide: true },
    { label: t('plans.more.trust.encryption'), value: t('plans.more.trust.encryptionBody'), wide: true },
    { label: t('plans.more.trust.support'), value: t('plans.more.trust.supportMail'), copy: t('plans.more.trust.supportMail') },
    { label: t('plans.more.trust.billing'), value: t('plans.more.trust.billingMail'), copy: t('plans.more.trust.billingMail') },
    { label: t('plans.more.trust.company'), value: t('plans.more.trust.companyName') },
    {
      label: t('plans.more.readMore'),
      wide: true,
      value: (
        <Row gap={3} wrap>
          <Link href={SITE.terms} variant="nav">
            {t('plans.more.link.terms')}
          </Link>
          <Link href={SITE.privacy} variant="nav">
            {t('plans.more.link.privacy')}
          </Link>
          <Link href={SITE.aup} variant="nav">
            {t('plans.more.link.aup')}
          </Link>
          <Link href={SITE.subprocessors} variant="nav">
            {t('plans.more.link.subprocessors')}
          </Link>
          <Link href={DOCS.servers} variant="nav">
            {t('plans.more.link.docsServers')}
          </Link>
          <Link href={DOCS.security} variant="nav">
            {t('plans.more.link.docsSecurity')}
          </Link>
        </Row>
      ),
    },
  ];

  return (
    <>
      {/* What every plan includes, Free too: the one line of it (the same facts on every account), then what runs
          inside a computer, and the two explanations the line's last words need. */}
      <AnatomySection id="all-plans" title={t('plans.more.all.title')} description={t('plans.includes')}>
        <Stack gap={3}>
          <Facts items={all} columns={2} label={t('plans.more.all.title')} />
          <Disclosure title={t('plans.more.bot.title')} description={t('plans.more.bot.lede')}>
            <Facts items={bot} columns={1} label={t('plans.more.bot.title')} />
          </Disclosure>
          <Disclosure title={t('plans.more.ssh.title')} description={t('plans.more.ssh.lede')}>
            <Facts items={ssh} columns={1} label={t('plans.more.ssh.title')} />
          </Disclosure>
        </Stack>
      </AnatomySection>
      <AnatomySection id="free-limits" title={t('plans.more.free.title')}>
        <Stack gap={3}>
          <Facts items={freeFacts} columns={2} label={t('plans.more.free.title')} />
          <Disclosure title={t('plans.more.free.how')} description={t('plans.more.free.howLede')}>
            <Facts items={howFree} columns={1} label={t('plans.more.free.how')} />
          </Disclosure>
        </Stack>
      </AnatomySection>
      <AnatomySection id="infrastructure" title={t('plans.more.infra.title')}>
        <Facts items={infra} columns={2} label={t('plans.more.infra.title')} />
      </AnatomySection>
      <AnatomySection id="trust" title={t('plans.more.trust.title')}>
        <Facts items={trust} columns={2} label={t('plans.more.trust.title')} />
      </AnatomySection>
    </>
  );
}
