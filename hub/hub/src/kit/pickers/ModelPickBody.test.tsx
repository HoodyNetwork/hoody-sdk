// ModelPickBody: one list of every model the caller may pick
// over the real 7,078-model catalogue, the filter bar and its remembered part, activation per readiness (needs setup
// never chooses), the consent bar, the inherit row, favourites outside the list, the setup step in place of the list.
import { providers } from '@core';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render as appRender } from '@app/testing';
import { evidence7k, FIXTURE_SCOPE } from './fixtures/evidence7k';
import { ModelChooser } from './ModelChooser';
import { ModelPickBody, type ModelPickBodyProps, windowText } from './ModelPickBody';
import { MODEL_PREFS_KEY, NO_MODEL_PREFS, type ModelPrefs } from './modelPickLogic';
import { MODEL_PREFS } from './useModelPrefs';

const FREE = 'hoody-ai/hoody-free';

type HostProps = Partial<ModelPickBodyProps> & { setup?: ReactNode; prefs0?: ModelPrefs; onPrefsSeen?: (p: ModelPrefs) => void; inUse?: string[]; inherit?: ModelPickBodyProps['pick']['inherit'] };
function Host({ prefs0, onPrefsSeen, inUse, inherit, ...p }: HostProps) {
  const [prefs, setPrefs] = useState<ModelPrefs>(prefs0 ?? NO_MODEL_PREFS);
  return (
    <ModelPickBody
      evidence={evidence7k('threeReady')}
      computerName="atlas"
      value=""
      rules={providers.rulesFor('bot')}
      purpose="bot"
      onChoose={() => undefined}
      onSetup={() => undefined}
      onOtherWay={() => undefined}
      onRetry={() => undefined}
      pick={{
        prefs,
        onPrefs: (fn) => {
          setPrefs((x) => {
            const next = fn(x);
            onPrefsSeen?.(next);
            return next;
          });
        },
        inUse,
        inherit,
      }}
      {...p}
    />
  );
}

const flush = async () => {
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  });
};
const list = () => screen.getByRole('listbox');
const option = (name: RegExp | string) => within(list()).getByRole('option', { name });
const count = () => screen.getAllByText(/ of [\d,]+ models$/)[0]!.textContent;
/** The drawn option of one spec (names repeat across providers: Claude Fable 5 is listed by six of them). */
const bySpec = (spec: string) => {
  const o = within(list()).getAllByRole('option').find((x) => x.getAttribute('data-spec') === spec);
  if (!o) throw new Error(`${spec} is not drawn`);
  return o;
};

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
});
afterEach(() => vi.restoreAllMocks());

describe('one list', () => {
  it('opens on Ready (something is ready) and says how many of the whole catalogue show; positions count them all', async () => {
    render(<Host />);
    await flush();
    const opts = within(list()).getAllByRole('option');
    expect(opts.length).toBeLessThan(60);
    const total = Number(opts[0]!.getAttribute('aria-setsize'));
    expect(count()).toMatch(new RegExp(`^${total.toLocaleString()} of 7,0\\d\\d models$`));
    expect(screen.getByRole('radio', { name: /^Ready/ })).toBeChecked();
    expect(within(list()).getAllByRole('group')[0]).toHaveAccessibleName(/^Hoody AI · Ready · \d+ models?$/);
  });

  it('All shows the whole catalogue in one list: no paging, no provider drill-in', async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole('radio', { name: /^All/ }));
    await flush();
    expect(count()).toMatch(/^7,0\d\d of 7,0\d\d models$/);
    expect(screen.queryByRole('button', { name: /^All \d+ .* models$/ })).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('the inherit row comes first with its own words and chooses inherit', async () => {
    const onChoose = vi.fn();
    render(<Host onChoose={onChoose} rules={providers.rulesFor('bot', { inherit: true })} inherit={{ label: 'Bots default', detail: 'Set on the AI page', resolved: 'now Hoody Free' }} />);
    await flush();
    const first = within(list()).getAllByRole('option')[0]!;
    expect(first).toHaveAccessibleName('Bots default');
    expect(first).toHaveAccessibleDescription('Set on the AI page · now Hoody Free');
    expect(first).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(first);
    expect(onChoose).toHaveBeenCalledWith({ kind: 'inherit' });
  });
});

describe('activation per readiness (unchanged)', () => {
  it('a ready row chooses at once with the evidence scope and seq', async () => {
    const onChoose = vi.fn();
    render(<Host onChoose={onChoose} evidence={evidence7k('threeReady', { seq: 9 })} />);
    await flush();
    await userEvent.click(option(/^Hoody Free/));
    expect(onChoose).toHaveBeenCalledWith({ kind: 'model', spec: FREE, readiness: 'ready', consent: false, scope: FIXTURE_SCOPE, seq: 9 });
  });

  it('needs setup asks the caller for the setup step with the model; never chooses', async () => {
    const onChoose = vi.fn();
    const onSetup = vi.fn();
    render(<Host onChoose={onChoose} onSetup={onSetup} />);
    await userEvent.type(screen.getByRole('searchbox'), 'fable 5');
    await userEvent.click(screen.getByRole('radio', { name: /^Needs setup/ }));
    await flush();
    await userEvent.click(bySpec('anthropic/claude-fable-5'));
    expect(onSetup).toHaveBeenCalledWith({ provider: 'anthropic', spec: 'anthropic/claude-fable-5', intent: 'choose' });
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("can't tell opens the consent bar on Use it anyway; it chooses with consent", async () => {
    const onChoose = vi.fn();
    render(<Host onChoose={onChoose} />);
    await userEvent.click(screen.getByRole('radio', { name: /^All/ }));
    await userEvent.type(screen.getByRole('searchbox'), 'gpt-3.5-turbo');
    await flush();
    await userEvent.click(bySpec('openai/gpt-3.5-turbo'));
    const bar = screen.getByRole('group', { name: "Can't tell if GPT-3.5 Turbo runs on atlas right now." });
    expect(document.activeElement).toBe(within(bar).getByRole('button', { name: 'Use it anyway' }));
    expect(onChoose).not.toHaveBeenCalled();
    await userEvent.click(within(bar).getByRole('button', { name: 'Use it anyway' }));
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ spec: 'openai/gpt-3.5-turbo', readiness: 'unknown', consent: true }));
  });

  it('Use it anyway is judged again on the newest evidence: a model that became ready meanwhile chooses as ready', async () => {
    const onChoose = vi.fn();
    const SPEC = 'openai/gpt-3.5-turbo';
    const { rerender } = render(<Host onChoose={onChoose} />);
    await userEvent.click(screen.getByRole('radio', { name: /^All/ }));
    await userEvent.type(screen.getByRole('searchbox'), 'gpt-3.5-turbo');
    await flush();
    await userEvent.click(bySpec(SPEC));
    const bar = screen.getByRole('group', { name: "Can't tell if GPT-3.5 Turbo runs on atlas right now." });
    // The next read lists it as ready, same computer: the bar stays open, its press is judged on the new read.
    const ev = evidence7k('threeReady', {
      seq: 2,
      edit: (r) => {
        const all = (r.models.body as unknown as { models: Array<{ spec: string }> }).models;
        (r.ready.body as unknown as { models: Array<{ spec: string }> }).models.push(all.find((x) => x.spec === SPEC)!);
      },
    });
    rerender(<Host onChoose={onChoose} evidence={ev} />);
    await flush();
    await userEvent.click(within(bar).getByRole('button', { name: 'Use it anyway' }));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith({ kind: 'model', spec: SPEC, readiness: 'ready', consent: false, scope: FIXTURE_SCOPE, seq: 2 });
  });

  it('"Your own endpoint" is offered under the list, on an empty search too, and leaves for the AI page', async () => {
    const onOtherWay = vi.fn();
    render(<Host onOtherWay={onOtherWay} />);
    await flush();
    await userEvent.click(screen.getByRole('button', { name: 'Your own endpoint' }));
    expect(onOtherWay).toHaveBeenCalledWith('endpoint');
    await userEvent.type(screen.getByRole('searchbox'), 'zzqqxx-no-such-model');
    await flush();
    expect(screen.getByRole('button', { name: 'Your own endpoint' })).toBeEnabled();
  });

  it('"Your own endpoint" is not offered when the caller turns it off', async () => {
    render(<Host offer={{ endpoint: false }} />);
    await flush();
    expect(screen.queryByRole('button', { name: 'Your own endpoint' })).toBeNull();
  });

  it('two panels on one page draw no shared ids', async () => {
    render(
      <>
        <Host />
        <Host />
      </>,
    );
    await flush();
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(screen.getAllByRole('listbox')).toHaveLength(2);
  });

  it('locked: a press does nothing', async () => {
    const onChoose = vi.fn();
    render(<Host onChoose={onChoose} locked />);
    await flush();
    await userEvent.click(option(/^Hoody Free/));
    expect(onChoose).not.toHaveBeenCalled();
  });
});

describe('filters', () => {
  it('each value shows its count; the provider filter narrows the list to its rows', async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole('radio', { name: /^All/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Provider/ }));
    const anthropic = await screen.findByRole('menuitemcheckbox', { name: /^Anthropic/ });
    const n = Number(/(\d[\d,]*)\s*$/.exec(anthropic.textContent ?? '')?.[1]?.replace(/,/g, ''));
    expect(n).toBeGreaterThan(0);
    await userEvent.click(anthropic);
    await userEvent.keyboard('{Escape}');
    await flush();
    expect(count()).toBe(`${n.toLocaleString()} of ${count()!.split(' of ')[1]}`);
  });

  it('readiness and providers are remembered for the account; a search never is', async () => {
    const seen: ModelPrefs[] = [];
    render(<Host onPrefsSeen={(p) => seen.push(p)} />);
    await userEvent.type(screen.getByRole('searchbox'), 'gpt');
    expect(seen).toHaveLength(0);
    await userEvent.click(screen.getByRole('radio', { name: /^All/ }));
    expect(seen.at(-1)).toMatchObject({ readiness: 'all', providers: [] });
    expect(JSON.stringify(seen)).not.toContain('gpt');
  });

  it('opens on the remembered filters (providers this catalogue still lists)', async () => {
    render(<Host prefs0={{ ...NO_MODEL_PREFS, readiness: 'all', providers: ['anthropic', 'gone'] }} />);
    await flush();
    expect(screen.getByRole('radio', { name: /^All/ })).toBeChecked();
    for (const g of within(list()).getAllByRole('group')) expect(g).toHaveAccessibleName(/^Anthropic · /);
  });

  it('nothing matches: Clear filters, and Search all providers while on Ready', async () => {
    render(<Host prefs0={{ ...NO_MODEL_PREFS, readiness: 'ready', providers: ['anthropic'] }} />);
    await flush();
    expect(screen.getByText('No model matches.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Search all providers' }));
    await flush();
    expect(screen.getByRole('radio', { name: /^All/ })).toBeChecked();
    expect(within(list()).getAllByRole('group')[0]).toHaveAccessibleName(/^Anthropic · /);
  });
});

describe('favourites', () => {
  it('the star sits outside the list and acts on the focused option; a starred model gets its own section', async () => {
    const seen: ModelPrefs[] = [];
    render(<Host onPrefsSeen={(p) => seen.push(p)} />);
    await flush();
    const other = bySpec('openai/chat-latest');
    act(() => other.focus());
    const star = screen.getByRole('button', { name: /^Add to favourites: .+$/ });
    expect(list().contains(star)).toBe(false);
    await userEvent.click(star);
    expect(seen.at(-1)!.fav).toEqual(['openai/chat-latest']);
    await flush();
    expect(within(list()).getAllByRole('group')[0]).toHaveAccessibleName('Favourites');
  });

  it('favourites this computer does not list are counted and removable, never drawn as models', async () => {
    const seen: ModelPrefs[] = [];
    render(<Host prefs0={{ ...NO_MODEL_PREFS, fav: ['gone/one', 'gone/two', FREE] }} onPrefsSeen={(p) => seen.push(p)} />);
    await flush();
    expect(screen.getByText("2 favourites aren't on this computer.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove them' }));
    expect(seen.at(-1)!.fav).toEqual([FREE]);
  });

  it('the models in use here lead the Recent section', async () => {
    render(<Host inUse={[FREE]} />);
    await flush();
    const groups = within(list()).getAllByRole('group');
    expect(groups[0]).toHaveAccessibleName('Recent');
    expect(within(groups[0]!).getAllByRole('option')[0]).toHaveAttribute('data-spec', FREE);
  });
});

describe('setup, scope and reads', () => {
  it('the setup step stands in for the list; a search ends it', async () => {
    const onSetupView = vi.fn();
    render(<Host setup={<p>the step</p>} onSetupView={onSetupView} />);
    expect(screen.getByText('the step')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).toBeNull();
    await userEvent.type(screen.getByRole('searchbox'), 'x');
    expect(onSetupView).toHaveBeenCalled();
  });

  it('openProvider shows that provider’s models across every readiness, once per token', async () => {
    const { rerender } = render(<Host />);
    rerender(<Host openProvider={{ pid: 'anthropic', token: 1 }} />);
    await flush();
    expect(screen.getByRole('radio', { name: /^All/ })).toBeChecked();
    for (const g of within(list()).getAllByRole('group')) expect(g).toHaveAccessibleName(/^Anthropic · /);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 3 }));
  });

  it('no computer: says so, and nothing to pick', () => {
    render(<Host noComputer evidence={null} />);
    expect(screen.getByText('Choose a computer first.')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('a failed catalogue read: the band with Try again and the caller’s rows, usable with consent', async () => {
    const onRetry = vi.fn();
    render(<Host evidence={evidence7k('catalogueFailed')} onRetry={onRetry} value={FREE} />);
    await flush();
    await userEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0]!);
    expect(onRetry).toHaveBeenCalled();
    // No catalogue: the caller's row reads its spec's own words.
    expect(option(/^hoody-free/)).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /^Ready/ })).toBeNull();
  });
});

describe('a failed read, the carried search and focus', () => {
  it('a read that fails after the person filtered still shows the caller\'s rows (only the search applies)', async () => {
    const { rerender } = render(<Host value={FREE} />);
    await flush();
    await userEvent.click(screen.getByRole('radio', { name: /^Needs setup/ }));
    await flush();
    rerender(<Host value={FREE} evidence={evidence7k('catalogueFailed')} />);
    await flush();
    expect(option(/^hoody-free/)).toBeInTheDocument();
  });

  it('a search typed while the read is failed carries over the opening filters to the next good read', async () => {
    const { rerender } = render(<Host value={FREE} />);
    await flush();
    expect(screen.getByRole('radio', { name: /^Ready/ })).toBeChecked();
    rerender(<Host value={FREE} evidence={evidence7k('catalogueFailed')} />);
    await flush();
    await userEvent.type(screen.getByRole('searchbox'), 'gpt');
    rerender(<Host value={FREE} evidence={evidence7k('threeReady', { seq: 3 })} />);
    await flush();
    expect(screen.getByRole('radio', { name: /^Ready/ })).toBeChecked();
    expect(screen.getByRole('searchbox')).toHaveValue('gpt');
  });

  it('opening a provider after that clears the carried search', async () => {
    const { rerender } = render(<Host value={FREE} />);
    await flush();
    rerender(<Host value={FREE} evidence={evidence7k('catalogueFailed')} />);
    await flush();
    await userEvent.type(screen.getByRole('searchbox'), 'gpt');
    rerender(<Host value={FREE} evidence={evidence7k('threeReady', { seq: 3 })} />);
    await flush();
    rerender(<Host value={FREE} evidence={evidence7k('threeReady', { seq: 3 })} openProvider={{ pid: 'anthropic', token: 1 }} />);
    await flush();
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('an ensemble that needs setup takes focus into its bar; Escape goes back to the option', async () => {
    const ev = evidence7k('manyEnsembles', {
      edit: (r) => {
        const body = r.models.body as { models: { spec: string; members?: string[] }[] };
        body.models.find((m) => m.spec === 'fusion/ensemble-01')!.members = ['hoody-ai/hoody-free', 'anthropic/claude-fable-5'];
      },
    });
    render(<Host evidence={ev} />);
    await userEvent.click(screen.getByRole('radio', { name: /^All/ }));
    await userEvent.type(screen.getByRole('searchbox'), 'ensemble 1');
    await flush();
    const ens = bySpec('fusion/ensemble-01');
    act(() => ens.focus());
    await userEvent.keyboard('{Enter}');
    const bar = screen.getByRole('group', { name: 'Known to need setup:' });
    expect(document.activeElement).toBe(within(bar).getByRole('button', { name: 'Set up Anthropic' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Known to need setup:' })).toBeNull();
    expect(document.activeElement?.getAttribute('data-spec')).toBe('fusion/ensemble-01');
  });

  it('the star leaves a focused option the search took out of the list, for the held value', async () => {
    render(<Host value={FREE} />);
    await flush();
    const other = bySpec('openai/chat-latest');
    act(() => other.focus());
    expect(screen.getByRole('button', { name: /^Add to favourites: / })).not.toHaveAccessibleName(/Hoody Free/);
    await userEvent.type(screen.getByRole('searchbox'), 'hoody free');
    await flush();
    expect(screen.getByRole('button', { name: /^Add to favourites: / })).toHaveAccessibleName(/Hoody Free/);
    // The search cleared, focus still in it: the old option is drawn again but no longer the star's.
    await userEvent.clear(screen.getByRole('searchbox'));
    await flush();
    expect(screen.getByRole('button', { name: /^Add to favourites: / })).toHaveAccessibleName(/Hoody Free/);
  });
});

describe('words', () => {
  it('windows read 64K / 200K / 1M; the prefs key is one name', () => {
    expect([64_000, 200_000, 1_000_000, 1_048_576].map(windowText)).toEqual(['64K', '200K', '1M', '1.05M']);
    expect(MODEL_PREFS).toBe(MODEL_PREFS_KEY);
  });
});

describe('ModelChooser with the one picker', () => {
  it('draws the pick body in place of the views when the caller passes `pick`', () => {
    const pick = { prefs: NO_MODEL_PREFS, onPrefs: () => undefined };
    const props = { label: 'Model', catalogue: null, computer: null, value: '', onChoose: () => undefined, rules: providers.rulesFor('bot'), purpose: 'bot' as const };
    const { unmount } = appRender(<ModelChooser {...props} pick={pick} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Choose a model' })).toBeInTheDocument();
    expect(screen.getByText('Choose a computer first.')).toBeInTheDocument();
    unmount();
    appRender(<ModelChooser {...props} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Ready to use' })).toBeInTheDocument();
  });
});
