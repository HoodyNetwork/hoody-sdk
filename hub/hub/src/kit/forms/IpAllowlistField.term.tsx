// IpAllowlistField in the terminal: the allow-list TextField, then "Add my IP" and its note. The rules are the web's
// (IpAllowlistField.pure.ts): a read lands only in the lock generation it was asked in and never while locked; an IPv6,
// private or already listed address is shown and never added; one typed into goes in front of what is being typed.
// The address shows as plain text after the note (the web's IpInfo chip adds a flag and place).
import { useLayoutEffect, useRef, useState } from 'react';
import type * as Web from './IpAllowlistField';
import type { IpDetails } from '../data/IpInfo';
import { Box, Text } from '../../term/prim';
import { Button } from '../controls/Button';
import { useStrings } from '../strings';
import { TextField } from './fields';
import { useFieldLock } from './lock';
import { myIpOutcome, withMyIp } from './IpAllowlistField.pure';
import strings from './IpAllowlistField.strings.en.json';

export type { IpAllowlistFieldProps } from './IpAllowlistField';
export { readIpFrom } from './IpAllowlistField.pure';

export const IpAllowlistField: typeof Web.IpAllowlistField = ({ label, description, value, onChange, readIp, errorMessage, multiline, ...hold }) => {
  const locked = hold.isDisabled ?? hold.locked ?? false;
  const t = useStrings(strings);
  const [note, setNote] = useState('');
  const [shown, setShown] = useState<IpDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const isLocked = useFieldLock(locked);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const lockedRef = useRef(isLocked);
  const gen = useRef(0);
  useLayoutEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
    if (isLocked && !lockedRef.current) gen.current++;
    lockedRef.current = isLocked;
  });
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
    <Box dir="column" shrink={0}>
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
      <Box dir="row" gap={1} wrap>
        <Button size="sm" busy={busy} isDisabled={isLocked} onPress={() => void addMyIp()}>{t('ipf.add')}</Button>
        {note ? (
          <Text colour={note === t('ipf.added') ? 'ok' : 'muted'}>
            {note === t('ipf.added') ? '✓ ' : ''}{note}{shown ? <Text colour="ink">{` ${shown.ip}`}{shown.version === 6 ? ' (IPv6)' : ''}</Text> : null}
          </Text>
        ) : null}
      </Box>
    </Box>
  );
};
