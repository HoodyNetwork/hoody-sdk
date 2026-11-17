// The Images view's reads and changes: the installer images kept on the shown computer, the downloads that fetch
// them, and the catalogue of systems to pick a link from. A core source of the VMs page with its own keys.
//
// Contract, in plain words:
//   - Every answer goes through its parser (images-logic.ts); an answer that is not the shape it knows is the read's
//     failure, never an empty list.
//   - No change is ever sent twice by the page. A sent change whose answer is lost, or a 5xx, is held under the
//     computer's image lock until a fresh read proves it or the person stops tracking it:
//       remove (an image)        proved by fresh image lists without it;
//       stop (cancel or clear)   proved by fresh download lists in which the job is gone or cancelled;
//       add (a download)         no read proves it (the same link can be two jobs, and a job with a SHA-256 can join
//                                another link's): it stays held until the person looked at the list and stops tracking.
//   - The lock names the computer and what the change is about (the image, the job, or the site of the link): never
//     the whole link, which may carry a key.
//   - Each change carries the computer it was pressed on, so a switch of computer while it is out never moves it.
import { coreSource, type SourceTable, type Target } from '@core';
import { useEffect, useState } from 'react';
import { downloadGoneProved, DOWNLOADS_SLOW_MS, downloadsPollMs, imageGoneProved, linkHost, parseCatalogue, parseDownload, parseDownloads, parseImages, type Catalogue, type Download, type Image } from './images-logic';
import { routes } from './routes';

/** The lock of every image change on one computer (core files it under that computer). */
export const IMAGES_LOCK = 'vm.images';

/** An answer the page cannot read: the read fails with this, so nothing downstream takes it for "none". */
const must = <T,>(v: T | null): T => {
  if (v === null) throw new Error('BAD_ANSWER');
  return v;
};

export interface RemoveVars { computer: string; target: Target; sha256: string }
/** `how`: `cancel` stops a fetch at work; `clear` removes a finished row. One request, two different outcomes to prove. */
export interface StopVars { computer: string; target: Target; id: string; how: 'cancel' | 'clear' }
/** `sha256`: the checksum the person gave; null: none, and the image is not checked. */
export interface AddVars { computer: string; target: Target; url: string; sha256: string | null }

export const imagesTable: SourceTable = {
  reads: {
    images: { route: routes.isos, select: (raw) => must(parseImages(raw)) },
    downloads: { route: routes.dls, select: (raw) => must(parseDownloads(raw)) },
    catalogue: { route: routes.osinfo, select: (raw) => must(parseCatalogue(raw)), staleTime: 10 * 60_000 },
  },
  changes: {
    remove: {
      route: routes.isoDelete,
      input: (v: RemoveVars) => ({ target: v.target, params: { sha256: v.sha256 } }),
      reads: ['images'],
      lock: IMAGES_LOCK, lockKey: (v: RemoveVars) => ({ computer: v.computer, image: v.sha256 }),
      proves: imageGoneProved,
    },
    stop: {
      route: routes.dlDelete,
      input: (v: StopVars) => ({ target: v.target, params: { id: v.id } }),
      reads: ['downloads'],
      lock: IMAGES_LOCK, lockKey: (v: StopVars) => ({ computer: v.computer, job: v.id }),
      identity: (v: StopVars) => ({ computer: v.computer, job: v.id, how: v.how }),
      proves: downloadGoneProved,
    },
    add: {
      route: routes.dlStart,
      input: (v: AddVars) => ({ target: v.target, body: v.sha256 === null ? { url: v.url } : { url: v.url, sha256: v.sha256 } }),
      // The job the program started; an answer that is not one still means the download was accepted.
      select: (raw) => parseDownload(raw),
      reads: ['downloads'],
      lock: IMAGES_LOCK, lockKey: (v: AddVars) => ({ computer: v.computer, site: linkHost(v.url) }),
    },
  },
};

const source = coreSource('vms', imagesTable);

/** Which of this view's changes sent a held change of the image lock. */
export const imagesHeldBy = (key: 'remove' | 'stop' | 'add', h: Parameters<typeof source.heldBy>[1]) => source.heldBy(key, h);

/** The images kept on the shown computer. `enabled` false: not read at all. */
export const useImages = (enabled: boolean) => source.useQuery<Image[]>('images', undefined, { enabled, refetchInterval: DOWNLOADS_SLOW_MS });

/** The downloads of the shown computer, read again fast while one is at work. */
export function useDownloads(enabled: boolean) {
  const [ms, setMs] = useState(DOWNLOADS_SLOW_MS);
  const q = source.useQuery<Download[]>('downloads', undefined, { enabled, refetchInterval: ms });
  const next = downloadsPollMs(q.data);
  useEffect(() => setMs(next), [next]);
  return q;
}

/** The systems whose images can be fetched by a link. Read only while the "add" form is open. */
export const useCatalogue = (enabled: boolean) => source.useQuery<Catalogue>('catalogue', undefined, { enabled });

export const useRemoveImage = () => source.useMutation<unknown, RemoveVars>('remove');
export const useStopDownload = () => source.useMutation<unknown, StopVars>('stop');
export const useAddDownload = () => source.useMutation<Download | null, AddVars>('add');
