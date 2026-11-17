// Connect tab: the program links of the computer (links.ts KIT_PROGRAMS: the ones to open in a browser, then the ones used
// from code) and SSH: what to type and whether a key is set as facts, "Set key" the section's action, the command line
// and the hosted gateway folded below. The browser terminal is the Terminal row of the links.
import { AddressList, AddressRow, AnatomySection, CodeBlock, CodeLine, CopyButton, Disclosure, Facts, Icon, IconButton, Link, QrButton, StepList, cliCommand, currentPlatformHosts, platformText, qrReachOf, useStrings, type ActionSpec, type Fact, type IconName, openOutside } from '@kit';
import { BoardAddButton } from '../../board/links';
import { computerHandle } from '@core';
import { MountButton, links as filesLinks } from '../../files/links';
import { subjectOf } from '../data';
import { KIT_PROGRAMS, type KitProgramKey } from '../links';
import { bucket, hasSshKey, sshHost } from '../logic';
import { useOut } from './useOut';
import strings from '../strings.en.json';
import type { Computer } from '../types';
import { kitProgramUrl } from '../urls';
import s from './parts.module.css';

const ICON: Record<KitProgramKey, IconName> = {
  agent: 'agent',
  terminal: 'terminal',
  screen: 'display',
  files: 'files',
  browser: 'browser',
  code: 'hoody-code',
  notes: 'notes',
  workspaces: 'apps',
  sqlite: 'database',
  pipe: 'share',
  cron: 'schedules',
  notifications: 'bell',
  exec: 'scripts',
  curl: 'globe',
  watch: 'eye',
};

// Workspaces is not offered here: it is reached from its own page, not as a link of one computer.
const OPEN = KIT_PROGRAMS.filter((p) => p.use === 'open' && p.key !== 'workspaces');
const CODE = KIT_PROGRAMS.filter((p) => p.use === 'code');
const GATEWAY = 'ssh hoody.com';
// The command-line fold, written for hoody.com and pointed at the platform the Hub runs on (kit platformText); the sign-in
// names the platform only when it is not the CLI's default (kit cliCommand).
const INSTALL = 'curl -fsSL https://install.hoody.com | sh';

export function Connect({ c, canSshKey, onSshKey }: { c: Computer; canSshKey: boolean; onSshKey: () => void }) {
  const t = useStrings(strings);
  const hosts = currentPlatformHosts();
  const out = useOut();
  const running = bucket(c.status) === 'running';
  const host = sshHost(c);
  const keyOn = hasSshKey(c);
  const open = (u: string) => openOutside(u);
  // A program with a page opens (a click on its address too, while running); one used from code is copied only.
  const programs = (list: readonly (typeof KIT_PROGRAMS)[number][]) => (
    <AddressList>
      {list.map(({ key: p, slug, use }) => {
        const u = kitProgramUrl(c, slug);
        if (!u) return null;
        const what = t(`program.${p}`);
        return (
          <AddressRow
            key={p}
            name={
              <>
                <Icon name={ICON[p]} />
                <strong>{what}</strong>
              </>
            }
            url={u}
            open={use === 'open' && running}
            actions={
              <>
                <CopyButton text={u} label={t('copy.what', { what })} size="md" />
                <QrButton url={u} name={what} reach={qrReachOf(slug)} resetKey={c.id} />
                {use === 'open' ? (
                  <>
                    {p === 'files' ? <MountButton name={c.name} url={u} pcHref={filesLinks.pc(computerHandle(c))} isDisabled={!running} compact /> : null}
                    <IconButton icon="external" variant="ghost" label={t('connect.open', { what })} isDisabled={!running} onPress={() => open(u)} />
                    <BoardAddButton computer={subjectOf(c)} program={p} what={what} size="md" isDisabled={!running} />
                  </>
                ) : null}
              </>
            }
          />
        );
      })}
    </AddressList>
  );

  // SSH: the command as a code block, whose Copy is always shown (the section's one thing to take away, never a
  // hover-only control), and whether a key is set as a fact; the key's own action is the section's.
  const sshFacts: Fact[] = [
    ...(host ? [] : [{ label: t('ssh.direct.command'), value: t('ssh.direct.noHost') }]),
    { label: t('ssh.fact.key'), value: keyOn ? t('ssh.key.on') : t('ssh.key.off') },
  ];
  const keyAction: ActionSpec | undefined = canSshKey ? { id: 'ssh-key', label: t(keyOn ? 'ssh.key.replace' : 'ssh.key.set'), icon: 'key', onPress: onSshKey, opens: 'dialog' } : undefined;
  const manage: ActionSpec | undefined = out.has.keys ? { id: 'ssh-keys', label: t('ssh.key.manage'), onPress: () => out.sshKeys() } : undefined;

  return (
    <div className={s.stack}>
      {/* The two program lists are kit sections; tests and the page's layout spec find them by these ids. */}
      <AnatomySection id="connect-links" title={t('connect.links')} description={running ? t('connect.linksLede') : t('connect.linksStopped', { name: c.name })}>
        {programs(OPEN)}
      </AnatomySection>

      <AnatomySection id="connect-api" title={t('connect.api')} description={t('connect.apiLede')}>
        {programs(CODE)}
      </AnatomySection>

      <AnatomySection
        id="connect-ssh"
        title={t('ssh.title')}
        description={t('ssh.lede', { name: c.name })}
        actions={{ ...(keyAction ? { primary: keyAction } : {}), ...(manage ? { secondary: [manage] as const } : {}) }}
      >
        {host ? <CodeBlock code={`ssh ${host}`} label={t('ssh.direct.command')} prompt wrap lang="shell" /> : null}
        <Facts items={sshFacts} columns={1} label={t('ssh.title')} />
        <Disclosure title={t('ssh.cli.title')} description={t('ssh.cli.body', { name: c.name })}>
          {/* Two steps, each command with its own Copy; where the installer comes from is the first step's note and the
              libraries for code the second's. */}
          <StepList
            label={t('ssh.cli.title')}
            groups={[
              {
                where: t('ssh.cli.where'),
                items: [
                  {
                    id: 'install',
                    text: <>{t('ssh.cli.install')} <CodeLine value={platformText(INSTALL, hosts)} copyLabel={t('ssh.cli.installCopy')} /></>,
                    note: <Link href={`https://${hosts.install}`} variant="nav" iconEnd="external">{t('ssh.cli.from')}</Link>,
                  },
                  {
                    id: 'login',
                    text: <>{t('ssh.cli.login')} <CodeLine value={cliCommand('login', hosts)} copyLabel={t('ssh.cli.loginCopy')} /></>,
                    note: <Link href={`https://${hosts.sdk}`} variant="nav" iconEnd="external">{t('ssh.cli.sdk')}</Link>,
                  },
                ],
              },
            ]}
          />
        </Disclosure>
        <Disclosure title={t('ssh.gateway.title')} description={t('ssh.gateway.body')}>
          <StepList
            label={t('ssh.gateway.title')}
            groups={[
              {
                where: t('ssh.cli.where'),
                items: [
                  {
                    id: 'gateway',
                    text: <>{t('ssh.gateway.command')} <CodeLine value={GATEWAY} copyLabel={t('ssh.gateway.copy')} /></>,
                    note: <Link href="https://ssh.hoody.com" variant="nav" iconEnd="external">{t('ssh.gateway.link')}</Link>,
                  },
                ],
              },
            ]}
          />
        </Disclosure>
      </AnatomySection>
    </div>
  );
}
