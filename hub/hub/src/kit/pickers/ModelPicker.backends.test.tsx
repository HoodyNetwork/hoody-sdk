// ModelPicker backends: ensembles show only where the caller says they run, and Claude Code rows form one group of
// their own after the providers, in the agent's order, with their own readiness word and setup.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ModelPicker, type ModelChoice } from './ModelPicker';
import { groupModels } from './modelPickerLogic';
import strings from './ModelPicker.strings.en.json';

const M = (spec: string, label: string, providerLabel: string, ready: ModelChoice['ready'], extra: Partial<ModelChoice> = {}): ModelChoice => ({
  spec,
  label,
  providerId: spec.split('/')[0] as string,
  providerLabel,
  ready,
  source: 'provider',
  ...extra,
});
const C = (spec: string, label: string, ready: ModelChoice['ready']): ModelChoice => M(spec, label, 'Claude Code', ready, { providerId: 'claude-code', source: 'claude_code' });

const CAT: ModelChoice[] = [
  C('claude-code', 'Claude default', 'ready'),
  C('claude-code/sonnet', 'Sonnet', 'ready'),
  C('claude-code/haiku', 'Haiku', 'ready'),
  M('fusion/duo', 'Duo', '', 'ready', { source: 'fusion', providerId: 'fusion' }),
  M('openai/gpt-x', 'GPT X', 'OpenAI', 'needs_key'),
  M('hoody-ai/hoody-free', 'Hoody Free', 'Hoody AI', 'ready', { recommended: true }),
];

describe('groupModels with Claude Code', () => {
  it('puts Claude Code after the providers and before ensembles, keeping the agent\'s order', () => {
    const g = groupModels(CAT, 'hoody-ai/hoody-free');
    expect(g.map((x) => x.id)).toEqual(['hoody-ai', 'openai', 'claude-code', 'fusion']);
    expect(g.find((x) => x.id === 'claude-code')?.models.map((m) => m.label)).toEqual(['Claude default', 'Sonnet', 'Haiku']);
  });

  it('Claude Code rows never join a provider group of the same id', () => {
    const g = groupModels([M('anthropic/claude-a', 'Claude A', 'Anthropic', 'needs_key'), { ...C('claude-code', 'Claude default', 'ready'), providerId: 'anthropic' }], '');
    expect(g.map((x) => [x.id, x.ready])).toEqual([['anthropic', 'needs_key'], ['claude-code', 'ready']]);
  });

  it('the group holding the current model still comes first', () => {
    expect(groupModels(CAT, 'claude-code/haiku')[0]?.id).toBe('claude-code');
  });
});

describe('ModelPicker backends', () => {
  it('hides ensembles unless the caller says they run here', () => {
    const { unmount } = render(<ModelPicker label="Model" models={CAT} value="hoody-ai/hoody-free" onChange={() => {}} />);
    expect(screen.queryByRole('radio', { name: /Duo/ })).toBeNull();
    expect(screen.queryByText(new RegExp(strings['mp.ensembles']))).toBeNull();
    unmount();
    render(<ModelPicker label="Model" models={CAT} value="hoody-ai/hoody-free" onChange={() => {}} fusion />);
    expect(screen.getByRole('radio', { name: /Duo/ })).toBeInTheDocument();
  });

  it('a Claude Code model is picked by its spec', async () => {
    const onChange = vi.fn();
    render(<ModelPicker label="Model" models={CAT} value="hoody-ai/hoody-free" onChange={onChange} />);
    expect(screen.getByText('Claude Code · Ready')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Sonnet/ }));
    expect(onChange).toHaveBeenCalledWith('claude-code/sonnet');
  });

  it('Claude Code that needs setup asks for setup and is never picked', async () => {
    const onChange = vi.fn();
    const onSetup = vi.fn();
    render(<ModelPicker label="Model" models={[C('claude-code', 'Claude default', 'needs_key'), CAT[5] as ModelChoice]} value="hoody-ai/hoody-free" onChange={onChange} onSetup={onSetup} />);
    // Not a row until searched for; the line under the list names Claude Code and sets it up.
    expect(screen.queryByRole('radio', { name: /Claude default/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Set up Claude Code' }));
    expect(onSetup.mock.calls[0]?.[0]).toMatchObject({ spec: 'claude-code', source: 'claude_code' });
    await userEvent.type(screen.getByRole('searchbox'), 'claude');
    await userEvent.click(screen.getByRole('radio', { name: /Claude default/ }));
    expect(onSetup.mock.calls[1]?.[0]).toMatchObject({ spec: 'claude-code', source: 'claude_code' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
