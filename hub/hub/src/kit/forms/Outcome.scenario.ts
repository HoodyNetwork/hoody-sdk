// Behaviour contract of the Outcome line and OutcomeSlot (src/term/scenario). The C9 rule is the
// point: what may have gone through (pending) offers Check again only, never Try again or the action itself.
import { scenarios } from '../scenario-types';
import { Outcome, OutcomeSlot } from './Outcome';

const LOOK = 'look only: the terminal draws its own line';

const line = scenarios('Outcome', Outcome, {
  ignored: { className: LOOK, variant: 'read: line vs block layout; both show the same words and actions', wrap: 'read: layout only (long words wrap instead of truncating)' },
  unsupported: {},
  cases: [
    {
      name: 'failed: an alert offering Try again, which calls onRetry',
      props: (s) => ({ outcome: 'failed', onRetry: s.fn('onRetry') }),
      steps: [{ press: { role: 'button', name: 'Try again' } }],
      expect: { calls: { onRetry: 1 }, nodes: [{ target: { role: 'alert' } }] },
    },
    {
      name: 'pending: Check again reads back and Try again is never offered',
      props: (s) => ({ outcome: 'pending', onCheck: s.fn('onCheck'), onRetry: s.fn('onRetry'), onDismiss: s.fn('onDismiss') }),
      steps: [{ press: { role: 'button', name: 'Check again' } }],
      expect: {
        calls: { onCheck: 1, onRetry: 0, onDismiss: 0 },
        nodes: [{ target: { role: 'button', name: 'Try again' }, absent: true }, { target: { role: 'button', name: 'Dismiss' }, absent: true }],
      },
    },
    {
      name: 'pending: Stop tracking, after Check again, calls onStop and reads nothing',
      props: (s) => ({ outcome: 'pending', onCheck: s.fn('onCheck'), onStop: s.fn('onStop') }),
      steps: [{ press: { role: 'button', name: 'Stop tracking' } }],
      expect: { calls: { onStop: 1, onCheck: 0 }, nodes: [{ target: { role: 'button', name: 'Check again' } }] },
    },
    {
      name: 'done: a status with the page\'s word; Dismiss calls onDismiss',
      props: (s) => ({ outcome: 'done', doneText: 'Saved', onDismiss: s.fn('onDismiss'), onRetry: s.fn('onRetry') }),
      steps: [{ expect: { nodes: [{ target: { role: 'status' } }, { target: { text: 'Saved' } }, { target: { role: 'button', name: 'Try again' }, absent: true }] } },
        { press: { role: 'button', name: 'Dismiss' } }],
      expect: { calls: { onDismiss: 1, onRetry: 0 } },
    },
    {
      name: 'alert raises a not_sent line to an alert',
      props: { outcome: 'not_sent', alert: true, title: 'Not sent: fill in the name' },
      steps: [],
      expect: { nodes: [{ target: { role: 'alert' } }, { target: { text: 'Not sent: fill in the name' } }] },
    },
    {
      name: 'no outcome: nothing is shown',
      props: { outcome: 'idle', onRetry: () => undefined },
      steps: [],
      expect: { nodes: [{ target: { role: 'alert' }, absent: true }, { target: { role: 'status' }, absent: true }] },
    },
  ],
});

const slot = scenarios('OutcomeSlot', OutcomeSlot, {
  ignored: { className: LOOK, wrap: 'read: layout only (passed to the line)', toastOnLeave: 'read: the leave toast is the toast host\'s (Toast.store), not drawn by the slot', subject: 'read: names the leave toast only' },
  unsupported: {},
  cases: [
    {
      name: 'pending: the action is hidden, Check again replaces it',
      props: (s) => ({ outcome: 'pending', onCheck: s.fn('onCheck'), toastOnLeave: false }),
      mount: (C, p, s, h) => h(C as never, p, h('button', { type: 'button', onClick: s.fn('save') }, 'Save')),
      steps: [{ press: { role: 'button', name: 'Check again' } }],
      expect: { calls: { onCheck: 1, save: 0 }, nodes: [{ target: { role: 'button', name: 'Save' }, absent: true }] },
      covers: ['children'],
    },
    {
      name: 'pending: Stop tracking reaches the line and calls onStop',
      props: (s) => ({ outcome: 'pending', onCheck: s.fn('onCheck'), onStop: s.fn('onStop'), toastOnLeave: false }),
      mount: (C, p, s, h) => h(C as never, p, h('button', { type: 'button', onClick: s.fn('save') }, 'Save')),
      steps: [{ press: { role: 'button', name: 'Stop tracking' } }],
      expect: { calls: { onStop: 1, onCheck: 0, save: 0 } },
    },
    {
      name: 'failed: the line and the action both show; Try again calls onRetry',
      props: (s) => ({ outcome: 'failed', onRetry: s.fn('onRetry') }),
      mount: (C, p, s, h) => h(C as never, p, h('button', { type: 'button', onClick: s.fn('save') }, 'Save')),
      steps: [{ press: { role: 'button', name: 'Try again' } }],
      expect: { calls: { onRetry: 1 }, nodes: [{ target: { role: 'button', name: 'Save' } }, { target: { role: 'alert' } }] },
      covers: ['children'],
    },
    {
      name: 'done with doneFor 0: the action is back at once',
      props: (s) => ({ outcome: 'done', doneFor: 0, onDismiss: s.fn('onDismiss') }),
      mount: (C, p, s, h) => h(C as never, p, h('button', { type: 'button', onClick: s.fn('save') }, 'Save')),
      steps: [{ press: { role: 'button', name: 'Save' } }],
      expect: { calls: { save: 1 }, nodes: [{ target: { role: 'status' }, absent: true }] },
      covers: ['children'],
    },
  ],
});

export default [line, slot];
