// agentChoices: an ensemble with a Claude Code member follows the Claude read for that member, as
// readinessOf does; without a Claude read the catalogue's membership decides.
import { describe, expect, it } from 'vitest';
import { catalogue } from '../providers/catalogue';
import { agentChoices } from './choices';
import type { ClaudeSet } from './types';

const NAMES = { model: 'Model', provider: 'Provider', claude: 'Claude Code', claudeDefault: 'Default' };
const cat = catalogue({
  providers: { providers: [{ id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', status: { state: 'ready', via: 'included' } }] },
  models: { models: [{ spec: 'hoody-ai/hoody-free' }, { spec: 'fusion/hc', source: 'fusion', members: ['hoody-ai/hoody-free', 'claude-code/opus'] }] },
  ready: { models: [{ spec: 'hoody-ai/hoody-free' }, { spec: 'fusion/hc' }] },
});
const set = (state: ClaudeSet['state'], ids = ['opus']): ClaudeSet => ({ state, models: ids.map((id) => ({ id, label: id })), efforts: [] });
const hc = (claude: ClaudeSet | null) => agentChoices({ cat, claude, names: NAMES, fusion: true }).find((c) => c.spec === 'fusion/hc')?.ready;

describe('agentChoices: ensembles with a Claude Code member', () => {
  it('ready when listed and the Claude read has the member ready, or when there is no Claude read', () => {
    expect(hc(set('ready'))).toBe('ready');
    expect(hc(null)).toBe('ready');
  });
  it('needs setup when the Claude read shows the member needs setup, is absent, or does not list its model', () => {
    expect(hc(set('setup'))).toBe('needs_key');
    expect(hc(set('absent'))).toBe('needs_key');
    expect(hc(set('ready', ['sonnet']))).toBe('needs_key');
  });
});
