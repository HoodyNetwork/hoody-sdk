// ModelListbox, ModelOption and ModelPager: choosing a model as a person does it (web and terminal).
// The list keeps no pick: activating a row reports its spec, the caller decides (choose, ask, set up). Selection never
// follows focus; a row that cannot be chosen yet still takes the cursor and never reports; `locked` reports nothing;
// arrows move across groups; a printable key goes to the search; Escape asks the caller.
import { scenarios } from '../scenario-types';
import { loose } from '../layouts/scenarioRoute';
import { ModelListbox, ModelOption, ModelPager } from './ModelListbox';

const GROUPS = [
  {
    id: 'hoody-ai',
    header: 'Hoody AI',
    options: [{ spec: 'hoody/free', label: 'Hoody Free', tags: ['Current'], selected: true }],
  },
  {
    id: 'openai',
    header: 'OpenAI',
    options: [
      { spec: 'openai/gpt-5', label: 'GPT-5', state: 'Your key', selected: false },
      { spec: 'openai/gpt-5-mini', label: 'GPT-5 mini', state: 'Loading…', selected: false, isDisabled: true },
    ],
  },
];
const PG = { page: 0, pages: 3, size: 100, total: 250, from: 1, to: 100, hasPrev: false, hasNext: true };
const WEB_ONLY_CSS = 'no CSS classes in a terminal';
const PROBE = 'a render-count probe for the web memo test (ModelListbox.test.tsx); draws nothing';

export default [
  scenarios('ModelListbox', loose(ModelListbox), {
    ignored: {},
    unsupported: {
      focusSpec: 'an asked focus after a page change or Back: pinned in ModelListbox.term.test.tsx and the web ModelListbox.test.tsx',
      focusToken: 'goes with focusSpec (pinned in the tests)',
      renderProbe: PROBE,
      describedBy: 'the count line\'s id; the line lives in the caller (ModelBrowser)',
      labelledBy: 'the view heading\'s id; the heading lives in the caller (ModelBrowser)',
    },
    cases: [
      {
        name: 'pressing a row reports its spec; the value is the selected row; a row not ready yet never reports',
        props: (s) => ({ id: 'ml', labelledBy: 'h', groups: GROUPS, onActivate: s.fn('onActivate') }),
        covers: ['id', 'groups', 'onActivate'],
        steps: [{ click: { role: 'option', name: /^GPT-5$/ } }, { click: { role: 'option', name: /^GPT-5 mini/ }, force: true }],
        expect: {
          calls: { onActivate: [['openai/gpt-5']] },
          nodes: [
            { target: { role: 'option', name: /^Hoody Free Current/ }, states: { selected: true } },
            { target: { role: 'option', name: /^GPT-5 mini/ }, states: { disabled: true } },
            { target: { role: 'group', name: 'OpenAI' } },
          ],
        },
      },
      {
        name: 'from the value, ↓ crosses into the next group and Enter activates there',
        props: (s) => ({ id: 'ml', labelledBy: 'h', groups: GROUPS, onActivate: s.fn('onActivate') }),
        steps: [{ focus: { role: 'option', name: /^Hoody Free/ } }, { key: 'down' }, { key: 'enter' }],
        expect: { calls: { onActivate: [['openai/gpt-5']] } },
      },
      {
        name: 'a letter goes to the search; Escape asks the caller',
        props: (s) => ({ id: 'ml', labelledBy: 'h', groups: GROUPS, onActivate: s.fn('onActivate'), onType: s.fn('onType'), onEscape: s.fn('onEscape') }),
        covers: ['onType', 'onEscape'],
        steps: [{ focus: { role: 'option', name: /^Hoody Free/ } }, { key: 'g' }, { key: 'escape' }],
        expect: { calls: { onType: [['g']], onEscape: 1, onActivate: 0 } },
      },
      {
        name: 'locked (saving): a press reports nothing',
        props: (s) => ({ id: 'ml', labelledBy: 'h', groups: GROUPS, locked: true, onActivate: s.fn('onActivate') }),
        covers: ['locked'],
        steps: [{ click: { role: 'option', name: /^GPT-5$/ } }],
        expect: { calls: { onActivate: 0 } },
      },
    ],
  }),
  scenarios('ModelOption', loose(ModelOption), {
    ignored: {
      className: WEB_ONLY_CSS,
      listId: 'the option\'s DOM id prefix; the terminal addresses rows through the semantics tree',
      probe: 'read only to count renders for the web memo test (ModelListbox.test.tsx); draws nothing',
    },
    unsupported: {},
    cases: [
      {
        name: 'a press reports the spec; an arrow goes to the caller\'s key handler',
        props: (s) => ({
          listId: 'pl', o: { spec: 'openai/gpt-5', label: 'GPT-5', tags: ['Recommended'], state: 'Your key', selected: false }, tabbable: true,
          onKey: s.fn('onKey'), onPick: s.fn('onPick'), onFocusOpt: s.fn('onFocusOpt'),
        }),
        covers: ['o', 'tabbable', 'onKey', 'onPick', 'onFocusOpt'],
        steps: [{ click: { role: 'option', name: 'GPT-5 Recommended' } }, { focus: { role: 'option', name: 'GPT-5 Recommended' } }, { key: 'down' }],
        expect: { calls: { onPick: [['openai/gpt-5']], onKey: 1 }, nodes: [{ target: { role: 'option', name: 'GPT-5 Recommended' }, states: { selected: false } }] },
      },
    ],
  }),
  scenarios('ModelPager', loose(ModelPager), {
    ignored: { idBase: 'read only to pass on as the buttons\' ids (the web caller restores focus by them)' },
    unsupported: {},
    cases: [
      {
        name: 'Next pages on; Previous is disabled on the first page; the range is shown',
        props: (s) => ({ pg: PG, navLabel: 'OpenAI models pages', range: '1–100 of 250', prev: 'Previous', next: 'Next', onPage: s.fn('onPage'), idBase: 'pg' }),
        covers: ['pg', 'navLabel', 'range', 'prev', 'next', 'onPage'],
        steps: [{ press: { role: 'button', name: 'Next' } }],
        expect: {
          calls: { onPage: [[1]] },
          nodes: [{ target: { role: 'button', name: 'Previous' }, states: { disabled: true } }, { target: { text: /1–100 of 250/ } }, { target: { role: 'navigation', name: 'OpenAI models pages' } }],
        },
      },
    ],
  }),
];
