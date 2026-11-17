// ComputerPicker: the kit's one control for picking a computer. A trigger that shows
// the picked computer (state dot, colour mark, flag, name, realm), opening PickerPanel in single mode in a Popover (a sheet on a
// phone) with search and keyboard. The popover is wide (up to 640px, never past the screen) and each row is one line:
// dot, colour mark, flag, name, its state when it is not running, then its place and realm at the end.
//
// Contract:
//   - `computers` undefined means still loading; the caller's rows are the truth (never the shell's list). `value`
//     in, `onChange` out: the picker keeps no pick of its own and never touches the shell's current computer, so a
//     pane or a form picks its own.
//   - Picking the row already picked, or closing, changes nothing. A row with `disabledReason` is shown, says why,
//     and never reaches onChange.
//   - The state is a word as well as a dot (the dot is never the only sign); `running` alone colours the dot. A running
//     row draws no state word (the word is still read with the row); every other state is drawn after the name.
//   - Order: the shell's current realm first, then the other realms by first appearance, each under its heading
//     when there is more than one, running computers first in each. Computers in a failed or unknown state
//     (`stateKind` 'attention') sit last in a "Not running (N)" group that starts folded; search reaches them too.
//     A row under its realm's heading draws no realm of its own (the heading names it); the realm stays in the row's
//     text for assistive tech. Every other row draws its realm chip.
//   - A value not among the rows (not listed yet, or gone) shows `placeholder` on the trigger, never a stale name.
//   - Loading (no rows, no error) disables the trigger; a failed read never does: the trigger says so and opens the
//     panel's error with Try again. Disabled (or a saving kit form's lock) also stops a pick from a panel already open.
import { useId, type ReactElement, type ReactNode, type Ref } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { cx } from '../controls/Button';
import { useDisabledPressRef } from '../controls/disabledPress';
import b from '../forms/fieldBox.module.css';
import { fieldWidthClass, type FieldWidth } from '../forms/fields';
import { useFieldLock } from '../forms/lock';
import { ComputerMark } from '../data/ComputerMark';
import type { RealmColor } from '../data/Display';
import { Icon } from '../icons';
import { labelInNameProps } from '../labelInName';
import { Popover, type PopoverWidth } from '../overlays/Popover';
import { useShellData } from '../../shell/context';
import { useStrings } from '../strings';
import { PickerPanel, type PickerItem } from './PickerPanel';
import { arrangeComputers, kindOf, PARKED } from './ComputerPicker.pure';
import { usePickerField } from './PickerField';
import strings from './ComputerPicker.strings.en.json';

export { arrangeComputers } from './ComputerPicker.pure';
import s from './ComputerPicker.module.css';

export interface ComputerChoice {
  /** The value that goes in and out (a computer id or the caller's handle for it). */
  id: string;
  name: string;
  realm?: { name: string; color?: RealmColor };
  /** The computer's colour as the API keeps it: drawn only through ComputerMark, which normalises it, so an
   *  invalid value draws no mark. */
  color?: string;
  /** Colours the state dot. */
  running?: boolean;
  /** The state as words, already in the page's language ("Running", "Stopped"). */
  state?: string;
  /** What the state is, for the order: 'attention' (failed or not known) goes to the folded "Not running" group.
   *  Without it a row counts as running or stopped by `running`. */
  stateKind?: 'running' | 'stopped' | 'starting' | 'attention';
  /** Where it runs ("Singapore · sg-2"). */
  place?: string;
  /** A regional indicator flag (kit countryFlag). */
  flag?: string;
  /** Shown, but not pickable, and says why. */
  disabledReason?: string;
}

export interface ComputerPickerProps {
  /** What the picker is for ("Computer for the left pane"): the list's name, and the trigger's after the words it shows. */
  label: string;
  computers: readonly ComputerChoice[] | undefined;
  value: string | undefined;
  onChange: (id: string) => void;
  /** The trigger's text with no computer picked. */
  placeholder?: string;
  /** The list could not be read: the panel shows it with Try again; rows already read stay. */
  status?: { error?: unknown; onRetry?: () => void };
  isDisabled?: boolean;
  className?: string;
  /** 'toolbar': the trigger is a toolbar control (`--tb-ctl-h`: 40, or 32 inside a `data-tb-size="32"` scope; 44 on a
   *  coarse pointer), as the Files rail asks. 'md' (default) is a field (`--ctl-h-md`). */
  size?: 'md' | 'toolbar';
}

// ── Shared pieces (ProjectPicker and ProgramPicker build on them) ────────────────────────────────

export interface PickerTriggerProps {
  /** What the trigger is for ("Computer in the Left pane"), never the pick. The accessible name is the shown words
   *  (the text, the tail, the spoken state), then this label (WCAG 2.5.3 Label in Name); inside a PickerField the
   *  field's visible label takes its place. */
  label: string;
  /** A decorative mark before the text (a state dot, a flag). */
  lead?: ReactNode;
  /** What is picked, or the placeholder / loading words. */
  text: ReactNode;
  /** `text` is a placeholder (nothing picked): drawn faint. */
  placeholder?: boolean;
  /** Words for assistive tech only, read after the text and the tail (a state the lead shows as a dot). */
  spoken?: string;
  /** A short tail after the text (a realm chip); never cut, the text gives way first. */
  tail?: ReactNode;
  isDisabled?: boolean;
  className?: string;
  width?: FieldWidth;
  /** The button itself, so a page can focus it without searching the DOM. */
  triggerRef?: Ref<HTMLButtonElement>;
}

/** The kit's field-sized picker trigger: a pressable for a Popover, with a caret. Use it as PickerPopover's trigger. */
export function PickerTrigger({ label, lead, text, placeholder, spoken, tail, isDisabled, className, width, triggerRef }: PickerTriggerProps) {
  const textId = useId();
  const selfId = useId();
  // The name starts with the words the trigger shows (the pick, its realm, its state), then says what it is for: the
  // PickerField's visible label inside one, else `label`, read from the trigger's own aria-label through its own id
  // (so the label is spoken, never drawn). The field's description and error describe it.
  const field = usePickerField();
  // The trigger is disabled while its rows load (and by a form's lock) and enabled in place.
  const pressRef = useDisabledPressRef(triggerRef);
  return (
    <AriaButton
      ref={pressRef}
      id={selfId}
      className={cx(b.box, s.trigger, fieldWidthClass(width), className)}
      {...labelInNameProps({ shownId: textId, selfId, label, labelId: field?.labelId })}
      aria-describedby={field?.describedBy}
      data-invalid={field?.invalid || undefined}
      isDisabled={isDisabled}
    >
      {lead}
      <span id={textId} className={s.text}>
        <span className={cx(s.name, placeholder && s.placeholder)}>{text}</span>
        {/* Spaces between the parts keep their words apart in the text tools read (Label in Name); a flex box draws none.
            The spoken state comes after the tail, so the drawn words (text, then tail) stay together at the name's start. */}
        {tail ? <>{' '}{tail}</> : null}
        {spoken ? <>{' '}<span className={s.srOnly}>{spoken}</span></> : null}
      </span>
      <Icon name="chevron-down" size="sm" className={s.caret} />
    </AriaButton>
  );
}

/** A picker's popover: the kit Popover at picker width (or another), a sheet on a phone. `children` gets `close`. */
export function PickerPopover({ trigger, label, width = 'picker', children }: { trigger: ReactElement; label: string; width?: PopoverWidth; children: (close: () => void) => ReactNode }) {
  return (
    <Popover trigger={trigger} label={label} width={width} phone="sheet">
      {children}
    </Popover>
  );
}

/** A realm's colour square and name, as a picker trigger's tail or anywhere a realm is named in one line. */
export function RealmChip({ realm }: { realm: { name: string; color?: RealmColor } }) {
  return (
    <span className={s.realm}>
      <span className={s.realmSquare} style={realm.color ? { background: `var(--hx-r-${realm.color})` } : undefined} aria-hidden="true" />
      <span className={s.realmName}>{realm.name}</span>
    </span>
  );
}

/** A small square in a colour the caller gives as CSS (a project's own colour), or nothing without one. Its own piece
 *  so the terminal (ComputerPicker.term.tsx) draws a swatch: the colour is an inline style, which draws nothing there. */
export function ColourSquare({ color }: { color?: string }) {
  return color ? <span className={s.realmSquare} style={{ background: color }} aria-hidden="true" /> : null;
}

function Lead({ c }: { c: ComputerChoice }) {
  return (
    <span className={s.lead} aria-hidden="true">
      <span className={cx(s.dot, c.running && s.dotOn)} />
      <ComputerMark color={c.color} />
      {c.flag ? <span className={s.flag}>{c.flag}</span> : null}
    </span>
  );
}

/** A row's end: where it runs and its realm. Words only assistive tech reads: a running row's state, and the realm of
 *  a row under its realm's heading (`underRealm`, where the heading already shows it). */
function Aside({ c, underRealm }: { c: ComputerChoice; underRealm?: boolean }) {
  return (
    <>
      {kindOf(c) === 'running' && c.state ? <span className={s.srOnly}>{c.state}</span> : null}
      {c.place ? <span>{c.place}</span> : null}
      {c.realm ? (underRealm ? <span className={s.srOnly}>{c.realm.name}</span> : <RealmChip realm={c.realm} />) : null}
    </>
  );
}

export function ComputerPicker({ label, computers, value, onChange, placeholder, status, isDisabled: disabledProp, className, size = 'md' }: ComputerPickerProps) {
  const t = useStrings(strings);
  const isDisabled = useFieldLock(disabledProp);
  const failed = !!status?.error;
  const shell = useShellData();
  const current = shell.realms.find((r) => r.id === shell.realmId)?.name;
  const picked = computers?.find((c) => c.id === value);
  const words = { notRunning: t('notRunning'), noRealm: t('noRealm') };
  const items: PickerItem[] | undefined = computers && arrangeComputers(computers, current, words).map(({ c, group, groupLabel, underRealm }) => ({
    id: c.id,
    label: c.name,
    ...(kindOf(c) !== 'running' && c.state ? { note: c.state } : {}),
    aside: <Aside c={c} underRealm={underRealm} />,
    keywords: [c.place, c.realm?.name, c.state].filter((w): w is string => !!w),
    ...(group ? { group, groupLabel } : {}),
    lead: <Lead c={c} />,
    isDisabled: !!c.disabledReason,
    disabledReason: c.disabledReason,
  }));
  const trigger = (
    <PickerTrigger
      label={label}
      className={cx(size === 'toolbar' && s.toolbar, className)}
      isDisabled={isDisabled || (!computers && !failed)}
      lead={picked ? <Lead c={picked} /> : undefined}
      text={picked ? picked.name : !computers ? t(failed ? 'failed' : 'loading') : placeholder ?? t('placeholder')}
      placeholder={!picked}
      spoken={picked?.state}
      tail={picked?.realm ? <RealmChip realm={picked.realm} /> : undefined}
    />
  );
  return (
    <PickerPopover trigger={trigger} label={label} width="wide">
      {(close) => (
        <PickerPanel
          label={label}
          items={items}
          mode="single"
          isDisabled={isDisabled}
          value={picked ? [picked.id] : []}
          searchable
          searchLabel={t('search')}
          emptyText={t('empty')}
          collapsible={[PARKED]}
          keepOrder
          status={status?.error ? { error: status.error, onRetry: status.onRetry, title: t('failed') } : undefined}
          onChange={(ids) => {
            const id = ids[0];
            if (isDisabled) return;
            if (id !== undefined && id !== picked?.id) onChange(id);
            close();
          }}
        />
      )}
    </PickerPopover>
  );
}
