// Overview tab: what can be opened on the computer first (the Open on tiles), then its summary in six sections, each
// built from what the computer's own list row says (and, while Usage is on, its stats read):
//   Status and usage: state, how long it has run, its SSH address, its size, then the usage switch and meters;
//   Access: who can open its programs (one line; changed on the Permissions tab) and its SSH key (Add or Replace);
//   Where it runs: server and its kind, place, the rental's end, project, realms and colour, each with its own action;
//   On <name>: its programs, backups and own addresses (tabs of this page, with counts), then the other pages;
//   Features: every feature of the computer, on or off, with its switch where it can change (parts/Features.tsx);
//   Details: id, image, created, its note.
// A value the API does not give is left out, never shown as a dash. On a wide pane the sections sit in two columns.
import {
  AnatomySection,
  Band,
  ComputerMark,
  CopyButton,
  EmptyState,
  ErrorState,
  Facts,
  formatStorage,
  Icon,
  IconButton,
  IdChip,
  InfoTip,
  Link,
  Meter,
  Notice,
  openOutside,
  QrButton,
  qrReachOf,
  Skeleton,
  Stack,
  StatTile,
  Switch,
  Toolbar,
  UpgradeLink,
  useGo,
  useStrings,
  type Fact,
  type IconName,
  type SectionState,
} from '@kit';
import { computerColor, imageWords } from '@core';
import type { ReactNode } from 'react';
import { subjectOf, useShownRealm, useUsage } from '../data';
import { BoardAddButton } from '../../board/links';
import { links as billingLinks } from '../../billing/links';
import {
  type ProgramLink,
  SLUG,
  access as accessOf,
  type UseId,
  USES,
  bucket,
  dateOf,
  dayText,
  diskGbOf,
  handleOf,
  hasSshKey,
  readinessOf,
  secondsSince,
  serverKindOf,
  serverLabel,
  sizeParts,
  sshHost,
  uptimeParts,
  usageOfText,
  usageReadings,
  type UsageId,
} from '../logic';
import strings from '../strings.en.json';
import type { Computer, Project, Realm } from '../types';
import { links } from '../links';
import { programUrl } from '../urls';
import { AccessLock, ColourButton, Flag, ServerLabel, StatePill } from './Bits';
import { OnThis } from './Elsewhere';
import { RealmsLine } from './RealmsLine';
import { Environment } from './Env';
import { Features } from './Features';
import { computerUpgrade } from './upgrade';
import { useServerOf } from './useServerOf';
import { IdRow, Mono, UpgradeRow } from './PartBits';
import s from './parts.module.css';

const READY: SectionState = { kind: 'ready' };
const USE_ICON: Record<UseId, IconName> = {
  terminal: 'terminal',
  screen: 'display',
  files: 'files',
  browser: 'browser',
  agent: 'agent',
  site: 'globe',
  ssh: 'key',
};
const USE_PROGRAM: Partial<Record<UseId, ProgramLink>> = {
  terminal: 'terminal',
  screen: 'screen',
  files: 'files',
  browser: 'browser',
  agent: 'agent',
};
const FAILURES = new Set(['CREATE_NOT_STARTED', 'CREATE_FAILED', 'COPY_FAILED']);

export function Overview({
  c,
  projects,
  realms,
  usageOn,
  onUsageOn,
  canStart,
  onStart,
  onRealms,
  onColour,
  current = false,
}: {
  c: Computer;
  projects: Project[] | undefined;
  realms: Realm[] | undefined;
  usageOn: boolean;
  onUsageOn: (on: boolean) => void;
  canStart: boolean;
  onStart: () => void;
  /** Opens the computer's Realms drawer (the one Advanced opens); absent when realms can't be changed here. */
  onRealms?: () => void;
  /** Opens the colour dialog; absent when the colour can't be changed here. */
  onColour?: () => void;
  /** This computer is the top bar's: following a page that acts on the current computer changes nothing first. */
  current?: boolean;
}) {
  const t = useStrings(strings);
  const go = useGo();
  const shownRealm = useShownRealm();
  const b = bucket(c.status);
  const running = b === 'running';
  const handle = handleOf(c);
  const usage = useUsage(c.id, usageOn && running);
  const server = serverLabel(c).name;
  const sharedNote = server ? t('usage.shared', { server }) : t('usage.sharedNoServer');
  // The size upgrade is the server's: beside the size, or under the usage tiles when one of them is at 75 % or more.
  // One place per tab, never both. The tiles' own condition (drawn only for a settled, successful read), so a pending
  // or failed refetch that keeps an old reading never moves the link to tiles that are not drawn.
  const tilesShown = usageOn && running && !usage.isPending && !usage.isError && Boolean(usage.data);
  const tiles = tilesShown && usage.data ? usageReadings(usage.data).map((r) => r.v) : [];
  const up = computerUpgrade(useServerOf(c), tiles);
  const upAtUsage = tiles.some((v) => v !== null && v >= 75);
  const upLink = up.available === 'none' ? null : <UpgradeLink available={up.available} prominence={up.prominence} href={billingLinks.plans} label={t('ov.upgrade')} />;

  const open = (use: UseId) => {
    const prog = USE_PROGRAM[use];
    if (prog) {
      const u = programUrl(c, prog);
      if (u) openOutside(u);
    } else if (use === 'ssh') go(links.connect(handle));
    else go(links.ports(handle));
  };

  // ── Status and usage ──────────────────────────────────────────────────────────────────────────────────────────
  const sz = sizeParts(c);
  const disk = diskGbOf(c);
  const shared = c.server?.specs?.shared_compute === true;
  const host = sshHost(c);
  const reading = tilesShown && usage.data ? usage.data : null;
  const upFor = reading ? secondsSince(reading.started, Date.now()) : null;
  const expiredAt = dateOf(c.server_expired_at);
  const failure = b === 'failed' && c.failure_reason?.code && FAILURES.has(c.failure_reason.code) ? c.failure_reason.code : null;
  // The size upgrade sits beside the first size the row gives (CPU, else memory, else disk), as one value with it.
  const sizeFirst = sz.cores !== null ? 'cpu' : sz.ramGb !== null ? 'memory' : disk !== null ? 'disk' : null;
  const withUp = (id: 'cpu' | 'memory' | 'disk', words: string): ReactNode =>
    upLink && !upAtUsage && sizeFirst === id ? (
      <IdRow>
        {words}
        {upLink}
      </IdRow>
    ) : (
      words
    );
  const status: Fact[] = [
    { label: t('ov.state'), value: <StatePill status={c.status} /> },
    ...(c.server_expired && expiredAt ? [{ label: t('ov.expired'), value: dayText(expiredAt) }] : []),
    ...(upFor !== null ? [{ label: t('ov.upFor'), value: upText(upFor, t) }] : []),
    ...(reading && typeof reading.processes === 'number' ? [{ label: t('ov.processes'), value: String(reading.processes) }] : []),
    ...(host ? [{ label: t('ov.sshAddress'), value: host, mono: true, copy: host, wide: true }] : []),
    ...(sz.cores !== null ? [{ label: t('ov.cpu'), value: withUp('cpu', t('size.cores', { count: sz.cores })) }] : []),
    ...(sz.ramGb !== null ? [{ label: t('ov.memory'), value: withUp('memory', formatStorage(sz.ramGb)) }] : []),
    ...(shared ? [{ label: t('ov.cpuMemory'), value: t('ov.sharedCompute') }] : []),
    ...(disk !== null ? [{ label: t('ov.disk'), value: withUp('disk', formatStorage(disk)) }] : []),
    ...(failure ? [{ label: t('ov.failed'), value: t(`ov.failed.${failure}` as 'ov.failed.CREATE_FAILED'), wide: true }] : []),
  ];
  const usageReload: ReactNode = usageOn && running ? <IconButton icon="reload" size="sm" label={t('usage.reload')} onPress={() => void usage.refetch()} /> : null;

  // ── Access ───────────────────────────────────────────────────────────────────────────────────────────────────
  const acc = accessOf(c);
  const keyOn = hasSshKey(c);
  const fingerprint = keyOn && typeof c.ssh_key_fingerprint === 'string' && c.ssh_key_fingerprint ? c.ssh_key_fingerprint : null;
  const keyAt = keyOn ? dateOf(c.ssh_key_installed_at) : null;
  // Access is read here and changed elsewhere, each with one link: who can open it on the Permissions tab, the SSH key
  // on the Connect tab (its one place to add or replace it). "Learn more" is in the padlock.
  const toPermissions = links.permissions(handle);
  const toKey = (
    <Link variant="nav" href={links.connect(handle)} iconEnd="chevron-right">
      {t(keyOn ? 'ov.keyLink.replace' : 'ov.keyLink.set')}
    </Link>
  );
  const accessFacts: Fact[] = [
    {
      label: t('ov.who'),
      value: (
        <span className={s.idRow}>
          <AccessLock computer={c} onView={() => go(toPermissions)} />
          {t(`access.word.${acc.state}`)}
          <Link variant="nav" href={toPermissions} iconEnd="chevron-right">
            {t('fact.accessLink')}
          </Link>
        </span>
      ),
      wide: true,
    },
    {
      label: t('ssh.fact.key'),
      value: fingerprint ? (
        <span className={s.idRow}>
          <InfoTip text={fingerprint} subject={t('ov.fingerprint')}>
            <Mono>{shortFingerprint(fingerprint)}</Mono>
          </InfoTip>
          {toKey}
        </span>
      ) : (
        <>
          {t(keyOn ? 'ssh.key.on' : 'ssh.key.off')} {toKey}
        </>
      ),
    },
    ...(keyAt ? [{ label: t('ov.keyAdded'), value: dayText(keyAt) }] : []),
  ];

  // ── Where it runs ────────────────────────────────────────────────────────────────────────────────────────────
  const serverId = c.server_id ?? c.server?.id;
  const kind = serverKindOf(c);
  const sv = c.server;
  const placeWords = [sv?.city, sv?.country_name]
    .filter((x): x is string => typeof x === 'string' && x !== '')
    .filter((x, i, a) => a.indexOf(x) === i)
    .join(', ');
  const dc = typeof sv?.datacenter === 'string' && sv.datacenter ? sv.datacenter : '';
  const ends = kind === 'free' ? null : dateOf(sv?.expires_at);
  const endsPassed = ends !== null && ends.getTime() < Date.now();
  const colour = computerColor(c);
  const where: Fact[] = [
    {
      label: t('fact.server'),
      // A known server name goes to its panel in Servers (links.server); its id is copy-only, never shown raw.
      value: (
        <span className={s.idRow}>
          {server ? (
            <Link variant="nav" href={links.server(server)}>
              <ServerLabel computer={c} place={false} />
            </Link>
          ) : (
            <ServerLabel computer={c} place={false} />
          )}
          {serverId ? <CopyButton text={serverId} size="md" label={t('copy.what', { what: t('fact.serverId') })} /> : null}
        </span>
      ),
    },
    ...(kind ? [{ label: t('ov.kind'), value: t(`ov.kind.${kind}`) }] : []),
    ...(placeWords
      ? [
          {
            label: t('ov.location'),
            value: (
              <span className={s.idRow}>
                <Flag cc={serverLabel(c).cc} />
                {placeWords}
              </span>
            ),
          },
        ]
      : []),
    ...(dc ? [{ label: t('ov.datacenter'), value: dc, mono: true }] : []),
    ...(ends
      ? [
          {
            label: t(endsPassed ? 'ov.paidUntil.passed' : 'ov.paidUntil'),
            value: (
              <span className={s.idRow}>
                {endsPassed ? <Icon name="warn" size="sm" /> : null}
                {dayText(ends)}
              </span>
            ),
          },
        ]
      : []),
    { label: t('fact.project'), value: <ProjectFact id={c.project_id} projects={projects} /> },
    ...(colour
      ? [
          {
            label: t('detail.colour'),
            // The colour as a swatch AND its #RRGGBB text (colour is never the only cue); a press opens the colour dialog.
            value: onColour ? (
              <ColourButton c={c} colour={colour} onPress={onColour}>
                <ComputerMark color={colour} size="md" />
                <code>{colour}</code>
              </ColourButton>
            ) : (
              <span className={s.idRow}>
                <ComputerMark color={colour} size="md" />
                <code>{colour}</code>
              </span>
            ),
          },
        ]
      : []),
    { label: t('fact.realms'), wide: true, value: <RealmsLine ids={c.realm_ids ?? []} realms={realms} shown={shownRealm} name={c.name} onManage={onRealms} /> },
  ];

  // ── Details ──────────────────────────────────────────────────────────────────────────────────────────────────
  const created = dateOf(c.created_at);
  const comment = typeof c.comment === 'string' ? c.comment.trim() : '';
  const details: Fact[] = [
    { label: t('fact.computer'), id: c.id },
    { label: t('fact.image'), value: <ImageFact image={c.computer_image} /> },
    ...(created ? [{ label: t('fact.created'), value: dayText(created) }] : []),
    ...(comment ? [{ label: t('ov.note'), value: comment, wide: true }] : []),
  ];

  return (
    <>
      {c.server_expired ? <Band tone="warn">{expiredAt ? t('ov.expiredBand', { name: c.name, date: dayText(expiredAt) }) : t('ov.expiredBandNoDate', { name: c.name })}</Band> : null}
      <AnatomySection id="uses" title={t('uses.title', { name: c.name })} state={READY}>
        <div className={s.useGrid}>
          {USES.map((u) => {
            const st = readinessOf(u, c);
            const press = st === 'ready' ? () => open(u) : st === 'start' ? onStart : () => open('ssh');
            const prog = USE_PROGRAM[u];
            // What pressing does: a program opens in a new browser tab; Website and SSH go to a tab of this page.
            // An expired computer can never start again (409 COMPUTER_EXPIRED): its tiles say so, never Start.
            const word = st === 'ready' ? (prog ? t('use.newTab') : t(`use.${u}.action`)) : st === 'start' ? (c.server_expired ? t('use.expired') : t('menu.start')) : t('use.ssh.setup');
            const mark: IconName | null = st === 'ready' ? (prog ? 'external' : 'chevron-right') : st === 'key' ? 'chevron-right' : null;
            const url = prog && st === 'ready' ? programUrl(c, prog) : undefined;
            return (
              <div key={u} className={s.useCard}>
                <button type="button" className={s.useTile} title={t(`use.${u}.body`)} disabled={st === 'start' && !canStart} onClick={press}>
                  <Icon name={USE_ICON[u]} />
                  <span className={s.useText}>
                    <strong>{t(`use.${u}.name`)}</strong>
                    <span className={s.useWord}>
                      {word}
                      {mark ? <Icon name={mark} size="sm" /> : null}
                    </span>
                  </span>
                </button>
                {/* The address actions have a row of their own under the tile: nothing floats over
                    the tile, nothing appears or moves on hover (it only brightens), and an open QR keeps its anchor. */}
                {url ? (
                  <div className={s.useActions} role="group" aria-label={t('use.actions', { what: t(`use.${u}.name`) })}>
                    <CopyButton text={url} size="md" label={t('copy.what', { what: t(`use.${u}.name`) })} />
                    <QrButton url={url} name={t(`use.${u}.name`)} size="md" reach={qrReachOf(prog ? SLUG[prog] : '')} resetKey={c.id} />
                    <BoardAddButton computer={subjectOf(c)} program={prog} what={t(`use.${u}.name`)} size="md" />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </AnatomySection>

      {/* Two columns on a wide pane (status and what is on it on the start side; access, placement, features and details
          on the end side); one column below that, in the same reading order. Sections in a column keep the kit's own spacing
          between sibling sections (gap 0); the outer gap is the same step between the two columns' runs. */}
      <Stack gap={6} className={s.ovGrid}>
        <Stack gap={0}>
          <AnatomySection id="status" title={t('ov.status')} description={sharedNote} state={READY}>
            <Facts items={status} columns={2} label={t('ov.status')} />
            {upLink && !upAtUsage && sizeFirst === null ? <UpgradeRow>{upLink}</UpgradeRow> : null}
            {/* The usage switch is the first row under the facts, with Reload beside it while readings show. */}
            <Toolbar
              label={t('usage.title')}
              start={
                <>
                  <Switch label={t('usage.show')} isSelected={usageOn} onChange={onUsageOn} />
                  {usageReload}
                </>
              }
            />
            {!usageOn ? (
              <Notice>{t('usage.off')}</Notice>
            ) : !running ? (
              <EmptyState icon="stop" size="sm" title={t('usage.notRunning', { name: c.name })} />
            ) : usage.isPending ? (
              // Loading and failure stay under the switch row: the kit's section states would replace the whole body.
              <Skeleton variant="card" rows={1} />
            ) : usage.isError ? (
              <ErrorState size="sm" title={t('usage.failed')} error={usage.error} onRetry={() => void usage.refetch()} />
            ) : usage.data ? (
              <>
                <div className={s.cards}>
                  {usageReadings(usage.data).map((r) => {
                    const size = r.id === 'cpu' ? null : usage.data?.[r.id];
                    return <UsageTile key={r.id} id={r.id} v={r.v} text={r.text} detail={size ? usageOfText(size, t) : null} />;
                  })}
                </div>
                {upLink && upAtUsage ? upLink : null}
              </>
            ) : (
              <EmptyState icon="clock" size="sm" title={t('usage.none')} />
            )}
          </AnatomySection>
          <OnThis c={c} current={current} />
        </Stack>
        <Stack gap={0}>
          <AnatomySection id="access" title={t('fact.access')} state={READY}>
            <Facts items={accessFacts} columns={2} label={t('fact.access')} />
          </AnatomySection>
          <AnatomySection id="placement" title={t('ov.where')} state={READY}>
            <Facts items={where} columns={2} label={t('ov.where')} />
          </AnatomySection>
          {/* Keyed by the computer: an open question or a shown refusal never carries over to another computer. */}
          <Features key={c.id} c={c} projects={projects} />
          {/* Keyed by the computer: typed values and a shown report never carry over to another computer. */}
          <Environment key={c.id} c={c} />
          <AnatomySection id="facts" title={t('facts.title')} state={READY}>
            <Facts items={details} columns={2} label={t('facts.title')} />
          </AnatomySection>
        </Stack>
      </Stack>
    </>
  );
}

/** "2 d 3 h" / "3 h 12 m" / "12 m" / "40 s": how long the computer has run, in the Programs tab's words. */
function upText(seconds: number, t: (k: 'prog.up.dh' | 'prog.up.hm' | 'prog.up.m' | 'prog.up.s', v: Record<string, number>) => string): string {
  const u = uptimeParts(seconds);
  return u.d ? t('prog.up.dh', { d: u.d, h: u.h }) : u.h ? t('prog.up.hm', { h: u.h, m: u.m }) : u.m ? t('prog.up.m', { m: u.m }) : t('prog.up.s', { s: u.s });
}

/** "SHA256:Xq0hF1…JkHo": the fingerprint's start and end; the whole one is in its tip. */
function shortFingerprint(f: string): string {
  return f.length > 22 ? `${f.slice(0, 14)}…${f.slice(-4)}` : f;
}

function UsageTile({ id, v, text, detail }: { id: UsageId; v: number | null; text: string | null; detail: string | null }) {
  const t = useStrings(strings);
  return (
    <StatTile
      label={t(`usage.label.${id}`)}
      value={v === null || text === null ? '—' : `${text}%`}
      hint={
        <span className={s.tileBars}>
          {v === null || text === null ? null : <Meter value={v} label={t(`usage.${id}`, { pct: text })} />}
          {detail}
        </span>
      }
    />
  );
}

// The image name as the tooltip quotes it: long custom names are cut so the tip stays within the kit's bound.
const IMAGE_TIP_RAW = 120;

/** The image as people read it (core imageWords): the distro's mark, then "Debian 13"; the term's tip quotes the name
 *  as stored. Not known = "—" with a tip that says so, never a blank. */
function ImageFact({ image }: { image: unknown }) {
  const t = useStrings(strings);
  const w = imageWords(image);
  if (!w)
    return (
      <InfoTip text={t('fact.imageUnknown')} subject={t('fact.image')}>
        —
      </InfoTip>
    );
  const raw = w.raw.length > IMAGE_TIP_RAW ? `${w.raw.slice(0, IMAGE_TIP_RAW)}…` : w.raw;
  return (
    <IdRow>
      <Icon name={w.distro ?? 'linux'} size="sm" />
      <InfoTip text={t('fact.imageTip', { raw })} subject={t('fact.image')}>
        {w.label}
      </InfoTip>
    </IdRow>
  );
}

/** The project's name, a link to its row in the Projects view, then its id copy-only (the header names the project, so the
 *  id is never shown a second time). A project not listed has only its id: the masked chip. */
function ProjectFact({ id, projects }: { id: string; projects: Project[] | undefined }) {
  const t = useStrings(strings);
  const p = projects?.find((x) => x.id === id);
  if (!p) return <IdChip id={id} />;
  return (
    <span className={s.idRow}>
      <Link variant="nav" href={`/computers/projects?psel=${encodeURIComponent(handleOf(p))}`}>
        {p.name}
      </Link>
      <CopyButton text={id} size="md" label={t('copy.what', { what: t('fact.projectId') })} />
    </span>
  );
}
