// PickerPanel: picking from a list, as a person does it (web and terminal). The panel keeps no pick:
// `onChange` reports the new list. Single mode picks with a press; multi ticks, and `minPicked` refuses the last untick
// with a hint; a disabled row says why and never reports; a search narrows and "Show all" brings everything back; a
// foldable group opens on its toggle; Enter in multi mode confirms.
import { scenarios } from '../scenario-types';
import { loose } from '../layouts/scenarioRoute';
import { PickerPanel } from './PickerPanel';

const ITEMS = [
  { id: 'r1', label: 'Personal' },
  { id: 'r2', label: 'Lab', description: 'Experiments' },
  { id: 'r3', label: 'Acme client', isDisabled: true, disabledReason: 'Owned by another account' },
];
const MANY = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, label: `computer-${i}`, ...(i >= 7 ? { group: 'old', groupLabel: 'Old' } : {}) }));
const WEB_ONLY_CSS = 'no CSS classes in a terminal';

export default scenarios('PickerPanel', loose(PickerPanel), {
  ignored: { className: WEB_ONLY_CSS },
  unsupported: {
    renderCreate: 'the create slot draws what the caller gives (pinned in the terminal test: ↓ from the last row reaches it)',
    footer: 'two buttons outside the list; the footer row is drawn and pressable on both, pinned in the web PickerPanel.test.tsx',
    status: 'the error state is ErrorState (its own scenarios); loading is Skeleton',
    emptyText: 'the empty sentence is EmptyState (its own scenarios)',
    keepOrder: 'an order rule of pickerLogic.ts (unit-tested there, shared by both)',
    showLabel: 'a drawn label above the list: look only',
  },
  cases: [
    {
      name: 'single: pressing a row reports it; the disabled row is shown, says why and never reports',
      props: (s) => ({ label: 'Realm', items: ITEMS, mode: 'single', value: ['r1'], onChange: s.fn('onChange') }),
      covers: ['label', 'items', 'mode', 'value'],
      steps: [{ click: { role: 'radio', name: /^Lab/ } }, { click: { role: 'radio', name: /^Acme client/ }, force: true }],
      expect: {
        calls: { onChange: [[['r2']]] },
        nodes: [{ target: { role: 'radio', name: /^Acme client.*Owned by another account/ }, states: { disabled: true } }, { target: { role: 'radio', name: /^Personal/ }, states: { checked: true } }],
      },
    },
    {
      name: 'multi: a tick reports the new list; minPicked refuses the last untick and says so',
      props: (s) => ({ label: 'Realms', items: ITEMS, mode: 'multi', value: ['r1'], minPicked: 1, onChange: s.fn('onChange'), summary: (n: number) => `${n} realms` }),
      covers: ['mode', 'minPicked', 'summary'],
      steps: [{ click: { role: 'checkbox', name: /^Personal/ } }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: { text: /Keep at least 1 selected/ } }, { target: { text: /1 realms/ } }] },
    },
    {
      name: 'multi: arrows move from the list\'s stop; Space ticks; Enter confirms (a form\'s next step)',
      props: (s) => ({ label: 'Realms', items: ITEMS, mode: 'multi', value: [], onChange: s.fn('onChange'), onConfirm: s.fn('onConfirm') }),
      covers: ['onConfirm', 'onChange'],
      steps: [{ focus: { role: 'checkbox', name: /^Personal/ } }, { key: 'down' }, { key: 'space' }, { key: 'enter' }],
      expect: { calls: { onChange: [[['r2']]], onConfirm: 1 } },
    },
    {
      name: 'search: more than 7 rows bring the search box; no match offers Show all, which brings every row back',
      props: (s) => ({ label: 'Computer', items: MANY, mode: 'single', value: [], onChange: s.fn('onChange'), searchLabel: 'Find a computer' }),
      covers: ['searchLabel', 'searchable'],
      steps: [{ type: [{ role: 'searchbox', name: 'Find a computer' }, 'zzz'] }, { expect: { nodes: [{ target: { text: /No match for "zzz"/ } }] } }, { press: { role: 'button', name: 'Show all' } }],
      expect: { nodes: [{ target: { role: 'radio', name: /^computer-3/ } }] },
    },
    {
      name: 'a collapsible group starts folded; its toggle names it and its count, and opens it',
      props: (s) => ({ label: 'Computer', items: MANY, mode: 'single', value: [], onChange: s.fn('onChange'), collapsible: ['old'] }),
      covers: ['collapsible'],
      steps: [{ expect: { nodes: [{ target: { role: 'radio', name: /^computer-8/ }, absent: true }] } }, { press: { role: 'button', name: 'Old (2)' } }],
      expect: { nodes: [{ target: { role: 'radio', name: /^computer-8/ } }, { target: { role: 'button', name: 'Old (2)' }, states: { expanded: true } }] },
    },
    {
      name: 'disabled: no row reports',
      props: (s) => ({ label: 'Realm', items: ITEMS, mode: 'single', value: [], onChange: s.fn('onChange'), isDisabled: true }),
      covers: ['isDisabled'],
      steps: [{ click: { role: 'radio', name: /^Lab/ }, force: true }],
      expect: { calls: { onChange: 0 } },
    },
  ],
});
