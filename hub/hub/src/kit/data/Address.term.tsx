// A program's web address in the terminal. On screen only its masked form (core maskAddress); Copy takes the whole
// address. The address is never cut: it wraps whole onto the lines it needs. One it may open is the kit's ExtLink (a
// terminal hyperlink: a click opens it; a secret-shaped one shows only its scheme). No QR code in a terminal.
import type * as Web from './Address';
import { maskAddress } from '@core';
import { Box, Text } from '../../term/prim';
import { cleanText } from '../../term/prim/TableCells';
import { useStrings } from '../strings';
import { CopyButton } from './Ids';
import { ExtLink, holdsId, secretShape, webAddress } from '../controls/Link';
import strings from './Address.strings.en.json';

export type { AddressFieldProps, AddressRowProps } from './Address';
export { webAddress } from '../controls/Link';


/** The masked address, whole (it wraps, never cut). One it may open is the kit's ExtLink, as on the web: a secret-shaped
 *  address shows only its scheme and bullets, `name` is its spoken name, a press opens it. */
export const AddressText: typeof Web.AddressText = ({ url, open, name }) => (open && webAddress(url)
  ? <ExtLink url={url} look="nav" icon={false} {...(name !== undefined ? { name } : {})} />
  : <Text colour="ink">{cleanText(maskAddress(url))}</Text>);

export const AddressField: typeof Web.AddressField = ({ url, label }) => {
  const t = useStrings(strings);
  if (!url) return <Text colour="faint">—</Text>;
  return (
    <Box dir="row" gap={2} shrink={1}>
      <Box shrink={1}><AddressText url={url} open name={label} /></Box>
      <CopyButton text={url} label={t('address.copy', { what: label })} />
    </Box>
  );
};

/** The address is one ExtLink shows as scheme and bullets (it may be opened and holds an access id): a short fixed label. */
const drawnAsMask = (url: string, open: boolean | undefined): boolean => {
  const web = open ? webAddress(url) : null;
  return !!web && (secretShape(web) || holdsId(web));
};

export const AddressList: typeof Web.AddressList = ({ label, children }) => <Box dir="column" shrink={0} sem={{ role: 'list', ...(label !== undefined ? { name: label } : {}) }}>{children}</Box>;

/** Name, address and actions on one line while they fit; else the address takes its own line under the name. */
export const AddressRow: typeof Web.AddressRow = ({ name, url, open, label, actions }) => (
  <Box dir="row" gapX={2} gapY={0} shrink={0} wrap>
    <Box dir="row" shrink={0}>{typeof name === 'string' ? <Text colour="ink" bold>{cleanText(name)}</Text> : name}</Box>
    {/* An address drawn as its mask ("https://••••") never gives way: it would break at its slash. The actions wrap first. */}
    <Box dir="row" shrink={drawnAsMask(url, open) ? 0 : 1} grow={1}><AddressText url={url} open={open} {...(label !== undefined ? { name: label } : {})} /></Box>
    {/* The web's .rowActions wrap (flex-wrap): five actions (Files on Computers Connect: 72 cells) wrap inside a 58-cell
        row instead of running past the edge. maxWidth bounds the box so it can wrap at all. */}
    {actions ? <Box dir="row" gapX={2} shrink={0} maxWidth="100%" wrap>{actions}</Box> : null}
  </Box>
);
