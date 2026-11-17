// Public hrefs of the AI tab: the only file other pages may import from this folder.
// The models view is Settings → Models & keys at /ai/models; `list`, `section` and `connect` lead there, so the
// "Open models" links of Ask and Home keep landing on it.
import { isRealmId, isRealmOrGlobal } from '@core/pure';
import { folderKey, folderOfKey } from './folders/key';

/** A conversation's canonical reference: its computer by handle (name.last4, never the full id), the realm ('global'
 *  or a 24-hex id) and the session id. The Board stores the same shape (pages/board/model/boards.ts ConvRef). */
export interface ChatRef {
  readonly computer: string;
  readonly realm: string;
  readonly sid: string;
}

// The rules a Board conversation tile applies (pages/board/links.ts convTileUrl), so both name a chat the same way.
const HANDLE = /^[^\s/?#]{1,80}$/;
const SID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export type ModelsSection = 'default' | 'accounts' | 'claude' | 'allowance' | 'spending' | 'advanced';

const MODELS = '/ai/models';

export const links = {
  /** The AI tab. */
  tab: '/ai',
  /** New chat, at every size (on phones `/ai` is the chat list). */
  newChat: '/ai/new',
  /** New chat starting on one agent (the agent's page links here); New chat checks the name against the computer's list. */
  newChatWith: (agent: string) => `/ai/new?agent=${encodeURIComponent(agent)}`,
  /** Settings → Models & keys. */
  list: MODELS,
  /** Knowledge → Skills, installed. */
  skills: '/ai/knowledge/skills',
  /** Knowledge → Instructions, read only. */
  instructions: '/ai/knowledge/instructions',
  /** Knowledge → Memory: what agents remember in the top bar's realm, or in Global. */
  memory: '/ai/knowledge/memory',
  /** Automations → Workflows, Loops, TODOs. */
  workflows: '/ai/auto/workflows',
  loops: '/ai/auto/loops',
  todos: '/ai/auto/todos',
  /** TODOs with its New TODO drawer open. */
  newTodo: '/ai/auto/todos?new=1',
  /** Agents, and one agent's overview. */
  agents: '/ai/agents',
  agent: (name: string) => `/ai/agents/${encodeURIComponent(name)}`,
  /** Settings → Connections (GitHub accounts). */
  connections: '/ai/connections',
  /** Settings → Rules & safety (Pause all and Stop everything). */
  rules: '/ai/rules',
  /** A section of Models & keys: default, accounts, claude, spending, advanced. */
  section: (id: ModelsSection) => (id === 'default' ? MODELS : `${MODELS}?section=${id}`),
  /** Opens the Connect drawer of Models & keys; a provider id (openai, anthropic, google, mimo…) goes straight to its
   *  key step. */
  connect: (provider?: string) => (provider ? `${MODELS}?connect=${encodeURIComponent(provider)}` : `${MODELS}?connect=new`),
  /**
   * A model chooser's trip (core/handoff.ts): the endpoint form, the Claude Code section, or Connect at
   * a provider, carrying the trip id so the page says who it is setting up for and offers Go back.
   */
  handoff: (id: string, dest: 'endpoint' | 'claude' | 'connect', provider?: string) => {
    const h = `handoff=${encodeURIComponent(id)}`;
    if (dest === 'endpoint') return `/ai?connect=new&step=endpoint&${h}`;
    if (dest === 'claude') return `/ai?section=claude&${h}`;
    return provider ? `/ai?connect=${encodeURIComponent(provider)}&${h}` : `/ai?connect=new&${h}`;
  },
} as const;

/** A chat's agent, on the agents page, which reads the top bar's realm. `shown` is the realm the top bar shows: under another view (All
 *  realms) the link takes the chat's realm along and the shell switches (?open_realm=, shell/realmParam.tsx). '' when no link can say it: a
 *  Global chat there (no switch reaches Global), a session pinned to its view (nothing switches it), or a name a link can't carry. */
export function chatAgentLink(name: string, realm: string, shown: string, pinned = false): string {
  if (LONE_SURROGATE.test(name)) return '';
  if (realm === shown) return links.agent(name);
  return !pinned && isRealmId(realm) ? `${links.agent(name)}?${new URLSearchParams({ open_realm: realm }).toString()}` : '';
}

/** A conversation: `/ai/c/<sid>?computer=<handle>&realm=<realm>`; '' when a part of the reference is not one a link may
 *  carry (link nothing then). Outside `links`: app/conformance calls every `links` function with a string id. */
export function chatLink(r: ChatRef): string {
  if (!isRealmOrGlobal(r.realm) || !SID.test(r.sid) || !HANDLE.test(r.computer) || LONE_SURROGATE.test(r.computer)) return '';
  return `/ai/c/${encodeURIComponent(r.sid)}?${new URLSearchParams({ computer: r.computer, realm: r.realm }).toString()}`;
}

/** A folder on a computer in a realm: the same computer handle and realm rules as a ChatRef, and the folder's absolute
 *  path. */
export interface FolderRef {
  readonly computer: string;
  readonly realm: string;
  readonly path: string;
}

/** A folder's page: `/ai/f/<key>?computer=<handle>&realm=<realm>`, the key being folders/key.ts's base64url of the path;
 *  '' when a part is not one a link may carry, or the path is not one the page reads back from its key (absolute, valid
 *  text, no control character). Outside `links` for the same reason as chatLink. */
export function folderLink(r: FolderRef): string {
  if (!isRealmOrGlobal(r.realm) || !HANDLE.test(r.computer) || LONE_SURROGATE.test(r.computer)) return '';
  const key = folderKey(r.path);
  if (folderOfKey(key) !== r.path) return '';
  return `/ai/f/${key}?${new URLSearchParams({ computer: r.computer, realm: r.realm }).toString()}`;
}
