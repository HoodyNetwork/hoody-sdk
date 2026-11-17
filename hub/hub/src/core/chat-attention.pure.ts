// The pure part of chat-attention.ts (split out so the terminal build shares it; the contract is at the top of
// chat-attention.ts): the attention gates, the notes of chats left running and their store, one instance each.
// chat-attention.ts re-exports the public names and keeps the observer (useChatAttention, document visibility).
// MAX_BACKOFF, listSource, emit and setFound are for chat-attention.ts.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { chatListReads, type ChatGate } from './chat-lists';
import { snapshot } from './ctx';
import { partitioned, type Partitioned } from './kit-io';
import { useCore } from './query';
import { onTeardown } from './realm';
import { coreSource } from './source';

export const SLOW_MS = 30_000;
export const NOTES_MAX = 20;
export const NOTE_TTL_MS = 24 * 60 * 60_000;
export const MAX_BACKOFF = 16;
const STORE_KEY = 'hub_ai_attn_v1';

export const listSource = coreSource('ai', { reads: chatListReads });

// ---- one change signal for the gates and the notes ----
const listeners = new Set<() => void>();
let rev = 0;
export function emit(): void {
  rev++;
  for (const l of [...listeners]) l();
}
export function onChatAttention(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l); }; }
export const chatAttentionRev = (): number => rev;
/** Re-renders when the observer's gates or the notes change. */
export function useChatAttentionRev(): number { return useSyncExternalStore(onChatAttention, chatAttentionRev, chatAttentionRev); }

// ---- the gates the observer found ----
export interface AttentionGates {
  readonly account: string;
  /** The computer (container id) the gates are on. */
  readonly computer: string;
  readonly gates: readonly ChatGate[];
}
let found: AttentionGates | null = null;
const gatesKey = (g: AttentionGates | null): string => (g ? JSON.stringify([g.account, g.computer, g.gates.map((x) => [x.realm, x.sid])]) : '');
export function setFound(next: AttentionGates | null): void {
  if (gatesKey(next) === gatesKey(found)) return;
  found = next;
  emit();
}
/** The last gates read for the shown account and computer, counted ones only (see the contract); null while unknown. */
export function attentionGates(): AttentionGates | null { return found; }

/** The gates that count: served realms only (`shown` one realm: that realm only), never a Bot's own session. */
export function countedGates(gates: readonly ChatGate[], shown: string, served: readonly string[] | null): ChatGate[] {
  if (!served) return [];
  const ok = new Set(served);
  return gates.filter((g) => g.agent !== 'bot' && ok.has(g.realm) && (shown === 'all' || g.realm === shown));
}

// ---- notes: chats let go while their turn ran ----
export interface ChatNote {
  readonly computer: string;
  readonly realm: string;
  readonly sid: string;
  /** When the chat was let go. */
  readonly at: number;
  /** Its state in the last sessions read that held it (idle | running | parked | closed). */
  readonly last?: string;
}
const notes = new Map<string, ChatNote[]>();
const hydrated = new Set<string>();
const noteKey = (n: { computer: string; realm: string; sid: string }): string => `${n.computer}|${n.realm}|${n.sid}`;
const live = (n: ChatNote, now: number): boolean => now - n.at < NOTE_TTL_MS && n.at <= now + 60_000;

function store(): Partitioned | null {
  try { return partitioned(STORE_KEY, { scope: 'account', area: 'session', purge: true }); } catch { return null; }
}
const isNote = (v: unknown): v is ChatNote => {
  const r = v as Record<string, unknown> | null;
  return !!r && typeof r === 'object' && typeof r.computer === 'string' && typeof r.realm === 'string' && typeof r.sid === 'string' && typeof r.at === 'number' && Number.isFinite(r.at)
    && (r.last === undefined || typeof r.last === 'string');
};
// The stored notes of this account, once, when it is the shown account (the store is partitioned by it).
function hydrate(account: string, shown: string | null): void {
  if (hydrated.has(account) || account !== shown) return;
  hydrated.add(account);
  try {
    const raw = store()?.get();
    if (!Array.isArray(raw)) return;
    const have = notes.get(account) ?? [];
    const keys = new Set(have.map(noteKey));
    const now = Date.now();
    const back = raw.filter(isNote).filter((n) => live(n, now) && !keys.has(noteKey(n))).map((n) => ({ computer: n.computer, realm: n.realm, sid: n.sid, at: n.at, ...(n.last ? { last: n.last } : {}) }));
    if (back.length) notes.set(account, bound([...have, ...back], now));
  } catch { /* unreadable: memory only */ }
}
function bound(list: readonly ChatNote[], now: number): ChatNote[] {
  return list.filter((n) => live(n, now)).sort((a, b) => b.at - a.at).slice(0, NOTES_MAX);
}
function save(account: string, shown: string | null): void {
  if (account !== shown) return;
  try { store()?.set(notes.get(account) ?? []); } catch { /* storage refused: memory only */ }
}
// The shown account: the store is partitioned by it, so a note is mirrored to storage only for it.
function shownAccount(): string | null {
  try { const a = snapshot().account; return a === null ? null : String(a); } catch { return null; }
}

/** A chat the last holder let go while its turn ran. */
export function noteLeftRunning(account: string, n: { computer: string; realm: string; sid: string }): void {
  if (!account || !n.computer || !n.sid) return;
  const shown = shownAccount();
  hydrate(account, shown);
  const now = Date.now();
  const rest = (notes.get(account) ?? []).filter((x) => noteKey(x) !== noteKey(n));
  notes.set(account, bound([{ computer: n.computer, realm: n.realm, sid: n.sid, at: now, last: 'running' }, ...rest], now));
  save(account, shown);
  emit();
}
/** The chat was opened: its note goes. */
export function clearChatNote(account: string, n: { computer: string; realm: string; sid: string }): void {
  const shown = shownAccount();
  hydrate(account, shown);
  const list = notes.get(account);
  if (!list?.some((x) => noteKey(x) === noteKey(n))) return;
  notes.set(account, list.filter((x) => noteKey(x) !== noteKey(n)));
  save(account, shown);
  emit();
}
/** The account's live notes, newest first; one computer's only when named. */
export function chatNotes(account: string | null, computer?: string): readonly ChatNote[] {
  if (!account) return [];
  hydrate(account, shownAccount());
  const now = Date.now();
  return (notes.get(account) ?? []).filter((n) => live(n, now) && (computer === undefined || n.computer === computer));
}
/** A sessions read answered: each noted chat it holds takes the state the row carries. */
export function noteChatStates(account: string, computer: string, rows: ReadonlyArray<{ id: string; realm: string; state?: string }>): void {
  const list = notes.get(account);
  if (!list?.length) return;
  const by = new Map(rows.filter((r) => r.state !== undefined).map((r) => [`${computer}|${r.realm}|${r.id}`, r.state as string]));
  let changed = false;
  const next = list.map((n) => {
    const st = by.get(noteKey(n));
    if (st === undefined || st === n.last) return n;
    changed = true;
    return { ...n, last: st };
  });
  if (!changed) return;
  notes.set(account, next);
  save(account, shownAccount());
  emit();
}
/** The mark a noted chat shows for its state: 'ended' once idle, 'closed' once closed, else none. */
export function noteMark(state: string | undefined): 'ended' | 'closed' | null {
  return state === 'idle' ? 'ended' : state === 'closed' ? 'closed' : null;
}
/** Re-renders with the account's notes (one computer's when named). */
export function useChatNotes(computer?: string): readonly ChatNote[] {
  const r = useChatAttentionRev();
  const account = useCore().account;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- r is the store's version
  const list = useMemo(() => chatNotes(account, computer), [account, computer, r]);
  // Time alone ends a note: at the earliest expiry the store's version moves, so every reader drops it (its mark goes,
  // and the observer's sessions read stops once none is left).
  useEffect(() => {
    if (!list.length) return;
    const next = Math.min(...list.map((n) => n.at + NOTE_TTL_MS));
    const id = setTimeout(() => emit(), Math.max(0, next - Date.now()) + 1);
    return () => clearTimeout(id);
  }, [list]);
  return list;
}

// A sign-out forgets every note in memory (session storage is purged by the auth layer); an account change keeps each
// account's own (they are keyed by it).
try {
  onTeardown((reason) => {
    if (reason === 'signout' || reason === 'logout') { notes.clear(); hydrated.clear(); setFound(null); emit(); }
  });
} catch { /* no realm layer (a test) */ }

/** Tests: the gates the observer found, set directly. */
export function seedAttentionForTests(g: AttentionGates | null): void { setFound(g); }

/** Tests: forget the gates and every note. */
export function resetChatAttentionForTests(): void {
  found = null;
  notes.clear();
  hydrated.clear();
  emit();
}
