// Behaviour contract of the Home widget pieces (web and terminal). Mostly PRESENTATIONAL: rows, stats and charts show
// words and levels; what a reader must get is pinned here (a meter's level in words, a progress bar's count, a chart's
// name, a row's link). The only actions are a row's link, its inline action, and a stat's tip.
import { createElement as h } from 'react';
import { scenarios } from '../scenario-types';
import { atRoute } from '../layouts/scenarioRoute';
import { Button } from '../controls/Button';
import { Meter, ScaleBar, Sparkline, WidgetList, WidgetProgress, WidgetRow, WidgetStat } from './Widgets';

const css = 'no CSS classes in a terminal';
const routed = (C: unknown, p: unknown) => atRoute(() => h(C as never, p as never));

export default [
  scenarios('Meter', Meter, {
    ignored: { className: css },
    unsupported: {},
    cases: [
      // The level in words (aria-valuetext: "42%", "95%, very high") is pinned once the web driver reads it as `value`
      // (it does not yet); the terminal sets it today (Widgets.term.tsx).
      { name: 'a meter named by what it measures', props: { value: 42, label: 'Disk' }, steps: [], expect: { nodes: [{ target: { role: 'meter', name: 'Disk' } }] } },
      { name: 'fill: the same level across its container', props: { value: 50, label: 'CPU', size: 'fill' }, steps: [], expect: { nodes: [{ target: { role: 'meter', name: 'CPU' } }] } },
      { name: 'indeterminate is a busy progress bar', props: { indeterminate: true, label: 'Measuring' }, steps: [], expect: { nodes: [{ target: { role: 'progressbar', name: 'Measuring' } }] } },
    ],
  }),
  scenarios('ScaleBar', ScaleBar, {
    ignored: { className: css, value: 'read: only the look (the lit steps); the name says the value in words', max: 'read: only the look (the number of steps); the name says the value in words' },
    unsupported: {},
    cases: [
      { name: 'a place on a scale is an image named in words (presentational)', props: { value: 2, max: 5, label: 'AI allowance: 2 times the Free plan' }, steps: [], expect: { nodes: [{ target: { role: 'img', name: 'AI allowance: 2 times the Free plan' } }] } },
      { name: 'a scale past ten steps keeps its name', props: { value: 20, max: 40, label: 'AI allowance: 20 times the Free plan' }, steps: [], expect: { nodes: [{ target: { role: 'img', name: 'AI allowance: 20 times the Free plan' } }] } },
    ],
  }),
  scenarios('WidgetProgress', WidgetProgress, {
    ignored: {},
    unsupported: {},
    cases: [{ name: 'a progress bar with its count (presentational)', props: { done: 3, total: 7, label: 'Setup' }, steps: [], expect: { nodes: [{ target: { role: 'progressbar', name: 'Setup' } }, { target: { text: '3 of 7' } }] } }],
  }),
  scenarios('Sparkline', Sparkline, {
    ignored: { className: css },
    unsupported: {},
    cases: [{ name: 'a chart named by what it shows (presentational)', props: { points: [1, 4, 2, 8], label: 'Requests per hour' }, steps: [], expect: { nodes: [{ target: { role: 'img', name: 'Requests per hour' } }] } }],
  }),
  scenarios('WidgetList', WidgetList, {
    ignored: { className: css },
    unsupported: {},
    cases: [{ name: 'a named list (presentational)', props: { label: 'Recent', children: h(WidgetRow, { label: 'backup ran' }) }, steps: [], expect: { nodes: [{ target: { role: 'list', name: 'Recent' } }, { target: { text: 'backup ran' } }] } }],
  }),
  scenarios('WidgetRow', WidgetRow, {
    ignored: { className: css, icon: 'look only: the terminal shows the tone\'s mark, not an icon set' },
    unsupported: {},
    cases: [
      { name: 'a row with an address is a link', props: { label: 'Nightly backup', href: '/schedules' }, mount: routed as never, steps: [], expect: { nodes: [{ target: { role: 'link', name: /Nightly backup/ } }] } },
      {
        name: 'the row\'s inline action presses itself',
        props: (s) => ({ label: 'Disk full', tone: 'danger', action: h(Button, { onPress: s.fn('fix') }, 'Free space') }),
        steps: [{ press: { role: 'button', name: 'Free space' } }],
        expect: { calls: { fix: 1 } },
      },
    ],
  }),
  scenarios('WidgetStat', WidgetStat, {
    ignored: {},
    unsupported: {},
    cases: [
      { name: 'value and caption; a tip opens what it counts', props: { value: '12', caption: 'Computers', tip: 'Every computer you own' }, steps: [{ press: { role: 'button', name: /Computers/ } }], expect: { nodes: [{ target: { text: '12' } }, { target: { text: 'Every computer you own' } }] } },
    ],
  }),
];
