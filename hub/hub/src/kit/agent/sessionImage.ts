// sessionImage.ts: one picture a person attached to a message of a chat, read back from the chat's agent after a reload.
// The transcript names it by an id that is good in that chat only; the bytes come from the agent's own route, through core's
// download (the chat's realm, a bounded read, stale when the page's context died). Nothing is kept: the caller draws an
// object URL and lets it go. A picture the agent no longer has (its message was trimmed or cleared) rejects (404: never asked again by the
// caller); bytes that are not a PNG, JPEG, GIF or WebP answer null.
import { defineRoute, download, type Target } from '@core';
import { pictureMedia } from './StepPictures.pure';

/** The most one stored picture's read takes (the agent serves none larger). */
export const SESSION_IMAGE_MAX = 16 * 1024 * 1024;
const IMAGE_ID = /^[0-9a-f]{64}$/;

export const sessionImageRoute = defineRoute({ method: 'GET', path: '/sessions/:id/images/:image', scope: 'agent', maxBytes: SESSION_IMAGE_MAX });

/** The id as the transcript may give it: 64 lower-case hex, else null (such a picture is never asked for). */
export function sessionImageId(v: unknown): string | null {
  return typeof v === 'string' && IMAGE_ID.test(v) ? v : null;
}

export async function readSessionImage(target: Target, realm: string, sid: string, image: string, signal?: AbortSignal): Promise<Uint8Array | null> {
  if (!sessionImageId(image) || !sid) return null;
  const got = await download(sessionImageRoute, { target, realm, params: { id: sid, image }, maxBytes: SESSION_IMAGE_MAX, ...(signal ? { signal } : {}) });
  const bytes = new Uint8Array(await new Blob(got.parts).arrayBuffer());
  // Only bytes that ARE one of the four picture kinds are handed on (judged by the bytes themselves, which is what gets drawn: the
  // answer's own content type is never trusted, and anything else, an SVG or a page of HTML included, is no picture).
  return pictureMedia(bytes) ? bytes : null;
}
