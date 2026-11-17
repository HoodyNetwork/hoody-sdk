// Behaviour contract of ScheduleField, run on the web and in the terminal (src/term/scenario). The
// rules and the state are shared (ScheduleField.pure.ts, kit/cron.ts); these cases pin the parts a page drives: the
// custom expression box, the lock, and where the page's error lands.
import { scenarios } from '../scenario-types';
import { ScheduleField } from './ScheduleField';

const EXPR = { role: 'textbox', name: 'Cron expression (UTC)' } as const;
/** Not a preset (the month field is set), so it reads as custom and shows the expression box. */
const CUSTOM = '1 2 3 4 5';
const NOW = Date.UTC(2026, 0, 5, 12, 0, 0);

const sf = scenarios('ScheduleField', ScheduleField, {
  ignored: {},
  unsupported: {
    onValid: 'reported from an effect on mount and on each validity change, so its call list follows React\'s effect runs: ScheduleField.test.tsx "says it is not valid while the time box holds text that is not a time" (the terminal runs the same useScheduleField)',
  },
  cases: [
    {
      name: 'an expression that is not a preset shows the custom box; typing reports the new text',
      props: (s) => ({ label: 'Schedule', value: CUSTOM, now: NOW, onChange: s.fn('onChange') }),
      steps: [{ type: [EXPR, 'x'] }],
      expect: { calls: { onChange: [[`${CUSTOM}x`]] }, nodes: [{ target: EXPR, value: CUSTOM }] },
    },
    {
      name: 'disabled: the custom box is locked and typing changes nothing',
      props: (s) => ({ label: 'Schedule', value: CUSTOM, now: NOW, isDisabled: true, onChange: s.fn('onChange') }),
      steps: [{ type: [EXPR, 'x'], force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: EXPR, states: { disabled: true } }] },
    },
    {
      name: 'for a custom schedule the page error sits on the expression box',
      props: { label: 'Schedule', value: CUSTOM, now: NOW, onChange: () => undefined, errorMessage: 'The computer refused this expression.' },
      steps: [],
      expect: { nodes: [{ target: EXPR, states: { invalid: true } }] },
    },
  ],
});

export default [sf];
