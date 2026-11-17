// Memory administration: a "Manage memory" menu (tidy a project up, write pending memory
// now, erase a project's memory) and the notices of what was sent, plus the band's "use this computer as the memory host"
// recovery action. Tidy-up and erase are typed with the project's name; each mints its own one-time intent when pressed
// (admin.ts). What is said is only what the agent answered: a 200 to a tidy-up is "queued", never "finished"; a lost answer
// is "may have gone through" with Check again (reads only) and Stop waiting, never a resend.
import {
  ActionMenu, Button, ConfirmEffect, OutcomeBanner, TextButton, formatRelative, useStrings, type MenuEntry,
} from '@kit';
import { useState } from 'react';
import { type Admin as AdminState, type AdminChange, useConsolidation } from './admin';
import type { DataHost, ProjectRow } from './logic';
import strings from './Admin.strings.en.json';
import s from './Admin.module.css';

type T = ReturnType<typeof useStrings<typeof strings>>;

export interface AdminBarProps {
  admin: AdminState;
  /** The computer's name as the top bar shows it, and the realm's name for words. */
  computer: string;
  realm: string;
  /** The open project's row; null with none open or while the list loads (tidy-up and erase need it). */
  row: ProjectRow | null;
  /** A store resolved: only then can anything be managed. */
  ready: boolean;
}

/** The project's name for words: its folder's name, else its key. */
const nameOf = (row: ProjectRow | null, key: string) => (row && row.key === key ? row.name : key);

/** The refusal as the page words it: only for a definite refusal whose code it knows; the kit words the rest. */
function refusalBody(last: { outcome: string; code?: string } | undefined, t: T): string | undefined {
  if (!last || last.outcome !== 'failed' || !last.code) return undefined;
  const key = `act.refused.${last.code}` as keyof typeof strings;
  return key in strings ? t(key) : undefined;
}

function errorOf(last: { outcome: string; code?: string; status?: number; details?: unknown; traceId?: string; route?: string } | undefined) {
  if (!last || last.outcome === 'done' || last.outcome === 'pending') return undefined;
  return {
    outcome: last.outcome,
    ...(last.code ? { code: last.code } : {}),
    ...(last.status !== undefined ? { status: last.status } : {}),
    ...(last.traceId ? { traceId: last.traceId } : {}),
    ...(last.route ? { route: last.route } : {}),
  };
}

type NoticeChange<D> = Pick<AdminChange<never, D>, 'held' | 'check' | 'stopWaiting' | 'notice'>;

interface NoticeProps<D> {
  change: NoticeChange<D>;
  t: T;
  heldText: (name: string) => string;
  /** Said under the held text when a Check again cannot settle it. */
  heldExtra?: string;
  nameOfHeld: (identity: Record<string, unknown>) => string;
}

/** One action's notice: its hold (may have gone through), or nothing. A finished or refused press, and a
 *  wait that ended, say nothing here: the page's re-read lists are all that shows. */
function Notice<D>({ change, t, heldText, heldExtra, nameOfHeld }: NoticeProps<D>) {
  const [checking, setChecking] = useState(false);
  const [asked, setAsked] = useState(false);
  const { held, notice } = change;
  if (held) {
    const identity = (held.identity ?? {}) as Record<string, unknown>;
    const name = notice.names[String(identity.project ?? '')] ?? nameOfHeld(identity);
    const check = () => {
      setChecking(true);
      void change.check().finally(() => setChecking(false));
    };
    return (
      <>
        <OutcomeBanner
          kind="pending" /* noDetails: no answer came back, so there is no rejection to show */
          body={<>{heldText(name)}{heldExtra ? ` ${heldExtra}` : ''}</>}
          onCheck={check}
          checking={checking}
          onDismiss={() => setAsked(true)}
          dismissWarned
        />
        <StopWaiting asked={asked} setAsked={setAsked} t={t} onConfirm={() => { setAsked(false); void change.stopWaiting(); }} />
      </>
    );
  }
  return null;
}

function StopWaiting({ asked, setAsked, t, onConfirm }: { asked: boolean; setAsked: (v: boolean) => void; t: T; onConfirm: () => void }) {
  return (
    <ConfirmEffect
      isOpen={asked}
      onOpenChange={setAsked}
      title={t('stop.title')}
      effects={[t('stop.effect')]}
      confirmLabel={t('stop.confirm')}
      onConfirm={onConfirm}
    />
  );
}

/** "Manage memory", the notices of what was sent, and the tidy-up status the agent reports. */
export function AdminBar({ admin, computer, realm, row, ready }: AdminBarProps) {
  const t = useStrings(strings);
  const { project, tidy, erase, flush } = admin;
  const [asking, setAsking] = useState<'tidy' | 'erase' | null>(null);
  const name = nameOf(row, project);
  const open = project !== '' && row !== null;
  const waiting = tidy.state !== 'free' || erase.state !== 'free';
  // A hold shows its notice (Check again, Stop waiting) wherever the person is, so the reason below always has a way out.
  const reason = !open ? t('needProject') : waiting ? t('waiting') : undefined;
  const items: MenuEntry[] = [
    { id: 'tidy', label: t('tidy'), description: t('tidy.hint'), opens: true, isDisabled: !open || waiting, ...(reason ? { disabledReason: reason } : {}), onAction: () => setAsking('tidy') },
    { id: 'flush', label: t('flush'), description: t('flush.hint'), isDisabled: flush.busy, onAction: () => void flush.run() },
    '-',
    { id: 'erase', label: t('erase'), description: t('erase.hint'), tone: 'danger', opens: true, isDisabled: !open || waiting, ...(reason ? { disabledReason: reason } : {}), onAction: () => setAsking('erase') },
  ];
  const consolidation = useConsolidation(admin.at, project === '' ? undefined : project, ready && open);
  return (
    <div className={s.bar}>
      {ready && (
        <div className={s.row}>
          <ActionMenu
            label={t('manage')}
            items={items}
            placement="bottom start"
            trigger={<Button size="sm" iconEnd="chevron-down" busy={flush.busy}>{t('manage')}</Button>}
          />
          <TidyStatus c={consolidation.data ?? null} project={project} name={name} t={t} onRefresh={() => void consolidation.refetch()} />
        </div>
      )}
      <FlushNotice flush={flush} t={t} />
      <Notice<{ queued: true }>
        change={tidy}
        t={t}
        heldText={(n) => t('tidy.held', { name: n })}
        {...(consolidation.data === null ? { heldExtra: t('tidy.heldNoStatus') } : {})}
        nameOfHeld={(i) => nameOf(row, String(i.project ?? ''))}
      />
      <Notice<unknown>
        change={erase}
        t={t}
        heldText={(n) => t('erase.held', { name: n })}
        nameOfHeld={(i) => nameOf(row, String(i.project ?? ''))}
      />
      <HostNotice admin={admin} computer={computer} t={t} />
      <ConfirmEffect
        isOpen={asking === 'tidy'}
        onOpenChange={(o) => !o && setAsking(null)}
        title={t('tidy.title', { name })}
        effects={[t('tidy.effect1', { realm }), t('tidy.effect2'), t('tidy.effect3')]}
        confirmText={name}
        confirmLabel={t('tidy.confirm')}
        onConfirm={() => {
          setAsking(null);
          tidy.notice.setAbout(name, project);
          void tidy.run({ ...admin.at, project });
        }}
      />
      <ConfirmEffect
        isOpen={asking === 'erase'}
        onOpenChange={(o) => !o && setAsking(null)}
        title={t('erase.title', { name })}
        effects={[t('erase.effect1', { realm }), t('erase.effect2'), t('erase.effect3')]}
        confirmText={name}
        confirmLabel={t('erase.confirm')}
        tone="danger"
        onConfirm={() => {
          setAsking(null);
          erase.notice.setAbout(name, project);
          void erase.run({ ...admin.at, project });
        }}
      />
    </div>
  );
}

/** What the agent reports about the tidy-up, as it reports it (the status block may be missing on an older agent). */
function TidyStatus({ c, project, name, t, onRefresh }: { c: ReturnType<typeof useConsolidation>['data'] | null; project: string; name: string; t: T; onRefresh: () => void }) {
  if (!c || c === 'unreadable') return null;
  if (c.state === 'idle') {
    if (c.lastDoneMs === null || c.lastResult === null) return null;
    const when = formatRelative(c.lastDoneMs);
    return <span className={s.status}>{c.lastResult === 'failed' ? t('tidy.status.failed', { when }) : t('tidy.status.done', { when })}</span>;
  }
  return (
    <span className={s.status}>
      {c.project === project ? t(c.state === 'queued' ? 'tidy.status.queued' : 'tidy.status.running', { name }) : t('tidy.status.other', { state: c.state })}
      {' '}
      <TextButton onPress={onRefresh}>{t('tidy.refresh')}</TextButton>
    </span>
  );
}

function FlushNotice({ flush, t }: { flush: AdminState['flush']; t: T }) {
  const o = flush.outcome;
  const key = `${o}:${flush.code ?? ''}:${flush.status ?? ''}`;
  if (flush.busy || o === null || key === flush.closed) return null;
  if (o === 'done') return <OutcomeBanner kind="done" title={t('flush.done')} onDismiss={() => flush.close(key)} />;
  if (o === 'pending') return <OutcomeBanner kind="pending" /* noDetails: no answer came back, so there is no rejection to show */ body={t('flush.pending')} onDismiss={() => flush.close(key)} />;
  const last = { outcome: o, ...(flush.code ? { code: flush.code } : {}), ...(flush.status !== undefined ? { status: flush.status } : {}), ...(flush.traceId ? { traceId: flush.traceId } : {}), ...(flush.route ? { route: flush.route } : {}) };
  const body = refusalBody(last, t);
  return <OutcomeBanner kind={o} error={errorOf(last)} body={body} onDismiss={() => flush.close(key)} />;
}

function HostNotice({ admin, computer, t }: { admin: AdminState; computer: string; t: T }) {
  return (
    <Notice<{ assigned: true }>
      change={admin.host}
      t={t}
      heldText={() => t('host.held', { computer })}
      nameOfHeld={() => computer}
    />
  );
}

export interface UseSelfProps {
  admin: AdminState;
  host: DataHost | null;
  computer: string;
  realm: string;
}

/** The states in which no host serves the realm's memory: the agent offers "Use this computer" only in these
 *  (can_use_self: electing, unavailable or stuck, never under a permission refusal). */
const NOT_SERVING: ReadonlySet<string> = new Set(['electing', 'unavailable', 'stuck']);

/** The band's recovery action: shown when the agent says this computer can serve the realm's memory (can_use_self), which
 *  it says only while no host serves it: a peer outage (unavailable) and a slow election as well as a stuck one. A
 *  can_use_self beside a serving state contradicts itself and offers nothing. It is not a move of data, and the confirm
 *  says so. */
export function UseSelfAction({ admin, host, computer, realm }: UseSelfProps) {
  const t = useStrings(strings);
  const [asking, setAsking] = useState(false);
  if (!host || !host.canUseSelf || !NOT_SERVING.has(host.state)) return null;
  const wait = admin.host.state !== 'free';
  return (
    <>
      <Button size="sm" variant="primary" isDisabled={wait} onPress={() => setAsking(true)}>{t('host.action')}</Button>
      {wait && <span className={s.status}>{t('waiting')}</span>}
      <ConfirmEffect
        isOpen={asking}
        onOpenChange={setAsking}
        title={t('host.title', { computer, realm })}
        effects={[t('host.effect1', { realm }), t('host.effect2')]}
        note={t('host.note')}
        confirmLabel={t('host.confirm', { computer })}
        onConfirm={() => {
          setAsking(false);
          void admin.host.run({ ...admin.at });
        }}
      />
    </>
  );
}
