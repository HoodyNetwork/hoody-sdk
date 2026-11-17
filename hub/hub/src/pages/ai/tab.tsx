// The AI tab's routes. /ai/models is Settings → Models & keys (view.tsx); /ai/knowledge/skills is
// Knowledge → Skills; /ai/knowledge/instructions is Knowledge → Instructions;
// /ai/knowledge/memory is Knowledge → Memory;
// /ai/auto/workflows, /loops and /todos are Automations; /ai/agents[/<name>] is Agents;
// /ai/f/<key> is a folder's page; /ai/connections is Settings → Connections;
// /ai/rules is Settings → Rules & safety, with Pause all and Stop everything. The
// models page's old links (/ai?connect=…, ?pick=, ?section=) move to /ai/models with their query before anything
// renders. Every screen
// draws inside the AI layout (parts/Pane.tsx): the pane (New chat, the switcher, the chat list, the computer
// foot) beside the main region. /ai, /ai/new and /ai/c/<sid> are the chat routes (their main region:
// parts/Main.tsx). Every other route not built yet replaces itself with /ai/models.
import { computerHandle, useCurrentComputer } from '@core';
import {
  DetailPage, Skeleton, useGo, useLiveRoute, useLocationHash, usePathname, useSearch, useShellData, useStrings, useSubPath,
} from '@kit';
import { lazy, Suspense, useEffect, useMemo } from 'react';
import { chatLink, links } from './links';
import { ChatsHome } from './parts/Main';
import { Conversation } from './parts/Conversation';
import { AiLayout, type AiDest } from './parts/Pane';
import { keyOf } from './parts/chats.logic';
import strings from './strings.en.json';
import ModelsView from './view';
import type { ShownComputer } from './knowledge/skills/Files';

// Models & keys is the tab's landing view and loads with it; every other screen loads when its route is first shown,
// so the landing view never waits for screens nobody opened.
const AgentsView = lazy(() => import('./agents/AgentsView').then((m) => ({ default: m.AgentsView })));
const LoopsList = lazy(() => import('./auto/loops/List').then((m) => ({ default: m.LoopsList })));
const TodosList = lazy(() => import('./auto/todos/List').then((m) => ({ default: m.TodosList })));
const Workflows = lazy(() => import('./auto/workflows/List').then((m) => ({ default: m.Workflows })));
const SkillsView = lazy(() => import('./knowledge/skills/List'));
const InstructionsView = lazy(() => import('./knowledge/instructions/InstructionsView'));
const MemoryView = lazy(() => import('./knowledge/memory/Memory'));
const SafetyView = lazy(() => import('./safety').then((m) => ({ default: m.SafetyView })));
const GitHubAccounts = lazy(() => import('./settings/connections/Accounts'));
const McpServers = lazy(() => import('./settings/connections/Mcp'));
const FolderPage = lazy(() => import('./folders/FolderPage'));

/** The chat list's own URL keys (useDataView: search, folder filter, sort, page): /ai with only these is the list. */
const CHAT_KEYS: ReadonlySet<string> = new Set(['q', 'folder', 'sort', 'page']);

/** One of the models page's old links: /ai with a query key the chat list does not own (?connect=, ?pick=, ?section=,
 *  ?handoff=, its list keys), or with an anchor of its own (/ai#spending; the router keeps it on the move). */
function oldModelsLink(parts: readonly string[], search: Readonly<Record<string, unknown>>, hash: string): boolean {
  if (parts.length !== 0) return false;
  return hash !== '' || Object.entries(search).some(([k, v]) => v !== undefined && v !== null && !CHAT_KEYS.has(k));
}

/** Where a route of the tab goes instead, or null when it shows here. An old models link carries its whole query to
 *  /ai/models. A route not built yet goes to /ai/models bare (a conversation's computer and realm mean nothing there). */
export function redirectOf(parts: readonly string[], search: Readonly<Record<string, unknown>>, hash = ''): string | null {
  const old = oldModelsLink(parts, search, hash);
  if (!old && viewOf(parts)) return null;
  const q = new URLSearchParams();
  if (old)
    for (const [k, v] of Object.entries(search)) {
      // The router may hand a value back as a number or a boolean (`?connect=1`): it goes on as its text.
      if (v !== undefined && v !== null) q.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
  const rest = q.toString();
  return rest ? `${links.list}?${rest}` : links.list;
}

/** The screen a route of the tab shows, or null for one not built yet. */
export type AiView = 'chats' | 'new' | 'chat' | 'folder' | 'models' | 'skills' | 'instructions' | 'memory' | 'agents' | 'workflows' | 'loops' | 'todos' | 'connections' | 'rules';

export function viewOf(parts: readonly string[]): AiView | null {
  const [a, b] = parts;
  if (parts.length === 0) return 'chats';
  if (parts.length === 1 && a === 'new') return 'new';
  if (parts.length === 2 && a === 'c' && b) return 'chat';
  // A folder's page: exactly one key segment (base64url, folders/key.ts); the page reads the key, computer and realm.
  if (parts.length === 2 && a === 'f' && b) return 'folder';
  if (a === 'models') return 'models';
  if (a === 'knowledge' && b === 'skills') return 'skills';
  if (a === 'knowledge' && b === 'instructions' && parts.length === 2) return 'instructions';
  if (a === 'knowledge' && b === 'memory' && parts.length === 2) return 'memory';
  // Exact depths: a deeper path no screen reads (/ai/rules/x) falls back to Models & keys like any unknown route.
  if (a === 'auto' && (b === 'workflows' || b === 'loops' || b === 'todos') && parts.length === 2) return b;
  if (a === 'agents' && parts.length <= 2) return 'agents';
  if (a === 'connections' && parts.length === 1) return 'connections';
  if (a === 'rules' && parts.length === 1) return 'rules';
  return null;
}

export default function AiTab() {
  const path = usePathname();
  const parts = useSubPath('/ai');
  const search = useSearch() as Readonly<Record<string, unknown>>;
  const hash = useLocationHash();
  const go = useGo();
  const live = useLiveRoute();
  const to = path === '/ai' || path.startsWith('/ai/') ? redirectOf(parts, search, hash) : null;
  useEffect(() => {
    // Move only while the browser still shows the route read here. The shell can draw this page again as the person
    // leaves it (Back right after the move), with its last location, /ai/new, while the browser already shows the
    // page before: a move then would replace that page's history entry with /ai/models.
    if (to !== null && live() === path) go(to, { replace: true });
  }, [to, go, path, live]);
  if (to !== null) return null;
  const view = viewOf(parts) ?? 'models';
  const dest: AiDest = view === 'skills' || view === 'instructions' || view === 'memory' ? 'knowledge'
    : view === 'agents' ? 'agents'
      : view === 'workflows' || view === 'loops' || view === 'todos' ? 'auto'
        : view === 'models' || view === 'connections' || view === 'rules' ? 'settings' : 'chats';
  if (view === 'chat') {
    const sid = parts[1]!;
    const computer = typeof search.computer === 'string' ? search.computer : '';
    const realm = typeof search.realm === 'string' ? search.realm : '';
    return (
      <AiLayout dest={dest} openKey={keyOf(realm, sid)}>
        {(pane) => <Conversation sid={sid} computer={computer} realm={realm} pane={pane} />}
      </AiLayout>
    );
  }
  return (
    // On phones bare /ai is the chat list; every other route shows its main screen.
    <AiLayout dest={dest} paneScreen={view === 'chats'}>
      {view === 'chats' || view === 'new' ? <ChatsHome /> : <Screen view={view} parts={parts} />}
    </AiLayout>
  );
}

/** The shown computer as the top bar has it: name, handle and whether it runs from the shell's record ('' and undefined while
 *  it has none or does not say), and the link fields from the core target (never `computerHandle(useCurrentComputer())`). */
function useShownComputer(): ShownComputer {
  const target = useCurrentComputer();
  const shell = useShellData();
  const c = target ? shell.computers.find((x) => x.id === target.container.id) : undefined;
  const link = target ? { id: target.container.id, project_id: target.project.id, server_name: target.container.server_name ?? '' } : null;
  // running: the shell's own boolean, or undefined when the record does not say (unknown is never read as stopped).
  return c
    ? { name: c.name, handle: computerHandle(c), running: typeof c.running === 'boolean' ? c.running : undefined, link }
    : { name: '', handle: '', running: undefined, link };
}

function Screen({ view, parts }: { view: Exclude<AiView, 'chats' | 'new' | 'chat'>; parts: readonly string[] }) {
  if (view === 'models') return <ModelsView />;
  return (
    <Suspense fallback={<Skeleton variant="detail" />}>
      <LazyScreen view={view} parts={parts} />
    </Suspense>
  );
}

function LazyScreen({ view, parts }: { view: Exclude<AiView, 'chats' | 'new' | 'chat' | 'models'>; parts: readonly string[] }) {
  const t = useStrings(strings);
  const computer = useShownComputer();
  const go = useGo();
  // A loop's chat links to its conversation, once the computer's handle is known (one function per handle: the list's
  // columns are built from it).
  const handle = computer.handle;
  const chatHref = useMemo(() => (handle ? (sid: string, realm: string) => chatLink({ computer: handle, realm, sid }) : undefined), [handle]);
  switch (view) {
    case 'agents':
      // The chosen agent is the route's: Back and reload keep it.
      return (
        <AgentsView
          selected={parts[1] ?? null}
          onSelect={(name) => go(links.agent(name))}
          // A deleted agent leaves its route: the index, replacing the gone entry so Back skips it.
          onDeleted={() => go(links.agents, { replace: true })}
        />
      );
    case 'rules':
      return <SafetyView computer={computer.name} />;
    case 'skills':
      return <SkillsView computer={computer} />;
    case 'instructions':
      return <InstructionsView />;
    case 'memory':
      return <MemoryView computer={computer.name} />;
    case 'workflows':
      return <Workflows computer={computer.name} chatHref={chatHref} />;
    case 'loops':
      return <LoopsList computer={computer.name} chatHref={chatHref} />;
    case 'todos':
      return <TodosList computer={computer.name} />;
    case 'folder':
      return <FolderPage />;
    case 'connections':
      return (
        <DetailPage header={{ title: t('connections.title'), subtitle: t('connections.subtitle') }}>
          <GitHubAccounts />
          <McpServers computer={computer.name} />
        </DetailPage>
      );
  }
}
