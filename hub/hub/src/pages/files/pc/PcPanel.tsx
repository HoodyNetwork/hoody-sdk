// "Use from your PC": the computer pane A shows, and how to reach its files from a PC.
// The tab asks one question first, "What do you want to do?", as four plain choices (kit RadioGroup cards, kept in the
// URL as way=): a folder on the PC (hoody mount), a network drive (the files address, nothing to install), a PC folder
// inside the computer (hoody share), or from code (the Hoody SDK). Under it only the chosen way shows, as numbered steps:
// install (a picker over every install method, each with its sign-in line), what else the PC needs, then the lines to
// run with what the person gets as the section's sentence. The network drive shows the Mount dialog's own steps in
// place. Last, About this computer: its name, id, access rules, what this session may do and its files address.
// The computer id is masked on screen (kit maskId) and copied whole (CodeBlock `copy`); the files address shows only
// masked (core maskAddress) in the address and SDK lines, copied whole. A session that cannot change files sees the
// read-only lines first (mount and share) and the line that the CLI signs in on its own. The lines are POSIX shell; a
// path with a ' gets the PowerShell spelling said under them. Layout: kit sections only.
import { AddressField, AnatomySection, Band, CodeBlock, Disclosure, Facts, RadioGroup, SegmentedControl, Stack, cliCommand, currentPlatformHosts, maskId, systemOfAgent, useSearch, useSearchParam, useStrings, type CodeLine, type Fact } from '@kit';
import { hostEnv, maskAddress } from '@core';
import { useState } from 'react';
import { DriveSection, MountButton } from '../Mount';
import { filesAddress, useCanChange, type FilesComputer, type FilesComputers } from '../data';
import { paneComputer, panesOf, partsOf } from '../logic';
import strings from './pc.strings.en.json';

/** A shell word: as is when it needs no quoting, else in single quotes. */
export const sh = (w: string): string => (/^[A-Za-z0-9_./:@%+=,-]+$/.test(w) ? w : `'${w.replace(/'/g, `'\\''`)}'`);
/** One command line shown with the masked id and copied with the whole one. */
const cmd = (caption: string, shown: string, copy: string): CodeLine => ({ caption, code: shown, copy });

/** The ways to use a computer's files from a PC, in the order the choice shows them. The first is the default: it
 *  leaves the URL clean. */
export const WAYS = ['folder', 'drive', 'share', 'code'] as const;
export type Way = (typeof WAYS)[number];
/** The way the URL names; the first when it names none or one that does not exist. */
export const wayOf = (v: string | undefined): Way => WAYS.find((w) => w === v) ?? WAYS[0];

/** Every way to get the hoody command (the SDK's README, "Ways to use Hoody"). */
export const CLI_INSTALL = {
  unix: 'curl -fsSL https://install.hoody.com | sh',
  windows: 'irm https://install.hoody.com/install.ps1 | iex',
  npm: 'npm install -g hoody-sdk',
} as const;
/** The install picker's choices, in order. */
export const CLI_METHODS = ['unix', 'windows', 'npm', 'npx'] as const;
export type CliMethod = (typeof CLI_METHODS)[number];
/** Without installing: this stands where a line says hoody. */
export const NPX = 'npx hoody-sdk';
/** The package in a project (the SDK's README, "Install the package"). */
export const SDK_INSTALL = { npm: 'npm install hoody-sdk', bun: 'bun add hoody-sdk' } as const;
export const SDK_MANAGERS = ['npm', 'bun'] as const;
export type SdkManager = (typeof SDK_MANAGERS)[number];

export function PcPanel({ computers }: { computers: FilesComputers }) {
  const t = useStrings(strings);
  const search = useSearch();
  const canChange = useCanChange();
  const [wayParam, setWay] = useSearchParam('way');
  const c = paneComputer(computers.rows ?? [], panesOf(search).a);
  if (!c) return <AnatomySection id="files-pc-pick" title={t('pick.title')} description={t('pick.body')} />;
  const address = filesAddress(c);
  const way = wayOf(typeof wayParam === 'string' ? wayParam : undefined);
  const name = c.name;
  return (
    <Stack>
      <AnatomySection id="files-pc-way" title={t('way.title')} description={t('way.body')} note={t('notOffered')}>
        <RadioGroup<Way>
          aria-label={t('way.title')}
          variant="cards"
          options={WAYS.map((w) => ({ value: w, label: t(`way.${w}`, { name }), description: t(`way.${w}.what`, { name }) }))}
          value={way}
          onChange={(w) => setWay(w === WAYS[0] ? undefined : w)}
        />
      </AnatomySection>
      {way === 'drive' ? (
        <DriveSection name={name} url={address} />
      ) : way === 'share' ? (
        <>
          <Install step={1} />
          <Needs c={c} step={2} />
          <ShareLines c={c} canChange={canChange} />
        </>
      ) : way === 'code' ? (
        <>
          <SdkInstall />
          <Needs c={c} step={2} fuse />
          <SdkLines name={name} address={address} />
        </>
      ) : (
        <>
          <Install step={1} />
          <Needs c={c} step={2} fuse />
          <MountLines c={c} path={panesOf(search).a.path ?? '/'} canChange={canChange} address={address} />
        </>
      )}
      <About c={c} address={address} canChange={canChange} drive={way === 'drive'} />
    </Stack>
  );
}

/** The reader's browser agent, read through the host: none where the Hub is not a web page (a terminal), so the
 *  Unix way shows first there. */
function readerAgent(): { userAgent: string; maxTouchPoints: number } | undefined {
  const env = hostEnv();
  const facts = env.browserPage === true ? env.alertHost?.facts() : undefined;
  return facts ? { userAgent: facts.ua, maxTouchPoints: facts.touch } : undefined;
}

/** Step 1 of the command-line ways: every way to get the hoody command, each with its sign-in line. The reader's own
 *  system shows first. */
function Install({ step }: { step: number }) {
  const t = useStrings(strings);
  // The sign-in names the platform only when it is not the CLI's default (kit cliCommand): the mount and share lines
  // below use the platform the CLI signed in to.
  const signIn = cliCommand('login --web', currentPlatformHosts());
  const [method, setMethod] = useState<CliMethod>(() => (systemOfAgent(readerAgent()) === 'windows' ? 'windows' : 'unix'));
  const lines = (install: string): CodeLine[] => [{ caption: t('need.install'), code: install }, { caption: t('need.signIn'), code: signIn }];
  const methods = {
    unix: lines(CLI_INSTALL.unix),
    windows: lines(CLI_INSTALL.windows),
    npm: lines(CLI_INSTALL.npm),
    npx: [{ caption: t('need.signIn'), code: signIn.replace(/^hoody /, `${NPX} `) }],
  } satisfies Record<CliMethod, CodeLine[]>;
  return (
    <AnatomySection id="files-pc-install" title={t('step', { n: String(step), what: t('need.title') })} description={t('need.cli')}>
      <Stack gap={2}>
        <SegmentedControl<CliMethod>
          label={t('need.method')}
          fullWidth
          items={CLI_METHODS.map((id) => ({ id, label: t(`need.m.${id}`) }))}
          value={method}
          onChange={setMethod}
          description={t(`need.m.${method}.note`)}
        />
        <CodeBlock key={method} lang="shell" label={t('need.cliLabel')} lines={methods[method]} />
      </Stack>
    </AnatomySection>
  );
}

/** Step 1 from code: the package in the project. */
function SdkInstall() {
  const t = useStrings(strings);
  const [manager, setManager] = useState<SdkManager>('npm');
  return (
    <AnatomySection id="files-pc-sdk-install" title={t('step', { n: '1', what: t('sdk.install') })} description={t('sdk.installBody')}>
      <Stack gap={2}>
        <SegmentedControl<SdkManager> label={t('sdk.manager')} fullWidth items={SDK_MANAGERS.map((id) => ({ id, label: t(`sdk.m.${id}`) }))} value={manager} onChange={setManager} />
        <CodeBlock key={manager} lang="shell" label={t('sdk.installLabel')} code={SDK_INSTALL[manager]} />
      </Stack>
    </AnatomySection>
  );
}

/** What else the PC needs, in the open: a mount or a share stops without them. `fuse`: the ways that mount a folder
 *  on the PC also need the system's own mount driver. */
function Needs({ c, step, fuse }: { c: FilesComputer; step: number; fuse?: boolean }) {
  const t = useStrings(strings);
  const needs: Fact[] = [
    { label: t('need.rclone.label'), value: t('need.rclone') },
    ...(fuse ? [
      { label: t('need.mac.label'), value: t('need.mac') },
      { label: t('need.windows.label'), value: t('need.windows') },
      { label: t('need.linux.label'), value: t('need.linux') },
    ] : []),
    { label: c.name, value: t('need.kit') },
  ];
  return (
    <AnatomySection id="files-pc-needs" title={t('step', { n: String(step), what: t('need.more') })} description={t('need.moreBody')}>
      <Facts items={needs} columns={1} label={t('need.more')} />
    </AnatomySection>
  );
}

/** The CLI by the files address: its folder on the PC and its mount line. */
const ADDRESS_DIR = './hoody';
const byAddress = (u: string): string => `hoody mount ${u} ${ADDRESS_DIR}`;

function MountLines({ c, path, canChange, address }: { c: FilesComputer; path: string; canChange: boolean; address: string }) {
  const t = useStrings(strings);
  const id = c.id, m = maskId(c.id);
  const dir = `~/hoody/${sh(c.name)}`;
  const leaf = partsOf(path).at(-1);
  const both = (caption: string, rest: string, at = '') => cmd(caption, `hoody mount ${m}${at} ${rest}`, `hoody mount ${id}${at} ${rest}`);
  const readOnly = both(t('mount.readOnly'), `${dir} --read-only`);
  const folderDir = leaf ? `~/hoody/${sh(leaf)}` : '';
  // The folder-only mount has its own PC folder: its unmount lines name it (the whole computer's would not find it).
  const folderOff: CodeLine[] = leaf && folderDir !== dir ? [
    { caption: t('mount.unmountFolder', { folder: leaf }), code: `hoody unmount ${folderDir}` },
    { caption: t('mount.forceFolder', { folder: leaf }), code: `hoody unmount ${folderDir} --force` },
  ] : [];
  const whole = both(t('mount.whole'), dir);
  const folder = leaf ? both(t('mount.folder', { folder: leaf }), folderDir, `:${sh(path)}`) : undefined;
  const unmount: CodeLine = { caption: t('mount.unmount'), code: `hoody unmount ${dir}` };
  // Three lines first: the session's own mount (read-only first when it cannot change files), the folder in pane A (or
  // read-only), and unmount; every other variant is folded below.
  const second = canChange ? folder ?? readOnly : whole;
  const first = canChange ? whole : readOnly;
  const lines: CodeLine[] = [first, second, unmount];
  const more: CodeLine[] = [
    ...[readOnly, whole, ...(folder ? [folder] : [])].filter((l) => !lines.includes(l)),
    both(t('mount.background'), `${dir} --background`),
    { caption: t('mount.list'), code: 'hoody mount --list' },
    { caption: t('mount.force'), code: `hoody unmount ${dir} --force` },
    ...folderOff,
    // By the files address: no sign-in, the address is the key; masked on
    // screen, copied whole.
    ...(address ? [
      { caption: t('address.mount'), code: byAddress(maskAddress(address)), copy: byAddress(address) },
      { caption: t('address.unmount'), code: `hoody unmount ${ADDRESS_DIR}` },
    ] : []),
  ];
  const quoted = [...lines, ...more].some((l) => (l.copy ?? l.code).includes(`'\\''`));
  return (
    <AnatomySection
      id="files-pc-mount"
      title={t('step', { n: '3', what: t('mount.title', { name: c.name }) })}
      description={t('mount.get', { name: c.name, dir })}
      notices={c.rules === 'open' && canChange ? undefined : (
        <>
          {c.rules === 'open' ? null : <Band size="table">{t(c.rules === 'set' ? 'mount.rules' : 'mount.rulesUnknown', { name: c.name })}</Band>}
          {canChange ? null : <Band size="table">{t('mount.signIn')}</Band>}
        </>
      )}
    >
      <Stack>
        <CodeBlock lang="shell" label={t('mount.label', { name: c.name })} lines={lines} footer={quoted ? t('shell.quote') : t('shell.posix')} />
        <Disclosure title={t('mount.more')} description={t('mount.forceNote')}>
          <CodeBlock lang="shell" label={t('mount.moreLabel', { name: c.name })} lines={more} />
        </Disclosure>
      </Stack>
    </AnatomySection>
  );
}

function ShareLines({ c, canChange }: { c: FilesComputer; canChange: boolean }) {
  const t = useStrings(strings);
  const id = c.id, m = maskId(c.id);
  const start = cmd(t('share.start'), `hoody -c ${m} share ~/Projects/site`, `hoody -c ${id} share ~/Projects/site`);
  const readOnly = cmd(t('share.readOnly'), `hoody -c ${m} share ~/docs --read-only`, `hoody -c ${id} share ~/docs --read-only`);
  const lines: CodeLine[] = [
    ...(canChange ? [start, readOnly] : [readOnly, start]),
    { caption: t('share.list'), code: 'hoody share list' },
    { caption: t('share.stop'), code: 'hoody share stop site' },
  ];
  return (
    <AnatomySection
      id="files-pc-share"
      title={t('step', { n: '3', what: t('share.title', { name: c.name }) })}
      description={t('share.get', { name: c.name })}
      notices={
        <>
          <Band /* noDetails: a standing warning, nothing was refused */ tone="warn" size="table">{t('share.deletes')}</Band>
          {canChange ? null : <Band size="table">{t('share.signIn', { name: c.name })}</Band>}
        </>
      }
    >
      <CodeBlock lang="shell" label={t('share.label', { name: c.name })} lines={lines} />
    </AnatomySection>
  );
}

/** The Hoody SDK way: hoody-sdk/mount takes the files
 *  address (kitUrl), shown masked, copied whole. */
const SDK_IMPORT = "import { mount } from 'hoody-sdk/mount';";
const sdkOf = (u: string): string => `await mount({ kitUrl: '${u}', localPath: './hoody' });`;

function SdkLines({ name, address }: { name: string; address: string }) {
  const t = useStrings(strings);
  return (
    <AnatomySection id="files-pc-sdk" title={t('step', { n: '3', what: t('sdk.title') })} description={address ? t('sdk.body', { name }) : t('sdk.noAddress', { name })}>
      {address ? (
        <CodeBlock
          label={t('sdk.label')}
          lang="ts"
          lines={[
            { code: SDK_IMPORT, copyLabel: t('sdk.copyImport') },
            { code: sdkOf(maskAddress(address)), copy: sdkOf(address), copyLabel: t('sdk.copyCall') },
          ]}
        />
      ) : null}
    </AnatomySection>
  );
}

/** About this computer: its name, id, access rules, what this session may do, and its files address (with the Mount
 *  dialog) wherever the network-drive way does not already show it. */
function About({ c, address, canChange, drive }: { c: FilesComputer; address: string; canChange: boolean; drive: boolean }) {
  const t = useStrings(strings);
  const facts: Fact[] = [
    { label: t('atGlance.computer'), value: c.name },
    { label: t('atGlance.id'), id: c.id },
    { label: t('atGlance.rules'), value: t(c.rules === 'set' ? 'atGlance.rules.set' : c.rules === 'open' ? 'atGlance.rules.open' : 'atGlance.rules.unknown') },
    { label: t('atGlance.session'), value: t(canChange ? 'atGlance.session.change' : 'atGlance.session.read') },
    ...(address ? [] : [{ label: t('atGlance.address'), value: t('atGlance.noAddress') }]),
  ];
  return (
    <AnatomySection id="files-pc-glance" title={t('atGlance.title')} description={t('atGlance.body')}>
      <Stack>
        <Facts items={facts} label={t('atGlance.title')} />
        {address && !drive ? <AddressField url={address} label={t('atGlance.address')} resetKey={address} /> : null}
        {address && !drive ? <MountButton name={c.name} url={address} /> : null}
      </Stack>
    </AnatomySection>
  );
}
