// The Ask dock when the agent cannot take the conversation (an Agent too old, another account's Agent): "Open the Agent
// app" opens the computer's Agent address outside the Hub, whole; the address holds the project and computer ids, which
// are never drawn or spoken. Without an Agent address (server or proxy domain unknown) nothing is offered or opened.
import strings from './strings.en.json';
import { scenarios } from '../kit/scenario-types';
import { Blocked } from './AskPanel';

const table = strings as Record<string, string>;
const t = ((k: string, o?: Record<string, unknown>) => (table[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(o?.[x] ?? ''))) as never;

const PROJECT = 'fedcba9876543210fedcba98';
const COMPUTER = '0123456789abcdef01234567';
const AGENT = `https://${PROJECT}-${COMPUTER}-agent-1.srv1.hoody.example/`;
// The engine is read only by the retry and gone views, not by these.
const eng = {} as never;
const b = { key: 'ask.unsupported', act: 'agent' as const, tone: 'warn' as const, agent: true };

export default scenarios('Blocked', Blocked, {
  ignored: {},
  unsupported: { eng: 'read only by the retry and gone views (Retry, New conversation): the engine\'s own tests' },
  cases: [
    {
      name: '"Open the Agent app" opens the Agent address whole; the ids never show (terminal: a link)',
      only: { platform: 'term', why: 'the web draws an address holding ids as a button (opens by script, no href): the web case below' },
      props: { b, eng, computer: 'atlas', agentUrl: AGENT, t },
      steps: [{ press: { role: 'link', name: 'Open the Agent app' } }],
      expect: { opened: [AGENT], neverShown: [PROJECT, COMPUTER] },
    },
    {
      name: '"Open the Agent app" opens the Agent address whole; the ids never show (web: a button)',
      only: { platform: 'web', why: 'the terminal draws it as a link: the case above' },
      props: { b, eng, computer: 'atlas', agentUrl: AGENT, t },
      steps: [{ click: { role: 'button', name: /^Open the Agent app/ } }],
      expect: { opened: [AGENT], neverShown: [PROJECT, COMPUTER] },
    },
    {
      name: 'no Agent address: no Agent app action, nothing opens',
      props: { b, eng, computer: 'atlas', agentUrl: '', t },
      steps: [],
      expect: { opened: 0, nodes: [{ target: { text: /Open the Agent app/ }, absent: true }] },
    },
  ],
});
