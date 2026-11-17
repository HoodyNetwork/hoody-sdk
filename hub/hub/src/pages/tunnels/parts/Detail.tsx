// One shared address in the inspector: a web address with its access line and links, or a place inside the computer,
// then the session it belongs to. The connection address is masked until Show, and is not shown at all in a
// shared-access session (masking is how the page shows it, not a lock: the kit serves it to anyone who can open the
// computer's programs).
// Layout: the session's facts first, then what the row shares; Board in the header, Computer visits, Make an alias and
// Disconnect in the header's menu (Disconnect last, after a rule); the notes about the session (as of an earlier read, a
// disconnect's outcome, a reconnecting address) above the body; "Not loading?" is a closed Why under the web address,
// ending with the page FAQ's answer.
import { AddressField, AnatomySection, Band, Button, DetailPage, FaqLink, Facts, Notice, Stack, StatusPill, TextButton, Why, useStrings, type ActionSpec, type Fact, type MenuEntry, type SectionActions } from '@kit';
import { useState } from 'react';
import type { SessionDisconnect } from '../disconnect';
import { pageFaq } from '../faq';
import { hostPort, maskIp, shortSession, type SessionGroup, type TunnelRow } from '../logic';
import strings from '../strings.en.json';
import s from './Tunnels.module.css';

export interface DetailLinks {
  board?: ((port: number) => void) | undefined;
  visits?: (() => void) | undefined;
  alias?: ((port: number) => void) | undefined;
  access?: (() => void) | undefined;
  keys?: (() => void) | undefined;
}

export interface DetailProps {
  row: TunnelRow;
  group?: SessionGroup;
  /** The row's address: the web address (EXPOSE) or host:port inside the computer (PULL); '' for none. */
  address: string;
  /** A reconnecting listener: when this tab first saw it. */
  seen: number | null;
  /** An account session (the connection address may show). */
  showPeer: boolean;
  links: DetailLinks;
  resetKey: string;
  clock: (ms: number) => string;
  /** The last refresh failed: these facts are as of an earlier read (shown here too: on a phone the list is hidden). */
  stale?: { text: string; error: unknown; time: string } | null;
  onRetry?: () => void;
  /** The row's session can be disconnected: its state, the press (opens the confirm), Check
   *  again, and Disconnect again (opens the warned confirm for the hold shown). */
  disconnect?: SessionDisconnect & { onDisconnect: () => void; onAgain: (hold: string) => void; onCheck: () => void };
}

export function Detail({ row, group, address, seen, showPeer, links, resetKey, clock, stale = null, onRetry, disconnect }: DetailProps) {
  const t = useStrings(strings);
  const { byId } = pageFaq(t);
  const [shown, setShown] = useState(false);
  const port = row.port;
  const title = port === null ? t(`kind.${row.kind}`) : `${t(`kind.${row.kind}`)} :${port}`;
  const peer = showPeer ? (group?.session.peer ?? null) : null;

  const facts: Fact[] = group
    ? [
        { label: t('fact.session'), value: shortSession(group.id), mono: true, copy: group.id },
        ...(peer
          ? [
              {
                label: t('fact.from'),
                value: (
                  <span className={s.peer}>
                    <bdi dir="ltr" className={s.mono}>
                      {shown ? peer : maskIp(peer)}
                    </bdi>
                    <TextButton onPress={() => setShown((v) => !v)} aria-label={t(shown ? 'from.hideLabel' : 'from.showLabel')}>
                      {t(shown ? 'from.hide' : 'from.show')}
                    </TextButton>
                  </span>
                ),
                copy: peer,
              },
            ]
          : []),
        { label: t('fact.streams'), value: group.maxStreams !== null ? t('streams.of', { count: group.session.streams, max: group.maxStreams }) : t('streams', { count: group.session.streams }) },
        ...(group.session.protocol ? [{ label: t('fact.protocol'), value: group.session.protocol, mono: true }] : []),
      ]
    : row.sessionId
      ? [{ label: t('fact.session'), value: shortSession(row.sessionId), mono: true, copy: row.sessionId }]
      : [];

  const d = disconnect;
  const dState = d?.state ?? 'idle';
  const check = d ? <TextButton onPress={d.onCheck} isDisabled={d.checking}>{t('disc.check')}</TextButton> : undefined;
  const hold = d?.again;
  const pendingActions =
    d && hold ? (
      <>
        {check}
        <TextButton onPress={() => d.onAgain(hold)}>{t('disc.again')}</TextButton>
      </>
    ) : (
      check
    );
  // What happened to the session's disconnect, at the top with the other notes (never in the button row).
  const discBand =
    !d || dState === 'idle' ? null : dState === 'sending' || dState === 'closing' ? (
      <Band tone="neutral" size="table">{t('disc.closing.line')}</Band>
    ) : dState === 'still' ? (
      <Band tone="warn" size="table" actions={check} /* noDetails: the kit accepted the disconnect; the session is just still listed */>
        {t('disc.still.line')}
      </Band>
    ) : dState === 'pending' ? (
      <Band tone="neutral" size="table" actions={pendingActions}>
        {t(hold ? 'disc.pending.listed' : 'disc.pending.line')}
      </Band>
    ) : dState === 'already' ? (
      <Band tone="neutral" size="table">{t('disc.already.line')}</Band>
    ) : d.notSent ? (
      <Band tone="warn" size="table" error={d.error}>
        {t('disc.notSent.line')}
      </Band>
    ) : (
      <Band tone="danger" size="table" error={d.error}>
        {t('disc.failed.line')}
      </Band>
    );

  const web = row.kind === 'expose' && port !== null;
  const menu: MenuEntry[] = [
    ...(web && links.visits ? [{ id: 'visits', label: t('action.visits'), icon: 'logs' as const, onAction: links.visits }] : []),
    ...(web && links.alias ? [{ id: 'alias', label: t('action.alias'), icon: 'link' as const, onAction: () => port !== null && links.alias?.(port) }] : []),
    ...(d?.canSend && web && (links.visits || links.alias) ? ['-' as const] : []),
    ...(d?.canSend ? [{ id: 'disconnect', label: t('disc.menu'), icon: 'x' as const, tone: 'danger' as const, opens: true, onAction: d.onDisconnect }] : []),
  ];
  // The web address's access links: the section head's secondaries (one or two).
  const accessActs: ActionSpec[] = [
    ...(links.access ? [{ id: 'access', label: t('access.settings'), onPress: links.access }] : []),
    ...(links.keys ? [{ id: 'keys', label: t('access.keys'), onPress: links.keys }] : []),
  ];
  const [a1, a2] = accessActs;
  const accessHead: SectionActions | undefined = a1 ? { secondary: a2 ? [a1, a2] : [a1] } : undefined;
  const notes =
    stale || discBand || (row.reconnecting && seen !== null) ? (
      <Stack gap={3}>
        {stale && (
          <Band tone="warn" size="table" error={stale.error} actions={onRetry ? <TextButton onPress={onRetry}>{t('st.retry')}</TextButton> : undefined}>
            {stale.text}
          </Band>
        )}
        {discBand}
        {row.reconnecting && seen !== null && (
          <Band tone="neutral" size="table" actions={<FaqLink item={byId.reconnecting}>{t('held.more')}</FaqLink>}>
            {t('held.line', { time: clock(seen) })}
          </Band>
        )}
      </Stack>
    ) : undefined;

  return (
    <DetailPage
      {...(menu.length ? { menu } : {})}
      {...(notes ? { notice: notes } : {})}
      header={{
        title,
        ...(row.kind === 'expose' && port !== null && links.board
          ? {
              actions: (
                <Button size="sm" icon="board" onPress={() => links.board?.(port)}>
                  {t('action.board')}
                </Button>
              ),
            }
          : {}),
        meta: stale ? (
          <StatusPill tone="neutral">{t('status.asOf', { time: stale.time })}</StatusPill>
        ) : dState === 'sending' || dState === 'closing' ? (
          <StatusPill tone="warn" dot>
            {t('disc.closing')}
          </StatusPill>
        ) : dState === 'still' ? (
          <StatusPill tone="warn">{t('disc.still')}</StatusPill>
        ) : dState === 'pending' ? (
          <StatusPill tone="neutral">{t('disc.pending')}</StatusPill>
        ) : dState === 'already' ? (
          <StatusPill tone="neutral">{t('disc.already')}</StatusPill>
        ) : dState === 'failed' ? (
          <StatusPill tone={d?.notSent ? 'warn' : 'danger'}>{t(d?.notSent ? 'disc.notSent' : 'disc.failed')}</StatusPill>
        ) : row.reconnecting ? (
          <StatusPill tone="warn" dot>
            {t('status.reconnecting')}
          </StatusPill>
        ) : (
          <StatusPill tone="ok" dot>
            {t('status.connected')}
          </StatusPill>
        ),
      }}
    >
      <Stack gap={5}>
        {facts.length > 0 && (
          <AnatomySection id="tunnel-session" title={t('detail.facts')} state={{ kind: 'ready' }}>
            <Facts columns={1} items={facts} label={t('detail.facts')} />
          </AnatomySection>
        )}
        {row.kind === 'expose' && port !== null && (
          <AnatomySection
            id="tunnel-web"
            title={t('kind.expose')}
            description={t('access.line')}
            state={{ kind: 'ready' }}
            {...(accessHead ? { actions: accessHead } : {})}
          >
            <Stack gap={3}>
              <AddressField url={address} label={t('web.label', { port })} resetKey={resetKey} />
              <Why question={t('note.title')} faq={{ item: byId.notLoading, label: t('note.more') }}>
                {t('note.why')}
              </Why>
            </Stack>
          </AnatomySection>
        )}
        {row.kind === 'pull' && port !== null && row.addr && (
          <AnatomySection id="tunnel-inside" title={t('kind.pull')} description={t('pull.line')} state={{ kind: 'ready' }}>
            <Facts columns={1} items={[{ label: t('fact.inside'), value: hostPort(row.addr, port), mono: true, copy: hostPort(row.addr, port) }]} />
          </AnatomySection>
        )}
        {row.kind === 'idle' && <Notice>{t('idle.line')}</Notice>}
      </Stack>
    </DetailPage>
  );
}
