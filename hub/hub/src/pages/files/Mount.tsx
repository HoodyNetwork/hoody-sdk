// "Mount on your device".
// Hoody Files speaks WebDAV (class 1), so the computer's files address opens as a network drive: Mac Finder (read-only),
// Windows File Explorer, GNOME Files (gvfs) or KDE Dolphin on Linux, davfs2 on a Linux without a desktop; phones and
// tablets need a WebDAV app. The dialog is the address (kit AddressField: masked on screen, Copy, Open and a QR code take
// the real one), the kit SystemSteps (the browser's own system first) with one line on what the chosen system gives and
// its numbered steps (kit StepList, one action a row, the system's own menu names), and the note that the address is the
// key (access is managed in Keys). That tab's network-drive way shows the same steps in place (DriveSection). The command
// line and the SDK are on the Files "Use from your PC" tab, which the dialog links to (pcHref) where the caller has one.
// It never builds the address: the caller passes what core portAddress gives for the files program (Files: data.ts
// filesAddress; Connect: its programUrl(c, 'files')). No password field: the kit asks for none when it has no users.
// Other pages reach this through links.ts.
// A scheme a file manager wants (davs:// for GNOME Files, webdavs:// for KDE) is never typed by hand: the row has a Copy
// of the address in that form.
// Facts: mount.davfs(8) (uid, gid, dir_mode, file_mode); Finder mounts DAV class 1 read-only; Windows opens WebDAV with
// its own WebClient service (part of desktop Windows, startup Manual, not started by default) and moves up to about
// 50 MB by default; iOS Files' Connect to Server is SMB only; Ctrl+L opens the address bar on every GNOME Files; a click
// in the empty area right of the path makes Dolphin's location bar editable. Commands use the kit CodeBlock lines: shown masked, Copy real.
import { AddressField, AnatomySection, Band, Button, CodeBlock, CopyButton, Dialog, Disclosure, IconButton, Link, Stack, StepList, SystemSteps, followPageLink, useGo, usePageLink, useStrings, type PageLink } from '@kit';
import { maskAddress } from '@core';
import { useState } from 'react';
import strings from './Mount.strings.en.json';
import pcStrings from './pc/pc.strings.en.json';

const MNT = '/mnt/hoody';

/** The address under another scheme; '' when it is not an https address. */
const schemeOf = (u: string, scheme: string): string => (/^https:\/\//i.test(u) ? `${scheme}://${u.slice('https://'.length)}` : '');
/** The address with the davs:// scheme GNOME Files takes. */
const davsOf = (u: string): string => schemeOf(u, 'davs');
/** The address with the webdavs:// scheme KDE's file manager takes. */
const kdeOf = (u: string): string => schemeOf(u, 'webdavs');

/** davfs2 mounts as root with umask modes by default: the mount is given to the person running it (uid/gid) and kept
 *  private (0700/0600). */
const MKDIR = `sudo mkdir -p ${MNT}`;
const davfsOf = (u: string): string => `sudo mount -t davfs -o uid=$(id -u),gid=$(id -g),dir_mode=0700,file_mode=0600 ${u} ${MNT}`;
/** Windows: the WebClient service back to start-on-demand (a disabled service cannot start), then started. `sc.exe` by
 *  its full name: in PowerShell a bare `sc` is another command. */
const WEBCLIENT_ALLOW = 'sc.exe config webclient start= demand';
const WEBCLIENT_START = 'net start webclient';

/** The entry: a short ghost button in About this computer on the Files "Use from your PC" tab (the one entry in Files),
 *  an icon button on a Connect row. Both open the dialog. `pcHref`: the computer's "Use from your PC" tab
 *  (links.pc), where the command line and SDK ways are: the Connect row passes it; none on that tab. */
export function MountButton({ name, url, pcHref, isDisabled, compact }: { name: string; url: string; pcHref?: string; isDisabled?: boolean; compact?: boolean }) {
  const t = useStrings(strings);
  const [open, setOpen] = useState(false);
  if (!url) return null;
  return (
    <>
      {compact
        ? <IconButton icon="link" variant="ghost" size="md" label={t('mount.action')} isDisabled={isDisabled} onPress={() => setOpen(true)} />
        : <Button size="sm" variant="ghost" icon="link" isDisabled={isDisabled} onPress={() => setOpen(true)}>{t('mount.short')}</Button>}
      {open ? <MountDialog name={name} url={url} pcHref={pcHref} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function MountDialog({ name, url, pcHref, onClose }: { name: string; url: string; pcHref: string | undefined; onClose: () => void }) {
  const t = useStrings(strings);
  const body = pcHref
    ? <>{t('mount.pc')} <Link href={pcHref} onPress={onClose}>{t('mount.pcLink')}</Link></>
    : t('mount.lede');
  return (
    <Dialog isOpen onOpenChange={(o) => { if (!o) onClose(); }} title={t('mount.title', { name })} body={body} size="xl" cancelLabel={t('mount.close')}>
      <MountSteps url={url} />
    </Dialog>
  );
}

/** The network drive as a section of the Use from your PC tab: the same steps as the dialog, in place. With no
 *  address there are no steps, and the description says why. What a network drive is good for is on the way's card;
 *  the per-system details (read-only, size limit, what Linux uses) are in the page FAQ. */
export function DriveSection({ name, url }: { name: string; url: string }) {
  const tp = useStrings(pcStrings);
  const title = tp('drive.title', { name });
  return url ? (
    <AnatomySection id="files-pc-drive" title={title} description={tp('drive.body')}>
      <MountSteps url={url} />
    </AnatomySection>
  ) : (
    <AnatomySection id="files-pc-drive" title={title} description={tp('nocli.noAddress', { name })} />
  );
}

/** The network drive itself: the files address, the numbered steps for the system picked, and that the address is the
 *  key. The dialog's body and the section's. */
function MountSteps({ url }: { url: string }) {
  const t = useStrings(strings);
  const davs = davsOf(url);
  const shown = maskAddress(url);
  return (
    <Stack>
      <AddressField url={url} label={t('mount.address')} resetKey={url} />
      <SystemSteps
        label={t('mount.system')}
        systems={[
          { id: 'mac', label: t('mount.os.mac'), step: t('mount.step.mac'), more: <MacSteps /> },
          { id: 'windows', label: t('mount.os.windows'), step: t('mount.step.windows'), more: <WindowsSteps /> },
          { id: 'linux', label: t('mount.os.linux'), step: t('mount.step.linux'), more: davs ? <LinuxSteps url={url} davs={davs} shown={shown} /> : null },
          { id: 'phone', label: t('mount.os.phone'), step: t('mount.step.phone'), more: <PhoneSteps /> },
        ]}
      />
      <Band size="table" icon="key" actions={<KeysLink />}>{t('mount.key')}</Band>
    </Stack>
  );
}

/** Mac: Finder's Connect to Server. */
function MacSteps() {
  const t = useStrings(strings);
  return (
    <StepList
      label={t('mount.steps', { system: t('mount.os.mac') })}
      groups={[{ items: [{ text: t('mount.mac.1') }, { text: t('mount.mac.2') }, { text: t('mount.mac.3') }, { text: t('mount.mac.4') }] }]}
    />
  );
}

/** Windows: File Explorer's Map network drive. Nothing is asked of the person first: the service that opens the drive is
 *  part of Windows. Where the drive does not connect, the two lines that start it are one press away. */
function WindowsSteps() {
  const t = useStrings(strings);
  return (
    <>
      <StepList
        label={t('mount.steps', { system: t('mount.os.windows') })}
        groups={[{ items: [{ text: t('mount.windows.1') }, { text: t('mount.windows.2'), note: t('mount.windows.2.note') }, { text: t('mount.windows.3') }, { text: t('mount.windows.4') }] }]}
      />
      <Disclosure title={t('mount.windows.fix.title')} description={t('mount.windows.fix')}>
        <CodeBlock
          label={t('mount.windows.fix.label')}
          lang="shell"
          lines={[
            { caption: t('mount.windows.fix.allow'), code: WEBCLIENT_ALLOW },
            { caption: t('mount.windows.fix.start'), code: WEBCLIENT_START },
          ]}
        />
      </Disclosure>
    </>
  );
}

/** Linux alone: each file manager's steps with the address in the form it takes (a Copy in the row), and davfs2 for a
 *  Linux without a desktop. */
function LinuxSteps({ url, davs, shown }: { url: string; davs: string; shown: string }) {
  const t = useStrings(strings);
  return (
    <>
      <StepList
        label={t('mount.steps', { system: t('mount.linux.gnome') })}
        groups={[{ where: t('mount.linux.gnome'), items: [{ text: t('mount.linux.gnome.1') }, { text: t('mount.linux.gnome.2'), act: <CopyButton text={davs} label={t('mount.copyDavs')} withLabel /> }] }]}
      />
      <StepList
        label={t('mount.steps', { system: t('mount.linux.kde') })}
        groups={[{ where: t('mount.linux.kde'), items: [{ text: t('mount.linux.kde.1') }, { text: t('mount.linux.kde.2'), act: <CopyButton text={kdeOf(url)} label={t('mount.copyKde')} withLabel /> }] }]}
      />
      <Disclosure title={t('mount.davfs.title')} description={t('mount.davfs')}>
        <CodeBlock
          label={t('mount.davfs.label')}
          lang="shell"
          lines={[
            { caption: t('mount.davfs.mkdir'), code: MKDIR },
            { caption: t('mount.davfs.mount'), code: davfsOf(shown), copy: davfsOf(url) },
          ]}
        />
      </Disclosure>
    </>
  );
}

/** Phones and tablets: their own Files apps open no WebDAV drive, so the steps are an app's. */
function PhoneSteps() {
  const t = useStrings(strings);
  return (
    <StepList
      label={t('mount.steps', { system: t('mount.os.phone') })}
      groups={[{ items: [{ text: t('mount.phone.1') }, { text: t('mount.phone.2') }, { text: t('mount.phone.3') }] }]}
    />
  );
}

function KeysLink() {
  const link = usePageLink('keys');
  return link ? <KeysButton link={link} /> : null;
}

function KeysButton({ link }: { link: PageLink }) {
  const t = useStrings(strings);
  const go = useGo();
  return <Button size="sm" variant="ghost" onPress={() => followPageLink(link, go)}>{t('mount.keys')}</Button>;
}
