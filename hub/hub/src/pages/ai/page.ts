// Manifest of the AI tab (PageManifest, src/kit/page.ts). Discovered by glob: nothing
// else registers it. Status 'ready': no hidden pages.
// The tab's routes are in tab.tsx; the models view (view.tsx) is Settings → Models & keys at /ai/models.
import { definePage } from '@kit';
import strings from './strings.en.json';

export default definePage({
  id: 'ai',
  path: '/ai',
  title: 'title',
  description: 'AI: chat with a model and let agents work on your computer. Models & keys: the default model, your connected accounts and API keys, Claude Code, and what AI has cost.',
  nav: { group: 'main', order: 5, icon: 'hoody-ai', label: 'nav' },
  // Settings: the shell's main scrolls (Models & keys and the other settings screens scroll #hub-main); the AI pane
  // (parts/Pane.tsx) stays beside them, sticky and as tall as the page region.
  layout: 'settings',
  load: () => import('./tab'),
  searchHide: { load: () => import('./searchHide') },
  status: 'ready',
  sensitive: true,
  needs: { computer: 'required' },
  strings,
  // The command links go to Models & keys.
  commands: [
    { id: 'open', label: 'cmd.open', keywords: ['ai', 'chat', 'agent'] },
    { id: 'models', label: 'cmd.models', to: '/ai/models', keywords: ['models', 'providers', 'keys'] },
    { id: 'connect', label: 'cmd.connect', to: '/ai/models?connect=new', icon: 'plus', keywords: ['account', 'key', 'provider'] },
    { id: 'openai', label: 'cmd.openai', to: '/ai/models?connect=openai', keywords: ['chatgpt', 'gpt', 'key'] },
    { id: 'anthropic', label: 'cmd.anthropic', to: '/ai/models?connect=anthropic', keywords: ['claude', 'key'] },
    { id: 'google', label: 'cmd.google', to: '/ai/models?connect=google', keywords: ['gemini', 'key'] },
    { id: 'mimo', label: 'cmd.mimo', to: '/ai/models?connect=mimo', keywords: ['xiaomi', 'key'] },
    { id: 'model', label: 'cmd.model', to: '/ai/models?pick=helper', keywords: ['default', 'change', 'switch'] },
    { id: 'claude', label: 'cmd.claude', to: '/ai/models?section=claude', keywords: ['claude code'] },
    { id: 'spending', label: 'cmd.spending', to: '/ai/models?section=spending', keywords: ['cost', 'credit', 'usage'] },
  ],
});
