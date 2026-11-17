// Behaviour contract of RadioGroup, run on the web and in the terminal (src/term/scenario). Roles are
// React Aria's: a radiogroup of radios.
import { scenarios } from '../scenario-types';
import { RadioGroup } from './RadioGroup';
import type { Option } from './more.pure';

const OPTS: Option[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo', isDisabled: true },
  { value: 'c', label: 'Charlie' },
];

const radio = (name: string) => ({ role: 'radio', name }) as const;
const rg = scenarios('RadioGroup', RadioGroup, {
  ignored: { columns: 'a web layout: the terminal lists the radios in one column' },
  unsupported: {},
  cases: [
    {
      name: 'Space on a radio picks it',
      props: (s) => ({ label: 'Size', options: OPTS, value: 'a', onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ press: radio('Charlie') }],
      expect: { calls: { onChange: [['c']] }, nodes: [{ target: radio('Charlie'), states: { checked: true } }, { target: radio('Alpha'), states: { checked: false } }] },
    },
    {
      name: '↓ moves to the next enabled radio and picks it',
      props: (s) => ({ label: 'Size', options: OPTS, value: 'a', onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ focus: radio('Alpha') }, { key: 'down' }],
      expect: { calls: { onChange: [['c']] }, focused: radio('Charlie'), nodes: [{ target: radio('Bravo'), states: { disabled: true, checked: false } }] },
    },
    {
      name: 'controlled without a parent update: reports the pick, the parent\'s value stays checked',
      props: (s) => ({ label: 'Size', options: OPTS, value: 'a', onChange: s.fn('onChange') }),
      steps: [{ press: radio('Charlie') }],
      expect: { calls: { onChange: [['c']] }, nodes: [{ target: radio('Alpha'), states: { checked: true } }, { target: radio('Charlie'), states: { checked: false } }] },
    },
    {
      name: 'pressing the radio already chosen reports nothing',
      props: (s) => ({ label: 'Size', options: OPTS, value: 'a', onChange: s.fn('onChange') }),
      steps: [{ press: radio('Alpha') }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: radio('Alpha'), states: { checked: true } }] },
    },
    {
      name: 'disabled: inert',
      props: (s) => ({ label: 'Size', options: OPTS, value: 'a', isDisabled: true, onChange: s.fn('onChange') }),
      steps: [{ click: radio('Charlie'), force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: radio('Charlie'), states: { disabled: true, checked: false } }] },
    },
    {
      name: 'an error message makes the group invalid and describes it; required is a state',
      props: { label: 'Size', options: OPTS, value: undefined, errorMessage: 'Pick a size.', isRequired: true },
      steps: [],
      expect: { nodes: [{ target: { role: 'radiogroup', name: 'Size' }, states: { invalid: true, required: true }, description: 'Pick a size.' }] },
    },
  ],
});

export default [rg];
