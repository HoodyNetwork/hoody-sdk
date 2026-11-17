// IpAllowlistField: the one IPv4 allow-list field, with Add my IP on every such field,
// used by Keys (New key / Edit, Share realm), Computers (Firewall) and Bots (public access). The page gives readIp, its
// own read of GET /ip, so each page keeps its own query and fixtures. The button only fills the field: nothing is sent
// until the person presses the form's own Save or Share. The address read shows as a kit IpInfo chip; an IPv6, private
// or already listed address is shown and never added.
import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../controls/Button';
import { IpInfo, type IpDetails } from '../data/IpInfo';
import { useStrings } from '../strings';
import { TextField } from './fields';
import { useFieldLock } from './lock';
import strings from './IpAllowlistField.strings.en.json';
import { myIpOutcome, withMyIp } from './IpAllowlistField.pure';
import s from './IpAllowlistField.module.css';

interface IpAllowlistFieldBaseProps {
  label: string;
  description: string;
  value: string;
  /** Takes an updater: a read that lands works on the field as it is then, never on the value it started from. The
   *  field calls the onChange of the latest render, so a page may also apply it to its current value
   *  (`(up) => set(up(value))`). */
  onChange: (next: (cur: string) => string) => void;
  /** This page's read of the caller's address; null when it could not be read. */
  readIp: () => Promise<IpDetails | null>;
  errorMessage?: string;
  multiline?: boolean;
}

/** The hold is required: a page states whether its form is sending (or admitting). While held nothing changes the
 *  field, neither typing nor a read that lands. An enclosing Form's lock (a send in flight, or an outcome not yet
 *  known) does the same. */
type IpAllowlistHold =
  | { isDisabled: boolean; locked?: never }
  | {
      /** @deprecated The same hold under its earlier name; pass `isDisabled`. */
      locked: boolean;
      isDisabled?: never;
    };

export type IpAllowlistFieldProps = IpAllowlistFieldBaseProps & IpAllowlistHold;

export { readIpFrom } from './IpAllowlistField.pure';

export function IpAllowlistField({ label, description, value, onChange, readIp, errorMessage, multiline, ...hold }: IpAllowlistFieldProps) {
  const locked = hold.isDisabled ?? hold.locked ?? false;
  const t = useStrings(strings);
  const [note, setNote] = useState('');
  // The address the note is about, shown as a kit IpInfo chip (flag, place, details) after the note.
  const [shown, setShown] = useState<IpDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const isLocked = useFieldLock(locked);
  // The value, onChange and lock as last committed (an await reads them after the person may have typed). They are
  // synced in a layout effect, never during render: a render React drops (a suspended transition) must not supply them.
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  // Each lock starts a new generation: a read lands only in the generation it was asked in, and never while locked.
  const lockedRef = useRef(isLocked);
  const gen = useRef(0);
  useLayoutEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
    if (isLocked && !lockedRef.current) gen.current++;
    lockedRef.current = isLocked;
  });
  // Whether the person is typing in the list: a read that lands then goes in front of what they typed, with its
  // separator, so the rest of an address they are typing stays at the end, where their next keys go.
  const focused = useRef(false);

  const addMyIp = async () => {
    setBusy(true);
    setNote('');
    setShown(null);
    const asked = gen.current;
    const me = await readIp().catch(() => null);
    setBusy(false);
    if (lockedRef.current || gen.current !== asked) return;
    const out = myIpOutcome(me, valueRef.current);
    if (out.show && me) setShown(me);
    if (out.note === 'added' && me) onChangeRef.current((cur) => withMyIp(cur, me.ip, focused.current));
    setNote(t(`ipf.${out.note}`));
  };

  return (
    <div className={s.field}>
      <TextField
        label={label}
        description={description}
        value={value}
        onChange={(v) => { if (!lockedRef.current) onChange(() => v); }}
        onFocusChange={(f) => { focused.current = f; }}
        errorMessage={errorMessage}
        mono
        multiline={multiline}
        rows={multiline ? 3 : undefined}
        isDisabled={isLocked}
        placeholder="203.0.113.7, 198.51.100.0/24"
      />
      <div className={s.row}>
        <Button size="sm" icon="ip" busy={busy} isDisabled={isLocked} onPress={() => void addMyIp()}>
          {t('ipf.add')}
        </Button>
        {note && (
          <span
            className={s.note}
            role="status" // reason: live note after Add my IP
          >
            <span>{note}</span>
            {shown && <> <IpInfo details={shown} /></>}
          </span>
        )}
      </div>
    </div>
  );
}
