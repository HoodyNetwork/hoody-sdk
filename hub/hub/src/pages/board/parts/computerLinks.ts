// The tile menu's links to the tile's computer elsewhere in the Hub (the board grid's and the program view's menus):
// Open in Programs, Open computer, Logs and Open in Tunnels (that computer's), each only when its page resolves in this Hub.
// Programs and Tunnels act on the shell's computer, so inside the Hub the tile's computer becomes it first (as Computers'
// "make current" does). Also the link from another page's held change to the page that sent it (useHeldFromLinks).
import { chooseComputer } from '@core';
import { followPageLink, useGo, usePageLink, useServedPageLink, type MenuEntry, type PageLink } from '@kit';
import { links as logsLinks } from '../../logs/links';
import { computersAt, handleOf, type BoardComputer } from '../computers';
import type { Power } from './lifecycle';
import type { T } from './text';
import type { HeldFromLink } from './Tile';

/** A hold Computers sent sits on this computer while this load does not serve Computers: no link to Computers at all
 *  (C9: a hidden sender page gets no link, not even the classic one). `computersServed` is useServedPageLink('computers'):
 *  null exactly when this load does not serve Computers. Own holds, other senders' and none keep the link. */
export function hiddenSenderHold(pw: Power | null | undefined, computersServed: PageLink | null): boolean {
  return pw?.heldFrom?.page === 'computers' && !computersServed;
}

export function useComputerLinks(t: T): (c: BoardComputer | null, pw?: Power | null) => MenuEntry[] {
  const computersLink = usePageLink('computers');
  const computersServed = useServedPageLink('computers');
  const programsLink = usePageLink('programs');
  const logsLink = usePageLink('logs');
  const tunnelsLink = usePageLink('tunnels');
  const go = useGo();
  return (c, pw) => {
    if (!c) return [];
    const out: MenuEntry[] = [];
    if (programsLink) {
      out.push({ id: 'open-programs', label: t('tile.openPrograms'), onAction: () => {
        if (programsLink.kind === 'hub') chooseComputer(c);
        followPageLink(programsLink, go);
      } });
    }
    if (computersLink && !hiddenSenderHold(pw, computersServed)) out.push({ id: 'open-computer', label: t('tile.openComputer'), onAction: () => followPageLink(computersAt(computersLink, c), go) });
    if (logsLink) {
      out.push({ id: 'open-logs', label: t('tile.openLogs'), onAction: () => {
        if (logsLink.kind === 'hub') go(logsLinks.computer(handleOf(c)));
        else followPageLink(logsLink, go);
      } });
    }
    if (tunnelsLink) {
      out.push({ id: 'open-tunnels', label: t('tile.openTunnels'), onAction: () => {
        if (tunnelsLink.kind === 'hub') chooseComputer(c);
        followPageLink(tunnelsLink, go);
      } });
    }
    return out;
  };
}

/** The sending pages a held lifecycle change can name (core's HeldChange.from.page), with their names here. */
const SENDERS: Readonly<Record<string, string>> = { computers: 'tile.senderComputers', bots: 'tile.senderBots', home: 'tile.senderHome' };

/** The link from another page's held change to the page that sent it (Power.heldFrom): only a page this load serves,
 *  through its Hub link (useServedPageLink: no classic fallback, the classic Hub cannot show the hold). Computers
 *  opens on the tile's computer. A hidden, unknown or unnamed sender gets none: the card names no page. */
export function useHeldFromLinks(t: T): (pw: Power | null, c: BoardComputer | null) => HeldFromLink | null {
  const computers = useServedPageLink('computers');
  const bots = useServedPageLink('bots');
  const home = useServedPageLink('home');
  const go = useGo();
  return (pw, c) => {
    const page = pw?.heldFrom?.page;
    if (!page || !Object.hasOwn(SENDERS, page)) return null;
    const link = page === 'computers' ? computers && computersAt(computers, c) : page === 'bots' ? bots : home;
    // Served links only (useServedPageLink: a Hub link or none), so no link means a hidden or unserved sender.
    if (!link) return null;
    return { name: t(SENDERS[page] as string), go: () => go(link.href) };
  };
}
