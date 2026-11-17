// Behaviour contract of Popover, Sheet and Tooltip (web and terminal).
import { createElement as h } from 'react';
import { scenarios } from '../scenario-types';
import { Button } from '../controls/Button';
import { Popover, Sheet, Tooltip } from './Popover';

const popover = scenarios('Popover', Popover, {
  ignored: {
    className: 'no CSS classes in a terminal',
    anchor: 'a DOM element ref; the terminal places the popover against its trigger',
    phone: 'the phone sheet: a narrow terminal keeps the anchored popover, clamped',
  },
  unsupported: {},
  cases: [
    {
      name: 'the trigger opens a named dialog; Escape closes it',
      props: () => ({ trigger: h(Button, null, 'Filter'), label: 'Filter logs', children: 'Show only errors' }),
      steps: [{ press: { role: 'button', name: 'Filter' } }, { expect: { nodes: [{ target: { role: 'dialog', name: 'Filter logs' } }] } }, { key: 'escape' }],
      expect: { nodes: [{ target: { role: 'dialog', name: 'Filter logs' }, absent: true }] },
    },
    {
      name: 'children(close): a choice closes it',
      props: (s) => ({
        trigger: h(Button, null, 'Filter'),
        label: 'Filter logs',
        children: (close: () => void) => h(Button, { onPress: () => { s.fn('chose')(); close(); } }, 'Errors'),
      }),
      steps: [{ press: { role: 'button', name: 'Filter' } }, { press: { role: 'button', name: 'Errors' } }],
      expect: { calls: { chose: 1 }, nodes: [{ target: { role: 'dialog' }, absent: true }] },
    },
    {
      name: 'controlled: Escape asks to close with false',
      props: (s) => ({ trigger: h(Button, null, 'Filter'), label: 'Filter logs', isOpen: true, onOpenChange: s.fn('onOpenChange'), children: 'Inside' }),
      steps: [{ key: 'escape' }],
      expect: { calls: { onOpenChange: [[false]] } },
    },
  ],
});

const sheet = scenarios('Sheet', Sheet, {
  ignored: { overlayId: 'a DOM data attribute for the shell' },
  unsupported: {},
  cases: [
    {
      name: 'a full-screen named dialog; Close asks to close',
      props: (s) => ({ isOpen: true, onOpenChange: s.fn('onOpenChange'), title: 'Choose a computer', children: 'Body' }),
      steps: [{ press: { role: 'button', name: 'Close' } }],
      expect: { calls: { onOpenChange: [[false]] }, nodes: [{ target: { text: 'Body' } }] },
    },
    {
      name: 'Escape asks to close',
      props: (s) => ({ isOpen: true, onOpenChange: s.fn('onOpenChange'), title: 'Choose a computer', children: 'Body' }),
      steps: [{ key: 'escape' }],
      expect: { calls: { onOpenChange: [[false]] } },
    },
  ],
});

const tooltip = scenarios('Tooltip', Tooltip, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'the wrapped control keeps its own behaviour',
      props: (s) => ({ content: 'Refresh the list', children: h(Button, { onPress: s.fn('refresh') }, 'Refresh') }),
      steps: [{ press: { role: 'button', name: 'Refresh' } }],
      expect: { calls: { refresh: 1 } },
    },
    {
      name: 'keyboard focus on the child shows the tip',
      props: (s) => ({ content: 'Refresh the list', children: h(Button, { onPress: s.fn('refresh') }, 'Refresh') }),
      steps: [{ focus: { role: 'button', name: 'Refresh' } }],
      expect: { calls: { refresh: 0 }, nodes: [{ target: { role: 'tooltip', name: 'Refresh the list' } }] },
    },
    {
      name: 'more lines: each fact shows under the first line, empty lines left out',
      props: (s) => ({ content: 'atlas', lines: ['Realm Personal', '', 'Running'], children: h(Button, { onPress: s.fn('open') }, 'atlas') }),
      steps: [{ focus: { role: 'button', name: 'atlas' } }],
      expect: { nodes: [{ target: { role: 'tooltip' } }, { target: { text: 'Realm Personal' } }, { target: { text: 'Running' } }] },
    },
    {
      name: 'disabled: focus shows nothing',
      props: (s) => ({ content: 'Refresh the list', isDisabled: true, children: h(Button, { onPress: s.fn('refresh') }, 'Refresh') }),
      steps: [{ focus: { role: 'button', name: 'Refresh' } }],
      expect: { nodes: [{ target: { role: 'tooltip' }, absent: true }] },
    },
  ],
});

export default [popover, sheet, tooltip];
