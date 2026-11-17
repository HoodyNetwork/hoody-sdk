// SshKeyHelp in the terminal: the same fold, system choice and terminal steps as the web (SshKeyHelp.pure.ts holds the
// commands), with one difference. "Make one here" is the web's browser-made key, downloaded once to the person's own
// machine. A terminal Hub runs on a computer (often over SSH), so a key made here would be written where the Hub runs,
// not where the person connects from, and its private half would have to travel. The terminal never makes a key: that
// section is a hand-off to the web Hub, and the ssh-keygen steps below it are the terminal's way. So `onKey`, `useSets`
// and `sentKeys` (which follow a key made here) never come into play.
// The first system shown is the one this terminal runs on (process.platform: darwin is macOS, never Windows), else the
// `os` prop; the person switches it to their own machine's.
import { useState } from 'react';
import type * as Web from './SshKeyHelp';
import { Box, Text } from '../../term/prim';
import { Disclosure } from '../controls/Disclosure';
import { SegmentedControl } from '../controls/SegmentedControl';
import { CodeBlock, type CodeLine } from '../data/Ids';
import { Handoff } from '../states/Handoff';
import { useStrings } from '../strings';
import { OSES, sshKeyCommands, type KeyOs } from './SshKeyHelp.pure';
import { sshKeyFileName, sshKeyTag } from './sshKey';
import strings from './SshKeyHelp.strings.en.json';
import termStrings from './term.strings.en.json';

export { guessKeyOs, sshKeyCommands, type KeyOs } from './SshKeyHelp.pure';
export type { SshKeyHelpProps, SshKeyFinishProps } from './SshKeyHelp';

/** The system this terminal runs on, as a KeyOs (Node's names: win32, darwin, linux, ...). */
function termOs(): KeyOs {
  const p = (globalThis as { process?: { platform?: string } }).process?.platform ?? '';
  return p === 'win32' ? 'windows' : p === 'darwin' ? 'mac' : 'linux';
}

const Para = ({ children, muted = true }: { children: string; muted?: boolean }) => (
  <Text colour={muted ? 'muted' : undefined}>
    {children}
  </Text>
);

function OsChoice({ value, onChange }: { value: KeyOs; onChange: (os: KeyOs) => void }) {
  const t = useStrings(strings);
  return <SegmentedControl label={t('sshhelp.os')} items={OSES.map((id) => ({ id, label: t(`sshhelp.os.${id}`) }))} value={value} onChange={onChange} />;
}

export const SshKeyFinish: typeof Web.SshKeyFinish = ({ file, host, os }) => {
  const t = useStrings(strings);
  const [shown, setShown] = useState<KeyOs>(() => os ?? termOs());
  const k = sshKeyCommands(shown, file, host);
  const step = (caption: string, code: string): CodeLine => ({ caption, code, copyLabel: t('sshhelp.copyStep', { caption }) });
  return (
    <Box gap={1}>
      <OsChoice value={shown} onChange={setShown} />
      <CodeBlock
        label={t('sshhelp.saved.steps')}
        lang="shell"
        lines={[step(t('sshhelp.folder'), k.folder), step(t(`sshhelp.move.${shown}`), k.move), ...(k.connect ? [step(t('sshhelp.connect'), k.connect)] : [])]}
      />
      <Para>{t('sshhelp.moveElsewhere')}</Para>
    </Box>
  );
};

export const SshKeyHelp: typeof Web.SshKeyHelp = ({ host, computer, os, defaultExpanded }) => {
  const t = useStrings(strings);
  const tt = useStrings(termStrings);
  const [shown, setShown] = useState<KeyOs>(() => os ?? termOs());
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  // One tag per mount, so every command shown names the same new file (as on the web).
  const [tag] = useState(sshKeyTag);
  const file = sshKeyFileName(computer, tag);
  const cmd = sshKeyCommands(shown, file, host);
  const step = (caption: string, code: string): CodeLine => ({ caption, code, copyLabel: t('sshhelp.copyStep', { caption }) });
  const steps: CodeLine[] = [
    step(t('sshhelp.folder'), cmd.folder),
    step(t('sshhelp.makeCmd'), cmd.make),
    step(t(`sshhelp.copy.${shown}`), cmd.copy),
    ...(cmd.connect ? [step(t('sshhelp.connect'), cmd.connect)] : []),
  ];
  return (
    <Disclosure title={t('sshhelp.title')} isExpanded={expanded} onExpandedChange={setExpanded}>
      <Box gap={1}>
        <OsChoice value={shown} onChange={setShown} />
        <Para>{t('sshhelp.one', { file })}</Para>
        <Box gap={0} sem={{ role: 'region', name: t('sshhelp.make.title') }}>
          <Text bold>{t('sshhelp.make.title')}</Text>
          <Handoff what={tt('sshhelp.makeWhat')} reason={tt('sshhelp.makeReason')} />
        </Box>
        <Box gap={0} sem={{ role: 'region', name: t('sshhelp.term.title') }}>
          <Text bold>{t('sshhelp.term.title')}</Text>
          <Para>{t(`sshhelp.intro.${shown}`)}</Para>
        </Box>
        <CodeBlock label={t('sshhelp.steps')} lines={steps} lang="shell" />
        <Para>{t('sshhelp.passphrase')}</Para>
        <Para>{t('sshhelp.where', { file })}</Para>
        <Para>{t('sshhelp.private', { file })}</Para>
        {cmd.config ? (
          <>
            <Para>{t('sshhelp.config', { path: cmd.configPath })}</Para>
            <CodeBlock label={t('sshhelp.config', { path: cmd.configPath })} code={cmd.config} lang="shell" />
          </>
        ) : (
          <Para>{t('sshhelp.connectLater')}</Para>
        )}
      </Box>
    </Disclosure>
  );
};
