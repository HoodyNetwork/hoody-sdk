// SshKeyHelp: the one way the Hub explains getting an SSH key, wherever a key is added (Keys > SSH
// key, the SSH key drawer, the Get a computer form). Two ways, per system (Windows, macOS, Linux):
// - Make one here: WebCrypto Ed25519 (sshKey.ts). The private file is downloaded once, then wiped from memory; it is
//   never stored, logged, shown or sent. The public line shows only after that download, so nobody sets a key whose
//   private half they never got. Wiped too on a route change, a context end (realm switch, sign-out) and unmount.
// - Or a terminal: ssh-keygen with the computer's own file name.
// Each key gets its own file, named for the computer plus a random tag (sshKeyFileName): the API refuses a key another
// computer already uses, so reusing id_ed25519 would fail, and a new key must never overwrite an older one. Every
// command, the move, the connect line and the SSH config, uses that one name. The config takes ~/ (OpenSSH expands it
// on every system; it does not read PowerShell's $env:).
import { useEffect, useRef, useState } from 'react';
import { save } from '@core';
import { Button } from '../controls/Button';
import { Disclosure } from '../controls/Disclosure';
import { SegmentedControl } from '../controls/SegmentedControl';
import { CodeBlock, type CodeLine } from '../data/Ids';
import { Row, Stack } from '../layouts/Stack';
import { useStrings } from '../strings';
import f from './fields.module.css';
import { useFieldLock } from './lock';
import { makeSshKey, sshKeyFileName, sshKeyTag } from './sshKey';
import { useWipeOn } from './wipe';
import strings from './SshKeyHelp.strings.en.json';
import { OSES, guessKeyOs, sshKeyCommands, type KeyOs } from './SshKeyHelp.pure';

export { guessKeyOs, sshKeyCommands, type KeyOs } from './SshKeyHelp.pure';

/** The private file is a few hundred bytes; anything bigger is not this key. */
const MAX_KEY_BYTES = 8192;

type Made = { state: 'idle' } | { state: 'making' } | { state: 'unsupported' } | { state: 'notSaved' } | { state: 'made'; file: string } | { state: 'saved'; file: string; publicLine: string };

export interface SshKeyHelpProps {
  /** The computer's SSH address, when it has one: the steps end with the connect command. */
  host?: string;
  /** The computer's name: the key file is named for it (hoody-<name>). */
  computer?: string;
  /** The system shown first (defaults to the browser's). */
  os?: KeyOs;
  defaultExpanded?: boolean;
  /** Puts a key made here into the form's field ("Use this key"), with the file it was downloaded as. Without it,
   *  the public line is shown to copy. It answers whether the key was taken: true (or a promise of true) folds this
   *  help away; false, a rejection or no answer keeps it open, since a refused or unknown use is not taken (C9). */
  onKey?: (publicLine: string, file: string) => void | boolean | Promise<boolean>;
  /** Pressing Use sets the key on the computer (Keys > SSH key) instead of filling a form's field: its words say so. */
  useSets?: boolean;
  /** Every key line the host has started sending for this computer, by any path (its own Save too). Once this key is
   *  among them, the status line under Use goes for good: the host's own outcome says what happened, and a send whose
   *  outcome was never proved never reads as "nothing was sent" again (C9). */
  sentKeys?: readonly string[];
}

/** The steps for a downloaded key: make the .ssh folder, move the file there, and connect with it (when a host is
 *  known). The made key keeps the name it was made with, even if the computer's name is edited after. */
function SavedSteps({ os, file, host }: { os: KeyOs; file: string; host?: string }) {
  const t = useStrings(strings);
  const k = sshKeyCommands(os, file, host);
  const step = (caption: string, code: string): CodeLine => ({ caption, code, copyLabel: t('sshhelp.copyStep', { caption }) });
  return (
    <>
      <CodeBlock
        label={t('sshhelp.saved.steps')}
        lang="shell"
        lines={[
          step(t('sshhelp.folder'), k.folder),
          step(t(`sshhelp.move.${os}`), k.move),
          ...(k.connect ? [step(t('sshhelp.connect'), k.connect)] : []),
        ]}
      />
      <p className={f.description}>{t('sshhelp.moveElsewhere')}</p>
    </>
  );
}

/** The same key: its type and key data (the comment may differ). */
const sameKey = (a: string, b: string): boolean => a.trim().split(/\s+/).slice(0, 2).join(' ') === b.trim().split(/\s+/).slice(0, 2).join(' ');

export interface SshKeyFinishProps {
  /** The key file's name as it was downloaded (sshKeyFileName). */
  file: string;
  host?: string;
  os?: KeyOs;
}

/** After a key made here was set: the steps to put its private half in place and connect, per system. */
export function SshKeyFinish({ file, host, os }: SshKeyFinishProps) {
  const t = useStrings(strings);
  const [shown, setShown] = useState<KeyOs>(() => os ?? guessKeyOs());
  return (
    <Stack gap={2}>
      <SegmentedControl label={t('sshhelp.os')} items={OSES.map((id) => ({ id, label: t(`sshhelp.os.${id}`) }))} value={shown} onChange={setShown} />
      <SavedSteps os={shown} file={file} {...(host ? { host } : {})} />
    </Stack>
  );
}

export function SshKeyHelp({ host, computer, os, defaultExpanded, onKey, useSets, sentKeys }: SshKeyHelpProps) {
  const t = useStrings(strings);
  const [shown, setShown] = useState<KeyOs>(() => os ?? guessKeyOs());
  const [made, setMade] = useState<Made>({ state: 'idle' });
  const [used, setUsed] = useState(false);
  // Use this key fills the enclosing Form, so it waits while that Form is locked (C9); Make, Download and Discard send
  // nothing to the form and stay live.
  const locked = useFieldLock();
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  // The fold's title, focused when a taken key folds the help away (the pressed button goes with it).
  const box = useRef<HTMLDivElement>(null);
  // Bumped by every Use press and every wipe: only the answer of the latest press, for the key still shown, folds.
  const useGen = useRef(0);
  // The terminal steps' name: one tag per mount, so every command shown names the same new file.
  const [tag] = useState(sshKeyTag);
  const file = sshKeyFileName(computer, tag);
  const cmd = sshKeyCommands(shown, file, host);

  // The private file lives here only, never in state: wiped after its one download or on any end below.
  const priv = useRef<{ bytes: Uint8Array; publicLine: string } | null>(null);
  // Bumped by every wipe: a key still being made when the place ended is wiped as it arrives, never shown.
  const gen = useRef(0);
  const wipe = () => {
    gen.current++;
    priv.current?.bytes.fill(0);
    priv.current = null;
    setMade((m) => (m.state === 'idle' || m.state === 'unsupported' || m.state === 'notSaved' ? m : { state: 'idle' }));
    setUsed(false);
    useGen.current++;
  };
  useWipeOn(wipe);
  useEffect(
    () => () => {
      gen.current++;
      priv.current?.bytes.fill(0);
      priv.current = null;
    },
    [],
  );

  const make = async () => {
    wipe();
    const mine = gen.current;
    setMade({ state: 'making' });
    // A key made here gets its own tag: a second key never shares the first one's file name.
    const keyFile = sshKeyFileName(computer, sshKeyTag());
    const pair = await makeSshKey(keyFile);
    if (gen.current !== mine) {
      pair?.privateFile.fill(0);
      return;
    }
    if (!pair) {
      setMade({ state: 'unsupported' });
      return;
    }
    priv.current = { bytes: pair.privateFile, publicLine: pair.publicLine };
    setMade({ state: 'made', file: keyFile });
  };

  const download = () => {
    const held = priv.current;
    if (!held || made.state !== 'made') return;
    // Once only: the bytes are wiped whether or not the browser kept the file ("Didn't get the file?" makes another),
    // and when the download itself fails (then nothing public is offered: that key can never be used).
    let ok = false;
    try {
      ok = 'ok' in save(made.file, [held.bytes], { maxBytes: MAX_KEY_BYTES });
    } catch {
      ok = false;
    } finally {
      held.bytes.fill(0);
      priv.current = null;
    }
    setMade(ok ? { state: 'saved', file: made.file, publicLine: held.publicLine } : { state: 'notSaved' });
  };

  // Each caption is an instruction ("Copy the public key"), so its Copy button names the command, never "Copy Copy …".
  const step = (caption: string, code: string): CodeLine => ({ caption, code, copyLabel: t('sshhelp.copyStep', { caption }) });
  const steps: CodeLine[] = [
    step(t('sshhelp.folder'), cmd.folder),
    step(t('sshhelp.makeCmd'), cmd.make),
    step(t(`sshhelp.copy.${shown}`), cmd.copy),
    ...(cmd.connect ? [step(t('sshhelp.connect'), cmd.connect)] : []),
  ];

  // The SSH config lines name the key made here once it is downloaded, else the terminal steps' file.
  const cfg = sshKeyCommands(shown, made.state === 'saved' ? made.file : file, host);

  return (
    <div ref={box}>
      <Disclosure title={t('sshhelp.title')} isExpanded={expanded} onExpandedChange={setExpanded}>
        <Stack gap={3}>
          <SegmentedControl label={t('sshhelp.os')} items={OSES.map((id) => ({ id, label: t(`sshhelp.os.${id}`) }))} value={shown} onChange={setShown} />
          <p className={f.description}>{t('sshhelp.one', { file })}</p>

          <section aria-label={t('sshhelp.make.title')}>
            <Stack gap={2}>
              <p>
                <strong>{t('sshhelp.make.title')}</strong>
              </p>
              <p className={f.description}>{t('sshhelp.make.body')}</p>
              <div role="status">
                {made.state === 'unsupported' && <p className={f.description}>{t('sshhelp.make.unsupported')}</p>}
                {made.state === 'notSaved' && <p className={f.description}>{t('sshhelp.made.notSaved')}</p>}
                {made.state === 'made' && <p className={f.description}>{t('sshhelp.made.body')}</p>}
                {made.state === 'saved' && <p className={f.description}>{t('sshhelp.saved.body', { file: made.file })}</p>}
              </div>
              {made.state === 'idle' || made.state === 'making' || made.state === 'notSaved' ? (
                <Row>
                  <Button size="sm" busy={made.state === 'making'} onPress={() => void make()}>
                    {made.state === 'making' ? t('sshhelp.make.busy') : t('sshhelp.make.go')}
                  </Button>
                </Row>
              ) : null}
              {made.state === 'made' && (
                <Row wrap>
                  <Button size="sm" variant="primary" icon="download" onPress={download}>
                    {t('sshhelp.made.download')}
                  </Button>
                  <Button size="sm" variant="ghost" onPress={wipe}>
                    {t('sshhelp.made.discard')}
                  </Button>
                </Row>
              )}
              {made.state === 'saved' && (
                <>
                  <SavedSteps os={shown} file={made.file} {...(host ? { host } : {})} />
                  <CodeBlock
                    label={t('sshhelp.saved.public')}
                    code={made.publicLine}
                    lang="plain" // reason: a key is data, not code
                    wrap
                  />
                  <Row wrap>
                    {onKey && (
                      <Button
                        size="sm"
                        variant="primary"
                        isDisabled={locked}
                        onPress={() => {
                          const mine = ++useGen.current;
                          const taken = onKey(made.publicLine, made.file);
                          setUsed(true);
                          void Promise.resolve(taken).then(
                            (ok) => {
                              if (ok !== true || useGen.current !== mine) return;
                              // Focus moves to the title only when it was inside the help, which the fold hides; a
                              // person who moved on while a slow answer was out keeps their place.
                              const inside = box.current?.contains(document.activeElement) ?? false;
                              setExpanded(false);
                              if (inside) box.current?.querySelector<HTMLElement>('[slot="trigger"]')?.focus();
                            },
                            () => undefined,
                          );
                        }}
                      >
                        {t(useSets ? 'sshhelp.saved.useSet' : 'sshhelp.saved.use')}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onPress={() => void make()}>
                      {t('sshhelp.saved.again')}
                    </Button>
                  </Row>
                  <div role="status">
                    {onKey && !sentKeys?.some((k) => sameKey(k, made.publicLine)) && (
                      <p className={f.description}>
                        {used ? t('sshhelp.saved.used') : computer ? t('sshhelp.saved.notYetOn', { computer }) : t('sshhelp.saved.notYet')}
                      </p>
                    )}
                  </div>
                </>
              )}
            </Stack>
          </section>

          <section aria-label={t('sshhelp.term.title')}>
            <Stack gap={2}>
              <p>
                <strong>{t('sshhelp.term.title')}</strong>
              </p>
              <p className={f.description}>{t(`sshhelp.intro.${shown}`)}</p>
              <CodeBlock label={t('sshhelp.steps')} lines={steps} lang="shell" />
              <p className={f.description}>{t('sshhelp.passphrase')}</p>
              <p className={f.description}>{t('sshhelp.where', { file })}</p>
              <p className={f.description}>{t('sshhelp.private', { file })}</p>
            </Stack>
          </section>

          {cfg.config ? (
            <>
              <p className={f.description}>{t('sshhelp.config', { path: cfg.configPath })}</p>
              <CodeBlock label={t('sshhelp.config', { path: cfg.configPath })} code={cfg.config} lang="shell" />
            </>
          ) : (
            <p className={f.description}>{t('sshhelp.connectLater')}</p>
          )}
        </Stack>
      </Disclosure>
    </div>
  );
}
