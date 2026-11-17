// The Setup drawer: how to connect a laptop to the computer named in its title. A calm Verdict says what you get; one flat
// Track holds the steps: What to connect (two choices), On the laptop (host and port, then an Advanced fold with the
// computer port and the password box), Run it on the laptop (the copy-paste CLI or SDK text built by setup.ts, the one
// framed step), and a wait row naming the outcome. Every sentence sits in a kit place: a step's why line, a field's
// description, a Why, a step foot; a warning about a field sits under that field (Band attach); FAQ links sit only in a Why
// or a band's actions. Nothing is sent from here: the laptop opens the tunnel, and the live list shows it (new rows get a
// "New" mark).
import { portAddress, type Target } from '@core';
import { AddressField, Band, Checkbox, CodeBlock, Disclosure, Drawer, FaqLink, Facts, RadioGroup, Row, SegmentedControl, Stack, TextButton, TextField, Track, TrackStep, Verdict, Why, cliCommand, currentPlatformHosts, maskId, platformText, useStrings, type TrackState } from '@kit';
import { useMemo, useState } from 'react';
import { pageFaq } from '../faq';
import { buildSetup, checkSetup, kitUserErrorKey, riskyPorts, type SetupInput, type SetupMode } from '../setup';
import strings from '../strings.en.json';

export interface SetupProps {
  isOpen: boolean;
  onClose: () => void;
  computerId: string;
  /** The computer's name, said in the title and the lines that are about it. */
  computerName: string;
  target: Target | null;
  /** The Hub's own reads were refused: the computer likely asks for a password, so the box starts ticked (Advanced open). */
  loginLikely: boolean;
  access?: (() => void) | undefined;
  keys?: (() => void) | undefined;
}

// Written for hoody.com and pointed at the platform the Hub runs on (kit platformText); the sign-in names the platform only
// when it is not the CLI's default (kit cliCommand).
const INSTALL = 'curl -fsSL https://install.hoody.com | sh';
const SDK_INSTALL = 'npm install hoody-sdk';

export function Setup({ isOpen, onClose, computerId, computerName, target, loginLikely, access, keys }: SetupProps) {
  const t = useStrings(strings);
  const { byId } = pageFaq(t);
  const hosts = useMemo(() => currentPlatformHosts(), []);
  const [input, setInput] = useState<SetupInput>({ mode: 'expose', host: '', port: '3000', computerPort: '', kitLogin: loginLikely, kitUser: '' });
  const [tool, setTool] = useState<'cli' | 'sdk'>('cli');
  const [advancedOpen, setAdvancedOpen] = useState(loginLikely);
  const set = (patch: Partial<SetupInput>) => setInput((x) => ({ ...x, ...patch }));
  const check = useMemo(() => checkSetup(input), [input]);
  const built = check.ok ? buildSetup(check.value, computerId, hosts.api) : null;
  const problems = check.ok ? {} : check.problems;
  const expose = input.mode === 'expose';
  const name = { name: computerName };
  // A field inside Advanced that blocks the command keeps it open, and so does a risky computer port (its warning sits
  // under that field): what has to be fixed or seen is never folded away.
  const advancedBlocks = problems.computerPort !== undefined || problems.kitUser !== undefined;
  // The command shows the computer's id masked; Copy gives the whole command.
  const shown = (text: string) => text.split(computerId).join(maskId(computerId));

  // The one open step: the laptop's fields while one blocks the command, else running it.
  const fieldsBlock = !built;
  const laptopState: TrackState = fieldsBlock ? 'now' : 'done';
  const runState: TrackState = fieldsBlock ? 'later' : 'now';
  // Where the tunnel will answer, once the fields say it: a web address, or a port inside the computer. Unknown until
  // it connects when the computer picks the port.
  const shownAt =
    expose && built?.previewPort != null && target ? (
      <AddressField url={portAddress(target.project, target.container, built.previewPort)} label={t('web.label', { port: built.previewPort })} resetKey={computerId} />
    ) : !expose && built?.inside ? (
      <Facts columns={1} items={[{ label: t('fact.inside'), value: built.inside, mono: true, copy: built.inside }]} />
    ) : null;
  // The risky-port warning sits under the port it is about: the laptop's, the computer's, or both.
  const risky = check.ok ? riskyPorts(check.value) : { laptop: false, computer: false };
  const privileged = built?.warnings.includes('privileged') ?? false;
  const otherHost = built?.warnings.includes('otherHost') ?? false;

  const hostField = (
    <TextField label={t('setup.host')} description={t('setup.host.hint')} value={input.host} onChange={(host) => set({ host })} errorMessage={problems.host === 'v4only' ? t('setup.err.v4only') : problems.host ? t('setup.err.host') : undefined} mono />
  );
  const portField = (
    <TextField label={t('setup.port')} inputMode="numeric" value={input.port} onChange={(port) => set({ port })} errorMessage={problems.port ? t('setup.err.port') : undefined} mono />
  );
  const computerPortField = (
    <TextField
      label={t('setup.computerPort', name)}
      description={expose ? t('setup.computerPort.hint') : t('setup.computerPort.hint.pull', name)}
      inputMode="numeric"
      value={input.computerPort}
      onChange={(computerPort) => set({ computerPort })}
      errorMessage={problems.computerPort === 'low' ? t('setup.err.low') : problems.computerPort ? t('setup.err.computerPort') : undefined}
      mono
    />
  );

  return (
    <Drawer overlayId="tunnels-setup" resizeKey="tunnels-setup" isOpen={isOpen} onOpenChange={(open) => !open && onClose()} title={t('setup.title', name)} size="md" cancel={t('setup.close')}>
      <Stack gap={6}>
        <Verdict label={t('setup.verdict')} next={t(fieldsBlock ? 'setup.next.fix' : 'setup.next')}>
          {t(expose ? 'setup.intro' : 'setup.intro.pull', name)}
        </Verdict>
        <Track label={t('setup.track')} flat open={fieldsBlock ? 'laptop' : 'run'}>
          <TrackStep id="what" state="done" name={t('setup.what')}>
            <RadioGroup<SetupMode>
              // The step above is its visible heading; the group keeps the same name for assistive tech.
              aria-label={t('setup.what')}
              variant="cards"
              value={input.mode}
              onChange={(mode) => set({ mode })}
              options={[
                { value: 'expose', label: t('setup.expose'), description: t('setup.expose.hint') },
                { value: 'pull', label: t('setup.pull'), description: t('setup.pull.hint') },
              ]}
            />
            <Why question={t('setup.twoWays.more')} faq={{ item: byId.twoWays, label: t('setup.twoWays.link') }}>
              {t('setup.what.why')}
            </Why>
          </TrackStep>

          <TrackStep id="laptop" state={laptopState} name={t('setup.where')}>
            <Stack gap={4}>
              <Row gap={4} wrap align="start">
                {/* A warning sits under the field it is about, and the field names it. The band stays mounted with nothing to
                    say while the warning does not apply, so the field never remounts under the person's typing. */}
                <Band tone="warn" /* noDetails: a warning about the person's own choice; nothing was sent */ attach={hostField}>
                  {otherHost ? (expose ? t('setup.warn.otherHost') : t('setup.warn.otherHost.pull', name)) : null}
                </Band>
                <Band tone="warn" /* noDetails: a warning about the person's own choice; nothing was sent */ attach={portField} actions={risky.laptop ? <FaqLink item={byId.riskyPorts}>{t('setup.risky.more')}</FaqLink> : null}>
                  {risky.laptop ? t('setup.warn.risky') : null}
                </Band>
              </Row>
              {/* Not on the laptop: the computer's side, and rarely needed (a web address needs no fixed port). */}
              <Disclosure title={t('setup.advanced')} description={t('setup.advanced.hint', name)} isExpanded={advancedOpen || advancedBlocks || risky.computer} onExpandedChange={setAdvancedOpen}>
                <Stack gap={4}>
                  <Band tone={risky.computer ? 'warn' : 'neutral'} /* noDetails: a warning about the person's own choice; nothing was sent */ attach={computerPortField} actions={risky.computer ? <FaqLink item={byId.riskyPorts}>{t('setup.risky.more')}</FaqLink> : null}>
                    {risky.computer || privileged ? [risky.computer ? t('setup.warn.risky') : null, privileged ? t('setup.warn.privileged') : null].filter(Boolean).join(' ') : null}
                  </Band>
                  <Checkbox label={t('setup.login', name)} description={t('setup.login.hint', name)} isSelected={input.kitLogin} onChange={(kitLogin) => set({ kitLogin })} />
                  {input.kitLogin && (
                    <TextField label={t('setup.user')} value={input.kitUser} onChange={(kitUser) => set({ kitUser })} errorMessage={problems.kitUser ? t(kitUserErrorKey(problems.kitUser)) : undefined} />
                  )}
                </Stack>
              </Disclosure>
            </Stack>
          </TrackStep>

          <TrackStep id="run" state={runState} name={t('setup.run')} why={t(!built ? 'setup.fixFirst' : tool === 'sdk' ? 'setup.run.why.sdk' : 'setup.run.why')}>
            <Stack gap={4}>
              <SegmentedControl<'cli' | 'sdk'>
                label={t('setup.tool')}
                value={tool}
                onChange={setTool}
                items={[
                  { id: 'cli', label: t('setup.tool.cli') },
                  { id: 'sdk', label: t('setup.tool.sdk') },
                ]}
              />
              {!built ? null : tool === 'cli' ? (
                <CodeBlock
                  label={t('setup.tool.cli')}
                  prompt
                  lang="shell"
                  lines={[
                    { caption: t('setup.step.install'), code: platformText(INSTALL, hosts) },
                    { caption: t('setup.step.signIn'), code: cliCommand('login', hosts) },
                    { caption: t('setup.step.open'), code: shown(built.cli), copy: built.cli },
                  ]}
                  footer={t(input.kitLogin ? 'setup.cli.footer.login' : 'setup.cli.footer')}
                />
              ) : (
                <CodeBlock
                  label={t('setup.tool.sdk')}
                  lang="ts"
                  lines={[
                    { caption: t('setup.step.install'), code: SDK_INSTALL },
                    { caption: t('setup.step.program'), code: shown(built.sdk), copy: built.sdk },
                  ]}
                  footer={t('setup.sdk.footer')}
                />
              )}
              <Why question={t('setup.fails')} faq={{ item: byId.fails, label: t('setup.fails.more') }}>
                {t('setup.fails.why')}
              </Why>
            </Stack>
          </TrackStep>

          {/* The outcome: where the tunnel shows up, and who can open it. The Hub sees it in the live list, not here. */}
          <TrackStep
            id="online"
            state="wait"
            name={expose ? t('setup.wait.expose') : t('setup.wait.pull', name)}
            why={t(shownAt ? 'setup.listed' : expose ? 'setup.address.later' : 'setup.inside.later')}
            foot={{
              say: expose ? t('access.line') : null,
              secondary:
                expose && (access || keys) ? (
                  <>
                    {access && <TextButton onPress={access}>{t('access.settings')}</TextButton>}
                    {keys && <TextButton onPress={keys}>{t('access.keys')}</TextButton>}
                  </>
                ) : null,
            }}
          >
            {shownAt}
          </TrackStep>
        </Track>
      </Stack>
    </Drawer>
  );
}
