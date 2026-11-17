// IpInfo: an IP address with its place at a glance, shared by Keys, Bots and Computers. The flag is the ISO country
// code drawn as regional-indicator emoji (no image fetch); where the system does not draw flags (Windows draws two
// letters), the code shows as text. Only the fields GET /api/v1/ip gives are shown; ipDetailsFrom() reads them from
// its answer and drops anything missing or of the wrong type.
import { type ReactNode, useMemo } from 'react';
import { Dialog as AriaDialog, DialogTrigger, Popover as AriaPopover } from 'react-aria-components';
import { IconButton, cx } from '../controls/Button';
import { countryFlag } from '../format';
import { LOCALE, useStrings } from '../strings';
import { CopyButton } from './Ids';
import strings from './IpInfo.strings.en.json';
import pop from '../overlays/Popover.module.css';
import s from './IpInfo.module.css';
import type { IpDetails } from './ipDetails';

export { ipDetailsFrom, type IpDetails } from './ipDetails';

let flagCache: boolean | null = null;
/** Whether this system draws a flag for a regional-indicator pair: one glyph, narrower than its two letters. */
function flagsDraw(): boolean {
  if (flagCache !== null) return flagCache;
  try {
    const ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    if (!ctx) return (flagCache = false);
    ctx.font = '16px sans-serif';
    const pair = ctx.measureText('\u{1F1EB}\u{1F1F7}').width;
    const one = ctx.measureText('\u{1F1EB}').width;
    flagCache = pair > 0 && pair < one * 1.5;
  } catch {
    flagCache = false;
  }
  return flagCache;
}

function countryName(cc: string): string {
  try {
    return new Intl.DisplayNames([LOCALE], { type: 'region' }).of(cc) ?? cc;
  } catch {
    return cc;
  }
}

export interface IpInfoProps {
  details: IpDetails;
  /** A line under the details for this page (e.g. "allow lists take IPv4 only"). */
  note?: ReactNode;
  /** 'auto' (default) draws the emoji flag only where the system draws flags; tests and stories pick one. */
  flags?: 'auto' | 'emoji' | 'code';
  className?: string;
}

/** An IP address as one inline chip: flag or country code, the address, its place, Copy, and a details button whose
 * every detail shows on hover or keyboard focus (a tooltip) and on a press (a popover: tap, click, Enter). */
export function IpInfo({ details: d, note, flags = 'auto', className }: IpInfoProps) {
  const t = useStrings(strings);
  const country = d.country ? countryName(d.country) : undefined;
  const emoji = flags === 'emoji' || (flags === 'auto' && flagsDraw());
  const place = [d.city, d.region && d.region !== d.city ? d.region : undefined].filter(Boolean).join(', ');
  const label = t('ip.details', { ip: d.ip });
  const body = useMemo(() => {
    const rows: Array<[string, string]> = [];
    const add = (k: Parameters<typeof t>[0], v: string | undefined) => v && rows.push([t(k), v]);
    add('ip.city', d.city);
    add('ip.region', d.region);
    add('ip.country', country);
    add('ip.postal', d.postal);
    add('ip.timezone', d.timezone);
    add('ip.loc', d.loc);
    add('ip.hostname', d.hostname);
    add('ip.network', [d.network?.asn, d.network?.name].filter(Boolean).join(' ') || undefined);
    add('ip.networkDomain', d.network?.domain);
    add('ip.networkType', d.network?.type);
    const marks = [
      d.version === 4 ? t('ip.v4') : d.version === 6 ? t('ip.v6') : null,
      d.hosting ? t('ip.hosting') : null,
      d.mobile ? t('ip.mobile') : null,
      d.anonymous ? t('ip.anonymous') : null,
      d.satellite ? t('ip.satellite') : null,
      d.anycast ? t('ip.anycast') : null,
    ].filter((x): x is string => x !== null);
    return (
      <>
        {rows.length > 0 && (
          <dl className={s.list}>
            {rows.map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {marks.length > 0 && (
          <ul className={s.marks}>
            {marks.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        {note && <p className={s.note}>{note}</p>}
      </>
    );
  }, [d, country, note, t]);
  return (
    <span className={cx(s.chip, className)}>
      {d.country && (
        <span role="img" aria-label={country} className={emoji ? s.flag : s.code}>
          {emoji ? countryFlag(d.country) : d.country}
        </span>
      )}
      <span className={s.ip}>{d.ip}</span>
      {place && <span className={s.place}>· {place}</span>}
      <CopyButton text={d.ip} label={t('ip.copy', { ip: d.ip })} />
      {/* The kit IconButton: its look, ring and coarse reach; the details are its tooltip body and, pressed, a popover. */}
      <DialogTrigger>
        <IconButton icon="info" size="sm" label={label} tooltip={<div className={s.tip}>{body}</div>} tooltipPlacement="top" />
        <AriaPopover placement="bottom start" offset={8} className={cx(pop.popover, pop.sm)}>
          <AriaDialog className={pop.dialog} aria-label={label}>
            {body}
          </AriaDialog>
        </AriaPopover>
      </DialogTrigger>
    </span>
  );
}
