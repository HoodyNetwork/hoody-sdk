// The Skills and "Build your own" sections: what a skill is, every way to install it, how to check and
// update it, how to watch the Hub's own HTTP calls, and a dashboard built by an agent.
// hoody.com is pointed at the platform the Hub runs on. Each part is a
// kit SubSection (a title, one sentence, its block), so the two long sections read as short steps. Build ends with the
// one-file Hub and its download, drawn only where this Hoody has the file (core hubFileUrl).
import { CodeBlock, Disclosure, Notice, PageLinkTo, StaticTable, SubSection, usePageLink, useStrings, type AnyAction, type CodeLine } from '@kit';
import { cliCommand, currentPlatformHosts, platformText } from '@kit';
import { hubFileUrl } from '@core';
import { useMemo } from 'react';
import { links as keys } from '../../keys/links';
import strings from '../strings.en.json';
import { links } from '../links';
import { Section } from './Sections';
import { saveHubFile } from './hubFile';
import s from './guide.module.css';

const SKILL_URL = 'npx skills add https://hoody.com/SKILLS/SKILL.md';
const SKILL_REPO = 'npx skills add HoodyNetwork/hoody-sdk';

/** The agents `npx skills -a` names, with where each keeps a skill (skills 1.7.4 docs/agents.md). */
const AGENTS: readonly (readonly [agent: string, project: string, global: string])[] = [
  ['claude-code', '.claude/skills/', '~/.claude/skills/'],
  ['codex', '.agents/skills/', '~/.agents/skills/'],
  ['cursor', '.agents/skills/', '~/.cursor/skills/'],
  ['gemini-cli', '.agents/skills/', '~/.gemini/skills/'],
  ['github-copilot', '.agents/skills/', '~/.copilot/skills/'],
  ['opencode', '.agents/skills/', '~/.config/opencode/skills/'],
];

const CURL = 'curl -H "Authorization: Bearer $HOODY_TOKEN" https://api.hoody.com/api/v1/computers/';
// The CLI line's arguments; kit cliCommand names the platform only when it is not the CLI's default.
const CLI_ARGS = 'computers list';
const SDK = "import { HoodyClient } from 'hoody-sdk';\nconst hoody = new HoodyClient({ baseURL: 'https://api.hoody.com', token: process.env.HOODY_TOKEN });\nconst computers = await hoody.api.computers.list();";

/** "Open the Keys page" as a sub-section link, while this load serves the Keys page. */
function useKeysAction(id: string): readonly [AnyAction] | undefined {
  const t = useStrings(strings);
  return usePageLink('keys') ? [{ id, label: t('skills.keysLink'), href: keys.list }] : undefined;
}

export function SkillsSection() {
  const t = useStrings(strings);
  const hosts = useMemo(() => currentPlatformHosts(), []);
  const keysLink = useKeysAction('skills-keys');
  const install: CodeLine[] = [
    { caption: t('skills.cap.url'), code: platformText(SKILL_URL, hosts) },
    { caption: t('skills.cap.repo'), code: SKILL_REPO },
    { caption: t('skills.cap.oneAgent'), code: `${SKILL_REPO} -a claude-code -y` },
    { caption: t('skills.cap.global'), code: `${SKILL_REPO} -g` },
  ];
  return (
    <Section id="skills" title={t('skills.title')} lede={t('skills.lede')} note={t('skills.builtIn')}>
      {/* Static rows written here: always whole, never loading. */}
      <SubSection title={t('skills.install')} description={t('skills.installBody')} state={{ kind: 'ready' }}>
        <CodeBlock label={t('skills.install')} lines={install} prompt lang="shell" footer={t('skills.node')} />
        <Notice level="warn">
          {t('skills.review')}
        </Notice>
        <Disclosure title={t('skills.agents')} description={t('skills.agentsMore')}>
          <StaticTable
            label={t('skills.agents')}
            mono
            columns={[
              { id: 'agent', label: t('skills.col.agent') },
              { id: 'project', label: t('skills.col.project') },
              { id: 'global', label: t('skills.col.global') },
            ]}
            rows={AGENTS.map(([agent, project, global]) => ({ id: agent, cells: [agent, project, global] }))}
          />
        </Disclosure>
      </SubSection>

      <SubSection title={t('skills.check')} description={t('skills.checkBody')}>
        <CodeBlock
          label={t('skills.check')}
          lines={[
            { caption: t('skills.cap.list'), code: 'npx skills list' },
            { caption: t('skills.cap.listGlobal'), code: 'npx skills list -g' },
            { caption: t('skills.cap.ask'), code: t('skills.prompt') },
          ]}
          lang="plain" // reason: the last line is an English prompt, so no line is coloured as a command
        />
      </SubSection>

      <SubSection title={t('skills.update')} description={t('skills.updateBody')}>
        <CodeBlock
          label={t('skills.update')}
          lines={[
            { caption: t('skills.cap.check'), code: 'npx skills check' },
            { caption: t('skills.cap.update'), code: 'npx skills update' },
            { caption: t('skills.cap.again'), code: platformText(SKILL_URL, hosts) },
          ]}
          prompt
          lang="shell"
        />
      </SubSection>

      <SubSection title={t('skills.signIn')} description={t('skills.signInBody')} actions={keysLink ? { secondary: keysLink } : undefined} />
    </Section>
  );
}

export function BuildSection() {
  const t = useStrings(strings);
  const hosts = useMemo(() => currentPlatformHosts(), []);
  const keysLink = useKeysAction('build-keys');
  const file = hubFileUrl();
  return (
    <Section id="build" title={t('build.title')} lede={t('build.lede')}>
      <SubSection title={t('build.see')} description={t('build.find')}>
        <ol className={s.steps}>
          <li>{t('build.step1')}</li>
          <li>{t('build.step2')}</li>
          <li>{t('build.step3')}</li>
        </ol>
        <Notice level="warn" icon="lock">
          {t('build.token')}
        </Notice>
      </SubSection>

      <SubSection title={t('build.same')} description={t('build.sameBody')} actions={keysLink ? { secondary: keysLink } : undefined}>
        <CodeBlock
          label={t('build.same')}
          lines={[
            { caption: t('build.cap.curl'), code: platformText(CURL, hosts), lang: 'shell' },
            { caption: t('build.cap.cli'), code: cliCommand(CLI_ARGS, hosts), lang: 'shell' },
            { caption: t('build.cap.sdk'), code: platformText(SDK, hosts), lang: 'ts' },
            { caption: t('build.cap.agent'), code: t('skills.prompt') },
          ]}
          lang="plain" // reason: the last line is an English prompt for the agent; the others name their own lang
        />
      </SubSection>

      <SubSection title={t('build.dashboard')}>
        <ol className={s.steps}>
          <li>
            {t('build.d1')} <PageLinkTo href={links.section('skills')} variant="inline">{t('build.skillsLink')}</PageLinkTo>
          </li>
          <li>
            {t('build.d2')}
            <CodeBlock lines={[{ code: ['export HOODY_TOKEN=', { placeholder: t('build.yourKey') }] }]} label={t('build.d2.label')} placeholderReason={t('build.d2.reason')} prompt lang="shell" />
          </li>
          <li>
            {t('build.d3')}
            <CodeBlock lines={[{ code: t('build.prompt') }]} label={t('build.d3.label')} lang="plain" // reason: the dashboard prompt to paste into the agent
            />
          </li>
          <li>{t('build.d4')}</li>
          <li>{t('build.d5')}</li>
        </ol>
      </SubSection>

      {file ? (
        <SubSection
          title={t('build.file')}
          description={t('build.fileBody')}
          actions={{ secondary: [{ id: 'build-file', label: t('build.fileGet'), name: t('build.fileGetName'), icon: 'download', onPress: () => saveHubFile(file) }] }}
        />
      ) : null}
    </Section>
  );
}
