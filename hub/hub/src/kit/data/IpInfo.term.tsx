// Terminal IpInfo: "FR 203.0.113.7 · Paris, Île-de-France [Copy] [Details]". The country is its two-letter code, never
// the emoji flag (a regional-indicator pair is a wide emoji cell). Details opens a panel on the overlay layer with the
// same rows and marks as the web's tooltip/popover; Escape or a press outside closes it.
import { useState } from 'react';
import { Box, Pressable, Text } from '../../term/prim';
import { Layer, useAnchor } from '../../term/prim/Overlay';
import { cellWidth } from '../../term/prim/TableCells';
import { LOCALE, useStrings } from '../strings';
import { CopyButton } from './Ids';
import type * as Web from './IpInfo';
import strings from './IpInfo.strings.en.json';
import { focusInk } from '@term/kit';

export { ipDetailsFrom, type IpDetails } from './ipDetails';
export type { IpInfoProps } from './IpInfo';

function countryName(cc: string): string {
  try {
    return new Intl.DisplayNames([LOCALE], { type: 'region' }).of(cc) ?? cc;
  } catch {
    return cc;
  }
}

export const IpInfo: typeof Web.IpInfo = ({ details: d, note }) => {
  const t = useStrings(strings);
  const [open, setOpen] = useState(false);
  const anchor = useAnchor();
  const country = d.country ? countryName(d.country) : undefined;
  const place = [d.city, d.region && d.region !== d.city ? d.region : undefined].filter(Boolean).join(', ');
  const rows: Array<[string, string]> = [];
  const add = (k: Parameters<typeof t>[0], v: string | undefined) => { if (v) rows.push([t(k), v]); };
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
  const labelW = Math.max(0, ...rows.map(([k]) => cellWidth(k)));
  const width = Math.min(60, Math.max(28, labelW + 2 + Math.max(0, ...rows.map(([, v]) => cellWidth(v))), ...marks.map((m) => cellWidth(m) + 2)) + 4);
  const label = t('ip.details', { ip: d.ip });
  return (
    <Box dir="row" gap={1} shrink={1} minWidth={0}>
      {d.country ? <Text colour="muted" shrink={0}>{d.country}</Text> : null}
      <Text shrink={0}>{d.ip}</Text>
      {place ? <Text colour="muted" shrink={1} maxLines={1}>{`· ${place}`}</Text> : null}
      <CopyButton text={d.ip} label={t('ip.copy', { ip: d.ip })} />
      <Box dir="row" shrink={0} boxRef={anchor.ref}>
        <Pressable dir="row" onPress={() => setOpen((o) => !o)} sem={{ name: label, expanded: open }}>
          {({ focused }) => <Text colour="blueText" {...focusInk(focused)}>{'(i)'}</Text>}
        </Pressable>
      </Box>
      <Layer open={open} kind="popover" place={{ at: 'anchor', anchor: anchor.rect, side: 'bottom', align: 'start', width }} initialFocus="none" padX={1} onEscape={() => setOpen(false)} onOutside={() => setOpen(false)}>
        <Box dir="column" sem={{ role: 'dialog', name: label }}>
          {rows.map(([k, v]) => (
            <Box key={k} dir="row">
              <Box width={labelW + 2} shrink={0}><Text colour="muted">{k}</Text></Box>
              <Text shrink={1}>{v}</Text>
            </Box>
          ))}
          {marks.map((m) => <Text key={m}>{`• ${m}`}</Text>)}
          {typeof note === 'string' ? <Text colour="muted">{note}</Text> : note ? <Box dir="row">{note}</Box> : null}
        </Box>
      </Layer>
    </Box>
  );
};
