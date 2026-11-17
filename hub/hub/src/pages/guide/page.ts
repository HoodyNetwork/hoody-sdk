// Manifest of the guide page (PageManifest, src/kit/page.ts). Discovered by glob: nothing
// else registers it. Status 'ready'.
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'guide',
  path: '/guide',
  title: 'title',
  description: 'The Guide: what Hoody is, the programs on your computers and their addresses, how to install the CLI and SDK, and ways to connect your tools and agents.',
  nav: { group: 'help', order: 10, icon: 'hoody-docs', label: 'nav' },
  layout: 'custom',
  load: () => import('./view'),
  status: 'ready',
  sensitive: false,
  strings,
  commands: [
    { id: 'open', label: 'cmd.open', keywords: ['help', 'docs', 'how'] },
    { id: 'connect', label: 'cmd.connect', to: '/guide#connect', keywords: ['claude', 'cursor', 'cli', 'sdk', 'mcp', 'ai'] },
    { id: 'skills', label: 'cmd.skills', to: '/guide#skills', keywords: ['skill', 'agent', 'claude', 'codex', 'cursor', 'sdk', 'api', 'http'] },
    { id: 'keys', label: 'cmd.keys', to: '/guide#keys', keywords: ['shortcuts', 'keyboard'] },
  ],
  // Skills and SDK in the top bar, before the account menu (hidden on the phone: see parts/TopBarLinks.tsx).
  topBar: { id: 'links', load: () => import('./parts/TopBarLinks') },
});
