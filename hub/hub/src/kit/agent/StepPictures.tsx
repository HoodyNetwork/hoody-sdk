// StepPictures.tsx: the pictures a step made (the agent's image tool saves them on the computer and names their paths in its
// result), drawn in the step's open detail. The host reads each file (StepPictureHost: the AI page reads it from the chat's
// computer); the kit only draws. A picture is read when its step is opened, held as an object URL while it shows and let go
// when it leaves. A read that fails, bytes that are no picture, or a host that cannot read (no StepPictureHost) show the
// same tile without the picture, the file's path in its title. Only the paths the host's block names are ever asked for:
// never a path taken from the agent's prose.
// A picture sent with a message (StoredPicture) is read back from the agent's record of the chat, which the agent parses whole
// for every picture: so it is asked only once its row comes near the screen, at most STORED_AT_ONCE at a time per chat, once per
// chat while the chat is open (also across the page and the side dock), and never again after the agent said it has none.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { hostEnv } from '@core';
import { formatBytes } from '../format';
import { useWipeOn } from '../forms/wipe';
import { useStrings } from '../strings';
import { AttachChip, AttachList } from './AttachChips';
import type { StepPicture } from './source';
import { STORED_AT_ONCE, pictureMedia } from './StepPictures.pure';
import strings from './SessionView.strings.en.json';

export { STORED_AT_ONCE, pictureMedia } from './StepPictures.pure';

/** Reads one picture's bytes from where the chat's agent runs; null (or a rejection) when it cannot be read. `read`: a file a
 *  step saved, by its path. `stored`: a picture attached to a message of this chat, by the id the agent's record gives it. */
export interface StepPictureReader {
  read(path: string, signal: AbortSignal): Promise<Uint8Array | null>;
  stored?(id: string, signal: AbortSignal): Promise<Uint8Array | null>;
}

/** A stored picture's read, as kept for the chat: its bytes, `gone` (the agent no longer has it: a 404) or `none` (it could not
 *  be read: any other refusal, or bytes that are no picture). */
type Stored = { k: 'bytes'; bytes: Uint8Array } | { k: 'gone' } | { k: 'none' };

/** One chat's stored-picture reads: what came back (each picture read once), what is out and what waits for a turn. */
interface Pool { views: number; out: number; wait: (() => void)[]; got: Map<string, Promise<Stored>>; stop: AbortController }
const pools = new Map<string, Pool>();
const newPool = (views: number): Pool => ({ views, out: 0, wait: [], got: new Map(), stop: new AbortController() });
/** Ends a pool: every read still out is cancelled, every waiting one is let through to find it cancelled. */
function endPool(p: Pool): void {
  p.stop.abort();
  for (const go of p.wait.splice(0)) go();
}
function storedOf(p: Pool, id: string, read: NonNullable<StepPictureReader['stored']>): Promise<Stored> {
  const had = p.got.get(id);
  if (had) return had;
  const { signal } = p.stop;
  const turn = new Promise<void>((go) => {
    if (p.out < STORED_AT_ONCE) { p.out++; go(); } else p.wait.push(() => { p.out++; go(); });
  });
  const got = turn
    .then(() => (signal.aborted ? Promise.reject(signal.reason) : read(id, signal)))
    .then(
      (bytes): Stored => (bytes && pictureMedia(bytes) ? { k: 'bytes', bytes } : { k: 'none' }),
      (e: unknown): Stored => {
        if (signal.aborted) throw e;
        return (e as { status?: unknown } | null)?.status === 404 ? { k: 'gone' } : { k: 'none' };
      },
    )
    .finally(() => { p.out--; p.wait.shift()?.(); });
  p.got.set(id, got);
  return got;
}

interface Host { reader: StepPictureReader | null; stored: ((id: string) => Promise<Stored>) | null; broke?: (id: string) => void }
const Ctx = createContext<Host>({ reader: null, stored: null });
let hostN = 0;

/**
 * The reader the pictures under it use. `session` names the chat (its computer, realm and id): views of the same chat share
 * its stored-picture reads, which end, every read still out cancelled, when the last of them leaves or the place's context
 * ends (a route change, a realm switch, sign-out, page hide: useWipeOn). Without `session` the host's reads are its own.
 */
export function StepPictureHost({ value, session, children }: { value: StepPictureReader | null; session?: string; children: ReactNode }) {
  const [own] = useState(() => `host:${++hostN}`);
  const key = session ? `chat:${session}` : own;
  useEffect(() => {
    const p = pools.get(key) ?? newPool(0);
    p.views++;
    pools.set(key, p);
    return () => {
      const q = pools.get(key);
      if (!q || --q.views > 0) return;
      pools.delete(key);
      endPool(q);
    };
  }, [key]);
  useWipeOn(() => {
    const q = pools.get(key);
    if (!q) return;
    endPool(q);
    pools.set(key, newPool(q.views));
  });
  const read = value?.stored;
  const host = useMemo<Host>(() => ({
    reader: value,
    stored: read ? (id) => {
      const p = pools.get(key) ?? (pools.set(key, newPool(0)), pools.get(key) as Pool);
      return storedOf(p, id, read.bind(value));
    } : null,
    // Bytes the browser could not draw stay `none` for the chat: never read or drawn again while it is open.
    broke: (id) => { pools.get(key)?.got.set(id, Promise.resolve({ k: 'none' })); },
  }), [value, read, key]);
  return <Ctx.Provider value={host}>{children}</Ctx.Provider>;
}

/** Whether nothing can tell what is near the screen: no browser page (the terminal, where even `typeof` of the global traps)
 *  or no IntersectionObserver. */
const cannotWatch = (): boolean => hostEnv().browserPage !== true || typeof IntersectionObserver === 'undefined';

/** True once the element has come near the screen (stays true); true at once where nothing can tell (cannotWatch). */
function useNear(ref: RefObject<Element | null>): boolean {
  const [near, setNear] = useState(cannotWatch);
  useEffect(() => {
    const el = ref.current;
    if (near || !el || cannotWatch()) return undefined;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: '400px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, near]);
  return near;
}

type Got = { k: 'idle' } | { k: 'loading' } | { k: 'url'; url: string } | { k: 'gone' } | { k: 'none' };

/** One picture as an object URL: read once per `key` while `on` (until then `idle`), let go when the key changes or the view
 *  leaves. `broken()`: the browser could not draw the bytes (they start like a picture but are damaged), so it is `none`. */
function usePicture(key: string, load: ((signal: AbortSignal) => Promise<Stored>) | null, on = true): [Got, () => void] {
  const [got, setGot] = useState<Got>(!load ? { k: 'none' } : on ? { k: 'loading' } : { k: 'idle' });
  const loadRef = useRef(load);
  loadRef.current = load;
  const can = !!load;
  useEffect(() => {
    const read = loadRef.current;
    if (!can || !read) { setGot({ k: 'none' }); return undefined; }
    if (!on) { setGot({ k: 'idle' }); return undefined; }
    const stop = new AbortController();
    let url = '';
    setGot({ k: 'loading' });
    void read(stop.signal).then((r) => {
      if (stop.signal.aborted) return;
      if (r.k !== 'bytes') { setGot(r); return; }
      url = URL.createObjectURL(new Blob([r.bytes as BlobPart], { type: pictureMedia(r.bytes) ?? '' }));
      setGot({ k: 'url', url });
    }, () => { if (!stop.signal.aborted) setGot({ k: 'none' }); });
    return () => { stop.abort(); if (url) URL.revokeObjectURL(url); };
  }, [can, key, on]);
  const broken = useCallback(() => setGot({ k: 'none' }), []);
  return [got, broken];
}

/** A file a step saved, as a stored read: its bytes when they are a picture, else `none`. */
const fileRead = (reader: StepPictureReader, path: string) => (signal: AbortSignal): Promise<Stored> =>
  reader.read(path, signal).then((b): Stored => (b && pictureMedia(b) ? { k: 'bytes', bytes: b } : { k: 'none' }), (): Stored => ({ k: 'none' }));

function Picture({ p, reader }: { p: StepPicture; reader: StepPictureReader | null }) {
  const t = useStrings(strings);
  const [got, broken] = usePicture(p.path, reader ? fileRead(reader, p.path) : null);
  const meta = p.size !== undefined ? formatBytes(p.size) : undefined;
  // One that could not be read is the same tile, saying so; where it was saved is in the tile's title.
  if (got.k === 'none' || got.k === 'gone') return <AttachChip kind="image" name={p.name} url={null} meta={reader ? t('sv.step.picFailed') : meta} title={p.path} />;
  return <AttachChip kind="image" name={p.name} url={got.k === 'url' ? got.url : null} meta={got.k === 'loading' ? t('sv.step.picLoading') : meta} onBroken={broken} />;
}

/**
 * A picture sent with a message of a reopened chat, read back from the agent's record once its row comes near the screen
 * (through the host's shared reads: STORED_AT_ONCE at a time, each once). Two ways it cannot show, said apart: the agent no
 * longer has it (`gone`: "Picture no longer available") or it could not be read or drawn (`none`, damaged bytes included:
 * "Picture not available"). With no host that reads stored pictures, the name alone.
 */
export function StoredPicture({ id, name }: { id: string; name: string }) {
  const t = useStrings(strings);
  const host = useContext(Ctx);
  const ref = useRef<HTMLLIElement>(null);
  const near = useNear(ref);
  const stored = host.stored;
  const [got, broken] = usePicture(id, stored ? () => stored(id) : null, near);
  const onBroken = useCallback(() => { host.broke?.(id); broken(); }, [host, id, broken]);
  const meta = got.k === 'loading' ? t('sv.step.picLoading') : !stored ? undefined : got.k === 'gone' ? t('sv.pic.gone') : got.k === 'none' ? t('sv.pic.none') : undefined;
  return <AttachChip itemRef={ref} kind="image" name={name} url={got.k === 'url' ? got.url : null} meta={meta} onBroken={onBroken} />;
}

export function StepPictures({ items }: { items: readonly StepPicture[] }) {
  const t = useStrings(strings);
  const { reader } = useContext(Ctx);
  return (
    <AttachList label={t('sv.step.pictures')} big>
      {items.map((p) => <Picture key={p.path} p={p} reader={reader} />)}
    </AttachList>
  );
}
