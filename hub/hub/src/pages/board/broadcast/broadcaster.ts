// The broadcast controller (no React): capture → sender → the pipe's status → the viewer link, and Stop & revoke.
//
// Contract, in plain words:
//   - start(computer, {audio, area}) must run inside the click that asked for it: getDisplayMedia is called before
//     anything awaits. The capture is narrowed to the tile area (capture.ts confine); a window ('other') or a tab
//     the crop refuses ('wide': another tab, or a tile area that cannot be cropped) is refused as 'not-this-tab'
//     before anything is sent, since it could show any screen. The status stream opens, then
//     the sender starts; once the pipe shows the stream live (within ACCEPT_MS, else it stops as 'no-answer'), the
//     link is made once: one alias create for this broadcast's name.
//   - The link never outlives the stream: every end of the stream (stop, the browser's Stop sharing, a lost
//     connection, a refusal, no answer) removes the link once the sender ended and no create is in flight.
//   - Every Start draws its own sender key (name.ts newSenderKey), held only by go()'s closure and sent with its one
//     live upload: the pipe then holds the name for this sender, so a pinned alias (which passes any method) cannot be
//     used to POST another stream to the viewers. The key is never in the state, storage, a log or a URL. A refusal of
//     the name (403/409) ends as 'taken', a full pipe (429) as 'busy'; nothing is sent again, with or without a key:
//     a new Start is a new name and a new key.
//   - The link is made with a short expiry (link.ts LINK_TTL_MS) and extended every RENEW_EVERY_MS while the sender
//     runs, so a tab that closes without stopping leaves a link that dies within minutes. One extension at a time,
//     each its own C9 change (a new expiry, never a resend). An unknown one is read back before the next, and before
//     the remove (it holds the alias's lock); until it is proved, the shown expiry is the last proved one.
//   - Every Start is a new pipe name and a new link. Start is refused ('busy') while an earlier link may still exist:
//     its create or remove is in flight, unknown (read it back first) or refused (try the remove again).
//   - stop() ends the stream (the board leaves viewers' screens at once); revoke() is the same stop, also usable
//     while the picker is open. The phase stays 'stopping' (the Live chip stays) until the sender has really ended.
//     waitEnded() resolves then.
//   - Link create and remove go through the page's C9 changes (createLink/removeLink: core's outcome). done → the
//     link is ready / gone. pending (or an earlier send still unread) → 'unknown': shown as unknown, never as
//     failed or gone, never resent; checkLink()/checkRemoval() read back. failed / not_sent → 'failed' (a definite
//     refusal: nothing was made / removed). A create that answered without a usable link url is 'unknown' too.
//   - viewers is null whenever the status stream is not open (never 0 for unknown); the stream reopens after a
//     close while the sender runs (at once when the page is visible again after the 60 s hidden cut).
//   - dispose() (the Board unmounting) stops everything this controller started, without waiting, and removes the
//     link once (a create in flight: when it answers).
import type { Target } from '@core';
import { captureOptions, confine, type Confined } from './capture';
import { pickMime } from './capability';
import { newPipeName, newSenderKey, newTransferId } from './name';
import { startSender, type RecorderCtor, type Sender, type SenderEnd, type UploadResult } from './sender';
import { initialStatus, onProgressEvent, viewersUnknown, type LiveStatus } from './status';
import { RENEW_EVERY_MS, renewBody, type BroadcastAlias } from './link';
import { docVisibility } from './broadcaster.web';

export const ACCEPT_MS = 10_000;
export const REOPEN_MS = 2_000;

export type Phase = 'idle' | 'picking' | 'connecting' | 'live' | 'stopping' | 'ended';
/** taken: the pipe refused the name as held by another sender (403/409); busy: the pipe holds too many names (429). */
export type EndReason = SenderEnd['kind'] | 'no-answer' | 'taken' | 'busy';
export type StartError = 'denied' | 'no-source' | 'no-webm' | 'busy' | 'not-this-tab' | 'failed';
export type LinkState = 'none' | 'making' | 'ready' | 'unknown' | 'not-found' | 'failed' | 'removing' | 'removal-unknown' | 'removal-failed' | 'removed';

export interface BroadcastComputer { readonly id: string; readonly name: string; readonly project_id: string; readonly server_name: string }

export interface BroadcastState {
  readonly phase: Phase;
  readonly computer: BroadcastComputer | null;
  readonly name: string | null;
  readonly link: { readonly id: string; readonly url: string } | null;
  readonly linkState: LinkState;
  /** The last proved expiry of the link (ISO), and how its latest extension went. */
  readonly linkUntil: string | null;
  readonly renew: 'ok' | 'failed' | 'unknown';
  readonly status: LiveStatus;
  readonly confined: Confined | null;
  readonly end: { readonly reason: EndReason; readonly line: string } | null;
  readonly startError: StartError | null;
}

export interface Outcome<T> { readonly outcome: 'done' | 'pending' | 'failed' | 'not_sent' | 'stale'; readonly data?: T; readonly code?: string }

export interface ProgressHandle { close(): void }
export interface ProgressCallbacks { onEvent(name: string, data: string): void; onClosed(reason: string): void; onOpen(): void }

export interface BroadcastDeps {
  getDisplayMedia(o: DisplayMediaStreamOptions): Promise<MediaStream>;
  readonly MediaRecorder: RecorderCtor & { isTypeSupported(t: string): boolean };
  upload(target: Target, name: string, transfer: string, key: string, body: ReadableStream<Uint8Array>, mime: string, signal: AbortSignal): Promise<UploadResult>;
  openProgress(target: Target, name: string, cb: ProgressCallbacks): ProgressHandle;
  createLink(v: { computer: string; name: string; until: string }): Promise<Outcome<BroadcastAlias | null>>;
  removeLink(v: { computer: string; alias: string }): Promise<Outcome<unknown>>;
  renewLink(v: { computer: string; alias: string; until: string }): Promise<Outcome<unknown>>;
  /** Re-reads the create's / remove's declared reads; true only when the read proved it. */
  checkCreate(): Promise<boolean>;
  checkRemove(): Promise<boolean>;
  checkRenew(): Promise<boolean>;
  /** The usable broadcast alias for this name in a fresh list (link.ts usable), null when the list answered without
   *  one; rejects when the list could not be read. */
  findLink(computer: string, name: string): Promise<BroadcastAlias | null>;
  /** The core context at Start, and whether it is still the current one (same account, realm and generation). Link
   *  changes are sent only while it is: after a realm or account switch a send would reach the wrong realm. */
  readonly capture?: () => unknown;
  readonly alive?: (ctx: unknown) => boolean;
  readonly now?: () => number;
  readonly setTimeout?: (fn: () => void, ms: number) => unknown;
  readonly clearTimeout?: (t: unknown) => void;
  /** visibilitychange source (document by default). */
  readonly visibility?: { hidden(): boolean; on(fn: () => void): () => void };
}

export const IDLE_STATE: BroadcastState = Object.freeze({
  phase: 'idle', computer: null, name: null, link: null, linkState: 'none', linkUntil: null, renew: 'ok', status: initialStatus, confined: null, end: null, startError: null,
});

/** A refusal of the name (another sender holds it) or of a full pipe gets its own end; their pipe line is not shown. */
const endKind = (e: SenderEnd): EndReason =>
  e.kind !== 'refused' ? e.kind : e.status === 403 || e.status === 409 ? 'taken' : e.status === 429 ? 'busy' : 'refused';

export const targetOf = (c: BroadcastComputer): Target => ({ project: { id: c.project_id }, container: { id: c.id, ...(c.server_name ? { server_name: c.server_name } : {}) } });

/** Link states in which an earlier link may still exist: Start waits (never a second link beside it). */
const LINGERING: ReadonlySet<LinkState> = new Set(['making', 'ready', 'unknown', 'removing', 'removal-unknown', 'removal-failed']);

/** The broadcast still owns its computer (a stream runs, or its link may exist): the panel and the alias list stay on
 *  it; otherwise they follow the picked computer. */
export const holdsComputer = (s: BroadcastState): boolean =>
  s.phase === 'picking' || s.phase === 'connecting' || s.phase === 'live' || s.phase === 'stopping' || LINGERING.has(s.linkState);

const isUnknown = (o: Outcome<unknown>) => o.outcome === 'pending' || o.outcome === 'stale' || (o.outcome === 'not_sent' && (o.code === 'READ_BACK_FIRST' || o.code === 'HELD_BY_OTHER' || o.code === 'BUSY'));

export class Broadcaster {
  private s: BroadcastState = IDLE_STATE;
  private listeners = new Set<() => void>();
  private sender: Sender | null = null;
  private progress: ProgressHandle | null = null;
  private stream: MediaStream | null = null;
  private transfer = '';
  private acceptTimer: unknown = null;
  private reopenTimer: unknown = null;
  private endWaiters: Array<() => void> = [];
  private disposed = false;
  private unVis: (() => void) | null = null;
  private run = 0;
  private revokeWanted = false;
  private renewTimer: unknown = null;
  private renewing: Promise<void> | null = null;
  /** s.renew, also kept after dispose (set() stops then): the cleanup remove reads it. */
  private renewSt: 'ok' | 'failed' | 'unknown' = 'ok';
  private ctx: unknown = null;

  constructor(private readonly d: BroadcastDeps) {}

  get state(): BroadcastState { return this.s; }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  private set(p: Partial<BroadcastState>) {
    if (this.disposed) return;
    this.s = { ...this.s, ...p };
    for (const fn of [...this.listeners]) { try { fn(); } catch { /* the listener's */ } }
  }
  private now() { return (this.d.now ?? Date.now)(); }
  private sameCtx() { return !this.d.alive || this.d.alive(this.ctx); }
  private setRenew(renew: 'ok' | 'failed' | 'unknown', p: Partial<BroadcastState> = {}) { this.renewSt = renew; this.set({ ...p, renew }); }
  private later(fn: () => void, ms: number) { return (this.d.setTimeout ?? ((f: () => void, m: number) => setTimeout(f, m)))(fn, ms); }
  private cancel(t: unknown) { if (t !== null) (this.d.clearTimeout ?? ((x: unknown) => clearTimeout(x as ReturnType<typeof setTimeout>)))(t); }

  /** True while a stream runs or is ending (the Live chip and the leave guard follow this). */
  get running(): boolean { return this.s.phase === 'picking' || this.s.phase === 'connecting' || this.s.phase === 'live' || this.s.phase === 'stopping'; }

  start(computer: BroadcastComputer, o: { audio: boolean; area: Element | null }): Promise<void> {
    if (this.disposed || this.running) return Promise.resolve();
    if (LINGERING.has(this.s.linkState)) { this.set({ startError: 'busy' }); return Promise.resolve(); }
    // getDisplayMedia first, straight from the click (the browser needs the user's gesture).
    let picked: Promise<MediaStream>;
    try { picked = this.d.getDisplayMedia(captureOptions(o.audio)); } catch (e) { picked = Promise.reject(e); }
    const run = ++this.run;
    this.revokeWanted = false;
    this.ctx = this.d.capture?.() ?? null;
    this.renewSt = 'ok';
    const before = { phase: this.s.phase === 'ended' ? 'ended' as Phase : 'idle' as Phase, end: this.s.end };
    const name = newPipeName();
    this.set({ phase: 'picking', computer, name, startError: null, end: null, status: initialStatus, confined: null, link: null, linkState: 'none', linkUntil: null, renew: 'ok' });
    const back = (startError: StartError) => this.set({ ...before, name: null, startError });
    return picked.then(async (stream) => {
      if (run !== this.run || this.disposed) { stopAll(stream); return; }
      const video = stream.getVideoTracks()[0];
      if (!video) { stopAll(stream); back('no-source'); return; }
      const mime = pickMime(this.d.MediaRecorder, stream.getAudioTracks().length > 0);
      if (!mime) { stopAll(stream); back('no-webm'); return; }
      // Owned before narrowing awaits: a stop or dispose meanwhile stops these tracks at once.
      this.stream = stream;
      const confined = await confine(video, o.area);
      if (run !== this.run || this.disposed) { stopAll(stream); if (this.stream === stream) this.stream = null; return; }
      // A window, or a tab the tile crop refuses (another tab), could show any screen: refused before a frame is sent.
      if (confined === 'other' || confined === 'wide') { stopAll(stream); if (this.stream === stream) this.stream = null; back('not-this-tab'); return; }
      this.set({ phase: 'connecting', confined });
      this.go(computer, name, mime, stream, run);
    }, (err: unknown) => {
      if (run !== this.run) return;
      const n = (err as { name?: string } | null)?.name;
      back(n === 'NotAllowedError' ? 'denied' : n === 'NotFoundError' ? 'no-source' : 'failed');
    });
  }

  private go(computer: BroadcastComputer, name: string, mime: string, stream: MediaStream, run: number) {
    const target = targetOf(computer);
    this.transfer = newTransferId();
    this.pendingEnd = null;
    const transfer = this.transfer;
    // This Start's sender key: held only by this closure, sent with its one live upload.
    const key = newSenderKey();
    this.openStatus(target, name, transfer, run);
    let endedNow = false;
    const sender = startSender(stream, mime, {
      MediaRecorder: this.d.MediaRecorder,
      upload: (body, m, signal) => this.d.upload(target, name, transfer, key, body, m, signal),
      ...(this.d.setTimeout ? { setTimeout: this.d.setTimeout } : {}),
      ...(this.d.clearTimeout ? { clearTimeout: this.d.clearTimeout } : {}),
    }, (e) => { endedNow = true; const k = endKind(e); this.ended(run, k, e.kind === 'server' || (e.kind === 'refused' && k === 'refused') ? e.line : ''); });
    // A sender that ended inside startSender (no recorder) was already reported: never install it.
    if (endedNow) return;
    this.sender = sender;
    this.acceptTimer = this.later(() => {
      this.acceptTimer = null;
      if (run === this.run && !this.s.status.live && this.sender && this.s.phase === 'connecting') {
        this.pendingEnd = 'no-answer';
        this.set({ phase: 'stopping' });
        this.sender.stop();
      }
    }, ACCEPT_MS);
  }
  private pendingEnd: EndReason | null = null;

  private openStatus(target: Target, name: string, transfer: string, run: number) {
    this.progress?.close();
    this.progress = this.d.openProgress(target, name, {
      onOpen: () => {},
      onEvent: (ev, data) => {
        if (run !== this.run) return;
        const was = this.s.status;
        const next = onProgressEvent(was, ev, data, transfer, this.now());
        if (next === was) return;
        const accept = next.live && !was.live && this.s.phase === 'connecting';
        this.set({ status: next, ...(accept ? { phase: 'live' as Phase } : {}) });
        // The pipe says the stream is over: the link is no longer extended (its end removes it).
        if (next.done) { this.cancel(this.renewTimer); this.renewTimer = null; }
        // Once stopping began (Stop, or no answer in time), a late live event makes no link.
        if (accept) { this.cancel(this.acceptTimer); this.acceptTimer = null; void this.makeLink(run); }
      },
      onClosed: (reason) => {
        if (run !== this.run) return;
        this.progress = null;
        this.set({ status: viewersUnknown(this.s.status) });
        if (reason === 'aborted' || !this.sender) return;
        this.reopenLater(target, name, transfer, run);
      },
    });
  }

  private reopenLater(target: Target, name: string, transfer: string, run: number) {
    this.cancel(this.reopenTimer);
    const vis = this.d.visibility ?? docVisibility();
    const go = () => { this.unVis?.(); this.unVis = null; if (run === this.run && this.sender && !this.disposed) this.openStatus(target, name, transfer, run); };
    if (vis.hidden()) { this.unVis?.(); this.unVis = vis.on(() => { if (!vis.hidden()) go(); }); return; }
    this.reopenTimer = this.later(() => { this.reopenTimer = null; go(); }, REOPEN_MS);
  }

  private async makeLink(run: number) {
    const c = this.s.computer, name = this.s.name;
    // Only while live with a running sender: never a link for a stream that is ending or gone.
    if (!c || !name || !this.sender || this.s.phase !== 'live' || this.s.linkState !== 'none' && this.s.linkState !== 'failed' || !this.sameCtx()) return;
    this.set({ linkState: 'making' });
    const until = renewBody(this.now()).expires_at;
    const r = await this.d.createLink({ computer: c.id, name, until }).catch((): Outcome<BroadcastAlias | null> => ({ outcome: 'pending' }));
    // Disposed meanwhile (the Board unmounted): a link it made is removed once, as dispose() does for a ready one.
    if (this.disposed) { if (r.outcome === 'done' && r.data?.id && this.sameCtx()) void this.d.removeLink({ computer: c.id, alias: r.data.id }).catch(() => undefined); return; }
    if (this.s.name !== name) return;
    if (r.outcome === 'done') {
      const a = r.data ?? null;
      if (a && a.url) this.linkReady(a);
      else this.set({ linkState: 'unknown' });
    } else this.set({ linkState: isUnknown(r) ? 'unknown' : 'failed' });
    this.removeIfWanted();
    void run;
  }

  /** A revoke asked while the stream or the create was still running: remove once both settled. */
  private removeIfWanted() {
    if (this.revokeWanted && !this.sender && this.s.linkState !== 'making') void this.removeLink();
  }

  /** Try the link again after a definite refusal (nothing was made). */
  retryLink(): void { if (this.s.linkState === 'failed' && this.s.phase === 'live' && this.sender) void this.makeLink(this.run); }

  /** Reads the unknown create back. Only a proved outcome moves it (core's read-back: listed, or absent once its own
   *  expiry passed): then a usable listed link shows (and is removed if the stream already ended), else
   *  'not-found'. Unproved, or an unread list, keeps it unknown (and Start waiting). */
  async checkLink(): Promise<void> {
    const c = this.s.computer, name = this.s.name;
    if (this.s.linkState !== 'unknown' || !c || !name) return;
    const proved = await this.d.checkCreate().catch(() => false);
    if (!proved || this.s.name !== name || this.s.linkState !== 'unknown') return;
    const a = await this.d.findLink(c.id, name).catch(() => undefined);
    if (this.s.name !== name || this.s.linkState !== 'unknown') return;
    if (a && a.url) { this.linkReady(a); this.removeIfWanted(); }
    // A fresh list without it: not shown as made, nor as failed. Should it appear later, the leftover list shows it.
    else if (a === null) { this.set({ linkState: 'not-found' }); if (this.revokeWanted && !this.sender) this.set({ name: null }); }
  }

  private linkReady(a: BroadcastAlias) {
    this.setRenew('ok', { link: { id: a.id, url: a.url }, linkState: 'ready', linkUntil: a.expiresAt || null });
    this.scheduleRenew();
  }

  /** The link may be extended: live with a sender not ending (Stop, the browser's Stop sharing), the pipe not done, not disposed, same run and context. */
  private canRenew(run: number) {
    return !this.disposed && run === this.run && !!this.sender && !this.sender.ending() && this.s.phase === 'live' && !this.s.status.done && this.s.linkState === 'ready' && this.sameCtx();
  }

  private scheduleRenew() {
    this.cancel(this.renewTimer); this.renewTimer = null;
    if (!this.canRenew(this.run)) return;
    this.renewTimer = this.later(() => { this.renewTimer = null; this.renewing ??= this.renewOnce().finally(() => { this.renewing = null; }); }, RENEW_EVERY_MS);
  }

  /** Extends the live link once (read back first while an earlier extension is unknown), then schedules the next.
   *  Checked again after every wait and right before the send: Stop, the pipe's end or dispose end it. */
  private async renewOnce(): Promise<void> {
    const run = this.run, c = this.s.computer, link = this.s.link, name = this.s.name;
    if (!c || !link || !name || !this.canRenew(run)) return;
    if (this.renewSt === 'unknown') {
      const ok = await this.d.checkRenew().catch(() => false);
      if (!this.canRenew(run) || this.s.link?.id !== link.id) return;
      if (!ok) { this.scheduleRenew(); return; }
      // Proved, applied or not: only a fresh list saying when the link stops now settles it. An unread list, or one
      // without this link's expiry, keeps it unknown (nothing sent, read again next time); no working link ends it.
      const a = await this.d.findLink(c.id, name).catch(() => undefined);
      if (!this.canRenew(run) || this.s.link?.id !== link.id) return;
      if (a === null) { this.setRenew('ok', { linkState: 'not-found', linkUntil: null }); return; }
      if (!a || a.id !== link.id || !Number.isFinite(Date.parse(a.expiresAt))) { this.scheduleRenew(); return; }
      this.setRenew('ok', { linkUntil: a.expiresAt });
    }
    const until = renewBody(this.now()).expires_at;
    if (!this.canRenew(run)) return;
    const r = await this.d.renewLink({ computer: c.id, alias: link.id, until }).catch((): Outcome<unknown> => ({ outcome: 'pending' }));
    const st = r.outcome === 'done' ? 'ok' : isUnknown(r) ? 'unknown' : 'failed';
    this.renewSt = st;
    if (this.disposed || this.s.link?.id !== link.id) return;
    this.setRenew(st, r.outcome === 'done' ? { linkUntil: until } : {});
    this.scheduleRenew();
  }

  private ended(run: number, kind: EndReason, line: string) {
    if (run !== this.run) return;
    this.cancel(this.acceptTimer); this.acceptTimer = null;
    this.cancel(this.renewTimer); this.renewTimer = null;
    this.cancel(this.reopenTimer); this.reopenTimer = null;
    this.unVis?.(); this.unVis = null;
    this.progress?.close(); this.progress = null;
    this.sender = null; this.stream = null;
    const reason: EndReason = this.pendingEnd ?? kind;
    this.pendingEnd = null;
    this.set({ phase: 'ended', end: { reason, line }, status: { ...this.s.status, live: false, viewers: null } });
    const w = this.endWaiters; this.endWaiters = [];
    for (const fn of w) fn();
    this.revokeWanted = true;
    this.removeIfWanted();
  }

  /** Ends the stream; its end removes the link. */
  stop(): void {
    if (this.s.phase === 'picking') {
      this.run++;
      if (this.stream) { stopAll(this.stream); this.stream = null; }
      this.set({ phase: 'idle', name: null });
      return;
    }
    if (!this.sender) return;
    this.cancel(this.acceptTimer); this.acceptTimer = null;
    this.cancel(this.renewTimer); this.renewTimer = null;
    this.set({ phase: 'stopping' });
    this.sender.stop();
  }

  /** Ends the stream (or the open picker) and removes the link once the stream ended. */
  revoke(): void {
    this.revokeWanted = true;
    if (this.sender || this.s.phase === 'picking') this.stop();
    this.removeIfWanted();
  }

  /** True once nothing of this broadcast is still running or in flight: the stream ended and the link's create or
   *  remove has an outcome (removed, never made, or unknown/refused, which the panel shows). */
  get settled(): boolean {
    return !this.running && !this.renewing && this.s.linkState !== 'making' && this.s.linkState !== 'removing' && !(this.revokeWanted && this.s.linkState === 'ready');
  }

  waitEnded(): Promise<void> {
    return this.sender ? new Promise((r) => { this.endWaiters.push(r); }) : Promise.resolve();
  }

  private async removeLink() {
    const c = this.s.computer, link = this.s.link;
    // One remove at a time: a revoke while one is in flight joins it (a second send would only come back BUSY).
    if (!c || this.s.linkState === 'removing') return;
    if (!link) {
      // Nothing made, or a create whose outcome is unknown (it holds its lock: read it back first, never guess).
      if (this.s.linkState === 'unknown' || this.s.linkState === 'making') return;
      this.revokeWanted = false;
      this.set({ name: null, linkState: 'none' });
      return;
    }
    this.revokeWanted = false;
    this.set({ linkState: 'removing' });
    // An extension in flight or unknown holds the alias's lock: let it settle, read it back, then remove. This goes on
    // after dispose too (the Board unmounting mid-way): only its state updates stop.
    if (this.renewing) await this.renewing;
    if (this.s.link?.id !== link.id) return;
    if (this.renewSt === 'unknown') {
      const ok = this.sameCtx() && await this.d.checkRenew().catch(() => false);
      if (this.s.link?.id !== link.id) return;
      // Nothing was sent: the link still works until its expiry, and Try again reads it back again.
      if (!ok) { this.set({ linkState: 'removal-failed' }); return; }
      this.setRenew('ok');
    }
    // Another realm or account now: a send would reach the wrong realm; the short expiry ends the link.
    if (!this.sameCtx()) { this.set({ linkState: 'removal-failed' }); return; }
    const r = await this.d.removeLink({ computer: c.id, alias: link.id }).catch((): Outcome<unknown> => ({ outcome: 'pending' }));
    if (this.disposed || this.s.link?.id !== link.id) return;
    if (r.outcome === 'done') this.set({ linkState: 'removed', link: null, name: null });
    else this.set({ linkState: isUnknown(r) ? 'removal-unknown' : 'removal-failed' });
  }

  /** Remove again after a definite refusal (nothing was removed). */
  retryRemove(): void { if (this.s.linkState === 'removal-failed') void this.removeLink(); }

  /** Reads the unknown remove back; proved → gone. */
  async checkRemoval(): Promise<void> {
    if (this.s.linkState !== 'removal-unknown') return;
    const ok = await this.d.checkRemove().catch(() => false);
    if (ok && this.s.linkState === 'removal-unknown') this.set({ linkState: 'removed', link: null, name: null });
  }

  dismissError(): void { if (this.s.startError) this.set({ startError: null }); }

  dispose(): void {
    if (this.disposed) return;
    // The link never outlives the stream, unmount included: a ready (or refused-to-remove) link is removed once,
    // through removeLink, which waits for an extension in flight and reads an unknown one back first, and goes on
    // after dispose. A remove already under way goes on the same way. A create still in flight is removed when it
    // answers (makeLink). Nothing is sent once the realm or account changed: the short expiry ends the link then,
    // and the leftover list of that realm shows it.
    if (this.s.computer && this.s.link && (this.s.linkState === 'ready' || this.s.linkState === 'removal-failed')) void this.removeLink();
    this.run++;
    this.cancel(this.acceptTimer); this.cancel(this.reopenTimer); this.cancel(this.renewTimer);
    this.unVis?.();
    this.progress?.close();
    this.sender?.cancel();
    this.sender = null;
    if (this.stream) stopAll(this.stream);
    this.disposed = true;
    this.listeners.clear();
  }
}

function stopAll(stream: MediaStream) { for (const t of stream.getTracks()) { try { t.stop(); } catch { /* gone */ } } }
