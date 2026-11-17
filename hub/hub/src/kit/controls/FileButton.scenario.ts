// Behaviour contract of FileButton, run on the web and in the terminal (src/term/scenario).
// The web opens the browser's file chooser; the terminal has none (its button says so and hands off to the web), so
// these cases hold what both share: the button, its disabled and busy states, and no files reported without a choice.
import { scenarios } from '../scenario-types';
import { FileButton } from './FileButton';

const upload = { role: 'button', name: 'Upload key' };

export default scenarios('FileButton', FileButton, {
  ignored: {
    accept: 'no file chooser in the terminal', multiple: 'no file chooser in the terminal', icon: 'look only: icons are not drawn', variant: 'look only: the terminal draws the hand-off line', size: 'look only: the terminal draws the hand-off line',
    ref: 'no DOM element in the terminal',
    onFiles: 'files are chosen in the web Hub only (the terminal button hands off); no case can choose a file (jsdom has no chooser either)',
  },
  unsupported: {},
  cases: [
    {
      name: 'its label names a button',
      props: (s) => ({ label: 'Upload key', onFiles: s.fn('onFiles') }),
      steps: [],
      expect: { calls: { onFiles: 0 }, nodes: [{ target: upload }] },
    },
    {
      name: 'disabled: inert, and says why',
      props: (s) => ({ label: 'Upload key', isDisabled: true, disabledReason: 'Stop the computer first.', onFiles: s.fn('onFiles') }),
      steps: [{ click: upload, force: true }, { press: upload, force: true }],
      expect: { calls: { onFiles: 0 }, nodes: [{ target: upload, states: { disabled: true }, description: 'Stop the computer first.' }] },
    },
    {
      name: 'busy: says so and refuses presses',
      props: (s) => ({ label: 'Upload key', busy: true, onFiles: s.fn('onFiles') }),
      steps: [{ click: upload, force: true }],
      expect: { calls: { onFiles: 0 }, nodes: [{ target: upload, states: { busy: true } }] },
    },
  ],
});
