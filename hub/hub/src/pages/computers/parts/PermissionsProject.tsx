// Permissions tab, the Project block: who can manage the computer (its project's owner and the people the project is
// shared with, by level), whether the project has access rules of its own, and how many realms the computer is in.
// Read only: people and the project's rules are changed in the project's own Permissions (Projects), realms in the
// computer's Realms drawer.
import { useCan, useCore } from '@core';
import { type ActionSpec, AnatomySection, Band, Facts, useGo, useStrings, type Fact } from '@kit';
import { useAccessScope, useMembers } from '../data';
import { links } from '../links';
import pageStrings from '../strings.en.json';
import type { Computer, Project } from '../types';
import { projectRulesOf } from './access.logic';
import strings from './AccessDrawer.strings.en.json';
import { levelCounts } from './ProjectPerms';
import { myLevel, peopleOf, rosterWhole } from './projectPerms.logic';

export function PermissionsProject({ c, projects, onRealms }: { c: Computer; projects: Project[] | undefined; onRealms?: (() => void) | undefined }) {
  const t = useStrings(strings);
  const tp = useStrings(pageStrings);
  const go = useGo();
  const account = useCan('account');
  const uid = useCore().account;
  const project = projects?.find((p) => p.id === c.project_id) ?? null;
  // The member list is the project's (base host): never read on a key session, which the API refuses.
  const roster = useMembers(project ?? undefined, account && project !== null);
  const mine = project ? myLevel(project, roster.data, uid) : 'unknown';
  const people = roster.data ? peopleOf(roster.data) : undefined;
  const peopleWords = !account ? t('perm.project.people.key')
    : roster.isError || roster.fetchStatus === 'paused' ? t('perm.project.people.failed')
    : !roster.data || !people ? t('perm.project.people.reading')
    : people.length === 0 ? (rosterWhole(roster.data) ? t('perm.project.people.none') : tp('pp.fact.people.uncounted'))
    : `${tp(rosterWhole(roster.data) ? 'pp.fact.people' : 'pp.fact.peopleAtLeast', { count: people.length })}: ${levelCounts(people, tp)}`;
  // The list row may be older than a project rule: with a sign-in that reads rules, the fresh answer the access part
  // reads is the one shown here too (one read, shared), and a rule the row saw still counts.
  const reads = useCan('resources.proxy_aliases');
  const scope = useAccessScope(c.id, reads);
  const listed = projectRulesOf(c.proxy_permissions_scope);
  const has = listed === 'yes' || !reads ? listed : scope.isError || scope.fetchStatus === 'paused' ? 'unknown' : (scope.data ?? listed);
  const realms = (c.realm_ids ?? []).length;
  const items: Fact[] = [
    ...(project
      ? [
          { label: t('perm.project.name'), value: project.name },
          { label: t('perm.project.owner'), value: t(mine === 'owner' ? 'perm.project.owner.you' : project.owner ? 'perm.project.owner.other' : 'perm.project.owner.unknown') },
          ...(mine === 'read' || mine === 'edit' || mine === 'delete' ? [{ label: t('perm.project.you'), value: mine === 'read' ? tp('pp.lvl.read') : mine === 'edit' ? tp('pp.lvl.edit') : tp('pp.lvl.delete') }] : []),
          { label: t('perm.project.people'), value: peopleWords },
          { label: t('perm.project.rules'), value: has === 'yes' ? t('perm.project.rules.yes') : has === 'no' ? t('perm.project.rules.no') : t('perm.project.rules.unknown') },
        ]
      : []),
    { label: t('perm.realms.title'), value: realms === 0 ? t('perm.realms.none') : t('perm.realms.count', { count: realms }) },
  ];
  const actions: ActionSpec[] = [
    ...(project ? [{ id: 'open-projects', label: t('perm.project.open'), icon: 'chevron-right' as const, onPress: () => go(links.projects) }] : []),
    ...(onRealms ? [{ id: 'manage-realms', label: t('perm.realms.manage'), opens: 'dialog' as const, onPress: onRealms }] : []),
  ];
  return (
    <AnatomySection
      id="perm-project"
      title={t('perm.project.title')}
      description={t('perm.project.lede', { name: c.name })}
      {...(actions.length === 2 ? { actions: { secondary: [actions[0]!, actions[1]!] as const } } : actions.length === 1 ? { actions: { secondary: [actions[0]!] as const } } : {})}
      {...(projects && !project ? { notices: <Band size="table" /* noDetails: the project is not in this list, not a rejection */>{t('perm.project.missing')}</Band> } : {})}
      state={projects ? { kind: 'ready' } : { kind: 'loading', rows: 3 }}
    >
      <Facts items={items} columns={2} label={t('perm.project.title')} />
    </AnatomySection>
  );
}
