// ComputerPicker in the terminal (the web's ComputerPicker.tsx; same contract, same order rules in ComputerPicker.pure.ts),
// and the pieces ProjectPicker and ProgramPicker build on.
//   - PickerTrigger: a field-like control `│ lead text tail ▾`; Enter, Space, ↓ or a click opens its popover. Named as
//     on the web: the shown words (text, tail, spoken state), then what it is for (the PickerField's label, else
//     `label`). A placeholder is faint; disabled is faint and inert.
//     In a row too short for it (the Files bar at 80 columns) the name gives way first, down to four cells, as on the
//     web (.name min-width 4ch); then the tail goes whole and the name takes its room back. The web cuts the realm's
//     name down to its square there; half a chip in one line of text reads as noise, and the shell's header names the
//     realm. Lead and ▾ always stay.
//   - PickerPopover: the kit Popover (overlay Layer) at its width, anchored to the trigger and clamped to the screen;
//     a narrow terminal keeps it anchored (no phone sheet: Popover.term's rule).
//   - RealmChip: the realm's colour as a swatch (prim FieldSwatch; nothing in mono) and its name, never one alone.
//   - A row: state dot ● running / ○ not (the state word is drawn for every state but running, so the dot is never the
//     only sign), the computer's colour (ComputerMark), its country as letters (never the emoji flag), the name, then
//     the place and realm at the line's end.
import { isValidElement, useContext, useState, type ReactNode } from 'react';
import type * as Web from './ComputerPicker';
import { Box, Pressable, Text, useBoxSize } from '../../term/prim';
import { cellWidth } from '../../term/prim/TableCells';
import { FieldSwatch } from '../../term/prim/FieldSwatch';
import { realmHex } from '../../term/shell/realmColour';
import { ComputerMark } from '../data/ComputerMark';
import { CountryFlag } from '../controls/CountryFlag';
import { ControlRow } from '../forms/termField';
import { useFieldLock } from '../forms/lock';
import { Popover } from '../overlays/Popover';
import { useShellData } from '../../shell/context';
import { useStrings } from '../strings';
import { PickerPanel, type PickerItem } from './PickerPanel';
import { usePickerField } from './PickerField';
import { PickerFieldWords } from './pickerFieldWords';
import { arrangeComputers, flagCode, kindOf, PARKED } from './ComputerPicker.pure';
import strings from './ComputerPicker.strings.en.json';

export type { ComputerChoice, ComputerPickerProps, PickerTriggerProps } from './ComputerPicker';
export { arrangeComputers } from './ComputerPicker.pure';

/** The words a trigger part shows, for its name: text as it is; an element's string children; a RealmChip's realm. */
function words(n: ReactNode): string {
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(words).filter(Boolean).join(' ');
  if (isValidElement<{ children?: ReactNode; realm?: { name?: string } }>(n)) return n.props.realm?.name ?? words(n.props.children);
  return '';
}

/** The name keeps this many cells before the tail goes (the web's `.name { min-width: 4ch }`). */
const NAME_MIN = 4;

export const PickerTrigger: typeof Web.PickerTrigger = (props) => {
  const { label, lead, text, placeholder, spoken, tail, isDisabled } = props;
  // Popover.term's opener arrives as the trigger's press (as React Aria's DialogTrigger gives its button one).
  const open = (props as { onPress?: () => void }).onPress;
  const field = usePickerField();
  const fw = useContext(PickerFieldWords);
  const shown = [words(text), words(tail), spoken].filter(Boolean).join(' ');
  const name = `${shown} ${fw?.label ?? label}`.trim();
  const description = fw ? [fw.error, fw.description].map(words).find(Boolean) : undefined;
  // The room rule needs the trigger's width as the row gives it and the widths of its parts as they are when whole:
  // the lead and the tail are measured (the tail only while it is drawn, kept per its words), the name is counted.
  const [size, onSize] = useBoxSize();
  const [leadSize, onLead] = useBoxSize();
  const tailKey = words(tail);
  const [tailW, setTailW] = useState<{ key: string; w: number } | null>(null);
  const nameW = typeof text === 'string' ? cellWidth(text) : null;
  const tailWhole = tail === undefined ? 0 : tailW?.key === tailKey ? tailW.w : null;
  const leadWhole = lead === undefined ? 0 : leadSize?.width ?? null;
  // │, its space, the parts with one cell between them, ▾.
  const whole = nameW === null || tailWhole === null || leadWhole === null ? null : 2 + (lead !== undefined ? leadWhole + 1 : 0) + nameW + (tail !== undefined ? 1 + tailWhole : 0) + 2;
  const nameMin = Math.min(NAME_MIN, nameW ?? 0);
  const showTail = tail !== undefined && (whole === null || !size || size.width >= whole - (nameW ?? 0) + nameMin);
  return (
    <Pressable
      dir="row"
      shrink={1}
      // Its whole width stays its basis while the tail is out, so the tail comes back when the row has room again.
      {...(whole !== null ? { basis: whole } : {})}
      onSize={onSize}
      disabled={isDisabled}
      focusPaint={false}
      onPress={() => open?.()}
      onKey={(k) => { if (k.name === 'down' || k.name === 'up') { open?.(); return true; } return false; }}
      sem={{ role: 'button', name, popup: 'dialog', ...(description ? { description } : {}), ...(field?.invalid ? { invalid: true } : {}) }}
    >
      {({ focused }) => (
        <ControlRow focused={focused} invalid={field?.invalid} disabled={isDisabled}>
          {lead !== undefined ? <Box dir="row" gap={1} shrink={0} onSize={onLead} sem={{ hidden: true }}>{lead}</Box> : null}
          {/* It gives way first and takes the whole cut (shrink 1000): the words and marks around it keep their cells. */}
          {/* With the tail out it takes the room left, so ▾ stays at the field's end (the web's caret). */}
          <Box shrink={1000} grow={showTail ? 0 : 1} minWidth={nameMin}><Text truncate colour={isDisabled || placeholder ? 'faint' : 'ink'} bold={focused}>{text}</Text></Box>
          {/* A "·" before the tail: on the web the tail is a chip of its own; in one row of text
              "atlas █ Personal ▾" would read as a second dropdown. One ▾ stays, at the end. */}
          {showTail ? <Box dir="row" gap={1} shrink={0} onSize={(w) => setTailW((o) => (o && o.key === tailKey && o.w === w ? o : { key: tailKey, w }))} sem={{ hidden: true }}><Text colour="faint">·</Text>{tail}</Box> : null}
          <Box shrink={0}><Text colour="faint">▾</Text></Box>
        </ControlRow>
      )}
    </Pressable>
  );
};

// The trigger gives way in a short row (its name cuts with "…", then the tail goes; lead and ▾ stay): the web's Files bar
// `.bar > .picker { flex: 0 100 auto }`. Read by Popover.term's anchor.
(PickerTrigger as { hxGivesWay?: boolean }).hxGivesWay = true;

export const PickerPopover: typeof Web.PickerPopover = ({ trigger, label, width = 'picker', children }) => (
  <Popover trigger={trigger} label={label} width={width} phone="sheet">
    {children}
  </Popover>
);

export const RealmChip: typeof Web.RealmChip = ({ realm }) => {
  const hex = realmHex(realm.color);
  return (
    <Box dir="row" gap={1} shrink={0}>
      {hex ? <FieldSwatch value={hex} cells={1} /> : null}
      <Text colour="muted">{realm.name}</Text>
    </Box>
  );
};

/** The web's small colour square (a project's own colour): one swatch cell (prim FieldSwatch: nothing in mono, and
 *  nothing for a colour that is not a hex). */
export const ColourSquare: typeof Web.ColourSquare = ({ color }) => <FieldSwatch value={color} cells={1} />;

function Lead({ c }: { c: Web.ComputerChoice }) {
  const code = flagCode(c.flag);
  return (
    <Box dir="row" gap={1} shrink={0}>
      <Text colour={c.running ? 'ok' : 'faint'}>{c.running ? '●' : '○'}</Text>
      <ComputerMark color={c.color} />
      {code ? <CountryFlag code={code} /> : null}
    </Box>
  );
}

function Aside({ c, underRealm }: { c: Web.ComputerChoice; underRealm?: boolean }) {
  return (
    <Box dir="row" gap={2} shrink={0}>
      {c.place ? <Text colour="muted">{c.place}</Text> : null}
      {c.realm && !underRealm ? <RealmChip realm={c.realm} /> : null}
    </Box>
  );
}

export const ComputerPicker: typeof Web.ComputerPicker = ({ label, computers, value, onChange, placeholder, status, isDisabled: disabledProp }) => {
  const t = useStrings(strings);
  const isDisabled = useFieldLock(disabledProp);
  const failed = !!status?.error;
  const shell = useShellData();
  const current = shell.realms.find((r) => r.id === shell.realmId)?.name;
  const picked = computers?.find((c) => c.id === value);
  const groupWords = { notRunning: t('notRunning'), noRealm: t('noRealm') };
  const items: PickerItem[] | undefined = computers && arrangeComputers(computers, current, groupWords).map(({ c, group, groupLabel, underRealm }) => ({
    id: c.id,
    label: c.name,
    // Every state but running is drawn after the name; a running row's state is still in its text (its name).
    ...(c.state && kindOf(c) !== 'running' ? { note: c.state } : {}),
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
};
