// Behaviour contract of the kit's loading, empty, error and outcome states (web and terminal).
import { loose } from '../layouts/scenarioRoute';
import { scenarios } from '../scenario-types';
import { EmptyState, ErrorState, OutcomeBanner, TableSkeletonBody } from './States';

const LOOK = 'look only: each platform draws its own face';

const errorState = scenarios('ErrorState', loose(ErrorState), {
  ignored: {},
  unsupported: { pendingSecondary: 'a slot shown only for pending facts; drawn as given, no behaviour of its own' },
  cases: [
    {
      name: 'an error is an alert; Try again retries once',
      props: (s) => ({ title: 'Schedules did not load', onRetry: s.fn('onRetry') }),
      steps: [{ press: { role: 'button', name: 'Try again' } }],
      expect: { calls: { onRetry: 1 }, nodes: [{ target: { role: 'alert' } }] },
    },
    {
      name: 'while a retry runs the button is busy and does not retry again',
      props: (s) => ({ title: 'Schedules did not load', onRetry: s.fn('onRetry'), retrying: true }),
      steps: [{ press: { role: 'button', name: /Try again/ }, force: true }],
      expect: { calls: { onRetry: 0 } },
    },
    {
      name: 'pending facts take over: no retry is offered (a resend could do it twice)',
      props: (s) => ({ title: 'Could not save', onRetry: s.fn('onRetry'), error: { outcome: 'pending' } }),
      steps: [],
      expect: { nodes: [{ target: { role: 'button', name: 'Try again' }, absent: true }, { target: { text: 'This may have gone through' } }] },
    },
    {
      name: 'compact: one alert line with its own retry',
      props: (s) => ({ title: 'Not loaded', size: 'compact', onRetry: s.fn('onRetry'), secondary: null, body: undefined }),
      steps: [{ press: { role: 'button', name: 'Try again' } }],
      expect: { calls: { onRetry: 1 }, nodes: [{ target: { role: 'alert' } }] },
    },
  ],
});

const outcome = scenarios('OutcomeBanner', loose(OutcomeBanner), {
  ignored: {},
  unsupported: {
    checking: 'busy look of Check again; Button busy behaviour is covered by Button.scenario',
    known: LOOK, checkLine: LOOK, stopLine: LOOK,
    error: 'C9 promotion is covered by errorDetails.pure unit tests and the ErrorState pending case',
  },
  cases: [
    {
      name: 'pending: an alert; Check again calls onCheck',
      props: (s) => ({ kind: 'pending', onCheck: s.fn('onCheck') }),
      steps: [{ press: { role: 'button', name: 'Check again' } }],
      expect: { calls: { onCheck: 1 }, nodes: [{ target: { role: 'alert' } }] },
    },
    {
      name: 'what the last Check again found is its own status line, under the check line',
      props: (s) => ({ kind: 'pending', checkLine: 'Check again reads the saved state.', result: 'Still not confirmed.', onCheck: s.fn('onCheck') }),
      steps: [],
      expect: { nodes: [{ target: { role: 'status' } }, { target: { text: 'Still not confirmed.' } }, { target: { text: 'Check again reads the saved state.' } }] },
    },
    {
      name: 'pending: Stop tracking asks first; only the confirm dismisses',
      props: (s) => ({ kind: 'pending', onDismiss: s.fn('onDismiss') }),
      steps: [
        { press: { role: 'button', name: /Stop tracking/ } },
        { expect: { calls: { onDismiss: 0 } } },
        { press: { role: 'button', name: 'Stop tracking anyway', exact: true } },
      ],
      expect: { calls: { onDismiss: 1 } },
    },
    {
      name: 'pending, already warned: Stop tracking dismisses at once',
      props: (s) => ({ kind: 'pending', onDismiss: s.fn('onDismiss'), dismissWarned: true }),
      steps: [{ press: { role: 'button', name: /Stop tracking/ } }],
      expect: { calls: { onDismiss: 1 } },
    },
    {
      name: 'done is a status with its own title, body and actions; Hide dismisses',
      props: (s) => ({ kind: 'done', title: 'Saved', body: 'All three rows.', onDismiss: s.fn('onDismiss'), actions: null }),
      steps: [{ press: { role: 'button', name: 'Hide this note' } }],
      expect: { calls: { onDismiss: 1 }, nodes: [{ target: { role: 'status' } }, { target: { text: 'All three rows.' } }] },
    },
  ],
});

const empty = scenarios('EmptyState', loose(EmptyState), {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'the action in an empty state is reachable and pressed once',
      props: () => ({ title: 'No schedules yet', body: 'Add one to run a command on time.' }),
      steps: [],
      expect: { nodes: [{ target: { text: 'No schedules yet' } }, { target: { text: /Add one to run/ } }] },
    },
  ],
});

const skeleton = scenarios('TableSkeletonBody', TableSkeletonBody, {
  ignored: {
    rows: 'look only: the web draws placeholder rows in the loading table; a terminal table says it is loading on its own line',
    cells: 'look only: where each placeholder row draws its line in a web table cell',
    rowClassName: 'no CSS classes in a terminal',
  },
  unsupported: {},
  cases: [
    {
      name: 'draws nothing a reader meets (the table says it is loading)',
      // Web: the rows are a <tbody>, which needs a <table> around it; hidden from readers there too (aria-hidden).
      only: { platform: 'term', why: 'the web rows are a <tbody> that only mounts inside a table' },
      props: { rows: 3, cells: [{ bar: true }, { bar: true }] },
      steps: [],
      expect: { nodes: [{ target: { role: 'row' }, absent: true }] },
    },
  ],
});

export default [errorState, outcome, empty, skeleton];
