// ActionMenu: the row/overflow "⋯" menu, a popover from 600 px and a bottom tray below. Use Select instead for a form
// value, and PickerPanel for a searchable list. Rows on the --pop-row-* metrics, a lead column (an icon, a MenuThumb
// picture or the on/off box), the shortcut hint at the end in mono. Destructive items always end the
// menu after a divider, whatever order the page passes. Items that open a dialog or drawer (`opens`) end with "…". A
// disabled item can carry its reason, shown under its label; any item can carry a description there, which a disabled
// item's reason replaces. A disabled item stays in the arrow-key order (aria-disabled, its reason as its accessible
// description): choosing it does nothing and leaves the menu open. A copy item (`copy`) copies its text, says "Copied"
// on the item for COPIED_MS and then closes the menu, with no toast.
// Groups (`MenuGroup`) declare their kind: plain, one-of (`select: 'one'`, menuitemradio, a blue check on the
// page's `current`) or on/off (`select: 'many'`, menuitemcheckbox with the kit box). A legacy item with `checked` is an
// on/off choice in a run of its own. A reason is said once: reasons shared by two or more disabled items of a
// section, and a group's `note`, show as one note at the top of the section that describes exactly those items.
// A `footer` holds at most two actions in the menu's last section ("Menu actions"), after the danger area,
// sticky at the bottom of the scrolling menu (MenuFooter's look): arrows, typeahead and Enter reach it as any item.
// Any open menu closes when its context ends (a realm switch, sign-out); the phone tray is also counted by the overlay
// stack and gives focus to the page title when its trigger is gone, as Dialog and Drawer do.
import { type ReactElement, type RefObject, useEffect, useId, useRef, useState } from 'react';
import { Dialog as AriaDialog, Header, Heading, Menu, MenuItem, MenuSection, MenuTrigger, Modal, ModalOverlay, Popover as AriaPopover, Pressable, Separator, Text } from 'react-aria-components';
import { IconButton, cx } from '../controls/Button';
import { Kbd } from '../controls/Kbd';
import { copyText } from '../data/Ids';
import { CardScopeReset } from '../layouts/CardEdge';
import { Icon, type IconName } from '../icons';
import { useStrings } from '../strings';
import strings from './strings.en.json';
import s from './Menu.module.css';
import { type FooterActions, menuFooterClass } from './MenuFooter';
import { useCloseOnContextEnd, useCloseOnLeave, useFocusReturn, useIsPhone, useOverlayStack } from './shared';
// The model (items, sections, reasons, initial focus, footer) is shared with the terminal build: Menu.model.ts.
import { COPIED_MS, type MenuAction, type MenuList, type MenuSectionModel, type PlainAction, footerSection, menuInitialKey, menuLabel, menuSections } from './Menu.model';

export { COPIED_MS, footerSection, menuInitialKey, menuLabel, menuSections, runMenuAction } from './Menu.model';
export type { MenuAction, MenuEntry, MenuGroup, MenuList, MenuSectionModel } from './Menu.model';

/** A small layout picture for a menu row's lead place (22×16): `cells` are [x, y, w, h] in grid units. */
export function MenuThumb({ cells }: { cells: readonly (readonly [x: number, y: number, w: number, h: number])[] }) {
  const w = Math.max(1, ...cells.map(([x, , cw]) => x + cw));
  const h = Math.max(1, ...cells.map(([, y, , ch]) => y + ch));
  const gx = 22 / w;
  const gy = 16 / h;
  return (
    <svg className={s.thumb} viewBox="0 0 22 16" width="22" height="16" aria-hidden="true" focusable="false">
      {cells.map(([x, y, cw, ch], k) => (
        <rect key={k} x={x * gx + 0.5} y={y * gy + 0.5} width={Math.max(0, cw * gx - 1)} height={Math.max(0, ch * gy - 1)} rx="1" />
      ))}
    </svg>
  );
}

/** The class of a menu's footer section: MenuFooter's look, reaching across the menu's padding. ActionMenu's
 *  footer uses it; a host's own React Aria Menu gives it to its last MenuSection. */
export const menuFooterSectionClass = cx(s.section, s.footer, menuFooterClass);

/** The class of a host menu's search row: a wrapper around a kit SearchField, the first child of the menu's scroller
 *  (before the Menu, inside a React Aria Autocomplete). It stays at the top while the list scrolls. */
export const menuSearchClass = s.search;

export interface ActionMenuProps {
  items: MenuList;
  /** Accessible name and tooltip of the default "⋯" trigger. */
  label?: string;
  /** A custom trigger (a kit Button). Defaults to an IconButton with dots. `null` (with `anchor`): no trigger of the menu's
   *  own; it opens only through `isOpen`, from the page's gesture on the thing it is about (a tab's right-click). */
  trigger?: ReactElement | null;
  /** Position the popover against this element instead of the trigger (a tab whose menu it is). Unset: the trigger,
   *  as before. The phone tray does not use it. */
  anchor?: RefObject<Element | null>;
  icon?: IconName;
  /** The default trigger's size; 'toolbar' is a toolbar control (`--tb-ctl-h`, so a toolbar size scope sets it). */
  size?: 'sm' | 'md' | 'toolbar';
  placement?: 'bottom start' | 'bottom end' | 'top start' | 'top end';
  /** Controlled open state, for opening from a key (`.` / Shift F10 on a row). */
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Below 600 px the menu is a bottom tray; `'popover'` keeps it anchored, as Popover's `phone` does. */
  phone?: 'tray' | 'popover';
  /** The tray's title, the row's subject ("Row actions · atlas-01"); defaults to `label`, then "More actions". */
  title?: string;
  /** The default dots trigger without the three-dot look (the Board's menu). */
  plain?: boolean;
  /** At most two actions kept at the bottom of the menu, the primary first: the last section, after the
   *  danger area, sticky while the menu scrolls. Plain items: no danger tone, no on/off choice. */
  footer?: FooterActions<PlainAction & { tone?: 'default' }>;
}

/** How the person last acted: a menu opened with no focus strategy of React Aria's (a caller's key handler setting
 *  `isOpen`: Board '.', Tabs Shift+F10) is a keyboard open when the last input was a key. The listeners are
 *  installed once, when this module loads. */
let lastInput: 'keyboard' | 'pointer' = 'pointer';
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', () => { lastInput = 'keyboard'; }, true);
  document.addEventListener('pointerdown', () => { lastInput = 'pointer'; }, true);
}

/** The pointers held down right now, by id: a tray opened by a mouse press start arms. A release the document
 *  never sees (made in another window) is reconciled: the window losing focus, or the pointer moving with no button held,
 *  forgets it. */
const held = new Set<number>();
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => { held.add(e.pointerId); }, true);
  for (const e of ['pointerup', 'pointercancel'] as const) document.addEventListener(e, (ev) => { held.delete(ev.pointerId); }, true);
  document.addEventListener('pointermove', (e) => { if (e.buttons === 0) held.delete(e.pointerId); }, true);
  window.addEventListener('blur', () => { held.clear(); });
}

/** Tray events stay in the tray: React bubbles a portal's events to the trigger's owners, and a click, double click,
 *  right click or drag on the tray's title or scrim must not reach the row the trigger sits in. */
const keepIn = (e: { stopPropagation: () => void }) => e.stopPropagation();

export function ActionMenu({ items, label, trigger, anchor, icon = 'dots', size = 'md', placement = 'bottom end', isOpen, onOpenChange, phone = 'tray', title, plain, footer }: ActionMenuProps) {
  const t = useStrings(strings);
  const tray = useIsPhone() && phone === 'tray';
  const titleId = useId();
  const named = title ?? label ?? t('more');
  const menuId = useId();
  const sections = menuSections(items, menuId);
  const foot = footerSection(footer, sections, menuId);
  const actions = new Map([...sections, ...(foot ? [foot] : [])].flatMap((x) => x.items.map((i) => [i.action.id, i.action] as const)));
  // The lead column is menu-wide: kept on every row once any row has an icon, a picture or a box.
  const anyLead = [...actions.values()].some((a) => a.icon || a.picture || a.checked !== undefined) || sections.some((x) => x.select === 'many');
  const pictures = [...actions.values()].some((a) => a.picture);
  // A row with a line under its label (a reason or a description) is two lines tall, or more when the line wraps: the
  // tray's floor and reserves then keep the tallest such row whole (Menu.module.css .tray[data-two-line]).
  const twoLine = [...sections, ...(foot ? [foot] : [])].some((x) => x.items.some((i) => i.line !== undefined));
  const [ownOpen, setOwnOpen] = useState(false);
  const open = isOpen ?? ownOpen;
  const setOpen = (o: boolean) => {
    if (isOpen === undefined) setOwnOpen(o);
    onOpenChange?.(o);
  };
  // A navigation (Back included), its page hiding or a Dialog/Drawer opening closes the menu, tray or popover.
  useCloseOnLeave(open, () => setOpen(false));
  useCloseOnContextEnd(open, () => setOpen(false));
  useOverlayStack('tray', open && tray);
  useFocusReturn(open && tray);
  // A tray opened by a mouse press start (React Aria opens on press start for a mouse) must not take that
  // press's release as a choice: rows ignore pointers until the press ends. Touch and keyboard open with no press held.
  const [arming, setArming] = useState(false);
  useEffect(() => {
    if (!open || !tray || held.size === 0 || lastInput !== 'pointer') return;
    setArming(true);
    const end = () => setArming(false);
    // A move with no button held: the press ended where the document never saw it.
    const moved = (e: PointerEvent) => {
      if (e.buttons === 0) end();
    };
    document.addEventListener('pointerup', end, { once: true, capture: true });
    document.addEventListener('pointercancel', end, { once: true, capture: true });
    document.addEventListener('pointermove', moved, true);
    window.addEventListener('blur', end, { once: true });
    return () => {
      document.removeEventListener('pointerup', end, true);
      document.removeEventListener('pointercancel', end, true);
      document.removeEventListener('pointermove', moved, true);
      window.removeEventListener('blur', end);
      setArming(false);
    };
  }, [open, tray]);
  const [copied, setCopied] = useState<{ id: string; ok: boolean } | null>(null);
  // A copy's check (or warning) shows in the lead place, even on a menu with no other lead (a text-only menu).
  const lead = anyLead || copied !== null;
  const timer = useRef<number | undefined>(undefined);
  // Bumped at every close and at unmount: a copy's write that settles after the menu it was chosen in
  // has closed belongs to that menu, so it neither marks a reopened menu Copied nor arms the timer that would close it.
  const copyGen = useRef(0);
  const setOpenRef = useRef(setOpen);
  setOpenRef.current = setOpen;
  const menuRef = useRef<HTMLDivElement>(null);
  const focusKey = menuInitialKey(sections) ?? foot?.items[0]?.action.id;
  // A reason or description wraps to as many lines as it needs, so a row can
  // be taller than the two-line token row. While a two-line tray is open its tallest row as drawn is kept on the tray
  // (--tray-row-m), which its floor and its reserves (--tray-r1/--tray-r3, read by Toaster) take: nothing cuts that row.
  // The rows are taken from the menu's DOM whenever its children change (a row added, removed, or drawn again as a new
  // node by a regroup), and each is observed for its own size.
  useEffect(() => {
    if (!open || !tray || !twoLine || typeof ResizeObserver === 'undefined') return;
    let host: HTMLElement | null = null;
    let rows = new Set<HTMLElement>();
    let frame = 0;
    let tries = 0;
    let tree: MutationObserver | null = null;
    const keep = () => {
      if (!host) return;
      const tallest = Math.max(0, ...[...rows].map((r) => r.getBoundingClientRect().height));
      host.style.setProperty('--tray-row-m', `${Math.ceil(tallest * 100) / 100}px`);
    };
    const sizes = new ResizeObserver(keep);
    // The rows drawn now: new ones observed, gone ones no longer, then measured again.
    const sync = (menu: HTMLElement) => {
      const now = new Set(menu.querySelectorAll<HTMLElement>('[role^="menuitem"]'));
      for (const r of rows) if (!now.has(r)) sizes.unobserve(r);
      for (const r of now) if (!rows.has(r)) sizes.observe(r);
      rows = now;
      keep();
    };
    // The menu mounts with the tray, in the commit that opens it or the next frames: look until it is there.
    const find = () => {
      frame = 0;
      const menu = menuRef.current;
      host = menu?.closest<HTMLElement>('[data-hub-tray]') ?? null;
      if (!menu || !host) {
        if (tries++ < 10) frame = requestAnimationFrame(find);
        return;
      }
      tree = new MutationObserver(() => sync(menu));
      tree.observe(menu, { childList: true, subtree: true });
      sync(menu);
    };
    find();
    return () => {
      cancelAnimationFrame(frame);
      tree?.disconnect();
      sizes.disconnect();
      host?.style.removeProperty('--tray-row-m');
    };
  }, [open, tray, twoLine]);
  useEffect(
    () => () => {
      copyGen.current++;
      window.clearTimeout(timer.current);
    },
    [],
  );
  // A close (Esc, a click outside) ends the Copied moment too: its timer must not close a reopened menu.
  useEffect(() => {
    if (open) return;
    copyGen.current++;
    setCopied(null);
    window.clearTimeout(timer.current);
  }, [open]);
  // A keyboard open lands React Aria's focus on the first (or, from ArrowUp, the last) item; move it to the item
  // the rule names. A controlled open from a key (the caller sets isOpen; React Aria has no strategy then) leaves focus
  // on the menu itself or outside it: after a key, that moves to the rule's item too. A pointer open focuses the menu
  // itself and stays so; any other item already holds the person's own focus.
  useEffect(() => {
    if (!open || focusKey === undefined) return;
    const id = window.setTimeout(() => {
      const menu = menuRef.current;
      const at = document.activeElement;
      const rows = menu ? [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')] : [];
      if (!menu) return;
      const edge = at === rows[0] || at === rows[rows.length - 1];
      const fromKey = lastInput === 'keyboard' && (at === menu || !(at instanceof Node) || !menu.contains(at));
      if (!edge && !fromKey) return;
      const target = rows.find((r) => r.dataset.key === focusKey);
      if (target && target !== at) target.focus();
    }, 0);
    return () => window.clearTimeout(id);
    // Only on opening: later arrows are the person's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const choose = (i: MenuAction) => {
    if (i.isDisabled) return;
    if (i.copy === undefined) {
      i.onAction();
      return;
    }
    const mine = copyGen.current;
    void copyText(i.copy).then((ok) => {
      // The copy happened either way, so its action runs; only the menu it was chosen in shows and closes on it.
      if (mine !== copyGen.current) {
        if (ok) i.onAction();
        return;
      }
      setCopied({ id: i.id, ok });
      if (ok) i.onAction();
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setCopied(null);
        setOpenRef.current(false);
      }, COPIED_MS);
    });
  };
  const leadOf = (i: MenuAction, select: MenuSectionModel['select']) => {
    if (copied?.id === i.id) return <Icon name={copied.ok ? 'check' : 'warn'} />;
    if (select === 'many' || i.checked !== undefined)
      return (
        <span className={s.box} data-box="" data-on={i.checked || undefined}>
          {i.checked && <Icon name="check" size="sm" />}
        </span>
      );
    if (i.picture) return i.picture;
    if (i.icon) return <Icon name={i.icon} />;
    return null;
  };
  // Below 600 px a bottom tray: a modal dialog named by its visible title, holding a visible Close and the menu
  // (named by the same title). Scrim, Close, Escape and a choice close it; focus returns to the trigger.
  const wrap = (menu: ReactElement) =>
    tray ? (
      <ModalOverlay
        isDismissable
        className={s.trayScrim}
        onClick={keepIn}
        onDoubleClick={keepIn}
        onContextMenu={keepIn}
      >
        <Modal className={s.tray} data-hub-tray="" data-arming={arming || undefined} data-two-line={twoLine || undefined}>
          <AriaDialog className={s.trayDialog} aria-labelledby={titleId}>
            {/* The tray is a new surface (CardScopeReset): its Close keeps its own look under a card or a ButtonStrip trigger. */}
            <CardScopeReset>
              <div className={s.trayHead} data-tray-head="" onDragStart={keepIn}>
                <Heading slot="title" id={titleId} className={s.trayTitle}>
                  {named}
                </Heading>
                <IconButton icon="x" label={t('close')} shortcut="Esc" onPress={() => setOpen(false)} />
              </div>
              <div className={s.trayBody} onDragStart={keepIn}>
                {menu}
              </div>
            </CardScopeReset>
          </AriaDialog>
        </Modal>
      </ModalOverlay>
    ) : (
      <AriaPopover placement={placement} offset={4} className={s.popover} {...(anchor ? { triggerRef: anchor } : {})}>
        <CardScopeReset>{menu}</CardScopeReset>
      </AriaPopover>
    );
  return (
    <MenuTrigger isOpen={open} onOpenChange={setOpen}>
      {trigger === null ? (
        // No trigger of its own: MenuTrigger still needs a pressable child for its ids and state. Hidden, out of the
        // tab order and disabled, it is never pressed or seen; it carries the menu's name for the menu's aria-labelledby.
        <Pressable isDisabled>
          <button type="button" hidden tabIndex={-1} aria-label={label ?? t('more')} data-menu-anchored="" />
        </Pressable>
      ) : (
        (trigger ?? <IconButton icon={icon} label={label ?? t('more')} size={size} more={icon === 'dots' && !plain} />)
      )}
      {wrap(
        <Menu
          ref={menuRef}
          className={s.menu}
          data-pictures={pictures || undefined}
          {...(tray ? { 'aria-labelledby': titleId } : { 'aria-label': label ?? t('more') })}
          onAction={(key) => {
            const i = actions.get(String(key));
            if (i) choose(i);
          }}
        >
          {[...sections, ...(foot ? [foot] : [])].map((x) => {
            const head = x.label ?? (x.notes.length > 0 ? x.name : undefined);
            return (
              <MenuSection
                key={x.key}
                id={x.key}
                className={x === foot ? menuFooterSectionClass : s.section}
                data-menu-footer={x === foot ? '' : undefined}
                // The name without a visible label (a Header, when there is one, names the section instead).
                aria-label={x === foot ? t('menuActions') : x.label === undefined && x.name !== undefined ? x.name : undefined}
                {...(x.select === 'one'
                  ? { selectionMode: 'single' as const, selectedKeys: x.current != null ? [x.current] : [], onSelectionChange: () => undefined }
                  : x.select === 'many'
                    ? { selectionMode: 'multiple' as const, selectedKeys: x.items.flatMap((i) => (i.action.checked ? [i.action.id] : [])), onSelectionChange: () => undefined }
                    : {})}
              >
                {x.rule && <Separator className={s.sep} />}
                {(x.label !== undefined || x.notes.length > 0) && (
                  <Header className={s.header}>
                    {/* The header's only named content is the label (or, without one, the group's name kept off screen),
                        so a note never joins the group's name. */}
                    {head !== undefined && <span className={x.label !== undefined ? s.head : s.offscreen}>{head}</span>}
                    {x.notes.map((n) => (
                      <span key={n.id} id={n.id} className={s.note} data-note="" aria-hidden="true">
                        <Icon name="info" size="sm" />
                        <span>{n.text}</span>
                      </span>
                    ))}
                  </Header>
                )}
                {x.items.map(({ action: i, line, describedBy }) => {
                  const current = x.select === 'one' && x.current === i.id;
                  return (
                    <MenuItem
                      key={i.id}
                      id={i.id}
                      // The line under the label is this item's own element with its own id, and a note is the
                      // section's: React Aria's description slot checks for its element only when the item mounts, so
                      // a line or note that comes or goes on an open menu would leave aria-describedby wrong.
                      aria-describedby={describedBy.length ? describedBy.join(' ') : undefined}
                      textValue={menuLabel(i)}
                      shouldCloseOnSelect={i.copy === undefined && !i.isDisabled}
                      // Not a React Aria disabledKey (that drops it from the arrow-key order): aria-disabled is set
                      // here (React Aria forwards no aria-disabled of its own for an enabled item) and `choose`
                      // ignores it.
                      ref={(el: HTMLDivElement | null) => {
                        if (!el) return;
                        if (i.isDisabled) el.setAttribute('aria-disabled', 'true');
                        else el.removeAttribute('aria-disabled');
                      }}
                      data-unavailable={i.isDisabled || undefined}
                      className={cx(s.item, i.tone === 'danger' && s.danger, current && s.current, copied?.id === i.id && s.copied)}
                    >
                      {lead && (
                        <span className={s.lead} data-lead="">
                          {leadOf(i, x.select)}
                        </span>
                      )}
                      <span className={s.labels}>
                        <Text slot="label" className={s.label}>
                          {copied?.id === i.id ? (copied.ok ? t('copied') : t('copyFailed')) : menuLabel(i)}
                        </Text>
                        {line && (
                          <span className={s.reason} id={line.id} slot="description">
                            {line.text}
                          </span>
                        )}
                      </span>
                      {current && copied?.id !== i.id ? (
                        <span className={s.currentMark} data-current="">
                          <Icon name="check" />
                        </span>
                      ) : (
                        i.shortcut && copied?.id !== i.id && <Kbd>{i.shortcut}</Kbd>
                      )}
                    </MenuItem>
                  );
                })}
              </MenuSection>
            );
          })}
        </Menu>,
      )}
    </MenuTrigger>
  );
}
