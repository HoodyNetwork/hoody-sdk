// Behaviour contract of StepList (web and terminal): a named group of numbered rows, the numbers running on across the
// groups; a group's place names its list and may carry the place's link; a row's control presses itself.
import { createElement as h } from 'react';
import { scenarios } from '../scenario-types';
import { Button } from '../controls/Button';
import { StepList } from './StepList';

export default scenarios('StepList', StepList, {
  ignored: { className: 'no CSS classes in a terminal' },
  unsupported: {},
  cases: [
    {
      name: 'the list is a named group; numbers run on across its places, each place naming its own list',
      props: {
        label: 'How to turn privacy off',
        groups: [
          { where: 'In Telegram', items: [{ text: 'Send the command to @BotFather', note: 'Your bot then reads every message' }, { text: 'Choose your bot' }] },
          { where: 'Back here', items: [{ text: 'Add the bot again' }] },
        ],
      },
      steps: [],
      expect: {
        nodes: [
          { target: { role: 'group', name: 'How to turn privacy off' } },
          { target: { role: 'list', name: 'In Telegram' } },
          { target: { role: 'list', name: 'Back here' } },
          { target: { text: '01' } },
          { target: { text: '03' } },
          { target: { text: 'Your bot then reads every message' } },
          { target: { text: 'Add the bot again' } },
        ],
      },
    },
    {
      name: 'a place that can be opened shows its link',
      props: { label: 'Steps', groups: [{ where: 'In Telegram', open: { label: 'Open @BotFather', url: 'https://t.me/BotFather' }, items: [{ text: 'Send the command' }] }] },
      steps: [],
      expect: { nodes: [{ target: { role: 'link', name: /Open @BotFather/ } }] },
    },
    {
      name: 'a row\'s control is whole and presses itself, once',
      props: (s) => ({ label: 'Steps', groups: [{ items: [{ text: 'Check that the bot reads the group', act: h(Button, { onPress: s.fn('check') }, 'Check now') }] }] }),
      steps: [{ press: { role: 'button', name: 'Check now' } }],
      expect: { calls: { check: 1 }, nodes: [{ target: { text: '01' } }] },
    },
  ],
});
