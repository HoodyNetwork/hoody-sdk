// Behaviour contract of PaneSeparator (the list/detail width handle; web and terminal).
import { loose } from './scenarioRoute';
import { scenarios, M } from '../scenario-types';
import { PaneSeparator } from './PaneSeparator';

const range = { min: 240, max: 640, def: 340 };

export default scenarios('PaneSeparator', loose(PaneSeparator), {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'a named separator; Right widens a list on the start side, Left narrows it',
      props: (s) => ({ value: 340, range, dir: 1, label: 'Resize list', onChange: s.fn('onChange') }),
      steps: [{ focus: { role: 'separator', name: 'Resize list' } }, { key: 'right' }, { key: 'left' }],
      expect: { calls: { onChange: [[M.type('number')], [M.type('number')]] }, focused: { role: 'separator', name: 'Resize list' } },
    },
    {
      name: 'Home and End go to the bounds',
      props: (s) => ({ value: 340, range, dir: 1, label: 'Resize list', onChange: s.fn('onChange') }),
      steps: [{ focus: { role: 'separator', name: 'Resize list' } }, { key: 'home' }, { key: 'end' }],
      expect: { calls: { onChange: [[240], [640]] } },
    },
  ],
});
