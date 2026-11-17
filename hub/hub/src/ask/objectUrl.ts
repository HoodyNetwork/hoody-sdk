// objectUrl.ts: an address for an image's bytes in memory (a thumbnail) and its release. Its own module, apart from the
// browser file reading in attachio.ts, so code the terminal also runs can make and let go of one without loading that.

/** An address for an image's bytes (a thumbnail); '' when the browser cannot make one. Whoever keeps it lets it go with `revoke`. */
export function objectUrl(bytes: Uint8Array, media: string): string {
  try { return URL.createObjectURL(new Blob([bytes as BlobPart], { type: media })); } catch { return ''; }
}
export function revoke(url: string): void {
  if (!url) return;
  try { URL.revokeObjectURL(url); } catch { /* already gone */ }
}
