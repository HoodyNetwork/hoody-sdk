// An agent's overview: its model, tools, skills and MCP tools in words; its name, place and
// description are the detail page's header (AgentsView). The model is a setting row with Change model (Model.tsx);
// the reasoning effort a setting row with its levels inline (Effort.tsx); the rest are
// read-only facts. Product-owned agents say they are read-only except their model: their effort stays a fact.
import { Facts, Icon, SettingGroup, useStrings, type Fact } from '@kit';
import type { AgentRow, NameList } from './logic';
import { AgentEffortRow } from './Effort';
import { AgentModel } from './Model';
import { toolsLong } from './words';
import s from './agents.module.css';
import strings from './strings.en.json';

export interface AgentOverviewProps {
  agent: AgentRow;
  /** A model change was read back as saved: the host reads the agents list again. */
  onModelSaved?: () => void;
  /** An effort change was read back as saved: the host reads the agents list again. */
  onEffortSaved?: () => void;
}

export function AgentOverview({ agent, onModelSaved, onEffortSaved }: AgentOverviewProps) {
  const t = useStrings(strings);
  const join = (l: readonly string[]) => l.join(', ');
  const nameList = (l: NameList, every: string, none: string) => (l === null ? every : l.length ? join(l) : none);
  // Without an mcp_tools key a strict agent gets no MCP tools and any other agent every connected one.
  const mcp = agent.mcpTools === null && agent.strict ? t('ov.mcpNone') : nameList(agent.mcpTools, t('ov.mcpEvery'), t('ov.mcpNone'));
  // Skills reach an agent only through the skill tool. The list the agent reports names it, or the Hub cannot tell:
  // the tools an absent or narrower list resolves to are the daemon's policy (strict defaults, widening), never
  // re-derived here. Named: without a skills key a chat gets every enabled skill and a spawned helper none.
  const skillTool = agent.tools !== null && agent.tools.includes('skill');
  const skills = skillTool ? nameList(agent.skills, t('ov.skillsEvery'), t('ov.skillsNone')) : t('ov.skillsDepend');
  const facts: Fact[] = [
    ...(agent.productOwned ? [{ label: t('ov.effort'), value: agent.effort || t('ov.effortUnset') }] : []),
    { label: t('ov.turns'), value: agent.maxTurns === null ? t('ov.turnsUnset') : String(agent.maxTurns) },
    { label: t('ov.tools'), value: toolsLong(t, agent) },
    { label: t('ov.toolsMode'), value: agent.strict ? t('tools.strict') : t('tools.base') },
    { label: t('ov.skills'), value: skills },
    { label: t('ov.mcp'), value: mcp },
    ...(agent.labels.length ? [{ label: t('ov.labels'), value: join(agent.labels) }] : []),
    { label: t('ov.file'), value: agent.path || t('ov.fileNone'), mono: !!agent.path, wide: true, ...(agent.path ? { copy: agent.path } : {}) },
  ];
  const advisories = [
    ...(agent.unknownTools.length ? [t('ov.unknownTools', { list: join(agent.unknownTools) })] : []),
    ...(agent.unknownSkills.length ? [t('ov.unknownSkills', { list: join(agent.unknownSkills) })] : []),
    ...(agent.missingVsDefault.length ? [t('ov.missing', { name: agent.name, list: join(agent.missingVsDefault) })] : []),
  ];
  return (
    <article className={s.overview} aria-label={agent.name}>
      {(agent.isDefault || agent.productOwned) && (
        <header className={s.head}>
          {agent.isDefault && <p className={s.note}>{t('ov.default')}</p>}
          {agent.productOwned && (
            <p className={s.note}>
              <Icon name="lock" size="sm" /> {t('ov.owned')}
            </p>
          )}
        </header>
      )}
      <SettingGroup>
        <AgentModel agent={agent} onSaved={onModelSaved} />
        <AgentEffortRow agent={agent} onSaved={onEffortSaved ?? onModelSaved} />
      </SettingGroup>
      <Facts items={facts} label={t('ov.facts')} />
      {advisories.length > 0 && (
        <section className={s.advisory} aria-label={t('ov.advisory')}>
          <h3 className={s.groupHead}>{t('ov.advisory')}</h3>
          <ul>
            {advisories.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
