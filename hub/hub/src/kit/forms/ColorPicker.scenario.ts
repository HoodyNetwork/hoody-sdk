// Behaviour contract of the colour field (src/term/scenario): presets are radios named by colour, the
// hex field sends '#RRGGBB' for any hex spelling, other text goes as typed and is hinted once the field is left.
import { scenarios } from '../scenario-types';
import { ColorPicker } from './ColorPicker';

const cp = scenarios('ColorPicker', ColorPicker, {
  ignored: { className: 'look only: CSS classes mean nothing in a terminal' },
  unsupported: {},
  cases: [
    {
      name: 'picking a preset sends its hex',
      props: (s) => ({ label: 'Colour', value: '', onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ press: { role: 'radio', name: 'Turquoise' } }],
      expect: { calls: { onChange: [['#4ECDC4']] }, nodes: [{ target: { role: 'radio', name: 'Turquoise' }, states: { checked: true } }] },
    },
    {
      name: 'a value that is a preset marks it; the picked one again is no change',
      props: (s) => ({ label: 'Colour', value: '#ff6b6b', onChange: s.fn('onChange') }),
      steps: [{ press: { role: 'radio', name: 'Coral' } }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: { role: 'radio', name: 'Coral' }, states: { checked: true } }, { target: { role: 'radio', name: 'Sage' }, states: { checked: false } }] },
    },
    {
      name: 'the hex field: a short hex goes out as #RRGGBB',
      props: (s) => ({ label: 'Colour', value: '', onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ type: [{ role: 'textbox', name: 'Hex code' }, '4cc'] }],
      expect: { calls: { onChange: [['4'], ['4c'], ['#44CCCC']] } },
    },
    {
      name: 'text that is no colour is hinted once the field is left',
      props: (s) => ({ label: 'Colour', value: '', onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ type: [{ role: 'textbox', name: 'Hex code' }, 'teal'] }, { key: 'tab' }],
      expect: { nodes: [{ target: { role: 'textbox', name: 'Hex code' }, states: { invalid: true }, description: 'Use a hex code such as' }] },
    },
    {
      name: 'accepts: text the caller takes is not hinted',
      props: (s) => ({ label: 'Colour', value: '', onChange: s.fn('onChange'), accepts: (x: string) => x === 'teal' }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ type: [{ role: 'textbox', name: 'Hex code' }, 'teal'] }, { key: 'tab' }],
      expect: { calls: { onChange: [['t'], ['te'], ['tea'], ['teal']] }, nodes: [{ target: { role: 'textbox', name: 'Hex code' }, states: { invalid: false } }] },
    },
    {
      name: 'a page error makes the hex field invalid and describes it',
      props: { label: 'Colour', value: '#FF6B6B', onChange: () => undefined, errorMessage: 'Pick another colour.' },
      steps: [],
      expect: { nodes: [{ target: { role: 'textbox', name: 'Hex code' }, states: { invalid: true }, description: 'Pick another colour.' }] },
    },
    {
      name: 'disabled: presets and the hex field are inert',
      props: (s) => ({ label: 'Colour', value: '', onChange: s.fn('onChange'), isDisabled: true }),
      steps: [{ click: { role: 'radio', name: 'Coral' }, force: true }, { type: [{ role: 'textbox', name: 'Hex code' }, 'a'], force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: { role: 'radio', name: 'Coral' }, states: { disabled: true } }, { target: { role: 'textbox', name: 'Hex code' }, states: { disabled: true } }] },
    },
  ],
});

export default [cp];
