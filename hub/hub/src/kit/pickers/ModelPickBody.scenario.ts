// ModelPickBody: picking a model from the one list (web and terminal), over the 7,078-model fixture
// catalogue. A ready row chooses; a row that needs setup opens the setup step and never chooses; the held value is the
// selected row; a failed read offers Try again; "Your own endpoint" goes to the host.
import { providers } from '@core';
import { scenarios } from '../scenario-types';
import { loose } from '../layouts/scenarioRoute';
import { evidence7k } from './fixtures/evidence7k';
import { ModelPickBody } from './ModelPickBody';
import { NO_MODEL_PREFS } from './modelPickLogic';

const FREE = 'hoody-ai/hoody-free';
const LIST_ON_TERM = { platform: 'term' as const, why: 'the web list is virtualized: the test DOM has no layout, so it draws no rows (rows are pinned in ModelPickBody.test.tsx with mocked sizes)' };
type S = { fn(n: string): (...a: unknown[]) => void };
const base = (s: S, more: Record<string, unknown> = {}) => ({
  id: 'mp', evidence: evidence7k('threeReady'), computerName: 'atlas', value: '', rules: providers.rulesFor('bot'), purpose: 'bot',
  onChoose: s.fn('onChoose'), onSetup: s.fn('onSetup'), onOtherWay: s.fn('onOtherWay'), onRetry: s.fn('onRetry'),
  pick: { prefs: NO_MODEL_PREFS, onPrefs: () => undefined }, ...more,
});

export default scenarios('ModelPickBody', loose(ModelPickBody), {
  ignored: {},
  unsupported: {
    onSetupView: 'a search or a filter change ends the caller\'s setup step: pinned in ModelPickBody.test.tsx; the count of calls differs per keystroke model, so no shared case',
  },
  cases: [
    {
      name: 'a ready row chooses its model and opens no setup',
      only: LIST_ON_TERM,
      covers: ['evidence', 'onChoose'],
      props: (s) => base(s),
      steps: [{ click: { role: 'option', nth: 0 } }],
      expect: { calls: { onChoose: 1, onSetup: 0 } },
    },
    {
      name: 'a row that needs setup opens the setup step and chooses nothing',
      only: LIST_ON_TERM,
      covers: ['onSetup', 'pick'],
      props: (s) => base(s, { pick: { prefs: { ...NO_MODEL_PREFS, readiness: 'setup' }, onPrefs: () => undefined } }),
      steps: [{ click: { role: 'option', nth: 0 } }],
      expect: { calls: { onSetup: 1, onChoose: 0 } },
    },
    {
      name: 'the held value is the selected row',
      only: LIST_ON_TERM,
      covers: ['value'],
      props: (s) => base(s, { value: FREE }),
      steps: [],
      expect: { nodes: [{ target: { role: 'option', selected: true, nth: 0 } }] },
    },
    {
      name: 'a failed read says so and Try again asks the host',
      covers: ['onRetry', 'evidence'],
      props: (s) => base(s, { evidence: evidence7k('catalogueFailed'), value: FREE }),
      steps: [{ press: { role: 'button', name: 'Try again' } }],
      expect: { calls: { onRetry: 1, onChoose: 0 }, nodes: [{ target: { text: /Models couldn't be read\./ } }] },
    },
    {
      name: 'Your own endpoint goes to the host as the endpoint way',
      covers: ['onOtherWay'],
      props: (s) => base(s),
      steps: [{ press: { role: 'button', name: 'Your own endpoint' } }],
      expect: { calls: { onOtherWay: [['endpoint']], onChoose: 0 } },
    },
  ],
});
