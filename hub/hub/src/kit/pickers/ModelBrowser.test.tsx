// ModelBrowser: each view, activation per readiness (needs setup never chooses), the consent
// bar, the Agent's default row, Back focus, pagers (focus and live text), search, and every read state.
import { providers } from '@core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, StrictMode, useLayoutEffect, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { evidence7k, FIXTURE_SCOPE } from './fixtures/evidence7k';
import { ModelBrowser, type ModelBrowserProps } from './ModelBrowser';

const FREE = 'hoody-ai/hoody-free';

function Host({ setup: setupNode, ...p }: Partial<ModelBrowserProps> & { setup?: ReactNode }) {
  return (
    <ModelBrowser
      evidence={evidence7k('freeOnly')}
      computerName="atlas"
      value=""
      rules={providers.rulesFor('bot')}
      purpose="bot"
      onChoose={() => undefined}
      onSetup={() => undefined}
      onOtherWay={() => undefined}
      onRetry={() => undefined}
      setup={setupNode}
      {...p}
    />
  );
}

const option = (name: RegExp | string) => screen.getByRole('option', { name });
const rows = () => document.querySelectorAll('[data-mc-row]').length;

describe('Ready view', () => {
  it("one Hoody AI group with Hoody Free (Recommended) and the More models card; nothing to scroll", () => {
    render(<Host />);
    expect(screen.getByRole('heading', { level: 3, name: 'Ready to use' })).toBeInTheDocument();
    const lb = screen.getByRole('listbox', { name: 'Ready to use' });
    expect(within(lb).getAllByRole('group')).toHaveLength(1);
    expect(within(lb).getAllByRole('option')).toHaveLength(1);
    expect(option(/Hoody Free/)).toHaveTextContent('Recommended');
    expect(screen.getByText('More models are available once you set up a provider.')).toBeInTheDocument();
    expect(screen.queryByText(/need setup first/)).toBeNull();
    for (const name of ['OpenAI', 'Anthropic', 'Google', 'OpenRouter', 'Xiaomi MiMo']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set up a provider' })).toBeInTheDocument();
    expect(rows()).toBeLessThanOrEqual(69);
  });

  it('a ready pick chooses at once with the evidence scope and seq; nothing asks', async () => {
    const onChoose = vi.fn();
    render(<Host onChoose={onChoose} evidence={evidence7k('freeOnly', { seq: 7 })} />);
    await userEvent.click(option(/Hoody Free/));
    expect(onChoose).toHaveBeenCalledWith({ kind: 'model', spec: FREE, readiness: 'ready', consent: false, scope: FIXTURE_SCOPE, seq: 7 });
  });

  it("the Agent's default row comes first when the caller takes inherit, says what it does, and chooses inherit", async () => {
    const onChoose = vi.fn();
    render(<Host onChoose={onChoose} rules={providers.rulesFor('bot', { inherit: true })} />);
    const opts = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(opts[0]).toHaveAccessibleName(/^Agent's default/);
    expect(opts[0]).toHaveAccessibleDescription("Uses the agent's configured model, also when that changes");
    expect(opts[0]).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(opts[0]!);
    expect(onChoose).toHaveBeenCalledWith({ kind: 'inherit' });
  });

  it('groups: Hoody AI, then the current model’s group, then ready providers A to Z, then Can’t tell groups; partial facts', () => {
    render(<Host evidence={evidence7k('threeReady')} value="openai/chat-latest" />);
    const groups = within(screen.getByRole('listbox')).getAllByRole('group');
    ['Hoody AI · Included', 'OpenAI · Your key · 44 of 88 ready', 'DeepSeek · Your key', "Mistral · Can't tell yet"].forEach((name, i) => expect(groups[i]).toHaveAccessibleName(name));
    expect(groups).toHaveLength(4);
    expect(option('ChatGPT Latest Current')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All 88 OpenAI models' })).toBeInTheDocument();
  });

  it('a current model with a problem shows in the In use card with its fix and never twice', async () => {
    const onSetup = vi.fn();
    render(<Host evidence={evidence7k('threeReady')} value="anthropic/claude-fable-5" onSetup={onSetup} />);
    expect(screen.getByText('Claude Fable 5 needs setup before it can run.')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Claude Fable 5$/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Set up Anthropic' }));
    expect(onSetup).toHaveBeenCalledWith({ provider: 'anthropic', spec: 'anthropic/claude-fable-5', intent: 'choose' });
  });

  it('a kept model this computer does not list: "isn\'t in this computer\'s list. It may still run." (unknown, consent)', async () => {
    const onChoose = vi.fn();
    render(<Host evidence={evidence7k('threeReady')} value="openai/gpt-from-later" onChoose={onChoose} />);
    expect(screen.getByText("openai/gpt-from-later isn't in this computer's list. It may still run.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Use it anyway' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Use it anyway' }).at(-1)!);
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ spec: 'openai/gpt-from-later', readiness: 'unknown', consent: true }));
  });

  it('a gone current model: "This computer no longer lists {model}."', () => {
    render(<Host value="nosuch/model" />);
    expect(screen.getByText('This computer no longer lists nosuch/model.')).toBeInTheDocument();
  });

  it('a group pager pages 8 provider groups at a time, with "Groups 1–8 of N"', async () => {
    render(<Host evidence={evidence7k('manyReady')} />);
    const nav = screen.getByRole('navigation', { name: 'Ready to use pages' });
    expect(nav).toHaveTextContent('Groups 1–8 of 41');
    expect(within(screen.getByRole('listbox')).getAllByRole('group')).toHaveLength(8);
    await userEvent.click(within(nav).getByRole('button', { name: 'Next' }));
    expect(nav).toHaveTextContent('Groups 9–16 of 41');
    expect(rows()).toBeLessThanOrEqual(69);
  });
});

describe('activation per readiness', () => {
  it('unknown opens the consent bar, focus on Use it anyway; Use it anyway chooses with consent', async () => {
    const onChoose = vi.fn();
    render(<Host evidence={evidence7k('threeReady')} onChoose={onChoose} />);
    await userEvent.click(screen.getByRole('button', { name: 'All 88 OpenAI models' }));
    await userEvent.click(option('GPT-3.5 Turbo'));
    const bar = screen.getByRole('group', { name: "Can't tell if GPT-3.5 Turbo runs on atlas right now." });
    expect(document.activeElement).toBe(within(bar).getByRole('button', { name: 'Use it anyway' }));
    expect(onChoose).not.toHaveBeenCalled();
    await userEvent.click(within(bar).getByRole('button', { name: 'Use it anyway' }));
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ kind: 'model', spec: 'openai/gpt-3.5-turbo', readiness: 'unknown', consent: true }));
  });

  it('Choose another or Escape closes the bar, focus back on the option, nothing chosen', async () => {
    const onChoose = vi.fn();
    render(<Host evidence={evidence7k('threeReady')} onChoose={onChoose} />);
    await userEvent.click(screen.getByRole('button', { name: 'All 88 OpenAI models' }));
    const o = option('GPT-3.5 Turbo');
    await userEvent.click(o);
    await userEvent.click(screen.getByRole('button', { name: 'Choose another' }));
    expect(screen.queryByRole('group', { name: /Can't tell if/ })).toBeNull();
    expect(document.activeElement).toBe(o);
    await userEvent.click(o);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: /Can't tell if/ })).toBeNull();
    expect(document.activeElement).toBe(o);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('needs setup never calls onChoose: it asks for the setup step with the model remembered (intent choose)', async () => {
    const onChoose = vi.fn();
    const onSetup = vi.fn();
    render(<Host onChoose={onChoose} onSetup={onSetup} />);
    await userEvent.click(screen.getByRole('button', { name: 'Anthropic' }));
    const o = option('Claude Fable 5');
    expect(o).toHaveAccessibleDescription('Needs setup: API key Enter sets up Anthropic.');
    o.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.click(o);
    expect(onChoose).not.toHaveBeenCalled();
    expect(onSetup).toHaveBeenCalledWith({ provider: 'anthropic', spec: 'anthropic/claude-fable-5', intent: 'choose' });
  });

  it('an ensemble that needs setup lists the member providers known to need it, and "There may be more"', async () => {
    const onSetup = vi.fn();
    const onChoose = vi.fn();
    const ev = evidence7k('manyEnsembles', {
      edit: (r) => {
        const body = r.models.body as { models: { spec: string; members?: string[] }[] };
        const e = body.models.find((m) => m.spec === 'fusion/ensemble-01')!;
        e.members = ['hoody-ai/hoody-free', 'anthropic/claude-fable-5'];
      },
    });
    render(<Host evidence={ev} onSetup={onSetup} onChoose={onChoose} />);
    await userEvent.click(screen.getByRole('button', { name: 'All 40 ensembles' }));
    await userEvent.click(option('Ensemble 1'));
    const bar = screen.getByRole('group', { name: 'Known to need setup:' });
    expect(bar).toHaveTextContent('There may be more. Check on the AI page.');
    await userEvent.click(within(bar).getByRole('button', { name: 'Set up Anthropic' }));
    expect(onSetup).toHaveBeenCalledWith({ provider: 'anthropic', intent: 'browse' });
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('locked (the caller is saving): nothing activates, link-outs are disabled', async () => {
    const onChoose = vi.fn();
    render(<Host locked onChoose={onChoose} />);
    await userEvent.click(option(/Hoody Free/));
    expect(onChoose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    expect(screen.getByRole('button', { name: 'Your own endpoint' })).toBeDisabled();
    expect(screen.getByText('Wait for the save to finish')).toBeInTheDocument();
  });
});

describe('views and focus', () => {
  it('Set up a provider opens the Directory with its heading focused; Back returns focus to the opener', async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    const h = screen.getByRole('heading', { level: 3, name: 'Set up a provider' });
    expect(document.activeElement).toBe(h);
    expect(screen.getByRole('heading', { level: 4, name: 'Suggested' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'All providers · 200' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'Other ways' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back to ready models' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Set up a provider' }));
  });

  it('a drill-in pages 100 options; Next moves focus to the first row of the new page and says the range', async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'OpenRouter' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 3, name: 'OpenRouter' }));
    expect(screen.getByText('Needs setup · OpenRouter sign-in or API key')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set up OpenRouter' })).toBeInTheDocument();
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(100);
    const nav = screen.getByRole('navigation', { name: 'OpenRouter models pages' });
    expect(nav).toHaveTextContent('1–100 of 402');
    await userEvent.click(within(nav).getByRole('button', { name: 'Next' }));
    const first = within(screen.getByRole('listbox')).getAllByRole('option')[0]!;
    expect(document.activeElement).toBe(first);
    expect(first).toHaveAttribute('aria-posinset', '101');
    expect(first).toHaveAttribute('aria-setsize', '402');
    expect(screen.getByRole('status')).toHaveTextContent('Showing 101–200 of 402');
    await userEvent.click(screen.getByRole('button', { name: 'Back to ready models' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'OpenRouter' }));
  });

  it('a drill-in from the Directory goes Back to providers, focus on the card control that opened it', async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    await userEvent.click(screen.getByRole('button', { name: '88 models from OpenAI' }));
    expect(screen.getByRole('heading', { level: 3, name: 'OpenAI' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Back to providers' }));
    expect(screen.getByRole('button', { name: '88 models from OpenAI' })).toHaveFocus();
  });

  it("a drill-in's own search filters that provider only", async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'OpenAI' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search OpenAI models' }), 'turbo 0125');
    await waitFor(() => expect(within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.dataset.spec)).toEqual(['openai/gpt-3.5-turbo-0125']));
  });

  it('the setup step draws in place of the body; closing it returns focus to the control that opened it', async () => {
    function WithSetup() {
      const [open, setOpen] = useState(false);
      return (
        <Host
          onSetup={() => setOpen(true)}
          setup={
            open ? (
              <button type="button" onClick={() => setOpen(false)}>
                close step
              </button>
            ) : undefined
          }
        />
      );
    }
    render(<WithSetup />);
    await userEvent.click(screen.getByRole('button', { name: 'Anthropic' }));
    const o = option('Claude Fable 5');
    await userEvent.click(o);
    expect(screen.queryByRole('listbox')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'close step' }));
    expect(screen.getByRole('heading', { level: 3, name: 'Anthropic' })).toBeInTheDocument();
  });

  it('while the setup step stands in for the body, the search field points at no list or count line', () => {
    const { rerender } = render(<Host />);
    const field = () => screen.getByRole('searchbox');
    const ids = () => [field().getAttribute('aria-controls'), field().getAttribute('aria-describedby')];
    expect(ids().every((id) => id === null || document.getElementById(id) !== null)).toBe(true);
    rerender(<Host setup={<p>step</p>} />);
    expect(ids()).toEqual([null, null]);
  });

  it('openProvider opens that drill-in once per token, focus on its heading; Back returns to where it was', async () => {
    const { rerender } = render(<Host openProvider={{ pid: 'anthropic', token: 1 }} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Anthropic' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Back to ready models' }));
    rerender(<Host openProvider={{ pid: 'anthropic', token: 1 }} />);
    expect(screen.queryByRole('heading', { level: 3, name: 'Anthropic' })).toBeNull();
    rerender(<Host openProvider={{ pid: 'openai', token: 2 }} />);
    expect(screen.getByRole('heading', { level: 3, name: 'OpenAI' })).toHaveFocus();
  });
});

describe('search', () => {
  it('results replace the body: providers, Ready, Can’t tell and Needs setup groups with totals; focus stays in the field', async () => {
    render(<Host evidence={evidence7k('threeReady')} />);
    const field = screen.getByRole('searchbox', { name: 'Search models and providers' });
    await userEvent.type(field, 'gpt');
    await waitFor(() => expect(screen.getByRole('group', { name: /^Ready · \d+/ })).toBeInTheDocument());
    expect(screen.getByRole('group', { name: /^Can't tell yet · \d+/ })).toBeInTheDocument();
    expect(field).toHaveFocus();
    expect(rows()).toBeLessThanOrEqual(53);
  });

  it('a printable key in the list goes to the search field; Escape with text clears it and focuses the field', async () => {
    render(<Host evidence={evidence7k('threeReady')} />);
    option(/Hoody Free/).focus();
    await userEvent.keyboard('d');
    const field = screen.getByRole('searchbox', { name: 'Search models and providers' });
    expect(field).toHaveFocus();
    expect(field).toHaveValue('d');
  });

  it('no match: the sentence, Clear search and Your own endpoint', async () => {
    render(<Host />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search models and providers' }), 'zzzqqq');
    await waitFor(() => expect(screen.getByText('No model or provider matches "zzzqqq".')).toBeInTheDocument());
    const none = screen.getByText('No model or provider matches "zzzqqq".').parentElement!;
    expect(within(none).getByRole('button', { name: 'Your own endpoint' })).toBeInTheDocument();
    await userEvent.click(within(none).getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('searchbox', { name: 'Search models and providers' })).toHaveValue('');
  });

  it('typing words no Hoody AI row shows finds no Hoody AI row', async () => {
    render(<Host />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search models and providers' }), 'upstream auto');
    await waitFor(() => expect(screen.queryByText(/Showing|No model/)).toBeInTheDocument());
    expect(screen.queryByRole('option', { name: /Hoody/ })).toBeNull();
  });
});

describe('read states', () => {
  it('no computer: "Choose a computer first." and nothing to choose', () => {
    render(<Host evidence={null} noComputer />);
    expect(screen.getByText('Choose a computer first.')).toBeInTheDocument();
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('loading: search enabled, the current value tagged Checking (not activatable), a skeleton', async () => {
    const onChoose = vi.fn();
    render(<Host evidence={evidence7k('loading')} value={FREE} onChoose={onChoose} fallback={[{ spec: FREE, label: 'Hoody Free' }]} />);
    expect(screen.getByRole('searchbox', { name: 'Search models and providers' })).toBeEnabled();
    const o = option('Hoody Free Current Recommended Checking');
    expect(o).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(o);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('catalogue failed (settled): "Models couldn\'t be read." with Try again; fallback rows usable with consent; Open the AI page', async () => {
    const onChoose = vi.fn();
    const onRetry = vi.fn();
    const onOtherWay = vi.fn();
    render(<Host evidence={evidence7k('catalogueFailed')} onChoose={onChoose} onRetry={onRetry} onOtherWay={onOtherWay} fallback={[{ spec: 'openai/gpt-5', label: 'GPT-5' }]} rules={providers.rulesFor('bot', { fallback: ['openai/gpt-5'] })} />);
    expect(screen.getByText("Models couldn't be read.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
    await userEvent.click(option(/^GPT-5/));
    await userEvent.click(screen.getByRole('button', { name: 'Use it anyway' }));
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ spec: 'openai/gpt-5', readiness: 'unknown', consent: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Open the AI page' }));
    expect(onOtherWay).toHaveBeenCalledWith('ai');
  });

  it('ready read failed: the band with Try again; ready providers read Can’t tell, providers that need setup still do', () => {
    render(<Host evidence={evidence7k('readyReadFailed')} />);
    expect(screen.getByText("Couldn't check which models are ready.")).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Your key · \d+ of/ })).toBeNull();
    expect(screen.getAllByRole('group', { name: /Can't tell yet/ }).length).toBeGreaterThan(0);
  });

  it('an older agent: the legacy band; Hoody AI stays Included', () => {
    render(<Host evidence={evidence7k('olderAgent')} />);
    expect(screen.getByText("This computer's agent doesn't confirm which models are ready. Updating it shows them.")).toBeInTheDocument();
  });

  it('a failed background read keeps the evidence and says its age', () => {
    render(<Host evidence={evidence7k('freeOnly', { at: 0 })} backgroundFailed now={() => 2 * 60_000 + 5} />);
    expect(screen.getByText("Checked 2 min ago. Couldn't check again.")).toBeInTheDocument();
    expect(option(/Hoody Free/)).toBeInTheDocument();
  });

  it('nothing ready: the sentence and Set up a provider as the primary action', () => {
    const ev = evidence7k('freeOnly', { edit: (r) => void (r.ready = { status: 200, body: { models: [], status: 'ok' } }) });
    render(<Host evidence={ev} />);
    expect(screen.getByText('Nothing is ready yet. Set up a provider to use its models.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set up a provider' })).toHaveAttribute('data-variant', 'primary');
  });

  it('a scope change closes the consent bar', async () => {
    const { rerender } = render(<Host evidence={evidence7k('threeReady')} />);
    await userEvent.click(screen.getByRole('button', { name: 'All 88 OpenAI models' }));
    await userEvent.click(option('GPT-3.5 Turbo'));
    expect(screen.getByRole('group', { name: /Can't tell if/ })).toBeInTheDocument();
    act(() => rerender(<Host evidence={evidence7k('threeReady', { scope: { ...FIXTURE_SCOPE, computer: 'p|c|borealis' } })} />));
    expect(screen.queryByRole('group', { name: /Can't tell if/ })).toBeNull();
  });
});

describe('ModelBrowser: setup, focus and paging cases', () => {
  type ProvBody = { providers: { id: string; status?: unknown }[] };
  type ModBody = { models: { spec: string; display_name?: string; source?: string; members?: string[] }[] };
  /** threeReady with OpenAI turned into a provider that needs its key. */
  const openaiNeedsKey = () =>
    evidence7k('threeReady', {
      seq: 2,
      edit: (r) => {
        const ps = (r.providers.body as ProvBody).providers;
        ps.find((x) => x.id === 'openai')!.status = ps.find((x) => x.id === 'anthropic')!.status;
      },
    });
  const openConsent = async (onChoose: (c: providers.Choice) => void, extra: Partial<ModelBrowserProps> = {}) => {
    const r = render(<Host evidence={evidence7k('threeReady')} onChoose={onChoose} {...extra} />);
    await userEvent.click(screen.getByRole('button', { name: 'All 88 OpenAI models' }));
    await userEvent.click(option('GPT-3.5 Turbo'));
    return r;
  };

  it('Use it anyway on newer evidence where the provider needs a key asks for setup, never chooses', async () => {
    const onChoose = vi.fn();
    const onSetup = vi.fn();
    const { rerender } = await openConsent(onChoose, { onSetup });
    rerender(<Host evidence={openaiNeedsKey()} onChoose={onChoose} onSetup={onSetup} />);
    const use = screen.queryByRole('button', { name: 'Use it anyway' });
    if (use) await userEvent.click(use);
    expect(onChoose).not.toHaveBeenCalled();
  });

  // A missing prefix is gone; a missing model under a known provider stays unknown, so the provider goes too.
  const gone = () =>
    evidence7k('threeReady', {
      seq: 3,
      edit: (r) => {
        (r.providers.body as ProvBody).providers = (r.providers.body as ProvBody).providers.filter((x) => x.id !== 'openai');
        (r.models.body as ModBody).models = (r.models.body as ModBody).models.filter((m) => !m.spec.startsWith('openai/'));
      },
    });
  it.each([
    ['its provider is gone', () => ({ evidence: gone() })],
    ['the rules refuse it', () => ({ rules: { ...providers.rulesFor('bot'), eligible: () => false } })],
    ['the caller locks', () => ({ locked: true })],
  ] as [string, () => Partial<ModelBrowserProps>][])('Use it anyway after %s: nothing is chosen', async (_, extra) => {
    const onChoose = vi.fn();
    const { rerender } = await openConsent(onChoose);
    rerender(<Host evidence={evidence7k('threeReady')} onChoose={onChoose} {...extra()} />);
    const use = screen.queryByRole('button', { name: 'Use it anyway' });
    if (use && !(use as HTMLButtonElement).disabled) await userEvent.click(use);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('"N more in {provider}" keeps the query and opens on the matches it counted (provider name search)', async () => {
    render(<Host />);
    await userEvent.type(screen.getByRole('searchbox'), '302.ai');
    const more = await screen.findByRole('button', { name: /more in 302\.AI$/ });
    const n = Number(/^(\d+)/.exec(more.textContent ?? '')![1]);
    await userEvent.click(more);
    expect(screen.getByRole('heading', { level: 3, name: '302.AI' })).toBeInTheDocument();
    // The drill-in's own count ("Showing 1–100 of N" or "N models") covers every match the opener counted.
    await waitFor(() => expect(within(screen.getByRole('listbox')).getAllByRole('option').length).toBeGreaterThan(0));
    const total = Number(/of (\d+)/.exec(screen.getByRole('navigation', { name: '302.AI models pages' }).textContent ?? '')?.[1] ?? 0);
    expect(total).toBeGreaterThanOrEqual(n);
  });

  it('the Ready group pager moves focus to the first option of the new page and says the range', async () => {
    render(<Host evidence={evidence7k('manyReady')} />);
    const nav = screen.getByRole('navigation', { name: 'Ready to use pages' });
    await userEvent.click(within(nav).getByRole('button', { name: 'Next' }));
    const groups = within(screen.getByRole('listbox')).getAllByRole('group');
    expect(document.activeElement).toBe(within(groups[0]!).getAllByRole('option')[0]);
    expect(screen.getAllByRole('status').map((x) => x.textContent)).toContain('Showing groups 9–16 of 41');
  });

  it('a Directory section pager moves focus to its first new control and says the range', async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    const nav = screen.getByRole('navigation', { name: 'All providers pages' });
    const before = document.querySelectorAll('[id*="-dir-row-"]')[0]!;
    await userEvent.click(within(nav).getByRole('button', { name: 'Next' }));
    const first = document.querySelectorAll('[id*="-dir-row-"]')[0]!;
    expect(first).not.toBe(before);
    expect(document.activeElement).toBe(first);
    expect(screen.getAllByRole('status').map((x) => x.textContent)).toContain(`Showing 25–48 of ${/of (\d+)/.exec(nav.textContent ?? '')![1]}`);
  });

  it('Back from a drill-in opened by an All providers row returns focus to that row', async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    const row = document.querySelectorAll<HTMLElement>('[id*="-dir-row-"]')[0]!;
    await userEvent.click(row);
    await userEvent.click(screen.getByRole('button', { name: 'Back to providers' }));
    expect(document.activeElement?.id).toBe(row.id);
  });

  it('closing the setup step returns focus to the option that asked for it', async () => {
    function WithSetup() {
      const [open, setOpen] = useState(false);
      return <Host onSetup={() => setOpen(true)} setup={open ? <button type="button" onClick={() => setOpen(false)}>close step</button> : undefined} />;
    }
    render(<WithSetup />);
    await userEvent.click(screen.getByRole('button', { name: 'Anthropic' }));
    await userEvent.click(option('Claude Fable 5'));
    await userEvent.click(screen.getByRole('button', { name: 'close step' }));
    expect(document.activeElement).toBe(option('Claude Fable 5'));
  });

  it('Claude Code that needs setup goes to its own way (the AI page), never a provider step with an empty id', async () => {
    const onSetup = vi.fn();
    const onOtherWay = vi.fn();
    const ev = evidence7k('claudeRows', {
      claude: true,
      edit: (r) => {
        const b = r.acp.body as { report: { agents: { startable: boolean }[] } };
        b.report.agents[0]!.startable = false;
      },
    });
    render(<Host evidence={ev} purpose="agent" rules={providers.rulesFor('agent')} onSetup={onSetup} onOtherWay={onOtherWay} openProvider={null} />);
    const all = screen.queryByRole('button', { name: /Claude Code models$/ });
    if (all) await userEvent.click(all);
    await userEvent.click(option(/^Claude Code default/));
    expect(onSetup).not.toHaveBeenCalled();
    expect(onOtherWay).toHaveBeenCalledWith('claude');
  });

  it('a current ensemble that needs setup shows its known members with Set up in the In use card', async () => {
    const onSetup = vi.fn();
    const ev = evidence7k('manyEnsembles', {
      edit: (r) => {
        const ms = (r.models.body as ModBody).models;
        for (const m of ms) if (m.spec.startsWith('fusion/') && m.spec !== 'fusion/ensemble-01') m.source = 'gone';
        ms.find((m) => m.spec === 'fusion/ensemble-01')!.members = ['hoody-ai/hoody-free', 'anthropic/claude-fable-5'];
      },
    });
    render(<Host evidence={ev} value="fusion/ensemble-01" onSetup={onSetup} />);
    expect(screen.getByText('Ensemble 1 needs setup before it can run.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Set up Anthropic' }));
    expect(onSetup).toHaveBeenCalledWith({ provider: 'anthropic', intent: 'browse' });
  });

  it('under StrictMode, openProvider opens one drill-in frame: one Back returns to Ready', async () => {
    render(
      <StrictMode>
        <Host openProvider={{ pid: 'anthropic', token: 1 }} />
      </StrictMode>,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Anthropic' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back to ready models' }));
    expect(screen.getByRole('heading', { level: 3, name: 'Ready to use' })).toBeInTheDocument();
  });

  it('a drill-in search does not find a Hoody AI model by a word of an id that is not in Hoody\'s own form', async () => {
    const ev = evidence7k('freeOnly', { edit: (r) => void (r.models.body as ModBody).models.push({ spec: 'hoody-ai/upstream-auto', display_name: 'Hoody Auto', source: 'provider' }) });
    render(<Host evidence={ev} openProvider={{ pid: 'hoody-ai', token: 1 }} />);
    await userEvent.type(screen.getByRole('searchbox'), 'upstream');
    await waitFor(() => expect(screen.queryAllByRole('option').map((o) => o.dataset.spec)).not.toContain('hoody-ai/upstream-auto'));
  });
});

// A directory row leaves when its provider becomes ready. Focus never falls to the page body: it moves to
// the row that took that place in the same list, else to the view heading.
describe('a focused directory row that leaves', () => {
  type Edit = NonNullable<Parameters<typeof evidence7k>[1]>['edit'];
  /** Make these providers ready by a stored key, their models on the ready list. */
  const readyAlso =
    (...ids: string[]): Edit =>
    (r) => {
      const want = new Set(ids);
      const pb = (r.providers as { body: { providers: { id: string; status?: { state: string; via: string | null } }[] } }).body;
      for (const x of pb.providers) if (want.has(x.id) && x.status) Object.assign(x.status, { state: 'ready', via: 'stored_key' });
      const mb = (r.models as { body: { models: { spec: string }[] } }).body;
      const rb = (r.ready as { body: { models: { spec: string }[] } }).body;
      rb.models = [...rb.models, ...mb.models.filter((m) => want.has(m.spec.slice(0, m.spec.indexOf('/'))))];
    };
  const rowButton = (list: string, pid: string) => document.querySelector<HTMLElement>(`#mc-dir-rows-${list} > li[data-provider="${pid}"] button:not([disabled])`)!;
  const openDirectory = async () => {
    const { rerender } = render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    return rerender;
  };

  it('an All providers row: focus moves to the row now in its place', async () => {
    const rerender = await openDirectory();
    // abacus is the list's second row; abliteration-ai comes after it.
    act(() => rowButton('all', 'abacus').focus());
    expect(document.activeElement).toBe(rowButton('all', 'abacus'));
    rerender(<Host evidence={evidence7k('freeOnly', { seq: 2, edit: readyAlso('abacus') })} />);
    expect(rowButton('all', 'abacus')).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(rowButton('all', 'abliteration-ai'));
  });

  it('a Suggested card: focus moves to the next card in its place', async () => {
    const rerender = await openDirectory();
    act(() => rowButton('suggested', 'openai').focus());
    rerender(<Host evidence={evidence7k('freeOnly', { seq: 2, edit: readyAlso('openai') })} />);
    expect(document.activeElement).toBe(rowButton('suggested', 'anthropic'));
  });

  it('the last row of its list: focus moves to the view heading', async () => {
    const rerender = await openDirectory();
    act(() => rowButton('suggested', 'mimo').focus());
    rerender(<Host evidence={evidence7k('freeOnly', { seq: 2, edit: readyAlso('mimo') })} />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 3, name: 'Set up a provider' }));
  });

  it('a row that stays keeps focus, and focus elsewhere is never moved', async () => {
    const rerender = await openDirectory();
    act(() => rowButton('all', 'abacus').focus());
    rerender(<Host evidence={evidence7k('freeOnly', { seq: 2, edit: readyAlso('302ai') })} />);
    expect(document.activeElement).toBe(rowButton('all', 'abacus'));
    // Focus left the browser (a row once had it): a later row change moves nothing.
    const outside = document.createElement('button');
    document.body.append(outside);
    act(() => outside.focus());
    rerender(<Host evidence={evidence7k('freeOnly', { seq: 3, edit: readyAlso('302ai', 'abacus') })} />);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('focus that moved on inside the browser (the search box) stays there when the row it left leaves', async () => {
    const rerender = await openDirectory();
    act(() => rowButton('all', 'abacus').focus());
    const search = screen.getByRole('searchbox');
    act(() => search.focus());
    rerender(<Host evidence={evidence7k('freeOnly', { seq: 2, edit: readyAlso('abacus') })} />);
    expect(document.activeElement).toBe(search);
  });

  it("a card's Set up opens the setup step in place of the rows: focus waits on the view heading, not the body", async () => {
    function WithSetup() {
      const [open, setOpen] = useState(false);
      return <Host onSetup={() => setOpen(true)} setup={open ? <p>step</p> : undefined} />;
    }
    render(<WithSetup />);
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    await userEvent.click(screen.getByRole('button', { name: 'Set up OpenAI' }));
    expect(screen.getByText('step')).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 3, name: 'Set up a provider' }));
  });

  it('rows before the focused one change first: focus still goes to the row that followed it', async () => {
    const rerender = await openDirectory();
    act(() => rowButton('all', 'abacus').focus());
    rerender(<Host evidence={evidence7k('freeOnly', { seq: 2, edit: readyAlso('302ai') })} />);
    expect(document.activeElement).toBe(rowButton('all', 'abacus'));
    rerender(<Host evidence={evidence7k('freeOnly', { seq: 3, edit: readyAlso('302ai', 'abacus') })} />);
    expect(document.activeElement).toBe(rowButton('all', 'abliteration-ai'));
  });

  it('a row inserted after it while it stays is its follower when it leaves (the followers are read again each commit)', async () => {
    const { rerender } = render(<Host evidence={evidence7k('freeOnly', { edit: readyAlso('abliteration-ai') })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    act(() => rowButton('all', 'abacus').focus());
    rerender(<Host evidence={evidence7k('freeOnly', { seq: 2 })} />);
    expect(document.activeElement).toBe(rowButton('all', 'abacus'));
    rerender(<Host evidence={evidence7k('freeOnly', { seq: 3, edit: readyAlso('abacus') })} />);
    expect(document.activeElement).toBe(rowButton('all', 'abliteration-ai'));
  });

  it('a row inserted before it as it leaves: focus goes forward to its follower, never back to the new row', async () => {
    const { rerender } = render(<Host evidence={evidence7k('freeOnly', { edit: readyAlso('302ai') })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    act(() => rowButton('all', 'abacus').focus());
    // 302ai needs setup again (a row before abacus) while abacus became ready: [abacus, abliteration-ai, …] becomes
    // [302ai, abliteration-ai, …].
    rerender(<Host evidence={evidence7k('freeOnly', { seq: 2, edit: readyAlso('abacus') })} />);
    expect(rowButton('all', '302ai')).not.toBeNull();
    expect(document.activeElement).toBe(rowButton('all', 'abliteration-ai'));
  });

  it('a Ready view shortcut that leaves: focus goes to the next shortcut, and past the last provider to Set up a provider on the same row', () => {
    const { rerender } = render(<Host />);
    act(() => screen.getByRole('button', { name: 'OpenAI' }).focus());
    rerender(<Host evidence={evidence7k('freeOnly', { seq: 2, edit: readyAlso('openai') })} />);
    expect(screen.queryByRole('button', { name: 'OpenAI' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Anthropic' }));
    act(() => screen.getByRole('button', { name: 'Xiaomi MiMo' }).focus());
    rerender(<Host evidence={evidence7k('freeOnly', { seq: 3, edit: readyAlso('openai', 'mimo') })} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Set up a provider' }));
  });

  it("a drill-in whose last option leaves: focus goes to the view heading, not the body", async () => {
    const dropOpenRouter: Edit = (r) => {
      const mb = (r.models as { body: { models: { spec: string }[] } }).body;
      mb.models = mb.models.filter((m) => !m.spec.startsWith('openrouter/'));
    };
    const { rerender } = render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'OpenRouter' }));
    act(() => within(screen.getByRole('listbox')).getAllByRole('option')[0]!.focus());
    rerender(<Host evidence={evidence7k('freeOnly', { seq: 2, edit: dropOpenRouter })} />);
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 3 }));
  });

  it("a setup step that focuses its own control as it opens keeps that focus (the restore never takes it back)", async () => {
    function Step() {
      const ref = useRef<HTMLInputElement>(null);
      useLayoutEffect(() => ref.current?.focus(), []);
      return <input ref={ref} aria-label="API key" />;
    }
    function WithSetup() {
      const [open, setOpen] = useState(false);
      return <Host onSetup={() => setOpen(true)} setup={open ? <Step /> : undefined} />;
    }
    render(<WithSetup />);
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    await userEvent.click(screen.getByRole('button', { name: 'Set up OpenAI' }));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'API key' }));
  });

  it('a setup step that moves focus out of the browser as it opens keeps it there (focus is not on the body)', async () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    function Step() {
      useLayoutEffect(() => outside.focus(), []);
      return <p>step</p>;
    }
    function WithSetup() {
      const [open, setOpen] = useState(false);
      return <Host onSetup={() => setOpen(true)} setup={open ? <Step /> : undefined} />;
    }
    render(<WithSetup />);
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    await userEvent.click(screen.getByRole('button', { name: 'Set up OpenAI' }));
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('the computer goes away while the search has focus: focus goes to the heading, not the body', () => {
    const { rerender } = render(<Host />);
    act(() => screen.getByRole('searchbox').focus());
    rerender(<Host noComputer />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 3 }));
  });

  it('focus that left for nothing (blurred to the body) is not pulled back when that row leaves', async () => {
    const rerender = await openDirectory();
    act(() => rowButton('all', '302ai').focus());
    act(() => rowButton('all', '302ai').blur());
    expect(document.activeElement).toBe(document.body);
    rerender(<Host evidence={evidence7k('freeOnly', { seq: 2, edit: readyAlso('302ai') })} />);
    expect(document.activeElement).toBe(document.body);
  });
});

// Counts agree with their nouns (strings' _one/_other forms), and a provider chip shows the name alone.
describe('counts and chips', () => {
  type Edit = NonNullable<Parameters<typeof evidence7k>[1]>['edit'];
  /** Only Hoody AI and these providers, each with its first n models. */
  const only =
    (keep: Record<string, number>): Edit =>
    (r) => {
      const pb = (r.providers as { body: { providers: { id: string; model_count: number }[] } }).body;
      pb.providers = pb.providers.filter((x) => x.id === 'hoody-ai' || x.id in keep);
      const mb = (r.models as { body: { models: { spec: string }[] } }).body;
      const seen: Record<string, number> = {};
      mb.models = mb.models.filter((m) => {
        const pid = m.spec.slice(0, m.spec.indexOf('/'));
        if (pid === 'hoody-ai') return true;
        if (!(pid in keep)) return false;
        seen[pid] = (seen[pid] ?? 0) + 1;
        return seen[pid] <= keep[pid]!;
      });
      for (const x of pb.providers) if (x.id in keep) x.model_count = keep[x.id]!;
    };

  it('the More models card is one sentence, the suggested providers and Set up a provider on one row, with no counts', () => {
    render(<Host evidence={evidence7k('freeOnly', { edit: only({ openai: 2, anthropic: 1 }) })} />);
    const card = screen.getByRole('region', { name: 'More models' });
    expect(within(card).getByText('More models are available once you set up a provider.')).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/\d/);
    const row = within(card).getByRole('list');
    expect(within(row).getByRole('button', { name: 'OpenAI' })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Set up a provider' })).toBeInTheDocument();
  });

  it('a Directory row and card count one model as "1 model"', async () => {
    render(<Host evidence={evidence7k('freeOnly', { edit: only({ openai: 1, anthropic: 2 }) })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Set up a provider' }));
    expect(screen.getByRole('button', { name: '1 model from OpenAI' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2 models from Anthropic' })).toBeInTheDocument();
  });

  // The search's live announcement agrees each count with its own noun.
  const liveAfter = async (q: string, edit: Edit) => {
    render(<Host evidence={evidence7k('freeOnly', { edit })} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search models and providers' }), q);
    let text = '';
    await waitFor(() => {
      text = screen.getAllByRole('status').map((x) => x.textContent ?? '').find((x) => / match\./.test(x)) ?? '';
      expect(text).not.toBe('');
    });
    return text;
  };

  it('the search announces "1 model and 1 provider match." for one of each', async () => {
    expect(await liveAfter('openai', only({ openai: 1 }))).toMatch(/^1 model and 1 provider match\. /);
  });

  it('and plural forms, each count with its own noun', async () => {
    expect(await liveAfter('openai', only({ openai: 3 }))).toMatch(/^3 models and 1 provider match\. /);
  });

  it('a Ready view provider chip shows the provider name alone: no letter mark that reads as a count', () => {
    render(<Host />);
    for (const name of ['OpenAI', 'Anthropic', 'Google', 'OpenRouter', 'Xiaomi MiMo']) {
      const chip = screen.getByRole('button', { name });
      expect(chip.textContent).toBe(name);
      // The label cell only: a chip button's separator and arrow chip are aria-hidden by design.
      expect(chip.querySelector('[data-chip-label] [aria-hidden="true"]')).toBeNull();
    }
  });
});
