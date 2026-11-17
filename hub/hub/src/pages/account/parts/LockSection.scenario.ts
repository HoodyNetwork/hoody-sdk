// Behaviour contract of the account's passcode lock section (web and terminal).
// Web: its one callback, onOpen, opens the passcode sheet (Set a passcode, Change, Remove). Mounted alone the section
// reads core's lock engine and this browser's support, so onOpen is proved on the page instead, by the shot
// account/passcode-change-wrong (set a passcode, then press the section's Change).
// Terminal: the terminal Hub keeps no passcode (its host refuses one), so the sibling draws no button and reads no
// prop (LockSection.term.tsx); the term case pins what it draws instead.
import { scenarios } from '../../../kit/scenario-types';
import { LockSection } from './LockSection';
import strings from '../strings.en.json';
import termStrings from './lockTerm.strings.en.json';

export default scenarios('LockSection', LockSection, {
  ignored: {
    onOpen: 'the terminal keeps no passcode, so nothing there opens the passcode sheet (LockSection.term.tsx)',
  },
  unsupported: {},
  pageProof: { onOpen: 'account/passcode-change-wrong' },
  cases: [
    {
      name: 'the terminal says it has no passcode lock and draws no Set button',
      only: { platform: 'term', why: 'the web section is proved by its page shots (see pageProof)' },
      steps: [],
      props: (s) => ({ onOpen: s.fn('onOpen') }),
      expect: {
        calls: { onOpen: 0 },
        nodes: [
          { target: { text: termStrings['term.lock.none'] } },
          { target: { role: 'button', name: strings['lock.set'] }, absent: true },
          { target: { text: strings['lock.err.unsupported'] }, absent: true },
        ],
      },
    },
  ],
});
