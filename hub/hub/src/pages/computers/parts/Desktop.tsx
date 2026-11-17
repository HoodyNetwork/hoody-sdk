// Desktop tab: the computer's desktop inside the Hub (desktop.ts says what a desktop is). The frame's address is only
// the one the Hub builds itself (urls.ts desktopUrl, the same core portAddress as Connect's rows), never a server
// field, with no token. Beside it: the desktop switcher (only when the computer lists more than desktop 1), the
// environment picker, Reload desktop, Stop desktop, Open in a new tab (the same address) and Put on Board (the display
// the desktop opens). What it shows is only what the Hub can know: a stopped computer shows no frame; until the frame's
// load event a skeleton covers it (a cross-origin frame cannot be read, so "loaded" means only that something loaded);
// with no load event in 20 s it says so and offers the new tab. A frame holding focus keeps the keys (Hub shortcuts and
// Esc included), so a Leave desktop button sits right after it.
//
// Stop desktop (and switching the environment of a running desktop, which is a stop and a new start): asked first, the
// frame is taken away, then display 1600 + N is stopped and desktop N's session ended (only the shell the session list
// shows now). Both steps are needed: the desktop's address starts a desktop only with its session, so a session left
// behind would make the next open wait for a display nobody starts. A display already gone counts as stopped; busy
// and refused stop nothing; a lost answer stays unknown (C9), and nothing is sent again until the person presses Stop
// again, which the banner says is safe (a stopped display answers that it is not running). The environment a desktop
// runs is never guessed: the picker says "Not reported" until the Hub opened the desktop with a choice.
import { reachOf, useChangesVersion, type Outcome } from '@core';
import { ActionMenu, Band, Button, ConfirmDialog, EmptyState, LinkButton, OutcomeBanner, Row, Select, Stack, Spinner, UnreachableState, useStrings } from '@kit';
import { useEffect, useRef, useState } from 'react';
import { BoardAddButton } from '../../board/links';
import { heldDesktopSend, readDesktopShell, sendingDesktopSend, subjectOf, useDesktopEnd, useDesktopEnvs, useDesktops, useDisplayStop } from '../data';
import { DESKTOP_ENVS_FALLBACK, desktopDisplay, desktopFrameAllow, stopUndecided, type DesktopEnv } from '../desktop';
import { bucket } from '../logic';
import { noStartReason } from './menu';
import strings from '../strings.en.json';
import type { Computer } from '../types';
import { desktopUrl, desktopViewerUrl } from '../urls';
import { DesktopFrame } from './DesktopFrame';
import s from './parts.module.css';
import { computerKey, forgetComputer, nextFrame, patchSlot, readSelected, readSlot, rememberedDesktops, setSelected, slotEpoch, tick, useSlotsVersion } from './desktopSlots';
import { asUnknown } from './runner';

/** What the tab shows for one desktop. `live` frames it (`gen` remounts the frame; `env` is the environment the Hub
 *  opened it with, undefined when not by a choice made here); every other phase shows no frame. */
type Phase =
  | { k: 'live'; gen: number; env?: string }
  | { k: 'stopping' }
  | { k: 'off' }
  | { k: 'busy' }
  | { k: 'failed'; error: unknown }
  | { k: 'unknown' }
  // `over`: the session end core held when this reset was recorded (absent when none was held); a later hold, here or in
  // another tab, is another end and is claimed over it. `held`: claimed from such a hold, not recorded by a Stop here:
  // which session it ended is not known, so no session is kept for it and no read decides "opened again" over it, held
  // or not any more (its outcome stays unknown until a Stop here).
  | { k: 'reset'; known: boolean; error?: unknown; held?: true; over?: string }
  | { k: 'replaced' }
  // `over`: the session end core held when the read that found the other session was sent (that read is newer than
  // it); absent when none was held.
  | { k: 'reopened'; over?: string }
  | { k: 'listed' };
type Asking = { kind: 'stop' } | { kind: 'switch'; env: DesktopEnv } | null;
// `hold`: core's hold for this very send when its answer was lost (MutationResult.hold), its token and outcome nonce.
type Sent = { outcome: Outcome; code?: string; status?: number; hold?: string };

// A send that threw (no result) may have left: read as unknown, like a lost answer.
const lost = (): Sent => ({ outcome: 'pending' });
// A refusal proves a fact only with the program's own code: a 404 or 409 from anything in between proves nothing.
const refused = (r: Sent, status: number, code: string): boolean => r.outcome === 'failed' && r.status === status && r.code === code;

export function Desktop({ c, canStart, onStart }: { c: Computer; canStart: boolean; onStart: () => void }) {
  const t = useStrings(strings);
  const running = bucket(c.status) === 'running';
  const desktopsQ = useDesktops(c, running);
  const listed = desktopsQ.data;
  const envsQ = useDesktopEnvs(c, running);
  const [asking, setAsking] = useState<Asking>(null);
  useSlotsVersion();
  useChangesVersion();
  const displayStop = useDisplayStop();
  const desktopEnd = useDesktopEnd();
  const ck = computerKey(c);
  const n = readSelected(ck) ?? 1;
  const setN = (d: number) => setSelected(ck, d);
  // The desktop shown, and every desktop this tab remembers a state for, stay in the switcher even when the list no
  // longer has them (a stopped desktop's session ended): Start is reached through it.
  const desktops = [...new Set([...(listed ?? [1]), n, ...rememberedDesktops(ck)])].sort((a, b) => a - b);
  const slot = readSlot<Phase>(ck, n);
  // What the tab shows. A Stop of this desktop still out (any tab), or held with its answer lost, reads "may not have
  // stopped yet" over anything remembered (this tab's own Stop shows its spinner), and a session end held reads
  // not-reset unless the remembered reset is that same hold's or the read that found another session was sent while it
  // was held ("opened again" over it; a hold recorded later, here or in another tab, is another end and reads not-reset
  // over either, claimed with its own token); what core showed is kept
  // (the first effect below), so once it answers elsewhere the desktop is never framed here again without a press:
  // Check again reads its session then. Otherwise as remembered; with nothing remembered (a first visit, a reload, a
  // computer seen restarting) the desktop is framed.
  const stopOut = sendingDesktopSend('computer.desktopStop', c.id, n) || sendingDesktopSend('computer.desktopEnd', c.id, n);
  const heldStop = !!heldDesktopSend('computer.desktopStop', c.id, n);
  const heldEnd = heldDesktopSend('computer.desktopEnd', c.id, n);
  const endSeen = (slot.phase?.k === 'reset' || slot.phase?.k === 'reopened') && slot.phase.over === heldEnd;
  const claim: Phase | null =
    slot.phase?.k === 'stopping' ? null : stopOut || heldStop ? { k: 'unknown' } : heldEnd && !endSeen ? { k: 'reset', known: false, held: true, over: heldEnd } : null;
  const phase: Phase = claim ?? slot.phase ?? { k: 'live', gen: 0 };
  const setPhase = (d: number, p: Phase, inc?: string | null, epoch?: string) => patchSlot<Phase>(ck, d, { phase: p, gen: tick(), ...(inc !== undefined ? { inc } : {}) }, epoch);
  // A not-reset claim always differs from what is remembered (its hold is not the remembered one's).
  const keep = claim && (claim.k === 'reset' || slot.phase?.k !== claim.k) ? claim : null;
  const listedInc = desktopsQ.incs[n];
  useEffect(() => {
    if (keep) patchSlot<Phase>(ck, n, { phase: keep, gen: tick(), inc: keep.k === 'reset' ? null : (listedInc ?? null) });
    // Runs only while something is still to be kept: its own write makes `keep` null on the next render.
  }, [ck, n, keep, listedInc]);
  // A computer seen not running (stopped, restarting): every claim about its desktops ends (useComputers does the same
  // for the Computers list while this tab is closed).
  useEffect(() => {
    if (!running) forgetComputer(ck);
  }, [running, ck]);
  // A stopped (or not reset, or unknown) desktop that the list shows: a read sent now, after the claim was made,
  // decides; only a session it shows (another one than the claim's, or for a stopped desktop any) reads "opened
  // again". The list alone never decides (an answer can land after a Stop although it left before), and a read still out
  // when the tab goes (or the claim changes) is dropped: what it answers is decided again by the next read.
  const cRef = useRef(c);
  cRef.current = c;
  const claimK = slot.phase?.k;
  const listedNow = !!desktopsQ.sessions?.includes(n);
  const heldReset = slot.phase?.k === 'reset' && !!slot.phase.held;
  const hint = !claim && listedNow && !heldReset && (claimK === 'off' || claimK === 'reset' || claimK === 'unknown');
  useEffect(() => {
    if (!hint) return;
    const seen = readSlot<Phase>(ck, n);
    const ep = slotEpoch(ck);
    const start = tick();
    const over = heldDesktopSend('computer.desktopEnd', cRef.current.id, n);
    let live = true;
    void readDesktopShell(subjectOf(cRef.current), n).then((sh) => {
      if (!live || readSlot<Phase>(ck, n).gen !== seen.gen || (seen.gen ?? 0) > start || sh === 'unread' || !sh.listed) return;
      const other = seen.phase?.k === 'off' ? sh.incarnation === null || sh.incarnation !== seen.inc : sh.incarnation !== null && sh.incarnation !== seen.inc;
      if (other) patchSlot<Phase>(ck, n, { phase: { k: 'reopened', ...(over ? { over } : {}) }, gen: tick(), inc: sh.incarnation }, ep);
    });
    return () => {
      live = false;
    };
  }, [hint, ck, n, slot.gen, listedInc]);
  const envs = envsQ.data ?? DESKTOP_ENVS_FALLBACK;
  // A program without the listing answers 404 (today's): the fallback list, silently. Any other failure says so.
  // The desktops list failed with nothing read: said, never only desktop 1 with nothing said. No answer at
  // all is the shared not-reachable line (and the environments' band, the same cause, steps aside).
  const desktopsFailed = desktopsQ.isError && !listed;
  const desktopsUnreachable = desktopsFailed && reachOf(desktopsQ.error) === 'unreachable';
  const listDown = !desktopsUnreachable && envsQ.isError && (envsQ.error as { status?: number } | null)?.status !== 404;
  const env = phase.k === 'live' ? phase.env : slot.chosen;
  const url = desktopUrl(c, n, phase.k === 'live' ? phase.env : undefined);

  // Stop desktop N, then open it with `reopen` (a switch) or leave it stopped (undefined). `again`: the person pressed
  // Stop again on a banner that said the last answer was lost, so the sends core still holds for this desktop are
  // released first (exactly those holds), and only then.
  const stopDesktop = async (d: number, reopen?: string, again = false) => {
    const v = { ...subjectOf(c), n: d };
    // Written only while this computer's memory has not ended since the press (an account change, a restart seen).
    const ep = slotEpoch(ck);
    const was = desktopsQ.incs[d] ?? null;
    const set = (p: Phase, inc: string | null = was) => setPhase(d, p, inc, ep);
    set({ k: 'stopping' });
    if (again) {
      const hs = heldDesktopSend('computer.desktopStop', c.id, d);
      const he = heldDesktopSend('computer.desktopEnd', c.id, d);
      if (hs) await displayStop.dismiss(v, hs).catch(() => false);
      if (he) await desktopEnd.dismiss({ ...v, incarnation: '' }, he).catch(() => false);
    }
    const r1 = asUnknown((await displayStop.mutateAsync(v).catch(lost)) as Sent);
    const undecided = (r: Sent) => stopUndecided(r, again);
    if (!(r1.outcome === 'done' || refused(r1, 404, 'DISPLAY_NOT_FOUND'))) {
      // After a lost answer even a busy display does not prove the first Stop missed: only gone (404) settles it.
      set(undecided(r1) ? { k: 'unknown' } : refused(r1, 409, 'DISPLAY_BUSY') ? { k: 'busy' } : { k: 'failed', error: r1 });
      return;
    }
    // The display is gone; its session is ended only as the list shows it now, and only that shell. A list that does
    // not answer or does not read, or a session whose shell it cannot name, leaves the reset undone (said so).
    const shell = await readDesktopShell(subjectOf(c), d);
    if (shell === 'unread' || (shell.listed && !shell.incarnation)) {
      set({ k: 'reset', known: true });
      return;
    }
    if (shell.listed && shell.incarnation) {
      const sent = (await desktopEnd.mutateAsync({ ...v, incarnation: shell.incarnation }).catch(lost)) as Sent;
      const r2 = asUnknown(sent);
      if (!(r2.outcome === 'done' || refused(r2, 404, 'SESSION_NOT_FOUND'))) {
        // The reset names only the hold this send left (core's answer for it); never whatever core holds now, which
        // can be another tab's later send of the same change. With none named, any held end claims not-reset.
        const over = undecided(r2) && sent.outcome === 'pending' && typeof sent.hold === 'string' && sent.hold !== '' ? sent.hold : undefined;
        set(refused(r2, 409, 'INCARNATION_MISMATCH') ? { k: 'replaced' } : undecided(r2) ? { k: 'reset', known: false, ...(over ? { over } : {}) } : { k: 'reset', known: true, error: r2 }, shell.incarnation);
        return;
      }
    }
    if (reopen !== undefined) {
      set({ k: 'live', gen: nextFrame(), env: reopen });
      return;
    }
    // No toast: the stopped desktop has its own place on screen (an ok toast only where a result has none).
    set({ k: 'off' }, shell.listed ? shell.incarnation : null);
  };

  // "May not have stopped yet" with no Stop out or held: a read sent now (after every Stop answered) says stopped (no
  // session listed) or still open (Show / Stop desktop, which asks); an unread list changes nothing.
  const checkAgain = async () => {
    const ep = slotEpoch(ck);
    const seen = readSlot<Phase>(ck, n).gen;
    const out = () => sendingDesktopSend('computer.desktopStop', c.id, n) || sendingDesktopSend('computer.desktopEnd', c.id, n) || !!heldDesktopSend('computer.desktopStop', c.id, n);
    if (out()) return;
    const sh = await readDesktopShell(subjectOf(c), n);
    if (sh === 'unread' || out() || readSlot<Phase>(ck, n).gen !== seen) return;
    setPhase(n, sh.listed ? { k: 'listed' } : { k: 'off' }, sh.listed ? sh.incarnation : null, ep);
  };

  const show = (d: number, e?: string) => setPhase(d, { k: 'live', gen: nextFrame(), ...(e !== undefined ? { env: e } : {}) });

  const pickEnv = (id: string) => {
    const e = envs.find((x) => x.id === id);
    if (!e || e.installed === false) return;
    if (phase.k === 'live') {
      if (phase.env !== id) setAsking({ kind: 'switch', env: e });
      return;
    }
    patchSlot<Phase>(ck, n, { chosen: id });
  };

  if (!running) {
    return (
      <OutcomeBanner
        // noDetails: no request failed; the computer's own state says it is stopped
        kind="stale"
        title={t('desktop.stopped', { name: c.name })}
        body={
          canStart ? (
            <Button size="sm" variant="primary" icon="play" onPress={onStart}>
              {t('menu.start')}
            </Button>
          ) : (
            noStartReason(c, t)
          )
        }
      />
    );
  }
  if (!desktopUrl(c, n)) return <EmptyState icon="info" title={t('desktop.noAddress')} body={t('desktop.noAddress.body')} />;

  const busy = phase.k === 'stopping';
  const envOptions = envs.map((e) => ({
    value: e.id,
    label: e.label,
    ...(e.installed === false ? { isDisabled: true, description: t('desktop.env.notInstalled') } : {}),
  }));
  const stopAgain = (
    <Button size="sm" variant="secondary" icon="stop" onPress={() => void stopDesktop(n, undefined, true)}>
      {t('desktop.stopAgain')}
    </Button>
  );

  return (
    <Stack gap={3}>
      <Row wrap>
        {desktops.length > 1 ? (
          <Select<string>
            aria-label={t('desktop.pick')}
            value={String(n)}
            isDisabled={busy}
            onChange={(v) => setN(Number(v))}
            options={desktops.map((d) => ({ value: String(d), label: t('desktop.n', { n: d }) }))}
          />
        ) : null}
        <Select<string>
          aria-label={t('desktop.env')}
          value={env}
          placeholder={t('desktop.env.unknown')}
          isDisabled={busy}
          onChange={pickEnv}
          options={envOptions}
        />
        {phase.k === 'live' ? (
          <>
            <Button size="sm" variant="secondary" icon="reload" onPress={() => show(n, phase.env)}>
              {t('desktop.reload')}
            </Button>
            <LinkButton size="sm" href={url} iconEnd="external">
              {t('desktop.open')}
            </LinkButton>
          </>
        ) : null}
        <BoardAddButton computer={subjectOf(c)} program="display" session={desktopDisplay(n)} what={t('desktop.n', { n })} labelled />
        {/* Stop ends the desktop's apps: in the ⋯ menu, last in the bar, never beside Reload. It
            still asks first; the banners' own Stop (a desktop that may still be open) stay where they are. */}
        {phase.k === 'live' ? (
          <ActionMenu
            size="sm"
            label={t('desktop.more', { n })}
            items={[{ id: 'stop', label: t('desktop.stop'), icon: 'stop', tone: 'danger', opens: true, onAction: () => setAsking({ kind: 'stop' }) }]}
          />
        ) : null}
      </Row>
      {desktopsUnreachable ? (
        <UnreachableState size="compact" computer={c.name} onRetry={() => void desktopsQ.refetch()} retrying={desktopsQ.isFetching} error={desktopsQ.error} />
      ) : desktopsFailed ? (
        <Band tone="warn" size="table" error={desktopsQ.error} actions={<Button size="sm" variant="ghost" busy={desktopsQ.isFetching} onPress={() => void desktopsQ.refetch()}>{t('desktop.tryAgain')}</Button>}>{t('desktop.listDown')}</Band>
      ) : null}
      {listDown ? <Band tone="neutral" size="table">{t('desktop.env.listDown')}</Band> : null}
      {phase.k === 'live' ? (
        // Keyed on the address and the reload count: another desktop, environment or a reload is a new frame with its
        // own loading and slow states.
        <DesktopFrame key={`${url}#${phase.gen}`} url={url} allow={desktopFrameAllow([url, desktopViewerUrl(c, n)])} title={t('desktop.frame', { name: c.name, n })} />
      ) : phase.k === 'stopping' ? (
        <Row wrap>
          <Spinner />
          <span role="status" /* reason: the words are the status of the desktop being stopped; the spinner is only its mark */>{t('desktop.stopping', { n })}</span>
        </Row>
      ) : phase.k === 'off' ? (
        <EmptyState
          size="sm"
          icon="stop"
          title={t('desktop.off', { n })}
          body={t('desktop.off.body')}
          action={
            <Button size="sm" variant="primary" icon="play" onPress={() => show(n, slot.chosen)}>
              {t('desktop.start')}
            </Button>
          }
        />
      ) : phase.k === 'busy' ? (
        <OutcomeBanner
          // noDetails: the program said why (a screenshot in progress); nothing was stopped
          kind="failed"
          title={t('desktop.busy', { n })}
          body={
            <span className={s.row}>
              {t('desktop.busy.body')}
              <Button size="sm" variant="secondary" onPress={() => void stopDesktop(n)}>
                {t('desktop.tryAgain')}
              </Button>
              <Button size="sm" variant="ghost" onPress={() => show(n)}>
                {t('desktop.show')}
              </Button>
            </span>
          }
        />
      ) : phase.k === 'failed' ? (
        <OutcomeBanner
          kind="failed"
          title={t('desktop.failed', { n })}
          error={phase.error}
          body={
            <span className={s.row}>
              {t('desktop.failed.body')}
              <Button size="sm" variant="secondary" onPress={() => void stopDesktop(n)}>
                {t('desktop.tryAgain')}
              </Button>
              <Button size="sm" variant="ghost" onPress={() => show(n)}>
                {t('desktop.show')}
              </Button>
            </span>
          }
        />
      ) : phase.k === 'unknown' ? (
        <OutcomeBanner
          // noDetails: the answer was lost or is still out, so nothing came back to show
          kind="pending"
          title={t('desktop.unknown', { n })}
          body={
            <span className={s.row}>
              {t(stopOut ? 'desktop.unknown.onWay' : heldStop ? 'desktop.unknown.body' : 'desktop.unknown.check')}
              {stopOut || heldStop ? null : (
                <Button size="sm" variant="secondary" icon="reload" onPress={() => void checkAgain()}>
                  {t('desktop.checkAgain')}
                </Button>
              )}
              {stopAgain}
            </span>
          }
        />
      ) : phase.k === 'reset' ? (
        <OutcomeBanner
          kind={phase.known ? 'failed' : 'pending'}
          title={t(phase.known ? 'desktop.reset' : 'desktop.reset.unknown', { n })}
          error={phase.error}
          body={
            <span className={s.row}>
              {t('desktop.reset.body')}
              {stopAgain}
            </span>
          }
        />
      ) : (
        <OutcomeBanner
          // noDetails: no request failed; the program said its shell changed (INCARNATION_MISMATCH), or a later session
          // list shows the desktop again: it may be running with apps open, so stopping it asks first, as Stop desktop does
          kind="stale"
          title={t(phase.k === 'reopened' ? 'desktop.reopened' : phase.k === 'listed' ? 'desktop.listed' : 'desktop.replaced', { n })}
          body={
            <span className={s.row}>
              {t(phase.k === 'reopened' ? 'desktop.reopened.body' : phase.k === 'listed' ? 'desktop.listed.body' : 'desktop.replaced.body')}
              <Button size="sm" variant="secondary" onPress={() => show(n)}>
                {t('desktop.show')}
              </Button>
              <Button size="sm" variant="ghost" icon="stop" onPress={() => setAsking({ kind: 'stop' })}>
                {t('desktop.stop')}
              </Button>
            </span>
          }
        />
      )}
      <ConfirmDialog overlayId="computers-desktop-confirm-dialog"
        isOpen={asking !== null}
        onOpenChange={(o) => !o && setAsking(null)}
        tone="danger"
        title={asking?.kind === 'switch' ? t('desktop.switch.title', { n, env: asking.env.label }) : t('desktop.stop.title', { n })}
        body={asking?.kind === 'switch' ? t('desktop.switch.body', { env: asking.env.label }) : t('desktop.stop.body')}
        confirmLabel={asking?.kind === 'switch' ? t('desktop.switch.go') : t('desktop.stop')}
        onConfirm={() => {
          const a = asking;
          setAsking(null);
          if (a) void stopDesktop(n, a.kind === 'switch' ? a.env.id : undefined);
        }}
      />
    </Stack>
  );
}
