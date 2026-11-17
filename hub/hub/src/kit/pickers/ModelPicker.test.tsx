// ModelPicker: provider groups with one readiness word each, in the order a person picks from; only models that can be
// picked are rows, and one line under the list leads to setup; a search also finds a few models that need setup, and
// such a model never reaches onChange (it asks for setup, or is disabled with where to connect); tags; the list
// scrolls inside itself past maxRows; a 500-model catalogue narrows to exactly what the whole query matches.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ModelPicker, SETUP_MATCHES, type ModelChoice, type ModelPickerProps } from './ModelPicker';
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

const CAT: ModelChoice[] = [
  M('openai/gpt-x', 'GPT X', 'OpenAI', 'needs_key'),
  M('anthropic/claude-a', 'Claude A', 'Anthropic', 'ready'),
  M('mimo/m1', 'MiMo One', 'MiMo', 'unknown'),
  M('hoody-ai/hoody-free', 'Hoody Free', 'Hoody AI', 'ready', { recommended: true }),
  M('hoody-ai/hoody-plus', 'Hoody Plus', 'Hoody AI', 'ready'),
  M('fusion/duo', 'Duo', '', 'unknown', { source: 'fusion', providerId: 'fusion' }),
  M('deepseek/d1', 'Deep One', 'DeepSeek', 'ready'),
  M('anthropic/claude-a', 'Claude A again', 'Anthropic', 'ready'),
];

function Host(p: Partial<ModelPickerProps> & { start?: string; seen?: string[] }) {
  const { start = 'hoody-ai/hoody-free', seen, ...rest } = p;
  const [v, setV] = useState(start);
  return (
    <ModelPicker
      label="Model"
      models={CAT}
      value={v}
      onChange={(s) => {
        seen?.push(s);
        setV(s);
      }}
      {...rest}
    />
  );
}

describe('groupModels', () => {
  it('orders the current provider, Hoody AI, ready A-Z, can\'t tell, needs setup, ensembles; one row per spec', () => {
    const g = groupModels(CAT, 'mimo/m1');
    expect(g.map((x) => [x.id, x.ready])).toEqual([
      ['mimo', 'unknown'],
      ['hoody-ai', 'ready'],
      ['anthropic', 'ready'],
      ['deepseek', 'ready'],
      ['openai', 'needs_key'],
      ['fusion', 'unknown'],
    ]);
    expect(g.find((x) => x.id === 'anthropic')?.models.map((m) => m.label)).toEqual(['Claude A']);
    expect(g.find((x) => x.id === 'hoody-ai')?.models[0]?.spec).toBe('hoody-ai/hoody-free');
  });

  it('a provider with one ready model is Ready; all needing setup is Needs setup; anything else is Can\'t tell', () => {
    const mixed = groupModels([M('x/a', 'A', 'X', 'ready'), M('x/b', 'B', 'X', 'unknown'), M('y/a', 'A', 'Y', 'needs_key'), M('y/b', 'B', 'Y', 'unknown')], '');
    expect(Object.fromEntries(mixed.map((g) => [g.id, g.ready]))).toEqual({ x: 'ready', y: 'unknown' });
  });
});

describe('ModelPicker', () => {
  it('shows each provider with its readiness word, and the tags', () => {
    render(<Host defaultSpec="hoody-ai/hoody-free" fusion />);
    expect(screen.getByText('Hoody AI · Ready')).toBeInTheDocument();
    expect(screen.queryByText('OpenAI · Needs setup')).toBeNull();
    expect(screen.getByText('MiMo · Can\'t tell')).toBeInTheDocument();
    expect(screen.getByText(`${strings['mp.ensembles']} · Can't tell`)).toBeInTheDocument();
    expect(screen.getByText(`${strings['mp.current']} · ${strings['mp.default']} · ${strings['mp.recommended']}`)).toBeInTheDocument();
  });

  it('a ready model is picked at once', async () => {
    const seen: string[] = [];
    render(<Host seen={seen} />);
    await userEvent.click(screen.getByRole('radio', { name: /Claude A/ }));
    expect(seen).toEqual(['anthropic/claude-a']);
  });

  const search = (q: string) => userEvent.type(screen.getByRole('searchbox', { name: strings['mp.search'] }), q);

  it('a model that needs setup is not a row; one line under the list names the lone provider and sets it up', async () => {
    const onSetup = vi.fn();
    const onProviders = vi.fn();
    render(<Host onSetup={onSetup} onProviders={onProviders} />);
    expect(screen.queryByRole('radio', { name: /GPT X/ })).toBeNull();
    expect(screen.queryByText('Set up OpenAI to use this')).toBeNull();
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual([expect.stringContaining('Hoody Free'), expect.stringContaining('Hoody Plus'), expect.stringContaining('Claude A'), expect.stringContaining('Deep One'), expect.stringContaining('MiMo One')]);
    expect(screen.getByText('More models are available once you set up OpenAI.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Set up OpenAI' }));
    expect(onSetup.mock.calls[0]?.[0]).toMatchObject({ providerId: 'openai' });
    expect(onProviders).not.toHaveBeenCalled();
  });

  it('several providers need setup: the line stays one sentence and opens the provider setup', async () => {
    const onProviders = vi.fn();
    render(<Host models={[...CAT, M('google/g1', 'Gem One', 'Google', 'needs_key')]} onSetup={() => {}} onProviders={onProviders} />);
    expect(screen.getByText(strings['mp.more'])).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Gem One/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['mp.moreAction'] }));
    expect(onProviders).toHaveBeenCalledTimes(1);
  });

  it('a disabled picker with a reason keeps the line\'s action a keyboard stop that says why and does nothing', async () => {
    const onSetup = vi.fn();
    const onProviders = vi.fn();
    const many = [...CAT, M('google/g1', 'Gem One', 'Google', 'needs_key')];
    const { unmount } = render(<Host models={many} onSetup={onSetup} onProviders={onProviders} isDisabled disabledReason="Change the model when this reply ends." />);
    const all = screen.getByRole('button', { name: strings['mp.moreAction'] });
    expect(all).toHaveAttribute('aria-disabled', 'true');
    expect(all).not.toBeDisabled();
    all.focus();
    expect(document.activeElement).toBe(all);
    expect(all).toHaveAccessibleDescription('Change the model when this reply ends.');
    await userEvent.click(all);
    expect(onProviders).not.toHaveBeenCalled();
    unmount();
    // The lone-provider form of the line is held the same way.
    render(<Host onSetup={onSetup} isDisabled disabledReason="Change the model when this reply ends." />);
    const one = screen.getByRole('button', { name: 'Set up OpenAI' });
    expect(one).toHaveAttribute('aria-disabled', 'true');
    expect(one).toHaveAccessibleDescription('Change the model when this reply ends.');
    one.focus();
    expect(document.activeElement).toBe(one);
    await userEvent.click(one);
    expect(onSetup).not.toHaveBeenCalled();
  });

  it('nothing needs setup: no line', () => {
    render(<Host models={CAT.filter((m) => m.ready !== 'needs_key')} onProviders={() => {}} />);
    expect(screen.queryByText(strings['mp.more'])).toBeNull();
    expect(screen.queryByRole('button', { name: strings['mp.moreAction'] })).toBeNull();
  });

  it('a search finds a model that needs setup; picking it asks for setup of its provider and never picks it', async () => {
    const seen: string[] = [];
    const onSetup = vi.fn();
    render(<Host seen={seen} onSetup={onSetup} />);
    await search('gpt');
    expect(screen.getByText(strings['mp.needsSetup'])).toBeInTheDocument();
    expect(screen.getByText('Set up OpenAI to use this')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /GPT X/ }));
    expect(onSetup).toHaveBeenCalledTimes(1);
    expect(onSetup.mock.calls[0]?.[0]).toMatchObject({ spec: 'openai/gpt-x', providerId: 'openai' });
    expect(seen).toEqual([]);
    await userEvent.clear(screen.getByRole('searchbox', { name: strings['mp.search'] }));
    expect(screen.queryByRole('radio', { name: /GPT X/ })).toBeNull();
    expect(screen.getByRole('radio', { name: /Hoody Free/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('without a setup step a found row is disabled and says where to connect', async () => {
    const seen: string[] = [];
    render(<Host seen={seen} />);
    await search('gpt');
    const row = screen.getByRole('radio', { name: /GPT X/ });
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Connect OpenAI on the AI page to use this')).toBeInTheDocument();
    await userEvent.click(row);
    expect(seen).toEqual([]);
  });

  it('a search by provider name finds its models that need setup, with or without a setup step', async () => {
    const models = [...CAT, M('mimo2/flash', 'Flash Two', 'Xiaomi MiMo', 'needs_key')];
    const { unmount } = render(<Host models={models} />);
    await search('Xiaomi');
    expect(screen.getByRole('radio', { name: /Flash Two/ })).toHaveAttribute('aria-disabled', 'true');
    unmount();
    render(<Host models={models} onSetup={vi.fn()} />);
    await search('Xiaomi');
    expect(screen.getByRole('radio', { name: /Flash Two/ })).toBeInTheDocument();
  });

  it('a search shows at most SETUP_MATCHES models that need setup, after the ones that can be picked, and counts the rest', async () => {
    const many = [...CAT, ...Array.from({ length: 12 }, (_, i) => M(`openai/gpt-${i}`, `GPT ${i}`, 'OpenAI', 'needs_key')), M('deepseek/gpt-like', 'GPT like', 'DeepSeek', 'ready')];
    render(<Host models={many} onSetup={() => {}} />);
    await search('gpt');
    const rows = screen.getAllByRole('radio');
    expect(rows[0]).toHaveTextContent('GPT like');
    expect(rows).toHaveLength(1 + SETUP_MATCHES);
    expect(screen.getByText(`${13 - SETUP_MATCHES} more matches need setup first.`)).toBeInTheDocument();
    // The tally counts what is drawn, never "n of m" over a list that changes with the search.
    expect(screen.getByRole('status')).toHaveTextContent(`${1 + SETUP_MATCHES} shown`);
  });

  it('the current model stays a row when its provider lost its connection, and "Current" stays on what runs', () => {
    render(<ModelPicker label="Model" models={CAT} value="anthropic/claude-a" current="openai/gpt-x" onChange={() => {}} onSetup={() => {}} />);
    const cur = screen.getByRole('radio', { name: /GPT X/ });
    expect(cur).toHaveTextContent(strings['mp.current']);
    expect(cur).toHaveAttribute('aria-checked', 'false');
    const picked = screen.getByRole('radio', { name: /Claude A/ });
    expect(picked).toHaveAttribute('aria-checked', 'true');
    expect(picked).not.toHaveTextContent(strings['mp.current']);
  });

  it('every model needs setup: says none is ready and keeps the line', () => {
    render(<ModelPicker label="Model" models={[M('openai/gpt-x', 'GPT X', 'OpenAI', 'needs_key')]} value="" onChange={() => {}} onSetup={() => {}} />);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByText(strings['mp.noneReady'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set up OpenAI' })).toBeInTheDocument();
  });

  it('many ready models: the list is capped and scrolls inside itself; the search and the line stay outside it', () => {
    const ready = Array.from({ length: 40 }, (_, i) => M(`deepseek/d-${i}`, `Deep ${i}`, 'DeepSeek', 'ready'));
    render(<ModelPicker label="Model" models={[...ready, M('openai/gpt-x', 'GPT X', 'OpenAI', 'needs_key'), M('google/g1', 'Gem One', 'Google', 'needs_key')]} value="" onChange={() => {}} onProviders={() => {}} />);
    const list = screen.getByRole('radiogroup');
    expect(list).toHaveAttribute('data-capped');
    expect(within(list).getAllByRole('radio')).toHaveLength(40);
    expect(list).not.toContainElement(screen.getByRole('searchbox'));
    expect(list).not.toContainElement(screen.getByRole('button', { name: strings['mp.moreAction'] }));
  });

  it('a short list is not capped', () => {
    render(<Host />);
    expect(screen.getByRole('radiogroup')).not.toHaveAttribute('data-capped');
  });

  it('a failed readiness read keeps the rows and offers Retry', async () => {
    const onRetry = vi.fn();
    render(<Host status={{ error: new Error('x'), onRetry }} />);
    expect(screen.getByRole('radio', { name: /Claude A/ })).toBeInTheDocument();
    expect(screen.getByText(strings['mp.error'])).toBeInTheDocument();
  });

  it('loading shows no rows; an empty catalogue says so', () => {
    const { unmount } = render(<ModelPicker label="Model" models={undefined} value="" onChange={() => {}} />);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    unmount();
    render(<ModelPicker label="Model" models={[]} value="" onChange={() => {}} />);
    expect(screen.getByText(strings['mp.empty'])).toBeInTheDocument();
  });

  it('narrows 500 models to exactly what the whole query matches, also by provider name', async () => {
    const P = ['openai', 'anthropic', 'google', 'mistral', 'deepseek', 'xai', 'meta', 'qwen', 'cohere', 'mimo'];
    const big: ModelChoice[] = Array.from({ length: 500 }, (_, i) => {
      const p = P[i % P.length] as string;
      return M(`${p}/model-${i}`, `Model ${p} ${i}`, p.toUpperCase(), i % 3 ? 'needs_key' : 'ready');
    });
    render(<ModelPicker label="Model" models={big} value="" onChange={() => {}} onSetup={() => {}} />);
    const box = screen.getByRole('searchbox', { name: strings['mp.search'] });
    await userEvent.type(box, 'model mimo 19');
    const list = screen.getByRole('radiogroup');
    expect(within(list).getByText('Model mimo 19')).toBeInTheDocument();
    expect(within(list).getByText('Model mimo 219')).toBeInTheDocument();
    expect(within(list).queryByText('Model mimo 109')).toBeNull();
    await userEvent.clear(box);
    await userEvent.type(box, 'qwen');
    // 16 ready qwen models, then the first few that need setup.
    expect(within(screen.getByRole('radiogroup')).getAllByRole('radio')).toHaveLength(16 + SETUP_MATCHES);
  });
});
