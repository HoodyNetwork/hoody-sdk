// imageWords: an image name as people read it. A known distribution with a
// numeric version reads "Debian 13"; anything not proved whole (a known name with a part that is not a numeric version
// included) is the raw string with no distro, so no mark claims it; not a non-empty string is undefined.
import { describe, expect, it } from 'vitest';
import { imageWords } from './computer';

describe('imageWords: known distributions', () => {
  it.each([
    ['debian/13', 'Debian 13', 'debian'],
    ['debian-13', 'Debian 13', 'debian'],
    ['debian', 'Debian', 'debian'],
    ['images:debian/12', 'Debian 12', 'debian'],
    ['debian/13/cloud', 'Debian 13', 'debian'],
    ['ubuntu/24.04', 'Ubuntu 24.04', 'ubuntu'],
    ['Ubuntu/22.04', 'Ubuntu 22.04', 'ubuntu'],
    ['alpine/3.20', 'Alpine 3.20', 'alpine'],
    ['alpinelinux/3.20', 'Alpine 3.20', 'alpine'],
    ['fedora/41', 'Fedora 41', 'fedora'],
    ['rockylinux/9', 'Rocky Linux 9', 'rocky'],
    ['rocky/9', 'Rocky Linux 9', 'rocky'],
    ['almalinux/9', 'AlmaLinux 9', 'alma'],
    ['archlinux', 'Arch Linux', 'arch'],
    ['centos-stream/9', 'CentOS Stream 9', 'centos'],
  ])('%s reads "%s" (%s)', (raw, label, distro) => {
    expect(imageWords(raw)).toEqual({ label, distro, raw });
  });

  it.each(['debian/13/custom-x', 'ubuntu/noble', 'archlinux/current', 'centos/9-Stream', 'debian-13backup', 'debian/13CUSTOM', 'debian/13..4', 'debian/', 'debian/13/cloud/x'])(
    'a known name not proved whole (%s) is the raw string, with no distro and so no mark', (raw) => {
      expect(imageWords(raw)).toEqual({ label: raw, raw });
    },
  );
});

describe('imageWords: anything else', () => {
  it('an unknown name is the raw string with no distro', () => {
    expect(imageWords('docker-123')).toEqual({ label: 'docker-123', raw: 'docker-123' });
    expect(imageWords('my-golden-image')).toEqual({ label: 'my-golden-image', raw: 'my-golden-image' });
    expect(imageWords('opensuse/15.6')).toEqual({ label: 'opensuse/15.6', raw: 'opensuse/15.6' });
  });

  it('object-prototype names are not distributions', () => {
    for (const raw of ['constructor', '__proto__', 'toString/1', 'hasOwnProperty-2']) expect(imageWords(raw)?.distro).toBeUndefined();
  });

  it('not a non-empty string is not known', () => {
    for (const raw of [undefined, null, '', '   ', 13, {}, ['debian/13']]) expect(imageWords(raw)).toBeUndefined();
  });

  it('the raw string is kept exactly as given', () => {
    expect(imageWords(' debian/13 ')).toEqual({ label: 'Debian 13', distro: 'debian', raw: ' debian/13 ' });
  });
});
