// Behaviour contract of PresentationSwitch (web and terminal): one choice of how a list draws its
// rows; a pick reports the new value; a page's own items replace Cards / List.
import { scenarios } from '../scenario-types';
import { PresentationSwitch } from './Presentation';

export default [
  scenarios('PresentationSwitch', PresentationSwitch, {
    ignored: {},
    unsupported: {},
    cases: [
      {
        name: 'Cards or List as one choice; a pick reports it',
        props: (s) => ({ value: 'cards', onChange: s.fn('onChange') }),
        steps: [{ click: { role: 'radio', name: 'List' } }],
        expect: { calls: { onChange: [['list']] } },
      },
      {
        name: "a page's own items replace Cards / List",
        props: (s) => ({ value: 'list', onChange: s.fn('onChange'), items: [{ id: 'list', label: 'List', icon: 'menu' }, { id: 'icons', label: 'Icons', icon: 'apps' }] }),
        steps: [{ click: { role: 'radio', name: 'Icons' } }],
        expect: { calls: { onChange: [['icons']] }, nodes: [{ target: { role: 'radio', name: 'Cards' }, absent: true }] },
      },
    ],
  }),
];
