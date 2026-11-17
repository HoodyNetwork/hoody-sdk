// Behaviour contract of New realm's picked list (web and terminal): the count and every picked computer by name,
// however many there are. The terminal draws no inner scroll (the page scrolls), so nothing is cut off.
import { scenarios } from '../../../kit/scenario-types';
import { PickedList } from './PickedList';

const MANY = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, name: `node-${String(i + 1).padStart(2, '0')}`, color: null }));

export default scenarios('PickedList', PickedList, {
  ignored: {
    label: 'the web list\'s accessible name; in the terminal the rows sit under the summary\'s own "Computers" label',
    scroll: 'no inner scroll in a terminal: the page scrolls, so every name stays reachable',
  },
  unsupported: {},
  cases: [
    {
      name: 'one picked: the count and the name',
      props: { count: '1 computer', label: 'Picked computers', items: [{ id: 'a', name: 'atlas', color: null }], scroll: false },
      steps: [],
      expect: { nodes: [{ target: { text: /1 computer/ } }, { target: { text: /atlas/ } }] },
    },
    {
      name: 'a long list: every name is there, the first and the last',
      props: { count: '12 computers', label: 'Picked computers', items: MANY, scroll: true },
      steps: [],
      expect: { nodes: [{ target: { text: /12 computers/ } }, { target: { text: /node-01/ } }, { target: { text: /node-12/ } }] },
    },
  ],
});
