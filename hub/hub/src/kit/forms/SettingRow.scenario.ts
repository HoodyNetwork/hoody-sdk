// Behaviour contract of SettingRow, run on the web and in the terminal (src/term/scenario).
import { createElement as h } from 'react';
import { Button } from '../controls/Button';
import { scenarios } from '../scenario-types';
import { SettingRow } from './SettingRow';

export default scenarios('SettingRow', SettingRow, {
  ignored: {
    className: 'no CSS classes in a terminal',
    tone: 'drawn only (danger colour)',
    wide: 'a terminal row has no 480 px control cap to lift',
    htmlFor: 'names a native input: kit fields carry their own label',
    info: 'InfoTip after the label: its own scenarios (overlays/InfoTip)',
    error: 'mapped words on the Outcome line: Outcome scenarios',
    detail: 'Outcome line wording: Outcome scenarios',
    errorWords: 'Outcome line wording: Outcome scenarios',
    help: 'drawn under the label',
  },
  unsupported: {
    reveal: 'reveal rows: SettingGroup.scenario.ts GroupRow cases (a SettingRow with reveal is a one-row group)',
  },
  cases: [
    {
      name: 'label, value and an action',
      props: (s) => ({ label: 'Username', children: 'ada', actions: h(Button, { onPress: s.fn('edit') }, 'Edit') }),
      steps: [{ press: { role: 'button', name: 'Edit' } }],
      expect: { calls: { edit: 1 }, nodes: [{ target: { text: 'Username' } }, { target: { text: 'ada' } }] },
    },
    {
      name: 'a pending outcome hides the actions and offers Check again',
      props: (s) => ({ label: 'Username', children: 'ada', outcome: 'pending', onCheck: s.fn('onCheck', async () => undefined), actions: h(Button, null, 'Edit') }),
      steps: [{ press: { role: 'button', name: 'Check again' } }],
      expect: { calls: { onCheck: 1 }, nodes: [{ target: { role: 'button', name: 'Edit' }, absent: true }] },
    },
    {
      name: 'a pending outcome offers Stop tracking; it calls onStop',
      props: (s) => ({ label: 'Username', children: 'ada', outcome: 'pending', onCheck: s.fn('onCheck', async () => undefined), onStop: s.fn('onStop') }),
      steps: [{ press: { role: 'button', name: 'Stop tracking' } }],
      expect: { calls: { onStop: 1, onCheck: 0 } },
    },
    {
      name: 'a function child gets the row ids',
      // How often a render calls it is React's business: only what it draws is the contract.
      props: { label: 'Username', children: (ids: { nameId: string }) => (typeof ids.nameId === 'string' && ids.nameId ? 'value from ids' : 'no ids') },
      steps: [],
      expect: { nodes: [{ target: { text: 'value from ids' } }] },
      covers: ['children'],
    },
  ],
});
