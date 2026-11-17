// Vitest: the Explain drawer always names the picked model. A pick the model list
// does not hold, whose shown name comes out empty (explain.ts nameOf: a Hoody AI spec cut to nothing), shows the
// generic word, never an empty bold name beside "This model may need a key or setup first".
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@app/testing';
import { providers } from '@core';
import { ExplainDrawer } from './parts/ExplainDrawer';
import type { ExplainFlow, ExplainView } from './explain-flow';
import strings from './strings.en.json';

const table = strings as Record<string, string>;
const t = ((k: string, o?: Record<string, unknown>) => (table[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(o?.[x] ?? ''))) as never;

function flowOf(over: Partial<ExplainView>): ExplainFlow {
  const v: ExplainView = {
    subject: 's', name: null, text: 'x', system: 'y', fewer: null, loading: false, rows: [], pick: null, label: '', ready: null,
    choice: null, rules: providers.rulesFor('explain'), defaultSpec: null,
    cost: null, note: null, picker: false, busy: false, asked: false, out: null, closed: false, ...over,
  };
  return {
    get: () => v, subscribe: () => () => {}, start() {}, choose() {}, consent() {}, setEvidence() {}, costOf: () => ['cost.unknown'], togglePicker() {}, ask() {}, close() {},
    session: {} as never,
  };
}
// The model is a setting row; its value names the model and its readiness.
const modelLine = () => document.querySelector('[data-explain-model]') as HTMLElement;

describe('Explain drawer model name', () => {
  afterEach(cleanup);

  it('explain_unlisted_pick_with_no_name_shows_generic_word', () => {
    render(<ExplainDrawer t={t} flow={flowOf({ pick: 'hoody-ai/x', label: '', rows: [], ready: 'unknown', note: 'unlisted' })} onClose={() => {}} />);
    const b = modelLine().querySelector('b');
    expect(b?.textContent).toBe(strings['explain.model.noName']);
  });

  it('a listed pick keeps its own name; an unnamed listed pick keeps its numbered name', () => {
    render(<ExplainDrawer t={t} flow={flowOf({ pick: 'p/a', label: 'Alpha', rows: [{ spec: 'p/a', label: 'Alpha', ready: 'ready', price: null }], ready: 'ready' })} onClose={() => {}} />);
    expect(modelLine().querySelector('b')?.textContent).toBe('Alpha');
    cleanup();
    render(<ExplainDrawer t={t} flow={flowOf({ pick: 'p/b', label: '', rows: [{ spec: 'p/b', label: '', ready: 'ready', price: null }], ready: 'ready' })} onClose={() => {}} />);
    expect(modelLine().querySelector('b')?.textContent).toBe(strings['explain.model.unnamed'].replace('{{n}}', '1'));
  });
});
