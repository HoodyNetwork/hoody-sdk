// Behaviour contract of the page layouts that have behaviour of their own: WizardPage (going back to a done step) and
// SettingsPage (the section menu). Web and terminal.
import { createElement as h, type ReactElement } from 'react';
import { scenarios } from '../scenario-types';
import { atRoute, loose } from './scenarioRoute';
import { DashboardPage, DetailPage, SettingsPage, Widget, WizardFooter, WizardPage } from './Layouts';

const LOOK = 'look only: each platform draws its own face';
type P = Record<string, unknown>;
type Html = (t: string, a: Record<string, unknown> | null, ...c: unknown[]) => ReactElement;
const steps = [{ id: 'name', label: 'Name' }, { id: 'members', label: 'Members' }, { id: 'review', label: 'Review' }];

const wizard = scenarios('WizardPage', loose(WizardPage), {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'a done step is a button that goes back to it; the current and later steps are not',
      props: (s) => ({ header: { title: 'New realm' }, steps, current: 1, onStep: s.fn('onStep') }),
      mount: (C, p, _s, html) => atRoute(() => h(C, { ...(p as P), children: (html as Html)('p', null, 'step body') } as never)),
      covers: ['children'],
      steps: [{ press: { role: 'button', name: 'Name' } }],
      expect: {
        calls: { onStep: [[0]] },
        nodes: [{ target: { role: 'button', name: 'Members' }, absent: true }, { target: { role: 'button', name: 'Review' }, absent: true }, { target: { text: 'step body' } }],
      },
    },
    {
      name: 'without onStep no step is pressable',
      props: () => ({ header: { title: 'New realm' }, steps, current: 2 }),
      mount: (C, p, _s, html) => atRoute(() => h(C, { ...(p as P), children: (html as Html)('p', null, 'step body') } as never)),
      covers: ['children'],
      steps: [],
      expect: { nodes: [{ target: { role: 'button', name: 'Name' }, absent: true }] },
    },
    {
      name: 'flow: a done step is a button that says where it goes back to',
      props: (s) => ({ header: { title: 'New script' }, steps, current: 1, onStep: s.fn('onStep'), variant: 'flow' }),
      mount: (C, p, _s, html) => atRoute(() => h(C, { ...(p as P), children: (html as Html)('p', null, 'step body') } as never)),
      covers: ['children'],
      steps: [{ press: { role: 'button', name: 'Go back to step 1: Name' } }],
      expect: { calls: { onStep: [[0]] }, nodes: [{ target: { text: 'step body' } }] },
    },
  ],
});

const sections = (html: Html) => [
  { id: 'profile', title: 'Profile', content: html('p', null, 'name and email') },
  { id: 'security', title: 'Security', content: html('p', null, 'password') },
];

const settings = scenarios('SettingsPage', loose(SettingsPage), {
  ignored: {},
  unsupported: { sectionParam: 'the query key name only; ?section= itself is exercised by the menu case' },
  cases: [
    {
      name: 'the section menu is a named navigation; pressing a section makes it the current one',
      props: () => ({ header: { title: 'Account' } }),
      mount: (C, p, _s, html) => atRoute(() => h(C, { ...(p as P), sections: sections(html as Html) } as never)),
      covers: ['sections'],
      steps: [{ press: { role: 'button', name: 'Security' } }],
      expect: { nodes: [{ target: { role: 'navigation', name: 'Sections' } }, { target: { role: 'button', name: 'Security' }, states: { current: true } }] },
    },
    {
      name: 'scroll-spy: reading to the end with the End key marks the last section in the menu, Home the first',
      only: { platform: 'term', why: 'jsdom lays nothing out, so there is no scroll to follow' },
      props: () => ({ header: { title: 'Account' } }),
      mount: (C, p, _s, html) => atRoute(() => h(C, { ...(p as P), sections: ['Alpha', 'Beta', 'Gamma'].map((title) => ({
        id: title.toLowerCase(), title, content: (html as Html)('div', null, ...Array.from({ length: 12 }, (_, i) => (html as Html)('p', null, `${title} ${i}`))),
      })) } as never)),
      covers: ['sections'],
      steps: [
        { key: 'end' },
        { expect: { nodes: [{ target: { role: 'button', name: 'Gamma' }, states: { current: true } }] } },
        { key: 'home' },
      ],
      expect: { nodes: [{ target: { role: 'button', name: 'Alpha' }, states: { current: true } }, { target: { role: 'button', name: 'Gamma' }, states: { current: false } }] },
    },
  ],
});

const detail = scenarios('DetailPage', loose(DetailPage), {
  ignored: {
    accent: "the computer's colour is any hex; a terminal draws only theme tokens (approximation, listed in the report)",
    menuLabel: "the ⋯ menu's spoken name; the terminal ⋯ keeps the menu's default name",
  },
  unsupported: { tabParam: 'the query key name only; the tab switch itself is the case below' },
  cases: [
    {
      name: 'tabs: choosing one shows its panel and marks it selected',
      props: () => ({ header: { title: 'atlas' } }),
      mount: (C, p, _s, html) => atRoute(() => h(C, { ...(p as P), tabs: [
        { id: 'over', label: 'Overview', content: (html as Html)('p', null, 'overview body') },
        { id: 'hist', label: 'History', content: (html as Html)('p', null, 'history body') },
      ] } as never)),
      covers: ['tabs'],
      steps: [{ click: { role: 'tab', name: 'History' } }],
      expect: { nodes: [{ target: { role: 'tab', name: 'History' }, states: { selected: true } }, { target: { text: 'history body' } }, { target: { text: 'overview body' }, absent: true }] },
    },
  ],
});

const dashboard = scenarios('DashboardPage', loose(DashboardPage), {
  ignored: { flow: "'dense' packing would move a widget above one written before it; the terminal keeps reading and Tab order one (approximation)" },
  unsupported: {},
  cases: [
    {
      name: 'the page title is the heading; the widgets are drawn in the order written',
      props: () => ({ header: { title: 'Home' } }),
      mount: (C, p, _s, html) => atRoute(() => h(C, { ...(p as P), children: [
        h(loose(Widget), { key: 'a', title: 'Computers', size: 's' }, (html as Html)('p', null, 'a body')),
        h(loose(Widget), { key: 'b', title: 'Spend', size: 's' }, (html as Html)('p', null, 'b body')),
      ] } as never)),
      covers: ['children'],
      steps: [],
      expect: { nodes: [{ target: { role: 'heading', name: 'Home', level: 1 } }, { target: { text: 'a body' } }, { target: { text: 'b body' } }] },
    },
  ],
});

const widget = scenarios('Widget', loose(Widget), {
  ignored: { size: 'read for the look only: the tracks a card spans inside a DashboardPage (a width; nothing to press or observe)' },
  unsupported: {},
  cases: [
    {
      name: 'its View all link is reachable by Tab',
      props: { title: 'Computers', viewAll: { href: '/computers', label: 'View all' } },
      mount: (C, p, _s, html) => atRoute(() => h(C, { ...(p as P), children: (html as Html)('p', null, 'body') } as never)),
      covers: ['children'],
      steps: [{ key: 'tab' }],
      expect: { focused: { role: 'link', name: /View all/ } },
    },
  ],
});

const footer = scenarios('WizardFooter', loose(WizardFooter), {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'Back goes back; the primary and secondary actions are the caller\'s own buttons',
      props: (s) => ({ back: { onPress: s.fn('onBack') } }),
      mount: (C, p, s, html) => h(C, { ...(p as P),
        primary: (html as Html)('button', { type: 'button', onClick: s.fn('onNext') }, 'Next'),
        secondary: (html as Html)('button', { type: 'button', onClick: s.fn('onSkip') }, 'Skip') } as never),
      covers: ['primary', 'secondary'],
      steps: [{ press: { role: 'button', name: 'Back' } }, { press: { role: 'button', name: 'Next' } }],
      expect: { calls: { onBack: 1, onNext: 1, onSkip: 0 } },
    },
    {
      name: 'a disabled Back says so and offers no press (Tab passes it)',
      props: (s) => ({ back: { onPress: s.fn('onBack'), isDisabled: true } }),
      mount: (C, p, _s, html) => h(C, { ...(p as P), primary: (html as Html)('button', { type: 'button' }, 'Next') } as never),
      covers: ['primary'],
      steps: [{ key: 'tab' }, { key: 'return' }],
      expect: { calls: { onBack: 0 }, focused: { role: 'button', name: 'Next' }, nodes: [{ target: { role: 'button', name: 'Back' }, states: { disabled: true } }] },
    },
    {
      name: 'a note is one line with the row; Back still goes back',
      props: (s) => ({ back: { onPress: s.fn('onBack') }, note: 'Checks the name first.', noteId: 'foot-note' }),
      mount: (C, p, _s, html) => h(C, { ...(p as P), primary: (html as Html)('button', { type: 'button' }, 'Next') } as never),
      covers: ['primary'],
      steps: [{ press: { role: 'button', name: 'Back' } }],
      expect: { calls: { onBack: 1 }, nodes: [{ target: { text: 'Checks the name first.' } }, { target: { role: 'button', name: 'Next' } }] },
    },
    {
      name: 'no back: no Back button',
      props: {},
      mount: (C, p, _s, html) => h(C, { ...(p as P), primary: (html as Html)('button', { type: 'button' }, 'Next') } as never),
      covers: ['primary'],
      steps: [],
      expect: { nodes: [{ target: { role: 'button', name: 'Back' }, absent: true }, { target: { role: 'button', name: 'Next' } }] },
    },
  ],
});

export default [wizard, settings, detail, dashboard, widget, footer];
