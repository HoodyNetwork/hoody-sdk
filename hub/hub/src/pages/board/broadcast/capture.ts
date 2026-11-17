// The capture: this tab, kept to the Board's tile area where the browser allows it.
//
// Contract, in plain words:
//   - captureOptions(audio): getDisplayMedia options that offer this tab first (preferCurrentTab) and keep the
//     picker to tabs and windows (no whole screens, no switching the source later). Video at most 1920×1080 and
//     15 frames a second (boards are text: sharp beats smooth); tab audio only when asked.
//   - confine(track, el) narrows the video to the tile area and says how far it got:
//       'element': Element Capture (restrictTo): only the tile area's own pixels, nothing drawn over it. Chromium can
//                  accept the restriction and then deliver no frame at all (an area it cannot isolate: it logs "not
//                  eligible for restriction"), so a frame is awaited for FRAME_CHECK_MS; none: the restriction is
//                  lifted and Region Capture tried as below (still this tab only). When the browser offers no way
//                  to watch frames (no MediaStreamTrackProcessor) the restriction is trusted; the sender's
//                  no-picture end (sender.ts) is the backstop either way;
//       'region':  Region Capture (cropTo): the tile area's rectangle, with whatever is drawn over it;
//       'tab':     the whole tab (neither API here, or Element Capture lifted for want of a picture with no crop to try);
//       'wide':    a tab, but the narrowing was refused (the crop, or Element Capture with no crop to try):
//                  another tab was picked (Chromium refuses it for any tab but this one), or the tile area could
//                  not be narrowed; either way the whole picked tab shows (the broadcaster refuses it);
//       'other':   not a tab: a window was picked.
//     It never throws.
const MAX_W = 1920, MAX_H = 1080, FPS = 15;
export const FRAME_CHECK_MS = 1000;

export type Confined = 'element' | 'region' | 'tab' | 'wide' | 'other';

export function captureOptions(audio: boolean): DisplayMediaStreamOptions {
  return {
    video: { width: { max: MAX_W }, height: { max: MAX_H }, frameRate: { ideal: FPS, max: FPS } },
    audio,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
    surfaceSwitching: 'exclude',
    monitorTypeSurfaces: 'exclude',
    systemAudio: 'exclude',
  } as DisplayMediaStreamOptions;
}

interface TargetCtor { fromElement(el: Element): Promise<unknown> }
type Narrowable = MediaStreamTrack & { restrictTo?: (t: unknown) => Promise<void>; cropTo?: (t: unknown) => Promise<void> };
type ProcessorCtor = new (init: { track: MediaStreamTrack }) => { readonly readable: ReadableStream<{ close(): void }> };

/** Whether a frame arrives on the track within ms (read from a clone, so the track itself is untouched); true when
 *  the browser cannot tell (no MediaStreamTrackProcessor, or the check itself fails). */
export function frameArrives(track: MediaStreamTrack, ms: number, g: Record<string, unknown> = globalThis as unknown as Record<string, unknown>): Promise<boolean> {
  const Proc = g.MediaStreamTrackProcessor as ProcessorCtor | undefined;
  if (typeof Proc !== 'function') return Promise.resolve(true);
  let copy: MediaStreamTrack | null = null;
  let reader: ReadableStreamDefaultReader<{ close(): void }>;
  try { copy = track.clone(); reader = new Proc({ track: copy }).readable.getReader(); } catch {
    try { copy?.stop(); } catch { /* gone */ }
    return Promise.resolve(true);
  }
  const clone = copy;
  return new Promise<boolean>((resolve) => {
    let done = false;
    const end = (v: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { void reader.cancel().catch(() => {}); } catch { /* gone */ }
      try { clone.stop(); } catch { /* gone */ }
      resolve(v);
    };
    const timer = setTimeout(() => end(false), ms);
    reader.read().then((r) => { try { r.value?.close(); } catch { /* closed */ } end(!r.done); }, () => end(true));
  });
}

export async function confine(
  track: MediaStreamTrack, el: Element | null, g: Record<string, unknown> = globalThis as unknown as Record<string, unknown>,
  frames: (track: MediaStreamTrack, ms: number) => Promise<boolean> = (tr, ms) => frameArrives(tr, ms, g),
): Promise<Confined> {
  let surface: unknown;
  try { surface = (track.getSettings() as { displaySurface?: unknown }).displaySurface; } catch { surface = undefined; }
  if (surface !== undefined && surface !== 'browser') return 'other';
  const t = track as Narrowable;
  const Restriction = g.RestrictionTarget as TargetCtor | undefined, Crop = g.CropTarget as TargetCtor | undefined;
  let refused = false, self = false;
  if (el && Restriction && typeof t.restrictTo === 'function') {
    let restricted = false;
    try { await t.restrictTo(await Restriction.fromElement(el)); restricted = true; } catch { refused = true; /* Region Capture next */ }
    if (restricted) {
      if (await frames(track, FRAME_CHECK_MS)) return 'element';
      // Accepted but no picture: lift it for the crop. If it cannot be lifted, keep it (the sender ends a pictureless
      // broadcast); never report a narrowing that is not in force.
      try { await t.restrictTo(null); } catch { return 'element'; }
      self = true; // Element Capture is accepted only for the capturing tab itself
      refused = true;
    }
  }
  if (el && Crop && typeof t.cropTo === 'function') {
    try { await t.cropTo(await Crop.fromElement(el)); return 'region'; } catch { return 'wide'; }
  }
  // Element Capture refused with no Region Capture to try: it may be another tab, like a refused crop. Lifted for want
  // of a picture, it was this tab: the whole tab, as where neither API exists.
  return self ? 'tab' : refused ? 'wide' : 'tab';
}
