// "Use with your agent" in the terminal: the web's control and drawer (AgentHint.tsx), drawn with the kit's terminal
// parts. A quiet control opens a Drawer (a side sheet, the whole screen under 75 columns) with the web's four tabs:
//   Prompts: what the prompts act on, then the page's main prompt with "Ask Hoody Agent" (the Ask dock's composer,
//     never sent) and Copy (exactly what is shown), then the one-task starters, each shown whole with the same two;
//   Set up: how each kind of own agent gets Hoody (the kit's SystemSteps, the choice remembered where storage allows);
//   Access: how the agent signs in, in plain words; in a realm, a key limited to that realm;
//   Can do: the operations the Hoody skill offers on this page's things.
// The footer keeps the Guide link and "Hide on this page". Words, scope, prompts and the hide rule are the web's
// (agentHints.ts). Esc, × and a press outside close the drawer (the Drawer's own).
// Not here: the realm's colour (a ■ marks the realm, as the kit's ContextLine does), and the focus move into the Ask
// dock's composer (the terminal dock takes the focus itself when it opens: term/shell/AskDock).
import { useMemo, useState, type ReactNode } from 'react';
import { capture, isFramed } from '@core';
import type * as Web from './AgentHint';
import { Box, Pressable, Text } from '../../term/prim';
import { askOn, useAskDock } from '../ask';
import { Button } from '../controls/Button';
import { Link, TextButton } from '../controls/Link';
import { Tabs } from '../controls/Tabs';
import { Facts, type Fact } from '../data/Display';
import { CopyButton, IdChip } from '../data/Ids';
import { SystemSteps } from '../data/Steps';
import { ItemList } from '../layouts/anatomy/ItemList';
import { Drawer } from '../overlays/Drawer';
import { usePageLink } from '../../shell/pageLinks';
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
import { focusInk } from '@term/kit';

export type { AgentHintProps } from './AgentHint';

type T = Translate<typeof strings>;
/** A key built from a page and an id (prompt, title, can-do row): agentHints lists them, the web's AgentHint.test.tsx
 *  pins each. */
type Key = keyof typeof strings;
const k = (key: string) => key as Key;

type TabId = 'prompts' | 'setup' | 'access' | 'can';
const TAB_IDS: readonly TabId[] = ['prompts', 'setup', 'access', 'can'];

export const AgentHint: typeof Web.AgentHint = ({ page, facts }) => <PageHint key={page} page={page} facts={facts} />;

function PageHint({ page, facts }: Web.AgentHintProps) {
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
      {/* Never wider than its parent (a page header that sizes its children to their content). */}
      <Box dir="column" shrink={0} maxWidth="100%">
        <Pressable dir="row" shrink={0} onPress={() => setOpen(true)} sem={{ name: t('hint.label') }}>
          {({ focused }) => <Text colour="blueText" {...focusInk(focused)}>▸ {t('hint.label')}</Text>}
        </Pressable>
      </Box>
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
            <Link href={SKILLS_GUIDE_HREF} variant="nav" onPress={close}>
              {t('hint.guide')}
            </Link>
            <Box grow={1} shrink={1} />
            <TextButton icon="eye-off" onPress={hide}>
              {t('hint.hide')}
            </TextButton>
          </>
        }
      >
        <Tabs
          label={t('hint.tabs')}
          value={tab}
          onChange={(id) => { if ((TAB_IDS as readonly string[]).includes(id)) setTab(id as TabId); }}
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

/** A tab's content: one column, a blank row between its parts, a blank row under the tab strip. */
function Stack({ children }: { children: ReactNode }) {
  return <Box dir="column" shrink={0} gap={1} pad={{ top: 1 }}>{children}</Box>;
}

/** A link into a Hub page that closes the drawer as it goes (the page may be this one); nothing when the page is not
 *  served in this load. */
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

/** Whether the Hoody Agent can take a prompt here, and the true reason when it cannot (the web's two reasons). */
function askState(t: T): { on: true } | { on: false; reason: string } {
  if (!askOn()) return { on: false, reason: t('hint.ask.off') };
  if (isFramed()) return { on: false, reason: t('hint.ask.framed') };
  return { on: true };
}

/** Hands a prompt to the Hub's own Agent: the Ask dock opens a NEW conversation with the words in its composer, NOT
 *  sent. The draft is bound to the computer it names only when that computer is the one the shell shows. The drawer
 *  closes first; the dock takes the focus as it opens. */
function useHandToAgent(page: AgentHintPage, scope: AgentHintScope, close: () => void): (text: string) => void {
  const t = useStrings(strings);
  const dock = useAskDock();
  return (text: string) => {
    const shown = capture().target?.container.id;
    const named = scope.kind === 'computer' ? scope.computer.id : null;
    close();
    dock.open({ text, source: t(k(`hint.${page}.source`)), ...(named && named === shown ? { computer: named } : {}) });
  };
}

/** A prompt shown whole, line for line as it is copied (a blank line of the prompt is a blank row). */
function PromptText({ text }: { text: string }) {
  return (
    <Box dir="column" shrink={0} bg="card" padX={1}>
      {text.split('\n').map((line, i) => <Text key={i} colour="ink">{line === '' ? ' ' : line}</Text>)}
    </Box>
  );
}

function PromptsTab({ page, facts, close }: { page: AgentHintPage; facts: AgentHintFacts; close: () => void }) {
  const t = useStrings(strings);
  const scope = agentHintScope(page, facts);
  const target = agentHintTarget(t, scope);
  const ask = askState(t);
  const hand = useHandToAgent(page, scope, close);
  const mainTitle = t(k(`hint.${page}.title.main`));
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
    <Stack>
      <Box dir="column" shrink={0} sem={{ role: 'group', name: t('hint.actsOn') }}>
        <Text colour="muted" bold>{t('hint.actsOn')}</Text>
        <Facts items={actsOn(t, scope)} columns={2} />
        <Text colour="muted">{target.why}</Text>
      </Box>
      {scope.kind === 'pick' && (
        <Box dir="column" shrink={0}>
          <Notice>{t('hint.pick.note')}</Notice>
          <Box dir="row" shrink={0} pad={{ left: 2 }}>
            <HubLink page="computers" href={COMPUTERS_HREF} variant="inline" onPress={close}>
              {t('hint.pick.link')}
            </HubLink>
          </Box>
        </Box>
      )}
      <Box dir="column" shrink={0} gap={1} sem={{ role: 'group', name: mainTitle }}>
        <Box dir="column" shrink={0}>
          <Text colour="muted">{t('hint.main.kicker')}</Text>
          <Text colour="ink" bold>{mainTitle}</Text>
          <Text colour="muted">{t('hint.main.sub')}</Text>
        </Box>
        <Box dir="row" gapX={2} wrap shrink={0}>
          {askButton(mainTitle, main.hoody, true)}
          <CopyButton text={main.remote} withLabel label={t('hint.copyMain')} size="md" />
        </Box>
        <Box dir="column" shrink={0}>
          <Text colour="muted" bold>{t('hint.prompts.ways')}</Text>
          <Facts
            columns={1}
            label={t('hint.prompts.ways')}
            items={[
              { label: t('hint.prompts.hoodyLabel'), value: t('hint.prompts.hoody') },
              { label: t('hint.prompts.remoteLabel'), value: t('hint.prompts.remote') },
            ]}
          />
        </Box>
        <PromptText text={main.remote} />
      </Box>
      <Text colour="muted" bold>{t('hint.prompts.starters')}</Text>
      <Box dir="column" shrink={0} gap={1} sem={{ role: 'list', name: t('hint.prompts.list') }}>
        {starters.map((p) => (
          <Box key={p.id} dir="column" shrink={0} sem={{ role: 'listitem' }}>
            <Box dir="row" gapX={2} wrap shrink={0}>
              <Text colour="ink" bold>{p.title}</Text>
              {askButton(p.title, p.hoody, false)}
              <CopyButton text={p.remote} label={t('hint.copyPrompt', { title: p.title })} />
            </Box>
            <PromptText text={p.remote} />
          </Box>
        ))}
      </Box>
    </Stack>
  );
}

/** The "Acts on" facts of a scope: what the prompts name, by name with the id masked (the prompts carry it whole), the
 *  realm marked ■; All realms said in words. */
function actsOn(t: T, scope: AgentHintScope): Fact[] {
  const named = (thing: { id: string; name: string | null }, realm = false): ReactNode => (
    <Box dir="row" gapX={1} wrap shrink={1}>
      <Text colour="ink">
        {realm ? <Text colour="muted">■ </Text> : null}
        {thing.name && thing.name.trim() ? thing.name : t('hint.fact.unnamed')}
      </Text>
      <IdChip id={thing.id} noCopy />
    </Box>
  );
  const realm = (r: AgentHintRealm): Fact => ({ label: t('hint.fact.realm'), value: named(r, true) });
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
    <Stack>
      <Text colour="ink">{t('hint.setup.lead')}</Text>
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
    </Stack>
  );
}

// ── Access ─────────────────────────────────────────────────────────────────────────────────────────────────

function AccessTab({ page, realm, close }: { page: AgentHintPage; realm: AgentHintRealm | null; close: () => void }) {
  const t = useStrings(strings);
  const name = realm?.name && realm.name.trim() ? realm.name : null;
  return (
    <Stack>
      <Text colour="ink">{t(k(`hint.access.lead.${AGENT_HINT_REACH[page]}`))}</Text>
      <ItemList
        label={t('hint.access.ways')}
        items={[
          { id: 'browser', leading: 'account', title: t('hint.access.browser'), meta: [t('hint.access.browser.meta')] },
          { id: 'key', leading: 'key', title: t('hint.access.key'), meta: [t('hint.access.key.meta')] },
        ]}
      />
      <Text colour="ink">{realm ? (name ? t('hint.access.realm', { realm: name }) : t('hint.access.realmUnnamed')) : t('hint.access.allRealms')}</Text>
      <Notice icon="lock">{t('hint.access.keep')}</Notice>
      <Box dir="row" gapX={3} wrap shrink={0}>
        <HubLink page="keys" href={NEW_KEY_HREF} variant="nav" onPress={close}>
          {realm ? (name ? t('hint.access.newKeyRealm', { realm: name }) : t('hint.access.newKeyRealmId')) : t('hint.access.newKey')}
        </HubLink>
        <Link href={KEYS_GUIDE_HREF} variant="nav" onPress={close}>
          {t('hint.access.guide')}
        </Link>
      </Box>
    </Stack>
  );
}

// ── What it can do ─────────────────────────────────────────────────────────────────────────────────────────

function CanTab({ page }: { page: AgentHintPage }) {
  const t = useStrings(strings);
  const rows = Array.from({ length: AGENT_HINT_CAN[page] }, (_, i) => ({ id: String(i + 1), leading: 'check' as const, title: t(k(`can.${page}.${i + 1}`)) }));
  const here = t('hint.can.here');
  const everywhere = t('hint.can.everywhere');
  // The page's own rows, then what the same agent can do everywhere in Hoody (the same groups on every page) and
  // what its sign-in limits: the web's order.
  return (
    <Stack>
      <Text colour="ink">{t('hint.can.lead')}</Text>
      <Box dir="column" shrink={0} sem={{ role: 'group', name: here }}>
        <Text colour="muted" bold>{here}</Text>
        <ItemList label={t('hint.can.list')} items={rows} />
      </Box>
      <Box dir="column" shrink={0} gap={1} sem={{ role: 'group', name: everywhere }}>
        <Box dir="column" shrink={0}>
          <Text colour="muted" bold>{everywhere}</Text>
          <Text colour="ink">{t('hint.can.everywhere.lead')}</Text>
        </Box>
        {AGENT_CAN_EVERYWHERE.map((g) => {
          const title = t(k(`all.${g.id}.title`));
          return (
            <Box key={g.id} dir="column" shrink={0}>
              <Text colour="ink" bold>{title}</Text>
              <ItemList label={title} items={Array.from({ length: g.rows }, (_, i) => ({ id: `${g.id}-${i + 1}`, leading: 'check' as const, title: t(k(`all.${g.id}.${i + 1}`)) }))} />
            </Box>
          );
        })}
        <Text colour="muted">{t('hint.can.access')}</Text>
        <Text colour="muted">{t('hint.can.kit')}</Text>
      </Box>
    </Stack>
  );
}
