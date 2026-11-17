// One rule for a model's name in every chooser view: core providers' rule for Hoody AI names first, then the neutral
// word. A Hoody AI spec with no name to show never shows as its spec. And Try again shows pending only after a press.
import { providers } from '@core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { evidence7k } from './fixtures/evidence7k';
import { ModelBrowser, type ModelBrowserProps } from './ModelBrowser';
import { midSentence, modelLabel, startSentence } from './modelViews';
import strings from './ModelChooser.strings.en.json';

const FREE = 'hoody-ai/hoody-free';
const HIDDEN = 'hoody-ai/upstream';
const rules = (extra: string[] = []) => providers.rulesFor('bot', { inherit: true, fallback: [FREE, ...extra] });

function Host(p: Partial<ModelBrowserProps>) {
  return (
    <ModelBrowser
      evidence={null}
      computerName="atlas"
      value=""
      rules={rules()}
      fallback={[{ spec: FREE, label: 'Hoody Free' }]}
      purpose="bot"
      onChoose={() => undefined}
      onSetup={() => undefined}
      onOtherWay={() => undefined}
      onRetry={() => undefined}
      {...p}
    />
  );
}

const noSpec = () => expect(document.body.textContent).not.toContain(HIDDEN);
const tryAgain = () => screen.getByRole('button', { name: /Try again/ });
const pending = (b: HTMLElement) => b.hasAttribute('data-pending');

describe('modelNameOf, the rule', () => {
  it('a Hoody AI spec reads the word unless it is in Hoody\'s own form; another provider is untouched', () => {
    expect(providers.modelNameOf(HIDDEN, null, 'A model')).toBe('A model');
    expect(providers.modelNameOf('hoody-ai/fast-upstream', null, 'A model')).toBe('A model');
    expect(providers.modelNameOf('hoody-ai/hoody-fast', null, 'A model')).toBe('hoody-fast');
    expect(providers.modelNameOf('acme/upstream/auto', null, 'A model')).toBe('acme/upstream/auto');
  });

  it('a name from the catalogue wins, itself by the rule', () => {
    const OWN = 'hoody-ai/hoody-fast';
    const cat = { bySpec: { [HIDDEN]: { spec: HIDDEN, display_name: 'Fast one' }, [OWN]: { spec: OWN, display_name: 'Hoody Fast' }, 'openai/gpt-5': { spec: 'openai/gpt-5', display_name: 'GPT-5' } } } as never;
    expect(providers.modelNameOf(HIDDEN, cat, 'A model')).toBe('A model');
    expect(providers.modelNameOf(OWN, cat, 'A model')).toBe('Hoody Fast');
    expect(providers.modelNameOf('openai/gpt-5', cat, 'A model')).toBe('GPT-5');
  });

  it('modelLabel is that rule', () => {
    expect(modelLabel(null, HIDDEN, 'A model')).toBe('A model');
  });
});

describe('a held Hoody AI model with no name to show', () => {
  it('while loading: a row named by the word, marked Current, never the spec', () => {
    render(<Host value={HIDDEN} />);
    expect(screen.getByRole('option', { name: /^A model Current Checking/ })).toBeInTheDocument();
    noSpec();
  });

  it('after a failed read: the same word, under Can\'t tell yet', () => {
    render(<Host evidence={evidence7k('catalogueFailed')} value={HIDDEN} rules={rules([HIDDEN])} />);
    const group = screen.getByRole('group', { name: /^Can't tell yet/ });
    expect(within(group).getByRole('option', { name: /^A model Current/ })).toBeInTheDocument();
    noSpec();
  });

  it('after a good read that does not list it: "In use" says the word', () => {
    render(<Host evidence={evidence7k('threeReady')} value={HIDDEN} />);
    expect(screen.getByText(/this model|This model/)).toBeInTheDocument();
    noSpec();
  });

  it('a caller\'s label passes the rule in the failed view too', () => {
    render(<Host evidence={evidence7k('catalogueFailed')} value={HIDDEN} rules={rules([HIDDEN])} fallback={[{ spec: HIDDEN, label: 'Upstream' }]} />);
    expect(screen.getByRole('option', { name: /^A model Current/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Upstream/i })).toBeNull();
  });

  it('a Hoody AI spec in Hoody\'s own form, given its spec as its label, reads its id after the provider', () => {
    const spec = 'hoody-ai/hoody-fast';
    render(<Host evidence={evidence7k('catalogueFailed')} value={spec} rules={rules([spec])} fallback={[{ spec, label: spec }]} />);
    expect(screen.getByRole('option', { name: /^hoody-fast Current/ })).toBeInTheDocument();
  });
});

describe('Try again', () => {
  it('draws the pending state it is given, on the button; the rows stay', () => {
    const failed = evidence7k('catalogueFailed');
    const { rerender } = render(<Host evidence={failed} />);
    const rows = screen.getAllByRole('option').length;
    expect(pending(tryAgain())).toBe(false);
    rerender(<Host evidence={failed} retrying />);
    expect(pending(tryAgain())).toBe(true);
    expect(screen.getAllByRole('option')).toHaveLength(rows);
    expect(screen.queryByText('Checking models…')).toBeNull();
  });

  it('a press calls the retry once', async () => {
    const onRetry = vi.fn();
    render(<Host evidence={evidence7k('catalogueFailed')} onRetry={onRetry} />);
    await userEvent.click(tryAgain());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the ready-read band', { evidence: evidence7k('readyReadFailed') }],
    ['the background-failure band', { evidence: evidence7k('freeOnly', { at: 0 }), backgroundFailed: true, now: () => 60_000 }],
  ] as const)('%s shows pending the same way', (_n, props) => {
    render(<Host {...props} retrying />);
    expect(pending(tryAgain())).toBe(true);
  });
});

describe('the neutral word inside a sentence', () => {
  it('reads "this model" mid-sentence and "This model" at the start, a real name unchanged', () => {
    const t = (k: string) => ({ 'mc.anyModel': 'A model', 'mc.model': 'this model', 'mc.thisModel': 'This model' })[k]!;
    expect(midSentence(t, 'A model')).toBe('this model');
    expect(startSentence(t, 'A model')).toBe('This model');
    expect(midSentence(t, 'GPT-5')).toBe('GPT-5');
    expect(startSentence(t, 'GPT-5')).toBe('GPT-5');
  });

  it('the consent bar asks about "this model"', async () => {
    render(<Host evidence={evidence7k('catalogueFailed')} rules={rules([HIDDEN])} fallback={[{ spec: HIDDEN, label: '' }]} />);
    await userEvent.click(screen.getByRole('option', { name: /^A model/ }));
    expect(await screen.findByText("Can't tell if this model runs on atlas right now.")).toBeInTheDocument();
    noSpec();
  });

  it('"In use" opens with "This model" when the held model is unlisted', () => {
    render(<Host evidence={evidence7k('threeReady')} value={HIDDEN} />);
    expect(screen.getByText(/This model isn't in this computer's list|This computer no longer lists this model/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/lists A model|A model isn't/);
    noSpec();
  });
});

describe('search', () => {
  it('finds a model with no name to show by the word its row shows', async () => {
    const ev = evidence7k('threeReady', {
      edit: (r) => {
        (r.models.body as { models: unknown[] }).models.push({ spec: HIDDEN });
      },
    });
    render(<Host evidence={ev} rules={rules([HIDDEN])} />);
    await userEvent.type(screen.getByRole('searchbox'), 'a model');
    expect(await screen.findByRole('option', { name: /^A model/ }, { timeout: 4000 })).toBeInTheDocument();
    noSpec();
  });

  // The word is a string, so a locale switch changes it on a mounted browser: the index must rebuild for it.
  it('a word that changes while the browser stays open rebuilds the index, so search finds the model by the new word', async () => {
    const ev = evidence7k('threeReady', {
      edit: (r) => {
        (r.models.body as { models: unknown[] }).models.push({ spec: HIDDEN });
      },
    });
    const table = strings as Record<string, string>;
    const was = strings['mc.anyModel'];
    try {
      const { rerender } = render(<Host evidence={ev} rules={rules([HIDDEN])} />);
      const box = screen.getByRole('searchbox');
      await userEvent.type(box, 'a model');
      expect(await screen.findByRole('option', { name: /^A model/ }, { timeout: 4000 })).toBeInTheDocument();
      table['mc.anyModel'] = 'Any model';
      rerender(<Host evidence={ev} rules={rules([HIDDEN])} computerName="atlas " />);
      await userEvent.clear(box);
      await userEvent.type(box, 'any model');
      expect(await screen.findByRole('option', { name: /^Any model/ }, { timeout: 4000 })).toBeInTheDocument();
      noSpec();
    } finally {
      table['mc.anyModel'] = was;
    }
  });
});

describe('"In use" for a held Hoody AI model with no name to show', () => {
  type Rows = { body: { providers?: Array<{ id: string; status?: { state: string } }>; models?: Array<{ spec: string }> } };
  const ev = (change: (r: { providers: Rows; models: Rows }) => void) =>
    evidence7k('threeReady', { edit: (r) => change(r as unknown as { providers: Rows; models: Rows }) });
  const said = () => document.querySelector('[data-mc-row] p')?.textContent ?? '';

  it('gone: "This computer no longer lists this model."', () => {
    render(<Host value={HIDDEN} rules={rules([HIDDEN])} evidence={ev((r) => { r.providers.body.providers = r.providers.body.providers!.filter((p) => p.id !== 'hoody-ai'); })} />);
    expect(said()).toBe('This computer no longer lists this model.');
    noSpec();
  });

  it('needs setup: "This model needs setup before it can run."', () => {
    render(<Host value={HIDDEN} rules={rules([HIDDEN])} evidence={ev((r) => {
      r.models.body.models!.push({ spec: HIDDEN });
      for (const p of r.providers.body.providers!) if (p.id === 'hoody-ai' && p.status) p.status.state = 'needs_key';
    })} />);
    expect(said()).toBe('This model needs setup before it can run.');
    noSpec();
  });

  it('listed, not proven ready: "Can\'t tell if this model runs on atlas right now."', () => {
    render(<Host value={HIDDEN} rules={rules([HIDDEN])} evidence={ev((r) => { r.models.body.models!.push({ spec: HIDDEN }); })} />);
    expect(said()).toBe("Can't tell if this model runs on atlas right now.");
    noSpec();
  });
});
