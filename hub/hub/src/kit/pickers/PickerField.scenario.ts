// PickerField: the picker inside it is named by the field's visible label and described by its error (web and
// terminal).
import { createElement as h } from 'react';
import { scenarios } from '../scenario-types';
import { loose } from '../layouts/scenarioRoute';
import { PickerTrigger } from './ComputerPicker';
import { PickerField } from './PickerField';

export default scenarios('PickerField', loose(PickerField), {
  ignored: { className: 'no CSS classes in a terminal' },
  unsupported: { showLabel: 'a hidden label still names the trigger; look only' },
  cases: [
    {
      name: 'the trigger is named by the field label; the error shows under it',
      props: () => ({ label: 'Project', errorMessage: 'Pick a project', description: 'Where the computer goes' }),
      mount: (C, p) => h(C, { ...(p as Record<string, unknown>), children: h(PickerTrigger, { label: 'ignored', text: 'Acme' }) } as never),
      covers: ['label', 'errorMessage', 'description', 'children'],
      steps: [],
      expect: { nodes: [{ target: { role: 'button', name: /^Acme Project$/ } }, { target: { text: /Pick a project/ } }] },
    },
  ],
});
