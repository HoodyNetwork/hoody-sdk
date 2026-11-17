// An empty slot: "＋ Add a program" opens the picker anchored to it (a sheet on phones),
// up to 3 recent picks as one-click buttons, and Close; the Board's only slot has no header (no Close, no drag) and no
// active outline.
// The Board's only slot, empty (a first visit, a new Board, a Board whose last tile closed): the welcome is one sentence
// in the kit's empty card, Add is its primary action, Open a terminal (a new terminal on the current computer) is the one
// quick action under it, then the recent picks. Beside the card two faint slots show what else goes on a Board (a picture
// only, hidden from assistive technology; a narrow Board shows none). With no current computer in the Board's list there
// is no Open a terminal; with one that is not running it stays, off, and says why.
// The add flow: while the picker is open for this slot, the picker is the slot's content:
// its own Add and recent picks hide (kept in place, so Add gets focus back when the picker closes), and the picker is
// placed against the slot's body, not the button: centred under its top edge (inside the slot when it fits, else
// flipping to the larger side; the screen edge pushes it in). Add names its key (N) in its tooltip only, as the bar's
// Add does (no key cap in the label), and only on the slot N opens (the Board's first empty slot, addKey).
import { Button, EmptyState, IconButton, Popover, Stack, Tag, Tooltip, cx, pressClasses } from '@kit';
import { type CSSProperties, type PointerEvent as ReactPointerEvent, useRef } from 'react';
import type { Tile, TileRef } from '../model/boards';
import { useT } from './text';
import s from './board.module.css';
import { Picker, type PickerProps } from './Picker';

/** The welcome's quick action: open a new terminal on the current computer, or why it cannot (the computer is not running). */
export type QuickTerminal = { readonly open: () => void } | { readonly off: string };

export interface EmptySlotProps {
  domId: string;
  style?: CSSProperties;
  active: boolean;
  hidden: boolean;
  /** The Board's only slot: no Close, and the welcome card with a primary Add. */
  only: boolean;
  keys: boolean;
  /** The slot Add and N open the picker on (the Board's first empty slot): its Add names N, in its tooltip and
   *  aria-keyshortcuts. */
  addKey?: boolean;
  pickerOpen: boolean;
  onPickerOpen: (open: boolean) => void;
  picker: Omit<PickerProps, 'onPick'>;
  recents: ReadonlyArray<{ tile: TileRef; label: string }>;
  onPick: (t: Tile) => void;
  onClose: () => void;
  onActivate: () => void;
  /** Drag feedback: 'hold' while a touch press waits for its hold (a bar fills the header), 'press' while a
   *  draggable header is held or dragged (grabbing cursor, selected header, accent outline). */
  pressed?: 'hold' | 'press';
  onHeadPointerDown?: (e: ReactPointerEvent) => void;
  /** The welcome's Open a terminal (the Board's only slot); absent with no current computer. */
  terminal?: QuickTerminal | null;
}

export function EmptySlot(p: EmptySlotProps) {
  const t = useT();
  const body = useRef<HTMLSpanElement>(null);
  const key = p.keys && !!p.addKey;
  // One tree whether or not the slot names N (a slot's activation on pointer down must not remount the pressed Add):
  // only the tooltip's shortcut and aria-keyshortcuts change.
  const button = (
    <Tooltip content={t('empty.add')} {...(key ? { shortcut: 'N' } : {})}>
      <Button variant={p.only ? 'primary' : 'secondary'} icon="plus" {...(key ? { 'aria-keyshortcuts': 'N' } : {})}>
        {t('empty.add')}
      </Button>
    </Tooltip>
  );
  const add = (
    <Popover
      label={t('picker.title')}
      title={t('picker.title')}
      width="browse"
      phone="sheet"
      isOpen={p.pickerOpen}
      onOpenChange={p.onPickerOpen}
      anchor={body}
      placement="bottom"
      trigger={button}
    >
      {(close) => (
        <Picker
          {...p.picker}
          roomy
          onPick={(x) => {
            close();
            p.onPick(x);
          }}
        />
      )}
    </Popover>
  );
  // The welcome's one quick action, under Add: a secondary button, off with its reason while the computer is not running.
  const quick = p.only && p.terminal && (
    <Button variant="secondary" icon="terminal" {...('off' in p.terminal ? { isDisabled: true, disabledReason: p.terminal.off } : { onPress: p.terminal.open })}>
      {t('empty.terminal')}
    </Button>
  );
  const recents = p.recents.length > 0 && (
    <div className={s.recents} aria-label={t('empty.recent')} role="group">
      {p.recents.slice(0, 3).map((r) => (
        <Button key={r.label} size="sm" variant="ghost" onPress={() => p.onPick(r.tile)}>
          {r.label}
        </Button>
      ))}
    </div>
  );
  return (
    <div
      id={p.domId}
      role="group"
      aria-label={t('empty.chip')}
      className={cx(s.tile, s.empty, p.only && s.welcomeSlot, p.active && !p.only && s.active, p.hidden && s.hidden, pressClasses(p.pressed).card)}
      style={p.style}
      {...(p.hidden ? { inert: true, 'aria-hidden': true } : {})}
      {...(p.pressed === 'hold' ? { 'data-pressed': 'hold' } : p.pressed === 'press' ? { 'data-pressed': 'press' } : {})}
      onPointerDownCapture={p.onActivate}
    >
      {/* The header is the drag handle only; Close is its one button. The Board's only slot has neither (nothing to drag
          or close), so an empty Board shows its welcome alone, without a blank tile strip or the active outline. */}
      {!p.only && (
        <div className={cx(s.head, s.emptyHead, pressClasses(p.pressed).head)} style={pressClasses(p.pressed).headStyle} onPointerDown={p.onHeadPointerDown}>
          <IconButton icon="x" label={t('tile.closeEmptyTip')} shortcut={p.keys && p.active ? 'X' : undefined} size="sm" onPress={p.onClose} excludeFromTabOrder={!p.active} />
        </div>
      )}
      <div className={cx(s.emptyBody, p.only && s.welcomeBody)} data-picking={p.pickerOpen || undefined}>
        {/* Where the picker is placed: the body's top edge, the body's full width. */}
        <span ref={body} className={s.emptyAnchor} aria-hidden="true" />
        {p.only ? (
          <div className={s.welcome}>
            {/* Three slots, as on a Board: the welcome (the kit's empty card) in the big one, the faint ones beside it. */}
            <div className={cx(s.tile, s.empty, s.faintSlot)}>
              <div className={s.emptyBody}>
                <EmptyState
                  place="center"
                  icon="hoody-canvas"
                  title={t('empty.first')}
                  action={
                    <Stack gap={3} align="center">
                      {add}
                      {quick}
                      {recents}
                    </Stack>
                  }
                />
              </div>
            </div>
            {/* The faint slots: drawn as the Board's own empty slots, one label each. */}
            <div className={s.faint} aria-hidden="true">
              <div className={cx(s.tile, s.empty, s.faintSlot)}>
                <div className={s.emptyBody}>
                  <Tag>{t('empty.slotApp')}</Tag>
                </div>
              </div>
              <div className={cx(s.tile, s.empty, s.faintSlot)}>
                <div className={s.emptyBody}>
                  <Tag>{t('empty.slotAgent')}</Tag>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {add}
            {recents}
          </>
        )}
      </div>
    </div>
  );
}
