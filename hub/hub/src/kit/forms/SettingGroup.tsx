// SettingGroup: setting rows on one shared grid, label + help | value | action. Every row is a
// subgrid of the group, so values share one column and end-aligned action clusters share their trailing edge.
//
// Frame: framed (line, radius, card fill) unless a kit surface around it already paints one. The surfaces publish that
// through inherited custom properties, not React context, because the detail pane's frame is decided by a container
// query (it drops its frame below 600 px of content): --sg-bw / --sg-fill make the group bare, --sg-pad is the inline
// inset its rows still owe, and --sg-pane snapshots --pane-inset at the surface so an inset paid since (DetailBody,
// a DetailPage body, a Tabs panel: they pad by --pane-inset and hand their children 0) is taken off the rows' inset.
// Publishers: a SettingsPage section, a Panel and Widget body (flush: bare, rows keep --pad-card), the detail pane
// (desktop only), a Drawer body and a Dialog. Anything else (a plain Section) publishes nothing: the group is framed.
//
// Narrow: the group is a container (setting-group). A value group stacks below 600 px, a field group below 640 px
// (in a Disclosure's fold, 640 px of the width before the fold's inset: foldInset), and either stacks when its label track would fall under 200 px (measured here from the value track, the widest
// action cluster, the gaps and the row inset: data-stack). A field group whose label track fits beside the field but not
// beside a row's actions stays side by side and those rows' actions go under their field (data-sg-under, `crowdedActions`;
// a switch row's cluster has no field to sit under, so it still counts). A stacked field row whose actions would leave the
// field under 200 px puts them under it (data-sg-drop, per row). Both are judged again when the group resizes, when a part
// of an action cluster resizes, and when rows, actions or their text change. Without subgrid support each row takes the same template
// and aligns on its own (no cross-row alignment promise).
//
// SettingRow renders in group mode when it sits in a group (useSettingGroup); outside a group it keeps the
// two-column layout of SettingRow.tsx (LegacyRow). SettingSwitch is a SettingRow whose control is a kit Switch at the start of the
// end-aligned action cluster; the switch stays visible (and locked) while an outcome is pending, the actions hide.
//
// Upkeep and danger: a rare edit is a reveal row (`reveal`: a quiet "Replace…"
// button at the row's end opens its editor in place, under the row, with Cancel and Save in the editor's foot; one
// editor open per row, Escape cancels, focus goes into the editor and back to the button). A destructive action lives
// in the last group, `tone="danger"`: its `title` is drawn in the danger colour above a frame set apart from the groups
// before it; its buttons take `tone="danger"` (never the accent) and keep the kit's confirm.
import { createContext, type KeyboardEvent, type ReactNode, type RefObject, useContext, useId, useLayoutEffect, useRef, useState } from 'react';
import { Button, cx, IconButton } from '../controls/Button';
import { Heading } from '../layouts/anatomy/Heading';
import { type OutcomeInput, isUnknown } from '../outcome';
import { InfoLine, plainText } from '../overlays/InfoTip';
import { FormStateProvider, useFormState } from './lock';
import { type CheckFn, Outcome, useDoneFlash, useOutcome, useOutcomeFacts, usePendingToast } from './Outcome';
import { Switch } from './fields';
import { useStrings } from '../strings';
import type { ErrorWordsOptions } from '../states/errorWords';
import strings from './forms.strings.en.json';
import s from './SettingGroup.module.css';
import { actionsGoUnder, dataAttrs, fieldLineShort, fieldTrackShort, labelTrackShort } from './SettingGroup.pure';

// The pure rules live in SettingGroup.pure.ts (shared with the terminal); their names stay importable from here.
export { SETTING_LABEL_FLOOR, actionsGoUnder, dataAttrs, fieldLineShort, fieldTrackShort, labelTrackShort } from './SettingGroup.pure';

export type SettingGroupVariant = 'value' | 'field';

interface GroupCtx {
  variant: SettingGroupVariant;
}

const SettingGroupContext = createContext<GroupCtx | null>(null);

/** The enclosing SettingGroup (null outside one). */
export function useSettingGroup(): GroupCtx | null {
  return useContext(SettingGroupContext);
}

export interface SettingGroupProps {
  /** `value` (default): read-only values in a 240 px track. `field`: the form control in a 360 px track. */
  variant?: SettingGroupVariant;
  /** A heading above the group's frame, one level below its section; it names the group. */
  title?: string;
  /** `danger`: the group of destructive actions, always the last one. Its title is in the danger colour and the group
   *  stands apart from the groups before it. */
  tone?: 'default' | 'danger';
  /** Accessible name of the group (role="group"). */
  label?: string;
  /** The id of a visible heading that names the group. */
  labelledBy?: string;
  /** Text about the whole group (a Band given the group as its `attach` sets it). */
  'aria-describedby'?: string;
  /** Field groups: where a row's actions go when they would leave the label under 200 px while the label fits beside the
   *  field alone. `under` (default): the group stays side by side and those rows' actions sit under their field.
   *  `stack`: the earlier arrangement, the whole group stacks. */
  crowdedActions?: 'under' | 'stack';
  children: ReactNode;
  className?: string;
}

function px(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** A row's action cluster laid out on one line: the switch plus each action, with the cluster gap (0 without any). */
function rowActionWidth(cell: HTMLElement | null): number {
  if (!cell) return 0;
  const parts = [...cell.querySelectorAll<HTMLElement>(':scope > [data-sg-control], :scope > [data-sg-actions] > *')];
  if (parts.length === 0) return 0;
  const gap = px(getComputedStyle(cell).columnGap);
  return parts.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0) + gap * (parts.length - 1);
}

/** The widest row's action cluster; with `keep`, only the rows it accepts. */
function actionWidth(group: HTMLElement, keep?: (row: HTMLElement) => boolean): number {
  let widest = 0;
  for (const cell of group.querySelectorAll<HTMLElement>('[data-sg-action]')) {
    if (keep && cell.parentElement && !keep(cell.parentElement)) continue;
    widest = Math.max(widest, rowActionWidth(cell));
  }
  return widest;
}

/**
 * The inset a Disclosure's fold takes from a group in it (0 outside one): the fold's inline-start padding, never more than
 * the fold is wider than the group. A field group in a fold is judged against FIELD_STACK_BELOW on its width plus this,
 * the width before the fold's inset, so it takes the layout of the groups beside the Disclosure.
 */
function foldInset(wrap: HTMLElement): number {
  const fold = wrap.parentElement?.closest<HTMLElement>('[data-disclosure-panel]');
  if (!fold) return 0;
  return Math.max(0, Math.min(px(getComputedStyle(fold).paddingInlineStart), fold.clientWidth - wrap.clientWidth));
}

function useLabelFloor(ref: RefObject<HTMLDivElement | null>, variant: SettingGroupVariant, crowded: 'under' | 'stack') {
  useLayoutEffect(() => {
    const group = ref.current;
    if (!group || typeof ResizeObserver === 'undefined') return;
    const wrap = group.parentElement;
    if (!wrap) return;
    const judge = () => {
      const cs = getComputedStyle(group);
      const row = group.querySelector<HTMLElement>('[data-sg-row]');
      const rs = row ? getComputedStyle(row) : null;
      const content = group.clientWidth;
      if (content <= 0) return;
      // In a fold the CSS 640 px line is off for the group (data-sg-fold) and judged here instead.
      const fold = variant === 'field' ? foldInset(wrap) : 0;
      if (wrap.hasAttribute('data-sg-fold') !== fold > 0) wrap.toggleAttribute('data-sg-fold', fold > 0);
      const lineShort = variant === 'field' && fieldLineShort({ width: wrap.clientWidth, fold });
      const m = {
        content,
        padStart: rs ? px(rs.paddingInlineStart) : 0,
        padEnd: rs ? px(rs.paddingInlineEnd) : 0,
        value: px(cs.getPropertyValue(variant === 'field' ? '--setting-field-w' : '--setting-value-w')),
        action: actionWidth(group),
        gap: px(cs.columnGap),
      };
      // A field row with a value moves its actions under the field; a switch or no-value row's cluster stays where it is.
      const fixed = (r: HTMLElement) => r.classList.contains(s.switchRow ?? '') || r.classList.contains(s.noValue ?? '');
      const under = variant === 'field' && crowded === 'under' && !lineShort && actionsGoUnder({ ...m, kept: actionWidth(group, fixed) });
      if (wrap.hasAttribute('data-sg-under') !== under) wrap.toggleAttribute('data-sg-under', under);
      const short = (fold > 0 && lineShort) || (!under && labelTrackShort(m));
      if (wrap.hasAttribute('data-stack') !== short) wrap.toggleAttribute('data-stack', short);
      if (variant !== 'field') return;
      // Stacked, a field row shares its line with its actions: drop them under the field when it would fall under 200 px.
      const stackedField = short || lineShort;
      for (const r of group.querySelectorAll<HTMLElement>('[data-sg-row]')) {
        const rcs = getComputedStyle(r);
        const drop =
          stackedField &&
          fieldTrackShort({
            content: r.clientWidth,
            padStart: px(rcs.paddingInlineStart),
            padEnd: px(rcs.paddingInlineEnd),
            action: rowActionWidth(r.querySelector<HTMLElement>(':scope > [data-sg-action]')),
            gap: px(rcs.columnGap),
          });
        if (r.hasAttribute('data-sg-drop') !== drop) r.toggleAttribute('data-sg-drop', drop);
      }
    };
    const ro = new ResizeObserver(judge);
    // The group, and each part of every action cluster: an action whose label changes resizes without the group doing so.
    const watch = () => {
      ro.disconnect();
      ro.observe(group);
      for (const el of group.querySelectorAll<HTMLElement>('[data-sg-control], [data-sg-actions] > *')) ro.observe(el);
    };
    // A Reset that appears or goes, a row added later, or a label's text changing in place.
    const mo =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver((records) => {
            // Only added or removed nodes change which action parts there are; a text change keeps the list.
            if (records.some((r) => r.type === 'childList')) watch();
            judge();
          });
    mo?.observe(group, { childList: true, subtree: true, characterData: true });
    watch();
    judge();
    return () => {
      ro.disconnect();
      mo?.disconnect();
    };
  }, [ref, variant, crowded]);
}

export function SettingGroup({ variant = 'value', title, tone = 'default', label, labelledBy, 'aria-describedby': describedBy, crowdedActions = 'under', children, className }: SettingGroupProps) {
  const ref = useRef<HTMLDivElement>(null);
  useLabelFloor(ref, variant, crowdedActions);
  const titleId = useId();
  const by = labelledBy ?? (title && !label ? titleId : undefined);
  const named = Boolean(label || by);
  return (
    <div className={cx(s.wrap, variant === 'field' && s.fieldWrap, tone === 'danger' && s.dangerWrap, className)} data-setting-group={variant} data-sg-tone={tone === 'danger' ? 'danger' : undefined}>
      {title && <Heading id={titleId}>{title}</Heading>}
      <div ref={ref} className={cx(s.group, variant === 'field' && s.field)} role={named ? 'group' : undefined} aria-label={label} aria-labelledby={by} aria-describedby={describedBy}>
        <SettingGroupContext.Provider value={{ variant }}>{children}</SettingGroupContext.Provider>
      </div>
    </div>
  );
}

/** A reveal row's editor: a rare edit opened in place under the row by a quiet button at its end. */
export interface SettingReveal {
  /** The quiet button that opens the editor, a verb with an ellipsis ("Replace…"). */
  label: string;
  /** The editor, drawn under the row while it is open; a function receives the row's ids for aria wiring. */
  editor: ReactNode | ((ids: SettingIds) => ReactNode);
  /** Save. A promise keeps the editor open with Save busy until it settles: it closes when the promise resolves and
   *  stays open when it rejects (the page shows why through the row's `error` or `outcome`). */
  onSave: () => void | Promise<unknown>;
  /** Save is pressable (a valid, changed value). Defaults to true. */
  canSave?: boolean;
  /** Save's words (defaults to Save). */
  saveLabel?: string;
  /** Called when the editor closes without saving (Cancel or Escape), so the page can drop its draft. */
  onCancel?: () => void;
  /** The opener's and Save's words show data (a name, an address): shown as written, no theme case (Button `literal`). */
  literal?: boolean;
}

/** The ids a row's control takes: its name and its help. */
export interface SettingIds {
  nameId: string;
  /** Undefined when the row has no help. */
  helpId: string | undefined;
}

export interface GroupRowProps {
  label: ReactNode;
  help?: ReactNode;
  /** The setting as it is written (SettingRow `code`): one mono line under the help. */
  code?: string;
  /** An explanation behind an icon-form InfoTip after the label (SettingRow `info`). */
  info?: string;
  /** `start`: the label sits at the top of the row, for a tall control (a list, a multi-line field). Default: centred. */
  align?: 'start';
  /** The value (value groups) or the control (field groups); a function receives the row's ids for aria wiring. */
  children?: ReactNode | ((ids: SettingIds) => ReactNode);
  htmlFor?: string;
  outcome?: OutcomeInput;
  /** The rejection of the last change: its mapped words and Details on the outcome line. */
  error?: unknown;
  /** The outcome line's sentence in the page's own words: it takes the place of the error's mapped sentence, and the
   *  error's Details still show (Outcome `detail`). */
  detail?: ReactNode;
  /** How the error's mapped sentence is worded (Outcome `errorWords`). */
  errorWords?: ErrorWordsOptions;
  onCheck?: CheckFn;
  /** Stop tracking a `pending` outcome: a text button after Check again on the row's outcome line (Outcome `onStop`).
   *  The page asks first in its own words; absent = no button. */
  onStop?: () => void;
  actions?: ReactNode;
  tone?: 'default' | 'danger';
  className?: string;
  /** SettingSwitch: the control at the start of the action cluster, kept while pending. */
  control?: (ids: SettingIds) => ReactNode;
  /** A rare edit opened in place: a quiet button after the row's actions opens `editor` under the row. */
  reveal?: SettingReveal;
  /** Reset to default: a small icon button at the end of the action cell. While `shown` is false it keeps its place,
   *  hidden, so a column of rows never shifts as values change. */
  reset?: SettingReset;
  /** `data-*` attributes go on the row element (a page finds and focuses a row by one). */
  [data: `data-${string}`]: string | undefined;
}

/** A row's reset-to-default cell. */
export interface SettingReset {
  /** The value differs from its default: the button shows. */
  shown: boolean;
  /** The button's accessible name ("Reset to default"). */
  label: string;
  onPress: () => void;
}

/** Focus moves into the editor: the first control a keyboard can reach (enabled, not hidden by attribute or CSS, in the
 *  tab order) that actually takes focus, else the editor group itself. */
const FOCUSABLE = 'input:not([type="hidden"]), textarea, select, button, [tabindex]:not([tabindex="-1"])';
function focusInto(box: HTMLElement): void {
  for (const el of box.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    if (el.matches(':disabled, [aria-disabled="true"]') || el.closest('[hidden], [inert], [aria-hidden="true"]')) continue;
    // checkVisibility where the engine has it (display none, visibility hidden, content-visibility hidden on the path).
    const visible = (el as HTMLElement & { checkVisibility?: (o?: { visibilityProperty?: boolean }) => boolean }).checkVisibility;
    if (visible && !visible.call(el, { visibilityProperty: true })) continue;
    if (getComputedStyle(el).visibility === 'hidden') continue;
    el.focus();
    if (document.activeElement === el) return;
  }
  box.focus();
}

/** The reveal row's open editor: focus moves in when it opens and back to its button when it closes. Save follows the
 *  form lock (a change in flight or unknown elsewhere in the form): nothing is sent again until it settles. */
function RevealEditor({ reveal, ids, editorId, onClose }: { reveal: SettingReveal; ids: SettingIds; editorId: string; onClose: (saved: boolean) => void }) {
  const t = useStrings(strings);
  const { locked } = useFormState();
  const [saving, setSaving] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  useLayoutEffect(() => {
    alive.current = true;
    if (box.current) focusInto(box.current);
    return () => {
      alive.current = false;
    };
  }, []);
  const cancel = () => {
    if (saving) return;
    reveal.onCancel?.();
    onClose(false);
  };
  const save = () => {
    if (locked || saving) return;
    const r = reveal.onSave();
    if (!r || typeof (r as Promise<unknown>).then !== 'function') return onClose(true);
    setSaving(true);
    (r as Promise<unknown>).then(
      () => {
        if (!alive.current) return;
        setSaving(false);
        onClose(true);
      },
      () => {
        if (alive.current) setSaving(false);
      },
    );
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    // Escape closes the editor, not the drawer or dialog around it.
    e.stopPropagation();
    e.preventDefault();
    cancel();
  };
  const body = typeof reveal.editor === 'function' ? reveal.editor(ids) : reveal.editor;
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape anywhere in the editor's fields cancels it (as in Drawer.tsx)
    <div ref={box} id={editorId} className={s.reveal} role="group" aria-labelledby={ids.nameId} tabIndex={-1} onKeyDown={onKeyDown} data-sg-reveal="">
      <div className={s.revealBody}>{body}</div>
      <div className={s.revealFoot}>
        {/* Cancel is the kit's one Cancel kind (a secondary plate with no glyph, as FormFooter's and a dialog's), at the
            row size of the Save beside it. */}
        <Button size="sm" chip={false} variant="secondary" onPress={cancel} isDisabled={saving}>
          {t('form.cancel')}
        </Button>
        <Button size="sm" onPress={save} busy={saving} isDisabled={reveal.canSave === false || locked} literal={reveal.literal}>
          {reveal.saveLabel ?? t('form.save')}
        </Button>
      </div>
    </div>
  );
}

/** One row in group mode: SettingRow and SettingSwitch render this inside a SettingGroup. */
export function GroupRow({ label, help, code, info, children, htmlFor, outcome, error, detail, errorWords, onCheck, onStop, actions, tone = 'default', className, control, reveal, reset, align, ...rest }: GroupRowProps) {
  const parent = useFormState();
  const o = useOutcome(outcome);
  const doneShown = useDoneFlash(o);
  // The row locks on the kind its line shows (as OutcomeSlot): pending facts under another kind (a failed outcome whose
  // error says the change may have gone through) lock the control and hide the actions, so nothing can be sent again.
  const { info: facts, kind: shown } = useOutcomeFacts(o, error);
  const pending = shown === 'pending';
  // A row that goes away while its change is unknown leaves the sticky Check again toast, with the facts' Details.
  usePendingToast(o, onCheck, true, facts);
  const t = useStrings(strings);
  const locked = parent.locked || isUnknown(o) || pending;
  const nameId = useId();
  const helpBase = useId();
  const ids: SettingIds = { nameId, helpId: help ? helpBase : undefined };
  const value = typeof children === 'function' ? children(ids) : children;
  const hasValue = value !== undefined && value !== null && value !== false;
  const [open, setOpen] = useState(false);
  const editorId = useId();
  const opener = useRef<HTMLButtonElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  const revealShown = Boolean(reveal) && !open;
  const showActions = (Boolean(actions) || revealShown) && !pending;
  // Focus goes back to the opener when the editor closes. While the opener cannot take it (hidden by a pending outcome,
  // or disabled by the form lock) the row holds focus, and hands it to the opener once it can, so focus never falls to
  // the page. A user who has moved focus elsewhere in the meantime keeps it there.
  useLayoutEffect(() => {
    if (open || !refocus.current) return;
    const at = document.activeElement;
    const ours = !at || at === document.body || at === rowRef.current;
    if (!ours) {
      refocus.current = false;
      return;
    }
    const btn = opener.current;
    if (btn && !locked) {
      btn.focus();
      if (document.activeElement === btn) {
        refocus.current = false;
        return;
      }
    }
    if (at !== rowRef.current) rowRef.current?.focus();
  }, [open, showActions, locked]);
  // The reset cell stays in the action cell whenever the row has one; a pending outcome hides it like the actions.
  const resetShown = Boolean(reset?.shown) && !pending;
  const hasAction = Boolean(control) || showActions || Boolean(reset);
  const nameCls = cx(s.name, tone === 'danger' && s.danger);
  return (
    <div {...dataAttrs(rest)} ref={rowRef} tabIndex={reveal ? -1 : undefined} className={cx(s.row, control && s.switchRow, !hasValue && s.noValue, align === 'start' && s.rowStart, className)} data-sg-row="">
      <div className={s.label}>
        <InfoLine tip={info} subject={plainText(label)}>
          {htmlFor ? (
            <label id={nameId} className={nameCls} htmlFor={htmlFor}>
              {label}
            </label>
          ) : (
            <span id={nameId} className={nameCls}>
              {label}
            </span>
          )}
        </InfoLine>
        {help && (
          <span id={helpBase} className={s.help}>
            {help}
          </span>
        )}
        {code && (
          <code className={s.code} data-sg-code="">
            {code}
          </code>
        )}
      </div>
      <FormStateProvider value={locked === parent.locked ? parent : { ...parent, locked }}>
        {hasValue && <div className={s.value}>{value}</div>}
        {hasAction && (
          <div className={s.action} data-sg-action="">
            {control && (
              <div className={s.control} data-sg-control="">
                {control(ids)}
              </div>
            )}
            {(showActions || reset) && (
              <div className={s.actions} data-sg-actions="">
                {showActions && actions}
                {showActions && revealShown && reveal && (
                  <Button ref={opener} size="sm" variant="ghost" aria-expanded={false} aria-controls={editorId} onPress={() => setOpen(true)} isDisabled={locked} literal={reveal.literal} data-sg-opener="">
                    {reveal.label}
                  </Button>
                )}
                {reset && (
                  <span className={cx(s.reset, !resetShown && s.resetHidden)} data-sg-reset={resetShown ? 'shown' : 'hidden'} aria-hidden={resetShown ? undefined : true}>
                    <IconButton icon="reload" size="sm" label={reset.label} onPress={reset.onPress} isDisabled={locked || !resetShown} />
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </FormStateProvider>
      {o && (o.kind !== 'done' || doneShown) && <Outcome outcome={o} onCheck={onCheck} onStop={onStop} doneText={t('form.saved')} wrap error={error} detail={detail} errorWords={errorWords} className={s.outcome} />}
      {reveal && open && (
        <FormStateProvider value={locked === parent.locked ? parent : { ...parent, locked }}>
          <RevealEditor
            reveal={reveal}
            ids={ids}
            editorId={editorId}
            onClose={() => {
              refocus.current = true;
              setOpen(false);
            }}
          />
        </FormStateProvider>
      )}
    </div>
  );
}

export interface SettingSwitchProps {
  label: ReactNode;
  help?: ReactNode;
  /** The setting as it is written (SettingRow `code`): one mono line under the help. */
  code?: string;
  isSelected: boolean;
  onChange: (on: boolean) => void;
  isDisabled?: boolean;
  /** The settle outcome of the last change: the switch stays visible and locked while it is unknown. */
  outcome?: OutcomeInput;
  /** The rejection of the last change: its mapped words and Details on the outcome line. */
  error?: unknown;
  /** The outcome line's sentence in the page's own words: it takes the place of the error's mapped sentence, and the
   *  error's Details still show (Outcome `detail`). */
  detail?: ReactNode;
  /** How the error's mapped sentence is worded (Outcome `errorWords`). */
  errorWords?: ErrorWordsOptions;
  onCheck?: CheckFn;
  /** Stop tracking a `pending` outcome (GroupRow `onStop`). */
  onStop?: () => void;
  /** Row-level actions after the switch (a Reset, an overflow Menu); hidden while the outcome is pending. */
  actions?: ReactNode;
  tone?: 'default' | 'danger';
  className?: string;
}

/** A setting whose control is a kit Switch, named by the row (aria-labelledby) and described by its help. */
export function SettingSwitch({ isSelected, onChange, isDisabled, ...row }: SettingSwitchProps) {
  const inGroup = useSettingGroup();
  const body = (
    <GroupRow
      {...row}
      control={(ids) => <Switch labelledBy={ids.nameId} aria-describedby={ids.helpId} isSelected={isSelected} onChange={onChange} isDisabled={isDisabled} />}
    />
  );
  // Outside a group a switch setting is a one-row group, so it never falls back to the legacy shape.
  return inGroup ? body : <SettingGroup>{body}</SettingGroup>;
}
