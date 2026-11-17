// Network tab, "Use <name> as a proxy": the computer's proxy address and how to use it. Every Kit computer runs an HTTP
// proxy reached over TLS on port 443 of its egress address. It tunnels https and forwards plain http, dials public IPv4
// only, and has no login of its own: the address is the credential, so it shows masked and copies whole everywhere.
// The page keeps the address, Copy and the warning; "How to connect" holds the rest: the address and its values on the
// top plate, setup per browser or tool, and the ways to change where traffic leaves.
// Only what works is shown. A manual proxy field (Firefox, system settings, phone Wi-Fi) speaks plaintext to the proxy
// and is refused, so Firefox gets a PAC file, Chrome and Edge a window started with --proxy-server, and Safari and
// phones get no steps.
import { useEffect, useState } from 'react';
import { AnatomySection, Band, Button, CodeBlock, CodeLine as CodeValue, CopyButton, Drawer, Facts, Link, LinkButton, SegmentedControl, SettingGroup, SettingRow, StepList, SubSection, Tabs, Verdict, cliCommand, currentPlatformHosts, maskId, useStrings, type CodeLine, type Fact } from '@kit';
import { proxyUrl } from './ConnectProxy.pure';
export { proxyUrl } from './ConnectProxy.pure';
import { hostEnv, maskAddress } from '@core';
import { bucket } from '../logic';
import { DOCS_PERMISSIONS } from './Bits';
import type { Computer } from '../types';
import strings from './ConnectProxy.strings.en.json';
import s from './parts.module.css';

const DOCS_EGRESS = 'https://docs.hoody.com/kit/egress/';
const DOCS_VPN = 'https://docs.hoody.com/foundation/networking/vpn/';
/** Shows the address a site sees; opened through the proxy it shows the computer's (or its exit's). */
const CHECK_URL = 'https://ip.hoody.com';

/** A code block line that shows the address masked and copies it whole. */
const line = (code: string, caption?: string): CodeLine => ({ code: maskAddress(code), copy: code, caption });

type Group = 'browser' | 'scripts' | 'exit';
/** The browsers with steps. Safari and phones are listed but cannot be chosen: nothing works there yet. */
type Browser = 'firefox' | 'chrome' | 'system';
type Script = 'curl' | 'unix' | 'windows' | 'node';

export function ConnectProxy({ c }: { c: Computer }) {
  const t = useStrings(strings);
  const [how, setHow] = useState<Group | null>(null);
  const url = proxyUrl(c);
  // An address that goes away closes How to connect; it does not reopen by itself when the address returns.
  useEffect(() => {
    if (!url) setHow(null);
  }, [url]);
  const running = bucket(c.status) === 'running';
  return (
    <AnatomySection
      id="net-proxy"
      title={t('proxy.title', { name: c.name })}
      description={t('proxy.lede', { name: c.name })}
      info={t('proxy.uses', { name: c.name })}
      actions={url ? {
        primary: { id: 'proxy-browser', label: t('proxy.browser'), icon: 'guide', opens: 'dialog', onPress: () => setHow('browser') },
        secondary: [{ id: 'proxy-scripts', label: t('proxy.scripts'), opens: 'dialog', onPress: () => setHow('scripts') }],
      } : undefined}
      notices={
        <>
          <Band /* noDetails: a standing warning, nothing was refused */ tone="warn" size="table">
            {t('proxy.secret', { name: c.name })} <Link href={DOCS_PERMISSIONS}>{t('proxy.onlyMe.docs')}</Link>
          </Band>
          {url && !running ? <Band size="table">{t('proxy.stopped', { name: c.name })}</Band> : null}
        </>
      }
      state={{ kind: 'ready' }}
      note={url ? undefined : t('proxy.noAddress')}
    >
      {url ? <ProxyAddress url={url} /> : null}
      {url && how ? <HowToConnect c={c} url={url} start={how} onClose={() => setHow(null)} /> : null}
    </AnatomySection>
  );
}

/** The address as one value: masked on screen (never a link: a browser should not open a proxy), copied whole. */
function ProxyAddress({ url }: { url: string }) {
  const t = useStrings(strings);
  return <CodeValue value={maskAddress(url)} copy={url} copyLabel={t('proxy.copy')} />;
}

/** "How to connect": the address and its values, setup per browser or tool, and the ways to change the exit. */
function HowToConnect({ c, url, start, onClose }: { c: Computer; url: string; start: Group; onClose: () => void }) {
  const t = useStrings(strings);
  const [group, setGroup] = useState<Group>(start);
  const [browser, setBrowser] = useState<Browser>('firefox');
  const [tool, setTool] = useState<Script>('curl');
  const host = url.replace(/^https:\/\//, '');
  const bare = host.replace(/:443$/, '');
  const copyOf = (what: string) => t('proxy.copyField', { what });
  /** One tool or place: its name, what the lines do, then the lines (shell with the prompt, or the PAC file's JavaScript). */
  const block = (label: string, help: string, lines: CodeLine[], lang: 'shell' | 'js' = 'shell') => (
    <SubSection title={label} description={help}>
      <CodeBlock label={label} lines={lines} prompt={lang === 'shell'} lang={lang} wrap />
    </SubSection>
  );
  // The values an app asks for one by one. The server is the key: masked on screen, copied whole.
  const values: Fact[] = [
    { label: t('proxy.values.type'), value: <CodeValue value="HTTPS" copyLabel={copyOf(t('proxy.values.type'))} /> },
    { label: t('proxy.values.host'), value: <CodeValue value={maskAddress(bare)} copy={bare} copyLabel={copyOf(t('proxy.values.host'))} /> },
    { label: t('proxy.values.port'), value: <CodeValue value="443" copyLabel={copyOf(t('proxy.values.port'))} /> },
    { label: t('proxy.values.signin'), value: t('proxy.values.login') },
    { label: t('proxy.values.reaches'), value: t('proxy.values.reach') },
  ];
  const scriptsPane = (
    <div className={s.stack}>
      <SegmentedControl<Script>
        label={t('proxy.scripts.pick')}
        fullWidth
        value={tool}
        onChange={setTool}
        items={[
          { id: 'curl', label: t('proxy.tab.curl') },
          { id: 'unix', label: t('proxy.tab.unix') },
          { id: 'windows', label: t('proxy.tab.windows') },
          { id: 'node', label: t('proxy.tab.node') },
        ]}
      />
      {tool === 'curl'
        ? block(t('proxy.curl.label'), t('proxy.curl.help'), [
            line(`curl -x "${url}" https://example.com/`, t('proxy.curl.page')),
            line(`curl -x "${url}" ${CHECK_URL}`, t('proxy.curl.check')),
          ])
        : tool === 'unix'
          ? block(t('proxy.unix.label'), t('proxy.unix.help'), [line(`export https_proxy="${url}"`), line('export http_proxy="$https_proxy"')])
          : tool === 'windows'
            ? block(t('proxy.windows.label'), t('proxy.windows.help'), [line(`$env:HTTPS_PROXY = "${url}"`), line('$env:HTTP_PROXY = $env:HTTPS_PROXY')])
            : // Node's own fetch reads the standard variables once proxy support is on (the flag or its environment
              // variable): no package and no code change.
              block(t('proxy.node.label'), t('proxy.node.help'), [
                line(`export https_proxy="${url}"`),
                line('node --use-env-proxy app.js', t('proxy.node.flag')),
                line('NODE_USE_ENV_PROXY=1 node app.js', t('proxy.node.env')),
              ])}
    </div>
  );
  // Where traffic leaves can be changed outside the Hub: another proxy set on this one (an unusable one is refused,
  // never bypassed), the person's own machine, or a VPN inside the computer. Each names its docs page.
  const exitPane = (
    <div className={s.stack}>
      <SubSection title={t('proxy.exit.title')} description={t('proxy.exit.lede', { name: c.name })} />
      <SubSection
        title={t('proxy.exit.up.title')}
        description={t('proxy.exit.up.body', { name: c.name })}
        actions={{ secondary: [{ id: 'proxy-exit-up-docs', label: t('proxy.exit.up.docs'), href: `${DOCS_EGRESS}#upstream-proxies`, icon: 'external' }] }}
      >
        <CodeBlock
          label={t('proxy.exit.up.label')}
          prompt
          lang="shell"
          wrap
          // --noproxy: these reach the proxy's own settings, never through a proxy (a shell set up for it, or a
          // broken exit, would otherwise stand between them and the fix).
          lines={[
            line(`curl --noproxy '*' -X PUT -H 'Content-Type: text/plain' --data-binary 'socks5h://PROXY_HOST:1080' "${url}/api/v1/egress/upstream"`, t('proxy.exit.up.set')),
            line(`curl --noproxy '*' "${url}/api/v1/egress/upstream"`, t('proxy.exit.up.get')),
          ]}
        />
        {/* Its own block: Copy all on the block above never ends with the line that undoes it. */}
        <CodeBlock
          label={t('proxy.exit.off.label')}
          prompt
          lang="shell"
          wrap
          lines={[line(`curl --noproxy '*' -X DELETE "${url}/api/v1/egress/upstream"`, t('proxy.exit.up.off', { name: c.name }))]}
        />
      </SubSection>
      <SubSection
        title={t('proxy.exit.local.title')}
        description={t('proxy.exit.local.body')}
        actions={{ secondary: [{ id: 'proxy-exit-local-docs', label: t('proxy.exit.local.docs'), href: `${DOCS_EGRESS}#exit-from-your-own-machine`, icon: 'external' }] }}
      >
        <CodeBlock
          label={t('proxy.exit.local.label')}
          prompt
          lang="shell"
          wrap
          // A command run on its own: it names the platform only off the command line's default one (kit cliCommand).
          lines={[{ code: cliCommand(`--computer ${maskId(c.id)} egress local start`, currentPlatformHosts()), copy: cliCommand(`--computer ${c.id} egress local start`, currentPlatformHosts()), caption: t('proxy.exit.local.run') }]}
        />
      </SubSection>
      <SubSection
        title={t('proxy.exit.vpn.title', { name: c.name })}
        description={t('proxy.exit.vpn.body', { name: c.name })}
        actions={{ secondary: [{ id: 'proxy-exit-vpn-docs', label: t('proxy.exit.vpn.docs'), href: DOCS_VPN, icon: 'external' }] }}
      />
    </div>
  );
  return (
    <Drawer overlayId="computers-connect-proxy" resizeKey="computers-connect-proxy"
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('proxy.how')}
      subtitle={t('proxy.how.sub', { name: c.name })}
      size="md"
      reason={t('proxy.check', { name: c.name })}
      primary={
        <LinkButton href={CHECK_URL} variant="secondary" iconEnd="external">
          {t('proxy.check.open')}
        </LinkButton>
      }
      cancel={t('proxy.close')}
    >
      <div className={s.stack}>
        <Verdict
          label={t('proxy.v.label')}
          next={t('proxy.secret', { name: c.name })}
          slot={<ProxyAddress url={url} />}
          facts={<Facts items={values} columns={2} label={t('proxy.values.title')} />}
        >
          {t('proxy.v.sentence', { name: c.name })}
        </Verdict>
        <Tabs
          label={t('proxy.how')}
          value={group}
          onChange={setGroup}
          items={[
            { id: 'browser', label: t('proxy.browser'), content: <BrowserSetup c={c} url={url} browser={browser} onBrowser={setBrowser} /> },
            { id: 'scripts', label: t('proxy.scripts'), content: scriptsPane },
            { id: 'exit', label: t('proxy.exit.tab'), content: exitPane },
          ]}
        />
        <SettingGroup title={t('proxy.good.title')}>
          <SettingRow label={t('proxy.good.what')} help={t('proxy.what', { name: c.name })} />
          <SettingRow label={t('proxy.good.reach')} help={t('proxy.limits', { name: c.name })} />
          <SettingRow label={t('proxy.good.apps')} help={t('proxy.values.help')} />
          <SettingRow label={t('proxy.good.safari')} help={t('proxy.safari.help')} />
          <SettingRow label={t('proxy.good.phones')} help={t('proxy.phone.help')} />
        </SettingGroup>
      </div>
    </Drawer>
  );
}

/** The browser tab of How to connect: one browser at a time, its steps, and the one warning under them. A component of its
 *  own so its words count where they show: inside the drawer. */
function BrowserSetup({ c, url, browser, onBrowser }: { c: Computer; url: string; browser: Browser; onBrowser: (b: Browser) => void }) {
  const t = useStrings(strings);
  const host = url.replace(/^https:\/\//, '');
  const copyOf = (what: string) => t('proxy.copyField', { what });
  /** One value to type or paste, named before it; `shown` is the masked form of a value that holds the address. */
  const value = (label: string, whole: string, shown = whole) => (
    <>
      {label} <CodeValue value={shown} copy={whole} copyLabel={copyOf(label)} />{' '}
    </>
  );
  const pac = `function FindProxyForURL(url, host) {\n  return "HTTPS ${host}";\n}`;
  const winChrome = `chrome --proxy-server="${url}" --user-data-dir="%TEMP%\\hoody-proxy"`;
  const winEdge = `msedge --proxy-server="${url}" --user-data-dir="%TEMP%\\hoody-proxy-edge"`;
  const macChrome = `open -na "Google Chrome" --args --proxy-server="${url}" --user-data-dir="$TMPDIR/hoody-proxy"`;
  const macEdge = `open -na "Microsoft Edge" --args --proxy-server="${url}" --user-data-dir="$TMPDIR/hoody-proxy-edge"`;
  /** The window steps for one system, under its name: where to paste, the line per browser, what opens. */
  const windowSteps = (where: string, first: string, paste: string, chrome: string, edge: string) => (
    <SubSection title={where}>
      <StepList
        label={t('proxy.ce.steps', { where })}
        groups={[
          {
            items: [
              { id: 'open', text: first },
              { id: 'paste', text: paste, note: <>{value(t('proxy.ce.chrome'), chrome, maskAddress(chrome))}{value(t('proxy.ce.edge'), edge, maskAddress(edge))}</> },
              { id: 'browse', text: t('proxy.ce.3') },
            ],
          },
        ]}
      />
    </SubSection>
  );
  return (
    <div className={s.stack}>
      <SegmentedControl<Browser | 'safari' | 'phone'>
        label={t('proxy.browser.pick')}
        fullWidth
        value={browser}
        onChange={(v) => {
          if (v !== 'safari' && v !== 'phone') onBrowser(v);
        }}
        items={[
          { id: 'firefox', label: t('proxy.tab.firefox') },
          { id: 'chrome', label: t('proxy.tab.chromeEdge') },
          { id: 'system', label: t('proxy.tab.system') },
          // Listed so nobody hunts for them; why they cannot be chosen is their own row under Good to know.
          { id: 'safari', label: t('proxy.tab.safari'), isDisabled: true },
          { id: 'phone', label: t('proxy.tab.phone'), isDisabled: true },
        ]}
      />
      {browser === 'firefox' ? (
        <SubSection title={t('proxy.set.firefox')}>
          <StepList
            label={t('proxy.set.firefox')}
            groups={[
              { where: t('proxy.ff.where.computer'), items: [{ id: 'save', text: t('proxy.ff.1'), act: <DownloadPac text={pac} /> }] },
              {
                where: t('proxy.ff.where.firefox'),
                items: [
                  { id: 'settings', text: <>{t('proxy.ff.2')} <CodeValue value="proxy" copyLabel={copyOf(t('proxy.ff.2.word'))} /></>, note: t('proxy.ff.2.note') },
                  { id: 'auto', text: t('proxy.ff.3') },
                  {
                    id: 'path',
                    text: t('proxy.ff.4'),
                    note: (
                      <>
                        {t('proxy.ff.4.note')}{' '}
                        {value(t('proxy.ff.mac'), 'file:///Users/YOU/Downloads/proxy.pac')}
                        {value(t('proxy.ff.win'), 'file:///C:/Users/YOU/Downloads/proxy.pac')}
                      </>
                    ),
                  },
                  { id: 'ok', text: t('proxy.ff.5'), note: t('proxy.ff.5.note') },
                ],
              },
            ]}
          />
        </SubSection>
      ) : browser === 'chrome' ? (
        <SubSection title={t('proxy.set.chrome')} description={t('proxy.ce.why')}>
          {windowSteps(t('proxy.ce.win'), t('proxy.ce.win.1'), t('proxy.ce.win.2'), winChrome, winEdge)}
          {windowSteps(t('proxy.ce.mac'), t('proxy.ce.mac.1'), t('proxy.ce.mac.2'), macChrome, macEdge)}
        </SubSection>
      ) : (
        // The file, then the setup as one row per fact: where it must live, where each system takes it, what a miss does.
        <SubSection title={t('proxy.system.label')} description={t('proxy.system.help')}>
          <CodeBlock label={t('proxy.system.label')} lines={[line(pac, t('proxy.firefox.file'))]} prompt={false} lang="js" wrap />
          <SettingGroup title={t('proxy.system.setup')}>
            <SettingRow label={t('proxy.system.host')} help={t('proxy.system.host.help')} />
            <SettingRow label={t('proxy.system.enter')} help={t('proxy.system.enter.help')} />
            <SettingRow label={t('proxy.system.mac')} help={t('proxy.system.mac.path')} />
            <SettingRow label={t('proxy.system.win')} help={t('proxy.system.win.path')} />
            <SettingRow label={t('proxy.system.linux')} help={t('proxy.system.linux.path')} />
            <SettingRow label={t('proxy.system.fails')} help={t('proxy.system.fails.help')} />
          </SettingGroup>
        </SubSection>
      )}
      {/* The one warning of the browser setup, under its steps: a saved setup hands the address to whoever uses that browser. */}
      <Band /* noDetails: a standing warning, nothing was refused */ tone="warn" size="table">{t('proxy.browser.shared', { name: c.name })}</Band>
    </div>
  );
}

/** Saves the PAC file (it holds the proxy address): made only at the press, its object URL revoked right after. */
function DownloadPac({ text }: { text: string }) {
  const t = useStrings(strings);
  // A terminal has no document and cannot save a file to the device (core/host-env.ts `files`):
  // it copies the file's text, to be saved as proxy.pac by hand.
  if (hostEnv().browserPage !== true) return <CopyButton text={text} label={t('proxy.copyField', { what: 'proxy.pac' })} size="sm" />;
  const save = () => {
    const href = URL.createObjectURL(new Blob([text], { type: 'application/x-ns-proxy-autoconfig' }));
    const a = document.createElement('a');
    a.href = href;
    a.download = 'proxy.pac';
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 0);
  };
  return (
    <Button size="sm" icon="download" onPress={save}>
      {t('proxy.ff.download')}
    </Button>
  );
}
