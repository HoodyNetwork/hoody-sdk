// Manifest of the schedules page (PageManifest, src/kit/page.ts). Discovered by glob: nothing
// else registers it. Status 'ready': no hidden pages in this dev/test environment.
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'schedules',
  path: '/schedules',
  title: 'title',
  description: 'Commands, scripts and agent timers that run on a schedule on the selected computer: when each runs next, how its runs went, Run now, pause and a new schedule.',
  nav: { group: 'build', order: 20, icon: 'hoody-cron', label: 'nav' },
  layout: 'list-detail',
  load: () => import('./view'),
  status: 'ready',
  sensitive: false,
  needs: { computer: 'required' },
  strings,
  commands: [{ id: 'open', label: 'cmd.open', keywords: ['cron', 'timer', 'repeat', 'every', 'loop'] }],
});
