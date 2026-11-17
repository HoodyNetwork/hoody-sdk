// Behaviour of the Logs list's state box where it hands the person on: a private or blocked computer offers "Open the
// Agent app", which opens the computer's Agent address outside the Hub, whole (its ids are never drawn: the button
// carries words only). Without an Agent address there is no such button and nothing opens.
import strings from '../strings.en.json';
import { scenarios } from '../../../kit/scenario-types';
import { StateBox } from './Bands';

const table = strings as Record<string, string>;
const t = ((k: string, o?: Record<string, unknown>) => (table[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(o?.[x] ?? ''))) as never;

const PROJECT = 'fedcba9876543210fedcba98';
const COMPUTER = '0123456789abcdef01234567';
const AGENT = `https://${PROJECT}-${COMPUTER}-agent-1.srv1.hoody.example/`;

export default scenarios('StateBox', StateBox, {
  ignored: {},
  unsupported: {
    onRetry: 'the retry of a failed read: ErrorState\'s own contract (kit/states)',
    onHome: 'a stopped computer\'s "Computers" button: a plain callback, pinned by the logs page tests',
    onScripts: 'the script-pick button: a plain callback, pinned by the logs page tests',
    tooLong: 'wording only (the too-long notice)',
  },
  cases: [
    {
      name: 'a private computer: "Open the Agent app" opens its Agent address whole; the ids never show',
      props: (s) => ({ t, err: { code: 'private' }, onRetry: s.fn('onRetry'), onAgentUrl: AGENT }),
      covers: ['t', 'err', 'onAgentUrl'],
      steps: [{ press: { role: 'button', name: 'Open the Agent app' } }],
      expect: { opened: [AGENT], neverShown: [PROJECT, COMPUTER] },
    },
    {
      name: 'blocked, no Agent address: no button, nothing opens',
      props: (s) => ({ t, err: { code: 'blocked' }, onRetry: s.fn('onRetry'), onAgentUrl: null }),
      steps: [],
      expect: { opened: 0, nodes: [{ target: { role: 'button', name: 'Open the Agent app' }, absent: true }] },
    },
  ],
});
