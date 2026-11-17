// Behaviour contract of the AI tab's rail (RailFrame, RailPane, RailNav, RailSubnav, RailFoot; web and terminal).
// Layout itself (the web's grid, the terminal's cells) is pinned by RailPane.term.test.tsx.
import { createElement as h } from 'react';
import { loose } from './scenarioRoute';
import { scenarios } from '../scenario-types';
import { RailFoot, RailFrame, RailNav, RailPane, RailSubnav } from './RailPane';

const HTML = 'an HTML attribute or element event of the underlying <div>: no meaning in a terminal';
const ROUTE = 'a link navigates: the route is the app\'s (useGoTerm / the browser), not the rail\'s behaviour';
const nav = [
  { id: 'chats', href: '/ai', icon: 'sparkle', label: 'Chats', current: true, mark: true },
  { id: 'agents', href: '/ai/agents', icon: 'hoody-ai-agent', label: 'Agents' },
];

const frame = scenarios('RailFrame', loose(RailFrame), {
  ignored: { '*': HTML, regionHeight: 'the web sizes its sticky rail from it; a terminal frame fills the region it is given', ref: HTML },
  unsupported: { width: 'a drawn width (layout, pinned by RailPane.term.test.tsx)', single: 'one slot or two (layout, pinned by RailPane.term.test.tsx)' },
  cases: [
    {
      name: 'it draws what it holds',
      props: { width: 320, regionHeight: null },
      mount: (C, p, s, html) => h(C, p as never, html('button', { onClick: s.fn('onClick') }, 'Inside')),
      covers: ['children'],
      steps: [{ press: { role: 'button', name: 'Inside' } }],
      expect: { calls: { onClick: 1 } },
    },
  ],
});

const pane = scenarios('RailPane', loose(RailPane), {
  ignored: {},
  unsupported: { strip: 'the nav across instead of down (layout, pinned by RailPane.term.test.tsx)' },
  cases: [
    {
      name: 'a named navigation region with its head, list, foot and handle',
      props: { label: 'AI' },
      mount: (C, p, s, html) => h(C, {
        ...p,
        head: html('button', { onClick: s.fn('head') }, 'New chat'),
        nav: h(RailNav, { label: 'Switch', items: nav } as never),
        children: html('button', { onClick: s.fn('row') }, 'A chat'),
        foot: html('button', { onClick: s.fn('foot') }, 'Gear'),
        handle: html('button', { onClick: s.fn('handle') }, 'Resize'),
      } as never),
      covers: ['head', 'nav', 'children', 'foot', 'handle'],
      steps: [{ press: { role: 'button', name: 'New chat' } }, { press: { role: 'button', name: 'A chat' } }, { press: { role: 'button', name: 'Gear' } }, { press: { role: 'button', name: 'Resize' } }],
      expect: { calls: { head: 1, row: 1, foot: 1, handle: 1 }, nodes: [{ target: { role: 'navigation', name: 'AI' } }, { target: { role: 'link', name: 'Chats' } }] },
    },
  ],
});

const railNav = scenarios('RailNav', loose(RailNav), {
  ignored: {},
  unsupported: { items: ROUTE },
  cases: [
    {
      name: 'one link per destination, the current one marked',
      props: { label: 'Switch', items: nav },
      steps: [],
      expect: { nodes: [{ target: { role: 'link', name: 'Chats' }, states: { current: 'page' } }, { target: { role: 'link', name: 'Agents' }, states: { current: false } }] },
    },
  ],
});

const subnav = scenarios('RailSubnav', loose(RailSubnav), {
  ignored: {},
  unsupported: { items: ROUTE, strip: 'across instead of down (layout, pinned by RailPane.term.test.tsx)' },
  cases: [
    {
      name: 'a named list of the destination\'s screens',
      props: { label: 'Knowledge', items: [{ id: 's', href: '/ai/skills', label: 'Skills', current: true }, { id: 'm', href: '/ai/memory', label: 'Memory' }] },
      steps: [],
      expect: { nodes: [{ target: { role: 'list', name: 'Knowledge' } }, { target: { role: 'link', name: 'Skills' }, states: { current: 'page' } }, { target: { role: 'link', name: 'Memory' } }] },
    },
  ],
});

const foot = scenarios('RailFoot', loose(RailFoot), {
  ignored: {},
  unsupported: { icon: 'a drawn mark beside the title (none for a decorative icon)', title: 'drawn as the bold first line of the foot; no press, focus or callback depends on it', note: 'drawn on its own muted line under the title; no press, focus or callback depends on it' },
  cases: [
    {
      name: 'its action, end control and children all work',
      props: { icon: 'computer', title: 'atlas · Personal', note: '1 needs you' },
      mount: (C, p, s, html) => h(C, {
        ...p,
        action: html('button', { onClick: s.fn('action') }, 'Pause'),
        end: html('button', { onClick: s.fn('end') }, 'Gear'),
        children: html('button', { onClick: s.fn('child') }, 'Stop result'),
      } as never),
      covers: ['action', 'end', 'children'],
      steps: [{ press: { role: 'button', name: 'Pause' } }, { press: { role: 'button', name: 'Gear' } }, { press: { role: 'button', name: 'Stop result' } }],
      expect: { calls: { action: 1, end: 1, child: 1 } },
    },
  ],
});

export default [frame, pane, railNav, subnav, foot];
