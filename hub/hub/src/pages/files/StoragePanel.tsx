// Files' Storage tab: the storage feature (./storage)
// for the computer pane A shows (named in the page subtitle, view.tsx). The computer page shows the same StorageTab component on its detail (through
// ./links.ts), with the same write rule: changes need an account session (a token session only reads storage; the
// computer page's canWrite is all caps or 'account', which is useCan('account')).
import { EmptyState, Stack, useSearch, useSearchParam, useStrings } from '@kit';
import { useCan } from '@core';
import type { FilesComputers } from './data';
import { paneComputer, panesOf } from './logic';
import { StorageTab, useDisk } from './storage';
import { SHARE_PARAM } from './shares/entry';
import { sharesUiOn } from './shares/flag';
import { SharesSection } from './shares/SharesSection';
import strings from './transfers/transfers.strings.en.json';

export function StoragePanel({ computers }: { computers: FilesComputers }) {
  const t = useStrings(strings);
  const search = useSearch();
  const canWrite = useCan('account');
  // A folder's "Share with another computer…" lands here with the folder to share; the key goes once the dialog closes.
  const [share, setShare] = useSearchParam(SHARE_PARAM);
  // Pane A's computer as Browse resolves it: by the id its address carries, else the only one with its handle.
  const c = paneComputer(computers.rows ?? [], panesOf(search).a);
  if (!c) return <EmptyState size="sm" icon="computer" title={t('storage.pick.title')} body={t('storage.pick.body')} />;
  return (
    <Stack gap={3}>
      <StorageDisk key={c.id} computer={c} canWrite={canWrite} />
      {/* The computer's shared folders, with the switch to every computer's, while the sharesUi flag is on. */}
      {sharesUiOn() ? <SharesSection key={c.id} computer={c} scopes canWrite={canWrite} {...(typeof share === 'string' && canWrite ? { sharePath: share } : {})} onShareClosed={() => { if (share !== undefined) setShare(undefined, { replace: true }); }} /> : null}
    </Stack>
  );
}

/** The tab with the computer's own disk: read only while the computer runs (a stopped one shows no disk, never 0). */
function StorageDisk({ computer: c, canWrite }: { computer: Parameters<typeof StorageTab>[0]['computer']; canWrite: boolean }) {
  const disk = useDisk(c, c.status === 'running');
  return <StorageTab computer={c} canWrite={canWrite} {...(disk === undefined ? {} : { disk })} />;
}
