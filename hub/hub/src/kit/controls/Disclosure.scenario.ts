// Behaviour contract of Disclosure, run on the web and in the terminal (src/term/scenario).
// The web trigger is React Aria's disclosure button (aria-expanded); the panel's content is not reachable while closed.
import type { ReactElement } from 'react';
import { scenarios, type Html, type Spies } from '../scenario-types';
import { Disclosure, type DisclosureProps } from './Disclosure';

const trigger = { role: 'button', name: 'More options' };
const inside = { role: 'button', name: 'Inside' };
/** The body: a button, built through each side's own HTML factory (raw HTML needs the terminal's compat runtime). */
const withBody = {
  mount: (C: (p: DisclosureProps) => ReactElement | null, p: DisclosureProps, _s: Spies, h: Html) => h(C as (p: never) => ReactElement | null, { ...p, children: h('button', { type: 'button' }, 'Inside') }),
};

export default scenarios('Disclosure', Disclosure, {
  ignored: {
    id: 'the root anchor id: the terminal has no in-page anchors (a FAQ landing focuses triggerRef)',
    heading: 'read: a row fold draws its title plain instead of bold; look only (the terminal trigger is never a heading)',
  },
  unsupported: {},
  cases: [
    {
      ...withBody,
      name: 'closed by default: the trigger says so and the body is not there',
      props: { title: 'More options', children: null },
      steps: [],
      expect: { nodes: [{ target: trigger, states: { expanded: false } }, { target: inside, absent: true }] },
    },
    {
      ...withBody,
      name: 'Enter opens it and reports true; Space closes it again',
      props: (s) => ({ title: 'More options', children: null, onExpandedChange: s.fn('onExpandedChange') }),
      steps: [
        { press: trigger },
        { expect: { nodes: [{ target: trigger, states: { expanded: true } }, { target: inside }] } },
        { key: 'space' },
      ],
      expect: { calls: { onExpandedChange: [[true], [false]] }, nodes: [{ target: trigger, states: { expanded: false } }, { target: inside, absent: true }] },
    },
    {
      ...withBody,
      name: 'a click toggles it',
      props: (s) => ({ title: 'More options', children: null, onExpandedChange: s.fn('onExpandedChange') }),
      steps: [{ click: trigger }],
      expect: { calls: { onExpandedChange: [[true]] }, nodes: [{ target: inside }] },
    },
    {
      ...withBody,
      name: 'defaultExpanded starts open',
      props: { title: 'More options', children: null, defaultExpanded: true },
      steps: [],
      expect: { nodes: [{ target: trigger, states: { expanded: true } }, { target: inside }] },
    },
    {
      ...withBody,
      name: 'controlled without a parent update: reports the request, stays as the parent says',
      props: (s) => ({ title: 'More options', children: null, isExpanded: false, onExpandedChange: s.fn('onExpandedChange') }),
      steps: [{ press: trigger }],
      expect: { calls: { onExpandedChange: [[true]] }, nodes: [{ target: trigger, states: { expanded: false } }, { target: inside, absent: true }] },
    },
    {
      ...withBody,
      name: 'controlled by a parent that stores it',
      props: (s) => ({ title: 'More options', children: null, isExpanded: false, onExpandedChange: s.fn('onExpandedChange') }),
      control: { value: 'isExpanded', onChange: 'onExpandedChange' },
      steps: [{ press: trigger }],
      expect: { calls: { onExpandedChange: [[true]] }, nodes: [{ target: inside }] },
    },
    {
      ...withBody,
      name: 'its description is part of what the trigger reads',
      props: { title: 'More options', children: null, description: 'Model and memory' },
      steps: [],
      expect: { nodes: [{ target: { role: 'button', name: 'More options', exact: false } }] },
    },
  ],
});
