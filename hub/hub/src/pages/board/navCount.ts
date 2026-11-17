// The Board's count for the left menu: how many programs the selected realm's Boards hold. The shell loads
// this file through the Board manifest's navCount (it never imports the page) and shows `total` only, hidden at 0.
//
// Contract, in plain words:
//   - useBoardCounts() → {total, boards} for the selected realm ('all' included), from the stored Boards as core shows
//     them (data.ts useStoredBoards: no write of its own, no merge, no network): boards is each Board's id, its stored name
//     ('' for a Board never named) and its tiles (filled slots); total is their sum. It follows edits in this tab and
//     another, and every realm or account switch.
//   - null while unknown, never 0: nobody signed in yet, the saved Boards still opening, or a stored value that cannot be
//     used here (useStoredBoards), and while a realm switch or a sign-out is under way (core's switching, loggingOut).
//     Nothing stored yet is a known 0: the one empty Board a fresh realm shows.
//     items (kit/page NavCount.items, the shell's Jump to): each NAMED Board as {id, label: its name, to: the Board's own
//     link, links.boardById}; a Board never named has nothing to type and is left out.
//   - boardCounts(state) → the same numbers for a state.
import { useCore } from '@core';
import { useMemo } from 'react';
import { useStoredBoards } from './data';
import { filledCount, type RealmBoards } from './model/boards';

/** The shape the shell's navCount takes (kit/page NavCount): structurally the same. */
export interface NavCount {
  readonly total: number;
  readonly boards?: readonly { readonly id: string; readonly name: string; readonly tiles: number }[];
  readonly items?: readonly { readonly id: string; readonly label: string; readonly to: string }[];
}

// links.boardById's address, written here so the shell's small count reader does not load the Board's link builders
// (navCount.test.tsx holds the two equal).
const boardTo = (id: string): string => `/board?b=${encodeURIComponent(id)}`;

export function boardCounts(state: RealmBoards): NavCount {
  const boards = state.boards.map((b) => ({ id: b.id, name: b.name, tiles: filledCount(b) }));
  const items = boards.filter((b) => b.name !== '').map((b) => ({ id: b.id, label: b.name, to: boardTo(b.id) }));
  return { total: boards.reduce((n, b) => n + b.tiles, 0), boards, items };
}

export default function useBoardCounts(): NavCount | null {
  const state = useStoredBoards();
  const { switching, loggingOut } = useCore();
  const known = state && switching === null && !loggingOut ? state : null;
  return useMemo(() => (known ? boardCounts(known) : null), [known]);
}
