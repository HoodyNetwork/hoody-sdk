// Behaviour contract of the conversation header (web and terminal): the title, where the chat runs
// (computer · realm and the folder at every size; the agent and model only above the small sizes), its state in words, and
// the buttons: Details (pressed while open), Back below the small sizes, and the host's own actions.
import { createElement as h } from 'react';
import { scenarios } from '../scenario-types';
import { Button } from '../controls/Button';
import { ConvHeader, type ConvHeaderProps } from './ConvHeader';
import type { ConvMeta } from './source';
import strings from './ConvHeader.strings.en.json';

const KEY = 'sk-live0123456789abcdefghij';
const meta = (status: ConvMeta['status'], more: Partial<ConvMeta> = {}): ConvMeta => ({ computer: 'atlas', realm: 'Personal', folder: '/home/ada/projects/shop', agent: 'Reviewer', model: 'hoody-ai/hoody-free', status, ...more });
const base = (s: { fn(n: string): (...a: unknown[]) => void }, more: Partial<ConvHeaderProps> = {}): ConvHeaderProps => ({
  size: 'l', title: 'Fix the failing checkout tests', meta: meta('running'), detailsOpen: false, onDetails: s.fn('onDetails'), ...more,
});
const DETAILS = { role: 'button', name: strings['head.details'], exact: true };
const BACK = { role: 'button', name: strings['head.back'] };

export default scenarios<ConvHeaderProps>('ConvHeader', ConvHeader, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'the title is a heading; the line under it says where the chat runs, with which agent and model',
      props: (s) => base(s),
      steps: [],
      expect: { nodes: [
        { target: { role: 'heading', name: 'Fix the failing checkout tests' } },
        { target: { role: 'list', name: strings['head.meta'] } },
        { target: { text: 'atlas · Personal' } }, { target: { text: '/home/ada/projects/shop' } },
        { target: { text: 'Reviewer' } }, { target: { text: 'hoody-ai/hoody-free' } },
        { target: { text: strings['head.status.running'] } },
      ] },
    },
    {
      name: 'a small size keeps computer, realm and folder; the agent and model are left to Details',
      props: (s) => base(s, { size: 's' }),
      steps: [],
      expect: { nodes: [{ target: { text: 'atlas · Personal' } }, { target: { text: '/home/ada/projects/shop' } }] },
    },
    {
      name: 'a small size draws no agent and no model',
      only: { platform: 'term', why: 'the web hides them with a class style (display: none), which its test DOM does not apply' },
      props: (s) => base(s, { size: 'xs' }),
      steps: [],
      expect: { nodes: [{ target: { text: 'atlas · Personal' } }], neverShown: ['Reviewer', 'hoody-ai/hoody-free'] },
    },
    {
      name: 'a chat with no title yet is named New chat',
      props: (s) => base(s, { title: '  ' }),
      steps: [],
      expect: { nodes: [{ target: { role: 'heading', name: strings['head.untitled'] } }] },
    },
    {
      name: 'before the chat is read there is no meta line and no state',
      props: (s) => base(s, { meta: undefined }),
      steps: [],
      expect: { nodes: [{ target: { role: 'list', name: strings['head.meta'] }, absent: true }, { target: DETAILS }], neverShown: [strings['head.status.running'], strings['head.status.idle']] },
    },
    {
      name: 'a chat that waits says Needs you; a paused one says Paused',
      props: (s) => base(s, { meta: meta('needs') }),
      steps: [{ expect: { nodes: [{ target: { text: strings['head.status.needs'] } }] } }, { rerender: { meta: meta('paused') } }],
      expect: { nodes: [{ target: { text: strings['head.status.paused'] } }], neverShown: [strings['head.status.needs']] },
    },
    {
      name: 'Details calls the host once',
      covers: ['onDetails'],
      props: (s) => base(s),
      steps: [{ press: DETAILS }],
      expect: { calls: { onDetails: 1 } },
    },
    {
      name: "the model chip names the chat's model and its press goes to the host",
      covers: ['model', 'onModel'],
      props: (s) => base(s, { model: { spec: 'openai/gpt-5', catalogue: null }, onModel: s.fn('onModel') }),
      steps: [{ press: { role: 'button', name: /^Model: openai\/gpt-5\./ } }],
      expect: { calls: { onModel: 1, onDetails: 0 } },
    },
    {
      name: 'while Details is open its button is pressed and named Close details',
      props: (s) => base(s, { detailsOpen: true }),
      steps: [],
      expect: { nodes: [{ target: { role: 'button', name: strings['head.detailsClose'] }, states: { pressed: true } }] },
    },
    {
      name: 'Back shows only below the small sizes and calls the host',
      covers: ['onBack', 'size'],
      props: (s) => base(s, { size: 's', onBack: s.fn('onBack') }),
      steps: [{ press: BACK }],
      expect: { calls: { onBack: 1, onDetails: 0 } },
    },
    {
      name: 'at a large size there is no Back, even when the host gives one',
      props: (s) => base(s, { onBack: s.fn('onBack') }),
      steps: [],
      expect: { nodes: [{ target: BACK, absent: true }] },
    },
    {
      name: "the host's own actions sit in the header and work",
      props: (s) => base(s, { actions: h(Button, { size: 'sm', onPress: s.fn('onBoard') }, 'Add to Board') }),
      steps: [{ press: { role: 'button', name: 'Add to Board' } }],
      expect: { calls: { onBoard: 1, onDetails: 0 } },
    },
    {
      name: 'a key in the title or the folder is never shown',
      props: (s) => base(s, { title: `deploy with ${KEY}`, meta: meta('idle', { folder: `/tmp/${KEY}` }) }),
      steps: [],
      expect: { neverShown: [KEY] },
    },
  ],
});
