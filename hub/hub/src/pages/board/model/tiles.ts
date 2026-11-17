// What each slot of the active Board shows over its lifecycle. Pure.
//
// Contract, in plain words:
//   - slotState(tile, computers) is 'empty' (no tile), 'loading' (the computer list has not answered), 'live' (the
//     computer is running: the tile gets a frame), 'starting', 'stopped', 'attention' (failed or unknown status), or
//     'gone' (not in the selected realm's list, or listed under another project or none). Only 'live' makes a frame; the
//     rest show a placeholder card (Start / Remove), never a broken frame.
//   - Only the active Board is ever asked: switching Boards drops the old frames (frameSlots of the new Board).
//   - The computer list is the selected realm's (core filters it), so a tile of another realm reads 'gone'.
//   - A web tile (a typed address, on no computer) is always 'live': its frame is the address itself.
import { computerState, type ComputerRow } from '@core';
import { tileComputer, type Board, type Tile } from './boards';
import { slots } from './tree';

export type SlotState = 'empty' | 'loading' | 'live' | 'starting' | 'stopped' | 'attention' | 'gone';

export function slotState(tile: Tile | null | undefined, computers: readonly ComputerRow[] | null): SlotState {
  if (!tile) return 'empty';
  const on = tileComputer(tile);
  if (!on) return 'live';
  if (computers === null) return 'loading';
  const row = computers.find((c) => c.id === on.computer);
  if (!row || row.project_id !== on.project) return 'gone';
  const s = computerState(row.status);
  return s === 'running' ? 'live' : s;
}

/** Every slot's state, in reading order. */
export function boardStates(b: Board, computers: readonly ComputerRow[] | null): Record<string, SlotState> {
  const out: Record<string, SlotState> = {};
  for (const s of slots(b.layout)) out[s] = slotState(b.tiles[s], computers);
  return out;
}

/** The slots that get a frame: live tiles only. With a maximised slot the others keep their frames, hidden. */
export function frameSlots(b: Board, computers: readonly ComputerRow[] | null): string[] {
  const st = boardStates(b, computers);
  return slots(b.layout).filter((s) => st[s] === 'live');
}
