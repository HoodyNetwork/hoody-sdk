// The Guide's top-bar part (manifest field topBar; the shell draws it before the account menu and hides it on the
// phone): one "Skills / SDK" menu. Skills opens the Guide's Skills section; API opens the API page
// when this load serves it; the other rows open in a new tab. On the phone the palette's "skills" command and the Guide index reach Skills, and the Guide's Connect
// section has the install line, the SDK and the docs links; palette commands open Hub paths only, so they list no others.
// "Download the Hub" saves the one-file Hub; the row shows only where this Hoody has the file (core hubFileUrl: never on
// the one-file Hub itself). The Guide's "Build your own" section explains the file.
import { ActionMenu, Button, currentPlatformHosts, followPageLink, type MenuList, useGo, usePageLink, useStrings, openOutside } from '@kit';
import { hubFileUrl } from '@core';
import strings from '../strings.en.json';
import { links } from '../links';
import { saveHubFile } from './hubFile';

const SDK_REPO = 'https://github.com/HoodyNetwork/hoody-sdk';
// docs.hoody.com on every platform, as the Hub's other docs links; the install host follows the platform.
const DOCS = 'https://docs.hoody.com/?source=hub';
const installUrl = () => `https://${currentPlatformHosts().install}/?source=hub`;

export default function TopBarLinks() {
  const t = useStrings(strings);
  const go = useGo();
  const api = usePageLink('api');
  const file = hubFileUrl();
  const items: MenuList = [
    { id: 'skills', label: t('top.skills'), description: t('top.skills.desc'), icon: 'hoody-docs', onAction: () => go(links.section('skills')) },
    { id: 'sdk', label: t('top.sdk'), description: t('top.sdk.desc'), icon: 'github', onAction: () => openOutside(SDK_REPO) },
    ...(api ? [{ id: 'api', label: t('top.api'), description: t('top.api.desc'), icon: 'hoody-code' as const, onAction: () => followPageLink(api, go) }] : []),
    { id: 'install', label: t('top.install'), description: t('top.install.desc'), icon: 'download', onAction: () => openOutside(installUrl()) },
    ...(file ? [{ id: 'file', label: t('top.file'), description: t('top.file.desc'), icon: 'file-code' as const, onAction: () => saveHubFile(file) }] : []),
    '-',
    { id: 'docs', label: t('top.docs'), description: t('top.docs.desc'), icon: 'guide', onAction: () => openOutside(DOCS) },
  ];
  return (
    <ActionMenu
      items={items}
      label={t('top.menu')}
      placement="bottom end"
      trigger={
        <Button variant="ghost" iconEnd="chevron-down">
          {t('top.trigger')}
        </Button>
      }
    />
  );
}
