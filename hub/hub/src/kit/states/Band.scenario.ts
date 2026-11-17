// Behaviour contract of Band and Notice (web and terminal).
import { loose } from '../layouts/scenarioRoute';
import { scenarios } from '../scenario-types';
import { Band } from './Band';

export default scenarios('Band', loose(Band), {
  ignored: { over: 'layout only: laid over the top edge of a web frame; a terminal band takes a row of its own' },
  unsupported: { attach: 'layout: the band sits under the attached node; its role is covered below (status)' },
  cases: [
    {
      name: 'a warning band is an alert and says its words',
      props: { tone: 'warn', children: 'Two schedules failed today.' },
      steps: [],
      expect: { nodes: [{ target: { role: 'alert' } }, { target: { text: 'Two schedules failed today.' } }] },
    },
    {
      name: 'a neutral band is a status',
      props: { children: 'Showing Personal only.' },
      steps: [],
      expect: { nodes: [{ target: { role: 'status' } }] },
    },
    {
      name: 'a dismissable band closes through its Close button, once',
      props: (s) => ({ tone: 'danger', children: 'Could not reach atlas.', onDismiss: s.fn('onDismiss') }),
      steps: [{ press: { role: 'button', name: 'Close' } }],
      expect: { calls: { onDismiss: 1 } },
    },
    {
      name: 'its actions are reachable',
      props: (s) => ({ tone: 'warn', children: 'Key expires soon.', actions: null, onDismiss: s.fn('onDismiss') }),
      steps: [{ key: 'tab' }],
      expect: { focused: { role: 'button', name: 'Close' } },
    },
    {
      name: 'pending facts: the band turns into "may have gone through", its own actions give way, no Close',
      props: (s) => ({ tone: 'danger', children: 'Save failed.', error: { outcome: 'pending' }, pendingActions: null, onDismiss: s.fn('onDismiss') }),
      steps: [],
      expect: { nodes: [{ target: { role: 'button', name: 'Close' }, absent: true }], neverShown: ['Save failed.'] },
    },
    {
      name: 'a held band carries the pending mark',
      props: { tone: 'warn', held: true, children: 'A change to the exit address may have gone through.' },
      only: { platform: 'term', why: 'the web carries it as data-outcome="pending" for its shell, which no scenario target reads' },
      steps: [],
      expect: { nodes: [{ target: { text: '◷' } }, { target: { text: 'A change to the exit address may have gone through.' } }] },
    },
  ],
});
