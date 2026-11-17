// "Put on Board" beside a page's open-in-a-new-tab: the Board's own Add link for that program or web
// port of that computer (links.ts boardAddPath; the Board adds the tile to its active Board once), the same path Apps'
// Put on Board takes. Shown only where it can work: this Hub serves the Board itself (a classic Board link cannot add a
// tile), the Board has a tile for the program and session (or the port is one it keeps), and for a terminal or display
// the Board can address its host (tileHostFits). Otherwise nothing, so the page's own open stays the only offer.
// session 'new' (terminal only) is a new terminal: the Board gives it the next free number when it takes the link
// (addNew.ts); its host is measured at the highest number it can get (BOARD_IDS[1]), so a tile is offered only when every
// number the Board may pick is addressable.
// `open` (files or notes only) puts a tile on one folder, file or note instead of the program's start view
// (for Files' and Notes' rows); a place the tile cannot open (links.ts openFits) shows nothing.
import { BOARD_IDS, type Target } from '@core';
import { Button, IconButton, useGo, usePageLink, useStrings } from '@kit';
import type { ComponentProps } from 'react';
import { isTileProgram, type TileProgram } from './embed/catalog';
import { boardAddPath, tileHostFits, type BoardOpen } from './links';
import strings from './boardAdd.strings.en.json';

/** The computer as the pages hold it: its id, project id and server name (unknown: ''). */
export interface BoardAddComputer {
  readonly id: string;
  readonly project: string;
  readonly server?: string | undefined;
}

export interface BoardAddButtonProps {
  /** The computer as the pages hold it, or core's Target. */
  readonly computer: BoardAddComputer | Target | null | undefined;
  /** A Board tile program; the Computers pages' "screen" is the Board's display. Anything else shows nothing. */
  readonly program?: string;
  /** The session (default 1), or 'new' for a new terminal (program terminal only; anything else shows nothing). */
  readonly session?: number | 'new';
  /** A web port instead of a program: the Board's port tile at `/`. */
  readonly port?: number;
  /** A files tile on one folder or file, or a notes tile on one page (session 1). */
  readonly open?: BoardOpen;
  /** What it puts, for the icon form's name ("Put Agent on Board"). */
  readonly what: string;
  /** The text form ("Put on Board") instead of the icon form. */
  readonly labelled?: boolean;
  /** The text form naming what it puts ("Put Code on Board"), where several sit side by side (Guide's More programs). */
  readonly named?: boolean;
  readonly isDisabled?: boolean;
  readonly size?: ComponentProps<typeof IconButton>['size'];
}

const programOf = (p: string): TileProgram | null => {
  const q = p === 'screen' ? 'display' : p;
  return isTileProgram(q) ? q : null;
};

/** Whether this Hub serves the Board itself. A classic Board link offers no Put on Board: the classic Board view takes
 *  no add, so following it would open the Board without the tile (Apps' Put on Board, the same rule). */
const servesBoard = (link: ReturnType<typeof usePageLink>): boolean => link?.kind === 'hub';

const targetOf = (c: BoardAddComputer | Target): Target =>
  'container' in c ? c : { project: { id: c.project }, container: { id: c.id, server_name: c.server ?? '' } };

/** The Board's Add link for this place, or '' when the Board would not show it (or the link is not one it keeps). */
function addLink(computer: BoardAddComputer | Target, program: string | undefined, session: number | 'new', port: number | undefined, open?: BoardOpen): string {
  const target = targetOf(computer);
  if (port !== undefined) return program === undefined && session !== 'new' && !open ? boardAddPath(target, { kind: 'port', port, path: '/' }) : '';
  const kind = program === undefined ? null : programOf(program);
  if (!kind) return '';
  const host = { id: target.container.id, project_id: target.project.id, server_name: target.container.server_name ?? '' };
  if (session === 'new') {
    if (kind !== 'terminal' || open || !tileHostFits('terminal', BOARD_IDS[1], host)) return '';
    return boardAddPath(target, { kind: 'terminal', session: 'new' });
  }
  if ((kind === 'terminal' || kind === 'display') && !tileHostFits(kind, session, host)) return '';
  return boardAddPath(target, { kind, session, ...(open ? { open } : {}) });
}

export function BoardAddButton({ computer, program, session = 1, port, open, what, labelled = false, named = false, isDisabled = false, size = 'sm' }: BoardAddButtonProps) {
  const t = useStrings(strings);
  const go = useGo();
  const boardLink = usePageLink('board');
  if (!servesBoard(boardLink) || !computer) return null;
  const to = addLink(computer, program, session, port, open);
  if (!to) return null;
  return labelled || named ? (
    <Button size={size} variant="secondary" icon="board" isDisabled={isDisabled} onPress={() => go(to)}>
      {named ? t('put.what', { what }) : t('put')}
    </Button>
  ) : (
    <IconButton icon="board" variant="ghost" size={size} label={t('put.what', { what })} isDisabled={isDisabled} onPress={() => go(to)} />
  );
}

/** Where a menu or row actions offer it: the same Add link as one entry ([] when the button would show nothing), so a
 *  row's "Open in a new tab" entry gets "Put on Board" beside it: `...boardAdd(c, { program: 'notes' })`, or one note:
 *  `...boardAdd(c, { program: 'notes', open: { view: 'node', userId, nodeId } })`. */
export function useBoardAddEntry() {
  const t = useStrings(strings);
  const go = useGo();
  const boardLink = usePageLink('board');
  return (computer: BoardAddComputer | Target | null | undefined, at: { readonly program?: string; readonly session?: number | 'new'; readonly port?: number; readonly open?: BoardOpen }) => {
    if (!servesBoard(boardLink) || !computer) return [];
    const to = addLink(computer, at.program, at.session ?? 1, at.port, at.open);
    return to ? [{ id: 'board', label: t('put'), icon: 'board' as const, onAction: () => go(to) }] : [];
  };
}
