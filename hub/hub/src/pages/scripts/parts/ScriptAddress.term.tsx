// ScriptAddress in the terminal: the same address said once, with the web's words and order: what it is for, then the
// whole address with Copy (and Open where the caller asks and the address opens as it is), then what the exec-1 part is.
// The address wraps on its own; Copy and Open never shrink.
import { AddressText, CopyButton, Link, useStrings } from '@kit';
import { Box, Text } from '@term/prim';
import type * as Web from './ScriptAddress';
import strings from '../strings.en.json';
import { fullAddress, opensAsIs } from './ScriptAddress.pure';

export { fullAddress, opensAsIs } from './ScriptAddress.pure';

export const ScriptAddress: typeof Web.ScriptAddress = ({ origin, path, label, explain = true, open = false }) => {
  const t = useStrings(strings);
  const url = fullAddress(origin, path);
  return (
    <Box dir="column" shrink={0}>
      {explain ? <Text colour="muted">{t('address.what')}</Text> : null}
      <Box dir="row" gap={1}>
        <AddressText url={url} />
        <CopyButton text={url} label={t('address.copyWhat', { what: label })} />
        {open && opensAsIs(origin, path) ? <Box shrink={0}><Link href={url} variant="nav">{t('address.open')}</Link></Box> : null}
      </Box>
      {origin ? <Text colour="faint">{t('address.where')}</Text> : null}
    </Box>
  );
};
