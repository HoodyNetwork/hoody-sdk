// Behaviour contract of the empty-state recipes (web and terminal; src/term/docs/scenarios.md): each says its fixed
// words and offers its one action. The "connection is back" retry of OfflineState is the host's event (the web's
// `online`), which no person's step can cause: it is proved per platform (Recipes.test.tsx, Recipes.term.test.tsx).
import { loose } from '../layouts/scenarioRoute';
import { scenarios } from '../scenario-types';
import { FirstUseState, NoAccessState, NoMatchState, OfflineState } from './Recipes';

const firstUse = scenarios('FirstUseState', loose(FirstUseState), {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'a first use teaches in a sentence and shows its action, its Guide topic and its hint',
      props: { title: 'Your computers live here', body: 'A computer runs your programs.', action: 'New computer', learn: 'How computers work', hint: 'Press n to make one', icon: 'server', size: 'md' },
      steps: [],
      expect: { nodes: [{ target: { text: 'Your computers live here' } }, { target: { text: 'A computer runs your programs.' } }, { target: { text: 'New computer' } }, { target: { text: 'How computers work' } }, { target: { text: 'Press n to make one' } }] },
    },
  ],
});

const noMatch = scenarios('NoMatchState', loose(NoMatchState), {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'nothing matches: Clear filters clears once',
      props: (s) => ({ onClear: s.fn('onClear') }),
      steps: [{ press: { role: 'button', name: 'Clear filters' } }],
      expect: { calls: { onClear: 1 }, nodes: [{ target: { text: 'Nothing matches these filters' } }, { target: { text: 'Try fewer filters or a different search.' } }] },
    },
    {
      name: 'compact with its own title: one line with Clear filters',
      props: (s) => ({ onClear: s.fn('onClear'), size: 'compact', title: 'No bots match "atlas"' }),
      steps: [{ press: { role: 'button', name: 'Clear filters' } }],
      expect: { calls: { onClear: 1 }, nodes: [{ target: { text: 'No bots match "atlas"' } }] },
    },
  ],
});

const noAccess = scenarios('NoAccessState', loose(NoAccessState), {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'no access says the kit words unless the page has its own, and shows the way out',
      props: { size: 'sm', action: 'Switch realm' },
      steps: [{ expect: { nodes: [{ target: { text: "You don't have access to this" } }, { target: { text: /Ask the owner of this realm/ } }, { target: { text: 'Switch realm' } }] } }, { rerender: { title: 'Not yours', body: 'Ask Ada.' } }],
      expect: { nodes: [{ target: { text: 'Not yours' } }, { target: { text: 'Ask Ada.' } }] },
    },
  ],
});

const offline = scenarios('OfflineState', loose(OfflineState), {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'offline: Try again reads again, once',
      props: (s) => ({ onRetry: s.fn('onRetry'), size: 'md' }),
      steps: [{ press: { role: 'button', name: 'Try again' } }],
      expect: { calls: { onRetry: 1 }, nodes: [{ target: { text: "You're offline" } }] },
    },
    {
      name: 'while a retry runs it does not retry again, compact or not',
      props: (s) => ({ onRetry: s.fn('onRetry'), retrying: true, size: 'compact' }),
      steps: [{ press: { role: 'button', name: /Try again/ }, force: true }, { rerender: { size: 'sm' } }, { press: { role: 'button', name: /Try again/ }, force: true }],
      expect: { calls: { onRetry: 0 } },
    },
    {
      name: 'with nothing to retry there is no button',
      props: { size: 'sm' },
      steps: [],
      expect: { nodes: [{ target: { role: 'button', name: 'Try again' }, absent: true }] },
    },
  ],
});

export default [firstUse, noMatch, noAccess, offline];
