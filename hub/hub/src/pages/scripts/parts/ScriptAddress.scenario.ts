// ScriptAddress: a script's address said once, on the web and in a terminal: what it is for, the whole address with Copy,
// Open only where the caller asks and the address opens as it is, and what the exec-1 part is when the origin is known.
import { scenarios } from '../../../kit/scenario-types';
import { ScriptAddress } from './ScriptAddress';
import strings from '../strings.en.json';

const ORIGIN = 'https://atlas-exec-1.hoody.example.test';

export default scenarios('ScriptAddress', ScriptAddress, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'the address is said whole, with its words and Copy; no Open unless asked',
      props: { origin: ORIGIN, path: '/count', label: 'the address' },
      steps: [],
      expect: {
        nodes: [
          { target: { text: strings['address.what'] } },
          { target: { role: 'button', name: 'Copy the address' } },
          { target: { text: strings['address.where'] } },
          { target: { role: 'link', name: strings['address.open'] }, absent: true },
        ],
      },
    },
    {
      name: 'Open is offered where asked and the address opens as it is',
      props: { origin: ORIGIN, path: '/count', label: 'the address', open: true },
      steps: [],
      expect: { nodes: [{ target: { role: 'link', name: strings['address.open'] } }] },
    },
    {
      name: 'an address with a variable part offers no Open, even where asked',
      props: { origin: ORIGIN, path: '/orders/[id]', label: 'the address', open: true, explain: false },
      steps: [],
      expect: { nodes: [{ target: { text: strings['address.what'] }, absent: true }, { target: { role: 'link', name: strings['address.open'] }, absent: true }] },
    },
  ],
});
