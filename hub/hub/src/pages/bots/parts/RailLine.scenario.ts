// Behaviour contract of the Bots web rail's line 2 (web and terminal). It holds no callback: it draws its realm, what
// the Bot is doing, Privacy on and its chat apps' marks, each phrase whole or not at all; the web rail's rows are
// proved by the Bots list tests and the rail's browser spec. The terminal draws no such line (its list keeps its own
// fields), so the sibling reads no prop (RailLine.term.tsx).
import { scenarios } from '../../../kit/scenario-types';
import { RailLine } from './RailLine';
import strings from '../strings.en.json';

// A Bot never active yet reads "New"; the realm is a name the caller passes as it is.
const NOW = strings['col.new'];
const REALM = strings['col.realm'];
const NOT_DRAWN = 'the terminal list keeps its own fields and draws no rail line (RailLine.term.tsx)';

export default scenarios('RailLine', RailLine, {
  ignored: { now: NOT_DRAWN, realm: NOT_DRAWN, apps: NOT_DRAWN, privacy: NOT_DRAWN },
  cases: [
    {
      name: 'the web draws the realm, then what the Bot is doing',
      only: { platform: 'web', why: 'the terminal draws no rail line' },
      steps: [],
      props: { now: NOW, realm: REALM, apps: null, privacy: null },
      expect: { nodes: [{ target: { text: REALM } }, { target: { text: `· ${NOW}` } }] },
    },
    {
      name: 'the terminal draws no rail line',
      only: { platform: 'term', why: 'the web line is proved by the case above and the rail tests' },
      steps: [],
      props: { now: NOW, realm: REALM, apps: null, privacy: null },
      expect: { nodes: [{ target: { text: REALM }, absent: true }, { target: { text: `· ${NOW}` }, absent: true }] },
    },
  ],
});
