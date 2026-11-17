// The Screen tab of one VM: its screen inside the Hub, and the keys a browser cannot send.
//
// The frame's address is only one the Hub builds itself (core portAddress for the computer and the VM's display
// number), never a field of an answer, and carries no token. The frame follows core's display-frame rules (sandbox,
// allow list for exactly that address, no referrer). A cross-origin frame cannot be read, so the page knows only
// whether something loaded: with no load event in 20 s it says so and offers a new tab.
//
// A screen that cannot be shown says why in one line: the VM has no screen, it is not running, its address is not
// known, or the Hub itself is shown inside another page (then no frame is drawn, only its address with Open).
//
// Keys (Ctrl+Alt+Del, Enter) go to a running VM, one request per press. A press whose answer was lost may have been
// typed: it is held, never sent again by itself, and no read can confirm it, so the band says to look at the screen.
import { DISPLAY_FRAME_SANDBOX, DISPLAY_FRAME_SLOW_MS, displayFrameAllow, isFramed, portAddress, refusal } from '@core';
import { AddressField, AnatomySection, Band, Facts, HeldBand, InlineActions, focusSection, useStrings, type ActionSpec } from '@kit';
import { useEffect, useState } from 'react';
import { useSendKeys, type KeyChord } from '../create';
import type { Host } from '../data';
import type { VmReady } from '../logic';
import strings from '../strings.en.json';
import s from './Screen.module.css';
import { isVmUnsure } from './unsure';

/** Why a VM's screen cannot be shown now, or null when it can. */
export type ScreenBlock = 'headless' | 'notRunning' | 'framed' | 'noAddress' | null;

/** The display numbers a VM can have. */
export const DISPLAY_MAX = 9999;

/** A display number a VM can have (1 to DISPLAY_MAX). */
export function displayOk(display: number | null): display is number {
  return display !== null && Number.isInteger(display) && display >= 1 && display <= DISPLAY_MAX;
}

/** The address of a VM's screen: the computer's display address for the VM's display number; '' when it cannot be built. */
export function screenAddress(host: Pick<Host, 'target'>, display: number | null): string {
  if (!host.target || !displayOk(display)) return '';
  return portAddress(host.target.project, host.target.container, display, 'display');
}

export function screenBlock(vm: VmReady, address: string, framed: boolean): ScreenBlock {
  if (vm.spec.display === null) return 'headless';
  if (vm.state !== 'Running' && vm.state !== 'Paused') return 'notRunning';
  if (!address) return 'noAddress';
  return framed ? 'framed' : null;
}

export function Screen({ vm, host }: { vm: VmReady; host: Host }) {
  const t = useStrings(strings);
  const framed = isFramed();
  // A press refused because the reads on screen do not agree on which VM holds this name (a key goes by name).
  const [unsure, setUnsure] = useState(false);
  const url = screenAddress(host, vm.spec.display);
  const block = screenBlock(vm, url, framed);
  const keys = useSendKeys(host.target, vm.vmId, vm.name);
  const [heldNote, setHeldNote] = useState<string | undefined>(undefined);
  const heldChord = keys.held ? (keys.held.chord === 'enter' ? 'enter' : 'ctrlAltDel') : null;

  // Keys reach only a running VM that still answers; every other case says why on the button.
  const keysOff = framed ? t('screen.keys.framed')
    : vm.state !== 'Running' ? t('screen.keys.notRunning')
    : vm.monitorStalled ? t('screen.keys.stalled')
    : !host.target || vm.vmId === null ? t('screen.keys.noId')
    : keys.held ? t('screen.keys.held')
    : undefined;
  const press = (chord: KeyChord) => {
    if (keysOff !== undefined || !host.target || vm.vmId === null) return;
    // Asked at the press, not at render: the VM's screen notes it after every read.
    const refused = isVmUnsure(vm.name);
    setUnsure(refused);
    if (refused) return;
    setHeldNote(undefined);
    void keys.run({ target: host.target, name: vm.name, vmId: vm.vmId, chord });
  };
  const key = (chord: KeyChord): ActionSpec => ({ id: chord, label: t(`screen.keys.${chord}`), onPress: () => press(chord), busy: keys.busy, ...(keysOff !== undefined ? { disabledReason: keysOff } : {}) });
  const failed = keys.outcome && keys.outcome.kind !== 'done' && keys.outcome.kind !== 'pending' ? keys.outcome : undefined;

  return (
    <AnatomySection
      id="vm-screen"
      title={t('screen.title')}
      info={t('screen.info')}
      state={{ kind: 'ready' }}
      note={block === null ? undefined : t(`screen.none.${block}`)}
      actions={vm.spec.display === null ? undefined : { secondary: [key('ctrlAltDel'), key('enter')] }}
      notices={
        heldChord ? (
          <HeldBand
            overlayId="vms-screen-keys-held"
            text={t('screen.keys.heldText', { keys: t(`screen.keys.${heldChord}`), vm: vm.name })}
            readOnly={keys.elsewhere !== null}
            note={heldNote}
            onCheck={async () => {
              // Nothing the VM program can be asked proves a key press: the check reads nothing new and says so.
              await keys.check();
              setHeldNote(t('screen.keys.noProof'));
            }}
            onDismiss={() => keys.stopTracking()}
          />
        ) : unsure ? (
          <Band tone="warn" /* noDetails: nothing was sent; the page's own reads disagree, no request failed */>{t('screen.keys.unsure')}</Band>
        ) : failed ? (
          <Band tone="warn" error={refusal(failed)}>{t('screen.keys.failed')}</Band>
        ) : undefined
      }
    >
      {block === null || block === 'framed' ? <Facts label={t('screen.address')} items={[{ label: t('screen.address'), value: <AddressField url={url} label={t('screen.address')} resetKey={url} /> }]} /> : null}
      {block === null ? <Frame key={url} url={url} title={t('screen.frame', { vm: vm.name })} /> : null}
    </AnatomySection>
  );
}

/** The frame and the way out of it (a focused frame keeps every key). The address above it has Copy, Open and QR. */
function Frame({ url, title }: { url: string; title: string }) {
  const t = useStrings(strings);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (loaded) return;
    const id = setTimeout(() => setSlow(true), DISPLAY_FRAME_SLOW_MS);
    return () => clearTimeout(id);
  }, [loaded]);
  return (
    <>
      {slow && !loaded ? (
        <Band tone="neutral" /* noDetails: nothing failed that the Hub can read; a cross-origin frame gives no error, only no load event */>
          {t('screen.slow')}
        </Band>
      ) : null}
      <div className={s.box} data-screen={loaded ? 'loaded' : 'loading'}>
        <iframe className={s.frame} src={url} title={title} sandbox={DISPLAY_FRAME_SANDBOX} allow={displayFrameAllow([url])} referrerPolicy="no-referrer" onLoad={() => setLoaded(true)} />
      </div>
      <InlineActions
        label={t('screen.actions')}
        actions={[
          { id: 'leave', label: t('screen.leave'), onPress: () => void focusSection('vm-screen') },
        ]}
      />
    </>
  );
}
