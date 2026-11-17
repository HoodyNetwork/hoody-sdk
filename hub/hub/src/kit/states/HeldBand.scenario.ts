// Behaviour contract of HeldBand (web and terminal): the band of a change that may have gone
// through, its read, and the question before it stops tracking.
import { loose } from '../layouts/scenarioRoute';
import { scenarios } from '../scenario-types';
import { HeldBand } from './HeldBand';

const TEXT = 'A snapshot named nightly may already have been taken.';
const check = { role: 'button', name: /Check again/ };
const stop = { role: 'button', name: 'Stop tracking' };
const base = { text: TEXT, readOnly: false, overlayId: 't-held' };

export default scenarios('HeldBand', loose(HeldBand), {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'an alert with the sentence; Check again reads once',
      props: (s) => ({ ...base, onCheck: s.fn('onCheck', () => undefined), onDismiss: s.fn('onDismiss') }),
      steps: [{ press: check }],
      expect: { calls: { onCheck: 1, onDismiss: 0 }, nodes: [{ target: { role: 'alert' } }, { target: { text: TEXT } }, { target: stop }] },
    },
    {
      name: 'Stop tracking asks first; the answer stops tracking once',
      props: (s) => ({ ...base, onCheck: s.fn('onCheck', () => undefined), onDismiss: s.fn('onDismiss') }),
      steps: [
        { press: stop },
        { expect: { calls: { onDismiss: 0 }, nodes: [{ target: { role: 'alertdialog', name: 'Stop tracking this?' } }] } },
        { press: { role: 'button', name: 'Stop tracking anyway' } },
      ],
      expect: { calls: { onDismiss: 1 } },
    },
    {
      name: "a page's own question words replace the kit's",
      props: (s) => ({ ...base, onCheck: s.fn('onCheck', () => undefined), onDismiss: s.fn('onDismiss'), dismissTitle: 'Forget this snapshot?', dismissBody: 'Only if it was not taken.', dismissGo: 'Forget it' }),
      steps: [{ press: stop }],
      expect: { nodes: [{ target: { role: 'alertdialog', name: 'Forget this snapshot?' } }, { target: { text: 'Only if it was not taken.' } }, { target: { role: 'button', name: 'Forget it' } }] },
    },
    {
      name: "another sender's hold: no Stop tracking, and the sentence says where it is settled",
      props: (s) => ({ ...base, readOnly: true, elsewhere: 'Settle it on the Snapshots page.', onCheck: s.fn('onCheck', () => undefined), onDismiss: s.fn('onDismiss') }),
      steps: [],
      expect: { nodes: [{ target: stop, absent: true }, { target: check }, { target: { text: `${TEXT} Settle it on the Snapshots page.` } }] },
    },
    {
      name: 'the note of the last check is shown; while the send is out neither action does anything',
      props: (s) => ({ ...base, note: 'Not in the list yet.', inFlight: true, onCheck: s.fn('onCheck', () => undefined), onDismiss: s.fn('onDismiss') }),
      steps: [{ press: check, force: true }, { press: stop, force: true }],
      expect: { calls: { onCheck: 0, onDismiss: 0 }, nodes: [{ target: { text: 'Not in the list yet.' } }, { target: { role: 'alertdialog' }, absent: true }] },
    },
  ],
});
