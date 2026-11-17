// Behaviour contract of the kit UnreachableState (web and terminal; src/term/docs/scenarios.md): a status that names
// the computer and offers Try again; while a retry runs it does not retry again.
import { loose } from '../layouts/scenarioRoute';
import { scenarios } from '../scenario-types';
import { UnreachableState } from './Unreachable';

const NOW = Date.UTC(2026, 10, 11, 9, 0, 0);

export default scenarios('UnreachableState', loose(UnreachableState), {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'a status naming the computer and when it last answered; Try again retries once',
      props: (s) => ({ computer: 'atlas', lastSeen: NOW - 3 * 60_000, now: NOW, onRetry: s.fn('onRetry') }),
      steps: [{ press: { role: 'button', name: 'Try again' } }],
      expect: {
        calls: { onRetry: 1 },
        nodes: [{ target: { role: 'status' } }, { target: { text: "atlas isn't reachable right now" } }, { target: { text: /It last answered 3 minutes ago\. It may be off, restarting or offline\./ } }],
      },
    },
    {
      name: 'with no name and no known last answer it says only what is known',
      props: (s) => ({ onRetry: s.fn('onRetry'), now: NOW, lastSeen: NOW + 60_000 }),
      steps: [],
      expect: { nodes: [{ target: { text: "This computer isn't reachable right now" } }, { target: { text: /It last answered/ }, absent: true }] },
    },
    {
      name: 'compact: one status line with its own Try again, and Details for a rejection',
      props: (s) => ({ computer: 'atlas', size: 'compact', now: NOW, onRetry: s.fn('onRetry'), error: { status: 0 } }),
      steps: [{ press: { role: 'button', name: 'Try again' } }],
      expect: { calls: { onRetry: 1 }, nodes: [{ target: { role: 'status' } }, { target: { role: 'button', name: 'Details' } }] },
    },
    {
      name: 'compact: while a retry runs Try again does not retry again',
      props: (s) => ({ size: 'compact', now: NOW, onRetry: s.fn('onRetry'), retrying: true }),
      steps: [{ press: { role: 'button', name: 'Try again' }, force: true }],
      expect: { calls: { onRetry: 0 } },
    },
    {
      name: 'while a retry runs the button is busy and does not retry again; the page\'s other way out is offered',
      props: (s) => ({ now: NOW, onRetry: s.fn('onRetry'), retrying: true, secondary: 'Open Computers' }),
      steps: [{ press: { role: 'button', name: /Try again/ }, force: true }],
      expect: { calls: { onRetry: 0 }, nodes: [{ target: { text: 'Open Computers' } }] },
    },
  ],
});
