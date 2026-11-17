// The Guide's sections. Every section is the kit's strict section: a head (title, one sentence, its links), a body, and a
// closing note, so each reads the same way; the page assembles them in order.
import {
  ActionCards,
  AnatomySection,
  EmptyState,
  ErrorState,
  Link,
  PageLinkTo,
  ShortcutTable,
  Skeleton,
  askOn,
  followPageLink,
  useGo,
  usePageLink,
  useShortcuts,
  useStrings,
  type AnyAction,
  type IconName,
  type SectionActions,
} from '@kit';
import type { ReactNode } from 'react';
import { BoardAddButton, links as board } from '../../board/links';
import { links as bots } from '../../bots/links';
import { links as computers } from '../../computers/links';
import { links as home } from '../../home/links';
import { links as programs } from '../../programs/links';
import strings from '../strings.en.json';
import type { GuideTopic } from '../data';
import {
  BOT_DOORS,
  CONNECT_DOORS,
  LINKS,
  MORE_LINK_SLUGS,
  docsUrl,
  kitUrl,
  type DoorId,
  type GuideFacts,
  type SectionId,
} from '../logic';
import { AddressRow } from './AddressRow';
import { DoorPanel } from './DoorPanel';
import s from './guide.module.css';

interface SectionProps {
  id: SectionId;
  title: string;
  lede?: string;
  /** The section's own links, in its head: the page it is about, its docs. */
  actions?: SectionActions;
  /** One closing line under the body. */
  note?: string;
  children?: ReactNode;
}

export function Section({ id, title, lede, actions, note, children }: SectionProps) {
  return (
    <AnatomySection id={`guide-${id}`} title={title} description={lede} actions={actions} note={note}>
      {children}
    </AnatomySection>
  );
}

/** Up to two links for a section head, in order; none: no actions at all. */
export function headLinks(...links: (AnyAction | null | undefined | false)[]): SectionActions | undefined {
  const list = links.filter((l): l is AnyAction => Boolean(l));
  if (list.length === 0) return undefined;
  return { secondary: list.length === 1 ? [list[0] as AnyAction] : [list[0] as AnyAction, list[1] as AnyAction] };
}

/** The docs page of a section, as a head link (none until the facts name the docs host). */
export function useDocsLink(facts: GuideFacts | undefined, path: string): AnyAction | null {
  const t = useStrings(strings);
  const href = facts ? docsUrl(facts.docsBase, path) : '';
  return href ? { id: 'docs', label: t('action.docs'), href, icon: 'external' } : null;
}

export function AskSection({ onOpenAsk }: { onOpenAsk: () => void }) {
  const t = useStrings(strings);
  // The Agent chord as this platform's key list writes it (the terminal binds Alt+J: Ctrl+J is a line feed there).
  const askKey = useShortcuts().flatMap((g) => g.rows).find((r) => r.keys.length === 1 && /[ +]J$/.test(r.keys[0] ?? ''))?.keys[0] ?? t('ask.shortcut');
  // Only the Hub's Home reopens the Welcome (?intro=1): offered while this load serves Home.
  const homeInHub = usePageLink('home')?.kind === 'hub';
  const actions: SectionActions = {
    ...(askOn() ? { primary: { id: 'open-agent', label: t('ask.open'), name: t('ask.openName', { keys: askKey }), icon: 'sparkle', onPress: onOpenAsk } } : {}),
    ...(homeInHub ? { secondary: [{ id: 'welcome', label: t('welcome.again'), href: home.intro }] as const } : {}),
  };
  return (
    <Section id="ask" title={t('ask.title')} lede={t('ask.lede')} actions={actions} note={askOn() ? t('ask.keyNote', { keys: askKey }) : undefined} />
  );
}

interface DoorsProps {
  facts: GuideFacts | undefined;
  door: DoorId;
  onDoor: (id: DoorId) => void;
}

export function ConnectSection({ facts, door, onDoor }: DoorsProps) {
  const t = useStrings(strings);
  return (
    <Section id="connect" title={t('connect.title')} lede={t('connect.lede')}>
      <DoorPanel doors={CONNECT_DOORS} selected={door} onSelect={onDoor} facts={facts} label={t('connect.pickDoor')} />
    </Section>
  );
}

export function LinksSection({ facts, failed, onRetry }: { facts: GuideFacts | undefined; failed: boolean; onRetry: () => void }) {
  const t = useStrings(strings);
  const c = facts?.computer;
  const rows = facts && c ? LINKS.map(([key, slug, instance, , open]) => ({ key, open, url: kitUrl(facts, slug, instance) })).filter((r) => r.url !== '') : [];
  const shown = !failed && Boolean(facts) && Boolean(c) && rows.length > 0;
  return (
    <Section id="links" title={t('links.title')} lede={t('links.lede')} note={shown ? t('links.http') : undefined}>
      {failed ? (
        <ErrorState size="compact" title={t('links.error')} onRetry={onRetry} />
      ) : !facts ? (
        <Skeleton variant="rows" rows={4} />
      ) : !c ? (
        <EmptyState size="compact" icon="link" title={t('links.none')} />
      ) : rows.length === 0 ? (
        // A computer is picked but its addresses cannot be built (no proxy domain or an id out of shape): never "none picked".
        <EmptyState size="compact" icon="link" title={t('links.noAddress')} />
      ) : (
        <>
          <ul className={s.list}>
            {rows.map((r) => (
              <AddressRow key={r.key} program={t(`program.${r.key}`)} url={withPath(r.key, r.url)} ids={[c.id, c.project]} open={r.open} />
            ))}
          </ul>
          <p className={s.note}>{t('links.more', { examples: t('links.and', { a: `-${MORE_LINK_SLUGS[0]}-1`, b: `-${MORE_LINK_SLUGS[1]}-1` }) })}</p>
        </>
      )}
    </Section>
  );
}

function withPath(key: string, url: string): string {
  const extra = LINKS.find((l) => l[0] === key)?.[3] ?? '';
  return `${url}${extra}`;
}

export function BotsSection({ facts, door, onDoor }: DoorsProps) {
  const t = useStrings(strings);
  const go = useGo();
  const botsLink = usePageLink('bots');
  const docs = useDocsLink(facts, '/kit/agent/bot-urls/');
  const open: AnyAction | null = !botsLink
    ? null
    : botsLink.kind === 'hub'
      ? { id: 'bots', label: t('bots.open'), href: bots.list }
      : { id: 'bots', label: t('bots.open'), onPress: () => followPageLink(botsLink, go) };
  return (
    <Section id="bots" title={t('bots.title')} lede={t('bots.lede')} actions={headLinks(open, docs)}>
      <DoorPanel doors={BOT_DOORS} selected={door} onSelect={onDoor} facts={facts} label={t('bots.title')} />
    </Section>
  );
}

interface Tool {
  id: string;
  icon: IconName;
  href: string;
  docs?: string;
}

// The program cards (agent, terminal, screen, files, browser) also offer Put on Board for this computer:
// BoardAddButton shows only where the Board can take it (a Board this load serves, a computer whose addresses build).
const BOARD_PROGRAMS: ReadonlySet<string> = new Set(['agent', 'terminal', 'screen', 'files', 'browser']);
// The More programs card names two more programs a Board tile shows (code, sqlite): each gets a text Put on Board that
// names it ("Put Code on Board"), so the two are told apart; BoardAddButton shows it only where the Board can take it.
const MORE_ON_BOARD = ['code', 'sqlite'] as const;
const TOOLS: readonly Tool[] = [
  { id: 'agent', icon: 'agent', href: computers.list, docs: '/kit/agent/' },
  { id: 'terminal', icon: 'terminal', href: computers.list, docs: '/kit/terminals/' },
  { id: 'screen', icon: 'display', href: computers.list, docs: '/kit/displays/' },
  { id: 'files', icon: 'files', href: computers.list, docs: '/kit/files/' },
  { id: 'browser', icon: 'browser', href: computers.list, docs: '/kit/browser/' },
  { id: 'board', icon: 'board', href: board.board },
  { id: 'bots', icon: 'bot', href: bots.list, docs: '/kit/agent/bot-urls/' },
];

export function ToolsSection({ facts }: { facts: GuideFacts | undefined }) {
  const t = useStrings(strings);
  const name = facts?.computer?.name;
  const c = facts?.computer;
  // Only a computer whose addresses can be built (the Links rule): the Board would refuse any other.
  const on = c && facts && kitUrl(facts, 'terminal', 1) ? { id: c.id, project: c.project, server: c.node } : null;
  // The Board card shows only while this load serves the Board.
  const boardOn = usePageLink('board') !== null;
  return (
    <Section id="tools" title={t('tools.title')} lede={name ? t('tools.lede', { computer: name }) : t('tools.lede0')}>
      <ActionCards
        label={t('tools.title')}
        cards={[
          ...TOOLS.filter((tool) => tool.id !== 'board' || boardOn).map((tool) => {
            const title = tool.id === 'bots' ? t('tool.bots.name') : tool.id === 'board' ? t('tool.board.name') : t(`program.${tool.id as 'agent'}`);
            const docs = tool.docs && facts ? docsUrl(facts.docsBase, tool.docs) : '';
            return {
              id: tool.id,
              icon: tool.icon,
              title,
              body: t(`tool.${tool.id as 'agent'}`),
              actions: (
                <>
                  <PageLinkTo href={tool.href}>{t('action.open')}</PageLinkTo>
                  {BOARD_PROGRAMS.has(tool.id) && <BoardAddButton computer={on} program={tool.id} what={title} size="md" />}
                  {docs && (
                    <Link href={docs} variant="nav">{t('action.docs')}</Link>
                  )}
                </>
              ),
            };
          }),
          {
            id: 'more',
            icon: 'programs',
            title: t('tool.more'),
            body: t('tool.moreBody'),
            actions: (
              <>
                <PageLinkTo href={programs.list}>{t('tool.moreAction')}</PageLinkTo>
                {MORE_ON_BOARD.map((p) => <BoardAddButton key={p} computer={on} program={p} what={t(`program.${p}`)} named size="sm" />)}
              </>
            ),
          },
        ]}
      />
    </Section>
  );
}

const RECIPES: readonly { n: 1 | 2 | 3 | 4 | 5 | 6; href: string }[] = [
  { n: 1, href: computers.list },
  { n: 2, href: bots.list },
  { n: 3, href: '/home' },
  { n: 4, href: '/home' },
  { n: 5, href: bots.list },
  { n: 6, href: '/home' },
];

export function TrySection() {
  const t = useStrings(strings);
  // With the Board served, the first recipe ends on a Board with Agent and Browser side by side.
  const boardOn = usePageLink('board') !== null;
  const recipes = RECIPES.map((r) => (r.n === 1 && boardOn ? { ...r, href: board.board, body: 'recipe.1.board' as const } : { ...r, body: `recipe.${r.n}.body` as const }));
  return (
    <Section id="try" title={t('try.title')} lede={t('try.lede')}>
      <ActionCards
        label={t('try.title')}
        cards={recipes.map((r) => ({
          id: `recipe-${r.n}`,
          title: t(`recipe.${r.n}`),
          body: t(r.body),
          actions: <PageLinkTo href={r.href}>{t('try.action')}</PageLinkTo>,
        }))}
      />
    </Section>
  );
}

export function RealmsSection({ facts }: { facts: GuideFacts | undefined }) {
  const t = useStrings(strings);
  const docs = useDocsLink(facts, '/concepts/realms-projects/');
  return <Section id="realms" title={t('realms.title')} lede={t('realms.lede')} actions={headLinks(docs)} note={t('realms.hint', { keys: 'Alt R' })} />;
}

export function TopicsSection({ topics }: { topics: readonly GuideTopic[] | undefined }) {
  const t = useStrings(strings);
  return (
    <Section id="topics" title={t('topics.title')} lede={t('topics.lede')}>
      {!topics ? (
        <Skeleton variant="text" rows={4} />
      ) : topics.length === 0 ? (
        <EmptyState size="sm" icon="info" title={t('topics.none')} />
      ) : (
        topics.map((topic) => (
          <article key={`${topic.pageId}:${topic.id}`} id={`guide-topic-${topic.pageId}-${topic.id}`} className={s.topic}>
            <h3 className={s.topicTitle}>{topic.title}</h3>
            <p>{topic.body}</p>
            <span className={s.topicFrom}>{t('topics.from', { page: topic.pageTitle })}</span>
          </article>
        ))
      )}
    </Section>
  );
}

export function KeysSection() {
  const t = useStrings(strings);
  // A group the shell leaves with no rows (every page it jumps to hidden) shows no title of its own.
  const groups = useShortcuts()
    .filter((g) => g.rows.length > 0)
    .map((g) => ({ id: g.id, title: g.title, rows: g.rows.map((r) => ({ keys: r.keys, label: r.label, then: r.keys.length === 2 && r.keys[0] === 'g' })) }));
  return (
    <Section id="keys" title={t('keys.title')} lede={t('keys.lede')}>
      <ShortcutTable label={t('keys.title')} groups={groups} />
    </Section>
  );
}

export function LookSection() {
  const t = useStrings(strings);
  // One sentence: the body line, so the card has no empty body under its head.
  return <Section id="look" title={t('look.title')} note={t('look.body')} />;
}
