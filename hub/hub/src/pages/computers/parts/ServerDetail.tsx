// The server detail panel: one server's plan, place, hardware, live usage (shared by every computer on it),
// its computers, the server's control commands, and its renewal and billing state. The one change it sends is a server
// command (ServerDetail.commands.tsx, send once); its other actions are links into the places that own them (billing). Mounted by the Servers view when a row is opened.
// A calm Verdict plate on top says what is true of the server now (detail unreadable, not listed,
// full, or the room left); every block is the one Section kind (AnatomySection, as Server control is); the loose
// fallback lines became Facts rows, a Section note or a Section state.
import { commerceRules, listingRules, useCan } from '@core';
import { AnatomySection, Button, Drawer, Facts, Link, Meter, NotifyHint, formatStorage, StatusPill, UpgradeLink, useStrings, Verdict, VerdictMark, type Fact, type SectionState } from '@kit';
import { links as billingLinks } from '../../billing/links';
import { handleOf, pctText, serverFull, subView } from '../logic';
import { links } from '../links';
import pageStrings from '../strings.en.json';
import type { Computer, Server, Subscription } from '../types';
import { Flag } from './Bits';
import { ServerControl } from './ServerDetail.commands';
import { useServerFacts, useServerRuntime } from './ServerDetail.data';
import { capFull, type ServerFacts, type ServerRuntime } from './ServerDetail.logic';
import detailStrings from './ServerDetail.strings.en.json';
import { roomUpgrade, type Upgrade } from './upgrade';
import { useOut } from './useOut';
import s from './parts.module.css';

// One table: the panel's own words and the page's (usage, servers and subscription words are reused, never copied).
const strings = { ...pageStrings, ...detailStrings };
type T = ReturnType<typeof useStrings<typeof strings>>;

// The rental's status in words (the API's rental states); any other value shows no row, never the raw word.
const STATUS_KEY = { active: 'sd.status.active', hold: 'sd.status.hold', expired: 'sd.status.expired', terminated: 'sd.status.terminated' } as const;
const statusKey = (v: string): (typeof STATUS_KEY)[keyof typeof STATUS_KEY] | null => (Object.hasOwn(STATUS_KEY, v) ? STATUS_KEY[v as keyof typeof STATUS_KEY] : null);

const date = (iso: string | null | undefined): string | null => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d.getTime()) ? d.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
};

export interface ServerDetailProps {
  /** The Servers view's own row: the panel shows it at once and fills in the rest from the API. */
  server: Server;
  /** The list row's own id (the rental), when the view has it: with several rows for one server, exactly the one opened. */
  rentalId?: string;
  /** The page's computers (those on this server are listed). undefined: not known (still loading, or the read failed): the panel says so. */
  computers: readonly Computer[] | undefined;
  /** The page's paid subscriptions. undefined: not known, as for computers. */
  subs: readonly Subscription[] | undefined;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ServerDetailDrawer({ server, rentalId, computers, subs, isOpen, onOpenChange }: ServerDetailProps) {
  return (
    <Drawer overlayId="computers-server-detail-drawer" resizeKey="computers-server-detail" isOpen={isOpen} onOpenChange={onOpenChange} title={server.name} cancel={false} size="md">
      {isOpen ? <ServerDetailBody server={server} {...(rentalId ? { rentalId } : {})} computers={computers} subs={subs} /> : null}
    </Drawer>
  );
}

export function ServerDetailBody({ server, rentalId, computers, subs }: Pick<ServerDetailProps, 'server' | 'rentalId' | 'computers' | 'subs'>) {
  const t = useStrings(strings);
  const out = useOut();
  // The commands are for the person's own account (the API refuses an access token): 'account' is never part of a token's access.
  const account = useCan('account');
  const facts = useServerFacts({ serverId: server.id, ...(rentalId ? { rentalId } : {}) }, true);
  // A failed refresh leaves the older row in the query: it is not shown as if it were current.
  const f: ServerFacts | null = facts.isError ? null : (facts.data ?? null);
  // The runtime route takes the rental id (a free slice's own server id), known once the list row is.
  const rt = useServerRuntime(f?.rentalId ?? '', !!f);

  const free = f?.free ?? server.free;
  const cap = f?.cap ?? server.cap;
  const full = f ? capFull(f) : serverFull(server);
  const here = (computers ?? []).filter((c) => c.server_id === server.id || (!!f && c.server_id === f.serverId));
  const sub = (subs ?? []).find((x) => x.server_name && x.server_name === server.name) ?? null;
  const cores = f?.cores ?? server.cpu;
  const ram = f?.ramGb ?? server.ram;
  const disk = f?.diskGb ?? server.disk;
  const place = f?.city || server.place;
  const cc = f?.cc || server.cc;
  const days = f ? f.days : server.days;
  // The renewal row's upgrade: near or full from the highest of its room and usage meters; a whole
  // machine (the facts say not a slice) gets none.
  const run = rt.isError ? null : (rt.data ?? null);
  const up = roomUpgrade({ free, kind: f?.isVm === false ? 'metal' : server.kind, cap }, full, run ? [run.cpu, run.mem, run.disk] : []);

  // The disks in the Hub's units, in the Market's disk words, from the disk groups. Without groups, the API's summary
  // as given: the one opaque fallback (the Market's listing facts do the same), never rewritten.
  const diskLine = f ? (f.disks.length ? listingRules.disksLine({ disks: f.disks, diskSummary: f.diskSummary || null, diskGb: f.diskGb }) : f.diskSummary) : '';
  const hardware = [
    cores !== null ? t('srv.cpu', { count: cores }) : null,
    ram !== null ? t('srv.ram', { size: formatStorage(ram) }) : null,
    disk !== null ? t('srv.disk', { size: formatStorage(disk) }) : null,
  ].filter(Boolean);
  const network = [
    f?.bandwidth || null,
    f?.trafficUnlimited ? t('sd.trafficUnlimited') : f?.trafficTb != null ? t('sd.traffic', { tb: f.trafficTb }) : null,
  ].filter(Boolean);
  const addresses = [f?.ipv4Count != null ? t('sd.ipv4', { count: f.ipv4Count }) : null].filter(Boolean);

  const stKey = statusKey(f?.status || server.status);
  const about: Fact[] = [
    { label: t('sd.plan'), value: free ? <StatusPill tone="info">{t('srv.free')}</StatusPill> : <StatusPill>{t('srv.paid')}</StatusPill> },
    {
      label: t('sd.place'),
      value: (
        <span className={s.serverLabel}>
          <Flag cc={cc} />
          <span>{[place, f?.datacenter].filter(Boolean).join(' · ') || '—'}</span>
        </span>
      ),
    },
    ...(stKey ? [{ label: t('sd.status'), value: t(stKey) }] : []),
    ...(f && f.isVm !== null ? [{ label: t('sd.kind'), value: f.isVm ? t('sd.kindSlice') : t('sd.kindMetal') }] : []),
    ...(f?.model ? [{ label: t('sd.model'), value: f.model }] : []),
    ...(hardware.length ? [{ label: t('sd.hardware'), value: hardware.join(' · ') }] : []),
    ...(diskLine ? [{ label: t('sd.disks'), value: diskLine }] : []),
    ...(f?.cpuModel
      ? [
          {
            label: t('sd.cpuModel'),
            value: f.threads !== null && f.cores !== null ? `${f.cpuModel} (${t('sd.threads', { cores: f.cores, threads: f.threads })})` : f.cpuModel,
          },
        ]
      : []),
    ...(network.length ? [{ label: t('sd.network'), value: network.join(' · ') }] : []),
    ...(addresses.length ? [{ label: t('sd.addresses'), value: addresses.join(' · ') }] : []),
    // A capability with a plain answer. kvm_supported is false for every free-tier server (the API
    // refuses free and paid subserver tiers), so that is the one No reason the data proves; any other
    // No (host checks, size, rental state) shows no reason. null (not known) shows no row.
    ...(f && f.kvm !== null
      ? [
          {
            label: t('sd.kvm'),
            value: f.kvm ? (
              <StatusPill tone="ok">{t('sd.kvmYes')}</StatusPill>
            ) : (
              <>
                <StatusPill>{t('sd.kvmNo')}</StatusPill>
                {f.free ? <span className={s.muted}> {t('sd.kvmNoFree')}</span> : null}
              </>
            ),
            ...(f.kvm || !f.free ? {} : { wide: true }),
          },
        ]
      : []),
  ];

  // One sentence, the most pressing first: the detail could not be read, the server is not listed, it is full; else the
  // room left, else its plan. The one coloured phrase is the part that is wrong.
  const verdict = facts.isError ? (
    <VerdictMark tone="warn">{t('sd.basic')}</VerdictMark>
  ) : facts.isSuccess && !f ? (
    <VerdictMark tone="warn">{t('sd.missing')}</VerdictMark>
  ) : full ? (
    <VerdictMark tone="warn">{t('srv.capFull')}</VerdictMark>
  ) : cap ? (
    t('sd.verdict.room', { count: Math.max(0, cap.max - cap.used) })
  ) : (
    t(free ? 'sd.verdict.free' : 'sd.verdict.paid')
  );
  const usageRows = run ? usageOf(run) : [];
  // Loading draws the kit's rows; otherwise the readings, or the note that none can be shown (or that they are old).
  const usageState: SectionState = !!f && rt.isPending ? { kind: 'loading', rows: 3 } : { kind: 'ready' };
  const usageNote = !usageRows.length ? t('sd.usageNone') : run?.stale ? t('sd.usageStale') : null;

  return (
    <div className={s.stack}>
      <Verdict label={t('sd.verdictLabel')}>{verdict}</Verdict>
      <AnatomySection id="server-about" title={t('sd.about')}>
        <Facts items={about} label={t('sd.about')} />
      </AnatomySection>

      <AnatomySection
        id="server-usage"
        title={t('sd.usage')}
        description={t('usage.shared', { server: server.name })}
        state={usageState}
        {...(usageNote && usageState.kind === 'ready' ? { note: usageNote } : {})}
      >
        <Usage rows={usageRows} t={t} />
      </AnatomySection>

      <AnatomySection
        id="server-computers"
        title={t('sd.computers')}
        // The body is the room meter (from the server's facts) and the list: both drawn as read, so ready; computers
        // not known yet are said in the note, never as none.
        state={{ kind: 'ready' }}
        {...(computers === undefined ? { note: t('sd.computersUnknown') } : !here.length ? { note: t('sd.computersNone') } : {})}
      >
        {cap ? (
          <div className={s.usageBars}>
            <Meter value={(cap.used / Math.max(1, cap.max)) * 100} label={t('sd.capacityOf', { used: cap.used, max: cap.max })} size="fill" />
            <span className={`${s.mono} ${full ? s.warnText : ''}`}>{t('srv.capOf', { used: cap.used, max: cap.max })}</span>
          </div>
        ) : null}
        {here.length ? (
          <ul className={s.plain}>
            {here.map((c) => (
              <li key={c.id}>
                <Link variant="nav" href={links.item(handleOf(c))}>
                  {c.name} {t('nav.more')}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </AnatomySection>

      {f && account && !f.free && f.isVm !== true ? (
        <ServerControl serverId={f.serverId} rentalId={f.rentalId} serverName={server.name} computerCount={computers === undefined ? undefined : here.length} />
      ) : null}

      <AnatomySection id="server-billing" title={t('sd.billing')}>
        <Billing free={free} f={f} days={days} sub={sub} subsKnown={subs !== undefined} up={up} out={out} t={t} />
      </AnatomySection>
    </div>
  );
}

type UsageKey = 'usage.cpu' | 'usage.mem' | 'usage.disk';
function usageOf(rt: ServerRuntime): (readonly [UsageKey, number])[] {
  return (
    [
      ['usage.cpu', rt.cpu],
      ['usage.mem', rt.mem],
      ['usage.disk', rt.disk],
    ] as const
  ).filter((r): r is readonly [UsageKey, number] => r[1] !== null);
}

function Usage({ rows, t }: { rows: readonly (readonly [UsageKey, number])[]; t: T }) {
  return (
    <div className={s.stack}>
      {rows.map(([key, v]) => (
        <div key={key} className={s.tileBars}>
          <Meter value={v} label={t(key, { pct: pctText(v) })} size="fill" />
          <span className={s.mono}>{t(key, { pct: pctText(v) })}</span>
        </div>
      ))}
    </div>
  );
}

function Billing({
  free,
  f,
  days,
  sub,
  subsKnown,
  up,
  out,
  t,
}: {
  free: boolean;
  f: ServerFacts | null;
  days: number | null;
  sub: Subscription | null;
  subsKnown: boolean;
  up: Upgrade;
  out: ReturnType<typeof useOut>;
  t: T;
}) {
  const v = sub ? subView(sub) : null;
  const end = date(f?.rentalEnd);
  const items: Fact[] = [
    ...(end ? [{ label: t('sd.paidUntil'), value: end }] : []),
    ...(days !== null && !free ? [{ label: t('sd.left'), value: t('srv.days', { count: days }) }] : []),
    ...(f?.amount ? [{ label: t('sd.amount'), value: commerceRules.usdText(f.amount) }] : []),
    ...(sub && v
      ? [
          {
            label: t('sd.sub'),
            value: (
              <StatusPill tone={v.tone} dot>
                {t(`sub.${v.key}`, { date: date(sub.delete_at) ?? '' })}
              </StatusPill>
            ),
          },
          ...(date(sub.paid_through)
            ? [
                {
                  label: t('srv.sub.renews'),
                  value: t(sub.auto_renew === false ? 'sub.stops' : 'sub.renews', { date: date(sub.paid_through) ?? '' }),
                },
              ]
            : []),
        ]
      : []),
  ];
  // A free server has one row: nothing to renew. A paid one with nothing else listed says so in its Subscription row
  // (not known yet, or none listed).
  const known = items.length > 0;
  const rows: Fact[] = free
    ? [{ label: t('srv.sub.renews'), value: t('sd.freeNoRenew') }]
    : [...items, ...(!subsKnown ? [{ label: t('sd.sub'), value: t('sd.subUnknown') }] : !known ? [{ label: t('sd.sub'), value: t('sd.noSub') }] : [])];
  return (
    <div className={s.stack}>
      <Facts items={rows} label={t('sd.billing')} />
      {!free && known ? <NotifyHint kind="rental" /> : null}
      <div className={s.row}>
        {v?.pay && out.has.buy ? (
          <Button size="sm" variant="primary" onPress={() => out.billing()}>
            {t('sub.payNow')}
          </Button>
        ) : null}
        <UpgradeLink available={up.available} prominence={up.prominence} href={billingLinks.plans} label={t('srv.upgrade')} />
        {!free && out.has.billing ? (
          <Button size="sm" variant="secondary" onPress={() => out.billing()}>
            {t('sd.billingOpen')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
