// Behaviour contract of the Schedules list cells (web and terminal). None of them takes a callback: the case below pins
// that the schedule cell draws its words on both platforms. `row` feeds only the web's hover title (the expression);
// the terminal has no hover and shows the expression in the row's detail (parts/Detail.tsx, Advanced).
import { loose } from '../../../kit/layouts/scenarioRoute';
import { scenarios } from '../../../kit/scenario-types';
import { ScheduleCell } from './NameCell';

export default scenarios('ScheduleCell', loose(ScheduleCell), {
  ignored: { row: 'only the web hover title reads it (the expression); no hover in a terminal, the detail shows the expression' },
  unsupported: {},
  cases: [
    {
      name: 'draws the schedule in words',
      steps: [],
      props: { row: { sched: { expr: '0 9 * * *' } }, children: 'Every day at 09:00' },
      expect: { nodes: [{ target: { text: 'Every day at 09:00' } }] },
    },
  ],
});
