// The launcher's dialogs, wherever it is mounted: Options, the one-time share note, the Stop confirm and the warned
// Dismiss of a launch that may still be starting (C9: removing it lifts the hold on a second copy).
//   - options 'drawer' (default): Options in its own drawer; with `optionsBack` it replaces another drawer's body.
//   - options 'inline': the place shows OptionsPanel itself (a panel inside a dialog opens no drawer).
import { ConfirmDialog } from '@kit';
import type { OpenOpts } from '../parts/live';
import { OptionsDrawer } from '../parts/OptionsDrawer';
import { confirmShare, type Apps } from './useApps';

/** Options' Open: a row's own app by name, or the item as found. */
export const openWithOptions = (a: Apps) => (o: OpenOpts) => {
  if (!a.options) return;
  if (a.options.reopen) void a.launch(a.options.item, o, true);
  else a.open(a.options.item, o);
};

export function AppsDialogs({ a, options: frame = 'drawer', optionsBack }: { a: Apps; options?: 'drawer' | 'inline'; optionsBack?: () => void }) {
  const { t, options, share, stopping, dismissing, snap } = a;
  return (
    <>
      {options && frame === 'drawer' ? <OptionsDrawer item={options.item} onClose={() => a.setOptions(null)} onOpen={openWithOptions(a)} {...(optionsBack ? { onBack: optionsBack } : {})} /> : null}
      <ConfirmDialog overlayId="apps-share"
        isOpen={share !== null}
        onOpenChange={(o) => !o && a.setShare(null)}
        title={share ? t('share.title', { name: share.item.name }) : ''}
        body={t('share.body')}
        confirmLabel={t('share.go')}
        onConfirm={() => confirmShare(a)}
      />
      <ConfirmDialog overlayId="apps-stop"
        isOpen={stopping !== null}
        onOpenChange={(o) => !o && a.setStopping(null)}
        title={stopping ? t('stop.title', { name: stopping.name }) : ''}
        body={t('stop.body')}
        confirmLabel={t('stop.confirm')}
        busy={a.stopPending || (stopping !== null && snap.patches.get(stopping.key)?.busy === 'stop')}
        onConfirm={() => stopping && void a.stop(stopping)}
      />
      <ConfirmDialog overlayId="apps-dismiss"
        isOpen={dismissing !== null}
        onOpenChange={(o) => !o && a.setDismissing(null)}
        title={dismissing ? t('dismiss.title', { name: dismissing.name }) : ''}
        body={t('dismiss.body')}
        confirmLabel={t('dismiss.confirm')}
        tone="danger"
        onConfirm={() => {
          if (!dismissing) return;
          a.forget(dismissing);
          a.setDismissing(null);
        }}
      />
    </>
  );
}
