// An allowed-addresses field: one entry per line or comma, each checked on its own, plus "Add my IP":
// the kit IpAllowlistField, the one Add my IP field on every page, with this page's GET /ip read. The address read
// shows with its place after it is added; the person removes it if it is not theirs.
import { IpAllowlistField, readIpFrom, useStrings } from '@kit';
import { useMyIp } from '../data';
import { ALLOWLIST_MAX, parseAllowlist, type IpProblemCode } from '@core';
import strings from '../strings.en.json';

const PROBLEM_KEY: Record<IpProblemCode, 'ip.err.ipv6' | 'ip.err.bad_ip' | 'ip.err.bad_prefix' | 'ip.err.host_bits'> = {
  ipv6: 'ip.err.ipv6',
  bad_ip: 'ip.err.bad_ip',
  bad_prefix: 'ip.err.bad_prefix',
  host_bits: 'ip.err.host_bits',
};

export function IpField({ value, onChange, locked = false }: { value: string; onChange: (next: (cur: string) => string) => void; locked?: boolean }) {
  const t = useStrings(strings);
  const me = useMyIp(false);
  const parsed = parseAllowlist(value);
  const problems = [...parsed.errors.map((e) => t(PROBLEM_KEY[e.code], { entry: e.entry })), ...(parsed.tooMany ? [t('ip.tooMany', { max: ALLOWLIST_MAX })] : [])];
  // Read only on a press; a failed read is no address, also over an earlier answer the query still holds.
  const readIp = readIpFrom(me);
  return (
    <IpAllowlistField
      label={t('ip.label')}
      description={t('ip.help', { max: ALLOWLIST_MAX })}
      multiline
      value={value}
      onChange={onChange}
      readIp={readIp}
      errorMessage={problems.length > 0 ? problems.join(' ') : undefined}
      isDisabled={locked}
    />
  );
}
