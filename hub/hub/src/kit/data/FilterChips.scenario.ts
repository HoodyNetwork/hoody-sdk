// Behaviour contract of FilterChips and FiltersButton (web and terminal): a chip opens its options as a
// named menu, a pick reports the new value, the chip's x clears it, "Clear all" shows once two filters are set, a
// required filter has no x, a segmented filter is a radio group.
import { scenarios, M } from '../scenario-types';
import { FilterChips, FiltersButton } from './FilterChips';

type Fn = (n: string) => (...a: unknown[]) => void;
const state = (s: { fn: Fn }, value?: string, more: Record<string, unknown> = {}) => ({
  id: 'state', label: 'State', value, onChange: s.fn('onChange'),
  options: [{ value: 'running', label: 'Running' }, { value: 'stopped', label: 'Stopped' }], ...more,
});
const kind = (s: { fn: Fn }, value?: string) => ({
  id: 'kind', label: 'Kind', value, onChange: s.fn('onKind'), options: [{ value: 'web', label: 'Web' }, { value: 'cmd', label: 'Command' }],
});

const chips = scenarios('FilterChips', FilterChips, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'a chip opens its options as a menu; a pick reports the value',
      props: (s) => ({ filters: [state(s)] }),
      steps: [{ press: { role: 'button', name: 'State', exact: false } }, { expect: { nodes: [{ target: { role: 'menu', name: 'State' } }] } }, { press: { role: 'menuitemradio', name: 'Running' } }],
      expect: { calls: { onChange: [['running']] } },
    },
    {
      name: 'a set chip shows its value; its x clears it',
      props: (s) => ({ filters: [state(s, 'running')] }),
      steps: [{ expect: { nodes: [{ target: { role: 'button', name: 'Running', exact: false } }] } }, { press: { role: 'button', name: 'Clear State' } }],
      expect: { calls: { onChange: [[undefined]] } },
    },
    {
      name: 'a required filter has no x',
      props: (s) => ({ filters: [state(s, 'running', { required: true })] }),
      steps: [],
      expect: { nodes: [{ target: { role: 'button', name: 'Clear State' }, absent: true }] },
    },
    {
      name: 'Clear all shows once two filters are set, and calls onClearAll',
      props: (s) => ({ filters: [state(s, 'running'), kind(s, 'web')], onClearAll: s.fn('onClearAll') }),
      steps: [{ press: { role: 'button', name: 'Clear all' } }],
      expect: { calls: { onClearAll: 1 } },
    },
    {
      name: 'one filter set: no Clear all',
      props: (s) => ({ filters: [state(s, 'running'), kind(s)], onClearAll: s.fn('onClearAll') }),
      steps: [],
      expect: { nodes: [{ target: { role: 'button', name: 'Clear all' }, absent: true }] },
    },
    {
      name: 'a segmented filter is a radio group; a choice reports the value',
      props: (s) => ({ filters: [state(s, undefined, { display: 'segmented' })] }),
      steps: [{ click: { role: 'radio', name: 'Stopped' } }],
      expect: { calls: { onChange: [['stopped']] } },
    },
  ],
});

const button = scenarios('FiltersButton', FiltersButton, {
  ignored: {},
  unsupported: { iconOnly: 'look only: the count shows either way' },
  cases: [
    {
      name: 'opens every filter; a pick inside reports the value',
      props: (s) => ({ filters: [state(s)] }),
      steps: [{ press: { role: 'button', name: 'Filters', exact: false } }, { press: { role: 'button', name: 'State', exact: false } }, { press: { role: 'menuitemradio', name: 'Stopped' } }],
      expect: { calls: { onChange: [['stopped']] } },
    },
    {
      name: 'its Clear filters clears through onClearAll',
      props: (s) => ({ filters: [state(s, 'running')], onClearAll: s.fn('onClearAll') }),
      steps: [{ press: { role: 'button', name: 'Filters', exact: false } }, { press: { role: 'button', name: 'Clear filters', exact: false } }],
      expect: { calls: { onClearAll: 1 } },
    },
  ],
});

void M;
export default [chips, button];
