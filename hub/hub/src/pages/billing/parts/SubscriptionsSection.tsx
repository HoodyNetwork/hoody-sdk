// Subscriptions: one row per paid server: plan, server, state, dates, price, auto-renew, and the one action the
// row needs (Pay now / Start it again / Upgrade). Turning auto-renew off asks first; turning it on is one change.
// A change that may have gone through is said in a band with a read-back, never as a plain failure.
// Where this Hub sends no money route (the live terminal, moneyHandoff), auto-renew cannot be changed here: each row
// shows its setting as a word, no switch and no menu item, and the section hands the change to the web Hub.
import {
  Button,
  CellLines,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FaqLink,
  RowNote,
  StatusPill,
  Switch,
  createColumnHelper,
  useDataView,
  useGo,
  type RowActionEntry,
  type Tone,
} from '@kit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAutoRenew, usePlans, useSubs } from '../data';
import { anyBusy, cents, subRows, type SubRow } from '../logic';
import { links } from '../links';
import { pageFaq } from '../faq';
import { Band, Flag, Section, type T, say } from './Bits';
import { HoldDismiss } from './HoldDismiss';
import { MoneyHandoff, moneyInWebHub } from './moneyHandoff';
import { renewReasonKey } from './renewReason';
import { moneyActionInline } from './rowMoney';
import s from './parts.module.css';

const col = createColumnHelper<SubRow>();

/** How a row is named in a sentence about it: the plan and the server ("Small n12"). The plan alone names several rows
 *  of an account with two servers on one plan. */
const rowName = (r: SubRow): string => (r.title ? `${r.title} ${r.host}` : r.host);

const TONE: Record<SubRow['tone'], Tone> = {
  ok: 'ok',
  warn: 'warn',
  danger: 'danger',
  info: 'info',
  neutral: 'neutral',
  accent: 'accent',
  busy: 'info',
  muted: 'neutral',
};

interface RenewNote {
  id: string;
  title: string;
  kind: 'unknown' | 'failed';
}

export function SubscriptionsSection({ t, banned }: { t: T; banned: boolean }) {
  const subs = useSubs();
  const plans = usePlans();
  const go = useGo();
  const renew = useAutoRenew();
  const [edits, setEdits] = useState<Record<string, boolean>>({});
  const [confirmOff, setConfirmOff] = useState<SubRow | null>(null);
  const [offOutcome, setOffOutcome] = useState<'pending' | 'failed' | null>(null);
  const [note, setNote] = useState<RenewNote | null>(null);
  // One recovery per unresolved row: a later result never replaces it and only a successful read-back ends it.
  const [unknowns, setUnknowns] = useState<Readonly<Record<string, string>>>({});
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  // Core's own lock for the change: it outlives this section (leaving and returning), so it locks every row too. It frees only when a read shows the sent value.
  const corePending = renew.pending;
  const handedOff = moneyInWebHub();

  const rows = useMemo(
    () => (subs.data ? subRows(subs.data.subs, plans.data).map((r) => (r.id in edits ? { ...r, renewOn: edits[r.id] as boolean } : r)) : undefined),
    [subs.data, plans.data, edits],
  );

  // A change in flight (setting up, stopping, resuming, upgrading) is read again every 15 s, about ten minutes in all.
  // The count is per change: once nothing is in flight it starts again, so a later change in the same visit is polled too.
  const busy = rows ? anyBusy(rows) : false;
  const [beats, setBeats] = useState(0);
  useEffect(() => {
    if (!busy) setBeats(0);
  }, [busy]);
  useEffect(() => {
    if (!busy || beats >= 40) return;
    const id = setTimeout(() => {
      setBeats((n) => n + 1);
      void subs.refetch();
    }, 15_000);
    return () => clearTimeout(id);
  }, [busy, beats, subs]);

  const mark = (id: string, on: boolean) => setPending((p) => (on ? new Set(p).add(id) : new Set([...p].filter((x) => x !== id))));

  const setRenew = async (row: SubRow, on: boolean): Promise<'done' | 'pending' | 'failed'> => {
    mark(row.id, true);
    const r = await renew.run({ id: row.id, auto_renew: on });
    if (r.outcome !== 'pending') mark(row.id, false);
    if (r.outcome === 'done') {
      // Shown at once, but the server's own answer wins: the override ends when the fresh read arrives.
      setEdits((e) => ({ ...e, [row.id]: on }));
      setNote(null);
      void subs.refetch().finally(() =>
        setEdits((e) => {
          const { [row.id]: _gone, ...rest } = e;
          return rest;
        }),
      );
      return 'done';
    }
    // Core refused to send while an earlier change is unread. This row sent nothing, but the earlier change may have
    // gone through and holds the setting, so it reads as unknown (its own band and lock stay), never as a failure.
    if (r.code === 'READ_BACK_FIRST') {
      mark(row.id, false);
      return 'pending';
    }
    if (r.outcome === 'pending') {
      // May have gone through: the row stays locked until a read-back settles it.
      setUnknowns((u) => ({ ...u, [row.id]: rowName(row) }));
      return 'pending';
    }
    setNote({ id: row.id, title: rowName(row), kind: 'failed' });
    return 'failed';
  };
  // The lock ends only when a fresh read shows the value that was sent: a failed read, or a row still showing the old value, proves nothing.
  const checkAgain = async (id: string): Promise<boolean> => {
    // One read-back frees each pending change of this setting whose sent value the fresh read shows; any other
    // stays held. The row clears only when its own change was freed.
    const ok = await renew.readBack();
    if (!ok) return false;
    void subs.refetch();
    setUnknowns((u) => {
      const { [id]: _gone, ...rest } = u;
      return rest;
    });
    mark(id, false);
    return true;
  };
  // The columns are memoised; the ref keeps their handlers on the latest closure.
  const setRenewRef = useRef(setRenew);
  setRenewRef.current = setRenew;

  const columns = useMemo(
    () => [
      col.accessor('title', {
        id: 'plan',
        header: t('col.plan'),
        meta: { pinned: true, width: '14%', minWidth: 130, label: t('col.plan') },
        cell: (c) => <span className={s.planNameCell}>{c.getValue() || t('buy.kicker')}</span>,
      }),
      col.accessor('host', {
        id: 'server',
        header: t('col.server'),
        meta: { width: '16%', minWidth: 140, label: t('col.server'), priority: 1, listWraps: true }, // a flag and a host name whole; in a list row the place keeps its own line
        cell: (c) => (
          // Under the name, where the server is (the subscription's own region); nothing when it names none.
          <CellLines>
            <span className={s.serverCell}>
              <Flag code={c.row.original.country} />
              <bdi className={s.mono}>{c.getValue()}</bdi>
            </span>
            {c.row.original.place && <RowNote>{c.row.original.place}</RowNote>}
          </CellLines>
        ),
      }),
      col.accessor((r) => say(t, r.chip), {
        id: 'state',
        header: t('col.state'),
        meta: {
          width: '14%',
          minWidth: 148, // the longest state pill (Resume failed) and the cell's padding
          label: t('col.state'),
          priority: 1,
          list: 'status',
        },
        cell: (c) => (
          <StatusPill tone={TONE[c.row.original.tone]} dot className={c.row.original.busy ? s.pulseDot : undefined}>
            <span title={say(t, c.row.original.words)}>{c.getValue()}</span>
          </StatusPill>
        ),
      }),
      col.accessor((r) => (r.dates ? say(t, r.dates) : ''), {
        id: 'dates',
        header: t('col.dates'),
        // A sentence ("Runs until Nov 19, 2026, then stops"): room for it in two lines, or the column drops by priority.
        meta: { width: '18%', minWidth: 170, label: t('col.dates'), priority: 2 }, // 170: the state, server and chip action floors still fit at 1100
        cell: (c) => <span className={s.datesCell}>{c.getValue() || '—'}</span>,
      }),
      col.accessor((r) => r.priceCents ?? -1, {
        id: 'price',
        header: t('col.price'),
        meta: {
          width: '10%',
          minWidth: 100, // a monthly price whole
          align: 'end',
          label: t('col.price'),
          // 1: kept over Dates; where both do not fit (1100), Dates drops first and the price stays (a money column).
          priority: 1,
        },
        cell: (c) =>
          c.row.original.priceCents === null ? (
            '—'
          ) : (
            <span className={s.money}>
              {t('buy.perMonthShort', {
                price: cents(c.row.original.priceCents),
              })}
            </span>
          ),
      }),
      col.accessor((r) => (r.renewable ? (r.renewOn ? 'on' : 'off') : ''), {
        id: 'renew',
        header: t('col.renew'),
        meta: { width: '12%', minWidth: 104, label: t('col.renew'), priority: 1, list: false }, // the switch and its On/Off word
        cell: (c) => {
          const r = c.row.original;
          if (!r.renewable) return <span className={s.faint}>—</span>;
          if (handedOff) return r.renewOn ? t('on') : t('off');
          return (
            <Switch
              label={r.renewOn ? t('on') : t('off')}
              aria-label={t('subs.autoRenewFor', { name: rowName(r) })}
              isSelected={r.renewOn}
              isDisabled={banned || pending.has(r.id) || corePending}
              // A suspension is said here; a held or unknown change is said by its own band above the table.
              {...(banned ? { disabledReason: t('mkt.suspended') } : {})}
              onChange={(on) => {
                if (!on) {
                  setOffOutcome(null);
                  setConfirmOff(r);
                } else void setRenewRef.current(r, true);
              }}
            />
          );
        },
      }),
      // Where the money action is the row's inline action (rowMoney), this column is not drawn: it would say it twice.
      ...(moneyActionInline() ? [] : [col.display({
        id: 'action',
        header: () => <span className={s.srOnly}>{t('col.action')}</span>,
        meta: {
          width: '10%',
          minWidth: 154, // Pay now / Upgrade / Try again (the widest, 127 px) as a small chip button and the cell's padding
          label: t('col.action'),
          priority: 1,
          list: false,
        },
        cell: (c) => {
          const r = c.row.original;
          // A held server's retry shows Try again (the words every other retry uses), its name saying the rest: Start it again does not fit the action column
          // as a chip button, and the name starts with the visible word.
          const label = r.pay === 'retry' ? t('subs.retry') : t('subs.payNow');
          return (
            <span className={s.rowActions}>
              {r.pay && (
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={banned}
                  disabledReason={t('mkt.suspended')}
                  onPress={() => go(links.checkout('pay', { sub: r.id, view: 'wallet' }))}
                  aria-label={
                    r.pay === 'retry'
                      ? t('subs.retryNamed', { title: r.title, host: r.host })
                      : t('subs.payNamed', {
                          action: label,
                          title: r.title,
                          host: r.host,
                        })
                  }
                >
                  {label}
                </Button>
              )}
              {!r.pay && r.upgrade === 'ok' && (
                <Button
                  size="sm"
                  isDisabled={banned}
                  disabledReason={t('mkt.suspended')}
                  onPress={() => go(links.checkout('upgrade', { sub: r.id, view: 'wallet' }))}
                  aria-label={t('up.buttonNamed', { server: r.host })}
                >
                  {t('up.button')}
                </Button>
              )}
              {r.upgrade === 'busy' && <StatusPill tone="info">{t('up.running')}</StatusPill>}
            </span>
          );
        },
      })]),
    ],
    [t, banned, pending, go, corePending, handedOff],
  );

  // The standard data view: search, the state filter, sort and the URL keys come from the kit, not from this page.
  const view = useDataView<SubRow>({
    rows,
    columns,
    getRowId: (r) => r.id,
    search: ['plan', 'server'],
    filters: [{ id: 'state', label: t('col.state'), value: (r) => say(t, r.chip) }],
    sort: 'plan',
    isLoading: subs.isPending,
    error: subs.isError ? subs.error : undefined,
  });

  const menu = (r: SubRow): RowActionEntry[] => {
    const items: RowActionEntry[] = [];
    // The row's inline action, where the money action is drawn inline (rowMoney): the first of pay, upgrade and the
    // word for a change under way, as the Actions column orders them. Elsewhere pay and upgrade are ⋯ menu items.
    const inline = moneyActionInline();
    if (r.pay)
      items.push({
        id: 'pay',
        label: r.pay === 'retry' ? t('subs.resumeRetry') : t('subs.payNow'),
        // Inline, a held server's retry shows Try again (the Actions column's words); its name says the rest and holds that word.
        ...(inline ? { inline: true, ...(r.pay === 'retry' ? { label: t('subs.retryNamed', { title: r.title, host: r.host }), short: t('subs.retry') } : {}) } : {}),
        icon: 'wallet',
        isDisabled: banned,
        disabledReason: banned ? t('mkt.suspended') : undefined,
        onAction: () => go(links.checkout('pay', { sub: r.id, view: 'wallet' })),
      });
    if (r.upgrade === 'ok')
      items.push({
        id: 'upgrade',
        label: t('up.button'),
        ...(inline ? { inline: true } : {}),
        icon: 'arrow-up',
        isDisabled: banned,
        disabledReason: banned ? t('mkt.suspended') : undefined,
        onAction: () => go(links.checkout('upgrade', { sub: r.id, view: 'wallet' })),
      });
    // A change under way has no press: its word stands where the action would, off, with what to do as its reason.
    if (inline && r.upgrade === 'busy')
      items.push({ id: 'changing', label: t('up.running'), inline: true, isDisabled: true, disabledReason: t('up.finishing', { server: r.host }), onAction: () => undefined });
    if (r.renewable && !handedOff) {
      const isDisabled = banned || pending.has(r.id) || renew.pending;
      items.push({
        id: 'renew',
        label: r.renewOn ? t('subs.offConfirm') : t('subs.renewOn'),
        icon: 'reload',
        isDisabled,
        disabledReason: isDisabled
          ? t(renewReasonKey({ banned, unknown: r.id in unknowns, sending: renew.running, held: renew.pending, locked: pending.has(r.id) }))
          : undefined,
        onAction: () => {
          if (!r.renewOn) void setRenewRef.current(r, true);
          else {
            setOffOutcome(null);
            setConfirmOff(r);
          }
        },
      });
    }
    return items;
  };

  return (
    <Section
      id="subscriptions"
      title={t('subs.heading')}
      description={
        <>
          {t('subs.lede')} <FaqLink item={pageFaq(t).byId.autoRenew}>{t('subs.renewMore')}</FaqLink>
        </>
      }
    >
      {handedOff && rows?.some((r) => r.renewable) ? <MoneyHandoff /> : null}
      {corePending && Object.keys(unknowns).length === 0 && (
        // Core still holds an unread change (the page was left and reopened): the row is unknown, so recover it.
        <Band
          tone="warn"
          dataAttr="renew-unknown"
          actions={
            <>
              <Button size="sm" icon="reload" onPress={() => void renew.readBack().then((ok) => ok && void subs.refetch())}>
                {t('buy.checkAgain')}
              </Button>
              <HoldDismiss t={t} find={() => renew.holds()} onDismiss={(h) => void renew.dismissHeld(h).finally(() => void subs.refetch())} />
            </>
          }
        >
          {t('renewUnknown')}
        </Band>
      )}
      {Object.entries(unknowns).map(([id, title]) => (
        <Band
          key={id}
          tone="warn"
          dataAttr="renew-unknown"
          actions={
            <>
              <Button size="sm" icon="reload" onPress={() => void checkAgain(id)}>
                {t('buy.checkAgain')}
              </Button>
              <HoldDismiss
                t={t}
                find={() => renew.holds(id)}
                onDismiss={(h) =>
                  void renew.dismissHeld(h).then((freed) => {
                    // No hold left (freed elsewhere): nothing is held for this row, so it is read again and cleared. A hold that moved on
                    // (sent again) frees nothing: the row stays unknown and is read again.
                    if (!freed && h.length > 0) return void subs.refetch();
                    setUnknowns((u) => {
                      const { [id]: _gone, ...rest } = u;
                      return rest;
                    });
                    mark(id, false);
                    if (!freed) void subs.refetch();
                  })
                }
              />
            </>
          }
        >
          <strong>{title}</strong> {t('renewUnknown')}
        </Band>
      ))}
      {note && (
        <Band
          tone="danger"
          dataAttr="renew-failed"
          actions={
            <Button size="sm" variant="ghost" onPress={() => setNote(null)}>
              {t('dismiss')}
            </Button>
          }
        >
          <strong>{note.title}</strong> {t('subs.toggleErr')}
        </Band>
      )}
      {subs.data?.partial && (
        <Band
          tone="warn"
          dataAttr="partial"
          actions={
            <Button size="sm" onPress={() => void subs.refetch()}>
              {t('action.tryAgain')}
            </Button>
          }
        >
          {t('subs.partial', { shown: subs.data.partial.shown, total: subs.data.partial.total })}
        </Band>
      )}
      <DataTable<SubRow>
        onRefresh={() => void subs.refetch()}
        label={t('subs.heading')}
        view={view}
        columns={columns}
        getRowId={(r) => r.id}
        onRetry={() => void subs.refetch()}
        actions={menu}
        noViewMenu
        fill={false}
        empty={
          <EmptyState
            size="sm"
            icon="server"
            title={t('noSubs.title')}
            body={t('noSubs.body')}
            action={
              <Button variant="secondary" onPress={() => go(links.plans)}>
                {t('seePlans')}
              </Button>
            }
          />
        }
        countLabel={(n) => t('subs.count', { count: n })}
      />
      <ConfirmDialog
        overlayId="billing-subscription-off"
        isOpen={confirmOff !== null}
        onOpenChange={(o) => {
          if (o) return;
          setConfirmOff(null);
          setOffOutcome(null);
        }}
        title={t('subs.offTitle')}
        body={
          confirmOff && (
            <>
              <p>
                {confirmOff.dates && confirmOff.dates.v?.date
                  ? t('subs.offBody', {
                      plan: rowName(confirmOff),
                      date: String(confirmOff.dates.v.date),
                    })
                  : t('subs.offBodyNoDate', {
                      plan: rowName(confirmOff),
                    })}
              </p>
              {confirmOff.holdDays !== null && <p className={s.muted}>{t('subs.offHold', { days: confirmOff.holdDays })}</p>}
            </>
          )
        }
        confirmLabel={renew.running ? t('subs.offWorking') : t('subs.offConfirm')}
        busy={renew.running}
        // A send whose answer is unknown (or refused) keeps the dialog: it locks on pending and reads back from here.
        outcome={offOutcome ? { kind: offOutcome } : undefined}
        onCheck={
          confirmOff
            ? async () => {
                const ok = await checkAgain(confirmOff.id);
                if (ok) {
                  setConfirmOff(null);
                  setOffOutcome(null);
                }
                return ok;
              }
            : undefined
        }
        onConfirm={() => {
          const row = confirmOff;
          if (!row) return;
          void setRenew(row, false).then((r) => {
            if (r === 'done') setConfirmOff(null);
            else setOffOutcome(r);
          });
        }}
      />
    </Section>
  );
}
