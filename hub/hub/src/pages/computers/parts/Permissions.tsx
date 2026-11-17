// Permissions tab of a computer: who can reach it, in one place. First who can open its programs through their web
// addresses (AccessDrawer.tsx: the verdict, the choice, people and key links, the project's rules); then who can manage it
// (its project's people); its realms; a reminder that the firewall is a separate gate, with one step to it; and how
// access works. The tab is always listed; a session that may not read access rules is told so instead of a failed read.
import { useCan } from '@core';
import { AnatomySection, Band, Link, useStrings, Verdict, Why } from '@kit';
import { pageFaq } from '../faq';
import { access as accessOf } from '../logic';
import pageStrings from '../strings.en.json';
import type { Computer, Project } from '../types';
import { AccessPanel, listedWord } from './AccessDrawer';
import strings from './AccessDrawer.strings.en.json';
import { DOCS_PERMISSIONS } from './Bits.pure';
import { PermissionsFirewall } from './PermissionsFirewall';
import { PartStack } from './PartBits';
import { PermissionsProject } from './PermissionsProject';

export function Permissions({ c, projects, onRealms }: {
  c: Computer;
  projects: Project[] | undefined;
  /** Opens the computer's Realms drawer; absent when realms can't be changed here. */
  onRealms?: (() => void) | undefined;
}) {
  const t = useStrings(strings);
  const tp = useStrings(pageStrings);
  // The API reads a computer's rules only for a credential that may manage them (resources.proxy_aliases): without
  // it nothing is sent.
  const canAccess = useCan('resources.proxy_aliases');
  // Both traffic gates first (who may open the addresses, then the firewall), then who manages the computer.
  return (
    <PartStack>
      {canAccess ? (
        <AccessPanel key={c.id} c={c} />
      ) : (
        <>
          <Verdict label={t('acc.verdict')} next={t('perm.why.listed')}>
            {listedWord(accessOf(c).state, tp, t)}
          </Verdict>
          <AnatomySection id="perm-who" title={t('perm.who.title')} description={t('acc.lede')} notices={<Band size="table" /* noDetails: what this sign-in may do, not a rejection */>{t('perm.cant')}</Band>} state={{ kind: 'ready' }} />
        </>
      )}
      <PermissionsFirewall c={c} />
      <PermissionsProject key={`p:${c.id}`} c={c} projects={projects} onRealms={onRealms} />
      <Why question={t('perm.how.title')} faq={{ item: pageFaq(tp).byId.whoCanOpen, label: t('acc.adv.more') }}>
        {t('perm.how.short')} <Link href={DOCS_PERMISSIONS}>{t('perm.how.docs')}</Link>
      </Why>
    </PartStack>
  );
}
