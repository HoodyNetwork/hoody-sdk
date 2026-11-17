// Link and keys (the Backups/Storage pattern): an At a glance block (link state, keys "N of max"
// with a meter, limits, other websites), a Keys table, and an Addresses table with one row per address the link answers
// on. The link's own controls sit in the Addresses head (Limits and websites; Re-point, Turn off/on and Panic in its
// menu). A fresh key's secret lives only in the SecretField the parent holds; nothing here keeps it. Link states
// (applying, frozen) show in the glance; an unknown state and any other reason show in the Addresses notices.
import {
  AnatomySection,
  Band,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Facts,
  Meter,
  OutcomeBanner,
  SecretField,
  Stack,
  StatusPill,
  Tag,
  createColumnHelper,
  useFresh,
  formatDateTime,
  useStrings,
  type ActionSpec,
  type Fact,
  type MenuList,
  type RowActionEntry,
  openOutside,
} from '@kit';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BotLink, BotView, Change, LinkKey, LinkOffer, MintResult } from '../data';
import { KEYS_MAX, LINK_TONE, keyStateOf, linkAddresses, lockNote, previewUrl, propagationBusy, type AddressKind } from '../logic';
import strings from '../strings.en.json';
import { HeldDangerConfirm, dialogOutcome } from './Bits';
import { KeyShare, issueKey } from './KeyShare';
import { DoorDrawer, type Door } from './LinkDoor';
import { cancelJob, focusAfterDialogs, type KeysCue } from './keysCue';
import l from './link.module.css';
import s from './pane.module.css';

export interface FreshKey {
  secret: string;
  name: string;
}

interface Props {
  bot: BotView;
  link: BotLink | null;
  loading: boolean;
  offer: LinkOffer | undefined;
  fresh: FreshKey | null;
  onDropSecret: () => void;
  patch: Change<BotLink, { enabled?: boolean; cors?: boolean }>;
  panic: Change<BotLink, void>;
  revokeAll: Change<{ revoked: number }, void>;
  rotate: Change<MintResult, { keyId: string }>;
  keyChange: Change<LinkKey, { keyId: string; action: 'pause' | 'resume' | 'revoke' | 'edit' }>;
  onOpenLinkDrawer: () => void;
  onOpenLimits: () => void;
  onOpenRepoint: () => void;
  onNewKey: () => void;
  onEditKey: (id: string) => void;
  onRotated: (secret: string, name: string) => void;
  /** A first link was just made in this view: once the keys are read and there are none, mark the keys part "here"
   *  (data-hub-here, the kit's short tint; still under reduced motion) and give New key the keyboard, then call
   *  onKeysCueSeen. Keys already there: only onKeysCueSeen. */
  keysCue?: KeysCue | null;
  onKeysCueSeen?: () => void;
}

/** How long the keys part stays marked: the kit's "here" tint (HERE_MS, --dur-4). */
const KEYS_HERE_MS = 1200;
export { focusAfterDialogs, keysCueFor, type KeysCue } from './keysCue';

/** A link-level confirm (Panic, Revoke all, Turn off) carries the id of the link it was opened over. */
type LinkConfirm = { kind: 'panic' | 'revokeAll' | 'off'; linkId: string };
type Confirm = null | LinkConfirm | { kind: 'revoke'; key: LinkKey } | { kind: 'rotate'; key: LinkKey };

const col = createColumnHelper<LinkKey>();
const doorCol = createColumnHelper<Door>();
const NOW = () => Date.now();
/** How long a copied address row says "Copied". */
const COPIED_MS = 1200;

type T = ReturnType<typeof useStrings<typeof strings>>;

/** The four facts of the link: its state, its keys of the most it holds, its call limits, and other websites. Keys not
 *  read whole say "Can't tell", never a count. */
function LinkGlance({ link, t }: { link: BotLink; t: T }) {
  const count = link.keys.length;
  const items: Fact[] = [
    {
      label: t('linkGlance.link'),
      value: (
        <StatusPill tone={LINK_TONE[link.status]} dot>
          {t(`link.status.${link.status}`)}
        </StatusPill>
      ),
    },
    {
      label: t('linkGlance.keys'),
      value: link.keysKnown ? (
        <span className={l.kept}>
          {t('linkGlance.keysValue', { count, max: KEYS_MAX })}
          <Meter value={(Math.min(count, KEYS_MAX) / KEYS_MAX) * 100} label={t('linkGlance.keysMeter', { count, max: KEYS_MAX })} />
        </span>
      ) : (
        t('linkGlance.cantTell')
      ),
    },
    { label: t('linkGlance.limits'), value: t('linkGlance.limitsValue', { key: link.limits.key_rpm ?? 60, bot: link.limits.bot_rpm ?? 120 }) },
    { label: t('linkGlance.cors'), value: link.cors ? t('link.cors.on') : t('link.cors.off') },
    // A frozen link says, with its state, why and what the person can do: the owner cannot unfreeze it here.
    // A change still going out to the Bot's computers is said here too, with the state it changes.
    ...(propagationBusy(link.propagation) ? [{ label: t('linkGlance.change'), value: t('link.propagating', { done: link.propagation?.succeeded ?? 0, total: link.propagation?.targets ?? 0, count: link.propagation?.targets ?? 0 }), wide: true }] : []),
    ...(link.status === 'frozen' ? [{ label: t('linkGlance.frozenWhy'), value: [link.statusReason, t('linkGlance.frozenNext')].filter(Boolean).join(' '), wide: true }] : []),
  ];
  return (
    <AnatomySection id="bot-link-glance" title={t('linkGlance.title')} state={{ kind: 'ready' }}>
      <Facts items={items} columns={2} label={t('linkGlance.title')} />
    </AnatomySection>
  );
}

export function LinkTab(p: Props) {
  const t = useStrings(strings);
  const { link, offer, bot } = p;
  const fresh = useFresh(link?.createdAt);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [door, setDoor] = useState<{ door: Door; open: boolean } | null>(null);
  const [copied, setCopied] = useState<AddressKind | null>(null);
  // A change sent straight from a menu (Turn link on, a key's Pause or Resume) has no dialog to say it was refused or
  // not sent: said in that part's notices, until the next such press or its close. A press held behind an unknown
  // outcome (READ_BACK_FIRST) is already said by that outcome's own banner.
  const [refused, setRefused] = useState<{ what: 'link' | 'key'; kind: 'failed' | 'not_sent'; code: string | undefined } | null>(null);
  const direct = (what: 'link' | 'key', sent: Promise<{ outcome: string; code?: string; cancelled?: boolean }> | undefined) => {
    setRefused(null);
    void Promise.resolve(sent).then((r) => {
      // A cancelled 2FA prompt is the person's own choice: nothing is said.
      const kind = r?.outcome === 'failed' ? 'failed' : r?.outcome === 'not_sent' && r.code !== 'READ_BACK_FIRST' && !r.cancelled ? 'not_sent' : null;
      if (kind) setRefused({ what, kind, code: r?.code });
    });
  };
  const keyRows = useMemo(() => link?.keys ?? [], [link]);
  const keysRef = useRef<HTMLDivElement>(null);
  const [keysHere, setKeysHere] = useState(false);
  // The cue this tab took (held for the tab's life, so the mark ending never cancels the focus job).
  const [cue, setCue] = useState<KeysCue | null>(null);
  const owed = p.keysCue ?? null;
  const cueReady = owed !== null && link !== null && link.keysKnown;
  const keyCount = keyRows.length;
  // A key's Revoke or Rotate is bound to that key: once no send is running, a refresh that takes the key away (revoked
  // elsewhere, the link replaced, the keys no longer known) closes the dialog, so Confirm never sends for a key that is gone.
  const confirmKeyGone = (confirm?.kind === 'revoke' || confirm?.kind === 'rotate') && !keyRows.some((k) => k.id === confirm.key.id);
  const keySending = p.keyChange.running || p.rotate.running;
  useEffect(() => {
    if (confirmKeyGone && !keySending) setConfirm(null);
  }, [confirmKeyGone, keySending]);
  // Panic, Revoke all and Turn off are bound to the link they were opened over: a link deleted and made again elsewhere
  // has another id (and the change would go to that new link), so the dialog closes once no send of its own is running
  // and Confirm sends nothing meanwhile (sameLink).
  const linkId = link?.id;
  const linkConfirm = confirm?.kind === 'panic' || confirm?.kind === 'revokeAll' || confirm?.kind === 'off' ? confirm : null;
  const sameLink = (kind: LinkConfirm['kind']) => linkConfirm?.kind === kind && linkConfirm.linkId === linkId;
  const confirmLinkGone = linkConfirm !== null && linkConfirm.linkId !== linkId;
  const linkSending = linkConfirm === null ? false : linkConfirm.kind === 'panic' ? p.panic.running : linkConfirm.kind === 'revokeAll' ? p.revokeAll.running : p.patch.running;
  useEffect(() => {
    if (confirmLinkGone && !linkSending) setConfirm(null);
  }, [confirmLinkGone, linkSending]);
  // The page passes a new callback each render: read through a ref, so a re-render never re-runs or cancels the cue.
  const cueSeen = useRef(p.onKeysCueSeen);
  useEffect(() => {
    cueSeen.current = p.onKeysCueSeen;
  });
  // The cue is spent the first time the keys are read: taken (marked, focus) only when there are none.
  useEffect(() => {
    if (!cueReady || owed === null) return;
    cueSeen.current?.();
    if (keyCount === 0) setCue(owed);
    else owed.end();
  }, [cueReady, owed, keyCount]);
  useEffect(() => {
    if (cue === null) return;
    const job = { on: true, raf: 0 };
    setKeysHere(true);
    focusAfterDialogs(() => keysRef.current?.querySelector<HTMLElement>('[data-action-id="keys-new"]'), cue, job);
    const id = setTimeout(() => setKeysHere(false), KEYS_HERE_MS);
    return () => {
      job.on = false;
      cancelJob(job);
      clearTimeout(id);
      cue.end();
    };
  }, [cue]);
  // While the link has no key, New key says why one is needed to assistive tech too (the Keys table's empty state says
  // it on screen): an ActionSpec takes no description, so it is set on the drawn button, after
  // every commit, since the head may draw it afresh.
  const needKey = link !== null && link.keysKnown && keyRows.length === 0;
  const needKeyText = t('keys.emptyBody');
  useEffect(() => {
    const el = keysRef.current?.querySelector<HTMLElement>('[data-action-id="keys-new"]');
    if (!el) return;
    if (needKey) el.setAttribute('aria-description', needKeyText);
    else el.removeAttribute('aria-description');
  });
  useEffect(() => {
    if (copied === null) return;
    const id = setTimeout(() => setCopied(null), COPIED_MS);
    return () => clearTimeout(id);
  }, [copied]);

  const entries = (k: LinkKey): RowActionEntry[] => {
    const state = keyStateOf(k, NOW());
    return [
      { id: 'edit', label: t('key.edit'), icon: 'pen', inline: true, opens: true, onAction: () => p.onEditKey(k.id) },
      state === 'paused'
        ? { id: 'resume', label: t('key.resume'), icon: 'play', onAction: () => direct('key', p.keyChange.run({ keyId: k.id, action: 'resume' })) }
        : { id: 'pause', label: t('key.pause'), icon: 'pause', isDisabled: state === 'expired', onAction: () => direct('key', p.keyChange.run({ keyId: k.id, action: 'pause' })) },
      { id: 'rotate', label: t('key.rotate'), icon: 'reload', opens: true, onAction: () => setConfirm({ kind: 'rotate', key: k }) },
      '-',
      { id: 'revoke', label: t('key.revoke'), icon: 'trash', tone: 'danger', opens: true, onAction: () => setConfirm({ kind: 'revoke', key: k }) },
    ];
  };

  const columns = useMemo(
    () => [
      // Measured columns: Name, Prefix, Addresses and Expires take their words' width (declared widths stay their
      // floors), Notes takes the rest; Status is a pill and keeps its width. Name is the first cell, which starts 16 px in,
      // not 12: the kit pads it (DataTable Edges).
      col.accessor('name', { header: t('keys.col.name'), meta: { pinned: true, size: 'fit' } }),
      col.accessor('prefix', { header: t('keys.col.prefix'), meta: { width: '120px', priority: 2, size: 'fit', mono: true, fitText: (k: LinkKey) => t('keys.prefixShown', { prefix: k.prefix }) }, cell: (c) => t('keys.prefixShown', { prefix: c.getValue() }) }),
      col.accessor((k) => keyStateOf(k, NOW()), {
        id: 'state',
        header: t('keys.col.status'),
        meta: { width: '120px' },
        cell: (c) => (
          <StatusPill tone={c.getValue() === 'active' ? 'ok' : c.getValue() === 'expired' ? 'danger' : 'neutral'} dot>
            {t(`keys.state.${c.getValue()}`)}
          </StatusPill>
        ),
      }),
      col.accessor((k) => k.allowlist.length, {
        id: 'addresses',
        header: t('keys.col.addresses'),
        meta: { width: '140px', priority: 3, size: 'fit', fitText: (k: LinkKey) => (k.allowlist.length === 0 ? t('keys.anyAddress') : t('keys.addressCount', { count: k.allowlist.length })) },
        cell: (c) => (c.getValue() === 0 ? t('keys.anyAddress') : t('keys.addressCount', { count: c.getValue() })),
      }),
      col.accessor((k) => k.expiresAt ?? '', { id: 'expires', header: t('keys.col.expires'), meta: { width: '130px', priority: 4, size: 'fit', fitText: (k: LinkKey) => (k.expiresAt ? formatDateTime(k.expiresAt) : t('keys.never')) }, cell: (c) => (c.getValue() ? formatDateTime(c.getValue()) : t('keys.never')) }),
      col.accessor('notes', { header: t('keys.col.notes'), meta: { priority: 4, size: 'fill' }, cell: (c) => c.getValue() || '—' }),
    ],
    [t],
  );

  const doorColumns = useMemo(
    () => [
      doorCol.display({ id: 'kind', header: t('addr.col.kind'), meta: { pinned: true, size: 'fit', fitText: (d: Door) => t(`addr.kind.${d.id}`) }, cell: (x) => t(`addr.kind.${x.row.original.id}`) }),
      // Plain text, never the table's default link: a program's address is copied, not opened (Open is in the row menu
      // for the chat page and the skill file only).
      doorCol.accessor('value', { id: 'address', header: t('addr.col.address'), meta: { size: 'fill', minWidth: 220, mono: true, wraps: true }, cell: (x) => x.getValue() }),
      doorCol.display({ id: 'works', header: t('addr.col.works'), meta: { size: 'fit', priority: 3, fitText: (d: Door) => t(`addr.works.${d.id}`) }, cell: (x) => <Tag>{t(`addr.works.${x.row.original.id}`)}</Tag> }),
    ],
    [t],
  );

  if (!link) {
    const ready = offer?.door === 'ready';
    const preview = offer ? previewUrl('', offer.zone, offer.suggestedLabel) : '';
    // The example is text in the body's own sentence, never a raw element in the EmptyState's text slot.
    const example =
      offer && offer.door !== 'off' ? (
        <>
          {t('link.exampleLead')} {offer.zoneFrom === 'platform' ? t('link.platformPreview', { url: preview }) : preview || t('link.noZone')}
        </>
      ) : undefined;
    return (
      <div className={s.tabBody}>
        <AnatomySection id="bot-link-addresses" title={t('addr.title')} description={t('link.desc')}>
          <EmptyState
            size="sm"
            icon="link"
            title={t('link.none')}
            body={
              example !== undefined ? (
                <>
                  {t('link.noneBody')} {example}
                </>
              ) : (
                t('link.noneBody')
              )
            }
            action={
              <Button variant="primary" icon="plus" isDisabled={!ready || p.loading} onPress={p.onOpenLinkDrawer}>
                {t('link.give')}
              </Button>
            }
            {...(offer && offer.door !== 'ready' ? { hint: t(`link.door.${offer.door}`) } : {})}
          />
        </AnatomySection>
      </div>
    );
  }

  const full = keyRows.length >= KEYS_MAX;
  const addresses = linkAddresses(link.url);
  const band = link.status === 'unknown' ? { text: t('link.unknownStatus') } : link.statusReason && link.status !== 'frozen' ? { text: link.statusReason } : null;
  const nameOf = (d: Door) => t(`addr.kind.${d.id}`);

  // ── Keys ──
  const newKey: ActionSpec = { id: 'keys-new', label: t('keys.new'), icon: 'plus', opens: 'dialog', onPress: p.onNewKey, ...(full ? { disabledReason: t('keys.full', { max: KEYS_MAX }) } : {}) };
  const keysMenu: MenuList =
    link.keysKnown && keyRows.length > 0
      ? [{ id: 'revoke-all', label: t('keys.revokeAll'), icon: 'key', tone: 'danger', opens: true, isDisabled: p.revokeAll.running || p.revokeAll.outcome === 'pending', onAction: () => setConfirm({ kind: 'revokeAll', linkId: link.id }) }]
      : [];
  const keysNotices = (
    <>
      {!link.keysKnown && <Band size="table" /* noDetails: the agent's answer held no key list, not a rejection */>{t('keys.unknown')}</Band>}
      {p.rotate.outcome === 'pending' && <OutcomeBanner kind="pending" title={t('secret.unknown')} body={t('secret.unknownBody')} onCheck={() => p.rotate.readBack()} onDismiss={() => p.rotate.dismiss()} />}
      {refused?.what === 'key' && p.keyChange.outcome !== 'pending' && <OutcomeBanner kind={refused.kind} error={{ outcome: refused.kind, code: refused.code }} onDismiss={() => setRefused(null)} />}
      {p.keyChange.outcome === 'pending' && <OutcomeBanner kind="pending" title={t('keys.notConfirmed')} onCheck={() => p.keyChange.readBack()} onDismiss={() => p.keyChange.dismiss()} />}
      {p.revokeAll.outcome === 'pending' && confirm?.kind !== 'revokeAll' && <OutcomeBanner kind="pending" title={t('keys.revokeAllMaybe')} body={t('keys.revokeAllMaybeBody')} onCheck={() => p.revokeAll.readBack()} onDismiss={() => p.revokeAll.dismiss()} />}
    </>
  );

  // ── Addresses: the link's own controls in the head ──
  const toggleOff = p.patch.running || link.status === 'frozen';
  const addrMenu: MenuList = [
    { id: 'repoint', label: t('link.repoint'), icon: 'arrow-right', opens: true, onAction: p.onOpenRepoint },
    link.ownerEnabled
      ? { id: 'turn-off', label: t('addr.turnOff'), icon: 'pause', opens: true, isDisabled: toggleOff, onAction: () => setConfirm({ kind: 'off', linkId: link.id }) }
      : { id: 'turn-on', label: t('addr.turnOn'), icon: 'play', isDisabled: toggleOff, onAction: () => direct('link', p.patch.run({ enabled: true })) },
    '-',
    { id: 'panic', label: t('panic.button'), description: t('panic.hint'), icon: 'stop', tone: 'danger', opens: true, onAction: () => setConfirm({ kind: 'panic', linkId: link.id }) },
  ];
  const limitsAction: ActionSpec = { id: 'link-limits', label: t('addr.limits'), icon: 'settings', opens: 'dialog', onPress: p.onOpenLimits };
  const addrNotices = (
    <>
      {fresh && <Band size="table" /* noDetails: a note from the link's own created time, not a rejection */>{t('link.freshNote')}</Band>}
      {link.propagation?.state === 'failed' && <OutcomeBanner kind="stale" title={t('link.propFailed')} />}
      {band && <Band size="table">{band.text}</Band>}
      {addresses.length === 0 && <Band size="table" /* noDetails: the link read holds no address, not a rejection */>{t('link.any.noAddress')}</Band>}
      {refused?.what === 'link' && p.patch.outcome !== 'pending' && <OutcomeBanner kind={refused.kind} error={{ outcome: refused.kind, code: refused.code }} onDismiss={() => setRefused(null)} />}
      {p.patch.outcome === 'pending' && <OutcomeBanner kind="pending" onCheck={() => p.patch.readBack()} onDismiss={() => p.patch.dismiss()} />}
      {p.panic.outcome === 'pending' && <OutcomeBanner kind="pending" onCheck={() => p.panic.readBack()} onDismiss={() => p.panic.dismiss()} />}
    </>
  );
  const doorActions = (d: Door): RowActionEntry[] => {
    const name = nameOf(d);
    const done = copied === d.id;
    return [
      { id: 'copy', label: done ? t('addr.copied') : t('addr.copyName', { kind: name }), ...(done ? {} : { short: t('addr.copy') }), icon: done ? 'check' : 'copy', inline: true, copy: d.value, onAction: () => setCopied(d.id) },
      ...(d.open ? [{ id: 'open', label: t(d.id === 'chat' ? 'link.any.open.chat' : 'link.any.open.skill'), icon: 'external' as const, onAction: () => void openOutside(d.open!) }] : []),
      { id: 'how', label: t('addr.howName', { kind: name }), icon: 'file-code', opens: true, onAction: () => setDoor({ door: d, open: true }) },
    ];
  };

  return (
    <div className={s.tabBody}>
      <LinkGlance link={link} t={t} />

      <div ref={keysRef} data-keys-block="" data-hub-here={keysHere ? '' : undefined}>
        <AnatomySection
          id="bot-link-keys"
          title={t('keys.heading')}
          description={t('keys.desc')}
          actions={{ primary: newKey, ...(keysMenu.length > 0 ? { menu: keysMenu } : {}) }}
          notices={keysNotices}
          state={{ kind: 'ready' }}
          flush
        >
          {/* The Keys body is flush (its table runs to the card's edges): the new key's block keeps an inset (kit Stack). */}
          {p.fresh && (
            <Stack padding="md">
            <div className={s.freshKey}>
              <SecretField label={t('secret.title', { name: p.fresh.name })} value={p.fresh.secret} description={t('secret.note')} onWipe={p.onDropSecret} />
              <KeyShare key={issueKey(p.fresh)} secret={p.fresh.secret} url={link.url || undefined} />
              <Button size="sm" onPress={p.onDropSecret}>
                {t('secret.done')}
              </Button>
            </div>
            </Stack>
          )}
          {link.keysKnown && (
            <DataTable
              bare
              fill={false}
              label={t('keys.title', { count: keyRows.length })}
              data={keyRows}
              columns={columns}
              getRowId={(k) => k.id}
              noViewMenu
              sortParam={false}
              onRowAction={false}
              empty={<EmptyState size="sm" icon="key" title={t('keys.empty')} body={t('keys.emptyBody')} />}
              actions={entries}
            />
          )}
        </AnatomySection>
      </div>

      <AnatomySection
        id="bot-link-addresses"
        title={t('addr.title')}
        description={t('addr.desc')}
        actions={{ secondary: [limitsAction], menu: addrMenu }}
        notices={addrNotices}
        state={{ kind: 'ready' }}
        flush
      >
        {addresses.length > 0 && (
          <DataTable
            bare
            fill={false}
            label={t('addr.title')}
            data={addresses}
            columns={doorColumns}
            getRowId={(d) => d.id}
            noViewMenu
            sortParam={false}
            onRowAction={false}
            actions={doorActions}
          />
        )}
      </AnatomySection>

      <DoorDrawer open={door?.open ?? false} door={door?.door ?? null} base={link.url} botName={bot.name} label={link.label} onClose={() => setDoor((d) => (d ? { ...d, open: false } : d))} />

      <ConfirmDialog
        overlayId="bots-link-panic"
        isOpen={confirm?.kind === 'panic'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('panic.confirmTitle')}
        body={t('panic.confirmBody', { name: bot.name })}
        confirmLabel={t('panic.confirm')}
        tone="danger"
        busy={p.panic.running}
        outcome={dialogOutcome(p.panic)}
        onCheck={() => p.panic.readBack()}
        onConfirm={() => { if (sameLink('panic')) void p.panic.run().then((r) => r.outcome === 'done' && setConfirm(null)); }}
      />
      <HeldDangerConfirm
        overlayId="bots-link-revoke-all"
        held={p.revokeAll.outcome === 'pending'}
        isOpen={confirm?.kind === 'revokeAll'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('keys.revokeAllTitle', { name: bot.name })}
        body={t('keys.revokeAllBody')}
        confirmText={bot.name}
        consequences={[t('keys.revokeAllUndo'), t('keys.revokeAllLinkStays')]}
        confirmLabel={t('keys.revokeAllGo')}
        busy={p.revokeAll.running}
        outcome={dialogOutcome(p.revokeAll)}
        onCheck={() => p.revokeAll.readBack()}
        onConfirm={() => { if (sameLink('revokeAll')) void p.revokeAll.run().then((r) => r.outcome === 'done' && setConfirm(null)); }}
      />
      <ConfirmDialog
        overlayId="bots-link-off"
        isOpen={confirm?.kind === 'off'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('link.offTitle')}
        body={t('link.offBody')}
        confirmLabel={t('link.turnOff')}
        busy={p.patch.running}
        outcome={dialogOutcome(p.patch)}
        onCheck={() => p.patch.readBack()}
        onConfirm={() => { if (sameLink('off')) void p.patch.run({ enabled: false }).then((r) => r.outcome === 'done' && setConfirm(null)); }}
      />
      <ConfirmDialog
        overlayId="bots-link-key-revoke"
        isOpen={confirm?.kind === 'revoke'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('key.revokeTitle')}
        body={t('key.revokeBody')}
        confirmLabel={t('key.revoke')}
        tone="danger"
        busy={p.keyChange.running}
        outcome={dialogOutcome(p.keyChange)}
        onCheck={() => p.keyChange.readBack()}
        onConfirm={() => {
          if (confirm?.kind === 'revoke') void p.keyChange.run({ keyId: confirm.key.id, action: 'revoke' }).then((r) => r.outcome === 'done' && setConfirm(null));
        }}
      />
      <ConfirmDialog
        overlayId="bots-link-key-rotate"
        isOpen={confirm?.kind === 'rotate'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('key.rotateTitle')}
        body={t('key.rotateBody')}
        confirmLabel={t('key.rotate')}
        busy={p.rotate.running}
        outcome={lockNote(dialogOutcome(p.rotate), t('keyForm.locked'))}
        onCheck={() => p.rotate.readBack()}
        onConfirm={() => {
          if (confirm?.kind === 'rotate') {
            const k = confirm.key;
            void p.rotate.run({ keyId: k.id }).then((r) => {
              if (r.outcome === 'done') {
                setConfirm(null);
                if (r.data) p.onRotated(r.data.secret, k.name);
              }
            });
          }
        }}
      />
    </div>
  );
}
