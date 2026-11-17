// "Use with your agent": a quiet control a page places once, for the Hub's own Hoody Agent (no set-up) or the
// person's own agent with the Hoody skill (AskAgent asks the in-Hub Agent about one section instead). It opens a side
// drawer (the whole screen on a phone) with four tabs:
//   Prompts: what the prompts act on (the selected realm with its colour, the computer, the page's things), then the
//     page's main prompt, a hand-off where the agent asks the person what they want first, then a few one-task
//     starters. Each is shown whole with "Ask Hoody Agent" (the Ask panel's composer, never sent) and Copy (exactly
//     what is shown);
//   Set up: how each kind of own agent gets Hoody (coding agent, AI chat, terminal), the Guide's door lines, the
//     choice remembered in this browser;
//   Access: how the agent signs in, in plain words; in a realm, a key limited to that realm (no secret is ever shown
//     or made here);
//   Can do: the operations the Hoody skill offers on this page's things ("On this page"), then what the same agent
//     can do everywhere in Hoody ("Everywhere else": the same groups on every page), and what its sign-in limits.
// The footer keeps the Guide link and "Hide on this page" (remembered per page in this browser).
import { useId, useMemo, useState, type ReactNode } from 'react';
import { capture, isFramed, useRealms } from '@core';
import { askOn, focusAskDock, useAskDock } from '../ask';
import { Button } from '../controls/Button';
import { Link, TextButton } from '../controls/Link';
import { usePageLink } from '../../shell/pageLinks';
import { Tabs } from '../controls/Tabs';
import { Facts, type Fact } from '../data/Display';
import { CopyButton, IdChip } from '../data/Ids';
import { SystemSteps } from '../data/Steps';
import { ItemList } from '../layouts/anatomy/ItemList';
import { Drawer } from '../overlays/Drawer';
import { Notice } from '../states/Band';
import { useStrings, type Translate } from '../strings';
import strings from './AgentHint.strings.en.json';
import {
  AGENT_CAN_EVERYWHERE,
  AGENT_HINT_CAN,
  AGENT_HINT_REACH,
  AGENT_HINT_STARTERS,
  AGENT_KINDS,
  COMPUTERS_HREF,
  CONNECT_GUIDE_HREF,
  KEYS_GUIDE_HREF,
  NEW_KEY_HREF,
  SKILLS_GUIDE_HREF,
  agentHintScope,
  agentHintTarget,
  currentPlatformHosts,
  hideHint,
  mainPrompt,
  readAgentKind,
  readHiddenHints,
  saveAgentKind,
  setupLines,
  starterPrompt,
  type AgentHintFacts,
  type AgentHintPage,
  type AgentHintRealm,
  type AgentHintScope,
  type AgentKind,
} from './agentHints';
import s from './AgentHint.module.css';

type T = Translate<typeof strings>;
/** A key built from a page and an id (prompt, title, can-do row): agentHints lists them, AgentHint.test.tsx pins each. */
type Key = keyof typeof strings;
const k = (key: string) => key as Key;

export interface AgentHintProps {
  page: AgentHintPage;
  /** What the page shows now (core's useAgentScopeFacts): the realm and the computer its prompts name. */
  facts: AgentHintFacts;
}

/** The "Use with your agent" control for one page; a person can hide it per page (remembered in this browser when
 *  storage allows; the page draws the same either way). Keyed by page, so the hidden state and an open drawer never
 *  carry over when the same slot shows another page. */
export function AgentHint({ page, facts }: AgentHintProps) {
  return <PageHint key={page} page={page} facts={facts} />;
}

type TabId = 'prompts' | 'setup' | 'access' | 'can';

function PageHint({ page, facts }: AgentHintProps) {
  const t = useStrings(strings);
  const [hidden, setHidden] = useState(() => readHiddenHints().has(page));
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>('prompts');
  if (hidden) return null;
  const close = () => setOpen(false);
  const hide = () => {
    hideHint(page);
    setOpen(false);
    setHidden(true);
  };
  return (
    <>
      <Button variant="ghost" size="sm" icon="agent" className={s.trigger} onPress={() => setOpen(true)}>
        {t('hint.label')}
      </Button>
      <Drawer
        isOpen={open}
        onOpenChange={setOpen}
        title={t('hint.title')}
        subtitle={t(k(`hint.${page}.what`))}
        size="md"
        resizeKey="agent-hint"
        overlayId="agent-hint"
        footer={
          <>
            <span className={s.footStart}>
              <Link href={SKILLS_GUIDE_HREF} variant="nav" onPress={close}>
                {t('hint.guide')}
              </Link>
            </span>
            {/* In a span: a quiet text action keeps its own width, where a footer's buttons would grow on a phone. */}
            <span className={s.footEnd}>
              <TextButton icon="eye-off" onPress={hide}>
                {t('hint.hide')}
              </TextButton>
            </span>
          </>
        }
      >
        <Tabs<TabId>
          label={t('hint.tabs')}
          sticky
          className={s.tabs}
          value={tab}
          onChange={setTab}
          panelClassName={s.panel}
          items={[
            { id: 'prompts', label: t('hint.tab.prompts'), content: <PromptsTab page={page} facts={facts} close={close} /> },
            { id: 'setup', label: t('hint.tab.setup'), content: <SetupTab close={close} /> },
            { id: 'access', label: t('hint.tab.access'), content: <AccessTab page={page} realm={facts.realm} close={close} /> },
            { id: 'can', label: t('hint.tab.can'), content: <CanTab page={page} /> },
          ]}
        />
      </Drawer>
    </>
  );
}

/** A link into a Hub page that closes the drawer as it goes (the page may be this one); nothing when the page is not
 *  served in this load (kit PageLinkTo, with the press). */
function HubLink({ page, href, variant, onPress, children }: { page: string; href: string; variant: 'inline' | 'nav'; onPress: () => void; children: ReactNode }) {
  const link = usePageLink(page);
  if (!link) return null;
  return (
    <Link href={href} variant={variant} onPress={onPress}>
      {children}
    </Link>
  );
}

// ── Prompts ────────────────────────────────────────────────────────────────────────────────────────────────

/** Whether the Hoody Agent can take a prompt here, and the true reason when it cannot: Ask is off in this Hub, or the
 *  Hub is shown inside another page (the framed lock refuses every change the Agent's send would be). */
function askState(t: T): { on: true } | { on: false; reason: string } {
  if (!askOn()) return { on: false, reason: t('hint.ask.off') };
  if (isFramed()) return { on: false, reason: t('hint.ask.framed') };
  return { on: true };
}

/** Hands a prompt to the Hub's own Agent: the Ask panel opens a NEW conversation with the words in its composer, NOT sent
 *  (kit useAskDock open: a draft the person already typed stays, the prompt follows it on a new line). The draft is
 *  bound to the computer it names only when that computer is the one the shell shows (a draft bound to another one would
 *  wait for that computer's panel). The drawer closes and focus goes to the composer. */
function useHandToAgent(page: AgentHintPage, scope: AgentHintScope, close: () => void): (text: string) => void {
  const t = useStrings(strings);
  const dock = useAskDock();
  return (text: string) => {
    const shown = capture().target?.container.id;
    const named = scope.kind === 'computer' ? scope.computer.id : null;
    close();
    const took = dock.open({ text, source: t(k(`hint.${page}.source`)), ...(named && named === shown ? { computer: named } : {}) });
    // The drawer gives focus back to its trigger as it closes; the composer takes it after that.
    if (took) window.requestAnimationFrame(() => window.requestAnimationFrame(() => focusAskDock()));
  };
}

function PromptsTab({ page, facts, close }: { page: AgentHintPage; facts: AgentHintFacts; close: () => void }) {
  const t = useStrings(strings);
  const realms = useRealms();
  const scope = agentHintScope(page, facts);
  const target = agentHintTarget(t, scope);
  const ask = askState(t);
  const hand = useHandToAgent(page, scope, close);
  const tintOf = (id: string) => realms.rows?.find((r) => r.id === id)?.tint || '';
  const mainTitle = t(k(`hint.${page}.title.main`));
  const mainId = useId();
  const main = { remote: mainPrompt(t, page, target, 'remote'), hoody: mainPrompt(t, page, target, 'hoody') };
  const starters = AGENT_HINT_STARTERS[page].map((id) => ({
    id,
    title: t(k(`hint.${page}.title.${id}`)),
    remote: starterPrompt(t, page, id, target, 'remote'),
    hoody: starterPrompt(t, page, id, target, 'hoody'),
  }));
  const askButton = (title: string, text: string, primary: boolean) => (
    <Button
      variant={primary ? 'primary' : 'ghost'}
      size={primary ? 'md' : 'sm'}
      icon="sparkle"
      aria-label={t('hint.askNamed', { title })}
      {...(ask.on ? { onPress: () => hand(text) } : { isDisabled: true, disabledReason: ask.reason })}
    >
      {t('hint.ask')}
    </Button>
  );
  return (
    <div className={s.stack}>
      <div role="group" aria-label={t('hint.actsOn')} className={s.actsOn}>
        <span className={s.actsOnLabel} aria-hidden="true">
          {t('hint.actsOn')}
        </span>
        <Facts items={actsOn(t, scope, tintOf)} columns={2} />
        <p className={s.why}>{target.why}</p>
      </div>
      {scope.kind === 'pick' && (
        <Notice>
          {t('hint.pick.note')}{' '}
          <HubLink page="computers" href={COMPUTERS_HREF} variant="inline" onPress={close}>
            {t('hint.pick.link')}
          </HubLink>
        </Notice>
      )}
      <div role="group" className={s.hero} aria-labelledby={mainId}>
        <div className={s.heroHead}>
          <span className={s.kicker}>{t('hint.main.kicker')}</span>
          <span id={mainId} className={s.heroTitle}>
            {mainTitle}
          </span>
          <p className={s.heroSub}>{t('hint.main.sub')}</p>
        </div>
        <div className={s.heroActions}>
          {askButton(mainTitle, main.hoody, true)}
          <CopyButton text={main.remote} withLabel label={t('hint.copyMain')} size="md" />
        </div>
        <Facts
          className={s.howto}
          columns={1}
          label={t('hint.prompts.ways')}
          items={[
            { label: t('hint.prompts.hoodyLabel'), value: t('hint.prompts.hoody') },
            { label: t('hint.prompts.remoteLabel'), value: t('hint.prompts.remote') },
          ]}
        />
        <p className={s.promptText} data-prompt="main">
          {main.remote}
        </p>
      </div>
      <div className={s.startersHead}>{t('hint.prompts.starters')}</div>
      <ol className={s.prompts} aria-label={t('hint.prompts.list')}>
        {starters.map((p) => (
          <li key={p.id} className={s.prompt}>
            <div className={s.promptHead}>
              <span className={s.promptTitle}>{p.title}</span>
              <span className={s.promptActions}>
                {askButton(p.title, p.hoody, false)}
                <CopyButton text={p.remote} label={t('hint.copyPrompt', { title: p.title })} />
              </span>
            </div>
            <p className={s.starterText} data-prompt={p.id}>
              {p.remote}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The "Acts on" facts of a scope: what the prompts name, by name with the id masked (the prompts carry it whole), the
 *  realm with its colour mark; All realms said in words. */
function actsOn(t: T, scope: AgentHintScope, tintOf: (id: string) => string): Fact[] {
  const named = (thing: { id: string; name: string | null }, tint?: string): ReactNode => (
    <span className={s.named}>
      {tint !== undefined ? <span className={s.realmMark} style={tint ? { background: `var(--hx-r-${tint})` } : undefined} aria-hidden="true" /> : null}
      <span className={s.name}>{thing.name && thing.name.trim() ? thing.name : t('hint.fact.unnamed')}</span>
      <IdChip id={thing.id} noCopy />
    </span>
  );
  const realm = (r: AgentHintRealm): Fact => ({ label: t('hint.fact.realm'), value: named(r, tintOf(r.id)) });
  const allRealms: Fact = { label: t('hint.fact.realm'), value: t('hint.fact.allRealms') };
  switch (scope.kind) {
    case 'keys':
      return scope.realm ? [realm(scope.realm), { label: t('hint.fact.keys'), value: t('hint.fact.keysRealm') }] : [allRealms, { label: t('hint.fact.keys'), value: t('hint.fact.keysAll') }];
    case 'realm':
    case 'realmComputers':
      return [realm(scope.realm), { label: t('hint.fact.computer'), value: t('hint.fact.realmComputers') }];
    case 'allRealms':
      return [allRealms, { label: t('hint.fact.computer'), value: t('hint.fact.allComputers') }];
    case 'vault':
      return [realm(scope.realm), { label: t('hint.fact.vault'), value: t('hint.tgt.vault') }];
    case 'globalVault':
      return [allRealms, { label: t('hint.fact.vault'), value: t('hint.fact.globalVault') }];
    case 'computer':
      return [{ label: t('hint.fact.computer'), value: named(scope.computer) }, scope.realm ? realm(scope.realm) : { label: t('hint.fact.realm'), value: t('hint.fact.anyRealm') }];
    case 'pick':
      return [{ label: t('hint.fact.computer'), value: t('hint.fact.noComputer') }, scope.realm ? realm(scope.realm) : allRealms];
  }
}

// ── Set up ─────────────────────────────────────────────────────────────────────────────────────────────────

function SetupTab({ close }: { close: () => void }) {
  const t = useStrings(strings);
  const hosts = useMemo(() => currentPlatformHosts(), []);
  const [kind, setKind] = useState<AgentKind>(() => readAgentKind());
  const footer = (
    <Link href={CONNECT_GUIDE_HREF} variant="nav" onPress={close}>
      {t('hint.setup.more')}
    </Link>
  );
  return (
    <div className={s.stack}>
      <p className={s.lead}>{t('hint.setup.lead')}</p>
      <SystemSteps<AgentKind>
        label={t('hint.setup.picker')}
        value={kind}
        onChange={(next) => {
          setKind(next);
          saveAgentKind(next);
        }}
        systems={AGENT_KINDS.map((id) => {
          const lines = setupLines(id, hosts).map((l) => ({ caption: t(k(`hint.setup.cap.${l.cap}`)), code: l.text }));
          const block = { label: t(k(`hint.setup.block.${id}`)), lines, footer };
          return {
            id,
            label: t(k(`hint.setup.kind.${id}`)),
            step: t(k(`hint.setup.step.${id}`)),
            code: id === 'chat' ? { ...block, lang: 'shell' as const, plain: t('hint.setup.plain') } : { ...block, lang: 'shell' as const },
          };
        })}
      />
    </div>
  );
}

// ── Access ─────────────────────────────────────────────────────────────────────────────────────────────────

function AccessTab({ page, realm, close }: { page: AgentHintPage; realm: AgentHintRealm | null; close: () => void }) {
  const t = useStrings(strings);
  const name = realm?.name && realm.name.trim() ? realm.name : null;
  return (
    <div className={s.stack}>
      <p className={s.lead}>{t(k(`hint.access.lead.${AGENT_HINT_REACH[page]}`))}</p>
      <ItemList
        label={t('hint.access.ways')}
        items={[
          { id: 'browser', leading: 'account', title: t('hint.access.browser'), meta: [t('hint.access.browser.meta')] },
          { id: 'key', leading: 'key', title: t('hint.access.key'), meta: [t('hint.access.key.meta')] },
        ]}
      />
      <p className={s.lead}>{realm ? (name ? t('hint.access.realm', { realm: name }) : t('hint.access.realmUnnamed')) : t('hint.access.allRealms')}</p>
      <Notice icon="lock">{t('hint.access.keep')}</Notice>
      <div className={s.links}>
        <HubLink page="keys" href={NEW_KEY_HREF} variant="nav" onPress={close}>
          {realm ? (name ? t('hint.access.newKeyRealm', { realm: name }) : t('hint.access.newKeyRealmId')) : t('hint.access.newKey')}
        </HubLink>
        <Link href={KEYS_GUIDE_HREF} variant="nav" onPress={close}>
          {t('hint.access.guide')}
        </Link>
      </div>
    </div>
  );
}

// ── What it can do ─────────────────────────────────────────────────────────────────────────────────────────

function CanTab({ page }: { page: AgentHintPage }) {
  const t = useStrings(strings);
  const rows = Array.from({ length: AGENT_HINT_CAN[page] }, (_, i) => ({ id: String(i + 1), leading: 'check' as const, title: t(k(`can.${page}.${i + 1}`)) }));
  const here = t('hint.can.here');
  const everywhere = t('hint.can.everywhere');
  return (
    <div className={s.stack}>
      <p className={s.lead}>{t('hint.can.lead')}</p>
      <div role="group" aria-label={here} className={s.canPart} data-can="here">
        <span className={s.canHead} aria-hidden="true">
          {here}
        </span>
        <ItemList label={t('hint.can.list')} items={rows} />
      </div>
      <div role="group" aria-label={everywhere} className={s.canPart} data-can="everywhere">
        <span className={s.canHead} aria-hidden="true">
          {everywhere}
        </span>
        <p className={s.lead}>{t('hint.can.everywhere.lead')}</p>
        {AGENT_CAN_EVERYWHERE.map((g) => {
          const title = t(k(`all.${g.id}.title`));
          return (
            <div key={g.id} className={s.canGroup} data-can-group={g.id}>
              <span className={s.canGroupHead} aria-hidden="true">
                {title}
              </span>
              <ItemList label={title} items={Array.from({ length: g.rows }, (_, i) => ({ id: `${g.id}-${i + 1}`, leading: 'check' as const, title: t(k(`all.${g.id}.${i + 1}`)) }))} />
            </div>
          );
        })}
        <p className={s.why}>{t('hint.can.access')}</p>
        <p className={s.why}>{t('hint.can.kit')}</p>
      </div>
    </div>
  );
}
