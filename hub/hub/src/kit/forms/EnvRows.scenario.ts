// Behaviour contract of EnvRows, run on the web and in the terminal (src/term/scenario).
// One row per variable (name field, masked value, Remove), the caller's error line, Add. The caller owns the rows:
// typing reports onEdit(id, change) once per key, Remove onRemove(id), Add onAdd(). isDisabled holds every field and
// button. A value is never readable anywhere (frame/DOM text, tree, attributes).
// The name field is found by position: the value input is a password field on the web (no textbox role), and the
// terminal TextField does not name a field by aria-label yet; the first textbox is row 1's name on both.
import { scenarios } from '../scenario-types';
import { EnvRows } from './EnvRows';

const SECRET = 'hunter2-Sekr1t';
const ROWS = [{ id: 7, key: 'API_URL', value: SECRET }];
const LABELS = {
  key: (n: number) => `Name ${n}`, value: (n: number) => `Value ${n}`, remove: (n: number) => `Remove ${n}`,
  keyHint: 'NAME', valueHint: 'value', add: 'Add variable',
};
const base = { rows: ROWS, legend: 'Environment', help: 'Values stay on this computer.', labels: LABELS };
const NAME1 = { role: 'textbox', nth: 0 } as const;
const REMOVE1 = { role: 'button', name: 'Remove 1' } as const;
const ADD = { role: 'button', name: 'Add variable' } as const;

export default scenarios('EnvRows', EnvRows, {
  ignored: {
    titled: 'look only: the legend is already the bold title line of its group',
    helpBelow: 'read: it only moves a titled group\'s description under the control; the same text shows either way, and a case cannot see order',
  },
  unsupported: {},
  cases: [
    {
      name: 'typing in a name reports one edit per key, with the row id',
      props: (s) => ({ ...base, onEdit: s.fn('onEdit'), onRemove: s.fn('onRemove'), onAdd: s.fn('onAdd') }),
      steps: [{ type: [NAME1, 'X'] }],
      expect: { calls: { onEdit: [[7, { key: 'API_URLX' }]], onRemove: 0, onAdd: 0 } },
    },
    {
      name: 'Remove removes its own row',
      props: (s) => ({ ...base, onEdit: s.fn('onEdit'), onRemove: s.fn('onRemove'), onAdd: s.fn('onAdd') }),
      steps: [{ press: REMOVE1 }],
      expect: { calls: { onRemove: [[7]], onAdd: 0, onEdit: 0 } },
    },
    {
      name: 'Add asks for a row',
      props: (s) => ({ ...base, onEdit: s.fn('onEdit'), onRemove: s.fn('onRemove'), onAdd: s.fn('onAdd') }),
      steps: [{ press: ADD }],
      expect: { calls: { onAdd: [[]], onRemove: 0 } },
    },
    {
      name: 'the value is never readable; the name is',
      props: { ...base, onEdit: () => {}, onRemove: () => {}, onAdd: () => {} },
      steps: [],
      expect: { neverShown: [SECRET, SECRET.slice(0, 6)], nodes: [{ target: NAME1, value: 'API_URL' }] },
    },
    {
      name: 'the legend names the group',
      props: { ...base, onEdit: () => {}, onRemove: () => {}, onAdd: () => {} },
      steps: [],
      expect: { nodes: [{ target: { text: /^Environment$/ } }] },
    },
    {
      name: "the caller's error shows",
      props: { ...base, onEdit: () => {}, onRemove: () => {}, onAdd: () => {}, error: 'Names must be unique.' },
      steps: [],
      expect: { nodes: [{ target: { text: /Names must be unique\./ } }] },
    },
    {
      name: 'label, description and errorMessage are the same three words',
      props: { rows: ROWS, labels: LABELS, label: 'Environment', description: 'Values stay on this computer.', errorMessage: 'Names must be unique.', onEdit: () => {}, onRemove: () => {}, onAdd: () => {} },
      steps: [],
      expect: { nodes: [{ target: { text: /Environment/ } }, { target: { text: /Values stay on this computer\./ } }, { target: { text: /Names must be unique\./ } }] },
    },
    {
      name: 'helpBelow still shows the help',
      props: { ...base, helpBelow: true, onEdit: () => {}, onRemove: () => {}, onAdd: () => {} },
      steps: [],
      expect: { nodes: [{ target: { text: /Values stay on this computer\./ } }] },
    },
    {
      name: 'isDisabled holds the fields, Remove and Add',
      props: (s) => ({ ...base, isDisabled: true, onEdit: s.fn('onEdit'), onRemove: s.fn('onRemove'), onAdd: s.fn('onAdd') }),
      steps: [{ type: [NAME1, 'X'], force: true }, { press: REMOVE1, force: true }, { press: ADD, force: true }],
      expect: {
        calls: { onEdit: 0, onRemove: 0, onAdd: 0 },
        nodes: [{ target: NAME1, states: { disabled: true } }, { target: REMOVE1, states: { disabled: true } }, { target: ADD, states: { disabled: true } }],
      },
    },
  ],
});
