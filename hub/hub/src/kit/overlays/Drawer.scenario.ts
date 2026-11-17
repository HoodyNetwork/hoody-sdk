// Behaviour contract of Drawer (web and terminal).
import { createElement as h } from 'react';
import { scenarios } from '../scenario-types';
import { Button } from '../controls/Button';
import { Drawer } from './Drawer';

const FOCUS_DOM = 'focus is given back by each platform itself (the terminal opener keeps it: the page saw no key); a DOM element getter has no terminal meaning';
const base = { title: 'New schedule', resizeKey: 'scenario-drawer', children: 'Body line' };

export default scenarios('Drawer', Drawer, {
  ignored: {
    className: 'no CSS classes in a terminal',
    overlayId: 'a DOM data attribute for the shell; the terminal stack keeps its own ids',
    returnFocus: FOCUS_DOM,
    closeFocus: FOCUS_DOM,
    primaryOnPhone: 'the phone mirror of a guided step: the terminal leaves the step its own primary in place',
  },
  unsupported: {},
  cases: [
    {
      name: 'subtitle, header actions and a secondary are drawn and work',
      props: (s) => ({ ...base, isOpen: true, onOpenChange: s.fn('onOpenChange'), subtitle: 'Runs every day', actions: h(Button, { onPress: s.fn('runNow') }, 'Run now'), secondary: h(Button, { onPress: s.fn('duplicate') }, 'Duplicate'), cancel: true }),
      steps: [{ press: { role: 'button', name: 'Run now' } }, { press: { role: 'button', name: 'Duplicate' } }],
      expect: { calls: { runNow: 1, duplicate: 1, onOpenChange: 0 }, nodes: [{ target: { text: 'Runs every day' } }] },
    },
    {
      name: 'the discard question uses the given words',
      props: (s) => ({ ...base, isOpen: true, onOpenChange: s.fn('onOpenChange'), dirty: true, discardText: 'Throw away the draft?', discardLabel: 'Throw away' }),
      steps: [{ key: 'escape' }, { expect: { nodes: [{ target: { text: /Throw away the draft\?/ } }] } }, { press: { role: 'button', name: 'Throw away' } }],
      expect: { calls: { onOpenChange: [[false]] } },
    },
    {
      name: 'the back link is named by backLabel and calls onBack',
      props: (s) => ({ ...base, isOpen: true, onOpenChange: s.fn('onOpenChange'), onBack: s.fn('onBack'), backLabel: 'Back to schedules' }),
      steps: [{ press: { role: 'button', name: 'Back to schedules' } }],
      expect: { calls: { onBack: 1, onOpenChange: 0 } },
    },
    {
      name: 'Cancel closes a clean drawer with false',
      props: (s) => ({ ...base, isOpen: true, onOpenChange: s.fn('onOpenChange'), primary: h(Button, { onPress: s.fn('onCreate') }, 'Create'), reason: 'Name it first.', cancel: true }),
      steps: [{ press: { role: 'button', name: 'Cancel' } }],
      expect: { calls: { onOpenChange: [[false]], onCreate: 0 }, nodes: [{ target: { role: 'dialog', name: 'New schedule' } }, { target: { text: 'Name it first.' } }] },
    },
    {
      name: 'Escape closes a clean drawer',
      props: (s) => ({ ...base, isOpen: true, onOpenChange: s.fn('onOpenChange') }),
      steps: [{ key: 'escape' }],
      expect: { calls: { onOpenChange: [[false]] } },
    },
    {
      name: 'dirty: Escape asks first; Keep editing keeps it open',
      props: (s) => ({ ...base, isOpen: true, onOpenChange: s.fn('onOpenChange'), dirty: true, cancel: 'Cancel' }),
      steps: [{ key: 'escape' }, { expect: { nodes: [{ target: { text: /Discard changes\?/ } }] } }, { press: { role: 'button', name: 'Keep editing' } }],
      expect: { calls: { onOpenChange: 0 }, nodes: [{ target: { text: /Discard changes\?/ }, absent: true }] },
    },
    {
      name: 'dirty: Discard closes',
      props: (s) => ({ ...base, isOpen: true, onOpenChange: s.fn('onOpenChange'), dirty: true }),
      steps: [{ key: 'escape' }, { press: { role: 'button', name: 'Discard' } }],
      expect: { calls: { onOpenChange: [[false]] } },
    },
    {
      name: 'busy: Escape and Cancel are refused',
      props: (s) => ({ ...base, isOpen: true, onOpenChange: s.fn('onOpenChange'), busy: true, cancel: true }),
      steps: [{ key: 'escape' }, { click: { role: 'button', name: 'Cancel' }, force: true }],
      expect: { calls: { onOpenChange: 0 }, nodes: [{ target: { role: 'button', name: 'Cancel' }, states: { disabled: true } }] },
    },
    {
      name: 'onBack: the header link goes back',
      props: (s) => ({ ...base, isOpen: true, onOpenChange: s.fn('onOpenChange'), onBack: s.fn('onBack') }),
      steps: [{ press: { role: 'button', name: /Back to New schedule/ } }],
      expect: { calls: { onBack: 1, onOpenChange: 0 } },
    },
  ],
});
