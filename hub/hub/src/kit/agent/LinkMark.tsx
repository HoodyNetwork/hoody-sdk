// LinkMark: one marked link in a reply. A kind icon (aria-hidden), one real button
// named "Open atlas · port 3000" (its tooltip says the same, on hover and focus), and ⋯ with Copy and, where the host allows, Put on
// Board (a tray on phones, the ActionMenu's own). A bare address is replaced by the label; a labelled link keeps the agent's words
// and gains the icon button after them. A script opens its Hub page, never its address ("Run it in a new tab" is in ⋯); a kit
// host opens its Hub page; a Hub link opens by the router; an https port is Copy only. "Another computer" opens in a new tab,
// never on a Board. A local address reads as the port on the computer the chat runs on, its tooltip naming what was
// written; Open shows LocalPort's card, which checks that computer's listeners before it offers the address.
import type { ReactElement, ReactNode } from 'react';
import { IconButton, cx } from '../controls/Button';
import { TextButton } from '../controls/Link';
import { Icon, type IconName } from '../icons';
import { ActionMenu, Tooltip, type MenuAction } from '../overlays/Overlays';
import { Popover } from '../overlays/Popover';
import { useStrings } from '../strings';
import { useLinkHost, type LocalOpen, type Mark } from './linkHost';
import { LocalPort } from './LocalPort';
import { markLabel } from './markLabel';
import strings from './LinkMark.strings.en.json';
import s from './Conversation.module.css';

const ICONS: Record<Mark['kind'], IconName> = { program: 'computer', place: 'files', port: 'globe', local: 'globe', script: 'scripts', kit: 'programs', hub: 'home', other: 'external' };

const openTab = (href: string) => {
  window.open(href, '_blank', 'noopener,noreferrer');
};

/** One mark. `children`: the agent's own words for a labelled link (kept, the mark follows them); none for a bare address. */
export function LinkMark({ mark, children }: { mark: Mark; children?: ReactNode }) {
  const t = useStrings(strings);
  const host = useLinkHost();
  const label = markLabel(mark, t);
  const opens = mark.open;
  const local: LocalOpen | null = opens?.k === 'local' ? opens : null;
  const open = !opens || opens.k === 'local' ? undefined : opens.k === 'tab' ? () => openTab(opens.href) : () => host?.openHub(opens.path);
  const openName = mark.kind === 'script' ? t('mark.openScript', { label }) : local ? t('mark.openLocal', { label, written: mark.written ?? '' }) : t('mark.open', { label });
  // A local address's Open is a card (LocalPort), its trigger the same button a mark's Open is.
  const checked = (trigger: ReactElement) =>
    local ? (
      <Popover trigger={trigger} label={openName} title={label} width="md">
        {(close) => <LocalPort open={local} name={mark.name} label={label} close={close} />}
      </Popover>
    ) : (
      trigger
    );
  const items: MenuAction[] = [{ id: 'copy', label: t('mark.copy'), icon: 'external', copy: mark.copy, onAction: () => undefined }];
  if (mark.runTab) {
    const run = mark.runTab;
    items.push({ id: 'run', label: t('mark.runTab'), icon: 'external', onAction: () => openTab(run) });
  }
  const board = mark.board && host?.boardAdd ? host.boardAdd({ ...mark.board, label }) : '';
  if (board) items.push({ id: 'board', label: t('mark.board'), icon: 'board', onAction: () => host?.openHub(board) });
  if (mark.retry && host?.computers?.retry) items.push({ id: 'retry', label: t('mark.retry'), onAction: host.computers.retry });
  const more = <ActionMenu items={items} label={t('mark.more', { label })} size="sm" />;
  if (children !== undefined) {
    return (
      <span className={s.markLabelled}>
        {children}
        <span className={s.markTail}>
          {(open || local) && checked(<IconButton icon={ICONS[mark.kind]} label={openName} size="sm" variant="ghost" {...(open ? { onPress: open } : {})} />)}
          {more}
        </span>
      </span>
    );
  }
  return (
    <span className={cx(s.mark, mark.kind === 'other' && s.markOther)} translate="no">
      <Icon name={ICONS[mark.kind]} size="sm" className={s.markIcon} />
      {open || local ? (
        checked(
          <Tooltip content={openName}>
            <TextButton {...(open ? { onPress: open } : {})} aria-label={openName} literal className={s.markOpen}>
              {label}
            </TextButton>
          </Tooltip>,
        )
      ) : (
        <span>{label}</span>
      )}
      <span className={s.markTail}>{more}</span>
    </span>
  );
}
