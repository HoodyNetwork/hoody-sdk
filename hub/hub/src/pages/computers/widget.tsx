// Home widget "Your computer": the selected computer at a glance, with its five programs one click away.
import { computerLifecycle, reachOf, useChangesVersion } from '@core';
import { Band, Button, EmptyState, ErrorState, errorSentence, Link, OutcomeBanner, PageLinkTo, Row, Skeleton, StatusPill, TextButton, UnreachableState, useErrorInfo, useStrings, type OutcomeKind } from '@kit';
import { useMemo, useState } from 'react';
import { subjectOf, useBotsHere, useComputers, useCurrentComputerId, usePrograms } from './data';
import { PROGRAM_ATTENTION, bucket, sizeParts, sizeText, uptimeParts } from './logic';
import strings from './strings.en.json';
import { ServerLabel, StatePill } from './parts/Bits';
import { Held } from './parts/Held';
import { ProgramStrip } from './parts/ProgramStrip';
import { dismissShownLifecycle, lifecycleElsewhere, lifecycleHeldOf } from './parts/ops';
import { asUnknown, useShownRealm } from './parts/runner';
import { links } from './links';
import { links as botsLinks } from '../bots/links';
import { links as programsLinks } from '../programs/links';
import s from './parts/parts.module.css';

export default function YourComputer() {
  const t = useStrings(strings);
  const computers = useComputers();
  const currentId = useCurrentComputerId();
  const c = computers.data?.find((x) => x.id === currentId);
  const programs = usePrograms(c, true);
  // The mapped reason and next step for an answered programs failure (what ErrorState said), shown in the foot's Band.
  const programsInfo = useErrorInfo(programs.error);
  // Home mounts this widget: its presses are Home's (core's sender per page), so Computers shows them read-only
  // with a link here, and the widget shows the Computers page's (or Board's, Bots') read-only with a link there.
  const lifecycle = computerLifecycle.use({ page: 'home' });
  const bots = useBotsHere();
  // The hold shown is the one Dismiss frees (lifecycleHeldOf, its token), the same one Computers shows.
  const realm = useShownRealm();
  const version = useChangesVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- version is core's change signal
  const heldChange = useMemo(() => (currentId ? lifecycleHeldOf(currentId, realm) : null), [currentId, realm, version]);
  const held = heldChange ? ((heldChange.identity ?? {}) as Record<string, unknown>) : null;
  // The last Start press and its outcome, bound to the computer it was pressed on: after a realm or computer
  // switch the next computer shows neither its busy Start nor its banner, and its late answer lands only there.
  const [sentAt, setSentAt] = useState<{ id: string; busy: boolean; outcome?: OutcomeKind } | null>(null);
  const sent = sentAt && sentAt.id === currentId ? sentAt : { busy: false, outcome: undefined };
  const settle = (id: string, next: { busy: boolean; outcome?: OutcomeKind } | null) =>
    setSentAt((cur) => (cur?.id === id ? (next ? { id, ...next } : null) : cur));

  if (computers.isPending) return <Skeleton rows={4} />;
  // An unreadable list with nothing read before is an error, never "no computer yet". A list read earlier stays shown
  // while a later read fails.
  if (computers.isError && computers.data === undefined) return <ErrorState size="compact" title={t('widget.listUnread')} error={computers.error} onRetry={() => void computers.refetch()} />;
  if (!c) {
    // Nothing current: with computers, pick one on Computers; with none, get one there.
    const none = (computers.data ?? []).length === 0;
    return (
      <EmptyState
        size="sm"
        icon="computer"
        title={t(none ? 'widget.noneYet' : 'widget.none')}
        action={<PageLinkTo page="computers" href={none ? links.create : links.list} variant="inline">{t(none ? 'action.get' : 'widget.pick')}</PageLinkTo>}
      />
    );
  }

  const b = bucket(c.status);
  const running = b === 'running';
  const size = sizeParts(c);
  const list = programs.data ?? [];
  const up = list.filter((p) => p.state === 'running').length;
  const attention = list.filter((p) => PROGRAM_ATTENTION.has(p.state)).length;
  const longest = Math.max(0, ...list.map((p) => p.uptimeSeconds ?? 0));
  const u = uptimeParts(longest);
  const upText = u.d ? t('prog.up.dh', { d: u.d, h: u.h }) : u.h ? t('prog.up.hm', { h: u.h, m: u.m }) : u.m ? t('prog.up.m', { m: u.m }) : '';
  const start = b === 'paused' ? 'resume' : 'start';

  return (
    <div className={s.widget}>
      <Row wrap gap={2}>
        <strong>{c.name}</strong>
        <StatePill status={c.status} />
        <ServerLabel computer={c} place={false} />
        {size.cores !== null || size.ramGb !== null ? <span className={s.faint}>{sizeText(size, t)}</span> : null}
        {running && upText ? <span className={s.faint}>{t('widget.up', { for: upText })}</span> : null}
        {b === 'stopped' || b === 'paused' ? (
          <Button
            size="sm"
            variant="primary"
            icon="play"
            busy={sent.busy}
            onPress={() => {
              if (sent.busy || sent.outcome === 'pending' || held) return;
              const id = c.id;
              setSentAt({ id, busy: true });
              void lifecycle
                .run({ id, op: start })
                .then((r) => asUnknown({ outcome: r.outcome as OutcomeKind, code: r.error?.code ?? undefined }).outcome)
                .catch(() => 'pending' as OutcomeKind)
                .then((outcome) => settle(id, outcome === 'done' ? null : { busy: false, outcome }));
            }}
          >
            {t(`menu.${start}`)}
          </Button>
        ) : null}
      </Row>
      {held ? (
        <Held
          kind="lifecycle"
          name={c.name}
          dismissOnly={held.op === 'restart'}
          elsewhere={heldChange ? lifecycleElsewhere(heldChange, 'home') : undefined}
          onCheck={async () => { await lifecycle.readBack().catch(() => false); }}
          onDismiss={async () => {
            if (await dismissShownLifecycle(c.id, heldChange?.hold, 'home')) settle(c.id, null);
          }}
        />
      ) : sent.outcome ? <OutcomeBanner kind={sent.outcome} onCheck={() => { const id = c.id; void lifecycle.readBack().then((ok) => ok && settle(id, null)); }} /> : null}
      {/* The five programs as one launch strip: joined cells over one darker actions band. */}
      <ProgramStrip computer={c} running={running} />
      <div className={s.widgetFoot}>
        {running && programs.data ? (
          <PageLinkTo page="programs" href={programsLinks.list} variant="inline">
            <span className={s.footLink}>
              {t('widget.programs', { count: up })}
              {attention ? <StatusPill tone="warn">{t('widget.attention', { count: attention })}</StatusPill> : null}
            </span>
          </PageLinkTo>
        ) : !running ? (
          // Still starting (or being made): nothing to start, so it says it is on its way, never "Start …".
          <span className={s.faint}>{b === 'starting' ? t('state.starting.note') : t('widget.stopped', { name: c.name })}</span>
        ) : !subjectOf(c).server ? (
          // Running, but with no known server its programs are never read (usePrograms): say why, never "Start".
          <span className={s.faint}>{t('prog.noServer.body')}</span>
        ) : programs.error ? (
          // The programs read failed with nothing read: said, never a missing link.
          reachOf(programs.error) === 'unreachable' ? (
            <UnreachableState size="compact" computer={c.name} onRetry={() => void programs.refetch()} retrying={programs.isFetching} error={programs.error} />
          ) : (
            // A notice in the foot (never a second data state in this card), with its facts and Try again.
            <Band tone="warn" size="table" error={programs.error} actions={<TextButton onPress={() => void programs.refetch()} isDisabled={programs.isFetching}>{t('widget.tryAgain')}</TextButton>}>
              {t('widget.programsUnread')}{programsInfo ? ` ${errorSentence(programsInfo)}` : null}
            </Band>
          )
        ) : null}
        {bots !== undefined ? <PageLinkTo page="bots" href={botsLinks.list} variant="inline">{t('widget.bots', { count: bots })}</PageLinkTo> : null}
        <Link href={links.list}>{t('widget.all')}</Link>
      </div>
    </div>
  );
}
