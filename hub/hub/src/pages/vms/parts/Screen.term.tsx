// The Screen tab of one VM in a terminal. A VM's screen is a picture in a browser frame, which a terminal cannot draw:
// the frame's place is a hand-off to the web Hub. Everything around it is the web tab's, unchanged (Screen.tsx): why
// the screen cannot be shown (no screen, not running, no address), the screen's own address with Copy, Open and QR,
// and the keys a browser cannot send (Ctrl+Alt+Del, Enter), sent to a running VM, one request per press; a press
// whose answer was lost is held and never sent again by itself.
//
// The four pure helpers below are Screen.tsx's own, repeated because that file imports a stylesheet and cannot load
// here (the web side has its own copy). Keep both in step.
import { isFramed, portAddress, refusal } from '@core';
import { AddressField, AnatomySection, Band, Facts, Handoff, HeldBand, useStrings, type ActionSpec } from '@kit';
import { useState } from 'react';
import { useSendKeys, type KeyChord } from '../create';
import type { Host } from '../data';
import type { VmReady } from '../logic';
import strings from '../strings.en.json';
import type * as Web from './Screen';
import { isVmUnsure } from './unsure';

export type { ScreenBlock } from './Screen';

export const DISPLAY_MAX: typeof Web.DISPLAY_MAX = 9999;

export const displayOk: typeof Web.displayOk = (display): display is number =>
  display !== null && Number.isInteger(display) && display >= 1 && display <= DISPLAY_MAX;

export const screenAddress: typeof Web.screenAddress = (host, display) => {
  if (!host.target || !displayOk(display)) return '';
  return portAddress(host.target.project, host.target.container, display, 'display');
};

export const screenBlock: typeof Web.screenBlock = (vm, address, framed) => {
  if (vm.spec.display === null) return 'headless';
  if (vm.state !== 'Running' && vm.state !== 'Paused') return 'notRunning';
  if (!address) return 'noAddress';
  return framed ? 'framed' : null;
};

export const Screen: typeof Web.Screen = ({ vm, host }: { vm: VmReady; host: Host }) => {
  const t = useStrings(strings);
  const framed = isFramed();
  const [unsure, setUnsure] = useState(false);
  const url = screenAddress(host, vm.spec.display);
  const block = screenBlock(vm, url, framed);
  const keys = useSendKeys(host.target, vm.vmId, vm.name);
  const [heldNote, setHeldNote] = useState<string | undefined>(undefined);
  const heldChord = keys.held ? (keys.held.chord === 'enter' ? 'enter' : 'ctrlAltDel') : null;

  const keysOff = framed ? t('screen.keys.framed')
    : vm.state !== 'Running' ? t('screen.keys.notRunning')
    : vm.monitorStalled ? t('screen.keys.stalled')
    : !host.target || vm.vmId === null ? t('screen.keys.noId')
    : keys.held ? t('screen.keys.held')
    : undefined;
  const press = (chord: KeyChord) => {
    if (keysOff !== undefined || !host.target || vm.vmId === null) return;
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
      {/* The frame's place: the screen itself shows only in a browser. */}
      {block === null ? <Handoff reason={t('term.screen.reason')} what={t('term.screen.what')} /> : null}
    </AnatomySection>
  );
};
