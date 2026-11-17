// "On <name>": what the computer holds, as one Overview section. First the tabs of this page with a count where the
// computer's row or a read this page already makes says one (programs from the Programs tab's read while it runs,
// snapshots and own addresses from the list row), then the other pages that show this computer (files, schedules,
// logs, Bots, Board, SSH keys). Each value is a navigation link (ink, ›), never a button. A page this load does not
// serve is left out (never a dead route); the pages that act on the current computer make this one current first,
// said in the section's description, never only behind a tip.
import { AnatomySection, Facts, Icon, Link, TextButton, followPageLink, useGo, usePageLink, useStrings, type Fact, type IconName, type PageLink } from '@kit';
import type { ReactNode } from 'react';
import { chooseComputer } from '@core';
import { links as board } from '../../board/links';
import { links as bots } from '../../bots/links';
import { links as files } from '../../files/links';
import { links as keys } from '../../keys/links';
import { links as logs } from '../../logs/links';
import { links as schedules } from '../../schedules/links';
import { usePrograms } from '../data';
import { links } from '../links';
import { bucket, handleOf } from '../logic';
import strings from '../strings.en.json';
import type { Computer } from '../types';
import { IdRow, touchClass } from './PartBits';

/** `current`: the page acts on the current computer, so following the link makes this one current first. */
interface Place {
  id: 'files' | 'schedules' | 'logs' | 'keys' | 'board' | 'bots';
  icon: IconName;
  href: string;
  current: boolean;
}

export function placesOf(c: Computer): Place[] {
  const handle = handleOf(c);
  return [
    { id: 'files', icon: 'files', href: files.at(handle), current: false },
    { id: 'schedules', icon: 'schedules', href: schedules.list, current: true },
    { id: 'logs', icon: 'logs', href: logs.computer(handle), current: false },
    { id: 'bots', icon: 'bot', href: bots.byComputer(handle), current: false },
    { id: 'board', icon: 'board', href: board.board, current: true },
    { id: 'keys', icon: 'key', href: keys.ssh, current: true },
  ];
}

/** A count's words: the read's number, or "See the list" while it is not known (never a guess, never a dash). */
function countWords(n: unknown, words: { none: string; some: (count: number) => string; unknown: string }): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return words.unknown;
  return n === 0 ? words.none : words.some(n);
}

export function OnThis({ c, current }: { c: Computer; current: boolean }) {
  const t = useStrings(strings);
  const handle = handleOf(c);
  const running = bucket(c.status) === 'running';
  // The Programs tab's own read (the same cache entry), only while the computer runs.
  const programs = usePrograms(c, running);
  const mine = programs.data?.filter((p) => !p.system);
  // An expired computer never runs again (409 COMPUTER_EXPIRED): say so, never ask to start it.
  const programWords =
    c.server_expired === true
      ? t('on.programs.expired')
      : !running
        ? t('on.programs.notRunning')
        : programs.isError || !mine
          ? programs.isPending
            ? t('on.reading')
            : t('on.seeList')
          : t('on.programs.count', {
              running: mine.filter((p) => p.state === 'running').length,
              total: mine.length,
            });
  // One page link per place, in placesOf's fixed order (the same six ids every render).
  const served: Record<Place['id'], PageLink | null> = {
    files: usePageLink('files'),
    schedules: usePageLink('schedules'),
    logs: usePageLink('logs'),
    bots: usePageLink('bots'),
    board: usePageLink('board'),
    keys: usePageLink('keys'),
  };
  const places = placesOf(c).filter((p) => served[p.id] !== null);
  const makers = current ? [] : places.filter((p) => p.current).map((p) => t(`goto.${p.id}`));
  const tab = (label: string, href: string, words: string): Fact => ({
    label,
    value: <NavTo href={href}>{words}</NavTo>,
  });
  const items: Fact[] = [
    tab(t('tab.programs'), links.programs(handle), programWords),
    tab(
      t('tab.backups'),
      links.item(handle) + '&tab=backups',
      countWords(c.snapshot_count, {
        none: t('on.backups.none'),
        some: (count) => t('on.backups.count', { count }),
        unknown: t('on.seeList'),
      }),
    ),
    tab(
      t('on.addresses'),
      links.ports(handle),
      countWords(c.proxy_domains_count, {
        none: t('on.addresses.none'),
        some: (count) => t('on.addresses.count', { count }),
        unknown: t('on.seeList'),
      }),
    ),
    ...places.map((p) => ({
      label: t(`goto.${p.id}`),
      value: <PlaceLink place={p} link={served[p.id]!} onFollow={p.current && !current ? () => chooseComputer(c) : undefined} />,
    })),
  ];
  return (
    <AnatomySection
      id="on"
      title={t('on.title', { name: c.name })}
      state={{ kind: 'ready' }}
      {...(makers.length > 0
        ? {
            description: t('goto.makesCurrent', {
              pages: new Intl.ListFormat('en', { type: 'conjunction' }).format(makers),
              name: c.name,
            }),
          }
        : {})}
    >
      <nav aria-label={t('goto.title', { name: c.name })}>
        <Facts items={items} columns={2} label={t('on.title', { name: c.name })} />
      </nav>
    </AnatomySection>
  );
}

/** A value that opens another place: ink, underlined on hover, with its ›. */
function NavTo({ href, onPress, children }: { href: string; onPress?: (() => void) | undefined; children: ReactNode }) {
  return (
    <Link variant="nav" href={href} {...(onPress ? { onPress } : {})}>
      <IdRow>
        {children}
        <Icon name="chevron-right" size="sm" />
      </IdRow>
    </Link>
  );
}

function PlaceLink({ place, link, onFollow }: { place: Place; link: PageLink; onFollow: (() => void) | undefined }) {
  const t = useStrings(strings);
  const go = useGo();
  const words = t(`on.${place.id}`);
  // A non-hub link (a classic one, which no load gives any more) would be a full page load, never a router
  // route.
  if (link.kind !== 'hub') {
    return (
      <TextButton
        literal
        className={touchClass}
        onPress={() => {
          onFollow?.();
          followPageLink(link, go);
        }}
      >
        {words}
      </TextButton>
    );
  }
  return (
    <NavTo href={place.href} onPress={onFollow}>
      {words}
    </NavTo>
  );
}
