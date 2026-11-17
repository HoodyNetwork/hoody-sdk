// ModelBrowser while the catalogue loads: only what is real shows, the Agent's default and the held
// model, under "Checking models…". The fallback rows are for a settled failure, never for loading.
import { providers } from '@core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { evidence7k } from './fixtures/evidence7k';
import { ModelBrowser, type ModelBrowserProps } from './ModelBrowser';

const FREE = 'hoody-ai/hoody-free';
const HELD = 'openai/gpt-5';
const MANY = Array.from({ length: 40 }, (_, i) => ({ spec: `aion-labs/aion-${i}`, label: `aion-labs/aion-${i}` }));
const FALLBACK = [{ spec: FREE, label: 'Hoody Free' }, { spec: HELD, label: 'GPT-5' }, ...MANY];

function Host(p: Partial<ModelBrowserProps>) {
  return (
    <ModelBrowser
      evidence={null}
      computerName="atlas"
      value=""
      rules={providers.rulesFor('bot', { inherit: true, fallback: FALLBACK.map((r) => r.spec) })}
      fallback={FALLBACK}
      purpose="bot"
      onChoose={() => undefined}
      onSetup={() => undefined}
      onOtherWay={() => undefined}
      onRetry={() => undefined}
      {...p}
    />
  );
}

const names = () => screen.queryAllByRole('option').map((o) => o.textContent);

// Both shapes of "not read yet": no evidence (every first read) and a loading part.
describe.each([
  ['no evidence yet', null],
  ['a loading catalogue', evidence7k('loading')],
] as const)('while loading (%s)', (_name, evidence) => {
  it('says it is checking, as the heading, and never "Ready to use"', () => {
    render(<Host evidence={evidence} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Checking models…' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ready to use' })).toBeNull();
    expect(screen.getAllByText('Checking models…')).toHaveLength(1);
  });

  it('shows no fallback row and no "Can\'t tell" words, only the Agent\'s default', () => {
    render(<Host evidence={evidence} />);
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: /^Agent's default/ })).toBeInTheDocument();
    expect(screen.queryByText(/Can't tell/)).toBeNull();
    expect(screen.queryByRole('group', { name: /Can't tell/ })).toBeNull();
  });

  it('with a held model, shows it after the Agent\'s default, named, current and checking', () => {
    render(<Host evidence={evidence} value={HELD} />);
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(names()[0]).toMatch(/^Agent's default/);
    const held = screen.getByRole('option', { name: /^GPT-5 Current Checking/ });
    expect(held).toHaveAttribute('aria-selected', 'true');
    expect(held).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByText(/Can't tell/)).toBeNull();
    expect(screen.queryByRole('group', { name: /Can't tell/ })).toBeNull();
  });

  it('shows a held model the fallback list does not hold', () => {
    render(<Host evidence={evidence} value="mistral/not-in-the-list" />);
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('with no default offered and nothing held, shows no list at all', () => {
    render(<Host evidence={evidence} rules={providers.rulesFor('bot', { fallback: FALLBACK.map((r) => r.spec) })} />);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'Checking models…' })).toBeInTheDocument();
  });

  it('pressing the held model chooses nothing; the Agent\'s default still chooses', async () => {
    const onChoose = vi.fn();
    render(<Host evidence={evidence} value={HELD} onChoose={onChoose} />);
    await userEvent.click(screen.getByRole('option', { name: /^GPT-5/ }));
    expect(onChoose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('option', { name: /^Agent's default/ }));
    expect(onChoose).toHaveBeenCalledTimes(1);
  });

  it('search typed now shows the wait, never "no results"', async () => {
    render(<Host evidence={evidence} value={HELD} />);
    await userEvent.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByRole('heading', { level: 3, name: 'Checking models…' })).toBeInTheDocument();
    expect(screen.queryByText(/No models match|No results|zzz/)).toBeNull();
    expect(document.querySelector('[data-skeleton]')).not.toBeNull();
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('a held Hoody AI spec with no name to show reads the neutral word and never its spec', () => {
    const held = 'hoody-ai/upstream';
    render(<Host evidence={evidence} value={held} />);
    expect(screen.getByRole('option', { name: /^A model Current Checking/ })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/upstream/i);
  });

  it('a caller\'s label for the held model passes the rule for Hoody AI names', () => {
    const spec = 'hoody-ai/x-upstream';
    render(<Host evidence={evidence} value={spec} fallback={[{ spec, label: 'Upstream Fast' }]} />);
    expect(screen.getByRole('option', { name: /^A model Current Checking/ })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/upstream/i);
  });

  it('a held bare Claude Code keeps its own name; a held Claude model is named for itself', () => {
    const { unmount } = render(<Host evidence={evidence} value="claude-code" />);
    expect(screen.getByRole('option', { name: /^Claude Code default Current Checking/ })).toBeInTheDocument();
    unmount();
    render(<Host evidence={evidence} value="claude-code/opus" fallback={[{ spec: 'claude-code/opus', label: 'Opus' }]} />);
    expect(screen.getByRole('option', { name: /^Opus Current Checking/ })).toBeInTheDocument();
  });
});

describe('after the read', () => {
  it('a settled failure keeps every fallback row, under "Can\'t tell yet", usable with consent', async () => {
    const onChoose = vi.fn();
    render(<Host evidence={evidence7k('catalogueFailed')} onChoose={onChoose} />);
    const group = screen.getByRole('group', { name: /^Can't tell yet/ });
    const shown = within(group).getAllByRole('option').map((o) => o.getAttribute('data-spec'));
    expect(new Set(shown)).toEqual(new Set(FALLBACK.map((r) => r.spec)));
    expect(screen.getByText(`Showing ${FALLBACK.length + 1} of ${FALLBACK.length + 1}`)).toBeInTheDocument();
    expect(screen.queryByText('Checking models…')).toBeNull();
    await userEvent.click(screen.getByRole('option', { name: /^GPT-5/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Use it anyway' }));
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ spec: HELD, readiness: 'unknown', consent: true }));
  });

  it('search typed when the read has failed shows the failure and its rows, never an endless wait', async () => {
    render(<Host evidence={evidence7k('catalogueFailed')} />);
    await userEvent.type(screen.getByRole('searchbox'), 'gpt');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^GPT-5/ })).toBeInTheDocument();
  });

  it('the answer replaces the wait: "Ready to use" and the real list, no reload', () => {
    const { rerender } = render(<Host evidence={null} value={FREE} />);
    expect(screen.getAllByRole('option')).toHaveLength(2);
    rerender(<Host evidence={evidence7k('freeOnly')} value={FREE} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Ready to use' })).toBeInTheDocument();
    expect(screen.queryByText('Checking models…')).toBeNull();
    expect(screen.getByRole('option', { name: /^Hoody Free.*Current/ })).toBeInTheDocument();
  });

  it('real unknown models after a good read keep their Can\'t tell words', () => {
    render(<Host evidence={evidence7k('readyReadFailed')} />);
    expect(screen.getAllByRole('group', { name: /Can't tell yet/ }).length).toBeGreaterThan(0);
  });

  it('a failed read, another computer, its failure: the rows go for the wait and come back', () => {
    const { rerender } = render(<Host evidence={evidence7k('catalogueFailed')} />);
    expect(screen.getAllByRole('option').length).toBeGreaterThan(2);
    rerender(<Host evidence={null} />);
    expect(screen.getAllByRole('option')).toHaveLength(1);
    rerender(<Host evidence={evidence7k('catalogueFailed')} />);
    expect(screen.getAllByRole('option').length).toBeGreaterThan(2);
  });

  it('a search typed during the wait is kept and answered when the read settles', async () => {
    const { rerender } = render(<Host evidence={null} />);
    await userEvent.type(screen.getByRole('searchbox'), 'zzzz');
    rerender(<Host evidence={evidence7k('freeOnly')} />);
    expect(screen.getByRole('searchbox')).toHaveValue('zzzz');
    expect(await screen.findByText(/zzzz/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Checking models…' })).toBeNull();
  });

  it('a Hoody AI model in Hoody\'s own form, supplied with its name, stays on screen', () => {
    const spec = 'hoody-ai/hoody-fast';
    render(<Host value={spec} fallback={[{ spec, label: 'Hoody Fast' }]} />);
    expect(screen.getByRole('option', { name: /^Hoody Fast Current Checking/ })).toBeInTheDocument();
  });

  it('a supplied label for any other Hoody AI model shows the neutral word, never the label or the spec', () => {
    const spec = 'hoody-ai/upstream';
    render(<Host value={spec} fallback={[{ spec, label: 'upstream' }]} />);
    expect(screen.getByRole('option', { name: /^A model Current Checking/ })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/upstream/i);
  });

  it('a computer change with a drill-in open waits, says no wrong "no results", and returns to it', async () => {
    const { rerender } = render(<Host evidence={evidence7k('threeReady')} />);
    await userEvent.click(screen.getByRole('button', { name: 'All 88 OpenAI models' }));
    expect(screen.getByRole('heading', { level: 3, name: 'OpenAI' })).toBeInTheDocument();
    rerender(<Host evidence={null} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Checking models…' })).toBeInTheDocument();
    expect(screen.queryByText(/No model or provider matches/)).toBeNull();
    expect(screen.getAllByRole('option')).toHaveLength(1);
    rerender(<Host evidence={evidence7k('threeReady')} />);
    expect(screen.getByRole('heading', { level: 3, name: 'OpenAI' })).toBeInTheDocument();
  });

  it('a computer change with the Directory open waits, then returns to it', async () => {
    const { rerender } = render(<Host evidence={evidence7k('freeOnly')} />);
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    expect(screen.getByRole('heading', { level: 3, name: 'Set up a provider' })).toBeInTheDocument();
    rerender(<Host evidence={null} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Checking models…' })).toBeInTheDocument();
    expect(document.querySelector('[data-skeleton]')).not.toBeNull();
    rerender(<Host evidence={evidence7k('freeOnly')} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Set up a provider' })).toBeInTheDocument();
  });

  it('Back works during the wait: a drill-in from Ready goes back to the wait, and the settled list follows', async () => {
    const { rerender } = render(<Host evidence={evidence7k('threeReady')} />);
    await userEvent.click(screen.getByRole('button', { name: 'All 88 OpenAI models' }));
    const label = screen.getByRole('button', { name: /back/i }).textContent;
    rerender(<Host evidence={null} />);
    const back = screen.getByRole('button', { name: /back/i });
    expect(back.textContent).toBe(label);
    await userEvent.click(back);
    expect(screen.queryByRole('button', { name: /back/i })).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'Checking models…' })).toHaveFocus();
    rerender(<Host evidence={evidence7k('threeReady')} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Ready to use' })).toBeInTheDocument();
  });

  it('Back works during the wait from the Directory too, with the same label', async () => {
    const { rerender } = render(<Host evidence={evidence7k('freeOnly')} />);
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    const label = screen.getByRole('button', { name: /back/i }).textContent;
    rerender(<Host evidence={null} />);
    const back = screen.getByRole('button', { name: /back/i });
    expect(back.textContent).toBe(label);
    await userEvent.click(back);
    rerender(<Host evidence={evidence7k('freeOnly')} />);
    expect(screen.queryByRole('heading', { level: 3, name: 'Set up a provider' })).toBeNull();
  });

  it('a page change earlier does not pull focus onto the held row when a computer change starts the wait', async () => {
    const { rerender } = render(<Host evidence={evidence7k('manyReady')} value={HELD} />);
    const nav = screen.getByRole('navigation', { name: 'Ready to use pages' });
    await userEvent.click(within(nav).getByRole('button', { name: 'Next' }));
    (document.activeElement as HTMLElement | null)?.blur();
    rerender(<Host evidence={null} value={HELD} />);
    expect(document.activeElement).toBe(document.body);
  });
});
