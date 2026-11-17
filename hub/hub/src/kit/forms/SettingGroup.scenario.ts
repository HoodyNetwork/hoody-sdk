// Behaviour contract of SettingGroup, GroupRow and SettingSwitch, run on the web and in the terminal
// (src/term/scenario).
import { createElement as h } from 'react';
import { Button } from '../controls/Button';
import { scenarios } from '../scenario-types';
import { GroupRow, SettingGroup, SettingSwitch } from './SettingGroup';

const ROW_SHARED: Record<string, string> = { className: 'no CSS classes in a terminal', 'data-*': 'DOM attributes a web page finds a row by: no DOM in a terminal' };
const OUTCOME_WORDS: Record<string, string> = {
  error: 'mapped words on the Outcome line: Outcome scenarios',
  detail: 'Outcome line wording: Outcome scenarios',
  errorWords: 'Outcome line wording: Outcome scenarios',
};

const group = scenarios('SettingGroup', SettingGroup, {
  ignored: { className: 'no CSS classes in a terminal', crowdedActions: 'where a row\'s actions go when the label track is short is a web layout: a terminal row draws its actions on their own line', labelledBy: 'the title names the group; a page heading id is not resolved in the terminal tree yet (request #8)' },
  unsupported: {},
  cases: [
    {
      name: 'a label names the group',
      props: { label: 'Security', children: 'rows' },
      steps: [],
      expect: { nodes: [{ target: { role: 'group', name: 'Security' } }] },
    },
    {
      name: 'a title is drawn and names the group',
      props: { title: 'Danger zone', children: 'rows' },
      steps: [],
      expect: { nodes: [{ target: { text: 'Danger zone' } }, { target: { role: 'group', name: 'Danger zone' } }] },
    },
  ],
});

const row = scenarios('GroupRow', GroupRow, {
  ignored: { ...ROW_SHARED, align: 'where a tall control\'s label sits is a web layout: a terminal row starts its label at the top', htmlFor: 'names a native input: kit fields carry their own label' },
  unsupported: {
    ...OUTCOME_WORDS,
    control: 'SettingSwitch passes it: covered by the SettingSwitch cases',
  },
  cases: [
    {
      name: 'label, value and actions show',
      props: (s) => ({ label: 'Display name', children: 'Ada', actions: h(Button, { onPress: s.fn('change') }, 'Change') }),
      mount: (C, p, _s, html) => html('div', null, h(SettingGroup, { children: h(C as never, p) })) as never,
      steps: [{ press: { role: 'button', name: 'Change' } }],
      expect: { calls: { change: 1 }, nodes: [{ target: { text: 'Display name' } }, { target: { text: 'Ada' } }] },
    },
    {
      name: 'a pending outcome hides the actions and offers Check again',
      props: (s) => ({ label: 'Display name', children: 'Ada', outcome: 'pending', onCheck: s.fn('onCheck', async () => undefined), actions: h(Button, null, 'Change') }),
      mount: (C, p, _s, html) => html('div', null, h(SettingGroup, { children: h(C as never, p) })) as never,
      steps: [{ press: { role: 'button', name: 'Check again' } }],
      expect: { calls: { onCheck: 1 }, nodes: [{ target: { role: 'button', name: 'Change' }, absent: true }] },
    },
    {
      name: 'a pending outcome offers Stop tracking after Check again; it calls onStop',
      props: (s) => ({ label: 'Display name', children: 'Ada', outcome: 'pending', onCheck: s.fn('onCheck', async () => undefined), onStop: s.fn('onStop') }),
      mount: (C, p, _s, html) => html('div', null, h(SettingGroup, { children: h(C as never, p) })) as never,
      steps: [{ press: { role: 'button', name: 'Stop tracking' } }],
      expect: { calls: { onStop: 1, onCheck: 0 } },
    },
    {
      name: 'reveal: the opener shows the editor; Cancel closes it and says so',
      props: (s) => ({ label: 'Recovery email', children: 'a@example.org', reveal: { label: 'Replace…', editor: 'Editor body', onSave: s.fn('onSave'), onCancel: s.fn('onCancel') } }),
      mount: (C, p, _s, html) => html('div', null, h(SettingGroup, { children: h(C as never, p) })) as never,
      steps: [
        { press: { role: 'button', name: 'Replace…' } },
        { expect: { nodes: [{ target: { text: 'Editor body' } }, { target: { role: 'button', name: 'Replace…' }, absent: true }] } },
        { press: { role: 'button', name: 'Cancel' } },
      ],
      expect: { calls: { onCancel: 1, onSave: 0 }, nodes: [{ target: { role: 'button', name: 'Replace…' } }] },
    },
    {
      name: 'reveal: Save calls onSave and closes (a plain return)',
      props: (s) => ({ label: 'Recovery email', children: 'a@example.org', reveal: { label: 'Replace…', editor: 'Editor body', onSave: s.fn('onSave') } }),
      mount: (C, p, _s, html) => html('div', null, h(SettingGroup, { children: h(C as never, p) })) as never,
      steps: [{ press: { role: 'button', name: 'Replace…' } }, { press: { role: 'button', name: 'Save' } }],
      expect: { calls: { onSave: 1 }, nodes: [{ target: { role: 'button', name: 'Replace…' } }] },
    },
    {
      name: 'reveal: canSave false keeps Save off',
      props: (s) => ({ label: 'Recovery email', children: 'a', reveal: { label: 'Replace…', editor: 'Editor body', canSave: false, onSave: s.fn('onSave') } }),
      mount: (C, p, _s, html) => html('div', null, h(SettingGroup, { children: h(C as never, p) })) as never,
      steps: [{ press: { role: 'button', name: 'Replace…' } }, { click: { role: 'button', name: 'Save' }, force: true }],
      expect: { calls: { onSave: 0 }, nodes: [{ target: { role: 'button', name: 'Save' }, states: { disabled: true } }] },
    },
  ],
});

const sw = scenarios('SettingSwitch', SettingSwitch, {
  ignored: { ...ROW_SHARED },
  unsupported: { ...OUTCOME_WORDS, actions: 'row actions: GroupRow cases' },
  cases: [
    {
      name: 'the row names the switch; a press reports the new value',
      props: (s) => ({ label: 'Ask for a code', isSelected: false, onChange: s.fn('onChange') }),
      steps: [{ press: { role: 'switch', name: 'Ask for a code' } }],
      expect: { calls: { onChange: [[true]] }, nodes: [{ target: { role: 'switch', name: 'Ask for a code' }, states: { checked: false } }] },
    },
    {
      name: 'controlled by a parent that stores the value',
      props: (s) => ({ label: 'Ask for a code', isSelected: false, onChange: s.fn('onChange') }),
      control: { value: 'isSelected', onChange: 'onChange' },
      steps: [{ press: { role: 'switch', name: 'Ask for a code' } }],
      expect: { calls: { onChange: [[true]] }, nodes: [{ target: { role: 'switch', name: 'Ask for a code' }, states: { checked: true } }] },
    },
    {
      name: 'disabled: inert',
      props: (s) => ({ label: 'Ask for a code', isSelected: true, isDisabled: true, onChange: s.fn('onChange') }),
      steps: [{ press: { role: 'switch', name: 'Ask for a code' }, force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: { role: 'switch', name: 'Ask for a code' }, states: { disabled: true, checked: true } }] },
    },
    {
      name: 'a pending outcome locks the switch and offers Check again',
      props: (s) => ({ label: 'Ask for a code', isSelected: true, outcome: 'pending', onChange: s.fn('onChange'), onCheck: s.fn('onCheck', async () => undefined) }),
      steps: [{ press: { role: 'switch', name: 'Ask for a code' }, force: true }, { press: { role: 'button', name: 'Check again' } }],
      expect: { calls: { onChange: 0, onCheck: 1 }, nodes: [{ target: { role: 'switch', name: 'Ask for a code' }, states: { disabled: true } }] },
    },
    {
      name: 'a pending outcome offers Stop tracking; it calls onStop',
      props: (s) => ({ label: 'Ask for a code', isSelected: true, outcome: 'pending', onChange: s.fn('onChange'), onCheck: s.fn('onCheck', async () => undefined), onStop: s.fn('onStop') }),
      steps: [{ press: { role: 'button', name: 'Stop tracking' } }],
      expect: { calls: { onStop: 1, onCheck: 0, onChange: 0 } },
    },
  ],
});

export default [group, row, sw];
