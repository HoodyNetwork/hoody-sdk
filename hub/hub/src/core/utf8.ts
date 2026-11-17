// The size of a text on the wire. Agent and API limits are counted in UTF-8 bytes, never in characters: every
// byte limit a page checks before a send reads this one function. No imports (it is in @core/pure).
const encoder = new TextEncoder();

/** How many bytes `s` takes as UTF-8 ("é" is 2, an emoji is 4; a lone surrogate counts as the 3-byte U+FFFD it is sent as). */
export function utf8Bytes(s: string): number {
  return encoder.encode(s).length;
}
