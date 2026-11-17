// Vitest: github-installer is a product agent like bot and script-writer. Its sessions start only
// from Apps' "From GitHub", so the Hub never offers it as a chat's agent nor keeps it as a remembered pick, and its source reads
// under its display name (read-only on its page because its list row says Hoody owns it).
import { describe, expect, it } from 'vitest';
import { agent } from '@core';
import sourceStrings from './agents/Source.strings.en.json';
import { parseRemembered } from './new/logic';

describe('github-installer is a product agent', () => {
  it('is never a chat\'s agent and never a remembered pick', () => {
    expect(agent.PRODUCT_AGENTS).toContain('github-installer');
    expect(parseRemembered({ agent: { kind: 'other', name: 'github-installer' }, approvals: 'default', runsWith: 'hoody' }).agent).toBeNull(); // no pick: the computer's default agent
    // Another agent's name still is.
    expect(parseRemembered({ agent: { kind: 'other', name: 'reviewer' }, approvals: 'default', runsWith: 'hoody' }).agent).toEqual({ kind: 'other', name: 'reviewer' });
  });

  // Read-only on the agent's page comes from its list row (productOwned), not from this name: Source.test.tsx.
  it('is named "GitHub repo installer"', () => {
    const key = agent.AGENT_LABELS['github-installer'];
    expect(key).toBe('agent.githubInstaller');
    expect(key && sourceStrings[key]).toBe('GitHub repo installer');
    expect(agent.AGENT_LABELS.bot).toBeUndefined();
  });
});
