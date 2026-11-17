// Terminal SettingGroup / GroupRow / SettingSwitch: setting rows as label + help | value | action cluster.
// - Wide rows (the row has room for a SETTING_LABEL_CELLS label column plus a usable value) put the three side by side;
//   a narrow row stacks as the web's narrow row: label and help, then the value with the actions at the end of its
//   line (under it when even that has no room); a switch row has its switch at the end of the label's line and its
//   actions under the help. Judged per row
//   from its laid-out width (useBoxSize). A field group's row also stacks when its value does not fit beside the
//   label at the value's own width (a field with a worded suffix in a drawer); a value that fits stays beside it.
// - The group is framed (a line border) unless a surface around it already frames it (the web's --sg-* custom
//   properties have no terminal meaning: a group is always framed here, a danger group gets its title in the danger
//   colour and the word "Danger" so it reads in mono).
// - A row whose outcome is unknown locks its fields (FormStateProvider) and hides its actions (the switch stays), and
//   shows the Outcome line under it, as on the web.
// - Reveal rows: a quiet "Replace…" button opens the editor under the row with Cancel and Save; Escape cancels while it
//   is open; Save follows the form lock and stays busy until a returned promise settles (closes on resolve only).
import { Fragment, createContext, isValidElement, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type * as Web from './SettingGroup';
import { Box, Text, useBoxSize, useFocusControl, useFocusWithin, useKeys, type Colour } from '../../term/prim';
import type { BoxRenderable } from '../../term/prim/otui';
import { Button } from '../controls/Button';
import { isUnknown } from '../outcome';
import { InfoLine, plainText } from '../overlays/InfoTip';
import { FormStateProvider, useFormState } from './lock';
import { Outcome, useDoneFlash, useOutcome, useOutcomeFacts, usePendingToast } from './Outcome';
import { Switch } from './fields';
import { useStrings } from '../strings';
import strings from './forms.strings.en.json';

export type { SettingGroupVariant, SettingGroupProps, SettingReveal, SettingReset, SettingIds, GroupRowProps, SettingSwitchProps } from './SettingGroup';
export { SETTING_LABEL_FLOOR, actionsGoUnder, dataAttrs, fieldLineShort, fieldTrackShort, labelTrackShort } from './SettingGroup.pure';

/** The label column in cells (the web's 220 px track). */
const SETTING_LABEL_CELLS = 30;
/** A row narrower than this stacks (label column + gap + a usable 24-cell value). */
const ROW_GAP = 2;
const STACK_BELOW = SETTING_LABEL_CELLS + ROW_GAP + 24;
/** The least a value keeps between the label column and the row's actions. A long action squeezes the value (the
 *  rows of a group keep one value column), but never below this: then the row stacks (60 columns: "The / chat's /
 *  model" one word a line in 8 cells beside [Change model]). */
const VALUE_BESIDE_MIN = 12;

const SettingGroupContext = createContext<{ variant: Web.SettingGroupVariant } | null>(null);

export const useSettingGroup: typeof Web.useSettingGroup = () => useContext(SettingGroupContext);

let nextId = 0;
const useStableId = (prefix: string): string => {
  const id = useRef('');
  if (!id.current) id.current = `${prefix}-${++nextId}`;
  return id.current;
};

export const SettingGroup: typeof Web.SettingGroup = ({ variant = 'value', title, tone = 'default', label, 'aria-describedby': describedBy, children }) => {
  const danger = tone === 'danger';
  return (
    <Box dir="column" shrink={0} pad={danger ? { top: 1 } : undefined}>
      {title ? <Text bold colour={danger ? 'danger' : 'ink'}>{title}</Text> : null}
      <Box dir="column" shrink={0} border borderColour={danger ? 'danger' : 'line'} padX={1} pad={{ bottom: 1 }} sem={{ role: 'group', name: label ?? title, describedBy }}>
        <SettingGroupContext.Provider value={{ variant }}>{children}</SettingGroupContext.Provider>
      </Box>
    </Box>
  );
};

/** One row (group mode; SettingRow outside a group renders this too). */
export const GroupRow: typeof Web.GroupRow = ({ label, help, code, info, children, outcome, error, detail, errorWords, onCheck, onStop, actions, tone = 'default', control, reveal, reset }) => {
  const parent = useFormState();
  const fieldGroup = useSettingGroup()?.variant === 'field';
  const o = useOutcome(outcome);
  const doneShown = useDoneFlash(o);
  // The row locks on the kind its line shows: pending facts under another kind (a failed outcome whose error says the
  // change may have gone through) lock the control and hide the actions, so nothing can be sent again.
  const { info: facts, kind: shown } = useOutcomeFacts(o, error);
  const pending = shown === 'pending';
  // A row that goes away while its change is unknown leaves the sticky Check again toast, with the facts' details.
  usePendingToast(o, onCheck, true, facts);
  const t = useStrings(strings);
  const locked = parent.locked || isUnknown(o) || pending;
  const nameId = useStableId('sg-name');
  const helpBase = useStableId('sg-help');
  const ids: Web.SettingIds = { nameId, helpId: help ? helpBase : undefined };
  const value = typeof children === 'function' ? children(ids) : children;
  const hasValue = value !== undefined && value !== null && value !== false;
  const [open, setOpen] = useState(false);
  // Focus goes back to the opener when the editor closes: it mounts again then, and takes the focus the editor's
  // control let go of (autoFocus applies only while nothing has the focus, so a focus moved elsewhere stays there).
  const refocus = useRef(false);
  const revealShown = Boolean(reveal) && !open;
  // Reset to default: offered after the row's actions while the value differs from its default; hidden with them while
  // the outcome is unknown.
  const resetShown = Boolean(reset?.shown);
  const showActions = (Boolean(actions) || revealShown || resetShown) && !pending;
  const hasAction = Boolean(control) || showActions;
  const [size, onSize] = useBoxSize();
  // The cluster's own width (it never shrinks; stacked, it sits in a row of its own so it is not stretched).
  const [clusterSize, onCluster] = useBoxSize();
  const beside = hasAction && clusterSize !== null ? clusterSize.width + ROW_GAP : 0;
  // A field group's value is laid beside the label at its own width (it never shrinks there, it may grow): when that
  // is wider than the room the label column leaves, the row stacks rather than squeeze the field ("[Sugges" at the
  // card's edge, New Bot and Get a computer at 80 columns). A value that fits stays beside its label (billing's "Plans
  // for" and its choices at 80x24). The widest own width seen is kept, so the row never flips back and forth: it
  // stacks while it is narrower than label + value + actions need.
  const [valueRoom, onValueRoom] = useBoxSize();
  const [valueOwn, onValueOwn] = useBoxSize();
  const [own, setOwn] = useState<number | null>(null);
  const overflowing = valueOwn !== null && valueRoom !== null && valueOwn.width > valueRoom.width ? valueOwn.width : null;
  useEffect(() => { if (overflowing !== null) setOwn((w) => (w === null || overflowing > w ? overflowing : w)); }, [overflowing]);
  const valueTooWide = fieldGroup && own !== null && size !== null && size.width < SETTING_LABEL_CELLS + ROW_GAP + own + beside;
  // Side by side needs the label column, the value's least room (none without a value) and the whole cluster: the
  // cluster never shrinks, so a row whose actions alone do not fit beside the label stacks too.
  const stacked = size !== null && (valueTooWide || size.width < STACK_BELOW || (beside > 0 && size.width < SETTING_LABEL_CELLS + ROW_GAP + (hasValue ? VALUE_BESIDE_MIN : 0) + beside));
  // Stacked, a value shares its line with the actions (not with a switch: that row keeps its own form) while it keeps
  // VALUE_BESIDE_MIN cells there; narrower still, the actions go under it.
  const valueLine = stacked && hasValue && showActions && !control && size !== null && size.width >= VALUE_BESIDE_MIN + beside;
  const lockState = locked === parent.locked ? parent : { ...parent, locked };

  const name = (
    <Box dir="column" shrink={0} {...(stacked ? {} : { width: SETTING_LABEL_CELLS })}>
      <InfoLine tip={info} subject={plainText(label)}>
        <Words id={nameId} bold colour={tone === 'danger' ? 'danger' : 'ink'}>{label}</Words>
      </InfoLine>
      {help ? <Words id={helpBase} colour="muted" stack>{help}</Words> : null}
      {code ? <Text colour="muted">{code}</Text> : null}
    </Box>
  );
  const actionRow = showActions ? (
    <Box dir="row" gap={1} shrink={0} wrap>
      {actions}
      {revealShown && reveal ? (
        <Button size="sm" variant="ghost" autoFocus={refocus.current} onPress={() => setOpen(true)} isDisabled={locked} literal={reveal.literal}>{reveal.label}</Button>
      ) : null}
      {resetShown && reset ? <Button size="sm" variant="ghost" onPress={reset.onPress} isDisabled={locked}>{reset.label}</Button> : null}
    </Box>
  ) : null;
  // A stacked switch row is the web's narrow switch row: the switch at the end of the label's line (its first line,
  // however the help wraps), the value and the actions under the label and help, at the start.
  const switchRow = stacked && Boolean(control);
  // The control is drawn in two places (in the cluster beside the label; at the end of the label's line when the row
  // stacks), so a resize across the stack boundary mounts it anew. When it held the focus, the focus follows it to its
  // new place once that is laid out, as the value and the actions keep theirs (they have one element path).
  const ctlBox = useRef<BoxRenderable | null>(null);
  const ctlInside = useRef(false);
  useFocusWithin(ctlBox, (now) => { ctlInside.current = now; });
  const ctlFocus = useFocusControl();
  const lastSwitchRow = useRef(switchRow);
  const carryFocus = useRef(false);
  if (lastSwitchRow.current !== switchRow) { carryFocus.current = ctlInside.current; lastSwitchRow.current = switchRow; }
  useLayoutEffect(() => {
    if (!carryFocus.current) return;
    carryFocus.current = false;
    const id = setTimeout(() => { if (ctlBox.current) ctlFocus.focusFirst(ctlBox.current); }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the row changes form
  }, [switchRow]);
  const ctl = (): ReactNode => (control ? <Box boxRef={ctlBox} dir="row" shrink={0}>{control(ids)}</Box> : null);
  // The value's cell, at one element path in every form of the row (beside the label, stacked, on one line with the
  // actions, under a switch): FormStateProvider > cell > inner > value. A row that stacks or comes back beside its
  // label (a resize, an error line that widens a field group's value while someone types) lays its value out again
  // and never mounts it anew, so a focused field keeps its focus and what was typed. Only the boxes' props change: in
  // a field group beside its label the inner box never shrinks (its width is the value's own, measured above). When
  // the actions share the value's line (the line below), a field group's actions sit by the value's
  // first line, as the web's field row starts them at the top: beside a tall value (a radio group with its
  // descriptions, a field with its help) Save stays by its top instead of halfway down the text. Other groups centre
  // them on the value, as the web's row does.
  // Stacked, a field group's value that is one control fills its line, as the web's value cell gives a control its
  // width: a field reaches the row's end (with an error line or without), and a control that lays itself out by the
  // room it has (a warning with its action) gets the whole line, not the width of its own first line ("Could not
  // check Claude Code on Check again" / "atlas."). Only the inner box's direction changes, so nothing mounts anew.
  const keepsOwnWidth = fieldGroup && !stacked;
  const fills = fieldGroup && stacked && isValidElement(value) && value.type !== Fragment;
  const cell = (
    <Box
      dir="row"
      {...(!stacked ? { grow: 1, shrink: 1, minWidth: 0 } : valueLine ? { grow: 1, shrink: 1, minWidth: 0 } : { shrink: 0 })}
      {...(fieldGroup ? { onSize: onValueRoom } : {})}
    >
      <Box dir={fills ? 'column' : 'row'} grow={1} shrink={keepsOwnWidth ? 0 : 1} {...(keepsOwnWidth ? {} : { minWidth: 0 })} {...(fieldGroup ? { onSize: onValueOwn } : {})}>{hasValue ? value : null}</Box>
    </Box>
  );
  // The action cluster has one element path too, in every form of the row (beside the label, on the value's line,
  // under the value, under a stacked switch row's help): line > FormStateProvider > slot > cluster > actions. It
  // moved between three parents, so a focused Save was mounted anew (and lost the focus) when a resize crossed the
  // stack boundary (56 cells on live). Under a stacked switch row the switch is drawn by the label instead, so its
  // place in the cluster is empty there. The slot is a row of its own, so the cluster is never stretched.
  // Its width is measured beside the label only: under a switch row it holds the actions alone, and that width would
  // let the row come back beside its label and stack again, over and over.
  const measureCluster = useRef(true);
  measureCluster.current = !switchRow;
  const cluster = hasAction && !(switchRow && !actionRow) ? (
    <Box dir="row" gap={2} shrink={0} align="center" wrap onSize={(w: number, h: number) => { if (measureCluster.current) onCluster(w, h); }}>
      {control && !switchRow ? ctl() : null}
      {actionRow}
    </Box>
  ) : null;
  // The line holding the value and the cluster: beside the label it takes the room after the label column; stacked
  // it is the value's line (a row, the actions at its end by the value's first line in a field group, centred
  // elsewhere, as the web's rows) or a column (the actions under the value).
  const lineProps = !stacked
    ? { dir: 'row' as const, grow: 1, shrink: 1, minWidth: 0, gap: ROW_GAP }
    : valueLine
      ? { dir: 'row' as const, shrink: 0, gap: ROW_GAP, justify: 'between' as const, align: fieldGroup ? 'start' as const : 'center' as const }
      : { dir: 'column' as const, shrink: 0 };
  const line = (
    <Box {...lineProps}>
      <FormStateProvider value={lockState}>
        {hasValue ? cell : null}
        {cluster ? <Box dir="row" shrink={0}>{cluster}</Box> : null}
      </FormStateProvider>
    </Box>
  );
  return (
    <Box dir="column" shrink={0} pad={{ top: 1 }} onSize={onSize}>
      {stacked ? (
        <Box dir="column" shrink={0} gap={0}>
          {switchRow && control ? (
            <Box dir="row" shrink={0} gap={ROW_GAP} justify="between" align="start">
              <Box dir="column" grow={1} shrink={1} minWidth={0}>{name}</Box>
              <FormStateProvider value={lockState}>{ctl()}</FormStateProvider>
            </Box>
          ) : name}
          {/* The web's narrow row: the label on its own line, then the value (with the actions at the row's end when
              they share its line). */}
          {line}
        </Box>
      ) : (
        <Box dir="row" shrink={0} gap={ROW_GAP}>
          {name}
          {line}
        </Box>
      )}
      {o && (o.kind !== 'done' || doneShown) ? <Outcome outcome={o} onCheck={onCheck} onStop={onStop} doneText={t('form.saved')} wrap error={error} detail={detail} errorWords={errorWords} /> : null}
      {reveal && open ? (
        <FormStateProvider value={lockState}>
          <RevealEditor reveal={reveal} ids={ids} onClose={() => { refocus.current = true; setOpen(false); }} />
        </FormStateProvider>
      ) : null}
    </Box>
  );
};

/** A label or help: words in a Text; anything else (a page may pass elements that draw boxes) in a row of its own,
 *  never inside a Text. Either way it carries the id a control is named or described by. */
function Words({ id, bold, colour, stack, children }: { id: string; bold?: boolean; colour: Colour; stack?: boolean; children: ReactNode }) {
  const sem = { id, role: 'text' as const, name: plainText(children) };
  if (typeof children === 'string' || typeof children === 'number') return <Text bold={bold} colour={colour} sem={sem}>{String(children)}</Text>;
  // Mixed help (a sentence, then a link) stacks its parts: a row would squeeze the sentence to the link's leftover.
  return <Box dir={stack ? 'column' : 'row'} shrink={1} sem={sem}>{children}</Box>;
}

/** The open editor of a reveal row: the page's fields, then Cancel and Save. Escape cancels while it is open. */
function RevealEditor({ reveal, ids, onClose }: { reveal: Web.SettingReveal; ids: Web.SettingIds; onClose: () => void }) {
  const t = useStrings(strings);
  const { locked } = useFormState();
  const [saving, setSaving] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const cancel = (): void => {
    if (saving) return;
    reveal.onCancel?.();
    onClose();
  };
  const save = (): void => {
    if (locked || saving) return;
    const r = reveal.onSave();
    if (!r || typeof (r as Promise<unknown>).then !== 'function') { onClose(); return; }
    setSaving(true);
    (r as Promise<unknown>).then(
      () => { if (!alive.current) return; setSaving(false); onClose(); },
      () => { if (alive.current) setSaving(false); },
    );
  };
  useKeys((k) => {
    if (k.name !== 'escape') return false;
    cancel();
    return true;
  });
  const body = typeof reveal.editor === 'function' ? reveal.editor(ids) : reveal.editor;
  // As on the web (focusInto when it opens): the focus goes to the editor's first field, else its first button. One
  // frame later, once the fields are laid out (focusFirst goes in reading order).
  const box = useRef<BoxRenderable | null>(null);
  const focus = useFocusControl();
  // The store counts a stop that has no size yet as visible (prim/focus.ts), so one try after this commit finds the
  // editor's first field; never past a focus the person moved meanwhile.
  useEffect(() => {
    const was = focus.current();
    const id = setTimeout(() => { if (alive.current && focus.current() === was) focus.focusFirst(box.current); }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the editor opens
  }, []);
  return (
    <Box boxRef={box} dir="column" shrink={0} border={['left']} borderColour="focus" pad={{ left: 1, top: 1 }} gap={1} sem={{ role: 'group', labelledBy: ids.nameId }}>
      <Box dir="column" shrink={0}>{body}</Box>
      <Box dir="row" gap={2} shrink={0}>
        <Button size="sm" variant="secondary" onPress={cancel} isDisabled={saving}>{t('form.cancel')}</Button>
        <Button size="sm" onPress={save} busy={saving} isDisabled={reveal.canSave === false || locked} literal={reveal.literal}>
          {reveal.saveLabel ?? t('form.save')}
        </Button>
      </Box>
    </Box>
  );
}

/** A setting whose control is a kit Switch, named by the row and described by its help. */
export const SettingSwitch: typeof Web.SettingSwitch = ({ isSelected, onChange, isDisabled, ...row }) => {
  const inGroup = useSettingGroup();
  const body = (
    <GroupRow
      {...row}
      control={(ids) => <Switch labelledBy={ids.nameId} aria-describedby={ids.helpId} isSelected={isSelected} onChange={onChange} isDisabled={isDisabled} />}
    />
  );
  return inGroup ? body : <SettingGroup>{body}</SettingGroup>;
};
