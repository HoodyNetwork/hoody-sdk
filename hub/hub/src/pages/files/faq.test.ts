// Vitest: the Files page's questions. The builder is the one list the page shows: eight questions in a fixed
// order, each answered from its own strings. The answers that repeat a number or a list the page enforces elsewhere are
// checked against that source (the upload, copy and depth limits; the storage services; the dialog's install lines), so a
// change there fails here instead of leaving the answer stale.
import { describe, expect, it } from 'vitest';
import { pageFaq } from './faq';
import { MAX_DEPTH } from './logic';
import { SEVERAL_FOLDERS_MAX, SEVERAL_MAX } from './several';
import { LIMITS } from './upload';
import mountStrings from './Mount.strings.en.json';
import linkStrings from './link/link.strings.en.json';
import { PROVIDERS } from './storage/providers';
import pcStrings from './pc/pc.strings.en.json';
import storageStrings from './storage/strings.en.json';
import strings from './strings.en.json';

const IDS = ['mountDevice', 'mountLinux', 'mountCli', 'pcNeeds', 'pcShare', 'storageConnect', 'storageUploadWait', 'limits'] as const;
const t = (k: keyof typeof strings) => strings[k] as string;
const GiB = 1024 ** 3;
const thousands = (n: number) => n.toLocaleString('en-US');

describe('files pageFaq', () => {
  const { items, byId } = pageFaq(t as never);

  it('lists the eight questions in order, each id once, each read from its own strings', () => {
    expect(items.map((i) => i.id)).toEqual([...IDS]);
    for (const i of items) {
      expect(i.q).toBe(strings[`faq.${i.id}.q` as keyof typeof strings]);
      expect(i.a).toBe(strings[`faq.${i.id}.a` as keyof typeof strings]);
    }
  });

  it('byId names the same item objects the list holds', () => {
    for (const id of IDS) expect(byId[id]).toBe(items.find((i) => i.id === id));
  });

  it('every question is a question and every answer is a short plain paragraph', () => {
    for (const i of items) {
      expect(i.q.endsWith('?')).toBe(true);
      expect(i.a.length).toBeGreaterThan(40);
      expect(i.a.length).toBeLessThanOrEqual(600);
      expect(i.a).not.toMatch(/\n|<|\{\{/);
    }
  });

  it('the limits answer names the bounds the upload, copy, search and depth checks use', () => {
    const a = byId.limits.a;
    expect(a).toContain(`${thousands(LIMITS.files)} files`);
    expect(a).toContain(`${LIMITS.batchBytes / GiB} GB`);
    expect(a).toContain(`${LIMITS.fileBytes / GiB} GB a file`);
    expect(a).toContain(`${SEVERAL_MAX} items`);
    expect(a).toContain(`${SEVERAL_FOLDERS_MAX} of them`);
    expect(a).toContain(`${MAX_DEPTH} levels deep`);
    // The search bound and the link limits are the page's own words: the answer quotes the same sentence parts.
    const search = /up to [\d,]+ items/.exec(strings['find.count_other'])![0];
    expect(a).toContain(search);
    const link = /Up to ([^.]+)\./.exec(linkStrings['field.linkHint'])![1]!;
    expect(a).toContain(`up to ${link}`);
  });

  it('the storage answer names every hand-made service of the Add storage picker, by its picker name', () => {
    const own = PROVIDERS.filter((p) => !p.label);
    expect(own.length).toBeGreaterThanOrEqual(11);
    for (const p of own) {
      const name = storageStrings[`prov.${p.id}` as keyof typeof storageStrings].replace(/ \(.*\)$/, '').replace(' or compatible', '');
      expect(byId.storageConnect.a).toContain(name);
    }
    expect(byId.storageConnect.a).toContain(storageStrings.add);
  });

  it('the mount answers keep the dialog\'s install lines and the per-system limits', () => {
    expect(mountStrings['mount.davfs']).toContain('sudo apt install davfs2, or sudo dnf install davfs2');
    expect(byId.mountLinux.a).toContain('sudo apt install davfs2, or sudo dnf install davfs2');
    // The CLI and SDK lines are on the Use from your PC tab: the answer points there, and
    // the PC tab says what the answer says about Homebrew's rclone.
    // every way the tab's install picker offers: the script, the PowerShell line, npm, and npx with no install
    // (pc/pc.flow.test.tsx holds these against the picker's own lines)
    for (const line of ['curl -fsSL https://install.hoody.com | sh', 'irm https://install.hoody.com/install.ps1 | iex', 'npm install -g hoody-sdk', 'npx hoody-sdk']) expect(byId.mountCli.a).toContain(line);
    expect(byId.mountCli.a).toContain(pcStrings['tab.pc']);
    const brew = "Homebrew's rclone can't mount on a Mac";
    expect(byId.mountCli.a).toContain(brew);
    expect(pcStrings['need.rclone']).toContain(brew);
    expect(mountStrings['mount.step.mac']).toContain('read-only');
    expect(byId.mountDevice.a).toContain('Finder opens it read-only');
    // Windows opens the drive with what it ships: the answer asks for no service
    expect(byId.mountDevice.a).not.toMatch(/WebClient|needs the/);
    expect(byId.mountDevice.a).toContain('nothing needs installing');
    expect(byId.mountDevice.a).toContain('by default Windows moves files of up to about 50 MB');
    // the details the network-drive steps leave out are here
    expect(byId.mountDevice.a).toContain('gvfs-backends');
    expect(byId.pcNeeds.a).toContain('A mount is not a sync client');
    expect(byId.pcShare.a).toContain('It works only while your PC is online and the command runs');
    expect(byId.mountLinux.a).toContain(mountStrings['mount.key'].split(':')[0]!);
  });

  it('the PC answers name the tab, the rclone floor and the share path the commands use', () => {
    expect(byId.pcNeeds.a).toContain(pcStrings['tab.pc']);
    expect(pcStrings['need.rclone']).toContain('v1.61.0');
    expect(byId.pcNeeds.a).toContain('v1.61.0');
    expect(pcStrings['share.start']).toContain('/hoody/mounts/permanent/site');
    expect(byId.pcShare.a).toContain('/hoody/mounts/permanent/site');
    expect(byId.pcShare.a).toContain('--read-only');
    // The destructive line of the share stays with the share's explanation.
    expect(byId.pcShare.a).toContain('deleting there deletes the files on your PC');
    expect(pcStrings['share.deletes']).toContain('Deleting there deletes the files on your PC');
  });
});
