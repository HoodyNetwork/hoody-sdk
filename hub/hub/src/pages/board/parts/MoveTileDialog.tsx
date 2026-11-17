// Move a tile to another Board: the tile menu's "Move to Board…" and the B key.
//
// Contract, in plain words:
//   - What moves was captured when the dialog opened (the tile by its id, the Board it was on, its name): the dialog
//     never reads the tile again, so a move confirmed after the tile was closed, replaced or moved elsewhere is refused
//     by the model (moveTileToBoard NOT_FOUND) and the view says so; nothing else moves in its place.
//   - It lists the other Boards in strip order and "New Board" last. A Board with no room (MAX_SLOTS filled) and a new
//     Board past MAX_BOARDS are shown disabled with the reason, so a choice the model would refuse is not offered; the
//     model still checks both on the Boards as stored when the move commits.
//   - Move is the one action; nothing is chosen at first, so Enter never moves to a Board the person did not pick.
import { Dialog, RadioGroup } from '@kit';
import { useState } from 'react';
import { boardSlots, MAX_BOARDS, MAX_SLOTS, type Board, type MoveTarget } from '../model/boards';
import type { T } from './text';

/** The tile a move is for, as captured when the dialog opened. */
export interface MoveCapture { readonly tid: string; readonly fromBoardId: string; readonly name: string }

const NEW = '\u0000new'; // never a Board id (ids are 'b' and letters or digits)

/** No room for one more tile: every slot filled at MAX_SLOTS (an empty slot takes the tile). */
export const boardHasNoRoom = (b: Board): boolean => boardSlots(b).length >= MAX_SLOTS && boardSlots(b).every((s) => !!b.tiles[s]);

export function MoveTileDialog(p: {
  readonly capture: MoveCapture | null;
  readonly boards: readonly Board[];
  readonly labelOf: (b: Board) => string;
  readonly t: T;
  readonly onClose: () => void;
  readonly onMove: (c: MoveCapture, target: MoveTarget) => void;
}) {
  const { capture, t } = p;
  const [pick, setPick] = useState<string | undefined>(undefined);
  const others = capture ? p.boards.filter((b) => b.id !== capture.fromBoardId) : [];
  const noNew = p.boards.length >= MAX_BOARDS;
  const options = [
    ...others.map((b) => {
      const full = boardHasNoRoom(b);
      return { value: b.id, label: p.labelOf(b), isDisabled: full, ...(full ? { description: t('move.boardFull') } : {}) };
    }),
    { value: NEW, label: t('move.newBoard'), isDisabled: noNew, description: noNew ? t('move.boardsFull', { n: MAX_BOARDS }) : t('move.newBoardHint', { name: capture?.name ?? '' }) },
  ];
  const chosen = pick !== undefined && options.some((o) => o.value === pick && !o.isDisabled) ? pick : undefined;
  const close = () => { setPick(undefined); p.onClose(); };
  return (
    <Dialog
      overlayId="board-move-tile"
      isOpen={!!capture}
      onOpenChange={(o) => { if (!o) close(); }}
      size="sm"
      title={t('move.title', { name: capture?.name ?? '' })}
      primaryLabel={t('move.confirm')}
      primaryDisabled={chosen === undefined}
      onPrimary={() => {
        if (!capture || chosen === undefined) return;
        p.onMove(capture, chosen === NEW ? { kind: 'new', name: capture.name } : { kind: 'board', toBoardId: chosen });
        close();
      }}
    >
      {capture && <RadioGroup label={t('move.to')} options={options} value={chosen} onChange={setPick} />}
    </Dialog>
  );
}
