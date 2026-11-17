// ActionMenu in the terminal, on prim/Overlay's popover layer and the shared model
// (Menu.model.ts: sections, the danger area, notes said once, reasons, keyboard-open focus, the footer, runMenuAction).
//
// The trigger (the "⋯" button, a kit Button, or none with `isOpen`) opens a framed list against it (flips above, clamped,
// re-placed on resize). Keys stay in the menu: ↑ / ↓ move (no wrap), Home / End, a letter types ahead over the labels,
// Enter / Space choose, Esc or Tab close, a press outside closes; the focus is back on the trigger. The row under the
// focus is drawn on the focus colour (focusInk) with a "›" mark (reads without colour). Disabled items stay in the arrow order, faint, with
// their reason on the line under them (or once in a note at the section's top), and choosing one does nothing. A
// shortcut shows at the row's end; the one-of current shows "✓" there; a many group draws "[x]" / "[ ]". A copy item
// copies (OSC 52), says "Copied" in its row, then the menu closes after COPIED_MS. Danger items sit after a rule at the
// end, in the danger colour and bold; the footer is the last section, after its own rule.
//
// Opening focus is the model's (menuInitialKey) for every open: a terminal does not tell a pointer open from a key
// open by focus. A list taller than the room the screen gives it scrolls, and the focused row is always brought into
// view (a row that is not drawn is never the one Enter chooses). Not here: the phone tray (a narrow terminal keeps the
// anchored list, clamped), `anchor` (a DOM ref), submenus (the web ActionMenu has none).
// Narrow terminals (the rule for every overlay; no phone sheet or tray): a Drawer goes full screen when it does not fit;
// a Popover, Menu, InfoTip or Tooltip stays anchored and is clamped inside the screen; a Dialog is clamped to the width.
import { useMenuTriggerState } from 'react-stately/useMenuTriggerState';
import { focusInk } from '../../term/prim/FocusInk';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type * as Web from './Menu';
import { useBoundCopyText } from '../data/termCopyText';
import { Icon, type IconName } from '../icons';
import { ICON_GLYPHS, iconText } from '../icons.glyphs';
import { useStrings } from '../strings';
import strings from './strings.en.json';
import { COPIED_MS, footerSection, menuInitialKey, menuLabel, menuSections, type MenuAction, type MenuSectionModel } from './Menu.model';
import { useCloseOnContextEnd, useCloseOnLeave } from './shared';
import { sideOf, withPress } from './trigger';
import { Box, Pressable, Scroll, Text, isPressKey, useFocusable, useFocusChange, type Focusable, type Key } from '../../term/prim';
import { mergeRefs, useSem } from '../../term/prim/semantics';
import { Layer, useAnchor, useLayer } from '../../term/prim/Overlay';

export { COPIED_MS, footerSection, menuInitialKey, menuLabel, menuSections, runMenuAction } from './Menu.model';
export type { MenuAction, MenuEntry, MenuGroup, MenuList, MenuSectionModel } from './Menu.model';
export type { ActionMenuProps } from './Menu';

/** A small picture's place: the terminal draws no thumbnail (a menu row keeps its label). */
export const MenuThumb: typeof Web.MenuThumb = () => <></>;
/** Class names are the web's; nothing reads them here. */
export const menuFooterSectionClass: typeof Web.menuFooterSectionClass = '';
export const menuSearchClass: typeof Web.menuSearchClass = '';

/** Type-ahead keeps the letters typed within this long (React Aria's 1 s). */
const TYPE_MS = 1000;
/** The menu's width bounds in columns (the web's min 180 / max 320 px). */
const MIN_W = 24;
const MAX_W = 48;

type Row = { action: MenuAction; section: MenuSectionModel; line?: string };

/** The icons a menu trigger reads by on its own (more, add, a split button's arrow): drawn as their mark. */
const TRIGGER_MARKS: Partial<Record<IconName, string>> = { dots: '⋯', 'dots-vertical': '⋮', plus: '+', 'chevron-down': '▾' };

/** The web's trigger is an IconButton showing `icon` (default the "more" dots). A mark above draws as itself; any other
 *  icon (a page mark, sliders, a clock) says nothing alone in a terminal, so the trigger shows its label, as a terminal
 *  IconButton does: two menus side by side read "[⋯] [⋯]" before (the composer's Add files and More ways to send; the
 *  file chooser's Places and View options). */
function DefaultTrigger({ label, icon, open, onPress }: { label: string; icon: IconName; open: boolean; onPress?: () => void }) {
  return (
    <Pressable dir="row" shrink={0} onPress={onPress} sem={{ name: label, expanded: open, popup: 'menu' }}>
      {({ focused }) => <Text colour="muted" {...focusInk(focused)}>{`[${TRIGGER_MARKS[icon] ?? label}]`}</Text>}
    </Pressable>
  );
}

interface MenuRowProps {
  row: Row;
  lead: boolean;
  /** This row's copy result while it says so: true copied, false refused, null not copying. */
  copied: boolean | null;
  words: { copied: string; failed: string };
  bind: (f: Focusable | null) => void;
  onFocused: () => void;
  onChoose: () => void;
}

/** Cells a row's line (its reason or description) sits further in than its label. */
const LINE_INSET = 2;
/** The focus mark drawn before the focused row. */
const FOCUS_MARK = '›';
/** An icon that draws as the focus mark (chevron-right: Open): beside the mark it read "› ›" (Bots row menu), so the
 *  focused row leaves its cell blank. */
const echoesMark = (name: MenuAction['icon']): boolean => { const c = name ? ICON_GLYPHS[name] : undefined; return c !== undefined && iconText(c) === FOCUS_MARK; };

/** One item: a focusable of the menu layer (never a Tab stop), a menuitem in the semantics tree. */
function MenuRow({ row: { action: i, section: x, line }, lead, copied, words, bind, onFocused, onChoose }: MenuRowProps) {
  const f = useFocusable({ tabStop: false, onKey: (k) => { if (isPressKey(k)) { onChoose(); return true; } return false; } });
  const bindRef = useRef(bind);
  bindRef.current = bind;
  useEffect(() => { bindRef.current(f); return () => bindRef.current(null); });
  useFocusChange(f.focused, (on) => { if (on) onFocused(); });
  const checkbox = x.select === 'many' || i.checked !== undefined;
  const role = checkbox ? 'menuitemcheckbox' : x.select === 'one' ? 'menuitemradio' : 'menuitem';
  const current = x.select === 'one' && x.current === i.id;
  const semRef = useSem({
    role, name: menuLabel(i),
    ...(i.isDisabled ? { disabled: true, ...(line ? { disabledReason: line } : {}) } : line ? { description: line } : {}),
    ...(checkbox ? { checked: i.checked === true } : x.select === 'one' ? { checked: current } : {}),
  }, { role, focus: f });
  const ref = useMemo(() => mergeRefs(f.ref, semRef), [f.ref, semRef]);
  const isCopied = copied !== null;
  const ink = i.isDisabled ? 'faint' : i.tone === 'danger' ? 'danger' : 'ink';
  const box = checkbox ? (i.checked ? '[x]' : '[ ]') : null;
  return (
    <Box boxRef={ref} onPress={() => { f.focus(); onChoose(); }}>
      <Box dir="row" gap={1}>
        <Text colour={f.focused ? 'focus' : 'faint'}>{f.focused ? FOCUS_MARK : ' '}</Text>
        {lead ? (
          <Box width={box ? 3 : 2} shrink={0}>
            {isCopied ? <Text colour={copied ? 'ok' : 'warn'}>{copied ? '✓' : '!'}</Text> : box ? <Text colour={ink}>{box}</Text> : i.icon && !(f.focused && echoesMark(i.icon)) ? <Icon name={i.icon} /> : null}
          </Box>
        ) : null}
        <Text colour={ink} bold={i.tone === 'danger' && !i.isDisabled} grow={1} truncate {...focusInk(f.focused)}>
          {isCopied ? (copied ? words.copied : words.failed) : menuLabel(i)}
        </Text>
        {current && !isCopied ? <Text colour="ok">✓</Text> : i.shortcut && !isCopied ? <Text colour="muted">{i.shortcut}</Text> : null}
      </Box>
      {/* The web's description slot: the reason (or description) under its own label, in the small muted type. Here it sits
          two cells further in than the label and in italics, so it reads as this item's line, never as a disabled item
          of its own ("No link yet" under Copy address read as a second grey item). */}
      {line ? <Box pad={{ left: (lead ? (box ? 6 : 5) : 2) + LINE_INSET }}><Text colour="muted" italic>{line}</Text></Box> : null}
    </Box>
  );
}

/** The menu's rows, no taller than the room the layer can get: past it they scroll, following the focused row. */
function MenuBody({ children }: { children: ReactNode }) {
  const room = useLayer()?.room;
  return <Scroll followFocus {...(room !== undefined ? { maxHeight: room } : {})}>{children}</Scroll>;
}

export const ActionMenu: typeof Web.ActionMenu = ({ items, label, trigger, icon = 'dots', placement = 'bottom end', isOpen, onOpenChange, footer }) => {
  const t = useStrings(strings);
  const sections = menuSections(items, 'menu');
  const foot = footerSection(footer, sections, 'menu');
  const all = [...sections, ...(foot ? [foot] : [])];
  const rows: Row[] = all.flatMap((x) => x.items.map((i) => ({ action: i.action, section: x, ...(i.line ? { line: i.line.text } : {}) })));
  // The web's state (React Aria's useMenuTrigger runs on react-stately's useMenuTriggerState): controlled by isOpen when
  // given, else its own; every change reported through onOpenChange, once.
  const state = useMenuTriggerState({ isOpen, onOpenChange });
  const open = state.isOpen;
  const setOpenRef = useRef<(o: boolean) => void>(() => undefined);
  const setOpen = (o: boolean) => (o ? state.open() : state.close());
  setOpenRef.current = setOpen;
  useCloseOnLeave(open, () => setOpen(false));
  useCloseOnContextEnd(open, () => setOpen(false));
  // The rows are focusables of the menu layer (never Tab stops): arrows, Home/End and type-ahead move the focus between
  // them, Enter/Space on the focused row choose it. `at` is the focused row's id, kept as each move makes it (keys
  // arrive faster than renders).
  const handles = useRef(new Map<string, Focusable>());
  const at = useRef<string | undefined>(undefined);
  const moveTo = (id: string | undefined) => { if (id === undefined) return; at.current = id; handles.current.get(id)?.focus(); };
  const [copied, setCopied] = useState<{ id: string; ok: boolean } | null>(null);
  const copyGen = useRef(0);
  // Bound to this menu's mount: a choice resolved after the mount ended copies nothing.
  const copyText = useBoundCopyText();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const typed = useRef({ text: '', at: 0 });
  const anchor = useAnchor();

  // Each open lands on the model's item; a close ends a copy's moment.
  useEffect(() => {
    if (open) { moveTo(menuInitialKey(sections) ?? foot?.items[0]?.action.id); return; }
    copyGen.current++;
    setCopied(null);
    clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => () => { copyGen.current++; clearTimeout(timer.current); }, []);

  const choose = (i: MenuAction) => {
    if (i.isDisabled) return;
    if (i.copy === undefined) {
      i.onAction();
      setOpen(false);
      return;
    }
    const mine = copyGen.current;
    void copyText(i.copy).then((ok) => {
      if (mine !== copyGen.current) { if (ok) i.onAction(); return; }
      setCopied({ id: i.id, ok });
      if (ok) i.onAction();
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { setCopied(null); setOpenRef.current(false); }, COPIED_MS);
    });
  };

  const onKey = (k: Key): boolean => {
    const i = rows.findIndex((r) => r.action.id === at.current);
    if (k.name === 'up') { if (i > 0) moveTo(rows[i - 1]!.action.id); return true; }
    if (k.name === 'down') { if (i < rows.length - 1) moveTo(rows[i + 1]!.action.id); return true; }
    if (k.name === 'home' || k.name === 'pageup') { moveTo(rows[0]?.action.id); return true; }
    if (k.name === 'end' || k.name === 'pagedown') { moveTo(rows[rows.length - 1]?.action.id); return true; }
    if (k.name === 'return' || k.name === 'linefeed' || k.name === 'space') return false; // the focused row's own
    if (k.name === 'tab') { setOpen(false); return true; }
    const ch = k.sequence;
    if (!k.ctrl && !k.meta && typeof ch === 'string' && ch.length === 1 && ch >= ' ') {
      const now = Date.now();
      const text = (now - typed.current.at < TYPE_MS ? typed.current.text : '') + ch.toLowerCase();
      typed.current = { text, at: now };
      // From the focused row (a repeated letter moves on), else from the next; labels as shown.
      const order = [...rows.slice(i < 0 ? 0 : i), ...rows.slice(0, i < 0 ? 0 : i)];
      const from = text.length === 1 ? [...order.slice(1), ...order.slice(0, 1)] : order;
      const hit = from.find((r) => menuLabel(r.action).toLowerCase().startsWith(text));
      if (hit) moveTo(hit.action.id);
      return true;
    }
    return false;
  };

  const lead = rows.some((r) => r.action.icon || r.action.checked !== undefined || r.section.select === 'many') || copied !== null;
  const copyWords = rows.some((r) => r.action.copy !== undefined) ? Math.max(t('copied').length, t('copyFailed').length) + (lead ? 2 : 0) : 0;
  const widest = Math.max(copyWords, ...rows.map((r) => menuLabel(r.action).length + (r.action.shortcut ? r.action.shortcut.length + 2 : 0) + (lead ? 2 : 0)), ...rows.map((r) => (r.line?.length ?? 0) + (lead ? 2 : 0)));
  const width = Math.max(MIN_W, Math.min(MAX_W, widest + 6));
  const { side, align } = sideOf(placement);

  const row = (r: Row): ReactNode => (
    <MenuRow
      key={r.action.id}
      row={r}
      lead={lead}
      copied={copied?.id === r.action.id ? copied.ok : null}
      words={{ copied: t('copied'), failed: t('copyFailed') }}
      bind={(f) => { if (f) handles.current.set(r.action.id, f); else handles.current.delete(r.action.id); }}
      onFocused={() => { at.current = r.action.id; }}
      onChoose={() => choose(r.action)}
    />
  );

  return (
    <>
      {trigger === null ? null : (
        <Box boxRef={anchor.ref} dir="row" shrink={0}>
          {trigger ? withPress(trigger, () => setOpen(!open)) : <DefaultTrigger label={label ?? t('more')} icon={icon} open={open} onPress={() => setOpen(!open)} />}
        </Box>
      )}
      <Layer
        open={open}
        kind="popover"
        place={{ at: 'anchor', anchor: trigger !== null ? anchor.rect : null, side, align, width }}
        initialFocus="none"
        onEscape={() => setOpen(false)}
        onOutside={() => setOpen(false)}
        onKeyFirst={(k) => onKey(k)}
        sem={{ role: 'menu', name: label ?? t('more') }}
      >
        <MenuBody>
          {all.map((x) => (
            <Box key={x.key}>
              {x.rule || (x === foot && sections.length > 0) ? <Box height={1} shrink={0} border={['top']} borderColour="line" /> : null}
              {x.label !== undefined ? <Text colour="muted" bold>{x.label}</Text> : null}
              {x.notes.map((n) => <Text key={n.id} colour="muted">i {n.text}</Text>)}
              {rows.filter((r) => r.section === x).map(row)}
            </Box>
          ))}
        </MenuBody>
      </Layer>
    </>
  );
};
