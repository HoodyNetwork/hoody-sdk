// LoadScreen: the setup screen. The web draws its stages, cards and buttons. The terminal hands it off as a whole (kit
// Handoff: what it is, why, the web address), so none of its props reach a terminal screen; the one terminal case pins
// the hand-off. The web drawing is pinned in its own web tests.
import { loose } from '../layouts/scenarioRoute';
import { scenarios } from '../scenario-types';
import { LoadScreen } from './LoadScreen';
import term from './LoadScreen.term.strings.en.json';

const HANDED = 'terminal: the screen is handed to the web as a whole, so this is never drawn here';

export default scenarios('LoadScreen', loose(LoadScreen), {
  ignored: {
    title: HANDED,
    intro: HANDED,
    status: HANDED,
    stages: HANDED,
    stagesLabel: HANDED,
    items: HANDED,
    itemsLabel: HANDED,
    notice: HANDED,
    actions: HANDED,
    next: HANDED,
    nextTitle: HANDED,
    nextPending: HANDED,
    ask: HANDED,
    waiting: HANDED,
    className: 'a web class; the terminal hands the screen off',
  },
  unsupported: {},
  cases: [
    {
      name: 'terminal: the setup screen is a hand-off that says why',
      only: { platform: 'term', why: 'the web draws the stages and cards (LoadScreen web tests)' },
      props: () => ({ title: 'Setting up', status: 'Starting', stages: [], stagesLabel: 'Setup steps' }),
      steps: [],
      expect: { nodes: [{ target: { text: term['load.term.reason'] } }, { target: { text: 'Setting up' }, absent: true }] },
    },
  ],
});
