// ModelPick: the panel is controlled (draft, onDraft, onCommit with an
// outcome), live mode commits each pick, saved mode commits on Use this model, the thinking step's levels and its
// reset only at a committed model change; the field always names its model; the chip opens the panel live.
import { providers, type ComputerRow, type Handoff } from '@core';
import { render, screen, waitFor, within } from '@app/testing';
import userEvent from '@testing-library/user-event';
import { act, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evidence7k, FIXTURE_SCOPE } from './fixtures/evidence7k';
import { ModelPickChip, ModelPickField, ModelPickPanel, type ModelPickPanelProps, type PickDraft, type PickOutcome } from './ModelPick';
import type { ThinkingLevel } from './modelPickLogic';
import type { ModelCatalogue } from './useModelCatalogue';

const FREE = 'hoody-ai/hoody-free';
const ROW = { id: 'c', project_id: 'p', server_name: 'atlas' } as unknown as ComputerRow;
const COMPUTER = { id: 'c', name: 'atlas', row: ROW };
const BOT_LEVELS: ThinkingLevel[] = ['', 'off', 'on', 'low', 'medium', 'high', 'xhigh', 'max'];

// The evidence handed in is the newest read, and a fresh read asked for takes that read's seq: these tests model a page whose
// read after a trip's return is the evidence given (ModelChooser.test pins evidence kept from before the trip).
function catalogueOf(ev = evidence7k('threeReady')): ModelCatalogue {
  return { evidence: ev, scope: FIXTURE_SCOPE, reading: false, failedAt: null, retry: () => undefined, pressRetry: () => undefined, retrying: false, attempt: () => { throw new Error('no attempt in this test'); }, setup: null, freshRead: () => ev.seq, settledSeq: ev.seq };
}

type Commit = ModelPickPanelProps['onCommit'];
function Saved({ value, onCommit, thinking = true, catalogue = catalogueOf(), onDone, restore }: { value: PickDraft; onCommit: Commit; thinking?: boolean; catalogue?: ModelCatalogue; onDone?: () => void; restore?: Handoff | null }) {
  const [draft, setDraft] = useState(value);
  return (
    <ModelPickPanel
      id="mp"
      label="Helper model"
      catalogue={catalogue}
      computer={COMPUTER}
      rules={providers.rulesFor('bot')}
      purpose="bot"
      value={value}
      draft={draft}
      onDraft={(d) => setDraft(d)}
      mode="saved"
      onCommit={onCommit}
      thinking={thinking ? { levels: BOT_LEVELS, inheritLabel: 'Default' } : null}
      onCancel={() => undefined}
      onDone={onDone}
      restore={restore ?? null}
    />
  );
}

/** An onCommit whose answer the test gives later. */
function deferred() {
  let give: (o: PickOutcome) => void = () => undefined;
  const answer = new Promise<PickOutcome>((r) => (give = r));
  return { onCommit: vi.fn<Commit>(() => answer), give: (o: PickOutcome) => act(async () => give(o)) };
}

const flush = async () => {
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  });
};
const list = () => screen.getByRole('listbox');
const useIt = () => screen.getByRole('button', { name: 'Use this model' });
// A ready model drawn on the first screen (the Ready list opens on Hoody AI, then OpenAI's 44 ready models).
const OTHER = 'openai/chat-latest';
const otherRow = () => {
  const o = within(list()).getAllByRole('option').find((x) => x.getAttribute('data-spec') === OTHER);
  if (!o) throw new Error(`${OTHER} is not drawn`);
  return o;
};

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
});
afterEach(() => vi.restoreAllMocks());

describe('the panel, saved mode', () => {
  it('a pick is a draft; Use this model commits it with the Choice; nothing commits before', async () => {
    const onCommit = vi.fn<Commit>(() => ({ kind: 'done' }));
    render(<Saved value={{ spec: FREE, thinking: '' }} onCommit={onCommit} />);
    await flush();
    expect(useIt()).toBeDisabled();
    const other = otherRow();
    await userEvent.click(other);
    expect(onCommit).not.toHaveBeenCalled();
    await userEvent.click(useIt());
    expect(onCommit).toHaveBeenCalledWith({ spec: other.getAttribute('data-spec'), thinking: '' }, expect.objectContaining({ kind: 'model', spec: other.getAttribute('data-spec'), readiness: 'ready' }));
  });

  it('a held level stays through a model change in the draft and resets only at the commit', async () => {
    const onCommit = vi.fn<Commit>(() => ({ kind: 'done' }));
    // Hoody Free told to take no level (reasoning false; the fixture leaves it unknown).
    const ev = evidence7k('threeReady', {
      edit: (r) => {
        const models = (r.models.body as unknown as { models: Array<Record<string, unknown>> }).models;
        models.find((x) => x.spec === FREE)!.reasoning = false;
      },
    });
    render(<Saved value={{ spec: FREE, thinking: 'high' }} onCommit={onCommit} catalogue={catalogueOf(ev)} />);
    await flush();
    // Hoody Free takes no level (reasoning false): the held one stays shown, last and marked, so it can be removed.
    const step = screen.getByRole('radiogroup', { name: 'Thinking' });
    expect(within(step).getAllByRole('radio').map((r) => r.getAttribute('aria-label') ?? r.textContent)).toEqual(['Default', "High (this model doesn't take it)"]);
    const other = otherRow();
    await userEvent.click(other);
    await userEvent.click(useIt());
    expect(onCommit.mock.calls[0]![0]).toEqual({ spec: other.getAttribute('data-spec'), thinking: '' });
  });

  it('only the level changed: the commit carries no Choice and keeps the model', async () => {
    const onCommit = vi.fn<Commit>(() => ({ kind: 'done' }));
    render(<Saved value={{ spec: FREE, thinking: 'high' }} onCommit={onCommit} />);
    await flush();
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Thinking' })).getByRole('radio', { name: 'Default' }));
    await userEvent.click(useIt());
    expect(onCommit).toHaveBeenCalledWith({ spec: FREE, thinking: '' }, null);
  });

  it('a pick away and back to the saved model, then a level: still no Choice, the model is unchanged', async () => {
    const onCommit = vi.fn<Commit>(() => ({ kind: 'done' }));
    render(<Saved value={{ spec: FREE, thinking: 'high' }} onCommit={onCommit} />);
    await flush();
    const other = otherRow();
    await userEvent.click(other);
    await userEvent.click(within(list()).getAllByRole('option').find((o) => o.getAttribute('data-spec') === FREE)!);
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Thinking' })).getByRole('radio', { name: 'Default' }));
    await userEvent.click(useIt());
    expect(onCommit).toHaveBeenCalledWith({ spec: FREE, thinking: '' }, null);
  });

  it('refused: its words as an alert, the draft kept; pending: not confirmed, everything waits', async () => {
    let answer: PickOutcome = { kind: 'refused', text: 'This model needs an output cap here.' };
    const onCommit = vi.fn<Commit>(() => answer);
    render(<Saved value={{ spec: FREE, thinking: '' }} onCommit={onCommit} />);
    await flush();
    const other = otherRow();
    await userEvent.click(other);
    await userEvent.click(useIt());
    expect(screen.getByRole('alert')).toHaveTextContent('This model needs an output cap here.');
    expect(useIt()).toBeEnabled();
    answer = { kind: 'pending' };
    await userEvent.click(useIt());
    // The pending words are a status of their own (the list's count is another one).
    expect(screen.getByText(/^Not confirmed yet/)).toHaveAttribute('role', 'status');
    expect(useIt()).toBeDisabled();
  });

  it('a commit that throws reads as pending, never as saved', async () => {
    const onDone = vi.fn();
    render(<Saved value={{ spec: FREE, thinking: '' }} onCommit={() => Promise.reject(new Error('lost'))} />);
    await flush();
    const other = otherRow();
    await userEvent.click(other);
    await userEvent.click(useIt());
    await waitFor(() => expect(screen.getByText(/^Not confirmed yet/)).toBeInTheDocument());
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('late answers and pending', () => {
  it('an answer after the panel closed closes nothing', async () => {
    const d = deferred();
    const onDone = vi.fn();
    const { unmount } = render(<Saved value={{ spec: FREE, thinking: '' }} onCommit={d.onCommit} onDone={onDone} />);
    await flush();
    await userEvent.click(otherRow());
    await userEvent.click(useIt());
    unmount();
    await d.give({ kind: 'done' });
    expect(onDone).not.toHaveBeenCalled();
  });

  it("an answer for another computer's panel is dropped: nothing closes, the panel waits on no save", async () => {
    const d = deferred();
    const onDone = vi.fn();
    const { rerender } = render(<Saved value={{ spec: FREE, thinking: '' }} onCommit={d.onCommit} onDone={onDone} />);
    await flush();
    await userEvent.click(otherRow());
    await userEvent.click(useIt());
    const SCOPE2 = { ...FIXTURE_SCOPE, computer: 'p|c2|zephyr' };
    rerender(<Saved value={{ spec: FREE, thinking: '' }} onCommit={d.onCommit} onDone={onDone} catalogue={{ ...catalogueOf(evidence7k('threeReady', { scope: SCOPE2 })), scope: SCOPE2 }} />);
    await flush();
    await d.give({ kind: 'done' });
    expect(onDone).not.toHaveBeenCalled();
    expect(useIt()).toBeEnabled();
  });

  it("pending ends when the caller's value moves (its save landed)", async () => {
    const onCommit = vi.fn<Commit>(() => ({ kind: 'pending' }));
    const { rerender } = render(<Saved value={{ spec: FREE, thinking: '' }} onCommit={onCommit} />);
    await flush();
    await userEvent.click(otherRow());
    await userEvent.click(useIt());
    expect(screen.getByText(/^Not confirmed yet/)).toBeInTheDocument();
    rerender(<Saved value={{ spec: OTHER, thinking: '' }} onCommit={onCommit} />);
    await flush();
    expect(screen.queryByText(/^Not confirmed yet/)).toBeNull();
  });

  it('a value that moves before a pending answer arrives leaves nothing waiting', async () => {
    const d = deferred();
    const { rerender } = render(<Saved value={{ spec: FREE, thinking: '' }} onCommit={d.onCommit} />);
    await flush();
    await userEvent.click(otherRow());
    await userEvent.click(useIt());
    rerender(<Saved value={{ spec: OTHER, thinking: '' }} onCommit={d.onCommit} />);
    await flush();
    await d.give({ kind: 'pending' });
    expect(screen.queryByText(/^Not confirmed yet/)).toBeNull();
  });

  it('a pending save waits through an unrelated change, and through a change and back; it ends on what it sent', async () => {
    const onCommit = vi.fn<Commit>(() => ({ kind: 'pending' }));
    const { rerender } = render(<Saved value={{ spec: FREE, thinking: '' }} onCommit={onCommit} />);
    await flush();
    await userEvent.click(otherRow());
    await userEvent.click(useIt());
    expect(screen.getByText(/^Not confirmed yet/)).toBeInTheDocument();
    // Another field's level moved (not this save), then back: still waiting.
    rerender(<Saved value={{ spec: FREE, thinking: 'high' }} onCommit={onCommit} />);
    await flush();
    expect(screen.getByText(/^Not confirmed yet/)).toBeInTheDocument();
    rerender(<Saved value={{ spec: FREE, thinking: '' }} onCommit={onCommit} />);
    await flush();
    expect(screen.getByText(/^Not confirmed yet/)).toBeInTheDocument();
    rerender(<Saved value={{ spec: OTHER, thinking: '' }} onCommit={onCommit} />);
    await flush();
    expect(screen.queryByText(/^Not confirmed yet/)).toBeNull();
  });

  it('a live re-pick of the current model answered pending waits: the unchanged value proves nothing', async () => {
    const d = deferred();
    render(<ModelPickChip label="Model" catalogue={catalogueOf()} computer={COMPUTER} rules={providers.rulesFor('bot')} purpose="bot" value={{ spec: OTHER, thinking: '' }} onCommit={d.onCommit} />);
    await userEvent.click(screen.getByRole('button', { name: /^Model: / }));
    await flush();
    await userEvent.click(otherRow());
    await d.give({ kind: 'pending' });
    expect(screen.getByText(/^Not confirmed yet/)).toBeInTheDocument();
  });

  it('a change and back before a pending answer is no answer: the panel waits', async () => {
    const d = deferred();
    const { rerender } = render(<Saved value={{ spec: FREE, thinking: '' }} onCommit={d.onCommit} />);
    await flush();
    await userEvent.click(otherRow());
    await userEvent.click(useIt());
    rerender(<Saved value={{ spec: FREE, thinking: 'high' }} onCommit={d.onCommit} />);
    await flush();
    rerender(<Saved value={{ spec: FREE, thinking: '' }} onCommit={d.onCommit} />);
    await flush();
    await d.give({ kind: 'pending' });
    expect(screen.getByText(/^Not confirmed yet/)).toBeInTheDocument();
  });

  it('the field\'s drawer does not close while a commit is in flight (Escape refused), then closes on done', async () => {
    const d = deferred();
    render(<ModelPickField label="Bot model" rules={providers.rulesFor('bot')} purpose="bot" onCommit={d.onCommit} resizeKey="test-model-field-busy" catalogue={catalogueOf()} computer={COMPUTER} value={{ spec: FREE, thinking: '' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change Bot model' }));
    await flush();
    await userEvent.click(otherRow());
    await userEvent.click(useIt());
    await userEvent.keyboard('{Escape}');
    await flush();
    // Refused outright: no "Discard changes?" ask (that is a dirty close, which would discard a save in flight).
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
    await d.give({ kind: 'done' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it("a host whose own Save commits gets the commit-ready draft with each change (footer={false})", async () => {
    const onDraft = vi.fn();
    function Host() {
      const [draft, setDraft] = useState<PickDraft>({ spec: FREE, thinking: 'high' });
      return (
        <ModelPickPanel
          label="Helper model"
          catalogue={catalogueOf()}
          computer={COMPUTER}
          rules={providers.rulesFor('bot')}
          purpose="bot"
          value={{ spec: FREE, thinking: 'high' }}
          draft={draft}
          onDraft={(dd, c, ready) => {
            onDraft(dd, ready);
            setDraft(dd);
          }}
          mode="saved"
          footer={false}
          onCommit={() => ({ kind: 'done' })}
          thinking={{ levels: BOT_LEVELS, inheritLabel: 'Default' }}
        />
      );
    }
    render(<Host />);
    await flush();
    await userEvent.click(otherRow());
    // The draft keeps the carried level; what a Save sends resets it (the model changed, the level was not chosen for it).
    expect(onDraft).toHaveBeenLastCalledWith({ spec: OTHER, thinking: 'high' }, { spec: OTHER, thinking: '' });
  });

  it('a level chosen for the newly picked model is committed with it, not reset', async () => {
    const onCommit = vi.fn<Commit>(() => ({ kind: 'done' }));
    const ev = evidence7k('threeReady', {
      edit: (r) => {
        const m = (r.models.body as unknown as { models: Array<Record<string, unknown>> }).models.find((x) => x.spec === OTHER)!;
        m.reasoning = true;
        m.efforts = ['low', 'high'];
      },
    });
    render(<Saved value={{ spec: FREE, thinking: '' }} onCommit={onCommit} catalogue={catalogueOf(ev)} />);
    await flush();
    await userEvent.click(otherRow());
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Thinking' })).getByRole('radio', { name: 'High' }));
    await userEvent.click(useIt());
    expect(onCommit.mock.calls[0]![0]).toEqual({ spec: OTHER, thinking: 'high' });
  });
});

describe('a setup trip back with its pick', () => {
  const back = (spec: string, thinking: ThinkingLevel): Handoff => ({
    v: 1,
    id: '0123456789abcdef',
    at: Date.now(),
    scope: { ...FIXTURE_SCOPE },
    origin: { page: 'bots', href: '/bots?drawer=new', label: 'New Bot', focus: 'nb-model' },
    target: { computer: 'c', name: 'atlas' },
    dest: 'connect',
    pick: { intent: 'pick', spec, thinking },
  });

  it('the draft becomes the picked model with its thinking; Use this model commits both, the level not reset', async () => {
    const onCommit = vi.fn<Commit>(() => ({ kind: 'done' }));
    render(<Saved value={{ spec: FREE, thinking: '' }} onCommit={onCommit} restore={back(OTHER, 'high')} />);
    await flush();
    await waitFor(() => expect(useIt()).toBeEnabled());
    await userEvent.click(useIt());
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]![0]).toEqual({ spec: OTHER, thinking: 'high' });
    expect(onCommit.mock.calls[0]![1]).toMatchObject({ kind: 'model', spec: OTHER });
  });

  const LiveHost = ({ catalogue, onCommit, restore }: { catalogue: ModelCatalogue; onCommit: Commit; restore: Handoff }) => (
    <ModelPickPanel
      id="mp"
      label="Model"
      catalogue={catalogue}
      computer={COMPUTER}
      rules={providers.rulesFor('bot')}
      purpose="bot"
      value={{ spec: FREE, thinking: '' }}
      draft={{ spec: FREE, thinking: '' }}
      onDraft={() => undefined}
      mode="live"
      onCommit={onCommit}
      thinking={{ levels: BOT_LEVELS, inheritLabel: 'Default' }}
      restore={restore}
    />
  );

  it('waits while the catalogue is still being read, then judges what it reads; later reads hand nothing back again', async () => {
    const onCommit = vi.fn<Commit>(() => ({ kind: 'done' }));
    const h = back(OTHER, 'medium');
    const r = render(<LiveHost catalogue={catalogueOf(evidence7k('loading'))} onCommit={onCommit} restore={h} />);
    await flush();
    expect(onCommit).not.toHaveBeenCalled();
    r.rerender(<LiveHost catalogue={catalogueOf(evidence7k('threeReady', { seq: 2 }))} onCommit={onCommit} restore={h} />);
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit.mock.calls[0]![0]).toEqual({ spec: OTHER, thinking: 'medium' });
    r.rerender(<LiveHost catalogue={catalogueOf(evidence7k('threeReady', { seq: 3 }))} onCommit={onCommit} restore={h} />);
    await flush();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('live mode (the chip): the returned pick is committed at once', async () => {
    const onCommit = vi.fn<Commit>(() => ({ kind: 'done' }));
    render(
      <ModelPickPanel
        id="mp"
        label="Model"
        catalogue={catalogueOf()}
        computer={COMPUTER}
        rules={providers.rulesFor('bot')}
        purpose="bot"
        value={{ spec: FREE, thinking: '' }}
        draft={{ spec: FREE, thinking: '' }}
        onDraft={() => undefined}
        mode="live"
        onCommit={onCommit}
        thinking={{ levels: BOT_LEVELS, inheritLabel: 'Default' }}
        restore={back(OTHER, 'low')}
      />,
    );
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit.mock.calls[0]![0]).toEqual({ spec: OTHER, thinking: 'low' });
  });

  it('a catalogue that cannot say which read is fresh (no freshRead): the pick is never handed back, nothing committed', async () => {
    const onCommit = vi.fn<Commit>(() => ({ kind: 'done' }));
    const { freshRead: _f, settledSeq: _s, ...blind } = catalogueOf();
    render(<LiveHost catalogue={blind} onCommit={onCommit} restore={back(OTHER, 'low')} />);
    await flush();
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe('thinking levels', () => {
  it("a thinking model offers '' and the caller's vocabulary narrowed to the model's own efforts", async () => {
    const ev = evidence7k('threeReady', {
      edit: (r) => {
        const models = (r.models.body as unknown as { models: Array<Record<string, unknown>> }).models;
        const m = models.find((x) => String(x.spec).startsWith('deepseek/'))!;
        m.reasoning = true;
        m.efforts = ['low', 'high'];
      },
    });
    const spec = (ev.catalogue.state === 'ok' ? ev.catalogue.value.cat.models.find((m) => m.spec.startsWith('deepseek/'))!.spec : '')!;
    render(
      <ModelPickPanel
        label="Helper model"
        catalogue={catalogueOf(ev)}
        computer={COMPUTER}
        rules={providers.rulesFor('bot')}
        purpose="bot"
        value={{ spec, thinking: '' }}
        draft={{ spec, thinking: '' }}
        onDraft={() => undefined}
        mode="saved"
        onCommit={() => ({ kind: 'done' })}
        thinking={{ levels: BOT_LEVELS, inheritLabel: 'Default', switches: ['off', 'on'] }}
      />,
    );
    await flush();
    const radios = within(screen.getByRole('radiogroup', { name: 'Thinking' })).getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(['Default', 'Off', 'On', 'Low', 'High']);
    cleanup();
    // Without known switches, no Off/On is offered.
    render(
      <ModelPickPanel
        label="Helper model"
        catalogue={catalogueOf(ev)}
        computer={COMPUTER}
        rules={providers.rulesFor('bot')}
        purpose="bot"
        value={{ spec, thinking: '' }}
        draft={{ spec, thinking: '' }}
        onDraft={() => undefined}
        mode="saved"
        onCommit={() => ({ kind: 'done' })}
        thinking={{ levels: BOT_LEVELS, inheritLabel: 'Default' }}
      />,
    );
    await flush();
    const bare = within(screen.getByRole('radiogroup', { name: 'Thinking' })).getAllByRole('radio');
    expect(bare.map((r) => r.textContent)).toEqual(['Default', 'Low', 'High']);
  });
});

describe('live mode, the chip and the field', () => {
  it('the chip names the model and its panel commits a pick at once', async () => {
    const onCommit = vi.fn<Commit>(() => ({ kind: 'done' }));
    render(<ModelPickChip label="Model" catalogue={catalogueOf()} computer={COMPUTER} rules={providers.rulesFor('bot')} purpose="bot" value={{ spec: FREE, thinking: '' }} onCommit={onCommit} />);
    const chip = screen.getByRole('button', { name: 'Model: Hoody Free' });
    await userEvent.click(chip);
    await flush();
    const other = otherRow();
    await userEvent.click(other);
    expect(onCommit).toHaveBeenCalledWith({ spec: other.getAttribute('data-spec'), thinking: '' }, expect.objectContaining({ kind: 'model' }));
  });

  it('the field always names its model, even with no computer; the inherit row reads its label and what it resolves to', () => {
    const base = { label: 'Bot model', rules: providers.rulesFor('bot', { inherit: true }), purpose: 'bot' as const, onCommit: () => ({ kind: 'done' }) as const, resizeKey: 'test-model-field' };
    const { unmount } = render(<ModelPickField {...base} catalogue={null} computer={null} value={{ spec: FREE, thinking: '' }} />);
    // No catalogue: the spec's own words (core modelNameOf), never blank.
    expect(screen.getByText('hoody-free')).toBeInTheDocument();
    expect(screen.getByText('Choose a computer')).toBeInTheDocument();
    unmount();
    render(<ModelPickField {...base} catalogue={catalogueOf()} computer={COMPUTER} value={{ spec: '', thinking: '' }} inherit={{ label: 'Bots default', resolved: 'now Hoody Free' }} />);
    expect(screen.getByText('Bots default · now Hoody Free')).toBeInTheDocument();
    expect(screen.queryByText("Can't tell")).toBeNull();
  });

  it('an inherit row the caller cannot resolve shows its label alone and reads Can\'t tell, never a stale name', () => {
    const base = { label: 'Bot model', rules: providers.rulesFor('bot', { inherit: true }), purpose: 'bot' as const, onCommit: () => ({ kind: 'done' }) as const, resizeKey: 'test-model-field-3' };
    render(<ModelPickField {...base} catalogue={catalogueOf()} computer={COMPUTER} value={{ spec: '', thinking: '' }} inherit={{ label: 'Bots default (AI page)', resolved: null }} />);
    expect(screen.getByText('Bots default (AI page)')).toBeInTheDocument();
    expect(screen.getByText("Can't tell")).toBeInTheDocument();
  });

  it('disabledReason disables Change and describes the field; an error is an alert', () => {
    render(<ModelPickField label="Light model" rules={providers.rulesFor('bot')} purpose="bot" onCommit={() => ({ kind: 'done' })} resizeKey="test-model-field-2" catalogue={catalogueOf()} computer={COMPUTER} value={{ spec: FREE, thinking: '' }} disabledReason="Routing is off." error="Choose a model for light tasks." />);
    expect(screen.getByRole('button', { name: 'Change Light model' })).toBeDisabled();
    expect(screen.getByRole('group', { name: 'Light model' })).toHaveAccessibleDescription('Routing is off. Choose a model for light tasks.');
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a model for light tasks.');
  });
});
