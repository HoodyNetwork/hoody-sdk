// The Ask column's hooks card: hooks hold the agent until someone trusts them in the Agent app, and the card's link
// opens the computer's Agent address outside the Hub, whole (the address holds the project and computer ids: they are
// never drawn or spoken). Without an Agent address (server or proxy domain unknown) there is no link.
import strings from './strings.en.json';
import { scenarios } from '../kit/scenario-types';
import { HooksHeld } from './Column';

const table = strings as Record<string, string>;
const t = ((k: string, o?: Record<string, unknown>) => (table[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(o?.[x] ?? ''))) as never;

const PROJECT = 'fedcba9876543210fedcba98';
const COMPUTER = '0123456789abcdef01234567';
const AGENT = `https://${PROJECT}-${COMPUTER}-agent-1.srv1.hoody.example/`;
const WORDS = 'Open the Agent app to trust these hooks';

export default scenarios('HooksHeld', HooksHeld, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'the Agent app link opens the Agent address whole; the ids never show (terminal: a link)',
      only: { platform: 'term', why: 'the web draws an address holding ids as a button (opens by script, no href): the web case below' },
      props: { agentUrl: AGENT, t },
      steps: [{ press: { role: 'link', name: WORDS } }],
      expect: { opened: [AGENT], neverShown: [PROJECT, COMPUTER] },
    },
    {
      name: 'the Agent app link opens the Agent address whole; the ids never show (web: a button)',
      only: { platform: 'web', why: 'the terminal draws it as a link: the case above' },
      props: { agentUrl: AGENT, t },
      steps: [{ click: { role: 'button', name: new RegExp(`^${WORDS}`) } }],
      expect: { opened: [AGENT], neverShown: [PROJECT, COMPUTER] },
    },
    {
      name: 'no Agent address: the card says why and offers no link; nothing opens',
      props: { agentUrl: '', t },
      steps: [],
      expect: { opened: 0, nodes: [{ target: { text: 'A hook is holding the agent' } }, { target: { role: 'link' }, absent: true }, { target: { role: 'button' }, absent: true }] },
    },
  ],
});
