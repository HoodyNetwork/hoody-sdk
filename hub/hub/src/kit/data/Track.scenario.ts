// Behaviour contract of Track and TrackStep (web and terminal): a named list of steps, exactly one open; the open step
// is a region named by its heading and holds its why, body and foot; a closed step that has something to show is a
// button that opens it (and tells the page), moving the focus to the opened step's heading; `flat` shows every body
// and offers no row button.
import { createElement as h, type ReactElement } from 'react';
import { scenarios } from '../scenario-types';
import { Button } from '../controls/Button';
import { loose } from '../layouts/scenarioRoute';
import { Track, TrackStep, type TrackStepProps } from './Track';

const step = (p: TrackStepProps, ...children: ReactElement[]) => h(TrackStep, { key: p.id, ...p }, ...children);
const steps = () => [
  step({ id: 'connect', state: 'done', name: 'Connect Telegram', result: 'Connected', why: 'It reads the token.' }),
  step({ id: 'privacy', state: 'now', name: 'Let it read groups', why: 'Telegram hides group messages from bots.' }),
  step({ id: 'home', state: 'later', optional: true, name: 'Choose a home chat', why: 'Its updates go there.' }),
  step({ id: 'reach', state: 'unknown', name: 'Members can reach it' }),
  step({ id: 'answer', state: 'wait', name: 'Answers in a group' }),
];
// `loose` widens a component's props, so a mount takes it back as the step it is.
const asStep = (C: unknown) => C as typeof TrackStep;
const inTrack = (C: unknown, p: unknown) => h(Track, { label: 'Get it working', children: h(asStep(C), p as TrackStepProps) });

export default [
  scenarios('Track', loose(Track), {
    ignored: { className: 'no CSS classes in a terminal' },
    unsupported: {},
    cases: [
      {
        name: 'a named list; the first step that needs the person is open, as a region named by its heading',
        props: { label: 'Get it working', children: steps() },
        steps: [],
        expect: {
          nodes: [
            { target: { role: 'list', name: 'Get it working' } },
            { target: { role: 'region', name: /Let it read groups/ } },
            { target: { text: 'Telegram hides group messages from bots.' } },
            { target: { text: 'Connected' } },
            { target: { text: 'It reads the token.' }, absent: true },
            { target: { role: 'button', name: /Connect Telegram/ }, states: { expanded: false } },
            { target: { role: 'button', name: /Members can reach it/ }, absent: true },
          ],
        },
      },
      {
        name: 'opening another step closes the open one, tells the page its id and moves the focus to its heading',
        props: (s) => ({ label: 'Get it working', onOpen: s.fn('onOpen'), children: steps() }),
        steps: [{ press: { role: 'button', name: /Choose a home chat/ } }],
        expect: {
          calls: { onOpen: [['home']] },
          nodes: [
            { target: { role: 'region', name: /Choose a home chat/ } },
            { target: { text: 'Its updates go there.' } },
            { target: { role: 'region', name: /Let it read groups/ }, absent: true },
            { target: { role: 'button', name: /Let it read groups/ }, states: { expanded: false } },
          ],
          focused: { role: 'heading', name: /Choose a home chat/ },
        },
      },
      {
        name: 'the page owns the open step: null opens none, and a press only asks',
        props: (s) => ({ label: 'Get it working', open: null, onOpen: s.fn('onOpen'), children: steps() }),
        steps: [{ press: { role: 'button', name: /Let it read groups/ } }],
        expect: { calls: { onOpen: [['privacy']] }, nodes: [{ target: { role: 'region', name: /Let it read groups/ }, absent: true }] },
      },
      {
        name: 'defaultOpen names the step open at first',
        props: { label: 'Get it working', defaultOpen: 'connect', children: steps() },
        steps: [],
        expect: { nodes: [{ target: { role: 'region', name: /Connect Telegram/ } }, { target: { text: 'It reads the token.' } }, { target: { role: 'region', name: /Let it read groups/ }, absent: true }] },
      },
      {
        name: 'flat: every step shows its body and no row is a button',
        props: { label: 'New script', flat: true, children: steps() },
        steps: [],
        expect: {
          nodes: [
            { target: { text: 'It reads the token.' } },
            { target: { text: 'Its updates go there.' } },
            { target: { role: 'button', name: /Connect Telegram/ }, absent: true },
            { target: { role: 'region', name: /Let it read groups/ } },
          ],
        },
      },
      {
        name: 'level is the heading level of a step\'s name',
        props: { label: 'Get it working', level: 4, children: steps() },
        steps: [],
        expect: { nodes: [{ target: { role: 'heading', name: /Let it read groups/, level: 4 } }] },
      },
    ],
  }),
  scenarios('TrackStep', loose(TrackStep), {
    ignored: { id: 'read by Track from the element (the open step is named by it); the step itself only writes it as a data attribute on the web' },
    unsupported: { tone: 'a look (the mark\'s colour and its ! or ✗ in a terminal); pinned in Track.term.test.tsx' },
    cases: [
      {
        name: 'the open step shows its why, tags, body and foot; its primary presses itself',
        props: (s) => ({
          id: 'privacy', state: 'now', name: 'Let it read groups', why: 'Telegram hides group messages from bots.', tags: 'Privacy on',
          foot: { say: 'This step closes once the Hub sees it.', primary: h(Button, { variant: 'primary', onPress: s.fn('check') }, 'Check again'), secondary: h(Button, { variant: 'ghost', onPress: s.fn('later') }, 'Not now') },
          children: 'Open the chat app first.',
        }),
        mount: (C, p) => inTrack(C, p),
        steps: [{ press: { role: 'button', name: 'Check again' } }, { press: { role: 'button', name: 'Not now' } }],
        expect: {
          calls: { check: 1, later: 1 },
          nodes: [
            { target: { role: 'region', name: /Let it read groups/ } },
            { target: { text: 'Telegram hides group messages from bots.' } },
            { target: { text: 'Privacy on' } },
            { target: { text: 'Open the chat app first.' } },
            { target: { text: 'This step closes once the Hub sees it.' } },
          ],
        },
      },
      {
        name: 'a done step is one line with its result; an optional and an unknown step say so',
        props: { id: 'connect', state: 'done', name: 'Connect Telegram', result: 'T Main' },
        mount: (C, p) => h(Track, { label: 'Get it working', children: [h(asStep(C), { key: 'a', ...(p as unknown as TrackStepProps) }), step({ id: 'home', state: 'later', optional: true, name: 'Choose a home chat' }), step({ id: 'reach', state: 'unknown', name: 'Members can reach it' })] }),
        covers: ['optional', 'state', 'result'],
        steps: [],
        expect: { nodes: [{ target: { text: 'T Main' } }, { target: { text: 'Optional' } }, { target: { text: /^\s*Can't tell\s*$/ } }, { target: { role: 'region', name: /Connect Telegram/ }, absent: true }] },
      },
    ],
  }),
];
