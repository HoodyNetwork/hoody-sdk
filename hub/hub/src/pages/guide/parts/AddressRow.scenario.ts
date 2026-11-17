// Behaviour contract of the Guide's address row (web and terminal): Open hands the WHOLE address outside the Hub while
// the row shows the ids masked; a program used from code only has no Open, so nothing opens.
import { scenarios } from '../../../kit/scenario-types';
import { AddressRow } from './AddressRow';

const PID = '6a1f00c0ffee00000000b0b1';
const CID = '6a1f00c0ffee0000000c0a71';
const URL_ = `https://${PID}-${CID}-terminal-1.atlas.hoody.example/`;

export default scenarios('AddressRow', AddressRow, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'Open opens the whole address; the row shows the ids masked',
      props: { program: 'Terminal', url: URL_, ids: [PID, CID] },
      steps: [{ press: { role: 'button', name: 'Open Terminal' } }],
      expect: { opened: [URL_], neverShown: [PID, CID], nodes: [{ target: { text: /6a1f…b0b1-6a1f…0a71/ } }] },
    },
    {
      name: 'a program used from code only: no Open, nothing opens',
      props: { program: 'Database', url: URL_, ids: [PID, CID], open: false },
      steps: [],
      expect: { opened: 0, nodes: [{ target: { role: 'button', name: 'Open Database' }, absent: true }] },
    },
  ],
});
