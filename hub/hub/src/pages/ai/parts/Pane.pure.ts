// The AI tab layout's pure part (split out of Pane.tsx so the terminal build shares it; the design notes are at the top of
// Pane.tsx): the widths, the switcher and group tables, the pause and chats contexts (one instance each) and their hooks.
// Pane.tsx re-exports the public names; RAIL, PAGE_MIN, PauseContext, SWITCH, GROUPS, screenOf, RE24, ChatsContext and
// Group are for Pane.tsx.
import { realmLabel } from '@core';
import { useStrings, type IconName, type PaneRange, type PauseStore } from '@kit';
import { createContext, useContext } from 'react';
import { links } from '../links';
import type { ChatsAt, ChatsRead } from './data';
import strings from './Pane.strings.en.json';

/** Where the person is in the tab: the destination the switcher marks, and the open chat on a conversation route. */
export type AiDest = 'chats' | 'agents' | 'auto' | 'knowledge' | 'settings';

/** The rail's widths beside the page: the one range every left rail has. Remembered on this device. */
export const RAIL: PaneRange = { min: 280, max: 560, def: 340 };
/** The narrowest main region the AI screens are laid out for (610 px): the Accounts
 *  table's column floors (552 px: provider, how it connects, status, used by, actions) and the page
 *  padding on both sides (2 × --pad-page, 20 px at these page widths: content class M, AppShell.module.css), with 18 px
 *  to spare. The table sheds Used by only once its own width falls below the 552 px floors (pages/ai/page.spec.ts). */
export const PAGE_MIN = 610;
/** Below this page width the pane and the main region take turns (the pane's minimum plus PAGE_MIN,
 *  so the pane never squeezes the page below PAGE_MIN). */
export const PANE_MIN_PAGE = RAIL.min + PAGE_MIN;

export const PauseContext = createContext<PauseStore | null>(null);
/** The computer's pause store, for a surface the AI layout draws (the conversation's band); null outside it. */
export function useAiPause(): PauseStore | null {
  return useContext(PauseContext);
}

export const SWITCH: ReadonlyArray<{ id: AiDest; href: string; icon: IconName }> = [
  { id: 'chats', href: links.tab, icon: 'sparkle' },
  { id: 'agents', href: links.agents, icon: 'hoody-ai-agent' },
  // Automations opens on its first list (there is no /ai/auto screen).
  { id: 'auto', href: links.workflows, icon: 'hoody-cron' },
  { id: 'knowledge', href: links.skills, icon: 'database' },
  // Settings opens on Models & keys; its index names the other two pages (the gear keeps the same three links).
  { id: 'settings', href: links.list, icon: 'settings' },
];

/** The screens of the switcher's groups, in the order their index lists them (the switcher opens the first). */
export const GROUPS = {
  knowledge: [
    { id: 'skills', href: links.skills, icon: 'hoody-kit' },
    { id: 'instructions', href: links.instructions, icon: 'hoody-notes' },
    { id: 'memory', href: links.memory, icon: 'database' },
  ],
  auto: [
    { id: 'workflows', href: links.workflows, icon: 'scripts' },
    { id: 'loops', href: links.loops, icon: 'reload' },
    { id: 'todos', href: links.todos, icon: 'check-circle' },
  ],
  settings: [
    { id: 'models', href: links.list, icon: 'hoody-ai' },
    { id: 'connections', href: links.connections, icon: 'link' },
    { id: 'rules', href: links.rules, icon: 'lock' },
  ],
} as const satisfies Record<'knowledge' | 'auto' | 'settings', ReadonlyArray<{ id: string; href: string; icon: IconName }>>;
export type Group = keyof typeof GROUPS;
type ScreenOf<G extends Group> = (typeof GROUPS)[G][number]['id'];

export function screenOf<G extends Group>(group: G, path: string): ScreenOf<G> | null {
  const list: ReadonlyArray<{ id: ScreenOf<G>; href: string }> = GROUPS[group];
  return list.find((k) => path === k.href || path.startsWith(`${k.href}/`))?.id ?? null;
}

/** The Knowledge screen a path shows (Skills keeps its deeper paths), or null off Knowledge. */
export function knowledgeOf(path: string): ScreenOf<'knowledge'> | null {
  return screenOf('knowledge', path);
}

/** The Automations screen a path shows (a deeper path keeps its screen), or null off Automations. */
export function autoOf(path: string): ScreenOf<'auto'> | null {
  return screenOf('auto', path);
}

export const RE24 = /^[0-9a-f]{24}$/;

export function useRealmName(): (id: string) => string {
  const t = useStrings(strings);
  return (id: string) => {
    const n = realmLabel(id);
    return n.kind === 'alias' || n.kind === 'short' ? n.text : n.kind === 'all' ? t('foot.allRealms') : t('foot.global');
  };
}

/** The "computer · realm" line of the foot and the chat header. A computer the shell does not list has no name: the line
 *  then shows the realm alone, never a leading " · ". */
export function whereLine(t: (k: 'foot.where', v: { computer: string; realm: string }) => string, computer: string, realm: string): string {
  return computer ? t('foot.where', { computer, realm }) : realm;
}

/** The chat list's reads and where they go, read once for the pane and the main region. */
export interface AiChats {
  at: ChatsAt;
  chats: ChatsRead;
  computerName: string;
  /** The computer's handle (name.last4): the computer part of every chat link. */
  handle: string;
}

export const ChatsContext = createContext<AiChats | null>(null);
/** The AI layout's chat reads; null outside it (or without a computer). */
export function useAiChats(): AiChats | null {
  return useContext(ChatsContext);
}
