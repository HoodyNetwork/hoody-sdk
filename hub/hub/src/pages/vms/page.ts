// Manifest of the VMs page (PageManifest, src/kit/page.ts). Discovered by glob: nothing else registers it.
// The page shows the virtual machines that run inside the computer picked in the top bar.
import { definePage } from '@kit';
import { SCREENS } from './screens';
import strings from './strings.en.json';

export default definePage({
  id: 'vms',
  path: '/vms',
  title: 'title',
  description: 'Virtual machines inside the current computer: what the computer can run, the VM list and one VM.',
  nav: { group: 'build', order: 70, icon: 'hoody-kit', label: 'nav' },
  layout: 'detail',
  screens: SCREENS,
  load: () => import('./view'),
  status: 'ready',
  sensitive: false,
  needs: { computer: 'required' },
  strings,
  commands: [{ id: 'open', label: 'cmd.open', keywords: ['vm', 'virtual machine', 'kvm', 'windows', 'linux'] }],
});
